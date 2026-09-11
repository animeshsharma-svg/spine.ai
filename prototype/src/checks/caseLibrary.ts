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
import { readFileSync, existsSync } from "node:fs";
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
}

let CACHE: TestCaseRecord[] | null = null;

/** Load the library from disk (cached). Returns [] if it hasn't been built yet. */
export function loadCases(): TestCaseRecord[] {
  if (CACHE) return CACHE;
  if (!existsSync(LIB_PATH)) {
    CACHE = [];
    return CACHE;
  }
  try {
    const parsed = JSON.parse(readFileSync(LIB_PATH, "utf8"));
    const list: TestCaseRecord[] = Array.isArray(parsed) ? parsed : (parsed.cases ?? []);
    CACHE = list.filter((c) => c && c.id && c.feature && c.path && c.method);
    if (list.length > 0 && CACHE.length === 0) {
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

export function casesForFeatures(featureIds: string[]): TestCaseRecord[] {
  const want = new Set(featureIds);
  return loadCases().filter((c) => want.has(c.feature));
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
export function configRequirementOf(preconditions: string | undefined, flags: Record<string, any>): string | null {
  if (!preconditions) return null;
  for (const token of preconditions.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/g) ?? []) {
    const key = token.replace(/\?$/, "");
    if (key in flags) return key;
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

  // A purchase request and one of its line items.
  const prs: any = await tryGet("/purchase_requests?page=1");
  const prList = prs?.purchase_requests ?? prs?.data ?? [];
  const pr = Array.isArray(prList) ? prList[0] : undefined;
  if (pr) {
    ctx.prId = firstId(pr);
    const items = pr.line_items ?? pr.purchase_request_items ?? [];
    if (Array.isArray(items) && items[0]) ctx.prItemId = firstId(items[0]);
  }

  // A vendor company this buyer actually deals with.
  const vendors: any = await tryGet("/companies/all_vendors?page=1");
  const vList = vendors?.companies ?? vendors?.data ?? [];
  const vendor = Array.isArray(vList) ? vList[0] : undefined;
  if (vendor) {
    ctx.vendorUuid = vendor.uuid;
    ctx.vendorCompanyId = vendor.id ?? vendor.company_id;
  }

  // A category and a family (families are what products hang off).
  const cats: any = await tryGet("/product_categories/search?query=&show_in_active=true");
  const cList = cats?.data ?? cats?.product_categories ?? (Array.isArray(cats) ? cats : []);
  if (Array.isArray(cList)) {
    const cat = cList.find((c: any) => c?.hierarchy_type === "category") ?? cList[0];
    const fam = cList.find((c: any) => c?.hierarchy_type === "family");
    if (cat) ctx.categoryUuid = firstId(cat);
    if (fam) ctx.familyUuid = firstId(fam);
  }

  // A city (locations need one).
  const cities: any = await tryGet("/cities/autocomplete?query=mu&additional_fields=countries");
  const cityList = cities?.cities ?? cities?.data ?? (Array.isArray(cities) ? cities : []);
  if (Array.isArray(cityList) && cityList[0]) ctx.cityUuid = firstId(cityList[0]);

  // A team and a user in this workspace.
  const teams: any = await tryGet("/teams/get_all?only_team_names=true");
  const tList = teams?.teams ?? teams?.data ?? (Array.isArray(teams) ? teams : []);
  if (Array.isArray(tList) && tList[0]) ctx.teamUuid = firstId(tList[0]);

  const users: any = await tryGet(`/get_all_users?filters=${encodeURIComponent('{"statuses":["active"]}')}`);
  const uList = users?.users ?? users?.data ?? (Array.isArray(users) ? users : []);
  if (Array.isArray(uList) && uList[0]) ctx.userUuid = firstId(uList[0]);

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
): { checks: Check[]; skipped: { id: string; title: string; reason: string }[] } {
  const fullCtx: DynamicContext = {
    productUuid: client.ctx.catalog?.productUuid,
    productQualityUuid: client.ctx.catalog?.productQualityUuid,
    locationUuid: client.ctx.catalog?.locationUuid,
    stamp: String(Date.now()),
    ...ctx,
  };
  const checks: Check[] = [];
  const skipped: { id: string; title: string; reason: string }[] = [];

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

    const spec: DynamicSpec = {
      scenario: c.title,
      method: c.method,
      path: c.path,
      body: c.body,
      expected: c.expected,
      category: c.type,
      severity: c.severity,
      rationale: c.rationale ?? "",
    };
    // curated=true — these cases were reviewed against the source, so they may
    // use the wider ALLOW_CURATED endpoint list that AI-generated checks cannot.
    const { check, reason } = gate(spec, fullCtx, client, c.feature, c.id, c.feature, true);
    if (check) {
      // Only meaningful for reject cases — that's where "right reason" matters.
      if (c.expected === "reject") check.expectMessage = expectedMessageOf(c.expectedResult);
      // Carry the documentation through so the UI can show steps/expected result.
      (check as any).expectedResult = c.expectedResult;
      (check as any).steps = c.steps;
      (check as any).preconditions = c.preconditions;
      checks.push(check);
    } else {
      skipped.push({ id: c.id, title: c.title, reason: reason ?? "not runnable here" });
    }
  }
  return { checks, skipped };
}
