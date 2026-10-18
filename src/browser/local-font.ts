import type { LocalFontInfo } from "./local-font-info";
export type LocalComparison = {
  status: "needs_crop" | "compared";
  text: string;
  reasons: string[];
  info: LocalFontInfo;
  axes: Record<string, number>;
  distance?: number;
  useful?: boolean;
  preview?: string;
  overlay?: string;
  normalizedSource?: string;
};
export function compareLocalFont(
  image: Blob,
  text: string,
  font: ArrayBuffer,
  axes: Record<string, number>,
  signal: AbortSignal,
  lineCount = 0,
): Promise<LocalComparison> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Operación cancelada.", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./matcher.worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Operación cancelada.", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        Error(
          "La comparación ha tardado demasiado. Prueba una muestra más corta.",
        ),
      );
    }, 30000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      cleanup();
      e.data.ok ? resolve(e.data.result) : reject(Error(e.data.error));
    };
    worker.onerror = () => {
      cleanup();
      reject(Error("No se puede comparar este archivo en tu navegador."));
    };
    // Structured clone stays within this browser. Never fetch, FormData, storage or a server.
    worker.postMessage({
      operation: "local-font",
      image,
      text,
      font,
      axes,
      lineCount,
    });
  });
}
