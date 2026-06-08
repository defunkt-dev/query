import marko from "@marko/vite";
import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

export default defineConfig({
  plugins: [marko()],
  resolve: {
    // Applies to the web/client transform (the jsdom tests). Resolves
    // @tanstack/query-core to its source via the custom export condition.
    conditions: ["@tanstack/custom-condition"],
  },
  ssr: {
    resolve: {
      // Applies to the SSR transform (node-environment tests, e.g.
      // tests/ssr.test.ts). The top-level resolve.conditions above does NOT
      // carry into SSR, so the custom condition must be repeated here or
      // query-core falls back to its unbuilt ./build/modern entry and Vite
      // reports "Failed to resolve entry for @tanstack/query-core."
      conditions: ["@tanstack/custom-condition"],
    },
  },
  test: {
    name: packageJson.name,
    dir: "./tests",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      enabled: true,
      provider: "istanbul",
      include: ["src/**/*", "tags/**/*"],
    },
  },
});