/**
 * EVENTS DEEP-DIG ROUND 2 — compile and run the deep2 twins on fresh events.
 *
 *   npx tsx scripts/run-deep2.ts --check                     parse the catalog files and twins; no network
 *   npx tsx scripts/run-deep2.ts --compile                   twins → validated API plans in data/deep2-plans/ (no model)
 *   npx tsx scripts/run-deep2.ts --compile --llm [--limit N] ALSO catalog "automate" cases with no twin, fast tier only
 *   npx tsx scripts/run-deep2.ts --c 198678                  run every compiled twin on its own fresh event
 *     --areas rjb,rgt   only these area files      --ids EVD2-RJB-001,…   only these twins
 *     --priority P0,P1  only these priorities      --limit N             at most N twins
 *     --plans-only | --direct-only                 --no-confirm          do not re-run a failure on a second fresh event
 *     --budget-min 180  stop starting new twins after this many minutes
 *
 * Where things are (all owned by this script):
 *   test-cases/events-deep2-<area>.md        the written cases (API-EVD<AREA>-NNN / UI-EVD<AREA>-NNN)
 *   data/deep2-cases/<area>.json             their runnable twins (EVD2-<AREA>-NNN), each with a `plan`
 *   data/deep2-plans/<twin>.json + index.json the validated plans (the compiler's cache)
 *   data/runs/deep2/<company>-<time>.json    run results (git-ignored with the rest of data/runs)
 *
 * Two runners, chosen by the twin's path:
 *   A · the API plan runner (src/checks/apiPlanRunner.ts) for the sourcing-event endpoints the plan language may
 *       send: every twin gets its OWN fresh event from its recipe; a failure is re-run on a second fresh event and
 *       is only "failed" when it fails again (runApiPlan's own confirmation). Each run is saved to history.
 *   B · a direct runner for endpoints outside the plan language's domain (/reminders, /v1/chats, /chats,
 *       /v1/attachments, /templates): ONE fresh event per recipe is shared by the twins of that recipe, which are
 *       reads or refusals that change nothing; a failure is re-sent on a SECOND fresh event before it counts.
 *
 * The twins are NOT in data/api-cases-extra: their plans use the plan runner's vendor sessions, waits and time
 * tokens, which the dashboard's sandbox runner (/api/features-run) does not have. They are added to the case
 * library in THIS process only, so the planner's validator and the plan runner can name them.
 *
 * Safety: every request a twin sends is checked against the app allow-list first — the versioned routes through
 * src/checks/appAccess.ts, the unversioned ones through config/app_auth_config.yml of procol-backend (read with
 * `git show origin/main:`), and an unversioned route this script cannot map is never sent. A wrong-app call is
 * answered 401 and signs the session out (json_helpers.rb:31-35).
 */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });

import { loadCases, type TestCaseRecord } from "../src/checks/caseLibrary.js";
import {
  compileApiPlan,
  planFromLibraryCase,
  validatePlan,
  PLAN_VERSION,
  RECIPES,
  READ_SHAPES,
  type ActStep,
  type ApiPlan,
  type RecipeId,
  type VerifyStep,
} from "../src/agents/apiPlanner.js";
import { runApiPlan, type PlanRunResult } from "../src/checks/apiPlanRunner.js";
import { openClientContext } from "../src/executor.js";
import { listQaVendors, vendorClient, type QaVendor } from "../src/checks/matrixVendors.js";
import { classify, redactSecrets } from "../src/checks/engine.js";
import { appOf, appRefusal } from "../src/checks/appAccess.js";
import { withWatchdog } from "../src/checks/resilience.js";
import { llmMode, usageReport } from "../src/ai/llm.js";

/**
 * READ_SHAPES holds the reply keys SEEN in sampled journey runs; a verify path outside it is refused. Twins also read
 * attributes the serializers always declare but the sample did not keep, so for THIS process the lists are widened
 * with the declared attributes (app/serializers/trade_template_serializer.rb:5-23, event_group/show_serializer.rb:6-13).
 */
const DECLARED_ROUND = "ref_uuid event_flow_version layers sheets aggregate_savings title description status order_type starting_from ending_at extra_closing_time terms_and_conditions terms_and_conditions_structured misc provisional_contracts_id trade_config customised_audience bid_count rfx_mode current_status created_at updated_at ui_config delivery_schedules increase_auction_slot user_intent_answered user_intent_trade_reasons show_auction_report auction_report_type auction_config provisional_contract pickup_schedules order_details additional_requests creator participants payment_tnc participant_sheet_widgets inline_widgets global_widgets inline_fields product_additional_data template_uuid template_name vendor_validations savings_configuration auction_strategy_config event_group_uuid stage_no finance_form currency_configuration currency_preferences weightages attachments participants_data evaluation_status evaluators tabs is_allowed_to_evaluate show_evaluation_results default_currency_symbol default_currency_label_type bid_identifiers are_suspicious_bids_present has_remarks comparison_view_widget_keys l1_prices page_size event_group proposals parent_rfq_uuid response_review_end_time_for_participant response_review_time_for ranking_widgets lot_title lot_no product_uuids remarks alternatives vendor_datasource_uuid vendor_status_field pending_unregistered_bids_count is_tnc_popup_enabled tnc_data tnc_popup_accepted vendor_assessment_evaluators".split(" ");
const DECLARED_EVENT = "uuid company config status title description attachments created_at updated_at stages current_stage_uuid event_group_line_item_ids is_project_on_hold terms_and_conditions terms_and_conditions_structured user_details user_intent user_intent_trade_reasons proposals ref_uuid can_register hide_master_qcs all_lots_withdrawn lots closed_at withdraw_details user_intent_attachments item_versions is_amendment_draft amendment_remarks is_latest_version quotation_templates contracts_uuids block_new_message owner_trail is_scheduled_template".split(" ");
for (const [op, keys] of [["read_round", DECLARED_ROUND], ["read_rfp_round", DECLARED_ROUND], ["read_round_schema", DECLARED_ROUND], ["read_event", DECLARED_EVENT]] as const) {
  const list = (READ_SHAPES as Record<string, string[] | undefined>)[op];
  if (list) for (const k of keys) if (!list.includes(k)) list.push(k);
}

const ROOT = join(here, "..", "..");
const CASES_DIR = join(here, "..", "data", "deep2-cases");
const PLANS_DIR = join(here, "..", "data", "deep2-plans");
const RUNS_DIR = join(here, "..", "data", "runs", "deep2");
const MD_DIR = join(ROOT, "test-cases");
const BACKEND = join(ROOT, "procol-backend");

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── the twins ───────────────────────────────────────────────────────────────

interface TwinPlan {
  recipe?: RecipeId;
  actor?: "buyer" | "vendor" | "vendor2";
  act?: ActStep[];
  arrange?: ActStep[];
  after?: ActStep[];
  verify?: VerifyStep[];
  code?: string;
  dependsOnSetting?: string;
  /** direct runner only: checks on the reply body ("" = the whole body) */
  assert?: DirectAssert[];
}
interface DirectAssert { path: string; op: "equals" | "not_equals" | "exists" | "absent" | "contains" | "count" | "non_empty"; value?: unknown; say?: string }
interface Twin extends TestCaseRecord {
  catalogId?: string;
  helper?: boolean;
  source?: string;
  plan?: TwinPlan;
  area: string;
}

function loadTwins(): Twin[] {
  if (!existsSync(CASES_DIR)) return [];
  const out: Twin[] = [];
  for (const f of readdirSync(CASES_DIR).filter((n) => n.endsWith(".json")).sort()) {
    try {
      const list = JSON.parse(readFileSync(join(CASES_DIR, f), "utf8"));
      for (const c of Array.isArray(list) ? list : []) out.push({ ...c, area: f.replace(/\.json$/, "") });
    } catch (e) {
      log(`skipped ${f}: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Add the twins to the case library of THIS process (the planner and the runner look cases up there). */
function injectTwins(twins: Twin[]): void {
  const lib = loadCases();
  const have = new Set(lib.map((c) => c.id));
  for (const t of twins) {
    if (have.has(t.id)) continue;
    const { plan: _p, area: _a, catalogId: _c, helper: _h, source: _s, ...rec } = t;
    lib.push(rec as TestCaseRecord);
  }
}

// ── the written catalog (same rules as scripts/import-test-cases.ts) ───────

interface MdCase { id: string; title: string; why: string; setup: string; steps: string; expected: string; oracle: string; trace: string; file: string }
const FIELD = /^-\s+\*\*(Why it matters|Setup|Steps|Expected|Oracle|Trace)(\s*\([^)]*\))?\.?\*\*\s*/;
function parseMd(file: string): MdCase[] {
  const out: MdCase[] = [];
  let cur: Partial<MdCase> | null = null;
  let field: string | null = null;
  const buf: Record<string, string[]> = {};
  const flush = () => {
    if (cur?.id) {
      const j = (k: string) => (buf[k] ?? []).join(" ").replace(/\s+/g, " ").trim();
      out.push({ id: cur.id, title: cur.title ?? "", why: j("Why it matters"), setup: j("Setup"), steps: j("Steps"), expected: j("Expected"), oracle: j("Oracle"), trace: j("Trace"), file });
    }
    cur = null;
    field = null;
    for (const k of Object.keys(buf)) delete buf[k];
  };
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    if (/^##\s/.test(raw) && !/^#{3,}/.test(raw)) {
      flush();
      continue;
    }
    const head = raw.match(/^#{3,4}\s+((?:UI|API|PRD)-[A-Z]+-\d+)\s*[—–-]\s*(.+)$/);
    if (head) {
      flush();
      cur = { id: head[1], title: head[2].trim() };
      continue;
    }
    if (!cur) continue;
    const f = raw.match(FIELD);
    if (f) {
      field = f[1];
      buf[field] = [raw.replace(FIELD, "")];
      continue;
    }
    if (field && /^\s{2,}\S/.test(raw)) buf[field].push(raw.trim());
    else if (/^#{1,3}\s/.test(raw)) flush();
  }
  flush();
  return out;
}
function loadMd(): MdCase[] {
  return readdirSync(MD_DIR).filter((f) => f.startsWith("events-deep2-") && f.endsWith(".md")).sort().flatMap((f) => parseMd(join(MD_DIR, f)));
}

// ── which app may call what ────────────────────────────────────────────────

/** Domain of the plan language (apiPlanner.ts LIBRARY_DOMAIN). */
const PLAN_DOMAIN = /^\/(event_groups|trade|v1\/trade|v1\/bids|bids|template_responses|evaluations|proposal|item_versions|additional_request|user_intents|orders$)/;

/** Unversioned routes the twins use → controller#action (config/routes.rb). Anything else unversioned is never sent. */
const UNVERSIONED: Array<[string, RegExp, string, string]> = [
  ["PATCH", /^\/bids\/[^/]+\/reject$/, "bids", "reject"],
  ["PATCH", /^\/bids\/update_bid_status\/[^/]+$/, "bids", "update_bid_status"],
  ["PATCH", /^\/bids\/delete_draft_bid\/[^/]+$/, "bids", "delete_draft_bid"],
  ["POST", /^\/bids\/template_input$/, "bids", "template_input"],
  ["GET", /^\/reminders\/[^/]+$/, "reminders", "index"],
  ["POST", /^\/reminders\/[^/]+\/send_reminder$/, "reminders", "send_reminder"],
  ["PATCH", /^\/trade\/[^/]+\/edit_weight_parameters$/, "trade", "edit_weight_parameters"],
  ["POST", /^\/trade\/upload_file$/, "trade", "upload_file"],
  ["PATCH", /^\/trade\/[^/]+\/staggered_time$/, "trade", "staggered_time"],
  ["POST", /^\/trade\/[^/]+\/reopen_line_items$/, "trade", "reopen_line_items"],
  ["GET", /^\/trade\/[^/]+$/, "trade", "show"],
  ["PATCH", /^\/trade\/[^/]+$/, "trade", "update"],
  ["GET", /^\/event_groups\/[^/]+\/get_all_attachments$/, "event_groups", "get_all_attachments"],
  ["GET", /^\/event_groups\/[^/]+\/get_audience$/, "event_groups", "get_audience"],
  ["GET", /^\/event_groups\/[^/]+\/get_line_items$/, "event_groups", "get_line_items"],
  ["POST", /^\/event_groups\/[^/]+\/participants$/, "event_groups", "participate"],
  ["GET", /^\/event_groups\/[^/]+$/, "event_groups", "show"],
  ["PATCH", /^\/event_groups\/[^/]+$/, "event_groups", "update"],
  ["POST", /^\/user_intents$/, "user_intents", "create"],
  ["POST", /^\/templates\/upload_attachment$/, "templates", "upload_attachment"],
  ["GET", /^\/chats$/, "chats", "index"],
  ["GET", /^\/chats\/get_chat_id$/, "chats", "get_chat_id_for_personal_chat"],
  ["GET", /^\/chats\/[^/]+\/conversations$/, "chats", "conversations"],
  ["POST", /^\/chats\/[^/]+\/send$/, "chats", "send_message"],
  ["GET", /^\/chats\/[^/]+$/, "chats", "show"],
  ["POST", /^\/proposal$/, "proposal", "create"],
  ["POST", /^\/proposal\/[^/]+\/add_response$/, "proposal", "add_response"],
  ["POST", /^\/proposal\/[^/]+\/submit$/, "proposal", "submit"],
  ["POST", /^\/evaluations$/, "evaluations", "create"],
  ["POST", /^\/item_versions$/, "item_versions", "create"],
];
/** v1 routes that skip the app check entirely (the action skips authorize_app). */
const NO_APP_CHECK = [/^\/v1\/attachments\/open$/];

let aac: any;
function appAuthConfig(): any {
  if (aac) return aac;
  try {
    aac = YAML.parse(execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/app_auth_config.yml"], { encoding: "utf8", maxBuffer: 8e6 }));
  } catch {
    aac = null;
  }
  return aac;
}
const APP_CLIENT = { console: "client_admin_dashboard", vendor: "agribid_website" } as const;

/** Why this app may not send this request (undefined = allowed). */
function wrongApp(app: "console" | "vendor", method: string, rawPath: string): string | undefined {
  const path = rawPath.split("?")[0];
  if (NO_APP_CHECK.some((r) => r.test(path))) return undefined;
  if (/^\/(v1|v2|v3|supplier_suite|approval_workflow)\//.test(path)) return appRefusal(app, method, path);
  const hit = UNVERSIONED.find(([m, re]) => m === method.toUpperCase() && re.test(path));
  if (!hit) return `${method} ${path} is not in this script's route table, so which app may call it is unknown — not sent`;
  const cfg = appAuthConfig();
  if (!cfg) return "procol-backend's config/app_auth_config.yml could not be read — not sent";
  const ok = cfg?.[APP_CLIENT[app]]?.[hit[2]]?.[hit[3]];
  return ok ? undefined : `the ${app === "console" ? "buyer console" : "vendor website"} may not call ${hit[2]}#${hit[3]} (config/app_auth_config.yml) — a 401 would sign the session out`;
}
const actorApp = (who: string | undefined): "console" | "vendor" => (who === "vendor" || who === "vendor2" ? "vendor" : "console");

// ── compiling: twin → plan ──────────────────────────────────────────────────

interface StoredPlan {
  meta: {
    twinId: string;
    caseId: string;
    area: string;
    title: string;
    runner: "plan" | "direct";
    source: "twin-plan" | "library-case" | "llm-fast" | "direct";
    compiledAt: string;
    planVersion: number;
    validated: boolean;
    errors: string[];
    warnings: string[];
    gaps: string[];
    priority: string;
  };
  plan?: ApiPlan;
  direct?: { method: string; path: string; body?: unknown; actor: "buyer" | "vendor" | "vendor2"; recipe: RecipeId; expected: "accept" | "reject" | "no-5xx"; code?: string; expectedResult: string; assert?: DirectAssert[] };
}

const plainTitle = (t: Twin, md?: MdCase) => md?.title ?? t.title.replace(/^QA_Platform_/, "").replace(/_/g, " ");

async function compileTwin(t: Twin, mdById: Map<string, MdCase>): Promise<StoredPlan> {
  const md = t.catalogId ? mdById.get(t.catalogId) : undefined;
  const base = {
    twinId: t.id, caseId: t.catalogId ?? t.id, area: t.area, title: plainTitle(t, md), compiledAt: new Date().toISOString(), planVersion: PLAN_VERSION,
    priority: t.priority ?? md?.trace.match(/\bP[0-3]\b/)?.[0] ?? "P2",
  };
  const p = t.plan ?? {};
  const path = String(t.path ?? "").split("?")[0];
  const recipe = (p.recipe ?? "published_rfq") as RecipeId;
  const actor = p.actor ?? "buyer";
  if (!PLAN_DOMAIN.test(path)) {
    const errors: string[] = [];
    if (!RECIPES[recipe]) errors.push(`unknown recipe ${recipe}`);
    if (!["none", "draft_rfq", "published_rfq", "rfq_with_bid", "closed_rfq_with_bid"].includes(recipe)) errors.push(`the direct runner builds only none / draft_rfq / published_rfq / rfq_with_bid / closed_rfq_with_bid (got ${recipe})`);
    if (p.act || p.arrange || p.after || p.verify) errors.push("a direct twin is one request: act/arrange/after/verify are not run");
    const app = wrongApp(actorApp(actor), t.method, path);
    if (app) errors.push(app);
    return {
      meta: { ...base, runner: "direct", source: "direct", validated: errors.length === 0, errors, warnings: [], gaps: [] },
      direct: { method: String(t.method).toUpperCase(), path: t.path, ...(t.body !== undefined ? { body: t.body } : {}), actor, recipe, expected: t.expected, ...(p.code ? { code: String(p.code) } : {}), expectedResult: t.expectedResult, ...(p.assert?.length ? { assert: p.assert } : {}) },
    };
  }
  let plan: ApiPlan;
  let source: StoredPlan["meta"]["source"] = "twin-plan";
  const gaps: string[] = [];
  if (!t.plan?.recipe && !t.plan?.act) {
    // no explicit plan: the compiler's own library-case path (no model)
    const r = await planFromLibraryCase(t, t.catalogId ?? t.id);
    plan = r.plan;
    gaps.push(...r.gaps);
    if (r.unbuilt) gaps.push(`starting state not built: ${r.unbuilt}`);
    source = "library-case";
  } else {
    const after = p.after ?? [];
    const selfDecisive = !after.some((a) => a.decisive) && !(p.act ?? []).some((a) => a.decisive);
    const self: ActStep = { op: "library", caseId: t.id, as: actor, ...(selfDecisive ? { decisive: true } : { expect: "accept" as const }), say: md?.title };
    const act = p.act ?? [...(p.arrange ?? []), self, ...after];
    plan = {
      version: PLAN_VERSION,
      caseId: t.catalogId ?? t.id,
      title: plainTitle(t, md),
      setup: { recipe },
      act,
      verify: p.verify ?? [],
      expected: { outcome: t.expected, ...(p.code ? { code: String(p.code) } : {}) },
      ...(p.dependsOnSetting ? { dependsOnSetting: p.dependsOnSetting } : {}),
    };
  }
  const v = await validatePlan(plan);
  const errors = [...v.errors];
  // every library request must come from the app allowed to send it
  const lib = new Map(loadCases().map((c) => [c.id, c]));
  for (const a of v.plan.act) {
    if (a.op !== "library") continue;
    const c = lib.get(a.caseId ?? "");
    if (!c) continue;
    const why = wrongApp(actorApp(a.as), c.method, c.path);
    if (why) errors.push(`act ${a.caseId}: ${why}`);
  }
  for (const vs of v.plan.verify) if (vs.as && vs.as !== "buyer" && vs.op === "read_audience") errors.push("read_audience is buyer-only");
  return { meta: { ...base, runner: "plan", source, validated: errors.length === 0, errors, warnings: v.warnings, gaps }, plan: { ...v.plan, caseId: t.catalogId ?? t.id, title: plainTitle(t, md) } };
}

// ── the direct runner ───────────────────────────────────────────────────────

interface Reply { status: number; ok: boolean; data: any; code?: string; message?: string; ms: number; notSent?: string }
async function sendGuarded(api: any, app: "console" | "vendor", method: string, path: string, body?: unknown): Promise<Reply> {
  const bare = path.split("?")[0];
  const why = wrongApp(app, method, path) ?? (NO_APP_CHECK.some((r) => r.test(bare)) ? undefined : appRefusal(appOf(api), method, bare));
  if (why) return { status: 0, ok: false, data: null, ms: 0, notSent: why, message: `not sent: ${why}` };
  const t = Date.now();
  try {
    const x: any = await Promise.race([
      api.attempt(method, path, body === undefined ? {} : { body }),
      sleep(60_000).then(() => ({ status: 0, ok: false, data: null, errorMessage: "no reply within 60 s" })),
    ]);
    return { status: typeof x?.status === "number" ? x.status : 0, ok: !!x?.ok, data: x?.data, code: x?.errorCode != null ? String(x.errorCode) : undefined, message: redactSecrets(x?.errorMessage) ?? undefined, ms: Date.now() - t };
  } catch (e) {
    return { status: 0, ok: false, data: null, message: redactSecrets((e as Error).message) ?? "request failed", ms: Date.now() - t };
  }
}

function fillTokens(v: unknown, vals: Record<string, string | number>, missing: string[]): unknown {
  const one = (name: string): unknown => {
    const tm = name.match(/^now([+-]\d{1,7})?$/);
    if (tm) return Math.floor(Date.now() / 1000) + Number(tm[1] ?? 0);
    return vals[name] !== undefined && vals[name] !== "" ? vals[name] : undefined;
  };
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") {
      const whole = x.match(/^\{\{([^}]+)\}\}$/);
      if (whole) {
        const r = one(whole[1]);
        if (r === undefined) missing.push(whole[1]);
        return r ?? x;
      }
      return x.replace(/\{\{([^}]+)\}\}/g, (m, n) => {
        const r = one(n);
        if (r === undefined) missing.push(n);
        return r === undefined ? m : String(r);
      });
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val)]));
    return x;
  };
  return walk(v);
}

interface DirectResult { verdict: "passed" | "failed" | "couldn't tell" | "not run"; reason: string; status?: number; code?: string; message?: string; eventGroupUuid?: string; request?: { method: string; path: string }; confirmation?: { verdict: string; reason: string; status?: number; code?: string; eventGroupUuid?: string } }

function pick(root: unknown, path: string): unknown {
  let n: any = root;
  for (const t of path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (n === null || typeof n !== "object") return undefined;
    n = n[t];
  }
  return n;
}
function judge(op: DirectAssert["op"], got: unknown, want: unknown): boolean {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) || (a != null && b != null && typeof a !== "object" && typeof b !== "object" && String(a) === String(b));
  switch (op) {
    case "equals": return same(got, want);
    case "not_equals": return !same(got, want);
    case "exists": return got !== undefined && got !== null;
    case "absent": return got === undefined || got === null;
    case "contains": return Array.isArray(got) ? got.some((x) => same(x, want)) : typeof got === "string" ? got.includes(String(want)) : false;
    case "count": return Array.isArray(got) && got.length === Number(want);
    case "non_empty": return Array.isArray(got) ? got.length > 0 : got !== undefined && got !== null && got !== "";
  }
  return false;
}

class DirectRunner {
  private setups = new Map<string, Record<string, string | number>>();
  private vendorApis = new Map<string, any>();
  constructor(private company: number, private client: any, private vendors: QaVendor[]) {}

  /** A fresh record for a recipe (built by the plan runner, read-only plan, not saved). */
  async setup(recipe: RecipeId, fresh = false): Promise<Record<string, string | number> | string> {
    if (!fresh && this.setups.has(recipe)) return this.setups.get(recipe)!;
    const base: Record<string, string | number> = { stamp: String(Date.now()), ...(this.vendors[0] ? { vendorUuid: this.vendors[0].vendorCompanyUuid } : {}), ...(this.vendors[1] ? { vendor2Uuid: this.vendors[1].vendorCompanyUuid } : {}) };
    if (recipe === "none") {
      this.setups.set(recipe, base);
      return base;
    }
    const cache = new Map<string, any>();
    const probe: ApiPlan = { version: PLAN_VERSION, title: `deep2 direct setup (${recipe})`, setup: { recipe }, act: [], verify: [{ op: "read_event", as: "buyer", assert: [{ path: "uuid", op: "exists" }] }], expected: { outcome: "accept" } };
    const r = await runApiPlan(probe, { companyId: this.company, client: this.client, confirm: false, save: false, setupCache: cache, onLine: () => {} });
    const inst = cache.get(`${this.company}:${recipe}`);
    if (!inst?.vals?.eventGroupUuid) return `the ${recipe} record could not be built: ${r.reason}`;
    const vals = { ...base, ...inst.vals };
    this.setups.set(recipe, vals);
    return vals;
  }

  async api(who: "buyer" | "vendor" | "vendor2"): Promise<any | string> {
    if (who === "buyer") return this.client.ctx.buyerApi;
    if (this.vendorApis.has(who)) return this.vendorApis.get(who);
    const v = this.vendors[who === "vendor" ? 0 : 1];
    if (!v) return `no QA vendor ${who === "vendor" ? 1 : 2} recorded for this client`;
    const r = await withWatchdog(vendorClient(this.company, v.email), 120_000, "signing the QA vendor in").catch((e) => ({ error: (e as Error).message }) as any);
    if (!r.api) return `QA vendor sign-in failed: ${r.error}`;
    this.vendorApis.set(who, r.api);
    return r.api;
  }

  async once(d: NonNullable<StoredPlan["direct"]>, fresh: boolean): Promise<DirectResult> {
    const vals = await this.setup(d.recipe, fresh);
    if (typeof vals === "string") return { verdict: "couldn't tell", reason: vals };
    const missing: string[] = [];
    const path = String(fillTokens(d.path, vals, missing));
    const body = d.body === undefined ? undefined : fillTokens(d.body, vals, missing);
    if (missing.length) return { verdict: "couldn't tell", reason: `no value for ${[...new Set(missing)].join(", ")}` };
    const api = await this.api(d.actor);
    if (typeof api === "string") return { verdict: "couldn't tell", reason: api };
    const reply = await sendGuarded(api, actorApp(d.actor), d.method, path, d.method === "GET" ? undefined : body);
    const base = { status: reply.status, code: reply.code, message: reply.message, eventGroupUuid: vals.eventGroupUuid ? String(vals.eventGroupUuid) : undefined, request: { method: d.method, path } };
    if (reply.notSent) return { ...base, verdict: "not run", reason: reply.notSent };
    if (reply.status === 0) return { ...base, verdict: "couldn't tell", reason: `no reply (${reply.message})` };
    const c = classify(d.expected, { httpStatus: reply.status, accepted: reply.ok, message: reply.message ? `${reply.message}${reply.code ? ` (code ${reply.code})` : ""}` : null, durationMs: reply.ms }, undefined, d.expectedResult);
    if (reply.status >= 500) return { ...base, verdict: "failed", reason: c.verdict };
    if (d.expected === "reject" && d.code && !reply.ok) {
      if (reply.code === d.code) return { ...base, verdict: "passed", reason: `refused with code ${reply.code} as expected (${reply.message ?? ""})` };
      return { ...base, verdict: "couldn't tell", reason: `refused, but with code ${reply.code ?? "none"} “${reply.message ?? ""}” instead of ${d.code}` };
    }
    if (c.pass && !c.inconclusive && reply.ok && d.assert?.length) {
      const bad: string[] = [];
      for (const a of d.assert) {
        const want = fillTokens(a.value, vals, []);
        const got = pick(reply.data, a.path);
        const ok = judge(a.op, got, want);
        if (!ok) bad.push(`${a.say ?? `${a.path || "the reply"} ${a.op} ${JSON.stringify(want) ?? ""}`} — got ${JSON.stringify(got)?.slice(0, 160) ?? "nothing"}`);
      }
      if (bad.length) return { ...base, verdict: "failed", reason: `the reply does not show what the case expects: ${bad.join("; ")}` };
      return { ...base, verdict: "passed", reason: `${c.verdict}; the reply shows what the case expects (${d.assert.length} check${d.assert.length > 1 ? "s" : ""})` };
    }
    return { ...base, verdict: c.inconclusive ? "couldn't tell" : c.pass ? "passed" : "failed", reason: c.verdict };
  }

  async run(d: NonNullable<StoredPlan["direct"]>, confirm: boolean): Promise<DirectResult> {
    const first = await this.once(d, false);
    if (first.verdict !== "failed" || !confirm) return first;
    const again = await this.once(d, true);
    // the fresh record replaces the old one for later twins of this recipe
    if (again.verdict === "failed") return { ...first, reason: `${first.reason} — failed the same way on a second fresh record`, confirmation: { verdict: again.verdict, reason: again.reason, status: again.status, code: again.code, eventGroupUuid: again.eventGroupUuid } };
    return { ...first, verdict: "couldn't tell", reason: `failed on the first record (${first.reason}) but came out “${again.verdict}” on a fresh one, so it is not reported`, confirmation: { verdict: again.verdict, reason: again.reason, status: again.status, code: again.code, eventGroupUuid: again.eventGroupUuid } };
  }

  async dispose() {
    for (const a of this.vendorApis.values()) await Promise.resolve(a?.dispose?.()).catch(() => {});
  }
}

// ── main ────────────────────────────────────────────────────────────────────

const twins = loadTwins();
injectTwins(twins);
const md = loadMd();
const mdById = new Map(md.map((c) => [c.id, c]));

if (flag("check")) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of md) {
    if (ids.has(c.id)) problems.push(`duplicate catalog id ${c.id}`);
    ids.add(c.id);
    if (!c.why || !c.steps || !c.expected || !c.oracle) problems.push(`${c.id}: missing Why/Steps/Expected/Oracle`);
    if (!/\bP[0-3]\b/.test(c.trace)) problems.push(`${c.id}: no priority in Trace`);
    const twin = c.trace.match(/`(EVD2-[A-Z]+-\d+)`/)?.[1];
    if (twin && !twins.some((t) => t.id === twin)) problems.push(`${c.id}: Trace names ${twin}, which has no twin`);
    if (twin && twin.split("-")[2] !== c.id.split("-")[2]) problems.push(`${c.id}: twin ${twin} does not share its number`);
    if (/automate\b/.test(c.trace) && !/automate-later/.test(c.trace) && !twin && c.id.startsWith("API-")) problems.push(`${c.id}: marked automate but has no twin`);
  }
  const twinIds = new Set<string>();
  for (const t of twins) {
    if (twinIds.has(t.id)) problems.push(`duplicate twin id ${t.id}`);
    twinIds.add(t.id);
    if (!t.helper && (!t.catalogId || !mdById.has(t.catalogId))) problems.push(`${t.id}: catalogId ${t.catalogId} is not in the markdown`);
    if (!t.helper && t.catalogId && !(mdById.get(t.catalogId)?.trace ?? "").includes(t.id)) problems.push(`${t.id}: its catalog case's Trace does not name it`);
  }
  const byArea = md.reduce<Record<string, number>>((a, c) => ((a[c.file.replace(/^.*events-deep2-|\.md$/g, "")] = (a[c.file.replace(/^.*events-deep2-|\.md$/g, "")] ?? 0) + 1), a), {});
  log(`catalog: ${md.length} cases (${md.filter((c) => c.id.startsWith("UI-")).length} UI) · ${JSON.stringify(byArea)}`);
  log(`twins: ${twins.filter((t) => !t.helper).length} (+${twins.filter((t) => t.helper).length} helper steps)`);
  for (const p of problems) log(`  ⚠ ${p}`);
  log(problems.length ? `${problems.length} problem(s)` : "no problems");
  process.exit(problems.length ? 1 : 0);
}

const IDS_LLM = new Set((arg("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean));
if (flag("compile")) {
  mkdirSync(PLANS_DIR, { recursive: true });
  const index: Record<string, unknown> = {};
  let ok = 0;
  for (const t of twins.filter((x) => !x.helper)) {
    const sp = await compileTwin(t, mdById);
    writeFileSync(join(PLANS_DIR, `${t.id}.json`), JSON.stringify(sp, null, 1));
    index[t.id] = { caseId: sp.meta.caseId, runner: sp.meta.runner, source: sp.meta.source, validated: sp.meta.validated, errors: sp.meta.errors, gaps: sp.meta.gaps, recipe: sp.plan?.setup.recipe ?? sp.direct?.recipe };
    if (sp.meta.validated) ok++;
    else log(`${t.id}  NOT VALID — ${sp.meta.errors.join("; ").slice(0, 300)}`);
  }
  // Catalog cases marked automate that have no twin: the model, fast tier only, when asked.
  if (flag("llm")) {
    if (llmMode() === "fallback") log("no model configured — skipping the catalog-only cases");
    else {
      const before = usageReport().totalUsd;
      // --llm: automate cases with no twin; --llm-manual: also the manual API cases (to learn what the language lacks)
      const todo = md
        .filter((c) => c.id.startsWith("API-") && !/`EVD2-/.test(c.trace) && (flag("llm-manual") ? /· manual ·/.test(c.trace) : /· automate ·|· automate$/.test(c.trace)))
        .filter((c) => !IDS_LLM.size || IDS_LLM.has(c.id))
        .slice(0, Number(arg("limit")) || 15);
      for (const c of todo) {
        const text = [c.title, c.setup && `Setup: ${c.setup}`, c.steps && `Steps: ${c.steps}`, c.expected && `Expected: ${c.expected}`].filter(Boolean).join("\n");
        const r = await withWatchdog(compileApiPlan({ text }, { llm: true, allowReason: false }), 120_000, `compiling ${c.id}`).catch((e) => ({ plan: null, coverage: "none", gaps: [(e as Error).message] }) as any);
        index[c.id] = { runner: "plan", source: r.source ?? "llm-fast", coverage: r.coverage, gaps: r.gaps };
        if (r.plan && r.coverage === "full") {
          const sp: StoredPlan = { meta: { twinId: c.id, caseId: c.id, area: "llm", title: c.title, runner: "plan", source: "llm-fast", compiledAt: new Date().toISOString(), planVersion: PLAN_VERSION, validated: true, errors: [], warnings: r.warnings ?? [], gaps: r.gaps ?? [], priority: c.trace.match(/\bP[0-3]\b/)?.[0] ?? "P2" }, plan: { ...r.plan, caseId: c.id, title: c.title } };
          writeFileSync(join(PLANS_DIR, `${c.id}.json`), JSON.stringify(sp, null, 1));
        }
        log(`${c.id}  ${r.coverage}${r.gaps?.length ? ` — ${r.gaps.slice(0, 2).join("; ").slice(0, 160)}` : ""}`);
      }
      log(`model spend $${(usageReport().totalUsd - before).toFixed(3)} (fast tier only)`);
    }
  }
  writeFileSync(join(PLANS_DIR, "index.json"), JSON.stringify({ updatedAt: new Date().toISOString(), planVersion: PLAN_VERSION, cases: index }, null, 1));
  log(`compiled ${twins.filter((x) => !x.helper).length} twin(s): ${ok} valid`);
  process.exit(0);
}

const COMPANY = Number(arg("c"));
if (!COMPANY) {
  console.log("usage: --check | --compile [--llm] | --c <companyId> [--areas a,b] [--ids X,Y] [--priority P0,P1] [--limit N]");
  process.exit(1);
}
const AREAS = new Set((arg("areas") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
const IDS = new Set((arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const PRIOS = new Set((arg("priority") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
const LIMIT = Number(arg("limit")) || Infinity;
const BUDGET_MS = (Number(arg("budget-min")) || 180) * 60_000;
const CONFIRM = !flag("no-confirm");

const stored: StoredPlan[] = existsSync(PLANS_DIR)
  ? readdirSync(PLANS_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => JSON.parse(readFileSync(join(PLANS_DIR, f), "utf8")) as StoredPlan)
  : [];
const chosen = stored
  .filter((s) => s.meta.validated)
  .filter((s) => !AREAS.size || AREAS.has(s.meta.area))
  .filter((s) => !IDS.size || IDS.has(s.meta.twinId) || IDS.has(s.meta.caseId))
  .filter((s) => !PRIOS.size || PRIOS.has(s.meta.priority))
  .filter((s) => (flag("plans-only") ? s.meta.runner === "plan" : flag("direct-only") ? s.meta.runner === "direct" : true))
  .sort((a, b) => (a.meta.runner === b.meta.runner ? a.meta.twinId.localeCompare(b.meta.twinId) : a.meta.runner === "direct" ? -1 : 1))
  .slice(0, LIMIT);
log(`${chosen.length} twin(s) to run on ${COMPANY} (${chosen.filter((s) => s.meta.runner === "direct").length} direct, ${chosen.filter((s) => s.meta.runner === "plan").length} on their own fresh event)`);
if (!chosen.length) process.exit(0);

mkdirSync(RUNS_DIR, { recursive: true });
const outFile = join(RUNS_DIR, `${COMPANY}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const results: Array<Record<string, unknown>> = [];
const save = () => writeFileSync(outFile, JSON.stringify({ company: COMPANY, startedAt: new Date(t0).toISOString(), updatedAt: new Date().toISOString(), results }, null, 1));
const t0 = Date.now();

let client: any = await withWatchdog(openClientContext(COMPANY), 180_000, "opening the client").catch((e) => {
  log(`could not open a session: ${(e as Error).message}`);
  return null;
});
if (!client) process.exit(1);
const vendors = await listQaVendors(COMPANY).catch(() => [] as QaVendor[]);
log(`client: ${client.companyName ?? COMPANY} · QA vendors recorded: ${vendors.length}`);
const direct = new DirectRunner(COMPANY, client, vendors);

try {
  for (const [i, s] of chosen.entries()) {
    if (Date.now() - t0 > BUDGET_MS) {
      log(`budget of ${BUDGET_MS / 60_000} min reached — ${chosen.length - i} twin(s) not started`);
      break;
    }
    const head = `${i + 1}/${chosen.length} ${s.meta.twinId} (${s.meta.caseId})`;
    if (s.meta.runner === "direct" && s.direct) {
      const r = await withWatchdog(direct.run(s.direct, CONFIRM), 20 * 60_000, `running ${s.meta.twinId}`).catch((e) => ({ verdict: "couldn't tell", reason: `did not finish: ${(e as Error).message}` }) as DirectResult);
      results.push({ twinId: s.meta.twinId, caseId: s.meta.caseId, area: s.meta.area, title: s.meta.title, runner: "direct", recipe: s.direct.recipe, ...r });
      log(`${head} · ${r.verdict} — ${String(r.reason).slice(0, 220)}`);
    } else if (s.plan) {
      const r: PlanRunResult = await withWatchdog(
        runApiPlan(s.plan, { companyId: COMPANY, client, confirm: CONFIRM, save: true, onLine: () => {} }),
        45 * 60_000,
        `running ${s.meta.twinId}`,
      ).catch((e) => ({ verdict: "couldn't tell", reason: `did not finish: ${(e as Error).message}`, steps: [], setup: { recipe: s.plan!.setup.recipe, ok: false, steps: [], ms: 0 } }) as any);
      results.push({
        twinId: s.meta.twinId, caseId: s.meta.caseId, area: s.meta.area, title: s.meta.title, runner: "plan", recipe: s.plan.setup.recipe,
        verdict: r.verdict, reason: r.reason, confirmed: r.confirmed, runId: r.runId,
        eventGroupUuid: r.setup?.eventGroupUuid, confirmationEvent: r.confirmation?.setup?.eventGroupUuid, confirmationVerdict: r.confirmation?.verdict,
        steps: (r.steps ?? []).map((st) => ({ n: st.n, phase: st.phase, title: st.title, actor: st.actor, verdict: st.verdict, actual: st.actual, status: st.status, code: st.code, call: st.call ? { method: st.call.method, path: st.call.path } : undefined })),
      });
      log(`${head} · ${r.verdict}${r.confirmed ? " (confirmed on a 2nd fresh event)" : ""} — ${String(r.reason).slice(0, 220)}`);
      // a session that died under a long run: open a fresh one for the next twin
      if (/Authentication failed|session/i.test(String(r.reason)) && r.verdict !== "passed") {
        const fresh = await withWatchdog(openClientContext(COMPANY), 180_000, "re-opening the client").catch(() => null);
        if (fresh) {
          await client.dispose?.().catch?.(() => {});
          client = fresh;
          log("re-opened the buyer session");
        }
      }
    }
    // A network outage is an environment failure, never a product result: drop it and stop the run.
    const last = results[results.length - 1];
    if (last && /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|getaddrinfo/.test(JSON.stringify(last))) {
      results.pop();
      log(`network failure on ${s.meta.twinId} — not counted; stopping (re-run the rest with --ids once the network is back)`);
      save();
      break;
    }
    save();
  }
} finally {
  save();
  await direct.dispose();
  await client?.dispose?.().catch?.(() => {});
}
const tally = results.reduce<Record<string, number>>((a, r) => ((a[String(r.verdict)] = (a[String(r.verdict)] ?? 0) + 1), a), {});
log(`done in ${Math.round((Date.now() - t0) / 60_000)} min: ${JSON.stringify(tally)} → ${outFile}`);
process.exit(0);
