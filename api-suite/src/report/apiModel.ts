import { ApiCallRecord, CaseKind } from "../lib/apiLog";
import { apiMessage, createdRecordUuid, toCurl } from "./curl";
import { Finding, findingsForClients } from "./findings";
import { moduleLabel } from "../lib/moduleNames";
import { ModuleScope, describeScope, inScope, moduleScope } from "../lib/scope";
import { loadAllClientConfigs } from "../lib/configStore";
import {
  ModuleCatalogue,
  caseKey,
  knownClientIds,
  knownDatasourceKeys,
  loadCatalogues,
  moduleByUuid,
} from "./moduleCases";

/**
 * Shapes the raw evidence into what the report renders: run → client → module
 * → flow → test case → the curl that proves it.
 *
 * Deliberately separate from both the recorder and the HTML: the Playwright
 * reporter and the standalone `npm run report:po` build the same model from
 * different sources, and only this file decides what a "module" is.
 *
 * The model no longer carries request/response bodies or header sets. It used
 * to, and the report was a 7 MB network capture nobody read — a reader wanted
 * the verdict, and then one command to reproduce it. `CallEvidence` is that:
 * status, timing, curl, and whatever the API actually said.
 */

export type TestStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted";

/** One executed (or skipped) test, normalised away from Playwright's types. */
export interface ExecutedTest {
  id: string;
  title: string;
  titlePath: string[];
  file: string;
  project: string;
  status: TestStatus;
  durationMs: number;
  startedAt?: string;
  retries: number;
  /** assertion or thrown-error message, for a failure */
  errorMessage?: string;
  /** why a test did not run */
  skipReason?: string;
  annotations: Array<{ type: string; description?: string }>;
}

/**
 * What the report keeps of one API call.
 *
 * Everything here fits on a line or two; the bodies stay in
 * reports/api-calls/*.jsonl for anyone who needs the raw traffic.
 */
export interface CallEvidence {
  seq: number;
  timestamp: string;
  method: string;
  /** path + query — the grouping key */
  uri: string;
  url: string;
  status: number;
  statusText?: string;
  ok: boolean;
  durationMs: number;
  clientId: string;
  companyId?: number;
  identity?: string;
  unauthenticated?: boolean;
  /** phase label, for a CLI run */
  step?: string;
  /** the call, as a command that reproduces it */
  curl: string;
  /** what the API said — the message, not the payload */
  message?: string;
  /** the record a successful create returned */
  recordUuid?: string;
}

export interface ReportCase {
  test: ExecutedTest;
  /** which client account the case ran against */
  client?: string;
  /** registry flow id, e.g. "events.rfp_rfq" */
  flowKey: string;
  /** human flow name */
  flow: string;
  /** grouping, e.g. "events" | "masterdata" | "auth" */
  category: string;
  /** key_attribute of the module under test, when the case names one */
  moduleKey?: string;
  /** the module as the report labels it — "PO", "GRN", "Invoice" */
  module: string;
  kind: CaseKind;
  /** what the case expects the API to do */
  expects: "accept" | "reject";
  /** why the case exists */
  because?: string;
  calls: CallEvidence[];
  /** calls that did not return 2xx */
  failedCalls: CallEvidence[];
}

export interface FlowGroup {
  flowKey: string;
  flow: string;
  category: string;
  cases: ReportCase[];
  counts: Record<CaseKind, { total: number; passed: number; failed: number; skipped: number }>;
  callCount: number;
  failedCallCount: number;
  /** slowest call in the flow, ms */
  slowestCallMs: number;
}

/** One row of a module's test-case catalogue, with what this run did to it. */
export interface CatalogueRow {
  id: string;
  name: string;
  kind: CaseKind;
  expects: "accept" | "reject";
  because: string;
  source: "generated" | "file";
  /** undefined when no test in this run exercised the case */
  status?: TestStatus;
  skipReason?: string;
}

/**
 * How much of what the module's schema asks for this run actually checked.
 * `defined` comes from the backend schema, `exercised` from the run — the two
 * being different is the number worth reporting.
 */
export interface ModuleCoverage {
  datasourceKey: string;
  datasourceUuid: string;
  /** validation rules the schema declares on this module */
  ruleCount: number;
  defined: number;
  exercised: number;
  passed: number;
  failed: number;
  notRun: number;
  rows: CatalogueRow[];
}

export interface ModuleGroup {
  /** key_attribute, or undefined for cases that belong to no single module */
  moduleKey?: string;
  module: string;
  flows: FlowGroup[];
  counts: Record<CaseKind, { total: number; passed: number; failed: number; skipped: number }>;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  callCount: number;
  failedCallCount: number;
  coverage?: ModuleCoverage;
}

export interface ClientGroup {
  clientId: string;
  companyId?: number;
  baseUrl?: string;
  modules: ModuleGroup[];
}

export interface Totals {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  byKind: Record<CaseKind, { total: number; passed: number; failed: number; skipped: number }>;
  calls: number;
  failedCalls: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  totalApiMs: number;
}

/**
 * Cases the run executed that the module scope excludes.
 *
 * Summarised rather than rendered: the point of a scope is a report about one
 * module. But a failure must never vanish because of a filter, so anything red
 * out here is named — the reader is told plainly that these ran and are not
 * counted in the numbers above.
 */
export interface OutOfScope {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** titles of the ones that failed, so nothing red is hidden by the filter */
  failures: string[];
  /** modules that were excluded, as the report names them */
  modules: string[];
}

export interface ReportModel {
  /**
   * 'tests' — a Playwright run: cases are test cases, kinds are meaningful.
   * 'run'   — a CLI run such as `npm run po`: cases are the steps the script
   *           performed, and "coverage by kind" has no meaning, so the report
   *           omits it rather than showing three zeroes.
   */
  mode: 'tests' | 'run';
  generatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  wallClockMs: number;
  /** environment the run went against */
  environment: { clientId: string; baseUrl?: string; companyId?: number };
  clients: ClientGroup[];
  /** every case, flat — the detail table */
  cases: ReportCase[];
  /** calls that belong to no test (global setup, teardown) */
  orphanCalls: CallEvidence[];
  totals: Totals;
  /** coverage gaps worth stating plainly */
  notes: string[];
  /** product findings for this client, from config/findings.yaml */
  findings: Finding[];
  /** the module scope this run was narrowed to, when it was */
  moduleScope?: string;
  /** cases that ran but sit outside that scope */
  outOfScope?: OutOfScope;
}

/** Client configs, or none — a report must never fail for want of a config. */
function configuredClients() {
  try {
    return loadAllClientConfigs();
  } catch {
    return [];
  }
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

const emptyKindCounts = (): Record<CaseKind, { total: number; passed: number; failed: number; skipped: number }> => ({
  positive: { total: 0, passed: 0, failed: 0, skipped: 0 },
  negative: { total: 0, passed: 0, failed: 0, skipped: 0 },
  edge: { total: 0, passed: 0, failed: 0, skipped: 0 },
});

function tally(
  counts: Record<CaseKind, { total: number; passed: number; failed: number; skipped: number }>,
  kind: CaseKind,
  status: TestStatus,
): void {
  const bucket = counts[kind];
  bucket.total++;
  if (status === "passed") bucket.passed++;
  else if (status === "skipped") bucket.skipped++;
  else bucket.failed++;
}

/** Slims one recorded call down to what the report shows. */
export function toEvidence(call: ApiCallRecord): CallEvidence {
  return {
    seq: call.seq,
    timestamp: call.timestamp,
    method: call.method,
    uri: call.uri,
    url: call.url,
    status: call.status,
    statusText: call.statusText,
    ok: call.ok,
    durationMs: call.durationMs,
    clientId: call.clientId,
    companyId: call.companyId,
    identity: call.identity,
    unauthenticated: call.unauthenticated,
    step: call.step,
    curl: toCurl(call),
    message: apiMessage(call),
    recordUuid: call.ok ? createdRecordUuid(call) : undefined,
  };
}

/**
 * Which module a call is about.
 *
 * Read off the request rather than the test name: a create names its
 * datasource in the payload, and a schema read names it in the query string.
 * That covers every call the suite makes without a spec having to declare
 * anything.
 */
function moduleOfCall(
  call: ApiCallRecord,
  byUuid: Map<string, { key: string; label: string }>,
): { key: string; label: string } | undefined {
  const body = call.requestBody as Record<string, unknown> | undefined;
  const fromBody = body && typeof body === "object" ? body.datasource_uuid : undefined;
  if (typeof fromBody === "string" && byUuid.has(fromBody)) return byUuid.get(fromBody);

  const match = call.uri.match(/datasource_uuid=([^&]+)/) ?? call.uri.match(/flexi_datasources\/([^/?]+)/);
  if (match) {
    const uuid = decodeURIComponent(match[1]);
    if (byUuid.has(uuid)) return byUuid.get(uuid);
  }
  return undefined;
}

/**
 * Where a test's flow, module and kind come from, in priority order:
 *   1. annotations the spec pushed (`module`/`datasource`, `flow`, `kind`, …)
 *   2. a known key_attribute appearing in the title path — how the live specs
 *      name the module they are iterating over
 *   3. the datasource the case's own calls addressed
 *   4. the spec file path, which is how the hand-written specs are organised
 *
 * A test that declares nothing still lands somewhere sensible rather than in
 * an "unknown" bucket, but the annotations are what make the report precise.
 */
function classify(
  test: ExecutedTest,
  calls: ApiCallRecord[],
  keys: string[],
  clientIds: string[],
  byUuid: Map<string, { key: string; label: string }>,
): {
  client?: string;
  flowKey: string;
  flow: string;
  category: string;
  moduleKey?: string;
  module: string;
  kind: CaseKind;
  expects: "accept" | "reject";
  because?: string;
} {
  const annotation = (type: string): string | undefined =>
    test.annotations.find((a) => a.type === type)?.description;

  const taggedKind = test.title.match(/^\[(positive|negative|edge)\]/i)?.[1]?.toLowerCase();
  const kind = ((annotation("kind") ?? taggedKind ?? "positive") as CaseKind);

  const registryKey = test.title.match(/\[([a-z0-9_]+\.[a-z0-9_]+)\]\s*$/i)?.[1];
  const annotatedFlow = annotation("flow");
  const fileFlow = test.file
    .replace(/^tests\//, "")
    .replace(/\.spec\.ts$/, "")
    .replace(/\//g, ".");

  const flowKey = annotatedFlow ?? registryKey ?? fileFlow;
  const category = flowKey.includes(".") ? flowKey.split(".")[0] : flowKey;

  /**
   * The flow name: the describe chain, and nothing else.
   *
   * It used to be the whole title path from index 1, which under the new
   * grouping read as "tests/tier3-flow/po-document-flow.spec.ts › PO creation
   * flow › decathlon / p2p_purchase_order › creates the header…" — the file,
   * the client, the module and the case title, every one of which the report
   * already shows somewhere else. Drop the project, the spec file, the case
   * title itself, and any segment that only names the client or the module.
   */
  const describes = test.titlePath
    .slice(1, -1)
    .filter((part) => part && !part.endsWith(".spec.ts") && !part.endsWith(".ts"));

  const expects =
    (annotation("expect") as "accept" | "reject" | undefined) ??
    (kind === "negative" ? "reject" : "accept");

  const haystack = [...test.titlePath, test.title].join(" ");

  // Which account the case ran against. Named in the spec's describe, which is
  // the only source available when a case is gated off: a skipped case makes no
  // calls, and attributing it by its calls filed every one of them under
  // whichever client happened to be the run's busiest.
  const client =
    annotation("client") ??
    clientIds.find((id) => haystack.includes(id)) ??
    calls.find((c) => c.clientId && !c.clientId.startsWith("("))?.clientId;

  const annotatedModule = annotation("datasource") ?? annotation("module");
  const moduleKey =
    (annotatedModule && keys.includes(annotatedModule) ? annotatedModule : undefined) ??
    keys.find((key) => haystack.includes(key)) ??
    calls.map((c) => moduleOfCall(c, byUuid)).find(Boolean)?.key;

  const module = moduleKey
    ? moduleLabel(moduleKey)
    : annotatedModule ?? "Platform (not module-specific)";

  const flow =
    annotation("flowTitle") ??
    describes
      .filter((part) => {
        if (client && part.includes(client)) return false;
        return !keys.some((key) => part.includes(key));
      })
      .join(" › ")
      .replace(/\s*\[[a-z0-9_.]+\]\s*$/i, "")
      .trim();

  return {
    client,
    flowKey,
    flow: flow || flowKey,
    category,
    moduleKey,
    module,
    kind,
    expects,
    because: annotation("because"),
  };
}

/**
 * Attaches calls to the test that made them, keyed on Playwright's test id.
 *
 * The id rather than the title path, because `TestInfo.titlePath` (what the
 * recorder sees from inside the test) omits the project name that
 * `TestCase.titlePath()` (what the reporter sees) includes. The recorder also
 * stores the project, so the path is kept as a fallback for any record written
 * by a Playwright version that did not expose `testId`.
 */
function callsByTest(calls: ApiCallRecord[]): {
  byId: Map<string, ApiCallRecord[]>;
  byPath: Map<string, ApiCallRecord[]>;
} {
  const byId = new Map<string, ApiCallRecord[]>();
  const byPath = new Map<string, ApiCallRecord[]>();
  for (const call of calls) {
    if (!call.test) continue;
    if (call.test.testId) {
      byId.set(call.test.testId, [...(byId.get(call.test.testId) ?? []), call]);
    }
    const path = [call.test.project, ...call.test.titlePath].filter(Boolean).join(" › ");
    byPath.set(path, [...(byPath.get(path) ?? []), call]);
  }
  return { byId, byPath };
}

/**
 * Turns the steps of a non-test run into cases, so one report can render both.
 *
 * A step "passed" when every call it made returned 2xx. That is a weaker claim
 * than a test assertion and the report says so — but it is the honest reading
 * of a script that only ever checked status codes.
 */
function casesFromSteps(calls: ApiCallRecord[]): ExecutedTest[] {
  const order: string[] = [];
  const byStep = new Map<string, ApiCallRecord[]>();
  for (const call of calls) {
    const step = call.step ?? 'ungrouped calls';
    if (!byStep.has(step)) { byStep.set(step, []); order.push(step); }
    byStep.get(step)!.push(call);
  }
  return order.map((step, index) => {
    const stepCalls = byStep.get(step)!;
    const failed = stepCalls.filter((c) => !c.ok);
    return {
      id: `step-${index + 1}`,
      title: step,
      titlePath: [step],
      // Reads as the flow name in the report; "(cli run)" was noise.
      file: 'purchase-order.cli',
      project: 'run',
      status: (failed.length ? 'failed' : 'passed') as TestStatus,
      durationMs: stepCalls.reduce((total, c) => total + c.durationMs, 0),
      startedAt: stepCalls[0]?.timestamp,
      retries: 0,
      errorMessage: failed.length
        ? failed.map((c) => `${c.method} ${c.uri} -> ${c.status} ${apiMessage(c) ?? ''}`.trim()).join('\n')
        : undefined,
      annotations: [],
    };
  });
}

/**
 * Joins a module's catalogue — the cases its backend schema implies — to what
 * this run did, so a defined-but-never-exercised case is visible as a gap.
 */
function coverageFor(catalogue: ModuleCatalogue, cases: ReportCase[]): ModuleCoverage {
  const executed = new Map<string, ReportCase>();
  for (const reportCase of cases) executed.set(caseKey(reportCase.test.title), reportCase);

  const rows: CatalogueRow[] = catalogue.cases.map((c) => {
    const match = executed.get(caseKey(c.name));
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      expects: c.expect,
      because: c.because,
      source: c.source,
      status: match?.test.status,
      skipReason: match?.test.skipReason ?? c.skip,
    };
  });

  return {
    datasourceKey: catalogue.datasourceKey,
    datasourceUuid: catalogue.datasourceUuid,
    ruleCount: catalogue.ruleCount,
    defined: rows.length,
    exercised: rows.filter((r) => r.status && r.status !== "skipped").length,
    passed: rows.filter((r) => r.status === "passed").length,
    failed: rows.filter((r) => r.status === "failed" || r.status === "timedOut").length,
    notRun: rows.filter((r) => !r.status || r.status === "skipped").length,
    rows,
  };
}

export function buildModel(input: {
  tests: ExecutedTest[];
  calls: ApiCallRecord[];
  startedAt?: string;
  finishedAt?: string;
  environment: { clientId: string; baseUrl?: string; companyId?: number };
  notes?: string[];
  mode?: 'tests' | 'run';
  /** defaults to the process scope: MODULE=… or --module … */
  scope?: ModuleScope;
}): ReportModel {
  const mode = input.mode ?? 'tests';
  const tests = mode === 'run' ? casesFromSteps(input.calls) : input.tests;
  const { byId, byPath } = callsByTest(input.calls);
  const byStep = new Map<string, ApiCallRecord[]>();
  if (mode === 'run') {
    for (const call of input.calls) {
      const step = call.step ?? 'ungrouped calls';
      byStep.set(step, [...(byStep.get(step) ?? []), call]);
    }
  }

  const scope = input.scope ?? moduleScope();
  const configured = configuredClients();
  const catalogues = loadCatalogues(configured, scope);
  const byUuid = moduleByUuid();
  const keys = knownDatasourceKeys();
  const clientIds = knownClientIds();

  // Line item -> its header, so scoping to PO keeps the PO's lines: a document
  // module is the header and its lines together, never the header alone.
  const parentOf = new Map<string, string>();
  for (const client of configured) {
    for (const [key, ds] of Object.entries(client.datasources)) {
      if (ds.lineItemKeyAttribute) parentOf.set(ds.lineItemKeyAttribute, key);
    }
  }

  const allCases: ReportCase[] = tests.map((test) => {
    const raw =
      mode === 'run'
        ? byStep.get(test.title) ?? []
        : byId.get(test.id) ?? byPath.get(test.titlePath.join(" › ")) ?? [];
    const meta = classify(test, raw, keys, clientIds, byUuid);
    const calls = raw.map(toEvidence);
    return {
      test,
      ...meta,
      calls,
      failedCalls: calls.filter((c) => !c.ok),
    };
  });

  /**
   * Narrow to the module scope, if one was set.
   *
   * A scoped run answers a question about one module, so the report answers
   * the same question: only that module's cases, only its calls, and totals
   * that count nothing else. A case belonging to no module at all — the
   * platform-wide auth and contract checks — is out of scope too, and reported
   * as such below rather than silently dropped.
   */
  const cases = scope.isAll
    ? allCases
    : allCases.filter(
        (c) => c.moduleKey && inScope(c.moduleKey, { parentKey: parentOf.get(c.moduleKey), scope }),
      );

  const excluded = allCases.filter((c) => !cases.includes(c));
  const outOfScope: OutOfScope | undefined = scope.isAll || excluded.length === 0
    ? undefined
    : {
        total: excluded.length,
        passed: excluded.filter((c) => c.test.status === "passed").length,
        failed: excluded.filter((c) => c.test.status === "failed" || c.test.status === "timedOut").length,
        skipped: excluded.filter((c) => c.test.status === "skipped").length,
        failures: excluded
          .filter((c) => c.test.status === "failed" || c.test.status === "timedOut")
          .map((c) => `${c.module} › ${c.test.title}`),
        modules: [...new Set(excluded.map((c) => c.module))].sort(),
      };

  // Group by client, then module, then flow. A call knows its own client, so a
  // flow that ran for two companies in one run is not merged into one row.
  const clientOf = (c: ReportCase): { clientId: string; companyId?: number } => {
    const first = c.calls[0];
    // The unauthenticated security cases are logged as "(no credentials)" and
    // are their own group: they are not a client, and folding them into one
    // would claim the account rejected requests it never received.
    const fromCall = first?.clientId;
    return {
      clientId:
        (fromCall && fromCall.startsWith("(") ? fromCall : undefined) ??
        c.client ??
        fromCall ??
        input.environment.clientId,
      companyId: first?.companyId ?? input.environment.companyId,
    };
  };

  const clientMap = new Map<string, ClientGroup>();
  for (const reportCase of cases) {
    const { clientId, companyId } = clientOf(reportCase);
    const clientKey = `${clientId}#${companyId ?? ""}`;
    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, { clientId, companyId, baseUrl: input.environment.baseUrl, modules: [] });
    }
    const client = clientMap.get(clientKey)!;

    let group = client.modules.find((m) => m.module === reportCase.module);
    if (!group) {
      group = {
        moduleKey: reportCase.moduleKey,
        module: reportCase.module,
        flows: [],
        counts: emptyKindCounts(),
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        callCount: 0,
        failedCallCount: 0,
      };
      client.modules.push(group);
    }

    let flow = group.flows.find((f) => f.flowKey === reportCase.flowKey);
    if (!flow) {
      flow = {
        flowKey: reportCase.flowKey,
        flow: reportCase.flow,
        category: reportCase.category,
        cases: [],
        counts: emptyKindCounts(),
        callCount: 0,
        failedCallCount: 0,
        slowestCallMs: 0,
      };
      group.flows.push(flow);
    }
    flow.cases.push(reportCase);
    tally(flow.counts, reportCase.kind, reportCase.test.status);
    flow.callCount += reportCase.calls.length;
    flow.failedCallCount += reportCase.failedCalls.length;
    flow.slowestCallMs = Math.max(flow.slowestCallMs, ...reportCase.calls.map((c) => c.durationMs), 0);

    tally(group.counts, reportCase.kind, reportCase.test.status);
    group.total++;
    if (reportCase.test.status === "passed") group.passed++;
    else if (reportCase.test.status === "skipped") group.skipped++;
    else group.failed++;
    group.callCount += reportCase.calls.length;
    group.failedCallCount += reportCase.failedCalls.length;
  }

  for (const client of clientMap.values()) {
    for (const group of client.modules) {
      group.flows.sort((a, b) => a.category.localeCompare(b.category) || a.flow.localeCompare(b.flow));
      const catalogue = group.moduleKey
        ? catalogues.get(`${client.clientId}/${group.moduleKey}`)
        : undefined;
      if (catalogue && mode === 'tests') {
        group.coverage = coverageFor(catalogue, group.flows.flatMap((f) => f.cases));
      }
    }
    // Modules with a schema first, the catch-all group last: a reader is
    // looking for "how is PO doing", not for the auth cases.
    client.modules.sort((a, b) =>
      Number(Boolean(b.moduleKey)) - Number(Boolean(a.moduleKey)) || a.module.localeCompare(b.module),
    );
  }

  const orphanCalls =
    mode === 'run' ? [] : input.calls.filter((c) => !c.test).map(toEvidence);

  // Measured over the calls the report actually renders. Under a scope these
  // are fewer than the run made, and a p95 that included filtered-out traffic
  // would describe a run the page does not show.
  const shownCalls = [...cases.flatMap((c) => c.calls), ...orphanCalls];
  const durations = shownCalls.map((c) => c.durationMs);
  const byKind = emptyKindCounts();
  for (const reportCase of cases) tally(byKind, reportCase.kind, reportCase.test.status);

  const totals: Totals = {
    tests: cases.length,
    passed: cases.filter((c) => c.test.status === "passed").length,
    failed: cases.filter((c) => c.test.status === "failed" || c.test.status === "timedOut").length,
    skipped: cases.filter((c) => c.test.status === "skipped").length,
    byKind,
    calls: shownCalls.length,
    failedCalls: shownCalls.filter((c) => !c.ok).length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations.length ? Math.max(...durations) : 0,
    totalApiMs: durations.reduce((a, b) => a + b, 0),
  };

  const notes = [...(input.notes ?? [])];
  if (mode === 'tests') {
    for (const kind of ["positive", "negative", "edge"] as CaseKind[]) {
      if (byKind[kind].total === 0) {
        notes.push(`No ${kind} cases ran in this run — that is a coverage gap, not a pass.`);
      }
    }
  } else {
    notes.push(
      'This is a CLI run, not a test run: each row below is a step the script ' +
        'performed, and a step counts as passed when every call it made returned 2xx. ' +
        'No assertions were evaluated — run the suite for that.'
    );
  }

  const started = input.startedAt ? new Date(input.startedAt).getTime() : undefined;
  const finished = input.finishedAt ? new Date(input.finishedAt).getTime() : undefined;

  const clients = [...clientMap.values()].sort((a, b) => a.clientId.localeCompare(b.clientId));

  // Bugs for every client the run actually touched. The anonymous group the
  // unauthenticated cases are filed under is not a client and has no bugs.
  const runClients = clients
    .map((c) => c.clientId)
    .filter((id) => id && !id.startsWith("("));
  const findings = findingsForClients(
    runClients.length ? runClients : [input.environment.clientId],
  );

  return {
    mode,
    findings,
    generatedAt: new Date().toISOString(),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    wallClockMs: started && finished ? finished - started : 0,
    environment: input.environment,
    clients,
    cases,
    moduleScope: describeScope(configured, scope),
    outOfScope,
    orphanCalls,
    totals,
    notes,
  };
}
