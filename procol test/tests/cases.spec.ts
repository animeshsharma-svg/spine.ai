import { test, expect } from "../src/fixtures.js";

import { AuthTokens } from "../src/api/client.js";
import { CONFIG, CONST } from "../src/config.js";
import { buildAccessToken } from "../src/auth/token.js";
import { Endpoints } from "../src/api/endpoints.js";
import { CASES, MALFORMED_ACCESS_TOKEN } from "../src/cases/registry.js";
import {
  ApiCase,
  AuthMode,
  CaseContext,
  describeExpectation,
  statusSatisfies,
} from "../src/cases/types.js";

/**
 * THE CASE RUNNER — one test per entry in `src/cases/registry.ts`.
 *
 * The positive flows live in `master.spec.ts` and the hand-written specs; this
 * file runs the negative and edge table. Each case is one request and one
 * expectation about the response, so the runner is the same three lines for all
 * of them: build the request, send it without throwing, judge the status.
 *
 * Every case annotates itself (kind, flow, why it exists, what it expects), and
 * the report reads those annotations — so a case added to the table shows up
 * correctly grouped without touching the reporter.
 */

/**
 * Header overrides per credential mode.
 *
 * Empty-string headers are how a "missing" credential is expressed: Playwright
 * omits an undefined header but sends an empty one, and an empty credential is
 * exactly what the server must reject.
 */
function authHeaders(mode: AuthMode | undefined, tokens: AuthTokens): Record<string, string> {
  switch (mode ?? "buyer") {
    case "buyer":
      return {};
    case "none":
      return { "access-token": "", "lightspeed-token": "" };
    case "malformed":
      return { "access-token": MALFORMED_ACCESS_TOKEN };
    case "wrongSecret": {
      // Rebuild a structurally valid token around the real session secret but
      // the wrong app secret, so only the secret check can reject it.
      const session = Buffer.from(tokens.accessToken, "base64").toString("utf-8").split(":")[2] ?? "";
      return {
        "access-token": buildAccessToken(CONST.consoleKey, "not-the-app-secret", session),
      };
    }
    case "noLightspeed":
      return { "lightspeed-token": "" };
  }
}

test.describe("negative & edge cases (config-driven)", () => {
  // Cases that address a real record need one to address. Resolved once from
  // the account's own data rather than created, so the table stays read-mostly.
  let existingEventUuid: string | undefined;

  test.beforeAll(async ({ buyerApi }) => {
    const list = await buyerApi
      .get<{ data: Array<{ event_details?: { event_uuid?: string } }> }>(Endpoints.orders())
      .catch(() => undefined);
    existingEventUuid = list?.data
      ?.map((po) => po.event_details?.event_uuid)
      .find((id): id is string => Boolean(id));
  });

  for (const apiCase of CASES) {
    test(`[${apiCase.kind}] ${apiCase.title}  [${apiCase.id}]`, async ({ buyerApi }) => {
      // Read by the reporter to group and label this case. Pushed before any
      // skip so a parked case still appears in the report under its own kind.
      test.info().annotations.push(
        { type: "kind", description: apiCase.kind },
        { type: "flow", description: apiCase.flowKey },
        { type: "flowTitle", description: apiCase.flowTitle },
        { type: "because", description: apiCase.because },
        { type: "expect", description: apiCase.expects },
      );

      test.skip(!!apiCase.skip, apiCase.skip ?? "");
      test.skip(
        !!apiCase.needsExistingEvent && !existingEventUuid,
        "no existing event on this account to address",
      );

      const ctx: CaseContext = {
        buyer: buyerApi,
        catalog: CONFIG.catalog,
        runId: `case_${Date.now()}`,
        existingEventUuid,
      };
      const request = apiCase.build(ctx);

      const outcome = await buyerApi.raw(request.method, request.path, {
        body: request.body,
        rawBody: request.rawBody,
        params: request.params,
        headers: authHeaders(request.auth, buyerApi.authTokens),
      });

      // The failure message has to say what was asked, what came back, and why
      // anyone cared — otherwise it is triaged by reading the source.
      const detail =
        `${apiCase.because}\n` +
        `      ${request.method} ${request.path}\n` +
        `      expected the API to ${describeExpectation(apiCase.expects)}\n` +
        `      got HTTP ${outcome.status || "no response"}` +
        `${outcome.message ? `: ${outcome.message}` : ""}`;

      expect(statusSatisfies(apiCase.expects, outcome.status), detail).toBe(true);
    });
  }

  test("the case table itself is coherent", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size, "duplicate case ids would make the report ambiguous").toBe(ids.length);

    const byKind = (kind: ApiCase["kind"]) => CASES.filter((c) => c.kind === kind).length;
    // eslint-disable-next-line no-console
    console.log(
      `\n  ${CASES.length} cases across ${new Set(CASES.map((c) => c.flowKey)).size} flows` +
        `\n    positive/negative/edge: ${byKind("positive")}/${byKind("negative")}/${byKind("edge")}` +
        `\n    parked: ${CASES.filter((c) => c.skip).length}\n`,
    );
    expect(byKind("negative"), "a suite with no negative cases proves very little").toBeGreaterThan(0);
    expect(byKind("edge"), "a suite with no edge cases proves very little").toBeGreaterThan(0);
  });
});
