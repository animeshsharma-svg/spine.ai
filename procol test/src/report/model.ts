import { ApiCallRecord, CaseKind } from "./apiLog.js";
import { Finding, loadFindings } from "./findings.js";
import { CaseOutcome, deriveOutcome, deriveStepOutcome, StepOutcome } from "./outcome.js";
import { parseSteps } from "./steps.js";

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
  /** 0-based position in the run — the order the runner actually executed it. */
  order: number;
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
  /** 1-based step number in the run, as a reader counts them */
  step: number;
  /** registry flow id, e.g. "events.rfp_rfq" */
  flowKey: string;
  /** human flow name */
  flow: string;
  /** grouping, e.g. "events" | "masterdata" | "auth" */
  category: string;
  /**
   * The stage of the module's own lifecycle this case belongs to — "Creating
   * an event", "Publishing an event". Declared by the spec; it is what cuts a
   * hundred mined cases into sections a reader can navigate.
   */
  area?: string;
  /** the case's own id in whatever catalogue it came from, e.g. "BE-2.4" */
  ref?: string;
  /**
   * The journey broken into the business steps it really is, in order — empty
   * for a case that makes a single request. See `steps.ts`.
   */
  steps: StepOutcome[];
  /**
   * Set when the journey stopped part way: its last recorded step failed, so
   * whatever the flow would have done next never ran.
   */
  stoppedAtStep?: number;
  kind: CaseKind;
  /** what the case expects the API to do */
  expects: "accept" | "reject";
  /** why the case exists */
  because?: string;
  calls: ApiCallRecord[];
  /** calls that did not return 2xx */
  failedCalls: ApiCallRecord[];
  /** expected vs actual vs verdict, derived from this run — see outcome.ts */
  outcome: CaseOutcome;
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

/**
 * A run of consecutive steps that belong to the same area — "signing in", then
 * "creating events", then "master data".
 *
 * Grouping is by adjacency, never by sorting: a section only ever covers steps
 * that really did run back to back, so the report can carry headings without
 * ever reordering the run. If the suite interleaves two areas, that shows up as
 * two sections with the same name, which is the truth.
 */
export interface RunSection {
  key: string;
  /** plain-English name for the area */
  title: string;
  /** the module the area belongs to, when the section is an area within one */
  context?: string;
  /** the spec file these steps came from */
  file: string;
  cases: ReportCase[];
  firstStep: number;
  lastStep: number;
  passed: number;
  failed: number;
  skipped: number;
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
  /** cases where the HTTP evidence contradicts the runner's verdict */
  disagreements: number;
}

export interface ReportModel {
  generatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  wallClockMs: number;
  /** environment the run went against */
  environment: { clientId: string; baseUrl?: string; companyId?: number };
  clients: ClientGroup[];
  /** every case, flat, IN THE ORDER THE RUN EXECUTED THEM — the main table */
  cases: ReportCase[];
  /** the same cases, cut into consecutive same-area runs for headings */
  sections: RunSection[];
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
  area?: string;
  ref?: string;
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

  return {
    flowKey,
    flow: flow || flowKey,
    category,
    area: annotation("area"),
    ref: annotation("ref"),
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
 * Plain-English names for the areas a run moves through, so a section heading
 * reads as a stage of the job rather than as a source directory.
 */
const SECTION_TITLES: Record<string, string> = {
  auth: "Signing in and access control",
  reads: "Reading existing data",
  events: "Creating sourcing events (RFQ, RFP, auction)",
  entrypath: "Starting procurement from a purchase request",
  masterdata: "Master data setup (categories, products, locations, teams, users)",
  vendor: "Vendors and suppliers",
  vendors: "Vendors and suppliers",
  flows: "End-to-end business journeys",
  clients: "Per-company end-to-end journeys",
  db: "Company selection from the database",
  http: "General API behaviour (methods, payloads, unknown routes)",
  cases: "Checks on the test suite itself",
  setup: "Run setup",
};

const sectionTitle = (key: string): string =>
  SECTION_TITLES[key] ??
  key.replace(/[._-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());

/**
 * Cuts the ordered case list into consecutive same-area runs.
 *
 * Adjacency, not grouping: the steps inside a section are always contiguous in
 * the run, so numbering stays 1..N with no gaps and no step ever appears out of
 * the order it executed in.
 */
function buildSections(cases: ReportCase[]): RunSection[] {
  const sections: RunSection[] = [];
  for (const reportCase of cases) {
    // Keyed on file, area AND the module's own lifecycle stage: a spec that
    // walks several areas in a row (the case table does) breaks into the areas
    // it actually walked, in order, while a spec that stays in one area stays
    // one section. A module that declares its own stages — the mined events
    // cases do — breaks further, so a hundred cases arrive as the eight stages
    // of an event's life rather than as one undifferentiated block.
    const key = `${reportCase.test.file}|${reportCase.category}|${reportCase.area ?? ""}`;
    let current = sections[sections.length - 1];
    if (!current || current.key !== key) {
      current = {
        key,
        title: reportCase.area ?? sectionTitle(reportCase.category),
        context: reportCase.area ? sectionTitle(reportCase.category) : undefined,
        file: reportCase.test.file,
        cases: [],
        firstStep: reportCase.step,
        lastStep: reportCase.step,
        passed: 0,
        failed: 0,
        skipped: 0,
      };
      sections.push(current);
    }
    current.cases.push(reportCase);
    current.lastStep = reportCase.step;
    if (reportCase.outcome.verdict === "pass") current.passed++;
    else if (reportCase.outcome.verdict === "not-run") current.skipped++;
    else current.failed++;
  }
  return sections;
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

  // RUN ORDER IS THE REPORT'S SPINE. `order` is stamped by the reporter as each
  // test ends, which under this project's `workers: 1, fullyParallel: false` is
  // the order they executed. Sorting on it here (rather than trusting array
  // position) keeps that true even if a caller assembles the list some other
  // way — and nothing downstream re-sorts the flat list.
  const ordered = [...input.tests].sort((a, b) => a.order - b.order);

  const cases: ReportCase[] = ordered.map((test, index) => {
    const meta = classify(test);
    const calls = byId.get(test.id) ?? byPath.get(test.titlePath.join(" › ")) ?? [];
    const failedCalls = calls.filter((c) => !c.ok);
    // A journey's own account of itself: the business steps it declared as it
    // went, each holding the calls made inside it.
    const steps = parseSteps(test.annotations).map((record) =>
      deriveStepOutcome(
        record,
        calls.filter((call) => call.step?.id === record.id),
      ),
    );
    const last = steps[steps.length - 1];
    return {
      test,
      step: index + 1,
      ...meta,
      steps,
      // The run only records a step that started. If the last one it recorded
      // failed, everything the flow would have done after it never happened —
      // which is a fact about coverage, so the report states it rather than
      // leaving the sequence to trail off.
      stoppedAtStep: last && last.verdict === "fail" ? last.index : undefined,
      calls,
      failedCalls,
      outcome: deriveOutcome({
        steps,
        title: test.title,
        status: test.status,
        errorMessage: test.errorMessage,
        skipReason: test.skipReason,
        annotations: test.annotations,
        kind: meta.kind,
        expects: meta.expects,
        because: meta.because,
        flow: meta.flow,
        calls,
        failedCalls,
      }),
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
    disagreements: cases.filter((c) => c.outcome.disagreement).length,
  };

  const notes = [...(input.notes ?? [])];
  if (totals.disagreements > 0) {
    notes.push(
      `${totals.disagreements} case(s) were recorded with a verdict the HTTP evidence does not support. ` +
        `They are flagged in the run table and must be explained before this report is trusted.`,
    );
  }
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
    sections: buildSections(cases),
    orphanCalls: input.calls.filter((c) => !c.test),
    totals,
    notes,
  };
}
