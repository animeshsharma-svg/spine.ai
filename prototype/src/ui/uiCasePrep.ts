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
  /** true when the plan opens a screen on an API-built event (open_prepared); false for a fresh create screen / list */
  prepared: boolean;
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
  const t = `${c.title} ${c.setup} ${c.steps} ${c.expected}`.toLowerCase();
  const technical = /\btechnical (round|stage|bid|response|evaluation)|\brfp (round|stage)|technical \+ rfq|evaluator|questionnaire|vendor assessment/.test(t);
  const g = c.group;

  // Screens not in the model yet — said plainly, never forced elsewhere.
  if (g === "UI-VBID" || /supplier portal|vendor portal|\bas the vendor\b|the vendor('s)? (sees|view|screen|sheet|side|portal|opens|reads)|vendor side/.test(t))
    return { ok: false, state: "live", screen: "vendor", screenWhat: "the vendor portal", technical, prepared: true, why: "the vendor portal is not in the screen model yet" };
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
  const notBuilt = (what: string): CasePrep => ({ ok: false, state: "live", screen: "summary", screenWhat: WHAT.summary, technical, prepared: true, why: `the case starts from ${what}, which the API setup does not build yet` });
  if (/newer version|superseded|old(er)? version|previous version|amended (event|rfq|rfp)|after an amendment/.test(setup) || /on an old version|old version/.test(c.title.toLowerCase()))
    return notBuilt("an amended event (an older version beside a newer one)");
  if (/masking (is )?on|vendor masking enabled|isvendormaskingenabled/.test(setup)) return notBuilt("a client with vendor masking switched on");
  if (/already[- ]converted|a converted (rfq|auction)|converted auction/.test(setup)) return notBuilt("an RFQ already converted to an auction");
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
