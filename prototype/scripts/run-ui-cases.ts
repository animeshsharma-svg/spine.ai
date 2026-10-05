/**
 * RUN THE WRITTEN SCREEN CASES LIKE A SENIOR MANUAL QA (docs/ui-automation-design.md).
 *
 *   npx tsx scripts/run-ui-cases.ts --c 198678 --dry               which cases, in what state, on what screen
 *   npx tsx scripts/run-ui-cases.ts --c 198678 --limit 20          compile (reason tier, stored) and run 20
 *     --tier fast                   compile with the fast tier (measurement only)
 *     --ids UI-SUR-003,UI-AWD-001   exactly these catalog cases
 *     --skip-ran                    leave out cases this runner already recorded a result for
 *     --budget-min 240              stop starting new cases after this many minutes (default 240)
 *     --case-min 12                 limit for one case's browser run (default 12)
 *     --bugs <file>                 where candidate product bugs go (default data/ui-bug-candidates.json)
 *     --recompile                   compile again even when a plan is stored
 *
 * For each case:
 *   1. the layer decider (src/agents/layerDecider.ts) splits it into assertions;
 *      an API-only case is left to the API runners — the browser is not used;
 *   2. uiCasePrep.ts picks the starting state and screen; a screen not in the
 *      model yet (vendor portal, PR screens) is reported as a gap, not forced;
 *   3. the plan: a passing exemplar of the very same words is reused, otherwise
 *      the compiler writes one (reason tier) with the screen assertions, the API
 *      values it can compare and the closest UI exemplars as worked examples;
 *      stored in data/compiled-plans/ui-prepared/<id>.json;
 *   4. the state is built through the API (uiSetup.ts, QA vendors only), fresh
 *      for every run, and the browser opens the screen on it (open_prepared);
 *   5. one browser, one case at a time; a failure is run again on a SECOND fresh
 *      state before it can be anything but "couldn't tell";
 *   6. every result is saved as a normal run against the catalog case id, so the
 *      coverage report counts it; a pass with full coverage becomes a UI exemplar.
 *
 * Verdicts (deterministic, never a model) — docs §6:
 *   passed          every step ran and the plan covers the whole case
 *   couldn't tell   partial coverage; a step the automation could not PERFORM;
 *                   the state could not be built; a failure that did not repeat;
 *                   or a failure that repeated — "to confirm": the plan was written by
 *                   the compiler and the console code must confirm the screen should
 *                   show it before it counts as a product failure.
 * The observation pass (no NaN/undefined/raw ids, no server errors) findings that
 * repeat on the second fresh state go to the bug-candidates file.
 */
import { config } from "dotenv";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
// A screen-case compile sends a long prompt (steps, labels, exemplars). Slingring's fast tier
// is given 4 s by default (right for one-line questions), so every compile here timed out and
// fell to Groq (413, too large) and then Gemini — the "Slingring-first" plans were never
// Slingring's. A batch can wait for the primary model.
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
// The compile tier. "fast" (Slingring LUNA) declared "no step can cover this" for 43% of cases
// (30 of 69) where Gemini had for 6% — it under-uses the generic steps. Production compiles use
// "reason" (planner.ts); `--tier fast` keeps the cheap path for measurement.
const COMPILE_TIER: "reason" | "fast" = process.argv.includes("--tier") && process.argv[process.argv.indexOf("--tier") + 1] === "fast" ? "fast" : "reason";

const { allCases, caseAsProse } = await import("../src/checks/testCatalog.js");
const { decideLayerSync, screenAssertions } = await import("../src/agents/layerDecider.js");
const { prepFor } = await import("../src/ui/uiCasePrep.js");
const { buildUiState, qaVendorOf } = await import("../src/ui/uiSetup.js");
const { compileTestCase } = await import("../src/agents/planner.js");
const { closestUiExemplars, exemplarPrompt, addUiExemplar } = await import("../src/agents/uiExemplars.js");
const { runUiPlan, readPlanResult } = await import("../src/ui/uiFlowRunner.js");
const { isKnownLabel } = await import("../../procol-ui-tests/src/plan/generic/labels.js");
/** Literal screen texts a plan's assertions look for that Procol is not known to render. */
function unknownLabels(plan: any): string[] {
  const ASSERT = new Set(["expect_text", "expect_visible", "expect_hidden", "expect_disabled", "expect_enabled", "expect_count", "expect_field_error", "click"]);
  const out = new Set<string>();
  for (const st of plan?.steps ?? []) {
    if (!ASSERT.has(st?.step)) continue;
    const a = st.args ?? {};
    for (const v of [a.text, a.label, a.name, a.target?.name, a.target?.text, a.target?.label]) {
      if (typeof v !== "string" || v.length < 3 || v.length > 60) continue;
      if (/\d/.test(v) || /\{\{/.test(v)) continue; // values and placeholders come from the run, not the product's labels
      if (!isKnownLabel(v)) out.add(v);
    }
  }
  return [...out];
}
const { saveRun, newRunId, whenRunsSaved } = await import("../src/runStore.js");
const { closeSpineDb } = await import("../src/db/spineDb.js");
const { usageReport } = await import("../src/ai/llm.js");
const { withWatchdog } = await import("../src/checks/resilience.js");
type CatalogCase = ReturnType<typeof allCases>[number];

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const COMPANY = Number(arg("c") ?? 198678);
const LIMIT = Number(arg("limit")) || 20;
const IDS = (arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BUDGET_MS = (Number(arg("budget-min")) || 240) * 60_000;
const CASE_MS = (Number(arg("case-min")) || 12) * 60_000;
const RECOMPILE = flag("recompile");
const DRY = flag("dry");
const SKIP_RAN = flag("skip-ran");
const BUGS = arg("bugs") ?? join(here, "..", "data", "ui-bug-candidates.json");
const T0 = Date.now();
const left = () => BUDGET_MS - (Date.now() - T0);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const PLAN_DIR = join(here, "..", "data", "compiled-plans", "ui-prepared");
const LEDGER = join(PLAN_DIR, "_results.jsonl");
mkdirSync(PLAN_DIR, { recursive: true });

// ── which cases ─────────────────────────────────────────────────────────────
const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const VRANK: Record<string, number> = { automate: 0, "automate-later": 1 };
const ranAlready = new Set<string>(
  existsSync(LEDGER)
    ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => {
        try {
          return JSON.parse(l).id as string;
        } catch {
          return "";
        }
      })
    : [],
);
const screenCases = allCases().filter((c) => /^UI-/.test(c.group) && c.group !== "UI-XCHK");
let pick: CatalogCase[];
if (IDS.length) {
  const byId = new Map(allCases().map((c) => [c.id, c]));
  pick = IDS.map((id) => byId.get(id)).filter((c): c is CatalogCase => !!c);
} else {
  pick = screenCases
    .filter((c) => c.verdict !== "manual")
    .filter((c) => decideLayerSync(c).layer !== "api")
    .filter((c) => prepFor(c).ok)
    .filter((c) => !SKIP_RAN || !ranAlready.has(c.id))
    .sort((a, b) => (RANK[a.priority] ?? 9) - (RANK[b.priority] ?? 9) || (VRANK[a.verdict] ?? 9) - (VRANK[b.verdict] ?? 9) || a.id.localeCompare(b.id))
    .slice(0, LIMIT);
}
log(`client ${COMPANY} · ${pick.length} screen case(s)`);
if (DRY) {
  for (const c of pick) {
    const d = decideLayerSync(c);
    const p = prepFor(c);
    console.log(`  ${c.priority} ${c.id.padEnd(15)} ${d.layer.padEnd(4)} ${p.ok ? `${p.state}/${p.screen}${p.technical ? " +technical" : ""}${p.auction ? " auction" : ""}` : `GAP: ${p.why}`}  ${c.title.slice(0, 70)}`);
  }
  process.exit(0);
}

// ── QA vendors only ─────────────────────────────────────────────────────────
async function qaVendorNames(): Promise<string[]> {
  try {
    const mod = await import(join(here, "..", "..", "procol-ui-tests", "src", "db", "qaVendors.ts"));
    return await withWatchdog<string[]>(mod.qaVendorNames(COMPANY), 30_000, "reading the QA vendors");
  } catch {
    return [];
  }
}
const qaNames = await qaVendorNames();
const isQa = (n: string) => qaNames.some((q) => q.toLowerCase() === String(n).toLowerCase());
function keepQaVendorsOnly(plan: any): string[] {
  const removed: string[] = [];
  for (const st of plan?.steps ?? []) {
    const a = st?.args;
    if (!a || !Array.isArray(a.vendors)) continue;
    removed.push(...a.vendors.filter((v: unknown) => !isQa(String(v))).map(String));
    a.vendors = a.vendors.filter((v: unknown) => isQa(String(v)));
    if (!a.vendors.length) delete a.vendors;
  }
  return removed;
}

// ── one browser on this machine ─────────────────────────────────────────────
function otherBrowserRun(): string | null {
  try {
    const out = execSync(`ps -axo pid,command | grep -E "playwright( |/cli\\.js )test" | grep -v grep || true`, { encoding: "utf8", timeout: 5_000 });
    return out.trim() ? out.trim().split("\n")[0].slice(0, 160) : null;
  } catch {
    return null;
  }
}
async function waitForBrowserFree(): Promise<boolean> {
  const until = Date.now() + 10 * 60_000;
  while (Date.now() < until) {
    if (!otherBrowserRun()) return true;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return false;
}

// ── compile (stored) ────────────────────────────────────────────────────────
type Prep = ReturnType<typeof prepFor>;
const VALUE_KEYS: Record<string, string[]> = { none: [], draft: ["title", "quantity", "unit"], live: ["title", "quantity", "unit", "vendorName"], bid: ["title", "vendorName", "quantity", "unit", "bidPrice", "bidTotal"] };
VALUE_KEYS.closed = VALUE_KEYS.bid;
VALUE_KEYS.awarded = VALUE_KEYS.bid;
VALUE_KEYS.proposal = VALUE_KEYS.bid;

async function compiled(c: CatalogCase, p: Prep): Promise<{ plan: any; coverage: string; gaps: string[]; source: string; stored: boolean }> {
  const f = join(PLAN_DIR, `${c.id}.json`);
  if (!RECOMPILE && existsSync(f)) {
    try {
      const s = JSON.parse(readFileSync(f, "utf8"));
      if (s?.plan?.steps && s.meta?.state === p.state && s.meta?.screen === p.screen) return { plan: s.plan, coverage: s.meta.coverage, gaps: s.meta.gaps ?? [], source: s.meta.source, stored: true };
    } catch {
      /* compile again */
    }
  }
  const near = closestUiExemplars(c, { state: p.state, screen: p.screen }, 2);
  const exact = near.find((n) => n.exact);
  let r: { plan: any; coverage: string; gaps: string[]; source: string; warnings?: string[] };
  if (exact) {
    r = { plan: { title: c.title, steps: exact.exemplar.steps }, coverage: "full", gaps: [], source: `ui-exemplar:${exact.exemplar.caseId}` };
  } else {
    const d = decideLayerSync(c);
    const compileOnce = async (extra: string) => (await withWatchdog(
      compileTestCase(caseAsProse(c) + extra, "events", {
        tier: COMPILE_TIER,
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
      }),
      180_000,
      `compiling ${c.id}`,
    )) as any;
    r = await compileOnce("");
    // A step that names nothing to look for cannot run; ask once more, saying so.
    if (emptyTargets(r.plan).length) {
      log(`   the plan's ${emptyTargets(r.plan).join(", ")} name(s) nothing to look for — compiling once more`);
      r = await compileOnce("\nNOTE: every click / hover / fill / select / toggle / expect_visible / expect_count step MUST name its element (role+name, label or text). If the case's element cannot be named, list it in cannotExpress.");
      if (emptyTargets(r.plan).length) {
        r.plan.steps = r.plan.steps.filter((st: any) => !emptyTargets({ steps: [st] }).length);
        r.coverage = r.coverage === "none" ? "none" : "partial";
        r.gaps = [...(r.gaps ?? []), "a step the case needs could not be named (dropped)"];
      }
    }
    // A screen assertion on a label Procol has never rendered (not in its source, never seen live)
    // costs minutes of browser time and ends in "couldn't tell". Catch it here: compile once more
    // with the screen's real labels; if it still guesses, the plan is partial and says which label.
    if (r.plan?.steps?.length) {
      const unknown = unknownLabels(r.plan);
      if (unknown.length) {
        log(`   the plan expects label(s) Procol is not known to render: ${unknown.map((u) => `“${u}”`).join(", ")} — compiling once more with the screen's real labels`);
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
  // On a prepared state the event's life is fixed: steps that would change it are dropped and the plan is partial.
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
  if (r.source !== "fallback") {
    writeFileSync(
      f,
      JSON.stringify(
        { meta: { caseId: c.id, title: c.title, compiledAt: new Date().toISOString(), tier: COMPILE_TIER, source: r.source, coverage: r.coverage, gaps: r.gaps, warnings: r.warnings ?? [], state: p.state, screen: p.screen, technical: p.technical, exemplars: near.map((n) => n.exemplar.caseId), crossCheckAdded: added }, plan: r.plan },
        null,
        1,
      ),
    );
  }
  return { plan: r.plan, coverage: r.source === "fallback" ? "none" : r.coverage, gaps: r.source === "fallback" ? ["the compiler fell back to a generic plan — it is not this case"] : r.gaps, source: r.source, stored: false };
}

const NEEDS_TARGET = new Set(["click", "hover", "fill", "select", "toggle", "expect_visible", "expect_count", "remember", "expect_value"]);
/** Generic steps that name no element (the executor would refuse them). */
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

/**
 * THE CROSS-CHECK (docs §1, "both"): an assertion whose truth is API data and
 * which the screen must show gets an expect_api_value against the value the API
 * sent — deterministically, when the compiler did not write one. At most two.
 */
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

// ── run one plan on a fresh state, bounded ──────────────────────────────────
interface Ran {
  exitCode: number | null;
  steps: Array<{ step: string; args?: Record<string, unknown>; status: string; detail?: string }>;
  observations: Array<{ step: number; stepName: string; findings: Array<{ rule: string; detail: string }>; screenshot?: string }>;
  timedOut: boolean;
  runId: string;
  stateWhy?: string;
  context?: any;
}
// ── shared starting states for plans that only LOOK ─────────────────────────
// Building a state through the API and signing in costs ~25-60 s per case. A plan
// whose every step only reads (checks, navigation, tabs, waits) cannot change the
// event, so cases needing the same state may share one. Anything that clicks,
// fills or submits gets its own fresh state, and a confirmation re-run (a failure
// being repeated) always does. Live states expire fast because their clock moves.
const READ_ONLY_STEPS = /^(expect_|open_prepared$|open_event$|open_tab$|go_to$|wait|hover$|scroll|screenshot$)/;
const stateCache = new Map<string, { context: any; at: number }>();
function onlyLooks(plan: any): boolean {
  return (plan?.steps ?? []).length > 0 && plan.steps.every((st: any) => READ_ONLY_STEPS.test(String(st?.step ?? "")));
}
function maxAgeMs(state: string): number {
  return /live|bid|upcoming/.test(state) ? 10 * 60_000 : 60 * 60_000;
}

async function runOnce(c: CatalogCase, p: Prep, plan: any, fresh = false): Promise<Ran> {
  const runId = `uicase-${c.id}-${Date.now().toString(36)}`;
  let context: any;
  const key = `${p.state}|${p.technical ? "tech" : ""}|${p.auction ? "auction" : ""}`;
  const shared = !fresh && onlyLooks(plan) ? stateCache.get(key) : undefined;
  if (p.prepared && p.state !== "none" && shared && Date.now() - shared.at < maxAgeMs(p.state)) {
    context = shared.context;
    log(`   state ${p.state} shared (this plan only looks): ${context.title}`);
  } else if (p.prepared && p.state !== "none") {
    const built = await buildUiState(COMPANY, p.state, { technical: p.technical, auction: p.auction });
    if (!built.ok || !built.context) return { exitCode: null, steps: [], observations: [], timedOut: false, runId, stateWhy: built.why ?? "the state could not be built" };
    const x = built.context;
    context = { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values };
    log(`   state ${p.state}${p.technical ? " (+technical)" : ""}${p.auction ? " (auction)" : ""} built by API in ${Math.round(x.builtInMs / 1000)}s: ${x.title}`);
    if (!fresh) stateCache.set(key, { context, at: Date.now() });
  }
  // A vendor-portal step signs in as the QA test vendor the API invited — never the
  // profile's default vendor. Its one-time code is resolved by the same UAT rule the
  // API journey uses and handed to the child through the environment (never printed).
  if (plan.steps.some((st: any) => ["place_bid", "accept_counter_offer"].includes(st.step))) {
    // A plan that builds its own event on screen invites and bids as the client's QA vendor.
    const qa = context?.vendorEmail ? null : await qaVendorOf(COMPANY);
    if (qa) {
      for (const st of plan.steps) if (st.step === "invite_vendor" && !st.args?.vendors) st.args = { ...(st.args ?? {}), vendors: [qa.name] };
      for (const st of plan.steps) if (st.step === "place_bid" && !st.args?.vendor) st.args = { ...(st.args ?? {}), vendor: qa.name };
    }
    const email = context?.vendorEmail ?? qa?.email ?? "";
    if (!/^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(email)) return { exitCode: null, steps: [], observations: [], timedOut: false, runId, stateWhy: "the plan signs into the vendor portal, and no QA test vendor was built for it" };
    try {
      const { loginOtpCandidates } = await import(join(here, "..", "..", "procol test", "src", "auth", "uatOtp.ts"));
      const otps = await withWatchdog<Array<{ otp: string }>>(loginOtpCandidates({ email }, COMPANY), 30_000, "resolving the vendor's code");
      if (!otps.length) throw new Error("no code");
      process.env.VENDOR_EMAIL = email;
      process.env.VENDOR_OTP = otps[0].otp;
    } catch (e) {
      return { exitCode: null, steps: [], observations: [], timedOut: false, runId, stateWhy: `the QA vendor's one-time code could not be resolved (${(e as Error).message.slice(0, 80)})` };
    }
  }
  if (!(await waitForBrowserFree())) return { exitCode: null, steps: [], observations: [], timedOut: false, runId, stateWhy: "another browser run held this machine for 10 minutes" };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const res = readPlanResult(runId) as { steps?: Ran["steps"]; observations?: Ran["observations"] } | null;
      resolve({ exitCode, steps: res?.steps ?? [], observations: res?.observations ?? [], timedOut, runId, context });
    };
    delete process.env.SPINE_ALLOW_REAL_VENDORS;
    const { stop } = runUiPlan({ plan: { ...plan, ...(context ? { context } : {}) }, companyId: COMPANY, runId, headed: false }, (e) => {
      if (e.type === "log" && /\[(plan|observe)\]/.test(e.line ?? "")) log(`     ${String(e.line).trim().slice(0, 170)}`);
      if (e.type === "done" || e.type === "run-error") finish(e.exitCode ?? null, false);
    });
    const timer = setTimeout(() => {
      log(`   ${c.id}: no result within ${CASE_MS / 60_000} min — stopping the browser`);
      try {
        stop();
      } catch {
        /* gone */
      }
      setTimeout(() => finish(null, true), 5_000);
    }, CASE_MS);
  });
}

type Verdict = { pass: boolean; inconclusive: boolean; verdict: string; candidate: boolean };
const PERFORM_FAILED = /timeout|waiting for|not found|not visible|no element|locator|detached|intercept|could not find|strict mode|couldn't tell|automation needs update|not ready|no field|needs the|bounded step|no screen|no "/i;
function judge(r: Ran, coverage: string, gaps: string[]): Verdict {
  if (r.stateWhy) return { pass: false, inconclusive: true, verdict: `couldn't tell — ${r.stateWhy}`, candidate: false };
  if (r.timedOut) return { pass: false, inconclusive: true, verdict: "couldn't tell — the browser run did not finish in time and was stopped", candidate: false };
  const failedStep = r.steps.find((s) => s.status === "failed");
  if (!failedStep && r.steps.length && r.exitCode === 0) {
    if (coverage === "full") return { pass: true, inconclusive: false, verdict: `passed — all ${r.steps.length} steps ran and the plan covers the whole case`, candidate: false };
    return { pass: false, inconclusive: true, verdict: `couldn't tell — every step passed, but the plan covers only part of the case (no step yet for: ${gaps.join("; ").slice(0, 200) || "part of it"})`, candidate: false };
  }
  if (!failedStep) return { pass: false, inconclusive: true, verdict: `couldn't tell — the browser run ended (exit ${r.exitCode ?? "?"}) without a step result`, candidate: false };
  const where = `step “${failedStep.step}”: ${String(failedStep.detail ?? "").slice(0, 220)}`;
  if (failedStep.step === "open_prepared") return { pass: false, inconclusive: true, verdict: `couldn't tell — the screen could not be opened on the prepared event (${where})`, candidate: false };
  const asserted = /^(expect_|attempt$)/.test(failedStep.step) && !PERFORM_FAILED.test(String(failedStep.detail ?? ""));
  const appRefused = /rejected by the app|the app (said|refused|answered)|error message/i.test(String(failedStep.detail ?? ""));
  if (asserted || appRefused) return { pass: false, inconclusive: false, verdict: `failed at ${where}`, candidate: true };
  return { pass: false, inconclusive: true, verdict: `couldn't tell — the automation could not perform ${where}; that is not evidence about the product`, candidate: false };
}

const SERIOUS = new Set(["server-error", "bad-text", "page-error", "raw-id"]);
const findingsOf = (r: Ran) => r.observations.flatMap((o) => o.findings.filter((f) => SERIOUS.has(f.rule)).map((f) => ({ ...f, step: o.stepName, screenshot: o.screenshot })));
const sameFinding = (a: { rule: string; detail: string }, b: { rule: string; detail: string }) => a.rule === b.rule && a.detail.replace(/\d+/g, "#").slice(0, 60) === b.detail.replace(/\d+/g, "#").slice(0, 60);

function addBugCandidate(entry: Record<string, unknown>): void {
  let list: Array<Record<string, unknown>> = [];
  try {
    list = existsSync(BUGS) ? JSON.parse(readFileSync(BUGS, "utf8")) : [];
  } catch {
    list = [];
  }
  list.push({ ...entry, at: new Date().toISOString(), companyId: COMPANY, status: "candidate — reproduced on a second fresh state; console code confirmation pending" });
  writeFileSync(BUGS, JSON.stringify(list, null, 1));
}

// ── the batch ───────────────────────────────────────────────────────────────
const before = usageReport().totalUsd;
const summary: Array<Record<string, unknown>> = [];
for (const c of pick) {
  if (left() < 5 * 60_000) {
    log(`budget reached — stopping before ${c.id}`);
    break;
  }
  const d = decideLayerSync(c);
  const p = prepFor(c);
  log(`── ${c.id} ${c.title.slice(0, 80)}  [${d.layer} · ${p.ok ? `${p.state}/${p.screen}` : "gap"}]`);
  if (d.layer === "api" || !p.ok) {
    summary.push({ id: c.id, ran: false, why: d.layer === "api" ? "API-only: no assertion needs the screen" : p.why });
    continue;
  }
  const t = Date.now();
  let comp: Awaited<ReturnType<typeof compiled>>;
  try {
    comp = await compiled(c, p);
  } catch (e) {
    summary.push({ id: c.id, ran: false, why: `compile failed: ${(e as Error).message}` });
    log(`   not run — compile failed: ${(e as Error).message}`);
    continue;
  }
  log(`   plan: ${comp.plan?.steps?.length ?? 0} step(s), coverage ${comp.coverage}, ${comp.stored ? "stored" : comp.source}`);
  if (comp.coverage === "none" || !comp.plan?.steps?.length) {
    summary.push({ id: c.id, ran: false, why: `no step can test what this case is about: ${comp.gaps.join("; ").slice(0, 200)}` });
    appendFileSync(LEDGER, JSON.stringify({ id: c.id, ran: false, coverage: "none", at: new Date().toISOString() }) + "\n");
    log(`   not run — the plan covers none of the case`);
    continue;
  }
  const removed = keepQaVendorsOnly(comp.plan);
  if (removed.length) log(`   removed vendor(s) that are not QA test vendors: ${removed.join(", ")}`);

  const first = await runOnce(c, p, comp.plan);
  let v = judge(first, comp.coverage, comp.gaps);
  let again: Ran | null = null;
  const firstFindings = findingsOf(first);
  if ((v.candidate || firstFindings.length) && left() > 5 * 60_000) {
    log(`   ${v.candidate ? "it failed" : `the observation pass saw ${firstFindings.length} finding(s)`} — running it again on a second fresh state`);
    again = await runOnce(c, p, comp.plan, true); // a confirmation always runs on a brand-new state
    if (v.candidate) {
      const v2 = judge(again, comp.coverage, comp.gaps);
      v = v2.candidate && !v2.pass
        ? {
            pass: false,
            inconclusive: true,
            candidate: true,
            verdict:
              comp.coverage === "full"
                ? `couldn't tell — to confirm: ${v.verdict.replace(/^failed at /, "it failed at ")}, and the same way again on a second fresh state; the plan was written by the compiler, so the console code must confirm the screen should show this before it counts as a product failure`
                : `couldn't tell — ${v.verdict.replace(/^failed at /, "it failed at ")} twice, but the plan covers only part of the case`,
          }
        : { pass: false, inconclusive: true, candidate: false, verdict: `couldn't tell — the first run ${v.verdict}, but a second fresh state came out: ${v2.verdict}` };
    }
    const repeated = firstFindings.filter((f) => findingsOf(again!).some((g) => sameFinding(f, g)));
    for (const f of repeated) {
      addBugCandidate({ kind: "observation", caseId: c.id, title: c.title, rule: f.rule, detail: f.detail, step: f.step, screenshot: f.screenshot, runs: [first.runId, again.runId] });
      log(`   CANDIDATE (observation, repeated): ${f.rule}: ${f.detail.slice(0, 140)}`);
    }
    if (v.candidate && comp.coverage === "full" && /to confirm/.test(v.verdict))
      addBugCandidate({ kind: "assertion", caseId: c.id, title: c.title, verdict: v.verdict, plan: comp.plan.steps, runs: [first.runId, again.runId] });
  }
  if (v.candidate && !v.inconclusive) v = { ...v, inconclusive: true, verdict: `couldn't tell — ${v.verdict.replace(/^failed at /, "it failed at ")} once and was not re-run on a fresh state` };

  const result = {
    id: c.id,
    flowId: "ui-prepared",
    module: "Screen case",
    scenario: c.title,
    type: "functional",
    category: c.section,
    priority: c.priority,
    severity: c.priority === "P0" ? "High" : "Medium",
    expected: "accept",
    layer: "ui",
    inputSummary: `browser plan · ${comp.plan?.steps?.length ?? 0} steps · coverage ${comp.coverage} · state ${p.state} built by API · screen ${p.screen} · layer ${d.layer}`,
    httpStatus: null,
    accepted: v.pass,
    message: v.verdict,
    durationMs: Date.now() - t,
    pass: v.pass,
    inconclusive: v.inconclusive,
    verdict: v.verdict,
    steps: comp.plan?.steps?.map((s: any) => s.step),
    evidence: { runs: [first.runId, again?.runId].filter(Boolean), observations: firstFindings.slice(0, 5) },
  };
  saveRun({
    id: newRunId(),
    ts: new Date(t).toISOString(),
    request: `ui-cases: ${c.id}`,
    companyId: COMPANY,
    companyName: null,
    provider: "deterministic",
    durationMs: Date.now() - t,
    report: undefined,
    events: [{ agent: "System", kind: "plan", text: "screen case (state by API)", data: { coverage: comp.coverage, gaps: comp.gaps, source: comp.source, state: p.state, screen: p.screen, layer: d.layer } } as any],
    flowResults: [],
    validationResults: [],
    checkResults: [result as any],
  } as any);
  if (v.pass && comp.coverage === "full") {
    addUiExemplar({ caseId: c.id, title: c.title, words: (await import("../src/agents/uiExemplars.js")).caseWords(c), group: c.group, state: p.state, screen: p.screen, steps: first.steps.length ? comp.plan.steps : comp.plan.steps, companyId: COMPANY, passedAt: new Date().toISOString(), runId: first.runId });
  }
  const label = v.inconclusive ? (/to confirm/.test(v.verdict) ? "to confirm" : "couldn't tell") : v.pass ? "passed" : "failed";
  summary.push({ id: c.id, verdict: label, why: v.verdict.slice(0, 200), coverage: comp.coverage });
  appendFileSync(LEDGER, JSON.stringify({ id: c.id, ran: true, verdict: label, coverage: comp.coverage, state: p.state, screen: p.screen, why: v.verdict.slice(0, 300), at: new Date().toISOString() }) + "\n");
  log(`   ${label.toUpperCase()} — ${v.verdict.slice(0, 200)}  (${Math.round((Date.now() - t) / 1000)}s)`);
}

const n = (k: string) => summary.filter((s) => s.verdict === k).length;
log(`done in ${Math.round((Date.now() - T0) / 60000)} min — ${n("passed")} passed, ${n("to confirm")} to confirm, ${n("couldn't tell")} couldn't tell, ${summary.filter((s) => s.ran === false).length} not run · model spend $${(usageReport().totalUsd - before).toFixed(3)}`);
await whenRunsSaved();
await closeSpineDb();
process.exit(0);
