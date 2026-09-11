import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observations, resetObservations } from '../utils/observations.js';

/**
 * ONE RECORD PER RUN, WHATEVER HAPPENED.
 *
 * The QA platform builds a run's report out of two things: the narration it
 * reads from stdout, and a result file the journey leaves behind — status,
 * how long it took, the screen it ended on, what broke. This suite wrote
 * neither, so a journey could run start to finish and its report still had
 * nothing in it but a couple of Playwright lines. That is the "it ran, where
 * is the report?" gap.
 *
 * Importing `test` from here instead of from `@playwright/test` is the whole
 * wiring: an auto fixture takes a screenshot and writes the record after every
 * test, pass or fail.
 */

// This package is "type": "commonjs", so these files are transpiled and
// `import.meta` is not available. Playwright runs with the project root — the
// folder holding playwright.config.js — as the working directory, which is
// exactly where findings/ belongs.
const FINDINGS = join(process.cwd(), 'findings');

const runId = () => process.env.QA_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const flowKey = () => process.env.QA_FLOW_KEY ?? 'finance.three_way';
const safe = (s) => String(s).replace(/[^a-z0-9]+/gi, '-');

export const test = base.extend({
  /**
   * Runs for every test without being asked for, so no spec has to remember.
   * `auto` is what makes it unskippable — a journey cannot opt out of leaving
   * a record, which is the point.
   */
  journeyRecord: [
    async ({ page }, use, testInfo) => {
      resetObservations();
      const startedAt = new Date().toISOString();
      const started = Date.now();

      await use();

      const broke = testInfo.status !== 'passed';
      let screenshot;
      try {
        const dir = join(FINDINGS, 'shots');
        mkdirSync(dir, { recursive: true });
        const name = `${runId()}__${safe(flowKey())}__${broke ? 'failed' : 'final'}.png`;
        await page.screenshot({ path: join(dir, name), fullPage: false });
        screenshot = `shots/${name}`;
      } catch {
        // A screenshot that cannot be taken must never change a verdict.
      }

      try {
        const dir = join(FINDINGS, 'results');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, `${runId()}__${safe(flowKey())}.json`),
          JSON.stringify(
            {
              runId: runId(),
              flowKey: flowKey(),
              title: testInfo.title,
              category: 'purchase-to-bill',
              covers:
                'sign in → raise a purchase order → invoice it → receive it (GRN) → bill it, ' +
                'through the browser on the sandbox demo tenant',
              status: broke ? 'broke' : 'passed',
              startedAt,
              durationMs: Date.now() - started,
              companyId: null,
              url: page.url(),
              screenshot,
              error: testInfo.error?.message?.split('\n')[0],
              // The survivable oddities seen on the way through — dropdowns
              // that closed themselves, values that vanished and came back.
              observations: observations(),
            },
            null,
            2,
          ),
        );
      } catch {
        // Same rule: a reporting problem is not a test failure.
      }
    },
    { auto: true },
  ],
});

export { expect };
