import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat, llmMode } from "../ai/llm.js";
import { recall } from "../rag/knowledgeBase.js";
import { caseById, caseAsProse } from "../checks/testCatalog.js";
import { recordVocabularyGaps } from "./vocabularyGaps.js";
import { qaVendorsOnly } from "../checks/eventVendors.js";
import { prepFor } from "../ui/uiCasePrep.js";

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(here, "..", "..", "..", "procol-ui-tests", "plan-catalog.json");

/**
 * THE COMPILER — turns a test case written in English into a runnable plan.
 *
 * This is the piece that makes a written test case executable. It is a
 * COMPILER, not a code generator: the output is a list of steps drawn from a
 * fixed vocabulary the executor already implements, and a step the executor
 * does not have is rejected before anything runs. A model that can only choose
 * from verbs the machine can actually perform cannot produce a run that
 * silently tests nothing.
 *
 * It plans with the QA memory in hand — the mined rules for the area under
 * test, and what has broken there before — because the ordering constraints on
 * this product are not guessable. A template must precede line items; a
 * technical stage needs its questionnaires and an evaluator; the schedule must
 * be committed before publish. A model told none of that writes a plausible
 * plan that fails on step three.
 */

export interface StepSpec {
  name: string;
  purpose: string;
  args?: Record<string, string>;
  assertion?: boolean;
  /** A screen-neutral generic step (procol-ui-tests/src/plan/generic). */
  generic?: boolean;
}

export interface PlanStep {
  step: string;
  args?: Record<string, unknown>;
  note?: string;
}

export interface TestPlan {
  title: string;
  steps: PlanStep[];
}

export interface CompileResult {
  plan: TestPlan;
  /** Why the compiler shaped the plan this way — shown in the run log. */
  reasoning: string;
  /** The memory it consulted, so a reader can see what informed the plan. */
  context: { expectations: string[]; experience: string[] };
  source: "llm" | "fallback";
  warnings: string[];
  /**
   * How much of the case the plan actually tests.
   *   full     every behaviour the case checks has a step
   *   partial  it runs, but something the case asks for has no step yet
   *   none     the SUBJECT of the case has no step — running the plan would
   *            prove nothing, so it should not run as this case
   */
  coverage: "full" | "partial" | "none";
  /** What the case asked for that the vocabulary cannot express. */
  gaps: string[];
}

interface Catalog {
  steps: StepSpec[];
  names: string[];
  /** Labels the product is known to render, by screen (from its source + live finds). */
  labels?: Record<string, string[]>;
}

function loadCatalog(): Catalog {
  if (!existsSync(CATALOG_PATH)) {
    throw new Error(
      `the step vocabulary is missing at ${CATALOG_PATH} — run ` +
        "`npx tsx scripts/dump-plan-catalog.ts` in procol-ui-tests to publish it",
    );
  }
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function renderSteps(steps: StepSpec[]): string {
  return steps
    .map((s) => {
      const args = s.args
        ? " ARGS: " + Object.entries(s.args).map(([k, v]) => `${k} = ${v}`).join("; ")
        : " (no arguments)";
      return `- ${s.name}${s.assertion ? " [assertion]" : ""}: ${s.purpose}${args}`;
    })
    .join("\n");
}

function catalogForPrompt(steps: StepSpec[]): string {
  const domain = steps.filter((s) => !s.generic);
  const generic = steps.filter((s) => s.generic);
  return generic.length
    ? `DOMAIN STEPS (prefer these — they know the product's flows):\n${renderSteps(domain)}\n\nGENERIC STEPS (read / verify / navigate / act on any screen by what it shows — use when no domain step fits):\n${renderSteps(generic)}`
    : renderSteps(domain);
}

/** Generic steps that only make sense on Procol: tenant switching, skipping a domain step. */
const PROCOL_ONLY_GENERIC = new Set(["switch_company", "skip"]);

/** The vocabulary for a site that is not Procol: the generic steps, with go_to reduced to paths. */
function siteCatalog(full: Catalog): Catalog {
  const steps = full.steps
    .filter((s) => s.generic && !PROCOL_ONLY_GENERIC.has(s.name))
    .map((s) =>
      s.name === "go_to"
        ? { ...s, purpose: "Open a page of the site by its path and wait for it to be ready; or go back in the browser; or continue in the tab that just opened; or open a URL that is only written as text on the screen (a mail preview's confirmation link).", args: { screen: '"path" | "back" | "new_tab" | "url_on_screen"', path: 'for "path": the page\'s path, starting with /', within: 'for "url_on_screen": text near the URL, e.g. "mail body" (optional)' } }
        : s,
    );
  return { steps, names: steps.map((s) => s.name) };
}

/** The known labels, compact, for the prompt. */
function labelsForPrompt(labels: Record<string, string[]> | undefined): string {
  if (!labels || !Object.keys(labels).length) return "";
  return Object.entries(labels)
    .map(([screen, list]) => `- ${screen}: ${list.map((l) => l.replace(/^(button|tab|menuitem):/, "$1 ")).join(" · ")}`)
    .join("\n");
}

const lc = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The screen library (data/screens, built by the screen walk): each screen the browser has
 * photographed, with the steps that reached it. Read from disk, never imported, so the library
 * module can import the compiler without a cycle. Empty until a walk has run.
 */
function screensForPrompt(): string {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "screens");
  if (!existsSync(dir)) return "";
  const lines: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "index.json").slice(0, 60)) {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as { label: string; path: string; state?: string; reachedBy?: Array<{ step: string; args?: Record<string, unknown> }>; controls?: Array<{ kind: string; name: string }> };
      const reach = (r.reachedBy ?? []).map((st) => `${st.step}${st.args && Object.keys(st.args).length ? JSON.stringify(st.args) : ""}`).join(" → ");
      const ctrls = (r.controls ?? []).filter((c) => c.kind === "button" || c.kind === "tab").slice(0, 14).map((c) => c.name).join(" · ");
      lines.push(`- ${r.label} (${r.path}${r.state && r.state !== "none" ? `, on a ${r.state} event` : ""}): reached by ${reach || "(not recorded)"}${ctrls ? `; shows ${ctrls}` : ""}`);
    } catch {
      /* a half-written record */
    }
  }
  return lines.join("\n");
}

/** Is a label known to exist in the product (source or seen live)? */
export function labelIsKnown(word: string, labels: Record<string, string[]> | undefined): boolean {
  // "button Add Bid" / 'tab "Responses"' — the role word is not part of the label.
  const t = lc(word.replace(/^role\s+\w+\s+name\s+/i, "").replace(/^(button|link|tab|menu ?item|checkbox|switch|radio|textbox|combobox|row|heading|dialog|option|tooltip)\s+/i, ""));
  if (t.length < 2 || !labels) return false;
  // Entries may carry a usage hint in brackets — it is not part of the label.
  const all = Object.values(labels).flat().map((l) => lc(l.replace(/\s*\[[^\]]*\]$/, "").replace(/^(button|tab|menuitem):/, "")));
  // The executor matches by substring, so a word INSIDE a real label finds it.
  // A word LONGER than any label finds nothing (and an absence check on it
  // would pass falsely) — unless the extra is only a count ("Items 0").
  return all.some((k) => k === t || (t.length >= 3 && k.includes(t)) || (t.startsWith(k) && /^[\s\d]*$/.test(t.slice(k.length))));
}

/**
 * Ordering rules the product enforces and no model could infer.
 * Every one of these was learned the hard way against the live app.
 */
/**
 * The vendor account the framework can actually sign in as.
 *
 * A vendor-portal bid needs credentials, and only this account has them
 * configured — so a plan that invites "some vendor" and then tries to sign in
 * as them cannot work.
 */

/** A case whose event starts from a purchase request: "from a PR", "PR to event", "convert the requisition". */
const FROM_PR = /\b(from|using|out of|based on|against|convert(?:ing)?)\s+(?:an?\s+|the\s+|approved\s+|existing\s+)*(pr|prs|purchase[- ]?requests?|purchase[- ]?requisitions?|requisitions?|indents?)\b|\b(pr|purchase[- ]?request|requisition)\s*(?:to|→|->)\s*(?:an?\s+)?(event|rfq|rfp|rfx|auction|erfx)\b/i;
/**
 * Picking a PR and making an event of it, in any order of words: "Select a PR with 2 line items, create an
 * RFQ event from it and publish it" (Aanya's case 5, 27 Oct) had neither "from a PR" nor "PR → event".
 */
const PICKS_PR = /\b(select|pick|choose|tick|take|use)\s+(?:an?\s+|the\s+|one\s+|any\s+|existing\s+|approved\s+|open\s+)*(pr|prs|purchase[- ]?requests?|purchase[- ]?requisitions?|requisitions?|indents?)\b|\b(pr|purchase[- ]?requisition|requisition|indent)\s+with\s+(\d+|one|two|three|four|five)\s+(line[- ]?)?items?\b/i;
const MAKES_EVENT = /\b(create|make|start|raise|build|publish|convert)\b[^.;]*\b(event|rfq|rfp|rfx|auction|project|technical)\b/i;
/**
 * The case starts its event from a PR: its words say so, or the plan both starts at Purchase Requisitions
 * and makes an event (a check of the PR list alone — "tick a PR, Purchase Items turns on" — is not one).
 */
function startsFromPr(testCase: string, steps: PlanStep[] = []): boolean {
  const prStart = steps.some((st) => ["open_purchase_requisitions", "select_pr", "purchase_items", "choose_stages"].includes(st.step));
  const makes = steps.some((st) => ["choose_stages", "publish", "save_draft", "set_schedule", "invite_vendor"].includes(st.step));
  return FROM_PR.test(testCase) || (PICKS_PR.test(testCase) && MAKES_EVENT.test(testCase)) || (prStart && makes);
}
/** What the run does on screen first for such a case (runPlan do_on_screen). */
/** A case that scores a vendor's technical response: evaluation, an evaluator, a technical score. */
const EVALUATES = /\b(evaluat(?:e|es|ed|ing|ion)|technical (score|scoring|response score))\b|\bscore (the |a |each )?(vendor'?s? )?(technical|tech) (response|answer|bid)/i;
/** A case that scores a response — not a publish case that only names the evaluator setup ("publishing without an evaluator is refused"). */
function evaluates(testCase: string): boolean {
  if (!EVALUATES.test(testCase)) return false;
  return !(/\bpublish/i.test(testCase) && /\b(refused|blocked|rejected|prevented|disabled|without|missing|no)\b/i.test(testCase));
}
/** What the run does on screen for the scoring itself (runPlan do_on_screen); this account is the client's evaluator. */
const EVALUATE_GOAL = "as the evaluator (this account), open the technical stage's evaluation, score the vendor's technical response and submit the evaluation; stop when the screen shows the evaluation saved or submitted";

const DOMAIN_RULES = `
First decide WHICH SCREEN the test is about:
- Is it about an EXISTING event (open it, inspect its participants / bids / status, act on it)? Then start with open_event{title|id} and STOP adding create steps — no open_create, no set_title. open_event lands on the event's project page.
- Is the SUBJECT of the test the events LIST itself — its rows, filters, tabs, sorting, search, or merely that the Create Event control is reachable? Then use open_events_list + expect_events_list and STOP. Do not add open_create, set_title or anything else: those act on a different screen, and a plan that opens the create screen to test the list passes while proving nothing.
  EXCEPT when the case also says an event the test itself publishes ("a just-published event", "a newly created event") must show up in the list: the list can only be checked for this plan's own event. Then build and publish that event first (the create steps below, through publish and expect_published), then open_events_list, filter_events as the case asks, and expect_event_in_list with NO title — it looks for this plan's own event.
- Does the event START FROM A PURCHASE REQUEST (a PR, requisition or indent: "from a PR", "from the existing PR", "convert the PR")? Then it starts open_purchase_requisitions, pr_tab{tab:"Open"}, select_pr, purchase_items, choose_stages (stages ONLY if the case names the event: "technical event" → ["rfp"], "technical + RFQ" → ["rfp","rfq"]; with none the run asks the tester), expect_pr_items, then each named stage's steps (switch_stage when more than one, select_template, fill_questionnaires + assign_evaluator for Technical, fill_sheet for RFQ / Auction). "A PR with 2 line items" → select_pr{items:2}. Never open_create, compose_stages, add_line_items or expect_line_items for it: it is made from the PR and keeps its items (one PR line can become several items on the create screen). Carry on with set_title, set_schedule, invite_vendor, publish and what the case asks after.
- Does the case EVALUATE (an evaluation, an evaluator, a technical score)? Evaluation happens on a TECHNICAL stage, after its window closes, on a vendor's technical answer. With no event named and none created by the plan: open_event{purpose:"evaluation"} (the run picks an event whose technical stage has closed with a vendor's answer waiting), then go_to{screen:"stage", stage:"rfp"}, then do_on_screen{goal:"${EVALUATE_GOAL}"} (this account is the client's evaluator). NEVER close_event an event the plan did not create. When the plan creates its own event for an evaluation, it must compose a technical stage (rfp) and assign_evaluator.
- Otherwise use open_create and the ordering rules below. open_events_list is NOT a fallback for a test you cannot express: it is only for tests whose subject is the list. If the test is about something this vocabulary cannot do — a conversion popover, a query string, a new browser tab — build the closest plan you CAN out of the create-screen steps rather than substituting the list.

Combinations (the permutation map — pick the path that can actually reach what the case asks for):
- Auction STRATEGY (rank / price / traffic light) is chosen in the SINGLE-STAGE configuration drawer: open_create path "single-stage" then configure_single_stage{eventType:"auction", auctionSubtype, awarding}. There is no step that sets the strategy on an eRFX auction stage yet — say so in cannotExpress rather than substituting.
- Knockout and Dutch auctions exist ONLY through RFQ → Auction conversion: create and publish an RFQ (eRFX, compose_stages ["rfq"]), expect_published, then convert_to_auction. Never compose_stages ["rfq","auction"] — the screen forbids it.
- Awarding RULE (entire lot to one vendor vs line-item-wise across vendors) is set with configure_single_stage{awarding} on single-stage; on eRFX it is per stage and has no step yet.
- Bidding side: place_bid = the vendor from the supplier portal; place_surrogate_bid = the buyer on the vendor's behalf. Two competing vendors = two bid steps naming different vendors. Surrogate bids are not possible on knockout/dutch auctions or technical stages.
- Bidding RULES the product enforces (captured live, 21 Oct 2026): (1) a vendor bids ONCE — after a bid is in, that vendor's "Add Bid" control is gone, so a second bid must name a DIFFERENT vendor; (2) bids for N vendors need N vendors on the event: invite_vendor{count: N} (or names) before publish; (3) no bid after the bidding window has ended — the app answers "Order not active" — except a surrogate bid on a tenant whose config "is_allowed_to_add_surrogate_bid_post_expiry" is on (a case about that must say which tenant); (4) a counter offer needs the VENDOR's own bid — the Counter Offer button is disabled on a surrogate bid; (5) comparing, Master QCS and awarding need an event WITH BIDS: never search the list for "some" event — start from the prepared state ("bid") the API builds, or create → publish → bid in the same plan.
- Counter offer (buyer negotiates a vendor's bid): only after a vendor has bid — publish, place_bid (or place_surrogate_bid), open_master_qcs, then place_counter_offer{vendor, price}, then expect_counter_offer_sent. The vendor's ACCEPTANCE: accept_counter_offer{vendor} (vendor side, supplier portal) then expect_counter_offer_accepted (buyer grid).
- A technical (RFP) stage never carries an auction strategy or a pricing sheet; RFQ and Auction never coexist on one eRFX screen.
- READING MASTER QCS cell by cell (after open_master_qcs, or open_prepared master_qcs): expect_qcs_vendors (how many vendor columns, which, real names not placeholders), expect_qcs_cell{row, vendor, product, number|equals|key} (one figure: Qty Offer, Rank, the rate, the amount, Sum Total; key compares with the API's bidPrice / bidTotal / quantity), expect_qcs_amounts (amount = rate × quantity on every line, Sum Total = the sum), expect_qcs_ranks (lowest amount is Rank 1 on a buy event). These ARE the steps for "Rank 1", "Amount = price × quantity", "figures equal the bid the API holds", "correct per-line and total amounts" — never list those as inexpressible.
- A PUBLISHED event's Participants list: search_participants{vendor}, expect_participant{vendor, present, selected, addBid} (the vendor's own row), expect_participant_count{count|atLeast} (the round's vendors, every page), select_participant{vendor} (adds a vendor from the product's own list to the round; name a vendor only if the case does). invite_vendor is the CREATE screen's step; on a published event use these.
- BOQ events: open_create path "boq"; line items are BOQ rows; still template-first.

Ordering the product enforces (violating any of these makes the run fail):
- open_create must come first on a CREATE test. Use path "erfx" unless the test explicitly says single-stage or non-eRFX: the eRFX screen is the one with stage tabs.
- compose_stages, switch_stage and expect_stages EXIST ONLY on the eRFX screen. The single-stage screen has no stage tabs — its event type is chosen in a configuration drawer — so never combine path "single-stage" with those steps.
- set_title is MANDATORY on every create test. Publishing without a title is refused, and the title is how a human finds the event afterwards. Include it even when the test case does not mention naming the event — UNLESS the case is about publishing without one (see negative tests below).

NEGATIVE TESTS — when the case says the app SHOULD REFUSE something:
- End the plan with expect_publish_blocked instead of publish + expect_published.
- LEAVE OUT the step the case is about. "Publish without a title" means NO set_title; "without a template" means NO select_template; "with no line items" means NO add_line_items; "without a schedule" means NO set_schedule; "with no participants" means NO invite_vendor. The omission IS the test — putting the step back turns the case into an ordinary create and proves nothing.
- Every rule above about what a publish needs describes a plan meant to SUCCEED. A refusal test is deliberately incomplete in exactly one way, and complete in every other.
- These are different from a test about an INVALID VALUE typed into a field that IS present — a negative quantity, a malformed price, text where a number is expected. This product validates several fields INLINE, the moment the bad value is entered, not at publish time. For these: enter the value (e.g. add_line_items{quantity:"-5"}), follow it IMMEDIATELY with expect_error naming the field in its "contains" arg, and STOP THE PLAN THERE — no set_schedule, no invite_vendor, no publish, no expect_publish_blocked. The rejection already happened; chasing it to publish only risks the plan failing on something unrelated (an uninvited vendor, an unset schedule) before ever checking what the case actually asked about. Only continue past the inline error if the case explicitly says to try publishing anyway.
- The default stage is AUCTION. So: a test about an RFQ, a technical/RFP stage, or any two-stage event MUST call compose_stages. Only a plain auction test may omit it.
- compose_stages before anything stage-specific. The screen starts with ONE Auction stage; asking for RFQ or a technical stage is a real change. RFQ and Auction cannot coexist. At most two stages.
- select_template BEFORE add_line_items on an ordinary create: the template decides the price sheet. (Items itself opens without a template — UI-TPL-002 — so a "no template" case can still add products.)
- fill_sheet after add_line_items.
- On a technical (rfp) stage: fill_questionnaires AND assign_evaluator, or publish is refused.
- set_schedule before publish: the schedule looks set but is not committed until saved.
- invite_vendor before publish: an event with no participants is not a usable event.
- On a MULTI-STAGE event, every stage needs its own configuration on its own tab: switch_stage, then select_template, then fill_sheet (rfq/auction) or fill_questionnaires + assign_evaluator (rfp). A template applies only to the tab that is showing.
- Line items are project-level: add them once, on the first stage.
- NEVER invent a vendor name. Use a name only if the test case itself names one. When it just says "a vendor" or "two vendors", set count on invite_vendor and leave vendors out, and leave vendor out of the bid steps — the product's own audience supplies them.
- Several vendors bidding from the portal needs no names: invite_vendor{count:N}, then one place_bid per vendor. Each place_bid without a vendor signs in as a DIFFERENT vendor on the event (vendor 1, vendor 2 … may also be given as numbers). Follow each with expect_bid_submitted. This is fully testable — never list it as something the catalog cannot do.
- Bidding needs a PUBLISHED event: publish first, then bid.
- Two different things are called "bidding" and the test case tells you which:
  * the VENDOR bidding for themselves -> place_bid. It signs into the vendor portal as a vendor on the event that has a login (the run picks one); name a vendor only when the test case names one.
  * the BUYER bidding on a vendor's behalf (surrogate) -> place_surrogate_bid. It never leaves the console. Unavailable for knockout and dutch auctions and for technical stages.
- "on behalf of", "surrogate", "for the vendor" mean place_surrogate_bid. "as the vendor", "from the vendor portal", "from the supplier hub", "the vendor submits", "the vendor logs in" mean place_bid. If the test mentions bidding AT ALL, one of these two steps must be in the plan.
- Follow either with expect_bid_submitted when the test asserts the bid landed.
- Awarding comes AFTER bidding and needs at least one bid: award_event, then expect_awarded. There is nothing to award on an event nobody has bid on.
- Assertions go immediately after the step they check.
`.trim();

/**
 * How to use the generic steps. Written for the model; every rule is also
 * enforced deterministically in lintPlan or the coverage check below, because
 * "mostly follows the prompt" is not a property a test runner can have.
 */
const GENERIC_RULES = `
GENERIC STEPS — reading, verifying, navigating and acting on any screen:
- PREFER A DOMAIN STEP whenever one exists for the thing (open_create, open_event, open_events_list, select_template, add_line_items, publish, expect_publish_blocked, expect_disabled, expect_event_status, open_participants, open_master_qcs …). Generic steps are for what no domain step can say: a tooltip, a count, a field's value, a message, a tab with no step, whether a control is present or absent, a click on a control with no step.
- Name elements EXACTLY as the screen does. Use a label from KNOWN LABELS when one fits. A label you invent is a GUESS: if you must use one, list it in cannotExpress as "unconfirmed label: <label>" and set coverage "partial".
- Controls: role + name (button / tab / menuitem / switch / checkbox / radio). Fields: label (or placeholder). Messages and plain words: text.
- ABSENCE ("X does not render", "zero Add Bid controls", "no price drawer"): expect_visible{visible:false}, expect_text{present:false} or expect_count{count:0} — only with a KNOWN label, and only after navigating to the screen where X would appear (the step waits for that screen to be ready before it believes an absence).
- NEGATIVE TESTS (the case says the app must REFUSE / BLOCK / NOT ALLOW something): leave the enabling step out and mark it skip{step, reason}; then assert the block — expect_publish_blocked{because} for a refused publish, attempt{step, args, because} for any other refused action (attempt passes only on visible evidence: a message, a disabled control, or with expect:"nothing_opens" no drawer/dialog opening). Several refusals in one case = several skip → block pairs in order; put the left-out step back after its block before testing the next. NEVER use skip in a case that expects success.
- A message the case quotes ("Please add participants to proceed!") belongs in expect_message{kind, text} or in the block step's because.
- Tooltip: expect_message{kind:"tooltip", on:"<control>", text}. Before/after comparisons: remember{key, target} … expect_remembered{key, same}.
- Procol is never changed: no step changes a company or tenant SETTING. switch_company only to a QA tenant the case names by id (198678, 32461, 47053). A case that needs a setting flipped, an API payload, a status code or a network request inspected cannot be tested on screen — list it in cannotExpress.
`.trim();

const SYSTEM = `You compile QA test cases into runnable plans for Procol, a B2B procurement product.

Reply with ONLY a JSON object, no prose and no code fence:
{"title":"<short name for this test>","reasoning":"<2 sentences: what you are testing and why the plan is shaped this way>","coverage":"full|partial|none","cannotExpress":["<each thing the case asks for that no catalog step can do — empty when coverage is full>"],"steps":[{"step":"<name from the catalog>","args":{...},"note":"<why this step>"}]}

Rules:
- Use ONLY step names from the catalog. Never invent one.
- BE HONEST ABOUT COVERAGE. First name the SUBJECT of the case: the specific behaviour whose outcome it checks (a menu's options, a validation message, a column's default, a vendor's view). If no step can observe that subject, coverage is "none" — list what is missing in cannotExpress and still return the closest steps, but do NOT pretend a nearby step tests it. If the subject is covered but some detail is not, coverage is "partial". A plan that runs and passes without observing the subject is the worst possible output; a plain "none" is a good one.
- Include the assertions the test case implies. A test that acts but never checks proves nothing.
- Omit args you have no value for rather than inventing one; the executor has sensible defaults.
- Prefer the shortest plan that genuinely tests what was asked.`;

/**
 * How to plan for a site that is not Procol. The generic steps carry over;
 * everything that knows the product does not.
 */
const SITE_RULES = `
THE SITE UNDER TEST — not Procol. Only the steps above exist; none knows this site's flows.
- Open a page with go_to{screen:"path", path:"<the path after the host, e.g. /sandbox/r-01/ or /gopro/index.html#s1>"}. Never put a host in the path. "Navigate back" is go_to{screen:"back"}; "in the new tab" is switch_tab first.
- Controls: role + name (button / link / tab / menuitem / checkbox / radio / combobox). Fields: label or placeholder. Plain words: text. Use "within" whenever the case says where: "in the row X" / "in its row" → within:"X"; "under / in the section / group X" → within:"X"; "in the top menu / navigation" → within:"menu"; "in the frame" → within:"frame"; "in the main area" → within:"main".
- A case step that names a control is one plan step: Click → click, Hover → hover, Fill/Enter/Type → fill, Choose/Select → select, Check/Tick → toggle{on:true}, Upload → upload, Set the slider → fill, Drag → drag, Scroll until → scroll_to, Accept/Dismiss the next confirmation → dialog, "Verify … is visible" → expect_text with that exact text, "Verify the downloaded file …" → expect_download. Keep the case's order. Do not add checks the case does not ask for (a hover is just a hover).
- "Choose X (with Y selected)" means select Y first, then X. "Click X on / in / of Y" means click X within Y.
- Dates: a field that opens a calendar (check-in, departure, date of birth) is pick_date{label, date:"12 December 2026"} — one step per date; it opens the field, turns the months and presses the day. A plain date/time input is fill with YYYY-MM-DD / HH:MM. Hour/minute spinners are fill{label:"hour", value:"2"}; AM/PM are buttons (click).
- Something in a long list, a table that loads as you scroll, or a paged table ("find INV-2037 in the table", "scroll until Order 1587 is visible"): scroll_to{text:"INV-2037"} first (it scrolls and turns pages), then act within it.
- "Expand the row X" / "open the details of X" is click{role:"button", name:"Show details", within:"X"} (or the row's Expand / chevron button); what the row reveals is then read within:"X". "Read its Y and fill Answer with it": remember{key, text:"Y", within:"X"} is only for comparing later — when the answer must be typed, coverage is "partial" unless the value is given.
- "Click / add / open the cheapest (most expensive, longest-lasting, highest-rated) one", "compare the packs' unit prices and add the cheapest": choose_by_number{by, measure, exclude, role, name} — one step that reads the numbers and presses the control (name the control: role:"button", name:"Add to cart", or role:"link"). For a unit price or hours give measure as a regex with one capture group. When the case limits the comparison to some items ("among the Voltpine AA packs"), pass only:"Voltpine Alkaline AA" so near-namesakes (AAA) stay out. This is how a value read off the screen decides the next action; a plan never guesses which block wins.
- "the review with the most people found this helpful", "the flight with the fewest stops", "the highest-rated": also choose_by_number{by:"highest"|"lowest", measure:"(\\d+) people found this helpful", role:"button", name:"Helpful"}. Never guess which item it is from the Verify text — the step reads the numbers.
- "Open the confirmation link in the mail body" (a URL shown as text): go_to{screen:"url_on_screen", within:"<text near it>"}.
- "Set passengers / guests / travellers to 2 adults, 1 child": first click the control that shows the current count (click{role:"button", name:"Passengers"} / "Guests"), then one fill per count (fill{label:"Adults", value:"2"}, fill{label:"Children", value:"1"}) — a stepper with − / + buttons is filled like a field — then close it if the case says so.
- "Keep only X" / "show only X" among filter checkboxes is toggle{label:"X", on:true, only:true} (the others in its group go off).
- "Check X" / "Tick X" in a filter list is toggle{label:"X", on:true}; "Click X" where X is a radio or filter chip is click{text:"X"}. A pop-up the case says to close "if it appears" needs no step: a covered control is uncovered by the executor.
- A multi-step case sentence ("Fill A with 1, choose B in C and fill D with 2") is several plan steps.
- "Find the row X and read its Y, then fill Answer with it": use remember{key, within:"X", text:<column text>} only if the value is on screen; otherwise coverage "none".
- The LAST step must be an assertion (expect_text, expect_download, expect_dialog, expect_value, expect_visible, expect_count). If the case's final check cannot be expressed, coverage is "none" — never hand back a plan that only acts. A case step that comes AFTER the final Verify and cannot be expressed or is ambiguous is left out with coverage "partial" (named in cannotExpress): the Verify is still the test.
- REFUSE rather than invent. If finishing the goal needs data the case does not give (a name, an email, a password, a card number, a code), a date or option the page does not offer, or the target is ambiguous or a bot wall, set coverage "none", list why in cannotExpress, and return no steps. A plan that reports success it did not reach is the worst possible output.
`.trim();

const SITE_SYSTEM = `You compile QA test cases into runnable plans for a web site.

Reply with ONLY a JSON object, no prose and no code fence:
{"title":"<short name for this test>","reasoning":"<2 sentences: what you are testing and why the plan is shaped this way>","coverage":"full|partial|none","cannotExpress":["<each thing the case asks for that no catalog step can do — empty when coverage is full>"],"steps":[{"step":"<name from the catalog>","args":{...},"note":"<why this step>"}]}

Rules:
- Use ONLY step names from the catalog. Never invent one.
- BE HONEST ABOUT COVERAGE. If no step can observe what the case checks (a downloaded file's contents, a new tab, a drag), coverage is "none" or "partial" and cannotExpress says what is missing. Do not pretend a nearby step tests it.
- Include the assertions the test case implies. A test that acts but never checks proves nothing.
- Prefer the shortest plan that genuinely tests what was asked.`;

/** No LLM key: a sane default plan for the commonest case. */
function fallbackPlan(testCase: string): TestPlan {
  const items = Number(testCase.match(/(\d+)\s*(?:line\s*items?|products?|items?)/i)?.[1] ?? 1);
  const technical = /technical|rfp/i.test(testCase);
  const steps: PlanStep[] = [
    { step: "open_create", args: { path: "erfx" } },
    { step: "compose_stages", args: { stages: [technical ? "rfp" : "rfq"] } },
    { step: "set_title" },
    { step: "select_template" },
    { step: "add_line_items", args: { count: items } },
    { step: "expect_line_items", args: { count: items } },
  ];
  if (technical) steps.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
  else steps.push({ step: "fill_sheet" });
  steps.push({ step: "set_schedule" }, { step: "invite_vendor" }, { step: "publish" }, { step: "expect_published" });
  return { title: testCase.slice(0, 60), steps };
}

/**
 * Repair a plan against the invariants the product enforces.
 *
 * The model is told the ordering rules and mostly follows them, but "mostly"
 * is not a property you want in a test runner: a plan missing `set_title` or
 * `fill_sheet` fails at publish, and the failure looks like a product defect
 * rather than a plan that was never going to work. So the invariants are
 * checked deterministically and the missing steps inserted, with a warning
 * naming each repair — silent correction would hide a compiler that needs
 * improving.
 */
export function lintPlan(plan: TestPlan, testCase = ""): { plan: TestPlan; repairs: string[] } {
  const steps = [...plan.steps];
  const repairs: string[] = [];
  const has = (name: string) => steps.some((s) => s.step === name);
  const indexOf = (name: string) => steps.findIndex((s) => s.step === name);
  const insertBefore = (name: string, step: PlanStep, why: string) => {
    const at = indexOf(name);
    steps.splice(at < 0 ? steps.length : at, 0, step);
    repairs.push(why);
  };

  // "invite 2 vendors" is two (27 Oct, VB04: the model invited 3 on a two-stage case, twice, and then counted 2):
  // the invite's count is the number the case gives, when it gives one and names none.
  const WORDS: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5 };
  const said = testCase.match(/\binvit(?:e|es|ing)\s+(\d+|one|a|an|two|three|four|five)\s+vendors?\b/i);
  if (said) {
    const n = /^\d+$/.test(said[1]) ? Number(said[1]) : WORDS[said[1].toLowerCase()];
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.step !== "invite_vendor" || (Array.isArray(st.args?.vendors) && (st.args?.vendors as unknown[]).length)) continue;
      if (st.args?.count !== undefined && Number(st.args.count) !== n) {
        repairs.push(`invite_vendor count ${st.args.count} → ${n} — the case says “${said[0]}”`);
        steps[i] = { ...st, args: { ...(st.args ?? {}), count: n } };
      }
    }
  }

  // "…publish it and wait for it to close" (D54, 23 Oct) came back as ask_tester{"wait for the
  // RFQ's three-minute bidding window to expire…"} where close_event belongs: close_event IS the
  // wait (natural: never the force-end), and the explorer the question was handed to took the
  // waiting for going round in circles, so the case never finished.
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const need = String(st.args?.need ?? st.args?.question ?? "");
    if (st.step === "ask_tester" && /\bwait\b[^.]{0,80}\b(window|bidding|event|rfq|auction|round|stage|it)\b[^.]{0,60}\b(close|expire|end|lapse|finish)/i.test(need)) {
      steps[i] = { step: "close_event", args: { natural: true }, note: st.note };
      repairs.push("ask_tester → close_event{natural} — waiting for the bidding window to close is close_event's job, not a question for the tester");
    }
  }

  // reschedule_event judges the Reschedule dialog's own answer (its field message, the save
  // call) and then CLOSES the dialog. A check of a dialog field after it can only fail ("no
  // field 'Make Order Live At' on screen" — UI-EVDTME-002), so it is folded into the step's
  // `message` and dropped. A "no save request" check must name the dialog's real save
  // (PATCH …/template_input); the compiler guessed `edit_trade_schedules`, which can never fail.
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].step !== "reschedule_event") continue;
    const rs = steps[i];
    for (let k = i + 1; k < steps.length && steps[k].step !== "reschedule_event"; ) {
      const st = steps[k];
      const a: any = st.args ?? {};
      const label = String(a.field ?? a.label ?? a.target?.name ?? a.target?.label ?? "");
      const said = String(a.message ?? a.text ?? "");
      const dialogField = /make order live at|delivery date|pickup date/i.test(label);
      const sameWords = !!said && !!rs.args?.message && said.toLowerCase().includes(String(rs.args.message).toLowerCase().replace(/!$/, ""));
      if (["expect_field_error", "expect_message", "expect_error"].includes(st.step) && (dialogField || sameWords)) {
        if (said && !rs.args?.message) rs.args = { ...(rs.args ?? {}), message: said };
        steps.splice(k, 1);
        repairs.push(`dropped ${st.step}${label ? ` on "${label}"` : ""} after reschedule_event — the step judges the dialog's message itself and closes the dialog`);
        continue;
      }
      if (st.step === "expect_request" && a.absent && !/template_input/.test(String(a.path ?? ""))) {
        st.args = { ...a, path: "/template_input", method: "PATCH" };
        repairs.push("expect_request now names the Reschedule dialog's real save (PATCH …/template_input)");
      }
      k++;
    }
  }

  // A new version is an edit of a PUBLISHED event that has no award yet (event_group.rb:1091:
  // no proposal selected/requested/active), and the copy must be published again before anyone
  // can bid on it. So: the version block (create_new_version … its edits) goes after the first
  // publish and before any bid/close/award; and it ends with set_schedule + publish +
  // expect_published when the plan did not say so (the old window may have run out).
  const AFTER_PUBLISH = new Set(["place_bid", "place_surrogate_bid", "close_event", "open_master_qcs", "award_event", "start_awarding", "allocate_award", "create_po", "expect_po_items"]);
  const nv = indexOf("create_new_version");
  if (nv >= 0) {
    let end = nv + 1;
    while (end < steps.length && !["publish", "expect_published"].includes(steps[end].step) && !AFTER_PUBLISH.has(steps[end].step)) end++;
    const firstLater = steps.findIndex((s, i) => i < nv && ["award_event", "start_awarding", "allocate_award", "create_po"].includes(s.step));
    if (firstLater >= 0) {
      const block = steps.splice(nv, end - nv);
      const pub = steps.findIndex((s) => s.step === "expect_published");
      const at = pub >= 0 && pub < firstLater ? pub + 1 : firstLater;
      steps.splice(at, 0, ...block);
      repairs.push("moved create_new_version before the award — the app offers a new version only while no award proposal exists");
    }
    const v = indexOf("create_new_version");
    let e = v + 1;
    while (e < steps.length && !["publish", "expect_published"].includes(steps[e].step) && !AFTER_PUBLISH.has(steps[e].step)) e++;
    if (steps[e]?.step !== "publish") {
      const block = steps.slice(v + 1, e);
      const add: PlanStep[] = [];
      if (!block.some((s) => s.step === "set_schedule")) add.push({ step: "set_schedule", args: { minutes: 3 } } as PlanStep);
      add.push({ step: "publish" } as PlanStep, { step: "expect_published" } as PlanStep);
      steps.splice(e, 0, ...add);
      repairs.push("the new version is published again before bidding (set_schedule + publish + expect_published) — bids on the old version are read-only");
    }
    if (steps.slice(0, v).some((s) => s.step === "place_bid" || s.step === "place_surrogate_bid")) {
      repairs.push("note: bids placed before create_new_version stay on the archived version (read-only) — they cannot be awarded");
    }
  }

  // THE EVENT'S LIFECYCLE, for every combination a case can ask for. Each lifecycle step says
  // which state it needs and which it leaves; walking the plan, a step whose state is not
  // reached gets the shortest bridge inserted in front of it (publish before bidding, a bid
  // before awarding, close before award, award before PO …). A negative case (it asserts a
  // refusal) is left as written — its point may be exactly the missing state.
  if (!steps.some((s) => ["expect_publish_blocked", "expect_error", "expect_message", "attempt", "skip", "expect_disabled"].includes(s.step))) {
    const bridged = bridgeLifecycle(steps, (plan as { context?: { state?: string } }).context?.state);
    steps.splice(0, steps.length, ...bridged.steps);
    repairs.push(...bridged.repairs);
  }

  // "On an awarded event, create a purchase order…" (C05, 23 Oct) compiled to open_event with no
  // id or title, so the run looked through the Live list for an event open for quotes — an
  // awarded event or one with an award proposal is never there, and it stopped to ask. A case
  // that starts from those states opens one built for it instead: open_prepared, which
  // /api/plan-run builds from the case's own words (uiCasePrep.prepFor). Bid / closed cases keep
  // open_event — the run's pick finds those among existing events.
  if (!has("open_prepared") && has("open_event") && !has("open_create") && !has("set_title") && !has("publish")) {
    const at = indexOf("open_event");
    const oe = steps[at];
    if (!oe.args?.id && !oe.args?.title) {
      const p = prepFor({ id: "typed", group: "", title: testCase, setup: testCase, steps: "", expected: "" });
      if (p.ok && p.prepared && (p.state === "awarded" || p.state === "proposal")) {
        steps[at] = { step: "open_prepared", args: { screen: p.screen }, note: `the API builds the ${p.state} event this case starts from` };
        repairs.push(`open_event → open_prepared(${p.screen}) — the case starts from ${p.state === "awarded" ? "an awarded event" : "an award proposal"}, which the run's pick never finds among live events; the API builds it`);
      }
    }
  }

  // A PREPARED-STATE plan (docs/ui-automation-design.md §2): the event was built
  // through the API and open_prepared opens the screen the case is about. No
  // create screen, no title, no search — only the steps the case is about.
  if (has("open_prepared")) {
    for (const drop of ["open_create", "set_title", "open_events_list", "open_event", "expect_published", "publish"]) {
      while (has(drop) && !(drop === "publish" && /\bpublish/i.test(testCase))) {
        steps.splice(indexOf(drop), 1);
        repairs.push(`dropped ${drop} — the API built this case's event; open_prepared opens its screen`);
      }
    }
    if (indexOf("open_prepared") !== 0) {
      const [open] = steps.splice(indexOf("open_prepared"), 1);
      steps.unshift(open);
      repairs.push("moved open_prepared to the front — every later step acts on that screen");
    }
    return { plan: { ...plan, steps }, repairs };
  }

  // ── generic steps ─────────────────────────────────────────────────────────
  //
  // 1. A generic step that names a screen or action a DOMAIN step owns is
  //    rewritten to the domain step: the domain step carries the waits and
  //    proofs that screen needs, and the screen decision below keys on it.
  const GO_TO_DOMAIN: Record<string, (a: Record<string, unknown>) => PlanStep> = {
    events_list: () => ({ step: "open_events_list" }),
    list: () => ({ step: "open_events_list" }),
    event: (a) => ({ step: "open_event", args: Object.fromEntries(Object.entries(a).filter(([k]) => k === "title" || k === "id")) }),
    master_qcs: () => ({ step: "open_master_qcs" }),
    qcs: () => ({ step: "open_master_qcs" }),
    participants: () => ({ step: "open_participants" }),
  };
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.step === "go_to") {
      const screen = String(st.args?.screen ?? "").toLowerCase().replace(/[\s-]+/g, "_");
      const to = GO_TO_DOMAIN[screen];
      if (to) {
        steps[i] = { ...to(st.args ?? {}), note: st.note };
        repairs.push(`go_to ${screen} → ${steps[i].step} — a domain step owns that screen`);
      }
    }
    if (st.step === "attempt" && String(st.args?.step ?? "") === "publish") {
      const inner = (st.args?.args ?? {}) as Record<string, unknown>;
      const because = st.args?.because ?? inner.because;
      steps[i] = { step: "expect_publish_blocked", args: because ? { because } : {}, note: st.note };
      repairs.push("attempt{publish} → expect_publish_blocked — the domain step judges a refused publish (and what an allowed one means)");
    }
  }
  // 2. attempt / skip must name a step that exists (and not each other).
  let knownNames: string[] = [];
  try {
    knownNames = loadCatalog().names;
  } catch {
    /* no catalog: leave nested names unchecked */
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const st = steps[i];
    if (st.step !== "attempt" && st.step !== "skip") continue;
    const inner = String(st.args?.step ?? "");
    if (!inner || inner === "attempt" || inner === "skip" || (knownNames.length && !knownNames.includes(inner))) {
      steps.splice(i, 1);
      repairs.push(`dropped ${st.step}{${inner || "?"}} — it must name a real step to ${st.step === "skip" ? "leave out" : "try"}`);
    }
  }
  // 3. skip is for NEGATIVE cases only. A skip in a case that expects
  //    success would let the compiler quietly drop a step it found hard.
  const NEGATIVE_CASE = /\b(without|no|not|never|blank|empty|missing|skip(ped)?|omit(ted)?|refus\w*|reject\w*|block\w*|prevent\w*|cannot|can't|disallow\w*|disabled|inert|enforc\w*|required|mandatory|error|attempt\w*|try(ing)?|until)\b/i;
  const skipped = new Set<string>();
  for (let i = steps.length - 1; i >= 0; i--) {
    const st = steps[i];
    if (st.step !== "skip") continue;
    const inner = String(st.args?.step ?? "");
    if (!NEGATIVE_CASE.test(testCase)) {
      steps.splice(i, 1);
      repairs.push(`dropped skip{${inner}} — the case does not expect a refusal, so nothing may be left out`);
      continue;
    }
    skipped.add(inner);
  }
  // 4. Each skip must be followed by an assertion of the block, and the
  //    skipped step must really be absent until then.
  const BLOCK_ASSERTS = ["expect_publish_blocked", "attempt", "expect_error", "expect_message", "expect_disabled"];
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].step !== "skip") continue;
    const inner = String(steps[i].args?.step ?? "");
    let j = steps.findIndex((st, k) => k > i && BLOCK_ASSERTS.includes(st.step));
    if (j < 0) {
      steps.push({ step: "expect_publish_blocked", note: `skip{${inner}} needs the block asserted` });
      j = steps.length - 1;
      repairs.push(`added expect_publish_blocked — skip{${inner}} leaves a mandatory step out, so the plan must assert the app blocks it`);
    }
    for (let k = j - 1; k > i; k--) {
      if (steps[k].step === inner) {
        steps.splice(k, 1);
        j--;
        repairs.push(`removed ${inner} between its skip and the block assertion — it is deliberately left out there`);
      }
    }
  }
  /** Present, or deliberately left out by a skip — either way, not to be repaired in. */
  const accounted = (name: string) => has(name) || skipped.has(name);

  // ── which screen is this test about? ──────────────────────────────────────
  //
  // Every repair below assumes the create screen. That assumption was wrong
  // for a whole class of case: UI-ENV-001 is about reaching the events LIST,
  // and the create-screen repairs turned it into a plan that opened the create
  // screen, set a title, asserted no error — and passed, having never looked
  // at the list. A silently-wrong pass is the most expensive kind, so the
  // list-only plans are settled here and returned before any of it runs.
  const CREATE_SCREEN_STEPS = [
    "open_create", "compose_stages", "set_title", "switch_stage", "select_template",
    "add_line_items", "fill_sheet", "fill_questionnaires", "assign_evaluator", "set_schedule",
    "invite_vendor", "publish", "save_draft", "expect_published", "expect_line_items",
    "expect_stages", "expect_publish_blocked",
  ];
  // Steps that live on the events LIST. A plan made only of these (plus
  // generic assertions) is a list test, whether or not the model remembered to
  // open the list first.
  // Decided ONCE, before anything is inserted: a list test that later gains an
  // open_create (for a URL check) must not turn into a create test, or the
  // create repairs move that open to the front and bolt a title onto it.
  const LIST_STEPS = ["open_events_list", "expect_events_list", "expect_create_options", "filter_events", "expect_event_in_list", "expect_event_status"];

  // "A JUST-PUBLISHED EVENT SHOWS UP IN THE LIST": the plan publishes it.
  // The list can only be checked for this plan's own event (expect_event_in_list
  // looks for the title this plan gave it). tc041 ("filters by status and a
  // just-published event shows up in the results") compiled to a list-only
  // plan that filtered and never looked for any event (eval report, 15 Oct).
  // Decided before the screen is: with the create steps in, it is a create
  // test that ends on the list, as tc042's plan already was.
  const OWN_EVENT_IN_LIST =
    /\b(?:just|newly|freshly|recently)[- ](?:published|created|made)\s+(?:event|rfq|rfp|auction|project)\b[^.]*\b(?:shows? up|appears?|is listed|is in|in the (?:list|results))/i;
  if (OWN_EVENT_IN_LIST.test(testCase) && !has("open_event")) {
    if (!has("publish") && !has("save_draft")) {
      const firstList = steps.findIndex((s) => LIST_STEPS.includes(s.step));
      const build = fallbackPlan(testCase).steps;
      steps.splice(firstList < 0 ? steps.length : firstList, 0, ...build);
      repairs.push("added the create steps through publish before the list — the case looks for an event it publishes itself, and the list can only be checked for this plan's own event");
    }
    if (!has("expect_event_in_list")) {
      if (!has("open_events_list")) steps.push({ step: "open_events_list" });
      const names = steps.map((s) => s.step);
      const after = Math.max(names.lastIndexOf("open_events_list"), names.lastIndexOf("filter_events"), names.lastIndexOf("expect_events_list"));
      steps.splice(after + 1, 0, { step: "expect_event_in_list" });
      repairs.push("added expect_event_in_list — the case says the published event shows up in the list, and nothing looked for it");
    }
  }

  // A plan about an EXISTING event starts by opening it — no create screen,
  // no title. The create repairs turned "open the event, open its
  // participants, capture" into open_create → set_title → open_event, which
  // ran against a fresh create screen. Settle these plans here and return.
  // The model, told "open_create must come first", tends to prepend
  // open_create + set_title even to an existing-event plan. Those two (and a
  // stage step) are not evidence of a create test; anything heavier —
  // template, line items, publish — is.
  const HEAVY_CREATE = CREATE_SCREEN_STEPS.filter((x) => !["open_create", "set_title", "compose_stages", "expect_stages"].includes(x));
  if (has("open_event") && !steps.some((s) => HEAVY_CREATE.includes(s.step))) {
    for (const drop of ["open_create", "set_title", "compose_stages", "expect_stages"]) {
      while (has(drop)) {
        steps.splice(indexOf(drop), 1);
        repairs.push(`dropped ${drop} — this plan opens an existing event, it does not create one`);
      }
    }
    if (indexOf("open_event") !== 0) {
      const [open] = steps.splice(indexOf("open_event"), 1);
      steps.unshift(open);
      repairs.push("moved open_event to the front — the steps after it act on that event's page");
    }
    return { plan: { ...plan, steps }, repairs };
  }
  // A plan that starts by NAVIGATING (go_to a path/tab, switch_company) and
  // builds nothing is about an existing screen; the create repairs below
  // would bolt open_create + set_title onto it.
  if (steps.length && ["go_to", "switch_company"].includes(steps[0].step) && !steps.some((s) => HEAVY_CREATE.includes(s.step)) && !has("open_create")) {
    return { plan: { ...plan, steps }, repairs };
  }
  // The "+" (Add Stages) menu is read against the stages ALREADY on the screen, and the case
  // names them ("a project holding one Auction stage"). Two stages is the ceiling — the "+" is
  // then always disabled — so a plan that composes two to read what is OFFERED reads nothing.
  // UI-CRE-004 composed rfp+rfq for "one Auction stage".
  if (has("expect_add_stage_options") && has("compose_stages")) {
    // read the SETUP sentence only ("Setup: …" from caseAsProse): the expected text talks about
    // other stages too ("RFQ and Auction never sit in one project") and must not steer this
    const setupLine = /(?:^|\n)Setup:\s*([^\n]*)/i.exec(testCase)?.[1] ?? testCase;
    const m = /\b(?:holding|with|has|containing)\s+(?:only\s+)?(?:one|a single|an?)\s+(rfq|rfp|technical|auction)\b(?:\s+(?:stage|round))?/i.exec(setupLine);
    // "a Technical stage and an RFQ stage" names TWO — leave those plans alone
    const two = /\b(rfq|rfp|technical|auction)\s+(?:stage|round)?\s*(?:and|plus|\+)\s+(?:one\s+|an?\s+)?(rfq|rfp|technical|auction)\b/i.test(setupLine);
    if (m && !two) {
      const want = m[1].toLowerCase() === "technical" ? "rfp" : m[1].toLowerCase();
      const cs = steps[indexOf("compose_stages")];
      const have = Array.isArray(cs.args?.stages) ? (cs.args!.stages as string[]).map((x) => String(x).toLowerCase()) : [];
      if (have.length !== 1 || have[0] !== want) {
        cs.args = { ...(cs.args ?? {}), stages: [want] };
        repairs.push(`compose_stages set to [${want}] — the case starts from one ${m[1]} stage (was [${have.join(", ")}])`);
      }
    }
  }
  // A plan that creates an event and then goes looking for it (events list →
  // open_event) needs it SAVED first: an unsaved create screen leaves nothing
  // to find. UI-CRE-012 (set_title → open_events_list → open_event) failed
  // with "no event titled …" — the compiler forgot the save, not the product.
  const reopenAt = steps.findIndex((s) => s.step === "open_events_list" || s.step === "open_event");
  if (has("open_create") && reopenAt > indexOf("open_create") && !steps.slice(0, reopenAt).some((s) => s.step === "save_draft" || s.step === "publish")) {
    steps.splice(reopenAt, 0, { step: "save_draft" });
    repairs.push(`added save_draft before ${steps[reopenAt + 1].step} — the event this plan creates must be saved before it can be found again`);
  }
  const isListTest =
    steps.some((s) => LIST_STEPS.includes(s.step)) && !steps.some((s) => CREATE_SCREEN_STEPS.includes(s.step));
  if (isListTest) {
    if (!has("open_events_list")) {
      steps.unshift({ step: "open_events_list" });
      repairs.push("added open_events_list — the menu being checked is on the events list");
    } else if (indexOf("open_events_list") !== 0) {
      const [open] = steps.splice(indexOf("open_events_list"), 1);
      steps.unshift(open);
      repairs.push("moved open_events_list to the front — the steps before it had no list on screen");
    }
    if (!["expect_events_list", "expect_no_error", "expect_create_options", "expect_event_in_list", "expect_event_status", "expect_text", "expect_visible", "expect_count", "expect_value", "expect_message"].some(has)) {
      steps.push({ step: "expect_events_list" });
      repairs.push("added expect_events_list — opening the list without asserting it rendered tests nothing");
    }
    // A URL assertion about the CREATE screen (projectCreation=true,
    // quick-create, singleStage=true) needs that screen opened first. UI-ENV-002
    // compiled to "read the menu, then check the URL" with nothing in between,
    // so the check ran against /orders. Open the path the URL text names,
    // immediately before the check.
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.step !== "expect_url_contains") continue;
      const text = String(st.args?.text ?? "");
      if (!/projectCreation|quick-create|singleStage|boq=true/i.test(text)) continue;
      if (steps.slice(0, i).some((x) => x.step === "open_create")) continue;
      const path = /singleStage/i.test(text) ? "single-stage" : /boq=true/i.test(text) ? "boq" : "erfx";
      steps.splice(i, 0, { step: "open_create", args: { path } });
      repairs.push(`added open_create(${path}) before the URL check — the URL it expects belongs to the create screen`);
      i++;
    }
    return { plan: { ...plan, steps }, repairs };
  }

  // The default stage is Auction, so a plan that never composes stages is
  // testing an auction whatever the test case says. Asking for an RFQ or a
  // technical stage and getting an auction is the quietest possible wrong
  // answer: everything passes, and the thing under test was never on screen.
  // Which stages: the case's SETUP sentence when it names any (the expected text may talk
  // about other stages — UI-CRE-004 "a project holding one Auction stage" expects RFQ to be
  // refused, and reading the whole text composed rfp+rfq). A setup naming only an Auction
  // keeps the screen's default Auction stage.
  const stageSetup = /(?:^|\n)Setup:\s*([^\n]*)/i.exec(testCase)?.[1] ?? "";
  const namesStage = /\brfq\b|technical|\brfp\b|\bauction\b/i.test(stageSetup);
  const stageText = namesStage ? stageSetup : testCase;
  if (!has("compose_stages") && /\brfq\b|technical|\brfp\b/i.test(stageText)) {
    const wanted: string[] = [];
    if (/technical|\brfp\b/i.test(stageText)) wanted.push("rfp");
    if (/\brfq\b/i.test(stageText)) wanted.push("rfq");
    steps.unshift({ step: "compose_stages", args: { stages: wanted } });
    repairs.push(`added compose_stages(${wanted.join(", ")}) — the screen defaults to an Auction stage, so this test would have run against the wrong stage`);
  }

  /**
   * Only a plan that creates an event gets the create screen opened for it.
   * A Decathlon PO-visibility case ("open the PO list, check each row…") came
   * back as open_create erfx + set_title + ask_tester — an event screen for a
   * case about purchase orders (21 Oct, "ask tester — eww").
   */
  /**
   * AN EVENT MADE FROM A PURCHASE REQUEST STARTS ON THE PR (Aanya, 26 Oct: "why does it
   * directly go to event, it should go to pr"). This pass used to put open_create first on
   * every create plan, so "create an event from a PR…" opened a blank event and asked the
   * tester for the PR part afterwards, when it could no longer make the event from the PR.
   * No catalog step opens a PR, so the run works that part out on screen (do_on_screen,
   * tested only when the screen proves it), first; the create screen it lands on already
   * holds the PR's line items, so the template / line-item steps would only replace them.
   */
  const fromPr = startsFromPr(testCase, steps);
  if (fromPr) {
    // create_from_pr does the whole start: Purchase Requisitions → Open → tick a PR → Purchase Items →
    // Start New Project → the stages → create, then each stage's template, questionnaires/evaluator or
    // sheet (Aanya, 26 Oct). The stages are the ones the case names; with none, the run asks which.
    // The stages the case names: the model's choose_stages or compose_stages, else the case's words.
    const named =
      (steps.find((st) => st.step === "choose_stages")?.args?.stages as string[] | undefined) ??
      (steps.find((st) => st.step === "compose_stages")?.args?.stages as string[] | undefined) ??
      [];
    const fromText: string[] = [];
    if (/\btechnical|\brfp\b/i.test(testCase)) fromText.push("rfp");
    if (/\brfq\b/i.test(testCase)) fromText.push("rfq");
    if (/\bauction\b/i.test(testCase)) fromText.push("auction");
    const stages = (named.length ? named : fromText).filter((x) => ["rfp", "rfq", "auction"].includes(x));
    // Everything the PR start and the stage rows below do, wherever the model put it: added once, in order.
    // expect_line_items too: a PR's items are counted by expect_pr_items — one service line on the PR can
    // become two items on the create screen, so a literal count failed a PR → RFQ run (27 Oct, plan-mvpnwryi).
    const handled = ["open_create", "compose_stages", "switch_stage", "select_template", "add_line_items", "remove_line_items", "fill_sheet", "fill_questionnaires", "assign_evaluator", "configure_single_stage",
      "open_purchase_requisitions", "pr_tab", "select_pr", "purchase_items", "choose_stages", "expect_pr_items", "expect_line_items"];
    // "a PR with 2 line items" (Aanya's case 5, 27 Oct): select_pr ticks that many rows of one PR.
    const WORD_N: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const nItems = testCase.match(/\b(\d+|one|two|three|four|five)\s+(?:pr\s+)?(?:line[- ]?items?|items|lines)\b/i)?.[1]?.toLowerCase();
    const items = nItems ? Number(nItems) || WORD_N[nItems] : 0;
    const prArgs = { ...((steps.find((st) => st.step === "select_pr")?.args as Record<string, unknown> | undefined) ?? {}), ...(items > 1 ? { items } : {}) };
    const prPart = (st: PlanStep) => (st.step === "ask_tester" || st.step === "do_on_screen") && /\b(pr|purchase[- ]?req|requisition|indent)/i.test(String(st.args?.need ?? st.args?.goal ?? ""));
    const before = steps.length;
    for (let i = steps.length - 1; i >= 0; i--) if (handled.includes(steps[i].step) || prPart(steps[i])) steps.splice(i, 1);
    // One row per screen action (Aanya, 26 Oct: "break it into steps like u did for events"), then
    // each named stage's own steps; with no stages named, choose_stages asks and adds them at run time.
    const stageRows: PlanStep[] = [];
    for (const stage of stages) {
      if (stages.length > 1) stageRows.push({ step: "switch_stage", args: { stage } });
      stageRows.push({ step: "select_template" });
      if (stage === "rfp") stageRows.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
      else stageRows.push({ step: "fill_sheet" });
    }
    steps.unshift(
      { step: "open_purchase_requisitions" },
      { step: "pr_tab", args: { tab: "Open" } },
      { step: "select_pr", ...(Object.keys(prArgs).length ? { args: prArgs } : {}) },
      { step: "purchase_items" },
      { step: "choose_stages", args: stages.length ? { stages } : {} },
      { step: "expect_pr_items" },
      ...stageRows,
    );
    repairs.push(
      `starts from the PR one step at a time (Purchase Requisitions → Open → tick a PR → Purchase Items → Start New Project → ${stages.length ? stages.join(" + ") : "the stages the tester picks"}); dropped ${before - steps.length + 6 + stageRows.length} step(s) that would open a blank event or replace the PR's items`,
    );
  }
  /**
   * A SURROGATE BID THE CASE EXPECTS PROCOL TO REFUSE (27 Oct, surrogate-bid suite): "try to place a surrogate
   * bid of -50" or "…on a technical-only event". One try, after the Participants list — never a real bid placed
   * before it: SB10 compiled place_surrogate_bid (a real bid) and then attempt{-50}, so Add Bid was already gone
   * and the "refusal" was for the wrong reason. Where no bid can exist at all (a technical stage, a closed or
   * awarded round) the check is the missing Add Bid (expect_count 0 / expect_participant addBid:false), and a
   * plain place_surrogate_bid there only stops the run before that check.
   */
  const bidMentions = (testCase.match(/surrogate bids?\b/gi) ?? []).length;
  const triesBid = /\b(try|tries|trying|attempts?|attempting)\s+(?:to\s+)?(?:place|enter|submit|add|make)\s+(?:a\s+|the\s+|one\s+)?surrogate bid/i.test(testCase);
  if (triesBid && bidMentions === 1) {
    const isPlain = (st: PlanStep) => st.step === "place_surrogate_bid";
    const isTry = (st: PlanStep) => st.step === "attempt" && st.args?.step === "place_surrogate_bid";
    const absenceCheck = steps.some((st) => (st.step === "expect_count" && /add bid/i.test(String(st.args?.name ?? st.args?.text ?? "")) && Number(st.args?.count ?? st.args?.max ?? 1) === 0) || (st.step === "expect_participant" && st.args?.addBid === false));
    const plainAt = steps.map((st, k) => (isPlain(st) ? k : -1)).filter((k) => k >= 0);
    if (plainAt.length && (absenceCheck || steps.some(isTry))) {
      for (const k of plainAt.reverse()) steps.splice(k, 1);
      repairs.push(`dropped ${plainAt.length} real surrogate bid(s) before the refused try — the case places none`);
    } else if (plainAt.length) {
      const last = plainAt[plainAt.length - 1];
      steps[last] = { step: "attempt", args: { step: "place_surrogate_bid", args: (steps[last].args as Record<string, unknown>) ?? {}, expect: "refused" } };
      for (const k of plainAt.slice(0, -1).reverse()) steps.splice(k, 1);
      repairs.push("the surrogate bid the case tries is an attempt Procol must refuse, not a real bid");
    }
    const tryAt = steps.findIndex((st) => isTry(st) || (st.step === "expect_count" && /add bid/i.test(String(st.args?.name ?? ""))));
    if (tryAt >= 0 && !steps.slice(0, tryAt).some((st) => st.step === "open_participants")) {
      steps.splice(tryAt, 0, { step: "open_participants" });
      repairs.push("opened Participants before the surrogate-bid check (Add Bid lives there)");
    }
  }
  const CREATE_STEP = /^(compose_stages|switch_stage|select_template|add_line_items|remove_line_items|fill_sheet|fill_questionnaires|assign_evaluator|set_schedule|invite_vendor|publish|save_draft|expect_publish_blocked|configure_single_stage|expect_stages|expect_line_items)$/;
  const createsEvent =
    steps.some((st) => CREATE_STEP.test(st.step)) ||
    /\b(create|publish|draft|compose)\b[^.\n]{0,60}\b(event|rfq|rfp|auction|erfx|project|stage)\b/i.test(testCase);
  if (fromPr) {
    // The PR's own create screen is the start (above); a blank one would undo it.
  } else if (!has("open_create") && createsEvent) {
    steps.unshift({ step: "open_create", args: { path: "erfx" } });
    repairs.push("added open_create — every create test has to start somewhere");
  } else if (has("open_create") && indexOf("open_create") !== 0) {
    // Present but not first. Every other step acts on the create screen, so
    // anything before it runs against whatever page happens to be open.
    const [open] = steps.splice(indexOf("open_create"), 1);
    steps.unshift(open);
    repairs.push("moved open_create to the front — the steps before it had no create screen to act on");
  }

  // configure_single_stage lives in the single-stage configuration drawer, so
  // the plan must open THAT screen, and the eRFX-only stage steps have nothing
  // to act on there. Decide the screen from the step the case really needs.
  if (has("configure_single_stage") && !/single[- ]?stage|classic|non-?erfx|rank[- ]based|price[- ]based|traffic light|knockout|dutch|award(ing)? (rule|the entire lot|line[- ]item)/i.test(testCase)) {
    steps.splice(indexOf("configure_single_stage"), 1);
    repairs.push("dropped configure_single_stage — the case never asks for the single-stage screen, a strategy or an awarding rule");
  }
  if (has("configure_single_stage")) {
    const open = steps.find((st) => st.step === "open_create");
    if (open && String(open.args?.path ?? "erfx") !== "single-stage") {
      open.args = { ...(open.args ?? {}), path: "single-stage" };
      repairs.push("switched open_create to the single-stage screen — configure_single_stage is that screen's drawer");
    }
    const stageSteps = ["compose_stages", "switch_stage", "expect_stages"];
    let dropped = 0;
    for (let i = steps.length - 1; i >= 0; i--) if (stageSteps.includes(steps[i].step)) { steps.splice(i, 1); dropped++; }
    if (dropped) repairs.push("dropped the stage steps — the single-stage screen has no stage tabs; its type is set in the drawer");
    // The drawer comes first, before a template or line items.
    const cfg = indexOf("configure_single_stage");
    const firstBody = steps.findIndex((st) => ["select_template", "add_line_items", "fill_sheet", "set_title"].includes(st.step));
    if (firstBody >= 0 && cfg > firstBody) {
      const [c] = steps.splice(cfg, 1);
      steps.splice(firstBody, 0, c);
      repairs.push("moved configure_single_stage before the body — the drawer decides the event type the rest is built on");
    }
  }

  // expect_publish_blocked presses Publish itself and judges what follows. A
  // plain publish step before it treats the refusal the case WANTS as a
  // failure and stops the plan one step early — UI-PART-001 died on
  // "publish was rejected: Please add participants to proceed!", which was the
  // pass. Drop the plain publish (and expect_published) when the assertion is
  // there to do the pressing.
  if (has("expect_publish_blocked")) {
    for (const drop of ["publish", "expect_published"]) {
      while (has(drop)) {
        steps.splice(indexOf(drop), 1);
        repairs.push(`dropped ${drop} — expect_publish_blocked presses Publish itself and judges the refusal`);
      }
    }
  }

  /**
   * A NEGATIVE TEST MUST NOT DO THE THING IT IS ABOUT.
   *
   * "Publish with no participants" compiled with invite_vendor in it, so the
   * plan disproved its own premise before pressing Publish. That was patched
   * for participants alone; the same thing happens for every other omission —
   * a title, a template, line items, a schedule.
   *
   * Telling the compiler not to do it is not enough. The prompt now carries a
   * NEGATIVE TESTS section, and the model still emits set_title, because the
   * rule above it says set_title is MANDATORY on every create test and that is
   * the stronger instruction. Reading the omission out of the case text and
   * removing the step is deterministic, which is what this needs to be: the
   * test is only that test if the step is absent.
   *
   * (On this tenant the product audience adds vendors from the line items on
   * its own, which the step reports; that is the product's answer, not ours.)
   */
  if (has("expect_publish_blocked") && !skipped.size) {
    const OMISSIONS: Array<[RegExp, string, string]> = [
      [/\b(no|without|missing|blank|empty)\s+(a\s+)?(project\s+)?title\b/i, "set_title", "a title"],
      [/\b(no|without|missing)\s+(a\s+)?template\b/i, "select_template", "a template"],
      [/\b(no|without|missing|zero|0)\s+(line\s*)?items?\b/i, "add_line_items", "line items"],
      [/\b(no|without|missing)\s+(a\s+)?schedule\b/i, "set_schedule", "a schedule"],
      [/\b(no|without|zero|0)\s+(participants?|vendors?)\b/i, "invite_vendor", "participants"],
    ];
    for (const [pattern, step, what] of OMISSIONS) {
      if (!pattern.test(testCase) || !has(step)) continue;
      steps.splice(indexOf(step), 1);
      // Left out on purpose, as an explicit skip is: the repairs below must not put it back.
      skipped.add(step);
      repairs.push(`removed ${step} — the case is about publishing without ${what}, so including it would defeat the test`);
    }
  }

  /**
   * NO TITLE MEANS AN EMPTY TITLE FIELD, NOT A TITLE LEFT ALONE.
   *
   * Procol fills the project title in from the line item ("RM-BLOCK/BRICK"),
   * so leaving set_title out no longer leaves it empty: plan-mv9123up
   * published "without a project title", was told "Project created
   * successfully" and failed on our plan, not the product (15 Oct). The two
   * runs that morning that drew "Please fill project title!" had cleared the
   * field themselves — the compiler's choice, not a rule. Now it is a rule:
   * the field is emptied right before the publish attempt, after every step
   * that could fill it.
   */
  if (has("expect_publish_blocked") && /\b(no|without|missing|blank|empty)\s+(a\s+)?(project\s+)?title\b/i.test(testCase)) {
    const clearsTitle = (st: PlanStep) =>
      st.step === "fill" && /title/i.test(String(st.args?.label ?? "")) && String(st.args?.value ?? "") === "";
    const at = steps.findIndex(clearsTitle);
    const target = indexOf("expect_publish_blocked");
    // The title is empty on purpose: the mandatory-title repair below must not add one.
    skipped.add("set_title");
    const inPlace = at >= 0 && at < target && steps.slice(at + 1, target).every((st) => st.step === "skip");
    if (!inPlace) {
      if (at >= 0) steps.splice(at, 1);
      steps.splice(indexOf("expect_publish_blocked"), 0, { step: "fill", args: { label: "Enter the title of the project", value: "" } });
      repairs.push(
        at >= 0
          ? "moved the title clearing to just before publishing — a step after it could fill the title in again"
          : "added a step that empties the title field — Procol fills the title in from the line item, so leaving set_title out alone publishes with a title",
      );
    }
  }

  // Vendor coherence. UI-AWD-001 invited five vendors by count, surrogate-bid
  // for whichever came first, then asserted the Master QCS grid lists "AMD" —
  // a vendor never invited. Whoever a later step names must be on the invite,
  // and a bid that names nobody should bid as the vendor the plan cares about.
  {
    const named = new Set<string>();
    for (const st of steps) {
      if (["open_master_qcs"].includes(st.step) && Array.isArray(st.args?.vendors)) for (const v of st.args!.vendors as unknown[]) named.add(String(v));
      // vendor: 2 is "the second vendor on the event", not a name to invite.
      if (["place_surrogate_bid", "place_bid", "place_counter_offer", "expect_counter_offer_sent"].includes(st.step) && st.args?.vendor && !/^\d+$/.test(String(st.args.vendor))) named.add(String(st.args.vendor));
    }
    if (named.size) {
      const inv = steps.find((st) => st.step === "invite_vendor");
      if (inv) {
        const have = Array.isArray(inv.args?.names) ? (inv.args!.names as unknown[]).map(String) : [];
        const missing = [...named].filter((v) => !have.some((h) => h.toLowerCase() === v.toLowerCase()));
        if (missing.length) {
          inv.args = { ...(inv.args ?? {}), names: [...have, ...missing] };
          repairs.push(`invite_vendor now names ${missing.join(", ")} — a later step expects that vendor on the event`);
        }
      }
      const [first] = [...named];
      // Only the first unnamed bid of each kind: a second one is a second
      // vendor (place_bid picks the next vendor on the event), not this one again.
      const filled = new Set<string>();
      for (const st of steps) {
        if (["place_surrogate_bid", "place_bid"].includes(st.step) && !st.args?.vendor && !filled.has(st.step)) {
          filled.add(st.step);
          st.args = { ...(st.args ?? {}), vendor: first };
          repairs.push(`${st.step} now bids as ${first} — the vendor the plan's assertions are about`);
        }
      }
    }
  }

  // Bids for N vendors need N vendors on the event: the product removes a vendor's Add Bid once
  // that vendor has bid, so a second surrogate bid with one participant found nobody (E4, 2026-10-21).
  {
    // …ONCE PER STAGE: on a two-stage event the same vendor answers the technical stage and then quotes the RFQ
    // (27 Oct, VB04: a portal bid + a surrogate technical answer + a surrogate price for the other vendor are
    // two vendors, not three). place_bid covers both stages; a surrogate step with stage "rfp" is the technical one.
    const bids = steps.filter((st) => st.step === "place_surrogate_bid" || st.step === "place_bid");
    // compose_stages on a blank event, choose_stages on an event made from a PR (29 Oct: a PR plan invited 3 for 2).
    const twoStage = steps.some((st) => (st.step === "compose_stages" || st.step === "choose_stages") && Array.isArray(st.args?.stages) && (st.args!.stages as unknown[]).length > 1);
    const perStage = new Map<string, Set<string>>();
    bids.forEach((st, i) => {
      const who = String(st.args?.vendor ?? `#${i}`);
      const tech = /^(rfp|technical)/i.test(String(st.args?.stage ?? ""));
      const keys = !twoStage ? ["one"] : st.step === "place_bid" ? ["technical", "pricing"] : [tech ? "technical" : "pricing"];
      for (const k of keys) (perStage.get(k) ?? perStage.set(k, new Set()).get(k)!).add(st.step === "place_bid" && twoStage ? `portal#${i}` : who);
    });
    const distinct = Math.max(0, ...[...perStage.values()].map((v) => v.size));
    const inv = steps.find((st) => st.step === "invite_vendor");
    if (inv && distinct > 1) {
      const names = Array.isArray(inv.args?.names) ? (inv.args!.names as unknown[]).length : Array.isArray(inv.args?.vendors) ? (inv.args!.vendors as unknown[]).length : 0;
      const count = Number(inv.args?.count ?? 0);
      if (names < distinct && count < distinct) {
        inv.args = { ...(inv.args ?? {}), count: distinct };
        repairs.push(`invite_vendor now asks for ${distinct} vendors — the plan places ${distinct} bids, and a vendor can bid only once`);
      }
    }
  }

  // close_event on this tenant means waiting for the bidding window to lapse
  // (no force-end is offered). Give such a plan a 3-minute schedule before
  // publish: long enough to place the bid, short enough to wait out.
  if (has("close_event")) {
    const sched = steps.find((st) => st.step === "set_schedule");
    if (sched) {
      const m = Number(sched.args?.minutes);
      if (!Number.isFinite(m) || m > 3) {
        sched.args = { ...(sched.args ?? {}), minutes: 3 };
        repairs.push("set_schedule now uses a 3-minute window — close_event waits for the window to lapse when the tenant offers no force-end");
      }
    } else if (has("publish")) {
      steps.splice(indexOf("publish"), 0, { step: "set_schedule", args: { minutes: 3 } });
      repairs.push("added set_schedule(3 min) before publish — close_event needs a short window to wait out");
    }
  }

  // convert_to_auction needs a PUBLISHED RFQ under the browser.
  if (has("convert_to_auction")) {
    const conv = indexOf("convert_to_auction");
    if (!has("publish")) {
      steps.splice(conv, 0, { step: "publish" }, { step: "expect_published" });
      repairs.push("added publish + expect_published before convert_to_auction — only a published RFQ can be converted");
    } else if (indexOf("publish") > conv) {
      const [c] = steps.splice(conv, 1);
      steps.splice(Math.max(indexOf("expect_published"), indexOf("publish")) + 1, 0, c);
      repairs.push("moved convert_to_auction after publish — only a published RFQ can be converted");
    }
    if (!has("compose_stages")) {
      steps.splice(indexOf("open_create") + 1, 0, { step: "compose_stages", args: { stages: ["rfq"] } });
      repairs.push("added compose_stages(rfq) — conversion applies to an RFQ, and the screen defaults to an Auction");
    }
  }

  // Stage steps only exist on the eRFX screen. Pairing them with the
  // single-stage path fails on step two with "the create screen shows [none]",
  // which reads like a broken reconciler rather than the wrong screen.
  const openStep = steps.find((s) => s.step === "open_create");
  const stageSteps = ["compose_stages", "switch_stage", "expect_stages"];
  const usesStages = steps.some((s) => stageSteps.includes(s.step));
  if (usesStages && String(openStep?.args?.path ?? "") === "single-stage") {
    if (/single[- ]stage|non-?erfx/i.test(testCase)) {
      for (let i = steps.length - 1; i >= 0; i--) if (stageSteps.includes(steps[i].step)) steps.splice(i, 1);
      repairs.push("dropped the stage steps — the single-stage screen has no stage tabs, its event type is set in a drawer");
    } else {
      openStep!.args = { ...(openStep!.args ?? {}), path: "erfx" };
      repairs.push('switched open_create to the eRFX screen — the plan composes stages, which only that screen has');
    }
  }

  // RFQ and Auction are mutually exclusive (isValidStage). A plan asking for
  // both can never run, so keep whichever the test actually named.
  const compose = steps.find((s) => s.step === "compose_stages");
  const asked = (compose?.args?.stages as string[] | undefined) ?? [];
  if (asked.includes("rfq") && asked.includes("auction")) {
    const keep = /\bauction\b/i.test(testCase) && !/\brfq\b/i.test(testCase) ? "auction" : "rfq";
    compose!.args = { ...(compose!.args ?? {}), stages: asked.filter((x) => x === keep || x === "rfp") };
    repairs.push(`dropped the other trade stage — the product forbids RFQ and Auction together, so kept ${keep}`);
  }

  // Strip invented vendor names. A name the test case never mentions cannot be
  // matched against a real audience: the invite falls back silently and the bid
  // then searches for a company that does not exist. Keeping only names the
  // test actually used makes fabrication impossible rather than unlikely.
  const mentions = (name: string) => testCase.toLowerCase().includes(name.trim().toLowerCase());
  for (const step of steps) {
    if (step.step === "invite_vendor" && Array.isArray(step.args?.vendors)) {
      const given = (step.args!.vendors as unknown[]).map(String);
      const real = given.filter(mentions);
      if (real.length !== given.length) {
        const dropped = given.filter((n) => !real.includes(n));
        if (real.length) step.args!.vendors = real;
        else delete step.args!.vendors;
        if (!step.args!.count) step.args!.count = given.length;
        repairs.push(
          `dropped invented vendor name(s) ${dropped.join(", ")} — the test case never named them, so the product's audience supplies the vendors instead`,
        );
      }
    }
    if ((step.step === "place_bid" || step.step === "place_surrogate_bid") && step.args?.vendor && !/^\d+$/.test(String(step.args.vendor))) {
      if (!mentions(String(step.args.vendor))) {
        const bad = String(step.args.vendor);
        delete step.args.vendor;
        repairs.push(`dropped invented vendor name ${bad} from ${step.step} — it will bid for whoever is on the event`);
      }
    }
  }

  // Awarding needs a bid to award. A plan that awards an event nobody bid on
  // fails on the allocation step with "no line item could be allocated", which
  // reads like an awarding defect rather than a missing precondition.
  if (has("award_event")) {
    const bid = Math.max(indexOf("place_bid"), indexOf("place_surrogate_bid"));
    if (bid < 0) {
      steps.splice(indexOf("award_event"), 0, { step: "place_surrogate_bid" });
      repairs.push("added place_surrogate_bid before award_event — there is nothing to award without a bid");
    } else if (bid > indexOf("award_event")) {
      const [award] = steps.splice(indexOf("award_event"), 1);
      steps.splice(Math.max(indexOf("place_bid"), indexOf("place_surrogate_bid")) + 1, 0, award);
      repairs.push("moved award_event after the bid — awarding an event with no bids allocates nothing");
    }
  }

  // The two kinds of bidding are easy to confuse and mean different things.
  // The test case says which, so honour the words rather than the model's pick.
  const wantsSurrogate = /surrogate|on (their|the vendor's|his|her) behalf|on behalf of/i.test(testCase);
  const wantsVendorSide = /vendor portal|supplier hub|as the vendor|vendor logs? in|vendor (themselves|submits)/i.test(testCase);
  // "a bid from 1 vendor, and a surrogate bid from another": both kinds are
  // asked for. Swapping then turned the vendor's own bid into a second
  // surrogate bid, so the case was never what it said.
  const ownBidText = testCase.replace(/\bsurrogate\s+(bid|bids)\b/gi, " ");
  const wantsOwnBidToo = /\bbids?\s+from\s+(a|an|one|\d+|the|another)?\s*vendors?\b|\bvendors?\s+(bids?|places?\s+a\s+bid|submits?\s+a\s+bid)\b/i.test(ownBidText);
  const wantsBoth = wantsSurrogate && (wantsOwnBidToo || wantsVendorSide);
  if (wantsSurrogate && has("place_bid") && !wantsBoth && !has("place_surrogate_bid")) {
    steps[indexOf("place_bid")] = { step: "place_surrogate_bid", note: "the test asks the buyer to bid on the vendor's behalf" };
    repairs.push("swapped place_bid for place_surrogate_bid — the test asks the BUYER to bid for the vendor, which never leaves the console");
  }
  if (wantsVendorSide && !wantsSurrogate && has("place_surrogate_bid")) {
    steps[indexOf("place_surrogate_bid")] = { step: "place_bid", note: "the test asks the vendor to bid for themselves" };
    repairs.push("swapped place_surrogate_bid for place_bid — the test asks the VENDOR to sign in and bid");
  }
  // A case that only TRIES a bid Procol must refuse (an attempt, or the missing Add Bid as the check) places
  // none: adding one here put a real bid before SB08's / SB10's refusal check (27 Oct).
  const triesOnly = steps.some((st) => (st.step === "attempt" && /^place_(surrogate_)?bid$/.test(String(st.args?.step ?? ""))) || (st.step === "expect_count" && /add bid/i.test(String(st.args?.name ?? st.args?.text ?? "")) && Number(st.args?.count ?? st.args?.max ?? 1) === 0) || (st.step === "expect_participant" && st.args?.addBid === false && !/\b(then|after)\b/i.test(testCase)));
  if ((wantsSurrogate || wantsVendorSide) && !has("place_bid") && !has("place_surrogate_bid") && !triesOnly) {
    const step = wantsSurrogate ? "place_surrogate_bid" : "place_bid";
    const at = has("expect_published") ? indexOf("expect_published") + 1 : has("publish") ? indexOf("publish") + 1 : steps.length;
    steps.splice(at, 0, { step });
    repairs.push(`added ${step} — the test is about bidding and no bid step was planned`);
  }

  // Vendors are suggested from the line items' product audience, so inviting
  // before any line item exists finds nobody. UI-VAL-001 compiled invite_vendor
  // as step 3 of 18 and stopped there. Move it after the last of the steps that
  // give it something to invite against.
  if (has("invite_vendor")) {
    const after = Math.max(indexOf("add_line_items"), indexOf("fill_sheet"), indexOf("select_template"));
    if (after > indexOf("invite_vendor")) {
      const [inv] = steps.splice(indexOf("invite_vendor"), 1);
      steps.splice(after, 0, inv);
      repairs.push("moved invite_vendor after the line items — the vendor suggestions come from the products on the event");
    }
  }

  // The app DISABLES "Save as draft" until a template is on the stage —
  // UI-PUB-003 compiled to title-then-save and the button read [disabled].
  // A draft with nothing in it is not something the product keeps, so give
  // the draft the one thing the screen demands before saving it.
  // Measured twice: disabled with a title alone, and STILL disabled with a
  // template and Items 0. A draft needs a line item before the app keeps it.
  if (has("save_draft") && !skipped.size) {
    if (!accounted("select_template")) {
      steps.splice(indexOf("save_draft"), 0, { step: "select_template" });
      repairs.push("added select_template before save_draft — the app disables Save as draft until a template is chosen");
    }
    if (!accounted("add_line_items")) {
      steps.splice(indexOf("save_draft"), 0, { step: "add_line_items", args: { count: 1 } });
      repairs.push("added add_line_items before save_draft — Save as draft stays disabled at Items 0");
    }
  }

  // A nameless event is refused at publish, and the title is also how a human
  // finds the event afterwards.
  if (!accounted("set_title") && has("open_create")) {
    const after = Math.max(indexOf("open_create"), indexOf("compose_stages"));
    steps.splice(after + 1, 0, { step: "set_title" });
    repairs.push("added set_title — publishing without a title is refused");
  }

  // The Items drawer is inert until a template exists.
  if (has("add_line_items") && !accounted("select_template")) {
    insertBefore("add_line_items", { step: "select_template" }, "added select_template — the Items drawer stays inert without one");
  }

  const stages = (steps.find((s) => s.step === "compose_stages")?.args?.stages as string[] | undefined) ?? [];
  const wantsTrade = !stages.length || stages.some((s) => s === "rfq" || s === "auction");
  const wantsTechnical = stages.includes("rfp");

  // A plan asserting publish is BLOCKED is deliberately incomplete — repairing
  // it into a valid event would remove the precondition under test.
  const submits = (has("publish") || has("save_draft")) && !has("expect_publish_blocked") && !skipped.size;
  if (stages.length > 1 && submits) {
    // Every stage needs configuring on its OWN tab: template, sheet,
    // questionnaires and evaluator all act on whichever tab is showing. A
    // two-stage plan with a single select_template leaves the other stage
    // template-less, and the app then refuses at publish with "Please select a
    // valid column for savings" — which reads as a savings bug and is really a
    // missing template. Rebuild the per-stage section so each is complete.
    const firstConfig = steps.findIndex((s) =>
      ["select_template", "add_line_items", "fill_sheet", "fill_questionnaires", "assign_evaluator", "switch_stage"].includes(
        s.step,
      ),
    );
    const tailStart = steps.findIndex((s) => ["set_schedule", "invite_vendor", "publish", "save_draft"].includes(s.step));
    if (firstConfig >= 0 && (tailStart < 0 || tailStart > firstConfig)) {
      const head = steps.slice(0, firstConfig);
      const tail = tailStart >= 0 ? steps.slice(tailStart) : [];
      const lineItems = steps.find((s) => s.step === "add_line_items");
      const lineItemCheck = steps.find((s) => s.step === "expect_line_items");

      const rebuilt: PlanStep[] = [...head];
      stages.forEach((stage, i) => {
        rebuilt.push({ step: "switch_stage", args: { stage }, note: `configure the ${stage} stage on its own tab` });
        rebuilt.push({ step: "select_template", note: `${stage} needs its own template` });
        // Line items are project-level: added once, on the first stage.
        if (i === 0 && lineItems) {
          rebuilt.push(lineItems);
          if (lineItemCheck) rebuilt.push(lineItemCheck);
        }
        if (stage === "rfp") {
          rebuilt.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
        } else {
          rebuilt.push({ step: "fill_sheet" });
        }
      });
      rebuilt.push(...tail);
      steps.length = 0;
      steps.push(...rebuilt);
      repairs.push(
        `rebuilt the plan for ${stages.length} stages — each stage is configured on its own tab, since a template applies only to the tab showing`,
      );
    }
  }

  if (stages.length <= 1 && submits) {
    // A single-stage RFP's template is a questionnaire: it has no price sheet to fill (A13, 21 Oct).
    const singleStageRfp = steps.some((st) => st.step === "configure_single_stage" && /rfp/i.test(String(st.args?.eventType ?? "")));
    if (wantsTrade && !singleStageRfp && has("add_line_items") && !accounted("fill_sheet")) {
      const at = indexOf("expect_line_items") >= 0 ? indexOf("expect_line_items") + 1 : indexOf("add_line_items") + 1;
      steps.splice(at, 0, { step: "fill_sheet" });
      repairs.push("added fill_sheet — a pricing stage will not publish with an unfilled sheet");
    }
    if (wantsTechnical && !accounted("fill_questionnaires")) {
      insertBefore("publish", { step: "fill_questionnaires" }, "added fill_questionnaires — a technical stage will not publish with empty questionnaires");
    }
    if (wantsTechnical && !accounted("assign_evaluator")) {
      insertBefore("publish", { step: "assign_evaluator" }, "added assign_evaluator — a technical stage needs one");
    }
  }

  /**
   * A PLAN THAT EXPECTS PUBLISH TO BE REFUSED IS LEFT ALONE.
   *
   * `submits` is already false when the plan asserts `expect_publish_blocked`,
   * and the per-stage repairs above respect it — this pair did not, so it
   * completed the very plan whose incompleteness was the test. "Try to publish
   * without setting a schedule and check it is refused" was compiled, then
   * repaired into a plan that sets the schedule, then reported as a gap the
   * compiler could not express: five of the most-asked-for entries on the gap
   * ledger are this one bug wearing different hats (no title, no template, no
   * line items, no schedule, no participants).
   *
   * The vocabulary could always say it. The linter would not let it through.
   */
  if (has("publish") && submits) {
    if (!accounted("set_schedule")) insertBefore("publish", { step: "set_schedule" }, "added set_schedule — the schedule is displayed but not committed until saved");
    // …unless the plan expects the publish to be REFUSED: a case about
    // publishing with no participants must not be handed participants.
    if (!accounted("invite_vendor") && !has("expect_publish_blocked")) insertBefore("publish", { step: "invite_vendor" }, "added invite_vendor — an event with no participants cannot be bid on");
  }

  // Bidding needs something to bid on, and the vendor portal needs to know
  // WHICH vendor. A bid step before publish, or with an anonymous audience,
  // fails in a way that looks like a bidding defect.
  const bidAt = Math.max(indexOf("place_bid"), indexOf("place_surrogate_bid"));
  if (bidAt >= 0) {
    if (!has("publish")) {
      steps.splice(bidAt, 0, { step: "publish" });
      repairs.push("added publish — a bid needs a published event to bid on");
    } else if (indexOf("publish") > bidAt) {
      const [bid] = steps.splice(bidAt, 1);
      steps.splice(indexOf("publish") + 1, 0, bid);
      repairs.push(`moved ${bid.step} after publish — bidding on an unpublished event is not possible`);
    }
    // A vendor-portal bid (place_bid) signs in as the QA test vendor the runner knows; the plan
    // never invents a vendor name for the invite (an invented "AMD" blocked runs, 2026-10-21).
    // With no vendor named, invite_vendor takes everyone the product suggests.
  }

  // On the create screen Participants and Publish are LOCKED until a template is chosen and a
  // product added ("Please choose a template and add a product" — the eRFX create-screen order).
  // A plan that invites or publishes first can never get there: put the missing steps in front.
  {
    const at = (name: string) => steps.findIndex((st) => st.step === name);
    const onCreate = at("open_create") >= 0 || at("compose_stages") >= 0 || at("configure_single_stage") >= 0;
    const firstNeedy = steps.findIndex((st) => ["invite_vendor", "publish", "expect_published", "set_schedule"].includes(st.step));
    if (onCreate && firstNeedy >= 0) {
      const missing: TestPlan["steps"] = [];
      // …unless the case leaves that step out ON PURPOSE (skip): "a stage with no template" must
      // stay without one — putting it back turned UI-TPL-004 into an ordinary create
      // An event made from a PR already holds the PR's items (and its template, unless the plan adds a
      // stage): putting add_line_items back in front of publish replaced them (26 Oct).
      const prTemplateNeeded = !fromPr; // a PR plan's template is placed with its stage, above
      if (prTemplateNeeded && !skipped.has("select_template") && (at("select_template") < 0 || at("select_template") > firstNeedy)) missing.push({ step: "select_template", args: {}, note: "a template comes first on the create screen" });
      if (!fromPr && !skipped.has("add_line_items") && (at("add_line_items") < 0 || at("add_line_items") > firstNeedy)) missing.push({ step: "add_line_items", args: {}, note: "a product is needed before participants or publishing" });
      if (missing.length) {
        steps.splice(firstNeedy, 0, ...missing);
        repairs.push(`inserted ${missing.map((m) => m.step).join(" + ")} before ${steps[firstNeedy + missing.length].step} — the create screen locks Participants and Publish until a template is chosen and a product added`);
      }
      // With the template or product deliberately left out, Participants stays LOCKED, so an
      // invite before the block assertion can only fail as "couldn't tell"; the lock itself is
      // what the case is about, so the invite goes.
      if (skipped.has("select_template") || skipped.has("add_line_items")) {
        const block = steps.findIndex((st) => BLOCK_ASSERTS.includes(st.step));
        for (let k = (block < 0 ? steps.length : block) - 1; k >= 0; k--) {
          if (steps[k].step === "invite_vendor") {
            steps.splice(k, 1);
            repairs.push("dropped invite_vendor — with the template or product left out on purpose, Participants is locked, and that lock is what the case checks");
          }
        }
      }
    }
  }

  // Evaluators are assigned per line item: on a technical stage the line items come before its
  // questionnaires and its evaluator. The insert above put add_line_items before set_schedule,
  // i.e. AFTER assign_evaluator, and "no evaluator could be assigned" (B08, 21 Oct).
  {
    const li = steps.findIndex((st) => st.step === "add_line_items");
    const tech = steps.findIndex((st, k) => k < li && (st.step === "fill_questionnaires" || st.step === "assign_evaluator"));
    if (li >= 0 && tech >= 0) {
      const [item] = steps.splice(li, 1);
      steps.splice(tech, 0, item);
      repairs.push("moved add_line_items before fill_questionnaires / assign_evaluator — evaluators are assigned per line item");
    }
  }

  // The SINGLE-STAGE create screen opens with Event Type = RFP, whose templates are questionnaires
  // with no price sheet. A priced plan must set the event type before choosing a template.
  {
    const oc = steps.findIndex((st) => st.step === "open_create" && /single/i.test(String((st.args as any)?.path ?? (st.args as any)?.type ?? "")));
    const priced = steps.some((st) => ["add_line_items", "fill_sheet", "place_bid", "place_surrogate_bid"].includes(st.step));
    const hasType = steps.some((st) => st.step === "configure_single_stage");
    if (oc >= 0 && priced && !hasType) {
      const eventType = /auction|knock|dutch|rank|traffic/i.test(testCase) ? "auction" : "rfq";
      const tpl = steps.findIndex((st) => st.step === "select_template");
      const at = tpl > oc ? tpl : oc + 1;
      steps.splice(at, 0, { step: "configure_single_stage", args: { eventType }, note: "a priced single-stage event needs its type set before a template (the screen opens as RFP)" });
      repairs.push(`inserted configure_single_stage{eventType:${eventType}} — the single-stage screen opens as RFP, whose templates have no price sheet`);
    }
  }

  /**
   * ON-SCREEN PARTS THAT A STEP ALREADY DOES (27 Oct, surrogate suite): the explorer went round in circles
   * on each of these, where a fixed step answers in seconds.
   *  - "make sure exactly one vendor is selected" after invite_vendor{count}: the invite already did it;
   *  - "the vendor's row no longer offers Add Bid": expect_participant{addBid:false};
   *  - "open Add Bid and submit with no price": attempt{place_surrogate_bid{noPrice:true}}.
   */
  for (let i = steps.length - 1; i >= 0; i--) {
    const st = steps[i];
    if (st.step !== "do_on_screen") continue;
    const goal = String(st.args?.goal ?? "");
    if (/exactly (one|1|\d+) (invited )?(vendors?|participants?)/i.test(goal) && /\b(select|invite|retain|remov|participant)/i.test(goal) && steps.slice(0, i).some((x) => x.step === "invite_vendor")) {
      steps.splice(i, 1);
      repairs.push("dropped an on-screen check that the vendor count is right — invite_vendor{count} already sets it");
    } else if (/no longer offers? add bid|add bid (is )?(gone|absent|no longer|not offered)|(without|no) add bid/i.test(goal)) {
      steps[i] = { step: "expect_participant", args: { addBid: false }, note: "the row no longer offers Add Bid" };
      repairs.push("checked the missing Add Bid with expect_participant{addBid:false}, not on screen");
    } else if (/add bid/i.test(goal) && /(without|no|empty|blank)\s+(entering\s+)?(a\s+|any\s+)?price/i.test(goal)) {
      steps[i] = { step: "attempt", args: { step: "place_surrogate_bid", args: { noPrice: true }, expect: "refused" }, note: "a bid with no price" };
      repairs.push("submitted the bid with no price through place_surrogate_bid{noPrice}, not on screen");
    }
  }

  return { plan: { ...plan, steps }, repairs };
}

const KNOWLEDGE_DIR = join(here, "..", "..", "knowledge");

/**
 * Expand a case id into the case itself.
 *
 * The catalogs hold 296 cases with ids like `FE-9.7` and `BE-2.11`, and typing
 * the id is how a tester actually refers to one. Compiling the literal string
 * "FE-9.7" would produce a plan for nothing, so the id is resolved to its
 * title, steps and expected result first — which also hands the compiler a far
 * better specification than a sentence someone typed from memory.
 */
export function resolveCaseId(input: string): { text: string; id: string } | null {
  // The written catalog first — `UI-CRE-001`, `API-BID-014`. It is the source
  // of truth people actually edit, and it carries Setup and Oracle, so it
  // specifies the case better than the mined JSON does.
  const written = input.trim().match(/^((?:UI|API)-[A-Z]+-\d+)$/i)?.[1] ?? (input.trim().match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)$/i)?.[1] && caseById(input.trim()) ? input.trim() : undefined);
  if (written) {
    const c = caseById(written);
    return c ? { text: caseAsProse(c), id: c.id } : null;
  }

  const id = input.trim().match(/^((?:FE|BE|PR)-[\w.-]+)$/i)?.[1];
  if (!id) return null;
  if (!existsSync(KNOWLEDGE_DIR)) return null;

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) files.push(full);
    }
  };
  walk(KNOWLEDGE_DIR);

  for (const f of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const found = (parsed as Array<Record<string, any>>).find(
      (c) => String(c.id ?? "").toLowerCase() === id.toLowerCase(),
    );
    if (!found) continue;
    const parts = [
      found.title,
      found.preconditions?.length ? `Given: ${found.preconditions.join("; ")}` : "",
      found.steps?.length ? `Steps: ${found.steps.join(" then ")}` : "",
      found.expected ? `Expected: ${typeof found.expected === "string" ? found.expected : JSON.stringify(found.expected)}` : "",
      found.oracle?.detail ? `Check: ${found.oracle.detail}` : "",
    ].filter(Boolean);
    return { text: parts.join(". "), id: String(found.id) };
  }
  return null;
}

export interface CompileOptions {
  /** Compile without writing the vocabulary-gap ledger (measurement runs). */
  dryRun?: boolean;
  /** LLM tier; production compiles use "reason". Measurement may use "fast" (cost rule). */
  tier?: "reason" | "fast";
  /**
   * Withhold the generic steps, their rules and the known labels — the
   * compiler as it was before them. Used only to measure the before/after.
   */
  withholdGeneric?: boolean;
  /**
   * The case's starting state is built through the API (src/ui/uiSetup.ts):
   * the plan opens `screen` with open_prepared and holds only the steps the
   * case is about. `valueKeys` are the API values expect_api_value can compare.
   */
  prepared?: { state: string; screen: string; screenWhat: string; valueKeys: string[]; technical?: boolean; screenAssertions?: string[]; examples?: string };
  /**
   * The screen the case was written from (the explorer / screen cases): its path and the exact
   * names of its controls. The plan reaches it with go_to {screen:"path"} and acts on it with
   * the generic steps; a control named here is a known label, not a guess.
   */
  screen?: { label: string; path: string; controls: string[]; headings?: string[] };
  /**
   * Compile for a site that is NOT Procol (the public QA agent bench): only
   * the generic steps, no Procol rules, memory, labels or lint repairs. The
   * executor is pointed at the site with APP_URL, so go_to{screen:"path"}
   * opens its pages.
   */
  site?: { name: string };
}

/** The prompt section for a case written from a photographed screen (CompileOptions.screen). */
function screenRules(sc: NonNullable<CompileOptions["screen"]>): string {
  const eventScreen = /^\/(orders|project)\b/.test(sc.path);
  return [
    `THE SCREEN THIS CASE IS ON: "${sc.label}" at ${sc.path}.`,
    `- Start the plan with go_to {screen:"path", path:"${sc.path}"}${eventScreen ? " unless a domain step reaches it" : ""}.`,
    `- Its controls, named EXACTLY as rendered (these are KNOWN LABELS — asserting or acting on one is covered, not a guess):\n  ${sc.controls.slice(0, 120).join(" · ")}`,
    sc.headings?.length ? `- Headings and column titles on it (known text for expect_text): ${sc.headings.slice(0, 40).join(" · ")}` : "",
    "- Every generic step that looks for something needs a name, label, placeholder or text from this list — never an empty expect_count / expect_visible.",
    eventScreen
      ? "- The event steps apply here."
      : "- This is NOT an event screen: the event steps (open_events_list, expect_events_list, open_create, add_line_items, publish, place_bid…) do not apply. Use the GENERIC steps: click / fill / select / press / expect_text / expect_visible / expect_count / expect_value / expect_message / attempt. A click that opens a drawer, dialog, menu or page is checked with expect_visible or expect_text on what appears.",
    '- Coverage is "full" when every step acts on or checks a control listed here or text the screen shows; "partial" when one detail is unconfirmed; "none" only when the subject is not on this screen at all.',
  ].join("\n");
}

/**
 * Generic steps whose element names are checked against the known labels.
 * expect_disabled / expect_enabled name a control the same way, so they are
 * held to the same standard.
 */
const LABELLED_STEPS = new Set(["click", "hover", "fill", "select", "toggle", "upload", "expect_text", "expect_visible", "expect_count", "expect_value", "expect_message", "remember", "attempt", "expect_disabled", "expect_enabled"]);

/** Is this step an ABSENCE check (passes when something is not there)? */
function isAbsenceCheck(st: PlanStep): boolean {
  const a = st.args ?? {};
  const f = (v: unknown) => v === false || /^(false|no|0)$/i.test(String(v));
  if (st.step === "expect_visible" && a.visible !== undefined && f(a.visible)) return true;
  if (st.step === "expect_text" && a.present !== undefined && f(a.present)) return true;
  if (st.step === "expect_count" && (Number(a.count) === 0 || Number(a.max) === 0) && (a.count !== undefined || a.max !== undefined)) return true;
  return false;
}

/**
 * The words a generic step uses to find its element — what must be a real
 * label for the plan to be more than a guess.
 */
function stepLabelWords(st: PlanStep): string[] {
  const a = (st.step === "attempt" ? { ...((st.args?.args as Record<string, unknown>) ?? {}) } : { ...(st.args ?? {}) }) as Record<string, unknown>;
  const out: string[] = [];
  const take = (o: Record<string, unknown>) => {
    for (const k of ["name", "label", "text", "placeholder", "control", "on"]) if (typeof o[k] === "string" && o[k]) out.push(String(o[k]));
    if (typeof o.target === "string" && o.target) out.push(o.target);
    if (o.target && typeof o.target === "object") take(o.target as Record<string, unknown>);
    if (o.on && typeof o.on === "object") take(o.on as Record<string, unknown>);
  };
  take(a);
  // A message's expected text is the case's claim, judged separately below.
  if (st.step === "expect_message" && typeof a.text === "string") out.splice(out.indexOf(a.text), 1);
  return out;
}

/**
 * COVERAGE HONESTY for generic steps.
 *
 * A generic step names an element. If that name is neither a label the
 * product is known to render (its source, or a live find) nor words the case
 * itself uses, the compiler GUESSED it — and a plan built on a guess is not
 * full coverage. An ABSENCE check is stricter still: a misspelt name is always
 * absent, so it must use a known label, not merely the case's own words.
 */
export function labelGuesses(steps: PlanStep[], testCase: string, labels: Record<string, string[]> | undefined): string[] {
  const caseText = lc(testCase);
  // The plan's own data — the titles it gives or opens — is not a label guess:
  // finding "UI-BOQ-001 Draft Once" in the list is finding our own event.
  const ownData = steps
    .filter((st) => ["set_title", "open_event", "expect_event_in_list", "expect_event_status"].includes(st.step) && typeof st.args?.title === "string")
    .map((st) => lc(String(st.args!.title)))
    .filter((t) => t.length >= 3);
  const isOwn = (w: string) => lc(w).length >= 3 && ownData.some((t) => t.includes(lc(w)) || lc(w).includes(t));
  const inCase = (w: string) => lc(w).length >= 3 && caseText.includes(lc(w));
  const out: string[] = [];
  for (const st of steps) {
    if (!LABELLED_STEPS.has(st.step)) continue;
    const absence = isAbsenceCheck(st);
    for (const w of stepLabelWords(st)) {
      if (labelIsKnown(w, labels) || isOwn(w)) continue;
      if (absence) out.push(`unconfirmed label "${w}" in an absence check (${st.step}) — a name the product does not use is always absent, so this proves nothing until the label is confirmed`);
      else if (!inCase(w)) out.push(`unconfirmed label "${w}" (${st.step}) — not among the labels known from the app nor in the case`);
    }
    if (st.step === "expect_message" && typeof st.args?.text === "string" && !labelIsKnown(st.args.text, labels) && !inCase(st.args.text)) {
      out.push(`expected message "${st.args.text}" is neither a known product message nor quoted by the case`);
    }
  }
  return [...new Set(out)];
}

/** The prompt section for a case whose state the API builds (CompileOptions.prepared). */
function preparedRules(p: NonNullable<CompileOptions["prepared"]>): string {
  return `PREPARED STATE — THIS OVERRIDES the create-test rules above:
- Before the plan runs, the API has ALREADY built this case's event: a ${p.technical ? "technical (RFP) round + " : ""}pricing (RFQ) round, state "${p.state}" (draft = saved, not published; live = published, bidding open; bid = live and one invited vendor has submitted a bid; closed = the bidding window ended after that bid; proposal = closed with a DRAFT award proposal allocating the line; awarded = closed and the proposal submitted).
- The built event has exactly ONE line item, ${qaVendorsOnly() ? "ONE invited QA vendor (whose bid, when there is one, is the only bid)" : "the vendors Procol suggests for its product invited (often many — never assert a participant count; after select_participant use grewBy) and exactly ONE bid when the state has one, from the case's own vendor"} and default settings. A case that needs more line items, more vendors or bids, or another tenant setting is NOT this state: write the steps for what this state can show, put the rest in cannotExpress and set coverage "partial" — never assert numbers the case assumes for a bigger event (e.g. "1/2").
- The state is FIXED: close_event, publish, save_draft, set_schedule, invite_vendor and place_bid are NOT available (the window stays open for an hour on live/bid; closed/proposal are already closed). A case that needs the event in two states (e.g. "shown while live, hidden once closed") gets steps for THIS state only and coverage "partial".
- After a click that opens a proposal, the URL is /project/<id>/proposal/<id>; the awarding screen is /awarding/<id>.
- The FIRST step MUST be open_prepared{"screen":"${p.screen}"} — it opens ${p.screenWhat} on that event. Do NOT open_create, set_title, compose_stages, publish, invite_vendor or search the EVENTS list: the event exists. (Searching the event's own Participants list with search_participants / select_participant is fine — select_participant searches by itself.) Use other navigation (go_to tab, click) only to reach a sub-screen the case names.
- Write ONLY the steps the case is about, then an assertion for EACH screen expectation${p.screenAssertions?.length ? ` — these are the ones a screen must show:\n${p.screenAssertions.map((a) => `  • ${a}`).join("\n")}` : "."}
- A value the API holds and the screen must show (title, vendor name, quantity, bid price…) → expect_api_value{key} with key one of: ${p.valueKeys.join(", ") || "(none for this state)"}.
- On master_qcs read the grid with expect_qcs_vendors / expect_qcs_cell / expect_qcs_amounts / expect_qcs_ranks (the state has ONE vendor and ONE line item: ranks and columns beyond that are cannotExpress). On participants use search_participants / expect_participant / expect_participant_count; select_participant is the ONLY way to add a vendor on a prepared state (never invent a vendor name — name one only if the case does).
- Use expect_toast for a toast, expect_field_error for an error at a field, expect_navigated after a click that should move the screen, expect_order for order/sorting, expect_disabled/expect_enabled for control state, expect_visible/expect_text/expect_count for presence and absence, expect_screen_clean when the case is about the screen rendering correctly.
- If the case needs a state this one is not (e.g. a second vendor, a setting flipped, a different event type), say so in cannotExpress and set coverage "partial" or "none".${p.examples ? `\n\n${p.examples}` : ""}`;
}

/**
 * A DRAFT PLAN IN UNDER A SECOND, no model (Aanya, 26 Oct: "this feels so slow and boring for the user
 * watching the journey"). The compile takes 15–25 s; this is what the session shows meanwhile, marked as
 * a draft — the compiled plan replaces it. It is the same repairs lintPlan applies to every plan, run on
 * the generic create plan (or, for an evaluation of an existing event, on the evaluation skeleton), so a
 * PR case already reads Purchase Requisitions → Open → tick a PR → Purchase Items → … here.
 */
export function quickOutline(testCase: string): { title: string; steps: PlanStep[]; draft: true } {
  // Only when the case's shape is certain: a wrong draft ("it's going to create an event" for a
  // list-only check, 27 Oct) is worse than none. Empty steps mean no draft is sent.
  const none = { title: "", steps: [] as PlanStep[], draft: true as const };
  const creates = /\b(create|publish|make|build|save)\b[^.]{0,60}\b(event|rfq|rfp|auction|erfx|project|draft)\b/i.test(testCase);
  const tab = testCase.match(/\b(live|history|drafts?|recurring|upcoming)\s+tab\b/i)?.[1];
  const listOnly = !creates && /\b(events? list|list of events|events page|live tab|history tab|drafts? tab|recurring tab)\b/i.test(testCase);
  const evaluatesExisting = evaluates(testCase) && !creates;
  let base: TestPlan | null = null;
  if (startsFromPr(testCase)) {
    // the PR repairs add the PR start and the named stages' steps; the stages are never guessed
    base = { title: "Event from a PR", steps: [{ step: "set_title" }, { step: "set_schedule" }, { step: "invite_vendor" }, { step: "publish" }, { step: "expect_published" }] };
  } else if (evaluatesExisting) {
    base = { title: "Evaluate a technical response", steps: [{ step: "open_event", args: { purpose: "evaluation" } }, { step: "go_to", args: { screen: "stage", stage: "rfp" } }, { step: "do_on_screen", args: { goal: EVALUATE_GOAL } }] };
  } else if (listOnly) {
    return { title: "The events list", steps: [{ step: "open_events_list" }, { step: "expect_events_list" }, ...(tab ? [{ step: "filter_events", args: { tab: tab.replace(/s$/i, "") } }] : [])], draft: true };
  } else if (creates) {
    base = fallbackPlan(testCase);
  }
  if (!base) return none;
  try {
    const { plan } = lintPlan(base, testCase);
    return { title: plan.title, steps: plan.steps, draft: true };
  } catch {
    return none;
  }
}

export async function compileTestCase(testCase: string, moduleHint = "events", opts: CompileOptions = {}): Promise<CompileResult> {
  const full = loadCatalog();
  const catalog: Catalog = opts.site
    ? siteCatalog(full)
    : opts.withholdGeneric
      ? { steps: full.steps.filter((s) => !s.generic), names: full.steps.filter((s) => !s.generic).map((s) => s.name) }
      : full;
  // Off Procol nothing below may be recorded against the product.
  if (opts.site) opts = { ...opts, dryRun: true };
  const warnings: string[] = [];
  /** The catalog id this came from, when it did — the gap ledger keys on it. */
  let resolvedId: string | null = null;

  // "FE-9.7" is a reference, not a test case. Resolve it before planning.
  const resolved = opts.site ? null : resolveCaseId(testCase);
  if (resolved) {
    resolvedId = resolved.id;
    warnings.push(`resolved ${resolved.id} from the test-case catalog`);
    testCase = `${resolved.id}: ${resolved.text}`;
  } else if (/^(?:FE|BE|PR)-[\w.-]+$/i.test(testCase.trim())) {
    warnings.push(`no case with id "${testCase.trim()}" exists in the catalog — planned from the text as written`);
  }

  // Ground the plan in what the platform knows about this area.
  let expectations: string[] = [];
  let experience: string[] = [];
  if (!opts.site) try {
    const memory = await recall(testCase, moduleHint, 5);
    expectations = memory.expectations.map((r) => r.text.slice(0, 300));
    experience = memory.experience.map((r) => r.text.slice(0, 300));
  } catch {
    warnings.push("the QA memory is not built, so the plan was written without it — run `npm run rag:build`");
  }

  // Gemini alone is still a model — only a machine with no key at all takes
  // the deterministic path.
  if (llmMode() === "fallback" && !process.env.GOOGLE_API_KEY) {
    warnings.push("no LLM key is set, so a default plan was used rather than one compiled from your test case");
    return {
      plan: fallbackPlan(testCase),
      reasoning: "Compiled without a language model: a standard create-and-publish plan shaped by the words in the test case.",
      context: { expectations, experience },
      source: "fallback",
      coverage: "partial",
      gaps: ["compiled without a model, so this is a generic plan rather than this case"],
      warnings,
    };
  }

  const knownLabels = labelsForPrompt(catalog.labels);
  const knownScreens = opts.withholdGeneric ? "" : screensForPrompt();
  const prompt = opts.site
    ? [`STEP CATALOG:\n${renderSteps(catalog.steps)}`, SITE_RULES, `SITE: ${opts.site.name}`, `TEST CASE:\n${testCase}`].join("\n\n")
    : [
    `STEP CATALOG:\n${catalogForPrompt(catalog.steps)}`,
    DOMAIN_RULES,
    opts.withholdGeneric ? "" : GENERIC_RULES,
    knownLabels ? `KNOWN LABELS (exact strings the product renders, by screen — from its source and from live runs):\n${knownLabels}` : "",
    knownScreens ? `KNOWN SCREENS (photographed by the screen walk — the steps that reach each one; reuse them to get to the screen a case is about):\n${knownScreens}` : "",
    expectations.length ? `WHAT THE RULES SAY ABOUT THIS AREA:\n${expectations.map((e) => `- ${e}`).join("\n")}` : "",
    experience.length ? `WHAT HAS BROKEN HERE BEFORE (worth asserting):\n${experience.map((e) => `- ${e}`).join("\n")}` : "",
    opts.prepared ? preparedRules(opts.prepared) : "",
    opts.screen ? screenRules(opts.screen) : "",
    `TEST CASE:\n${testCase}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Retry with backoff. A free-tier rate limit that quietly degrades into the
  // generic fallback plan is the worst failure mode available here: the run
  // still goes green-ish and nobody can tell the compiler never ran. Three
  // attempts, and if all fail the fallback is used AND said out loud.
  let raw = "";
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      raw = await chat([{ role: "system", content: opts.site ? SITE_SYSTEM : SYSTEM }, { role: "user", content: prompt }], {
        // The compiler is where a wrong answer becomes a wrong run — it gets the
        // strongest model the gateway has, at that model's price.
        tier: opts.tier ?? "reason",
        temperature: 0,
        // Generous: a plan is ~600 tokens of JSON, and the model needs headroom
        // for its reasoning pass before it writes any of it.
        maxTokens: 3_000,
      });
      if (raw.trim()) {
        lastErr = undefined;
        break;
      }
      lastErr = new Error("the model returned nothing");
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2_000));
  }
  if ((lastErr || !raw.trim()) && opts.site) {
    throw new Error(`the model could not be reached after 3 attempts (${lastErr instanceof Error ? lastErr.message.slice(0, 200) : "empty response"})`);
  }
  if (lastErr || !raw.trim()) {
    warnings.push(
      `the model could not be reached after 3 attempts (${
        lastErr instanceof Error ? lastErr.message : "empty response"
      }) — this plan is the generic default, NOT compiled from your test case`,
    );
    return { plan: fallbackPlan(testCase), reasoning: "Model unavailable.", context: { expectations, experience }, source: "fallback", warnings, coverage: "partial", gaps: ["compiled without a model, so this is a generic plan rather than this case"] };
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    warnings.push("the model did not return JSON — used a default plan instead");
    return { plan: fallbackPlan(testCase), reasoning: "Unparseable model output.", context: { expectations, experience }, source: "fallback", warnings, coverage: "partial", gaps: ["compiled without a model, so this is a generic plan rather than this case"] };
  }

  let parsed: { title?: string; reasoning?: string; steps?: PlanStep[]; coverage?: string; cannotExpress?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    warnings.push(`the model's JSON was malformed (${(e as Error).message}) — used a default plan instead`);
    return { plan: fallbackPlan(testCase), reasoning: "Malformed model output.", context: { expectations, experience }, source: "fallback", warnings, coverage: "partial", gaps: ["compiled without a model, so this is a generic plan rather than this case"] };
  }

  // Drop steps the executor does not have rather than failing the whole plan:
  // a model that invents one step usually got the rest right, and saying which
  // step was discarded is more useful than refusing outright.
  const known = new Set(catalog.names);
  const steps = (parsed.steps ?? []).filter((s) => {
    if (known.has(s?.step)) return true;
    warnings.push(`dropped "${s?.step}" — no such step exists`);
    return false;
  });

  const declaredGaps = Array.isArray(parsed.cannotExpress)
    ? (parsed.cannotExpress as unknown[]).map((g) => String(g).trim()).filter(Boolean)
    : [];
  if (!steps.length) {
    // The model returned no steps. If it also said WHY — coverage "none", or
    // a list of things it cannot express — that is the honest answer to a case
    // the vocabulary cannot test (an API-only case, a flow with no step), and
    // it must be returned as such. BE-2.11 and FE-3.1 were compiled this way
    // and then quietly replaced with the generic publish plan, which would run,
    // pass, and have tested nothing the case was about.
    if (parsed.coverage === "none" || declaredGaps.length) {
      const gaps = declaredGaps.length ? declaredGaps : ["what this case checks has no step in the vocabulary"];
      warnings.push(`cannot test this case yet — no step can observe: ${gaps.join("; ")}`);
      if (!opts.dryRun) recordVocabularyGaps(resolvedId ?? testCase.match(/^\s*((?:UI|API|FE|BE)-[A-Z]*-?[\w.]+)/)?.[1] ?? testCase.slice(0, 80), gaps);
      return {
        plan: { title: String(parsed.title ?? testCase.slice(0, 60)), steps: [] },
        reasoning: String(parsed.reasoning ?? "The case's subject has no step in the vocabulary."),
        context: { expectations, experience },
        source: "llm",
        warnings,
        coverage: "none",
        gaps,
      };
    }
    warnings.push("the model produced no runnable steps and gave no reason — used a default plan instead");
    return { plan: fallbackPlan(testCase), reasoning: "No usable steps.", context: { expectations, experience }, source: "fallback", warnings, coverage: "partial", gaps: ["compiled without a model, so this is a generic plan rather than this case"] };
  }

  if (opts.prepared && !steps.some((st) => st.step === "open_prepared")) {
    steps.unshift({ step: "open_prepared", args: { screen: opts.prepared.screen }, note: "the API built this case's state" });
    warnings.push(`added open_prepared(${opts.prepared.screen}) — the API built this case's state`);
  }
  // lintPlan repairs Procol's flows; on another site it would insert them.
  const linted = opts.site
    ? { plan: { title: String(parsed.title ?? testCase.slice(0, 60)), steps }, repairs: [] }
    : lintPlan({ title: String(parsed.title ?? testCase.slice(0, 60)), steps }, testCase);
  // A plan that acts but never checks proves nothing: the executor refuses to
  // pass it, so say so here, where the case can still be marked untestable.
  const assertionNames = new Set(catalog.steps.filter((st) => st.assertion).map((st) => st.name));
  if (!linted.plan.steps.some((st) => assertionNames.has(st.step))) {
    const gap = "the plan has no assertion step — nothing the case checks can be observed";
    warnings.push(`cannot test this case yet — ${gap}`);
    return {
      plan: linted.plan,
      reasoning: String(parsed.reasoning ?? ""),
      context: { expectations, experience },
      source: "llm",
      warnings,
      coverage: "none",
      gaps: [...(Array.isArray(parsed.cannotExpress) ? (parsed.cannotExpress as unknown[]).map(String) : []), gap],
    };
  }
  warnings.push(...linted.repairs);

  // The model's own "unconfirmed label" notes are label guesses, not missing
  // steps: they are judged with the deterministic label check below.
  const modelGuesses = declaredGaps.filter((g) => /^unconfirmed label/i.test(g));
  let gaps = declaredGaps.filter((g) => !/^unconfirmed label/i.test(g));
  const declaredGapCount = gaps.length;
  // Gaps the reschedule step already covers, which the model keeps listing (UI-EVDTME-002):
  // a past DAY is asked for with start "-1d" (the calendar disables it — counted as refused),
  // and the refusal is read from the dialog field's own help text, i.e. under that field.
  const rsIdx = linted.plan.steps.findIndex((st) => st.step === "reschedule_event");
  if (rsIdx >= 0) {
    const pastDay = (g: string) => /past (calendar )?days?|days? (in the past|before today)|disabled (in the )?(date )?(picker|calendar)|calendar.*disabled/i.test(g);
    const underField = (g: string) => /(under|below|beneath|next to|at) the (relevant |date |start )?(field|input)|field'?s? (own )?(error|help|message)|rendered specifically under/i.test(g);
    if (gaps.some(pastDay)) {
      if (!linted.plan.steps.some((st) => st.step === "reschedule_event" && /^\s*-\s*\d+\s*d/i.test(String(st.args?.start ?? "")))) {
        linted.plan.steps.splice(rsIdx, 0, { step: "reschedule_event", args: { start: "-1d", expect: "refused" }, note: "a past day is disabled in the calendar" });
        warnings.push('added reschedule_event{start:"-1d", expect:"refused"} — a past day is greyed out in the calendar, which the step reports as refused');
      }
      gaps = gaps.filter((g) => !pastDay(g));
    }
    if (gaps.some(underField)) {
      gaps = gaps.filter((g) => !underField(g));
      warnings.push("reschedule_event reads the refusal from the dialog field's own help text — that is the message under the field");
    }
  }
  // The model's "partial" rests on the gaps it listed: when every one of them was resolved
  // above (a step that covers it was added or already present), its "partial" goes with them.
  const gapsAllResolved = declaredGapCount > 0 && gaps.length === 0;
  let coverage: CompileResult["coverage"] =
    parsed.coverage === "none" ? "none" : (parsed.coverage === "partial" && !gapsAllResolved) || gaps.length ? "partial" : "full";
  // A model that lists gaps but claims full coverage is contradicting itself;
  // the gaps are the more specific claim, so they win.
  if (coverage === "full" && gaps.length) coverage = "partial";
  // A plan that does the steps it has and asks the tester for the rest
  // (ask_tester, Aanya 21 Oct: "whatever u dont have, ask the user") is partly
  // covered. Read as "none", the server sent it whole to the explorer, which
  // guessed: a Technical + RFQ case became a single-stage RFQ.
  if (coverage === "none" && linted.plan.steps.some((st) => st.step === "ask_tester") && linted.plan.steps.some((st) => st.step !== "ask_tester")) coverage = "partial";
  // A generic step built on a guessed label is not full coverage, whatever
  // the model says — checked against the labels known from the app.
  // A photographed screen's own controls and headings are labels the product renders.
  const labelsKnown = opts.screen
    ? { ...(catalog.labels ?? {}), [`screen ${opts.screen.label}`]: [...opts.screen.controls.map((c) => c.replace(/^\w+\s+"(.*)"(\s+\(disabled\))?$/, "$1")), ...(opts.screen.headings ?? [])] }
    : catalog.labels;
  const guesses = opts.withholdGeneric || opts.site ? [] : labelGuesses(linted.plan.steps, testCase, labelsKnown);
  if (guesses.length) {
    if (coverage === "full") coverage = "partial";
    warnings.push(...guesses.map((g) => `coverage partial: ${g}`));
  } else if (modelGuesses.length && coverage === "partial" && !gaps.length && parsed.coverage !== "none") {
    // The model worried about a label that turns out to be known: full.
    coverage = "full";
    warnings.push(`the model was unsure of ${modelGuesses.length} label(s) that are known from the app — coverage full`);
  }
  const allGaps = [...gaps, ...guesses];
  if (coverage !== "full") {
    warnings.push(
      coverage === "none"
        ? `cannot test this case yet — no step can observe: ${allGaps.join("; ") || "its subject"}`
        : `can only test part of this — ${gaps.length ? `no step for: ${gaps.join("; ")}` : "a generic step relies on a label not yet confirmed from the app"}`,
    );
  }
  // The ledger is keyed by case id whenever there is one — the dashboard hands
  // over the case's prose, which begins with its id — and reconciled on every
  // compile, so a gap that has since been built disappears from the list.
  const ledgerKey = resolvedId ?? testCase.match(/^\s*((?:UI|API|FE|BE)-[A-Z]*-?[\w.]+)/)?.[1] ?? testCase.slice(0, 80);
  // The ledger lists missing STEPS; an unconfirmed label is not one (it is
  // fixed by confirming the label on screen), so only the model's gaps go there.
  if (!opts.dryRun) recordVocabularyGaps(ledgerKey, coverage === "full" ? [] : gaps.length ? gaps : guesses.length ? [] : ["(unspecified)"]);

  return {
    plan: linted.plan,
    reasoning: String(parsed.reasoning ?? ""),
    context: { expectations, experience },
    source: "llm",
    warnings,
    coverage,
    gaps: allGaps,
  };
}

// ── the event lifecycle, as the steps move it ──────────────────────────────
type LifeState = "none" | "editing" | "published" | "bid" | "closed" | "awarded" | "ordered";
/** Which states a lifecycle step can run in, and the state it leaves. Steps not listed do not move it. */
const LIFE: Record<string, { needs: LifeState[]; makes?: LifeState }> = {
  open_create: { needs: ["none", "editing", "published", "bid", "closed", "awarded", "ordered"], makes: "editing" },
  publish: { needs: ["editing"], makes: "published" },
  create_new_version: { needs: ["published", "bid"], makes: "editing" },
  // The conversion opens the auction as a new draft on the create screen, published again after (B32, 26 Oct:
  // "publish cannot run on a published event" was said of that very publish).
  convert_to_auction: { needs: ["published", "bid"], makes: "editing" },
  place_bid: { needs: ["published", "bid"], makes: "bid" },
  place_surrogate_bid: { needs: ["published", "bid"], makes: "bid" },
  close_event: { needs: ["published", "bid"], makes: "closed" },
  award_event: { needs: ["closed"], makes: "awarded" },
  start_awarding: { needs: ["closed"] },
  approve_award: { needs: ["awarded"] },
  create_po: { needs: ["awarded"], makes: "ordered" },
  expect_po_items: { needs: ["ordered"] },
};
const AWARDING = new Set(["award_event", "start_awarding"]);
const RANK: Record<LifeState, number> = { none: 0, editing: 1, published: 2, bid: 3, closed: 4, awarded: 5, ordered: 6 };

/**
 * Walk a plan through the lifecycle and insert, in front of any step whose state is not
 * reached yet, the shortest bridge to it. Only plans that start from the create screen are
 * walked — an existing event's state is not known here. A step that cannot be reached from
 * where the plan is (a new version after the award) is left in place and named.
 */
export function bridgeLifecycle(input: PlanStep[], start?: string): { steps: PlanStep[]; repairs: string[] } {
  const repairs: string[] = [];
  if (start && start !== "none") return { steps: input, repairs };
  if (input[0]?.step !== "open_create") return { steps: input, repairs };
  const out: PlanStep[] = [];
  let state = "none" as LifeState;
  let hasBid = false;
  const add = (st: PlanStep, why: string) => {
    out.push(st);
    repairs.push(why);
    apply(st);
  };
  const apply = (st: PlanStep) => {
    const m = LIFE[st.step]?.makes;
    if (st.step === "place_bid" || st.step === "place_surrogate_bid") hasBid = true;
    if (st.step === "create_new_version") hasBid = false; // the old version's bids are read-only
    if (m) state = m;
  };
  for (const st of input) {
    const rule = LIFE[st.step];
    for (let guard = 0; rule && !rule.needs.includes(state) && guard < 8; guard++) {
      // the nearest state ahead that this step accepts; behind us means it cannot be reached
      const ahead = rule.needs.filter((n) => RANK[n] > RANK[state]).sort((x, y) => RANK[x] - RANK[y])[0];
      const wantsAward = !!ahead && (RANK[ahead] >= RANK.awarded || AWARDING.has(st.step));
      if (!ahead) {
        repairs.push(`note: ${st.step} cannot run on a ${state} event (it needs ${rule.needs.join(" or ")}) — left as written`);
        break;
      } else if (state === "editing") {
        add({ step: "publish" }, `added publish before ${st.step} — it needs a published event`);
        out.push({ step: "expect_published" });
      } else if (state === "published" && (ahead === "bid" || (wantsAward && !hasBid))) {
        add({ step: "place_surrogate_bid", args: { price: 100 } }, `added a surrogate bid before ${st.step} — an award needs a bid to allocate`);
      } else if (state === "published" || state === "bid") {
        add({ step: "close_event" }, `added close_event before ${st.step} — awarding opens once bidding has ended`);
      } else if (state === "closed") {
        add({ step: "award_event" }, `added award_event before ${st.step} — it needs an award`);
      } else if (state === "awarded") {
        add({ step: "create_po" }, `added create_po before ${st.step} — it checks the purchase orders the approved award creates`);
      } else {
        repairs.push(`note: ${st.step} cannot be reached from a ${state} event — left as written`);
        break;
      }
    }
    out.push(st);
    apply(st);
  }
  return { steps: out, repairs };
}
