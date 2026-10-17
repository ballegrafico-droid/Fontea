"""Fetch unmodified upstream fonts and licenses at a fixed Google Fonts revision.
No API key. Runtime never contacts Google. Reruns verify the existing manifest pin.
"""

import concurrent.futures, hashlib, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
FAMILIES = {
    "inter": "Inter",
    "roboto": "Roboto",
    "opensans": "Open Sans",
    "montserrat": "Montserrat",
    "lato": "Lato",
    "poppins": "Poppins",
    "lora": "Lora",
    "playfairdisplay": "Playfair Display",
    "sourceserif4": "Source Serif 4",
    "robotomono": "Roboto Mono",
    "oswald": "Oswald",
}


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def run():
    previous = ROOT / "catalog/manifest.json"
    revision = (
        json.loads(previous.read_text())["revision"]
        if previous.exists()
        else json.loads(get("https://api.github.com/repos/google/fonts/commits/main"))[
            "sha"
        ]
    )

    def family(item):
        slug, name = item
        entries = json.loads(
            get(
                f"https://api.github.com/repos/google/fonts/contents/ofl/{slug}?ref={revision}"
            )
        )
        license_entry = next(x for x in entries if x["name"] == "OFL.txt")
        license_data = get(license_entry["download_url"])
        assert b"SIL OPEN FONT LICENSE" in license_data
        (ROOT / f"catalog/licenses/{slug}.txt").write_bytes(license_data)
        font_entries = [x for x in entries if x["name"].endswith(".ttf")]
        result = []
        for italic in [False, True]:
            for weight in [400, 700]:
                from fontTools.ttLib import TTFont

                selected = None
                for entry in font_entries:
                    fn = entry["name"]
                    is_italic = "Italic" in fn
                    if is_italic != italic:
                        continue
                    if (
                        "[" in fn
                        or ("Bold" if weight == 700 else "Regular") in fn
                        or (weight == 400 and fn.endswith("-Italic.ttf"))
                    ):
                        selected = entry
                        break
                if not selected:
                    continue
                filename = f"{slug}-{selected['name']}"
                target = ROOT / "catalog/fonts" / filename
                if not target.exists():
                    target.write_bytes(get(selected["download_url"]))
                font = TTFont(target)
                axes = (
                    {a.axisTag: a.defaultValue for a in font["fvar"].axes}
                    if "fvar" in font
                    else {}
                )
                if "wght" in axes:
                    axes["wght"] = weight
                result.append(
                    {
                        "id": f"{slug}-{weight}" + ("-italic" if italic else ""),
                        "family": name,
                        "weight": weight,
                        "italic": italic,
                        "variant": ("Bold" if weight == 700 else "Regular")
                        + (" Italic" if italic else ""),
                        "file": filename,
                        "axes": axes,
                        "opticalSizes": (
                            list(dict.fromkeys([a.defaultValue, a.maxValue]))
                            if "fvar" in font
                            and (
                                a := next(
                                    (
                                        a
                                        for a in font["fvar"].axes
                                        if a.axisTag == "opsz"
                                    ),
                                    None,
                                )
                            )
                            else [None]
                        ),
                        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                        "officialUrl": f'https://fonts.google.com/specimen/{name.replace(" ","+")}',
                        "sourceUrl": selected["download_url"],
                        "license": "SIL Open Font License 1.1",
                        "licenseFile": f"{slug}.txt",
                        "licenseUrl": license_entry["download_url"],
                        "commercialUse": True,
                    }
                )
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        fonts = [font for group in pool.map(family, FAMILIES.items()) for font in group]
    data = {
        "name": "Selección abierta de Google Fonts",
        "revision": revision,
        "verifiedAt": "2026-10-17",
        "fonts": fonts,
    }
    previous.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(FAMILIES)} familias, {len(fonts)} variantes. Revisión {revision}")


if __name__ == "__main__":
    run()
