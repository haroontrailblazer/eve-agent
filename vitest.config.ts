import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": dirname(fileURLToPath(import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".eve/**"],
    unstubEnvs: true,
  },
});
