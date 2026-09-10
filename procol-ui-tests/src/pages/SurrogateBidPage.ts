import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../config.js";

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

    const found = async () =>
      (await p.getByTestId("add-bid-button").count()) > 0 ||
      (await p.getByRole("tab", { name: /participants/i }).count()) > 0;

    if (!(await found())) {
      const tabs = p.getByRole("tab");
      const count = await tabs.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const label = ((await tabs.nth(i).textContent().catch(() => "")) ?? "").trim();
        if (/^(project\s+)?(details|overview|master\s+qcs|analytics|price\s+trends)$/i.test(label)) continue;
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
    const count = await p.getByTestId("add-bid-button").count();
    console.log(`[surrogate] participant list ${arrived ? "open" : "not found"} · ${count} vendor(s) offer Add Bid on this page`);
    return arrived || count > 0;
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
      const text = ((await row.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      // A row that says nothing but "Add Bid" is the wrapper, not the row.
      if (text && !/^(add bid\s*)+(add price cap\s*)*$/i.test(text)) return text;
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
  async addBidFor(vendor: string | undefined, price: number): Promise<string> {
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
    const cells = drawer.locator(
      '[data-celltype="price"]:not([data-testid^="sheet-header"]), [data-celltype="participant_quantity"]:not([data-testid^="sheet-header"])',
    );
    let filled = 0;
    const total = await cells.count();
    for (let i = 0; i < total; i++) {
      const cell = cells.nth(i);
      if ((await cell.getAttribute("aria-disabled")) === "true") continue;
      const type = await cell.getAttribute("data-celltype");
      const value = type === "price" ? String(price) : "1";
      await cell.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
      await cell.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      let input = cell.locator("input, textarea").first();
      if (!(await input.count())) {
        await cell.dblclick({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        input = cell.locator("input, textarea").first();
      }
      if (!(await input.count())) continue;
      await input.fill(value).catch(() => {});
      await this.page.keyboard.press("Tab").catch(() => {});
      filled++;
    }
    // Fall back to any number input in the drawer when the grid shape differs.
    if (!filled) {
      const inputs = drawer.locator("input[type='number'], input.ant-input-number-input");
      for (let i = 0; i < (await inputs.count()); i++) {
        await inputs.nth(i).fill(String(price)).catch(() => {});
        filled++;
      }
    }
    await this.pause(600);
    return filled;
  }
}
