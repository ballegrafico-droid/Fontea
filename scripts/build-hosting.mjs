import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await rm("hosting/dist", { recursive: true, force: true });
for (const args of [
  ["run", "build:web"],
  ["run", "build", "--prefix", "hosting"],
]) {
  const r = spawnSync("npm", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
      WRANGLER_WRITE_LOGS: "false",
    },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
