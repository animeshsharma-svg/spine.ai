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
import { statusInWords } from "../checks/humanApi.js";
import { pathToFileURL } from "node:url";

import { chat, llmMode, usageReport, lastServedModel } from "../ai/llm.js";
import { PROCOL_TEST } from "../executor.js";
import { heldCases, loadCases, type TestCaseRecord } from "../checks/caseLibrary.js";
import { caseById, type CatalogCase } from "../checks/testCatalog.js";
import { endpointInWords, errorMessage } from "../checks/caseDisplay.js";
import { FORMATS } from "../checks/apiAssertions.js";
import { appRefusal } from "../checks/appAccess.js";
import { vendorAppRefusal } from "../checks/actors.js";
import type { EventType, StepKind } from "../checks/journeyModel.js";

// ── the language ────────────────────────────────────────────────────────────

/**
 * 2 (10 Nov 2026): the `request` op (the case's own request, sourcing-event routes only), read_bid /
 * read_proposal / read_history read-backs, actors fixed from the app allow-lists at validation, the
 * expected outcome checked against the case's words, read-backs added in code after a changing act.
 */
export const PLAN_VERSION = 2;

export type ActorId = "buyer" | "vendor" | "vendor2";
export type Outcome = "accept" | "reject" | "no-5xx";

export type RecipeId =
  | "none"
  | "draft_event"
  | "draft_rfq"
  | "draft_rfp_rfq"
  | "draft_auction"
  | "draft_rfp_auction"
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
  | "read_bid"
  | "read_bid2"
  | "read_proposal"
  | "read_history"
  | "list_events"
  // the case's own request (method, path, body written in the case), sourcing-event routes only
  | "request"
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
  | "surrogate_tech_response"
  | "price_cap"
  | "open_proposal"
  | "award_vendor"
  | "new_version"
  | "clone_event"
  | "convert_to_auction"
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

/** The request a case writes itself ("`PATCH /bids/{{bidUuid}}/reject` with `{…}`"). */
export interface OwnRequest {
  method: "GET" | "POST" | "PATCH" | "PUT";
  /** the path with {{placeholders}}, query string allowed */
  path: string;
  /** JSON body (not for GET); strings may carry {{tokens}} */
  body?: unknown;
}

export interface ActStep {
  op: OpId;
  as?: ActorId;
  /** library op only: the library case whose request is sent */
  caseId?: string;
  /** request op only: the request itself */
  request?: OwnRequest;
  /** edits to the working body */
  change?: Change[];
  /** op parameters: price (bids), vendor (whose bid/award: vendor|vendor2), until (wait: bid_end|close) */
  /** price null: a surrogate bid sent with no price (the case "a surrogate bid with no price") */
  params?: { price?: number | null; vendor?: "vendor" | "vendor2"; until?: "bid_end" | "close"; round?: "pricing" | "technical" };
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
  /** op "request" only: a GET the case itself names */
  request?: OwnRequest;
  assert: Assertion[];
  say?: string;
}

export interface ApiPlan {
  version: number;
  /** catalog id (API-…), library id (EDGE-…) or draft id (GEN-…), when there is one */
  caseId?: string;
  /** plain English */
  title: string;
  /**
   * lineItems: how many line items the setup's draft carries (default 1).
   * fromPr: the draft is made from an open purchase request's lines (items of them), linked to the PR.
   */
  setup: { recipe: RecipeId; lineItems?: number; fromPr?: { items?: number } };
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
  /**
   * The model was not properly reached: "unreachable: …" (the gateway did not answer / returned no JSON
   * after an error) or "fallback: <model>" (another provider answered, not Slingring). Such a result is
   * not a verdict on the case — the caller compiles it again later rather than storing it.
   */
  gateway?: string;
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
  draft_auction: { id: "draft_auction", title: "A fresh draft event with one line item and an auction round attached, not published.", eventType: "auction_only", steps: [...BUILD, "add_stage_pricing"], clock: "long", vendors: 0, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING], minutes: 1 },
  draft_rfp_auction: { id: "draft_rfp_auction", title: "A fresh draft event with a technical (RFP) round and an auction round attached, not published.", eventType: "rfp_auction", steps: [...BUILD, "add_stage_rfp", "add_stage_pricing"], clock: "long", vendors: 0, bids: 0, closed: false, provides: [...BASE_PROVIDES, ...EVENT, ...PRICING, ...RFP], minutes: 1 },
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
  // bids#show (plain route; the supplier app may call it — actors.ts VENDOR_APP_PLAIN) — the bid as its owner or the buyer sees it
  read_bid: { id: "read_bid", kind: "read", method: "GET", path: "/bids/{{bidUuid}}", actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "—", needs: ["bidUuid"], produces: [], does: "reads the bid" },
  // the SECOND QA vendor's bid (setup rfq_with_2_bids / closed_rfq_with_2_bids): "a vendor cannot read another vendor's bid" = read_bid2 as vendor
  read_bid2: { id: "read_bid2", kind: "read", method: "GET", path: "/bids/{{bid2Uuid}}", actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "—", needs: ["bid2Uuid"], produces: [], does: "reads the second QA vendor's bid" },
  // proposal#show — the award proposal (buyer only)
  read_proposal: { id: "read_proposal", kind: "read", method: "GET", path: "/proposal/{{proposalUuid}}", actor: "buyer", actors: ["buyer"], template: "—", needs: ["proposalUuid"], produces: [], does: "reads the award proposal" },
  // event_groups#history — the event's change history (both apps may call it)
  read_history: { id: "read_history", kind: "read", method: "GET", path: "/event_groups/{{eventGroupUuid}}/history", actor: "buyer", actors: ["buyer", "vendor"], template: "—", needs: ["eventGroupUuid"], produces: [], does: "reads the event's history" },
  /**
   * THE CASE'S OWN REQUEST (10 Nov). Hundreds of written cases name their request outright — "`PATCH
   * /bids/{{bidUuid}}/reject` with `{"rejection_remarks": …, "allow_rebidding": true}`" — on routes no
   * operation covers (reject a bid, weights, reminders, documents, chats). The step carries method, path
   * and body as the case writes them; the validator keeps it to the sourcing-event routes, known
   * placeholders and the actor whose app may call the route. A verify step may be a GET request too.
   */
  request: { id: "request", kind: "write", method: "", path: "", actor: "buyer", actors: ["buyer", "vendor", "vendor2"], template: "the case's own request, as written", needs: [], produces: [], does: "sends the request the case itself writes" },

  create_draft: { id: "create_draft", kind: "write", method: "POST", path: "/event_groups", actor: "buyer", actors: ["buyer", "vendor"], template: "bodies.buildEventGroupBody (journey step: create the draft)", needs: ["productUuid", "productQualityUuid"], produces: ["eventGroupUuid", "lineItemUuid"], does: "creates a draft event" },
  add_rfq_round: { id: "add_rfq_round", kind: "write", method: "POST", path: "/trade/template_input?template_name=trade&additional_fields=order_details", actor: "buyer", actors: ["buyer"], template: "bodies.buildPricingStageBody (journey step: add the pricing round)", needs: ["eventGroupUuid", "lineItemUuid"], produces: ["pricingTradeUuid", "tradeId"], does: "adds a pricing (RFQ) round to the event" },
  add_rfp_round: { id: "add_rfp_round", kind: "write", method: "POST", path: "/trade/template_input?template_name=trade&additional_fields=order_details", actor: "buyer", actors: ["buyer"], template: "bodies.buildTechnicalStageBody (journey step: add the technical round)", needs: ["eventGroupUuid", "lineItemUuid"], produces: ["technicalTradeUuid", "rfpTradeId"], does: "adds a technical (RFP) round to the event" },
  publish_event: { id: "publish_event", kind: "write", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor"], template: "bodies.buildPublishBody (journey step: publish)", needs: ["eventGroupUuid"], produces: [], does: "publishes the event" },
  update_event: { id: "update_event", kind: "write", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-CRT-020 (rename an event)", needs: ["eventGroupUuid"], produces: [], does: "updates the event" },
  withdraw_event: { id: "withdraw_event", kind: "write", method: "PATCH", path: "/event_groups/{{eventGroupUuid}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-076 (withdraw with a remark)", needs: ["eventGroupUuid"], produces: [], does: "withdraws the event" },
  extend_round: { id: "extend_round", kind: "write", method: "PATCH", path: "/trade/{{tradeId}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-058 / bidding matrix M15 (extend the bid end)", needs: ["tradeId"], produces: [], does: "moves the round's bid end time" },
  add_vendor: { id: "add_vendor", kind: "write", method: "PATCH", path: "/v1/trade/add_audience?id={{tradeId}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-037 (invite a vendor to a live round)", needs: ["tradeId", "vendor2Uuid"], produces: [], does: "invites QA vendor 2 to the live round" },
  remove_vendor: { id: "remove_vendor", kind: "write", method: "PATCH", path: "/v1/trade/remove_audience?id={{tradeId}}", actor: "buyer", actors: ["buyer", "vendor"], template: "library EDGE-PUB-045 (remove a vendor from a live round)", needs: ["tradeId", "vendorUuid"], produces: [], does: "removes the invited vendor from the live round" },
  // Recorded from the console's Participants → Add Price Cap (peer 6c, 27 Oct: recordings/price-cap-27oct.flow.json).
  // The template's price widget then requires a bid strictly below the cap ("Price should be less than the Cap price").
  price_cap: { id: "price_cap", kind: "write", method: "PATCH", path: "/trade/{{tradeId}}/update_vendor_validations", actor: "buyer", actors: ["buyer", "vendor"], template: "Participants → Add Price Cap (recorded 27 Oct)", needs: ["tradeId", "vendorUuid"], produces: [], does: "sets the invited vendor's price cap on the round (a bid must be strictly below it)" },
  // Recorded from the console's Technical Stage → Participants → Add Bid → Submit (28 Oct: recordings/surrogate-technical-28oct.flow.json).
  // The body names every questionnaire page of the round and its vendor questions; the runner reads them from the
  // round's schema first (techPages). A required question is answered, the rest are sent blank, as the screen does.
  surrogate_tech_response: { id: "surrogate_tech_response", kind: "write", method: "POST", path: "/template_responses/create_surrogate_response", actor: "buyer", actors: ["buyer"], template: "Technical Stage → Add Bid → Submit (recorded 28 Oct)", needs: ["rfpTradeId", "vendorUuid"], produces: [], does: "submits a technical response on a vendor's behalf on the RFP (technical) round (surrogate technical response)" },
  surrogate_bid: { id: "surrogate_bid", kind: "write", method: "POST", path: "/bids/template_input", actor: "buyer", actors: ["buyer"], template: "bodies.buildSurrogateRfqBody (journey step: surrogate RFQ bid)", needs: ["tradeId", "lineItemUuid"], produces: [], does: "enters a bid on a vendor's behalf (surrogate bid)" },
  open_proposal: { id: "open_proposal", kind: "write", method: "POST", path: "/proposal", actor: "buyer", actors: ["buyer", "vendor"], template: "bodies.buildProposalBody (journey step: open the award proposal)", needs: ["eventGroupUuid"], produces: ["proposalUuid"], does: "opens an award proposal" },
  award_vendor: { id: "award_vendor", kind: "write", method: "POST", path: "/proposal/{{proposalUuid}}/add_response?lot_no=", actor: "buyer", actors: ["buyer"], template: "bodies.buildAwardResponseBody (journey step: award the line)", needs: ["proposalUuid", "lineItemUuid"], produces: [], does: "awards the line to a vendor on the proposal" },
  new_version: { id: "new_version", kind: "write", method: "POST", path: "/item_versions", actor: "buyer", actors: ["buyer"], template: "bodies.buildItemVersionBody (journey step: new version)", needs: ["eventGroupUuid"], produces: [], does: "issues a new version of the event" },
  // The journey's convert step (eventJourney convertAuction): the pricing round becomes a live auction round.
  convert_to_auction: { id: "convert_to_auction", kind: "write", method: "POST", path: "/trade/move_to_auction", actor: "buyer", actors: ["buyer"], template: "bodies.buildAuctionBody (journey step: convert to auction)", needs: ["tradeId", "lineItemUuid"], produces: [], does: "converts the pricing round into a live auction" },
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
  /** the technical round's questionnaire: each page and its vendor questions (surrogate_tech_response) */
  techPages?: Array<{ page: string; questions: Array<{ key: string; required: boolean }> }>;
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
  price: number | null;
  stamp: string;
  proposalUuid?: string;
  /** the trade product the bidding vendor reads (bid pricing, surrogate) */
  tradeProduct?: { trade_product_uuid: string; trade_product_id: number; trade_product_category_uuid: string; product_id: number; product_code: string };
  /** the bid total, from the pricing step (for submit) */
  total?: number;
  /** the client's catalog says whether an auction starts from the RFQ quotes (convert_to_auction) */
  useRfqQuotes?: boolean;
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
    case "price_cap":
      // { trade product: { vendor company: cap per unit } }
      return { productwise_vendor_validations: { [a.tradeProduct?.trade_product_uuid ?? "{{tradeProductUuid}}"]: { [a.vendorCompanyUuid]: a.price } } };
    case "surrogate_bid": {
      const body: any = B.buildSurrogateRfqBody({
        pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid, productUuid: a.productUuid, productQualityUuid: a.productQualityUuid,
        locationUuid: a.locationUuid, lineItemUuid: a.lineItemUuid, quantityValue: a.qty, quantityUnit: a.unit, price: a.price ?? 0, tradeProduct: a.tradeProduct ?? DUMMY_TP,
      });
      // "a surrogate bid with no price": the price, and the total it makes, left out of the row
      if (a.price === null)
        for (const rows of Object.values(body?.sheets?.inline_components?.data ?? {}) as any[][])
          for (const r of rows ?? []) {
            if (r?.price) delete r.price.value;
            if (r?.total_amount) delete r.total_amount.value;
          }
      return body;
    }
    case "surrogate_tech_response": {
      const pages = a.techPages ?? [];
      return {
        item_type: "TradeRequest",
        item_uuid: a.technicalTradeUuid ?? "{{rfpTradeId}}",
        company_uuid: a.vendorCompanyUuid,
        page_responses: Object.fromEntries(
          pages.map((p) => [p.page, p.questions.map((q) => (q.required ? { key_attribute: q.key, value: "As per company" } : { key_attribute: q.key }))]),
        ),
        page_uuids: pages.map((p) => p.page),
        surrogate_remarks: { remarks: "", attachments: [] },
      };
    }
    case "open_proposal":
      return B.buildProposalBody({ eventGroupUuid: a.eventGroupUuid });
    case "award_vendor": {
      // the bidding matrix's shape: no quantity = the quoted quantity
      const responses: Record<string, unknown> = { [a.vendorCompanyUuid]: { action: "add", egli_data: { [a.lineItemUuid]: { awarded_quantity: a.qty } } } };
      return { responses };
    }
    case "new_version":
      return B.buildItemVersionBody({ eventGroupUuid: a.eventGroupUuid });
    case "convert_to_auction":
      return B.buildAuctionBody({
        pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid, productUuid: a.productUuid, productQualityUuid: a.productQualityUuid,
        locationUuid: a.locationUuid, lineItemUuid: a.lineItemUuid, pricingTemplateUuid: a.pricingTemplateUuid, quantityValue: a.qty, quantityUnit: a.unit,
        useRfqQuotes: a.useRfqQuotes ?? true, timing,
      });
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
      return B.buildSubmitBidBody({ pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: a.vendorCompanyUuid, total: a.total ?? (a.price ?? 0) * a.qty });
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
  read_bid: "(shape not sampled yet — use status_2xx / exists on the fields the case names); the acting vendor's OWN bid",
  read_bid2: "the SECOND QA vendor's bid — 'a vendor cannot read another vendor's bid' = read_bid2 as vendor on rfq_with_2_bids, expected reject",
  read_proposal: "(shape not sampled yet — use status_2xx / exists on the fields the case names)",
  read_history: "(shape not sampled yet — use status_2xx / non_empty on the root)",
  request: "a GET the case names: {\"op\":\"request\",\"request\":{\"method\":\"GET\",\"path\":\"/…\"},\"assert\":[…]} (shape unknown — assert the fields the case names)",
};

/** Routes a `request` step may send: the sourcing-event area and what hangs off an event (reminders, messages). */
const REQUEST_DOMAIN = /^\/(event_groups|trade|v1\/trade|v1\/bids|bids|template_responses|evaluations|proposal|item_versions|additional_request|user_intents|orders|reminders|v1\/chats|templates\/upload_attachment|v1\/attachments)(\/|\?|$)/;

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
  /**
   * Problems with the plan's READING of the case (its expected outcome contradicts the case's words).
   * The plan is still runnable; the compiler sends them back to the model once for a repair and,
   * when the repair does not help, keeps the plan with the gap named.
   */
  soft: string[];
  plan: ApiPlan;
}

/** The case's words, when the validator has them: used to check the outcome and the actor. */
export interface ValidateContext {
  text?: string;
  /** the title and the expected-result column — what the case expects, without the long prose */
  heads?: string[];
}

const METHODS = new Set(["GET", "POST", "PATCH", "PUT"]);
/** the library's probe ids: a well-formed id of a record that does not exist, and a garbled one */
const BOGUS_IDS = new Set(["Z2dnWmdaUWtnZw==", "WrongUuid1="]);

/** Would this actor's APP be refused this request at the gate? (appAccess.ts / actors.ts) */
function appBar(actor: ActorId, method: string, path: string): string | undefined {
  const p = String(path).split("?")[0];
  return actor === "buyer" ? appRefusal("console", method, p) : vendorAppRefusal(method, p);
}

/**
 * A case ABOUT the wrong app being turned away ("a buyer token on POST /v1/bids is refused") must not
 * have its actor corrected — but it can never run either: the 401 signs the session out (appAccess.ts).
 */
const CROSS_APP_CASE = /not authori[sz]ed to use this api|wrong app|cross-?app|app[- ]?key|app (gate|allow-?list)|(buyer|console)('s)? (token|session)\b[^.]{0,60}\b(vendor|supplier|bid)|(vendor|supplier)('s)? (token|session)\b[^.]{0,60}\b(buyer|console)/i;

/** The actor whose app may send this, among those the op allows; undefined when none may. */
function actorWhoMay(allowed: ActorId[], method: string, path: string, prefer: ActorId): ActorId | undefined {
  const order: ActorId[] = [prefer, ...(["buyer", "vendor", "vendor2"] as ActorId[]).filter((x) => x !== prefer)];
  return order.find((x) => allowed.includes(x) && !appBar(x, method, path));
}

/**
 * The polarity of the case's words: the title / expected column first (what the case expects), the long
 * prose last. null when the words do not say.
 */
export function casePolarity(ctx: ValidateContext | undefined): Outcome | null {
  if (!ctx) return null;
  // the EXPECTED column first (it says the outcome: "HTTP 422, code 4"), then the title, then the long prose.
  // Seen 2026-11-10 on API-EVDTME-060: the title "Reopen with the extension written as a word…" read as
  // accepted ("reopen") and outvoted "HTTP 422, code 4 'Request not found'".
  const heads = (ctx.heads ?? []).map((h) => String(h ?? "").slice(0, 400)).reverse();
  return [...heads, ctx.text ?? ""].map((h) => (h.trim() ? polarityOf(h) : null)).find((x) => x !== null) ?? null;
}

/** "HTTP 422, code 258 'You cannot re-schedule this event!'" → "258" */
function codeInWords(text: string | undefined): string | undefined {
  const m = String(text ?? "").match(/\b(?:error[_ ])?code\s*[:=]?\s*(\d{1,4})\b/i);
  return m?.[1];
}

/**
 * Check a plan against the vocabulary. Unknown recipe, op, actor, field,
 * placeholder, assertion op or code → an error (the plan is not runnable);
 * smaller doubts → warnings. Normalises defaults (actors, decisive step).
 *
 * With the case's words (ctx): a step whose actor's app may not call its route
 * is sent as the actor whose app may (a warning), unless the case is about
 * that very refusal; an expected outcome that contradicts the case's words is
 * a soft problem (see Validation.soft); a refusal code the case names is kept.
 */
export async function validatePlan(raw: unknown, ctx?: ValidateContext): Promise<Validation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const soft: string[] = [];
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<ApiPlan>;
  const recipeId = (p.setup as any)?.recipe as RecipeId;
  const recipe = RECIPES[recipeId];
  if (!recipe) errors.push(`unknown setup recipe "${String(recipeId)}" (known: ${Object.keys(RECIPES).join(", ")})`);
  const acts: ActStep[] = Array.isArray(p.act) ? (p.act as ActStep[]) : [];
  const verify: VerifyStep[] = Array.isArray(p.verify) ? (p.verify as VerifyStep[]) : [];
  if (!acts.length && !verify.length) errors.push("the plan has no act and no verify step");
  if (acts.length > LIMITS.acts) errors.push(`at most ${LIMITS.acts} act steps (got ${acts.length})`);
  if (verify.length > LIMITS.verify) errors.push(`at most ${LIMITS.verify} verify steps (got ${verify.length})`);
  let outcome = (p.expected as any)?.outcome as Outcome;
  if (!["accept", "reject", "no-5xx"].includes(outcome)) errors.push(`expected.outcome must be accept, reject or no-5xx (got "${String(outcome)}")`);
  let code = (p.expected as any)?.code !== undefined && (p.expected as any)?.code !== null && (p.expected as any)?.code !== "" ? String((p.expected as any).code) : undefined;
  let message = typeof (p.expected as any)?.message === "string" ? (p.expected as any).message : undefined;
  let codeInferred = (p.expected as any)?.codeInferred === true;
  const caseText = [ctx?.text ?? "", ...(ctx?.heads ?? [])].join("\n");
  const crossApp = !!ctx && CROSS_APP_CASE.test(caseText);

  // ── the expected outcome against the case's words ──
  const pol = casePolarity(ctx);
  if (pol && ["accept", "reject", "no-5xx"].includes(outcome)) {
    const recordsToday = /\bshould\b|\bmust\b|\bideally\b|\btoday\b|\bcurrently\b|current behaviou?r/i.test(caseText);
    if (outcome === "no-5xx" && pol === "accept") {
      outcome = "accept";
      warnings.push("the plan checked only “no server error”; the case expects its action to go through, so that is what is checked");
    } else if (pol === "reject" && outcome === "accept") {
      soft.push("the case reads as “it is refused”, but the plan expects “it is accepted” — arrange the state that makes the app refuse the decisive step (a closed_* / withdrawn / uninvited setup, or the invalid input the case names) and set expected.outcome \"reject\"");
    } else if (pol === "reject" && outcome === "no-5xx" && !recordsToday) {
      soft.push("the case reads as “it is refused”, but the plan checks only “no server error” — set expected.outcome \"reject\" (with the app's code when the case names it)");
    } else if (pol === "accept" && outcome === "reject") {
      soft.push("the case reads as “it is accepted”, but the plan expects a refusal — set expected.outcome \"accept\" and plan only the steps the case describes");
    }
    // the code the case names is the code the plan expects
    if (outcome === "reject" && !code) {
      const named = codeInWords(caseText);
      if (named) {
        code = named;
        codeInferred = false;
        warnings.push(`expected.code ${named} taken from the case's words`);
      }
    }
  }
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

  /** a request step's request, checked: method, path, domain, placeholders (errors pushed), and the needs it has */
  const checkRequest = (n: string, r: OwnRequest | undefined, isVerify: boolean): { req?: OwnRequest; needs: string[]; body?: unknown } => {
    const method = String(r?.method ?? "").toUpperCase();
    if (!r || typeof r !== "object" || !METHODS.has(method) || typeof r.path !== "string" || !r.path.trim().startsWith("/")) {
      errors.push(`${n}: a request step needs request.method (GET|POST|PATCH|PUT) and request.path ("/…")`);
      return { needs: [] };
    }
    if (isVerify && method !== "GET") errors.push(`${n}: a read-back request must be a GET`);
    // the cases write "/api/event_groups" for what the client sends as "/event_groups"
    const path = r.path.trim().replace(/^\/api(?=\/)/, "");
    const route = path.split("?")[0];
    if (/[<>]/.test(path)) errors.push(`${n}: the path "${path}" names a record by description (<…>) — use a {{placeholder}} the setup provides`);
    if (!REQUEST_DOMAIN.test(path)) errors.push(`${n}: ${method} ${route} is outside the sourcing-event area a plan may act on`);
    // The library's two probe ids are allowed: Z2dnWmdaUWtnZw== (a record that does not exist) and WrongUuid1= (a garbled id).
    if (route.split("/").some((seg) => !BOGUS_IDS.has(seg) && (/^\d+$/.test(seg) || FORMATS.encodedId.test(seg) || /^WrongUuid|^QA00/.test(seg)))) errors.push(`${n}: the path carries a fixed record id — a plan acts only on the records its own setup built (for a record that does not exist use Z2dnWmdaUWtnZw==, for a garbled id WrongUuid1=)`);
    const req: OwnRequest = { method: method as OwnRequest["method"], path, ...(r.body !== undefined && r.body !== null && method !== "GET" ? { body: r.body } : {}) };
    if (method === "GET" && r.body !== undefined && r.body !== null) warnings.push(`${n}: a GET sends no body; it was dropped`);
    if (req.body !== undefined && (typeof req.body !== "object")) errors.push(`${n}: request.body must be a JSON object or list`);
    // a write with no body (or {}) tests nothing the case describes — unless the case itself sends an empty body
    if (!isVerify && method !== "GET" && (req.body === undefined || (typeof req.body === "object" && !Array.isArray(req.body) && !Object.keys(req.body as object).length)) && !/\{\s*\}|empty body|no body|without a body|body omitted/i.test(caseText))
      errors.push(`${n}: ${method} ${route} is sent with no body — a request step carries the body the case writes (or a library/operation step has a working one)`);
    const toks = tokensIn({ p: path, b: req.body ?? null });
    const live = [...new Set(toks.filter((t) => LIVE_RECORD_PLACEHOLDERS.has(t)))];
    if (live.length) errors.push(`${n}: it needs ${live.map((t) => `{{${t}}}`).join(", ")}, a live business record a plan never touches`);
    const unknown = [...new Set(toks.filter((t) => !PLAN_PLACEHOLDERS.has(t) && !TIME_TOKEN.test(t) && !ACT_TOKEN.test(t) && !LIVE_RECORD_PLACEHOLDERS.has(t)))];
    if (unknown.length) errors.push(`${n}: unknown placeholder${unknown.length > 1 ? "s" : ""} ${unknown.map((t) => `{{${t}}}`).join(", ")}`);
    return { req, needs: [...new Set(toks.filter((t) => PLAN_PLACEHOLDERS.has(t)))], body: req.body };
  };

  /** the step's actor, corrected to one whose app may call the route (or an error when the case is about that refusal) */
  const fixActor = (n: string, as: ActorId, allowed: ActorId[], method: string, path: string): ActorId => {
    const bar = appBar(as, method, path);
    if (!bar) return as;
    const alt = crossApp ? undefined : actorWhoMay(allowed.filter((x) => x !== as), method, path, as === "buyer" ? "vendor" : "buyer");
    if (alt) {
      warnings.push(`${n}: sent as the ${alt} — ${bar}`);
      return alt;
    }
    errors.push(`${n}: cannot be executed — ${bar}; such a call is answered 401 and signs the session out`);
    return as;
  };

  const have = new Set<string>(recipe?.provides ?? []);
  const normActs: ActStep[] = [];
  for (let i = 0; i < acts.length; i++) {
    const src = (acts[i] ?? {}) as ActStep & { until?: string; price?: number; method?: string; path?: string; body?: unknown };
    // only the language's own keys survive (a stray top-level "until"/"price" is moved into params; a stray method/path make a request)
    const a: ActStep = {
      op: src.op,
      ...(src.as !== undefined ? { as: src.as } : {}),
      ...(src.caseId !== undefined ? { caseId: src.caseId } : {}),
      ...(src.request !== undefined ? { request: src.request } : src.op === "request" && src.method && src.path ? { request: { method: src.method as OwnRequest["method"], path: src.path, body: src.body } } : {}),
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
    let needs = [...op.needs];
    let body: unknown;
    let method = op.method as string;
    let path = op.path;
    if (a.op === "library") {
      const c = a.caseId ? library().byId.get(a.caseId) : undefined;
      const problem = libraryCaseProblem(c);
      if (problem) errors.push(`act ${n}: library case ${a.caseId ?? "(none)"}: ${problem}`);
      if (c) {
        needs = [...new Set(tokensIn({ p: c.path, b: c.body }).filter((t) => PLAN_PLACEHOLDERS.has(t)))];
        body = c.body;
        method = String(c.method ?? "").toUpperCase();
        path = String(c.path ?? "");
        // the actor the library case was written for (libraryActProblems would otherwise name the mismatch as a gap)
        const r = recipeForLibraryCase(c);
        const head = `${c.title} ${c.preconditions ?? ""}`.toLowerCase().replace(/_/g, " ");
        const vendorSide = /^(?:qa platform )?vendor\b|\bvendor (?:calls|session|user)\b|\bauthenticated vendor\b|\bsession: the invited vendor\b/.test(head);
        if (vendorSide && a.as === "buyer" && !crossApp) {
          a.as = r.actor === "vendor2" ? "vendor2" : "vendor";
          warnings.push(`act ${n}: library case ${c.id} is written for a vendor's session — sent as the ${a.as}`);
        } else if (!vendorSide && r.actor === "buyer" && a.as !== "buyer" && /\bbuyer\b/.test(head) && !crossApp) {
          a.as = "buyer";
          warnings.push(`act ${n}: library case ${c.id} is written for the buyer — sent as the buyer`);
        }
      }
    } else if (a.op === "request") {
      const r = checkRequest(`act ${n}`, a.request, false);
      if (r.req) {
        a.request = r.req;
        needs = r.needs;
        body = r.body;
        method = r.req.method;
        path = r.req.path;
      }
    } else {
      body = await sampleBody(a.op as OpId).catch(() => undefined);
    }
    if (method && path && op.actors.length) a.as = fixActor(`act ${n}`, a.as, op.actors, method, path);
    if (a.as === "vendor" && recipe && recipe.vendors < 1 && recipe.id !== "none") warnings.push(`act ${n}: the vendor is not invited to this setup — it acts as an outsider`);
    if (a.as === "vendor2" && recipe && recipe.vendors < 2 && !normActs.some((x) => x.op === "add_vendor")) warnings.push(`act ${n}: QA vendor 2 is not invited in this setup — it acts as an uninvited vendor`);
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
          need === "evalFormUuid"
            ? `act ${n}: ${a.op === "library" ? `library case ${a.caseId}` : a.op === "request" ? "the request" : a.op} needs {{evalFormUuid}} — the evaluator's session and the form assigned to them; it needs a starting state no recipe builds (no recipe signs the evaluator in)`
            : `act ${n}: ${a.op === "library" ? `library case ${a.caseId}` : a.op === "request" ? "the request" : a.op} needs {{${need}}}, which ${recipe ? `setup "${recipe.id}"` : "the setup"} does not provide${by ? ` (an earlier ${by.join(" / ")} step would)` : ""}`,
        );
      }
    }
    if (a.params?.vendor && !["vendor", "vendor2"].includes(a.params.vendor)) errors.push(`act ${n}: params.vendor must be vendor or vendor2`);
    if (a.params?.round !== undefined) {
      if (!["pricing", "technical"].includes(a.params.round)) errors.push(`act ${n}: params.round must be pricing or technical`);
      else if (!op.path.includes("{{tradeId}}") && a.op !== "wait") errors.push(`act ${n}: ${a.op} does not act on a round, so params.round does not apply`);
      else if (a.params.round === "technical" && !have.has("rfpTradeId")) errors.push(`act ${n}: there is no technical round in setup "${recipe?.id}"`);
    }
    if (a.params?.price === null && a.op !== "surrogate_bid") errors.push(`act ${n}: only a surrogate_bid can be sent with no price (params.price null)`);
    else if (a.params?.price !== undefined && a.params.price !== null && !(typeof a.params.price === "number" && Number.isFinite(a.params.price))) errors.push(`act ${n}: params.price must be a number`);
    // A price is a parameter of the bid builders, not a body field: a change
    // that sets "price" on a bid step is read as params.price.
    if (["price_bid", "place_bid", "surrogate_bid", "price_cap"].includes(a.op) && Array.isArray(a.change)) {
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
        // a new key whose parent exists: the model forgot add:true
        if (!ch.add && !ch.remove && pathResolves(body, ch.path, true)) {
          ch.add = true;
          warnings.push(`act ${n}: "${ch.path}" is not a field of the ${a.op === "library" ? `${a.caseId}` : a.op} body — sent as a new field (add:true)`);
        } else {
          errors.push(`act ${n}: ${ch.add ? "the parent of " : ""}"${ch.path}" is not a field of ${a.op === "library" ? `${a.caseId}'s` : a.op === "request" ? "the request's" : `the ${a.op}`} body${ch.add ? "" : " (use add:true for a new field)"}`);
        }
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
    // a request body's own {{act…}} tokens must point back
    if (a.op === "request" && a.request?.body !== undefined)
      for (const t of tokensIn(a.request.body)) {
        const actRef = t.match(ACT_TOKEN);
        if (actRef && (Number(actRef[1]) >= n || Number(actRef[1]) < 1)) errors.push(`act ${n}: {{${t}}} refers to a step that has not run yet`);
      }
    if (a.expect !== undefined && !["accept", "reject", "no-5xx"].includes(a.expect)) errors.push(`act ${n}: expect must be accept, reject or no-5xx`);
    if (a.ifRefused !== undefined && !["pass", "inconclusive", "continue"].includes(a.ifRefused)) errors.push(`act ${n}: ifRefused must be pass, inconclusive or continue`);
    for (const pr of op.produces) have.add(pr);
    if (a.op === "add_vendor") have.add("vendor2Uuid");
    // a request that opens a bid / proposal gives the plan that record
    if (a.op === "request" && a.request) {
      const k = endpointKey(a.request.method, a.request.path);
      if (k === "POST /v1/bids") have.add("bidUuid");
      if (k === "POST /proposal") have.add("proposalUuid");
      if (k === "POST /template_responses") have.add("templateResponseUuid");
    }
    normActs.push(a);
  }
  // the decisive act: the one marked, else the last that is not a wait
  if (normActs.length && !normActs.some((a) => a.decisive)) {
    const last = [...normActs].reverse().find((a) => a.op !== "wait");
    if (last) last.decisive = true;
  }
  if (normActs.filter((a) => a.decisive).length > 1) errors.push("only one act can be the decisive one");
  // the decisive step follows the plan's outcome unless it says otherwise; a stale "no-5xx" on it follows the flip above
  for (const a of normActs) if (a.decisive && a.expect === "no-5xx" && outcome !== "no-5xx") delete a.expect;
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
    if (!op || (op.kind !== "read" && v.op !== "request")) {
      errors.push(`verify ${n}: "${String(v.op)}" is not a read-back (use one of: ${Object.values(OPS).filter((o) => o.kind === "read").map((o) => o.id).join(", ")}, or a GET request)`);
      normVerify.push(v);
      continue;
    }
    v.as = (v.as ?? op.actor) as ActorId;
    if (!op.actors.includes(v.as)) errors.push(`verify ${n}: ${v.op} cannot be read as ${v.as}`);
    let needs = [...op.needs];
    let path = op.path;
    if (v.op === "request") {
      const r = checkRequest(`verify ${n}`, v.request, true);
      if (r.req) {
        v.request = { method: "GET", path: r.req.path };
        needs = r.needs;
        path = r.req.path;
      }
    }
    if (path) v.as = fixActor(`verify ${n}`, v.as, op.actors, "GET", path);
    for (const need of needs) if (!have.has(need)) errors.push(`verify ${n}: ${v.op === "request" ? "the request" : v.op} needs {{${need}}}, which nothing provides`);
    const asserts = Array.isArray(v.assert) ? v.assert : [];
    if (!asserts.length) errors.push(`verify ${n}: no assertions`);
    if (asserts.length > LIMITS.asserts) errors.push(`verify ${n}: at most ${LIMITS.asserts} assertions`);
    const shape = READ_SHAPES[v.op as OpId];
    for (const as of asserts) {
      if (!as || !ASSERT_OPS.has(as.op)) {
        errors.push(`verify ${n}: unknown assertion op "${String(as?.op)}"`);
        continue;
      }
      // "status equals 200" on a field called status means the HTTP status (a round's own status is "active", never 200)
      if ((as.op === "equals" || as.op === "one_of") && typeof as.path === "string" && /(^|\.)status$/.test(as.path.replace(/^\$\.?/, "")) && [200, 201, 202, 204].includes(Number(Array.isArray(as.value) ? as.value[0] : as.value))) {
        warnings.push(`verify ${n}: "${as.path} equals ${JSON.stringify(as.value)}" read as the HTTP status check`);
        as.op = "status_2xx";
        as.path = "$";
        delete (as as { value?: unknown }).value;
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
      if (!shape && top) warnings.push(`verify ${n}: ${v.op === "request" ? "the request" : v.op}'s reply shape has not been sampled; "${as.path}" is unverified`);
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
    setup: {
      recipe: recipeId,
      ...(Number((p.setup as any)?.lineItems) > 1 ? { lineItems: Math.min(500, Math.floor(Number((p.setup as any).lineItems))) } : {}),
      ...((p.setup as any)?.fromPr ? { fromPr: { items: Math.max(1, Math.min(10, Math.floor(Number((p.setup as any).fromPr.items) || 1))) } } : {}),
    },
    act: normActs,
    verify: normVerify,
    expected: {
      outcome: outcome ?? "no-5xx",
      ...(code && outcome === "reject" ? { code } : {}),
      ...(message && outcome === "reject" ? { message } : {}),
      ...(code && outcome === "reject" && codeInferred ? { codeInferred: true } : {}),
    },
    ...(typeof p.dependsOnSetting === "string" && p.dependsOnSetting.trim() ? { dependsOnSetting: p.dependsOnSetting.trim().slice(0, 240) } : {}),
  };
  return { ok: errors.length === 0, errors, warnings, soft, plan };
}

/** The endpoints a plan sends, "METHOD /route/:id", in order (waits and library-less ops resolved). */
export function planEndpoints(plan: ApiPlan): { all: string[]; decisive?: string } {
  const all: string[] = [];
  let decisive: string | undefined;
  const ep = (a: { op: OpId; caseId?: string; request?: OwnRequest }): string[] => {
    if (a.op === "wait") return [];
    if (a.op === "request") return a.request ? [endpointKey(a.request.method, a.request.path)] : [];
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
    // The invited vendors read as vendors: "publishes the event to 1 vendor", not "with 1 audience company uuids".
    if (Array.isArray(v) && field === "audience company uuids") return v.length ? `to ${v.length} vendor${v.length === 1 ? "" : "s"}` : "with no vendor invited";
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

/**
 * A step with a price says the price (Aanya, 28 Oct: "why can't the buyer place surrogate bid??" — the
 * step read "enters a bid on a vendor's behalf", Failed, when the bid of 100 had gone in at a cap of 100
 * and the case wanted it refused).
 */
function pricedWords(a: ActStep): string | undefined {
  const p = a.params?.price;
  if (p === undefined) return undefined;
  const at = p === null ? "with no price" : `of ${p}`;
  switch (a.op) {
    case "price_cap":
      return p === null ? undefined : `sets the invited vendor's price cap on the round to ${p} (a bid must be strictly below it)`;
    case "surrogate_bid":
      return `enters a surrogate bid ${at} on the vendor's behalf`;
    case "price_bid":
      return p === null ? "prices the line on the bid with no price" : `prices the line on the bid at ${p}`;
    case "place_bid":
      return `places a complete bid ${at} (open, price, submit)`;
    default:
      return undefined;
  }
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
  if (a.op === "request" && a.request) {
    const what = endpointInWords(a.request.method, a.request.path);
    return `${who.charAt(0).toUpperCase()}${who.slice(1)} sends ${what}, the request the case itself writes${changeWords(a.change)}.`;
  }
  let verb = pricedWords(a) ?? OPS[a.op]?.does ?? a.op;
  if (a.params?.round) verb = verb.replace(/\bthe (live )?round\b|the round's|the pricing round/, (m) => (a.params!.round === "technical" ? m.replace(/round|pricing round/, "technical round") : m.replace(/\bround\b/, "pricing round").replace("pricing pricing", "pricing")));
  const forWho = a.params?.vendor ? ` for ${ACTOR_WORD[a.params.vendor]}` : "";
  return `As ${who}, ${verb.replace(/^(\w)/, (m) => m)}${forWho}${changeWords(a.change)}.`.replace(/^As the buyer, /, "The buyer ").replace(/^As (the invited QA vendor|a second QA vendor), /, (_m, w) => `${w.charAt(0).toUpperCase()}${w.slice(1)} `);
}

function assertWords(a: Assertion): string {
  if (a.say) return a.say;
  // which kind of check it is, so a reader sees status, schema and data checks apart
  const kind = a.op === "status" || a.op === "status_2xx" ? "Status check" : a.op === "exists" || a.op === "absent" || a.op === "type_is" || a.op === "format" || a.op === "non_empty" ? "Schema check" : "Data check";
  return `${kind}: ${assertWordsBare(a)}`;
}

function assertWordsBare(a: Assertion): string {
  const f = a.path ? `“${a.path.replace(/\[\*\]/g, "").replace(/\{\{vendor2Uuid\}\}/g, "QA vendor 2").replace(/\{\{vendorUuid\}\}/g, "QA vendor 1").replace(/\{\{lineItemUuid\}\}/g, "the line").replace(/\{\{\w+\}\}/g, "…").replace(/_/g, " ").replace(/\./g, " › ")}”` : "the reply";
  const v = typeof a.value === "string" ? a.value.replace(/\{\{act(\d)\.body\.([\w.]+)\}\}/, (_m, n, k) => `the ${k.replace(/_/g, " ")} sent in step ${n}`) : JSON.stringify(a.value);
  switch (a.op) {
    case "status": return `the reply's status code is ${statusInWords(Number(a.value))}`;
    case "status_2xx": return "the reply's status code is a success (2xx — the request worked)";
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
    case "type_is": return `${f} is a ${(Array.isArray(a.value) ? a.value : [a.value]).map((t) => ({ string: "text", number: "number", boolean: "yes/no value", array: "list", object: "group of fields", null: "empty value" } as Record<string, string>)[String(t)] ?? t).join(" or ")}`;
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
  const does = v.op === "request" && v.request ? `read ${endpointInWords("GET", v.request.path)}` : imperative(OPS[v.op]?.does ?? v.op);
  return `As ${who}, ${does} and check that ${v.assert.map(assertWords).join("; ")}.`;
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
  /**
   * The plainest flow there is — "publish an RFP event with 1 line item" —
   * must never depend on the model answering well: seen 2026-10-08, both fast
   * attempts came back invalid and the reader was told no test could be
   * written for it. Last in the list, so every rule about a refusal wins, and
   * nothing that qualifies the publish (a refusal, a bid, an award, a
   * deadline…) reaches it: those are other cases.
   */
  {
    re: /^(?!.*\b(without|no|not|zero|negative|invalid|empty|blank|missing|wrong|reject\w*|refus\w*|fail\w*|error\w*|exceed\w*|more than|beyond|limit\w*|duplicat\w*|expired|past|after|deadline|cannot|can't|twice|again|bid\w*|award\w*|evaluat\w*|withdr\w*|extend\w*|amend\w*|version\w*|cancel\w*|auction\w*)\b)(?=.*\b(publish\w*|creat\w*|float\w*|launch\w*|go live)\b)(?=.*\b(rfp|rfi|technical|tech|rfq|rfqs|quotation)\b)/s,
    plan: (_m, t) => {
      const rfp = /\b(rfp|rfi|technical|tech)\b/.test(t);
      const rfq = /\b(rfq|rfqs|quotation)\b/.test(t);
      return {
        setup: { recipe: "draft_event" },
        act: [
          ...(rfp ? [{ op: "add_rfp_round", expect: "accept", say: "The buyer adds the technical (RFP) round." } as ActStep] : []),
          ...(rfq ? [{ op: "add_rfq_round", expect: "accept", say: "The buyer adds the pricing (RFQ) round." } as ActStep] : []),
          { op: "publish_event", decisive: true },
        ],
        verify: [{ op: "read_event", assert: [{ path: "status", op: "equals", value: "active" }] }],
        expected: { outcome: "accept" },
      };
    },
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

// ── read-backs added in code (10 Nov) ────────────────────────────────────────

/** The event's status right after its recipe is built. */
function recipeEventStatus(r: Recipe): "draft" | "active" | undefined {
  if (!r.eventType) return undefined;
  return r.steps.includes("publish") ? "active" : "draft";
}

/** What the plan knows after act `upto` (placeholders the setup and the acts so far provide). */
function providedAfter(plan: ApiPlan, upto: number): Set<string> {
  const have = new Set<string>(RECIPES[plan.setup.recipe]?.provides ?? []);
  for (const a of plan.act.slice(0, upto + 1)) {
    for (const pr of OPS[a.op]?.produces ?? []) have.add(pr);
    if (a.op === "add_vendor") have.add("vendor2Uuid");
    if (a.op === "request" && a.request) {
      const k = endpointKey(a.request.method, a.request.path);
      if (k === "POST /v1/bids") have.add("bidUuid");
      if (k === "POST /proposal") have.add("proposalUuid");
    }
  }
  return have;
}

/**
 * A plan with no read-back gets one, decided from its decisive step and outcome: an accepted change is
 * read back as kept (the title sent, the status reached, a bid counted, a proposal present); a refused
 * one as not applied (the status unchanged, no extra bid). Only reads whose fields were seen in real
 * replies (READ_SHAPES); when the validator does not accept the read, the plan stays as it was.
 */
export async function autoVerify(plan: ApiPlan): Promise<{ plan: ApiPlan; added?: string }> {
  if (plan.verify.length || !plan.act.length) return { plan };
  const recipe = RECIPES[plan.setup.recipe];
  if (!recipe) return { plan };
  const di = plan.act.findIndex((a) => a.decisive);
  if (di < 0) return { plan };
  const a = plan.act[di];
  const n = di + 1;
  const outcome = plan.expected.outcome;
  if (outcome === "no-5xx") return { plan };
  const accept = outcome === "accept";
  const have = providedAfter(plan, di);
  const status0 = recipeEventStatus(recipe);
  const lc = a.op === "library" && a.caseId ? library().byId.get(a.caseId) : undefined;
  const key = a.op === "library" ? (lc ? endpointKey(lc.method, lc.path) : "") : a.op === "request" && a.request ? endpointKey(a.request.method, a.request.path) : OPS[a.op]?.method ? endpointKey(OPS[a.op].method, OPS[a.op].path) : "";
  const body: any = a.op === "library" ? lc?.body : a.op === "request" ? a.request?.body : undefined;
  const changes = a.change ?? [];
  const eventShape = READ_SHAPES.read_event ?? [];
  let v: VerifyStep | undefined;
  const readEvent = (assert: Assertion[]): VerifyStep | undefined => (have.has("eventGroupUuid") && assert.length ? { op: "read_event", as: "buyer", assert } : undefined);
  const readRound = (assert: Assertion[]): VerifyStep | undefined => (have.has("tradeId") && assert.length ? { op: "read_round", as: "buyer", assert } : undefined);
  if (a.op === "update_event" || (key === "PATCH /event_groups/:id" && a.op !== "publish_event" && a.op !== "withdraw_event")) {
    // the scalar fields the step sets, read back as sent (a title set by the template included)
    const setKeys = new Set<string>();
    for (const ch of changes) if (!ch.remove && typeof ch.set !== "object" && /^[A-Za-z_]\w*$/.test(ch.path) && eventShape.includes(ch.path)) setKeys.add(ch.path);
    if (body && typeof body === "object") for (const [k, val] of Object.entries(body)) if (val !== null && typeof val !== "object" && eventShape.includes(k) && k !== "status") setKeys.add(k);
    if (a.op === "update_event" && !changes.some((c) => c.path === "title" && c.remove)) setKeys.add("title");
    const statusTo = changes.find((c) => c.path === "status" && typeof c.set === "string")?.set ?? (typeof body?.status === "string" ? body.status : undefined);
    if (accept) {
      const asserts: Assertion[] = [...setKeys].filter((k) => k !== "status").slice(0, 4).map((k) => ({ path: k, op: "equals" as const, value: `{{act${n}.body.${k}}}`, say: `the event's ${k.replace(/_/g, " ")} is what step ${n} sent` }));
      if (typeof statusTo === "string" && eventShape.includes("status")) asserts.push({ path: "status", op: "equals", value: statusTo, say: `the event's status is ${statusTo}` });
      v = readEvent(asserts);
    } else if (setKeys.has("title")) {
      v = readEvent([{ path: "title", op: "not_equals", value: `{{act${n}.body.title}}`, say: `the event's title is not the one step ${n} sent (nothing changed)` }]);
    } else if (status0) {
      v = readEvent([{ path: "status", op: "equals", value: status0, say: `the event is still ${status0} (nothing changed)` }]);
    }
  } else if (a.op === "publish_event") {
    v = readEvent([{ path: "status", op: "equals", value: accept ? "active" : "draft", say: accept ? "the event is live" : "the event is still a draft (not published)" }]);
  } else if (a.op === "withdraw_event") {
    v = readEvent([{ path: "status", op: "equals", value: accept ? "withdrawn" : status0 ?? "active", say: accept ? "the event is withdrawn" : `the event is still ${status0 ?? "active"} (not withdrawn)` }]);
  } else if (a.op === "create_draft" && accept) {
    v = readEvent([{ path: "status", op: "equals", value: "draft", say: "the new event is a draft" }]);
  } else if (a.op === "add_rfq_round" || a.op === "add_rfp_round") {
    if (accept) v = readEvent([{ path: "stages", op: "count_gte", value: 1, say: "the event carries the round" }]);
    else if (recipe.id === "draft_event") v = readEvent([{ path: "stages", op: "count", value: 0, say: "the event still has no round (nothing was added)" }]);
  } else if (a.op === "place_bid" || a.op === "submit_bid" || a.op === "surrogate_bid") {
    v = readRound(accept ? [{ path: "bid_count", op: "gte", value: recipe.bids + 1, say: "the round counts the new bid" }] : [{ path: "bid_count", op: "equals", value: recipe.bids, say: "the round counts no new bid (the refused bid left nothing)" }]);
  } else if ((a.op === "open_bid" || a.op === "price_bid") && !accept) {
    // a refused opening/pricing leaves no submitted bid behind
    v = readRound([{ path: "bid_count", op: "equals", value: recipe.bids, say: "the round counts no new bid (nothing was created)" }]);
  } else if (a.op === "convert_to_auction") {
    // the event's rounds: the auction round is added to the pricing round (accept), or nothing is (reject)
    const rounds = recipe.steps.filter((st) => st === "add_stage_rfp" || st === "add_stage_pricing").length + plan.act.slice(0, di).filter((x) => x.op === "convert_to_auction" || x.op === "add_rfq_round" || x.op === "add_rfp_round").length;
    v = readEvent(accept ? [{ path: "stages", op: "count_gte", value: rounds + 1, say: "the event carries the new auction round" }] : [{ path: "stages", op: "count", value: rounds, say: "the event has no new round (the conversion left nothing)" }]);
  } else if ((a.op === "open_proposal" || a.op === "award_vendor") && accept) {
    v = readEvent([{ path: "proposals", op: "non_empty", say: "the event carries the award proposal" }]);
  }
  if (!v) return { plan };
  const withV: ApiPlan = { ...plan, verify: [v] };
  const check = await validatePlan(withV);
  if (!check.ok) return { plan };
  return { plan: check.plan, added: `a read-back was added in code: ${verifyInWords(v)}` };
}

// ── the journey-step mutation family (API-N*), planned in code (10 Nov) ──────

/**
 * "Send `POST /trade/template_input` exactly as the journey does. Remove `widgets.inline_components[0].name`
 * from the body." — one request of the event journey with one field removed or mistyped, expected refused.
 * 138 written cases have exactly this shape. The journey's request IS the op's template body, so the case
 * is the op plus the one change; the setup is the journey cut just before that step.
 */
const JOURNEY_STEP_OPS: Record<string, { op: OpId; as: ActorId; recipe: RecipeId; arrange: ActStep[] }> = {
  "POST /event_groups": { op: "create_draft", as: "buyer", recipe: "none", arrange: [] },
  "POST /trade/template_input": { op: "add_rfq_round", as: "buyer", recipe: "draft_event", arrange: [] },
  "PATCH /event_groups/:id": { op: "publish_event", as: "buyer", recipe: "draft_rfq", arrange: [] },
  "POST /v1/bids": { op: "open_bid", as: "vendor", recipe: "published_rfq", arrange: [] },
  "POST /v1/bids/:id/create_bid_products": { op: "price_bid", as: "vendor", recipe: "published_rfq", arrange: [{ op: "open_bid", as: "vendor", expect: "accept", say: "The invited QA vendor opens a bid on the pricing round." }] },
  "PATCH /v1/bids/:id": { op: "submit_bid", as: "vendor", recipe: "published_rfq", arrange: [{ op: "open_bid", as: "vendor", expect: "accept", say: "The invited QA vendor opens a bid on the pricing round." }, { op: "price_bid", as: "vendor", expect: "accept", say: "The vendor prices the line on the bid." }] },
  "POST /template_responses": { op: "start_tech_response", as: "vendor", recipe: "published_rfp_rfq", arrange: [] },
  "POST /template_responses/create_surrogate_response": { op: "surrogate_tech_response", as: "buyer", recipe: "published_rfp_rfq", arrange: [] },
  "POST /bids/template_input": { op: "surrogate_bid", as: "buyer", recipe: "published_rfq", arrange: [] },
  "POST /proposal": { op: "open_proposal", as: "buyer", recipe: "closed_rfq_with_bid", arrange: [] },
  "POST /proposal/:id/add_response": { op: "award_vendor", as: "buyer", recipe: "closed_rfq_with_bid", arrange: [{ op: "open_proposal", as: "buyer", expect: "accept", say: "The buyer opens the award proposal." }] },
  "POST /item_versions": { op: "new_version", as: "buyer", recipe: "awarded_rfq", arrange: [] },
  "POST /trade/move_to_auction": { op: "convert_to_auction", as: "buyer", recipe: "rfq_with_bid", arrange: [] },
};

export function journeyMutation(text: string, caseId?: string): { plan: Omit<ApiPlan, "version">; note: string } | { none: string } | null {
  const m = text.match(/Send `(GET|POST|PATCH|PUT) ([^`]+)` exactly as the journey does\.\s*([\s\S]*?)(?:\nExpected:|$)/);
  if (!m) return null;
  const [, method, rawPath, rest] = m;
  const key = `${method} ${rawPath.replace(/:[a-z_]+/g, ":id").split("?")[0]}`;
  const spec = JOURNEY_STEP_OPS[key];
  if (!spec) return { none: `the step the case mutates (${method} ${rawPath}) is not an operation the plan vocabulary sends — the journey's request for it has no builder here` };
  const op = spec.op === "add_rfq_round" && (/\bRFP\b|technical/i.test(text.split("\n")[0]) || /^API-NRFPSTG/.test(caseId ?? "")) ? "add_rfp_round" : spec.op;
  const change: Change[] = [];
  const rm = rest.match(/Remove `([^`]+)` from the body/);
  const st = rest.match(/Send `([^`]+)` as (.+?) \(it is (\w+) in a working request\)/);
  if (rm) change.push({ path: rm[1], remove: true });
  else if (st) {
    let val: unknown = st[2].trim();
    try {
      val = JSON.parse(st[2].trim());
    } catch {
      val = st[2].trim().replace(/^"|"$/g, "");
    }
    change.push({ path: st[1], set: val });
  } else return { none: `the change the case makes to the journey's request (“${rest.trim().slice(0, 80)}”) is not one the plan language writes (remove a field / send it with another type)` };
  const expectedText = text.match(/\nExpected:\s*([\s\S]*)$/)?.[1] ?? "";
  const outcome: Outcome = /refus|reject|4xx|not (?:created|accepted)|error/i.test(expectedText) ? "reject" : /accept|2xx|200|created|succeed/i.test(expectedText) ? "accept" : "no-5xx";
  const field = change[0].path.split(".").pop()!.replace(/\[\d+\]$/, "").replace(/_/g, " ");
  return {
    plan: {
      ...(caseId ? { caseId } : {}),
      title: text.split("\n")[0].slice(0, 140),
      setup: { recipe: spec.recipe },
      act: [...spec.arrange.map((a) => ({ ...a })), { op, as: spec.as, change, decisive: true, say: `${spec.as === "buyer" ? "The buyer" : "The invited QA vendor"} ${OPS[op].does}, exactly as the journey does, ${rm ? `with the ${field} left out of the body` : `with the ${field} sent as ${JSON.stringify(change[0].set)}`}.` }],
      verify: [],
      expected: { outcome },
    },
    note: `planned in code: one journey request (${key}) with one field ${rm ? "removed" : "mistyped"}`,
  };
}

/** Dotted paths of a body's keys, for the model's eyes ("line_items[0].quantity.value"). */
function bodyKeyPaths(body: unknown, depth = 3, prefix = ""): string[] {
  if (body === null || typeof body !== "object" || depth === 0) return [];
  const out: string[] = [];
  if (Array.isArray(body)) {
    if (body.length) out.push(...bodyKeyPaths(body[0], depth, `${prefix}[0]`));
    return out;
  }
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (FORMATS.encodedId.test(k) || /^\{\{/.test(k)) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    out.push(p);
    if (v && typeof v === "object") out.push(...bodyKeyPaths(v, depth - 1, p));
  }
  return out;
}

let bodyKeysText: string | undefined;
/** The real field paths of every write op's template body (so the model names fields that exist). */
async function bodyKeysPrompt(): Promise<string> {
  if (bodyKeysText !== undefined) return bodyKeysText;
  const lines: string[] = [];
  for (const op of Object.values(OPS)) {
    if (op.kind !== "write" || op.id === "library" || op.id === "request" || op.id === "place_bid") continue;
    const b = await sampleBody(op.id).catch(() => undefined);
    const keys = bodyKeyPaths(b, 3);
    if (!keys.length) continue;
    const shown = keys.length > 28 ? [...keys.slice(0, 28), `… (${keys.length - 28} more)`] : keys;
    lines.push(`  ${op.id}: ${shown.join(", ")}`);
  }
  bodyKeysText = lines.join("\n");
  return bodyKeysText;
}

// ── compiling: the model (fast tier; reason tier once, if allowed) ──────────

async function vocabularyPrompt(cands: TestCaseRecord[]): Promise<string> {
  const bodyKeys = await bodyKeysPrompt();
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
  request: the case's OWN request when it names METHOD /path (and a body) and no operation covers it —
    {"op":"request","as":"buyer|vendor","request":{"method":"PATCH","path":"/bids/{{bidUuid}}/reject","body":{"rejection_remarks":"QA_Platform_{{stamp}}","allow_rebidding":true}}}
    routes allowed: ANY path under /event_groups /trade /v1/trade /bids /v1/bids /template_responses /evaluations /proposal /item_versions /additional_request /reminders /v1/chats /templates/upload_attachment /v1/attachments
      (e.g. /trade/upload_file, /trade/{{tradeId}}/edit_weight_parameters, /bids/{{bidUuid}}/reject, /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}});
    ids ONLY from the TOKENS list below (never <description>), except the two probe ids: Z2dnWmdaUWtnZw== = a record that does not exist, WrongUuid1= = a garbled id;
    the body is the one the case writes (a write with no body is refused); a verify step may be a GET request: {"op":"request","request":{"method":"GET","path":"/reminders/{{eventGroupUuid}}?resource_type=event_group"},"assert":[…]}
  BODY FIELDS of each operation's working request (dotted paths you may set/remove with "change"; a path not listed needs add:true):
${bodyKeys}
  Notes: add_rfq_round / add_rfp_round "data" = the round template's line items (set [] for "a template with no line items");
  update_event: title (default "QA_Platform_Renamed_{{stamp}}"); withdraw_event: withdraw_remark.remarks, status; extend_round: increase_auction_time (epoch seconds; default roundEnd+60), remarks
  price_bid / surrogate_bid: the price is params.price (a number) — a bid is never a library case. A surrogate bid with NO price: params.price null
  price_cap: the cap per unit is params.price, for the invited vendor (params.vendor "vendor2" for the second); a bid must be strictly BELOW it (equal is refused)  open_bid: trade_request_uuid, company_uuid
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
  /** the answer did not come from the gateway's model: "unreachable: …" or "fallback: <model>" */
  gateway?: string;
  /** the model answered, but not with valid JSON (cut off, or prose around it) — a model problem, not the gateway's */
  badJson?: string;
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
    `${await vocabularyPrompt(cands)}\n\n${EXAMPLES}\n\n${worked ? `${worked}\n\n` : ""}RULES: the setup must create the state the case starts from (closed_* = the window is over; *_short = still open but closing in ~2 min, so a wait can see it close). ` +
    `The decisive act is the one the case is about; earlier acts arrange (they must succeed; when an arrange act carries the case's own invalid input, give it "ifRefused":"pass"). Use verify read-backs when the case says something is kept, changed, shown or not changed. ` +
    `expected.code only when the app's error code is known (33 order not active/window over, 712 RFP ends after RFQ, 536 not allowed to view, 455/101 not authorised, 95 stage closed or withdrawn, 2 insufficient parameters, 801 proposal exists, 96 the vendor already bid themselves (surrogate refused), 99 a surrogate bid already exists for the vendor, 737 technical response pending, 512 cannot remove a vendor who already participated, 782 uninvited vendor cannot bid, 34 a bid already placed from your team, 875 revise locked after submission, 94 already converted to auction); otherwise leave it out. ` +
    `When the outcome hangs on a company setting or gate the plan cannot switch, still plan the steps and set "dependsOnSetting":"<the setting>" on the plan. ` +
    `Use no-5xx only when the case is about not crashing; a case that says something is REFUSED by the app (cannot / not allowed / HTTP 4xx / an error code) expects reject — but "the buyer rejects a bid", "the vendor regrets a line", "blocks the vendor" are product ACTIONS the app performs on request: plan them as accept unless the case says the app turns them away — and the setup + earlier acts must create the state that makes the app refuse it. A case that says something works or is kept expects accept, with a verify read-back of what was kept. ` +
    `Send each step as the actor whose app may call it: /v1/bids and bid submission are the vendor's (as "vendor"); event, round, audience, surrogate, award and indicator calls are the buyer's.\n\n` +
    `TEST CASE:\n"""${text.slice(0, 2000)}"""\n\n` +
    (repair ? `Your previous answer:\n${repair.previous.slice(0, 1800)}\nIt failed validation:\n- ${repair.errors.slice(0, 8).join("\n- ")}\nFix it.\n\n` : "") +
    `Reply: {"plan":{"title":"…","setup":{"recipe":"…"},"act":[…],"verify":[…],"expected":{"outcome":"accept|reject|no-5xx","code":"…"}},"gaps":["what the plan does not check"]}`;
  const before = usageReport().byModel;
  let raw: string;
  try {
    raw = await chat(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { tier, maxTokens: tier === "reason" ? 2400 : 3000 },
    );
  } catch (e) {
    return { plan: null, gaps: [], gateway: `unreachable: ${String((e as Error).message ?? e).slice(0, 160)}` };
  }
  // Which model answered: a Slingring answer is tallied under the model the gateway served (lastServedModel);
  // a call tallied under any other model came from the next provider in the chain (Groq, Gemini).
  const after = usageReport().byModel;
  const answered = Object.keys(after).filter((m) => (after[m]?.calls ?? 0) > (before[m]?.calls ?? 0));
  const fallback = answered.find((m) => m !== lastServedModel);
  const a = parseModel(raw);
  if (!a) {
    // an answer that starts as JSON but does not parse was cut off or wrapped in prose: the model's doing, retried with a repair
    if (/\{\s*"plan"/.test(raw) && !fallback) return { plan: null, gaps: [], badJson: `the answer was not valid JSON (${raw.length} chars, ${/\}\s*$/.test(raw.trim()) ? "malformed" : "cut off"})` };
    return { plan: null, gaps: [], gateway: fallback ? `fallback: ${fallback}` : `unreachable: the answer was not JSON (${raw.trim().slice(0, 80) || "empty"})` };
  }
  (a as any).raw = raw;
  if (fallback) a.gateway = `fallback: ${fallback}`;
  return a;
}

// ── coverage, decided in code ───────────────────────────────────────────────

const UI_WORDS = /\b(?:screen|page|button|click\w*|drawer|modal|popup|toast|tooltip|dropdown|menu|visible on|displayed|render\w*|colou?r|highlight\w*|grid|badge|icon|scroll)\b/;
const STATE_WORDS = /\bkeeps?\b|\bkept\b|\bretain\w*|\bpersist\w*|\bstill\b|\bafterwards?\b|\bread[- ]?back\b|\bunchanged\b|\bupdates?\b.*\bfor\b|\bshows?\b|\bsees?\b|\bstored\b|\bsaved\b|\bnot (?:changed|created)\b|\bnothing (?:is )?(?:created|changed)\b/;
const OUT_OF_SCOPE = /\b(e-?mail(?:ed|s)?|notification|sms|whatsapp|pdf|excel|download|report|performance|load|concurren\w*|seconds? to load|purchase order|\bpo\b|invoice|grn|bulk upload|erp|sap)\b/;

/**
 * Product ACTIONS that share a word with a refusal: "the buyer rejects a bid", "the vendor regrets a line",
 * "blocks the vendor", "cancels the round" are things the app does on request, not the app turning the
 * request away. They are taken out of the words before the polarity is read.
 */
const DOMAIN_OBJECTS = "bids?|vendors?|participants?|proposals?|offers?|lines?|line items?|events?|rounds?|requests?|responses?|quotes?|suppliers?|re-?bidding";
const DOMAIN_ACTIONS = new RegExp(`\\b(reject|regret|block|cancel|discard|disallow|decline|remove|revoke)\\w*\\s+(?:(?:a|an|the|its|his|her|their|that|this|each|every|one|all|both|qa|vendor\\s*\\d?'?s?|submitted|draft|own|same)\\s+)*(?:${DOMAIN_OBJECTS})\\b`, "g");
/** the same actions in the passive: "the bid is rejected", "the vendor was blocked" */
const DOMAIN_ACTIONS_PASSIVE = new RegExp(`\\b(?:${DOMAIN_OBJECTS})\\s+(?:is|are|was|were|gets?|got|has been|have been|stays?|remains?)\\s+(?:now\\s+)?(?:reject|regret|block|cancel|discard|remov|revok|declin)\\w*`, "g");

export function polarityOf(t: string): Outcome | null {
  const s = t.toLowerCase().replace(DOMAIN_ACTIONS, "acts on it").replace(DOMAIN_ACTIONS_PASSIVE, "it is acted on");
  if (/\b(500|5xx|crash\w*|server error|must not break|never breaks?)\b/.test(s)) return "no-5xx";
  // the HTTP status the case names says it plainly
  if (/\bhttp\s*(?:4\d\d|4xx)\b|\b(?:422|401|403|404|400|409)\b[ ,]*(?:code|unprocessable|unauthori)/.test(s)) return "reject";
  if (/\bhttp\s*(?:2\d\d|2xx)\b/.test(s) && !/\b(cannot|can't|refus\w*|not allowed|is denied|must not|should not)\b/.test(s)) return "accept";
  // "code 33 'Order not active'" — an app error code with its message is a refusal
  if (/\bcode\s+\d{1,4}\b\s*['‘"“]/.test(s)) return "reject";
  // "is not blocked", "no savings error", "publishes without error" — the absence of a refusal is acceptance
  if (/\b(?:is|are|was|were)\s+not\s+(?:blocked|refused|rejected|denied|prevented|stopped)\b|\bno\s+(?:[a-z-]+\s+)?error\b|\bwithout\s+(?:an?\s+)?(?:[a-z-]+\s+)?error\b|\bnot\s+(?:blocked|refused|rejected|denied|prevented)\b/.test(s)) return "accept";
  // "no second award can be started", "never lets a vendor…" — a negated ability is a refusal
  if (/\bno\b[^.;]{0,40}\bcan\b|\bnever\s+(?:lets?|allows?|accepts?|permits?)\b|\bmust\s+(?:never|not)\b/.test(s)) return "reject";
  if (/\b(cannot|can't|can not|not allowed|refus\w*|reject\w*|block\w*|prevent\w*|disallow\w*|is denied|fails?|error|invalid|must not|should not|isn't allowed|not be able)\b/.test(s)) return "reject";
  // "check whether a vendor can bid…" is a question, not an expected outcome
  if (/\b(whether|check if|verify if|see if|find out if)\b|\?/.test(s)) return null;
  if (/\b(can|succeeds?|accept\w*|allowed|works?|updates?|changes?|is saved|is created|shows?|2xx|200)\b/.test(s)) return "accept";
  return null;
}

/** A model gap that admits the plan tests something else than the case ("…instead", "verifies only…"). */
const SUBSTITUTE_SIGNAL = /\binstead\b|verifies only|checks only|tests only|only (?:verifies|checks|tests|exercises|covers) (?:that|the|whether)|substitut|as a proxy|approximat|\b(?:setup|recipe)s?\b[^.;]{0,50}\b(?:cannot|can't|does not|do not|is unable|are unable)\b|\bno (?:setup )?recipe (?:creates|provides|builds|signs|gives)|\bcannot (?:create|build|arrange|set up|establish|prepare)\b/i;

function judgeCoverage(text: string, plan: ApiPlan, modelGaps: string[], extra: string[], heads: string[] = []): { coverage: "full" | "partial"; gaps: string[] } {
  // a gap in which the model says the decisive step stands in for the case's point is named as such, so routing sees it is about the point
  const gaps = [...modelGaps.filter((g) => g.trim()).map((g) => (SUBSTITUTE_SIGNAL.test(g) && !/^the decisive step/.test(g) ? `the decisive step tests something else than the case's point: ${g}` : g)), ...extra];
  const t = text.toLowerCase();
  // the title says what the case expects; the long prose (code notes) is noisy
  const pol = casePolarity({ text, heads });
  if (pol && pol !== plan.expected.outcome && !(pol === "reject" && plan.expected.outcome === "no-5xx" && /should|must|ideally/.test(t)) && !(pol === "no-5xx" && plan.expected.outcome === "reject"))
    gaps.push(`the case reads as “${OUTCOME_WORD[pol]}”, but the plan checks “${OUTCOME_WORD[plan.expected.outcome]}”`);
  if (STATE_WORDS.test(t) && !plan.verify.length) gaps.push("it does not read the record back to confirm what was kept or shown");
  if (plan.dependsOnSetting) gaps.push(`it depends on a company setting this run does not change (${plan.dependsOnSetting}) — a failure is reported as couldn't tell, not as a bug`);
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
  let gateway: string | undefined;
  const heads = cat ? [cat.title, cat.expected].filter(Boolean) : [];
  const ctx: ValidateContext = { text, heads };
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
      ...(gateway ? { gateway } : {}),
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
  /** a validated plan → its read-back (when none), then its coverage */
  const finish = async (v: Validation, modelGaps: string[], extra: string[], rest: Partial<CompiledApiPlan> & Pick<CompiledApiPlan, "source">): Promise<CompiledApiPlan> => {
    // a company setting / gate the case names is one the run does not change: a failure is "couldn't tell", not a bug
    if (!v.plan.dependsOnSetting) {
      const gate = text.match(/\bgate:\s*`?([A-Za-z_][\w.]*)`?/i)?.[1] ?? text.match(/`([a-z_]{6,})`\s+(?:is|set|switched|turned)\s+(?:on|off)\b/i)?.[1] ?? text.match(/\b(?:setting|config(?:uration)?|flag)\s+`([a-z_]{6,})`/i)?.[1];
      if (gate) v.plan.dependsOnSetting = gate.slice(0, 120);
    }
    const av = await autoVerify(v.plan);
    const cov = judgeCoverage(text, av.plan, modelGaps, extra, heads);
    return out({ ...rest, plan: av.plan, coverage: cov.coverage, gaps: cov.gaps, warnings: [...(rest.warnings ?? v.warnings), ...(av.added ? [av.added] : [])] });
  };

  // 0 · one journey request with one field removed or mistyped (API-N*): planned in code, no model.
  if (!opts.modelOnly) {
    const jm = journeyMutation(text, input.caseId);
    if (jm && "none" in jm) return out({ plan: null, coverage: "none", gaps: [jm.none], source: "rules" });
    if (jm) {
      const v = await validatePlan({ ...jm.plan, version: PLAN_VERSION }, ctx);
      if (v.ok) return finish(v, [], [], { source: "rules", warnings: [...v.warnings, jm.note], candidates: [] });
    }
  }

  // 1 · a case that IS, or cites, a runnable library case: compiled without a model.
  let libraryUnbuilt: string | undefined;
  if (!opts.modelOnly) {
    const refIds = [libCase?.id, ...(cat?.refs ?? [])].filter((x): x is string => !!x && lib.byId.has(x));
    const usable = refIds.map((id) => lib.byId.get(id)!).find((c) => !libraryCaseProblem(c));
    if (usable) {
      const { plan, gaps, unbuilt } = await planFromLibraryCase(usable, input.caseId);
      if (cat) plan.title = cat.title;
      const v = await validatePlan(plan, ctx);
      // A starting state no recipe builds would make the library request test
      // the wrong thing (and a "failure" a false positive): the model may
      // arrange it with extra steps; without one, there is no plan.
      if (v.ok && unbuilt) libraryUnbuilt = `the starting state “${unbuilt}” is more specific than any recipe — library case ${usable.id} cannot run as written on a fresh record`;
      else if (v.ok) return finish(v, [], gaps, { source: "library-case", candidates: [usable.id] });
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
          const v = await validatePlan(fit.plan, ctx);
          if (v.ok && !v.soft.length)
            return finish(v, [], [], { source: "exemplar", warnings: [...v.warnings, fit.why], candidates: [fit.from.ex.id], exemplars: exSummary(exHits), reusedFrom: fit.from.ex.id });
        }
      }
      worked = ex.workedExamples(exHits.slice(0, 4));
    } catch (e) {
      worked = "";
      console.warn(`[apiPlanner] exemplars unavailable: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  // "Same as the happy path (API-EVDWGT-013) with …": the case the words point at is shown to the model too
  const pointedAt = [...new Set([...text.matchAll(/\b((?:API|UI|EVI)-[A-Z]+(?:-[A-Z])?-\d{2,3})\b/g)].map((m) => m[1]))].filter((id) => id !== input.caseId).map((id) => caseById(id)).filter((c): c is CatalogCase => !!c).slice(0, 2);
  const modelText = pointedAt.length ? `${text}\n\nREFERENCED CASE${pointedAt.length > 1 ? "S" : ""} (the words above point at ${pointedAt.length > 1 ? "these" : "this"}):\n${pointedAt.map((c) => `[${c.id}] ${catalogCaseText(c).slice(0, 700)}`).join("\n")}` : text;
  const cited = [libCase, ...(cat?.refs ?? []).map((r) => lib.byId.get(r))].filter((c): c is TestCaseRecord => !!c && !libraryCaseProblem(c));
  // The exemplars' library requests are offered first after the cited ones: they were found by meaning, not only by words.
  const fromExemplars = exHits
    .map((h) => h.ex.libraryId ?? h.ex.plan?.act.find((a) => a.op === "library")?.caseId)
    .map((id) => (id ? lib.byId.get(id) : undefined))
    .filter((c): c is TestCaseRecord => !!c && !libraryCaseProblem(c) && !cited.includes(c));
  // A library case whose starting state no recipe builds is never offered: a plan that sent it would test the wrong thing.
  const cands = [...new Set([...cited, ...fromExemplars.slice(0, 3), ...nearestLibraryCases(text, 8).filter((c) => !cited.includes(c))])].filter((c) => !recipeForLibraryCase(c).unbuilt).slice(0, 8);
  const useModel = opts.llm !== false && llmMode() !== "fallback";
  let lastErrors: string[] = [];
  let lastWarnings: string[] = [];
  let reasonTried = false;
  let modelNone: string[] | undefined;
  let modelNoneTier: "fast" | "reason" = "fast";
  if (useModel) {
    const tiers: Array<"fast" | "reason"> = ["fast", "fast", ...(opts.allowReason ? (["reason"] as const) : [])];
    let previous: string | undefined;
    /** a runnable plan whose reading of the case the validator doubts (soft) — kept when the repair does not do better */
    let kept: { v: Validation; ans: ModelAnswer; tier: "fast" | "reason" } | undefined;
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      if (tier === "reason") reasonTried = true;
      const ans = await askModel(modelText, cands, tier, previous && lastErrors.length ? { previous, errors: lastErrors } : undefined, worked);
      if (ans?.gateway) gateway = ans.gateway;
      if (!ans || (ans.plan === null && !ans.gaps.length && ans.gateway)) {
        lastErrors = [`the model could not be reached: ${ans?.gateway ?? "no answer"}`];
        continue;
      }
      if (ans.badJson) {
        lastErrors = [`${ans.badJson} — answer with ONE compact JSON object and nothing else; keep "say" texts short`];
        previous = undefined;
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
      const v = await validatePlan({ ...(ans.plan as object), ...(input.caseId ? { caseId: input.caseId } : {}) }, ctx);
      lastWarnings = v.warnings;
      const src = tier === "reason" ? "llm-reason" : "llm-fast";
      if (v.ok && !v.soft.length) return finish(v, ans.gaps, libraryActProblems(v.plan), { source: src, candidates: cands.map((c) => c.id), exemplars: exSummary(exHits), reasonTried } as any);
      if (v.ok) {
        // runnable, but it reads the case differently than the words do: one repair round, then keep the better of the two
        if (!kept || v.soft.length < kept.v.soft.length) kept = { v, ans, tier };
        lastErrors = v.soft;
        continue;
      }
      lastErrors = v.errors;
    }
    if (kept) {
      const src = kept.tier === "reason" ? "llm-reason" : "llm-fast";
      return finish(kept.v, kept.ans.gaps, libraryActProblems(kept.v.plan), { source: src, candidates: cands.map((c) => c.id), exemplars: exSummary(exHits), reasonTried } as any);
    }
  }

  // 2 · rules (no model, or the model's answers could not be made valid)
  if (!opts.modelOnly) {
    const r = rulesPlan(text);
    if (r) {
      const v = await validatePlan({ ...r.plan, title: text.split("\n")[0].slice(0, 140), ...(input.caseId ? { caseId: input.caseId } : {}) }, ctx);
      if (v.ok) return finish(v, [], ["compiled by a fixed rule, not read in full — check the steps match the case"], { source: "rules", candidates: cands.map((c) => c.id), exemplars: exSummary(exHits) });
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

/** Gap sentences the compiler writes itself (re-derived on a re-check; the model's own gap words are kept). */
const CODE_GAP = /^the case reads as |^the decisive step tests something else than the case's point: the (?:case reads as|documented correct)|^it does not read the record back|^what the screen shows|^the part about “|^compiled by a fixed rule|^library case \S+ (needs a starting state|is written for)|^the plan has the |^the case needs a caller|^it depends on a company setting|^a read-back was added/;

/**
 * RE-CHECK A STORED PLAN IN CODE (no model): the validator with the case's words (actors fixed from the
 * app allow-lists, the outcome read against the words, the code the case names), a read-back added when
 * the plan has none, and the coverage judged again. The model's own gap sentences survive; the compiler's
 * are derived afresh. Used by `compile-api-plans.ts --revalidate` on every stored plan.
 */
export async function recheckStoredPlan(raw: unknown, text: string, heads: string[], storedGaps: string[]): Promise<{ ok: boolean; plan: ApiPlan; coverage: "full" | "partial"; gaps: string[]; warnings: string[]; errors: string[]; changed: string[] }> {
  const v = await validatePlan(raw, { text, heads });
  const changed: string[] = [];
  if (!v.ok) return { ok: false, plan: v.plan, coverage: "partial", gaps: storedGaps, warnings: v.warnings, errors: v.errors, changed };
  const before = JSON.stringify((raw as ApiPlan)?.act?.map((a) => a.as) ?? []);
  if (JSON.stringify(v.plan.act.map((a) => a.as)) !== before) changed.push("actor");
  if ((raw as ApiPlan)?.expected?.outcome !== v.plan.expected.outcome) changed.push(`outcome ${(raw as ApiPlan)?.expected?.outcome} → ${v.plan.expected.outcome}`);
  if (!(raw as ApiPlan)?.expected?.code && v.plan.expected.code) changed.push(`code ${v.plan.expected.code}`);
  const av = await autoVerify(v.plan);
  if (av.added) changed.push("read-back added");
  const kept = storedGaps.filter((g) => !CODE_GAP.test(g));
  const cov = judgeCoverage(text, av.plan, kept, libraryActProblems(av.plan), heads);
  return { ok: true, plan: av.plan, coverage: cov.coverage, gaps: cov.gaps, warnings: [...v.warnings, ...(av.added ? [av.added] : [])], errors: [], changed };
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


/**
 * "an RFQ event with 67 line items": the count is a property of the record the
 * setup builds, which the plan vocabulary had no word for — so the model named
 * it as a gap and planned a one-item event instead. Read the count from the
 * text here and put it on the setup; the gap it caused goes with it.
 */
/**
 * AN EVENT FROM A PURCHASE REQUEST, as an API test (Aanya, 27 Oct: "now for these cases, run the
 * api automation test" — RFQ / RFP + RFQ / auction / technical + auction from an existing PR, and a
 * PR with 2 line items). The vocabulary had no word for it, so the model built a blank event and named
 * the PR as a gap — a run that published an ordinary event and tested nothing about the PR. A
 * create-and-publish case from a PR is planned here instead, in code: the setup makes the draft from
 * an open PR's lines (linked by pr_line_item_uuid / pr_id, the PR's own product, unit and open
 * quantity — apiPlanRunner pickPrLines) with the stages the case names, and the step under test is
 * the publish; the read-back checks the event is live. Anything else about a PR keeps its gap.
 */
export async function applyFromPr(c: CompiledApiPlan | null, text: string): Promise<CompiledApiPlan | null> {
  const fromPr =
    /\b(from|using|out of|convert(ing)?)\b[^.]{0,40}\b(an? |the )?(existing |open )?(pr|purchase requests?|purchase requisitions?|requisitions?)\b/i.test(text) ||
    /\b(select|pick|choose|tick|take|use)\s+(a|an|the|one)?\s*(pr|purchase request)\b/i.test(text);
  if (!fromPr || !/\b(create|make|build|convert|publish)\b/i.test(text) || !/\bpublish/i.test(text)) return c;
  // A case about what happens after the publish (bids, award, evaluation …) is not this plan.
  if (/\b(bid|award|counter|surrogate|evaluat|score|close|extend|withdraw|negotiat|refus|reject|block|without|empty)/i.test(text)) return c;
  const tech = /\b(rfp|technical|tech)\b/i.test(text);
  const auction = /\bauction\b/i.test(text);
  const rfq = /\brfq\b/i.test(text);
  if (tech && !auction && !rfq) return c; // a technical-only event has no recipe yet
  const recipe: RecipeId = auction ? (tech ? "draft_rfp_auction" : "draft_auction") : tech ? "draft_rfp_rfq" : "draft_rfq";
  const words = { draft_rfq: "RFQ", draft_rfp_rfq: "RFP + RFQ", draft_auction: "Auction", draft_rfp_auction: "Technical + Auction" }[recipe as "draft_rfq"];
  const n = Number(text.match(/\b(\d{1,2})\s*line[\s_-]?items?\b/i)?.[1] ?? 0) || Number(c?.plan?.setup.lineItems ?? 0) || 1;
  const raw = {
    version: PLAN_VERSION,
    caseId: c?.plan?.caseId ?? "API-TYPED",
    title: `${words} event from an open purchase request${n > 1 ? ` (${n} of its line items)` : ""}, published`,
    setup: { recipe, fromPr: { items: n } },
    act: [{ op: "publish_event", decisive: true }],
    verify: [
      { op: "read_event", assert: [{ path: "status", op: "equals", value: "active", say: "the event is live" }] },
      // …and made FROM the PR: every line item carries its PR number and PR line (an event from a PR
      // whose link was dropped passed on "live" alone, 27 Oct).
      { op: "read_line_items", assert: [{ path: "data[*].pr_no", op: "exists", say: "every line item names its purchase request" }, { path: "data[*].pr_line_item_uuid", op: "exists", say: "every line item is linked to its PR line" }] },
    ],
    expected: { outcome: "accept" },
  };
  const v = await validatePlan(raw);
  if (!v.ok) return c;
  return {
    ...(c ?? { llm: { calls: 0, promptTokens: 0, completionTokens: 0, reasonTierUsed: false, usd: 0 }, candidates: [], ms: 0, warnings: [] }),
    plan: v.plan,
    coverage: "full",
    gaps: (c?.gaps ?? []).filter((g) => !/purchase request|\bpr\b|product request|requisition/i.test(g)),
    errors: [],
    warnings: [...(c?.warnings ?? []), ...v.warnings],
    source: "rules",
    endpoints: ["POST /purchase_requests (read)", "POST /event_groups", "POST /trade/template_input", "PATCH /event_groups/:id", "GET /event_groups/:id"],
    decisiveEndpoint: "PATCH /event_groups/:id",
    text,
  } as CompiledApiPlan;
}

/**
 * A SURROGATE BID IS SENT BY ITS BUILDER (peer 6c's API-actions run, 27 Oct). The model planned
 * "place a surrogate bid of 100" as a library case's bid body (op library, POST /bids/template_input):
 * product, price and quantity only — no trade product, variant, hub, serial or status — and Procol
 * answered 500 (API-SB01) for the test's own malformed request. And "a surrogate bid with no price"
 * kept the builder's price of 100, because the vocabulary did not say a surrogate bid's price could be
 * set or left out (API-SB04): Procol accepted a priced bid and the refusal case "failed" for our reason.
 * Here, in code, for a case that says surrogate: a library bid body becomes surrogate_bid; the price the
 * case names becomes params.price; "no price" is params.price null (the builder leaves it out).
 */
export async function repairBidActs(c: CompiledApiPlan | null, text: string): Promise<CompiledApiPlan | null> {
  if (!c?.plan || !/\bsurrogate\b/i.test(text)) return c;
  const plan = JSON.parse(JSON.stringify(c.plan)) as ApiPlan;
  const named = text.match(/\b(?:bid|price|quote|amount)\s*(?:of|at|=|:)?\s*(?:exactly|just|only|precisely)?\s*(?:₹|rs\.?|inr)?\s*(-?\d+(?:\.\d+)?)\b/i)?.[1];
  const price = named !== undefined ? Number(named) : NaN;
  const noPrice = /\b(no|without|empty|blank|missing)\s+(a\s+|any\s+)?price\b|\bprice\s+(left\s+)?(empty|blank|missing|out)\b/i.test(text);
  const notes: string[] = [];
  for (const a of plan.act) {
    if (a.op === "library" && a.caseId) {
      const lc = library().byId.get(a.caseId);
      if (lc && String(lc.method).toUpperCase() === "POST" && /\/bids\/template_input\b/.test(String(lc.path))) {
        a.op = "surrogate_bid";
        delete a.caseId;
        delete a.change; // keyed to the library case's body, not the builder's
        notes.push("the library bid body was replaced by the surrogate-bid builder (a library body lacks the trade product, variant and hub)");
      }
    }
    if (a.op !== "surrogate_bid") continue;
    if (noPrice) {
      if (a.params?.price !== null) {
        a.params = { ...(a.params ?? {}), price: null };
        notes.push("the bid is sent with no price, as the case says");
      }
      if (a.change) a.change = a.change.filter((ch) => !/price/.test(ch.path));
      if (a.change && !a.change.length) delete a.change;
    } else if (Number.isFinite(price) && a.params?.price === undefined) {
      a.params = { ...(a.params ?? {}), price };
      notes.push(`the bid price is ${price}, as the case says`);
    }
  }
  if (!notes.length) return c;
  const v = await validatePlan(plan);
  if (!v.ok) return c;
  const gaps = c.gaps.filter((g) => !(/surrogate/i.test(g) && /price/i.test(g)));
  return { ...c, plan: v.plan, gaps, warnings: [...c.warnings, ...notes.map((n) => `repaired: ${n}`)], ...(c.coverage === "partial" && !gaps.length ? { coverage: "full" as const } : {}) };
}

/**
 * A TYPED CASE IS NOT PASSED BY "NO SERVER ERROR" (peer 6c's API-actions run, 27 Oct). The model may
 * plan "the app answers without a server error" for an action the case simply asks to happen — "place a
 * surrogate bid of 100", "submit the technical response" — and then a 4xx refusal passes: API-SB05 got
 * 422 "Insufficient parameters" and was marked passed. A typed case not about crashing (500, server
 * error) expects its action to go through, or to be refused when it says so.
 */
export function strictOutcome(c: CompiledApiPlan | null, text: string): CompiledApiPlan | null {
  if (!c?.plan || c.plan.expected.outcome !== "no-5xx") return c;
  const pol = polarityOf(text);
  if (pol === "no-5xx") return c;
  const to: Outcome = pol === "reject" ? "reject" : "accept";
  c.plan.expected = { ...c.plan.expected, outcome: to };
  for (const a of c.plan.act) if (a.decisive && a.expect === "no-5xx") a.expect = to;
  c.warnings = [...c.warnings, `the plan checked only “no server error”; this case expects ${to === "accept" ? "its action to go through" : "a refusal"}, so that is what is checked`];
  c.gaps = c.gaps.filter((g) => !/the plan checks “the app answers without a server error”/.test(g));
  return c;
}

/**
 * A PRICE CAP CASE IS PLANNED IN CODE (27 Oct). The model left the cap out, failed to answer, or capped
 * QA vendor 1 and had vendor 2 bid. "…add a price cap of X for the vendor[, then the vendor bids Y; …]"
 * is one shape: a published RFQ with one QA vendor; price_cap X for that vendor; then that vendor's bid
 * of Y (a surrogate bid when the case says surrogate). The outcome is the case's own words, else the
 * template's rule: a bid strictly below the cap is accepted, at or above it is refused.
 */
export async function applyPriceCap(c: CompiledApiPlan | null, text: string): Promise<CompiledApiPlan | null> {
  const capM = text.match(/\bprice[\s-]*cap\w*\b[^.\d-]{0,25}(-?\d+(?:\.\d+)?)/i) ?? text.match(/\bcap(?:ped)?\s*(?:of|at|=)\s*(?:₹|rs\.?)?\s*(-?\d+(?:\.\d+)?)/i);
  if (!capM || capM.index === undefined) return c;
  const cap = Number(capM[1]);
  const after = text.slice(capM.index + capM[0].length);
  // BID_WORDS: "a bid of exactly 100", "bids just 90" (peer 6c, 27 Oct: "exactly" left the bid out), "a bid equal to the cap"
  const bidM = after.match(/\b(?:bids?|quotes?|offers?)\s*(?:of|at|=)?\s*(?:exactly|just|only|precisely)?\s*(?:₹|rs\.?|inr)?\s*(-?\d+(?:\.\d+)?)/i);
  const atCap = !bidM && /\b(?:bids?|quotes?|offers?)\b[^.;]{0,40}\b(?:equal to|the same as|exactly|at)\s+(?:the\s+)?cap\b/i.exec(after);
  const bid = bidM ? Number(bidM[1]) : atCap ? cap : undefined;
  const surrogate = /\bsurrogate\b/i.test(text);
  const bidAt = bidM ?? atCap;
  const pol = bidAt ? polarityOf(after.slice((bidAt.index ?? 0) + bidAt[0].length) || after) : polarityOf(text);
  const outcome: Outcome = bid === undefined ? (pol === "reject" ? "reject" : "accept") : pol === "reject" || pol === "accept" ? pol : bid < cap ? "accept" : "reject";
  const raw = {
    version: PLAN_VERSION,
    caseId: c?.plan?.caseId ?? "API-TYPED",
    title: bid === undefined ? `Price cap of ${cap} for the invited vendor` : `Price cap of ${cap}, then ${surrogate ? "a surrogate bid" : "the vendor's bid"} of ${bid} (${outcome === "accept" ? "accepted" : "refused"})`,
    setup: { recipe: "published_rfq" },
    act:
      bid === undefined
        ? [{ op: "price_cap", params: { price: cap }, decisive: true }]
        : [{ op: "price_cap", params: { price: cap } }, { op: surrogate ? "surrogate_bid" : "place_bid", params: { price: bid }, decisive: true }],
    verify: [],
    expected: { outcome },
  };
  const v = await validatePlan(raw);
  if (!v.ok) return c;
  return {
    ...(c ?? { llm: { calls: 0, promptTokens: 0, completionTokens: 0, reasonTierUsed: false, usd: 0 }, candidates: [], ms: 0, warnings: [], gaps: [] }),
    plan: v.plan,
    coverage: "full",
    gaps: [],
    errors: [],
    warnings: [...(c?.warnings ?? []), ...v.warnings, "planned in code: a price cap case (the cap, then the same vendor's bid)"],
    source: "rules",
    endpoints: ["PATCH /trade/:id/update_vendor_validations", ...(bid === undefined ? [] : [surrogate ? "POST /bids/template_input" : "POST /bids …"])],
    decisiveEndpoint: bid === undefined ? "PATCH /trade/:id/update_vendor_validations" : surrogate ? "POST /bids/template_input" : "POST /bids",
    text,
  } as CompiledApiPlan;
}

export function applyLineItemCount(c: CompiledApiPlan): CompiledApiPlan {
  const m = c.text.match(/\b(\d{1,4})\s*line[\s_-]?items?\b/i);
  const n = m ? Number(m[1]) : 0;
  if (!c.plan || !(n > 1) || !RECIPES[c.plan.setup.recipe]?.eventType) return c;
  c.plan.setup.lineItems = n;
  c.gaps = c.gaps.filter((g) => !/line[\s_-]?items?/i.test(g));
  if (c.coverage === "partial" && !c.gaps.length) c.coverage = "full";
  return c;
}
