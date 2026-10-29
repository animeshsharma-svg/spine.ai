import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { TIMEOUTS } from "../config.js";

/**
 * THE EVALUATOR'S SCORING of a technical stage (Aanya, 29 Oct: "PR to event → publish → vendor bidding + surrogate
 * bidding → evaluator scoring → awarding"), worked out from screenshots and Procol's own code (customViews / rfiQuotes):
 *
 *  - Only the stage's ASSIGNED evaluator can score, and Procol's evaluator list never offers the account that made
 *    the event — so this runs in the evaluator's own signed-in tab (runPlan opens it beside the buyer's).
 *  - After the bidding ends the stage shows an "Evaluation time" countdown. Its Responses grid has an
 *    "Evaluation Score" row under each line item, with "+ Add Evaluation" in each vendor's cell.
 *  - Selecting that cell opens a dropdown of the client's score labels (PROCOL DEMO: Preference P1 / P2 / P3,
 *    On Trial, Technically Not Accepted - TNA). The menu is drawn outside the grid's visible box, so its item is
 *    clicked by event. A pick opens "Add a remark" (a remark is required) → Ok → POST /api/evaluations.
 *  - Each line item's "Submit" → PATCH /api/evaluations/submit; the line then reads "TR Submitted".
 */
export class EvaluationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** The technical stage's Responses grid, on the event's own page. */
  async open(projectUrl: string): Promise<void> {
    const p = this.page;
    await p.goto(projectUrl, { waitUntil: "domcontentloaded" });
    await p.getByRole("tab").first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
    await p.getByRole("tab", { name: /technical/i }).first().click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
    await p.getByText(/evaluation score/i).first().waitFor({ state: "visible", timeout: TIMEOUTS.LONG }).catch(() => {});
    await this.dismissDistractions();
    // The evaluator's "+ Add Evaluation" buttons come after the grid, once Procol has worked out who may score.
    await p.getByRole("button", { name: /add evaluation/i }).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  }

  /** The vendor columns, left to right, by name and x-range. */
  private async vendorColumns(): Promise<Array<{ name: string; x0: number; x1: number }>> {
    const heads = this.page.getByRole("columnheader").filter({ has: this.page.getByRole("heading", { level: 2 }) });
    const out: Array<{ name: string; x0: number; x1: number }> = [];
    for (let i = 0; i < Math.min(await heads.count().catch(() => 0), 30); i++) {
      const h = heads.nth(i);
      const box = await h.boundingBox().catch(() => null);
      const name = ((await h.getByRole("heading", { level: 2 }).first().textContent().catch(() => "")) ?? "").trim();
      if (box && name) out.push({ name, x0: box.x, x1: box.x + box.width });
    }
    return out;
  }

  /** The score labels the client offers, as the open dropdown lists them. */
  private async openMenuLabels(): Promise<string[]> {
    return this.page
      .locator(".ant-dropdown-menu-item")
      .evaluateAll((els) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean))
      .catch(() => [] as string[]);
  }

  /**
   * Score every vendor's cell and submit each line item. `pick(vendorIndex, vendorName, labels)` answers the label to
   * give. Answers what was scored, what Procol said to each save and each submit.
   */
  async scoreAll(
    pick: (i: number, vendor: string, labels: string[]) => string,
    remark: string,
  ): Promise<{ scored: Array<{ vendor: string; label: string; ok: boolean }>; submitted: number; refused: string[] }> {
    const p = this.page;
    const scored: Array<{ vendor: string; label: string; ok: boolean }> = [];
    const refused: string[] = [];
    const cols = await this.vendorColumns();
    for (let guard = 0; guard < 40; guard++) {
      const add = p.getByRole("button", { name: /add evaluation/i }).filter({ visible: true }).first();
      if (!(await add.count())) break;
      await add.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      const box = await add.boundingBox();
      if (!box) break;
      const cx = box.x + box.width / 2;
      const col = Math.max(0, cols.findIndex((c) => cx >= c.x0 && cx <= c.x1));
      const vendor = cols[col]?.name ?? `vendor ${col + 1}`;
      // Selecting the cell (not the button's text) opens the label dropdown.
      await p.mouse.click(box.x + box.width + 40, box.y + box.height / 2);
      await p.waitForTimeout(900);
      const labels = await this.openMenuLabels();
      if (!labels.length) {
        refused.push(`${vendor}: no score labels opened on its cell`);
        break;
      }
      const want = pick(col, vendor, labels);
      const item = p.locator(".ant-dropdown-menu-item").filter({ hasText: new RegExp(`^\\s*${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") }).last();
      if (!(await item.count())) {
        refused.push(`${vendor}: no score label “${want}” (offered: ${labels.join(", ")})`);
        break;
      }
      await item.dispatchEvent("click");
      const pop = p.locator(".ant-popover:not(.ant-popover-hidden)").filter({ has: p.locator("textarea") }).last();
      await pop.waitFor({ state: "attached", timeout: TIMEOUTS.MEDIUM }).catch(() => {});
      await pop.locator("textarea").first().fill(remark).catch(() => {});
      const saved = p.waitForResponse((r) => /\/api\/evaluations$/.test(new URL(r.url()).pathname) && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null);
      await pop.getByRole("button", { name: /^\s*ok\s*$/i }).first().dispatchEvent("click");
      const res = await saved;
      const ok = !!res && res.ok();
      if (!ok) refused.push(`${vendor}: the score was not saved${res ? ` (${res.status()} ${(await res.text().catch(() => "")).slice(0, 120)})` : " (no answer from Procol)"}`);
      scored.push({ vendor, label: want, ok });
      if (!ok) break;
      await p.waitForTimeout(1_200);
    }
    // Each line item's "Submit", or one "Submit Score" above the grid when the stage is evaluated as a lot (29 Oct).
    let submitted = 0;
    for (let guard = 0; guard < 20; guard++) {
      const submit = p.getByRole("button", { name: /^\s*submit( scores?| evaluations?)?\s*$/i }).filter({ visible: true }).first();
      if (!(await submit.count())) break;
      if (await submit.isDisabled().catch(() => false)) break;
      const done = p.waitForResponse((r) => /\/evaluations\/submit/.test(new URL(r.url()).pathname) && r.request().method() !== "GET", { timeout: 20_000 }).catch(() => null);
      await submit.click({ timeout: TIMEOUTS.SHORT }).catch(() => {});
      // a confirm, if Procol asks — only inside its dialog: on the page, "Submit Score" itself matches and a second
      // press is refused (422)
      await p.locator(".ant-modal-content, .ant-popover:not(.ant-popover-hidden)").getByRole("button", { name: /^(yes|confirm|submit|ok)\b/i }).filter({ visible: true }).last().click({ timeout: 2_000 }).catch(() => {});
      const res = await done;
      if (res && res.ok()) submitted++;
      else {
        refused.push(`a line item's Submit${res ? ` answered ${res.status()} ${(await res.text().catch(() => "")).slice(0, 120)}` : " got no answer from Procol"}`);
        break;
      }
      await p.waitForTimeout(1_500);
    }
    return { scored, submitted, refused };
  }
}
