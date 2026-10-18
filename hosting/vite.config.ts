import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "./sites-vite-plugin";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
    sites(),
    cloudflare({
      viteEnvironment: { name: "server" },
      inspectorPort: false,
      config: {
        name: "fontea-api",
        main: "./worker.ts",
        compatibility_date: "2026-05-15",
        compatibility_flags: ["nodejs_compat"],
        observability: { enabled: false },
        assets: {
          directory: "./dist/client",
          binding: "ASSETS",
          run_worker_first: ["/api/*"],
        },
        d1_databases: [
          {
            binding: "DB",
            database_name: "fontea-external-quota",
            database_id: "00000000-0000-4000-8000-000000000000",
          },
        ],
      },
    }),
    {
      name: "fontea-preserve-browser-app",
      async closeBundle() {
        await mkdir("dist/client", { recursive: true });
        await cp("../out", "dist/client", { recursive: true });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
    fs: { allow: [resolve("..")] },
  },
});
