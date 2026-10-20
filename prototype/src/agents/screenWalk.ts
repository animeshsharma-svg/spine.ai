/**
 * THE SCREEN WALK — spine.ai walks the events flow in the browser the way a person would,
 * photographs every section it reaches (the plain screenshot, the numbered map, each control's
 * box), and turns each screen into knowledge and test cases (screenModel.ts).
 *
 * A walk is a browser plan (procol-ui-tests steps) with `inventory_screen` at every section.
 * It runs through the same runner as any dashboard run — the single browser slot, live frames,
 * the spotlight on every action — so the dashboard shows it happening. When the run ends, every
 * inventory it wrote becomes a screen record: controls described, cases written, memory page
 * saved. Screens that need an event in a later state (bids in, proposal) are reached from a
 * state the API builds first (uiSetup.ts), the same way the screen-case script did.
 *
 * Sessions are kept in data/screens/walks/<id>.json; the dashboard follows one over SSE.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runUiPlan, readPlanResult } from "../ui/uiFlowRunner.js";
import { buildUiState, type UiState } from "../ui/uiSetup.js";
import { recordScreen, SCREENS_DIR, type ScreenRecord, type ScreenSummary } from "./screenModel.js";

const WALKS_DIR = join(SCREENS_DIR, "walks");
// The model describes every control of every screen: give the fast tier time to answer rather
// than falling back on the first slow reply (the explore loop does the same).
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "30000";

type Step = { step: string; args?: Record<string, unknown> };
const inv = (label: string): Step => ({ step: "inventory_screen", args: { label } });

export interface WalkDef {
  id: string;
  title: string;
  /** what a person would say it covers */
  covers: string;
  /** an event state the API builds before the browser starts (none = start from nothing) */
  state: UiState;
  technical?: boolean;
  steps: Step[];
  /** minutes a person should expect */
  minutes: number;
}

/**
 * The walks, in the order a person meets the screens. Each `inventory_screen` label is the
 * screen's name in the library; walking again refreshes the same screen.
 */
export const WALKS: WalkDef[] = [
  {
    id: "list",
    title: "The events list and its tabs",
    covers: "Live, History, Drafts, Recurring tabs; search and filters; the Create Event menu",
    state: "none",
    minutes: 2,
    steps: [
      { step: "open_events_list" },
      { step: "expect_events_list" },
      inv("events-list"),
      { step: "filter_events", args: { tab: "History" } },
      inv("events-history"),
      { step: "filter_events", args: { tab: "Drafts" } },
      inv("events-drafts"),
      { step: "filter_events", args: { tab: "Recurring" } },
      inv("events-recurring"),
      { step: "filter_events", args: { tab: "Live" } },
      { step: "expect_create_options" },
      inv("create-event-menu"),
    ],
  },
  {
    id: "create-erfx",
    title: "Create an eRFX project: technical + RFQ, publish it",
    covers: "stages, template, line items, pricing sheet, questionnaires, evaluator, schedule, participants, publish, the live project page",
    state: "none",
    minutes: 7,
    steps: [
      { step: "open_create", args: { path: "erfx" } },
      inv("create-erfx"),
      { step: "set_title" },
      { step: "compose_stages", args: { stages: ["rfp", "rfq"] } },
      inv("create-stages-rfp-rfq"),
      { step: "switch_stage", args: { stage: "rfp" } },
      { step: "select_template" },
      inv("create-technical-template"),
      { step: "switch_stage", args: { stage: "rfq" } },
      { step: "select_template" },
      { step: "add_line_items", args: { count: 2 } },
      inv("create-line-items"),
      { step: "fill_sheet" },
      inv("create-pricing-sheet"),
      { step: "switch_stage", args: { stage: "rfp" } },
      { step: "fill_questionnaires" },
      { step: "assign_evaluator" },
      inv("create-technical-questionnaire"),
      { step: "switch_stage", args: { stage: "rfq" } },
      { step: "set_schedule", args: { minutes: 30 } },
      inv("create-schedule"),
      { step: "invite_vendor", args: { count: 1 } },
      inv("create-participants"),
      { step: "publish" },
      { step: "expect_published" },
      inv("project-live"),
      { step: "open_event_settings" },
      inv("project-settings-menu"),
      { step: "press", args: { key: "Escape" } },
      { step: "open_participants" },
      inv("participants-live"),
      { step: "place_surrogate_bid" },
      { step: "expect_bid_submitted" },
      inv("surrogate-bid-placed"),
      { step: "open_master_qcs" },
      inv("master-qcs-live"),
    ],
  },
  {
    id: "single-stage",
    title: "Single-stage auction: rank based, lot awarding",
    covers: "the configuration drawer (event type, auction strategy, awarding rule), template, items, sheet, schedule, invite, publish, the live auction page",
    state: "none",
    minutes: 6,
    steps: [
      { step: "open_create", args: { path: "single-stage" } },
      inv("create-single-stage"),
      { step: "configure_single_stage", args: { eventType: "auction", auctionSubtype: "rank", awarding: "lot" } },
      inv("single-stage-configured-auction"),
      { step: "set_title" },
      { step: "select_template" },
      { step: "add_line_items", args: { count: 2 } },
      { step: "fill_sheet" },
      inv("single-stage-sheet"),
      { step: "set_schedule", args: { minutes: 30 } },
      { step: "invite_vendor", args: { count: 1 } },
      { step: "publish" },
      { step: "expect_published" },
      inv("auction-live"),
    ],
  },
  {
    id: "boq-draft",
    title: "BOQ project saved as a draft",
    covers: "the BOQ create screen, BOQ line items, Save as draft, the draft in the Drafts tab",
    state: "none",
    minutes: 4,
    steps: [
      { step: "open_create", args: { path: "boq" } },
      inv("create-boq"),
      { step: "set_title" },
      { step: "select_template" },
      { step: "add_line_items", args: { count: 2 } },
      inv("boq-line-items"),
      { step: "save_draft" },
      { step: "expect_no_error" },
      { step: "open_events_list" },
      { step: "filter_events", args: { tab: "Drafts" } },
      { step: "expect_event_in_list" },
      inv("draft-in-list"),
    ],
  },
  {
    id: "compare-award",
    title: "Compare bids and award (event built by API with bids in)",
    covers: "Responses, Analytics, Master QCS, Start Awarding, allocation counters",
    state: "bid",
    minutes: 6,
    steps: [
      { step: "open_prepared", args: { screen: "responses" } },
      inv("responses-bids-in"),
      { step: "open_prepared", args: { screen: "analytics" } },
      inv("analytics"),
      { step: "open_prepared", args: { screen: "master_qcs" } },
      inv("master-qcs-bids-in"),
      { step: "start_awarding" },
      inv("awarding"),
      { step: "allocate_award" },
      { step: "expect_award_counters" },
      inv("awarding-allocated"),
    ],
  },
  {
    id: "proposal",
    title: "The award proposal page (event built by API with a proposal)",
    covers: "the proposal, approvals, remarks, NFA",
    state: "proposal",
    minutes: 3,
    steps: [{ step: "open_prepared", args: { screen: "proposal" } }, inv("proposal"), { step: "open_prepared", args: { screen: "summary" } }, inv("project-proposal-summary")],
  },
  {
    id: "convert",
    title: "Convert a published RFQ to an auction",
    covers: "the Settings menu's Convert to Auction, the converted event's create screen",
    state: "none",
    minutes: 6,
    steps: [
      { step: "open_create", args: { path: "erfx" } },
      { step: "set_title" },
      { step: "compose_stages", args: { stages: ["rfq"] } },
      { step: "select_template" },
      { step: "add_line_items", args: { count: 1 } },
      { step: "fill_sheet" },
      { step: "set_schedule", args: { minutes: 30 } },
      { step: "invite_vendor", args: { count: 1 } },
      { step: "publish" },
      { step: "expect_published" },
      inv("rfq-live"),
      { step: "convert_to_auction" },
      inv("convert-to-auction"),
    ],
  },
];

export interface WalkSession {
  id: string;
  companyId: number;
  walks: string[];
  status: "running" | "done" | "stopped" | "failed";
  startedAt: string;
  endedAt?: string;
  current?: { walk: string; runId: string };
  /** what each walk's run did */
  runs: Array<{ walk: string; runId: string; passed: boolean | null; steps: number; ok: number; failedAt?: string; inventories: string[]; screens: string[] }>;
  screens: ScreenSummary[];
  log: Array<{ at: string; text: string }>;
  summary?: string;
}

type Listener = (event: string, data: unknown) => void;
interface Live {
  s: WalkSession;
  listeners: Set<Listener>;
  stop?: () => void;
  stopped: boolean;
}
const live = new Map<string, Live>();
const now = () => new Date().toISOString();

function save(L: Live): void {
  mkdirSync(WALKS_DIR, { recursive: true });
  writeFileSync(join(WALKS_DIR, `${L.s.id}.json`), JSON.stringify(L.s, null, 2));
}
function emit(L: Live, event: string, data: unknown, text?: string): void {
  if (text) {
    L.s.log.push({ at: now(), text });
    if (L.s.log.length > 400) L.s.log.splice(0, 50);
  }
  for (const f of L.listeners) {
    try {
      f(event, data);
    } catch {
      /* a closed listener */
    }
  }
  if (event !== "frame" && event !== "spot") save(L);
}

/** The event state a walk needs, built by API (cached per session). */
async function contextFor(L: Live, w: WalkDef): Promise<Record<string, unknown> | null | undefined> {
  if (w.state === "none") return undefined;
  emit(L, "log", { text: `building a "${w.state}" event through the API for "${w.title}"…` }, `building a "${w.state}" event through the API`);
  const b: any = await buildUiState(L.s.companyId, w.state, { technical: !!w.technical, onLine: (l) => emit(L, "log", { text: l }) }).catch((e) => ({ ok: false, why: (e as Error).message }));
  const x = b.ok ? b.context : null;
  if (!x) {
    emit(L, "log", { text: `could not build the ${w.state} state: ${b.why}` }, `could not build the ${w.state} state: ${b.why}`);
    return null;
  }
  return { state: x.state, eventGroupUuid: x.eventGroupUuid, stageUuid: x.stageUuid, technicalStageUuid: x.technicalStageUuid, proposalUuid: x.made?.proposalUuid, title: x.title, vendorName: x.vendorName, vendorEmail: x.vendorEmail, values: x.values, buyerUserId: x.buyerUserId };
}

function runWalk(L: Live, w: WalkDef, context: Record<string, unknown> | undefined, runId: string): Promise<{ inventories: string[]; result: any }> {
  return new Promise((resolve) => {
    const inventories: string[] = [];
    const h = runUiPlan({ plan: { title: `walk: ${w.title}`, steps: w.steps, ...(context ? { context } : {}) }, companyId: L.s.companyId, runId, headed: false }, (e: any) => {
      if (L.stopped) return;
      if (e.type === "frame") return emit(L, "frame", { frame: e.frame });
      if (e.type === "spot") return emit(L, "spot", e.spot);
      const line = String(e.line ?? "");
      const m = /\[inventory\]\s+(\S+\.inventory\.json)/.exec(line);
      if (m) inventories.push(m[1]);
      if (e.type === "log" && /\[plan\] \d+\/\d+ /.test(line)) emit(L, "progress", { line: line.replace(/^.*\[plan\]\s*/, "").slice(0, 240) }, line.replace(/^.*\[plan\]\s*/, "").slice(0, 240));
      else if (e.type === "queued") emit(L, "log", { text: e.line }, e.line);
      if (e.type === "done" || e.type === "run-error") resolve({ inventories, result: readPlanResult(runId) });
    });
    L.stop = h.stop;
  });
}

/** The plan steps that reached an inventory: its "how to get here". */
function reachOf(w: WalkDef, label: string): Step[] {
  const i = w.steps.findIndex((s) => s.step === "inventory_screen" && s.args?.label === label);
  return w.steps.slice(0, Math.max(0, i)).filter((s) => s.step !== "inventory_screen");
}

export function startWalk(input: { companyId: number; walks?: string[]; cases?: boolean; maxCases?: number }): { id?: string; why?: string } {
  const picked = (input.walks?.length ? input.walks : WALKS.map((w) => w.id)).filter((id) => WALKS.some((w) => w.id === id));
  if (!picked.length) return { why: `no such walk — choose from ${WALKS.map((w) => w.id).join(", ")}` };
  if ([...live.values()].some((x) => x.s.status === "running")) return { why: "a walk is already running — wait for it or stop it" };
  const id = `walk-${Date.now().toString(36)}`;
  const s: WalkSession = { id, companyId: input.companyId, walks: picked, status: "running", startedAt: now(), runs: [], screens: [], log: [] };
  const L: Live = { s, listeners: new Set(), stopped: false };
  live.set(id, L);
  save(L);
  void (async () => {
    const seen: Array<{ id: string; title: string }> = [];
    try {
      for (const wid of picked) {
        if (L.stopped) break;
        const w = WALKS.find((x) => x.id === wid)!;
        const runId = `walk-${wid}-${Date.now().toString(36)}`;
        s.current = { walk: wid, runId };
        emit(L, "walk", { walk: wid, title: w.title, runId }, `walking "${w.title}" (${w.steps.filter((x) => x.step === "inventory_screen").length} screens)`);
        const ctx = await contextFor(L, w);
        if (ctx === null) {
          s.runs.push({ walk: wid, runId, passed: null, steps: w.steps.length, ok: 0, failedAt: "the API could not build the state this walk needs", inventories: [], screens: [] });
          continue;
        }
        const { inventories, result } = await runWalk(L, w, ctx, runId);
        if (L.stopped) break;
        const steps: any[] = result?.steps ?? [];
        const failed = steps.find((x) => x.status === "failed");
        const run = { walk: wid, runId, passed: result?.passed ?? null, steps: w.steps.length, ok: steps.filter((x) => x.status === "ok").length, ...(failed ? { failedAt: `${failed.step}: ${String(failed.detail ?? "").slice(0, 200)}` } : {}), inventories, screens: [] as string[] };
        s.runs.push(run);
        emit(L, "log", { text: `"${w.title}": ${run.ok}/${run.steps} steps, ${inventories.length} screen(s) photographed${failed ? ` — stopped at ${failed.step}` : ""}` }, `"${w.title}": ${run.ok}/${run.steps} steps, ${inventories.length} screen(s) photographed${failed ? ` — stopped at ${failed.step}: ${String(failed.detail ?? "").slice(0, 160)}` : ""}`);
        for (const f of inventories) {
          if (L.stopped) break;
          if (!existsSync(f)) continue;
          let label = "";
          try {
            label = JSON.parse(readFileSync(f, "utf8")).label;
          } catch {
            continue;
          }
          emit(L, "log", { text: `reading the "${label}" screen: describing its controls and writing cases…` }, `reading the "${label}" screen`);
          const rec: ScreenRecord | null = await recordScreen(f, { companyId: s.companyId, reachedBy: reachOf(w, label), cases: input.cases !== false, maxCases: input.maxCases ?? 6, seen, onLine: (l) => emit(L, "log", { text: l }, l) }).catch((e) => {
            emit(L, "log", { text: `could not record "${label}": ${(e as Error).message}` }, `could not record "${label}": ${(e as Error).message}`);
            return null;
          });
          if (!rec) continue;
          run.screens.push(rec.id);
          const sum = { id: rec.id, label: rec.label, path: rec.path, state: rec.state, controls: rec.controls.length, effects: rec.effects.length, known: rec.effects.filter((e) => e.confidence !== "unknown").length, cases: rec.cases.length, rulesUntested: rec.rules.filter((r) => r.verdict === "not covered").length, takenAt: rec.takenAt, captures: rec.captures, hasMap: !!rec.images.map };
          s.screens = [...s.screens.filter((x) => x.id !== rec.id), sum];
          emit(L, "screen", sum, `"${rec.label}": ${sum.controls} controls, ${sum.known} described, ${sum.cases} cases`);
        }
      }
      s.status = L.stopped ? "stopped" : "done";
    } catch (e) {
      s.status = "failed";
      emit(L, "log", { text: `the walk failed: ${(e as Error).message}` }, `the walk failed: ${(e as Error).message}`);
    } finally {
      s.endedAt = now();
      s.current = undefined;
      const shots = s.screens.length;
      const cases = s.screens.reduce((n, x) => n + x.cases, 0);
      s.summary = `${s.runs.filter((r) => r.passed).length}/${s.runs.length} walk(s) completed · ${shots} screen(s) in the library · ${cases} case(s) on them`;
      emit(L, "done", { status: s.status, summary: s.summary, screens: s.screens }, s.summary);
      live.delete(id);
      save(L);
    }
  })();
  return { id };
}

export function stopWalk(id: string): boolean {
  const L = live.get(id);
  if (!L) return false;
  L.stopped = true;
  L.stop?.();
  return true;
}

export function subscribeWalk(id: string, f: Listener): (() => void) | null {
  const L = live.get(id);
  if (!L) return null;
  L.listeners.add(f);
  return () => L.listeners.delete(f);
}

export function getWalk(id: string): WalkSession | null {
  const L = live.get(id);
  if (L) return L.s;
  const f = join(WALKS_DIR, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as WalkSession) : null;
}

export function listWalks(limit = 20): Array<Pick<WalkSession, "id" | "status" | "startedAt" | "endedAt" | "summary" | "walks" | "companyId">> {
  if (!existsSync(WALKS_DIR)) return [];
  return readdirSync(WALKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(WALKS_DIR, f), "utf8")) as WalkSession;
        return { id: s.id, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, summary: s.summary, walks: s.walks, companyId: s.companyId };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/** The walk running now, if any. */
export function runningWalk(): WalkSession | null {
  return [...live.values()].find((x) => x.s.status === "running")?.s ?? null;
}

