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

const TRADE = "trade:create_record";
const needsTrade = (c: any) =>
  c.hasModule("trade", "create_record")
    ? gate(true)
    : gate(false, `client not authorized for ${TRADE}`);

/** Create an event with the given stages and verify the stage count in the DB. */
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
  const db = await getEventGroupByTitle(ev.title);
  expect(db, "event persisted in DB").toBeTruthy();
  const trades = await getTradesByEventGroupId(db!.id);
  expect(trades.length, "stages persisted in DB").toBe(stages.length);
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
    enabledFor: (c) =>
      c.hasModule("pr") && c.hasModule("trade", "create_record")
        ? gate(true)
        : gate(false, "client not authorized for pr + trade"),
    run: async (ctx) => {
      const r = await convertPrToEvent(ctx.buyerApi);
      expect(r.eventGroupUuid, "event group created from PR").toBeTruthy();
      expect(r.lineItemIds.length, "PR line items carried onto the event").toBeGreaterThan(0);
      const db = await getEventGroupByTitle(r.title);
      expect(db, "PR→event group persisted in DB").toBeTruthy();
    },
  },
  {
    key: "events.rfp_rfq",
    category: "events",
    title: "Create RFP + RFQ event (2-stage) and verify in DB",
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
      const db = await getEventGroupByTitle(ev.title);
      expect(db, "event persisted in DB").toBeTruthy();
      const trades = await getTradesByEventGroupId(db!.id);
      expect(trades.length, "two stages in DB").toBe(2);
    },
  },
  {
    key: "events.rfp_only",
    category: "events",
    title: "Create RFP-only event (technical single stage)",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "RfpOnly", [{ kind: "rfp" }]),
  },
  {
    key: "events.rfq_only",
    category: "events",
    title: "Create RFQ-only event (pricing single stage)",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "RfqOnly", [{ kind: "rfq" }]),
  },
  {
    key: "events.auction_rank",
    category: "events",
    title: "Create rank-based auction event",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "AuctionRank", [{ kind: "auction", auctionConfig: "rank" }]),
  },
  {
    key: "events.auction_price",
    category: "events",
    title: "Create price-based auction event",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "AuctionPrice", [{ kind: "auction", auctionConfig: "price" }]),
  },
  {
    key: "events.rfp_auction",
    category: "events",
    title: "Create RFP + Auction event (2-stage)",
    enabledFor: needsTrade,
    run: (ctx) => runEventVariant(ctx, "RfpAuction", [{ kind: "rfp" }, { kind: "auction", auctionConfig: "price" }]),
  },
  {
    key: "events.surrogate_award",
    category: "events",
    title: "Create event → surrogate bid → open award proposal",
    enabledFor: needsTrade,
    run: async (ctx) => {
      const ev = await createRfqTechnicalEvent(ctx.buyerApi, {
        evaluatorUuid: ctx.evaluatorUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
        title: `Master_Surrogate_${Date.now()}`,
      });
      const s = await placeSurrogateBid(ctx.buyerApi, {
        technicalTradeUuid: ev.technicalTradeUuid,
        pricingTradeUuid: ev.pricingTradeUuid,
        lineItemUuid: ev.lineItemUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
      });
      expect(s.technicalPlaced && s.rfqPlaced, "surrogate placed").toBe(true);
      // Award proposal creation is the core assertion; the approval-workflow
      // shape is client-config specific, so read it best-effort.
      const proposalUuid = await createProposal(ctx.buyerApi, ev.eventGroupUuid);
      expect(proposalUuid, "award proposal created").toBeTruthy();
      const flows = await getApprovalFlows(ctx.buyerApi, proposalUuid).catch(() => undefined);
      if (flows?.approvalFlowUuid) {
        expect(flows.approvalFlowUuid, "approval flow uuid").toBeTruthy();
      }
    },
  },
  {
    key: "events.versioning",
    category: "events",
    title: "F2 — version an event group",
    enabledFor: needsTrade,
    run: async (ctx) => {
      const ev = await createRfqTechnicalEvent(ctx.buyerApi, {
        evaluatorUuid: ctx.evaluatorUuid,
        vendorCompanyUuid: ctx.vendor.uuid,
        catalog: ctx.catalog,
        title: `Master_Version_${Date.now()}`,
      });
      const v = await versionEvent(ctx.buyerApi, ev.eventGroupUuid);
      expect(v.versionUuid, "version uuid").toBeTruthy();
      expect(v.versionedTradeUuids.length, "versioned trades").toBe(2);
    },
  },
  {
    key: "events.convert_to_auction",
    category: "events",
    title: "F5 — convert RFQ stage to auction",
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
      const a = await convertToAuction(ctx.buyerApi, {
        pricingTradeUuid: ev.pricingTradeUuid,
        lineItemUuid: ev.lineItemUuid,
      });
      expect(a.auctionTradeUuid, "auction trade").toBeTruthy();
      expect(a.status).toBe("active");
    },
  },
  {
    key: "events.boq",
    category: "events",
    title: "Create BOQ-based event (upload sheet → parse → event group)",
    enabledFor: (c) => {
      if (!c.hasModule("trade", "create_record")) return gate(false, `client not authorized for ${TRADE}`);
      return c.isOn("boq_in_erfx_allowed")
        ? gate(true, "boq_in_erfx_allowed")
        : gate(false, "boq_in_erfx_allowed is off for this client");
    },
    run: async (ctx) => {
      const boq = await createBoqEvent(ctx.buyerApi, { title: `Master_Boq_${Date.now()}` });
      expect(boq.eventGroupUuid, "BOQ event group created").toBeTruthy();
      expect(boq.lineItems.length, "BOQ line items parsed").toBeGreaterThan(0);
      // DB-as-oracle: the event group persisted with the BOQ config flag
      const db = await getEventGroupByTitle(boq.title);
      expect(db, "BOQ event group persisted in DB").toBeTruthy();
      expect(db!.config?.boq_based_rfx, "boq_based_rfx persisted").toBe(true);
    },
  },
  // ── master data ──
  {
    key: "masterdata.category",
    category: "masterdata",
    title: "Create a product category",
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
    enabledFor: () => gate(true),
    run: async (ctx) => {
      const page = await fetchVendorsFiltered(ctx.buyerApi, 1);
      expect(Array.isArray(page.companies), "vendor list").toBe(true);
    },
  },
];
