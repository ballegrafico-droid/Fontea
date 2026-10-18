import { inspectLocalFont } from "./local-font-info";
import { retrieve } from "./retrieval";
import { lineBands } from "./regions";
// Browser catalogue retrieval: actual FontFace files, measured contour distance.
// No identity probability and no claim of exact identification.
type Mask = { w: number; h: number; data: Uint8Array };
type Entry = {
  id: string;
  family: string;
  file: string;
  weight: number;
  italic: boolean;
  axes: Record<string, number>;
  opticalSizes: (number | null)[];
  licenseFile: string;
  [key: string]: unknown;
};
type Catalog = {
  name: string;
  revision: string;
  fonts: Entry[];
  index: { file: string; sha256: string; variants: number };
};
const scope = self as unknown as {
  fonts: FontFaceSet;
  postMessage: (value: unknown) => void;
  onmessage: ((e: MessageEvent) => void) | null;
};
function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x)
    throw Error(
      "Tu navegador no permite analizar esta imagen. Usa una versión actual de Chrome, Firefox o Safari.",
    );
  return { c, x };
}
function trim(m: Mask): Mask {
  let l = m.w,
    t = m.h,
    r = -1,
    b = -1;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (m.data[y * m.w + x]) {
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
  if (r < 0)
    throw Error(
      "No se distingue texto en el recorte. Prueba una zona con más contraste.",
    );
  const w = r - l + 1,
    h = b - t + 1,
    data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    data.set(m.data.subarray((t + y) * m.w + l, (t + y) * m.w + l + w), y * w);
  return { w, h, data };
}
function drawMask(m: Mask, color?: number[]) {
  const { c, x } = canvas(m.w, m.h);
  const p = x.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) {
    const j = i * 4;
    if (color) {
      p.data[j] = color[0];
      p.data[j + 1] = color[1];
      p.data[j + 2] = color[2];
      p.data[j + 3] = m.data[i] * 255;
    } else {
      p.data[j] = p.data[j + 1] = p.data[j + 2] = m.data[i] ? 0 : 255;
      p.data[j + 3] = 255;
    }
  }
  x.putImageData(p, 0, 0);
  return c;
}
function normalize(m: Mask, width?: number): Mask {
  const h = 56,
    w = Math.min(2400, width ?? Math.max(1, Math.round((m.w * h) / m.h)));
  const { c, x } = canvas(w, h);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(drawMask(m), 0, 0, w, h);
  const p = x.getImageData(0, 0, w, h).data,
    data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = p[i * 4] < 140 ? 1 : 0;
  return { w, h, data };
}
function padded(m: Mask): Mask {
  const w = m.w + 6,
    h = m.h + 6,
    data = new Uint8Array(w * h);
  for (let y = 0; y < m.h; y++)
    data.set(m.data.subarray(y * m.w, (y + 1) * m.w), (y + 3) * w + 3);
  return { w, h, data };
}
function edges(m: Mask) {
  const a = m.data,
    e = new Uint8Array(a.length);
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x;
      e[i] =
        a[i] && !(a[i - 1] && a[i + 1] && a[i - m.w] && a[i + m.w]) ? 1 : 0;
    }
  return e;
}
// Exact squared Euclidean transform, separable lower envelope of parabolas.
function edt(edge: Uint8Array, w: number, h: number) {
  const n = Math.max(w, h),
    f = new Float64Array(n),
    d = new Float64Array(n),
    v = new Int32Array(n),
    z = new Float64Array(n + 1),
    tmp = new Float64Array(w * h),
    out = new Float64Array(w * h);
  function line(length: number) {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = edge[y * w + x] ? 0 : 1e9;
    line(h);
    for (let y = 0; y < h; y++) tmp[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = tmp[y * w + x];
    line(w);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}
function prepared(m: Mask) {
  const normalized = normalize(m),
    a = padded(normalized),
    edge = edges(a);
  return { normalized, a, edge, dt: edt(edge, a.w, a.h), ratio: m.w / m.h };
}
function distance(src: ReturnType<typeof prepared>, candidate: Mask) {
  const b = padded(normalize(candidate, src.normalized.w)),
    be = edges(b),
    db = edt(be, b.w, b.h);
  let union = 0,
    intersection = 0,
    ab = 0,
    ba = 0,
    nb = 0,
    na = 0;
  for (let i = 0; i < b.data.length; i++) {
    const a = src.a.data[i],
      v = b.data[i];
    if (a || v) union++;
    if (a && v) intersection++;
    if (be[i]) {
      ab += src.dt[i];
      nb++;
    }
    if (src.edge[i]) {
      ba += db[i];
      na++;
    }
  }
  const chamfer = (ab / Math.max(nb, 1) + ba / Math.max(na, 1)) / 112,
    aspect = Math.abs(Math.log(src.ratio / (candidate.w / candidate.h)));
  return (
    0.62 * (1 - intersection / Math.max(union, 1)) +
    0.28 * Math.min(chamfer * 5, 1) +
    0.1 * Math.min(aspect * 2, 1)
  );
}
async function source(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  if (
    bitmap.width * bitmap.height > 12e6 ||
    Math.max(bitmap.width, bitmap.height) > 6000
  )
    throw Error("La imagen supera el límite de resolución.");
  const scale = Math.min(1, 2200 / bitmap.width, 500 / bitmap.height),
    { c, x } = canvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
  x.fillStyle = "white";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const p = x.getImageData(0, 0, c.width, c.height).data,
    hist = new Float64Array(256),
    gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(
      0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2],
    );
    hist[gray[i]]++;
  }
  const quantile = (fraction: number) => {
    let s = 0;
    for (let i = 0; i < 256; i++) {
      s += hist[i];
      if (s >= gray.length * fraction) return i;
    }
    return 255;
  };
  const contrast = quantile(0.98) - quantile(0.02);
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * hist[i];
  let weight = 0,
    sum = 0,
    best = -1,
    threshold = 0;
  for (let i = 0; i < 256; i++) {
    weight += hist[i];
    sum += i * hist[i];
    if (weight === 0 || weight === gray.length) continue;
    const score =
      (total * weight - sum * gray.length) ** 2 /
      (weight * (gray.length - weight));
    if (score > best) {
      best = score;
      threshold = i;
    }
  }
  let border = 0,
    count = 0;
  for (let y = 0; y < c.height; y++)
    for (let xx = 0; xx < c.width; xx++)
      if (y === 0 || xx === 0 || y === c.height - 1 || xx === c.width - 1) {
        border += gray[y * c.width + xx] <= threshold ? 1 : 0;
        count++;
      }
  const inverted = border / count > 0.5,
    data = new Uint8Array(gray.length);
  for (let i = 0; i < data.length; i++)
    data[i] = gray[i] <= threshold !== inverted ? 1 : 0;
  const clean = data.slice();
  for (let y = 0; y < c.height; y++)
    for (let xx = 0; xx < c.width; xx++) {
      const i = y * c.width + xx;
      if (
        data[i] &&
        !(
          (xx > 0 && data[i - 1]) ||
          (xx < c.width - 1 && data[i + 1]) ||
          (y > 0 && data[i - c.width]) ||
          (y < c.height - 1 && data[i + c.width])
        )
      )
        clean[i] = 0;
    }
  const m = trim({ w: c.width, h: c.height, data: clean });
  if (m.h < 6 || m.w < 8)
    throw Error("El recorte no contiene una línea de texto legible.");
  const bands = lineBands(m);
  return {
    m,
    quality: {
      inkHeight: m.h,
      contrast,
      possibleMultiline: bands.length > 1,
      detectedLines: bands.length,
    },
  };
}
const files = new Map<string, Promise<ArrayBuffer>>();
async function face(entry: Entry, optical: number | null) {
  const url = "/fonts/" + encodeURIComponent(entry.file).replaceAll("%2C", ",");
  if (!files.has(url))
    files.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok)
          throw Error("No se ha podido cargar una fuente del catálogo.");
        return r.arrayBuffer();
      }),
    );
  const family =
    "fontea_" + entry.id.replace(/-/g, "_") + "_" + (optical ?? "default");
  const axes = { ...entry.axes };
  if (optical !== null) axes.opsz = optical;
  const ff = new FontFace(family, await files.get(url)!, {
    weight: String(entry.weight),
    style: entry.italic ? "italic" : "normal",
    variationSettings:
      Object.entries(axes)
        .map(([k, v]) => `"${k}" ${v}`)
        .join(",") || "normal",
  } as FontFaceDescriptors & { variationSettings: string });
  await ff.load();
  scope.fonts.add(ff);
  return { ff, family };
}
function render(
  entry: Entry,
  text: string,
  family: string,
  tracking: number,
): Mask {
  let { c, x } = canvas(1, 1);
  const font = `${entry.italic ? "italic " : ""}${entry.weight} 96px "${family}"`;
  x.font = font;
  const w = Math.ceil(
    x.measureText(text).width + Math.max(0, tracking) * (text.length - 1) + 50,
  );
  if (w > 18000)
    throw Error("El texto es demasiado largo. Recorta una línea más corta.");
  ({ c, x } = canvas(w, 300));
  x.fillStyle = "white";
  x.fillRect(0, 0, w, 300);
  x.fillStyle = "black";
  x.font = font;
  x.textBaseline = "top";
  if (tracking === 0) x.fillText(text, 20, 30);
  else
    for (let i = 0; i < text.length; i++)
      x.fillText(
        text[i],
        20 + x.measureText(text.slice(0, i)).width + i * tracking,
        30,
      );
  const p = x.getImageData(0, 0, w, 300).data,
    data = new Uint8Array(w * 300);
  for (let i = 0; i < data.length; i++) data[i] = p[i * 4] < 160 ? 1 : 0;
  return trim({ w, h: 300, data });
}
async function png(m: Mask, color?: number[]) {
  const blob = await drawMask(m, color).convertToBlob({ type: "image/png" });
  const a = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < a.length; i += 8192)
    s += String.fromCharCode(...a.subarray(i, i + 8192));
  return "data:image/png;base64," + btoa(s);
}
async function identify(
  blob: Blob,
  text: string,
  catalog: Catalog,
  lineCount = 0,
) {
  const explicitLines = /[\r\n]/.test(text);
  text = text.replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > 80)
    throw Error("Escribe entre 3 y 80 caracteres de una sola línea.");
  if ([...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 0x024f))
    throw Error("Esta versión compara texto del alfabeto latino.");
  if (!scope.fonts)
    throw Error(
      "Tu navegador no permite cargar fuentes en el analizador. Usa un navegador actualizado.",
    );
  const { m, quality } = await source(blob),
    src = prepared(m),
    reasons: string[] = [];
  if (explicitLines || lineCount > 1 || quality.possibleMultiline)
    return {
      status: "needs_crop",
      candidates: [],
      alternatives: [],
      text,
      quality,
      reasons: [
        "Se detectan varias líneas. Selecciona una sola línea y una sola tipografía. Analiza cada fragmento por separado.",
      ],
      normalizedSource: await png(src.normalized, [0, 144, 155]),
      catalog: {
        name: catalog.name,
        families: new Set(catalog.fonts.map((f) => f.family)).size,
        variants: catalog.fonts.length,
        revision: catalog.revision,
      },
      search: { shortlistedVariants: 0, comparedVariants: 0 },
      method: "No se ha comparado: el recorte requiere una sola línea.",
    };
  if (new Set([...text.toLowerCase()].filter((c) => /\p{L}/u.test(c))).size < 5)
    reasons.push(
      "Hay pocas letras diferentes. Añade una muestra con al menos cinco letras distintas.",
    );
  if (quality.inkHeight < 24)
    reasons.push(
      "Las letras tienen poca resolución. Sube un recorte de mayor tamaño.",
    );
  if (quality.contrast < 50)
    reasons.push("El contraste es bajo. Prueba una imagen con fondo uniforme.");
  if (quality.possibleMultiline)
    reasons.push(
      "Puede haber varias líneas o ruido. Recorta una sola línea y una sola fuente.",
    );
  const ranked: {
    d: number;
    entry: Entry;
    rendered: Mask;
    tracking: number;
  }[] = [];
  const search = reasons.length
    ? {
        ids: [],
        indexedVariants: catalog.fonts.length,
        indexBytes: 0,
        coarseMs: 0,
      }
    : await retrieve(m, text, catalog.fonts, catalog.index);
  const selected = new Set(search.ids);
  for (const entry of catalog.fonts) {
    if (!selected.has(entry.id)) continue;
    let best:
      { d: number; entry: Entry; rendered: Mask; tracking: number } | undefined;
    for (const optical of entry.opticalSizes ?? [null]) {
      const { ff, family } = await face(entry, optical);
      try {
        for (const tracking of [-0.8, 0, 0.8]) {
          const rendered = render(entry, text, family, tracking),
            d = distance(src, rendered);
          if (!best || d < best.d) best = { d, entry, rendered, tracking };
        }
      } finally {
        scope.fonts.delete(ff);
      }
    }
    if (best) ranked.push(best);
  }
  ranked.sort((a, b) => a.d - b.d);
  let weightChecks = 0;
  if (!reasons.length && ranked[0] && ranked[0].d <= 0.155) {
    const best = ranked[0],
      entry = best.entry;
    const supportsIntermediate =
      entry.axes.wght !== undefined &&
      [400, 700].every((weight) =>
        catalog.fonts.some((f) => f.file === entry.file && f.weight === weight),
      );
    if (supportsIntermediate) {
      let probeDistance = Infinity;
      for (const weight of [450, 500, 550, 600, 650]) {
        const probe = {
          ...entry,
          id: entry.id + "_probe" + weight,
          weight,
          axes: { ...entry.axes, wght: weight },
        };
        weightChecks++;
        for (const optical of entry.opticalSizes ?? [null]) {
          const { ff, family } = await face(probe, optical);
          try {
            for (const tracking of [-0.8, 0, 0.8])
              probeDistance = Math.min(
                probeDistance,
                distance(src, render(probe, text, family, tracking)),
              );
          } finally {
            scope.fonts.delete(ff);
          }
        }
      }
      if (probeDistance + 0.025 < best.d)
        reasons.push(
          "El mismo archivo encaja mejor con un peso no incluido entre las variantes del catálogo. No hay evidencia suficiente para proponer la variante original; se muestran solo alternativas.",
        );
    }
  }
  const accepted = !reasons.length && ranked.length > 0 && ranked[0].d <= 0.155,
    candidates: Record<string, unknown>[] = [],
    alternatives: Record<string, unknown>[] = [];
  for (const row of ranked.slice(0, 6)) {
    if (row.d > 0.2) continue;
    const { file, axes, sha256, sourceUrl, licenseFile, ...pub } = row.entry;
    const f = {
      ...pub,
      distance: Math.round(row.d * 1e4) / 1e4,
      preview: await png(row.rendered),
      overlay: await png(
        normalize(row.rendered, src.normalized.w),
        [196, 30, 132],
      ),
      downloadUrl: "/fonts/" + encodeURIComponent(file).replaceAll("%2C", ","),
      localLicenseUrl: "/licenses/" + encodeURIComponent(licenseFile),
      tracking: row.tracking,
    };
    if (
      accepted &&
      row.d <= 0.155 &&
      row.d - ranked[0].d < 0.025 &&
      candidates.length < 3
    )
      candidates.push(f);
    else if (
      Math.abs(Math.log(m.w / m.h / (row.rendered.w / row.rendered.h))) <=
      Math.log(1.2)
    )
      alternatives.push(f);
  }
  if (!accepted)
    reasons.push(
      "No hay evidencia suficiente para proponer una fuente original dentro de este catálogo. La fuente puede estar fuera, o la muestra puede estar alterada.",
    );
  if (candidates.length > 1)
    reasons.push(
      "Varias variantes o familias ofrecen resultados cercanos. Una muestra con otras letras puede ayudar a distinguirlas.",
    );
  reasons.push(
    "El resultado solo compara las fuentes del catálogo. No demuestra una identidad exacta ni descarta fuentes externas indistinguibles.",
  );
  return {
    status: candidates.length ? "candidates" : "unidentified",
    candidates,
    alternatives: alternatives.slice(0, 4),
    reasons,
    quality,
    text,
    normalizedSource: await png(src.normalized, [0, 144, 155]),
    search: {
      variableWeightChecks: weightChecks,
      top1: ranked[0]
        ? {
            id: ranked[0].entry.id,
            family: ranked[0].entry.family,
            distance: ranked[0].d,
          }
        : null,
      indexedVariants: search.indexedVariants,
      shortlistedVariants: selected.size,
      comparedVariants: ranked.length,
      indexBytes: search.indexBytes,
      coarseMs: search.coarseMs,
      fontFiles: files.size,
      selectedIds: search.ids,
    },
    catalog: {
      name: catalog.name,
      families: new Set(catalog.fonts.map((f) => f.family)).size,
      variants: catalog.fonts.length,
      revision: catalog.revision,
    },
    method:
      "Índice de glifos y comparación detallada de hasta 32 variantes reales. Menor distancia indica más parecido, no probabilidad. Candidatas hasta 0,155; alternativas hasta 0,20 y proporciones compatibles. Se comprueban pesos variables intermedios para evitar proponer una variante no sustentada. La búsqueda inicial puede omitir una fuente.",
  };
}
async function compareOwn(
  blob: Blob,
  rawText: string,
  buffer: ArrayBuffer,
  requestedAxes: Record<string, number> = {},
  lineCount = 0,
) {
  if (!scope.fonts || typeof FontFace === "undefined")
    throw Error(
      "Este navegador no permite comparar archivos de fuente en el analizador. Usa un navegador actualizado.",
    );
  if (blob.size > 8 * 1024 * 1024) throw Error("El recorte supera los 8 MB.");
  const text = rawText.replace(/\s+/g, " ").trim();
  if (
    text.length < 3 ||
    text.length > 80 ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 0x024f)
  )
    throw Error(
      "Escribe entre 3 y 80 caracteres del alfabeto latino de una sola línea.",
    );
  const info = inspectLocalFont(buffer, text),
    { m, quality } = await source(blob),
    src = prepared(m);
  if (/[\r\n]/.test(rawText) || lineCount > 1 || quality.possibleMultiline)
    return {
      status: "needs_crop",
      info,
      axes: {},
      text,
      reasons: [
        "Se detectan varias líneas. Recorta una sola línea y una sola tipografía; compara cada fragmento por separado.",
      ],
    };
  const axes: Record<string, number> = {};
  for (const a of info.axes) {
    const value = requestedAxes[a.tag] ?? a.default;
    if (!Number.isFinite(value) || value < a.min || value > a.max)
      throw Error(
        "El valor de un eje variable está fuera del intervalo del archivo.",
      );
    axes[a.tag] = value;
  }
  const weight = axes.wght ?? info.weight,
    italic = axes.ital !== undefined ? axes.ital >= 0.5 : info.italic;
  const family = "fontea_private_file";
  const ff = new FontFace(family, buffer, {
    weight: String(weight),
    style: italic ? "italic" : "normal",
    variationSettings:
      Object.entries(axes)
        .map(([k, v]) => `"${k}" ${v}`)
        .join(",") || "normal",
  } as FontFaceDescriptors & { variationSettings: string });
  try {
    await ff.load();
  } catch {
    throw Error(
      "El navegador ha rechazado la fuente. Usa un archivo TTF u OTF válido, sin protección ni compresión WOFF.",
    );
  }
  scope.fonts.add(ff);
  try {
    let best: { d: number; rendered: Mask } | undefined;
    const entry = { weight, italic } as Entry;
    for (const tracking of [-0.8, 0, 0.8]) {
      const rendered = render(entry, text, family, tracking),
        d = distance(src, rendered);
      if (!best || d < best.d) best = { d, rendered };
    }
    const reasons: string[] = [];
    if (
      new Set([...text.toLowerCase()].filter((c) => /\p{L}/u.test(c))).size < 5
    )
      reasons.push("Hay pocas letras distintas: añade una muestra más larga.");
    if (quality.inkHeight < 24)
      reasons.push("Las letras tienen poca resolución.");
    if (quality.contrast < 50) reasons.push("El contraste es bajo.");
    const useful =
      !reasons.length &&
      best!.d <= 0.2 &&
      Math.abs(Math.log(m.w / m.h / (best!.rendered.w / best!.rendered.h))) <=
        Math.log(1.2);
    reasons.push(
      useful
        ? "El archivo ofrece un ajuste visual útil para comprobarlo. Esto no demuestra la identidad ni la variante original."
        : "No hay un ajuste visual suficiente o la muestra no aporta evidencia suficiente. No se propone como coincidencia.",
    );
    reasons.push(
      "Se ha comparado únicamente tu archivo, con los ejes indicados. Los nombres y la versión son metadatos declarados por el archivo; no verifican su procedencia ni licencia.",
    );
    return {
      status: "compared",
      info,
      axes,
      text,
      useful,
      distance: Math.round(best!.d * 1e4) / 1e4,
      reasons,
      preview: await png(best!.rendered),
      overlay: await png(
        normalize(best!.rendered, src.normalized.w),
        [196, 30, 132],
      ),
      normalizedSource: await png(src.normalized, [0, 144, 155]),
    };
  } finally {
    scope.fonts.delete(ff);
  }
}
async function prepareExternal(blob: Blob, rawText: string, lineCount = 0) {
  if (blob.size > 8 * 1024 * 1024) throw Error("El recorte supera los 8 MB.");
  const text = rawText.replace(/\s+/g, " ").trim();
  if (
    text.length < 3 ||
    text.length > 80 ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 0x024f)
  )
    throw Error(
      "Revisa la transcripción de una sola línea, entre 3 y 80 caracteres latinos.",
    );
  const { m, quality } = await source(blob);
  if (/[\r\n]/.test(rawText) || lineCount > 1 || quality.possibleMultiline)
    return {
      status: "needs_crop",
      message:
        "Selecciona una sola línea y una sola tipografía antes de enviarla al proveedor.",
    };
  if (
    new Set([...text.toLowerCase()].filter((c) => /\p{L}/u.test(c))).size < 5 ||
    quality.inkHeight < 24 ||
    quality.contrast < 50
  )
    throw Error(
      "La muestra no aporta suficientes letras, resolución o contraste. No se ha enviado al proveedor.",
    );
  // Send only the cropped glyph mask with margin, never the complete design or a font file.
  const scale = Math.min(1, 2100 / m.w, 550 / m.h),
    w = Math.round(m.w * scale),
    h = Math.round(m.h * scale),
    { c, x } = canvas(w + 32, h + 32);
  x.fillStyle = "white";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(drawMask(m), 16, 16, w, h);
  const output = await c.convertToBlob({ type: "image/png" }),
    bytes = new Uint8Array(await output.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024)
    throw Error(
      "El recorte preparado supera los 2 MB. Usa una muestra más corta.",
    );
  let base64 = "";
  for (let i = 0; i < bytes.length; i += 8192)
    base64 += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { status: "ready", image: btoa(base64), text, lineCount: 1 };
}
scope.onmessage = async (e) => {
  try {
    const result =
      e.data.operation === "prepare-external"
        ? await prepareExternal(e.data.image, e.data.text, e.data.lineCount)
        : e.data.operation === "local-font"
          ? await compareOwn(
              e.data.image,
              e.data.text,
              e.data.font,
              e.data.axes,
              e.data.lineCount,
            )
          : await identify(
              e.data.image,
              e.data.text,
              e.data.catalog,
              e.data.lineCount,
            );
    scope.postMessage({ ok: true, result });
  } catch (error) {
    scope.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se ha podido completar el análisis.",
    });
  }
};
