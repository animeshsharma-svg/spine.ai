/**
 * PLAIN ENGLISH FOR FIELD CHECKS.
 *
 * An assertion reads `format company.city_uuid "encodedId"` to the engine and
 * "The company's city id is a valid Procol reference" to a person. This module
 * is the translation — deterministic, a glossary plus sentence templates — so
 * every field check can be read as a test case a tester would have written:
 * a title, the steps, the expected result, and afterwards what actually came
 * back. The machine check stays attached for engineers; nothing here decides
 * pass or fail.
 */
import type { StepKind } from "./journeyModel.js";

// ── what each step's response is ABOUT (root-level fields belong to it) ────

export const STEP_OBJECT: Record<StepKind, string> = {
  buyer_login: "the buyer's workspace settings",
  create_draft: "the new event",
  add_stage_rfp: "the technical round",
  add_stage_pricing: "the pricing round",
  publish: "the published event",
  read_back: "the event",
  vendor_login: "the vendor's sign-in",
  vendor_open_pricing: "the pricing round the vendor sees",
  vendor_open_technical: "the technical round the vendor sees",
  tech_start: "the vendor's technical response",
  tech_answer: "the vendor's answers",
  tech_submit: "the submitted technical response",
  bid_create: "the new bid",
  bid_products: "the priced line item",
  bid_submit: "the submitted bid",
  surrogate_tech: "the surrogate technical response",
  surrogate_rfq: "the surrogate bid",
  counter_offer: "the counter offer",
  convert_auction: "the new auction round",
  wait_close: "the bidding window",
  evaluator_login: "the evaluator's sign-in",
  eval_schema: "the evaluation form",
  eval_score: "the score",
  eval_submit: "the submitted evaluation",
  award_proposal: "the award proposal",
  award_lines: "the award proposal",
  award_workflow: "the award's approval workflow",
  award_submit: "the submitted award proposal",
  version: "the new version of the event",
};

export const ACTOR_WORD: Record<string, string> = { buyer: "buyer", vendor: "vendor", evaluator: "evaluator", platform: "platform" };

// ── words for field names ──────────────────────────────────────────────────

/** Leaf keys whose plain name is not just the key with spaces. */
const LEAF: Record<string, string> = {
  uuid: "reference id",
  ref_uuid: "public reference id",
  item_uuid: "item id",
  item_type: "item type",
  status: "status",
  current_status: "current status",
  report_status_data: "report status",
  name: "name",
  display_name: "display name",
  firm_name: "firm name",
  first_name: "first name",
  last_name: "last name",
  title: "title",
  label: "label",
  email: "email address",
  email_verified: "email verification state",
  user_type: "user type",
  rfx_mode: "type (RFQ / RFP / auction)",
  rfp_evaluation_mode: "technical evaluation mode",
  default_rfp_evaluation_mode: "default technical evaluation mode",
  auction_closing_mode: "auction closing mode",
  default_closing_mode: "default closing mode",
  default_event_type: "default event type",
  default_currency: "default currency",
  default_currency_label_type: "currency label style",
  default_unit: "default unit",
  city_uuid: "city id",
  company_uuid: "company id",
  user_uuid: "user id",
  event_group_uuid: "event id",
  event_group_line_item_uuid: "line item id",
  event_group_line_item_ids: "line item ids",
  current_stage_uuid: "current round id",
  trade_request_uuid: "round id",
  trade_uuids: "round ids",
  bid_uuid: "bid id",
  pending_approval_request_uuid: "pending approval request id",
  contracts_uuids: "linked contract ids",
  project_ref_id: "project reference number",
  created_at: "creation time",
  updated_at: "last-updated time",
  ends_at: "end time",
  rank_type: "ranking type",
  price_action_type: "price action type",
  order_type: "order type",
  creation_flow_type: "creation flow",
  total_proposal_value: "total proposal value",
  gross_total: "gross total",
  amount: "amount",
  price: "price",
  rank_price: "rank price",
  bulk_price: "bulk price",
  discount_amount: "discount amount",
  discount_price: "discount price",
  freight_price_amount: "freight amount",
  gst_tax_amount: "GST amount",
  price_unit: "price unit",
  quantity_unit: "quantity unit",
  unit_type: "unit type",
  quantity: "quantity",
  value: "value",
  unitSymbol: "unit",
  unit_symbol: "unit",
  savings: "savings",
  bidder_type: "bidder type",
  delivery_type: "delivery type",
  approval_type: "approval type",
  team_type: "team type",
  image_url: "image link",
  success: "success flag",
  document: "document",
  key: "key",
  data: "data",
  order: "display order",
  mode: "mode",
  mode_type: "display mode",
  type: "type",
  input_type: "input type",
  widget_type: "widget type",
  field_type: "field owner (buyer or vendor)",
  key_attribute: "field key",
  precision: "decimal precision",
  prefix: "prefix",
  formula: "formula",
  visibility: "visibility",
  read_only_mode: "read-only mode",
  is_required: "'required' flag",
  is_removable: "'removable' flag",
  is_tnc_mandatory: "'terms & conditions mandatory' flag",
  is_alternate_bidding_allowed: "'alternate bidding allowed' flag",
  extra_closing_time: "extra closing time",
  stop_expiry_in_approval: "'stop expiry during approval' setting",
  quotation_templates: "quotation templates",
  approval_conditions: "approval conditions",
  proposal_values: "proposal values",
  label_vs_evaluation_score: "score labels",
  new_item_data: "new version's details",
};

/** Parent keys, as the thing that owns the field ("the company's …"). */
const OWNER: Record<string, { one: string; each: string }> = {
  user: { one: "the user", each: "each user" },
  user_details: { one: "the event's creator", each: "each creator" },
  creator: { one: "the creator", each: "each creator" },
  company: { one: "the company", each: "each company" },
  trade_config: { one: "the round's settings", each: "each round's settings" },
  config: { one: "the event's settings", each: "each setting" },
  configuration: { one: "the column's settings", each: "each column's settings" },
  configurations: { one: "the company configuration", each: "each configuration" },
  global_config: { one: "the global configuration", each: "each global setting" },
  stages: { one: "the round", each: "each round" },
  trades: { one: "the round", each: "each round" },
  price_breakup: { one: "the price breakdown", each: "each price-breakdown line" },
  attachments: { one: "the attachment", each: "each attachment" },
  sheets: { one: "the pricing sheet", each: "each pricing sheet" },
  widgets: { one: "the column", each: "each column" },
  approvers: { one: "the approver", each: "each approver" },
  steps: { one: "the approval step", each: "each approval step" },
  conditions: { one: "the condition", each: "each condition" },
  initiators: { one: "the initiator", each: "each initiator" },
  proposal_values: { one: "the proposal value", each: "each proposal value" },
  global_price_components: { one: "the global price component", each: "each global price component" },
  line_items: { one: "the line item", each: "each line item" },
  trade_products: { one: "the line item", each: "each line item" },
  product: { one: "the product", each: "each product" },
  default_unit: { one: "the default unit", each: "each default unit" },
  misc: { one: "the extra details", each: "each extra detail" },
  new_item_data: { one: "the new version", each: "each new version" },
  approval_type: { one: "the approval type", each: "each approval type" },
  label_vs_evaluation_score: { one: "the score label", each: "each score label" },
  evaluation_score_label_mapping: { one: "the score-label mapping", each: "each score-label mapping" },
  inline_components: { one: "the inline section", each: "each inline section" },
  order_details: { one: "the order details", each: "each order detail" },
  other_details: { one: "the other details", each: "each other detail" },
  delivery_zone: { one: "the delivery location", each: "each delivery location" },
  quotation_templates: { one: "the quotation template", each: "each quotation template" },
};

const words = (k: string): string =>
  k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_uuids$/, " ids")
    .replace(/_uuid$/, " id")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();

function leafWord(k: string): string {
  if (LEAF[k]) return LEAF[k];
  if (/^is_/.test(k)) return `'${words(k.slice(3))}' flag`;
  if (/^(show|allow|enable|hide)_/.test(k)) return `'${words(k)}' setting`;
  if (/^default_/.test(k)) return `default ${words(k.slice(8))}`;
  return words(k);
}

function ownerWord(k: string, each: boolean): string {
  const o = OWNER[k];
  if (o) return each ? o.each : o.one;
  const w = words(k);
  return each ? `each ${w.replace(/s$/, "")}` : `the ${w}`;
}

const possessive = (s: string) => (s.endsWith("s") && !s.endsWith("'s") ? `${s}'` : `${s}'s`);

/**
 * `company.city_uuid` → "the company's city id";
 * `stages[*].rfx_mode` → "each round's round type (RFQ / RFP / auction)";
 * `uuid` on create_draft → "the new event's reference id".
 */
export function fieldPhrase(path: string, step: StepKind): string {
  if (!path) return STEP_OBJECT[step];
  const raw = path.split(".");
  const segs: Array<{ key: string; each: boolean }> = raw.map((s) => ({ key: s.replace(/\[\*\]$/, ""), each: s.endsWith("[*]") }));
  const leaf = segs[segs.length - 1];
  const owners = segs.slice(0, -1);
  const leafW = leaf.each ? `every ${leafWord(leaf.key).replace(/s$/, "")}` : leafWord(leaf.key);
  if (!owners.length) return `${possessive(STEP_OBJECT[step])} ${leafW}`;
  // Keep the phrase readable: at most the two closest owners.
  // Only the first owner keeps its article: "each order detail's product's …".
  const chain = owners.slice(-2).map((o, i) => (i === 0 ? ownerWord(o.key, o.each) : ownerWord(o.key, o.each).replace(/^(the|each) /, "")));
  return `${chain.map(possessive).join(" ")} ${leafW}`.replace(/\bthe (\w+)'s the\b/g, "the $1's");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const q = (v: unknown) => (typeof v === "string" ? `“${v}”` : JSON.stringify(v));

// ── words for types and formats ────────────────────────────────────────────

export const TYPE_WORD: Record<string, string> = {
  string: "text",
  number: "a number",
  boolean: "a yes/no value",
  array: "a list",
  object: "a set of details",
  null: "empty",
};

export const FORMAT_WORD: Record<string, { short: string; long: string }> = {
  encodedId: { short: "a valid Procol reference", long: "a valid Procol reference — a short code of letters and digits, such as RHBjY3Bj" },
  email: { short: "a valid email address", long: "a properly formed email address (name@domain)" },
  epochSeconds: { short: "a real date and time", long: "a real date and time (a Unix timestamp in seconds)" },
  epochMs: { short: "a real date and time", long: "a real date and time (a Unix timestamp in milliseconds)" },
  isoDate: { short: "a real date", long: "a real calendar date" },
  url: { short: "a web address", long: "a web address starting with http or https" },
};

const typeList = (types: string[]) => types.map((t) => TYPE_WORD[t] ?? t).join(" or ");

// ── the case, as a tester would write it ───────────────────────────────────

export interface HumanCase {
  title: string;
  steps: string;
  expected: string;
}

export interface CheckLike {
  op: string;
  path: string;
  value?: unknown;
  ref?: string;
  endpoint: string;
  step: StepKind;
}

/** Plain names for the ids a journey produces, used by cross-step checks. */
export const MADE_WORD: Record<string, string> = {
  buyerUserUuid: "the buyer who signed in",
  vendorUserUuid: "the vendor user who signed in",
  vendorCompanyUuid: "the vendor's company",
  eventGroupUuid: "the event created at the start of the journey",
  lineItemUuid: "the line item created with the event",
  technicalTradeUuid: "the technical round added earlier",
  pricingTradeUuid: "the pricing round added earlier",
  auctionTradeUuid: "the auction round created by the conversion",
  tradeProductUuid: "the line item the vendor priced",
  techFormUuid: "the technical form opened earlier",
  techPageUuid: "the technical form page opened earlier",
  templateResponseUuid: "the technical response started earlier",
  bidUuid: "the vendor's bid",
  surrogateBidUuid: "the bid entered for the vendor",
  counterOfferUuid: "the counter offer raised earlier",
  evalFormUuid: "the evaluation form",
  proposalUuid: "the award proposal opened earlier",
  approvalFlowUuid: "the approval workflow",
};

export function humanCase(a: CheckLike, stepTitle: string, actor: string): HumanCase {
  const field = fieldPhrase(a.path, a.step);
  const F = cap(field);
  const who = ACTOR_WORD[actor] ?? actor;
  const each = a.path.includes("[*]") && !/\b(each|every)\b/.test(field) ? " for every item" : "";
  const seconds = Math.round(Number(a.value ?? 0) / 1000);
  const fmt = FORMAT_WORD[String(a.value)];
  const vals = Array.isArray(a.value) ? (a.value as unknown[]) : [];
  const made = MADE_WORD[a.ref ?? ""] ?? `the ${words(a.ref ?? "record")} from an earlier step`;
  const route = a.endpoint;
  const look = a.path ? `Look at ${field} in the app's response.` : "Look at the app's response.";
  const steps = `1. As the ${who}, do “${stepTitle}” in the API journey (\`${route}\`). 2. ${look}`;
  switch (a.op) {
    case "status_2xx":
      return { title: `${stepTitle} succeeds`, steps: `1. As the ${who}, do “${stepTitle}” in the API journey (\`${route}\`). 2. Note how the app answers.`, expected: "The app accepts the request and answers with a success." };
    case "max_ms":
      return { title: `${stepTitle} answers within ${seconds} seconds`, steps: `1. As the ${who}, do “${stepTitle}” in the API journey (\`${route}\`). 2. Time the answer.`, expected: `The app answers within ${seconds} seconds.` };
    case "json_body":
      return { title: `${stepTitle} returns readable data`, steps: `1. As the ${who}, do “${stepTitle}” in the API journey (\`${route}\`). 2. Look at what comes back.`, expected: "The app answers with structured data (JSON), not an error page or blank reply." };
    case "exists":
      return { title: `${F} is returned`, steps, expected: `The response includes ${field}${each}.` };
    case "type_is":
      return { title: `${F} is ${typeList(vals as string[])}`, steps, expected: `${F} is ${typeList(vals as string[])}.` };
    case "format":
      return { title: `${F} is ${fmt?.short ?? String(a.value)}`, steps, expected: `${F} is ${fmt?.long ?? String(a.value)}.` };
    case "one_of":
      return vals.length === 1
        ? { title: `${F} is ${q(vals[0])}`, steps, expected: `${F} reads ${q(vals[0])}.` }
        : { title: `${F} is one of ${vals.map(q).join(", ")}`, steps, expected: `${F} reads one of ${vals.map(q).join(", ")}.` };
    case "gte":
      return { title: `${F} is never negative`, steps, expected: `${F} is zero or more — never a negative figure.` };
    case "non_empty":
      return { title: `${F} is not empty`, steps, expected: `${F} contains at least one item.` };
    case "equals_request":
      return {
        title: `${F} is saved exactly as sent`,
        steps: `1. As the ${who}, do “${stepTitle}” in the API journey (\`${route}\`), noting the value sent for it. 2. Compare ${field} in the app's response with what was sent.`,
        expected: `${F} is exactly what the ${who} sent${each ? " (it appears among the items returned)" : ""}.`,
      };
    case "equals_made": {
      // An id that matches an earlier record reads best as "X is that record":
      // "The event's creator is the buyer who signed in".
      const leaf = a.path.split(".").pop()?.replace(/\[\*\]$/, "") ?? "";
      if (/(^|_)(uuid|id)$/.test(leaf)) {
        const subject = cap(field.replace(/'s (public )?reference id$/, "").replace(/ id$/, ""));
        return {
          title: `${subject} is ${made}`,
          steps: `1. Walk the API journey up to “${stepTitle}” (\`${route}\`). 2. Check which record ${field} points to.`,
          expected: `${subject} is ${made} — the call acted on the right record, not a different one.`,
        };
      }
      return {
        title: `${F} matches ${made}`,
        steps: `1. Walk the API journey up to “${stepTitle}” (\`${route}\`). 2. Compare ${field} with ${made}.`,
        expected: `${F} is the same as ${made} — the call acted on the right record.`,
      };
    }
  }
  return { title: `${F} is correct`, steps, expected: `${F} is as expected.` };
}

// ── what actually came back, in words ──────────────────────────────────────

export interface ActualFacts {
  op: string;
  pass: boolean | null;
  /** status/ms for the whole-call checks */
  status?: number;
  ms?: number;
  /** the value(s) seen; `bad` is the offending one when it failed */
  seen?: unknown;
  bad?: unknown;
  sent?: unknown;
  expectedMade?: string;
  total?: number;
  missing?: number;
  count?: number;
  reason?: string;
  format?: string;
}

const typeOfWord = (v: unknown): string => TYPE_WORD[v === null ? "null" : Array.isArray(v) ? "array" : typeof v] ?? typeof v;
const shown = (v: unknown): string => {
  if (v === undefined) return "nothing";
  if (v === null) return "empty";
  if (typeof v === "string") return `“${v.length > 60 ? `${v.slice(0, 60)}…` : v}”`;
  const s = JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};

export function humanActual(f: ActualFacts): string {
  if (f.pass === null) return `Not checked — ${f.reason ?? "nothing to check"}.`;
  switch (f.op) {
    case "status_2xx":
      if (f.pass) return `The app accepted it (HTTP ${f.status}).`;
      if (!f.status) return "No answer came back from the app.";
      return f.status >= 500 ? `The app broke (HTTP ${f.status}).` : `The app refused it (HTTP ${f.status}).`;
    case "max_ms": {
      const s = ((f.ms ?? 0) / 1000).toFixed(1);
      return f.pass ? `It answered in ${s} seconds.` : `It took ${s} seconds — too slow.`;
    }
    case "json_body":
      return f.pass ? "It answered with structured data." : `It answered with ${typeOfWord(f.seen)} instead of structured data.`;
    case "exists":
      if (f.pass) return f.total && f.total > 1 ? `It was there on all ${f.total} items.` : "It was there.";
      return f.total && f.total > 1 ? `It was missing on ${f.missing} of ${f.total} items.` : "It was missing from the response.";
    case "type_is":
      return f.pass ? `It was ${typeOfWord(f.seen)}${f.seen !== undefined && typeof f.seen !== "object" ? ` (${shown(f.seen)})` : ""}.` : `It was ${typeOfWord(f.bad)} instead (${shown(f.bad)}).`;
    case "format":
      return f.pass ? `It was ${shown(f.seen)} — valid.` : `It was ${shown(f.bad)} — not ${FORMAT_WORD[f.format ?? ""]?.short ?? "the expected format"}.`;
    case "one_of":
      return f.pass ? `It read ${shown(f.seen)}.` : `It read ${shown(f.bad)} instead.`;
    case "gte":
      return f.pass ? `It was ${shown(f.seen)}.` : `It was ${shown(f.bad)} — a negative figure.`;
    case "non_empty":
      return f.pass ? `It had ${f.count} item${f.count === 1 ? "" : "s"}.` : "It was empty.";
    case "equals_request":
      return f.pass ? `Sent ${shown(f.sent)}, got back ${shown(f.seen)} — they match.` : `Sent ${shown(f.sent)}, but got back ${shown(f.bad)}.`;
    case "equals_made":
      return f.pass ? `It was ${shown(f.seen)} — the same record as before.` : `It was ${shown(f.bad)}, but the earlier record was ${shown(f.expectedMade)}.`;
  }
  return f.pass ? "As expected." : "Not as expected.";
}
