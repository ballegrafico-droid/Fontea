import { spawn } from "node:child_process";
const p = spawn(
  process.execPath,
  [
    "hosting/node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "hosting/dist/server/wrangler.json",
    "--local",
    "--persist-to",
    "hosting/.wrangler/state",
    "--ip",
    "127.0.0.1",
    "--port",
    process.env.FONTEA_SITE_PORT ?? "4175",
    "--inspector-port",
    "0",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
      WRANGLER_WRITE_LOGS: "false",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => p.kill(signal));
p.on("exit", (code) => process.exit(code ?? 1));
