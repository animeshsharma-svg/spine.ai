/**
 * THE JOURNEY MODEL — what an API run walks, in the order the Postman
 * collection walks it, and the shape the report reads it back in.
 *
 * The report used to be a list of verdicts about one endpoint: forty rows of
 * `PATCH /event_groups/<id>`, because every "RFQ only" case is a variation of
 * activating the same event. True, and unreadable — it said nothing about
 * whether a buyer can actually run a sourcing round on this build, which is
 * the question the run exists to answer.
 *
 * So a run now walks the collection first, as a JOURNEY: sign in, create the
 * draft, add each round, publish, sign in as the vendor, respond, bid, wait
 * for the window to close, evaluate, award. Each step is one real request
 * with its expectation stated before it fires and its result narrated after.
 * The library cases are then the VARIATIONS tried at each step, nested under
 * the step they vary — "activation with 501 vendors is refused" belongs under
 * "Publish the event", not in a flat list beside "sign in".
 *
 * This file is the contract between the three parts that share it:
 *   the runner  (`eventJourney.ts`)  — produces a `JourneyRecord`
 *   the server  (`server.ts`)        — streams the steps and saves the record
 *   the report  (`journeyReport.ts`) — renders it, with cases nested by step
 *
 * Nothing here talks to the network. It is types, the canonical step order,
 * the plain-English name of every step, the Postman request each mirrors,
 * and the one rule that decides which step a library case hangs off.
 */

import type { StepAssertions } from "./apiAssertions.js";

// ── the event types a run can build ────────────────────────────────────────

export type EventType = "rfp_only" | "rfq_only" | "rfp_rfq" | "rfp_auction";
export type StageKind = "rfp" | "rfq" | "auction";

export const EVENT_TYPES: Record<
  EventType,
  { label: string; stages: StageKind[]; feature: string }
> = {
  rfp_only: { label: "Technical / RFP only", stages: ["rfp"], feature: "events.rfp_only" },
  rfq_only: { label: "RFQ only", stages: ["rfq"], feature: "events.rfq_only" },
  rfp_rfq: { label: "Technical + RFQ", stages: ["rfp", "rfq"], feature: "events.rfp_rfq" },
  rfp_auction: { label: "Technical + Auction", stages: ["rfp", "auction"], feature: "events.rfp_auction" },
};

/** What a round is called to a buyer, not on the wire. */
export const STAGE_LABEL: Record<StageKind, string> = {
  rfp: "technical round (RFP)",
  rfq: "pricing round (RFQ)",
  auction: "live auction round",
};

// ── the steps, in collection order ─────────────────────────────────────────

export type Actor = "buyer" | "vendor" | "evaluator" | "platform";

export type StepKind =
  // buyer builds the event — collection folder "event create"
  | "buyer_login"
  | "create_draft"
  | "add_stage_rfp"
  | "add_stage_pricing"
  | "publish"
  | "read_back"
  // vendor responds — folder "vendor technical and bid"
  | "vendor_login"
  | "vendor_open_pricing"
  | "vendor_open_technical"
  | "tech_start"
  | "tech_answer"
  | "tech_submit"
  | "bid_create"
  | "bid_products"
  | "bid_submit"
  // buyer responds FOR the vendor — folder "F3_surrogate_bid"
  | "surrogate_tech"
  | "surrogate_rfq"
  // optional buyer moves — folders "F4_Counter Offer", "F5_convert to auction"
  | "counter_offer"
  | "convert_auction"
  // the clock — the collection's own "TIMING CHECK" before evaluation
  | "wait_close"
  // evaluator scores — folder "evaluation"
  | "evaluator_login"
  | "eval_schema"
  | "eval_score"
  | "eval_submit"
  // buyer awards — folder "Awarding"
  | "award_proposal"
  | "award_lines"
  | "award_workflow"
  | "award_submit"
  // folder "F2_versioning" — last, because it supersedes the event
  | "version";

/**
 * Canonical order. The runner emits steps in this order (skipping the ones a
 * type does not have), and the report lists "steps this journey did not walk"
 * in it too, so two reports of different types still read the same way.
 */
export const JOURNEY_ORDER: StepKind[] = [
  "buyer_login",
  "create_draft",
  "add_stage_rfp",
  "add_stage_pricing",
  "publish",
  "read_back",
  "vendor_login",
  "vendor_open_pricing",
  "vendor_open_technical",
  "tech_start",
  "tech_answer",
  "tech_submit",
  "bid_create",
  "bid_products",
  "bid_submit",
  "surrogate_tech",
  "surrogate_rfq",
  "counter_offer",
  "convert_auction",
  "wait_close",
  "evaluator_login",
  "eval_schema",
  "eval_score",
  "eval_submit",
  "award_proposal",
  "award_lines",
  "award_workflow",
  "award_submit",
  "version",
];

export interface StepMeta {
  /** What the step does, as a heading — imperative, so it reads the same whether it ran or not. */
  title: string;
  actor: Actor;
  /** The request in the Postman collection this step mirrors: folder › request. */
  postman?: string;
}

/**
 * The words for every step. Titles are what a buyer would call the action,
 * never the route: the route is printed beside it, once, for whoever needs it.
 */
export const STEP_META: Record<StepKind, StepMeta> = {
  buyer_login: { title: "Sign in as the buyer", actor: "buyer", postman: "auth › generate otp, verify otp" },
  create_draft: { title: "Create the draft event", actor: "buyer", postman: "event create › Create Event" },
  add_stage_rfp: { title: "Add the technical round (RFP)", actor: "buyer", postman: "event create › Template Technical" },
  add_stage_pricing: { title: "Add the pricing round", actor: "buyer", postman: "event create › Template Pricing" },
  publish: { title: "Publish the event to the invited vendor", actor: "buyer", postman: "event create › Publish" },
  read_back: { title: "Read the event back", actor: "buyer" },
  vendor_login: { title: "Sign in as the vendor", actor: "vendor", postman: "auth › vendor_generate otp, vendor verify otp" },
  vendor_open_pricing: { title: "Open the pricing round as the vendor", actor: "vendor", postman: "vendor technical and bid › trade details" },
  vendor_open_technical: { title: "Open the technical round as the vendor", actor: "vendor", postman: "vendor technical and bid › get technical trade details" },
  tech_start: { title: "Start the technical response", actor: "vendor", postman: "vendor technical and bid › start technical response" },
  tech_answer: { title: "Answer the technical form", actor: "vendor", postman: "vendor technical and bid › Fill Technical Answers" },
  tech_submit: { title: "Submit the technical response", actor: "vendor", postman: "vendor technical and bid › submit technical response" },
  bid_create: { title: "Open a bid on the pricing round", actor: "vendor", postman: "vendor technical and bid › create bid" },
  bid_products: { title: "Price the line item", actor: "vendor", postman: "vendor technical and bid › create bid products" },
  bid_submit: { title: "Submit the bid", actor: "vendor", postman: "vendor technical and bid › submit bid" },
  surrogate_tech: { title: "Enter the vendor's technical response on their behalf", actor: "buyer", postman: "F3_surrogate_bid › technical" },
  surrogate_rfq: { title: "Enter the vendor's price on their behalf", actor: "buyer", postman: "F3_surrogate_bid › rfq" },
  counter_offer: { title: "Counter the vendor's price", actor: "buyer", postman: "F4_Counter Offer" },
  convert_auction: { title: "Convert the pricing round into a live auction and bid in it", actor: "buyer", postman: "F5_convert to auction" },
  wait_close: { title: "Wait for the bidding window to close", actor: "platform", postman: "evaluation › Get Technical Schema-form (TIMING CHECK)" },
  evaluator_login: { title: "Sign in as the evaluator", actor: "evaluator", postman: "auth › evaluator generate otp, evaluator verify otp" },
  eval_schema: { title: "Open the technical responses to score", actor: "evaluator", postman: "evaluation › Get Technical Schema-form" },
  eval_score: { title: "Score the vendor's technical response", actor: "evaluator", postman: "evaluation › create evaluations" },
  eval_submit: { title: "Submit the evaluation", actor: "evaluator", postman: "evaluation › submit evaluation" },
  award_proposal: { title: "Open an award proposal", actor: "buyer", postman: "Awarding › create proposal" },
  award_lines: { title: "Award the quantity to the vendor", actor: "buyer", postman: "Awarding › add response" },
  award_workflow: { title: "Read the approval workflow for the award", actor: "buyer", postman: "Awarding › get approval flows" },
  award_submit: { title: "Submit the award for approval", actor: "buyer", postman: "Awarding › submit proposal" },
  version: { title: "Issue a new version of the event", actor: "buyer", postman: "F2_versioning" },
};

// ── what a run records ─────────────────────────────────────────────────────

/**
 * Four outcomes, none of them "pass".
 *
 *   worked   the app did what the step asked (2xx, and the reply had what the
 *            expectation names)
 *   refused  the app said no, cleanly (4xx) — the message is carried, because
 *            "refused" is only a defect if the refusal is wrong
 *   broken   a 5xx, or no reply at all — always a defect
 *   not-run  the step was never attempted, and `reason` says why: a step it
 *            depends on did not work, this event type has no such round, or
 *            there is no way to sign in as that actor here
 */
export type StepVerdict = "worked" | "refused" | "broken" | "not-run";

export interface JourneyCall {
  method: string;
  /** path + query, relative to the API base — what the curl shows */
  path: string;
  /** the body as sent, with anything credential-shaped already redacted */
  body?: unknown;
}

export interface JourneyStepRecord {
  /** 1-based position in this journey */
  n: number;
  kind: StepKind;
  actor: Actor;
  title: string;
  postman?: string;
  /** what should come back — written before the request fires */
  expected: string;
  /**
   * What did come back, as one plain sentence: "Draft RFFEY0RO was created
   * with one line item (50 KG)." For a refusal or a break it quotes the app.
   * For a step that did not run it says so and why.
   */
  actual: string;
  verdict: StepVerdict;
  /** why a not-run step did not run */
  reason?: string;
  /** the request that decided this step — becomes the curl */
  call?: JourneyCall;
  /** other requests the step made first (a login makes two) */
  alsoCalled?: JourneyCall[];
  /** HTTP status of `call`; 0 when it never completed */
  status?: number;
  ms?: number;
  /** the message the app returned, verbatim, for a refusal or a break */
  message?: string;
  errorCode?: string;
  /** the ids this step produced, by name: { eventGroupUuid: "RFFEY0RO" } */
  produced?: Record<string, string>;
  /**
   * The reply body as the record may keep it — credentials redacted, arrays
   * trimmed (see `keepResponse`). What the field-assertion catalog is learned
   * from, and what a reader opens in the report.
   */
  response?: unknown;
  /** Postman-style field checks run against the live reply (`apiAssertions.ts`). */
  assertions?: StepAssertions;
  startedAt: string;
  /**
   * RESILIENCE. Earlier tries of this step that failed, oldest first, before
   * the try this record describes. Present only when the step was tried more
   * than once. Each is a FAILED result in its own right — a retry that worked
   * never erases the failure it got past (see `JourneyResilience.findings`).
   */
  attempts?: JourneyStepAttempt[];
  /** which try this record is (1 = first); absent means the first */
  attempt?: number;
  /** for a refused / broken step: what kind of failure it was (`resilience.ts` classifier) */
  failureClass?: FailureClass;
  /** the classifier rule that decided `failureClass` */
  failureRule?: string;
  /** the data this step was built from, in words: { unit: "KG", product: "abc" } */
  choices?: Partial<Record<ChoiceKind, string>>;
}

// ── resilience: retries, backtracking, and the failures they got past ──────

/**
 * What kind of failure a refused / broken step was — decided from the status,
 * the app's error code and its message, never by an LLM.
 *
 *   environment       502/503/504, a timeout, no reply — try the SAME request again
 *   timing            "too early / too late" — rebuild on a fresh clock, or wait and retry
 *   data-choice       the data the platform picked does not fit this client (a unit
 *                     the company lacks, a template it cannot use) — try the next option
 *   product-defect    a 5xx, or a 2xx that did not do the thing — record, stop that branch
 *   expected-refusal  a clean 4xx the step has no other data for — the normal verdict
 *   access            not signed in / not allowed — no retry
 */
export type FailureClass = "environment" | "timing" | "data-choice" | "product-defect" | "expected-refusal" | "access";

/** The data a journey chooses, and can choose differently on a retry. */
export type ChoiceKind = "unit" | "product" | "location" | "pricingTemplate" | "technicalTemplate" | "vendor" | "timing" | "limit";

export const CHOICE_WORD: Record<ChoiceKind, string> = {
  unit: "unit",
  product: "product",
  location: "delivery location",
  pricingTemplate: "pricing template",
  technicalTemplate: "technical template",
  vendor: "vendor",
  timing: "bidding window",
  limit: "account limit",
};

/** One failed try of a step, kept after the step was tried again. */
export interface JourneyStepAttempt {
  /** 1-based try of this step position */
  attempt: number;
  verdict: StepVerdict;
  status?: number;
  errorCode?: string;
  message?: string;
  /** the sentence the step's record carried for this try */
  actual: string;
  call?: JourneyCall;
  ms?: number;
  startedAt: string;
  failureClass: FailureClass;
  failureRule: string;
  /** the choice the classifier blamed, and the value it had on this try */
  choice?: ChoiceKind;
  choiceValue?: string;
  choices?: Partial<Record<ChoiceKind, string>>;
  /** what the runner did next */
  next: "same-request" | "next-alternative" | "rebuilt-event";
  /** the plain-English reason, written for a reader: what failed, why, and what was tried next */
  reason: string;
}

/** A failed try the journey got past (or did not) — a FAILED case, never hidden by the retry. */
export interface JourneyFinding {
  /** stable id for history: JRN-<step kind>-try<k> */
  id: string;
  n: number;
  kind: StepKind;
  title: string;
  attempt: number;
  verdict: StepVerdict;
  status?: number;
  errorCode?: string;
  message?: string;
  failureClass: FailureClass;
  choice?: ChoiceKind;
  choiceValue?: string;
  /** one paragraph: what failed, the app's words, whose fault it looks like, what was tried, how it ended */
  reason: string;
  /** true when a later try of the same step worked */
  resolved: boolean;
}

/** The runner going back to an earlier step with a different choice. */
export interface JourneyBacktrack {
  /** the step whose failure caused it */
  fromStep: number;
  /** the step the journey went back to (equal to fromStep for an in-place retry) */
  toStep: number;
  choice: ChoiceKind;
  from: string;
  to: string;
  /** an event abandoned by the rebuild, left on UAT as a QA-named draft */
  abandonedEvent?: string;
  why: string;
}

export interface JourneyResilience {
  /** tries of the same request after an environment failure */
  sameRequestRetries: number;
  /** tries with a different choice (in place or by rebuilding) */
  backtracks: JourneyBacktrack[];
  findings: JourneyFinding[];
  /** every step ran to its end, but only after at least one retry */
  completedAfterRetries: boolean;
  /** the hard bounds the run was held to */
  bounds: { stepMs: number; loginStepMs: number; waitCapMs: number; journeyMs: number; maxAlternativesPerChoice: number; maxBacktracks: number; maxSameRequestRetries: number };
  /** steps a watchdog stopped waiting for */
  watchdogTrips: number;
  /** the journey hit its overall time budget and the rest was not run */
  budgetExhausted?: boolean;
  /** the options that were available to try, by choice, in words */
  alternatives?: Partial<Record<ChoiceKind, string[]>>;
  /** lists of alternatives that could not be read */
  alternativeProblems?: string[];
  /** a first choice forced for a test (SPINE_JOURNEY_FORCE), so a reader knows the failure was provoked */
  forced?: Partial<Record<ChoiceKind, string>>;
}

export interface JourneyFeatures {
  /** F3 — the buyer bids for the vendor instead of the vendor signing in */
  surrogate: boolean;
  /** F4 — the buyer counters the vendor's price */
  counterOffer: boolean;
  /** F5 — the pricing round is converted into an auction before awarding */
  convertToAuction: boolean;
  /** F2 — a new version of the event is issued at the end */
  version: boolean;
}

export interface JourneyPlan {
  /** false when the selection has nothing to do with sourcing events */
  wanted: boolean;
  eventType: EventType;
  label: string;
  stages: StageKind[];
  features: JourneyFeatures;
  /** the furthest lifecycle stage the journey walks to */
  reach: JourneyReach;
  /** the steps this plan will attempt, in order */
  steps: StepKind[];
}

export type JourneyReach = "publish" | "bid" | "evaluate" | "award";

/** The second copy of the event that the library cases act on. */
export interface VariationsEvent {
  title: string;
  eventGroupUuid: string;
  /** the pricing round's trade, or the technical one where there is no pricing round */
  tradeId?: string;
  lineItemUuid: string;
  status: string;
  stageCount: number;
  /** one line on why there are two events, for the report */
  note: string;
  /**
   * The four calls that built it, recorded the same way as the journey's own
   * steps, so the report can show how the second copy was made without a
   * second vocabulary for it.
   */
  steps?: JourneyStepRecord[];
}

export interface JourneyRecord {
  /** the bid-number integrity report (src/integrity/invariants.ts), when it ran */
  integrity?: unknown;
  eventType: EventType;
  label: string;
  stages: StageKind[];
  /** the title the journey gave its event */
  title: string;
  /** how long each round was open, in seconds — short, so the run can wait it out */
  stageSeconds: number;
  features: JourneyFeatures;
  steps: JourneyStepRecord[];
  /** the first step that was refused or broke, if any */
  stoppedAt?: number;
  /** one sentence: "14 of 17 steps worked; the award was refused at step 15." */
  outcome: string;
  /** every id the journey produced, by name */
  made: Record<string, string>;
  startedAt: string;
  durationMs: number;
  /** how long the run spent waiting for the bidding window to close */
  waitedMs: number;
  variationsEvent?: VariationsEvent;
  /** retries, backtracks and the failures they got past — absent on records made before resilience */
  resilience?: JourneyResilience;
}

// ── which features want a journey, and which type ──────────────────────────

/** The feature-id prefixes that belong to the sourcing journey. */
const JOURNEY_PREFIXES = ["events.", "auction.", "bids.", "evaluation.", "negotiation.", "award."];

export const isJourneyFeature = (featureId: string): boolean =>
  JOURNEY_PREFIXES.some((p) => featureId.startsWith(p));

/**
 * Decide the journey from what was ticked.
 *
 * The event type comes from the `oneOf` choice in the tree (exactly one can
 * be ticked); with none ticked the journey builds an RFQ-only event, which is
 * the simplest one that can be bid on and awarded. The optional folders of
 * the collection — surrogate, counter offer, convert to auction, versioning —
 * join the journey only when their feature is ticked, so a plain "RFQ only"
 * run is the plain collection.
 */
export function journeyPlan(featureIds: string[], opts: { stopAtTicked?: boolean } = {}): JourneyPlan {
  const ids = new Set(featureIds);
  const wanted = featureIds.some(isJourneyFeature);
  const eventType =
    (Object.keys(EVENT_TYPES) as EventType[]).find((t) => ids.has(EVENT_TYPES[t].feature)) ?? "rfq_only";
  const { label, stages } = EVENT_TYPES[eventType];
  const features: JourneyFeatures = {
    surrogate: ids.has("bids.surrogate"),
    counterOffer: ids.has("bids.counter_offer") || ids.has("negotiation.counter_offer"),
    convertToAuction: ids.has("auction.convert"),
    version: ids.has("events.versioning"),
  };
  const reach = opts.stopAtTicked ? reachFor(featureIds) : "award";
  return { wanted, eventType, label, stages, features, reach, steps: stepsFor(stages, features, reach) };
}

/**
 * How far into the lifecycle the ticked features go. The dashboard walks only
 * that far: ticking "Publish event" and nothing after it ends the journey once
 * the event is live and read back, instead of bidding, evaluating and awarding
 * on its own. Scripts that build a full event for something else leave
 * `stopAtTicked` off and keep the whole walk.
 */
export function reachFor(featureIds: string[]): JourneyReach {
  const has = (...prefixes: string[]) => featureIds.some((f) => prefixes.some((p) => f.startsWith(p)));
  if (has("award.") || featureIds.includes("events.awarding_rule")) return "award";
  if (has("evaluation.")) return "evaluate";
  if (has("bids.", "negotiation.", "auction.")) return "bid";
  return "publish";
}

/**
 * The steps a journey of this shape attempts.
 *
 * A type with no technical round has no technical response and nothing to
 * evaluate; one with no pricing round has nothing to bid on or award. With
 * the surrogate feature on, the buyer's on-behalf steps replace the vendor's
 * own sign-in and response — that is what a surrogate bid is for.
 */
export function stepsFor(stages: StageKind[], features: JourneyFeatures, reach: JourneyReach = "award"): StepKind[] {
  const hasRfp = stages.includes("rfp");
  const hasPricing = stages.includes("rfq") || stages.includes("auction");
  const steps: StepKind[] = ["buyer_login", "create_draft"];
  if (hasRfp) steps.push("add_stage_rfp");
  if (hasPricing) steps.push("add_stage_pricing");
  steps.push("publish", "read_back");
  if (reach === "publish") {
    if (features.version) steps.push("version");
    return steps;
  }

  if (features.surrogate) {
    if (hasRfp) steps.push("surrogate_tech");
    if (hasPricing) steps.push("surrogate_rfq");
  } else {
    steps.push("vendor_login");
    if (hasPricing) steps.push("vendor_open_pricing");
    if (hasRfp) steps.push("vendor_open_technical", "tech_start", "tech_answer", "tech_submit");
    if (hasPricing) steps.push("bid_create", "bid_products", "bid_submit");
  }
  if (features.counterOffer && hasPricing && !features.surrogate) steps.push("counter_offer");
  if (features.convertToAuction && stages.includes("rfq")) steps.push("convert_auction");

  if (reach !== "bid") {
    steps.push("wait_close");
    if (hasRfp) steps.push("evaluator_login", "eval_schema", "eval_score", "eval_submit");
    if (hasPricing && reach === "award") steps.push("award_proposal", "award_lines", "award_workflow", "award_submit");
  }
  if (features.version) steps.push("version");
  return steps;
}

// ── which step a library case is a variation of ───────────────────────────

/**
 * The one rule that nests a case under a step: the endpoint it fires at.
 *
 * Derived from method + path rather than from the case's own `journeyStep`
 * number, because the hand-mined cases carry no such number and the written
 * ones number sections, not steps. An endpoint is what a case actually does,
 * and it is the same thing the journey step did — so it is the honest join.
 *
 * Returns undefined for a case that is not a variation of anything the
 * journey does (purchase requests, master data, intake); those keep their
 * own module section.
 */
export function stepKindForCase(method: string, path: string): StepKind | undefined {
  const m = method.toUpperCase();
  const p = path.split("?")[0].replace(/\/+$/, "");

  if (/^\/v1\/dashboard_configuration$/.test(p) || /^\/session\//.test(p)) return "buyer_login";
  if (/^\/v1\/(generate|verify)_otp$/.test(p)) return "buyer_login";

  if (p === "/event_groups" && m === "POST") return "create_draft";
  if (p === "/event_groups/update_egli") return "create_draft";
  if (/^\/event_groups\/[^/]+\/pri_to_draft_project$/.test(p)) return "create_draft";
  if (/^\/event_groups\/[^/]+$/.test(p) && m === "PATCH") return "publish";
  if (/^\/v1\/trade\/add_audience$/.test(p)) return "publish";
  if (/^\/event_groups\/[^/]+(\/(get_line_items|get_audience|participants))?$/.test(p) && m === "GET") return "read_back";
  if (p === "/orders" && m === "GET") return "read_back";

  if (p === "/trade/template_input") return "add_stage_pricing";
  if (p === "/trade/move_to_auction") return "convert_auction";
  if (/^\/trade\/[^/]+$/.test(p) && m === "GET") return "vendor_open_pricing";
  if (/^\/v1\/trade\/[^/]+\/(schema|event_indicators)$/.test(p)) return "eval_schema";

  if (p === "/template_responses/create_surrogate_response") return "surrogate_tech";
  if (p === "/template_responses" && m === "POST") return "tech_start";
  if (/^\/template_responses\/[^/]+\/create_page_responses$/.test(p)) return "tech_answer";
  if (/^\/template_responses\/[^/]+$/.test(p)) return "tech_submit";

  if (p === "/bids/template_input") return "surrogate_rfq";
  if (p === "/v1/bids" && m === "POST") return "bid_create";
  if (/^\/v1\/bids\/[^/]+\/create_bid_products$/.test(p)) return "bid_products";
  if (/^\/v1\/bids\/[^/]+$/.test(p)) return "bid_submit";
  if (/^\/bids\//.test(p)) return "bid_submit";
  if (p === "/additional_request/raise_additional_request") return "counter_offer";

  if (p === "/evaluations") return "eval_score";
  if (p === "/evaluations/submit") return "eval_submit";

  if (p === "/proposal" && m === "POST") return "award_proposal";
  if (/^\/proposal\/[^/]+\/add_response$/.test(p)) return "award_lines";
  if (/^\/proposal\/[^/]+\/approval_workflows$/.test(p)) return "award_workflow";
  if (/^\/proposal\/[^/]+\/(submit|create_contract_form)$/.test(p)) return "award_submit";
  if (/^\/reports\/download_awarding_sheet\//.test(p)) return "award_submit";

  if (p === "/item_versions") return "version";
  return undefined;
}

/**
 * A stage case belongs to the round it describes. The generic rule above says
 * "pricing"; a case whose title or body names the technical round is moved to
 * the technical step when the journey has one.
 */
export function refineStageStep(kind: StepKind, hay: string, journeySteps: StepKind[]): StepKind {
  if (kind !== "add_stage_pricing") return kind;
  if (/\b(rfp|technical|rfi)\b/i.test(hay) && !/\b(rfq|pricing|auction)\b/i.test(hay) && journeySteps.includes("add_stage_rfp")) {
    return "add_stage_rfp";
  }
  if (!journeySteps.includes("add_stage_pricing") && journeySteps.includes("add_stage_rfp")) return "add_stage_rfp";
  return kind;
}

/** Plain words for a verdict, for chips and tallies. */
export const STEP_VERDICT_LABEL: Record<StepVerdict, string> = {
  worked: "Worked",
  refused: "Refused",
  broken: "Broken",
  "not-run": "Not run",
};

/**
 * The one-sentence outcome of a journey, for the summary tile and the
 * "Recent runs" list.
 */
export function journeyOutcome(
  steps: JourneyStepRecord[],
  resilience?: Pick<JourneyResilience, "findings" | "sameRequestRetries" | "backtracks" | "budgetExhausted">,
): { outcome: string; stoppedAt?: number } {
  const attempted = steps.filter((s) => s.verdict !== "not-run");
  const worked = attempted.filter((s) => s.verdict === "worked").length;
  const first = steps.find((s) => s.verdict === "refused" || s.verdict === "broken");
  const notRun = steps.filter((s) => s.verdict === "not-run").length;
  if (!steps.length) return { outcome: "The journey did not start." };
  // The failures a retry got past are part of the outcome, never folded into "worked".
  const findings = resilience?.findings ?? [];
  const retries = (resilience?.sameRequestRetries ?? 0) + (resilience?.backtracks.length ?? 0);
  const firstFinding = findings[0];
  const findingsTail = findings.length
    ? ` ${findings.length} failed attempt${findings.length === 1 ? " is" : "s are"} recorded as ${findings.length === 1 ? "a finding" : "findings"}` +
      (firstFinding
        ? ` — first: step ${firstFinding.n}, ${firstFinding.title.toLowerCase()}${firstFinding.choiceValue && firstFinding.choice && firstFinding.choice !== "limit" ? ` with ${CHOICE_WORD[firstFinding.choice]} “${firstFinding.choiceValue}”` : ""}` +
          (firstFinding.message ? `: “${firstFinding.message}”` : "")
        : "") +
      "."
    : "";
  const budget = resilience?.budgetExhausted ? " The journey ran out of its time budget; the steps after that did not run." : "";
  if (!first) {
    return {
      outcome:
        `All ${worked} step${worked === 1 ? "" : "s"} that ran worked` +
        (retries ? ` — completed after ${retries} retr${retries === 1 ? "y" : "ies"}` : "") +
        (notRun ? `; ${notRun} did not run (the rows say why).` : ".") +
        findingsTail +
        budget,
    };
  }
  const verb = first.verdict === "broken" ? "broke" : "was refused";
  return {
    stoppedAt: first.n,
    outcome:
      `${worked} of ${attempted.length} step${attempted.length === 1 ? "" : "s"} worked; ` +
      `step ${first.n} — ${first.title.toLowerCase()} — ${verb}` +
      (first.message ? `: “${first.message}”` : "") +
      (first.attempts?.length ? ` (after ${first.attempts.length + 1} tries)` : "") +
      (notRun ? `. ${notRun} step${notRun === 1 ? "" : "s"} that depended on it did not run.` : ".") +
      findingsTail +
      budget,
  };
}

/**
 * The features whose cases are the journey's own steps, tried again.
 *
 * A run used to replay the whole library after the journey: forty activations
 * of the event it had just published, read as padding. But the library also
 * holds cases the journey never makes — a draft with `line_items` as a
 * string, an unknown product id, a config sent as text — and those are where
 * the 500s live. So only the features the journey WALKS are dropped from the
 * case list; everything else still runs, as cases, after it.
 */
export function journeyWalksFeature(featureId: string, plan: JourneyPlan): boolean {
  const always = new Set<string>([
    ...(Object.values(EVENT_TYPES).map((t) => t.feature)),
    "events.publish",
    "events.config",
    "bids.place",
    "bids.submit",
    "evaluation.score",
    "award.proposal",
    "award.add_response",
    "award.submit",
  ]);
  if (always.has(featureId)) return true;
  if (featureId === "bids.surrogate") return plan.features.surrogate;
  if (featureId === "bids.counter_offer" || featureId === "negotiation.counter_offer") return plan.features.counterOffer;
  if (featureId === "auction.convert") return plan.features.convertToAuction;
  if (featureId === "events.versioning") return plan.features.version;
  return false;
}
