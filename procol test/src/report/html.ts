import { ApiCallRecord, CaseKind } from "./apiLog.js";
import { ClientGroup, FlowGroup, ReportCase, ReportModel, RunSection, TestStatus } from "./model.js";
import { Finding } from "./findings.js";
import { StepOutcome, Verdict, statusFamily } from "./outcome.js";
import { apiMessage, toCurl, TOKEN_VAR } from "./curl.js";

/**
 * Renders the report model as one self-contained HTML file — no external CSS,
 * fonts or scripts, so it opens from disk and survives being emailed as an
 * attachment or published as a CI artifact.
 *
 * The spine of the page is the run, in order: case 1, case 2, case 3, each with
 * what it expected, what it actually got, and the verdict that comparison
 * produced — and, where a case is a journey rather than a single request, the
 * numbered business steps it walked through on the way (1.1, 1.2, 1.3). Everything else on the page — the module view, the failed-call
 * list, the raw log — is a different cut of those same rows, offered after it,
 * because the first question anyone asks a test report is "what happened, in
 * what order, and where did it go wrong".
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

const ms = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;

/** Local wall-clock time, to the second — the "log time". */
function logTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** HTTP status → the palette role it reads as. */
function statusRole(status: number): string {
  const family = statusFamily(status);
  if (family === "none" || family === "crashed") return "bad";
  if (family === "refused") return "warn";
  if (family === "redirect") return "warn";
  return "good";
}

const VERDICT_ROLE: Record<Verdict, string> = { pass: "good", fail: "bad", "not-run": "muted" };
const VERDICT_LABEL: Record<Verdict, string> = { pass: "Pass", fail: "Fail", "not-run": "Not run" };
const VERDICT_ICON: Record<Verdict, string> = { pass: "✓", fail: "✕", "not-run": "–" };

const STATUS_LABEL: Record<TestStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  timedOut: "Timed out",
  skipped: "Not run",
  interrupted: "Interrupted",
};

const KIND_LABEL: Record<CaseKind, string> = {
  positive: "Happy path",
  negative: "Should be refused",
  edge: "Edge case",
};

/** Space-constrained variants, for the coverage table inside a scorecard. */
const KIND_SHORT: Record<CaseKind, string> = {
  positive: "Happy path",
  negative: "Refused",
  edge: "Edge",
};

const KIND_TITLE: Record<CaseKind, string> = {
  positive: "A legitimate request that must work.",
  negative: "An invalid request the API must refuse.",
  edge: "A boundary the API must handle deliberately rather than crash on.",
};

// ── evidence: one API call ──────────────────────────────────────────────────

/** A single call, as reproducible evidence: curl in, one line of answer out. */
function renderCall(call: ApiCallRecord, index: number): string {
  const role = statusRole(call.status);
  const statusText = call.status === 0 ? "no response" : `${call.status} ${call.statusText ?? ""}`.trim();
  const message = apiMessage(call);
  const responseBody = formatBody(call.responseBody, call.responseText);

  return `
<details class="call">
  <summary>
    <span class="seq">${index + 1}</span>
    <span class="pill ${role} sm">${escapeHtml(statusText)}</span>
    <span class="method">${escapeHtml(call.method)}</span>
    <code class="uri">${escapeHtml(call.uri)}</code>
    <span class="grow"></span>
    ${call.identity ? `<span class="chip sm">${escapeHtml(call.identity)}</span>` : ""}
    <span class="time">${ms(call.durationMs)}</span>
  </summary>
  <div class="call-body">
    ${message ? `<p class="said"><span class="said-label">API said</span> ${escapeHtml(message)}</p>` : ""}
    <div class="curl-wrap">
      <div class="curl-head">
        <span>Reproduce it</span>
        <button class="copy" type="button" data-copy>Copy curl</button>
      </div>
      <pre class="curl"><code>${escapeHtml(toCurl(call))}</code></pre>
      <p class="curl-note">The credential is redacted — export <code>${TOKEN_VAR}</code> before running.</p>
    </div>
    <details class="raw">
      <summary>Full response body${call.truncated ? " (truncated)" : ""}</summary>
      <pre class="body"><code>${escapeHtml(responseBody || "(empty)")}</code></pre>
    </details>
    <p class="call-meta">Sent ${escapeHtml(logTime(call.timestamp))} · client ${escapeHtml(call.clientId)}${
      call.companyId ? ` · company ${escapeHtml(call.companyId)}` : ""
    }${call.errorCode ? ` · error code ${escapeHtml(call.errorCode)}` : ""}</p>
  </div>
</details>`;
}

// ── the run table: one row per case, in the order they ran ─────────────────

function renderHowDecided(reportCase: ReportCase): string {
  const o = reportCase.outcome;
  const check = o.evidenceCheck;
  return `
<div class="decided">
  <h6>How this was decided</h6>
  <p>${escapeHtml(o.basisLabel)}</p>
  ${
    check
      ? `<p class="recheck ${check.matched ? "ok" : "no"}">
           <strong>Independent re-check from the recorded HTTP traffic:</strong>
           ${escapeHtml(check.detail)}
           <span class="verdict-word">${check.matched ? "Matches." : "Does not match."}</span>
         </p>`
      : ""
  }
  ${
    o.disagreement
      ? `<p class="alarm"><strong>⚠ Verdict not supported by the evidence.</strong> ${escapeHtml(
          o.disagreement,
        )}</p>`
      : ""
  }
</div>`;
}

function renderCaseDetail(reportCase: ReportCase): string {
  const { test, outcome } = reportCase;
  const decisive = outcome.decisiveCall;

  return `
<div class="detail-inner">
  ${renderHowDecided(reportCase)}
  ${
    test.errorMessage
      ? `<div class="box bad-box">
           <h6>Why it failed</h6>
           <pre class="err">${escapeHtml(test.errorMessage)}</pre>
         </div>`
      : ""
  }
  ${
    test.skipReason
      ? `<div class="box muted-box"><h6>Why it did not run</h6><p>${escapeHtml(test.skipReason)}</p></div>`
      : ""
  }
  ${
    reportCase.because
      ? `<div class="box"><h6>Why this case exists</h6><p>${escapeHtml(reportCase.because)}</p></div>`
      : ""
  }
  ${
    // A journey shows every call against the numbered step that made it, so
    // repeating them here would say the same thing twice. What is worth
    // saying is whether any call fell OUTSIDE the numbered steps — setup the
    // flow did before it started reporting.
    reportCase.steps.length
      ? (() => {
          const loose = reportCase.calls.filter((call) => !call.step);
          return `<p class="hint">Every call this journey made is shown against the step that made it, above.${
            loose.length
              ? ` ${loose.length} further call${
                  loose.length === 1 ? " was" : "s were"
                } made outside the numbered steps, while the flow was setting itself up.`
              : ""
          }</p>
          ${
            loose.length
              ? `<details class="box all-calls">
                   <summary><h6>${loose.length} call${
                     loose.length === 1 ? "" : "s"
                   } outside the numbered steps</h6></summary>
                   ${loose.map(renderCall).join("")}
                 </details>`
              : ""
          }`;
        })()
      : `${
          decisive
            ? `<div class="box">
                 <h6>The call this case turns on</h6>
                 ${renderCall(decisive, reportCase.calls.indexOf(decisive))}
               </div>`
            : ""
        }
        ${
          reportCase.calls.length > 1
            ? `<details class="box all-calls">
                 <summary><h6>All ${reportCase.calls.length} API calls in this case</h6></summary>
                 ${reportCase.calls.map(renderCall).join("")}
               </details>`
            : reportCase.calls.length === 0
              ? `<p class="none">No API call was recorded for this case${
                  test.status === "skipped" ? " — it did not run." : "."
                }</p>`
              : ""
        }`
  }
  <table class="kv">
    <tr><th>Module</th><td>${escapeHtml(reportCase.flow)} <code>${escapeHtml(reportCase.flowKey)}</code></td></tr>
    ${reportCase.ref ? `<tr><th>Case id</th><td><code>${escapeHtml(reportCase.ref)}</code></td></tr>` : ""}
    <tr><th>Case type</th><td>${escapeHtml(KIND_LABEL[reportCase.kind])} — ${escapeHtml(
      KIND_TITLE[reportCase.kind],
    )}</td></tr>
    <tr><th>Automation source</th><td><code>${escapeHtml(test.file)}</code></td></tr>
    <tr><th>Took</th><td>${ms(test.durationMs)}${test.retries ? ` · ${test.retries} retr${test.retries === 1 ? "y" : "ies"}` : ""}</td></tr>
    ${test.startedAt ? `<tr><th>Started</th><td>${escapeHtml(logTime(test.startedAt))}</td></tr>` : ""}
  </table>
</div>`;
}

/**
 * A journey, as the sequence of business steps it really is.
 *
 * Rendered as rows of the same table, numbered 4.1, 4.2, 4.3 under step 4, so
 * "create a two-stage event and publish it" reads as: add the event, attach
 * the technical round, attach the auction round, publish it — with the one
 * that broke sitting on its own line rather than buried in a count of calls.
 */
function renderStepRows(reportCase: ReportCase): string {
  if (reportCase.steps.length === 0) return "";

  const rows = reportCase.steps
    .map((step) => {
      const role = VERDICT_ROLE[step.verdict];
      const id = `s${reportCase.step}-${step.index}`;
      const hasDetail = step.calls.length > 0 || !!step.errorMessage;
      return `
  <tr class="step-row ${step.verdict === "fail" ? "is-fail" : ""}" data-step="${id}"
      ${hasDetail ? `tabindex="0" role="button" aria-expanded="false" aria-controls="${id}"` : ""}>
    <td class="c-step"><span class="sub-no">${reportCase.step}.${step.index}</span></td>
    <td class="c-what">
      <span class="what">${escapeHtml(step.name)}</span>
      <span class="row-meta">
        ${step.calls.length} call${step.calls.length === 1 ? "" : "s"}
        <span class="dot">·</span>${ms(step.durationMs)}
      </span>
    </td>
    <td class="c-exp"><span class="lbl">Expected</span>${escapeHtml(step.expected)}</td>
    <td class="c-act"><span class="lbl">Actual</span>${escapeHtml(step.actual)}</td>
    <td class="c-res">
      <span class="pill ${role} sm">${VERDICT_ICON[step.verdict]} ${VERDICT_LABEL[step.verdict]}</span>
      ${hasDetail ? `<span class="chev" aria-hidden="true">▸</span>` : ""}
    </td>
  </tr>
  ${
    hasDetail
      ? `<tr class="step-detail" id="${id}" hidden>
           <td colspan="5">
             <div class="step-detail-inner">
               ${
                 step.errorMessage
                   ? `<div class="box bad-box"><h6>What stopped this step</h6><pre class="err">${escapeHtml(
                       step.errorMessage,
                     )}</pre></div>`
                   : ""
               }
               ${step.calls.map(renderCall).join("")}
             </div>
           </td>
         </tr>`
      : ""
  }`;
    })
    .join("");

  const stopped =
    reportCase.stoppedAtStep !== undefined
      ? `<tr class="step-stopped"><td colspan="5">The journey stopped at step ${
          reportCase.step
        }.${reportCase.stoppedAtStep}. Whatever this flow does after that never ran, so it is
        neither passed nor failed — it is untested in this run.</td></tr>`
      : "";

  return `${rows}${stopped}`;
}

function renderCaseRow(reportCase: ReportCase): string {
  const { test, outcome } = reportCase;
  const role = VERDICT_ROLE[outcome.verdict];
  const searchable = [
    outcome.plain,
    reportCase.flow,
    reportCase.flowKey,
    reportCase.ref ?? "",
    outcome.expected,
    outcome.actual,
    // A reader searching "publish" must find the journey whose fourth step
    // publishes, even though the case title never says the word.
    ...reportCase.steps.map((s) => `${s.name} ${s.expected} ${s.actual}`),
  ].join(" ");
  const rowId = `s${reportCase.step}`;

  return `
<tbody class="case-rows ${outcome.disagreement ? "flagged" : ""}"
       data-verdict="${escapeHtml(outcome.verdict)}"
       data-kind="${escapeHtml(reportCase.kind)}"
       data-flagged="${outcome.disagreement ? "1" : "0"}"
       data-search="${escapeHtml(searchable.toLowerCase())}">
  <tr class="case-row" data-row="${rowId}" tabindex="0" role="button" aria-expanded="false" aria-controls="${rowId}">
    <td class="c-step"><span class="step-no">${reportCase.step}</span></td>
    <td class="c-what">
      <span class="what">${escapeHtml(outcome.plain)}</span>
      <span class="row-meta">
        <span class="kind k-${escapeHtml(reportCase.kind)}" title="${escapeHtml(KIND_TITLE[reportCase.kind])}">${escapeHtml(
          KIND_LABEL[reportCase.kind],
        )}</span>
        ${reportCase.ref ? `<span class="chip sm ref">${escapeHtml(reportCase.ref)}</span>` : ""}
        <code class="flowkey">${escapeHtml(reportCase.flowKey)}</code>
        ${
          reportCase.steps.length
            ? `<span class="dot">·</span>${reportCase.steps.length} steps`
            : ""
        }
        <span class="dot">·</span>${reportCase.calls.length} call${reportCase.calls.length === 1 ? "" : "s"}
        <span class="dot">·</span>${ms(test.durationMs)}
      </span>
    </td>
    <td class="c-exp"><span class="lbl">Expected</span>${escapeHtml(outcome.expected)}</td>
    <td class="c-act"><span class="lbl">Actual</span>${escapeHtml(outcome.actual)}</td>
    <td class="c-res">
      <span class="pill ${role}">${VERDICT_ICON[outcome.verdict]} ${VERDICT_LABEL[outcome.verdict]}</span>
      ${outcome.disagreement ? `<span class="pill warn sm flag" title="The HTTP evidence contradicts this verdict">⚠ Unproven</span>` : ""}
      <span class="chev" aria-hidden="true">▸</span>
    </td>
  </tr>
  ${renderStepRows(reportCase)}
  <tr class="detail-row" id="${rowId}" hidden>
    <td colspan="5">${renderCaseDetail(reportCase)}</td>
  </tr>
</tbody>`;
}

function renderSection(section: RunSection): string {
  const role = section.failed ? "bad" : section.passed === 0 ? "muted" : "good";
  return `
<tbody class="section-head" data-section="${escapeHtml(section.key)}">
  <tr>
    <td colspan="5">
      <div class="sec">
        <span class="sec-range">${
          section.firstStep === section.lastStep
            ? `Case ${section.firstStep}`
            : `Cases ${section.firstStep}–${section.lastStep}`
        }</span>
        <h3>${escapeHtml(section.title)}</h3>
        ${section.context ? `<span class="sec-context">${escapeHtml(section.context)}</span>` : ""}
        <code class="sec-file">${escapeHtml(section.file)}</code>
        <span class="grow"></span>
        <span class="pill ${role} sm">${section.passed} passed${section.failed ? ` · ${section.failed} failed` : ""}${
          section.skipped ? ` · ${section.skipped} not run` : ""
        }</span>
      </div>
    </td>
  </tr>
</tbody>
${section.cases.map(renderCaseRow).join("")}`;
}

function renderRunTable(model: ReportModel): string {
  if (model.cases.length === 0) {
    return `<p class="none">This run executed no test cases.</p>`;
  }
  return `
<div class="toolbar">
  <input id="q" type="search" placeholder="Search test cases, steps, expectations, results…" aria-label="Search the run">
  <div class="filters" role="group" aria-label="Filter by result">
    <button type="button" class="fbtn on" data-filter="all">All <span class="n">${model.totals.tests}</span></button>
    <button type="button" class="fbtn" data-filter="fail">Failed <span class="n">${model.totals.failed}</span></button>
    <button type="button" class="fbtn" data-filter="pass">Passed <span class="n">${model.totals.passed}</span></button>
    <button type="button" class="fbtn" data-filter="not-run">Not run <span class="n">${model.totals.skipped}</span></button>
    ${
      model.totals.disagreements
        ? `<button type="button" class="fbtn warn-btn" data-filter="flagged">⚠ Unproven <span class="n">${model.totals.disagreements}</span></button>`
        : ""
    }
  </div>
  <span class="grow"></span>
  <button type="button" class="ghost" id="expand-all">Expand all</button>
  <button type="button" class="ghost" id="collapse-all">Collapse all</button>
</div>
<p class="hint" id="filter-note" hidden></p>
<div class="table-wrap run-wrap">
  <table class="run">
    <thead>
      <tr>
        <th class="c-step" scope="col">#</th>
        <th class="c-what" scope="col">Test case — what it does</th>
        <th class="c-exp" scope="col">Expected result</th>
        <th class="c-act" scope="col">Actual result <span class="th-note">(this run)</span></th>
        <th class="c-res" scope="col">Result</th>
      </tr>
    </thead>
    ${model.sections.map(renderSection).join("")}
  </table>
</div>`;
}

// ── secondary cuts of the same rows ─────────────────────────────────────────

function renderKindStrip(flow: FlowGroup): string {
  return (["positive", "negative", "edge"] as CaseKind[])
    .map((kind) => {
      const c = flow.counts[kind];
      if (c.total === 0) return `<span class="kchip empty">${KIND_LABEL[kind]} 0</span>`;
      return `<span class="kchip k-${kind}${c.failed ? " has-fail" : ""}">${KIND_LABEL[kind]} ${c.passed}/${c.total}${
        c.skipped ? ` · ${c.skipped} not run` : ""
      }</span>`;
    })
    .join("");
}

function renderFlow(flow: FlowGroup): string {
  const failed = flow.cases.filter((c) => c.outcome.verdict === "fail").length;
  const skipped = flow.cases.filter((c) => c.outcome.verdict === "not-run").length;
  const role = failed ? "bad" : skipped === flow.cases.length ? "muted" : "good";

  return `
<section class="flow">
  <header class="flow-head">
    <span class="pill ${role} sm">${failed ? `${failed} failed` : skipped === flow.cases.length ? "not run" : "passed"}</span>
    <h3>${escapeHtml(flow.flow)}</h3>
    <code class="flowkey">${escapeHtml(flow.flowKey)}</code>
    <span class="grow"></span>
    ${renderKindStrip(flow)}
    <span class="meta">${flow.callCount} call${flow.callCount === 1 ? "" : "s"}</span>
    ${flow.failedCallCount ? `<span class="pill warn sm">${flow.failedCallCount} non-2xx</span>` : ""}
  </header>
  <ul class="flow-cases">
    ${flow.cases
      .map(
        (c) => `<li>
          <span class="pill ${VERDICT_ROLE[c.outcome.verdict]} sm">${VERDICT_ICON[c.outcome.verdict]} ${
            VERDICT_LABEL[c.outcome.verdict]
          }</span>
          <a href="#s${c.step}" class="jump">Case ${c.step}</a>
          <span class="what">${escapeHtml(c.outcome.plain)}</span>
        </li>`,
      )
      .join("")}
  </ul>
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

/** Every non-2xx call, most severe first. */
function renderFailures(model: ReportModel): string {
  const failures = model.cases
    .flatMap((c) => c.failedCalls.map((call) => ({ call, case: c })))
    .sort((a, b) => (b.call.status || 999) - (a.call.status || 999));
  const orphanFailures = model.orphanCalls.filter((c) => !c.ok);

  if (failures.length === 0 && orphanFailures.length === 0) {
    return `<p class="good-note">Every API call in this run returned a 2xx success.</p>`;
  }

  const rows = [
    ...failures.map(({ call, case: c }) => ({ call, label: `Case ${c.step} — ${c.outcome.plain}`, step: c.step })),
    ...orphanFailures.map((call) => ({ call, label: "outside any case (setup/teardown)", step: undefined })),
  ];

  return `
<p class="hint">A call here is not automatically a bug: a 4xx on a case that <em>expects</em> a refusal is the product working. The <strong>Result</strong> column in the run table is what says whether it was right.</p>
<div class="table-wrap">
  <table class="grid">
    <thead><tr><th>Status</th><th>Method</th><th>API URI</th><th>What the API said</th><th class="num">Took</th><th>Test case</th></tr></thead>
    <tbody>
      ${rows
        .map(
          ({ call, label, step }) => `<tr>
            <td><span class="pill ${statusRole(call.status)} sm">${call.status || "no response"}</span></td>
            <td class="mono">${escapeHtml(call.method)}</td>
            <td class="mono wrap">${escapeHtml(call.uri)}</td>
            <td>${escapeHtml(apiMessage(call) ?? "—")}</td>
            <td class="num">${ms(call.durationMs)}</td>
            <td>${step ? `<a href="#s${step}" class="jump">${escapeHtml(label)}</a>` : escapeHtml(label)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</div>`;
}

/** The full chronological call log — the audit trail. */
function renderCallLog(model: ReportModel): string {
  const calls = [...model.cases.flatMap((c) => c.calls.map((call) => ({ call, step: c.step }))), ...model.orphanCalls.map((call) => ({ call, step: undefined as number | undefined }))].sort(
    (a, b) => a.call.timestamp.localeCompare(b.call.timestamp) || a.call.seq - b.call.seq,
  );

  if (calls.length === 0) return `<p class="none">No API calls were recorded.</p>`;

  return `
<p class="hint">Every request the suite made, in the order it made them — ${calls.length} calls, ${ms(
    model.totals.totalApiMs,
  )} of wall time inside the API.</p>
<div class="table-wrap">
  <table class="grid tight">
    <thead><tr><th class="num">#</th><th>Time</th><th>Method</th><th>API URI</th><th>Status</th><th class="num">Took</th><th>As</th><th>Case</th></tr></thead>
    <tbody>
      ${calls
        .map(
          ({ call, step }, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td class="mono">${escapeHtml(logTime(call.timestamp))}</td>
            <td class="mono">${escapeHtml(call.method)}</td>
            <td class="mono wrap">${escapeHtml(call.uri)}</td>
            <td><span class="pill ${statusRole(call.status)} sm">${call.status || "—"}</span></td>
            <td class="num">${ms(call.durationMs)}</td>
            <td>${escapeHtml(call.identity ?? "—")}</td>
            <td>${step ? `<a href="#s${step}" class="jump">${step}</a>` : "<span class=\"muted-txt\">setup</span>"}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</div>`;
}

const FINDING_ROLE: Record<Finding["status"], string> = {
  confirmed: "bad",
  intermittent: "warn",
  unconfirmed: "warn",
  "not-a-bug": "muted",
};

function renderFindings(model: ReportModel): string {
  if (model.findings.length === 0) {
    return `<p class="none">No product findings have been written up for this suite yet.</p>`;
  }
  return `
<p class="hint">Judged by a human, not by the run. A run can show that a call returned 500; it cannot decide whether that is a defect, bad test data, or a stale expectation.</p>
<div class="findings">
  ${model.findings
    .map(
      (f) => `<article class="finding">
        <header>
          <span class="pill ${FINDING_ROLE[f.status]} sm">${escapeHtml(f.status)}</span>
          <span class="chip sm">${escapeHtml(f.severity)}</span>
          <h4>${escapeHtml(f.title)}</h4>
        </header>
        <p>${escapeHtml(f.detail)}</p>
        <table class="kv">
          ${f.flow ? `<tr><th>Module</th><td><code>${escapeHtml(f.flow)}</code></td></tr>` : ""}
          ${f.endpoint ? `<tr><th>Endpoint</th><td><code>${escapeHtml(f.endpoint)}</code></td></tr>` : ""}
          ${f.evidence ? `<tr><th>Evidence</th><td>${escapeHtml(f.evidence)}</td></tr>` : ""}
          <tr><th>Id</th><td><code>${escapeHtml(f.id)}</code></td></tr>
        </table>
      </article>`,
    )
    .join("")}
</div>`;
}

/** The page's own answer to "how do you know a pass is a pass". */
function renderMethod(model: ReportModel): string {
  return `
<div class="methodology">
  <p class="lede">Nothing in the <strong>Result</strong> column is written down in advance. Every row is the outcome of comparing something the suite committed to before the request went out against something the API actually returned during this run.</p>

  <ol class="steps">
    <li>
      <h4>The expectation is fixed before the call is made</h4>
      <p>Each case declares, in plain English and in machine-checkable form, what should happen — at the top of the test, before any request is sent. A case that is a journey declares the same thing again for every business step inside it, each one stated before that step runs. That is the <strong>Expected result</strong> column. An expectation recorded after the answer arrives is not an expectation, it is a transcript, so the report never derives one from the response.</p>
    </li>
    <li>
      <h4>The actual result is read back off this run's recorded traffic</h4>
      <p>Every request the suite makes passes through one HTTP client, and that client writes the real method, URL, status code, response body, error code and timing to disk as it goes. The <strong>Actual result</strong> column is that record turned into a sentence: the status code is the one the server returned, the quoted message is the one it sent, the timing is the one it took. No part of it is a stored expectation played back.</p>
    </li>
    <li>
      <h4>The verdict is the comparison</h4>
      <p>How the two are compared depends on the kind of case, and each row says which applies under <em>How this was decided</em>:</p>
      <ul>
        <li><strong>One declared request</strong> — the status class the API returned is checked against the class the case requires (2xx for a request that must work, 4xx for one that must be refused, anything under 500 for one that must merely answer deliberately).</li>
        <li><strong>A documented contract case</strong> — the API Oracle compares the live status code and error code against the status the backend contract documents, and classifies the gap (product defect, contract drift, rejected input, environment).</li>
        <li><strong>A multi-step journey</strong> — every assertion inside it must hold, including, where the database is reachable, that the records really landed in Postgres. The first assertion that fails stops the journey and its message is shown in full. A journey is broken out into its numbered steps (1.1, 1.2, 1.3 …) so the row that failed is the business step that failed — adding the event, attaching the auction round, publishing it — and the steps after it are shown as never having run rather than as passes.</li>
      </ul>
    </li>
    <li>
      <h4>And the verdict is then checked against the evidence a second time</h4>
      <p>A report that trusts one mechanism is only as reliable as that mechanism. So for every case with a single declared request, this page <em>re-derives</em> the verdict independently, from the recorded status code alone, and compares it with what the runner concluded. Agreement is shown as a re-check line. Disagreement is flagged <span class="pill warn sm">⚠ Unproven</span> on the row and counted at the top of the page — a green test whose own evidence says otherwise is the most dangerous thing a report can hide.</p>
      <p class="tally">${
        model.totals.disagreements === 0
          ? "In this run, the independent re-check agreed with the runner on every case it could check."
          : `In this run, ${model.totals.disagreements} case(s) disagreed and are flagged in the run table.`
      }</p>
    </li>
  </ol>

  <h4>What a green run does not prove</h4>
  <p>Coverage is not correctness. A case that did not run proves nothing, and is counted separately as <strong>Not run</strong> rather than folded into the pass count — and the same goes for the steps of a journey that stopped part way. Where a whole category of case is missing from a run, that is stated in the notes at the top of this page instead of being left to look like a clean sheet.</p>
</div>`;
}

// ── page ────────────────────────────────────────────────────────────────────

function renderSummary(model: ReportModel): string {
  const t = model.totals;
  const ran = t.passed + t.failed;
  const rate = ran ? Math.round((t.passed / ran) * 100) : 0;
  const barPass = t.tests ? (t.passed / t.tests) * 100 : 0;
  const barFail = t.tests ? (t.failed / t.tests) * 100 : 0;
  const barSkip = t.tests ? (t.skipped / t.tests) * 100 : 0;

  const kindRow = (kind: CaseKind): string => {
    const c = t.byKind[kind];
    return `<tr>
      <th><span class="kind k-${kind}" title="${escapeHtml(KIND_TITLE[kind])}">${KIND_SHORT[kind]}</span></th>
      <td class="num">${c.total}</td><td class="num good-txt">${c.passed}</td>
      <td class="num ${c.failed ? "bad-txt" : ""}">${c.failed}</td>
      <td class="num muted-txt">${c.skipped}</td>
    </tr>`;
  };

  return `
<div class="scorecards">
  <div class="card headline ${t.failed ? "is-bad" : t.passed ? "is-good" : "is-muted"}">
    <span class="card-label">Result of this run</span>
    <div class="big">${rate}<span class="pct">%</span></div>
    <p class="sub">${t.passed} of ${ran} executed test case${ran === 1 ? "" : "s"} passed</p>
    <div class="bar" role="img" aria-label="${t.passed} passed, ${t.failed} failed, ${t.skipped} not run">
      ${barPass ? `<span class="seg good" style="width:${barPass}%"></span>` : ""}
      ${barFail ? `<span class="seg bad" style="width:${barFail}%"></span>` : ""}
      ${barSkip ? `<span class="seg muted" style="width:${barSkip}%"></span>` : ""}
    </div>
    <ul class="legend">
      <li><i class="good"></i>${t.passed} passed</li>
      <li><i class="bad"></i>${t.failed} failed</li>
      <li><i class="muted"></i>${t.skipped} not run</li>
    </ul>
  </div>

  <div class="card">
    <span class="card-label">Coverage by case type</span>
    <table class="grid tight">
      <thead><tr><th>Type</th><th class="num">Total</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Not&nbsp;run</th></tr></thead>
      <tbody>${(["positive", "negative", "edge"] as CaseKind[]).map(kindRow).join("")}</tbody>
    </table>
    ${
      t.disagreements
        ? `<p class="card-alarm">⚠ ${t.disagreements} verdict(s) the HTTP evidence does not support</p>`
        : `<p class="card-ok">✓ Every verdict the report could re-check independently agreed with the run</p>`
    }
  </div>

  <div class="card">
    <span class="card-label">API traffic</span>
    <table class="kv">
      <tr><th>Calls made</th><td>${t.calls}</td></tr>
      <tr><th>Non-2xx</th><td class="${t.failedCalls ? "warn-txt" : ""}">${t.failedCalls}</td></tr>
      <tr><th>Typical response</th><td>${ms(t.p50Ms)}</td></tr>
      <tr><th>Slow tail (p95)</th><td>${ms(t.p95Ms)}</td></tr>
      <tr><th>Slowest call</th><td>${ms(t.maxMs)}</td></tr>
      <tr><th>Time inside the API</th><td>${ms(t.totalApiMs)}</td></tr>
    </table>
  </div>

  <div class="card">
    <span class="card-label">Environment</span>
    <table class="kv">
      <tr><th>Client</th><td>${escapeHtml(model.environment.clientId)}</td></tr>
      ${model.environment.companyId ? `<tr><th>Company</th><td>${escapeHtml(model.environment.companyId)}</td></tr>` : ""}
      ${model.environment.baseUrl ? `<tr><th>Base URL</th><td class="wrap"><code>${escapeHtml(model.environment.baseUrl)}</code></td></tr>` : ""}
      ${model.startedAt ? `<tr><th>Started</th><td>${escapeHtml(logTime(model.startedAt))}</td></tr>` : ""}
      ${model.finishedAt ? `<tr><th>Finished</th><td>${escapeHtml(logTime(model.finishedAt))}</td></tr>` : ""}
      ${model.wallClockMs ? `<tr><th>Took</th><td>${ms(model.wallClockMs)}</td></tr>` : ""}
      <tr><th>Report written</th><td>${escapeHtml(logTime(model.generatedAt))}</td></tr>
    </table>
  </div>
</div>
${
  model.notes.length
    ? `<div class="notes">
         <h3>Read this before reading the numbers</h3>
         <ul>${model.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
       </div>`
    : ""
}`;
}

export function renderReport(model: ReportModel): string {
  const t = model.totals;
  const headline = t.failed
    ? `${t.failed} of ${t.tests} test cases failed`
    : t.passed
      ? `All ${t.passed} executed test cases passed`
      : "No test cases executed";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API automation run — ${escapeHtml(model.environment.clientId)}</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-2: #f2f4f7;
  --line: #e2e6ec;
  --line-strong: #cbd2dc;
  --ink: #12161c;
  --ink-2: #4a5566;
  --ink-3: #78849a;
  --accent: #3355dd;
  --good: #11784a;
  --good-bg: #e6f4ec;
  --bad: #b3261e;
  --bad-bg: #fdeceb;
  --warn: #8a5a00;
  --warn-bg: #fdf3e0;
  --muted: #667085;
  --muted-bg: #eef0f4;
  --radius: 10px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0e1116;
    --surface: #161a21;
    --surface-2: #1c222b;
    --line: #262d38;
    --line-strong: #39424f;
    --ink: #e8ecf2;
    --ink-2: #a7b1c0;
    --ink-3: #7d8899;
    --accent: #7e9bff;
    --good: #57d08a;
    --good-bg: #102a1d;
    --bad: #ff8a80;
    --bad-bg: #2d1514;
    --warn: #ffc65c;
    --warn-bg: #2d2311;
    --muted: #8d97a8;
    --muted-bg: #1e242d;
  }
}
:root[data-theme="dark"] {
  --bg: #0e1116; --surface: #161a21; --surface-2: #1c222b; --line: #262d38;
  --line-strong: #39424f; --ink: #e8ecf2; --ink-2: #a7b1c0; --ink-3: #7d8899;
  --accent: #7e9bff; --good: #57d08a; --good-bg: #102a1d; --bad: #ff8a80;
  --bad-bg: #2d1514; --warn: #ffc65c; --warn-bg: #2d2311; --muted: #8d97a8; --muted-bg: #1e242d;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--sans); font-size: 15px; line-height: 1.55;
}
.wrap { max-width: 1480px; margin: 0 auto; padding: 0 16px 96px; }
h1, h2, h3, h4, h5, h6 { margin: 0; font-weight: 640; letter-spacing: -0.011em; }
p { margin: 0 0 10px; }
p:last-child { margin-bottom: 0; }
code { font-family: var(--mono); font-size: 0.88em; }
a { color: var(--accent); }
.grow { flex: 1; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: var(--mono); font-size: 13px; }
.wrap-any { overflow-wrap: anywhere; }
.muted-txt { color: var(--ink-3); }
.good-txt { color: var(--good); }
.bad-txt { color: var(--bad); }
.warn-txt { color: var(--warn); }
.none { color: var(--ink-3); font-style: italic; }
.hint { color: var(--ink-2); font-size: 13.5px; max-width: 90ch; }

/* ── masthead ── */
.masthead {
  background: var(--surface); border-bottom: 1px solid var(--line);
  position: sticky; top: 0; z-index: 40;
}
.masthead-in {
  max-width: 1480px; margin: 0 auto; padding: 14px 16px;
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.masthead h1 { font-size: 17px; }
.masthead .kicker {
  display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--ink-3);
}
.head-pill { font-size: 13px; font-weight: 640; }
.iconbtn {
  border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2);
  border-radius: 8px; padding: 6px 11px; font: inherit; font-size: 13px; cursor: pointer;
}
.iconbtn:hover { border-color: var(--accent); color: var(--accent); }

/* ── pills & chips ── */
.pill {
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
  padding: 3px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 640;
  border: 1px solid transparent;
}
.pill.sm { padding: 1px 7px; font-size: 11.5px; }
.pill.good { background: var(--good-bg); color: var(--good); border-color: color-mix(in srgb, var(--good) 28%, transparent); }
.pill.bad  { background: var(--bad-bg);  color: var(--bad);  border-color: color-mix(in srgb, var(--bad) 28%, transparent); }
.pill.warn { background: var(--warn-bg); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
.pill.muted{ background: var(--muted-bg); color: var(--muted); border-color: var(--line); }
.chip {
  display: inline-block; padding: 1px 7px; border-radius: 6px; font-size: 11.5px;
  background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--line);
}
.kind {
  display: inline-block; padding: 0 7px; border-radius: 6px; font-size: 11px;
  font-weight: 640; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-2);
}
.kind.k-positive { color: var(--good); border-color: color-mix(in srgb, var(--good) 30%, transparent); }
.kind.k-negative { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
.kind.k-edge     { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }

/* ── scorecards ── */
.scorecards {
  display: grid; gap: 14px; margin: 20px 0 8px;
  grid-template-columns: repeat(auto-fit, minmax(298px, 1fr));
}
.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px;
}
.card-label {
  display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: 10px;
}
.headline .big { font-size: 46px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
.headline .pct { font-size: 22px; color: var(--ink-3); margin-left: 2px; }
.headline.is-good .big { color: var(--good); }
.headline.is-bad .big { color: var(--bad); }
.headline .sub { color: var(--ink-2); font-size: 13.5px; margin: 6px 0 12px; }
.bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--muted-bg); }
.bar .seg.good { background: var(--good); }
.bar .seg.bad { background: var(--bad); }
.bar .seg.muted { background: var(--line-strong); }
.legend { display: flex; gap: 14px; flex-wrap: wrap; list-style: none; margin: 10px 0 0; padding: 0; font-size: 12.5px; color: var(--ink-2); }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; }
.legend i.good { background: var(--good); } .legend i.bad { background: var(--bad); } .legend i.muted { background: var(--line-strong); }
.card-alarm { margin-top: 10px; font-size: 12.5px; color: var(--bad); font-weight: 600; }
.card-ok { margin-top: 10px; font-size: 12.5px; color: var(--ink-3); }
.notes {
  margin-top: 14px; background: var(--warn-bg); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  border-radius: var(--radius); padding: 14px 16px;
}
.notes h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--warn); margin-bottom: 6px; }
.notes ul { margin: 0; padding-left: 18px; color: var(--ink-2); font-size: 13.5px; }
.notes li + li { margin-top: 4px; }

/* ── key/value + grid tables ── */
table.kv { width: 100%; border-collapse: collapse; font-size: 13.5px; }
table.kv th {
  text-align: left; font-weight: 600; color: var(--ink-3); padding: 4px 12px 4px 0;
  white-space: nowrap; vertical-align: top; width: 1%;
}
table.kv td { padding: 4px 0; vertical-align: top; overflow-wrap: anywhere; }
table.grid { width: 100%; border-collapse: collapse; font-size: 13.5px; }
table.grid th {
  text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-3); padding: 7px 10px;
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
table.grid td { padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.grid tbody tr:last-child td { border-bottom: 0; }
table.grid.tight th, table.grid.tight td { padding: 4px 8px; }
/* Inside a scorecard the table has ~318px to live in, so it gives up padding
   before it gives up a column. */
.card table.grid.tight th, .card table.grid.tight td { padding: 3px 5px; font-size: 13px; }
.card table.grid.tight th:first-child, .card table.grid.tight td:first-child { padding-left: 0; }
.card table.grid.tight th:last-child, .card table.grid.tight td:last-child { padding-right: 0; }
table.grid td.wrap { overflow-wrap: anywhere; }
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
/* The run table's <thead> sticks to the PAGE. An ancestor with overflow-x
   would become its containing scroll box instead, hiding the header inside a
   57px gap, so this one wrapper deliberately does not scroll. */
.run-wrap { overflow: visible; }

/* ── tabs ── */
.tabs {
  display: flex; gap: 2px; margin: 22px 0 16px; flex-wrap: wrap;
  border-bottom: 1px solid var(--line);
}
.tab {
  appearance: none; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 600;
  color: var(--ink-3); padding: 9px 14px; cursor: pointer; border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab:hover { color: var(--ink); }
.tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.tab .n { font-size: 11.5px; color: var(--ink-3); font-weight: 600; margin-left: 4px; }
.panel[hidden] { display: none; }

/* ── toolbar ── */
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
#q {
  flex: 1 1 260px; min-width: 200px; padding: 8px 12px; font: inherit; font-size: 14px;
  border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); color: var(--ink);
}
#q:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
.filters { display: flex; gap: 4px; flex-wrap: wrap; }
.fbtn {
  appearance: none; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2);
  padding: 6px 11px; border-radius: 8px;
}
.fbtn:hover { border-color: var(--accent); }
.fbtn.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.fbtn .n { opacity: 0.7; margin-left: 3px; font-variant-numeric: tabular-nums; }
.fbtn.warn-btn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
.fbtn.warn-btn.on { background: var(--warn); color: #1a1205; border-color: var(--warn); }
.ghost {
  appearance: none; font: inherit; font-size: 13px; cursor: pointer; color: var(--ink-3);
  background: none; border: 1px solid var(--line); padding: 6px 10px; border-radius: 8px;
}
.ghost:hover { color: var(--accent); border-color: var(--accent); }

/* ── the run table ── */
table.run { width: 100%; border-collapse: collapse; }
table.run thead th {
  /* Clears the sticky masthead, which measures ~72px with its two-line title. */
  position: sticky; top: 73px; z-index: 20; background: var(--surface-2);
  text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink-3); padding: 9px 12px;
  border-bottom: 1px solid var(--line-strong);
}
.th-note { text-transform: none; letter-spacing: 0; font-weight: 500; opacity: 0.75; }
th.c-step, td.c-step { width: 46px; text-align: center; }
th.c-what { width: 27%; }
th.c-exp, th.c-act { width: 24%; }
th.c-res, td.c-res { width: 168px; }

tbody.section-head td { padding: 0; border: 0; }
.sec {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 16px 12px 8px; border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.sec h3 { font-size: 14.5px; }
.sec-range {
  font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 2px 8px; border-radius: 999px;
}
.sec-file { font-size: 11.5px; color: var(--ink-3); }
.sec-context {
  font-size: 11.5px; color: var(--ink-2); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px;
}

tr.case-row { cursor: pointer; background: var(--surface); }
tr.case-row > td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13.5px; }
tr.case-row:hover > td { background: var(--surface-2); }
tr.case-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
tbody.case-rows.open tr.case-row > td { background: var(--surface-2); border-bottom-color: transparent; }
tbody.case-rows.flagged tr.case-row > td.c-step { box-shadow: inset 3px 0 0 var(--warn); }
.step-no {
  display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 22px;
  border-radius: 6px; background: var(--surface-2); border: 1px solid var(--line);
  font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink-2);
}
td.c-what .what { display: block; font-weight: 600; color: var(--ink); margin-bottom: 5px; }
.row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.row-meta .flowkey { font-size: 11px; color: var(--ink-3); }
.row-meta .dot { opacity: 0.5; }
td.c-exp { color: var(--ink-2); }
td.c-act { color: var(--ink); }
td.c-exp, td.c-act { overflow-wrap: anywhere; }
.lbl {
  display: none; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-3);
}
td.c-res { white-space: nowrap; }
td.c-res .flag { margin-left: 4px; }
.chev { display: inline-block; margin-left: 8px; color: var(--ink-3); transition: transform 0.12s ease; }
tbody.case-rows.open .chev { transform: rotate(90deg); }

/* ── a journey, step by step ── */
tr.step-row { background: var(--surface); cursor: pointer; }
tr.step-row > td {
  padding: 8px 12px; border-bottom: 1px dashed var(--line); vertical-align: top;
  font-size: 13px; color: var(--ink-2);
}
/* The rail down the left is what makes 4.1–4.4 read as one sequence
   belonging to step 4, rather than as four more cases. */
tr.step-row > td.c-step { box-shadow: inset 2px 0 0 var(--line-strong); }
tr.step-row.is-fail > td.c-step { box-shadow: inset 2px 0 0 var(--bad); }
tr.step-row:hover > td { background: var(--surface-2); }
tr.step-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
tr.step-row td.c-what .what { font-weight: 600; color: var(--ink); font-size: 13px; }
tr.step-row.open > td { background: var(--surface-2); border-bottom-color: transparent; }
tr.step-row.open .chev { transform: rotate(90deg); }
.sub-no {
  display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 20px;
  border-radius: 6px; background: transparent; border: 1px solid var(--line);
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink-3);
}
tr.step-row.is-fail .sub-no { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 35%, transparent); }
tr.step-detail > td { padding: 0 12px 12px 58px; background: var(--surface-2); border-bottom: 1px dashed var(--line); }
.step-detail-inner { display: grid; gap: 8px; }
tr.step-stopped > td {
  padding: 8px 12px 10px 58px; font-size: 12.5px; color: var(--warn);
  background: var(--warn-bg); border-bottom: 1px solid var(--line);
}
.chip.ref { font-weight: 700; letter-spacing: 0.02em; }

tr.detail-row > td { padding: 0 12px 16px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.detail-inner { display: grid; gap: 12px; }
.box {
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px;
}
.box h6 {
  font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 7px;
}
.bad-box { border-color: color-mix(in srgb, var(--bad) 35%, transparent); background: var(--bad-bg); }
.bad-box h6 { color: var(--bad); }
.muted-box { background: var(--muted-bg); }
.decided {
  background: var(--surface); border: 1px solid var(--line); border-left: 3px solid var(--accent);
  border-radius: 8px; padding: 12px 14px; font-size: 13.5px; color: var(--ink-2);
}
.decided h6 { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent); margin-bottom: 7px; }
.recheck { margin-top: 8px; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
.recheck.ok { background: var(--good-bg); color: var(--good); }
.recheck.no { background: var(--warn-bg); color: var(--warn); }
.verdict-word { font-weight: 700; }
.alarm { margin-top: 8px; padding: 9px 11px; border-radius: 6px; background: var(--bad-bg); color: var(--bad); font-size: 13px; }
pre.err {
  margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--mono);
  font-size: 12.5px; color: var(--bad); line-height: 1.5;
}

/* ── call evidence ── */
details.call { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); margin-top: 8px; }
details.call:first-of-type { margin-top: 0; }
details.call > summary {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 11px;
  cursor: pointer; list-style: none; font-size: 13px;
}
details.call > summary::-webkit-details-marker { display: none; }
details.call[open] > summary { border-bottom: 1px solid var(--line); }
details.call > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 8px; }
.seq { color: var(--ink-3); font-size: 11.5px; font-variant-numeric: tabular-nums; min-width: 14px; }
.method { font-family: var(--mono); font-weight: 700; font-size: 12px; color: var(--ink-2); }
.uri { color: var(--ink); overflow-wrap: anywhere; }
.time { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.call-body { padding: 11px; display: grid; gap: 10px; }
.said { font-size: 13.5px; color: var(--ink); margin: 0; }
.said-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ink-3); margin-right: 7px;
}
.curl-wrap { border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
.curl-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 5px 10px; background: var(--surface-2); border-bottom: 1px solid var(--line);
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3);
}
.copy {
  appearance: none; font: inherit; font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; cursor: pointer; border: 1px solid var(--line-strong);
  background: var(--surface); color: var(--ink-2); padding: 2px 8px; border-radius: 5px;
}
.copy:hover { border-color: var(--accent); color: var(--accent); }
pre.curl, pre.body {
  margin: 0; padding: 10px; overflow-x: auto; font-family: var(--mono); font-size: 12px;
  line-height: 1.5; background: var(--surface); white-space: pre; tab-size: 2;
}
pre.body { max-height: 340px; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.curl-note { padding: 0 10px 8px; margin: 0; font-size: 11.5px; color: var(--ink-3); }
details.raw > summary, details.all-calls > summary {
  cursor: pointer; font-size: 12px; color: var(--ink-3); list-style: none;
}
details.raw > summary::-webkit-details-marker, details.all-calls > summary::-webkit-details-marker { display: none; }
details.raw > summary::before, details.all-calls > summary::before { content: "▸ "; }
details.raw[open] > summary::before, details.all-calls[open] > summary::before { content: "▾ "; }
details.all-calls > summary h6 { display: inline; }

/* ── by-module view ── */
.client { margin-bottom: 26px; }
.client > h2 { font-size: 16px; margin-bottom: 4px; }
.baseurl { color: var(--ink-3); font-size: 12.5px; margin-bottom: 12px; }
.flow { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); margin-bottom: 12px; }
.flow-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; padding: 11px 14px; border-bottom: 1px solid var(--line); }
.flow-head h3 { font-size: 14px; }
.flow-head .flowkey, .flow-head .meta { font-size: 11.5px; color: var(--ink-3); }
.kchip { font-size: 11px; padding: 1px 7px; border-radius: 6px; background: var(--surface-2); color: var(--ink-2); border: 1px solid var(--line); }
.kchip.empty { opacity: 0.45; }
.kchip.has-fail { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 30%, transparent); }
.flow-cases { list-style: none; margin: 0; padding: 6px 14px 12px; display: grid; gap: 6px; }
.flow-cases li { display: flex; align-items: baseline; gap: 9px; font-size: 13.5px; flex-wrap: wrap; }
.jump { font-size: 12px; font-variant-numeric: tabular-nums; text-decoration: none; white-space: nowrap; }
.jump:hover { text-decoration: underline; }
.good-note { color: var(--good); font-weight: 600; }

/* ── methodology panel ──
   NB: not ".method" — that class is the HTTP verb badge inside a call
   summary, and it sets a monospace face the whole panel would inherit. */
.methodology { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px 26px; max-width: 86ch; }
.methodology .lede { font-size: 16.5px; line-height: 1.6; color: var(--ink); margin-bottom: 20px; }
.methodology ol.steps { margin: 0; padding-left: 22px; display: grid; gap: 18px; }
.methodology ol.steps > li::marker { color: var(--accent); font-weight: 700; }
.methodology h4 { font-size: 14.5px; margin-bottom: 6px; }
.methodology p, .methodology li { color: var(--ink-2); font-size: 14px; }
.methodology ul { margin: 7px 0 0; padding-left: 18px; display: grid; gap: 6px; }
.methodology .tally { margin-top: 10px; font-weight: 600; color: var(--ink); }
.methodology > h4 { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); }

/* ── findings ── */
.findings { display: grid; gap: 12px; }
.finding { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; }
.finding header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 7px; }
.finding h4 { font-size: 14px; }
.finding > p { color: var(--ink-2); font-size: 13.5px; }

/* ── narrow screens: the table becomes stacked cards ── */
@media (max-width: 950px) {
  table.run thead { display: none; }
  table.run, table.run tbody, table.run tr, table.run td { display: block; width: auto; }
  tbody.section-head td { padding: 0; }
  tr.case-row { display: grid; grid-template-columns: 44px 1fr; gap: 0 10px; padding: 10px 0; }
  tr.case-row > td { border: 0; padding: 4px 12px; }
  td.c-step { grid-row: 1; grid-column: 1; }
  td.c-res { grid-row: 1; grid-column: 2; white-space: normal; }
  td.c-what, td.c-exp, td.c-act { grid-column: 1 / -1; }
  tr.step-row { display: grid; grid-template-columns: 52px 1fr; gap: 0 10px; padding: 6px 0; }
  tr.step-row > td { border: 0; padding: 3px 12px; }
  tr.step-detail > td, tr.step-stopped > td { padding-left: 12px; }
  .lbl { display: block; margin-bottom: 2px; }
  tbody.case-rows { border-bottom: 1px solid var(--line); display: block; }
  th.c-what, th.c-exp, th.c-act, th.c-res { width: auto; }
}

/* ── print ── */
@media print {
  .masthead { position: static; }
  .toolbar, .tabs, .iconbtn, .copy, .ghost { display: none !important; }
  .panel[hidden] { display: block !important; }
  body { background: #fff; font-size: 11px; }
  tr.detail-row, tr.step-detail { display: table-row !important; }
  .table-wrap, .card, .box { break-inside: avoid; }
  tbody.case-rows { break-inside: avoid; }
}
</style>
</head>
<body>
<header class="masthead">
  <div class="masthead-in">
    <div>
      <span class="kicker">API automation · test report</span>
      <h1>${escapeHtml(model.environment.clientId)}${
        model.environment.companyId ? ` · company ${escapeHtml(model.environment.companyId)}` : ""
      }</h1>
    </div>
    <span class="pill ${t.failed ? "bad" : t.passed ? "good" : "muted"} head-pill">${escapeHtml(headline)}</span>
    ${
      t.disagreements
        ? `<span class="pill warn head-pill">⚠ ${t.disagreements} unproven</span>`
        : ""
    }
    <span class="grow"></span>
    <span class="muted-txt" style="font-size:12.5px">${escapeHtml(
      model.startedAt ? logTime(model.startedAt) : logTime(model.generatedAt),
    )}</span>
    <button type="button" class="iconbtn" id="theme">Theme</button>
    <button type="button" class="iconbtn" onclick="window.print()">Print</button>
  </div>
</header>

<div class="wrap">
  ${renderSummary(model)}

  <nav class="tabs" role="tablist">
    <button class="tab" role="tab" aria-selected="true" data-panel="run" id="tab-run">Run, in order <span class="n">${model.totals.tests}</span></button>
    <button class="tab" role="tab" aria-selected="false" data-panel="method" id="tab-method">How pass/fail is decided</button>
    <button class="tab" role="tab" aria-selected="false" data-panel="flows" id="tab-flows">By module</button>
    <button class="tab" role="tab" aria-selected="false" data-panel="failures" id="tab-failures">Non-2xx calls <span class="n">${model.totals.failedCalls}</span></button>
    <button class="tab" role="tab" aria-selected="false" data-panel="log" id="tab-log">Full call log <span class="n">${model.totals.calls}</span></button>
    <button class="tab" role="tab" aria-selected="false" data-panel="findings" id="tab-findings">Findings <span class="n">${model.findings.length}</span></button>
  </nav>

  <section class="panel" id="panel-run" role="tabpanel" aria-labelledby="tab-run">
    ${renderRunTable(model)}
  </section>
  <section class="panel" id="panel-method" role="tabpanel" aria-labelledby="tab-method" hidden>
    ${renderMethod(model)}
  </section>
  <section class="panel" id="panel-flows" role="tabpanel" aria-labelledby="tab-flows" hidden>
    ${model.clients.map(renderClient).join("") || `<p class="none">No modules ran.</p>`}
  </section>
  <section class="panel" id="panel-failures" role="tabpanel" aria-labelledby="tab-failures" hidden>
    ${renderFailures(model)}
  </section>
  <section class="panel" id="panel-log" role="tabpanel" aria-labelledby="tab-log" hidden>
    ${renderCallLog(model)}
  </section>
  <section class="panel" id="panel-findings" role="tabpanel" aria-labelledby="tab-findings" hidden>
    ${renderFindings(model)}
  </section>
</div>

<script>
(function () {
  var root = document.documentElement;

  // theme: system by default, click to cycle light / dark
  var themeBtn = document.getElementById("theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var now = root.getAttribute("data-theme");
      var dark = now ? now === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", dark ? "light" : "dark");
    });
  }

  // tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  function show(name) {
    tabs.forEach(function (tab) {
      var on = tab.dataset.panel === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      var panel = document.getElementById("panel-" + tab.dataset.panel);
      if (panel) panel.hidden = !on;
    });
  }
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { show(tab.dataset.panel); });
  });

  // expand / collapse a step
  var table = document.querySelector("table.run");
  function toggle(body, force) {
    var row = body.querySelector("tr.case-row");
    var detail = body.querySelector("tr.detail-row");
    if (!row || !detail) return;
    var open = typeof force === "boolean" ? force : detail.hidden;
    detail.hidden = !open;
    body.classList.toggle("open", open);
    row.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (table) {
    table.addEventListener("click", function (event) {
      if (event.target.closest("a, button, summary, pre")) return;
      var row = event.target.closest("tr.case-row");
      if (row) toggle(row.parentNode);
    });
    table.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var row = event.target.closest("tr.case-row");
      if (!row) return;
      event.preventDefault();
      toggle(row.parentNode);
    });
  }
  // expand / collapse one step of a journey
  function toggleStep(row, force) {
    var detail = document.getElementById(row.dataset.step);
    if (!detail) return;
    var open = typeof force === "boolean" ? force : detail.hidden;
    detail.hidden = !open;
    row.classList.toggle("open", open);
    row.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (table) {
    table.addEventListener("click", function (event) {
      if (event.target.closest("a, button, summary, pre")) return;
      var row = event.target.closest("tr.step-row");
      if (row) toggleStep(row);
    });
    table.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var row = event.target.closest("tr.step-row");
      if (!row) return;
      event.preventDefault();
      toggleStep(row);
    });
  }
  var stepRows = Array.prototype.slice.call(document.querySelectorAll("tr.step-row[data-step]"));

  var bodies = Array.prototype.slice.call(document.querySelectorAll("tbody.case-rows"));
  var expandAll = document.getElementById("expand-all");
  var collapseAll = document.getElementById("collapse-all");
  if (expandAll) {
    expandAll.addEventListener("click", function () {
      bodies.forEach(function (b) { toggle(b, true); });
      stepRows.forEach(function (r) { toggleStep(r, true); });
    });
  }
  if (collapseAll) {
    collapseAll.addEventListener("click", function () {
      bodies.forEach(function (b) { toggle(b, false); });
      stepRows.forEach(function (r) { toggleStep(r, false); });
    });
  }

  // open a step directly from a "Step 12" link in another tab
  function openFromHash() {
    var id = location.hash.slice(1);
    if (!id) return;
    var detail = document.getElementById(id);
    if (!detail) return;
    show("run");
    toggle(detail.parentNode, true);
    detail.parentNode.scrollIntoView({ block: "center" });
  }
  document.addEventListener("click", function (event) {
    var link = event.target.closest("a.jump");
    if (!link) return;
    event.preventDefault();
    location.hash = link.getAttribute("href").slice(1);
    openFromHash();
  });
  window.addEventListener("hashchange", openFromHash);

  // filter + search
  var query = document.getElementById("q");
  var note = document.getElementById("filter-note");
  var fbtns = Array.prototype.slice.call(document.querySelectorAll(".fbtn"));
  var mode = "all";

  function apply() {
    var text = (query && query.value || "").trim().toLowerCase();
    var shown = 0;
    bodies.forEach(function (body) {
      var byMode =
        mode === "all" ? true :
        mode === "flagged" ? body.dataset.flagged === "1" :
        body.dataset.verdict === mode;
      var byText = !text || body.dataset.search.indexOf(text) !== -1;
      var on = byMode && byText;
      body.hidden = !on;
      if (on) shown++;
    });
    // a section heading with nothing left under it is noise
    var sections = Array.prototype.slice.call(document.querySelectorAll("tbody.section-head"));
    sections.forEach(function (head) {
      var any = false;
      var node = head.nextElementSibling;
      while (node && node.classList.contains("case-rows")) {
        if (!node.hidden) { any = true; break; }
        node = node.nextElementSibling;
      }
      head.hidden = !any;
    });
    if (note) {
      var filtered = mode !== "all" || text;
      note.hidden = !filtered;
      note.textContent = filtered ? "Showing " + shown + " of " + bodies.length + " test cases." : "";
    }
  }
  if (query) query.addEventListener("input", apply);
  fbtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.dataset.filter;
      fbtns.forEach(function (other) { other.classList.toggle("on", other === btn); });
      apply();
    });
  });

  // copy a curl command
  document.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-copy]");
    if (!btn) return;
    var pre = btn.closest(".curl-wrap").querySelector("pre.curl");
    if (!pre) return;
    var done = function () {
      var was = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = was; }, 1400);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(pre.textContent).then(done, function () {});
    } else {
      var range = document.createRange();
      range.selectNodeContents(pre);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { document.execCommand("copy"); done(); } catch (e) {}
      sel.removeAllRanges();
    }
  });

  openFromHash();
})();
</script>
</body>
</html>`;
}
