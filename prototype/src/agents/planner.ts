import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat, llmMode } from "../ai/llm.js";
import { recall } from "../rag/knowledgeBase.js";
import { caseById, caseAsProse } from "../checks/testCatalog.js";
import { recordVocabularyGaps } from "./vocabularyGaps.js";

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

function loadCatalog(): { steps: StepSpec[]; names: string[] } {
  if (!existsSync(CATALOG_PATH)) {
    throw new Error(
      `the step vocabulary is missing at ${CATALOG_PATH} — run ` +
        "`npx tsx scripts/dump-plan-catalog.ts` in procol-ui-tests to publish it",
    );
  }
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

function catalogForPrompt(steps: StepSpec[]): string {
  return steps
    .map((s) => {
      const args = s.args
        ? " ARGS: " + Object.entries(s.args).map(([k, v]) => `${k} = ${v}`).join("; ")
        : " (no arguments)";
      return `- ${s.name}${s.assertion ? " [assertion]" : ""}: ${s.purpose}${args}`;
    })
    .join("\n");
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
const DEFAULT_VENDOR = process.env.UI_DEFAULT_VENDOR ?? "AMD";

const DOMAIN_RULES = `
First decide WHICH SCREEN the test is about:
- Is the SUBJECT of the test the events LIST itself — its rows, filters, tabs, sorting, search, or merely that the Create Event control is reachable? Then use open_events_list + expect_events_list and STOP. Do not add open_create, set_title or anything else: those act on a different screen, and a plan that opens the create screen to test the list passes while proving nothing.
- Otherwise use open_create and the ordering rules below. open_events_list is NOT a fallback for a test you cannot express: it is only for tests whose subject is the list. If the test is about something this vocabulary cannot do — a conversion popover, a query string, a new browser tab — build the closest plan you CAN out of the create-screen steps rather than substituting the list.

Combinations (the permutation map — pick the path that can actually reach what the case asks for):
- Auction STRATEGY (rank / price / traffic light) is chosen in the SINGLE-STAGE configuration drawer: open_create path "single-stage" then configure_single_stage{eventType:"auction", auctionSubtype, awarding}. There is no step that sets the strategy on an eRFX auction stage yet — say so in cannotExpress rather than substituting.
- Knockout and Dutch auctions exist ONLY through RFQ → Auction conversion: create and publish an RFQ (eRFX, compose_stages ["rfq"]), expect_published, then convert_to_auction. Never compose_stages ["rfq","auction"] — the screen forbids it.
- Awarding RULE (entire lot to one vendor vs line-item-wise across vendors) is set with configure_single_stage{awarding} on single-stage; on eRFX it is per stage and has no step yet.
- Bidding side: place_bid = the vendor from the supplier portal; place_surrogate_bid = the buyer on the vendor's behalf. Two competing vendors = two bid steps naming different vendors. Surrogate bids are not possible on knockout/dutch auctions or technical stages.
- Counter offer (buyer negotiates a vendor's bid): only after a vendor has bid — publish, place_bid (or place_surrogate_bid), open_master_qcs, then place_counter_offer{vendor, price}, then expect_counter_offer_sent. The vendor's ACCEPTANCE of a counter offer has no step yet — cannotExpress that part.
- A technical (RFP) stage never carries an auction strategy or a pricing sheet; RFQ and Auction never coexist on one eRFX screen.
- BOQ events: open_create path "boq"; line items are BOQ rows; still template-first.

Ordering the product enforces (violating any of these makes the run fail):
- open_create must come first on a CREATE test. Use path "erfx" unless the test explicitly says single-stage or non-eRFX: the eRFX screen is the one with stage tabs.
- compose_stages, switch_stage and expect_stages EXIST ONLY on the eRFX screen. The single-stage screen has no stage tabs — its event type is chosen in a configuration drawer — so never combine path "single-stage" with those steps.
- set_title is MANDATORY on every create test. Publishing without a title is refused, and the title is how a human finds the event afterwards. Include it even when the test case does not mention naming the event.
- The default stage is AUCTION. So: a test about an RFQ, a technical/RFP stage, or any two-stage event MUST call compose_stages. Only a plain auction test may omit it.
- compose_stages before anything stage-specific. The screen starts with ONE Auction stage; asking for RFQ or a technical stage is a real change. RFQ and Auction cannot coexist. At most two stages.
- select_template BEFORE add_line_items: the Items drawer is inert until a template is chosen.
- fill_sheet after add_line_items.
- On a technical (rfp) stage: fill_questionnaires AND assign_evaluator, or publish is refused.
- set_schedule before publish: the schedule looks set but is not committed until saved.
- invite_vendor before publish: an event with no participants is not a usable event.
- On a MULTI-STAGE event, every stage needs its own configuration on its own tab: switch_stage, then select_template, then fill_sheet (rfq/auction) or fill_questionnaires + assign_evaluator (rfp). A template applies only to the tab that is showing.
- Line items are project-level: add them once, on the first stage.
- NEVER invent a vendor name. Use a name only if the test case itself names one. When it just says "a vendor" or "two vendors", set count on invite_vendor and leave vendors out, and leave vendor out of the bid steps — the product's own audience supplies them.
- Bidding needs a PUBLISHED event: publish first, then bid.
- Two different things are called "bidding" and the test case tells you which:
  * the VENDOR bidding for themselves -> place_bid. It signs into the vendor portal, so the vendor must have been invited BY NAME: invite_vendor{vendors:["<name>"]}.
  * the BUYER bidding on a vendor's behalf (surrogate) -> place_surrogate_bid. It never leaves the console. Unavailable for knockout and dutch auctions and for technical stages.
- "on behalf of", "surrogate", "for the vendor" mean place_surrogate_bid. "as the vendor", "from the vendor portal", "from the supplier hub", "the vendor submits", "the vendor logs in" mean place_bid. If the test mentions bidding AT ALL, one of these two steps must be in the plan.
- Follow either with expect_bid_submitted when the test asserts the bid landed.
- Awarding comes AFTER bidding and needs at least one bid: award_event, then expect_awarded. There is nothing to award on an event nobody has bid on.
- Assertions go immediately after the step they check.
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
    if (!["expect_events_list", "expect_no_error", "expect_create_options", "expect_event_in_list", "expect_event_status"].some(has)) {
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
  if (!has("compose_stages") && /\brfq\b|technical|\brfp\b/i.test(testCase)) {
    const wanted: string[] = [];
    if (/technical|\brfp\b/i.test(testCase)) wanted.push("rfp");
    if (/\brfq\b/i.test(testCase)) wanted.push("rfq");
    steps.unshift({ step: "compose_stages", args: { stages: wanted } });
    repairs.push(`added compose_stages(${wanted.join(", ")}) — the screen defaults to an Auction stage, so this test would have run against the wrong stage`);
  }

  if (!has("open_create")) {
    steps.unshift({ step: "open_create", args: { path: "erfx" } });
    repairs.push("added open_create — every create test has to start somewhere");
  } else if (indexOf("open_create") !== 0) {
    // Present but not first. Every other step acts on the create screen, so
    // anything before it runs against whatever page happens to be open.
    const [open] = steps.splice(indexOf("open_create"), 1);
    steps.unshift(open);
    repairs.push("moved open_create to the front — the steps before it had no create screen to act on");
  }

  // configure_single_stage lives in the single-stage configuration drawer, so
  // the plan must open THAT screen, and the eRFX-only stage steps have nothing
  // to act on there. Decide the screen from the step the case really needs.
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

  // A negative test about PARTICIPANTS must not invite any. UI-PART-001 —
  // "publish is blocked with no participants" — compiled with invite_vendor
  // in it, so the plan disproved its own premise before pressing Publish.
  // (On this tenant the product audience adds vendors from the line items on
  // its own, which the step reports; that is the product's answer, not ours.)
  if (has("expect_publish_blocked") && has("invite_vendor") && /\b(no|without|zero|0)\s+(participants?|vendors?)\b/i.test(testCase)) {
    steps.splice(indexOf("invite_vendor"), 1);
    repairs.push("removed invite_vendor — the case is about publishing with no participants, so inviting any would defeat it");
  }

  // Vendor coherence. UI-AWD-001 invited five vendors by count, surrogate-bid
  // for whichever came first, then asserted the Master QCS grid lists "AMD" —
  // a vendor never invited. Whoever a later step names must be on the invite,
  // and a bid that names nobody should bid as the vendor the plan cares about.
  {
    const named = new Set<string>();
    for (const st of steps) {
      if (["open_master_qcs"].includes(st.step) && Array.isArray(st.args?.vendors)) for (const v of st.args!.vendors as unknown[]) named.add(String(v));
      if (["place_surrogate_bid", "place_bid", "place_counter_offer", "expect_counter_offer_sent"].includes(st.step) && st.args?.vendor) named.add(String(st.args.vendor));
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
      for (const st of steps) {
        if (["place_surrogate_bid", "place_bid"].includes(st.step) && !st.args?.vendor) {
          st.args = { ...(st.args ?? {}), vendor: first };
          repairs.push(`${st.step} now bids as ${first} — the vendor the plan's assertions are about`);
        }
      }
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
    if ((step.step === "place_bid" || step.step === "place_surrogate_bid") && step.args?.vendor) {
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
  if (wantsSurrogate && has("place_bid")) {
    steps[indexOf("place_bid")] = { step: "place_surrogate_bid", note: "the test asks the buyer to bid on the vendor's behalf" };
    repairs.push("swapped place_bid for place_surrogate_bid — the test asks the BUYER to bid for the vendor, which never leaves the console");
  }
  if (wantsVendorSide && !wantsSurrogate && has("place_surrogate_bid")) {
    steps[indexOf("place_surrogate_bid")] = { step: "place_bid", note: "the test asks the vendor to bid for themselves" };
    repairs.push("swapped place_surrogate_bid for place_bid — the test asks the VENDOR to sign in and bid");
  }
  if ((wantsSurrogate || wantsVendorSide) && !has("place_bid") && !has("place_surrogate_bid")) {
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
  if (has("save_draft")) {
    if (!has("select_template")) {
      steps.splice(indexOf("save_draft"), 0, { step: "select_template" });
      repairs.push("added select_template before save_draft — the app disables Save as draft until a template is chosen");
    }
    if (!has("add_line_items")) {
      steps.splice(indexOf("save_draft"), 0, { step: "add_line_items", args: { count: 1 } });
      repairs.push("added add_line_items before save_draft — Save as draft stays disabled at Items 0");
    }
  }

  // A nameless event is refused at publish, and the title is also how a human
  // finds the event afterwards.
  if (!has("set_title")) {
    const after = Math.max(indexOf("open_create"), indexOf("compose_stages"));
    steps.splice(after + 1, 0, { step: "set_title" });
    repairs.push("added set_title — publishing without a title is refused");
  }

  // The Items drawer is inert until a template exists.
  if (has("add_line_items") && !has("select_template")) {
    insertBefore("add_line_items", { step: "select_template" }, "added select_template — the Items drawer stays inert without one");
  }

  const stages = (steps.find((s) => s.step === "compose_stages")?.args?.stages as string[] | undefined) ?? [];
  const wantsTrade = !stages.length || stages.some((s) => s === "rfq" || s === "auction");
  const wantsTechnical = stages.includes("rfp");

  // A plan asserting publish is BLOCKED is deliberately incomplete — repairing
  // it into a valid event would remove the precondition under test.
  const submits = (has("publish") || has("save_draft")) && !has("expect_publish_blocked");
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
    if (wantsTrade && has("add_line_items") && !has("fill_sheet")) {
      const at = indexOf("expect_line_items") >= 0 ? indexOf("expect_line_items") + 1 : indexOf("add_line_items") + 1;
      steps.splice(at, 0, { step: "fill_sheet" });
      repairs.push("added fill_sheet — a pricing stage will not publish with an unfilled sheet");
    }
    if (wantsTechnical && !has("fill_questionnaires")) {
      insertBefore("publish", { step: "fill_questionnaires" }, "added fill_questionnaires — a technical stage will not publish with empty questionnaires");
    }
    if (wantsTechnical && !has("assign_evaluator")) {
      insertBefore("publish", { step: "assign_evaluator" }, "added assign_evaluator — a technical stage needs one");
    }
  }

  if (has("publish")) {
    if (!has("set_schedule")) insertBefore("publish", { step: "set_schedule" }, "added set_schedule — the schedule is displayed but not committed until saved");
    if (!has("invite_vendor")) insertBefore("publish", { step: "invite_vendor" }, "added invite_vendor — an event with no participants cannot be bid on");
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
    if (has("place_bid")) {
      const invite = steps.find((s) => s.step === "invite_vendor");
      const named = Array.isArray(invite?.args?.vendors) && (invite!.args!.vendors as unknown[]).length > 0;
      if (invite && !named) {
        invite.args = { ...(invite.args ?? {}), vendors: [DEFAULT_VENDOR] };
        repairs.push(
          `named ${DEFAULT_VENDOR} on invite_vendor — place_bid signs into the vendor portal, so the invited vendor cannot be whoever the audience happened to contain`,
        );
      }
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
  const written = input.trim().match(/^((?:UI|API)-[A-Z]+-\d+)$/i)?.[1];
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

export async function compileTestCase(testCase: string, moduleHint = "events"): Promise<CompileResult> {
  const catalog = loadCatalog();
  const warnings: string[] = [];
  /** The catalog id this came from, when it did — the gap ledger keys on it. */
  let resolvedId: string | null = null;

  // "FE-9.7" is a reference, not a test case. Resolve it before planning.
  const resolved = resolveCaseId(testCase);
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
  try {
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

  const prompt = [
    `STEP CATALOG:\n${catalogForPrompt(catalog.steps)}`,
    DOMAIN_RULES,
    expectations.length ? `WHAT THE RULES SAY ABOUT THIS AREA:\n${expectations.map((e) => `- ${e}`).join("\n")}` : "",
    experience.length ? `WHAT HAS BROKEN HERE BEFORE (worth asserting):\n${experience.map((e) => `- ${e}`).join("\n")}` : "",
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
      raw = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], {
        // The compiler is where a wrong answer becomes a wrong run — it gets the
        // strongest model the gateway has, at that model's price.
        tier: "reason",
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
      recordVocabularyGaps(resolvedId ?? testCase.match(/^\s*((?:UI|API|FE|BE)-[A-Z]*-?[\w.]+)/)?.[1] ?? testCase.slice(0, 80), gaps);
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

  const linted = lintPlan({ title: String(parsed.title ?? testCase.slice(0, 60)), steps }, testCase);
  warnings.push(...linted.repairs);

  const gaps = declaredGaps;
  let coverage: CompileResult["coverage"] =
    parsed.coverage === "none" ? "none" : parsed.coverage === "partial" || gaps.length ? "partial" : "full";
  // A model that lists gaps but claims full coverage is contradicting itself;
  // the gaps are the more specific claim, so they win.
  if (coverage === "full" && gaps.length) coverage = "partial";
  if (coverage !== "full") {
    warnings.push(
      coverage === "none"
        ? `cannot test this case yet — no step can observe: ${gaps.join("; ") || "its subject"}`
        : `can only test part of this — no step for: ${gaps.join("; ")}`,
    );
  }
  // The ledger is keyed by case id whenever there is one — the dashboard hands
  // over the case's prose, which begins with its id — and reconciled on every
  // compile, so a gap that has since been built disappears from the list.
  const ledgerKey = resolvedId ?? testCase.match(/^\s*((?:UI|API|FE|BE)-[A-Z]*-?[\w.]+)/)?.[1] ?? testCase.slice(0, 80);
  recordVocabularyGaps(ledgerKey, coverage === "full" ? [] : gaps.length ? gaps : ["(unspecified)"]);

  return {
    plan: linted.plan,
    reasoning: String(parsed.reasoning ?? ""),
    context: { expectations, experience },
    source: "llm",
    warnings,
    coverage,
    gaps,
  };
}
