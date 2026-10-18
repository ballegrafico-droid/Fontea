"""Verify canonical official family links; never infer a licence from HTTP 200."""

import concurrent.futures, datetime, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "catalog/manifest.json").read_text())
families = {f["family"]: f["officialUrl"] for f in manifest["fonts"]}


def check(item):
    name, url = item
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, method="HEAD"), timeout=30
        ) as r:
            return {
                "family": name,
                "url": url,
                "status": r.status,
                "resolvedUrl": r.url,
            }
    except Exception as e:
        return {"family": name, "url": url, "error": str(e)}


with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p:
    rows = list(p.map(check, families.items()))
path = ROOT / "docs/revision-0.4/links.json"
path.write_text(
    json.dumps(
        {
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "note": "OFL verified from pinned licence bytes and hashes, not inferred from status. Family names originate in pinned upstream metadata.",
            "links": rows,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print("Verified", sum(r.get("status") == 200 for r in rows), "/", len(rows))
print("Errors", [r for r in rows if r.get("status") != 200])
