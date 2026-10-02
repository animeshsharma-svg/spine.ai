import { DevStatus, Finding, Priority, openFindings } from './findings';

/**
 * The bug report as a sheet.
 *
 * Same columns, same order, same colour language as the QA bug sheet the team
 * already reads — Issue ID, Status, Dev ETA, Priority, Blocker, Dev Type, Dev
 * Comment, Sprint Week, User Type, Module, Description. A finding can be read
 * here or there without translation, which is the whole point: nobody should
 * have to learn a second bug format because the suite generated it.
 *
 * Rendered by both `npm run report:bugs` (standalone) and the run report, off
 * one function, so the two can never drift.
 */

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Sheet colours, kept literal so the page reads as the sheet it mirrors. */
export const BUG_TABLE_CSS = `
.sheet-wrap { overflow-x: auto; border: 1px solid #c9c9c9; border-radius: 6px; background: #fff; }
table.sheet { border-collapse: collapse; width: 100%; min-width: 1020px; background: #fff;
  font-family: Arial, Helvetica, system-ui, sans-serif; font-size: 12px; color: #202124; }
table.sheet th, table.sheet td { border: 1px solid #d7d7d7; padding: 7px 8px; vertical-align: middle; text-align: left; }
table.sheet thead th { position: sticky; top: 0; z-index: 2; background: #4a86e8; color: #fff;
  font-weight: 700; font-size: 12px; text-align: center; white-space: nowrap; }
table.sheet tbody tr:hover td { background: #f3f7fd; }
table.sheet td.c-id { font-weight: 600; white-space: nowrap; text-align: center; }
table.sheet td.c-mid { text-align: center; white-space: nowrap; }
table.sheet td.c-desc { min-width: 220px; }
table.sheet td.c-comment, table.sheet td.c-note { color: #3c4043; min-width: 100px; font-size: 11.5px; }
table.sheet td.tinted { background: #fce5cd; }
table.sheet tbody tr.is-fixed td.c-id { color: #6b6b6b; }
.chip { display: inline-block; border-radius: 999px; padding: 3px 12px; font-size: 11px;
  font-weight: 700; line-height: 1.5; white-space: nowrap; }
/* The sheet's own status colours, value for value. */
.chip-fixed { background: #38761d; color: #fff; }
.chip-open { background: #a02020; color: #fff; }
.chip-tested { background: #cfe2f3; color: #0b4f6c; }
.chip-deployed { background: #d0e0e3; color: #134f5c; }
.chip-picked { background: #f4c7c3; color: #5c1a16; }
.chip-todo { background: #1155cc; color: #fff; }
.chip-discuss { background: #fce8b2; color: #5c4404; }
.chip-notabug { background: #efefef; color: #5f6368; }
.chip-later { background: #d9d2e9; color: #3d2c66; }
.chip-dupe { background: #990000; color: #fff; }
.chip-feature { background: #674ea7; color: #fff; }
.chip-reopen { background: #7f4f10; color: #fff; }
.chip-p0 { background: #a02020; color: #fff; }
.chip-p1 { background: #f4c7c3; color: #5c1a16; }
.chip-p2 { background: #fff2cc; color: #5c4404; }
.chip-p3 { background: #efefef; color: #5f6368; }
.chip-yes { background: #a02020; color: #fff; }
.chip-no { background: #d9ead3; color: #274e13; }
.chip-dev { background: #a61c00; color: #fff; }
.desc-title { display: block; }
.desc-detail { display: block; margin-top: 4px; color: #5f6368; font-size: 11px; line-height: 1.45; }
.desc-meta { display: block; margin-top: 4px; font-size: 11px; color: #5f6368; }
.desc-meta code { background: #f1f3f4; padding: 1px 4px; border-radius: 3px; font-size: 10px; }
details.desc-more { margin-top: 5px; }
details.desc-more > summary { font-size: 11px; color: #1a73e8; cursor: pointer; list-style: none; width: fit-content; }
details.desc-more > summary::-webkit-details-marker { display: none; }
details.desc-more > summary::before { content: "▸ "; }
details.desc-more[open] > summary::before { content: "▾ "; }
details.desc-more > summary:hover { text-decoration: underline; }
.verify { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.v-confirmed { color: #a02020; }
.v-intermittent { color: #b06000; }
.v-unconfirmed { color: #7a6a00; }
.v-not-a-bug { color: #7a7a7a; }
.sheet-legend { margin: 10px 0 0; font-size: 12px; color: #5f6368; }
.bug-filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; }
.bug-filters input, .bug-filters select { font: inherit; font-size: 13px; padding: 5px 8px;
  border: 1px solid #c9c9c9; border-radius: 6px; background: #fff; color: #202124; }
.bug-filters input { min-width: 240px; }
.bug-count { font-size: 12px; color: #5f6368; }
`;

const STATUS_CHIP: Record<DevStatus, string> = {
  FIXED: 'chip-fixed',
  OPEN: 'chip-open',
  'TO BE TESTED': 'chip-tested',
  'TO BE DEPLOYED': 'chip-deployed',
  'TO BE PICKED': 'chip-picked',
  'TO DO': 'chip-todo',
  'TO BE DISCUSSED': 'chip-discuss',
  'NOT A BUG': 'chip-notabug',
  'FIX LATER': 'chip-later',
  'Duplicate Issue': 'chip-dupe',
  'Feature Bug/ Enhancement': 'chip-feature',
  'Re-open': 'chip-reopen',
};

const PRIORITY_CHIP: Record<Priority, string> = {
  P0: 'chip-p0',
  P1: 'chip-p1',
  P2: 'chip-p2',
  P3: 'chip-p3',
};

const VERIFY_LABEL: Record<Finding['status'], string> = {
  confirmed: 'confirmed',
  intermittent: 'intermittent',
  unconfirmed: 'unconfirmed',
  'not-a-bug': 'ruled out',
};

const COLUMNS = [
  'Issue ID',
  'Status',
  'Dev ETA',
  'Priority',
  'Blocker',
  'DEV TYPE',
  'Dev Comment',
  'Sprint Week',
  'User Type',
  'Module',
  'Description',
  'Notes',
] as const;

function row(f: Finding): string {
  const search = [f.issueId, f.title, f.description, f.detail, f.module, f.endpoint, f.devComment]
    .join(' ')
    .toLowerCase();

  return `
      <tr class="${f.devStatus === 'FIXED' ? 'is-fixed' : ''}"
          data-status="${escapeHtml(f.devStatus)}" data-priority="${escapeHtml(f.priority)}"
          data-module="${escapeHtml(f.module)}" data-blocker="${f.blocker ? 'yes' : 'no'}"
          data-verify="${escapeHtml(f.status)}" data-search="${escapeHtml(search)}">
        <td class="c-id">${escapeHtml(f.issueId)}</td>
        <td class="c-mid"><span class="chip ${STATUS_CHIP[f.devStatus]}">${escapeHtml(f.devStatus)}</span></td>
        <td class="c-mid">${escapeHtml(f.devEta || '—')}</td>
        <td class="c-mid"><span class="chip ${PRIORITY_CHIP[f.priority]}">${escapeHtml(f.priority)}</span></td>
        <td class="c-mid"><span class="chip ${f.blocker ? 'chip-yes' : 'chip-no'}">${f.blocker ? 'YES' : 'NO'}</span></td>
        <td class="c-mid"><span class="chip chip-dev">${escapeHtml(f.devType)}</span></td>
        <td class="c-comment">${escapeHtml(f.devComment || '')}</td>
        <td class="c-mid">${escapeHtml(f.sprintWeek || '—')}</td>
        <td>${escapeHtml(f.userType)}</td>
        <td class="c-mid">${escapeHtml(f.module)}</td>
        <td class="c-desc${f.highlight ? ' tinted' : ''}">
          <strong class="desc-title">${escapeHtml(f.description)}</strong>
          <span class="desc-meta">
            <span class="verify v-${escapeHtml(f.status)}">${escapeHtml(VERIFY_LABEL[f.status])}</span>
            ${f.endpoint ? ` · <code>${escapeHtml(f.endpoint)}</code>` : ''}
            ${f.client ? ` · ${escapeHtml(f.client)}` : ''}
          </span>
          ${
            // The analysis is folded away so a row stays one glance tall, the
            // way it does in the sheet. It is a <details>, not a truncation:
            // nothing is lost, and it prints when opened.
            f.detail || f.evidence
              ? `<details class="desc-more">
                   <summary>what we found${f.evidence ? ' · how to reproduce' : ''}</summary>
                   ${f.detail ? `<span class="desc-detail">${escapeHtml(f.detail)}</span>` : ''}
                   ${f.evidence ? `<span class="desc-detail">Repro: ${escapeHtml(f.evidence)}</span>` : ''}
                 </details>`
              : ''
          }
        </td>
        <td class="c-note">${escapeHtml(f.note || '')}</td>
      </tr>`;
}

/** The sheet itself. Empty findings render as a stated absence, not a blank. */
export function renderBugTable(findings: Finding[]): string {
  if (findings.length === 0) {
    return `<p class="sheet-legend">No findings recorded for this client in <code>config/findings.yaml</code>.</p>`;
  }
  return `
<div class="sheet-wrap">
  <table class="sheet">
    <thead><tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>${findings.map(row).join('')}</tbody>
  </table>
</div>`;
}

/** The filter row. Options are built from the findings actually present. */
export function renderBugFilters(findings: Finding[]): string {
  const unique = (values: string[]): string[] => [...new Set(values)].sort();
  const options = (values: string[]): string =>
    unique(values).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

  return `
<div class="bug-filters">
  <input id="bq" type="search" placeholder="Filter bugs by text, module or endpoint…" aria-label="Filter bugs">
  <select id="bstatus" aria-label="Filter by status"><option value="">Any status</option>${options(
    findings.map((f) => f.devStatus),
  )}</select>
  <select id="bpriority" aria-label="Filter by priority"><option value="">Any priority</option>${options(
    findings.map((f) => f.priority),
  )}</select>
  <select id="bmodule" aria-label="Filter by module"><option value="">Any module</option>${options(
    findings.map((f) => f.module),
  )}</select>
  <select id="bblocker" aria-label="Filter by blocker">
    <option value="">Blocker: any</option><option value="yes">Blocker: yes</option><option value="no">Blocker: no</option>
  </select>
  <span class="bug-count" id="bcount"></span>
</div>`;
}

/** Wires the filter row. Inert if the row is not on the page. */
export const BUG_TABLE_JS = `
(function () {
  var q = document.getElementById("bq");
  if (!q) return;
  var status = document.getElementById("bstatus");
  var priority = document.getElementById("bpriority");
  var mod = document.getElementById("bmodule");
  var blocker = document.getElementById("bblocker");
  var count = document.getElementById("bcount");
  var rows = Array.prototype.slice.call(document.querySelectorAll("table.sheet tbody tr"));

  function apply() {
    var text = q.value.trim().toLowerCase();
    var shown = 0;
    rows.forEach(function (tr) {
      var ok = (!status.value || tr.getAttribute("data-status") === status.value)
        && (!priority.value || tr.getAttribute("data-priority") === priority.value)
        && (!mod.value || tr.getAttribute("data-module") === mod.value)
        && (!blocker.value || tr.getAttribute("data-blocker") === blocker.value)
        && (!text || (tr.getAttribute("data-search") || "").indexOf(text) !== -1);
      tr.style.display = ok ? "" : "none";
      if (ok) shown++;
    });
    count.textContent = shown + " of " + rows.length + " bugs";
  }

  [q, status, priority, mod, blocker].forEach(function (el) {
    el.addEventListener("input", apply);
    el.addEventListener("change", apply);
  });

  // bug-report.html#module=GRN opens filtered to that module. This is what the
  // QA platform links to when someone ticks a feature there: the module is
  // chosen once, in the UI, and the sheet arrives already narrowed.
  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  var wanted = /^module=/.test(hash) ? hash.slice("module=".length) : "";
  if (wanted) {
    for (var i = 0; i < mod.options.length; i++) {
      if (mod.options[i].value.toLowerCase() === wanted.toLowerCase()) {
        mod.value = mod.options[i].value;
        break;
      }
    }
  }
  apply();
})();
`;

/** One-line count strip: what is still open, and how much of it blocks. */
export function bugCounts(findings: Finding[]): {
  total: number;
  open: number;
  blockers: number;
  p0: number;
  fixed: number;
} {
  const open = openFindings(findings);
  return {
    total: findings.length,
    open: open.length,
    blockers: open.filter((f) => f.blocker).length,
    p0: open.filter((f) => f.priority === 'P0').length,
    fixed: findings.filter((f) => f.devStatus === 'FIXED').length,
  };
}
