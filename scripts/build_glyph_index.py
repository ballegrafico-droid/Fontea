"""Reproducible coarse retrieval index; original font files remain unchanged.
Glyph masks are analysis data, not installable or modified font software.
32px glyphs preserve bearings, advances and common Latin kerning pairs.
"""

from __future__ import annotations
import base64, gzip, hashlib, io, json, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHARS = "".join(chr(c) for c in list(range(32, 127)) + list(range(160, 384)))
PAIR_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:;!?-"


def main():
    manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
    rows = []
    for i, entry in enumerate(manifest["fonts"]):
        path = ROOT / "catalog/fonts" / entry["file"]
        tt = TTFont(path)
        cmap = tt.getBestCmap()
        f = ImageFont.truetype(str(path), 32)
        if entry["axes"]:
            f.set_variation_by_axes(list(entry["axes"].values()))
        glyphs = {}
        for char in CHARS:
            if ord(char) not in cmap:
                continue
            left, top, right, bottom = f.getbbox(char, anchor="ls")
            w = right - left
            h = bottom - top
            advance = round(f.getlength(char), 3)
            if w <= 0 or h <= 0:
                glyphs[char] = [advance, 0, 0, 0, 0, ""]
                continue
            image = Image.new("L", (w, h), 255)
            ImageDraw.Draw(image).text((-left, -top), char, font=f, fill=0, anchor="ls")
            bits = np.packbits((np.asarray(image) < 160).ravel())
            glyphs[char] = [
                advance,
                left,
                top,
                w,
                h,
                base64.b64encode(bits.tobytes()).decode(),
            ]
        # Pair metrics from FreeType; only the fixed common Latin development alphabet.
        # Fonts without 'kern' or kern positioning skip this step entirely.
        kern = {}
        has_kern = "kern" in tt or (
            "GPOS" in tt
            and tt["GPOS"].table.FeatureList
            and any(
                r.FeatureTag == "kern"
                for r in tt["GPOS"].table.FeatureList.FeatureRecord
            )
        )
        if has_kern:
            valid = [c for c in PAIR_CHARS if c in glyphs]
            for a in valid:
                for b in valid:
                    value = round(f.getlength(a + b) - glyphs[a][0] - glyphs[b][0], 3)
                    if abs(value) > 0.035:
                        kern[a + b] = value
        tt.close()
        rows.append(
            {
                "id": entry["id"],
                "sha256": entry["sha256"],
                "glyphs": glyphs,
                "kern": kern,
            }
        )
        if i % 10 == 0:
            print(f'Indexed {i+1}/{len(manifest["fonts"])}', flush=True)
    data = json.dumps(
        {"version": 1, "revision": manifest["revision"], "fontSize": 32, "fonts": rows},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    compressed = gzip.compress(data, mtime=0)
    sha = hashlib.sha256(compressed).hexdigest()
    filename = f"glyphs-v1-{sha[:16]}.bin"
    directory = ROOT / "catalog/index"
    directory.mkdir(exist_ok=True)
    (directory / filename).write_bytes(compressed)
    manifest["index"] = {
        "file": filename,
        "sha256": sha,
        "variants": len(rows),
        "fontSize": 32,
        "uncompressedBytes": len(data),
        "compressedBytes": len(compressed),
        "version": 1,
        "compression": "gzip",
    }
    (ROOT / "catalog/manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        "Index",
        len(rows),
        "variants,",
        len(data),
        "raw bytes,",
        len(compressed),
        "gzip bytes",
        flush=True,
    )


if __name__ == "__main__":
    main()
