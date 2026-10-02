import { test, expect } from "../src/fixtures.js";
import { Endpoints } from "../src/api/endpoints.js";
import { declareCase } from "../src/report/caseSpec.js";

/**
 * Read-only ("safe GET") coverage for the buyer session.
 * Uses the shared `buyerApi` fixture (logged in once by the setup project).
 * Every `buyerApi.get` throws ApiError on non 200–204, so a resolved call
 * already proves a 2xx.
 */
test.describe("read-only endpoints", () => {
  test("GET /v1/dashboard_configuration returns the config + permissions", async ({
    buyerApi,
  }) => {
    declareCase({
      plain:
        "Read the company's dashboard settings — the record of which modules it has switched on and what the signed-in user is allowed to do.",
      expected:
        "The API returns the settings, and they include both the configuration block and the list of the user's permissions.",
      flow: "reads.config",
      flowTitle: "Reading company configuration",
      kind: "positive",
      expect: "accept",
      because: "every config-gated flow in the suite branches on these permissions",
    });
    const cfg = await buyerApi.get<Record<string, unknown>>(
      Endpoints.dashboardConfiguration(),
    );
    expect(cfg).toBeTruthy();
    expect(cfg).toHaveProperty("configurations");
    expect(cfg).toHaveProperty("authorized_permissions");
    // authorized_permissions drives the config-aware flow branching later.
    expect(Array.isArray(cfg.authorized_permissions)).toBe(true);
  });

  test("GET /session/recent_account_activity returns session info", async ({
    buyerApi,
  }) => {
    declareCase({
      plain: "Read back the signed-in user's own session — which session is current, and which others are still open.",
      expected: "The API returns the session record, naming the current session and listing the active ones.",
      flow: "reads.session",
      flowTitle: "Reading session information",
      kind: "positive",
      expect: "accept",
    });
    const res = await buyerApi.get<Record<string, unknown>>(
      Endpoints.recentAccountActivity(),
    );
    expect(res).toBeTruthy();
    expect(res).toHaveProperty("current_session_uuid");
    expect(res).toHaveProperty("active_sessions");
  });

  test.describe("purchase orders", () => {
    test("GET /orders returns a paginated PO list", async ({ buyerApi }) => {
      declareCase({
        plain: "Open the purchase order list the way the dashboard does, one page at a time.",
        expected: "The API returns a page of purchase orders together with the total number of pages.",
        flow: "reads.orders",
        flowTitle: "Reading purchase orders",
        kind: "positive",
        expect: "accept",
      });
      const res = await buyerApi.get<{ data: unknown[]; total_pages: number }>(
        Endpoints.orders(),
      );
      expect(res).toHaveProperty("data");
      expect(Array.isArray(res.data)).toBe(true);
      expect(res).toHaveProperty("total_pages");
    });

    for (const tab of ["live", "history"] as const) {
      test(`GET /orders?tab=${tab} returns a PO list`, async ({ buyerApi }) => {
        declareCase({
          plain: `Open the purchase order list filtered to the "${tab}" tab, as a buyer does from the dashboard.`,
          expected: "The API returns a list of purchase orders for that tab.",
          flow: "reads.orders",
          flowTitle: "Reading purchase orders",
          kind: "positive",
          expect: "accept",
        });
        const res = await buyerApi.get<{ data: unknown[] }>(Endpoints.orders(), {
          params: { tab },
        });
        expect(Array.isArray(res.data)).toBe(true);
      });
    }
  });

  test.describe("event / trade detail (chained from PO list)", () => {
    test("orders → trade schema → event indicators", async ({ buyerApi }) => {
      declareCase({
        plain:
          "Follow the trail a buyer follows: open the purchase order list, pick an order that came from an event, then open that event's full definition and its progress indicators.",
        expected:
          "Both the event definition and its indicators come back, and the definition carries the event's identifier, title and sheets.",
        flow: "reads.event",
        flowTitle: "Reading event detail",
        kind: "positive",
        expect: "accept",
        because: "this is the chain the dashboard walks to render an event behind a PO",
      });
      const list = await buyerApi.get<{ data: Array<{ event_details?: { event_uuid?: string } }> }>(
        Endpoints.orders(),
      );
      const eventUuid = list.data
        .map((po) => po.event_details?.event_uuid)
        .find((id): id is string => Boolean(id));

      test.skip(!eventUuid, "no event_uuid available on this account's POs");

      // Full event schema (endpoint already carries response_type/additional_fields)
      const schema = await buyerApi.get<Record<string, unknown>>(
        Endpoints.tradeSchema(eventUuid!),
      );
      expect(schema).toHaveProperty("uuid");
      expect(schema).toHaveProperty("sheets");
      expect(schema).toHaveProperty("title");

      // Event indicators for the same event
      const indicators = await buyerApi.get<Record<string, unknown>>(
        Endpoints.eventIndicators(eventUuid!),
      );
      expect(indicators).toBeTruthy();
      expect(typeof indicators).toBe("object");
    });
  });
});
