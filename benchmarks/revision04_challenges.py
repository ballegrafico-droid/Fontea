"""Additional uncalibrated challenge: real variable weights absent from catalogue.
Do not tune the matcher on these results; preserve counterexamples, too.
"""

import base64, json, pathlib, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/revision-0.4"
ART = ROOT / "tests/artifacts/revision04"
m = json.loads((ROOT / "catalog/manifest.json").read_text())
old = json.loads((ROOT / "benchmarks/v03/catalog.json").read_text())
qa = ROOT / "out/qa-v03.js"
subprocess.run(
    [
        str(ROOT / "node_modules/.bin/esbuild"),
        "benchmarks/v03/matcher.worker.ts",
        "--bundle",
        "--format=esm",
        "--outfile=" + str(qa),
    ],
    cwd=ROOT,
    capture_output=True,
    check=True,
)
worker = next((ROOT / "out/assets").glob("matcher.worker-*.js")).name
rows = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/chromium", args=["--no-sandbox"]
        )
        page = browser.new_page()
        page.goto("http://127.0.0.1:4174")
        weights = [
            ("inter-400", 500),
            ("inter-700", 650),
            ("roboto-400", 500),
            ("raleway-700", 600),
            ("fredoka-700", 600),
            ("caveat-400", 500),
        ]
        independent = "--independent" in sys.argv
        if independent:
            weights = [
                ("inter-400", 475),
                ("roboto-700", 625),
                ("raleway-400", 575),
                ("fredoka-700", 550),
                ("caveat-400", 575),
                ("nunitosans-700", 675),
            ]
        for fid, weight in weights:
            entry = next(f for f in m["fonts"] if f["id"] == fid)
            f = ImageFont.truetype(str(ROOT / "catalog/fonts" / entry["file"]), 86)
            axes = entry["axes"].copy()
            axes["wght"] = weight
            f.set_variation_by_axes(list(axes.values()))
            text = (
                "Historias, paseos y dibujos 864"
                if independent
                else "Lápices, mapas y sueños 358"
            )
            box = f.getbbox(text)
            im = Image.new(
                "RGB", (int(f.getlength(text)) + 60, box[3] - box[1] + 50), "white"
            )
            ImageDraw.Draw(im).text((30, 25 - box[1]), text, font=f, fill="#161616")
            sid = f"uncatalogued-{fid}-{weight}"
            path = ART / (sid + ".png")
            im.save(path)
            image = base64.b64encode(path.read_bytes()).decode()
            for engine, catalog, url in [
                ("before", old, "/qa-v03.js"),
                ("after", m, "/assets/" + worker),
            ]:
                result = page.evaluate(
                    """async({image,catalog,url,text})=>{const b=await(await fetch('data:image/png;base64,'+image)).blob();const w=new Worker(url,{type:'module'});const r=await new Promise(resolve=>{w.onmessage=e=>resolve(e.data);w.postMessage({image:b,text,catalog});});w.terminate();if(!r.ok)throw Error(r.error);return {status:r.result.status,candidates:r.result.candidates.map(f=>({id:f.id,family:f.family,weight:f.weight,distance:f.distance})),alternatives:r.result.alternatives.map(f=>({id:f.id,distance:f.distance}))};}""",
                    {"image": image, "catalog": catalog, "url": url, "text": text},
                )
                result.update(
                    engine=engine,
                    sample=sid,
                    trueFamily=entry["family"],
                    trueWeight=weight,
                    cataloguedVariant=False,
                )
                rows.append(result)
                print(engine, sid, result["candidates"], flush=True)
        browser.close()
finally:
    qa.unlink(missing_ok=True)
(
    OUT
    / (
        "uncatalogued-weights-independent.json"
        if independent
        else "uncatalogued-weights.json"
    )
).write_text(
    json.dumps(
        {
            "note": "Six additional variable-weight counterexamples. The true weight is absent in both catalogues, even when the family is covered. Any original proposal is an unresolved false variant proposal, despite the UI never claiming exact identity. No gate was tuned on these results.",
            "rows": rows,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
