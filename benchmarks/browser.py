"""Evaluate the real browser engine using the unchanged v0.2 held-out cohort.
Run npm run build:web, serve out locally, then this script BASE.
A temporary QA module exports the same production client, never shipped.
"""

import base64, csv, hashlib, json, pathlib, statistics, subprocess, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1"), "Local QA only"
independent = "--pillow" in sys.argv[2:]
OUT = ROOT / ("docs/browser-independent" if independent else "docs/browser")
OUT.mkdir(exist_ok=True)
qa = ROOT / "out/qa-client.js"
worker = next((ROOT / "out/assets").glob("matcher.worker-*.js"))
subprocess.run(
    [
        str(ROOT / "node_modules/.bin/esbuild"),
        "src/browser/client.ts",
        "--bundle",
        "--format=esm",
        '--define:import.meta.env.VITE_ENGINE_TARGET="browser"',
        "--outfile=" + str(qa),
    ],
    cwd=ROOT,
    check=True,
)
qa.write_text(qa.read_text().replace("./matcher.worker.ts", "/assets/" + worker.name))
samples = json.loads(
    (
        OUT / "samples.json" if independent else ROOT / "docs/revision/samples.json"
    ).read_text()
)
rows = []
network_errors, external_requests = [], set()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/chromium", args=["--no-sandbox"]
        )
        page = browser.new_page()
        page.on(
            "request",
            lambda r: (
                external_requests.add(r.url)
                if urlparse(r.url).netloc and not r.url.startswith(BASE + "/")
                else None
            ),
        )
        page.on(
            "response",
            lambda r: (
                network_errors.append((r.status, r.url)) if r.status >= 400 else None
            ),
        )
        page.goto(BASE)
        for i, s in enumerate(samples):
            image = (
                ROOT
                / (
                    "tests/artifacts/browser-independent"
                    if independent
                    else "tests/artifacts/revision"
                )
                / (s["sample"] + ".png")
            )
            assert hashlib.sha256(image.read_bytes()).hexdigest() == s["imageSha256"]
            result = page.evaluate(
                """async ({image,text})=>{
              const {browserRequest}=await import('/qa-client.js');
              const blob=await (await fetch('data:image/png;base64,'+image)).blob();
              const controller=new AbortController();
              let t=performance.now();const ocr=await browserRequest('ocr',blob,'',controller.signal);
              const ocrMs=performance.now()-t;t=performance.now();
              const match=await browserRequest('identify',blob,text,controller.signal);
              return {ocr:ocr.text,ocrMs,identifyMs:performance.now()-t,status:match.status,
                top:(match.candidates.concat(match.alternatives))[0].id,
                topFamily:(match.candidates.concat(match.alternatives))[0].family,
                distance:(match.candidates.concat(match.alternatives))[0].distance,
                proposed:match.candidates.map(f=>f.id)};
            }""",
                {
                    "image": base64.b64encode(image.read_bytes()).decode(),
                    "text": s["text"],
                },
            )
            result.update(
                sample=s["sample"],
                group=s["group"],
                kind=s["kind"],
                expected=s["expected"],
                family=s["family"],
                text=s["text"],
            )
            result["ocrExact"] = result["ocr"] == s["text"]
            result["familyTop1"] = (
                result["topFamily"] == s["family"]
                if s["group"] in ("original", "added")
                else False
            )
            result["variantTop1"] = result["top"] == s["expected"]
            result["containsExpected"] = s["expected"] in result["proposed"]
            result["wrongProposal"] = (
                bool(result["proposed"]) and not result["containsExpected"]
            )
            rows.append(result)
            (OUT / "rows.json").write_text(
                json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
            )
            print(
                f"{i+1}/{len(samples)} {s['sample']}: OCR={result['ocrExact']} top={result['top']} proposed={result['proposed']} {result['identifyMs']:.0f}ms",
                flush=True,
            )
        browser.close()
finally:
    qa.unlink(missing_ok=True)


def summary(group):
    r = [x for x in rows if group == "all" or x["group"] == group]
    v = {
        k: sum(bool(x[k]) for x in r)
        for k in [
            "ocrExact",
            "familyTop1",
            "variantTop1",
            "containsExpected",
            "wrongProposal",
        ]
    }
    v.update(samples=len(r), proposed=sum(bool(x["proposed"]) for x in r))
    for k in ["ocrMs", "identifyMs"]:
        times = sorted(x[k] for x in r)
        v[k + "Median"] = round(statistics.median(times), 1)
        v[k + "P95"] = round(times[int((len(times) - 1) * 0.95)], 1)
    return v


report = {
    "engine": "Tesseract.js 6 / WASM + actual FontFace contours in Chromium worker",
    "criteria": "Strict literal OCR including accents. Corrected transcription for matching. Same gate .155 and gap .025; no exact-identity claims.",
    "cohort": (
        "30 new Pillow/FreeType images, independent rasterizer, fixed before evaluation. Synthetic, not photographs."
        if independent
        else "Unchanged v0.2 115 synthetic held-out images, Chromium renderings. Same rasterizer family as browser matcher; not independent evidence for real photographs."
    ),
    "groups": {g: summary(g) for g in ["original", "added", "outside", "short", "all"]},
    "ocrErrors": [
        {"sample": r["sample"], "expected": r["text"], "actual": r["ocr"]}
        for r in rows
        if not r["ocrExact"]
    ],
    "wrongProposals": [r["sample"] for r in rows if r["wrongProposal"]],
    "networkErrors": network_errors,
    "externalRequests": sorted(external_requests),
}
(OUT / "summary.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(report, ensure_ascii=False, indent=2))
