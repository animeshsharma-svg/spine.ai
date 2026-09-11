#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';

import { Finding, loadFindings } from './findings';
import { BUG_TABLE_CSS, BUG_TABLE_JS, bugCounts, renderBugFilters, renderBugTable } from './bugTable';

/**
 * Writes `reports/bug-report.html` — the findings as the QA bug sheet.
 *
 *     npm run report:bugs        # after editing config/findings.yaml
 *     npm run open:bugs
 *
 * Standalone from the run report on purpose: bugs outlive a run. A finding
 * confirmed three weeks ago is still a bug today whether or not the suite ran
 * this morning, and it must be readable without going looking for the last
 * green build.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'reports', 'bug-report.html');

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

export function renderBugReport(findings: Finding[]): string {
  const c = bugCounts(findings);
  const tile = (label: string, value: number | string, role = '') =>
    `<div class="btile ${role}"><div class="btile-v">${escapeHtml(value)}</div><div class="btile-l">${escapeHtml(label)}</div></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Procol P2P — bug report</title>
<style>
:root { color-scheme: light; }
body { margin: 0; background: #f6f7f8; color: #202124;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
.wrap { max-width: 1500px; margin: 0 auto; padding: 24px 20px 64px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.sub { margin: 0 0 20px; color: #5f6368; font-size: 13px; }
.card { background: #fff; border: 1px solid #dcdcdc; border-radius: 8px; padding: 16px; margin: 0 0 20px; }
.card h2 { font-size: 15px; margin: 0 0 12px; }
.btiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 0 0 4px; }
.btile { border: 1px solid #dcdcdc; border-radius: 8px; padding: 10px 12px; background: #fbfbfb; }
.btile-v { font-size: 22px; font-weight: 700; }
.btile-l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #5f6368; }
.btile.crit .btile-v { color: #a02020; }
.btile.good .btile-v { color: #1e7a45; }
.legend { color: #5f6368; font-size: 12.5px; margin: 12px 0 0; }
.legend code { background: #f1f3f4; padding: 1px 5px; border-radius: 3px; font-size: 11px; }
${BUG_TABLE_CSS}
</style>
</head>
<body>
<div class="wrap">
  <h1>Procol P2P — bug report</h1>
  <p class="sub">${findings.length} finding${findings.length === 1 ? '' : 's'} from
  <code>config/findings.yaml</code> · generated ${escapeHtml(stamp())}</p>

  <section class="card">
    <h2>Where this stands</h2>
    <div class="btiles">
      ${tile('bugs', c.total)}
      ${tile('still open', c.open, c.open ? 'crit' : '')}
      ${tile('blockers', c.blockers, c.blockers ? 'crit' : '')}
      ${tile('P0 open', c.p0, c.p0 ? 'crit' : '')}
      ${tile('fixed', c.fixed, 'good')}
    </div>
    <p class="legend"><strong>Status</strong> is where the fix has got to.
    <strong>Verification</strong> — under each description — is how far the finding itself was
    proven: <code>confirmed</code> reproduced and agreed wrong, <code>intermittent</code> real but
    not on demand, <code>unconfirmed</code> could still be test data or a wrong expectation,
    <code>ruled out</code> investigated and dismissed, kept so it is not re-filed as new.</p>
  </section>

  <section class="card">
    <h2>Bugs</h2>
    ${renderBugFilters(findings)}
    ${renderBugTable(findings)}
  </section>
</div>
<script>${BUG_TABLE_JS}</script>
</body>
</html>
`;
}

export function buildBugReport(): { out: string; findings: number } {
  const findings = loadFindings();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, renderBugReport(findings), 'utf8');
  // The same rows as data, with every column already resolved.
  //
  // The QA platform shows this curated list at the top of its own bug sheet,
  // and it cannot read YAML — nor should it have to. One file, written next to
  // the HTML, keeps config/findings.yaml the single source of truth while
  // letting anything else render the same rows.
  fs.writeFileSync(
    path.join(path.dirname(OUT), 'findings.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2) + '\n',
    'utf8'
  );
  return { out: OUT, findings: findings.length };
}

function main(): void {
  const result = buildBugReport();
  console.log(
    `Wrote ${path.relative(process.cwd(), result.out)} (${result.findings} finding(s))`
  );
}

if (require.main === module) main();
