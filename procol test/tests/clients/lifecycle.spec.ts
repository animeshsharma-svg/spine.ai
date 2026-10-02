import { test, expect } from "../../src/dbFixtures.js";
import { createRfqTechnicalEvent } from "../../src/flows/createEvent.js";
import { placeSurrogateBid } from "../../src/flows/surrogate.js";
import { createProposal, getApprovalFlows } from "../../src/flows/awarding.js";
import { Endpoints } from "../../src/api/endpoints.js";
import { getEventGroupByTitle, getTradesByEventGroupId } from "../../src/db/verify.js";
import { declareCase } from "../../src/report/caseSpec.js";

/**
 * Fully DB-driven client lifecycle. Everything (login, catalog, vendor,
 * evaluator) is resolved from the DB + API for the selected COMPANY_ID —
 * nothing hardcoded. Run for any client:
 *
 *   COMPANY_ID=39490 npx playwright test tests/clients/lifecycle.spec.ts
 */
test.describe("client lifecycle (DB-driven)", () => {
  test("create → surrogate bid → open award proposal for the selected company", async ({
    client,
  }) => {
    test.setTimeout(120_000);
    declareCase({
      plain:
        "Run a full sourcing round for whichever company was selected, using only that company's own data — its catalogue, its suppliers, its evaluator — and then check the records really landed in the database, not just that the API said so.",
      expected:
        "The event goes live with both rounds, the bid is accepted on the supplier's behalf, an award proposal opens with an approval workflow, the event is still live on re-read, and Postgres holds the event group plus both of its rounds under the same owning company.",
      flow: "clients.lifecycle",
      flowTitle: "Per-company end-to-end journey",
      kind: "positive",
      expect: "accept",
      because: "nothing here is hardcoded — it is the proof the framework runs against any client account",
    });
    test.info().annotations.push({
      type: "client",
      description: `COMPANY_ID=${client.companyId} "${client.companyName ?? ""}"`,
    });

    // 1) create a 2-stage event with the client's resolved catalog + vendor
    const event = await createRfqTechnicalEvent(client.buyerApi, {
      evaluatorUuid: client.evaluatorUuid,
      vendorCompanyUuid: client.vendor.uuid,
      catalog: client.catalog,
      title: `Client${client.companyId}_${Date.now()}`,
    });
    expect(event.status, "event active").toBe("active");
    expect(event.stages.length, "two stages").toBe(2);

    // 2) surrogate bid on the vendor's behalf
    const surrogate = await placeSurrogateBid(client.buyerApi, {
      technicalTradeUuid: event.technicalTradeUuid,
      pricingTradeUuid: event.pricingTradeUuid,
      lineItemUuid: event.lineItemUuid,
      vendorCompanyUuid: client.vendor.uuid,
      catalog: client.catalog,
    });
    expect(surrogate.technicalPlaced, "surrogate technical").toBe(true);
    expect(surrogate.rfqPlaced, "surrogate rfq").toBe(true);

    // 3) open an award proposal + read the approval workflow
    const proposalUuid = await createProposal(client.buyerApi, event.eventGroupUuid);
    expect(proposalUuid, "proposal uuid").toBeTruthy();
    const flows = await getApprovalFlows(client.buyerApi, proposalUuid);
    expect(flows.approvalFlowUuid, "approval flow uuid").toBeTruthy();

    // event still active (API check)
    const readBack = await client.buyerApi.get<{ status: string }>(
      Endpoints.eventGroup(event.eventGroupUuid),
    );
    expect(readBack.status).toBe("active");

    // DB-as-oracle: the event + both stages actually landed in Postgres
    const dbEvent = await getEventGroupByTitle(event.title);
    expect(dbEvent, `event "${event.title}" persisted in DB`).toBeTruthy();
    expect(dbEvent!.company_id, "DB event has an owning company").toBeGreaterThan(0);

    const dbTrades = await getTradesByEventGroupId(dbEvent!.id);
    expect(dbTrades.length, "two stages persisted in DB").toBe(2);
    const stages = dbTrades.map((t) => t.stage_no).sort();
    expect(stages, "stage 1 (technical) + stage 2 (pricing)").toEqual([1, 2]);
    // stages belong to the same company as their event group
    for (const t of dbTrades) expect(t.company_id).toBe(dbEvent!.company_id);
    test.info().annotations.push({
      type: "db",
      description: `event_group id=${dbEvent!.id} ref=${dbEvent!.ref_id} company=${dbEvent!.company_id} (2 stages verified in DB)`,
    });
  });
});
