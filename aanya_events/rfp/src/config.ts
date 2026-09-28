/**
 * WHAT A RUN IS ASKED TO DO.
 *
 * Every knob the Postman collection had, with the same defaults and the same
 * rule for where a value comes from:
 *
 *   scenario row (RFP_SCENARIO)  >  environment (RFP_<NAME>)  >  default
 *
 * Nothing about the account is written down here. Products, variants, units,
 * the template, evaluators and vendors are all looked up at run time by the
 * publish flow; these settings only say how many, which ones by name when you
 * care, and how the event is shaped.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIOS } from "./scenarios.js";

export const SUITE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPORTS_DIR = join(SUITE_DIR, "reports");

// The platform passes everything through the environment; a person running
// the suite by hand keeps it in .env. Values already set are never overridden.
loadEnv({ path: join(SUITE_DIR, ".env") });

export const DEFAULTS = {
  rfx_mode: "rfp",
  template_type_identifier: "", // auto: rfp -> rfi, rfq -> trade
  use_template: "true",
  template_uuid: "",
  template_name: "",
  template_index: "0",
  trade_template_name: "trade",
  product_search_query: "a",
  product_uuids: "", // comma separated, exact products (order kept)
  num_line_items: "2",
  quantities: "", // "5" => all items 5 | "5,10,3" => per item
  default_quantity: "5",
  qty_mode: "fixed", // fixed | random
  qty_min: "1",
  qty_max: "100",
  unit_symbols: "", // "Unit,Meter" per item (else the product's first unit)
  variant_index: "0",
  variant_uuids: "", // per item override
  vendor_search_query: "a",
  vendor_uuids: "", // comma separated, exact vendors
  num_vendors: "3", // a number, or "all"
  audience_source: "auto", // auto (rfq -> product_audience, rfp -> vendor_search) | vendor_search | product_audience
  max_vendor_pages: "10",
  evaluator_designation: "planner",
  evaluator_uuids: "",
  evaluators_per_line_item: "1",
  assign_evaluators: "true",
  include_quality_params: "true",
  quality_params_required: "true",
  include_template_headers: "true",
  extra_line_item_headers: "[]",
  vendor_assessment_enabled: "true",
  vendor_assessment_name: "Vendor Assessment",
  vendor_assessment_headers: '[{"name":"xyz","description":"xyz","input_type":"multiline_text","is_required":false}]',
  stage_title: "", // auto: rfp -> "Technical Stage", rfq -> "RFQ"
  event_title: "", // not used: events are always titled AS_API_automation_<timestamp> (builders.ts)
  bid_start_offset_sec: "0",
  event_duration_sec: "", // auto = new_request_config default_duration
  evaluation_duration_sec: "", // auto = new_request_config default_evaluation
  closing_mode: "single",
  auction_closing_mode: "", // auto = default_closing_mode
  rfp_evaluation_mode: "", // auto = default_rfp_evaluation_mode
  dynamic_closing_time_strategy: "price_based",
  is_tnc_mandatory: "false",
  tnc_uuid: "",
  show_under_open_events: "true",
  creation_flow_type: "quick_flow",
  use_rfq_quotes_as_bids: "false",
  is_alternate_bidding_allowed: "false",
  is_english_auction_enabled: "false",
  amendment_remarks: "",
  sla_ms: "3000",
  sla_heavy_ms: "8000",
  stop_on_failure: "true",
  // ---- RFQ ----
  rfq_template_uuid: "", // the RFQ's template; template_uuid / template_name still apply when they name an RFQ template
  rfq_template_name: "",
  order_type: "", // auto from the template (buy / sell)
  rfq_delivery_locations: "", // "uuid|name", one for all items or one per item; empty = the account's first active delivery location, looked up live
  rfq_extra_inline_widgets: "", // template mapped_widgets to add, e.g. "ceil_price,freight_charges"
  rfq_extra_global_widgets: "", // template global_mapped_widgets to add
  rfq_add_sum_total: "true", // add the Sum Total (gross_total) widget, like the console
  rfq_add_variant_widget: "true", // add the Product Variant widget, like the console
  rfq_creator_values: "{}", // creator-side widget values: {"ceil_price": 120} or {"ceil_price": [120, 90]} per item
  // ---- surrogate bid (Bidding → Surrogate bid) ----
  sb_event_group_uuid: "", // bid on this event instead of the one this run published
  sb_trade_uuid: "", // optional; default = that event's current stage
  num_surrogate_bids: "1", // how many invited vendors to bid for
  surrogate_vendor_uuids: "", // exact vendors (comma separated)
  surrogate_field_values: "{}", // JSON: {"Type":"7-Ply", "Form::Question":"abc {vendor} {n}"}
  surrogate_default_text: "Surrogate response",
  surrogate_default_number: "1",
  surrogate_remarks: "",
  surrogate_skip_window_check: "false",
} as const;

export type ConfigKey = keyof typeof DEFAULTS;

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** The scenario picked for this run, if any (1-based, like the data file's rows). */
export function scenario() {
  const n = Number(process.env.RFP_SCENARIO);
  return Number.isInteger(n) && n >= 1 && n <= SCENARIOS.length ? { n, ...SCENARIOS[n - 1] } : null;
}

export function cfg(key: ConfigKey): string {
  const row = scenario();
  let v: string | undefined = row?.values[key];
  if (blank(v)) v = process.env[`RFP_${key.toUpperCase()}`];
  if (blank(v)) v = DEFAULTS[key];
  return String(v ?? "").trim();
}

export const cfgStr = (k: ConfigKey) => cfg(k);
export function cfgNum(k: ConfigKey): number | null {
  const v = cfg(k);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
export function cfgInt(k: ConfigKey): number | null {
  const n = cfgNum(k);
  return n === null || Number.isNaN(n) ? n : Math.trunc(n);
}
export const cfgBool = (k: ConfigKey) => cfg(k).toLowerCase() === "true";
export const cfgList = (k: ConfigKey) =>
  cfg(k)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export function cfgJson<T = unknown>(k: ConfigKey): T | null {
  const v = cfg(k);
  if (v === "") return null;
  try {
    return JSON.parse(v) as T;
  } catch (e) {
    throw new Error(`Config "${k}" is not valid JSON: ${(e as Error).message}`);
  }
}
export const isSet = (k: ConfigKey) => {
  const row = scenario();
  return !blank(row?.values[k]) || !blank(process.env[`RFP_${k.toUpperCase()}`]);
};

/** The account the run talks to. */
export const ACCOUNT = {
  baseUrl: (process.env.RFP_BASE_URL || "https://sec-api.ag-ri.in").replace(/\/+$/, "").replace(/\/api$/, ""),
  appVersion: process.env.RFP_APP_VERSION || "9.4.377",
  token: process.env.AANYA_EVENTS_ACCESS_TOKEN || "",
  lightspeed: process.env.AANYA_EVENTS_LIGHTSPEED_TOKEN || "",
};

/**
 * WHICH CASES THIS RUN INCLUDES.
 *
 * The platform ticks features (RFP_FEATURES=events.rfp_only,events.config);
 * features.json says which case ids test each one. The publish flow always
 * runs — every other case acts on what it produced — and so does 3.0, the
 * throwaway draft, whenever a negative case is included.
 *
 * Without RFP_FEATURES the older RFP_SUITES=publish,verify,negative applies.
 */
interface FeatureMap {
  features: Array<{ id: string; cases: string[] }>;
}
export const FEATURE_MAP: FeatureMap = JSON.parse(readFileSync(join(SUITE_DIR, "features.json"), "utf8"));

export function featuresOf(caseId: string): string[] {
  return FEATURE_MAP.features.filter((f) => f.cases.some((p) => new RegExp(p).test(caseId))).map((f) => f.id);
}

const pickedFeatures = () =>
  (process.env.RFP_FEATURES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function caseSelected(caseId: string, part: SuitePart): boolean {
  if (caseId.startsWith("1.")) return true;
  const picked = pickedFeatures();
  if (!picked.length) return suiteParts().has(part);
  if (caseId === "3.0") {
    // The draft the negative cases act on: needed by any picked feature with a 3.x case.
    return FEATURE_MAP.features.some((f) => picked.includes(f.id) && f.cases.some((p) => p.startsWith("^3\\.") && p !== "^3\\.0$"));
  }
  return featuresOf(caseId).some((f) => picked.includes(f));
}

/** What this run was asked for, as the report says it. */
export function runScope(): string[] {
  const picked = pickedFeatures();
  return picked.length ? picked : [...suiteParts()];
}

/**
 * Which parts of the suite this run includes.
 *
 * The publish flow always runs: the verification reads the event it made,
 * and the negative cases reuse its products, vendors and template.
 */
export type SuitePart = "publish" | "verify" | "negative" | "surrogate";
export function suiteParts(): Set<SuitePart> {
  const raw = (process.env.RFP_SUITES || "publish,verify,negative").split(",").map((s) => s.trim());
  const parts = new Set<SuitePart>(["publish"]);
  for (const p of raw) if (p === "verify" || p === "negative" || p === "surrogate") parts.add(p);
  return parts;
}

/** Every setting as it resolved for this run — printed into the report. */
export function resolvedConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(DEFAULTS) as ConfigKey[]) out[k] = cfg(k);
  return out;
}

// ── RFP or RFQ ──────────────────────────────────────────────────────────────

export const mode = () => cfgStr("rfx_mode").toLowerCase();
export const isRfq = () => mode() === "rfq";
export const stageTitle = () => cfgStr("stage_title") || (isRfq() ? "RFQ" : "Technical Stage");
/** How many vendors to invite; "all" = every one found. */
export function numVendors(): number {
  const v = cfgStr("num_vendors").toLowerCase();
  return v === "all" ? Infinity : Number(v);
}
export function audienceSource(): "vendor_search" | "product_audience" {
  const a = cfgStr("audience_source").toLowerCase();
  return !a || a === "auto" ? (isRfq() ? "product_audience" : "vendor_search") : (a as "vendor_search" | "product_audience");
}
