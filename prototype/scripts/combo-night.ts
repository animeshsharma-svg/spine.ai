/**
 * EVERY KIND OF EVENT, ONE AFTER ANOTHER — the combination run.
 *
 * The product's own grid (knowledge/events/event-permutations.md): entry path × stages ×
 * auction strategy × awarding rule × line items × outcome × bidding. Each valid combination is
 * one browser plan, run through the same runner as the dashboard (single browser slot, spotlight
 * on, live frames), so every run leaves framed pictures of each action and a verified picture
 * of each assertion. A combination that ends on a screen the library has not seen photographs
 * it (inventory_screen), so the night also grows the screen library.
 *
 *   npx tsx scripts/combo-night.ts [--c 198678] [--only E1,S3] [--list] [--no-record]
 *
 * Results: data/combos/<startedAt>.json and data/combos/latest.json (the dashboard's Screens
 * page shows them); every run's steps and pictures stay in procol-ui-tests/evidence/<runId>/.
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { runUiPlan, readPlanResult } = await import("../src/ui/uiFlowRunner.js");
const { recordScreen } = await import("../src/agents/screenModel.js");

type Step = { step: string; args?: Record<string, unknown> };
interface Combo {
  id: string;
  title: string;
  entry: "erfx" | "single-stage" | "boq";
  stages: string[];
  strategy?: string;
  awarding?: string;
  items: number;
  outcome: "publish" | "draft" | "convert" | "counter-offer" | "surrogate" | "two-vendors";
  steps: Step[];
}

const inv = (label: string): Step => ({ step: "inventory_screen", args: { label } });
const stageWork = (stage: string, items: number): Step[] =>
  stage === "rfp"
    ? [{ step: "switch_stage", args: { stage } }, { step: "select_template" }, { step: "fill_questionnaires" }, { step: "assign_evaluator" }]
    : [{ step: "switch_stage", args: { stage } }, { step: "select_template" }, { step: "add_line_items", args: { count: items } }, { step: "fill_sheet" }];

function erfx(id: string, stages: string[], items: number, outcome: Combo["outcome"], extra: { vendors?: number; inv?: string } = {}): Combo {
  const steps: Step[] = [{ step: "open_create", args: { path: "erfx" } }, { step: "set_title" }, { step: "compose_stages", args: { stages } }];
  for (const st of stages) steps.push(...stageWork(st, items));
  const pricing = stages.find((s) => s !== "rfp") ?? stages[0];
  if (stages.length > 1) steps.push({ step: "switch_stage", args: { stage: pricing } });
  steps.push({ step: "set_schedule", args: { minutes: 45 } }, { step: "invite_vendor", args: { count: extra.vendors ?? 1 } });
  steps.push(...outcomeSteps(outcome, extra));
  return { id, title: `eRFX ${stages.join(" + ")} · ${items} item${items === 1 ? "" : "s"} · ${outcome}${extra.vendors ? ` · ${extra.vendors} vendors` : ""}`, entry: "erfx", stages, items, outcome, steps };
}

function single(id: string, eventType: string, items: number, outcome: Combo["outcome"], cfg: { auctionSubtype?: string; awarding?: string; rangeLower?: number; rangeUpper?: number } = {}, extra: { inv?: string } = {}): Combo {
  const steps: Step[] = [
    { step: "open_create", args: { path: "single-stage" } },
    { step: "configure_single_stage", args: { eventType, ...(cfg.auctionSubtype ? { auctionSubtype: cfg.auctionSubtype } : {}), ...(cfg.awarding ? { awarding: cfg.awarding } : {}), ...(cfg.rangeLower !== undefined ? { rangeLower: cfg.rangeLower, rangeUpper: cfg.rangeUpper } : {}) } },
    { step: "set_title" },
    { step: "select_template" },
  ];
  if (eventType === "rfp") steps.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
  else steps.push({ step: "add_line_items", args: { count: items } }, { step: "fill_sheet" });
  steps.push({ step: "set_schedule", args: { minutes: 45 } }, { step: "invite_vendor", args: { count: 1 } }, ...outcomeSteps(outcome, extra));
  return { id, title: `Single-stage ${eventType}${cfg.auctionSubtype ? ` ${cfg.auctionSubtype.replace("_", " ")}` : ""}${cfg.awarding ? ` · award ${cfg.awarding.replace("_", " ")}` : ""} · ${items} item${items === 1 ? "" : "s"} · ${outcome}`, entry: "single-stage", stages: [eventType], strategy: cfg.auctionSubtype, awarding: cfg.awarding, items, outcome, steps };
}

function boq(id: string, items: number, outcome: Combo["outcome"], extra: { inv?: string } = {}): Combo {
  const steps: Step[] = [{ step: "open_create", args: { path: "boq" } }, { step: "set_title" }, { step: "select_template" }, { step: "add_line_items", args: { count: items } }, { step: "fill_sheet" }];
  if (outcome !== "draft") steps.push({ step: "set_schedule", args: { minutes: 45 } }, { step: "invite_vendor", args: { count: 1 } });
  steps.push(...outcomeSteps(outcome, extra));
  return { id, title: `BOQ · ${items} item${items === 1 ? "" : "s"} · ${outcome}`, entry: "boq", stages: ["boq"], items, outcome, steps };
}

function outcomeSteps(outcome: Combo["outcome"], extra: { vendors?: number; inv?: string }): Step[] {
  const after = extra.inv ? [inv(extra.inv)] : [];
  switch (outcome) {
    case "draft":
      return [{ step: "save_draft" }, { step: "expect_no_error" }, { step: "open_events_list" }, { step: "filter_events", args: { tab: "Drafts" } }, { step: "expect_event_in_list" }, ...after];
    case "publish":
      return [{ step: "publish" }, { step: "expect_published" }, ...after];
    case "surrogate":
      return [{ step: "publish" }, { step: "expect_published" }, { step: "place_surrogate_bid" }, { step: "expect_bid_submitted" }, { step: "open_master_qcs" }, ...after];
    case "two-vendors":
      return [{ step: "publish" }, { step: "expect_published" }, { step: "place_surrogate_bid" }, { step: "expect_bid_submitted" }, { step: "place_surrogate_bid" }, { step: "expect_bid_submitted" }, { step: "open_master_qcs" }, ...after];
    case "counter-offer":
      return [{ step: "publish" }, { step: "expect_published" }, { step: "place_surrogate_bid" }, { step: "expect_bid_submitted" }, { step: "open_master_qcs" }, { step: "place_counter_offer", args: { price: 90 } }, { step: "expect_counter_offer_sent" }, ...after];
    case "convert":
      return [{ step: "publish" }, { step: "expect_published" }, { step: "convert_to_auction" }, { step: "expect_no_error" }, ...after];
  }
}

/** The grid. Ids: E = eRFX, S = single-stage, B = BOQ. */
const COMBOS: Combo[] = [
  erfx("E1", ["auction"], 1, "surrogate", { inv: "live-auction-erfx" }),
  erfx("E2", ["auction"], 3, "publish"),
  erfx("E3", ["rfq"], 1, "surrogate", { inv: "master-qcs-rfq-one-bid" }),
  erfx("E4", ["rfq"], 3, "two-vendors", { vendors: 2, inv: "master-qcs-two-vendors" }),
  erfx("E5", ["rfp"], 1, "publish", { inv: "live-technical-only" }),
  erfx("E6", ["rfp", "rfq"], 2, "surrogate"),
  erfx("E7", ["rfp", "auction"], 2, "publish", { inv: "live-technical-auction" }),
  erfx("E8", ["rfq"], 1, "draft"),
  erfx("E9", ["rfp", "rfq"], 1, "draft", { inv: "draft-two-stage-in-list" }),
  erfx("E10", ["rfq"], 1, "convert", { inv: "converted-auction-create" }),
  erfx("E11", ["rfq"], 2, "counter-offer", { inv: "counter-offer-sent" }),
  erfx("E12", ["auction"], 5, "publish"),
  single("S1", "rfq", 1, "surrogate", { awarding: "lot" }, { inv: "single-stage-rfq-live" }),
  single("S2", "rfq", 2, "publish", { awarding: "line_item" }),
  single("S3", "rfp", 1, "publish", {}, { inv: "single-stage-rfp-live" }),
  single("S4", "auction", 1, "surrogate", { auctionSubtype: "rank", awarding: "lot" }, { inv: "single-stage-auction-rank-live" }),
  single("S5", "auction", 2, "publish", { auctionSubtype: "rank", awarding: "line_item" }),
  single("S6", "auction", 1, "publish", { auctionSubtype: "price", awarding: "lot" }, { inv: "single-stage-auction-price-live" }),
  single("S7", "auction", 2, "surrogate", { auctionSubtype: "price", awarding: "line_item" }),
  single("S8", "auction", 1, "publish", { auctionSubtype: "traffic_light", awarding: "lot", rangeLower: 80, rangeUpper: 120 }, { inv: "single-stage-traffic-light-live" }),
  single("S9", "auction", 2, "publish", { auctionSubtype: "traffic_light", awarding: "line_item", rangeLower: 80, rangeUpper: 120 }),
  single("S10", "rfq", 1, "draft", { awarding: "lot" }),
  boq("B1", 2, "publish", { inv: "boq-live" }),
  boq("B2", 5, "draft"),
  boq("B3", 1, "surrogate", { inv: "boq-master-qcs" }),
];

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (argv.includes("--list")) {
  for (const c of COMBOS) console.log(`${c.id.padEnd(4)} ${c.title}  (${c.steps.length} steps)`);
  process.exit(0);
}
const companyId = Number(arg("c") ?? 198678);
const only = arg("only")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const picked = only?.length ? COMBOS.filter((c) => only.includes(c.id)) : COMBOS;
const OUT = join(here, "..", "data", "combos");
mkdirSync(OUT, { recursive: true });
const startedAt = new Date().toISOString();
const file = join(OUT, `${startedAt.replace(/[:.]/g, "-")}.json`);
const t = () => new Date().toISOString().slice(11, 19);

interface ComboResult {
  id: string;
  title: string;
  entry: string;
  stages: string[];
  strategy?: string;
  awarding?: string;
  items: number;
  outcome: string;
  runId: string;
  passed: boolean | null;
  steps: number;
  ok: number;
  failedAt?: string;
  failedStep?: number;
  evidence?: string;
  pictures: number;
  ms: number;
  screens: string[];
}
const results: ComboResult[] = [];
const save = (done = false) => {
  const body = { file, startedAt, companyId, done, endedAt: done ? new Date().toISOString() : null, total: picked.length, results };
  writeFileSync(file, JSON.stringify(body, null, 2));
  writeFileSync(join(OUT, "latest.json"), JSON.stringify(body, null, 2));
};

console.log(`[${t()}] ${picked.length} combination(s) on company ${companyId} → ${file}`);
for (const c of picked) {
  const runId = `combo-${c.id.toLowerCase()}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  console.log(`[${t()}] ▶ ${c.id} ${c.title} (${c.steps.length} steps, run ${runId})`);
  const inventories: string[] = [];
  let pictures = 0;
  const result: any = await new Promise((resolve) => {
    runUiPlan({ plan: { title: `combo ${c.id}: ${c.title}`, steps: c.steps }, companyId, runId, headed: false }, (e: any) => {
      if (e.type === "spot") pictures++;
      const line = String(e.line ?? "");
      const m = /\[inventory\]\s+(\S+\.inventory\.json)/.exec(line);
      if (m) inventories.push(m[1]);
      if (e.type === "log" && /\[plan\] \d+\/\d+ .*(✗|↻)/.test(line)) console.log(`[${t()}]   ${line.replace(/^.*\[plan\]\s*/, "").slice(0, 220)}`);
      if (e.type === "queued") console.log(`[${t()}]   ${e.line}`);
      if (e.type === "done" || e.type === "run-error") resolve(readPlanResult(runId));
    });
  });
  const steps: any[] = result?.steps ?? [];
  const failedIdx = steps.findIndex((s) => s.status === "failed");
  const failed = failedIdx >= 0 ? steps[failedIdx] : null;
  const r: ComboResult = {
    id: c.id, title: c.title, entry: c.entry, stages: c.stages, strategy: c.strategy, awarding: c.awarding, items: c.items, outcome: c.outcome, runId,
    passed: result ? !!result.passed : null, steps: c.steps.length, ok: steps.filter((s) => s.status === "ok").length,
    ...(failed ? { failedAt: `${failed.step}: ${String(failed.detail ?? "").slice(0, 300)}`, failedStep: failedIdx + 1, evidence: failed.evidence?.screenshot } : {}),
    pictures, ms: Date.now() - t0, screens: [],
  };
  results.push(r);
  console.log(`[${t()}] ${r.passed ? "✓" : "✗"} ${c.id} ${r.ok}/${r.steps} steps · ${pictures} pictures · ${Math.round(r.ms / 1000)}s${failed ? ` · stopped at ${failed.step}` : ""}`);
  save();
  if (!argv.includes("--no-record")) {
    for (const f of inventories) {
      if (!existsSync(f)) continue;
      const rec = await recordScreen(f, { companyId, reachedBy: c.steps.filter((s) => s.step !== "inventory_screen"), cases: false, onLine: (l) => console.log(`[${t()}]   ${l}`) }).catch((e) => {
        console.log(`[${t()}]   could not record the screen: ${(e as Error).message}`);
        return null;
      });
      if (rec) r.screens.push(rec.id);
    }
    save();
  }
}
save(true);
const passed = results.filter((r) => r.passed).length;
console.log(`[${t()}] done: ${passed}/${results.length} combination(s) passed · ${results.reduce((n, r) => n + r.pictures, 0)} pictures · results ${file}`);
for (const r of results.filter((x) => !x.passed)) console.log(`   ✗ ${r.id} ${r.title} — ${r.failedAt ?? "did not run"}`);
process.exit(0);
