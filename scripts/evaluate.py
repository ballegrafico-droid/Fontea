"""Reproducible synthetic benchmark with Chromium rasterization (not the matcher).
Development and evaluation use disjoint texts and external font families. Does not
estimate accuracy on photographs, logos, arbitrary commercial fonts or real users.
Requires `pip install playwright`, system Chromium and a running Fontea server.
"""

import argparse, base64, csv, io, json, pathlib, random, sys, time
from PIL import Image, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
from core import CATALOG, identify, ocr
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument(
    "--split", choices=["dev", "evaluation", "final"], default="final"
)
parser.add_argument("--base-url", default="http://127.0.0.1:3001")
args = parser.parse_args()
ART = ROOT / "tests/artifacts" / args.split
ART.mkdir(parents=True, exist_ok=True)
TEXTS = {
    "dev": ["Hamburgo creativo 123", "Agua mineral bosque"],
    "evaluation": ["Diseño y memoria 826", "Ritmo visual elegante"],
    "final": ["Impresión y carácter 497", "Café diseño y tamaño"],
}


def raster(page, file, entry, text, size, spacing=0):
    encoded = base64.b64encode(pathlib.Path(file).read_bytes()).decode()
    data = page.evaluate(
        """async ({data,weight,italic,text,size,spacing})=>{
      const font=new FontFace('Fixture',`url(data:font/ttf;base64,${data})`,{weight:String(weight),style:italic?'italic':'normal'});
      document.fonts.clear();await font.load();document.fonts.add(font);
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      const spec=`${italic?'italic ':''}${weight} ${size}px Fixture`;
      ctx.font=spec;ctx.letterSpacing=spacing+'px';const m=ctx.measureText(text);
      canvas.width=Math.ceil(m.width)+100;canvas.height=size*2+60;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font=spec;ctx.letterSpacing=spacing+'px';ctx.fillStyle='#111';ctx.fillText(text,40,size+20);
      return canvas.toDataURL('image/png').split(',')[1];
    }""",
        {
            "data": encoded,
            "weight": entry.get("weight", 400),
            "italic": entry.get("italic", False),
            "text": text,
            "size": size,
            "spacing": spacing,
        },
    )
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")


def degraded(im):
    # deterministic downsampling, blur and JPEG, not a photorealistic claim
    im = im.resize(
        (max(12, im.width // 2), max(12, im.height // 2)), Image.Resampling.LANCZOS
    ).filter(ImageFilter.GaussianBlur(0.45))
    out = io.BytesIO()
    im.save(out, format="JPEG", quality=52)
    return Image.open(io.BytesIO(out.getvalue())).convert("RGB")


rows = []
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium", args=["--no-sandbox"]
    )
    page = browser.new_page()
    page.goto("about:blank")
    fonts = (
        CATALOG["fonts"]
        if args.split != "dev"
        else [
            f
            for f in CATALOG["fonts"]
            if not f["italic"]
            and f["family"] not in ("Poppins", "Source Serif 4", "Oswald")
        ]
    )
    samples = []
    for i, entry in enumerate(fonts):
        samples.append((entry, "clean", TEXTS[args.split][0], 64 + (i % 3) * 5))
        if (args.split != "dev" and entry["weight"] == 400) or (
            args.split == "dev" and i % 3 == 0
        ):
            samples.append((entry, "degraded", TEXTS[args.split][1], 60))
    for entry, kind, text, size in samples:
        samples_id = entry["id"] + "-" + kind
        im = raster(
            page,
            ROOT / "catalog/fonts" / entry["file"],
            entry,
            text,
            size,
            0.25 if kind == "degraded" else 0,
        )
        if kind == "degraded":
            im = degraded(im)
        im.save(ART / (samples_id + ".png"))
        t = time.time()
        result = identify(im, text)
        retrieved = result["candidates"] + result["alternatives"]
        top = retrieved[0]
        read = ocr(im)["text"]
        rows.append(
            {
                "sample": samples_id,
                "kind": kind,
                "expected": entry["id"],
                "expectedFamily": entry["family"],
                "text": text,
                "ocr": read,
                "ocrExact": read == text,
                "top1": top["id"],
                "distance": top["distance"],
                "familyCorrect": top["family"] == entry["family"],
                "variantCorrect": top["id"] == entry["id"],
                "proposed": bool(result["candidates"]),
                "candidateIncludesExpected": any(
                    f["id"] == entry["id"] for f in result["candidates"]
                ),
                "seconds": round(time.time() - t, 3),
            }
        )
        print(samples_id, top["id"], top["distance"], result["status"], flush=True)
    external_dev = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu Sans"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "DejaVu Serif"),
    ]
    external_eval = [
        (
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "Liberation Sans",
        ),
        (
            "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
            "Liberation Serif",
        ),
        ("/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf", "Nimbus Sans"),
        (
            "/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf",
            "Nimbus Roman",
        ),
        ("/usr/share/fonts/opentype/urw-base35/URWGothic-Book.otf", "URW Gothic"),
        ("/usr/share/fonts/opentype/urw-base35/P052-Roman.otf", "P052"),
    ]
    for file, family in (external_eval if args.split != "dev" else external_dev):
        if not pathlib.Path(file).exists():
            alt = (
                pathlib.Path("/usr/share/fonts/truetype/liberation2")
                / pathlib.Path(file).name
            )
            if alt.exists():
                file = str(alt)
            else:
                raise RuntimeError("Missing external fixture font: " + file)
        for kind in ("external-clean", "external-degraded"):
            text = TEXTS[args.split][int(kind.endswith("degraded"))]
            im = raster(page, file, {}, text, 68)
            if kind.endswith("degraded"):
                im = degraded(im)
            sid = family.replace(" ", "-") + "-" + kind
            im.save(ART / (sid + ".png"))
            t = time.time()
            result = identify(im, text)
            top = (result["candidates"] + result["alternatives"])[0]
            read = ocr(im)["text"]
            rows.append(
                {
                    "sample": sid,
                    "kind": kind,
                    "expected": "OUTSIDE",
                    "expectedFamily": family,
                    "text": text,
                    "ocr": read,
                    "ocrExact": read == text,
                    "top1": top["id"],
                    "distance": top["distance"],
                    "familyCorrect": False,
                    "variantCorrect": False,
                    "proposed": bool(result["candidates"]),
                    "candidateIncludesExpected": False,
                    "seconds": round(time.time() - t, 3),
                }
            )
            print(sid, top["id"], top["distance"], result["status"], flush=True)
    if args.split != "dev":
        for text in ["HHH", "Ill", "aaa", "OOO"]:
            entry = CATALOG["fonts"][0]
            im = raster(page, ROOT / "catalog/fonts" / entry["file"], entry, text, 64)
            result = identify(im, text)
            top = (result["candidates"] + result["alternatives"])[0]
            read = ocr(im)["text"]
            rows.append(
                {
                    "sample": "short-" + text,
                    "kind": "short",
                    "expected": entry["id"],
                    "expectedFamily": entry["family"],
                    "text": text,
                    "ocr": read,
                    "ocrExact": read == text,
                    "top1": top["id"],
                    "distance": top["distance"],
                    "familyCorrect": top["family"] == entry["family"],
                    "variantCorrect": top["id"] == entry["id"],
                    "proposed": bool(result["candidates"]),
                    "candidateIncludesExpected": False,
                    "seconds": 0,
                }
            )
    browser.close()
report = ROOT / f"docs/{args.split}-results.csv"
with report.open("w") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys(), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
summary = {
    "split": args.split,
    "samples": len(rows),
    "catalogFamilies": 11,
    "catalogVariants": len(CATALOG["fonts"]),
    "groups": {},
}
for kind in sorted(set(r["kind"] for r in rows)):
    group = [r for r in rows if r["kind"] == kind]
    summary["groups"][kind] = {
        "samples": len(group),
        "top1FamilyCorrect": sum(r["familyCorrect"] for r in group),
        "top1VariantCorrect": sum(r["variantCorrect"] for r in group),
        "proposedCandidates": sum(r["proposed"] for r in group),
        "candidateIncludesExpected": sum(r["candidateIncludesExpected"] for r in group),
        "ocrExact": sum(r["ocrExact"] for r in group),
    }
(ROOT / f"docs/{args.split}-summary.json").write_text(
    json.dumps(summary, indent=2) + "\n"
)
print(json.dumps(summary, indent=2))
