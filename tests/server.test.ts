import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { app } from "../server/app.js";
const server = app.listen(0, "127.0.0.1");
let base = "";
before(async () => {
  if (!server.listening) await once(server, "listening");
  const addr = server.address();
  assert(addr && typeof addr === "object");
  base = `http://127.0.0.1:${addr.port}`;
});
after(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
);
const demo = readFileSync("public/demo-inter.png");
async function post(
  operation: string,
  image: Uint8Array | Buffer,
  text?: string,
) {
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(image)], { type: "image/png" }),
    "sample.png",
  );
  if (text !== undefined) form.append("text", text);
  return fetch(base + "/api/" + operation, { method: "POST", body: form });
}
test("serves actual catalogue and pinned, unmodified, licensed font bytes", async () => {
  const r = await fetch(base + "/api/catalog");
  assert.equal(r.status, 200);
  const publicCatalog = await r.json();
  assert.equal(publicCatalog.fonts.length, 42);
  const manifest = JSON.parse(readFileSync("catalog/manifest.json", "utf8"));
  for (const f of manifest.fonts) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync("catalog/fonts/" + f.file))
        .digest("hex"),
      f.sha256,
    );
    assert(f.sourceUrl.includes(manifest.revision));
    assert(f.licenseUrl.includes(manifest.revision));
    assert.match(
      readFileSync("catalog/licenses/" + f.licenseFile, "utf8"),
      /SIL OPEN FONT LICENSE Version 1.1/,
    );
    const font = await fetch(base + "/fonts/" + encodeURIComponent(f.file));
    assert.equal(font.status, 200);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await font.arrayBuffer()))
        .digest("hex"),
      f.sha256,
    );
  }
  assert.match(
    r.headers.get("content-security-policy") || "",
    /object-src 'none'/,
  );
});
test("OCR reads real demonstration and comparison returns actual Inter Bold", async () => {
  const read = await post("ocr", demo);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).text, "Cada detalle cuenta");
  const r = await post("identify", demo, "Cada detalle cuenta");
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.status, "candidates");
  assert.equal(result.candidates[0].id, "inter-700");
  assert.equal(result.candidates[0].weight, 700);

  const spanish = execFileSync(process.env.PYTHON_BIN || "python3", [
    "-c",
    "import sys;sys.path.insert(0,'engine');from core import *;f=CATALOG['fonts'][0];mask_image(render(f,'Diseño y tipografía',size=90)).save(sys.stdout.buffer,format='PNG')",
  ]);
  const spanishResponse = await post("ocr", spanish);
  assert.equal(spanishResponse.status, 200);
  assert.match((await spanishResponse.json()).text, /Diseño/);

  assert(result.candidates[0].preview.startsWith("data:image/png;base64,"));
  assert.equal(result.confidence, undefined);
  assert(result.reasons.some((s: string) => s.includes("No demuestra")));
});
test("rejects corrupted files and missing transcription", async () => {
  const corrupt = await post("ocr", Buffer.from("this is not an image"));
  assert.equal(corrupt.status, 422);
  assert.match((await corrupt.json()).error, /imagen/);
  const absent = await post("identify", demo);
  assert.equal(absent.status, 400);
});
test("rejects excessive byte size and dimensions before analysis", async () => {
  const size = await post("ocr", new Uint8Array(8 * 1024 * 1024 + 1));
  assert.equal(size.status, 413);
  const wide = execFileSync(process.env.PYTHON_BIN || "python3", [
    "-c",
    "from PIL import Image;import sys;Image.new('RGB',(6001,13),'white').save(sys.stdout.buffer,format='PNG')",
  ]);
  const dimensions = await post("ocr", wide);
  assert.equal(dimensions.status, 422);
  assert.match((await dimensions.json()).error, /6000/);
});
test("short samples produce no original-font candidates", async () => {
  const r = await post("identify", demo, "HHH");
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.status, "unidentified");
  assert.equal(result.candidates.length, 0);
  assert(result.alternatives.length > 0);
});
test("admits only one concurrent expensive request, then frees the slot", async () => {
  const responses = await Promise.all([
    post("identify", demo, "Cada detalle cuenta"),
    post("identify", demo, "Cada detalle cuenta"),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 503]);
  await Promise.all(responses.map((r) => r.arrayBuffer()));
  const next = await post("ocr", demo);
  assert.equal(next.status, 200);
  await next.arrayBuffer();
});
test("kills a timed-out worker and makes the slot available again", async () => {
  process.env.ENGINE_TIMEOUT_MS = "1";
  try {
    const r = await post("identify", demo, "Cada detalle cuenta");
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /tardado demasiado/);
  } finally {
    delete process.env.ENGINE_TIMEOUT_MS;
  }
  const r = await post("ocr", demo);
  assert.equal(r.status, 200);
  await r.arrayBuffer();
});
