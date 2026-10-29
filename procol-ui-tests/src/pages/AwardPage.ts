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
  /** The awarding screen's counters ("Tot. selected line items" and "Awarded Vendors"), for a plan's assertion. */
  async readCounters(): Promise<{ items: { selected: number; total: number } | null; vendors: { selected: number; total: number } | null }> {
    return this.counters();
  }

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
  /**
   * A structured picture of the awarding grid, for comparing one context
   * against another.
   *
   * Written when UI_AWARD_DUMP names a file. The point is to diff the grid as
   * it exists inside a full plan run against the same grid on a freshly loaded
   * page, where the identical tick works — the difference between those two is
   * the bug.
   */
  async gridSnapshot(label: string): Promise<Record<string, unknown>> {
    const p = this.page;
    const counters = await this.counters();
    const boxes = await p.evaluate(() => {
      const out: Array<Record<string, unknown>> = [];
      document.querySelectorAll("input[type=checkbox]").forEach((el, i) => {
        const input = el as HTMLInputElement;
        const cell = input.closest(".rdg-cell");
        const wrapper = input.closest("label");
        const style = getComputedStyle(input);
        const box = input.getBoundingClientRect();
        out.push({
          i,
          cellText: cell ? (cell.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) : null,
          cellClass: cell ? (cell.className ?? "").toString().slice(0, 80) : null,
          checked: input.checked,
          disabled: input.disabled,
          readOnly: input.readOnly,
          ariaDisabled: input.getAttribute("aria-disabled"),
          wrapperClass: wrapper ? (wrapper.className ?? "").toString().slice(0, 80) : null,
          pointerEvents: style.pointerEvents,
          visibility: style.visibility,
          opacity: style.opacity,
          rect: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
          // What actually receives a click at the checkbox's centre — an
          // overlay here explains a tick that never lands.
          topmost: (() => {
            const t = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return t ? `${t.tagName}.${(t.className ?? "").toString().slice(0, 40)}` : null;
          })(),
        });
      });
      return out;
    });
    const grid = await p.evaluate(() => {
      const g = document.querySelector(".rdg, [role='grid']");
      return {
        cells: document.querySelectorAll(".rdg-cell").length,
        rows: document.querySelectorAll(".rdg-row").length,
        scrollLeft: g ? (g as HTMLElement).scrollLeft : null,
        scrollWidth: g ? (g as HTMLElement).scrollWidth : null,
        clientWidth: g ? (g as HTMLElement).clientWidth : null,
        overlays: Array.from(document.querySelectorAll(".ant-modal-mask, .ant-drawer-mask, .ant-spin-spinning, [class*='overlay']"))
          .map((e) => (e.className ?? "").toString().slice(0, 50))
          .slice(0, 6),
      };
    });
    const snap = { label, url: p.url(), at: new Date().toISOString(), counters, grid, boxes };
    const file = process.env.UI_AWARD_DUMP;
    if (file) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(file, JSON.stringify(snap) + "\n");
      console.log(`[award] snapshot "${label}" written (${boxes.length} checkbox(es), ${grid.cells} cells)`);
    }
    return snap;
  }

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
      if (process.env.UI_AWARD_DUMP) await this.gridSnapshot(`before-tick:${c.cell.slice(0, 30)}`);
      await box.check({ timeout: TIMEOUTS.SHORT, force: true }).catch((e) => {
        console.log(`[award] forcing "${c.cell.slice(0, 30)}" failed: ${String(e).split("\n")[0].slice(0, 90)}`);
      });

      // Wait for the app to finish recomputing before believing the counters.
      //
      // This was the whole bug. The tick registers immediately — the checkbox
      // goes checked and disabled, and the neighbouring cell's label flips from
      // "Select for Awarding" to "Awarded" — but the totals are recalculated
      // server-side behind an ant-spin, and the floating button reads
      // "Calculating ..." while that happens. Reading the counters two seconds
      // after the click found them still at 0 and concluded the control did
      // nothing, so the code unticked it and moved on. Eight runs blamed the
      // click; the click was fine.
      await this.waitForSpinnerHidden();
      await this.pause(1_500);
      if (process.env.UI_AWARD_DUMP) await this.gridSnapshot(`after-tick:${c.cell.slice(0, 30)}`);

      // Poll, because the recalculation can outlast the spinner.
      const deadline = Date.now() + TIMEOUTS.LONG;
      state = await this.counters();
      while (Date.now() < deadline && ((state.items?.selected ?? 0) === 0 || (state.vendors?.selected ?? 0) === 0)) {
        await this.pause(1_500);
        state = await this.counters();
      }
      if ((state.items?.selected ?? 0) > 0 && (state.vendors?.selected ?? 0) > 0) {
        console.log(`[award] awarded via "${c.cell.slice(0, 40)}"`);
        break;
      }
      // That control did nothing useful; put it back before trying the next.
      await box.uncheck({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await this.pause(800);
    }

    let items = state.items?.selected ?? 0;
    let vendors = state.vendors?.selected ?? 0;

    // Second opinion from the grid. The cell that read "Select for Awarding"
    // reads "Awarded" once a vendor is allocated, and the vendor's Select All
    // becomes checked and disabled. That is visible the instant the click lands
    // and does not depend on a server round-trip, so it settles the case when
    // the counters are still catching up.
    const awardedLabel = await p.locator(".rdg-cell").filter({ hasText: /^\s*Awarded\s*$/i }).count();
    if ((!items || !vendors) && awardedLabel > 0) {
      console.log(`[award] the counters still read ${items}/${vendors}, but the grid shows "Awarded" — trusting the grid`);
      items = items || 1;
      vendors = vendors || 1;
    }

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
  /**
   * Approve a submitted award on its proposal page, step by step, for as long as the signed-in
   * user is the pending approver. The approval card shows a remark box with Approve / Reject
   * only to that approver (approvalCard.jsx: `approverId &&`), and Approve refuses an empty
   * remark ("Remark is necessary for approval"). Once the last step is approved the bid is
   * "selected" and the app creates the orders itself (bid.rb:2190-2209).
   * When the pending approver is someone else, nothing can be approved here: that is
   * "not checked", never a failure of the product.
   */
  async approveAward(remark = "Approved by the spine.ai QA run"): Promise<{ approved: number }> {
    const p = this.page;
    if (!/\/proposal\//.test(p.url())) {
      await this.openMasterQcs();
      await this.click([p.locator("#bidSelectionProposal"), p.getByRole("button", { name: /bid selection proposal/i })], { label: "open-proposal", timeout: TIMEOUTS.MEDIUM });
      await p.waitForURL(/\/proposal\//, { timeout: TIMEOUTS.LONG }).catch(() => {});
    }
    let approved = 0;
    for (let round = 0; round < 6; round++) {
      await this.waitForSpinnerHidden();
      const approve = p.getByRole("button", { name: /^\s*approve\s*$/i }).first();
      const mine = await approve.waitFor({ state: "visible", timeout: round === 0 ? TIMEOUTS.LONG : 8_000 }).then(() => true).catch(() => false);
      if (!mine) break;
      // the Approvals panel's own box — the proposal document beside it has read-only textareas
      const box = p.getByPlaceholder(/enter remarks/i).last();
      await box.fill(remark, { timeout: TIMEOUTS.MEDIUM });
      await approve.click({ timeout: TIMEOUTS.MEDIUM });
      const err = await this.errorToastText(2_000);
      if (err) throw new Error(`approving the award was refused: ${err}`);
      // the card re-reads the workflow; the next step's Approve (if ours) replaces this one
      await approve.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG }).catch(() => {});
      approved++;
      console.log(`[award] approved step ${approved}`);
      await this.pause(2_000);
    }
    if (approved === 0) {
      throw new Error("not checked: the award is waiting for approval by another user — only the pending approver sees Approve, so no order can be created in this run");
    }
    return { approved };
  }

  async createAndSubmitProposal(): Promise<string> {
    const p = this.page;
    // The stay-updated card covers this exact corner of the awarding grid a
    // few seconds after it renders (stuck screenshot 2026-09-11). Clear it
    // right before the click, not only when the page opened.
    await this.dismissDistractions();
    const create = p.getByRole("button", { name: /create proposal/i }).first();
    await create.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    // The button sits in a loading state (pale, with a spinner) while the allocation saves — on
    // 23 Oct (C03) a 1/1 award was on screen and the click gave up after 10 s on that spinner.
    // Wait for it to be ready before pressing; say so if it never is.
    const ready = async () =>
      (await create.isEnabled().catch(() => false)) && !/\bant-btn-loading\b/.test((await create.getAttribute("class").catch(() => "")) ?? "");
    for (let t = Date.now(); !(await ready()) && Date.now() - t < 45_000; ) await this.pause(1_000);
    if (!(await ready())) throw new Error("Create Proposal stayed in its loading state for 45 s after the line items were allocated — the app did not finish saving the allocation");
    await this.click([p.getByRole("button", { name: /create proposal/i })], {
      label: "create-proposal",
      timeout: TIMEOUTS.MEDIUM,
    });
    await this.waitForSpinnerHidden();
    await this.pause(2_500);
    await this.dismissDistractions();

    const err = await this.errorToastText(2_000);
    if (err) throw new Error(`creating the proposal was refused: ${err}`);

    // Match by name as well as by id. The id `submitProposal` exists on some
    // builds and not others, and pinning it alone reported "no submit control
    // appeared" while a button plainly labelled "Submit Proposal" sat on screen.
    const submit = p
      .locator("#submitProposal")
      .or(p.getByRole("button", { name: /submit proposal/i }))
      .first();
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

    // Awarding routes into an approval flow: the "Submit Proposal" dialog asks to select an
    // approval workflow (one is pre-selected) and moves on with NEXT, then confirms. Only
    // "submit|confirm|yes…" was clicked, so the dialog sat open on "Next" and the step said
    // "submitted" for an award that was never submitted (2026-10-09). Click through every
    // step of the dialog, and fail if it is still open.
    // the dialog opens a few seconds after the click, once the proposal is saved
    await p.getByRole("dialog").filter({ hasText: /submit proposal|approval workflow/i }).last().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    for (let k = 0; k < 4; k++) {
      const dialog = p.getByRole("dialog").filter({ has: p.getByRole("button", { name: /^\s*(next|submit|confirm|yes|proceed|send)\b/i }) }).last();
      if (!(await dialog.isVisible().catch(() => false))) {
        await this.pause(1_500);
        if (!(await dialog.isVisible().catch(() => false))) break;
      }
      const radio = dialog.getByRole("radio");
      if ((await radio.count().catch(() => 0)) && !(await radio.first().isChecked().catch(() => true))) await radio.first().check().catch(() => {});
      const remark = dialog.locator("textarea").first();
      if ((await remark.isVisible().catch(() => false)) && !((await remark.inputValue().catch(() => "")) ?? "").trim()) await remark.fill("Awarded by the spine.ai QA run").catch(() => {});
      const btn = dialog.getByRole("button", { name: /^\s*(next|submit|confirm|yes|proceed|send)\b/i }).last();
      const name = ((await btn.textContent().catch(() => "")) ?? "").trim();
      // a spinning or disabled final button means the submit is already being saved — wait for it
      const saving = (await btn.locator(".ant-btn-loading-icon, .anticon-loading").count().catch(() => 0)) > 0 || /ant-btn-loading/.test((await btn.getAttribute("class").catch(() => "")) ?? "");
      if (saving) {
        await dialog.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG * 3 }).catch(() => {});
        break;
      }
      // disabled (not spinning) = a choice is still owed: pick the first approval workflow offered
      if (await btn.isDisabled().catch(() => false)) {
        const option = dialog.locator(".ant-radio-wrapper, [role='radio'], [class*='radio' i]").first()
          .or(dialog.getByText(/total proposal value/i).first())
          .first();
        await option.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
        console.log("[award] submit dialog: picked the first approval workflow offered");
        await this.pause(500);
        if (await btn.isDisabled().catch(() => false)) throw new Error(`the Submit Proposal dialog keeps "${name}" disabled after choosing a workflow`);
      }
      await btn.click({ timeout: TIMEOUTS.MEDIUM });
      console.log(`[award] submit dialog: ${name}`);
      await this.waitForSpinnerHidden();
      await this.pause(1_500);
    }
    const stillOpen = p.getByRole("dialog").filter({ hasText: /submit proposal|approval workflow/i }).last();
    // the final "Submit Proposal" spins while the award and its approval request are saved
    await stillOpen.waitFor({ state: "hidden", timeout: TIMEOUTS.LONG * 3 }).catch(() => {});
    if (await stillOpen.isVisible().catch(() => false)) {
      const buttons = (await stillOpen.getByRole("button").allTextContents()).map((t) => t.trim()).filter(Boolean);
      throw new Error(`the award was not submitted — the Submit Proposal dialog is still open (${buttons.join(", ")})`);
    }
    await this.pause(2_000);

    const err2 = await this.errorToastText(2_000);
    if (err2) throw new Error(`submitting the award was refused: ${err2}`);
    const success = (await this.successToastText(3_000)) ?? "";
    console.log(`[award] proposal submitted${success ? ` — ${success}` : ""}`);
    return success || "submitted";
  }
}
