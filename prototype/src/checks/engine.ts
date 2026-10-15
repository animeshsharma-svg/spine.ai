/**
 * CHECK ENGINE — turns a test case into a REAL request and a verdict.
 *
 * A Check is an executable unit: it fires an actual API call against UAT and
 * classifies the outcome against what the product SHOULD do. pass=true means
 * the product behaved correctly; pass=false means the check caught a defect
 * (too lenient, too strict, or a 5xx). This is the deterministic "running"
 * layer — the AI decides WHAT to test, this proves what actually happens.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestType, CheckResult } from "../ai/types.js";
import { openClientContext } from "../executor.js";
import { appOf, appRefusal } from "./appAccess.js";

export type Client = Awaited<ReturnType<typeof openClientContext>>;

export interface CheckOutcome {
  httpStatus: number | null;
  accepted: boolean;
  message: string | null;
  durationMs: number;
  /**
   * What the call answered, kept only for the length of the run.
   *
   * A case that creates a record is the seed for the cases after it — the RFQ
   * cases build an event group, then need its uuid. Without the reply, every
   * dependent case was skipped as "unresolved placeholder(s)". It is passed to
   * the caller and deliberately NOT part of CheckResult: persisting response
   * bodies is what made a report 7.8MB.
   */
  data?: unknown;
  /**
   * A verdict the check worked out itself.
   *
   * Set by checks whose outcome is not the HTTP reply — a vendor bulk upload
   * answers 200 at once and decides every row later in a background job, so
   * `classify` on the status would pass every negative case vacuously. The
   * bulk runner (vendorBulk.ts) reads the staged rows and hands back the
   * verdict; it is used as-is.
   */
  verdictOverride?: { pass: boolean; verdict: string; inconclusive?: boolean };
  /** the app's own error code, when the refusal carried one (en-IN.yml api_errors) */
  errorCode?: string;
  /**
   * Set when the request was deliberately NOT sent, with the reason. Today:
   * the session's app is not allowed this endpoint, and sending it would get
   * a 401 that signs the session out (see appAccess.ts).
   */
  notSent?: string;
}

export interface Check {
  id: string;
  flowId: string;
  module: string;
  field?: string;
  scenario: string;
  type: TestType;
  category: string;
  priority: string;
  severity: string;
  /**
   * "accept"  — a valid input that must succeed.
   * "reject"  — an invalid input that must be refused cleanly.
   * "no-5xx"  — a ROBUSTNESS check: we don't care whether the server serves it
   *             or refuses it (a WAF returning 403 on an XSS payload is correct
   *             behaviour) — it must simply never CRASH. Only a 5xx fails.
   */
  expected: "accept" | "reject" | "no-5xx";
  /**
   * The message/code this check expects to see when it is refused. If the server
   * refuses for a DIFFERENT reason, the check did not actually exercise what it
   * claims, so it is reported as INCONCLUSIVE rather than a pass — a rejection
   * for the wrong reason is a false pass, and those quietly destroy trust.
   */
  expectMessage?: string;
  /**
   * Set when this case DOCUMENTS a specific success but is only being checked
   * for "did not crash".
   *
   * The accuracy guard in `dynamicChecks.ts` weakens `accept` to `no-5xx` for
   * endpoints whose payload cannot be built completely here — which is right,
   * or a request we could not construct would be reported as a product bug.
   * What was wrong was doing it silently: the report went on printing the
   * case's documented "200 with a trade uuid" beside a check that passes on
   * any status, so a reader had no way to know the two did not match.
   */
  weakenedTo5xxOnly?: string;
  layer: "api" | "ui";
  inputSummary: string;
  /**
   * The request this check actually fires, with every {{placeholder}} already
   * resolved.
   *
   * Kept because a report has to be reproducible: `inputSummary` is a
   * truncated line for the UI, and a reader who wants to see the defect for
   * themselves needs the real method, path and body — that is what becomes the
   * curl in the report.
   */
  request?: { method: string; path: string; body?: unknown };
  exec: (client: Client) => Promise<CheckOutcome>;
}


/**
 * NO CREDENTIAL EVER REACHES A SAVED RUN.
 *
 * When a request times out, Playwright's error carries its whole call log —
 * url, headers and all — and that string was stored verbatim as the check's
 * `message`. Run records are written to disk and committed, so a live
 * `access-token` header ended up in three files that were a `git push` away
 * from a public repository. The value is a real session: the platform builds
 * it as base64(appKey:appSecret:session) and the app accepts it.
 *
 * Redacting at the point the message is captured is the only place this can be
 * done once. Anything downstream — the report, the bug sheet, the run store —
 * then cannot leak what it never received.
 */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Header lines, however they are punctuated in a call-log dump — and query
  // parameters, which is how a token reaches a console error or a WebSocket
  // URL. Stopping at & and quote characters matters: `\S+` ran to the end of
  // the URL and took `app-version` and everything after it with it, so a line
  // came out safe but unreadable.
  [/((?:access|api|auth|session|lightspeed)[-_]?token\s*[:=]\s*)[^\s&"'<>]+/gi, "$1<redacted>"],
  [/(authorization\s*[:=]\s*(?:bearer\s+)?)\S+/gi, "$1<redacted>"],
  [/(cookie\s*[:=]\s*)[^\n]+/gi, "$1<redacted>"],
  // A bare base64 blob long enough to be a credential, wherever it appears.
  [/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, "<redacted>"],
];

/** Strip anything credential-shaped out of text that is about to be stored. */
export function redactSecrets(text: string | null | undefined): string | null {
  if (text == null) return null;
  let out = String(text);
  for (const [re, to] of SECRET_PATTERNS) out = out.replace(re, to);
  return out;
}

/**
 * NEVER ASK THE WRONG APP.
 *
 * A request the session's app is not allowed (the buyer's console token on a
 * vendor-only API) is answered 401 and the backend then marks that session
 * in_active (json_helpers.rb:31-35) — the buyer is signed out of the web
 * console, and every later call in the run answers "Authentication failed".
 * Such a request is not sent; the case says why. See appAccess.ts.
 */
function refusedApp(api: any, method: string, path: string): CheckOutcome | undefined {
  const why = appRefusal(appOf(api), method, path);
  if (!why) return undefined;
  return { httpStatus: null, accepted: false, message: null, durationMs: 0, notSent: why };
}

/** What a thrown sibling ApiError says, in the outcome's shape. */
function refusal(e: any, t: number): CheckOutcome {
  return {
    httpStatus: typeof e?.status === "number" ? e.status : null,
    accepted: false,
    message: redactSecrets(e?.message ?? String(e)),
    durationMs: Date.now() - t,
    ...(e?.code !== undefined && e?.code !== null ? { errorCode: String(e.code) } : {}),
  };
}

/** Fire one POST and record accept/reject faithfully (never throws). */
export async function apiAttempt(api: any, path: string, body: any): Promise<CheckOutcome> {
  const blocked = refusedApp(api, "POST", path);
  if (blocked) return blocked;
  const t = Date.now();
  try {
    const data = await api.post(path, { body });
    return { httpStatus: 200, accepted: true, message: null, durationMs: Date.now() - t, data };
  } catch (e: any) {
    return refusal(e, t);
  }
}

/** Fire one GET and record accept/reject (read-only; safe for live features). */
export async function apiGet(api: any, path: string): Promise<CheckOutcome> {
  const blocked = refusedApp(api, "GET", path);
  if (blocked) return blocked;
  const t = Date.now();
  try {
    await api.get(path);
    return { httpStatus: 200, accepted: true, message: null, durationMs: Date.now() - t };
  } catch (e: any) {
    return refusal(e, t);
  }
}

/** Fire one PATCH and record accept/reject faithfully (never throws). */
export async function apiPatch(api: any, path: string, body: any): Promise<CheckOutcome> {
  const blocked = refusedApp(api, "PATCH", path);
  if (blocked) return blocked;
  const t = Date.now();
  try {
    await api.patch(path, { body });
    return { httpStatus: 200, accepted: true, message: null, durationMs: Date.now() - t };
  } catch (e: any) {
    return refusal(e, t);
  }
}

// ── the app's own error codes ──────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const ERRORS_FILE = join(here, "..", "..", "data", "app-errors.json");
let errorBook: Record<string, string> | null | undefined;

/** The app's message for an error code (config/locales/en-IN.yml, snapshotted by scripts/build-app-access.ts). */
export function appErrorMessage(code: string | number | undefined | null): string | undefined {
  if (code === undefined || code === null || code === "") return undefined;
  if (errorBook === undefined) {
    try {
      errorBook = existsSync(ERRORS_FILE) ? (JSON.parse(readFileSync(ERRORS_FILE, "utf8")).errors as Record<string, string>) : null;
    } catch {
      errorBook = null;
    }
  }
  return errorBook?.[String(code)];
}

/**
 * The error codes a case's documented expectation names as THE answer.
 *
 * Read only from the lead clause — up to the first dash, semicolon or full
 * stop — so a code mentioned in passing ("…when the setting is off the answer
 * is 1127 first") is never taken for the expected one. "HTTP 422, code 533 or
 * 455 — …" gives [533, 455].
 */
/** The lead clause of a documented expectation — the answer it names, before any explanation. */
export function leadClause(documented: string | undefined): string {
  return (documented ?? "").split(/\s[—–-]\s|;|\.\s|\(app\//)[0];
}

export function documentedCodes(documented: string | undefined): string[] {
  if (!documented) return [];
  const lead = leadClause(documented);
  const out: string[] = [];
  for (const m of lead.matchAll(/\bcodes?\s*[:=]?\s*((?:\d{1,4})(?:\s*(?:,|or|\/|and)\s*\d{1,4})*)/gi))
    for (const d of m[1].match(/\d{1,4}/g) ?? []) if (!out.includes(d)) out.push(d);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[.!\s]+$/, "").replace(/\s+/g, " ").trim();

/**
 * Did the app answer with one of the codes the case documents? By the code in
 * the reply when it carried one, else by the reply's message being exactly
 * that code's message in the app's own locale file.
 */
function answeredDocumentedCode(documented: string | undefined, o: CheckOutcome): string | undefined {
  const codes = documentedCodes(documented);
  if (!codes.length) return undefined;
  if (o.errorCode && codes.includes(o.errorCode)) return o.errorCode;
  if (!o.message) return undefined;
  const got = norm(o.message);
  return codes.find((c) => {
    const m = appErrorMessage(c);
    return !!m && norm(m) === got;
  });
}

/**
 * Messages that say THE RECORD UNDER TEST was unusable — not that the case's
 * own input was wrong.
 *
 * Same problem as the 401 below, one layer in: the endpoint refused before it
 * ever looked at what this case was varying, so the refusal is evidence about
 * the fixture, not about the product's validation. A whole RFQ stage suite can
 * come back 422 "Order not active" and score green on every `no-5xx` case,
 * having tested nothing at all.
 *
 * Deliberately narrow. A bare /not found/ would swallow the many cases whose
 * whole point is that a fabricated uuid IS refused with a not-found — those are
 * working, and `anticipates` below keeps them passing.
 */
const FIXTURE_UNUSABLE =
  /\border not active\b|\bproject does not exist\b|\bevent ?group (?:does not exist|not found)\b|\bno longer active\b|\btrade not found\b/i;

/** Did the case DOCUMENT this outcome? Then it is the case working, not a
 * broken precondition. */
function anticipates(documented: string | undefined, message: string): boolean {
  if (!documented) return false;
  const want = documented.toLowerCase();
  // Compare on the distinctive phrase the server actually used.
  const phrase = message.toLowerCase().replace(/[.!]$/, "").trim();
  return phrase.length > 6 && want.includes(phrase);
}

export function classify(
  expected: "accept" | "reject" | "no-5xx",
  o: CheckOutcome,
  expectMessage?: string,
  /** the case's own documented expected result, verbatim */
  documented?: string,
): { pass: boolean; verdict: string; inconclusive?: boolean } {
  if (o.notSent)
    return {
      pass: false,
      inconclusive: true,
      verdict:
        `not sent — ${o.notSent}. The app answers such a call 401 and then signs the session out ` +
        `(json_helpers.rb:31-35), which would log the buyer out of the web console and turn every later case ` +
        `into a 401. Nothing was tested; this case has to run as the user the endpoint belongs to.`,
    };
  if (o.httpStatus !== null && o.httpStatus >= 500)
    return { pass: false, verdict: `server error ${o.httpStatus} — a 5xx is always a defect` };
  // Which of the case's documented answers came back, if any (by error code).
  // Used to tell a documented "not found / not active" from a broken fixture,
  // and to see past a message lifted from the explanation rather than the
  // answer. A case whose lead clause quotes its message is still held to it.
  const docCode = !o.accepted ? answeredDocumentedCode(documented, o) : undefined;

  // 401 = we never got through the door. The endpoint's validation, business
  // rules and permissions were never exercised, so the check proves nothing —
  // in either direction. Counting it as a pass (because "expected: reject" and
  // it was indeed refused) is a vacuous green, which is worse than no result.
  if (o.httpStatus === 401)
    return {
      pass: false,
      inconclusive: true,
      verdict:
        `authentication failed (401) — the request never reached this endpoint's logic, ` +
        `so nothing was verified. This client's session/app-key likely has no access to it.`,
    };
  // The record this case acts on was not usable, so the endpoint never reached
  // the behaviour under test. Same reasoning as the 401 above: a refusal that
  // says "the thing you named is not there / not active" is a fact about the
  // fixture, and scoring it green is a vacuous pass.
  if (
    o.message &&
    FIXTURE_UNUSABLE.test(o.message) &&
    !anticipates(documented, o.message) &&
    !docCode &&
    !(expectMessage && o.message.toLowerCase().includes(expectMessage.toLowerCase()))
  ) {
    return {
      pass: false,
      inconclusive: true,
      verdict:
        `the record under test was not usable — the API answered "${o.message}" ` +
        `(HTTP ${o.httpStatus ?? "err"}), so this endpoint never reached what the case checks. ` +
        `Nothing was proved either way; fix the precondition (the event this case acts on) and re-run.`,
    };
  }

  // A bare 404 — nothing from the app but the status — is the route not being
  // there for this method and path, not a refusal of what the case tests: four
  // QCS cases POSTed to an endpoint that only takes PATCH, got 404, and scored
  // "correctly rejected". Unless the case documents a not-found answer, the
  // endpoint's logic was never reached and nothing was tested.
  if (o.httpStatus === 404 && (!o.message || /^HTTP 404\b/i.test(o.message)) && !/\b404\b|not found|does not exist/i.test(documented ?? ""))
    return {
      pass: false,
      inconclusive: true,
      verdict:
        `the server answered 404 with no message — there is no route for this method and path (it may take another ` +
        `method, e.g. PATCH), so the request never reached the rule the case checks. Nothing was tested; fix the case's method or path.`,
    };

  // Robustness: survived hostile input without crashing. Served or refused are
  // both fine — that's the server's choice, not a defect.
  if (expected === "no-5xx")
    return {
      pass: true,
      verdict: o.accepted
        ? `handled safely — served the request (HTTP ${o.httpStatus})`
        : `handled safely — refused cleanly (HTTP ${o.httpStatus ?? "err"}), no crash`,
    };
  const rejected = !o.accepted;
  if (expected === "reject") {
    if (!rejected)
      return { pass: false, verdict: `ACCEPTED input that should have been rejected (HTTP ${o.httpStatus})` };
    // Rejected — but was it for the RIGHT reason?
    if (expectMessage && o.message) {
      const got = o.message.toLowerCase();
      const want = expectMessage.toLowerCase();
      // The message held against the reply is lifted from the case's text by
      // the case runner, and an apostrophe ("the event's company in the
      // caller's …") can make it a fragment of the explanation instead of the
      // answer. When that fragment is NOT in the lead clause and the reply is
      // the very code the lead clause names, the lead clause wins.
      const incidental = !!docCode && !leadClause(documented).toLowerCase().includes(want);
      if (!got.includes(want) && !incidental) {
        return {
          pass: false,
          inconclusive: true,
          verdict:
            `rejected, but for a DIFFERENT reason — this check did not exercise what it claims. ` +
            `Expected "${expectMessage}", got "${o.message}". Usually means a precondition ` +
            `(config or data) isn't met on this client, not a product bug.`,
        };
      }
    }
    return {
      pass: true,
      verdict:
        `correctly rejected (${o.httpStatus ?? "err"}${o.message ? `: ${o.message}` : ""})` +
        (docCode && o.message && (FIXTURE_UNUSABLE.test(o.message) || (expectMessage && !o.message.toLowerCase().includes(expectMessage.toLowerCase())))
          ? ` — code ${docCode}, the answer the case documents`
          : ""),
    };
  }
  return o.accepted
    ? { pass: true, verdict: `accepted, as expected (HTTP ${o.httpStatus})` }
    : { pass: false, verdict: `REJECTED a valid input (HTTP ${o.httpStatus}${o.message ? `: ${o.message}` : ""})` };
}

const RETRY_PAUSE_MS = 3_000;
/** The connection was never made: nothing reached the app, so sending again cannot do anything twice. */
const NOT_CONNECTED = /\b(ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|EAI_AGAIN|ENOTFOUND)\b/;
/** The call went out and no answer came back in time. */
const TIMED_OUT = /Timeout \d+ms exceeded|\bETIMEDOUT\b|socket hang up|\bECONNRESET\b/i;

/**
 * Did this outcome never reach the app? Then it is no verdict at all, and the
 * check deserves one more try. Only where a second send is harmless: a
 * connection that was never made (any method), or a READ that timed out. A
 * write that timed out may have been applied, so it is never re-sent. A check
 * with its own verdict (the bulk runner) is never re-run here.
 */
function neverReached(o: CheckOutcome, method: string | undefined): boolean {
  if (o.verdictOverride || o.notSent || o.httpStatus !== null || o.accepted) return false;
  const m = String(o.message ?? "");
  if (NOT_CONNECTED.test(m)) return true;
  return String(method ?? "").toUpperCase() === "GET" && TIMED_OUT.test(m);
}

/**
 * THE CASE WAS WRITTEN WITH ANOTHER CLIENT'S DATA.
 *
 * Hundreds of written case bodies carry PROCOL DEMO's unit ("KG") literally.
 * Demo Account 2 has no such unit, so the app refuses them with “The unit kg
 * is not present” before it reaches the rule under test. Read as a product
 * answer that was a false FAIL on accept cases (EDGE-STG-046 and -053, "REJECTED
 * a valid input") and a vacuous pass on reject cases. It is neither: the
 * client's data did not fit the case. Unless the case documents that refusal.
 */
const UNIT_NOT_PRESENT = /\bthe units? (.+?) (?:is|are) not present\b/i;
export function clientDataMismatch(check: Check, o: CheckOutcome): { pass: boolean; verdict: string; inconclusive: boolean } | undefined {
  if (o.accepted || !o.message || (o.httpStatus !== null && o.httpStatus >= 500)) return undefined;
  const m = o.message.match(UNIT_NOT_PRESENT);
  if (!m) return undefined;
  const unit = m[1].trim().toLowerCase();
  const documented = (check as { expectedResult?: string }).expectedResult;
  if (anticipates(documented, o.message) || /not present/i.test(documented ?? "")) return undefined;
  if (check.expectMessage && o.message.toLowerCase().includes(check.expectMessage.toLowerCase())) return undefined;
  // Only when the unit is one the case's OWN request sent.
  const sent = new Set<string>();
  const walk = (v: unknown, key = "") => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === "string" && /unit|suffix|postfix/i.test(key)) sent.add(v.trim().toLowerCase());
  };
  walk(check.request?.body);
  if (!sent.has(unit)) return undefined;
  return {
    pass: false,
    inconclusive: true,
    verdict:
      `this client has no unit “${m[1].trim()}”, which the case's request uses — the app refused it for that ` +
      `(“${o.message}”, HTTP ${o.httpStatus ?? "err"}) before reaching the rule under test. The case was written with ` +
      `another client's unit; nothing was proved either way.`,
  };
}

/** Run one check and produce a serializable result. */
export async function runCheck(
  client: Client,
  check: Check,
  /** Handed the reply so a run can feed the next case; never persisted. */
  onData?: (data: unknown, check: Check) => void,
): Promise<CheckResult> {
  const t = Date.now();
  const attempt = async (): Promise<CheckOutcome> => {
    try {
      return await check.exec(client);
    } catch (e: any) {
      return { httpStatus: e?.status ?? null, accepted: false, message: redactSecrets(e?.message ?? String(e)), durationMs: Date.now() - t };
    }
  };
  let outcome = await attempt();
  // A request that never reached the app is not an answer. Once, after a short
  // pause, it is sent again — see neverReached for exactly when that is safe.
  const lost = neverReached(outcome, check.request?.method);
  if (lost) {
    await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
    const again = await attempt();
    outcome = neverReached(again, check.request?.method)
      ? { ...again, message: `${again.message ?? ""} (also on a second try ${RETRY_PAUSE_MS / 1000} s later — the app could not be reached)`.trim() }
      : again;
  }
  const { pass, verdict, inconclusive } =
    outcome.verdictOverride ??
    clientDataMismatch(check, outcome) ??
    classify(
      check.expected,
      outcome,
      check.expectMessage,
      (check as { expectedResult?: string }).expectedResult,
    );
  const { exec, ...meta } = check;
  const { data, verdictOverride: _v, ...recorded } = outcome;
  if (data !== undefined) onData?.(data, check);
  return { ...meta, ...recorded, pass, verdict, inconclusive: !!inconclusive };
}
