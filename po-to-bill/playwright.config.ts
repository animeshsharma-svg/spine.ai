import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // The 20 steps are one strict sequential chain (each depends on the previous step's
  // captured uuid) -- never let Playwright shard/parallelize across workers.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
});
