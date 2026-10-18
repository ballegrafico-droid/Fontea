"""Conservative line-body grouping; accents/dots are not separate lines.
OCR line count remains an independent blocking signal, not a source of labels.
"""

import numpy as np


def line_bands(mask):
    height, width = mask.shape
    active = mask.sum(axis=1) > max(1, width * 0.008)
    raw = []
    start = None
    for y, value in enumerate(list(active) + [False]):
        if value and start is None:
            start = y
        if not value and start is not None:
            raw.append([start, y])
            start = None
    if not raw:
        return []
    largest = max(b - a for a, b in raw)
    gap = max(2, round(largest * 0.18))
    merged = []
    for a, b in raw:
        if merged and a - merged[-1][1] <= gap:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    total = int(mask.sum())
    main = max(b - a for a, b in merged)
    return [
        [a, b]
        for a, b in merged
        if b - a >= max(4, main * 0.32) and int(mask[a:b].sum()) >= total * 0.08
    ]
