/**
 * SELF-TEST for the Master QCS and Participants-list steps — no network, no
 * Procol, one headless browser on local HTML shaped like the recorded screens
 * (evidence/uicase-UI-AWD-011-…/01-open_prepared: the grid; evidence/
 * uicase-UI-SUR-001-…/02-open_participants: the list).
 *
 * It checks the verdict each failure would get, not only pass/fail: a step that
 * read the screen and found it wrong must be judged FAILED by the case runner,
 * and a step that could not read the screen must be judged COULD NOT TELL. The
 * runner's rule is copied below (prototype/scripts/run-ui-cases.ts, judge()).
 *
 *   npx tsx src/plan/qcsAudienceSelftest.ts
 */
import { chromium } from "@playwright/test";
import { runQcsAudienceStep } from "./qcsAudienceSteps.js";
import type { PlanStep } from "./steps.js";
import type { PlanContext } from "./screens.js";

/** prototype/scripts/run-ui-cases.ts PERFORM_FAILED — keep in step with it. */
const PERFORM_FAILED = /timeout|waiting for|not found|not visible|no element|locator|detached|intercept|could not find|strict mode|couldn't tell|automation needs update|not ready|no field|needs the|bounded step|no screen|no "/i;
const verdictOf = (step: string, detail: string): "failed" | "couldn't tell" =>
  (/^(expect_|attempt$)/.test(step) && !PERFORM_FAILED.test(detail)) || /rejected by the app|the app (said|refused|answered)|error message/i.test(detail) ? "failed" : "couldn't tell";

type Col = string[];
/** A Master QCS grid as the console renders it: header of vendors, then blocks of label rows. */
function qcs(vendors: string[], blocks: Array<{ heading: string; rows: Array<[string, ...Col]> }>): string {
  let ri = 1;
  const head = `<div role="row" aria-rowindex="${ri++}"><div role="columnheader" aria-colindex="1"></div>${vendors
    .map((v, i) => `<div role="columnheader" aria-colindex="${i + 2}"><h2>${v}</h2><p></p></div>`)
    .join("")}<div role="columnheader" aria-colindex="${vendors.length + 2}"></div></div>`;
  const body = blocks
    .map(
      (b) =>
        `<div role="row" aria-rowindex="${ri++}"><div role="gridcell" aria-colindex="1"><button>▾</button><h3>${b.heading}</h3></div></div>` +
        b.rows
          .map(
            ([label, ...cells]) =>
              `<div role="row" aria-rowindex="${ri++}"><div role="gridcell" aria-colindex="1">${label}</div>${cells
                .map((c, i) => `<div role="gridcell" aria-colindex="${i + 2}"><button>${c}</button></div>`)
                .join("")}<div role="gridcell"></div></div>`,
          )
          .join(""),
    )
    .join("");
  // A short scroll box, so the reader has to scroll and merge rows by aria-rowindex.
  return `<html><body><div role="tablist"><div role="tab" aria-selected="true">Master QCS</div></div>
<div role="grid" style="height:160px;overflow:auto;display:block">${head}<div role="rowgroup">${body}</div></div></body></html>`;
}

const ALPHA = "Alpha Traders Pvt Ltd";
const BETA = "QA_Platform Vendor 1 1790820862139";
const GOOD = qcs([ALPHA, BETA], [
  { heading: "AAC BLOCKS •1100000401 •Variant 1", rows: [["Product", "AAC BLOCKS", "AAC BLOCKS"], ["Qty Offer", "64 KG", "64 KG"], ["Rank", "2", "1"], ["RFQ Landed", "–", "–"], ["RFQ Rate", "₹ 87 /KG", "₹ 80 /KG"], ["RFQ Amount", "₹ 5,568", "₹ 5,120"], ["Final Negotiated Rate", "–", "–"], ["Last Purchase Price", "₹ 37 /KG", "₹ 37 /KG"]] },
  { heading: "CEMENT •1100000402", rows: [["Qty Offer", "10 BAG", "–"], ["Rank", "1", "–"], ["RFQ Rate", "₹ 300.50 /BAG", "–"], ["RFQ Amount", "₹ 3,005", "–"]] },
  { heading: "Rfq Final", rows: [["Sum Total", "₹ 8,573", "₹ 5,120"], ["PQ Rating", "–", "–"]] },
]);
const BAD_MATH = GOOD.replace("₹ 5,568", "₹ 5,600");
const BAD_TOTAL = GOOD.replace("₹ 8,573", "₹ 9,000");
const BAD_RANK = qcs([ALPHA, BETA], [{ heading: "AAC BLOCKS", rows: [["Qty Offer", "64 KG", "64 KG"], ["Rank", "1", "2"], ["RFQ Rate", "₹ 87 /KG", "₹ 80 /KG"], ["RFQ Amount", "₹ 5,568", "₹ 5,120"]] }]);
// Recorded 14 Oct (evidence/plan-mv7zdopu/03): two vendors tied at ₹1,000, both shown as Rank 2.
const TIE = qcs(["Sampletest.sas@sasco45.in", "Mehak234 pvt. ltd."], [{ heading: "AAC BLOCKS •1100000401 •Variant 1", rows: [["Qty Offer", "10 Unit", "10 Unit"], ["Rank", "2", "2"], ["RFQ Rate", "₹ 100 /Unit", "₹ 100 /Unit"], ["RFQ Amount", "₹ 1,000", "₹ 1,000"]] }, { heading: "Rfq Final", rows: [["Sum Total", "₹ 1,000", "₹ 1,000"]] }]);
const PLACEHOLDER = qcs(["Vendor 1"], [{ heading: "AAC BLOCKS", rows: [["Qty Offer", "64 KG"], ["Rank", "1"], ["RFQ Rate", "₹ 87 /KG"], ["RFQ Amount", "₹ 5,568"]] }]);
const NO_GRID = `<html><body><div role="tab">Master QCS</div><p>No bids are placed yet!</p></body></html>`;

/** A published event's Participants list: search, the selected-only switch, rows, pagination (10 a page). */
function participants(vendors: Array<{ name: string; email: string; selected: boolean }>): string {
  return `<html><body>
<input placeholder="Search vendors" id="q"/>
<span>Show only selected vendors</span><button role="switch" class="ant-switch" aria-checked="false" id="sw"></button>
<ul id="list"></ul><p id="empty" style="display:none">No vendors to show</p>
<ul class="ant-pagination"><li class="ant-pagination-prev" title="Previous Page">‹</li><li class="ant-pagination-next" title="Next Page" id="next">›</li></ul>
<script>
const V=${JSON.stringify(vendors)};let page=0;
function shown(){const q=document.getElementById('q').value.toLowerCase();const only=document.getElementById('sw').getAttribute('aria-checked')==='true';
  return V.filter(v=>(!only||v.selected)&&(v.name+' '+v.email).toLowerCase().includes(q));}
function render(){const all=shown();const pages=Math.max(1,Math.ceil(all.length/10));if(page>=pages)page=pages-1;
  const rows=all.slice(page*10,page*10+10);
  document.getElementById('list').innerHTML=rows.map((v,i)=>'<li class="rowItem"><input type="checkbox" '+(v.selected?'checked':'')+' data-i="'+V.indexOf(v)+'"/><p>'+v.name+'</p><p>-</p><p>'+v.email+'</p><p>-</p>'+(v.selected?'<button data-testid="add-bid-button">Add Bid</button>':'')+'<button>Add Price Cap</button></li>').join('');
  document.getElementById('empty').style.display=rows.length?'none':'block';
  const n=document.getElementById('next');n.className='ant-pagination-next'+(page>=pages-1?' ant-pagination-disabled':'');}
document.getElementById('q').addEventListener('input',()=>{page=0;setTimeout(render,300)});
document.getElementById('sw').addEventListener('click',e=>{const s=e.target;s.setAttribute('aria-checked',s.getAttribute('aria-checked')==='true'?'false':'true');page=0;render()});
document.getElementById('next').addEventListener('click',()=>{page++;render()});
document.getElementById('list').addEventListener('change',e=>{const i=+e.target.dataset.i;V[i].selected=e.target.checked;render()});
render();
</script></body></html>`;
}
const AUDIENCE = participants([
  { name: BETA, email: "qa_1790820862139_v1@example.com", selected: true },
  ...Array.from({ length: 10 }, (_, i) => ({ name: `Selected Vendor ${String.fromCharCode(65 + i)} Ltd`, email: `sel${i}@vendors.in`, selected: true })),
  { name: "Unselected Supplies", email: "uns@vendors.in", selected: false },
  { name: "QA_Platform Vendor 2 1790820862140", email: "qa_1790820862140_v2@example.com", selected: false },
]);
const QA_NAMES = async () => [BETA, "QA_Platform Vendor 2 1790820862140"];

interface Case {
  name: string;
  html: string;
  step: PlanStep;
  expect: "pass" | "failed" | "couldn't tell";
  /** text the result must contain */
  says?: string;
  context?: PlanContext;
  /** steps run first on the same page; each must pass */
  before?: PlanStep[];
  qaNames?: () => Promise<string[]>;
  /** run with SPINE_QA_VENDORS_ONLY=1 (QA test vendors only); by default the product's own vendors */
  qaOnly?: boolean;
}

const CTX: PlanContext = { state: "bid", vendorName: BETA, values: { bidPrice: "80", quantity: "64", bidTotal: "5120" } };

const CASES: Case[] = [
  // ── Master QCS: vendor columns
  { name: "two vendor columns are counted", html: GOOD, step: { step: "expect_qcs_vendors", args: { count: 2, vendors: [ALPHA] } }, expect: "pass" },
  { name: "a wrong column count FAILS", html: GOOD, step: { step: "expect_qcs_vendors", args: { count: 1 } }, expect: "failed", says: "2 vendor column" },
  { name: "a placeholder vendor name FAILS", html: PLACEHOLDER, step: { step: "expect_qcs_vendors", args: {} }, expect: "failed", says: "placeholder" },
  { name: "a QA vendor whose name contains 'Vendor 1' is not a placeholder", html: GOOD, step: { step: "expect_qcs_vendors", args: {} }, expect: "pass" },
  { name: "no grid (no bids) is COULD NOT TELL", html: NO_GRID, step: { step: "expect_qcs_vendors", args: { count: 1 } }, expect: "couldn't tell", says: "no bids are placed" },
  // ── one cell
  { name: "Rank 1 for the case's own vendor", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Rank", number: 1 } }, expect: "pass", context: CTX },
  { name: "Rank 1 for the other vendor FAILS (reads 2)", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Rank", vendor: "Alpha", number: 1 } }, expect: "failed", says: "reads “2”" },
  { name: "the rate matches the API's bid price", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "RFQ Rate", key: "bidPrice" } }, expect: "pass", context: CTX },
  { name: "'rate per unit' finds the RFQ Rate row (not Final Negotiated Rate)", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "rate per unit", vendor: 2, number: 80 } }, expect: "pass", says: "RFQ Rate" },
  { name: "'Auction/RFQ Amount' finds RFQ Amount", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Auction/RFQ Amount", vendor: 2, key: "bidTotal" } }, expect: "pass", context: CTX },
  { name: "Sum Total in the Final section", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Sum Total", vendor: 1, equals: "₹8573" } }, expect: "pass" },
  { name: "a line the vendor did not bid can be asserted empty", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Rank", vendor: 2, product: "CEMENT", equals: "–" } }, expect: "pass" },
  { name: "an empty cell where a value is expected FAILS", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Rank", vendor: 2, product: "CEMENT", number: 1 } }, expect: "failed", says: "(empty)" },
  { name: "a row the grid does not have is COULD NOT TELL", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Delivery Lead Time", vendor: 1 } }, expect: "couldn't tell", says: "its rows" },
  { name: "a vendor the grid does not have is COULD NOT TELL", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Rank", vendor: "Gamma Corp" } }, expect: "couldn't tell" },
  { name: "a key the API did not hand over is COULD NOT TELL", html: GOOD, step: { step: "expect_qcs_cell", args: { row: "Rank", vendor: 1, key: "deliveryBy" } }, expect: "couldn't tell", context: CTX },
  // ── arithmetic
  { name: "amount = rate × qty and Sum Total = sum of lines", html: GOOD, step: { step: "expect_qcs_amounts", args: {} }, expect: "pass", says: "5 check" },
  { name: "a wrong line amount FAILS", html: BAD_MATH, step: { step: "expect_qcs_amounts", args: {} }, expect: "failed", says: "5,600" },
  { name: "a wrong Sum Total FAILS", html: BAD_TOTAL, step: { step: "expect_qcs_amounts", args: { vendor: 1 } }, expect: "failed", says: "Sum Total" },
  { name: "one product only skips the Sum Total", html: BAD_TOTAL, step: { step: "expect_qcs_amounts", args: { product: "AAC" } }, expect: "pass" },
  // ── ranks
  { name: "ranks follow the amounts (lowest is Rank 1)", html: GOOD, step: { step: "expect_qcs_ranks", args: {} }, expect: "pass" },
  { name: "inverted ranks FAIL", html: BAD_RANK, step: { step: "expect_qcs_ranks", args: {} }, expect: "failed", says: "do not follow" },
  { name: "a sell event reads the other way (so the good grid fails there)", html: GOOD, step: { step: "expect_qcs_ranks", args: { order: "highest", product: "AAC" } }, expect: "failed" },
  { name: "a tie at the best amount is recorded, not judged (no false bug)", html: TIE, step: { step: "expect_qcs_ranks", args: {} }, expect: "couldn't tell", says: "tie at the best" },
  { name: "the recorded tie grid's arithmetic holds", html: TIE, step: { step: "expect_qcs_amounts", args: {} }, expect: "pass" },
  { name: "needing more vendors than the state has is COULD NOT TELL", html: GOOD, step: { step: "expect_qcs_ranks", args: { atLeast: 3 } }, expect: "couldn't tell", says: "needs at least 3" },
  // ── participants
  { name: "the case's vendor is listed, ticked, with Add Bid (searched first)", html: AUDIENCE, step: { step: "expect_participant", args: { selected: true, addBid: true } }, expect: "pass", context: CTX },
  { name: "a vendor not on the list FAILS as absent", html: AUDIENCE, step: { step: "expect_participant", args: { vendor: "Nobody Industries" } }, expect: "failed", says: "absent" },
  { name: "Add Bid where the case expects none FAILS", html: AUDIENCE, step: { step: "expect_participant", args: { vendor: BETA, addBid: false } }, expect: "failed", says: "offers Add Bid" },
  { name: "an unselected vendor reads as unticked once every vendor shows", html: AUDIENCE, step: { step: "search_participants", args: { vendor: "Unselected" } }, expect: "pass", says: "Unselected Supplies" },
  { name: "present:false passes for a vendor nobody has", html: AUDIENCE, step: { step: "expect_participant", args: { vendor: "Nobody Industries", present: false } }, expect: "pass" },
  { name: "the round's vendors are counted over two pages", html: AUDIENCE, step: { step: "expect_participant_count", args: { count: 11 } }, expect: "pass", says: "2 page" },
  { name: "a wrong count FAILS", html: AUDIENCE, step: { step: "expect_participant_count", args: { count: 12 } }, expect: "failed", says: "lists 11" },
  { name: "QA-only: without the QA vendor list it is COULD NOT TELL (nobody is clicked)", html: AUDIENCE, qaOnly: true, step: { step: "select_participant", args: { vendor: "Unselected Supplies" } }, expect: "couldn't tell", says: "nobody was selected" },
  { name: "QA-only: a vendor that is not a QA vendor is refused (nobody is clicked)", html: AUDIENCE, qaOnly: true, qaNames: QA_NAMES, step: { step: "select_participant", args: { vendor: "Unselected Supplies" } }, expect: "couldn't tell", says: "QA vendors only" },
  { name: "QA-only: it adds the first QA vendor not yet on the round", html: AUDIENCE, qaOnly: true, qaNames: QA_NAMES, step: { step: "select_participant", args: {} }, expect: "pass", says: "held 11" },
  { name: "after adding, a vendorless expect_participant means the added vendor (ticked)", html: AUDIENCE, qaOnly: true, qaNames: QA_NAMES, before: [{ step: "select_participant", args: {} }], step: { step: "expect_participant", args: { selected: true } }, expect: "pass", says: "Vendor 2" },
  { name: "after adding, grewBy:1 counts one more than before", html: AUDIENCE, qaOnly: true, qaNames: QA_NAMES, before: [{ step: "select_participant", args: {} }], step: { step: "expect_participant_count", args: { grewBy: 1 } }, expect: "pass", says: "lists 12" },
  { name: "after adding, the old fixed count FAILS (the trap the first compile fell into)", html: AUDIENCE, qaOnly: true, qaNames: QA_NAMES, before: [{ step: "select_participant", args: {} }], step: { step: "expect_participant_count", args: { count: 1 } }, expect: "failed", says: "lists 12" },
  { name: "event vendors (default): with none named it adds the first vendor on the list not yet on the round", html: AUDIENCE, step: { step: "select_participant", args: {} }, expect: "pass", says: "Unselected Supplies" },
  { name: "event vendors (default): a named vendor that is not a QA vendor is added", html: AUDIENCE, step: { step: "select_participant", args: { vendor: "Unselected Supplies" } }, expect: "pass", says: "held 11" },
  { name: "event vendors (default): grewBy:1 after adding", html: AUDIENCE, before: [{ step: "select_participant", args: {} }], step: { step: "expect_participant_count", args: { grewBy: 1 } }, expect: "pass", says: "lists 12" },
  { name: "event vendors (default): the database is never asked for QA vendors", html: AUDIENCE, qaNames: async () => { throw new Error("QA list must not be read"); }, step: { step: "select_participant", args: {} }, expect: "pass" },
  { name: "grewBy without select_participant first is COULD NOT TELL", html: AUDIENCE, step: { step: "expect_participant_count", args: { grewBy: 1 } }, expect: "couldn't tell", says: "no select_participant" },
];

// select_participant must never reach the database here: no DATABASE_URL, so the QA list is empty.
delete process.env.DATABASE_URL;

const browser = await chromium.launch({ headless: true });
let bad = 0;
for (const c of CASES) {
  const page = await (await browser.newContext()).newPage();
  await page.setContent(c.html);
  let got: "pass" | "failed" | "couldn't tell";
  let detail = "";
  const ctx = { page, context: c.context ?? { state: "bid" as const }, qaNames: c.qaNames };
  if (c.qaOnly) process.env.SPINE_QA_VENDORS_ONLY = "1";
  else delete process.env.SPINE_QA_VENDORS_ONLY;
  try {
    for (const b of c.before ?? []) await runQcsAudienceStep(ctx, b);
    detail = (await runQcsAudienceStep(ctx, c.step)) ?? "(not handled)";
    got = "pass";
  } catch (e) {
    detail = (e as Error).message;
    got = verdictOf(c.step.step, detail);
  }
  const ok = got === c.expect && (!c.says || detail.toLowerCase().includes(c.says.toLowerCase()));
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    ${got}${got === c.expect ? "" : ` (expected ${c.expect})`} — ${detail.slice(0, 220)}`);
  await page.context().close();
}
await browser.close();
console.log(`\n${CASES.length - bad}/${CASES.length} as expected`);
process.exitCode = bad ? 1 : 0;
