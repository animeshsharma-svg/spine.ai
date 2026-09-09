import { expect } from "@playwright/test";
import { UiFlowModule, gate } from "../master/types.js";
import { ClientConfig } from "../master/config.js";
import { EventsPage } from "../pages/EventsPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { VendorPortalPage } from "../pages/VendorPortalPage.js";
import { generateEventTitle } from "../helpers/data.js";
import { CONFIG } from "../config.js";

/**
 * bid.submit — the keystone pure-UI bid flow. Buyer creates+publishes an RFQ
 * inviting a known test vendor with the bid window OPEN, then the vendor logs
 * into the supplier portal (separate browser context), opens the event, fills
 * the bid and submits. Everything through the UI, no API seeding.
 */
export const bidSubmitFlow: UiFlowModule = {
  key: "bid.submit",
  category: "bid",
  title: "Vendor submits a bid (pure UI, buyer→vendor)",
  covers: "buyer single-stage RFQ inviting a vendor → vendor portal login → open event → fill bid → submit",
  dependsOn: ["auth"],
  enabledFor: (c: ClientConfig) => {
    const ok = (c.hasModule("trade", "create_record") || c.hasModule("trade")) && !!CONFIG.vendorEmail && !!CONFIG.vendorUrl;
    return ok ? gate(true, "trade create + vendor portal configured") : gate(false, "no trade create or vendor not configured");
  },
  async run(ctx) {
    const buyer = ctx.page;
    const events = new EventsPage(buyer);
    const ss = new SingleStagePage(buyer);
    const title = generateEventTitle("UI_Auto_Bid");
    // The known test vendor's company name for the participant search.
    const vendorSearch = process.env.VENDOR_SEARCH || "AMD";

    // ── Buyer: create + publish an RFQ inviting the specific vendor ──────────
    await events.goto();
    await events.startCreate("single-stage");
    await ss.configure({ eventType: "rfq", awarding: "lot" });
    await ss.setTitle(title);
    await ss.selectBuyTemplate();
    await ss.fillFirstLineItem("a");
    const added = await ss.addParticipant(vendorSearch);
    if (!added) await ss.inviteVendor(); // fallback: whole audience (vendor likely included)
    await ss.publish(title);
    await ss.waitForRedirectToProject();
    expect(ss.projectId(), "buyer event should be published with an id").toBeTruthy();

    // ── Vendor: fresh context, login, open the event, bid, submit ───────────
    const browser = buyer.context().browser();
    if (!browser) throw new Error("no browser handle for vendor context");
    const vendorCtx = await browser.newContext();
    try {
      const vendorPage = await vendorCtx.newPage();
      const vp = new VendorPortalPage(vendorPage);
      await vp.goto();
      await vp.login();
      await vp.openEvent(title);
      await vp.startBidding(title);
      const filled = await vp.fillBid(100);
      expect(filled, "at least one bid price cell should be filled").toBeGreaterThan(0);
      await vp.submitBid();
      expect(await vp.bidSubmitted(), "vendor bid should be submitted").toBeTruthy();
    } finally {
      await vendorCtx.close();
    }
  },
};
