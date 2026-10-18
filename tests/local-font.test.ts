import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  inspectLocalFont,
  MAX_FONT_BYTES,
} from "../src/browser/local-font-info";
const manifest = JSON.parse(fs.readFileSync("catalog/manifest.json", "utf8"));
const array = (b: Buffer) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const font = fs.readFileSync("catalog/fonts/" + manifest.fonts[0].file);
test("bounded font metadata reader accepts catalog files within the explicit local-file size limit", () => {
  const files = new Set<string>(
    manifest.fonts.map((f: { file: string }) => f.file),
  );
  assert.equal(files.size, 165);
  for (const file of files) {
    const b = fs.readFileSync("catalog/fonts/" + file);
    if (b.byteLength > MAX_FONT_BYTES) {
      assert.throws(() => inspectLocalFont(array(b)));
      continue;
    }
    const info = inspectLocalFont(array(b));
    assert.ok(info.family && info.style, file);
    assert.ok(info.weight >= 1 && info.weight <= 1000, file);
  }
});
test("local font checks character coverage instead of silently using fallback", () => {
  const info = inspectLocalFont(array(font), "Cada detalle cuenta");
  assert.ok(info.family);
  assert.throws(
    () => inspectLocalFont(array(font), "\u{10ffff}"),
    /no contiene estos caracteres/,
  );
});
test("local font metadata rejects malformed and oversized SFNT files", () => {
  for (const b of [
    new ArrayBuffer(0),
    new ArrayBuffer(12),
    new ArrayBuffer(MAX_FONT_BYTES + 1),
    array(font.subarray(0, 100)),
  ])
    assert.throws(() => inspectLocalFont(b), /TTF u OTF/);
  for (const offset of [16, 20]) {
    const copy = array(font),
      view = new DataView(copy);
    view.setUint32(offset + 4, 0xffffffff);
    assert.throws(() => inspectLocalFont(copy));
  }
  const woff = array(font);
  new DataView(woff).setUint32(0, 0x774f4646);
  assert.throws(() => inspectLocalFont(woff), /TTF u OTF/);
});
test("catalog has zero Bauhaus families or variants", () => {
  assert.equal(
    manifest.fonts.filter((f: { family: string; variant: string }) =>
      /bauhaus/i.test(f.family + " " + f.variant),
    ).length,
    0,
  );
});
