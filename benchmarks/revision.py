"""Paired v0.1/v0.2 benchmark. New held-out images, strict literal OCR.
Generate once, then --run; no matching threshold is changed. Baseline source and
catalogue are pinned in this directory so a source ZIP can reproduce the comparison.
"""

from __future__ import annotations
import argparse, base64, csv, hashlib, importlib.util, io, json, os, pathlib, statistics, sys, time
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
ART = ROOT / "tests/artifacts/revision"
OUT = ROOT / "docs/revision"
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument("--generate", action="store_true")
parser.add_argument("--run", action="store_true")
parser.add_argument("--refresh-ocr", action="store_true")
args = parser.parse_args()
old = json.loads((ROOT / "benchmarks/catalog_v01.json").read_text())
new = json.loads((ROOT / "catalog/manifest.json").read_text())
old_ids = {f["id"] for f in old["fonts"]}


def render(page, file, entry, text, size, spacing=0):
    data = base64.b64encode(pathlib.Path(file).read_bytes()).decode()
    encoded = page.evaluate(
        """async ({data,weight,italic,text,size,spacing})=>{
    document.fonts.clear();const font=new FontFace('Fixture',`url(data:font/ttf;base64,${data})`,{weight:String(weight),style:italic?'italic':'normal'});await font.load();document.fonts.add(font);
    const c=document.createElement('canvas'),x=c.getContext('2d'),spec=`${italic?'italic ':''}${weight} ${size}px Fixture`;
    x.font=spec;x.letterSpacing=spacing+'px';c.width=Math.ceil(x.measureText(text).width)+100;c.height=size*2+60;
    x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.font=spec;x.letterSpacing=spacing+'px';x.fillStyle='#111';x.fillText(text,40,size+20);
    return c.toDataURL('image/png').split(',')[1];}""",
        {
            "data": data,
            "weight": entry.get("weight", 400),
            "italic": entry.get("italic", False),
            "text": text,
            "size": size,
            "spacing": spacing,
        },
    )
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")


def generate():
    from playwright.sync_api import sync_playwright

    ART.mkdir(parents=True, exist_ok=True)
    samples = []
    with sync_playwright() as p:
        b = p.chromium.launch(
            executable_path="/usr/bin/chromium", args=["--no-sandbox"]
        )
        page = b.new_page()
        page.goto("about:blank")

        def save(entry, file, kind, text, size, group):
            im = render(
                page, file, entry, text, size, 0.25 if kind == "degraded" else 0
            )
            if kind == "degraded":
                im = im.resize(
                    (im.width // 2, im.height // 2), Image.Resampling.LANCZOS
                ).filter(ImageFilter.GaussianBlur(0.45))
                buf = io.BytesIO()
                im.save(buf, format="JPEG", quality=52)
                im = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
            sid = entry["id"] + "-" + kind
            path = ART / (sid + ".png")
            im.save(path)
            samples.append(
                {
                    "sample": sid,
                    "kind": kind,
                    "group": group,
                    "expected": entry["id"] if group != "outside" else "OUTSIDE",
                    "family": entry["family"],
                    "text": text,
                    "imageSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )

        for i, f in enumerate(new["fonts"]):
            group = "original" if f["id"] in old_ids else "added"
            file = ROOT / "catalog/fonts" / f["file"]
            save(
                f,
                file,
                "clean",
                (
                    "Typography & rhythm 538"
                    if i % 4 == 0
                    else "Edición, música y señal 538"
                ),
                68 + (i % 3) * 5,
                group,
            )
            if f["weight"] == 400:
                save(
                    f,
                    file,
                    "degraded",
                    (
                        "Quiet rhythm, bold ideas"
                        if i % 4 == 0
                        else "Pequeño café del jardín"
                    ),
                    64,
                    group,
                )
        outside = [
            (
                "Liberation Sans",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            ),
            (
                "Liberation Serif",
                "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
            ),
            (
                "Nimbus Sans",
                "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf",
            ),
            (
                "Nimbus Roman",
                "/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf",
            ),
            ("URW Gothic", "/usr/share/fonts/opentype/urw-base35/URWGothic-Book.otf"),
            ("P052", "/usr/share/fonts/opentype/urw-base35/P052-Roman.otf"),
        ]
        for name, file in outside:
            if not pathlib.Path(file).exists():
                file = (
                    "/usr/share/fonts/truetype/liberation2/" + pathlib.Path(file).name
                )
            f = {"id": name.replace(" ", "-"), "family": name}
            save(f, file, "clean", "Edición, música y señal 538", 72, "outside")
            save(f, file, "degraded", "Pequeño café del jardín", 64, "outside")
        for text in ["HHH", "Ill", "aaa", "OOO"]:
            save(
                new["fonts"][0] | {"id": "short-" + text},
                ROOT / "catalog/fonts" / new["fonts"][0]["file"],
                "short",
                text,
                68,
                "short",
            )
        b.close()
    (OUT / "samples.json").write_text(
        json.dumps(samples, ensure_ascii=False, indent=2) + "\n"
    )
    print("Generated", len(samples), "paired images", flush=True)


def module(name, path, catalog):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.CATALOG = catalog
    return m


def edits(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        nxt = [i]
        for j, y in enumerate(b, 1):
            nxt.append(min(nxt[-1] + 1, row[j] + 1, row[j - 1] + (x != y)))
        row = nxt
    return row[-1]


def outcome(result, s, catalog):
    fonts = {f["id"] for f in catalog["fonts"]}
    known = s["expected"] in fonts
    top = (result["candidates"] + result["alternatives"])[0]
    proposed = bool(result["candidates"])
    contains = any(f["id"] == s["expected"] for f in result["candidates"])
    return {
        "known": known,
        "familyTop1": known and top["family"] == s["family"],
        "variantTop1": known and top["id"] == s["expected"],
        "proposed": proposed,
        "containsExpected": contains,
        "wrongProposal": proposed and not contains,
        "top1": top["id"],
        "distance": top["distance"],
    }


def percentile(vals, p):
    return sorted(vals)[min(len(vals) - 1, int((len(vals) - 1) * p))]


def run():
    # Default configuration, not user-specific dotenv settings.
    os.environ.pop("TESSERACT_LANG", None)
    v01 = module("baseline", ROOT / "benchmarks/core_v01.py", old)
    v02_old = module("updated_old_catalog", ROOT / "engine/core.py", old)
    v02 = module("updated", ROOT / "engine/core.py", new)
    samples = json.loads((OUT / "samples.json").read_text())
    cached = {}
    if args.refresh_ocr:
        import ast

        names = {
            "preprocess",
            "render",
            "load_font",
            "distance",
            "identify",
            "normalized",
            "trim",
            "mask_image",
            "contour_png",
        }

        def matcher_ast(path):
            return [
                ast.dump(n, include_attributes=False)
                for n in ast.parse(path.read_text()).body
                if isinstance(n, ast.FunctionDef) and n.name in names
            ]

        assert matcher_ast(ROOT / "benchmarks/core_v01.py") == matcher_ast(
            ROOT / "engine/core.py"
        ), "Matcher changed: rerun full benchmark"

        def parse(v):
            if v in ("True", "False"):
                return v == "True"
            try:
                return float(v)
            except ValueError:
                return v

        cached = {
            r["sample"]: {k: parse(v) for k, v in r.items()}
            for r in csv.DictReader((OUT / "paired-results.csv").open())
        }

    rows = []
    e2e = []
    for i, s in enumerate(samples):
        image_path = ART / (s["sample"] + ".png")
        assert hashlib.sha256(image_path.read_bytes()).hexdigest() == s["imageSha256"]
        im = Image.open(image_path).convert("RGB")
        row = {
            k: s[k] for k in ["sample", "kind", "group", "expected", "family", "text"]
        }
        # Counterbalance order; same bytes and truth for both versions.
        engines = (
            [("before", v01), ("after", v02)]
            if i % 2 == 0
            else [("after", v02), ("before", v01)]
        )
        for label, m in engines:
            t = time.perf_counter()
            read = m.ocr(im)["text"]
            row[label + "OcrSeconds"] = round(time.perf_counter() - t, 4)
            row[label + "Ocr"] = read
            row[label + "OcrExact"] = read == s["text"]
            row[label + "CharErrors"] = edits(s["text"], read)
        for label, m, catalog in (
            [("before", v01, old), ("after", v02, new)]
            if i % 2 == 0
            else [("after", v02, new), ("before", v01, old)]
        ):
            if args.refresh_ocr:
                keep = {
                    label + "IdentifySeconds",
                    *(
                        label + k
                        for k in [
                            "Known",
                            "FamilyTop1",
                            "VariantTop1",
                            "Proposed",
                            "ContainsExpected",
                            "WrongProposal",
                            "Top1",
                            "Distance",
                        ]
                    ),
                }
                row.update({k: cached[s["sample"]][k] for k in keep})
                continue
            t = time.perf_counter()
            result = m.identify(im, s["text"])
            row[label + "IdentifySeconds"] = round(time.perf_counter() - t, 4)
            row.update(
                {
                    label + k[0].upper() + k[1:]: v
                    for k, v in outcome(result, s, catalog).items()
                }
            )
        if i % 10 == 0:
            erow = {
                "sample": s["sample"],
                "group": s["group"],
                "expected": s["expected"],
            }
            for label, m, catalog in [("before", v01, old), ("after", v02, new)]:
                text = row[label + "Ocr"]
                try:
                    r = m.identify(im, text)
                    o = outcome(r, s, catalog)
                except m.InputError:
                    o = {
                        "proposed": False,
                        "containsExpected": False,
                        "wrongProposal": False,
                        "variantTop1": False,
                    }
                erow.update({label + k[0].upper() + k[1:]: v for k, v in o.items()})
            e2e.append(erow)
        rows.append(row)
        if i % 5 == 0:
            print(
                i + 1,
                "/",
                len(samples),
                s["sample"],
                "OCR",
                row["beforeOcrExact"],
                row["afterOcrExact"],
                flush=True,
            )

    def write(name, data):
        with (OUT / name).open("w") as f:
            w = csv.DictWriter(
                f,
                fieldnames=list(dict.fromkeys(k for r in data for k in r)),
                lineterminator="\n",
            )
            w.writeheader()
            w.writerows(data)

    write("paired-results.csv", rows)
    write("automatic-subset.csv", e2e)
    summary = {
        "baselineCommit": "21f1e73",
        "samples": len(rows),
        "familiesBefore": 11,
        "variantsBefore": 42,
        "familiesAfter": len(set(f["family"] for f in new["fonts"])),
        "variantsAfter": len(new["fonts"]),
        "groups": {},
        "automaticSubset": len(e2e),
        "criteria": "Strict literal OCR incl. accents; original matching algorithm, gate 0.155 and gap 0.025 unchanged. Recognition uses corrected transcription unless automatic-subset.",
    }
    for group in ["original", "added", "outside", "short", "all"]:
        rs = rows if group == "all" else [r for r in rows if r["group"] == group]
        g = {"samples": len(rs), "expectedChars": sum(len(r["text"]) for r in rs)}
        for label in ["before", "after"]:
            for metric in [
                "OcrExact",
                "CharErrors",
                "FamilyTop1",
                "VariantTop1",
                "Proposed",
                "ContainsExpected",
                "WrongProposal",
            ]:
                g[label + metric] = sum(r[label + metric] for r in rs)
            for op in ["Ocr", "Identify"]:
                ts = [r[label + op + "Seconds"] for r in rs]
                g[label + op + "MedianSeconds"] = round(statistics.median(ts), 4)
                g[label + op + "P95Seconds"] = round(percentile(ts, 0.95), 4)
        summary["groups"][group] = g
    summary["ocrRefreshOnly"] = bool(args.refresh_ocr)
    summary["timingNote"] = (
        "OCR and automatic subset rerun after ink-height preparation; corrected-text matcher outputs/timings retained from original paired run, matching AST unchanged."
        if args.refresh_ocr
        else "Full fresh paired run."
    )
    summary["ocrRegressions"] = [
        r["sample"] for r in rows if r["beforeOcrExact"] and not r["afterOcrExact"]
    ]
    summary["newWrongProposals"] = [
        r["sample"]
        for r in rows
        if r["afterWrongProposal"] and not r["beforeWrongProposal"]
    ]
    summary["automatic"] = {
        label: {
            metric: sum(r[label + metric] for r in e2e)
            for metric in [
                "Proposed",
                "ContainsExpected",
                "WrongProposal",
                "VariantTop1",
            ]
        }
        for label in ["before", "after"]
    }
    (OUT / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(summary, indent=2), flush=True)


if args.generate:
    generate()
if args.run or args.refresh_ocr:
    run()
