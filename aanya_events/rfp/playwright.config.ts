import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  // Clears the previous run's state so a report only ever reflects one run.
  globalSetup: "./tests/globalSetup.ts",
  timeout: 120_000,
  fullyParallel: false,
  // One worker, files in order: 01 publish → 02 verify → 03 negative. Each
  // step consumes what the one before it produced.
  workers: 1,
  retries: 0,
  // Our reporter only: it prints one plain line per case. Playwright's own
  // failure output quotes the harness source, which reads as if the test code
  // broke when it was the API that answered wrong.
  reporter: [["./src/reporter.ts"]],
});
