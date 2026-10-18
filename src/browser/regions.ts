import type { Mask } from "./retrieval";
// Merge accent/dot gaps, then count substantial text bodies, not disconnected marks.
export function lineBands(mask: Mask): number[][] {
  const raw: number[][] = [];
  let start: number | undefined;
  for (let y = 0; y <= mask.h; y++) {
    let count = 0;
    if (y < mask.h)
      for (let x = 0; x < mask.w; x++) count += mask.data[y * mask.w + x];
    const active = count > Math.max(1, mask.w * 0.008);
    if (active && start === undefined) start = y;
    if (!active && start !== undefined) {
      raw.push([start, y]);
      start = undefined;
    }
  }
  if (!raw.length) return [];
  const largest = Math.max(...raw.map(([a, b]) => b - a)),
    gap = Math.max(2, Math.round(largest * 0.18)),
    merged: number[][] = [];
  for (const [a, b] of raw) {
    if (merged.length && a - merged[merged.length - 1][1] <= gap)
      merged[merged.length - 1][1] = b;
    else merged.push([a, b]);
  }
  const total = mask.data.reduce((a, b) => a + b, 0),
    main = Math.max(...merged.map(([a, b]) => b - a));
  return merged.filter(([a, b]) => {
    let ink = 0;
    for (let y = a; y < b; y++)
      for (let x = 0; x < mask.w; x++) ink += mask.data[y * mask.w + x];
    return b - a >= Math.max(4, main * 0.32) && ink >= total * 0.08;
  });
}
