import type { Page } from "@playwright/test";

/**
 * WHAT A PERSON CAN READ ON THE SCREEN RIGHT NOW.
 *
 * `innerText` alone misses three places the console puts real values:
 *   - form controls (the pricing sheet and schedule are inputs — their value is
 *     not text),
 *   - `title` attributes (a truncated cell shows "Stainless st…" and keeps the
 *     full name in its tooltip),
 *   - `aria-label`s on icon-only controls.
 * So the snapshot keeps each visible piece of text as a SEGMENT with where it
 * came from, plus the joined visible text. Checks search segments first (so a
 * match can say which element it was in), then the joined text.
 *
 * Only VISIBLE elements count: a value that sits in a hidden tab is not on the
 * screen, and claiming it is would hide exactly the defect this looks for.
 */

export interface Segment {
  text: string;
  /** text | value (form control) | title (tooltip attr) | aria */
  kind: "text" | "value" | "title" | "aria";
  /** A short CSS-ish hint of where it sits: nearest testid / role / class. */
  where: string;
  /** Index of the nearest enclosing "row" (table row, list item, card), -1 when none. */
  row: number;
  /** Where it is drawn, in viewport pixels at snapshot time — lines and columns are geometric. */
  box: { x: number; y: number; w: number; h: number };
  /** Inside a fixed-position overlay (feedback widget, notification card) — not part of the page's content. */
  overlay?: boolean;
}

export interface ScreenSnapshot {
  url: string;
  takenAt: string;
  /** Visible text of the page, whitespace collapsed per line. */
  text: string;
  segments: Segment[];
  /** Text of each row-like container, indexed by Segment.row. */
  rows: string[];
}

export async function snapshotScreen(page: Page): Promise<ScreenSnapshot> {
  const data = await page.evaluate(() => {
    const segs: Array<{ text: string; kind: string; where: string; row: number; box: { x: number; y: number; w: number; h: number }; overlay?: boolean }> = [];
    const boxOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    // A text node's own box, not its parent's: a <td> is as wide as its column,
    // which is what a column check wants, but a <div> holding "Created at" and
    // its value in one line would otherwise swallow both.
    const textBox = (n: Node, el: Element) => {
      try {
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // For table cells, widen to the cell so a header and its values share x-ranges.
          const cell = el.closest("td, th, [role='cell'], [role='columnheader'], [role='gridcell']");
          if (cell) {
            const c = cell.getBoundingClientRect();
            return { x: Math.round(c.left), y: Math.round(r.top), w: Math.round(c.width), h: Math.round(r.height) };
          }
          return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        }
      } catch {
        /* fall through */
      }
      return boxOf(el);
    };
    const rowEls: Element[] = [];
    const rowIndex = new Map<Element, number>();
    const ROW_SEL =
      "tr, [role='row'], .ant-table-row, .ant-list-item, .ag-row, li, .ant-card, [data-testid*='row'], [class*='row' i]";

    const visible = (el: Element): boolean => {
      const h = el as HTMLElement;
      if (!h.getClientRects || h.getClientRects().length === 0) return false;
      const st = getComputedStyle(h);
      if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return false;
      return true;
    };
    const hint = (el: Element): string => {
      let n: Element | null = el;
      for (let i = 0; n && i < 6; i++, n = n.parentElement) {
        const tid = n.getAttribute("data-testid");
        if (tid) return `[data-testid=${tid}]`;
        const role = n.getAttribute("role");
        if (role && role !== "presentation" && role !== "none") return `[role=${role}]`;
      }
      const c = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return `${el.tagName.toLowerCase()}${c ? "." + c : ""}`;
    };
    const overlayCache = new Map<Element, boolean>();
    const inOverlay = (el: Element): boolean => {
      const chain: Element[] = [];
      let n: Element | null = el;
      let res = false;
      while (n && n !== document.body) {
        const known = overlayCache.get(n);
        if (known !== undefined) {
          res = known;
          break;
        }
        chain.push(n);
        // Fixed overlays and floating tooltips/popovers ("Help us make Procol
        // better!") are drawn over the content, not part of it.
        if (getComputedStyle(n).position === "fixed" || n.matches("[role=tooltip], .ant-popover, .ant-tooltip, .ant-notification, .ant-message")) {
          res = true;
          break;
        }
        n = n.parentElement;
      }
      for (const c of chain) overlayCache.set(c, res);
      return res;
    };
    const rowOf = (el: Element): number => {
      // The SMALLEST row-like ancestor: a cell belongs to its row, not to the
      // table's wrapper that also happens to be a "row" by class name.
      const r = el.closest(ROW_SEL);
      if (!r) return -1;
      const txt = (r as HTMLElement).innerText ?? "";
      if (txt.length > 3000) return -1;
      let idx = rowIndex.get(r);
      if (idx === undefined) {
        idx = rowEls.length;
        rowEls.push(r);
        rowIndex.set(r, idx);
      }
      return idx;
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      const el = node.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || !visible(el)) continue;
      segs.push({ text: t, kind: "text", where: hint(el), row: rowOf(el), box: textBox(node, el), ...(inOverlay(el) ? { overlay: true } : {}) });
    }
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      if (!visible(el)) return;
      const v = (el as HTMLInputElement).value;
      if (v && String(v).trim() && (el as HTMLInputElement).type !== "password" && (el as HTMLInputElement).type !== "hidden")
        segs.push({ text: String(v).trim(), kind: "value", where: hint(el), row: rowOf(el), box: boxOf(el) });
    });
    document.querySelectorAll("[title]").forEach((el) => {
      const v = el.getAttribute("title");
      if (v && v.trim() && visible(el)) segs.push({ text: v.trim(), kind: "title", where: hint(el), row: rowOf(el), box: boxOf(el) });
    });
    document.querySelectorAll("[aria-label]").forEach((el) => {
      const v = el.getAttribute("aria-label");
      if (v && v.trim() && !/^icon:/.test(v) && visible(el))
        segs.push({ text: v.trim(), kind: "aria", where: hint(el), row: rowOf(el), box: boxOf(el) });
    });
    const rows = rowEls.map((r) => ((r as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim());
    const text = (document.body.innerText ?? "")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    return { segs, rows, text };
  });
  return {
    url: page.url(),
    takenAt: new Date().toISOString(),
    text: data.text,
    segments: data.segs as Segment[],
    rows: data.rows,
  };
}
