/**
 * WHICH STATE AND WHICH SCREEN a written screen case starts on
 * (docs/ui-automation-design.md §2, §3) — deterministic, from the case's words.
 *
 * The answer drives the API setup (uiSetup.ts builds the state) and the first
 * plan step (open_prepared opens the screen). A case whose screen is not in the
 * screen model yet (the vendor portal, the PR/intake screens) is reported as a
 * gap, never forced onto a nearby screen.
 */
import type { CatalogCase } from "../checks/testCatalog.js";
import type { UiState } from "./uiSetup.js";

export interface CasePrep {
  /** false when the case's screen is not in the screen model yet */
  ok: boolean;
  state: UiState;
  /** a SCREENS key (procol-ui-tests/src/plan/screens.ts), or "create" for a new create screen */
  screen: string;
  screenWhat: string;
  technical: boolean;
  /** the pricing round is a live AUCTION (auction_only / rfp_auction journey), not an RFQ */
  auction?: boolean;
  /** true when the plan opens a screen on an API-built event (open_prepared); false for a fresh create screen / list */
  prepared: boolean;
  /** the case is about what the VENDOR sees: after publish the plan switches to the supplier portal */
  vendorSide?: boolean;
  why: string;
}

const WHAT: Record<string, string> = {
  events_list: "the events list",
  drafts_list: "the Drafts tab of the events list",
  create: "a new event's create screen",
  draft: "the draft event's create screen (reopened)",
  summary: "the event's summary page",
  responses: "the pricing round's Responses (comparison) tab",
  overview: "the pricing round's Overview tab",
  participants: "the pricing round's Participants tab",
  master_qcs: "Master QCS",
  analytics: "the pricing round's Analytics tab",
  vendor: "the supplier portal, on this event, as the invited vendor",
};

const r = (state: UiState, screen: string, technical: boolean, why: string): CasePrep => ({
  ok: true,
  state,
  screen,
  screenWhat: WHAT[screen] ?? screen,
  technical,
  prepared: !(screen === "create" || (state === "none" && screen === "events_list")),
  why,
});

export function prepFor(c: Pick<CatalogCase, "id" | "group" | "title" | "setup" | "steps" | "expected">): CasePrep {
  const p = prepCore(c);
  // A case whose own setup starts from an auction (and is not a conversion — that starts from
  // an RFQ) gets a live auction round instead of an RFQ.
  const setup = String(c.setup ?? "").toLowerCase();
  if (p.ok && p.prepared && p.state !== "draft" && !["dutch", "knockout", "forward"].includes(p.state) && /\bauction\b/.test(setup) && !/convert|conversion|rfq/.test(setup) && c.group !== "UI-CONV")
    return { ...p, auction: true, why: `${p.why} (as a live auction round)` };
  // Two vendors named in the setup (10 Nov): a buyer-side case on an event with two vendors' bids used to get one
  // QA vendor's bid and compare nothing. Both QA vendors are invited; with bids named, both have bid (two_bids).
  if (p.ok && p.prepared && (p.state === "bid" || p.state === "live") && /two vendors(?! closing)|\b2 vendors\b|second vendor|both vendors|two (distinct )?(vendor )?companies|vendors? a\b.*vendors? b\b|two bids|\b2 bids\b|two vendors' bids/.test(setup) && !/closing mode/.test(setup)) {
    const bids = p.state === "bid" || /\bbids?\b|quotes?\b|\(\d+\)/.test(setup);
    return { ...p, state: bids ? "two_bids" : "two_invited", why: `${p.why} — with TWO QA vendors ${bids ? "and a bid from each" : "invited"} (the setup names two vendors)` };
  }
  return p;
}

function prepCore(c: Pick<CatalogCase, "id" | "group" | "title" | "setup" | "steps" | "expected">): CasePrep {
  const t = `${c.title} ${c.setup} ${c.steps} ${c.expected}`.toLowerCase();
  const technical = /\btechnical (round|stage|bid|response|evaluation)|\brfp (round|stage)|technical \+ rfq|evaluator|questionnaire|vendor assessment/.test(t);
  const g = c.group;

  // Screens not in the model yet — said plainly, never forced elsewhere.
  // The supplier portal (2 Nov): the event is built by API with its QA vendor invited (bid / closed when the
  // case says so) and opened in the vendor's own browser, signed in as that vendor (open_prepared vendor).
  if (g === "UI-VBID" || /supplier portal|vendor portal|\bas the vendor\b|the vendor('s)? (sees|view|screen|sheet|side|portal|opens|reads)|vendor side/.test(t)) {
    const setup2 = String(c.setup ?? "").toLowerCase();
    const both = `${setup2} ${c.title.toLowerCase()}`;
    // A vendor the event does NOT have (10 Nov): the event is built live by API with one QA vendor invited, and the
    // context's vendor is ANOTHER QA vendor of the client — the plan signs in as that one and tries to open it
    // (open_prepared vendor). The invited vendor's name is in values.invitedVendorName.
    if (/uninvited|not invited|not on its audience|vendor not (on|in) the (audience|event)|other vendor|another vendor(?! bids)/.test(both) && !/two vendors|\b2 vendors\b|second vendor|both vendors/.test(both))
      return { ok: true, state: "uninvited", screen: "vendor", screenWhat: "the supplier portal, signed in as a QA vendor the event was NOT sent to", technical, prepared: true, why: "a vendor-side case about a vendor the event does not have — built live by API with one QA vendor invited; the plan signs in as a second QA vendor that was not invited and tries to open the event" };
    // Two vendors (10 Nov): both QA vendors invited; with bids named, each has placed its own bid (two_bids).
    if (/two vendors|\b2 vendors\b|second vendor|both vendors|two distinct vendor|vendor a .* vendor b|two (vendor )?companies/.test(both)) {
      const bids = /\bbids?\b|\(\d+\)|bidding on/.test(setup2);
      return bids
        ? { ok: true, state: "two_bids", screen: "vendor", screenWhat: "the supplier portal, on this event, as the first of the two QA vendors that bid", technical, prepared: true, why: "a vendor-side case with two vendors' bids — built live by API with two QA vendors invited, each having submitted its own bid; opened as the first vendor (values.secondVendorName names the other)" }
        : { ok: true, state: "two_invited", screen: "vendor", screenWhat: "the supplier portal, on this event, as the first of the two invited QA vendors", technical, prepared: true, why: "a vendor-side case with two vendors invited — built live by API with two QA vendors on the audience and no bid yet; opened as the first vendor (values.secondVendorName names the other)" };
    }
    // An event the API builds never reaches the vendor's own list (2 Nov: 132s of looking, "not among the
    // vendor's events" — the API's audience is not the invitation the portal lists). So the plan creates
    // and publishes the event in the console, invites the QA vendor there, and only then switches sides.
    return { ...r("none", "create", technical, "a vendor-side case — the plan creates and publishes the event in the console with its QA vendor invited, then switches to the supplier portal as that vendor (switch_portal + vendor_open_event)"), vendorSide: true };
  }
  if (g === "UI-PR" || g === "UI-XDPRE" || /purchase request|\bpr\b line|intake/.test(t))
    return { ok: false, state: "none", screen: "pr", screenWhat: "the purchase-request screens", technical, prepared: false, why: "the purchase-request screens are not in the screen model yet" };
  if (g === "UI-ENV" || g === "UI-PERM" || g === "UI-NFR")
    return { ok: false, state: "none", screen: "session", screenWhat: "sessions, permissions and load", technical, prepared: false, why: "needs another user, a second company or load — not a screen state the API setup builds" };

  // THE CASE'S OWN SETUP decides first. A state the API setup cannot build yet is said
  // plainly (couldn't tell), never replaced by a nearby state: UI-CONV-010 ("a draft RFQ") ran
  // on a published RFQ with a bid and "found" Convert to Auction offered; UI-XDAMD-011 ("an old
  // version") ran on a never-amended event and "found" no Send to Evaluation — both went to
  // the to-confirm queue as if the product misbehaved.
  const setup = String(c.setup ?? "").toLowerCase();
  const t2all = `${c.title} ${c.steps} ${c.expected}`.toLowerCase();
  // An amended event (10 Nov): built live by API with the vendor's bid, then a new version issued and published.
  // "v1 / the original / an old version / superseded" opens the OLD version (amended); "a published amendment /
  // the amended event's own panel" opens the NEW version (amendment). (The old rule's title check carried literal
  // backspace characters where \b was meant and never matched.)
  if (/newer version|superseded|old(er)? version|previous version|amended (event|rfq|rfp)|after an amendment|published amendment|\bv1 of\b|\(v1\)|two versions/.test(setup) || /on an old version|old version/.test(c.title.toLowerCase())) {
    const newOne = /published amendment|the amendment('s)? (details|panel|remark)|on the amended event|new version('s)? (details|summary)/.test(setup) && !/\bv1 of\b|\(v1\)|old(er)? version|original|superseded|newer version/.test(setup);
    const screen = /master qcs|\bqcs\b|award/.test(t2all) ? "master_qcs" : /participants?|add bid/.test(t2all) ? "participants" : /responses|comparison|counter offer/.test(t2all) ? "responses" : "summary";
    return r(newOne ? "amendment" : "amended", screen, technical, `the case starts from ${newOne ? "the published amendment (the NEW version of an amended event)" : "an OLD version of an amended event (v1, no longer the latest)"} — built by API (live, the vendor's bid in, a new version issued and published); opened on ${WHAT[screen] ?? screen}`);
  }
  // Vendor masking on (10 Nov): a per-round setting (is_vendor_masking_enabled on the stage) the company allows;
  // built live by API with the vendor's bid in.
  if (/masking (is |switched |turned )?on|vendor masking enabled|isvendormaskingenabled|with vendor masking|masking enabled/.test(setup)) {
    const screen = /responses|comparison|bid(s)? (list|table)|counter offer/.test(t2all) ? "responses" : /master qcs|\bqcs\b/.test(t2all) ? "master_qcs" : /participants?/.test(t2all) ? "participants" : "summary";
    return r("masked", screen, technical, `the case starts from a published RFQ with vendor masking on — built by API (the round created with is_vendor_masking_enabled, the vendor's bid in); opened on ${WHAT[screen] ?? screen}`);
  }
  // A published RFQ with the vendor's bid, converted into a live auction (2 Nov): the API converts it and the
  // vendor bids in the auction; the screens open on the AUCTION round.
  if (/already[- ]converted|a converted (rfq|auction)|converted auction|after (the |a )?conversion|once converted/.test(setup)) {
    const t2 = `${c.title} ${c.steps} ${c.expected}`.toLowerCase();
    const screen = /counter offer|negotiat|responses|comparison|bid(s)? (list|table)/.test(t2) ? "responses" : /master qcs|\bqcs\b|rank/.test(t2) ? "master_qcs" : /participants?|surrogate/.test(t2) ? "participants" : /overview/.test(t2) ? "overview" : "summary";
    return r("converted", screen, technical, `the case starts from an RFQ already converted to an auction — built by API (RFQ with a bid, converted; the vendor bid in the auction); opened on ${WHAT[screen] ?? screen}`);
  }
  // An award proposal already SUBMITTED for approval: the "awarded" state submits the proposal
  // into the client's approval workflow (eventJourney award_submit) and keeps its id, so the
  // proposal page opens on a requested / in-approval proposal.
  if (/(in[- ]approval|requested|submitted (for|into) (an? )?approval|pending approval|awaiting approval|sent for approval|approval (is )?pending|under approval)/.test(setup) && /proposal|award/.test(setup))
  {
    // …and opens the screen the case is ABOUT: a "not offered while in approval" check on a page
    // that never shows that control is a vacuous pass (UI-XDNEG-002 "passed" by finding no Counter
    // Offer on the proposal page — Counter Offer lives on the round's Responses).
    const t2 = `${c.title} ${c.steps} ${c.expected}`.toLowerCase();
    const screen = /counter offer|negotiat|responses|comparison|bid(s)? (list|table)/.test(t2) ? "responses"
      : /master qcs|\bqcs\b|start awarding|award(ing)? (is |button|action)|allocat(e|ing) a line/.test(t2) ? "master_qcs"
      : "proposal";
    return r("awarded", screen, technical, `the case starts from an award proposal submitted for approval — built by API (award submitted into the approval workflow); opened on ${WHAT[screen] ?? "the award proposal page"}`);
  }
  // A case that names its starting state as awarded / with an award proposal starts THERE, not
  // from a closed event: "On an awarded event, create a purchase order…" (C05, 23 Oct) and "On
  // an event with an award proposal…" were read as "an award case — closed".
  if (/\b(on|from|for|of|in) (an?|the) awarded (event|rfq|rfp|rfx|round|stage)|\b(event|rfq|rfp|round) (that|which) (has been|is|was) awarded|\bafter (the )?award (is|has been|was) (submitted|made|done)/.test(setup)) {
    const t2 = `${c.title} ${c.steps} ${c.expected}`.toLowerCase();
    const screen = /proposal/.test(t2) && !/purchase order|\bpo\b/.test(t2) ? "proposal" : /master qcs|\bqcs\b/.test(t2) ? "master_qcs" : "summary";
    return r("awarded", screen, technical, `the case starts from an awarded event — built by API (award submitted); opened on ${WHAT[screen] ?? "the award proposal page"}`);
  }
  if (/\b(with|has|having) (an? |the )?(draft )?(award )?proposal\b|\b(an? |the )?(draft )?award proposal (exists|is (drafted|open|in draft))/.test(setup)) {
    const t2 = `${c.title} ${c.steps} ${c.expected}`.toLowerCase();
    const screen = /master qcs|\bqcs\b|start awarding/.test(t2) ? "master_qcs" : "proposal";
    return r("proposal", screen, technical, `the case starts from a draft award proposal — built by API (closed, line allocated); opened on ${WHAT[screen] ?? "the award proposal page"}`);
  }
  // A withdrawn EVENT (10 Nov): published by API, then withdrawn by the buyer with a remark. "A withdrawn
  // approval / request" is about the award's approval, not the event — it falls through to the award rules.
  if (/withdrawn/.test(setup) && !(/approval|proposal|request\b/.test(setup) && !/withdrawn (event|rfq|rfp|rfx|project|stage|round)|(event|rfq|project) (is |was |has been )?withdrawn/.test(setup))) {
    const screen = /participants?|add bid|surrogate/.test(t2all) ? "participants" : /^events in /.test(setup) && /list|radio|tab/.test(t2all) ? "events_list" : "summary";
    return r("withdrawn", screen, technical, `the case starts from a withdrawn event — built by API (published, then withdrawn with a remark); opened on ${WHAT[screen] ?? screen}`);
  }
  // Auction STRATEGIES (10 Nov). A case ABOUT CHOOSING the strategy (the conversion screen / drawer, "Dutch
  // selected", "Publish") starts from the published RFQ with a bid the conversion opens on; a case ON a running
  // dutch / knockout auction starts from a live round built with that strategy. Procol has no "japanese"
  // strategy: the accept-the-price (Japanese) auction is its KNOCKOUT.
  if (/dutch|knock-?out|japanese/.test(setup)) {
    if (/conversion|convert|drawer|selected|buy order|sell order/.test(setup) && !/\b(live|running) (dutch|knockout|knock-out|japanese)|a (dutch|knockout|knock-out|japanese) auction with/.test(setup))
      return r("bid", "summary", technical, "a case about choosing a dutch / knockout strategy in the conversion drawer — a published RFQ with a vendor's bid is built by API");
    const kind = /dutch/.test(setup) ? "dutch" : "knockout";
    const screen = /participants?|add bid|surrogate/.test(t2all) ? "participants" : /overview/.test(t2all) ? "overview" : /master qcs|\bqcs\b|rank/.test(t2all) ? "master_qcs" : "summary";
    return { ...r(kind, screen, technical, `the case starts from a live ${kind} auction${kind === "knockout" && /japanese/.test(setup) ? " (Procol's name for the Japanese auction)" : ""} — built by API (an auction round created with auction_config ${kind}, two QA vendors invited); opened on ${WHAT[screen] ?? screen}`), auction: true };
  }
  if (/^\s*(a|an) draft (rfq|rfp|rfx|event|auction)\b/.test(setup) && !/proposal/.test(setup))
    return r("draft", "draft", technical, "the case starts from a draft — the draft is built by API (no publish) and reopened");

  // RFQ → Auction conversion starts on a published RFQ (with a bid, so "use RFQ quotes" has quotes).
  if (g === "UI-CONV" || /convert(ing|ed)? (it |the rfq |an rfq )?(to|into) (an )?auction|conversion/.test(t))
    return r("bid", "summary", technical, "a conversion case — a published RFQ with a vendor's bid is built by API");

  // The create screen itself — the case's subject is building the event.
  if (["UI-CRE", "UI-TPL", "UI-LI", "UI-TECH", "UI-SCH", "UI-SAV", "UI-AUC", "UI-SS", "UI-BOQ", "UI-VAL", "UI-PUB", "UI-XDBOQ", "UI-XDLOT", "UI-XDAUC", "UI-CONV"].includes(g) && !/(on|of) (a|the) (published|live|closed) (event|rfq|stage|round)|after (publish|bidding|the bid)|is live\b|bids? (are|is|has been) (placed|submitted)|evaluator scores|master qcs|counter offer/.test(t))
    return r("none", "create", technical, "a create-screen case — the screen under test is the create screen itself");

  // The events list.
  if (g === "UI-XDLST" || /events? list|(search|filter)\w* (for |by )?(the |an |its )?(events?|list|title|rfx)|list (card|row|tab)|sorter|drafts tab|history tab|live tab/.test(t)) {
    if (/draft/.test(t)) return r("draft", "drafts_list", technical, "a list case about drafts — a fresh draft is built so the list has one");
    return r("live", "events_list", technical, "a list case — a fresh live event is built so the list has one");
  }

  // Awarding, comparison, counter offers — need a bid.
  if (/award|proposal|approval|nfa\b|bid selection/.test(t) || g === "UI-AWD" || g === "UI-XDAPR") {
    if (/proposal page|proposal('s)? (overview|allocation|participants|note|order allocation|summary|workflow)|note for approval|allocation summary|discard(ing)? the (draft )?proposal|bid selection proposal/.test(t))
      return r("proposal", "proposal", technical, "a case on the award proposal page — the event is built closed with a draft proposal, opened at that proposal");
    if (/draft proposal (exists|is open)|proposal exists|existing (draft )?proposal|re-?enters?|submit(ting)? the proposal|approval (step|workflow|flow)|approvers?/.test(t))
      return r("proposal", "master_qcs", technical, "a case about an existing award proposal — the event is built closed with a draft proposal");
    return r(/closed|after (the )?end|ended|start awarding|award/.test(t) ? "closed" : "bid", "master_qcs", technical, "an award/approval case — the event is built with a bid and closed");
  }
  if (g === "UI-XDNEG" || /counter offer|negotiat/.test(t)) return r("bid", "responses", technical, "a counter-offer case — the event is built with a vendor's bid");
  if (g === "UI-XDQCS" || /master qcs|\bqcs\b|comparison|compare|\bl1\b|best (bid|price)|rank/.test(t))
    return r(/closed|after (the )?end|ended/.test(t) ? "closed" : "bid", /master qcs|\bqcs\b/.test(t) ? "master_qcs" : "responses", technical, "a comparison case — the event is built with a vendor's bid");

  // Participants and surrogate bids.
  if (g === "UI-SUR" || g === "UI-PART" || /participants?|audience|add bid|surrogate|invite/.test(t))
    return r(/existing bid|after (a|the) bid|has bid|revis/.test(t) ? "bid" : "live", "participants", technical, "a participants/surrogate case — the event is built live");

  // A reopened draft.
  if (/reopen(ed)? (the )?draft|draft (is )?reopened|saved draft|existing draft|amendment draft/.test(t)) return r("draft", "draft", technical, "a case about an existing draft — the draft is built by API");

  // Everything else on a published event.
  if (/upcoming|reschedul|not (yet )?started|before (it|the event|bidding) (starts|opens)|starts? later/.test(t))
    return r("upcoming", "summary", technical, "an upcoming-event case — published by API with bidding starting in 30 minutes");
  if (/overview/.test(t)) return r("live", "overview", technical, "an overview case — the event is built live");
  if (/analytics/.test(t)) return r("bid", "analytics", technical, "an analytics case — the event is built with a bid");
  return r(/\bbids?\b|quote/.test(t) ? "bid" : "live", "summary", technical, "a case on a published event — built live by API");
}
