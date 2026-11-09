/**
 * Does "find the cases about X" find the right sections? Typed topics → the section names that must appear
 * among the top groups (regexes on the section name). Reports hit@1, recall@5 and misses, so a change to the
 * synonyms or weights is measured, not felt.
 *
 *   npx tsx scripts/eval-case-search.ts            (words + meaning)
 *   npx tsx scripts/eval-case-search.ts --fill     also embed the cases the memory lacks, once
 */
import { searchCases, fillCaseIndex } from "../src/checks/caseSearch.js";

const CASES: Array<{ q: string; want: RegExp[] }> = [
  { q: "test placing bids", want: [/vendor's bid|vendor portal — opening the event and submitting|bidding —|pricing the bid/i] },
  { q: "placing bids", want: [/vendor's bid|vendor portal — opening the event and submitting|bidding —/i] },
  { q: "vendor submits a quote", want: [/vendor's bid|vendor portal — opening the event and submitting|bidding —/i] },
  { q: "supplier bids on an rfq", want: [/vendor's bid|vendor portal — opening|bidding —/i] },
  { q: "surrogate bid", want: [/surrogate/i] },
  { q: "buyer bids on behalf of the vendor", want: [/surrogate/i] },
  { q: "reject bid", want: [/reject/i] },
  { q: "rejected bids list", want: [/reject/i] },
  { q: "extend submission time", want: [/extend|submission time|clock|time extension/i] },
  { q: "increase event time", want: [/extend|submission time|clock|event time/i] },
  { q: "convert rfq to auction", want: [/conver/i] },
  { q: "move rfq to auction", want: [/conver/i] },
  { q: "counter offer", want: [/counter/i] },
  { q: "negotiate with the vendor", want: [/counter/i] },
  { q: "master qcs ranks", want: [/master qcs|qcs/i] },
  { q: "award to the L1 vendor", want: [/award/i] },
  { q: "partial awarding to multiple vendors", want: [/award|split/i] },
  { q: "create new version", want: [/version|amend/i] },
  { q: "withdraw event", want: [/withdraw|force-end/i] },
  { q: "publish an rfq", want: [/publish/i] },
  { q: "publish without a title", want: [/publish/i] },
  { q: "schedule and bid window", want: [/schedule|window|clock/i] },
  { q: "price cap", want: [/price cap|cap/i] },
  { q: "technical evaluation score", want: [/technical|evaluat|score/i] },
  { q: "auction strategy rank based", want: [/strateg|auction configuration|rank-based/i] },
  { q: "dutch auction", want: [/dutch|strateg|auction/i] },
  { q: "line items quantity", want: [/line item|items|sheet/i] },
  { q: "savings and historical price", want: [/saving/i] },
  { q: "purchase order after award", want: [/purchase order|\bpo\b|award/i] },
  { q: "vendor onboarding form", want: [/onboard/i] },
  { q: "approval workflow for award", want: [/approv/i] },
  { q: "masking vendor names", want: [/mask|sealed/i] },
  { q: "multi currency conversion rate", want: [/currenc/i] },
  { q: "bid revision by the vendor", want: [/revis|vendor's bid|bidding/i] },
  { q: "uninvited vendor cannot open the event", want: [/participation|audience|vendor's event|invite/i] },
  { q: "vendor ko bid dena hai", want: [/vendor's bid|vendor portal — opening|bidding —/i] },
  { q: "bid reject karna hai", want: [/reject/i] },
  { q: "lot wise awarding", want: [/lot|award/i] },
  { q: "boq upload line items", want: [/boq/i] },
  { q: "order activity log", want: [/activity|audit|log/i] },
];

const fill = process.argv.includes("--fill");
if (fill) {
  const r = await fillCaseIndex((l) => console.log("  ·", l));
  console.log(`index: ${r.total} cases, ${r.fromStore} vectors from the store, ${r.extra} embedded here`);
}
let hit1 = 0, rec5 = 0;
const misses: string[] = [];
for (const t of CASES) {
  const r = await searchCases(t.q, { groups: 5, perGroup: 3 });
  const names = r.groups.map((g) => g.section);
  const ok1 = names[0] ? t.want.some((w) => w.test(names[0])) : false;
  const ok5 = names.some((n) => t.want.some((w) => w.test(n)));
  if (ok1) hit1++;
  if (ok5) rec5++;
  if (!ok5) misses.push(`✗ ${t.q}  →  ${names.slice(0, 5).map((n) => n.slice(0, 50)).join(" | ")}`);
  else if (!ok1) misses.push(`~ ${t.q}  →  top: ${names[0]?.slice(0, 60)}`);
  console.log(`${ok1 ? "✓" : ok5 ? "~" : "✗"} ${t.q.padEnd(44)} ${r.total.toString().padStart(4)} cases · ${r.groups.length} groups · ${r.ms}ms · ${r.via} · top: ${names[0]?.slice(0, 60) ?? "-"}`);
}
console.log(`\nhit@1 ${hit1}/${CASES.length} (${Math.round((100 * hit1) / CASES.length)}%) · recall@5 ${rec5}/${CASES.length} (${Math.round((100 * rec5) / CASES.length)}%)`);
if (misses.length) console.log(misses.join("\n"));
process.exit(0);
