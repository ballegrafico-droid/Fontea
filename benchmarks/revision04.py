"""Paired v0.3 / v0.4 browser benchmark, corrected text; PSS/RSS Linux sampling.
Fresh browser profile for each observation; alternating engine order by sample.
Development and held-out evaluation are separate. No user case is synthesized as
an identified original. Images are FreeType-generated, not the Canvas matcher.
"""

import argparse, base64, hashlib, json, pathlib, statistics, subprocess, threading, time
from urllib.parse import unquote, urlparse
import psutil
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/revision-0.4"
parser = argparse.ArgumentParser()
parser.add_argument("--development", action="store_true")
parser.add_argument("--after-only", action="store_true")
parser.add_argument("--base", default="http://127.0.0.1:4173")
args = parser.parse_args()
assert urlparse(args.base).hostname in ("localhost", "127.0.0.1")
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
    check=True,
    capture_output=True,
)
worker = next((ROOT / "out/assets").glob("matcher.worker-*.js"))
old = json.loads((ROOT / "benchmarks/v03/catalog.json").read_text())
new = json.loads((ROOT / "catalog/manifest.json").read_text())
samples = [
    s
    for s in json.loads((OUT / "samples.json").read_text())
    if s["split"] == ("development" if args.development else "evaluation")
]
font_sizes = {
    p.name: p.stat().st_size for p in (ROOT / "catalog/fonts").iterdir() if p.is_file()
}
rows = (
    [
        r
        for r in json.loads((OUT / "initial-paired-rows.json").read_text())
        if r["engine"] == "before"
    ]
    if args.after_only
    else []
)


def memory(proc, stop, values):
    while not stop.is_set():
        rss = pss = 0
        try:
            children = proc.children(recursive=True)
        except psutil.Error:
            children = []
        for p in children:
            try:
                rss += p.memory_info().rss
                for line in (
                    pathlib.Path(f"/proc/{p.pid}/smaps_rollup").read_text().splitlines()
                ):
                    if line.startswith("Pss:"):
                        pss += int(line.split()[1]) * 1024
                        break
            except (psutil.Error, OSError):
                pass
        values["rss"] = max(values.get("rss", 0), rss)
        values["pss"] = max(values.get("pss", 0), pss)
        stop.wait(0.075)


try:
    with sync_playwright() as p:
        proc = psutil.Process(p._impl_obj._connection._transport._proc.pid)
        for i, s in enumerate(samples):
            engines = (
                ["after"]
                if (args.development or args.after_only)
                else (["before", "after"] if i % 2 == 0 else ["after", "before"])
            )
            path = ROOT / "tests/artifacts/revision04" / (s["sample"] + ".png")
            assert hashlib.sha256(path.read_bytes()).hexdigest() == s["sha256"]
            for engine in engines:
                browser = p.chromium.launch(
                    executable_path="/usr/bin/chromium", args=["--no-sandbox"]
                )
                page = browser.new_page()
                page.goto(args.base)
                page.evaluate("document.fonts.ready")
                page.set_content("<p>Isolated font benchmark</p>")
                requests = []
                page.context.on("request", lambda r: requests.append(r.url))
                values = {}
                stop = threading.Event()
                sampler = threading.Thread(target=memory, args=(proc, stop, values))
                sampler.start()
                try:
                    result = page.evaluate(
                        """async ({image,text,catalog,url})=>{
                   const blob=await(await fetch('data:image/png;base64,'+image)).blob();const worker=new Worker(url,{type:'module'});const start=performance.now();
                   const response=await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({image:blob,text,catalog});});
                   worker.terminate();if(!response.ok)throw Error(response.error);const r=response.result;
                   const top=r.search?.top1??[...r.candidates,...r.alternatives][0]??null;
                   return {ms:performance.now()-start,status:r.status,top1:top?.id??null,topFamily:top?.family??null,distance:top?.distance??null,candidates:r.candidates.map(f=>f.id),alternatives:r.alternatives.map(f=>({id:f.id,distance:f.distance})),search:r.search??null};
                }""",
                        {
                            "image": base64.b64encode(path.read_bytes()).decode(),
                            "text": s["text"],
                            "catalog": old if engine == "before" else new,
                            "url": (
                                "/qa-v03.js"
                                if engine == "before"
                                else "/assets/" + worker.name
                            ),
                        },
                    )
                finally:
                    stop.set()
                    sampler.join()
                    browser.close()
                requested = sorted(
                    {
                        unquote(urlparse(u).path.split("/fonts/", 1)[1])
                        for u in requests
                        if "/fonts/" in urlparse(u).path
                    }
                )
                result.update(
                    engine=engine,
                    sample=s["sample"],
                    group=s["group"],
                    expected=s["expected"],
                    family=s["family"],
                    kind=s["kind"],
                    peakPssBytes=values.get("pss", 0),
                    peakRssBytes=values.get("rss", 0),
                    requestedFontFiles=len(requested),
                    requestedFontBytes=sum(font_sizes.get(f, 0) for f in requested),
                )
                result["familyTop1"] = (
                    result["topFamily"] == s["family"]
                    if s["group"] in ("original", "added", "development")
                    else False
                )
                result["variantTop1"] = result["top1"] == s["expected"]
                result["containsExpected"] = s["expected"] in result["candidates"]
                result["wrongProposal"] = (
                    bool(result["candidates"]) and not result["containsExpected"]
                )
                result["retrievalContainsExpected"] = s["expected"] in (
                    result["search"] or {}
                ).get("selectedIds", [])
                rows.append(result)
                (
                    OUT
                    / (
                        "development-rows.json"
                        if args.development
                        else "paired-rows.json"
                    )
                ).write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
                print(
                    f'{i+1}/{len(samples)} {engine} {s["sample"]}: {result["status"]}, top={result["top1"]}, fonts={len(requested)}, {result["ms"]:.0f}ms, PSS={values.get("pss",0)/2**20:.1f}MiB',
                    flush=True,
                )
finally:
    qa.unlink(missing_ok=True)


def summary(engine, group):
    selected = [
        r
        for r in rows
        if r["engine"] == engine and (group == "all" or r["group"] == group)
    ]
    if not selected:
        return {}
    result = {"samples": len(selected)}
    for key in [
        "familyTop1",
        "variantTop1",
        "containsExpected",
        "wrongProposal",
        "retrievalContainsExpected",
    ]:
        result[key] = sum(bool(r[key]) for r in selected)
    result["proposed"] = sum(bool(r["candidates"]) for r in selected)
    result["needsCrop"] = sum(r["status"] == "needs_crop" for r in selected)
    result["withAlternatives"] = sum(bool(r["alternatives"]) for r in selected)
    for key in [
        "ms",
        "peakPssBytes",
        "peakRssBytes",
        "requestedFontFiles",
        "requestedFontBytes",
    ]:
        values = sorted(r[key] for r in selected)
        result[key + "Median"] = statistics.median(values)
        result[key + "P95"] = values[
            max(0, __import__("math").ceil(len(values) * 0.95) - 1)
        ]
        result[key + "Max"] = max(values)
    return result


report = {
    "baselineReused": args.after_only,
    "timingNote": (
        "Final after-only rerun reuses the unchanged 76 baseline observations from the initial counterbalanced run; same PNG bytes and host, not simultaneous counterbalanced final timing."
        if args.after_only
        else "Engine order alternates by image."
    ),
    "samples": len(samples),
    "split": "development" if args.development else "held-out synthetic evaluation",
    "baselineCommit": "61e6ffb",
    "beforeFamilies": 17,
    "beforeVariants": 66,
    "afterFamilies": len(set(f["family"] for f in new["fonts"])),
    "afterVariants": len(new["fonts"]),
    "candidateGate": 0.155,
    "alternativeGateAfter": 0.20,
    "shortlistLimit": 32,
    "memory": "Peak PSS and aggregate RSS of the Chromium process tree, sampled every 75ms. PSS apportions shared pages; RSS double-counts them. Fresh browser per observation, Node Playwright driver excluded. Not worker JS heap only; browser baseline included.",
    "network": "Sum of original font file sizes requested by the worker, unique files. HTTP cache and encoding are not measured transfer bytes. Fresh browser/profile; UI fonts may already be cached.",
    "groups": {
        e: {
            g: summary(e, g)
            for g in [
                "original",
                "added",
                "outside",
                "multiline",
                "insufficient",
                "development",
                "all",
            ]
        }
        for e in ["before", "after"]
    },
    "wrongProposals": [
        {"engine": r["engine"], "sample": r["sample"], "candidates": r["candidates"]}
        for r in rows
        if r["wrongProposal"]
    ],
    "retrievalMisses": [
        r["sample"]
        for r in rows
        if r["engine"] == "after"
        and r["group"] in ("original", "added", "development")
        and not r["retrievalContainsExpected"]
    ],
}
(OUT / ("development-summary.json" if args.development else "summary.json")).write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
print(json.dumps(report, ensure_ascii=False, indent=2))
