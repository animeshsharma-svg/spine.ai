import { expect } from "@playwright/test";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { EventsPage } from "../pages/EventsPage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";

/**
 * Display / assertion flows — lightweight nav-and-assert checks that a config
 * flag's UI effect is present. Cheap (no event creation), config-gated.
 */

// show_draft_tab — the "Draft" tab appears on the orders/projects list.
export const showDraftTabFlow: UiFlowModule = {
  key: "display.draft_tab",
  category: "display",
  title: "Orders list shows the Draft tab",
  covers: "nav /orders → assert Draft tab visible (show_draft_tab)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.flag("show_draft_tab") ? gate(true, "show_draft_tab") : gate(false, "show_draft_tab off"),
  async run(ctx) {
    const events = new EventsPage(ctx.page);
    await events.goto();
    await events.dismissDistractions();
    const tab = await events.find(
      [
        ctx.page.getByRole("tab", { name: /draft/i }),
        ctx.page.getByRole("link", { name: /^draft/i }),
        ctx.page.getByText(/^drafts?$/i),
      ],
      { label: "draft-tab", timeout: TIMEOUTS.MEDIUM },
    );
    expect(tab, "Draft tab should be visible on the orders list").toBeTruthy();
  },
};

// is_po_configurations_allowed — PO configurations screen is reachable.
export const poConfigurationsFlow: UiFlowModule = {
  key: "display.po_configurations",
  category: "display",
  title: "PO configurations screen is available",
  covers: "nav /purchase-orders → assert PO configuration entry (is_po_configurations_allowed)",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) =>
    c.hasModule("po") && c.flag("is_po_configurations_allowed")
      ? gate(true, "po module + is_po_configurations_allowed")
      : gate(false, "po config not allowed"),
  async run(ctx) {
    await ctx.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/purchase-orders`, NAV);
    await ctx.page.waitForLoadState("domcontentloaded").catch(() => {});
    const events = new EventsPage(ctx.page);
    await events.dismissDistractions();
    const entry = await events.find(
      [
        ctx.page.getByRole("button", { name: /configuration/i }),
        ctx.page.getByText(/configuration/i),
        ctx.page.getByRole("tab", { name: /configuration/i }),
      ],
      { label: "po-config", timeout: TIMEOUTS.MEDIUM },
    );
    expect(entry, "PO configuration entry should be present").toBeTruthy();
  },
};
