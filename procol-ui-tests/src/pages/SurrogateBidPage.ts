import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { fillSheetPrices } from "../support/sheet.js";
import { TIMEOUTS } from "../config.js";
import { roundNow, cannotTakeBid } from "../db/pickEvent.js";

/**
 * Surrogate bidding — the buyer entering a bid on a vendor's behalf.
 *
 * Distinct from `bid.submit`, which signs into the vendor portal as the vendor.
 * Here the buyer never leaves the console: a published event's participant list
 * offers "Add Bid" per vendor, which opens a drawer holding that vendor's
 * sheet.
 *
 * The contract, from the app (`vendorListItem.jsx`, `addBidDrawer.jsx`):
 *  - the trigger is `[data-testid="add-bid-button"]`, rendered per vendor and
 *    ONLY when that vendor is selected, the event is not withdrawn or draft,
 *    and its status is upcoming or live — unless
 *    `isAllowedToAddSurrogateBidPostExpiry` is on for the company;
 *  - the drawer's submit is `[data-testid="submit-bid-button"]`, and it stays
 *    DISABLED until at least one row has a price (`isSubmitDisabled` checks
 *    exactly that), so an empty drawer cannot be submitted;
 *  - the drawer does not render for knockout or dutch auctions, nor for
 *    technical stages (those use AddTechnicalBid instead).
 */
export class SurrogateBidPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** The open Add Bid drawer, identified by its own submit control. */
  private drawer() {
    return this.page
      .locator(".ant-drawer-content, .ant-modal-content, [role='dialog']")
      .filter({ has: this.page.getByTestId("submit-bid-button") })
      .last();
  }

  /**
   * Get to the participant list of a published event.
   *
   * The list lives on a STAGE tab, not the project tab, and selecting a stage
   * navigates — so each candidate tab is tried and the arrival is waited for
   * rather than assumed.
   */
  async openParticipants(): Promise<boolean> {
    const p = this.page;
    // Publishing redirects, and this runs immediately after. The project page's
    // own tabs arrive with that navigation — without waiting for them,
    // getByRole("tab") counted zero, the loop below never ran, and the report
    // was "surrogate bidding is unavailable" when the page had simply not
    // arrived yet.
    const ready = await p
      .getByRole("tab")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      console.log(`[surrogate] no tabs rendered on ${p.url()} — the event page did not load`);
      return false;
    }
    await this.dismissDistractions();
    console.log(
      `[surrogate] on ${p.url()} · tabs: ${(await p.getByRole("tab").allTextContents()).map((t) => t.trim()).join(", ")}`,
    );

    // A surrogate bid is entered on the PRICING round. An event opens on
    // whichever stage tab it opens on — once a withdrawn Technical Stage, whose
    // Participants list had no vendors and no Add Bid — so go to the RFQ /
    // auction tab first, skipping any marked Withdrawn.
    const pricing = p.getByRole("tab").filter({ hasText: /\b(rfq|auction)\b/i }).filter({ hasNotText: /withdrawn|commercials/i }).first();
    if ((await pricing.count()) && (await pricing.getAttribute("aria-selected").catch(() => null)) !== "true") {
      const label = ((await pricing.textContent().catch(() => "")) ?? "").trim();
      await pricing.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await p.getByTestId("event-settings-button").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
      await this.dismissDistractions();
      console.log(`[surrogate] went to the pricing round's tab (${label}) — surrogate bids are entered there`);
    }

    const found = async () =>
      (await p.getByTestId("add-bid-button").count()) > 0 ||
      (await p.getByRole("tab", { name: /participants/i }).count()) > 0;

    // A surrogate PRICE bid belongs to the pricing stage. On a two-stage event the Technical
    // Stage tab comes first and has a Participants list too — the vendor picker, no Add Bid —
    // so stopping at the first stage with participants opened the wrong one (2026-10-09).
    const pricingTab = p.getByRole("tab", { name: /^\s*(rfq|auction|reverse auction|forward auction)\b/i }).first();
    const onTechnical = await p.getByRole("tab", { name: /technical stage/i, selected: true }).count().catch(() => 0);
    if ((onTechnical || !(await found())) && (await pricingTab.count().catch(() => 0))) {
      await pricingTab.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await p.getByTestId("event-settings-button").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
      await this.dismissDistractions();
    }
    if (!(await found())) {
      const tabs = p.getByRole("tab");
      const count = await tabs.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const label = ((await tabs.nth(i).textContent().catch(() => "")) ?? "").trim();
        if (/^(project\s+)?(details|overview|master\s+qcs|analytics|price\s+trends)$/i.test(label)) continue;
        if (/technical/i.test(label) && (await pricingTab.count().catch(() => 0))) continue;
        await tabs.nth(i).click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        // Selecting a stage NAVIGATES; its sub-tabs and audience list arrive
        // with the new page. The event header is the signal that it has.
        await p
          .getByTestId("event-settings-button")
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
          .catch(() => {});
        await this.dismissDistractions();
        if (await found()) break;
      }
    }

    // The participant list is its own sub-tab within the stage, and those
    // sub-tabs only exist once the stage's event header has rendered.
    await this.clickIfPresent([p.getByRole("tab", { name: /participants/i })], {
      label: "participants-tab",
      timeout: TIMEOUTS.MEDIUM,
    });
    // Wait for the audience list itself. The rows arrive from a separate
    // request after the tab switches, so a fixed pause found an empty list and
    // concluded surrogate bidding was unavailable — when in fact ten Add Bid
    // controls were about to appear.
    // Reaching the list is the success condition here — NOT finding an Add Bid
    // control. The list is paginated and only shows Add Bid for vendors
    // actually on the event, so a single-vendor event shows a first page of
    // other companies with no Add Bid at all. Demanding the control here made
    // that look like "surrogate bidding is unavailable" when the vendor was
    // simply on another page.
    const arrived = await p
      .getByPlaceholder(/search vendors?/i)
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    await this.dismissDistractions();
    // Only the event's own vendors: the full list pages through every company
    // the buyer deals with, and Add Bid appears only on the event's vendors.
    if (arrived) {
      const sw = p.getByText(/show only selected vendors/i).first().locator("xpath=following::*[@role='switch'][1]");
      if ((await sw.count().catch(() => 0)) && (await sw.getAttribute("aria-checked").catch(() => null)) !== "true") {
        await sw.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        // The filtered list refills from the server. With a couple of hundred
        // vendors invited it took well over 5 s: the run read "No vendors to
        // show" and stopped, while the same list showed ten Add Bid rows later.
        await p.getByTestId("add-bid-button").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
        console.log("[surrogate] showing only the event's own vendors");
      }
    }
    let count = await p.getByTestId("add-bid-button").count();
    // Rows can still be on their way: wait for them once before saying there are none.
    if (arrived && !count) {
      await p.getByTestId("add-bid-button").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
      count = await p.getByTestId("add-bid-button").count();
    }
    console.log(`[surrogate] participant list ${arrived ? "open" : "not found"} · ${count} vendor(s) offer Add Bid on this page`);
    return arrived || count > 0;
  }

  /** Can this event take a surrogate bid right now? Opens its pricing round's participant list to find out. */
  async canAddBid(title?: string): Promise<{ ok: boolean; why: string }> {
    if (!(await this.openParticipants())) return { ok: false, why: "its participant list could not be opened" };
    const n = await this.page.getByTestId("add-bid-button").count();
    if (n) return { ok: true, why: `Add Bid is offered for ${n} of its vendors` };
    // The screen only shows that no Add Bid is offered; the database says why.
    const r = title ? await roundNow(title) : null;
    const why = r && cannotTakeBid(r);
    return {
      ok: false,
      why: why
        ? `no vendor is offered Add Bid — ${why}`
        : r
          ? `none of its ${r.invited} invited vendors is offered Add Bid, though its RFQ round is open until ${r.endsAt}`
          : "no vendor on its RFQ round is offered Add Bid",
    };
  }

  /**
   * The text of the vendor row an Add Bid button belongs to.
   *
   * The button's immediate wrapper contains only "Add Bid" — the vendor's name
   * sits further up, on the `rowItem` Row from vendorListItem.jsx. Reading the
   * wrapper made every vendor look identical, so matching by name always fell
   * through to the first one.
   */
  private async rowTextFor(button: ReturnType<Page["getByTestId"]>): Promise<string> {
    for (const xp of [
      "xpath=ancestor::*[contains(@class,'rowItem')][1]",
      "xpath=ancestor::*[self::div or self::tr][3]",
      "xpath=ancestor::*[self::div or self::tr][2]",
    ]) {
      const row = button.locator(xp);
      if (!(await row.count().catch(() => 0))) continue;
      const raw = ((await row.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      // A row that says nothing but "Add Bid" is the wrapper, not the row.
      if (!raw || /^(add bid\s*)+(add price cap\s*)*$/i.test(raw)) continue;
      // Strip the row's own action labels so reports name the vendor and not
      // the buttons next to it.
      const text = raw
        .replace(/\s*-?\s*(add bid|add price cap|view price cap|edit bid|add weight params)\s*/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text;
    }
    return "";
  }

  /** Vendors currently offering an "Add Bid" control, by row text. */
  async biddableVendors(): Promise<string[]> {
    const buttons = this.page.getByTestId("add-bid-button");
    const out: string[] = [];
    for (let i = 0; i < (await buttons.count()); i++) {
      out.push((await this.rowTextFor(buttons.nth(i))).slice(0, 60));
    }
    return out;
  }

  /**
   * Enter a bid for one vendor and submit it.
   *
   * @param vendor substring of the vendor's name; the first biddable vendor is
   *        used when it is absent or matches nobody, since a test that just
   *        wants "a surrogate bid" should not have to know the audience.
   */
  async addBidFor(vendor: string | undefined, price: number, alreadyBid: string[] = []): Promise<string> {
    const p = this.page;
    if (!(await this.openParticipants())) {
      throw new Error(
        "the participant list could not be opened on this event, so no surrogate bid can be entered. " +
          "Surrogate bidding lives on a published trade event's Participants tab.",
      );
    }

    // Narrow the list BEFORE looking for the control: it is paginated, and a
    // named vendor is usually not on the first page.
    if (vendor) {
      const search = p.getByPlaceholder(/search vendors?/i).first();
      if (await search.count()) {
        await search.fill(vendor).catch(() => {});
        await this.pause(2_500);
        await p
          .getByTestId("add-bid-button")
          .first()
          .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
          .catch(() => {});
        console.log(`[surrogate] searched for "${vendor}" — ${await p.getByTestId("add-bid-button").count()} row(s) now offer Add Bid`);
      }
    }

    // A live event's list starts with EVERY vendor of the company (paginated); the event's own
    // participants — the only rows with Add Bid — can be pages away. "Show only selected vendors"
    // narrows it to them (seen on a published new version, 2026-10-09).
    if (!(await p.getByTestId("add-bid-button").count())) {
      const onlySelected = p
        .locator("div, span, label")
        .filter({ hasText: /^\s*Show only selected vendors\s*$/i })
        .last()
        .locator("xpath=following::button[@role='switch'][1]")
        .or(p.getByRole("switch").first())
        .first();
      if ((await onlySelected.count().catch(() => 0)) && (await onlySelected.getAttribute("aria-checked").catch(() => null)) !== "true") {
        await onlySelected.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        await p.getByTestId("add-bid-button").first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
        console.log(`[surrogate] showing only the event's participants — ${await p.getByTestId("add-bid-button").count()} row(s) offer Add Bid`);
      }
    }

    if (!(await p.getByTestId("add-bid-button").count())) {
      throw new Error(
        `no "Add Bid" control is available${vendor ? ` for "${vendor}"` : ""}. It appears only for a vendor ` +
          "who is on the event, and only while the event is upcoming or live — and never for knockout or " +
          "dutch auctions or technical stages (those use Add Technical Bid).",
      );
    }

    // Pick the row for the wanted vendor.
    let button = p.getByTestId("add-bid-button").first();
    let chosen = "the first biddable vendor";

    // With no name given, take the first vendor NOT already bid for in this
    // run. Two unnamed surrogate bids would otherwise both land on the same
    // vendor, and the event would end with one bid instead of two competing
    // ones — a test that asserts "two bids" would pass having created one.
    if (!vendor && alreadyBid.length) {
      const buttons = p.getByTestId("add-bid-button");
      for (let i = 0; i < (await buttons.count()); i++) {
        const text = await this.rowTextFor(buttons.nth(i));
        if (text && !alreadyBid.some((prev) => text.includes(prev) || prev.includes(text))) {
          button = buttons.nth(i);
          chosen = text.slice(0, 40);
          break;
        }
      }
    } else if (!vendor) {
      chosen = (await this.rowTextFor(button)).slice(0, 40) || chosen;
    }

    if (vendor) {
      const want = vendor.trim().toLowerCase();
      const buttons = p.getByTestId("add-bid-button");
      let matched = false;
      for (let i = 0; i < (await buttons.count()); i++) {
        const text = (await this.rowTextFor(buttons.nth(i))).toLowerCase();
        if (text.includes(want)) {
          button = buttons.nth(i);
          chosen = vendor;
          matched = true;
          break;
        }
      }
      if (!matched) {
        console.log(
          `[surrogate] no participant matched "${vendor}" (biddable: ${(await this.biddableVendors()).join(" | ")}) — using the first`,
        );
      }
    }

    await button.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await button.click({ timeout: TIMEOUTS.MEDIUM });

    const drawer = this.drawer();
    const opened = await drawer
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    if (!opened) throw new Error("the Add Bid drawer did not open after clicking Add Bid");

    const filled = await this.fillBidSheet(drawer, price);
    if (!filled) {
      throw new Error(
        "no price cell in the Add Bid drawer accepted a value, so the submit button stays disabled — " +
          "`isSubmitDisabled` requires at least one row with a price.",
      );
    }

    const submit = drawer.getByTestId("submit-bid-button");
    // The app disables submit until a price exists; check rather than click
    // blindly, so "nothing happened" is never the report.
    if (await submit.isDisabled().catch(() => false)) {
      throw new Error(
        `the drawer accepted ${filled} price(s) but its submit button is still disabled — the values did ` +
          "not register in the sheet's state",
      );
    }
    await submit.click({ timeout: TIMEOUTS.MEDIUM });
    await this.waitForSpinnerHidden();

    // Some builds confirm in a modal.
    await this.clickIfPresent(
      [this.page.getByRole("dialog").getByRole("button", { name: /^(yes|confirm|submit|ok)/i })],
      { label: "surrogate-confirm", timeout: TIMEOUTS.SHORT },
    );
    await this.pause(1_500);

    const err = await this.errorToastText(2_000);
    if (err) throw new Error(`the surrogate bid was rejected: ${err}`);
    await drawer.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG }).catch(() => {});
    console.log(`[surrogate] bid of ${price} submitted for ${chosen} (${filled} price cell(s))`);
    return chosen;
  }

  /**
   * Put a price into every price cell the drawer's sheet offers.
   *
   * The drawer reuses the data-grid, so cells carry `data-celltype`. Every
   * price-ish column is filled rather than only the first: a multi-line event
   * needs a price per line, and `isSubmitDisabled` passing on one row would
   * still leave an incomplete bid.
   */
  private async fillBidSheet(drawer: ReturnType<SurrogateBidPage["drawer"]>, price: number): Promise<number> {
    // One sheet filler for every bid-style drawer — see support/sheet.ts.
    const filled = await fillSheetPrices(this.page, drawer, price);
    await this.pause(600);
    return filled;
  }
}
