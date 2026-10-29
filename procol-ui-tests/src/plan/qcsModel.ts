/**
 * The Master QCS comparison grid as data — and the checks a screen case asks of
 * it. No Playwright here: MasterQcsPage reads the grid into a QcsGrid, and these
 * functions judge it, so the judging can be tested on recorded grids offline
 * (scripts/qcs-selftest.ts).
 *
 * The grid, as the console renders it (recorded in evidence/…/open_master_qcs):
 *
 *   header row   | (label column) | Vendor A | Vendor B | (spare) |
 *   block row    | ▾ AAC BLOCKS •1100000401 •Variant 1               ← one per line item
 *   value rows   | Qty Offer      | 64 KG    | 50 KG    |
 *                | Rank           | 1        | 2        |
 *                | RFQ Rate       | ₹ 87 /KG | ₹ 90 /KG |
 *                | RFQ Amount     | ₹ 5,568  | ₹ 4,500  |
 *   block row    | ▾ Rfq Final                                        ← the totals section
 *                | Sum Total      | ₹ 5,568  | ₹ 4,500  |
 *
 * Row labels depend on the template ("RFQ Rate", "Auction Rate", "Rate per
 * unit"…), so every label is looked up loosely and the label actually used is
 * named in the step's answer.
 */

export interface QcsRow {
  label: string;
  /** one entry per vendor column, in column order; "" or "–" when the vendor has no value */
  cells: string[];
}

export interface QcsBlock {
  /** the block's heading: the line item ("AAC BLOCKS •1100000401 •Variant 1") or a section ("Rfq Final") */
  heading: string;
  rows: QcsRow[];
}

export interface QcsGrid {
  vendors: string[];
  blocks: QcsBlock[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** "₹ 5,568" → 5568 · "₹ 87 /KG" → 87 · "64 KG" → 64 · "29.84 %" → 29.84 · "–" → null */
export function qcsNumber(text: string | undefined): number | null {
  const t = String(text ?? "").replace(/,/g, "");
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** A cell that holds nothing a person would read as a value. */
export function qcsEmpty(text: string | undefined): boolean {
  return /^\s*[-–—]?\s*$/.test(String(text ?? ""));
}

/** How far a displayed number may sit from the computed one: what rounding for display can explain. */
export function qcsTolerance(displayed: string, scale = 1): number {
  const decimals = (String(displayed).replace(/,/g, "").match(/\.(\d+)/)?.[1] ?? "").length;
  return Math.max(decimals ? 0.5 * 10 ** -decimals : 0.5, 0.005 * Math.abs(scale)) + 1e-9;
}

/** Names a column must never carry — a placeholder where the vendor's company name belongs. */
export const PLACEHOLDER_VENDOR = /^\s*(vendor\s*\d*|undefined|null|nan|n\/?a|unknown|[-–—]|)\s*$/i;

/**
 * The row a case means by a label, loosely: exact, then starting with it, then
 * containing it. `exclude` keeps look-alikes out ("Final Negotiated Rate" when
 * the case means the bid's rate).
 */
export function findRowLabel(labels: string[], want: string | RegExp, exclude?: RegExp): string | undefined {
  const pool = labels.filter((l) => !exclude || !exclude.test(l));
  if (want instanceof RegExp) return pool.find((l) => want.test(l));
  const w = norm(want);
  // A loose match never lands on a reference row unless the case names one: "Price" read "Last Purchase
  // Price" (28 Oct, SB13) — the bid's price is its rate row.
  const REFERENCE = /negotiated|last purchase|landed|savings|target|reference|budget/i;
  const loose = REFERENCE.test(want) ? pool : pool.filter((l) => !REFERENCE.test(l));
  return (
    pool.find((l) => norm(l) === w) ??
    pool.find((l) => norm(l).startsWith(w)) ??
    loose.find((l) => norm(l).includes(w)) ??
    // "rate per unit" ↔ "RFQ Rate", "Auction/RFQ Amount" ↔ "RFQ Amount": every word of the
    // label but the stage's name is in the wanted text ("Final Negotiated Rate" is not "rate").
    loose.find((l) => {
      const words = labelWords(l);
      const wanted = new Set(w.split(/[^a-z0-9]+/).filter(Boolean));
      return words.length > 0 && words.every((word) => wanted.has(word));
    }) ??
    (/\bprice\b/.test(w) ? loose.find((l) => /\brate\b/i.test(l)) : undefined)
  );
}

const STAGE_WORDS = new Set(["rfq", "rfp", "rfi", "auction", "stage"]);
const labelWords = (label: string) => norm(label).split(/[^a-z0-9]+/).filter((x) => x && !STAGE_WORDS.has(x));

/** Every row label in the grid, in order, once. */
export function rowLabels(g: QcsGrid): string[] {
  return [...new Set(g.blocks.flatMap((b) => b.rows.map((r) => r.label)))];
}

/** Which vendor column a case means: a 1-based number, a name substring, or — given one column — that one. */
export function vendorIndex(g: QcsGrid, want: unknown, fallbackName?: string): number {
  if (want === undefined || want === null || want === "") {
    if (g.vendors.length === 1) return 0;
    if (fallbackName) {
      const i = g.vendors.findIndex((v) => norm(v).includes(norm(fallbackName)) || norm(fallbackName).includes(norm(v)));
      if (i >= 0) return i;
    }
    return g.vendors.length ? 0 : -1;
  }
  const n = Number(want);
  if (Number.isInteger(n) && n >= 1 && n <= g.vendors.length && String(want).trim() === String(n)) return n - 1;
  const w = norm(String(want));
  return g.vendors.findIndex((v) => norm(v).includes(w) || (w.length > 3 && w.includes(norm(v))));
}

/** The blocks a case means: one whose heading contains `product`, or every line-item block (not the totals section). */
export function lineBlocks(g: QcsGrid, product?: unknown): QcsBlock[] {
  if (product) return g.blocks.filter((b) => norm(b.heading).includes(norm(String(product))));
  return g.blocks.filter((b) => !isTotalsBlock(b));
}

/** The totals section ("Rfq Final", "Auction Final", "Final"), which holds Sum Total. */
export function isTotalsBlock(b: QcsBlock): boolean {
  return /\bfinal\b/i.test(b.heading) || b.rows.some((r) => /^sum total$/i.test(r.label.trim()));
}

export interface CellRef {
  block: QcsBlock;
  row: QcsRow;
  vendor: number;
  text: string;
}

/** The first cell for (row label, vendor) in the blocks given. */
export function cellAt(blocks: QcsBlock[], label: string, vendor: number): CellRef | undefined {
  for (const block of blocks) {
    const row = block.rows.find((r) => r.label === label);
    if (row) return { block, row, vendor, text: row.cells[vendor] ?? "" };
  }
  return undefined;
}

/** Labels for the bid's rate, quantity and amount, picked from what this template shows. */
export function amountLabels(labels: string[], given: { rate?: unknown; qty?: unknown; amount?: unknown }) {
  const NOT_BID = /negotiated|last purchase|landed|savings|target|reference|budget/i;
  return {
    rate: given.rate ? findRowLabel(labels, String(given.rate)) : findRowLabel(labels, /\brate\b|per unit|unit price|\bprice\b/i, NOT_BID),
    qty: given.qty ? findRowLabel(labels, String(given.qty)) : (findRowLabel(labels, /^qty offer/i) ?? findRowLabel(labels, /\bqty\b|quantity/i, /awarded/i)),
    amount: given.amount ? findRowLabel(labels, String(given.amount)) : findRowLabel(labels, /\bamount\b/i, NOT_BID),
  };
}

export interface MathCheck {
  checked: string[];
  wrong: string[];
  skipped: string[];
}

/** For each vendor and line item: amount = rate × quantity; and Sum Total = the sum of the vendor's amounts. */
export function checkAmounts(
  g: QcsGrid,
  opts: { vendor?: number; product?: unknown; rate?: unknown; qty?: unknown; amount?: unknown; total?: boolean },
): MathCheck & { labels: { rate?: string; qty?: string; amount?: string } } {
  const labels = amountLabels(rowLabels(g), opts);
  const out: MathCheck = { checked: [], wrong: [], skipped: [] };
  if (!labels.rate || !labels.qty || !labels.amount) return { ...out, labels };
  const vendors = opts.vendor !== undefined ? [opts.vendor] : g.vendors.map((_, i) => i);
  const blocks = lineBlocks(g, opts.product);
  for (const v of vendors) {
    const who = g.vendors[v] ?? `column ${v + 1}`;
    let sum = 0;
    let summed = 0;
    // A line the vendor did not bid adds nothing to its total; a value that cannot be read
    // leaves the total unknowable, so the Sum Total check is skipped.
    let unreadable = 0;
    for (const b of blocks) {
      const [rate, qty, amount] = [labels.rate, labels.qty, labels.amount].map((l) => b.rows.find((r) => r.label === l)?.cells[v] ?? "");
      if (qcsEmpty(rate) && qcsEmpty(amount)) {
        out.skipped.push(`${who} · ${b.heading}: no bid on this line`);
        continue;
      }
      const [r, q, am] = [qcsNumber(rate), qcsNumber(qty), qcsNumber(amount)];
      if (r === null || q === null || am === null) {
        out.skipped.push(`${who} · ${b.heading}: a value cannot be read as a number (${rate} · ${qty} · ${amount})`);
        unreadable++;
        continue;
      }
      const want = r * q;
      const line = `${who} · ${b.heading}: ${labels.amount} ${amount.trim()} vs ${labels.rate} ${rate.trim()} × ${labels.qty} ${qty.trim()} = ${fmt(want)}`;
      if (Math.abs(am - want) <= qcsTolerance(amount, q)) out.checked.push(line);
      else out.wrong.push(line);
      sum += am;
      summed++;
    }
    if (opts.total === false || opts.product || unreadable) continue;
    const totals = g.blocks.filter(isTotalsBlock);
    const totalRow = totals.flatMap((b) => b.rows).find((r) => /^sum total$/i.test(r.label.trim()));
    const shown = totalRow?.cells[v] ?? "";
    if (!totalRow || qcsEmpty(shown) || !summed) continue;
    const t = qcsNumber(shown);
    const line = `${who} · Sum Total ${shown.trim()} vs the sum of its ${summed} line amount(s) = ${fmt(sum)}`;
    if (t !== null && Math.abs(t - sum) <= qcsTolerance(shown, summed)) out.checked.push(line);
    else out.wrong.push(line);
  }
  return { ...out, labels };
}

/**
 * Ranks follow the RATE: on a buy event the lowest rate is Rank 1 (highest on a sell event). Procol ranks by the
 * unit rate, not the line amount — 27 Oct, VB08: 100/unit for 10 units (amount 1,000) was Rank 1 over 120/unit for
 * 1 unit (amount 120). Where every vendor quotes the same quantity the two orders agree. No rate row: the amount.
 */
export function checkRanks(
  g: QcsGrid,
  opts: { by?: unknown; product?: unknown; order?: "lowest" | "highest" },
): MathCheck & { labels: { rank?: string; by?: string } } {
  const all = rowLabels(g);
  const rank = findRowLabel(all, /^rank$/i) ?? findRowLabel(all, /\brank\b/i);
  const by = opts.by ? findRowLabel(all, String(opts.by)) : (amountLabels(all, {}).rate ?? amountLabels(all, {}).amount);
  const out: MathCheck = { checked: [], wrong: [], skipped: [] };
  if (!rank || !by) return { ...out, labels: { rank, by } };
  const better = (a: number, b: number) => (opts.order === "highest" ? a > b : a < b);
  for (const b of lineBlocks(g, opts.product)) {
    const rRow = b.rows.find((r) => r.label === rank);
    const aRow = b.rows.find((r) => r.label === by);
    if (!rRow || !aRow) continue;
    const bids = g.vendors
      .map((name, v) => ({ name, rank: qcsNumber(rRow.cells[v]), amount: qcsNumber(aRow.cells[v]), empty: qcsEmpty(rRow.cells[v]) || qcsEmpty(aRow.cells[v]) }))
      .filter((x) => !x.empty && x.rank !== null && x.amount !== null) as Array<{ name: string; rank: number; amount: number }>;
    if (!bids.length) {
      out.skipped.push(`${b.heading}: no ranked bid`);
      continue;
    }
    const best = Math.min(...bids.map((x) => x.rank));
    // A tie at the best amount is not judged: the console showed two vendors tied at ₹1,000 as
    // Rank 2 and Rank 2 (evidence/plan-mv7zdopu, 14 Oct) — how ties rank is UI-FQCS-004's to
    // record, not a rule this check may assume. Only a lone best bid must be Rank 1.
    const bestAmount = opts.order === "highest" ? Math.max(...bids.map((x) => x.amount)) : Math.min(...bids.map((x) => x.amount));
    const atBest = bids.filter((x) => Math.abs(x.amount - bestAmount) < 1e-9);
    if (atBest.length > 1) out.skipped.push(`${b.heading}: ${atBest.length} vendors tie at the best ${by} ${fmt(bestAmount)}, shown as Rank ${atBest.map((x) => x.rank).join(" and ")} — recorded, not judged`);
    else if (atBest[0].rank !== 1) out.wrong.push(`${b.heading}: the lone best bid (${atBest[0].name}, ${by} ${fmt(bestAmount)}) shows Rank ${atBest[0].rank}, not 1`);
    else if (best !== 1) out.wrong.push(`${b.heading}: the best rank shown is ${best}, not 1`);
    for (const x of bids) {
      for (const y of bids) {
        if (x === y || !better(x.amount, y.amount)) continue;
        const line = `${b.heading}: ${x.name} (${by} ${fmt(x.amount)}, Rank ${x.rank}) vs ${y.name} (${fmt(y.amount)}, Rank ${y.rank})`;
        if (x.rank < y.rank) out.checked.push(line);
        else out.wrong.push(line);
      }
    }
    if (bids.length === 1 && best === 1) out.checked.push(`${b.heading}: the only bid, ${bids[0].name}, is Rank 1`);
  }
  return { ...out, labels: { rank, by } };
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 4 }));
