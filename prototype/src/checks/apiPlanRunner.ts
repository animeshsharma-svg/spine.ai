/**
 * THE API PLAN RUNNER — runs a compiled plan (agents/apiPlanner.ts) for real.
 *
 *   setup    the recipe is built FRESH for this plan: the event journey
 *            (eventJourney.runEventJourney) walked with the recipe's own step
 *            list, the QA vendor as the invited vendor, then — when the
 *            recipe says so — QA vendor 2 invited and bidding, and a wait for
 *            the round's close. No plan acts on another plan's record, so one
 *            plan's leftovers can never fail the next (no shared-state false
 *            positives). Only a plan that sends nothing but reads may reuse a
 *            recipe instance another read-only plan built.
 *   act      each step: the working template body, the case's change, tokens
 *            filled from the setup and earlier steps, sent as the right actor.
 *   verify   read-backs, judged by the assertion ops.
 *
 * Verdicts are deterministic: a step's outcome is the engine's classify()
 * (5xx always a defect; 401 and "the record was not usable" never a pass; a
 * refusal for a different reason than expected is "couldn't tell"); a
 * read-back is judged by its assertion ops. An arrange step that does not do
 * what it should makes the plan "couldn't tell" — the precondition did not
 * hold — never "failed". A failure is checked on a SECOND fresh record before
 * it is reported as failed; one that does not reproduce is "couldn't tell".
 *
 * Every wait is bounded (a request 60 s, a clock wait 6 min, the setup 12 min,
 * the whole plan 25 min). Only QA test vendors (spine.ai's qa_vendors) are
 * invited or signed in as. Results are saved as a normal run (runStore.saveRun)
 * so reports and history pick them up.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST, openClientContext } from "../executor.js";
import { classify, redactSecrets, type CheckOutcome } from "./engine.js";
import { appOf, appRefusal } from "./appAccess.js";
import { EVENT_TYPES, type JourneyPlan, type JourneyRecord, type StepKind } from "./journeyModel.js";
import { runEventJourney, journeyToSetupSteps, journeyToSetupSummary } from "./eventJourney.js";
import { listQaVendors, qaVendorsFor, vendorClient, type QaVendor } from "./matrixVendors.js";
import { FORMATS } from "./apiAssertions.js";
import { backoffMs, withWatchdog } from "./resilience.js";
import { newRunId, saveRun } from "../runStore.js";
import { providerLabel } from "../ai/llm.js";
import type { CheckResult } from "../ai/types.js";
import {
  OPS,
  RECIPES,
  actInWords,
  loadBodies,
  planInWords,
  templateBody,
  verifyInWords,
  type ActStep,
  type ActorId,
  type ApiPlan,
  type Assertion,
  type BodyArgs,
  type Change,
  type Outcome,
  type Recipe,
  type RecipeId,
  type VerifyStep,
} from "../agents/apiPlanner.js";

// ── results ─────────────────────────────────────────────────────────────────

export type PlanVerdict = "passed" | "failed" | "couldn't tell" | "not run";
type StepVerdict = PlanVerdict | "done";

export interface PlanStepResult {
  n: number;
  phase: "setup" | "act" | "verify";
  /** plain English */
  title: string;
  actor: string;
  expected: string;
  actual: string;
  verdict: StepVerdict;
  call?: { method: string; path: string; body?: unknown };
  alsoCalled?: Array<{ method: string; path: string; status: number; code?: string }>;
  status?: number;
  code?: string;
  message?: string;
  ms: number;
  /** the engine's own verdict sentence */
  engine?: string;
  assertions?: Array<{ say: string; pass: boolean | null; actual: string }>;
  decisive?: boolean;
}

export interface SetupResult {
  recipe: RecipeId;
  ok: boolean;
  /** why it could not be built */
  reason?: string;
  title?: string;
  eventGroupUuid?: string;
  journeyOutcome?: string;
  /** reused from another read-only plan */
  reused?: boolean;
  steps: Array<{ title: string; verdict: string; actual: string }>;
  ms: number;
}

export interface PlanAttempt {
  verdict: PlanVerdict;
  reason: string;
  setup: SetupResult;
  steps: PlanStepResult[];
  journey?: JourneyRecord;
  ms: number;
}

export interface PlanRunResult extends PlanAttempt {
  caseId: string;
  title: string;
  plan: ApiPlan;
  companyId: number;
  /** the same plan on a second fresh record, when the first attempt failed */
  confirmation?: { verdict: PlanVerdict; reason: string; setup: SetupResult; steps: PlanStepResult[] };
  /** true = failed on two fresh records */
  confirmed?: boolean;
  runId?: string;
}

export interface PlanRunOptions {
  companyId: number;
  baseURL?: string;
  /** an open client to reuse (the caller disposes it) */
  client?: any;
  onLine?: (line: string) => void;
  onStep?: (step: PlanStepResult) => void;
  /** re-run a failure on a second fresh record (default true) */
  confirm?: boolean;
  /** save the run to history (default true) */
  save?: boolean;
  /** shared between plans of one batch: recipe instances read-only plans may reuse */
  setupCache?: Map<string, SetupInstance>;
}

// ── the sibling framework ──────────────────────────────────────────────────

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
let endpointsP: Promise<any> | undefined;
let configP: Promise<any> | undefined;
const Endpoints = () => (endpointsP ??= imp("api/endpoints.ts").then((m) => m.Endpoints));
const Config = () => (configP ??= imp("config.ts").then((m) => m.CONFIG).catch(() => ({})));

const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hhmmss = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export interface Reply {
  status: number;
  ok: boolean;
  data: any;
  code?: string;
  message?: string;
  ms: number;
  /** Set when the request was deliberately not sent (and why). */
  notSent?: string;
}

const ENV_STATUS = new Set([0, 408, 429, 502, 503, 504]);

// ── evaluation only: planted bugs (src/eval/mutate.ts) ────────────────────
// OFF unless the eval harness sets a mutator. It sees each reply of the act and verify
// phases (never setup, so a planted bug cannot break the record the case is built on) and may
// return a changed reply — the agent then judges that as if UAT had answered it.
export interface EvalCall { phase: "act" | "verify"; method: string; path: string; n: number; /** made by the plan's decisive act step */ decisive: boolean }
type ResponseMutator = (call: EvalCall, reply: Reply) => Reply;
let responseMutator: ResponseMutator | null = null;
let evalPhase: "setup" | "act" | "verify" = "setup";
let evalCallN = 0;
let evalDecisive = false;
export function setResponseMutator(fn: ResponseMutator | null): void {
  responseMutator = fn;
}
function mutated(method: string, path: string, r: Reply): Reply {
  if (!responseMutator || evalPhase === "setup") return r;
  return responseMutator({ phase: evalPhase, method: method.toUpperCase(), path, n: evalCallN++, decisive: evalPhase === "act" && evalDecisive }, r);
}

/** One request, never throws, 60 s bound; an environment failure is tried again twice. */
async function send(api: any, method: string, path: string, body?: unknown): Promise<Reply> {
  // Never ask the wrong app: a buyer token on a vendor-only API is answered 401
  // and the backend signs that buyer out of the web console (see appAccess.ts).
  const why = appRefusal(appOf(api), method, path);
  if (why) return { status: 0, ok: false, data: null, message: `not sent: ${why}`, ms: 0, notSent: why };
  const t = Date.now();
  let tries = 0;
  for (;;) {
    tries++;
    let r: Reply;
    try {
      const x: any = await Promise.race([
        api.attempt(method, path, body === undefined ? {} : { body }),
        sleep(60_000).then(() => ({ status: 0, ok: false, data: null, errorMessage: "no reply within 60 s" })),
      ]);
      r = { status: typeof x?.status === "number" ? x.status : 0, ok: !!x?.ok, data: x?.data, code: x?.errorCode !== undefined && x?.errorCode !== null ? String(x.errorCode) : undefined, message: redactSecrets(x?.errorMessage) ?? undefined, ms: 0 };
    } catch (e) {
      r = { status: 0, ok: false, data: null, message: redactSecrets(e instanceof Error ? e.message : String(e)) ?? "request failed", ms: 0 };
    }
    if (!ENV_STATUS.has(r.status) || tries > 2) return mutated(method, path, { ...r, ms: Date.now() - t });
    await sleep(backoffMs(tries));
  }
}

const SECRET_KEY = /otp|token|password|secret|authorization|cookie/i;
function redact(body: unknown): unknown {
  if (body === undefined || body === null) return body;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length > 12 ? [...v.slice(0, 12).map(walk), `… ${v.length - 12} more`] : v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) && val ? "<redacted>" : walk(val);
      return out;
    }
    return typeof v === "string" ? redactSecrets(v) ?? v : v;
  };
  try {
    return walk(JSON.parse(JSON.stringify(body)));
  } catch {
    return undefined;
  }
}

function said(r: Reply): string {
  if (r.notSent) return `not sent — ${r.notSent}`;
  if (r.status === 0) return `no reply came back (${r.message ?? "network"})`;
  if (r.ok) return `the app accepted it (HTTP ${r.status})`;
  return `the app refused it: “${r.message ?? "no message"}” (HTTP ${r.status}${r.code ? `, code ${r.code}` : ""})`;
}

// ── a built setup ──────────────────────────────────────────────────────────

export interface SetupInstance {
  result: SetupResult;
  vals: Record<string, string | number>;
  journey?: JourneyRecord;
  unit: string;
  qty: number;
  at: number;
}

interface RunCtx {
  companyId: number;
  baseURL?: string;
  client: any;
  vendors: QaVendor[];
  apis: Map<ActorId, any>;
  onLine: (l: string) => void;
  reopened: number;
}

async function actorApi(rc: RunCtx, who: ActorId): Promise<{ api?: any; error?: string }> {
  if (who === "buyer") return { api: rc.client.ctx.buyerApi };
  if (rc.apis.has(who)) return { api: rc.apis.get(who) };
  const v = rc.vendors[who === "vendor" ? 0 : 1];
  if (!v) return { error: `no QA test vendor ${who === "vendor" ? "1" : "2"} is recorded for this client (spine.ai qa_vendors)` };
  const r = await withWatchdog(vendorClient(rc.companyId, v.email, rc.baseURL), 120_000, "signing the QA vendor in").catch((e) => ({ error: (e as Error).message }) as { api?: any; error?: string });
  if (r.api) rc.apis.set(who, r.api);
  return r.api ? { api: r.api } : { error: r.error ?? "sign-in failed" };
}

/** The round's clock as the app now has it. */
async function clock(api: any, trade: string): Promise<{ bst: number; bet: number; ect: number } | undefined> {
  const E = await Endpoints();
  const r = await send(api, "GET", E.tradeDetails(trade));
  const d = r.data ?? {};
  const pick = (...ks: string[]) => {
    for (const k of ks) {
      const v = d[k] ?? d.trade_config?.[k];
      if (v !== undefined && v !== null && v !== "") return typeof v === "number" ? (v > 1e12 ? Math.floor(v / 1000) : v) : Math.floor(new Date(v).getTime() / 1000);
    }
    return undefined;
  };
  const bet = pick("ending_at", "bid_end_time", "end_time");
  if (!bet) return undefined;
  return { bst: pick("starting_from", "bid_start_time") ?? 0, bet, ect: pick("extra_closing_time") ?? bet };
}

/** Wait until an epoch second, bounded. Returns false when the cap cut it short. */
async function waitUntil(sec: number, capMs: number, why: string, onLine: (l: string) => void): Promise<{ waitedMs: number; reached: boolean }> {
  const due = sec * 1000 - Date.now();
  if (due <= 0) return { waitedMs: 0, reached: true };
  const total = Math.min(due, capMs);
  onLine(`  … waiting ${Math.round(total / 1000)} s until ${hhmmss(sec)} — ${why}`);
  const t0 = Date.now();
  while (Date.now() - t0 < total) await sleep(Math.min(10_000, total - (Date.now() - t0)));
  return { waitedMs: Date.now() - t0, reached: due <= capMs };
}

/** The pricing round's line, as one reader sees it (bid pricing and surrogate bids need it). */
/**
 * The technical round's questionnaire, as the console reads it before a surrogate technical response:
 * GET /v1/trade/:id/schema?response_type=template → sheets.forms[] — each form's page_uuids and its vendor
 * questions (page_response_headers; "read" ones, like the evaluator's score, are not the vendor's to answer).
 */
async function techPages(api: any, trade: string): Promise<BodyArgs["techPages"] | undefined> {
  const r = await send(api, "GET", `/v1/trade/${trade}/schema?response_type=template&additional_fields=order_details`);
  const forms: any[] = r.data?.sheets?.forms ?? [];
  if (!r.ok || !forms.length) return undefined;
  const pages: NonNullable<BodyArgs["techPages"]> = [];
  for (const f of forms) {
    const questions = (f.page_response_headers ?? [])
      .filter((h: any) => h?.key_attribute && h?.configuration?.mode_type !== "read")
      .map((h: any) => ({ key: String(h.key_attribute), required: h?.configuration?.is_required === true || h?.is_required === true }));
    for (const page of f.page_uuids ?? []) pages.push({ page: String(page), questions });
  }
  return pages.length ? pages : undefined;
}

async function tradeProduct(api: any, trade: string): Promise<BodyArgs["tradeProduct"] | undefined> {
  const E = await Endpoints();
  const r = await send(api, "GET", E.tradeDetails(trade));
  const p = r.data?.order_details?.[0]?.product;
  if (!r.ok || !p?.trade_product_uuid) return undefined;
  return { trade_product_uuid: p.trade_product_uuid, trade_product_id: p.trade_product_id, trade_product_category_uuid: p.trade_product_category_uuid, product_id: p.id, product_code: p.product_code };
}

function bodyArgs(rc: RunCtx, inst: SetupInstance, vendorUuid: string): BodyArgs {
  const cat = rc.client.ctx.catalog ?? {};
  const v = inst.vals;
  const s = (k: string) => (v[k] !== undefined ? String(v[k]) : "");
  const rounds = [s("technicalTradeUuid"), s("pricingTradeUuid")].filter(Boolean);
  return {
    eventGroupUuid: s("eventGroupUuid"),
    lineItemUuid: s("lineItemUuid"),
    pricingTradeUuid: s("pricingTradeUuid") || s("tradeId"),
    technicalTradeUuid: s("technicalTradeUuid") || undefined,
    vendorCompanyUuid: vendorUuid,
    vendor2CompanyUuid: s("vendor2Uuid") || undefined,
    productUuid: s("productUuid") || cat.productUuid,
    productQualityUuid: s("productQualityUuid") || cat.productQualityUuid,
    locationUuid: s("locationUuid") || cat.locationUuid,
    pricingTemplateUuid: cat.pricingTemplateUuid ?? "",
    technicalTemplateUuid: cat.technicalTemplateUuid ?? "",
    evaluatorUuid: rc.client.ctx.evaluatorUuid ?? "",
    unit: inst.unit,
    qty: inst.qty,
    price: 100,
    stamp: s("stamp") || String(Date.now()),
    proposalUuid: s("proposalUuid") || undefined,
    roundUuids: rounds.length ? rounds : undefined,
    nowSec: nowSec(),
  };
}

/** A vendor places a complete bid: open → price → submit; stops at the first refusal. */
async function placeBid(rc: RunCtx, inst: SetupInstance, who: "vendor" | "vendor2", price: number, change?: Change[]): Promise<{ decider: Reply; call: PlanStepResult["call"]; also: NonNullable<PlanStepResult["alsoCalled"]>; bidUuid?: string; error?: string }> {
  const { api, error } = await actorApi(rc, who);
  if (!api) return { decider: { status: 0, ok: false, data: null, message: error, ms: 0 }, call: undefined, also: [], error };
  const B = await loadBodies();
  const E = await Endpoints();
  const vu = String(inst.vals[who === "vendor" ? "vendorUuid" : "vendor2Uuid"] ?? "");
  const a = { ...bodyArgs(rc, inst, vu), price };
  const also: NonNullable<PlanStepResult["alsoCalled"]> = [];
  const openBody = applyChanges(templateBody(B, "open_bid", a), change);
  const open = await send(api, "POST", E.createBid(), openBody);
  if (!open.ok) return { decider: open, call: { method: "POST", path: E.createBid(), body: redact(openBody) }, also };
  const bidUuid = String(open.data?.bid_uuid ?? open.data?.uuid ?? "");
  also.push({ method: "POST", path: E.createBid(), status: open.status });
  const tp = await tradeProduct(api, a.pricingTradeUuid);
  if (!tp) return { decider: { status: 0, ok: false, data: null, message: "the round's line could not be read by the vendor", ms: 0 }, call: undefined, also, bidUuid, error: "the round's line could not be read by the vendor" };
  const priced = B.buildBidProductsBody({ ...a, quantityValue: a.qty, quantityUnit: a.unit, tradeProduct: tp });
  const prod = await send(api, "POST", E.createBidProducts(bidUuid), priced.body);
  if (!prod.ok) return { decider: prod, call: { method: "POST", path: E.createBidProducts(bidUuid), body: redact(priced.body) }, also, bidUuid };
  also.push({ method: "POST", path: E.createBidProducts(bidUuid), status: prod.status });
  const subBody = B.buildSubmitBidBody({ pricingTradeUuid: a.pricingTradeUuid, vendorCompanyUuid: vu, total: priced.total });
  const sub = await send(api, "PATCH", E.submitBid(bidUuid), subBody);
  return { decider: sub, call: { method: "PATCH", path: E.submitBid(bidUuid), body: redact(subBody) }, also, bidUuid };
}

const SETUP_BUDGET_MS = 12 * 60_000;
const WAIT_CAP_MS = 6 * 60_000;

type PrPick = { prUuid: string; prNo?: string; lines: Array<{ uuid: string; productUuid: string; qualityUuid: string; unit: string; qty: number; hubUuid?: string; name?: string; productCode?: string; itemNo?: string }> };

/**
 * An open purchase request with `items` material lines that can still go on an event (active, open
 * quantity left, not dormant), and those lines with what the draft needs: the product's quality
 * (its first variant), the PR's unit and open quantity, the delivery place. Material lines only: a
 * service line becomes several items on the event, so a count asked for would not hold.
 */
async function pickPrLines(buyer: any, items: number): Promise<PrPick | { why: string }> {
  const q = encodeURIComponent(JSON.stringify({ status: ["active"] }));
  let prs: any[] = [];
  try {
    const r: any = await buyer.get(`/purchase_requests?page=1&page_size=50&filters=${q}&tab=active`);
    prs = r?.purchase_requests ?? r?.data ?? [];
  } catch (e) {
    return { why: `the open purchase requests could not be read: ${(e as Error).message.slice(0, 160)}` };
  }
  const usable = (l: any) => l?.uuid && l?.product_uuid && l.status === "active" && l.line_item_type === "material" && Number(l.quantity_open) > 0 && !l.dormant_locked && l?.data?.uom;
  const fits = prs.map((p) => ({ p, ls: (p?.line_items ?? []).filter(usable) })).filter((x) => x.p?.uuid && x.ls.length >= items);
  // Exactly that many lines first: "a PR with 2 line items" is one, not a PR of 5 with 2 taken.
  const pick = fits.find((x) => x.ls.length === items) ?? fits[0];
  if (!pick) return { why: `no open purchase request on the first page has ${items} material line${items === 1 ? "" : "s"} with quantity left to put on an event` };
  const lines: PrPick["lines"] = [];
  for (const l of pick.ls.slice(0, items)) {
    let prod: any = null;
    try {
      prod = await buyer.get(`/products/${encodeURIComponent(l.product_uuid)}`);
    } catch {
      prod = null;
    }
    const p = prod?.product ?? prod;
    const quality = p?.variants?.[0]?.uuid;
    if (!quality) return { why: `the product of PR ${pick.p?.data?.prNo ?? pick.p.uuid}'s line ${l.uuid} has no variant to put on an event` };
    lines.push({ uuid: String(l.uuid), productUuid: String(l.product_uuid), qualityUuid: String(quality), unit: String(l.data.uom), qty: Number(l.quantity_open), ...(l.buyer_hub_uuid ? { hubUuid: String(l.buyer_hub_uuid) } : {}), name: String(p?.name ?? l?.data?.shortText ?? l.product_uuid), ...(l.product_code ? { productCode: String(l.product_code) } : {}), ...(l?.data?.prLno ? { itemNo: String(l.data.prLno) } : {}) });
  }
  return { prUuid: String(pick.p.uuid), prNo: pick.p?.data?.prNo ? String(pick.p.data.prNo) : undefined, lines };
}

/** Build the recipe on a fresh record. Never throws. */
async function buildSetup(rc: RunCtx, recipe: Recipe, lineItems?: number, fromPr?: { items?: number }): Promise<SetupInstance> {
  const t0 = Date.now();
  const cat = rc.client.ctx.catalog ?? {};
  const cfg = await Config();
  let unit0 = String(cfg?.testData?.quantityUnit ?? "KG");
  let qty0 = Number(cfg?.testData?.quantityValue) || 50;
  const vals: Record<string, string | number> = {
    stamp: String(Date.now()),
    ...(cat.productUuid ? { productUuid: cat.productUuid } : {}),
    ...(cat.productQualityUuid ? { productQualityUuid: cat.productQualityUuid } : {}),
    ...(cat.locationUuid ? { locationUuid: cat.locationUuid } : {}),
    ...(rc.vendors[0]?.vendorCompanyUuid ? { vendorUuid: rc.vendors[0].vendorCompanyUuid } : {}),
    ...(rc.vendors[1]?.vendorCompanyUuid ? { vendor2Uuid: rc.vendors[1].vendorCompanyUuid } : {}),
  };
  const fail = (reason: string, journey?: JourneyRecord, steps: SetupResult["steps"] = []): SetupInstance => ({
    result: { recipe: recipe.id, ok: false, reason, steps, ms: Date.now() - t0, ...(journey ? { title: journey.title, journeyOutcome: journey.outcome, eventGroupUuid: journey.made?.eventGroupUuid } : {}) },
    vals,
    journey,
    unit: unit0,
    qty: qty0,
    at: Date.now(),
  });
  // Every round's audience is QA vendor 1 — even a draft round carries an
  // audience — so no event is built without one (never the client's real supplier).
  if (recipe.eventType !== null && !rc.vendors[0]) return fail("no QA test vendor is recorded for this client, and a plan never invites a real supplier");
  if (recipe.vendors > 1 && !rc.vendors[1]) return fail("the recipe needs two QA test vendors and only one is recorded for this client");
  if (recipe.eventType === null) {
    return { result: { recipe: recipe.id, ok: true, steps: [], ms: 0 }, vals, unit: unit0, qty: qty0, at: Date.now() };
  }

  // From a purchase request: its lines are the draft's, and every later body uses the first one.
  let pr: PrPick | undefined;
  if (fromPr) {
    const got = await pickPrLines(rc.client.ctx.buyerApi, Math.max(1, Math.floor(fromPr.items ?? 1)));
    if ("why" in got) return fail(got.why);
    pr = got;
    const l0 = pr.lines[0];
    vals.productUuid = l0.productUuid;
    vals.productQualityUuid = l0.qualityUuid;
    if (l0.hubUuid) vals.locationUuid = l0.hubUuid;
    vals.prUuid = pr.prUuid;
    if (pr.prNo) vals.prNo = pr.prNo;
    unit0 = l0.unit;
    qty0 = l0.qty;
    rc.onLine(`Setup: purchase request ${pr.prNo ?? pr.prUuid} — ${pr.lines.map((l) => `${l.name} (${l.qty} ${l.unit} open)`).join("; ")}`);
  }

  const et = EVENT_TYPES[recipe.eventType];
  const plan: JourneyPlan = {
    wanted: true,
    eventType: recipe.eventType,
    label: et.label,
    stages: et.stages,
    features: { surrogate: false, counterOffer: false, convertToAuction: false, version: false },
    steps: recipe.steps,
  };
  const short = recipe.bids > 1 ? 150 : recipe.id === "closed_rfp_rfq_with_tech_response" ? 120 : 100;
  const stageSeconds = recipe.clock === "short" ? short : 1200;
  const v1 = rc.vendors[0];
  rc.onLine(`Setup: ${recipe.title}`);
  let walked: Awaited<ReturnType<typeof runEventJourney>>;
  try {
    walked = await withWatchdog(
      runEventJourney(rc.client, plan, {
        baseURL: rc.baseURL,
        stageSeconds,
        journeyBudgetMs: SETUP_BUDGET_MS,
        ...(pr ? { fromPr: pr } : lineItems && lineItems > 1 ? { lineItemCount: lineItems } : {}),
        ...(v1 ? { choose: { vendor: { uuid: v1.vendorCompanyUuid, email: v1.email, name: `QA vendor ${v1.n}` } } } : {}),
        onStep: (st) => rc.onLine(`  setup · ${st.title}: ${st.verdict} — ${st.actual}`),
        onLine: (l) => rc.onLine(`  setup · ${l}`),
      }),
      SETUP_BUDGET_MS + 60_000,
      "building the plan's setup",
    );
  } catch (e) {
    return fail(`the setup journey did not finish: ${(e as Error).message}`);
  }
  const j = walked.journey;
  const steps = j.steps.map((s) => ({ title: s.title, verdict: s.verdict, actual: s.actual }));
  const bad = j.steps.find((s) => s.verdict !== "worked");
  if (bad) return fail(`the setup step “${bad.title}” ${bad.verdict === "not-run" ? "did not run" : bad.verdict === "broken" ? "broke" : "was refused"}: ${bad.actual}`, j, steps);
  const m = j.made ?? {};
  for (const k of ["eventGroupUuid", "lineItemUuid", "pricingTradeUuid", "technicalTradeUuid", "bidUuid", "templateResponseUuid", "proposalUuid", "tradeProductUuid", "techFormUuid", "techPageUuid", "evalFormUuid"])
    if (m[k]) vals[k] = m[k];
  if (m.pricingTradeUuid || m.technicalTradeUuid) vals.tradeId = m.pricingTradeUuid ?? m.technicalTradeUuid;
  if (m.technicalTradeUuid) vals.rfpTradeId = m.technicalTradeUuid;
  const unitChoice = j.steps.find((s) => s.kind === "create_draft")?.choices?.unit;
  const inst: SetupInstance = { result: { recipe: recipe.id, ok: true, steps, ms: 0, title: j.title, eventGroupUuid: m.eventGroupUuid, journeyOutcome: j.outcome }, vals, journey: j, unit: unitChoice ?? unit0, qty: qty0, at: Date.now() };
  const buyer = rc.client.ctx.buyerApi;

  // the second QA vendor: invited to the live round, and bidding when the recipe says so
  if (recipe.vendors > 1 && vals.tradeId) {
    const add = await send(buyer, "PATCH", `/v1/trade/add_audience?id=${vals.tradeId}`, { audience_to_add_uuids: [vals.vendor2Uuid], update_remarks: `QA_Platform_add_${vals.stamp}` });
    steps.push({ title: "Invite QA vendor 2 to the live round", verdict: add.ok ? "worked" : "refused", actual: said(add) });
    rc.onLine(`  setup · invite QA vendor 2: ${said(add)}`);
    if (!add.ok) return { ...inst, result: { ...inst.result, ok: false, reason: `QA vendor 2 could not be invited: ${said(add)}`, ms: Date.now() - t0 } };
    if (recipe.bids > 1) {
      const b = await placeBid(rc, inst, "vendor2", 110);
      steps.push({ title: "QA vendor 2 places a bid", verdict: b.decider.ok ? "worked" : "refused", actual: said(b.decider) });
      rc.onLine(`  setup · QA vendor 2 bids: ${said(b.decider)}`);
      if (!b.decider.ok) return { ...inst, result: { ...inst.result, ok: false, reason: `QA vendor 2's bid did not go through: ${b.error ?? said(b.decider)}`, ms: Date.now() - t0 } };
      if (b.bidUuid) vals.bid2Uuid = b.bidUuid;
    }
  }
  // the close
  if (recipe.closed && !recipe.steps.includes("wait_close") && vals.tradeId) {
    const trades = [vals.technicalTradeUuid, vals.pricingTradeUuid].filter(Boolean).map(String);
    let latest = 0;
    for (const t of trades) latest = Math.max(latest, (await clock(buyer, t))?.ect ?? 0);
    if (!latest) return { ...inst, result: { ...inst.result, ok: false, reason: "the round's closing time could not be read back", ms: Date.now() - t0 } };
    const w = await waitUntil(latest + 8, WAIT_CAP_MS, "the round's bidding window and extra closing time end", rc.onLine);
    steps.push({ title: "Wait for the bidding window to close", verdict: w.reached ? "worked" : "not-run", actual: w.reached ? `Waited ${Math.round(w.waitedMs / 1000)} s; the round closed at ${hhmmss(latest)}.` : `Waited the 6-minute cap; the round only closes at ${hhmmss(latest)}.` });
    if (!w.reached) return { ...inst, result: { ...inst.result, ok: false, reason: "the round had not closed within the 6-minute wait cap", ms: Date.now() - t0 } };
  }
  inst.result = { ...inst.result, steps, ms: Date.now() - t0 };
  return inst;
}

// ── tokens and changes ─────────────────────────────────────────────────────

const MISSING = Symbol("missing");

function tokensPathGet(root: unknown, path: string): unknown {
  let node: any = root;
  for (const t of path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (node === null || typeof node !== "object") return MISSING;
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(t)) return MISSING;
      node = node[Number(t)];
    } else {
      if (!(t in node)) return MISSING;
      node = node[t];
    }
  }
  return node === undefined ? MISSING : node;
}

interface TokenCtx {
  vals: Record<string, string | number>;
  acts: Array<{ body?: unknown; data?: unknown }>;
  roundEnd?: number;
  roundClose?: number;
  rfpEnd?: number;
}

/** Fill {{tokens}}; a string that is ONE time/number token becomes a number. Unresolved names are collected. */
function fill(v: unknown, tc: TokenCtx, missing: string[]): unknown {
  const one = (name: string): unknown => {
    const tm = name.match(/^(now|roundEnd|roundClose|rfpEnd)([+-]\d{1,7})?$/);
    if (tm) {
      const base = tm[1] === "now" ? nowSec() : tm[1] === "roundEnd" ? tc.roundEnd : tm[1] === "rfpEnd" ? tc.rfpEnd : tc.roundClose;
      if (base === undefined) return MISSING;
      return base + Number(tm[2] ?? 0);
    }
    const am = name.match(/^act(\d)\.(body|data)\.(.+)$/);
    if (am) {
      const a = tc.acts[Number(am[1]) - 1];
      return a ? tokensPathGet(am[2] === "body" ? a.body : a.data, am[3]) : MISSING;
    }
    return tc.vals[name] !== undefined && tc.vals[name] !== "" ? tc.vals[name] : MISSING;
  };
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") {
      const whole = x.match(/^\{\{([^}]+)\}\}$/);
      if (whole) {
        const r = one(whole[1]);
        if (r === MISSING) {
          missing.push(whole[1]);
          return x;
        }
        return r;
      }
      return x.replace(/\{\{([^}]+)\}\}/g, (m, name) => {
        const r = one(name);
        if (r === MISSING) {
          missing.push(name);
          return m;
        }
        return typeof r === "object" ? JSON.stringify(r) : String(r);
      });
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x)) o[String(walk(k))] = walk(val);
      return o;
    }
    return x;
  };
  return walk(v);
}

function applyChanges(body: unknown, changes?: Change[]): unknown {
  if (!changes?.length || body === null || typeof body !== "object") return body;
  const out = JSON.parse(JSON.stringify(body));
  for (const ch of changes) {
    const toks = ch.path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    let node: any = out;
    for (let i = 0; i < toks.length - 1; i++) {
      const t = toks[i];
      if (node === null || typeof node !== "object") break;
      node = Array.isArray(node) ? node[Number(t)] : node[t];
    }
    if (node === null || typeof node !== "object") continue;
    const last = toks[toks.length - 1];
    if (ch.remove) {
      if (Array.isArray(node)) node.splice(Number(last), 1);
      else delete node[last];
    } else node[Array.isArray(node) ? Number(last) : last] = JSON.parse(JSON.stringify(ch.set ?? null));
  }
  return out;
}

/** Every title/name we send carries the sandbox prefix (as the safety gate does). */
function sandboxNames(body: unknown): unknown {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        o[k] =
          typeof val === "string" && /^(title|name)$/i.test(k) && val.trim() && !/^(QA_Platform_|API_Test_|API_Journey_)/.test(val) && val.length < 200 && !/[<>]|drop table|select .* from/i.test(val)
            ? `QA_Platform_${val}`
            : walk(val);
      }
      return o;
    }
    return v;
  };
  return walk(body);
}

// ── assertions ─────────────────────────────────────────────────────────────

function resolveAll(root: unknown, path: string): unknown[] {
  const p = path.replace(/^\$\.?/, "");
  if (!p) return [root];
  let nodes: unknown[] = [root];
  for (const t of p.replace(/\[\*\]/g, ".*").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    const next: unknown[] = [];
    for (const n of nodes) {
      if (n === MISSING) next.push(MISSING);
      else if (t === "*") Array.isArray(n) ? next.push(...n) : next.push(MISSING);
      else if (Array.isArray(n) && /^\d+$/.test(t)) next.push(Number(t) < n.length ? n[Number(t)] : MISSING);
      else if (n && typeof n === "object" && !Array.isArray(n)) next.push(t in (n as object) ? (n as Record<string, unknown>)[t] : MISSING);
      else next.push(MISSING);
    }
    nodes = next;
  }
  return nodes;
}

const show = (v: unknown): string => {
  if (v === MISSING) return "absent";
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};
const jsonType = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) || (a !== null && b !== null && typeof a !== "object" && typeof b !== "object" && String(a) === String(b));

function judgeAssertion(a: Assertion, reply: Reply, value: unknown): { pass: boolean | null; actual: string } {
  if (a.op === "status") return { pass: reply.status === Number(value), actual: `HTTP ${reply.status}` };
  if (a.op === "status_2xx") return { pass: reply.status >= 200 && reply.status < 300, actual: `HTTP ${reply.status}` };
  if (!reply.ok) return { pass: null, actual: `the read was refused (${said(reply)}), so the field could not be checked` };
  const vals = resolveAll(reply.data, a.path);
  const present = vals.filter((v) => v !== MISSING);
  // A field that is simply not in the reply proves nothing about its value:
  // the plan may name a field this reply does not carry. Only "exists" and
  // "absent" are about presence itself.
  if (!present.length && !["exists", "absent", "count", "count_gte"].includes(a.op))
    return { pass: null, actual: "that field is not in the reply — the plan may name a field this reply does not carry" };
  switch (a.op) {
    case "exists":
      return { pass: vals.length > 0 && present.length === vals.length, actual: present.length ? `present (${show(present[0])})` : "absent" };
    case "absent":
      return { pass: present.length === 0 || present.every((v) => v === null), actual: present.length ? `present (${show(present[0])})` : "absent" };
    case "equals": {
      if (!present.length) return { pass: false, actual: "absent" };
      const hit = a.path.includes("[*]") ? present.some((v) => same(v, value)) : present.every((v) => same(v, value));
      return { pass: hit, actual: show(a.path.includes("[*]") ? present : present[0]) };
    }
    case "not_equals":
      if (!present.length) return { pass: null, actual: "absent" };
      return { pass: present.every((v) => !same(v, value)), actual: show(present[0]) };
    case "one_of": {
      const set = present.filter((v) => v !== null);
      if (!set.length) return { pass: null, actual: present.length ? "not set (null)" : "absent" };
      const allowed = Array.isArray(value) ? value : [value];
      const bad = set.find((v) => !allowed.some((x) => same(x, v)));
      return { pass: bad === undefined, actual: show(bad === undefined ? set[0] : bad) };
    }
    case "contains": {
      if (!present.length) return { pass: false, actual: "absent" };
      const hit = present.some((v) => (Array.isArray(v) ? v.some((x) => same(x, value)) : typeof v === "string" ? v.includes(String(value)) : same(v, value)));
      return { pass: hit, actual: show(present[0]) };
    }
    case "count":
    case "count_gte": {
      const arr = a.path.includes("[*]") ? present : present[0];
      const n = Array.isArray(arr) ? arr.length : arr === undefined ? 0 : NaN;
      if (Number.isNaN(n)) return { pass: false, actual: `not a list (${jsonType(arr)})` };
      return { pass: a.op === "count" ? n === Number(value) : n >= Number(value), actual: `${n} entr${n === 1 ? "y" : "ies"}` };
    }
    case "non_empty": {
      const arr = present[0];
      return { pass: Array.isArray(arr) ? arr.length > 0 : arr !== undefined && arr !== null && arr !== "", actual: Array.isArray(arr) ? `${arr.length} entr${arr.length === 1 ? "y" : "ies"}` : show(arr ?? MISSING) };
    }
    case "gte":
    case "lte": {
      const nums = present.filter((v) => v !== null && v !== "").map((v) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v));
      if (!nums.length) return { pass: null, actual: "no value" };
      const bad = nums.find((n) => typeof n !== "number" || (a.op === "gte" ? n < Number(value) : n > Number(value)));
      return { pass: bad === undefined, actual: show(bad === undefined ? nums[0] : bad) };
    }
    case "type_is": {
      if (!present.length) return { pass: null, actual: "absent" };
      const allowed = (Array.isArray(value) ? value : [value]).map(String);
      const bad = present.find((v) => !allowed.includes(jsonType(v)));
      return { pass: bad === undefined, actual: bad === undefined ? jsonType(present[0]) : `${jsonType(bad)} (${show(bad)})` };
    }
    case "format": {
      const f = FORMATS[String(value)];
      const vs = present.filter((v) => v !== null && v !== "");
      if (!f || !vs.length) return { pass: null, actual: "no value" };
      const bad = vs.find((v) => !f.test(v));
      return { pass: bad === undefined, actual: show(bad === undefined ? vs[0] : bad) };
    }
  }
  return { pass: null, actual: "unknown check" };
}

// ── one plan, once ─────────────────────────────────────────────────────────

const OUTCOME_SAY: Record<Outcome, string> = { accept: "The app accepts it.", reject: "The app refuses it.", "no-5xx": "The app answers without a server error (accepted or refused)." };

async function attempt(plan: ApiPlan, rc: RunCtx, opts: PlanRunOptions, allowReuse: boolean): Promise<PlanAttempt> {
  evalPhase = "setup";
  evalCallN = 0;
  evalDecisive = false;
  try {
    return await attemptPhases(plan, rc, opts, allowReuse);
  } finally {
    evalPhase = "setup";
  }
}

async function attemptPhases(plan: ApiPlan, rc: RunCtx, opts: PlanRunOptions, allowReuse: boolean): Promise<PlanAttempt> {
  const t0 = Date.now();
  const recipe = RECIPES[plan.setup.recipe];
  const steps: PlanStepResult[] = [];
  const emit = (s: PlanStepResult) => {
    steps.push(s);
    opts.onStep?.(s);
    const mark = { passed: "✓", failed: "✗", "couldn't tell": "?", "not run": "–", done: "·" }[s.verdict];
    rc.onLine(`  ${mark} ${s.phase} ${s.n}: ${s.title} — ${s.actual}`);
  };
  if (!recipe) return { verdict: "not run", reason: `unknown setup “${plan.setup.recipe}”`, setup: { recipe: plan.setup.recipe, ok: false, steps: [], ms: 0 }, steps, ms: 0 };

  // ── setup (fresh, or reused only by a read-only plan) ──
  const readOnly = plan.act.every((a) => OPS[a.op]?.kind === "read");
  const key = `${rc.companyId}:${recipe.id}:${plan.setup.lineItems ?? 1}${plan.setup.fromPr ? `:pr${plan.setup.fromPr.items ?? 1}` : ""}`;
  let inst: SetupInstance;
  let reused = false;
  const cached = opts.setupCache?.get(key);
  if (allowReuse && readOnly && cached && Date.now() - cached.at < 10 * 60_000) {
    inst = cached;
    reused = true;
    rc.onLine(`Setup: reusing the ${recipe.id} record another read-only plan built (nothing in this plan writes).`);
  } else {
    inst = await buildSetup(rc, recipe, plan.setup.lineItems, plan.setup.fromPr);
    if (inst.result.ok && opts.setupCache && readOnly) opts.setupCache.set(key, inst);
  }
  const setup: SetupResult = { ...inst.result, ...(reused ? { reused: true } : {}) };
  if (!inst.result.ok) {
    return { verdict: "couldn't tell", reason: `The starting state could not be built, so the case was not tried: ${inst.result.reason}.`, setup, steps, journey: inst.journey, ms: Date.now() - t0 };
  }

  const tc: TokenCtx = { vals: { ...inst.vals, stamp: String(Date.now()) }, acts: [] };
  let verdict: PlanVerdict | undefined;
  let reason = "";
  let decisiveDone = false;
  let crashed = false;

  // ── acts ──
  evalPhase = "act";
  // the decisive act, as the planner defines it: the one marked, else the last that is not a wait
  const marked = plan.act.findIndex((x) => x.decisive);
  let lastReal = -1;
  for (let j = plan.act.length - 1; j >= 0 && lastReal < 0; j--) if (plan.act[j].op !== "wait") lastReal = j;
  const decisiveIdx = marked >= 0 ? marked : lastReal;
  for (let i = 0; i < plan.act.length; i++) {
    const a = plan.act[i];
    evalDecisive = i === decisiveIdx;
    const n = i + 1;
    const op = OPS[a.op];
    const who = (a.as ?? op.actor) as ActorId;
    const actorWord = who === "buyer" ? "buyer" : who === "vendor" ? "QA vendor 1" : "QA vendor 2";
    const expect: Outcome = a.expect ?? (a.decisive ? plan.expected.outcome : "accept");
    const title = actInWords(a);
    const t = Date.now();

    if (a.op === "wait") {
      const trade = String((a.params?.round === "technical" ? tc.vals.rfpTradeId : tc.vals.pricingTradeUuid ?? tc.vals.tradeId) ?? "");
      const c = trade ? await clock(rc.client.ctx.buyerApi, trade) : undefined;
      if (!c) {
        emit({ n, phase: "act", title, actor: "platform", expected: "The run waits for the round's time.", actual: "The round's times could not be read, so the wait could not be timed.", verdict: "couldn't tell", ms: Date.now() - t });
        verdict = "couldn't tell";
        reason = "The round's time could not be read, so the wait in the case could not be done.";
        break;
      }
      const target = a.params?.until === "bid_end" ? c.bet + 5 : c.ect + 8;
      const w = await waitUntil(target, WAIT_CAP_MS, a.params?.until === "bid_end" ? "the bid end time passes" : "the round closes", rc.onLine);
      tc.acts.push({});
      emit({ n, phase: "act", title, actor: "platform", expected: `The run waits until ${hhmmss(target)}.`, actual: w.reached ? `Waited ${Math.round(w.waitedMs / 1000)} s; the round's ${a.params?.until === "bid_end" ? "bid end" : "close"} (${hhmmss(target)}) has passed.` : `Waited the 6-minute cap, but the time is only ${hhmmss(target)}.`, verdict: w.reached ? "done" : "couldn't tell", ms: Date.now() - t });
      if (!w.reached) {
        verdict = "couldn't tell";
        reason = "The round's time was more than the 6-minute wait cap away, so the step after the wait could not be tried at the right moment.";
        break;
      }
      continue;
    }

    // what the round's clock is now (for {{roundEnd±N}}, in a change or in the template itself)
    const needsClock = /\{\{(round(End|Close)|rfpEnd)/.test(JSON.stringify(a.change ?? [])) || a.op === "extend_round";
    if (needsClock && (tc.vals.pricingTradeUuid || tc.vals.tradeId)) {
      const c = await clock(rc.client.ctx.buyerApi, String(tc.vals.pricingTradeUuid ?? tc.vals.tradeId));
      tc.roundEnd = c?.bet;
      tc.roundClose = c?.ect;
    }
    if (needsClock && tc.vals.rfpTradeId) tc.rfpEnd = (await clock(rc.client.ctx.buyerApi, String(tc.vals.rfpTradeId)))?.bet;
    // which round a round-scoped op acts on
    const roundVals = a.params?.round === "technical" && tc.vals.rfpTradeId ? { ...tc.vals, tradeId: tc.vals.rfpTradeId } : tc.vals;

    const { api, error } = await actorApi(rc, who);
    if (!api) {
      emit({ n, phase: "act", title, actor: actorWord, expected: OUTCOME_SAY[expect], actual: `Could not sign in as ${actorWord}: ${error}.`, verdict: "couldn't tell", ms: Date.now() - t, decisive: a.decisive });
      verdict = "couldn't tell";
      reason = `${actorWord} could not sign in, so the case could not be tried (${error}).`;
      break;
    }

    let reply: Reply;
    let call: PlanStepResult["call"];
    let also: PlanStepResult["alsoCalled"];
    let sentBody: unknown;
    if (a.op === "place_bid") {
      const pb = await placeBid(rc, { ...inst, vals: tc.vals }, who === "vendor2" ? "vendor2" : "vendor", a.params?.price ?? 100);
      reply = pb.decider;
      call = pb.call;
      also = pb.also;
      if (pb.bidUuid) tc.vals.bidUuid = pb.bidUuid;
      sentBody = call?.body;
    } else {
      // method, path, body: the op's template or the library case
      let method: string = op.method;
      let path: string = op.path;
      let body: unknown;
      if (a.op === "library") {
        const { loadCases } = await import("./caseLibrary.js");
        const c = loadCases().find((x) => x.id === a.caseId);
        method = String(c?.method ?? "GET").toUpperCase();
        path = String(c?.path ?? "");
        body = c?.body;
      } else if (op.kind === "write") {
        const vendorFor = a.params?.vendor ?? (who === "vendor2" ? "vendor2" : "vendor");
        const vu = String(tc.vals[vendorFor === "vendor2" ? "vendor2Uuid" : "vendorUuid"] ?? "");
        const args = bodyArgs(rc, { ...inst, vals: tc.vals }, vu);
        // null: a surrogate bid with no price (the builder leaves it out)
        args.price = a.params?.price === null ? null : (a.params?.price ?? 100);
        if (a.op === "price_bid" || a.op === "surrogate_bid" || a.op === "price_cap") {
          args.tradeProduct = await tradeProduct(a.op === "price_bid" ? api : rc.client.ctx.buyerApi, args.pricingTradeUuid);
          if (!args.tradeProduct) {
            emit({ n, phase: "act", title, actor: actorWord, expected: OUTCOME_SAY[expect], actual: "The round's line could not be read, so the bid could not be priced.", verdict: "couldn't tell", ms: Date.now() - t, decisive: a.decisive });
            verdict = "couldn't tell";
            reason = "The round's line could not be read, so the bid in the case could not be built.";
            break;
          }
        }
        if (a.op === "surrogate_tech_response") {
          args.techPages = args.technicalTradeUuid ? await techPages(rc.client.ctx.buyerApi, args.technicalTradeUuid) : undefined;
          if (!args.techPages) {
            emit({ n, phase: "act", title, actor: actorWord, expected: OUTCOME_SAY[expect], actual: "The technical round's questionnaire could not be read, so the response could not be built.", verdict: "couldn't tell", ms: Date.now() - t, decisive: a.decisive });
            verdict = "couldn't tell";
            reason = "The technical round's questionnaire could not be read, so the surrogate technical response in the case could not be built.";
            break;
          }
        }
        if (a.op === "submit_bid") args.total = (args.price ?? 0) * args.qty;
        if (a.op === "add_rfq_round" || a.op === "add_rfp_round") {
          // the window must be long enough for the steps after it
          args.nowSec = nowSec();
        }
        const B = await loadBodies();
        body = templateBody(B, a.op, args);
        if (a.op === "extend_round" && a.params?.round === "technical") (body as Record<string, unknown>).increase_auction_time = "{{rfpEnd+60}}";
        if (a.op === "publish_event" && Array.isArray((body as any)?.draft_trade_request_uuids)) {
          (body as any).draft_trade_request_uuids = (body as any).draft_trade_request_uuids.filter(Boolean);
        }
      }
      body = applyChanges(body, a.change);
      const missing: string[] = [];
      path = String(fill(path, { ...tc, vals: roundVals }, missing));
      body = body === undefined ? undefined : sandboxNames(fill(body, tc, missing));
      if (missing.length) {
        emit({ n, phase: "act", title, actor: actorWord, expected: OUTCOME_SAY[expect], actual: `Not sent: ${[...new Set(missing)].map((m) => `{{${m}}}`).join(", ")} had no value in this run.`, verdict: "couldn't tell", ms: Date.now() - t, decisive: a.decisive });
        verdict = "couldn't tell";
        reason = "A value the request needs was not produced by the setup or an earlier step.";
        break;
      }
      const m = method.toUpperCase();
      if (!["GET", "POST", "PATCH", "PUT"].includes(m)) {
        emit({ n, phase: "act", title, actor: actorWord, expected: OUTCOME_SAY[expect], actual: `Not sent: ${m} is never sent.`, verdict: "not run", ms: 0 });
        verdict = "not run";
        reason = `${m} requests are never sent by a plan.`;
        break;
      }
      reply = await send(api, m, path, m === "GET" ? undefined : body);
      // the buyer's session can end under a long run: one fresh session, one retry
      if (reply.status === 401 && who === "buyer" && rc.reopened < 1) {
        const fresh: any = await openClientContext(rc.companyId, rc.baseURL).catch(() => undefined);
        if (fresh) {
          rc.reopened++;
          rc.onLine("  · the buyer's session answered 401; a fresh session was opened and the request sent again");
          const old = rc.client;
          rc.client = fresh;
          if (opts.client !== old) await old.dispose?.().catch?.(() => {});
          reply = await send(fresh.ctx.buyerApi, m, path, m === "GET" ? undefined : body);
        }
      }
      call = { method: m, path, ...(m === "GET" ? {} : { body: redact(body) }) };
      sentBody = body;
    }
    tc.acts.push({ body: sentBody, data: reply.data });
    for (const p of op.produces) {
      const id = p === "lineItemUuid" ? reply.data?.event_group_line_item_ids?.[0] : p === "bidUuid" ? reply.data?.bid_uuid ?? reply.data?.uuid : reply.data?.uuid;
      if (reply.ok && id) {
        tc.vals[p] = String(id);
        if (p === "pricingTradeUuid") tc.vals.tradeId = String(id);
        if (p === "technicalTradeUuid") {
          tc.vals.rfpTradeId = String(id);
          tc.vals.tradeId ??= String(id);
        }
      }
    }

    // ── judge the step ──
    const o: CheckOutcome = { httpStatus: reply.status || null, accepted: reply.ok, message: reply.message ? `${reply.message}${reply.code ? ` (code ${reply.code})` : ""}` : null, durationMs: reply.ms };
    const decisiveReject = !!a.decisive && expect === "reject";
    const wantCode = decisiveReject ? plan.expected.code : undefined;
    // A closed round is the state the case set up on purpose: its "order not
    // active" refusal is the case working, not an unusable record.
    const documented = [decisiveReject ? plan.expected.message : "", decisiveReject && (recipe.closed || plan.act.some((x) => x.op === "wait")) ? "order not active" : ""].filter(Boolean).join(" · ");
    let c = classify(expect, o, decisiveReject && !(wantCode && reply.code) ? plan.expected.message : undefined, documented || undefined);
    if (decisiveReject && wantCode && reply.code && !reply.ok && reply.status > 0 && reply.status < 500 && reply.status !== 401) {
      c = reply.code === wantCode
        ? { pass: true, verdict: `correctly rejected (${reply.status}: ${reply.message ?? ""} — code ${reply.code}, as expected)` }
        : { pass: false, inconclusive: true, verdict: `rejected, but for a DIFFERENT reason — expected code ${wantCode}, got "${reply.message ?? ""}" (code ${reply.code})` };
    }
    let sv: StepVerdict;
    let actual = said(reply);
    const inconclusive = !!c.inconclusive;
    if (reply.notSent) {
      sv = "couldn't tell";
      actual = `Not sent: ${reply.notSent}.`;
    } else if (reply.status === 0) {
      sv = "couldn't tell";
      actual = `No reply came back (${reply.message ?? "network"}).`;
    } else if (reply.status >= 500) {
      sv = "failed";
      crashed = true;
    } else if (inconclusive && /DIFFERENT reason/.test(c.verdict)) {
      sv = "couldn't tell";
      actual = `Refused, but for a different reason than the case is about: “${reply.message ?? ""}”${reply.code ? ` (code ${reply.code}` : " ("}${wantCode ? `; the ${plan.expected.codeInferred ? "plan expected (inferred by the compiler, not stated by the case)" : "case expects"} code ${wantCode}` : ""}${plan.expected.message ? ` “${plan.expected.message}”` : ""}).`;
    } else if (inconclusive) sv = "couldn't tell";
    else sv = c.pass ? (a.decisive ? "passed" : "done") : "failed";

    emit({
      n, phase: "act", title, actor: actorWord, expected: OUTCOME_SAY[expect], actual: actual.charAt(0).toUpperCase() + actual.slice(1) + (actual.endsWith(".") ? "" : "."),
      verdict: sv, call, alsoCalled: also, status: reply.status, code: reply.code, message: reply.message, ms: reply.ms, engine: c.verdict, decisive: a.decisive,
    });

    if (crashed) {
      verdict = "failed";
      reason = `The app broke with a server error (HTTP ${reply.status}) at step ${n} — a server error is always a defect.`;
      break;
    }
    if (a.decisive) {
      decisiveDone = true;
      if (sv === "passed") {
        verdict = undefined; // the verify steps decide the rest
        reason = expect === "reject" ? `The app refused it, as the case expects${reply.message ? `: “${reply.message}”` : ""}.` : expect === "accept" ? "The app accepted it, as the case expects." : "The app answered without a server error.";
      } else if (sv === "couldn't tell") {
        verdict = "couldn't tell";
        reason = inconclusive && /different reason/i.test(actual + c.verdict) ? actual : `Step ${n} could not decide either way: ${actual}`;
      } else {
        verdict = "failed";
        reason = expect === "reject" ? `The app accepted step ${n}, which the case says it must refuse.` : `The app refused step ${n}, which the case says should work: ${said(reply)}.`;
      }
      continue;
    }
    // an arrange step
    if (sv === "failed" && expect === "accept" && !reply.ok) {
      const rule = a.ifRefused ?? "inconclusive";
      if (rule === "pass" && plan.expected.outcome === "reject") {
        steps[steps.length - 1].verdict = "passed";
        verdict = "passed";
        reason = `The app refused it already at step ${n}${reply.message ? ` (“${reply.message}”)` : ""} — the refusal the case expects.`;
        decisiveDone = true;
        break;
      }
      if (rule === "continue") {
        steps[steps.length - 1].verdict = "done";
        continue;
      }
      steps[steps.length - 1].verdict = "couldn't tell";
      verdict = "couldn't tell";
      reason = `A step that sets up the case (step ${n}) was refused, so the case itself was never reached: ${said(reply)}.`;
      break;
    }
    if (sv === "failed") {
      verdict = "failed";
      reason = `Step ${n} did not behave as the case says: ${said(reply)}.`;
      break;
    }
    if (sv === "couldn't tell") {
      verdict = "couldn't tell";
      reason = `Step ${n} could not decide either way: ${actual}`;
      break;
    }
  }

  // ── verify ──
  if (!crashed && verdict !== "couldn't tell" && verdict !== "not run") {
    evalPhase = "verify";
    evalDecisive = false;
    for (let i = 0; i < plan.verify.length; i++) {
      const v = plan.verify[i];
      const n = i + 1;
      const op = OPS[v.op];
      const who = (v.as ?? op.actor) as ActorId;
      const actorWord = who === "buyer" ? "buyer" : who === "vendor" ? "QA vendor 1" : "QA vendor 2";
      const title = verifyInWords(v);
      const t = Date.now();
      const { api, error } = await actorApi(rc, who);
      if (!api) {
        emit({ n, phase: "verify", title, actor: actorWord, expected: "The read-back holds.", actual: `Could not sign in as ${actorWord}: ${error}.`, verdict: "couldn't tell", ms: 0 });
        verdict ??= "couldn't tell";
        reason = verdict === "couldn't tell" ? `The read-back could not be done: ${actorWord} could not sign in.` : reason;
        continue;
      }
      const missing: string[] = [];
      const path = String(fill(op.path, tc, missing));
      if (missing.length) {
        emit({ n, phase: "verify", title, actor: actorWord, expected: "The read-back holds.", actual: `Not read: ${missing.map((m) => `{{${m}}}`).join(", ")} had no value.`, verdict: "couldn't tell", ms: 0 });
        if (verdict !== "failed") {
          verdict = "couldn't tell";
          reason = "The record to read back was not known.";
        }
        continue;
      }
      const reply = await send(api, "GET", path);
      if (reply.notSent) {
        emit({ n, phase: "verify", title, actor: actorWord, expected: "The read-back holds.", actual: `Not read: ${reply.notSent}.`, verdict: "couldn't tell", ms: 0 });
        if (verdict !== "failed") {
          verdict = "couldn't tell";
          reason = `The read-back was not sent: ${reply.notSent}.`;
        }
        continue;
      }
      const results = v.assert.map((as0) => {
        const mv: string[] = [];
        // ids inside a path (auction_identifiers_data.{{vendorUuid}}…) are this run's ids
        const as = { ...as0, path: String(fill(as0.path ?? "", tc, mv)) };
        const value = fill(as.value, tc, mv);
        if (mv.length) return { say: as.say ?? `${as.path} ${as.op}`, pass: null as boolean | null, actual: `a value it needs (${mv.join(", ")}) was not known in this run` };
        const r = judgeAssertion(as, reply, value);
        return { say: as.say ?? describeAssert(as0, value), pass: r.pass, actual: r.actual };
      });
      const failedA = results.filter((r) => r.pass === false);
      const nullA = results.filter((r) => r.pass === null);
      const crash = reply.status >= 500;
      const sv: StepVerdict = crash ? "failed" : failedA.length ? "failed" : nullA.length ? "couldn't tell" : "passed";
      emit({
        n, phase: "verify", title, actor: actorWord, expected: v.assert.map((as) => describeAssert(as, fill(as.value, tc, []))).join("; "),
        actual: crash ? `The read broke with a server error (HTTP ${reply.status}).` : results.map((r) => `${r.say}: ${r.pass === true ? "yes" : r.pass === false ? "NO" : "could not check"} (${r.actual})`).join("; "),
        verdict: sv, call: { method: "GET", path }, status: reply.status, code: reply.code, message: reply.message, ms: Date.now() - t, assertions: results,
      });
      if (crash) {
        crashed = true;
        verdict = "failed";
        reason = `The read-back broke with a server error (HTTP ${reply.status}) — always a defect.`;
      } else if (failedA.length && verdict !== "failed") {
        verdict = "failed";
        reason = `The read-back does not show what the case expects: ${failedA.map((r) => `${r.say} — got ${r.actual}`).join("; ")}.`;
      } else if (nullA.length && verdict === undefined) {
        verdict = "couldn't tell";
        reason = `The read-back could not be checked: ${nullA.map((r) => `${r.say} — ${r.actual}`).join("; ")}.`;
      }
    }
  }

  if (verdict === "failed" && !crashed && plan.dependsOnSetting) {
    verdict = "couldn't tell";
    reason = `${reason} The case depends on a company setting (${plan.dependsOnSetting}) this run does not set, so this is not reported as a bug.`;
  }
  if (verdict === undefined) {
    if (!plan.act.length || decisiveDone) {
      verdict = "passed";
      reason = [reason, plan.verify.length ? "The read-back shows what the case expects." : ""].filter(Boolean).join(" ") || "Every step did what the case expects.";
    } else {
      verdict = "couldn't tell";
      reason = "The step the case is about was never reached.";
    }
  }
  return { verdict, reason, setup, steps, journey: inst.journey, ms: Date.now() - t0 };
}

function describeAssert(a: Assertion, value: unknown): string {
  if (a.say) return a.say;
  const f = a.path ? a.path.replace(/\[\*\]/g, "").replace(/\{\{vendor2Uuid\}\}/g, "QA vendor 2").replace(/\{\{vendorUuid\}\}/g, "QA vendor 1").replace(/\{\{lineItemUuid\}\}/g, "the line").replace(/\{\{\w+\}\}/g, "…").replace(/_/g, " ").replace(/\./g, " › ") : "the reply";
  const v = typeof value === "string" ? `“${value}”` : JSON.stringify(value);
  switch (a.op) {
    case "status": return `the read answers HTTP ${value}`;
    case "status_2xx": return "the read succeeds";
    case "exists": return `${f} is present`;
    case "absent": return `${f} is absent`;
    case "equals": return `${f} is ${v}`;
    case "not_equals": return `${f} is not ${v}`;
    case "one_of": return `${f} is one of ${Array.isArray(value) ? value.join(" / ") : v}`;
    case "contains": return `${f} contains ${v}`;
    case "count": return `${f} has ${value} entries`;
    case "count_gte": return `${f} has at least ${value} entries`;
    case "non_empty": return `${f} is not empty`;
    case "gte": return `${f} ≥ ${value}`;
    case "lte": return `${f} ≤ ${value}`;
    case "type_is": return `${f} is a ${Array.isArray(value) ? value.join(" or ") : value}`;
    case "format": return `${f} is ${FORMATS[String(value)]?.words ?? value}`;
  }
  return `${f} ${a.op}`;
}

// ── the entry points ───────────────────────────────────────────────────────

const PLAN_BUDGET_MS = 25 * 60_000;

/** Run one plan on its own fresh record; a failure is re-checked on a second fresh record. */
export async function runApiPlan(plan: ApiPlan, opts: PlanRunOptions): Promise<PlanRunResult> {
  const t0 = Date.now();
  const onLine = opts.onLine ?? (() => {});
  const caseId = plan.caseId ?? `PLAN-${Date.now()}`;
  const base: Omit<PlanRunResult, keyof PlanAttempt> = { caseId, title: plan.title, plan, companyId: opts.companyId };
  let client = opts.client;
  let owned = false;
  if (!client) {
    try {
      client = await withWatchdog(openClientContext(opts.companyId, opts.baseURL), 180_000, "opening a session for the client");
      owned = true;
    } catch (e) {
      const r: PlanRunResult = { ...base, verdict: "not run", reason: `No session could be opened for this client: ${(e as Error).message}.`, setup: { recipe: plan.setup.recipe, ok: false, steps: [], ms: 0 }, steps: [], ms: Date.now() - t0 };
      if (opts.save !== false) r.runId = save(r, opts, null);
      return r;
    }
  }
  const vendors = await qaVendorsFor(opts.companyId, client?.ctx?.buyerApi, 4).catch(() => [] as QaVendor[]);
  const rc: RunCtx = { companyId: opts.companyId, baseURL: opts.baseURL, client, vendors, apis: new Map(), onLine, reopened: 0 };
  let result: PlanRunResult;
  try {
    onLine(`Plan “${plan.title}” on ${client.companyName ?? opts.companyId}`);
    const first = await withWatchdog(attempt(plan, rc, opts, true), PLAN_BUDGET_MS, "running the plan").catch(
      (e) => ({ verdict: "couldn't tell", reason: `The run did not finish: ${(e as Error).message}.`, setup: { recipe: plan.setup.recipe, ok: false, steps: [], ms: 0 }, steps: [], ms: Date.now() - t0 }) as PlanAttempt,
    );
    result = { ...base, ...first };
    if (first.verdict === "failed" && opts.confirm !== false) {
      onLine("The plan failed — checking it again on a second fresh record before calling it a product bug…");
      for (const api of rc.apis.values()) await Promise.resolve(api?.dispose?.()).catch(() => {});
      rc.apis.clear();
      const again = await withWatchdog(attempt(plan, rc, opts, false), PLAN_BUDGET_MS, "re-running the plan").catch(
        (e) => ({ verdict: "couldn't tell", reason: `The second run did not finish: ${(e as Error).message}.`, setup: { recipe: plan.setup.recipe, ok: false, steps: [], ms: 0 }, steps: [], ms: 0 }) as PlanAttempt,
      );
      result.confirmation = { verdict: again.verdict, reason: again.reason, setup: again.setup, steps: again.steps };
      if (again.verdict === "failed") {
        result.confirmed = true;
        result.reason = `${first.reason} It failed the same way on a second fresh record, so it is reported as a product failure.`;
      } else {
        result.confirmed = false;
        result.verdict = "couldn't tell";
        result.reason = `It failed on the first fresh record (${first.reason.replace(/\.$/, "")}) but ${again.verdict === "passed" ? "passed" : `came out “${again.verdict}”`} on a second one, so it is not reported as a bug.`;
      }
    }
  } finally {
    for (const api of rc.apis.values()) await Promise.resolve(api?.dispose?.()).catch(() => {});
    if (owned || rc.client !== opts.client) await rc.client?.dispose?.().catch?.(() => {});
  }
  result.ms = Date.now() - t0;
  if (opts.save !== false) result.runId = save(result, opts, client?.companyName ?? null);
  onLine(`Verdict: ${result.verdict} — ${result.reason}`);
  return result;
}

/** Several plans, one after another (one live journey at a time); read-only plans may share a recipe instance. */
export async function runApiPlans(plans: ApiPlan[], opts: PlanRunOptions): Promise<PlanRunResult[]> {
  const out: PlanRunResult[] = [];
  const cache = opts.setupCache ?? new Map<string, SetupInstance>();
  for (const p of plans) out.push(await runApiPlan(p, { ...opts, setupCache: cache }));
  return out;
}

// ── saving, in the shape every report reads ────────────────────────────────

const VERDICT_TEXT: Record<PlanVerdict, (r: PlanRunResult) => string> = {
  passed: (r) => `api plan passed — ${r.reason}`,
  failed: (r) => (r.steps.some((s) => (s.status ?? 0) >= 500) ? `server error — a 5xx is always a defect. ${r.reason}` : `api plan failed — ${r.reason}`),
  "couldn't tell": (r) => `inconclusive — ${r.reason}`,
  "not run": (r) => `never ran — ${r.reason}`,
};

/** The run as CheckResults: the case itself, then one row per step (category "plan step"). */
export function planCheckResults(r: PlanRunResult): CheckResult[] {
  const words = planInWords(r.plan);
  const decisive = r.steps.find((s) => s.decisive) ?? [...r.steps].reverse().find((s) => s.phase === "act") ?? r.steps[0];
  const main: CheckResult & Record<string, unknown> = {
    id: r.caseId,
    flowId: "api-plan",
    module: "API plan",
    scenario: r.title,
    type: "functional",
    category: "API plan",
    priority: "P2",
    severity: "Medium",
    expected: r.plan.expected.outcome,
    inconclusive: r.verdict === "couldn't tell",
    layer: "api",
    inputSummary: decisive?.call ? `${decisive.call.method} ${decisive.call.path}` : `setup ${r.plan.setup.recipe}`,
    ...(decisive?.call ? { request: decisive.call } : {}),
    httpStatus: decisive?.status ?? null,
    accepted: decisive?.status ? decisive.status >= 200 && decisive.status < 300 : false,
    message: decisive?.message ? `${decisive.message}${decisive.code ? ` (code ${decisive.code})` : ""}` : null,
    durationMs: r.ms,
    pass: r.verdict === "passed",
    verdict: VERDICT_TEXT[r.verdict](r),
    preconditions: words.preconditions,
    steps: words.steps,
    expectedResult: words.expected,
    apiPlan: { recipe: r.plan.setup.recipe, setupOk: r.setup.ok, event: r.setup.title, confirmed: r.confirmed },
  };
  const rows: CheckResult[] = [main];
  const all = [...r.steps.map((s) => ({ s, tag: "" })), ...(r.confirmation?.steps ?? []).map((s) => ({ s, tag: "confirm·" }))];
  for (const { s, tag } of all) {
    rows.push({
      id: `${r.caseId}·${tag}${s.phase}${s.n}`,
      flowId: "api-plan",
      module: "API plan",
      scenario: `${tag ? "Re-check on a fresh record: " : ""}${s.title}`,
      type: "functional",
      category: "plan step",
      priority: "P2",
      severity: "Medium",
      expected: "accept",
      inconclusive: s.verdict === "couldn't tell",
      layer: "api",
      inputSummary: s.call ? `${s.call.method} ${s.call.path}` : s.title,
      ...(s.call ? { request: s.call } : {}),
      httpStatus: s.status ?? null,
      accepted: (s.status ?? 0) >= 200 && (s.status ?? 0) < 300,
      message: s.message ? `${s.message}${s.code ? ` (code ${s.code})` : ""}` : null,
      durationMs: s.ms,
      pass: s.verdict === "passed" || s.verdict === "done",
      verdict: s.verdict === "not run" ? `never ran — ${s.actual}` : s.actual,
    } as CheckResult);
  }
  return rows;
}

function save(r: PlanRunResult, opts: PlanRunOptions, companyName: string | null): string | undefined {
  try {
    const id = newRunId();
    saveRun({
      id,
      ts: new Date().toISOString(),
      request: `api plan: ${r.title}`,
      companyId: opts.companyId,
      companyName,
      provider: providerLabel(),
      durationMs: r.ms,
      report: undefined,
      events: [
        { seq: 1, agent: "System", status: "done", title: "api plan", data: { plan: r.plan, setup: r.setup, verdict: r.verdict, reason: r.reason, confirmed: r.confirmed, confirmation: r.confirmation ? { verdict: r.confirmation.verdict, reason: r.confirmation.reason, setup: r.confirmation.setup } : undefined }, ts: new Date().toISOString() },
      ],
      flowResults: [],
      validationResults: [],
      checkResults: planCheckResults(r),
      ...(r.journey ? { journey: r.journey, setupSteps: journeyToSetupSteps(r.journey), setupSummary: journeyToSetupSummary(r.journey) } : {}),
    });
    return id;
  } catch (e) {
    opts.onLine?.(`the run could not be saved: ${(e as Error).message}`);
    return undefined;
  }
}

/** One line for the assistant / CLI. */
export function planResultLine(r: PlanRunResult): string {
  const v = { passed: "Passed", failed: "Failed", "couldn't tell": "Couldn't tell", "not run": "Not run" }[r.verdict];
  return `${v} — ${r.reason}`;
}

export type { StepKind };
