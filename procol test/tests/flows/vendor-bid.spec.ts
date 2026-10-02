import { test, expect } from "@playwright/test";

import { asBuyer, asEvaluator, asVendorEmail } from "../../src/identities.js";
import { listInvitableVendors } from "../../src/flows/vendors.js";
import { createRfqTechnicalEvent } from "../../src/flows/createEvent.js";
import { submitVendorBid, VendorBidResult } from "../../src/flows/vendorBid.js";
import { runEvaluation } from "../../src/flows/evaluation.js";
import { runAwarding } from "../../src/flows/awarding.js";
import { ApiError } from "../../src/api/client.js";
import type { CreateEventResult } from "../../src/flows/createEvent.js";
import type { Identity } from "../../src/identities.js";
import { declareCase } from "../../src/report/caseSpec.js";

/**
 * Full vendor lifecycle (fully dynamic, mirrors the collection end-to-end):
 *   pick an invitable vendor → create event inviting it (short bid window)
 *   → vendor logs in with that email → vendor submits technical response + bid
 *   → wait for the technical stage to close → evaluator scores it
 *   → buyer awards the (now real, submitted) bid.
 *
 * The vendor login is dynamic per event: whoever we invite is who we log in as.
 * Uses a short window so evaluation/award (which need bidding closed) can run.
 */
test.describe("vendor lifecycle (invite → bid → evaluate → award)", () => {
  test("end-to-end vendor bid, evaluation and award", async () => {
    test.setTimeout(180_000);
    declareCase({
      plain:
        "Run the full supplier journey with real supplier credentials: invite a supplier to an event, sign in as them, submit a technical response and a priced bid, wait for the technical round to close, score it as the evaluator, then award the bid as the buyer.",
      expected:
        "A supplier is found who can bid, their bid is submitted, the evaluator's scoring is created and submitted, and the buyer's award proposal is raised and submitted.",
      flow: "events.vendor_e2e",
      flowTitle: "Supplier lifecycle (invite → bid → evaluate → award)",
      kind: "positive",
      expect: "accept",
      because: "the only journey that exercises award against a genuinely submitted supplier bid",
    });
    const buyer = await asBuyer();
    const evaluator = await asEvaluator();

    // 1) candidate vendors with login emails (not all are eligible to bid on
    //    the product, so we try a few until one places a bid).
    const candidates = await listInvitableVendors(buyer.api, "", 4);
    expect(candidates.length, "invitable vendors").toBeGreaterThan(0);

    let event: CreateEventResult | undefined;
    let vendor: { uuid: string; email?: string } | undefined;
    let v: Identity | undefined;
    let bid: VendorBidResult | undefined;

    for (const cand of candidates) {
      const ev = await createRfqTechnicalEvent(buyer.api, {
        evaluatorUuid: evaluator.login.userUuid!,
        vendorCompanyUuid: cand.uuid,
        title: `VendorE2E_${Date.now()}`,
        stageDurationSec: 30,
      });
      expect(ev.status).toBe("active");
      const vi = await asVendorEmail(cand.email!);
      try {
        bid = await submitVendorBid(vi.api, {
          technicalTradeUuid: ev.technicalTradeUuid,
          pricingTradeUuid: ev.pricingTradeUuid,
          lineItemUuid: ev.lineItemUuid,
          vendorCompanyUuid: cand.uuid,
        });
        event = ev;
        vendor = cand;
        v = vi;
        break; // this vendor could bid — proceed
      } catch (e) {
        await vi.api.dispose();
        if (e instanceof ApiError && /not allowed to bid/i.test(e.message)) {
          continue; // vendor not eligible for this product — try the next
        }
        throw e;
      }
    }

    expect(bid, "a vendor was able to place a bid").toBeTruthy();
    expect(event, "event created").toBeTruthy();
    try {
      expect(bid!.bidUuid, "bid uuid").toBeTruthy();
      expect(bid!.submitted, "bid submitted").toBe(true);

      // wait for the technical stage to close, then evaluate
      const waitMs = (event!.timing.ect - Math.floor(Date.now() / 1000) + 8) * 1000;
      await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));

      const evaluation = await runEvaluation(
        evaluator.api,
        evaluator.login.userUuid!,
        event!.technicalTradeUuid!,
        vendor!.uuid,
      );
      expect(evaluation.created, "evaluation created").toBe(true);
      expect(evaluation.submitted, "evaluation submitted").toBe(true);

      // buyer awards the submitted bid
      const award = await runAwarding(
        buyer.api,
        event!.eventGroupUuid,
        event!.lineItemUuid,
        vendor!.uuid,
      );
      expect(award.proposalUuid, "proposal uuid").toBeTruthy();
      expect(award.submitted, "award submitted").toBe(true);
    } finally {
      await buyer.api.dispose();
      await evaluator.api.dispose();
      await v?.api.dispose();
    }
  });
});
