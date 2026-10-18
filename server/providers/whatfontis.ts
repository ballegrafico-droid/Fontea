// Official API 2.2 contract. No name inference, fallback candidates or font downloads.
export const PROVIDER_URL = "https://www.whatfontis.com/api2/";
export class ExternalError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type ExternalConfig = {
  WFI_API_KEY?: string;
  WFI_ACCESS?: string;
  WFI_DAILY_LIMIT?: string;
};
export type ExternalCandidate = {
  provider: "WhatFontIs";
  rank: number;
  displayName: string;
  detailUrl: string;
  reportedType: "Commercial" | "Free" | "Unknown";
  reportedVendor: string;
  license: "unverified";
};
export function externalConfiguration(env: ExternalConfig) {
  if (!env.WFI_API_KEY?.trim())
    return {
      ready: false,
      code: "missing_key",
      message:
        "Falta configurar una clave privada de WhatFontIs en el servidor. La búsqueda comercial no se ha ejecutado.",
    };
  if (
    !["personal-free", "commercial-authorized-free"].includes(
      env.WFI_ACCESS ?? "",
    )
  )
    return {
      ready: false,
      code: "missing_access",
      message:
        "Falta confirmar el acceso gratuito autorizado del proveedor para este uso. No se enviará ninguna imagen ni se consumirán créditos.",
    };
  const limit = Number(env.WFI_DAILY_LIMIT ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    return {
      ready: false,
      code: "invalid_limit",
      message: "Configura un límite de entre 1 y 50 consultas externas al día.",
    };
  return {
    ready: true,
    code: "ready",
    message:
      "Conector configurado; la clave se comprueba al realizar una consulta. Solo se envía el recorte al pulsar Buscar fuentes externas.",
    dailyLimit: limit,
  };
}
export function validateExternalBody(body: unknown) {
  if (!body || typeof body !== "object")
    throw new ExternalError(
      400,
      "invalid_request",
      "Falta el recorte de texto.",
    );
  const b = body as Record<string, unknown>;
  if (b.consent !== true)
    throw new ExternalError(
      400,
      "consent_required",
      "Confirma el envío de este recorte a WhatFontIs.",
    );
  const text = typeof b.text === "string" ? b.text : "";
  if (
    /[\r\n]/.test(text) ||
    typeof b.lineCount !== "number" ||
    !Number.isInteger(b.lineCount) ||
    b.lineCount < 0 ||
    b.lineCount > 100 ||
    b.lineCount > 1
  )
    throw new ExternalError(
      422,
      "needs_crop",
      "Selecciona una sola línea y una sola tipografía antes de buscar.",
    );
  if (
    text.length < 3 ||
    text.length > 80 ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 0x024f)
  )
    throw new ExternalError(
      422,
      "invalid_text",
      "Revisa el texto: entre 3 y 80 caracteres latinos de una sola línea.",
    );
  if (new Set([...text.toLowerCase()].filter((c) => /\p{L}/u.test(c))).size < 5)
    throw new ExternalError(
      422,
      "insufficient_letters",
      "La muestra necesita al menos cinco letras distintas.",
    );
  if (
    typeof b.image !== "string" ||
    b.image.length > 2_800_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(b.image)
  )
    throw new ExternalError(
      413,
      "invalid_image",
      "Usa un recorte PNG de hasta 2 MB.",
    );
  let decoded: string;
  try {
    decoded = atob(b.image);
  } catch {
    throw new ExternalError(
      422,
      "invalid_image",
      "El recorte no contiene un PNG válido.",
    );
  }
  if (!decoded.startsWith("\x89PNG\r\n\x1a\n") || decoded.length < 33)
    throw new ExternalError(
      422,
      "invalid_image",
      "El recorte debe ser un PNG válido.",
    );
  const data = Uint8Array.from(decoded.slice(0, 33), (c) => c.charCodeAt(0)),
    v = new DataView(data.buffer),
    w = v.getUint32(16),
    h = v.getUint32(20);
  if (
    decoded.length > 2 * 1024 * 1024 ||
    w < 12 ||
    h < 12 ||
    w > 2200 ||
    h > 600 ||
    w * h > 1_320_000
  )
    throw new ExternalError(
      413,
      "image_dimensions",
      "Usa un recorte de una línea de hasta 2200 × 600 píxeles.",
    );
  return { image: b.image, text, lineCount: b.lineCount };
}
function detailUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 1200) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      ["www.whatfontis.com", "whatfontis.com"].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      u.pathname.endsWith(".font")
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function parseExternalCandidates(data: unknown): ExternalCandidate[] {
  if (!Array.isArray(data))
    throw new ExternalError(
      502,
      "invalid_provider_response",
      "WhatFontIs ha devuelto una respuesta que no podemos verificar.",
    );
  if (data.length > 100)
    throw new ExternalError(
      502,
      "invalid_provider_response",
      "La respuesta del proveedor es demasiado grande.",
    );
  const rows: ExternalCandidate[] = [],
    seen = new Set<string>();
  for (let i = 0; i < data.length && rows.length < 20; i++) {
    const r = data[i];
    if (!r || typeof r !== "object") continue;
    const url = detailUrl(r.url);
    if (
      !url ||
      typeof r.title !== "string" ||
      !r.title.trim() ||
      r.title.length > 240 ||
      seen.has(url)
    )
      continue;
    seen.add(url);
    rows.push({
      provider: "WhatFontIs",
      rank: i + 1,
      displayName: r.title.trim(),
      detailUrl: url,
      reportedType:
        r.type === "Commercial" || r.type === "Free" ? r.type : "Unknown",
      reportedVendor:
        typeof r.site === "string" ? r.site.slice(0, 120) : "No indicado",
      license: "unverified",
    });
  }
  if (data.length && !rows.length)
    throw new ExternalError(
      502,
      "invalid_provider_response",
      "El proveedor no ha devuelto candidatos con fichas válidas.",
    );
  return rows;
}
export async function identifyExternal(
  image: string,
  key: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
) {
  const stop = AbortSignal.any([signal, AbortSignal.timeout(25000)]);
  try {
    const response = await request(PROVIDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        API_KEY: key,
        IMAGEBASE64: "1",
        urlimagebase64: image,
        FREEFONTS: "0",
        limit: "20",
        mode: "fast",
      }),
      signal: stop,
      redirect: "manual",
    });
    if (!response.ok) {
      if ([401, 403, 409].includes(response.status))
        throw new ExternalError(
          503,
          "provider_auth",
          "WhatFontIs ha rechazado la clave o sus permisos. No se han generado resultados.",
        );
      if ([402, 429].includes(response.status))
        throw new ExternalError(
          429,
          "provider_quota",
          "La cuota del proveedor está agotada. No se compran créditos ni se reintenta automáticamente.",
        );
      if ([422].includes(response.status))
        throw new ExternalError(
          422,
          "provider_no_text",
          "WhatFontIs no ha podido separar las letras de este recorte. Prueba otra muestra.",
        );
      throw new ExternalError(
        502,
        "provider_error",
        "WhatFontIs no está disponible. Puedes conservar el recorte y reintentarlo más tarde.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader)
      throw new ExternalError(
        502,
        "invalid_provider_response",
        "El proveedor ha devuelto una respuesta vacía.",
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > 512 * 1024) {
        await reader.cancel();
        throw new ExternalError(
          502,
          "provider_response_limit",
          "La respuesta del proveedor supera el límite permitido.",
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
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ExternalError(
        502,
        "invalid_provider_response",
        "WhatFontIs no ha devuelto resultados válidos.",
      );
    }
    return {
      status:
        data instanceof Array && data.length
          ? "external_candidates"
          : "external_unidentified",
      provider: "WhatFontIs",
      candidates: parseExternalCandidates(data),
      identity: "unverified",
      message:
        "Candidatos recuperados del proveedor, sin verificación visual local ni garantía de identidad. El orden del proveedor no es una probabilidad.",
      method:
        "WhatFontIs API 2.2 · fast · fuentes gratuitas y comerciales. No se han descargado ni redistribuido archivos tipográficos.",
      textHintSent: false,
    };
  } catch (error) {
    if (error instanceof ExternalError) throw error;
    if (signal.aborted)
      throw new ExternalError(
        499,
        "cancelled",
        "Búsqueda externa cancelada. Una consulta ya enviada puede contar en la cuota.",
      );
    if (stop.aborted)
      throw new ExternalError(
        504,
        "provider_timeout",
        "No se ha recibido respuesta del proveedor a tiempo. No se reintenta automáticamente ni se muestran resultados inventados.",
      );
    throw new ExternalError(
      502,
      "provider_connection",
      "No se puede conectar con WhatFontIs. No se reintenta automáticamente ni se muestran resultados inventados.",
    );
  }
}
