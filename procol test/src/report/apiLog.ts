import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { activeStep, ActiveStep } from "./steps.js";

/**
 * Evidence capture for every API call the suite makes.
 *
 * `ApiClient.request` is the single funnel all traffic passes through, so one
 * hook there records everything. The records are written to disk rather than
 * held in memory because Playwright runs workers as separate processes — an
 * in-memory array would die with the worker and never reach the report.
 *
 * Append-only JSONL, one file per process: a run that is killed or crashes
 * mid-flow still leaves every call it had already made, which is exactly when
 * the evidence matters most.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, "..", "..");
export const CALL_LOG_DIR = join(PROJECT_ROOT, "reports", "api-calls");

/** Response bodies here include whole dashboard configurations, which run to
 * hundreds of kilobytes. Enough is kept to diagnose a failure without the
 * report becoming a browser-hostile file. */
const MAX_BODY_CHARS = Number(process.env.API_LOG_MAX_BODY ?? 24_000);

/** Header names whose values never reach disk. Matched case-insensitively as a
 * substring, so `access-token` and `lightspeed-token` both land. */
const SECRET_HEADERS = /token|authoriz|cookie|api[-_]?key|secret|password|credential|otp/i;

export type CaseKind = "positive" | "negative" | "edge";

export interface ApiTestContext {
  /** Playwright's own test id — the join key back to the reporter's results. */
  testId: string;
  title: string;
  /** NOTE: TestInfo.titlePath omits the project name that TestCase.titlePath()
   * includes, so `project` is recorded separately and the two are combined to
   * reconstruct the full path. `testId` is the reliable join key. */
  titlePath: string[];
  file: string;
  project: string;
  /** flow id from the registry, e.g. "events.rfp_rfq" — parsed from the title */
  flowKey?: string;
  /** from a "[negative]" title tag, or a `kind` annotation the spec pushed */
  kind?: CaseKind;
  /** why the case exists, from a `because` annotation */
  because?: string;
  /** what the case expects the API to do */
  expect?: "accept" | "reject";
}

export interface ApiCallRecord {
  /** order within the emitting process, so a flow reads in sequence */
  seq: number;
  pid: number;
  /** wall clock at request start — the log time for this call */
  timestamp: string;
  /** which client/company the call was made against */
  clientId: string;
  companyId?: number;
  /** buyer | vendor | evaluator | anonymous */
  identity?: string;
  method: string;
  /** absolute URL as sent */
  url: string;
  /** path + query only; the grouping key in the report */
  uri: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  ok: boolean;
  /** 0 means the request never completed (DNS, connection, timeout) */
  status: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  /** set instead of responseBody when the payload was not JSON */
  responseText?: string;
  /** set when a body was cut to MAX_BODY_CHARS */
  truncated?: boolean;
  durationMs: number;
  /** the message the API itself returned, for a call that failed */
  error?: string;
  /** error code from the platform's `{ error: { code } }` contract */
  errorCode?: string;
  test?: ApiTestContext;
  /** the journey step this call was made inside — see `steps.ts` */
  step?: ActiveStep;
}

let seq = 0;
let logFile: string | undefined;

function resolveLogFile(): string {
  if (!logFile) {
    mkdirSync(CALL_LOG_DIR, { recursive: true });
    logFile = join(CALL_LOG_DIR, `calls-${process.pid}.jsonl`);
  }
  return logFile;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
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
    serialised = typeof body === "string" ? body : JSON.stringify(body);
  } catch {
    return { value: "<body could not be serialised>", truncated: false };
  }
  if (serialised === undefined) return { value: String(body), truncated: false };
  if (serialised.length <= MAX_BODY_CHARS) return { value: body, truncated: false };
  return {
    value:
      `${serialised.slice(0, MAX_BODY_CHARS)}\n\n… truncated, ` +
      `${serialised.length - MAX_BODY_CHARS} more characters`,
    truncated: true,
  };
}

/** Which test is making this call. Returns undefined outside the Playwright
 * runner — the same ApiClient backs the DB/catalog resolvers used by scripts. */
async function currentTest(): Promise<ApiTestContext | undefined> {
  try {
    const { test } = await import("@playwright/test");
    const info = test.info();
    const annotation = (type: string): string | undefined =>
      info.annotations.find((a) => a.type === type)?.description;
    // Registry titles end with the flow key in brackets: "… [events.rfp_rfq]".
    const flowKey = info.title.match(/\[([a-z0-9_]+\.[a-z0-9_]+)\]\s*$/i)?.[1];
    const tagged = info.title.match(/^\[(positive|negative|edge)\]/i)?.[1]?.toLowerCase();
    const kind = (annotation("kind") ?? tagged) as CaseKind | undefined;
    return {
      testId: info.testId,
      title: info.title,
      titlePath: info.titlePath.filter(Boolean),
      file: relative(PROJECT_ROOT, info.file),
      project: info.project.name,
      flowKey,
      kind,
      because: annotation("because"),
      expect: annotation("expect") as ApiTestContext["expect"],
    };
  } catch {
    return undefined;
  }
}

/**
 * The synchronous slice of a record — everything known without awaiting the
 * Playwright runner. Split out so `recordApiCall` can be fire-and-forget from
 * the hot path of a request.
 */
export type ApiCallInput = Omit<
  ApiCallRecord,
  "seq" | "pid" | "uri" | "test" | "truncated" | "step"
>;

/**
 * Strips credentials out of a query string.
 *
 * `redactHeaders` only covers headers, and the suite deliberately includes a
 * case that sends the access-token as a query parameter — so without this, the
 * one case whose whole point is "credentials must not travel in the URL"
 * would publish a live credential into every report and log file it touches.
 * Applied to the recorded url and uri both, because the report renders both.
 */
export function redactQuery(url: string): string {
  try {
    // `uri` is a bare path+query, which `new URL` will not parse on its own;
    // the placeholder origin is stripped again below.
    const relative = !/^[a-z][a-z0-9+.-]*:\/\//i.test(url);
    const parsed = new URL(url, relative ? "http://redact.invalid" : undefined);
    let changed = false;
    for (const name of [...parsed.searchParams.keys()]) {
      if (!SECRET_HEADERS.test(name)) continue;
      const length = (parsed.searchParams.get(name) ?? "").length;
      // URL-safe placeholder: the angle-bracket form used for headers would
      // come back percent-encoded and unreadable inside a query string.
      parsed.searchParams.set(name, `redacted-${length}-chars`);
      changed = true;
    }
    if (!changed) return url;
    return relative ? `${parsed.pathname}${parsed.search}` : parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Credential-shaped text, anywhere in a free-text field.
 *
 * `redactHeaders` covers headers and `redactQuery` covers the URL, which left
 * one gap: the API's own error messages sometimes quote the request, so a
 * failure on a call that carried a token in its query string wrote that token
 * into `error` — a field both the report and the bug sheet print verbatim.
 */
export function redactText(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(
      /((?:access|api|auth|session|lightspeed|refresh)[-_]?token\s*[:=]\s*)[^\s&"'<>]+/gi,
      "$1<redacted>",
    )
    .replace(/((?:authorization|cookie|password|secret|otp)\s*[:=]\s*(?:bearer\s+)?)[^\s&"'<>]+/gi, "$1<redacted>");
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(redactQuery(url));
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Records one completed (or failed) call. Never throws and never rejects: a
 * report-writing problem must not turn a passing test red. */
export async function recordApiCall(call: ApiCallInput): Promise<void> {
  try {
    const stepAtCall = activeStep();
    const request = capBody(call.requestBody);
    const response = capBody(call.responseBody ?? call.responseText);

    const record: ApiCallRecord = {
      ...call,
      seq: ++seq,
      pid: process.pid,
      url: redactQuery(call.url),
      uri: pathOf(call.url),
      requestHeaders: redactHeaders(call.requestHeaders),
      requestBody: request.value,
      ...(call.responseBody === undefined && call.responseText !== undefined
        ? { responseText: response.value as string }
        : { responseBody: response.value }),
      error: redactText(call.error),
      truncated: request.truncated || response.truncated || undefined,
      // Read synchronously, before the await below: it is the step that was
      // running when the call was made, not whatever is running by the time
      // the record is written.
      step: stepAtCall,
      test: await currentTest(),
    };
    appendFileSync(resolveLogFile(), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Disk full, read-only checkout, a racing reset — the test result stands.
  }
}

/** Reads back every call from every worker, in run order. */
export function readApiCalls(dir: string = CALL_LOG_DIR): ApiCallRecord[] {
  if (!existsSync(dir)) return [];
  const calls: ApiCallRecord[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as ApiCallRecord;
        // Also on the way back in, so evidence written before `redactQuery`
        // existed cannot leak a credential into a freshly built report.
        record.url = redactQuery(record.url);
        record.uri = redactQuery(record.uri);
        // Same reason as the two above: evidence written before this existed
        // must not leak a credential into a freshly built report.
        record.error = redactText(record.error);
        calls.push(record);
      } catch {
        // A half-written final line from a killed process. Skip it.
      }
    }
  }
  return calls.sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.pid - b.pid || a.seq - b.seq,
  );
}

/** Clears the previous run's evidence, so a report never mixes two runs. */
export function resetApiCallLog(dir: string = CALL_LOG_DIR): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}
