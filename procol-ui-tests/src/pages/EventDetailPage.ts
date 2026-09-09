import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../config.js";

/**
 * A published event's detail page (`/orders/:id`).
 *
 * Currently used for the RFQ→Auction conversion, which is NOT a create-time
 * stage composition: `isValidStage()` in projectCreation.jsx refuses to hold an
 * RFQ stage and an Auction stage in the same project ("Remove Auction to add
 * RFQ"). The real journey is Settings → Convert to Auction on a PUBLISHED RFQ,
 * which opens the create screen again in a NEW TAB, prefilled with
 * `isRfqToAuction=true&draftStageIds=<stage id>`.
 */
export class EventDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private settingsButton() {
    const p = this.page;
    return [
      p.getByTestId("event-settings-button"),
      p.getByRole("button", { name: /settings/i }),
    ];
  }

  /** True when this event offers the conversion (published, non-masked RFQ). */
  async canConvertToAuction(): Promise<boolean> {
    await this.dismissDistractions();
    const opened = await this.clickIfPresent(this.settingsButton(), {
      label: "event-settings",
      timeout: TIMEOUTS.MEDIUM,
    });
    if (!opened) return false;
    await this.pause(600);
    const present = !!(await this.page
      .getByRole("menuitem", { name: /convert to auction/i })
      .count()
      .catch(() => 0));
    if (!present) await this.page.keyboard.press("Escape").catch(() => {});
    return present;
  }

  /**
   * Settings → Convert to Auction → Continue, and return the create-screen tab
   * the app opens with `window.open`.
   *
   * The menu item only reveals a Popover (use RFQ quotes / participants /
   * weights); the navigation happens on its "Continue" button. Defaults on the
   * checkboxes are accepted deliberately — the flow asserts the conversion
   * carries the RFQ's data forward, which is the default behaviour.
   */
  async convertToAuction(): Promise<Page> {
    const p = this.page;
    await this.click([p.getByRole("menuitem", { name: /convert to auction/i })], {
      label: "convert-to-auction",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.pause(800);

    // The conversion opens the create screen in a new tab.
    const [popup] = await Promise.all([
      p.context().waitForEvent("page", { timeout: TIMEOUTS.LONG }),
      this.click(
        [
          p.getByRole("button", { name: /^continue$/i }),
          p.getByText(/^Continue$/),
        ],
        { label: "convert-continue", timeout: TIMEOUTS.MEDIUM },
      ),
    ]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    if (!/isRfqToAuction=true/i.test(popup.url())) {
      throw new Error(
        `Convert to Auction opened ${popup.url()}, which is not the isRfqToAuction create screen`,
      );
    }
    return popup;
  }
}
