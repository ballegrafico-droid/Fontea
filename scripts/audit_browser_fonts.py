import json, pathlib, sys
from playwright.sync_api import sync_playwright

m = json.loads(pathlib.Path("catalog/manifest.json").read_text())
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page = b.new_page()
    page.goto(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173")
    rows = page.evaluate(
        """async entries=>{const seen=new Set(),rows=[];for(const f of entries){if(seen.has(f.file))continue;seen.add(f.file);const r=await fetch('/fonts/'+encodeURIComponent(f.file).replaceAll("%2C",",")),a=await r.arrayBuffer();try{const ff=new FontFace('Audit',a);await ff.load();rows.push({file:f.file,status:r.status,bytes:a.byteLength,ok:true});}catch(e){rows.push({file:f.file,status:r.status,bytes:a.byteLength,magic:[...new Uint8Array(a).slice(0,5)],ok:false,error:String(e)});}}return rows;}""",
        m["fonts"],
    )
    b.close()
pathlib.Path("docs/revision-0.4/font-audit.json").write_text(
    json.dumps(rows, indent=2) + "\n"
)
print("Audited", len(rows), "files. Errors:", [r for r in rows if not r["ok"]])
