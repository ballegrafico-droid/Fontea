"""External-connector UI/protocol QA. Explicit test fixtures only, no paid API call.
Runs real missing-key mode first; mocked upstream responses never enter production.
"""

import base64, io, json, os, pathlib, sys
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4175"
OUT = ROOT / "docs/revision-0.6"
if "--node" in sys.argv:
    OUT = OUT / "node"
if not BASE.startswith(("http://127.0.0.1:", "http://localhost:")):
    OUT = OUT / "hosted"
OUT.mkdir(parents=True, exist_ok=True)
ART = ROOT / "tests/artifacts/revision06"
ART.mkdir(parents=True, exist_ok=True)
m = json.loads((ROOT / "catalog/manifest.json").read_text())
entry = next(f for f in m["fonts"] if f["id"] == "inter-700")
f = ImageFont.truetype(str(ROOT / "catalog/fonts" / entry["file"]), 100)
f.set_variation_by_axes(list(entry["axes"].values()))
text = "gráfico"
box = f.getbbox(text)
im = Image.new("RGB", (round(f.getlength(text)) + 80, box[3] - box[1] + 80), "white")
ImageDraw.Draw(im).text((40, 40 - box[1]), text, font=f, fill="#111111")
sample = ART / "synthetic-grafico-inter-700.png"
im.save(sample)
checks = []
requests = []
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium", args=["--no-sandbox"]
    )
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    if os.environ.get("FONTEA_SITES_TOKEN"):
        token = os.environ["FONTEA_SITES_TOKEN"]
        context.route(
            BASE + "/**",
            lambda r: r.continue_(
                headers={
                    **r.request.headers,
                    "OAI-Sites-Authorization": "Bearer " + token,
                }
            ),
        )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    context.on("request", lambda r: requests.append({"url": r.url, "method": r.method}))
    page.goto(BASE)
    page.evaluate("document.fonts.ready")
    expect(
        page.get_by_text("Conector implementado, pendiente de activación.", exact=True)
    ).to_be_visible(timeout=20000)
    status = page.evaluate("async()=>await(await fetch('/api/external/status')).json()")
    assert status["ready"] is False and status["code"] == "missing_key", status
    page.get_by_label("Subir imagen", exact=True).set_input_files(str(sample))
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.locator("#ocr-text")).to_have_value("gráfico", timeout=35000)
    expect(
        page.get_by_role("button", name="Buscar fuentes externas", exact=True)
    ).to_be_disabled()
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 1000})
        assert not page.evaluate(
            "document.documentElement.scrollWidth>innerWidth"
        ), width
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator("#external-search").screenshot(
        path=str(OUT / "external-missing-key-mobile.png")
    )
    assert not [
        r for r in requests if r["method"] == "POST" and "/api/external/" in r["url"]
    ]
    checks.append(
        "Actual backend reports missing_key, real OCR reads synthetic gráfico, external search disabled; no POST or invented candidates"
    )
    # Isolated protocol fixture: intercepted HTTP ONLY in this test browser.
    calls = []
    mode = {"value": "success"}
    context.route(
        BASE + "/api/external/status",
        lambda r: r.fulfill(
            status=200,
            json={
                "ready": True,
                "code": "ready",
                "provider": "WhatFontIs",
                "dailyLimit": 20,
                "message": "TEST FIXTURE: configured status",
            },
        ),
    )

    def reply(route):
        b = json.loads(route.request.post_data)
        calls.append(
            {
                "text": b["text"],
                "lineCount": b["lineCount"],
                "consent": b["consent"],
                "keys": sorted(b),
                "pngBytes": len(base64.b64decode(b["image"])),
            }
        )
        assert b["text"] == "gráfico" and b["lineCount"] == 1 and b["consent"] is True
        assert base64.b64decode(b["image"]).startswith(b"\x89PNG\r\n\x1a\n")
        (ART / "prepared-grafico.png").write_bytes(base64.b64decode(b["image"]))
        assert not any("font" in k.lower() or "key" in k.lower() for k in b)
        if mode["value"] == "quota":
            route.fulfill(
                status=429,
                json={
                    "error": "Cuota agotada · respuesta de prueba",
                    "code": "provider_quota",
                },
            )
            return
        rows = (
            []
            if mode["value"] == "empty"
            else [
                {
                    "provider": "WhatFontIs",
                    "rank": 1,
                    "displayName": "Fixture Sans Bold — TEST ONLY",
                    "detailUrl": "https://www.whatfontis.com/Fixture-Sans-Bold.font",
                    "reportedType": "Commercial",
                    "reportedVendor": "TEST FIXTURE",
                    "license": "unverified",
                }
            ]
        )
        route.fulfill(
            status=200,
            json={
                "status": "external_candidates" if rows else "external_unidentified",
                "provider": "WhatFontIs",
                "candidates": rows,
                "message": "RESPUESTA SIMULADA EXCLUSIVA DE ESTA PRUEBA; no es reconocimiento real.",
                "method": "TEST FIXTURE, no API called",
                "quota": {"used": len(calls), "limit": 20},
            },
        )

    context.route(BASE + "/api/external/identify", reply)
    page.reload()
    page.get_by_label("Subir imagen", exact=True).set_input_files(str(sample))
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.locator("#ocr-text")).to_have_value("gráfico", timeout=35000)
    expect(
        page.get_by_role("button", name="Buscar fuentes externas", exact=True)
    ).to_be_disabled()
    assert not calls
    page.get_by_role("checkbox").check()
    page.get_by_role("button", name="Buscar fuentes externas", exact=True).click()
    expect(page.locator(".external-candidate")).to_have_count(1, timeout=20000)
    expect(page.locator(".external-candidate h4")).to_have_text(
        "Fixture Sans Bold — TEST ONLY"
    )
    assert "Bauhaus" not in page.locator(".external-candidate").inner_text()
    assert (
        page.locator(".external-candidate a").get_attribute("href")
        == "https://www.whatfontis.com/Fixture-Sans-Bold.font"
    )
    assert len(calls) == 1
    page.evaluate(
        "document.body.insertAdjacentHTML('afterbegin','<p style=\"background:#f4d36a;padding:16px;position:sticky;top:0;z-index:100\">PRUEBA DE INTERFAZ CON RESPUESTA SIMULADA. NO ES UNA IDENTIFICACIÓN REAL.</p>')"
    )
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 1000})
        assert not page.evaluate(
            "document.documentElement.scrollWidth>innerWidth"
        ), width
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator("#external-search").screenshot(
        path=str(OUT / "external-result-FIXTURE-mobile.png")
    )
    checks.append(
        "Explicit test fixture: checkbox -> real Worker preparation -> cropped PNG POST -> separate external title/rank/license unknown, no default Bauhaus"
    )
    mode["value"] = "empty"
    page.get_by_role("button", name="Buscar fuentes externas", exact=True).click()
    expect(
        page.get_by_role(
            "heading", name="El proveedor no ha encontrado candidatos.", exact=True
        )
    ).to_be_visible(timeout=20000)
    expect(page.locator(".external-candidate")).to_have_count(0)
    checks.append(
        "Explicit empty-response fixture clears previous candidates; no fallback to any family"
    )
    mode["value"] = "quota"
    page.get_by_role("button", name="Buscar fuentes externas", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("Cuota agotada", timeout=20000)
    expect(page.locator(".external-candidate")).to_have_count(0)
    checks.append(
        "Explicit quota-error fixture displays readable error, no retry and no fabricated matches"
    )
    page.get_by_label("Subir imagen", exact=True).set_input_files(
        str(ROOT / "public/ejemplos/demostracion-varias-tipografias.png")
    )
    page.get_by_role("button", name="Seleccionar imagen completa").click()
    page.get_by_role("button", name="Leer el recorte").click()
    expect(page.get_by_text("Selecciona una sola línea.", exact=True)).to_be_visible(
        timeout=35000
    )
    page.locator("#ocr-text").fill("Juegos en el campo Una aventura entre letras")
    expect(
        page.get_by_role("button", name="Buscar fuentes externas", exact=True)
    ).to_be_disabled()
    assert len(calls) == 3
    checks.append(
        "Actual two-family/two-line image cannot trigger external request after flattened OCR edit"
    )
    assert not any("whatfontis.com" in r["url"] for r in requests)
    assert not errors, errors
    browser.close()
record = {
    "base": BASE,
    "actualProviderCalls": 0,
    "liveProviderAccuracyTested": False,
    "realBackendStatus": status,
    "fixtureCalls": calls,
    "checks": checks,
    "limits": [
        "Known-font synthetic image uses Inter, not the user logo. No claim of Bauhaus identification.",
        "Mock responses only test UI/transport; never used by application code or as production fallback.",
        "No provider key configured. No real external retrieval, timing or commercial accuracy measured.",
    ],
}
(OUT / "external-checks.json").write_text(
    json.dumps(record, ensure_ascii=False, indent=2) + "\n"
)
print(
    json.dumps(
        {
            "checks": len(checks),
            "actualProviderCalls": 0,
            "fixtureRequests": len(calls),
        },
        ensure_ascii=False,
    )
)
