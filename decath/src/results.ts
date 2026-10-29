import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CASES, ROOT, RUN_ID } from "./config.js";
import { tell } from "./signin.js";

/**
 * One row per case, as Aanya's sheet has them: Expected / Actual / Result /
 * QA comment. "Not tested" is a result too — a case that could not run says
 * why (no login for the user it names, or it changes data and writes were not
 * allowed), never a pass.
 */
export type Verdict = "Pass" | "Fail" | "Not tested";
export interface Result {
  id: string;
  verdict: Verdict;
  actual: string;
  comment?: string;
  shots?: string[];
}

const REPORTS = join(ROOT, "reports");
const runFile = join(REPORTS, "decath-run.json");

const verdicts = new Map<string, Result>();
/** What this run recorded for a case (the test then fails when it is a Fail). */
export const recorded = (id: string): Result | undefined => verdicts.get(id);

export function record(r: Result): void {
  // Where the sheet already has the tester's own result, it is said beside ours — agreeing or not.
  const c = CASES.find((x) => x.id === r.id);
  // A rule Aanya gave that changed what the case expects is said, so the verdict reads against it.
  if (c?.rule) r = { ...r, comment: [r.comment, `Judged by your rule — ${c.rule.replace(/^Aanya, /, "")}${c.sheet?.expected ? ` (the sheet said: “${c.sheet.expected}”)` : ""}.`].filter(Boolean).join(" ") };
  const t = c?.tester;
  if (t) {
    const same = t.result.toUpperCase() === r.verdict.toUpperCase();
    const note = `Your sheet: ${t.result}${t.comment ? ` (“${t.comment}”)` : ""}${r.verdict === "Not tested" ? "" : same ? " — agrees" : " — differs from this run"}.`;
    r = { ...r, comment: [r.comment, note].filter(Boolean).join(" ") };
  }
  verdicts.set(r.id, r);
  mkdirSync(REPORTS, { recursive: true });
  const run = existsSync(runFile) ? JSON.parse(readFileSync(runFile, "utf8")) : null;
  const keep = run?.runId === RUN_ID ? run : { runId: RUN_ID, startedAt: new Date().toISOString(), results: [] as Result[] };
  keep.results = [...keep.results.filter((x: Result) => x.id !== r.id), r];
  keep.updatedAt = new Date().toISOString();
  writeFileSync(runFile, JSON.stringify(keep, null, 2));
  writeFileSync(join(REPORTS, "decath-report.html"), html(keep));
  const mark = r.verdict === "Pass" ? "✓" : r.verdict === "Fail" ? "✗" : "⊘";
  tell(`${r.id} ${mark} ${r.verdict.toUpperCase()} — ${r.actual}`);
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The report: light, one table, the sheet's columns (reports-simple-light). */
function html(run: { runId: string; startedAt: string; results: Result[] }): string {
  const by = new Map(run.results.map((r) => [r.id, r]));
  const n = (v: Verdict) => run.results.filter((r) => r.verdict === v).length;
  const rows = CASES.filter((c) => by.has(c.id))
    .map((c) => {
      const r = by.get(c.id)!;
      const cls = r.verdict === "Pass" ? "pass" : r.verdict === "Fail" ? "fail" : "nt";
      const pics = (r.shots ?? []).map((f) => `<a href="/api/ui-evidence?path=${encodeURIComponent(f)}" target="_blank" rel="noopener">${esc(basename(f).replace(/\.png$/, ""))}</a>`).join("<br>");
      return `<tr><td><b>${esc(c.id)}</b><br><small>${esc(c.module)} · ${esc(c.scenario)}</small></td><td>${esc(c.title)}</td><td>${esc(c.expected)}</td><td>${esc(r.actual)}</td><td><span class="v ${cls}">${esc(r.verdict)}</span></td><td>${esc(r.comment ?? "")}${pics ? `<div class="pics">${pics}</div>` : ""}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decathlon PO visibility</title>
<style>:root{color-scheme:light}body{margin:0;background:#f7f5f0;color:#1f2328;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1180px;margin:0 auto;padding:28px 16px}h1{font-size:22px;margin:0 0 4px}p.sub{margin:0 0 18px;color:#59636e}.sum{display:flex;gap:16px;margin:0 0 16px;font-weight:600}.sum span{padding:4px 10px;border-radius:999px;background:#fff;border:1px solid #e3ded4}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3ded4;border-radius:10px;overflow:hidden}th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid #eee9df}th{background:#f1ede4;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#59636e}small{color:#59636e}.v{display:inline-block;padding:2px 8px;border-radius:999px;font-weight:700;font-size:12px}.pass{background:#dcfce7;color:#166534}.fail{background:#fee2e2;color:#991b1b}.nt{background:#ece9e2;color:#57534e}.pics{margin-top:6px;font-size:12px}.pics a{color:#1d4ed8}</style></head>
<body><main><h1>Decathlon UAT — PO visibility by role</h1><p class="sub">DECATHLON SPORTS INDIA (57675) · run ${esc(run.runId)} · ${esc(new Date(run.startedAt).toLocaleString("en-IN"))}</p>
<div class="sum"><span>✓ ${n("Pass")} passed</span><span>✗ ${n("Fail")} failed</span><span>⊘ ${n("Not tested")} not tested</span></div>
<table><thead><tr><th>Case</th><th>Test case</th><th>Expected</th><th>Actual</th><th>Result</th><th>QA comment</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
}
