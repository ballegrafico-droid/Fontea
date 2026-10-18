"""Bounded second-stage retrieval using the same packed glyph index as browser."""

from __future__ import annotations
import base64, gzip, hashlib, json, math, pathlib, time
from functools import lru_cache
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def load_index(filename, expected):
    raw = (ROOT / "catalog/index" / filename).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("El índice del catálogo no coincide con su firma.")
    return json.loads(gzip.decompress(raw)), len(raw)


def resized(mask, width, height=28):
    width = max(1, min(1200, width))
    h, w = mask.shape
    ys = np.minimum(h - 1, np.floor((np.arange(height) + 0.5) * h / height).astype(int))
    xs = np.minimum(w - 1, np.floor((np.arange(width) + 0.5) * w / width).astype(int))
    return mask[np.ix_(ys, xs)]


def compose(font, text, tracking):
    glyphs = font["glyphs"]
    if any(c not in glyphs for c in text):
        return None
    advance = 32
    parts = []
    for i, c in enumerate(text):
        g = glyphs[c]
        if i:
            advance += font["kern"].get(text[i - 1] + c, 0)
        parts.append((g, math.floor(advance + g[1] + 0.5)))
        advance += g[0] + tracking
    width = math.ceil(advance + 64)
    if not 0 < width <= 8000:
        return None
    out = np.zeros((128, width), dtype=bool)
    for g, x in parts:
        _, left, top, w, h, data = g
        if not w or not h:
            continue
        a = (
            np.unpackbits(np.frombuffer(base64.b64decode(data), dtype=np.uint8))[
                : w * h
            ]
            .reshape(h, w)
            .astype(bool)
        )
        y = 64 + top
        if x < 0 or x + w > width or y < 0 or y + h > 128:
            return None
        out[y : y + h, x : x + w] |= a
    ys, xs = np.where(out)
    if not len(xs):
        return None
    return out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def retrieve(source, text, catalog):
    start = time.perf_counter()
    info = catalog["index"]
    index, nbytes = load_index(info["file"], info["sha256"])
    assert index["version"] == 1 and len(index["fonts"]) == info["variants"]
    entries = {f["id"]: f for f in catalog["fonts"]}
    h, w = source.shape
    small = resized(source, round(w * 28 / h))
    ranked = []
    for row in index["fonts"]:
        entry = entries[row["id"]]
        assert entry["sha256"] == row["sha256"]
        best = math.inf
        for tracking in (-0.8 / 3, 0, 0.8 / 3):
            mask = compose(row, text, tracking)
            if mask is None:
                continue
            normalized = resized(mask, small.shape[1])
            union = np.logical_or(small, normalized).sum()
            intersection = np.logical_and(small, normalized).sum()
            score = 0.8 * (1 - intersection / max(1, union)) + 0.2 * min(
                abs(math.log((w / h) / (mask.shape[1] / mask.shape[0]))) * 2, 1
            )
            best = min(best, float(score))
        if math.isfinite(best):
            ranked.append((best, entry["id"], entry["family"]))
    ranked.sort(key=lambda r: r[0])
    selected = ranked[:24]
    families = {r[2] for r in selected}
    for row in ranked:
        if len(selected) >= 32:
            break
        if row[2] not in families:
            selected.append(row)
            families.add(row[2])
    for row in ranked:
        if len(selected) >= 32:
            break
        if row not in selected:
            selected.append(row)
    return {
        "ids": [r[1] for r in selected],
        "indexBytes": nbytes,
        "indexedVariants": len(index["fonts"]),
        "compatibleVariants": len(ranked),
        "coarseMs": (time.perf_counter() - start) * 1000,
    }
