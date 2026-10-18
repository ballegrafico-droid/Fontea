"""Generate a separate Pillow/FreeType cohort for the browser engine.
No fitting or threshold changes use these images. Fonts remain unmodified.
"""

import hashlib, io, json, pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
ART = ROOT / "tests/artifacts/browser-independent"
ART.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
samples = []


def save(entry, path, text, size, kind, group):
    f = ImageFont.truetype(str(path), size)
    if entry.get("axes"):
        f.set_variation_by_axes(list(entry["axes"].values()))
    box = f.getbbox(text)
    w = int(f.getlength(text)) + 64
    h = box[3] - box[1] + 48
    im = Image.new("RGB", (w, h), "white")
    ImageDraw.Draw(im).text((32, 24 - box[1]), text, font=f, fill="#171717")
    if kind == "degraded":
        im = im.resize(
            (im.width // 2, im.height // 2), Image.Resampling.LANCZOS
        ).filter(ImageFilter.GaussianBlur(0.45))
        b = io.BytesIO()
        im.save(b, format="JPEG", quality=52)
        im = Image.open(io.BytesIO(b.getvalue())).convert("RGB")
    sid = entry["id"] + "-" + kind
    path = ART / (sid + ".png")
    im.save(path)
    samples.append(
        {
            "sample": sid,
            "kind": kind,
            "group": group,
            "expected": entry["id"] if group in ("original", "added") else "OUTSIDE",
            "family": entry["family"],
            "text": text,
            "imageSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    )


old = {
    f["id"]
    for f in json.loads((ROOT / "benchmarks/catalog_v01.json").read_text())["fonts"]
}
families = list(dict.fromkeys(f["family"] for f in manifest["fonts"]))
for i, name in enumerate(families):
    variants = [f for f in manifest["fonts"] if f["family"] == name]
    entry = variants[i % len(variants)]
    group = "original" if entry["id"] in old else "added"
    path = ROOT / "catalog/fonts" / entry["file"]
    save(entry, path, "Ágil diseño, textura y voz 947", 79 + i % 3 * 9, "clean", group)
    if i % 4 == 0:
        save(entry, path, "Café, ritmo y pequeñas letras", 64, "degraded", group)
for name, path in [
    (
        "Liberation Sans",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ),
    (
        "Liberation Serif",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
    ),
    ("Nimbus Sans", "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf"),
    ("Nimbus Roman", "/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf"),
    ("URW Gothic", "/usr/share/fonts/opentype/urw-base35/URWGothic-Book.otf"),
    ("P052", "/usr/share/fonts/opentype/urw-base35/P052-Roman.otf"),
]:
    if not pathlib.Path(path).exists():
        path = path.replace("liberation2/", "liberation/")
    save(
        {"id": name.replace(" ", "-"), "family": name},
        path,
        "Ágil diseño, textura y voz 947",
        85,
        "clean",
        "outside",
    )
for text in ("HHH", "Ill"):
    entry = manifest["fonts"][0] | {"id": "short-" + text}
    save(entry, ROOT / "catalog/fonts" / entry["file"], text, 80, "short", "short")
OUT = ROOT / "docs/browser-independent"
OUT.mkdir(exist_ok=True)
(OUT / "samples.json").write_text(
    json.dumps(samples, ensure_ascii=False, indent=2) + "\n"
)
print("Independent Pillow samples:", len(samples))
