import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lintSitePlan } from "../src/agents/planner.js";
/** Apply the site lint (the deterministic part of the compiler) to plans compiled before it existed. */
const dir = process.argv[2];
let changed = 0;
for (const f of readdirSync(join(dir, "plans"))) {
  const file = join(dir, "plans", f);
  const p = JSON.parse(readFileSync(file, "utf8"));
  const out = lintSitePlan(p.plan);
  if (!out.repairs.length) continue;
  changed++;
  console.log(`[relint] ${p.id}: ${out.repairs.join("; ")}`);
  writeFileSync(file, JSON.stringify({ ...p, plan: out.plan, warnings: [...(p.warnings ?? []), ...out.repairs] }, null, 2));
}
console.log(`[relint] ${changed} plan(s) changed`);
