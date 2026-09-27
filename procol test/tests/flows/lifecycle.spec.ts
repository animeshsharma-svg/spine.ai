import { test, expect } from "@playwright/test";

import { asBuyer, asEvaluator } from "../../src/identities.js";
import { createRfqTechnicalEvent } from "../../src/flows/createEvent.js";
import { placeSurrogateBid } from "../../src/flows/surrogate.js";
import { createProposal, getApprovalFlows } from "../../src/flows/awarding.js";
import { Endpoints } from "../../src/api/endpoints.js";
import { declareCase } from "../../src/report/caseSpec.js";

/**
 * Buyer-driven event lifecycle (no vendor login required):
 *   create 2-stage event → surrogate bid → open an award proposal + read its
 *   approval workflow.
 * (The final award `add_response` needs a *submitted* vendor bid, which requires
 *  real vendor creds — covered in the skipped vendor-bid spec.)
 */
test.describe("event lifecycle (buyer-driven)", () => {
  test("create → surrogate bid → open award proposal", async () => {
    declareCase({
      plain:
        "Run a whole sourcing round from the buyer's side: create and publish a two-round event, enter a supplier's bid on their behalf, then open an award proposal and read the approval chain it needs.",
      expected:
        "The event goes live with both rounds, both halves of the bid are accepted on the supplier's behalf, an award proposal opens with an approval workflow attached, and the event is still live at the end.",
      flow: "events.surrogate_award",
      flowTitle: "Buyer-driven event lifecycle",
      kind: "positive",
      expect: "accept",
      because: "this is the longest journey the suite can drive without real supplier credentials",
    });
    const buyer = await asBuyer();
    const evaluator = await asEvaluator();
    try {
      // 1) create
      const event = await createRfqTechnicalEvent(buyer.api, {
        evaluatorUuid: evaluator.login.userUuid!,
        title: `Lifecycle_${Date.now()}`,
      });
      expect(event.status).toBe("active");
      expect(event.stages.length).toBe(2);

      // 2) surrogate bid (technical + rfq) on the vendor's behalf
      const surrogate = await placeSurrogateBid(buyer.api, {
        technicalTradeUuid: event.technicalTradeUuid,
        pricingTradeUuid: event.pricingTradeUuid,
        lineItemUuid: event.lineItemUuid,
      });
      expect(surrogate.technicalPlaced, "surrogate technical").toBe(true);
      expect(surrogate.rfqPlaced, "surrogate rfq").toBe(true);

      // 3) open an award proposal + read its approval workflow
      const proposalUuid = await createProposal(buyer.api, event.eventGroupUuid);
      expect(proposalUuid, "proposal uuid").toBeTruthy();
      const flows = await getApprovalFlows(buyer.api, proposalUuid);
      expect(flows.approvalFlowUuid, "approval flow uuid").toBeTruthy();

      // event still active
      const readBack = await buyer.api.get<{ status: string }>(
        Endpoints.eventGroup(event.eventGroupUuid),
      );
      expect(readBack.status).toBe("active");
    } finally {
      await buyer.api.dispose();
      await evaluator.api.dispose();
    }
  });
});
