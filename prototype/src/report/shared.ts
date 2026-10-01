/**
 * The look both reports share.
 *
 * One stylesheet for the test report and the bug sheet, so the two read as one
 * pair of documents rather than two pages that happen to be in the same app.
 * Self-contained HTML — no bundler, no CDN — so a report can be saved, mailed
 * or attached to a ticket and still render.
 */

import { endpointInWords, scrubIds, type CaseDisplay, type DetailRow, type VerdictWord } from "../checks/caseDisplay.js";
import { FEATURE_TREE } from "../../config/featureTree.js";

/** "events.rfp_only" → "RFP only"; "plan.Create_technical_RFP+RFQ,_bid_and_award" → "Create technical RFP+RFQ, bid and award". */
export function flowKeyInWords(key: string): string {
  for (const g of FEATURE_TREE) {
    const c = g.children.find((x) => x.id === key);
    if (c) return c.label;
  }
  const rest = key.replace(/^[a-z]+\./i, "");
  return rest.replace(/_/g, " ").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
}
import { redactSecrets } from "../checks/engine.js";

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ── a bug, in words ────────────────────────────────────────────────────────

/**
 * A defect as a person reads it. Producers in src/report attach this to the
 * DefectGroup they build (`(group as WithHuman<DefectGroup>).human`); the bug
 * sheet prints it in the main text and keeps the evidence, the call and the
 * fingerprint in the technical fold. A defect without it falls back to its
 * title and rationale, passed through `humanText`.
 */
export interface HumanBug {
  /** one line: what goes wrong */
  title: string;
  /** what happened, in a sentence or two */
  what?: string;
  /** where in Procol */
  where?: string;
  /** how to reproduce, numbered */
  steps?: string[];
  expected?: string;
  actual?: string;
  /** the test cases that show it — their track record says how often */
  caseIds?: string[];
}
export type WithHuman<T> = T & { human?: HumanBug };

// ── one test case, drawn the same way on every report ─────────────────────
//
// The owner's rule: a test case reads like a test case. Title, area, priority,
// type, preconditions, numbered steps, expected, actual, verdict and the one
// sentence that explains it — all in words. The id, the request, the body, the
// status, the error code, the file:line of the rule and the ids it resolved
// go in ONE "Technical details" fold, closed by default (class "tech"), so
// nothing is lost and nothing codish is in the way.

/** The verdict chip colour for each verdict word. */
export const VERDICT_WORD_PILL: Record<VerdictWord, string> = {
  Passed: "p-pass",
  Failed: "p-fail",
  "Couldn't tell": "p-incon",
  "Not run": "p-notrun",
};

/** Technical rows as a definition list; secrets are masked before anything is printed. */
export function renderDetailRows(rows: DetailRow[]): string {
  const kept = rows.filter((r) => r && String(r.value ?? "").trim());
  if (!kept.length) return "";
  return `<dl class="tc-tech">${kept
    .map((r) => {
      const v = redactSecrets(String(r.value)) ?? "";
      const body =
        r.kind === "block" || v.includes("\n")
          ? `<pre>${escapeHtml(v)}</pre>`
          : r.kind === "code"
            ? `<code>${escapeHtml(v)}</code>`
            : escapeHtml(v);
      return `<dt>${escapeHtml(r.label)}</dt><dd>${body}</dd>`;
    })
    .join("")}</dl>`;
}

/** The technical fold. Closed by default; empty when there is nothing technical to show. */
export function renderTechFold(rows: DetailRow[], extraHtml = "", summary = "Technical details"): string {
  const inner = renderDetailRows(rows) + extraHtml;
  if (!inner.trim()) return "";
  return `<details class="tech"><summary>${escapeHtml(summary)}</summary><div class="tech-body">${inner}</div></details>`;
}

export interface TestCaseExtras {
  /** extra main-text HTML (already escaped): a known-bug note, how to make it run */
  notes?: string;
  /** extra HTML inside the technical fold: the curl, the evidence */
  tech?: string;
  /** the case id whose track record the page fills in from spine.ai's database */
  trackId?: string;
  /** leave the area / priority / type line out (a field check under its step already says them) */
  hideMeta?: boolean;
  /** leave the verdict line out (the row's summary already shows it) */
  hideVerdict?: boolean;
  /** id value → what it is ("the event"), for the ids this run made */
  known?: Record<string, string>;
}

/**
 * The last pass before a sentence is printed in the main text.
 *
 * `caseDisplay` makes the sentence; this only takes out what still reads as
 * machine output once it is on the page: reference ids (named when the run
 * knows what they are), a quoted machine value (“line_item_based” → “line item
 * based”) and, in a sentence about a time, a Unix timestamp (→ the date). The
 * exact value is always in the technical fold beside it.
 */
export function humanText(text: string | undefined, known: Record<string, string> = {}): string {
  // scrubIds does not see an id followed by a full stop; a marker between the
  // two lets its own sentence rules ("…for the invited X.") apply, then goes.
  let s = String(text ?? "").replace(/(?<![\w@.\/+=-])([A-Za-z0-9+\/]{6,8}={0,2})\.(?=\s|$)/g, "$1\u0000.");
  s = scrubIds(s, known).replace(/\u0000/g, "");
  // Terminal colour codes from a test runner's message ("[2mexpect([22m…").
  s = s.replace(/\u001b?\[\d+(?:;\d+)*m/g, "");
  // Playwright's own words for a timeout.
  s = s.replace(/\bpage\.goto: Timeout (\d+)ms exceeded\.?/g, (_m, ms: string) => `the page did not load within ${Math.round(Number(ms) / 1000)} seconds.`);
  s = s.replace(/\b(?:locator|page)\.(click|fill|waitFor\w*|check|selectOption): Timeout (\d+)ms exceeded\.?/g, (_m, what: string, ms: string) =>
    `the screen element could not be ${/fill/.test(what) ? "filled in" : /click|check|select/i.test(what) ? "clicked" : "found"} within ${Math.round(Number(ms) / 1000)} seconds.`);
  // A request named by its method and path → the request in words.
  s = s.replace(/\b(GET|POST|PATCH|PUT|DELETE) (\/[^\s,;)"”]+)/g, (_m, m: string, path: string) => endpointInWords(m, path));
  // A flow or feature key ("events.rfp_only", "plan.Save_as_draft_…") → its name.
  s = s.replace(/(?<![\w\/.-])(?:events|plan|bids|auction|award|finance|vendorbulk|journey|evaluation|pr|po)\.[A-Za-z0-9_+,-]*[A-Za-z0-9]/gi, (k) => flowKeyInWords(k.replace(/^Plan\./, "plan.").replace(/^Events\./, "events.")));
  // A test record the platform named with a date ("UI_Auto_RFP_2026-09-30_11-59-52-401").
  s = s.replace(/\b(?:UI_Auto|UI_Plan|QA_Platform|API_Journey|API_Test)_[A-Za-z0-9_-]*\d{4}[A-Za-z0-9_-]*/g, (n) => n.replace(/_/g, " "));
  if (!s) return s;
  // A reference id at the end of a sentence ("…such as RHBjY3Bj.") — scrubIds
  // leaves those because of the full stop after them.
  s = s.replace(/(?<![\w@.\/+=-])(?=[A-Za-z0-9+\/]*[A-Z])(?=[A-Za-z0-9+\/]*\d)[A-Za-z0-9+\/]{6}[A-Za-z0-9+\/=]{2}(?=[.,;:)]+(?:\s|$))/g, (id) => known[id] ?? "a reference id");
  // A sentence that is an instruction to a developer (names a script or source file) is not for this page.
  s = s.replace(/[^.!?]*\b[\w-]+\/[\w.\/-]+\.(?:mjs|ts|js|rb|json|yml)\b[^.!?]*[.!?]?\s*/g, "").trim();
  // “Variations_1790768939678” — a test record the run made, by its stamp.
  s = s.replace(/([“"])([A-Za-z][A-Za-z0-9_]*?)_\d{10,}([”"])/g, (_m, a: string, v: string, b: string) => `${a}${v.replace(/_/g, " ")}${b} (test record)`);
  s = s.replace(/([“"‘'])([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)([”"’'])/g, (_m, a: string, v: string, b: string) => `${a}${v.replace(/_/g, " ")}${b}`);
  // A bare machine name in a sentence — gst_no, routeAuctionsToAuctionTeam — read as words.
  s = s.replace(/(?<![\w.\/@&:$-])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?![\w.(\/&=@-])/g, (m) => m.replace(/_/g, " "));
  s = s.replace(/(?<![\w.\/@&:$-])([a-z]+(?:[A-Z][a-z0-9]+)+)(?![\w.(\/&=-])/g, (m) => m.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase());
  if (/\b(time|date|timestamp|created|updated)\b/i.test(s) || /^It was 1[5-9]\d{8}\b/.test(s)) {
    s = s.replace(/\b1[5-9]\d{8}\b/g, (n) => {
      const d = new Date(Number(n) * 1000);
      return Number.isNaN(d.getTime()) ? n : d.toISOString().slice(0, 10);
    });
  }
  return s;
}

/** A display with every main-text field passed through `humanText`; the details are left exactly as recorded. */
export function humanDisplay(d: CaseDisplay, known: Record<string, string> = {}): CaseDisplay {
  const h = (t: string | undefined) => (t === undefined ? t : humanText(t, known));
  return {
    ...d,
    title: h(d.title) ?? "",
    area: h(d.area) ?? "",
    preconditions: h(d.preconditions) ?? "",
    steps: d.steps.map((st) => h(st) ?? ""),
    expected: h(d.expected) ?? "",
    why: h(d.why),
    actual: h(d.actual),
    reason: h(d.reason),
  };
}

/** One test case's body: the human part, then the technical fold. */
export function renderTestCase(raw: CaseDisplay, x: TestCaseExtras = {}): string {
  const d = humanDisplay(raw, x.known);
  const meta = [
    d.area ? `<span><b>Area</b> ${escapeHtml(d.area)}</span>` : "",
    d.priority ? `<span><b>Priority</b> ${escapeHtml(d.priority)}</span>` : "",
    d.type ? `<span><b>Type</b> ${escapeHtml(d.type)}</span>` : "",
  ].filter(Boolean);
  const bad = d.verdict === "Failed";
  return `<div class="tc">
  ${!x.hideMeta && meta.length ? `<p class="tc-meta">${meta.join("")}</p>` : ""}
  <div class="tc-grid">
    <div>
      ${d.preconditions ? `<h5>Preconditions</h5><p class="pre">${escapeHtml(d.preconditions)}</p>` : ""}
      ${d.steps.length ? `<h5>Steps</h5><ol class="steps">${d.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : ""}
      ${d.expected ? `<h5>Expected result</h5><p class="expect">${escapeHtml(d.expected)}</p>` : ""}
      ${d.why ? `<p class="tc-why"><b>Why this matters:</b> ${escapeHtml(d.why)}</p>` : ""}
    </div>
    <div>
      ${d.actual ? `<h5>Actual result</h5><p class="${bad ? "said-bad" : "said"}">${escapeHtml(d.actual)}</p>` : ""}
      ${
        !x.hideVerdict && d.verdict
          ? `<p class="tc-verdict"><span class="pill ${VERDICT_WORD_PILL[d.verdict]}">${escapeHtml(d.verdict)}</span> ${escapeHtml(d.reason ?? "")}</p>`
          : ""
      }
      ${x.notes ?? ""}
      ${x.trackId ? `<p class="tc-track" data-track="${escapeHtml(x.trackId)}" hidden></p>` : ""}
    </div>
  </div>
  ${renderTechFold(d.details, x.tech ?? "")}
</div>`;
}

/**
 * Fills each [data-track] with the case's record across runs, from spine.ai's
 * own database (GET /api/case-display/track). A saved copy of the page, or a
 * database that is down, simply shows no track record — never an error.
 */
export function trackScript(companyId?: number): string {
  return `<script>
(function () {
  var els = [].slice.call(document.querySelectorAll("[data-track]"));
  if (!els.length || !window.fetch || location.protocol === "file:") return;
  var ids = []; var seen = {};
  els.forEach(function (el) { var id = el.getAttribute("data-track"); if (id && !seen[id]) { seen[id] = 1; ids.push(id); } });
  function fill(records) {
    els.forEach(function (el) {
      var r = records[el.getAttribute("data-track")];
      if (r && r.words) { el.textContent = (el.getAttribute("data-track-label") || "Track record") + ": " + r.words + "."; el.hidden = false; }
    });
  }
  for (var i = 0; i < ids.length; i += 60) {
    var chunk = ids.slice(i, i + 60);
    fetch("/api/case-display/track?ids=" + encodeURIComponent(chunk.join(","))${companyId ? ` + "&c=${Number(companyId)}"` : ""})
      .then(function (r) { return r.ok ? r.json() : { records: {} }; })
      .then(function (j) { fill(j.records || {}); })
      .catch(function () {});
  }
})();
</script>`;
}

/** The rules for a drawn test case — shared by every report. */
export const TEST_CASE_CSS = `
.tc { font-size: 12.5px; }
.tc-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 10px 0 2px; font-size: 12px; color: var(--ink-2); }
.tc-meta b { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-right: 5px; font-weight: 700; }
.tc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 26px; }
@media (max-width: 760px) { .tc-grid { grid-template-columns: 1fr; } }
.tc h5 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 12px 0 5px; }
.tc p { margin: 0; line-height: 1.55; overflow-wrap: anywhere; }
.tc .pre { color: var(--ink-2); }
.tc .steps { margin: 0; padding-left: 20px; line-height: 1.6; color: var(--ink-2); }
.tc .said-bad { color: var(--bad); }
.tc-why { margin-top: 10px !important; color: var(--muted); font-size: 12px; }
.tc-why b { color: var(--ink-2); }
.tc-verdict { margin-top: 10px !important; display: flex; gap: 8px; align-items: baseline; line-height: 1.5; }
.tc-verdict .pill { flex: 0 0 auto; }
.tc-track { margin-top: 8px !important; font-size: 11.5px; color: var(--muted); }
details.tech { margin: 14px 0 0; border-top: 1px dashed var(--line); padding-top: 8px; }
details.tech > summary { cursor: pointer; font-size: 11.5px; color: var(--link); list-style: none; width: fit-content; }
details.tech > summary::-webkit-details-marker { display: none; }
details.tech > summary::before { content: "▸ "; }
details.tech[open] > summary::before { content: "▾ "; }
.tech-body { margin-top: 8px; }
dl.tc-tech { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 14px; margin: 0 0 8px; font-size: 12px; }
dl.tc-tech dt { color: var(--muted); font-weight: 600; }
dl.tc-tech dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--ink-2); }
dl.tc-tech code { font-size: 11.5px; background: var(--code); padding: 1px 5px; border-radius: 4px; word-break: break-all; }
dl.tc-tech pre { max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
@media (max-width: 560px) { dl.tc-tech { grid-template-columns: 1fr; } dl.tc-tech dd { margin-bottom: 6px; } }
`;

/** Local wall clock, to the minute — reports are read by people, not diffed. */
export function stamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return String(iso ?? "");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export const PAGE_CSS = `
/**
 * One palette, two themes.
 *
 * Tokens rather than hex, so a report follows the reader's system setting
 * instead of blinding whoever works at night — and every colour is defined
 * once, in the light block, and only redefined in the dark one.
 */
:root {
  color-scheme: light dark;
  --paper: #f6f7f8;
  --card: #ffffff;
  --hover: #f8f9fa;
  --line: #dcdfe3;
  --grid: #eceff1;
  --ink: #1f2328;
  --ink-2: #3c4043;
  --muted: #5f6368;
  --code: #eef0f2;
  --good: #1e7a45;
  --bad: #a02020;
  --warn: #8a5a00;
  --link: #1a73e8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0f1319;
    --card: #171c24;
    --hover: #1d2430;
    --line: #2a323d;
    --grid: #232a34;
    --ink: #e8ecf1;
    --ink-2: #c7cfd9;
    --muted: #9aa5b1;
    --code: #222932;
    --good: #57c98a;
    --bad: #f2807a;
    --warn: #e5b567;
    --link: #7fb0ff;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
.wrap { max-width: 1400px; margin: 0 auto; padding: 24px 20px 72px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { margin: 0 0 18px; color: var(--muted); font-size: 13px; }
.sub code, .lede code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin: 0 0 18px; }
.card h2 { font-size: 15px; margin: 0 0 12px; }
/* Run-level facts, not defects: kept visually apart from the bug table so
   nothing here reads as engineering work. */
.note-card { border-left: 3px solid var(--warn, #e0a34a); }
.run-notes { margin: 8px 0 0; padding-left: 20px; line-height: 1.6; }
.run-notes li { margin: 4px 0; }
.count { font-size: 12px; color: var(--muted); font-weight: 400; }
.lede { color: var(--muted); font-size: 12.5px; margin: 0 0 14px; line-height: 1.55; }
.lede strong { color: var(--ink-2); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(116px, 1fr)); gap: 10px; }
.tile { border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; background: var(--hover); }
.tile-v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile-l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.tile.crit .tile-v { color: var(--bad); }
.tile.good .tile-v { color: var(--good); }
.tile.warn .tile-v { color: var(--warn); }
/* Verdict chips keep their own colours in both themes: they are the one thing
   a reader matches across the report, the sheet and the spreadsheet. */
.pill { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.p-pass { background: #d9ead3; color: #1e5c2a; }
.p-fail { background: #a02020; color: #fff; }
.p-incon { background: #fce8b2; color: #5c4404; }
.p-notrun { background: #e4e7ea; color: #4a4f55; }
.p-muted { background: #e4e7ea; color: #4a4f55; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 14px; }
.filters input, .filters select, .filters button { font: inherit; font-size: 13px; padding: 5px 8px;
  border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); }
.filters input { min-width: 230px; }
.filters button { cursor: pointer; }
.hidden { display: none !important; }
@media (max-width: 560px) {
  .wrap { padding: 16px 16px 56px; }
  .filters { position: static !important; }
  .filters input { min-width: 0; flex: 1 1 100%; }
  .filters select { min-width: 0; flex: 1 1 40%; }
  .card { padding: 14px; }
}
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: var(--code); border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px;
  overflow-x: auto; font-size: 11.5px; line-height: 1.5; margin: 0; white-space: pre; color: var(--ink-2); }
a { color: var(--link); }
.none { color: var(--muted); font-size: 12.5px; margin: 6px 0; }
`;
