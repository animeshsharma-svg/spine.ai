import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { EventsPage } from "./EventsPage.js";
import { recordStuck } from "../oracle/stuck.js";
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
  /** Why the conversion was not available — the useful half of a false. */
  lastReason = "";

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
      timeout: TIMEOUTS.SHORT,
    });
    if (!opened) {
      this.lastReason = "no Settings button on this tab";
      return false;
    }
    // The Settings menu is an antd Dropdown rendered into a portal on
    // #orderDetails, and it arrives a beat after the click. Reading it
    // immediately found "nothing" and looked like a closed feature gate.
    const menu = this.page.locator(".ant-dropdown:not(.ant-dropdown-hidden)").last();
    await menu
      .locator(".ant-dropdown-menu-item, [role='menuitem']")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .catch(() => {});

    const convert = menu
      .locator(".ant-dropdown-menu-item, [role='menuitem']")
      .filter({ hasText: /convert to auction/i })
      .first();
    const present = (await convert.count()) > 0;
    if (!present) {
      // Distinguish "the control is missing" from "the control is there and the
      // option is not". The second means a config gate is closed
      // (showConvertToAuction needs isRfq, a non-draft status and vendor
      // masking OFF) — a very different conclusion from a locator problem.
      const offered = await menu
        .locator(".ant-dropdown-menu-item, [role='menuitem']")
        .allTextContents()
        .catch(() => []);
      this.lastReason = `Settings opened but offered only: ${offered.map((t) => t.trim()).filter(Boolean).join(", ") || "nothing"}`;
      await this.page.keyboard.press("Escape").catch(() => {});
    }
    return present;
  }

  /**
   * Get to the view that offers the conversion.
   *
   * Publishing lands on `/project/:id/details` — a PROJECT-level tab. The
   * Settings menu that carries "Convert to Auction" belongs to the event
   * header, which only renders on a STAGE tab (whose key is the stage's uuid).
   * Guessing that the stage tab is called "RFQ" was too fragile: tabs are named
   * from the stage title, which the creator can edit. So each tab is tried
   * until the menu appears, which works whatever it is called.
   */
  async openStageOfferingConversion(): Promise<boolean> {
    const p = this.page;
    if (await this.canConvertToAuction()) return true;

    const tabs = p.getByRole("tab");
    const count = await tabs.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const label = ((await tabs.nth(i).textContent().catch(() => "")) ?? "").trim();
      // Project-level tabs never carry the event header.
      if (/^(project\s+)?(details|overview|approvals|documents|activity|master\s+qcs)$/i.test(label)) continue;
      await tabs.nth(i).click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      // Selecting a stage tab NAVIGATES (to /project/:id/:stageUuid?tab=compare)
      // and the event header arrives with the new page, not with the click.
      // Waiting a fixed moment checked before the button existed and concluded
      // the feature was unavailable — wait for the control itself.
      await this.page
        .getByTestId("event-settings-button")
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
        .catch(() => {});
      await this.dismissDistractions();
      if (await this.canConvertToAuction()) {
        console.log(`[event-detail] "Convert to Auction" is on the "${label}" tab`);
        return true;
      }
    }
    const labels = await tabs.allTextContents().catch(() => []);
    console.log(
      `[event-detail] no tab offered "Convert to Auction" (tabs: ${labels.map((t) => t.trim()).join(", ")}) — last check: ${this.lastReason}`,
    );
    return false;
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
  /**
   * Force-end the current stage: Settings → "End <Status>" (eventHeader.jsx
   * builds the label as `End ${status}` — "End Live", "End Rfq In Progress" —
   * and renders it only when the tenant's trade_config.trade_force_close is
   * on) → the end-time confirm modal → remarks → OK, which sends
   * `force_end: true` and toasts "Event time updated successfully".
   * Returns what happened in words; throws with the menu's own items when
   * the option is not offered.
   */
  async forceEnd(remark = "Closed by the QA platform"): Promise<string> {
    const p = this.page;
    await this.dismissDistractions();
    // The Settings menu belongs to the stage tab, not the project summary.
    const onStage = await p.locator("[role='tab'][aria-selected='true'], .ant-tabs-tab-active").filter({ hasText: /rfq|auction|technical|rfp/i }).count();
    if (!onStage) {
      const tab = p.getByRole("tab", { name: /^(rfq|auction|technical|rfp)\b/i }).first();
      if (await tab.count()) {
        await tab.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        await this.waitForSpinnerHidden();
      }
    }
    await p.getByText(/loading your event details/i).first().waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
    const settings = p.getByTestId("event-settings-button").or(p.getByRole("button", { name: /settings/i })).first();
    await settings.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
    await this.dismissDistractions();
    await settings.click({ timeout: TIMEOUTS.MEDIUM });
    const menu = p.locator(".ant-dropdown:not(.ant-dropdown-hidden)").last();
    await menu.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    const items = menu.locator(".ant-dropdown-menu-item, [role='menuitem']");
    const offered = (await items.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
    const end = items.filter({ hasText: /^end\b(?!\s*time\s*$)/i }).first();
    if (!(await end.count())) {
      await p.keyboard.press("Escape").catch(() => {});
      // Captured on PROCOL DEMO 2026-09-11: the menu offers Recreate Order,
      // Shared With, Extend Submission Time, Withdraw, Convert to Auction,
      // Rejected Bids, Order Activity, Edit Evaluation Time, Send Bulk Counter
      // Offer — no "End …": trade_force_close is off here. The only road to a
      // closed event on this tenant is letting the bidding window lapse.
      return `no force-end on this tenant (Settings offers: ${offered.join(", ")}) — waiting for the window to lapse`;
    }
    const label = ((await end.textContent()) ?? "").trim();
    if ((await end.getAttribute("aria-disabled")) === "true" || /disabled/.test((await end.getAttribute("class")) ?? "")) {
      await p.keyboard.press("Escape").catch(() => {});
      throw new Error(`"${label}" is disabled on this event (old version or project on hold)`);
    }
    await end.click({ timeout: TIMEOUTS.SHORT });
    const modal = p.locator(".ant-modal-wrap:not([style*='display: none']) .ant-modal-content, [role='dialog']").last();
    await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    const remarks = modal.locator("textarea, input[placeholder*='remark' i]").first();
    if (await remarks.count()) await remarks.fill(remark).catch(() => {});
    const ok = modal.getByRole("button", { name: /^(ok|confirm|yes|end|proceed|submit)/i }).first();
    if (!(await ok.count())) {
      const buttons = (await modal.getByRole("button").allTextContents()).map((t) => t.trim()).filter(Boolean);
      throw new Error(`the end-time modal has no confirm control — buttons: ${buttons.join(", ")}`);
    }
    await ok.click({ timeout: TIMEOUTS.MEDIUM });
    const err = await this.errorToastText(3_000);
    if (err) throw new Error(`ending the event was refused: ${err}`);
    const okToast = await this.successToastText(6_000);
    await this.waitForSpinnerHidden();
    return `${label} → ${okToast ?? "confirmed"}`;
  }

  /**
   * Wait for the current event's bidding window to lapse, reading "Ends in
   * Xm : Ys" from its row in the events list. Bounded: if the window is longer
   * than `maxWaitMinutes`, say so rather than sit there — the plan should have
   * published with a short schedule (set_schedule{minutes}).
   */
  async waitForWindowToLapse(title: string, maxWaitMinutes = 6): Promise<string> {
    const p = this.page;
    const projectId = BasePage.projectIdFromUrl(p.url());
    const events = new EventsPage(p);
    const readRemaining = async (): Promise<{ text: string; seconds: number | null; over: boolean }> => {
      // A fresh load every time: the list caches, and a stale row reads as live.
      await events.goto();
      // The event this run just published is the newest, so it is at the top
      // of the list: read its row there, and search only when it is not. It
      // used to search every time, typing the title into the box every 15 s
      // while the row sat in plain sight.
      const onTop = await p
        .getByText(title, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (!onTop) await events.searchByTitle(title);
      const row = (await events.rowTextFor(title)) ?? "";
      const m = row.match(/ends in\s*(?:(\d+)\s*h\s*:?\s*)?(\d+)\s*m\s*:?\s*(\d+)\s*s/i);
      // Once the window ends, the row keeps the words "Ends in" with NOTHING
      // after them and the status word stays "RFQ in Progress" (captured
      // 2026-09-11 after a 2-minute window: "Ends in 1/1 RFQ in Progress 1").
      // So "live" means a countdown with a time in it; an ended state word
      // anywhere in the row also counts as over.
      const liveCountdown = !!m;
      const endedWord = /overdue|evaluat|closed|ended|history|completed|expired/i.test(row);
      const over = row.length > 0 && (endedWord || (!liveCountdown && /ends in/i.test(row)));
      const seconds = m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
      console.log(`[close-event] row: ${row.slice(0, 140)} → ${over ? "window over" : seconds !== null ? `${seconds}s left` : "no countdown read"}`);
      return { text: row.slice(0, 160), seconds, over };
    };
    let state = await readRemaining();
    if (!state.over && state.seconds !== null && state.seconds > maxWaitMinutes * 60) {
      throw new Error(
        `the bidding window still has ${Math.round(state.seconds / 60)} min to run and no force-end is offered on this tenant — publish with set_schedule{minutes: 3} for a closed-event case (row: ${state.text})`,
      );
    }
    const deadline = Date.now() + maxWaitMinutes * 60_000 + 30_000;
    while (!state.over && Date.now() < deadline) {
      // As long as the countdown says, plus a few seconds for the app to mark
      // it ended — one wait and one look, not a reload every 15 s. With no
      // countdown to read, look again in 15 s.
      const wait = state.seconds !== null ? Math.max(5_000, state.seconds * 1_000 + 4_000) : 15_000;
      const capped = Math.max(1_000, Math.min(wait, deadline - Date.now()));
      console.log(`[close-event] waiting ${Math.round(capped / 1000)} s for the bidding window to end`);
      await p.waitForTimeout(capped);
      state = await readRemaining();
    }
    if (!state.over) throw new Error(`the bidding window had not lapsed after ${maxWaitMinutes} min (row: ${state.text})`);
    // Back to the event.
    if (projectId) await events.openEvent({ id: projectId });
    return `window lapsed — the list row now reads: ${state.text}`;
  }

  /**
   * Create a new version of a published event (project page tab bar → "Create New Version" →
   * confirm "Create a New Version"). The app archives the current version, makes its bids
   * read-only, and opens the create screen in edit mode on the copy
   * (`?projectCreation=true&projectId=…&draftStageIds=…&isEditingAllowed=true`,
   * projectDetails.jsx handleCreateNewVersion) — where items can be removed or added and the
   * copy is published again.
   *
   * The control only exists when `can_create_new_version` is true (event_group.rb:1091):
   * the client has is_event_versioning_enabled, the event is not a draft, not withdrawn, the
   * latest version, has no award proposal that is selected/requested/active, no lot split,
   * an auction stage only with allow_versioning_post_auction, and the user shares a team
   * with the event's creator. When it is absent, those are the reasons we report.
   */
  async createNewVersion(): Promise<{ url: string; stageIds: string[] }> {
    const p = this.page;
    await this.dismissDistractions();
    // Right after publish the project page is still a spinner; "no button" means nothing until
    // its tabs have drawn (the button sits in the tab bar's extra content).
    await p.getByRole("tab", { name: /project details/i }).first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG * 2 }).catch(() => {});
    await this.waitForSpinnerHidden();
    // the "+" icon puts its label ("icon: plus") in front of the name — match the end only
    const direct = p.getByRole("button", { name: /create new version\s*$/i }).first();
    let opened = await direct.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }).then(() => true).catch(() => false);
    if (!opened) {
      // Once versions exist the control moves into the version picker (a Select whose first
      // option holds the same button).
      const picker = p.locator(".ant-select").filter({ hasText: /version/i }).first();
      if (await picker.isVisible().catch(() => false)) {
        await picker.click().catch(() => {});
        opened = await direct.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT }).then(() => true).catch(() => false);
      }
    }
    if (!opened) {
      throw new Error(
        'this event offers no "Create New Version" — the app shows it only when versioning is on for the client, ' +
          "the event is published (not draft/withdrawn), it is the latest version, no award proposal has been submitted or approved, " +
          "no lot split is done, and (for an auction) versioning after auction is allowed (event_group.rb:1091)",
      );
    }
    await direct.click({ timeout: TIMEOUTS.MEDIUM });
    const dialog = p.getByRole("dialog").filter({ hasText: /create a new version/i }).last();
    await dialog.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    await dialog.getByRole("button", { name: /^\s*create a new version\s*$/i }).click({ timeout: TIMEOUTS.MEDIUM });
    // POST /item_versions, then the app navigates to the create screen on the copy.
    const landed = await p
      .waitForURL(/projectCreation=true/i, { timeout: TIMEOUTS.LONG * 2 })
      .then(() => true)
      .catch(() => false);
    if (!landed) {
      const err = await this.errorToastText(1_500);
      throw new Error(`the new version did not open for editing${err ? ` — the app said: ${err}` : " (still on the project page after the confirm)"}`);
    }
    await p.waitForLoadState("domcontentloaded").catch(() => {});
    await this.waitForSpinnerHidden();
    const u = new URL(p.url());
    return { url: `${u.pathname}${u.search}`, stageIds: (u.searchParams.get("draftStageIds") ?? "").split(",").filter(Boolean) };
  }

  async convertToAuction(): Promise<Page> {
    const p = this.page;
    const menu = p.locator(".ant-dropdown:not(.ant-dropdown-hidden)").last();
    await this.click(
      [
        menu.locator(".ant-dropdown-menu-item, [role='menuitem']").filter({ hasText: /convert to auction/i }),
        p.getByRole("menuitem", { name: /convert to auction/i }),
      ],
      { label: "convert-to-auction", timeout: TIMEOUTS.MEDIUM },
    );
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
