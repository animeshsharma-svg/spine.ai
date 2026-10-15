import { expect, type Page } from "@playwright/test";
import { CONFIG } from "../../config.js";
import { buyerApi } from "../../support/buyerApi.js";
import { VendorPortalPage } from "../../pages/VendorPortalPage.js";
import { vendorLogins, qaVendorLogins, allowRealVendors } from "../../db/qaVendors.js";
import { focusFrames } from "../../support/liveCursor.js";

/**
 * THE VENDORS BID ON THE EVENT THE JOURNEY BUILT.
 *
 * Ticking "Place a bid" next to an event type used to run a second journey
 * (bid.submit) that built a single-stage RFQ of its own, searched for a vendor
 * called "AMD" and bid on that — so the event the reader asked for was never
 * bid on, and the vendor side narrated nothing. Now the event journey carries
 * on: after the publish, UI_BIDDERS vendors invited to THIS event each sign in
 * to the vendor portal in their own browser and bid, every step a `[bid]` line,
 * with the live view following them (focusFrames).
 *
 * Who bids: the vendors actually invited, read back from the event through the
 * API (`get_audience`, 20 a page — the participant chips show four names and
 * "+156"), matched by exact company name to this client's vendors that have a
 * login (read-only), the profile's own vendor first. With
 * SPINE_QA_VENDORS_ONLY=1, the client's QA test vendors only.
 */

/** How many vendors bid after the publish (the dashboard's "Place a bid"): 0 = none. */
export const biddersWanted = (): number => Math.max(0, Math.min(4, Math.floor(Number(process.env.UI_BIDDERS) || 0)));

/** Every vendor invited to the event, by name, read through the API. Null when it cannot be read. */
async function invitedNames(projectId: string, buyer: Page): Promise<string[] | null> {
  const api = await buyerApi(buyer);
  if (!api) return null;
  try {
    const names: string[] = [];
    for (let page = 1; page <= 25; page++) {
      const res = await api.get(`/event_groups/${projectId}/get_audience?page=${page}`);
      if (!res.ok()) return names.length ? names : null;
      const body: any = await res.json().catch(() => ({}));
      for (const v of body?.vendors ?? []) if (v?.name) names.push(String(v.name).trim());
      if (page >= Number(body?.total_pages ?? 1)) break;
    }
    return names;
  } finally {
    await api.dispose().catch(() => {});
  }
}

/** The vendors that bid, in order: invited to the event, able to sign in, the profile's own first. */
export async function pickBidders(invited: string[], n: number): Promise<Array<{ name: string; email: string }>> {
  const on = new Set(invited.map((x) => x.trim().toLowerCase()).filter(Boolean));
  const pool = allowRealVendors() ? await vendorLogins() : await qaVendorLogins();
  const onEvent = pool.filter((v) => on.has(v.name.trim().toLowerCase()));
  const own = onEvent.filter((v) => v.email.toLowerCase() === CONFIG.vendorEmail.toLowerCase());
  return [...own, ...onEvent.filter((v) => !own.includes(v))].slice(0, n);
}

/** Each picked vendor signs in to the vendor portal and bids on the event. Returns how many bid. */
export async function vendorsBid(buyer: Page, ev: { title: string; projectId: string | null }, n: number): Promise<number> {
  const invited = ev.projectId ? await invitedNames(ev.projectId, buyer) : null;
  if (!invited) throw new Error("the event's invited vendors could not be read back from the API, so no vendor could be picked to bid");
  const bidders = await pickBidders(invited, n);
  console.log(
    `[bid] ${invited.length} vendor(s) are invited to the event; ` +
      (bidders.length
        ? `${bidders.map((b) => b.name).join(" and ")} will bid${bidders.length < n ? ` (asked for ${n}; only ${bidders.length} of the invited can sign in)` : ""}`
        : "none of them can sign in to the vendor portal"),
  );
  expect(bidders.length, `a vendor invited to the event that can sign in to the vendor portal (${invited.length} invited)`).toBeGreaterThan(0);

  const browser = buyer.context().browser();
  if (!browser) throw new Error("no browser to open the vendor portal in");
  let done = 0;
  for (const [i, v] of bidders.entries()) {
    // Its own browser context: the buyer's session must not be reused, or the
    // run would test the buyer's view of the portal, not the vendor's.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const release = focusFrames(page);
    try {
      console.log(`[bid] vendor ${i + 1} of ${bidders.length}: ${v.name} signs in to the vendor portal (${v.email})`);
      const portal = new VendorPortalPage(page);
      await portal.goto();
      const how = await portal.login(v.email);
      console.log(`[bid] ${v.name} is signed in with ${how}`);
      await portal.openEvent(ev.title);
      console.log(`[bid] ${v.name} opened the event`);
      await portal.startBidding(ev.title);
      const cells = await portal.fillBid(100 + i * 10);
      console.log(`[bid] ${v.name} ${portal.lastFill || `filled ${cells} price cell(s)`}`);
      await portal.submitBid();
      expect(await portal.bidSubmitted(), `${v.name}'s quote should be confirmed as submitted`).toBeTruthy();
      console.log(`[bid] ${v.name}'s bid is submitted`);
      done++;
    } finally {
      release();
      await ctx.close().catch(() => {});
    }
  }
  return done;
}
