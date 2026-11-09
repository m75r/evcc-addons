// Playwright gegen echtes evcc (Docker) hinter dem Proxy; Webserver und Seed über das SDK
import { defineConfig, devices } from "@playwright/test";
import { e2eWebServers, PROXY_URL } from "@evcc-addons/sdk/testing/playwright";
import path from "node:path";
import { seedZips } from "./seed.mjs";

const root = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "tests",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "line" : "list",
  outputDir: path.resolve(root, "test-results"),
  use: {
    baseURL: PROXY_URL,
    locale: "de-DE",
    trace: "retain-on-failure",
  },
  webServer: e2eWebServers({
    root,
    evccConfig: "e2e/fixtures/evcc.yaml",
    zips: seedZips(),
    prepare: "e2e/seed.mjs",
  }),
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      dependencies: ["setup"],
    },
  ],
});
