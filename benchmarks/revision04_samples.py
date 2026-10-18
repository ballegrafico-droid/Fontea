"""Fixed independent FreeType samples. No user image or claimed font identity.
Separate development and evaluation phrases; do not tune gates on evaluation.
"""

import hashlib, io, json, pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
ART = ROOT / "tests/artifacts/revision04"
ART.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "docs/revision-0.4"
OUT.mkdir(exist_ok=True)
manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
fonts = manifest["fonts"]
old = json.loads((ROOT / "benchmarks/v03/catalog.json").read_text())["fonts"]
oldids = {f["id"] for f in old}
new = [f for f in fonts if f["id"] not in oldids]
rows = []


def font(entry, size):
    f = ImageFont.truetype(str(ROOT / "catalog/fonts" / entry["file"]), size)
    if entry["axes"]:
        f.set_variation_by_axes(list(entry["axes"].values()))
    return f


def image_line(entry, text, size=76):
    f = font(entry, size)
    box = f.getbbox(text)
    im = Image.new("RGB", (int(f.getlength(text)) + 60, box[3] - box[1] + 50), "white")
    ImageDraw.Draw(im).text((30, 25 - box[1]), text, font=f, fill="#161616")
    return im


def save(sid, im, text, expected, family, group, kind="clean", split="evaluation"):
    path = ART / (sid + ".png")
    im.save(path)
    rows.append(
        {
            "sample": sid,
            "text": text,
            "expected": expected,
            "family": family,
            "group": group,
            "kind": kind,
            "split": split,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    )


def degraded(im):
    im = im.resize(
        (max(12, im.width // 2), max(12, im.height // 2)), Image.Resampling.LANCZOS
    ).filter(ImageFilter.GaussianBlur(0.45))
    b = io.BytesIO()
    im.save(b, format="JPEG", quality=52)
    return Image.open(io.BytesIO(b.getvalue())).convert("RGB")


# 24 established variants, all 17 original families plus distinct weights/cursives.
chosen = []
for name in dict.fromkeys(f["family"] for f in old):
    chosen.append(next(f for f in old if f["family"] == name))
chosen += [f for f in old if f["italic"] or f["weight"] == 700][::4][:7]
for i, f in enumerate(chosen):
    kind = "degraded" if i % 3 == 1 else "clean"
    text = (
        "Árboles, sueños y juegos 692" if i % 2 else "Bright farms & gentle stories 692"
    )
    im = image_line(f, text, 74 + (i % 3) * 7)
    if kind == "degraded":
        im = degraded(im)
    save(
        "old-" + f["id"] + "-" + kind, im, text, f["id"], f["family"], "original", kind
    )
# 32 new families stratified across the selected styles, variant/weight varied.
new_chosen = []
for tag, count in [("manuscrita", 12), ("ludica", 16), ("display", 4)]:
    families = list(dict.fromkeys(f["family"] for f in new if f["tag"] == tag))
    indices = [round(i * (len(families) - 1) / (count - 1)) for i in range(count)]
    for i, j in enumerate(indices):
        variants = [f for f in new if f["family"] == families[j]]
        new_chosen.append(variants[i % len(variants)])
for i, f in enumerate(new_chosen):
    text = (
        "Fiesta, globos y jardín 481" if i % 2 else "Playful letters & forest tales 481"
    )
    kind = "degraded" if i % 4 == 1 else "clean"
    im = image_line(f, text, 80 + (i % 3) * 6)
    if kind == "degraded":
        im = degraded(im)
    save("new-" + f["id"] + "-" + kind, im, text, f["id"], f["family"], "added", kind)
# Six external families, eight samples, including two close sans/serif pairs.
external = [
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
]
for i, (name, path) in enumerate(external + external[:2]):
    p = pathlib.Path(path)
    if not p.exists():
        p = pathlib.Path(path.replace("liberation2/", "liberation/"))
    text = "Bosque, lápices y canciones 746"
    f = ImageFont.truetype(str(p), 78)
    box = f.getbbox(text)
    im = Image.new("RGB", (int(f.getlength(text)) + 60, box[3] - box[1] + 50), "white")
    ImageDraw.Draw(im).text((30, 25 - box[1]), text, font=f, fill="#151515")
    if i >= 6:
        im = degraded(im)
    save(
        f"outside-{i}",
        im,
        text,
        "OUTSIDE",
        name,
        "outside",
        "degraded" if i >= 6 else "clean",
    )
# Two/three lines, same and mixed families; a generic synthetic farm illustration title.
for i in range(8):
    f1 = chosen[(i * 3) % len(chosen)]
    f2 = new_chosen[(i * 5) % len(new_chosen)] if i % 2 else f1
    texts = ["Nubes de colores", "Fiesta en el campo"] + (
        ["Historias y juegos"] if i >= 6 else []
    )
    ims = [
        image_line(f1 if j == 0 else f2, t, 70 if j == 0 else 54)
        for j, t in enumerate(texts)
    ]
    im = Image.new(
        "RGB",
        (max(a.width for a in ims) + 30, sum(a.height for a in ims) + 20),
        "white",
    )
    y = 10
    for a in ims:
        im.paste(a, (15, y))
        y += a.height
    save(
        f"multiline-{i}",
        im,
        " ".join(texts),
        "NEEDS_CROP",
        "MIXED" if i % 2 else f1["family"],
        "multiline",
    )
for i, text in enumerate(["HHH", "Ill"]):
    save(
        "short-" + str(i),
        image_line(chosen[0], text),
        text,
        "NONE",
        "Inter",
        "insufficient",
        "short",
    )
im = image_line(chosen[0], "Pequeñas letras del bosque", 16)
save(
    "low-resolution",
    im,
    "Pequeñas letras del bosque",
    "NONE",
    "Inter",
    "insufficient",
    "low-resolution",
)
im = image_line(chosen[0], "Pequeñas letras del bosque")
im = im.point(lambda v: 220 + v * 25 // 255)
save(
    "low-contrast",
    im,
    "Pequeñas letras del bosque",
    "NONE",
    "Inter",
    "insufficient",
    "low-contrast",
)
# Sixteen development cases use different text/sizes and are never added to held-out score.
for i, f in enumerate((chosen[:6] + new_chosen[::3])[:16]):
    save(
        "development-" + str(i),
        image_line(f, "AVATAR, ritmo y alegría 135", 87),
        "AVATAR, ritmo y alegría 135",
        f["id"],
        f["family"],
        "development",
        split="development",
    )
(OUT / "samples.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
print(
    "Evaluation:",
    sum(r["split"] == "evaluation" for r in rows),
    "Development:",
    sum(r["split"] == "development" for r in rows),
)
