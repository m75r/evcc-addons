// Playwright gegen echtes evcc (Docker) hinter dem Proxy
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "tests",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "line" : "list",
  outputDir: path.resolve(root, "test-results"),
  use: {
    baseURL: "http://localhost:17080",
    locale: "de-DE",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "docker compose -f e2e/docker-compose.yml up --force-recreate",
      cwd: root,
      url: "http://127.0.0.1:17070",
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "node e2e/start-fake-tapo.mjs",
      cwd: root,
      url: "http://127.0.0.1:17090/_test/state",
      timeout: 30_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "node e2e/start-proxy.mjs",
      cwd: root,
      url: "http://127.0.0.1:17080/addons-api/health",
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      dependencies: ["setup"],
    },
  ],
});
