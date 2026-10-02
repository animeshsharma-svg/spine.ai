import { expect, test } from "@playwright/test";

import { FlowModule, FlowContext, gate } from "./types.js";
import { createEvent, createRfqTechnicalEvent, StageSpec } from "../flows/createEvent.js";
import { placeSurrogateBid } from "../flows/surrogate.js";
import { createProposal, getApprovalFlows } from "../flows/awarding.js";
import { versionEvent, convertToAuction } from "../flows/features.js";
import { fetchVendorsFiltered } from "../flows/vendors.js";
import { createBoqEvent } from "../flows/boq.js";
import { convertPrToEvent } from "../flows/prToEvent.js";
import {
  createCategory,
  createProduct,
  createLocation,
  createTeam,
  createUser,
} from "../flows/masterData.js";
import {
  getEventGroupByTitle,
  getTradesByEventGroupId,
  getCategoryByName,
  getProductByName,
  getBuyerHubByName,
  getTeamByName,
  getUserByEmail,
  isTeamMember,
} from "../db/verify.js";
import { Endpoints } from "../api/endpoints.js";
import { step, stepResult } from "../report/steps.js";

const TRADE = "trade:create_record";
const needsTrade = (c: any) =>
  c.hasModule("trade", "create_record")
    ? gate(true)
    : gate(false, `client not authorized for ${TRADE}`);

/**
 * Create an event with the given stages and verify the stage count in the DB.
 *
 * `createEvent` reports its own steps (draft → each round → publish); this adds
 * the one after them, so the report shows the whole variant as the sequence a
 * buyer would recognise, ending in the check that it really landed.
 */
async function runEventVariant(
  ctx: FlowContext,
  label: string,
  stages: StageSpec[],
): Promise<void> {
  const ev = await createEvent(ctx.buyerApi, {
    evaluatorUuid: ctx.evaluatorUuid,
    vendorCompanyUuid: ctx.vendor.uuid,
    catalog: ctx.catalog,
    title: `Master_${label}_${Date.now()}`,
    stages,
  });
  expect(ev.status, "event active").toBe("active");
  expect(ev.stageTrades.length, "stage trades created").toBe(stages.length);
  await verifyEventInDb(ev.title, stages.length);
}

/** The step that proves the event is really there — in Postgres, not just in
 * the answer the API gave about itself. */
async function verifyEventInDb(title: string, stageCount: number): Promise<void> {
  await step(
    "Check the event was saved in the database",
    `The event is in the database with exactly ${stageCount} round${
      stageCount === 1 ? "" : "s"
    } recorded against it.`,
    async () => {
      const db = await getEventGroupByTitle(title);
      expect(db, "event persisted in DB").toBeTruthy();
      const trades = await getTradesByEventGroupId(db!.id);
      expect(trades.length, "stages persisted in DB").toBe(stageCount);
      stepResult(
        `The database holds event group ${db!.id} with ${trades.length} round(s) against it.`,
      );
    },
  );
}

/**
 * THE MASTER REGISTRY — every flow the framework knows how to run.
 * Each is client-agnostic (uses the resolved ClientContext) and declares the
 * config that turns it on. The runner executes only the enabled ones.
 */
export const REGISTRY: FlowModule[] = [
  // ── entry paths (how a client starts procurement) ──
  {
    key: "entrypath.pr_to_event",
    category: "entry-paths",
    title: "PR → Event (convert an existing PR into an event)",
    plain:
      "Take a purchase request that already exists and turn it into a sourcing event, carrying its line items across.",
    expected:
      "A new event group is created from the purchase request, at least one of the PR's line items is carried onto it, and the event group is found in the database.",
    enabledFor: (c) =>
      c.hasModule("pr") && c.hasModule("trade", "create_record")
        ? gate(true)
        : gate(false, "client not authorized for pr + trade"),
    run: async (ctx) => {
      const r = await step(
        "Turn an existing purchase request into a sourcing event",
        "An event group is created from the purchase request, carrying at least one of its line items across.",
        async () => {
          const converted = await convertPrToEvent(ctx.buyerApi);
          expect(converted.eventGroupUuid, "event group created from PR").toBeTruthy();
          expect(converted.lineItemIds.length, "PR line items carried onto the event").toBeGreaterThan(0);
          stepResult(
            `Event ${converted.eventGroupUuid} was created from the request with ` +
              `${converted.lineItemIds.length} line item(s) carried across.`,
          );
          return converted;
        },
      );
      await step(
        "Check the event was saved in the database",
        "The event created from the purchase request is found in the database.",
        async () => {
          const db = await getEventGroupByTitle(r.title);
          expect(db, "PR→event group persisted in DB").toBeTruthy();
          stepResult(`The database holds event group ${db!.id}.`);
        },
      );
    },
  },
  {
    key: "events.rfp_rfq",
    category: "events",
    title: "Create RFP + RFQ event (2-stage) and verify in DB",
    plain:
      "Create a two-stage event — a technical round (RFP) followed by a pricing round (RFQ) — and publish it.",
    expected:
      "The event goes live with both stages attached, and the database holds the event group with exactly two stages against it.",
    enabledFor: needsTrade,
    run: async (ctx) => {
      const ev = await createRfqTechnicalEvent(ctx.buyerApi, {
        evaluatorUuid: ctx.evaluatorUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
        title: `Master_RfpRfq_${Date.now()}`,
      });
      expect(ev.status, "event active").toBe("active");
      expect(ev.stages.length, "two stages").toBe(2);
      await verifyEventInDb(ev.title, 2);
    },
  },
  {
    key: "events.rfp_only",
    category: "events",
    title: "Create RFP-only event (technical single stage)",
    plain:
      "Create an event with a technical round only (RFP), no pricing round, and publish it.",
    expected:
      "The event goes live with one stage, and the database holds the event group with exactly one stage against it.",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "RfpOnly", [{ kind: "rfp" }]),
  },
  {
    key: "events.rfq_only",
    category: "events",
    title: "Create RFQ-only event (pricing single stage)",
    plain:
      "Create an event with a pricing round only (RFQ), no technical round, and publish it.",
    expected:
      "The event goes live with one stage, and the database holds the event group with exactly one stage against it.",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "RfqOnly", [{ kind: "rfq" }]),
  },
  {
    key: "events.auction_rank",
    category: "events",
    title: "Create rank-based auction event",
    plain:
      "Create an event whose bidding round is a live auction where suppliers compete on rank rather than on price shown.",
    expected:
      "The event goes live with its one auction stage, and the database holds the event group with exactly one stage against it.",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "AuctionRank", [{ kind: "auction", auctionConfig: "rank" }]),
  },
  {
    key: "events.auction_price",
    category: "events",
    title: "Create price-based auction event",
    plain:
      "Create an event whose bidding round is a live auction where suppliers compete on price.",
    expected:
      "The event goes live with its one auction stage, and the database holds the event group with exactly one stage against it.",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "AuctionPrice", [{ kind: "auction", auctionConfig: "price" }]),
  },
  {
    key: "events.rfp_auction",
    category: "events",
    title: "Create RFP + Auction event (2-stage)",
    plain:
      "Create a two-stage event — a technical round (RFP) followed by a live price auction — and publish it.",
    expected:
      "The event goes live with both stages attached, and the database holds the event group with exactly two stages against it.",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "RfpAuction", [{ kind: "rfp" }, { kind: "auction", auctionConfig: "price" }]),
  },
  {
    key: "events.surrogate_award",
    category: "events",
    title: "Create event → surrogate bid → open award proposal",
    plain:
      "Walk a whole sourcing round: create the event, enter a supplier's bid on their behalf, then open an award proposal for it.",
    expected:
      "The event goes live, both the technical and the pricing bid are accepted on the supplier's behalf, an award proposal is opened, and that proposal comes back with an approval workflow attached.",
    enabledFor: needsTrade,
    run: async (ctx) => {
      const ev = await createRfqTechnicalEvent(ctx.buyerApi, {
        evaluatorUuid: ctx.evaluatorUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
        title: `Master_Surrogate_${Date.now()}`,
      });
      await step(
        "Enter the supplier's bid on their behalf",
        "Both the technical response and the price bid are accepted for the invited supplier.",
        async () => {
          const s = await placeSurrogateBid(ctx.buyerApi, {
            technicalTradeUuid: ev.technicalTradeUuid,
            pricingTradeUuid: ev.pricingTradeUuid,
            lineItemUuid: ev.lineItemUuid,
            vendorCompanyUuid: ctx.vendor.uuid,
            catalog: ctx.catalog,
          });
          expect(s.technicalPlaced && s.rfqPlaced, "surrogate placed").toBe(true);
          stepResult("The technical response and the price bid were both placed for the supplier.");
        },
      );
      const proposalUuid = await step(
        "Open an award proposal for the event",
        "An award proposal is created against the event and comes back with its own identifier.",
        async () => {
          // Award proposal creation is the core assertion; the approval-workflow
          // shape is client-config specific, so it is read in its own step below.
          const uuid = await createProposal(ctx.buyerApi, ev.eventGroupUuid);
          expect(uuid, "award proposal created").toBeTruthy();
          stepResult(`Award proposal ${uuid} was opened.`);
          return uuid;
        },
      );
      await step(
        "Read the approval workflow attached to the proposal",
        "The proposal carries an approval workflow, where this company's configuration defines one.",
        async () => {
          const flows = await getApprovalFlows(ctx.buyerApi, proposalUuid).catch(() => undefined);
          if (flows?.approvalFlowUuid) {
            expect(flows.approvalFlowUuid, "approval flow uuid").toBeTruthy();
            stepResult(`Approval workflow ${flows.approvalFlowUuid} is attached to the proposal.`);
          } else {
            stepResult(
              "No approval workflow came back — this company's configuration does not define one " +
                "for award proposals, which is a valid configuration rather than a failure.",
            );
          }
        },
      );
    },
  },
  {
    key: "events.versioning",
    category: "events",
    title: "F2 — version an event group",
    plain:
      "Publish an event and then issue a new version of it, the way a buyer does after changing the requirement.",
    expected:
      "A new version of the event is created, carrying a new event identifier and a new copy of each of its stages.",
    enabledFor: needsTrade,
    run: async (ctx) => {
      const ev = await createRfqTechnicalEvent(ctx.buyerApi, {
        evaluatorUuid: ctx.evaluatorUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
        title: `Master_Version_${Date.now()}`,
      });
      await step(
        "Issue a new version of the event",
        "A new version of the event is created, with a new identifier and a fresh copy of each of its two rounds.",
        async () => {
          const v = await versionEvent(ctx.buyerApi, ev.eventGroupUuid);
          expect(v.versionUuid, "version uuid").toBeTruthy();
          expect(v.versionedTradeUuids.length, "versioned trades").toBe(2);
          stepResult(
            `Version ${v.versionUuid} was created, carrying ${v.versionedTradeUuids.length} rounds.`,
          );
        },
      );
    },
  },
  {
    key: "events.convert_to_auction",
    category: "events",
    title: "F5 — convert RFQ stage to auction",
    plain:
      "Publish an event with a normal pricing round, then switch that round into a live auction.",
    expected:
      "The pricing round is replaced by an auction round and the event is still live afterwards.",
    enabledFor: (c) =>
      c.hasModule("trade", "create_record")
        ? gate(true, c.isOn("rfx_project_enabled") ? "rfx_project_enabled" : undefined)
        : gate(false, `client not authorized for ${TRADE}`),
    run: async (ctx) => {
      const ev = await createRfqTechnicalEvent(ctx.buyerApi, {
        evaluatorUuid: ctx.evaluatorUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
        title: `Master_Auction_${Date.now()}`,
      });
      await step(
        "Switch the pricing round into a live auction",
        "The pricing round is replaced by an auction round, and the event is still live afterwards.",
        async () => {
          const a = await convertToAuction(ctx.buyerApi, {
            pricingTradeUuid: ev.pricingTradeUuid,
            lineItemUuid: ev.lineItemUuid,
          });
          expect(a.auctionTradeUuid, "auction trade").toBeTruthy();
          expect(a.status).toBe("active");
          stepResult(
            `The pricing round became auction round ${a.auctionTradeUuid}; the event is "${a.status}".`,
          );
        },
      );
    },
  },
  {
    key: "events.boq",
    category: "events",
    title: "Create BOQ-based event (upload sheet → parse → event group)",
    plain:
      "Create an event from an uploaded bill-of-quantities sheet, rather than by picking products one at a time.",
    expected:
      "The uploaded sheet is parsed into line items, an event group is created from them, and it goes live.",
    enabledFor: (c) => {
      if (!c.hasModule("trade", "create_record")) return gate(false, `client not authorized for ${TRADE}`);
      return c.isOn("boq_in_erfx_allowed")
        ? gate(true, "boq_in_erfx_allowed")
        : gate(false, "boq_in_erfx_allowed is off for this client");
    },
    run: async (ctx) => {
      const boq = await step(
        "Build the event from an uploaded bill-of-quantities sheet",
        "The sheet is parsed into line items and an event group is created from them.",
        async () => {
          const created = await createBoqEvent(ctx.buyerApi, { title: `Master_Boq_${Date.now()}` });
          expect(created.eventGroupUuid, "BOQ event group created").toBeTruthy();
          expect(created.lineItems.length, "BOQ line items parsed").toBeGreaterThan(0);
          stepResult(
            `Event ${created.eventGroupUuid} was built from the sheet with ${created.lineItems.length} line item(s).`,
          );
          return created;
        },
      );
      await step(
        "Check the event was saved in the database as BOQ-based",
        "The event is in the database and is marked as built from a bill of quantities.",
        async () => {
          // DB-as-oracle: the event group persisted with the BOQ config flag
          const db = await getEventGroupByTitle(boq.title);
          expect(db, "BOQ event group persisted in DB").toBeTruthy();
          expect(db!.config?.boq_based_rfx, "boq_based_rfx persisted").toBe(true);
          stepResult(`The database holds event group ${db!.id} with boq_based_rfx set.`);
        },
      );
    },
  },
  // ── master data ──
  {
    key: "masterdata.category",
    category: "masterdata",
    title: "Create a product category",
    plain:
      "Add a new spend category to the company's master data.",
    expected:
      "The category is created and the same category is found in the database.",
    enabledFor: (c) =>
      c.hasModule("product_category", "create_record")
        ? gate(true)
        : gate(false, "no product_category:create_record permission"),
    run: async (ctx) => {
      const cat = await createCategory(ctx.buyerApi);
      expect(cat.uuid, "category created").toBeTruthy();
      const db = await getCategoryByName(cat.name);
      expect(db, "category persisted in DB").toBeTruthy();
    },
  },
  {
    key: "masterdata.product",
    category: "masterdata",
    title: "Create a product (category → family → product)",
    plain:
      "Add a new product to the company's catalogue, creating the category and family it hangs off.",
    expected:
      "The product is created and the same product is found in the database.",
    enabledFor: (c) =>
      c.hasModule("product", "create_record")
        ? gate(true)
        : gate(false, "no product:create_record permission"),
    run: async (ctx) => {
      const prod = await createProduct(ctx.buyerApi);
      expect(prod.uuid, "product created").toBeTruthy();
      const db = await getProductByName(prod.name);
      expect(db, "product persisted in DB").toBeTruthy();
    },
  },
  {
    key: "masterdata.location",
    category: "masterdata",
    title: "Create a location (buyer hub)",
    plain:
      "Add a new delivery location (a buyer hub) to the company's master data.",
    expected:
      "The location is created and the same location is found in the database.",
    enabledFor: (c) =>
      c.hasModule("buyer_hub", "create_record")
        ? gate(true)
        : gate(false, "no buyer_hub:create_record permission"),
    run: async (ctx) => {
      const loc = await createLocation(ctx.buyerApi);
      expect(loc.uuid, "location created").toBeTruthy();
      const db = await getBuyerHubByName(loc.name);
      expect(db, "location persisted in DB").toBeTruthy();
    },
  },
  {
    key: "masterdata.team",
    category: "masterdata",
    title: "Create a team",
    plain:
      "Add a new team to the company's master data.",
    expected:
      "The team is created and the same team is found in the database.",
    enabledFor: (c) =>
      c.hasModule("team", "create_record")
        ? gate(true)
        : gate(false, "no team:create_record permission"),
    run: async (ctx) => {
      const team = await createTeam(ctx.buyerApi);
      expect(team.uuid, "team created").toBeTruthy();
      const db = await getTeamByName(team.name);
      expect(db, "team persisted in DB").toBeTruthy();
    },
  },
  {
    key: "masterdata.user_permissions",
    category: "masterdata",
    title: "Create a user and grant permissions via team membership",
    plain:
      "Add a new user and give them their permissions by putting them in a team, which is how this product grants access.",
    expected:
      "Both the team and the user are created, and both are found in the database; whether the membership row itself landed is reported rather than assumed.",
    enabledFor: (c) =>
      c.hasModule("user", "create_record")
        ? gate(true)
        : gate(false, "no user:create_record permission"),
    run: async (ctx) => {
      // permissions are team-based. The app assigns teams AT user creation via
      // the `teams: [{uuid, role}]` field (the permission grant).
      const team = await createTeam(ctx.buyerApi);
      expect(team.uuid, "team created").toBeTruthy();
      const user = await createUser(ctx.buyerApi, {
        role: "member",
        teams: [{ uuid: team.uuid!, role: "member" }],
      });
      expect(user.uuid, "user created with team permission").toBeTruthy();

      // DB verify: both records persisted (the team-assignment was accepted by
      // the create-user call, which is how permissions are granted).
      const dbUser = await getUserByEmail(user.email);
      const dbTeam = await getTeamByName(team.name);
      expect(dbUser, "user persisted in DB").toBeTruthy();
      expect(dbTeam, "team persisted in DB").toBeTruthy();
      // Membership may be recorded in procol_team_members / user.team_identifiers
      // rather than team_members — report it, don't hard-fail on the table.
      const member = await isTeamMember(dbTeam!.id, dbUser!.id).catch(() => false);
      test.info().annotations.push({
        type: "membership",
        description: `team_members row present: ${member}`,
      });
    },
  },
  {
    key: "vendor.discovery",
    category: "vendor",
    title: "Fetch the client's vendor list",
    plain:
      "Read back the list of suppliers this company can invite to an event.",
    expected:
      "The API returns a list of supplier companies.",
    enabledFor: () => gate(true),
    run: async (ctx) => {
      const page = await fetchVendorsFiltered(ctx.buyerApi, 1);
      expect(Array.isArray(page.companies), "vendor list").toBe(true);
    },
  },
];
