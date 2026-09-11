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
