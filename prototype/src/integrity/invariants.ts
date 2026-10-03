/**
 * BID & REPORT NUMBER INTEGRITY — rules that must hold for ANY event.
 *
 *   const report = await checkEventIntegrity({ tradeUuid }, { buyer: buyerApi, vendors }, { submitted });
 *
 * After a run has built an event and bids are in, this reads every figure
 * Procol reports about those bids (as the buyer, and as each vendor when their
 * sessions are given) and checks each against the independent calculator
 * (calculator.ts), recomputed from the INPUTS the app itself stored — and,
 * when the run passes what it submitted, against those inputs too.
 *
 * It is read-only: GETs through the app-guarded sender (send.ts), and an
 * optional SELECT of the bid lines' stored formula values. It never changes
 * anything, so a journey or the bidding matrix can call it as a final step.
 *
 * Verdicts are deterministic: "passed" / "failed" / "couldn't tell" (a figure
 * could not be read is never a pass). Every check carries the raw inputs, the
 * app's figure, the oracle's figure and where the figure came from.
 *
 * The rules (ids are the invariant ids the case catalog's Trace lines name):
 *   INV-ECHO        the stored price / quantity / tax / charges equal what was submitted
 *   INV-LINE        every line formula value (total_amount, …) = the template formula on the stored inputs
 *   INV-BID         every bid formula value (gross_total, sub totals, tax on totals …) = the template formula
 *   INV-SAME        a bid's total is the same in every place the app shows it
 *   INV-AMOUNT      the bid's pre-tax amount = Σ unit price × quantity
 *   INV-BREAKUP     the per-line price breakup follows its own coded formula (price + GST per unit)
 *   INV-L1          L1 price per line = the lowest unit price among live bids; its line total = that bid's line total
 *   INV-L1DATA      the L1 data per line names the lowest-price bid's price and quantity
 *   INV-BEST        best-bidder flags, best line price and best bid total agree with the bids
 *   INV-RANK        shown ranks follow Procol's rank rule over the ranking figure
 *   INV-SAV-LINE    line savings = reference − best price (truncated to 4 places), % = amount ÷ reference
 *   INV-SAV-AGG     aggregate savings = Σ line savings × quantity over Σ reference × quantity; the two places agree
 *   INV-SANE        no NaN / Infinity / negative totals anywhere
 *   INV-COUNT       the bid count equals the bids listed
 *   INV-ISOLATION   a vendor's own views carry nothing of another vendor (name, id, price, total)
 *   INV-REPORT      the Excel comparison report shows the same prices and totals as the JSON
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST } from "../executor.js";
import { Dec } from "./decimal.js";
import { computeBid, procolRanks, sameFigure, templateFromWidgets, type BidInput, type Template } from "./calculator.js";
import { get, said, type Reply } from "./send.js";

export type Verdict = "passed" | "failed" | "couldn't tell" | "not run";

export interface IntegrityCheck {
  inv: string;
  title: string;
  expected: string;
  actual: string;
  verdict: Verdict;
  details?: {
    where?: string;
    inputs?: unknown;
    app?: string;
    oracle?: string;
    oracleRounded?: string;
    diff?: string;
    tolerance?: string;
    evidence?: unknown;
  };
}

export interface IntegrityApis {
  buyer: any;
  vendors?: { label: string; companyUuid: string; name?: string; api: any }[];
}

export interface SubmittedBid {
  companyUuid: string;
  label: string;
  input: BidInput;
}

export interface IntegrityOptions {
  /** what the run submitted, per vendor (enables INV-ECHO and names the vendors in the words) */
  submitted?: SubmittedBid[];
  /** read the stored line formula values with SELECT (default true; skipped when the DB is unreachable) */
  db?: boolean;
  /** parse the Excel comparison report (default false — it is slower and creates a report record) */
  report?: boolean;
  onLine?: (s: string) => void;
}

export interface IntegrityReport {
  tradeUuid: string;
  company?: string;
  checks: IntegrityCheck[];
  counts: Record<Verdict, number>;
  template?: { inline: string[]; global: string[]; precision?: number };
  reads: Record<string, { status: number; ok: boolean; said: string }>;
}

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
let dbq: ((sql: string, params?: unknown[]) => Promise<any[]>) | undefined;
async function db(sql: string, params: unknown[]): Promise<any[] | undefined> {
  try {
    if (!dbq) dbq = (await imp("db/pool.ts")).query;
    return await Promise.race([dbq!(sql, params), new Promise<undefined>((r) => setTimeout(() => r(undefined), 30_000))]);
  } catch {
    return undefined;
  }
}

/** Procol id ↔ uuid (lib/encrypt_decrypt.rb), for our own rows only. */
function decodeId(uuid: string): number | undefined {
  const key = "gZckDpNXdQ";
  const digits = [...Buffer.from(uuid, "base64").toString("latin1")].map((ch) => key.indexOf(ch));
  if (!digits.length || digits.some((d) => d < 0)) return undefined;
  const n = Number([...digits.slice(-3), ...digits.slice(0, -3)].join(""));
  const id = (n - 1022) / 3;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

const val = (cell: any): any => (cell && typeof cell === "object" && "value" in cell ? cell.value : cell);
const money = (d: Dec | undefined, dp = 4) => {
  if (d === undefined) return "—";
  const [i, f] = d.round(dp).toString().split(".");
  return `₹${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f ? `.${f}` : ""}`;
};
const plain = (d: Dec | undefined) => (d === undefined ? "—" : d.toString());

/** Every numeric input a stored row carries (participant + creator inputs), keyed by widget. */
function rowInputs(row: any, t: Template): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of t.inline) {
    if (w.formula) continue;
    const v = val(row?.[w.key]);
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" || (typeof v === "string" && Dec.tryOf(v) !== undefined && !/[A-Za-z]/.test(v))) out[w.key] = String(v);
    else if (typeof v === "string") out[w.key] = v; // dropdown / text values a formula may compare
  }
  return out;
}

function globalInputs(g: any, t: Template): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of t.global) {
    if (w.formula) continue;
    const v = val(g?.[w.key]);
    if (v === undefined || v === null || v === "" || typeof v === "object") continue;
    out[w.key] = String(v);
  }
  return out;
}

interface BidView {
  companyUuid: string;
  label: string;
  bidUuid?: string;
  status?: string;
  surrogate?: boolean;
  /** stored rows from the stage read, keyed by trade product uuid */
  rows: Map<string, any>;
  global: any;
  tpOrder: string[];
  stored: BidInput;
}

/**
 * Check every number Procol shows about the bids on one or more stages.
 * Never throws: a read that fails turns the checks that needed it into "couldn't tell".
 */
export async function checkEventIntegrity(
  eventIds: { tradeUuid: string; eventGroupUuid?: string } | { tradeUuid: string; eventGroupUuid?: string }[],
  apis: IntegrityApis,
  opts: IntegrityOptions = {},
): Promise<IntegrityReport[]> {
  const list = Array.isArray(eventIds) ? eventIds : [eventIds];
  const out: IntegrityReport[] = [];
  for (const ids of list) out.push(await checkStage(ids.tradeUuid, apis, opts));
  return out;
}

async function checkStage(trade: string, apis: IntegrityApis, opts: IntegrityOptions): Promise<IntegrityReport> {
  const checks: IntegrityCheck[] = [];
  const reads: IntegrityReport["reads"] = {};
  const log = opts.onLine ?? (() => {});
  const push = (c: IntegrityCheck) => {
    checks.push(c);
    log(`  ${{ passed: "✓", failed: "✗", "couldn't tell": "?", "not run": "–" }[c.verdict]} [${c.inv}] ${c.title} — ${c.actual}`);
  };
  const read = async (key: string, api: any, path: string): Promise<Reply> => {
    const r = await get(api, path);
    reads[key] = { status: r.status, ok: r.ok, said: said(r) };
    return r;
  };
  const B = apis.buyer;

  // ── the reads ──
  const show = await read("stage", B, `/trade/${trade}?response_type=template&additional_fields=order_details`);
  const schema = await read("comparison", B, `/v1/trade/${trade}/schema?response_type=template&additional_fields=order_details&l1_prices=true`);
  const ind = await read("indicators", B, `/v1/trade/${trade}/event_indicators`);
  const agg = await read("aggregate_savings", B, `/v1/trade/${trade}/aggregate_savings`);
  const lineSav = await read("line_savings", B, `/v1/trade/${trade}/best_line_wise_savings`);
  const l1d = await read("l1_data", B, `/v1/trade/${trade}/l1_data_for_event`);

  const st = show.ok ? show.data : schema.data;
  const widgets = { inline_components: st?.sheets?.inline_components?.widgets ?? [], global_price_components: st?.sheets?.global_price_components?.widgets ?? [] };
  if (!show.ok && !schema.ok) {
    push({ inv: "INV-SANE", title: "Read the stage's bids", expected: "The buyer can read the stage and its bids.", actual: `The stage could not be read (${said(show)}).`, verdict: "couldn't tell" });
    return finish(trade, checks, reads);
  }
  const t = templateFromWidgets(widgets);
  const precision = Number(st?.trade_config?.widget_precision ?? NaN);
  const dp = Number.isFinite(precision) ? precision : 2;
  const order: "buy" | "sell" = st?.order_type === "sell" ? "sell" : "buy";
  for (const u of t.unparsed) push({ inv: "INV-LINE", title: `The oracle reads the formula of “${u.key}”`, expected: "Every formula on the stage can be recomputed.", actual: `The formula could not be parsed (${u.error}); its figures are not checked.`, verdict: "couldn't tell", details: { evidence: u } });

  // ── the bids, as the stage stores them ──
  const pdata: any[] = Array.isArray(schema.data?.participants_data) ? schema.data.participants_data : [];
  const inlineData: Record<string, any[]> = st?.sheets?.inline_components?.data ?? {};
  const globalData: Record<string, any> = st?.sheets?.global_price_components?.global_data ?? {};
  const submittedBy = new Map((opts.submitted ?? []).map((s) => [s.companyUuid, s]));
  const nameOf = (co: string) => submittedBy.get(co)?.label ?? pdata.find((p) => p.key === co)?.label ?? co;
  const bids: BidView[] = [];
  for (const [co, rowsRaw] of Object.entries(inlineData)) {
    const rows = new Map<string, any>();
    const tpOrder: string[] = [];
    for (const r of Array.isArray(rowsRaw) ? rowsRaw : []) {
      const tp = r?.product?.trade_product_uuid;
      if (!tp) continue;
      rows.set(tp, r);
      tpOrder.push(tp);
    }
    const p = pdata.find((x) => x.key === co);
    const stored: BidInput = { lines: tpOrder.map((tp) => rowInputs(rows.get(tp), t)), global: globalInputs(globalData[co], t) };
    bids.push({ companyUuid: co, label: nameOf(co), bidUuid: p?.sheet_uuid, status: p?.bid_status, surrogate: p?.is_surrogate_bid, rows, global: globalData[co] ?? {}, tpOrder, stored });
  }
  const live = bids.filter((b) => !b.status || ["active", "selected", "requested"].includes(b.status));

  // INV-COUNT
  const bidCount = Number(st?.bid_count ?? schema.data?.bid_count);
  if (Number.isFinite(bidCount)) {
    push({
      inv: "INV-COUNT", title: "The stage's bid count matches the bids it lists", expected: `${live.length} bid(s) are listed, so the count says ${live.length}.`,
      actual: `The count says ${bidCount}; ${bids.length} bid(s) are listed (${live.length} live).`, verdict: bidCount === live.length ? "passed" : "failed",
      details: { where: "GET /trade/:id → bid_count; sheets.inline_components.data", app: String(bidCount), oracle: String(live.length) },
    });
  }

  // ── per bid ──
  const oracleBy = new Map<string, ReturnType<typeof computeBid>>();
  for (const b of live) {
    const calc = computeBid(t, b.stored);
    oracleBy.set(b.companyUuid, calc);
    const who = b.label;
    for (const issue of calc.issues) push({ inv: "INV-LINE", title: `${who}: the oracle's own reading of the formulas`, expected: "Every formula can be evaluated on the stored inputs.", actual: issue, verdict: "couldn't tell" });

    // INV-ECHO
    const sub = submittedBy.get(b.companyUuid);
    if (sub) {
      const diffs: string[] = [];
      sub.input.lines.forEach((ln, i) => {
        const stored = b.stored.lines[i] ?? {};
        for (const [k, v] of Object.entries(ln)) {
          if (v === undefined) continue;
          const want = Dec.tryOf(v);
          const got = Dec.tryOf(stored[k]);
          if (want && (!got || !got.eq(want))) diffs.push(`line ${i + 1} ${k}: sent ${want.toString()}, stored ${stored[k] ?? "nothing"}`);
        }
      });
      for (const [k, v] of Object.entries(sub.input.global ?? {})) {
        const want = Dec.tryOf(v);
        const got = Dec.tryOf(b.stored.global?.[k]);
        if (want && (!got || !got.eq(want))) diffs.push(`${k}: sent ${want.toString()}, stored ${b.stored.global?.[k] ?? "nothing"}`);
      }
      push({
        inv: "INV-ECHO", title: `${who}: the quote is stored exactly as entered`, expected: "Every unit price, quantity, tax rate and charge reads back exactly as it was entered.",
        actual: diffs.length ? `Different: ${diffs.slice(0, 6).join("; ")}.` : `All ${sub.input.lines.length} line(s) and the bid-level inputs read back exactly.`,
        verdict: diffs.length ? "failed" : "passed", details: { where: "GET /trade/:id → sheets", inputs: sub.input, evidence: { stored: b.stored } },
      });
    }

    // INV-BID: every global formula value in the stage read + quote details
    const globalsShown = b.global ?? {};
    for (const w of t.global.filter((x) => x.tree)) {
      const exact = calc.global[w.key];
      const shown = val(globalsShown[w.key]);
      if (exact === undefined) continue;
      const f = sameFigure(shown, exact, Math.max(dp, 6));
      push({
        inv: "INV-BID", title: `${who}: ${w.name} on the comparison`, expected: `${w.name} = ${w.formula} = ${money(exact)} (recomputed from the stored inputs).`,
        actual: shown === undefined || shown === null ? `${w.name} is not shown.` : `The comparison shows ${money(Dec.tryOf(shown))}${f.ok ? "" : ` — off by ${f.diff}`}.`,
        verdict: shown === undefined || shown === null ? "couldn't tell" : f.ok ? "passed" : "failed",
        details: { where: "GET /trade/:id → sheets.global_price_components.global_data", inputs: b.stored, app: String(shown), oracle: f.expected, oracleRounded: f.expectedRounded, diff: f.diff, tolerance: f.tolerance },
      });
    }
  }

  // ── per bid, the bid's own record (GET /bids/:id) and the stored line values (SELECT) ──
  for (const b of live) {
    if (!b.bidUuid) continue;
    const calc = oracleBy.get(b.companyUuid)!;
    const who = b.label;
    const r = await read(`bid:${b.companyUuid}`, B, `/bids/${b.bidUuid}`);
    const qd = await read(`quote:${b.companyUuid}`, B, `/v1/trade/${trade}/quote_details/${b.bidUuid}`);
    const gross = calc.global.gross_total;
    // INV-SAME: the bid total in every place
    if (gross) {
      const places: [string, unknown][] = [
        ["comparison (stage read)", val(b.global?.gross_total)],
        ["quote details", val(qd.data?.global_data?.[b.companyUuid]?.gross_total)],
        ["bid record: other_details.gross_total", r.data?.other_details?.gross_total],
        ["bid record: price_breakup.gross_total", r.data?.price_breakup?.gross_total],
        ["bid record: price_breakup.total_landed_amount", r.data?.price_breakup?.total_landed_amount],
        // single-product stages rank on the per-unit landed price (bid.rb:872-893), so rank_price is a total only on multi-line stages
        ...(b.tpOrder.length > 1 ? ([["bid record: rank_price", r.data?.rank_price]] as [string, unknown][]) : []),
      ];
      const bad = places.filter(([, v]) => v !== undefined && v !== null && !sameFigure(v, gross, Math.max(dp, 6)).ok);
      const seen = places.filter(([, v]) => v !== undefined && v !== null);
      push({
        inv: "INV-SAME", title: `${who}: the bid total is the same everywhere`, expected: `${money(gross)} in each of: ${places.map(([p]) => p).join(", ")}.`,
        actual: !seen.length ? "None of the places could be read." : bad.length ? `Different: ${bad.map(([p, v]) => `${p} shows ${v}`).join("; ")}.` : `All ${seen.length} places show ${money(gross)}.`,
        verdict: !seen.length ? "couldn't tell" : bad.length ? "failed" : "passed",
        details: { where: "GET /trade/:id, GET /v1/trade/:id/quote_details/:bid, GET /bids/:id", oracle: gross.toString(), evidence: Object.fromEntries(places) },
      });
    }
    if (!r.ok) continue;
    const bps: any[] = Array.isArray(r.data?.bid_products) ? r.data.bid_products : [];
    // INV-AMOUNT
    const amount = Dec.sum(b.stored.lines.map((l) => (Dec.tryOf(l.price) ?? Dec.ZERO).mul(Dec.tryOf(l.participant_quantity ?? l.creator_quantity) ?? Dec.ZERO)));
    const fa = sameFigure(r.data?.amount, amount, 6);
    push({
      inv: "INV-AMOUNT", title: `${who}: the bid's amount before tax`, expected: `Σ unit price × quantity = ${money(amount)}.`, actual: `The bid record shows ${r.data?.amount ?? "nothing"}.`,
      verdict: r.data?.amount === undefined ? "couldn't tell" : fa.ok ? "passed" : "failed", details: { where: "GET /bids/:id → amount", app: String(r.data?.amount), oracle: fa.expected, diff: fa.diff },
    });
    // INV-LINE (total_amount through the price breakup) + INV-BREAKUP
    const tw = t.inline.find((w) => w.key === "total_amount" && w.tree);
    for (const [i, tp] of b.tpOrder.entries()) {
      const row = b.rows.get(tp);
      const bpUuid = row?.product?.bid_trade_product_uuid;
      if (Dec.tryOf(b.stored.lines[i]?.price) === undefined) continue; // an unquoted line (e.g. a ₹0 cell the app skipped)
      const bp = bpUuid ? bps.find((x) => x.uuid === bpUuid) : bps.length === b.tpOrder.length ? bps[i] : undefined;
      const exact = calc.lines[i]?.total_amount;
      if (tw && exact) {
        const shown = bp?.price_breakup?.total_landed_amount;
        const f = sameFigure(shown, exact, Math.max(dp, 6));
        push({
          inv: "INV-LINE", title: `${who}: line ${i + 1} total`, expected: `${tw.formula} = ${money(exact)} (unit price ${plain(Dec.tryOf(b.stored.lines[i]?.price))}, quantity ${plain(Dec.tryOf(b.stored.lines[i]?.participant_quantity ?? b.stored.lines[i]?.creator_quantity))}).`,
          actual: shown === undefined ? "The line total is not in the bid record." : `The bid record shows ${shown}${f.ok ? "" : ` — off by ${f.diff}`}.`,
          verdict: shown === undefined ? "couldn't tell" : f.ok ? "passed" : "failed",
          details: { where: "GET /bids/:id → bid_products[].price_breakup.total_landed_amount", inputs: b.stored.lines[i], app: String(shown), oracle: f.expected, oracleRounded: f.expectedRounded, diff: f.diff, tolerance: f.tolerance },
        });
      }
      const price = Dec.tryOf(b.stored.lines[i]?.price);
      const gst = Dec.tryOf(b.stored.lines[i]?.gst) ?? Dec.ZERO;
      if (price && bp?.price_breakup && t.inline.some((w) => w.key === "gst")) {
        const gstUnit = price.mul(gst).div(100);
        const landed = price.add(gstUnit);
        const okG = sameFigure(bp.price_breakup.gst_tax_amount, gstUnit, 6).ok;
        const okL = sameFigure(bp.price_breakup.landed_cost, landed, 6).ok;
        push({
          inv: "INV-BREAKUP", title: `${who}: line ${i + 1} tax per unit and landed cost`, expected: `GST per unit = ${plain(price)} × ${plain(gst)}% = ${plain(gstUnit)}; landed cost per unit = ${plain(landed)} (no freight or discount on this line).`,
          actual: `The breakup shows GST per unit ${bp.price_breakup.gst_tax_amount}, landed cost ${bp.price_breakup.landed_cost}.`, verdict: okG && okL ? "passed" : "failed",
          details: { where: "GET /bids/:id → bid_products[].price_breakup", evidence: bp.price_breakup },
        });
      }
    }
    // INV-LINE through the stored line values (every inline formula) — SELECT, our own rows only
    if (opts.db !== false) {
      const bid = decodeId(b.bidUuid);
      const rows = bid ? await db("select btp.id, btp.trade_product_id, btp.other_details from bids b join bid_trade_products btp on btp.id = any(b.bid_product_ids) where b.id = $1", [bid]) : undefined;
      if (rows?.length) {
        for (const w of t.inline.filter((x) => x.tree && x.key !== "total_amount")) {
          const bad: string[] = [];
          let seen = 0;
          for (const [i, tp] of b.tpOrder.entries()) {
            const tpId = decodeId(tp);
            const dbRow = rows.find((x) => Number(x.trade_product_id) === tpId);
            const stored = dbRow?.other_details?.[w.key];
            const exact = calc.lines[i]?.[w.key];
            if (stored === undefined || exact === undefined) continue;
            seen++;
            const f = sameFigure(stored, exact, Math.max(dp, 6));
            if (!f.ok) bad.push(`line ${i + 1}: stored ${stored}, expected ${exact.toString()}`);
          }
          if (seen) push({
            inv: "INV-LINE", title: `${who}: ${w.name} on every line`, expected: `${w.formula}, recomputed per line.`, actual: bad.length ? bad.join("; ") : `All ${seen} line value(s) agree.`,
            verdict: bad.length ? "failed" : "passed", details: { where: "SELECT bid_trade_products.other_details (own rows)", evidence: { formula: w.formula } },
          });
        }
      }
    }
    // INV-SAV-LINE per vendor line (quote details carry this vendor's own line savings)
    const qrows: any[] = qd.data?.inline_data?.[b.companyUuid] ?? [];
    for (const [i, qrow] of qrows.entries()) {
      for (const s of qrow?.savings_with_strategy?.savings ?? []) {
        const tp = qrow?.product?.trade_product_uuid;
        const ref = lineReference(st, tp, s.reference_strategy_key);
        const price = Dec.tryOf(val(qrow?.price));
        if (!ref || !price || s.reference_on_key_attribute !== "price") continue;
        const exp = lineSaving(ref, price, order);
        const okA = sameFigure(s.savings_amount?.value, exp.amount, 4, 1).ok;
        const okP = exp.percent ? sameFigure(s.savings_percent?.value, exp.percent, 2, 1).ok : s.savings_percent?.value == null;
        push({
          inv: "INV-SAV-LINE", title: `${who}: line ${i + 1} savings against ${s.reference_strategy_key.replace(/_/g, " ")}`,
          expected: `Reference ${plain(ref)} − unit price ${plain(price)} = ${plain(exp.amount)} per unit (${exp.percent ? `${exp.percent.toFixed(2)}%` : "no %"}).`,
          actual: `The quote shows ${s.savings_amount?.value} per unit (${s.savings_percent?.value}%).`, verdict: okA && okP ? "passed" : "failed",
          details: { where: "GET /v1/trade/:id/quote_details/:bid → inline_data[].savings_with_strategy", evidence: s },
        });
      }
    }
  }

  // ── the round: L1, best, ranks ──
  const tps = [...new Set(live.flatMap((b) => b.tpOrder))];
  const priceOf = (b: BidView, tp: string) => Dec.tryOf(val(b.rows.get(tp)?.price));
  const lineTotalOf = (b: BidView, tp: string) => oracleBy.get(b.companyUuid)?.lines[b.tpOrder.indexOf(tp)]?.total_amount;
  const l1 = schema.data?.l1_prices?.line_item_based ?? {};
  for (const [li, tp] of tps.entries()) {
    const quoted = live.filter((b) => priceOf(b, tp) && priceOf(b, tp)!.gt(0));
    if (!quoted.length) continue;
    const best = quoted.reduce((m, b) => (order === "buy" ? (priceOf(b, tp)!.lt(priceOf(m, tp)!) ? b : m) : priceOf(b, tp)!.gt(priceOf(m, tp)!) ? b : m));
    const bestPrice = priceOf(best, tp)!;
    const atBest = quoted.filter((b) => priceOf(b, tp)!.eq(bestPrice));
    // INV-L1
    const shown = l1[tp];
    if (schema.ok) {
      const okP = shown && sameFigure(shown.price, bestPrice, 6).ok;
      const totals = atBest.map((b) => lineTotalOf(b, tp)).filter(Boolean) as Dec[];
      const okT = shown && (shown.total_amount === undefined || totals.some((x) => sameFigure(shown.total_amount, x, 6).ok));
      push({
        inv: "INV-L1", title: `Line ${li + 1}: the L1 price on the comparison`, expected: `The lowest unit price is ${plain(bestPrice)} (${atBest.map((b) => b.label).join(" and ")}); its line total ${totals.map((x) => plain(x)).join(" / ")}.`,
        actual: shown ? `L1 shows unit price ${shown.price}, line total ${shown.total_amount}.` : "No L1 price is shown for this line.", verdict: !shown ? "failed" : okP && okT ? "passed" : "failed",
        details: { where: "GET /v1/trade/:id/schema?l1_prices=true → l1_prices.line_item_based", evidence: { shown, quoted: quoted.map((b) => [b.label, priceOf(b, tp)?.toString()]) } },
      });
    }
    // INV-L1DATA (ranking widget = price for line ranking by default)
    const ld = l1d.data?.[tp];
    if (l1d.ok && ld) {
      const okP = sameFigure(ld.price, bestPrice, 6).ok;
      const qtyOk = atBest.some((b) => sameFigure(ld.participant_quantity, Dec.tryOf(val(b.rows.get(tp)?.participant_quantity)) ?? Dec.ZERO, 6).ok);
      push({
        inv: "INV-L1DATA", title: `Line ${li + 1}: the L1 data names the lowest-price quote`, expected: `Unit price ${plain(bestPrice)} with that quote's quantity.`,
        actual: `L1 data shows unit price ${ld.price}, quantity ${ld.participant_quantity}.`, verdict: okP && qtyOk ? "passed" : "failed",
        details: { where: "GET /v1/trade/:id/l1_data_for_event", evidence: ld },
      });
    }
    // INV-BEST (line)
    const idata = ind.data?.auction_identifiers_data ?? {};
    if (ind.ok && Object.keys(idata).length) {
      const wrong: string[] = [];
      for (const b of quoted) {
        const cell = idata[b.companyUuid]?.inline?.[tp];
        if (!cell) {
          wrong.push(`${b.label} is not listed`);
          continue;
        }
        const isBest = priceOf(b, tp)!.eq(bestPrice);
        if (typeof cell.rank?.best_bidder === "boolean" && cell.rank.best_bidder !== isBest) wrong.push(`${b.label} is marked ${cell.rank.best_bidder ? "best" : "not best"} at ${plain(priceOf(b, tp))}`);
        if (cell.best_price?.value !== undefined && !sameFigure(cell.best_price.value, bestPrice, 6).ok) wrong.push(`${b.label}'s view of the best price is ${cell.best_price.value}`);
      }
      push({
        inv: "INV-BEST", title: `Line ${li + 1}: best-bidder flags and best price`, expected: `${atBest.map((b) => b.label).join(" and ")} marked best at ${plain(bestPrice)}; nobody else.`,
        actual: wrong.length ? wrong.join("; ") + "." : "Every flag and best price agrees.", verdict: wrong.length ? "failed" : "passed",
        details: { where: "GET /v1/trade/:id/event_indicators → auction_identifiers_data[co].inline[tp]", evidence: Object.fromEntries(quoted.map((b) => [b.label, idata[b.companyUuid]?.inline?.[tp]])) },
      });
      // INV-RANK (line), when ranks are shown
      const shownRanks = quoted.map((b) => [b, Number(String(idata[b.companyUuid]?.inline?.[tp]?.rank?.value ?? "").replace(/\D/g, ""))] as const).filter(([, n]) => Number.isFinite(n) && n > 0);
      if (shownRanks.length) {
        const exp = procolRanks(new Map(quoted.map((b) => [b.companyUuid, priceOf(b, tp)!])), order);
        const bad = shownRanks.filter(([b, n]) => exp.get(b.companyUuid) !== n);
        push({
          inv: "INV-RANK", title: `Line ${li + 1}: the ranks shown`, expected: quoted.map((b) => `${b.label} L${exp.get(b.companyUuid)}`).join(", ") + " (dense rank; a tie at the best moves every rank down one).",
          actual: shownRanks.map(([b, n]) => `${b.label} L${n}`).join(", ") + ".", verdict: bad.length ? "failed" : "passed",
          details: { where: "event_indicators inline rank", evidence: Object.fromEntries(shownRanks.map(([b, n]) => [b.label, n])) },
        });
      }
    }
  }
  // INV-BEST / INV-RANK on the bid total
  const totals = new Map(live.map((b) => [b.companyUuid, oracleBy.get(b.companyUuid)?.global.gross_total]).filter(([, v]) => v) as [string, Dec][]);
  const idata = ind.data?.auction_identifiers_data ?? {};
  if (totals.size && ind.ok && Object.keys(idata).length) {
    const bestTotal = [...totals.values()].reduce((m, x) => (order === "buy" ? (x.lt(m) ? x : m) : x.gt(m) ? x : m));
    const wrong = live.filter((b) => idata[b.companyUuid]?.global?.best_price?.value !== undefined && !sameFigure(idata[b.companyUuid].global.best_price.value, bestTotal, 6).ok);
    push({
      inv: "INV-BEST", title: "Best bid total on the comparison", expected: `The best bid total is ${money(bestTotal)}.`,
      actual: wrong.length ? wrong.map((b) => `${b.label} sees ${idata[b.companyUuid].global.best_price.value}`).join("; ") : `Every listing shows ${money(bestTotal)}.`,
      verdict: wrong.length ? "failed" : "passed", details: { where: "event_indicators global.best_price", evidence: Object.fromEntries(live.map((b) => [b.label, idata[b.companyUuid]?.global])) },
    });
    const shownRanks = live.map((b) => [b, Number(String(idata[b.companyUuid]?.global?.rank?.value ?? "").replace(/\D/g, ""))] as const).filter(([, n]) => Number.isFinite(n) && n > 0);
    if (shownRanks.length) {
      const exp = procolRanks(totals, order);
      const bad = shownRanks.filter(([b, n]) => exp.get(b.companyUuid) !== n);
      push({
        inv: "INV-RANK", title: "Overall ranks on the bid total", expected: live.map((b) => `${b.label} L${exp.get(b.companyUuid)}`).join(", ") + ".",
        actual: shownRanks.map(([b, n]) => `${b.label} L${n}`).join(", ") + ".", verdict: bad.length ? "failed" : "passed",
        details: { where: "event_indicators global.rank", evidence: Object.fromEntries(shownRanks.map(([b, n]) => [b.label, n])) },
      });
    }
  }

  // ── savings ──
  const sc = st?.savings_configuration;
  if (sc?.savings_comparison_on === "line_item_based" && live.length) {
    let sumAmt = Dec.ZERO;
    let sumRef = Dec.ZERO;
    let strategy: string | undefined;
    const perLine: string[] = [];
    let complete = true;
    for (const [li, tp] of tps.entries()) {
      const refs: any[] = sc.line_item_reference_prices?.[tp] ?? [];
      const ref0 = refs.find((r) => r.reference_on_key_attribute === "price" && Dec.tryOf(r.value));
      const quoted = live.filter((b) => priceOf(b, tp) && priceOf(b, tp)!.gt(0));
      if (!ref0 || !quoted.length) continue;
      strategy = ref0.reference_strategy_key;
      const ref = Dec.of(ref0.value);
      const best = quoted.reduce((m, b) => (priceOf(b, tp)!.lt(priceOf(m, tp)!) ? b : m));
      const s = lineSaving(ref, priceOf(best, tp)!, order);
      const qty = Dec.tryOf(val(best.rows.get(tp)?.[strategy === "default" ? "creator_quantity" : "participant_quantity"])) ?? Dec.ZERO;
      sumAmt = sumAmt.add(s.amountShown.mul(qty));
      sumRef = sumRef.add(ref.mul(qty));
      // INV-SAV-LINE on the line savings endpoint
      const shown = (lineSav.data?.[tp] ?? []).find((x: any) => x.reference_strategy_key === strategy);
      if (!shown) complete = false;
      const okA = shown && sameFigure(shown.savings_amount?.value, s.amount, 4, 1).ok;
      const okP = shown && (s.percent ? sameFigure(shown.savings_percent?.value, s.percent, 2, 1).ok : true);
      perLine.push(`line ${li + 1}: ${shown ? `${shown.savings_amount?.value} (${shown.savings_percent?.value}%)` : "none"} vs ${s.amount.toString()} (${s.percent?.toFixed(2) ?? "—"}%)`);
      push({
        inv: "INV-SAV-LINE", title: `Line ${li + 1}: best-price savings against ${String(strategy).replace(/_/g, " ")}`,
        expected: `Reference ${plain(ref)} − best unit price ${plain(priceOf(best, tp))} = ${plain(s.amount)} per unit, ${s.percent?.toFixed(2) ?? "no"}%.`,
        actual: shown ? `The savings read shows ${shown.savings_amount?.value} per unit, ${shown.savings_percent?.value}%.` : "No saving is shown for this line.",
        verdict: !lineSav.ok ? "couldn't tell" : okA && okP ? "passed" : "failed", details: { where: "GET /v1/trade/:id/best_line_wise_savings", evidence: shown },
      });
    }
    if (strategy && !sumRef.isZero()) {
      const pct = sumAmt.div(sumRef).mul(100);
      const shown = (agg.data?.savings ?? []).find((x: any) => x.reference_strategy_key === strategy);
      const inStage = (st?.aggregate_savings ?? []).find((x: any) => x.reference_strategy_key === strategy);
      const okA = shown && sameFigure(shown.savings_amount?.value, sumAmt, 2, 1).ok && sameFigure(shown.reference?.value, sumRef, 2, 1).ok && sameFigure(shown.savings_percent?.value, pct, 2, 1).ok;
      push({
        inv: "INV-SAV-AGG", title: `Total savings against ${strategy.replace(/_/g, " ")}`,
        expected: `Σ savings × quantity = ${money(sumAmt, 2)} on a reference of ${money(sumRef, 2)} = ${pct.toFixed(2)}%.`,
        actual: shown ? `The savings card shows ${shown.savings_amount?.value} on ${shown.reference?.value} = ${shown.savings_percent?.value}%.` : `No total saving is shown (${said(agg)}).`,
        verdict: !agg.ok ? "couldn't tell" : okA ? "passed" : "failed", details: { where: "GET /v1/trade/:id/aggregate_savings", evidence: { shown, perLine } },
      });
      if (inStage && shown) {
        const same = sameFigure(inStage.savings_amount?.value, Dec.of(shown.savings_amount.value), 2, 1).ok && sameFigure(inStage.savings_percent?.value, Dec.of(shown.savings_percent.value), 2, 1).ok;
        push({
          inv: "INV-SAV-AGG", title: "Total savings: the stage page and the savings card agree", expected: "The same saving amount and percentage in both places (allowing for the places shown).",
          actual: `Stage page: ${inStage.savings_amount?.value} (${inStage.savings_percent?.value}%); savings card: ${shown.savings_amount?.value} (${shown.savings_percent?.value}%).`, verdict: same ? "passed" : "failed",
          details: { where: "GET /trade/:id → aggregate_savings vs GET /v1/trade/:id/aggregate_savings", evidence: { inStage, shown } },
        });
      }
    }
    void complete;
  }

  // ── sanity over everything read ──
  const insane: string[] = [];
  const scan = (x: any, path: string, depth: number) => {
    if (depth > 12 || insane.length > 20) return;
    if (Array.isArray(x)) x.forEach((y, i) => scan(y, `${path}[${i}]`, depth + 1));
    else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) scan(y, path ? `${path}.${k}` : k, depth + 1);
    else if (typeof x === "string" && /^-?(NaN|Infinity)$/i.test(x.trim())) insane.push(`${path} = ${x}`);
    else if (typeof x === "number" && !Number.isFinite(x)) insane.push(`${path} = ${x}`);
  };
  for (const [k, r] of [["stage", show], ["comparison", schema], ["indicators", ind], ["aggregate_savings", agg], ["line_savings", lineSav], ["l1_data", l1d]] as const) scan(r.data, k, 0);
  const negatives = live.filter((b) => oracleBy.get(b.companyUuid)?.global.gross_total?.sign() === -1 || Dec.tryOf(val(b.global?.gross_total))?.sign() === -1);
  push({
    inv: "INV-SANE", title: "No impossible numbers anywhere", expected: "No NaN or Infinity in any figure, and no negative bid total.",
    actual: insane.length || negatives.length ? [...insane, ...negatives.map((b) => `${b.label}'s total is negative`)].slice(0, 8).join("; ") : "None found in the stage, comparison, indicators, savings and L1 reads.",
    verdict: insane.length || negatives.length ? "failed" : "passed", details: { evidence: insane },
  });

  // ── vendor isolation ──
  const isAuction = st?.rfx_mode === "auction";
  for (const v of apis.vendors ?? []) {
    const others = live.filter((b) => b.companyUuid !== v.companyUuid);
    const own = live.find((b) => b.companyUuid === v.companyUuid);
    const ownNums = new Set<string>();
    if (own) {
      for (const [i] of own.tpOrder.entries()) for (const x of Object.values(oracleBy.get(own.companyUuid)?.lines[i] ?? {})) ownNums.add(x.toFixed(2));
      for (const x of Object.values(oracleBy.get(own.companyUuid)?.global ?? {})) ownNums.add(x.toFixed(2));
    }
    const nums = new Map<string, string>();
    const strs = new Map<string, string>();
    for (const o of others) {
      strs.set(o.companyUuid, `${o.label}'s company id`);
      const nm = pdata.find((p) => p.key === o.companyUuid)?.label;
      if (nm) strs.set(nm, `${o.label}'s company name`);
      const calc = oracleBy.get(o.companyUuid);
      for (const [i, tp] of o.tpOrder.entries()) {
        const p = priceOf(o, tp);
        if (p && !ownNums.has(p.toFixed(2))) nums.set(p.toFixed(2), `${o.label}'s unit price ${plain(p)}`);
        const lt = calc?.lines[i]?.total_amount;
        if (lt && !ownNums.has(lt.toFixed(2))) nums.set(lt.toFixed(2), `${o.label}'s line total ${plain(lt)}`);
      }
      const g = calc?.global.gross_total;
      if (g && !ownNums.has(g.toFixed(2))) nums.set(g.toFixed(2), `${o.label}'s bid total ${plain(g)}`);
    }
    const hits: string[] = [];
    let readable = 0;
    for (const [where, path] of [["the stage", `/trade/${trade}?response_type=template&additional_fields=order_details`], ["the stage's page data", `/v1/trade/${trade}/schema?response_type=template&additional_fields=order_details`]] as const) {
      const r = await read(`vendor:${v.label}:${where}`, v.api, path);
      if (!r.ok) continue;
      readable++;
      const walk = (x: any, p: string, depth: number) => {
        if (depth > 14 || hits.length > 30) return;
        if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${p}[${i}]`, depth + 1));
        else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) walk(y, p ? `${p}.${k}` : k, depth + 1);
        else if (typeof x === "number" || (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x.trim()))) {
          const key = Number(x).toFixed(2);
          const allowedBest = isAuction && /(^|\.)layers(\[\d+\])?\.best_prices?(\[\d+\]\.price)?$/.test(p); // an auction may publish the best price
          if (nums.has(key) && !allowedBest && !/^trade_config\./.test(p) && !/(_id|uuid|^id|\.id|count|time|_at|epoch|stamp|no|number|order|quantity|precision|priority)$/i.test(p)) hits.push(`${nums.get(key)} (${where}: ${p})`);
        } else if (typeof x === "string") for (const [s, what] of strs) if (x.includes(s)) hits.push(`${what} (${where}: ${p})`);
      };
      walk(r.data, "", 0);
    }
    push({
      inv: "INV-ISOLATION", title: `${v.label}: their own views show nothing of the other vendors`, expected: "No other vendor's name, company id, unit price, line total or bid total in what this vendor's app receives.",
      actual: !readable ? "The vendor's views could not be read." : hits.length ? `Visible: ${[...new Set(hits)].slice(0, 6).join("; ")}.` : "Nothing of another vendor was found.",
      verdict: !readable ? "couldn't tell" : hits.length ? "failed" : "passed", details: { evidence: { hits: hits.slice(0, 20), lookedFor: [...nums.values(), ...strs.values()] } },
    });
  }

  if (opts.report) {
    const { checkComparisonReport } = await import("./reports.js");
    for (const c of await checkComparisonReport(trade, B, live.map((b) => ({ label: b.label, companyUuid: b.companyUuid, name: pdata.find((p) => p.key === b.companyUuid)?.label, prices: b.tpOrder.map((tp) => priceOf(b, tp)), lineTotals: b.tpOrder.map((tp) => lineTotalOf(b, tp)), gross: oracleBy.get(b.companyUuid)?.global.gross_total })))) push(c);
  }

  const rep = finish(trade, checks, reads);
  rep.template = { inline: t.inline.filter((w) => w.formula).map((w) => `${w.key} = ${w.formula}`), global: t.global.filter((w) => w.formula).map((w) => `${w.key} = ${w.formula}`), precision: Number.isFinite(precision) ? precision : undefined };
  return rep;
}

function finish(trade: string, checks: IntegrityCheck[], reads: IntegrityReport["reads"]): IntegrityReport {
  const counts: Record<Verdict, number> = { passed: 0, failed: 0, "couldn't tell": 0, "not run": 0 };
  for (const c of checks) counts[c.verdict]++;
  return { tradeUuid: trade, checks, counts, reads };
}

/** The line reference for a strategy (stage savings configuration). */
function lineReference(st: any, tp: string | undefined, strategy: string): Dec | undefined {
  if (!tp) return undefined;
  const refs: any[] = st?.savings_configuration?.line_item_reference_prices?.[tp] ?? [];
  return Dec.tryOf(refs.find((r) => r.reference_strategy_key === strategy)?.value);
}

/**
 * A line saving as the backend computes it (savings_calculator.rb:53-72):
 * buy: reference − price; the per-unit amount is shown after round(6) and a
 * TRUNCATION to 4 places (utils.rb:623-627, string.rb truncatize_upto_two_decimals);
 * percent = amount / reference × 100, rounded to 2.
 */
export function lineSaving(ref: Dec, price: Dec, order: "buy" | "sell" = "buy"): { amount: Dec; amountShown: Dec; percent?: Dec } {
  const amount = order === "buy" ? ref.sub(price) : price.sub(ref);
  const amountShown = amount.round(6, "half_up").round(4, "truncate");
  return { amount, amountShown, percent: ref.isZero() ? undefined : amount.div(ref).mul(100) };
}
