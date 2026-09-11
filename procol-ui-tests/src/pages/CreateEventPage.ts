import { Page, Locator } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { recordStuck } from "../oracle/stuck.js";
import { TIMEOUTS } from "../config.js";
import { InlineSheet, WidgetConfig } from "../helpers/inlineSheet.js";
import { forEachSequential } from "../helpers/data.js";
import { templateChoice, scheduleMinutes } from "../master/params.js";
import { heal, healerEnabled } from "../ai/healer.js";

export type StageKey = "rfp" | "rfq" | "auction";

export interface ProductInput {
  searchText: string;
  quantity?: string;
}

/**
 * Stage names as the app renders them, both as `Add Stages` menu items and as
 * tab titles. Tab titles come from `getTitleForStage`, which appends a count
 * (`RFQ ${n > 0 ? n + 1 : ""}`) — so the label carries a trailing space for the
 * first stage of a kind and a number for the second. Anchored regexes such as
 * /^RFQ$/ therefore cannot be relied on for tabs.
 */
const STAGE_LABEL: Record<StageKey, RegExp> = {
  rfp: /technical stage/i,
  rfq: /\bRFQ\b/i,
  auction: /\bauction\b/i,
};

/** Every stage kind, for reconciling what is on screen against what we want. */
const ALL_STAGES: StageKey[] = ["rfp", "rfq", "auction"];

/**
 * The eRFX event-create page. Ported from the proven procol-client-dashboard
 * e2e flow, with every interaction routed through resilient multi-candidate
 * locators and validated as it goes.
 */
export class CreateEventPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── line items (the "Manage Line Items" drawer) ───────────────────────────
  /**
   * The panel that the toolbar's `Items N` button opens.
   *
   * Everything to do with line items lives INSIDE this panel. Scoping to it is
   * what stops our locators wandering off into the page behind — that is how
   * `input.ant-select-search__field` used to resolve to the DISABLED vendor
   * picker `#participantSelection` and burn 15s clicking a dead element.
   */
  private lineItemsDrawer() {
    return this.page
      .locator(".ant-drawer-content, .ant-drawer-body, .ant-modal-content, .ant-drawer, .ant-modal, [role='dialog']")
      // Identify the drawer by its OWN combobox prompt, which exists nowhere
      // else. Filtering on /Manage Line Items/ looked right but is a trap: once
      // a template is picked the MAIN page prints "You can manage the product
      // and quantity from the Manage Line Items section", so a page-level
      // container matched, we believed the drawer was already open, never
      // clicked `Items`, and typed the product name into the project title.
      .filter({ hasText: /Search and add line items/i })
      .last();
  }

  /** True only when the panel is actually on screen — attached is not enough. */
  private async lineItemsDrawerOpen(): Promise<boolean> {
    return this.lineItemsDrawer()
      .first()
      .isVisible()
      .catch(() => false);
  }

  /** The drawer if it is open, else the whole page (so callers never crash). */
  private async lineItemsScope() {
    return (await this.lineItemsDrawerOpen()) ? this.lineItemsDrawer() : this.page.locator("body");
  }

  /**
   * Open the "Manage Line Items" panel.
   *
   * This was the missing step behind every stalled event run. The create page
   * shows `Items 0` in the toolbar and the banner "Please add line items in the
   * manage line items section and choose a template to proceed!" — but the
   * line-item combobox does not exist on the page at all. It lives in a drawer,
   * and the `Items` button is INERT until a template has been chosen (the
   * template defines the sheet schema the items are added into). Clicking
   * `Items` before a template leaves the page byte-for-byte unchanged, which is
   * exactly what we observed for the whole run.
   */
  async openLineItemsSection(): Promise<void> {
    const p = this.page;
    await this.dismissDistractions();
    if (await this.lineItemsDrawerOpen()) return; // already open

    const clicked = await this.clickIfPresent(
      [
        p.getByRole("button", { name: /items\s*\d+/i }),
        p.locator("button").filter({ hasText: /^\s*Items\s*\d+\s*$/ }),
        p.getByRole("button", { name: /manage line items/i }),
      ],
      { label: "open-line-items-drawer", timeout: TIMEOUTS.MEDIUM },
    );
    if (!clicked) await heal(p, "click the Items button in the toolbar to open the Manage Line Items panel");

    const opened = await this.lineItemsDrawer()
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      throw new Error(
        "the Manage Line Items panel did not open. The toolbar `Items` button is inert until a " +
          "template is selected, so the template must be chosen before line items are added.",
      );
    }
    await this.dismissDistractions();
  }

  /** Commit the drawer's line items back to the sheet and wait for it to close. */
  private async saveLineItemsDrawer(): Promise<void> {
    const scope = await this.lineItemsScope();
    await this.dismissDistractions();
    await this.click([scope.getByRole("button", { name: /^save$/i }), scope.getByText(/^Save$/)], {
      label: "line-items-save",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.waitForSpinnerHidden();
    await this.lineItemsDrawer()
      .first()
      .waitFor({ state: "hidden", timeout: TIMEOUTS.LONG })
      .catch(() => {});
  }

  async addLineItems(products: ProductInput[]): Promise<void> {
    await this.openLineItemsSection();
    await forEachSequential(products, async (product) => {
      await this.addOneLineItem(product.searchText, product.quantity ?? "10");
    });
    await this.saveLineItemsDrawer();
  }

  /**
   * The line-item count the app itself reports in the toolbar badge (`Items 3`).
   * This is the app's own number, not ours — so it is a real oracle for "did the
   * requested number of line items actually get created?". Returns null if the
   * badge cannot be read.
   */
  async lineItemCountBadge(): Promise<number | null> {
    const text = await this.page
      .getByRole("button", { name: /items\s*\d+/i })
      .first()
      .textContent()
      .catch(() => null);
    const m = text?.match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  private async addOneLineItem(searchText: string, quantity: string): Promise<void> {
    const p = this.page;
    // Re-assert the panel before each item: it early-returns when already open,
    // and reopens it if anything closed it between items.
    await this.openLineItemsSection();
    const scope = await this.lineItemsScope();

    // (Re)open the drawer's product combobox to reveal its 0-width search input.
    // The notification popup intermittently reappears and intercepts the click,
    // so dismiss distractions each pass and force-click as a last resort.
    let opened = false;
    for (let attempt = 0; attempt < 4 && !opened; attempt++) {
      await this.dismissDistractions();
      try {
        await this.click(
          [
            scope.getByText(/Search and add line items/i),
            scope.locator(".ant-select-selection"),
            scope.getByRole("combobox"),
          ],
          { label: "open-line-item-combobox", timeout: 3_000, force: attempt >= 2 },
        );
        opened = true;
      } catch {
        await this.page.waitForTimeout(150);
      }
    }
    if (!opened) {
      const healed = await heal(p, "click the line item product search box to open its dropdown");
      if (!healed)
        throw new Error(
          "could not open the line-item combobox inside the Manage Line Items panel" +
            (healerEnabled() ? " (the AI healer also could not do it)" : " — set UI_AI_HEAL=1 to let the AI try"),
        );
    }

    // Every candidate is restricted to an ENABLED input inside the drawer.
    const searchInput = await this.find(
      [
        scope.locator(".ant-select-open input:not([disabled])"),
        scope.locator(".ant-select-focused input:not([disabled])"),
        scope.locator("input.ant-select-search__field:not([disabled])"),
        scope.locator("[role='combobox'] input:not([disabled])"),
      ],
      { label: "line-item-search", timeout: TIMEOUTS.MEDIUM },
    );

    let typed = false;
    if (searchInput) {
      try {
        await searchInput.click({ timeout: 5_000 });
        await searchInput.fill(searchText);
        typed = true;
      } catch {
        /* fall through to the AI */
      }
    }
    if (!typed) {
      const healed = await heal(
        p,
        `type "${searchText}" into the line item product search box and wait for the dropdown options`,
      );
      if (!healed)
        throw new Error(
          "could not type into the line-item search box" +
            (healerEnabled() ? " (the AI healer also could not)" : " — set UI_AI_HEAL=1 to let the AI try"),
        );
    }

    // Options render in a body-level portal, OUTSIDE the drawer — page-scoped.
    //
    // Re-resolve the option at CLICK time, every attempt. The product search is
    // debounced, so the dropdown re-renders while we are looking at it: a
    // locator resolved a moment earlier points at a detached node, and clicking
    // it waits out the full 15s actionTimeout for an element that will never be
    // actionable. That was the intermittent "add_line_items: locator.click:
    // Timeout 15000ms exceeded" — nothing to do with the product, and it only
    // showed up when the search happened to refresh mid-click.
    const optionLists = () => [
      p.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option']"),
      p.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item"),
      p.getByRole("option"),
      p.locator(".ant-select-item-option"),
    ];

    // Signals to compare against after the click.
    const before = await this.lineItemCountBadge();
    const chipsBefore = await scope.locator(".ant-select-selection__choice, .ant-select-selection-item").count();
    let picked = false;
    for (let attempt = 0; attempt < 3 && !picked; attempt++) {
      // Wait for a populated list before reaching for a row.
      const list = await this.find(optionLists(), { label: "line-item-option", timeout: TIMEOUTS.MEDIUM });
      if (!list) {
        await this.page.waitForTimeout(300);
        continue;
      }
      const clicked = await list
        .first()
        .click({ timeout: 5_000, force: attempt >= 1 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        // Detached or covered; let the list settle and look again.
        await this.page.waitForTimeout(300);
        continue;
      }
      // Confirm from inside the drawer. Two earlier signals were wrong: the
      // dropdown does NOT close (it is a multi-select, kept open for the next
      // product), and the toolbar badge does not move until the drawer is
      // SAVED. What does change immediately is the chosen product appearing as
      // a chip in the select, and the row marking itself selected.
      const deadline = Date.now() + 6_000;
      while (Date.now() < deadline && !picked) {
        const chips = await scope.locator(".ant-select-selection__choice, .ant-select-selection-item").count();
        const marked = await p
          .locator(".ant-select-dropdown-menu-item-selected, [role='option'][aria-selected='true']")
          .count();
        const badge = await this.lineItemCountBadge();
        if (chips > chipsBefore || marked > 0 || (badge !== null && before !== null && badge > before)) picked = true;
        else await this.page.waitForTimeout(250);
      }
    }

    if (!picked) {
      // Warn, do not fail. Not seeing a confirmation signal is not proof the
      // pick failed, and turning it into an error invents a failure mode the
      // old code never had. The honest oracle is `expect_line_items` once the
      // drawer is saved — that reads the app's own tally and will catch a
      // genuine miss with a number rather than a guess.
      console.log(
        `[create-event] could not confirm the pick for "${searchText}" from inside the drawer — ` +
          "continuing; the line-item count is verified after saving",
      );
    }
    await this.page.waitForTimeout(250);

    // Quantity is optional here: on this build the drawer only picks products
    // and quantity is filled in the pricing sheet afterwards. Best-effort, so a
    // drawer without a qty column no longer fails the whole run.
    const qty = scope.getByRole("spinbutton").or(scope.locator("input[type='number']")).last();
    if (await qty.count()) {
      await qty.fill(quantity).catch(() => {});
      await p.keyboard.press("Tab").catch(() => {});
      await this.pause(200);
    }
  }

  // ── stages + title ──────────────────────────────────────────────────────────
  private createProjectButtonCandidates() {
    const p = this.page;
    return [
      p.getByRole("button", { name: /create project/i }),
      p.getByRole("button", { name: /continue|proceed|next/i }),
    ];
  }

  /**
   * Which stage tabs are on screen right now.
   */
  async currentStages(): Promise<StageKey[]> {
    const out: StageKey[] = [];
    for (const key of ALL_STAGES) {
      if (await this.page.getByRole("tab", { name: STAGE_LABEL[key] }).count()) out.push(key);
    }
    return out;
  }

  /**
   * Would the app's own `isValidStage` let this stage be added right now?
   * (projectCreation.jsx: a stage already present is filtered out of the menu,
   * and RFQ / Auction are mutually exclusive.)
   */
  private stageIsAddable(stage: StageKey, current: StageKey[]): boolean {
    if (current.includes(stage)) return false;
    if (stage === "rfq" && current.includes("auction")) return false;
    if (stage === "auction" && current.includes("rfq")) return false;
    return true;
  }

  /** The open stage `⋮` menu, identified by its own "Edit title" row. */
  private stageMenu() {
    return this.page
      .locator(".ant-dropdown:not(.ant-dropdown-hidden)")
      .filter({ hasText: /edit title/i })
      .last();
  }

  /**
   * Open a stage tab's `⋮` menu. It is an unlabelled `<span><svg/></span>` at
   * the end of the tab and its dropdown opens on HOVER, not click — so each
   * icon-bearing span in the tab is hovered from the right until the menu shows.
   */
  private async openStageMenu(stage: StageKey): Promise<boolean> {
    const p = this.page;
    const tab = p.getByRole("tab", { name: STAGE_LABEL[stage] }).first();
    if (!(await tab.count())) return false;
    const icons = tab.locator("span:has(svg), i");
    const n = await icons.count();
    for (let i = n - 1; i >= 0; i--) {
      await tab.hover({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await icons.nth(i).hover({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      // Wait for the hover menu to appear rather than sampling once at 400ms:
      // a miss here costs a whole reconciliation round.
      const shown = await this.stageMenu()
        .waitFor({ state: "visible", timeout: 2_500 })
        .then(() => true)
        .catch(() => false);
      if (shown) return true;
    }
    return false;
  }

  /**
   * Open a stage tab's `⋮` menu for a plan step and report what it holds.
   *
   * UI-CRE-010 checks that Delete is disabled while one stage remains; the
   * item is invisible until this hover menu is open, so a step has to be able
   * to open it and leave it open for the assertion that follows. Defaults to
   * the only/first stage tab when none is named.
   */
  async openStageMenuFor(stage?: StageKey): Promise<Array<{ label: string; disabled: boolean }>> {
    await this.dismissDistractions();
    let target = stage;
    if (!target) {
      for (const k of Object.keys(STAGE_LABEL) as StageKey[]) {
        if (await this.page.getByRole("tab", { name: STAGE_LABEL[k] }).count()) {
          target = k;
          break;
        }
      }
    }
    if (!target || !(await this.openStageMenu(target))) {
      throw new Error(`could not open the ⋮ menu on the ${target ?? "stage"} tab — no stage tab, or the hover menu did not appear`);
    }
    const items = this.stageMenu().getByRole("menuitem");
    const out: Array<{ label: string; disabled: boolean }> = [];
    for (const it of await items.all()) {
      const label = ((await it.textContent()) ?? "").replace(/\s+/g, " ").trim();
      const aria = await it.getAttribute("aria-disabled").catch(() => null);
      const cls = (await it.getAttribute("class").catch(() => "")) ?? "";
      out.push({ label, disabled: aria === "true" || /disabled/.test(cls) });
    }
    return out;
  }

  /** Delete a stage tab. Returns false when the app refuses (see ensureStages). */
  private async deleteStage(stage: StageKey): Promise<boolean> {
    const p = this.page;
    if (!(await this.openStageMenu(stage))) {
      console.log(`[create-event] could not open the stage menu on the "${stage}" tab`);
      return false;
    }
    const del = this.stageMenu().getByRole("menuitem", { name: /delete/i }).first();
    if (!(await del.count())) {
      await p.keyboard.press("Escape").catch(() => {});
      return false;
    }
    // Delete is disabled while a single stage remains; antd renders that as an
    // aria-disabled menu item that silently swallows the click.
    const aria = await del.getAttribute("aria-disabled").catch(() => null);
    const cls = (await del.getAttribute("class").catch(() => "")) ?? "";
    if (aria === "true" || /disabled/.test(cls)) {
      await p.keyboard.press("Escape").catch(() => {});
      return false;
    }
    await del.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await this.pause(600);
    await this.dismissDistractions();
    return !(await p.getByRole("tab", { name: STAGE_LABEL[stage] }).count());
  }

  /**
   * Add a stage through the tablist `+` -> "Add Stages" menu.
   *
   * The `+` lives in `.ant-tabs-extra-content` and is only rendered once the
   * create screen has mounted its tabs. An early `count()` check returned 0 on
   * arrival and made the whole reconciler give up before it started — so the
   * control is WAITED for, not probed.
   */
  private async addStage(stage: StageKey): Promise<boolean> {
    const p = this.page;
    const plus = p.getByRole("button", { name: /icon: plus/i }).first();
    const ready = await plus
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      console.log(`[create-event] add "${stage}": the tablist + control never appeared`);
      return false;
    }
    // Disabled at two stages, and while a title is being edited.
    if (await plus.isDisabled().catch(() => false)) {
      console.log(`[create-event] add "${stage}": the + control is disabled`);
      return false;
    }
    await plus.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    // Wait for the menu to RENDER rather than guessing at 700ms. Reporting
    // "not in the Add Stages menu (offered: [])" when the menu simply had not
    // appeared yet sent the reconciler round again and again — a one-stage
    // composition was taking eight rounds, each with its own waits.
    const menu = p.locator(".ant-dropdown:not(.ant-dropdown-hidden)").last();
    await menu
      .getByRole("menuitem")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
      .catch(() => {});
    const item = menu.getByRole("menuitem", { name: STAGE_LABEL[stage] }).first();
    if (!(await item.count())) {
      const offered = await p
        .locator(".ant-dropdown:not(.ant-dropdown-hidden)")
        .last()
        .getByRole("menuitem")
        .allTextContents()
        .catch(() => []);
      console.log(`[create-event] add "${stage}": not in the Add Stages menu (offered: ${JSON.stringify(offered)})`);
      await p.keyboard.press("Escape").catch(() => {});
      return false;
    }
    await item.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await this.waitForSpinnerHidden();
    // The new tab is mounted asynchronously; wait for it rather than guessing.
    await p
      .getByRole("tab", { name: STAGE_LABEL[stage] })
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});
    await this.dismissDistractions();
    return (await this.currentStages()).includes(stage);
  }

  /**
   * Compose the project's stages EXACTLY, then verify it.
   *
   * The app's rules (projectCreation.jsx `isValidStage` / `getDropdownMenu` /
   * `getTabBarExtraContent`) make this a dance rather than a set of clicks:
   *   - the create screen arrives with ONE default stage tab: Auction;
   *   - the `+` menu lists only stages that are still valid — a stage already
   *     present is hidden, and RFQ and Auction exclude each other outright
   *     ("Remove Auction to add RFQ");
   *   - `+` is disabled once two stages exist (two is the maximum);
   *   - a tab's `⋮` Delete is DISABLED while only one stage remains.
   * So RFQ-only takes four moves: add Technical (to unlock Delete), delete
   * Auction, add RFQ, delete Technical.
   *
   * This used to be a best-effort `ensureStageTabs` that skipped whatever the
   * menu did not offer and logged `stage "rfq" is not offered`. Every RFQ flow
   * then silently published an AUCTION event on the leftover default tab, and
   * rfp_only published a technical stage next to an untouched auction stage —
   * which is what produced "Please select a valid column for savings", since
   * that orphan auction stage had no template and so no savings column.
   */
  async ensureStages(desired: StageKey[]): Promise<void> {
    if (!desired.length) throw new Error("ensureStages needs at least one stage");
    if (desired.includes("rfq") && desired.includes("auction")) {
      throw new Error(
        "Procol does not allow an RFQ stage and an Auction stage in the same project — " +
          'isValidStage() rejects it and the UI says "Remove Auction to add RFQ". An ' +
          "RFQ-then-auction event is produced by converting a published RFQ event to an " +
          "auction, not by composing both stages at create time.",
      );
    }
    if (desired.length > 2) {
      throw new Error(`a project holds at most 2 stages, ${desired.length} requested`);
    }

    await this.dismissDistractions();
    // Nothing can be reconciled until the tab bar exists.
    await this.page
      .getByRole("tab")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .catch(() => {});

    let stalled = 0;
    for (let round = 0; round < 10; round++) {
      const current = await this.currentStages();
      const missing = desired.filter((s) => !current.includes(s));
      const extra = current.filter((s) => !desired.includes(s));
      console.log(
        `[create-event] stages round ${round}: on screen [${current.join(", ") || "none"}], want [${desired.join(", ")}]`,
      );
      if (!missing.length && !extra.length) break;

      // Add what we still need, while there is room and the app allows it.
      const addable = missing.find((s) => this.stageIsAddable(s, current));
      if (addable && current.length < 2 && (await this.addStage(addable))) {
        stalled = 0;
        continue;
      }

      // Otherwise drop a stage we do not want (needs two present for Delete).
      //
      // WHICH one matters. Taking `extra[0]` ping-ponged forever: reaching
      // RFQ-only means parking a Technical stage to unlock Delete, and
      // `extra[0]` was that very Technical stage — so each round added it and
      // the next round deleted it again, never touching the Auction stage that
      // was actually blocking RFQ. Remove the blocker first.
      const blocking = extra.find((s) => missing.some((m) => !this.stageIsAddable(m, [s])));
      const victim = blocking ?? extra[0];
      if (extra.length && current.length > 1 && (await this.deleteStage(victim))) {
        stalled = 0;
        continue;
      }

      // Stuck: the one stage on screen is unwanted AND blocks what we need, but
      // Delete is disabled at one stage. Park a throwaway stage to unlock it.
      if (extra.length && current.length === 1) {
        const filler = ALL_STAGES.find((s) => this.stageIsAddable(s, current));
        if (filler && (await this.addStage(filler))) {
          stalled = 0;
          continue;
        }
      }
      // A round that changed nothing is usually the screen still settling, so
      // give it a moment and try again before declaring the layout impossible.
      if (++stalled >= 3) break;
      await this.pause(1_000);
    }

    const final = await this.currentStages();
    const ok = final.length === desired.length && desired.every((s) => final.includes(s));
    if (!ok) {
      throw new Error(
        `stage composition failed: wanted [${desired.join(", ")}] but the create screen shows ` +
          `[${final.join(", ") || "none"}]. Auction is the default stage, Delete is disabled ` +
          `while one stage remains, and RFQ/Auction are mutually exclusive.`,
      );
    }

    // Deleting a tab can leave the Tabs with no rendered panel: the delete
    // handler picks a new currentStageId, but the panel does not always remount,
    // and the stage body came back completely BLANK — no template picker, no
    // sheet, so publish had nothing to submit and simply never navigated.
    // Selecting the tab explicitly forces the panel to render.
    await this.switchToStageTab(STAGE_LABEL[desired[0]]);
    const bodyReady = await this.page
      .getByRole("button", { name: /select templates?/i })
      .or(this.page.getByText(/select templates?/i))
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    if (!bodyReady) {
      throw new Error(
        `the "${desired[0]}" stage panel rendered empty after composing stages [${final.join(", ")}] — ` +
          "no template picker appeared, so there is nothing to configure or publish.",
      );
    }

    console.log(`[create-event] stages composed: [${final.join(", ")}]`);
  }

  async createProjectWithStages(stages: StageKey[]): Promise<void> {
    if (!stages.length) throw new Error("createProjectWithStages needs at least one stage");
    // The older build opened a "Create Project" dialog with a stage checkbox
    // list. The current build drops straight onto a tab-based create screen with
    // no such button, and insisting on it threw before anything else could run.
    const dialog = await this.clickIfPresent(this.createProjectButtonCandidates(), {
      label: "create-project-open",
      timeout: TIMEOUTS.SHORT,
    });
    if (!dialog) {
      await this.ensureStages(stages);
      return;
    }
    await this.pause(500);

    // Reconcile each stage checkbox to the desired selection.
    for (const key of ALL_STAGES) {
      const menuItem = this.page.getByRole("menuitem", { name: STAGE_LABEL[key] });
      const checkbox = menuItem.getByRole("checkbox");
      const present = await checkbox.count();
      if (!present) continue;
      const want = stages.includes(key);
      const isChecked = await checkbox.isChecked().catch(() => false);
      if (want && !isChecked) await checkbox.check({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      if (!want && isChecked) await checkbox.uncheck({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    }

    await this.click(this.createProjectButtonCandidates(), { label: "create-project-confirm", timeout: TIMEOUTS.MEDIUM });
    await this.waitForSpinnerHidden();
  }

  async setTitle(title: string): Promise<void> {
    const p = this.page;
    await this.fill(
      [
        p.getByRole("textbox", { name: /enter the title of (the|this)/i }),
        p.getByPlaceholder(/enter the title/i),
      ],
      title,
      { label: "project-title", timeout: TIMEOUTS.MEDIUM },
    );
  }

  // ── templates + sheet ────────────────────────────────────────────────────────
  private selectTemplatesButtonCandidates() {
    const p = this.page;
    return [
      p.getByRole("button", { name: /select templates?/i }),
      p.getByText(/select templates?/i),
    ];
  }

  /**
   * Template rows inside the OPEN template dropdown.
   *
   * The old code fell back to a bare `getByRole("menuitem")`, which matched the
   * LEFT NAV first ("clara", "Intake", "Events", ...) — so "pick a template"
   * navigated away from the create page entirely. The dropdown's own first row
   * is a search box, so rows containing an input are excluded too.
   */
  private templateItemCandidates() {
    const p = this.page;
    return [p.getByTestId(/^template-item-/), this.templateRows(), p.locator("[data-template-name]")];
  }

  /**
   * The selectable template rows in the OPEN dropdown.
   *
   * Scoped with `:visible` rather than `.last()`: antd leaves earlier dropdowns
   * in the DOM, and picking the last one landed on a stale hidden menu whose
   * rows could never be clicked. The dropdown's own first row is a search box,
   * so rows containing an input are excluded — clicking that row does nothing
   * and the flow then waits forever on a template that was never applied.
   */
  private templateRows() {
    const p = this.page;
    return p
      .locator(".ant-dropdown:visible, .ant-select-dropdown:visible")
      .locator(".ant-dropdown-menu-item, [role='menuitem'], .ant-select-item-option")
      .filter({ hasNot: p.locator("input") });
  }

  /** Template names currently offered — the basis for choosing one by name. */
  async availableTemplates(): Promise<string[]> {
    const rows = await this.templateRows().allTextContents();
    return rows.map((t) => t.trim()).filter(Boolean);
  }

  /**
   * Pick a template and PROVE it was applied.
   *
   * The old version clicked "Select Templates" exactly once and then waited for
   * a row. When that click was swallowed — a notification strip over the
   * button, or the control not yet mounted after a stage switch — no dropdown
   * ever opened, so the wait timed out and the run "got stuck on the
   * templates". Now: open with retries, verify real rows are on screen, click,
   * and confirm the picker stopped saying "Select Templates". Nothing
   * downstream (the sheet, the Items drawer, publish) works without this, so it
   * is worth being loud about instead of drifting on.
   *
   * @param preferred substring of the wanted template's name; the first row
   *        wins when it is absent or matches nothing.
   */
  async selectTemplate(preferred?: string): Promise<string> {
    const p = this.page;
    await this.waitForSpinnerHidden();

    let opened = false;
    for (let attempt = 0; attempt < 4 && !opened; attempt++) {
      await this.dismissDistractions();
      // On a long stage the picker sits below the fold. Playwright auto-scrolls
      // for a normal click, but a FORCED click does not — and the retry path
      // forces — so an off-screen control was being "clicked" at coordinates
      // nothing occupied. Scroll it in first, every attempt.
      await this.page
        .getByRole("button", { name: /select templates?/i })
        .first()
        .scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT })
        .catch(() => {});
      await this.clickIfPresent(this.selectTemplatesButtonCandidates(), {
        label: "open-templates",
        force: attempt >= 1,
        timeout: TIMEOUTS.SHORT,
      });
      opened = await this.templateRows()
        .first()
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (!opened) {
        // Close whatever half-open state we are in before trying again.
        await p.keyboard.press("Escape").catch(() => {});
        await this.pause(500);
      }
    }
    if (!opened) {
      const healed = await heal(p, "click the Select Templates control to open the template list");
      if (healed) {
        opened = await this.templateRows()
          .first()
          .waitFor({ state: "visible", timeout: 4_000 })
          .then(() => true)
          .catch(() => false);
      }
    }
    if (!opened) {
      throw new Error(
        "the template list never opened — the `Select Templates` control did not respond after four " +
          "attempts, and nothing on this screen (sheet, line items, publish) works without a template.",
      );
    }

    const names = await this.availableTemplates();
    const rows = this.templateRows();
    let index = 0;
    if (preferred) {
      const want = preferred.trim().toLowerCase();
      const found = names.findIndex((n) => n.toLowerCase().includes(want));
      if (found >= 0) index = found;
      else console.log(`[create-event] template "${preferred}" not offered (have: ${names.join(", ")}) — taking the first`);
    }
    const chosen = names[index] ?? "(unnamed)";
    await rows.nth(index).click({ timeout: TIMEOUTS.MEDIUM });
    await this.waitForSpinnerHidden();

    // Applied means EITHER the trigger stopped offering a choice OR the sheet
    // the template defines has rendered. Waiting only for the trigger to vanish
    // was too strict: applying a template is a network round-trip, and on a slow
    // response the button lingers a moment after the schema has already
    // arrived — which failed the step on an event that was perfectly fine.
    const gone = p.getByRole("button", { name: /select templates?/i }).first();
    const sheet = p.locator("[data-testid^='sheet-header-'], .data-grid-container").first();
    const applied = await Promise.race([
      gone.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG }).then(() => true),
      sheet.waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).then(() => true),
    ]).catch(() => false);
    if (!applied) {
      throw new Error(
        `clicking the template "${chosen}" did not apply it — the picker still offers "Select Templates", ` +
          "so the pricing sheet and the Items drawer will both stay inert.",
      );
    }
    console.log(`[create-event] template applied: ${chosen}${names.length > 1 ? ` (of ${names.length} offered)` : ""}`);
    return chosen;
  }

  /**
   * The keys of the pricing sheet's header row, as rendered.
   *
   * `sheet-header-<key>` testids are the template's widget keys made visible,
   * which is what "the sheet schema comes from the template" means on screen.
   * Returns [] when no sheet has rendered — an observation, not an error.
   */
  async sheetHeaderKeys(): Promise<string[]> {
    await this.waitForSpinnerHidden();
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="sheet-header-"]'))
        .map((el) => (el.getAttribute("data-testid") || "").replace("sheet-header-", ""))
        .filter((k) => k && !["row_key", "delete"].includes(k)),
    );
  }

  /** The template name the stage now shows, or null when the picker is still offering a choice. */
  async appliedTemplateName(): Promise<string | null> {
    if (await this.templatePickerPresent()) return null;
    const trigger = this.page.locator("[class*='templateName'], [data-testid*='template-name'], [class*='selectedTemplate']").first();
    const text = (await trigger.textContent().catch(() => null))?.replace(/\s+/g, " ").trim();
    return text || "(applied — name not displayed)";
  }

  /** Switch to a stage tab (multi-stage layout). Firm click, tolerant if absent. */
  async switchToStageTab(label: RegExp): Promise<void> {
    await this.dismissDistractions();
    await this.clickIfPresent(
      [
        this.page.getByRole("tab", { name: label }),
        this.page.locator('[data-testid="project-stage-tabs"]').getByText(label),
        this.page.getByText(label),
      ],
      { label: "stage-tab", timeout: TIMEOUTS.MEDIUM },
    );
    await this.waitForSpinnerHidden();
    await this.pause(500);
  }

  /** True if this stage still needs a template picked (vs one already applied). */
  private async templatePickerPresent(): Promise<boolean> {
    return !!(await this.find(this.selectTemplatesButtonCandidates(), { timeout: 4_000, label: "template-picker" }));
  }

  /**
   * Open the template picker, select the first available template, and capture
   * its schema from the /templates/ GET response to extract creator widgets.
   */
  async selectFirstTemplateAndExtractWidgets(): Promise<Record<string, WidgetConfig>> {
    await this.waitForSpinnerHidden();
    // A later stage may inherit a template already — no picker to click.
    if (!(await this.templatePickerPresent())) {
      return this.extractWidgetsFromRenderedSheet();
    }
    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes("/templates/") && r.request().method() === "GET" && r.status() === 200,
      { timeout: TIMEOUTS.XLONG },
    );

    await this.selectTemplate(templateChoice());

    let widgets: Record<string, WidgetConfig> = {};
    try {
      const res = await responsePromise;
      const json = (await res.json()) as Record<string, unknown>;
      widgets = InlineSheet.extractCreatorWidgets(json);
    } catch {
      // Response race missed; fall through to reading the rendered sheet.
    }
    await this.waitForSpinnerHidden();
    if (!Object.keys(widgets).length) {
      // Losing the /templates/ response race used to leave `widgets` empty,
      // which made `fillSheet` a silent no-op: Price and Quantity Available
      // stayed blank and the publish was rejected with no explanation. The
      // rendered sheet carries the same schema in its cell testids, so read it.
      widgets = await this.extractWidgetsFromRenderedSheet();
      console.log(`[create-event] template response not captured; read ${Object.keys(widgets).length} widget(s) from the sheet`);
    }
    if (!Object.keys(widgets).length) {
      throw new Error(
        "no fillable sheet widgets could be determined for this template — neither the /templates/ " +
          "response nor the rendered sheet produced any creator columns, so the sheet cannot be filled.",
      );
    }
    return widgets;
  }

  /**
   * When a stage inherits a template (no picker), derive widget configs from the
   * already-rendered sheet so we can still fill it. Reads `sheet-cell-1-{key}`
   * testids and their `data-celltype`. Returns {} if nothing fillable renders.
   */
  private async extractWidgetsFromRenderedSheet(): Promise<Record<string, WidgetConfig>> {
    await this.waitForSpinnerHidden();
    const keyTypes = await this.page.evaluate(() => {
      const out: Record<string, string> = {};
      document.querySelectorAll('[data-testid^="sheet-cell-1-"]').forEach((el) => {
        const tid = el.getAttribute("data-testid") || "";
        const key = tid.replace("sheet-cell-1-", "");
        if (!key || ["row_key", "delete"].includes(key)) return;
        out[key] = el.getAttribute("data-celltype") || "number";
      });
      return out;
    });
    const widgets: Record<string, WidgetConfig> = {};
    for (const [key, type] of Object.entries(keyTypes)) widgets[key] = { key, type };
    return widgets;
  }

  /** Select the first available template WITHOUT expecting a pricing sheet (used for technical/RFP stages). */
  /** Kept for callers that do not care which template — honours UI_TEMPLATE. */
  async selectFirstTemplate(): Promise<void> {
    await this.selectTemplate(templateChoice());
  }

  /**
   * Technical stage: assign the first available evaluator to EVERY line item.
   * Each line item shows an `evaluator-add-button`; clicking it opens a picker
   * whose options are `evaluator-option-*`. No typing needed (typing a query
   * can filter out the only evaluator). Returns how many were assigned.
   */
  /**
   * The "Vendor Assessment" section on a technical (RFP) stage — the vendor
   * questionnaire, rendered as its own `_rfiSectionWrapper_` with a
   * `Template: Select Template` dropdown, an `Add Evaluator` button, and a grid
   * whose question column is `rfi_question` ("Specification").
   */
  private vendorAssessmentSection() {
    return this.page
      .locator("[class*='rfiSectionWrapper']")
      .filter({ hasText: /vendor assessment/i })
      .first();
  }

  /**
   * Every RFI section on a technical stage.
   *
   * A technical stage does NOT have one questionnaire — it has one per line
   * item PLUS a global one:
   *
   *   Vendor Assessment    Template: Select Template   + Add Evaluator
   *   AAC BLOCKS           Item Template: Select Template
   *   BACK FILLING         Item Template: Select Template
   *
   * Handling only the global section left every per-item template unset, and
   * the event could still publish — so events went out with empty item
   * questionnaires, which is worse than a hard failure because nobody notices.
   */
  private rfiSections() {
    return this.page.locator("[class*='rfiSectionWrapper']");
  }

  /**
   * Rows in one RFI section that the app would reject.
   *
   * Matching the app's own rule rather than a stricter one: `validateStage`
   * flags a row that has a DESCRIPTION but no QUESTION. Every grid also carries
   * a trailing blank row for adding the next entry — that row has neither, is
   * perfectly legal, and treating it as a gap made the journey fail on a
   * section the app was happy with. Separately, a section with no question
   * anywhere trips `isEntireGlobalSectionEmpty`, so that case reports row 0.
   */
  private async unansweredRows(section: Locator): Promise<number[]> {
    const questions = section.locator('[data-celltype="rfi_question"]:not([data-testid^="sheet-header"])');
    const descriptions = section.locator('[data-celltype="rfi_description"]:not([data-testid^="sheet-header"])');
    const total = await questions.count();
    const bad: number[] = [];
    let anyQuestion = false;
    for (let i = 0; i < total; i++) {
      const q = ((await questions.nth(i).textContent().catch(() => "")) ?? "").trim();
      const d = ((await descriptions.nth(i).textContent().catch(() => "")) ?? "").trim();
      if (q) anyQuestion = true;
      else if (d) bad.push(i); // described but unanswered — the app rejects this
    }
    if (!anyQuestion && total > 0 && !bad.length) bad.push(0);
    return bad;
  }

  /**
   * Give every RFI section a template, and fill anything left blank.
   *
   * A section whose trigger still reads "Select Template" has none applied;
   * once one is chosen the trigger shows the template's name instead, which is
   * how we tell the difference without tracking state.
   */
  async fillVendorAssessment(): Promise<void> {
    const p = this.page;
    const sections = this.rfiSections();
    const count = await sections.count();
    if (!count) {
      console.log("[create-event] no RFI sections on this stage");
      return;
    }

    let applied = 0;
    let filled = 0;
    for (let i = 0; i < count; i++) {
      const section = sections.nth(i);
      const title =
        ((await section.locator("h2, h3").first().textContent().catch(() => "")) ?? "").trim() || `section ${i + 1}`;

      // 1 · template, if this section still offers to pick one
      const trigger = section.locator("[class*='templateName']").first();
      if (await trigger.count()) {
        const label = ((await trigger.textContent().catch(() => "")) ?? "").trim();
        if (/select template/i.test(label)) {
          await trigger.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
          await trigger.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
          await this.pause(700);
          const item = await this.find(this.templateItemCandidates(), {
            label: `rfi-template:${title}`,
            timeout: TIMEOUTS.SHORT,
          });
          if (item) {
            await item.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
            await this.waitForSpinnerHidden();
            await this.pause(600);
            applied++;
          } else {
            await p.keyboard.press("Escape").catch(() => {});
            console.log(`[create-event] no template offered for RFI section "${title}"`);
          }
        }
      }

      // 2 · anything the template did not fill
      const empty = await this.unansweredRows(section);
      if (empty.length) {
        const grid = section.locator(".data-grid-container").first();
        if (await grid.count()) {
          const sheet = new InlineSheet(p, grid);
          for (const row of empty) {
            await sheet.fillCell(row, "rfi_question", { key: "rfi_question", type: "text" }, `QA specification ${row + 1}`);
            filled++;
          }
        }
      }
    }

    // Prove it: nothing may be left blank anywhere.
    const stillEmpty: string[] = [];
    for (let i = 0; i < (await sections.count()); i++) {
      const section = sections.nth(i);
      const title = ((await section.locator("h2, h3").first().textContent().catch(() => "")) ?? "").trim() || `section ${i + 1}`;
      const empty = await this.unansweredRows(section);
      if (empty.length) stillEmpty.push(`${title} (${empty.length})`);
    }
    console.log(
      `[create-event] RFI sections: ${count} · templates applied: ${applied} · questions typed: ${filled}` +
        (stillEmpty.length ? ` · STILL EMPTY: ${stillEmpty.join(", ")}` : ""),
    );
    if (stillEmpty.length) {
      throw new Error(
        `these RFI sections still have blank questions: ${stillEmpty.join(", ")}. A technical stage can ` +
          "publish in this state, so the event would go out with an empty questionnaire.",
      );
    }
  }

  async assignEvaluatorToAllLineItems(): Promise<number> {
    const p = this.page;
    const buttons = p.getByTestId("evaluator-add-button");
    let assigned = 0;
    let index = 0;

    for (let guard = 0; guard < 40; guard++) {
      const count = await buttons.count();
      if (!count || index >= count) break;

      if (!(await buttons.nth(index).isVisible().catch(() => false))) {
        index++;
        continue;
      }
      const opened = await this.openEvaluatorPicker(index);
      if (!opened) {
        console.log(`[create-event] the evaluator picker would not open for control ${index + 1}`);
        index++;
        continue;
      }

      const picked = await this.pickFirstNamedOption("evaluator");
      if (!picked) {
        const healed = await heal(p, "click the first named user in the open Search users list to assign them as evaluator");
        if (!healed) {
          await p.keyboard.press("Escape").catch(() => {});
          console.log(`[create-event] no selectable user in the evaluator picker for control ${index + 1}`);
          index++;
          continue;
        }
      }
      assigned++;
      await p.keyboard.press("Escape").catch(() => {});
      await this.pause(400);
      await this.dismissDistractions();

      // Some builds remove the add-button once satisfied and some keep it. If
      // it is still there, this control is done and we move on — otherwise the
      // indices have shifted and the same index is now the next control.
      const after = await buttons.count();
      if (after >= count) index++;
    }

    console.log(`[create-event] evaluator assigned to ${assigned} control(s)`);
    return assigned;
  }

  /** The "Search users" panel the evaluator button opens, identified by its input. */
  private evaluatorPanel() {
    const p = this.page;
    return p
      .locator(".ant-dropdown:visible, .ant-select-dropdown:visible, .ant-popover:visible")
      .filter({ has: p.getByPlaceholder(/search users/i) })
      .last();
  }

  /**
   * Open the evaluator picker for one control, and confirm it is open.
   *
   * Re-resolving the button on every attempt matters: applying the Vendor
   * Assessment template re-renders that whole section, so a locator captured
   * before it detaches — and the old code swallowed the resulting click error,
   * leaving a run that reported "no selectable user" when in truth nothing had
   * ever been clicked.
   */
  private async openEvaluatorPicker(index: number): Promise<boolean> {
    const p = this.page;
    for (let attempt = 0; attempt < 3; attempt++) {
      const btn = p.getByTestId("evaluator-add-button").nth(index);
      await this.dismissDistractions();
      await btn.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      const clicked = await btn
        .click({ timeout: TIMEOUTS.SHORT, force: attempt >= 1 })
        .then(() => true)
        .catch((e) => {
          console.log(`[create-event] evaluator button click failed (attempt ${attempt + 1}): ${String(e).split("\n")[0].slice(0, 120)}`);
          return false;
        });
      if (!clicked) {
        await this.pause(400);
        continue;
      }
      const open = await this.evaluatorPanel()
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (open) return true;
      await p.keyboard.press("Escape").catch(() => {});
      await this.pause(400);
    }
    return false;
  }

  /**
   * Click the first option in an open picker THAT HAS TEXT.
   *
   * antd renders the search row as an option, so an option list reads
   * `["", "Satish Kumar Kaushik"]` and `.first()` selects the blank one: the
   * click lands on nothing, the panel stays open, and the caller loops.
   */
  private async pickFirstNamedOption(label: string, panelOverride?: Locator): Promise<boolean> {
    const p = this.page;
    // Scope every candidate to the picker itself. A generic
    // `[class*='dropdown']:visible li` matched the LEFT SIDEBAR's
    // `ant-menu-submenu` items — 14 of them — so the picker looked full of
    // options while the real panel had never opened, and the run reported the
    // wrong problem entirely.
    // Which panel matters: the evaluator picker is identified by its "Search
    // users" input, and using it to read the VENDOR dropdown matched nothing —
    // so inviting by name silently fell back to the product's own audience and
    // the named vendor was never on the event.
    const panel = panelOverride ?? this.evaluatorPanel();
    const lists = [
      p.locator("[data-testid^='evaluator-option-']"),
      panel.locator(".ant-select-item, [role='option'], li, [class*='option'], [class*='userRow']"),
      p.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item"),
      p.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option']"),
    ];
    // Wait for a row to actually have TEXT before deciding there is nothing to
    // pick. The panel becomes visible before its users render, so reading
    // immediately saw two rows both reading "" and concluded the picker was
    // empty — when the only real problem was arriving 400ms early.
    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
      let anyText = false;
      for (const list of lists) {
        const n = await list.count().catch(() => 0);
        for (let i = 0; i < n && !anyText; i++) {
          if (((await list.nth(i).textContent().catch(() => "")) ?? "").trim()) anyText = true;
        }
        if (anyText) break;
      }
      if (anyText) break;
      await this.pause(300);
    }

    const seen: string[] = [];
    for (const list of lists) {
      const n = await list.count().catch(() => 0);
      if (n) seen.push(`${n} row(s) in ${await list.first().evaluate((e) => e.className?.toString().slice(0, 40)).catch(() => "?")}`);
      for (let i = 0; i < n; i++) {
        const row = list.nth(i);
        const text = ((await row.textContent().catch(() => "")) ?? "").trim();
        if (!text) continue; // the search row renders as an empty option
        if (!(await row.isVisible().catch(() => false))) continue;
        await row.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        const clicked = await row
          .click({ timeout: TIMEOUTS.SHORT })
          .then(() => true)
          .catch(() => false);
        if (!clicked) {
          seen.push(`"${text.slice(0, 30)}" not clickable`);
          continue;
        }
        console.log(`[create-event] ${label} selected: ${text.slice(0, 40)}`);
        return true;
      }
    }
    // Say what was actually on screen — "no selectable user" with nothing else
    // sends the next person hunting blind.
    const anyDropdown = await p.locator(".ant-select-dropdown:visible, [class*='dropdown']:visible").count().catch(() => 0);
    console.log(
      `[create-event] ${label} picker had nothing selectable — ${anyDropdown} open dropdown(s); ${
        seen.length ? seen.join("; ") : "no option rows matched any known shape"
      }`,
    );
    return false;
  }


  /**
   * Fill the pricing sheet for EVERY line item on screen.
   *
   * `rowCount` is what the journey asked for; the grid is what actually exists.
   * When the grid has more data rows than we requested, those extra rows still
   * carry required cells, and leaving them blank gets the publish refused for a
   * row the journey never knew about — so the larger of the two wins.
   */
  async fillSheet(widgets: Record<string, WidgetConfig>, rowCount: number): Promise<void> {
    const sheet = new InlineSheet(this.page);
    const rendered = await sheet.renderedRowCount();
    const target = Math.max(rowCount, rendered ? rendered - 1 : 0); // row 0 is the header
    if (target !== rowCount) {
      console.log(`[create-event] sheet shows ${target} line-item row(s), asked for ${rowCount} — filling all ${target}`);
    }
    const rows = sheet.generateRows(widgets, target);
    await sheet.fillAndVerify(widgets, rows);

    // The template's `creator` widgets are not the whole story. This build
    // refuses to publish with "Sheet partially filled, please check again."
    // when a column the schema does not mark as creator-owned is left blank —
    // so after the schema-driven pass, sweep the rendered grid and fill
    // anything still empty and still editable. Reading the columns off the
    // sheet is what makes this work for a template nobody has seen before.
    const swept = await this.fillRemainingSheetCells(target);
    console.log(
      `[create-event] sheet filled for ${target} line item(s)` + (swept ? ` (+${swept} column(s) the schema did not list)` : ""),
    );
  }

  /**
   * Fill every cell the app still considers empty, whatever the schema said.
   *
   * Columns are discovered from the rendered grid (`data-celltype` on each
   * cell) rather than from the template response, so a template this code has
   * never seen is handled the same as a familiar one. Read-only and computed
   * columns identify themselves with `aria-disabled` and are left alone.
   */
  private async fillRemainingSheetCells(rowCount: number): Promise<number> {
    const p = this.page;
    const columns = await p.evaluate(() => {
      const out: Record<string, string> = {};
      document.querySelectorAll('[data-testid^="sheet-cell-1-"]').forEach((el) => {
        const key = (el.getAttribute("data-testid") ?? "").replace("sheet-cell-1-", "");
        if (!key || ["row_key", "delete", "total_amount"].includes(key)) return;
        if (el.getAttribute("aria-disabled") === "true") return;
        out[key] = el.getAttribute("data-celltype") || "number";
      });
      return out;
    });

    const sheet = new InlineSheet(p);
    let filled = 0;
    for (let row = 0; row < rowCount; row++) {
      for (const [key, type] of Object.entries(columns)) {
        const cell = sheet.getCell(row, key);
        if (!(await cell.count())) continue;
        if ((await cell.getAttribute("aria-disabled").catch(() => null)) === "true") continue;
        if (await sheet.cellValue(row, key)) continue; // already has a value
        // Translate the grid's column key into the kind the filler understands.
        const kind = sheet.canonicalType(type);
        const value = sheet.valueForType(kind);
        if (value === undefined) continue; // computed or unknown — nothing to type
        await sheet.fillCell(row, key, { key, type: kind }, value).catch(() => {});
        if (await sheet.cellValue(row, key)) filled++;
      }
    }
    return filled;
  }

  // ── publish ──────────────────────────────────────────────────────────────────
  /** Participant chips currently on the event. */
  async participantCount(): Promise<number> {
    const region = this.participantsRegion();
    if (!(await region.count())) return 0;
    return region.locator(".ant-select-selection__choice, .ant-tag, [class*='chip']").count();
  }

  private participantsRegion() {
    return this.page
      .locator("div")
      .filter({ hasText: /^Participants/ })
      .last();
  }

  /**
   * Make sure the event actually has vendors, and prove it.
   *
   * The old version fired `clickIfPresent` at an "Invite Vendor" button and
   * moved on. That helper returns quietly when nothing matches, so a screen
   * without that button — or with it under a notification strip — produced a
   * silent no-op, and the publish confirm modal went on to say
   * "Vendors invited: 0". An event with no participants is not a published
   * event, so this step now ends by counting chips.
   *
   * Vendors usually arrive on their own: the product's audience auto-populates
   * once line items exist (154 of them on this client). When it does not, one
   * is added deliberately through the participants combobox.
   */
  /**
   * Add one named vendor to the participants list.
   *
   * Typing the name and taking the first NAMED row: the participants combobox
   * renders its search box as an empty option, so picking row zero picks
   * nothing. Returns false when the search finds nobody, which is a real
   * outcome a test may want to assert rather than an error.
   */
  async addParticipantByName(name: string): Promise<boolean> {
    const p = this.page;
    const region = this.participantsRegion();
    await this.dismissDistractions();
    await this.clickIfPresent(
      [
        region.getByText(/search vendors you want to add/i),
        p.getByText(/search vendors you want to add/i),
        region.locator(".ant-select-selection"),
      ],
      { label: "open-participants", timeout: TIMEOUTS.SHORT },
    );
    await this.pause(500);
    const search = region.locator("input.ant-select-search__field:not([disabled]), input:not([disabled])").first();
    if (!(await search.count())) return false;
    await search.fill(name).catch(() => {});
    // Vendor search is a server round-trip; wait for rows rather than guessing.
    await p
      .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li, .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});
    // Identify the vendor dropdown by its own "VENDORS" group header. Taking
    // the LAST open dropdown was wrong: filling the sheet leaves a dozen
    // non-hidden antd dropdowns behind, so `.last()` landed on a stale sheet
    // menu and the invite quietly fell back to the product's audience.
    const open = p.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)");
    const byHeader = open.filter({ hasText: /vendors/i });
    const vendorPanel = (await byHeader.count()) ? byHeader.last() : open.last();
    const picked = await this.pickFirstNamedOption(`vendor "${name}"`, vendorPanel);
    await p.keyboard.press("Escape").catch(() => {});
    await this.pause(500);
    return picked;
  }

  /**
   * Invite specific vendors, or make sure there are at least `count` of them.
   *
   * Bid tests care WHICH vendor is invited — you cannot log into the vendor
   * portal as "whoever the audience happened to contain" — so names come first
   * and the auto-populated audience is only a fallback for tests that just need
   * somebody to bid.
   */
  async inviteVendors(opts: { names?: string[]; count?: number } = {}): Promise<string[]> {
    const invited: string[] = [];
    for (const name of opts.names ?? []) {
      const ok = await this.addParticipantByName(name);
      if (ok) invited.push(name);
      else console.log(`[create-event] no vendor matched "${name}"`);
    }
    if (invited.length) {
      console.log(`[create-event] invited by name: ${invited.join(", ")}`);
      return invited;
    }
    // No names given (or none matched) — fall back to whoever is there.
    await this.inviteVendor();
    const have = await this.participantCount();
    if (opts.count && have < opts.count) {
      throw new Error(
        `the event has ${have} participant(s) but the test needs at least ${opts.count}. The product's ` +
          "audience did not supply enough, and no vendor names were given to add explicitly.",
      );
    }
    return [];
  }

  async inviteVendor(): Promise<void> {
    const p = this.page;
    await this.dismissDistractions();

    // The audience fetch is asynchronous. Poll briskly rather than sleeping in
    // 500ms slabs — this console never goes network-idle, so every pause()
    // was running its whole budget, and six of them cost 3s on every run.
    let count = await this.participantCount();
    for (let i = 0; i < 12 && count === 0; i++) {
      await p.waitForTimeout(250);
      count = await this.participantCount();
    }
    if (count > 0) {
      console.log(`[create-event] ${count} participant(s) already on the event`);
      return;
    }

    // "Invite Vendor" opens the invite flow on builds that have it.
    await this.clickIfPresent(
      [p.getByRole("button", { name: /invite vendor/i }), p.getByText(/^Invite Vendor$/i)],
      { label: "invite-vendor", timeout: TIMEOUTS.SHORT },
    );
    await this.dismissDistractions();

    count = await this.participantCount();
    if (count === 0) {
      // Add one by hand through the participants combobox.
      const region = this.participantsRegion();
      await this.clickIfPresent(
        [
          region.getByText(/search vendors you want to add/i),
          p.getByText(/search vendors you want to add/i),
          region.locator(".ant-select-selection"),
        ],
        { label: "open-participants", timeout: TIMEOUTS.SHORT },
      );
      const search = region
        .locator("input.ant-select-search__field:not([disabled]), input:not([disabled])")
        .first();
      await search.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }).catch(() => {});
      if (await search.count()) {
        await search.fill("a").catch(() => {});
        // Wait for the search RESULTS, not two seconds: the options appear when
        // the vendor search returns, which is usually well under a second.
        await p
          .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option'], .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item")
          .first()
          .waitFor({ state: "visible", timeout: 4_000 })
          .catch(() => {});
        const picked = await this.pickFirstNamedOption("vendor");
        if (picked) await p.keyboard.press("Escape").catch(() => {});
      }
      // The participant chip renders once the add request returns.
      for (let i = 0; i < 12 && (await this.participantCount()) === 0; i++) await p.waitForTimeout(250);
      count = await this.participantCount();
    }

    await this.dismissDistractions();
    if (count === 0) {
      throw new Error(
        "the event has no participants — neither the product audience nor the participants combobox " +
          'produced a vendor, and publishing would create an event nobody can bid on ("Vendors invited: 0").',
      );
    }
    console.log(`[create-event] ${count} participant(s) invited`);
  }

  /**
   * Click Publish and get past the confirm modal.
   *
   * The app validates the whole project ON THE CLICK: when something is wrong
   * it shows a message toast and never opens the confirm modal. The old code
   * wrapped the confirm click in `.catch(() => {})` "because some builds
   * publish without a confirm modal", which meant a REJECTED publish looked
   * exactly like a successful one — the flow sailed on and only died 60s later
   * on a URL timeout with no reason attached. So: wait for either outcome, and
   * report the app's own words when it refuses.
   */
  async publish(projectTitle: string): Promise<void> {
    const p = this.page;
    await this.dismissDistractions();
    await this.click(
      [
        p.getByRole("button", { name: /^publish( event)?$/i }),
        p.getByText(/^publish( event)?$/i),
      ],
      { label: "publish", timeout: TIMEOUTS.MEDIUM },
    );

    const modal = p
      .locator(".ant-modal-content, [role='dialog']")
      .filter({ has: p.getByRole("button", { name: /^publish|confirm|yes/i }) })
      .first();

    let refusal: string | null = null;
    let confirmable = false;
    const deadline = Date.now() + TIMEOUTS.MEDIUM;
    while (Date.now() < deadline) {
      if (await modal.isVisible().catch(() => false)) {
        confirmable = true;
        break;
      }
      const toast = await this.errorToastText(300);
      if (toast) {
        refusal = toast;
        break;
      }
      if (this.projectId()) return; // published with no confirm step
      await this.pause(200);
    }
    if (refusal) throw new Error(`the app refused to publish: ${refusal}`);

    if (confirmable) {
      const modalTitle = projectTitle.slice(0, 45);
      await this.click(
        [
          p.getByLabel(modalTitle).getByRole("button", { name: /^publish/i }),
          modal.getByRole("button", { name: /^publish|confirm|yes/i }),
        ],
        { label: "publish-confirm", timeout: TIMEOUTS.MEDIUM },
      );
    }
  }

  /**
   * Publish, then wait for EITHER the redirect to the published project OR the
   * app's own validation toast — whichever comes first.
   *
   * Waiting only on the URL turned every rejected publish into a bare
   * "waitForURL: Timeout 60000ms exceeded" reported 60 seconds later, long
   * after the toast that said exactly what was wrong had faded. The toast is
   * the app telling us why it refused; it belongs in the failure message.
   */
  async publishAndAwaitOutcome(projectTitle: string): Promise<void> {
    await this.publish(projectTitle);
    const deadline = Date.now() + TIMEOUTS.XLONG;
    const seen: string[] = [];
    while (Date.now() < deadline) {
      if (this.projectId()) return;
      const toast = await this.errorToastText(400);
      if (toast && !seen.includes(toast)) seen.push(toast);
      await this.pause(250);
    }
    if (this.projectId()) return;
    throw new Error(
      seen.length
        ? `publish was rejected by the app: ${seen.join(" | ")}`
        : `publish did not reach a project page within ${TIMEOUTS.XLONG}ms and the app showed no error ` +
          `toast (still on ${this.page.url()})`,
    );
  }

  /**
   * Open the Schedule drawer and commit it.
   *
   * This is not cosmetic — it is the step that gives the stage a bidding-time
   * `TradeSchedule`, and without one the publish dies server-side. On activation
   * the backend runs, per stage:
   *
   *   trade_schedule = trade_request.trade_schedules.for_bidding_time.last
   *   TradeSchedule.change_auction_time(trade_schedule)   # start_time on nil
   *
   * with no nil guard (trade_controller_helper.rb `publish_auction` →
   * trade_schedule.rb `change_auction_time`), so an unsaved schedule turns every
   * eRFX publish into a bare 500 with no message. The footer chip shows a
   * default ("Now - 02:33 am, 9th Sep (30 Mins)") which reads as already set,
   * which is exactly why this was easy to miss: the default is displayed but
   * never persisted until Save Schedule is pressed.
   */
  /** The duration preset actually chosen (minutes), when the schedule was edited. */
  scheduleMinutesChosen: number | null = null;

  async saveSchedule(): Promise<void> {
    const p = this.page;
    await this.dismissDistractions();
    const opened = await this.clickIfPresent(
      [
        // the chip is labelled by its own value, e.g. "Now - 02:33 am, 9th Sep (30 Mins)"
        p.getByRole("button", { name: /\(\s*\d+\s*mins?\s*\)/i }),
        p.getByRole("button", { name: /^\s*Now\s*-/i }),
        p.getByRole("button", { name: /schedule/i }),
      ],
      { label: "open-schedule", timeout: TIMEOUTS.MEDIUM },
    );
    if (!opened) {
      console.log("[create-event] no schedule control on this screen — skipping");
      return;
    }
    const panel = p
      .locator(".ant-drawer-content, .ant-modal-content, .ant-popover")
      .filter({ hasText: /schedule event/i })
      .last();
    const visible = await panel
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      throw new Error("the Schedule Event panel did not open, so the stage schedule cannot be committed");
    }
    // Editing the window is a parameter, not a hard-coded step: the duration
    // field is the one the AI is most likely to be asked to change ("run it for
    // 2 hours"), so it is driven from UI_SCHEDULE_MINUTES rather than baked in.
    const minutes = scheduleMinutes();
    if (minutes) {
      // A 3-minute request produced a 30-minute window (UI-AWD-001, 11 Sep):
      // the first input in the panel is evidently not the duration. Record the
      // panel's tree before touching it, then fill the field that is LABELLED
      // as the duration, falling back to the first number input only if no
      // label matches — and read the chip afterwards to see what was kept.
      await recordStuck(this.page, {
        label: "capture:schedule-panel",
        message: "captured on request — the Schedule panel before the duration is set",
        triedCandidates: [],
        healerTried: false,
      }).catch(() => {});
      // Captured 2026-09-11: "End time" is a mode combobox ("Duration") followed
      // by a PRESET select whose display reads "30 Mins"; there is no number
      // input. Open the first select that shows a duration, list its options,
      // and pick the smallest that covers the request — the app has no
      // 3-minute preset, so 3 becomes 15 and the plan is told so.
      // Captured markup (2026-09-11): the End time block is a
      // `_timeInputWrapper` holding two `_inputCol`s — a mode select reading
      // "Duration" and a sibling whose whole text is the value ("30 Mins").
      // Drive that sibling: click it; if a dropdown opens, pick the smallest
      // preset covering the request; if it exposes an input, type the minutes.
      const endBlock = panel.locator("[class*='timeInputWrapper']").filter({ hasText: /end time/i }).first();
      const scope = (await endBlock.count()) ? endBlock : panel;
      const valueCol = scope.locator("[class*='inputCol']").filter({ hasText: /^\s*\d+\s*(Mins?|Minutes?|Hours?)\s*$/i }).first();
      const inner = (await valueCol.evaluate((e) => e.outerHTML.replace(/\s+/g, " ").slice(0, 600)).catch(() => "")) || "";
      console.log(`[create-event] duration value control: ${inner || "not found"}`);
      // Evidence for a shorter road: what does the End time MODE select offer
      // besides "Duration"? (A fixed end time would allow a 3-minute window.)
      const modeSel = scope.locator("[class*='inputCol'] .ant-select").filter({ hasText: /duration/i }).first();
      if (await modeSel.count()) {
        await modeSel.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        const modeOpts = this.page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option'], .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item");
        await modeOpts.first().waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
        const modes = (await modeOpts.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
        console.log(`[create-event] end-time mode options: ${modes.join(" | ") || "(none read)"}`);
        await this.page.keyboard.press("Escape").catch(() => {});
      }
      let chosen: number | null = null;
      if (await valueCol.count()) {
        const input = valueCol.locator("input").first();
        const clickTarget = (await valueCol.locator(".ant-select, .ant-select-selection, [role='combobox']").count())
          ? valueCol.locator(".ant-select, .ant-select-selection, [role='combobox']").first()
          : valueCol;
        await clickTarget.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        await clickTarget.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        const options = this.page.locator(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option'], .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item, .ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item, [role='listbox'] [role='option']",
        );
        const opened = await options.first().waitFor({ state: "visible", timeout: 4_000 }).then(() => true).catch(() => false);
        const toMinutes = (t: string) => {
          const m = t.match(/(\d+)\s*(mins?|minutes?|hours?|hrs?|days?)/i);
          if (!m) return NaN;
          const n = Number(m[1]);
          return /hour|hr/i.test(m[2]) ? n * 60 : /day/i.test(m[2]) ? n * 1440 : n;
        };
        if (opened) {
          const texts = (await options.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
          const ranked = texts.map((t, i) => ({ t, i, m: toMinutes(t) })).filter((o) => Number.isFinite(o.m)).sort((a, b) => a.m - b.m);
          const pick = ranked.find((o) => o.m >= minutes) ?? ranked[ranked.length - 1];
          if (pick) {
            await options.nth(pick.i).click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
            chosen = pick.m;
            console.log(`[create-event] schedule duration: asked ${minutes} min, chose preset "${pick.t}" (options: ${ranked.map((o) => o.t).join(", ")})`);
          } else {
            await this.page.keyboard.press("Escape").catch(() => {});
            console.log(`[create-event] the duration dropdown had no readable presets: ${texts.join(", ")}`);
          }
        } else if (await input.count()) {
          await input.fill("").catch(() => {});
          await input.fill(String(minutes)).catch(() => {});
          await this.page.keyboard.press("Tab").catch(() => {});
          chosen = minutes;
          console.log(`[create-event] schedule duration typed: ${minutes} min`);
        } else {
          console.log("[create-event] the duration value control opened nothing and has no input — keeping the default window");
        }
      } else {
        console.log("[create-event] no duration value column in the Schedule panel — keeping the default window");
      }
      this.scheduleMinutesChosen = chosen;
    }

    await this.click([panel.getByRole("button", { name: /save schedule/i })], {
      label: "save-schedule",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.waitForSpinnerHidden();
    await panel.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG }).catch(() => {});
    await this.dismissDistractions();
    // What did the app keep? The chip is labelled by its own value —
    // "Now - 03:27 pm, 11th Sep (30 Mins)" — so it is the ground truth.
    const chip = this.page.locator("button:has(.anticon-clock-circle)").first();
    const chipText = (await chip.textContent().catch(() => null))?.replace(/\s+/g, " ").trim();
    console.log(`[create-event] schedule saved${chipText ? ` — chip reads: ${chipText}` : ""}`);
    const expect = this.scheduleMinutesChosen ?? minutes;
    if (expect && chipText && !new RegExp(`\\(\\s*${expect}\\s*Mins?\\)|\\(\\s*${expect / 60}\\s*Hours?\\)`, "i").test(chipText)) {
      console.log(`[create-event] WARNING: chose ${expect} min but the chip does not show it — the selection did not take`);
    }
  }

  /** Save the event as a draft instead of publishing (allow_draft_project_creation). */
  async saveAsDraft(): Promise<void> {
    await this.dismissDistractions();
    // The button exists on every create screen but the app DISABLES it until
    // the event has enough to be worth keeping. A run that only set a title
    // spent 10s failing to click it and reported a locator problem; the stuck
    // report's tree read `button "Save as draft" [disabled]`. Read the state
    // first and say what the screen says, so the report is about the product.
    const draft = this.page.getByRole("button", { name: /save as draft/i }).first();
    if (await draft.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
      const disabled = (await draft.isDisabled().catch(() => false)) || (await draft.getAttribute("aria-disabled")) === "true";
      if (disabled) {
        // The button's accessible name is "icon: unordered-list Items 0" — no anchor.
        const items = (await this.page.getByRole("button", { name: /items\s*\d+/i }).first().textContent().catch(() => null))?.replace(/\s+/g, " ").trim();
        const picker = await this.templatePickerPresent();
        throw new Error(
          `Save as draft is DISABLED on this screen — the app will not keep a draft in this state` +
            ` (${picker ? "no template selected" : "template selected"}${items ? `, ${items}` : ""}).` +
            ` Add what the case expects a draft to hold before saving.`,
        );
      }
    }
    await this.click(
      [
        this.page.getByRole("button", { name: /save as draft/i }),
        this.page.getByText(/save as draft/i),
      ],
      { label: "save-as-draft", timeout: TIMEOUTS.MEDIUM },
    );
    // Some builds confirm in a modal.
    await this.clickIfPresent(
      [this.page.getByRole("dialog").getByRole("button", { name: /save|confirm|yes|draft/i })],
      { label: "save-draft-confirm", timeout: TIMEOUTS.SHORT },
    );
  }

}
