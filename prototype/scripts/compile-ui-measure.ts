/**
 * MEASURE THE BROWSER COMPILER ON THE WRITTEN SCREEN CASES — compile only, no browser, no state built.
 *
 *   npx tsx scripts/compile-ui-measure.ts --ids UI-SUR-003,UI-AWD-001        compile these cases, print coverage + gaps
 *   npx tsx scripts/compile-ui-measure.ts --file data/night/none-ids.txt      ids from a file (one per line)
 *     --store            write each plan to data/compiled-plans/ui-prepared/<id>.json (the same meta shape
 *                        scripts/run-ui-cases.ts writes), so the runner picks it up tomorrow
 *     --concurrency 2    compiles in flight at once (default 2 — Slingring rate-limits bursts)
 *     --out <file>       also write a JSON summary {counts, cases:[{id, coverage, gaps, steps}]}
 *     --tier fast|reason (default fast — the cost rule)
 *
 * It compiles each case EXACTLY as run-ui-cases.ts does: the prepared state and screen from
 * uiCasePrep.prepFor, the layer decider's screen assertions, the closest UI exemplars as worked
 * examples, the second pass when a step names nothing or expects a label Procol never renders, the
 * vacuous-absence check and the prepared-state step drop. Nothing here is a verdict on the product:
 * the numbers measure the COMPILER (how many written cases it can express honestly).
 *
 * Stops compiling when Slingring says its budget is gone (slingringOverBudget) — a fallback-model plan
 * would measure another compiler. A compile the gateway did not answer (warnings "could not be reached",
 * "did not answer", "did not return JSON", or source "fallback") is NOT a verdict: it waits 30 s and compiles
 * that case once more; if that fails too the case is listed as "not compiled (gateway)" and left out of the counts.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
// Slingring ONLY (coordinator, 10 Nov): a plan another provider wrote when the gateway rate-limited a burst measures
// another compiler. With the fallback keys out of this process, an unanswered compile says "could not be reached"
// and is retried / left out below instead of being quietly answered by Groq or Gemini. --any-provider keeps them.
if (!process.argv.includes("--any-provider")) {
  delete process.env.GROQ_API_KEY;
  delete process.env.GOOGLE_API_KEY;
}

const { allCases, caseAsProse } = await import("../src/checks/testCatalog.js");
const { decideLayerSync, screenAssertions } = await import("../src/agents/layerDecider.js");
const { prepFor } = await import("../src/ui/uiCasePrep.js");
const { compileTestCase } = await import("../src/agents/planner.js");
const { closestUiExemplars, exemplarPrompt } = await import("../src/agents/uiExemplars.js");
const { isKnownLabel, knownOnScreen } = await import("../../procol-ui-tests/src/plan/generic/labels.js");
const { slingringOverBudget, usageReport } = await import("../src/ai/llm.js");
const { closeSpineDb } = await import("../src/db/spineDb.js");

type CatalogCase = ReturnType<typeof allCases>[number];
type Prep = ReturnType<typeof prepFor>;

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const TIER: "reason" | "fast" = arg("tier") === "reason" ? "reason" : "fast";
const STORE = flag("store");
const CONCURRENCY = Math.max(1, Number(arg("concurrency")) || 2);
const OUT = arg("out");
const PLAN_DIR = join(here, "..", "data", "compiled-plans", "ui-prepared");
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

const ids = [
  ...(arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ...(arg("file") ? readFileSync(arg("file")!, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : []),
];
if (!ids.length) {
  console.error("give --ids A,B or --file <ids.txt>");
  process.exit(2);
}
const byId = new Map(allCases().map((c) => [c.id, c]));

// ── the compile, as run-ui-cases.ts does it ─────────────────────────────────
const VALUE_KEYS: Record<string, string[]> = { none: [], draft: ["title", "quantity", "unit"], live: ["title", "quantity", "unit", "vendorName"], bid: ["title", "vendorName", "quantity", "unit", "bidPrice", "bidTotal"] };
VALUE_KEYS.closed = VALUE_KEYS.bid;
VALUE_KEYS.awarded = VALUE_KEYS.bid;
VALUE_KEYS.proposal = VALUE_KEYS.bid;

const NEEDS_TARGET = new Set(["click", "hover", "fill", "select", "toggle", "expect_visible", "expect_count", "remember", "expect_value"]);
function emptyTargets(plan: any): string[] {
  return (plan?.steps ?? [])
    .filter((st: any) => NEEDS_TARGET.has(st.step))
    .filter((st: any) => {
      const a = st.args ?? {};
      const words = [a.name, a.label, a.text, a.placeholder, a.target && typeof a.target === "object" ? (a.target.name ?? a.target.text ?? a.target.label) : a.target].filter((w) => typeof w === "string" && w.trim());
      return !words.length;
    })
    .map((st: any) => st.step);
}
function unknownLabels(plan: any): string[] {
  const ASSERT = new Set(["expect_text", "expect_visible", "expect_hidden", "expect_disabled", "expect_enabled", "expect_count", "expect_field_error", "click"]);
  const out = new Set<string>();
  for (const st of plan?.steps ?? []) {
    if (!ASSERT.has(st?.step)) continue;
    const a = st.args ?? {};
    for (const v of [a.text, a.label, a.name, a.target?.name, a.target?.text, a.target?.label]) {
      if (typeof v !== "string" || v.length < 3 || v.length > 60) continue;
      if (/\d/.test(v) || /\{\{/.test(v)) continue;
      if (!isKnownLabel(v)) out.add(v);
    }
  }
  return [...out];
}
function crossCheck(c: CatalogCase, p: Prep, plan: any): string[] {
  if (plan.steps.some((s: any) => s.step === "expect_api_value")) return [];
  const both = decideLayerSync(c).assertions.filter((a) => a.layer === "both").map((a) => a.text.toLowerCase()).join(" ");
  if (!both) return [];
  const hasBid = ["bid", "closed", "proposal", "awarded"].includes(p.state);
  const keys: string[] = [];
  if (hasBid && /\b(bidding vendors?|bidders?|vendor'?s name|vendor names?)\b/.test(both) && ["master_qcs", "responses"].includes(p.screen)) keys.push("vendorName");
  if (/\bquantit(y|ies)\b/.test(both)) keys.push("quantity");
  if (hasBid && /\btotals?\b/.test(both)) keys.push("bidTotal");
  else if (hasBid && /\b(prices?|quoted|bid amount)\b/.test(both)) keys.push("bidPrice");
  if (/\b(event )?title\b/.test(both)) keys.push("title");
  const add = [...new Set(keys)].slice(0, 2);
  for (const key of add) plan.steps.push({ step: "expect_api_value", args: { key }, note: "cross-check: the screen must show the value the API holds" });
  return add;
}

interface Measured {
  id: string;
  coverage: string;
  gaps: string[];
  steps: string[];
  source: string;
  state: string;
  screen: string;
  warnings: string[];
}

async function compileOne(c: CatalogCase): Promise<Measured> {
  const p = prepFor(c);
  if (!p.ok) return { id: c.id, coverage: "none", gaps: [`prep: ${p.why}`], steps: [], source: "prep", state: "?", screen: "?", warnings: [] };
  const near = closestUiExemplars(c, { state: p.state, screen: p.screen }, 2);
  const exact = near.find((n) => n.exact);
  let r: { plan: any; coverage: string; gaps: string[]; source: string; warnings?: string[] };
  if (exact) {
    r = { plan: { title: c.title, steps: exact.exemplar.steps }, coverage: "full", gaps: [], source: `ui-exemplar:${exact.exemplar.caseId}`, warnings: [] };
  } else {
    const d = decideLayerSync(c);
    const compileOnce = async (extra: string) =>
      (await compileTestCase(caseAsProse(c) + extra, "events", {
        tier: TIER,
        dryRun: true,
        ...(p.prepared
          ? {
              prepared: {
                state: p.state,
                screen: p.screen,
                screenWhat: p.screenWhat,
                valueKeys: VALUE_KEYS[p.state] ?? [],
                technical: p.technical,
                screenAssertions: screenAssertions(d).map((a) => a.text),
                examples: exemplarPrompt(near),
              },
            }
          : {}),
      })) as any;
    r = await compileOnce("");
    if (emptyTargets(r.plan).length) {
      r = await compileOnce("\nNOTE: every click / hover / fill / select / toggle / expect_visible / expect_count step MUST name its element (role+name, label or text). If the case's element cannot be named, list it in cannotExpress.");
      if (emptyTargets(r.plan).length) {
        r.plan.steps = r.plan.steps.filter((st: any) => !emptyTargets({ steps: [st] }).length);
        r.coverage = r.coverage === "none" ? "none" : "partial";
        r.gaps = [...(r.gaps ?? []), "a step the case needs could not be named (dropped)"];
      }
    }
    if (r.plan?.steps?.length) {
      const unknown = unknownLabels(r.plan);
      if (unknown.length) {
        const again = await compileOnce(`\nNOTE: these labels are NOT rendered by Procol (not in its source, never seen live): ${unknown.map((u) => `"${u}"`).join(", ")}. Use only labels from KNOWN LABELS for this screen; if the case's element has no known label, list it in cannotExpress.`);
        if (again?.plan?.steps?.length) r = again;
        const still = unknownLabels(r.plan);
        if (still.length) {
          r.coverage = r.coverage === "none" ? "none" : "partial";
          r.gaps = [...(r.gaps ?? []), `expects label(s) Procol is not known to render: ${still.join(", ")}`];
        }
      }
    }
  }
  if (r.plan?.steps?.length) {
    const vacuous: string[] = [];
    for (const st of r.plan.steps) {
      const a = st.args ?? {};
      const absent = st.step === "expect_hidden" || (st.step === "expect_count" && Number(a.count) === 0);
      if (!absent) continue;
      const name = a.target?.name ?? a.target?.text ?? a.target?.label ?? a.name ?? a.text;
      if (typeof name !== "string" || name.length < 3) continue;
      if (isKnownLabel(name) && knownOnScreen(name, p.screen) === false) vacuous.push(name);
    }
    if (vacuous.length) {
      r.coverage = r.coverage === "none" ? "none" : "partial";
      r.gaps = [...(r.gaps ?? []), `checks that ${vacuous.map((v) => `“${v}”`).join(", ")} is absent on ${p.screenWhat}, where it is never shown — that proves nothing`];
    }
  }
  if (p.prepared && r.plan?.steps?.length) {
    const FIXED = new Set(["close_event", "publish", "save_draft", "set_schedule", "invite_vendor", "place_bid", "open_create"]);
    const dropped = r.plan.steps.filter((st: any) => FIXED.has(st.step)).map((st: any) => st.step);
    if (dropped.length) {
      r.plan.steps = r.plan.steps.filter((st: any) => !FIXED.has(st.step));
      r.coverage = r.coverage === "none" ? "none" : "partial";
      r.gaps = [...(r.gaps ?? []), `needs a different starting state than ${p.state} (asked for ${[...new Set(dropped)].join(", ")})`];
    }
  }
  const added = p.prepared && r.plan?.steps?.length ? crossCheck(c, p, r.plan) : [];
  const coverage = r.source === "fallback" ? "none" : r.coverage;
  const gaps = r.source === "fallback" ? ["the compiler fell back to a generic plan — it is not this case"] : r.gaps ?? [];
  if (STORE && r.source !== "fallback") {
    mkdirSync(PLAN_DIR, { recursive: true });
    writeFileSync(
      join(PLAN_DIR, `${c.id}.json`),
      JSON.stringify(
        { meta: { caseId: c.id, title: c.title, compiledAt: new Date().toISOString(), tier: TIER, source: r.source, coverage: r.coverage, gaps: r.gaps, warnings: r.warnings ?? [], state: p.state, screen: p.screen, technical: p.technical, exemplars: near.map((n) => n.exemplar.caseId), crossCheckAdded: added }, plan: r.plan },
        null,
        1,
      ),
    );
  }
  return { id: c.id, coverage, gaps, steps: (r.plan?.steps ?? []).map((s: any) => s.step), source: r.source, state: p.state, screen: p.screen, warnings: r.warnings ?? [] };
}

/** The gateway, not the compiler, failed this one: its words, or a fallback plan (a different model wrote it). */
const GATEWAY = /could not be reached|did not answer|did not return JSON|returned no content|returned nothing/i;
function gatewayFailed(m: Measured): boolean {
  return m.source === "fallback" || m.warnings.some((w) => GATEWAY.test(w)) || m.gaps.some((g) => /compiled without a model|fell back to a generic plan/i.test(g));
}

// ── run with bounded concurrency ────────────────────────────────────────────
const results: Measured[] = [];
let next = 0;
let stopped = false;
async function worker(): Promise<void> {
  while (next < ids.length && !stopped) {
    const id = ids[next++];
    const c = byId.get(id);
    if (!c) {
      results.push({ id, coverage: "none", gaps: ["no such case in the catalog"], steps: [], source: "missing", state: "?", screen: "?", warnings: [] });
      continue;
    }
    if (slingringOverBudget()) {
      stopped = true;
      log("Slingring says its budget is gone — stopping here (a fallback model would measure another compiler)");
      break;
    }
    const t0 = Date.now();
    try {
      let m = await compileOne(c);
      if (gatewayFailed(m)) {
        log(`${id.padEnd(16)} the gateway did not answer this compile — waiting 30 s and compiling once more`);
        await new Promise((r) => setTimeout(r, 30_000));
        m = await compileOne(c);
        if (gatewayFailed(m)) m = { ...m, coverage: "not compiled (gateway)" };
      }
      results.push(m);
      log(`${m.id.padEnd(16)} ${m.coverage.padEnd(7)} ${String(m.steps.length).padStart(2)} steps ${Math.round((Date.now() - t0) / 1000)}s${m.gaps.length ? ` — ${m.gaps.map((g) => g.slice(0, 110)).join(" | ")}` : ""}`);
    } catch (e) {
      results.push({ id, coverage: "error", gaps: [(e as Error).message.slice(0, 200)], steps: [], source: "error", state: "?", screen: "?", warnings: [] });
      log(`${id.padEnd(16)} ERROR ${(e as Error).message.slice(0, 160)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

const counts: Record<string, number> = {};
const notCompiled = results.filter((m) => /not compiled|error/.test(m.coverage));
for (const m of results) if (!/not compiled|error/.test(m.coverage)) counts[m.coverage] = (counts[m.coverage] ?? 0) + 1;
console.log("\n== coverage (gateway failures and errors left out) ==");
console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  ") + `  (of ${ids.length} asked${stopped ? ", stopped early" : ""}; not compiled: ${notCompiled.length})`);
if (notCompiled.length) console.log(`not compiled (gateway/error): ${notCompiled.map((m) => m.id).join(", ")}`);
console.log("\n== gaps (not full) ==");
for (const m of results.filter((x) => x.coverage !== "full" && !/not compiled|error/.test(x.coverage))) console.log(`${m.id} [${m.coverage} ${m.state}/${m.screen}] ${m.gaps.join(" || ")}`);
const u = usageReport();
console.log(`\nmodel spend this run: $${u.totalUsd.toFixed(2)}`);
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), tier: TIER, counts, notCompiled: notCompiled.map((m) => m.id), stopped, cases: results }, null, 1));
  log(`summary written to ${OUT}`);
}
await closeSpineDb?.().catch(() => {});
process.exit(0);
