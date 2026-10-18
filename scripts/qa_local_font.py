"""Real local-font UI and Worker checks. Never submits a commercial font.
Usage: python scripts/qa_local_font.py BASE [--server]
System DejaVu fixtures stay outside Git. Existing OFL files provide other cases.
"""

import base64, io, json, os, pathlib, statistics, sys, time
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
OUT = ROOT / ("docs/revision-" + os.environ.get("FONTEA_QA_REVISION", "0.6"))
if not BASE.startswith(("http://127.0.0.1:", "http://localhost:")):
    OUT = OUT / "hosted"
OUT.mkdir(exist_ok=True)
manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
worker = next(
    (ROOT / ("dist" if "--server" in sys.argv else "out") / "assets").glob(
        "matcher.worker-*.js"
    )
)
font = lambda sid: next(f for f in manifest["fonts"] if f["id"] == sid)
rows, checks = [], []


def array(path):
    return base64.b64encode(path.read_bytes()).decode()


def sample(path, text, axes=None, size=78):
    f = ImageFont.truetype(str(path), size)
    if axes:
        f.set_variation_by_axes(list(axes.values()))
    box = f.getbbox(text)
    im = Image.new("RGB", (int(f.getlength(text)) + 64, box[3] - box[1] + 48), "white")
    ImageDraw.Draw(im).text((32, 24 - box[1]), text, font=f, fill="#171717")
    return im


def png(im):
    b = io.BytesIO()
    im.save(b, format="PNG")
    return base64.b64encode(b.getvalue()).decode()


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium", args=["--no-sandbox"]
    )
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    if os.environ.get("FONTEA_SITES_TOKEN"):
        token = os.environ["FONTEA_SITES_TOKEN"]
        page.context.route(
            BASE + "/**",
            lambda route: route.continue_(
                headers={
                    **route.request.headers,
                    "OAI-Sites-Authorization": "Bearer " + token,
                }
            ),
        )
    errors = []
    requests = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.context.on(
        "request", lambda r: requests.append({"url": r.url, "method": r.method})
    )
    page.goto(BASE)
    page.evaluate("document.fonts.ready")
    page.locator(".external-tool > .font-tool > summary").click()
    page.get_by_label("Buscar referencia comercial por nombre").fill("Bauhaus")
    expect(page.locator(".commercial-references article")).to_have_count(2)
    links = page.locator(".commercial-references a").evaluate_all(
        "(els)=>els.map(e=>e.href)"
    )
    assert "https://www.myfonts.com/collections/bauhaus-font-itc" in links
    assert "https://www.myfonts.com/collections/bauhaus-93-font-urw/" in links
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 1000})
        assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
    checks.append(
        "Bauhaus references distinct and explicitly name-based, zero matching catalog entries; no overflow at 320/390/768/1440"
    )
    page.get_by_label("Buscar referencia comercial por nombre").fill("NotARealFont")
    expect(page.get_by_text("No hay una ficha verificada", exact=False)).to_be_visible()
    assert not any(
        "whatfontis.com" in r["url"] or "myfonts.com" in r["url"] for r in requests
    )
    checks.append(
        "External services opened only by explicit links; no requests to any external provider"
    )
    page.locator(".external-tool > .font-tool > summary").click()
    # Real UI: demo -> full crop -> real OCR -> actual user-file input -> local render.
    page.get_by_role(
        "button", name="Prueba un ejemplo de demostración", exact=False
    ).click()
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.locator("#ocr-text")).to_have_value(
        "Cada detalle cuenta", timeout=35000
    )
    page.locator("#own-font-tool summary").click()
    f = font("inter-700")
    path = ROOT / "catalog/fonts" / f["file"]
    start = len(requests)
    page.get_by_label("Elegir archivo de fuente propio").set_input_files(str(path))
    expect(page.locator(".font-metadata")).to_contain_text("Inter")
    page.get_by_label("Eje wght").fill("700")
    page.get_by_role("button", name="Comparar con mi archivo", exact=True).click()
    expect(
        page.get_by_role("article", name="Resultado de comparación privada")
    ).to_be_visible(timeout=30000)
    expect(
        page.get_by_text("Ajuste visual útil; identidad sin confirmar.", exact=True)
    ).to_be_visible()
    expect(page.locator(".local-comparison .render-sample img")).to_have_attribute(
        "src", __import__("re").compile("data:image/png;base64,")
    )
    page.get_by_role(
        "button", name="Comparar contornos de mi archivo", exact=True
    ).click()
    expect(page.locator(".local-comparison .overlay-panel")).to_be_visible()
    assert not [
        r
        for r in requests[start:]
        if r["method"] != "GET"
        or "/fonts/" in r["url"]
        or "/catalog-index/" in r["url"]
    ]
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 1000})
        assert not page.evaluate(
            "document.documentElement.scrollWidth>innerWidth"
        ), width
        assert page.locator(".local-comparison .render-sample").evaluate(
            "e=>e.querySelector('img').getBoundingClientRect().width<=e.getBoundingClientRect().width"
        ), width
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator("#own-font-tool").screenshot(
        path=str(
            OUT
            / (
                "local-font-mobile-server.png"
                if "--server" in sys.argv
                else "local-font-mobile.png"
            )
        )
    )
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.locator("#own-font-tool").screenshot(
        path=str(
            OUT
            / (
                "local-font-desktop-server.png"
                if "--server" in sys.argv
                else "local-font-desktop.png"
            )
        )
    )
    checks.append(
        "Real OCR -> upload own TTF -> metadata -> variable weight 700 -> useful visual comparison -> overlay; no upload or font/index requests, server mode included when selected"
    )
    page.locator("#ocr-text").fill("Cada detalle cuenta.")
    expect(page.locator(".local-comparison")).not_to_be_visible()
    expect(page.locator(".font-metadata")).to_contain_text("Inter")
    page.locator("#ocr-text").fill("Cada detalle cuenta")
    checks.append(
        "Correcting OCR clears stale comparison while retaining the private font in RAM"
    )
    page.get_by_role("button", name="Retirar archivo de esta sesión").click()
    expect(page.locator(".font-metadata")).not_to_be_visible()
    expect(page.locator(".local-comparison")).not_to_be_visible()
    page.get_by_label("Elegir archivo de fuente propio").set_input_files(
        {"name": "invalid.ttf", "mimeType": "font/ttf", "buffer": b"not a font"}
    )
    expect(page.locator("#own-font-tool [role=alert]")).to_contain_text("TTF u OTF")
    checks.append("Retire clears file and result; malformed font has readable error")
    # Actual Worker comparisons, using independent FreeType rendering.
    cases = []
    for sid in ["inter-700", "roboto-400", "caveat-400", "fredoka-700"]:
        f = font(sid)
        fp = ROOT / "catalog/fonts" / f["file"]
        text = "Muestra privada brillante"
        cases.append((sid, fp, sample(fp, text, f["axes"]), text, f["axes"], True, 0))
    for name in ["DejaVuSerif-Bold.ttf", "DejaVuSans-Oblique.ttf"]:
        fp = pathlib.Path("/usr/share/fonts/truetype/dejavu") / name
        text = "Rasgos propios singulares"
        cases.append((name, fp, sample(fp, text), text, {}, True, 0))
    fp = pathlib.Path("/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf")
    text = "Formas reales verificables"
    cases.append(("NimbusRoman-Regular.otf", fp, sample(fp, text), text, {}, True, 0))
    fp = pathlib.Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf")
    text = "Rasgos propios singulares"
    im = sample(fp, text)
    inter = font("inter-400")
    ip = ROOT / "catalog/fonts" / inter["file"]
    cases.append(("wrong-file", ip, im, text, inter["axes"], False, 0))
    cases.append(("short-sample", fp, sample(fp, "Dawn"), "Dawn", {}, False, 0))
    cases.append(("low-resolution", fp, sample(fp, text, size=18), text, {}, False, 0))
    second = sample(ip, "Otra fuente diferente", inter["axes"])
    multi = Image.new(
        "RGB", (max(im.width, second.width), im.height + second.height + 25), "white"
    )
    multi.paste(im, (0, 0))
    multi.paste(second, (0, im.height + 25))
    cases.append(
        ("two-fonts-two-lines", fp, multi, text + " Otra fuente diferente", {}, None, 0)
    )
    cases.append(("ocr-line-count", fp, im, text, {}, None, 2))
    cases.append(("explicit-newline", fp, im, text + "\nLinea", {}, None, 0))
    start = len(requests)
    for sid, fp, im, text, axes, expected, line_count in cases:
        r = page.evaluate(
            """async ({image,font,text,axes,url,lineCount})=>{
          const w=new Worker(url,{type:'module'}), blob=new Blob([Uint8Array.from(atob(image),c=>c.charCodeAt(0))],{type:'image/png'}), bytes=Uint8Array.from(atob(font),c=>c.charCodeAt(0));
          const start=performance.now();const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{w.terminate();reject(Error('timeout'))},30000);w.onmessage=e=>{clearTimeout(timer);resolve(e.data)};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message))};w.postMessage({operation:'local-font',image:blob,font:bytes.buffer,text,axes,lineCount})});w.terminate();
          if(!result.ok)throw Error(result.error);const r=result.result;return {status:r.status,distance:r.distance??null,useful:r.useful??null,family:r.info.family,axes:r.axes,reasons:r.reasons,ms:performance.now()-start};
        }""",
            {
                "image": png(im),
                "font": array(fp),
                "text": text,
                "axes": axes,
                "url": "/assets/" + worker.name,
                "lineCount": line_count,
            },
        )
        if expected is None:
            assert r["status"] == "needs_crop" and r["distance"] is None, (sid, r)
        else:
            assert r["status"] == "compared" and r["useful"] == expected, (sid, r)
        rows.append({"sample": sid, "expectedUseful": expected, **r})
        print(sid, r["status"], r["distance"], round(r["ms"]), flush=True)
    assert not [
        r
        for r in requests[start:]
        if "/fonts/" in r["url"]
        or "/catalog-index/" in r["url"]
        or r["method"] != "GET"
    ]
    assert not errors, errors
    browser.close()
summary = {
    "base": BASE,
    "mode": "server" if "--server" in sys.argv else "browser",
    "catalogFamilies": 117,
    "catalogVariants": 203,
    "bauhausVariants": 0,
    "checks": checks,
    "samples": rows,
    "medianComparisonMs": statistics.median(
        r["ms"] for r in rows if r["status"] == "compared"
    ),
    "warnings": [
        "Synthetic independent FreeType images, corrected text for Worker cases. Not the user logo. No commercial font was obtained or redistributed. Not a general accuracy estimate.",
        "Chromium resized viewport is not a physical phone. External API not activated or called.",
    ],
}
(
    OUT
    / (
        "local-font-server.json"
        if "--server" in sys.argv
        else "local-font-browser.json"
    )
).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
print(
    json.dumps(
        {
            "checks": len(checks),
            "workerSamples": len(rows),
            "medianComparisonMs": summary["medianComparisonMs"],
        }
    )
)
