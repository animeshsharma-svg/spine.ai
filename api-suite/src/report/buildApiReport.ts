#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';

import { readApiCalls } from '../lib/apiLog';
import { buildModel } from './apiModel';
import { renderReport } from './apiHtml';

/**
 * Builds `reports/po-run-report.html` from whatever is in `reports/api-calls/`.
 *
 * A different filename from the suite's `api-report.html` on purpose: the two
 * answer different questions, and a PO run followed by a test run would
 * otherwise silently overwrite whichever ran first.
 *
 * The Playwright reporter does this at the end of a test run, but `npm run po`
 * is a plain CLI — no runner, so no reporter fires. The evidence is written all
 * the same, because the capture hook lives in `apiRequest`, so a report can be
 * rebuilt from it at any time:
 *
 *     npm run po           # writes the evidence, then this
 *     npm run report:po    # rebuild from the last run's evidence
 */

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'reports');

export function buildApiReport(): { out: string; calls: number; steps: number } | undefined {
  // Only this process's calls: the evidence directory is shared, so reading
  // all of it would fold stray calls from other scripts into the PO run.
  const calls = readApiCalls(undefined, { onlyThisProcess: true });
  if (calls.length === 0) return undefined;

  const model = buildModel({
    // A CLI run has no test results; the model derives its rows from the step
    // labels the script set via setApiLogStep.
    mode: 'run',
    tests: [],
    calls,
    startedAt: calls[0]?.timestamp,
    finishedAt: new Date().toISOString(),
    // Most frequent real client, not calls[0] — an unauthenticated call is
    // recorded as "(no credentials)" and must not label the whole run.
    environment: {
      clientId:
        [...calls.reduce((tally, c) => {
          if (c.clientId && !c.clientId.startsWith('(')) {
            tally.set(c.clientId, (tally.get(c.clientId) ?? 0) + 1);
          }
          return tally;
        }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown',
    },
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, 'po-run-report.html');
  fs.writeFileSync(out, renderReport(model), 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'po-run-report.json'),
    JSON.stringify(model, null, 2) + '\n',
    'utf8'
  );
  return { out, calls: calls.length, steps: model.totals.tests };
}

function main(): void {
  const result = buildApiReport();
  if (!result) {
    console.error(
      'No API calls found in reports/api-calls/ — run `npm run po` or the test ' +
        'suite first, then rebuild the report.'
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Wrote ${path.relative(process.cwd(), result.out)} ` +
      `(${result.steps} step(s), ${result.calls} API call(s))`
  );
}

if (require.main === module) main();
