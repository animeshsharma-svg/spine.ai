import { test, expect } from "@playwright/test";

import { asBuyer, asEvaluator } from "../../src/identities.js";
import { createRfqTechnicalEvent } from "../../src/flows/createEvent.js";
import { convertToAuction, versionEvent } from "../../src/flows/features.js";
import { declareCase } from "../../src/report/caseSpec.js";

/**
 * Buyer-driven feature flows on a freshly created event.
 *   F2 — versioning (create a new version of the event group)
 *   F5 — convert the RFQ stage to an auction
 */
test.describe("feature flows", () => {
  test("F2 — versioning creates a new event version", async () => {
    declareCase({
      plain:
        "Publish an event, then issue a new version of it — what a buyer does after the requirement changes mid-sourcing.",
      expected:
        "A new version is created, with its own event identifier and its own fresh copy of both rounds.",
      flow: "events.versioning",
      flowTitle: "Versioning a published event",
      kind: "positive",
      expect: "accept",
    });
    const buyer = await asBuyer();
    const evaluator = await asEvaluator();
    try {
      const event = await createRfqTechnicalEvent(buyer.api, {
        evaluatorUuid: evaluator.login.userUuid!,
        title: `F2_${Date.now()}`,
      });
      const v = await versionEvent(buyer.api, event.eventGroupUuid);
      expect(v.versionUuid, "version uuid").toBeTruthy();
      expect(v.versionedEventUuid, "versioned event uuid").toBeTruthy();
      expect(v.versionedTradeUuids.length, "versioned trades").toBe(2);
    } finally {
      await buyer.api.dispose();
      await evaluator.api.dispose();
    }
  });

  test("F5 — convert RFQ stage to auction", async () => {
    declareCase({
      plain:
        "Publish an event with an ordinary pricing round, then switch that round into a live auction.",
      expected: "The pricing round becomes an auction round, and the event is still live afterwards.",
      flow: "events.convert_to_auction",
      flowTitle: "Converting a pricing round to an auction",
      kind: "positive",
      expect: "accept",
    });
    const buyer = await asBuyer();
    const evaluator = await asEvaluator();
    try {
      const event = await createRfqTechnicalEvent(buyer.api, {
        evaluatorUuid: evaluator.login.userUuid!,
        title: `F5_${Date.now()}`,
      });
      const auction = await convertToAuction(buyer.api, {
        pricingTradeUuid: event.pricingTradeUuid,
        lineItemUuid: event.lineItemUuid,
      });
      expect(auction.auctionTradeUuid, "auction trade uuid").toBeTruthy();
      expect(auction.status).toBe("active");
    } finally {
      await buyer.api.dispose();
      await evaluator.api.dispose();
    }
  });
});
