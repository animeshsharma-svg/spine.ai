import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import type { QcsBlock, QcsGrid } from "../plan/qcsModel.js";

/**
 * Reads the Master QCS comparison grid into data (plan/qcsModel.ts judges it).
 *
 * The grid is an ARIA grid: a header row whose column headers carry each
 * vendor's name (a heading inside the header), then, per line item, a block row
 * holding the item's heading and value rows whose first cell is the label
 * ("Qty Offer", "Rank", "RFQ Rate"…) and whose next cells are the vendors'
 * values in column order. The grid is virtualised, so it is scrolled through
 * and rows are merged by aria-rowindex; cells are placed by aria-colindex when
 * the grid gives one, by position otherwise.
 *
 * Opening the tab is open_master_qcs / open_prepared's job; this only reads
 * what is on screen and returns null when no grid is.
 */
export class MasterQcsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async read(): Promise<QcsGrid | null> {
    const grid = this.page.locator("[role='grid']").filter({ visible: true }).first();
    if (!(await grid.count().catch(() => 0))) return null;
    await grid.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

    type Raw = { idx: number | null; header?: Array<{ col: number; name: string }>; heading?: string; label?: string; cells?: Array<{ col: number; text: string }> };
    // In-page code: no named inner functions — tsx's build wraps them in a __name()
    // helper that does not exist inside the browser, and the read would come back empty.
    const collect = () =>
      grid.evaluate((el): Raw[] => {
        const out: Raw[] = [];
        const HEADING = "h1, h2, h3, h4, h5, h6, [role='heading']";
        for (const row of Array.from(el.querySelectorAll("[role='row']"))) {
          if (row.closest("[role='grid']") !== el) continue;
          const cells = Array.from(row.querySelectorAll("[role='columnheader'], [role='gridcell']")).filter((c) => c.closest("[role='row']") === row);
          if (!cells.length) continue;
          const ri = Number(row.getAttribute("aria-rowindex"));
          const idx = Number.isFinite(ri) && ri > 0 ? ri : null;
          const placed: Array<{ col: number; text: string; heading: string }> = [];
          for (let i = 0; i < cells.length; i++) {
            const c = cells[i] as HTMLElement;
            const ci = Number(c.getAttribute("aria-colindex"));
            const h = c.querySelector(HEADING) as HTMLElement | null;
            placed.push({
              col: Number.isFinite(ci) && ci > 0 ? ci - 1 : i,
              text: (c.innerText ?? c.textContent ?? "").replace(/\s+/g, " ").trim(),
              heading: h ? (h.innerText ?? h.textContent ?? "").replace(/\s+/g, " ").trim() : "",
            });
          }
          if (cells.some((c) => c.getAttribute("role") === "columnheader")) {
            out.push({ idx, header: placed.map((p) => ({ col: p.col, name: p.heading || p.text })).filter((h) => h.name) });
            continue;
          }
          if (placed[0].heading) {
            out.push({ idx, heading: placed[0].heading });
            continue;
          }
          out.push({ idx, label: placed[0].text, cells: placed.slice(1).map((p) => ({ col: p.col, text: p.text })) });
        }
        return out;
      });

    const seen = new Map<string, Raw>();
    let order = 0;
    const merge = (rows: Raw[]) => {
      for (const r of rows) {
        const key = r.idx !== null ? `i${r.idx}` : `d${order++}`;
        if (!seen.has(key)) seen.set(key, r);
      }
    };

    const box = await grid.evaluate((el) => ({ h: el.scrollHeight, view: el.clientHeight })).catch(() => ({ h: 0, view: 0 }));
    await grid.evaluate((el) => (el.scrollTop = 0)).catch(() => {});
    await this.page.waitForTimeout(200);
    const first = await collect().catch((e) => {
      console.log(`[master-qcs] reading the grid failed: ${(e as Error).message.split("\n")[0]}`);
      return [] as Raw[];
    });
    merge(first);
    // Without row indexes the rows cannot be merged across scroll positions; the first view is all there is.
    if (first.length && first.every((r) => r.idx !== null) && box.h > box.view + 4) {
      const step = Math.max(80, Math.floor(box.view * 0.7));
      for (let top = step, n = 0; top < box.h + step && n < 60; top += step, n++) {
        await grid.evaluate((el, t) => (el.scrollTop = t), top).catch(() => {});
        await this.page.waitForTimeout(150);
        merge(await collect().catch(() => [] as Raw[]));
      }
      await grid.evaluate((el) => (el.scrollTop = 0)).catch(() => {});
    }

    const rows = [...seen.values()].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
    const header = rows.find((r) => r.header)?.header ?? [];
    // Vendor columns: named headers after the label column.
    const vendorCols = header.filter((h) => h.col > 0).sort((a, b) => a.col - b.col);
    const blocks: QcsBlock[] = [];
    let cur: QcsBlock | null = null;
    for (const r of rows) {
      if (r.header) continue;
      if (r.heading !== undefined) {
        cur = { heading: r.heading, rows: [] };
        blocks.push(cur);
        continue;
      }
      if (!r.label) continue;
      if (!cur) {
        cur = { heading: "", rows: [] };
        blocks.push(cur);
      }
      const at = new Map((r.cells ?? []).map((c) => [c.col, c.text]));
      cur.rows.push({ label: r.label, cells: vendorCols.map((v) => at.get(v.col) ?? "") });
    }
    return { vendors: vendorCols.map((v) => v.name), blocks };
  }
}
