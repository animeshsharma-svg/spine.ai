import { expect } from "@playwright/test";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { EventsPage } from "../pages/EventsPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { generateEventTitle } from "../helpers/data.js";

/**
 * NEGATIVE UI FLOWS — what the console must REFUSE.
 *
 * Every other journey here proves the product can do something. These prove it
 * declines to do something it should not, which is the half of QA that catches
 * real damage: an event published with no vendor invited is an event nobody can
 * bid on, and the buyer only finds out when the deadline passes.
 *
 * A negative journey passes when the product BLOCKS the action. So the
 * assertion is inverted: no redirect to a project page, and ideally a
 * validation message saying why. Both are checked, because "no redirect" alone
 * could also mean the click silently did nothing — which is a different bug,
 * and the report says which of the two happened.
 */

function tradeGate(config: ClientConfig) {
  const canCreate = config.hasModule("trade", "create_record") || config.hasModule("trade");
  return canCreate ? gate(true, "trade create") : gate(false, "missing trade create");
}

export const publishWithoutVendorFlow: UiFlowModule = {
  key: "validation.publish_without_vendor",
  category: "validation",
  title: "Publishing without a vendor is refused",
  covers:
    "single-stage RFQ → template → line item → NO vendor invited → publish must be blocked (validation message, no project created)",
  dependsOn: ["auth"],
  enabledFor: tradeGate,
  async run(ctx) {
    const page = ctx.page;
    const events = new EventsPage(page);
    const ss = new SingleStagePage(page);
    const title = generateEventTitle("UI_Auto_NEG_NoVendor");

    await events.goto();
    await events.startCreate("single-stage");
    await ss.configure({ eventType: "rfq", awarding: "lot" });
    await ss.setTitle(title);
    await ss.selectBuyTemplate();
    await ss.fillFirstLineItem("a");

    // The whole point of the case: the vendor step is skipped on purpose.
    await ss.publish(title);

    // Give the app the same moment it gets on the happy path to redirect, then
    // assert it did NOT. A short wait, not a long one: we are proving absence.
    await page.waitForTimeout(4_000);
    const projectId = ss.projectId();
    const message = await ss.errorToastText(2_000);

    expect(
      projectId,
      `the event was PUBLISHED with no vendor invited (project ${projectId}) — buyers can publish an event nobody can bid on`,
    ).toBeFalsy();

    // Blocked, but silently? Say so rather than passing: a refusal with no
    // message leaves the buyer clicking Publish and nothing happening.
    expect(
      message,
      "publish was blocked, but the app showed no validation message explaining why",
    ).toBeTruthy();
  },
};

export const VALIDATION_FLOWS: UiFlowModule[] = [publishWithoutVendorFlow];
