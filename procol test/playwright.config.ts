import { defineConfig } from "@playwright/test";

import { CONFIG } from "./src/config.js";

export default defineConfig({
  testDir: "tests",
  // Clears reports/api-calls/ so a report only ever reflects one run.
  globalSetup: "./tests/globalSetup.ts",
  // Multi-step flows (create → bid → award) under variable API latency need
  // headroom; DB-driven specs resolve catalog/vendor/evaluator first too.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    // Builds reports/api-report.html from the evidence the workers wrote,
    // once every worker has flushed.
    ["./tests/apiReporter.ts"],
  ],
  use: {
    baseURL: CONFIG.baseURL,
    extraHTTPHeaders: {
      "app-version": CONFIG.appVersion,
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Logs in once and stores tokens under .auth/ for reuse.
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "api",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
    },
  ],
});
