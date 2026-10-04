/**
 * Offline unit tests of the integrity oracle (src/integrity/*): exact decimals,
 * the template-formula evaluator, the bid calculator, ranks, savings and the
 * invariants. No network, no database.
 *
 *   node --import tsx --test --test-reporter=spec scripts/integrity-unit-tests.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Dec, D } from "../src/integrity/decimal.js";
import { evaluate, parseFormula, references, FormulaDivZero } from "../src/integrity/formula.js";

const s = (d: Dec) => d.toString();

describe("Dec — exact decimal arithmetic", () => {
  test("0.1 + 0.2 is exactly 0.3 (no float drift)", () => {
    assert.equal(s(D(0.1).add(0.2)), "0.3");
  });
  test("parses formatted amounts", () => {
    assert.equal(s(D("₹ 1,23,456.50")), "123456.5");
    assert.equal(s(D("1.2e3")), "1200");
    assert.equal(s(D("-0.001")), "-0.001");
    assert.equal(Dec.tryOf("abc"), undefined);
    assert.equal(Dec.tryOf(""), undefined);
  });
  test("multiplication is exact for many decimals and large numbers", () => {
    assert.equal(s(D("12345678.9012").mul("98765.4321")), "1219326311244.87120852");
    assert.equal(s(D("0.0001").mul("0.0001")), "0.00000001");
  });
  test("division carries 30 places", () => {
    assert.equal(D(1).div(3).toFixed(6), "0.333333");
    assert.equal(D(2).div(3).toFixed(4), "0.6667");
    assert.throws(() => D(1).div(0), RangeError);
  });
  test("round half-up (Ruby's default) vs half-even, floor, ceil", () => {
    assert.equal(s(D("2.675").round(2)), "2.68");
    assert.equal(s(D("-2.675").round(2)), "-2.68");
    assert.equal(s(D("2.665").round(2, "half_even")), "2.66");
    assert.equal(s(D("2.669").round(2, "floor")), "2.66");
    assert.equal(s(D("-2.661").round(2, "floor")), "-2.67");
    assert.equal(s(D("2.661").round(2, "ceil")), "2.67");
    assert.equal(s(D("1234.5").round(-2)), "1200");
    assert.equal(D("10").toFixed(2), "10.00");
  });
  test("comparisons", () => {
    assert.ok(D("1.10").eq("1.1"));
    assert.ok(D("0.999").lt(1));
    assert.equal(s(Dec.min(D(3), D("2.5"), D(9))), "2.5");
  });
});

describe("template formulas", () => {
  const row = (vals: Record<string, string | number>) => ({ get: (n: string) => (vals[n] === undefined ? undefined : typeof vals[n] === "number" ? D(vals[n] as number) : (vals[n] as string)) });
  test("Buy Template line total: price × qty + GST on it", () => {
    const f = parseFormula("price*participant_quantity+price*participant_quantity*(gst/100)");
    const v = evaluate(f, row({ price: 123.45, participant_quantity: 7.5, gst: 18 })) as Dec;
    // 123.45 × 7.5 = 925.875; × 1.18 = 1092.5325
    assert.equal(s(v), "1092.5325");
  });
  test("a blank input counts as zero", () => {
    const f = parseFormula("price*participant_quantity+price*participant_quantity*(gst/100)");
    assert.equal(s(evaluate(f, row({ price: 10, participant_quantity: 3 })) as Dec), "30");
  });
  test("SUM over the bid's rows", () => {
    const f = parseFormula("SUM(total_amount)+freight_custom");
    const scope = { get: (n: string) => (n === "freight_custom" ? D(50) : undefined), column: (n: string) => (n === "total_amount" ? [D("10.5"), D("20.25"), undefined] : []) };
    assert.equal(s(evaluate(f, scope) as Dec), "80.75");
  });
  test("IF with string comparison (dropdown widgets)", () => {
    const f = parseFormula("IF(local_drop_custom='opt1',(price*1),IF(local_drop_custom='opt2',(price+num1_custom+num2_custom),0))");
    assert.equal(s(evaluate(f, row({ local_drop_custom: "opt2", price: 5, num1_custom: 1, num2_custom: 2 })) as Dec), "8");
    assert.equal(s(evaluate(f, row({ local_drop_custom: "x", price: 5 })) as Dec), "0");
  });
  test("operator precedence and unary minus", () => {
    assert.equal(s(evaluate(parseFormula("2+3*4-(-1)"), row({})) as Dec), "15");
    assert.equal(s(evaluate(parseFormula("total_custom-(total_custom*special_discount_custom/100)"), row({ total_custom: 200, special_discount_custom: 12.5 })) as Dec), "175");
  });
  test("division by zero is reported, never a number", () => {
    assert.throws(() => evaluate(parseFormula("a/b"), row({ a: 1, b: 0 })), FormulaDivZero);
  });
  test("references split plain from aggregated names", () => {
    const r = references(parseFormula("SUM(total_amount)*gst_percentage_custom/100"));
    assert.deepEqual([...r.aggregated], ["total_amount"]);
    assert.deepEqual([...r.plain], ["gst_percentage_custom"]);
  });
});

import { awardTotals, computeBid, procolRanks, sameFigure, savings, templateFromWidgets, toBase } from "../src/integrity/calculator.js";
import { lineSaving } from "../src/integrity/invariants.js";

const W = (key: string, input_type: string, formula?: string, precision = 4) => ({ key_attribute: key, name: key, input_type, configuration: { field_type: formula ? "formula" : "participant", precision, ...(formula ? { formula } : {}) } });
const buyTemplate = templateFromWidgets({
  inline_components: [W("creator_quantity", "quantity"), W("participant_quantity", "quantity"), W("price", "number"), W("gst", "percentage"), W("total_amount", "formula", "price*participant_quantity+price*participant_quantity*(gst/100)")],
  global_price_components: [W("gross_total", "formula", "SUM(total_amount)")],
});

describe("calculator — one bid", () => {
  test("live-verified figures (PROCOL DEMO explore event): line totals and gross total", () => {
    const c = computeBid(buyTemplate, { lines: [{ price: 123.45, gst: 18, participant_quantity: 7.5 }, { price: 0.3333, gst: 5, participant_quantity: 1234.567 }] });
    assert.equal(s(c.lines[0].total_amount), "1092.5325");
    assert.equal(s(c.lines[1].total_amount), "432.055240155");
    assert.equal(s(c.global.gross_total), "1524.587740155");
    assert.deepEqual(c.issues, []);
  });
  test("discount, charges and tax on the bid total (bid-level formulas that read each other)", () => {
    const t = templateFromWidgets({
      inline_components: [W("participant_quantity", "quantity"), W("price", "number"), W("total_amount", "formula", "price*participant_quantity")],
      global_price_components: [
        W("discount_percent_custom", "percentage"), W("freight_charges_custom", "number"), W("other_charges_custom", "number"), W("tax_percent_custom", "percentage"),
        W("gross_total", "formula", "sub_total_custom+tax_amount_custom"),
        W("tax_amount_custom", "formula", "sub_total_custom*tax_percent_custom/100"),
        W("sub_total_custom", "formula", "SUM(total_amount)-discount_amount_custom+freight_charges_custom+other_charges_custom"),
        W("discount_amount_custom", "formula", "SUM(total_amount)*discount_percent_custom/100"),
      ],
    });
    // the S2 vendor-2 bid, matched live on 198678: 11779.5265
    const c = computeBid(t, { lines: [{ price: 415.5, participant_quantity: 12.25 }, { price: 2050, participant_quantity: 3 }], global: { discount_percent_custom: 7.5, freight_charges_custom: 0, other_charges_custom: 120.55, tax_percent_custom: 12 } });
    assert.equal(s(c.global.discount_amount_custom), "842.990625");
    assert.equal(s(c.global.sub_total_custom), "10517.434375");
    assert.equal(s(c.global.gross_total), "11779.5265");
  });
  test("a global formula dividing by a zero input is reported, not computed", () => {
    const t = templateFromWidgets({ inline_components: [W("price", "number"), W("total_amount", "formula", "price")], global_price_components: [W("rate_custom", "number"), W("gross_total", "formula", "SUM(total_amount)/rate_custom")] });
    const c = computeBid(t, { lines: [{ price: 5 }], global: { rate_custom: 0 } });
    assert.equal(c.global.gross_total, undefined);
    assert.match(c.issues.join(" "), /divides by zero/);
  });
});

describe("calculator — ranks, savings, currency, award", () => {
  test("dense rank; a tie at the best shifts every rank (100, 100, 120 → 2, 2, 3)", () => {
    const r = procolRanks(new Map([["a", D(100)], ["b", D(100)], ["c", D(120)]]));
    assert.deepEqual([...r.values()], [2, 2, 3]);
    const r2 = procolRanks(new Map([["a", D(99.5)], ["b", D(100)], ["c", D(100)], ["d", D(101.25)]]));
    assert.deepEqual([...r2.values()], [1, 2, 2, 3]);
    const sell = procolRanks(new Map([["a", D(10)], ["b", D(20)]]), "sell");
    assert.equal(sell.get("b"), 1);
  });
  test("savings: amount and percent; a zero reference has no percent", () => {
    const x = savings(D(4870), D("120.1"));
    assert.equal(s(x.amount), "4749.9");
    assert.equal(x.percent!.toFixed(2), "97.53");
    assert.equal(savings(D(0), D(5)).percent, undefined);
  });
  test("line saving shown per unit is truncated to 4 places (backend truncatize)", () => {
    const x = lineSaving(D(4870), D("0.33335"));
    assert.equal(s(x.amount), "4869.66665");
    assert.equal(s(x.amountShown), "4869.6666");
  });
  test("currency to base and award totals", () => {
    assert.equal(s(toBase(D("12.5"), "83.25")), "1040.625");
    const a = awardTotals([{ vendor: "A", lines: [{ line: 1, qty: D(5), unitPrice: D("10.5"), isBest: true }] }, { vendor: "B", lines: [{ line: 2, qty: D("2.5"), unitPrice: D(4), isBest: false }] }]);
    assert.equal(s(a.total), "62.5");
    assert.equal(s(a.atL1), "52.5");
  });
  test("sameFigure: accepts the exact or rounded value within one unit; rejects a real difference", () => {
    assert.ok(sameFigure("1092.53", D("1092.5325"), 2).ok);
    assert.ok(sameFigure("2.67", D("2.675"), 2).ok);
    assert.ok(!sameFigure("1092.60", D("1092.5325"), 2).ok);
    assert.ok(sameFigure(0.09799999999999999, D("0.098"), 6).ok);
    assert.ok(!sameFigure(undefined, D(1), 2).ok);
  });
});
