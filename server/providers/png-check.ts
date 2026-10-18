import { ExternalError } from "./whatfontis.js";
import { lineBands } from "./regions.js";
// Deliberately narrow transport: non-interlaced 8-bit Canvas PNG, bounded inflate.
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export async function checkExternalPng(base64: string) {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    v = new DataView(raw.buffer);
  const bad = () => {
    throw new ExternalError(
      422,
      "invalid_image",
      "El recorte PNG no es válido. Vuelve a seleccionar la imagen.",
    );
  };
  let width = 0,
    height = 0,
    channels = 0,
    ended = false;
  const parts: Uint8Array[] = [];
  for (let p = 8; p < raw.length;) {
    if (p + 12 > raw.length) bad();
    const len = v.getUint32(p),
      end = p + 12 + len;
    if (end > raw.length) bad();
    const type = String.fromCharCode(...raw.subarray(p + 4, p + 8));
    if (crc32(raw.subarray(p + 4, p + 8 + len)) !== v.getUint32(p + 8 + len))
      bad();
    if (type === "IHDR") {
      if (p !== 8 || len !== 13) bad();
      width = v.getUint32(p + 8);
      height = v.getUint32(p + 12);
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[
        raw[p + 17]
      ];
      if (
        raw[p + 16] !== 8 ||
        !channels ||
        raw[p + 18] ||
        raw[p + 19] ||
        raw[p + 20] ||
        width < 12 ||
        height < 12 ||
        width > 2200 ||
        height > 600 ||
        width * height > 1320000
      )
        bad();
    } else if (type === "IDAT") parts.push(raw.subarray(p + 8, p + 8 + len));
    else if (type === "IEND") {
      if (len || end !== raw.length) bad();
      ended = true;
      break;
    } else if ((raw[p + 4] & 32) === 0) bad();
    p = end;
  }
  if (!ended || !width || !parts.length) bad();
  const compressed = new Blob(parts as BlobPart[]),
    reader = compressed
      .stream()
      .pipeThrough(new DecompressionStream("deflate"))
      .getReader();
  const stride = width * channels,
    expected = (stride + 1) * height,
    scan = new Uint8Array(expected);
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      if (size + r.value.length > expected) {
        await reader.cancel();
        bad();
      }
      scan.set(r.value, size);
      size += r.value.length;
    }
  } catch {
    bad();
  }
  if (size !== expected) bad();
  const pixels = new Uint8Array(width * height * channels);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = scan[y * (stride + 1)];
    if (filter > 4) bad();
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x,
        a = x >= channels ? pixels[at - channels] : 0,
        b = y ? pixels[at - stride] : 0,
        c = y && x >= channels ? pixels[at - stride - channels] : 0;
      const predictor =
        filter === 1
          ? a
          : filter === 2
            ? b
            : filter === 3
              ? Math.floor((a + b) / 2)
              : filter === 4
                ? paeth(a, b, c)
                : 0;
      pixels[at] = (scan[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const gray = new Uint8Array(width * height),
    border: number[] = [];
  for (let i = 0; i < gray.length; i++) {
    const p = i * channels,
      color =
        channels <= 2
          ? pixels[p]
          : 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2],
      alpha =
        channels === 2
          ? pixels[p + 1] / 255
          : channels === 4
            ? pixels[p + 3] / 255
            : 1;
    gray[i] = Math.round(color * alpha + 255 * (1 - alpha));
    const x = i % width,
      y = Math.floor(i / width);
    if (!x || !y || x === width - 1 || y === height - 1) border.push(gray[i]);
  }
  border.sort((a, b) => a - b);
  if (border[border.length >> 1] < 128)
    for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
  const data = Uint8Array.from(gray, (g) => (g < 128 ? 1 : 0)),
    bands = lineBands({ w: width, h: height, data });
  if (bands.length > 1)
    throw new ExternalError(
      422,
      "needs_crop",
      "El recorte contiene varias líneas. Selecciona una sola antes de enviarla al proveedor.",
    );
  if (!bands.length || bands[0][1] - bands[0][0] < 24)
    throw new ExternalError(
      422,
      "insufficient_image",
      "No se distinguen letras con suficiente resolución en el recorte.",
    );
  return { width, height, lines: bands.length };
}
