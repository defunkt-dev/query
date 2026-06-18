import { defineConfig, devices } from "@playwright/test";

// Boots the SSR dev server (server.mjs) and runs the e2e suite in real Chromium. Run from the
// package root (see e2e/README.md):
//   pnpm exec playwright test --config e2e/playwright.config.ts
// Picks up every *.spec.ts in this folder (resume-liveness + scenarios). The webServer command
// runs in this directory, so server.mjs, src/, and the pages resolve correctly.
export default defineConfig({
  testDir: ".",
  testMatch: /\.spec\.ts$/,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5188",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node server.mjs",
    url: "http://localhost:5188",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});