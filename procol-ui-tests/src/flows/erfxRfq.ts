import { UiFlowContext, UiFlowModule, gate } from "../master/types.js";
import { createAndPublishErfx } from "./shared/createErfx.js";

/**
 * Flow: Direct single-stage RFQ — create an eRFX event with one RFQ stage,
 * fill the pricing sheet dynamically, invite a vendor, and publish.
 *
 * Self-verifying: asserts we land on a project/order URL with a real id, and
 * that no error toast fired during publish.
 */
export const erfxRfqFlow: UiFlowModule = {
  key: "events.rfq_only",
  category: "events",
  title: "Single-stage RFQ event: create & publish",
  covers: "eRFX create → 1 RFQ stage → dynamic sheet fill → invite vendor → publish → project created",
  dependsOn: ["auth"],

  enabledFor(config) {
    // Gate on trade create permission (event/trade creation) + rfx projects on.
    // Same meaning as the API layer's `trade:create_record` gate.
    const canCreateTrade = config.hasModule("trade", "create_record") || config.hasModule("trade");
    const rfxOn = config.flag("rfx_project_enabled");
    return canCreateTrade && rfxOn
      ? gate(true, "trade create permission + rfx_project_enabled")
      : gate(false, `missing ${!canCreateTrade ? "trade create permission" : ""}${!canCreateTrade && !rfxOn ? " and " : ""}${!rfxOn ? "rfx_project_enabled" : ""}`);
  },

  async run(ctx: UiFlowContext): Promise<void> {
    await createAndPublishErfx(ctx.page, { stages: ["rfq"], titlePrefix: "UI_Auto_RFQ" });
  },
};
