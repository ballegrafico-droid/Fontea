import hashlib, json, pathlib, shutil, subprocess, sys, re, gzip

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
        hashlib.sha256(
            (ROOT / "catalog/licenses" / f["licenseFile"]).read_bytes()
        ).hexdigest()
        == f["licenseSha256"]
    )
    assert (
        hashlib.sha256((ROOT / "catalog/fonts" / f["file"]).read_bytes()).hexdigest()
        == f["sha256"]
    ), f["file"]
    assert re.search(
        r"sil\s+open\s+font\s+license[,\s]+version\s+1\.1",
        (ROOT / "catalog/licenses" / f["licenseFile"]).read_text(),
        re.I,
    ), f["licenseFile"]
print(
    f"Motor disponible, Tesseract spa+eng, {len(manifest['fonts'])} variantes y licencias verificadas."
)

info = manifest["index"]
raw = (ROOT / "catalog/index" / info["file"]).read_bytes()
assert hashlib.sha256(raw).hexdigest() == info["sha256"]
index = json.loads(gzip.decompress(raw))
assert len(index["fonts"]) == len(manifest["fonts"])
assert {f["id"]: f["sha256"] for f in index["fonts"]} == {
    f["id"]: f["sha256"] for f in manifest["fonts"]
}
print("Índice reproducible verificado:", len(raw), "bytes")
