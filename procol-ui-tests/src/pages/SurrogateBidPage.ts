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
    const boxes = this.page.locator(".ant-drawer-content, .ant-modal-content, [role='dialog']");
    // The price sheet's drawer carries submit-bid-button; a technical stage's is a response form
    // under the same "Add Bid for <vendor>" title with a plain Submit (26 Oct, B31: it opened and
    // the step said it had not).
    return boxes.filter({ has: this.page.getByTestId("submit-bid-button") }).or(boxes.filter({ hasText: /add bid for/i })).last();
  }

  /** What the last addBidFor entered: a priced bid, or a technical stage's response form. */
  lastKind: "price" | "technical" = "price";

  /**
   * A technical stage's Add Bid: the vendor's answers to the questionnaire, not a price. Quick
   * Fill (Same as Requested) where a section offers it, then every answer still marked Required
   * is typed, then Submit. Returns how many answers were typed.
   */
  private async fillTechnicalResponse(drawer: ReturnType<SurrogateBidPage["drawer"]>): Promise<number> {
    const p = this.page;
    const quick = drawer.getByText(/^\s*quick\s*fill\s*$/i);
    for (let i = 0; i < Math.min(await quick.count().catch(() => 0), 10); i++) {
      await quick.nth(i).click({ timeout: 5_000 }).catch(() => {});
      // The menu this Quick Fill opened — a visible one: Procol keeps each section's used menu in the page,
      // hidden, and .first() picked the first section's for the second (29 Oct, plan-mvt753ce).
      const same = p.getByRole("menuitem", { name: /same as requested/i }).or(p.getByText(/^\s*same as requested\s*$/i)).filter({ visible: true }).last();
      if (await same.waitFor({ state: "visible", timeout: 2_500 }).then(() => true).catch(() => false)) await same.click({ timeout: 3_000 }).catch(() => {});
      // Never Escape here: in the Add Bid drawer Escape closes the whole form, unsent (plan-mvt753ce). A menu
      // left open is closed by clicking its Quick Fill again.
      else if (await p.locator(".ant-dropdown:not(.ant-dropdown-hidden), [role='menu']").filter({ visible: true }).count().catch(() => 0)) {
        await quick.nth(i).click({ timeout: 3_000 }).catch(() => {});
      }
      await this.pause(800);
      if (!(await drawer.isVisible().catch(() => false))) throw new Error("the Add Bid form closed while its answers were being filled, before it was submitted");
    }
    let typed = 0;
    for (let round = 0; round < 30; round++) {
      const empty = drawer.getByText(/^\s*\(required\)\s*\*?\s*$/i).first();
      if (!(await empty.isVisible().catch(() => false))) break;
      await empty.scrollIntoViewIfNeeded().catch(() => {});
      await empty.click({ timeout: 3_000 }).catch(() => {});
      await empty.dblclick({ timeout: 3_000 }).catch(() => {});
      // The answer box that just opened, in this form (not the page's last field, which can be the
      // "Surrogate Bid Reference" box or a search box behind the drawer).
      const box = drawer.locator("textarea:visible, [contenteditable='true']:visible, input[type='text']:visible").last();
      if (!(await box.count().catch(() => 0))) break;
      await box.fill("As per the requested specification", { timeout: 3_000 }).catch(() => {});
      await p.keyboard.press("Tab").catch(() => {});
      await this.pause(400);
      typed++;
    }
    return typed;
  }

  /**
   * Get to the participant list of a published event.
   *
   * The list lives on a STAGE tab, not the project tab, and selecting a stage
   * navigates — so each candidate tab is tried and the arrival is waited for
   * rather than assumed.
   */
  async openParticipants(stage: "pricing" | "technical" = "pricing"): Promise<boolean> {
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
    // stage "technical": a two-stage event's Technical Stage, where Add Bid enters the vendor's technical
    // response (27 Oct, VB04 — the run had gone to the RFQ although the case wanted the technical answer).
    const pricing = (stage === "technical"
      ? p.getByRole("tab").filter({ hasText: /technical/i })
      : p.getByRole("tab").filter({ hasText: /\b(rfq|auction)\b/i })
    ).filter({ hasNotText: /withdrawn|commercials/i }).first();
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
    const onTechnical = stage === "technical" ? 0 : await p.getByRole("tab", { name: /technical stage/i, selected: true }).count().catch(() => 0);
    if ((onTechnical || !(await found())) && stage !== "technical" && (await pricingTab.count().catch(() => 0))) {
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
        if (stage !== "technical" && /technical/i.test(label) && (await pricingTab.count().catch(() => 0))) continue;
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
    // A click that lands while the stage page is still arriving is lost: the stage opens on Responses
    // (27 Oct, VB04). Once more if the list's search box has not come — after giving the first click time, or
    // both take effect and the late one redraws the page under the Add Bid drawer.
    const listBox = p.getByPlaceholder(/search vendors?/i).first();
    if (!(await listBox.waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false))) {
      const tab = p.getByRole("tab", { name: /^\s*participants\s*$/i }).filter({ visible: true }).first();
      if ((await tab.count()) && (await tab.getAttribute("aria-selected").catch(() => null)) !== "true") {
        await tab.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        console.log("[surrogate] the Participants tab did not open on the first click — clicked it again");
      }
    }
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
  async addBidFor(vendor: string | undefined, price: number, alreadyBid: string[] = [], stage: "pricing" | "technical" = "pricing"): Promise<string> {
    const p = this.page;
    if (!(await this.openParticipants(stage))) {
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
      let found = false;
      const offered: string[] = [];
      for (let i = 0; i < (await buttons.count()); i++) {
        const text = await this.rowTextFor(buttons.nth(i));
        offered.push(text.slice(0, 40));
        if (text && !alreadyBid.some((prev) => text.includes(prev) || prev.includes(text))) {
          button = buttons.nth(i);
          chosen = text.slice(0, 40);
          found = true;
          break;
        }
      }
      // Never fall back to "the first": that bid for a vendor the plan had kept for the vendor portal (29 Oct).
      if (!found) throw new Error(`every vendor offering Add Bid is already taken in this plan (${offered.join(" | ") || "none offered"}) — a surrogate bid for another vendor needs one more vendor on the event`);
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

    // The rows re-render when the list refetches (the "selected vendors" switch, a stage switch just before), and
    // the drawer belongs to its row: a click during that opened nothing, or a drawer that then vanished (27 Oct,
    // VB04 on a two-stage RFQ). Let the list settle, and click once more if no drawer comes.
    await p.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await button.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await button.click({ timeout: TIMEOUTS.MEDIUM });

    const drawer = this.drawer();
    let opened = await drawer
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    if (!opened && (await button.isVisible().catch(() => false))) {
      console.log("[surrogate] no Add Bid drawer after the first click (the row re-rendered) — clicking Add Bid again");
      await this.pause(1_500);
      await button.click({ timeout: TIMEOUTS.MEDIUM }).catch(() => {});
      opened = await drawer.waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).then(() => true).catch(() => false);
    }
    if (!opened) throw new Error("the Add Bid drawer did not open after clicking Add Bid");

    this.lastKind = "price";
    const technical = !(await drawer.getByTestId("submit-bid-button").count().catch(() => 0)) && (await drawer.getByText(/vendor response/i).count().catch(() => 0)) > 0;
    if (technical) {
      this.lastKind = "technical";
      const typed = await this.fillTechnicalResponse(drawer);
      if (!(await drawer.isVisible().catch(() => false))) throw new Error("the Add Bid form closed before it was submitted — nothing was sent");
      const send = drawer.getByRole("button", { name: /^\s*submit\s*$/i }).last();
      if (!(await send.count())) throw new Error("the Add Bid drawer opened as a technical response form, but it has no Submit button");
      if (await send.isDisabled().catch(() => false)) throw new Error(`the technical response form's Submit stays disabled after Quick Fill and ${typed} typed answer(s) — a required answer is still empty`);
      await send.click({ timeout: TIMEOUTS.MEDIUM });
      await this.waitForSpinnerHidden();
      await this.clickIfPresent([this.page.getByRole("dialog").getByRole("button", { name: /^(yes|confirm|submit|ok)/i })], { label: "surrogate-confirm", timeout: TIMEOUTS.SHORT });
      await this.pause(1_500);
      const err = await this.errorToastText(2_000);
      if (err) throw new Error(`the technical response was rejected: ${err}`);
      const closed = await drawer.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG }).then(() => true).catch(() => false);
      if (!closed) throw new Error("the technical response form was submitted but stayed open, and the app said nothing");
      console.log(`[surrogate] technical response submitted for ${chosen} (Quick Fill + ${typed} typed answer(s))`);
      return chosen;
    }

    // No price at all (a case checking the price is required, 27 Oct SB09): type nothing and judge Submit.
    if (Number.isNaN(price)) {
      const submitNoPrice = drawer.getByTestId("submit-bid-button");
      if (await submitNoPrice.isDisabled().catch(() => false)) {
        await p.keyboard.press("Escape").catch(() => {});
        throw new Error("blocked: Submit Bid stays disabled with no price entered — Procol does not take a bid without a price");
      }
      await submitNoPrice.click({ timeout: TIMEOUTS.MEDIUM }).catch(() => {});
      const said = await this.errorToastText(4_000);
      if (said) throw new Error(`blocked: ${said} — Procol refused the bid with no price`);
      throw new Error("Procol took a surrogate bid with no price — Submit was enabled and nothing refused it");
    }
    let filled = await this.fillBidSheet(drawer, price);
    // The stage page can re-render under the drawer and close it (27 Oct, VB04: a late tab switch; the Submit
    // click then waited on a drawer that was gone). Open it once more and type the price again.
    if (!(await drawer.isVisible().catch(() => false))) {
      console.log("[surrogate] the Add Bid drawer closed by itself before Submit (the page re-rendered) — opening it again");
      await this.pause(2_000);
      await button.click({ timeout: TIMEOUTS.MEDIUM });
      await drawer.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
      filled = await this.fillBidSheet(drawer, price);
    }
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
      // A price of 0 or below that leaves Submit disabled is Procol refusing the price (27 Oct, SB10: -50),
      // not the sheet missing the typing — said as "blocked:" so an attempt counts it as the refusal.
      if (price <= 0) throw new Error(`blocked: Submit Bid stays disabled for a price of ${price} — Procol does not accept it`);
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
