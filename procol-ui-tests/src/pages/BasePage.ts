import { Page, Locator } from "@playwright/test";
import { noteToast } from "../oracle/journal.js";
import { TIMEOUTS } from "../config.js";
import {
  Candidate,
  ClickOptions,
  FindOptions,
  clickFirst,
  clickIfPresent,
  expectFirst,
  fillFirst,
  firstMatch,
} from "../support/locate.js";

/**
 * Base for every Page Object. Exposes the resilient locator helpers bound to
 * this page, plus dismissal of the recurring console distractions that
 * otherwise intercept clicks (browser-notification prompt, "stay updated"
 * notice, cookie banner).
 */
export class BasePage {
  constructor(public readonly page: Page) {}

  // ── resilient action wrappers ────────────────────────────────────────────
  click(candidates: Candidate[], opts: ClickOptions = {}) {
    return clickFirst(this.page, candidates, opts);
  }
  fill(candidates: Candidate[], value: string, opts: FindOptions = {}) {
    return fillFirst(this.page, candidates, value, opts);
  }
  find(candidates: Candidate[], opts: FindOptions = {}) {
    return firstMatch(candidates, opts);
  }
  expect(candidates: Candidate[], opts: FindOptions = {}) {
    return expectFirst(candidates, opts);
  }
  clickIfPresent(candidates: Candidate[], opts: ClickOptions = {}) {
    return clickIfPresent(this.page, candidates, opts);
  }

  /**
   * Close whatever transient popups are currently on screen. Cheap and safe to
   * call before any important interaction; each dismissal is best-effort.
   */
  async dismissDistractions(): Promise<void> {
    const p = this.page;
    await clickIfPresent(
      p,
      [
        // browser-notification prompt
        p.getByRole("button", { name: /^Not now$/i }),
        // cookie banner
        p.getByRole("button", { name: /^Got it$/i }),
        // generic "stay updated" dismiss inside the antd notification
        p.locator(".ant-notification-notice").getByRole("button", { name: /Not now|Close|Dismiss/i }),
        p.locator(".ant-notification-notice-close"),

        // The page-level yellow strip: "🔔 Turn on notifications to get real time
        // updates for your events.  Enable Now   ✕".
        // It is NOT an antd notification, so the selectors above never matched it
        // and it sat over the page for the whole run. Close it via the ✕ that
        // lives in the same strip — never the "Enable Now" link.
        p
          .locator("div, section, header")
          .filter({ hasText: /Turn on notifications/i })
          .last()
          // NEVER the close button of a drawer or modal. The "Manage Line Items"
          // panel closes via `button.ant-drawer-close[aria-label="Close"]`, so a
          // generic close/dismiss candidate here slammed the panel shut the
          // instant it opened — every line-item step then found nothing to type
          // into. Dismissing distractions must never dismiss the thing we opened.
          .locator(
            "button:not(.ant-drawer-close):not(.ant-modal-close), [role='button']:not(.ant-drawer-close):not(.ant-modal-close)",
          )
          .last(),

        // The accessibility dump of a stalled create page still showed
        // `button "Not now"` next to `button "Yes, I'm in"` — a second, modal
        // opt-in prompt that the strict /^Not now$/ match above misses when the
        // label carries surrounding whitespace or an icon. Match it loosely and
        // ALWAYS take the declining half, never "Yes, I'm in".
        p.getByRole("button", { name: /not\s*now/i }),
        p.locator("button", { hasText: /not\s*now/i }),
      ],
      { timeout: 1_500 },
    );
  }

  /** Wait for any antd loading spinner to disappear (best-effort). */
  async waitForSpinnerHidden(timeout = TIMEOUTS.MEDIUM): Promise<void> {
    await this.page
      .locator(".ant-spin-spinning")
      .first()
      .waitFor({ state: "hidden", timeout })
      .catch(() => {});
  }

  /** Read the current URL path. */
  path(): string {
    return new URL(this.page.url()).pathname;
  }

  /** Grab the first success toast text if one shows up (data validation aid). */
  async successToastText(timeout: number = TIMEOUTS.SHORT): Promise<string | null> {
    const toast = this.page.locator(".ant-message-success, .ant-notification-notice-success").first();
    const ok = await toast
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);
    if (!ok) return null;
    const text = (await toast.textContent())?.trim() ?? null;
    // A success toast is evidence too — it is what makes a UI-says-yes /
    // API-says-500 contradiction detectable.
    if (text) noteToast("success", text);
    return text;
  }

  /** Grab the first error toast text if one shows up. */
  /**
   * URL segments that sit under /orders/ but are NOT a project id.
   *
   * `/orders/quick-create` is the CREATE screen itself and it satisfied the old
   * `/orders/[^/]+` redirect test — so a publish the app had REJECTED still
   * counted as a successful redirect, and `projectId()` returned the literal
   * string "quick-create" to satisfy `expect(projectId).toBeTruthy()`. Every
   * event flow could pass without ever publishing anything.
   */
  private static readonly NON_PROJECT_SEGMENTS = /^(quick-create|create|detail|new)$/i;

  /** The project id in a URL, or null when the URL is not a project page. */
  static projectIdFromUrl(url: string): string | null {
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      /* already a path */
    }
    const id = path.match(/\/(?:project|orders)\/([^/?#]+)/)?.[1] ?? null;
    return id && !BasePage.NON_PROJECT_SEGMENTS.test(id) ? id : null;
  }

  /** Wait until the browser is actually on a published project page. */
  async waitForRedirectToProject(timeout: number = TIMEOUTS.XLONG): Promise<void> {
    await this.page.waitForURL((url) => !!BasePage.projectIdFromUrl(url.toString()), { timeout });
  }

  projectId(): string | null {
    return BasePage.projectIdFromUrl(this.page.url());
  }

  /**
   * Wait for the page to settle, not for a fixed number of milliseconds.
   *
   * The suite was carrying 58 hard-coded sleeps — about 39 seconds a run spent
   * waiting whether or not anything was happening. A fixed sleep is wrong in
   * both directions: too long when the app already responded, too short when it
   * is genuinely busy. This waits a short floor for animations to start, then
   * returns as soon as the network goes quiet, falling back to the full budget
   * when it never does (this console holds long-lived connections open, so
   * networkidle is not guaranteed).
   *
   * `UI_SPEED` scales the budget: 0.5 halves every wait, 2 doubles it for a
   * slow environment. Timeouts for real conditions are untouched — only the
   * blind waiting shrinks.
   */
  protected async pause(ms: number): Promise<void> {
    const factor = Number(process.env.UI_SPEED);
    const budget = Math.max(60, Math.round(ms * (Number.isFinite(factor) && factor > 0 ? factor : 1)));
    const floor = Math.min(120, budget);
    await this.page.waitForTimeout(floor);
    if (budget > floor) {
      await this.page.waitForLoadState("networkidle", { timeout: budget - floor }).catch(() => {});
    }
  }

  async errorToastText(timeout: number = TIMEOUTS.SHORT): Promise<string | null> {
    const toast = this.page.locator(".ant-message-error, .ant-notification-notice-error").first();
    const ok = await toast
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);
    if (!ok) return null;
    const text = (await toast.textContent())?.trim() ?? null;
    // Report it to the Oracle's journal while it is still on screen. This is
    // the app saying why it refused, and an antd message is gone in about three
    // seconds — long before the assertion fails and anyone thinks to look.
    if (text) noteToast("error", text);
    return text;
  }
}

export type { Locator };
