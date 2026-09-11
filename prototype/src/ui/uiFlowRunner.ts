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
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const UI_TESTS_DIR = join(here, "..", "..", "..", "procol-ui-tests");
const SPEC = "tests/ui-master.spec.ts";

/** The browser journeys, grouped the way the dashboard shows them. */
export interface UiFlowDef {
  key: string;
  label: string;
  group: string;
  /** true when the journey builds line items, so the count input applies. */
  usesLineItems?: boolean;
  /** true when it's a BOQ journey (uses the BOQ line-item limit). */
  boq?: boolean;
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
];

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
  /** Template to pick, by name substring. Journey takes the first otherwise. */
  template?: string;
  /** Event duration in minutes — the journey edits the schedule window. */
  scheduleMinutes?: number;
  /** false → run without opening a visible window. */
  headed?: boolean;
}

export interface UiRunEvent {
  type: "start" | "log" | "done" | "error";
  line?: string;
  command?: string;
  exitCode?: number;
}

/**
 * Run one journey, streaming Playwright's output line by line.
 * Returns a stop() so a caller can cancel a run mid-flight.
 */
/**
 * Run a compiled test plan instead of a named journey.
 *
 * The plan is handed over as a file rather than an argument: plans get long,
 * and a shell has opinions about quoting that a JSON blob does not survive.
 */
export function runUiPlan(
  opts: { plan: unknown; companyId: number; runId?: string; headed?: boolean },
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
  };
  if (env.GOOGLE_API_KEY) env.UI_AI_HEAL = "1";

  emit({ type: "start", line: `npx ${args.join(" ")}`, command: `plan ${runId}` });
  const child = spawn("npx", args, { cwd: UI_TESTS_DIR, env });
  const pump = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) if (line.trim()) emit({ type: "log", line });
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("close", (code) => emit({ type: "done", exitCode: code ?? 1 }));
  return { stop: () => child.kill("SIGTERM") };
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

  emit({ type: "start", line: `teaching "${opts.stuckId}"`, command: `npx ${args.join(" ")}` });
  const child = spawn("npx", args, { cwd: UI_TESTS_DIR, env });
  const pump = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) if (line.trim()) emit({ type: "log", line });
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("close", (code) => emit({ type: "done", exitCode: code ?? 1 }));
  return { stop: () => child.kill("SIGTERM") };
}

export function runUiFlow(opts: UiRunOptions, emit: (e: UiRunEvent) => void): { stop: () => void } {
  const flow = UI_FLOWS.find((f) => f.key === opts.flowKey);
  if (!flow) {
    emit({ type: "error", line: `unknown UI flow "${opts.flowKey}"` });
    return { stop: () => {} };
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
  // The capability map lists every journey on every run, which makes it look
  // like everything is executing. We only want the one we picked.
  env.UI_QUIET_MAP = "1";
  if (opts.runId) env.QA_RUN_ID = opts.runId;
  // Every step the journey can vary is an env parameter, so a new one becomes
  // AI-drivable without touching the runner or the flow.
  if (opts.template) env.UI_TEMPLATE = opts.template;
  if (opts.scheduleMinutes) env.UI_SCHEDULE_MINUTES = String(opts.scheduleMinutes);
  // Turn the AI healer on whenever a Gemini key is available. It only engages
  // after the deterministic locators have all failed, so it costs nothing on a
  // healthy run and rescues a run when a selector has drifted.
  if (env.GOOGLE_API_KEY) env.UI_AI_HEAL = "1";

  const command =
    `${Object.entries({
      COMPANY_ID: env.COMPANY_ID,
      UI_LINE_ITEMS: env.UI_LINE_ITEMS,
      UI_BOQ_ITEMS: env.UI_BOQ_ITEMS,
      UI_AI_HEAL: env.UI_AI_HEAL,
      UI_TEMPLATE: env.UI_TEMPLATE,
      UI_SCHEDULE_MINUTES: env.UI_SCHEDULE_MINUTES,
    })
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")} npx ${args.join(" ")}`.trim();

  emit({ type: "start", command, line: `$ ${command}` });

  const child = spawn("npx", args, { cwd: UI_TESTS_DIR, env, shell: false });
  const pump = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      const t = line.replace(/\[[0-9;]*m/g, "").trimEnd();
      if (t.trim()) emit({ type: "log", line: t });
    }
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("error", (e) => emit({ type: "error", line: e.message }));
  child.on("close", (code) => emit({ type: "done", exitCode: code ?? -1 }));

  return { stop: () => child.kill("SIGTERM") };
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
