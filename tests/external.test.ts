import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import {
  externalConfiguration,
  validateExternalBody,
  identifyExternal,
  parseExternalCandidates,
  ExternalError,
  PROVIDER_URL,
} from "../server/providers/whatfontis.js";
import { checkExternalPng } from "../server/providers/png-check.js";
import { reserveNodeQuota } from "../server/providers/node-quota.js";
import { externalRouter } from "../server/external.js";
const png = readFileSync("public/demo-inter.png").toString("base64");
const fixture = [
  {
    title: "Fixture Sans Bold",
    url: "https://www.whatfontis.com/Fixture-Sans-Bold.font",
    type: "Commercial",
    site: "Vendor from test fixture",
    confidence: 99.99,
  },
]; // TEST ONLY, never production fallback.
const nativeFetch = fetch;
function isError(code: string) {
  return (e: unknown) => e instanceof ExternalError && e.code === code;
}
test("external provider is disabled without a private key and authorized free access", () => {
  assert.equal(externalConfiguration({}).code, "missing_key");
  assert.equal(
    externalConfiguration({ WFI_API_KEY: "unit-test-key" }).code,
    "missing_access",
  );
  assert.equal(
    externalConfiguration({
      WFI_API_KEY: "unit-test-key",
      WFI_ACCESS: "personal-free",
    }).ready,
    true,
  );
  assert.equal(
    externalConfiguration({
      WFI_API_KEY: "unit-test-key",
      WFI_ACCESS: "personal-free",
      WFI_DAILY_LIMIT: "9999",
    }).ready,
    false,
  );
});
test("real request contract includes commercial fonts and no predefined family or undocumented OCR hint", async () => {
  let calls = 0;
  const request = (async (url: unknown, options: RequestInit) => {
    calls++;
    assert.equal(url, PROVIDER_URL);
    assert.equal(options.redirect, "manual");
    const b = options.body as URLSearchParams;
    assert.equal(b.get("FREEFONTS"), "0");
    assert.equal(b.get("API_KEY"), "unit-test-key");
    assert.equal(b.get("IMAGEBASE64"), "1");
    assert.equal(b.get("urlimagebase64"), png);
    assert.equal(b.get("mode"), "fast");
    assert.equal(b.get("text"), null);
    assert(![...b.values()].some((v) => v === "Bauhaus"));
    return Response.json(fixture);
  }) as typeof fetch;
  const r = await identifyExternal(
    png,
    "unit-test-key",
    new AbortController().signal,
    request,
  );
  assert.equal(calls, 1);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].displayName, "Fixture Sans Bold");
  assert.equal(r.candidates[0].license, "unverified");
  assert(!("confidence" in r.candidates[0]));
  assert(!("distance" in r.candidates[0]));
});
test("empty and unrelated external responses never become a Bauhaus identification", async () => {
  assert.deepEqual(parseExternalCandidates([]), []);
  const r = await identifyExternal(
    png,
    "unit-test-key",
    new AbortController().signal,
    (async () => Response.json([])) as typeof fetch,
  );
  assert.equal(r.status, "external_unidentified");
  assert.deepEqual(r.candidates, []);
  assert.equal(
    parseExternalCandidates(fixture)[0].displayName,
    "Fixture Sans Bold",
  );
});
test("provider URLs are validated and duplicate, injected, or malformed links are rejected", () => {
  assert.throws(
    () =>
      parseExternalCandidates([{ title: "bad", url: "javascript:alert(1)" }]),
    isError("invalid_provider_response"),
  );
  assert.throws(
    () =>
      parseExternalCandidates([
        { title: "bad", url: "https://www.whatfontis.com.evil.test/fake.font" },
      ]),
    isError("invalid_provider_response"),
  );
  assert.throws(
    () => parseExternalCandidates({ error: "upstream problem" }),
    isError("invalid_provider_response"),
  );
  assert.equal(parseExternalCandidates([...fixture, ...fixture]).length, 1);
});
test("quota, permission, invalid JSON and unavailable provider return errors with no fallback", async () => {
  for (const [status, code] of [
    [429, "provider_quota"],
    [402, "provider_quota"],
    [403, "provider_auth"],
    [422, "provider_no_text"],
    [500, "provider_error"],
    [302, "provider_error"],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      () =>
        identifyExternal(
          png,
          "unit-test-key",
          new AbortController().signal,
          (async () => {
            calls++;
            return new Response("never expose raw response or key", { status });
          }) as typeof fetch,
        ),
      isError(code),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    () =>
      identifyExternal(
        png,
        "unit-test-key",
        new AbortController().signal,
        (async () =>
          new Response("<html>upstream problem</html>")) as typeof fetch,
      ),
    isError("invalid_provider_response"),
  );
  await assert.rejects(
    () =>
      identifyExternal(
        png,
        "unit-test-key",
        new AbortController().signal,
        (async () => new Response("x".repeat(600000))) as typeof fetch,
      ),
    isError("provider_response_limit"),
  );
  await assert.rejects(
    () =>
      identifyExternal(
        png,
        "unit-test-key",
        new AbortController().signal,
        (async () => {
          throw Error("test connection failure");
        }) as typeof fetch,
      ),
    isError("provider_connection"),
  );
});
test("external requests require consent, enough letters, one line, PNG signature and bounded dimensions", () => {
  const body = { image: png, text: "gráfico", lineCount: 1, consent: true };
  assert.equal(validateExternalBody(body).text, "gráfico");
  for (const [changes, code] of [
    [{ consent: false }, "consent_required"],
    [{ lineCount: 2 }, "needs_crop"],
    [{ text: "gráfico\nlogo" }, "needs_crop"],
    [{ text: "Dawn" }, "insufficient_letters"],
    [{ image: "no-png" }, "invalid_image"],
    [{ image: "AAAAB" }, "invalid_image"],
  ] as const)
    assert.throws(
      () => validateExternalBody({ ...body, ...changes }),
      isError(code),
    );
});
test("server checks actual PNG regions, not just the client line count", async () => {
  const one = await checkExternalPng(png);
  assert.equal(one.lines, 1);
  const two = readFileSync(
    "public/ejemplos/demostracion-varias-tipografias.png",
  ).toString("base64");
  await assert.rejects(() => checkExternalPng(two), isError("needs_crop"));
  const bad = Buffer.from(png, "base64");
  bad[bad.length - 1] ^= 255;
  await assert.rejects(
    () => checkExternalPng(bad.toString("base64")),
    isError("invalid_image"),
  );
});
test("persistent quota survives reopening, counts failed attempts and reserves atomically", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fontea-quota-test-")),
    file = path.join(dir, "quota.json");
  try {
    assert.equal((await reserveNodeQuota("unit-key", 2, file)).used, 1);
    assert.equal((await reserveNodeQuota("unit-key", 2, file)).used, 2);
    await assert.rejects(
      () => reserveNodeQuota("unit-key", 2, file),
      isError("local_quota"),
    );
    assert.equal((await reserveNodeQuota("other-unit-key", 2, file)).used, 1);
    const result = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        reserveNodeQuota("parallel-key", 1, file),
      ),
    );
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Node endpoint validates before upstream call and returns external candidates in a separate contract", async () => {
  const app = express();
  app.use("/api/external", externalRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  const dir = await mkdtemp(path.join(os.tmpdir(), "fontea-http-quota-"));
  const old = {
    key: process.env.WFI_API_KEY,
    access: process.env.WFI_ACCESS,
    file: process.env.WFI_QUOTA_FILE,
  };
  let upstreamCalls = 0;
  try {
    delete process.env.WFI_API_KEY;
    let r = await nativeFetch(base + "/api/external/status");
    assert.equal((await r.json()).code, "missing_key");
    process.env.WFI_API_KEY = "unit-test-key";
    process.env.WFI_ACCESS = "personal-free";
    process.env.WFI_QUOTA_FILE = path.join(dir, "quota.json");
    globalThis.fetch = (async (url: unknown) => {
      assert.equal(url, PROVIDER_URL);
      upstreamCalls++;
      return Response.json(fixture);
    }) as typeof fetch;
    const send = (b: unknown) =>
      nativeFetch(base + "/api/external/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
    r = await send({
      image: png,
      text: "gráfico",
      lineCount: 1,
      consent: false,
    });
    assert.equal(r.status, 400);
    assert.equal(upstreamCalls, 0);
    r = await send({
      image: readFileSync(
        "public/ejemplos/demostracion-varias-tipografias.png",
      ).toString("base64"),
      text: "Juegos en el campo",
      lineCount: 1,
      consent: true,
    });
    assert.equal(r.status, 422);
    assert.equal(upstreamCalls, 0);
    r = await send({
      image: png,
      text: "gráfico",
      lineCount: 1,
      consent: true,
    });
    assert.equal(r.status, 200);
    const result = await r.json();
    assert.equal(result.status, "external_candidates");
    assert.equal(result.candidates[0].displayName, "Fixture Sans Bold");
    assert.equal(upstreamCalls, 1);
    assert.equal(result.quota.used, 1);
    assert(!JSON.stringify(result).includes("unit-test-key"));
  } finally {
    globalThis.fetch = nativeFetch;
    for (const [k, v] of [
      ["WFI_API_KEY", old.key],
      ["WFI_ACCESS", old.access],
      ["WFI_QUOTA_FILE", old.file],
    ]) {
      if (v === undefined) delete process.env[k!];
      else process.env[k!] = v;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("hosted Worker uses the same real adapter and enforces a persistent atomic SQL quota", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("drizzle/0000_external_quota.sql", "utf8"));
  const { default: worker } = await import("../hosting/worker");
  const env = {
    WFI_API_KEY: "unit-worker-key",
    WFI_ACCESS: "personal-free",
    WFI_DAILY_LIMIT: "1",
    ASSETS: { fetch: async () => new Response("asset fixture") },
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              first: async () =>
                db.prepare(sql).get(...(values as (string | number)[])) ?? null,
            };
          },
        };
      },
    },
  };

  let calls = 0;
  globalThis.fetch = (async (url: unknown) => {
    assert.equal(url, PROVIDER_URL);
    calls++;
    return Response.json(fixture);
  }) as typeof fetch;
  try {
    const status = await worker.fetch(
      new Request("https://fontea.test/api/external/status"),
      env as never,
    );
    assert.equal((await status.json()).ready, true);
    const post = () =>
      worker.fetch(
        new Request("https://fontea.test/api/external/identify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://fontea.test",
          },
          body: JSON.stringify({
            image: png,
            text: "gráfico",
            lineCount: 1,
            consent: true,
          }),
        }),
        env as never,
      );
    let r = await post();
    assert.equal(r.status, 200);
    assert.equal(
      (await r.json()).candidates[0].displayName,
      "Fixture Sans Bold",
    );
    assert.equal(calls, 1);
    r = await post();
    assert.equal(r.status, 429);
    assert.equal((await r.json()).code, "local_quota");
    assert.equal(calls, 1);
    const missing = await worker.fetch(
      new Request("https://fontea.test/api/external/status"),
      { ...env, WFI_API_KEY: undefined } as never,
    );
    assert.equal((await missing.json()).code, "missing_key");
  } finally {
    globalThis.fetch = nativeFetch;
    db.close();
  }
});
