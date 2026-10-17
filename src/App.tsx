import { useEffect, useRef, useState } from "react";
import ReactCrop, { type PercentCrop, type PixelCrop } from "react-image-crop";
import {
  ArrowUpRight,
  ArrowRight,
  Upload,
  ScanLine,
  Crop as CropIcon,
  Check,
  LoaderCircle,
  X,
  ImagePlus,
  RotateCcw,
  ExternalLink,
  Download,
  Info,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";

type Font = {
  variable: boolean;
  id: string;
  family: string;
  variant: string;
  weight: number;
  italic: boolean;
  officialUrl: string;
  license: string;
  licenseUrl: string;
  downloadUrl: string;
  localLicenseUrl: string;
  distance: number;
  preview: string;
  overlay: string;
};
type Result = {
  status: "candidates" | "unidentified";
  text: string;
  candidates: Font[];
  alternatives: Font[];
  reasons: string[];
  normalizedSource: string;
  method: string;
  catalog: {
    name: string;
    families: number;
    variants: number;
    revision: string;
  };
};
type Catalog = { name: string; verifiedAt: string; fonts: Font[] };
const initialCrop: PercentCrop = {
  unit: "%",
  x: 3,
  y: 3,
  width: 94,
  height: 94,
};
const MAX_BYTES = 8 * 1024 * 1024;
async function request<T>(
  operation: string,
  image: Blob,
  text: string,
  signal: AbortSignal,
  language?: string,
): Promise<T> {
  const form = new FormData();
  form.append("image", image, "recorte.png");
  if (operation === "identify") form.append("text", text);
  if (operation === "ocr" && language) form.append("language", language);
  const response = await fetch("/api/" + operation, {
    method: "POST",
    body: form,
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("El servidor no está disponible. Vuelve a intentarlo.");
  }
  if (!response.ok)
    throw new Error(data.error || "No se ha podido completar el análisis.");
  return data;
}
function CandidateCard({
  font,
  source,
  text,
  alternative,
}: {
  font: Font;
  source: string;
  text: string;
  alternative?: boolean;
}) {
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(50);
  return (
    <article className="candidate">
      <div className="candidate-top">
        <div>
          <p className="card-kicker">
            {alternative ? "ALTERNATIVA VISUAL" : "CANDIDATO DEL CATÁLOGO"}
          </p>
          <h3>{font.family}</h3>
          <span className="variant">
            {font.variant} · {font.weight}
            {font.italic ? " · cursiva" : ""}
          </span>
        </div>
        <span
          className="distance"
          title="Menor distancia significa más parecido. No es una probabilidad de acierto."
        >
          d {font.distance.toFixed(3).replace(".", ",")}
        </span>
      </div>
      <div className="render-sample">
        <img
          src={font.preview}
          alt={`${text}, renderizado con ${font.family} ${font.variant}`}
        />
        <span>MISMO TEXTO · RENDER REAL</span>
      </div>
      <button
        className="text-button overlay-toggle"
        onClick={() => setOverlay(!overlay)}
        aria-expanded={overlay}
      >
        <ScanLine size={15} />
        {overlay ? "Ocultar" : "Comparar"} contornos
        <ChevronDown size={14} />
      </button>
      {overlay && (
        <div className="overlay-panel">
          <div className="overlay-images">
            <img src={source} alt="Contorno de la muestra original" />
            <img
              src={font.overlay}
              style={{ opacity: opacity / 100 }}
              alt={`Contorno de ${font.family}`}
            />
          </div>
          <label>
            Original (cian){" "}
            <input
              type="range"
              min="0"
              max="100"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              aria-label={`Superposición de ${font.family}`}
            />{" "}
            Fuente (magenta)
          </label>
          <p>
            Contornos en color; alto y ancho normalizados. Las proporciones
            también cuentan en la distancia.
          </p>
        </div>
      )}
      <div className="license-line">
        <ShieldCheck size={15} />
        <span>OFL 1.1 · uso personal y comercial</span>
        <a
          href={font.localLicenseUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Leer licencia de ${font.family}`}
        >
          Licencia <ExternalLink size={11} />
        </a>
      </div>
      <div className="candidate-actions">
        <a href={font.officialUrl} target="_blank" rel="noreferrer">
          Fuente oficial <ArrowUpRight size={16} />
        </a>
        <a
          href={font.downloadUrl}
          download
          aria-label={`Descargar archivo de ${font.family}`}
        >
          <Download size={15} /> Descargar
        </a>
      </div>
      <p className="download-note">
        Archivo original {font.variable ? "variable" : "estático"}; puede
        incluir más pesos que el comparado.
      </p>
    </article>
  );
}
export default function App() {
  const [imageUrl, setImageUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [demo, setDemo] = useState(false);
  const [crop, setCrop] = useState<PercentCrop>(initialCrop);
  const [pixelCrop, setPixelCrop] = useState<PixelCrop>();
  const [stage, setStage] = useState<"upload" | "crop" | "review" | "results">(
    "upload",
  );
  const [pending, setPending] = useState<"ocr" | "identify" | "">("");
  const [cropped, setCropped] = useState<Blob>();
  const [croppedUrl, setCroppedUrl] = useState("");
  const [text, setText] = useState("");
  const [ocrNote, setOcrNote] = useState("");
  const [ocrLanguage, setOcrLanguage] = useState("spa+eng");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result>();
  const [drag, setDrag] = useState(false);
  const [modal, setModal] = useState<"catalog" | "privacy" | "">("");
  const [catalog, setCatalog] = useState<Catalog>();
  const [catalogError, setCatalogError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const work = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | null>(null);
  const loadSequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  useEffect(
    () => () => {
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
    },
    [croppedUrl],
  );
  useEffect(() => {
    if (modal) {
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!catalog) {
      setCatalogError("");
      fetch("/api/catalog")
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then(setCatalog)
        .catch(() =>
          setCatalogError(
            "No se ha podido cargar el catálogo. Comprueba la conexión con el servidor.",
          ),
        );
    }
  }, [modal, catalog]);
  async function load(file: File, isDemo = false) {
    const sequence = ++loadSequence.current;
    controller.current?.abort();
    setPending("");
    setError("");
    try {
      if (file.size > MAX_BYTES)
        throw Error(
          "La imagen supera los 8 MB. Exporta un archivo más pequeño.",
        );
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71;
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!png && !jpg && !webp)
        throw Error("Ese formato no es compatible. Sube un PNG, JPG o WebP.");
      const url = URL.createObjectURL(file);
      const check = new Image();
      try {
        await new Promise<void>((resolve, reject) => {
          check.onload = () => resolve();
          check.onerror = () =>
            reject(
              Error("No se puede abrir la imagen. Prueba con otro archivo."),
            );
          check.src = url;
        });
        if (
          check.naturalWidth * check.naturalHeight > 12_000_000 ||
          Math.max(check.naturalWidth, check.naturalHeight) > 6000 ||
          Math.min(check.naturalWidth, check.naturalHeight) < 12
        )
          throw Error(
            "Usa una imagen de hasta 12 megapíxeles y 6000 píxeles por lado (mínimo 12).",
          );
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
      if (sequence !== loadSequence.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setImageUrl(url);
      setFilename(file.name);
      setDemo(isDemo);
      setCrop(initialCrop);
      setPixelCrop(undefined);
      setText("");
      setResult(undefined);
      setCropped(undefined);
      setCroppedUrl("");
      setStage("crop");
      setOcrNote("");
      setTimeout(
        () =>
          work.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (f) {
        e.preventDefault();
        void load(f);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);
  async function example() {
    setError("");
    try {
      const r = await fetch("/demo-inter.png");
      if (!r.ok) throw Error();
      await load(
        new File([await r.blob()], "demostracion-inter-bold.png", {
          type: "image/png",
        }),
        true,
      );
    } catch {
      setError("No se ha podido cargar el ejemplo de demostración.");
    }
  }
  async function confirmCrop() {
    const img = image.current;
    if (!img) return;
    const c = pixelCrop || {
      x: (img.width * crop.x) / 100,
      y: (img.height * crop.y) / 100,
      width: (img.width * crop.width) / 100,
      height: (img.height * crop.height) / 100,
    };
    if (c.width < 8 || c.height < 8) {
      setError("Selecciona una zona un poco más grande.");
      return;
    }
    const sx = img.naturalWidth / img.width,
      sy = img.naturalHeight / img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(c.width * sx);
    canvas.height = Math.round(c.height * sy);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("El navegador no permite procesar el recorte.");
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      c.x * sx,
      c.y * sy,
      c.width * sx,
      c.height * sy,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/png"),
    );
    if (!blob) {
      setError("No se pudo crear el recorte.");
      return;
    }
    setCropped(blob);
    setCroppedUrl(URL.createObjectURL(blob));
    setStage("review");
    await readCrop(blob);
  }
  async function readCrop(blob: Blob | undefined = cropped) {
    if (!blob) return;
    setStage("review");
    setPending("ocr");
    setError("");
    setResult(undefined);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await request<{
        text: string;
        lineCount: number;
        needsReview: boolean;
      }>("ocr", blob, "", abort.signal, ocrLanguage);
      setText(data.text);
      setOcrNote(
        data.lineCount > 1
          ? "El OCR ha detectado varias líneas. Vuelve a recortar una sola."
          : data.needsReview
            ? "El OCR tiene dudas. Revisa el texto o escríbelo manualmente."
            : "Texto detectado. Revisa las letras, mayúsculas y signos antes de comparar.",
      );
    } catch (e) {
      if (!abort.signal.aborted) {
        setText("");
        setOcrNote((e as Error).message);
      }
    } finally {
      if (!abort.signal.aborted) setPending("");
    }
  }
  async function identify() {
    if (!cropped) return;
    setPending("identify");
    setError("");
    setResult(undefined);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await request<Result>(
        "identify",
        cropped,
        text,
        abort.signal,
      );
      setResult(data);
      setStage("results");
      setTimeout(
        () =>
          document
            .getElementById("results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) setPending("");
    }
  }
  function recrop() {
    controller.current?.abort();
    setPending("");
    setResult(undefined);
    setError("");
    setStage("crop");
  }
  const current =
    stage === "upload" ? 0 : stage === "crop" ? 1 : stage === "review" ? 2 : 3;
  return (
    <>
      <header className="header">
        <a className="wordmark" href="#" aria-label="Fontea, inicio">
          <span className="brand-symbol">f</span>fontea
          <span className="brand-dot">.</span>
        </a>
        <nav>
          <button onClick={() => setModal("catalog")}>
            El catálogo <span className="tiny-dot" />
          </button>
          <a href="#como-funciona" className="desktop-nav">
            Cómo funciona
          </a>
          <a
            href="#workspace"
            className="nav-cta"
            onClick={() => stage === "upload" && input.current?.click()}
          >
            Identificar una fuente <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> PARA QUIEN MIRA LAS LETRAS DOS VECES
            </div>
            <h1>
              Esa letra tiene
              <br />
              un <span>nombre.</span>
              <svg viewBox="0 0 350 24" aria-hidden="true">
                <path d="M4 17 Q155 -3 346 13" />
              </svg>
            </h1>
            <p>
              La viste. Te gustó. Ahora encuéntrala.
              <br />
              Identifica tipografías a partir de una imagen y descubre su fuente
              oficial.
            </p>
            <a className="hero-jump" href="#workspace">
              Del píxel a la tipografía <ArrowRight size={17} />
            </a>
          </div>
          <div className="type-art" aria-hidden="true">
            <div className="art-grid" />
            <span className="art-meta">ESPÉCIMEN / 001</span>
            <div className="specimen specimen-back">
              <span>Sans / 700</span>
              <strong>Aa</strong>
              <i>La forma de una idea.</i>
            </div>
            <div className="specimen specimen-front">
              <span>Serif / Italic</span>
              <strong>Ag</strong>
              <i>Los detalles lo dicen todo.</i>
              <div className="scan-corner tl" />
              <div className="scan-corner tr" />
              <div className="scan-corner bl" />
              <div className="scan-corner br" />
            </div>
            <div className="art-tag">
              <ScanLine size={17} /> Cada curva cuenta.
            </div>
            <span className="art-coord">FUENTES ABIERTAS · FORMAS REALES</span>
          </div>
        </section>
        <section id="workspace" className="workspace" ref={work}>
          <div className="section-top">
            <div className="section-label">
              <span className="section-number">01</span> TU PRÓXIMO HALLAZGO
            </div>
            <span className="local-badge">
              <span /> Sin registro. Sin rodeos.
            </span>
          </div>
          <div className="workspace-title">
            <h2>
              Sube una imagen e identifica su fuente<span>.</span>
            </h2>
            <p>Una línea de texto, un buen recorte y un poco de curiosidad.</p>
          </div>
          <ol className="steps" aria-label="Pasos de identificación">
            {[
              "Sube tu imagen",
              "Recorta el texto",
              "Revisa las letras",
              "Compara las fuentes",
            ].map((s, i) => (
              <li
                key={s}
                className={current === i ? "active" : current > i ? "done" : ""}
              >
                <span>
                  {current > i ? (
                    <Check size={12} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Subir imagen"
            className="visually-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
              e.target.value = "";
            }}
          />
          {stage === "upload" ? (
            <div
              className={"dropzone " + (drag ? "dragging" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const file = e.dataTransfer.files[0];
                if (file) void load(file);
              }}
            >
              <div className="upload-icon">
                <ImagePlus size={29} strokeWidth={1.5} />
                <span>+</span>
              </div>
              <h3>Todo empieza con una imagen.</h3>
              <p>
                Arrástrala aquí o pégala con <kbd>Ctrl</kbd> + <kbd>V</kbd>
                <span className="mac-note"> (⌘ V en Mac)</span>
              </p>
              <button
                className="button primary"
                onClick={() => input.current?.click()}
              >
                <Upload size={17} /> Elegir una imagen{" "}
                <ArrowUpRight size={17} />
              </button>
              <span className="file-help">
                JPG, PNG o WebP · Máx. 8 MB / 12 MP
              </span>
              <div className="demo-line">
                ¿Solo estás explorando?{" "}
                <button onClick={example}>
                  Prueba un ejemplo de demostración <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="editor">
              <div className="editor-top">
                <span>
                  <ImagePlus size={15} />
                  <span className="filename">{filename}</span>
                  {demo && (
                    <b className="demo-badge">DEMOSTRACIÓN · INTER BOLD</b>
                  )}
                </span>
                <button
                  className="text-button"
                  onClick={() => input.current?.click()}
                  disabled={!!pending}
                >
                  <RotateCcw size={14} /> Cambiar imagen
                </button>
              </div>
              {stage === "crop" ? (
                <div className="crop-layout">
                  <div className="crop-canvas">
                    <ReactCrop
                      crop={crop}
                      onChange={(p, c) => {
                        setCrop(c);
                        setPixelCrop(p);
                      }}
                      minWidth={8}
                      minHeight={8}
                    >
                      <img
                        ref={image}
                        src={imageUrl}
                        alt="Imagen subida: ajusta el área del recorte"
                        onLoad={() => setPixelCrop(undefined)}
                      />
                    </ReactCrop>
                  </div>
                  <aside className="crop-instructions">
                    <span className="small-icon">
                      <CropIcon size={20} />
                    </span>
                    <h3>Quédate con las letras.</h3>
                    <p>
                      Arrastra los bordes para seleccionar{" "}
                      <strong>una sola línea</strong> de texto. Deja fuera
                      logotipos, adornos y otras fuentes.
                    </p>
                    <ul>
                      <li>Cuantas más letras distintas, mejor.</li>
                      <li>Evita texto inclinado o deformado.</li>
                      <li>Con teclado: tabula al recorte y usa las flechas.</li>
                    </ul>
                    <button
                      className="text-button"
                      onClick={() => {
                        setCrop({
                          unit: "%",
                          x: 0,
                          y: 0,
                          width: 100,
                          height: 100,
                        });
                        setPixelCrop(undefined);
                      }}
                    >
                      Seleccionar imagen completa
                    </button>
                    <button className="button primary" onClick={confirmCrop}>
                      Leer el recorte <ArrowRight size={17} />
                    </button>
                  </aside>
                </div>
              ) : (
                <div className="review-layout">
                  <div className="original-pane">
                    <span className="card-kicker">TU MUESTRA ORIGINAL</span>
                    <div className="original-image">
                      <img
                        src={croppedUrl}
                        alt="Recorte original que se compara"
                      />
                    </div>
                    <button
                      className="text-button"
                      onClick={recrop}
                      disabled={!!pending}
                    >
                      <CropIcon size={14} /> Ajustar el recorte
                    </button>
                  </div>
                  <div className="text-pane">
                    <label htmlFor="ocr-text">¿Qué dice la imagen?</label>
                    <p>
                      {pending === "ocr"
                        ? "El OCR está leyendo las letras…"
                        : ocrNote}
                    </p>
                    <input
                      id="ocr-text"
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        setResult(undefined);
                        setStage("review");
                      }}
                      maxLength={80}
                      placeholder="Escribe aquí el texto exacto"
                      disabled={!!pending}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="input-help">
                      Respeta mayúsculas, tildes, signos y espacios. Solo
                      alfabeto latino.
                    </span>
                    <div className="ocr-controls">
                      <label htmlFor="ocr-language">Idioma prioritario</label>
                      <select
                        id="ocr-language"
                        value={ocrLanguage}
                        disabled={!!pending}
                        onChange={(e) => setOcrLanguage(e.target.value)}
                      >
                        <option value="spa+eng">Español primero</option>
                        <option value="eng+spa">Inglés primero</option>
                      </select>
                      <button
                        className="text-button"
                        disabled={!!pending}
                        onClick={() => readCrop()}
                      >
                        Volver a leer
                      </button>
                    </div>
                    <button
                      className="button primary"
                      onClick={identify}
                      disabled={!!pending || text.trim().length < 3}
                    >
                      {pending ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <ScanLine size={17} />
                      )}{" "}
                      {pending === "ocr"
                        ? "Leyendo el texto…"
                        : pending === "identify"
                          ? "Comparando contornos…"
                          : "Buscar en el catálogo"}
                      {!pending && <ArrowRight size={17} />}
                    </button>
                    {pending === "identify" && (
                      <p className="progress-note" role="status">
                        Renderizando variantes reales. Puede tardar unos
                        segundos.
                      </p>
                    )}
                    {pending && (
                      <button
                        className="text-button cancel-button"
                        onClick={() => {
                          controller.current?.abort();
                          setPending("");
                          setOcrNote(
                            "Operación cancelada. Puedes escribir el texto o volver a recortar.",
                          );
                        }}
                      >
                        Cancelar operación
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button aria-label="Cerrar error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="workspace-foot">
            <span>
              <ShieldCheck size={14} /> Tu imagen se procesa en memoria y no se
              guarda.
            </span>
            <button onClick={() => setModal("privacy")}>
              Sobre tu privacidad <ArrowUpRight size={12} />
            </button>
          </div>
        </section>
        {result && (
          <section id="results" className="results">
            <div className="section-label">
              <span className="section-number">02</span> LAS LETRAS, BAJO LA
              LUPA
            </div>
            <div className="results-heading">
              <h2>
                {result.status === "candidates"
                  ? "Tenemos candidatos."
                  : "Todavía no tiene nombre."}
              </h2>
              <span
                className={
                  "result-badge " +
                  (result.status === "unidentified" ? "uncertain" : "")
                }
              >
                {result.status === "candidates"
                  ? "Identidad sin confirmar"
                  : "Sin identificación"}
              </span>
            </div>
            <p className="results-intro">
              Consultado: {result.catalog.name} · {result.catalog.families}{" "}
              familias · {result.catalog.variants} variantes.{" "}
              <button
                className="inline-link"
                onClick={() => setModal("catalog")}
              >
                Ver cobertura
              </button>
            </p>
            <div className="evidence-note">
              <Info size={19} />
              <div>
                {result.reasons.map((reason, i) => (
                  <p key={i}>{reason}</p>
                ))}
              </div>
            </div>
            {result.candidates.length > 0 && (
              <>
                <div className="result-section-title">
                  <h3>Candidatos a la fuente original</h3>
                  <span>
                    Evidencia visual dentro del catálogo; no identificación
                    exacta
                  </span>
                </div>
                <div className="candidate-grid">
                  {result.candidates.map((f) => (
                    <CandidateCard
                      key={f.id}
                      font={f}
                      source={result.normalizedSource}
                      text={result.text}
                    />
                  ))}
                </div>
              </>
            )}
            {result.alternatives.length > 0 && (
              <>
                <div className="result-section-title alternatives-title">
                  <h3>Alternativas visualmente similares</h3>
                  <span>No implican que sean la fuente de la imagen</span>
                </div>
                <div className="candidate-grid">
                  {result.alternatives.map((f) => (
                    <CandidateCard
                      key={f.id}
                      font={f}
                      source={result.normalizedSource}
                      text={result.text}
                      alternative
                    />
                  ))}
                </div>
              </>
            )}
            <p className="method-note">
              {result.method} El catálogo no incluye fuentes comerciales. Las
              variantes solo cubren Regular y Bold, recta o cursiva cuando están
              disponibles.
            </p>
          </section>
        )}
        <section id="como-funciona" className="how">
          <div className="how-heading">
            <span className="section-label">DEL DETALLE AL DESCUBRIMIENTO</span>
            <h2>
              Buen ojo.
              <br />
              <em>Mejores evidencias.</em>
            </h2>
            <p>
              Una letra se parece a muchas. Por eso no nos quedamos con una
              primera impresión.
            </p>
          </div>
          <div className="how-items">
            <article>
              <span>01 /</span>
              <div>
                <ScanLine size={22} />
                <h3>Comparamos formas reales.</h3>
                <p>
                  El OCR lee el texto. Después renderizamos ese mismo texto con
                  cada variante del catálogo y comparamos sus contornos y
                  proporciones.
                </p>
              </div>
            </article>
            <article>
              <span>02 /</span>
              <div>
                <Info size={22} />
                <h3>La duda también es un resultado.</h3>
                <p>
                  Una similitud visual no prueba una identidad. Si faltan
                  evidencias, lo decimos y te ayudamos a mejorar la muestra.
                </p>
              </div>
            </article>
            <article>
              <span>03 /</span>
              <div>
                <ExternalLink size={22} />
                <h3>Directo a la fuente oficial.</h3>
                <p>
                  Archivos abiertos y licencias consultables. En esta versión,
                  todas las familias proceden de Google Fonts y permiten uso
                  comercial bajo OFL.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section className="catalog-strip">
          <div>
            <span className="catalog-icon">Aa</span>
            <p>
              Un catálogo pequeño.
              <br />
              <strong>Un punto de partida honesto.</strong>
            </p>
          </div>
          <p>
            Inter, Lora, Montserrat, Roboto…
            <br />
            {catalog
              ? new Set(catalog.fonts.map((f) => f.family)).size
              : "…"}{" "}
            familias abiertas para explorar.
          </p>
          <button onClick={() => setModal("catalog")}>
            Explorar el catálogo <ArrowUpRight size={19} />
          </button>
        </section>
      </main>
      <footer>
        <a className="wordmark" href="#">
          fontea.
        </a>
        <p>Para quienes encuentran belleza en los detalles.</p>
        <div>
          <span>VERSIÓN 0.2 · CATÁLOGO ABIERTO</span>
          <button onClick={() => setModal("privacy")}>Privacidad</button>
        </div>
      </footer>
      <dialog
        ref={dialog}
        className="modal"
        onCancel={() => setModal("")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal("");
        }}
      >
        <div className="modal-content">
          <button
            className="modal-close"
            onClick={() => setModal("")}
            aria-label="Cerrar ventana"
          >
            <X />
          </button>
          {modal === "privacy" ? (
            <>
              <span className="eyebrow">TUS IMÁGENES</span>
              <h2>Solo el tiempo necesario.</h2>
              <p>
                La imagen completa y el recorte permanecen en la memoria del
                navegador. Al leer o comparar, enviamos el recorte a este
                servidor para procesarlo en memoria con Python y Tesseract.
              </p>
              <p>
                No guardamos las imágenes, el texto ni los resultados. No los
                enviamos a servicios de inteligencia artificial externos. Al
                terminar la petición se descartan los datos del proceso. No se
                requieren cuentas ni claves de API.
              </p>
              <p>
                El servidor y Nginx pueden registrar datos técnicos de acceso
                como dirección IP, fecha y ruta. Los enlaces oficiales se abren
                en sitios externos, sujetos a sus propias políticas.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">COBERTURA REAL</span>
              <h2>Las fuentes que sí buscamos.</h2>
              <p>
                Selección de Google Fonts. Archivos originales, sin modificar.
                Licencia SIL Open Font License 1.1 verificada por familia;
                permite uso personal y comercial con sus condiciones.
              </p>
              {catalogError ? (
                <p role="alert">{catalogError}</p>
              ) : !catalog ? (
                <p role="status">Cargando el catálogo…</p>
              ) : (
                <>
                  <p className="catalog-summary">
                    {new Set(catalog.fonts.map((f) => f.family)).size} familias
                    · {catalog.fonts.length} variantes · Licencias revisadas:{" "}
                    {catalog.verifiedAt}
                  </p>
                  <div className="catalog-list">
                    {Array.from(
                      new Set(catalog.fonts.map((f) => f.family)),
                    ).map((name) => {
                      const fonts = catalog.fonts.filter(
                        (f) => f.family === name,
                      );
                      return (
                        <div key={name}>
                          <a
                            href={fonts[0].officialUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {name}
                            <ArrowUpRight size={14} />
                          </a>
                          <span>{fonts.map((f) => f.variant).join(" · ")}</span>
                          <a
                            className="catalog-license"
                            href={fonts[0].licenseUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver licencia OFL <ExternalLink size={11} />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <p className="modal-note">
                Todavía no cubre fuentes comerciales, otros alfabetos ni todas
                las variantes de estas familias. Ningún resultado confirma una
                identidad exacta.
              </p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
