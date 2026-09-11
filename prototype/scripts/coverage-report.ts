import { routingCoverage, routeFor } from "../src/checks/caseRouting.js";
import { allCases, catalogStats } from "../src/checks/testCatalog.js";

/**
 * What the catalog covers and what actually runs today — counted, not claimed.
 * `npm run coverage`
 */
const s = catalogStats();
const c = routingCoverage();
console.log(`Catalog: ${s.total} cases — ${s.ui} UI, ${s.api} API`);
console.log(`  verdict: automate ${s.automate} · automate-later ${s.automateLater} · manual ${s.manual}`);
console.log(`Routable to a real runner: ${c.runnable}/${c.total}  (${c.unrunnable} not)`);
for (const [kind, n] of Object.entries(c.byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(12)} ${n}`);
}
const gaps = new Map<string, number>();
for (const k of allCases()) if (!routeFor(k).runnable && k.verdict !== "manual") {
  gaps.set(`${k.group} — ${k.section}`, (gaps.get(`${k.group} — ${k.section}`) ?? 0) + 1);
}
if (gaps.size) {
  console.log(`\nSections with automatable cases and no runner:`);
  for (const [g, n] of [...gaps].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${g}`);
}
