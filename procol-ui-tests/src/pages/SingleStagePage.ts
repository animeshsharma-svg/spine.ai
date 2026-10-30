import { isNoiseMessage } from "../oracle/noise.js";
import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { recordStuck } from "../oracle/stuck.js";
import { InlineSheet } from "../helpers/inlineSheet.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { randomNumber } from "../helpers/data.js";
import { qaVendorNames, isQaVendorName, allowRealVendors, NoQaVendorError } from "../db/qaVendors.js";
import { vendorCount } from "../master/params.js";

export type EventType = "rfq" | "rfp" | "auction";
export type AuctionSubtype = "rank" | "price" | "traffic_light";
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
};
const AWARDING_LABEL: Record<Awarding, RegExp> = {
  lot: /entire lot to single vendor/i,
  line_item: /partially award .*multiple vendors/i,
};

export interface SingleStageConfig {
  eventType: EventType;
  auctionSubtype?: AuctionSubtype;
  awarding?: Awarding;
  /** Traffic light only: the specified range's bounds (defaults 50 / 150). */
  rangeLower?: number;
  rangeUpper?: number;
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

  private drawer() {
    return this.page
      .locator(".ant-drawer, [role='dialog']")
      .filter({ hasText: /Configuration for Event/i })
      .first();
  }

  /** Open the config drawer via the Event Type chip (shows RFP/RFQ/Auction). */
  private async openConfigDrawer(): Promise<void> {
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

  async configure(cfg: SingleStageConfig): Promise<void> {
    await this.openConfigDrawer();
    const d = this.drawer();

    const pick = async (re: RegExp, label: string) => {
      // Options are custom cards `div.pro-radio-tabs__tab[role=radio]` (not antd
      // radios). Click the card; force bypasses the inner text-node overlay.
      // Wait for the option to render first (awarding/sub-type appear only after
      // the event type is chosen), then click.
      await this.expect(
        [d.locator(".pro-radio-tabs__tab", { hasText: re }), d.getByRole("radio", { name: re }), d.getByText(re)],
        { label: `${label}-visible`, timeout: TIMEOUTS.MEDIUM },
      );
      await this.click(
        [
          d.locator(".pro-radio-tabs__tab", { hasText: re }),
          d.getByRole("radio", { name: re }),
          d.getByText(re),
        ],
        { label, timeout: TIMEOUTS.MEDIUM, force: true },
      );
      await this.pause(500);
    };

    await pick(EVENT_TYPE_LABEL[cfg.eventType], `event-type:${cfg.eventType}`);
    // Give the conditional sections (sub-type / awarding) a beat to render.
    await this.pause(500);
    if (cfg.eventType === "auction" && cfg.auctionSubtype) {
      await pick(SUBTYPE_LABEL[cfg.auctionSubtype], `subtype:${cfg.auctionSubtype}`);
      if (cfg.auctionSubtype === "traffic_light") {
        // Traffic light needs a "specified range" before Save (the journey was
        // deferred for exactly this). The drawer's range controls have never
        // been captured, so record them here — with the tree — and try the
        // obvious shape: a range-type choice plus lower/upper number inputs.
        await recordStuck(this.page, {
          label: "capture:single-stage-traffic-light-drawer",
          message: "captured on request — the traffic light range controls, before Save",
          triedCandidates: [],
          healerTried: false,
        }).catch(() => {});
        // Captured 2026-09-11: "* Group traffic light by: Price | Rank", then
        // GREEN "Gross total less than" textbox "range green" (placeholder
        // 3000) and YELLOW textbox "range yellow" — plain textboxes, not
        // number inputs. Range is inclusive of price; green must be the lower.
        const green = d.getByRole("textbox", { name: /range green/i }).first();
        const yellow = d.getByRole("textbox", { name: /range yellow/i }).first();
        const lo = String(cfg.rangeLower ?? 3000);
        const hi = String(cfg.rangeUpper ?? 6000);
        if (await green.count()) await green.fill(lo).catch(() => {});
        if (await yellow.count()) await yellow.fill(hi).catch(() => {});
        this.trafficLightRange = { green: lo, yellow: hi };
      }
    }
    if (cfg.awarding) {
      await pick(AWARDING_LABEL[cfg.awarding], `awarding:${cfg.awarding}`);
    }

    await this.click([d.getByRole("button", { name: /^Save$/i }), this.page.getByRole("button", { name: /^Save$/i })], {
      label: "config-save",
      timeout: TIMEOUTS.MEDIUM,
    });
    // Drawer closes on save — unless the app REFUSED the configuration (e.g. a traffic-light
    // range whose lower bound is above the upper): then the drawer stays open with its own
    // message. Report that refusal instead of carrying on under an open drawer (the next step
    // then failed as "the template picker is not clickable", hiding the app's answer).
    await this.pause(800);
    const stillOpen = await d.isVisible().catch(() => false);
    if (stillOpen) {
      const said = ((await d.locator(".ant-form-explain, .ant-form-item-explain, .ant-form-item-explain-error, .ant-typography-danger, [role='alert'], .ant-message-error, [class*='error' i]").allInnerTexts().catch(() => [])) as string[])
        .map((x) => x.trim()).filter(Boolean);
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
    await pick.click({ timeout: 8_000 }).catch(async (e) => {
      if (!(await pick.isVisible().catch(() => false))) throw new Error(`the template menu closed before "${name || "the template"}" could be chosen, twice (not evidence about the product)`);
      throw e;
    });
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
    const typeBtn = this.page.getByRole("button", { name: /^(rfq|rfp|rfi|auction|rank|price|traffic)\b/i }).first();
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
    await sheet.fillCell(0, "buyer_hub", { key: "buyer_hub", type: "delivery_location" }, searchText).catch(() => {});
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
