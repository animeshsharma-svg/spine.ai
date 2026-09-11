import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { recordStuck } from "../oracle/stuck.js";

export type CreatePath = "single-stage" | "erfx" | "boq";

/**
 * Events list + the "create event" entry menu. The trigger label drifts across
 * builds ("New Event" -> "Create Event"), and the menu offers Single Stage /
 * eRFX Project / BOQ — so every locator here is multi-candidate.
 */
export class EventsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private createTriggerCandidates() {
    const p = this.page;
    return [
      p.getByRole("button", { name: /create event/i }),
      p.getByRole("button", { name: /new event/i }),
      p.getByRole("button", { name: /\+?\s*event/i }),
    ];
  }

  private menuItemCandidates(path: CreatePath) {
    const p = this.page;
    const byText = (re: RegExp) => [
      p.getByRole("menuitem", { name: re }),
      p.locator(".ant-dropdown-menu-item", { hasText: re }),
      p.locator("li", { hasText: re }),
      p.getByText(re),
    ];
    switch (path) {
      case "single-stage":
        return byText(/single stage/i);
      case "erfx":
        return byText(/eRFX Project/i);
      case "boq":
        return byText(/BOQ/i);
    }
  }

  async goto(): Promise<void> {
    await this.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/orders`, NAV);
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.dismissDistractions();
  }

  /**
   * Assert the list is genuinely on screen.
   *
   * "Create Event" is the one control that exists on the list and nowhere
   * else, so it is the honest signal — checking for rows would pass on an
   * empty tenant and checking the URL would pass on a page that failed to
   * render.
   */
  async expectListReady(): Promise<void> {
    const p = this.page;
    await this.expect(
      [
        p.getByRole("button", { name: /create event/i }),
        p.getByRole("link", { name: /create event/i }),
        p.locator("button, a").filter({ hasText: /create event/i }).first(),
      ],
      { label: "events list ready", timeout: TIMEOUTS.LONG },
    );
    const err = await this.errorToastText(1_000);
    if (err) throw new Error(`the events list showed an error: ${err}`);
  }

  /** The direct URL for each creation path — our reliable fallback. */
  private createUrl(path: CreatePath): string {
    const base = CONFIG.appUrl.replace(/\/$/, "");
    switch (path) {
      case "single-stage":
        return `${base}/orders/quick-create?singleStage=true`;
      case "boq":
        return `${base}/orders/quick-create?projectCreation=true&boq=true`;
      case "erfx":
      default:
        return `${base}/orders/quick-create?projectCreation=true`;
    }
  }

  /** Are we on a create/quick-create screen rather than the events list? */
  private async onCreateScreen(): Promise<boolean> {
    return /quick-create|\/create/i.test(this.page.url());
  }

  /**
   * Open the create menu and pick a creation path.
   *
   * "Create Event" is a SPLIT control: the primary half navigates straight to
   * the default create screen while only the chevron opens the Single Stage /
   * eRFX / BOQ menu. The old code always clicked the trigger and then insisted
   * on a menu item — so when the primary half navigated (or the menu label
   * drifted) the menu click matched nothing and the run sat on /orders forever.
   *
   * Now: try the menu, but check where we actually ended up after every step,
   * and fall back to the direct URL. Navigating by URL is exactly what the
   * single-stage flow already does reliably, so this can't be worse.
   */
  async startCreate(path: CreatePath): Promise<void> {
    await this.dismissDistractions();

    // 1) Prefer the chevron, which is what actually opens the path menu.
    const chevron = this.page
      .getByRole("button", { name: /create event/i })
      .locator("xpath=following-sibling::*[1]")
      .first();
    await chevron.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});

    // 2) If a menu opened, pick the path from it.
    const picked = await this.clickIfPresent(this.menuItemCandidates(path), {
      label: `create-menu:${path}`,
      timeout: TIMEOUTS.SHORT,
    }).catch(() => false);

    // 3) No menu? Click the trigger itself — on many builds this navigates.
    if (!picked && !(await this.onCreateScreen())) {
      await this.click(this.createTriggerCandidates(), { label: "create-event-trigger", force: true }).catch(
        () => {},
      );
      await this.clickIfPresent(this.menuItemCandidates(path), {
        label: `create-menu-retry:${path}`,
        timeout: TIMEOUTS.SHORT,
      }).catch(() => {});
    }

    await this.page.waitForLoadState("domcontentloaded").catch(() => {});

    // 4) Still on the list? Go straight to the create URL rather than stalling.
    if (!(await this.onCreateScreen())) {
      await this.page.goto(this.createUrl(path), NAV);
      await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    }

    await this.dismissDistractions();

    if (!(await this.onCreateScreen())) {
      throw new Error(
        `could not reach the ${path} create screen — still on ${this.page.url()}. ` +
          `The "Create Event" control or its menu labels may have changed again.`,
      );
    }
  }

  /**
   * Open the Create Event menu and return the options it offers, as text.
   *
   * The menu is what UI-ENV-002 and its neighbours are ABOUT — which paths a
   * tenant is offered (eRFX, single-stage, BOQ) is tenant configuration made
   * visible — so a step has to be able to observe it rather than click through
   * it. Returns an empty list when the control navigates directly and there is
   * no menu, which is itself an observation worth asserting on.
   */
  async readCreateMenu(): Promise<string[]> {
    await this.dismissDistractions();
    const open = this.page.locator(".ant-dropdown:not(.ant-dropdown-hidden)");
    const menu = open.locator(".ant-dropdown-menu-item, [role='menuitem']");

    // The list hydrates slowly on this environment (the goto alone can take
    // 25s), and a chevron clicked before the dropdown is wired does nothing.
    // Try a few times, and only proceed once a menu is actually on screen.
    for (let attempt = 0; attempt < 4 && (await open.count()) === 0; attempt++) {
      // The "Want to stay updated?" card arrives 2-3s AFTER the list renders
      // and sits exactly over the Create Event control, so a dismissal at
      // page-open is too early. Dismiss again right before every attempt —
      // the stuck screenshot for this step showed the card covering the button.
      await this.dismissDistractions();
      const button = this.page.getByRole("button", { name: /create event/i }).first();
      // The accessibility tree names the control "icon: plus Create Event icon:
      // down": the chevron is INSIDE the button, not a sibling of it.
      const chevron = button.locator(".anticon-down, [aria-label='icon: down'], i[class*='down']").first();
      const clicked = await chevron
        .click({ timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        // antd Dropdown opens on hover; hovering the button is the next-best move.
        await button.hover({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      }
      await open.first().waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }).catch(() => {});
      if ((await open.count()) === 0) await this.page.waitForTimeout(800);
    }

    // Each item is a title plus a description; read leaf nodes separately so
    // the text does not fuse into "Single StageSource through RFP".
    const items: string[] = [];
    for (const item of await menu.all()) {
      const parts = (await item.locator("xpath=.//*[not(*)]").allTextContents()).map((t) => t.trim()).filter(Boolean);
      const text = (parts.length ? parts : [await item.innerText().catch(() => "")]).join(" — ").replace(/\s+/g, " ").trim();
      if (text) items.push(text);
    }
    if (!items.length) {
      // Say what was on screen, so an empty read is diagnosable from the report.
      await recordStuck(this.page, {
        label: "create-menu:read",
        message: "the Create Event menu did not open, or opened with no items",
        triedCandidates: ["button[name=/create event/i] + following-sibling chevron", ".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item"],
        healerTried: false,
      }).catch(() => {});
    }
    await this.page.keyboard.press("Escape").catch(() => {});
    return items;
  }

  /**
   * Switch the events list to one of its tabs — Live, History, Drafts,
   * Recurring. The tab label carries a count badge ("LIVE 5606"), so match on
   * the word, not the whole text.
   */
  async openTab(tab: string): Promise<string> {
    await this.dismissDistractions();
    const want = new RegExp(`^\\s*${tab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    await this.click(
      [
        this.page.getByRole("tab", { name: want }),
        this.page.locator(".ant-tabs-tab").filter({ hasText: want }).first(),
        this.page.getByText(want).first(),
      ],
      { label: `events-tab:${tab.toLowerCase()}` },
    );
    await this.waitForSpinnerHidden();
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
    const active = await this.page.locator(".ant-tabs-tab-active, [role='tab'][aria-selected='true']").first().textContent().catch(() => null);
    // The tab text carries its count badge ("Live5618"); the word is the answer.
    return (active ?? tab).replace(/\d[\d,]*\s*$/, "").replace(/\s+/g, " ").trim() || tab;
  }

  /** Search the events list by title and report whether any row matches. */
  async searchByTitle(query: string): Promise<void> {
    const search = await this.expect(
      [
        this.page.getByRole("textbox", { name: /search title/i }),
        this.page.getByPlaceholder(/search title|search/i),
      ],
      { label: "events-search", timeout: TIMEOUTS.MEDIUM },
    );
    await search.click();
    await search.fill(query);
    await search.press("Enter");
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
  }

  /**
   * The text of the list row (or card) that carries this title — the whole
   * block, so the status chip ("Draft", "RFQ in Progress") comes with it.
   * Returns null when no row carries the title.
   */
  async rowTextFor(title: string): Promise<string | null> {
    const link = this.page.getByRole("link").filter({ hasText: title }).first();
    if (!(await link.count())) {
      const any = this.page.getByText(title, { exact: false }).first();
      if (!(await any.count())) return null;
      const block = any.locator("xpath=ancestor::*[self::li or self::tr or contains(@class,'row') or contains(@class,'card') or contains(@class,'item')][1]");
      return ((await ((await block.count()) ? block : any).innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim() || null;
    }
    const block = link.locator("xpath=ancestor::*[self::li or self::tr or contains(@class,'row') or contains(@class,'card') or contains(@class,'item')][1]");
    return ((await ((await block.count()) ? block : link).innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim() || null;
  }

  async hasEventMatching(pattern: RegExp | string): Promise<boolean> {
    const count = await this.page.getByRole("link").filter({ hasText: pattern }).count();
    return count > 0;
  }
}
