/**
 * THE CURATED TEST-CASE LIBRARY.
 *
 * These cases were written by mining Procol's own backend — its controllers,
 * models and RSpec specs — so the paths, fields, validation rules and error
 * codes are the REAL ones, not guesses. They live as data (data/test-cases.json)
 * rather than being invented at run time, which means:
 *   • they are detailed and consistent (steps, preconditions, expected result);
 *   • they don't depend on a free LLM being fast or available;
 *   • the same case runs identically every time, so results are comparable.
 *
 * Each case is BOTH documentation (readable steps a human could follow) and
 * executable (method + path + body + expected outcome). The runtime AI layer
 * still exists for novel requests — this library is the dependable backbone.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Check, Client } from "./engine.js";
import { gate, type DynamicContext, type DynamicSpec } from "./dynamicChecks.js";

const here = dirname(fileURLToPath(import.meta.url));
/**
 * The per-feature API case library.
 *
 * A separate file from data/test-cases.json on purpose: that one now holds the
 * 648 WRITTEN cases (prose, steps, oracle) read by testCatalog.ts, a different
 * shape entirely. The two systems shared a filename until the merge dropped
 * the written catalog into it, at which point this library silently read zero
 * cases and every feature in the tree greyed out — "Run selected" had nothing
 * to run and said so in no way at all.
 */
const LIB_PATH = join(here, "..", "..", "data", "api-cases.json");
/**
 * Edge and negative cases written per area from the backend code (one file per
 * area: crt, stg, pub, bid, awd …), each citing the guard it exercises. Kept
 * out of api-cases.json so regenerating that file never drops them.
 */
const EXTRA_DIR = join(here, "..", "..", "data", "api-cases-extra");

/** Placeholders a case may use — anything else could never be filled in. */
const KNOWN_PLACEHOLDERS = new Set([
  "eventGroupUuid", "tradeId", "lineItemUuid", "bidUuid", "proposalUuid", "vendorUuid", "vendorCompanyId",
  "productUuid", "productQualityUuid", "stamp", "prId", "prItemId", "userUuid", "teamUuid", "categoryUuid",
  "cityUuid", "familyUuid", "orderUuid", "intakeId",
  // Filled from the journey: the technical (RFP) stage — {{tradeId}} is the
  // pricing stage when there is one — and the form assigned to the evaluator.
  "rfpTradeId", "evalFormUuid", "locationUuid",
  // Also produced by the journey (eventJourney.ts `produced`), passed through as-is:
  // the vendor's technical response and its form/page, the quoted line, the award flow.
  "templateResponseUuid", "techFormUuid", "techPageUuid", "tradeProductUuid", "approvalFlowUuid",
  // Vendor bulk upload: the fixture's base64, loaded by the bulk runner.
  "vbuSheet",
]);

function readExtraCases(): TestCaseRecord[] {
  if (!existsSync(EXTRA_DIR)) return [];
  const out: TestCaseRecord[] = [];
  for (const f of readdirSync(EXTRA_DIR).filter((n) => n.endsWith(".json")).sort()) {
    try {
      const parsed = JSON.parse(readFileSync(join(EXTRA_DIR, f), "utf8"));
      const list: TestCaseRecord[] = Array.isArray(parsed) ? parsed : (parsed.cases ?? []);
      for (const c of list) {
        const unknown = [...JSON.stringify({ p: c?.path, b: c?.body }).matchAll(/\{\{(\w+)\}\}/g)]
          .map((m) => m[1])
          .filter((n) => !KNOWN_PLACEHOLDERS.has(n));
        out.push(unknown.length ? { ...c, notRunnable: c.notRunnable ?? `uses ${unknown.map((n) => `{{${n}}}`).join(", ")}, which no run can fill in` } : c);
      }
    } catch (e) {
      console.log(`[caseLibrary] skipped ${f}: ${(e as Error).message}`);
    }
  }
  return out;
}

import { planLineItems, type HeldCase } from "./lineItems.js";
import { makeBulkExec, resolveVbuWorkspace, vbuSkipReason } from "./vendorBulk.js";

export interface TestCaseRecord {
  id: string;
  feature: string;
  title: string;
  type: string;
  priority: string;
  severity: string;
  preconditions?: string;
  steps?: string[];
  method: string;
  path: string;
  body?: any;
  expected: "accept" | "reject" | "no-5xx";
  expectedResult: string;
  rationale?: string;
  /**
   * Why this case's verdict is weaker than the outcome it documents.
   *
   * Set on a case that describes a refusal while sending the endpoint's
   * generic valid payload: the API is right to accept it, so the only honest
   * assertion left is "no untyped 500". The report prints this next to the
   * documented result, so a pass is never read as proof the refusal works.
   */
  weakReason?: string;
  /**
   * Why this case cannot be run here, written by whoever produced it.
   *
   * Set on a case whose perturbation needs state the public API cannot build
   * in one run — a superseded version, an attachment owned by another company.
   * The case stays in the library and is reported as not-run with this reason,
   * because "we cannot set this up" is a true statement about our coverage and
   * "the product accepted it" would be a false one about the product.
   */
  notRunnable?: string;
  /**
   * Vendor bulk upload cases (data/api-cases-extra/vbu.json): the fixture to
   * send and what each staged row must become. Run by vendorBulk.ts.
   */
  bulk?: import("./vendorBulk.js").BulkSpec;
  /** QA-document case ids this case covers (vendor bulk upload: the PR's QA doc, A1…D7) */
  qaDoc?: string[];
  /** file:line of the rule the case exercises */
  rule?: string;
  /** where a written spec and the code disagree */
  disagree?: string;
  tier?: string;
}

/**
 * Cases whose request body is a SUMMARY of the real payload, not the payload.
 *
 * `POST /trade/template_input` takes `widgets` + `data` + a ~30-field
 * `configurations` block, built from a live template, product, location and
 * timing. These cases send four scalars — `{event_group_uuid, stage_no,
 * rfx_mode, title}` — which the endpoint cannot resolve into a trade, so it
 * answers 422 "Order not active" every time. Verified against a real, active
 * event: the status is about the body, not the event.
 *
 * They cannot pass, cannot fail meaningfully, and reported as "couldn't tell"
 * on every run. So they are held out of runs and reported as not-run with the
 * reason, rather than firing a request whose answer is known in advance to be
 * uninformative.
 *
 * This is a quarantine, not a delete: the cases stay in the library, and the
 * moment their bodies are built from `buildPricingStageBody` (perturbing only
 * the dimension each one is about) they run again by dropping this list.
 */
const BODY_IS_A_PARAPHRASE = /\/trade\/template_input|\/event_groups\/update_egli/;

/** True for a case whose request body is a summary of the payload, not the payload. */
function bodyIsAParaphrase(c: TestCaseRecord): boolean {
  return BODY_IS_A_PARAPHRASE.test(String(c.path).split("?")[0]);
}

let CACHE: TestCaseRecord[] | null = null;
let HELD: TestCaseRecord[] = [];

/**
 * Cases held out of the product entirely — not run, not counted, not listed.
 *
 * A case whose body is a paraphrase of the real payload (see
 * BODY_IS_A_PARAPHRASE below) cannot run and cannot be made to run by anything
 * a reader of the dashboard can do. Leaving them in meant every event type
 * advertised ~23 tests nobody could execute, and every run's "what wasn't
 * checked" list opened with the same 23-case blockage and the same paragraph
 * of explanation — a permanent fixture of the report that told a reader
 * nothing new and hid the blockages they could actually clear.
 *
 * They stay in `data/api-cases.json`: this is a filter on what the UI offers,
 * not a delete. Rebuild their bodies from the verified stage builder and drop
 * the pattern, and they come back everywhere at once. `heldCases()` says what
 * is behind the filter for anyone who asks.
 */
export function heldCases(): TestCaseRecord[] {
  loadCases();
  return HELD;
}

/** Load the library from disk (cached). Returns [] if it hasn't been built yet. */
export function loadCases(): TestCaseRecord[] {
  if (CACHE) return CACHE;
  if (!existsSync(LIB_PATH)) {
    CACHE = [];
    return CACHE;
  }
  try {
    const parsed = JSON.parse(readFileSync(LIB_PATH, "utf8"));
    const base: TestCaseRecord[] = Array.isArray(parsed) ? parsed : (parsed.cases ?? []);
    // The main library wins on an id clash; extra files only add.
    const seen = new Set(base.map((c) => c?.id));
    const list = [...base, ...readExtraCases().filter((c) => c?.id && !seen.has(c.id) && (seen.add(c.id), true))];
    const shaped = list.filter((c) => c && c.id && c.feature && c.path && c.method);
    HELD = shaped.filter(bodyIsAParaphrase);
    CACHE = shaped.filter((c) => !bodyIsAParaphrase(c));
    if (HELD.length) {
      console.log(
        `[caseLibrary] ${HELD.length} case(s) held out of the dashboard: their body is a ` +
          `paraphrase of the real payload, so they cannot run as written. They remain in ` +
          `${LIB_PATH}.`,
      );
    }
    if (list.length > 0 && shaped.length === 0) {
      // Every record was rejected: the file is a different shape than this
      // library expects. Say so once, loudly, instead of behaving as if the
      // product had no test cases.
      console.error(
        `[caseLibrary] ${LIB_PATH} holds ${list.length} record(s), none with the ` +
          `feature/method/path shape this library needs — is it the written catalog?`,
      );
    }
  } catch {
    CACHE = [];
  }
  return CACHE;
}

/** How many cases exist per feature id — drives the counts in the feature tree. */
export function caseCountsByFeature(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of loadCases()) out[c.feature] = (out[c.feature] ?? 0) + 1;
  return out;
}

/**
 * Per feature, how many of its cases actually send line items.
 *
 * The "line items per event" field is only meaningful over cases that build an
 * event, and which those are is a property of the case data — so it is counted
 * from the data rather than from a hand-kept list of features that would drift
 * the first time a case was added. The UI shows the field when the current
 * selection has any, and says how many it can reach.
 */
export function lineItemCaseCountsByFeature(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of loadCases()) {
    if (!c.body || !Array.isArray((c.body as Record<string, unknown>).line_items)) continue;
    out[c.feature] = (out[c.feature] ?? 0) + 1;
  }
  return out;
}

/**
 * THE ORDER A RUN FIRES ITS CASES IN — functional first, within each feature.
 *
 * A functional case is the one that CREATES the thing everything else acts on:
 * "Create draft event group as the seed for an RFQ-only event" is functional,
 * and 46 of that feature's 49 cases address the event group it produces. In
 * library order that seed sat at position 47, so those 46 ran against an event
 * that did not exist yet and every one of them came back 422 "Order not
 * active" — a whole suite reporting green while testing nothing.
 *
 * Feature grouping is preserved (the journey is still the spine), and inside a
 * feature the original order is kept for everything that is not functional, so
 * this only lifts the creates to the front rather than reshuffling the suite.
 */
const PARAPHRASE_REASON =
  "the request body in this case is a summary of the real payload, not the payload — " +
  "POST /trade/template_input needs widgets, data and a full configurations block built from a live " +
  "template. Sent as written it always answers 422 \"Order not active\", which proves nothing. " +
  "Held out of the run until its body is built from the verified stage builder.";

/**
 * Cases that expect a refusal while sending the untouched happy-path request.
 *
 * The written cases were imported from prose. The importer decides the endpoint
 * from the narrative and fills a body whose SHAPE that endpoint accepts — one
 * generic body per endpoint — and it reads the verdict from the prose ("…is
 * refused" → expect a rejection). What it cannot do is apply the change the
 * case is actually about: "omit `status`", "PATCH with 501 uuids", "PATCH a
 * fabricated id". So the request that goes out is the valid one, the API quite
 * correctly answers 200, and the run reports "ACCEPTED input that should have
 * been rejected" — a failure that says nothing about the product and everything
 * about us.
 *
 * They are found rather than listed: a case expecting a refusal whose request
 * is byte-identical (bar the generated title) to a sibling case that expects
 * the request to WORK is, by construction, not sending anything that could be
 * refused. Computed over the whole library so it holds however few cases a run
 * happens to pick.
 *
 * As with the paraphrase quarantine above, this is not a delete: give the case
 * its own body or path — the perturbation the prose describes — and it drops
 * out of this set and runs for real.
 */
let BORROWED: Map<string, string> | null = null;

function borrowedRequests(): Map<string, string> {
  if (BORROWED) return BORROWED;
  const reasons = new Map<string, string>();
  const all = loadCases();
  // Titles carry a generated `QA_Platform_<case>_<stamp>` name, which differs
  // per case and says nothing about what is being tested.
  const shape = (c: TestCaseRecord) =>
    `${c.method} ${c.path} ${JSON.stringify(c.body ?? null).replace(/QA_Platform_[A-Za-z0-9_{}]+/g, "T")}`;
  const byShape = new Map<string, TestCaseRecord[]>();
  for (const c of all) {
    const key = shape(c);
    byShape.set(key, [...(byShape.get(key) ?? []), c]);
  }
  for (const c of all) {
    if (c.expected !== "reject") continue;
    const twin = (byShape.get(shape(c)) ?? []).find((o) => o.id !== c.id && o.expected !== "reject");
    if (!twin) continue;
    reasons.set(
      c.id,
      `this case expects a refusal, but the request it sends is the same valid one as ` +
        `${twin.id} ("${twin.title}") — the change it describes (${
          c.steps?.[0]?.replace(/^\d+\.\s*/, "").replace(/[.`]/g, "").trim() ?? "see its steps"
        }) is not in the payload. Running it would report the API accepting a request nobody ` +
        `perturbed. Give the case its own body or path and it runs.`,
    );
  }
  BORROWED = reasons;
  return BORROWED;
}

/** Why this case cannot produce an informative result as written, if it cannot. */
export function unrunnableReason(c: TestCaseRecord): string | null {
  if (c.notRunnable) return c.notRunnable;
  // Paraphrased bodies do not reach a run at all — `loadCases` holds them back
  // — but a caller handing one in directly still gets the truth about it.
  if (bodyIsAParaphrase(c)) return PARAPHRASE_REASON;
  return borrowedRequests().get(c.id) ?? null;
}

/** True when this case cannot produce an informative result as written. */
export function isUnrunnableAsWritten(c: TestCaseRecord): boolean {
  return unrunnableReason(c) !== null;
}

export function orderForRun(cases: TestCaseRecord[]): TestCaseRecord[] {
  const featureOrder = new Map<string, number>();
  for (const c of cases) if (!featureOrder.has(c.feature)) featureOrder.set(c.feature, featureOrder.size);
  const rank = (c: TestCaseRecord) => (c.type === "Functional" ? 0 : 1);
  return cases
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        featureOrder.get(a.c.feature)! - featureOrder.get(b.c.feature)! ||
        rank(a.c) - rank(b.c) ||
        a.i - b.i,
    )
    .map((x) => x.c);
}

export function casesForFeatures(featureIds: string[]): TestCaseRecord[] {
  const want = new Set(featureIds);
  return orderForRun(loadCases().filter((c) => want.has(c.feature)));
}

/** Who is actually making the requests in this run. */
export interface Actor {
  role?: string;
  email?: string;
}

/**
 * Read the acting user's role from the live session. Cases state which kind of
 * user they need ("a caller whose role is member or manager"), and a case run by
 * the wrong kind of user proves nothing — see actorRequirementOf().
 */
export async function resolveActor(client: Client): Promise<Actor> {
  try {
    const cfg: any = await client.ctx.buyerApi.get("/v1/dashboard_configuration");
    const u = cfg?.user ?? cfg?.data?.user ?? cfg;
    return { role: u?.role, email: u?.email };
  } catch {
    return {};
  }
}

/**
 * What kind of actor a case needs, inferred from its own preconditions text.
 *
 * This matters because of a real false positive we hit: USR-CRT-010 asserts that
 * a MEMBER or MANAGER cannot create a super_admin. Run as a super_admin — who is
 * legitimately allowed to do exactly that — it "failed" and looked like a
 * privilege-escalation bug. It wasn't; the precondition simply wasn't met.
 *
 * Deliberately conservative: it only claims a requirement when the wording is
 * unambiguous, because wrongly skipping a real test is its own kind of failure.
 */
export function actorRequirementOf(preconditions?: string): { needs: string; roles?: string[]; unauth?: boolean } | null {
  if (!preconditions) return null;
  const p = preconditions.toLowerCase();

  if (/no session token|no auth headers|unauthenticated/.test(p)) return { needs: "an unauthenticated caller", unauth: true };

  // Negative forms first — "is not super_admin" contains "super_admin".
  if (/not super_?admin|is not a super_?admin/.test(p))
    return { needs: "a caller who is NOT a super_admin", roles: ["member", "manager", "admin", "quality_check"] };

  if (/role is member or manager|member or manager\b/.test(p)) return { needs: "a member or manager", roles: ["member", "manager"] };
  if (/whose users\.role is super_?admin|is super_?admin/.test(p)) return { needs: "a super_admin", roles: ["super_admin"] };

  return null;
}

/**
 * Some cases only hold true when a particular setting is ON — for example
 * MD-PRD-006 ("blank product_code is refused") is only correct when
 * `article_code_mandatory_on_product_create` is enabled. With that flag OFF,
 * accepting a blank code is the CORRECT behaviour, and reporting it as a bug is
 * a false positive (we made exactly that mistake before adding this).
 *
 * The cases already state their setting in `preconditions`, so instead of
 * re-annotating 283 cases we look for any snake_case token in the precondition
 * text that matches a real flag key for this company. Conservative by design:
 * a token we can't match against a live flag is ignored.
 */
export interface ConfigRequirement {
  flag: string;
  /** The state the flag must be in for this case's expected outcome to hold. */
  mustBe: "on" | "off";
}

/** Words that turn "this case needs the flag" into "this case needs it OFF". */
const NEGATED =
  /\b(not set|not enabled|not have|isn't|is not|is NOT|does not|doesn't|without|unset|off|switched off|turned off|disabled|absent|missing|returns false|false)\b/i;

export function configRequirementOf(
  preconditions: string | undefined,
  flags: Record<string, any>,
): ConfigRequirement | null {
  if (!preconditions) return null;
  for (const token of preconditions.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/g) ?? []) {
    const key = token.replace(/\?$/, "");
    if (!(key in flags)) continue;
    // POLARITY MATTERS, AND IT USED TO BE IGNORED.
    //
    // "a workspace where boq_in_erfx_allowed is NOT set" is the premise of a
    // case that expects a REFUSAL. Read as "needs the flag on", it was skipped
    // in exactly the workspaces where it applies, and run — and failed — in the
    // ones where the product was right to accept the request. So the clause the
    // flag sits in decides which way round the requirement is. Scoped to the
    // clause, not the whole precondition, because one sentence often states a
    // second condition that is negative about something else entirely.
    const clause =
      preconditions
        .split(/[;.]|\band\b/i)
        .find((part) => part.includes(token)) ?? preconditions;
    return { flag: key, mustBe: NEGATED.test(clause) ? "off" : "on" };
  }
  return null;
}

/**
 * Resolve the {{placeholders}} a case can reference, by reading real ids out of
 * the live client. Every lookup is a READ and every one is individually
 * optional: if a lookup fails or the client simply has no such record, the token
 * stays unresolved and any case needing it is reported as skipped-with-reason
 * rather than fired with a bad value.
 */
export async function resolveCaseContext(
  client: Client,
  opts: { allowExistingRecordWrites?: boolean } = {},
): Promise<DynamicContext> {
  const api = client.ctx.buyerApi;
  const ctx: DynamicContext = {
    productUuid: client.ctx.catalog?.productUuid,
    productQualityUuid: client.ctx.catalog?.productQualityUuid,
    locationUuid: client.ctx.catalog?.locationUuid,
    stamp: String(Date.now()),
  };
  const tryGet = async (path: string): Promise<any> => {
    try {
      return await api.get(path);
    } catch {
      return null;
    }
  };
  const firstId = (o: any) => o?.uuid ?? o?.id ?? undefined;

  // Six independent reads; fired together, they take as long as the slowest
  // one instead of the sum — this was six and a half seconds in series.
  const [prs, vendors, cats, cities, teams, users]: any[] = await Promise.all([
    tryGet("/purchase_requests?page=1"),
    tryGet("/companies/all_vendors?page=1"),
    tryGet("/product_categories/search?query=&show_in_active=true"),
    tryGet("/cities/autocomplete?query=mu&additional_fields=countries"),
    tryGet("/teams/get_all?only_team_names=true"),
    tryGet(`/get_all_users?filters=${encodeURIComponent('{"statuses":["active"]}')}`),
  ]);

  // A purchase request and one of its line items.
  const prList = prs?.purchase_requests ?? prs?.data ?? [];
  const pr = Array.isArray(prList) ? prList[0] : undefined;
  if (pr) {
    ctx.prId = firstId(pr);
    const items = pr.line_items ?? pr.purchase_request_items ?? [];
    if (Array.isArray(items) && items[0]) ctx.prItemId = firstId(items[0]);
  }

  // A vendor company this buyer actually deals with.
  const vList = vendors?.companies ?? vendors?.data ?? [];
  const vendor = Array.isArray(vList) ? vList[0] : undefined;
  if (vendor) {
    ctx.vendorUuid = vendor.uuid;
    ctx.vendorCompanyId = vendor.id ?? vendor.company_id;
  }

  // A category and a family (families are what products hang off).
  const cList = cats?.data ?? cats?.product_categories ?? (Array.isArray(cats) ? cats : []);
  if (Array.isArray(cList)) {
    const cat = cList.find((c: any) => c?.hierarchy_type === "category") ?? cList[0];
    const fam = cList.find((c: any) => c?.hierarchy_type === "family");
    if (cat) ctx.categoryUuid = firstId(cat);
    if (fam) ctx.familyUuid = firstId(fam);
  }

  // A city (locations need one).
  const cityList = cities?.cities ?? cities?.data ?? (Array.isArray(cities) ? cities : []);
  if (Array.isArray(cityList) && cityList[0]) ctx.cityUuid = firstId(cityList[0]);

  // A team and a user in this workspace.
  const tList = teams?.teams ?? teams?.data ?? (Array.isArray(teams) ? teams : []);
  if (Array.isArray(tList) && tList[0]) ctx.teamUuid = firstId(tList[0]);

  const uList = users?.users ?? users?.data ?? (Array.isArray(users) ? users : []);
  if (Array.isArray(uList) && uList[0]) ctx.userUuid = firstId(uList[0]);

  // Vendor bulk upload settings, straight from the configuration tables — most
  // of them (allow_contactless_vendor_upload, vendor_duplicate_check_fields)
  // are not in the dashboard configuration the other gates read.
  if (typeof client.ctx.companyId === "number") ctx.vbu = await resolveVbuWorkspace(client.ctx.companyId);

  // ── DELIBERATELY GATED ──────────────────────────────────────────────────
  // tradeId / proposalUuid / bidUuid identify REAL, LIVE business records — an
  // actual award proposal, an actual bid. Bidding and awarding cases POST and
  // PATCH against them, and while they are all written as negatives, "expected
  // to be rejected" is a hypothesis, not a guarantee: a case like "award exactly
  // the remaining quantity" would, if it succeeded, award real business.
  //
  // So we do NOT resolve these by default. Cases needing them are reported as
  // skipped-with-reason, which is honest, instead of quietly firing writes at
  // live records. Turn this on only against a genuinely disposable environment.
  if (opts.allowExistingRecordWrites) {
    const orders: any = await tryGet("/orders");
    const oList = orders?.data ?? orders?.orders ?? (Array.isArray(orders) ? orders : []);
    const order = Array.isArray(oList) ? oList[0] : undefined;
    if (order) {
      if (order.event_details?.event_uuid) ctx.tradeId = order.event_details.event_uuid;
      if (order.event_group?.uuid) ctx.eventGroupUuid = order.event_group.uuid;
      if (order.proposal_uuid) ctx.proposalUuid = order.proposal_uuid;
      if (order.vendor_firm_uuid) ctx.vendorUuid = order.vendor_firm_uuid;
      // The order IS the purchase order — a real financial document.
      if (order.uuid) ctx.orderUuid = ctx.poUuid = order.uuid;
    }
  }

  return ctx;
}

/**
 * Turn library cases into runnable checks, applying the SAME safety gate the
 * AI-generated checks go through (allowlisted endpoints only, sandbox naming,
 * no unresolved placeholders). Cases that can't run are returned as `skipped`
 * with the reason — never silently dropped.
 */
export function buildChecksFromCases(
  client: Client,
  cases: TestCaseRecord[],
  ctx: DynamicContext = {},
  actor: Actor = {},
  /** How many line items events created by this run should carry. */
  options: { lineItems?: number } = {},
): {
  checks: Check[];
  skipped: { id: string; title: string; reason: string }[];
  /** What the line-item count actually did to this case set. */
  lineItems: { requested?: number; eligible: number; expanded: number; held: HeldCase[] };
  /**
   * Cases blocked ONLY on a record an earlier case creates.
   *
   * These are not unrunnable — they are waiting. The RFQ set creates an event
   * group in its first case and needs its uuid in the next two, and resolving
   * every placeholder before the run meant those two (including the SQL
   * injection case) were skipped every single time.
   */
  deferred: { record: TestCaseRecord; needs: string[] }[];
} {
  const fullCtx: DynamicContext = {
    productUuid: client.ctx.catalog?.productUuid,
    productQualityUuid: client.ctx.catalog?.productQualityUuid,
    locationUuid: client.ctx.catalog?.locationUuid,
    stamp: String(Date.now()),
    ...ctx,
  };
  const checks: Check[] = [];
  const skipped: { id: string; title: string; reason: string }[] = [];
  const deferred: { record: TestCaseRecord; needs: string[] }[] = [];

  // Worked out once, over the whole set, so the run can say how many cases the
  // requested count reached and which kept their own — see `lineItems.ts`.
  const lineItemPlan = planLineItems(cases, options.lineItems);

  /**
   * Pull the exact server message out of a case's documented expectedResult.
   * Cases quote it, e.g. ...error.code 862 'Items cannot be closed as they have
   * no open quantity.' We use it to prove the check was refused for the reason
   * it claims, instead of any reason at all.
   */
  const expectedMessageOf = (expectedResult: string): string | undefined => {
    const quoted = expectedResult.match(/'([^']{12,120})'/);
    if (!quoted) return undefined;
    const msg = quoted[1].trim();
    // Must look like a sentence, not a config key or an identifier.
    if (!msg.includes(" ") || /^[a-z_]+$/.test(msg)) return undefined;
    return msg.replace(/\.$/, "");
  };

  for (const c of cases) {
    // Known-uninformative as written — a paraphrased body, a borrowed request,
    // or state we cannot build. Reported as not-run with the reason, never
    // fired: a request nobody perturbed cannot refuse anything, and reporting
    // its 200 as a failure would put a bug on the product for our mistake.
    const cannotRun = unrunnableReason(c);
    if (cannotRun) {
      skipped.push({ id: c.id, title: c.title, reason: cannotRun });
      continue;
    }

    // Does this case need a different kind of user than the one we're running as?
    // If so, running it would prove nothing — and, worse, a case like "a member
    // must NOT be able to create a super_admin" would actually CREATE one when
    // run as a super_admin. Skip it and say why.
    const need = actorRequirementOf(c.preconditions);
    if (need && actor.role) {
      const mismatch = need.unauth || (need.roles && !need.roles.includes(actor.role));
      if (mismatch) {
        skipped.push({
          id: c.id,
          title: c.title,
          reason: `needs ${need.needs}; this run is authenticated as "${actor.role}"${
            actor.email ? ` (${actor.email})` : ""
          } — running it would not test what the case claims`,
        });
        continue;
      }
    }

    // Vendor bulk upload: gated on the workspace's own settings and on what the
    // case would create, then run by the bulk runner (see vendorBulk.ts).
    if (c.bulk) {
      const why = vbuSkipReason(c.bulk, fullCtx.vbu, {
        realMail: fullCtx.vbuRealMail,
        creates: fullCtx.vbuCreate,
        hasUser: typeof (client.ctx as any).buyerUserId === "number",
      });
      if (why) {
        skipped.push({ id: c.id, title: c.title, reason: why });
        continue;
      }
    }
    const caseCtx: DynamicContext =
      c.bulk?.fixture ? { ...fullCtx, vbuSheet: `<base64 of procol test/fixtures/vendor-bulk-upload/${c.bulk.fixture}, filled per run>` } : fullCtx;

    const spec: DynamicSpec = {
      scenario: c.title,
      method: c.method,
      path: c.path,
      // The requested line-item count, where this case could take it.
      body: lineItemPlan.bodies.get(c.id) ?? c.body,
      expected: c.expected,
      category: c.type,
      severity: c.severity,
      rationale: c.rationale ?? "",
    };
    // curated=true — these cases were reviewed against the source, so they may
    // use the wider ALLOW_CURATED endpoint list that AI-generated checks cannot.
    const { check, reason } = gate(spec, caseCtx, client, c.feature, c.id, c.feature, true);
    if (check && c.bulk && (c.bulk.kind !== "http" || c.bulk.actor)) {
      check.exec = makeBulkExec(c.bulk, String(fullCtx.stamp), c.id, {
        method: c.method,
        path: c.path,
        expectedResult: c.expectedResult,
        rule: c.rule,
        qaDoc: c.qaDoc,
        steps: c.steps,
      });
      delete check.weakenedTo5xxOnly;
      (check as any).bulkTier = c.bulk.tier;
    }
    if (check) {
      // Only meaningful for reject cases — that's where "right reason" matters.
      if (c.expected === "reject") check.expectMessage = expectedMessageOf(c.expectedResult);
      // Carry the documentation through so the UI can show steps/expected result.
      (check as any).expectedResult = c.expectedResult;
      (check as any).steps = c.steps;
      (check as any).preconditions = c.preconditions;
      if (c.weakReason) (check as any).weakReason = c.weakReason;
      checks.push(check);
    } else {
      // Waiting on a record, or genuinely unrunnable? Only the first is worth
      // retrying once earlier cases in this run have created something.
      const waiting = reason?.match(/^unresolved placeholder\(s\):\s*(.+)$/);
      if (waiting) {
        deferred.push({ record: c, needs: waiting[1].split(",").map((n) => n.trim()).filter(Boolean) });
      } else {
        skipped.push({ id: c.id, title: c.title, reason: reason ?? "not runnable here" });
      }
    }
  }
  return {
    checks,
    skipped,
    deferred,
    lineItems: {
      requested: options.lineItems,
      eligible: lineItemPlan.eligible,
      expanded: lineItemPlan.expanded,
      held: lineItemPlan.held,
    },
  };
}

/**
 * The ids a reply hands to the cases that follow it.
 *
 * `POST /event_groups` answering with a uuid provides `eventGroupUuid`; the
 * next case's `{{eventGroupUuid}}` then resolves. The name is derived from the
 * endpoint rather than a hand-written table, so a new creating endpoint feeds
 * the cases after it without anyone wiring it up.
 */
export function idsFromReply(path: string, data: unknown): DynamicContext {
  const uuid = findUuid(data);
  if (!uuid) return {};
  const segments = String(path).split("?")[0].split("/").filter(Boolean);
  // Skip a trailing id so /event_groups/<uuid> is still named after the collection.
  const resource = segments.reverse().find((seg) => /^[a-z][a-z_]*$/.test(seg)) ?? "";
  if (!resource) return {};
  const singular = resource.replace(/s$/, "");
  const camel = singular.replace(/_([a-z])/g, (_m, ch) => ch.toUpperCase());
  if (!camel) return {};
  return { [`${camel}Uuid`]: uuid };
}

/** The first uuid-looking value in a reply, however the API wraps it. */
function findUuid(data: unknown, depth = 0): string | undefined {
  if (depth > 4 || !data || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  for (const key of ["uuid", "id", "event_group_uuid", "order_uuid"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length >= 6) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findUuid(v, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}
