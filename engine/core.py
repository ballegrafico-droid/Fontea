"""Local catalogue comparison. A visual distance is NOT an identity probability."""

from __future__ import annotations
import base64, io, json, math, pathlib, subprocess, os, warnings
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
from scipy import ndimage
from regions import line_bands
from retrieval import retrieve

ROOT = pathlib.Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "catalog/manifest.json").read_text())
Image.MAX_IMAGE_PIXELS = 12_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)


class InputError(Exception):
    pass


def decode(data: str) -> Image.Image:
    try:
        raw = base64.b64decode(data, validate=True)
        if len(raw) > 8 * 1024 * 1024:
            raise InputError("La imagen supera los 8 MB.")
        im = Image.open(io.BytesIO(raw))
        if im.format not in ("PNG", "JPEG", "WEBP"):
            raise InputError("Usa una imagen PNG, JPG o WebP.")
        if getattr(im, "n_frames", 1) != 1:
            raise InputError("Usa una imagen fija, sin animación.")
        w, h = im.size
        if w * h > 12_000_000 or max(w, h) > 6000 or min(w, h) < 12:
            raise InputError(
                "La imagen debe tener entre 12 y 6000 píxeles por lado y un máximo de 12 megapíxeles."
            )
        im = ImageOps.exif_transpose(im).convert("RGBA")
        bg = Image.new("RGBA", im.size, "white")
        bg.alpha_composite(im)
        return bg.convert("RGB")
    except InputError:
        raise
    except (
        ValueError,
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise InputError(
            "No se puede leer esta imagen. Exporta un PNG, JPG o WebP válido."
        )


def png(im):
    out = io.BytesIO()
    im.save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


def mask_image(mask):
    return Image.fromarray(np.uint8(~mask) * 255, "L")


def contour_png(mask, color):
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = color
    rgba[:, :, 3] = mask.astype(np.uint8) * 255
    return png(Image.fromarray(rgba, "RGBA"))


def trim(mask):
    ys, xs = np.where(mask)
    if not len(xs):
        raise InputError(
            "No se distingue texto en el recorte. Prueba una zona con más contraste."
        )
    return mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def preprocess(im):
    # Bound computation even when the upload is a large photographic crop.
    im = im.copy()
    im.thumbnail((2200, 500))
    a = np.asarray(im.convert("L"))
    contrast = float(np.percentile(a, 98) - np.percentile(a, 2))
    hist = np.bincount(a.ravel(), minlength=256).astype(float)
    weight = np.cumsum(hist)
    means = np.cumsum(hist * np.arange(256))
    between = (means[-1] * weight - means * weight[-1]) ** 2 / (
        weight * (weight[-1] - weight) + 1e-10
    )
    threshold = int(np.argmax(between))
    dark = a <= threshold
    border = np.concatenate([dark[0], dark[-1], dark[:, 0], dark[:, -1]])
    mask = ~dark if border.mean() > 0.5 else dark
    labels, n = ndimage.label(mask)
    areas = np.bincount(labels.ravel())
    keep = areas >= 2
    keep[0] = False
    mask = trim(keep[labels])
    h, w = mask.shape
    if h < 6 or w < 8 or mask.mean() > 0.85:
        raise InputError("El recorte no contiene una línea de texto legible.")
    # Very large, dense blocks are not treated as lettering.
    bands = line_bands(mask)
    return mask, {
        "inkHeight": h,
        "contrast": round(contrast),
        "possibleMultiline": len(bands) > 1,
        "detectedLines": len(bands),
    }


@lru_cache(maxsize=100)
def load_font(font_id, size=96, optical=None, probe_weight=None):
    entry = next(f for f in CATALOG["fonts"] if f["id"] == font_id)
    font = ImageFont.truetype(str(ROOT / "catalog/fonts" / entry["file"]), size)
    if entry["axes"]:
        axes = entry["axes"].copy()
        if optical is not None and "opsz" in axes:
            axes["opsz"] = optical
        if probe_weight is not None and "wght" in axes:
            axes["wght"] = probe_weight
        font.set_variation_by_axes(list(axes.values()))
    return font


def render(entry, text, tracking=0, size=96, optical=None, probe_weight=None):
    font = load_font(entry["id"], size, optical, probe_weight)
    box = font.getbbox(text)
    w = max(
        1,
        math.ceil(font.getlength(text) + max(0, len(text) - 1) * max(0, tracking) + 50),
    )
    if w > 18000:
        raise InputError(
            "El texto renderizado es demasiado largo. Recorta una muestra más corta."
        )
    im = Image.new("L", (w, 200 + size), "white")
    draw = ImageDraw.Draw(im)
    if tracking == 0:
        draw.text((20, 30), text, font=font, fill=0)
    else:
        x = 20
        # Preserve pair kerning through prefix advances while changing letter spacing.
        for i, c in enumerate(text):
            draw.text(
                (x + font.getlength(text[:i]) + i * tracking, 30), c, font=font, fill=0
            )
    return trim(np.asarray(im) < 160)


def normalized(mask, height=56, width=None):
    h, w = mask.shape
    width = width or max(1, round(w * height / h))
    width = min(width, 2400)
    return (
        np.asarray(mask_image(mask).resize((width, height), Image.Resampling.LANCZOS))
        < 140
    )


def distance(source, candidate):
    # Normalize height and width for contours; penalize removed aspect difference separately.
    # Binarization and tracking search intentionally tolerate rasterization differences.
    sh, sw = source.shape
    ch, cw = candidate.shape
    a = normalized(source)
    b = normalized(candidate, width=a.shape[1])
    a = np.pad(a, 3)
    b = np.pad(b, 3)
    union = np.count_nonzero(a | b)
    iou = np.count_nonzero(a & b) / max(union, 1)
    ae = a ^ ndimage.binary_erosion(a)
    be = b ^ ndimage.binary_erosion(b)
    da = ndimage.distance_transform_edt(~ae)
    db = ndimage.distance_transform_edt(~be)
    chamfer = (float(da[be].mean()) + float(db[ae].mean())) / (2 * 56)
    aspect = abs(math.log((sw / sh) / (cw / ch)))
    return 0.62 * (1 - iou) + 0.28 * min(chamfer * 5, 1) + 0.10 * min(aspect * 2, 1)


def ocr(im, language=None):
    # Tesseract reads bytes on stdin. No image or OCR file is persisted.
    sample = im.convert("L")
    sample.thumbnail((2200, 500))
    pixels = np.asarray(sample)
    border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
    if float(np.median(border)) < 128:
        sample = ImageOps.invert(sample)
        pixels = np.asarray(sample)
        border = 255 - border
    # Measure lettering, not the surrounding margin. Keep grayscale antialiasing.
    ink = pixels < max(0, float(np.median(border)) - 30)
    box = Image.fromarray(ink.astype(np.uint8) * 255).getbbox()
    if box:
        sample = sample.crop(box)
        factor = min(3.0, max(1.0, 72 / sample.height))
        if factor > 1:
            sample = sample.resize(
                (round(sample.width * factor), round(sample.height * factor)),
                Image.Resampling.LANCZOS,
            )
        sample.thumbnail((3000, 500))
    sample = ImageOps.expand(sample, border=16, fill=255)
    data = io.BytesIO()
    sample.save(data, format="PNG")
    lang = language or os.environ.get("TESSERACT_LANG", "spa+eng")
    if lang not in ("eng", "spa", "eng+spa", "spa+eng"):
        lang = "spa+eng"
    try:
        result = subprocess.run(
            [
                "tesseract",
                "stdin",
                "stdout",
                "--tessdata-dir",
                str(ROOT / "engine/tessdata"),
                "-l",
                lang,
                "--psm",
                "6",
                "-c",
                "tessedit_create_tsv=1",
            ],
            input=data.getvalue(),
            capture_output=True,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        raise InputError(
            "El OCR no está disponible. Puedes escribir el texto manualmente."
        )
    if result.returncode:
        raise InputError(
            "El OCR no ha podido leer la imagen. Puedes escribir el texto manualmente."
        )
    lines = {}
    conf = []
    for line in result.stdout.decode(errors="replace").splitlines()[1:]:
        cells = line.split("\t")
        if len(cells) >= 12 and cells[0] == "5" and cells[11].strip():
            key = tuple(cells[1:5])
            lines.setdefault(key, []).append(cells[11])
            conf.append(float(cells[10]))
    text = " ".join(" ".join(words) for words in lines.values())
    return {
        "text": text[:100],
        "lineCount": len(lines),
        "needsReview": not conf or min(conf) < 65,
        "message": "Revisa cada letra antes de comparar. El OCR no identifica la fuente.",
    }


def identify(im, text, line_count=0):
    explicit_lines = "\n" in text or "\r" in text
    text = " ".join(text.split())
    if not 3 <= len(text) <= 80:
        raise InputError("Escribe entre 3 y 80 caracteres de una sola línea.")
    if any(ord(c) < 32 or ord(c) > 0x024F for c in text):
        raise InputError(
            "Esta versión compara texto del alfabeto latino. Evita emojis y otros alfabetos."
        )
    source, quality = preprocess(im)
    if explicit_lines or line_count > 1 or quality["possibleMultiline"]:
        return {
            "status": "needs_crop",
            "text": text,
            "candidates": [],
            "alternatives": [],
            "reasons": [
                "Se detectan varias líneas. Selecciona una sola línea y una sola tipografía. Analiza cada fragmento por separado."
            ],
            "quality": quality,
            "normalizedSource": contour_png(normalized(source), (0, 144, 155)),
            "catalog": {
                "name": CATALOG["name"],
                "families": len(set(f["family"] for f in CATALOG["fonts"])),
                "variants": len(CATALOG["fonts"]),
                "revision": CATALOG["revision"],
            },
            "search": {"shortlistedVariants": 0, "comparedVariants": 0},
            "method": "No se ha comparado: el recorte requiere una sola línea.",
        }
    distinct = len(set(c.lower() for c in text if c.isalpha()))
    reasons = []
    if distinct < 5:
        reasons.append(
            "Hay pocas letras diferentes. Añade una muestra con al menos cinco letras distintas."
        )
    if quality["inkHeight"] < 24:
        reasons.append(
            "Las letras tienen poca resolución. Sube un recorte de mayor tamaño."
        )
    if quality["contrast"] < 50:
        reasons.append("El contraste es bajo. Prueba una imagen con fondo uniforme.")
    if quality["possibleMultiline"]:
        reasons.append(
            "Puede haber varias líneas o ruido. Recorta una sola línea y una sola fuente."
        )
    search = (
        retrieve(source, text, CATALOG)
        if not reasons
        else {
            "ids": [],
            "indexedVariants": len(CATALOG["fonts"]),
            "indexBytes": 0,
            "coarseMs": 0,
        }
    )
    selected = set(search["ids"])
    search["selectedIds"] = search.pop("ids")
    search["shortlistedVariants"] = len(selected)
    ranked = []
    for entry in CATALOG["fonts"]:
        if entry["id"] not in selected:
            continue
        best = None
        for optical in entry.get("opticalSizes", [None]):
            for tracking in (-0.8, 0, 0.8):
                rendered = render(entry, text, tracking, optical=optical)
                d = distance(source, rendered)
                if best is None or d < best[0]:
                    best = (d, rendered, tracking)
        ranked.append((best[0], entry, best[1], best[2]))
    ranked.sort(key=lambda row: row[0])
    search["top1"] = (
        {
            "id": ranked[0][1]["id"],
            "family": ranked[0][1]["family"],
            "distance": ranked[0][0],
        }
        if ranked
        else None
    )
    search["variableWeightChecks"] = 0
    if not reasons and ranked and ranked[0][0] <= 0.155:
        best, entry = ranked[0][0], ranked[0][1]
        supports_intermediate = "wght" in entry["axes"] and all(
            any(
                f["file"] == entry["file"] and f["weight"] == weight
                for f in CATALOG["fonts"]
            )
            for weight in (400, 700)
        )
        if supports_intermediate:
            probe_distance = math.inf
            for weight in (450, 500, 550, 600, 650):
                search["variableWeightChecks"] += 1
                for optical in entry.get("opticalSizes", [None]):
                    for tracking in (-0.8, 0, 0.8):
                        probe_distance = min(
                            probe_distance,
                            distance(
                                source,
                                render(
                                    entry,
                                    text,
                                    tracking,
                                    optical=optical,
                                    probe_weight=weight,
                                ),
                            ),
                        )
            if probe_distance + 0.025 < best:
                reasons.append(
                    "El mismo archivo encaja mejor con un peso no incluido entre las variantes del catálogo. No hay evidencia suficiente para proponer la variante original; se muestran solo alternativas."
                )
    # Conservative retrieval gate, tuned only on the documented development split.
    # Passing it establishes a catalogue candidate, never proof of exact identity.
    accepted = not reasons and bool(ranked) and ranked[0][0] <= 0.155
    candidates = []
    alternatives = []
    for d, entry, rendered, tracking in ranked[:6]:
        if d > 0.20:
            continue
        public = {
            k: v
            for k, v in entry.items()
            if k not in ("file", "axes", "sha256", "sourceUrl", "licenseFile")
        }
        public.update(
            {
                "distance": round(d, 4),
                "preview": png(
                    ImageOps.expand(mask_image(rendered), border=20, fill=255)
                ),
                "overlay": contour_png(
                    normalized(rendered, width=normalized(source).shape[1]),
                    (196, 30, 132),
                ),
                "downloadUrl": "/fonts/" + entry["file"],
                "localLicenseUrl": "/licenses/" + entry["licenseFile"],
                "tracking": tracking,
            }
        )
        if accepted and d <= 0.155 and d - ranked[0][0] < 0.025 and len(candidates) < 3:
            candidates.append(public)
        elif abs(
            math.log(
                (source.shape[1] / source.shape[0])
                / (rendered.shape[1] / rendered.shape[0])
            )
        ) <= math.log(1.2):
            alternatives.append(public)
    if not accepted:
        reasons.append(
            "No hay evidencia suficiente para proponer una fuente original dentro de este catálogo. La fuente puede estar fuera, o la muestra puede estar alterada."
        )
    if len(candidates) > 1:
        reasons.append(
            "Varias variantes o familias ofrecen resultados cercanos. Una muestra con otras letras puede ayudar a distinguirlas."
        )
    reasons.append(
        "El resultado solo compara las fuentes del catálogo. No demuestra una identidad exacta ni descarta fuentes externas indistinguibles."
    )
    return {
        "status": "candidates" if candidates else "unidentified",
        "candidates": candidates,
        "alternatives": alternatives[:4],
        "reasons": reasons,
        "quality": quality,
        "text": text,
        "normalizedSource": contour_png(normalized(source), (0, 144, 155)),
        "search": {**search, "comparedVariants": len(ranked)},
        "catalog": {
            "name": CATALOG["name"],
            "families": len(set(f["family"] for f in CATALOG["fonts"])),
            "variants": len(CATALOG["fonts"]),
            "revision": CATALOG["revision"],
        },
        "method": "Búsqueda inicial con índice de glifos y comparación detallada de hasta 32 variantes reales. Distancia de contornos: no es una probabilidad. Umbral de candidatas 0,155; alternativas solo hasta 0,20. Una selección puede omitir la fuente correcta.",
    }
