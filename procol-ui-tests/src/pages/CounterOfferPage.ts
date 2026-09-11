import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../config.js";
import { fillSheetPrices } from "../support/sheet.js";
import { recordStuck } from "../oracle/stuck.js";

/**
 * The buyer's counter offer, from the comparison grid.
 *
 * Read from the product's own source (comparisonHeaderFormatter.jsx,
 * orderDetails.jsx): each vendor's column header in the comparison grid
 * (Master QCS) renders a "Counter Offer" button when that vendor's bid is
 * live and active, the event is in trade mode, the bid is not under approval
 * and the tenant has not hidden counter offers for RFQs. It opens
 * CounterOfferDrawer — the shared sheet component plus a remarks box — and
 * "Send" creates a pending task for the vendor, whose answer later shows as
 * COUNTER_OFFER_ACCEPTED / COUNTER_OFFER_MODIFIED on the bid.
 */
export class CounterOfferPage extends BasePage {
  private drawer() {
    return this.page.locator(".ant-drawer:not(.ant-drawer-hidden) .ant-drawer-content, .ant-modal:not([style*='display: none']) .ant-modal-content").last();
  }

  /** The vendor's column header in the comparison grid, by name (or the first with a Counter Offer control). */
  private vendorHeader(vendor?: string) {
    const headers = this.page.locator("[role='columnheader'], .rdg-header-row .rdg-cell, .rdg-cell[aria-colindex]");
    return vendor ? headers.filter({ hasText: new RegExp(vendor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first() : headers.filter({ has: this.page.getByRole("button", { name: /counter offer/i }) }).first();
  }

  /**
   * Open the drawer for this vendor, fill the counter price, send it.
   * Returns what it did, in words; throws with the screen's own words when the
   * product refuses or the control is not offered.
   */
  async sendCounterOffer(opts: { vendor?: string; price: number; remark?: string }): Promise<string> {
    const p = this.page;
    await this.dismissDistractions();

    // 1 · the per-vendor control. Some builds hover-reveal the header actions.
    const header = this.vendorHeader(opts.vendor);
    if (await header.count()) await header.hover({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    const inHeader = header.getByRole("button", { name: /counter offer/i }).first();
    const anywhere = p.getByRole("button", { name: /^counter offer$/i }).first();
    const control = (await inHeader.count()) ? inHeader : anywhere;
    if (!(await control.count())) {
      const offered = (await p.getByRole("button").allTextContents()).map((t) => t.trim()).filter(Boolean);
      await recordStuck(p, {
        label: "counter-offer:control",
        message: `no Counter Offer control on this grid${opts.vendor ? ` for ${opts.vendor}` : ""}`,
        triedCandidates: ["columnheader:has-text(vendor) button[name=/counter offer/i]", "button[name=/^counter offer$/i]"],
        healerTried: false,
      }).catch(() => {});
      throw new Error(
        `no Counter Offer control on the comparison grid${opts.vendor ? ` for ${opts.vendor}` : ""} — the product offers it only while the bid is live and active, not under approval, and not hidden for RFQs by tenant config. Buttons on screen: ${offered.slice(0, 12).join(", ")}`,
      );
    }
    await control.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await this.click([control], { label: "counter-offer:open", timeout: TIMEOUTS.MEDIUM });

    // 2 · the drawer, and its sheet.
    const drawer = this.drawer();
    await drawer.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await this.waitForSpinnerHidden();
    const filled = await fillSheetPrices(p, drawer, opts.price);
    if (!filled) {
      await recordStuck(p, {
        label: "counter-offer:sheet",
        message: "the counter offer drawer opened but no price cell could be filled",
        triedCandidates: ['[data-celltype="price"]', "input[type='number']"],
        healerTried: false,
      }).catch(() => {});
      throw new Error("the Counter Offer drawer opened, but its sheet has no fillable price cell — the drawer's shape needs a look (captured)");
    }
    const remarks = drawer.locator("textarea, input[placeholder*='remark' i]").first();
    if (await remarks.count()) await remarks.fill(opts.remark ?? "Counter offer from the QA platform").catch(() => {});

    // 3 · send. The drawer's primary action is "Send" on this build's strings
    //     ("Send Bulk Counter Offer" for the bulk path); accept close synonyms.
    const send = drawer.getByRole("button", { name: /^(send|submit|send counter offer|counter offer)$/i }).first();
    if (!(await send.count())) {
      const buttons = (await drawer.getByRole("button").allTextContents()).map((t) => t.trim()).filter(Boolean);
      throw new Error(`the Counter Offer drawer has no Send control — buttons: ${buttons.join(", ")}`);
    }
    if (await send.isDisabled().catch(() => false)) throw new Error("the Counter Offer drawer's Send is disabled — the sheet is incomplete");
    await send.click({ timeout: TIMEOUTS.MEDIUM });
    await this.clickIfPresent([p.getByRole("dialog").getByRole("button", { name: /^(yes|confirm|send|ok)/i })], { label: "counter-offer:confirm", timeout: TIMEOUTS.SHORT }).catch(() => {});
    const err = await this.errorToastText(2_500);
    if (err) throw new Error(`the counter offer was refused: ${err}`);
    const ok = await this.successToastText(4_000);
    await this.waitForSpinnerHidden();
    return `counter offer of ${opts.price} sent${opts.vendor ? ` to ${opts.vendor}` : ""}${ok ? ` — "${ok}"` : ""} (${filled} cell(s))`;
  }

  /** The grid marks a vendor whose bid carries a pending counter offer. */
  async counterOfferVisibleFor(vendor?: string): Promise<boolean> {
    const scope = vendor ? this.vendorHeader(vendor) : this.page.locator("body");
    const marks = scope.locator("[title*='Counter offer' i], [title*='counter offer' i], :text-matches('counter offer', 'i')");
    return (await marks.count()) > 0;
  }
}
