/**
 * The written catalog, counted against what really runs — `npm run coverage:report`.
 *
 *   npm run coverage:report                    all clients' history
 *   npm run coverage:report -- --c 198678      one client's history
 *   npm run coverage:report -- --json out.json also write the whole report (every case) as JSON
 *   npm run coverage:report -- --as-of 2026-10-03T05:37:00Z   only results recorded up to then
 *
 * Prints: runnable now (and how strongly), ever run, last result
 * (passing / failing / couldn't tell), per journey and per area, and the build
 * order — the 50 most important "automate" cases (P0 first, then P1) that have
 * no runner of their own yet.
 */
import { writeFileSync } from "node:fs";
import { coverageTruth, type Bucket } from "../src/checks/metrics.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const companyId = Number(arg("c") ?? "") || undefined;
const jsonOut = arg("json");
/** count only results recorded up to this ISO time — "what was the coverage before that run?" */
const asOf = arg("as-of");

const r = await coverageTruth({ companyId, withCases: true, asOf });
const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const t = r.totals;

console.log(`\nCOVERAGE OF THE WRITTEN CATALOG — ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`);
console.log(`history: ${r.historySource}${companyId ? `, client ${companyId} only` : ", every client"}${asOf ? `, results up to ${asOf}` : ""}\n`);
console.log(`Catalog                     ${t.total} cases (${t.automatable} meant for automation, ${t.total - t.automatable} for a person)`);
console.log(`Runnable now                ${t.runsNow}  = ${pc(t.runsNow, t.automatable)} of the automatable cases`);
for (const [k, n] of Object.entries(t.byStrength).sort((a, b) => b[1] - a[1])) {
  const what: Record<string, string> = {
    exact: "a runner sends this case's own request / steps",
    "same-request": "same request, weaker assertion (no crash)",
    compile: "a plan is compiled from the prose at run time (browser compiler, or the API test compiler)",
    approximate: "request inferred from the section — NOT counted as runnable",
    weak: "generic valid request without the case's change — NOT counted",
    area: "only other cases for the same area run — NOT counted",
    none: "no runner (incl. manual)",
  };
  console.log(`    ${k.padEnd(13)} ${String(n).padStart(5)}   ${what[k] ?? ""}`);
}
{
  const all = r.cases;
  const plan = all.filter((c) => c.route === "api-plan");
  if (plan.length) console.log(`    of which API test compiler: ${plan.length} cases, ${plan.filter((c) => c.runsNow).length} compile to a full plan without the AI (counted as runnable)`);
  const ui = all.filter((c) => c.route === "ui-compile" && c.runsNow);
  if (ui.length) console.log(`    of which browser compiler:  ${ui.length} cases in areas its steps cover (counted as runnable; coverage known only when compiled)`);
}
console.log(`Ever run                    ${t.everRun}  = ${pc(t.everRun, t.total)} of the catalog`);
console.log(`Last result                 passing ${t.pass} · failing ${t.fail} · couldn't tell ${t.inconclusive}`);

const table = (title: string, rows: Bucket[]) => {
  console.log(`\n${title}`);
  console.log(`  ${"".padEnd(46)} ${"cases".padStart(6)} ${"runnable".padStart(9)} ${"ever run".padStart(9)} ${"pass".padStart(6)} ${"fail".padStart(6)} ${"c/t".padStart(5)}`);
  for (const b of rows) {
    if (!b.total) continue;
    console.log(
      `  ${b.label.slice(0, 46).padEnd(46)} ${String(b.total).padStart(6)} ${String(b.runsNow).padStart(9)} ${String(b.everRun).padStart(9)} ${String(b.pass).padStart(6)} ${String(b.fail).padStart(6)} ${String(b.inconclusive).padStart(5)}`,
    );
  }
};
table("PER JOURNEY", r.byJourney);
table("PER AREA", r.byArea);

console.log(`\nBUILD ORDER — ${r.buildOrderTotal} P0/P1 "automate" cases have no runner of their own; the first 50:`);
r.buildOrder.forEach((c, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${c.priority} ${c.id.padEnd(16)} ${c.title.slice(0, 70)}`);
  console.log(`      ${c.journey ?? "—"} · now: ${c.route}/${c.strength} — ${c.because.slice(0, 150)}`);
});

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(r, null, 1));
  console.log(`\nwrote ${jsonOut}`);
}
await closeSpineDb();
