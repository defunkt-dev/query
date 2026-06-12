import { defineConfig, devices } from "@playwright/test";

// Boots the SSR dev server (server.mjs) and runs the probe in real Chromium. Run from
// this e2e/ directory: `npx playwright test`. The webServer command runs in this same
// directory, so server.mjs and the page resolve correctly.
export default defineConfig({
  testDir: ".",
  testMatch: /resume-liveness\.spec\.ts/,
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