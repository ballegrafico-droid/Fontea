import { useEffect, useState } from "react";
import {
  inspectLocalFont,
  MAX_FONT_BYTES,
  type LocalFontInfo,
} from "./browser/local-font-info";
import type { LocalComparison } from "./browser/local-font";

type Props = {
  text: string;
  disabled: boolean;
  blocked: boolean;
  compare: (
    buffer: ArrayBuffer,
    axes: Record<string, number>,
  ) => Promise<LocalComparison | undefined>;
};
export default function LocalFontPanel({
  text,
  disabled,
  blocked,
  compare,
}: Props) {
  const [font, setFont] = useState<{
    buffer: ArrayBuffer;
    info: LocalFontInfo;
    filename: string;
  }>();
  const [axes, setAxes] = useState<Record<string, number>>({});
  const [result, setResult] = useState<LocalComparison>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    setResult(undefined);
  }, [text]);
  return (
    <details className="font-tool" id="own-font-tool">
      <summary>¿Tienes el archivo? Compara tu propia fuente</summary>
      <p>
        Abre un TTF u OTF que tengas permiso para usar. Se procesa solo en este
        navegador, también en la versión con servidor: no se sube, guarda ni
        incorpora al catálogo.
      </p>
      <label className="font-file-label">
        Archivo de fuente · máximo 8 MB
        <input
          type="file"
          accept=".ttf,.otf"
          aria-label="Elegir archivo de fuente propio"
          disabled={disabled || loading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            setFont(undefined);
            setResult(undefined);
            setError("");
            setAxes({});
            if (!file) return;
            setLoading(true);
            try {
              if (file.size > MAX_FONT_BYTES)
                throw Error(
                  "La fuente supera los 8 MB. Usa un archivo TTF u OTF de menor tamaño.",
                );
              const buffer = await file.arrayBuffer(),
                info = inspectLocalFont(buffer);
              setFont({ buffer, info, filename: file.name });
              setAxes(
                Object.fromEntries(info.axes.map((a) => [a.tag, a.default])),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        />
      </label>
      {font && (
        <>
          <p role="status">Archivo abierto en esta sesión: {font.filename}</p>
          <dl className="font-metadata">
            <div>
              <dt>Familia declarada</dt>
              <dd>{font.info.family}</dd>
            </div>
            <div>
              <dt>Estilo declarado</dt>
              <dd>
                {font.info.style} · peso {font.info.weight}
                {font.info.italic ? " · cursiva" : ""}
              </dd>
            </div>
            <div>
              <dt>Versión</dt>
              <dd>{font.info.version || "No declarada"}</dd>
            </div>
            <div>
              <dt>Nombre PostScript</dt>
              <dd>{font.info.postscriptName || "No declarado"}</dd>
            </div>
          </dl>
          {font.info.axes.length > 0 && (
            <fieldset className="font-axes">
              <legend>Ejes variables del archivo</legend>
              {font.info.axes.map((a) => (
                <label key={a.tag}>
                  {a.tag} ({a.min}–{a.max})
                  <input
                    type="number"
                    aria-label={`Eje ${a.tag}`}
                    min={a.min}
                    max={a.max}
                    step="any"
                    value={axes[a.tag]}
                    disabled={disabled}
                    onChange={(e) => {
                      setAxes({ ...axes, [a.tag]: e.target.valueAsNumber });
                      setResult(undefined);
                    }}
                  />
                </label>
              ))}
            </fieldset>
          )}
          <div className="local-actions">
            <button
              className="button primary"
              disabled={
                disabled ||
                blocked ||
                loading ||
                Object.values(axes).some((v) => !Number.isFinite(v))
              }
              onClick={async () => {
                setError("");
                setResult(undefined);
                const r = await compare(font.buffer, axes);
                if (r) setResult(r);
              }}
            >
              Comparar con mi archivo
            </button>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => {
                setFont(undefined);
                setResult(undefined);
                setAxes({});
                setError("");
              }}
            >
              Retirar archivo de esta sesión
            </button>
          </div>
        </>
      )}
      {blocked && (
        <p className="variant-caution">
          Selecciona una sola línea antes de comparar. Una imagen puede mezclar
          varias fuentes.
        </p>
      )}
      {error && (
        <p role="alert" className="local-error">
          {error}
        </p>
      )}
      {result?.status === "compared" && (
        <article
          className="local-comparison"
          aria-label="Resultado de comparación privada"
        >
          <div className="candidate-top">
            <div>
              <p className="card-kicker">COMPROBACIÓN PRIVADA · TU ARCHIVO</p>
              <h3>{result.info.family}</h3>
              <span className="variant">
                {result.info.style}
                {Object.keys(result.axes).length
                  ? " · " +
                    Object.entries(result.axes)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")
                  : ""}
              </span>
            </div>
            <span className="distance">
              d {result.distance!.toFixed(3).replace(".", ",")}
            </span>
          </div>
          <p>
            <strong>
              {result.useful
                ? "Ajuste visual útil; identidad sin confirmar."
                : "Sin ajuste suficiente para proponer una coincidencia."}
            </strong>
          </p>
          <div className="render-sample">
            <img
              src={result.preview}
              alt={`${result.text}, renderizado con tu archivo ${result.info.family}`}
            />
            <span>RENDER REAL DE TU ARCHIVO</span>
          </div>
          <button
            className="text-button overlay-toggle"
            onClick={() => setOverlay(!overlay)}
            aria-expanded={overlay}
          >
            {overlay ? "Ocultar" : "Comparar"} contornos de mi archivo
          </button>
          {overlay && (
            <div className="overlay-panel">
              <div className="overlay-images">
                <img
                  src={result.normalizedSource}
                  alt="Contorno original en cian"
                />
                <img
                  src={result.overlay}
                  style={{ opacity: 0.5 }}
                  alt="Contorno de tu archivo en magenta"
                />
              </div>
              <p>
                Original en cian y tu archivo en magenta; alto y ancho
                normalizados. La distancia también cuenta las proporciones
                originales.
              </p>
            </div>
          )}
          <ul className="local-reasons">
            {result.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p>
            No se ha verificado la licencia ni una ficha de compra de este
            archivo. Comparar un archivo propio no autoriza su distribución.
          </p>
        </article>
      )}
    </details>
  );
}
