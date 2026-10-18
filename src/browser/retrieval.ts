// Stage 1: compose tiny glyph masks from a pinned index; no font file downloads.
export type Mask = { w: number; h: number; data: Uint8Array };
type Glyph = [number, number, number, number, number, string];
type IndexedFont = {
  id: string;
  sha256: string;
  glyphs: Record<string, Glyph>;
  kern: Record<string, number>;
};
type IndexInfo = { file: string; sha256: string; variants: number };
type Font = { id: string; family: string; sha256?: unknown };
function resized(m: Mask, w: number, h = 28): Mask {
  w = Math.max(1, Math.min(1200, w));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      data[y * w + x] =
        m.data[
          Math.min(m.h - 1, Math.floor(((y + 0.5) * m.h) / h)) * m.w +
            Math.min(m.w - 1, Math.floor(((x + 0.5) * m.w) / w))
        ];
  return { w, h, data };
}
function composed(
  font: IndexedFont,
  text: string,
  tracking: number,
): Mask | null {
  const letters = [...text];
  if (letters.some((c) => !font.glyphs[c])) return null;
  let advance = 32;
  const parts: { g: Glyph; x: number }[] = [];
  for (let i = 0; i < letters.length; i++) {
    const c = letters[i],
      g = font.glyphs[c];
    if (i) advance += font.kern[letters[i - 1] + c] ?? 0;
    parts.push({ g, x: Math.round(advance + g[1]) });
    advance += g[0] + tracking;
  }
  const width = Math.ceil(advance + 64),
    height = 128;
  if (width > 8000 || width < 1) return null;
  const data = new Uint8Array(width * height);
  let l = width,
    t = height,
    r = -1,
    b = -1;
  for (const part of parts) {
    const g = part.g,
      bytes = atob(g[5]);
    for (let y = 0; y < g[4]; y++)
      for (let x = 0; x < g[3]; x++) {
        const bit = y * g[3] + x;
        if (!(bytes.charCodeAt(bit >> 3) & (128 >> (bit & 7)))) continue;
        const xx = part.x + x,
          yy = 64 + g[2] + y;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
        data[yy * width + xx] = 1;
        l = Math.min(l, xx);
        r = Math.max(r, xx);
        t = Math.min(t, yy);
        b = Math.max(b, yy);
      }
  }
  if (r < 0) return null;
  const w = r - l + 1,
    h = b - t + 1,
    out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    out.set(data.subarray((t + y) * width + l, (t + y) * width + r + 1), y * w);
  return { w, h, data: out };
}
export async function retrieve(
  source: Mask,
  text: string,
  fonts: Font[],
  info: IndexInfo,
) {
  const start = performance.now();
  const response = await fetch(
    "/catalog-index/" + encodeURIComponent(info.file),
  );
  if (!response.ok)
    throw Error(
      "No se ha podido cargar el índice del catálogo. Vuelve a intentarlo.",
    );
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== info.sha256)
    throw Error("El catálogo no está actualizado. Recarga la página.");
  const decoded = (await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).json()) as { version: number; fonts: IndexedFont[] };
  if (decoded.version !== 1 || decoded.fonts.length !== info.variants)
    throw Error("El índice del catálogo está incompleto.");
  const sourceSmall = resized(source, Math.round((source.w * 28) / source.h)),
    byId = new Map(fonts.map((f) => [f.id, f]));
  const scores: { id: string; family: string; score: number }[] = [];
  for (const f of decoded.fonts) {
    const entry = byId.get(f.id);
    if (!entry || entry.sha256 !== f.sha256)
      throw Error("El índice no corresponde a las fuentes disponibles.");
    let best = Infinity;
    for (const tracking of [-0.8 / 3, 0, 0.8 / 3]) {
      const mask = composed(f, text, tracking);
      if (!mask) continue;
      const n = resized(mask, sourceSmall.w);
      let intersection = 0,
        union = 0;
      for (let i = 0; i < n.data.length; i++) {
        if (n.data[i] || sourceSmall.data[i]) union++;
        if (n.data[i] && sourceSmall.data[i]) intersection++;
      }
      const score =
        0.8 * (1 - intersection / Math.max(union, 1)) +
        0.2 *
          Math.min(
            Math.abs(Math.log(source.w / source.h / (mask.w / mask.h))) * 2,
            1,
          );
      best = Math.min(best, score);
    }
    if (Number.isFinite(best))
      scores.push({ id: f.id, family: entry.family, score: best });
  }
  scores.sort((a, b) => a.score - b.score);
  const selected = scores.slice(0, 24),
    families = new Set(selected.map((f) => f.family));
  for (const row of scores) {
    if (selected.length >= 32) break;
    if (!families.has(row.family)) {
      selected.push(row);
      families.add(row.family);
    }
  }
  for (const row of scores) {
    if (selected.length >= 32) break;
    if (!selected.some((f) => f.id === row.id)) selected.push(row);
  }
  return {
    ids: selected.map((f) => f.id),
    indexBytes: bytes.byteLength,
    indexedVariants: decoded.fonts.length,
    compatibleVariants: scores.length,
    coarseMs: performance.now() - start,
  };
}
