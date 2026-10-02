import { CaseKind } from "../lib/apiLog";
import {
  CallEvidence,
  CatalogueRow,
  ClientGroup,
  FlowGroup,
  ModuleGroup,
  ReportCase,
  ReportModel,
  TestStatus,
} from "./apiModel";
import { BUG_TABLE_CSS, BUG_TABLE_JS, bugCounts, renderBugTable } from "./bugTable";
import { TOKEN_VAR } from "./curl";

/**
 * Renders the report model as one self-contained HTML file — no external CSS,
 * fonts or scripts, so it opens from disk and survives being emailed as an
 * attachment or published as a CI artifact.
 */

/**
 * Whether the report being rendered is a CLI run rather than a test run.
 *
 * A module flag rather than a parameter threaded through renderClient →
 * renderModule → renderFlow → renderCase: rendering is synchronous and
 * single-pass, and only two places care, so the plumbing would cost more than
 * it explains. Set once at the top of renderReport.
 */
let isRunMode = false;

/**
 * Sequence number of the slowest call in the run, so its evidence block can
 * carry id="slowest" and the "slowest call" tile has somewhere to jump to.
 * Set once at the top of renderReport, alongside isRunMode.
 */
let slowestSeq: number | undefined;

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Drops the "[negative]" tag and the "[case.id]" suffix from a test title. */
const cleanTitle = (title: string): string =>
  title.replace(/^\[(positive|negative|edge)\]\s*/i, "").replace(/\s*\[[a-z0-9_.]+\]\s*$/i, "");

const ms = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;

/** Local wall-clock time, to the second, plus milliseconds — the "log time". */
function logTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}`
  );
}

/** HTTP status → the status-palette role it reads as. */
function statusRole(status: number): string {
  if (status === 0) return "critical";
  if (status >= 500) return "critical";
  if (status >= 400) return "serious";
  if (status >= 300) return "warning";
  return "good";
}

const testStatusRole = (status: TestStatus): string =>
  status === "passed" ? "good" : status === "skipped" ? "muted" : "critical";

const STATUS_LABEL: Record<TestStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  timedOut: "Timed out",
  skipped: "Not run",
  interrupted: "Interrupted",
};

/** Icon + label, never colour alone — the status palette's mitigation rule. */
const STATUS_ICON: Record<TestStatus, string> = {
  passed: "✓",
  failed: "✕",
  timedOut: "⏱",
  skipped: "–",
  interrupted: "!",
};

const KIND_LABEL: Record<CaseKind, string> = {
  positive: "Positive",
  negative: "Negative",
  edge: "Edge",
};

/**
 * One API call as evidence: the verdict, and the command that reproduces it.
 *
 * This used to print both header sets and both bodies, which turned the report
 * into a 7 MB network capture — and a reader still could not re-run the call.
 * A curl is smaller, says the same thing, and can be pasted into a terminal or
 * a ticket. The raw traffic stays in reports/api-calls/*.jsonl for the rare
 * case that needs it.
 */
function renderEvidence(call: CallEvidence, index: number): string {
  const role = statusRole(call.status);
  const statusText = call.status === 0 ? "no response" : `${call.status} ${call.statusText ?? ""}`.trim();
  const isSlowest = slowestSeq !== undefined && call.seq === slowestSeq;

  return `
<details class="call" data-ok="${call.ok ? "1" : "0"}"${isSlowest ? ' id="slowest"' : ""}>
  <summary>
    <span class="idx">${index + 1}</span>
    <span class="method m-${escapeHtml(call.method.toLowerCase())}">${escapeHtml(call.method)}</span>
    <code class="uri">${escapeHtml(call.uri)}</code>
    <span class="pill ${role}">${escapeHtml(statusText)}</span>
    <span class="time">${ms(call.durationMs)}</span>
    ${call.unauthenticated ? `<span class="pill muted" title="sent deliberately without credentials">no auth</span>` : ""}
  </summary>
  <div class="call-body">
    ${
      call.message
        ? `<div class="${call.ok ? "msg-box" : "error-box"}">
             <div class="error-title">${escapeHtml(
               call.ok ? "API said" : call.status === 0 ? "Request failed" : `API returned ${call.status}`,
             )}</div>
             <p class="error-msg">${escapeHtml(call.message)}</p>
           </div>`
        : ""
    }
    <div class="curl">
      <div class="curl-head">
        <span>Reproduce</span>
        <button class="copy" type="button" data-copy="curl-${call.seq}">Copy curl</button>
      </div>
      <pre id="curl-${call.seq}">${escapeHtml(call.curl)}</pre>
      ${
        call.recordUuid
          ? `<p class="curl-note">created record <code>${escapeHtml(call.recordUuid)}</code></p>`
          : ""
      }
    </div>
    <p class="call-meta">${escapeHtml(logTime(call.timestamp))} · ${ms(call.durationMs)} · ${escapeHtml(
      call.clientId,
    )}${call.identity ? ` · as ${escapeHtml(call.identity)}` : ""}</p>
  </div>
</details>`;
}

function renderCase(reportCase: ReportCase): string {
  const { test } = reportCase;
  const role = testStatusRole(test.status);
  const title = cleanTitle(test.title);

  return `
<details class="case" data-status="${escapeHtml(test.status)}" data-kind="${escapeHtml(reportCase.kind)}"
         data-module="${escapeHtml(reportCase.module)}"
         data-search="${escapeHtml(
           `${title} ${reportCase.module} ${reportCase.moduleKey ?? ""} ${reportCase.flow} ${reportCase.flowKey}`.toLowerCase(),
         )}">
  <summary>
    <span class="pill ${role}">${STATUS_ICON[test.status]} ${escapeHtml(STATUS_LABEL[test.status])}</span>
    ${isRunMode ? "" : `<span class="kind k-${escapeHtml(reportCase.kind)}">${escapeHtml(KIND_LABEL[reportCase.kind])}</span>`}
    <span class="case-title">${escapeHtml(title)}</span>
    <span class="grow"></span>
    <span class="meta">${reportCase.calls.length} call${reportCase.calls.length === 1 ? "" : "s"}</span>
    ${
      reportCase.failedCalls.length
        ? `<span class="pill ${test.status === "passed" ? "warning" : "serious"}" title="${
            test.status === "passed"
              ? "expected — this case asserts the API refuses the request"
              : "unexpected non-2xx"
          }">${reportCase.failedCalls.length} non-2xx</span>`
        : ""
    }
    <span class="time">${ms(test.durationMs)}</span>
  </summary>
  <div class="case-body">
    <table class="kv facts">
      <tr><th>Expected</th><td>the API to <strong>${escapeHtml(reportCase.expects)}</strong> this request</td></tr>
      ${reportCase.because ? `<tr><th>Why this case exists</th><td>${escapeHtml(reportCase.because)}</td></tr>` : ""}
      <tr><th>Module</th><td>${escapeHtml(reportCase.module)}${
        reportCase.moduleKey ? ` <code>${escapeHtml(reportCase.moduleKey)}</code>` : ""
      }</td></tr>
      <tr><th>Flow</th><td>${escapeHtml(reportCase.flow)} <code>${escapeHtml(reportCase.flowKey)}</code></td></tr>
      <tr><th>Spec</th><td><code>${escapeHtml(test.file)}</code></td></tr>
      ${test.retries ? `<tr><th>Retries</th><td>${test.retries}</td></tr>` : ""}
    </table>
    ${
      test.errorMessage
        ? `<div class="error-box">
             <div class="error-title">Test failure</div>
             <pre class="error-msg">${escapeHtml(test.errorMessage)}</pre>
           </div>`
        : ""
    }
    ${
      test.skipReason
        ? `<div class="skip-box"><strong>Not run:</strong> ${escapeHtml(test.skipReason)}</div>`
        : ""
    }
    <h5 class="calls-head">Evidence — ${reportCase.calls.length} call${
      reportCase.calls.length === 1 ? "" : "s"
    }, as curl</h5>
    ${
      reportCase.calls.length
        ? reportCase.calls.map(renderEvidence).join("")
        : `<p class="none">This case made no API calls${
            test.status === "skipped" ? " — it did not run." : "."
          }</p>`
    }
  </div>
</details>`;
}

/** Per-flow coverage of the three kinds, as labelled counts. */
function renderKindStrip(flow: FlowGroup): string {
  if (isRunMode) return "";
  return (["positive", "negative", "edge"] as CaseKind[])
    .map((kind) => {
      const c = flow.counts[kind];
      if (c.total === 0) return `<span class="kchip empty">${KIND_LABEL[kind]} 0</span>`;
      const failed = c.failed > 0;
      return `<span class="kchip k-${kind}${failed ? " has-fail" : ""}">${KIND_LABEL[kind]} ${c.passed}/${c.total}${
        c.skipped ? ` · ${c.skipped} not run` : ""
      }</span>`;
    })
    .join("");
}

function renderFlow(flow: FlowGroup): string {
  const failed = flow.cases.filter((c) => c.test.status === "failed" || c.test.status === "timedOut").length;
  const skipped = flow.cases.filter((c) => c.test.status === "skipped").length;
  const role = failed ? "critical" : skipped === flow.cases.length ? "muted" : "good";

  return `
<section class="flow">
  <header class="flow-head">
    <span class="pill ${role}">${failed ? `${failed} failed` : skipped === flow.cases.length ? "not run" : "passed"}</span>
    <h3>${escapeHtml(flow.flow)}</h3>
    ${isRunMode ? "" : `<code class="flowkey">${escapeHtml(flow.flowKey)}</code>`}
    <span class="grow"></span>
    ${renderKindStrip(flow)}
    <span class="meta">${flow.callCount} call${flow.callCount === 1 ? "" : "s"}</span>
    ${
      flow.failedCallCount
        ? `<span class="pill ${failed ? "serious" : "warning"}">${flow.failedCallCount} non-2xx</span>`
        : ""
    }
    ${flow.slowestCallMs ? `<span class="time">slowest ${ms(flow.slowestCallMs)}</span>` : ""}
  </header>
  ${flow.cases.map(renderCase).join("")}
</section>`;
}

/** Verdict for one catalogue row: what the run did to a case the schema asks for. */
function catalogueVerdict(row: CatalogueRow): { role: string; label: string } {
  if (row.status === "passed") return { role: "good", label: "✓ Pass" };
  if (row.status === "failed" || row.status === "timedOut") return { role: "critical", label: "✕ Fail" };
  if (row.status === "skipped") return { role: "muted", label: "– Not run" };
  return { role: "warning", label: "! Not exercised" };
}

/**
 * The module's test cases, as its own schema defines them.
 *
 * Read from the module's live field schema (config/clients/<id>.json, written
 * by `npm run discover` off GET /api/flexi_datasources/{uuid}) plus the
 * hand-written cases in config/test-cases.yaml. Every declared validation rule
 * yields a violation that must be rejected and a boundary that must be
 * accepted — so this table is what the platform promises, and the Result
 * column is what it delivered.
 *
 * A case with no result is the honest part: the schema asks for it and this
 * run did not check it. It is reported as a gap, never as a pass.
 */
function renderCoverage(group: ModuleGroup): string {
  const c = group.coverage;
  if (!c) return "";

  // Nothing derived and no rules declared: there is nothing to say, and an
  // empty table reading "0/0 cases pass" would look like a broken section.
  if (c.defined === 0 && c.ruleCount === 0) return "";
  if (c.defined === 0) {
    return `<p class="none">This module declares ${c.ruleCount} validation rule${
      c.ruleCount === 1 ? "" : "s"
    }, all of them on fields the suite cannot set (formulas, rollups, read-only), so no
    case is derived from them. They are listed as untestable in the run output.</p>`;
  }

  const row = (r: CatalogueRow) => {
    const verdict = catalogueVerdict(r);
    return `<tr data-status="${escapeHtml(r.status ?? "not-exercised")}">
      <td><span class="pill ${verdict.role}">${escapeHtml(verdict.label)}</span></td>
      <td><span class="kind k-${escapeHtml(r.kind)}">${escapeHtml(KIND_LABEL[r.kind])}</span></td>
      <td class="case-name">${escapeHtml(r.name)}</td>
      <td class="nowrap">${escapeHtml(r.expects)}</td>
      <td class="why">${escapeHtml(r.because)}${
        r.skipReason ? `<span class="skip-why">not run: ${escapeHtml(r.skipReason)}</span>` : ""
      }</td>
      <td class="nowrap">${r.source === "generated" ? "schema" : "test-cases.yaml"}</td>
    </tr>`;
  };

  return `
  <details class="coverage" ${c.failed || c.notRun ? "open" : ""}>
    <summary>
      <span class="pill ${c.failed ? "critical" : c.notRun ? "warning" : "good"}">${c.passed}/${c.defined} cases pass</span>
      <span class="cov-label">Test cases defined by this module’s schema</span>
      <span class="grow"></span>
      <span class="meta">${c.ruleCount} validation rule${c.ruleCount === 1 ? "" : "s"} declared</span>
      ${c.notRun ? `<span class="pill warning">${c.notRun} not run</span>` : ""}
      <code class="flowkey">${escapeHtml(c.datasourceKey)}</code>
    </summary>
    <div class="scroll">
      <table class="grid tight cov">
        <thead><tr>
          <th>Result</th><th>Kind</th><th>Test case</th><th>Expects</th><th>Why it exists</th><th>From</th>
        </tr></thead>
        <tbody>${c.rows.map(row).join("")}</tbody>
      </table>
    </div>
  </details>`;
}

/** One module — the level a reader actually asks about: "how is PO doing?" */
function renderModule(group: ModuleGroup): string {
  const role = group.failed ? "critical" : group.skipped === group.total ? "muted" : "good";
  return `
<section class="module" data-module="${escapeHtml(group.module)}">
  <header class="module-head">
    <span class="pill ${role}">${
      group.failed ? `${group.failed} failed` : group.skipped === group.total ? "not run" : "all passed"
    }</span>
    <h3>${escapeHtml(group.module)}</h3>
    ${group.moduleKey ? `<code class="flowkey">${escapeHtml(group.moduleKey)}</code>` : ""}
    <span class="grow"></span>
    <span class="meta">${group.passed}/${group.total} run cases pass</span>
    ${group.skipped ? `<span class="meta">${group.skipped} not run</span>` : ""}
    <span class="meta">${group.callCount} call${group.callCount === 1 ? "" : "s"}</span>
  </header>
  ${renderCoverage(group)}
  ${group.flows.map(renderFlow).join("")}
</section>`;
}

function renderClient(client: ClientGroup): string {
  return `
<section class="client">
  <h2>${escapeHtml(client.clientId)}${client.companyId ? ` · company ${escapeHtml(client.companyId)}` : ""}</h2>
  ${client.baseUrl ? `<p class="baseurl"><code>${escapeHtml(client.baseUrl)}</code></p>` : ""}
  ${client.modules.map(renderModule).join("")}
</section>`;
}

/** Every non-2xx call in the run, most severe first — the first thing to read. */
function renderFailures(model: ReportModel): string {
  const failures = model.cases
    .flatMap((c) => c.failedCalls.map((call) => ({ call, case: c })))
    .sort((a, b) => (b.call.status || 999) - (a.call.status || 999));

  const orphanFailures = model.orphanCalls.filter((c) => !c.ok);

  if (failures.length === 0 && orphanFailures.length === 0) {
    return `<section class="card" id="nonok"><h2>Non-2xx API calls</h2>
      <p class="none">Every API call in this run returned 2xx.</p></section>`;
  }

  const row = (call: CallEvidence, where: string, module = "") => `
    <tr data-module="${escapeHtml(module)}">
      <td><span class="pill ${statusRole(call.status)}">${call.status === 0 ? "no response" : call.status}</span></td>
      <td><span class="method m-${escapeHtml(call.method.toLowerCase())}">${escapeHtml(call.method)}</span></td>
      <td><code>${escapeHtml(call.uri)}</code></td>
      <td class="err">${escapeHtml(call.message ?? "—")}</td>
      <td class="nowrap num">${ms(call.durationMs)}</td>
      <td class="nowrap">${escapeHtml(logTime(call.timestamp))}</td>
      <td class="where">${escapeHtml(where)}</td>
    </tr>`;

  return `
<section class="card" id="nonok">
  <h2>Non-2xx API calls <span class="count">${failures.length + orphanFailures.length}</span></h2>
  <p class="lede">Every call that did not return 2xx, with the message the API itself returned.
  Some are deliberate — the auth and negative cases assert a refusal — so check the Case column
  before treating a row as a defect.</p>
  <div class="scroll">
    <table class="grid failures">
      <thead><tr>
        <th>Status</th><th>Method</th><th>API URI</th><th>Error message</th>
        <th class="num">Response time</th><th>Log time</th><th>Case</th>
      </tr></thead>
      <tbody>
        ${failures.map((f) => row(f.call, cleanTitle(f.case.test.title), f.case.module)).join("")}
        ${orphanFailures.map((c) => row(c, "outside a test (setup/teardown)")).join("")}
      </tbody>
    </table>
  </div>
</section>`;
}

/**
 * The bug report, in the same sheet the team already reads.
 *
 * Rendered by the shared renderer in bugTable.ts, so this section and
 * `reports/bug-report.html` are the same table — a run report that disagreed
 * with the bug sheet would be worse than one that omitted it.
 *
 * Kept next to the run because the two answer each other: a red case here
 * usually has a row there, and a case that passes while a bug stays open is
 * worth someone's attention.
 */
function renderFindings(model: ReportModel): string {
  if (model.findings.length === 0) return "";
  const c = bugCounts(model.findings);

  return `
<section class="card" id="bugs">
  <h2>Bug report <span class="count">${c.open} open</span></h2>
  <p class="lede">${c.total} finding${c.total === 1 ? "" : "s"} for the account${
    realClients(model).length === 1 ? "" : "s"
  } this run covered —
  ${c.open} still open, ${c.blockers} blocking, ${c.p0} at P0, ${c.fixed} fixed.
  Maintained in <code>config/findings.yaml</code>; the full sheet, with filters, is
  <code>reports/bug-report.html</code>. <strong>Status</strong> is where the fix has got to;
  the <strong>verification</strong> line under each description is how far the finding itself
  was proven, so a confirmed defect and a one-off observation are never mistaken for each other.</p>
  ${renderBugTable(model.findings)}
</section>`;
}

/** Tooltip per tile action, so hovering says what a click will do. */
const TILE_HINT: Record<string, string> = {
  "filter:all": "Show every case",
  "filter:passed": "Show only cases that passed",
  "filter:failed": "Show only cases that failed",
  "filter:skipped": "Show only cases that did not run",
  "goto:bugs": "Jump to the bug report",
  "goto:nonok": "Jump to the non-2xx calls",
  "goto:slowest": "Jump to the slowest call",
};

/**
 * What the scope left out.
 *
 * A filtered report must not be a report that hides a failure, so the cases
 * outside the scope are counted here and any that failed are named. The
 * numbers above deliberately exclude them.
 */
function renderOutOfScope(model: ReportModel): string {
  const out = model.outOfScope;
  if (!out) return "";
  return `
  <div class="notes">
    <h3>Outside the module scope</h3>
    <p class="lede">${out.total} case${out.total === 1 ? "" : "s"} ran outside
    ${escapeHtml(model.moduleScope ?? "the scope")} and are not counted above —
    ${out.passed} passed, ${out.failed} failed, ${out.skipped} not run.
    ${out.modules.length ? `Excluded: ${escapeHtml(out.modules.join(", "))}.` : ""}</p>
    ${
      out.failures.length
        ? `<ul>${out.failures.map((f) => `<li class="crit-ink">${escapeHtml(f)}</li>`).join("")}</ul>`
        : ""
    }
  </div>`;
}

function renderSummary(model: ReportModel): string {
  const t = model.totals;
  /**
   * A tile is a button when it has somewhere to go, and inert when it does not
   * — a tile reading 0 failed would otherwise filter the page down to nothing
   * and look broken. `action` is read by the script at the foot of the page.
   */
  const tile = (label: string, value: string, role = "", action = "", enabled = true) => {
    const live = Boolean(action) && enabled;
    const attrs = live
      ? ` class="tile ${role} tile-link" role="button" tabindex="0" data-action="${escapeHtml(action)}"` +
        ` title="${escapeHtml(TILE_HINT[action] ?? "")}"`
      : ` class="tile ${role}"`;
    return `<div${attrs}><div class="tile-v">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;
  };

  const kindRow = (["positive", "negative", "edge"] as CaseKind[])
    .map((kind) => {
      const c = t.byKind[kind];
      return `<tr${c.total ? ` class="kind-row" role="button" tabindex="0" data-action="kind:${kind}" title="Show only ${KIND_LABEL[kind].toLowerCase()} cases"` : ""}>
        <th><span class="kind k-${kind}">${KIND_LABEL[kind]}</span></th>
        <td class="num">${c.total}</td>
        <td class="num good-ink">${c.passed}</td>
        <td class="num ${c.failed ? "crit-ink" : "muted"}">${c.failed}</td>
        <td class="num muted">${c.skipped}</td>
      </tr>`;
    })
    .join("");

  const isRun = model.mode === "run";
  void kindRow;

  return `
<section class="card">
  <h2>This run</h2>
  <div class="tiles">
    ${tile(isRun ? "steps" : "test cases", String(t.tests), "", "filter:all", t.tests > 0)}
    ${tile("passed", String(t.passed), "good", "filter:passed", t.passed > 0)}
    ${tile("failed", String(t.failed), t.failed ? "critical" : "", "filter:failed", t.failed > 0)}
    ${isRun ? "" : tile("not run", String(t.skipped), "muted", "filter:skipped", t.skipped > 0)}
    ${tile("API calls", String(t.calls), "")}
    ${tile("non-2xx calls", String(t.failedCalls), "", "goto:nonok", t.failedCalls > 0)}
    ${tile("p50 response", ms(t.p50Ms), "")}
    ${tile("p95 response", ms(t.p95Ms), "")}
    ${tile("slowest call", ms(t.maxMs), "", "goto:slowest", t.calls > 0)}
  </div>
  <div class="${isRun ? "single" : "split"}">
    ${
      isRun
        ? ""
        : `<div>
      <h3>Coverage by case kind</h3>
      <table class="grid tight">
        <thead><tr><th>Kind</th><th class="num">Cases</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Not run</th></tr></thead>
        <tbody>${kindRow}</tbody>
      </table>
    </div>`
    }
    <div>
      <h3>Environment</h3>
      <table class="kv">
        <tr><th>Client${realClients(model).length > 1 ? "s" : ""}</th><td>${escapeHtml(
          // The reporter can only guess one client from the traffic, and a run
          // that covered two would have named whichever was busier.
          realClients(model).join(", ") || model.environment.clientId,
        )}</td></tr>
        ${model.environment.companyId ? `<tr><th>Company</th><td>${escapeHtml(model.environment.companyId)}</td></tr>` : ""}
        ${model.environment.baseUrl ? `<tr><th>Base URL</th><td><code>${escapeHtml(model.environment.baseUrl)}</code></td></tr>` : ""}
        ${model.startedAt ? `<tr><th>Run started</th><td>${escapeHtml(logTime(model.startedAt))}</td></tr>` : ""}
        ${model.finishedAt ? `<tr><th>Run finished</th><td>${escapeHtml(logTime(model.finishedAt))}</td></tr>` : ""}
        ${model.wallClockMs ? `<tr><th>Wall clock</th><td>${ms(model.wallClockMs)}</td></tr>` : ""}
        <tr><th>Time in API calls</th><td>${ms(t.totalApiMs)}</td></tr>
        <tr><th>Report generated</th><td>${escapeHtml(logTime(model.generatedAt))}</td></tr>
        ${model.moduleScope ? `<tr><th>Module scope</th><td>${escapeHtml(model.moduleScope)}</td></tr>` : ""}
        <tr><th>Re-running a curl</th><td>Every call below prints as curl with the credential
          held in <code>$${escapeHtml(TOKEN_VAR)}</code> — <code>export ${escapeHtml(
            TOKEN_VAR,
          )}=…</code> first. Tokens never reach the report.</td></tr>
      </table>
    </div>
  </div>
  ${renderOutOfScope(model)}
  ${
    model.notes.length
      ? `<div class="notes"><h3>Read this before trusting the numbers</h3><ul>${model.notes
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}</ul></div>`
      : ""
  }
</section>`;
}

/**
 * Who the run went against.
 *
 * Naming a single client is wrong once a suite covers several — every
 * per-client test runs for each, and the header claimed only the busiest one.
 * Anonymous groups (the deliberately unauthenticated security cases) are not
 * clients and are left out of the count.
 */
/**
 * The modules in this run, for the picker.
 *
 * Selecting one here is the same act as scoping the run with MODULE= — one
 * happens before the run, one after — so the label is the same in both places
 * and the module a reader picks is the module the run named.
 */
function moduleOptions(model: ReportModel): string {
  const modules = new Map<string, number>();
  for (const reportCase of model.cases) {
    modules.set(reportCase.module, (modules.get(reportCase.module) ?? 0) + 1);
  }
  return [...modules.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([module, count]) =>
        `<option value="${escapeHtml(module)}">${escapeHtml(module)} (${count})</option>`,
    )
    .join("");
}

/** The client accounts a run actually went against, anonymous groups aside. */
function realClients(model: ReportModel): string[] {
  return model.clients.map((c) => c.clientId).filter((id) => id && !id.startsWith("("));
}

function subtitle(model: ReportModel): string {
  const real = realClients(model);
  const company = model.environment.companyId
    ? ` · company ${escapeHtml(model.environment.companyId)}`
    : "";
  if (real.length > 1) {
    return `${real.length} clients: ${escapeHtml(real.join(", "))}${company}`;
  }
  return `${escapeHtml(real[0] ?? model.environment.clientId)}${company}`;
}

export function renderReport(model: ReportModel): string {
  isRunMode = model.mode === "run";
  const allCalls = [...model.cases.flatMap((c) => c.calls), ...model.orphanCalls];
  slowestSeq = allCalls.length
    ? allCalls.reduce((slowest, call) => (call.durationMs > slowest.durationMs ? call : slowest)).seq
    : undefined;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Procol API ${model.mode === "run" ? "run" : "automation"} report — ${escapeHtml(model.environment.clientId)}</title>
<style>
:root {
  color-scheme: light;
  --surface-1: #fcfcfb;
  --plane: #f9f9f7;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --rule: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --good: #0ca30c;
  --warning: #fab219;
  --serious: #ec835a;
  --critical: #d03b3b;
  --good-ink: #006300;
  --k-positive: #2a78d6;
  --k-negative: #eb6834;
  --k-edge: #1baf7a;
  --code-bg: #f2f1ec;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --surface-1: #1a1a19;
    --plane: #0d0d0d;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --rule: #383835;
    --border: rgba(255,255,255,0.10);
    --good-ink: #0ca30c;
    --k-positive: #3987e5;
    --k-negative: #d95926;
    --k-edge: #199e70;
    --code-bg: #232322;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--plane);
  color: var(--ink);
  font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 17px; margin: 0 0 12px; letter-spacing: -0.01em; }
h3 { font-size: 14px; margin: 0 0 8px; }
h5 { font-size: 12px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.sub { color: var(--ink-2); margin: 0 0 24px; }
.lede { color: var(--ink-2); margin: -4px 0 14px; }
.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  margin: 0 0 20px;
}
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 10px; margin-bottom: 22px; }
.tile { border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: var(--plane); }
.tile-v { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
.tile-l { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
.tile.good .tile-v { color: var(--good-ink); }
.tile.critical .tile-v { color: var(--critical); }
.tile.serious .tile-v { color: var(--serious); }
.tile.muted .tile-v { color: var(--muted); }
.tile-link { cursor: pointer; transition: border-color .12s, transform .12s; }
.tile-link:hover { border-color: var(--rule); transform: translateY(-1px); }
.tile-link:focus-visible { outline: 2px solid var(--k-positive); outline-offset: 2px; }
.tile-link .tile-l::after { content: " ↓"; opacity: .45; }
tr.kind-row { cursor: pointer; }
tr.kind-row:hover td, tr.kind-row:hover th { background: var(--plane); }
tr.kind-row:focus-visible { outline: 2px solid var(--k-positive); outline-offset: -2px; }
tr.is-slowest { background: color-mix(in srgb, var(--warning) 14%, transparent); }
@keyframes flash { from { background: color-mix(in srgb, var(--k-positive) 30%, transparent); } }
.flash { animation: flash 1.1s ease-out; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.single { display: grid; grid-template-columns: minmax(0, 560px); gap: 24px; }
@media (max-width: 860px) { .split { grid-template-columns: 1fr; } }
table { border-collapse: collapse; width: 100%; }
.kv th, .kv td { text-align: left; vertical-align: top; padding: 4px 10px 4px 0; font-weight: 400; }
.kv th { color: var(--muted); white-space: nowrap; width: 1%; font-size: 12px; }
.grid { font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
.grid thead th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; border-bottom: 1px solid var(--rule); position: sticky; top: 0; background: var(--surface-1); }
.grid.tight th, .grid.tight td { padding: 5px 10px; }
.grid td.err { max-width: 420px; }
.grid td.where { max-width: 300px; font-size: 12px; color: var(--ink-2); }
.grid.failures td { padding: 6px 10px; line-height: 1.4; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.nowrap { white-space: nowrap; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.good-ink { color: var(--good-ink); }
.crit-ink { color: var(--critical); }
.scroll { overflow-x: auto; }
.scroll.tall { max-height: 620px; overflow-y: auto; }
code { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
pre { font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; overflow-x: auto; max-height: 340px; margin: 0; white-space: pre-wrap; word-break: break-word; }
.pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 20px; white-space: nowrap; border: 1px solid transparent; }
.pill.good { color: var(--good-ink); border-color: var(--good); background: color-mix(in srgb, var(--good) 12%, transparent); }
.pill.warning { color: var(--ink); border-color: var(--warning); background: color-mix(in srgb, var(--warning) 18%, transparent); }
.pill.serious { color: var(--ink); border-color: var(--serious); background: color-mix(in srgb, var(--serious) 18%, transparent); }
.pill.critical { color: var(--critical); border-color: var(--critical); background: color-mix(in srgb, var(--critical) 12%, transparent); }
.pill.muted { color: var(--muted); border-color: var(--rule); }
.kind { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; white-space: nowrap; color: #fff; }
.k-positive { background: var(--k-positive); }
.k-negative { background: var(--k-negative); }
.k-edge { background: var(--k-edge); }
.kchip { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 4px; white-space: nowrap; border: 1px solid var(--border); }
.kchip.k-positive { color: #fff; background: var(--k-positive); }
.kchip.k-negative { color: #fff; background: var(--k-negative); }
.kchip.k-edge { color: #fff; background: var(--k-edge); }
.kchip.empty { color: var(--muted); background: transparent; border-style: dashed; }
.kchip.has-fail { outline: 2px solid var(--critical); outline-offset: 1px; }
.method { display: inline-block; font: 600 11px/1.6 ui-monospace, Menlo, monospace; padding: 0 5px; border-radius: 3px; border: 1px solid var(--border); background: var(--code-bg); white-space: nowrap; }
.client > h2 { margin: 28px 0 2px; font-size: 19px; }
.baseurl { margin: 0 0 14px; }
.flow { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; margin: 0 0 14px; overflow: hidden; }
.flow-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--grid); background: var(--plane); }
.flow-head h3 { margin: 0; font-size: 14px; }
.flowkey { font-size: 11px; }
.grow { flex: 1 1 auto; }
.meta { font-size: 11px; color: var(--muted); white-space: nowrap; }
.time { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.stamp { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
details.case { border-bottom: 1px solid var(--grid); }
details.case:last-child { border-bottom: 0; }
details.case > summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 9px 16px; cursor: pointer; list-style: none; }
details.case > summary::-webkit-details-marker { display: none; }
details.case > summary:hover { background: var(--plane); }
.case-title { font-weight: 500; }
.case-body { padding: 4px 16px 18px 16px; border-top: 1px dashed var(--grid); }
.calls-head { margin-top: 16px; }
details.call { border: 1px solid var(--border); border-radius: 7px; margin: 6px 0; background: var(--plane); }
details.call > summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 10px; cursor: pointer; list-style: none; }
details.call > summary::-webkit-details-marker { display: none; }
details.call[data-ok="0"] { border-color: var(--critical); }
.idx { font-size: 11px; color: var(--muted); min-width: 16px; font-variant-numeric: tabular-nums; }
.uri { flex: 1 1 260px; }
.call-body { padding: 4px 12px 14px; }
.facts { margin-bottom: 6px; }
.msg-box { border: 1px solid var(--rule); background: var(--plane); border-radius: 7px; padding: 10px 12px; margin: 10px 0; }
.msg-box .error-title { color: var(--ink-2); }
.curl { margin: 10px 0 6px; }
.curl-head { display: flex; align-items: center; gap: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 4px; }
.curl pre { margin: 0; max-height: 300px; }
.curl-note { margin: 6px 0 0; font-size: 11px; color: var(--muted); }
button.copy { font: inherit; font-size: 11px; padding: 2px 8px; border: 1px solid var(--rule); border-radius: 5px; background: var(--surface-1); color: var(--ink-2); cursor: pointer; text-transform: none; letter-spacing: 0; }
button.copy:hover { color: var(--ink); }
.call-meta { margin: 8px 0 0; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.module { margin: 0 0 22px; }
.module-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 2px 10px; border-bottom: 2px solid var(--rule); margin-bottom: 12px; }
.module-head h3 { margin: 0; font-size: 16px; }
details.coverage { border: 1px solid var(--border); border-radius: 10px; background: var(--surface-1); margin: 0 0 14px; overflow: hidden; }
details.coverage > summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px; cursor: pointer; list-style: none; background: var(--plane); }
details.coverage > summary::-webkit-details-marker { display: none; }
.cov-label { font-weight: 500; font-size: 13px; }
table.cov td.case-name { font-weight: 500; }
table.cov td.why { color: var(--ink-2); font-size: 12px; max-width: 380px; }
.skip-why { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; }
table.cov tr[data-status="not-exercised"] td { background: color-mix(in srgb, var(--warning) 10%, transparent); }
.error-box { border: 1px solid var(--critical); background: color-mix(in srgb, var(--critical) 8%, transparent); border-radius: 7px; padding: 10px 12px; margin: 10px 0; }
.error-title { font-weight: 600; font-size: 12px; color: var(--critical); margin-bottom: 4px; }
.error-msg { margin: 0; white-space: pre-wrap; word-break: break-word; }
pre.error-msg { background: transparent; border: 0; padding: 0; max-height: 240px; }
.skip-box { border: 1px solid var(--rule); border-radius: 7px; padding: 9px 12px; margin: 10px 0; color: var(--ink-2); }
.none { color: var(--muted); font-size: 12px; margin: 4px 0; }
.count { font-size: 12px; color: var(--muted); font-weight: 400; }
.notes { margin-top: 20px; border-top: 1px solid var(--grid); padding-top: 14px; }
.notes ul { margin: 0; padding-left: 20px; color: var(--ink-2); }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 16px; }
.filters input, .filters select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface-1); color: var(--ink); }
.filters input { min-width: 240px; }
.showing { font-size: 12px; color: var(--muted); }
.filters button { font: inherit; font-size: 13px; padding: 5px 10px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface-1); color: var(--ink); cursor: pointer; }
.scope { margin: -8px 0 18px; padding: 9px 12px; border: 1px solid var(--rule); border-left: 3px solid var(--k-positive); border-radius: 6px; background: var(--plane); font-size: 13px; color: var(--ink-2); }
.hidden { display: none !important; }
/* The bug sheet keeps its own light palette on purpose: it mirrors a
   spreadsheet, and a reader comparing the two should see the same colours. */
${BUG_TABLE_CSS}
</style>
</head>
<body>
<div class="wrap">
  <h1>Procol API ${model.mode === "run" ? "run" : "automation"} report</h1>
  <p class="sub">${subtitle(model)} · generated ${escapeHtml(logTime(model.generatedAt))}</p>
  ${
    model.moduleScope
      ? `<p class="scope"><strong>Module scope:</strong> ${escapeHtml(model.moduleScope)} — this
         report covers that module only. Everything below, including the counts, is scoped to it.</p>`
      : ""
  }

  ${renderSummary(model)}
  ${renderFailures(model)}

  <div class="filters">
    <input id="q" type="search" placeholder="Filter cases by name, module or flow…" aria-label="Filter cases">
    <select id="fstatus" aria-label="Filter by status">
      <option value="">Any status</option>
      <option value="failed">Failed only</option>
      <option value="passed">Passed only</option>
      <option value="skipped">Not run only</option>
    </select>
    <select id="fmodule" aria-label="Filter by module">
      <option value="">Any module</option>
      ${moduleOptions(model)}
    </select>
    <select id="fkind" aria-label="Filter by kind">
      <option value="">Any kind</option>
      <option value="positive">Positive</option>
      <option value="negative">Negative</option>
      <option value="edge">Edge</option>
    </select>
    <button id="expand" type="button">Expand failures</button>
    <button id="collapse" type="button">Collapse all</button>
    <span class="showing" id="showing"></span>
  </div>

  ${model.clients.map(renderClient).join("")}
  ${renderFindings(model)}
</div>
<script>
(function () {
  var q = document.getElementById("q");
  var fstatus = document.getElementById("fstatus");
  var fkind = document.getElementById("fkind");
  var fmodule = document.getElementById("fmodule");
  var showing = document.getElementById("showing");
  var cases = Array.prototype.slice.call(document.querySelectorAll("details.case"));

  function apply() {
    var text = q.value.trim().toLowerCase();
    var status = fstatus.value;
    var kind = fkind.value;
    var module = fmodule.value;
    var visible = 0;
    cases.forEach(function (el) {
      var s = el.getAttribute("data-status");
      // "failed" in the filter covers timedOut too — both are red in the report.
      var statusOk = !status
        || (status === "failed" ? (s === "failed" || s === "timedOut") : s === status);
      var kindOk = !kind || el.getAttribute("data-kind") === kind;
      var moduleOk = !module || el.getAttribute("data-module") === module;
      var textOk = !text || (el.getAttribute("data-search") || "").indexOf(text) !== -1;
      var ok = statusOk && kindOk && moduleOk && textOk;
      el.classList.toggle("hidden", !ok);
      if (ok) visible++;
    });

    // Picking a module takes the whole page with it: the module's own sections,
    // and the rows of the non-2xx table that belong to other modules. The stat
    // tiles above still describe the whole run — they say "this run", and
    // silently rewriting them under a filter would make the page lie.
    Array.prototype.forEach.call(document.querySelectorAll("#nonok tr[data-module]"), function (tr) {
      var m = tr.getAttribute("data-module");
      tr.classList.toggle("hidden", Boolean(module) && m !== "" && m !== module);
    });
    showing.textContent = visible === cases.length
      ? cases.length + " cases"
      : "showing " + visible + " of " + cases.length + " cases";
    // A flow whose every case is filtered out is itself hidden, so the page
    // does not fill with empty flow headers.
    Array.prototype.forEach.call(document.querySelectorAll("section.flow"), function (flow) {
      var visible = flow.querySelectorAll("details.case:not(.hidden)").length;
      flow.classList.toggle("hidden", visible === 0);
    });
    // A module whose every flow is filtered out goes too, and a client whose
    // every module went with it — otherwise the page fills with empty headers.
    Array.prototype.forEach.call(document.querySelectorAll("section.module"), function (mod) {
      var live = mod.querySelectorAll("section.flow:not(.hidden)").length;
      var wrongModule = Boolean(module) && mod.getAttribute("data-module") !== module;
      mod.classList.toggle("hidden", wrongModule || live === 0);
    });
    Array.prototype.forEach.call(document.querySelectorAll("section.client"), function (client) {
      var visible = client.querySelectorAll("section.module:not(.hidden)").length;
      client.classList.toggle("hidden", visible === 0);
    });
  }

  q.addEventListener("input", apply);
  fstatus.addEventListener("change", apply);
  fkind.addEventListener("change", apply);
  fmodule.addEventListener("change", apply);

  // A module can also be linked to: api-report.html#module=PO opens the report
  // already narrowed, which is what the platform UI hands out when someone
  // picks a module there.
  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  var wanted = /^module=/.test(hash) ? hash.slice("module=".length) : "";
  if (wanted) {
    for (var i = 0; i < fmodule.options.length; i++) {
      if (fmodule.options[i].value.toLowerCase() === wanted.toLowerCase()) {
        fmodule.value = fmodule.options[i].value;
        break;
      }
    }
  }
  apply();

  // ---- the stat tiles and kind rows are navigation -------------------------
  // Each carries a data-action; a filter one drives the same controls a reader
  // could set by hand, so the page never ends up in a state the filter row
  // does not explain.
  function flash(el) {
    if (!el) return;
    el.classList.remove("flash");
    // Reading offsetWidth restarts the animation when the same target is
    // clicked twice; without it the second click looks like nothing happened.
    void el.offsetWidth;
    el.classList.add("flash");
  }

  function scrollTo(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    flash(el);
  }

  function runAction(action) {
    var parts = action.split(":");
    var verb = parts[0];
    var arg = parts[1];

    if (verb === "filter" || verb === "kind") {
      // One dimension at a time. Combining them lets a second click land on an
      // empty page — click "failed" then "negative" and you may see nothing,
      // which reads as broken rather than as an empty intersection.
      q.value = "";
      fmodule.value = "";
      if (verb === "filter") {
        fstatus.value = arg === "all" ? "" : arg;
        fkind.value = "";
      } else {
        fkind.value = arg;
        fstatus.value = "";
      }
      apply();
      // Land on the first case that survived the filter, so a click always
      // shows a result rather than leaving the reader at the top of the page.
      var first = document.querySelector("details.case:not(.hidden)");
      if (first) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
        flash(first);
      } else {
        document.querySelector(".filters").scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (verb === "goto") {
      scrollTo(arg === "slowest" ? "slowest" : arg);
      // The slowest call lives inside a collapsed case; open it so the row is
      // actually visible when we arrive.
      if (arg === "slowest") {
        var row = document.getElementById("slowest");
        if (row) {
          var host = row.closest("details");
          while (host) { host.open = true; host = host.parentElement && host.parentElement.closest("details"); }
        }
      }
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-action]"), function (el) {
    el.addEventListener("click", function () { runAction(el.getAttribute("data-action")); });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); runAction(el.getAttribute("data-action")); }
    });
  });

  document.getElementById("expand").addEventListener("click", function () {
    cases.forEach(function (el) {
      var s = el.getAttribute("data-status");
      if (s === "failed" || s === "timedOut") {
        el.open = true;
        Array.prototype.forEach.call(el.querySelectorAll('details.call[data-ok="0"]'), function (c) {
          c.open = true;
        });
      }
    });
  });

  document.getElementById("collapse").addEventListener("click", function () {
    Array.prototype.forEach.call(document.querySelectorAll("details"), function (d) { d.open = false; });
  });

  // ---- copy a curl ---------------------------------------------------------
  // The point of printing curl is that it gets re-run, and selecting a wrapped
  // multi-line command by hand loses the trailing backslashes often enough to
  // be worth a button. clipboard.writeText is unavailable on file:// in some
  // browsers, so fall back to a selection-based copy rather than doing nothing.
  Array.prototype.forEach.call(document.querySelectorAll("button.copy"), function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.getAttribute("data-copy"));
      if (!target) return;
      var text = target.textContent || "";
      var done = function () {
        var label = button.textContent;
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = label; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { select(target); });
      } else {
        select(target);
      }
    });
  });

  function select(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
})();
${BUG_TABLE_JS}
</script>
</body>
</html>`;
}
