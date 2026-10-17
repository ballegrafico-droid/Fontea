"""Development experiment on previously documented images; not a held-out score."""

import csv, io, json, pathlib, subprocess, sys, time
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmarks"))
import core_v01 as baseline

sys.path.insert(0, str(ROOT / "engine"))
import core as updated


def variant(im, lang, psm, pad=False):
    sample = im.copy()
    sample.thumbnail((2200, 500))
    if sample.height < 160:
        sample = sample.resize((sample.width * 3, sample.height * 3))
    if pad:
        sample = ImageOps.expand(sample, border=24, fill="white")
    data = io.BytesIO()
    sample.save(data, format="PNG")
    r = subprocess.run(
        [
            "tesseract",
            "stdin",
            "stdout",
            "--tessdata-dir",
            str(ROOT / "engine/tessdata"),
            "-l",
            lang,
            "--psm",
            str(psm),
            "-c",
            "tessedit_create_tsv=1",
        ],
        input=data.getvalue(),
        capture_output=True,
        timeout=15,
        check=True,
    )
    words = [
        l.split("\t")[11]
        for l in r.stdout.decode().splitlines()[1:]
        if len(l.split("\t")) >= 12
        and l.split("\t")[0] == "5"
        and l.split("\t")[11].strip()
    ]
    return " ".join(words)


rows = []
for i, r in enumerate(csv.DictReader(open(ROOT / "docs/final-results.csv"))):
    if r["kind"] not in ("clean", "degraded") or i % 2:
        continue
    im = Image.open(ROOT / "tests/artifacts/final" / (r["sample"] + ".png")).convert(
        "RGB"
    )
    row = {
        "sample": r["sample"],
        "expected": r["text"],
        "baseline": baseline.ocr(im)["text"],
    }
    for name, lang, psm, pad in [
        ("spanish_first", "spa+eng", 6, False),
        ("spanish_only", "spa", 6, False),
        ("line_with_border", "spa+eng", 7, True),
    ]:
        row[name] = variant(im, lang, psm, pad)
    row["ink_height_preparation"] = updated.ocr(im)["text"]
    rows.append(row)
summary = {
    name: sum(r[name] == r["expected"] for r in rows)
    for name in [
        "baseline",
        "spanish_first",
        "spanish_only",
        "line_with_border",
        "ink_height_preparation",
    ]
}
entry = updated.CATALOG["fonts"][0]
tight_read = updated.ocr(
    updated.mask_image(updated.render(entry, "Diseño y tipografía", size=90))
)["text"]
with (ROOT / "docs/ocr-development.csv").open("w") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys(), lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
(ROOT / "docs/ocr-development-summary.json").write_text(
    json.dumps(
        {
            "samples": len(rows),
            "tightCropRegression": {
                "expected": "Diseño y tipografía",
                "actual": tight_read,
                "exact": tight_read == "Diseño y tipografía",
            },
            "exact": summary,
            "criterion": "Literal equality including accents; fixed configurations, no dictionary correction.",
        },
        indent=2,
    )
    + "\n"
)
print(len(rows), summary)
