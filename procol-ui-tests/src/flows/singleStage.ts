import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { createAndPublishSingleStage } from "./shared/createSingleStage.js";

function tradeGate(config: ClientConfig) {
  const canCreate = config.hasModule("trade", "create_record") || config.hasModule("trade");
  return canCreate ? gate(true, "trade create") : gate(false, "missing trade create");
}

// ── Non-eRFX (single-stage) event types ───────────────────────────────────────
export const singleStageRfqFlow: UiFlowModule = {
  key: "events.single_stage_rfq",
  category: "events",
  title: "Single-stage (non-eRFX) RFQ: create & publish",
  covers: "quick-create → Configuration drawer (RFQ) → Buy template → sheet line item → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishSingleStage(ctx.page, { eventType: "rfq", awarding: "lot", titlePrefix: "UI_Auto_SS_RFQ" });
  },
};

export const singleStageRfpFlow: UiFlowModule = {
  key: "events.single_stage_rfp",
  category: "events",
  title: "Single-stage (non-eRFX) RFP: create & publish",
  covers: "quick-create → Configuration drawer (RFP, no sub-config) → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishSingleStage(ctx.page, { eventType: "rfp", titlePrefix: "UI_Auto_SS_RFP" });
  },
};

// ── Auction sub-types (selected in the Configuration drawer at creation) ────────
export const auctionPriceFlow: UiFlowModule = {
  key: "events.auction_price",
  category: "events",
  title: "Auction (price-based): create & publish",
  covers: "single-stage → Auction + Price Based → sheet → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishSingleStage(ctx.page, { eventType: "auction", auctionSubtype: "price", awarding: "lot", titlePrefix: "UI_Auto_AucPrice" });
  },
};

export const auctionTrafficLightFlow: UiFlowModule = {
  key: "events.auction_traffic_light",
  category: "events",
  title: "Auction (traffic-light): create & publish",
  covers: "single-stage → Auction + Traffic Light → sheet → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishSingleStage(ctx.page, { eventType: "auction", auctionSubtype: "traffic_light", awarding: "lot", titlePrefix: "UI_Auto_AucTL" });
  },
};

// ── Awarding modes (lot-wise vs line-item-wise), chosen at creation ────────────
export const awardLotWiseFlow: UiFlowModule = {
  key: "events.award_lot_wise",
  category: "events",
  title: "Lot-wise awarding RFQ: create & publish",
  covers: "single-stage RFQ → award the entire lot to a single vendor → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishSingleStage(ctx.page, { eventType: "rfq", awarding: "lot", titlePrefix: "UI_Auto_AwardLot" });
  },
};

export const awardLineItemWiseFlow: UiFlowModule = {
  key: "events.award_line_item_wise",
  category: "events",
  title: "Line-item-wise awarding RFQ: create & publish",
  covers: "single-stage RFQ → partially award to multiple vendors (line-item-wise) → publish",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    await createAndPublishSingleStage(ctx.page, { eventType: "rfq", awarding: "line_item", titlePrefix: "UI_Auto_AwardLine" });
  },
};
