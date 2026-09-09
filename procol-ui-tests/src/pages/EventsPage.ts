import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";

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

  async hasEventMatching(pattern: RegExp | string): Promise<boolean> {
    const count = await this.page.getByRole("link").filter({ hasText: pattern }).count();
    return count > 0;
  }
}
