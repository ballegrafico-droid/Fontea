"""Restore the pinned, unmodified Tesseract models. Not needed at runtime."""

import hashlib, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1] / "engine/tessdata"
manifest = json.loads((ROOT / "manifest.json").read_text())
for entry in manifest["sources"]:
    with urllib.request.urlopen(entry["sourceUrl"], timeout=60) as response:
        data = response.read()
    assert hashlib.sha256(data).hexdigest() == entry["sha256"], entry["file"]
    (ROOT / entry["file"]).write_bytes(data)
print("Modelos eng+spa y licencia Apache 2.0 verificados.")
