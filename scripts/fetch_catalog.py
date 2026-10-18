"""Restore every pinned original in the current manifest; never shrink catalogue.
Expansion is explicit: expand_catalog.py then build_glyph_index.py.
"""

import concurrent.futures, hashlib, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]


def restore(item):
    path, url, expected = item
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as r:
            raw = r.read()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError(f"Upstream hash mismatch: {path.name}")
        path.write_bytes(raw)
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Altered file: {path.name}")


def run():
    manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
    items = {}
    for f in manifest["fonts"]:
        items[f["file"]] = (
            ROOT / "catalog/fonts" / f["file"],
            f["sourceUrl"],
            f["sha256"],
        )
        items[f["licenseFile"]] = (
            ROOT / "catalog/licenses" / f["licenseFile"],
            f["licenseUrl"],
            f["licenseSha256"],
        )
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(restore, items.values()))
    print(
        len(set(f["family"] for f in manifest["fonts"])),
        "families,",
        len(manifest["fonts"]),
        "variants restored/verified. No files modified.",
    )


if __name__ == "__main__":
    run()
