/**
 * CHECK ENGINE — turns a test case into a REAL request and a verdict.
 *
 * A Check is an executable unit: it fires an actual API call against UAT and
 * classifies the outcome against what the product SHOULD do. pass=true means
 * the product behaved correctly; pass=false means the check caught a defect
 * (too lenient, too strict, or a 5xx). This is the deterministic "running"
 * layer — the AI decides WHAT to test, this proves what actually happens.
 */
import type { TestType, CheckResult } from "../ai/types.js";
import { openClientContext } from "../executor.js";

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

/** Fire one POST and record accept/reject faithfully (never throws). */
export async function apiAttempt(api: any, path: string, body: any): Promise<CheckOutcome> {
  const t = Date.now();
  try {
    const data = await api.post(path, { body });
    return { httpStatus: 200, accepted: true, message: null, durationMs: Date.now() - t, data };
  } catch (e: any) {
    return {
      httpStatus: typeof e?.status === "number" ? e.status : null,
      accepted: false,
      message: redactSecrets(e?.message ?? String(e)),
      durationMs: Date.now() - t,
    };
  }
}

/** Fire one GET and record accept/reject (read-only; safe for live features). */
export async function apiGet(api: any, path: string): Promise<CheckOutcome> {
  const t = Date.now();
  try {
    await api.get(path);
    return { httpStatus: 200, accepted: true, message: null, durationMs: Date.now() - t };
  } catch (e: any) {
    return {
      httpStatus: typeof e?.status === "number" ? e.status : null,
      accepted: false,
      message: redactSecrets(e?.message ?? String(e)),
      durationMs: Date.now() - t,
    };
  }
}

/** Fire one PATCH and record accept/reject faithfully (never throws). */
export async function apiPatch(api: any, path: string, body: any): Promise<CheckOutcome> {
  const t = Date.now();
  try {
    await api.patch(path, { body });
    return { httpStatus: 200, accepted: true, message: null, durationMs: Date.now() - t };
  } catch (e: any) {
    return {
      httpStatus: typeof e?.status === "number" ? e.status : null,
      accepted: false,
      message: redactSecrets(e?.message ?? String(e)),
      durationMs: Date.now() - t,
    };
  }
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
  if (o.httpStatus !== null && o.httpStatus >= 500)
    return { pass: false, verdict: `server error ${o.httpStatus} — a 5xx is always a defect` };

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
      if (!got.includes(want)) {
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
    return { pass: true, verdict: `correctly rejected (${o.httpStatus ?? "err"}${o.message ? `: ${o.message}` : ""})` };
  }
  return o.accepted
    ? { pass: true, verdict: `accepted, as expected (HTTP ${o.httpStatus})` }
    : { pass: false, verdict: `REJECTED a valid input (HTTP ${o.httpStatus}${o.message ? `: ${o.message}` : ""})` };
}

/** Run one check and produce a serializable result. */
export async function runCheck(
  client: Client,
  check: Check,
  /** Handed the reply so a run can feed the next case; never persisted. */
  onData?: (data: unknown, check: Check) => void,
): Promise<CheckResult> {
  const t = Date.now();
  let outcome: CheckOutcome;
  try {
    outcome = await check.exec(client);
  } catch (e: any) {
    outcome = { httpStatus: e?.status ?? null, accepted: false, message: redactSecrets(e?.message ?? String(e)), durationMs: Date.now() - t };
  }
  const { pass, verdict, inconclusive } = classify(
    check.expected,
    outcome,
    check.expectMessage,
    (check as { expectedResult?: string }).expectedResult,
  );
  const { exec, ...meta } = check;
  const { data, ...recorded } = outcome;
  if (data !== undefined) onData?.(data, check);
  return { ...meta, ...recorded, pass, verdict, inconclusive: !!inconclusive };
}
