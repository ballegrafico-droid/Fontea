import { useState } from "react";
// These are verified directory references, NOT matches inferred from an image.
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
export default function ExternalFonts({
  cropUrl,
  blocked,
  busy,
}: {
  cropUrl: string;
  blocked: boolean;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  return (
    <details className="font-tool external-tool">
      <summary>Fuentes comerciales y fuera del catálogo</summary>
      <p>
        El reconocimiento automático de Fontea consulta 117 familias abiertas y
        203 variantes. No incluye ninguna variante de Bauhaus. Una fuente
        comercial puede identificarse sin redistribuir su archivo.
      </p>
      <h3>Buscar en un servicio externo</h3>
      <p>
        WhatFontIs busca fuentes gratuitas y comerciales. Puedes guardar tu
        recorte y abrir su identificador. Tendrás que seleccionar allí la
        imagen: Fontea no la envía ni importa resultados automáticamente. Revisa
        sus condiciones y privacidad antes de subirla.
      </p>
      <div className="local-actions">
        {cropUrl && !blocked && !busy && (
          <a
            className="button secondary"
            href={cropUrl}
            download="fontea-recorte.png"
          >
            Guardar recorte de una línea
          </a>
        )}
        <a
          href="https://www.whatfontis.com/"
          target="_blank"
          rel="noreferrer"
          className="external-official"
        >
          Abrir WhatFontIs ↗
        </a>
      </div>
      {blocked && (
        <p className="variant-caution">
          Recorta una sola línea antes de buscar. Compara cada tipografía por
          separado.
        </p>
      )}
      <p>
        Sus candidatos son hipótesis de otro motor. No prueban la identidad, y
        su etiqueta «Free» no verifica permisos comerciales. Sigue el enlace al
        vendedor y comprueba la licencia. La API existe, pero no está activada
        aquí: requiere una clave y aclarar la autorización comercial con el
        proveedor.
      </p>
      <h3>¿Conoces parte del nombre?</h3>
      <label className="font-file-label">
        Consultar las referencias comerciales verificadas
        <input
          type="search"
          aria-label="Buscar referencia comercial por nombre"
          placeholder="Por ejemplo, Bauhaus"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={80}
        />
      </label>
      <p>
        Directorio inicial: 2 familias documentadas, ajenas al catálogo de
        reconocimiento. Estas fichas se buscan por el nombre que escribes, no
        por tu imagen.
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
                <p>
                  Licencia comercial: consulta las condiciones para tu uso. Sin
                  archivo de descarga en Fontea.
                </p>
                <a href={r.url} target="_blank" rel="noreferrer">
                  Ficha de compra en MyFonts ↗
                </a>{" "}
                ·{" "}
                <a href={r.source} target="_blank" rel="noreferrer">
                  Documentación verificada ↗
                </a>
                <p>
                  Ficha comprobada el 18/10/2026; precios y condiciones pueden
                  cambiar.
                </p>
              </article>
            ))}
          {!references.some((r) =>
            r.family.toLowerCase().includes(query.trim().toLowerCase()),
          ) && (
            <p>
              No hay una ficha verificada para ese nombre en este pequeño
              directorio. No significa que la fuente no exista. Prueba el
              buscador externo.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
