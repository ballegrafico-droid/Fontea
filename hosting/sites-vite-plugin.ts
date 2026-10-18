import { cp, mkdir } from "node:fs/promises";
import type { Plugin } from "vite";
// Sites build integration: preserve project identity and schema migrations in the artifact.
// Authentication is handled by the existing owner-private Sites dispatch, never mocked here.
export function sites(): Plugin {
  return {
    name: "sites",
    async closeBundle() {
      await mkdir("dist/.openai", { recursive: true });
      await cp("../.openai/hosting.json", "dist/.openai/hosting.json");
      await cp("../drizzle", "dist/.openai/drizzle", { recursive: true });
    },
  };
}
