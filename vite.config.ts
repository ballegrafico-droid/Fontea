import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  // Server-side config only: do not expose dotenv values to the client bundle.
  const env = loadEnv(mode, process.cwd(), "");
  const backend = `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? "3001"}`;
  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      strictPort: true,
      proxy: { "/api": backend, "/fonts": backend, "/licenses": backend },
    },
    preview: { host: "127.0.0.1", strictPort: true, proxy: {} },
  };
});
