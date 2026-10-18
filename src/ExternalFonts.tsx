import { useEffect, useState } from "react";
import {
  getExternalStatus,
  type ExternalStatus,
  type ExternalResult,
} from "./browser/external";
import CommercialDirectory from "./CommercialDirectory";
export default function ExternalFonts({
  cropUrl,
  image,
  text,
  blocked,
  busy,
  searching,
  search,
}: {
  cropUrl: string;
  image?: Blob;
  text: string;
  blocked: boolean;
  busy: boolean;
  searching: boolean;
  search: () => Promise<ExternalResult | undefined>;
}) {
  const [status, setStatus] = useState<ExternalStatus>(),
    [consent, setConsent] = useState(false),
    [result, setResult] = useState<ExternalResult>(),
    [error, setError] = useState("");
  useEffect(() => {
    const stop = new AbortController();
    getExternalStatus(stop.signal)
      .then(setStatus)
      .catch(() => {
        if (!stop.signal.aborted)
          setError("No se ha podido comprobar la conexión externa.");
      });
    return () => stop.abort();
  }, []);
  useEffect(() => {
    setResult(undefined);
    setConsent(false);
  }, [cropUrl, text]);
  return (
    <section
      className="font-tool external-tool"
      id="external-search"
      aria-label="Reconocimiento externo"
    >
      <p className="card-kicker">
        AMPLIAR LA BÚSQUEDA · FUENTES GRATUITAS Y COMERCIALES
      </p>
      <h3>Busca fuera del catálogo de Fontea.</h3>
      <p>
        Un texto bien leído no garantiza que su fuente esté entre nuestras 117
        familias y 203 variantes. El conector de WhatFontIs consulta su catálogo
        remoto; sus candidatos se muestran aquí, separados de las comparaciones
        locales.
      </p>
      {!status ? (
        <p role="status">Comprobando disponibilidad del motor externo…</p>
      ) : !status.ready ? (
        <div className="external-setup" role="status">
          <strong>Conector implementado, pendiente de activación.</strong>
          <p>{status.message}</p>
          <p>
            No basta con volver a recortar: para consultar fuentes comerciales
            desde esta aplicación falta la clave privada y el acceso autorizado
            del proveedor. El catálogo local sigue funcionando.
          </p>
        </div>
      ) : (
        <p className="external-ready">
          Conector configurado · límite de Fontea: {status.dailyLimit} consultas
          al día.
        </p>
      )}
      {image && (
        <>
          <label className="external-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || !status?.ready || blocked}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Enviar únicamente este recorte de texto a WhatFontIs para buscar
            fuentes gratuitas y comerciales. Se aplican sus condiciones y
            privacidad.
          </label>
          <button
            className="button primary"
            disabled={
              busy ||
              blocked ||
              !status?.ready ||
              !consent ||
              text.trim().length < 3
            }
            onClick={async () => {
              setResult(undefined);
              setError("");
              const r = await search();
              if (r) setResult(r);
            }}
          >
            Buscar fuentes externas
          </button>
        </>
      )}
      {blocked && image && (
        <p className="variant-caution">
          Selecciona una sola línea y una sola tipografía antes de enviarla.
        </p>
      )}
      {searching && (
        <p role="status">
          La búsqueda externa utiliza el recorte preparado; no se envían
          archivos de fuentes.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div
          className="external-results"
          aria-label="Resultados del proveedor externo"
        >
          <h3>
            {result.candidates.length
              ? "Candidatos externos sin verificar"
              : "El proveedor no ha encontrado candidatos."}
          </h3>
          <p>{result.message}</p>
          <p>
            La variante exacta no está verificada. Estas fichas no incluyen un
            render local de tu texto; puedes contrastar un archivo obtenido
            legalmente con la herramienta privada.
          </p>
          {result.candidates.map((c) => (
            <article className="external-candidate" key={c.detailUrl}>
              <p className="card-kicker">
                WHATFONTIS · POSICIÓN {c.rank} DEL PROVEEDOR
              </p>
              <h4>{c.displayName}</h4>
              <p>
                {c.reportedType === "Commercial"
                  ? "Comercial según el proveedor"
                  : c.reportedType === "Free"
                    ? "Gratuita según el proveedor; licencia sin verificar"
                    : "Tipo de licencia no indicado"}{" "}
                · {c.reportedVendor}
              </p>
              <p>
                Nombre propuesto por el proveedor; familia, variante exacta,
                identidad y licencia sin verificar. No se distribuye el archivo.
              </p>
              <a href={c.detailUrl} target="_blank" rel="noreferrer">
                Ver ficha en WhatFontIs ↗
              </a>
              <p>
                Esta ficha es del identificador. El enlace oficial de compra o
                descarga todavía no está verificado por Fontea.
              </p>
            </article>
          ))}
          <p>{result.method}</p>
          {result.quota && (
            <p>
              Cuota de Fontea: {result.quota.used} de {result.quota.limit}{" "}
              intentos hoy. Los errores y cancelaciones después de enviar
              también pueden contar.
            </p>
          )}
        </div>
      )}
      <details className="external-activation">
        <summary>Activar el conector y consultar condiciones</summary>
        <p>
          El propietario debe configurar la clave en el servidor, nunca en este
          navegador. WhatFontIs ofrece acceso personal gratuito; para una
          aplicación comercial pide contactarles. La cuota de Fontea no mide el
          uso de esa cuenta en otros servicios.
        </p>
        <a
          href="https://www.whatfontis.com/API-identify-fonts-from-image.html"
          target="_blank"
          rel="noreferrer"
        >
          API oficial y condiciones ↗
        </a>
        <p>
          Mientras se configura, puedes guardar tu recorte y usar su web
          manualmente. Esta acción no importa resultados en Fontea.
        </p>
        <div className="local-actions">
          {cropUrl && !blocked && !busy && (
            <a href={cropUrl} download="fontea-recorte.png">
              Guardar recorte de una línea
            </a>
          )}
          <a
            href="https://www.whatfontis.com/"
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatFontIs ↗
          </a>
        </div>
      </details>
      <CommercialDirectory />
    </section>
  );
}
