import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { app, apiLimiter } from "../server/app.js";
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
beforeEach(() => apiLimiter.resetKey("127.0.0.1"));
const demo = readFileSync("public/demo-inter.png");
async function post(
  operation: string,
  image: Uint8Array | Buffer,
  text?: string,
  language?: string,
  lineCount?: number,
) {
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(image)], { type: "image/png" }),
    "sample.png",
  );
  if (text !== undefined) form.append("text", text);
  if (language !== undefined) form.append("language", language);
  if (lineCount !== undefined) form.append("lineCount", String(lineCount));
  return fetch(base + "/api/" + operation, { method: "POST", body: form });
}
test("serves actual catalogue and pinned, unmodified, licensed font bytes", async () => {
  const r = await fetch(base + "/api/catalog");
  assert.equal(r.status, 200);
  const publicCatalog = await r.json();
  assert.equal(publicCatalog.fonts.length, 203);
  const baseline = JSON.parse(
    readFileSync("benchmarks/catalog_v01.json", "utf8"),
  );
  const current = JSON.parse(readFileSync("catalog/manifest.json", "utf8"));
  assert.equal(
    new Set(current.fonts.map((f: { family: string }) => f.family)).size,
    117,
  );
  for (const old of baseline.fonts)
    assert.equal(
      current.fonts.find((f: { id: string }) => f.id === old.id).sha256,
      old.sha256,
    );
  assert.equal(
    current.fonts.find((f: { family: string }) => f.family === "Fira Sans")
      .variable,
    false,
  );
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
    assert.equal(
      createHash("sha256")
        .update(readFileSync("catalog/licenses/" + f.licenseFile))
        .digest("hex"),
      f.licenseSha256,
    );
    assert.match(
      readFileSync("catalog/licenses/" + f.licenseFile, "utf8"),
      /sil\s+open\s+font\s+license[,\s]+version\s+1\.1/i,
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
  assert.equal((await spanishResponse.json()).text, "Diseño y tipografía");

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
test("short samples produce no original-font candidates or weak alternatives", async () => {
  const r = await post("identify", demo, "HHH");
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.status, "unidentified");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.search.comparedVariants, 0);
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

test("OCR language selection is explicit and validated", async () => {
  const image = readFileSync("public/ejemplos/demostracion-ingles-lato.png");
  const r = await post("ocr", image, undefined, "eng+spa");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).text, "Typography & rhythm 538");
  const invalid = await post("ocr", demo, undefined, "invalid");
  assert.equal(invalid.status, 400);
});

test("blocks multi-line images before font search even with a flattened transcription", async () => {
  const image = execFileSync(process.env.PYTHON_BIN || "python3", [
    "-c",
    "from PIL import Image,ImageDraw,ImageFont;import sys;im=Image.new('RGB',(780,230),'white');d=ImageDraw.Draw(im);f=ImageFont.truetype('catalog/fonts/poppins-Poppins-Regular.ttf',60);d.text((25,10),'Nubes de colores',font=f,fill='black');d.text((25,125),'Fiesta en el campo',font=f,fill='black');im.save(sys.stdout.buffer,format='PNG')",
  ]);
  const ocrResponse = await post("ocr", image);
  assert.equal(ocrResponse.status, 200);
  assert((await ocrResponse.json()).lineCount > 1);
  const response = await post(
    "identify",
    image,
    "Nubes de colores Fiesta en el campo",
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "needs_crop");
  assert.equal(data.search.comparedVariants, 0);
  assert.equal(data.candidates.length, 0);
  assert.equal(data.alternatives.length, 0);
  const explicit = await post(
    "identify",
    demo,
    "Cada detalle cuenta",
    undefined,
    2,
  );
  assert.equal((await explicit.json()).status, "needs_crop");
  const bad = await post(
    "identify",
    demo,
    "Cada detalle cuenta",
    undefined,
    -1,
  );
  assert.equal(bad.status, 400);
});
test("two-stage search is bounded and returned alternatives satisfy the stricter gate", async () => {
  const response = await post("identify", demo, "Cada detalle cuenta");
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.search.indexedVariants, 203);
  assert(result.search.shortlistedVariants <= 32);
  assert(result.search.comparedVariants <= 32);
  assert(result.search.selectedIds.includes("inter-700"));
  for (const alt of result.alternatives) assert(alt.distance <= 0.2);
});

test("preserves the production API rate limit", async () => {
  for (let i = 0; i < 20; i++)
    assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal((await fetch(base + "/api/health")).status, 429);
});

test("unlisted variable weights are not promoted to a sampled original variant", async () => {
  const image = execFileSync(process.env.PYTHON_BIN || "python3", [
    "-c",
    "import sys;sys.path.insert(0,'engine');from core import *;f=next(f for f in CATALOG['fonts'] if f['id']=='inter-400');mask_image(render(f,'Muestras de color y tipografía',size=86,probe_weight=500)).save(sys.stdout.buffer,format='PNG')",
  ]);
  const response = await post(
    "identify",
    image,
    "Muestras de color y tipografía",
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.candidates.length, 0);
  assert(result.reasons.some((s: string) => s.includes("peso no incluido")));
  assert.equal(result.search.variableWeightChecks, 5);
});
