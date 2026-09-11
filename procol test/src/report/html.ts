import { ApiCallRecord, CaseKind } from "./apiLog.js";
import { ClientGroup, FlowGroup, ReportCase, ReportModel, TestStatus } from "./model.js";
import { Finding } from "./findings.js";

/**
 * Renders the report model as one self-contained HTML file — no external CSS,
 * fonts or scripts, so it opens from disk and survives being emailed as an
 * attachment or published as a CI artifact.
 */

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Pretty-prints a body for the evidence panes. */
function formatBody(body: unknown, text?: string): string {
  if (body === undefined && text === undefined) return "";
  if (body === undefined) return String(text);
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

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

function headerRows(headers: Record<string, string> | undefined): string {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return `<p class="none">none recorded</p>`;
  return `<table class="kv">${entries
    .map(
      ([name, value]) =>
        `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** One API call, fully expanded: the evidence panel. */
function renderCall(call: ApiCallRecord, index: number): string {
  const role = statusRole(call.status);
  const statusText = call.status === 0 ? "no response" : `${call.status} ${call.statusText ?? ""}`.trim();
  const requestBody = formatBody(call.requestBody);
  const responseBody = formatBody(call.responseBody, call.responseText);

  return `
<details class="call" data-ok="${call.ok ? "1" : "0"}">
  <summary>
    <span class="idx">${index + 1}</span>
    <span class="method m-${escapeHtml(call.method.toLowerCase())}">${escapeHtml(call.method)}</span>
    <code class="uri">${escapeHtml(call.uri)}</code>
    <span class="pill ${role}">${escapeHtml(statusText)}</span>
    <span class="time">${ms(call.durationMs)}</span>
    <span class="stamp">${escapeHtml(logTime(call.timestamp))}</span>
  </summary>
  <div class="call-body">
    <table class="kv facts">
      <tr><th>API URI</th><td><code>${escapeHtml(call.uri)}</code></td></tr>
      <tr><th>Full URL</th><td><code>${escapeHtml(call.url)}</code></td></tr>
      <tr><th>Method</th><td>${escapeHtml(call.method)}</td></tr>
      <tr><th>HTTP status code</th><td><span class="pill ${role}">${escapeHtml(statusText)}</span></td></tr>
      <tr><th>Response time</th><td>${ms(call.durationMs)}</td></tr>
      <tr><th>Log time (local)</th><td>${escapeHtml(logTime(call.timestamp))}</td></tr>
      <tr><th>Log time (UTC)</th><td>${escapeHtml(call.timestamp)}</td></tr>
      <tr><th>Identity</th><td>${escapeHtml(call.identity ?? "—")}</td></tr>
      <tr><th>Client</th><td>${escapeHtml(call.clientId)}${
        call.companyId ? ` · company ${escapeHtml(call.companyId)}` : ""
      }</td></tr>
    </table>
    ${
      call.error
        ? `<div class="error-box">
             <div class="error-title">${escapeHtml(
               call.status === 0 ? "Request failed" : `API returned ${call.status}`,
             )}${call.errorCode ? ` · code ${escapeHtml(call.errorCode)}` : ""}</div>
             <p class="error-msg">${escapeHtml(call.error)}</p>
           </div>`
        : ""
    }
    <div class="panes">
      <section>
        <h5>Request headers</h5>
        ${headerRows(call.requestHeaders)}
      </section>
      <section>
        <h5>Response headers</h5>
        ${headerRows(call.responseHeaders)}
      </section>
    </div>
    <div class="panes">
      <section>
        <h5>Request body</h5>
        ${requestBody ? `<pre>${escapeHtml(requestBody)}</pre>` : `<p class="none">no body sent</p>`}
      </section>
      <section>
        <h5>Response body</h5>
        ${responseBody ? `<pre>${escapeHtml(responseBody)}</pre>` : `<p class="none">empty response</p>`}
      </section>
    </div>
    ${call.truncated ? `<p class="none">A body was truncated — raise API_LOG_MAX_BODY to capture more.</p>` : ""}
  </div>
</details>`;
}

function renderCase(reportCase: ReportCase): string {
  const { test } = reportCase;
  const role = testStatusRole(test.status);
  const title = cleanTitle(test.title);

  return `
<details class="case" data-status="${escapeHtml(test.status)}" data-kind="${escapeHtml(reportCase.kind)}"
         data-search="${escapeHtml(`${title} ${reportCase.flow} ${reportCase.flowKey}`.toLowerCase())}">
  <summary>
    <span class="pill ${role}">${STATUS_ICON[test.status]} ${escapeHtml(STATUS_LABEL[test.status])}</span>
    <span class="kind k-${escapeHtml(reportCase.kind)}">${escapeHtml(KIND_LABEL[reportCase.kind])}</span>
    <span class="case-title">${escapeHtml(title)}</span>
    <span class="grow"></span>
    <span class="meta">${reportCase.calls.length} call${reportCase.calls.length === 1 ? "" : "s"}</span>
    ${
      reportCase.failedCalls.length
        ? `<span class="pill serious">${reportCase.failedCalls.length} failed</span>`
        : ""
    }
    <span class="time">${ms(test.durationMs)}</span>
  </summary>
  <div class="case-body">
    <table class="kv facts">
      <tr><th>Expected</th><td>the API to <strong>${escapeHtml(reportCase.expects)}</strong> this request</td></tr>
      ${reportCase.because ? `<tr><th>Why this case exists</th><td>${escapeHtml(reportCase.because)}</td></tr>` : ""}
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
    <h5 class="calls-head">API calls (${reportCase.calls.length})</h5>
    ${
      reportCase.calls.length
        ? reportCase.calls.map(renderCall).join("")
        : `<p class="none">This case made no API calls${
            test.status === "skipped" ? " — it did not run." : "."
          }</p>`
    }
  </div>
</details>`;
}

/** Per-flow coverage of the three kinds, as labelled counts. */
function renderKindStrip(flow: FlowGroup): string {
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
    <code class="flowkey">${escapeHtml(flow.flowKey)}</code>
    <span class="grow"></span>
    ${renderKindStrip(flow)}
    <span class="meta">${flow.callCount} call${flow.callCount === 1 ? "" : "s"}</span>
    ${flow.failedCallCount ? `<span class="pill serious">${flow.failedCallCount} failed</span>` : ""}
    ${flow.slowestCallMs ? `<span class="time">slowest ${ms(flow.slowestCallMs)}</span>` : ""}
  </header>
  ${flow.cases.map(renderCase).join("")}
</section>`;
}

function renderClient(client: ClientGroup): string {
  return `
<section class="client">
  <h2>${escapeHtml(client.clientId)}${client.companyId ? ` · company ${escapeHtml(client.companyId)}` : ""}</h2>
  ${client.baseUrl ? `<p class="baseurl"><code>${escapeHtml(client.baseUrl)}</code></p>` : ""}
  ${client.flows.map(renderFlow).join("")}
</section>`;
}

/** Every non-2xx call in the run, most severe first — the first thing to read. */
function renderFailures(model: ReportModel): string {
  const failures = model.cases
    .flatMap((c) => c.failedCalls.map((call) => ({ call, case: c })))
    .sort((a, b) => (b.call.status || 999) - (a.call.status || 999));

  const orphanFailures = model.orphanCalls.filter((c) => !c.ok);

  if (failures.length === 0 && orphanFailures.length === 0) {
    return `<section class="card"><h2>Failed API calls</h2>
      <p class="none">Every API call in this run returned 2xx.</p></section>`;
  }

  const row = (call: ApiCallRecord, where: string) => `
    <tr>
      <td><span class="pill ${statusRole(call.status)}">${call.status === 0 ? "no response" : call.status}</span></td>
      <td><span class="method m-${escapeHtml(call.method.toLowerCase())}">${escapeHtml(call.method)}</span></td>
      <td><code>${escapeHtml(call.uri)}</code></td>
      <td class="err">${escapeHtml(call.error ?? "—")}</td>
      <td class="nowrap num">${ms(call.durationMs)}</td>
      <td class="nowrap">${escapeHtml(logTime(call.timestamp))}</td>
      <td class="where">${escapeHtml(where)}</td>
    </tr>`;

  return `
<section class="card">
  <h2>Failed API calls <span class="count">${failures.length + orphanFailures.length}</span></h2>
  <p class="lede">Every call that did not return 2xx, with the message the API itself returned.</p>
  <div class="scroll">
    <table class="grid failures">
      <thead><tr>
        <th>Status</th><th>Method</th><th>API URI</th><th>Error message</th>
        <th class="num">Response time</th><th>Log time</th><th>Case</th>
      </tr></thead>
      <tbody>
        ${failures.map((f) => row(f.call, cleanTitle(f.case.test.title))).join("")}
        ${orphanFailures.map((c) => row(c, "outside a test (setup/teardown)")).join("")}
      </tbody>
    </table>
  </div>
</section>`;
}

/** The full chronological call log — the audit trail. */
function renderCallLog(model: ReportModel): string {
  const all = [...model.cases.flatMap((c) => c.calls), ...model.orphanCalls].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp) || a.seq - b.seq,
  );
  if (all.length === 0) return "";

  return `
<section class="card">
  <h2>Full API call log <span class="count">${all.length}</span></h2>
  <p class="lede">Every request the run made, in the order it was sent.</p>
  <div class="scroll tall">
    <table class="grid">
      <thead><tr>
        <th>#</th><th>Log time</th><th>Method</th><th>API URI</th>
        <th>Status</th><th>Response time</th><th>Identity</th><th>Client</th>
      </tr></thead>
      <tbody>
        ${all
          .map(
            (call, i) => `<tr>
          <td class="muted">${i + 1}</td>
          <td class="nowrap">${escapeHtml(logTime(call.timestamp))}</td>
          <td><span class="method m-${escapeHtml(call.method.toLowerCase())}">${escapeHtml(call.method)}</span></td>
          <td><code>${escapeHtml(call.uri)}</code></td>
          <td><span class="pill ${statusRole(call.status)}">${call.status === 0 ? "—" : call.status}</span></td>
          <td class="nowrap num">${ms(call.durationMs)}</td>
          <td>${escapeHtml(call.identity ?? "—")}</td>
          <td>${escapeHtml(call.clientId)}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>
</section>`;
}

/** Status → the palette role it reads as. `not-a-bug` is deliberately muted. */
const FINDING_ROLE: Record<Finding["status"], string> = {
  confirmed: "critical",
  intermittent: "serious",
  unconfirmed: "warning",
  "not-a-bug": "muted",
};

const FINDING_LABEL: Record<Finding["status"], string> = {
  confirmed: "Confirmed",
  intermittent: "Intermittent",
  unconfirmed: "Unconfirmed",
  "not-a-bug": "Ruled out",
};

/**
 * What the suite has found in the product, not just what this run did.
 *
 * Each carries its status, because "we saw a 500 once" and "this is a defect"
 * are different claims and a reader must be able to tell them apart without
 * asking. Ruled-out entries stay visible so a finding that was investigated
 * and dismissed is not re-reported as new.
 */
function renderFindings(model: ReportModel): string {
  if (model.findings.length === 0) return "";
  const live = model.findings.filter((f) => f.status !== "not-a-bug");

  const row = (f: Finding) => `
    <details class="finding" data-status="${escapeHtml(f.status)}">
      <summary>
        <span class="pill ${FINDING_ROLE[f.status]}">${escapeHtml(FINDING_LABEL[f.status])}</span>
        ${f.severity !== "none" ? `<span class="sev sev-${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span>` : ""}
        <span class="finding-title">${escapeHtml(f.title)}</span>
        <span class="grow"></span>
        ${f.endpoint ? `<code class="uri">${escapeHtml(f.endpoint)}</code>` : ""}
      </summary>
      <div class="finding-body">
        <p>${escapeHtml(f.detail)}</p>
        <table class="kv">
          ${f.flow ? `<tr><th>Flow</th><td><code>${escapeHtml(f.flow)}</code></td></tr>` : ""}
          ${f.evidence ? `<tr><th>Evidence</th><td>${escapeHtml(f.evidence)}</td></tr>` : ""}
          <tr><th>Id</th><td><code>${escapeHtml(f.id)}</code></td></tr>
        </table>
      </div>
    </details>`;

  return `
<section class="card">
  <h2>Product findings <span class="count">${live.length}</span></h2>
  <p class="lede">What this suite has found in the product. Maintained in
  <code>config/findings.json</code>; each entry states how far it has been verified, so a
  confirmed defect and a one-off observation are never mistaken for each other.</p>
  ${model.findings.map(row).join("")}
</section>`;
}

function renderSummary(model: ReportModel): string {
  const t = model.totals;
  const tile = (label: string, value: string, role = "") =>
    `<div class="tile ${role}"><div class="tile-v">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;

  const kindRow = (["positive", "negative", "edge"] as CaseKind[])
    .map((kind) => {
      const c = t.byKind[kind];
      return `<tr>
        <th><span class="kind k-${kind}">${KIND_LABEL[kind]}</span></th>
        <td class="num">${c.total}</td>
        <td class="num good-ink">${c.passed}</td>
        <td class="num ${c.failed ? "crit-ink" : "muted"}">${c.failed}</td>
        <td class="num muted">${c.skipped}</td>
      </tr>`;
    })
    .join("");

  return `
<section class="card">
  <h2>This run</h2>
  <div class="tiles">
    ${tile("test cases", String(t.tests))}
    ${tile("passed", String(t.passed), "good")}
    ${tile("failed", String(t.failed), t.failed ? "critical" : "")}
    ${tile("not run", String(t.skipped), "muted")}
    ${tile("API calls", String(t.calls))}
    ${tile("failed calls", String(t.failedCalls), t.failedCalls ? "serious" : "")}
    ${tile("p50 response", ms(t.p50Ms))}
    ${tile("p95 response", ms(t.p95Ms))}
    ${tile("slowest call", ms(t.maxMs))}
  </div>
  <div class="split">
    <div>
      <h3>Coverage by case kind</h3>
      <table class="grid tight">
        <thead><tr><th>Kind</th><th class="num">Cases</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Not run</th></tr></thead>
        <tbody>${kindRow}</tbody>
      </table>
    </div>
    <div>
      <h3>Environment</h3>
      <table class="kv">
        <tr><th>Client</th><td>${escapeHtml(model.environment.clientId)}</td></tr>
        ${model.environment.companyId ? `<tr><th>Company</th><td>${escapeHtml(model.environment.companyId)}</td></tr>` : ""}
        ${model.environment.baseUrl ? `<tr><th>Base URL</th><td><code>${escapeHtml(model.environment.baseUrl)}</code></td></tr>` : ""}
        ${model.startedAt ? `<tr><th>Run started</th><td>${escapeHtml(logTime(model.startedAt))}</td></tr>` : ""}
        ${model.finishedAt ? `<tr><th>Run finished</th><td>${escapeHtml(logTime(model.finishedAt))}</td></tr>` : ""}
        ${model.wallClockMs ? `<tr><th>Wall clock</th><td>${ms(model.wallClockMs)}</td></tr>` : ""}
        <tr><th>Time in API calls</th><td>${ms(t.totalApiMs)}</td></tr>
        <tr><th>Report generated</th><td>${escapeHtml(logTime(model.generatedAt))}</td></tr>
      </table>
    </div>
  </div>
  ${
    model.notes.length
      ? `<div class="notes"><h3>Read this before trusting the numbers</h3><ul>${model.notes
          .map((n) => `<li>${escapeHtml(n)}</li>`)
          .join("")}</ul></div>`
      : ""
  }
</section>`;
}

export function renderReport(model: ReportModel): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Procol API automation report — ${escapeHtml(model.environment.clientId)}</title>
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
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
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
.panes { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 860px) { .panes { grid-template-columns: 1fr; } }
.error-box { border: 1px solid var(--critical); background: color-mix(in srgb, var(--critical) 8%, transparent); border-radius: 7px; padding: 10px 12px; margin: 10px 0; }
.error-title { font-weight: 600; font-size: 12px; color: var(--critical); margin-bottom: 4px; }
.error-msg { margin: 0; white-space: pre-wrap; word-break: break-word; }
pre.error-msg { background: transparent; border: 0; padding: 0; max-height: 240px; }
.skip-box { border: 1px solid var(--rule); border-radius: 7px; padding: 9px 12px; margin: 10px 0; color: var(--ink-2); }
.none { color: var(--muted); font-size: 12px; margin: 4px 0; }
.count { font-size: 12px; color: var(--muted); font-weight: 400; }
.notes { margin-top: 20px; border-top: 1px solid var(--grid); padding-top: 14px; }
details.finding { border: 1px solid var(--border); border-radius: 7px; margin: 6px 0; background: var(--plane); }
details.finding > summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; cursor: pointer; list-style: none; }
details.finding > summary::-webkit-details-marker { display: none; }
details.finding > summary:hover { background: var(--surface-1); }
details.finding[data-status="not-a-bug"] > summary .finding-title { color: var(--muted); text-decoration: line-through; }
.finding-title { font-weight: 500; }
.finding-body { padding: 0 12px 12px; }
.finding-body p { margin: 0 0 10px; color: var(--ink-2); max-width: 78ch; }
.sev { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 6px; border-radius: 3px; border: 1px solid var(--border); }
.sev-high { color: var(--critical); border-color: var(--critical); }
.sev-medium { color: var(--serious); border-color: var(--serious); }
.sev-low { color: var(--muted); }
.notes ul { margin: 0; padding-left: 20px; color: var(--ink-2); }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 16px; }
.filters input, .filters select { font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface-1); color: var(--ink); }
.filters input { min-width: 240px; }
.filters button { font: inherit; font-size: 13px; padding: 5px 10px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface-1); color: var(--ink); cursor: pointer; }
.hidden { display: none !important; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Procol API automation report</h1>
  <p class="sub">${escapeHtml(model.environment.clientId)}${
    model.environment.companyId ? ` · company ${escapeHtml(model.environment.companyId)}` : ""
  } · generated ${escapeHtml(logTime(model.generatedAt))}</p>

  ${renderSummary(model)}
  ${renderFindings(model)}
  ${renderFailures(model)}

  <div class="filters">
    <input id="q" type="search" placeholder="Filter cases by name or flow…" aria-label="Filter cases">
    <select id="fstatus" aria-label="Filter by status">
      <option value="">Any status</option>
      <option value="failed">Failed only</option>
      <option value="passed">Passed only</option>
      <option value="skipped">Not run only</option>
    </select>
    <select id="fkind" aria-label="Filter by kind">
      <option value="">Any kind</option>
      <option value="positive">Positive</option>
      <option value="negative">Negative</option>
      <option value="edge">Edge</option>
    </select>
    <button id="expand" type="button">Expand failures</button>
    <button id="collapse" type="button">Collapse all</button>
  </div>

  ${model.clients.map(renderClient).join("")}
  ${renderCallLog(model)}
</div>
<script>
(function () {
  var q = document.getElementById("q");
  var fstatus = document.getElementById("fstatus");
  var fkind = document.getElementById("fkind");
  var cases = Array.prototype.slice.call(document.querySelectorAll("details.case"));

  function apply() {
    var text = q.value.trim().toLowerCase();
    var status = fstatus.value;
    var kind = fkind.value;
    cases.forEach(function (el) {
      var s = el.getAttribute("data-status");
      // "failed" in the filter covers timedOut too — both are red in the report.
      var statusOk = !status
        || (status === "failed" ? (s === "failed" || s === "timedOut") : s === status);
      var kindOk = !kind || el.getAttribute("data-kind") === kind;
      var textOk = !text || (el.getAttribute("data-search") || "").indexOf(text) !== -1;
      el.classList.toggle("hidden", !(statusOk && kindOk && textOk));
    });
    // A flow whose every case is filtered out is itself hidden, so the page
    // does not fill with empty flow headers.
    Array.prototype.forEach.call(document.querySelectorAll("section.flow"), function (flow) {
      var visible = flow.querySelectorAll("details.case:not(.hidden)").length;
      flow.classList.toggle("hidden", visible === 0);
    });
    Array.prototype.forEach.call(document.querySelectorAll("section.client"), function (client) {
      var visible = client.querySelectorAll("section.flow:not(.hidden)").length;
      client.classList.toggle("hidden", visible === 0);
    });
  }

  q.addEventListener("input", apply);
  fstatus.addEventListener("change", apply);
  fkind.addEventListener("change", apply);

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
})();
</script>
</body>
</html>`;
}
