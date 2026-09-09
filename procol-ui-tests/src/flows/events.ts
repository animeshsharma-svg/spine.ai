import { normalLineItems, lineItemCount } from "../master/params.js";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { createAndPublishErfx } from "./shared/createErfx.js";
import { EventDetailPage } from "../pages/EventDetailPage.js";
import { CreateEventPage } from "../pages/CreateEventPage.js";

/** Shared gate: can create trades and rfx projects are on. */
function tradeGate(config: ClientConfig) {
  const canCreate = config.hasModule("trade", "create_record") || config.hasModule("trade");
  const rfxOn = config.flag("rfx_project_enabled");
  return canCreate && rfxOn
    ? gate(true, "trade create + rfx_project_enabled")
    : gate(false, `missing ${!canCreate ? "trade create" : ""}${!canCreate && !rfxOn ? " + " : ""}${!rfxOn ? "rfx_project_enabled" : ""}`);
}

export const rfpOnlyFlow: UiFlowModule = {
  key: "events.rfp_only",
  category: "events",
  title: "Single technical (RFP) stage: create & publish",
  covers: "eRFX create → 1 technical/RFP stage → template + evaluator → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishErfx(ctx.page, { stages: ["rfp"], titlePrefix: "UI_Auto_RFP" });
  },
};

export const rfpRfqFlow: UiFlowModule = {
  key: "events.rfp_rfq",
  category: "events",
  title: "2-stage RFP + RFQ: create & publish",
  covers: "eRFX create → technical stage (template+evaluator) + RFQ stage (sheet) → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishErfx(ctx.page, { stages: ["rfp", "rfq"], titlePrefix: "UI_Auto_RFP_RFQ" });
  },
};

export const auctionRankFlow: UiFlowModule = {
  key: "events.auction_rank",
  category: "events",
  title: "Auction (rank-based): create & publish",
  covers: "eRFX auction stage → template + sheet → publish (default rank-based English auction)",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishErfx(ctx.page, { stages: ["auction"], titlePrefix: "UI_Auto_AucRank" });
  },
};

/**
 * RFQ → Auction is a CONVERSION, not a stage composition.
 *
 * `isValidStage()` in projectCreation.jsx refuses to hold an RFQ stage and an
 * Auction stage in one project, and the UI says so outright: "Remove Auction to
 * add RFQ". This flow used to ask for `stages: ["rfq", "auction"]`, which the
 * create screen could never satisfy — it quietly published a plain auction on
 * the leftover default tab and called it a pass.
 *
 * The real journey: publish an RFQ, then Settings → Convert to Auction →
 * Continue on the published event, which reopens the create screen in a NEW TAB
 * with `isRfqToAuction=true` and the RFQ's quotes/participants carried over.
 */
export const rfqAuctionFlow: UiFlowModule = {
  key: "events.rfq_auction",
  category: "events",
  title: "RFQ converted to Auction: publish, convert & publish again",
  covers: "eRFX RFQ publish → Settings → Convert to Auction → prefilled auction create screen → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    const rfq = await createAndPublishErfx(ctx.page, { stages: ["rfq"], titlePrefix: "UI_Auto_RFQ_Auc" });

    const detail = new EventDetailPage(ctx.page);
    if (!(await detail.openStageOfferingConversion())) {
      throw new Error(
        `"Convert to Auction" is not offered on any tab of the published RFQ ${rfq.projectId}. ` +
          `Last check: ${detail.lastReason}. The control needs an RFQ that is published (not draft) with ` +
          "vendor masking off (showConvertToAuction in eventHeader.jsx) — if Settings opened and simply did " +
          "not list it, this client has the feature gated off rather than the automation being wrong.",
      );
    }

    const auctionTab = await detail.convertToAuction();
    try {
      const createPage = new CreateEventPage(auctionTab);
      // The conversion screen arrives prefilled: template and sheet come from
      // the RFQ, so only the auction's own config and the publish remain.
      await createPage.inviteVendor();
      await createPage.publish(rfq.title);
      await createPage.waitForRedirectToProject();
      const err = await createPage.errorToastText(1_000);
      if (err) throw new Error(`converting the RFQ to an auction was rejected: ${err}`);
    } finally {
      await auctionTab.close().catch(() => {});
    }
  },
};

export const rfpAuctionFlow: UiFlowModule = {
  key: "events.rfp_auction",
  category: "events",
  title: "RFP then Auction (2-stage): create & publish",
  covers: "eRFX technical (RFP) stage + auction stage → template/evaluator + sheet → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishErfx(ctx.page, { stages: ["rfp", "auction"], titlePrefix: "UI_Auto_RFP_Auc" });
  },
};

export const multiProductFlow: UiFlowModule = {
  key: "events.multi_product",
  category: "events",
  title: "Multi-line-item RFQ: create & publish",
  covers: "eRFX RFQ with several line items → dynamic sheet fill for each row → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishErfx(ctx.page, {
      stages: ["rfq"],
      titlePrefix: "UI_Auto_Multi",
      // Dynamic: however many line items the run asked for (UI_LINE_ITEMS).
      products: normalLineItems(),
    });
  },
};
