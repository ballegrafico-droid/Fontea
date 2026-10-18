// Bounded SFNT reader: names and character coverage, never persisted or uploaded.
export type LocalFontInfo = {
  family: string;
  style: string;
  fullName: string;
  version: string;
  postscriptName: string;
  weight: number;
  italic: boolean;
  axes: { tag: string; min: number; max: number; default: number }[];
};
export const MAX_FONT_BYTES = 8 * 1024 * 1024;
export function inspectLocalFont(
  buffer: ArrayBuffer,
  text = "",
): LocalFontInfo {
  const fail = () => {
    throw Error("El archivo no es una fuente TTF u OTF válida y compatible.");
  };
  if (buffer.byteLength < 12 || buffer.byteLength > MAX_FONT_BYTES) fail();
  const v = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  const tag = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  if (v.getUint32(0) !== 0x00010000 && tag(0) !== "OTTO") fail();
  const count = v.getUint16(4);
  if (!count || count > 256 || 12 + count * 16 > buffer.byteLength) fail();
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i++) {
    const p = 12 + 16 * i,
      offset = v.getUint32(p + 8),
      length = v.getUint32(p + 12);
    if (
      offset > buffer.byteLength ||
      length > buffer.byteLength - offset ||
      tables.has(tag(p))
    )
      fail();
    tables.set(tag(p), { offset, length });
  }
  const table = (name: string, min: number) => {
    const t = tables.get(name);
    if (!t || t.length < min) fail();
    return t!;
  };
  const n = table("name", 6),
    names = new Map<number, { rank: number; value: string }>();
  const records = v.getUint16(n.offset + 2),
    storage = v.getUint16(n.offset + 4);
  if (records > 4096 || 6 + records * 12 > n.length || storage > n.length)
    fail();
  for (let i = 0; i < records; i++) {
    const p = n.offset + 6 + i * 12,
      platform = v.getUint16(p),
      encoding = v.getUint16(p + 2),
      lang = v.getUint16(p + 4),
      id = v.getUint16(p + 6),
      length = v.getUint16(p + 8),
      offset = storage + v.getUint16(p + 10);
    if (offset > n.length || length > n.length - offset) fail();
    if (length > 2048 || ![0, 1, 3].includes(platform)) continue;
    let value = "";
    if (platform === 0 || platform === 3) {
      if (length % 2) continue;
      for (let j = 0; j < length; j += 2)
        value += String.fromCharCode(v.getUint16(n.offset + offset + j));
    } else if (encoding === 0)
      value = new TextDecoder("macintosh").decode(
        bytes.subarray(n.offset + offset, n.offset + offset + length),
      );
    value = value
      .replace(/[\x00-\x1f\x7f]/g, "")
      .trim()
      .slice(0, 240);
    const rank =
      (platform === 3 ? 4 : platform === 0 ? 3 : 1) + (lang === 0x409 ? 2 : 0);
    if (value && rank > (names.get(id)?.rank ?? -1))
      names.set(id, { rank, value });
  }
  const get = (id: number) => names.get(id)?.value ?? "";
  const os = table("OS/2", 64),
    weight = v.getUint16(os.offset + 4),
    flags = v.getUint16(os.offset + 62);
  if (weight < 1 || weight > 1000) fail();
  const axes: LocalFontInfo["axes"] = [],
    fvar = tables.get("fvar");
  if (fvar) {
    if (fvar.length < 16) fail();
    const start = v.getUint16(fvar.offset + 4),
      num = v.getUint16(fvar.offset + 8),
      size = v.getUint16(fvar.offset + 10);
    if (num > 32 || size < 20 || start < 16 || start + num * size > fvar.length)
      fail();
    for (let i = 0; i < num; i++) {
      const p = fvar.offset + start + i * size,
        axis = {
          tag: tag(p),
          min: v.getInt32(p + 4) / 65536,
          default: v.getInt32(p + 8) / 65536,
          max: v.getInt32(p + 12) / 65536,
        };
      if (
        !/^[a-zA-Z0-9 ]{4}$/.test(axis.tag) ||
        axis.min > axis.default ||
        axis.default > axis.max ||
        axes.some((a) => a.tag === axis.tag)
      )
        fail();
      axes.push(axis);
    }
  }
  // Confirm every requested character exists; browser fallback must not masquerade as the uploaded font.
  const cmap = table("cmap", 4),
    subs = v.getUint16(cmap.offset + 2);
  if (subs > 256 || 4 + subs * 8 > cmap.length) fail();
  const checks: ((cp: number) => boolean)[] = [];
  for (let i = 0; i < subs; i++) {
    const r = cmap.offset + 4 + i * 8,
      platform = v.getUint16(r),
      encoding = v.getUint16(r + 2),
      offset = v.getUint32(r + 4);
    if (!(platform === 0 || (platform === 3 && [1, 10].includes(encoding))))
      continue;
    if (offset > cmap.length - 2) fail();
    const p = cmap.offset + offset,
      format = v.getUint16(p);
    if (format === 12) {
      if (offset + 16 > cmap.length) fail();
      const len = v.getUint32(p + 4),
        num = v.getUint32(p + 12);
      if (
        len > cmap.length - offset ||
        len < 16 ||
        num > 100000 ||
        16 + num * 12 > len
      )
        fail();
      checks.push((cp) => {
        let lo = 0,
          hi = num - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1,
            q = p + 16 + mid * 12,
            start = v.getUint32(q),
            end = v.getUint32(q + 4);
          if (cp < start) hi = mid - 1;
          else if (cp > end) lo = mid + 1;
          else return v.getUint32(q + 8) + cp - start !== 0;
        }
        return false;
      });
    } else if (format === 4) {
      if (offset + 14 > cmap.length) fail();
      const len = v.getUint16(p + 2),
        seg = v.getUint16(p + 6) / 2;
      if (
        !Number.isInteger(seg) ||
        !seg ||
        len > cmap.length - offset ||
        16 + 8 * seg > len
      )
        fail();
      checks.push((cp) => {
        if (cp > 0xffff) return false;
        for (let j = 0; j < seg; j++) {
          const end = v.getUint16(p + 14 + 2 * j),
            start = v.getUint16(p + 16 + 2 * seg + 2 * j);
          if (cp < start || cp > end) continue;
          const delta = v.getInt16(p + 16 + 4 * seg + 2 * j),
            q = p + 16 + 6 * seg + 2 * j,
            ro = v.getUint16(q);
          if (!ro) return ((cp + delta) & 0xffff) !== 0;
          const glyphP = q + ro + 2 * (cp - start);
          if (glyphP < p || glyphP + 2 > p + len) return false;
          const glyph = v.getUint16(glyphP);
          return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
        }
        return false;
      });
    }
  }
  if (!checks.length) fail();
  const missing = [
    ...new Set(
      [...text].filter(
        (c) => !checks.some((check) => check(c.codePointAt(0)!)),
      ),
    ),
  ];
  if (missing.length)
    throw Error(
      `El archivo no contiene estos caracteres: ${missing.join(" ")}. No se usará una fuente de sustitución.`,
    );
  if (!get(1) && !get(16)) fail();
  return {
    family: get(16) || get(1),
    style: get(17) || get(2) || "Estilo sin declarar",
    fullName: get(4),
    version: get(5),
    postscriptName: get(6),
    weight,
    italic: Boolean(flags & 1),
    axes,
  };
}
