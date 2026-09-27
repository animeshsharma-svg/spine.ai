/**
 * FLOW → HUMAN TEST CASES  (Postman-in-a-report)
 *
 * A `FlowRecorder` recording (`procol-ui-tests/recordings/<name>.flow.json`)
 * is the real sequence of /api/* calls that a browser flow fired — every
 * request body and response body, with the token already stripped. This turns
 * that raw exchange into *human-readable test cases with field-level
 * validations*, the way you'd write assertions in a Postman test tab:
 *
 *   - "Responds 200"                              (status)
 *   - "Request sends `title` (string)"            (request contract)
 *   - "Response returns `uuid` (string)"          (response contract)
 *   - "`title` comes back exactly as sent"        (echo — the server persisted it)
 *
 * The derivation here is 100% deterministic — no LLM decides what to check.
 * (An LLM only *names* the case in nicer prose, in the CLI; the checklist is
 * ours.) A separate replayer (`flowReplay.ts`) can re-fire the safe (read)
 * calls with a fresh token and mark each validation passed/failed live.
 *
 * The output case shape is the SAME `JourneyCase` shape the catalog and the
 * dashboard already render, plus a `validations[]` array, so recorded flows
 * show up as proper test cases next to the written ones.
 */
import { readFileSync } from "node:fs";

// ---- recording shape (mirror of FlowRecorder's save format) ----
export interface RecordedCall {
  order: number;
  method: string;
  path: string; // routeShape'd, ids → :id
  rawPath: string; // real path incl. query — what we'd replay
  request: unknown | null;
  status: number;
  response: unknown;
  repeated: number;
  ms: number;
}
export interface Recording {
  name: string;
  recordedAt: string;
  appApiHost: string;
  totalCalls: number;
  mutations: number;
  calls: RecordedCall[];
}

// ---- validation shape (a Postman-style assertion) ----
export type ValidationKind =
  | "status"
  | "request-field"
  | "response-field"
  | "echo";
export type ValidationState = "passed" | "failed" | "skipped" | "recorded";

export interface FieldValidation {
  kind: ValidationKind;
  /** dot-path of the field, or "HTTP status". */
  target: string;
  /** human assertion, e.g. "is a string and present". */
  assertion: string;
  expected: unknown;
  /** filled by the live replayer; "recorded" = taken from the capture, not re-fired. */
  state: ValidationState;
  actual?: unknown;
  note?: string;
}

/** A recorded call turned into a case, in the catalog's JourneyCase shape + validations. */
export interface RecordedCase {
  id: string;
  layer: "api";
  group: string;
  section: string;
  sectionNo: number;
  title: string;
  why: string;
  setup: string;
  steps: string;
  expected: string;
  oracle: string;
  priority: "P0" | "P1" | "P2";
  verdict: "automate";
  routeKind: "api-replay";
  runnable: boolean;
  // API specifics
  method: string;
  path: string;
  rawPath: string;
  requestBody: unknown | null;
  recordedStatus: number;
  responseSample: unknown;
  validations: FieldValidation[];
}

export interface FlowCases {
  name: string;
  recordedAt: string;
  source: string;
  totalCalls: number;
  meaningful: number;
  context: number;
  cases: RecordedCase[];
  /** collapsed list of the noise/config calls we did not turn into cases. */
  contextCalls: Array<{ method: string; path: string; status: number }>;
}

/** GETs that every screen fires — config/bootstrap noise, not part of any flow's intent. */
const NOISE =
  /(server_current_time|dashboard_configuration|user_preferences|pending_tasks|filter_options|feature_flag|feature_config|notifications?\/count|api_pooling|authorized_permissions|company_config|\/config(\?|$)|\/me(\?|$)|current_user)/i;

const isMutation = (m: string) => /^(POST|PUT|PATCH|DELETE)$/i.test(m);

/** A call worth a test case: any mutation, or a GET that isn't boilerplate config. */
function isMeaningful(c: RecordedCall): boolean {
  if (isMutation(c.method)) return true;
  return !NOISE.test(c.rawPath);
}

const typeOf = (v: unknown): string => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
};

/** JSON that may have arrived as a string (some responses are double-encoded). */
function parseMaybe(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

/** Flatten to leaf dot-paths, sampling the first element of arrays, depth-capped. */
function leaves(
  obj: unknown,
  prefix = "",
  depth = 0,
  out: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (depth > 4 || out.length > 60) return out;
  if (obj === null || typeof obj !== "object") {
    if (prefix) out.push({ path: prefix, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      out.push({ path: `${prefix}[]`, value: [] });
    } else {
      leaves(obj[0], `${prefix}[0]`, depth + 1, out);
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    leaves(v, p, depth + 1, out);
  }
  return out;
}

/** Read a value at a dot/bracket path produced by `leaves`. */
function getPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object")
    return JSON.stringify(a) === JSON.stringify(b);
  return false;
};

/** Short, safe human rendering of a value for a case's prose. */
function show(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (typeof v === "object") return Array.isArray(v) ? `[${v.length} items]` : "{…}";
  return String(v);
}

/** Human resource name from a path, e.g. /api/v1/event_groups → "event groups". */
function resourceName(path: string): string {
  const seg = path
    .replace(/^\/api(\/v\d+)?\//, "")
    .split("?")[0]
    .split("/")
    .filter((s) => s && s !== ":id");
  return (seg[seg.length - 1] || seg[0] || "resource").replace(/_/g, " ");
}

const verb = (m: string): string =>
  ({ POST: "Create", PUT: "Replace", PATCH: "Update", DELETE: "Delete", GET: "Read" } as Record<string, string>)[
    m.toUpperCase()
  ] ?? m;

/** Derive the deterministic field-level validations for one call. */
export function deriveValidations(call: RecordedCall): FieldValidation[] {
  const v: FieldValidation[] = [];
  const req = parseMaybe(call.request);
  const res = parseMaybe(call.response);

  // 1. status
  const ok2xx = call.status >= 200 && call.status < 205;
  v.push({
    kind: "status",
    target: "HTTP status",
    assertion: ok2xx ? `responds ${call.status} (success)` : `responded ${call.status}`,
    expected: call.status,
    state: "recorded",
  });

  // 2. request contract — each field the flow sent must be accepted, correctly typed
  if (req && typeof req === "object") {
    for (const { path, value } of leaves(req)) {
      v.push({
        kind: "request-field",
        target: path,
        assertion: `sends \`${path}\` (${typeOf(value)})`,
        expected: value,
        state: "recorded",
      });
    }
  }

  // 3. response contract — key fields the flow relied on coming back
  if (res && typeof res === "object") {
    const topLeaves = leaves(res).slice(0, 12);
    for (const { path, value } of topLeaves) {
      v.push({
        kind: "response-field",
        target: path,
        assertion: `returns \`${path}\` (${typeOf(value)})`,
        expected: typeOf(value), // contract = the shape, not the exact captured value
        state: "recorded",
      });
    }
  }

  // 4. echoes — a request field that came back with the same value = the server persisted it
  if (req && typeof req === "object" && res && typeof res === "object") {
    for (const { path, value } of leaves(req)) {
      if (value === null || typeof value === "object") continue;
      // try the same path, and a common wrapper (response.data.<key>, response.<resource>.<key>)
      const leafKey = path.split(".").pop()!;
      const candidates = [path, `data.${path}`];
      // also any top-level object property that carries the leaf
      for (const cand of candidates) {
        const got = getPath(res, cand);
        if (got !== undefined && deepEqual(got, value)) {
          v.push({
            kind: "echo",
            target: cand,
            assertion: `\`${leafKey}\` comes back exactly as sent (${show(value)})`,
            expected: value,
            state: "recorded",
          });
          break;
        }
      }
    }
  }

  return v;
}

/** Deterministic (LLM-free) human framing of a call. The CLI may overwrite title/why/etc with nicer prose. */
function frameCase(call: RecordedCall, idx: number, flowName: string): RecordedCase {
  const res = parseMaybe(call.response);
  const name = resourceName(call.path);
  const action = verb(call.method);
  const validations = deriveValidations(call);
  const reqCount = validations.filter((x) => x.kind === "request-field").length;
  const echoCount = validations.filter((x) => x.kind === "echo").length;
  const mutating = isMutation(call.method);
  const id = `API-REC-${String(idx + 1).padStart(3, "0")}`;

  const title =
    action === "Read"
      ? `Read ${name}`
      : `${action} ${name.replace(/s$/, "")}`;

  const why = mutating
    ? `This ${call.method} is where the flow changes data — the point most worth asserting field-by-field: the request must be accepted and the saved record must come back correct.`
    : `The flow reads ${name} here; the screen depends on this shape, so a change in status or missing field breaks it.`;

  const steps = `Send \`${call.method} ${call.path}\`${
    call.request ? ` with the recorded body (${reqCount} field${reqCount === 1 ? "" : "s"}).` : "."
  }`;

  const expected =
    `Responds ${call.status}. ` +
    (echoCount
      ? `${echoCount} field${echoCount === 1 ? "" : "s"} the request sent come back unchanged. `
      : "") +
    `The response carries the fields the flow needs.`;

  const oracle = `Deterministic: HTTP ${call.status} and every field validation below holds (Postman-style checklist).`;

  return {
    id,
    layer: "api",
    group: "API-REC",
    section: `Recorded flow: ${flowName}`,
    sectionNo: idx + 1,
    title,
    why,
    setup: `Captured live while a browser flow ran; replayed with a fresh access token.`,
    steps,
    expected,
    oracle,
    priority: mutating ? "P0" : "P1",
    verdict: "automate",
    routeKind: "api-replay",
    runnable: call.method.toUpperCase() === "GET", // reads are safe to replay; mutations replay only under sandbox guard
    method: call.method,
    path: call.path,
    rawPath: call.rawPath,
    requestBody: parseMaybe(call.request),
    recordedStatus: call.status,
    responseSample: sample(res),
    validations,
  };
}

/** A compact, safe sample of a response for the report (no giant blobs). */
function sample(res: unknown): unknown {
  if (res === null || typeof res !== "object") return res;
  const s = JSON.stringify(res);
  if (s.length <= 1500) return res;
  // keep top-level keys with truncated values
  if (Array.isArray(res)) return { "[]": `${res.length} items`, first: sample(res[0]) };
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(res as Record<string, unknown>)) {
    out[k] =
      typeof val === "object" && val !== null
        ? Array.isArray(val)
          ? `[${(val as unknown[]).length} items]`
          : "{…}"
        : val;
  }
  return out;
}

export function loadRecording(path: string): Recording {
  return JSON.parse(readFileSync(path, "utf-8")) as Recording;
}

/** Turn a recording into human test cases with field validations. */
export function flowToCases(rec: Recording, source = ""): FlowCases {
  const cases: RecordedCase[] = [];
  const contextCalls: FlowCases["contextCalls"] = [];
  let idx = 0;
  for (const call of rec.calls) {
    if (isMeaningful(call)) {
      cases.push(frameCase(call, idx++, rec.name));
    } else {
      contextCalls.push({ method: call.method, path: call.path, status: call.status });
    }
  }
  return {
    name: rec.name,
    recordedAt: rec.recordedAt,
    source,
    totalCalls: rec.totalCalls,
    meaningful: cases.length,
    context: contextCalls.length,
    cases,
    contextCalls,
  };
}
