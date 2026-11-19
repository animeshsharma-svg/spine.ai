import { isNoiseMessage } from "../oracle/noise.js";
import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { InlineSheet } from "../helpers/inlineSheet.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { randomNumber } from "../helpers/data.js";
import { qaVendorNames, isQaVendorName, allowRealVendors, NoQaVendorError } from "../db/qaVendors.js";
import { vendorCount } from "../master/params.js";

export type EventType = "rfq" | "rfp" | "auction";
export type AuctionSubtype = "rank" | "price" | "traffic_light" | "knockout" | "dutch";
export type Awarding = "lot" | "line_item";

const EVENT_TYPE_LABEL: Record<EventType, RegExp> = {
  rfq: /^RFQ$/i,
  rfp: /^RFP$/i,
  auction: /^Auction$/i,
};
const SUBTYPE_LABEL: Record<AuctionSubtype, RegExp> = {
  rank: /Rank Based/i,
  price: /Price Based/i,
  traffic_light: /Traffic Light/i,
  // Knockout and Dutch cards exist on the drawer but are DISABLED on a fresh single-stage screen (the app's
  // tooltip: "Knockout auctions can be created only when converting an RFQ to an auction"); they are chosen on
  // the converted event's create screen (convert_to_auction) — orderConfigBlocks.jsx / auctionConfiguration.jsx
  knockout: /^Knockout/i,
  dutch: /Dutch Auction/i,
};
const AWARDING_LABEL: Record<Awarding, RegExp> = {
  lot: /entire lot to single vendor/i,
  line_item: /partially award .*multiple vendors/i,
};

export interface SingleStageConfig {
  eventType: EventType;
  auctionSubtype?: AuctionSubtype;
  awarding?: Awarding;
  /** Traffic light only: "Group traffic light by" Price (default) or Rank, and the GREEN / YELLOW bounds
   *  (defaults 3000 / 6000 by price, 1 / 3 by rank; "" leaves a bound empty on purpose). */
  trafficBy?: "price" | "rank";
  rangeLower?: number | string;
  rangeUpper?: number | string;
  /** "Dynamic Event Extension" (rank / price / traffic light auctions): tick or untick it; with it on, the
   *  Price | Rank choice, "Time Extension By" minutes (1 / 2 / 3 / 5 are presets, anything else is Custom),
   *  "Trigger time extension on last:" minutes and "Time extension on change in:" the top N bids. */
  dynamicExtension?: boolean;
  extensionOn?: "price" | "rank";
  extendByMinutes?: number | string;
  triggerMinutes?: number | string;
  topBids?: number;
  /** Knockout / Dutch only (the converted event's screen): "Starting Price" (the case's "base price"; "" clears it),
   *  "Ending Price" (Dutch), "Add Tick Size", and the "Offers on" choice. Omitted = left as the screen has it. */
  startPrice?: number | string;
  endPrice?: number | string;
  tickSize?: number | string;
  /** "Add Time Difference" (minutes between two successive offers; required with the tick size) */
  timeDifference?: number | string;
  offersOn?: "base_price" | "total_amount";
}

/**
 * The single-stage (non-eRFX) "quick create" event page
 * (`/orders/quick-create?singleStage=true`). Distinct from eRFX:
 *  - event type + auction sub-type + awarding mode are chosen in a
 *    "Configuration for Event" drawer opened from the Event Type chip;
 *  - line items are the pricing-template sheet itself (product/variant/qty/
 *    delivery/price cells), not a pre-sheet combobox.
 * All verified live on cpanel.ag-ri.in.
 */
export class SingleStagePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/orders/quick-create?singleStage=true`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.pause(1500);
    await this.dismissDistractions();
  }

  drawer() {
    return this.page
      .locator(".ant-drawer, [role='dialog']")
      .filter({ hasText: /Configuration for Event/i })
      .first();
  }

  /** Open the config drawer via the Event Type chip (shows RFP/RFQ/Auction). */
  async openConfigDrawer(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.dismissDistractions();
      await this.click(
        [
          this.page.getByRole("button", { name: /^(RFP|RFQ|Auction)\b/ }),
          this.page.getByText(/^(RFP|RFQ|Auction)\s*>/),
          // once an auction is chosen the chip reads its kind ("Rank on lot", "Price on item", "Traffic light …")
          this.page.getByRole("button", { name: /^(rank|price|traffic)\b.*\b(lot|item|light)\b/i }),
        ],
        { label: "event-type-chip", timeout: TIMEOUTS.MEDIUM, force: true },
      );
      // The drawer is open once its event-type radios have rendered.
      const ready = await this.find(
        [this.drawer().locator(".pro-radio-tabs__tab"), this.drawer().getByRole("radio")],
        { label: "config-drawer-ready", timeout: TIMEOUTS.SHORT },
      );
      if (ready) return;
    }
    throw new Error("config drawer did not open with event-type options");
  }

  /**
   * Choose event type (+ auction sub-type) and awarding mode in the drawer,
   * then Save. Selecting by role=radio name, falling back to clicking the card
   * that contains the label text.
   */
  /** Set when a traffic-light auction was configured — the sheet needs the same bounds per line item. */
  trafficLightRange: { green: string; yellow: string } | null = null;
  /** The case leaves the traffic-light ranges EMPTY on purpose: the sheet's Green / Yellow columns stay blank too. */
  leaveRangeCellsEmpty = false;

  /**
   * The traffic-light sheet carries two extra REQUIRED columns per line item —
   * "Green (Inclusive Range)*" and "Yellow (Inclusive Range)*" (captured
   * 2026-09-11 on the publish that never redirected). Fill them on row 1 from
   * the drawer's bounds. Returns how many cells took a value.
   */
  async fillRangeCells(): Promise<number> {
    if (!this.trafficLightRange) return 0;
    const p = this.page;
    const headers = p.locator("[data-testid^='sheet-header-']");
    const keys: Array<{ key: string; value: string }> = [];
    for (let i = 0; i < (await headers.count()); i++) {
      const h = headers.nth(i);
      const text = ((await h.textContent()) ?? "").toLowerCase();
      const key = ((await h.getAttribute("data-testid")) ?? "").replace("sheet-header-", "");
      if (/green/.test(text)) keys.push({ key, value: this.trafficLightRange.green });
      else if (/yellow/.test(text)) keys.push({ key, value: this.trafficLightRange.yellow });
    }
    let filled = 0;
    for (const { key, value } of keys) {
      const cell = p.locator(`[data-testid='sheet-cell-1-${key}']`).first();
      if (!(await cell.count())) continue;
      await cell.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
      await cell.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      let input = cell.locator("input, textarea").first();
      if (!(await input.count())) {
        await cell.dblclick({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        input = cell.locator("input, textarea").first();
      }
      if (!(await input.count())) continue;
      await input.fill(value).catch(() => {});
      await p.keyboard.press("Tab").catch(() => {});
      filled++;
    }
    return filled;
  }

  /** Toasts seen and closed while configuring (their words go in the step's detail). */
  closedNotices: string[] = [];
  /**
   * Close every antd notification toast. One sits in the top-right corner over the drawer's RFQ card
   * (UAT, 5 Nov): a forced click landed on the toast, the drawer closed and RFQ was never chosen.
   */
  private async closeNotices(): Promise<void> {
    // every call is bounded: a toast can vanish between being counted and being read, and a locator call with
    // no timeout then waits forever (5 Nov: a step hung 15 minutes until the run's budget closed the browser)
    const notes = this.page.locator(".ant-notification-notice:visible");
    for (let i = 0; i < 5; i++) {
      if (!(await notes.count().catch(() => 0))) return;
      const n = notes.first();
      const words = ((await n.innerText({ timeout: 1_000 }).catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (words && !this.closedNotices.includes(words.slice(0, 160))) this.closedNotices.push(words.slice(0, 160));
      // the browser-notifications prompt is declined ("Not now", the privacy-preserving answer); others are closed
      const notNow = n.getByRole("button", { name: /^not now$/i }).first();
      const x = n.locator(".ant-notification-notice-close").first();
      if (await notNow.count().catch(() => 0)) await notNow.click({ timeout: 2_000 }).catch(() => {});
      else if (await x.count().catch(() => 0)) await x.click({ timeout: 2_000 }).catch(() => {});
      await this.page.waitForTimeout(400).catch(() => {});
      if (await n.isVisible({ timeout: 500 }).catch(() => false)) await n.evaluate((el) => el.remove(), undefined, { timeout: 1_000 }).catch(() => {});
    }
  }

  async configure(cfg: SingleStageConfig): Promise<void> {
    await this.closeNotices();
    // The create screen opens with the company's default event type. When that is already the type asked for and
    // nothing else is to be set (no auction sub-type, no partial awarding), the drawer has nothing to do — and on
    // UAT (5 Nov) changing the type in it re-rendered the page and lost the choice. Leave it closed.
    {
      const chip = ((await this.page.getByRole("button", { name: /^(RFP|RFQ|Auction|rank|price|traffic|knockout|dutch)\b/i }).first().innerText({ timeout: 10_000 }).catch(() => "")) || "").trim();
      const wantNow = cfg.eventType === "auction" ? /auction|rank|price|traffic|knockout|dutch/i : cfg.eventType === "rfq" ? /^RFQ\b/i : /^RFP\b/i;
      if (wantNow.test(chip) && !cfg.auctionSubtype && cfg.awarding !== "line_item" && cfg.dynamicExtension === undefined) return;
    }
    await this.openConfigDrawer();
    const d = this.drawer();

    const pick = async (re: RegExp, label: string) => {
      await this.closeNotices();
      // Options are custom cards `div.pro-radio-tabs__tab[role=radio]` (not antd
      // radios). Click the card; force bypasses the inner text-node overlay.
      // Wait for the option to render first (awarding/sub-type appear only after
      // the event type is chosen), then click.
      await this.expect(
        [d.locator(".pro-radio-tabs__tab", { hasText: re }), d.getByRole("radio", { name: re }), d.getByText(re)],
        { label: `${label}-visible`, timeout: TIMEOUTS.MEDIUM },
      );
      // Click like a person (no force) and confirm the card reads checked; a toast or a re-render can eat a
      // click (UAT 5 Nov: the drawer closed and RFQ was never chosen). Three tries, the drawer reopened between.
      const card = d.locator(".pro-radio-tabs__tab", { hasText: re }).first();
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!(await d.isVisible().catch(() => false))) await this.openConfigDrawer();
        await this.closeNotices();
        const clicked = await card.click({ timeout: 5_000 }).then(() => true).catch(() => false);
        if (!clicked) await this.click([card, d.getByRole("radio", { name: re }), d.getByText(re)], { label, timeout: TIMEOUTS.MEDIUM, force: true }).catch(() => {});
        await this.pause(500);
        // the card's own radio input is the truth (14 Nov: the class test read "unselected" as selected, so a
        // Traffic Light click lost to a re-render went unnoticed and the drawer saved Rank)
        const input = card.locator("input[type='radio']").first();
        const isChecked = async () => {
          const cls = (await card.getAttribute("class", { timeout: 2_000 }).catch(() => "")) ?? "";
          return (await input.count().catch(() => 0))
            ? await input.isChecked({ timeout: 2_000 }).catch(() => false)
            : (await card.getAttribute("aria-checked", { timeout: 2_000 }).catch(() => null)) === "true" || (/(^|\s|--)(checked|active|selected)(\s|$)/.test(cls) && !/unselected|inactive|unchecked/.test(cls));
        };
        // a controlled radio shows the click at once and REVERTS on the next render when the app lost the change
        // (14 Nov: Traffic Light read checked, the drawer saved Rank) — the choice counts only once it survives a beat
        if ((await isChecked()) && (await this.pause(700), await isChecked())) return;
      }
      throw new Error(`the configuration drawer would not keep "${label}" selected after three tries`);
    };

    await pick(EVENT_TYPE_LABEL[cfg.eventType], `event-type:${cfg.eventType}`);
    // Give the conditional sections (sub-type / awarding) a beat to render.
    await this.pause(500);
    if (cfg.eventType === "auction" && cfg.auctionSubtype) {
      if (cfg.auctionSubtype === "knockout" || cfg.auctionSubtype === "dutch") {
        // On a fresh single-stage screen these cards are greyed out with the app's own reason (a tooltip); say
        // that reason instead of clicking three times and reporting "would not keep selected".
        const card = d.locator(".pro-radio-tabs__tab", { hasText: SUBTYPE_LABEL[cfg.auctionSubtype] }).first();
        if (await card.count()) {
          const cls = (await card.getAttribute("class").catch(() => "")) ?? "";
          const ariaDisabled = (await card.getAttribute("aria-disabled").catch(() => null)) === "true";
          if (ariaDisabled || /disabled/i.test(cls)) {
            await card.hover({ timeout: 2_000 }).catch(() => {});
            await this.pause(600);
            const tip = ((await this.page.locator(".ant-tooltip-inner").allInnerTexts().catch(() => [])) as string[]).map((x) => x.trim()).filter(Boolean)[0] ?? "";
            throw new Error(`the product does not offer "${cfg.auctionSubtype}" on this screen — the card is greyed out${tip ? ` and the app says: “${tip}”` : " with no reason shown"} (a Knockout / Dutch auction is made by converting a published RFQ: convert_to_auction, then this step on the converted screen)`);
          }
        }
      }
      await pick(SUBTYPE_LABEL[cfg.auctionSubtype], `subtype:${cfg.auctionSubtype}`);
      if (cfg.auctionSubtype === "knockout" || cfg.auctionSubtype === "dutch") {
        // The drawer's Knockout / Dutch block (orderConfigBlocks.jsx): "Offers on" radios, "Starting Price"
        // (required), "Ending Price" (Dutch), "Add Tick Size" (required). Fields the plan names are set; the rest
        // stay as the screen has them, so a case about ONE field tests that field.
        await this.pause(500);
        const field = (label: RegExp) => d.locator(".ant-form-item", { hasText: label }).locator("input").first();
        const setField = async (label: RegExp, v: number | string | undefined, name: string) => {
          if (v === undefined) return;
          const input = field(label);
          if (!(await input.count())) throw new Error(`no "${name}" field in the configuration drawer for a ${cfg.auctionSubtype} auction`);
          await input.fill(String(v)).catch(async () => { await input.click({ timeout: 3_000 }); await input.fill(String(v)); });
        };
        if (cfg.offersOn) {
          const radio = d.getByText(cfg.offersOn === "total_amount" ? /Offers on Total Amount/i : /Offers on Base Price/i).first();
          if (await radio.count()) await radio.click({ timeout: 3_000 }).catch(() => {});
        }
        // Every field the app requires here gets a valid value unless the plan names it (a number, or "" to
        // leave it empty on purpose): the refusal must then be about the ONE field the case is about (13 Nov:
        // Dutch start 100 / end 200 was refused for the tick size and the time difference the plan never set).
        const valueOr = (v: number | string | undefined, dflt: string) => (v === undefined ? dflt : v);
        await setField(/^\s*Starting Price/i, valueOr(cfg.startPrice, "100"), "Starting Price");
        // a reverse (buy) Dutch auction climbs from the starting offer to the ending one: start 100 / end 200 is accepted (13 Nov)
        if (cfg.auctionSubtype === "dutch" || cfg.endPrice !== undefined) await setField(/^\s*Ending Price/i, valueOr(cfg.endPrice, "200"), "Ending Price");
        await setField(/Add Tick Size/i, valueOr(cfg.tickSize, "1"), "Add Tick Size");
        await setField(/Add Time Difference/i, valueOr(cfg.timeDifference, "1"), "Add Time Difference");
      }
    }
    // The awarding rule ("How will you award this event?") decides WHERE a traffic light's ranges live: entire
    // lot → the drawer's GREEN / YELLOW boxes; line items → two columns on the product sheet (configuration.jsx
    // showTrafficBanner). A traffic-light case that names no rule gets the lot, so the ranges are the drawer's.
    const awarding = cfg.awarding ?? (cfg.auctionSubtype === "traffic_light" ? "lot" : undefined);
    if (awarding) {
      await pick(AWARDING_LABEL[awarding], `awarding:${awarding}`);
      await this.pause(400);
    }
    if (cfg.eventType === "auction" && cfg.auctionSubtype === "traffic_light") {
      // "* Group traffic light by: Price | Rank" (required: "Traffic light type is required"), then GREEN
      // "Gross total less than" textbox "range green" (placeholder 3000) and YELLOW "range yellow" — plain
      // textboxes (rangeItem.jsx). With Rank they read "Rank less than" and take ranks. Range is inclusive;
      // green is the lower bound. "" for a bound leaves it empty on purpose (the case is about the refusal).
      {
        // the type is required ("Traffic light type is required" kept the drawer open, 14 Nov): Price unless the plan says Rank
        const group = d.locator(".ant-form-item", { hasText: /Group traffic light by/i }).first();
        const radio = group.locator(".ant-radio-wrapper", { hasText: cfg.trafficBy === "rank" ? /^\s*Rank\s*$/i : /^\s*Price\s*$/i }).first();
        // the group renders a beat after the Traffic Light card is chosen; a count taken at once read 0 (14 Nov)
        await radio.waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});
        if (!(await radio.count())) {
          const chosen = ((await d.locator(".pro-radio-tabs__tab", { hasText: /Traffic Light/i }).first().locator("input[type='radio']").isChecked({ timeout: 1_000 }).catch(() => false)) ? "Traffic Light reads chosen" : "Traffic Light does NOT read chosen");
          throw new Error(`no "Group traffic light by" choice in the configuration drawer (${chosen}; the drawer reads: “${(((await d.innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 200))}”)`);
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          await radio.click({ timeout: 3_000 });
          await this.pause(600);
          if (await radio.locator("input[type='radio']").isChecked({ timeout: 1_000 }).catch(() => false)) break;
        }
      }
      const green = d.getByRole("textbox", { name: /range green/i }).first();
      const yellow = d.getByRole("textbox", { name: /range yellow/i }).first();
      const byRank = cfg.trafficBy === "rank";
      const lo = cfg.rangeLower === undefined ? (byRank ? "1" : "3000") : String(cfg.rangeLower);
      const hi = cfg.rangeUpper === undefined ? (byRank ? "3" : "6000") : String(cfg.rangeUpper);
      if (await green.count()) await green.fill(lo).catch(() => {});
      if (await yellow.count()) await yellow.fill(hi).catch(() => {});
      this.leaveRangeCellsEmpty = lo === "" && hi === "";
      this.trafficLightRange = lo === "" && hi === "" ? null : { green: lo, yellow: hi };
    }
    if (cfg.eventType === "auction" && cfg.dynamicExtension !== undefined) {
      // "Dynamic Event Extension" (orderConfigBlocks.jsx DynamicExtensionTime; offered for every auction strategy
      // but Knockout / Dutch): a checkbox, then Price | Rank, "Time Extension By" (1 / 2 / 3 / 5 min or Custom with
      // "Enter closing time extension"), "Trigger time extension on last:" minutes (the app's own rule: at least 1,
      // and under half the bidding time — else 501 "Invalid Trigger Time for Dynamic Time Extension." at publish)
      // and "Time extension on change in:" the top N bids. Only the fields the plan names are set; the two the app
      // requires with no default (the extension and the top bids) get the first option.
      // the checkbox and its words are siblings inside one form item (probe 14 Nov: the wrapper itself has no text)
      // the INNERMOST form item holding the checkbox (the screen may wrap the whole block in an outer form item, whose
      // first following sibling is not the Price | Rank group — 14 Nov, "locator.apply: Timeout" on the Price click)
      const box = d.locator(".ant-form-item", { hasText: /Dynamic Event Extension/i }).filter({ has: this.page.locator("input[type='checkbox']") }).last();
      if (!(await box.count())) throw new Error(`no "Dynamic Event Extension" option in the configuration drawer for this auction (the product offers it for rank, price and traffic light auctions, not Knockout / Dutch)`);
      const input = box.locator("input[type='checkbox']").first();
      const isOn = () => input.isChecked({ timeout: 3_000 }).catch(() => false);
      // the drawer re-renders after a card is picked and the box sits below the fold: a 3 s click timed out once
      // (14 Nov) — scroll it into view, click with more time, and read the box back; a lost click is tried again
      for (let attempt = 0; attempt < 3 && (await isOn()) !== cfg.dynamicExtension; attempt++) {
        const tick = box.locator(".ant-checkbox").first();
        await tick.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
        await tick.click({ timeout: 8_000 }).catch(async () => tick.click({ timeout: 4_000, force: true }).catch(() => {}));
        await this.pause(500);
      }
      if ((await isOn()) !== cfg.dynamicExtension) throw new Error(`the "Dynamic Event Extension" box could not be ${cfg.dynamicExtension ? "ticked" : "cleared"} in the drawer (it reads ${(await isOn()) ? "ticked" : "clear"} after three tries)`);
      if (cfg.dynamicExtension) {
        const item = (label: RegExp) => d.locator(".ant-form-item", { hasText: label }).first();
        // Two builds of this block exist: presets (1 / 2 / 3 / 5 min | Custom) under "Time Extension By" / "Extend
        // time by:", or — DEMO, probe 14 Nov — Custom from the start: a plain "Extend time by:" minutes box
        // (placeholder 10), "Trigger time extension on last:" (placeholder 1), "Time extension on change in:".
        const presets = d.locator(".ant-form-item", { hasText: /Extend time by|Time Extension By/i }).filter({ has: this.page.locator(".ant-radio-group") }).first();
        const minutesBox = () => d.locator(".ant-form-item", { hasText: /Extend time by|Enter closing time extension/i }).filter({ has: this.page.locator("input:not([type='radio']):not([type='checkbox'])") }).first().locator("input:not([type='radio']):not([type='checkbox'])").first();
        if (!(await presets.count()) && !(await minutesBox().count())) throw new Error(`"Dynamic Event Extension" was ticked but its fields did not appear in the drawer`);
        if (cfg.extensionOn) {
          // the Price | Rank group comes right after the checkbox's form item (the traffic light has its own Price | Rank)
          let group = box.locator("xpath=following-sibling::*[1]").locator(".ant-radio-group").first();
          if (!(await group.count())) group = box.locator("xpath=following-sibling::*[contains(@class,'ant-radio-group')][1]");
          // last resort: the drawer's last "Price | Rank" group (the block sits below the traffic light's own group)
          if (!(await group.count())) group = d.locator(".ant-radio-group").filter({ hasText: /^\s*Price\s*Rank\s*$/i }).last();
          const want = cfg.extensionOn === "rank" ? /^\s*Rank\s*$/i : /^\s*Price\s*$/i;
          if (!(await group.count())) throw new Error(`no Price | Rank choice under "Dynamic Event Extension" in the drawer (the block reads: “${(((await box.locator("xpath=..").innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 200))}”)`);
          await group.getByText(want).first().click({ timeout: 5_000 });
        }
        const minutes = cfg.extendByMinutes === undefined ? undefined : String(cfg.extendByMinutes).trim();
        const preset = minutes !== undefined && /^[1235]$/.test(minutes) && (await presets.count()) ? presets.getByText(new RegExp(`^${minutes}\\s*min`, "i")).first() : null;
        if (preset && (await preset.count())) await preset.click({ timeout: 8_000 });
        else if (minutes !== undefined || !(await presets.count())) {
          if (await presets.count()) {
            await presets.getByText(/^Custom$/i).first().click({ timeout: 8_000 });
            await this.pause(300);
          }
          const custom = minutesBox();
          if (!(await custom.count())) throw new Error(`no "Extend time by" minutes box appeared in the drawer`);
          // the box is required: a plan that names no extension gets 2 minutes (the app's placeholder is 10)
          const current = ((await custom.inputValue({ timeout: 2_000 }).catch(() => "")) || "").trim();
          if (minutes !== undefined || !current) {
            await custom.fill(minutes ?? "2");
            await this.page.keyboard.press("Tab").catch(() => {});
          }
        } else if (!(await presets.locator(".ant-radio-wrapper-checked").count())) {
          await presets.locator(".ant-radio-wrapper").first().click({ timeout: 8_000 });
        }
        {
          const trig = item(/Trigger time extension on last/i).locator("input").first();
          if (!(await trig.count())) throw new Error(`no "Trigger time extension on last" box in the drawer`);
          const current = ((await trig.inputValue({ timeout: 2_000 }).catch(() => "")) || "").trim();
          // required too: a plan that names no trigger gets the app's own minimum, 1 minute
          if (cfg.triggerMinutes !== undefined || !current) {
            await trig.fill(cfg.triggerMinutes === undefined ? "1" : String(cfg.triggerMinutes));
            await this.page.keyboard.press("Tab").catch(() => {});
          }
        }
        const topItem = item(/Time extension on change in/i);
        const chosen = ((await topItem.locator(".ant-select-selection-selected-value").innerText({ timeout: 1_000 }).catch(() => "")) || "").trim();
        if (cfg.topBids !== undefined || !chosen) {
          await topItem.locator(".ant-select").first().click({ timeout: 8_000 });
          await this.pause(400);
          const menu = this.page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").filter({ visible: true }).last();
          const opt = cfg.topBids !== undefined ? menu.locator(".ant-select-dropdown-menu-item", { hasText: new RegExp(`\\b${cfg.topBids}\\b`) }).first() : menu.locator(".ant-select-dropdown-menu-item").first();
          if (!(await opt.count())) throw new Error(`"Time extension on change in" offers no "top ${cfg.topBids} bids" option (the list reads: ${(await menu.locator(".ant-select-dropdown-menu-item").allInnerTexts().catch(() => [])).join(", ") || "nothing"})`);
          await opt.click({ timeout: 8_000 });
        }
      }
    }

    // Some builds apply the choice and close the drawer by themselves (UAT, 5 Nov: the drawer was gone before
    // Save). Then there is nothing to save — but only when the event-type chip now shows what was chosen.
    const want = cfg.eventType === "auction" ? /auction|rank|price|traffic|knockout|dutch/i : cfg.eventType === "rfq" ? /^RFQ\b/i : /^RFP\b/i;
    const appliedByItself = async (): Promise<boolean> => {
      if (await d.isVisible().catch(() => false)) return false;
      const chip = ((await this.page.getByRole("button", { name: /^(RFP|RFQ|Auction|rank|price|traffic|knockout|dutch)\b/i }).first().innerText({ timeout: 3_000 }).catch(() => "")) || "").trim();
      if (want.test(chip)) return true;
      throw new Error(`the configuration drawer closed before Save and the event type reads "${chip || "nothing"}", not ${cfg.eventType}`);
    };
    await this.pause(1200);
    if (await appliedByItself()) return void (await this.dismissDistractions());
    try {
      await this.click([d.getByRole("button", { name: /^Save$/i }), this.page.getByRole("button", { name: /^Save$/i })], {
        label: "config-save",
        timeout: TIMEOUTS.MEDIUM,
      });
    } catch (e) {
      // the drawer may close while Save is being clicked (UAT 5 Nov): judge by the outcome, not the click
      await this.pause(800);
      if (await appliedByItself()) return void (await this.dismissDistractions());
      throw e;
    }
    // Drawer closes on save — unless the app REFUSED the configuration (e.g. a traffic-light
    // range whose lower bound is above the upper): then the drawer stays open with its own
    // message. Report that refusal instead of carrying on under an open drawer (the next step
    // then failed as "the template picker is not clickable", hiding the app's answer).
    await this.pause(800);
    const stillOpen = await d.isVisible().catch(() => false);
    if (stillOpen) {
      // The field's own help renders a beat after Save ("Please enter valid end price" under Ending Price, antd
      // FormItem help); read the explain elements first, and only then anything marked error — a form item in
      // error state has innerText "₹" (the price prefix), which is not a message (13 Nov, SRC-AUC-006).
      await this.pause(800);
      const words = (xs: string[]) => xs.map((x) => x.trim()).filter((x) => /[a-z]{3,}/i.test(x));
      let said = words((await d.locator(".ant-form-explain, .ant-form-item-explain, .ant-form-item-explain-error, .ant-typography-danger, [role='alert'], .ant-message-error").allInnerTexts().catch(() => [])) as string[]);
      if (!said.length) said = words((await d.locator("[class*='error' i]").allInnerTexts().catch(() => [])) as string[]);
      const toast = ((await this.page.locator(".ant-message-notice, .ant-notification-notice").allInnerTexts().catch(() => [])) as string[]).map((x) => x.trim()).filter(Boolean);
      const msg = [...new Set([...said, ...toast])].filter((x) => !isNoiseMessage(x)).join(" · ").slice(0, 240);
      // no message element: say what the drawer reads near its range fields, so a person can see
      // whether the refusal is explained at all
      const near = msg ? "" : (((await d.innerText().catch(() => "")) || "").replace(/\s+/g, " ").match(/Group traffic light by.{0,320}/i)?.[0] ?? "");
      throw new Error(`the app refused the single-stage configuration on Save — the drawer stayed open${msg ? `: “${msg}”` : ` with no message element${near ? ` (the drawer reads: “${near.trim()}”)` : ""}`}`);
    }
    await this.dismissDistractions();
  }

  async setTitle(title: string): Promise<void> {
    await this.fill(
      [this.page.getByRole("textbox", { name: /enter the title of this event/i }), this.page.getByPlaceholder(/enter the title of this event/i)],
      title,
      { label: "event-title", timeout: TIMEOUTS.MEDIUM },
    );
  }

  /** Open the template picker and select a Buy (pricing) template. */
  /**
   * The template Procol has already set on this screen, or "". An event made from a PR opens with
   * one ("Templates: test 1 ▾") and no "Select Templates" button at all, so looking for that
   * button failed the step four times over (27 Oct, PR → RFQ stopped at select_template).
   */
  async templateAlreadyChosen(): Promise<string> {
    const label = this.page.getByText(/^\s*Templates\s*$/).filter({ visible: true }).first();
    for (let i = 0; i < 10; i++) {
      if (await this.page.getByRole("button", { name: /select templates/i }).filter({ visible: true }).count().catch(() => 0)) return "";
      // The button right after the label is the template control; "Add Columns" there means it has not drawn yet.
      const name = (await label.locator("xpath=following::button[1]").innerText({ timeout: 1_000 }).catch(() => "")).replace(/\s+/g, " ").trim();
      if (name && !/select templates|add columns/i.test(name)) return name;
      await this.pause(500);
    }
    return "";
  }

  async selectBuyTemplate(): Promise<string> {
    await this.dismissDistractions();
    const already = await this.templateAlreadyChosen();
    if (already) {
      console.log(`[template] Procol has already set the template "${already}" on this screen — keeping it`);
      return already;
    }
    // The picker is DISABLED while its template list loads (templateSelection.jsx:137,
    // templateListLoading). A forced click on it does nothing and the step used to "pass";
    // wait (bounded) until it is enabled, then click it like a person.
    const picker = this.page.getByRole("button", { name: /select templates/i }).first();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && (await picker.isDisabled().catch(() => true))) await this.pause(500);
    if (await picker.isDisabled().catch(() => true)) {
      throw new Error('"Select Templates" stayed disabled for 30s — the template list never finished loading (not evidence about the product)');
    }
    // The configuration drawer (configure_single_stage) slides shut over the picker; a click
    // during that animation loses to the drawer's mask ("no candidate was clickable"). Wait for
    // every drawer mask to go, then click — and once more if the first click still lost.
    await this.page.locator(".ant-drawer-open .ant-drawer-mask, .ant-drawer-open").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    // …and a "Configuration for Event" drawer an earlier step left OPEN never goes by itself (20 Nov, INV-001A /
    // SSR-015: a step that looked at the event type opened it, RFQ stayed chosen, the picker sat under its mask until
    // the click timed out). Save keeps what is chosen in it; then the picker is reachable.
    if (await this.drawer().isVisible().catch(() => false)) {
      await this.drawer().getByRole("button", { name: /^save$/i }).click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await this.drawer().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    }
    try {
      await this.click([picker, this.page.getByText(/select templates/i)], { label: "open-templates", timeout: TIMEOUTS.MEDIUM });
    } catch {
      await this.dismissDistractions();
      await this.pause(1_500);
      await picker.scrollIntoViewIfNeeded().catch(() => {});
      await this.click([picker, this.page.getByText(/select templates/i)], { label: "open-templates", timeout: TIMEOUTS.MEDIUM });
    }
    // Only ever pick inside the OPEN template menu: a page-wide "first menuitem" was the left
    // sidebar ("clara"), so the step "passed" having chosen nothing. Prefer a buy / pricing
    // template; otherwise take the first real template the tenant lists (never the search row).
    // The menu built while the screen was still RFP stays in the page (hidden) after the event
    // type changes — only the VISIBLE template menu counts.
    await picker.hover({ timeout: 5_000 }).catch(() => {});
    const menu = this.page.locator(".ant-dropdown").filter({ has: this.page.getByPlaceholder(/search template/i) }).filter({ visible: true }).last();
    await menu.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const items = menu.locator("[role='menuitem']").filter({ visible: true }).filter({ hasNot: this.page.getByPlaceholder(/search template/i) });
    if (!(await items.count().catch(() => 0))) throw new Error("the template menu opened with no templates in it (not evidence about the product)");
    let preferred = items.filter({ hasText: /buy|pricing|rfq|price/i }).first();
    // Right after the event type changes, the menu can still list the RFP questionnaires for a
    // moment. When the screen is priced (Event Type RFQ / Auction), look again before settling.
    // Priced unless the Event Type reads RFP / RFI (an auction reads "Rank on lot", "Price on item" …).
    const questionnaire = await this.page.getByRole("button", { name: /^(rfp|rfi)\b/i }).first().isVisible().catch(() => false);
    const priced = !questionnaire;
    for (let i = 0; i < 6 && priced && !(await preferred.count()); i++) {
      await this.page.mouse.move(0, 0).catch(() => {});
      await this.pause(1000);
      await picker.hover({ timeout: 5_000 }).catch(() => {});
      preferred = menu.locator("[role='menuitem']").filter({ visible: true }).filter({ hasText: /buy|pricing|rfq|price/i }).first();
    }
    // Still no priced template in view: the menu lists only part of a long template list, so
    // ask its own search box (the way a person would) before falling back to the first item —
    // falling back picked "s1", a template with no price sheet on this auction screen.
    if (priced && !(await preferred.count())) {
      const search = menu.getByPlaceholder(/search template/i).first();
      for (const word of ["buy", "price", "rfq"]) {
        if (!(await search.isVisible().catch(() => false))) {
          await picker.hover({ timeout: 5_000 }).catch(() => {});
          await menu.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        }
        await search.fill(word).catch(() => {});
        await this.pause(1200);
        preferred = menu.locator("[role='menuitem']").filter({ visible: true }).filter({ hasNot: this.page.getByPlaceholder(/search template/i) }).filter({ hasText: /buy|pricing|rfq|price/i }).first();
        if (await preferred.count()) break;
      }
    }
    // The searches above leave the menu filtered to whatever the last word matched — nothing, on
    // 21 Oct (A11: "rfq" on an auction screen), and the click on "the first item" then waited 8 s
    // on an empty list. Clear the search so the tenant's full list is back before falling back.
    if (!(await preferred.count())) {
      const search = menu.getByPlaceholder(/search template/i).first();
      if (await search.inputValue().catch(() => "")) {
        await search.fill("").catch(() => {});
        await this.pause(1200);
      }
    }
    const pick = (await preferred.count()) ? preferred : items.first();
    if (!(await pick.count().catch(() => 0))) throw new Error("the template menu lists no template for this event type, even with its search cleared (not evidence about the product)");
    const name = ((await pick.innerText().catch(() => "")) || "").trim();
    // The template menu opens on hover and closes when the pointer leaves it; after the searches
    // it had closed and the click waited 8 s on a hidden item (23 Oct, A11 rerun). Re-open it first.
    if (!(await pick.isVisible().catch(() => false))) {
      await picker.hover({ timeout: 5_000 }).catch(() => {});
      await menu.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    }
    // The hover menu can close between the re-open and the click (12 Nov, a sanity flow lost its whole run on
    // it). Try the open-and-click up to three times before giving up; each attempt is short.
    let clicked = false;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
      if (!(await pick.isVisible().catch(() => false))) {
        await picker.hover({ timeout: 5_000 }).catch(() => {});
        await menu.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        await this.pause(400);
      }
      try {
        await pick.click({ timeout: 4_000 });
        clicked = true;
      } catch (e) {
        lastErr = e;
        if (await pick.isVisible().catch(() => false)) throw e;
      }
    }
    if (!clicked) throw new Error(`the template menu closed before "${name || "the template"}" could be chosen, three times (not evidence about the product)${lastErr ? `: ${String((lastErr as Error).message).split("\n")[0].slice(0, 80)}` : ""}`);
    // Some tenants confirm a template choice in a modal — accept it.
    const confirm = this.page.locator(".ant-modal-wrap:not([style*='display: none']) .ant-btn-primary").filter({ hasText: /ok|yes|confirm|proceed|continue/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click({ timeout: 5_000 }).catch(() => {});
    console.log(`[single-stage] chose template "${name}"`);
    await this.waitForSpinnerHidden();
    await this.pause(1000);
    return name;
  }

  /**
   * Open "Select Templates", read the name of every template the menu offers (all of them — the
   * menu scrolls, so the list is read from the DOM, not the viewport), and close it again without
   * choosing. Returns the event type the screen shows (RFQ / RFP / Auction …) and the names.
   */
  async readTemplateMenu(): Promise<{ eventType: string; names: string[] }> {
    await this.dismissDistractions();
    const picker = this.page.getByRole("button", { name: /select templates/i }).first();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && (await picker.isDisabled().catch(() => true))) await this.pause(500);
    if (await picker.isDisabled().catch(() => true)) {
      throw new Error('"Select Templates" stayed disabled for 30s — the template list never finished loading (not evidence about the product)');
    }
    await this.page.locator(".ant-drawer-open .ant-drawer-mask, .ant-drawer-open").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    const typeBtn = this.page.getByRole("button", { name: /^(rfq|rfp|rfi|auction|rank|price|traffic|knockout|dutch)\b/i }).first();
    const eventType = ((await typeBtn.innerText().catch(() => "")) || "").trim();
    await this.click([picker, this.page.getByText(/select templates/i)], { label: "open-templates", timeout: TIMEOUTS.MEDIUM });
    await picker.hover({ timeout: 5_000 }).catch(() => {});
    const menu = this.page.locator(".ant-dropdown").filter({ has: this.page.getByPlaceholder(/search template/i) }).filter({ visible: true }).last();
    await menu.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    // The list can still be the previous event type's for a moment after a type change: read
    // twice a second apart and keep the second reading once it has settled.
    const read = async () =>
      (await menu.locator("[role='menuitem']").filter({ hasNot: this.page.getByPlaceholder(/search template/i) }).allInnerTexts().catch(() => [] as string[]))
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    let names = await read();
    for (let i = 0; i < 4; i++) {
      await this.pause(1000);
      const again = await read();
      if (again.join("|") === names.join("|")) break;
      names = again;
    }
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.mouse.move(0, 0).catch(() => {});
    await this.pause(500);
    console.log(`[single-stage] template menu (${eventType || "?"}): ${names.length} — ${names.slice(0, 15).join(" | ")}`);
    return { eventType, names: [...new Set(names)] };
  }

  /**
   * Fill the first line-item row in the pricing sheet. Cells (verified):
   * product, variant, creator_quantity, buyer_hub (delivery), price,
   * participant_quantity. Order matters — product first (variant depends on it).
   */
  async fillFirstLineItem(searchText = "a", quantity?: string): Promise<void> {
    // No price sheet on screen (e.g. the default Event Type is RFP and the template is a
    // questionnaire): say so at once instead of waiting ~30 s on each of six cells that
    // do not exist and then reporting the row as filled.
    const grid = this.page.locator(".data-grid-container").first();
    if (!(await grid.isVisible({ timeout: 5_000 }).catch(() => false))) {
      throw new Error("this template has no price sheet (an RFP questionnaire?) — a priced case must set the event type (RFQ / auction) before choosing a template (not evidence about the product)");
    }
    const sheet = new InlineSheet(this.page);
    await sheet.fillCell(0, "product", { key: "product", type: "product" }, searchText);
    await this.pause(500);
    // variant often auto-fills from the product; try dropdown, ignore if absent.
    await sheet.fillCell(0, "variant", { key: "variant", type: "dropdown" }, "").catch(() => {});
    // A case's own quantity is typed exactly as given — 0, -5, letters — so the app's validation is what is tested.
    await sheet.fillCell(0, "creator_quantity", { key: "creator_quantity", type: "number" }, quantity ?? randomNumber());
    // The delivery location is the company's own list, not the product's name: an empty search lists every location
    // and the first is taken (13 Nov, SRC-AUC-008: searching the product's name there found nothing, the dropdown
    // stayed open and swallowed the price and quantity typed next — Publish then said "Sheet partially filled").
    await sheet.fillCell(0, "buyer_hub", { key: "buyer_hub", type: "delivery_location" }, "").catch(async () => {
      await this.page.keyboard.press("Escape").catch(() => {});
    });
    await sheet.fillCell(0, "price", { key: "price", type: "price" }, randomNumber());
    await sheet.fillCell(0, "participant_quantity", { key: "participant_quantity", type: "number" }, randomNumber()).catch(() => {});
  }

  /** Add a SPECIFIC vendor as a participant by searching the participants combobox. */
  async addParticipant(query: string): Promise<boolean> {
    // Open the participants select (click the wrapper), then type into its real
    // search input (an antd select — the wrapper div isn't fillable).
    await this.click(
      [
        this.page.getByText(/search vendors you want to add/i),
        this.page.locator(".ant-select-selection").filter({ hasText: /search vendors/i }),
        this.page.getByRole("combobox"),
        this.page.locator(".ant-select-selection").last(),
      ],
      { label: "open-participants", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    // ONLY the Participants search ("Search vendors you want to add"). A page-wide
    // "first open select input" was the RFP template's Evaluator picker — the QA vendor's
    // name was typed into Evaluator and the invite could never succeed.
    const participants = this.page.locator(".ant-select").filter({ hasText: /search vendors you want to add/i }).last();
    const cb = await this.find(
      [
        participants.locator("input.ant-select-search__field, input"),
        this.page.getByPlaceholder(/search vendors you want to add/i),
      ],
      { label: "participants-input", timeout: TIMEOUTS.MEDIUM },
    );
    if (!cb) return false;
    // Some layouts render the search as a read-only shell around the real input:
    // fill() then times out. Fall back to focusing it and typing, like a person.
    const typed = await cb.fill(query, { timeout: 5_000 }).then(() => true).catch(() => false);
    if (!typed) {
      await cb.click({ timeout: 5_000, force: true }).catch(() => {});
      await this.page.keyboard.type(query, { delay: 30 });
    }
    await this.pause(1500);
    const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only the option that matches the name — never "the first option", which
    // invited whichever real supplier the search returned (unless explicitly allowed).
    const picked = await this.clickIfPresent(
      [
        this.page.locator(".ant-select-dropdown [role='option']", { hasText: new RegExp(esc, "i") }),
        this.page.getByRole("option", { name: new RegExp(esc, "i") }),
        // This screen lists vendors as MENU ITEMS under a "VENDORS" group, not as options.
        this.page.getByRole("listbox").getByRole("menuitem", { name: new RegExp(esc, "i") }),
        this.page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='menuitem'], .ant-dropdown:not(.ant-dropdown-hidden) [role='menuitem']", { hasText: new RegExp(esc, "i") }),
        ...(allowRealVendors() ? [this.page.getByRole("option"), this.page.locator(".ant-select-item-option")] : []),
      ],
      { label: "vendor-option", timeout: TIMEOUTS.MEDIUM },
    );
    await this.dismissDistractions();
    return picked;
  }

  /**
   * THAT MANY of the vendors the product suggests, picked one by one (6 Nov: "invite 2 vendors" must put 2 on the
   * event, not everyone Invite Vendor knows). The participants search is opened, its suggestions read, and the
   * first n added by name through addParticipant — so each is a vendor this run can later bid as.
   */
  async inviteSuggested(n: number): Promise<string[]> {
    await this.dismissDistractions();
    await this.click(
      [
        this.page.getByText(/search vendors you want to add/i),
        this.page.locator(".ant-select-selection").filter({ hasText: /search vendors/i }),
        this.page.getByRole("combobox"),
        this.page.locator(".ant-select-selection").last(),
      ],
      { label: "open-participants", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    const participants = this.page.locator(".ant-select").filter({ hasText: /search vendors you want to add/i }).last();
    const cb = await this.find(
      [participants.locator("input.ant-select-search__field, input"), this.page.getByPlaceholder(/search vendors you want to add/i)],
      { label: "participants-input", timeout: TIMEOUTS.MEDIUM },
    );
    if (!cb) return [];
    const typed = await cb.fill("a", { timeout: 5_000 }).then(() => true).catch(() => false);
    if (!typed) {
      await cb.click({ timeout: 5_000, force: true }).catch(() => {});
      await this.page.keyboard.type("a", { delay: 30 });
    }
    await this.pause(1500);
    const options = this.page.locator(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option'], .ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='menuitem'], .ant-dropdown:not(.ant-dropdown-hidden) [role='menuitem']",
    );
    const seen = (await options.allTextContents().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t && !/^vendors?$/i.test(t));
    // the name as the search knows it: without the email or the id glued on after it
    const keys = seen.map((t) => t.split(/\s*[-–]\s*(?=\S+@)|\s*\(\d+\)/)[0].trim().slice(0, 60) || t.slice(0, 60)).filter((k, i, all) => k && all.indexOf(k) === i);
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.dismissDistractions();
    if (!keys.length) {
      console.log(`[single-stage] the participants search listed no vendors for "a"`);
      return [];
    }
    const added: string[] = [];
    for (const key of keys) {
      if (added.length >= n) break;
      if (await this.addParticipant(key)) added.push(key);
      else console.log(`[single-stage] could not add "${key}" from the suggestions`);
    }
    console.log(`[single-stage] invited ${added.length} of the ${n} asked for, from ${keys.length} suggested: ${added.join(", ")}`);
    return added;
  }

  /** Add vendors: prefer the whole-audience Invite Vendor button, else pick one via the combobox. */
  /** The product's own invite — "Invite Vendor" takes every vendor the products map to (the tester's rule, 2026-10-21). */
  async inviteVendor(): Promise<void> {
    const invited = await this.clickIfPresent(
      [this.page.getByRole("button", { name: /invite vendor/i }), this.page.getByText(/invite vendor/i)],
      { label: "invite-vendor", timeout: TIMEOUTS.SHORT },
    );
    if (!invited) {
      const cb = await this.find(
        [this.page.getByPlaceholder(/search vendors you want to add/i), this.page.getByRole("combobox")],
        { label: "participants", timeout: TIMEOUTS.SHORT },
      );
      if (cb) {
        await cb.click();
        await cb.fill("a");
        await this.pause(800);
        await this.click([this.page.getByRole("option"), this.page.locator(".ant-select-item-option")], {
          label: "vendor-option",
          timeout: TIMEOUTS.MEDIUM,
        }).catch(() => {});
      }
    }
    await this.dismissDistractions();
  }

  /**
   * Open the Schedule Event drawer and set the event to start later (scheduled),
   * then Save. Requires a line item to exist (the Schedule control is disabled
   * until then). scheduled_events_enabled gates this.
   */
  async scheduleForLater(): Promise<boolean> {
    await this.dismissDistractions();
    await this.click(
      [this.page.getByRole("button", { name: /Now -|Mins\)|Schedule/i }), this.page.getByText(/Now -.*Mins\)/i)],
      { label: "open-schedule", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    const drawerReady = await this.find([this.page.getByText(/Schedule Event/i)], { label: "schedule-drawer", timeout: TIMEOUTS.MEDIUM });
    if (!drawerReady) return false;
    const drawer = this.page.locator(".ant-drawer, [role='dialog']").filter({ hasText: /Schedule Event/i }).first();

    // Switch Start time from "Start now" to a scheduled/later option.
    await this.click(
      [drawer.locator(".ant-select").filter({ hasText: /start now/i }), drawer.getByText(/start now/i)],
      { label: "start-time-select", timeout: TIMEOUTS.MEDIUM, force: true },
    );
    await this.pause(500);
    const pickedLater = await this.clickIfPresent(
      [
        this.page.getByRole("option", { name: /schedule for later|start later|^later|scheduled/i }),
        this.page.locator(".ant-select-item-option", { hasText: /later|scheduled/i }),
      ],
      { label: "schedule-later-option", timeout: TIMEOUTS.MEDIUM },
    );

    await this.click(
      [drawer.getByRole("button", { name: /save schedule/i }), this.page.getByRole("button", { name: /save schedule/i })],
      { label: "save-schedule", timeout: TIMEOUTS.MEDIUM },
    );
    await this.pause(800);
    await this.dismissDistractions();
    return pickedLater;
  }

  async publish(title: string): Promise<void> {
    await this.dismissDistractions();
    await this.click(
      [this.page.getByRole("button", { name: /^publish event$/i }), this.page.getByRole("button", { name: /^publish$/i })],
      { label: "publish-event", timeout: TIMEOUTS.MEDIUM },
    );
    const modalTitle = title.slice(0, 45);
    await this.click(
      [
        this.page.getByLabel(modalTitle).getByRole("button", { name: /^publish/i }),
        this.page.getByRole("dialog").getByRole("button", { name: /^publish|confirm|yes/i }),
        this.page.getByRole("button", { name: /^publish/i }),
      ],
      { label: "publish-confirm", timeout: TIMEOUTS.MEDIUM },
    ).catch(() => {});
  }

}
