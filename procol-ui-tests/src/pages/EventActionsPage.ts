import { Locator, Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../config.js";
import { toastMark, waitForMessage } from "../plan/generic/messages.js";
import { SurrogateBidPage } from "./SurrogateBidPage.js";

/**
 * PROCOL'S EVENT MENUS, AND WHAT THEY OPEN (Aanya, 27 Oct: "if user asks to withdraw the event at any
 * phase of time, then ui must go here … if anything from these options is asked by user remember to open
 * this and perform the activity"). Seen on RFX-19215 / RFX-19216, 27 Oct 2026:
 *
 *  - the PROJECT's ⋮ (an icon right after the "Messages" button, on every tab of the project page):
 *      Send Reminders (a "Send Reminders" drawer: pending offer submissions, each with View / Notify),
 *      Withdraw Project ("Are you sure you want to withdraw this project?" — it cancels every stage,
 *      removes pending approvals and returns PR quantities to the PR; "Withdrawal Remarks *" textarea
 *      "Enter remarks"; "Cancel" / "Yes, Withdraw Project", the latter disabled until remarks are typed);
 *  - the STAGE's Settings ▾ (data-testid event-settings-button, only on a stage tab — RFQ, Technical,
 *    Auction — beside "Live" and the countdown): Recreate Order (greyed on a live RFQ), Shared With,
 *      Extend Submission Time ("Increase Event Time": 15 minutes · 30 minutes · an hour · Custom · Fixed
 *      time → Ok), Withdraw ("Withdrawing Order… Are you sure you want to withdraw this event?" — "Please
 *      enter reason for withdrawing this event" input "Enter reason" → Cancel / Yes), Convert to Auction
 *      (a popover: Initial bid — Use RFQ quotes → Continue), Rejected Bids, Order Activity (an "Activity"
 *      drawer), Edit Evaluation Time ("Edit evaluation duration" / "Edit evaluation ending time" → Ok),
 *      Send Bulk Counter Offer (greyed until there are bids), and Reschedule Event / End <status> where
 *      they apply;
 *  - each Participants row: "+ Add Bid" (a surrogate bid) and "+ Add Price Cap" ("Add Price Cap for
 *    <vendor>": a sheet with a "Price cap" cell per product, "The price cap will be applied on Net
 *    Price!", Cancel / OK).
 */
export const PROJECT_MENU_ITEMS = ["Send Reminders", "Withdraw Project"];
export const STAGE_MENU_ITEMS = [
  "Recreate Order",
  "Shared With",
  "Extend Submission Time",
  "Withdraw",
  "Convert to Auction",
  "Rejected Bids",
  "Order Activity",
  "Edit Evaluation Time",
  "Send Bulk Counter Offer",
  "Reschedule Event",
];

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const reEscape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface MenuItem {
  text: string;
  disabled: boolean;
}

export class EventActionsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private dropdown(): Locator {
    return this.page.locator(".ant-dropdown:not(.ant-dropdown-hidden)").last();
  }

  private async ready(): Promise<void> {
    await this.waitForSpinnerHidden().catch(() => {});
    await this.page
      .locator(".ant-tabs-tab, [role='tab'], [data-testid='event-settings-button']")
      .first()
      .waitFor({ state: "visible", timeout: 45_000 })
      .catch(() => {});
    await this.dismissDistractions();
  }

  private async readMenu(menu: Locator): Promise<MenuItem[]> {
    const items = menu.locator(".ant-dropdown-menu-item, [role='menuitem']");
    await items.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    // One item can be matched twice (the li and a menuitem inside it), and only one of them carries the
    // disabled mark: "Recreate Order" read as enabled on 27 Oct (MN05) while the screen showed it grey.
    // Copies are merged by their words, and an item is greyed out when any copy, parent or child says so.
    // No named helper inside the page function: a bundler's __name() wrapper does not exist in the page.
    const raw = await items.evaluateAll((els) =>
      els.map((e) => ({
        text: (e.textContent || "").replace(/\s+/g, " ").trim(),
        disabled:
          e.matches(".ant-dropdown-menu-item-disabled, [aria-disabled='true']") ||
          !!e.closest(".ant-dropdown-menu-item-disabled, [aria-disabled='true']") ||
          !!e.querySelector(".ant-dropdown-menu-item-disabled, [aria-disabled='true']"),
      })),
    );
    const merged = new Map<string, MenuItem>();
    for (const r of raw) {
      if (!r.text) continue;
      const had = merged.get(r.text);
      merged.set(r.text, { text: r.text, disabled: (had?.disabled ?? false) || r.disabled });
    }
    return [...merged.values()];
  }

  /** The project's ⋮ menu, open. Throws when this is not a published event's page. */
  async openProjectMenu(): Promise<{ menu: Locator; items: MenuItem[] }> {
    await this.ready();
    const msgs = this.page.getByRole("button", { name: /^\s*messages\s*$/i }).filter({ visible: true }).first();
    if (!(await msgs.count())) throw new Error("no “Messages” button on this page, so the project's ⋮ menu (right beside it) is not here — open a published event's page first");
    const more = msgs.locator("xpath=following::*[contains(@class,'anticon') or local-name()='svg'][1]");
    await more.click({ timeout: TIMEOUTS.SHORT });
    const menu = this.dropdown();
    return { menu, items: await this.readMenu(menu) };
  }

  private settingsButton(): Locator {
    const p = this.page;
    return p.getByTestId("event-settings-button").or(p.getByRole("button", { name: /settings/i })).filter({ visible: true }).first();
  }

  /**
   * Onto a stage's tab — the named stage ("rfq", "rfp"/"technical", "auction"), else the first — and answer its
   * label. A stage tab is the one whose page carries the stage's Settings button.
   */
  async gotoStage(stage?: string): Promise<string> {
    await this.ready();
    const p = this.page;
    const stageRe = stage ? new RegExp(`^\\s*${reEscape(/^(rfp|technical)$/i.test(stage) ? "technical" : stage)}`, "i") : null;
    const selected = () => p.getByRole("tab", { selected: true }).allTextContents().then((t) => t.map((x) => x.trim())).catch(() => [] as string[]);
    const onIt = async () => (await this.settingsButton().count()) > 0 && (!stageRe || (await selected()).some((t) => stageRe.test(t)));
    if (await onIt()) return (await selected()).find((t) => !stageRe || stageRe.test(t)) ?? "";
    // After a reload the tabs arrive a moment after the page (27 Oct, VB08: "no rfq stage tab" on an RFQ).
    await p.getByRole("tab").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
    await this.dismissDistractions();
    const tabs = p.getByRole("tab");
    const n = await tabs.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const label = ((await tabs.nth(i).textContent().catch(() => "")) ?? "").trim();
      if (/^(project\s+)?(details|overview|approvals|documents|activity|master\s+qcs)$/i.test(label)) continue;
      if (/^(responses|participants|analytics|price trends|participant remarks|compare|evaluation)/i.test(label)) continue;
      if (stageRe && !stageRe.test(label)) continue;
      await tabs.nth(i).click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      await p.getByTestId("event-settings-button").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
      await this.dismissDistractions();
      if (await this.settingsButton().count()) return label;
    }
    throw new Error(`no ${stage ? `${stage} ` : ""}stage tab on this event — a published stage's tab (RFQ, Technical Stage, Auction) carries its Settings button`);
  }

  /** The stage's Settings menu, open — on the named stage's tab, else the first stage tab. */
  async openStageMenu(stage?: string): Promise<{ menu: Locator; items: MenuItem[]; tab: string }> {
    const tab = await this.gotoStage(stage).catch((e: Error) => {
      throw new Error(`no stage Settings menu on this event${stage ? ` for the ${stage} stage` : ""} — it shows on a published stage's tab (RFQ, Technical, Auction) (${e.message})`);
    });
    await this.settingsButton().click({ timeout: TIMEOUTS.SHORT });
    const menu = this.dropdown();
    return { menu, items: await this.readMenu(menu), tab };
  }

  /**
   * The buyer's view of who responded on a stage: its Responses sub-tab holds one column per vendor — the name
   * (a level-2 heading), when, and a “Surrogate Bid” tag when the buyer entered it — and “Participation : x / y”
   * (27 Oct, read on RFX-19308 and RFX-19324: the same layout on an RFQ and a technical stage). Reloads first: a
   * vendor's response comes from another browser, and the open page does not refresh by itself.
   */
  async readResponses(stage?: string): Promise<{ tab: string; columns: Array<{ vendor: string; when: string; surrogate: boolean | null }>; participation: { done: number; of: number } | null; empty: string }> {
    const p = this.page;
    if (/\/project\//.test(p.url())) await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    const tab = await this.gotoStage(stage);
    const sub = p.getByRole("tab", { name: /^\s*responses\s*$/i }).filter({ visible: true }).first();
    if (await sub.count()) {
      if ((await sub.getAttribute("aria-selected").catch(() => null)) !== "true") await sub.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    } else {
      throw new Error(`the ${tab} stage has no Responses tab`);
    }
    const heads = p.getByRole("columnheader").filter({ has: p.getByRole("heading", { level: 2 }) });
    const emptyWords = p.getByText(/no (responses?|bids?|quotes?|data)( (yet|received|found))?/i).filter({ visible: true }).first();
    for (const until = Date.now() + 20_000; Date.now() < until; ) {
      if ((await heads.count().catch(() => 0)) || (await emptyWords.isVisible().catch(() => false))) break;
      await p.waitForTimeout(500);
    }
    await this.dismissDistractions();
    // The cells under the headers load after them (grey bars on a live event, 27 Oct RFX-19361).
    const loading = p.locator("[role='grid'] .ant-skeleton, [role='grid'] .ant-skeleton-input, [role='grid'] [class*='skeleton']").filter({ visible: true }).first();
    for (const until = Date.now() + 10_000; Date.now() < until && (await loading.isVisible().catch(() => false)); ) await p.waitForTimeout(400);
    const columns: Array<{ vendor: string; when: string; surrogate: boolean | null }> = [];
    for (let i = 0; i < Math.min(await heads.count().catch(() => 0), 40); i++) {
      const h = heads.nth(i);
      const vendor = ((await h.getByRole("heading", { level: 2 }).first().textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      const text = ((await h.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      // A closed stage tags a surrogate column "Surrogate Bid"; a live one shows no tag (null: the caller asks
      // Procol's records).
      const surrogate = (await h.getByText(/^\s*surrogate bid\s*$/i).count().catch(() => 0)) > 0 ? true : null;
      const when = text.replace(vendor, "").replace(/surrogate bid|counter offer/gi, "").trim();
      if (vendor && !columns.some((c) => c.vendor === vendor)) columns.push({ vendor, when, surrogate });
    }
    // A page that tags surrogate columns (a closed stage) leaves the vendor-portal ones untagged.
    if (columns.some((c) => c.surrogate === true)) for (const c of columns) if (c.surrogate === null) c.surrogate = false;
    // Its accessible name keeps the spaces ("1 / 2 50%"); its text runs the badge on ("1 / 250%"). It reads
    // "0 / 0" until its own count arrives (27 Oct, VB08: 0/0 beside two vendor columns), so read it again then.
    const partButton = p.getByRole("button", { name: /^\s*\d+\s*\/\s*\d+/ }).filter({ visible: true }).first();
    let m: RegExpMatchArray | null = null;
    for (const until = Date.now() + 12_000; ; ) {
      m = ((await partButton.ariaSnapshot().catch(() => "")) ?? "").match(/(\d+)\s*\/\s*(\d+)(?!\d)/);
      if (!columns.length || (m && Number(m[2]) > 0) || Date.now() > until) break;
      await p.waitForTimeout(600);
    }
    const empty = columns.length ? "" : ((await emptyWords.textContent().catch(() => "")) ?? "").trim();
    return { tab, columns, participation: m ? { done: Number(m[1]), of: Number(m[2]) } : null, empty };
  }

  /** Which menu holds an item: the project's ⋮ for Withdraw Project / Send Reminders, the stage's Settings otherwise. */
  static menuFor(item: string): "project" | "stage" {
    return PROJECT_MENU_ITEMS.some((x) => norm(x) === norm(item)) || /withdraw (the )?project|send reminders?/i.test(item) ? "project" : "stage";
  }

  /** The items a menu offers now, each with its greyed-out state; the menu is closed again. */
  async listMenu(which: "project" | "stage", stage?: string): Promise<MenuItem[]> {
    const { items } = which === "project" ? await this.openProjectMenu() : await this.openStageMenu(stage);
    await this.page.keyboard.press("Escape").catch(() => {});
    return items;
  }

  /** Open the menu that holds `item` and choose it. Returns the menu and the title of what opened. */
  async choose(item: string, stage?: string): Promise<{ menu: "project" | "stage"; item: string; opened: string }> {
    const which = EventActionsPage.menuFor(item);
    const { menu, items } = which === "project" ? await this.openProjectMenu() : await this.openStageMenu(stage);
    const want = items.find((i) => norm(i.text) === norm(item)) ?? items.find((i) => norm(i.text).startsWith(norm(item))) ?? items.find((i) => norm(i.text).includes(norm(item)));
    const where = which === "project" ? "the project's ⋮ menu" : "the stage's Settings menu";
    if (!want) {
      await this.page.keyboard.press("Escape").catch(() => {});
      throw new Error(`${where} has no “${item}” — it offers: ${items.map((i) => i.text + (i.disabled ? " (greyed out)" : "")).join(", ") || "nothing"}`);
    }
    if (want.disabled) {
      await this.page.keyboard.press("Escape").catch(() => {});
      throw new Error(`“${want.text}” is greyed out in ${where} — Procol does not offer it on this event now`);
    }
    await menu
      .locator(".ant-dropdown-menu-item, [role='menuitem']")
      .filter({ hasText: new RegExp(`^\\s*${reEscape(want.text)}\\s*$`, "i") })
      .first()
      .click({ timeout: TIMEOUTS.SHORT });
    await this.page.waitForTimeout(900);
    const opened = (
      (await this.page
        .locator(".ant-modal-title, .ant-drawer-title, .pro-drawer-title, .ant-popover-title, [role='dialog'] h1, [role='dialog'] h2, [role='dialog'] h3")
        .filter({ visible: true })
        .last()
        .innerText()
        .catch(() => "")) || ""
    )
      .replace(/\s+/g, " ")
      .trim();
    console.log(`[event-menu] ${where} → “${want.text}”${opened ? ` opened “${opened}”` : ""}`);
    return { menu: which, item: want.text, opened };
  }

  /** The visible dialog (modal) or drawer. */
  private overlay(): Locator {
    return this.page.locator(".ant-modal-content, .ant-drawer-content, .pro-drawer-content, .ant-popover-inner").filter({ visible: true }).last();
  }

  async closeOverlay(): Promise<void> {
    const o = this.overlay();
    const cancel = o.getByRole("button", { name: /^\s*(cancel|close)\s*$/i }).first();
    if (await cancel.count()) await cancel.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    else {
      const x = this.page.locator(".ant-modal-close, .ant-drawer-close, .pro-drawer-close").filter({ visible: true }).last();
      if (await x.count()) await x.click().catch(() => {});
      else await this.page.keyboard.press("Escape").catch(() => {});
    }
    await this.page.waitForTimeout(500);
  }

  /**
   * Withdraw — the whole project (⋮ → Withdraw Project) or one stage (Settings → Withdraw). With a reason
   * the confirmation is pressed and the app's answer returned. Without one (`reason` null) nothing is
   * withdrawn: the result says how Procol refused it ("blocked: …"), for cases about the required reason.
   */
  async withdraw(scope: "project" | "stage", reason: string | null, stage?: string): Promise<string> {
    const item = scope === "project" ? "Withdraw Project" : "Withdraw";
    await this.choose(item, stage);
    const dlg = this.page.locator(".ant-modal-content").filter({ visible: true }).last();
    await dlg.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    const title = ((await dlg.innerText().catch(() => "")) || "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    const box = (scope === "project" ? dlg.getByPlaceholder(/enter remarks/i) : dlg.getByPlaceholder(/enter reason/i)).or(dlg.locator("textarea, input[type='text']")).first();
    const yes = scope === "project" ? dlg.getByRole("button", { name: /yes,?\s*withdraw/i }) : dlg.getByRole("button", { name: /^\s*yes\s*$/i });
    if (!(await yes.count())) throw new Error(`the withdraw dialog (“${title}”) has no confirm button`);
    const mark = await toastMark(this.page);
    if (reason === null) {
      // The reason is required: Procol either keeps the confirm button disabled or refuses the press.
      if (await yes.isDisabled().catch(() => false)) {
        await this.closeOverlay();
        return `blocked: “${(await yes.innerText().catch(() => "Yes")).trim()}” stays disabled until a ${scope === "project" ? "withdrawal remark" : "reason"} is entered — nothing was withdrawn`;
      }
      await yes.click({ timeout: TIMEOUTS.SHORT });
      const said = await waitForMessage(this.page, "error", { mark, timeoutMs: 6_000 });
      const stillOpen = await dlg.isVisible().catch(() => false);
      if (said.matched || stillOpen) {
        if (stillOpen) await this.closeOverlay();
        return `blocked: ${said.matched ? said.matched.text : "the dialog stayed open"} — nothing was withdrawn without a ${scope === "project" ? "remark" : "reason"}`;
      }
      throw new Error(`Procol withdrew the ${scope} without a ${scope === "project" ? "remark" : "reason"} — the dialog closed with no refusal`);
    }
    await box.fill(reason, { timeout: TIMEOUTS.SHORT });
    await this.page.waitForTimeout(300);
    if (await yes.isDisabled().catch(() => false)) throw new Error(`“${(await yes.innerText()).trim()}” stayed disabled after typing the ${scope === "project" ? "remark" : "reason"}`);
    await yes.click({ timeout: TIMEOUTS.SHORT });
    const ok = await waitForMessage(this.page, "success", { mark, timeoutMs: 15_000 });
    const err = ok.matched ? null : await waitForMessage(this.page, "error", { mark, timeoutMs: 2_000 });
    if (err?.matched) throw new Error(`Procol refused the withdrawal: ${err.matched.text}`);
    await dlg.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
    await this.waitForSpinnerHidden().catch(() => {});
    return `withdrew the ${scope === "project" ? "project" : `${stage ?? "current"} stage`} (“${reason}”)${ok.matched ? ` — Procol said “${ok.matched.text}”` : ""}`;
  }

  /** The words on the event's page that say it is withdrawn (a status chip, a banner), or "". */
  async withdrawnSign(): Promise<string> {
    await this.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await this.ready();
    const sign = this.page.getByText(/\bwithdrawn\b/i).filter({ visible: true }).first();
    return (await sign.count()) ? (((await sign.innerText().catch(() => "")) || "withdrawn").replace(/\s+/g, " ").trim().slice(0, 80)) : "";
  }

  /** Settings → Extend Submission Time → an option (“15 minutes”, “30 minutes”, “an hour”) → Ok. Returns before → after. */
  async extendSubmissionTime(option = "15 minutes", stage?: string): Promise<string> {
    await this.choose("Extend Submission Time", stage);
    const dlg = this.page.locator(".ant-modal-content").filter({ visible: true }).last();
    const before = ((await dlg.getByText(/will end at/i).first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    const radio = dlg.getByRole("radio", { name: new RegExp(`^\\s*${reEscape(option)}\\s*$`, "i") }).or(dlg.getByText(new RegExp(`^\\s*${reEscape(option)}\\s*$`, "i"))).first();
    if (!(await radio.count())) throw new Error(`“Increase Event Time” offers no “${option}” (it offers 15 minutes · 30 minutes · an hour · Custom · Fixed time)`);
    await radio.click({ timeout: TIMEOUTS.SHORT });
    const mark = await toastMark(this.page);
    await dlg.getByRole("button", { name: /^\s*ok\s*$/i }).click({ timeout: TIMEOUTS.SHORT });
    const ok = await waitForMessage(this.page, "success", { mark, timeoutMs: 12_000 });
    const err = ok.matched ? null : await waitForMessage(this.page, "error", { mark, timeoutMs: 2_000 });
    if (err?.matched) throw new Error(`Procol refused to extend the time: ${err.matched.text}`);
    return `extended by ${option} (${before || "the old end time not shown"})${ok.matched ? ` — Procol said “${ok.matched.text}”` : ""}`;
  }

  /**
   * Participants → a vendor's “Add Price Cap” → a price cap on every product → OK. With no vendor named, the
   * first ticked participant that offers it. Returns the vendor and what Procol said.
   */
  async addPriceCap(vendor: string | undefined, price: number | null): Promise<string> {
    const p = this.page;
    await this.ready();
    // Participants lives under the STAGE tab (RFQ / Auction), not on Project Details where publishing lands
    // (27 Oct, first live run): the surrogate-bid page already knows the way there.
    if (!(await new SurrogateBidPage(p).openParticipants())) throw new Error("the Participants list could not be opened on this event — Add Price Cap lives on a published RFQ's or auction's participant rows");
    const capButtons = () => p.getByText(/^\s*\+?\s*add price cap\s*$/i).filter({ visible: true });
    await capButtons().first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
    if (vendor) {
      const search = p.getByPlaceholder(/search vendors?/i).first();
      if (await search.count()) {
        await search.fill(vendor).catch(() => {});
        await this.pause(2_500);
      }
    }
    if (!(await capButtons().count())) throw new Error(`no “Add Price Cap” on the Participants list${vendor ? ` for “${vendor}”` : ""} — it shows on a published RFQ's or auction's participant rows`);
    await capButtons().first().click({ timeout: TIMEOUTS.SHORT });
    const dlg = p.locator(".ant-modal-content").filter({ visible: true }).filter({ hasText: /price cap/i }).last();
    await dlg.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    const title = ((await dlg.locator(".ant-modal-title").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    const forWho = title.replace(/^add price cap for\s*/i, "").trim() || vendor || "the vendor";
    await this.dismissDistractions();
    let cells = await this.capCells(dlg);
    if (!(await cells.count())) cells = dlg.locator("td, [role='gridcell']").filter({ hasNotText: /\S/ });
    let filled = 0;
    if (price !== null) {
      for (let i = 0; i < (await cells.count()); i++) {
        const cell = cells.nth(i);
        if ((await cell.getAttribute("aria-disabled")) === "true") continue;
        await cell.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
        await cell.click({ timeout: 5_000 }).catch(() => {});
        let input = cell.locator("input, textarea").first();
        if (!(await input.count())) {
          await cell.dblclick({ timeout: 5_000 }).catch(() => {});
          input = cell.locator("input, textarea").first();
        }
        if (!(await input.count())) {
          await p.keyboard.type(String(price)).catch(() => {});
          await p.keyboard.press("Enter").catch(() => {});
        } else {
          await input.fill(String(price)).catch(() => {});
          await p.keyboard.press("Tab").catch(() => {});
        }
        filled++;
      }
      if (!filled) throw new Error(`the “${title}” sheet has no Price cap cell the run could type into`);
    }
    const mark = await toastMark(p);
    const ok = dlg.getByRole("button", { name: /^\s*ok\s*$/i }).first();
    if (await ok.isDisabled().catch(() => false)) {
      await this.closeOverlay();
      if (price === null) return `blocked: OK stays disabled with no price cap entered for ${forWho}`;
      throw new Error(`OK stayed disabled after entering a price cap of ${price} for ${forWho}`);
    }
    await ok.click({ timeout: TIMEOUTS.SHORT });
    const saved = await waitForMessage(p, "success", { mark, timeoutMs: 10_000 });
    const err = saved.matched ? null : await waitForMessage(p, "error", { mark, timeoutMs: 3_000 });
    const stillOpen = await dlg.isVisible().catch(() => false);
    if (err?.matched || (stillOpen && !saved.matched)) {
      if (stillOpen) await this.closeOverlay();
      const why = err?.matched?.text ?? "the dialog stayed open";
      if (price === null || (price !== null && price <= 0)) return `blocked: ${why} — no price cap saved for ${forWho}`;
      throw new Error(`Procol did not save the price cap of ${price} for ${forWho}: ${why}`);
    }
    if (price === null || price <= 0) throw new Error(`Procol saved a price cap of ${price ?? "nothing"} for ${forWho} — it took the value with no refusal`);
    return `price cap ${price} set for ${forWho} on ${filled} product(s)${saved.matched ? ` — Procol said “${saved.matched.text}”` : ""}`;
  }

  /** The sheet's "Price cap" column: its header's key names the cells (sheet-cell-<row>-<key>). */
  private async capCells(dlg: Locator): Promise<Locator> {
    const headerKey = await dlg
      .locator("[data-testid^='sheet-header-']")
      .evaluateAll((els) => {
        const h = els.find((e) => /price\s*cap/i.test(e.textContent || ""));
        return h ? (h.getAttribute("data-testid") || "").replace("sheet-header-", "") : "";
      })
      .catch(() => "");
    return headerKey ? dlg.locator(`[data-testid^='sheet-cell-'][data-testid$='-${headerKey}']`) : dlg.locator("[data-celltype='price']:not([data-testid^='sheet-header'])");
  }

  /**
   * Read a vendor's saved price cap back. Once a cap is saved the row's “+ Add Price Cap” reads “Edit Price
   * Cap” (27 Oct, PC01: the screen AI went round in circles there); it reopens the same sheet. The cells are
   * read and the dialog is closed WITHOUT pressing OK. Answers the cap per product as shown.
   */
  async readPriceCap(vendor: string | undefined): Promise<{ forWho: string; caps: string[] }> {
    const p = this.page;
    await this.ready();
    if (!(await new SurrogateBidPage(p).openParticipants())) throw new Error("the Participants list could not be opened on this event");
    const editButtons = () => p.getByText(/^\s*\+?\s*(edit|view) price cap\s*$/i).filter({ visible: true });
    await editButtons().first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
    if (vendor) {
      const search = p.getByPlaceholder(/search vendors?/i).first();
      if (await search.count()) {
        await search.fill(vendor).catch(() => {});
        await this.pause(2_500);
      }
    }
    if (!(await editButtons().count())) {
      const adds = await p.getByText(/^\s*\+?\s*add price cap\s*$/i).filter({ visible: true }).count();
      throw new Error(`no saved price cap on the Participants list${vendor ? ` for “${vendor}”` : ""} — ${adds ? `the row still offers “Add Price Cap”, so none was saved` : "no row offers Edit Price Cap"}`);
    }
    await editButtons().first().click({ timeout: TIMEOUTS.SHORT });
    const dlg = p.locator(".ant-modal-content").filter({ visible: true }).filter({ hasText: /price cap/i }).last();
    await dlg.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
    const title = ((await dlg.locator(".ant-modal-title").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    const forWho = title.replace(/^(add|edit|view) price cap for\s*/i, "").trim() || vendor || "the vendor";
    await this.pause(800);
    const cells = await this.capCells(dlg);
    const caps = await cells
      .evaluateAll((els) => els.map((c) => ((c.querySelector("input, textarea") as HTMLInputElement | null)?.value || c.textContent || "").replace(/\s+/g, " ").trim()))
      .catch(() => [] as string[]);
    await this.closeOverlay();
    if (await dlg.isVisible().catch(() => false)) await p.keyboard.press("Escape").catch(() => {});
    return { forWho, caps };
  }
}
