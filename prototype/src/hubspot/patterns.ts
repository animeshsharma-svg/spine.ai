/**
 * DEFECT PATTERNS — the shapes of event bugs customers report, each with a
 * GENERIC, reproducible scenario written by hand.
 *
 * Why hand-written: the regression case that lands in the committed catalog
 * (test-cases/hubspot-regressions.md) must not carry a customer's wording. A
 * ticket that matches a pattern gets the pattern's own text; only the
 * HubSpot id links the two. A defect that matches no pattern gets a generic
 * placeholder in the catalog, and its specific scenario (from the stripped
 * text) is kept in spine.ai's database only.
 *
 * Every `backendCite` was read in procol-backend at origin/main when the
 * pattern was written (git show origin/main:<path>). A ticket can be marked
 * "reproduced" only when its pattern carries one.
 */
import type { ApiPlan } from "../agents/apiPlanner.js";
import type { Scenario } from "./types.js";

/** Feature-tree node → the journey group its regression cases live in (journeys.ts claims each group). */
export const FEATURE_GROUP: Record<string, string> = {
  "events.type_rules": "API-XCRT",
  "events.rfp_only": "API-XCRT",
  "events.rfq_only": "API-XCRT",
  "events.rfp_rfq": "API-XPUB",
  "events.rfp_auction": "API-XCRT",
  "events.validation": "API-XCRT",
  "events.config": "API-XCRT",
  "events.awarding_rule": "API-XAWD",
  "events.invite_vendors": "API-XPUB",
  "events.publish": "API-XPUB",
  "events.extend_deadline": "API-XPUB",
  "events.lifecycle": "API-XDLST",
  "events.templates": "API-XCRT",
  "events.boq": "API-XDBOQ",
  "events.terms": "API-XCRT",
  "events.versioning": "API-XDAMD",
  "erfx.create": "API-XCRT",
  "erfx.stages": "API-XCRT",
  "erfx.terms": "API-XCRT",
  "erfx.schedule": "API-XPUB",
  "auction.convert": "API-XDAUC",
  "auction.rank": "API-XDAUC",
  "auction.price": "API-XDAUC",
  "auction.traffic_light": "API-XDAUC",
  "auction.knockout": "API-XDAUC",
  "auction.dutch": "API-XDAUC",
  "auction.increments": "API-XDAUC",
  "auction.dynamic_extension": "API-XDAUC",
  "auction.serial_bidding": "API-XDAUC",
  "auction.visibility": "API-XDAUC",
  "bids.participation": "API-XBID",
  "bids.quick_fill": "API-XBID",
  "bids.place": "API-XBID",
  "bids.price_cap": "API-XBID",
  "bids.submit": "API-XBID",
  "bids.surrogate": "API-XBID",
  "bids.counter_offer": "API-XDNEG",
  "evaluation.score": "API-TECH",
  "evaluation.granularity": "API-TECH",
  "evaluation.tna": "API-TECH",
  "evaluation.qcs": "API-XDQCS",
  "negotiation.counter_offer": "API-XDNEG",
  "negotiation.vendor_response": "API-XDNEG",
  "award.proposal": "API-XAWD",
  "award.add_response": "API-XAWD",
  "award.partial": "API-XAWD",
  "award.submit": "API-XAWD",
  "award.approval": "API-XDAPR",
  "award.re_evaluation": "API-XDAPR",
  "pr.to_event": "API-XDPRE",
  "pr.partial_selection": "API-XDPRE",
};

/** The feature-tree groups that are sourcing events (the POC scope). */
export const EVENT_MODULES = new Set(["events", "erfx", "eventfeatures", "auction", "bids", "evaluation", "negotiation", "award"]);
/** Event features outside those groups that still belong to the event POC. */
export const EVENT_FEATURES_ELSEWHERE = new Set(["pr.to_event", "pr.partial_selection"]);

export interface DefectPattern {
  id: string;
  /** a plain-English title for the regression case */
  title: string;
  /** matched against the stripped, lower-cased subject + text */
  test: RegExp;
  feature: string;
  eventType: Scenario["eventType"];
  why: string;
  preconditions: string;
  steps: string[];
  expected: string;
  observed: string;
  oracle: string;
  errorCode?: string;
  backendCite?: string;
  libraryTwin?: string;
  automatable: boolean;
  notAutomatableBecause?: string;
  /**
   * A hand-written API plan in the compiler's own language, used instead of
   * compiling the words (scripts/hubspot-reproduce.ts validates it with
   * validatePlan first). Written where a compiled plan was seen to skip the
   * precondition the defect needs — the "nearest step" trap — and to assert
   * every part of the expected result, so its coverage is full.
   */
  plan?: Omit<ApiPlan, "caseId">;
}

/** Most specific first: the first pattern that matches wins. */
export const PATTERNS: DefectPattern[] = [
  {
    id: "rfp_ends_after_rfq",
    title: "An event whose technical round ends after its pricing round cannot be published",
    test: /\b712\b|rfp duration exceeds|(?:rfp|technical (?:round|stage))[^.]{0,60}\b(?:end|ends|close|closes|closing)\b[^.]{0,60}\b(?:after|later than|beyond)\b[^.]{0,40}\b(?:rfq|pricing|commercial)/,
    feature: "events.rfp_rfq",
    eventType: "rfp_rfq",
    why: "If the technical round can still be open when pricing closes, vendors price before they know whether they qualified — customers reported events going live in that state.",
    preconditions: "A fresh draft event with a technical (RFP) round and a pricing (RFQ) round, where the technical round is set to end AFTER the pricing round ends.",
    steps: ["Publish the event."],
    expected: "Publishing is refused with “RFP duration exceeds RFQ end time. Please adjust.”; neither round goes live.",
    observed: "An event went live with its technical round ending after its pricing round (or the timing message appeared when it should not have).",
    oracle: "HTTP 422 with code 712; reading the event back shows it is still a draft.",
    errorCode: "712",
    backendCite: "app/controllers/concerns/trade_controller_helper.rb:643-675 (validate_rfp_rfq_bid_end_time); app/services/event_groups/update_service.rb:303-314",
    libraryTwin: "EDGE-PUB-013",
    automatable: true,
    plan: {
      version: 1,
      title: "An event whose technical round ends after its pricing round cannot be published",
      setup: { recipe: "draft_rfp_rfq" },
      act: [
        {
          op: "extend_round",
          as: "buyer",
          params: { round: "technical" },
          change: [{ path: "increase_auction_time", set: "{{roundEnd+3600}}" }],
          expect: "accept",
          ifRefused: "inconclusive",
          say: "While the event is still a draft, move the technical round's end to one hour AFTER the pricing round's end.",
        },
        { op: "publish_event", as: "buyer", decisive: true, say: "Publish the event." },
      ],
      verify: [
        { op: "read_round", as: "buyer", assert: [{ path: "status", op: "not_equals", value: "active", say: "the pricing round did not go live" }] },
        { op: "read_rfp_round", as: "buyer", assert: [{ path: "status", op: "not_equals", value: "active", say: "the technical round did not go live" }] },
      ],
      expected: { outcome: "reject", code: "712", message: "RFP duration exceeds RFQ end time. Please adjust." },
    },
  },
  {
    id: "late_bid_accepted",
    title: "A vendor cannot open a bid after the bidding window has closed",
    test: /(?:bid|quote|quotation|offer|price)s?[^.]{0,80}\b(?:after|past|beyond|post)\b[^.]{0,30}\b(?:deadline|end time|closing|closed|close|bid end|due date|cut-?off)|(?:accepted|allowed|went through|got submitted|submitted)[^.]{0,40}\bafter\b[^.]{0,30}\b(?:deadline|close|closing|closed|end time|cut-?off)/,
    feature: "bids.submit",
    eventType: "rfq_only",
    why: "A quote accepted after the deadline changes the result after the event closed — customers reported late quotes being counted.",
    preconditions: "A fresh RFQ event, published, with one QA vendor invited, no bids, and its bidding window (with any extra closing time) already over.",
    steps: ["Sign in as the invited QA vendor.", "Try to open a new bid on the closed pricing round."],
    expected: "The bid is refused with “Order not active”; no bid is created and the buyer sees no late quote.",
    observed: "A vendor's quote was accepted after the bidding deadline had passed.",
    oracle: "HTTP 422 with code 33; no bid exists on the round afterwards.",
    errorCode: "33",
    backendCite: "app/helpers/api/v1/bids_controller_helper.rb:71-73 (refuses with 33 when the round is no longer running)",
    libraryTwin: "EDGE-BID-049",
    automatable: true,
    plan: {
      version: 1,
      title: "A vendor cannot open a bid after the bidding window has closed",
      setup: { recipe: "closed_rfq" },
      act: [{ op: "open_bid", as: "vendor", decisive: true, say: "The invited QA vendor tries to open a bid on the closed pricing round." }],
      verify: [{ op: "read_round", as: "buyer", assert: [{ path: "bid_count", op: "equals", value: 0, say: "the round still has no bid" }] }],
      expected: { outcome: "reject", code: "33", message: "Order not active" },
    },
  },
  {
    id: "vendor_cannot_see_event",
    title: "An invited vendor can see and open a published event",
    test: /vendors?\b[^.]{0,60}\b(?:can'?t|cannot|unable to|not able to|doesn'?t|does not|didn'?t|did not|could not|couldn'?t)\b[^.]{0,30}\b(?:see|view|find|access|open|get)\b[^.]{0,40}\b(?:event|rfq|rfp|auction|enquiry|inquiry)|(?:event|rfq|rfp|enquiry)[^.]{0,40}\bnot (?:visible|showing|appearing|listed)\b[^.]{0,30}\b(?:to|for)\b[^.]{0,10}\bvendors?/,
    feature: "events.invite_vendors",
    eventType: "rfq_only",
    why: "A vendor who cannot see the event cannot quote; customers reported invited vendors not finding published events.",
    preconditions: "A fresh RFQ event, published, with one QA vendor invited; bidding open.",
    steps: ["Sign in as the invited QA vendor.", "Open the event's pricing round as that vendor."],
    expected: "The invited vendor can open the published event's pricing round and sees its line items.",
    observed: "An invited vendor could not see or open a published event.",
    oracle: "The vendor's read of the round answers 2xx with the event's line items; never 401/404 for an invited vendor.",
    automatable: true,
  },
  {
    id: "award_total_wrong",
    title: "The award total equals the awarded quantity times the quoted price",
    test: /award[^.]{0,80}\b(?:total|amount|value|sum|grand total)\b[^.]{0,60}\b(?:wrong|incorrect|mismatch|not match|doesn'?t match|does not match|differ|different)|\b(?:total|amount|value)\b[^.]{0,60}\b(?:wrong|incorrect|mismatch)\b[^.]{0,60}\baward/,
    feature: "award.add_response",
    eventType: "rfq_only",
    why: "The award total becomes the purchase order value; customers reported award totals that did not match the quotes.",
    preconditions: "A fresh RFQ event the QA vendor bid on, closed, and awarded to that vendor (award submitted for approval).",
    steps: ["Read the award back.", "Compare each awarded line's total with the awarded quantity × the vendor's quoted unit price."],
    expected: "Every awarded line's total, and the award total, equal quantity × quoted unit price (plus the quoted taxes).",
    observed: "The award total did not match the vendor's quoted prices.",
    oracle: "Read-back totals equal the computed totals to the paisa; never a 5xx.",
    automatable: true,
  },
  {
    id: "auction_rank_wrong",
    title: "In a rank-based auction each vendor sees their correct rank after every bid",
    test: /\b(?:rank|ranking|l1|position)\b[^.]{0,60}\b(?:wrong|incorrect|not updat\w*|stale|not chang\w*|mismatch)|auction[^.]{0,60}\brank/,
    feature: "auction.rank",
    eventType: "auction",
    why: "Rank is the only thing a vendor sees in a rank-based auction; a wrong rank makes vendors bid against a phantom.",
    preconditions: "A live rank-based reverse auction with two QA vendors bidding.",
    steps: ["Vendor 1 bids below vendor 2.", "Read each vendor's rank.", "Vendor 2 bids below vendor 1 and both read their rank again."],
    expected: "After every bid, the lowest price is rank 1 and the other vendor rank 2, as each vendor sees it.",
    observed: "A vendor's rank in a live auction was wrong or did not update.",
    oracle: "Ranks read back match the price order after each bid.",
    automatable: false,
    notAutomatableBecause: "the API test compiler has no recipe for a live auction yet (no auction setup in its vocabulary)",
  },
  {
    id: "unit_mismatch",
    title: "A line item keeps the product's own unit, and a unit the client does not have is refused",
    test: /\b(?:unit|uom|unit of measure(?:ment)?)s?\b[^.]{0,80}\b(?:not (?:available|present|found|listed|showing)|wrong|incorrect|changed|mismatch|missing|different)|\b495\b|unit [^.]{0,30} is not present/,
    feature: "events.validation",
    eventType: "rfq_only",
    why: "A quantity in the wrong unit is a wrong order; customers reported units changing or being called unavailable on line items.",
    preconditions: "A fresh draft RFQ event on the client under test, with one line item for a product that lists its unit of measure.",
    steps: ["Read the line item back and note its unit.", "Add a pricing round to the event using the client's default pricing template.", "Read the line items again."],
    expected: "The line item keeps the product's own unit at every step; a unit the client does not have is refused with “The unit … is not present”, never silently replaced.",
    observed: "The unit on a line item did not match the product's unit, or a listed unit was reported as not available.",
    oracle: "The unit read back equals the product's unit; any refusal is HTTP 422 code 495 naming the unit, never a 5xx.",
    errorCode: "495",
    backendCite: "app/controllers/concerns/trade_template_helper.rb:1398-1415 (units looked up in the workspace; missing ones refused with 495)",
    automatable: true,
  },
  {
    id: "document_export",
    title: "An exported or downloaded event document is complete and readable",
    test: /\b(?:pdf|export|exported|download|downloaded|print)\b[^.]{0,80}\b(?:cut|cuts|blank|missing|wrong|error|not (?:working|opening|downloading)|truncat\w*|empty|garbled|overlap\w*)|(?:comparison sheet|qcs)[^.]{0,60}\b(?:pdf|export|download)/,
    feature: "evaluation.qcs",
    eventType: "rfq_only",
    why: "Buyers send the exported comparison to approvers; a cut-off or blank export hides prices from the people approving them.",
    preconditions: "A closed RFQ event with two QA vendor quotes.",
    steps: ["Open the quote comparison.", "Export it as a PDF and open the file."],
    expected: "Every vendor column and every line item appear in the file, with the same prices as the screen.",
    observed: "An exported document was cut off, blank or wrong.",
    oracle: "A person compares the file with the screen.",
    automatable: false,
    notAutomatableBecause: "the defect is in a generated file's layout; an API plan cannot read a PDF's pages",
  },
];

export function matchPattern(strippedLower: string): DefectPattern | null {
  return PATTERNS.find((p) => p.test.test(strippedLower)) ?? null;
}
