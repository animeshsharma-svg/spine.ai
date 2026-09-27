/**
 * FIELD-LEVEL API ASSERTIONS — Postman's "Tests" tab, for every request a
 * journey makes.
 *
 * A journey step used to be judged on one thing: did the request succeed and
 * hand back the id the next step needs. That is a smoke test. What a tester
 * does in Postman is assert on the BODY — every field present, of the right
 * type and format, money and quantities never negative, the title sent is the
 * title stored, the event read back is the event just created. This module is
 * that, for the API journey:
 *
 *   inference   `buildAssertionCatalog(samples)` reads the real responses the
 *               journey captured (one sample per run, per step) and writes a
 *               catalog of assertions — `data/api-assertions.json`. Required
 *               means "present in every response we saw"; a format is only
 *               claimed when the key names it (…uuid, …_at, email) AND every
 *               observed value conforms. It is inference from evidence, so
 *               every assertion says how many responses it was drawn from.
 *
 *   evaluation  `evaluateStepAssertions(rec, data, made)` runs the catalog's
 *               assertions for a step against the LIVE reply, on every run.
 *               Echo and cross-step checks compare against this run's own
 *               request body and ids, so they hold across runs even though
 *               every run creates a new event.
 *
 * A failed assertion does not change the step's verdict (the request still
 * did what the step asked — Postman marks the request 200 and the tests red);
 * it is reported beside it. Deterministic throughout: no LLM decides a result.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { JourneyStepRecord, StepKind } from "./journeyModel.js";
import { humanActual, type ActualFacts, type HumanCase } from "./humanize.js";

const here = dirname(fileURLToPath(import.meta.url));
export const ASSERTIONS_FILE = join(here, "..", "..", "data", "api-assertions.json");

// ── the contract ───────────────────────────────────────────────────────────

export type AssertionOp =
  | "status_2xx" // the request succeeded
  | "max_ms" // answered within value ms
  | "json_body" // the body is a JSON object or array
  | "exists" // the path resolves (for [*]: on every element)
  | "type_is" // value's JSON type ∈ value[]
  | "format" // value matches a named format
  | "one_of" // value ∈ value[]
  | "non_empty" // array has at least one element
  | "gte" // number (or numeric string) ≥ value
  | "equals_request" // response value == this run's request body at `ref`
  | "equals_made"; // response value == the id an earlier step produced, named `ref`

export type Severity = "critical" | "major" | "minor";

export interface FieldAssertion {
  id: string;
  step: StepKind;
  /** METHOD /route with ids normalised to :id */
  endpoint: string;
  /** dotted path into the response; `[*]` means every element of an array */
  path: string;
  op: AssertionOp;
  value?: unknown;
  ref?: string;
  /** one line a reader understands without knowing the op vocabulary */
  title: string;
  expected: string;
  why: string;
  severity: Severity;
  /** how many real responses the inference saw for this step */
  samples: number;
  /** The same check written as a tester would write it (`humanize.ts`). */
  human?: HumanCase;
}

export interface AssertionResult {
  id: string;
  path: string;
  op: AssertionOp;
  title: string;
  expected: string;
  severity: Severity;
  /** true passed · false failed · null could not be evaluated (e.g. the array was empty) */
  pass: boolean | null;
  actual?: string;
  /** plain-English title / expected result / what came back */
  humanTitle?: string;
  humanExpected?: string;
  humanActual?: string;
}

export interface StepAssertions {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: AssertionResult[];
}

export interface StepCatalog {
  step: StepKind;
  endpoint: string;
  samples: number;
  assertions: FieldAssertion[];
}

export interface AssertionCatalog {
  generatedAt: string;
  /** the run files the samples came from */
  fromRuns: string[];
  steps: Record<string, StepCatalog>;
}

/** Short, letters-only codes: the catalog id is `API-F<CODE>-NNN`. */
export const STEP_CODE: Record<StepKind, string> = {
  buyer_login: "BLOGIN",
  create_draft: "DRAFT",
  add_stage_rfp: "RFPSTG",
  add_stage_pricing: "PRICESTG",
  publish: "PUBLISH",
  read_back: "READ",
  vendor_login: "VLOGIN",
  vendor_open_pricing: "VPRICE",
  vendor_open_technical: "VTECH",
  tech_start: "TSTART",
  tech_answer: "TANSWER",
  tech_submit: "TSUBMIT",
  bid_create: "BIDNEW",
  bid_products: "BIDPRICE",
  bid_submit: "BIDSUB",
  surrogate_tech: "SURTECH",
  surrogate_rfq: "SURRFQ",
  counter_offer: "COUNTER",
  convert_auction: "CONVERT",
  wait_close: "WAIT",
  evaluator_login: "ELOGIN",
  eval_schema: "ESCHEMA",
  eval_score: "ESCORE",
  eval_submit: "ESUBMIT",
  award_proposal: "AWDPROP",
  award_lines: "AWDLINES",
  award_workflow: "AWDFLOW",
  award_submit: "AWDSUB",
  version: "VERSION",
};

// ── paths ──────────────────────────────────────────────────────────────────

const MISSING = Symbol("missing");
type Resolved = unknown | typeof MISSING;

function tokens(path: string): string[] {
  return path
    .replace(/\[\*\]/g, ".*")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}

/** Every value `path` reaches, with MISSING where a key was absent. */
function resolveAll(root: unknown, path: string): Resolved[] {
  let nodes: Resolved[] = [root];
  for (const t of tokens(path)) {
    const next: Resolved[] = [];
    for (const n of nodes) {
      if (n === MISSING) {
        next.push(MISSING);
      } else if (t === "*") {
        if (Array.isArray(n)) next.push(...n);
        else next.push(MISSING);
      } else if (n && typeof n === "object" && !Array.isArray(n)) {
        next.push(t in (n as Record<string, unknown>) ? (n as Record<string, unknown>)[t] : MISSING);
      } else if (Array.isArray(n) && /^\d+$/.test(t)) {
        next.push(Number(t) < n.length ? n[Number(t)] : MISSING);
      } else {
        next.push(MISSING);
      }
    }
    nodes = next;
  }
  return nodes;
}

const jsonType = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v;

const show = (v: unknown): string => {
  if (v === MISSING) return "absent";
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

// ── formats (claimed only with a key-name hint + unanimous evidence) ───────

export const FORMATS: Record<string, { test: (v: unknown) => boolean; words: string }> = {
  encodedId: {
    test: (v) => typeof v === "string" && /^[A-Za-z0-9+/_-]{6,40}={0,2}$/.test(v) && /\d|[A-Z].*[a-z]|[a-z].*[A-Z]|=/.test(v),
    words: "a Procol encoded id",
  },
  email: { test: (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), words: "an email address" },
  epochSeconds: {
    test: (v) => {
      const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
      return typeof n === "number" && Number.isInteger(n) && n >= 1e9 && n < 1e10;
    },
    words: "a Unix timestamp in seconds",
  },
  epochMs: {
    test: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1e12 && v < 1e13,
    words: "a Unix timestamp in milliseconds",
  },
  isoDate: { test: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)), words: "an ISO date" },
  url: { test: (v) => typeof v === "string" && /^https?:\/\/\S+$/.test(v), words: "an http(s) URL" },
};

const lastKey = (path: string): string => tokens(path).filter((t) => t !== "*" && !/^\d+$/.test(t)).pop() ?? "";

const HINT = {
  id: /(^|_)(uuid|id)$|Uuid$|Id$|_uuids?$/i,
  email: /e-?mail/i,
  time: /(_at|At|_time|Time|_date|Date|timestamp|_on)$|^(start|end)_?(time|date)?$/i,
  url: /(url|link|href)$/i,
  status: /(^|_)(status|state|stage|type|mode|kind|currency|unit|unit_symbol|unitSymbol)$/i,
  money: /(price|amount|total|rate|cost|value|quantity|qty|savings|budget)$/i,
  name: /(^|_)(name|title|label)$/i,
  freeText: /(description|remarks?|comment|notes?|html|content|message|body|terms|instructions?)$/i,
};

function formatFor(path: string, values: unknown[]): string | undefined {
  const k = lastKey(path);
  const vals = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!vals.length) return undefined;
  const all = (f: string) => vals.every((v) => FORMATS[f].test(v));
  if (HINT.email.test(k) && all("email")) return "email";
  if (HINT.url.test(k) && all("url")) return "url";
  if (HINT.time.test(k)) {
    if (all("epochSeconds")) return "epochSeconds";
    if (all("epochMs")) return "epochMs";
    if (all("isoDate")) return "isoDate";
  }
  if (HINT.id.test(k) && all("encodedId")) return "encodedId";
  return undefined;
}

// ── evaluation ─────────────────────────────────────────────────────────────

function getAt(root: unknown, path: string): unknown {
  const r = resolveAll(root, path);
  return r.length === 1 ? r[0] : r;
}

function judge(a: FieldAssertion, ctx: { data: unknown; status: number; ms: number; body: unknown; made: Record<string, string> }): AssertionResult {
  const base = {
    id: a.id,
    path: a.path,
    op: a.op,
    title: a.title,
    expected: a.expected,
    severity: a.severity,
    ...(a.human ? { humanTitle: a.human.title, humanExpected: a.human.expected } : {}),
  };
  /** One result: the engineer's `actual`, and the same facts as a sentence for everyone else. */
  const r = (pass: boolean | null, actual: string, facts: Omit<ActualFacts, "op" | "pass"> = {}): AssertionResult => ({
    ...base,
    pass,
    actual,
    humanActual: humanActual({ op: a.op, pass, ...facts }),
  });
  switch (a.op) {
    case "status_2xx":
      return r(ctx.status >= 200 && ctx.status < 300, `HTTP ${ctx.status}`, { status: ctx.status });
    case "max_ms":
      return r(ctx.ms <= Number(a.value), `${ctx.ms} ms`, { ms: ctx.ms });
    case "json_body": {
      const t = jsonType(ctx.data);
      return r(t === "object" || t === "array", t, { seen: ctx.data });
    }
  }
  const vals = resolveAll(ctx.data, a.path);
  if (!vals.length) return r(null, "the array it lives in was empty", { reason: "the list it belongs to came back empty" });
  const present = vals.filter((v) => v !== MISSING);
  switch (a.op) {
    case "exists": {
      const absent = vals.length - present.length;
      return r(absent === 0, absent ? `absent on ${absent} of ${vals.length}` : `present on ${vals.length}`, { total: vals.length, missing: absent });
    }
    case "type_is": {
      if (!present.length) return r(null, "absent", { reason: "the field was not in the response" });
      const allowed = a.value as string[];
      const bad = present.find((v) => !allowed.includes(jsonType(v)));
      return r(bad === undefined, bad === undefined ? jsonType(present[0]) : `${jsonType(bad)} (${show(bad)})`, { seen: present[0], bad });
    }
    case "format": {
      const f = FORMATS[String(a.value)];
      const vs = present.filter((v) => v !== null && v !== "");
      if (!f || !vs.length) return r(null, "no value to check", { reason: "it was empty, so there was no value to check" });
      const bad = vs.find((v) => !f.test(v));
      return r(bad === undefined, bad === undefined ? show(vs[0]) : show(bad), { seen: vs[0], bad, format: String(a.value) });
    }
    case "one_of": {
      // null means "not set" (an RFQ-only event has no RFP evaluation mode):
      // whether a value may be null is the type check's business, not this one.
      const set = present.filter((v) => v !== null);
      if (!set.length) return r(null, present.length ? "not set (null)" : "absent", { reason: present.length ? "it was not set (empty) for this kind of event" : "the field was not in the response" });
      const allowed = a.value as unknown[];
      const bad = set.find((v) => !allowed.some((x) => JSON.stringify(x) === JSON.stringify(v)));
      return r(bad === undefined, bad === undefined ? show(set[0]) : show(bad), { seen: set[0], bad });
    }
    case "non_empty": {
      const arr = present[0];
      return r(Array.isArray(arr) && arr.length > 0, Array.isArray(arr) ? `${arr.length} element(s)` : jsonType(arr), { count: Array.isArray(arr) ? arr.length : 0 });
    }
    case "gte": {
      const nums = present
        .filter((v) => v !== null && v !== "")
        .map((v) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v));
      if (!nums.length) return r(null, "no value to check", { reason: "it was empty, so there was no figure to check" });
      const bad = nums.find((n) => typeof n !== "number" || n < Number(a.value));
      return r(bad === undefined, bad === undefined ? show(nums[0]) : show(bad), { seen: nums[0], bad });
    }
    case "equals_request": {
      const want = getAt(ctx.body, a.ref ?? "");
      if (want === MISSING || want === undefined || Array.isArray(want))
        return r(null, "this run's request did not carry that field", { reason: "this run's request did not include that field" });
      const same = (v: unknown) => JSON.stringify(v) === JSON.stringify(want);
      // Across a list the server may reorder items, so "comes back as sent"
      // means the sent value is AMONG the returned ones, not at the same index.
      if (a.path.includes("[*]")) {
        const hit = present.some(same);
        return r(hit, hit ? `found among ${present.length} (sent ${show(want)})` : `not among ${present.length} returned (sent ${show(want)})`, {
          sent: want,
          seen: hit ? want : undefined,
          bad: hit ? undefined : present[0],
        });
      }
      const bad = present.find((v) => !same(v));
      return r(bad === undefined, bad === undefined ? `${show(present[0])} (sent ${show(want)})` : `${show(bad)} (sent ${show(want)})`, { sent: want, seen: present[0], bad });
    }
    case "equals_made": {
      const want = ctx.made[a.ref ?? ""];
      if (!want) return r(null, `no ${a.ref} was produced earlier in this run`, { reason: "the earlier step that makes that record did not run" });
      const bad = present.find((v) => String(v) !== String(want));
      return r(bad === undefined, bad === undefined ? `${show(present[0])}` : `${show(bad)} (expected ${want})`, { seen: present[0], bad, expectedMade: want });
    }
  }
  return r(null, "unknown check", { reason: "this kind of check is not known" });
}

let cached: { mtime: number; catalog: AssertionCatalog | null } | undefined;

/** The catalog on disk, re-read when the file changes; null when none exists yet. */
export function loadAssertionCatalog(): AssertionCatalog | null {
  try {
    if (!existsSync(ASSERTIONS_FILE)) return null;
    const { mtimeMs } = statSync(ASSERTIONS_FILE);
    if (cached && cached.mtime === mtimeMs) return cached.catalog;
    const catalog = JSON.parse(readFileSync(ASSERTIONS_FILE, "utf8")) as AssertionCatalog;
    cached = { mtime: mtimeMs, catalog };
    return catalog;
  } catch {
    return null;
  }
}

/**
 * Run the catalog's assertions for one step against the live reply. Returns
 * undefined when the catalog has nothing for this step (or the step never
 * fired), so a run without a catalog reports exactly what it did before.
 */
export function evaluateStepAssertions(
  rec: JourneyStepRecord,
  data: unknown,
  made: Record<string, string>,
  catalog: AssertionCatalog | null = loadAssertionCatalog(),
): StepAssertions | undefined {
  if (!catalog || !rec.call || rec.verdict === "not-run") return undefined;
  const entry = catalog.steps[rec.kind];
  if (!entry || entry.endpoint !== endpointOf(rec.call.method, rec.call.path)) return undefined;
  // A refused or broken step answers with an error body: the field checks are
  // about the success body, so only the status check is meaningful there.
  const list = rec.verdict === "worked" ? entry.assertions : entry.assertions.filter((a) => a.op === "status_2xx");
  const ctx = { data, status: rec.status ?? 0, ms: rec.ms ?? 0, body: rec.call.body, made };
  const results = list.map((a) => judge(a, ctx));
  return {
    total: results.length,
    passed: results.filter((x) => x.pass === true).length,
    failed: results.filter((x) => x.pass === false).length,
    skipped: results.filter((x) => x.pass === null).length,
    results,
  };
}

// ── what the report keeps of a response ────────────────────────────────────

/**
 * A response small enough to store in the run record: arrays trimmed to their
 * first five elements, long strings clipped, nesting capped. The evaluation
 * runs on the full reply; this copy is what the next catalog build learns from
 * and what a reader opens in the report.
 */
export function keepResponse(data: unknown, redact: (v: unknown) => unknown): unknown {
  if (data === undefined || data === null) return data ?? null;
  const trim = (v: unknown, depth: number): unknown => {
    if (depth > 8) return "…";
    if (Array.isArray(v)) {
      const out = v.slice(0, 5).map((x) => trim(x, depth + 1));
      if (v.length > 5) (out as unknown[]).push(`… ${v.length - 5} more`);
      return out;
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = trim(val, depth + 1);
      return out;
    }
    if (typeof v === "string" && v.length > 300) return `${v.slice(0, 300)}…`;
    return v;
  };
  const kept = trim(redact(data), 0);
  const size = JSON.stringify(kept)?.length ?? 0;
  return size > 60_000 ? { note: `response of ${size} characters not stored`, keys: Object.keys((kept as object) ?? {}).slice(0, 40) } : kept;
}

// ── endpoints ──────────────────────────────────────────────────────────────

/** `POST /event_groups/RHBjY3Bj/x?y=1` → `POST /event_groups/:id/x` */
export function endpointOf(method: string, path: string): string {
  const route = path
    .split("?")[0]
    .split("/")
    .map((seg) => (FORMATS.encodedId.test(seg) || /^\d+$/.test(seg) ? ":id" : seg))
    .join("/");
  return `${method.toUpperCase()} ${route}`;
}

// ── inference ──────────────────────────────────────────────────────────────

export interface ResponseSample {
  step: StepKind;
  title: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  body: unknown;
  response: unknown;
  /** ids produced by the steps before this one */
  madeBefore: Record<string, string>;
  run: string;
}

interface PathStat {
  path: string;
  parents: number;
  present: number;
  types: Set<string>;
  values: unknown[];
  nonEmptyArrays: number;
  arrays: number;
}

function walkStats(samples: unknown[]): Map<string, PathStat> {
  const stats = new Map<string, PathStat>();
  const objectSeen = new Map<string, number>();
  const stat = (p: string): PathStat => {
    let s = stats.get(p);
    if (!s) stats.set(p, (s = { path: p, parents: 0, present: 0, types: new Set(), values: [], nonEmptyArrays: 0, arrays: 0 }));
    return s;
  };
  const visit = (v: unknown, p: string, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(v)) {
      const s = stat(p);
      s.arrays++;
      if (v.length) s.nonEmptyArrays++;
      for (const el of v) if (typeof el !== "string" || !el.startsWith("… ")) visit(el, `${p}[*]`, depth + 1);
      return;
    }
    if (v && typeof v === "object") {
      objectSeen.set(p, (objectSeen.get(p) ?? 0) + 1);
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue; // dynamic keys (ids as keys) are data, not schema
        const cp = p ? `${p}.${k}` : k;
        const s = stat(cp);
        s.present++;
        s.types.add(jsonType(val));
        if (s.values.length < 40 && (val === null || typeof val !== "object")) s.values.push(val);
        visit(val, cp, depth + 1);
      }
    }
  };
  for (const smp of samples) visit(smp, "", 0);
  for (const s of stats.values()) {
    const parent = s.path.includes(".") || s.path.includes("[") ? s.path.replace(/(\.[^.[\]]+|\[\*\])$/, "") : "";
    s.parents = objectSeen.get(parent) ?? 0;
  }
  return stats;
}

/** Leaves of a request body with their dotted paths (scalars only). */
function leaves(v: unknown, p = "", out: Array<[string, unknown]> = [], depth = 0): Array<[string, unknown]> {
  if (depth > 6) return out;
  if (Array.isArray(v)) v.slice(0, 3).forEach((x, i) => leaves(x, `${p}[${i}]`, out, depth + 1));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) leaves(x, p ? `${p}.${k}` : k, out, depth + 1);
  else if (p && v !== null && v !== undefined && v !== "" && v !== "<redacted>") out.push([p, v]);
  return out;
}

const humanPath = (p: string) => `\`${p}\``;

/**
 * Turn the samples for ONE step into its assertions, most important first.
 * Caps keep a giant response (a config blob with hundreds of keys) from
 * drowning the report: ids, statuses, names, money and times are asserted
 * before anything else, and free text is never typed beyond "is a string".
 */
export function inferStep(step: StepKind, samples: ResponseSample[], cap = 45): Omit<FieldAssertion, "id">[] {
  const endpoint = endpointOf(samples[0].method, samples[0].path);
  const n = samples.length;
  const out: Omit<FieldAssertion, "id">[] = [];
  const push = (a: Omit<FieldAssertion, "id" | "step" | "endpoint" | "samples">) => out.push({ ...a, step, endpoint, samples: n });

  const oks = samples.filter((s) => s.status >= 200 && s.status < 300);
  push({ path: "", op: "status_2xx", title: "The request succeeds", expected: "HTTP 2xx", why: "Every later check reads a success body; a refusal here is the headline, not a field detail.", severity: "critical" });
  const maxMs = Math.max(...samples.map((s) => s.ms || 0));
  const budget = Math.min(30_000, Math.max(5_000, Math.ceil((maxMs * 3) / 1000) * 1000));
  push({ path: "", op: "max_ms", value: budget, title: `Answers within ${budget / 1000} s`, expected: `≤ ${budget} ms (slowest observed: ${maxMs} ms)`, why: "A regression that makes a core call several times slower is a defect even when the body is right.", severity: "minor" });

  const bodies = oks.map((s) => s.response).filter((b) => b !== null && b !== undefined && !(typeof b === "object" && (b as any).note && (b as any).keys));
  if (!bodies.length) return out;
  push({ path: "", op: "json_body", title: "The body is JSON", expected: "a JSON object or array", why: "Every field check assumes a parsed body; an HTML error page with a 200 would otherwise pass silently.", severity: "major" });

  const stats = walkStats(bodies);
  const score = (p: string): number => {
    const k = lastKey(p);
    const depth = tokens(p).length;
    let s = 10 - depth;
    if (HINT.id.test(k)) s += 40;
    if (HINT.status.test(k)) s += 30;
    if (HINT.money.test(k)) s += 30;
    if (HINT.name.test(k)) s += 20;
    if (HINT.time.test(k)) s += 15;
    if (HINT.email.test(k)) s += 15;
    if (HINT.freeText.test(k)) s -= 25;
    return s;
  };
  const fields = [...stats.values()]
    .filter((s) => s.parents > 0 && !s.types.has("undefined"))
    .sort((a, b) => score(b.path) - score(a.path) || a.path.localeCompare(b.path));

  // Echo: a scalar the request sent that comes back under the same key.
  const echoes: Omit<FieldAssertion, "id">[] = [];
  const firstOk = oks.find((s) => s.response && s.body);
  if (firstOk) {
    for (const [reqPath, val] of leaves(firstOk.body)) {
      const k = lastKey(reqPath);
      for (const f of fields) {
        if (lastKey(f.path) !== k) continue;
        // Same rule as evaluation: a list matches when the sent value is among its items.
        const matches = (g: unknown[], want: unknown) =>
          g.length > 0 && (f.path.includes("[*]") ? g.some((x) => JSON.stringify(x) === JSON.stringify(want)) : g.every((x) => JSON.stringify(x) === JSON.stringify(want)));
        const got = resolveAll(firstOk.response, f.path).filter((x) => x !== MISSING);
        if (matches(got, val)) {
          // must hold in every sample that carried the field
          const holds = oks.every((s) => {
            const want = getAt(s.body, reqPath);
            if (want === MISSING || want === undefined) return true;
            return matches(resolveAll(s.response, f.path).filter((x) => x !== MISSING), want);
          });
          if (holds) {
            echoes.push({ step, endpoint, samples: n, path: f.path, op: "equals_request", ref: reqPath, title: `${humanPath(f.path)} comes back exactly as sent`, expected: `equals the request's ${humanPath(reqPath)}`, why: "The server stored what the buyer sent — the core promise of a create or update, and what a Postman test on the echo proves.", severity: "critical" });
            break;
          }
        }
      }
    }
  }
  // Cross-step: a value equal to an id an earlier step produced.
  const cross: Omit<FieldAssertion, "id">[] = [];
  for (const f of fields) {
    if (!HINT.id.test(lastKey(f.path))) continue;
    for (const [name] of Object.entries(firstOk?.madeBefore ?? {})) {
      const holds = oks.every((s) => {
        const want = s.madeBefore[name];
        if (!want) return false;
        const g = resolveAll(s.response, f.path).filter((x) => x !== MISSING);
        return g.length > 0 && g.every((x) => String(x) === String(want));
      });
      if (holds) {
        cross.push({ step, endpoint, samples: n, path: f.path, op: "equals_made", ref: name, title: `${humanPath(f.path)} is the ${name} created earlier in the journey`, expected: `equals ${name} from an earlier step`, why: "The call acted on the record the journey built — not on some other event with a plausible-looking id.", severity: "critical" });
        break;
      }
    }
  }
  out.push(...echoes.slice(0, 12), ...cross.slice(0, 8));

  // Candidates in priority buckets — business meaning first, plumbing last —
  // so the cap trims the least informative checks, never a state or money one.
  //   1 state (one_of)  2 money (gte)  3 names  4 collections (non_empty)
  //   5 ids (exists + format)  6 times/emails/urls (format)  7 everything else
  type Cand = { pri: number; score: number; a: Omit<FieldAssertion, "id" | "step" | "endpoint" | "samples"> };
  const cands: Cand[] = [];
  const add = (pri: number, f: PathStat, a: Cand["a"]) => cands.push({ pri, score: score(f.path), a });
  for (const f of fields) {
    const k = lastKey(f.path);
    const types = [...f.types].sort();
    const nonNull = types.filter((t) => t !== "null");
    // A field that was null in every response carries no evidence about its type.
    if (!nonNull.length) continue;
    const required = f.present === f.parents && f.parents > 0;
    const isFree = HINT.freeText.test(k);
    const fmt = isFree ? undefined : formatFor(f.path, f.values);
    const isId = HINT.id.test(k);
    const bucket = HINT.status.test(k) ? 1 : HINT.money.test(k) ? 2 : HINT.name.test(k) ? 3 : isId ? 5 : fmt ? 6 : 7;
    if (required)
      add(bucket, f, { path: f.path, op: "exists", title: `${humanPath(f.path)} is present`, expected: f.path.includes("[*]") ? "on every element" : "always", why: `It was present in all ${n} real response(s); a client reading it would break if it vanished.`, severity: isId || bucket <= 2 ? "critical" : "major" });
    // A format check already implies the type, so ids and times skip the separate type check.
    if (!fmt && (nonNull.length === 1 || isFree)) {
      const allowed = isFree ? ["string", "null"] : types;
      add(bucket, f, { path: f.path, op: "type_is", value: allowed, title: `${humanPath(f.path)} is ${allowed.join(" or ")}`, expected: `JSON type ${allowed.join(" | ")}`, why: "A type change (a number turning into a string, an object into an array) breaks every consumer silently.", severity: "major" });
    }
    if (fmt)
      add(bucket, f, { path: f.path, op: "format", value: fmt, title: `${humanPath(f.path)} is ${FORMATS[fmt].words}`, expected: FORMATS[fmt].words, why: "Downstream steps and the UI parse this value; a malformed one fails far from its cause.", severity: isId ? "critical" : "major" });
    if (!isFree) {
      const distinct = [...new Set(f.values.filter((v) => v !== null && typeof v !== "object").map((v) => JSON.stringify(v)))];
      if (HINT.status.test(k) && distinct.length > 0 && distinct.length <= 3 && nonNull.every((t) => t === "string"))
        add(1, f, { path: f.path, op: "one_of", value: distinct.map((d) => JSON.parse(d)), title: `${humanPath(f.path)} is ${distinct.join(" or ")}`, expected: `one of ${distinct.join(", ")}`, why: "The state after this call decides what the next actor can do; an unexpected state is a workflow defect.", severity: "critical" });
      if (HINT.money.test(k) && f.values.some((v) => typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))))
        add(2, f, { path: f.path, op: "gte", value: 0, title: `${humanPath(f.path)} is never negative`, expected: "≥ 0", why: "A negative quantity, price or amount is never a valid business value; it points at a sign or calculation error.", severity: "critical" });
    }
    if (f.arrays > 0 && f.nonEmptyArrays === f.arrays && !f.path.includes("[*]"))
      add(4, f, { path: f.path, op: "non_empty", title: `${humanPath(f.path)} is not empty`, expected: "at least one element", why: "It carried items in every real response; an empty list here means the thing just created or requested went missing.", severity: "major" });
  }
  const taken = new Set(out.map((a) => `${a.op}|${a.path}`));
  for (const c of cands.sort((x, y) => x.pri - y.pri || y.score - x.score || x.a.path.localeCompare(y.a.path))) {
    if (out.length >= cap) break;
    const key = `${c.a.op}|${c.a.path}`;
    if (taken.has(key)) continue;
    taken.add(key);
    push(c.a);
  }
  return out;
}

/**
 * Per-step caps. The buyer sign-in reads the tenant's whole dashboard
 * configuration — hundreds of company-specific keys — so it gets a small
 * budget; the event and bid calls, where the business data lives, get more.
 */
export const STEP_CAP: Partial<Record<StepKind, number>> = { buyer_login: 20, vendor_login: 20, evaluator_login: 20 };

/**
 * Build the whole catalog. Ids are stable: an assertion keeps its id across
 * rebuilds (matched on step + op + path + ref); new ones take the next number.
 */
export function buildAssertionCatalog(samples: ResponseSample[], previous: AssertionCatalog | null, cap = 45): AssertionCatalog {
  const byStep = new Map<StepKind, ResponseSample[]>();
  for (const s of samples) {
    const list = byStep.get(s.step) ?? [];
    list.push(s);
    byStep.set(s.step, list);
  }
  const steps: Record<string, StepCatalog> = {};
  for (const [step, list] of byStep) {
    // One endpoint per step: keep the most common one (a step's route does not
    // change between event types; the odd one out is a different request).
    const counts = new Map<string, ResponseSample[]>();
    for (const s of list) {
      const e = endpointOf(s.method, s.path);
      counts.set(e, [...(counts.get(e) ?? []), s]);
    }
    const [endpoint, chosen] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const inferred = inferStep(step, chosen, STEP_CAP[step] ?? cap);
    const prev = previous?.steps[step]?.assertions ?? [];
    const keyOf = (a: { op: string; path: string; ref?: string }) => `${a.op}|${a.path}|${a.ref ?? ""}`;
    const prevIds = new Map(prev.map((a) => [keyOf(a), a.id]));
    const code = STEP_CODE[step];
    let next = Math.max(0, ...prev.map((a) => Number(a.id.split("-").pop()) || 0)) + 1;
    const assertions: FieldAssertion[] = inferred.map((a) => ({ id: prevIds.get(keyOf(a)) ?? `API-F${code}-${String(next++).padStart(3, "0")}`, ...a }));
    steps[step] = { step, endpoint, samples: chosen.length, assertions };
  }
  return { generatedAt: new Date().toISOString(), fromRuns: [...new Set(samples.map((s) => s.run))], steps };
}
