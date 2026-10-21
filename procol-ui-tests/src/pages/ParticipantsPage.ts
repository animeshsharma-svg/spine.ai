import { Locator, Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { SurrogateBidPage } from "./SurrogateBidPage.js";
import { TIMEOUTS } from "../config.js";

/**
 * A published event's Participants list, read row by row.
 *
 * Recorded on the live console (evidence/uicase-UI-SUR-001-…/02-open_participants):
 * a "Search vendors" box, a "Show only selected vendors" switch, then a list
 * whose items are one vendor each — a checkbox (ticked = on this round), the
 * name, phone, email and vendor code as paragraphs, and per-vendor buttons
 * (Add Bid, Add Price Cap). The list is paginated ten a page.
 *
 * The vendor's name is read from the ROW (its first paragraph), never from a
 * button's wrapper, which holds only "Add Bid" and makes every vendor look the
 * same (UI-SUR-002's oracle).
 */
export interface ParticipantRow {
  name: string;
  email: string;
  text: string;
  selected: boolean | null;
  addBid: boolean;
}

export class ParticipantsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private search(): Locator {
    return this.page.getByPlaceholder(/search vendors?/i).filter({ visible: true }).first();
  }

  private rowsLocator(): Locator {
    return this.page
      .locator("[role='listitem'], li, .ant-list-item")
      .filter({ has: this.page.getByRole("checkbox") })
      .filter({ visible: true });
  }

  /** Get onto the list: already there, or through the stage's Participants tab. */
  async ensureOpen(): Promise<boolean> {
    if (await this.search().isVisible().catch(() => false)) return true;
    if (!/\/project\//.test(this.page.url())) return false;
    await new SurrogateBidPage(this.page).openParticipants().catch(() => false);
    return this.search().isVisible().catch(() => false);
  }

  /** The rows on the page shown now. */
  async rows(): Promise<ParticipantRow[]> {
    const loc = this.rowsLocator();
    const out: ParticipantRow[] = [];
    const n = Math.min(await loc.count().catch(() => 0), 50);
    for (let i = 0; i < n; i++) {
      const row = loc.nth(i);
      const paras = (await row.locator("p, [role='paragraph']").allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      const text = ((await row.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      const box = row.getByRole("checkbox").first();
      const selected = (await box.count().catch(() => 0)) ? await box.isChecked().catch(() => null) : null;
      const addBid =
        (await row.getByTestId("add-bid-button").count().catch(() => 0)) > 0 ||
        (await row.getByRole("button", { name: /add bid/i }).count().catch(() => 0)) > 0;
      const email = paras.find((p) => /@/.test(p)) ?? text.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)?.[0] ?? "";
      const name = paras.find((p) => !/@/.test(p) && !/^[-–]$/.test(p)) ?? text.replace(/\s*(add bid|add price cap|view price cap|edit bid)\s*/gi, " ").trim();
      out.push({ name, email, text, selected, addBid });
    }
    return out;
  }

  /** Whether the list says, in words, that it holds nobody. */
  async saysEmpty(): Promise<boolean> {
    return this.page.getByText(/no vendors? (to show|found)|no data/i).filter({ visible: true }).first().isVisible().catch(() => false);
  }

  /** Type into "Search vendors" and wait for the list to narrow to rows that mention it (or to say it is empty). */
  async searchFor(query: string): Promise<ParticipantRow[]> {
    const box = this.search();
    await box.fill(query, { timeout: TIMEOUTS.SHORT });
    const q = query.trim().toLowerCase();
    const until = Date.now() + 12_000;
    let rows: ParticipantRow[] = [];
    while (Date.now() < until) {
      await this.page.waitForTimeout(700);
      rows = await this.rows();
      if (rows.length && rows.every((r) => r.text.toLowerCase().includes(q))) break;
      if (!rows.length && (await this.saysEmpty())) break;
    }
    return rows;
  }

  async clearSearch(): Promise<void> {
    const box = this.search();
    if ((await box.inputValue().catch(() => "")) === "") return;
    await box.fill("").catch(() => {});
    await this.page.waitForTimeout(1_200);
  }

  private switchFor(): Locator {
    return this.page
      .getByText(/show only selected vendors/i)
      .first()
      .locator("xpath=following::*[@role='switch' or contains(@class,'ant-switch')][1]");
  }

  /** Turn "Show only selected vendors" on or off. Answers whether it now reads as asked. */
  async showOnlySelected(on: boolean): Promise<boolean> {
    const sw = this.switchFor();
    if (!(await sw.count().catch(() => 0))) return false;
    const isOn = async () => (await sw.getAttribute("aria-checked").catch(() => null)) === "true";
    for (let i = 0; i < 4 && (await isOn()) !== on; i++) {
      await this.dismissDistractions().catch(() => false);
      await sw.click({ timeout: 3_000 }).catch(() => sw.dispatchEvent("click").catch(() => {}));
      await this.page.waitForTimeout(1_200);
    }
    return (await isOn()) === on;
  }

  /** The pagination's "next" control, when there is a further page. */
  private async nextPage(): Promise<Locator | null> {
    const next = this.page.locator(".ant-pagination-next, [title='Next Page']").filter({ visible: true }).first();
    if (!(await next.count().catch(() => 0))) return null;
    const cls = (await next.getAttribute("class").catch(() => "")) ?? "";
    const disabled = /disabled/.test(cls) || (await next.getAttribute("aria-disabled").catch(() => null)) === "true";
    return disabled ? null : next;
  }

  /** Every row on every page (capped), returning to page 1 is not needed: the caller reads, it does not act. */
  async allRows(maxPages = 30): Promise<{ rows: ParticipantRow[]; pages: number; complete: boolean }> {
    const rows: ParticipantRow[] = [];
    let pages = 0;
    for (; pages < maxPages; pages++) {
      const here = await this.rows();
      rows.push(...here);
      const next = await this.nextPage();
      if (!next) return { rows, pages: pages + 1, complete: true };
      const before = here.map((r) => r.text).join("|");
      await next.click({ timeout: 3_000 }).catch(() => {});
      const until = Date.now() + 10_000;
      while (Date.now() < until) {
        await this.page.waitForTimeout(500);
        if ((await this.rows()).map((r) => r.text).join("|") !== before) break;
      }
    }
    return { rows, pages, complete: false };
  }

  /** The row for a vendor among those on screen: by name or email, case-insensitive. */
  rowFor(rows: ParticipantRow[], vendor: string): ParticipantRow | undefined {
    const w = vendor.trim().toLowerCase();
    return rows.find((r) => r.name.toLowerCase().includes(w) || r.email.toLowerCase().includes(w)) ?? rows.find((r) => r.text.toLowerCase().includes(w));
  }

  /** Tick a vendor's box. Confirms a dialog if one asks. Answers the toast the app showed, if any. */
  async tick(vendor: string): Promise<{ selected: boolean | null; refusal: string }> {
    const w = vendor.trim().toLowerCase();
    const row = this.rowsLocator().filter({ hasText: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    const box = row.getByRole("checkbox").first();
    await box.scrollIntoViewIfNeeded({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await box.click({ timeout: TIMEOUTS.SHORT }).catch(() => box.dispatchEvent("click").catch(() => {}));
    await this.clickIfPresent([this.page.getByRole("dialog").getByRole("button", { name: /^(yes|confirm|ok|add|invite|proceed|submit)\b/i })], {
      label: "participant-add-confirm",
      timeout: TIMEOUTS.SHORT,
    });
    await this.waitForSpinnerHidden().catch(() => {});
    const refusal = (await this.errorToastText(3_000).catch(() => "")) || "";
    let selected: boolean | null = null;
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      selected = await box.isChecked().catch(() => null);
      if (selected || refusal) break;
      await this.page.waitForTimeout(600);
    }
    return { selected, refusal };
  }
}
