import { useState } from "react";
const references = [
  {
    family: "ITC Bauhaus",
    vendor: "ITC",
    styles: "Pro Light, Pro Medium, Pro Demi, Pro Bold y Pro Heavy",
    url: "https://www.myfonts.com/collections/bauhaus-font-itc",
    source: "https://www.myfonts.com/collections/bauhaus-font-itc",
  },
  {
    family: "Bauhaus 93",
    vendor: "URW Type Foundry",
    styles:
      "Std Regular (1 estilo). Microsoft también documenta Bauhs93.ttf; no se asume que dos archivos sean la misma versión.",
    url: "https://www.myfonts.com/collections/bauhaus-93-font-urw/",
    source: "https://learn.microsoft.com/en-us/typography/font-list/bauhaus-93",
  },
];
export default function CommercialDirectory() {
  const [query, setQuery] = useState("");
  return (
    <details className="font-tool">
      <summary>
        Consultar fichas por nombre (sin identificación por imagen)
      </summary>
      <label className="font-file-label">
        Nombre de familia
        <input
          type="search"
          aria-label="Buscar referencia comercial por nombre"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre de familia"
        />
      </label>
      <p>
        Directorio de dos familias documentadas, independiente de los resultados
        del reconocimiento. No se sugieren por defecto.
      </p>
      {query.trim().length >= 3 && (
        <div className="commercial-references">
          {references
            .filter((r) =>
              r.family.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .map((r) => (
              <article key={r.family}>
                <p className="card-kicker">
                  REFERENCIA POR NOMBRE · NO IDENTIFICADA EN TU IMAGEN
                </p>
                <h4>{r.family}</h4>
                <p>
                  {r.vendor} · {r.styles}
                </p>
                <p>Licencia comercial: consulta las condiciones para tu uso.</p>
                <a href={r.url} target="_blank" rel="noreferrer">
                  Ficha de compra en MyFonts ↗
                </a>{" "}
                ·{" "}
                <a href={r.source} target="_blank" rel="noreferrer">
                  Documentación verificada ↗
                </a>
              </article>
            ))}
          {!references.some((r) =>
            r.family.toLowerCase().includes(query.trim().toLowerCase()),
          ) && (
            <p>
              No hay una ficha verificada para ese nombre en este pequeño
              directorio. No significa que la fuente no exista.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
