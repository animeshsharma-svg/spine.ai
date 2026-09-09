import { test, expect } from "../src/fixtures.js";
import { Endpoints } from "../src/api/endpoints.js";

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
    const res = await buyerApi.get<Record<string, unknown>>(
      Endpoints.recentAccountActivity(),
    );
    expect(res).toBeTruthy();
    expect(res).toHaveProperty("current_session_uuid");
    expect(res).toHaveProperty("active_sessions");
  });

  test.describe("purchase orders", () => {
    test("GET /orders returns a paginated PO list", async ({ buyerApi }) => {
      const res = await buyerApi.get<{ data: unknown[]; total_pages: number }>(
        Endpoints.orders(),
      );
      expect(res).toHaveProperty("data");
      expect(Array.isArray(res.data)).toBe(true);
      expect(res).toHaveProperty("total_pages");
    });

    for (const tab of ["live", "history"] as const) {
      test(`GET /orders?tab=${tab} returns a PO list`, async ({ buyerApi }) => {
        const res = await buyerApi.get<{ data: unknown[] }>(Endpoints.orders(), {
          params: { tab },
        });
        expect(Array.isArray(res.data)).toBe(true);
      });
    }
  });

  test.describe("event / trade detail (chained from PO list)", () => {
    test("orders → trade schema → event indicators", async ({ buyerApi }) => {
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
