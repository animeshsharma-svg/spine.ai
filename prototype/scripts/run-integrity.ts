/**
 * BID & REPORT NUMBER INTEGRITY — live, API-only.
 *
 *   npx tsx scripts/run-integrity.ts --c 198678                 every scenario on its own fresh event
 *   npx tsx scripts/run-integrity.ts --c 32461 --scenarios S1,S3
 *     --no-confirm     do not re-run a scenario with a failed check on a second fresh event
 *     --no-report      skip the Excel comparison report
 *     --no-close       do not wait for the bid end (skips the after-close re-check in S1)
 *     --budget-min 90  stop starting new scenarios after this many minutes
 *   npx tsx scripts/run-integrity.ts --check                    list scenarios and the cases each decides (no network)
 *
 * Each scenario builds its OWN fresh QA_Platform_Integrity_… event with the client's QA vendors (never real
 * suppliers), bids with numbers chosen to be awkward (fractional and large quantities, many decimals, tiny prices,
 * every GST slab, charges + discount + tax on the total, ties, crossing taxes), then reads every figure Procol
 * reports and compares it with the independent calculator (src/integrity/*). A scenario with a failed check is
 * re-run on a SECOND fresh event; a failure counts only when the same check fails again (no false positives).
 *
 * All requests go through src/integrity/send.ts (app-guarded: a buyer token never calls a vendor-only route and
 * vice versa). Procol's database is read with SELECT only, and only for this run's own rows.
 *
 * Results: data/runs/integrity/<company>-<time>.json (git-ignored with the rest of data/runs).
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });

import { openRig, Rig, stageWidgets, type Built, type RigCtx } from "../src/integrity/live.js";
import { checkEventIntegrity, type IntegrityCheck, type IntegrityReport, type SubmittedBid } from "../src/integrity/invariants.js";
import { Dec } from "../src/integrity/decimal.js";
import { computeBid, type BidInput } from "../src/integrity/calculator.js";
import { send, said } from "../src/integrity/send.js";
import type { QaVendor } from "../src/checks/matrixVendors.js";

const RUNS_DIR = join(here, "..", "data", "runs", "integrity");
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── numbers chosen per company precision ───────────────────────────────────

/** A value rounded to the places the company's price / quantity widgets allow (what the vendor's screen accepts). */
const at = (x: number | string, dp: number) => Dec.of(x).round(dp, "half_up").toString();

interface Ctx {
  rig: RigCtx;
  r: Rig;
  pp: number; // price places
  qp: number; // quantity places
  report: boolean;
  close: boolean;
}

interface ScenarioOut {
  id: string;
  title: string;
  attempt: number;
  eventTitle?: string;
  eventGroupUuid?: string;
  tradeUuid?: string;
  reports: { when: string; report: IntegrityReport }[];
  probes: IntegrityCheck[];
  notes: string[];
  setupFailed?: string;
  startedAt: string;
  durationMs: number;
}

interface Scenario {
  id: string;
  title: string;
  vendors: number;
  /** invariant id → catalog case ids it decides in this scenario */
  cases: Record<string, string[]>;
  run: (c: Ctx, vs: QaVendor[], out: ScenarioOut) => Promise<void>;
}

/** Build with the stage's stored precision, then read the places the company allows. */
async function build(c: Ctx, out: ScenarioOut, o: Parameters<Rig["build"]>[0]): Promise<Built | undefined> {
  const ev = await c.r.build(o);
  if (!ev) {
    out.setupFailed = c.r.log.filter((l) => !l.ok).map((l) => `${l.title}: ${l.actual}`).join("; ") || "the event could not be built";
    return undefined;
  }
  out.eventTitle = ev.title;
  out.eventGroupUuid = ev.eg;
  out.tradeUuid = ev.trade;
  const price = ev.template.inline.find((w) => w.key === "price");
  const qty = ev.template.inline.find((w) => w.key === "participant_quantity" || w.key === "creator_quantity");
  c.pp = price?.precision ?? 2;
  c.qp = qty?.precision ?? 2;
  log(`  event “${ev.title}” stage ${ev.trade}; prices to ${c.pp} places, quantities to ${c.qp}`);
  return ev;
}

async function vendorsOf(c: Ctx, vs: QaVendor[]) {
  const list: { label: string; companyUuid: string; api: any }[] = [];
  for (const v of vs) {
    const api = await c.r.vendor(v);
    if (api) list.push({ label: c.r.name(v), companyUuid: v.vendorCompanyUuid, api });
  }
  return list;
}

async function integrity(c: Ctx, out: ScenarioOut, ev: Built, when: string, submitted: SubmittedBid[], _vs: QaVendor[], withReport = c.report) {
  // only the vendors invited to this event can read it; an uninvited one would only add "couldn't tell"
  const vendors = await vendorsOf(c, ev.audience);
  const [rep] = await checkEventIntegrity({ tradeUuid: ev.trade, eventGroupUuid: ev.eg }, { buyer: c.rig.buyerApi, vendors }, { submitted, report: withReport, onLine: (s) => log(s) });
  out.reports.push({ when, report: rep });
  return rep;
}

/** A probe: one decisive observation written as a check (same shape as the invariants). */
function probe(out: ScenarioOut, p: IntegrityCheck) {
  out.probes.push(p);
  log(`  ${{ passed: "✓", failed: "✗", "couldn't tell": "?", "not run": "–" }[p.verdict]} [${p.inv}] ${p.title} — ${p.actual}`);
}

// ── the scenarios ──────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    title: "Awkward numbers on the default template: fractional and large quantities, many decimals, every GST slab, ties at L1 — while live and after the close",
    vendors: 3,
    cases: {
      "INV-ECHO": ["EVI-LINE-001"], "INV-LINE": ["EVI-LINE-002", "EVI-LINE-003", "EVI-LINE-004", "EVI-TAX-001"], "INV-BREAKUP": ["EVI-TAX-002"],
      "INV-BID": ["EVI-TOT-001"], "INV-SAME": ["EVI-TOT-002"], "INV-AMOUNT": ["EVI-TOT-003"], "INV-COUNT": ["EVI-TOT-004"],
      "INV-L1": ["EVI-RANK-001", "EVI-RANK-003"], "INV-L1DATA": ["EVI-RANK-002"], "INV-BEST": ["EVI-RANK-003", "EVI-RANK-004"], "INV-RANK": ["EVI-RANK-005"],
      "INV-SAV-LINE": ["EVI-SAV-001", "EVI-SAV-002"], "INV-SAV-AGG": ["EVI-SAV-003", "EVI-SAV-004"], "INV-SANE": ["EVI-TOT-005"],
      "INV-ISOLATION": ["EVI-ISO-001"], "INV-REPORT": ["EVI-REP-001"], "AFTER-CLOSE": ["EVI-REP-002", "EVI-SAV-005"], "PRECISION": ["EVI-PREC-001"],
    },
    async run(c, vs, out) {
      const [A, B, C] = vs;
      const { widgets } = await stageWidgets(c.rig, undefined);
      const qtys = [7.5, 1234.567, 0.5, 250000, 999999.999];
      const ev = await build(c, out, { tag: "S1_Awkward", qtys, widgets, audience: [A, B, C], openFor: c.close ? 6 * 60 : 30 * 60, extra: 60 });
      if (!ev) return;
      const q = qtys.map((x) => at(x, c.qp));
      const P = (xs: (number | string)[]) => xs.map((x) => at(x, c.pp));
      const pa = P([123.4567, 0.3333, 98765.4321, 12.5, 98765.4321]);
      const pb = P([120.1, 0.35, 99999.99, 12.49, 98765.43]);
      const pc = P([125, 0.3333, 100000, 12.49, 98000]); // ties: line 2 with A (at 4 places) and line 4 with B
      const ga = [18, 5, 28, 0, 28];
      const gb = [12, 28, 0, 18, 18];
      const gc = [5, 5, 12, 0, 12];
      const mk = (p: string[], g: number[]): BidInput => ({ lines: p.map((x, i) => ({ price: x, gst: g[i], participant_quantity: q[i] })) });
      const ia = mk(pa, ga);
      const ib = mk(pb, gb);
      const ic = mk(pc, gc);
      const sa = await c.r.vendorBid(A, ev, ia, { label: `${c.r.name(A)} bids` });
      const sb = await c.r.vendorBid(B, ev, ib, { label: `${c.r.name(B)} bids` });
      const sc = await c.r.surrogateBid(C, ev, ic);
      const submitted: SubmittedBid[] = [];
      if (sa.submitted) submitted.push({ companyUuid: A.vendorCompanyUuid, label: c.r.name(A), input: ia });
      if (sb.submitted) submitted.push({ companyUuid: B.vendorCompanyUuid, label: c.r.name(B), input: ib });
      if (sc.submitted) submitted.push({ companyUuid: C.vendorCompanyUuid, label: c.r.name(C), input: ic });
      if (submitted.length < 2) {
        out.setupFailed = `only ${submitted.length} bid(s) went in`;
        return;
      }
      const rep = await integrity(c, out, ev, "while bidding is open", submitted, vs);
      // PRECISION: the stage stored the company's precision on every money widget
      const prec = rep.template?.precision;
      const wrongPrec = ev.template.inline.filter((w) => ["price", "total_amount", "gst"].includes(w.key) && prec !== undefined && w.precision !== prec);
      probe(out, {
        inv: "PRECISION", title: "The stage's money columns carry the company's decimal places", expected: `Every money column at the company's setting (${prec ?? "unknown"} places).`,
        actual: prec === undefined ? "The company's setting could not be read." : wrongPrec.length ? `Different: ${wrongPrec.map((w) => `${w.name} at ${w.precision}`).join(", ")}.` : `Price, GST and line total all at ${prec} places.`,
        verdict: prec === undefined ? "couldn't tell" : wrongPrec.length ? "failed" : "passed", details: { where: "GET /trade/:id → sheets.*.widgets[].configuration.precision; trade_config.widget_precision" },
      });
      if (c.close) {
        const ok = await c.r.until(ev.bet + 20, "for the bid end, to re-read every figure after the close", 9);
        if (!ok) {
          probe(out, { inv: "AFTER-CLOSE", title: "Re-read every figure after the close", expected: "The figures are re-checked after bidding ends.", actual: "The wait for the close hit its limit; not re-checked.", verdict: "couldn't tell" });
          return;
        }
        await sleep(15_000); // the savings worker runs 5 s after the close (trade_controller.rb:692)
        const after = await integrity(c, out, ev, "after the close", submitted, vs, c.report);
        const fails = after.checks.filter((x) => x.verdict === "failed" && x.inv !== "INV-ISOLATION");
        probe(out, {
          inv: "AFTER-CLOSE", title: "Every figure still agrees after the close", expected: "The same figures, the same L1 and the same savings once bidding has ended.",
          actual: fails.length ? `${fails.length} check(s) disagree after the close: ${fails.slice(0, 3).map((f) => f.title).join("; ")}.` : `All ${after.checks.length} checks agree after the close.`,
          verdict: fails.length ? "failed" : after.checks.length ? "passed" : "couldn't tell",
        });
      }
    },
  },
  {
    id: "S2",
    title: "Charges, a discount and tax on the bid total (bid-level formulas), every tax slab, one vendor with no charges",
    vendors: 3,
    cases: {
      "INV-ECHO": ["EVI-CHG-001"], "INV-LINE": ["EVI-CHG-002"], "INV-BID": ["EVI-CHG-003", "EVI-CHG-004", "EVI-TAX-003"], "INV-SAME": ["EVI-CHG-005"],
      "INV-AMOUNT": ["EVI-CHG-006"], "INV-BEST": ["EVI-RANK-006"], "INV-RANK": ["EVI-RANK-006"], "INV-L1": ["EVI-RANK-007"], "INV-L1DATA": ["EVI-RANK-007"],
      "INV-SANE": ["EVI-CHG-007"], "INV-ISOLATION": ["EVI-ISO-002"], "INV-REPORT": ["EVI-REP-003"], "INV-COUNT": ["EVI-TOT-004"], "INV-SAV-LINE": ["EVI-SAV-001"], "INV-SAV-AGG": ["EVI-SAV-003"],
      "PROBE-NEG": ["EVI-CHG-008"],
    },
    async run(c, vs, out) {
      const [A, B, C] = vs;
      const W = (key: string, name: string, input_type: string, extra: Record<string, unknown> = {}) => ({
        name, key_attribute: key, input_type, widget_type: "default",
        configuration: { field_type: input_type === "formula" ? "formula" : "participant", mode_type: input_type === "formula" ? "read" : "write", precision: 4, prefix: input_type === "percentage" ? undefined : "₹", suffix: input_type === "percentage" ? "%" : undefined, input_group: "amount", is_removable: true, is_required: false, ...extra },
      });
      const { widgets } = await stageWidgets(c.rig, undefined);
      // line total without line GST; the tax is charged on the bid total after discount and charges
      widgets.inline_components = widgets.inline_components.filter((w: any) => w.key_attribute !== "gst");
      const ta = widgets.inline_components.find((w: any) => w.key_attribute === "total_amount");
      ta.configuration.formula = "price*participant_quantity";
      widgets.global_price_components = [
        W("discount_percent_custom", "Discount %", "percentage"),
        W("discount_amount_custom", "Discount", "formula", { formula: "SUM(total_amount)*discount_percent_custom/100" }),
        W("freight_charges_custom", "Freight (before tax)", "number"),
        W("other_charges_custom", "Other charges (before tax)", "number"),
        W("sub_total_custom", "Sub total", "formula", { formula: "SUM(total_amount)-discount_amount_custom+freight_charges_custom+other_charges_custom" }),
        W("tax_percent_custom", "Tax %", "percentage"),
        W("tax_amount_custom", "Tax", "formula", { formula: "sub_total_custom*tax_percent_custom/100" }),
        W("gross_total", "Sum Total", "formula", { formula: "sub_total_custom+tax_amount_custom" }),
      ];
      const qtys = [12.25, 3];
      const ev = await build(c, out, { tag: "S2_Charges", qtys, widgets, audience: vs.slice(0, 4), openFor: 30 * 60 });
      if (!ev) return;
      const q = qtys.map((x) => at(x, c.qp));
      const line = (p: (number | string)[]) => p.map((x, i) => ({ price: at(x, c.pp), participant_quantity: q[i] }));
      const ia: BidInput = { lines: line([410.75, 1999.99]), global: { discount_percent_custom: 0, freight_charges_custom: at(500, c.pp), other_charges_custom: 0, tax_percent_custom: 18 } };
      const ib: BidInput = { lines: line([415.5, 2050]), global: { discount_percent_custom: 7.5, freight_charges_custom: 0, other_charges_custom: at(120.55, c.pp), tax_percent_custom: 12 } };
      const ic: BidInput = { lines: line([399.99, 1985.25]), global: { discount_percent_custom: 2.25, freight_charges_custom: at(1250.4, c.pp), other_charges_custom: at(99.99, c.pp), tax_percent_custom: 28 } };
      const submitted: SubmittedBid[] = [];
      for (const [v, inp, own] of [[A, ia, true], [B, ib, true], [C, ic, false]] as const) {
        const s = own ? await c.r.vendorBid(v, ev, inp) : await c.r.surrogateBid(v, ev, inp);
        if (s.submitted) submitted.push({ companyUuid: v.vendorCompanyUuid, label: c.r.name(v), input: inp });
      }
      if (submitted.length < 2) {
        out.setupFailed = `only ${submitted.length} bid(s) went in`;
        return;
      }
      for (const s of submitted) {
        const calc = computeBid(ev.template, s.input);
        log(`  oracle ${s.label}: lines ${calc.lines.map((l) => l.total_amount?.toString()).join(" + ")}; discount ${calc.global.discount_amount_custom}; sub total ${calc.global.sub_total_custom}; tax ${calc.global.tax_amount_custom}; total ${calc.global.gross_total}`);
      }
      await integrity(c, out, ev, "while bidding is open", submitted, vs);
      // PROBE-NEG: a discount over 100 % on a percentage widget would make the bid total negative and the "best" bid
      const D = vs[3];
      if (D) {
        const idd: BidInput = { lines: line([410, 2000]), global: { discount_percent_custom: 150, freight_charges_custom: 0, other_charges_custom: 0, tax_percent_custom: 18 } };
        const exp = computeBid(ev.template, idd).global.gross_total;
        const s = await c.r.vendorBid(D, ev, idd, { label: `${c.r.name(D)} enters a 150% discount` });
        let shown: string | undefined;
        if (s.submitted) {
          const st = await send(c.rig.buyerApi, "GET", `/trade/${ev.trade}?response_type=template&additional_fields=order_details`);
          shown = st.data?.sheets?.global_price_components?.global_data?.[D.vendorCompanyUuid]?.gross_total?.value;
        }
        probe(out, {
          inv: "PROBE-NEG", title: "A discount above 100% is refused, so no bid total can go negative",
          expected: `Refused — a 150% discount would make the bid total ${exp?.toString()} (negative) and rank it best.`,
          actual: s.submitted ? `Accepted: the comparison shows a bid total of ${shown ?? "—"} for ${c.r.name(D)}.` : `Refused (${s.code ? `code ${s.code}` : "no code"}).`,
          verdict: s.submitted && shown !== undefined && Dec.tryOf(shown)?.sign() === -1 ? "failed" : s.submitted ? "couldn't tell" : "passed",
          details: { inputs: idd, app: shown, oracle: exp?.toString() },
        });
      }
    },
  },
  {
    id: "S3",
    title: "A vendor's app sends wrong totals: the server must recompute every total from price and quantity",
    vendors: 2,
    cases: { "INV-LINE": ["EVI-TOT-006"], "INV-BID": ["EVI-TOT-006"], "INV-SAME": ["EVI-TOT-006"], "INV-AMOUNT": ["EVI-TOT-003"], "INV-BEST": ["EVI-TOT-007"], "INV-L1": ["EVI-TOT-007"], "INV-L1DATA": ["EVI-TOT-007"], "INV-ECHO": ["EVI-LINE-001"], "INV-BREAKUP": ["EVI-TAX-002"], "INV-SANE": ["EVI-TOT-005"], "INV-COUNT": ["EVI-TOT-004"], "INV-SAV-LINE": ["EVI-SAV-001"], "INV-SAV-AGG": ["EVI-SAV-003"], "INV-ISOLATION": ["EVI-ISO-001"] },
    async run(c, vs, out) {
      const [A, B] = vs;
      const { widgets } = await stageWidgets(c.rig, undefined);
      const qtys = [40, 2.5];
      const ev = await build(c, out, { tag: "S3_Tamper", qtys, widgets, audience: [A, B], openFor: 30 * 60 });
      if (!ev) return;
      const q = qtys.map((x) => at(x, c.qp));
      const ia: BidInput = { lines: [{ price: at(250.5, c.pp), gst: 18, participant_quantity: q[0] }, { price: at(1200, c.pp), gst: 12, participant_quantity: q[1] }] };
      const ib: BidInput = { lines: [{ price: at(240, c.pp), gst: 18, participant_quantity: q[0] }, { price: at(1150.75, c.pp), gst: 12, participant_quantity: q[1] }] };
      const submitted: SubmittedBid[] = [];
      const sa = await c.r.vendorBid(A, ev, ia, { sendTotals: "tamper", label: `${c.r.name(A)} bids, its app claiming a line total and bid total of ₹1` });
      if (sa.submitted) submitted.push({ companyUuid: A.vendorCompanyUuid, label: c.r.name(A), input: ia });
      const sb = await c.r.vendorBid(B, ev, ib);
      if (sb.submitted) submitted.push({ companyUuid: B.vendorCompanyUuid, label: c.r.name(B), input: ib });
      if (!sa.submitted) {
        out.setupFailed = "the tampered bid was not accepted at all (that is a pass for the server, but nothing to check)";
        probe(out, { inv: "INV-BID", title: "A bid whose app claims wrong totals", expected: "Either refused, or stored with the totals recomputed.", actual: `Refused (code ${sa.code ?? "none"}).`, verdict: "passed" });
        return;
      }
      await integrity(c, out, ev, "after a vendor's app sent ₹1 as its totals", submitted, vs, false);
    },
  },
  {
    id: "S4",
    title: "Ties and crossing taxes: three vendors at the same unit price, and a lower price with a higher tax",
    vendors: 3,
    cases: { "INV-L1": ["EVI-RANK-003", "EVI-RANK-008"], "INV-L1DATA": ["EVI-RANK-002"], "INV-BEST": ["EVI-RANK-004", "EVI-RANK-008"], "INV-RANK": ["EVI-RANK-005"], "INV-LINE": ["EVI-TAX-001"], "INV-BID": ["EVI-TOT-001"], "INV-SAME": ["EVI-TOT-002"], "INV-AMOUNT": ["EVI-TOT-003"], "INV-ECHO": ["EVI-LINE-001"], "INV-BREAKUP": ["EVI-TAX-002"], "INV-SANE": ["EVI-TOT-005"], "INV-COUNT": ["EVI-TOT-004"], "INV-SAV-LINE": ["EVI-SAV-001"], "INV-SAV-AGG": ["EVI-SAV-003"], "INV-ISOLATION": ["EVI-ISO-001"], "INV-REPORT": ["EVI-REP-004"], "REPORT-L1": ["EVI-REP-004"] },
    async run(c, vs, out) {
      const [A, B, C] = vs;
      const { widgets } = await stageWidgets(c.rig, undefined);
      const qtys = [10, 100];
      const ev = await build(c, out, { tag: "S4_Ties", qtys, widgets, audience: [A, B, C], openFor: 30 * 60 });
      if (!ev) return;
      const q = qtys.map((x) => at(x, c.qp));
      // line 1: everyone at 500 with different GST; line 2: A 100 @28% (landed 128), B 105 @5% (landed 110.25), C 104 @18% (122.72)
      const ia: BidInput = { lines: [{ price: 500, gst: 18, participant_quantity: q[0] }, { price: 100, gst: 28, participant_quantity: q[1] }] };
      const ib: BidInput = { lines: [{ price: 500, gst: 5, participant_quantity: q[0] }, { price: 105, gst: 5, participant_quantity: q[1] }] };
      const ic: BidInput = { lines: [{ price: 500, gst: 12, participant_quantity: q[0] }, { price: 104, gst: 18, participant_quantity: q[1] }] };
      const submitted: SubmittedBid[] = [];
      for (const [v, inp, own] of [[A, ia, true], [B, ib, true], [C, ic, false]] as const) {
        const s = own ? await c.r.vendorBid(v, ev, inp) : await c.r.surrogateBid(v, ev, inp);
        if (s.submitted) submitted.push({ companyUuid: v.vendorCompanyUuid, label: c.r.name(v), input: inp });
      }
      if (submitted.length < 3) {
        out.setupFailed = `only ${submitted.length} bid(s) went in`;
        return;
      }
      await integrity(c, out, ev, "three vendors tied on line 1; taxes cross on line 2", submitted, vs);
      // REPORT-L1: the comparison report's rank and best net price on the crossing line
      const { fetchStageReport } = await import("../src/integrity/reports.js");
      const rep = c.report ? await fetchStageReport(ev.trade, c.rig.buyerApi) : undefined;
      if (rep?.ok && rep.sheets?.[0]) {
        const rows = rep.sheets[0].rows;
        const hdr = rows.findIndex((r) => (r ?? []).some((x) => x === "Best Net Price"));
        const head = rows[hdr] ?? [];
        const bnp = head.indexOf("Best Net Price");
        const line2 = rows.slice(hdr + 1).find((r) => String(r?.[0]) === "2");
        probe(out, {
          inv: "REPORT-L1", title: "Line 2 in the comparison report: best net price is the cheapest price after tax",
          expected: `${c.r.name(B)}'s 105 + 5% = 110.25 is the best net price (cheaper after tax than ${c.r.name(A)}'s 100 + 28% = 128).`,
          actual: line2 ? `The report's “Best Net Price” for line 2 is ${line2[bnp]}.` : "Line 2 was not found in the report.",
          verdict: !line2 ? "couldn't tell" : Dec.tryOf(line2[bnp])?.eq("110.25") ? "passed" : "failed",
          details: { where: "POST /reports/download_report (auction_bids_comparison_report) → Sheet1", evidence: { header: head, line2 } },
        });
      }
    },
  },
  {
    id: "S5",
    title: "Zero and smallest prices: a zero price is not a quote, the smallest price the screen allows is",
    vendors: 2,
    cases: { "PROBE-ZERO": ["EVI-LINE-005"], "INV-L1": ["EVI-LINE-006"], "INV-LINE": ["EVI-LINE-006"], "INV-SAV-LINE": ["EVI-SAV-006"], "INV-SAV-AGG": ["EVI-SAV-006"], "INV-SANE": ["EVI-SAV-006"], "INV-BID": ["EVI-TOT-001"], "INV-SAME": ["EVI-TOT-002"], "INV-AMOUNT": ["EVI-TOT-003"], "INV-ECHO": ["EVI-LINE-001"], "INV-BREAKUP": ["EVI-TAX-002"], "INV-BEST": ["EVI-LINE-006"], "INV-L1DATA": ["EVI-LINE-006"], "INV-COUNT": ["EVI-TOT-004"], "INV-ISOLATION": ["EVI-ISO-001"] },
    async run(c, vs, out) {
      const [A, B] = vs;
      const { widgets } = await stageWidgets(c.rig, undefined);
      const qtys = [100, 100];
      const ev = await build(c, out, { tag: "S5_Zero", qtys, widgets, audience: [A, B], openFor: 30 * 60 });
      if (!ev) return;
      const tiny = Dec.of(1).div(10 ** c.pp).toString(); // 0.0001 or 0.01
      const q = qtys.map((x) => at(x, c.qp));
      const ia: BidInput = { lines: [{ price: 0, gst: 18, participant_quantity: q[0] }, { price: tiny, gst: 18, participant_quantity: q[1] }] };
      const ib: BidInput = { lines: [{ price: 50, gst: 18, participant_quantity: q[0] }, { price: 60, gst: 18, participant_quantity: q[1] }] };
      const sa = await c.r.vendorBid(A, ev, ia, { label: `${c.r.name(A)} quotes ₹0 on line 1 and ₹${tiny} on line 2` });
      const sb = await c.r.vendorBid(B, ev, ib);
      const st = await send(c.rig.buyerApi, "GET", `/trade/${ev.trade}?response_type=template&additional_fields=order_details`);
      const rowsA: any[] = st.data?.sheets?.inline_components?.data?.[A.vendorCompanyUuid] ?? [];
      const l1 = await send(c.rig.buyerApi, "GET", `/v1/trade/${ev.trade}/schema?response_type=template&additional_fields=order_details&l1_prices=true`);
      const lines = Object.values<any>(l1.data?.l1_prices?.line_item_based ?? {});
      const zeroIsL1 = lines.some((x) => Dec.tryOf(x?.price)?.isZero());
      probe(out, {
        inv: "PROBE-ZERO", title: "A ₹0 unit price is not taken as a quote and never becomes L1",
        expected: "Line 1 is refused or left unquoted for this vendor; L1 on line 1 is the other vendor's ₹50.",
        actual: !sa.submitted ? `The bid was refused (${sa.code ? `code ${sa.code}` : "no code"}).` : `Stored rows for the vendor: ${rowsA.map((r) => `${r?.price?.value ?? "—"}`).join(", ") || "none"}; L1 prices shown: ${lines.map((x) => x?.price).join(", ")}.`,
        verdict: zeroIsL1 ? "failed" : !sa.submitted && !sb.submitted ? "couldn't tell" : "passed", details: { evidence: { rowsA: rowsA.map((r) => r?.price), l1: l1.data?.l1_prices } },
      });
      const submitted: SubmittedBid[] = [];
      // vendor 1's stored rows include the unquoted ₹0 line, so its echo is judged by the invariants' own reading, not against this input
      if (sb.submitted) submitted.push({ companyUuid: B.vendorCompanyUuid, label: c.r.name(B), input: ib });
      // the ECHO compare needs line positions; with a dropped line the stored order differs, so ECHO is left to the invariants' own reading
      await integrity(c, out, ev, "after a ₹0 and a smallest-price quote", submitted, vs, false);
    },
  },
  {
    id: "S6",
    title: "Rank auction: the ranks every party sees follow the rank rule on the bid total",
    vendors: 3,
    cases: { "INV-RANK": ["EVI-RANK-009"], "INV-BEST": ["EVI-RANK-009"], "VENDOR-RANK": ["EVI-RANK-010"], "INV-BID": ["EVI-TOT-001"], "INV-SAME": ["EVI-TOT-002"], "INV-LINE": ["EVI-TAX-001"], "INV-AMOUNT": ["EVI-TOT-003"], "INV-ECHO": ["EVI-LINE-001"], "INV-BREAKUP": ["EVI-TAX-002"], "INV-SANE": ["EVI-TOT-005"], "INV-COUNT": ["EVI-TOT-004"], "INV-L1": ["EVI-RANK-001"], "INV-L1DATA": ["EVI-RANK-002"], "INV-SAV-LINE": ["EVI-SAV-001"], "INV-SAV-AGG": ["EVI-SAV-003"], "INV-ISOLATION": ["EVI-ISO-003"] },
    async run(c, vs, out) {
      const [A, B, C] = vs;
      const { widgets } = await stageWidgets(c.rig, undefined);
      const qtys = [20];
      const ev = await build(c, out, { tag: "S6_RankAuction", qtys, widgets, audience: [A, B, C], openFor: 30 * 60, kind: "auction" });
      if (!ev) return;
      const q = at(20, c.qp);
      const inputs: [QaVendor, BidInput][] = [
        [A, { lines: [{ price: at(101.25, c.pp), gst: 18, participant_quantity: q }] }],
        [B, { lines: [{ price: at(99.5, c.pp), gst: 18, participant_quantity: q }] }],
        [C, { lines: [{ price: at(100, c.pp), gst: 18, participant_quantity: q }] }],
      ];
      const submitted: SubmittedBid[] = [];
      for (const [v, inp] of inputs) {
        const s = await c.r.vendorBid(v, ev, inp);
        if (s.submitted) submitted.push({ companyUuid: v.vendorCompanyUuid, label: c.r.name(v), input: inp });
      }
      if (submitted.length < 2) {
        out.setupFailed = `only ${submitted.length} bid(s) went in`;
        return;
      }
      await integrity(c, out, ev, "three bids in a rank auction", submitted, vs, false);
      // VENDOR-RANK: each vendor's own rank, against the oracle (dense rank on the bid total, tie shift)
      const totals = new Map(submitted.map((s) => [s.companyUuid, computeBid(ev.template, s.input).global.gross_total!]));
      const { procolRanks } = await import("../src/integrity/calculator.js");
      const exp = procolRanks(totals);
      for (const s of submitted) {
        const v = vs.find((x) => x.vendorCompanyUuid === s.companyUuid)!;
        const api = await c.r.vendor(v);
        const r = api ? await send(api, "GET", `/trade/${ev.trade}?response_type=template&additional_fields=order_details`) : undefined;
        const m = JSON.stringify(r?.data ?? {}).match(/"rank":\s*\{[^}]*"value":\s*"?L?(\d+)/);
        const got = m ? Number(m[1]) : undefined;
        probe(out, {
          inv: "VENDOR-RANK", title: `${s.label} sees its own rank`, expected: `Rank ${exp.get(s.companyUuid)} (bid total ${totals.get(s.companyUuid)?.toString()}).`,
          actual: !r?.ok ? `The vendor's view could not be read (${r ? said(r) : "no session"}).` : got === undefined ? "No rank is shown to the vendor." : `The vendor sees rank ${got}.`,
          verdict: !r?.ok ? "couldn't tell" : got === undefined ? "couldn't tell" : got === exp.get(s.companyUuid) ? "passed" : "failed",
        });
      }
    },
  },
];

// ── running ────────────────────────────────────────────────────────────────

const failKey = (c: IntegrityCheck) => `${c.inv}:${c.title}`;
/** Invariants whose failures are confirmed ACROSS scenarios (each scenario is its own fresh event), not by a re-run. */
const CROSS_CONFIRMED = new Set(["INV-ISOLATION"]);
function failedKeys(o: ScenarioOut, forConfirm = false): Set<string> {
  const s = new Set<string>();
  for (const r of o.reports) for (const c of r.report.checks) if (c.verdict === "failed" && !(forConfirm && CROSS_CONFIRMED.has(c.inv))) s.add(`${r.when}|${failKey(c)}`);
  for (const p of o.probes) if (p.verdict === "failed") s.add(`probe|${failKey(p)}`);
  return s;
}

async function runScenario(rig: RigCtx, sc: Scenario, attempt: number, opts: { report: boolean; close: boolean }): Promise<ScenarioOut> {
  const t0 = Date.now();
  const r = new Rig(rig, (s) => log(s));
  const c: Ctx = { rig, r, pp: 2, qp: 2, report: opts.report, close: opts.close };
  const out: ScenarioOut = { id: sc.id, title: sc.title, attempt, reports: [], probes: [], notes: r.notes, startedAt: new Date(t0).toISOString(), durationMs: 0 };
  log(`▶ ${sc.id} (attempt ${attempt}) — ${sc.title} — ${rig.company}`);
  try {
    if (!rig.cat.productUuid || !rig.cat.locationUuid) out.setupFailed = "this client's catalog has no product or location";
    else if (rig.vendors.length < sc.vendors) out.setupFailed = `only ${rig.vendors.length} QA vendor(s) are set up for ${rig.company}`;
    else await Promise.race([sc.run(c, rig.vendors.slice(0, Math.max(sc.vendors, Math.min(4, rig.vendors.length))), out), sleep(35 * 60_000).then(() => r.note("The scenario hit its 35-minute limit and was stopped."))]);
  } catch (e) {
    out.setupFailed = `the runner stopped: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await r.dispose();
  }
  out.durationMs = Date.now() - t0;
  if (out.setupFailed) log(`  ! ${sc.id}: ${out.setupFailed}`);
  return out;
}

interface CaseVerdict {
  verdict: "passed" | "failed" | "couldn't tell" | "not run";
  reproduced?: boolean;
  evidence: { scenario: string; when: string; inv: string; title: string; actual: string; verdict: string; again?: string }[];
}

function caseVerdicts(first: ScenarioOut[], confirm: ScenarioOut[]): Record<string, CaseVerdict> {
  const RANK = { failed: 3, "couldn't tell": 2, passed: 1, "not run": 0 } as const;
  const out: Record<string, CaseVerdict> = {};
  for (const o of first) {
    const sc = SCENARIOS.find((s) => s.id === o.id)!;
    const again = confirm.find((x) => x.id === o.id);
    const againFails = again ? failedKeys(again) : undefined;
    const items: { when: string; c: IntegrityCheck }[] = [...o.reports.flatMap((r) => r.report.checks.map((c) => ({ when: r.when, c }))), ...o.probes.map((c) => ({ when: "probe", c }))];
    for (const { when, c } of items) {
      for (const id of sc.cases[c.inv] ?? []) {
        const e = (out[id] ??= { verdict: "not run", evidence: [] });
        let v: CaseVerdict["verdict"] = c.verdict;
        let againV: string | undefined;
        if (v === "failed" && CROSS_CONFIRMED.has(c.inv)) {
          const elsewhere = first.some((x) => x.id !== o.id && x.tradeUuid !== o.tradeUuid && x.reports.some((r) => r.report.checks.some((y) => y.inv === c.inv && y.verdict === "failed")));
          againV = elsewhere ? "failed on another scenario's fresh event" : "not seen on another event";
          if (!elsewhere) v = "couldn't tell";
          e.reproduced = (e.reproduced ?? true) && elsewhere;
        } else if (v === "failed") {
          if (againFails) {
            const k = `${when}|${failKey(c)}`;
            againV = againFails.has(k) ? "failed" : "did not fail again";
            if (!againFails.has(k)) v = "couldn't tell";
            e.reproduced = (e.reproduced ?? true) && againFails.has(k);
          } else e.reproduced = false;
        }
        e.evidence.push({ scenario: o.id, when, inv: c.inv, title: c.title, actual: c.actual, verdict: c.verdict, ...(againV ? { again: againV } : {}) });
        if (RANK[v] > RANK[e.verdict]) e.verdict = v;
      }
    }
  }
  return out;
}

/** Written after every scenario (partial: true) so an outage or crash keeps what was decided. */
function save(companyId: number, company: string, t0: number, first: ScenarioOut[], confirm: ScenarioOut[], done: boolean) {
  const cases = caseVerdicts(first, confirm);
  const tally = Object.values(cases).reduce<Record<string, number>>((a, c) => ({ ...a, [c.verdict]: (a[c.verdict] ?? 0) + 1 }), {});
  mkdirSync(RUNS_DIR, { recursive: true });
  const file = join(RUNS_DIR, `${companyId}-${new Date(t0).toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ companyId, company, partial: !done, startedAt: new Date(t0).toISOString(), durationMs: Date.now() - t0, cases, tally, first, confirm }, null, 1));
  return { file, cases, tally };
}

async function main() {
  if (flag("check")) {
    for (const s of SCENARIOS) console.log(`${s.id}  ${s.title}\n     cases: ${[...new Set(Object.values(s.cases).flat())].join(", ")}`);
    const md = join(here, "..", "..", "test-cases", "events-integrity.md");
    if (existsSync(md)) {
      const ids = new Set([...readFileSync(md, "utf8").matchAll(/^#{3,4}\s+(EVI-[A-Z]+-\d{3})/gm)].map((m) => m[1]));
      const used = new Set(SCENARIOS.flatMap((s) => Object.values(s.cases).flat()));
      const missing = [...used].filter((x) => !ids.has(x));
      console.log(`${ids.size} cases written; the runner decides ${used.size}${missing.length ? `; referenced but not written: ${missing.join(", ")}` : ""}.`);
    }
    return;
  }
  const companyId = Number(arg("c") ?? 198678);
  const only = arg("scenarios")?.split(",").map((s) => s.trim().toUpperCase());
  const budgetMin = Number(arg("budget-min") ?? 120);
  const opts = { report: !flag("no-report"), close: !flag("no-close") };
  const t0 = Date.now();
  const rig = await openRig(companyId);
  log(`${rig.company} (${companyId}) — ${rig.vendors.length} QA vendors; unit ${rig.unit}`);
  const first: ScenarioOut[] = [];
  const confirm: ScenarioOut[] = [];
  try {
    for (const sc of SCENARIOS.filter((s) => !only || only.includes(s.id))) {
      if ((Date.now() - t0) / 60_000 > budgetMin) {
        log(`budget of ${budgetMin} min reached — ${sc.id} not started`);
        break;
      }
      const o = await runScenario(rig, sc, 1, opts);
      first.push(o);
      if (!flag("no-confirm") && failedKeys(o, true).size) {
        log(`  ${sc.id} had ${failedKeys(o, true).size} failed check(s) — re-running on a second fresh event to confirm`);
        confirm.push(await runScenario(rig, sc, 2, opts));
      }
      save(companyId, rig.company, t0, first, confirm, false);
    }
  } finally {
    await rig.dispose();
  }
  const { file, cases, tally } = save(companyId, rig.company, t0, first, confirm, true);
  log(`cases: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  for (const [id, c] of Object.entries(cases).filter(([, c]) => c.verdict === "failed")) log(`  ✗ ${id} (reproduced on a second fresh event: ${c.reproduced ? "yes" : "no"}) — ${c.evidence.find((e) => e.verdict === "failed")?.actual}`);
  log(`written ${file}`);
}

process.on("unhandledRejection", (e) => log(`  ! an unhandled error was caught and ignored (environment?): ${e instanceof Error ? e.message : String(e)}`));
main().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
