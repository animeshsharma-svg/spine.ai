import { test, expect } from "@playwright/test";

import { asBuyer, asEvaluator } from "../../src/identities.js";
import { createRfqTechnicalEvent } from "../../src/flows/createEvent.js";
import { Endpoints } from "../../src/api/endpoints.js";

/**
 * Create-event flow (RFQ + Technical), fully dynamic (mirrors the Postman
 * "event create" folder). Writes real draft→active data to the active client;
 * every event is titled `API_Test_...` for easy cleanup.
 */
test.describe("create event — RFQ + Technical", () => {
  test("creates a 2-stage event group and finalizes it", async () => {
    const buyer = await asBuyer();
    const evaluator = await asEvaluator();
    try {
      const result = await createRfqTechnicalEvent(buyer.api, {
        evaluatorUuid: evaluator.login.userUuid!,
        title: `RFQ_Tech_${Date.now()}`,
      });

      expect(result.eventGroupUuid, "event group uuid").toBeTruthy();
      expect(result.lineItemUuid, "line item uuid").toBeTruthy();
      expect(result.technicalTradeUuid, "technical trade").toBeTruthy();
      expect(result.pricingTradeUuid, "pricing trade").toBeTruthy();
      expect(result.status, "published status").toBe("active");
      expect(result.title).toContain("API_Test_");

      // Read it back
      const readBack = await buyer.api.get<{ uuid: string; status: string; stages: unknown[] }>(
        Endpoints.eventGroup(result.eventGroupUuid),
      );
      expect(readBack.uuid).toBe(result.eventGroupUuid);
      expect(readBack.status).toBe("active");
      expect(readBack.stages.length).toBe(2);
    } finally {
      await buyer.api.dispose();
      await evaluator.api.dispose();
    }
  });
});
