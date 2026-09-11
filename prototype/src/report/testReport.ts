import { FEATURE_TREE } from "../../config/featureTree.js";
import { loadCases, type TestCaseRecord } from "../checks/caseLibrary.js";
import { getRun, listRuns, type RunRecord } from "../runStore.js";
import type { CheckResult } from "../ai/types.js";
import { isTemplate, toCurl, TOKEN_VAR } from "./curl.js";
import { PAGE_CSS, escapeHtml, stamp } from "./shared.js";

/**
 * THE TEST REPORT — what was checked, what the product did, and how to see it
 * again.
 *
 * Organised the way the platform is: by the module ticked in the UI (Intake,
 * Purchase requests, Sourcing events…), then by the test cases that module's
 * library defines, then the verdict, then the curl that produced it.
 *
 * Three decisions worth stating, because they are what make it readable:
 *
 *  1. THE CASE LIST COMES FROM THE MODULE, NOT FROM THE RUN. Every case the
 *     library holds for a ticked feature is listed, whether or not this run
 *     reached it. A case that never ran says "not run" — never "passed".
 *  2. EVIDENCE IS A CURL, NOT A NETWORK LOG. One command per case, with the
 *     credential as $PROCOL_TOKEN, plus the message the API actually returned.
 *     No header tables, no response dumps.
 *  3. INCONCLUSIVE IS ITS OWN VERDICT. A 401, or a rejection for the wrong
 *     reason, proves nothing — reporting either as a pass is how a green
 *     report stops meaning anything.
 */

type Verdict = "pass" | "fail" | "inconclusive" | "notrun";

interface CaseRow {
  test: TestCaseRecord;
  result?: CheckResult;
  verdict: Verdict;
  /** why it did not run, when the run said so */
  skipReason?: string;
}

interface ModuleSection {
  id: string;
  label: string;
  icon: string;
  what: string;
  rows: CaseRow[];
  passed: number;
  failed: number;
  inconclusive: number;
  notrun: number;
}

/**
 * The four verdicts, in words rather than QA jargon.
 *
 * "Inconclusive" was accurate and meant nothing to anyone: the case ran, and
 * proved nothing either way — the request was refused before it reached the
 * logic under test (a 401), or refused for a different reason than the case is
 * about. Calling that a pass would be a lie and calling it a failure would
 * blame the product for something it was never asked. So it says what it is:
 * we could not tell, and the row says why.
 */
/**
 * What a status code means, in words.
 *
 * "422" tells a developer plenty and a reader nothing. The number stays — it
 * is what you quote to engineering — but it never appears alone.
 */
/**
 * Why a test did not run, in plain words.
 *
 * The reasons are written by the machinery that skipped it, for whoever was
 * debugging the machinery: "unresolved placeholder(s): eventGroupUuid" is
 * precise and means nothing to a reader of this page. The original is kept in
 * brackets, because the person who has to fix it needs the exact term.
 */
function skipInWords(reason: string | undefined): string {
  if (!reason) return "this run never got to it";
  const placeholders = reason.match(/unresolved placeholder\(s\):\s*(.+)/i);
  if (placeholders) {
    return `needs something this run did not have — ${placeholders[1].trim()}`;
  }
  const flagOff = reason.match(/"([^"]+)" is OFF for (.+?) —/);
  if (flagOff) {
    return `“${flagOff[1]}” is switched off for ${flagOff[2]}, so there is nothing to check`;
  }
  const needsRole = reason.match(/needs (.+?); this run is authenticated as "([^"]+)"/);
  if (needsRole) {
    return `needs ${needsRole[1]} — this run signed in as ${needsRole[2]}`;
  }
  if (/only holds when "([^"]+)" is ON/.test(reason)) {
    const flag = reason.match(/only holds when "([^"]+)" is ON/)?.[1];
    return `only applies when “${flag}” is switched on, and it is off here`;
  }
  if (/not on the allowlist/i.test(reason)) {
    return "the platform is not allowed to call that endpoint";
  }
  return reason;
}

function statusInWords(status: number | null | undefined): string {
  if (status === null || status === undefined) return "no reply";
  if (status >= 500) return "the server broke";
  if (status === 404) return "not found";
  if (status === 401 || status === 403) return "not allowed";
  if (status === 422 || status === 400) return "refused the data";
  if (status >= 400) return "refused";
  if (status >= 300) return "redirected";
  if (status >= 200) return "accepted";
  return `HTTP ${status}`;
}

const VERDICT_PILL: Record<Verdict, { cls: string; label: string; meaning: string }> = {
  pass: {
    cls: "p-pass",
    label: "Worked",
    meaning: "Procol did exactly what it should have — nothing to do here.",
  },
  fail: {
    cls: "p-fail",
    label: "Broken",
    meaning:
      "Procol did something it should not have: accepted bad data, refused good data, or fell over. " +
      "These are the rows worth raising with engineering.",
  },
  inconclusive: {
    cls: "p-incon",
    label: "Couldn’t tell",
    meaning:
      "We asked, but the answer proves nothing either way — usually the account was not allowed to do it, " +
      "so the thing we wanted to check never got exercised. Not a pass, and not Procol’s fault.",
  },
  notrun: {
    cls: "p-notrun",
    label: "Not checked",
    meaning:
      "This run never got to it — a switch is off for this account, or it needs data we did not have. " +
      "The row says which. It is listed so the gap is visible instead of invisible.",
  },
};

function verdictOf(result: CheckResult | undefined): Verdict {
  if (!result) return "notrun";
  if (result.inconclusive) return "inconclusive";
  return result.pass ? "pass" : "fail";
}

/** feature id → the group it belongs to, so a report groups the way the UI does. */
function groupOfFeature(featureId: string) {
  const groupId = featureId.split(".")[0];
  return FEATURE_TREE.find((g) => g.id === groupId);
}

/**
 * Builds the sections.
 *
 * `features` is what the UI had ticked. Empty means "everything the library
 * knows", which is the right default for a report opened without a selection.
 */
export function buildSections(features: string[], run: RunRecord | null): ModuleSection[] {
  const wanted = new Set(features);
  const cases = loadCases().filter((c) => wanted.size === 0 || wanted.has(c.feature));

  const results = new Map<string, CheckResult>();
  for (const r of run?.checkResults ?? []) results.set(r.id, r);

  // Cases the run deliberately skipped, with the reason it gave.
  const skipped = new Map<string, string>();
  for (const event of run?.events ?? []) {
    const payload: any = (event as any).data ?? (event as any).payload;
    for (const item of payload?.skipped ?? []) {
      if (item?.id) skipped.set(item.id, item.reason ?? "skipped");
    }
  }

  const sections = new Map<string, ModuleSection>();
  for (const test of cases) {
    const group = groupOfFeature(test.feature);
    const id = group?.id ?? test.feature.split(".")[0];
    if (!sections.has(id)) {
      sections.set(id, {
        id,
        label: group?.label ?? id,
        icon: group?.icon ?? "•",
        what: group?.what ?? "",
        rows: [],
        passed: 0,
        failed: 0,
        inconclusive: 0,
        notrun: 0,
      });
    }
    const section = sections.get(id)!;
    const result = results.get(test.id);
    const verdict = verdictOf(result);
    section.rows.push({ test, result, verdict, skipReason: skipped.get(test.id) });
    if (verdict === "pass") section.passed++;
    else if (verdict === "fail") section.failed++;
    else if (verdict === "inconclusive") section.inconclusive++;
    else section.notrun++;
  }

  // Modules with something wrong first — a reader opens this to find failures.
  return [...sections.values()].sort(
    (a, b) => b.failed - a.failed || b.inconclusive - a.inconclusive || a.label.localeCompare(b.label),
  );
}

/**
 * One case: a single line that reads across, and everything else folded away.
 *
 * The first version put the whole story in the summary row and the whole body
 * open beneath it, so twelve cases were a wall of text with no way to scan
 * them. This is a table: verdict, id, what it checks, the call, the result —
 * five columns that line up down the page. Open a row and you get the case's
 * own documentation and the curl, which is what you want only after something
 * has caught your eye.
 */
function renderRow(row: CaseRow, companyId?: number): string {
  const pill = VERDICT_PILL[row.verdict];
  const result = row.result;
  // The request as fired when we have it; the library's template otherwise —
  // labelled as a template, because a curl with {{placeholders}} will not run.
  const request = result?.request ?? { method: row.test.method, path: row.test.path, body: row.test.body };
  const template = !result?.request && isTemplate(request);

  const status =
    row.verdict === "notrun"
      ? "—"
      : result?.httpStatus === null || result?.httpStatus === undefined
        ? "no reply"
        : `${result.httpStatus} · ${statusInWords(result.httpStatus)}`;

  /**
   * What happened, in a sentence a non-developer can read.
   *
   * The engine's own verdict is written for someone who knows the codes
   * ("ACCEPTED input that should have been rejected (HTTP 200)"). Said plainly
   * it is "the app accepted something it should have refused" — the technical
   * wording is still there when the row is opened.
   */
  const outcome =
    row.verdict === "notrun"
      ? skipInWords(row.skipReason)
      : row.verdict === "pass"
        ? row.test.expected === "reject"
          ? "Refused it, as it should"
          : row.test.expected === "no-5xx"
            ? "Handled it without breaking"
            : "Worked, as it should"
        : row.verdict === "inconclusive"
          ? "Proved nothing — the request never reached what this test is about"
          : result?.accepted
            ? "Accepted something it should have refused"
            : (result?.httpStatus ?? 0) >= 500
              ? "The server broke on it"
              : "Refused something it should have accepted";

  return `
<details class="case v-${row.verdict}" data-verdict="${row.verdict}" data-feature="${escapeHtml(row.test.feature)}"
         data-search="${escapeHtml(`${row.test.id} ${row.test.title} ${row.test.feature} ${request.path}`.toLowerCase())}">
  <summary>
    <span class="col-verdict"><span class="pill ${pill.cls}">${escapeHtml(pill.label)}</span></span>
    <span class="col-id">${escapeHtml(row.test.id)}</span>
    <span class="col-title">${escapeHtml(row.test.title.replace(/^QA_Platform_/, ""))}
      <span class="col-tags"><span class="tag t-${escapeHtml(row.test.type.toLowerCase())}">${escapeHtml(
        row.test.type,
      )}</span> <span class="tag">${escapeHtml(row.test.priority)}</span></span>
    </span>
    <span class="col-call"><code>${escapeHtml(request.method)} ${escapeHtml(
      request.path.split("?")[0],
    )}</code></span>
    <span class="col-status">${escapeHtml(status)}</span>
    <span class="col-outcome">${escapeHtml(outcome)}</span>
  </summary>
  <div class="case-body">
    <div class="panes">
      <div>
        <h5>What should happen</h5>
        <p class="expect">The app should <strong>${
          row.test.expected === "reject"
            ? "refuse this"
            : row.test.expected === "no-5xx"
              ? "cope with this without breaking"
              : "accept this"
        }</strong>. ${escapeHtml(row.test.expectedResult)}</p>
        ${
          row.test.steps?.length
            ? `<h5>How the test goes</h5><ol class="steps">${row.test.steps
                .map((st) => `<li>${escapeHtml(st.replace(/^\d+\.\s*/, ""))}</li>`)
                .join("")}</ol>`
            : ""
        }
        ${
          row.test.preconditions
            ? `<h5>Only meaningful if</h5><p class="pre">${escapeHtml(row.test.preconditions)}</p>`
            : ""
        }
      </div>
      <div>
        <h5>What actually happened</h5>
        <p class="${row.verdict === "fail" ? "said-bad" : "said"}">${escapeHtml(
          result?.verdict ?? skipInWords(row.skipReason),
        )}</p>
        ${
          !result && row.skipReason && skipInWords(row.skipReason) !== row.skipReason
            ? `<p class="pre">In the machinery's own words: ${escapeHtml(row.skipReason)}</p>`
            : ""
        }
        ${result?.message ? `<p class="apisaid"><span>The app said:</span> ${escapeHtml(result.message)}</p>` : ""}
        ${result ? `<p class="took">${Math.round(result.durationMs)}ms</p>` : ""}
        <details class="curl">
          <summary>${
            template
              ? "The request we would send (values fill in when it runs)"
              : "Run this exact call yourself"
          }</summary>
          <div class="curl-body">
            <button class="copy" type="button" data-copy="curl-${escapeHtml(row.test.id)}">Copy curl</button>
            <pre id="curl-${escapeHtml(row.test.id)}">${escapeHtml(toCurl(request, companyId))}</pre>
          </div>
        </details>
      </div>
    </div>
  </div>
</details>`;
}

/** A module: how much of it is green, then its cases. */
function renderSection(section: ModuleSection, companyId?: number): string {
  const total = section.rows.length || 1;
  const bar = (n: number, cls: string) =>
    n ? `<span class="seg ${cls}" style="width:${((n / total) * 100).toFixed(1)}%"></span>` : "";

  return `
<section class="module" data-module="${escapeHtml(section.label)}">
  <header class="module-head">
    <span class="mico">${escapeHtml(section.icon)}</span>
    <h3>${escapeHtml(section.label)}</h3>
    <span class="grow"></span>
    <span class="tally">
      ${section.passed ? `<b class="ok">${section.passed} worked</b>` : ""}
      ${section.failed ? `<b class="bad">${section.failed} broken</b>` : ""}
      ${section.inconclusive ? `<b class="warn">${section.inconclusive} unclear</b>` : ""}
      ${section.notrun ? `<b class="mute">${section.notrun} not checked</b>` : ""}
    </span>
  </header>
  <div class="bar" role="img" aria-label="${section.passed} of ${section.rows.length} passed">
    ${bar(section.passed, "s-pass")}${bar(section.failed, "s-fail")}${bar(section.inconclusive, "s-incon")}${bar(
      section.notrun,
      "s-notrun",
    )}
  </div>
  ${section.what ? `<p class="mwhat">${escapeHtml(section.what)}</p>` : ""}
  <div class="rows">
    <div class="rowhead">
      <span class="col-verdict">Result</span>
      <span class="col-id">Test</span>
      <span class="col-title">What we checked</span>
      <span class="col-call">Where we checked it</span>
      <span class="col-status">The app replied</span>
      <span class="col-outcome">What that means</span>
    </div>
    ${section.rows.map((row) => renderRow(row, companyId)).join("")}
  </div>
</section>`;
}

export interface TestReportInput {
  features: string[];
  run: RunRecord | null;
}

export function renderTestReport({ features, run }: TestReportInput): string {
  const sections = buildSections(features, run);
  const rows = sections.flatMap((s) => s.rows);
  const totals = {
    total: rows.length,
    passed: rows.filter((r) => r.verdict === "pass").length,
    failed: rows.filter((r) => r.verdict === "fail").length,
    inconclusive: rows.filter((r) => r.verdict === "inconclusive").length,
    notrun: rows.filter((r) => r.verdict === "notrun").length,
  };

  const tile = (label: string, value: number | string, cls = "") =>
    `<div class="tile ${cls}"><div class="tile-v">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;

  const scopeLine = features.length
    ? `This is about <strong>${escapeHtml(
        [...new Set(sections.map((s) => s.label))].join(", "),
      )}</strong> and nothing else — the ${features.length} part${
        features.length === 1 ? "" : "s"
      } of Procol this run was asked to check.`
    : "This covers every part of Procol the platform knows how to check. Tick a module in the platform to narrow it down.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Procol QA — test report</title>
<style>
${PAGE_CSS}
/* ── module ─────────────────────────────────────────────────────────── */
.module { margin: 0 0 26px; }
.module-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.module-head h3 { margin: 0; font-size: 17px; letter-spacing: -.01em; }
.mico { font-size: 16px; }
.grow { flex: 1 1 auto; }
.tally { display: flex; gap: 10px; font-size: 11.5px; font-weight: 600; }
.tally .ok { color: var(--good); }
.tally .bad { color: var(--bad); }
.tally .warn { color: var(--warn); }
.tally .mute { color: var(--muted); }
.bar { display: flex; height: 6px; border-radius: 999px; overflow: hidden; background: var(--grid); margin: 9px 0 0; }
.seg.s-pass { background: #34a853; }
.seg.s-fail { background: #c5221f; }
.seg.s-incon { background: #f9ab00; }
.seg.s-notrun { background: var(--grid); }
.mwhat { margin: 8px 0 0; font-size: 12.5px; color: var(--muted); }

/* ── the case table ─────────────────────────────────────────────────── */
.rows { margin: 12px 0 0; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--card); }
.rowhead, details.case > summary {
  display: grid;
  grid-template-columns: 104px 108px minmax(230px, 1.6fr) minmax(170px, 1fr) 52px minmax(180px, 1.3fr);
  gap: 12px; align-items: baseline; padding: 9px 14px;
}
.rowhead { background: var(--hover); border-bottom: 1px solid var(--line); font-size: 10.5px; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); font-weight: 600; }
details.case { border-top: 1px solid var(--grid); }
details.case:first-of-type { border-top: 0; }
details.case > summary { cursor: pointer; list-style: none; }
details.case > summary::-webkit-details-marker { display: none; }
details.case > summary:hover { background: var(--hover); }
details.case[open] > summary { background: var(--hover); }
/* A colour down the left edge, so a page of rows is scannable at a glance. */
details.case.v-fail { box-shadow: inset 3px 0 0 #c5221f; }
details.case.v-pass { box-shadow: inset 3px 0 0 #34a853; }
details.case.v-inconclusive { box-shadow: inset 3px 0 0 #f9ab00; }
details.case.v-notrun { box-shadow: inset 3px 0 0 #cfd4d9; }
.col-id { font: 600 11px ui-monospace, Menlo, monospace; color: var(--muted); }
.col-title { font-size: 13px; font-weight: 500; line-height: 1.4; }
.col-tags { display: block; margin-top: 3px; }
.col-call code { font-size: 11px; color: var(--ink-2); word-break: break-all; }
.col-status { font: 600 12px ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }
.col-outcome { font-size: 11.5px; color: var(--muted); line-height: 1.45; }
.tag { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 1px 5px; border-radius: 3px; background: var(--code); color: var(--muted); }
.tag.t-negative { background: #fbe3da; color: #8a3b16; }
.tag.t-positive { background: #dfeaf9; color: #14508c; }
.tag.t-security, .tag.t-robustness { background: #e6e0f8; color: #45308c; }
.tag.t-boundary { background: #e0f2f1; color: #00695c; }

/* ── an opened case ─────────────────────────────────────────────────── */
.case-body { padding: 4px 16px 18px; background: var(--hover); }
.panes { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
@media (max-width: 900px) { .panes { grid-template-columns: 1fr; } }
h5 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 12px 0 5px; }
.expect, .pre, .said, .said-bad { font-size: 12.5px; line-height: 1.55; margin: 0; }
.pre { color: var(--muted); }
.said-bad { color: var(--bad); }
.apisaid { margin: 8px 0 0; font-size: 12px; background: color-mix(in srgb, var(--bad) 12%, transparent); border: 1px solid color-mix(in srgb, var(--bad) 35%, transparent); border-radius: 6px; padding: 7px 9px; }
.apisaid span { color: var(--bad); font-weight: 600; }
.took { margin: 8px 0 0; font-size: 11px; color: var(--muted); }
.steps { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.6; color: var(--ink-2); }
details.curl { margin: 12px 0 0; }
details.curl > summary { cursor: pointer; font-size: 11.5px; color: var(--link); list-style: none; width: fit-content; }
details.curl > summary::-webkit-details-marker { display: none; }
details.curl > summary::before { content: "▸ "; }
details.curl[open] > summary::before { content: "▾ "; }
.curl-body { margin-top: 7px; }
button.copy { font: inherit; font-size: 11px; padding: 2px 8px; margin-bottom: 6px;
  border: 1px solid var(--line); border-radius: 5px; background: var(--card); color: var(--ink-2); cursor: pointer; }

/* ── the legend: four chips and what they mean ──────────────────────── */
.legend { display: grid; gap: 7px; margin: 12px 0 0; }
.legend div { display: flex; gap: 9px; align-items: baseline; font-size: 12px; color: var(--muted); line-height: 1.5; }
.legend .pill { flex: 0 0 auto; }
.filters { position: sticky; top: 0; z-index: 5; background: var(--paper); padding: 10px 0; margin-bottom: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>What we tested, and what happened</h1>
  <p class="sub">${
    run
      ? `run ${escapeHtml(run.id)} · ${escapeHtml(run.companyName ?? String(run.companyId))} · ${escapeHtml(stamp(run.ts))}`
      : "no run on record yet — the case list below is what would run"
  }</p>

  <section class="card">
    <h2>The short version</h2>
    <div class="tiles">
      ${tile("things we check", totals.total)}
      ${tile("worked", totals.passed, "good")}
      ${tile("broken", totals.failed, totals.failed ? "crit" : "")}
      ${tile("couldn’t tell", totals.inconclusive, totals.inconclusive ? "warn" : "")}
      ${tile("not checked", totals.notrun)}
    </div>
    <p class="lede" style="margin-top:14px">${scopeLine}</p>
    <p class="lede">Each row below is one thing we expect Procol to do — or to refuse. The platform asked the
    app to do it for real, and wrote down what came back. <strong>Every row is listed whether or not this run
    got to it</strong>, so you can see the gaps as well as the results. Open a row to see the steps it takes,
    what the app replied, and the exact command to try it yourself.</p>
    <h5 style="margin-top:18px">What the four results mean</h5>
    <div class="legend">
      ${(["pass", "fail", "inconclusive", "notrun"] as Verdict[])
        .map(
          (v) =>
            `<div><span class="pill ${VERDICT_PILL[v].cls}">${escapeHtml(
              VERDICT_PILL[v].label,
            )}</span><span>${escapeHtml(VERDICT_PILL[v].meaning)}</span></div>`,
        )
        .join("")}
    </div>
  </section>

  <div class="filters">
    <input id="q" type="search" placeholder="Search these tests…" aria-label="Filter cases">
    <select id="fverdict" aria-label="Filter by verdict">
      <option value="">Show everything</option>
      <option value="fail">Only what broke</option>
      <option value="pass">Only what worked</option>
      <option value="inconclusive">Only the unclear ones</option>
      <option value="notrun">Only what wasn’t checked</option>
    </select>
    <select id="fmodule" aria-label="Filter by module">
      <option value="">Every part of Procol</option>
      ${sections.map((s) => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)} (${s.rows.length})</option>`).join("")}
    </select>
    <button id="expand" type="button" class="copy">Open everything that broke</button>
    <span class="count" id="showing"></span>
  </div>

  ${sections.length ? sections.map((s) => renderSection(s, run?.companyId)).join("") : `<p class="none">No cases in the library for this selection.</p>`}
</div>
<script>
(function () {
  var q = document.getElementById("q");
  var fv = document.getElementById("fverdict");
  var fm = document.getElementById("fmodule");
  var showing = document.getElementById("showing");
  var cases = [].slice.call(document.querySelectorAll("details.case"));

  function apply() {
    var text = q.value.trim().toLowerCase();
    var seen = 0;
    cases.forEach(function (el) {
      var ok = (!fv.value || el.getAttribute("data-verdict") === fv.value)
        && (!text || (el.getAttribute("data-search") || "").indexOf(text) !== -1);
      el.classList.toggle("hidden", !ok);
      if (ok) seen++;
    });
    [].forEach.call(document.querySelectorAll("section.module"), function (m) {
      var wrongModule = Boolean(fm.value) && m.getAttribute("data-module") !== fm.value;
      var live = m.querySelectorAll("details.case:not(.hidden)").length;
      m.classList.toggle("hidden", wrongModule || live === 0);
    });
    showing.textContent = seen === cases.length ? cases.length + " cases" : "showing " + seen + " of " + cases.length + " cases";
  }

  [q, fv, fm].forEach(function (el) { el.addEventListener("input", apply); el.addEventListener("change", apply); });

  // #module=Intake opens the report already narrowed — what the UI links to.
  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  var wanted = /^module=/.test(hash) ? hash.slice(7) : "";
  if (wanted) {
    for (var i = 0; i < fm.options.length; i++) {
      if (fm.options[i].value.toLowerCase() === wanted.toLowerCase()) { fm.value = fm.options[i].value; break; }
    }
  }
  apply();

  document.getElementById("expand").addEventListener("click", function () {
    cases.forEach(function (el) { if (el.getAttribute("data-verdict") === "fail") el.open = true; });
  });

  [].forEach.call(document.querySelectorAll("button.copy[data-copy]"), function (b) {
    b.addEventListener("click", function () {
      var pre = document.getElementById(b.getAttribute("data-copy"));
      if (!pre) return;
      var done = function () { var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pre.textContent).then(done, function () {});
      else done();
    });
  });
})();
</script>
</body>
</html>
`;
}

/**
 * The features a saved run covered.
 *
 * A features run stores its selection in the request line ("features: pr.list,
 * pr.read"), which is what lets a report scope itself to that run without the
 * caller having to repeat the list. An agent run's request is prose, so this
 * returns nothing and the report covers the library — correctly, because an
 * agent run is not confined to a module.
 */
export function featuresOfRun(run: RunRecord | null): string[] {
  const match = run?.request?.match(/^\s*features:\s*(.+)$/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

/** The run a report defaults to: the most recent one on disk. */
export function latestRun(): RunRecord | null {
  const [newest] = listRuns(1);
  return newest ? getRun(newest.id) : null;
}
