"""Paired cold Python-process matching on a fixed 12-image subset.
No OCR. Peak process RSS via getrusage; excludes Node/Nginx, unlike browser PSS.
"""

import json, pathlib, statistics, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/revision-0.4"
samples = [
    s
    for s in json.loads((OUT / "samples.json").read_text())
    if s["split"] == "evaluation"
]
selected = [samples[i] for i in [0, 8, 21, 23, 24, 31, 40, 55, 56, 63, 64, 71]]
wrapper = """import importlib.util,json,pathlib,resource,sys,time
from PIL import Image
root=pathlib.Path(sys.argv[1]);sys.path.insert(0,str(root/'engine'));engine=sys.argv[2];s=json.loads(sys.argv[3]);path=root/('benchmarks/core_v03.py' if engine=='before' else 'engine/core.py')
spec=importlib.util.spec_from_file_location('measured_core',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
if engine=='before':m.CATALOG=json.loads((root/'benchmarks/v03/catalog.json').read_text())
im=Image.open(root/'tests/artifacts/revision04'/(s['sample']+'.png')).convert('RGB');start=time.perf_counter();r=m.identify(im,s['text']);elapsed=(time.perf_counter()-start)*1000;top=r.get('search',{}).get('top1') or next(iter(r['candidates']+r['alternatives']),{})
print(json.dumps({'ms':elapsed,'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,'status':r['status'],'top1':top.get('id'),'candidates':[f['id'] for f in r['candidates']],'comparedVariants':r.get('search',{}).get('comparedVariants',66)}))
"""
rows = []
for i, s in enumerate(selected):
    for engine in (["before", "after"] if i % 2 == 0 else ["after", "before"]):
        r = subprocess.run(
            [sys.executable, "-c", wrapper, str(ROOT), engine, json.dumps(s)],
            capture_output=True,
            text=True,
            check=True,
            env={
                **__import__("os").environ,
                "OPENBLAS_NUM_THREADS": "1",
                "OMP_NUM_THREADS": "1",
            },
        )
        d = json.loads(r.stdout)
        d.update(
            engine=engine, sample=s["sample"], group=s["group"], expected=s["expected"]
        )
        rows.append(d)
        print(
            engine,
            s["sample"],
            d["status"],
            round(d["ms"]),
            round(d["peakRssBytes"] / 2**20, 1),
            "MiB",
            flush=True,
        )
summary = {}
for engine in ["before", "after"]:
    rs = [r for r in rows if r["engine"] == engine]
    summary[engine] = {
        "samples": len(rs),
        "msMedian": statistics.median(r["ms"] for r in rs),
        "msMax": max(r["ms"] for r in rs),
        "peakRssBytesMedian": statistics.median(r["peakRssBytes"] for r in rs),
        "peakRssBytesMax": max(r["peakRssBytes"] for r in rs),
    }
(OUT / "server-subset.json").write_text(
    json.dumps(
        {
            "note": "Cold Python process per observation, corrected text, no OCR. Wall time inside identify; peak RSS includes imports. Not HTTP time or total Node/Nginx memory. Same fixed subset, alternating order.",
            "rows": rows,
            "summary": summary,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print(json.dumps(summary, indent=2))
