import express from "express";
import multer from "multer";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Has realizado muchas peticiones. Espera un minuto e inténtalo de nuevo.",
  },
});
app.use("/api", apiLimiter);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "catalog/manifest.json"), "utf8"),
);
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", catalogVariants: manifest.fonts.length }),
);
app.get("/api/catalog", (_req, res) =>
  res.json({
    ...manifest,
    fonts: manifest.fonts.map((f: Record<string, unknown>) => ({
      id: f.id,
      family: f.family,
      variant: f.variant,
      tag: f.tag,
      officialUrl: f.officialUrl,
      license: f.license,
      licenseUrl: f.licenseUrl,
    })),
  }),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
    fields: 2,
    fieldSize: 1024,
    parts: 3,
  },
});
let busy = false;
app.post("/api/:operation", (req, res, next) => {
  if (!["ocr", "identify"].includes(req.params.operation)) {
    res.status(404).json({ error: "Operación no disponible." });
    return;
  }
  // Reject before multipart buffering when another worker already owns the slot.
  if (busy) {
    res.status(503).set("Retry-After", "5").json({
      error: "El motor está ocupado. Inténtalo de nuevo en unos segundos.",
    });
    return;
  }
  busy = true;
  let child: ReturnType<typeof spawn> | undefined;
  const killWorker = () => {
    if (!child?.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      /* Already exited. */
    }
  };
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      busy = false;
    }
  };
  const disconnect = () => {
    if (!res.writableEnded) {
      killWorker();
      if (!child) release();
    }
  };
  res.on("close", disconnect);
  upload.single("image")(req, res, (error) => {
    if (error) {
      release();
      next(error);
      return;
    }
    if (res.destroyed) {
      release();
      return;
    }
    if (!req.file) {
      release();
      res.status(400).json({ error: "Falta la imagen." });
      return;
    }
    if (
      req.params.operation === "identify" &&
      (typeof req.body?.text !== "string" || req.body.text.length > 100)
    ) {
      release();
      res.status(400).json({
        error:
          "Escribe el texto que aparece en el recorte (máximo 80 caracteres).",
      });
      return;
    }
    if (
      req.params.operation === "ocr" &&
      req.body?.language !== undefined &&
      !["spa+eng", "eng+spa"].includes(req.body.language)
    ) {
      release();
      res
        .status(400)
        .json({ error: "Elige español o inglés como idioma prioritario." });
      return;
    }
    if (
      req.params.operation === "identify" &&
      req.body?.lineCount !== undefined &&
      (!/^\d{1,3}$/.test(req.body.lineCount) ||
        Number(req.body.lineCount) > 100)
    ) {
      release();
      res
        .status(400)
        .json({ error: "La información de líneas del recorte no es válida." });
      return;
    }
    child = spawn(
      process.env.PYTHON_BIN || "python3",
      [path.join(root, "engine/worker.py")],
      {
        cwd: root,
        env: {
          ...process.env,
          OPENBLAS_NUM_THREADS: "1",
          OMP_NUM_THREADS: "1",
        },
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    let tooLarge = false;
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        killWorker();
      },
      Math.min(60000, Number(process.env.ENGINE_TIMEOUT_MS) || 45000),
    );
    child.stdout!.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.length > 8 * 1024 * 1024) {
        tooLarge = true;
        killWorker();
      }
    });
    // No image, recognized text, request body, or subprocess stderr is logged.
    child.stderr!.on("data", () => {});
    child.stdin!.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      release();
      if (!res.headersSent && !res.destroyed)
        res.status(503).json({
          error:
            "El motor no está disponible. Comprueba Python y Tesseract en el servidor.",
        });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      release();
      if (res.headersSent || res.destroyed) return;
      if (timedOut || tooLarge || code !== 0) {
        res.status(503).json({
          error: timedOut
            ? "El análisis ha tardado demasiado. Recorta una línea más corta."
            : "El motor no ha podido completar el análisis.",
        });
        return;
      }
      try {
        const answer = JSON.parse(output);
        res
          .status(answer.ok ? 200 : 422)
          .json(answer.ok ? answer.result : { error: answer.error });
      } catch {
        res
          .status(503)
          .json({ error: "El motor ha devuelto una respuesta incompleta." });
      }
    });
    child.stdin!.end(
      JSON.stringify({
        operation: req.params.operation,
        image: req.file.buffer.toString("base64"),
        text: req.body?.text,
        language: req.body?.language,
        lineCount: Number(req.body?.lineCount) || 0,
      }),
    );
  });
});
app.use(
  "/catalog-index",
  express.static(path.join(root, "catalog/index"), {
    immutable: true,
    maxAge: "1y",
    dotfiles: "deny",
  }),
);
app.use(
  "/fonts",
  express.static(path.join(root, "catalog/fonts"), {
    immutable: true,
    maxAge: "1d",
    dotfiles: "deny",
  }),
);
app.use(
  "/licenses",
  express.static(path.join(root, "catalog/licenses"), {
    maxAge: "1d",
    dotfiles: "deny",
  }),
);
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Ruta no disponible." });
    return;
  }
  res.sendFile(path.join(root, "dist/index.html"));
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(error instanceof multer.MulterError ? 413 : 400).json({
      error:
        error instanceof multer.MulterError
          ? "La imagen debe ocupar menos de 8 MB. Sube un único PNG, JPG o WebP."
          : "No se ha podido procesar la petición.",
    });
  },
);
