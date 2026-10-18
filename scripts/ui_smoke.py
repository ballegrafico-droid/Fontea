"""Browser checks against a running production build. No hosted preview needed."""

import base64, json, os, pathlib, sys
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3001"
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium", args=["--no-sandbox"]
    )
    page = browser.new_page(
        viewport={"width": 1440, "height": 1000}, device_scale_factor=1
    )
    # Private Sites verification: inject only into same-origin requests. Never saved.
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
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.evaluate("document.fonts.ready")
    expect(
        page.get_by_role("heading", name="Esa letra tiene un nombre.")
    ).to_be_visible()
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        assert not page.evaluate(
            "document.documentElement.scrollWidth>innerWidth"
        ), f"overflow {width}"
    checks.append("No horizontal overflow at 320, 390, 768 and 1440 px")
    page.screenshot(
        path=str(
            ROOT
            / (
                "docs/browser/desktop.png"
                if os.environ.get("FONTEA_WEB_QA")
                else "docs/desktop.png"
            )
        ),
        full_page=True,
    )
    page.get_by_role("button", name="El catálogo", exact=True).click()
    expect(page.get_by_role("dialog")).to_be_visible()
    expect(page.locator(".catalog-list>div")).to_have_count(117)
    page.get_by_placeholder("Nombre de la familia").fill("Fredoka")
    expect(page.locator(".catalog-list>div")).to_have_count(1)
    page.get_by_placeholder("Nombre de la familia").fill("")
    page.locator(".catalog-controls select").select_option("manuscrita")
    assert page.locator(".catalog-list>div").count() >= 20
    page.locator(".catalog-controls select").select_option("")
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).not_to_be_visible()
    checks.append("Catalogue dialog: 117 real families, keyboard dismissal")
    page.get_by_role(
        "button", name="Prueba un ejemplo de demostración", exact=False
    ).click()
    expect(page.get_by_role("button", name="Leer el recorte")).to_be_visible()
    expect(page.get_by_text("DEMOSTRACIÓN · INTER BOLD", exact=True)).to_be_visible()
    handle = page.locator(".ReactCrop__drag-handle.ord-se")
    bounds = handle.bounding_box()
    assert bounds
    before = page.locator(".ReactCrop__crop-selection").get_attribute("style")
    page.mouse.move(
        bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2
    )
    page.mouse.down()
    page.mouse.move(bounds["x"] - 25, bounds["y"] - 8, steps=5)
    page.mouse.up()
    assert page.locator(".ReactCrop__crop-selection").get_attribute("style") != before
    checks.append("Crop rectangle responds to pointer dragging")
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.locator("#workspace").screenshot(
        path=str(
            ROOT
            / (
                "docs/browser/crop-desktop.png"
                if os.environ.get("FONTEA_WEB_QA")
                else "docs/crop-desktop.png"
            )
        )
    )
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.locator("#ocr-text")).to_have_value(
        "Cada detalle cuenta", timeout=25000
    )
    page.get_by_role("button", name="Buscar en el catálogo").click()
    expect(page.get_by_role("heading", name="Tenemos candidatos.")).to_be_visible(
        timeout=50000
    )
    first = page.locator(".candidate").first
    expect(first.get_by_role("heading", name="Inter", exact=True)).to_be_visible()
    expect(first.get_by_text("Bold · 700", exact=True)).to_be_visible()
    first.get_by_role("button", name="Comparar contornos", exact=False).click()
    expect(first.get_by_role("slider")).to_be_visible()
    first.get_by_role("slider").focus()
    page.keyboard.press("ArrowRight")
    official = first.get_by_role("link", name="Fuente oficial")
    assert official.get_attribute("href") == "https://fonts.google.com/specimen/Inter"
    download = first.get_by_role("link", name="Descargar archivo de Inter")
    # Browser fetch uses the same proxy, cookies and private-site routing as the UI.
    # A separate APIRequestContext may bypass the environment proxy / select IPv6.
    response = page.evaluate(
        """async url => {
      const response=await fetch(url), bytes=await response.arrayBuffer();
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      return {status:response.status,sha256:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')};
    }""",
        download.get_attribute("href"),
    )
    expected_font = next(
        f
        for f in json.loads((ROOT / "catalog/manifest.json").read_text())["fonts"]
        if f["id"] == "inter-700"
    )
    assert response["status"] == 200 and response["sha256"] == expected_font["sha256"]
    page.locator("#results").screenshot(
        path=str(
            ROOT
            / (
                "docs/browser/results-desktop.png"
                if os.environ.get("FONTEA_WEB_QA")
                else "docs/results-desktop.png"
            )
        )
    )
    checks.append(
        "Desktop: labelled demo → full crop → real OCR → Inter Bold candidate → overlay → matching official/download links"
    )
    # A short transcription must display no source candidate, only explicit alternatives.
    page.locator("#ocr-text").fill("HHH")
    page.get_by_role("button", name="Buscar en el catálogo").click()
    expect(page.get_by_role("heading", name="Todavía no tiene nombre.")).to_be_visible(
        timeout=50000
    )
    expect(
        page.get_by_role("heading", name="Candidatos a la fuente original")
    ).not_to_be_visible()
    expect(
        page.get_by_role("heading", name="No encontramos alternativas útiles.")
    ).to_be_visible()
    checks.append(
        "No-identification state for insufficient distinct letters, without unhelpful alternatives"
    )
    page.goto(BASE)
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("document.fonts.ready")
    page.screenshot(
        path=str(
            ROOT
            / (
                "docs/browser/mobile.png"
                if os.environ.get("FONTEA_WEB_QA")
                else "docs/mobile.png"
            )
        ),
        full_page=True,
    )
    # File selection is separate from the demonstration route.
    page.locator("input[type=file]").set_input_files(
        str(ROOT / "public/demo-inter.png")
    )
    expect(page.get_by_role("button", name="Leer el recorte")).to_be_visible()
    expect(
        page.get_by_text("DEMOSTRACIÓN · INTER BOLD", exact=True)
    ).not_to_be_visible()
    # A synthetic paste event tests the actual application's clipboard handler.
    encoded = base64.b64encode((ROOT / "public/demo-inter.png").read_bytes()).decode()
    page.evaluate(
        """data=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'pegada.png',{type:'image/png'}));window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt}));}""",
        encoded,
    )
    expect(page.get_by_text("pegada.png", exact=True)).to_be_visible()
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.locator("#ocr-text")).to_have_value(
        "Cada detalle cuenta", timeout=25000
    )
    page.get_by_role("button", name="Buscar en el catálogo").click()
    expect(page.get_by_role("heading", name="Tenemos candidatos.")).to_be_visible(
        timeout=50000
    )
    assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
    page.locator("#results").screenshot(
        path=str(
            ROOT
            / (
                "docs/browser/results-mobile.png"
                if os.environ.get("FONTEA_WEB_QA")
                else "docs/results-mobile.png"
            )
        )
    )
    checks.append(
        "390 px mobile: file upload, clipboard event, crop, OCR, comparison and results without overflow"
    )
    # Explicit English re-read uses the same crop; no silent OCR selection.
    page.locator("input[type=file]").set_input_files(
        str(ROOT / "public/ejemplos/demostracion-ingles-lato.png")
    )
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.locator("#ocr-text")).to_be_enabled(timeout=25000)
    page.locator("#ocr-language").select_option("eng+spa")
    page.get_by_role("button", name="Volver a leer", exact=True).click()
    expect(page.locator("#ocr-text")).to_have_value(
        "Typography & rhythm 538", timeout=25000
    )
    checks.append(
        "Explicit English priority re-reads the same crop and recovers the documented English control"
    )
    if os.environ.get("FONTEA_WEB_QA"):
        # Cancel a real OCR after its recognize message (not just initialization).
        page.evaluate("""() => {
          const original=Worker.prototype.postMessage;
          window.cancelledRealOCR=false;
          Worker.prototype.postMessage=function(message,...rest){
            const result=original.call(this,message,...rest);
            if(message?.action==='recognize'&&!window.cancelledRealOCR){
              window.cancelledRealOCR=true;
              setTimeout(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancelar operación')?.click(),0);
              Worker.prototype.postMessage=original;
            }
            return result;
          };
        }""")
        page.get_by_role("button", name="Volver a leer", exact=True).click()
        expect(
            page.get_by_text(
                "Operación cancelada. Puedes escribir el texto o volver a recortar.",
                exact=True,
            )
        ).to_be_visible(timeout=25000)
        assert page.evaluate("window.cancelledRealOCR")
        page.wait_for_timeout(200)
        page.get_by_role("button", name="Volver a leer", exact=True).click()
        expect(page.locator("#ocr-text")).to_have_value(
            "Typography & rhythm 538", timeout=25000
        )
        checks.append(
            "Real browser OCR cancelled during recognize; terminated Worker releases slot and next OCR succeeds"
        )
    # A real two-family image must block search even after editing flattened text.
    page.locator("input[type=file]").set_input_files(
        str(ROOT / "public/ejemplos/demostracion-varias-tipografias.png")
    )
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.get_by_text("Selecciona una sola línea.", exact=True)).to_be_visible(
        timeout=25000
    )
    expect(page.get_by_role("button", name="Buscar en el catálogo")).to_be_disabled()
    page.locator("#ocr-text").fill("Juegos en el campo Una aventura entre letras")
    expect(page.get_by_role("button", name="Buscar en el catálogo")).to_be_disabled()
    page.locator("#workspace").screenshot(
        path=str(ROOT / "docs/revision-0.4/multiline-mobile.png")
    )
    page.get_by_role("button", name="Seleccionar una línea", exact=True).click()
    expect(page.get_by_role("button", name="Leer el recorte")).to_be_visible()
    checks.append(
        "Two-family/two-line image requires recropping; editing flattened OCR cannot enable comparison"
    )
    # No silent fixture fallback on a malformed upload.
    page.locator("input[type=file]").set_input_files(
        {"name": "bad.png", "mimeType": "image/png", "buffer": b"not an image"}
    )
    expect(page.get_by_role("alert")).to_contain_text("Ese formato no es compatible")
    checks.append("Malformed upload shows understandable error")
    assert not errors, errors
    browser.close()
(
    ROOT
    / (
        "docs/browser/ui-checks.json"
        if os.environ.get("FONTEA_WEB_QA")
        else "docs/ui-checks.json"
    )
).write_text(
    json.dumps(
        {
            "checks": checks,
            "javascriptErrors": errors,
            "browser": "System Chromium through Playwright; Linux emulation, not physical mobile devices",
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print(json.dumps(checks, ensure_ascii=False, indent=2))
