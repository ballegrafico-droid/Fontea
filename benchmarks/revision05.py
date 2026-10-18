"""Paired 0.4 -> 0.5 catalogue regression, unchanged thresholds, fresh Chrome per row.
Samples pre-exist in the independent 0.4 evaluation. No tuning on this set.
"""

import base64, hashlib, json, pathlib, statistics, subprocess, threading, time
import psutil
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/revision-0.5"
BASE = "http://127.0.0.1:4173"
before = ROOT / "out/qa-before05.js"
snapshot = subprocess.check_output(
    ["git", "show", "3ebcb1d:src/browser/matcher.worker.ts"], cwd=ROOT
).decode()
# Resolve unchanged dependencies from their real source paths; main baseline code is the historical commit.
for name in ("retrieval", "regions"):
    snapshot = snapshot.replace(
        '"./' + name + '"', json.dumps(str(ROOT / "src/browser" / f"{name}.ts"))
    )
source = pathlib.Path("/tmp/fontea-before05-worker.ts")
source.write_text(snapshot)
subprocess.run(
    [
        str(ROOT / "node_modules/.bin/esbuild"),
        str(source),
        "--bundle",
        "--format=esm",
        "--outfile=" + str(before),
    ],
    check=True,
    capture_output=True,
)
source.unlink()
after = next((ROOT / "out/assets").glob("matcher.worker-*.js"))
manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
ids = [
    "old-inter-400-clean",
    "old-inter-700-clean",
    "old-roboto-400-italic-clean",
    "old-poppins-400-clean",
    "new-dancingscript-400-clean",
    "new-fredoka-400-clean",
    "new-grandstander-700-italic-degraded",
    "new-bangers-400-degraded",
    "outside-0",
    "outside-4",
    "multiline-0",
    "multiline-3",
    "short-0",
    "low-resolution",
]
samples = {
    x["sample"]: x
    for x in json.loads((ROOT / "docs/revision-0.4/samples.json").read_text())
}
rows = []


def memory(proc, stop, values):
    while not stop.is_set():
        pss = 0
        try:
            children = proc.children(recursive=True)
        except psutil.Error:
            children = []
        for child in children:
            try:
                for line in (
                    pathlib.Path(f"/proc/{child.pid}/smaps_rollup")
                    .read_text()
                    .splitlines()
                ):
                    if line.startswith("Pss:"):
                        pss += int(line.split()[1]) * 1024
            except (OSError, psutil.Error):
                pass
        values["pss"] = max(values.get("pss", 0), pss)
        stop.wait(0.04)


try:
    with sync_playwright() as p:
        proc = psutil.Process()
        for i, sid in enumerate(ids):
            s = samples[sid]
            im = ROOT / "tests/artifacts/revision04" / f"{sid}.png"
            for engine in (["before", "after"] if i % 2 == 0 else ["after", "before"]):
                browser = p.chromium.launch(
                    executable_path="/usr/bin/chromium", args=["--no-sandbox"]
                )
                page = browser.new_page()
                page.goto(BASE)
                page.evaluate("document.fonts.ready")
                page.set_content("<p>Isolated font regression</p>")
                stop = threading.Event()
                values = {}
                sampler = threading.Thread(target=memory, args=(proc, stop, values))
                sampler.start()
                try:
                    r = page.evaluate(
                        """async ({url,image,text,catalog})=>{const w=new Worker(url,{type:'module'}),blob=new Blob([Uint8Array.from(atob(image),c=>c.charCodeAt(0))],{type:'image/png'}),start=performance.now();const response=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{w.terminate();reject(Error('timeout'))},60000);w.onmessage=e=>{clearTimeout(t);resolve(e.data)};w.onerror=e=>{clearTimeout(t);reject(Error(e.message))};w.postMessage({image:blob,text,catalog})});w.terminate();if(!response.ok)throw Error(response.error);const r=response.result;return {ms:performance.now()-start,status:r.status,top:r.search?.top1??null,candidates:r.candidates.map(f=>f.id),alternatives:r.alternatives.map(f=>({id:f.id,distance:f.distance})),compared:r.search.comparedVariants};}""",
                        {
                            "url": (
                                "/qa-before05.js"
                                if engine == "before"
                                else "/assets/" + after.name
                            ),
                            "image": base64.b64encode(im.read_bytes()).decode(),
                            "text": s["text"],
                            "catalog": manifest,
                        },
                    )
                finally:
                    stop.set()
                    sampler.join()
                    browser.close()
                rows.append(
                    {
                        "sample": sid,
                        "engine": engine,
                        "expected": s["expected"],
                        "group": s["group"],
                        "peakPssBytes": values.get("pss", 0),
                        **r,
                    }
                )
                print(
                    f'{i+1}/{len(ids)} {engine} {sid} {r["status"]} {r["ms"]:.0f}ms',
                    flush=True,
                )
    differences = []
    for sid in ids:
        b, a = [
            next(r for r in rows if r["sample"] == sid and r["engine"] == e)
            for e in ("before", "after")
        ]
        for key in ("status", "top", "candidates", "alternatives", "compared"):
            if b[key] != a[key]:
                differences.append(
                    {"sample": sid, "field": key, "before": b[key], "after": a[key]}
                )
    summary = {
        "baselineCommit": "3ebcb1d42d52fdd0ea7f0f7ccff99e78fd2a14be",
        "samples": len(ids),
        "observations": len(rows),
        "differences": differences,
        "catalogFamilies": 117,
        "catalogVariants": 203,
        "afterWorkerSha256": hashlib.sha256(after.read_bytes()).hexdigest(),
        "notes": [
            "Same existing independent FreeType samples; corrected text, not OCR accuracy.",
            "Fresh Chromium profile per observation, alternating order. Linux process tree PSS at 40 ms; not JavaScript-only heap or physical mobile.",
            "No commercial font data or user logo. This is regression verification, not a general precision estimate.",
        ],
        "rows": rows,
    }
    for engine in ("before", "after"):
        rr = [r for r in rows if r["engine"] == engine]
        summary[engine] = {
            "medianMs": statistics.median(r["ms"] for r in rr),
            "medianPssMiB": statistics.median(r["peakPssBytes"] / 2**20 for r in rr),
            "maxPssMiB": max(r["peakPssBytes"] / 2**20 for r in rr),
            "coveredTopFamily": sum(
                r["top"] and r["top"]["id"] == r["expected"]
                for r in rr
                if r["group"] in ("original", "added")
            ),
            "correctVariantProposals": sum(
                r["expected"] in r["candidates"] for r in rr
            ),
            "wrongProposals": sum(
                bool(r["candidates"]) and r["expected"] not in r["candidates"]
                for r in rr
            ),
            "multilineBlocked": sum(r["status"] == "needs_crop" for r in rr),
        }
    (OUT / "regression.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    )
    assert not differences, differences
    print(
        json.dumps(
            {k: v for k, v in summary.items() if k not in ("rows", "notes")},
            ensure_ascii=False,
        )
    )
finally:
    before.unlink(missing_ok=True)
