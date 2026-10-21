/**
 * UI FLOW RUNNER — triggers the existing Playwright UI journeys from a button.
 *
 * The `procol-ui-tests` project already holds 32 self-checking browser journeys
 * (create an RFQ, run an auction, submit a vendor bid, create master data…).
 * Until now they were only runnable by typing a command:
 *
 *   npx playwright test tests/ui-master.spec.ts -g "events.rfq_only" --headed
 *
 * This module runs exactly that command for you, so the dashboard's buttons and
 * the terminal do the same thing. Nothing is reimplemented — we shell out to the
 * real suite, which is why what you watch in the browser is the real journey.
 *
 * Per-run inputs we pass through as environment variables:
 *   COMPANY_ID     — which client to sign in as (the dropdown)
 *   UI_LINE_ITEMS  — how many line items to build (normal events)
 *   UI_BOQ_ITEMS   — how many line items to build (BOQ events)
 * The line-item counts are capped by the client's own
 * `allowed_maximum_line_items` config ({boq, non_boq}), so we can never ask for
 * more than that client actually permits.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { acquireBrowser, setSlotProgress, setSlotHeaded } from "./browserSlot.js";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const UI_TESTS_DIR = join(here, "..", "..", "..", "procol-ui-tests");
const SPEC = "tests/ui-master.spec.ts";
/**
 * The purchase-to-bill suite — its own Playwright project.
 *
 * A separate directory, config, login and target deployment, so it cannot be
 * run by pointing the usual runner at a different spec file: it needs its own
 * working directory too.
 */
const THREE_WAY_DIR = join(here, "..", "..", "..", "three-way-match");
const THREE_WAY_SPEC = "tests/po_to_bill.spec.js";
const THREE_WAY_TEST = "P2P Flow - 3 Way Match";

/** The browser journeys, grouped the way the dashboard shows them. */
export interface UiFlowDef {
  key: string;
  label: string;
  group: string;
  /** true when the journey builds line items, so the count input applies. */
  usesLineItems?: boolean;
  /** true when it's a BOQ journey (uses the BOQ line-item limit). */
  boq?: boolean;
  /**
   * Which Playwright project this journey lives in.
   *
   * Everything here used to be one suite against UAT, so the runner could
   * assume a directory and a spec file. The 3-way-match journey is a separate
   * project with its own config, its own login and its own deployment — so a
   * journey now says which suite it belongs to rather than the runner guessing.
   */
  suite?: "ui-master" | "three-way-match";
  /**
   * The accounts this journey may be offered to, when it is not universal.
   *
   * The 3-way-match suite signs into the sandbox demo deployment specifically,
   * so offering it under a UAT company would be offering a journey that cannot
   * log in. Undefined means "every account the UAT journeys work for".
   */
  clients?: number[];
}

export const UI_FLOWS: UiFlowDef[] = [
  // events — the ERFX (project) creation variants
  { key: "events.rfq_only", label: "RFQ only", group: "Events", usesLineItems: true },
  { key: "events.rfp_only", label: "Technical / RFP only", group: "Events", usesLineItems: true },
  { key: "events.rfp_rfq", label: "Technical + RFQ (2-stage)", group: "Events", usesLineItems: true },
  { key: "events.rfq_auction", label: "RFQ → Auction (2-stage)", group: "Events", usesLineItems: true },
  { key: "events.rfp_auction", label: "Technical + Auction", group: "Events", usesLineItems: true },
  { key: "events.multi_product", label: "Multi-line-item RFQ", group: "Events", usesLineItems: true },
  { key: "events.single_stage_rfq", label: "Single-stage RFQ (non-ERFX)", group: "Events", usesLineItems: true },
  { key: "events.single_stage_rfp", label: "Single-stage RFP (non-ERFX)", group: "Events", usesLineItems: true },
  // auctions
  { key: "events.auction_rank", label: "Auction — rank based", group: "Auctions", usesLineItems: true },
  { key: "events.auction_price", label: "Auction — price based", group: "Auctions", usesLineItems: true },
  { key: "events.auction_traffic_light", label: "Auction — traffic light", group: "Auctions", usesLineItems: true },
  // awarding rule chosen at creation
  { key: "events.award_lot_wise", label: "Award whole lot to one vendor", group: "Awarding rule", usesLineItems: true },
  { key: "events.award_line_item_wise", label: "Award line-item-wise", group: "Awarding rule", usesLineItems: true },
  // lifecycle
  { key: "event.draft_create", label: "Save as draft", group: "Lifecycle" },
  { key: "event.scheduled", label: "Schedule for later", group: "Lifecycle" },
  // bidding (buyer + vendor portals)
  { key: "bid.submit", label: "Vendor places a bid (both portals)", group: "Bidding", usesLineItems: true },
  // purchase requests
  { key: "pr.list", label: "PR list & tabs", group: "Purchase requests" },
  { key: "pr.reorder_available", label: "Reorder action present", group: "Purchase requests" },
  { key: "pr.bulk_upload", label: "Bulk upload PRs", group: "Purchase requests" },
  // approvals / vendors
  { key: "approval.user_approvals", label: "Pending on me", group: "Approvals" },
  { key: "approval.company_workflow", label: "All approvals", group: "Approvals" },
  { key: "vendor.management", label: "Vendor workspace", group: "Vendors" },
  { key: "vendor.onboarding_available", label: "Start onboarding present", group: "Vendors" },
  { key: "contract.create", label: "Create a contract", group: "Vendors" },
  // master data
  { key: "masterdata.location", label: "Create location", group: "Master data" },
  { key: "masterdata.user", label: "Create user", group: "Master data" },
  { key: "masterdata.team", label: "Create team", group: "Master data" },
  { key: "masterdata.product", label: "Create product", group: "Master data" },
  { key: "user.list", label: "Users workspace", group: "Master data" },
  { key: "user.erp_id_field", label: "ERP ID field present", group: "Master data" },
  { key: "display.draft_tab", label: "Drafts tab shown", group: "Display" },
  { key: "display.po_configurations", label: "PO configuration shown", group: "Display" },
  // Negative journeys: these PASS when the console refuses the action.
  {
    key: "validation.publish_without_vendor",
    label: "Publishing without a vendor is refused",
    group: "Validation (must be refused)",
    usesLineItems: true,
  },
  /**
   * The purchase-to-bill journey, driven through the browser.
   *
   * A different suite, a different deployment, a different login — it signs
   * into the sandbox demo tenant the whole PO flow was built on and clicks the
   * document all the way through: raise the PO, invoice it, receive it (GRN),
   * then bill it and watch the 3-way match settle. That is why it is pinned to
   * that one account: on a UAT company it could not even log in.
   */
  {
    key: "finance.three_way",
    label: "PO → Bill (3-way match)",
    group: "Purchase to bill",
    suite: "three-way-match",
    clients: [900001],
  },
];

/** The journeys this account can actually run. */
export function uiFlowsFor(companyId: number): UiFlowDef[] {
  return UI_FLOWS.filter((f) => !f.clients || f.clients.includes(companyId));
}

export interface UiRunOptions {
  flowKey: string;
  companyId: number;
  /**
   * Tag the run so its Oracle findings can be found again afterwards.
   * The child writes `procol-ui-tests/findings/run-<runId>.json`, which is how
   * the platform picks up what this specific run discovered rather than
   * scraping stdout.
   */
  runId?: string;
  /** Line items for a normal (non-BOQ) event. */
  lineItems?: number;
  /** Line items for a BOQ event. */
  boqItems?: number;
  /** Line-item quantity: "5" for every line, or "5,10,2.5" one per line. */
  quantity?: string;
  /** How many QA vendors to invite. */
  vendors?: number;
  /** After an event journey publishes, how many invited vendors bid on it (UI_BIDDERS). */
  bidders?: number;
  /** Template to pick, by name substring. Journey takes the first otherwise. */
  template?: string;
  /** Event duration in minutes — the journey edits the schedule window. */
  scheduleMinutes?: number;
  /** false → run without opening a visible window. */
  headed?: boolean;
  /**
   * Sign in through the login screen instead of dropping a session into the
   * browser. Someone watching the run sees the sign-in, and the login page —
   * part of the product too — is actually exercised. The journey narrates
   * each login step, so they reach the trail and the report.
   */
  showLogin?: boolean;
}

export interface UiRunEvent {
  /** "queued" — another run holds the browser; this one starts when it ends. */
  // "run-error", not "error": the SSE wire event name is this literally, and
  // a browser EventSource treats a server-sent event named "error" as
  // indistinguishable from its own connection-failure event — the exact
  // collision that made "run error" appear after every normal, successful run
  // elsewhere in this codebase. Every consumer forwards e.type verbatim.
  type: "start" | "log" | "done" | "run-error" | "queued" | "frame" | "ask" | "explore-step";
  line?: string;
  command?: string;
  exitCode?: number;
  /** base64 JPEG — a live preview frame for the dashboard's split view. */
  frame?: string;
  /** "ask": the explorer's question to the tester (procol-ui-tests/src/explore/ask.ts) */
  ask?: Record<string, unknown>;
  /** "explore-step": one step the explorer took or is taking */
  step?: Record<string, unknown>;
}

/**
 * Run one journey, streaming Playwright's output line by line.
 * Returns a stop() so a caller can cancel a run mid-flight.
 */
// Terminal colour codes, matched by their escape byte written out so the
// character never appears literally in this file.
const ANSI = new RegExp("\\x1b\\[[0-9;]*m", "g");

/**
 * Spawn one Playwright child — after taking the single browser slot.
 *
 * Returns synchronously with a `stop`, exactly as before, so callers are
 * unchanged. Internally it waits for the slot, tells the caller it is queued
 * if it has to wait, spawns when granted, and releases on close. A `stop`
 * before the spawn simply withdraws from the queue.
 */
function launch(
  label: string,
  args: string[],
  env: Record<string, string>,
  emit: (e: UiRunEvent) => void,
  onStart: () => void,
  stripAnsi = false,
  cwd: string = UI_TESTS_DIR,
): { stop: () => void } {
  let child: ReturnType<typeof spawn> | null = null;
  let stopped = false;
  const slot = acquireBrowser(label, (position, running) =>
    emit({
      type: "queued",
      line: `waiting for the browser — "${running?.label ?? "another run"}" is using it (position ${position} in the queue)`,
    }),
  );
  slot.ready.then((release) => {
    if (stopped) return release();
    onStart();
    child = spawn("npx", args, { cwd, env, shell: false });
    setSlotHeaded(args.includes("--headed"));
    setSlotProgress("starting the browser");
    // A live frame line is a base64 JPEG — tens of KB, easily bigger than one
    // pipe read, so a naive per-chunk split() would hand back a line sliced in
    // half. Buffer across chunks and only split on complete lines.
    let carry = "";
    const onData = (buf: Buffer) => {
      carry += buf.toString();
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const raw of lines) {
        const line = stripAnsi ? raw.replace(ANSI, "").trimEnd() : raw;
        if (!line.trim()) continue;
        if (line.startsWith("[frame] ")) {
          emit({ type: "frame", frame: line.slice("[frame] ".length) });
          continue;
        }
        // The explorer's questions and steps, as structured events (src/explore/ in the UI suite).
        const tagged = line.match(/^\[(ask|explore-step)\] (\{.*\})\s*$/);
        if (tagged) {
          try {
            const body = JSON.parse(tagged[2]);
            if (tagged[1] === "ask") {
              setSlotProgress("waiting for your answer");
              emit({ type: "ask", ask: body });
            } else {
              if (body.status === "run" && body.text) setSlotProgress(`step ${body.n} — ${String(body.text).slice(0, 70)}`);
              emit({ type: "explore-step", step: body });
            }
            continue;
          } catch {
            /* not ours after all: an ordinary log line */
          }
        }
        // Mirror the run's own narration into the slot so the dashboard strip
        // can say what a HEADLESS run is doing right now.
        const m = raw.match(/\[plan\] (\d+)\/(\d+) (\S+)( ✓| ✗)?/) ?? raw.match(/\[(create-event|bid|surrogate|award|flow|po-to-bill)\] (.{0,80})/);
        if (m) setSlotProgress(m[3] ? `step ${m[1]}/${m[2]} — ${m[3].replace(/_/g, " ")}${m[4] ?? ""}` : m[2]);
        if (/showing the login/.test(raw)) setSlotProgress("logging in (visible)");
        emit({ type: "log", line });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    // "run-error", not "error" — see the UiRunEvent type above.
    child.on("error", (e) => emit({ type: "run-error", line: e.message }));
    child.on("close", (code) => {
      release();
      emit({ type: "done", exitCode: code ?? 1 });
    });
  });
  return {
    stop: () => {
      stopped = true;
      slot.cancel();
      child?.kill("SIGTERM");
    },
  };
}

/**
 * Run a compiled test plan instead of a named journey.
 *
 * The plan is handed over as a file rather than an argument: plans get long,
 * and a shell has opinions about quoting that a JSON blob does not survive.
 */
export function runUiPlan(
  opts: { plan: unknown; companyId: number; runId?: string; headed?: boolean; showLogin?: boolean; slowMo?: number },
  emit: (e: UiRunEvent) => void,
): { stop: () => void } {
  const dir = join(UI_TESTS_DIR, ".plans");
  mkdirSync(dir, { recursive: true });
  const runId = opts.runId ?? `plan-${Date.now().toString(36)}`;
  const planFile = join(dir, `${runId}.json`);
  const resultFile = join(dir, `${runId}-result.json`);
  writeFileSync(planFile, JSON.stringify(opts.plan, null, 2));

  const args = ["playwright", "test", "tests/plan.spec.ts", "--workers=1"];
  if (opts.headed !== false) args.push("--headed");

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    COMPANY_ID: String(opts.companyId),
    UI_PLAN_FILE: planFile,
    UI_PLAN_RESULT: resultFile,
    UI_QUIET_MAP: "1",
    QA_RUN_ID: runId,
    // A plan run can ask the tester too (no event fits the case: create one,
    // pick one, or stop) — the explorer's question channel, same folder.
    UI_EXPLORE_DIR: dir,
  };
  if (env.GOOGLE_API_KEY) env.UI_AI_HEAL = "1";
  // Blind waits shrink to 70% on every plan run; timeouts for real conditions
  // are untouched. A headed demo can ask to SEE the login and to be slowed.
  env.UI_SPEED = env.UI_SPEED ?? "0.7";
  if (opts.headed !== false && opts.showLogin) env.UI_SHOW_LOGIN = "1";
  if (opts.headed !== false && opts.slowMo) env.UI_SLOWMO = String(opts.slowMo);

  return launch(`plan ${runId}`, args, env, emit, () =>
    emit({ type: "start", line: `npx ${args.join(" ")}`, command: `plan ${runId}` }),
  );
}

/**
 * The key an explorer run sends back with each model request
 * (POST /api/explore/decide). Made fresh at every server start and only ever
 * handed to the runs this server started, so the endpoint is not a free model
 * proxy for anything else that can reach the port.
 */
export const EXPLORE_KEY = randomBytes(18).toString("hex");

/**
 * Work a journey out on screen: the case had no steps the compiler could use
 * (coverage "none"), so the explorer drives the app toward the goal itself and
 * asks the tester when it cannot choose (procol-ui-tests/src/explore/). Its
 * result lands where a plan's does, so readPlanResult reads both.
 */
export function runUiExplore(
  opts: { goal: string; companyId: number; runId: string; headed?: boolean; showLogin?: boolean; serverUrl: string },
  emit: (e: UiRunEvent) => void,
): { stop: () => void } {
  const dir = join(UI_TESTS_DIR, ".plans");
  mkdirSync(dir, { recursive: true });
  const goalFile = join(dir, `${opts.runId}-explore.json`);
  writeFileSync(goalFile, JSON.stringify({ goal: opts.goal }, null, 2));

  const args = ["playwright", "test", "tests/explore.spec.ts", "--workers=1"];
  if (opts.headed !== false) args.push("--headed");
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    COMPANY_ID: String(opts.companyId),
    UI_EXPLORE_FILE: goalFile,
    UI_EXPLORE_DIR: dir,
    UI_EXPLORE_KEY: EXPLORE_KEY,
    SPINE_SERVER: opts.serverUrl,
    UI_PLAN_RESULT: join(dir, `${opts.runId}-result.json`),
    UI_QUIET_MAP: "1",
    QA_RUN_ID: opts.runId,
  };
  if (opts.headed !== false && opts.showLogin) env.UI_SHOW_LOGIN = "1";
  return launch(`explore ${opts.runId}`, args, env, emit, () =>
    emit({ type: "start", line: `npx ${args.join(" ")}`, command: `explore ${opts.runId}` }),
  );
}

/**
 * The tester's answer to an explorer's question, where the run is waiting for
 * it (procol-ui-tests/src/explore/ask.ts polls for this file). False when the
 * run or the question is not one this server could have asked.
 */
export function writeExploreAnswer(runId: string, n: number, answer: { option: string | null; text: string }): boolean {
  if (!/^(?:plan|ui)-[a-z0-9]+$/i.test(runId) || !Number.isInteger(n) || n < 1 || n > 500) return false;
  const dir = join(UI_TESTS_DIR, ".plans");
  // An explorer run, a plan run (its plan file) or a browser journey (its ask marker) can ask.
  if (!existsSync(join(dir, `${runId}-explore.json`)) && !existsSync(join(dir, `${runId}.json`)) && !existsSync(join(dir, `${runId}-ask.json`))) return false;
  writeFileSync(join(dir, `${runId}-answer-${n}.json`), JSON.stringify({ option: answer.option, text: answer.text, at: new Date().toISOString() }));
  return true;
}

/** What each step of a finished plan actually did. */
export function readPlanResult(runId: string): unknown | null {
  const f = join(UI_TESTS_DIR, ".plans", `${runId}-result.json`);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

/** Stuck points the automation has recorded, newest first. */
export function readStuck(): Array<Record<string, unknown>> {
  const dir = join(UI_TESTS_DIR, "stuck");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
        // The accessibility tree is large; send a usable slice, not all of it.
        return { ...r, accessibilityTree: String(r.accessibilityTree ?? "").slice(0, 4_000) };
      } catch {
        return null;
      }
    })
    .filter((r): r is Record<string, unknown> => r !== null)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** What the automation has learned, so the dashboard can show it improving. */
export function readLearned(): Record<string, unknown> {
  const f = join(UI_TESTS_DIR, "locators.learned.json");
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Teach the automation a locator it got stuck on.
 *
 * Reopens the stuck screen, asks the AI to find the control, and persists what
 * it finds so the step becomes deterministic. This is what the dashboard's fix
 * button runs.
 */
export function runTeach(
  opts: { stuckId: string; instruction?: string; headed?: boolean },
  emit: (e: UiRunEvent) => void,
): { stop: () => void } {
  const args = ["playwright", "test", "tests/teach.spec.ts", "--workers=1"];
  if (opts.headed !== false) args.push("--headed");
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TEACH_STUCK_ID: opts.stuckId,
    UI_QUIET_MAP: "1",
  };
  if (opts.instruction) env.TEACH_INSTRUCTION = opts.instruction;
  // Teaching IS the AI path; without a key there is nothing to ask.
  if (env.GOOGLE_API_KEY) env.UI_AI_HEAL = "1";

  return launch(`teach ${opts.stuckId}`, args, env, emit, () =>
    emit({ type: "start", line: `teaching "${opts.stuckId}"`, command: `npx ${args.join(" ")}` }),
  );
}

export function runUiFlow(opts: UiRunOptions, emit: (e: UiRunEvent) => void): { stop: () => void } {
  const flow = UI_FLOWS.find((f) => f.key === opts.flowKey);
  if (!flow) {
    emit({ type: "run-error", line: `unknown UI flow "${opts.flowKey}"` });
    return { stop: () => {} };
  }

  /**
   * The purchase-to-bill suite runs itself, in its own directory.
   *
   * It has its own config (its own baseURL, its own login, its own timeout),
   * so the only things to pass are whether to show the browser and whether to
   * keep the demo pacing. Its spec file is named explicitly AND grepped by
   * title, so no sibling spec in that project can be picked up by accident.
   */
  if (flow.suite === "three-way-match") {
    const args = ["playwright", "test", THREE_WAY_SPEC, "-g", THREE_WAY_TEST, "--workers=1"];
    const headed = opts.headed !== false;
    if (headed) args.push("--headed");
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      // The vendored config reads both: visible and paced for watching, or
      // invisible and at full speed when nobody is looking.
      HEADLESS: headed ? "0" : "1",
      SLOWMO: headed ? (process.env.SLOWMO ?? "300") : "0",
      // Watching costs time: the same journey is ~1m40s headless and ~3m10s
      // headed at 300ms an action. Give a watched run room rather than letting
      // the pacing itself produce a timeout that reads as a product failure.
      TEST_TIMEOUT_MS: headed ? "600000" : "300000",
    };
    if (opts.runId) env.QA_RUN_ID = opts.runId;
    // The suite files its record under this key, so the platform can join the
    // record to the journey the reader actually ticked.
    env.QA_FLOW_KEY = flow.key;
    const command = `npx ${args.join(" ")}`;
    return launch(
      `journey ${flow.key}`,
      args,
      env,
      emit,
      () => emit({ type: "start", command, line: `$ ${command}` }),
      true,
      THREE_WAY_DIR,
    );
  }

  // `-g` is a REGEX, so an unescaped "." is a wildcard: `-g pr.list` also matched
  // "PR list exposes Reorder" and ran two journeys in two browser windows.
  // Escape the dots and require the " — " title separator so exactly one
  // journey is selected. `--workers=1` keeps it to a single window.
  const pattern = `${flow.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — `;
  const args = ["playwright", "test", SPEC, "-g", pattern, "--workers=1"];
  if (opts.headed !== false) args.push("--headed");

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    COMPANY_ID: String(opts.companyId),
  };
  if (opts.lineItems && opts.lineItems > 0) env.UI_LINE_ITEMS = String(opts.lineItems);
  if (opts.boqItems && opts.boqItems > 0) env.UI_BOQ_ITEMS = String(opts.boqItems);
  if (opts.quantity) env.UI_QUANTITY = opts.quantity;
  if (opts.vendors && opts.vendors > 0) env.UI_VENDOR_COUNT = String(opts.vendors);
  if (opts.bidders && opts.bidders > 0) env.UI_BIDDERS = String(opts.bidders);
  // The capability map lists every journey on every run, which makes it look
  // like everything is executing. We only want the one we picked.
  env.UI_QUIET_MAP = "1";
  if (opts.runId) {
    env.QA_RUN_ID = opts.runId;
    // A journey can ask the tester when it is stuck (the vendor's technical
    // sheet will not submit): the explorer's question channel, same folder.
    // The marker lets /api/explore/answer accept this run's answers.
    const asks = join(UI_TESTS_DIR, ".plans");
    mkdirSync(asks, { recursive: true });
    writeFileSync(join(asks, `${opts.runId}-ask.json`), JSON.stringify({ flow: flow.key, at: new Date().toISOString() }));
    env.UI_EXPLORE_DIR = asks;
  }
  // Every step the journey can vary is an env parameter, so a new one becomes
  // AI-drivable without touching the runner or the flow.
  if (opts.template) env.UI_TEMPLATE = opts.template;
  if (opts.scheduleMinutes) env.UI_SCHEDULE_MINUTES = String(opts.scheduleMinutes);
  // The spec reads this and signs in through the login screen (see
  // `loginOnScreen` in the UI suite) instead of injecting a session.
  if (opts.showLogin) env.UI_SHOW_LOGIN = "1";
  // The dashboard shows the browser beside the steps from these frames.
  env.UI_LIVE_FRAMES = "1";
  // Turn the AI healer on whenever a Gemini key is available. It only engages
  // after the deterministic locators have all failed, so it costs nothing on a
  // healthy run and rescues a run when a selector has drifted.
  if (env.GOOGLE_API_KEY) env.UI_AI_HEAL = "1";

  const command =
    `${Object.entries({
      COMPANY_ID: env.COMPANY_ID,
      UI_LINE_ITEMS: env.UI_LINE_ITEMS,
      UI_BOQ_ITEMS: env.UI_BOQ_ITEMS,
      UI_QUANTITY: env.UI_QUANTITY,
      UI_VENDOR_COUNT: env.UI_VENDOR_COUNT,
      UI_AI_HEAL: env.UI_AI_HEAL,
      UI_TEMPLATE: env.UI_TEMPLATE,
      UI_SCHEDULE_MINUTES: env.UI_SCHEDULE_MINUTES,
      UI_SHOW_LOGIN: env.UI_SHOW_LOGIN,
    })
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")} npx ${args.join(" ")}`.trim();

  return launch(`journey ${flow.key}`, args, env, emit, () => emit({ type: "start", command, line: `$ ${command}` }), true);
}

/** Clamp a requested line-item count to what this client actually allows. */
export function clampLineItems(
  requested: number | undefined,
  allowed: any,
  kind: "boq" | "non_boq",
): { value: number; capped: boolean; limit?: number } {
  const limit = allowed && typeof allowed === "object" ? Number(allowed[kind]) : undefined;
  const want = Math.max(1, Number(requested) || 1);
  if (!limit || !Number.isFinite(limit)) return { value: want, capped: false };
  return { value: Math.min(want, limit), capped: want > limit, limit };
}
