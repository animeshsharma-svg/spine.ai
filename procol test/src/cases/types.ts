import type { ApiClient } from "../api/client.js";
import type { Catalog } from "../config.js";

/**
 * Negative and edge cases as data rather than code.
 *
 * The existing specs cover the happy path: they chain real calls and assert the
 * business outcome. What they cannot express cheaply is the other two thirds of
 * an API's contract — what it refuses, and how it behaves at the boundaries.
 * Those are uniform enough to declare in a table: one request, one expectation
 * about the response. A new case is a table entry, not a new spec file.
 */

export type CaseKind = "positive" | "negative" | "edge";

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * What the API is expected to do.
 *
 *  accept          → 2xx. The request is legitimate and must work.
 *  reject          → 4xx. The request is invalid and must be refused, by the
 *                    server, with a client error — not a 500, and not a silent
 *                    success.
 *  no-server-error → any 2xx or 4xx. Used where the correct behaviour is
 *                    genuinely undocumented: the case pins down that the server
 *                    answers *deliberately* rather than crashing, and the
 *                    report records which way it went. Honest about what is and
 *                    is not known, instead of asserting a guess.
 */
export type Expectation = "accept" | "reject" | "no-server-error";

/** Which credentials to send. */
export type AuthMode =
  /** the logged-in buyer — real, valid credentials */
  | "buyer"
  /** access-token and lightspeed-token sent empty */
  | "none"
  /** a syntactically wrong access-token */
  | "malformed"
  /** right shape, wrong app secret */
  | "wrongSecret"
  /** valid access-token, lightspeed-token omitted */
  | "noLightspeed";

export interface CaseContext {
  buyer: ApiClient;
  catalog: Catalog;
  /** unique per run — keeps created records identifiable and titles unique */
  runId: string;
  /** an event group uuid that really exists, when one could be resolved */
  existingEventUuid?: string;
}

export interface CaseRequest {
  method: Method;
  path: string;
  body?: unknown;
  /** sent verbatim — for payloads that must reach the server malformed */
  rawBody?: string;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  auth?: AuthMode;
}

export interface ApiCase {
  /** stable id — appears in the report and in the test title */
  id: string;
  /** flow this case belongs to, e.g. "auth" or "events.create" */
  flowKey: string;
  /** human flow name for the report heading */
  flowTitle: string;
  /** what the case proves, in a sentence — this becomes the test title */
  title: string;
  kind: CaseKind;
  expects: Expectation;
  /** why the case exists; printed on failure and shown in the report */
  because: string;
  /** Override the plain-English "what this step does" the report shows.
   * Most cases do not need one — `title` is already a sentence, and
   * `plainSentence` turns it into one a non-engineer reads. */
  plain?: string;
  /** Override the plain-English expected result. Same story: `expects` plus
   * `because` composes a sentence that says exactly as much as the case
   * actually asserts, so overriding is for cases that promise something more
   * specific than a status class. */
  expected?: string;
  /** set a reason to park a case without deleting it */
  skip?: string;
  /** needs an existing event group to address */
  needsExistingEvent?: boolean;
  build(ctx: CaseContext): CaseRequest;
}

/** True when `status` satisfies `expects`. */
export function statusSatisfies(expects: Expectation, status: number): boolean {
  switch (expects) {
    case "accept":
      return status >= 200 && status < 300;
    case "reject":
      return status >= 400 && status < 500;
    case "no-server-error":
      // 0 means the request never completed, which is also not an answer.
      return status !== 0 && status < 500;
  }
}

/** Reads as a sentence in an assertion message. */
export function describeExpectation(expects: Expectation): string {
  switch (expects) {
    case "accept":
      return "accept the request (2xx)";
    case "reject":
      return "refuse the request with a client error (4xx)";
    case "no-server-error":
      return "answer deliberately, with a 2xx or a 4xx — never a 5xx";
  }
}

/**
 * The case, as a non-engineer reads it in the report.
 *
 * Case titles are already written as sentences ("a negative quantity is
 * refused"), so this only has to frame them as the check they are.
 */
export function plainSentence(apiCase: ApiCase): string {
  if (apiCase.plain) return apiCase.plain;
  const title = apiCase.title.trim().replace(/\.$/, "");
  return `Check that ${title}.`;
}

/**
 * What should happen, in one sentence — composed from what the case actually
 * asserts, never from what came back.
 *
 * Deliberately no more specific than `expects`: a case that only checks the
 * status class must not claim in the report to have checked the body, or the
 * report overstates its own coverage.
 */
export function expectedSentence(apiCase: ApiCase): string {
  if (apiCase.expected) return apiCase.expected;
  const because = apiCase.because.trim().replace(/\.$/, "");
  const why = because ? ` ${because.charAt(0).toUpperCase()}${because.slice(1)}.` : "";
  switch (apiCase.expects) {
    case "accept":
      return `The API accepts the request and answers with success (HTTP 2xx).${why}`;
    case "reject":
      return `The API refuses the request with a client error (HTTP 4xx) — not a success, and not a server crash.${why}`;
    case "no-server-error":
      return `The API answers deliberately — either a success or a client error, never a 5xx server error.${why}`;
  }
}
