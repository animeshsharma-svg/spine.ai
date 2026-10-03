/**
 * THE INDEPENDENT CALCULATOR — what every bid figure SHOULD be.
 *
 * Given only what a run submitted (each line's inputs: quantity, unit price,
 * tax %, custom charges; the bid's global inputs: freight, discount…) and the
 * stage's own widget definitions (formulas + precision as the app stored them
 * for this company), it recomputes:
 *
 *   per line   every inline formula widget (total_amount, landed prices, tax amounts…)
 *   per bid    every global formula widget (gross_total, sub totals, tax on totals…)
 *   per round  the rank of each bid (dense, ties at the best shift everyone +1),
 *              the L1 bid / L1 price per line, savings against a reference,
 *              an award's per-vendor and total value.
 *
 * Arithmetic is exact (decimal.ts). Rounding is applied where the backend
 * applies it (see numbers.md §Rounding): the oracle keeps the exact value AND
 * the value rounded to the widget's precision, and the invariants accept the
 * app's figure if it equals either within one unit of the last place shown.
 *
 * Nothing here talks to Procol. Everything is unit-tested in
 * scripts/integrity-unit-tests.ts.
 */
import { Dec } from "./decimal.js";
import { evaluate, parseFormula, references, FormulaDivZero, type Node, type Scope, type Value } from "./formula.js";

export interface WidgetDef {
  key: string;
  name: string;
  inputType: string;
  scope: "inline" | "global";
  formula?: string;
  tree?: Node;
  precision?: number;
  /** a vendor fills it (field_type participant) */
  participant: boolean;
  /** percent_and_amount widgets: the formula is the base that the % applies to */
  percentAndAmount?: boolean;
}

export interface Template {
  inline: WidgetDef[];
  global: WidgetDef[];
  /** formula widgets that could not be parsed — reported, never guessed */
  unparsed: { key: string; formula: string; error: string }[];
}

/** Read a stage's / template's `widgets` block (inline_components, global_price_components). */
export function templateFromWidgets(widgets: any): Template {
  const unparsed: Template["unparsed"] = [];
  const read = (list: any[], scope: "inline" | "global"): WidgetDef[] =>
    (Array.isArray(list) ? list : []).map((w: any) => {
      const cfg = w?.configuration ?? {};
      const formula: string | undefined = typeof cfg.formula === "string" && cfg.formula.trim() ? cfg.formula.trim() : undefined;
      const isFormula = formula !== undefined && (w.input_type === "formula" || cfg.field_type === "formula" || w.input_type === "percent_and_amount" || w.input_type === "number");
      let tree: Node | undefined;
      if (isFormula && formula) {
        try {
          tree = parseFormula(formula);
        } catch (e) {
          unparsed.push({ key: String(w.key_attribute), formula, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const p = cfg.precision;
      return {
        key: String(w.key_attribute),
        name: String(w.name ?? w.key_attribute),
        inputType: String(w.input_type ?? ""),
        scope,
        ...(isFormula ? { formula, tree } : {}),
        ...(typeof p === "number" || (typeof p === "string" && p !== "") ? { precision: Number(p) } : {}),
        participant: cfg.field_type === "participant",
        ...(w.input_type === "percent_and_amount" ? { percentAndAmount: true } : {}),
      };
    });
  return { inline: read(widgets?.inline_components, "inline"), global: read(widgets?.global_price_components, "global"), unparsed };
}

/** What a bid submitted. Line values are keyed by widget key_attribute. */
export interface BidInput {
  /** one entry per line item, in line order: creator_quantity, participant_quantity, price, gst, *_custom… */
  lines: Array<Record<string, number | string | undefined>>;
  /** global participant inputs: freight_charges_…_custom, tax_custom, discount… */
  global?: Record<string, number | string | undefined>;
  /** percent_and_amount widgets: the % the vendor chose (the amount is base × % / 100) */
  percents?: Record<string, number | string>;
  /** a foreign-currency bid: rate to the stage's base currency (base = bid × rate) */
  rateInBase?: number | string;
}

export interface BidCalc {
  /** exact values per line: inputs (as Dec) + every inline formula */
  lines: Record<string, Dec>[];
  /** exact values: global inputs + every global formula */
  global: Record<string, Dec>;
  /** problems the oracle found in the inputs or formulas themselves (division by zero, unknown names, cycles) */
  issues: string[];
}

function toDecMap(o: Record<string, number | string | undefined> | undefined): Record<string, Dec> {
  const out: Record<string, Dec> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    const d = Dec.tryOf(v);
    if (d) out[k] = d;
  }
  return out;
}

/** Order formula widgets so each one is computed after the widgets it reads (cycles reported). */
function order(ws: WidgetDef[], issues: string[]): WidgetDef[] {
  const byKey = new Map(ws.filter((w) => w.tree).map((w) => [w.key, w]));
  const done = new Set<string>();
  const out: WidgetDef[] = [];
  const visiting = new Set<string>();
  const visit = (w: WidgetDef) => {
    if (done.has(w.key)) return;
    if (visiting.has(w.key)) {
      issues.push(`formula cycle through ${w.key}`);
      return;
    }
    visiting.add(w.key);
    const refs = references(w.tree!);
    for (const r of [...refs.plain, ...refs.aggregated]) {
      const dep = byKey.get(r);
      if (dep && dep !== w) visit(dep);
    }
    visiting.delete(w.key);
    done.add(w.key);
    out.push(w);
  };
  for (const w of byKey.values()) visit(w);
  return out;
}

/**
 * Every figure of one bid, exactly. Inline formulas are computed per line;
 * global formulas see the bid's global inputs, the other global formulas and,
 * through SUM(), the inline columns. A global formula that names an inline
 * widget WITHOUT an aggregate (e.g. grand_total_custom = total_amount) sees
 * the first line's value — flagged as an issue, because that is ambiguous.
 */
export function computeBid(t: Template, input: BidInput): BidCalc {
  const issues: string[] = [];
  const inlineKeys = new Set(t.inline.map((w) => w.key));
  const globalVals: Record<string, Dec> = toDecMap(input.global);
  const lines: Record<string, Dec>[] = input.lines.map((l) => toDecMap(l));

  const inlineFormulas = order(t.inline, issues);
  for (const [i, row] of lines.entries()) {
    const scope: Scope = { get: (n) => row[n] ?? globalVals[n] };
    for (const w of inlineFormulas) {
      try {
        const v = evaluate(w.tree!, scope);
        row[w.key] = v instanceof Dec ? v : Dec.ZERO;
      } catch (e) {
        if (e instanceof FormulaDivZero) issues.push(`line ${i + 1}: ${w.name} divides by zero`);
        else issues.push(`line ${i + 1}: ${w.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const gscope: Scope = {
    get: (n) => {
      if (n in globalVals) return globalVals[n];
      if (inlineKeys.has(n)) {
        if (lines.length !== 1) issues.push(`a global formula reads the line column ${n} without SUM() — ambiguous over ${lines.length} lines`);
        return lines[0]?.[n];
      }
      return undefined;
    },
    column: (n) => lines.map((r) => r[n] as Value | undefined),
  };
  for (const w of order(t.global, issues)) {
    try {
      let v = evaluate(w.tree!, gscope);
      if (w.percentAndAmount) {
        const pct = Dec.tryOf(input.percents?.[w.key]);
        v = pct ? (v instanceof Dec ? v : Dec.ZERO).mul(pct) : Dec.tryOf(input.global?.[w.key]) ?? Dec.ZERO;
      }
      globalVals[w.key] = v instanceof Dec ? v : Dec.ZERO;
    } catch (e) {
      if (e instanceof FormulaDivZero) issues.push(`${w.name} divides by zero`);
      else issues.push(`${w.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { lines, global: globalVals, issues: [...new Set(issues)] };
}

/** The precision a widget's figure is shown/stored at (company override first, then the widget's own, then 2). */
export function precisionOf(w: WidgetDef | undefined, companyOverride?: number): number {
  if (companyOverride !== undefined && Number.isFinite(companyOverride)) return companyOverride;
  if (w?.precision !== undefined && Number.isFinite(w.precision)) return w.precision;
  return 2;
}

// ── ranks ──────────────────────────────────────────────────────────────────

/**
 * Procol's rank (bid_rank_helper.rb:208-221, rank_calculator.rb:8-31):
 * scores sorted ascending (descending for a sell/forward event), de-duplicated,
 * dense rank (equal scores share a rank, the next distinct score is +1), and
 * when MORE THAN ONE participant shares the best score every rank is shifted
 * +1 (tied leaders are both 2; nobody is 1).
 */
export function procolRanks(scores: Map<string, Dec>, order: "buy" | "sell" = "buy"): Map<string, number> {
  const distinct = [...new Map([...scores.values()].map((s) => [s.toString(), s])).values()].sort((a, b) => a.cmp(b));
  if (order === "sell") distinct.reverse();
  const best = distinct[0];
  const tiedAtBest = best ? [...scores.values()].filter((s) => s.eq(best)).length : 0;
  const shift = tiedAtBest > 1 ? 1 : 0;
  const out = new Map<string, number>();
  for (const [who, s] of scores) out.set(who, distinct.findIndex((d) => d.eq(s)) + 1 + shift);
  return out;
}

/** Who holds the best score (all of them, when tied). */
export function bestOf(scores: Map<string, Dec>, order: "buy" | "sell" = "buy"): { best?: Dec; who: string[] } {
  let best: Dec | undefined;
  for (const s of scores.values()) if (!best || (order === "buy" ? s.lt(best) : s.gt(best))) best = s;
  return { best, who: best ? [...scores].filter(([, s]) => s.eq(best!)).map(([w]) => w) : [] };
}

// ── savings ────────────────────────────────────────────────────────────────

/**
 * Savings against a reference (budget, last purchase price, ceiling…):
 * amount = reference − best (a buy event; best − reference for a sell event),
 * percent = amount / reference × 100. A zero reference has no percentage
 * (the app must not show Infinity / NaN).
 */
export function savings(reference: Dec, best: Dec, order: "buy" | "sell" = "buy"): { amount: Dec; percent?: Dec } {
  const amount = order === "buy" ? reference.sub(best) : best.sub(reference);
  return { amount, percent: reference.isZero() ? undefined : amount.div(reference).mul(100) };
}

// ── currency ───────────────────────────────────────────────────────────────

/** A foreign-currency amount in the stage's base currency (base = amount × rateInBase). */
export function toBase(amount: Dec, rateInBase: Dec | number | string): Dec {
  return amount.mul(Dec.of(rateInBase as any));
}

// ── award ──────────────────────────────────────────────────────────────────

export interface AwardPart {
  vendor: string;
  lines: { line: number; qty: Dec; unitPrice: Dec; isBest: boolean }[];
}
/** Per-vendor award value = Σ awarded quantity × that vendor's unit price; total and the part awarded at L1. */
export function awardTotals(parts: AwardPart[]): { perVendor: Map<string, Dec>; total: Dec; atL1: Dec; notAtL1: Dec } {
  const perVendor = new Map<string, Dec>();
  let atL1 = Dec.ZERO;
  let notAtL1 = Dec.ZERO;
  for (const p of parts) {
    let t = Dec.ZERO;
    for (const l of p.lines) {
      const v = l.qty.mul(l.unitPrice);
      t = t.add(v);
      if (l.isBest) atL1 = atL1.add(v);
      else notAtL1 = notAtL1.add(v);
    }
    perVendor.set(p.vendor, (perVendor.get(p.vendor) ?? Dec.ZERO).add(t));
  }
  return { perVendor, total: Dec.sum(perVendor.values()), atL1, notAtL1 };
}

// ── comparing a figure ─────────────────────────────────────────────────────

export interface FigureCheck {
  ok: boolean;
  /** the oracle's exact value and its value at the shown precision */
  expected: string;
  expectedRounded: string;
  actual?: string;
  diff?: string;
  tolerance: string;
}

/**
 * Does the app's figure equal the oracle's? Accepted when it equals the exact
 * value or the value rounded at `dp` places, within `units` units of the last
 * place (default 1: Ruby rounds a binary FLOAT, so 2.675 may legitimately
 * come back as 2.67 or 2.68).
 */
export function sameFigure(actual: unknown, exact: Dec, dp: number, units = 1): FigureCheck {
  const a = Dec.tryOf(actual);
  const rounded = exact.round(dp, "half_up");
  let unit = Dec.ONE;
  for (let i = 0; i < dp; i++) unit = unit.div(10);
  const tolerance = unit.mul(units);
  if (!a) return { ok: false, expected: exact.toString(), expectedRounded: rounded.toFixed(Math.max(dp, 0)), tolerance: tolerance.toString() };
  const d1 = a.sub(exact).abs();
  const d2 = a.sub(rounded).abs();
  const diff = Dec.min(d1, d2);
  // the app stores money as a binary float (≈ 15-16 significant digits): a difference below one part in 10^12 of
  // the figure is float storage, not a money error
  const floatNoise = exact.abs().div(Dec.of("1000000000000"));
  return { ok: !diff.gt(tolerance) || !diff.gt(floatNoise), expected: exact.toString(), expectedRounded: rounded.toFixed(Math.max(dp, 0)), actual: a.toString(), diff: diff.toString(), tolerance: tolerance.toString() };
}
