import { defineConfig } from "@playwright/test";

const headed = process.env.DECATH_HEADED === "1";

export default defineConfig({
  testDir: "tests",
  // One browser at a time, cases in the sheet's order: lists read once are reused.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 20 * 60_000,
  reporter: [["list"]],
  use: {
    headless: !headed,
    // Watching (DECATH_HEADED=1): slowed down so each step can be followed.
    launchOptions: headed ? { slowMo: 300 } : {},
    viewport: { width: 1400, height: 860 },
  },
});
