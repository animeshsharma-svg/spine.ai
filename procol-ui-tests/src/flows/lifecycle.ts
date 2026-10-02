import { expect } from "@playwright/test";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { createAndPublishErfx } from "./shared/createErfx.js";
import { EventsPage } from "../pages/EventsPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { generateEventTitle } from "../helpers/data.js";

/**
 * Cluster 1 — event lifecycle flows, each gated on the config flag that ships
 * the feature (see CONFIG_CATALOG.md). Config-driven: a flow runs only where its
 * flag is ON, and skips-with-reason elsewhere.
 */

// allow_draft_project_creation — save an event as a draft instead of publishing.
export const draftCreateFlow: UiFlowModule = {
  key: "event.draft_create",
  category: "lifecycle",
  title: "Create event and save as draft",
  covers: "eRFX create → Save as draft (no publish) → no error",
  dependsOn: ["auth"],
  enabledFor: (config: ClientConfig) =>
    config.flag("allow_draft_project_creation")
      ? gate(true, "allow_draft_project_creation")
      : gate(false, "allow_draft_project_creation off"),
  async run(ctx) {
    await createAndPublishErfx(ctx.page, { stages: ["rfq"], mode: "draft", titlePrefix: "UI_Auto_Draft" });
  },
};

// scheduled_events_enabled — schedule an event to start later, then publish.
export const scheduledEventFlow: UiFlowModule = {
  key: "event.scheduled",
  category: "lifecycle",
  title: "Create a scheduled (future-start) event",
  covers: "single-stage RFQ → Schedule Event drawer (start later) → Save Schedule → publish",
  dependsOn: ["auth"],
  enabledFor: (config: ClientConfig) =>
    (config.hasModule("trade") || config.hasModule("trade", "create_record")) && config.flag("scheduled_events_enabled")
      ? gate(true, "trade + scheduled_events_enabled")
      : gate(false, "scheduled_events_enabled off"),
  async run(ctx) {
    const events = new EventsPage(ctx.page);
    const ss = new SingleStagePage(ctx.page);
    const title = generateEventTitle("UI_Auto_Scheduled");

    await events.goto();
    await events.startCreate("single-stage");
    await ss.configure({ eventType: "rfq", awarding: "lot" });
    await ss.setTitle(title);
    await ss.selectBuyTemplate();
    await ss.fillFirstLineItem("a");
    await ss.scheduleForLater();
    await ss.inviteVendor();
    await ss.publish(title);
    await ss.waitForRedirectToProject();
    expect(ss.projectId(), "scheduled event should publish with an id").toBeTruthy();
    const err = await ss.errorToastText(1_000);
    expect(err, `no error toast expected after publishing scheduled event (got: ${err})`).toBeFalsy();
  },
};
