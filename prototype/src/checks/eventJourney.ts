import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isTokenClient } from "../../config/tokenClients.js";
import { PROCOL_TEST } from "../executor.js";
import { redactSecrets } from "./engine.js";
import { evaluateStepAssertions, keepResponse } from "./apiAssertions.js";
import {
  CHOICE_WORD,
  STAGE_LABEL,
  STEP_META,
  journeyOutcome,
  type ChoiceKind,
  type EventType,
  type JourneyBacktrack,
  type JourneyCall,
  type JourneyFinding,
  type JourneyPlan,
  type JourneyRecord,
  type JourneyResilience,
  type JourneyStepAttempt,
  type JourneyStepRecord,
  type StageKind,
  type StepKind,
  type VariationsEvent,
} from "./journeyModel.js";
import {
  BOUNDS,
  ChoiceBook,
  STEP_CHOICES,
  WatchdogTimeout,
  backoffMs,
  backtrackOrigin,
  blameSentence,
  classifyStep,
  failureSentence,
  rankTemplates,
  rankUnits,
  unitListed,
  withWatchdog,
  type ChoiceOption,
  type Classified,
} from "./resilience.js";

/**
 * THE JOURNEY RUNNER — walks the Postman collection, one step per request.
 *
 * The run used to open with the sibling framework's `createEvent`, a single
 * call that built a whole event and threw on the first thing that went wrong.
 * The report then had one line for the setup and forty rows of variations on
 * `PATCH /event_groups/<id>`, and a reader could not tell whether a buyer can
 * actually run a sourcing round on this build — which is the question.
 *
 * So the runner here does what the collection does, in the collection's
 * order, and says what happened after each request in one plain sentence:
 * sign in, create the draft, add each round, publish, sign in as the vendor,
 * respond, bid, wait for the window to close, evaluate, award. Every step is
 * ONE decisive request through the sibling `ApiClient.attempt`, which returns
 * the outcome instead of throwing, so a refusal is recorded as a fact about
 * the product rather than as a crash of the run. The expectation is written
 * down before the request fires; the narration is written after.
 *
 * Nothing here decides pass or fail by itself. A 2xx that carries what the
 * step needs is "worked"; a 4xx is "refused" with the app's own words; a 5xx
 * or no reply is "broken"; and a step whose inputs an earlier step failed to
 * produce is "not run" with a reason that names that step. Independent steps
 * still run, so a refused vendor login does not hide a broken award.
 *
 * Bodies are the collection's own, via `procol test/src/flows/bodies.ts`;
 * paths via `Endpoints`. The sibling is imported by `file://` URL at first use
 * (its directory has a space in it and a different tsconfig), so its types
 * are described structurally here and never imported.
 */

// ── what the runner is given ───────────────────────────────────────────────

/** What the runner reads off an open client context; matches `openClientContext`. */
export interface JourneyClient {
  ctx: {
    /** the sibling ApiClient signed in as the buyer through a web-console session */
    buyerApi: any;
    catalog?: Partial<EventCatalog>;
    evaluatorUuid?: string;
    vendor?: { uuid?: string; email?: string; name?: string };
    companyId?: number;
    companyName?: string | null;
  };
  companyName?: string | null;
}

interface EventCatalog {
  productUuid: string;
  productQualityUuid: string;
  technicalTemplateUuid: string;
  pricingTemplateUuid: string;
  locationUuid: string;
  vendorBidCompanyUuid: string;
  useRfqQuotes: boolean;
}

export interface JourneyRunOptions {
  /** where the vendor and evaluator sign in; defaults to the sibling's configured host */
  baseURL?: string;
  /** how long each round stays open, in seconds — short, so the run can wait it out (default 60) */
  stageSeconds?: number;
  /** also build a second copy of the event for the library cases to act on */
  buildVariationsEvent?: boolean;
  /** called as each step finishes, with the number of steps planned */
  onStep?: (step: JourneyStepRecord, planned: number) => void;
  /** progress lines between steps — the wait's countdown, the second event's build */
  onLine?: (line: string) => void;
  /**
   * TESTING ONLY: force the first choice of some data, to prove the retry and
   * backtracking work (e.g. { unit: "Nos" } on a company without that unit).
   * Also read from the SPINE_JOURNEY_FORCE environment variable
   * ("unit=Nos;location=<uuid>"). The record says a choice was forced.
   */
  force?: Partial<Record<ChoiceKind, string>>;
  /**
   * A caller's choice of data (the template chooser, the bidding matrix): it
   * REPLACES the catalog's first pick before anything is built. Unlike
   * `force`, it is not a test of the retry: it is the run's intended data. If
   * the app refuses a chosen value, the never-stuck alternatives still apply,
   * starting from it, and the record says what was chosen and what replaced it.
   */
  choose?: {
    pricingTemplateUuid?: string;
    technicalTemplateUuid?: string;
    unit?: string;
    productUuid?: string;
    /** the quality that goes with productUuid (the catalog's is kept when absent) */
    productQualityUuid?: string;
    /** a QA vendor to invite and sign in as instead of the catalog's vendor */
    vendor?: { uuid: string; email: string; name?: string };
  };
  /** the whole journey's time budget, retries included (default 30 minutes) */
  journeyBudgetMs?: number;
  /** TESTING ONLY: a shorter watchdog for request steps (default BOUNDS.stepMs) */
  stepBoundMs?: number;
}

export interface JourneyRunResult {
  journey: JourneyRecord;
  /** the ids the library cases address, when a second copy of the event was built */
  forCases?: { eventGroupUuid: string; tradeId?: string; lineItemUuid: string };
}

// ── the sibling framework, loaded once ─────────────────────────────────────

interface Sibling {
  bodies: any;
  Endpoints: any;
  CONFIG: any;
  ApiClient: any;
  authenticate: (identity: any) => Promise<any>;
  clientFromSession: (session: any, opts: any) => Promise<any>;
  listCompanyUsers: (api: any) => Promise<any[]>;
  /** undefined when the database module cannot load here (no DATABASE_URL) */
  resolveClient?: (companyId: number) => Promise<any>;
  /** ranked alternatives for units / products / templates / locations (catalog/resolve.ts) */
  resolveCatalogAlternatives?: (api: any) => Promise<any>;
  /** vendors with a login email (flows/vendors.ts) */
  listInvitableVendors?: (api: any, query?: string, limit?: number) => Promise<any[]>;
}

let siblingLoad: Promise<Sibling> | undefined;

/**
 * One import per process. The modules are pure builders and clients; the
 * database one is loaded separately and allowed to fail, because a machine
 * without Postgres access can still walk the journey with an OTP evaluator.
 * A failed load is not kept: the next run should try again rather than
 * inherit a dead promise.
 */
function loadSibling(): Promise<Sibling> {
  if (!siblingLoad) {
    const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
    siblingLoad = (async () => {
      const [bodies, endpoints, config, client, login, sessionAuth, users] = await Promise.all([
        imp("flows/bodies.ts"),
        imp("api/endpoints.ts"),
        imp("config.ts"),
        imp("api/client.ts"),
        imp("auth/login.ts"),
        imp("auth/sessionAuth.ts"),
        imp("catalog/users.ts"),
      ]);
      const db = await imp("db/clients.ts").catch(() => undefined);
      const resolve = await imp("catalog/resolve.ts").catch(() => undefined);
      const vendors = await imp("flows/vendors.ts").catch(() => undefined);
      return {
        bodies,
        Endpoints: endpoints.Endpoints,
        CONFIG: config.CONFIG,
        ApiClient: client.ApiClient,
        authenticate: login.authenticate,
        clientFromSession: sessionAuth.clientFromSession,
        listCompanyUsers: users.listCompanyUsers,
        resolveClient: db?.resolveClient,
        resolveCatalogAlternatives: resolve?.resolveCatalogAlternatives,
        listInvitableVendors: vendors?.listInvitableVendors,
      };
    })();
    siblingLoad.catch(() => {
      siblingLoad = undefined;
    });
  }
  return siblingLoad;
}

// ── the state a journey carries between steps ──────────────────────────────

interface StageTiming {
  bst: number;
  bet: number;
  ect: number;
}

/**
 * One event being built — the journey's own, or the second copy for the
 * variations. The build steps write here rather than into the journey, so the
 * same four functions can build either without the copy's ids overwriting
 * the journey's.
 */
interface EventBuild {
  title: string;
  timing: StageTiming;
  eventGroupUuid?: string;
  lineItemUuid?: string;
  /** the round trades, in the order they were attached */
  trades: Array<{ kind: StageKind; uuid: string }>;
  /** what the publish call answered */
  status?: string;
  roundCount?: number;
}

interface Evaluator {
  uuid: string;
  name: string;
  email?: string;
  phone?: string;
  phonePrefix?: string;
  /** a live web-console session for this user, when the database has one */
  session?: any;
}

interface Journey {
  s: Sibling;
  client: JourneyClient;
  plan: JourneyPlan;
  opts: JourneyRunOptions;
  baseURL: string;
  companyId?: number;
  company: string;
  catalog: EventCatalog;
  vendorCompanyUuid: string;
  vendorName: string;
  /** the vendor's login email — changes with the vendor choice */
  vendorEmail?: string;
  qty: number;
  unit: string;
  price: number;
  stageSeconds: number;
  event: EventBuild;
  steps: JourneyStepRecord[];
  made: Record<string, string>;
  actors: { buyer: boolean; vendorApi?: any; evaluatorApi?: any };
  /** decided before the technical round is built; undefined when nobody can be */
  evaluator?: Evaluator;
  evaluatorLookedUp: boolean;
  evaluatorProblem?: string;
  /** the pricing round's product ids, read by the vendor (or the buyer, for a surrogate) */
  tradeProduct?: any;
  /** the technical round's forms, read by the vendor */
  techForm?: { formUuid: string; pageUuid: string; formCount: number };
  bidTotal?: number;
  bidPlaced: boolean;
  techResponded: boolean;
  /** scores = the event's allowed score scale (evaluation_score_label_mapping), when the schema gave one */
  evalForm?: { uuid: string; closeTime?: number; scores?: { score: number; label: string }[] };
  evalScored: boolean;
  /** null once looked up and found none — a valid configuration, not a missing id */
  approvalFlowUuid?: string | null;
  /** every window the wait step has to see out: the rounds', and an auction's */
  closeTimes: number[];
  waitedMs: number;
  // ── resilience ──
  /** the base title; a rebuilt event gets a suffix */
  title: string;
  /** the options for every choice, and which have been tried */
  book: ChoiceBook;
  /** the alternatives have been read (or tried and failed) */
  altsLoaded: boolean;
  /** the company's active units, as listed by the app — undefined when not read */
  companyUnits?: string[];
  altProblems: string[];
  forced: Partial<Record<ChoiceKind, string>>;
  /** Date.now() past which no new step starts */
  deadline: number;
  res: { sameRequestRetries: number; backtracks: JourneyBacktrack[]; watchdogTrips: number; budgetExhausted: boolean; rebuilds: number };
}

// ── one request, one outcome ───────────────────────────────────────────────

interface Reply {
  status: number;
  ok: boolean;
  data: any;
  errorCode?: string;
  errorMessage?: string;
  ms: number;
}

/** What a step hands back; `finish` turns it into the record. */
interface Fired {
  call?: JourneyCall;
  alsoCalled?: JourneyCall[];
  reply?: Reply;
  /** the sentence for a step that worked */
  actual?: string;
  produced?: Record<string, string>;
  /** a 2xx that did not carry what the expectation names, worded as what was missing */
  shortfall?: string;
  /** what would fix a refusal, appended to its sentence */
  hint?: string;
  /** for a step that made no request */
  ms?: number;
  /** a step found to be unrunnable only once it started */
  notRun?: string;
}

type Needs = string | undefined;

interface StepSpec {
  kind: StepKind;
  /** a not-run reason when something this step needs is missing */
  needs: (j: Journey, ev: EventBuild, done: JourneyStepRecord[]) => Needs | Promise<Needs>;
  /** what should come back — written before the request fires */
  expected: (j: Journey, ev: EventBuild) => string;
  run: (j: Journey, ev: EventBuild) => Promise<Fired>;
}

const SECRET_KEY = /otp|token|password|secret|authorization|cookie/i;

/**
 * The body as the report may keep it. Anything under a credential-shaped key
 * becomes "<redacted>" (a null `push_token` is left alone — there is nothing
 * to hide and the shape should stay recognisable), and every string is passed
 * through the same redaction the check engine applies to messages.
 */
function redactBody(body: unknown): unknown {
  if (body === undefined || body === null) return body;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const secret = SECRET_KEY.test(k) && (typeof val === "string" || typeof val === "number") && val !== "";
        out[k] = secret ? "<redacted>" : walk(val);
      }
      return out;
    }
    if (typeof v === "string") return redactSecrets(v) ?? v;
    return v;
  };
  try {
    return walk(JSON.parse(JSON.stringify(body)));
  } catch {
    return "<body could not be serialised>";
  }
}

const clean = (text: unknown): string | undefined => {
  if (text === undefined || text === null || text === "") return undefined;
  return redactSecrets(typeof text === "string" ? text : JSON.stringify(text)) ?? undefined;
};

/** Fire one request through the sibling client; never throws. */
async function fire(api: any, method: string, path: string, body?: unknown): Promise<{ call: JourneyCall; reply: Reply }> {
  const call: JourneyCall = { method, path, ...(body === undefined ? {} : { body: redactBody(body) }) };
  const t = Date.now();
  try {
    const r = await api.attempt(method, path, body === undefined ? {} : { body });
    return {
      call,
      reply: {
        status: typeof r?.status === "number" ? r.status : 0,
        ok: !!r?.ok,
        data: r?.data,
        errorCode: r?.errorCode,
        errorMessage: r?.errorMessage,
        ms: Date.now() - t,
      },
    };
  } catch (e) {
    return {
      call,
      reply: { status: 0, ok: false, data: null, errorMessage: e instanceof Error ? e.message : String(e), ms: Date.now() - t },
    };
  }
}

// ── words ──────────────────────────────────────────────────────────────────

const nowSec = () => Math.floor(Date.now() / 1000);
const hhmm = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const hhmmss = (sec: number) =>
  new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

/** "pricing round (RFQ)" → "pricing round, RFQ" — the label as it reads mid-sentence. */
const roundWords = (kind: StageKind) => STAGE_LABEL[kind].replace(/ \((.+)\)$/, ", $1");

const TITLE_TAG: Record<EventType, string> = {
  rfp_only: "RFP_only",
  rfq_only: "RFQ_only",
  rfp_rfq: "RFP_RFQ",
  rfp_auction: "RFP_Auction",
};

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const arrLen = (v: unknown): number | undefined => (Array.isArray(v) ? v.length : undefined);

// ── prerequisites, and the step to blame when one is missing ───────────────

/**
 * Names the step that should have produced a missing input, and what became
 * of it: "step 2 — Create the draft event — was refused". Looked up first in
 * the steps of the build in progress (the second event's, when that is what
 * is being built), then in the journey's own.
 */
function because(j: Journey, done: JourneyStepRecord[], kind: StepKind): string {
  const step = done.find((s) => s.kind === kind) ?? j.steps.find((s) => s.kind === kind);
  if (!step) return `the step that produces it — ${STEP_META[kind].title.toLowerCase()} — was not part of this run`;
  const verb =
    step.verdict === "broken"
      ? "broke"
      : step.verdict === "refused"
        ? "was refused"
        : step.verdict === "not-run"
          ? "did not run"
          : "did not produce it";
  return `step ${step.n} — ${step.title} — ${verb}`;
}

const need = (j: Journey, done: JourneyStepRecord[], missing: string, has: unknown, producer: StepKind): Needs =>
  has ? undefined : `${missing} (${because(j, done, producer)})`;

const needBuyer = (j: Journey, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the buyer is not signed in", j.actors.buyer, "buyer_login");
const needVendor = (j: Journey, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the vendor is not signed in", j.actors.vendorApi, "vendor_login");
const needEvaluator = (j: Journey, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the evaluator is not signed in", j.actors.evaluatorApi, "evaluator_login");
const needDraft = (j: Journey, ev: EventBuild, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the draft event was never created", ev.eventGroupUuid && ev.lineItemUuid, "create_draft");
const needPublished = (j: Journey, ev: EventBuild, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the event was never published", ev.status === "active", "publish");
const tradeOf = (ev: EventBuild, kind: "rfp" | "pricing") =>
  ev.trades.find((t) => (kind === "rfp" ? t.kind === "rfp" : t.kind !== "rfp"))?.uuid;
const needTechnical = (j: Journey, ev: EventBuild, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the technical round was never attached", tradeOf(ev, "rfp"), "add_stage_rfp");
const needPricing = (j: Journey, ev: EventBuild, done: JourneyStepRecord[]): Needs =>
  need(j, done, "the pricing round was never attached", tradeOf(ev, "pricing"), "add_stage_pricing");
/** whichever of the vendor's or the buyer's on-behalf steps this plan has */
const bidProducer = (j: Journey): StepKind => (j.plan.features.surrogate ? "surrogate_rfq" : "bid_submit");
const techProducer = (j: Journey): StepKind => (j.plan.features.surrogate ? "surrogate_tech" : "tech_submit");
const first = (...reasons: Needs[]): Needs => reasons.find(Boolean);

// ── who evaluates ──────────────────────────────────────────────────────────

/**
 * Decided once, before the technical round is built, because the round names
 * its evaluator and the same person has to sign in later to score it.
 *
 * Preferred: a second console user of the company with a live web-console
 * session in the database, matched to an API user by email (else phone) so
 * the stage carries the uuid the API knows. Signing them in then needs no OTP.
 * Fallback: the user the client context already picked, who will have to
 * sign in with a one-time code — possible only if the user list gives a phone.
 */
async function ensureEvaluator(j: Journey): Promise<void> {
  if (j.evaluatorLookedUp) return;
  // Marked done only when the look-up finishes: a step the watchdog abandoned
  // mid-look-up must look again on its retry, not find "nobody".
  try {
    await lookUpEvaluator(j);
  } finally {
    j.evaluatorLookedUp = true;
  }
}

async function lookUpEvaluator(j: Journey): Promise<void> {
  const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

  let users: any[] = [];
  try {
    users = (await j.s.listCompanyUsers(j.client.ctx.buyerApi)) ?? [];
  } catch {
    users = [];
  }

  if (j.s.resolveClient && j.companyId !== undefined) {
    try {
      const resolved = await j.s.resolveClient(j.companyId);
      const sess = resolved?.evaluator;
      if (sess) {
        const match = users.find(
          (u) =>
            (sess.email && u?.email && String(u.email).toLowerCase() === String(sess.email).toLowerCase()) ||
            (sess.phone && u?.phone && digits(u.phone) === digits(sess.phone)),
        );
        if (match?.uuid) {
          j.evaluator = {
            uuid: match.uuid,
            name: sess.firstName || match.name || match.email || "the evaluator",
            email: sess.email ?? match.email ?? undefined,
            phone: sess.phone ?? undefined,
            phonePrefix: sess.phonePrefix ?? undefined,
            session: sess,
          };
          return;
        }
      }
    } catch {
      // No database here, or the lookup failed: fall through to the context's pick.
    }
  }

  const uuid = j.client.ctx.evaluatorUuid;
  if (uuid) {
    const u = users.find((x) => x?.uuid === uuid);
    // The phone exactly as stored (the picker read it and checked the backend
    // accepts it). Trimming a listed phone to its last 10 digits once turned a
    // malformed 11-digit seed number into one that belongs to nobody → 391.
    // The backend rewrites the phone to prefix + "/" + phone before matching
    // users.phone, so send the stored value's two halves separately.
    const stored: string | undefined = (j.client.ctx as any).evaluatorPhone;
    const [phonePrefix, phone] = stored?.includes("/") ? stored.split("/") : [undefined, undefined];
    j.evaluator = { uuid, name: u?.name || u?.email || "the evaluator", email: u?.email, phone, phonePrefix };
    return;
  }
  j.evaluatorProblem = `no one at ${j.company} could be named as the evaluator — the company's user list gave nobody to assign the technical round to`;
}

// ── OTP sign-in, recorded as two calls ─────────────────────────────────────

/**
 * Code 705: the one-time code was RIGHT, but this user has never accepted
 * Procol's current Terms of Use and Privacy Policy, and the app will not sign
 * them in until they do. That is a one-time human step for the account, not a
 * defect — and accepting terms on someone's behalf is not the platform's call.
 */
const TNC_HINT = (who: string) =>
  `The one-time code was accepted, but ${who} has not yet accepted Procol's current Terms of Use and Privacy Policy. Sign in once as this user on the web app and tick "I accept"; then run this again.`;

const DEVICE_INFO = { browser: "Chrome", os: "OS X 10.15.7 64-bit", browser_version: "149.0.0.0", resolution: "1440x900" };

/**
 * The sibling's `authenticate` makes both OTP calls and throws on failure with
 * the status and the raw reply in its message. Here that is turned back into
 * the two requests the collection shows, with the one-time code redacted, and
 * the failing call — generate or verify — becomes the decisive one.
 */
async function otpLogin(j: Journey, identity: any, idBody: Record<string, unknown>): Promise<{ fired: Fired; login?: any }> {
  const gen: JourneyCall = { method: "POST", path: j.s.Endpoints.generateOtp(), body: idBody };
  const ver: JourneyCall = {
    method: "POST",
    path: j.s.Endpoints.verifyOtp(),
    body: { ...idBody, otp: "<redacted>", push_token: null, device_info: DEVICE_INFO, device_id: "<random 32-character id>" },
  };
  const t = Date.now();
  try {
    const login = await j.s.authenticate({ ...identity, baseURL: j.baseURL });
    return { login, fired: { call: ver, alsoCalled: [gen], reply: { status: 200, ok: true, data: null, ms: Date.now() - t } } };
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    const m = /^(generate_otp|verify_otp) \(\w+\) failed: HTTP (\d{3}) — ([\s\S]*)$/.exec(text);
    if (m) {
      const status = Number(m[2]);
      let errorMessage: string | undefined = m[3].trim() || undefined;
      let errorCode: string | undefined;
      try {
        const parsed = JSON.parse(m[3]);
        const err = parsed?.error;
        const msg = typeof err === "string" ? err : err?.message ?? parsed?.message;
        if (msg !== undefined) errorMessage = Array.isArray(msg) ? msg.join("; ") : String(msg);
        if (err?.code !== undefined) errorCode = String(err.code);
      } catch {
        // not JSON — the raw text is the message
      }
      const failedAtGenerate = m[1] === "generate_otp";
      return {
        fired: {
          call: failedAtGenerate ? gen : ver,
          alsoCalled: failedAtGenerate ? undefined : [gen],
          reply: { status, ok: false, data: null, errorMessage, errorCode, ms: Date.now() - t },
        },
      };
    }
    return { fired: { call: ver, alsoCalled: [gen], reply: { status: 0, ok: false, data: null, errorMessage: text, ms: Date.now() - t } } };
  }
}

// ── the steps ──────────────────────────────────────────────────────────────

const buyerLogin: StepSpec = {
  kind: "buyer_login",
  needs: () => undefined,
  expected: (j) =>
    `The app accepts the buyer's existing web-console session for ${j.company} (read from the database, so no one-time code is sent) and answers with the dashboard configuration.`,
  run: async (j) => {
    const { call, reply } = await fire(j.client.ctx.buyerApi, "GET", j.s.Endpoints.dashboardConfiguration());
    if (!reply.ok) {
      return { call, reply, hint: `Someone from ${j.company} must sign into the web console so a fresh session exists; then run this again.` };
    }
    const cfg = reply.data ?? {};
    const user = cfg.user ?? cfg.data?.user ?? {};
    const name = user.name ?? user.full_name ?? user.first_name;
    const role = user.role_name ?? (typeof user.role === "string" ? user.role : undefined);
    j.actors.buyer = true;
    return {
      call,
      reply,
      actual: `Using ${name ? `${name}'s` : "the buyer's"} web-console session for ${j.company} — the app accepted it${role ? ` (role: ${role})` : ""}.`,
      produced: user.uuid ? { buyerUserUuid: String(user.uuid) } : undefined,
    };
  },
};

const createDraft: StepSpec = {
  kind: "create_draft",
  needs: (j, _ev, done) => needBuyer(j, done),
  expected: (j) => `A draft event is created for ${j.company} with one line item (${j.qty} ${j.unit} of the catalog product) and comes back with its id.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildEventGroupBody({
      productUuid: j.catalog.productUuid,
      quantityUnit: j.unit,
      quantityValue: j.qty,
      productQualityUuid: j.catalog.productQualityUuid,
    });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.eventGroups(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.uuid;
    const lineItem = reply.data?.event_group_line_item_ids?.[0];
    if (!uuid) return { call, reply, shortfall: "the reply carried no event id" };
    if (!lineItem) return { call, reply, shortfall: `draft ${uuid} came back without a line item id` };
    ev.eventGroupUuid = String(uuid);
    ev.lineItemUuid = String(lineItem);
    return {
      call,
      reply,
      actual: `Draft ${uuid} was created with one line item (${j.qty} ${j.unit}).`,
      produced: { eventGroupUuid: String(uuid), lineItemUuid: String(lineItem) },
    };
  },
};

function addStage(kind: "add_stage_rfp" | "add_stage_pricing"): StepSpec {
  const stageKind = (j: Journey): StageKind =>
    kind === "add_stage_rfp" ? "rfp" : (j.plan.stages.find((s) => s !== "rfp") ?? "rfq");
  const position = (j: Journey) => j.plan.stages.indexOf(stageKind(j)) + 1;
  return {
    kind,
    needs: async (j, ev, done) => {
      const base = first(needBuyer(j, done), needDraft(j, ev, done));
      if (base) return base;
      if (kind === "add_stage_rfp") {
        await ensureEvaluator(j);
        if (!j.evaluator) return j.evaluatorProblem ?? `no one at ${j.company} could be named as the evaluator`;
      }
      return undefined;
    },
    expected: (j, ev) => {
      const sk = stageKind(j);
      const who = kind === "add_stage_rfp" && j.evaluator ? `, assigned to ${j.evaluator.name} to score` : "";
      return `The ${STAGE_LABEL[sk]} is attached to the draft as round ${position(j)} of ${j.plan.stages.length}${who}, with bidding open ${hhmm(ev.timing.bst)}–${hhmm(ev.timing.bet)}.`;
    },
    run: async (j, ev) => {
      const sk = stageKind(j);
      const stageNo = position(j);
      const body =
        sk === "rfp"
          ? j.s.bodies.buildTechnicalStageBody({
              eventGroupUuid: ev.eventGroupUuid,
              lineItemUuid: ev.lineItemUuid,
              evaluatorUuid: j.evaluator!.uuid,
              vendorCompanyUuid: j.vendorCompanyUuid,
              technicalTemplateUuid: j.catalog.technicalTemplateUuid,
              timing: ev.timing,
              stageNo,
            })
          : j.s.bodies.buildPricingStageBody({
              eventGroupUuid: ev.eventGroupUuid,
              lineItemUuid: ev.lineItemUuid,
              vendorCompanyUuid: j.vendorCompanyUuid,
              pricingTemplateUuid: j.catalog.pricingTemplateUuid,
              productUuid: j.catalog.productUuid,
              productQualityUuid: j.catalog.productQualityUuid,
              locationUuid: j.catalog.locationUuid,
              quantityValue: j.qty,
              quantityUnit: j.unit,
              timing: ev.timing,
              stageNo,
              rfxMode: sk === "auction" ? "auction" : "rfq",
            });
      const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.createTrade(), body);
      if (!reply.ok) return { call, reply };
      const uuid = reply.data?.uuid;
      if (!uuid) return { call, reply, shortfall: "the reply carried no round id" };
      ev.trades.push({ kind: sk, uuid: String(uuid) });
      const who = sk === "rfp" && j.evaluator ? `, with ${j.evaluator.name} as its evaluator` : "";
      return {
        call,
        reply,
        actual: `Round ${stageNo} (${roundWords(sk)}) was attached as ${uuid}${who}; bidding open ${hhmm(ev.timing.bst)}–${hhmm(ev.timing.bet)}.`,
        produced: { [sk === "rfp" ? "technicalTradeUuid" : "pricingTradeUuid"]: String(uuid) },
      };
    },
  };
}

const publish: StepSpec = {
  kind: "publish",
  needs: (j, ev, done) => {
    const base = first(needBuyer(j, done), needDraft(j, ev, done));
    if (base) return base;
    for (const sk of j.plan.stages) {
      if (!ev.trades.some((t) => t.kind === sk)) {
        return `the ${STAGE_LABEL[sk]} was never attached (${because(j, done, sk === "rfp" ? "add_stage_rfp" : "add_stage_pricing")})`;
      }
    }
    return undefined;
  },
  expected: (j, ev) =>
    `“${ev.title}” goes live — status active — with ${count(j.plan.stages.length, "round")} attached and the invited vendor able to see it.`,
  run: async (j, ev) => {
    const uuids = ev.trades.map((t) => t.uuid);
    const body = {
      ...j.s.bodies.buildPublishBody({
        title: ev.title,
        technicalTradeUuid: uuids[0],
        pricingTradeUuid: uuids[1] ?? uuids[0],
        vendorCompanyUuid: j.vendorCompanyUuid,
      }),
      draft_trade_request_uuids: uuids,
    };
    const { call, reply } = await fire(j.client.ctx.buyerApi, "PATCH", j.s.Endpoints.eventGroup(ev.eventGroupUuid!), body);
    if (!reply.ok) return { call, reply };
    const status = reply.data?.status as string | undefined;
    if (status !== "active") {
      return { call, reply, shortfall: status ? `the event came back as “${status}” rather than active` : "the reply did not say what status the event is in" };
    }
    const rounds = arrLen(reply.data?.stages) ?? uuids.length;
    ev.status = status;
    ev.roundCount = rounds;
    return {
      call,
      reply,
      actual: `“${ev.title}” is now ${status} with ${count(rounds, "round")}, visible to 1 vendor.`,
      produced: { status, rounds: String(rounds) },
    };
  },
};

const readBack: StepSpec = {
  kind: "read_back",
  needs: (j, ev, done) => first(needBuyer(j, done), needDraft(j, ev, done)),
  expected: (j) => `Reading the event back shows it active with ${count(j.plan.stages.length, "round")} and the invited vendor on it.`,
  run: async (j, ev) => {
    const { call, reply } = await fire(j.client.ctx.buyerApi, "GET", j.s.Endpoints.eventGroup(ev.eventGroupUuid!));
    if (!reply.ok) return { call, reply };
    const d = reply.data ?? {};
    const status = typeof d.status === "string" ? d.status : undefined;
    const rounds = arrLen(d.stages) ?? arrLen(d.trade_requests) ?? arrLen(d.trades) ?? arrLen(d.rounds);
    const participants =
      arrLen(d.participants) ??
      arrLen(d.audience_company_uuids) ??
      arrLen(d.audience_companies) ??
      arrLen(d.audience) ??
      (typeof d.participant_count === "number" ? d.participant_count : undefined);
    if (!status && !d.uuid) return { call, reply, shortfall: "the reply did not describe the event" };
    const parts = [`The event reads back${status ? ` as ${status}` : ""}`];
    if (rounds !== undefined) parts.push(` with ${count(rounds, "round")}`);
    if (participants !== undefined) parts.push(`${rounds !== undefined ? " and" : " with"} ${count(participants, "participant")}`);
    const drift = status && ev.status && status !== ev.status ? ` — not the “${ev.status}” the publish call answered` : "";
    return { call, reply, actual: `${parts.join("")}${drift}.` };
  },
};

const vendorLogin: StepSpec = {
  kind: "vendor_login",
  needs: (j) => (j.vendorEmail ? undefined : "this client's invited vendor has no login email"),
  expected: (j) => `A one-time code is sent to ${j.vendorEmail} and, once verified, signs the vendor into the supplier app.`,
  run: async (j) => {
    const email = j.vendorEmail!;
    // A rebuilt event signs the vendor in again; the earlier client is closed first.
    if (j.actors.vendorApi) {
      await withWatchdog(Promise.resolve(j.actors.vendorApi.dispose?.()), 10_000, "closing the earlier vendor session").catch(() => {});
      j.actors.vendorApi = undefined;
    }
    const { login, fired } = await otpLogin(j, { ...j.s.CONFIG.identities.vendor, email, tenantCompanyId: j.companyId }, { email });
    if (!login && fired.reply?.errorCode === "705")
      return { ...fired, hint: TNC_HINT(`the vendor (${email})`) };
    if (!login) return fired;
    j.actors.vendorApi = await j.s.ApiClient.create(login, {
      baseURL: j.baseURL,
      appVersion: login.appVersion,
      identity: "vendor",
      companyId: j.companyId,
    });
    const otherCompany = login.companyUuid && login.companyUuid !== j.vendorCompanyUuid;
    const produced: Record<string, string> = {};
    if (login.userUuid) produced.vendorUserUuid = String(login.userUuid);
    if (login.companyUuid) produced.vendorCompanyUuid = String(login.companyUuid);
    return {
      ...fired,
      // A vendor user can belong to more than one company; the bid is placed
      // for the one the buyer invited, so a different home company on the
      // login is a fact to note, not a fault.
      actual:
        `Signed in as the vendor (${j.vendorName}, ${email}) — the one-time code was accepted${login.otpSource ? ` (${login.otpSource})` : ""}.` +
        (login.termsAccepted ? " This QA test user had not yet accepted Procol's Terms of Use, so the platform accepted them for it (test users only)." : "") +
        (otherCompany ? ` This user's home company is ${login.companyUuid}; the bid is placed for the invited ${j.vendorCompanyUuid}.` : ""),
      produced,
    };
  },
};

const vendorOpenPricing: StepSpec = {
  kind: "vendor_open_pricing",
  needs: (j, ev, done) => first(needVendor(j, done), needPricing(j, ev, done), needPublished(j, ev, done)),
  expected: (j) => `The vendor can open the pricing round and sees the line item (${j.qty} ${j.unit}) to quote on.`,
  run: async (j, ev) => {
    const { call, reply } = await fire(j.actors.vendorApi, "GET", j.s.Endpoints.tradeDetails(tradeOf(ev, "pricing")!));
    if (!reply.ok) return { call, reply };
    const details = reply.data?.order_details;
    const p = details?.[0]?.product;
    if (!p?.trade_product_uuid) return { call, reply, shortfall: "the round came back without its line item's product ids" };
    j.tradeProduct = {
      trade_product_uuid: p.trade_product_uuid,
      trade_product_id: p.trade_product_id,
      trade_product_category_uuid: p.trade_product_category_uuid,
      product_id: p.id,
      product_code: p.product_code,
    };
    const qty = details[0]?.quantity?.value ?? details[0]?.creator_quantity?.value ?? j.qty;
    const unit = details[0]?.quantity?.unitSymbol ?? details[0]?.quantity?.unit ?? j.unit;
    return {
      call,
      reply,
      actual: `The vendor sees ${count(Array.isArray(details) ? details.length : 1, "line item")} (${qty} ${unit}) on the pricing round.`,
      produced: { tradeProductUuid: String(p.trade_product_uuid) },
    };
  },
};

const vendorOpenTechnical: StepSpec = {
  kind: "vendor_open_technical",
  needs: (j, ev, done) => first(needVendor(j, done), needTechnical(j, ev, done), needPublished(j, ev, done)),
  expected: () => `The vendor can open the technical round and sees its forms, including the line-item form to answer.`,
  run: async (j, ev) => {
    const { call, reply } = await fire(j.actors.vendorApi, "GET", j.s.Endpoints.tradeDetails(tradeOf(ev, "rfp")!));
    if (!reply.ok) return { call, reply };
    const forms = reply.data?.sheets?.forms;
    const lineItemForm = Array.isArray(forms) ? forms[1] : undefined;
    if (!lineItemForm?.uuid || !lineItemForm?.page_uuids?.[0]) {
      return { call, reply, shortfall: `the round came back with ${count(arrLen(forms) ?? 0, "form")} and no line-item form to answer` };
    }
    j.techForm = { formUuid: String(lineItemForm.uuid), pageUuid: String(lineItemForm.page_uuids[0]), formCount: forms.length };
    return {
      call,
      reply,
      actual: `The vendor sees ${count(forms.length, "form")} on the technical round; the line-item form is ${lineItemForm.uuid} with ${count(lineItemForm.page_uuids.length, "page")}.`,
      produced: { techFormUuid: String(lineItemForm.uuid), techPageUuid: String(lineItemForm.page_uuids[0]) },
    };
  },
};

const techStart: StepSpec = {
  kind: "tech_start",
  needs: (j, ev, done) => first(needVendor(j, done), needTechnical(j, ev, done), needPublished(j, ev, done)),
  expected: (j) => `A technical response is opened for ${j.vendorName} on the technical round and comes back with its id.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildStartTechnicalResponse({ technicalTradeUuid: tradeOf(ev, "rfp"), vendorCompanyUuid: j.vendorCompanyUuid });
    const { call, reply } = await fire(j.actors.vendorApi, "POST", j.s.Endpoints.templateResponses(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.uuid;
    if (!uuid) return { call, reply, shortfall: "the reply carried no response id" };
    return {
      call,
      reply,
      actual: `A technical response ${uuid} was opened for ${j.vendorName}.`,
      produced: { templateResponseUuid: String(uuid) },
    };
  },
};

const techAnswer: StepSpec = {
  kind: "tech_answer",
  needs: (j, _ev, done) =>
    first(
      needVendor(j, done),
      need(j, done, "no technical response was opened to answer", j.made.templateResponseUuid, "tech_start"),
      need(j, done, "the technical round's form was never read", j.techForm, "vendor_open_technical"),
    ),
  expected: () => `The line-item form is answered (Specs: “auto spec answer”) and the app accepts the answers.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildTechnicalAnswerBody({
      technicalTradeUuid: tradeOf(ev, "rfp"),
      formUuid: j.techForm!.formUuid,
      pageUuid: j.techForm!.pageUuid,
    });
    const { call, reply } = await fire(j.actors.vendorApi, "PUT", j.s.Endpoints.createPageResponses(j.made.templateResponseUuid), body);
    if (!reply.ok) return { call, reply };
    return { call, reply, actual: `The line-item form was answered (Specs: “auto spec answer”).` };
  },
};

const techSubmit: StepSpec = {
  kind: "tech_submit",
  needs: (j, _ev, done) =>
    first(needVendor(j, done), need(j, done, "no technical response was opened to submit", j.made.templateResponseUuid, "tech_start")),
  expected: () => `The technical response is submitted and the app accepts it.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildSubmitTechnicalResponse({ technicalTradeUuid: tradeOf(ev, "rfp"), vendorCompanyUuid: j.vendorCompanyUuid });
    const { call, reply } = await fire(j.actors.vendorApi, "PATCH", j.s.Endpoints.templateResponse(j.made.templateResponseUuid), body);
    if (!reply.ok) return { call, reply };
    j.techResponded = true;
    const status = reply.data?.status;
    return { call, reply, actual: `The technical response was submitted${status ? ` (status ${status})` : ""}.` };
  },
};

const bidCreate: StepSpec = {
  kind: "bid_create",
  needs: (j, ev, done) => first(needVendor(j, done), needPricing(j, ev, done), needPublished(j, ev, done)),
  expected: (j) => `A bid is opened for ${j.vendorName} on the pricing round and comes back with its id.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildCreateBid({ pricingTradeUuid: tradeOf(ev, "pricing"), vendorCompanyUuid: j.vendorCompanyUuid });
    const { call, reply } = await fire(j.actors.vendorApi, "POST", j.s.Endpoints.createBid(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.bid_uuid ?? reply.data?.uuid;
    if (!uuid) return { call, reply, shortfall: "the reply carried no bid id" };
    return { call, reply, actual: `Bid ${uuid} was opened on the pricing round for ${j.vendorName}.`, produced: { bidUuid: String(uuid) } };
  },
};

const bidProducts: StepSpec = {
  kind: "bid_products",
  needs: (j, ev, done) =>
    first(
      needVendor(j, done),
      need(j, done, "no bid was opened to price", j.made.bidUuid, "bid_create"),
      need(j, done, "the pricing round's product ids were never read", j.tradeProduct, "vendor_open_pricing"),
      needDraft(j, ev, done),
    ),
  expected: (j) =>
    `The line item is priced at ${rupees(j.price)} per ${j.unit} for ${j.qty} ${j.unit} — ${rupees(j.price * j.qty)} before tax — and the app accepts it.`,
  run: async (j, ev) => {
    const { body, total } = j.s.bodies.buildBidProductsBody({
      pricingTradeUuid: tradeOf(ev, "pricing"),
      vendorCompanyUuid: j.vendorCompanyUuid,
      productUuid: j.catalog.productUuid,
      productQualityUuid: j.catalog.productQualityUuid,
      locationUuid: j.catalog.locationUuid,
      lineItemUuid: ev.lineItemUuid,
      quantityValue: j.qty,
      quantityUnit: j.unit,
      price: j.price,
      tradeProduct: j.tradeProduct,
    });
    const { call, reply } = await fire(j.actors.vendorApi, "POST", j.s.Endpoints.createBidProducts(j.made.bidUuid), body);
    if (!reply.ok) return { call, reply };
    j.bidTotal = total;
    return { call, reply, actual: `Quoted ${rupees(j.price)} per ${j.unit} for ${j.qty} ${j.unit} — ${rupees(total)} before tax.` };
  },
};

const bidSubmit: StepSpec = {
  kind: "bid_submit",
  needs: (j, _ev, done) =>
    first(
      needVendor(j, done),
      need(j, done, "no bid was opened to submit", j.made.bidUuid, "bid_create"),
      need(j, done, "the line item was never priced", j.bidTotal !== undefined, "bid_products"),
    ),
  expected: () => `The bid is submitted and the app answers success: true.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildSubmitBidBody({
      pricingTradeUuid: tradeOf(ev, "pricing"),
      vendorCompanyUuid: j.vendorCompanyUuid,
      total: j.bidTotal,
    });
    const { call, reply } = await fire(j.actors.vendorApi, "PATCH", j.s.Endpoints.submitBid(j.made.bidUuid), body);
    if (!reply.ok) return { call, reply };
    const success = reply.data?.success;
    if (success === false) return { call, reply, shortfall: "the app answered success: false" };
    j.bidPlaced = true;
    return { call, reply, actual: success === true ? `Bid submitted (the app answered success: true).` : `Bid submitted (the app answered HTTP ${reply.status}).` };
  },
};

const surrogateTech: StepSpec = {
  kind: "surrogate_tech",
  needs: (j, ev, done) => first(needBuyer(j, done), needTechnical(j, ev, done), needPublished(j, ev, done)),
  expected: (j) => `The buyer enters a technical response for ${j.vendorName} on both forms and the app accepts it.`,
  run: async (j, ev) => {
    const tech = tradeOf(ev, "rfp")!;
    // The forms' page ids come from the round itself, read first as the buyer.
    const read = await fire(j.client.ctx.buyerApi, "GET", j.s.Endpoints.tradeDetails(tech));
    const forms = read.reply.data?.sheets?.forms;
    if (!read.reply.ok) return { call: read.call, reply: read.reply };
    if (!forms?.[0]?.page_uuids?.[0] || !forms?.[1]?.page_uuids?.[0]) {
      return { call: read.call, reply: read.reply, shortfall: "the technical round came back without both forms' pages" };
    }
    const body = j.s.bodies.buildSurrogateTechnicalBody({
      technicalTradeUuid: tech,
      vendorCompanyUuid: j.vendorCompanyUuid,
      form0Page: forms[0].page_uuids[0],
      form1Page: forms[1].page_uuids[0],
    });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.createSurrogateResponse(), body);
    if (!reply.ok) return { call, alsoCalled: [read.call], reply };
    if (reply.data?.success === false) return { call, alsoCalled: [read.call], reply, shortfall: "the app answered success: false" };
    j.techResponded = true;
    return {
      call,
      alsoCalled: [read.call],
      reply,
      actual: `Entered ${j.vendorName}'s technical response on both forms${reply.data?.success === true ? " (the app answered success: true)" : ""}.`,
    };
  },
};

const surrogateRfq: StepSpec = {
  kind: "surrogate_rfq",
  needs: (j, ev, done) => first(needBuyer(j, done), needPricing(j, ev, done), needDraft(j, ev, done), needPublished(j, ev, done)),
  expected: (j) =>
    `The buyer enters a price of ${rupees(j.price)} per ${j.unit} for ${j.qty} ${j.unit} on ${j.vendorName}'s behalf and the app accepts it.`,
  run: async (j, ev) => {
    const pricing = tradeOf(ev, "pricing")!;
    const alsoCalled: JourneyCall[] = [];
    if (!j.tradeProduct) {
      const read = await fire(j.client.ctx.buyerApi, "GET", j.s.Endpoints.tradeDetails(pricing));
      if (!read.reply.ok) return { call: read.call, reply: read.reply };
      const p = read.reply.data?.order_details?.[0]?.product;
      if (!p?.trade_product_uuid) return { call: read.call, reply: read.reply, shortfall: "the pricing round came back without its line item's product ids" };
      j.tradeProduct = {
        trade_product_uuid: p.trade_product_uuid,
        trade_product_id: p.trade_product_id,
        trade_product_category_uuid: p.trade_product_category_uuid,
        product_id: p.id,
        product_code: p.product_code,
      };
      alsoCalled.push(read.call);
    }
    const body = j.s.bodies.buildSurrogateRfqBody({
      pricingTradeUuid: pricing,
      vendorCompanyUuid: j.vendorCompanyUuid,
      productUuid: j.catalog.productUuid,
      productQualityUuid: j.catalog.productQualityUuid,
      locationUuid: j.catalog.locationUuid,
      lineItemUuid: ev.lineItemUuid,
      quantityValue: j.qty,
      quantityUnit: j.unit,
      price: j.price,
      tradeProduct: j.tradeProduct,
    });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.surrogateRfqBid(), body);
    if (!reply.ok) return { call, alsoCalled, reply };
    j.bidPlaced = true;
    j.bidTotal = j.price * j.qty;
    const uuid = reply.data?.bid_uuid ?? reply.data?.uuid;
    return {
      call,
      alsoCalled,
      reply,
      actual: `Entered ${rupees(j.price)} per ${j.unit} for ${j.qty} ${j.unit} on ${j.vendorName}'s behalf — ${rupees(j.price * j.qty)} before tax.`,
      produced: uuid ? { surrogateBidUuid: String(uuid) } : undefined,
    };
  },
};

const counterOffer: StepSpec = {
  kind: "counter_offer",
  needs: (j, ev, done) =>
    first(
      needBuyer(j, done),
      need(j, done, "no bid was submitted to counter", j.made.bidUuid && j.bidPlaced, bidProducer(j)),
      need(j, done, "the pricing round's product ids were never read", j.tradeProduct, "vendor_open_pricing"),
      needDraft(j, ev, done),
    ),
  expected: (j) => `The buyer counters ${j.vendorName}'s ${rupees(j.price)} per ${j.unit} with ${rupees(j.price + 50)} and the app raises the counter offer.`,
  run: async (j, ev) => {
    const counterPrice = j.price + 50;
    const body = j.s.bodies.buildCounterOfferBody({
      bidUuid: j.made.bidUuid,
      productUuid: j.catalog.productUuid,
      productQualityUuid: j.catalog.productQualityUuid,
      locationUuid: j.catalog.locationUuid,
      lineItemUuid: ev.lineItemUuid,
      quantityValue: j.qty,
      quantityUnit: j.unit,
      counterPrice,
      tradeProduct: j.tradeProduct,
    });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.raiseAdditionalRequest(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.uuid;
    return {
      call,
      reply,
      actual: `Countered the vendor's ${rupees(j.price)} per ${j.unit} with ${rupees(counterPrice)} per ${j.unit} (${rupees(counterPrice * j.qty)} for ${j.qty} ${j.unit}).`,
      produced: uuid ? { counterOfferUuid: String(uuid) } : undefined,
    };
  },
};

const convertAuction: StepSpec = {
  kind: "convert_auction",
  needs: (j, ev, done) => first(needBuyer(j, done), needPricing(j, ev, done), needDraft(j, ev, done), needPublished(j, ev, done)),
  expected: () => `The pricing round is converted into a live auction and comes back as an active auction round with its id.`,
  run: async (j, ev) => {
    const timing: StageTiming = journeyTiming(nowSec(), j.stageSeconds);
    const body = j.s.bodies.buildAuctionBody({
      pricingTradeUuid: tradeOf(ev, "pricing"),
      vendorCompanyUuid: j.vendorCompanyUuid,
      productUuid: j.catalog.productUuid,
      productQualityUuid: j.catalog.productQualityUuid,
      locationUuid: j.catalog.locationUuid,
      lineItemUuid: ev.lineItemUuid,
      pricingTemplateUuid: j.catalog.pricingTemplateUuid,
      quantityValue: j.qty,
      quantityUnit: j.unit,
      useRfqQuotes: j.catalog.useRfqQuotes,
      timing,
    });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.moveToAuction(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.uuid;
    if (!uuid) return { call, reply, shortfall: "the reply carried no auction round id" };
    j.closeTimes.push(timing.ect);
    const status = reply.data?.status;
    const converted = `The pricing round was converted into live auction ${uuid}${status ? ` (status ${status})` : ""}; bidding open ${hhmm(timing.bst)}–${hhmm(timing.bet)}.`;
    // The award goes to a vendor of the LATEST round, so the vendor must bid in
    // the auction too — without it the award is refused “Awarded vendor is not
    // present in the latest stage” (826). The bid is part of this step.
    const bid = await bidInAuction(j, ev, String(uuid));
    const alsoCalled = [call, ...bid.calls.slice(0, -1)];
    const last = bid.calls[bid.calls.length - 1];
    if (!bid.ok) {
      return {
        call: last ?? call,
        alsoCalled,
        reply: bid.reply ?? reply,
        ...(bid.reply && bid.reply.ok ? { shortfall: bid.why } : {}),
        hint: `${converted} But the auction bid failed (${bid.why}), so the award will be refused: the awarded vendor must have bid in the latest round.`,
        produced: { auctionTradeUuid: String(uuid) },
      };
    }
    return {
      call: last ?? call,
      alsoCalled,
      reply: bid.reply ?? reply,
      actual: `${converted} ${bid.actual}`,
      produced: { auctionTradeUuid: String(uuid) },
    };
  },
};

/**
 * One bid in the auction round: the vendor's own (open → price → submit), or
 * the buyer's on the vendor's behalf when the journey is a surrogate one.
 * One rupee below the RFQ price, so it is a real improvement.
 */
async function bidInAuction(
  j: Journey,
  ev: EventBuild,
  auctionUuid: string,
): Promise<{ ok: boolean; calls: JourneyCall[]; reply?: Reply; actual?: string; why?: string }> {
  const calls: JourneyCall[] = [];
  const price = Math.max(1, j.price - 1);
  const surrogate = j.plan.features.surrogate || !j.actors.vendorApi;
  const api = surrogate ? j.client.ctx.buyerApi : j.actors.vendorApi;
  const read = await fire(api, "GET", j.s.Endpoints.tradeDetails(auctionUuid));
  calls.push(read.call);
  if (!read.reply.ok) return { ok: false, calls, reply: read.reply, why: "the auction round could not be opened" };
  const p = read.reply.data?.order_details?.[0]?.product;
  if (!p?.trade_product_uuid) return { ok: false, calls, reply: read.reply, why: "the auction round came back without its line item's product ids" };
  const tradeProduct = {
    trade_product_uuid: p.trade_product_uuid,
    trade_product_id: p.trade_product_id,
    trade_product_category_uuid: p.trade_product_category_uuid,
    product_id: p.id,
    product_code: p.product_code,
  };
  const line = {
    productUuid: j.catalog.productUuid,
    productQualityUuid: j.catalog.productQualityUuid,
    locationUuid: j.catalog.locationUuid,
    lineItemUuid: ev.lineItemUuid,
    quantityValue: j.qty,
    quantityUnit: j.unit,
    price,
    tradeProduct,
  };
  if (surrogate) {
    const body = j.s.bodies.buildSurrogateRfqBody({ pricingTradeUuid: auctionUuid, vendorCompanyUuid: j.vendorCompanyUuid, ...line });
    const r = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.surrogateRfqBid(), body);
    calls.push(r.call);
    if (!r.reply.ok) return { ok: false, calls, reply: r.reply, why: "the buyer's on-behalf auction bid was refused" };
    return { ok: true, calls, reply: r.reply, actual: `The buyer then entered ${rupees(price)} per ${j.unit} in the auction on ${j.vendorName}'s behalf.` };
  }
  const open = await fire(api, "POST", j.s.Endpoints.createBid(), j.s.bodies.buildCreateBid({ pricingTradeUuid: auctionUuid, vendorCompanyUuid: j.vendorCompanyUuid }));
  calls.push(open.call);
  const bidUuid = open.reply.data?.bid_uuid ?? open.reply.data?.uuid;
  if (!open.reply.ok || !bidUuid) return { ok: false, calls, reply: open.reply, why: open.reply.ok ? "the auction bid came back without an id" : "the vendor could not open an auction bid" };
  const { body, total } = j.s.bodies.buildBidProductsBody({ pricingTradeUuid: auctionUuid, vendorCompanyUuid: j.vendorCompanyUuid, ...line });
  const prod = await fire(api, "POST", j.s.Endpoints.createBidProducts(String(bidUuid)), body);
  calls.push(prod.call);
  if (!prod.reply.ok) return { ok: false, calls, reply: prod.reply, why: "the vendor's auction price was refused" };
  const sub = await fire(api, "PATCH", j.s.Endpoints.submitBid(String(bidUuid)), j.s.bodies.buildSubmitBidBody({ pricingTradeUuid: auctionUuid, vendorCompanyUuid: j.vendorCompanyUuid, total }));
  calls.push(sub.call);
  if (!sub.reply.ok || sub.reply.data?.success === false) return { ok: false, calls, reply: sub.reply, why: sub.reply.ok ? "the app answered success: false" : "the vendor's auction bid was refused at submit" };
  return { ok: true, calls, reply: sub.reply, actual: `${j.vendorName} then bid ${rupees(price)} per ${j.unit} in the auction (${rupees(total)} before tax).` };
}

/**
 * THE WINDOW THE JOURNEY GIVES ITSELF.
 *
 * The collection's default puts the extra closing time a whole second window
 * after the bid end — `ect = now + 2 × duration` — and the run waits for the
 * EXTRA closing time, because that is when the app treats bidding as over.
 * With a 60-second round that was a two-minute clock started before the
 * buyer had even signed in, and an 80-second wait on screen with nothing
 * happening. The journey needs the round open only until the vendor's bid is
 * in (about 30 seconds after the round is attached), so it closes the extra
 * time five seconds after the bid end and gets on with the award.
 */
const EXTRA_CLOSE_SEC = 5;
function journeyTiming(now: number, durSec: number): StageTiming {
  return { bst: now, bet: now + durSec, ect: now + durSec + EXTRA_CLOSE_SEC };
}

const WAIT_CAP_MS = 5 * 60 * 1000;
const WAIT_GRACE_SEC = 8;

const waitClose: StepSpec = {
  kind: "wait_close",
  needs: (j, ev, done) => {
    if (!j.closeTimes.length) return `no round was attached, so there is no bidding window to wait for (${because(j, done, "add_stage_pricing")})`;
    return need(j, done, "the event was never published, so there is no bidding window to wait for", ev.status === "active", "publish");
  },
  expected: (j) =>
    j.closeTimes.length
      ? `The bidding window closes at ${hhmmss(Math.max(...j.closeTimes))}; the run waits for it (plus ${WAIT_GRACE_SEC} seconds) before evaluating or awarding.`
      : `The run waits for the bidding window to close (plus ${WAIT_GRACE_SEC} seconds) before evaluating or awarding.`,
  run: async (j) => {
    const closesAt = Math.max(...j.closeTimes);
    const due = (closesAt + WAIT_GRACE_SEC) * 1000 - Date.now();
    if (due <= 0) return { ms: 0, actual: `The window had already closed at ${hhmmss(closesAt)}; no wait was needed.` };
    // Never past the journey's own budget: the steps after the wait need time too.
    const total = Math.max(0, Math.min(due, WAIT_CAP_MS, j.deadline - Date.now() - 60_000));
    const t0 = Date.now();
    let remaining = total;
    while (remaining > 0) {
      j.opts.onLine?.(`waiting for the bidding window to close — ${fmtDuration(remaining)} left`);
      await sleep(Math.min(15_000, remaining));
      remaining = total - (Date.now() - t0);
    }
    const waited = Date.now() - t0;
    j.waitedMs += waited;
    if (due > total) {
      return {
        ms: waited,
        actual: `Waited ${fmtDuration(waited)} — ${total < WAIT_CAP_MS ? "all the journey's time budget allowed" : "the five-minute cap"} — but the window only closes at ${hhmmss(closesAt)}, so the steps after this may still be refused while bidding is open.`,
      };
    }
    return { ms: waited, actual: `Waited ${fmtDuration(waited)}; the window closed at ${hhmmss(closesAt)}.` };
  },
};

const evaluatorLogin: StepSpec = {
  kind: "evaluator_login",
  needs: async (j, _ev, done) => {
    await ensureEvaluator(j);
    if (!j.evaluator) return j.evaluatorProblem ?? `no evaluator was named on the technical round (${because(j, done, "add_stage_rfp")})`;
    return undefined;
  },
  expected: (j) =>
    j.evaluator?.session
      ? `The app accepts ${j.evaluator.name}'s web-console session as the evaluator and answers with the dashboard configuration.`
      : `A one-time code is sent to ${j.evaluator?.name ?? "the evaluator"}'s phone and, once verified, signs the evaluator into the web console.`,
  run: async (j) => {
    const who = j.evaluator!;
    const fix = `Someone from ${j.company} must sign into the web console as a second user so the evaluator has a live session; then run this again.`;
    if (who.session) {
      const api = await j.s.clientFromSession(who.session, { app: "console", companyId: j.companyId, baseURL: j.baseURL, identity: "evaluator" });
      const { call, reply } = await fire(api, "GET", j.s.Endpoints.dashboardConfiguration());
      if (!reply.ok) {
        await api.dispose?.().catch(() => {});
        return { call, reply, hint: fix };
      }
      j.actors.evaluatorApi = api;
      return { call, reply, actual: `Using ${who.name}'s web-console session as the evaluator — the app accepted it.` };
    }
    if (!who.phone) {
      return {
        notRun: `${who.name} has no live web-console session and no phone the backend accepts for a one-time code (a console user cannot get one by email — generate_otp answers “Not authorized”) — give a ${j.company} user a valid phone, or sign one into the web console as a second user`,
      };
    }
    const prefix = who.phonePrefix ?? j.s.CONFIG.identities.evaluator.phonePrefix;
    // By phone only, as the stored value's halves: the backend joins
    // phone_prefix + "/" + phone and matches users.phone exactly (params_auth.rb
    // check_phone_and_prefix), and never sends a console user a code by email
    // (users_controller_helper.rb check_otp_on_email_allowed → 5).
    const attempt = await otpLogin(
      j,
      { ...j.s.CONFIG.identities.evaluator, email: undefined, phone: who.phone, phonePrefix: prefix, tenantCompanyId: j.companyId, ownerEmail: who.email },
      { phone: who.phone, phone_prefix: prefix },
    );
    const { login, fired } = attempt;
    if (!login)
      return {
        ...fired,
        hint: fired.reply?.errorCode === "705"
          ? TNC_HINT(`the evaluator (${who.name})`)
          : /invalid otp/i.test(fired.reply?.errorMessage ?? "")
          ? `None of the codes the backend accepts for this user worked (its company's UAT login code, then the configured one) — check the company's uat_login_otp setting.`
          : fix,
      };
    j.actors.evaluatorApi = await j.s.ApiClient.create(login, {
      baseURL: j.baseURL,
      appVersion: login.appVersion,
      identity: "evaluator",
      companyId: j.companyId,
    });
    return {
      ...fired,
      actual:
        `Signed in as the evaluator (${who.name}) — the one-time code was accepted${login.otpSource ? ` (${login.otpSource})` : ""}.` +
        (login.termsAccepted ? " This QA test user had not yet accepted Procol's Terms of Use, so the platform accepted them for it (test users only)." : ""),
    };
  },
};

const evalSchema: StepSpec = {
  kind: "eval_schema",
  needs: (j, ev, done) => first(needEvaluator(j, done), needTechnical(j, ev, done), needPublished(j, ev, done)),
  expected: (j) => `The evaluator can open the technical round's forms and one of them is assigned to ${j.evaluator?.name ?? "the evaluator"} to score.`,
  run: async (j, ev) => {
    const { call, reply } = await fire(j.actors.evaluatorApi, "GET", j.s.Endpoints.tradeSchema(tradeOf(ev, "rfp")!));
    if (!reply.ok) return { call, reply };
    const forms: any[] = Array.isArray(reply.data?.sheets?.forms) ? reply.data.sheets.forms : [];
    const who = j.evaluator!;
    const mine = forms.find((f) => (f?.evaluators || []).some((e: any) => e?.shared_with_uuid === who.uuid));
    if (!mine?.uuid) return { call, reply, shortfall: `none of the ${count(forms.length, "form")} is assigned to ${who.name} to score` };
    const closeTime = Number(reply.data?.extra_closing_time || reply.data?.ending_at || 0) || undefined;
    j.evalForm = { uuid: String(mine.uuid), closeTime, scores: scoreScale(reply.data) };
    const clock = closeTime ? (nowSec() < closeTime ? ` Bidding is still open until ${hhmmss(closeTime)}.` : ` Bidding closed at ${hhmmss(closeTime)}.`) : "";
    return {
      call,
      reply,
      actual: `The evaluator sees ${count(forms.length, "form")}; the one assigned to ${who.name} is ${mine.uuid}.${clock}`,
      produced: { evalFormUuid: String(mine.uuid) },
    };
  },
};

/**
 * The scores this event accepts. Not a fixed 1–10: the backend only takes a
 * score that is a key of the event's evaluation_score_label_mapping (the RFP's,
 * else the company's) — Demo Account 2 scores 0–5 as TNA…P1 — and answers
 * 422 "Insufficient parameters" for anything else (procol-backend
 * evaluations/validate_service.rb valid_form?). Hidden labels are left out.
 */
function scoreScale(data: any): { score: number; label: string }[] | undefined {
  let found: any[] | undefined;
  const walk = (o: any, depth: number) => {
    if (found || !o || typeof o !== "object" || depth > 6) return;
    if (Array.isArray(o.evaluation_score_label_mapping)) {
      found = o.evaluation_score_label_mapping;
      return;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(data, 0);
  const list = (found ?? [])
    .filter((m) => Number.isInteger(m?.score) && !m?.is_hidden)
    .map((m) => ({ score: Number(m.score), label: String(m.label ?? m.score) }));
  return list.length ? list : undefined;
}

const evalScore: StepSpec = {
  kind: "eval_score",
  needs: (j, _ev, done) =>
    first(
      needEvaluator(j, done),
      need(j, done, "no form assigned to the evaluator was found", j.evalForm, "eval_schema"),
      need(j, done, "no technical response was submitted to score", j.techResponded, techProducer(j)),
    ),
  expected: (j) => `A score from the event's own scale is recorded on ${j.evaluator?.name ?? "the evaluator"}'s form for ${j.vendorName}'s response and the app answers success: true.`,
  run: async (j, ev) => {
    // A score the event accepts, above zero (zero is "not accepted" and needs a remark).
    const scale = j.evalForm!.scores?.filter((x) => x.score > 0);
    const pick = scale?.length ? scale[randInt(0, scale.length - 1)] : undefined;
    const score = pick ? pick.score : randInt(1, 10);
    const body = j.s.bodies.buildCreateEvaluation({
      technicalTradeUuid: tradeOf(ev, "rfp"),
      vendorCompanyUuid: j.vendorCompanyUuid,
      formUuid: j.evalForm!.uuid,
      score,
    });
    const { call, reply } = await fire(j.actors.evaluatorApi, "POST", j.s.Endpoints.evaluations(), body);
    if (!reply.ok) return { call, reply };
    if (reply.data?.success === false) return { call, reply, shortfall: "the app answered success: false" };
    j.evalScored = true;
    const top = j.evalForm!.scores ? Math.max(...j.evalForm!.scores.map((x) => x.score)) : 10;
    return { call, reply, actual: `Scored ${score}/${top}${pick ? ` (“${pick.label}”)` : ""} on the form assigned to ${j.evaluator!.name}.` };
  },
};

const evalSubmit: StepSpec = {
  kind: "eval_submit",
  needs: (j, ev, done) =>
    first(needEvaluator(j, done), needTechnical(j, ev, done), need(j, done, "no score was recorded to submit", j.evalScored, "eval_score")),
  expected: () => `The evaluation is submitted for the technical round and the app accepts it.`,
  run: async (j, ev) => {
    const { call, reply } = await fire(j.actors.evaluatorApi, "PATCH", j.s.Endpoints.submitEvaluation(), { trade_request_uuid: tradeOf(ev, "rfp") });
    if (!reply.ok) return { call, reply };
    if (reply.data?.success === false) return { call, reply, shortfall: "the app answered success: false" };
    return { call, reply, actual: `The evaluation was submitted for the technical round.` };
  },
};

const awardProposal: StepSpec = {
  kind: "award_proposal",
  needs: (j, ev, done) => first(needBuyer(j, done), needDraft(j, ev, done), needPublished(j, ev, done)),
  expected: () => `An award proposal is opened on the event and comes back with its id.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildProposalBody({ eventGroupUuid: ev.eventGroupUuid });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.proposal(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.uuid;
    if (!uuid) return { call, reply, shortfall: "the reply carried no proposal id" };
    return { call, reply, actual: `Award proposal ${uuid} was opened on the event.`, produced: { proposalUuid: String(uuid) } };
  },
};

const awardLines: StepSpec = {
  kind: "award_lines",
  needs: (j, ev, done) =>
    first(
      needBuyer(j, done),
      need(j, done, "no award proposal was opened", j.made.proposalUuid, "award_proposal"),
      needDraft(j, ev, done),
      need(j, done, "no bid was placed on the line item to award", j.bidPlaced, bidProducer(j)),
    ),
  expected: (j) => `${j.qty} ${j.unit} of the line item is awarded to ${j.vendorName} on the proposal and the app accepts it.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildAwardResponseBody({ vendorCompanyUuid: j.vendorCompanyUuid, lineItemUuid: ev.lineItemUuid, quantityValue: j.qty });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.proposalAddResponse(j.made.proposalUuid), body);
    if (!reply.ok) return { call, reply };
    return { call, reply, actual: `Awarded ${j.qty} ${j.unit} of the line item to ${j.vendorName}.` };
  },
};

const awardWorkflow: StepSpec = {
  kind: "award_workflow",
  needs: (j, _ev, done) => first(needBuyer(j, done), need(j, done, "no award proposal was opened", j.made.proposalUuid, "award_proposal")),
  expected: () => `The app lists the approval workflow that applies to this award, or says there is none.`,
  run: async (j) => {
    const { call, reply } = await fire(j.client.ctx.buyerApi, "GET", j.s.Endpoints.proposalApprovalWorkflows(j.made.proposalUuid));
    if (!reply.ok) return { call, reply };
    const d = reply.data;
    const flows: any[] = Array.isArray(d) ? d : Array.isArray(d?.approval_workflows) ? d.approval_workflows : Array.isArray(d?.data) ? d.data : [];
    const flow = flows[0];
    if (!flow?.uuid) {
      j.approvalFlowUuid = null;
      return {
        call,
        reply,
        actual: `No approval workflow is configured for awards at ${j.company}, so this award has no approver to go to — a valid configuration, not a refusal.`,
      };
    }
    j.approvalFlowUuid = String(flow.uuid);
    let approvers = 0;
    for (const step of flow.steps ?? []) approvers += arrLen(step?.approvers) ?? 0;
    return {
      call,
      reply,
      actual: `${count(flows.length, "approval workflow")} ${flows.length === 1 ? "applies" : "apply"}; the award goes through ${flow.uuid} with ${count(approvers, "approver")}.`,
      produced: { approvalFlowUuid: String(flow.uuid) },
    };
  },
};

const awardSubmit: StepSpec = {
  kind: "award_submit",
  needs: (j, _ev, done) => {
    const base = first(needBuyer(j, done), need(j, done, "no award proposal was opened", j.made.proposalUuid, "award_proposal"));
    if (base) return base;
    if (j.approvalFlowUuid === null) {
      const looked = done.find((s) => s.kind === "award_workflow") ?? j.steps.find((s) => s.kind === "award_workflow");
      return `no approval workflow is configured for awards at ${j.company}, so there is nothing to submit the award into${looked ? ` (step ${looked.n} — ${looked.title} — found none)` : ""}`;
    }
    return need(j, done, "the approval workflow was never read", j.approvalFlowUuid, "award_workflow");
  },
  expected: () => `The award is submitted into its approval workflow and the app answers success: true.`,
  run: async (j) => {
    const body = j.s.bodies.buildAwardSubmitBody({ approvalFlowUuid: j.approvalFlowUuid });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.proposalSubmit(j.made.proposalUuid), body);
    if (!reply.ok) return { call, reply };
    if (reply.data?.success === false) return { call, reply, shortfall: "the app answered success: false" };
    return { call, reply, actual: `The award was submitted for approval${reply.data?.success === true ? " (the app answered success: true)" : ""}.` };
  },
};

const version: StepSpec = {
  kind: "version",
  needs: (j, ev, done) => first(needBuyer(j, done), needDraft(j, ev, done)),
  expected: () => `A new version of the event is issued and comes back with the new copy's id.`,
  run: async (j, ev) => {
    const body = j.s.bodies.buildItemVersionBody({ eventGroupUuid: ev.eventGroupUuid });
    const { call, reply } = await fire(j.client.ctx.buyerApi, "POST", j.s.Endpoints.itemVersions(), body);
    if (!reply.ok) return { call, reply };
    const uuid = reply.data?.uuid;
    if (!uuid) return { call, reply, shortfall: "the reply carried no version id" };
    const copy = reply.data?.new_item_data?.uuid;
    const rounds = arrLen(reply.data?.new_item_data?.trade_uuids);
    const produced: Record<string, string> = { versionUuid: String(uuid) };
    if (copy) produced.versionedEventUuid = String(copy);
    return {
      call,
      reply,
      actual: `Version ${uuid} was issued${copy ? `; the new copy of the event is ${copy}${rounds !== undefined ? ` with ${count(rounds, "round")}` : ""}` : ""}.`,
      produced,
    };
  },
};

const SPECS: Record<StepKind, StepSpec> = {
  buyer_login: buyerLogin,
  create_draft: createDraft,
  add_stage_rfp: addStage("add_stage_rfp"),
  add_stage_pricing: addStage("add_stage_pricing"),
  publish,
  read_back: readBack,
  vendor_login: vendorLogin,
  vendor_open_pricing: vendorOpenPricing,
  vendor_open_technical: vendorOpenTechnical,
  tech_start: techStart,
  tech_answer: techAnswer,
  tech_submit: techSubmit,
  bid_create: bidCreate,
  bid_products: bidProducts,
  bid_submit: bidSubmit,
  surrogate_tech: surrogateTech,
  surrogate_rfq: surrogateRfq,
  counter_offer: counterOffer,
  convert_auction: convertAuction,
  wait_close: waitClose,
  evaluator_login: evaluatorLogin,
  eval_schema: evalSchema,
  eval_score: evalScore,
  eval_submit: evalSubmit,
  award_proposal: awardProposal,
  award_lines: awardLines,
  award_workflow: awardWorkflow,
  award_submit: awardSubmit,
  version,
};

// ── running one step ───────────────────────────────────────────────────────

function blankRecord(kind: StepKind, n: number): JourneyStepRecord {
  const meta = STEP_META[kind];
  return { n, kind, actor: meta.actor, title: meta.title, postman: meta.postman, expected: "", actual: "", verdict: "not-run", startedAt: new Date().toISOString() };
}

function notRunRecord(kind: StepKind, n: number, reason: string): JourneyStepRecord {
  const rec = blankRecord(kind, n);
  rec.reason = reason;
  rec.actual = `Did not run — ${reason}.`;
  return rec;
}

/**
 * Turns what a step handed back into its verdict and sentence.
 *
 * The sentence for a refusal or a break quotes the app, because "refused" is
 * only a defect if the refusal is wrong and the reader has to be able to judge
 * that from the row. A 2xx that lacks what the step needed is recorded as
 * broken too: the app said yes and did not do the thing, and every step after
 * it will now fail for want of that id.
 */
function finish(rec: JourneyStepRecord, fired: Fired): void {
  if (fired.notRun) {
    rec.verdict = "not-run";
    rec.reason = fired.notRun;
    rec.actual = `Did not run — ${fired.notRun}.`;
    return;
  }
  rec.call = fired.call;
  if (fired.alsoCalled?.length) rec.alsoCalled = fired.alsoCalled;
  if (fired.produced && Object.keys(fired.produced).length) rec.produced = fired.produced;
  if (!fired.reply) {
    rec.verdict = "worked";
    rec.ms = fired.ms ?? 0;
    rec.actual = fired.actual ?? "Done.";
    return;
  }
  const r = fired.reply;
  rec.status = r.status;
  rec.ms = r.ms;
  if (r.errorCode) rec.errorCode = r.errorCode;
  const said = clean(r.errorMessage) ?? (r.status === 0 ? "no reply came back" : `HTTP ${r.status}`);
  const code = r.errorCode ? ` (code ${r.errorCode})` : "";
  const tail = fired.hint ? ` ${fired.hint}` : "";
  if (r.status === 0) {
    rec.verdict = "broken";
    rec.message = said;
    rec.actual = fired.call ? `The request never completed: ${said}.${tail}` : `This step hit an error before its request was sent: ${said}.`;
  } else if (r.status >= 500) {
    rec.verdict = "broken";
    rec.message = said;
    rec.actual = `The app broke: HTTP ${r.status} — “${said}”${code}.${tail}`;
  } else if (!r.ok) {
    rec.verdict = "refused";
    rec.message = said;
    rec.actual = `The app refused it: HTTP ${r.status} — “${said}”${code}.${tail}`;
  } else if (fired.shortfall) {
    rec.verdict = "broken";
    rec.message = fired.shortfall;
    rec.actual = `The app answered HTTP ${r.status}, but ${fired.shortfall}.`;
  } else {
    rec.verdict = "worked";
    rec.actual = fired.actual ?? `The app answered HTTP ${r.status}.`;
  }
}

/** Runs one step against one event build; never throws, never touches the journey's lists. */
async function performStep(j: Journey, spec: StepSpec, n: number, ev: EventBuild, done: JourneyStepRecord[]): Promise<JourneyStepRecord> {
  const rec = blankRecord(spec.kind, n);
  const choices = choicesFor(j, spec.kind);
  if (choices) rec.choices = choices;
  let reason: Needs;
  try {
    reason = await spec.needs(j, ev, done);
  } catch (e) {
    reason = `working out what this step needs failed: ${clean(e instanceof Error ? e.message : String(e))}`;
  }
  try {
    rec.expected = spec.expected(j, ev);
  } catch {
    rec.expected = STEP_META[spec.kind].title;
  }
  if (reason) {
    rec.reason = reason;
    rec.actual = `Did not run — ${reason}.`;
    return rec;
  }
  const t = Date.now();
  let fired: Fired;
  try {
    fired = await spec.run(j, ev);
  } catch (e) {
    fired = { reply: { status: 0, ok: false, data: null, errorMessage: e instanceof Error ? e.message : String(e), ms: Date.now() - t } };
  }
  finish(rec, fired);
  // Keep the body for the report and the catalog build, then run the
  // field-level checks against the FULL live reply (not the trimmed copy),
  // with the ids the earlier steps produced for the cross-step checks.
  if (fired.reply && fired.call) {
    try {
      rec.response = keepResponse(fired.reply.data, redactBody);
      const made = Object.assign({}, ...done.map((d) => d.produced ?? {})) as Record<string, string>;
      const assertions = evaluateStepAssertions(rec, fired.reply.data, made);
      if (assertions) rec.assertions = assertions;
    } catch (e) {
      j.opts.onLine?.(`field checks for step ${n} could not run: ${clean(e instanceof Error ? e.message : String(e))}`);
    }
  }
  return rec;
}

// ── resilience: choices, alternatives, the guarded step, the walk ──────────

const LOGIN_KINDS: StepKind[] = ["buyer_login", "vendor_login", "evaluator_login"];
const isStage = (k: StepKind) => k === "add_stage_rfp" || k === "add_stage_pricing";

/** The words for the current value of a choice, with a plain fallback before the lists are read. */
function choiceLabel(j: Journey, kind: ChoiceKind): string {
  const cur = j.book.current(kind)?.label;
  if (cur) return cur;
  switch (kind) {
    case "unit":
      return j.unit;
    case "vendor":
      return j.vendorName;
    case "timing":
      return `${j.stageSeconds}-second rounds`;
    case "product":
      return "the catalog product";
    case "location":
      return "the first delivery location";
    case "pricingTemplate":
      return "the first pricing template";
    case "technicalTemplate":
      return "the first technical template";
    default:
      return CHOICE_WORD[kind];
  }
}

function choicesFor(j: Journey, kind: StepKind): JourneyStepRecord["choices"] | undefined {
  const kinds = STEP_CHOICES[kind];
  if (!kinds?.length) return undefined;
  const out: NonNullable<JourneyStepRecord["choices"]> = {};
  for (const k of kinds) {
    if (k === "technicalTemplate" && !j.plan.stages.includes("rfp")) continue;
    out[k] = choiceLabel(j, k);
  }
  return out;
}

/** Puts a new option into the journey's state, so every later body is built from it. */
function applyChoice(j: Journey, kind: ChoiceKind, opt: ChoiceOption): void {
  switch (kind) {
    case "unit":
      j.unit = opt.value;
      break;
    case "product":
      j.catalog.productUuid = opt.value;
      if (opt.extra?.qualityUuid) j.catalog.productQualityUuid = opt.extra.qualityUuid;
      break;
    case "location":
      j.catalog.locationUuid = opt.value;
      break;
    case "pricingTemplate":
      j.catalog.pricingTemplateUuid = opt.value;
      break;
    case "technicalTemplate":
      j.catalog.technicalTemplateUuid = opt.value;
      break;
    case "vendor":
      j.vendorCompanyUuid = opt.value;
      j.catalog.vendorBidCompanyUuid = opt.value;
      j.vendorName = opt.label;
      j.vendorEmail = opt.extra?.email;
      break;
    case "timing":
      j.stageSeconds = Number(opt.value) || j.stageSeconds;
      break;
    default:
      break;
  }
}

/** SPINE_JOURNEY_FORCE="unit=Nos;location=<uuid>" → { unit: "Nos", location: "<uuid>" } */
function forcedChoices(opts: JourneyRunOptions): Partial<Record<ChoiceKind, string>> {
  const out: Partial<Record<ChoiceKind, string>> = { ...(opts.force ?? {}) };
  const raw = process.env.SPINE_JOURNEY_FORCE ?? "";
  for (const part of raw.split(/[;,]/)) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim() as ChoiceKind;
    const v = rest.join("=").trim();
    if (key && v && key in CHOICE_WORD) out[key] = v;
  }
  return out;
}

/**
 * Reads the alternatives once, bounded: the company's units, products,
 * templates and locations from the live app (catalog/resolve.ts), and the
 * vendors it could invite instead. Nothing here is required — a list that
 * cannot be read leaves that choice with nothing to move on to, and says so.
 *
 * Vendors: only test vendors (an …@example.com login) are offered as
 * alternatives. Inviting a different real company to an event emails its
 * people, and that is never the platform's call.
 */
async function ensureAlternatives(j: Journey): Promise<void> {
  if (j.altsLoaded) return;
  j.altsLoaded = true;
  const api = j.client.ctx.buyerApi;
  const book = j.book;
  try {
    if (!j.s.resolveCatalogAlternatives) throw new Error("the alternatives lister could not be loaded");
    const alts = await withWatchdog(j.s.resolveCatalogAlternatives(api), 45_000, "reading the alternatives");
    j.altProblems.push(...((alts?.problems as string[]) ?? []));
    const units: string[] = alts?.units ?? [];
    if (units.length) j.companyUnits = units;
    const products: any[] = alts?.products ?? [];
    const current = products.find((p) => p.uuid === j.catalog.productUuid);
    book.setOptions(
      "product",
      { value: j.catalog.productUuid, label: current?.name ? String(current.name) : products.length ? `a product not in ${j.company}'s product search` : "the catalog product", extra: { qualityUuid: j.catalog.productQualityUuid } },
      products
        // a product whose own units the company lists first; one with none of them last
        .map((p) => ({ p, fits: !p.units?.length || !units.length || p.units.some((u: string) => unitListed(units, u)) }))
        .sort((a, b) => Number(b.fits) - Number(a.fits))
        .map(({ p }) => ({ value: p.uuid, label: String(p.name), extra: { qualityUuid: p.qualityUuid } })),
    );
    book.setOptions(
      "unit",
      { value: j.unit, label: j.unit },
      rankUnits(units, current?.units ?? []).map((u) => ({ value: u, label: u })),
    );
    const tplOpt = (t: any) => ({ value: t.uuid, label: String(t.name) });
    const pt: any[] = alts?.pricingTemplates ?? [];
    const curPt = pt.find((t) => t.uuid === j.catalog.pricingTemplateUuid);
    book.setOptions("pricingTemplate", { value: j.catalog.pricingTemplateUuid, label: curPt ? String(curPt.name) : pt.length ? `a pricing template not in ${j.company}'s list` : "the first pricing template" }, rankTemplates(pt, "pricing").map(tplOpt));
    const tt: any[] = alts?.technicalTemplates ?? [];
    const curTt = tt.find((t) => t.uuid === j.catalog.technicalTemplateUuid);
    book.setOptions("technicalTemplate", { value: j.catalog.technicalTemplateUuid, label: curTt ? String(curTt.name) : tt.length ? `a technical template not in ${j.company}'s list` : "the first technical template" }, rankTemplates(tt, "technical").map(tplOpt));
    const locs: any[] = alts?.locations ?? [];
    const curLoc = locs.find((l) => l.uuid === j.catalog.locationUuid);
    book.setOptions("location", { value: j.catalog.locationUuid, label: curLoc ? String(curLoc.name) : locs.length ? `a delivery location not in ${j.company}'s list` : "the first delivery location" }, locs.map((l) => ({ value: l.uuid, label: String(l.name) })));
  } catch (e) {
    j.altProblems.push(`catalog alternatives: ${clean(e instanceof Error ? e.message : String(e))}`);
  }
  try {
    const vendors: any[] = j.s.listInvitableVendors ? await withWatchdog(j.s.listInvitableVendors(api, "", 10), 30_000, "reading the vendor list") : [];
    const safe = vendors.filter((v) => v?.uuid && typeof v.email === "string" && /@example\.com$/i.test(v.email));
    book.setOptions(
      "vendor",
      { value: j.vendorCompanyUuid, label: j.vendorName, extra: j.vendorEmail ? { email: j.vendorEmail } : undefined },
      safe.map((v) => ({ value: String(v.uuid), label: String(v.name ?? v.email), extra: { email: String(v.email) } })),
    );
  } catch (e) {
    j.altProblems.push(`vendors: ${clean(e instanceof Error ? e.message : String(e))}`);
  }
  // The clock: a longer window each time, never shorter than asked for.
  const base = j.stageSeconds;
  book.setOptions(
    "timing",
    { value: String(base), label: `${base}-second rounds` },
    [base * 2, base * 3].map((sec) => ({ value: String(sec), label: `${sec}-second rounds` })),
  );
}

/**
 * Runs one step under a watchdog. A step that hangs — a request that never
 * answers, a database look-up that never returns — is recorded as a step
 * that never finished (no reply, status 0), which the classifier treats as an
 * environment failure, so it is tried again rather than freezing the run.
 */
async function performGuarded(j: Journey, spec: StepSpec, n: number, ev: EventBuild, done: JourneyStepRecord[]): Promise<JourneyStepRecord> {
  const bound = spec.kind === "wait_close" ? BOUNDS.waitCapMs + 60_000 : LOGIN_KINDS.includes(spec.kind) ? BOUNDS.loginStepMs : (j.opts.stepBoundMs ?? BOUNDS.stepMs);
  try {
    return await withWatchdog(performStep(j, spec, n, ev, done), bound, `Step ${n} (${STEP_META[spec.kind].title.toLowerCase()})`);
  } catch (e) {
    const rec = blankRecord(spec.kind, n);
    const choices = choicesFor(j, spec.kind);
    if (choices) rec.choices = choices;
    try {
      rec.expected = spec.expected(j, ev);
    } catch {
      rec.expected = STEP_META[spec.kind].title;
    }
    const msg = clean(e instanceof Error ? e.message : String(e)) ?? "the step did not finish";
    if (e instanceof WatchdogTimeout) j.res.watchdogTrips++;
    rec.verdict = "broken";
    rec.status = 0;
    rec.ms = bound;
    rec.message = msg;
    rec.actual = `The step never finished: ${msg}.`;
    return rec;
  }
}

function attemptOf(rec: JourneyStepRecord, c: Classified, attempt: number, next: JourneyStepAttempt["next"], reason: string, choiceValue?: string): JourneyStepAttempt {
  return {
    attempt,
    verdict: rec.verdict,
    ...(rec.status !== undefined ? { status: rec.status } : {}),
    ...(rec.errorCode ? { errorCode: rec.errorCode } : {}),
    ...(rec.message ? { message: rec.message } : {}),
    actual: rec.actual,
    ...(rec.call ? { call: rec.call } : {}),
    ...(rec.ms !== undefined ? { ms: rec.ms } : {}),
    startedAt: rec.startedAt,
    failureClass: c.cls,
    failureRule: c.rule,
    ...(c.choice ? { choice: c.choice } : {}),
    ...(choiceValue ? { choiceValue } : {}),
    ...(rec.choices ? { choices: rec.choices } : {}),
    next,
    reason,
  };
}

/**
 * Why a unit was refused, decided from the company's own unit list (the list
 * the backend checks against): a unit the company LISTS and the app still
 * refuses is a product bug; a unit it does not list is test data that did
 * not fit this client.
 */
function unitBlame(j: Journey, unit: string): string | undefined {
  if (!j.companyUnits?.length) return undefined;
  const n = j.companyUnits.length;
  return unitListed(j.companyUnits, unit)
    ? `“${unit}” IS in ${j.company}'s own list of ${n} units, so the app refused a unit it offers — this is a product bug for ${j.company}.`
    : `“${unit}” is not in ${j.company}'s list of ${n} units, so the unit the platform picked did not fit this client — a test-data mismatch rather than a product bug (if ${j.company} should have “${unit}”, it is a configuration gap). Recorded so it is not hidden.`;
}

function freshEvent(j: Journey, mode: "journey" | "variations"): EventBuild {
  j.res.rebuilds++;
  const suffix = `_retry${j.res.rebuilds}`;
  if (mode === "variations") return { title: `QA_Platform_Variations_${Date.now()}`, timing: j.s.bodies.stageTiming(nowSec(), 1800), trades: [] };
  return { title: `${j.title}${suffix}`, timing: journeyTiming(nowSec(), j.stageSeconds), trades: [] };
}

/** Forget everything the abandoned event produced; keep what came before the draft. */
function resetJourneyState(j: Journey, kept: JourneyStepRecord[], ev: EventBuild, vendorChanged: boolean): void {
  j.event = ev;
  j.made = Object.assign({}, ...kept.map((r) => r.produced ?? {}));
  j.tradeProduct = undefined;
  j.techForm = undefined;
  j.bidTotal = undefined;
  j.bidPlaced = false;
  j.techResponded = false;
  j.evalForm = undefined;
  j.evalScored = false;
  j.approvalFlowUuid = undefined;
  j.closeTimes = [];
  if (vendorChanged && j.actors.vendorApi) {
    const api = j.actors.vendorApi;
    j.actors.vendorApi = undefined;
    void withWatchdog(Promise.resolve(api.dispose?.()), 10_000, "closing the vendor session").catch(() => {});
  }
}

interface WalkOptions {
  mode: "journey" | "variations";
  emit?: (rec: JourneyStepRecord) => void;
}

/**
 * Walks `kinds` in order, never stuck and never silent:
 *
 *  1. every step runs under a watchdog, and nothing new starts after the
 *     journey's deadline (the rest is "not run" with that reason);
 *  2. an environment failure (502/503/504, timeout, no reply) is tried again
 *     as the same request, with backoff, at most twice;
 *  3. a data-choice failure (a unit, product, template, location or vendor
 *     this client cannot use) moves that choice to its next option — in
 *     place when the failing step is where the choice is made, else by going
 *     BACK to the draft and rebuilding the event from there — at most three
 *     options per choice and six moves in all;
 *  4. product defects and clean refusals are recorded and not retried.
 *
 * Every failed try stays on the step's record (`attempts`). Returns the event
 * build the walk ended on (a rebuild replaces it).
 */
async function walk(j: Journey, kinds: StepKind[], ev0: EventBuild, out: JourneyStepRecord[], wo: WalkOptions): Promise<EventBuild> {
  let ev = ev0;
  let i = 0;
  const carried = new Map<number, JourneyStepAttempt[]>();
  const carry = (idx: number, a: JourneyStepAttempt) => carried.set(idx, [...(carried.get(idx) ?? []), a]);
  const triesAt = (idx: number) => (carried.get(idx)?.length ?? 0) + 1;
  /** step indexes being run again because the event was rebuilt */
  const rerun = new Set<number>();

  while (i < kinds.length) {
    const kind = kinds[i];
    if (Date.now() > j.deadline) {
      j.res.budgetExhausted = true;
      const why = `the journey used up its ${Math.round((j.opts.journeyBudgetMs ?? BOUNDS.journeyMs) / 60_000)}-minute time budget before this step (retries included), so the platform stopped rather than hang`;
      for (let k = i; k < kinds.length; k++) {
        const rec = notRunRecord(kinds[k], k + 1, why);
        out[k] = rec;
        wo.emit?.(rec);
      }
      break;
    }
    if (wo.mode === "journey" && isStage(kind) && !j.closeTimes.length) j.closeTimes.push(ev.timing.ect);
    if (STEP_CHOICES[kind] && !j.altsLoaded) await ensureAlternatives(j);

    // ── run, retrying the same request on an environment failure ──
    let rec: JourneyStepRecord;
    let c: Classified | undefined;
    let same = 0;
    for (;;) {
      rec = await performGuarded(j, SPECS[kind], i + 1, ev, out.slice(0, i));
      c = classifyStep(rec);
      if (c) {
        rec.failureClass = c.cls;
        rec.failureRule = c.rule;
      }
      const sameRetry = !!c && (c.cls === "environment" || (c.cls === "timing" && !c.choice));
      if (!sameRetry || same >= BOUNDS.maxSameRequestRetries) break;
      same++;
      const delay = c!.cls === "timing" ? 20_000 : backoffMs(same);
      if (Date.now() + delay > j.deadline) break;
      j.res.sameRequestRetries++;
      const reason = `${failureSentence(rec)} ${blameSentence(c!, j.company)} The platform tried the same request again after ${Math.round(delay / 1000)} s.`;
      carry(i, attemptOf(rec, c!, triesAt(i), "same-request", reason));
      j.opts.onLine?.(`↻ step ${i + 1} (${rec.title.toLowerCase()}) — ${rec.message ?? `HTTP ${rec.status}`}; trying the same request again in ${Math.round(delay / 1000)} s`);
      await sleep(delay);
    }

    // ── a choice that does not fit: try the next option, going back if it was made earlier ──
    if (c?.choice && (c.cls === "data-choice" || c.cls === "timing")) {
      const choice = c.choice;
      const origin = backtrackOrigin(kinds, i, choice);
      const fromValue = choiceLabel(j, choice);
      if (origin !== undefined && !j.altsLoaded) await ensureAlternatives(j);
      const canMove = origin !== undefined && j.res.backtracks.length < BOUNDS.maxBacktracks && j.book.remaining(choice) > 0 && Date.now() < j.deadline;
      const blame = blameSentence(c, j.company, choice === "unit" ? unitBlame(j, j.unit) : undefined);
      if (canMove) {
        const opt = j.book.advance(choice)!;
        applyChoice(j, choice, opt);
        const inPlace = origin === i;
        const abandoned = !inPlace ? ev.eventGroupUuid : undefined;
        const how = inPlace
          ? `The platform tried this step again with ${CHOICE_WORD[choice]} “${opt.label}”.`
          : `The ${CHOICE_WORD[choice]} is set when step ${origin! + 1} (${STEP_META[kinds[origin!]].title.toLowerCase()}) runs, so the platform went back there and rebuilt the event with ${CHOICE_WORD[choice]} “${opt.label}”${abandoned ? `, leaving the first draft as a test record` : ""}.`;
        const reason = `${failureSentence(rec, choice, fromValue)} ${blame} ${how}`;
        carry(i, attemptOf(rec, c, triesAt(i), inPlace ? "next-alternative" : "rebuilt-event", reason, fromValue));
        j.res.backtracks.push({
          fromStep: i + 1,
          toStep: origin! + 1,
          choice,
          from: fromValue,
          to: opt.label,
          ...(abandoned ? { abandonedEvent: abandoned } : {}),
          why: rec.message ?? c.why,
        });
        j.opts.onLine?.(
          `↺ step ${i + 1} (${rec.title.toLowerCase()}) refused ${CHOICE_WORD[choice]} “${fromValue}”: “${rec.message ?? c.why}” — ${inPlace ? "trying again" : `going back to step ${origin! + 1}`} with “${opt.label}”`,
        );
        if (!inPlace) {
          // The steps being re-run keep the failures their earlier tries met:
          // a superseded record's attempts go back on the pile for its index.
          for (let k = origin!; k < i; k++) {
            rerun.add(k);
            const prior = out[k]?.attempts;
            if (prior?.length) carried.set(k, [...prior, ...(carried.get(k) ?? [])]);
          }
          ev = freshEvent(j, wo.mode);
          out.length = origin!;
          if (wo.mode === "journey") resetJourneyState(j, out, ev, choice === "vendor");
        }
        i = origin!;
        continue;
      }
      // Nothing left to move to — the refusal is the verdict, and the row says what was tried.
      const tried = j.book.has(choice) ? (carried.get(i) ?? []).filter((a) => a.choice === choice).length : 0;
      const none =
        choice === "limit"
          ? ` ${blame}`
          : j.res.backtracks.length >= BOUNDS.maxBacktracks
            ? ` The platform had already made ${BOUNDS.maxBacktracks} retries with other data in this journey, its limit, so it stopped here.`
            : ` There was no other ${CHOICE_WORD[choice]} to try${tried ? ` after ${tried + 1} tries` : ""}${choice === "vendor" ? " (only test vendors with an …@example.com login are ever invited instead — never a real company)" : ""}. ${blame}`;
      rec.actual += none;
    }

    const earlier = carried.get(i);
    const again = rerun.delete(i);
    if (earlier?.length) {
      rec.attempts = earlier;
      rec.attempt = earlier.length + 1;
      carried.delete(i);
      if (again) {
        rec.actual += ` (Run again for the rebuilt event; ${earlier.length === 1 ? "an earlier failed try of this step is" : `${earlier.length} earlier failed tries of this step are`} recorded as ${earlier.length === 1 ? "a finding" : "findings"}.)`;
      } else if (rec.verdict === "worked") {
        const last = earlier[earlier.length - 1];
        const changed = last.choice && last.next !== "same-request" && rec.choices?.[last.choice] ? ` with ${CHOICE_WORD[last.choice]} “${rec.choices[last.choice]}”` : "";
        rec.actual += ` (Worked on try ${rec.attempt}${changed}; ${earlier.length === 1 ? "the earlier try" : `the ${earlier.length} earlier tries`} failed and ${earlier.length === 1 ? "is" : "are"} recorded as ${earlier.length === 1 ? "a finding" : "findings"}.)`;
      }
    }
    else if (again) rec.actual += " (Run again for the rebuilt event.)";
    out[i] = rec;
    if (wo.mode === "journey" && rec.produced) Object.assign(j.made, rec.produced);
    wo.emit?.(rec);
    i++;
  }
  return ev;
}

/** Every failed try in these steps, as findings, with how it ended. */
function findingsOf(steps: JourneyStepRecord[], prefix: string, titlePrefix = ""): JourneyFinding[] {
  const out: JourneyFinding[] = [];
  for (const st of steps) {
    if (!st?.attempts?.length) continue;
    const resolved = st.verdict === "worked";
    st.attempts.forEach((a, k) => {
      const nextTry = st.attempts![k + 1];
      const nextValue = a.choice ? (nextTry ? nextTry.choices?.[a.choice] : st.choices?.[a.choice]) : undefined;
      const then =
        nextTry
          ? ` The next try${nextValue && a.next !== "same-request" ? ` (${CHOICE_WORD[a.choice!]} “${nextValue}”)` : ""} failed too${resolved ? `; the step worked on try ${st.attempt}` : ""}.`
          : resolved
            ? ` The next try${nextValue && a.next !== "same-request" ? `, with ${CHOICE_WORD[a.choice!]} “${nextValue}”,` : ""} worked, so the journey carried on — but this failure stands.`
            : ` Every try of this step failed; its own verdict is “${st.verdict}”.`;
      out.push({
        id: `${prefix}-${st.kind}-try${a.attempt}`,
        n: st.n,
        kind: st.kind,
        title: `${titlePrefix}${st.title}`,
        attempt: a.attempt,
        verdict: a.verdict,
        ...(a.status !== undefined ? { status: a.status } : {}),
        ...(a.errorCode ? { errorCode: a.errorCode } : {}),
        ...(a.message ? { message: a.message } : {}),
        failureClass: a.failureClass,
        ...(a.choice ? { choice: a.choice } : {}),
        ...(a.choiceValue ? { choiceValue: a.choiceValue } : {}),
        reason: `${a.reason}${then}`,
        resolved,
      });
    });
  }
  return out;
}

// ── the second copy of the event, for the variations ───────────────────────

const VARIATIONS_NOTE =
  "The variations below were tried on a second copy of the event so the journey's own event could run to its close undisturbed.";

/**
 * The library cases mutate the event they address — they activate it, add
 * vendors to it, close it — so they cannot run against the journey's own
 * event without changing what the journey was measuring. A second copy, built
 * by the same four steps with the collection's standard half-hour window, is
 * what they get. It is built from the choices the journey ended on (a unit
 * that was refused is not tried again) and walked the same resilient way.
 */
async function buildVariationsEvent(j: Journey): Promise<{ variationsEvent?: VariationsEvent; forCases?: JourneyRunResult["forCases"] }> {
  const ev0: EventBuild = { title: `QA_Platform_Variations_${Date.now()}`, timing: j.s.bodies.stageTiming(nowSec(), 1800), trades: [] };
  const kinds: StepKind[] = [
    "create_draft",
    ...j.plan.stages.map((sk): StepKind => (sk === "rfp" ? "add_stage_rfp" : "add_stage_pricing")),
    "publish",
    "read_back",
  ];
  j.opts.onLine?.("Building a second copy of the event for the variations to act on…");
  const steps: JourneyStepRecord[] = [];
  const ev = await walk(j, kinds, ev0, steps, { mode: "variations", emit: (rec) => j.opts.onLine?.(`  ${rec.n}. ${rec.title} — ${rec.actual}`) });
  if (!ev.eventGroupUuid || !ev.lineItemUuid) return {};
  const tradeId = tradeOf(ev, "pricing") ?? tradeOf(ev, "rfp");
  const variationsEvent: VariationsEvent = {
    title: ev.title,
    eventGroupUuid: ev.eventGroupUuid,
    tradeId,
    lineItemUuid: ev.lineItemUuid,
    status: ev.status ?? "draft",
    stageCount: ev.trades.length,
    note: VARIATIONS_NOTE,
    steps,
  };
  const built = ev.status === "active" && ev.trades.length === j.plan.stages.length;
  return {
    variationsEvent,
    forCases: built ? { eventGroupUuid: ev.eventGroupUuid, ...(tradeId ? { tradeId } : {}), lineItemUuid: ev.lineItemUuid } : undefined,
  };
}

// ── the journey ────────────────────────────────────────────────────────────

/**
 * Walks `plan.steps` in order against the client's account and returns the
 * record. Never throws and never hangs: whatever goes wrong becomes a step
 * verdict, every step is held to a watchdog and the whole run to a budget,
 * and a run that could not even start is one not-run step that says why.
 */
export async function runEventJourney(client: JourneyClient, plan: JourneyPlan, opts: JourneyRunOptions = {}): Promise<JourneyRunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const stageSeconds = opts.stageSeconds && opts.stageSeconds > 0 ? Math.floor(opts.stageSeconds) : 45;
  const title = `API_Journey_${TITLE_TAG[plan.eventType]}_${Date.now()}`;
  const planned = plan.steps.length;
  const budgetMs = opts.journeyBudgetMs && opts.journeyBudgetMs > 0 ? opts.journeyBudgetMs : BOUNDS.journeyMs;

  const record = (
    steps: JourneyStepRecord[],
    made: Record<string, string>,
    waitedMs: number,
    variationsEvent?: VariationsEvent,
    resilience?: JourneyResilience,
    finalTitle?: string,
  ): JourneyRecord => {
    const { outcome, stoppedAt } = journeyOutcome(steps, resilience);
    return {
      eventType: plan.eventType,
      label: plan.label,
      stages: plan.stages,
      title: finalTitle ?? title,
      stageSeconds,
      features: plan.features,
      steps,
      ...(stoppedAt !== undefined ? { stoppedAt } : {}),
      outcome,
      made,
      startedAt,
      durationMs: Date.now() - t0,
      waitedMs,
      ...(variationsEvent ? { variationsEvent } : {}),
      ...(resilience ? { resilience } : {}),
    };
  };

  const ctx = client?.ctx;
  const catalog = ctx?.catalog;
  const usable = !!(ctx?.buyerApi && catalog?.productUuid && catalog?.pricingTemplateUuid && catalog?.locationUuid && catalog?.productQualityUuid);
  if (!usable) {
    const reason =
      ctx?.companyId !== undefined && isTokenClient(ctx.companyId)
        ? "this account signs in with a fixed token and has no event catalog behind it — there is no product, template or vendor here to build an event from"
        : "this client's event catalog could not be read (no product, template or location), so there is nothing to build an event from";
    const step = notRunRecord(plan.steps[0] ?? "buyer_login", 1, reason);
    opts.onStep?.(step, planned);
    return { journey: record([step], {}, 0) };
  }

  let s: Sibling;
  try {
    s = await withWatchdog(loadSibling(), 90_000, "loading the API framework");
  } catch (e) {
    const step = notRunRecord(plan.steps[0] ?? "buyer_login", 1, `the API framework could not be loaded: ${clean(e instanceof Error ? e.message : String(e))}`);
    opts.onStep?.(step, planned);
    return { journey: record([step], {}, 0) };
  }

  const testData = s.CONFIG?.testData ?? {};
  const cat = catalog as Partial<EventCatalog>;
  const forced = forcedChoices(opts);
  const j: Journey = {
    s,
    client,
    plan,
    opts,
    baseURL: opts.baseURL ?? s.CONFIG.baseURL,
    companyId: ctx.companyId,
    company: client.companyName ?? ctx.companyName ?? "this company",
    catalog: {
      productUuid: cat.productUuid!,
      productQualityUuid: cat.productQualityUuid!,
      technicalTemplateUuid: cat.technicalTemplateUuid ?? "",
      pricingTemplateUuid: cat.pricingTemplateUuid!,
      locationUuid: cat.locationUuid!,
      vendorBidCompanyUuid: ctx.vendor?.uuid ?? cat.vendorBidCompanyUuid ?? "",
      useRfqQuotes: cat.useRfqQuotes ?? true,
    },
    vendorCompanyUuid: ctx.vendor?.uuid ?? cat.vendorBidCompanyUuid ?? "",
    vendorName: ctx.vendor?.name ?? "the vendor",
    vendorEmail: ctx.vendor?.email,
    qty: Number(testData.quantityValue) || 50,
    unit: testData.quantityUnit ?? "KG",
    price: Number(testData.bidPrice) || 100,
    stageSeconds,
    event: { title, timing: journeyTiming(nowSec(), stageSeconds), trades: [] },
    steps: [],
    made: {},
    actors: { buyer: false },
    evaluatorLookedUp: false,
    bidPlaced: false,
    techResponded: false,
    evalScored: false,
    closeTimes: [],
    waitedMs: 0,
    title,
    book: new ChoiceBook(),
    altsLoaded: false,
    altProblems: [],
    forced,
    deadline: t0 + budgetMs,
    res: { sameRequestRetries: 0, backtracks: [], watchdogTrips: 0, budgetExhausted: false, rebuilds: 0 },
  };
  // A forced first choice (tests only) replaces the catalog's before anything is built.
  if (forced.unit) j.unit = forced.unit;
  if (forced.product) j.catalog.productUuid = forced.product;
  if (forced.location) j.catalog.locationUuid = forced.location;
  if (forced.pricingTemplate) j.catalog.pricingTemplateUuid = forced.pricingTemplate;
  if (forced.technicalTemplate) j.catalog.technicalTemplateUuid = forced.technicalTemplate;
  // A caller's choice (template chooser, matrix) replaces the catalog's pick.
  const ch = opts.choose ?? {};
  if (ch.unit) j.unit = ch.unit;
  if (ch.productUuid) {
    j.catalog.productUuid = ch.productUuid;
    if (ch.productQualityUuid) j.catalog.productQualityUuid = ch.productQualityUuid;
  }
  if (ch.pricingTemplateUuid) j.catalog.pricingTemplateUuid = ch.pricingTemplateUuid;
  if (ch.technicalTemplateUuid) j.catalog.technicalTemplateUuid = ch.technicalTemplateUuid;
  if (ch.vendor?.uuid && ch.vendor.email) {
    j.vendorCompanyUuid = ch.vendor.uuid;
    j.catalog.vendorBidCompanyUuid = ch.vendor.uuid;
    j.vendorEmail = ch.vendor.email;
    j.vendorName = ch.vendor.name ?? ch.vendor.email;
  }
  const chosen = Object.entries(ch).filter(([, v]) => v !== undefined && v !== "");
  if (chosen.length) opts.onLine?.(`Chosen by the caller: ${chosen.map(([k, v]) => `${k} “${typeof v === "object" ? (v as any).name ?? (v as any).email : v}”`).join(", ")}.`);
  if (Object.keys(forced).length) opts.onLine?.(`Test mode: first choice forced — ${Object.entries(forced).map(([k, v]) => `${CHOICE_WORD[k as ChoiceKind] ?? k} “${v}”`).join(", ")}.`);

  try {
    const ev = await walk(j, plan.steps, j.event, j.steps, { mode: "journey", emit: (rec) => opts.onStep?.(rec, planned) });
    j.event = ev;
  } catch (e) {
    // walk and performStep never throw, so this is the runner itself failing;
    // say so on every step that was still to come rather than losing them.
    const why = `the runner hit an unexpected error: ${clean(e instanceof Error ? e.message : String(e))}`;
    for (let i = 0; i < plan.steps.length; i++) {
      if (j.steps[i]) continue;
      const rec = notRunRecord(plan.steps[i], i + 1, why);
      j.steps[i] = rec;
      opts.onStep?.(rec, planned);
    }
  }

  let variationsEvent: VariationsEvent | undefined;
  let forCases: JourneyRunResult["forCases"];
  if (opts.buildVariationsEvent) {
    try {
      // Bounded like a step: build steps + their retries, never past the budget by more than this.
      ({ variationsEvent, forCases } = await withWatchdog(buildVariationsEvent(j), 10 * 60_000, "building the second copy of the event"));
    } catch (e) {
      opts.onLine?.(`the second copy of the event could not be built: ${clean(e instanceof Error ? e.message : String(e))}`);
    }
  }

  // The vendor's and evaluator's clients are this run's own; the buyer's
  // belongs to the server and outlives the journey.
  await withWatchdog(Promise.resolve(j.actors.vendorApi?.dispose?.()), 10_000, "closing the vendor session").catch(() => {});
  await withWatchdog(Promise.resolve(j.actors.evaluatorApi?.dispose?.()), 10_000, "closing the evaluator session").catch(() => {});

  const findings = [...findingsOf(j.steps, "JRN"), ...findingsOf(variationsEvent?.steps ?? [], "JRN-VAR", "Second copy — ")];
  const retried = j.res.sameRequestRetries + j.res.backtracks.length > 0;
  const resilience: JourneyResilience = {
    sameRequestRetries: j.res.sameRequestRetries,
    backtracks: j.res.backtracks,
    findings,
    completedAfterRetries: retried && !j.steps.some((st) => st.verdict === "refused" || st.verdict === "broken"),
    bounds: {
      stepMs: opts.stepBoundMs ?? BOUNDS.stepMs,
      loginStepMs: BOUNDS.loginStepMs,
      waitCapMs: BOUNDS.waitCapMs,
      journeyMs: budgetMs,
      maxAlternativesPerChoice: BOUNDS.maxAlternativesPerChoice,
      maxBacktracks: BOUNDS.maxBacktracks,
      maxSameRequestRetries: BOUNDS.maxSameRequestRetries,
    },
    watchdogTrips: j.res.watchdogTrips,
    ...(j.res.budgetExhausted ? { budgetExhausted: true } : {}),
    ...(j.altsLoaded ? { alternatives: j.book.summary() } : {}),
    ...(j.altProblems.length ? { alternativeProblems: j.altProblems } : {}),
    ...(Object.keys(forced).length ? { forced } : {}),
  };
  return { journey: record(j.steps, j.made, j.waitedMs, variationsEvent, resilience, j.event.title), ...(forCases ? { forCases } : {}) };
}

// ── the legacy shapes, for readers that predate the journey ────────────────

export interface LegacySetupStep {
  n: number;
  did: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  ok: boolean;
}

export interface LegacySetupSummary {
  title: string;
  status: string;
  eventGroupUuid: string;
  tradeId?: string;
  stageCount: number;
}

const BUILD_KINDS: StepKind[] = ["create_draft", "add_stage_rfp", "add_stage_pricing", "publish", "read_back"];

/**
 * `RunRecord.setupSteps` as the old fixture wrote it: the calls that built the
 * event the cases acted on. Taken from the second copy's build when there is
 * one, else from the journey's own build steps. Steps that made no request
 * (not run) have no row, as before.
 */
export function journeyToSetupSteps(journey: JourneyRecord): LegacySetupStep[] {
  const source = journey.variationsEvent?.steps ?? journey.steps.filter((st) => BUILD_KINDS.includes(st.kind));
  return source
    .filter((st) => st.call)
    .map((st, i) => ({
      n: i + 1,
      did: st.actual,
      method: st.call!.method,
      path: st.call!.path.split("?")[0],
      status: st.status ?? 0,
      ms: st.ms ?? 0,
      ok: st.verdict === "worked",
    }));
}

/** `RunRecord.setupSummary` as the old fixture wrote it; undefined when no event was created. */
export function journeyToSetupSummary(journey: JourneyRecord): LegacySetupSummary | undefined {
  const v = journey.variationsEvent;
  if (v) return { title: v.title, status: v.status, eventGroupUuid: v.eventGroupUuid, ...(v.tradeId ? { tradeId: v.tradeId } : {}), stageCount: v.stageCount };
  const eventGroupUuid = journey.made.eventGroupUuid;
  if (!eventGroupUuid) return undefined;
  const tradeId = journey.made.pricingTradeUuid ?? journey.made.technicalTradeUuid;
  return {
    title: journey.title,
    status: journey.made.status ?? "draft",
    eventGroupUuid,
    ...(tradeId ? { tradeId } : {}),
    stageCount: [journey.made.technicalTradeUuid, journey.made.pricingTradeUuid].filter(Boolean).length,
  };
}
