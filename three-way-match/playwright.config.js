// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // ← changed to false so tests run one at a time (important for P2P flows)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  /**
   * Long enough to be watched.
   *
   * A headless run of the full purchase-to-bill takes about 1m40s; the same
   * run headed, paced at 300ms an action so a person can follow it, took 3m11s
   * — 49 seconds short of the old 4-minute limit. A slightly slower day would
   * have timed out mid-bill and reported a product failure that never happened.
   * The platform raises this further still when it drives a headed run.
   */
  timeout: Number(process.env.TEST_TIMEOUT_MS ?? 240_000),

  use: {
    baseURL: 'https://client-procol-sandbox-demo-deploy-i-1780985635.preview.procol.tech',
    // Visible by default — this suite exists to be watched. The QA platform
    // drives it with HEADLESS=1 when the reader has turned "show the browser"
    // off, so the same config serves both a demo and an unattended run.
    headless: process.env.HEADLESS === "1",
    // 300ms between actions makes a demo followable; the platform sets
    // SLOWMO=0 so an unattended run is not slowed down for nobody's benefit.
    slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 300,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // keep firefox and webkit commented out for now
    
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
});