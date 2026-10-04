/**
 * THE API TEST COMPILER — any API-level test case becomes a runnable plan.
 *
 * The assistant used to turn a typed case into ONE request, a variation of a
 * library request. A case like "a vendor cannot bid after the deadline is
 * extended and closes again" is not one request: it needs an event in a
 * particular state, several moves, and a read-back. This module compiles the
 * case's words into an API PLAN in a small, fixed, machine-checkable language:
 *
 *   setup    one RECIPE from a short list ("published RFQ with one QA vendor
 *            invited", "RFQ closed with two bids", …) — each is a run of the
 *            existing event journey (eventJourney.ts) cut at the right step,
 *            plus at most a second QA vendor and a wait for the close;
 *   act      one or more OPERATIONS — each a known endpoint whose body comes
 *            from a WORKING template (the journey's own body builders in
 *            `procol test/src/flows/bodies.ts`, or a case from the API
 *            library, data/api-cases*.json) with the case's change applied;
 *   verify   read-backs (GETs) with assertions in the field-assertion op
 *            language (apiAssertions.ts): equals / exists / count / one_of /
 *            status …;
 *   expected accept | reject (with the app's code and message from
 *            en-IN.yml when known) | no-5xx.
 *
 * The model (Slingring fast tier, JSON only; the reason tier once, only when
 * the fast tier's answer cannot be made valid and the caller allows it) does
 * ONE job: map words to a plan. Everything it returns is checked here, in
 * code: every recipe, operation, actor, field path, placeholder, assertion op
 * and error code must be in the vocabulary. What cannot be expressed is
 * named as a gap and the coverage says so (full / partial / none) — nothing
 * is invented. A case that cites a library case (EDGE-…) is compiled without
 * the model at all.
 *
 * Pass and fail are never decided here — apiPlanRunner.ts runs the plan and
 * the verdict comes from the engine's classify() and the assertion ops.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { chat, llmMode, usageReport } from "../ai/llm.js";
import { PROCOL_TEST } from "../executor.js";
import { heldCases, loadCases, type TestCaseRecord } from "../checks/caseLibrary.js";
import { caseById, type CatalogCase } from "../checks/testCatalog.js";
import { endpointInWords, errorMessage } from "../checks/caseDisplay.js";
import { FORMATS } from "../checks/apiAssertions.js";
import type { EventType, StepKind } from "../checks/journeyModel.js";

// ── the language ────────────────────────────────────────────────────────────

export const PLAN_VERSION = 1;

export type ActorId = "buyer" | "vendor" | "vendor2";
export type Outcome = "accept" | "reject" | "no-5xx";

export type RecipeId =
  | "none"
  | "draft_event"
  | "draft_rfq"
  | "draft_rfp_rfq"
  | "published_rfq"
  | "published_rfq_short"
  | "published_rfp_rfq"
  | "rfq_with_bid"
  | "rfq_with_2_bids"
  | "rfp_rfq_with_tech_response"
  | "closed_rfq"
  | "closed_rfq_with_bid"
  | "closed_rfq_with_2_bids"
  | "closed_rfp_rfq_with_tech_response"
  | "awarded_rfq";

export type OpId =
  // reads
  | "read_event"
  | "read_round"
  | "read_rfp_round"
  | "read_round_schema"
  | "read_audience"
  | "read_line_items"
  | "read_indicators"
  | "list_events"
  // buyer writes
  | "create_draft"
  | "add_rfq_round"
  | "add_rfp_round"
  | "publish_event"
  | "update_event"
  | "withdraw_event"
  | "extend_round"
  | "add_vendor"
  | "remove_vendor"
  | "surrogate_bid"
  | "open_proposal"
  | "award_vendor"
  | "new_version"
  | "clone_event"
  // vendor writes
  | "open_bid"
  | "price_bid"
  | "submit_bid"
  | "place_bid"
  | "start_tech_response"
  // a library case's own request, as written
  | "library"
  // the clock
  | "wait";

export type AssertOp =
  | "status" // HTTP status equals value (number)
  | "status_2xx"
  | "exists"
  | "absent"
  | "equals"
  | "not_equals"
  | "one_of"
  | "contains"
  | "count"
  | "count_gte"
  | "non_empty"
  | "gte"
  | "lte"
  | "type_is"
  | "format";

export interface Change {
  /** dotted path into the template body ("configurations.bid_end_time", "data[0].creator_quantity.value") */
  path: string;
  /** the new value — JSON; strings may carry {{tokens}} */
  set?: unknown;
  /** remove the key */
  remove?: boolean;
  /** the key is new (its parent must exist) */
  add?: boolean;
}

export interface ActStep {
  op: OpId;
  as?: ActorId;
  /** library op only: the library case whose request is sent */
  caseId?: string;
  /** edits to the working body */
  change?: Change[];
  /** op parameters: price (bids), vendor (whose bid/award: vendor|vendor2), until (wait: bid_end|close) */
  params?: { price?: number; vendor?: "vendor" | "vendor2"; until?: "bid_end" | "close"; round?: "pricing" | "technical" };
  /** this step's expected outcome; default accept, except the decisive step which takes the plan's */
  expect?: Outcome;
  /** the step the case is about (default: the last non-wait act) */
  decisive?: boolean;
  /** an arrange step that is refused: "pass" (the refusal is what the case expects), "inconclusive" (default), "continue" */
  ifRefused?: "pass" | "inconclusive" | "continue";
  /** a plain-English line for the steps a person reads */
  say?: string;
}

export interface Assertion {
  path: string;
  op: AssertOp;
  value?: unknown;
  /** a plain-English line */
  say?: string;
}

export interface VerifyStep {
  op: OpId;
  as?: ActorId;
  assert: Assertion[];
  say?: string;
}

export interface ApiPlan {
  version: number;
  /** catalog id (API-…), library id (EDGE-…) or draft id (GEN-…), when there is one */
  caseId?: string;
  /** plain English */
  title: string;
  setup: { recipe: RecipeId };
  act: ActStep[];
  verify: VerifyStep[];
  /** codeInferred: the code was the compiler's inference, not stated by the case or a library case */
  expected: { outcome: Outcome; code?: string; message?: string; codeInferred?: boolean };
  /**
   * The case's outcome depends on a company setting the plan does not change
   * ("config-dependent" library cases). The runner then reports a failure as
   * "couldn't tell" with this reason, never as a product bug.
   */
  dependsOnSetting?: string;
}

export interface CompiledApiPlan {
  plan: ApiPlan | null;
  /** what the plan covers of the case, decided in code */
  coverage: "full" | "partial" | "none";
  /** named gaps — what the plan does not check, or why there is no plan */
  gaps: string[];
  /** validation problems that made the plan unusable (empty when valid) */
  errors: string[];
  /** non-blocking notes (a field not yet seen in a real reply, a code not in en-IN.yml…) */
  warnings: string[];
  source: "library-case" | "exemplar" | "rules" | "llm-fast" | "llm-reason" | "none";
  /** the endpoints the plan sends, "METHOD /route/:id" */
  endpoints: string[];
  /** the decisive request's endpoint */
  decisiveEndpoint?: string;
  llm: { calls: number; promptTokens: number; completionTokens: number; reasonTierUsed: boolean; usd: number };
  /** the text the plan was compiled from */
  text: string;
  /** library cases offered to the model as templates */
  candidates: string[];
  /** the automation exemplars retrieved for this case (closest first), when any */
  exemplars?: Array<{ id: string; title: string; score: number; dense: number; structure: number; verdict: string; source: string }>;
  /** the exemplar whose validated plan was reused without a model */
  reusedFrom?: string;
  ms: number;
}

// ── recipes: the setups, mapped onto journey runs ───────────────────────────

export interface Recipe {
  id: RecipeId;
  /** precondition, as a QA engineer writes it */
  title: string;
  /** null = no record is built */
  eventType: EventType | null;
  /** the journey steps that build it (eventJourney.runEventJourney with a custom step list) */
  steps: StepKind[];
  /** how long the rounds stay open: long ≈ 20 min, short ≈ 2 min (so the run can wait it out) */
  clock: "long" | "short" | "none";
  /** QA vendors invited (the journey invites vendor 1; the runner adds vendor 2) */
  vendors: 0 | 1 | 2;
  /** submitted bids (vendor 1 through the journey, vendor 2 by the runner) */
  bids: 0 | 1 | 2;
  /** the runner waits for the round's extra closing time after building */
  closed: boolean;
  /** placeholders this recipe fills */
  provides: string[];
  /** rough minutes to build, for the reader */
  minutes: number;
}

const BUILD: StepKind[] = ["buyer_login", "create_draft"];
const PUB_RFQ: StepKind[] = [...BUILD, "add_stage_pricing", "publish", "read_back"];
const PUB_RFP_RFQ: StepKind[] = [...BUILD, "add_stage_rfp", "add_stage_pricing", "publish", "read_back"];
const BID: StepKind[] = ["vendor_login", "vendor_open_pricing", "bid_create", "bid_products", "bid_submit"];
const TECH: StepKind[] = ["vendor_login", "vendor_open_technical", "tech_start", "tech_answer", "tech_submit"];
const BASE_PROVIDES = ["stamp", "productUuid", "productQualityUuid", "locationUuid", "vendorUuid", "vendor2Uuid"];
const EVENT = ["eventGroupUuid", "lineItemUuid"];
const PRICING = ["pricingTradeUuid", "tradeId"];
const RFP = ["technicalTradeUuid", "rfpTradeId"];

export const RECIPES: Record<RecipeId, Recipe> = {
  none: { id: "none", title: "A buyer signed in to the client under test (no event is built).", eventType: null, steps: [], clock: "none", vendors: 0, bids: 0, closed: false, provides: BASE_PROVIDES, minutes: 0 },
  draft_event: { id: "draft_event", title: "A fresh draft event with one line item and no rounds.", eventType: "rfq_only", steps: BUILD, clock: "long", vendors: 0, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT], minutes: 1 },
  draft_rfq: { id: "draft_rfq", title: "A fresh draft event with one line item and an RFQ (pricing) round attached, not published.", eventType: "rfq_only", steps: [...BUILD, "add_stage_pricing"], clock: "long", vendors: 0, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING], minutes: 1 },
  draft_rfp_rfq: { id: "draft_rfp_rfq", title: "A fresh draft event with a technical (RFP) round and a pricing (RFQ) round attached, not published.", eventType: "rfp_rfq", steps: [...BUILD, "add_stage_rfp", "add_stage_pricing"], clock: "long", vendors: 0, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, ...RFP], minutes: 1 },
  published_rfq: { id: "published_rfq", title: "A fresh RFQ event, published, with one QA vendor invited; bidding open for about 20 minutes.", eventType: "rfq_only", steps: PUB_RFQ, clock: "long", vendors: 1, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING], minutes: 1 },
  published_rfq_short: { id: "published_rfq_short", title: "A fresh RFQ event, published, with one QA vendor invited; bidding open for only about two minutes.", eventType: "rfq_only", steps: PUB_RFQ, clock: "short", vendors: 1, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING], minutes: 1 },
  published_rfp_rfq: { id: "published_rfp_rfq", title: "A fresh RFP + RFQ event, published, with one QA vendor invited to both rounds; both open for about 20 minutes.", eventType: "rfp_rfq", steps: PUB_RFP_RFQ, clock: "long", vendors: 1, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, ...RFP], minutes: 1 },
  rfq_with_bid: { id: "rfq_with_bid", title: "A fresh published RFQ event where the invited QA vendor has submitted a bid; bidding still open.", eventType: "rfq_only", steps: [...PUB_RFQ, ...BID], clock: "long", vendors: 1, bids: 1, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, "bidUuid"], minutes: 2 },
  rfq_with_2_bids: { id: "rfq_with_2_bids", title: "A fresh published RFQ event with two QA vendors invited, each with a submitted bid; bidding still open.", eventType: "rfq_only", steps: [...PUB_RFQ, ...BID], clock: "long", vendors: 2, bids: 2, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, "bidUuid", "bid2Uuid"], minutes: 3 },
  rfp_rfq_with_tech_response: { id: "rfp_rfq_with_tech_response", title: "A fresh published RFP + RFQ event where the invited QA vendor has submitted its technical response; rounds still open.", eventType: "rfp_rfq", steps: [...PUB_RFP_RFQ, ...TECH], clock: "long", vendors: 1, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, ...RFP, "templateResponseUuid"], minutes: 2 },
  closed_rfq: { id: "closed_rfq", title: "A fresh published RFQ event with one QA vendor invited, no bids, and its bidding window (with the extra closing time) already over.", eventType: "rfq_only", steps: PUB_RFQ, clock: "short", vendors: 1, bids: 0, closed: true, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING], minutes: 3 },
  closed_rfq_with_bid: { id: "closed_rfq_with_bid", title: "A fresh RFQ event where the invited QA vendor bid, and the bidding window is over.", eventType: "rfq_only", steps: [...PUB_RFQ, ...BID], clock: "short", vendors: 1, bids: 1, closed: true, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, "bidUuid"], minutes: 4 },
  closed_rfq_with_2_bids: { id: "closed_rfq_with_2_bids", title: "A fresh RFQ event where two QA vendors bid, and the bidding window is over.", eventType: "rfq_only", steps: [...PUB_RFQ, ...BID], clock: "short", vendors: 2, bids: 2, closed: true, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, "bidUuid", "bid2Uuid"], minutes: 5 },
  closed_rfp_rfq_with_tech_response: { id: "closed_rfp_rfq_with_tech_response", title: "A fresh RFP + RFQ event where the invited QA vendor submitted its technical response, and both windows are over (evaluation time).", eventType: "rfp_rfq", steps: [...PUB_RFP_RFQ, ...TECH], clock: "short", vendors: 1, bids: 0, closed: true, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, ...RFP, "templateResponseUuid"], minutes: 4 },
  awarded_rfq: { id: "awarded_rfq", title: "A fresh RFQ event the QA vendor bid on, closed, and awarded to that vendor (award submitted for approval).", eventType: "rfq_only", steps: [...PUB_RFQ, ...BID, "wait_close", "award_proposal", "award_lines", "award_workflow", "award_submit"], clock: "short", vendors: 1, bids: 1, closed: true, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, "bidUuid", "proposalUuid"], minutes: 5 },
};

// ── operations: the endpoints a plan may send ───────────────────────────────

export interface OpDef {
  id: OpId;
  kind: "read" | "write" | "clock";
  method: "GET" | "POST" | "PATCH" | "PUT" | "";
  /** path template with {{placeholders}} */
  path: string;
  /** who sends it by default; `actors` lists who may */
  actor: ActorId;
  actors: ActorId[];
  /** the working template the body is built from */
  template: string;
  /** placeholders it needs */
  needs: string[];
  /** placeholders it fills for later steps */
  produces: string[];
  /** a noun phrase: "updates the event" */
  does: string;
}

const T_ROUND = "/trade/{{tradeId}}?response_type=template&additional_fields=order_details";

export const OPS: Record<OpId, OpDef> = {
  read_event: { id: "read_event", kind: "read", method: "GET", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "—", needs: ["eventGroupUuid"], produces: [], does: "reads the event" },
  read_round: { id: "read_round", kind: "read", method: "GET", path: T_ROUND, actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "—", needs: ["tradeId"], produces: [], does: "reads the pricing round" },
  read_rfp_round: { id: "read_rfp_round", kind: "read", method: "GET", path: "/trade/{{rfpTradeId}}?response_type=template&additional_fields=order_details", actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "—", needs: ["rfpTradeId"], produces: [], does: "reads the technical round" },
  read_round_schema: { id: "read_round_schema", kind: "read", method: "GET", path: "/v1/trade/{{tradeId}}/schema?response_type=template&additional_fields=order_details", actor: "buyer", actors: ["buyer", "vendor"], template: "—", needs: ["tradeId"], produces: [], does: "reads the pricing round's schema" },
  read_audience: { id: "read_audience", kind: "read", method: "GET", path: "/event_groups/{{eventGroupUuid}}/get_audience", actor: "buyer", actors: ["buyer"], template: "—", needs: ["eventGroupUuid"], produces: [], does: "lists the event's invited vendors" },
  read_line_items: { id: "read_line_items", kind: "read", method: "GET", path: "/event_groups/{{eventGroupUuid}}/get_line_items", actor: "buyer", actors: ["buyer"], template: "—", needs: ["eventGroupUuid"], produces: [], does: "lists the event's line items" },
  read_indicators: { id: "read_indicators", kind: "read", method: "GET", path: "/v1/trade/{{tradeId}}/event_indicators", actor: "buyer", actors: ["buyer", "vendor"], template: "—", needs: ["tradeId"], produces: [], does: "reads the round's comparison (ranks, best bidder)" },
  list_events: { id: "list_events", kind: "read", method: "GET", path: "/orders", actor: "buyer", actors: ["buyer", "vendor"], template: "—", needs: [], produces: [], does: "lists events" },

  create_draft: { id: "create_draft", kind: "write", method: "POST", path: "/event_groups", actor: "buyer", actors: ["buyer", "vendor"], template: "bodies.buildEventGroupBody (journey step: create the draft)", needs: ["productUuid", "productQualityUuid"], produces: ["eventGroupUuid", "lineItemUuid"], does: "creates a draft event" },
  add_rfq_round: { id: "add_rfq_round", kind: "write", method: "POST", path: "/trade/template_input?template_name=trade&additional_fields=order_details", actor: "buyer", actors: ["buyer"], template: "bodies.buildPricingStageBody (journey step: add the pricing round)", needs: ["eventGroupUuid", "lineItemUuid"], produces: ["pricingTradeUuid", "tradeId"], does: "adds a pricing (RFQ) round to the event" },
  add_rfp_round: { id: "add_rfp_round", kind: "write", method: "POST", path: "/trade/template_input?template_name=trade&additional_fields=order_details", actor: "buyer", actors: ["buyer"], template: "bodies.buildTechnicalStageBody (journey step: add the technical round)", needs: ["eventGroupUuid", "lineItemUuid"], produces: ["technicalTradeUuid", "rfpTradeId"], does: "adds a technical (RFP) round to the event" },
  publish_event: { id: "publish_event", kind: "write", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor"], template: "bodies.buildPublishBody (journey step: publish)", needs: ["eventGroupUuid"], produces: [], does: "publishes the event" },
  update_event: { id: "update_event", kind: "write", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-CRT-020 (rename an event)", needs: ["eventGroupUuid"], produces: [], does: "updates the event" },
  withdraw_event: { id: "withdraw_event", kind: "write", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-076 (withdraw with a remark)", needs: ["eventGroupUuid"], produces: [], does: "withdraws the event" },
  extend_round: { id: "extend_round", kind: "write", method: "PATCH", path: "/trade/{{tradeId}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-058 / bidding matrix M15 (extend the bid end)", needs: ["tradeId"], produces: [], does: "moves the round's bid end time" },
  add_vendor: { id: "add_vendor", kind: "write", method: "PATCH", path: "/v1/trade/add_audience?id={{tradeId}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-037 (invite a vendor to a live round)", needs: ["tradeId", "vendor2Uuid"], produces: [], does: "invites QA vendor 2 to the live round" },
  remove_vendor: { id: "remove_vendor", kind: "write", method: "PATCH", path: "/v1/trade/remove_audience?id={{tradeId}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-045 (remove a vendor from a live round)", needs: ["tradeId", "vendorUuid"], produces: [], does: "removes the invited vendor from the live round" },
  surrogate_bid: { id: "surrogate_bid", kind: "write", method: "POST", path: "/bids/template_input", actor: "buyer", actors: ["buyer"], template: "bodies.buildSurrogateRfqBody (journey step: surrogate RFQ bid)", needs: ["tradeId", "lineItemUuid"], produces: [], does: "enters a bid on a vendor's behalf (surrogate bid)" },
  open_proposal: { id: "open_proposal", kind: "write", method: "POST", path: "/proposal", actor: "buyer", actors: ["buyer", "vendor"], template: "bodies.buildProposalBody (journey step: open the award proposal)", needs: ["eventGroupUuid"], produces: ["proposalUuid"], does: "opens an award proposal" },
  award_vendor: { id: "award_vendor", kind: "write", method: "POST", path: "/proposal/{{proposalUuid}}/add_response?lot_no=", actor: "buyer", actors: ["buyer"], template: "bodies.buildAwardResponseBody (journey step: award the line)", needs: ["proposalUuid", "lineItemUuid"], produces: [], does: "awards the line to a vendor on the proposal" },
  new_version: { id: "new_version", kind: "write", method: "POST", path: "/item_versions", actor: "buyer", actors: ["buyer"], template: "bodies.buildItemVersionBody (journey step: new version)", needs: ["eventGroupUuid"], produces: [], does: "issues a new version of the event" },
  clone_event: { id: "clone_event", kind: "write", method: "POST", path: "/event_groups/{{eventGroupUuid}}/create_clone", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-109 (clone an event)", needs: ["eventGroupUuid"], produces: ["cloneUuid"], does: "clones the event" },

  open_bid: { id: "open_bid", kind: "write", method: "POST", path: "/v1/bids", actor: "vendor", actors: ["vendor", "vendor2", "buyer"], template: "bodies.buildCreateBid (journey step: open a bid)", needs: ["tradeId"], produces: ["bidUuid"], does: "opens a bid on the pricing round" },
  price_bid: { id: "price_bid", kind: "write", method: "POST", path: "/v1/bids/{{bidUuid}}/create_bid_products", actor: "vendor", actors: ["vendor", "vendor2"], template: "bodies.buildBidProductsBody (journey step: price the line)", needs: ["tradeId", "bidUuid", "lineItemUuid"], produces: [], does: "prices the line on the bid" },
  submit_bid: { id: "submit_bid", kind: "write", method: "PATCH", path: "/v1/bids/{{bidUuid}}", actor: "vendor", actors: ["vendor", "vendor2"], template: "bodies.buildSubmitBidBody (journey step: submit the bid)", needs: ["tradeId", "bidUuid"], produces: [], does: "submits the bid" },
  place_bid: { id: "place_bid", kind: "write", method: "POST", path: "/v1/bids", actor: "vendor", actors: ["vendor", "vendor2"], template: "the journey's three bid steps (open → price → submit), stopping at the first refusal", needs: ["tradeId", "lineItemUuid"], produces: ["bidUuid"], does: "places a complete bid (open, price, submit)" },
  start_tech_response: { id: "start_tech_response", kind: "write", method: "POST", path: "/template_responses", actor: "vendor", actors: ["vendor", "vendor2"], template: "bodies.buildStartTechnicalResponse (journey step: start the technical response)", needs: ["rfpTradeId"], produces: ["templateResponseUuid"], does: "starts a technical response on the RFP round" },

  library: { id: "library", kind: "write", method: "", path: "", actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "the named library case's own request", needs: [], produces: [], does: "sends a library case's request" },
  wait: { id: "wait", kind: "clock", method: "", path: "", actor: "buyer", actors: ["buyer"], template: "—", needs: ["tradeId"], produces: [], does: "waits for the round's bid end (or its extra closing time)" },
};

/** Placeholders that only an act can fill (and which act). */
const ACT_PRODUCES: Record<string, OpId[]> = {};
for (const op of Object.values(OPS)) for (const p of op.produces) (ACT_PRODUCES[p] ??= []).push(op.id);

/**
 * Placeholders a plan may use. Anything naming a LIVE business record
 * (a purchase request, an order, a real user or team) is not here: a plan
 * acts only on the records its own setup built.
 */
export const PLAN_PLACEHOLDERS = new Set([
  ...BASE_PROVIDES, ...EVENT, ...PRICING, ...RFP,
  "bidUuid", "bid2Uuid", "templateResponseUuid", "proposalUuid", "cloneUuid", "evalFormUuid", "tradeProductUuid", "techFormUuid", "techPageUuid",
]);
/** time tokens: {{now}}, {{now+600}}, {{now-3600}}, {{roundEnd+120}}, {{roundClose-30}} */
const TIME_TOKEN = /^(now|roundEnd|roundClose|rfpEnd)([+-]\d{1,7})?$/;
/** references to an earlier act: {{act1.body.title}}, {{act2.data.uuid}} */
const ACT_TOKEN = /^act(\d)\.(body|data)\.([A-Za-z0-9_.[\]*]+)$/;
/** library placeholders that point at live records — never filled by a plan */
const LIVE_RECORD_PLACEHOLDERS = new Set(["prId", "prItemId", "userUuid", "teamUuid", "orderUuid", "poUuid", "intakeId", "vendorCompanyId", "categoryUuid", "familyUuid", "cityUuid", "vbuSheet", "approvalFlowUuid"]);

/** Library endpoints a plan may send: the sourcing-event domain only (POC scope). */
const LIBRARY_DOMAIN = /^\/(event_groups|trade|v1\/trade|v1\/bids|bids|template_responses|evaluations|proposal|item_versions|additional_request|user_intents|orders$)/;

// ── the library ─────────────────────────────────────────────────────────────

let libCache: { at: number; byId: Map<string, TestCaseRecord>; endpoints: Map<string, string[]> } | undefined;

/** "PATCH /event_groups/{{eventGroupUuid}}?x=1" → "PATCH /event_groups/:id" */
export function endpointKey(method: string, path: string): string {
  const route = String(path ?? "")
    .split("?")[0]
    .replace(/\{\{\w+\}\}/g, ":id")
    .split("/")
    .map((seg) => (seg === ":id" || FORMATS.encodedId.test(seg) || /^\d+$/.test(seg) || /^WrongUuid|^QA00|^QA_Platform_/.test(seg) ? ":id" : seg))
    .join("/");
  return `${String(method ?? "").toUpperCase()} ${route}`;
}

function library() {
  if (libCache && Date.now() - libCache.at < 60_000) return libCache;
  const byId = new Map<string, TestCaseRecord>();
  const endpoints = new Map<string, string[]>();
  for (const c of loadCases()) byId.set(c.id, c);
  // The endpoint index also counts held cases (paraphrased bodies): they still
  // prove the endpoint exists, even though their bodies are not sent.
  for (const c of [...loadCases(), ...heldCases()]) {
    if (!c.method || !c.path) continue;
    const k = endpointKey(c.method, c.path);
    const list = endpoints.get(k) ?? [];
    if (list.length < 5) list.push(c.id);
    endpoints.set(k, list);
  }
  libCache = { at: Date.now(), byId, endpoints };
  return libCache;
}

/** The library cases that send this endpoint — the evidence the op is a known, working request. */
export function libraryBasis(method: string, path: string): string[] {
  return library().endpoints.get(endpointKey(method, path)) ?? [];
}

/** Is this library case usable as a plan's act? (reason when not) */
export function libraryCaseProblem(c: TestCaseRecord | undefined): string | undefined {
  if (!c) return "no such library case";
  if (c.notRunnable) return `the library case is held out of runs: ${c.notRunnable}`;
  if (c.bulk) return "it is a vendor bulk-upload case (run by its own runner)";
  // Written cases imported with a generic request: the request does not carry
  // the change the case describes, so it is not a working template for it.
  if (c.weakReason) return "its stored request does not carry the change the case describes (a generic payload)";
  if ((c as { pathSource?: string }).pathSource === "anchor") return "its stored request is only an anchor on the right area, not the case's own request";
  if (!c.method || !c.path) return "the library case has no request";
  if (String(c.method).toUpperCase() === "DELETE") return "DELETE is never sent";
  const p = String(c.path).split("?")[0];
  if (!LIBRARY_DOMAIN.test(p)) return `${c.method} ${p.replace(/\{\{\w+\}\}/g, ":id")} is outside the sourcing-event area a plan may act on`;
  const ph = [...JSON.stringify({ p: c.path, b: c.body ?? null }).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const live = [...new Set(ph.filter((n) => LIVE_RECORD_PLACEHOLDERS.has(n)))];
  if (live.length) return `it needs ${live.map((n) => `{{${n}}}`).join(", ")}, a live business record a plan never touches`;
  const unknown = [...new Set(ph.filter((n) => !PLAN_PLACEHOLDERS.has(n)))];
  if (unknown.length) return `it uses ${unknown.map((n) => `{{${n}}}`).join(", ")}, which no recipe fills`;
  return undefined;
}

/** Library cases closest to the words (title, steps, path, preconditions), usable as acts. */
export function nearestLibraryCases(text: string, k = 6): TestCaseRecord[] {
  const words = new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
  if (!words.size) return [];
  return loadCases()
    .filter((c) => !libraryCaseProblem(c))
    .map((c) => {
      const hay = `${c.title} ${(c.steps ?? []).join(" ")} ${c.path} ${c.preconditions ?? ""} ${c.expectedResult ?? ""}`.toLowerCase().replace(/_/g, " ");
      let s = 0;
      for (const w of words) if (hay.includes(w)) s += /^edge/i.test(c.id) ? 1.1 : 1;
      return { c, s };
    })
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.c);
}
const STOP = new Set(["that", "this", "with", "when", "then", "should", "must", "cannot", "after", "before", "event", "events", "into", "from", "they", "there", "their", "which", "where", "what", "does", "have", "been", "being", "will", "able", "test", "case"]);

// ── the working templates (the journey's body builders) ─────────────────────

let bodiesP: Promise<any> | undefined;
/** `procol test/src/flows/bodies.ts` — pure builders, loaded once. */
export function loadBodies(): Promise<any> {
  bodiesP ??= import(pathToFileURL(join(PROCOL_TEST, "src", "flows", "bodies.ts")).href);
  bodiesP.catch(() => (bodiesP = undefined));
  return bodiesP;
}

export interface BodyArgs {
  eventGroupUuid: string;
  lineItemUuid: string;
  pricingTradeUuid: string;
  technicalTradeUuid?: string;
  vendorCompanyUuid: string;
  vendor2CompanyUuid?: string;
  productUuid: string;
  productQualityUuid: string;
  locationUuid: string;
  pricingTemplateUuid: string;
  technicalTemplateUuid: string;
  evaluatorUuid: string;
  unit: string;
  qty: number;
  price: number;
  stamp: string;
  proposalUuid?: string;
  /** the trade product the bidding vendor reads (bid pricing, surrogate) */
  tradeProduct?: { trade_product_uuid: string; trade_product_id: number; trade_product_category_uuid: string; product_id: number; product_code: string };
  /** the bid total, from the pricing step (for submit) */
  total?: number;
  /** existing draft rounds, in attach order, for publish */
  roundUuids?: string[];
  nowSec: number;
}

/** The working body for an op (never for library/wait/read). */
export function templateBody(B: any, op: OpId, a: BodyArgs): unknown {
  const timing = { bst: a.nowSec, bet: a.nowSec + 1200, ect: a.nowSec + 1205 };
  switch (op) {
    case "create_draft":
      return B.buildEventGroupBody({ productUuid: a.productUuid, quantityUnit: a.unit, quantityValue: a.qty, productQualityUuid: a.productQualityUuid });
    case "add_rfq_round":
      return B.buildPricingStageBody({
        eventGroupUuid: a.eventGroupUuid, lineItemUuid: a.lineItemUuid, vendorCompanyUuid: a.vendorCompanyUuid, pricingTemplateUuid: a.pricingTemplateUuid,
        productUuid: a.productUuid, productQualityUuid: a.productQualityUuid, locationUuid: a.locationUuid, quantityValue: a.qty, quantityUnit: a.unit,
        timing, stageNo: a.technicalTradeUuid ? 2 : 1,
      });
    case "add_rfp_round":
      return B.buildTechnicalStageBody({
        eventGroupUuid: a.eventGroupUuid, lineItemUuid: a.lineItemUuid, evaluatorUuid: a.evaluatorUuid, vendorCompanyUuid: a.vendorCompanyUuid,
        technicalTemplateUuid: a.technicalTemplateUuid, timing, stageNo: 1,
      });
    case "publish_event": {
      const rounds = a.roundUuids?.length ? a.roundUuids : [a.pricingTradeUuid];
      return {
        ...B.buildPublishBody({ title: `QA_Platform_Plan_${a.stamp}`, technicalTradeUuid: rounds[0], pricingTradeUuid: rounds[1] ?? rounds[0], vendorCompanyUuid: a.vendorCompanyUuid }),
        draft_trade_request_uuids: rounds,
      };
    }
    case "update_event":
      return { title: `QA_Platform_Renamed_${a.stamp}` };
    case "withdraw_event":
      return { status: "withdrawn", withdraw_remark: { remarks: `QA_Platform_withdraw_${a.stamp}`, attachments: [] } };
    case "extend_round":
      // one minute past the round's CURRENT bid end, read when the step runs
      return { increase_auction_time: "{{roundEnd+60}}", remarks: `QA_Platform_extend_${a.stamp}` };
    case "add_vendor":
      return { audience_to_add_uuids: [a.vendor2CompanyUuid ?? ""], update_remarks: `QA_Platform_add_${a.stamp}` };
    case "remove_vendor":
      return { audience_to_remove_uuids: [a.vendorCompanyUuid], update_remarks: `QA_Platform_remove_${a.stamp}` };
    case "surrogate_bid":
      return B.buildSurrogateRfqBody({
        pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid, productUuid: a.productUuid, productQualityUuid: a.productQualityUuid,
        locationUuid: a.locationUuid, lineItemUuid: a.lineItemUuid, quantityValue: a.qty, quantityUnit: a.unit, price: a.price, tradeProduct: a.tradeProduct ?? DUMMY_TP,
      });
    case "open_proposal":
      return B.buildProposalBody({ eventGroupUuid: a.eventGroupUuid });
    case "award_vendor": {
      // the bidding matrix's shape: no quantity = the quoted quantity
      const responses: Record<string, unknown> = { [a.vendorCompanyUuid]: { action: "add", egli_data: { [a.lineItemUuid]: { awarded_quantity: a.qty } } } };
      return { responses };
    }
    case "new_version":
      return B.buildItemVersionBody({ eventGroupUuid: a.eventGroupUuid });
    case "clone_event":
      return {};
    case "open_bid":
    case "place_bid":
      return B.buildCreateBid({ pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid });
    case "price_bid":
      return B.buildBidProductsBody({
        pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid, productUuid: a.productUuid, productQualityUuid: a.productQualityUuid,
        locationUuid: a.locationUuid, lineItemUuid: a.lineItemUuid, quantityValue: a.qty, quantityUnit: a.unit, price: a.price, tradeProduct: a.tradeProduct ?? DUMMY_TP,
      }).body;
    case "submit_bid":
      return B.buildSubmitBidBody({ pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid, total: a.total ?? a.price * a.qty });
    case "start_tech_response":
      return B.buildStartTechnicalResponse({ technicalTradeUuid: a.technicalTradeUuid ?? "", vendorCompanyUuid: a.vendorCompanyUuid });
    default:
      return undefined;
  }
}
const DUMMY_TP = { trade_product_uuid: "TP", trade_product_id: 1, trade_product_category_uuid: "TPC", product_id: 1, product_code: "P" };

/** A body with dummy ids, for checking change paths before anything runs. */
async function sampleBody(op: OpId, caseId?: string): Promise<unknown> {
  if (op === "library") return caseId ? library().byId.get(caseId)?.body : undefined;
  if (OPS[op].kind !== "write") return undefined;
  const B = await loadBodies();
  const id = "SAMPLE==";
  return templateBody(B, op, {
    eventGroupUuid: id, lineItemUuid: id, pricingTradeUuid: id, technicalTradeUuid: id, vendorCompanyUuid: id, vendor2CompanyUuid: id, productUuid: id,
    productQualityUuid: id, locationUuid: id, pricingTemplateUuid: id, technicalTemplateUuid: id, evaluatorUuid: id, unit: "KG", qty: 50, price: 100,
    stamp: "1", proposalUuid: id, tradeProduct: DUMMY_TP, total: 5000, roundUuids: [id], nowSec: 1_800_000_000,
  });
}

// ── what read-backs answer with (sampled from real journey replies) ─────────

/**
 * Top-level keys seen in real replies (journey runs on PROCOL DEMO, Oct 2026).
 * A verify path must start with one of these; reads without a sample accept
 * any path, with a warning that the field has not been seen yet.
 */
export const READ_SHAPES: Partial<Record<OpId, string[]>> = {
  read_event: ["uuid", "company", "config", "status", "title", "created_at", "updated_at", "stages", "current_stage_uuid", "is_project_on_hold", "terms_and_conditions_structured", "user_details", "proposals", "ref_uuid", "hide_master_qcs", "all_lots_withdrawn", "withdraw_details", "item_versions", "amendment_remarks", "is_latest_version", "quotation_templates", "contracts_uuids", "owner_trail", "is_scheduled_template", "additional_tabs"],
  read_round: ["uuid", "ref_uuid", "event_flow_version", "layers", "sheets", "title", "description", "status", "order_type", "starting_from", "ending_at", "extra_closing_time", "terms_and_conditions", "misc", "trade_config", "customised_audience", "bid_count", "rfx_mode", "current_status", "created_at", "updated_at", "increase_auction_slot", "auction_config", "order_details", "creator", "participants", "template_uuid", "template_name", "event_group_uuid", "stage_no", "attachments", "event_group", "proposals", "ranking_widgets", "remarks", "alternatives", "pending_unregistered_bids_count"],
};
READ_SHAPES.read_rfp_round = READ_SHAPES.read_round;
READ_SHAPES.read_round_schema = READ_SHAPES.read_round;
/** sub-fields worth naming to the model */
const READ_HINTS: Partial<Record<OpId, string>> = {
  read_event: "title, status (draft|active|withdrawn|in_active), stages[*].status, stages[*].title, stages[*].ending_at, stages[*].extra_closing_time, stages[*].rfx_mode, withdraw_details, proposals",
  read_round: "title (round title), status, current_status, starting_from, ending_at (bid end, epoch s), extra_closing_time, bid_count, rfx_mode, event_group.title (the event's title as this reader sees it), event_group_uuid, participants, customised_audience",
  read_audience: "(shape not sampled yet — use status_2xx / non_empty on the root)",
  read_line_items: "(shape not sampled yet — use status_2xx / non_empty on the root)",
  read_indicators: "auction_identifiers_data.<vendor company uuid>.inline.<line item uuid>.rank.best_bidder",
  list_events: "(a list — use status_2xx)",
};

// ── validation ──────────────────────────────────────────────────────────────

const PATH_RE = /^(?:[A-Za-z_][A-Za-z0-9_]*|\[\d+\]|\[\*\])(?:\.?(?:[A-Za-z_][A-Za-z0-9_<>-]*|\{\{\w+\}\})|\[\d+\]|\[\*\])*$/;
const ASSERT_OPS = new Set<AssertOp>(["status", "status_2xx", "exists", "absent", "equals", "not_equals", "one_of", "contains", "count", "count_gte", "non_empty", "gte", "lte", "type_is", "format"]);
const LIMITS = { acts: 6, verify: 4, asserts: 6, changes: 8 };

function tokensIn(v: unknown): string[] {
  return [...JSON.stringify(v ?? null).matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
}

/** Does `path` resolve in `body`? (for set/remove; `add` needs only the parent) */
function pathResolves(body: unknown, path: string, parentOnly: boolean): boolean {
  const toks = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  const steps = parentOnly ? toks.slice(0, -1) : toks;
  let node: any = body;
  for (const t of steps) {
    if (node === null || typeof node !== "object") return false;
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(t) || Number(t) >= node.length) return false;
      node = node[Number(t)];
    } else {
      // A library body may key by a placeholder ("{{vendorUuid}}": …): a path may name it.
      if (!(t in node)) return false;
      node = node[t];
    }
  }
  return parentOnly ? node !== null && typeof node === "object" : true;
}

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  plan: ApiPlan;
}

/**
 * Check a plan against the vocabulary. Unknown recipe, op, actor, field,
 * placeholder, assertion op or code → an error (the plan is not runnable);
 * smaller doubts → warnings. Normalises defaults (actors, decisive step).
 */
export async function validatePlan(raw: unknown): Promise<Validation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<ApiPlan>;
  const recipeId = (p.setup as any)?.recipe as RecipeId;
  const recipe = RECIPES[recipeId];
  if (!recipe) errors.push(`unknown setup recipe "${String(recipeId)}" (known: ${Object.keys(RECIPES).join(", ")})`);
  const acts: ActStep[] = Array.isArray(p.act) ? (p.act as ActStep[]) : [];
  const verify: VerifyStep[] = Array.isArray(p.verify) ? (p.verify as VerifyStep[]) : [];
  if (!acts.length && !verify.length) errors.push("the plan has no act and no verify step");
  if (acts.length > LIMITS.acts) errors.push(`at most ${LIMITS.acts} act steps (got ${acts.length})`);
  if (verify.length > LIMITS.verify) errors.push(`at most ${LIMITS.verify} verify steps (got ${verify.length})`);
  const outcome = (p.expected as any)?.outcome as Outcome;
  if (!["accept", "reject", "no-5xx"].includes(outcome)) errors.push(`expected.outcome must be accept, reject or no-5xx (got "${String(outcome)}")`);
  let code = (p.expected as any)?.code !== undefined && (p.expected as any)?.code !== null && (p.expected as any)?.code !== "" ? String((p.expected as any).code) : undefined;
  let message = typeof (p.expected as any)?.message === "string" ? (p.expected as any).message : undefined;
  if (code !== undefined) {
    if (!/^\d{1,5}$/.test(code)) {
      errors.push(`expected.code "${code}" is not an app error code`);
    } else {
      const m = errorMessage(code);
      if (m) message = m;
      else warnings.push(`error code ${code} is not in en-IN.yml (or the backend checkout is missing) — the message cannot be checked`);
    }
    if (outcome !== "reject") warnings.push("an error code only applies to an expected refusal; it is ignored");
  }

  const have = new Set<string>(recipe?.provides ?? []);
  const normActs: ActStep[] = [];
  for (let i = 0; i < acts.length; i++) {
    const src = (acts[i] ?? {}) as ActStep & { until?: string; price?: number };
    // only the language's own keys survive (a stray top-level "until"/"price" is moved into params)
    const a: ActStep = {
      op: src.op,
      ...(src.as !== undefined ? { as: src.as } : {}),
      ...(src.caseId !== undefined ? { caseId: src.caseId } : {}),
      ...(src.change !== undefined ? { change: src.change } : {}),
      ...(src.params !== undefined || src.until !== undefined || src.price !== undefined
        ? { params: { ...(src.params ?? {}), ...(src.until !== undefined ? { until: src.until as "close" } : {}), ...(src.price !== undefined ? { price: src.price } : {}) } }
        : {}),
      ...(src.expect !== undefined ? { expect: src.expect } : {}),
      ...(src.decisive !== undefined ? { decisive: !!src.decisive } : {}),
      ...(src.ifRefused !== undefined ? { ifRefused: src.ifRefused } : {}),
      ...(src.say !== undefined ? { say: String(src.say).slice(0, 200) } : {}),
    };
    const n = i + 1;
    const op = OPS[a.op as OpId];
    if (!op) {
      errors.push(`act ${n}: unknown operation "${String(a.op)}"`);
      normActs.push(a);
      continue;
    }
    a.as = (a.as ?? op.actor) as ActorId;
    if (!op.actors.includes(a.as)) errors.push(`act ${n}: ${a.op} cannot be sent as ${a.as} (allowed: ${op.actors.join(", ")})`);
    if (a.as === "vendor" && recipe && recipe.vendors < 1 && recipe.id !== "none") warnings.push(`act ${n}: the vendor is not invited to this setup — it acts as an outsider`);
    if (a.as === "vendor2" && recipe && recipe.vendors < 2 && !normActs.some((x) => x.op === "add_vendor")) warnings.push(`act ${n}: QA vendor 2 is not invited in this setup — it acts as an uninvited vendor`);
    let needs = [...op.needs];
    let body: unknown;
    if (a.op === "library") {
      const c = a.caseId ? library().byId.get(a.caseId) : undefined;
      const problem = libraryCaseProblem(c);
      if (problem) errors.push(`act ${n}: library case ${a.caseId ?? "(none)"}: ${problem}`);
      if (c) {
        needs = [...new Set(tokensIn({ p: c.path, b: c.body }).filter((t) => PLAN_PLACEHOLDERS.has(t)))];
        body = c.body;
      }
    } else {
      body = await sampleBody(a.op as OpId).catch(() => undefined);
    }
    if (a.op === "wait") {
      if (!recipe || recipe.eventType === null) errors.push(`act ${n}: there is no round to wait for in this setup`);
      const u = a.params?.until ?? "close";
      if (!["bid_end", "close"].includes(u)) errors.push(`act ${n}: wait.until must be bid_end or close`);
      a.params = { ...(a.params ?? {}), until: u };
      if (recipe?.clock === "long" && !normActs.some((x) => x.op === "extend_round")) warnings.push(`act ${n}: the setup's round is open for about 20 minutes; the wait is capped at 6 minutes and the step after it may still run while bidding is open — use a *_short or closed_* setup`);
    }
    for (const need of needs) {
      if (!have.has(need)) {
        const by = ACT_PRODUCES[need];
        errors.push(
          `act ${n}: ${a.op === "library" ? `library case ${a.caseId}` : a.op} needs {{${need}}}, which ${recipe ? `setup "${recipe.id}"` : "the setup"} does not provide${by ? ` (an earlier ${by.join(" / ")} step would)` : ""}`,
        );
      }
    }
    if (a.params?.vendor && !["vendor", "vendor2"].includes(a.params.vendor)) errors.push(`act ${n}: params.vendor must be vendor or vendor2`);
    if (a.params?.round !== undefined) {
      if (!["pricing", "technical"].includes(a.params.round)) errors.push(`act ${n}: params.round must be pricing or technical`);
      else if (!op.path.includes("{{tradeId}}") && a.op !== "wait") errors.push(`act ${n}: ${a.op} does not act on a round, so params.round does not apply`);
      else if (a.params.round === "technical" && !have.has("rfpTradeId")) errors.push(`act ${n}: there is no technical round in setup "${recipe?.id}"`);
    }
    if (a.params?.price !== undefined && !(typeof a.params.price === "number" && Number.isFinite(a.params.price))) errors.push(`act ${n}: params.price must be a number`);
    // A price is a parameter of the bid builders, not a body field: a change
    // that sets "price" on a bid step is read as params.price.
    if (["price_bid", "place_bid", "surrogate_bid"].includes(a.op) && Array.isArray(a.change)) {
      const pc = a.change.find((c) => /(^|\.)price(\.value)?$/.test(String(c?.path)) && typeof c?.set === "number");
      if (pc) {
        a.params = { ...(a.params ?? {}), price: pc.set as number };
        a.change = a.change.filter((c) => c !== pc);
        warnings.push(`act ${n}: the price change was read as params.price`);
      }
      if (!a.change.length) delete a.change;
    }
    const changes = Array.isArray(a.change) ? a.change : [];
    if (changes.length > LIMITS.changes) errors.push(`act ${n}: at most ${LIMITS.changes} changes`);
    if (changes.length && op.kind !== "write") errors.push(`act ${n}: ${a.op} sends no body, so it cannot be changed`);
    if (changes.length && a.op === "place_bid") errors.push(`act ${n}: place_bid is three requests — change open_bid / price_bid / submit_bid instead`);
    for (const ch of changes) {
      if (!ch || typeof ch.path !== "string" || !PATH_RE.test(ch.path)) {
        errors.push(`act ${n}: change path "${String(ch?.path)}" is not a field path`);
        continue;
      }
      if (ch.remove && ch.set !== undefined) errors.push(`act ${n}: change ${ch.path} both sets and removes`);
      if (!ch.remove && !("set" in ch)) errors.push(`act ${n}: change ${ch.path} neither sets nor removes`);
      if (body !== undefined && !pathResolves(body, ch.path, !!ch.add)) {
        errors.push(`act ${n}: ${ch.add ? "the parent of " : ""}"${ch.path}" is not a field of ${a.op === "library" ? `${a.caseId}'s` : `the ${a.op}`} body${ch.add ? "" : " (use add:true for a new field)"}`);
      }
      for (const t of tokensIn(ch.set)) {
        const actRef = t.match(ACT_TOKEN);
        if (TIME_TOKEN.test(t)) continue;
        if (actRef) {
          if (Number(actRef[1]) >= n || Number(actRef[1]) < 1) errors.push(`act ${n}: {{${t}}} refers to a step that has not run yet`);
          continue;
        }
        if (!PLAN_PLACEHOLDERS.has(t)) errors.push(`act ${n}: unknown placeholder {{${t}}}`);
        else if (!have.has(t)) errors.push(`act ${n}: {{${t}}} is not provided by the setup or an earlier act`);
      }
      // Sandbox naming: any title/name we set is a QA record.
      if (/(^|\.)(title|name)$/.test(ch.path) && typeof ch.set === "string" && ch.set.trim() && !/^(QA_Platform_|API_Test_)/.test(ch.set) && !/[<>]|drop table|select .* from/i.test(ch.set) && ch.set.length < 200) {
        ch.set = `QA_Platform_${ch.set}`;
        warnings.push(`act ${n}: the title was prefixed QA_Platform_ (sandbox naming)`);
      }
    }
    if (a.expect !== undefined && !["accept", "reject", "no-5xx"].includes(a.expect)) errors.push(`act ${n}: expect must be accept, reject or no-5xx`);
    if (a.ifRefused !== undefined && !["pass", "inconclusive", "continue"].includes(a.ifRefused)) errors.push(`act ${n}: ifRefused must be pass, inconclusive or continue`);
    for (const pr of op.produces) have.add(pr);
    if (a.op === "add_vendor") have.add("vendor2Uuid");
    normActs.push(a);
  }
  // the decisive act: the one marked, else the last that is not a wait
  if (normActs.length && !normActs.some((a) => a.decisive)) {
    const last = [...normActs].reverse().find((a) => a.op !== "wait");
    if (last) last.decisive = true;
  }
  if (normActs.filter((a) => a.decisive).length > 1) errors.push("only one act can be the decisive one");
  // A wait is capped at 6 minutes: an extension before it must stay inside that.
  const waitAt = normActs.findIndex((a) => a.op === "wait");
  if (waitAt > 0)
    for (const [i, a] of normActs.slice(0, waitAt).entries()) {
      if (a.op !== "extend_round") continue;
      const v = String(a.change?.find((c) => c.path === "increase_auction_time")?.set ?? "{{roundEnd+60}}");
      const m = v.match(/^\{\{(now|roundEnd|roundClose|rfpEnd)([+-]\d+)?\}\}$/);
      const secs = m ? Number(m[2] ?? 0) : NaN;
      if (!m || secs > 240) errors.push(`act ${i + 1}: a later wait is capped at 6 minutes, so extend by at most 4 minutes past the round's end (use {{roundEnd+60}} … {{roundEnd+240}})`);
    }
  if (!normActs.length && outcome && outcome !== "accept") warnings.push("a plan with only read-backs is judged by its assertions; the expected outcome is treated as accept");

  const normVerify: VerifyStep[] = [];
  for (let i = 0; i < verify.length; i++) {
    const v = { ...verify[i] } as VerifyStep;
    const n = i + 1;
    const op = OPS[v.op as OpId];
    if (!op || op.kind !== "read") {
      errors.push(`verify ${n}: "${String(v.op)}" is not a read-back (use one of: ${Object.values(OPS).filter((o) => o.kind === "read").map((o) => o.id).join(", ")})`);
      normVerify.push(v);
      continue;
    }
    v.as = (v.as ?? op.actor) as ActorId;
    if (!op.actors.includes(v.as)) errors.push(`verify ${n}: ${v.op} cannot be read as ${v.as}`);
    for (const need of op.needs) if (!have.has(need)) errors.push(`verify ${n}: ${v.op} needs {{${need}}}, which nothing provides`);
    const asserts = Array.isArray(v.assert) ? v.assert : [];
    if (!asserts.length) errors.push(`verify ${n}: no assertions`);
    if (asserts.length > LIMITS.asserts) errors.push(`verify ${n}: at most ${LIMITS.asserts} assertions`);
    const shape = READ_SHAPES[v.op as OpId];
    for (const as of asserts) {
      if (!as || !ASSERT_OPS.has(as.op)) {
        errors.push(`verify ${n}: unknown assertion op "${String(as?.op)}"`);
        continue;
      }
      if (as.op === "status" && !(typeof as.value === "number" && as.value >= 100 && as.value < 600)) errors.push(`verify ${n}: status needs an HTTP status number`);
      if (as.op === "status" || as.op === "status_2xx") continue;
      if (typeof as.path !== "string" || !(as.path === "" || as.path === "$" || PATH_RE.test(as.path))) {
        errors.push(`verify ${n}: "${String(as.path)}" is not a field path`);
        continue;
      }
      for (const t of [...as.path.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))
        if (!have.has(t)) errors.push(`verify ${n}: the path uses {{${t}}}, which nothing provides`);
      const top = as.path.replace(/^\$\.?/, "").split(/[.[]/)[0];
      if (shape && top && !shape.includes(top)) errors.push(`verify ${n}: "${as.path}" — ${v.op} replies have no "${top}" field (seen: ${shape.slice(0, 14).join(", ")}…)`);
      if (!shape && top) warnings.push(`verify ${n}: ${v.op}'s reply shape has not been sampled; "${as.path}" is unverified`);
      if (["equals", "not_equals", "contains"].includes(as.op) && as.value === undefined) errors.push(`verify ${n}: ${as.op} needs a value`);
      if (as.op === "one_of" && !Array.isArray(as.value)) errors.push(`verify ${n}: one_of needs a list`);
      if (["count", "count_gte", "gte", "lte"].includes(as.op) && typeof as.value !== "number") errors.push(`verify ${n}: ${as.op} needs a number`);
      if (as.op === "format" && !FORMATS[String(as.value)]) errors.push(`verify ${n}: unknown format "${String(as.value)}" (known: ${Object.keys(FORMATS).join(", ")})`);
      if (as.op === "type_is" && !(Array.isArray(as.value) ? as.value : [as.value]).every((t) => ["string", "number", "boolean", "object", "array", "null"].includes(String(t)))) errors.push(`verify ${n}: type_is needs JSON type names`);
      for (const t of tokensIn(as.value)) {
        const ar = t.match(ACT_TOKEN);
        if (ar) {
          if (Number(ar[1]) < 1 || Number(ar[1]) > normActs.length) errors.push(`verify ${n}: {{${t}}} refers to an act that does not exist`);
        } else if (!TIME_TOKEN.test(t) && !have.has(t)) errors.push(`verify ${n}: {{${t}}} is not provided`);
      }
    }
    normVerify.push({ ...v, assert: asserts });
  }

  const plan: ApiPlan = {
    version: PLAN_VERSION,
    ...(p.caseId ? { caseId: String(p.caseId) } : {}),
    title: typeof p.title === "string" && p.title.trim() ? p.title.trim().slice(0, 200) : "API plan",
    setup: { recipe: recipeId },
    act: normActs,
    verify: normVerify,
    expected: {
      outcome: outcome ?? "no-5xx",
      ...(code && outcome === "reject" ? { code } : {}),
      ...(message && outcome === "reject" ? { message } : {}),
      ...(code && outcome === "reject" && (p.expected as any)?.codeInferred === true ? { codeInferred: true } : {}),
    },
    ...(typeof p.dependsOnSetting === "string" && p.dependsOnSetting.trim() ? { dependsOnSetting: p.dependsOnSetting.trim().slice(0, 240) } : {}),
  };
  return { ok: errors.length === 0, errors, warnings, plan };
}

/** The endpoints a plan sends, "METHOD /route/:id", in order (waits and library-less ops resolved). */
export function planEndpoints(plan: ApiPlan): { all: string[]; decisive?: string } {
  const all: string[] = [];
  let decisive: string | undefined;
  const ep = (a: { op: OpId; caseId?: string }): string[] => {
    if (a.op === "wait") return [];
    if (a.op === "library") {
      const c = a.caseId ? library().byId.get(a.caseId) : undefined;
      return c ? [endpointKey(c.method, c.path)] : [];
    }
    if (a.op === "place_bid") return ["POST /v1/bids", "POST /v1/bids/:id/create_bid_products", "PATCH /v1/bids/:id"];
    const o = OPS[a.op];
    return o ? [endpointKey(o.method, o.path)] : [];
  };
  for (const a of plan.act) {
    const e = ep(a);
    all.push(...e);
    if (a.decisive) decisive = a.op === "place_bid" ? e.join(" + ") : e[0];
  }
  for (const v of plan.verify) all.push(...ep(v));
  return { all, decisive };
}

// ── human wording of a plan (what a person reads) ───────────────────────────

const ACTOR_WORD: Record<ActorId, string> = { buyer: "the buyer", vendor: "the invited QA vendor", vendor2: "a second QA vendor" };
const OUTCOME_WORD: Record<Outcome, string> = { accept: "it is accepted", reject: "it is refused", "no-5xx": "the app answers without a server error" };

function changeWords(ch: Change[] | undefined): string {
  if (!ch?.length) return "";
  const one = (c: Change) => {
    const field = c.path.split(".").pop()!.replace(/\[\d+\]$/, "").replace(/_/g, " ");
    if (c.remove) return `without the ${field}`;
    const v = c.set;
    if (v === null) return `with the ${field} empty (null)`;
    if (Array.isArray(v)) return v.length ? `with ${v.length} ${field}` : `with no ${field}`;
    if (typeof v === "string") {
      if (/\{\{now-/.test(v) || /\{\{roundEnd-/.test(v)) return `with the ${field} in the past`;
      if (/\{\{(now|roundEnd|roundClose)/.test(v)) return `with the ${field} moved later`;
      if (!v.trim()) return `with the ${field} left blank`;
      return `with the ${field} set to “${v.replace(/\{\{\w+\}\}/g, "…").slice(0, 40)}”`;
    }
    if (typeof v === "number") return `with the ${field} ${v}`;
    if (typeof v === "string" && /^\{\{(now|roundEnd|roundClose|rfpEnd)\+(\d+)\}\}$/.test(v)) return `with the ${field} moved later`;
    return `with a changed ${field}`;
  };
  return ` ${ch.map(one).join(", ")}`;
}

export function actInWords(a: ActStep): string {
  if (a.say) return a.say;
  const who = ACTOR_WORD[a.as ?? OPS[a.op]?.actor ?? "buyer"];
  if (a.op === "wait") return a.params?.until === "bid_end" ? "Wait until the round's bid end time has passed." : "Wait until the round has closed (bid end and extra closing time over).";
  if (a.op === "library") {
    const c = a.caseId ? library().byId.get(a.caseId) : undefined;
    const what = c ? endpointInWords(c.method, c.path) : "the request";
    return `${who.charAt(0).toUpperCase()}${who.slice(1)} sends ${what}, exactly as the matching library case writes it${changeWords(a.change)}.`;
  }
  let verb = OPS[a.op]?.does ?? a.op;
  if (a.params?.round) verb = verb.replace(/\bthe (live )?round\b|the round's|the pricing round/, (m) => (a.params!.round === "technical" ? m.replace(/round|pricing round/, "technical round") : m.replace(/\bround\b/, "pricing round").replace("pricing pricing", "pricing")));
  const forWho = a.params?.vendor ? ` for ${ACTOR_WORD[a.params.vendor]}` : "";
  return `As ${who}, ${verb.replace(/^(\w)/, (m) => m)}${forWho}${changeWords(a.change)}.`.replace(/^As the buyer, /, "The buyer ").replace(/^As (the invited QA vendor|a second QA vendor), /, (_m, w) => `${w.charAt(0).toUpperCase()}${w.slice(1)} `);
}

function assertWords(a: Assertion): string {
  if (a.say) return a.say;
  const f = a.path ? `“${a.path.replace(/\[\*\]/g, "").replace(/\{\{vendor2Uuid\}\}/g, "QA vendor 2").replace(/\{\{vendorUuid\}\}/g, "QA vendor 1").replace(/\{\{lineItemUuid\}\}/g, "the line").replace(/\{\{\w+\}\}/g, "…").replace(/_/g, " ").replace(/\./g, " › ")}”` : "the reply";
  const v = typeof a.value === "string" ? a.value.replace(/\{\{act(\d)\.body\.([\w.]+)\}\}/, (_m, n, k) => `the ${k.replace(/_/g, " ")} sent in step ${n}`) : JSON.stringify(a.value);
  switch (a.op) {
    case "status": return `the read answers HTTP ${a.value}`;
    case "status_2xx": return "the read succeeds";
    case "exists": return `${f} is present`;
    case "absent": return `${f} is absent`;
    case "equals": return `${f} equals ${v}`;
    case "not_equals": return `${f} is not ${v}`;
    case "one_of": return `${f} is one of ${(a.value as unknown[]).join(" / ")}`;
    case "contains": return `${f} contains ${v}`;
    case "count": return `${f} has exactly ${a.value} entries`;
    case "count_gte": return `${f} has at least ${a.value} entries`;
    case "non_empty": return `${f} is not empty`;
    case "gte": return `${f} is at least ${a.value}`;
    case "lte": return `${f} is at most ${a.value}`;
    case "type_is": return `${f} is a ${Array.isArray(a.value) ? a.value.join(" or ") : a.value}`;
    case "format": return `${f} is ${FORMATS[String(a.value)]?.words ?? a.value}`;
  }
  return `${f} ${a.op}`;
}

/** "reads the event" → "read the event" */
function imperative(does: string): string {
  return does.replace(/^(\w+?)(es|s)\b/, (_m, stem: string, end: string) => (end === "es" && /(sh|ch|ss|x)$/.test(stem) ? stem : end === "es" ? `${stem}e` : stem));
}

export function verifyInWords(v: VerifyStep): string {
  if (v.say) return v.say;
  const who = ACTOR_WORD[v.as ?? "buyer"];
  return `As ${who}, ${imperative(OPS[v.op]?.does ?? v.op)} and check that ${v.assert.map(assertWords).join("; ")}.`;
}

export function planInWords(plan: ApiPlan): { preconditions: string; steps: string[]; expected: string } {
  const r = RECIPES[plan.setup.recipe];
  const steps = [...plan.act.map(actInWords), ...plan.verify.map(verifyInWords)];
  const decisive = plan.act.find((a) => a.decisive);
  let expected =
    plan.expected.outcome === "reject"
      ? `The app refuses ${decisive ? "the step the case is about" : "it"}${plan.expected.message ? ` with “${plan.expected.message}”` : " with a clear message"}, and never with a server error.`
      : plan.expected.outcome === "accept"
        ? "The app accepts it."
        : "The app answers cleanly — accepted or refused — but never with a server error.";
  if (plan.verify.length) expected += ` Read back afterwards: ${plan.verify.flatMap((v) => v.assert.map(assertWords)).join("; ")}.`;
  return { preconditions: r?.title ?? "", steps, expected };
}

// ── compiling: library case (no model) ──────────────────────────────────────

/** A library case's preconditions → the recipe that builds that state. */
export function recipeForLibraryCase(c: TestCaseRecord): { recipe: RecipeId; actor: ActorId; gaps: string[]; arrange: ActStep[]; unbuilt?: string; setting?: string } {
  const pre = `${c.preconditions ?? ""} ${c.title}`.toLowerCase();
  const gaps: string[] = [];
  const arrange: ActStep[] = [];
  const ph = new Set([...JSON.stringify({ p: c.path, b: c.body ?? null }).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  const hasRfp = ph.has("rfpTradeId") || ph.has("templateResponseUuid") || /\brfp\b|technical (stage|round)|template response|evaluat/.test(pre);
  const needsBid = ph.has("bidUuid") || /(active|submitted|placed|existing|valid|has (a|an)) bids?\b|bid (from|placed)|already (bid|placed)|with bids/.test(pre);
  const needsAward = ph.has("proposalUuid") || /award|proposal|selected/.test(pre);
  const closed = /closed|window (is )?over|has passed|passed its|after the (window|close|bid end)|expired|evaluation (time|window)|bid_end_time has/.test(pre);
  const eventScoped = ["eventGroupUuid", "tradeId", "lineItemUuid", "rfpTradeId", "bidUuid", "proposalUuid", "templateResponseUuid", "evalFormUuid"].some((k) => ph.has(k));
  let recipe: RecipeId;
  if (!eventScoped) recipe = "none";
  else if (/no stage|without (a )?stage|no rounds?\b|but no stage/.test(pre)) recipe = "draft_event";
  else if (/\bdraft\b/.test(pre) && !/not (a )?draft|no longer|draft (bid|proposal)/.test(pre)) recipe = hasRfp ? "draft_rfp_rfq" : "draft_rfq";
  else if (needsAward) recipe = "awarded_rfq";
  else if (closed) recipe = hasRfp ? "closed_rfp_rfq_with_tech_response" : needsBid ? "closed_rfq_with_bid" : "closed_rfq";
  else if (needsBid) recipe = "rfq_with_bid";
  else if (/technical response|template response|responded/.test(pre) || ph.has("templateResponseUuid")) recipe = "rfp_rfq_with_tech_response";
  else if (hasRfp) recipe = "published_rfp_rfq";
  else recipe = "published_rfq";
  if (/withdrawn/.test(pre) && !/not withdrawn/.test(pre)) {
    arrange.push({ op: "withdraw_event", as: "buyer", expect: "accept", say: "The buyer withdraws the event first (with a remark)." });
  }
  const actor: ActorId = /signed in as (the |an )?(invited )?vendor|session: the invited vendor|caller is (a|the invited) vendor|as the vendor/.test(pre)
    ? "vendor"
    : /not on the (\w+ )?audience|uninvited|not invited|outside the audience/.test(pre) && /vendor/.test(pre)
      ? "vendor2"
      : "buyer";
  let setting: string | undefined;
  if (/config-dependent|gate:|config:|setting|workspace whose|company (does not|has)|has config/.test(pre)) {
    setting = (c.preconditions ?? "").match(/(?:config(?:-dependent)?|gate):?\s*([^.;]{3,140})/i)?.[1]?.trim() ?? "a company setting";
    gaps.push("it depends on a company setting this run does not change — a failure is reported as couldn't tell, not as a bug");
  }
  // A starting state more specific than any recipe (times, counts, a field set a certain way) is not built.
  const unbuilt = (c.preconditions ?? "").match(/[^.;]*\b(whose|where (the|its)|created with|later than|earlier than|in the past|more than|at least \d|exactly \d|set to|with config|configured)\b[^.;]*/i)?.[0]?.trim();
  if (/second buyer|another buyer|not the event's owner/.test(pre)) gaps.push("it needs a second buyer user, which no recipe signs in");
  if (/blacklist/.test(pre)) gaps.push("it needs a blacklisted vendor, which a plan never creates");
  if (/purchase request|from a pr\b/.test(pre)) gaps.push("it needs an event created from a purchase request");
  return { recipe, actor, gaps, arrange, ...(unbuilt ? { unbuilt } : {}), ...(setting ? { setting } : {}) };
}

/**
 * A successful write to the event or a round is read back: every scalar the
 * request sent that the read reply carries must come back as sent. Added only
 * for an expected success, and only for fields seen in real replies.
 */
function autoReadBack(c: TestCaseRecord): VerifyStep[] {
  if (c.expected !== "accept" || !c.body || typeof c.body !== "object" || Array.isArray(c.body)) return [];
  const key = endpointKey(c.method, c.path);
  const read: OpId | undefined = key === "PATCH /event_groups/:id" ? "read_event" : key === "PATCH /trade/:id" ? "read_round" : undefined;
  if (!read) return [];
  const shape = READ_SHAPES[read] ?? [];
  const asserts: Assertion[] = Object.entries(c.body as Record<string, unknown>)
    .filter(([k, v]) => shape.includes(k) && v !== null && typeof v !== "object" && !(typeof v === "string" && /\{\{/.test(v) && !/\{\{stamp\}\}/.test(v)))
    .slice(0, 4)
    .map(([k]) => ({ path: k, op: "equals" as const, value: `{{act1.body.${k}}}` }));
  return asserts.length ? [{ op: read, as: "buyer", assert: asserts }] : [];
}

/** Pull "code 712" out of a library expected result. */
function codeIn(text: string | undefined): string | undefined {
  const m = String(text ?? "").match(/\b(?:error\.)?code\s+(\d{1,5})\b|\((\d{1,5})\)/i);
  return m?.[1] ?? m?.[2];
}

export async function planFromLibraryCase(c: TestCaseRecord, caseId?: string): Promise<{ plan: ApiPlan; gaps: string[]; unbuilt?: string }> {
  const { recipe, actor, gaps, arrange, unbuilt, setting } = recipeForLibraryCase(c);
  const code = c.expected === "reject" ? codeIn(c.expectedResult) : undefined;
  const plan: ApiPlan = {
    version: PLAN_VERSION,
    caseId: caseId ?? c.id,
    title: c.title.replace(/^QA_Platform_/, "").replace(/_/g, " "),
    setup: { recipe },
    act: [...arrange, { op: "library", caseId: c.id, as: actor, decisive: true }],
    verify: [],
    expected: { outcome: c.expected, ...(code ? { code } : {}) },
    ...(setting ? { dependsOnSetting: setting } : {}),
  };
  plan.verify = autoReadBack(c);
  if (c.weakReason) gaps.push(`the library case is only a crash check: ${c.weakReason}`);
  if (c.expected === "no-5xx" && /should be|must be 422|ideally/i.test(c.expectedResult)) gaps.push("the documented correct behaviour is a refusal, but the case checks only that the app does not crash (it records today's behaviour)");
  return { plan, gaps, ...(unbuilt ? { unbuilt } : {}) };
}

// ── compiling: a few deterministic rules (used when no model is available) ──

interface Rule {
  re: RegExp;
  plan: (m: RegExpMatchArray, t: string) => Omit<ApiPlan, "version" | "title">;
  covers?: "full" | "partial";
}
const RULES: Rule[] = [
  {
    re: /(?=.*\bextend)(?=.*clos\w* again|.*after .*(?:new|extended) (?:deadline|end|close))(?=.*\bbid)/,
    plan: () => ({
      setup: { recipe: "published_rfq_short" },
      act: [
        { op: "extend_round", change: [{ path: "increase_auction_time", set: "{{roundEnd+60}}" }], expect: "accept", say: "The buyer extends the bid end by one minute." },
        { op: "wait", params: { until: "close" } },
        { op: "place_bid", as: "vendor", decisive: true },
      ],
      verify: [{ op: "read_round", as: "buyer", assert: [{ path: "bid_count", op: "equals", value: 0 }] }],
      expected: { outcome: "reject", code: "33" },
    }),
  },
  {
    re: /(?=.*\bbid)(?=.*\b(after|past|once)\b.*\b(deadline|close[ds]?|bid end|end time|window|expir\w*)\b)/,
    plan: () => ({
      setup: { recipe: "closed_rfq" },
      act: [{ op: "place_bid", as: "vendor", decisive: true }],
      verify: [],
      expected: { outcome: "reject", code: "33" },
    }),
  },
  {
    re: /(?=.*\b(title|rename\w*)\b)(?=.*\b(edit\w*|chang\w*|updat\w*|renam\w*)\b)/,
    plan: (_m, t) => ({
      setup: { recipe: /draft/.test(t) ? "draft_rfq" : "published_rfq" },
      act: [{ op: "update_event", decisive: true }],
      verify: [
        /vendor/.test(t)
          ? { op: "read_round", as: "vendor", assert: [{ path: "event_group.title", op: "equals", value: "{{act1.body.title}}" }] }
          : { op: "read_event", as: "buyer", assert: [{ path: "title", op: "equals", value: "{{act1.body.title}}" }] },
      ],
      expected: { outcome: "accept" },
    }),
  },
  {
    re: /(?=.*\bpublish)(?=.*\b(no|without|zero|empty)\b.*\b(line items?|items?|products?)\b)/,
    plan: () => ({
      setup: { recipe: "draft_event" },
      act: [
        { op: "add_rfq_round", change: [{ path: "data", set: [] }], expect: "no-5xx", ifRefused: "pass", say: "The buyer adds a pricing round whose template carries no line items." },
        { op: "publish_event", decisive: true },
      ],
      verify: [{ op: "read_event", assert: [{ path: "status", op: "equals", value: "draft" }] }],
      expected: { outcome: "reject" },
    }),
  },
  {
    re: /(?=.*\bpublish)(?=.*\b(no|without|zero)\b.*\b(rounds?|stages?)\b)/,
    plan: () => ({
      setup: { recipe: "draft_event" },
      act: [{ op: "publish_event", change: [{ path: "draft_trade_request_uuids", set: [] }], decisive: true }],
      verify: [{ op: "read_event", assert: [{ path: "status", op: "equals", value: "draft" }] }],
      expected: { outcome: "reject" },
    }),
  },
  {
    re: /(?=.*\bwithdraw)(?=.*\b(without|no|blank|empty)\b.*\b(remark|reason)s?\b)/,
    plan: () => ({
      setup: { recipe: "published_rfq" },
      act: [{ op: "withdraw_event", change: [{ path: "withdraw_remark.remarks", set: "" }], decisive: true }],
      verify: [{ op: "read_event", assert: [{ path: "status", op: "equals", value: "active" }] }],
      expected: { outcome: "reject" },
    }),
  },
  {
    re: /(?=.*\bwithdr\w*)(?=.*\bbid)/,
    plan: () => ({
      setup: { recipe: "published_rfq" },
      act: [{ op: "withdraw_event", expect: "accept" }, { op: "place_bid", as: "vendor", decisive: true }],
      verify: [],
      expected: { outcome: "reject" },
    }),
  },
  {
    re: /(?=.*\b(uninvited|not invited)\b)(?=.*\b(read|see|open|view)\b)/,
    plan: () => ({ setup: { recipe: "published_rfq" }, act: [{ op: "read_round", as: "vendor2", decisive: true } as unknown as ActStep], verify: [], expected: { outcome: "reject", code: "536" } }),
  },
];

function rulesPlan(text: string): { plan: Omit<ApiPlan, "version" | "title">; rule: number } | null {
  const t = text.toLowerCase();
  for (let i = 0; i < RULES.length; i++) {
    const m = t.match(RULES[i].re);
    if (m) return { plan: RULES[i].plan(m, t), rule: i };
  }
  return null;
}

// ── compiling: the model (fast tier; reason tier once, if allowed) ──────────

function vocabularyPrompt(cands: TestCaseRecord[]): string {
  const recipes = Object.values(RECIPES).map((r) => `  ${r.id}: ${r.title}`).join("\n");
  const ops = Object.values(OPS)
    .map((o) => `  ${o.id} [${o.kind}${o.method ? ` ${o.method}` : ""}${o.actors.length ? `; as ${o.actors.join("|")}` : ""}]: ${o.does}${o.needs.length ? `; needs ${o.needs.join(",")}` : ""}${o.produces.length ? `; gives ${o.produces.join(",")}` : ""}`)
    .join("\n");
  const shapes = Object.entries(READ_HINTS).map(([k, v]) => `  ${k}: ${v}`).join("\n");
  const lib = cands
    .map((c) => `  - ${c.id} (${c.title.replace(/^QA_Platform_/, "").replace(/_/g, " ")}): ${c.method} ${c.path} body=${JSON.stringify(c.body ?? null).slice(0, 260)} | expected ${c.expected}: ${String(c.expectedResult ?? "").slice(0, 140)} | pre: ${String(c.preconditions ?? "").slice(0, 120)}`)
    .join("\n");
  return `SETUP RECIPES (pick exactly one; each builds a FRESH record):
${recipes}

OPERATIONS (act steps; reads are also verify steps):
${ops}
  Body field paths you may change (dotted): create_draft: line_items[0].quantity.value, line_items[0].quantity.unitSymbol, line_items[0].product_uuid, status, title(add:true)
  add_rfq_round / add_rfp_round: data (the round template's line items; set [] for "a template with no line items"), data[0].creator_quantity.value, configurations.bid_start_time, configurations.bid_end_time, configurations.extra_closing_time, configurations.title, audience_company_uuids
  publish_event: title, draft_trade_request_uuids, audience_company_uuids, attachments, terms_and_conditions.clauses
  update_event: title (default "QA_Platform_Renamed_{{stamp}}"); other keys need add:true
  withdraw_event: withdraw_remark.remarks, status
  extend_round: increase_auction_time (epoch seconds; default now+600), remarks
  price_bid: (use params.price instead)  open_bid: trade_request_uuid, company_uuid
  library: the named case's own body keys
  params: price (bid price per unit), vendor ("vendor"|"vendor2": whose bid/award/surrogate), until (wait: "bid_end"|"close"),
          round ("pricing" default | "technical": which round extend_round / add_vendor / remove_vendor / wait act on)

TOKENS in values: {{stamp}} {{eventGroupUuid}} {{tradeId}} {{lineItemUuid}} {{vendorUuid}} {{vendor2Uuid}} {{bidUuid}} {{proposalUuid}};
  time (epoch s): {{now}}, {{now+600}}, {{now-3600}}, {{roundEnd+60}} (the PRICING round's current bid end ± seconds), {{roundClose+60}} (its extra closing time), {{rfpEnd+60}} (the TECHNICAL round's bid end);
  a wait is capped at 6 minutes — extend a round you will wait out by at most {{roundEnd+240}};
  earlier steps: {{act1.body.title}} (what act 1 sent), {{act2.data.uuid}} (what act 2 got back).

READ-BACK FIELDS:
${shapes}

ASSERTION OPS (verify[].assert[]): status(value:number) status_2xx exists absent equals not_equals one_of(value:list) contains count(value:n) count_gte non_empty gte lte type_is format(encodedId|email|epochSeconds|isoDate|url)

LIBRARY CASES you may send as-is (op "library", caseId) — real, working requests, closest to this case:
${lib || "  (none close)"}`;
}

const EXAMPLES = `EXAMPLES
1. "A vendor cannot bid after the bid end time" →
{"plan":{"title":"A vendor cannot bid after the bid end time","setup":{"recipe":"closed_rfq"},"act":[{"op":"place_bid","as":"vendor"}],"verify":[],"expected":{"outcome":"reject","code":"33"}},"gaps":[]}
2. "Renaming a published event shows the new title to the invited vendor" →
{"plan":{"title":"Renamed event shows the new title to the vendor","setup":{"recipe":"published_rfq"},"act":[{"op":"update_event","change":[{"path":"title","set":"QA_Platform_Renamed_{{stamp}}"}]}],"verify":[{"op":"read_round","as":"vendor","assert":[{"path":"event_group.title","op":"equals","value":"{{act1.body.title}}"}]}],"expected":{"outcome":"accept"}},"gaps":[]}
3. "The buyer cannot extend the technical round past the pricing round's end" →
{"plan":{"title":"Technical round cannot be extended past the pricing round","setup":{"recipe":"published_rfp_rfq"},"act":[{"op":"library","caseId":"<an EDGE case if one fits>"}],"verify":[],"expected":{"outcome":"reject","code":"712"}},"gaps":["…"]}
4. "Bulk upload of 10,000 vendors finishes in under a minute" → {"plan":null,"gaps":["performance of vendor bulk upload is outside the sourcing-event vocabulary"]}`;

interface ModelAnswer {
  plan: unknown;
  gaps: string[];
}

function parseModel(raw: string): ModelAnswer | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!o || typeof o !== "object") return null;
    return { plan: o.plan ?? null, gaps: Array.isArray(o.gaps) ? o.gaps.map((g: unknown) => String(g).slice(0, 240)).slice(0, 6) : [] };
  } catch {
    return null;
  }
}

async function askModel(text: string, cands: TestCaseRecord[], tier: "fast" | "reason", repair?: { previous: string; errors: string[] }, worked = ""): Promise<ModelAnswer | null> {
  const sys =
    "You compile software test cases for Procol (B2B procurement: sourcing events, RFQ/RFP rounds, vendor bids, awards) into API test plans. " +
    "You use ONLY the vocabulary given: recipes, operations, fields, tokens and assertion ops. Never invent an endpoint, field or recipe. " +
    "When part of the case cannot be expressed, keep the part that can and list the rest in gaps; when nothing can, return plan:null. Reply with JSON only.";
  const user =
    `${vocabularyPrompt(cands)}\n\n${EXAMPLES}\n\n${worked ? `${worked}\n\n` : ""}RULES: the setup must create the state the case starts from (closed_* = the window is over; *_short = still open but closing in ~2 min, so a wait can see it close). ` +
    `The decisive act is the one the case is about; earlier acts arrange (they must succeed; when an arrange act carries the case's own invalid input, give it "ifRefused":"pass"). Use verify read-backs when the case says something is kept, changed, shown or not changed. ` +
    `expected.code only when the app's error code is known (33 order not active/window over, 712 RFP ends after RFQ, 536 not allowed to view, 455/101 not authorised, 95 stage closed or withdrawn, 2 insufficient parameters, 801 proposal exists, 96 the vendor already bid themselves (surrogate refused), 99 a surrogate bid already exists for the vendor, 737 technical response pending, 512 cannot remove a vendor who already participated, 782 uninvited vendor cannot bid, 34 a bid already placed from your team, 875 revise locked after submission, 94 already converted to auction); otherwise leave it out. ` +
    `Use no-5xx only when the case is about not crashing; a case that says something is refused expects reject.\n\n` +
    `TEST CASE:\n"""${text.slice(0, 1200)}"""\n\n` +
    (repair ? `Your previous answer:\n${repair.previous.slice(0, 1800)}\nIt failed validation:\n- ${repair.errors.slice(0, 8).join("\n- ")}\nFix it.\n\n` : "") +
    `Reply: {"plan":{"title":"…","setup":{"recipe":"…"},"act":[…],"verify":[…],"expected":{"outcome":"accept|reject|no-5xx","code":"…"}},"gaps":["what the plan does not check"]}`;
  try {
    const raw = await chat(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { tier, maxTokens: tier === "reason" ? 2400 : 1600 },
    );
    const a = parseModel(raw);
    if (a) (a as any).raw = raw;
    return a;
  } catch {
    return null;
  }
}

// ── coverage, decided in code ───────────────────────────────────────────────

const UI_WORDS = /\b(?:screen|page|button|click\w*|drawer|modal|popup|toast|tooltip|dropdown|menu|visible on|displayed|render\w*|colou?r|highlight\w*|grid|badge|icon|scroll)\b/;
const STATE_WORDS = /\bkeeps?\b|\bkept\b|\bretain\w*|\bpersist\w*|\bstill\b|\bafterwards?\b|\bread[- ]?back\b|\bunchanged\b|\bupdates?\b.*\bfor\b|\bshows?\b|\bsees?\b|\bstored\b|\bsaved\b|\bnot (?:changed|created)\b|\bnothing (?:is )?(?:created|changed)\b/;
const OUT_OF_SCOPE = /\b(e-?mail(?:ed|s)?|notification|sms|whatsapp|pdf|excel|download|report|performance|load|concurren\w*|seconds? to load|purchase order|\bpo\b|invoice|grn|bulk upload|erp|sap)\b/;

export function polarityOf(t: string): Outcome | null {
  const s = t.toLowerCase();
  if (/\b(500|5xx|crash\w*|server error|must not break|never breaks?)\b/.test(s)) return "no-5xx";
  if (/\b(cannot|can't|can not|not allowed|refus\w*|reject\w*|block\w*|prevent\w*|disallow\w*|is denied|fails?|error|invalid|must not|should not|isn't allowed|not be able)\b/.test(s)) return "reject";
  // "check whether a vendor can bid…" is a question, not an expected outcome
  if (/\b(whether|check if|verify if|see if|find out if)\b|\?/.test(s)) return null;
  if (/\b(can|succeeds?|accept\w*|allowed|works?|updates?|changes?|is saved|is created|shows?|reopens?|2xx|200)\b/.test(s)) return "accept";
  return null;
}

function judgeCoverage(text: string, plan: ApiPlan, modelGaps: string[], extra: string[], heads: string[] = []): { coverage: "full" | "partial"; gaps: string[] } {
  const gaps = [...modelGaps.filter((g) => g.trim()), ...extra];
  const t = text.toLowerCase();
  // the title says what the case expects; the long prose (code notes) is noisy
  const pol = [...heads.map((h) => h.split(/(?<=[.;])\s|\n/)[0]), text].map((h) => polarityOf(h)).find((x) => x !== null) ?? null;
  if (pol && pol !== plan.expected.outcome && !(pol === "reject" && plan.expected.outcome === "no-5xx" && /should|must|ideally/.test(t)))
    gaps.push(`the case reads as “${OUTCOME_WORD[pol]}”, but the plan checks “${OUTCOME_WORD[plan.expected.outcome]}”`);
  if (STATE_WORDS.test(t) && !plan.verify.length) gaps.push("it does not read the record back to confirm what was kept or shown");
  if (UI_WORDS.test(t)) gaps.push("what the screen shows (an API plan checks the data, not the page)");
  const oos = t.match(OUT_OF_SCOPE)?.[0];
  if (oos) gaps.push(`the part about “${oos}” is outside what an API plan on a sourcing event checks`);
  return { coverage: gaps.length ? "partial" : "full", gaps: [...new Set(gaps)] };
}

// ── the entry point ─────────────────────────────────────────────────────────

export interface CompileInput {
  /** what was typed, or a catalog case's prose */
  text?: string;
  /** a catalog id (API-…) or a library id (EDGE-…) */
  caseId?: string;
}

export interface CompileOptions {
  /** use the fast model (default true when a provider is configured) */
  llm?: boolean;
  /** allow ONE reason-tier attempt when the fast tier cannot be made valid (default false — costs $50/1M) */
  allowReason?: boolean;
  /** skip the library-case and rule paths (to measure the model alone) */
  modelOnly?: boolean;
  /**
   * use the automation exemplars (exemplars.ts): reuse one outright when it fits
   * exactly, else show the closest to the model as worked examples. Default on;
   * SPINE_EXEMPLARS=0 turns it off for the whole process (to measure without).
   */
  exemplars?: boolean;
}

/** A catalog case as the words a QA engineer wrote. */
export function catalogCaseText(c: CatalogCase): string {
  return [c.title, c.setup && `Setup: ${c.setup}`, c.steps && `Steps: ${c.steps}`, c.expected && `Expected: ${c.expected}`].filter(Boolean).join("\n");
}

/**
 * A model-written plan that sends a library case's request must send it in the
 * state and as the actor that library case was written for — otherwise the
 * request tests something else and its "failure" would be a false positive.
 * Seen 2026-10-04: API-XBID-060 (needs a ceiling price no recipe sets) and
 * API-XBID-046 (a vendor-side surrogate case sent as the buyer).
 */
export function libraryActProblems(plan: ApiPlan): string[] {
  const lib = library();
  const out: string[] = [];
  for (const a of plan.act) {
    if (a.op !== "library" || !a.caseId) continue;
    const lc = lib.byId.get(a.caseId);
    if (!lc) continue;
    const r = recipeForLibraryCase(lc);
    if (r.unbuilt) out.push(`library case ${lc.id} needs a starting state no recipe builds (“${r.unbuilt.slice(0, 120)}”)`);
    const head = `${lc.title} ${lc.preconditions ?? ""}`.toLowerCase().replace(/_/g, " ");
    const vendorSide = /^(?:qa platform )?vendor\b|\bvendor (?:calls|session|user)\b|\bauthenticated vendor\b|\bsession: the invited vendor\b/.test(head);
    const as = a.as ?? "buyer";
    if (vendorSide && as === "buyer") out.push(`library case ${lc.id} is written for a vendor's session, but the plan sends it as the buyer`);
    if (!vendorSide && r.actor === "buyer" && as !== "buyer" && /\bbuyer\b/.test(head)) out.push(`library case ${lc.id} is written for the buyer, but the plan sends it as ${as}`);
  }
  return out;
}

function exSummary(hits: import("./exemplars.js").ExemplarHit[]): CompiledApiPlan["exemplars"] {
  return hits.slice(0, 4).map((h) => ({ id: h.ex.id, title: h.ex.title, score: h.score, dense: h.dense, structure: h.structure, verdict: h.verdict.verdict, source: h.ex.source }));
}

export async function compileApiPlan(input: CompileInput, opts: CompileOptions = {}): Promise<CompiledApiPlan> {
  const t0 = Date.now();
  const before = usageReport();
  const lib = library();
  const cat = input.caseId ? caseById(input.caseId) : null;
  const libCase = input.caseId ? lib.byId.get(input.caseId) : undefined;
  const text = (input.text ?? (cat ? catalogCaseText(cat) : libCase ? `${libCase.title.replace(/_/g, " ")}. ${libCase.preconditions ?? ""} Expected: ${libCase.expectedResult}` : "")).trim();
  const out = (r: Partial<CompiledApiPlan> & Pick<CompiledApiPlan, "plan" | "coverage" | "gaps" | "source">): CompiledApiPlan => {
    const after = usageReport();
    const sum = (u: ReturnType<typeof usageReport>, k: "calls" | "promptTokens" | "completionTokens") => Object.values(u.byModel).reduce((n, x) => n + x[k], 0);
    const eps = r.plan ? planEndpoints(r.plan) : { all: [] as string[], decisive: undefined };
    return {
      errors: [],
      warnings: [],
      candidates: [],
      ...r,
      endpoints: [...new Set(eps.all)],
      decisiveEndpoint: eps.decisive,
      llm: {
        calls: sum(after, "calls") - sum(before, "calls"),
        promptTokens: sum(after, "promptTokens") - sum(before, "promptTokens"),
        completionTokens: sum(after, "completionTokens") - sum(before, "completionTokens"),
        reasonTierUsed: r.source === "llm-reason" || !!(r as any).reasonTried,
        usd: after.totalUsd - before.totalUsd,
      },
      text,
      ms: Date.now() - t0,
    };
  };
  if (!text && !libCase) return out({ plan: null, coverage: "none", gaps: ["nothing to compile — no text and no known case id"], source: "none" });

  // 1 · a case that IS, or cites, a runnable library case: compiled without a model.
  let libraryUnbuilt: string | undefined;
  if (!opts.modelOnly) {
    const refIds = [libCase?.id, ...(cat?.refs ?? [])].filter((x): x is string => !!x && lib.byId.has(x));
    const usable = refIds.map((id) => lib.byId.get(id)!).find((c) => !libraryCaseProblem(c));
    if (usable) {
      const { plan, gaps, unbuilt } = await planFromLibraryCase(usable, input.caseId);
      if (cat) plan.title = cat.title;
      const v = await validatePlan(plan);
      // A starting state no recipe builds would make the library request test
      // the wrong thing (and a "failure" a false positive): the model may
      // arrange it with extra steps; without one, there is no plan.
      if (v.ok && unbuilt) libraryUnbuilt = `the starting state “${unbuilt}” is more specific than any recipe — library case ${usable.id} cannot run as written on a fresh record`;
      else if (v.ok) {
        const cov = judgeCoverage(text, v.plan, [], gaps, [cat?.title ?? "", cat?.expected ?? ""].filter(Boolean));
        return out({ plan: v.plan, coverage: cov.coverage, gaps: cov.gaps, warnings: v.warnings, source: "library-case", candidates: [usable.id] });
      }
    }
  }

  // 1b · the memory of automation built before (exemplars.ts): the closest
  // cases that already have a working plan — reused outright when one fits
  // exactly, otherwise shown to the model as worked examples.
  // Only when the model is in play: the search embeds the case (a network call),
  // and no-model callers (coverage metrics compile 1,000 cases in a 30 s budget) must stay fast.
  const useExemplars = (opts.exemplars ?? process.env.SPINE_EXEMPLARS !== "0") && opts.llm !== false && llmMode() !== "fallback";
  let exHits: import("./exemplars.js").ExemplarHit[] = [];
  let worked = "";
  if (useExemplars) {
    try {
      const ex = await import("./exemplars.js");
      const exclude = [input.caseId, ...(cat?.refs ?? [])].filter((x): x is string => !!x);
      exHits = await Promise.race([
        ex.findExemplars(text, { k: 6, exclude }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("exemplar search took over 30 s")), 30_000)),
      ]);
      if (!opts.modelOnly) {
        const fit = ex.exactFit(text, exHits, input.caseId, cat?.title ?? text.split("\n")[0].slice(0, 140));
        if (fit) {
          const v = await validatePlan(fit.plan);
          if (v.ok) {
            const cov = judgeCoverage(text, v.plan, [], [], cat ? [cat.title, cat.expected] : []);
            return out({
              plan: v.plan, coverage: cov.coverage, gaps: cov.gaps, warnings: [...v.warnings, fit.why], source: "exemplar",
              candidates: [fit.from.ex.id], exemplars: exSummary(exHits), reusedFrom: fit.from.ex.id,
            });
          }
        }
      }
      worked = ex.workedExamples(exHits.slice(0, 4));
    } catch (e) {
      worked = "";
      console.warn(`[apiPlanner] exemplars unavailable: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  const cited = [libCase, ...(cat?.refs ?? []).map((r) => lib.byId.get(r))].filter((c): c is TestCaseRecord => !!c && !libraryCaseProblem(c));
  // The exemplars' library requests are offered first after the cited ones: they were found by meaning, not only by words.
  const fromExemplars = exHits
    .map((h) => h.ex.libraryId ?? h.ex.plan?.act.find((a) => a.op === "library")?.caseId)
    .map((id) => (id ? lib.byId.get(id) : undefined))
    .filter((c): c is TestCaseRecord => !!c && !libraryCaseProblem(c) && !cited.includes(c));
  const cands = [...new Set([...cited, ...fromExemplars.slice(0, 3), ...nearestLibraryCases(text).filter((c) => !cited.includes(c))])].slice(0, 8);
  const useModel = opts.llm !== false && llmMode() !== "fallback";
  let lastErrors: string[] = [];
  let lastWarnings: string[] = [];
  let reasonTried = false;
  let modelNone: string[] | undefined;
  let modelNoneTier: "fast" | "reason" = "fast";
  if (useModel) {
    const tiers: Array<"fast" | "reason"> = ["fast", "fast", ...(opts.allowReason ? (["reason"] as const) : [])];
    let previous: string | undefined;
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      if (tier === "reason") reasonTried = true;
      const ans = await askModel(text, cands, tier, previous && lastErrors.length ? { previous, errors: lastErrors } : undefined, worked);
      if (!ans) {
        lastErrors = ["the model's answer was not JSON"];
        continue;
      }
      previous = (ans as any).raw ?? JSON.stringify(ans.plan);
      if (ans.plan === null) {
        modelNone = ans.gaps.length ? ans.gaps : ["nothing in the API vocabulary can express this case"];
        modelNoneTier = tier;
        break;
      }
      const mp = ans.plan as Partial<ApiPlan>;
      const mcode = mp?.expected?.code !== undefined ? String(mp.expected.code) : "";
      if (mcode) {
        const stated = new RegExp(`\\b${mcode}\\b`).test(text) || cands.some((c) => codeIn(c.expectedResult) === mcode && (mp.act ?? []).some((a) => a.caseId === c.id));
        if (!stated) (mp.expected as any).codeInferred = true;
      }
      const v = await validatePlan({ ...(ans.plan as object), ...(input.caseId ? { caseId: input.caseId } : {}) });
      lastWarnings = v.warnings;
      if (v.ok) {
        const cov = judgeCoverage(text, v.plan, ans.gaps, libraryActProblems(v.plan), cat ? [cat.title, cat.expected] : []);
        return out({ plan: v.plan, coverage: cov.coverage, gaps: cov.gaps, warnings: v.warnings, source: tier === "reason" ? "llm-reason" : "llm-fast", candidates: cands.map((c) => c.id), exemplars: exSummary(exHits), reasonTried } as any);
      }
      lastErrors = v.errors;
    }
  }

  // 2 · rules (no model, or the model's answers could not be made valid)
  if (!opts.modelOnly) {
    const r = rulesPlan(text);
    if (r) {
      const v = await validatePlan({ ...r.plan, title: text.split("\n")[0].slice(0, 140), ...(input.caseId ? { caseId: input.caseId } : {}) });
      if (v.ok) {
        const cov = judgeCoverage(text, v.plan, [], ["compiled by a fixed rule, not read in full — check the steps match the case"], cat ? [cat.title, cat.expected] : []);
        return out({ plan: v.plan, coverage: cov.coverage, gaps: cov.gaps, warnings: v.warnings, source: "rules", candidates: cands.map((c) => c.id), exemplars: exSummary(exHits) });
      }
      lastErrors = [...lastErrors, ...v.errors.map((e) => `rule: ${e}`)];
    }
  }
  if (modelNone) return out({ plan: null, coverage: "none", gaps: [...(libraryUnbuilt ? [libraryUnbuilt] : []), ...modelNone], errors: lastErrors, source: modelNoneTier === "reason" ? "llm-reason" : "llm-fast", candidates: cands.map((c) => c.id), reasonTried } as any);
  return out({
    plan: null,
    coverage: "none",
    gaps: [...(libraryUnbuilt ? [libraryUnbuilt] : []), useModel ? "no valid API plan could be compiled from the words" : "no model is configured and no fixed rule matches the words"],
    errors: lastErrors,
    warnings: lastWarnings,
    source: "none",
    candidates: cands.map((c) => c.id),
    reasonTried,
  } as any);
}

/** The vocabulary, for the dashboard and for documentation. */
export function vocabulary() {
  return {
    version: PLAN_VERSION,
    recipes: Object.values(RECIPES).map((r) => ({ id: r.id, title: r.title, provides: r.provides, minutes: r.minutes, journeySteps: r.steps, vendors: r.vendors, bids: r.bids, closed: r.closed, clock: r.clock })),
    ops: Object.values(OPS).map((o) => ({
      id: o.id, kind: o.kind, method: o.method, path: o.path, actor: o.actor, actors: o.actors, template: o.template, needs: o.needs, produces: o.produces, does: o.does,
      libraryBasis: o.method ? libraryBasis(o.method, o.path) : [],
    })),
    assertionOps: [...ASSERT_OPS],
    placeholders: [...PLAN_PLACEHOLDERS],
    timeTokens: ["now", "now+N", "now-N", "roundEnd±N", "roundClose±N"],
    readShapes: READ_SHAPES,
    limits: LIMITS,
  };
}
