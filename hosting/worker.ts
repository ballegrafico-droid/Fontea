import {
  externalConfiguration,
  validateExternalBody,
  identifyExternal,
  ExternalError,
  type ExternalConfig,
} from "../server/providers/whatfontis";
import { checkExternalPng } from "../server/providers/png-check";
type Prepared = {
  bind(...v: unknown[]): Prepared;
  first<T>(): Promise<T | null>;
};
type Env = ExternalConfig & {
  ASSETS: { fetch(r: Request): Promise<Response> };
  DB?: { prepare(sql: string): Prepared };
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
let busy = false;
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const config = externalConfiguration(env),
      ready = config.ready && !!env.DB;
    if (url.pathname === "/api/external/status" && request.method === "GET")
      return json({
        provider: "WhatFontIs",
        ...config,
        ...(config.ready && !env.DB
          ? {
              code: "quota_unavailable",
              message:
                "Falta el control persistente de cuota. No se enviará la imagen.",
            }
          : {}),
        ready,
      });
    if (url.pathname !== "/api/external/identify")
      return json({ error: "Ruta no disponible." }, 404);
    if (request.method !== "POST")
      return json({ error: "Utiliza el botón de búsqueda de Fontea." }, 405);
    if (!ready)
      return json(
        {
          error: config.ready
            ? "Falta el control persistente de cuota."
            : config.message,
          code: config.code,
        },
        503,
      );
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin)
    )
      return json({ error: "La búsqueda debe iniciarse desde Fontea." }, 403);
    if (busy)
      return json(
        {
          error: "Hay otra búsqueda externa en curso. Espera a que termine.",
          code: "external_busy",
        },
        503,
      );
    busy = true;
    try {
      const length = Number(request.headers.get("content-length"));
      if (length > 3 * 1024 * 1024)
        throw new ExternalError(
          413,
          "invalid_image",
          "El recorte supera el límite permitido.",
        );
      const reader = request.body?.getReader();
      if (!reader)
        throw new ExternalError(400, "invalid_request", "Falta el recorte.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 3 * 1024 * 1024) {
          await reader.cancel();
          throw new ExternalError(
            413,
            "invalid_image",
            "El recorte supera el límite permitido.",
          );
        }
        chunks.push(r.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new ExternalError(
          400,
          "invalid_request",
          "La petición no es válida.",
        );
      }
      const input = validateExternalBody(body);
      await checkExternalPng(input.image);
      if (request.signal.aborted)
        throw new ExternalError(
          499,
          "cancelled",
          "Búsqueda cancelada antes del envío.",
        );
      const keyHash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(env.WFI_API_KEY!),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const day = new Date().toISOString().slice(0, 10);
      const quota = await env
        .DB!.prepare(
          "INSERT INTO external_usage (day,key_hash,used) VALUES (?,?,1) ON CONFLICT(day,key_hash) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used",
        )
        .bind(day, keyHash, config.dailyLimit)
        .first<{ used: number }>();
      if (!quota)
        throw new ExternalError(
          429,
          "local_quota",
          "Se ha alcanzado el límite diario de Fontea para búsquedas externas. No se compran créditos.",
        );
      const answer = await identifyExternal(
        input.image,
        env.WFI_API_KEY!,
        request.signal,
      );
      return json({
        ...answer,
        quota: { used: quota.used, limit: config.dailyLimit },
      });
    } catch (e) {
      return json(
        {
          error:
            e instanceof ExternalError
              ? e.message
              : "No se puede completar la búsqueda externa. No se han generado resultados.",
          code: e instanceof ExternalError ? e.code : "external_unavailable",
        },
        e instanceof ExternalError ? e.status : 503,
      );
    } finally {
      busy = false;
    }
  },
};
