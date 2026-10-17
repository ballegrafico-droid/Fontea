import hashlib, json, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
for name in ("PIL", "numpy", "scipy", "fontTools"):
    __import__(name)
assert shutil.which("tesseract"), "Instala tesseract-ocr"
assert (
    "spa"
    in subprocess.check_output(
        ["tesseract", "--tessdata-dir", str(ROOT / "engine/tessdata"), "--list-langs"],
        stderr=subprocess.STDOUT,
    ).decode()
), "Faltan datos OCR"
ocr_manifest = json.loads((ROOT / "engine/tessdata/manifest.json").read_text())
for f in ocr_manifest["sources"]:
    assert (
        hashlib.sha256((ROOT / "engine/tessdata" / f["file"]).read_bytes()).hexdigest()
        == f["sha256"]
    ), f["file"]
manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
for f in manifest["fonts"]:
    assert (
        hashlib.sha256((ROOT / "catalog/fonts" / f["file"]).read_bytes()).hexdigest()
        == f["sha256"]
    ), f["file"]
    assert (
        "SIL OPEN FONT LICENSE Version 1.1"
        in (ROOT / "catalog/licenses" / f["licenseFile"]).read_text()
    ), f["licenseFile"]
print(
    f"Motor disponible, Tesseract eng+spa, {len(manifest['fonts'])} variantes y licencias verificadas."
)
