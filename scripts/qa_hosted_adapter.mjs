// Actual Cloudflare runtime + D1 + real PNG validation. Provider intercepted in-memory only.
import {
  Miniflare,
  Response as MFResponse,
} from "../hosting/node_modules/miniflare/dist/src/index.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const image = (
  await readFile("tests/artifacts/revision06/prepared-grafico.png")
).toString("base64");
let calls = 0;
const mf = new Miniflare({
  modules: true,
  scriptPath: "hosting/dist/server/index.js",
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  cf: false,
  d1Databases: ["DB"],
  bindings: {
    WFI_API_KEY: "unit-fixture-key-not-a-real-credential",
    WFI_ACCESS: "personal-free",
    WFI_DAILY_LIMIT: "2",
  },
  outboundService: async (request) => {
    assert.equal(request.url, "https://www.whatfontis.com/api2/");
    calls++;
    const body = await request.formData();
    assert.equal(body.get("FREEFONTS"), "0");
    assert.equal(body.get("urlimagebase64"), image);
    return MFResponse.json([
      {
        title: "Fixture Sans Bold — TEST ONLY",
        url: "https://www.whatfontis.com/Fixture-Sans-Bold.font",
        type: "Commercial",
        site: "TEST FIXTURE",
      },
    ]);
  },
});
const records = [];
try {
  const db = await mf.getD1Database("DB");
  await db.exec(
    (await readFile("drizzle/0000_external_quota.sql", "utf8")).replaceAll(
      "\n",
      " ",
    ),
  );
  const post = (data) =>
    mf.dispatchFetch("https://fontea.test/api/external/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://fontea.test",
      },
      body: JSON.stringify(data),
    });
  const body = { image, text: "gráfico", lineCount: 1, consent: true };
  let r = await post({ ...body, consent: false });
  assert.equal(r.status, 400);
  assert.equal(calls, 0);
  records.push("Consent rejected before provider");
  r = await post({ ...body, lineCount: 2 });
  assert.equal(r.status, 422);
  assert.equal(calls, 0);
  records.push("Multiple-line hint rejected before provider");
  r = await post({
    ...body,
    image: (
      await readFile("public/ejemplos/demostracion-varias-tipografias.png")
    ).toString("base64"),
  });
  assert.equal(r.status, 422);
  assert.equal(calls, 0);
  records.push("Actual two-line image rejected with forged single-line hint");
  for (let i = 1; i <= 2; i++) {
    r = await post(body);
    const answer = await r.json();
    assert.equal(
      r.status,
      200,
      JSON.stringify({ answer, interceptedCalls: calls }),
    );
    assert.equal(answer.quota.used, i);
    assert.equal(
      answer.candidates[0].displayName,
      "Fixture Sans Bold — TEST ONLY",
    );
    assert.equal(answer.candidates[0].license, "unverified");
  }
  records.push(
    "Real browser-prepared PNG accepted by Worker; external test fixture returned through actual adapter and D1",
  );
  r = await post(body);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, "local_quota");
  assert.equal(calls, 2);
  records.push(
    "Persistent SQL limit rejects third call without upstream request",
  );
  const usage = await db.prepare("SELECT used FROM external_usage").first();
  assert.equal(usage.used, 2);
  const record = {
    actualProviderCalls: 0,
    interceptedProviderRequests: calls,
    checks: records,
    limits: [
      "This exercises the built Cloudflare Worker and real local D1. All outbound requests are intercepted by Miniflare; no API service or paid credit is consumed.",
      "No commercial recognition quality is claimed; responses are explicit protocol fixtures.",
    ],
  };
  await mkdir("docs/revision-0.6", { recursive: true });
  await writeFile(
    "docs/revision-0.6/worker-adapter-checks.json",
    JSON.stringify(record, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      checks: records.length,
      interceptedProviderRequests: calls,
      actualProviderCalls: 0,
    }),
  );
} finally {
  await mf.dispose();
}
