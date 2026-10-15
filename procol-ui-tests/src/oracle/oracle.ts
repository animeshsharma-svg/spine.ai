import { Evidence, HttpFailure } from "./evidence.js";

/**
 * The Oracle: decides WHAT a failure means, from evidence only.
 *
 * The distinction that matters for a QA platform is not "did the test go red"
 * but "is the product broken, or is my test broken?". A run that cannot tell
 * those apart is worthless: every product bug looks like flake, and every
 * flake looks like a bug. So the verdict is computed deterministically from
 * recorded evidence — HTTP status codes, the app's own messages, the final URL
 * — and never from an LLM's impression. An LLM may later narrate a finding,
 * but it does not get to decide one.
 */
export type VerdictKind =
  | "pass"
  | "product_defect"
  | "product_rejected_input"
  | "automation_defect"
  | "environment";

export type Severity = "critical" | "high" | "medium" | "low";

export interface Verdict {
  kind: VerdictKind;
  severity: Severity;
  title: string;
  /** Why the Oracle reached this verdict — quotable in a bug report. */
  rationale: string;
  /** The single most incriminating piece of evidence. */
  smokingGun?: HttpFailure | { toast: string };
  reproduction: string[];
  /** True when a human should look at the product, not the test. */
  actionable: boolean;
}

const SERVER_ERROR = (f: HttpFailure) => f.status >= 500;
const INFRA_ERROR = (f: HttpFailure) => [502, 503, 504].includes(f.status);
const AUTH_ERROR = (f: HttpFailure) => f.status === 401 || f.status === 403;

/** Messages that mean "your test data was wrong", not "the product is broken". */
const INPUT_REJECTION = /required|mandatory|please (add|select|fill|choose)|invalid|not allowed|must be/i;

/** Failure text that points at the harness rather than the app. */
const AUTOMATION_SIGNATURE =
  /locator|selector|strict mode violation|waiting for|element is not|Timeout .* exceeded.*(click|fill|waitFor)/i;

/**
 * opts.expected: what the case itself expected the app to say — a negative
 * case's "Please fill project title!", already checked by its own step. The
 * app saying it is the case passing, so it is never the finding: one used to
 * be filed as a HIGH "rejected input" bug while the step that expected it was
 * green, and the step that really failed went unmentioned.
 */
export function judge(evidence: Evidence, failure?: Error | null, opts: { expected?: string[] } = {}): Verdict {
  const { httpFailures, toasts } = evidence;
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const expected = (opts.expected ?? []).map(norm).filter((e) => e.length >= 4);
  const wasExpected = (text: string) => {
    const t = norm(text);
    return expected.some((e) => t.includes(e) || e.includes(t));
  };
  const errorToasts = toasts.filter((t) => t.severity === "error" && !wasExpected(t.text));
  const message = failure?.message ?? "";
  const steps = evidence.notes.slice();

  if (!failure) {
    return {
      kind: "pass",
      severity: "low",
      title: `${evidence.flowKey} completed`,
      rationale: "The flow finished and every assertion held.",
      reproduction: steps,
      actionable: false,
    };
  }

  // 1. Infrastructure first: a 502/503/504 or an auth wall is not a product bug
  //    and not a broken test — re-running is the correct response.
  const infra = httpFailures.find(INFRA_ERROR);
  if (infra) {
    return {
      kind: "environment",
      severity: "medium",
      title: `${evidence.flowKey}: environment unavailable (${infra.status} on ${infra.path})`,
      rationale: `The API returned ${infra.status} for ${infra.method} ${infra.path}. A gateway-level status means the service was unreachable, so nothing about the product or the test can be concluded.`,
      smokingGun: infra,
      reproduction: steps,
      actionable: false,
    };
  }
  const auth = httpFailures.find(AUTH_ERROR);
  if (auth && /login|auth|token|session/i.test(message)) {
    return {
      kind: "environment",
      severity: "medium",
      title: `${evidence.flowKey}: authentication failed`,
      rationale: `${auth.method} ${auth.path} returned ${auth.status}. The session was not valid, so the flow never reached the feature under test.`,
      smokingGun: auth,
      reproduction: steps,
      actionable: false,
    };
  }

  // 2. A 5xx during the flow is a product defect, full stop. The client sent a
  //    request the server could not survive: no test data can justify a 500.
  const server = httpFailures.find(SERVER_ERROR);
  if (server) {
    return {
      kind: "product_defect",
      severity: "critical",
      title: `${evidence.flowKey}: ${server.method} ${server.path} returns ${server.status}`,
      rationale:
        `The application sent ${server.method} ${server.path} and the server answered ${server.status} ` +
        `(${server.responseBody.slice(0, 200)}). The request was built by the app itself from a valid ` +
        `form state — the client-side validation passed and no field was rejected — so a server error ` +
        `here is a product defect rather than bad input.`,
      smokingGun: server,
      reproduction: steps,
      actionable: true,
    };
  }

  // 3. The app refused the input in its own words. That is the product working:
  //    the finding is a gap in the test data or in an unbuilt step.
  const rejection = errorToasts.find((t) => INPUT_REJECTION.test(t.text));
  if (rejection) {
    return {
      kind: "product_rejected_input",
      severity: "high",
      title: `${evidence.flowKey}: app rejected the submission — "${rejection.text}"`,
      rationale:
        `The application validated the form and refused it with "${rejection.text}". No server error ` +
        `occurred, so the product behaved as designed and the journey is missing a step or supplying ` +
        `data the app considers invalid.`,
      smokingGun: { toast: rejection.text },
      reproduction: steps,
      actionable: true,
    };
  }

  // 4. Any other error toast: the app complained but not about our input.
  if (errorToasts.length) {
    return {
      kind: "product_defect",
      severity: "high",
      title: `${evidence.flowKey}: app reported "${errorToasts[0].text}"`,
      rationale:
        `The application raised the error "${errorToasts[0].text}" with no failing HTTP call and no ` +
        `input-validation wording, which points at the product rather than the test data.`,
      smokingGun: { toast: errorToasts[0].text },
      reproduction: steps,
      actionable: true,
    };
  }

  // 5. Nothing came from the app at all — the harness could not drive it.
  if (AUTOMATION_SIGNATURE.test(message)) {
    return {
      kind: "automation_defect",
      severity: "medium",
      title: `${evidence.flowKey}: the journey could not be driven`,
      rationale:
        `The failure is a locator or wait timing out (${message.split("\n")[0].slice(0, 200)}) with no ` +
        `failing API call and no message from the app, so the harness lost the UI rather than the ` +
        `product misbehaving.`,
      reproduction: steps,
      actionable: false,
    };
  }

  return {
    kind: "automation_defect",
    severity: "medium",
    title: `${evidence.flowKey}: failed without evidence from the app`,
    rationale:
      `The flow failed with "${message.split("\n")[0].slice(0, 200)}" while the application produced no ` +
      `error message and no failing request. Treat as a harness problem until evidence says otherwise.`,
    reproduction: steps,
    actionable: false,
  };
}
