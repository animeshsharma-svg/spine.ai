import * as fs from 'fs';
import * as path from 'path';

/**
 * Evidence capture for every API call the suite makes.
 *
 * `httpClient` already funnels all traffic through one function, but it kept
 * results in an in-memory array — and Playwright runs each worker as its own
 * process, so that array died with the worker and never reached the report.
 * This module writes each call to disk instead, one JSONL file per process,
 * which the reporter stitches back together at the end of the run.
 *
 * Append-only JSONL rather than one JSON document: a run that crashes or is
 * killed mid-way still leaves every call it had already made, which is exactly
 * when the evidence matters most.
 */

const ROOT = path.resolve(__dirname, '..', '..');
export const CALL_LOG_DIR = path.join(ROOT, 'reports', 'api-calls');

/** Response bodies here include full datasource schemas, which run to tens of
 * kilobytes. Enough is kept to diagnose a failure without the report becoming
 * a browser-hostile 200 MB file. */
const MAX_BODY_CHARS = Number(process.env.API_LOG_MAX_BODY ?? 24_000);

/** Header names whose values never reach disk. Matched case-insensitively as a
 * substring, so `x-access-token` and `Authorization` both land. */
const SECRET_HEADERS = /token|authoriz|cookie|api[-_]?key|secret|password|credential/i;

export type CaseKind = 'positive' | 'negative' | 'edge';

export interface ApiTestContext {
  /** Playwright's own test id — the join key back to the reporter's results.
   * Needed because TestInfo.titlePath omits the project name that
   * TestCase.titlePath() includes, so the paths do not compare equal. */
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  project: string;
  /** parsed from a "[edge] ..." title prefix, when the spec uses one */
  kind?: CaseKind;
}

export interface ApiCallRecord {
  /** order within the emitting process, so a flow reads in sequence */
  seq: number;
  pid: number;
  /** wall clock at request start — the "log time" for this call */
  timestamp: string;
  clientId: string;
  /** present in multi-tenant setups; this project keys on clientId alone */
  companyId?: number;
  /** which credential the call used, where the suite distinguishes them */
  identity?: string;
  method: string;
  url: string;
  /** path + query only; the grouping key in the report */
  uri: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  /** true when the call was made deliberately without credentials */
  unauthenticated?: boolean;
  ok: boolean;
  /** 0 means the request never completed (DNS, connection, timeout) */
  status: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  /** set instead of responseBody when the payload was not JSON */
  responseText?: string;
  /** set when the body was cut to MAX_BODY_CHARS */
  truncated?: boolean;
  durationMs: number;
  /** phase of a non-test run, set via setApiLogStep — e.g. "create header" */
  step?: string;
  /** the message the API itself returned, for a call that failed */
  error?: string;
  /** error code, on a platform that returns one alongside the message */
  errorCode?: string;
  test?: ApiTestContext;
}

let seq = 0;
let logFile: string | undefined;
let currentStep: string | undefined;

/**
 * Labels the calls that follow, for runs that are not Playwright tests.
 *
 * `npm run po` funnels through the same `apiRequest`, so its calls are already
 * recorded — but with no test to attribute them to they would all land in the
 * report as orphans. Naming the phase ("create header", "line item 2") gives
 * the report the same grouping a test title would.
 */
export function setApiLogStep(label: string | undefined): void {
  currentStep = label;
}

function resolveLogFile(): string {
  if (!logFile) {
    fs.mkdirSync(CALL_LOG_DIR, { recursive: true });
    logFile = path.join(CALL_LOG_DIR, `calls-${process.pid}.jsonl`);
  }
  return logFile;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SECRET_HEADERS.test(name)
      ? `<redacted, ${String(value).length} chars>`
      : String(value);
  }
  return out;
}

/** Keeps a body reportable. Objects stay objects so the report can pretty-print
 * them; only oversized ones collapse to a truncated string. */
function capBody(body: unknown): { value: unknown; truncated: boolean } {
  if (body === undefined || body === null) return { value: body, truncated: false };
  let serialised: string;
  try {
    serialised = typeof body === 'string' ? body : JSON.stringify(body);
  } catch {
    return { value: '<body could not be serialised>', truncated: false };
  }
  if (serialised.length <= MAX_BODY_CHARS) return { value: body, truncated: false };
  return {
    value: `${serialised.slice(0, MAX_BODY_CHARS)}\n\n… truncated, ${serialised.length - MAX_BODY_CHARS} more characters`,
    truncated: true,
  };
}

/** Which test is making this call. Returns undefined outside the Playwright
 * runner — the same client code backs `npm run po`, where there is no test. */
function currentTest(): ApiTestContext | undefined {
  try {
    // Required lazily: importing the runner at module load breaks the CLI paths.
    const runner = require('@playwright/test') as typeof import('@playwright/test');
    const info = runner.test.info();
    const titlePath = info.titlePath.filter(Boolean);
    const kindMatch = info.title.match(/^\[(positive|negative|edge)\]/);
    return {
      testId: info.testId,
      title: info.title,
      titlePath,
      file: path.relative(ROOT, info.file),
      project: info.project.name,
      kind: kindMatch?.[1] as ApiTestContext['kind'],
    };
  } catch {
    return undefined;
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Records one completed (or failed) call. Never throws: a report-writing
 * problem must not turn a passing test red. */
export function recordApiCall(
  call: Omit<ApiCallRecord, 'seq' | 'pid' | 'uri' | 'test' | 'truncated'>
): ApiCallRecord | undefined {
  const request = capBody(call.requestBody);
  const response = capBody(call.responseBody ?? call.responseText);

  const record: ApiCallRecord = {
    ...call,
    seq: ++seq,
    pid: process.pid,
    uri: pathOf(call.url),
    requestHeaders: redactHeaders(call.requestHeaders),
    requestBody: request.value,
    ...(call.responseText !== undefined && call.responseBody === undefined
      ? { responseText: response.value as string }
      : { responseBody: response.value }),
    truncated: request.truncated || response.truncated || undefined,
    test: currentTest(),
    step: currentStep,
  };

  try {
    fs.appendFileSync(resolveLogFile(), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // Disk full, read-only checkout, racing rimraf — the test result stands.
  }
  return record;
}

/**
 * Reads back recorded calls, in run order.
 *
 * `onlyThisProcess` restricts the result to the calling process's own file.
 * The directory is shared global state — ANYTHING that goes through
 * `apiRequest` appends to it, including one-off scripts — so a CLI run that
 * reported the whole directory could stitch another process's calls into its
 * own report. That is exactly what produced a phantom "ungrouped calls" step
 * with unexplained 422s. A Playwright run still wants every worker's file, so
 * it leaves this off.
 */
export function readApiCalls(
  dir: string = CALL_LOG_DIR,
  opts: { onlyThisProcess?: boolean } = {}
): ApiCallRecord[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
  const own = `calls-${process.pid}.jsonl`;
  // The flag was declared and never applied, so a PO run's report quietly
  // included whatever else had written to the directory. Honour it — but only
  // when this process actually logged something, so `npm run report:po` as a
  // standalone rebuild still finds the previous run's evidence instead of
  // reporting an empty run.
  const wanted =
    opts.onlyThisProcess && names.includes(own) ? [own] : names;

  const calls: ApiCallRecord[] = [];
  for (const name of wanted) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        calls.push(JSON.parse(line) as ApiCallRecord);
      } catch {
        // A half-written final line from a killed process. Skip it.
      }
    }
  }
  return calls.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.seq - b.seq);
}

/** Where finished runs' evidence is kept, one directory per run. */
export const CALL_HISTORY_DIR = path.join(CALL_LOG_DIR, 'history');

/** How many runs of evidence to keep. Small files; twenty is weeks of work. */
const HISTORY_KEPT = 20;

/**
 * Files the run that is about to be replaced, instead of destroying it.
 *
 * The log used to be wiped at the start of every run, so the evidence behind a
 * finding was gone the moment anyone ran the suite again — which is how a P0
 * "create_row returns 500" ended up unverifiable: the only proof it ever had
 * was deleted by the next run. Archived per run, a claim can still be checked
 * a week later.
 */
function archivePreviousCalls(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const logs = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
  if (logs.length === 0) return;

  let label = '';
  try {
    label = String(
      JSON.parse(fs.readFileSync(path.join(dir, RUN_MARKER), 'utf8')).runId ?? ''
    );
  } catch {
    /* a run from before markers existed — fall back to its own timestamp */
  }
  if (!label) {
    const when = fs.statSync(path.join(dir, logs[0])).mtime.toISOString();
    label = when.replace(/[:.]/g, '-');
  }

  const dest = path.join(CALL_HISTORY_DIR, label);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of [...logs, RUN_MARKER]) {
    const from = path.join(dir, name);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(dest, name));
  }
  pruneHistory();
}

/** Keeps the newest HISTORY_KEPT runs and drops the rest. */
function pruneHistory(): void {
  if (!fs.existsSync(CALL_HISTORY_DIR)) return;
  const runs = fs
    .readdirSync(CALL_HISTORY_DIR)
    .map((name) => ({ name, at: fs.statSync(path.join(CALL_HISTORY_DIR, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const stale of runs.slice(HISTORY_KEPT)) {
    fs.rmSync(path.join(CALL_HISTORY_DIR, stale.name), { recursive: true, force: true });
  }
}

const RUN_MARKER = 'run.json';

/** Every archived run, newest first — what evidence is still on disk. */
export function listCallHistory(): Array<{ runId: string; at: string; calls: number }> {
  if (!fs.existsSync(CALL_HISTORY_DIR)) return [];
  return fs
    .readdirSync(CALL_HISTORY_DIR)
    .map((runId) => {
      const at = path.join(CALL_HISTORY_DIR, runId);
      const calls = fs
        .readdirSync(at)
        .filter((n) => n.endsWith('.jsonl'))
        .reduce(
          (n, f) => n + fs.readFileSync(path.join(at, f), 'utf8').split('\n').filter(Boolean).length,
          0
        );
      return { runId, at: fs.statSync(at).mtime.toISOString(), calls };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The calls one archived run made — the evidence behind a finding. */
export function readRunCalls(runId: string): ApiCallRecord[] {
  return readApiCalls(path.join(CALL_HISTORY_DIR, runId));
}

/**
 * Starts a fresh log for this run, keeping the last one.
 *
 * Naming the run writes a marker beside the log, so when the NEXT run archives
 * these files they are filed under the run id printed in the console — the one
 * a finding quotes.
 */
export function resetApiCallLog(
  opts: { runId?: string; dir?: string } = {}
): void {
  const dir = opts.dir ?? CALL_LOG_DIR;
  fs.mkdirSync(dir, { recursive: true });
  archivePreviousCalls(dir);
  // Only the loose logs go; the history directory beside them stays.
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.jsonl')) fs.rmSync(path.join(dir, name), { force: true });
  }
  if (opts.runId) {
    fs.writeFileSync(
      path.join(dir, RUN_MARKER),
      JSON.stringify({ runId: opts.runId, startedAt: new Date().toISOString() }, null, 2)
    );
  }
  // The next recorded call opens a new file rather than appending to the old.
  logFile = undefined;
}
