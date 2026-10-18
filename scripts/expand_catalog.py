"""Add the pinned OFL selection without modifying the original 66 entries.
Source originals are never subset, renamed or recompressed. Repeatable from the
selection, pinned repository tree and manifest hashes; no runtime network API.
"""

from __future__ import annotations
import concurrent.futures, hashlib, json, pathlib, re, time, urllib.request
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]


def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
    selection = json.loads((ROOT / "catalog/selection.json").read_text())
    rev = selection["revision"]
    assert rev == manifest["revision"]
    tree = json.loads(
        get(f"https://api.github.com/repos/google/fonts/git/trees/{rev}?recursive=1")
    )
    assert not tree.get("truncated")
    paths = {e["path"]: e["sha"] for e in tree["tree"]}

    def verify_blob(path, raw):
        actual = hashlib.sha1(
            b"blob " + str(len(raw)).encode() + b"\0" + raw
        ).hexdigest()
        assert actual == paths[path], f"Pinned Git blob mismatch: {path}"

    base = f"https://raw.githubusercontent.com/google/fonts/{rev}/"
    previous = {f["file"]: f["sha256"] for f in manifest["fonts"]}
    baseline = json.loads((ROOT / "benchmarks/v03/catalog.json").read_text())

    def family(item):
        slug = item["slug"]
        folder = f"ofl/{slug}/"
        metadata_raw = get(base + folder + "METADATA.pb")
        verify_blob(folder + "METADATA.pb", metadata_raw)
        metadata = metadata_raw.decode()
        family_name = re.search(r'^name: "([^"]+)"', metadata).group(1)
        license_data = get(base + folder + "OFL.txt")
        verify_blob(folder + "OFL.txt", license_data)
        assert re.search(
            rb"sil\s+open\s+font\s+license[,\s]+version\s+1\.1", license_data, re.I
        ), slug
        license_file = ROOT / "catalog/licenses" / f"{slug}.txt"
        license_file.write_bytes(license_data)
        all_files = sorted(
            p
            for p in paths
            if p.startswith(folder)
            and "/" not in p[len(folder) :]
            and p.endswith(".ttf")
        )
        chosen = [
            p
            for p in all_files
            if "[" in p or re.search(r"-(Regular|Bold|Italic|BoldItalic)\.ttf$", p)
        ]
        if not chosen:
            chosen = all_files[:1]
        rows = []
        for source in chosen:
            filename = slug + "-" + source.rsplit("/", 1)[1]
            target = ROOT / "catalog/fonts" / filename
            if not target.exists():
                target.write_bytes(get(base + source))
            raw = target.read_bytes()
            verify_blob(source, raw)
            if filename in previous:
                assert digest(raw) == previous[filename], filename
            font = TTFont(target)
            axes = (
                {a.axisTag: a.defaultValue for a in font["fvar"].axes}
                if "fvar" in font
                else {}
            )
            is_italic = bool(font["head"].macStyle & 2) or "Italic" in source
            defaults = axes.copy()
            if "wght" in axes:
                axis = next(a for a in font["fvar"].axes if a.axisTag == "wght")
                weights = [w for w in (400, 700) if axis.minValue <= w <= axis.maxValue]
                if not weights:
                    weights = [int(axis.defaultValue)]
            else:
                weights = [int(font["OS/2"].usWeightClass)]
            optical = (
                next((a for a in font["fvar"].axes if a.axisTag == "opsz"), None)
                if "fvar" in font
                else None
            )
            for weight in weights:
                actual_axes = defaults.copy()
                if "wght" in axes:
                    actual_axes["wght"] = weight
                variant = {
                    100: "Thin",
                    200: "Extra Light",
                    300: "Light",
                    400: "Regular",
                    500: "Medium",
                    600: "Semi Bold",
                    700: "Bold",
                    800: "Extra Bold",
                    900: "Black",
                }.get(weight, str(weight))
                if is_italic:
                    variant += " Italic"
                rows.append(
                    {
                        "id": f"{slug}-{weight}" + ("-italic" if is_italic else ""),
                        "family": family_name,
                        "weight": weight,
                        "italic": is_italic,
                        "variant": variant,
                        "file": filename,
                        "axes": actual_axes,
                        "opticalSizes": (
                            list(
                                dict.fromkeys([optical.defaultValue, optical.maxValue])
                            )
                            if optical
                            else [None]
                        ),
                        "sha256": digest(raw),
                        "officialUrl": "https://fonts.google.com/specimen/"
                        + family_name.replace(" ", "+"),
                        "sourceUrl": base + source,
                        "license": "SIL Open Font License 1.1",
                        "licenseFile": f"{slug}.txt",
                        "licenseUrl": base + folder + "OFL.txt",
                        "commercialUse": True,
                        "variable": bool(axes),
                        "licenseSha256": digest(license_data),
                        "tag": item["tag"],
                    }
                )
            font.close()
        assert rows, slug
        print(f"{family_name}: {len(rows)} variants", flush=True)
        return rows

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        additions = [
            f for rows in pool.map(family, selection["additions"]) for f in rows
        ]
    fonts = baseline["fonts"] + additions
    assert len({f["id"] for f in fonts}) == len(fonts), "Duplicate variant"
    for f in fonts:
        assert digest((ROOT / "catalog/fonts" / f["file"]).read_bytes()) == f["sha256"]
    manifest.update(
        name="Catálogo abierto verificado de Google Fonts",
        verifiedAt=selection["verifiedAt"],
        fonts=fonts,
    )
    manifest.pop("index", None)
    (ROOT / "catalog/manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        len(set(f["family"] for f in fonts)),
        "families,",
        len(fonts),
        "variants",
        flush=True,
    )


if __name__ == "__main__":
    main()
