import marko from "@marko/vite";
import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

export default defineConfig({
  plugins: [marko()],
  resolve: {
    conditions: ["@tanstack/custom-condition"],
  },
  test: {
    name: packageJson.name,
    dir: "./tests",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: { enabled: true, provider: "istanbul", include: ["src/**/*", "tags/**/*"] },
  },
});