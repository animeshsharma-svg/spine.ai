import { ApiCallRecord } from "./apiLog.js";
import { apiMessage } from "./curl.js";
import type { StepRecord } from "./steps.js";

/**
 * HOW A CASE IS JUDGED — the one place the report decides what "expected",
 * "actual" and "pass/fail" mean, in plain English, from the evidence THIS run
 * produced.
 *
 * Nothing here is written down ahead of time and replayed. Every field below
 * is computed from one of exactly three live sources:
 *
 *   1. what the test DECLARED before it ran  — the `expected` / `plain`
 *      annotations a spec pushes (see `caseSpec.ts`). This is the only
 *      static half, and it is deliberately static: an expectation you compute
 *      after seeing the answer is not an expectation.
 *   2. what the API ACTUALLY returned        — the recorded calls, their real
 *      status codes, their real error messages, their real timings.
 *   3. what the runner CONCLUDED             — Playwright's own pass/fail,
 *      which is the verdict of the `expect()` assertions inside the test.
 *
 * "Actual result" is (2) rendered as a sentence. "Result" is (3). And because
 * trusting a single source would make the report only as reliable as one
 * mechanism, the report ALSO re-derives the verdict independently from (2) —
 * `evidenceCheck` — and shouts when the two disagree (`disagreement`). A green
 * test whose evidence says otherwise is the single most dangerous thing a test
 * report can hide, so it is surfaced rather than smoothed over.
 */

export type Verdict = "pass" | "fail" | "not-run";

/** What primarily decided this case. */
export type CheckBasis =
  /** one declared request; the HTTP status class it came back with decides it */
  | "http-status"
  /** the API Oracle compared the live answer against the documented contract */
  | "oracle"
  /** a multi-step journey; the `expect()` assertions inside it decide it */
  | "assertions"
  /** gated off before it ran */
  | "not-run";

export interface EvidenceCheck {
  matched: boolean;
  /** what was compared, stated so a reader can check the arithmetic */
  detail: string;
}

export interface CaseOutcome {
  /** what this step does, in plain English */
  plain: string;
  /** what should have happened, declared before the run */
  expected: string;
  /** what did happen, read back off this run's recorded calls */
  actual: string;
  verdict: Verdict;
  basis: CheckBasis;
  /** one sentence naming how expected was compared with actual */
  basisLabel: string;
  /** the report's own independent re-derivation from the HTTP evidence */
  evidenceCheck?: EvidenceCheck;
  /** set when `evidenceCheck` contradicts `verdict` — always worth reading */
  disagreement?: string;
  /** the call the expectation is really about */
  decisiveCall?: ApiCallRecord;
}

/** The slice of a report case this module needs. Structural, to keep `model.ts`
 * free to import this file without a cycle. */
export interface OutcomeInput {
  title: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  errorMessage?: string;
  skipReason?: string;
  annotations: Array<{ type: string; description?: string }>;
  kind: "positive" | "negative" | "edge";
  expects: string;
  because?: string;
  flow: string;
  calls: ApiCallRecord[];
  failedCalls: ApiCallRecord[];
  /** the journey's own steps, where it reported any — see `steps.ts` */
  steps?: StepOutcome[];
}

const annotationOf = (input: OutcomeInput, type: string): string | undefined =>
  input.annotations.find((a) => a.type === type)?.description?.trim() || undefined;

const ms = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;

/** "201" → "201 Created". Falls back to the bare number for unusual codes. */
function statusPhrase(call: ApiCallRecord): string {
  if (call.status === 0) return "no response at all (the request never completed)";
  // Some gateways send no reason phrase and the client fills in "unknown";
  // printing that adds a word and no information.
  const reason = call.statusText && !/^unknown$/i.test(call.statusText) ? ` ${call.statusText}` : "";
  return `HTTP ${call.status}${reason}`;
}

/** Success / client error / server error, as a non-technical reader reads it. */
export function statusFamily(status: number): "success" | "redirect" | "refused" | "crashed" | "none" {
  if (status === 0) return "none";
  if (status >= 500) return "crashed";
  if (status >= 400) return "refused";
  if (status >= 300) return "redirect";
  return "success";
}

const FAMILY_WORD: Record<ReturnType<typeof statusFamily>, string> = {
  success: "accepted it",
  redirect: "redirected",
  refused: "refused it",
  crashed: "crashed on it",
  none: "never answered",
};

/**
 * A readable title. Specs that declare `plain` get theirs verbatim; everything
 * else gets its Playwright title cleaned of the machine tags the runner needs
 * but a reader does not.
 */
export function plainTitle(input: OutcomeInput): string {
  const declared = annotationOf(input, "plain");
  if (declared) return declared;

  const cleaned = input.title
    // leading "[negative]" kind tag
    .replace(/^\[(positive|negative|edge)\]\s*/i, "")
    // leading "BE-2.1 [activation]" contract-case id
    .replace(/^([A-Z]{2,}-[\d.]+)\s*\[[^\]]+\]\s*/, "")
    // trailing "[events.rfp_rfq]" registry key
    .replace(/\s*\[[a-z0-9_.-]+\]\s*$/i, "")
    // "events › Create RFP + RFQ event" — the category is already the section
    .replace(/^[^›]+›\s*/, "")
    .trim();

  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : input.title;
}

/**
 * What should have happened — declared BEFORE the run, never inferred from it.
 *
 * Priority: the spec's own words → the documented contract status a mined case
 * carries → the accept/reject/no-server-error expectation the case table
 * declares → a last-resort statement that the step's own assertions are the
 * expectation.
 */
function expectedText(input: OutcomeInput): string {
  const declared = annotationOf(input, "expected");
  if (declared) return declared;

  const contractStatus = annotationOf(input, "expectedStatus");
  const contractShape = annotationOf(input, "expectedShape");
  if (contractStatus) {
    const code = Number(contractStatus);
    const verb =
      statusFamily(code) === "success"
        ? "The API accepts the request"
        : "The API refuses the request";
    return `${verb} and answers HTTP ${contractStatus}${
      contractShape ? ` — ${contractShape}` : ""
    }, exactly as the backend contract documents.`;
  }

  const because = input.because?.trim().replace(/\.$/, "");
  const why = because ? ` ${because.charAt(0).toUpperCase()}${because.slice(1)}.` : "";
  switch (input.expects) {
    case "accept":
      return `The API accepts the request and answers with success (HTTP 2xx).${why}`;
    case "reject":
      return `The API refuses the request with a client error (HTTP 4xx) — not a success, and not a server crash.${why}`;
    case "no-server-error":
      return `The API answers deliberately — either a success or a client error, never a 5xx server error.${why}`;
    default:
      return `Every check inside this step holds.${why}`;
  }
}

/**
 * The call the expectation is really about.
 *
 * A single declared request has exactly one candidate. A journey has many, and
 * the interesting one is the first that did not return 2xx — except where a
 * non-2xx IS the expected answer, in which case it is the last call made.
 */
function decisiveCall(input: OutcomeInput, basis: CheckBasis): ApiCallRecord | undefined {
  if (input.calls.length === 0) return undefined;
  if (input.calls.length === 1) return input.calls[0];

  // A case that declares ONE request is judged on that request — which is the
  // last call it made. It may have more than one attributed to it: Playwright
  // reports a `beforeAll` hook's calls against the first test in its describe
  // block, so a shared fixture's traffic lands on whichever case ran first.
  // Taking the last call keeps that borrowed traffic out of the verdict.
  if (basis === "http-status" || basis === "oracle") return input.calls[input.calls.length - 1];

  if (input.expects === "reject" || input.expects === "no-server-error") {
    return input.calls[input.calls.length - 1];
  }
  return input.failedCalls[0] ?? input.calls[input.calls.length - 1];
}

/**
 * The actual result of a journey, told as a sequence: how far it got, and
 * where it stopped. Only the steps that STARTED are recorded, so a failure at
 * step 4 means steps 5 onwards never happened — which the sentence says
 * rather than implying by omission.
 */
function journeyActual(input: OutcomeInput): string | undefined {
  const steps = input.steps ?? [];
  if (steps.length === 0) return undefined;

  const failed = steps.find((s) => s.verdict === "fail");
  if (!failed) {
    const last = steps[steps.length - 1];
    return `All ${steps.length} steps of this journey ran and passed. ${last.actual}`;
  }
  const passed = steps.filter((s) => s.verdict === "pass").length;
  return (
    `It got ${passed} step${passed === 1 ? "" : "s"} in and stopped at step ${failed.index} — ` +
    `“${failed.name}”. ${failed.actual} Nothing after that step ran.`
  );
}

/**
 * What actually happened — read off this run, every time.
 *
 * A spec that knows more than the HTTP layer does (the contract cases, which
 * have the Oracle's verdict in hand) can push an `actual` annotation and it
 * wins. Otherwise the sentence is assembled from the real status code, the
 * real message the server returned, and the real timing.
 */
function actualText(input: OutcomeInput, decisive: ApiCallRecord | undefined, basis: CheckBasis): string {
  const declared = annotationOf(input, "actual");
  if (declared) return declared;

  if (input.status === "skipped") {
    return `Did not run — ${input.skipReason ?? "no reason recorded"}.`;
  }

  // A journey that reported its own steps can say something far more useful
  // than "3 of 14 calls did not return success": which step it got to, and
  // what stopped it.
  const journey = journeyActual(input);
  if (journey) return journey;

  const firstErrorLine = input.errorMessage
    ?.split("\n")
    .find((l) => l.trim())
    ?.trim()
    .replace(/^Error:\s*/, "");

  if (!decisive) {
    if (input.status === "passed") {
      return "Every check in this step passed. No API call was recorded for it.";
    }
    return `The step failed before it reached the API${
      firstErrorLine ? `: ${firstErrorLine}` : "."
    }`;
  }

  const message = apiMessage(decisive);
  const family = statusFamily(decisive.status);
  const head =
    `The API ${FAMILY_WORD[family]} — ${decisive.method} ${decisive.uri} returned ` +
    `${statusPhrase(decisive)} in ${ms(decisive.durationMs)}`;
  const said = message ? `, saying “${message}”` : "";

  // A journey is more than its decisive call, so say how the rest of it went.
  // A single declared request is NOT — counting hook traffic that Playwright
  // happened to attribute to it would describe calls the case never made.
  if (input.calls.length > 1 && basis === "assertions") {
    const ok = input.calls.length - input.failedCalls.length;
    const tail =
      input.failedCalls.length === 0
        ? `All ${input.calls.length} API calls in this step returned success.`
        : `${input.failedCalls.length} of ${input.calls.length} API calls did not return success (${ok} did).`;
    const assertion =
      input.status !== "passed" && firstErrorLine ? ` The step then failed on: ${firstErrorLine}` : "";
    return `${tail} ${head}${said}.${assertion}`;
  }

  const assertion =
    input.status !== "passed" && firstErrorLine && !message ? ` The step failed on: ${firstErrorLine}` : "";
  return `${head}${said}.${assertion}`;
}

/**
 * The report's OWN check, derived only from the HTTP evidence — deliberately
 * independent of Playwright's verdict, so the two can be compared.
 */
function evidenceCheckFor(
  input: OutcomeInput,
  decisive: ApiCallRecord | undefined,
  basis: CheckBasis,
): EvidenceCheck | undefined {
  if (input.status === "skipped" || !decisive) return undefined;

  const single = basis === "http-status" || basis === "oracle";

  switch (input.expects) {
    case "accept": {
      // One declared request is judged on that request. A journey is judged on
      // all of them, because any call in it failing is the journey failing.
      const matched = single ? decisive.status >= 200 && decisive.status < 300 : input.failedCalls.length === 0;
      return {
        matched,
        detail:
          single || input.calls.length === 1
            ? `Expected a 2xx; got ${decisive.status || "no response"}.`
            : `Expected every one of the ${input.calls.length} calls to return 2xx; ` +
              `${input.calls.length - input.failedCalls.length} did.`,
      };
    }
    case "reject": {
      const matched = decisive.status >= 400 && decisive.status < 500;
      return {
        matched,
        detail: `Expected a 4xx client error; got ${decisive.status || "no response"}.`,
      };
    }
    case "no-server-error": {
      const matched = decisive.status !== 0 && decisive.status < 500;
      return {
        matched,
        detail: `Expected anything below 500 (a deliberate answer); got ${
          decisive.status || "no response"
        }.`,
      };
    }
    default:
      return undefined;
  }
}

const BASIS_LABEL: Record<CheckBasis, string> = {
  "http-status":
    "One declared request. The status code the API actually returned is compared against the status class this case expects.",
  oracle:
    "The API Oracle compared the live status code and error code against the status the backend contract documents for this case.",
  assertions:
    "A multi-step journey. Every expect() inside it — API responses, and where configured the Postgres rows behind them — has to hold; the first that does not stops the journey there. Where the journey reported its own business steps, they are listed under this row in the order it walked them.",
  "not-run": "The step was gated off before it ran, so nothing was compared.",
};

export function deriveOutcome(input: OutcomeInput): CaseOutcome {
  const verdict: Verdict =
    input.status === "skipped" ? "not-run" : input.status === "passed" ? "pass" : "fail";

  const declaredBasis = annotationOf(input, "basis") as CheckBasis | undefined;
  const basis: CheckBasis =
    verdict === "not-run"
      ? "not-run"
      : declaredBasis ??
        (annotationOf(input, "expect") && input.calls.length <= 1 ? "http-status" : "assertions");

  // Basis first: it decides which call the case actually turns on, and so
  // which call both the actual-result sentence and the re-check speak about.
  const decisive = decisiveCall(input, basis);
  const evidenceCheck = evidenceCheckFor(input, decisive, basis);

  // Only a single declared request gives a clean enough signal to call a
  // contradiction. A journey legitimately makes probing calls that 404, so
  // holding it to "every call was 2xx" would manufacture false alarms — there
  // the evidence is shown as supporting context, not as a rival verdict.
  const comparable = basis === "http-status" || basis === "oracle";
  const disagreement =
    comparable && evidenceCheck && evidenceCheck.matched !== (verdict === "pass")
      ? `The run recorded this case as ${verdict.toUpperCase()}, but the HTTP evidence says otherwise — ` +
        `${evidenceCheck.detail} Treat this case as unproven until the mismatch is explained.`
      : undefined;

  return {
    plain: plainTitle(input),
    expected: expectedText(input),
    actual: actualText(input, decisive, basis),
    verdict,
    basis,
    basisLabel: BASIS_LABEL[basis],
    evidenceCheck,
    disagreement,
    decisiveCall: decisive,
  };
}

// ── journey steps ───────────────────────────────────────────────────────────

/** One business step of a journey, judged the same way a case is. */
export interface StepOutcome {
  index: number;
  /** what this step does, in plain English */
  name: string;
  /** what should have happened, stated before the step ran */
  expected: string;
  /** what did happen, read off the calls this step made */
  actual: string;
  verdict: Verdict;
  durationMs: number;
  calls: ApiCallRecord[];
  failedCalls: ApiCallRecord[];
  /** the call this step turns on */
  decisiveCall?: ApiCallRecord;
  errorMessage?: string;
}

/**
 * Turns one recorded step plus the calls made inside it into a report row.
 *
 * Same rule as a case: `expected` is what the flow committed to before the
 * step ran, `actual` is read back off this run's traffic. A sentence the flow
 * wrote about itself (`stepResult`) is used only as the fact the traffic
 * cannot state — the id of the thing it created — and the status code, message
 * and timing still come from the recording.
 */
export function deriveStepOutcome(step: StepRecord, calls: ApiCallRecord[]): StepOutcome {
  const failedCalls = calls.filter((c) => !c.ok);
  const verdict: Verdict = step.status === "passed" ? "pass" : "fail";
  // The call that decided it: the first that did not return 2xx, else the last
  // one made — a step's outcome is the answer to its last question.
  const decisive = failedCalls[0] ?? calls[calls.length - 1];

  const parts: string[] = [];
  if (decisive) {
    const family = statusFamily(decisive.status);
    const message = apiMessage(decisive);
    parts.push(
      `The API ${FAMILY_WORD[family]} — ${decisive.method} ${decisive.uri} returned ` +
        `${statusPhrase(decisive)} in ${ms(decisive.durationMs)}` +
        (message ? `, saying “${message}”` : "") +
        ".",
    );
  }
  if (step.detail) parts.push(step.detail);
  if (verdict === "fail" && step.errorMessage && step.errorMessage !== apiMessage(decisive ?? ({} as ApiCallRecord))) {
    parts.push(`The step stopped on: ${step.errorMessage}`);
  }
  if (parts.length === 0) {
    parts.push(
      verdict === "pass"
        ? "The step completed. It made no API call of its own."
        : "The step failed before it reached the API.",
    );
  }

  return {
    index: step.index,
    name: step.name,
    expected: step.expected,
    actual: parts.join(" "),
    verdict,
    durationMs: step.durationMs,
    calls,
    failedCalls,
    decisiveCall: decisive,
    errorMessage: step.errorMessage,
  };
}
