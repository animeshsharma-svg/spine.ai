/**
 * The report of a test-case sheet run (sheetRunner.ts): the counts, every bug with its screenshots and the
 * app's own words, then every case with what was done and why it ended as it did — and the same sheet back
 * in its 13 columns with Status filled in.
 */
import * as XLSX from "xlsx";
import type { SheetRun, SheetRunCase, SheetVerdict } from "../checks/sheetRunner.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const img = (file: string) => `/api/ui-evidence?path=${encodeURIComponent(file)}`;
const ORDER: SheetVerdict[] = ["Fail", "Couldn't tell", "Partly checked", "Not run", "Pass"];
const TONE: Record<SheetVerdict, string> = { Pass: "ok", Fail: "bad", "Partly checked": "warn", "Couldn't tell": "idle", "Not run": "idle" };
const dur = (ms: number) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);

function shots(list: Array<{ file: string; caption: string }>): string {
  if (!list.length) return "";
  return `<div class="shots">${list.map((s) => `<figure><a href="${img(s.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${img(s.file)}" alt="${esc(s.caption)}"></a><figcaption>${esc(s.caption)}</figcaption></figure>`).join("")}</div>`;
}

function caseBlock(c: SheetRunCase): string {
  const api = c.api
    ? `<div class="api">${c.api.steps
        .map((s) => `<div class="apistep"><b>${esc(s.title)}</b><div>Sent: ${esc(s.sent)}</div><div>Came back: ${esc(s.cameBack)}${s.appSaid ? ` — the app said ${esc(s.appSaid)}` : ""}</div>${s.checks.length ? `<ul>${s.checks.map((k) => `<li class="${k.ok === false ? "no" : k.ok ? "yes" : "maybe"}">${k.ok === false ? "✗" : k.ok ? "✓" : "?"} ${esc(k.text)}${k.ok === false && k.actual ? ` — it was ${esc(k.actual)}` : ""}</li>`).join("")}</ul>` : ""}</div>`)
        .join("")}</div>`
    : "";
  return `<details class="case ${TONE[c.status]}" id="c-${esc(c.id)}"><summary><span class="id">${esc(c.id)}</span><span class="t">${esc(c.title)}</span><span class="pill ${TONE[c.status]}">${esc(c.status)}</span></summary>
<div class="body"><p class="why">${esc(c.why)}</p>${c.repaired ? `<p class="muted"><b>Repaired by the agent:</b> ${esc(c.repaired.how)}. Before the repair: ${esc(c.repaired.before)}</p>` : ""}${c.startedFrom ? `<p class="muted">Started from: ${esc(c.startedFrom)}</p>` : ""}
<div class="cols"><div><h4>What the case says</h4><ol>${c.case.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p><b>Expected:</b> ${esc(c.case.expected)}</p></div>
<div><h4>What the run did</h4>${c.steps.length ? `<ol class="did">${c.steps.map((s) => `<li class="${s.outcome}"><span>${esc(s.words)}</span>${s.outcome === "failed" && s.detail ? `<em>${esc(s.detail)}</em>` : ""}</li>`).join("")}</ol>` : `<p class="muted">Nothing was run.</p>`}</div></div>${api}${shots(c.shots)}</div></details>`;
}

export function renderSheetReport(run: SheetRun): string {
  const counts = Object.fromEntries(ORDER.map((v) => [v, run.cases.filter((c) => c.status === v).length])) as Record<SheetVerdict, number>;
  const bugs = run.cases.filter((c) => c.bug);
  const ms = run.endedAt ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime() : run.cases.reduce((n, c) => n + c.ms, 0);
  const ui = run.cases.filter((c) => c.layer === "ui").length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test sheet report — ${esc(run.sheet)}</title>
<style>
:root{--bg:#f4f6f9;--paper:#fff;--ink:#17212c;--muted:#5a6676;--line:#dce2e9;--ok:#1b7a4a;--ok-bg:#e3f4ea;--bad:#b42318;--bad-bg:#fde8e6;--warn:#94600a;--warn-bg:#fff1d6;--idle:#5b6675;--idle-bg:#eef0f3;--accent:#0d5a8f}
@media (prefers-color-scheme:dark){:root{--bg:#10151b;--paper:#171e27;--ink:#e3e8ee;--muted:#9aa6b3;--line:#2b3542;--ok:#7fd1a5;--ok-bg:#12301f;--bad:#ff8f84;--bad-bg:#3a1714;--warn:#f2c46b;--warn-bg:#3a2a0d;--idle:#a8b2be;--idle-bg:#222b35;--accent:#7cb8e6}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px max(16px,3vw) 60px}
main{max-width:1180px;margin:0 auto;display:grid;gap:18px}h1{margin:0;font-size:1.7rem}h2{margin:8px 0 4px;font-size:1.15rem}h4{margin:0 0 6px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.muted{color:var(--muted)}.facts{display:flex;flex-wrap:wrap;gap:10px}.fact{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:110px}.fact b{display:block;font-size:1.5rem;font-variant-numeric:tabular-nums}
.fact.bad b{color:var(--bad)}.fact.ok b{color:var(--ok)}.fact.warn b{color:var(--warn)}
.bug{background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--bad);border-radius:10px;padding:14px 16px;display:grid;gap:6px}
.bug .sev{font-size:.75rem;font-weight:700;color:var(--bad);text-transform:uppercase;letter-spacing:.06em}
.case{background:var(--paper);border:1px solid var(--line);border-radius:10px;margin-bottom:6px}.case>summary{display:grid;grid-template-columns:8em minmax(0,1fr) auto;gap:10px;padding:10px 12px;cursor:pointer;list-style:none}.case>summary::-webkit-details-marker{display:none}
.id{font-family:ui-monospace,Menlo,monospace;font-size:.82rem;color:var(--muted)}.t{font-weight:600}
.pill{font-size:.75rem;font-weight:700;border-radius:999px;padding:2px 10px;white-space:nowrap}.pill.ok{color:var(--ok);background:var(--ok-bg)}.pill.bad{color:var(--bad);background:var(--bad-bg)}.pill.warn{color:var(--warn);background:var(--warn-bg)}.pill.idle{color:var(--idle);background:var(--idle-bg)}
.body{border-top:1px solid var(--line);padding:12px 14px;display:grid;gap:10px}.why{margin:0;font-weight:500}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}ol{margin:0;padding-left:1.5em}
.did li.failed{color:var(--bad)}.did li.not\\ reached,.did li[class="not reached"]{color:var(--muted)}.did em{display:block;font-style:normal;font-size:.88rem}
.shots{display:flex;flex-wrap:wrap;gap:10px}.shots figure{margin:0;width:260px;max-width:100%}.shots img{width:100%;border-radius:8px;border:1px solid var(--line)}.shots figcaption{font-size:.8rem;color:var(--muted)}
.api{display:grid;gap:8px}.apistep{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.92rem}.apistep ul{margin:4px 0 0;padding-left:1.1em;list-style:none}.yes{color:var(--ok)}.no{color:var(--bad)}.maybe{color:var(--muted)}
table{border-collapse:collapse;width:100%;font-size:.9rem;background:var(--paper)}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
a{color:var(--accent)}
</style></head><body><main>
<header><div class="muted">Test sheet run · ${esc(run.sheet)} · ${esc(new Date(run.startedAt).toLocaleString())} · company ${run.companyId}</div><h1>${run.cases.length} test case${run.cases.length === 1 ? "" : "s"} run one by one — ${counts.Pass} passed, ${counts.Fail} failed</h1>
<p class="muted">${ui} through the browser and ${run.cases.length - ui} through the API, in ${dur(ms)}${run.status === "stopped" ? ". The run was stopped before the end" : ""}. A failed case is one where the screen or the app contradicted the expected result; when the automation itself could not do a step the case is marked "Couldn't tell" and is not counted as a bug.</p></header>
<div class="facts"><div class="fact ok"><b>${counts.Pass}</b>passed</div><div class="fact bad"><b>${counts.Fail}</b>failed</div><div class="fact warn"><b>${counts["Partly checked"]}</b>partly checked</div><div class="fact"><b>${counts["Couldn't tell"]}</b>couldn't tell</div><div class="fact"><b>${counts["Not run"]}</b>not run</div><div class="fact bad"><b>${bugs.length}</b>bugs found</div></div>
${bugs.length ? `<section><h2>Bugs found</h2><div style="display:grid;gap:10px">${bugs.map((c, i) => `<article class="bug"><span class="sev">Bug ${i + 1} · ${esc(c.bug!.severity)} · ${esc(c.id)}</span><b>${esc(c.bug!.title)}</b><div><b>What happened:</b> ${esc(c.bug!.whatHappened)}</div><div><b>What should happen:</b> ${esc(c.bug!.expected)}</div>${c.bug!.appSaid ? `<div><b>The app said:</b> “${esc(c.bug!.appSaid)}”${c.bug!.rule ? ` (from ${esc(c.bug!.rule)})` : ""}</div>` : ""}${c.bug!.where ? `<div class="muted">Where: ${esc(c.bug!.where)}</div>` : ""}<div><b>Steps to reproduce:</b><ol>${c.case.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>${shots(c.bug!.shots)}<a href="#c-${esc(c.id)}">See the full run of ${esc(c.id)}</a></article>`).join("")}</div></section>` : `<section><h2>No bugs found</h2><p class="muted">No case was contradicted by the screen or the app.</p></section>`}
<section><h2>Every case</h2>${ORDER.flatMap((v) => run.cases.filter((c) => c.status === v)).map(caseBlock).join("")}</section>
</main></body></html>`;
}

const COLS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"];
function statusCell(c: SheetRunCase): string {
  return c.status === "Pass" ? "Pass" : `${c.status} — ${c.why}`;
}

/** The sheet back in its 13 columns with Status filled, plus "Run details" and "Bugs". */
export function exportSheetRun(run: SheetRun, format: "xlsx" | "csv"): { body: Buffer | string; mime: string; name: string } {
  const rows = run.cases.map((c) => ({
    "Test Case ID": c.id, Module: c.case.module, Scenario: c.case.scenario, "Test Case Title": c.case.title, "User Role": c.case.role, Portal: c.case.portal,
    "Pre-conditions": c.case.preconditions, "Test Data": c.case.testData, "Test Steps": c.case.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    "Expected Result": c.case.expected, Priority: c.case.priority, "Test Type": c.case.testType, Status: statusCell(c),
  }));
  const name = `${run.sheet}-results-${run.id}`;
  if (format === "csv") {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return { body: "﻿" + [COLS.map(q).join(","), ...rows.map((r) => COLS.map((h) => q((r as any)[h])).join(","))].join("\n"), mime: "text/csv; charset=utf-8", name: `${name}.csv` };
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLS });
  (ws as any)["!cols"] = [14, 30, 26, 46, 18, 18, 36, 24, 80, 70, 10, 11, 60].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
  const det = XLSX.utils.json_to_sheet(run.cases.map((c) => ({
    "Test Case ID": c.id, Status: c.status, "Why": c.why, "Started from": c.startedFrom ?? "", "What the run did": c.steps.map((s) => `${s.n}. ${s.words} — ${s.outcome}${s.outcome === "failed" && s.detail ? `: ${s.detail}` : ""}`).join("\n"),
    Screenshots: c.shots.map((s) => `${s.caption}: ${s.file}`).join("\n"), "Time (s)": Math.round(c.ms / 1000),
  })));
  (det as any)["!cols"] = [14, 14, 70, 40, 90, 60, 8].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, det, "Run details");
  const bugs = run.cases.filter((c) => c.bug);
  const bs = XLSX.utils.json_to_sheet(bugs.map((c, i) => ({
    "Bug": i + 1, "Test Case ID": c.id, Severity: c.bug!.severity, Title: c.bug!.title, "What happened": c.bug!.whatHappened, "What should happen": c.bug!.expected,
    "The app said": c.bug!.appSaid ?? "", Where: c.bug!.where ?? "", "Steps to reproduce": c.case.steps.map((s, k) => `${k + 1}. ${s}`).join("\n"), Screenshots: c.bug!.shots.map((s) => s.file).join("\n"),
  })), { header: ["Bug", "Test Case ID", "Severity", "Title", "What happened", "What should happen", "The app said", "Where", "Steps to reproduce", "Screenshots"] });
  (bs as any)["!cols"] = [5, 14, 10, 50, 70, 60, 40, 40, 70, 60].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, bs, "Bugs");
  return { body: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: `${name}.xlsx` };
}
