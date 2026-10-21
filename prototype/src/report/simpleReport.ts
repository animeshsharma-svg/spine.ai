/**
 * THE SIMPLE RUN REPORTS — what a finished run hands to someone else.
 *
 * Aanya, on the old ones (2026-10-15): "this report is not that good, keep it
 * in light mode, don't show extra data, keep it simple, sharable and
 * understandable." So each report here is one page that reads top to bottom:
 * what was tested, the verdict in one line, the steps (expected, actual,
 * result), and the bugs. Always light, whatever the reader's system theme, and
 * it prints cleanly to PDF.
 *
 *   renderSimpleApiReport(run)       /api/test-report?run=
 *   renderSimpleUiReport(runId)      /api/ui-report?run=
 *   renderSimpleBugReport(found, …)  /api/bug-report?run=
 *
 * Everything that used to sit on those pages — field checks, legends, filters,
 * timings per line, request bodies, editable sheet columns — is still one link
 * away at the foot of each page ("Technical details", the old report with
 * &full=1). The only evidence kept here is what a developer needs to act: the
 * curl of a step, one click open, and the screen a browser run ended on.
 */
import type { RunRecord } from "../runStore.js";
import type { DefectGroup } from "../agents/oracle.js";
import type { JourneyStepRecord } from "../checks/journeyModel.js";
import { escapeHtml, humanText, flowKeyInWords } from "./shared.js";
import { toCurl } from "./curl.js";
import { readJourney } from "./journeyReport.js";
import { findUiResult } from "./uiReport.js";
import { readTrail } from "../ui/trailStore.js";
import { JOURNEY_PHASES, type JourneyStep } from "../ui/journeySteps.js";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";
import { withPlain, type PlainBug } from "./plainBugs.js";
import { sheetFacts } from "./bugSheet.js";
import { loadTriage } from "../triageStore.js";

// ── the page ────────────────────────────────────────────────────────────────
const CSS = `
:root { color-scheme: light; --ink:#1f2328; --muted:#5f6b76; --line:#e4e7eb; --soft:#f6f7f9; --bg:#fff;
  --ok:#1a7f37; --ok-bg:#e7f5ec; --ok-line:#b9e0c5; --bad:#b42318; --bad-bg:#fdeceb; --bad-line:#f4c7c3;
  --warn:#8a5a00; --warn-bg:#fff5db; --warn-line:#f1dca2; --skip:#5f6b76; --skip-bg:#f1f3f5; --accent:#1d4ed8; }
* { box-sizing: border-box; }
html, body { background: var(--bg); }
body { margin: 0; color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.wrap { max-width: 980px; margin: 0 auto; padding: 32px 24px 40px; }
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.kind { margin: 0 0 4px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
h1 { margin: 0; font-size: 24px; line-height: 1.3; }
.meta { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
.print { flex: none; border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 8px; padding: 7px 12px; font: 500 13px inherit; cursor: pointer; }
.verdict { margin: 22px 0 26px; padding: 14px 16px; border: 1px solid; border-radius: 10px; display: flex; gap: 12px; align-items: flex-start; }
.verdict b { display: block; font-size: 16px; }
.verdict span { color: var(--ink); }
.verdict .mark { font-size: 20px; line-height: 1.2; font-weight: 700; }
.verdict.ok { background: var(--ok-bg); border-color: var(--ok-line); } .verdict.ok .mark, .verdict.ok b { color: var(--ok); }
.verdict.bad { background: var(--bad-bg); border-color: var(--bad-line); } .verdict.bad .mark, .verdict.bad b { color: var(--bad); }
.verdict.warn { background: var(--warn-bg); border-color: var(--warn-line); } .verdict.warn .mark, .verdict.warn b { color: var(--warn); }
h2 { font-size: 17px; margin: 28px 0 10px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--soft); }
td { padding: 11px 10px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
td.n { color: var(--muted); }
table.steps { table-layout: fixed; }
col.n { width: 40px; } col.s { width: 22%; } col.r { width: 104px; }
tr.bad td { background: #fffafa; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pill.ok { background: var(--ok-bg); color: var(--ok); } .pill.bad { background: var(--bad-bg); color: var(--bad); }
.pill.warn { background: var(--warn-bg); color: var(--warn); } .pill.skip { background: var(--skip-bg); color: var(--skip); }
.step-t { font-weight: 600; }
.sub { color: var(--muted); font-size: 13px; }
details { margin-top: 6px; }
.curl { position: relative; margin-top: 6px; }
.curl details { margin-top: 0; }
.copy { float: right; margin-left: 8px; border: 1px solid var(--line); background: #fff; color: var(--accent); border-radius: 6px; padding: 1px 8px; font: 500 12px inherit; cursor: pointer; }
.copy:hover { background: var(--soft); }
.copy.done { color: var(--ok); border-color: var(--ok-line); }
summary { cursor: pointer; color: var(--accent); font-size: 12.5px; }
pre { margin: 6px 0 0; padding: 10px 12px; background: var(--soft); border: 1px solid var(--line); border-radius: 8px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
ol.trail { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
ol.trail li { display: grid; grid-template-columns: 22px 1fr; gap: 8px; padding: 8px 2px; border-bottom: 1px solid var(--line); font-size: 14px; }
ol.trail li.phase { display: block; padding: 14px 2px 6px; font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.m { font-weight: 700; text-align: center; } .m.ok { color: var(--ok); } .m.bad { color: var(--bad); } .m.warn { color: var(--warn); } .m.info { color: #9aa3ad; }
ol.trail li.bad { background: #fffafa; }
.shot { display: block; max-width: 100%; border: 1px solid var(--line); border-radius: 8px; margin-top: 4px; }
.bug { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin: 0 0 14px; }
.bug-h { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; margin-bottom: 6px; }
.bug-id { font: 600 12.5px ui-monospace, Menlo, monospace; color: var(--muted); }
.bug h3 { margin: 0 0 6px; font-size: 16px; }
.bug p { margin: 6px 0; }
.bug ol { margin: 4px 0 6px; padding-left: 20px; }
.ea { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.ea div { background: var(--soft); border-radius: 8px; padding: 8px 10px; font-size: 14px; }
.ea b { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.lbl { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-top: 10px; }
.none { color: var(--muted); }
ul.plain { margin: 6px 0; padding-left: 20px; }
.foot { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12.5px; }
a { color: var(--accent); }
@media (max-width: 680px) {
  .wrap { padding: 20px 16px 32px; } .top { flex-direction: column; } .ea { grid-template-columns: 1fr; }
  table.steps thead { display: none; } table.steps tr { display: block; border-bottom: 1px solid var(--line); padding: 8px 0; }
  table.steps td { display: block; border: 0; padding: 3px 0; width: auto; } table.steps td.n { display: inline; }
}
/* a step's response checks (stepChecks) */
.checks { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 8px; }
.ck { display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 12.5px; border: 1px solid var(--line); background: #fff; white-space: nowrap; }
.ck.ok { color: var(--ok); border-color: var(--ok-line); } .ck.bad { color: var(--bad); border-color: var(--bad-line); background: var(--bad-bg); }
.ck small { color: var(--muted); font-size: 11.5px; }
ul.ckfail { margin: 6px 0 0; padding-left: 18px; color: var(--bad); font-size: 13.5px; }
ul.ckfail b { font-weight: 600; }
table.cks { margin-top: 6px; font-size: 13px; table-layout: fixed; }
table.cks td, table.cks th { padding: 5px 6px; }
table.cks th { font-size: 11px; }
table.cks col.cr { width: 104px; } table.cks col.cc { width: 34%; }
/* the full check list sits in its own full-width row under its step */
tr.has-ck > td { border-bottom: 0; padding-bottom: 2px; }
tr.ckrow > td { padding-top: 0; }
tr.ckrow details.cklist { margin-top: 0; }
table.cks tr.g td { background: var(--soft); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
table.cks tr.bad td { background: var(--bad-bg); }
p.cksum { margin: -12px 0 22px; color: var(--muted); font-size: 13.5px; }
@media print { .print, details, .copy, .foot a { display: none !important; } details.cklist { display: block !important; } details.cklist summary { display: none; } .wrap { padding: 0; max-width: none; } .bug, tr { break-inside: avoid; } }
`;

function page(o: { kind: string; title: string; meta: string; body: string; foot: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(o.title)} · spine.ai</title><style>${CSS}</style></head>
<body><main class="wrap">
<div class="top"><div><p class="kind">${escapeHtml(o.kind)}</p><h1>${escapeHtml(o.title)}</h1><p class="meta">${o.meta}</p></div>
<button class="print" onclick="window.print()">Print / Save as PDF</button></div>
${o.body}
<footer class="foot"><span>spine.ai · ${o.foot}</span></footer>
</main>
<script>
// The PDF carries every check: open the lists before printing.
window.addEventListener("beforeprint", () => document.querySelectorAll("details.cklist").forEach((d) => (d.open = true)));
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const text = b.parentElement.querySelector("pre").textContent;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    try { ok = document.execCommand("copy"); } catch {}
    t.remove();
  }
  b.textContent = ok ? "Copied" : "Press ⌘C";
  b.classList.toggle("done", ok);
  if (!ok) { const d = b.parentElement.querySelector("details"); d.open = true; const r = document.createRange(); r.selectNodeContents(d.querySelector("pre")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  setTimeout(() => { b.textContent = "Copy curl"; b.classList.remove("done"); }, 1800);
});
</script>
</body></html>`;
}

/** "15 Oct 2026, 08:30" — the reader's day and time, not an ISO stamp. */
function when(iso?: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
function took(ms?: number): string {
  if (!ms || ms < 1000) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
const sentence = (t: string) => {
  const x = String(t ?? "").replace(/\s+/g, " ").trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
};
const metaLine = (...parts: Array<string | undefined | null | false>) => parts.filter(Boolean).map((p) => escapeHtml(String(p))).join(" · ");
const pill = (cls: "ok" | "bad" | "warn" | "skip", text: string) => `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
const verdictBox = (cls: "ok" | "bad" | "warn", head: string, line: string) =>
  `<div class="verdict ${cls}"><span class="mark">${cls === "ok" ? "✓" : cls === "bad" ? "✗" : "!"}</span><div><b>${escapeHtml(head)}</b><span>${escapeHtml(line)}</span></div></div>`;
/** The step's request as curl: copied in one click, or opened to read. */
const curlBlock = (curl: string) =>
  `<div class="curl"><button type="button" class="copy" data-copy>Copy curl</button><details><summary>Request as curl</summary><pre>${escapeHtml(curl)}</pre></details></div>`;
const curlFold = (req: { method: string; path: string; body?: unknown } | undefined, companyId?: number) =>
  req?.method && req.path ? curlBlock(toCurl(req, companyId)) : "";
const fullLink = (href: string) => `<a href="${escapeHtml(href)}">Technical details</a>`;

// ── the API test report ─────────────────────────────────────────────────────
const STEP_RESULT: Record<string, ["ok" | "bad" | "skip", string]> = {
  worked: ["ok", "Passed"],
  refused: ["bad", "Failed"],
  broken: ["bad", "Failed"],
  "not-run": ["skip", "Not run"],
};

/**
 * EVERY CHECK A STEP'S RESPONSE WENT THROUGH, NOT ONLY THE STEP'S VERDICT.
 *
 * Aanya, 15 Oct: "the api run report only logged the steps that they passed,
 * what about validations? the response time, the status code, data
 * validation, schema validation". Each journey step already carries them
 * (src/checks/apiAssertions.ts) — 173 on a six-step RFQ run — and the report
 * showed none, and said "Passed — all 6 steps worked" over a failed one: the
 * surrogate bid's rank price came back as text ("3211.0"), not a number.
 * Grouped the way a tester reads a response:
 *   Status code    status_2xx
 *   Response time  max_ms, against the step's limit
 *   Schema         json_body, exists, type_is, non_empty, format, one_of, gte, value_matches
 *   Data           equals_request (echoes what was sent), equals_made (matches what earlier steps made)
 * A check that could not be evaluated (pass null: the field is empty for this
 * kind of event) is listed as "did not apply", never as passed.
 */
type CheckGroup = "status" | "time" | "schema" | "data";
const GROUP_OF: Record<string, CheckGroup> = { status_2xx: "status", max_ms: "time", equals_request: "data", equals_made: "data" };
const groupOf = (op: string): CheckGroup => GROUP_OF[op] ?? "schema";
const GROUP_LABEL: Record<CheckGroup, string> = { status: "Status code", time: "Response time", schema: "Schema", data: "Data" };
const GROUPS: CheckGroup[] = ["status", "time", "schema", "data"];
type StepCheck = NonNullable<JourneyStepRecord["assertions"]>["results"][number];
const checksOf = (s: JourneyStepRecord): StepCheck[] => (s.assertions?.results ?? []) as StepCheck[];
const failedChecks = (s: JourneyStepRecord) => checksOf(s).filter((c) => c.pass === false);

/** "10 s" from "≤ 10000 ms (slowest observed: …)". */
function limitOf(expected: string): string {
  const ms = Number(expected.match(/≤\s*(\d+)\s*ms/)?.[1]);
  if (!ms) return "";
  return ms >= 1000 ? `${Math.round(ms / 100) / 10} s` : `${ms} ms`;
}

function stepChecks(s: JourneyStepRecord): { inline: string; list: string } {
  const all = checksOf(s);
  if (!all.length) return { inline: "", list: "" };
  const by = (g: CheckGroup) => all.filter((c) => groupOf(c.op) === g);
  const mark = (ok: boolean) => (ok ? "✓" : "✗");
  const chips: string[] = [];
  const status = by("status")[0];
  if (status || s.status) {
    const ok = status ? status.pass !== false : true;
    chips.push(`<span class="ck ${ok ? "ok" : "bad"}">${mark(ok)} HTTP ${escapeHtml(String(s.status ?? status?.actual ?? "?").replace(/^HTTP\s*/, ""))}</span>`);
  }
  const time = by("time")[0];
  if (time || s.ms) {
    const ok = time ? time.pass !== false : true;
    const lim = time ? limitOf(time.expected) : "";
    chips.push(`<span class="ck ${ok ? "ok" : "bad"}">${mark(ok)} ${escapeHtml(String(s.ms ?? time?.actual ?? ""))}${s.ms ? " ms" : ""}${lim ? ` <small>limit ${escapeHtml(lim)}</small>` : ""}</span>`);
  }
  for (const g of ["schema", "data"] as CheckGroup[]) {
    const xs = by(g);
    if (!xs.length) continue;
    const judged = xs.filter((c) => c.pass !== null);
    const passed = judged.filter((c) => c.pass === true).length;
    const ok = passed === judged.length;
    const na = xs.length - judged.length;
    chips.push(`<span class="ck ${ok ? "ok" : "bad"}">${mark(ok)} ${GROUP_LABEL[g]} ${passed} of ${judged.length}${na ? ` <small>${na} did not apply</small>` : ""}</span>`);
  }
  const bad = all.filter((c) => c.pass === false);
  const failures = bad.length
    ? `<ul class="ckfail">${bad.map((c) => `<li><b>${GROUP_LABEL[groupOf(c.op)]}</b> — ${escapeHtml(c.humanTitle || c.title)}. Got: ${escapeHtml(c.humanActual || c.actual || "")}</li>`).join("")}</ul>`
    : "";
  const rows = GROUPS.flatMap((g) => {
    const xs = by(g);
    if (!xs.length) return [];
    return [
      `<tr class="g"><td colspan="4">${GROUP_LABEL[g]}</td></tr>`,
      ...xs.map((c) => {
        const [cls, word]: ["ok" | "bad" | "skip", string] = c.pass === true ? ["ok", "Passed"] : c.pass === false ? ["bad", "Failed"] : ["skip", "Did not apply"];
        return `<tr class="${cls === "bad" ? "bad" : ""}"><td>${escapeHtml(c.humanTitle || c.title)}</td><td>${escapeHtml(c.humanExpected || c.expected)}</td><td>${escapeHtml(c.humanActual || c.actual || "")}</td><td>${pill(cls, word)}</td></tr>`;
      }),
    ];
  });
  const list = `<details class="cklist"><summary>All ${all.length} checks on this response</summary><table class="cks"><colgroup><col class="cc"><col><col><col class="cr"></colgroup><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>${rows.join("")}</tbody></table></details>`;
  return { inline: `<div class="checks">${chips.join("")}</div>${failures}`, list };
}

function stepRow(s: JourneyStepRecord, companyId: number): string {
  let [cls, word] = STEP_RESULT[s.verdict] ?? ["skip", s.verdict];
  // The step's action worked, but its response failed a check: the step failed.
  if (cls === "ok" && failedChecks(s).length) [cls, word] = ["bad", "Failed"];
  const actual = s.verdict === "not-run" ? s.reason || s.actual || "It did not run." : s.actual;
  const ck = stepChecks(s);
  const rowCls = [cls === "bad" ? "bad" : "", ck.list ? "has-ck" : ""].filter(Boolean).join(" ");
  return `<tr class="${rowCls}"><td class="n">${s.n}</td>
<td><div class="step-t">${escapeHtml(s.title)}</div></td>
<td>${escapeHtml(s.expected)}</td>
<td>${escapeHtml(actual)}${ck.inline}${curlFold(s.call, companyId)}</td>
<td class="r">${pill(cls, word)}</td></tr>${ck.list ? `\n<tr class="ckrow${cls === "bad" ? " bad" : ""}"><td class="n"></td><td colspan="4">${ck.list}</td></tr>` : ""}`;
}

/** The run's response checks, per group: "Status code 6 of 6 · … · 2 did not apply". */
function checksSummary(steps: JourneyStepRecord[]): string {
  const all = steps.flatMap(checksOf);
  if (!all.length) return "";
  const parts = GROUPS.map((g) => {
    const judged = all.filter((c) => groupOf(c.op) === g && c.pass !== null);
    if (!judged.length) return "";
    return `${GROUP_LABEL[g]} ${judged.filter((c) => c.pass === true).length} of ${judged.length}`;
  }).filter(Boolean);
  const na = all.filter((c) => c.pass === null).length;
  return `<p class="cksum">Response checks: ${escapeHtml(parts.join(" · "))}${na ? ` · ${na} did not apply` : ""}.</p>`;
}

const EXPECT_WORDS: Record<string, string> = {
  accept: "The app accepts it.",
  reject: "The app refuses it with a clear message (4xx).",
  "no-5xx": "The app answers without a server error.",
};

/**
 * What the app did with a scenario's request, in words. "HTTP 200 · 608 ms"
 * under "A negative quantity is refused" did not say that the app ACCEPTED
 * the bad value and saved it (Aanya, 15 Oct: "what do they mean? i dont get it").
 */
function outcomeWords(c: { httpStatus?: number | null; message?: string | null; expected?: string | null; durationMs?: number | null }): string {
  const s = c.httpStatus ?? 0;
  const msg = String(c.message ?? "").trim();
  const said = msg && !/^internal server error$/i.test(msg) && !/^HTTP \d{3}\b/.test(msg) ? `: “${msg.replace(/\.$/, "")}”` : "";
  const took = c.durationMs ? ` Took ${c.durationMs >= 1000 ? `${(c.durationMs / 1000).toFixed(1)} s` : `${c.durationMs} ms`}.` : "";
  const what = !s
    ? "No answer from the app"
    : s >= 500
      ? `The app crashed: server error (HTTP ${s})${said}`
      : s < 300
        ? c.expected === "reject"
          ? `The app accepted it (HTTP ${s}) — it should have refused it, so the bad value was saved`
          : `The app accepted it (HTTP ${s})`
        : c.expected === "accept"
          ? `The app refused it (HTTP ${s})${said} — it should have accepted it`
          : `The app refused it (HTTP ${s})${said}`;
  return `${what}.${took}`;
}

export function renderSimpleApiReport(run: RunRecord, fullHref: string): string {
  const journey = readJourney(run);
  // A typed case run as an API plan: its first row is the case itself (the
  // headline, not a step); its other rows are the plan's steps.
  const planCase = (run.checkResults ?? []).find((c) => c.category === "API plan");
  const checks = (run.checkResults ?? []).filter((c) => c.layer !== "ui" && c !== planCase);
  const steps = journey?.steps ?? [];

  const stepsFailed = steps.filter((s) => s.verdict === "refused" || s.verdict === "broken");
  // Steps whose action worked but whose response failed a check (stepChecks).
  const stepsCheckFailed = steps.filter((s) => s.verdict === "worked" && failedChecks(s).length);
  const allChecks = steps.flatMap(checksOf);
  const checksFailed = allChecks.filter((c) => c.pass === false).length;
  const checksJudged = allChecks.filter((c) => c.pass !== null).length;
  const stepsNotRun = steps.filter((s) => s.verdict === "not-run");
  const casesFailed = checks.filter((c) => !c.pass && !c.inconclusive);
  if (planCase && !planCase.pass && !planCase.inconclusive && !casesFailed.length) casesFailed.push(planCase);
  const casesUnknown = checks.filter((c) => c.inconclusive || (c as any).weakReason || (c.httpStatus === 404 && (!c.message || /^HTTP 404\b/i.test(String(c.message)))));
  const nothing = !steps.length && !checks.length;

  const asked = run.request.replace(/^(features|api plan):\s*/i, "");
  const title = (planCase || !journey?.label ? sentence(asked) : journey.label) || "API run";
  const firstBad = stepsFailed[0];
  let verdict: string;
  if (nothing) verdict = verdictBox("warn", "Not tested", "Nothing was sent to the API in this run.");
  else if (stepsFailed.length || casesFailed.length || stepsCheckFailed.length) {
    const firstCheckBad = stepsCheckFailed[0];
    const badCheck = firstCheckBad ? failedChecks(firstCheckBad)[0] : undefined;
    const why = firstBad
      ? `Stopped at step ${firstBad.n}, “${firstBad.title}”: ${firstBad.message || firstBad.actual}`
      : planCase && !planCase.pass && !planCase.inconclusive
        ? planCase.verdict.replace(/^api plan failed\s*[—-]\s*/i, "")
        : casesFailed.length
          ? `${casesFailed.length} of ${checks.length} scenario${checks.length === 1 ? "" : "s"} failed.`
          : `${checksFailed} of ${checksJudged} response check${checksJudged === 1 ? "" : "s"} failed — step ${firstCheckBad!.n}, “${firstCheckBad!.title}”: ${badCheck!.humanTitle || badCheck!.title}. Got: ${badCheck!.humanActual || badCheck!.actual}`;
    verdict = verdictBox("bad", "Failed", why);
  } else if (stepsNotRun.length || casesUnknown.length) {
    verdict = verdictBox(
      "warn",
      "Partly tested",
      `${steps.length - stepsNotRun.length + checks.length - casesUnknown.length} passed; ${stepsNotRun.length + casesUnknown.length} could not be checked.`,
    );
  } else
    verdict = verdictBox(
      "ok",
      "Passed",
      steps.length
        ? `All ${steps.length} steps worked${checksJudged ? `, and all ${checksJudged} response checks passed` : ""}${checks.length ? `; all ${checks.length} scenarios passed` : ""}.`
        : `All ${checks.length} scenarios passed.`,
    );
  verdict += checksSummary(steps);

  const stepTable = steps.length
    ? `<h2>Steps</h2><table class="steps"><colgroup><col class="n"><col class="s"><col><col><col class="r"></colgroup><thead><tr><th>#</th><th>Step</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>
${steps.map((s) => stepRow(s, run.companyId)).join("\n")}</tbody></table>`
    : "";

  const caseTable = checks.length
    ? `<h2>${planCase ? "What the case did" : "Scenarios checked"}</h2>${planCase ? "" : `<p class="sub">Each scenario is one condition tried with a single request: what should happen, and what did.</p>`}<table class="steps"><colgroup><col class="n"><col class="s"><col><col><col class="r"></colgroup><thead><tr><th>#</th><th>${planCase ? "Step" : "Scenario"}</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>
${checks
  .map((c, i) => {
    const route404 = c.httpStatus === 404 && (!c.message || /^HTTP 404\b/i.test(String(c.message)));
    const hollow = !!(c as any).weakReason || route404;
    const [cls, word]: ["ok" | "bad" | "skip", string] = c.inconclusive || hollow ? ["skip", "Not checked"] : c.pass ? ["ok", "Passed"] : ["bad", "Failed"];
    // A plan step's own verdict sentence says what happened; whether that was
    // right is its pass, so the expectation is read back from the two.
    const planStep = c.category === "plan step";
    const accepted = !!c.httpStatus && c.httpStatus < 300;
    const expected = planStep
      ? c.inconclusive
        ? "The read-back shows the expected value."
        : c.pass === accepted
          ? EXPECT_WORDS.accept
          : EXPECT_WORDS.reject
      : (EXPECT_WORDS[c.expected] ?? c.expected);
    const actual = route404
      ? "Not tested: the server answered 404 with no message — no route for this method and path, so the request never reached the rule."
      : hollow
      ? "Not tested as written: the request sent did not include what this scenario tests, so it only showed the server did not crash."
      : planStep && c.verdict ? c.verdict : outcomeWords(c);
    return `<tr class="${cls === "bad" ? "bad" : ""}"><td class="n">${i + 1}</td><td><div class="step-t">${escapeHtml(humanText(c.scenario))}</div></td>
<td>${escapeHtml(expected)}</td><td>${escapeHtml(actual)}${curlFold(c.request, run.companyId)}</td><td class="r">${pill(cls, word)}</td></tr>`;
  })
  .join("\n")}</tbody></table>`
    : "";

  const event = journey?.made?.eventGroupUuid ? `Event ${journey.made.eventGroupUuid}` : "";
  const body = `${verdict}${stepTable}${caseTable}
<h2>Bugs</h2><p>${stepsFailed.length || casesFailed.length || stepsCheckFailed.length ? "" : "None from this run. "}<a href="/api/bug-report?run=${encodeURIComponent(run.id)}">Open the bug report for this run</a></p>`;
  return page({
    kind: "API test report",
    title,
    meta: metaLine(run.companyName, when(run.ts), took(journey?.durationMs ?? run.durationMs), event),
    body,
    foot: `${escapeHtml(run.id)} · ${fullLink(fullHref)}`,
  });
}

// ── the browser (UI) run report ─────────────────────────────────────────────
/** Lines that are the runner talking about itself, not the journey. */
const NOISE = /^(Playwright starting|Separate sign-in step|Client .*\(\d+\) ·|Refreshed the saved sign-in|\d+ (passed|failed|skipped))/i;
/** Coordinates, selectors and other lines written for whoever fixes the automation. */
const TECH = /\b(y|x|h|w)=\d+|\bviewport \d+px|data-testid|\blocator\b|\bselector\b|the test record selected|selected: [A-Z]{5,}|^\[|\bms\b.*\btimeout/i;

export function renderSimpleUiReport(runId: string, fullHref: string): string {
  const trail = readTrail(runId);
  const result = findUiResult(runId);
  const flowKey = result?.flowKey ?? trail?.flowKey ?? "";
  const flow = UI_FLOWS.find((f) => f.key === flowKey);
  const title = flow?.label ?? (flowKey ? flowKeyInWords(flowKey) : humanText(result?.title ?? "Browser run"));
  const companyId = result?.companyId ?? trail?.companyId ?? null;

  if (!trail && !result)
    return page({ kind: "Browser test report", title, meta: "", body: verdictBox("warn", "Nothing recorded", "This run is still going, or its record was cleared."), foot: escapeHtml(runId) });

  const broke = result ? result.status === "broke" : (trail?.exitCode ?? 1) !== 0;
  const stoppedAt = trail?.stoppedAt ? humanText(trail.stoppedAt.text) : "";
  const verdict = broke
    ? verdictBox("bad", "Failed", `${stoppedAt ? `Stopped at: ${stoppedAt}.` : "The browser stopped before the end."}${result?.error ? ` ${humanText(result.error)}` : ""}`)
    : verdictBox("ok", "Passed", "The browser completed the whole journey.");

  // What the event turned out to be, read back after the journey — the checks that make a pass mean something.
  const checks = result?.verified?.checks ?? [];
  const checkTable = checks.length
    ? `<h2>Checks</h2><table class="steps"><colgroup><col class="n"><col class="s"><col><col><col class="r"></colgroup><thead><tr><th>#</th><th>What was checked</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>
${checks
  .map((c, i) => {
    const [cls, word]: ["ok" | "bad" | "skip", string] = c.unread ? ["skip", "Not checked"] : c.ok ? ["ok", "Passed"] : ["bad", "Failed"];
    return `<tr class="${cls === "bad" ? "bad" : ""}"><td class="n">${i + 1}</td><td><div class="step-t">${escapeHtml(c.what)}</div></td><td>${escapeHtml(c.expected)}</td><td>${escapeHtml(c.unread ? c.unread : c.actual)}</td><td class="r">${pill(cls, word)}</td></tr>`;
  })
  .join("\n")}</tbody></table>`
    : "";

  // The journey's own narration, grouped by part, without the runner's lines.
  const lines: string[] = [];
  let phase = "";
  for (const s of (trail?.steps ?? []) as JourneyStep[]) {
    if (s.phase === "playwright" || NOISE.test(s.text) || (s.kind === "info" && TECH.test(s.text))) continue;
    if (s.phase !== phase) {
      phase = s.phase;
      const label = !broke && s.phase === "stuck" ? "Needed a retry" : (JOURNEY_PHASES[s.phase] ?? { label: s.phase }).label;
      lines.push(`<li class="phase">${escapeHtml(label)}</li>`);
    }
    // A run that passed got past every snag: a "stuck" line there was recovered from, so it reads as a warning.
    const kind = !broke && s.kind === "bad" ? "warn" : s.kind;
    const mark = kind === "ok" ? "✓" : kind === "bad" ? "✗" : kind === "warn" ? "!" : "·";
    const text = s.repeats && s.repeats > 1 ? `${s.text} (${s.repeats} tries)` : s.text;
    lines.push(`<li class="${kind === "bad" ? "bad" : ""}"><span class="m ${kind}">${mark}</span><span>${escapeHtml(text)}</span></li>`);
  }
  const trailHtml = lines.length ? `<h2>Steps</h2><ol class="trail">${lines.join("")}</ol>` : "";

  const shot = result?.screenshot
    ? `<h2>The screen it ${broke ? "stopped" : "finished"} on</h2><a href="/api/ui-shot?f=${encodeURIComponent(result.screenshot)}" target="_blank" rel="noopener"><img class="shot" src="/api/ui-shot?f=${encodeURIComponent(result.screenshot)}" alt="The screen the run ${broke ? "stopped" : "finished"} on"></a>`
    : "";

  const body = `${verdict}${checkTable}${trailHtml}${shot}
<h2>Bugs</h2><p><a href="/api/bug-report?run=${encodeURIComponent(runId)}">Open the bug report for this run</a></p>`;
  return page({
    kind: "Browser test report",
    title,
    meta: metaLine(companyId ? `Client ${companyId}` : "", when(result?.startedAt ?? trail?.startedAt), took(result?.durationMs ?? trail?.durationMs)),
    body,
    foot: `${escapeHtml(runId)} · ${fullLink(fullHref)}`,
  });
}

// ── the bug report for one run ──────────────────────────────────────────────
export interface SimpleBugScope {
  runId?: string;
  ts?: string;
  request?: string;
  companyName?: string | null;
  /** facts about the run worth a line above the bugs */
  notes?: string[];
}

const PRODUCT = new Set(["product_defect", "contradiction"]);

function bugCard(g: DefectGroup & { plain: PlainBug }, i: number, triage: ReturnType<typeof loadTriage>): string {
  const f = sheetFacts(g, i, triage);
  const p = g.plain;
  const cls = f.priority === "P0" || f.priority === "P1" ? "bad" : f.priority === "P2" ? "warn" : "skip";
  const request = p.artifacts.find((a) => a.kind === "request" && a.text);
  const links = p.artifacts.filter((a) => a.href && (a.kind === "screenshot" || a.kind === "report"));
  return `<article class="bug">
<div class="bug-h"><span class="bug-id">${escapeHtml(f.issueId)}</span>${pill(cls, f.priority)}${f.blocker === "YES" ? pill("bad", "Blocker") : ""}${pill("skip", f.devType)}<span class="sub">${escapeHtml(p.where || f.module)}</span></div>
<h3>${escapeHtml(p.title)}</h3>
<p>${escapeHtml(p.summary)}</p>
${p.steps.length ? `<div class="lbl">Steps to reproduce</div><ol>${p.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : ""}
<div class="ea"><div><b>Expected</b>${escapeHtml(p.expected)}</div><div><b>Actual</b>${escapeHtml(p.actual)}</div></div>
${links.length ? `<p class="sub">${links.map((a) => `<a href="${escapeHtml(a.href!)}" target="_blank" rel="noopener">${escapeHtml(a.label)}</a>`).join(" · ")}</p>` : ""}
${request ? curlBlock(request.text!) : ""}
</article>`;
}

export function renderSimpleBugReport(found: DefectGroup[], scope: SimpleBugScope, fullHref: string): string {
  const triage = loadTriage();
  const bugs = withPlain(found);
  // Bugs in Procol first; then what may be the app being right (it refused
  // input — the test may have left something out); then the test's own problems.
  const product = bugs.filter((b) => PRODUCT.has(b.kind));
  const toCheck = bugs.filter((b) => b.kind === "product_rejected_input");
  const ours = bugs.filter((b) => !PRODUCT.has(b.kind) && b.kind !== "product_rejected_input");
  const index = new Map(bugs.map((b, i) => [b.defectFingerprint, i]));

  const verdict = product.length
    ? verdictBox("bad", `${product.length} bug${product.length === 1 ? "" : "s"} found`, product.map((b) => b.plain.title).slice(0, 3).join(" · "))
    : verdictBox("ok", "No bugs found in Procol", toCheck.length || ours.length ? "Some things are worth a look — listed below." : "This run found nothing to report.");

  const section = (head: string, note: string, list: typeof bugs) =>
    list.length ? `<h2>${escapeHtml(head)}</h2>${note ? `<p class="sub">${escapeHtml(note)}</p>` : ""}${list.map((b) => bugCard(b, index.get(b.defectFingerprint) ?? 0, triage)).join("")}` : "";
  const brief = (head: string, note: string, list: typeof bugs) =>
    list.length ? `<h2>${escapeHtml(head)}</h2><p class="sub">${escapeHtml(note)}</p><ul class="plain">${list.map((b) => `<li>${escapeHtml(b.plain.title)}</li>`).join("")}</ul>` : "";

  const body = `${verdict}
${scope.notes?.length ? `<ul class="plain">${scope.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : ""}
${section("Bugs", "", product)}
${section("To check", "The app refused something here. That may be correct — the test may have left out something the app needs.", toCheck)}
${brief("Problems with the test itself", "Not Procol bugs: the automation or the test environment got in the way.", ours)}`;
  return page({
    kind: "Bug report",
    title: humanText(String(scope.request ?? "This run").replace(/^(features|api plan|browser journey):\s*/i, "")) || "This run",
    meta: metaLine(scope.companyName, when(scope.ts)),
    body,
    foot: `${escapeHtml(scope.runId ?? "")} · ${fullLink(fullHref)}`,
  });
}
