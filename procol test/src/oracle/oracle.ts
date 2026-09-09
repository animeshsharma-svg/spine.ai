import { Evidence, HttpFailure, routeShape } from "./evidence.js";

/**
 * The API-contract Oracle: decides WHAT a live HTTP call meant, from evidence
 * only — the actual status code, error code and message the backend returned,
 * compared against `backend-test-cases.json`'s documented expectation. It
 * mirrors `procol-ui-tests/src/oracle/oracle.ts` (same question: "is the
 * product broken, or is my test wrong?") but works one HTTP call at a time
 * instead of one browser journey at a time, and adds `contract_violation` —
 * a 2xx response whose shape doesn't match the documented contract, which has
 * no equivalent in the UI oracle because a browser flow either gets to the
 * next screen or it doesn't.
 */
export type VerdictKind =
  | "pass"
  | "product_defect"
  | "product_rejected_input"
  | "contract_violation"
  | "automation_defect"
  | "environment";

export type Severity = "critical" | "high" | "medium" | "low";

export interface Verdict {
  kind: VerdictKind;
  severity: Severity;
  title: string;
  rationale: string;
  smokingGun?: HttpFailure | { toast: string };
  reproduction: string[];
  actionable: boolean;
}

export interface ContractAttempt {
  /** stable id for the finding/flow, e.g. "events.contract.BE-2.1" */
  flowKey: string;
  title: string;
  severity: Severity;
  method: string;
  /** route shape (no host, ids collapsed to :id) */
  path: string;
  url: string;
  requestBody: unknown;
  expectedStatus: number;
  /** app error code the case documents (from `error.code`), if any */
  expectedErrorCode?: string;
  actualStatus: number;
  actualErrorCode?: string;
  actualErrorMessage?: string;
  actualBody: unknown;
  /** extra 2xx shape assertion; return a failure reason, or null when it holds. */
  contractCheck?: (data: unknown) => string | null;
  /**
   * Some cases only document "some 4xx, not a bare 500" rather than a
   * specific code (e.g. BE-1.12 "error response, not 500"). Set this so ANY
   * 4xx counts as matching the contract, instead of requiring the exact
   * documented status. Never applies when the case documents a specific
   * error code (`expectedErrorCode`) — that code still has to match.
   */
  anyRejectionAcceptable?: boolean;
  reproduction: string[];
}

/** Messages that mean "your test data was wrong", not "the product is broken". */
const INPUT_REJECTION =
  /required|mandatory|please (add|select|fill|choose)|invalid|not allowed|must be|insufficient parameters/i;

function truncate(v: unknown, n = 1000): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return (s ?? "").slice(0, n);
}

function buildFailure(a: ContractAttempt): HttpFailure {
  return {
    method: a.method,
    url: a.url,
    path: routeShape(a.url) || a.path,
    status: a.actualStatus,
    requestBody: a.requestBody == null ? null : truncate(a.requestBody, 4000),
    responseBody: truncate(a.actualBody, 1000),
    at: new Date().toISOString(),
  };
}

/**
 * Judge one contract-case HTTP attempt. Deterministic: same inputs, same
 * verdict, every time — no LLM in the loop.
 */
export function judgeContractCase(a: ContractAttempt): Verdict {
  const steps = a.reproduction;

  // 1. Infrastructure first: a gateway-level status is neither a product bug
  //    nor a broken test.
  if ([502, 503, 504].includes(a.actualStatus)) {
    return {
      kind: "environment",
      severity: "medium",
      title: `${a.flowKey}: environment unavailable (${a.actualStatus} on ${a.method} ${a.path})`,
      rationale: `The API returned ${a.actualStatus} for ${a.method} ${a.path} — a gateway-level status, so nothing about the product or the test can be concluded.`,
      smokingGun: buildFailure(a),
      reproduction: steps,
      actionable: false,
    };
  }
  if (a.actualStatus === 0) {
    return {
      kind: "automation_defect",
      severity: "medium",
      title: `${a.flowKey}: request never completed`,
      rationale: `${a.method} ${a.path} did not return a response (${a.actualErrorMessage ?? "network error"}) — the harness could not reach the API, not a product observation.`,
      reproduction: steps,
      actionable: false,
    };
  }

  const statusMatches = a.actualStatus === a.expectedStatus;
  const bothReject4xx =
    a.anyRejectionAcceptable &&
    !a.expectedErrorCode &&
    a.expectedStatus >= 400 &&
    a.expectedStatus < 500 &&
    a.actualStatus >= 400 &&
    a.actualStatus < 500;
  const outcomeMatches = statusMatches || bothReject4xx;
  const codeMatches = !a.expectedErrorCode || a.actualErrorCode === a.expectedErrorCode;
  const shapeFailure = a.expectedStatus < 400 && statusMatches ? a.contractCheck?.(a.actualBody) ?? null : null;

  if (outcomeMatches && codeMatches && !shapeFailure) {
    return {
      kind: "pass",
      severity: "low",
      title: `${a.flowKey}: matches the documented contract`,
      rationale: `${a.method} ${a.path} returned ${a.actualStatus}${a.expectedErrorCode ? ` with error.code ${a.actualErrorCode}` : ""}, as documented.`,
      reproduction: steps,
      actionable: false,
    };
  }

  // 2. A 5xx where the contract required success (or a documented 4xx) is a
  //    product defect, full stop — the request was built exactly as
  //    documented and the server could not survive it.
  if (a.actualStatus >= 500) {
    return {
      kind: "product_defect",
      severity: a.severity === "low" ? "medium" : a.severity,
      title: `${a.flowKey}: ${a.method} ${a.path} returns ${a.actualStatus} (expected ${a.expectedStatus})`,
      rationale:
        `The request was built exactly as documented in the backend contract, and the server answered ` +
        `${a.actualStatus} (${truncate(a.actualBody, 200)}) instead of the documented ${a.expectedStatus}. ` +
        `A server error on a well-formed request is a product defect, not bad test data.`,
      smokingGun: buildFailure(a),
      reproduction: steps,
      actionable: true,
    };
  }

  // 3. Contract said reject (4xx) but the app accepted it (2xx) — the
  //    application let through something the backend contract says it should
  //    not have. Treated as a defect: a validation/authorization gap.
  if (a.expectedStatus >= 400 && a.actualStatus < 400) {
    return {
      kind: "product_defect",
      severity: "critical",
      title: `${a.flowKey}: ${a.method} ${a.path} succeeded (${a.actualStatus}) where the contract requires rejection (${a.expectedStatus}${a.expectedErrorCode ? `, code ${a.expectedErrorCode}` : ""})`,
      rationale:
        `The documented contract requires this request to be rejected` +
        `${a.expectedErrorCode ? ` with error.code ${a.expectedErrorCode}` : ""}, but the server accepted it ` +
        `(${a.actualStatus}). Whatever guard the contract documents (validation, authorization, a state-` +
        `transition rule) did not run, or did not fire.`,
      smokingGun: buildFailure(a),
      reproduction: steps,
      actionable: true,
    };
  }

  // 4. Contract said succeed (2xx) but the app rejected it — the app's own
  //    validation fired. Usually the product working as designed against
  //    input we could not fully replicate; occasionally the product itself.
  if (a.expectedStatus < 400 && a.actualStatus >= 400) {
    const looksLikeInputRejection = INPUT_REJECTION.test(a.actualErrorMessage ?? "");
    return {
      kind: looksLikeInputRejection ? "product_rejected_input" : "product_defect",
      severity: looksLikeInputRejection ? "high" : a.severity,
      title: `${a.flowKey}: app rejected a call the contract documents as succeeding — "${a.actualErrorMessage ?? a.actualStatus}"`,
      rationale: looksLikeInputRejection
        ? `The application validated the request and refused it with "${a.actualErrorMessage}" (code ` +
          `${a.actualErrorCode ?? "n/a"}). The documented contract says this shape should succeed, so either ` +
          `the test's fixture data is missing a precondition the app now enforces, or the contract is stale.`
        : `The application returned ${a.actualStatus} ("${a.actualErrorMessage ?? "no message"}") for a request ` +
          `the documented contract says should succeed, and the message does not read as ordinary input ` +
          `validation — worth a human look.`,
      smokingGun: buildFailure(a),
      reproduction: steps,
      actionable: true,
    };
  }

  // 5. Both sides agree on pass/reject but the error CODE differs from the
  //    documented one, or a 2xx shape check failed — the app is not wrong to
  //    respond, but it doesn't match the contract on file.
  if (a.expectedStatus >= 400 && a.actualStatus >= 400 && !codeMatches) {
    return {
      kind: "contract_violation",
      severity: "medium",
      title: `${a.flowKey}: rejected as documented, but with a different error code (got ${a.actualErrorCode ?? "none"}, contract says ${a.expectedErrorCode})`,
      rationale:
        `Both the contract and the live call agree the request should be rejected, but the error code the ` +
        `server returned ("${a.actualErrorMessage ?? ""}", code ${a.actualErrorCode ?? "none"}) does not match ` +
        `the documented code ${a.expectedErrorCode}. Either the contract mining is stale or a different guard ` +
        `fired first.`,
      smokingGun: buildFailure(a),
      reproduction: steps,
      actionable: true,
    };
  }

  if (shapeFailure) {
    return {
      kind: "contract_violation",
      severity: "medium",
      title: `${a.flowKey}: 2xx response does not match the documented shape (${shapeFailure})`,
      rationale: `${a.method} ${a.path} returned ${a.actualStatus} as documented, but ${shapeFailure}.`,
      smokingGun: buildFailure(a),
      reproduction: steps,
      actionable: true,
    };
  }

  return {
    kind: "automation_defect",
    severity: "low",
    title: `${a.flowKey}: unclassified mismatch (expected ${a.expectedStatus}, got ${a.actualStatus})`,
    rationale: `Neither a clean pass nor a recognized failure pattern — recorded as-is for a human to classify.`,
    smokingGun: buildFailure(a),
    reproduction: steps,
    actionable: false,
  };
}
