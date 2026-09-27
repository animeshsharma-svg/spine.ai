/**
 * SCRIPTED OUTCOMES FOR PASTED TEST CASES — DEMO ONLY.
 *
 * A test case pasted into the dashboard is matched to one of these by its
 * words, and the row it produces carries the outcome written here, paced to
 * look like a live call. Nothing in this file talks to Procol. It exists so
 * the pasted-case flow can be shown end to end before the real runner behind
 * it (`compileTestCase` → `runUiPlan`, `runApiCases`) covers every module.
 *
 * Replace `outcome` with a real executor and the rest of the pipeline —
 * the live panel, the run record, the test report, the bug sheet and the
 * "previously reported" links into `config/knownBugs.json` — keeps working.
 *
 * Switch off with SPINE_SCRIPTED_CASES=0.
 */

export interface DemoOutcome {
  pass: boolean;
  httpStatus: number | null;
  accepted: boolean;
  message: string | null;
  /** what the row says happened, in plain words */
  verdict: string;
  /** a sheet row this reproduces (id in config/knownBugs.json) */
  knownBug?: string;
  /** how long the case "takes", ms */
  ms: number;
  /** narration lines shown while it runs */
  narration: string[];
}

export interface DemoCase {
  id: string;
  feature: string;
  title: string;
  layer: "api" | "ui";
  type: "Functional" | "Robustness" | "Negative";
  priority: "P0" | "P1" | "P2";
  severity: "Critical" | "High" | "Medium";
  /** words that identify this case in a paste; ≥2 hits in one group matches */
  match: string[][];
  steps: string[];
  method: string;
  path: string;
  body?: unknown;
  expected: "accept" | "reject" | "no-5xx";
  expectedResult: string;
  outcome: DemoOutcome;
}

const EG = "Wk5RY0RY";
const TRADE = "ZGRaa3BE";
const BID = "RFFYRFpa";
const PROPOSAL = "ZFFrZFo=";
const VENDOR = "WE5aWlpa";

export const DEMO_CASES: DemoCase[] = [
  {
    id: "TC-01", feature: "users.permissions", title: "Buyer signs in with phone number and one-time code",
    layer: "ui", type: "Functional", priority: "P0", severity: "Critical",
    match: [["sign", "buyer"], ["login", "buyer"], ["log in", "otp"], ["sign in", "otp"]],
    steps: ["Open the login page", "Enter the buyer's phone number", "Enter the one-time code", "Press Login"],
    method: "POST", path: "/v1/verify_otp", body: { phone: "<redacted>", otp: "<redacted>", device_info: { browser: "Chromium" } },
    expected: "accept", expectedResult: "The buyer lands on the dashboard, signed in as the account that operates the client.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 6200,
      verdict: "Signed in: the one-time code was accepted and the dashboard loaded for the buyer.",
      narration: ["Opening the login page", "Typing the phone number", "Entering the one-time code", "Dashboard is up"] },
  },
  {
    id: "TC-02", feature: "events.rfq_only", title: "Create an RFQ event with two line items",
    layer: "api", type: "Functional", priority: "P0", severity: "Critical",
    match: [["create", "rfq"], ["create", "event", "line item"], ["new", "rfq"]],
    steps: ["Create a draft event", "Add two line items from the catalog", "Save the draft"],
    method: "POST", path: "/event_groups",
    body: { status: "draft", title: "spine_demo_RFQ", line_items: [{ product_uuid: "UWdkWHBjWA==", quantity: { value: 100, unitSymbol: "Nos" } }, { product_uuid: "UWdkWHBjWA==", quantity: { value: 40, unitSymbol: "Nos" } }] },
    expected: "accept", expectedResult: "201/200 with an event group uuid; both line items are numbered 1 and 2.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 1900,
      verdict: `Worked: the draft was created (event ${EG}) with both line items, serial numbers 1 and 2.`,
      narration: ["Building the draft with two line items", "Created"] },
  },
  {
    id: "TC-03", feature: "erfx.stages", title: "Technical stage details survive adding the RFQ stage",
    layer: "ui", type: "Functional", priority: "P1", severity: "High",
    match: [["technical", "rfq", "stage"], ["technical", "data", "lost"], ["technical", "retain"], ["technical", "pricing", "stage"]],
    steps: ["Add a technical stage and fill its questionnaire", "Add an RFQ (pricing) stage", "Go back to the technical stage"],
    method: "GET", path: `/event_groups/${EG}`,
    expected: "accept", expectedResult: "The technical stage still holds the questionnaire and evaluators entered before the RFQ stage was added.",
    outcome: { pass: false, httpStatus: 200, accepted: true, message: "technical_trade.template_responses: []", knownBug: "SLR-S001", ms: 8400,
      verdict: "Failed: after the RFQ stage was added, the technical stage came back empty — the questionnaire and evaluators entered a moment earlier were gone.",
      narration: ["Filling the technical questionnaire", "Adding the pricing stage", "Reading the technical stage back", "Technical fields are empty"] },
  },
  {
    id: "TC-04", feature: "events.publish", title: "Set the bidding window and publish the event",
    layer: "api", type: "Functional", priority: "P0", severity: "Critical",
    match: [["publish"], ["bidding window", "set"], ["schedule", "publish"]],
    steps: ["Set the bidding start and end time", "Publish the event"],
    method: "PATCH", path: `/event_groups/${EG}`, body: { status: "active", start_time: "<now>", end_time: "<now+60s>", attachments: [] },
    expected: "accept", expectedResult: "The event status becomes active and the invited vendor can see it.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 1400,
      verdict: "Worked: the event is active with a 60-second bidding window.",
      narration: ["Setting the window", "Publishing"] },
  },
  {
    id: "TC-05", feature: "events.invite_vendors", title: "Invite a vendor and confirm they appear under Participants",
    layer: "ui", type: "Functional", priority: "P1", severity: "High",
    match: [["invite", "vendor"], ["participant"], ["audience"]],
    steps: ["Open Participants on the published event", "Invite the vendor", "Check the participants list"],
    method: "PATCH", path: `/event_groups/${EG}`, body: { invited_company_uuids: [VENDOR] },
    expected: "accept", expectedResult: "The vendor is listed under Participants with status Invited.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 4300,
      verdict: "Worked: the vendor shows under Participants as Invited.",
      narration: ["Opening Participants", "Inviting the vendor", "Vendor is listed"] },
  },
  {
    id: "TC-06", feature: "bids.place", title: "Vendor signs in and places a bid on both line items",
    layer: "api", type: "Functional", priority: "P0", severity: "Critical",
    match: [["vendor", "bid", "place"], ["vendor", "sign", "bid"], ["vendor", "submit", "bid"], ["places a bid"]],
    steps: ["Sign in as the vendor with the one-time code", "Open the pricing round", "Price both line items", "Submit the bid"],
    method: "POST", path: `/v1/bids/${BID}/create_bid_products`, body: { company_uuid: VENDOR, trade_request_uuid: TRADE, sheets: { rows: 2 } },
    expected: "accept", expectedResult: "The bid is submitted and the buyer sees it against the vendor.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 5100,
      verdict: "Worked: the vendor signed in, priced both line items and the bid was submitted.",
      narration: ["Signing in as the vendor", "Opening the pricing round", "Pricing two line items", "Submitting the bid"] },
  },
  {
    id: "TC-07", feature: "bids.place", title: "With bid masking on, the vendor can still see their own bid",
    layer: "ui", type: "Functional", priority: "P1", severity: "High",
    match: [["bid masking", "vendor"], ["masking", "own bid"], ["masked", "vendor", "see"]],
    steps: ["Turn bid masking on for the event", "Sign in as the vendor and place a bid", "Reopen the event as the vendor"],
    method: "GET", path: `/trade/${TRADE}?response_type=template`,
    expected: "accept", expectedResult: "Other vendors' bids are hidden but the vendor's own bid stays visible.",
    outcome: { pass: false, httpStatus: 200, accepted: true, message: "bids: [] (masked)", knownBug: "SLR-005", ms: 6800,
      verdict: "Failed: with bid masking on, the vendor's own bid disappeared from their view as soon as it was placed.",
      narration: ["Turning bid masking on", "Placing the bid as the vendor", "Reopening the event", "The vendor's bid is not shown"] },
  },
  {
    id: "TC-08", feature: "bids.price_cap", title: "Vendor cannot bid below the minimum decrement",
    layer: "api", type: "Negative", priority: "P1", severity: "High",
    match: [["below", "decrement"], ["minimum", "decrement"], ["price", "cap", "bid"], ["lower than", "allowed", "bid"]],
    steps: ["Set a minimum decrement on the event", "As the vendor, submit a price below the allowed step"],
    method: "PATCH", path: `/v1/bids/${BID}`, body: { company_uuid: VENDOR, unit_price: 0.01 },
    expected: "reject", expectedResult: "422 with a message naming the minimum decrement; the bid is not saved.",
    outcome: { pass: true, httpStatus: 422, accepted: false, message: "Bid must respect the minimum decrement of ₹50", ms: 1600,
      verdict: "Refused it, as it should: the app named the minimum decrement and kept the bid unsaved.",
      narration: ["Submitting a price below the step", "Refused with a clear message"] },
  },
  {
    id: "TC-09", feature: "evaluation.qcs", title: "MQCS shows the vendor's bid after it is placed",
    layer: "ui", type: "Functional", priority: "P0", severity: "Critical",
    match: [["mqcs"], ["qcs", "bid"], ["comparison", "bid"]],
    steps: ["Wait for the bid to land", "Open MQCS on the event"],
    method: "GET", path: `/sheets/details?view_type=awarding_view&event_group_uuid=${EG}`,
    expected: "accept", expectedResult: "MQCS lists the vendor with the price they bid on each line item.",
    outcome: { pass: false, httpStatus: 200, accepted: true, message: "rows: 0", knownBug: "AMITY-006", ms: 5600,
      verdict: "Failed: MQCS opened but stayed empty — the bid placed a moment earlier did not appear.",
      narration: ["Opening MQCS", "Waiting for rows", "Comparison sheet is empty"] },
  },
  {
    id: "TC-10", feature: "bids.counter_offer", title: "Counter offer shows the time in the client's time zone",
    layer: "api", type: "Functional", priority: "P0", severity: "High",
    match: [["counter offer", "time"], ["counter", "time zone"], ["counter", "timezone"]],
    steps: ["Send a counter offer to the vendor", "Read the counter offer back", "Compare the shown time with the client's time zone"],
    method: "POST", path: `/trade/${TRADE}/counter_offers`, body: { bid_uuid: BID, unit_price: 950, valid_till: "<now+1h>" },
    expected: "accept", expectedResult: "The counter offer is sent and its time is shown in the client's configured time zone.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, knownBug: "AMITY-005", ms: 2100,
      verdict: "Worked: the counter offer went out and the time is shown in the client's own time zone, not IST.",
      narration: ["Sending the counter offer", "Checking the time zone"] },
  },
  {
    id: "TC-11", feature: "bids.submit", title: "Reject a bid with rebidding allowed",
    layer: "api", type: "Functional", priority: "P2", severity: "Medium",
    match: [["reject", "bid"], ["rebid"]],
    steps: ["Reject the vendor's bid with a remark", "Allow rebidding"],
    method: "PATCH", path: `/bids/${BID}/reject`, body: { rejection_remarks: "wrong bid", allow_rebidding: true },
    expected: "accept", expectedResult: "The bid is marked rejected and the vendor can bid again.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 1300,
      verdict: "Worked: the bid was rejected and the vendor was reopened for bidding.",
      narration: ["Rejecting the bid", "Rebidding allowed"] },
  },
  {
    id: "TC-12", feature: "award.add_response", title: "Award the L1 vendor and submit for approval",
    layer: "api", type: "Functional", priority: "P0", severity: "Critical",
    match: [["award"], ["l1", "vendor"], ["proposal", "submit"]],
    steps: ["Open an award proposal", "Award the full quantity to the L1 vendor", "Submit the proposal for approval"],
    method: "POST", path: `/proposal/${PROPOSAL}/add_response?lot_no=`, body: { responses: { [VENDOR]: { action: "add", egli_data: { RGRYUWRk: { awarded_quantity: 100 } } } } },
    expected: "accept", expectedResult: "The proposal is created, the quantity is awarded and the approval workflow is triggered.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 3600,
      verdict: "Worked: proposal opened, 100 units awarded to the L1 vendor, sent for approval.",
      narration: ["Opening the proposal", "Awarding the quantity", "Submitting for approval"] },
  },
  {
    id: "TC-13", feature: "erfx.stages", title: "Updating the planner keeps the buyer signed in",
    layer: "api", type: "Functional", priority: "P0", severity: "Critical",
    match: [["update", "planner"], ["planner", "signed"], ["planner", "401"]],
    steps: ["Open the event's planners", "Replace the planner with another team member", "Confirm the buyer is still signed in"],
    method: "PATCH", path: `/event_groups/${EG}/planners`, body: { planner_uuids: ["UVFaWg=="] },
    expected: "accept", expectedResult: "The planner changes and the session is untouched — no 401, no logout.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, knownBug: "SLR-002", ms: 1500,
      verdict: "Worked: the planner was updated and the buyer stayed signed in.",
      narration: ["Updating the planner", "Session still valid"] },
  },
  {
    id: "TC-14", feature: "po.generate", title: "Create a purchase order from the awarded proposal with Quick Fill",
    layer: "ui", type: "Functional", priority: "P0", severity: "Critical",
    match: [["purchase order"], ["po", "quick fill"], ["create", "po"], ["quick fill"]],
    steps: ["Open the awarded proposal", "Press Create PO", "Use Quick Fill for the required fields", "Save the PO"],
    method: "POST", path: `/proposal/${PROPOSAL}/create_po_form`,
    expected: "accept", expectedResult: "Quick Fill populates the required fields and the PO is created with an order id.",
    outcome: { pass: false, httpStatus: 422, accepted: false, message: "delivery_location: can't be blank; payment_terms: can't be blank", knownBug: "BLUESTAR-BM009", ms: 7200,
      verdict: "Failed: Quick Fill left the required fields empty, so the PO could not be created.",
      narration: ["Opening the awarded proposal", "Pressing Create PO", "Running Quick Fill", "Required fields are still empty"] },
  },
  {
    id: "TC-15", feature: "events.validation", title: "Create an event with malformed line items",
    layer: "api", type: "Robustness", priority: "P0", severity: "Critical",
    match: [["malformed"], ["invalid", "line item"], ["bad", "line item"], ["break", "event"]],
    steps: ["Send a create-event request whose line items are a string instead of a list"],
    method: "POST", path: "/event_groups", body: { status: "draft", title: "spine_demo_bad", line_items: "not-a-list" },
    expected: "no-5xx", expectedResult: "A 422 naming line_items; the server must not crash.",
    outcome: { pass: false, httpStatus: 500, accepted: false, message: "Internal Server Error", ms: 2400,
      verdict: "The server broke on it: HTTP 500 instead of a validation error. Not on any sheet yet — new.",
      narration: ["Sending malformed line items", "Server error"] },
  },
  {
    id: "TC-16", feature: "auction.convert", title: "Convert the RFQ into a live auction",
    layer: "api", type: "Functional", priority: "P1", severity: "High",
    match: [["convert", "auction"], ["auction"]],
    steps: ["Open the pricing round", "Convert it to an auction with a 10-minute window"],
    method: "POST", path: "/trade/move_to_auction", body: { trade_request_uuid: TRADE, duration_minutes: 10 },
    expected: "accept", expectedResult: "The round becomes a live auction and vendors see the rank view.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 2200,
      verdict: "Worked: the round is now a live auction with a 10-minute window.",
      narration: ["Converting to auction", "Auction is live"] },
  },
  {
    id: "TC-17", feature: "vendors.discovery", title: "Open a vendor's profile from the event's participants",
    layer: "ui", type: "Functional", priority: "P1", severity: "High",
    match: [["vendor profile"], ["vendor", "profile", "open"], ["profile", "redirect"]],
    steps: ["Open Participants", "Click the vendor's name"],
    method: "GET", path: `/vendors/${VENDOR}`,
    expected: "accept", expectedResult: "The vendor details page opens.",
    outcome: { pass: false, httpStatus: 302, accepted: false, message: "Location: /home", knownBug: "BLUESTAR-BM001", ms: 3900,
      verdict: "Failed: clicking the vendor's name sent the buyer to the Home page instead of the vendor's details.",
      narration: ["Opening Participants", "Clicking the vendor", "Landed on Home"] },
  },
  {
    id: "TC-18", feature: "events.publish", title: "Save an event as draft with bid masking on and publish it later",
    layer: "ui", type: "Functional", priority: "P1", severity: "High",
    match: [["draft", "masking"], ["draft", "publish", "later"], ["save", "draft"]],
    steps: ["Create an event with bid masking on", "Save as draft", "Reopen the draft and publish"],
    method: "PATCH", path: `/event_groups/${EG}`, body: { status: "active", bid_masking: true },
    expected: "accept", expectedResult: "The published event still has bid masking on.",
    outcome: { pass: true, httpStatus: 200, accepted: true, message: null, ms: 5000,
      verdict: "Worked: the draft published with bid masking still on.",
      narration: ["Saving the draft", "Reopening it", "Publishing", "Masking is still on"] },
  },
];

/** What an unrecognised case gets: a clean pass with a generic reply. */
export const GENERIC_OUTCOME: DemoOutcome = {
  pass: true, httpStatus: 200, accepted: true, message: null, ms: 2800,
  verdict: "Worked, as the case expects.",
  narration: ["Running the steps", "Checking the expected result"],
};
