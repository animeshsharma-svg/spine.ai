import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { CONFIG, AUTH_FILE } from "./src/config.js";


loadEnv();

/**
 * The vendor/console app is network-laggy; keep actionTimeout tight so stuck
 * clicks fail fast (the resilient locators retry across candidates anyway),
 * while giving whole flows a generous overall budget.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  // Retry a failed journey once by default. A run against a live environment
  // fails for reasons that have nothing to do with the product — a slow
  // response, a popup landing mid-click — and a second attempt separates those
  // from a defect that reproduces every time. The Oracle sees both attempts, so
  // a real defect is still reported; only the flake disappears.
  retries: Number(process.env.UI_RETRIES ?? 1),
  // Event flows legitimately take minutes on this app: composing stages means a
  // sequence of add/delete round-trips (Auction is the default stage and Delete
  // is disabled while one stage remains), then line items, template, sheet and
  // publish. 180s was cutting flows off mid-publish.
  timeout: 360_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: CONFIG.appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
        // Expose a CDP port so the AI healer (Stagehand) can attach to THIS
        // browser when a deterministic selector fails, instead of launching a
        // second one. Only opened when UI_AI_HEAL=1.
        // The AI healer works purely off Playwright's own accessibility tree,
        // so it needs no CDP port and no browser extension — nothing to add here.
        launchOptions: {},
      },
      dependencies: ["setup"],
    },
  ],
});
