import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../config.js";

/**
 * Awarding — choosing which vendor's bid wins, after bidding.
 *
 * The path, established against the live app:
 *   published event -> Master QCS tab -> Start Awarding -> /awarding/:id
 *   -> select line items per vendor -> Create Proposal -> submit
 *
 * Two things about it are easy to get wrong:
 *
 *  1. The entry control CHANGES once a proposal exists. `masterQcs.jsx` renders
 *     "Start Awarding" (`#goToAwardingFlow`) only while `currentProposal` is
 *     absent; afterwards it becomes "Bid Selection Proposal" with a Draft tag
 *     (`#bidSelectionProposal`). A flow that only knows the first control works
 *     once and then reports the feature missing.
 *  2. Awarding is gated by `is_awarding_allowed` / `isAllowedToAward`, and the
 *     button carries a tooltip saying why when it is disabled — a live event, a
 *     stage still in draft, or not being the latest version. That reason is
 *     worth reporting rather than discovering as a dead click.
 */
export class AwardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * The two counters the awarding screen keeps, which are the oracle for this
   * whole step.
   *
   * They measure DIFFERENT things and both must be non-zero: "Tot. selected
   * line items" counts what will be awarded, and "Awarded Vendors" counts who
   * it goes to. Watching only the first was the bug that made this step fail —
   * the checkbox that awards a vendor moves only the second, so it was being
   * treated as an unrelated toggle and unticked again. Create Proposal then
   * refused with "Please award for at least one Vendor".
   */
  private async counters(): Promise<{ items: { selected: number; total: number } | null; vendors: { selected: number; total: number } | null }> {
    const text = ((await this.page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ");
    const i = text.match(/selected line items\s*(\d+)\s*\/\s*(\d+)/i);
    const v = text.match(/Awarded Vendors\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
    return {
      items: i ? { selected: Number(i[1]), total: Number(i[2]) } : null,
      vendors: v ? { selected: Number(v[1]), total: Number(v[2]) } : null,
    };
  }

  private async selectedLineItems(): Promise<{ selected: number; total: number } | null> {
    return (await this.counters()).items;
  }

  /** Move to the Master QCS tab, where awarding starts. */
  async openMasterQcs(): Promise<boolean> {
    const p = this.page;
    await p
      .getByRole("tab")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .catch(() => {});
    await this.dismissDistractions();
    const clicked = await this.clickIfPresent([p.getByRole("tab", { name: /master qcs/i })], {
      label: "master-qcs-tab",
      timeout: TIMEOUTS.MEDIUM,
    });
    if (!clicked) {
      console.log("[award] no Master QCS tab on this project");
      return false;
    }
    // The comparison sheet loads separately from the tab switch.
    await p
      .locator("#goToAwardingFlow, #bidSelectionProposal")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .catch(() => {});
    await this.dismissDistractions();
    return true;
  }

  /**
   * Enter the awarding flow, whichever control the current state offers.
   */
  async startAwarding(): Promise<void> {
    const p = this.page;
    if (!(await this.openMasterQcs())) {
      throw new Error("could not reach the Master QCS tab, where awarding begins");
    }

    const start = p.locator("#goToAwardingFlow").first();
    const resume = p.locator("#bidSelectionProposal").first();
    const which = (await start.count()) ? start : (await resume.count()) ? resume : null;
    if (!which) {
      throw new Error(
        'neither "Start Awarding" nor "Bid Selection Proposal" is on the Master QCS tab. Awarding needs ' +
          "a published event with bids, and it is hidden for a project whose stages are still draft.",
      );
    }

    if (await which.isDisabled().catch(() => false)) {
      // The app explains itself in the tooltip; quote it rather than guessing.
      const why =
        (await which.getAttribute("title").catch(() => null)) ??
        (await which.locator("xpath=ancestor::*[@title][1]").getAttribute("title").catch(() => null)) ??
        "no reason given";
      throw new Error(
        `awarding is disabled on this event: ${why}. It is blocked while any event in the project is ` +
          "live, while a stage is still draft, and on anything but the latest version.",
      );
    }

    const label = (await start.count()) ? "Start Awarding" : "Bid Selection Proposal";
    await which.click({ timeout: TIMEOUTS.MEDIUM });
    const arrived = await p
      .waitForURL(/\/awarding\//, { timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);
    if (!arrived) {
      throw new Error(`clicking "${label}" did not open the awarding screen (still on ${p.url()})`);
    }
    // Reload the awarding screen once it is reached. Arriving through the SPA
    // transition leaves the comparison grid in a state where the vendor's
    // "Select All" ticks but neither counter moves; the same control on a
    // freshly loaded page works first time. Cheaper to reload than to guess
    // which piece of state is stale.
    await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await p
      .getByRole("button", { name: /create proposal|awarded vendors/i })
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .catch(() => {});
    await this.dismissDistractions();
    // The grid arrives after the chrome does.
    await p
      .locator(".rdg-cell")
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
      .catch(() => {});
    await this.pause(2_000);
    const state = await this.selectedLineItems();
    console.log(
      `[award] awarding screen open via "${label}"${state ? ` · ${state.selected}/${state.total} line items selected` : ""}`,
    );
  }

  /**
   * Allocate line items to a vendor.
   *
   * The screen counts allocations itself ("Tot. selected line items 1/2"), so
   * that counter is the oracle: check boxes until it stops rising, and report
   * the number reached. Guessing which checkbox belongs to which vendor from
   * the DOM was unreliable — the count is what the app itself believes.
   */
  async allocate(vendor?: string): Promise<{ items: number; vendors: number }> {
    const p = this.page;
    await p.locator(".rdg-cell").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});

    const before = await this.counters();
    if (!before.items) {
      throw new Error("the awarding screen does not show a line-item selection count, so nothing can be allocated");
    }

    const boxes = p.getByRole("checkbox");
    if (
      !(await boxes
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.LONG })
        .then(() => true)
        .catch(() => false))
    ) {
      throw new Error(
        `the awarding grid rendered no selectable controls (${await p.locator(".rdg-cell").count()} grid cell(s)). ` +
          "Without a bid to allocate there is nothing to award.",
      );
    }

    /** The grid cell a checkbox sits in, which is how the controls identify themselves. */
    const cellOf = (i: number) =>
      boxes.nth(i).evaluate((el) => {
        const c = el.closest(".rdg-cell");
        return c ? (c.textContent ?? "").replace(/\s+/g, " ").trim() : "";
      });

    // The control that awards is the VENDOR'S OWN "Select All" — its cell reads
    // like "AMD LTD Select All", and ticking it moves BOTH counters at once
    // (every line item selected, that vendor awarded). The separate
    // "Select for Awarding" checkbox is a header that changes nothing, and
    // ticking it first disables the one that matters — which is why this step
    // spent several runs reporting that no line item could be selected.
    const candidates: Array<{ i: number; cell: string; score: number }> = [];
    for (let i = 0; i < (await boxes.count()); i++) {
      const cell = await cellOf(i);
      if (/select for awarding/i.test(cell)) continue;
      let score = /select all/i.test(cell) ? 2 : 1;
      if (vendor && cell.toLowerCase().includes(vendor.trim().toLowerCase())) score += 10;
      candidates.push({ i, cell, score });
    }
    candidates.sort((a, b) => b.score - a.score);

    if (!candidates.length) {
      throw new Error(
        'the awarding grid offers no vendor "Select All" control, so nobody can be awarded. That control ' +
          "appears in a vendor's column only when they have a bid on this event.",
      );
    }
    if (vendor && !candidates[0].cell.toLowerCase().includes(vendor.trim().toLowerCase())) {
      console.log(
        `[award] no column matched "${vendor}" — awarding "${candidates[0].cell.slice(0, 40)}" instead (columns: ${candidates
          .map((c) => c.cell.slice(0, 24))
          .join(" | ")})`,
      );
    }

    let state = before;
    for (const c of candidates) {
      const box = boxes.nth(c.i);
      if (await box.isDisabled().catch(() => false)) continue;

      // antd hides the real <input> behind a styled span, so a plain check()
      // fails its actionability test and — with the error swallowed — looked
      // exactly like a control that does nothing. Force the check, then fall
      // back to clicking the label wrapper, and say so when both fail.
      await box.check({ timeout: TIMEOUTS.SHORT, force: true }).catch((e) => {
        console.log(`[award] forcing "${c.cell.slice(0, 30)}" failed: ${String(e).split("\n")[0].slice(0, 90)}`);
      });
      await this.pause(2_000);
      state = await this.counters();
      if ((state.items?.selected ?? 0) === 0 && (state.vendors?.selected ?? 0) === 0) {
        const wrapper = box.locator("xpath=ancestor::label[contains(@class,'ant-checkbox-wrapper')][1]");
        if (await wrapper.count()) {
          await wrapper.click({ timeout: TIMEOUTS.SHORT, force: true }).catch(() => {});
          await this.pause(2_000);
          state = await this.counters();
        }
      }
      if ((state.items?.selected ?? 0) > 0 && (state.vendors?.selected ?? 0) > 0) {
        console.log(`[award] awarded via "${c.cell.slice(0, 40)}"`);
        break;
      }
      // That control did nothing useful; put it back before trying the next.
      await box.uncheck({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await this.pause(800);
    }

    const items = state.items?.selected ?? 0;
    const vendors = state.vendors?.selected ?? 0;
    if (!items || !vendors) {
      throw new Error(
        `the allocation is incomplete: ${items}/${state.items?.total} line item(s) selected and ` +
          `${vendors}/${state.vendors?.total ?? "?"} vendor(s) awarded after trying ` +
          `${candidates.length} control(s) (${candidates.map((c) => c.cell.slice(0, 20)).join(", ")}). ` +
          "Both must be non-zero for Create Proposal to be accepted.",
      );
    }
    console.log(`[award] allocated ${items}/${state.items?.total} line item(s) to ${vendors}/${state.vendors?.total} vendor(s)`);
    return { items, vendors };
  }

  /**
   * Turn the allocation into a proposal and submit it.
   *
   * Submission is separate from creation on purpose in the product: creating
   * leaves a DRAFT proposal, which is why the Master QCS entry control changes
   * afterwards. Both are done here, and a missing submit control is reported
   * rather than treated as success — a draft proposal is not an awarded event.
   */
  async createAndSubmitProposal(): Promise<string> {
    const p = this.page;
    await this.click([p.getByRole("button", { name: /create proposal/i })], {
      label: "create-proposal",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.waitForSpinnerHidden();
    await this.pause(2_500);
    await this.dismissDistractions();

    const err = await this.errorToastText(2_000);
    if (err) throw new Error(`creating the proposal was refused: ${err}`);

    const submit = p.locator("#submitProposal").first();
    const hasSubmit = await submit
      .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
      .then(() => true)
      .catch(() => false);
    if (!hasSubmit) {
      const buttons = (await p.getByRole("button").allTextContents()).map((t) => t.trim()).filter(Boolean);
      throw new Error(
        `the proposal was created but no submit control appeared, so the award is still a draft. ` +
          `Controls on screen: ${buttons.slice(0, 12).join(", ")}`,
      );
    }
    if (await submit.isDisabled().catch(() => false)) {
      throw new Error("the proposal's submit button is disabled — the allocation is incomplete");
    }
    await submit.click({ timeout: TIMEOUTS.MEDIUM });
    await this.waitForSpinnerHidden();

    // Awarding often routes into an approval flow; accept whatever confirmation
    // the build asks for.
    await this.clickIfPresent(
      [p.getByRole("dialog").getByRole("button", { name: /^(submit|confirm|yes|proceed|send)/i })],
      { label: "award-confirm", timeout: TIMEOUTS.SHORT },
    );
    await this.pause(3_000);

    const err2 = await this.errorToastText(2_000);
    if (err2) throw new Error(`submitting the award was refused: ${err2}`);
    const success = (await this.successToastText(3_000)) ?? "";
    console.log(`[award] proposal submitted${success ? ` — ${success}` : ""}`);
    return success || "submitted";
  }
}
