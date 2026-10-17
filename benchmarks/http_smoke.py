"""Real HTTP timings on three demo inputs; not a general latency benchmark."""

import json, pathlib, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3001"
samples = {
    s["sample"]: s
    for s in json.loads((ROOT / "docs/revision/samples.json").read_text())
}
rows = []
for name, sid in [
    ("inter-cursiva-espanol", "inter-400-italic-clean"),
    ("fira-sans-bold", "firasans-700-clean"),
    ("dm-sans-regular", "dmsans-400-clean"),
]:
    data = (ROOT / "public/ejemplos" / ("demostracion-" + name + ".png")).read_bytes()
    row = {"sample": sid}
    for op in ["ocr", "identify"]:
        boundary = "fontea-http-smoke-boundary"
        body = (
            b"--"
            + boundary.encode()
            + b'\r\nContent-Disposition: form-data; name="image"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n'
            + data
            + b"\r\n"
        )
        if op == "identify":
            body += (
                b"--"
                + boundary.encode()
                + b'\r\nContent-Disposition: form-data; name="text"\r\n\r\n'
                + samples[sid]["text"].encode()
                + b"\r\n"
            )
        body += b"--" + boundary.encode() + b"--\r\n"
        req = urllib.request.Request(
            base + "/api/" + op,
            data=body,
            headers={"Content-Type": "multipart/form-data; boundary=" + boundary},
        )
        t = time.perf_counter()
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.load(response)
            assert response.status == 200
        row[op + "HttpSeconds"] = round(time.perf_counter() - t, 3)
        if op == "ocr":
            row["ocrText"] = result["text"]
            row["ocrExact"] = result["text"] == samples[sid]["text"]
        else:
            row["status"] = result["status"]
            row["top1"] = (result["candidates"] + result["alternatives"])[0]["id"]
            row["candidateIds"] = [f["id"] for f in result["candidates"]]
    rows.append(row)
(ROOT / "docs/revision/http-checks.json").write_text(
    json.dumps(
        {
            "note": "Current version only, three images; includes HTTP, interpreter startup and PNG results. Not an SLA or a paired before/after HTTP benchmark. Corrected text supplied for identify.",
            "rows": rows,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print(json.dumps(rows, ensure_ascii=False, indent=2))
