// Build-time copy only; browser processing never uploads images or fetches a CDN.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const catalog = JSON.parse(await fs.readFile("catalog/manifest.json", "utf8"));
const ocr = JSON.parse(
  await fs.readFile("engine/tessdata/manifest.json", "utf8"),
);
async function verify(file, expected) {
  if (
    createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex") !== expected
  )
    throw Error(`Integrity check failed: ${file}`);
}
for (const entry of catalog.fonts) {
  await verify(path.join("catalog/fonts", entry.file), entry.sha256);
  await verify(
    path.join("catalog/licenses", entry.licenseFile),
    entry.licenseSha256,
  );
}
for (const entry of ocr.sources)
  await verify(path.join("engine/tessdata", entry.file), entry.sha256);
await verify(
  path.join("catalog/index", catalog.index.file),
  catalog.index.sha256,
);
const out = "out";
await fs.mkdir(path.join(out, "ocr/core"), { recursive: true });
await fs.cp("catalog/fonts", path.join(out, "fonts"), { recursive: true });
await fs.cp("catalog/licenses", path.join(out, "licenses"), {
  recursive: true,
});
await fs.copyFile("catalog/manifest.json", path.join(out, "catalog.json"));
await fs.mkdir(path.join(out, "catalog-index"), { recursive: true });
await fs.copyFile(
  path.join("catalog/index", catalog.index.file),
  path.join(out, "catalog-index", catalog.index.file),
);
await fs.cp("engine/tessdata", path.join(out, "ocr/tessdata"), {
  recursive: true,
});
await fs.copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  path.join(out, "ocr/worker.min.js"),
);
await fs.copyFile(
  "node_modules/tesseract.js/LICENSE.md",
  path.join(out, "ocr/TESSERACT-JS-LICENSE"),
);
await fs.copyFile(
  "node_modules/tesseract.js-core/LICENSE",
  path.join(out, "ocr/core/LICENSE"),
);
for (const name of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm",
])
  await fs.copyFile(
    path.join("node_modules/tesseract.js-core", name),
    path.join(out, "ocr/core", name),
  );
console.log(
  `Browser build: ${catalog.fonts.length} variants / ${new Set(catalog.fonts.map((f) => f.family)).size} families; font/license/model hashes verified. All assets self-hosted.`,
);
