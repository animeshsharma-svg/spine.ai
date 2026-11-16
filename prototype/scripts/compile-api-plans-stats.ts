/**
 * API-PLAN COMPILE STATS — numbers only, no model.
 *
 *   npx tsx scripts/compile-api-plans-stats.ts            the before/after table + gap clusters
 *   npx tsx scripts/compile-api-plans-stats.ts --sample G  print a few cases of group G (their words)
 *   npx tsx scripts/compile-api-plans-stats.ts --groups    api-plan cases per group
 *
 * Counts every catalog case whose route is the API test compiler (caseRouting
 * kind "api-plan"), what is stored for it (data/compiled-plans/api), and whether
 * the stored plan speaks for the case (compiledPlans.planSpeaksForCase).
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { allCases } from "../src/checks/testCatalog.js";
import { routeFor } from "../src/checks/caseRouting.js";
import { planSpeaksForCase, storedApiPlan, allStoredApiPlans, COMPILED_API_DIR } from "../src/checks/compiledPlans.js";
import { catalogCaseText } from "../src/agents/apiPlanner.js";
import { existsSync, readFileSync } from "node:fs";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

const cases = allCases().filter((c) => routeFor(c).kind === "api-plan");
const idxFile = join(COMPILED_API_DIR, "index.json");
const idx: { cases: Record<string, { coverage: string; why?: string[]; source?: string }> } = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, "utf8")) : { cases: {} };

if (flag("groups")) {
  const byG: Record<string, number> = {};
  for (const c of cases) byG[c.group] = (byG[c.group] ?? 0) + 1;
  console.log(Object.entries(byG).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}: ${n}`).join("\n"));
  process.exit(0);
}
if (arg("sample")) {
  const g = arg("sample")!;
  const n = Number(arg("n") ?? 4);
  for (const c of cases.filter((x) => x.group === g || x.id.startsWith(g)).slice(0, n)) {
    const st = idx.cases[c.id];
    console.log(`\n### ${c.id} [${c.priority}/${c.verdict}] stored=${st?.coverage ?? "—"} speaks=${planSpeaksForCase(c.id, catalogCaseText(c))}\n${catalogCaseText(c)}\nrefs: ${c.refs.join(",")}`);
    if (st?.why?.length) console.log(`why: ${st.why.join(" | ").slice(0, 400)}`);
  }
  process.exit(0);
}

const t = { total: cases.length, stored: 0, full: 0, partialSpeaks: 0, partialSilent: 0, none: 0, never: 0, speaks: 0 };
const clusters: Record<string, { n: number; ex: string }> = {};
const stored = new Set(allStoredApiPlans().map((p) => p.meta.caseId));
for (const c of cases) {
  const sp = storedApiPlan(c.id);
  const st = idx.cases[c.id];
  const speaks = planSpeaksForCase(c.id, catalogCaseText(c));
  if (speaks) t.speaks += 1;
  if (sp) {
    t.stored += 1;
    if (sp.meta.coverage === "full" && sp.meta.validated) t.full += 1;
    else if (speaks) t.partialSpeaks += 1;
    else t.partialSilent += 1;
  } else if (st) t.none += 1;
  else t.never += 1;
  if (!speaks) {
    const why = sp ? sp.meta.gaps : st?.why ?? ["never compiled"];
    for (const w of why.length ? why : ["(no reason recorded)"]) {
      const k = w.replace(/“[^”]*”/g, "“…”").replace(/\{\{\w+\}\}/g, "{{…}}").replace(/\b(EDGE|API|AUC|UI)-[A-Z]+-\d+\b/g, "<case>").replace(/\b(GET|POST|PATCH|PUT) \S+/g, "<endpoint>").slice(0, 110);
      clusters[k] ??= { n: 0, ex: c.id };
      clusters[k].n += 1;
    }
  }
}
console.log(`api-plan cases: ${t.total}`);
console.log(`  stored: ${t.stored} (full ${t.full}, partial that speaks ${t.partialSpeaks}, partial that does not ${t.partialSilent})`);
console.log(`  none (tried, no plan): ${t.none}`);
console.log(`  never compiled: ${t.never}`);
console.log(`  plans that speak for their case: ${t.speaks}`);
console.log(`  stored files not routed api-plan today: ${[...stored].filter((id) => !cases.some((c) => c.id === id)).length}`);
console.log(`\nGap clusters (cases whose plan does not speak), top 40:`);
for (const [k, v] of Object.entries(clusters).sort((a, b) => b[1].n - a[1].n).slice(0, 40)) console.log(`  ${String(v.n).padStart(4)}  ${k}  e.g. ${v.ex}`);

// --endpoints: the requests the cases themselves name ("`PATCH /bids/{{bidUuid}}/reject`"), by route
if (flag("endpoints")) {
  const by: Record<string, { n: number; ex: string; stored: number }> = {};
  for (const c of cases) {
    const text = `${c.setup}\n${c.steps}`;
    for (const m of text.matchAll(/`?\b(GET|POST|PATCH|PUT|DELETE)\s+(\/[A-Za-z0-9_\/{}:.?=&-]+)/g)) {
      const route = m[2].split("?")[0].replace(/\{\{\w+\}\}|:[a-z_]+|\b\d+\b/g, ":id");
      const k = `${m[1]} ${route}`;
      by[k] ??= { n: 0, ex: c.id, stored: 0 };
      by[k].n += 1;
      if (planSpeaksForCase(c.id, catalogCaseText(c))) by[k].stored += 1;
    }
  }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 80)) console.log(`${String(v.n).padStart(4)} (${v.stored} speak)  ${k}  e.g. ${v.ex}`);
  process.exit(0);
}

// --mutations: the journey-mutation family (API-N*): the distinct sentence shapes after "exactly as the journey does."
if (flag("mutations")) {
  const shapes: Record<string, { n: number; ex: string }> = {};
  const eps: Record<string, number> = {};
  const exp: Record<string, number> = {};
  for (const c of cases.filter((x) => /^API-N[A-Z]+-\d+$/.test(x.id))) {
    const m = c.steps.match(/Send `(GET|POST|PATCH|PUT) ([^`]+)` exactly as the journey does\.\s*(.*)$/s);
    if (!m) { shapes["(no match) " + c.steps.slice(0, 80)] ??= { n: 0, ex: c.id }; shapes["(no match) " + c.steps.slice(0, 80)].n++; continue; }
    eps[`${m[1]} ${m[2]}`] = (eps[`${m[1]} ${m[2]}`] ?? 0) + 1;
    const s = m[3].replace(/`[^`]+`/g, "`X`").replace(/\b\d+\b/g, "N").replace(/"[^"]*"/g, '"S"').slice(0, 120);
    shapes[s] ??= { n: 0, ex: c.id };
    shapes[s].n++;
    const e = c.expected.replace(/\b\d+\b/g, "N").slice(0, 100);
    exp[e] = (exp[e] ?? 0) + 1;
  }
  console.log("ENDPOINTS"); for (const [k, v] of Object.entries(eps).sort((a, b) => b[1] - a[1])) console.log(`  ${v} ${k}`);
  console.log("MUTATIONS"); for (const [k, v] of Object.entries(shapes).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${v.n} ${k}  e.g. ${v.ex}`);
  console.log("EXPECTED"); for (const [k, v] of Object.entries(exp).sort((a, b) => b[1] - a[1])) console.log(`  ${v} ${k}`);
  process.exit(0);
}

// --by-group: per catalog group, how many plans speak for their case
if (flag("by-group")) {
  const by: Record<string, { n: number; speaks: number; full: number; none: number }> = {};
  for (const c of cases) {
    const g = c.group;
    by[g] ??= { n: 0, speaks: 0, full: 0, none: 0 };
    by[g].n += 1;
    const sp = storedApiPlan(c.id);
    if (planSpeaksForCase(c.id, catalogCaseText(c))) by[g].speaks += 1;
    if (sp?.meta.coverage === "full" && sp.meta.validated) by[g].full += 1;
    if (!sp) by[g].none += 1;
  }
  for (const [g, v] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) console.log(`${g.padEnd(16)} ${String(v.n).padStart(4)} cases  ${String(v.speaks).padStart(4)} speak  ${String(v.full).padStart(4)} full  ${String(v.none).padStart(4)} none`);
  process.exit(0);
}
