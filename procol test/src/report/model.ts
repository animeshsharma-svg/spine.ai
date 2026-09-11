import { ApiCallRecord, CaseKind } from "./apiLog.js";
import { Finding, loadFindings } from "./findings.js";

/**
 * Shapes the raw evidence into what the report renders: run → client → flow →
 * case kind → test case → the API calls it made.
 *
 * Deliberately separate from both the recorder and the HTML: the Playwright
 * reporter and the standalone `npm run report:api` build the same model from
 * different sources, and only this file decides what a "flow" is.
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

export interface ReportCase {
  test: ExecutedTest;
  /** registry flow id, e.g. "events.rfp_rfq" */
  flowKey: string;
  /** human flow name */
  flow: string;
  /** grouping, e.g. "events" | "masterdata" | "auth" */
  category: string;
  kind: CaseKind;
  /** what the case expects the API to do */
  expects: "accept" | "reject";
  /** why the case exists */
  because?: string;
  calls: ApiCallRecord[];
  /** calls that did not return 2xx */
  failedCalls: ApiCallRecord[];
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

export interface ClientGroup {
  clientId: string;
  companyId?: number;
  baseUrl?: string;
  flows: FlowGroup[];
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

export interface ReportModel {
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
  orphanCalls: ApiCallRecord[];
  totals: Totals;
  /** coverage gaps worth stating plainly */
  notes: string[];
  /** product findings, from config/findings.json */
  findings: Finding[];
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

/**
 * Where a test's flow and kind come from, in priority order:
 *   1. annotations the spec pushed (`flow`, `kind`, `because`, `expect`)
 *   2. the "[events.rfp_rfq]" suffix the master registry puts in every title
 *   3. the spec file path, which is how the hand-written specs are organised
 *
 * A test that declares nothing still lands somewhere sensible rather than in
 * an "unknown" bucket, but the annotations are what make the report precise.
 */
function classify(test: ExecutedTest): {
  flowKey: string;
  flow: string;
  category: string;
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

  // The registry title is "category › Title  [key]"; keep the human half.
  const flow =
    annotation("flowTitle") ??
    test.titlePath.slice(1).join(" › ").replace(/\s*\[[a-z0-9_.]+\]\s*$/i, "").trim() ??
    flowKey;

  const expects =
    (annotation("expect") as "accept" | "reject" | undefined) ??
    (kind === "negative" ? "reject" : "accept");

  return { flowKey, flow: flow || flowKey, category, kind, expects, because: annotation("because") };
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

export function buildModel(input: {
  tests: ExecutedTest[];
  calls: ApiCallRecord[];
  startedAt?: string;
  finishedAt?: string;
  environment: { clientId: string; baseUrl?: string; companyId?: number };
  notes?: string[];
}): ReportModel {
  const { byId, byPath } = callsByTest(input.calls);

  const cases: ReportCase[] = input.tests.map((test) => {
    const meta = classify(test);
    const calls = byId.get(test.id) ?? byPath.get(test.titlePath.join(" › ")) ?? [];
    return {
      test,
      ...meta,
      calls,
      failedCalls: calls.filter((c) => !c.ok),
    };
  });

  // Group by client, then flow. A call knows its own client, so a flow that ran
  // for two companies in one run does not get merged into one row.
  const clientOf = (c: ReportCase): { clientId: string; companyId?: number } => {
    const first = c.calls[0];
    return {
      clientId: first?.clientId ?? input.environment.clientId,
      companyId: first?.companyId ?? input.environment.companyId,
    };
  };

  const clientMap = new Map<string, ClientGroup>();
  for (const reportCase of cases) {
    const { clientId, companyId } = clientOf(reportCase);
    const clientKey = `${clientId}#${companyId ?? ""}`;
    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, { clientId, companyId, baseUrl: input.environment.baseUrl, flows: [] });
    }
    const client = clientMap.get(clientKey)!;

    let flow = client.flows.find((f) => f.flowKey === reportCase.flowKey);
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
      client.flows.push(flow);
    }
    flow.cases.push(reportCase);
    tally(flow.counts, reportCase.kind, reportCase.test.status);
    flow.callCount += reportCase.calls.length;
    flow.failedCallCount += reportCase.failedCalls.length;
    flow.slowestCallMs = Math.max(flow.slowestCallMs, ...reportCase.calls.map((c) => c.durationMs), 0);
  }

  for (const client of clientMap.values()) {
    client.flows.sort((a, b) => a.category.localeCompare(b.category) || a.flow.localeCompare(b.flow));
  }

  const durations = input.calls.map((c) => c.durationMs);
  const byKind = emptyKindCounts();
  for (const reportCase of cases) tally(byKind, reportCase.kind, reportCase.test.status);

  const totals: Totals = {
    tests: cases.length,
    passed: cases.filter((c) => c.test.status === "passed").length,
    failed: cases.filter((c) => c.test.status === "failed" || c.test.status === "timedOut").length,
    skipped: cases.filter((c) => c.test.status === "skipped").length,
    byKind,
    calls: input.calls.length,
    failedCalls: input.calls.filter((c) => !c.ok).length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations.length ? Math.max(...durations) : 0,
    totalApiMs: durations.reduce((a, b) => a + b, 0),
  };

  const notes = [...(input.notes ?? [])];
  for (const kind of ["positive", "negative", "edge"] as CaseKind[]) {
    if (byKind[kind].total === 0) {
      notes.push(`No ${kind} cases ran in this run — that is a coverage gap, not a pass.`);
    }
  }

  const started = input.startedAt ? new Date(input.startedAt).getTime() : undefined;
  const finished = input.finishedAt ? new Date(input.finishedAt).getTime() : undefined;

  return {
    findings: loadFindings(),
    generatedAt: new Date().toISOString(),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    wallClockMs: started && finished ? finished - started : 0,
    environment: input.environment,
    clients: [...clientMap.values()].sort((a, b) => a.clientId.localeCompare(b.clientId)),
    cases,
    orphanCalls: input.calls.filter((c) => !c.test),
    totals,
    notes,
  };
}
