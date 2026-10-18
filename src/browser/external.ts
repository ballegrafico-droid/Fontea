import type { ExternalCandidate } from "../../server/providers/whatfontis";
export type ExternalStatus = {
  ready: boolean;
  provider: string;
  code: string;
  message: string;
  dailyLimit?: number;
};
export type ExternalResult = {
  status: "external_candidates" | "external_unidentified";
  provider: string;
  candidates: ExternalCandidate[];
  message: string;
  method: string;
  quota?: { used: number; limit: number };
};
export async function getExternalStatus(
  signal: AbortSignal,
): Promise<ExternalStatus> {
  const r = await fetch("/api/external/status", { signal, cache: "no-store" });
  if (!r.ok || !r.headers.get("content-type")?.includes("application/json"))
    return {
      ready: false,
      provider: "WhatFontIs",
      code: "backend_missing",
      message:
        "Esta vista aún no tiene disponible el conector externo. No se ha enviado ninguna imagen.",
    };
  return r.json();
}
export async function searchExternal(
  image: Blob,
  text: string,
  lineCount: number,
  signal: AbortSignal,
): Promise<ExternalResult | { status: "needs_crop"; message: string }> {
  const prepared = await new Promise<{
    status: string;
    message?: string;
    image?: string;
    text?: string;
    lineCount?: number;
  }>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelado", "AbortError"));
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
      reject(new DOMException("Cancelado", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        Error(
          "No se ha podido preparar el recorte a tiempo. No se ha enviado.",
        ),
      );
    }, 15000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      cleanup();
      e.data.ok ? resolve(e.data.result) : reject(Error(e.data.error));
    };
    worker.onerror = () => {
      cleanup();
      reject(Error("No se ha podido preparar el recorte en tu navegador."));
    };
    worker.postMessage({
      operation: "prepare-external",
      image,
      text,
      lineCount,
    });
  });
  if (prepared.status === "needs_crop")
    return { status: "needs_crop", message: prepared.message! };
  const r = await fetch("/api/external/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...prepared, consent: true }),
    signal,
  });
  let answer;
  try {
    answer = await r.json();
  } catch {
    throw Error("El conector externo no ha devuelto una respuesta válida.");
  }
  if (!r.ok)
    throw Error(
      answer.error ?? "La búsqueda externa no se ha podido completar.",
    );
  return answer;
}
