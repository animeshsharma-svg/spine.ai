/**
 * COMPILE EVERY API-PLAN CASE — the long tail, resumable, budget-guarded.
 *
 *   npx tsx scripts/compile-api-plans-all.ts                     every api-plan case with nothing stored
 *     --redo partial,none      also re-compile stored results with these coverages
 *     --redo silent            also re-compile stored partial plans that do not speak for their case
 *     --ids A,B                exactly these ids
 *     --groups API-EVDRJB,…    only these catalog groups (prefix match on the id)
 *     --force                  compile again even when a plan is stored
 *     --concurrency 2          workers (default 2 — the gateway rate-limits bursts)
 *     --limit N                at most N cases
 *     --dry                    list what would be compiled
 *
 * Which cases: every catalog case whose route is the API test compiler (caseRouting kind "api-plan"),
 * all priorities and verdicts. Each is compiled once with the fast tier (never the reason tier) and the
 * same in-code refinements the server applies (line-item count, event from a PR, surrogate bid repair,
 * price cap, strict outcome), validated again here, checked for actor/app/role problems, and stored:
 *
 *   data/compiled-plans/api/<id>.json   { meta, plan }  — plan null for a "none" result (its reasons in meta.gaps)
 *   data/compiled-plans/api/index.json  rebuilt from the per-case files at the end (and every 25 cases)
 *
 * A result the gateway did not properly give (unreachable, not JSON after an error, answered by a
 * fallback provider) is NOT a verdict: the case is tried once more after 30 s, and if that fails too it
 * is left unstored and listed in data/night/not-compiled-gateway.json. When Slingring reports its budget
 * gone (slingringOverBudget), the run stops and writes what remains to data/night/remaining.json.
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { allCases, caseById, type CatalogCase } from "../src/checks/testCatalog.js";
import { routeFor } from "../src/checks/caseRouting.js";
import {
  compileApiPlan, validatePlan, PLAN_VERSION, planInWords, catalogCaseText, applyLineItemCount, applyFromPr, repairBidActs, applyPriceCap, strictOutcome,
  type CompiledApiPlan,
} from "../src/agents/apiPlanner.js";
import { COMPILED_API_DIR, storedPlanProblems, reloadStoredPlans, planSpeaksForCase } from "../src/checks/compiledPlans.js";
import { llmMode, usageReport, slingringOverBudget } from "../src/ai/llm.js";
import { withWatchdog } from "../src/checks/resilience.js";

const here = dirname(fileURLToPath(import.meta.url));
const NIGHT_DIR = join(here, "..", "data", "night");
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const DRY = flag("dry");
const FORCE = flag("force");
const REDO = new Set((arg("redo") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const IDS = new Set((arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const GROUPS = (arg("groups") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = Math.max(1, Math.min(8, Number(arg("concurrency")) || 2));
const LIMIT = Number(arg("limit")) || Infinity;
const PER_CASE_MS = 120_000;
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

interface StoredFile {
  meta: {
    caseId: string; title: string; compiledAt: string; planVersion: number; source: string; coverage: "full" | "partial" | "none";
    gaps: string[]; warnings: string[]; validated: boolean; endpoints: string[]; llm?: { calls: number; promptTokens: number; completionTokens: number; usd: number }; words?: unknown;
  };
  plan: any;
}

function readStored(id: string): StoredFile | undefined {
  const f = join(COMPILED_API_DIR, `${id}.json`);
  if (!existsSync(f)) return undefined;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return undefined;
  }
}

/** write the file whole, then move it into place (a reader never sees half a file) */
function writeAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1));
  renameSync(tmp, file);
}

/** index.json from the per-case files: every case tried, its coverage and reasons */
function rebuildIndex() {
  const cases: Record<string, unknown> = {};
  const oldIdx = existsSync(join(COMPILED_API_DIR, "index.json")) ? JSON.parse(readFileSync(join(COMPILED_API_DIR, "index.json"), "utf8")).cases ?? {} : {};
  for (const f of readdirSync(COMPILED_API_DIR)) {
    if (!f.endsWith(".json") || f === "index.json" || f.includes(".tmp")) continue;
    try {
      const sp = JSON.parse(readFileSync(join(COMPILED_API_DIR, f), "utf8")) as StoredFile;
      if (!sp?.meta?.caseId) continue;
      cases[sp.meta.caseId] = { coverage: sp.meta.coverage, title: sp.meta.title, source: sp.meta.source, why: sp.meta.gaps, endpoints: sp.meta.endpoints, usd: sp.meta.llm?.usd ?? 0, at: sp.meta.compiledAt };
    } catch {
      /* a damaged file is not a result */
    }
  }
  // "none" results recorded only in the old index (before per-case none files) are kept
  for (const [id, v] of Object.entries(oldIdx)) if (!cases[id]) cases[id] = v;
  writeAtomic(join(COMPILED_API_DIR, "index.json"), { updatedAt: new Date().toISOString(), planVersion: PLAN_VERSION, cases });
  return Object.keys(cases).length;
}

// ── which cases ──
const all = allCases().filter((c) => routeFor(c).kind === "api-plan");
const oldIndex: Record<string, { coverage: string }> = existsSync(join(COMPILED_API_DIR, "index.json")) ? JSON.parse(readFileSync(join(COMPILED_API_DIR, "index.json"), "utf8")).cases ?? {} : {};
const todo = all.filter((c) => {
  if (IDS.size) return IDS.has(c.id);
  if (GROUPS.length && !GROUPS.some((g) => c.id.startsWith(g))) return false;
  if (FORCE) return true;
  const sp = readStored(c.id);
  const cov = sp?.meta.coverage ?? oldIndex[c.id]?.coverage;
  if (!cov) return true; // never compiled (or never recorded)
  if (REDO.has(cov)) return true;
  if (REDO.has("silent") && cov === "partial" && !planSpeaksForCase(c.id, catalogCaseText(c))) return true;
  return false;
});
const PRIO = (c: CatalogCase) => ({ P0: 0, P1: 1, P2: 2, P3: 3 } as Record<string, number>)[String(c.priority).toUpperCase()] ?? 4;
todo.sort((a, b) => PRIO(a) - PRIO(b) || a.id.localeCompare(b.id));
const queue = todo.slice(0, LIMIT);
log(`${all.length} api-plan case(s); ${queue.length} to compile (${todo.length - queue.length} beyond the limit); concurrency ${CONCURRENCY}`);
if (DRY) {
  for (const c of queue) log(`  ${c.id}  [${c.priority}] ${c.title}`);
  process.exit(0);
}
if (!queue.length) process.exit(0);
if (llmMode() === "fallback") {
  log("no model is configured (SLINGRING_API_KEY) — nothing compiled");
  process.exit(1);
}
mkdirSync(COMPILED_API_DIR, { recursive: true });
mkdirSync(NIGHT_DIR, { recursive: true });

// ── one case ──
async function compileOne(c: CatalogCase): Promise<CompiledApiPlan> {
  const text = catalogCaseText(c);
  const r0 = await withWatchdog(compileApiPlan({ caseId: c.id }, { llm: true, allowReason: false }), PER_CASE_MS, `compiling ${c.id}`);
  // the in-code refinements the server applies to a typed case
  const r = strictOutcome(await applyPriceCap(await repairBidActs(await applyFromPr(applyLineItemCount(r0), text), text), text), text) ?? r0;
  return r;
}

const GATEWAY_WORDS = /could not be reached|did not answer|did not return JSON|was not JSON|unreachable|fallback:/i;
function gatewayProblem(r: CompiledApiPlan): string | undefined {
  if (r.gateway) return r.gateway;
  if (r.source === "none" && !r.plan && [...r.errors, ...r.gaps].some((e) => GATEWAY_WORDS.test(e))) return [...r.errors, ...r.gaps].find((e) => GATEWAY_WORDS.test(e));
  return undefined;
}

const tally = { full: 0, partial: 0, none: 0, gateway: 0, speaks: 0, failed: 0 };
const notCompiled: Array<{ id: string; why: string }> = [];
const before = usageReport().totalUsd;
let next = 0;
let done = 0;
let stop = false;
const t0 = Date.now();

async function store(c: CatalogCase, r: CompiledApiPlan) {
  const text = catalogCaseText(c);
  const v = r.plan ? await validatePlan(r.plan, { text, heads: [c.title, c.expected] }) : null;
  const extra = v?.ok ? await storedPlanProblems(v.plan, text) : [];
  if (extra.length) r.gaps = [...new Set([...extra, ...r.gaps])];
  const coverage: "full" | "partial" | "none" = !r.plan || !v?.ok ? "none" : extra.length && r.coverage === "full" ? "partial" : r.coverage;
  const gaps = coverage === "none" ? [...new Set([...(v && !v.ok ? v.errors : []), ...r.errors, ...r.gaps])].filter(Boolean) : [...new Set(r.gaps)];
  const plan = coverage !== "none" && v ? { ...v.plan, caseId: c.id, title: c.title } : null;
  const file: StoredFile = {
    meta: {
      caseId: c.id, title: c.title, compiledAt: new Date().toISOString(), planVersion: PLAN_VERSION, source: r.source, coverage, gaps,
      warnings: [...(v?.warnings ?? []), ...r.warnings.filter((w) => !(v?.warnings ?? []).includes(w))].slice(0, 20),
      validated: !!plan, endpoints: r.endpoints,
      llm: { calls: r.llm.calls, promptTokens: r.llm.promptTokens, completionTokens: r.llm.completionTokens, usd: Number(r.llm.usd.toFixed(4)) },
      ...(plan ? { words: planInWords(plan) } : {}),
    },
    plan,
  };
  writeAtomic(join(COMPILED_API_DIR, `${c.id}.json`), file);
  tally[coverage] += 1;
  reloadStoredPlans();
  const speaks = plan ? planSpeaksForCase(c.id, text) : false;
  if (speaks) tally.speaks += 1;
  log(`${c.id}  ${coverage}${speaks ? " ✓speaks" : ""} [${r.source}]${gaps.length ? ` — ${gaps.slice(0, 2).join("; ").slice(0, 180)}` : ""}`);
}

async function worker() {
  while (!stop) {
    const i = next++;
    if (i >= queue.length) return;
    const c = queue[i];
    if (slingringOverBudget()) {
      stop = true;
      log(`Slingring reports its budget gone — stopping; ${queue.length - i} case(s) remain`);
      next = i; // so the remaining list starts here
      return;
    }
    try {
      let r = await compileOne(c);
      let gw = gatewayProblem(r);
      if (gw) {
        log(`${c.id}  gateway problem (${gw.slice(0, 100)}) — waiting 30 s and trying once more`);
        await new Promise((res) => setTimeout(res, 30_000));
        r = await compileOne(c);
        gw = gatewayProblem(r);
      }
      if (gw) {
        tally.gateway += 1;
        notCompiled.push({ id: c.id, why: gw.slice(0, 200) });
        log(`${c.id}  not compiled (gateway): ${gw.slice(0, 120)}`);
      } else await store(c, r);
    } catch (e) {
      tally.failed += 1;
      notCompiled.push({ id: c.id, why: `the compile did not finish: ${(e as Error).message.slice(0, 160)}` });
      log(`${c.id}  not compiled: ${(e as Error).message.slice(0, 160)}`);
    }
    done += 1;
    if (done % 25 === 0) {
      rebuildIndex();
      const spent = usageReport().totalUsd - before;
      log(`── ${done}/${queue.length} done in ${Math.round((Date.now() - t0) / 60000)} min: ${tally.full} full, ${tally.partial} partial (${tally.speaks} speak), ${tally.none} none, ${tally.gateway} gateway, ${tally.failed} failed; $${spent.toFixed(2)}`);
      writeAtomic(join(NIGHT_DIR, "not-compiled-gateway.json"), notCompiled);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const n = rebuildIndex();
writeAtomic(join(NIGHT_DIR, "not-compiled-gateway.json"), notCompiled);
if (stop) writeAtomic(join(NIGHT_DIR, "remaining.json"), queue.slice(next).map((c) => c.id));
const spent = usageReport().totalUsd - before;
log(`done: ${done}/${queue.length} compiled in ${Math.round((Date.now() - t0) / 60000)} min — ${tally.full} full, ${tally.partial} partial (${tally.speaks} speak), ${tally.none} none, ${tally.gateway} not compiled (gateway), ${tally.failed} failed; index has ${n} cases; model spend $${spent.toFixed(2)} (fast tier only)${stop ? "; STOPPED on budget — see data/night/remaining.json" : ""}`);
process.exit(0);
