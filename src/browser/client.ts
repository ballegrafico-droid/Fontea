import { createWorker, OEM, PSM } from "tesseract.js";
export const browserEngine = import.meta.env.VITE_ENGINE_TARGET === "browser";
export async function fetchCatalog() {
  const r = await fetch(browserEngine ? "/catalog.json" : "/api/catalog");
  if (!r.ok) throw Error("No se ha podido cargar el catálogo.");
  return r.json();
}
let activeJob: symbol | undefined;
async function preparedOCR(image: Blob) {
  const b = await createImageBitmap(image),
    scale = Math.min(1, 2200 / b.width, 500 / b.height);
  const c = new OffscreenCanvas(
      Math.max(1, Math.round(b.width * scale)),
      Math.max(1, Math.round(b.height * scale)),
    ),
    x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw Error("No se puede preparar la imagen en este navegador.");
  x.fillStyle = "white";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(b, 0, 0, c.width, c.height);
  b.close();
  const p = x.getImageData(0, 0, c.width, c.height),
    gray = new Uint8Array(c.width * c.height),
    border: number[] = [];
  for (let y = 0; y < c.height; y++)
    for (let xx = 0; xx < c.width; xx++) {
      const i = y * c.width + xx;
      gray[i] = Math.round(
        0.299 * p.data[i * 4] +
          0.587 * p.data[i * 4 + 1] +
          0.114 * p.data[i * 4 + 2],
      );
      if (y === 0 || xx === 0 || y === c.height - 1 || xx === c.width - 1)
        border.push(gray[i]);
    }
  border.sort((a, b) => a - b);
  let bg = border[Math.floor(border.length / 2)];
  if (bg < 128) {
    for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
    bg = 255 - bg;
  }
  let l = c.width,
    t = c.height,
    r = -1,
    bot = -1;
  for (let y = 0; y < c.height; y++)
    for (let xx = 0; xx < c.width; xx++) {
      const i = y * c.width + xx;
      p.data[i * 4] = p.data[i * 4 + 1] = p.data[i * 4 + 2] = gray[i];
      p.data[i * 4 + 3] = 255;
      if (gray[i] < Math.max(0, bg - 30)) {
        l = Math.min(l, xx);
        r = Math.max(r, xx);
        t = Math.min(t, y);
        bot = Math.max(bot, y);
      }
    }
  x.putImageData(p, 0, 0);
  if (r < 0) {
    l = t = 0;
    r = c.width - 1;
    bot = c.height - 1;
  }
  const w = r - l + 1,
    h = bot - t + 1,
    f = Math.min(3, Math.max(1, 72 / h), 3000 / w, 500 / h),
    out = new OffscreenCanvas(Math.round(w * f) + 32, Math.round(h * f) + 32),
    ctx = out.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, l, t, w, h, 16, 16, out.width - 32, out.height - 32);
  return out.convertToBlob({ type: "image/png" });
}
export async function browserRequest<T>(
  operation: string,
  image: Blob,
  text: string,
  signal: AbortSignal,
  language = "spa+eng",
): Promise<T> {
  if (activeJob)
    throw Error(
      "El analizador está ocupado. Espera unos segundos e inténtalo de nuevo.",
    );
  if (image.size > 8 * 1024 * 1024) throw Error("El recorte supera los 8 MB.");
  const job = Symbol("analysis");
  activeJob = job;
  const release = () => {
    if (activeJob === job) activeJob = undefined;
  };
  let stopReason: Error | undefined;
  const checkStopped = () => {
    if (stopReason) throw stopReason;
    if (signal.aborted)
      throw new DOMException("Operación cancelada.", "AbortError");
  };
  let kill: () => void = () => {};
  let rejectAbort: (reason: unknown) => void = () => {};
  const abort = () => {
    stopReason = new DOMException("Operación cancelada.", "AbortError");
    kill();
    rejectAbort(stopReason);
  };
  signal.addEventListener("abort", abort, { once: true });
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const timer = setTimeout(() => {
    stopReason = Error(
      "El análisis ha tardado demasiado. Prueba un recorte más corto.",
    );
    kill();
    rejectAbort(stopReason);
  }, 90000);
  const task = (async () => {
    checkStopped();
    if (operation === "identify") {
      const catalog = await fetchCatalog();
      checkStopped();
      return new Promise<T>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Operación cancelada.", "AbortError"));
          return;
        }
        const worker = new Worker(
          new URL("./matcher.worker.ts", import.meta.url),
          { type: "module" },
        );
        kill = () => {
          worker.terminate();
          reject(new DOMException("Operación cancelada.", "AbortError"));
        };
        worker.onmessage = (e) => {
          worker.terminate();
          e.data.ok ? resolve(e.data.result) : reject(Error(e.data.error));
        };
        worker.onerror = () => {
          worker.terminate();
          reject(
            Error(
              "Tu navegador no ha podido iniciar el comparador. Actualízalo o prueba otro navegador.",
            ),
          );
        };
        worker.postMessage({ image, text, catalog });
      });
    }
    if (operation !== "ocr") throw Error("Operación no disponible.");
    if (!["spa+eng", "eng+spa"].includes(language))
      throw Error("Elige español o inglés como idioma prioritario.");
    const prepared = await preparedOCR(image);
    checkStopped();
    const worker = await createWorker(language, OEM.LSTM_ONLY, {
      workerPath: new URL("/ocr/worker.min.js", location.href).href,
      corePath: new URL("/ocr/core", location.href).href,
      langPath: new URL("/ocr/tessdata", location.href).href,
      gzip: false,
      workerBlobURL: false,
      cacheMethod: "none",
    });
    let terminated = false;
    const terminate = async () => {
      if (!terminated) {
        terminated = true;
        await worker.terminate();
      }
    };
    kill = () => {
      void terminate().finally(release);
    };
    try {
      checkStopped();
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const { data } = await worker.recognize(
        prepared,
        {},
        { text: true, tsv: true },
      );
      const lines = new Map<string, string[]>(),
        conf: number[] = [];
      for (const row of (data.tsv ?? "").split("\n").slice(1)) {
        const cells = row.split("\t");
        if (cells.length >= 12 && cells[0] === "5" && cells[11].trim()) {
          const key = cells.slice(1, 5).join("-");
          lines.set(key, [...(lines.get(key) ?? []), cells[11]]);
          conf.push(Number(cells[10]));
        }
      }
      return {
        text: [...lines.values()]
          .map((v) => v.join(" "))
          .join(" ")
          .slice(0, 100),
        lineCount: lines.size,
        needsReview: !conf.length || Math.min(...conf) < 65,
        message:
          "Revisa cada letra antes de comparar. El OCR no identifica la fuente.",
      } as T;
    } finally {
      await terminate();
    }
  })().finally(() => {
    release();
  });
  try {
    return await Promise.race([task, aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
