import { Page, expect, test, type Locator } from "@playwright/test";
import { EventsPage } from "../pages/EventsPage.js";
import { BasePage } from "../pages/BasePage.js";
import { NotOnEventError, VendorPortalPage } from "../pages/VendorPortalPage.js";
import { recordStuck } from "../oracle/stuck.js";
import { CounterOfferPage } from "../pages/CounterOfferPage.js";
import { SurrogateBidPage } from "../pages/SurrogateBidPage.js";
import { AwardPage } from "../pages/AwardPage.js";
import { bidsOfEventGroup, eventGroupByTitle, ordersOfEventGroup, type DbOrder } from "../db/verifyRows.js";
import { decodeProcolId } from "../crosscheck/ids.js";
import { vendorNames, vendorCount } from "../master/params.js";
import { CreateEventPage, ProductInput, StageKey } from "../pages/CreateEventPage.js";
import { EventDetailPage } from "../pages/EventDetailPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { generateEventTitle } from "../helpers/data.js";
import { buildProducts } from "../master/params.js";
import { WidgetConfig } from "../helpers/inlineSheet.js";
import { PlanStep, STEP_CATALOG, TestPlan } from "./steps.js";
import { runGenericStep } from "./generic/run.js";
import { toastMark, appMessagesSince } from "./generic/messages.js";
import { appRuleFor, recoveryFor, recoveryWith, type AppRule } from "../oracle/appRules.js";
import type { Target } from "./generic/find.js";
import { qaVendorNames, qaVendorLogins, vendorLogins, isQaVendorName, allowRealVendors } from "../db/qaVendors.js";
import { runExpectationStep } from "./expectations.js";
import { runQcsAudienceStep } from "./qcsAudienceSteps.js";
import { installObserver, observe, shareObserver, type Observation, type ScreenRecord } from "./observe.js";
import { screenInventory } from "./inventory.js";
import { installSpotlight, beginStep, stepShots, stepActions, spotlightVerify, spotlightMap, type SpotShot, type StepAction } from "./spotlight.js";
import { mkdirSync as mkdirInv, writeFileSync as writeInv } from "node:fs";
import { join as joinInv, dirname as dirnameInv } from "node:path";
import { fileURLToPath as fileUrlInv } from "node:url";
import { resolveScreen, type PlanContext } from "./screens.js";
import { CONFIG, NAV } from "../config.js";
import { sideFrames } from "../support/liveCursor.js";
import { askTester, SAYS_STOP, mask } from "../explore/ask.js";
import { explore, hasRoute, keepRouteAs, saveHandRoute } from "../explore/explorer.js";
import { earlierAnswer, failedVendorEmails, learnAnswer, learnVendorLogin, learnedVendorLogins } from "../support/learnedStore.js";
import { invitedVendorNames } from "../db/eventAudience.js";
import { lookUpVendor, vendorNameForEmail } from "../support/vendorDirectory.js";
import { controlHeld, handedBackAt, handPart, released, takeHandSteps, pendingTold, takeTold } from "../support/liveControl.js";
import { needOf, roundNow, cannotTakeBid, takesBid, evaluationEvents, eventRoute, stagesOfEvent, usersNamed, responsesOf } from "../db/pickEvent.js";
import { loginAsCompany, signInUser, type SignedIn } from "../db/dbLogin.js";
import { orchestrate } from "../support/orchestrator.js";
import { EvaluationPage } from "../pages/EvaluationPage.js";
import { runEventMenuStep, type EventMenuState } from "./eventMenuSteps.js";
import { MasterQcsPage } from "../pages/MasterQcsPage.js";
import { amountLabels, cellAt, lineBlocks, qcsNumber, rowLabels, vendorIndex } from "./qcsModel.js";
import { fillRequiredFields, fillWhatTheAppNamed, sweepSaid, MANDATORY_SAID, type SweepResult } from "../support/requiredFields.js";

/** The QA vendors invite_vendor put on this run's event (one plan per process). */
/** The vendors on the event, as invite_vendor last saw them — who a bid step may sign in as. */
let invitedVendors: string[] = [];
/** invitedVendors was read from the database (everyone invited), not from the create screen's chips. */
let invitedFromDb = false;
/** Who has already bid from the vendor portal in this plan — the next bid picks someone else. */
let biddersUsed: string[] = [];
/** The rows ("<name>-<email>") the buyer entered a surrogate bid for in this plan — not portal bidders. */
let surrogateFor: string[] = [];
const QA_EMAIL = /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i;

/**
 * Who the vendor portal is signed in as: a vendor that is ON the event.
 *
 * The names come from the event's participant chips (invite_vendor records
 * them) and are matched to this client's vendors that have a login, in the
 * database. The profile's own vendor is preferred when it is among them.
 * With SPINE_QA_VENDORS_ONLY=1 it is the client's QA test vendor instead.
 */
async function bidderEmail(want?: unknown): Promise<string> {
  // Used: a vendor that already bid from the portal in this plan, or one the buyer surrogate-bid for (signing in as
  // that vendor only offers "Revise Quote" on the buyer's bid — 27 Oct, VB06).
  const used = (e: string) =>
    biddersUsed.some((u) => u.toLowerCase() === e.toLowerCase()) || surrogateFor.some((t) => t.toLowerCase().includes(e.toLowerCase()));
  // The vendors this run may sign in as, in a fixed order: the profile's own
  // vendor first (as before), then the rest of the event's vendors with a login.
  let pool: Array<{ name: string; email: string }>;
  if (!allowRealVendors()) {
    const qa = await qaVendorLogins();
    const invited = qa.filter((v) => invitedVendors.some((n) => isQaVendorName(n, [v.name])));
    pool = invited.length ? invited : qa.slice(0, 1);
    if (!pool.length) throw new Error("this client has no QA test vendor to sign in as on the vendor portal; create one, or leave SPINE_QA_VENDORS_ONLY unset to bid as a vendor on the event");
  } else if (!invitedVendors.length) {
    // No invite step recorded who is on the event: the profile's vendor, as before.
    pool = [{ name: "the profile's vendor", email: CONFIG.vendorEmail }];
  } else {
    // The client's vendors with a login (the database), plus logins earlier runs
    // learned (the Vendors module, or the tester) — minus ones that failed before.
    const cid = Number(process.env.COMPANY_ID) || null;
    const failed = failedVendorEmails(cid);
    const known = [...(await vendorLogins()), ...learnedVendorLogins(cid).map((v) => ({ name: v.name, email: v.email }))];
    const logins = known.filter((v, i) => !failed.has(v.email.toLowerCase()) && known.findIndex((x) => x.email.toLowerCase() === v.email.toLowerCase()) === i);
    const onEvent = logins.filter((v) => invitedVendors.some((n) => sameVendor(n, v.name)));
    const own = onEvent.filter((v) => v.email.toLowerCase() === CONFIG.vendorEmail.toLowerCase());
    pool = [...own, ...onEvent.filter((v) => !own.includes(v))];
    if (!pool.length) {
      throw new Error(
        `none of the vendors on the event (${invitedVendors.slice(0, 5).join(", ")}${invitedVendors.length > 5 ? ", …" : ""}) ` +
          "has a user this run can sign in to the vendor portal as",
      );
    }
  }
  const who = (p: typeof pool) => p.map((v) => v.name).slice(0, 5).join(", ");
  // vendor: 2 — the second vendor of the pool; vendor: "<name>" — that vendor.
  if (typeof want === "number" || /^\d+$/.test(String(want ?? ""))) {
    const n = Number(want);
    const pick = pool[n - 1];
    if (!pick) throw new Error(`a bid as vendor ${n} needs ${n} vendors on the event that can sign in to the vendor portal — there ${pool.length === 1 ? "is 1" : `are ${pool.length}`} (${who(pool)})`);
    return pick.email;
  }
  if (want) {
    const pick = pool.find((v) => isQaVendorName(String(want), [v.name]) || v.name.toLowerCase().includes(String(want).toLowerCase()));
    if (!pick) throw new Error(`${String(want)} is not among the vendors on the event that can sign in to the vendor portal (${who(pool)})`);
    return pick.email;
  }
  // No vendor named: the next one that has not bid yet, so two bid steps are two vendors.
  const pick = pool.find((v) => !used(v.email));
  if (!pick) {
    throw new Error(
      `a bid from another vendor needs one more vendor on the event that can sign in to the vendor portal — ` +
        `${pool.length === 1 ? "the only one" : `all ${pool.length}`} (${who(pool)}) already bid in this run` +
        (allowRealVendors() ? "" : ". This run uses QA test vendors only (SPINE_QA_VENDORS_ONLY=1), so it does not sign in as a real vendor"),
    );
  }
  return pick.email;
}

/**
 * The same vendor company: equal names, or a chip cut short ("360 DEGREE
 * IMAGE…") that the name starts with. Substring matching made the invited
 * vendor "12" stand for "API-BESTQ_1782294512931" and "testsasvendor123@…",
 * and the bid signed in as a vendor that was never invited (15 Oct).
 */
function sameVendor(shown: string, name: string): boolean {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const a = norm(shown);
  const b = norm(name);
  if (!a || !b) return false;
  if (a === b) return true;
  const cut = a.match(/^(.{6,}?)\s*(?:…|\.{2,3})$/);
  return !!cut && b.startsWith(cut[1]);
}

/** A surrogateFor row ("<name>-<email>", cut at 40) → the vendor's name as Procol's grids show it. */
function rowName(row: string): string {
  const t = row.trim();
  const dash = t.indexOf("-");
  if (dash < 0) return t;
  // "samplevendor@vendortestt.co-samplevendor": the name IS the email, before the dash.
  if (t.indexOf("@") >= 0 && t.indexOf("@") < dash) return t.slice(0, dash).trim();
  return t.replace(/-[^-]*@.*$/, "").trim();
}

/**
 * Whom award_event allocates to: a vendor name as given, or what a case says in words —
 * "lowest" (Rank 1 on Master QCS, else the lowest rate), "surrogate" (the vendor the buyer bid for in this plan),
 * "portal" (a vendor who bid from the vendor portal: on the grid, and not one the buyer bid for).
 */
async function awardVendor(s: RunState, want: string | undefined): Promise<string | undefined> {
  if (!want) return undefined;
  const w = want.trim().toLowerCase();
  const surrogateNames = surrogateFor.map(rowName).filter(Boolean);
  if (/^(surrogate|the surrogate vendor|surrogate vendor)$/.test(w)) return surrogateNames[0] ?? want;
  if (!/^(lowest|lowest bidder|l1|rank 1|cheapest|portal|portal vendor|direct|the portal vendor)$/.test(w)) return want;
  await new AwardPage(s.page).openMasterQcs().catch(() => false);
  const g = await new MasterQcsPage(s.page).read().catch(() => null);
  if (!g?.vendors.length) throw new Error(`the award is for “${want}”, but Master QCS shows no vendor columns to choose from`);
  if (/portal|direct/.test(w)) {
    const pick = g.vendors.find((v) => !surrogateNames.some((n) => n && (v.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(v.toLowerCase()))));
    if (!pick) throw new Error(`no vendor on Master QCS bid from the vendor portal (the buyer bid for ${surrogateNames.join(", ") || "nobody"})`);
    console.log(`[award] “${want}” → ${pick}`);
    return pick;
  }
  const labels = rowLabels(g);
  const rank = labels.find((l) => /^rank$/i.test(l.trim()));
  const rate = amountLabels(labels, {}).rate;
  for (const b of lineBlocks(g)) {
    const r = rank ? b.rows.find((x) => x.label === rank) : undefined;
    const i = r ? r.cells.findIndex((c) => qcsNumber(c) === 1) : -1;
    if (i >= 0) {
      console.log(`[award] “${want}” → ${g.vendors[i]} (Rank 1 on Master QCS)`);
      return g.vendors[i];
    }
    const rr = rate ? b.rows.find((x) => x.label === rate) : undefined;
    if (rr) {
      const vals = rr.cells.map((c) => qcsNumber(c));
      const best = Math.min(...vals.filter((v): v is number => v !== null));
      const j = vals.indexOf(best);
      if (j >= 0) {
        console.log(`[award] “${want}” → ${g.vendors[j]} (lowest ${rate}: ${best})`);
        return g.vendors[j];
      }
    }
  }
  throw new Error(`the award is for “${want}”, but Master QCS shows no Rank or rate to tell who that is`);
}

/** bidderEmail ran out: no vendor on the event this run can sign in as (yet). */
const NO_LOGIN = /needs one more vendor|has a user this run can sign in|needs \d+ vendors on the event/;

/**
 * Another vendor to bid as, when the ones this run knows have all bid.
 *
 * Aanya's order (15 Oct): ask the tester for a vendor's login; when they don't
 * know, look the event's vendor up in the Vendors module and use its email —
 * the vendor portal takes the inviting buyer's UAT login code. With nobody to
 * ask (a run not started from the dashboard) it looks up straight away.
 */
async function anotherVendor(s: RunState, why: string): Promise<{ email: string; name: string; source: string }> {
  const cid = Number(process.env.COMPANY_ID) || null;
  const failed = failedVendorEmails(cid);
  const tried = new Set(biddersUsed.map((e) => e.toLowerCase()));
  const fresh = (e: string) => !tried.has(e.toLowerCase()) && !failed.has(e.toLowerCase());
  const names = invitedVendors.filter((n) => n && !/^\+/.test(n.trim()));
  const a = await askTester({
    kind: "question",
    question: "I need another vendor to bid as, and I don't have a login for one. Which vendor should I sign in as?",
    detail:
      `${why.replace(/\.$/, "")}. The vendor portal takes the buyer's UAT login code, so a vendor's email is enough — type one, or let me look one up.` +
      (names.length ? ` Vendors on this event: ${names.slice(0, 4).join(", ")}.` : ""),
    options: [
      { id: "lookup", label: "Look it up in the Vendors module for me" },
      { id: "stop", label: "Stop here" },
    ],
  });
  if (a && (a.option === "stop" || (!a.option && SAYS_STOP.test(a.text)))) throw new Error("no other vendor to bid as, and you chose to stop here");
  const typed = a && !a.option ? a.text.trim() : "";
  const mail = typed.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0];
  if (mail) {
    const name = (await vendorNameForEmail(s.page, mail).catch(() => null)) ?? mail;
    console.log(`[bid] signing in as the vendor you gave — ${mail}${name !== mail ? ` (${name})` : ""}`);
    return { email: mail, name, source: "tester" };
  }
  // "idk", "look it up", the option, or nobody to ask: look the event's vendors up.
  // A vendor name typed instead is looked up first.
  const dontKnow = !a || a.option === "lookup" || /\b(idk|i ?do ?n'?t know|not sure|no idea|look (?:it )?up|find (?:it|one)|you find)\b/i.test(typed);
  const lookFor = !dontKnow && typed ? [typed, ...names] : names;
  if (!a) console.log("[bid] nobody to ask (the run was not started from the dashboard) — looking a vendor up in the Vendors module");
  for (const n of lookFor) {
    const v = await lookUpVendor(s.page, n).catch(() => null);
    if (v && fresh(v.email)) return { email: v.email, name: n, source: "vendors-module" };
  }
  throw new Error(
    `no other vendor to bid as — ${lookFor.length ? `none of ${lookFor.slice(0, 4).join(", ")} is in the Vendors module with an email this run has not already used` : "the event shows no other vendor's name to look up"}`,
  );
}

/** "AMD is a real supplier, so …" — said when a named real supplier was swapped for the client's QA vendors. */
const swapNote = (real: string[]) =>
  real.length ? `${real.join(", ")} ${real.length === 1 ? "is a real supplier" : "are real suppliers"}, so the client's QA test vendor was invited instead — ` : "";

/**
 * THE PLAN EXECUTOR — runs a compiled test case.
 *
 * Every branch here delegates to the same page-object method a hand-written
 * journey calls, so a planned test is not a second-class citizen: it gets the
 * healed locators, the verification, the "prove it worked" assertions and the
 * Oracle's evidence collection, identically.
 *
 * State is threaded through the run (the chosen template's widgets, how many
 * line items were added) because later steps genuinely need what earlier ones
 * learned — filling the sheet requires the schema the template returned.
 */

export interface StepResult {
  step: string;
  args?: Record<string, unknown>;
  status: "ok" | "failed" | "skipped";
  detail?: string;
  /** done by the tester in the browser (take control), not by the run: never counted as tested */
  byHand?: boolean;
  /** no step for it and not done (skipped, or nobody answered the run's question): not tested */
  untested?: boolean;
  /** For generic steps: which locator strategy found the element (role+name, label, text, healer…). */
  strategy?: string;
  /** the step itself failed; the tester said how to finish it and the run did that on the same screen */
  continuedAsTold?: string;
  ms: number;
  /** What the person would have seen when this step failed or was recovered. */
  evidence?: {
    screenshot?: string;
    url?: string;
    /** the app's own words while the step ran (toasts, inline errors) */
    appSaid?: string[];
    /** the app rule those words come from, from its code (oracle/appRules.json) */
    rule?: { message: string; source: string; condition?: string };
  };
  /** The run broke one of the app's rules by its own setup, satisfied it, and retried. */
  recovered?: { appSaid: string; rule: string; why: string; did: string[] };
  /** What was on screen after the step, in words (observe.ts) — kept for every step instead of a picture. */
  screen?: ScreenRecord;
  /** What the step did, action by action, in words (spotlight.ts stepActions). */
  actions?: StepAction[];
  /** The spotlight pictures taken during this step: each action framed, each assertion verified (spotlight.ts). */
  spotlights?: SpotShot[];
}

export interface PlanResult {
  title: string;
  steps: StepResult[];
  passed: boolean;
  /** how many steps the tester did by hand — the run is then only partly tested, never passed */
  byHand?: number;
  /** how many parts had no step and were not done (ask_tester skipped or unanswered) — partly tested */
  untested?: number;
  /** The observation pass: what the runner saw on each screen it visited (observe.ts). */
  observations?: Observation[];
}

/** ask_tester parts handed to the explorer in this run (each gets its own evidence folder). */
let gapCount = 0;

interface RunState {
  /** the tester did part of this run by hand: a later step's work may already be in Procol */
  handDone?: boolean;
  /** set by place_surrogate_bid when Procol already holds what it was about to enter (done by hand) */
  alreadyByHand?: string;
  /** the case asserts a refusal: nothing is filled for it that it did not ask for */
  negativeCase?: boolean;
  /** set by runStep when the tester had already done this step in the browser */
  didByHand?: boolean;
  /** set by ask_tester when a part with no step was not done: why, in words */
  notTested?: string;
  /** the tester was already asked about this failure and chose to stop: the step's failure is not asked about again */
  noHold?: boolean;
  /** what the event-menu steps did (a withdrawal, price caps) */
  menuState?: EventMenuState;
  /** The screen a failed step was really on (the vendor's page, for a bid), used as the step's evidence. */
  failObservation?: Observation;
  events: EventsPage;
  create: CreateEventPage;
  single: SingleStagePage;
  page: Page;
  title: string;
  widgets: Record<string, WidgetConfig>;
  products: ProductInput[];
  lineItemsAdded: number;
  /** purchase orders read back after create_po */
  orders?: DbOrder[];
  /**
   * Whether a bid has been placed in this plan, so `expect_bid_submitted` can
   * tell "the bid failed" from "no bid was ever attempted" — a plan that
   * asserts a submission it never made should say so rather than pass.
   */
  bidSubmitted: boolean;
  /** Vendors already surrogate-bid for, so a second bid picks a different one. */
  surrogateBids: string[];
  /** Each surrogate bid this run typed: whom for, at what price — what a QCS cell is compared with when no API value exists. */
  typedBids: Array<{ vendor: string; price: number }>;
  /** Bids placed from the vendor portal in this plan: who signed in, the unit price typed, when. */
  portalBids?: Array<{ email: string; price: number; at: number }>;
  /** Vendors the case named that the participants search did not know (invite_vendor): never on the round. */
  unmatchedVendors: string[];
  /** The events-list tab filter_events chose (Drafts, History, …): a later search must keep it. */
  listTab?: string;
  /** Whether an award has been submitted, so expect_awarded can tell. */
  awarded: boolean;
  /** The template select_template applied, for expect_template_selected. */
  templateName?: string;
  /** Whether a counter offer went out in this plan, so the assertion can tell. */
  counterOfferSent?: boolean;
  /** Whether close_event ended the stage in this plan. */
  closed?: boolean;
  /** Whether the vendor accepted the counter offer in this plan. */
  counterOfferAccepted?: boolean;
  /** evaluate_technical scored and submitted the technical stage */
  evaluated?: boolean;
  /** which stage each surrogate bid in surrogateBids went to */
  surrogateStage?: Map<string, "technical" | "pricing">;
  /** remember{} values for expect_remembered (generic steps). */
  memory: Record<string, { target: Target; text: string }>;
  /** The steps still to come — what an event picked for open_event must be ready for. */
  later?: string[];
  /** the whole plan's steps: choose_stages adds each picked stage's steps right after itself */
  planSteps?: PlanStep[];
  /** the purchase request this run made its event from */
  prNo?: string;
  /** how many of that PR's line items were ticked (select_pr{items}) */
  prItems?: number;
  /** the steps after the current one, with their arguments (what an evaluation case reads) */
  laterPlan?: PlanStep[];
  /** The event open_event picked from the Live list (the case named none and the plan built none). */
  picked?: string;
  /** the picked event was chosen for an evaluation: its technical window is already over */
  pickedForEvaluation?: boolean;
  /** Events an earlier attempt failed on: the tester chose another event, so the next pick passes them over. */
  avoidEvents?: string[];
  /** Those attempts, in words — said under open_event once another event is picked. */
  attempts?: string[];
  /** Toast-journal marks: before the previous step, and before this one. */
  prevMark: number;
  curMark: number;
  /** The locator strategy the last generic step reported. */
  lastStrategy?: string;
  /** What the API built for this case, when its state was set up by API. */
  context: PlanContext;
  /** 1-based number of the step running now (evidence file names). */
  stepNo: number;
  /** The project id this plan published, so returning to it is a route, not a search. */
  projectId?: string;
  /** The app refused an EARLIER step (e.g. the configuration drawer would not save) — a later
   *  block assertion judges this refusal instead of a publish that can no longer be reached. */
  earlyRefusal?: string;
}

const asInt = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/**
 * The app's words name the case's reason when every meaningful word of the reason is in them.
 * A plan paraphrases the app (21 Oct, A22: "Please add Evaluator in the Technical Stage" against
 * the app's "Please add Evaluator to all the line items in the Technical Stage"), and a whole-
 * phrase match failed a refusal that was exactly the one the case asked for.
 */
const REASON_FILLER = new Set(["a", "an", "the", "to", "in", "on", "of", "for", "and", "or", "is", "be", "please", "all", "any", "this", "that"]);
function namesReason(said: string, because: string): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !REASON_FILLER.has(w));
  const have = new Set(words(said));
  const want = words(because);
  return want.length > 0 && want.every((w) => have.has(w) || have.has(w.replace(/s$/, "")) || have.has(`${w}s`));
}
/**
 * Procol checks participants before the template and the products (projectCreation.jsx:1607):
 * with no template or no product the Participants control stays locked, so "Please add
 * participants to proceed!" IS the refusal a no-template / no-line-item case gets (A18, A19).
 */
const PARTICIPANTS_FIRST = /please add participants/i;
const BEFORE_PARTICIPANTS = /\b(template|line items?|products?)\b/i;
const participantsFirstNote = (because: string): string =>
  ` — Procol checks participants first: with no ${because.toLowerCase().replace(/^please\s+/, "")} the Participants control stays locked, so this is the refusal the case expects`;

const asStages = (v: unknown): StageKey[] => {
  const valid: StageKey[] = ["rfp", "rfq", "auction"];
  const arr = Array.isArray(v) ? v : [];
  return arr.map((s) => String(s).toLowerCase()).filter((s): s is StageKey => valid.includes(s as StageKey));
};


/**
 * Is the plan on the SINGLE-STAGE create screen?
 *
 * That screen has no stage tabs, no Manage Line Items drawer and no Items
 * badge: its type is chosen in a drawer, its template is the Buy template,
 * its line item is typed straight into the sheet, and its participants and
 * publish have their own controls. The same step names mean the same thing
 * to a person on either screen, so the executor dispatches them here rather
 * than making the compiler learn two vocabularies.
 */
function onSingleStage(s: RunState): boolean {
  const url = s.page.url();
  return /singleStage=true/i.test(url) && !/\/project\//.test(url);
}

/**
 * The single-stage create screen, recognised by what it shows ("Event Type" + the
 * "Select Templates" picker, no stage tab strip) as well as by its address — the
 * address alone missed it, and the eRFX steps then "succeeded" while doing nothing.
 */
/** A refusal the dashboard's catalog does not list but that says something is mandatory: the client's own rule. */
function mandatoryRefusal(said: string[], step: string): { t: string; rule: AppRule } | null {
  // Only on the buyer's create screen: a vendor's or an evaluator's form is filled by its own step.
  if (!CREATE_SCREEN_STEP.test(step)) return null;
  const t = said.find((x) => MANDATORY_SAID.test(x));
  return t ? { t, rule: { message: t, source: "a field this client makes mandatory", via: "screen" } } : null;
}

/** The sheet's required cells still empty, each filled by whatever kind of value it takes (fillRequiredCellAnyway). */
async function fillEmptyRequiredCells(s: RunState): Promise<SweepResult> {
  const out: SweepResult = { filled: [], left: [] };
  for (const c of await s.create.emptyRequiredSheetCells().catch(() => [])) {
    const v = await s.create.fillRequiredCellAnyway(c.row, c.key).catch(() => null);
    if (v) out.filled.push({ field: `sheet “${c.column}” (line ${c.row})`, value: v });
    else out.left.push(`sheet “${c.column}” (line ${c.row})`);
  }
  return out;
}

async function isSingleStageScreen(s: RunState): Promise<boolean> {
  if (onSingleStage(s)) return true;
  const url = s.page.url();
  if (/\/project\//.test(url)) return false;
  // /orders/quick-create serves BOTH create screens, so the address proves nothing here.
  // By content: "Event Type" + "Publish Event", and NOT the eRFX screen's "Save as draft"
  // (both screens show a "Select Templates" picker, so that alone proves nothing).
  const eventType = await s.page.getByText(/^Event Type$/).first().isVisible().catch(() => false);
  const publishEvent = await s.page.getByRole("button", { name: /^publish event$/i }).first().isVisible().catch(() => false);
  const saveDraft = await s.page.getByRole("button", { name: /save as draft/i }).first().isVisible().catch(() => false);
  return eventType && publishEvent && !saveDraft;
}

/**
 * The Reschedule Event dialog (event Settings → "Reschedule Event", offered only while the
 * event is UPCOMING) — client-dashboard views/orderDetails/rescheduleEventModal.jsx:
 *   • "Make Order Live At" = an antd-3 DatePicker (format "Do MMM YYYY", days before today
 *     disabled) + TimePicker ("hh:mm a", 5-minute steps);
 *   • "Delivery Date" / "Pickup Date" picker only when the event has one;
 *   • the field's own help text is the refusal: "Scheduled time is invalid!" (in the past) or
 *     "Schedule time should be on or before Delivery Date"; Ok does nothing while it shows;
 *   • buttons are Cancel / Ok (there is no "Save Schedule" here — that is the create screen).
 * The new end keeps the round's length (end − start) — the API read-back checks that.
 */
const pad2 = (n: number) => String(n).padStart(2, "0");
const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayWords = (t: Date) => `${ordinal(t.getDate())} ${MONTHS.at(t.getMonth())} ${t.getFullYear()}`;
const timeWords = (t: Date) => `${pad2(t.getHours() % 12 || 12)}:${pad2(t.getMinutes())} ${t.getHours() < 12 ? "am" : "pm"}`;
/** "+2h", "-30m", "+1d", "now" → a time; minutes rounded UP to the picker's 5-minute step. */
function relTime(spec: unknown, base = new Date()): Date {
  const m = /^\s*(now)?\s*([+-])?\s*(\d+)?\s*(m|min|minutes?|h|hours?|d|days?)?\s*$/i.exec(String(spec ?? "+1h"));
  const t = new Date(base);
  if (m && m[3]) {
    const n = Number(m[3]) * (m[2] === "-" ? -1 : 1);
    const unit = (m[4] ?? "m").toLowerCase()[0];
    t.setTime(t.getTime() + n * (unit === "d" ? 864e5 : unit === "h" ? 36e5 : 6e4));
  }
  const step = 5 * 6e4;
  t.setTime(Math.ceil(t.getTime() / step) * step);
  return t;
}
/** "5th Oct 2026" + "02:11 pm" (the dialog's own formats) → a local time. */
function parseDialogTime(day: string, time: string): Date | null {
  const d = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})\s+(\d{4})$/.exec(day);
  const t = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(time);
  if (!d || !t) return null;
  const month = MONTHS.findIndex((m) => m.toLowerCase() === d[2].toLowerCase());
  if (month < 0) return null;
  let h = Number(t[1]) % 12;
  if (/pm/i.test(t[3] ?? "")) h += 12;
  if (!t[3]) h = Number(t[1]);
  return new Date(Number(d[3]), month, Number(d[1]), h, Number(t[2]), 0, 0);
}
async function rescheduleEvent(s: RunState, a: Record<string, unknown>): Promise<string> {
  const page = s.page;
  const dialog = page.locator(".ant-modal-content").filter({ hasText: /Reschedule Event/i }).filter({ visible: true }).first();
  const openDialog = async () => {
    // The Settings menu can fade shut between being read and being clicked (hover trigger),
    // so open it and click the item straight away, up to three times.
    let offered = "";
    for (let attempt = 1; attempt <= 3 && !(await dialog.isVisible().catch(() => false)); attempt++) {
      offered = (await runStep(s, { step: "open_event_settings" })) ?? "";
      if (!/Reschedule Event/i.test(offered)) throw new Error(`"Reschedule Event" is not in the Settings menu (${offered}) — it is offered only while the event is upcoming`);
      if (/Reschedule Event \(disabled\)/i.test(offered)) throw new Error(`"Reschedule Event" is disabled in the Settings menu (${offered})`);
      const item = page.locator(".ant-dropdown:not(.ant-dropdown-hidden) [role='menuitem']").filter({ hasText: /^\s*Reschedule Event\s*$/i }).filter({ visible: true }).first();
      const clicked = await item.click({ timeout: 3_000 }).then(() => true).catch(() => item.dispatchEvent("click", undefined, { timeout: 2_000 }).then(() => true).catch(() => false));
      if (clicked) await dialog.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
      else await page.mouse.move(5, 5).catch(() => {});
    }
    if (!(await dialog.isVisible().catch(() => false))) throw new Error(`the Reschedule Event dialog did not open after three tries (${offered}) — not evidence about the product`);
    };
  if (!(await dialog.isVisible().catch(() => false))) await openDialog();
  if (process.env.UI_DUMP_DIALOG) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.UI_DUMP_DIALOG, (await dialog.evaluate((el) => el.outerHTML).catch(() => "")) || "");
  }
  const wantRefused = /^refus|^reject|^block/i.test(String(a.expect ?? ""));
  const notes: string[] = [];
  // The Settings dropdown fades out over the dialog and the modal zooms in, so a plain click
  // can lose to "another element intercepts pointer events"; retry, then click through.
  const clickInDialog = async (target: ReturnType<typeof dialog.locator>) => {
    try {
      await target.click({ timeout: 4_000 });
    } catch (e) {
      if (process.env.UI_DUMP_DIALOG) console.log(`[reschedule] plain click lost: ${String((e as Error).message).split("\n").filter((l) => /intercept|not visible|not stable|waiting/.test(l)).slice(0, 3).join(" | ")}`);
      await target.click({ timeout: 4_000, force: true });
    }
  };
  // NEVER Escape here: antd's Modal closes on Escape (and Cancel resets the fields). A click on
  // the dialog's own title is "outside" every picker popup, so it closes them and nothing else.
  const closePopups = async () => {
    await dialog.locator(".ant-modal-title").first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(200);
  };
  const fieldHelp = async () => ((await dialog.locator(".ant-form-explain, .ant-form-item-explain").first().innerText().catch(() => "")) || "").trim();
  const openPopup = (sel: string) => page.locator(sel).filter({ visible: true }).last();

  // pick a calendar day by typing it into the open panel's own input (antd 3: the field
  // itself is read-only); a disabled day leaves the panel input marked invalid.
  const pickDay = async (picker: ReturnType<typeof dialog.locator>, when: Date): Promise<"ok" | "disabled"> => {
    await clickInDialog(picker.locator("input").first());
    const panelInput = openPopup(".ant-calendar-picker-container .ant-calendar-input");
    await panelInput.waitFor({ state: "visible", timeout: 8_000 });
    await panelInput.fill(dayWords(when));
    await page.waitForTimeout(150);
    const invalid = await page.locator(".ant-calendar-picker-container .ant-calendar-input-invalid, .ant-calendar-picker-container .ant-calendar-input.has-error").filter({ visible: true }).count().catch(() => 0);
    if (invalid) {
      await closePopups();
      return "disabled";
    }
    await panelInput.press("Enter").catch(() => {});
    await page.locator(".ant-calendar-picker-container").filter({ visible: true }).first().waitFor({ state: "hidden", timeout: 3_000 }).catch(closePopups);
    // read the field back: a pick that did not commit must not be reported as set
    const shown = ((await picker.locator("input").first().inputValue().catch(() => "")) || "").trim();
    if (shown !== dayWords(when)) throw new Error(`the date picker shows “${shown}” after picking ${dayWords(when)} — the pick did not commit (not evidence about the product)`);
    return "ok";
  };

  if (a.start !== undefined && a.start !== null && a.start !== "") {
    // fields by their LABEL: the start field's own error text names "Delivery Date", so a
    // text match on the whole form item picks the wrong field
    const live = dialog.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^\s*Make Order Live At\s*$/i }) }).first();
    // "S+2h" = two hours after the event's CURRENT start, read from the dialog's own fields
    let base = new Date();
    const fromStart = /^\s*S\b/i.test(String(a.start));
    if (fromStart) {
      const day = ((await live.locator(".ant-calendar-picker-input").first().inputValue().catch(() => "")) || "").trim();
      const time = ((await live.locator(".ant-time-picker-input").first().inputValue().catch(() => "")) || "").trim();
      const cur = parseDialogTime(day, time);
      if (!cur) throw new Error(`could not read the event's current start from the dialog (“${day}” “${time}”)`);
      base = cur;
      notes.push(`current start ${day} ${time}`);
    }
    const when = relTime(fromStart ? String(a.start).replace(/^\s*S/i, "") || "+0m" : a.start, base);
    const dayResult = await pickDay(live.locator(".ant-calendar-picker").first(), when);
    if (dayResult === "disabled") {
      notes.push(`the calendar does not allow ${dayWords(when)} (that day is disabled)`);
    } else {
      await clickInDialog(live.locator(".ant-time-picker-input").first());
      const tInput = openPopup(".ant-time-picker-panel .ant-time-picker-panel-input");
      await tInput.waitFor({ state: "visible", timeout: 8_000 });
      await tInput.fill(timeWords(when));
      await page.waitForTimeout(150);
      await closePopups();
      const shown = ((await live.locator(".ant-time-picker-input").first().inputValue().catch(() => "")) || "").trim().toLowerCase();
      if (shown && shown !== timeWords(when)) notes.push(`the time picker shows ${shown}, not ${timeWords(when)}`);
      notes.push(`start set to ${dayWords(when)} ${timeWords(when)}`);
    }
  }
  if (a.delivery !== undefined && a.delivery !== null && a.delivery !== "") {
    const del = dialog.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^\s*(Delivery|Pickup) Date\s*$/i }) }).first();
    if (!(await del.count().catch(() => 0))) throw new Error("this event's Reschedule dialog has no Delivery / Pickup Date field (the event has no delivery date)");
    const when = relTime(a.delivery);
    const r = await pickDay(del.locator(".ant-calendar-picker").first(), when);
    notes.push(r === "disabled" ? `the calendar does not allow delivery on ${dayWords(when)} (that day is disabled)` : `delivery set to ${dayWords(when)}`);
  }

  await page.waitForTimeout(400); // antd fades an outdated help line out — read it after the fade
  const before = await fieldHelp();
  const disabledDay = notes.some((n) => /is disabled/.test(n));
  let saveCall = "";
  let sentBody: any = null;
  if (a.confirm !== false && !disabledDay) {
    // the save is the event's edit call (editOrder → PATCH /trade/:id…); record its answer so a
    // dialog that stays open can be told apart: the field's own rule vs the server refusing
    const saved = page
      .waitForResponse((r) => ["PATCH", "PUT"].includes(r.request().method()) && /\/trade\//.test(r.url()), { timeout: 12_000 })
      .then(async (r) => {
        let msg = "";
        try {
          const j: any = await r.json();
          msg = String(j?.message ?? j?.error?.message ?? j?.detail ?? "").slice(0, 160);
        } catch {
          /* not json */
        }
        try {
          sentBody = r.request().postDataJSON();
        } catch {
          /* not json */
        }
        return `${r.request().method()} ${new URL(r.url()).pathname} → HTTP ${r.status()}${msg ? ` “${msg}”` : ""}`;
      })
      .catch(() => "");
    if (process.env.UI_DUMP_DIALOG) console.log(`[reschedule] before Ok: ${notes.join("; ")} | help “${before}”`);
    await clickInDialog(dialog.getByRole("button", { name: /^\s*ok\s*$/i }).first());
    await dialog.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    saveCall = before ? "" : await saved; // with a field error showing, Ok sends nothing
    // a slow save closes the dialog only after its reply (and a re-fetch) — give it that long
    if (/HTTP 2\d\d/.test(saveCall)) await dialog.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  }
  const closed = !(await dialog.isVisible().catch(() => false));
  const help = closed ? "" : (await fieldHelp()) || before;
  const serverRefused = /HTTP [45]\d\d/.test(saveCall);
  if (saveCall) notes.push(`save call ${saveCall}`);
  // What the save SENT, against the window the API built: the round keeps its length and the
  // closing grace shifts with it (rescheduleEventModal: newEnd = newStart + (end − start)).
  const shape: string[] = [];
  if (sentBody && typeof sentBody === "object") {
    const [bst, bet, ect] = [Number(sentBody.bid_start_time), Number(sentBody.bid_end_time), Number(sentBody.extra_closing_time)];
    const was = s.context?.values ?? {};
    if (bst && bet) {
      const len = bet - bst;
      notes.push(`sent a ${Math.round(len / 60)}-minute round`);
      if (was.roundSeconds && Number(was.roundSeconds) !== len) shape.push(`the round was ${Math.round(Number(was.roundSeconds) / 60)} min and the save sent ${Math.round(len / 60)} min`);
    }
    if (bet && ect && was.extraSeconds && Number(was.extraSeconds) !== ect - bet) shape.push(`the closing grace was ${was.extraSeconds}s and the save sent ${ect - bet}s`);
  }
  const refused = disabledDay || (!closed && !!help) || serverRefused;
  // Read back: the screen re-fetches the event after a save — reopen the dialog and read the
  // start it now holds (the same fields a buyer sees), then close it untouched.
  let readBack = "";
  if (closed && !refused && saveCall && a.start && a.readBack !== false) {
    await page.waitForTimeout(800);
    await openDialog();
    const live2 = dialog.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: /^\s*Make Order Live At\s*$/i }) }).first();
    const day = ((await live2.locator(".ant-calendar-picker-input").first().inputValue().catch(() => "")) || "").trim();
    const time = ((await live2.locator(".ant-time-picker-input").first().inputValue().catch(() => "")) || "").trim().toLowerCase();
    readBack = `${day} ${time}`;
    await dialog.getByRole("button", { name: /^\s*cancel\s*$/i }).first().click({ timeout: 5_000 }).catch(() => {});
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    const want = notes.find((n) => n.startsWith("start set to "))?.replace("start set to ", "");
    notes.push(`reopened: the event now starts ${readBack}`);
    if (want && readBack !== want) {
      // the screen shows server times shifted by localStorage.timeDiff (= browser clock − server
      // clock, user/actions.js fetchTimeDiff) but the dialog SENDS the picked browser time
      // unshifted, so a picked start comes back moved by that clock gap
      const diff = await page.evaluate(() => window.localStorage.getItem("timeDiff")).catch(() => null);
      const sent = Number(sentBody?.bid_start_time);
      const sentWords = sent ? new Date(sent * 1000).toTimeString().slice(0, 8) : "?";
      shape.push(`after saving ${want} the event shows ${readBack} — the save sent bid_start_time ${sent || "?"} (${sentWords} browser time) and the screen adds the app's clock offset timeDiff=${diff ?? "?"}s when it shows it`);
    }
  }
  const seen = `${notes.join("; ")}${notes.length ? " — " : ""}${refused ? `refused${help ? `: “${help}”` : ""}` : closed ? "the dialog closed with no error (saved)" : "the dialog stayed open with no message"}`;
  if (refused || !closed) {
    // tidy: leave no half-filled dialog over the next step
    await dialog.getByRole("button", { name: /^\s*cancel\s*$/i }).first().click({ timeout: 5_000 }).catch(() => {});
  }
  if (a.message && refused && !help.toLowerCase().includes(String(a.message).toLowerCase()) && !disabledDay) {
    throw new Error(`the dialog refused, but its message reads “${help}”, not “${a.message}” — ${seen}`);
  }
  if (a.keepsLength !== false && shape.length) expect(shape, `reschedule did not keep what was picked: ${shape.join("; ")} — ${seen}`).toEqual([]);
  if (wantRefused) expect(refused, `reschedule should be refused — ${seen}`).toBe(true);
  else if (a.expect !== undefined || a.confirm !== false) expect(refused || !closed, `reschedule should save — ${seen}`).toBe(false);
  return seen;
}

/**
 * Can the event on screen take what the case does next? A surrogate bid
 * needs a vendor on its pricing round offered Add Bid; Master QCS, awarding
 * and counter offers need bids in. Anything else: an open event will do.
 */
const bidsNext = (later: string[]) => {
  // A bid that comes AFTER closing or awarding is the refusal the case checks, not a bid to place
  // now: such a case needs bids in and bidding over (23 Oct, C06: "award the vendor and then try
  // another surrogate bid" passed over every closed event with bids, asking for an open round).
  const bid = later.findIndex((x) => /^(place_surrogate_bid|open_participants)$/.test(x));
  const closes = later.findIndex((x) => /^(open_master_qcs|start_awarding|allocate_award|award_event|close_event|expect_award)/.test(x));
  return bid >= 0 && (closes < 0 || bid < closes);
};

async function fitsCase(s: RunState, later: string[], title?: string): Promise<{ ok: boolean; why: string }> {
  if (bidsNext(later)) return new SurrogateBidPage(s.page).canAddBid(title);
  // A counter offer needs a bid that takes one — not a surrogate bid, on which Procol greys it out.
  if (later.some((x) => /^place_counter_offer$/.test(x))) return new CounterOfferPage(s.page).canCounterOffer();
  if (later.some((x) => /^(open_master_qcs|start_awarding|allocate_award|award_event|expect_award|place_counter_offer|expect_counter_offer)/.test(x))) {
    await new AwardPage(s.page).openMasterQcs().catch(() => false);
    const none = await s.page.getByText(/no bids (are|have been) placed/i).first().waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);
    return none ? { ok: false, why: "its Master QCS says no bids are placed yet" } : { ok: true, why: "its Master QCS has bids to compare" };
  }
  return { ok: true, why: "it is open" };
}

/** Remember the event the tester opened by hand for this kind of case: the next run tries it first. */
function rememberPick(s: RunState, need: string): string {
  const m = s.page.url().match(/\/project\/([^/?#]+)/);
  if (!m) return "";
  learnAnswer(Number(process.env.COMPANY_ID) || null, `pick:${need}`, "the event to use", { option: "event", text: JSON.stringify({ uuid: m[1], title: s.title ?? null }) });
  return " — remembered, so the next run of this kind of case tries this event first";
}

/** The event the tester opened by hand for this kind of case before, if any. */
function learnedPick(need: string): { uuid: string; title: string | null; at: string } | null {
  const a = earlierAnswer(Number(process.env.COMPANY_ID) || null, `pick:${need}`, "the event to use");
  if (!a?.text) return null;
  try {
    const v = JSON.parse(a.text);
    return v?.uuid ? { uuid: String(v.uuid), title: v.title ?? null, at: String((a as any).at ?? "") } : null;
  } catch {
    return null;
  }
}

/** Does the rest of the case evaluate a technical response (an evaluator scoring)? */
function evaluatesNext(s: RunState, a: Record<string, unknown>): boolean {
  if (a.purpose === "evaluation") return true;
  return (s.laterPlan ?? []).some((x) => /evaluat|\bscor(e|es|ing)\b/i.test(String(x.args?.goal ?? x.args?.need ?? "")));
}

const inIst = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * AN EVENT READY FOR A TECHNICAL EVALUATION (Aanya, 26 Oct: "if i mention evaluation then u
 * must know that it will include technical stage then find suitable event for that").
 * From the database (evaluationEvents): a live event whose technical stage closed with a
 * vendor's answer waiting and nothing evaluated yet. It opens by its route, found from its RFX
 * reference, so the API journey's untitled events can be used. None ready: the tester is asked,
 * and "create" builds one (technical + RFQ, a vendor's technical answer, the window let close).
 */
async function pickForEvaluation(s: RunState): Promise<string> {
  const avoid = new Set(s.avoidEvents ?? []);
  const passed: string[] = [];
  const ready = (await evaluationEvents()) ?? [];
  // The event the tester opened by hand for an evaluation before goes first — while it is still ready.
  const learned = learnedPick("evaluation");
  if (learned?.title) ready.sort((x, y) => Number(y.title === learned.title) - Number(x.title === learned.title));
  for (const ev of ready) {
    const name = ev.title ?? ev.ref;
    if (avoid.has(name) || avoid.has(ev.ref)) continue;
    const uuid = await eventRoute(s.page, ev.ref, { byRef: true });
    if (!uuid) {
      passed.push(`“${name}”: its page could not be found from ${ev.ref}`);
      console.log(`[pick] ✗ “${name}” — no page found for ${ev.ref}`);
      continue;
    }
    const where = await s.events.openEvent({ id: uuid });
    s.title = name;
    s.picked = name;
    s.pickedForEvaluation = true;
    const shown = learned?.title && ev.title === learned.title ? "it is the event you opened by hand for an evaluation before, and " : "";
    const why = `${shown}its technical stage closed for answers on ${inIst(ev.at)} with ${ev.answers} vendor answer${ev.answers === 1 ? "" : "s"} waiting and no evaluation submitted yet`;
    console.log(`[pick] ✓ “${name}” (${ev.ref}) — ${why}`);
    const before = passed.length ? ` Passed over first — ${passed.join("; ")}.` : "";
    return `no event was named, so the run picked “${name}” (${ev.ref}) for the evaluation — ${why}; opened at ${where}.${before}`;
  }
  const wants = "a live event whose technical stage has closed with a vendor's technical answer waiting to be evaluated";
  const answer = await askTester({
    kind: "stuck",
    question: `No event is ready for an evaluation — it needs ${wants}. What should I do?`,
    detail: passed.length ? `Passed over — ${passed.join("; ")}.` : "The database shows none on this client right now.",
    options: [
      { id: "create", label: "Create one for this case (technical + RFQ stages, a vendor answers the technical stage, then its 30-minute window closes) — publishing emails the vendor it invites" },
      { id: "self", label: "I'll open one myself in the browser" },
      { id: "stop", label: "Stop here" },
    ],
  });
  if (!answer || answer.option === "stop") throw new Error(`no event is ready for an evaluation — it needs ${wants}${answer ? ", and you chose to stop here" : ""}.`);
  if (answer.option === "self") {
    for (let t = 0; t < 40 && !controlHeld(); t++) await new Promise((r) => setTimeout(r, 200));
    await released();
    if (!/\/project\//.test(s.page.url())) throw new Error("the browser was handed back without an event open — open the event's page, then hand back");
    s.title = (await s.page.locator("h1, h2, [class*='title' i]").first().textContent().catch(() => ""))?.trim() || s.title;
    s.pickedForEvaluation = true;
    return `you opened the event yourself in the browser (${new URL(s.page.url()).pathname})${rememberPick(s, "evaluation")}`;
  }
  if (answer.option === "create") return createEventForEvaluation(s);
  const title = answer.text.trim();
  const where = await s.events.openEvent({ title });
  s.title = title;
  return `opened “${title}”, the event you named, at ${where}`;
}

/** A fresh event for an evaluation case: technical + RFQ, the run's vendor answers the technical stage, the window closes. */
async function createEventForEvaluation(s: RunState): Promise<string> {
  const steps: PlanStep[] = [
    { step: "open_create", args: { path: "erfx" } },
    { step: "set_title" },
    { step: "compose_stages", args: { stages: ["rfp", "rfq"] } },
    { step: "switch_stage", args: { stage: "rfp" } },
    { step: "select_template" },
    { step: "add_line_items", args: { count: 1 } },
    { step: "fill_questionnaires" },
    { step: "assign_evaluator" },
    { step: "switch_stage", args: { stage: "rfq" } },
    { step: "select_template" },
    { step: "fill_sheet" },
    { step: "set_schedule", args: { minutes: 30 } },
    { step: "invite_vendor", args: { count: 1 } },
    { step: "publish" },
    { step: "expect_published" },
    { step: "place_bid" },
    { step: "close_event", args: { natural: true } },
  ];
  for (const [k, st] of steps.entries()) {
    const detail = await runStep(s, st);
    console.log(`[plan] creating an event for this evaluation ${k + 1}/${steps.length} ${st.step} ✓ ${detail ?? ""}`);
  }
  return `no event was ready, so (as you chose) the run created “${s.title}” with a technical stage, had its vendor answer it, and let the technical window close`;
}

/**
 * No event on the Live list fits the case: ask the tester (the session's
 * question card) — create one for it, pick one in the browser, name one, or
 * stop. Without anyone to ask (a run not started from the dashboard), stop
 * and say why.
 */
async function noFittingEvent(s: RunState, need: "bids" | "live", later: string[], passed: string[]): Promise<string> {
  const surrogate = later.includes("place_surrogate_bid");
  const wants =
    need === "bids"
      ? "a live event with bids in"
      : surrogate
        ? "a live event whose RFQ round is open for a few minutes more, with an invited vendor who has not bid yet"
        : "a live event whose RFQ round is open for quotes";
  const answer = await askTester({
    kind: "stuck",
    question: `No live event fits this case — it needs ${wants}. What should I do?`,
    detail: passed.length ? `Passed over — ${passed.join("; ")}.` : "The Live events list showed none that fit.",
    options: [
      // Publishing invites the event's vendors, and each invited vendor gets an email: say so before the click.
      { id: "create", label: `Create and publish a new event for this case, then carry on${need === "bids" ? " (it gets a bid and its bidding closes first)" : ""} — publishing emails the vendors it invites` },
      { id: "self", label: "I'll open one myself in the browser" },
      { id: "stop", label: "Stop here" },
    ],
  });
  if (!answer) throw new Error(`no live event fits this case — it needs ${wants}.${passed.length ? ` Passed over — ${passed.join("; ")}.` : ""}`);
  if (answer.option === "stop") throw new Error(`no live event fits this case — it needs ${wants} — and you chose to stop here.${passed.length ? ` Passed over — ${passed.join("; ")}.` : ""}`);
  if (answer.option === "self") {
    // Take control (session card → spineLiveControl.take()); carry on from the page handed back.
    for (let t = 0; t < 40 && !controlHeld(); t++) await new Promise((r) => setTimeout(r, 200));
    await released();
    if (!/\/project\//.test(s.page.url())) throw new Error("the browser was handed back without an event open — open the event's page, then hand back");
    s.title = (await s.page.locator("h1, h2, [class*='title' i]").first().textContent().catch(() => ""))?.trim() || s.title;
    return `you opened the event yourself in the browser (${new URL(s.page.url()).pathname})${rememberPick(s, need)}`;
  }
  if (answer.option === "create") return createEventForCase(s, need);
  // A typed reply: the event to use, by its title.
  const title = answer.text.trim();
  const where = await s.events.openEvent({ title });
  s.title = title;
  return `opened “${title}”, the event you named, at ${where}`;
}

/** A fresh RFQ for the case, built with the plan's own steps — with a bid in and bidding closed when the case needs bids. */
async function createEventForCase(s: RunState, need: "bids" | "live"): Promise<string> {
  const steps: PlanStep[] = [
    { step: "open_create", args: { path: "erfx" } },
    { step: "set_title" },
    { step: "compose_stages", args: { stages: ["rfq"] } },
    { step: "select_template" },
    { step: "add_line_items", args: { count: 1 } },
    { step: "fill_sheet" },
    { step: "set_schedule", args: need === "bids" ? { minutes: 3 } : {} },
    { step: "invite_vendor", args: { count: 1 } },
    { step: "publish" },
    { step: "expect_published" },
    ...(need === "bids" ? ([{ step: "place_surrogate_bid" }, { step: "close_event" }] as PlanStep[]) : []),
  ];
  for (const [k, st] of steps.entries()) {
    const detail = await runStep(s, st);
    console.log(`[plan] creating an event for this case ${k + 1}/${steps.length} ${st.step} ✓ ${detail ?? ""}`);
  }
  return `no live event fitted, so (as you chose) the run created “${s.title}”${need === "bids" ? ", placed a bid on it and let its bidding close" : ""}`;
}

/** Steps that drive the create screen — nothing to do once the event is published. */
const CREATE_SCREEN_STEP = /^(compose_stages|expect_stages|set_title|select_template|add_line_items|expect_line_items|fill_sheet|set_schedule|invite_vendor|publish|save_draft|configure_single_stage)$/;

async function runStep(s: RunState, step: PlanStep): Promise<string | undefined> {
  const a = step.args ?? {};
  // The tester took the browser and published the event themselves: the page
  // handed back is the event's project, and a create-screen step driven
  // against it only waits and fails (a run stuck after "I published it myself").
  if (handedBackAt() && CREATE_SCREEN_STEP.test(step.step)) {
    const id = s.page.url().match(/\/project\/([^/?#]+)/)?.[1];
    if (id) {
      s.projectId = s.projectId ?? id;
      s.didByHand = true;
      return `the event is already published (project ${id})`;
    }
  }
  // Generic read/verify/navigate/act steps (generic/run.ts). `attempt` runs
  // its inner step back through this function, so a domain step can be tried
  // as a negative ("attempt publish") with the same healed code.
  const expectation = await runExpectationStep({ page: s.page, context: s.context, prevMark: s.prevMark, stepNo: s.stepNo }, step);
  if (expectation !== null) return expectation;
  const qcsOrAudience = await runQcsAudienceStep({ page: s.page, context: s.context, typedBids: s.typedBids, unmatchedVendors: s.unmatchedVendors, surrogateBids: s.surrogateBids }, step);
  if (qcsOrAudience !== null) return qcsOrAudience;
  // The event menus: Withdraw (project ⋮ or stage Settings), Add Price Cap, Extend Submission Time, any item (eventMenuSteps.ts).
  const menuStep = await runEventMenuStep({ page: s.page, state: (s.menuState ??= {}) }, step);
  if (menuStep !== null) return menuStep;
  const generic = await runGenericStep(s, step, (inner) => runStep(s, inner));
  if (generic) {
    s.lastStrategy = generic.strategy;
    return generic.detail;
  }
  switch (step.step) {
    case "open_events_list": {
      await s.events.goto();
      return "opened the events list";
    }
    case "expect_events_list": {
      await s.events.expectListReady();
      return "the events list rendered";
    }
    case "filter_events": {
      const tab = String(a.tab ?? "Live");
      if (!/\/orders/.test(s.page.url())) await s.events.goto();
      const active = await s.events.openTab(tab);
      s.listTab = tab;
      return `events list on the "${active}" tab`;
    }
    case "expect_event_in_list": {
      const title = String(a.title ?? s.title ?? "");
      if (!title) throw new Error("expect_event_in_list needs a title, and this plan has not created an event to look for");
      if (!/\/orders/.test(s.page.url())) await s.events.goto();
      // The list's search can lag behind an event made a moment ago: search
      // again, bounded (3 tries, 20 s apart), before saying it is not there.
      for (let attempt = 1; attempt <= 3; attempt++) {
        await s.events.searchByTitle(title);
        // The search lands on the Live tab (21 Oct, A08: a saved draft looked for under Live, "No
        // Results found"): go back to the tab the plan chose before reading the rows.
        if (s.listTab && !/^live$/i.test(s.listTab)) await s.events.openTab(s.listTab).catch(() => {});
        const where = s.listTab && !/^live$/i.test(s.listTab) ? ` on the ${s.listTab} tab` : "";
        if (await s.events.hasEventMatching(title)) return `"${title}" is in the list${where}${attempt > 1 ? ` (found on search ${attempt})` : ""}`;
        if (attempt < 3) {
          await s.page.waitForTimeout(20_000);
          await s.events.goto();
        }
      }
      throw new Error(`no event titled "${title}" in the list${s.listTab && !/^live$/i.test(s.listTab) ? ` (${s.listTab} tab)` : ""} after searching for it three times over 40 s`);
    }
    case "expect_event_status": {
      const status = String(a.status ?? "").trim();
      if (!status) throw new Error('expect_event_status needs a "status" to look for');
      const title = String(a.title ?? s.title ?? "");
      if (!title) throw new Error("expect_event_status needs a title, and this plan has not created an event to look for");
      if (!/\/orders/.test(s.page.url())) await s.events.goto();
      // The list filters a moment after the search (29 Oct, plan-mvt5ckot: looked 0.2 s after Enter, while
      // the unfiltered list still showed), so wait for the row; and an event is not always on the tab the
      // plan opened — a technical stage whose bidding ended stays on Live through its evaluation window —
      // so the other tabs are searched too, and the step says where it was found.
      const findRow = async (ms: number): Promise<string | null> => {
        const until = Date.now() + ms;
        for (;;) {
          const r = await s.events.rowTextFor(title);
          if (r || Date.now() > until) return r;
          await s.page.waitForTimeout(500);
        }
      };
      await s.events.searchByTitle(title);
      let row = await findRow(12_000);
      let where = "";
      if (!row) {
        for (const tab of ["Live", "History", "Drafts"]) {
          const on = await s.events.openTab(tab).catch(() => "");
          if (!on) continue;
          await s.events.searchByTitle(title);
          row = await findRow(8_000);
          if (row) {
            where = ` (on the ${on} tab)`;
            break;
          }
        }
      }
      if (!row) throw new Error(`no row titled "${title}" on the Live, History or Drafts tab after searching for it`);
      // Procol's own word for a status is not always the case's: a saved draft's row reads
      // "To Be Scheduled" (23 Oct, A08: found on the Drafts tab, then failed on the word "Draft").
      // Bidding that has ended reads "Closed" or "Completed" — or, on a stage with evaluation time,
      // "Evaluation time" while that window runs (29 Oct, plan-mvt5ckot: "29m : 49s Evaluation time").
      const SAYS: Record<string, RegExp> = {
        draft: /\bdraft\b|to be scheduled/i,
        closed: /\bclosed\b|\bcompleted\b|evaluation time|in\s*-?\s*evaluation|bidding ended/i,
        ended: /\bclosed\b|\bcompleted\b|evaluation time|in\s*-?\s*evaluation|bidding ended|\bended\b/i,
      };
      const said = SAYS[status.toLowerCase()] ? SAYS[status.toLowerCase()].exec(row)?.[0] : row.toLowerCase().includes(status.toLowerCase()) ? status : undefined;
      if (!said) {
        throw new Error(`the row for "${title}"${where} reads: ${row.slice(0, 200)} — no "${status}" in it`);
      }
      if (/evaluation/i.test(said)) return `"${title}"${where} shows "${said}" — bidding has ended and the event is in its evaluation window; Procol lists it as ${status} once that window is over`;
      return said.toLowerCase() === status.toLowerCase() ? `"${title}"${where} shows "${status}"` : `"${title}"${where} shows "${said}" — Procol's word for ${status}`;
    }
    case "expect_template_selected": {
      const shown = await s.create.appliedTemplateName();
      if (shown === null) throw new Error("the stage still offers 'Select Templates' — no template is applied");
      const want = a.name ? String(a.name) : s.templateName;
      if (want && !shown.toLowerCase().includes(want.toLowerCase()) && !/name not displayed/.test(shown)) {
        throw new Error(`the stage shows template "${shown}", not "${want}"`);
      }
      return `template applied: ${shown}`;
    }
    case "expect_sheet_columns": {
      const keys = await s.create.sheetHeaderKeys();
      if (!keys.length) throw new Error("no pricing-sheet header has rendered — the template's schema is not on screen");
      const want = Array.isArray(a.columns) ? a.columns.map(String) : [];
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const missing = want.filter((w) => !keys.some((k) => norm(k).includes(norm(w))));
      if (missing.length) throw new Error(`sheet columns are [${keys.join(", ")}] — missing: ${missing.join(", ")}`);
      return `sheet columns: ${keys.join(", ")}`;
    }
    case "open_add_stage_menu": {
      const m = await s.create.openAddStageMenu();
      return `add-stage menu: ${m.buttonDisabled ? "the + button is disabled" : `offers ${m.items.join(", ") || "(nothing)"}`}${m.tooltip ? `; tooltip “${m.tooltip}”` : ""}`;
    }
    case "expect_sheet_cells": {
      const grid = s.page.locator(".data-grid-container table").filter({ visible: true }).first();
      if (!(await grid.count().catch(() => 0))) throw new Error("no sheet (data grid) on this screen (not evidence about the product)");
      const rows = grid.locator("tr");
      const headerCells = rows.nth(0).locator("td, th");
      const heads = (await headerCells.allInnerTexts().catch(() => [] as string[])).map((h) => h.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase());
      const rowNo = Math.max(1, Number(a.row) || 1);
      if ((await rows.count()) <= rowNo) throw new Error(`the sheet has no data row ${rowNo} (not evidence about the product)`);
      const colOf = (name: string) => {
        // header text or the widget key ("delivery_location" → "delivery location")
        const n = name.replace(/\*/g, "").replace(/_/g, " ").trim().toLowerCase();
        let i = heads.findIndex((h) => h === n);
        if (i < 0) i = heads.findIndex((h) => h.startsWith(n) || h.includes(n));
        return i;
      };
      const problems: string[] = [];
      const seen: string[] = [];
      const seenDetail: string[] = [];
      const check = async (names: unknown, wantReadonly: boolean) => {
        for (const name of (Array.isArray(names) ? names : []) as string[]) {
          const i = colOf(String(name));
          if (i < 0) {
            problems.push(`no "${name}" column (columns: ${heads.filter(Boolean).join(", ")})`);
            continue;
          }
          // Procol's sheet marks locked cells with its own CSS-module classes
          // (_cellReadOnly_…, _cellCreationReadOnly_…), seen on the live grid; the grid
          // library's "read-only" class is matched too. Reading the class changes nothing.
          const td = rows.nth(rowNo).locator("td").nth(i);
          const cls = (await td.getAttribute("class").catch(() => "")) ?? "";
          const ro = /read-?only/i.test(cls);
          seenDetail.push(`${name}: ${ro ? "read-only" : "editable"}`);
          seen.push(`${name} ${ro ? "read-only" : "editable"}`);
          if (ro !== wantReadonly) problems.push(`"${name}" is ${ro ? "READ-ONLY" : "EDITABLE"}, expected ${wantReadonly ? "read-only" : "editable"}`);
        }
      };
      await check(a.readonly, true);
      await check(a.editable, false);
      if (!seen.length && !problems.length) throw new Error('expect_sheet_cells needs "readonly" and/or "editable" column names');
      console.log(`[sheet] row ${rowNo}: ${seenDetail.join(" | ")}`);
      if (problems.length) throw new Error(`sheet row ${rowNo}: ${problems.join("; ")} — seen: ${seenDetail.join(" | ").slice(0, 700)}`);
      return `sheet row ${rowNo}: ${seen.join(", ")}`;
    }
    case "open_event_settings": {
      // The gear (event-settings-button) sits in a STAGE page's header; the project overview only
      // has a "⋮". Open the first stage tab when the gear is not on screen, then fall back to "⋮".
      // The project page may still be on its loading spinner right after publish (D07): let it render.
      await new EventDetailPage(s.page).waitForProjectPage();
      let gear = s.page.getByTestId("event-settings-button").filter({ visible: true }).first();
      if (!(await gear.count().catch(() => 0))) {
        // Procol's "Project Details | RFQ | Master QCS" bar is not always role=tab (23 Oct, D01: on
        // /details the RFQ tab was there and this found nothing): match its text on a tab or link too.
        const tab = s.page
          .getByRole("tab", { name: /^(rfq|auction|rfp|technical stage|rfi)\b/i })
          .or(s.page.locator(".ant-tabs-tab, [role='tab'], a").filter({ hasText: /^\s*(RFQ|Auction|RFP|RFI|Technical Stage)\s*$/ }))
          .first();
        if (await tab.isVisible().catch(() => false)) {
          await tab.click({ timeout: 8_000 }).catch(() => {});
          await gear.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        }
      }
      if (!(await gear.count().catch(() => 0))) gear = s.page.locator("button:has(.anticon-more)").filter({ visible: true }).first();
      if (!(await gear.count().catch(() => 0))) throw new Error("no Settings (gear) or ⋮ menu on this event (not evidence about the product)");
      const menu = s.page.locator(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu").filter({ visible: true }).last();
      // The menu opens on click on some event pages and on HOVER on others (antd trigger), and a
      // click on a hover menu can toggle it shut again; try click, then hover, then click again.
      for (const how of ["click", "hover", "click"] as const) {
        if (how === "click") await gear.click({ timeout: 10_000 });
        else await gear.hover({ timeout: 5_000 }).catch(() => {});
        if (await menu.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) break;
      }
      const rows = menu.locator("[role='menuitem']");
      const n = await rows.count().catch(() => 0);
      const items: string[] = [];
      for (let i = 0; i < n; i++) {
        const r = rows.nth(i);
        const text = ((await r.innerText().catch(() => "")) || "").trim();
        if (!text) continue;
        const off = (await r.getAttribute("aria-disabled").catch(() => null)) === "true" || /disabled/.test((await r.getAttribute("class").catch(() => "")) ?? "");
        items.push(off ? `${text} (disabled)` : text);
      }
      if (!items.length) throw new Error("the Settings menu did not open (not evidence about the product)");
      return `event settings offer: ${items.join(", ")}`;
    }
    case "reschedule_event":
      return rescheduleEvent(s, a);
    case "expect_add_stage_options": {
      const m = await s.create.openAddStageMenu();
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z]+/g, " ").trim();
      const have = m.items.map(norm);
      const problems: string[] = [];
      if (a.disabled === true && !m.buttonDisabled) problems.push(`the "+" is enabled (offers ${m.items.join(", ") || "nothing"})`);
      if (a.disabled === false && m.buttonDisabled) problems.push('the "+" is disabled');
      for (const want of (Array.isArray(a.offers) ? a.offers : []) as string[]) if (!have.some((h) => h.includes(norm(want)))) problems.push(`"${want}" is not offered`);
      for (const no of (Array.isArray(a.absent) ? a.absent : []) as string[]) if (have.some((h) => h.includes(norm(no)))) problems.push(`"${no}" IS offered`);
      // The reason is the disabled "+"'s tooltip. An enabled "+" has none: the stage the case
      // asked for is then simply left out of the menu, which is the refusal (21 Oct, A23: Auction
      // absent beside an RFQ, and the check failed on a tooltip an enabled "+" never shows).
      if (a.reason && m.buttonDisabled && !norm(m.tooltip).includes(norm(String(a.reason)))) problems.push(`the "+" tooltip reads "${m.tooltip || "(none)"}", not "${a.reason}"`);
      const noTip = a.reason && !m.buttonDisabled ? ` (the "+" is enabled, so there is no tooltip to read: what the case refuses is left out of the menu)` : "";
      const seen = `${m.buttonDisabled ? "the + is disabled" : `offers ${m.items.join(", ") || "nothing"}`}${m.tooltip ? `; tooltip “${m.tooltip}”` : ""}`;
      expect(problems, `add-stage menu: ${seen}`).toEqual([]);
      return `add-stage menu as expected: ${seen}${noTip}`;
    }
    case "open_stage_menu": {
      const stage = a.stage ? asStages([a.stage])[0] : undefined;
      const items = await s.create.openStageMenuFor(stage);
      return `stage menu open: ${items.map((i) => `${i.label}${i.disabled ? " (disabled)" : ""}`).join(", ") || "(no items)"}`;
    }
    case "expect_disabled":
    case "expect_enabled": {
      const control = String(a.control ?? a.label ?? a.name ?? a.text ?? "").trim();
      if (!control) throw new Error(`${step.step} needs a "control" — the visible text of the button, menu item or tab`);
      const want = new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      // Some controls are named by their CONTENT, not their purpose: the
      // schedule chip reads "Now - 03:27 pm, 11th Sep (30 Mins)" and the Items
      // button "Items 0". A person calls them "the schedule" and "Items";
      // resolve those names to the controls they mean before matching text.
      const alias: Array<[RegExp, () => import("@playwright/test").Locator]> = [
        [/^schedule|bid window|time ?window$/i, () => s.page.locator("button:has(.anticon-clock-circle), button:has-text('Mins'), button:has-text(' - ')").filter({ hasText: /\d{1,2}:\d{2}|Mins|Hour|Day/i }).first()],
        [/^items?$|line items?/i, () => s.page.getByRole("button", { name: /items\s*\d+/i }).first()],
        [/^publish$/i, () => s.page.getByRole("button", { name: /^publish$/i }).first()],
      ];
      const aliased = alias.find(([re]) => re.test(control));
      const candidates = [
        ...(aliased ? [aliased[1]()] : []),
        s.page.getByRole("button", { name: want }),
        s.page.getByRole("menuitem", { name: want }),
        s.page.getByRole("tab", { name: want }),
        s.page.locator("button, [role='button'], [role='menuitem'], .ant-dropdown-menu-item, .ant-btn").filter({ hasText: want }),
      ];
      let el = null as import("@playwright/test").Locator | null;
      for (const c of candidates) {
        if ((await c.count()) > 0) {
          el = c.first();
          break;
        }
      }
      if (!el) throw new Error(`no control reading "${control}" is on this screen`);
      const disabled =
        (await el.isDisabled().catch(() => false)) ||
        (await el.getAttribute("aria-disabled")) === "true" ||
        /\b(ant-btn-disabled|ant-dropdown-menu-item-disabled|ant-tabs-tab-disabled|disabled)\b/.test((await el.getAttribute("class")) ?? "");
      if (step.step === "expect_disabled" && !disabled) throw new Error(`"${control}" is ENABLED — the case expects it disabled here`);
      if (step.step === "expect_enabled" && disabled) throw new Error(`"${control}" is DISABLED — the case expects it enabled here`);
      return `"${control}" is ${disabled ? "disabled" : "enabled"}, as expected`;
    }
    case "expect_create_options": {
      const want = Array.isArray(a.options) ? a.options.map(String) : [];
      const absent = Array.isArray(a.absent) ? a.absent.map(String) : [];
      // The menu lives on the list; go there if the plan has not already.
      if (!/\/orders\/?(\?|$)/.test(new URL(s.page.url()).pathname + new URL(s.page.url()).search)) await s.events.goto();
      const offered = await s.events.readCreateMenu();
      // "single-stage", "Single Stage" and "singlestage" are the same option
      // to a person; punctuation and spacing must not decide a verdict.
      const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const has = (t: string) => offered.some((o) => norm(o).includes(norm(t)));
      const missing = want.filter((t) => !has(t));
      const present = absent.filter((t) => has(t));
      if (missing.length || present.length) {
        throw new Error(
          `the Create Event menu offers [${offered.join(", ")}]` +
            (missing.length ? ` — missing: ${missing.join(", ")}` : "") +
            (present.length ? ` — should not offer: ${present.join(", ")}` : ""),
        );
      }
      return `the menu offers ${offered.length ? offered.join(", ") : "no menu (direct create)"}`;
    }
    case "expect_url_contains": {
      const text = String(a.text ?? a.contains ?? "");
      if (!text) throw new Error('expect_url_contains needs a "text"');
      const url = s.page.url();
      if (!url.includes(text)) throw new Error(`URL is ${url} — does not contain "${text}"`);
      return `URL contains "${text}"`;
    }
    case "place_counter_offer": {
      if (!/\/project\//.test(s.page.url())) throw new Error("place_counter_offer needs the published event's page with Master QCS open — publish, take a bid, open_master_qcs first");
      // No price named: counter just under the vendor's bid (95 %, 2 dp) — the bid the API placed,
      // else the rate the comparison grid shows for that vendor (21-22 Oct, B12: an existing event
      // picked from the Live list has no API values, and the step stopped "needs a positive price").
      let bid = Number(s.context.values?.bidPrice);
      let from = "the bid the API placed";
      if (a.price === undefined && !(Number.isFinite(bid) && bid > 0)) {
        const g = await new MasterQcsPage(s.page).read().catch(() => null);
        if (g?.vendors.length) {
          const v = vendorIndex(g, a.vendor);
          const rate = amountLabels(rowLabels(g), {}).rate;
          const cell = v >= 0 && rate ? cellAt(lineBlocks(g), rate, v) : undefined;
          const n = qcsNumber(cell?.text);
          if (n !== null && n > 0) {
            bid = n;
            from = `the “${rate}” the grid shows for ${g.vendors[v]}`;
          }
        }
      }
      const price = a.price !== undefined ? Number(a.price) : Number.isFinite(bid) && bid > 0 ? Math.round(bid * 95) / 100 : NaN;
      if (!Number.isFinite(price) || price <= 0) throw new Error('place_counter_offer needs a positive "price"');
      const co = new CounterOfferPage(s.page);
      const detail = await co.sendCounterOffer({ vendor: a.vendor ? String(a.vendor) : undefined, price, remark: a.remark ? String(a.remark) : undefined });
      s.counterOfferSent = true;
      return a.price === undefined ? `${detail} (counter at 95% of ${from}: ${price})` : detail;
    }
    case "expect_counter_offer_sent": {
      if (!s.counterOfferSent) throw new Error("no counter offer was sent in this plan — expect_counter_offer_sent needs place_counter_offer before it");
      const co = new CounterOfferPage(s.page);
      const marked = await co.counterOfferVisibleFor(a.vendor ? String(a.vendor) : undefined);
      if (!marked) throw new Error("the counter offer was sent, but the grid shows no counter-offer mark on the bid yet");
      return "the grid marks the bid with a counter offer";
    }
    case "close_event": {
      // An event picked for an evaluation is someone's event whose technical window is already
      // over: closing it (the old plans did, 26 Oct) would end its other rounds for nothing.
      if (s.pickedForEvaluation && !s.projectId) return "left the picked event as it is — its technical stage is already closed for answers, and this run does not close an event it did not create";
      if (!/\/project\//.test(s.page.url())) throw new Error("close_event needs a published event's page — publish and expect_published (or open_event) first");
      const detail = new EventDetailPage(s.page);
      // natural: the case says to WAIT for the window to close (D54: "wait for it to close"), so the
      // product's force-end is not used even where the tenant offers it.
      let done = a.natural === true || a.natural === "true" ? "waiting for the window to lapse (the case asks to wait, not to end it)" : await detail.forceEnd(a.remark ? String(a.remark) : undefined);
      if (/waiting for the window to lapse/.test(done)) {
        // The smallest duration preset is well above a few minutes; wait long
        // enough for it (the step refuses up front if the row says longer).
        // The product's smallest duration preset is 30 minutes (30 Mins · 1 Hrs
        // · 4 Hrs · 1 Days, captured 2026-09-11), so a closed event on a tenant
        // without force-end costs a real half-hour. Budget for it.
        done = `${done}; ${await detail.waitForWindowToLapse(s.title, asInt(a.maxWaitMinutes, 36))}`;
      }
      s.closed = true;
      return `event closed: ${done}`;
    }
    case "open_event": {
      // The event the API built for this case is opened by its route, not by
      // searching the list: a search is the subject of list cases only, and the
      // list's search lagged behind fresh events (the lookups that failed).
      if (!a.id && !a.title && s.context.eventGroupUuid) {
        const { path } = resolveScreen("summary", s.context);
        await s.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}${path}`, NAV);
        await s.events.dismissDistractions().catch(() => false);
        return `opened the prepared event "${s.context.title ?? s.context.eventGroupUuid}" by its route`;
      }
      // This plan's own published event: back by its project id, not a list search.
      const own = !a.id && (!a.title || String(a.title) === s.title) && s.projectId ? s.projectId : undefined;
      const id = a.id ? String(a.id) : own;
      const title = a.title && !own ? String(a.title) : id ? undefined : s.title;
      // No event named, and this plan built none: pick one from the Live list
      // the way a tester would — the event the later steps need (quotes waiting
      // to be evaluated for Master QCS / awarding / counter offers; an RFQ open
      // for quotes otherwise) — and click it there. No search, and no event
      // fixed in advance: fetching one particular event by name (picked from the
      // database) failed whenever the list did not show it.
      // Each pick is then checked on the event itself (can it take what the
      // case does next?); one that cannot is passed over for the next card,
      // and when none fits the tester is asked — create one, pick one, or stop.
      if (!a.id && !a.title && !s.projectId) {
        const later = s.later ?? [];
        // An evaluation needs a technical stage with answers waiting: picked from the database,
        // opened by its route (untitled API events included), never a list card's guess.
        if (evaluatesNext(s, a)) return await pickForEvaluation(s);
        const need = needOf(later);
        // Events an earlier attempt of this case failed on are not picked again.
        const tried: string[] = [...(s.avoidEvents ?? [])];
        const passed: string[] = [];
        // The event the tester opened by hand for this kind of case before: tried first, while it still fits.
        const learned = learnedPick(need);
        const learnedName = learned ? learned.title ?? learned.uuid : "";
        if (learned && !tried.includes(learnedName)) {
          tried.push(learnedName);
          try {
            await s.events.openEvent({ id: learned.uuid });
            const fit = await fitsCase(s, later, learned.title ?? undefined);
            if (fit.ok) {
              s.title = learnedName;
              s.picked = learnedName;
              console.log(`[pick] ✓ “${learnedName}” — the event you opened by hand for this kind of case; ${fit.why}`);
              return `no event was named, so the run used “${learnedName}”, the event you opened by hand for this kind of case before — ${fit.why}.`;
            }
            passed.push(`“${learnedName}” (the event you opened by hand before): ${fit.why}`);
            console.log(`[pick] ✗ “${learnedName}” — the event you opened by hand before no longer fits: ${fit.why}`);
          } catch (e) {
            passed.push(`“${learnedName}” (the event you opened by hand before): it could not be opened`);
          }
        }
        // "[pick] ✓|✗|· …": each event looked at and why it was used or passed
        // over — shown under this step in the session (planNote), so a run that
        // finds nothing says what it tried.
        const skip = (title: string, why: string) => {
          passed.push(`“${title}”: ${why}`);
          console.log(`[pick] ✗ “${title}” — ${why}`);
        };
        // A bid needs its round open now: asked of the database before a card
        // is clicked, so an event the Live list still shows after bidding
        // closed is passed over without opening it.
        const vet = bidsNext(later)
          ? async (title: string) => {
              const r = await roundNow(title);
              if (!r) return null;
              const no = cannotTakeBid(r);
              return no ? { ok: false, why: no } : { ok: true, why: takesBid(r) };
            }
          : undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
          let p: { title: string; why: string; where: string };
          try {
            p = await s.events.pickFromLive(need, tried, vet, skip);
          } catch (e) {
            const m = (e as Error).message.split("\n")[0];
            if (!/was passed over$/.test(m) || !passed.length) {
              passed.push(m);
              console.log(`[pick] · ${m}`);
            }
            break;
          }
          tried.push(p.title);
          console.log(`[pick] · opened “${p.title}” — ${p.why}`);
          const fit = await fitsCase(s, later, p.title);
          if (fit.ok) {
            s.title = p.title;
            s.picked = p.title;
            console.log(`[pick] ✓ “${p.title}” — ${fit.why}`);
            const before = passed.length ? ` Passed over first — ${passed.join("; ")}.` : "";
            const earlier = s.attempts?.length ? ` Tried before, and you chose another event — ${s.attempts.join("; ")}.` : "";
            return `no event was named, so the run picked “${p.title}” from ${p.where} — ${p.why}; ${fit.why}.${before}${earlier}`;
          }
          skip(p.title, fit.why);
        }
        return await noFittingEvent(s, need, later, passed);
      }
      if (!id && !title) throw new Error("open_event needs an id or a title, and this plan has not created an event to return to");
      const where = await s.events.openEvent({ id, title });
      if (title && !s.title) s.title = title;
      // An evaluation needs a technical stage. An event without one is said in one line, with a way on
      // (Aanya, 27 Oct: her "now evaluate it" on an RFQ-only event got a paragraph and a stuck explorer).
      if (evaluatesNext(s, a)) {
        const eg = decodeProcolId(s.page.url().match(/\/project\/([^/?#]+)/)?.[1] ?? "") ?? (title ? (await eventGroupByTitle(title).catch(() => undefined))?.id : undefined);
        const stages = eg ? await stagesOfEvent(eg) : null;
        if (stages?.length && !stages.includes("technical")) {
          const name = id ?? title;
          const has = [...new Set(stages)].map((x) => (x === "rfq" ? "RFQ" : "Auction")).join(" + ");
          const answer = await askTester({
            kind: "stuck",
            question: `${name} has no technical stage (${has} only), so there is no evaluator.`,
            options: [
              { id: "pick", label: "Use an event with a technical answer waiting" },
              { id: "stop", label: "Stop here" },
            ],
          });
          if (answer?.option === "pick" || (answer && !answer.option && /\b(use|pick|another|other|yes|ok)\b/i.test(answer.text))) {
            s.projectId = undefined;
            return `${name} has no technical stage (${has} only), so ${await pickForEvaluation(s)}`;
          }
          s.noHold = true; // already asked: a failure here is not asked about again
          throw new Error(`${name} has no technical stage (${has} only), so it has no evaluator — an evaluation needs a technical stage`);
        }
      }
      return `opened ${id ? `event ${id}` : `"${title}"`} at ${where}`;
    }
    case "accept_counter_offer": {
      if (!s.counterOfferSent) throw new Error("no counter offer was sent in this plan — accept_counter_offer needs place_counter_offer before it");
      const browser = s.page.context().browser();
      if (!browser) throw new Error("no browser available to open a vendor session");
      const vendorCtx = await browser.newContext();
      const vendorPage = await vendorCtx.newPage();
      // The vendor portal streams beside the buyer's page (sideFrames), then stays on its last frame.
      const side = sideFrames(vendorPage, "Vendor portal");
      try {
        const portal = new VendorPortalPage(vendorPage);
        // The vendor the counter offer went to: the one who bid from the vendor portal in this plan (27 Oct, VB09 —
        // "the next vendor who has not bid" found nobody, since that vendor had bid), else the event's first.
        const email = biddersUsed.length ? biddersUsed[biddersUsed.length - 1] : await bidderEmail();
        side.relabel(`Vendor portal · ${email}`);
        await portal.goto();
        const how = await portal.login(email);
        await portal.openEvent(s.title);
        const detail = await portal.acceptCounterOffer(s.title);
        s.counterOfferAccepted = true;
        return `${detail} (signed in as ${email} with ${how})`;
      } finally {
        await side.stop();
        await vendorCtx.close().catch(() => {});
      }
    }
    case "expect_counter_offer_accepted": {
      if (!s.counterOfferAccepted) throw new Error("no counter offer was accepted in this plan — expect_counter_offer_accepted needs accept_counter_offer before it");
      // Back on the buyer's page, the Responses grid should now carry the mark.
      const co = new CounterOfferPage(s.page);
      await s.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      const res = await co.counterOfferStatusFor(a.vendor ? String(a.vendor) : undefined, /accept/i, 60_000);
      if (!res.ok) throw new Error(`the buyer's grid does not yet mark the counter offer as accepted — the vendor header reads: ${res.text}`);
      return "the buyer's grid marks the counter offer as accepted";
    }
    case "inventory_screen": {
      // Every control the screen shows, with the screenshot and accessibility tree beside it —
      // the input for writing test cases from a screen (prototype/src/agents/screenCases.ts).
      const label = String(a.label ?? "screen").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "screen";
      await s.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const busy = s.page.locator(".ant-skeleton, .ant-spin-spinning").first();
      for (const until = Date.now() + 20_000; Date.now() < until && (await busy.isVisible().catch(() => false)); ) await s.page.waitForTimeout(250);
      const o = await observe(s.page, s.stepNo, `inventory-${label}`, { force: true }).catch(() => null);
      const inv = await screenInventory(s.page);
      const map = await spotlightMap(s.page, label, inv.controls).catch(() => null);
      const fallbackDir = joinInv(dirnameInv(fileUrlInv(import.meta.url)), "..", "..", "evidence", "inventories");
      const file = o?.screenshot ? o.screenshot.replace(/\.png$/, ".inventory.json") : joinInv(fallbackDir, `${label}-${Date.now()}.inventory.json`);
      mkdirInv(dirnameInv(file), { recursive: true });
      writeInv(file, JSON.stringify({ label, context: s.context?.state ?? "none", screenshot: o?.screenshot ?? null, map, aria: o?.snapshot ?? null, runId: process.env.QA_RUN_ID ?? null, stepNo: s.stepNo, ...inv }, null, 2));
      console.log(`[inventory] ${file}`);
      const by = inv.controls.reduce<Record<string, number>>((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
      return `inventory of "${label}" at ${inv.path}: ${inv.controls.length} controls (${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(", ")})`;
    }
    case "capture_screen": {
      const label = String(a.label ?? "capture").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "capture";
      // A capture of a page still drawing its skeleton documents nothing — wait (≤20 s) for the
      // loaders to go, as a person would before looking.
      await s.page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const loading = s.page.locator(".ant-skeleton, .ant-spin-spinning").first();
      const until = Date.now() + 20_000;
      while (Date.now() < until && (await loading.isVisible().catch(() => false))) await s.page.waitForTimeout(250);
      // Reuse the stuck-report writer: same screenshot + tree, same panel on
      // the dashboard, but marked as requested rather than as a failure.
      await recordStuck(s.page, {
        label: `capture:${label}`,
        message: "captured on request by the plan — not a failure",
        triedCandidates: [],
        healerTried: false,
      });
      const buttons = (await s.page.getByRole("button").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      const tabs = (await s.page.getByRole("tab").allTextContents()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
      return `captured "${label}" at ${new URL(s.page.url()).pathname} — tabs: ${tabs.slice(0, 8).join(" | ") || "none"}; buttons: ${buttons.slice(0, 14).join(" | ")}`;
    }
    case "open_participants": {
      if (!/\/project\//.test(s.page.url())) throw new Error("open_participants needs a published event's project page — publish and expect_published first");
      const sur = new SurrogateBidPage(s.page);
      await sur.openParticipants();
      const biddable = await sur.biddableVendors().catch(() => [] as string[]);
      return `participants list open — ${biddable.length} row(s) offer Add Bid${biddable.length ? `: ${biddable.slice(0, 5).join(", ")}` : " on this page"}`;
    }
    case "open_master_qcs": {
      if (!/\/project\//.test(s.page.url())) throw new Error("open_master_qcs needs a published event's project page — publish and expect_published first");
      const award = new AwardPage(s.page);
      await award.openMasterQcs();
      const grid = s.page.locator(".rdg, .rdg-cell, [role='grid'], .data-grid-container").first();
      // An event with no bids shows "No bids are placed yet!" instead of a grid: say that, at once.
      const empty = s.page.getByText(/no bids (are|have been) placed/i).first();
      const shown = await Promise.race([
        grid.waitFor({ state: "visible", timeout: 30_000 }).then(() => "grid"),
        empty.waitFor({ state: "visible", timeout: 30_000 }).then(() => "empty"),
      ]).catch(() => "neither");
      if (shown === "empty") throw new Error(`Master QCS says “${((await empty.textContent().catch(() => "")) || "No bids are placed yet!").trim()}” — this event has no bids to compare`);
      if (shown === "neither") throw new Error("Master QCS showed neither a comparison grid nor a message within 30 s");
      const text = ((await s.page.locator(".rdg, [role='grid'], .data-grid-container").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      const want = Array.isArray(a.vendors) ? a.vendors.map(String) : [];
      const missing = want.filter((v) => !text.toLowerCase().includes(v.toLowerCase()));
      if (missing.length) throw new Error(`the comparison grid rendered but does not list: ${missing.join(", ")}`);
      return `Master QCS grid rendered${want.length ? ` with ${want.join(", ")}` : ""}`;
    }
    case "configure_single_stage": {
      const eventType = String(a.eventType ?? "rfq").toLowerCase();
      if (!["rfq", "rfp", "auction"].includes(eventType)) throw new Error(`configure_single_stage: eventType must be rfq, rfp or auction (got "${eventType}")`);
      const sub = a.auctionSubtype ? String(a.auctionSubtype).toLowerCase().replace(/[\s-]+/g, "_") : undefined;
      if (sub && !["rank", "price", "traffic_light"].includes(sub)) throw new Error(`configure_single_stage: auctionSubtype must be rank, price or traffic_light (got "${sub}")`);
      const awarding = a.awarding ? (/line/i.test(String(a.awarding)) ? "line_item" : "lot") : undefined;
      if (!/singleStage=true|single-stage/.test(s.page.url())) {
        throw new Error("configure_single_stage needs the single-stage create screen — use open_create with path \"single-stage\" first");
      }
      await s.single.configure({
        eventType: eventType as any,
        auctionSubtype: sub as any,
        awarding: awarding as any,
        rangeLower: a.rangeLower !== undefined ? Number(a.rangeLower) : undefined,
        rangeUpper: a.rangeUpper !== undefined ? Number(a.rangeUpper) : undefined,
      });
      return `single-stage configured: ${eventType}${sub ? ` · ${sub.replace("_", " ")}` : ""}${awarding ? ` · award ${awarding.replace("_", " ")}` : ""}`;
    }
    case "create_new_version": {
      if (!/\/project\//.test(s.page.url())) throw new Error("create_new_version needs a published event's project page — publish and expect_published (or open_event) first");
      const v = await new EventDetailPage(s.page).createNewVersion();
      // The copy is a new draft on the same create screen: what the plan does next edits IT.
      s.create = new CreateEventPage(s.page);
      // the copy's stages draw first and its line items a beat later — an edit before they
      // arrive finds an empty Manage Line Items panel
      let copied: number | null = null;
      for (const until = Date.now() + 45_000; Date.now() < until; await s.page.waitForTimeout(500)) {
        copied = await s.create.lineItemCountBadge().catch(() => null);
        if (copied && copied > 0) break;
      }
      s.lineItemsAdded = copied ?? s.lineItemsAdded;
      return `new version open for editing (${v.stageIds.length} stage(s) copied${s.lineItemsAdded ? `, ${s.lineItemsAdded} line item(s)` : ""}) — the previous version is archived and its bids are read-only`;
    }
    case "remove_line_items": {
      const r = await s.create.removeLineItems(asInt(a.count, 1));
      s.lineItemsAdded = r.after;
      return `removed ${r.removed.length} line item(s): ${r.before} → ${r.after}${r.removed.length ? ` (${r.removed.slice(0, 5).join("; ")})` : ""}`;
    }
    case "approve_award": {
      const r = await new AwardPage(s.page).approveAward(a.remark ? String(a.remark) : undefined);
      return `award approved — ${r.approved} approval step(s) were the run's buyer's`;
    }
    case "create_po": {
      // Two ways a PO is made (awardingQCS.jsx): with skip_custom_po the award becomes a proposal
      // and the orders are created when its approval completes; without it the awarding screen
      // offers "Create PO", which opens a PO form — not built yet, so that path is not checked.
      const customPo = s.page.getByRole("button", { name: /^\s*create po\s*$/i }).first();
      if (/\/awarding\//.test(s.page.url()) && (await customPo.isVisible().catch(() => false))) {
        throw new Error("not checked: this event makes POs through the custom PO form (skip_custom_po is off) — the PO-form step is not built yet");
      }
      const r = await new AwardPage(s.page).approveAward();
      const orders = await waitForOrders(s.page.url(), s.title, 90_000);
      if (!orders.length) throw new Error(`the award was approved (${r.approved} step(s)) but no purchase order was created within 90 s — the app creates one per awarded vendor when the award is final (bid.rb:2190-2209)`);
      s.orders = orders;
      return `award approved (${r.approved} step(s)); ${orders.length} purchase order(s): ${orders.map((o) => `#${o.id}${o.po_number ? ` ${o.po_number}` : ""} — ${o.items.length} line(s)`).join("; ")}`;
    }
    case "expect_po_items": {
      const orders = s.orders?.length ? s.orders : await waitForOrders(s.page.url(), s.title, 30_000);
      if (!orders.length) throw new Error("no purchase order exists for this event — create_po (approve the award) first");
      const lines = orders.flatMap((o) => o.items.map((it) => ({ ...it, order: o.id })));
      const want = asInt(a.count, s.lineItemsAdded || lines.length);
      const problems: string[] = [];
      if (lines.length !== want) problems.push(`the PO(s) carry ${lines.length} line(s), the award had ${want}`);
      const empty = lines.filter((l) => !(Number(l.quantity) > 0));
      if (empty.length) problems.push(`${empty.length} PO line(s) have no quantity`);
      if (a.quantity !== undefined) {
        const off = lines.filter((l) => Number(l.quantity) !== Number(a.quantity));
        if (off.length) problems.push(`${off.length} PO line(s) do not carry quantity ${a.quantity} (${off.slice(0, 3).map((l) => l.quantity).join(", ")})`);
      }
      const seen = `${orders.length} PO(s), ${lines.length} line(s): ${lines.slice(0, 6).map((l) => `${l.product || "item"} × ${l.quantity}`).join("; ")}`;
      expect(problems, `PO lines — ${seen}`).toEqual([]);
      return `PO lines as awarded — ${seen}`;
    }
    case "convert_to_auction": {
      // Needs a published RFQ's project page under the browser.
      if (!/\/project\//.test(s.page.url())) throw new Error("convert_to_auction needs a published event's project page — publish and expect_published first");
      const detail = new EventDetailPage(s.page);
      const offered = await detail.openStageOfferingConversion();
      if (!offered) throw new Error(`Convert to Auction is not offered on this event${detail.lastReason ? ` — ${detail.lastReason}` : ""}`);
      const newPage = await detail.convertToAuction();
      // The converted event opens in a new tab; every later step acts there.
      s.page = newPage;
      s.events = new EventsPage(newPage);
      s.create = new CreateEventPage(newPage);
      s.single = new SingleStagePage(newPage);
      await newPage.waitForLoadState("domcontentloaded").catch(() => {});
      return `conversion opened: ${new URL(newPage.url()).pathname}${new URL(newPage.url()).search.slice(0, 80)}`;
    }
    case "open_create": {
      const path = String(a.path ?? "erfx");
      // Straight to the create screen by its address (the menu is the fallback):
      // reaching it is this step's job, the Create Event menu is not its subject.
      await s.events.startCreate(path === "single-stage" ? "single-stage" : path === "boq" ? "boq" : "erfx", { direct: true });
      // Reaching the URL is not the same as the form being there. On this
      // environment the create screen can take 20s+ to hydrate, and the very
      // next step (set_title) was failing "could not fill within 10s" on a
      // page that was simply not ready yet. Wait for the one control every
      // create screen has before calling the step done.
      await s.page
        .getByPlaceholder(/title of the project|event title|title/i)
        .first()
        .waitFor({ state: "visible", timeout: 60_000 })
        .catch(() => {});
      return `opened the ${path} create screen`;
    }
    case "compose_stages": {
      const stages = asStages(a.stages);
      if (!stages.length) throw new Error('compose_stages needs a "stages" array like ["rfq"]');
      await s.create.createProjectWithStages(stages);
      return `stages: ${stages.join(", ")}`;
    }
    case "set_title": {
      if (await isSingleStageScreen(s)) {
        s.title = String(a.title ?? "") || generateEventTitle("UI_Plan");
        await s.single.setTitle(s.title);
        return `${s.title} (single-stage)`;
      }
      s.title = String(a.title ?? "") || generateEventTitle("UI_Plan");
      await s.create.setTitle(s.title);
      return s.title;
    }
    case "switch_stage": {
      const stage = asStages([a.stage])[0];
      if (!stage) throw new Error('switch_stage needs a "stage" of "rfp", "rfq" or "auction"');
      const label = { rfp: /technical stage/i, rfq: /\bRFQ\b/i, auction: /\bauction\b/i }[stage];
      await s.create.switchToStageTab(label);
      // Each stage carries its own template and sheet, so anything captured
      // from the previous tab is now wrong.
      s.widgets = {};
      return `on the ${stage} tab`;
    }
    case "select_template": {
      if (await isSingleStageScreen(s)) {
        const chosen = await s.single.selectBuyTemplate();
        // Prove it took: a button now carries the template's name, or its price sheet is on screen.
        // (Another "Select Templates" button exists elsewhere on the page, so its presence proves nothing.)
        let took = false;
        for (let i = 0; i < 30 && !took; i++) {
          took =
            (chosen ? await s.page.getByRole("button", { name: new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40), "i") }).first().isVisible().catch(() => false) : false) ||
            (await s.page.locator(".data-grid-container").first().isVisible().catch(() => false));
          if (!took) await s.page.waitForTimeout(500);
        }
        if (!took) throw new Error(`the template "${chosen}" was clicked but neither its name nor a sheet appeared within 15 s (not evidence about the product)`);
        s.templateName = chosen;
        return `template: ${chosen} (single-stage)`;
      }
      const chosen = await s.create.selectTemplate(a.name ? String(a.name) : undefined);
      s.templateName = chosen;
      // Later steps need the sheet schema, and it only comes from the template
      // response — so capture it here rather than re-deriving it.
      s.widgets = await s.create.selectFirstTemplateAndExtractWidgets().catch(() => ({}));
      return `template: ${chosen}`;
    }
    case "add_line_items": {
      if (await isSingleStageScreen(s)) {
        // A single-stage RFP's template is a questionnaire: there is no price sheet to type a
        // product into (21 Oct, A13 stopped here). Say so and go on — the questionnaire and the
        // evaluator are that case; if the product wants line items too, Publish says so itself.
        const questionnaire = await s.page.getByRole("button", { name: /^(rfp|rfi)\b/i }).first().isVisible().catch(() => false);
        const sheet = await s.page.locator(".data-grid-container").first().isVisible({ timeout: 3_000 }).catch(() => false);
        if (questionnaire && !sheet) return "no line items entered: this single-stage RFP's template is a questionnaire, with no price sheet to add products to";
        // The single-stage sheet takes one product row typed in place; the
        // journey that publishes single-stage events does exactly this.
        await s.single.fillFirstLineItem(String(a.product ?? a.search ?? "a"));
        s.lineItemsAdded = 1;
        const ranges = await s.single.fillRangeCells();
        if (ranges) console.log(`[single-stage] filled ${ranges} traffic-light range cell(s) on the line item`);
        const wanted = asInt(a.count, 1);
        return wanted > 1
          ? `1 line item filled in the single-stage sheet (the case asked for ${wanted}; this screen's sheet takes one product row per flow here)`
          : "1 line item filled in the single-stage sheet";
      }
      const count = asInt(a.count, 1);
      s.products = a.search
        ? Array.from({ length: count }, (_, i) => ({ searchText: String(a.search), quantity: String((i + 1) * 10) }))
        : buildProducts(count);
      // An explicit quantity is typed exactly as given — including an invalid
      // one (negative, non-numeric) — so a case can test the app's own
      // validation rather than always getting the automation's safe default.
      if (a.quantity !== undefined) {
        const q = String(a.quantity);
        s.products = s.products.map((p) => ({ ...p, quantity: q }));
      }
      await s.create.addLineItems(s.products);
      s.lineItemsAdded = s.products.length;
      return `${s.products.length} line item(s)${a.quantity !== undefined ? ` (quantity: ${a.quantity})` : ""}`;
    }
    case "fill_sheet": {
      if (await isSingleStageScreen(s)) {
        return "sheet already filled with the line item (single-stage)";
      }
      if (!Object.keys(s.widgets).length) s.widgets = await s.create.selectFirstTemplateAndExtractWidgets();
      await s.create.fillSheet(s.widgets, s.lineItemsAdded || 1);
      /**
       * REQUIRED CELLS STILL EMPTY: ask for them by name and type the answer in — never "sheet filled"
       * over an empty required cell (Aanya, 27 Oct: "if it declines to publish because mandatory fields
       * are not filled, then it should fill the fields … or ask the user for it"). The publish refusal
       * "Sheet partially filled" brings the run back here too. The explorer is not used: it could not
       * reach the grid's cells (plan-mvpncvcu clicked the locked Product cell three times).
       */
      // First every kind a client's column can be, by the run itself — the tester is asked only if none takes.
      const auto = await fillEmptyRequiredCells(s);
      let left = await s.create.emptyRequiredSheetCells();
      if (!left.length) return `sheet filled${auto.filled.length ? ` — ${sweepSaid({ filled: auto.filled, left: [] })}` : ""}`;
      const said =(cells: typeof left) => cells.map((c) => `“${c.column}”${cells.some((o) => o.row !== c.row) || c.row > 1 ? ` (line ${c.row})` : ""}`).join(", ");
      const answer = await askTester({
        kind: "question",
        question: `The sheet has ${left.length === 1 ? "a required cell" : `${left.length} required cells`} I could not fill: ${said(left)}. What should I type?`,
        detail: `Type one value for all of them, or one per column (for example “${left[0].column}: 10”). Publish is refused while they are empty.`,
        options: [{ id: "stop", label: "Stop here — mark it failed" }],
      });
      if (!answer || answer.option === "stop" || SAYS_STOP.test(answer.text ?? "")) {
        throw new Error(`the sheet's required ${left.length === 1 ? "cell" : "cells"} ${said(left)} ${left.length === 1 ? "is" : "are"} still empty — the app refuses to publish ("Sheet partially filled")${answer ? "" : ", and nobody said what to type"}`);
      }
      // "Price: 10, dgfgfd: test" → per column; anything else → the same value everywhere.
      const per = new Map<string, string>();
      for (const part of String(answer.text).split(/[,;\n]+/)) {
        const m = part.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
        if (m) per.set(m[1].toLowerCase(), m[2]);
      }
      const valueFor = (c: (typeof left)[number]) =>
        [...per].find(([name]) => c.column.toLowerCase().includes(name) || name.includes(c.column.toLowerCase()) || name === c.key.toLowerCase())?.[1] ?? (per.size ? "" : String(answer.text).trim());
      const typed: string[] = [];
      for (const c of left) {
        const v = valueFor(c);
        if (v && (await s.create.typeIntoSheetCell(c.row, c.key, v))) typed.push(`${c.column} “${v}”`);
      }
      left = await s.create.emptyRequiredSheetCells();
      if (left.length) throw new Error(`the sheet's required ${left.length === 1 ? "cell" : "cells"} ${said(left)} ${left.length === 1 ? "is" : "are"} still empty after typing your answer`);
      return `sheet filled — the required ${typed.length === 1 ? "cell" : "cells"} the template did not fill, with what you gave: ${typed.join(", ")}`;
    }
    case "fill_required": {
      // What the app named first (its drawer filled and saved), then every stage tab's mandatory fields.
      const said = String(a.said ?? "").trim();
      const named = said ? await fillWhatTheAppNamed(s.page, said) : null;
      const all: SweepResult = { filled: [...(named?.sweep.filled ?? [])], left: [...(named?.sweep.left ?? [])] };
      const take = (r: SweepResult) => {
        all.filled.push(...r.filled);
        all.left.push(...r.left.filter((l) => !all.left.includes(l)));
      };
      if (/sheet/i.test(said)) {
        await s.create.fillSheet(s.widgets, s.lineItemsAdded || 1).catch(() => {});
        const cells = await fillEmptyRequiredCells(s);
        all.filled.push(...cells.filled);
        all.left.push(...cells.left);
      }
      take(await fillRequiredFields(s.page));
      const stages = (await isSingleStageScreen(s)) ? [] : await s.create.currentStages().catch(() => [] as StageKey[]);
      if (stages.length > 1) {
        for (const st of stages) {
          await s.create.switchToStageTab({ rfp: /technical stage/i, rfq: /\bRFQ\b/i, auction: /\bauction\b/i }[st]).catch(() => {});
          take(await fillRequiredFields(s.page));
        }
        s.widgets = {};
      }
      const opened = named ? `opened “${named.opened}”${named.saved ? " and saved it" : ""}; ` : "";
      return opened + (sweepSaid(all) || "no mandatory field was left empty on screen");
    }
    case "fill_questionnaires": {
      if (await isSingleStageScreen(s)) {
        // The single-stage RFP screen is the questionnaire itself: numbered questions with an
        // "Enter answer here…" box each (captured 2026-10-21, combo-s3), no RFI sections.
        const boxes = s.page.locator("textarea, input[type='text']").filter({ visible: true });
        let filled = 0;
        for (let i = 0; i < (await boxes.count()); i++) {
          const b = boxes.nth(i);
          const ph = ((await b.getAttribute("placeholder").catch(() => "")) ?? "").toLowerCase();
          if (!/answer/.test(ph)) continue;
          if (((await b.inputValue().catch(() => "")) ?? "").trim()) continue;
          await b.fill("Automated answer", { timeout: 5_000 }).then(() => filled++).catch(() => {});
        }
        return filled ? `${filled} answer(s) typed (single-stage questionnaire)` : "no empty answer boxes on this screen (single-stage)";
      }
      await s.create.fillVendorAssessment();
      return "RFI sections filled";
    }
    case "assign_evaluator": {
      if (await isSingleStageScreen(s)) {
        // One "Evaluator: Search people or teams" select above the questionnaire.
        const picker = s.page.locator(".ant-select").filter({ hasText: /people or teams/i }).first();
        const input = s.page.locator("input[placeholder*='people or teams' i]").first();
        const target = (await picker.count()) ? picker : input;
        if (!(await target.count())) throw new Error("no Evaluator picker on this single-stage screen (not evidence about the product)");
        await target.click({ timeout: 10_000 });
        await s.page.keyboard.type("a", { delay: 40 }).catch(() => {});
        const options = s.page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option'], .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item, .ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item");
        await options.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        const named = options.filter({ hasText: /\S/ }).first();
        if (!(await named.count())) throw new Error("the Evaluator picker opened but lists nobody to assign");
        const who = ((await named.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
        await named.click({ timeout: 5_000 });
        await s.page.keyboard.press("Escape").catch(() => {});
        return `evaluator assigned: ${who.slice(0, 60)} (single-stage)`;
      }
      const n = await s.create.assignEvaluatorToAllLineItems();
      if (!n) throw new Error("no evaluator could be assigned, and a technical stage cannot publish without one");
      // The app wants an evaluator on EVERY line item of the technical stage: say when fewer got one.
      const items = s.lineItemsAdded || 0;
      return items > n ? `${n} evaluator control(s) for ${items} line items — the app refuses to publish until every line item has one` : `${n} evaluator control(s)`;
    }
    case "set_schedule": {
      if (await isSingleStageScreen(s)) {
        return "default schedule kept (single-stage sets its window on publish)";
      }
      if (a.minutes) process.env.UI_SCHEDULE_MINUTES = String(asInt(a.minutes, 30));
      await s.create.saveSchedule();
      // Every stage must be scheduled the same way: a stage left on its old fixed end beside a
      // re-scheduled Duration is refused at publish (BUG-85) — on a new version the copied
      // stages load with the end time the server stored. A drawer opened before the page
      // settled showed one block of two (2026-10-09), so schedule again when one is missing.
      const stages = (await s.create.currentStages().catch(() => [])).length;
      if (stages > 1 && s.create.scheduleWindows.length < stages) {
        console.log(`[create-event] the schedule covered ${s.create.scheduleWindows.length} of ${stages} stages — scheduling again`);
        await s.page.waitForTimeout(2_000);
        await s.create.saveSchedule();
        if (s.create.scheduleWindows.length < stages) throw new Error(`the Schedule drawer showed ${s.create.scheduleWindows.length} of ${stages} stages — the others keep their previous end time, which the app refuses beside a Duration (BUG-85)`);
      }
      // Two stages must end together, or the technical stage ends after the RFQ and publish is
      // refused ("RFP duration exceeds RFQ end time"). A duration that is not a preset lands on
      // a different preset per block (45 asked → 60 on the technical block, 30 on the RFQ,
      // 2026-10-21), so when the blocks disagree, schedule every block on the 30-minute preset.
      const ends = new Set(s.create.scheduleWindows.map((w) => w.endsAt));
      if (stages > 1 && s.create.scheduleWindows.length > 1 && ends.size > 1) {
        console.log(`[create-event] the stages end at different times (${[...ends].join(" / ")}) — scheduling every stage on the 30-minute preset`);
        process.env.UI_SCHEDULE_MINUTES = "30";
        await s.page.waitForTimeout(1_000);
        await s.create.saveSchedule();
      }
      // Report what the app holds — each stage block's own "Event will end at" line — never
      // what was typed (a 3-minute end that did not take was reported as "saved (3 min)").
      const windows = s.create.scheduleWindows.map((w) => `${w.stage.replace(/^\d+\.\s*/, "")} ends ${w.endsAt}`).join(" · ");
      const chosen = s.create.scheduleMinutesChosen;
      const asked = a.minutes ? asInt(a.minutes, 30) : null;
      const note = asked && chosen && chosen !== asked ? ` — asked ${asked} min, the app kept ${chosen} min` : asked && !chosen ? ` — asked ${asked} min, the app kept its default` : "";
      return `schedule saved${windows ? `: ${windows}` : ""}${note}`;
    }
    case "place_bid": {
      // The vendor bids for themselves, which means a SECOND browser context:
      // the buyer's session cannot be reused, and reusing it would quietly test
      // the buyer's view of the portal rather than the vendor's.
      const browser = s.page.context().browser();
      if (!browser) throw new Error("no browser available to open a vendor session");
      const vendorCtx = await browser.newContext();
      const vendorPage = await vendorCtx.newPage();
      shareObserver(s.page, vendorPage);
      // The vendor portal streams beside the buyer's page (sideFrames), then stays on its last frame.
      const side = sideFrames(vendorPage, "Vendor portal");
      try {
        const portal = new VendorPortalPage(vendorPage);
        // A vendor on the event: the one named (vendor: "<name>" or vendor: 2),
        // else the next one that has not bid yet in this plan. When none is left,
        // ask the tester / look one up in the Vendors module (anotherVendor), and
        // remember what worked — and what did not — for the next run.
        const cid = Number(process.env.COMPANY_ID) || null;
        // Everyone invited, not the four names the create screen shows: a
        // vendor this run can sign in as may be hidden in the "+N" chip.
        if (allowRealVendors() && !invitedFromDb && s.title) {
          const all = await invitedVendorNames(s.title, cid);
          if (all?.length) {
            invitedFromDb = true;
            if (all.length > invitedVendors.length) {
              console.log(`[bid] ${all.length} vendors are invited to “${s.title}” — choosing who bids from all of them, not only the names the create screen showed`);
            }
            invitedVendors = all;
          }
        }
        let email = "";
        let how = "";
        let found: { email: string; name: string; source: string } | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          found = null;
          try {
            email = await bidderEmail(a.vendor);
          } catch (err) {
            if (!allowRealVendors() || !NO_LOGIN.test((err as Error).message)) throw err;
            found = await anotherVendor(s, (err as Error).message);
            email = found.email;
          }
          side.relabel(`Vendor portal · ${email}`);
          await portal.goto();
          try {
            how = await portal.login(email);
          } catch (err) {
            const why = (err as Error).message.split("\n")[0].slice(0, 160);
            learnVendorLogin(cid, { name: found?.name ?? email, email, source: found?.source ?? "database", ok: false, why });
            biddersUsed.push(email);
            console.log(`[bid] ${email} could not sign in to the vendor portal (${why}) — I'll remember that and try another vendor`);
            if (attempt === 3) throw err;
            continue;
          }
          // Signed in: the event must be among this vendor's events. One that is
          // not was never invited — passed over for the next vendor, not bid as.
          try {
            await portal.openEvent(s.title);
            break;
          } catch (err) {
            if (!(err instanceof NotOnEventError) || attempt === 3) throw err;
            biddersUsed.push(email);
            console.log(`[bid] ${email} signed in, but “${s.title}” is not among its events on the vendor portal (not invited) — trying another vendor`);
            await vendorCtx.clearCookies().catch(() => {});
            await vendorPage.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* best effort */ } }).catch(() => {});
          }
        }
        biddersUsed.push(email);
        if (found) {
          learnVendorLogin(cid, { name: found.name, email, source: found.source, ok: true });
          console.log(`[bid] learned: ${found.name} signs in to the vendor portal as ${email} — the next run uses it without asking`);
        }
        await portal.startBidding(s.title);
        const cells = await portal.fillBid(Number(a.price ?? 100));
        // Nothing quoted is said here, not 10 s later as "no candidate was clickable" at Submit.
        if (!cells && portal.stage === "price") {
          throw new Error(`the vendor's quote sheet had no Price cell to fill (on ${new URL(vendorPage.url()).pathname}) — nothing was quoted`);
        }
        await portal.submitBid();
        const ok = await portal.bidSubmitted();
        s.bidSubmitted = ok;
        if (ok) (s.portalBids ??= []).push({ email, price: Number(a.price ?? 100), at: Date.now() });
        if (!ok) throw new Error("the vendor portal did not confirm the quote as submitted");
        if (portal.stage === "technical") {
          return `technical response submitted from the vendor portal as ${email}, signed in with ${how} — ${portal.lastFill}`;
        }
        if (portal.answeredTechnical) return `bid placed from the vendor portal as ${email}, signed in with ${how}: ${portal.lastFill}`;
        return `bid placed from the vendor portal as ${email}, signed in with ${how} (${cells} cell(s))`;
      } catch (err) {
        s.failObservation = (await observe(vendorPage, s.stepNo, "place_bid", { force: true }).catch(() => null)) ?? undefined;
        throw err;
      } finally {
        await side.stop();
        await vendorCtx.close().catch(() => {});
      }
    }
    case "evaluate_technical": {
      // The stage's evaluator scores each vendor's technical answer and submits (29 Oct). Procol lets only the
      // ASSIGNED evaluator score and never offers the event's creator as one, so the evaluator signs in to a tab of
      // their own beside the buyer's (Aanya chose this, 29 Oct — as the API journey already does). UAT only.
      if (!/\/project\//.test(s.page.url())) throw new Error("evaluate_technical needs the event's page — publish (or open_event) and close_event first");
      const projectUrl = s.page.url().replace(/(\/project\/[^/?#]+).*$/, "$1/details");
      await s.page.goto(projectUrl, NAV).catch(() => {});
      await s.page.getByRole("tab", { name: /technical/i }).first().click({ timeout: 10_000 }).catch(() => {});
      const evalLine = s.page.locator("p, div").filter({ hasText: /^\s*evaluator:/i }).last();
      await evalLine.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
      // "Evaluator: SK Satish Kumar Kaushik": the avatar's initials are their own element; the name is the last text.
      const evaluator = ((await evalLine
        .evaluate((el) => {
          const texts: string[] = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const t = (walker.currentNode.textContent || "").trim();
            if (t) texts.push(t);
          }
          return texts.filter((t) => !/^evaluator:?$/i.test(t)).pop() || "";
        })
        .catch(() => "")) || String(a.evaluator ?? "")).trim();
      if (!evaluator) throw new Error("the technical stage names no evaluator on its page, so nobody can score it");
      const companyId = Number(process.env.COMPANY_ID) || 198678;
      const candidates = process.env.UI_EVALUATOR_USER_ID ? [Number(process.env.UI_EVALUATOR_USER_ID)] : await usersNamed(evaluator);
      if (!candidates.length) throw new Error(`the evaluator is ${evaluator}, and no user of that name could be found to sign in as`);
      const browser = s.page.context().browser();
      if (!browser) throw new Error("no browser available to open the evaluator's tab");
      const evalCtx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
      await orchestrate(evalCtx).catch(() => {});
      const evalPage = await evalCtx.newPage();
      const side = sideFrames(evalPage, `Evaluator · ${evaluator}`);
      try {
        // Their saved session, or the login screen when Procol has expired it (signInUser).
        const tried: string[] = [];
        let signedIn: SignedIn | null = null;
        for (const id of candidates) {
          signedIn = await signInUser(evalPage, companyId, id, evaluator).catch((e) => (tried.push((e instanceof Error ? e.message : String(e)).split("\n")[0]), null));
          if (signedIn) break;
        }
        if (!signedIn) throw new Error(`${evaluator} (the stage's evaluator) could not be signed in — ${tried.join("; ")}`);
        if (signedIn.how === "on-screen") console.log(`[evaluate] ${evaluator} signed in on the login screen (${signedIn.fellBackBecause})`);
        const ev = new EvaluationPage(evalPage);
        await ev.open(projectUrl);
        // scores: one label for all, labels per vendor (column order), or numbers per vendor (higher = better label).
        const raw = Array.isArray(a.scores) ? a.scores.map(String) : a.scores !== undefined ? String(a.scores).split(/\s*,\s*/) : [];
        const numeric = raw.length > 0 && raw.every((x) => /^-?\d+(\.\d+)?$/.test(x));
        const pick = (i: number, _vendor: string, labels: string[]) => {
          if (!raw.length) return labels[0];
          if (numeric) {
            const n = raw.map(Number);
            const rank = [...n].sort((x, y) => y - x).indexOf(n[Math.min(i, n.length - 1)]);
            return labels[Math.min(rank, labels.length - 1)];
          }
          const want = raw[Math.min(i, raw.length - 1)];
          return labels.find((l) => l.toLowerCase() === want.toLowerCase()) ?? labels.find((l) => l.toLowerCase().includes(want.toLowerCase())) ?? want;
        };
        const r = await ev.scoreAll(pick, String(a.remark ?? "Scored by the spine.ai test run"));
        if (r.refused.length) throw new Error(`the evaluation did not go through: ${r.refused.join("; ")}`);
        if (!r.scored.length) throw new Error(`${evaluator} found no “Add Evaluation” to score — the evaluation time may be over, or every vendor is scored already`);
        if (!r.submitted) throw new Error(`the scores were saved but no line item's Submit went through`);
        s.evaluated = true;
        return `${evaluator} (the stage's evaluator, signed in beside the buyer) scored ${r.scored.map((x) => `${x.vendor}: ${x.label}`).join(", ")} and submitted ${r.submitted} line item(s)`;
      } catch (err) {
        s.failObservation = (await observe(evalPage, s.stepNo, "evaluate_technical", { force: true }).catch(() => null)) ?? undefined;
        throw err;
      } finally {
        await side.stop();
        await evalCtx.close().catch(() => {});
      }
    }
    case "place_surrogate_bid": {
      const surrogate = new SurrogateBidPage(s.page);
      // noPrice: the case submits the bid with no price (27 Oct, SB09) — NaN tells the page to type none.
      const price = a.noPrice === true || a.price === null || a.price === "" ? NaN : Number(a.price ?? 100);
      // With no vendor named, never the vendor who bids from the vendor portal in this plan — the one who
      // already did, or the one a later place_bid signs in as (27 Oct: "from one vendor submit surrogate
      // response, from other, login into that vendor"). Rows read "<name>-<email>", so the email matches.
      const portal = a.vendor ? [] : [...biddersUsed, ...(s.later?.includes("place_bid") ? [await bidderEmail().catch(() => "")] : [])].filter(Boolean);
      const onStage = /^(rfp|technical)/i.test(String(a.stage ?? "")) ? "technical" : "pricing";
      // Only this stage's surrogate bids count as "already bid": the technical answer entered for a vendor does not
      // stop its price bid (29 Oct, E2E01: both vendors were skipped and the bid fell back to the portal vendor).
      const sameStage = s.surrogateBids.filter((w) => (s.surrogateStage?.get(w) ?? "pricing") === onStage);
      const who = await surrogate.addBidFor(a.vendor ? String(a.vendor) : undefined, price, [...sameStage, ...portal], onStage).catch(async (err) => {
        // ALREADY DONE BY HAND (29 Oct, plan-mvt753ce): stuck at the technical response, the tester took the browser
        // and entered the RFQ bid of 100 as well; the next step found no "Add Bid" (that vendor had bid) and failed,
        // then held the browser again for nothing. After a by-hand part, Procol's own record decides: a surrogate
        // response of this kind for a vendor this step could have chosen means the step is done.
        if (!s.handDone) throw err;
        const eg = decodeProcolId(s.page.url().match(/\/project\/([^/?#]+)/)?.[1] ?? "");
        const fits = (v: string) => (a.vendor ? v.toLowerCase().includes(String(a.vendor).toLowerCase()) : ![...sameStage, ...portal].some((x) => x && (v.toLowerCase().includes(x.toLowerCase()) || x.toLowerCase().includes(v.toLowerCase()))));
        const found =
          onStage === "pricing"
            ? (eg ? await bidsOfEventGroup(eg).catch(() => []) : []).find((b) => b.by_buyer && fits(b.vendor) && (Number.isNaN(price) || b.price == null || Math.abs(b.price - price) < 0.001))
            : ((eg ? await responsesOf(eg) : null) ?? []).find((r) => r.kind === "technical" && r.surrogate && fits(r.vendor));
        if (!found) throw err;
        s.alreadyByHand = `${onStage === "pricing" ? `a surrogate bid${"price" in found && found.price != null ? ` of ${found.price}` : ""}` : "a surrogate technical response"} for ${found.vendor} is already in Procol — you entered it in the browser earlier`;
        return found.vendor;
      });
      if (s.alreadyByHand) {
        const said = s.alreadyByHand;
        s.alreadyByHand = undefined;
        (s.surrogateStage ??= new Map()).set(who, onStage);
        s.surrogateBids.push(who);
        surrogateFor.push(who);
        if (onStage === "pricing") s.typedBids.push({ vendor: who, price });
        s.bidSubmitted = true;
        return `already done: ${said}`;
      }
      (s.surrogateStage ??= new Map()).set(who, surrogate.lastKind === "technical" ? "technical" : onStage);
      s.surrogateBids.push(who);
      surrogateFor.push(who);
      s.typedBids.push({ vendor: who, price });
      s.bidSubmitted = true;
      return surrogate.lastKind === "technical"
        ? `technical response entered for ${who} — on a technical stage Procol's Add Bid is the vendor's answers to the questionnaire, not a price`
        : `surrogate bid entered for ${who}`;
    }
    case "start_awarding": {
      const award = new AwardPage(s.page);
      await award.startAwarding();
      return `on the awarding screen at ${new URL(s.page.url()).pathname}`;
    }
    case "allocate_award": {
      const award = new AwardPage(s.page);
      const allocated = await award.allocate(a.vendor ? String(a.vendor) : undefined);
      return `allocated ${allocated.items} line item(s) to ${allocated.vendors} vendor(s)`;
    }
    case "expect_award_counters": {
      const c = await new AwardPage(s.page).readCounters();
      const show = (x: { selected: number; total: number } | null) => (x ? `${x.selected}/${x.total}` : "(not shown)");
      const want = (v: unknown) => String(v ?? "").replace(/\s+/g, "");
      if (a.items !== undefined && show(c.items) !== want(a.items)) throw new Error(`"Tot. selected line items" reads ${show(c.items)} — the case expects ${want(a.items)}`);
      if (a.vendors !== undefined && show(c.vendors) !== want(a.vendors)) throw new Error(`"Awarded Vendors" reads ${show(c.vendors)} — the case expects ${want(a.vendors)}`);
      if (a.items === undefined && a.vendors === undefined) throw new Error("expect_award_counters needs items or vendors to compare");
      return `line items ${show(c.items)}, vendors ${show(c.vendors)}`;
    }
    case "award_event": {
      const award = new AwardPage(s.page);
      // "the lowest bidder" / "the surrogate vendor" / "the portal vendor" → the name the awarding grid shows (29 Oct).
      const who = await awardVendor(s, a.vendor ? String(a.vendor) : undefined);
      await award.startAwarding();
      const allocated = await award.allocate(who);
      const outcome = await award.createAndSubmitProposal();
      s.awarded = true;
      return `awarded ${allocated.items} line item(s) to ${allocated.vendors} vendor(s) — ${outcome}`;
    }
    case "expect_awarded":
      expect(s.awarded, "nothing was awarded in this plan, so there is no award to confirm").toBe(true);
      return "the event is awarded";
    case "expect_bid_submitted": {
      expect(s.bidSubmitted, "no bid has been placed in this plan, so there is nothing to confirm").toBe(true);
      // Procol's own record, not only the run's word for it (Aanya, 29 Oct: "how did the vendor bid without
      // filling price, or did it fill but it doesn't show here??" — the portal's last picture, taken while
      // the sheet reloaded, showed empty prices; the bid held 95 on all 3 lines, ₹33,535).
      const title = s.title ?? "";
      const eg = decodeProcolId(s.page.url().match(/\/project\/([^/?#]+)/)?.[1] ?? "") ?? (title ? (await eventGroupByTitle(title).catch(() => undefined))?.id : undefined);
      const bids = eg ? await bidsOfEventGroup(eg).catch(() => null) : null;
      if (!bids) return "the bid is submitted (the portal said so; Procol's database could not be read to confirm it)";
      const mine = bids.filter((b) => !b.by_buyer);
      const want = s.portalBids?.[s.portalBids.length - 1];
      if (want && !mine.length) throw new Error("the portal said the bid was submitted, but Procol has no bid from a vendor on this event");
      const last = mine[mine.length - 1] ?? bids[bids.length - 1];
      if (!last) throw new Error("Procol has no bid on this event");
      if (want && last.price != null && Math.abs(last.price - want.price) > 0.001) throw new Error(`Procol holds ${last.vendor}'s bid at ${last.price}, not the ${want.price} typed`);
      const money = last.amount != null ? `, total ₹${last.amount.toLocaleString("en-IN")}` : "";
      return `Procol holds ${last.vendor}'s bid: ${last.price ?? "no price"}${last.lines > 1 ? ` on each of ${last.lines} lines` : ""}${money}`;
    }
    case "invite_vendor": {
      if (await isSingleStageScreen(s)) {
        // The invite rule (spine/animesh, 21 Oct): a vendor the case names is searched for;
        // otherwise the product's own Invite Vendor takes everyone it suggests. On a QA-only run
        // (aanya) only QA test vendors may be named: a real one is swapped for the client's QA
        // vendors, and the run says so.
        const asked = Array.isArray(a.vendors) ? a.vendors.map(String) : Array.isArray(a.names) ? a.names.map(String) : a.vendor ? [String(a.vendor)] : [];
        const qa = await qaVendorNames();
        const names = allowRealVendors() ? asked : asked.filter((n) => isQaVendorName(n, qa));
        const real = allowRealVendors() ? [] : asked.filter((n) => !isQaVendorName(n, qa));
        const added: string[] = [];
        for (const n of names) {
          if (await s.single.addParticipant(n)) added.push(n);
          else console.log(`[single-stage] no vendor matched "${n}" in the participants search`);
        }
        if (!added.length) await s.single.inviteVendor();
        invitedVendors = allowRealVendors() ? added : added.filter((n) => isQaVendorName(n, qa));
        return swapNote(real) + (added.length ? `invited ${added.join(", ")} (single-stage)` : "invited every vendor the product suggested (single-stage)");
      }
      const asked = Array.isArray(a.vendors) ? (a.vendors as unknown[]).map(String) : vendorNames();
      const min = a.count !== undefined ? Number(a.count) : vendorCount();
      // A real supplier named in the plan is swapped for the client's QA test
      // vendors (real suppliers are never invited): the run goes on, and says so.
      let names = asked;
      let real: string[] = [];
      if (!allowRealVendors() && asked.length) {
        const qa = await qaVendorNames();
        real = asked.filter((n) => !isQaVendorName(n, qa));
        names = asked.filter((n) => isQaVendorName(n, qa));
      }
      // A count the case names is exact: that many vendors, each one this run can bid as.
      const exact = a.count !== undefined && !names.length;
      const invited = await s.create.inviteVendors({ names, count: min, exact });
      // A named vendor the search did not know never reached the round (the invite fell back to
      // the product's suggested list): a later check on that vendor has nothing to find.
      for (const nm of names) if (!invited.some((x) => x.toLowerCase() === nm.toLowerCase()) && !s.unmatchedVendors.includes(nm)) s.unmatchedVendors.push(nm);
      if (s.create.leftCreateScreen()) {
        const id = s.page.url().match(/\/project\/([^/?#]+)/)?.[1];
        if (id) s.projectId = s.projectId ?? id;
        s.didByHand = true;
        return `you published the event yourself (project ${id ?? "?"}) while vendors were being added`;
      }
      const present = await s.create.participantNames();
      invitedVendors = present.length ? present : invited;
      invitedFromDb = false;
      // The chips show four names and "+193": the count reads the "+N" too.
      const total = (await s.create.participantCount()) || present.length;
      if (names.length && invited.length) return swapNote(real) + `invited ${invited.join(", ")} (${total} total)`;
      if (exact && invited.length) {
        invitedVendors = invited;
        return swapNote(real) + `invited ${invited.length} vendor${invited.length === 1 ? "" : "s"} — ${invited.join(", ")} — each one this run can bid as (Procol's suggested list cleared)`;
      }
      if (invited.length) return swapNote(real) + `added ${invited.join(", ")} — ${total} vendors invited in all`;
      return (
        swapNote(real) +
        ((min ?? 0) > 1 && total >= (min ?? 0)
          ? `${total} vendors invited (Procol's list for this event) — the ${min} asked for are among them, so none were added`
          : `${total} vendor${total === 1 ? "" : "s"} invited${present.length ? `: ${present.join(", ")}${total > present.length ? ", …" : ""}` : ""}`)
      );
    }
    case "publish":
      if (await isSingleStageScreen(s)) {
        await s.single.publish(s.title);
        const redirected = await s.single.waitForRedirectToProject().then(() => true).catch(() => false);
        if (!redirected) {
          // Say what the screen says instead of "waitForURL timed out": the
          // app refuses single-stage publishes inline (form messages), not
          // with a toast, and the traffic-light range is the usual reason.
          const inline = (await s.page.locator(".ant-form-explain, .has-error, [role='alert'], .ant-message-notice").allTextContents())
            .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4);
          const toast = await s.single.errorToastText(800);
          await recordStuck(s.page, {
            label: "single-stage-publish",
            message: `publish did not reach a project page${toast ? ` — toast: ${toast}` : ""}${inline.length ? ` — on screen: ${inline.join(" | ")}` : ""}`,
            triedCandidates: ["waitForURL(/project|orders/:id)"],
            healerTried: false,
          }).catch(() => {});
          throw new Error(`the single-stage publish did not reach a project page${toast ? ` — the app said: ${toast}` : ""}${inline.length ? ` — on screen: ${inline.join(" | ")}` : " (captured for a look)"}`);
        }
        const id = s.single.projectId();
        if (id) s.projectId = id;
        return `published as ${id ?? "(no id in URL)"} (single-stage)`;
      }
      // A count the case named is exact: undo a late pre-fill of Procol's suggestions.
      await s.create.keepExactInvite();
      // Whatever this client makes mandatory is filled before pressing Publish — a case that expects the publish
      // to go through is not about those fields (29 Oct). A case asserting a refusal gets nothing it did not ask for.
      const pre = s.negativeCase ? null : await fillRequiredFields(s.page).catch(() => null);
      await s.create.publishAndAwaitOutcome(s.title);
      s.projectId = s.create.projectId() ?? s.projectId;
      return `published as ${s.create.projectId()}${pre && sweepSaid(pre) ? ` — first ${sweepSaid(pre)}` : ""}`;
    case "save_draft":
      // The single-stage screen offers only "Publish Event" (captured 2026-10-21): say so
      // rather than spend ten seconds looking for a button the product does not draw there.
      if (await isSingleStageScreen(s)) throw new Error("the single-stage create screen has no Save as draft — only Publish Event; a draft needs the eRFX screen");
      await s.create.saveAsDraft();
      return "saved as draft";

    // ── assertions ────────────────────────────────────────────────────────
    case "expect_line_items": {
      if (await isSingleStageScreen(s)) {
        return "single-stage sheet holds its line item (no Items badge on this screen)";
      }
      const want = asInt(a.count, s.lineItemsAdded || 1);
      const badge = await s.create.lineItemCountBadge();
      // evidence: which products the price sheet actually lists (its "Product" column)
      const rows = await s.page
        .evaluate(() => {
          const table = document.querySelector(".data-grid-container table");
          if (!table) return [] as string[];
          const trs = [...table.querySelectorAll("tr")];
          const heads = [...(trs[0]?.querySelectorAll("td,th") ?? [])].map((c) => (c.textContent || "").replace(/\*/g, "").trim().toLowerCase());
          const col = heads.findIndex((h) => /^product/.test(h));
          if (col < 0) return [] as string[];
          return trs.slice(1).map((tr) => ((tr.querySelectorAll("td")[col]?.textContent || "").trim())).filter(Boolean);
        })
        .catch(() => [] as string[]);
      const listed = rows.length ? `; the sheet lists ${rows.map((r) => `“${r.slice(0, 40)}”`).join(", ")}` : "";
      expect(badge, `the toolbar should show ${want} line item(s) — it shows ${badge}${listed}`).toBe(want);
      return `badge shows ${badge}${listed}`;
    }
    case "expect_published": {
      const id = s.create.projectId();
      expect(id, "the browser should be on a published project page").toBeTruthy();
      return `project ${id}`;
    }
    case "expect_no_error": {
      const err = await s.create.errorToastText(1_500);
      expect(err, `the app should show no error (it said: ${err})`).toBeFalsy();
      return "no error shown";
    }
    case "expect_error": {
      // A field-level toast (e.g. an invalid quantity) can easily have fired
      // and faded well before this step runs — the step that typed the bad
      // value already captured it the instant it appeared. Only fall back to
      // a fresh live wait when nothing was captured earlier in the run.
      const captured = s.create.lastQuantityError;
      const err = captured ?? (await s.create.errorToastText(5_000));
      expect(err, "the app was expected to refuse this").toBeTruthy();
      // Case aside: a plan writes "quantity" for the app's "Quantity should be …".
      if (a.contains) expect((err ?? "").toLowerCase(), `the app's words: ${err}`).toContain(String(a.contains).toLowerCase());
      return captured ? `app said (caught as it appeared): ${err}` : `app said: ${err}`;
    }
    case "expect_publish_blocked": {
      if (s.earlyRefusal) {
        // Blocked before publish could be reached. Judge the app's words against the reason.
        const said = (/“([^”]*)”/.exec(s.earlyRefusal)?.[1] ?? /reads: “([^”]*)/.exec(s.earlyRefusal)?.[1] ?? s.earlyRefusal).toLowerCase();
        const because = String(a.because ?? "").toLowerCase().trim();
        if (because && !said.includes(because) && !namesReason(said, because)) {
          if (PARTICIPANTS_FIRST.test(said) && BEFORE_PARTICIPANTS.test(because)) return `blocked before publish — ${s.earlyRefusal}${participantsFirstNote(because)}`;
          throw new Error(`publishing was blocked earlier, but the app's words do not name the reason — the case expects "${because}"; ${s.earlyRefusal}`);
        }
        return `blocked before publish — ${s.earlyRefusal}`;
      }
      // Say WHY the app may have allowed it: the product audience adds vendors
      // from the line items on its own, so "no participants" is often untrue.
      const participants = await s.create.participantCount().catch(() => -1);
      const participantsNote = participants >= 0 ? ` — ${participants} participant(s) were on the event (the product audience adds vendors from the line items)` : "";
      // Two shapes of "blocked" exist on this screen and a test should accept
      // either: the confirm button rendered but disabled, or the app refusing
      // outright with a message. Insisting on one makes the test brittle about
      // something it does not care about.
      const p = s.page;
      const startUrl = p.url();
      await s.create.dismissDistractions();
      await p.getByRole("button", { name: /^publish( event)?$/i }).first().click({ timeout: 10_000 }).catch(() => {});
      await p.waitForTimeout(1_500);
      // Shape 1 of "blocked": the confirm button rendered but disabled.
      const confirm = p.locator(".ant-modal-content, [role='dialog']").getByRole("button", { name: /^publish|confirm|yes/i }).first();
      if (await confirm.count()) {
        const disabled = await confirm.isDisabled().catch(() => false);
        if (disabled) return "the confirm button is disabled, as expected";
        // A live confirm: the app is asking, not refusing. Pressing it is what
        // the case means by "publish"; a refusal may still follow.
        await confirm.click({ timeout: 5_000 }).catch(() => {});
      }
      // Now wait for ONE of three outcomes, not just a toast. UI-PART-001's
      // publish with no participants produced no toast — and no event under
      // Live, Drafts or History either: the click did nothing observable.
      // "No refusal" was being read as "allowed"; it was neither.
      const deadline = Date.now() + 20_000;
      let refusal: string | null = null;
      let published = false;
      while (Date.now() < deadline && !refusal && !published) {
        refusal = await s.create.errorToastText(500);
        if (!refusal) {
          const inline = (await p.locator(".ant-message-notice, [role='alert'], .ant-form-explain, .has-error .ant-form-explain").allTextContents())
            .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
          if (inline.length) refusal = inline.join(" | ");
        }
        if (!refusal && BasePage.projectIdFromUrl(p.url())) published = true;
        if (!refusal && !published) await p.waitForTimeout(500);
      }
      if (refusal) {
        // Say WHAT the app said when it is not what the case expects — a bare
        // "expect(received).toContain(expected)" hid the one fact that matters
        // (the product checks participants before the template, so a publish
        // with neither is refused for participants).
        const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (a.because && !n(refusal).includes(n(String(a.because))) && !namesReason(String(refusal), String(a.because))) {
          if (/created successfully|published successfully|event (is )?live/i.test(String(refusal))) {
            throw new Error(`publishing was ALLOWED — the app said "${refusal}"; the case expects it to be refused with "${a.because}" (check the plan really built the case's starting condition)`);
          }
          if (PARTICIPANTS_FIRST.test(String(refusal)) && BEFORE_PARTICIPANTS.test(String(a.because))) return `blocked: ${refusal}${participantsFirstNote(String(a.because))}`;
          throw new Error(`publishing was blocked, but for a different reason — the app said "${refusal}"; the case expects "${a.because}"`);
        }
        return `blocked: ${refusal}`;
      }
      if (published) {
        // Decide what an allowed publish MEANS: read the published event's own
        // participant count. Zero = an event nobody can bid on went live (a
        // product defect); more = the product audience supplied vendors, so the
        // case's premise cannot be reached on this tenant.
        let note = "";
        const chip = p.getByRole("button", { name: /participants\s*\d+/i }).or(p.getByRole("tab", { name: /participants/i })).first();
        await chip.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        const text = ((await chip.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
        const n = Number((text.match(/(\d+)/) || [])[1]);
        if (Number.isFinite(n)) note = ` The published event shows ${n} participant(s)` + (n === 0 ? " — an event nobody can bid on was published: a product defect." : " — the product audience supplied them from the line items, so this tenant cannot reach the case's premise of no participants.");
        throw new Error(`publishing was expected to be blocked, but the app published ${BasePage.projectIdFromUrl(p.url())}${participantsNote}.${note}`);
      }
      // The app refused the quantity as it was typed (add_line_items caught that toast) and now
      // Publish does nothing: nothing was published and the case's refusal was already given
      // (21 Oct, A16: −5 refused at entry, then Publish silent for 20 s). Blocked, with the
      // silent Publish said.
      const typed = s.create.lastQuantityError;
      const wn = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (typed && (!a.because || wn(typed).includes(wn(String(a.because))) || namesReason(typed, String(a.because)))) {
        return `blocked: the event did not publish — the app had refused the quantity when it was typed (“${typed}”); pressing Publish then did nothing for 20 s, with no message of its own${participantsNote}`;
      }
      // Neither: no message, no modal refusal, no navigation — and nothing to
      // find in the events list afterwards. For a case that expects a message this is the finding.
      throw new Error(
        `publishing was expected to be blocked WITH a message, but the app neither refused visibly nor published: after Publish the page stayed at ${new URL(startUrl).pathname} with no toast, no inline message and no navigation for 20s${participantsNote}. A silent no-op where the case expects ${a.because ? `“${a.because}”` : "a refusal"}.`,
      );
    }
    case "expect_stages": {
      const want = asStages(a.stages);
      // The create screen paints its stage tabs after a loading spinner; reading the strip
      // while it spins sees no stages. Wait (bounded) for the spinner to go and the tabs to settle.
      await s.create.waitForSpinnerHidden().catch(() => {});
      let have = await s.create.currentStages();
      for (let i = 0; i < 10 && have.length === 0; i++) {
        await s.create.page.waitForTimeout(1_000);
        have = await s.create.currentStages();
      }
      if (have.length === 0) throw new Error("the stage tabs never rendered within 40s — the screen did not finish loading (not evidence about the product)");
      expect(have.sort(), `the stage tabs read ${have.join(", ")}`).toEqual(want.sort());
      return `stages are ${have.join(", ")}`;
    }
    case "open_purchase_requisitions":
    case "pr_tab":
    case "select_pr":
    case "purchase_items":
    case "choose_stages":
    case "expect_pr_items":
      return prStep(s, step.step, a);
    case "do_on_screen": {
      /**
       * A PART THE RUN WORKS OUT ON SCREEN ITSELF (Aanya, 26 Oct: "my playwright has capacity
       * to take ss and test"). The explorer does it in this browser, a screenshot per action,
       * and it counts as tested only when the screen proves the goal. Stuck, it asks the tester
       * exactly as ask_tester does — what a person then does by hand is still theirs.
       */
      const goal = String(a.goal ?? a.need ?? "").trim().replace(/\.$/, "");
      if (!goal) throw new Error("do_on_screen needs a goal");
      const gapRun = `${process.env.QA_RUN_ID || "plan"}-gap${++gapCount}`;
      const done = await explore(s.page, { goal, runId: gapRun, companyId: Number(process.env.COMPANY_ID) || null, askFirst: false });
      if (done.byHand) s.didByHand = true;
      if (done.passed) return `done on screen: ${goal}${done.proof ? ` — the screen shows “${mask(done.proof)}”` : ""}`;
      return askForPart(s, `${goal} (I tried on screen and stopped: ${mask(done.reason ?? "it stopped")})`, { learnAs: goal, triedOnScreen: true });
    }
    case "ask_tester":
      return askForPart(s, String(a.need ?? a.what ?? "this part of the case"));
    default:
      // validatePlan should have caught this long before now.
      throw new Error(`unknown step "${step.step}"`);
  }
}

/**
 * AN EVENT MADE FROM A PURCHASE REQUEST, one step at a time (Aanya, 26 Oct: "after we select the pr,
 * we go to purchase item … then start new project then … select technical stage … if the user doesnt
 * specify then stop and ask"; "break it into steps like u did for events"). The steps click what the
 * screen names — the explorer kept opening Actions — and only fall back to working a screen out (a
 * route the tester shows is learned) where Procol's own words are not found.
 */
const STAGE_WORDS: Record<string, string> = { rfp: "Technical", rfq: "RFQ", auction: "Auction" };
const STAGE_LABEL: Record<string, RegExp> = { rfp: /^\s*(technical( stage)?|rfp)\s*$/i, rfq: /^\s*rfq( stage)?\s*$/i, auction: /^\s*auction( stage)?\s*$/i };
const EVENT_CHOICES = [
  { id: "rfp", label: "Technical" },
  { id: "rfq", label: "RFQ" },
  { id: "auction", label: "Auction" },
  { id: "rfp+rfq", label: "Technical + RFQ" },
  { id: "rfp+auction", label: "Technical + Auction" },
];
function stagesFrom(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  if (/technical|\brfp\b|\btech\b/.test(t)) out.push("rfp");
  if (/\brfq\b/.test(t)) out.push("rfq");
  if (/auction/.test(t)) out.push("auction");
  return out;
}

const visibleNow = (l: Locator, ms = 8_000) => l.first().waitFor({ state: "visible", timeout: ms }).then(() => true).catch(() => false);

async function prStep(s: RunState, name: string, a: Record<string, unknown>): Promise<string> {
  const page = s.page;
  switch (name) {
    case "open_purchase_requisitions": {
      await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/purchase-requisitions?tab=active`, NAV);
      await s.events.dismissDistractions().catch(() => false);
      const ok = await visibleNow(page.getByText(/^\s*purchase requisitions\s*$/i), 20_000);
      expect(ok, `the Purchase Requisitions screen did not open (at ${new URL(page.url()).pathname})`).toBe(true);
      return "opened Purchase Requisitions";
    }
    case "pr_tab": {
      const tab = String(a.tab ?? "Open");
      const t = page.getByRole("tab", { name: new RegExp(`^\\s*${tab}\\b`, "i") }).or(page.getByText(new RegExp(`^\\s*${tab}\\s*$`, "i")));
      expect(await visibleNow(t), `no “${tab}” tab on Purchase Requisitions`).toBe(true);
      await t.first().click();
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      const count = (await page.getByRole("tab", { name: new RegExp(`^\\s*${tab}\\b`, "i") }).first().innerText().catch(() => "")).replace(/\D+/g, " ").trim();
      return `on the ${tab} tab${count ? ` (${count} PRs)` : ""}`;
    }
    case "select_pr": {
      const rows = page.locator("tbody tr, .ant-table-row").filter({ has: page.locator("input[type='checkbox']") });
      expect(await visibleNow(rows, 20_000), "no PR rows with a tick-box on this tab").toBe(true);
      // Each row of the list is ONE line item, drawn twice: the frozen columns (tick-box, PR NO) in one
      // table and the rest in another, joined by data-row-key. Read them as one line per key.
      const lines = await page.evaluate(() => {
        const byKey = new Map<string, { key: string; pr: string; text: string }>();
        document.querySelectorAll("tr[data-row-key]").forEach((tr) => {
          const key = tr.getAttribute("data-row-key") ?? "";
          const cur = byKey.get(key) ?? { key, pr: "", text: "" };
          const pr = [...tr.querySelectorAll('a[href*="/purchase-requisitions/"]')].map((x) => (x.textContent ?? "").trim()).find((t) => /^\d{5,}$/.test(t));
          if (pr) cur.pr = pr;
          const t = ((tr as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim();
          if (t.length > cur.text.length) cur.text = t;
          byKey.set(key, cur);
        });
        return [...byKey.values()].filter((l) => l.key);
      });
      /**
       * "A PR with N line items" (Aanya, 27 Oct): a PR NO on at least N rows of this tab; all N of its
       * rows ticked. Material rows are preferred: a service row ("2 Services") becomes several line
       * items on the create screen, so a count asked for would not hold.
       */
      const want = a.pr ? 0 : asInt(a.items, 0);
      if (want > 1) {
        const groups = new Map<string, typeof lines>();
        for (const l of lines) if (l.pr) groups.set(l.pr, [...(groups.get(l.pr) ?? []), l]);
        const service = (l: (typeof lines)[number]) => /\bservices?\b/i.test(l.text) || /(^|\s)S(\s|$)/.test(l.text.slice(0, 40));
        const fits = [...groups].filter(([, ls]) => ls.length >= want);
        const pick = fits.find(([, ls]) => !ls.slice(0, want).some(service)) ?? fits[0];
        if (!pick) {
          const most = Math.max(0, ...[...groups.values()].map((ls) => ls.length));
          throw new Error(`no PR on this page of the tab has ${want} line items (the most one PR has here is ${most})`);
        }
        const [pr, ls] = pick;
        for (const l of ls.slice(0, want)) {
          const box = page.locator(`tr[data-row-key="${l.key}"] input[type='checkbox']`).filter({ visible: true }).first();
          await box.check({ force: true }).catch(async () => {
            await page.locator(`tr[data-row-key="${l.key}"] .ant-checkbox-wrapper`).filter({ visible: true }).first().click();
          });
          expect(await box.isChecked(), `PR ${pr}'s line “${l.text.slice(0, 50)}” did not tick`).toBe(true);
        }
        s.prNo = pr;
        s.prItems = want;
        const pi = page.getByRole("button", { name: /purchase items/i });
        expect(await pi.first().isEnabled().catch(() => false), "Purchase Items stayed greyed out after ticking the PR's lines").toBe(true);
        const kinds = ls.slice(0, want).some(service) ? " (service lines: Procol may list more items on the create screen)" : "";
        return `ticked ${want} line items of PR ${pr}${kinds} — and Purchase Items is on`;
      }
      const row = a.pr ? rows.filter({ hasText: String(a.pr) }).first() : rows.first();
      expect(await visibleNow(row), `no PR “${a.pr}” on this tab`).toBe(true);
      const box = row.locator("input[type='checkbox']").first();
      await box.check({ force: true }).catch(async () => {
        await row.locator(".ant-checkbox-wrapper, .ant-checkbox, label").first().click();
      });
      expect(await box.isChecked(), "the PR's tick-box did not tick").toBe(true);
      s.prNo = (await row.locator("a").first().innerText().catch(() => "")).trim() || undefined;
      // The PR NO sits in the frozen-column copy of the row; read it by the row's key when the row had none.
      if (!s.prNo || !/^\d{5,}$/.test(s.prNo)) {
        const key = await row.getAttribute("data-row-key").catch(() => null);
        s.prNo = lines.find((l) => l.key === key)?.pr || undefined;
      }
      const item = (await row.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 70);
      const pi = page.getByRole("button", { name: /purchase items/i });
      const on = await pi.first().isEnabled().catch(() => false);
      expect(on, "Purchase Items stayed greyed out after ticking the PR").toBe(true);
      return `ticked PR ${s.prNo ?? "(first row)"} — ${item} — and Purchase Items is on`;
    }
    case "purchase_items": {
      // Purchase Items → its menu's "Start New Project" → the Purchase Cart ("1 PR | 1 Line Item").
      // The event's stages are ticked in the cart, under Create Project's arrow (choose_stages).
      const pi = page.getByRole("button", { name: /purchase items/i });
      expect(await visibleNow(pi), "no Purchase Items button").toBe(true);
      await pi.first().click();
      const start = page.getByRole("menuitem", { name: /start new project/i }).or(page.getByText(/^\W*start new project\s*$/i));
      expect(await visibleNow(start, 8_000), "Purchase Items did not offer Start New Project").toBe(true);
      await start.first().click();
      const cart = page.getByText(/purchase cart/i);
      expect(await visibleNow(cart, 15_000), "Start New Project did not open the Purchase Cart").toBe(true);
      const size = (await page.getByText(/\d+\s*PR\s*\|\s*\d+\s*Line Item/i).first().innerText().catch(() => "")).trim();
      // A PR's N lines were ticked (select_pr{items}): the cart must hold all N.
      if (s.prItems) {
        const inCart = Number(size.match(/(\d+)\s*Line Item/i)?.[1] ?? 0);
        expect(inCart, `the Purchase Cart should hold the ${s.prItems} line items ticked on PR ${s.prNo} — it reads “${size || "no count"}”`).toBe(s.prItems);
      }
      return `Purchase Items → Start New Project opened the Purchase Cart${size ? ` (${size})` : ""}${s.prNo ? ` for PR ${s.prNo}` : ""}`;
    }
    case "choose_stages": {
      let stages = (Array.isArray(a.stages) ? a.stages : []).map(String).filter((x) => x in STAGE_WORDS);
      let asked = "";
      if (!stages.length) {
        const answer = await askTester({
          kind: "question",
          question: "Which event should I make from the PR?",
          detail: "The case does not say which stages the event has. Pick one, or type it (for example “technical + RFQ”). RFQ and Auction cannot be in one event.",
          options: EVENT_CHOICES.map((c) => ({ id: c.id, label: c.label })),
        });
        if (!answer) throw new Error("not run: the case does not say which event to make from the PR, and nobody answered which (Technical, RFQ, Auction, Technical + RFQ or Technical + Auction)");
        stages = answer.option && EVENT_CHOICES.some((c) => c.id === answer.option) ? String(answer.option).split("+") : stagesFrom(answer.text);
        if (!stages.length) throw new Error(`the answer “${answer.text}” names no stage — Technical, RFQ or Auction`);
        asked = ` (you chose ${stages.map((x) => STAGE_WORDS[x]).join(" + ")})`;
        // The picked stages' own steps, each its own row, right after the check on the PR's items.
        const plan = s.planSteps;
        if (plan && !plan.some((x) => ["select_template", "fill_questionnaires", "fill_sheet"].includes(x.step))) {
          const here = (s.stepNo ?? 1) - 1;
          const after = plan.findIndex((x, k) => k > here && x.step === "expect_pr_items");
          plan.splice((after >= 0 ? after : here) + 1, 0, ...stageSteps(stages));
        }
      }
      if (stages.includes("rfq") && stages.includes("auction")) throw new Error("RFQ and Auction cannot be in one event — Procol offers no auction stage after an RFQ (A23)");
      const names = stages.map((x) => STAGE_WORDS[x]).join(" + ");
      // In the Purchase Cart: Create Project's arrow lists the stages as tick-boxes (Technical Stage,
      // RFQ, Auction); tick the case's, then Create Project, which stays greyed until one is ticked.
      const BOX: Record<string, RegExp> = { rfp: /^\s*technical( stage)?\s*$/i, rfq: /^\s*rfq( stage)?\s*$/i, auction: /^\s*auction( stage)?\s*$/i };
      const option = (st: string) => page.getByRole("checkbox", { name: BOX[st] }).or(page.getByRole("menuitemcheckbox", { name: BOX[st] })).or(page.getByText(BOX[st]));
      // Once a stage is ticked the button reads "Create Project 1" (a count of the ticked stages).
      const create = page.getByRole("button", { name: /^\s*create project\s*\d*\s*$/i });
      const before = page.url();
      let done = "";
      try {
        if (!(await visibleNow(option(stages[0]), 2_500))) {
          const group = page.locator(".ant-btn-group, .ant-dropdown-button, .ant-space-compact, [class*='btn-group' i]").filter({ hasText: /create project/i });
          const arrow = group.locator("button").last();
          if (await visibleNow(arrow, 3_000)) await arrow.click();
          else await page.getByText(/^\s*start new project\s*$/i).first().click({ timeout: 3_000 });
        }
        for (const st of stages) {
          const opt = option(st).first();
          expect(await visibleNow(opt, 6_000), `no “${STAGE_WORDS[st]}” choice under Create Project`).toBe(true);
          const box = page.getByRole("checkbox", { name: BOX[st] }).first();
          if (await box.isVisible().catch(() => false)) {
            if (!(await box.isChecked().catch(() => false))) await box.check({ force: true }).catch(() => opt.click());
          } else await opt.click();
        }
        if (a.dry === true || a.dry === "true") return `ticked ${names} under Create Project (dry: Create Project not clicked)`;
        await expect(create.first(), "Create Project stayed greyed out after ticking the stages").toBeEnabled({ timeout: 8_000 });
        await create.first().click();
        await page.waitForURL((u) => u.toString() !== before, { timeout: 30_000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await s.create.waitForSpinnerHidden().catch(() => {});
        if (page.url() !== before) done = `ticked ${names} under Create Project and created the event — it opened at ${new URL(page.url()).pathname}`;
      } catch (e) {
        console.log(`[pr] the Purchase Cart did not match what was expected (${(e as Error).message.split("\n")[0]}) — working it out on screen, inside the cart`);
      }
      if (done) return `${done}${asked}`;
      // The cart looks different from the last time: worked out on screen, kept inside the cart (the
      // explorer once left for Events and made a blank event). What a tester then shows is learned.
      const goal =
        `In the open Purchase Cart (stay in it — never go to Events or Create Event): set the new project's stages to ${names} and nothing else ` +
        `(they are tick-boxes under the arrow next to Create Project), then click Create Project; stop when the new event's page opens`;
      const companyId = Number(process.env.COMPANY_ID) || null;
      const gapRun = `${process.env.QA_RUN_ID || "plan"}-gap${++gapCount}`;
      const r = await explore(page, { goal, runId: gapRun, companyId, askFirst: false });
      if (r.byHand) s.didByHand = true;
      // A blank event made elsewhere is caught by the next step (expect_pr_items: the PR's items must be listed).
      if (r.passed && !/purchase-requisitions/i.test(new URL(page.url()).pathname)) {
        return `created the event with ${names} from the Purchase Cart, worked out on screen${asked}`;
      }
      return `${await askForPart(s, `${goal} (I tried on screen and stopped: ${mask(r.reason ?? "it stopped")})`, { learnAs: goal, triedOnScreen: true })}${asked}`;
    }
    case "expect_pr_items": {
      await s.create.waitForSpinnerHidden().catch(() => {});
      let badge: number | null = null;
      for (let k = 0; k < 10 && !badge; k++) {
        badge = await s.create.lineItemCountBadge().catch(() => null);
        if (!badge) await page.waitForTimeout(1_000);
      }
      expect(badge ?? 0, `the create screen lists no line items from PR ${s.prNo ?? ""} (at ${new URL(page.url()).pathname})`).toBeGreaterThan(0);
      if (s.prItems) expect(badge ?? 0, `the create screen should list the ${s.prItems} line items ticked on PR ${s.prNo} — it lists ${badge}`).toBeGreaterThanOrEqual(s.prItems);
      return `the create screen lists ${badge} line item${badge === 1 ? "" : "s"} from PR ${s.prNo ?? ""}`.trim();
    }
  }
  throw new Error(`unknown PR step ${name}`);
}

/** Each stage's own steps, on its own tab: a template, then questionnaires + evaluator (Technical) or the sheet. */
export function stageSteps(stages: string[]): PlanStep[] {
  const out: PlanStep[] = [];
  for (const stage of stages) {
    if (stages.length > 1) out.push({ step: "switch_stage", args: { stage } });
    out.push({ step: "select_template" });
    if (stage === "rfp") out.push({ step: "fill_questionnaires" }, { step: "assign_evaluator" });
    else out.push({ step: "fill_sheet" });
  }
  return out;
}

/** A part of the case with no step: ask the tester for the steps, or let them do it by hand. */
async function askForPart(s: RunState, needText: string, learn: { learnAs?: string; triedOnScreen?: boolean } = {}): Promise<string> {
  const companyId = Number(process.env.COMPANY_ID) || null;
  const goal = (learn.learnAs ?? needText).trim().replace(/\.$/, "");
  // Shown by hand before (or worked out from typed steps): follow that first, and ask only if it no
  // longer gets there (Aanya, 26 Oct: "whatever i do in ui, learn that so that u dont get stuck again").
  let routeNote = "";
  if (!learn.triedOnScreen && hasRoute(companyId, goal)) {
    const gapRun = `${process.env.QA_RUN_ID || "plan"}-gap${++gapCount}`;
    const done = await explore(s.page, { goal, runId: gapRun, companyId, askFirst: false });
    if (done.byHand) s.didByHand = true;
    if (done.passed) return `done on screen the way it was shown before: ${goal}${done.proof ? ` — the screen shows “${mask(done.proof)}”` : ""}`;
    routeNote = ` The steps shown for this before no longer got there (${mask(done.reason ?? "it stopped")}).`;
  }
  /**
   * NO STEP FOR THIS PART: ASK, DON'T GUESS (Aanya, 21 Oct: "whatever u dont
   * have, ask the user for creds or for the further steps, dont fool the
   * user… we want the real metrics"). The run asks in the chat; typed steps
   * or a login are carried out here, on this page, by the explorer; what is
   * skipped or left unanswered is not tested, and what the tester does by
   * hand is theirs. Nothing here is ever counted as tested unless the run did it.
   */
  const need = needText.trim().replace(/\.$/, "");
  // Said plainly (Aanya, 21 Oct: "what does it mean"): the part, what it
  // takes in short numbered pieces, and an example of an answer.
  // One sentence of the part, never the whole goal (Aanya, 27 Oct: "why is it giving so many big paras, no one will read so").
  const first = need.split(/(?<=[.!?])\s+/)[0].replace(/[.\s]+$/, "");
  const short = first.length > 150 ? `${first.slice(0, 147).replace(/\s+\S*$/, "")}…` : first;
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const example = /evaluat|scor/i.test(need)
    ? "“Sign in as the evaluator (phone …, code …), open Technical Stage → Evaluate, give 4/5, submit.”"
    : /vendor|supplier/i.test(need)
      ? "“Sign in to the vendor portal as <vendor> (email …, code …), open the event, …, then check ….”"
      : "“Open …, click …, type …, then check ….”";
  const askedAt = Date.now();
  const answer = await askTester({
    kind: "question",
    question: `I can't do this part on my own yet: ${lower(short)}. How should I do it?`,
    detail: `${routeNote ? routeNote.trim() + " " : ""}Type the steps and any login (kept as •••), e.g. ${example} Or do it yourself, or skip it — either way it counts as not tested.`,
    options: [
      { id: "self", label: "I'll do it myself in the browser" },
      { id: "skip", label: "Skip it — count it as not tested" },
    ],
  });
  if (!answer) {
    s.notTested = `no step for: ${need} — nobody answered the question, so it was not tested`;
    return s.notTested;
  }
  if (answer.option === "skip" || (!answer.option && (SAYS_STOP.test(answer.text) || /^\s*(skip|leave it|not now|no)\b/i.test(answer.text)))) {
    s.notTested = `no step for: ${need} — you chose to skip it, so it was not tested`;
    return s.notTested;
  }
  if (answer.option === "self") {
    // The card's option presses Take control (or they took it from the live view and handed it back,
    // which answers the card); carry on from the page handed back.
    const hand = await handPart(askedAt);
    s.didByHand = true;
    // Their steps become the route for this part: the next run does it on its own (and only then is it tested).
    const kept = saveHandRoute(companyId, goal, hand, process.env.QA_RUN_ID || "plan");
    const note = kept
      ? ` — your ${hand.steps.length} step${hand.steps.length === 1 ? "" : "s"} are saved, so the next run does this itself`
      : hand.secret
        ? " — not saved for next time: a code or password was typed"
        : "";
    return `you did this in the browser: ${need}${note}`;
  }
  // Typed: the tester's steps (and any login), carried out here.
  const gapRun = `${process.env.QA_RUN_ID || "plan"}-gap${++gapCount}`;
  const opts = { goal: `${need}. The tester's instructions: ${answer.text}`, runId: gapRun, companyId: Number(process.env.COMPANY_ID) || null, askFirst: false };
  const done = await explore(s.page, opts);
  if (done.byHand) s.didByHand = true;
  // Typed steps that got there: kept under the plain part too, so the next run needs no instructions.
  if (done.passed && done.route?.savedTo) keepRouteAs(companyId, opts.goal, goal);
  if (!done.passed) {
    s.notTested = `no step for: ${need} — following your steps did not get there (${mask(done.reason ?? "it stopped")}), so it was not tested`;
    return s.notTested;
  }
  return `followed your steps for: ${need}${done.proof ? ` — the screen shows “${mask(done.proof)}”` : ""}`;
}

export async function runPlan(page: Page, plan: TestPlan): Promise<PlanResult> {
  biddersUsed = [];
  surrogateFor = [];
  const s: RunState = {
    events: new EventsPage(page),
    create: new CreateEventPage(page),
    single: new SingleStagePage(page),
    page,
    title: plan.context?.title ?? generateEventTitle("UI_Plan"),
    widgets: {},
    products: [],
    lineItemsAdded: 0,
    bidSubmitted: false,
    surrogateBids: [],
    typedBids: [],
    unmatchedVendors: [],
    awarded: false,
    memory: {},
    prevMark: 0,
    curMark: 0,
    context: plan.context ?? {},
    planSteps: plan.steps,
    stepNo: 0,
  };

  console.log(`[plan] ${plan.title} — ${plan.steps.length} step(s)${plan.context?.state ? ` on a ${plan.context.state} event built by API` : ""}`);
  const results: StepResult[] = [];
  const observations: Observation[] = [];
  const runId = process.env.QA_RUN_ID ?? `plan-${Date.now().toString(36)}`;
  installObserver(page, runId);
  installSpotlight(page, joinInv(process.cwd(), "evidence", runId.replace(/[^\w.-]+/g, "_")));
  /** The observation pass after a step — bounded, and never the reason a step fails. */
  // `picture`: a screenshot too — only where a step failed (Aanya, 26 Oct: no picture per step).
  // `at`: the step's result, which gets the screen in words and what the step did.
  const look = async (i: number, name: string, force: boolean, picture = false, at?: number) => {
    const o = await Promise.race([
      observe(page, i + 1, name, { force, picture }).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 25_000)),
    ]);
    if (at !== undefined && results[at]) {
      if (o?.screen) results[at].screen = o.screen;
      const acts = stepActions();
      if (acts.length) results[at].actions = acts;
    }
    if (o && (o.findings.length || o.screenshot)) observations.push(o);
    if (o?.findings.length) console.log(`[observe] after ${name}: ${o.findings.map((f) => `${f.rule}: ${f.detail}`).join(" | ").slice(0, 300)}`);
  };
  let failed = false;
  let recoveries = 0;
  const recoveredRules = new Set<string>();
  const BLOCK_ASSERTION_STEPS = new Set(["expect_publish_blocked", "expect_error", "expect_message", "attempt", "expect_field_error"]);
  // a case asserting a refusal: publish fills no mandatory field for it (it may be about one)
  s.negativeCase = plan.steps.some((st) => BLOCK_ASSERTION_STEPS.has(st.step) || st.step === "skip");
  /** index of the block assertion to jump to after an early refusal */
  let jumpTo = -1;
  const BLOCK_ASSERTIONS = ["expect_publish_blocked", "expect_error", "expect_message"];

  // A message typed to the run while it goes: "stop" ends it, "skip" skips the next step. Anything else
  // waits for a step that can use it — the on-screen steps (explorer) read it at their next move.
  const COMMAND = /^\s*(stop|abort|cancel|end it|stop (the|this) (run|test)|skip( (this|the next|next) step)?)\s*[.!]*\s*$/i;
  const kept = new Set<string>();
  let stoppedBy = "";

  // An index loop: a case that failed on a picked event can start again from open_event.
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const started = Date.now();
    if (!failed && !stoppedBy) {
      const cmd = takeTold((t) => COMMAND.test(t))[0];
      if (cmd && /^\s*skip/i.test(cmd)) {
        results.push({ step: step.step, args: step.args, status: "skipped", untested: true, detail: `skipped — you said “${cmd.trim()}”`, ms: 0 });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ⊘ skipped — you said “${cmd.trim()}”`);
        continue;
      }
      if (cmd) stoppedBy = cmd.trim();
      for (const t of pendingTold()) {
        if (kept.has(t)) continue;
        kept.add(t);
        console.log(`[note] · Your message “${t.slice(0, 160)}” is kept — the next on-screen step reads it at its first move.`);
      }
    }
    if (stoppedBy) {
      results.push({ step: step.step, args: step.args, status: "skipped", untested: true, detail: `not run — you said “${stoppedBy}”`, ms: 0 });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ⊘ not run — you said “${stoppedBy}”`);
      continue;
    }
    if (jumpTo > i) {
      results.push({ step: step.step, args: step.args, status: "skipped", detail: "not reached — the app refused an earlier step, which the block assertion below judges", ms: 0 });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} — not reached (the app refused earlier)`);
      continue;
    }
    if (failed) {
      // Once a step fails the page is in an unknown state; running the rest
      // would produce failures that say nothing about the product.
      results.push({ step: step.step, args: step.args, status: "skipped", ms: 0 });
      continue;
    }
    // Proactive, not reactive: without this, a toast like "enable browser
    // notifications" only gets dismissed after a click fails against it (or
    // after the watchdog's 60s stuck timer), sitting on screen the whole
    // time. Clearing it before every step is a ~400ms-debounced no-op when
    // nothing is showing, so it costs nothing on the steps that don't need it.
    await s.create.dismissDistractions().catch(() => false);
    try {
      s.prevMark = s.curMark;
      s.curMark = await toastMark(s.page);
      s.lastStrategy = undefined;
      s.stepNo = i + 1;
      s.later = plan.steps.slice(i + 1).map((x) => x.step);
      s.laterPlan = plan.steps.slice(i + 1);
      beginStep(i + 1, step.step, plan.steps.length);
      const detail = await runStep(s, step);
      // Done by the tester in the browser, not by the run: recorded as such and
      // never counted as tested — a run they finished by hand is partly tested.
      if (s.didByHand) {
        s.didByHand = false;
        results.push({ step: step.step, args: step.args, status: "skipped", byHand: true, detail: `done by you in the browser, not tested by the run — ${detail ?? ""}`.replace(/ — $/, ""), ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ⊘ done by you in the browser, not tested by the run`);
        continue;
      }
      // A part with no step that was not done (ask_tester): not tested, never a pass.
      if (s.notTested) {
        const why = s.notTested;
        s.notTested = undefined;
        results.push({ step: step.step, args: step.args, status: "skipped", untested: true, detail: why, ms: Date.now() - started });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ⊘ not tested — ${why}`);
        continue;
      }
      if (/^expect_/.test(step.step)) await spotlightVerify(page, `${step.step}${detail ? ` — ${detail}` : ""}`).catch(() => {});
      // They took the browser in the middle of this step and did something (Aanya, 28 Oct: "my platform
      // doesnt ignore it"): said on the step, and the step counts as helped by hand, not tested alone.
      const helped = takeHandSteps(started).steps;
      if (helped.length) {
        const did = helped.map((h) => h.step).slice(0, 6).join("; ");
        results.push({ step: step.step, args: step.args, status: "ok", byHand: true, detail: `${detail ?? ""} — you also did by hand while it ran: ${did}`.replace(/^ — /, ""), ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ with your help by hand: ${did}`);
        await look(i, step.step, i === plan.steps.length - 1, false, results.length - 1);
        continue;
      }
      results.push({ step: step.step, args: step.args, status: "ok", detail, ...(s.lastStrategy ? { strategy: s.lastStrategy } : {}), ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ ${detail ?? ""}`);
      await look(i, step.step, i === plan.steps.length - 1, false, results.length - 1);
    } catch (err) {
      // Keep the first line AND the locator Playwright names in its call log.
      // Reporting only "locator.click: Timeout 15000ms exceeded" cost an
      // afternoon of grepping to find WHICH click; the call log says so
      // outright, and it is two lines.
      const message = err instanceof Error ? err.message : String(err);
      const first = message.split("\n")[0];
      const selector = message
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("- waiting for") || l.startsWith("- locator"));
      const detail = selector ? `${first} — ${selector.replace(/^-\s*/, "")}` : first;
      // What did the app SAY while this step ran — and is it one of its own rules?
      const said = [
        ...((/rejected by the app:\s*(.+)$/i.exec(first)?.[1] ?? "").trim() ? [/rejected by the app:\s*(.+)$/i.exec(first)![1].trim()] : []),
        // a refusal is an error or a warning — "Proposal submitted successfully" explains no failure
        ...(await appMessagesSince(page, s.curMark).catch(() => [])).filter((m) => m.kind === "error" || m.kind === "warning").map((m) => m.text),
      ].filter((t, k, all) => t && all.indexOf(t) === k);
      const ruled = said.map((t) => ({ t, rule: appRuleFor(t) })).find((x) => x.rule) ?? mandatoryRefusal(said, step.step);
      let ruledLast: typeof ruled = null;
      let lastRefusal: string | null = null;

      // RECOVER: the case is positive (it asserts no refusal), the app refused by a rule the
      // run's own setup broke, and the code says how to satisfy it — do that, retry the step
      // once, and say so. Never for a case that is testing the refusal, never twice for the
      // same rule, at most two recoveries a run.
      const negative = plan.steps.some((st) => BLOCK_ASSERTION_STEPS.has(st.step) || st.step === "skip");
      // A refusal can hide the next one: a new version's publish first wants its evaluator,
      // then its questionnaire sections. Each retry is judged afresh, and a DIFFERENT known
      // rule is recovered too — bounded by the run's cap and never the same rule twice.
      let cur = ruled;
      let recovery = cur ? recoveryWith(cur.t) : null;
      const chain: Array<{ appSaid: string; rule: string; why: string; did: string[] }> = [];
      let recoveredStep = false;
      while (cur && recovery && !negative && recoveries < 5 && !recoveredRules.has(cur.rule!.message)) {
        recoveries++;
        recoveredRules.add(cur.rule!.message);
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ↻ the app refused: "${cur.t}" — its rule (${cur.rule!.source}); ${recovery.why}. Doing ${recovery.steps.map((x) => x.step).join(" + ")}, then retrying`);
        const did: string[] = [];
        let recoveredOk = true;
        for (const rs of recovery.steps) {
          try {
            const d = await runStep(s, rs);
            did.push(`${rs.step}${d ? `: ${d}` : ""}`);
          } catch (re) {
            did.push(`${rs.step} could not run: ${(re instanceof Error ? re.message : String(re)).split("\n")[0]}`);
            recoveredOk = false;
            break;
          }
        }
        chain.push({ appSaid: cur.t, rule: cur.rule!.source, why: recovery.why, did });
        if (!recoveredOk) break;
        try {
          s.prevMark = s.curMark;
          s.curMark = await toastMark(s.page);
          const detail2 = await runStep(s, step);
          const told = chain.map((c) => `the app refused "${c.appSaid}" (${c.rule}); ${c.why}`).join(", then ");
          if (/^expect_/.test(step.step)) await spotlightVerify(page, `${step.step}${detail2 ? ` — ${detail2}` : ""}`).catch(() => {});
          results.push({ step: step.step, args: step.args, status: "ok", detail: `${detail2 ?? ""} — after recovering: ${told}`, recovered: { ...chain[0], did: chain.flatMap((c) => c.did) }, ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
          console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ ${detail2 ?? ""} (after recovering from ${chain.map((c) => `"${c.appSaid}"`).join(" and ")})`);
          await look(i, step.step, false, false, results.length - 1);
          recoveredStep = true;
          break;
        } catch (retryErr) {
          const m2 = (retryErr instanceof Error ? retryErr.message : String(retryErr)).split("\n")[0];
          console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✗ still refused after recovering (${did.join("; ")}): ${m2}`);
          const said2 = [
            ...((/rejected by the app:\s*(.+)$/i.exec(m2)?.[1] ?? "").trim() ? [/rejected by the app:\s*(.+)$/i.exec(m2)![1].trim()] : []),
            ...(await appMessagesSince(page, s.curMark).catch(() => [])).filter((m) => m.kind === "error" || m.kind === "warning").map((m) => m.text),
          ].filter((t, k, all) => t && all.indexOf(t) === k);
          cur = said2.map((t) => ({ t, rule: appRuleFor(t) })).find((x) => x.rule) ?? mandatoryRefusal(said2, step.step);
          recovery = cur ? recoveryWith(cur.t) : null;
          if (cur) ruledLast = cur;
          lastRefusal = m2;
          if (!cur && said2[0]) ruledLast = null;
        }
      }
      if (recoveredStep) continue;

      // The APP refused this step (not the automation failing to perform it) and the case goes on
      // to assert a block: that refusal IS the block — judge it there rather than stopping here.
      // So does a setup step that fails BECAUSE of a refusal the case already saw: A17 ("quantity
      // \"ten\"… try to publish", 23 Oct) — the app refused the text, no line item was added, so no
      // vendor could be invited, and the case stopped at invite_vendor instead of judging the block.
      const refusedBefore = results.some((r) => r.status === "ok" && /^expect_(error|field_error|message)$/.test(r.step));
      const setupAfterRefusal = refusedBefore && CREATE_SCREEN_STEP.test(step.step) && step.step !== "publish";
      const later = /^the app refused/i.test(first) || setupAfterRefusal ? plan.steps.findIndex((st, k) => k > i && BLOCK_ASSERTIONS.includes(st.step)) : -1;
      if (later > i && setupAfterRefusal && !/^the app refused/i.test(first)) {
        // not the app refusing THIS step — it could not run after the refusal already seen
        const seen = results.filter((r) => r.status === "ok" && /^expect_(error|field_error|message)$/.test(r.step)).pop()?.detail ?? "";
        jumpTo = later;
        results.push({ step: step.step, args: step.args, status: "skipped", detail: `could not run (${first}) — the app had already refused the case's input${seen ? ` (${seen})` : ""}; the block is judged at step ${later + 1}`, ms: Date.now() - started });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ⊘ could not run after the app's earlier refusal — judging the block at step ${later + 1}`);
        continue;
      }
      if (later > i) {
        s.earlyRefusal = first;
        jumpTo = later;
        results.push({ step: step.step, args: step.args, status: "ok", detail: `refused by the app — ${first}`, ms: Date.now() - started });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ refused by the app (the case asserts a block at step ${later + 1}) — ${first}`);
        continue;
      }
      // report the LAST refusal — after recoveries it is the one still standing
      const lastRule = lastRefusal ? ruledLast : ruled;
      const ruleNote = lastRule ? ` — the app's own rule (${lastRule.rule!.source})${recoveryFor(lastRule.t) ? "" : "; no known way for the run to satisfy it"}` : said.length ? ` — the app said "${said[0]}", which is not one of its known rules` : "";
      const failedAt = results.length;
      // Procol's own crash page ("Oops! Something Broke Down…") is the app breaking, whatever the
      // step was waiting for: on 21 Oct pressing the audience suggestion's Invite Vendor showed it,
      // and the step reported "no participants", which the oracle then filed as a harness problem.
      const crashed = await page.getByText(/something broke down/i).first().isVisible({ timeout: 1000 }).catch(() => false);
      const crashNote = crashed ? `Procol crashed — it showed its error page “Oops! Something Broke Down…” during ${step.step}. ` : "";
      const failText = crashNote + (lastRefusal ?? detail) + (lastRefusal && !lastRule ? " — the app said this after the recoveries above; it is not one of the dashboard's own rules" : ruleNote);
      results.push({ step: step.step, args: step.args, status: "failed", detail: failText, ms: Date.now() - started, ...(stepShots().length ? { spotlights: stepShots() } : {}) });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✗ ${failText}`);
      const before = observations.length;
      // The screen the step failed on: the vendor's, for a bid; else the buyer's.
      if (s.failObservation) {
        observations.push(s.failObservation);
        s.failObservation = undefined;
      } else await look(i, step.step, true, true, failedAt);
      const shot = observations.slice(before).find((o) => o.screenshot)?.screenshot;
      results[failedAt].evidence = {
        ...(shot ? { screenshot: shot } : {}),
        url: page.url(),
        ...(lastRefusal ? { appSaid: [lastRefusal.replace(/^.*rejected by the app:\s*/i, "")] } : said.length ? { appSaid: said.slice(0, 5) } : {}),
        ...(lastRule ? { rule: { message: lastRule.rule!.message, source: lastRule.rule!.source, ...(lastRule.rule!.condition ? { condition: lastRule.rule!.condition } : {}) } } : {}),
      };
      if (shot) console.log(`[plan] evidence: ${shot}`);
      // The case ran on an event the RUN picked, and failed: say why, and let the tester choose —
      // mark it failed, or run the case again on another suitable event (Aanya, 26 Oct: "if it
      // fails on one event, tell the user the reason… give an option to mark it as failed or try
      // it on a different event"). With nobody to ask, it is marked failed as before.
      const openAt = plan.steps.findIndex((st) => st.step === "open_event");
      let markedFailed = false;
      if (s.picked && openAt >= 0 && i > openAt && (s.avoidEvents?.length ?? 0) < 3) {
        const why = failText.replace(/\s+/g, " ").trim().slice(0, 300);
        const answer = await askTester({
          kind: "stuck",
          question: `It failed on “${s.picked}” because ${why.charAt(0).toLowerCase()}${why.slice(1)}. Mark it failed, or try it on another event?`,
          detail: `Step ${i + 1} of ${plan.steps.length} (${step.step}) failed on an event the run picked from the Live list${s.avoidEvents?.length ? `, after ${s.avoidEvents.length} other${s.avoidEvents.length === 1 ? "" : "s"}` : ""}. Another event is picked the same way, passing over the ones already tried.`,
          ...(shot ? { shot: shot.split("/").pop() } : {}),
          options: [
            { id: "fail", label: "Mark it failed" },
            { id: "retry", label: "Try it on another suitable event" },
          ],
        }).catch(() => null);
        const retry = answer?.option === "retry" || (!answer?.option && /\b(another|other|different|retry|try)\b/i.test(answer?.text ?? ""));
        if (retry) {
          s.avoidEvents = [...(s.avoidEvents ?? []), s.picked];
          s.attempts = [...(s.attempts ?? []), `“${s.picked}”: step ${i + 1} (${step.step}) failed — ${why}`];
          console.log(`[plan] trying the case again on another event, as you chose — passing over ${s.avoidEvents.map((t) => `“${t}”`).join(", ")}`);
          // what the failed attempt did to the run's own state; the events it acted on stay as they are
          Object.assign(s, { bidSubmitted: false, surrogateBids: [], typedBids: [], unmatchedVendors: [], awarded: false, counterOfferSent: undefined, counterOfferAccepted: undefined, closed: undefined, orders: undefined, earlyRefusal: undefined, picked: undefined, memory: {} });
          results.length = openAt;
          jumpTo = -1;
          i = openAt - 1;
          continue;
        }
        if (answer) results[failedAt].detail = `${failText} — you marked it failed${answer.option ? "" : ` (“${answer.text.slice(0, 120)}”)`}`;
        markedFailed = !!answer;
      }
      // CONTINUE FROM WHERE IT STOPPED (Aanya, 27 Oct: "when i said invite the vendors, then you must
      // continue from where you left, not from the scratch"). The browser stays on the screen this step
      // failed on; the tester says how to finish it — in the question card or by messaging the running
      // test — the run does it there, and carries on with the steps after it.
      // Only an action is finished as told: a failed check is the case's result — a bug, never a step to
      // talk past — and so is a step a negative case expected to be refused.
      const isCheck = STEP_CATALOG.find((d) => d.name === step.step)?.assertion || BLOCK_ASSERTION_STEPS.has(step.step);
      const resumed = markedFailed || isCheck || s.noHold ? null : await continueAsTold(s, i, plan.steps.length, step.step, failText, shot);
      s.noHold = false;
      if (resumed && "tried" in resumed) results[failedAt].detail = `${results[failedAt].detail} — then, as you said, ${resumed.tried}`;
      else if (resumed) {
        // the step's own failure stays in its detail and evidence: the tester's way finished it, not the step
        results[failedAt] = { ...results[failedAt], status: "ok", continuedAsTold: resumed.text, detail: `the step itself failed (${failText}) → finished on the same screen as you said: ${resumed.note}`, ...(resumed.byHand ? { byHand: true } : {}) };
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✓ finished as you said: ${resumed.note}`);
        continue;
      }
      failed = true;
    }
  }

  const byHand = results.filter((r) => r.byHand).length;
  const untested = results.filter((r) => r.untested).length;
  return { title: plan.title, steps: results, passed: !failed, ...(byHand ? { byHand } : {}), ...(untested ? { untested } : {}), observations };
}

/** More time for the running test, while it waits for the tester or does what they said. */
function moreTime(ms: number): void {
  try {
    const t = test.info();
    if (t.timeout > 0) t.setTimeout(t.timeout + ms);
  } catch {
    /* not inside a Playwright test (a script run): no limit to move */
  }
}

/**
 * A failed step, finished the way the tester says, on the same screen. Their instruction comes from the
 * question card or a message sent to the running test; "stop" (or no answer within UI_FAIL_HOLD_MS,
 * 10 minutes by default) ends the run as failed. Up to three tries, each told what the last one hit.
 */
async function continueAsTold(s: RunState, i: number, total: number, stepName: string, failText: string, shot?: string): Promise<{ text: string; note: string; byHand: boolean } | { tried: string } | null> {
  const holdMs = Number(process.env.UI_FAIL_HOLD_MS ?? 10 * 60_000);
  if (!holdMs || !process.env.UI_EXPLORE_DIR || !process.env.QA_RUN_ID) return null; // nobody can answer
  const companyId = Number(process.env.COMPANY_ID) || null;
  let lastTry = "";
  // LEARN WHAT TO DO WHEN STUCK (Aanya, 28 Oct: "it should learn what to do when it is stuck"). The way
  // the tester finished this step the last time it stopped here — by hand, or in words — is kept under
  // the stuck point (the step, the screen, the kind of failure) and done first, before asking again.
  const learnedGoal = stuckGoal(stepName, s.page.url(), failText);
  if (hasRoute(companyId, learnedGoal)) {
    console.log(`[plan] step ${i + 1} (${stepName}) stopped where it stopped before — doing what you showed then`);
    moreTime(6 * 60_000);
    const r = await explore(s.page, { goal: learnedGoal, runId: `${process.env.QA_RUN_ID}-learned`, companyId, askFirst: false });
    if (r.byHand) s.didByHand = true;
    if (r.passed) return { text: "as you showed the last time", note: `did what you showed the last time it stopped here${r.proof ? ` — the screen shows “${mask(r.proof)}”` : ""}`, byHand: !!r.byHand };
    lastTry = `What you showed the last time did not finish it here (${mask(r.reason ?? "it stopped").slice(0, 160)}).`;
  }
  for (let round = 1; round <= 3; round++) {
    // An instruction sent to the running test before this question showed is used as it is; once the
    // question shows, the chat box answers it.
    let text = round === 1 ? (takeTold((t) => !/^\s*skip\b/i.test(t))[0]?.trim() ?? "") : "";
    const askedAt = Date.now();
    if (!text) {
      moreTime(holdMs); // the test's own time limit (12 min a plan) must not close the browser while it waits
      const a = await askTester(
        {
          kind: "stuck",
          question: `Step ${i + 1} of ${total} (${stepName}) stopped: ${failText.replace(/\s+/g, " ").slice(0, 240)}. How should I finish it? I'm keeping this browser on that screen.`,
          detail: `${lastTry ? `${lastTry} ` : ""}Type what to do (for example “invite the vendors”), or do it yourself in the browser. I'll carry on with the steps after it — not start again — and remember how, for the next time it stops here.`,
          ...(shot ? { shot: shot.split("/").pop() } : {}),
          options: [
            { id: "self", label: "I'll do it myself in the browser" },
            { id: "stop", label: "Stop here — mark it failed" },
          ],
        },
        holdMs,
      );
      if (!a || a.option === "stop") return lastTry ? { tried: lastTry } : null;
      if (a.option === "self") {
        // Their way, by hand, on this screen: kept under the stuck point, so the next run does it itself.
        moreTime(holdMs);
        const hand = await handPart(askedAt);
        if (!hand.held) {
          lastTry = "You chose to do it yourself, but the browser was never taken.";
          continue;
        }
        // Handed back with nothing done (only looked or scrolled): the step is not finished — ask again.
        if (!hand.steps.length && !hand.secret) {
          // "surrogate bid step has been done" typed while holding (29 Oct, plan-mvt753ce): their word that it was
          // done already — by hand, earlier — so carry on, marked as done by them, instead of asking again.
          const said = takeTold((t) => /\b(done|already|completed|finished|placed|submitted)\b/i.test(t) && !SAYS_STOP.test(t))[0];
          if (said) {
            s.didByHand = true;
            s.handDone = true;
            console.log(`[plan] step ${i + 1} (${stepName}) — you said “${mask(said).slice(0, 120)}”: carrying on`);
            return { text: mask(said).slice(0, 300), note: `you said “${mask(said).slice(0, 120)}” — done by you in the browser`, byHand: true };
          }
          lastTry = "You had the browser, but nothing was clicked or typed.";
          continue;
        }
        s.didByHand = true;
        s.handDone = true;
        const kept = saveHandRoute(companyId, learnedGoal, hand, process.env.QA_RUN_ID || "plan");
        const n = hand.steps.length;
        const why = kept
          ? ` — your ${n} step${n === 1 ? "" : "s"} are saved; the next time it stops here, I do them myself`
          : hand.secret
            ? " — not saved for next time: a code or password was typed"
            : "";
        console.log(`[plan] step ${i + 1} (${stepName}) finished by you in the browser${why}`);
        return { text: "done by you in the browser", note: `you did it in the browser${why}`, byHand: true };
      }
      text = (a.text ?? "").trim();
    }
    if (!text || SAYS_STOP.test(text)) return lastTry ? { tried: lastTry } : null;
    console.log(`[plan] continuing step ${i + 1} (${stepName}) as you said: “${mask(text).slice(0, 160)}”`);
    moreTime(8 * 60_000);
    const goal = `${text}. Do it on this screen (the run stopped at ${stepName}: ${failText.replace(/\s+/g, " ").slice(0, 160)}), then stop — the steps after it are run separately`;
    const r = await explore(s.page, { goal, runId: `${process.env.QA_RUN_ID}-resume${round}`, companyId, askFirst: false });
    if (r.byHand) s.didByHand = true;
    // The way their words got there is kept under the stuck point too: the next run needs no words.
    if (r.passed && r.route?.savedTo) keepRouteAs(companyId, goal, learnedGoal);
    if (r.passed) return { text: mask(text).slice(0, 300), note: `“${mask(text).slice(0, 120)}”${r.proof ? ` — the screen shows “${mask(r.proof)}”` : ""}`, byHand: !!r.byHand };
    lastTry = `Doing “${mask(text).slice(0, 80)}” did not get there (${mask(r.reason ?? "it stopped").slice(0, 160)}).`;
  }
  return lastTry ? { tried: lastTry } : null;
}

/**
 * The stuck point a way to finish is kept under: the step, the screen (its path, with ids left out) and
 * the kind of failure (its words, without numbers or quoted values), so the same stop on another event
 * finds it and a different stop on the same screen does not.
 */
export function stuckGoal(stepName: string, url: string, failText: string): string {
  let screen = "app";
  try {
    screen = new URL(url).pathname.split("/").filter(Boolean).map((seg) => (/\d/.test(seg) || seg.length > 24 ? "id" : seg)).join(" ") || "home";
  } catch {
    /* not a web address: "app" */
  }
  const kind = failText
    .toLowerCase()
    .replace(/[“"‘'][^”"’']*[”"’']/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return `Finish ${stepName.replace(/_/g, " ")} on ${screen}, which stopped: ${kind}`;
}

/**
 * The run's own event's purchase orders, polled until some exist. The event is the one in the
 * page's /project/<id> (its title on screen can differ from the run's title); the newest event
 * group with the run's title is the fallback.
 */
async function waitForOrders(url: string, title: string, ms: number): Promise<DbOrder[]> {
  const fromUrl = decodeProcolId(url.match(/\/project\/([^/?#]+)/)?.[1] ?? "") ?? undefined;
  const until = Date.now() + ms;
  for (;;) {
    const egId = fromUrl ?? (await eventGroupByTitle(title).catch(() => undefined))?.id;
    const orders = egId ? await ordersOfEventGroup(egId).catch(() => [] as DbOrder[]) : [];
    if (orders.length || Date.now() > until) return orders;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
