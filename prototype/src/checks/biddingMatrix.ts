/**
 * THE BIDDING MATRIX — several vendors, surrogate bids and the clock.
 *
 * The single-vendor journey (eventJourney.ts) proves a buyer can run one
 * round with one vendor. The owner's questions need more than that: do
 * invites reach several vendors, can each bid through their own portal, can
 * the buyer bid on a vendor's behalf (and when not), does the technical
 * round's end stay inside the pricing round's end, is a bid refused once the
 * submission time is over, does extending the time let bids in again, and is
 * evaluation allowed only in evaluation time.
 *
 * Each combination (M1…M15, docs/phase3-bidding-matrix.md §6) builds its own
 * event on a short clock with the QA vendors (matrixVendors.ts), then walks
 * steps whose expectation is written BEFORE the request fires:
 *
 *   accept   — the app should do it                      (2xx = pass)
 *   refuse   — the app should say no with one of these
 *              codes (33, 96, 99, 737, 712, 508, 801…)   (that refusal = pass)
 *   either   — both are legitimate outcomes; the record says which happened
 *   probe    — a SUSPECTED defect from code reading; the reply decides
 *              "confirmed" or "not confirmed"
 *
 * A 5xx is always a defect. No reply after the bounded retries is
 * "inconclusive", never a pass. A step whose inputs an earlier step failed to
 * produce is "skipped" with the reason.
 *
 * Vendor actions go through the vendor app's API as the vendor's own login —
 * what the supplier portal itself calls. No browser.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST, openClientContext } from "../executor.js";
import { redactSecrets } from "./engine.js";
import { backoffMs, rankUnits, unitListed } from "./resilience.js";
import { listQaVendors, vendorClient, type QaVendor } from "./matrixVendors.js";

// ── what a run records ─────────────────────────────────────────────────────

export type MatrixVerdict = "pass" | "fail" | "defect" | "inconclusive" | "skipped";

export type Expect =
  | { accept: true }
  | { refuse: string[] }
  | { either: string[] } // "ok" for a 2xx, or app codes
  | { probe: string; defectIf: "accepted" | "refused" };

export interface MatrixStep {
  n: number;
  title: string;
  actor: string;
  /** the plain-English expectation, written before the request */
  expected: string;
  /** what happened, in words */
  actual: string;
  verdict: MatrixVerdict;
  /** for a probe: whether the suspected defect showed */
  probe?: { id: string; confirmed?: boolean };
  // details (collapsible in the UI)
  call?: { method: string; path: string; body?: unknown };
  status?: number;
  code?: string;
  message?: string;
  expect?: string;
  tries?: number;
  ms: number;
  at: string;
}

export interface ComboResult {
  id: string;
  title: string;
  why: string;
  companyId: number;
  company: string;
  verdict: MatrixVerdict;
  steps: MatrixStep[];
  counts: Record<MatrixVerdict, number>;
  notes: string[];
  eventGroupUuid?: string;
  startedAt: string;
  durationMs: number;
}

export interface ProbeResult {
  id: string;
  title: string;
  combo: string;
  companyId: number;
  confirmed?: boolean;
  reply: string;
}

export interface MatrixRunOptions {
  /** which combinations (default: every one defined for this client) */
  combos?: string[];
  /** vendors per event, where the combination allows a choice (default per combination) */
  vendorCount?: number;
  /** surrogate pattern for the configurable combination (MX): none | first | all */
  surrogate?: "none" | "first" | "all";
  /** timing pattern for MX: normal | pre-start | extra-close | after-close | extend */
  timing?: "normal" | "pre-start" | "extra-close" | "after-close" | "extend";
  /** award pattern for MX: none | one | split */
  award?: "none" | "one" | "split";
  /** the template chooser's pick (Phase 2), an override of the catalog choice */
  choose?: { pricingTemplateUuid?: string; technicalTemplateUuid?: string; unit?: string; productUuid?: string; productQualityUuid?: string };
  baseURL?: string;
  onLine?: (line: string) => void;
  onStep?: (combo: string, step: MatrixStep) => void;
}

export interface MatrixRunResult {
  companyId: number;
  company: string;
  startedAt: string;
  durationMs: number;
  vendors: { n: number; name: string; email: string }[];
  combos: ComboResult[];
  probes: ProbeResult[];
}

// ── the sibling framework ──────────────────────────────────────────────────

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
let sib: Promise<{ bodies: any; Endpoints: any; resolveAlternatives?: (api: any) => Promise<any> }> | undefined;
function sibling() {
  sib ??= (async () => {
    const [bodies, ep] = await Promise.all([imp("flows/bodies.ts"), imp("api/endpoints.ts")]);
    const resolve = await imp("catalog/resolve.ts").catch(() => undefined);
    return { bodies, Endpoints: ep.Endpoints, resolveAlternatives: resolve?.resolveCatalogAlternatives };
  })();
  sib.catch(() => (sib = undefined));
  return sib;
}

// ── words and time ─────────────────────────────────────────────────────────

const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hhmmss = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A Procol uuid back to its database id (lib/encrypt_decrypt.rb decode_data):
 * base64 → each character's place in the key → digits rotated right by 3 →
 * (n − 1022) / 3. Used only to read our own QA records back with SELECT.
 */
export function decodeProcolId(uuid: string): number | undefined {
  const key = "gZckDpNXdQ";
  const digits = [...Buffer.from(uuid, "base64").toString("latin1")].map((ch) => key.indexOf(ch));
  if (!digits.length || digits.some((d) => d < 0)) return undefined;
  const n = Number([...digits.slice(-3), ...digits.slice(0, -3)].join(""));
  const id = (n - 1022) / 3;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** The reverse of decodeProcolId (encode_data): id·3 + 1022 → digits rotated left by 3 → key characters → base64. */
export function encodeProcolId(id: number): string {
  const key = "gZckDpNXdQ";
  const d = String(id * 3 + 1022).split("");
  return Buffer.from([...d.slice(3), ...d.slice(0, 3)].map((x) => key[Number(x)]).join(""), "latin1").toString("base64");
}

/** The first value of `key` anywhere in a reply (bounded depth). */
function findKey(o: any, key: string, depth = 0): any {
  if (!o || typeof o !== "object" || depth > 6) return undefined;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const x = findKey(v, key, depth + 1);
    if (x !== undefined) return x;
  }
  return undefined;
}

/** The scores this event accepts: keys of its evaluation_score_label_mapping (hidden ones left out). */
function scoreScale(data: any): { score: number; label: string }[] {
  const m = findKey(data, "evaluation_score_label_mapping");
  return (Array.isArray(m) ? m : [])
    .filter((x: any) => Number.isInteger(x?.score) && !x?.is_hidden)
    .map((x: any) => ({ score: Number(x.score), label: String(x.label ?? x.score) }))
    .sort((x: { score: number }, y: { score: number }) => x.score - y.score);
}

interface Timing {
  bst: number;
  bet: number;
  ect: number;
}

interface Reply {
  status: number;
  ok: boolean;
  data: any;
  code?: string;
  message?: string;
  tries: number;
  ms: number;
}

const SECRET_KEY = /otp|token|password|secret|authorization|cookie/i;
function redact(body: unknown): unknown {
  if (body === undefined || body === null) return body;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
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

const ENV_STATUS = new Set([0, 408, 429, 502, 503, 504]);

/** One request, never throws; an environment failure is tried again (bounded). */
async function send(api: any, method: string, path: string, body?: unknown): Promise<Reply> {
  const t = Date.now();
  let tries = 0;
  for (;;) {
    tries++;
    let r: Reply;
    try {
      const x = await Promise.race([
        api.attempt(method, path, body === undefined ? {} : { body }),
        sleep(60_000).then(() => ({ status: 0, ok: false, data: null, errorMessage: "no reply within 60 s" })),
      ]);
      r = { status: typeof x?.status === "number" ? x.status : 0, ok: !!x?.ok, data: x?.data, code: x?.errorCode !== undefined ? String(x.errorCode) : undefined, message: x?.errorMessage, tries, ms: 0 };
    } catch (e) {
      r = { status: 0, ok: false, data: null, message: e instanceof Error ? e.message : String(e), tries, ms: 0 };
    }
    if (!ENV_STATUS.has(r.status) || tries > 2) return { ...r, tries, ms: Date.now() - t };
    await sleep(backoffMs(tries));
  }
}

function describeExpect(e: Expect): string {
  if ("accept" in e) return "accept";
  if ("refuse" in e) return `refuse (${e.refuse.join(" / ")})`;
  if ("either" in e) return `either (${e.either.join(" / ")})`;
  return `probe ${e.probe} — a defect if ${e.defectIf}`;
}

function said(r: Reply): string {
  if (r.status === 0) return `no reply came back (${r.message ?? "network"})`;
  if (r.ok) return `the app accepted it (HTTP ${r.status})`;
  return `the app refused it: “${r.message ?? "no message"}” (HTTP ${r.status}${r.code ? `, code ${r.code}` : ""})`;
}

/** The verdict, decided only by the expectation and the reply — never by an LLM. */
export function judge(e: Expect, r: Reply): { verdict: MatrixVerdict; confirmed?: boolean } {
  if (r.status === 0) return { verdict: "inconclusive" };
  if (r.status >= 500) return { verdict: "defect", ...("probe" in e ? { confirmed: undefined } : {}) };
  if ("accept" in e) return { verdict: r.ok ? "pass" : "fail" };
  if ("refuse" in e) return { verdict: !r.ok && r.code !== undefined && e.refuse.includes(r.code) ? "pass" : "fail" };
  if ("either" in e) {
    const hit = r.ok ? e.either.includes("ok") : r.code !== undefined && e.either.includes(r.code);
    return { verdict: hit ? "pass" : "fail" };
  }
  const confirmed = e.defectIf === "accepted" ? r.ok : !r.ok;
  return { verdict: confirmed ? "fail" : "pass", confirmed };
}

// ── the bench: one combination's state and moves ───────────────────────────

interface Ctx {
  s: { bodies: any; Endpoints: any };
  buyerApi: any;
  companyId: number;
  company: string;
  evaluatorUuid?: string;
  /** the evaluator's phone as stored ("prefix/number"), for the one-time-code sign-in */
  evaluatorPhone?: string;
  cat: { productUuid: string; productQualityUuid: string; technicalTemplateUuid: string; pricingTemplateUuid: string; locationUuid: string; useRfqQuotes: boolean };
  unit: string;
  qty: number;
  vendors: QaVendor[];
  /** QA vendors of the OTHER workspace — companies this buyer does not deal with */
  strangers: QaVendor[];
  baseURL?: string;
  onLine: (l: string) => void;
  onStep?: (combo: string, step: MatrixStep) => void;
  probes: ProbeResult[];
  /** opens a fresh buyer session (the old one answered 401); returns the new client */
  reopenBuyer?: () => Promise<any | undefined>;
  buyerReopens: number;
}

interface Built {
  eg: string;
  line: string;
  trades: Partial<Record<"rfp" | "rfq" | "auction", string>>;
}

class Bench {
  steps: MatrixStep[] = [];
  notes: string[] = [];
  eventGroupUuid?: string;
  private apis = new Map<number, any>();
  private products = new Map<string, any>();
  private bids = new Map<string, string>();

  constructor(
    readonly c: Ctx,
    readonly combo: string,
  ) {}

  get B() {
    return this.c.s.bodies;
  }
  get E() {
    return this.c.s.Endpoints;
  }
  name(v: QaVendor) {
    return `QA vendor ${v.n}`;
  }

  /** Record one step. */
  push(st: Omit<MatrixStep, "n" | "at">): MatrixStep {
    const rec: MatrixStep = { n: this.steps.length + 1, at: new Date().toISOString(), ...st };
    this.steps.push(rec);
    this.c.onStep?.(this.combo, rec);
    const mark = { pass: "✓", fail: "✗", defect: "‼", inconclusive: "?", skipped: "–" }[rec.verdict];
    this.c.onLine(`  ${mark} ${this.combo}.${rec.n} ${rec.title} — ${rec.actual}`);
    return rec;
  }

  skip(title: string, actor: string, expected: string, reason: string): MatrixStep {
    return this.push({ title, actor, expected, actual: `Not run: ${reason}.`, verdict: "skipped", ms: 0 });
  }

  note(text: string) {
    this.notes.push(text);
    this.c.onLine(`  · ${text}`);
  }

  /** One decisive request with its expectation. */
  async step(o: {
    title: string;
    actor: string;
    expected: string;
    expect: Expect;
    api: any;
    method: string;
    path: string;
    body?: unknown;
    /** for an accepted reply: the sentence, and optionally a shortfall */
    ok?: (data: any) => { actual?: string; short?: string } | void;
    probeTitle?: string;
  }): Promise<{ rec: MatrixStep; reply: Reply }> {
    let reply = await send(o.api, o.method, o.path, o.body);
    // The buyer's web-console session can end under the run (shared with
    // other runs, or ended by the app): open a fresh one once and try again.
    if (reply.status === 401 && reply.code !== "app_error_auth_failed" && o.api === this.c.buyerApi && this.c.reopenBuyer && this.c.buyerReopens < 3) {
      const fresh = await this.c.reopenBuyer().catch(() => undefined);
      if (fresh) {
        this.c.buyerReopens++;
        this.note(`The buyer's session answered “${reply.message ?? "401"}”; a fresh session was opened and the request sent again.`);
        o = { ...o, api: fresh };
        reply = await send(fresh, o.method, o.path, o.body);
      }
    }
    let { verdict, confirmed } = judge(o.expect, reply);
    let actual = said(reply);
    if (reply.ok && o.ok) {
      const x = o.ok(reply.data) ?? {};
      if (x.actual) actual = x.actual;
      if (x.short && "accept" in o.expect) {
        verdict = "fail";
        actual = `The app answered success but ${x.short}.`;
      }
    }
    if ("refuse" in o.expect && reply.ok) actual = `The app ACCEPTED it, though it should have refused (${o.expect.refuse.join(" / ")}).`;
    if ("refuse" in o.expect && !reply.ok && verdict === "fail" && reply.status < 500 && reply.status > 0)
      actual = `Refused, but not for the expected reason: “${reply.message ?? "no message"}” (code ${reply.code ?? "none"}; expected ${o.expect.refuse.join(" / ")}).`;
    if ("probe" in o.expect) {
      actual = `${confirmed ? "Suspected defect CONFIRMED" : confirmed === false ? "Suspected defect not confirmed" : "Could not tell"} — ${said(reply)}.`;
      this.c.probes.push({ id: o.expect.probe, title: o.probeTitle ?? o.title, combo: this.combo, companyId: this.c.companyId, confirmed, reply: said(reply) });
    }
    const rec = this.push({
      title: o.title,
      actor: o.actor,
      expected: o.expected,
      actual: actual.charAt(0).toUpperCase() + actual.slice(1),
      verdict,
      ...("probe" in o.expect ? { probe: { id: o.expect.probe, confirmed } } : {}),
      call: { method: o.method, path: o.path, ...(o.body === undefined ? {} : { body: redact(o.body) }) },
      status: reply.status,
      code: reply.code,
      message: reply.message ? redactSecrets(reply.message) ?? reply.message : undefined,
      expect: describeExpect(o.expect),
      tries: reply.tries,
      ms: reply.ms,
    });
    return { rec, reply };
  }

  /** Wait until an epoch second (bounded to 6 minutes), with progress lines. */
  async until(sec: number, why: string): Promise<void> {
    const due = sec * 1000 - Date.now();
    if (due <= 0) return;
    const cap = Math.min(due, 6 * 60_000);
    this.c.onLine(`  … waiting ${Math.round(cap / 1000)} s until ${hhmmss(sec)} — ${why}`);
    const t0 = Date.now();
    while (Date.now() - t0 < cap) await sleep(Math.min(10_000, cap - (Date.now() - t0)));
  }

  // ── the buyer builds ──

  timing(startIn: number, openFor: number, extra: number): Timing {
    const bst = nowSec() + startIn;
    return { bst, bet: bst + openFor, ect: bst + openFor + extra };
  }

  /**
   * Draft → each round (its own audience and clock) → publish. Returns
   * undefined when the build did not get through (the reason is a step).
   * `publishExpect` lets a combination expect the publish to be refused (712).
   */
  async build(
    stages: Array<{ kind: "rfp" | "rfq" | "auction"; timing: Timing; audience: QaVendor[]; auctionConfig?: "rank" | "price"; /** adjust this QA round's own body (e.g. mark a field buyer-editable) */ tweak?: (body: any) => void }>,
    o: { title: string; publishExpect?: Expect; publishExpected?: string } ,
  ): Promise<Built | undefined> {
    const { c } = this;
    const draft = await this.step({
      title: "Create the draft event",
      actor: "buyer",
      expected: `A draft event is created with one line item (${c.qty} ${c.unit}).`,
      expect: { accept: true },
      api: c.buyerApi,
      method: "POST",
      path: this.E.eventGroups(),
      body: this.B.buildEventGroupBody({ productUuid: c.cat.productUuid, quantityUnit: c.unit, quantityValue: c.qty, productQualityUuid: c.cat.productQualityUuid }),
      ok: (d) => (d?.uuid && d?.event_group_line_item_ids?.[0] ? { actual: `Draft ${d.uuid} was created.` } : { short: "the reply carried no event or line item id" }),
    });
    if (draft.rec.verdict !== "pass") return undefined;
    const eg = String(draft.reply.data.uuid);
    const line = String(draft.reply.data.event_group_line_item_ids[0]);
    this.eventGroupUuid = eg;
    const trades: Built["trades"] = {};
    let no = 0;
    for (const st of stages) {
      no++;
      const audience = st.audience.map((v) => v.vendorCompanyUuid);
      const base =
        st.kind === "rfp"
          ? this.B.buildTechnicalStageBody({ eventGroupUuid: eg, lineItemUuid: line, evaluatorUuid: c.evaluatorUuid, vendorCompanyUuid: audience[0], technicalTemplateUuid: c.cat.technicalTemplateUuid, timing: st.timing, stageNo: no })
          : this.B.buildPricingStageBody({
              eventGroupUuid: eg, lineItemUuid: line, vendorCompanyUuid: audience[0], pricingTemplateUuid: c.cat.pricingTemplateUuid,
              productUuid: c.cat.productUuid, productQualityUuid: c.cat.productQualityUuid, locationUuid: c.cat.locationUuid,
              quantityValue: c.qty, quantityUnit: c.unit, timing: st.timing, stageNo: no,
              rfxMode: st.kind === "auction" ? "auction" : "rfq", ...(st.auctionConfig ? { auctionConfig: st.auctionConfig } : {}),
            });
      st.tweak?.(base);
      const label = { rfp: "technical round (RFP)", rfq: "pricing round (RFQ)", auction: "auction round" }[st.kind];
      const r = await this.step({
        title: `Add the ${label} for ${audience.length} vendor${audience.length === 1 ? "" : "s"}`,
        actor: "buyer",
        expected: `The ${label} is attached with ${st.audience.map((v) => this.name(v)).join(", ")} invited; bidding ${hhmmss(st.timing.bst)}–${hhmmss(st.timing.bet)}, extra closing time until ${hhmmss(st.timing.ect)}.`,
        expect: { accept: true },
        api: c.buyerApi,
        method: "POST",
        path: this.E.createTrade(),
        body: { ...base, audience_company_uuids: audience },
        ok: (d) => (d?.uuid ? { actual: `The ${label} was attached as ${d.uuid}.` } : { short: "the reply carried no round id" }),
      });
      if (r.rec.verdict !== "pass") return undefined;
      trades[st.kind] = String(r.reply.data.uuid);
    }
    const uuids = stages.map((s) => trades[s.kind]!);
    const everyone = [...new Map(stages.flatMap((s) => s.audience).map((v) => [v.vendorCompanyUuid, v])).values()];
    const pub = await this.step({
      title: "Publish the event",
      actor: "buyer",
      expected: o.publishExpected ?? `The event goes live (status active) and is visible to ${everyone.length} vendor${everyone.length === 1 ? "" : "s"}.`,
      expect: o.publishExpect ?? { accept: true },
      api: c.buyerApi,
      method: "PATCH",
      path: this.E.eventGroup(eg),
      body: {
        ...this.B.buildPublishBody({ title: o.title, technicalTradeUuid: uuids[0], pricingTradeUuid: uuids[1] ?? uuids[0], vendorCompanyUuid: everyone[0]?.vendorCompanyUuid }),
        draft_trade_request_uuids: uuids,
        audience_company_uuids: everyone.map((v) => v.vendorCompanyUuid),
      },
      ok: (d) => (d?.status === "active" ? { actual: `“${o.title}” is live with ${uuids.length} round${uuids.length === 1 ? "" : "s"}.` } : { short: `the event came back as “${d?.status}”` }),
    });
    if (!pub.reply.ok) return o.publishExpect ? { eg, line, trades: {} } : undefined;
    // The app may move a round's window (a start already in the past is moved
    // to now, keeping the duration). Every wait must use the REAL clock, so
    // the timing objects the combination holds are corrected in place.
    for (const st of stages) {
      const real = await this.clock(trades[st.kind]!);
      if (!real) continue;
      const shift = real.bet - st.timing.bet;
      if (Math.abs(shift) >= 2) this.note(`The app moved the ${st.kind.toUpperCase()} window by ${shift} s: bid end ${hhmmss(real.bet)}, extra closing time ${hhmmss(real.ect)}.`);
      st.timing.bst += shift;
      st.timing.bet = real.bet;
      st.timing.ect = real.ect;
    }
    return { eg, line, trades };
  }

  // ── actors ──

  async vendor(v: QaVendor): Promise<any | undefined> {
    if (this.apis.has(v.n)) return this.apis.get(v.n);
    const t = Date.now();
    const r = await vendorClient(this.c.companyId, v.email, this.c.baseURL);
    this.push({
      title: `Sign in as ${this.name(v)}`,
      actor: this.name(v),
      expected: `${this.name(v)} signs into the supplier app with an emailed one-time code.`,
      actual: r.api ? `Signed in as ${this.name(v)}.` : `Could not sign in: ${r.error}.`,
      verdict: r.api ? "pass" : "fail",
      call: { method: "POST", path: "/v1/verify_otp", body: { email: v.email, otp: "<redacted>" } },
      ms: Date.now() - t,
    });
    if (r.api) this.apis.set(v.n, r.api);
    return r.api;
  }

  async dispose() {
    for (const api of this.apis.values()) await Promise.resolve(api?.dispose?.()).catch(() => {});
    this.apis.clear();
    if (this.evalApi) await Promise.resolve(this.evalApi.dispose?.()).catch(() => {});
    this.evalApi = undefined;
  }

  private evalApi?: any;

  /**
   * The technical round's evaluator (the user named on the round), signed into
   * the web console by phone one-time code — as eventJourney.ts does: console
   * users get codes by phone only, sent as the stored value's two halves.
   */
  async evaluator(): Promise<any | undefined> {
    if (this.evalApi) return this.evalApi;
    const { c } = this;
    const t = Date.now();
    const stored = c.evaluatorPhone;
    const [prefix, phone] = stored?.includes("/") ? stored.split("/") : [undefined, stored];
    let api: any;
    let err: string | undefined;
    if (!phone) err = "no phone is known for the evaluator, and a console user cannot get a code by email";
    else {
      try {
        const [{ authenticate }, { CONFIG }, { ApiClient }] = await Promise.all([imp("auth/login.ts"), imp("config.ts"), imp("api/client.ts")]);
        const base = c.baseURL ?? CONFIG.baseURL;
        const login = await authenticate({ ...CONFIG.identities.evaluator, email: undefined, phone, phonePrefix: prefix ?? CONFIG.identities.evaluator.phonePrefix, tenantCompanyId: c.companyId, baseURL: base });
        api = await ApiClient.create(login, { baseURL: base, appVersion: login.appVersion, identity: "evaluator", companyId: c.companyId });
      } catch (e) {
        err = (redactSecrets(e instanceof Error ? e.message : String(e)) ?? "sign-in failed").replace(/"otp"\s*:\s*"?\d+"?/gi, '"otp":"<redacted>"').slice(0, 300);
      }
    }
    this.push({
      title: "Sign in as the evaluator", actor: "evaluator",
      expected: "The evaluator named on the technical round signs into the web console with a one-time code sent to their phone.",
      actual: api ? "Signed in as the evaluator." : `Could not sign in: ${err}.`, verdict: api ? "pass" : "fail",
      call: { method: "POST", path: "/v1/verify_otp", body: { phone: "<masked>", otp: "<redacted>" } }, ms: Date.now() - t,
    });
    this.evalApi = api;
    return api;
  }

  /** The vendor's current bid on a round (as last opened, or as replaced by a buyer edit). */
  bidOf(v: QaVendor, trade: string): string | undefined {
    return this.bids.get(`${v.n}:${trade}`);
  }
  setBid(v: QaVendor, trade: string, uuid: string) {
    this.bids.set(`${v.n}:${trade}`, uuid);
  }

  /** One of our own QA bids read back from Procol's database (SELECT only). */
  async bidRow(uuid: string): Promise<{ end_epoch: number | null; status: number | null; price: number | null } | undefined> {
    const id = decodeProcolId(uuid);
    if (!id) return undefined;
    try {
      const { query } = await imp("db/pool.ts");
      const rows = await query("SELECT extract(epoch FROM end_time)::bigint AS end_epoch, status, price FROM bids WHERE id = $1", [id]);
      return rows[0];
    } catch {
      return undefined;
    }
  }

  /** The vendor's ACTIVE bid on one of our QA rounds, read with SELECT (a buyer edit replaces the bid). */
  async activeBid(v: QaVendor, trade: string): Promise<string | undefined> {
    const tid = decodeProcolId(trade);
    if (!tid) return undefined;
    try {
      const { query } = await imp("db/pool.ts");
      const rows = await query(
        "SELECT b.id FROM bids b JOIN bid_trades bt ON bt.bid_id = b.id WHERE bt.trade_request_id = $1 AND b.company_id = $2 AND b.status = 1 ORDER BY b.id DESC LIMIT 1",
        [tid, v.vendorCompanyId],
      );
      return rows[0]?.id ? encodeProcolId(Number(rows[0].id)) : undefined;
    } catch {
      return undefined;
    }
  }

  /** The round's product ids (read once per round and reader). */
  async tradeProduct(api: any, trade: string, who: string): Promise<any | undefined> {
    const key = `${who}:${trade}`;
    if (this.products.has(key)) return this.products.get(key);
    const r = await send(api, "GET", this.E.tradeDetails(trade));
    const p = r.data?.order_details?.[0]?.product;
    if (!r.ok || !p?.trade_product_uuid) {
      this.note(`${who} could not read the round's line item (${said(r)})`);
      return undefined;
    }
    const tp = { trade_product_uuid: p.trade_product_uuid, trade_product_id: p.trade_product_id, trade_product_category_uuid: p.trade_product_category_uuid, product_id: p.id, product_code: p.product_code };
    this.products.set(key, tp);
    return tp;
  }

  line(b: Built, price: number, tp: any) {
    const { c } = this;
    return { productUuid: c.cat.productUuid, productQualityUuid: c.cat.productQualityUuid, locationUuid: c.cat.locationUuid, lineItemUuid: b.line, quantityValue: c.qty, quantityUnit: c.unit, price, tradeProduct: tp };
  }

  /**
   * The vendor's own bid: open → price → submit. Each part has its own
   * expectation; once one is refused (as expected or not) the rest is not
   * attempted, and says so.
   */
  async bid(
    v: QaVendor,
    b: Built,
    trade: string,
    price: number,
    ex: { open?: Expect; products?: Expect; submit?: Expect; label?: string; openExpected?: string; /** try the submit even when pricing was refused */ tryAll?: boolean } = {},
  ): Promise<{ submitted: boolean; refusedAt?: "open" | "products" | "submit"; code?: string }> {
    const who = this.name(v);
    const api = await this.vendor(v);
    if (!api) {
      this.skip(`${who} bids ${rupees(price)}`, who, "The vendor bids.", `${who} could not sign in`);
      return { submitted: false };
    }
    const label = ex.label ?? `${who} bids ${rupees(price)} per ${this.c.unit}`;
    const open = await this.step({
      title: `${label}: open a bid`,
      actor: who,
      expected: ex.openExpected ?? `A bid is opened for ${who}.`,
      expect: ex.open ?? { accept: true },
      api,
      method: "POST",
      path: this.E.createBid(),
      body: this.B.buildCreateBid({ pricingTradeUuid: trade, vendorCompanyUuid: v.vendorCompanyUuid }),
      ok: (d) => ((d?.bid_uuid ?? d?.uuid) ? { actual: `Bid ${d.bid_uuid ?? d.uuid} was opened for ${who}.` } : { short: "the reply carried no bid id" }),
    });
    if (!open.reply.ok) return { submitted: false, refusedAt: "open", code: open.reply.code };
    const bidUuid = String(open.reply.data?.bid_uuid ?? open.reply.data?.uuid);
    this.bids.set(`${v.n}:${trade}`, bidUuid);
    const tp = await this.tradeProduct(api, trade, who);
    if (!tp) {
      this.skip(`${label}: price the line`, who, "The line is priced.", "the round's line item could not be read");
      return { submitted: false };
    }
    const { body, total } = this.B.buildBidProductsBody({ pricingTradeUuid: trade, vendorCompanyUuid: v.vendorCompanyUuid, ...this.line(b, price, tp) });
    const prod = await this.step({
      title: `${label}: price the line`,
      actor: who,
      expected: `${rupees(price)} per ${this.c.unit} × ${this.c.qty} = ${rupees(total)} is accepted.`,
      expect: ex.products ?? { accept: true },
      api,
      method: "POST",
      path: this.E.createBidProducts(bidUuid),
      body,
    });
    if (!prod.reply.ok && !ex.tryAll) return { submitted: false, refusedAt: "products", code: prod.reply.code };
    const sub = await this.step({
      title: `${label}: submit`,
      actor: who,
      expected: `${who}'s bid of ${rupees(total)} is submitted.`,
      expect: ex.submit ?? { accept: true },
      api,
      method: "PATCH",
      path: this.E.submitBid(bidUuid),
      body: this.B.buildSubmitBidBody({ pricingTradeUuid: trade, vendorCompanyUuid: v.vendorCompanyUuid, total }),
      ok: (d) => (d?.success === false ? { short: "the app answered success: false" } : { actual: `${who}'s bid of ${rupees(total)} was submitted.` }),
    });
    if (!sub.reply.ok) return { submitted: false, refusedAt: "submit", code: sub.reply.code };
    return { submitted: sub.rec.verdict === "pass" || sub.reply.ok };
  }

  /** The buyer enters a price on a vendor's behalf (surrogate RFQ). */
  async surrogate(v: QaVendor, b: Built, trade: string, price: number, expect: Expect, expected: string, title?: string, probeTitle?: string) {
    const tp = await this.tradeProduct(this.c.buyerApi, trade, "the buyer");
    if (!tp) return this.skip(title ?? `Buyer bids for ${this.name(v)}`, "buyer", expected, "the round's line item could not be read");
    return (
      await this.step({
        title: title ?? `Buyer enters ${rupees(price)} on ${this.name(v)}'s behalf`,
        actor: "buyer",
        expected,
        expect,
        api: this.c.buyerApi,
        method: "POST",
        path: this.E.surrogateRfqBid(),
        body: this.B.buildSurrogateRfqBody({ pricingTradeUuid: trade, vendorCompanyUuid: v.vendorCompanyUuid, ...this.line(b, price, tp) }),
        probeTitle,
      })
    ).rec;
  }

  /** The technical round's forms, read by `api`. */
  async forms(api: any, trade: string): Promise<any[] | undefined> {
    const r = await send(api, "GET", this.E.tradeDetails(trade));
    const f = r.data?.sheets?.forms;
    return r.ok && Array.isArray(f) && f[1]?.page_uuids?.[0] ? f : undefined;
  }

  /** The vendor's own technical response: start → answer → submit. */
  async tech(v: QaVendor, trade: string, ex: { start?: Expect; submit?: Expect } = {}): Promise<boolean> {
    const who = this.name(v);
    const api = await this.vendor(v);
    const forms = api ? await this.forms(api, trade) : undefined;
    if (!api || !forms) {
      this.skip(`${who} answers the technical round`, who, "The technical response is submitted.", api ? "the round's forms could not be read" : `${who} could not sign in`);
      return false;
    }
    const start = await this.step({
      title: `${who} starts a technical response`, actor: who, expected: `A technical response is opened for ${who}.`,
      expect: ex.start ?? { accept: true }, api, method: "POST", path: this.E.templateResponses(),
      body: this.B.buildStartTechnicalResponse({ technicalTradeUuid: trade, vendorCompanyUuid: v.vendorCompanyUuid }),
      ok: (d) => (d?.uuid ? { actual: `Technical response ${d.uuid} was opened.` } : { short: "no response id" }),
    });
    if (!start.reply.ok) return false;
    const id = String(start.reply.data.uuid);
    const ans = await this.step({
      title: `${who} answers the line-item form`, actor: who, expected: "The answers are accepted.", expect: { accept: true }, api, method: "PUT",
      path: this.E.createPageResponses(id), body: this.B.buildTechnicalAnswerBody({ technicalTradeUuid: trade, formUuid: forms[1].uuid, pageUuid: forms[1].page_uuids[0] }),
    });
    if (!ans.reply.ok) return false;
    const sub = await this.step({
      title: `${who} submits the technical response`, actor: who, expected: "The technical response is submitted.", expect: ex.submit ?? { accept: true }, api, method: "PATCH",
      path: this.E.templateResponse(id), body: this.B.buildSubmitTechnicalResponse({ technicalTradeUuid: trade, vendorCompanyUuid: v.vendorCompanyUuid }),
    });
    return sub.reply.ok;
  }

  /**
   * What the buyer's comparison shows per vendor: GET event_indicators →
   * auction_identifiers_data.<vendor company>.inline.<line>.rank = { value,
   * best_bidder } (the rank number is empty on an RFQ; best_bidder is set),
   * and the schema's l1_prices for the line. Undefined when nothing was read.
   */
  async standings(trade: string, line: string): Promise<{ by: Map<string, { rank?: number; best?: boolean }>; l1?: number } | undefined> {
    const by = new Map<string, { rank?: number; best?: boolean }>();
    const ind = await send(this.c.buyerApi, "GET", this.E.eventIndicators(trade));
    const data = ind.data?.auction_identifiers_data ?? {};
    for (const [company, v] of Object.entries<any>(data)) {
      const inl = v?.inline?.[line]?.rank ?? Object.values<any>(v?.inline ?? {})[0]?.rank;
      const g = v?.global?.rank;
      const raw = inl?.value ?? g?.value;
      const n = typeof raw === "number" ? raw : /^\D*(\d+)$/.test(String(raw ?? "")) ? Number(String(raw).replace(/\D/g, "")) : undefined;
      by.set(company, { rank: n, best: typeof inl?.best_bidder === "boolean" ? inl.best_bidder : undefined });
    }
    const sch = await send(this.c.buyerApi, "GET", `/v1/trade/${trade}/schema?response_type=template&additional_fields=order_details&l1_prices=true`);
    const lib = sch.data?.l1_prices?.line_item_based ?? {};
    const l1 = (lib[line] ?? Object.values<any>(lib)[0])?.price;
    if (!by.size && l1 === undefined) return undefined;
    return { by, l1: typeof l1 === "number" ? l1 : l1 !== undefined ? Number(l1) : undefined };
  }

  /** One oracle step: who the buyer sees as best, and the L1 price. */
  async checkStandings(trade: string, line: string, best: QaVendor[], all: QaVendor[], l1: number, title: string) {
    const st = await this.standings(trade, line);
    if (!st) return this.push({ title, actor: "buyer", expected: "", actual: "The buyer's comparison could not be read.", verdict: "inconclusive", ms: 0 });
    const words = all.map((v) => {
      const x = st.by.get(v.vendorCompanyUuid);
      return `${this.name(v)}: ${x?.best ? "best bidder" : x ? "not best" : "missing"}${x?.rank !== undefined ? `, rank ${x.rank}` : ""}`;
    });
    const bestOk = all.every((v) => (st.by.get(v.vendorCompanyUuid)?.best ?? false) === best.includes(v));
    const l1Ok = st.l1 === undefined || st.l1 === l1;
    return this.push({
      title, actor: "buyer",
      expected: `${best.map((v) => this.name(v)).join(" and ")} marked best bidder${best.length > 1 ? "s" : ""}, everyone else not; lowest (L1) price ${rupees(l1)}.`,
      actual: `${words.join("; ")}. L1 price ${st.l1 !== undefined ? rupees(st.l1) : "not shown"}.`,
      verdict: bestOk && l1Ok ? "pass" : "fail", ms: 0,
    });
  }

  /** Award: proposal → add the vendors (each with or without a quantity) → workflow → submit. */
  async award(b: Built, parts: Array<{ v: QaVendor; qty?: number }>, ex: { add?: Expect; submit?: Expect; addExpected?: string; submitExpected?: string; submitTitle?: string } = {}) {
    const { c } = this;
    const p = await this.step({
      title: "Open an award proposal", actor: "buyer", expected: "An award proposal is opened.", expect: { accept: true }, api: c.buyerApi,
      method: "POST", path: this.E.proposal(), body: this.B.buildProposalBody({ eventGroupUuid: b.eg }),
      ok: (d) => (d?.uuid ? { actual: `Proposal ${d.uuid} was opened.` } : { short: "no proposal id" }),
    });
    if (!p.reply.ok || !p.reply.data?.uuid) return { proposal: undefined as string | undefined, added: false, submitted: false };
    const proposal = String(p.reply.data.uuid);
    const responses: Record<string, any> = {};
    for (const x of parts) responses[x.v.vendorCompanyUuid] = { action: "add", egli_data: { [b.line]: x.qty === undefined ? {} : { awarded_quantity: x.qty } } };
    const words = parts.map((x) => `${x.qty === undefined ? "the quoted quantity" : `${x.qty} ${c.unit}`} to ${this.name(x.v)}`).join(", ");
    const add = await this.step({
      title: `Award ${words}`, actor: "buyer", expected: ex.addExpected ?? `The award (${words}) is accepted on the proposal.`, expect: ex.add ?? { accept: true },
      api: c.buyerApi, method: "POST", path: this.E.proposalAddResponse(proposal), body: { responses },
    });
    if (!add.reply.ok) return { proposal, added: false, submitted: false };
    const wf = await send(c.buyerApi, "GET", this.E.proposalApprovalWorkflows(proposal));
    const flows: any[] = Array.isArray(wf.data) ? wf.data : wf.data?.approval_workflows ?? wf.data?.data ?? [];
    const flow = flows[0]?.uuid;
    if (!flow) {
      this.skip(ex.submitTitle ?? "Submit the award", "buyer", ex.submitExpected ?? "The award is submitted.", `no approval workflow is configured for awards at ${c.company}${wf.ok ? "" : ` (${said(wf)})`}`);
      return { proposal, added: true, submitted: false };
    }
    const sub = await this.step({
      title: ex.submitTitle ?? "Submit the award for approval", actor: "buyer", expected: ex.submitExpected ?? "The award is submitted into its approval workflow.",
      expect: ex.submit ?? { accept: true }, api: c.buyerApi, method: "POST", path: this.E.proposalSubmit(proposal),
      body: this.B.buildAwardSubmitBody({ approvalFlowUuid: String(flow) }),
    });
    return { proposal, added: true, submitted: sub.reply.ok };
  }

  /** The buyer moves a round's bid end (and the app shifts the extra closing time after it). */
  async extend(trade: string, newBet: number, expect: Expect, expected: string, extra: Record<string, unknown> = {}, title?: string) {
    return this.step({
      title: title ?? `Extend the submission time to ${hhmmss(newBet)}`, actor: "buyer", expected, expect, api: this.c.buyerApi,
      method: "PATCH", path: `/trade/${trade}`, body: { increase_auction_time: newBet, ...extra },
    });
  }

  /** The round's clock as the app now has it. */
  async clock(trade: string): Promise<Timing | undefined> {
    const r = await send(this.c.buyerApi, "GET", this.E.tradeDetails(trade));
    const d = r.data ?? {};
    const pick = (...ks: string[]) => {
      for (const k of ks) {
        const v = d[k] ?? d.trade_config?.[k] ?? d.config?.[k] ?? d.timings?.[k];
        if (v !== undefined && v !== null) return typeof v === "number" ? (v > 1e12 ? Math.floor(v / 1000) : v) : Math.floor(new Date(v).getTime() / 1000);
      }
      return undefined;
    };
    const bet = pick("ending_at", "bid_end_time", "end_time");
    const ect = pick("extra_closing_time", "closed_at");
    const bst = pick("starting_at", "bid_start_time", "start_time");
    return bet ? { bst: bst ?? 0, bet, ect: ect ?? bet } : undefined;
  }
}

// ── the combinations ───────────────────────────────────────────────────────

interface Combo {
  id: string;
  title: string;
  why: string;
  /** clients it runs on (the design's GMMCO ones are moved to 198678 / 32461: GMMCO is a customer's tenant) */
  clients: number[];
  vendors: number;
  needsTech?: boolean;
  run: (b: Bench, vs: QaVendor[], o: MatrixRunOptions) => Promise<void>;
}

const PRICE = [100, 110, 120];
const TITLE = (id: string) => `QA_Platform_Matrix_${id}_${Date.now()}`;

export const COMBOS: Combo[] = [
  {
    id: "M1",
    title: "Three vendors bid through their own portal; ranks and a three-way split award",
    why: "Invites must reach every vendor, each must be able to bid, the buyer must see them ranked 1/2/3 by price, an RFQ never shows a vendor its own rank, and an award can be split.",
    clients: [198678, 32461],
    vendors: 3,
    run: async (b, vs) => {
      const t = b.timing(0, 170, 10);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("M1") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      for (let i = 0; i < vs.length; i++) await b.bid(vs[i], ev, trade, PRICE[i]);
      await b.checkStandings(trade, ev.line, [vs[0]], vs, PRICE[0], "The buyer sees the lowest price as the best bid");
      const api = await b.vendor(vs[0]);
      if (api) {
        const r = await send(api, "GET", b.E.tradeDetails(trade));
        const mine = JSON.stringify(r.data ?? {}).match(/"rank":\s*(\d+)/);
        b.push({
          title: "QA vendor 1 cannot see its own rank on an RFQ", actor: "QA vendor 1", expected: "The vendor's view carries no rank (ranks are shown to vendors only in auctions).",
          actual: r.ok ? (mine ? `The vendor's view shows rank ${mine[1]}.` : "The vendor's view carries no rank.") : said(r), verdict: !r.ok ? "inconclusive" : mine ? "fail" : "pass", ms: r.ms,
        });
      }
      await b.until(t.ect + 8, "the bidding window and extra closing time to end before the award");
      const partial = b.c.companyId === 198678;
      if (partial) {
        const q = Math.floor(b.c.qty / 3);
        await b.award(ev, [{ v: vs[0], qty: b.c.qty - 2 * q }, { v: vs[1], qty: q }, { v: vs[2], qty: q }]);
      } else {
        b.note(`Partial awarding is off at ${b.c.company}, so the whole quantity goes to the lowest bidder.`);
        await b.award(ev, [{ v: vs[0], qty: b.c.qty }]);
      }
    },
  },
  {
    id: "M2",
    title: "Two vendors tie on price; awarding with partial awarding off",
    why: "With two equal best prices the rank calculator shifts every rank (both L2, no L1). With partial awarding off, awarding the quoted quantity to both must be refused (561); a quantity sent explicitly is suspected to skip the check.",
    clients: [32461],
    vendors: 2,
    run: async (b, vs) => {
      const t = b.timing(0, 120, 10);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("M2") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      for (const v of vs) await b.bid(v, ev, trade, 100);
      await b.checkStandings(trade, ev.line, vs, vs, 100, "Tied best prices: both vendors shown as best bidder");
      await b.until(t.ect + 8, "the window to end before awarding");
      const p = await b.step({
        title: "Open an award proposal", actor: "buyer", expected: "A proposal is opened.", expect: { accept: true },
        api: b.c.buyerApi, method: "POST", path: b.E.proposal(), body: b.B.buildProposalBody({ eventGroupUuid: ev.eg }),
      });
      const proposal = p.reply.data?.uuid ? String(p.reply.data.uuid) : undefined;
      if (!proposal) return;
      const add = (v: QaVendor) => ({ responses: { [v.vendorCompanyUuid]: { action: "add", egli_data: { [ev.line]: { awarded_quantity: b.c.qty } } } } });
      const first = await b.step({
        title: `Award the full ${b.c.qty} ${b.c.unit} to ${b.name(vs[0])}`, actor: "buyer", expected: "Accepted.", expect: { accept: true },
        api: b.c.buyerApi, method: "POST", path: b.E.proposalAddResponse(proposal), body: add(vs[0]),
      });
      if (!first.reply.ok) return;
      await b.step({
        title: `Also award the full ${b.c.qty} ${b.c.unit} to ${b.name(vs[1])} (twice the line in total)`, actor: "buyer",
        expected: "Refused — partial awarding is off and the total would be twice the line's quantity. Code reading: with a quantity stated and partial awarding off, no check runs.",
        expect: { probe: "AWARD-QTY-GAP", defectIf: "accepted" }, api: b.c.buyerApi, method: "POST", path: b.E.proposalAddResponse(proposal), body: add(vs[1]),
        probeTitle: "Over-award accepted when partial awarding is off and a quantity is sent",
      });
      b.note("The proposal is left unsubmitted on purpose.");
    },
  },
  {
    id: "M3",
    title: "Technical evaluation with two responding vendors: every response must be scored before the evaluation is submitted",
    why: "Scoring opens only once the technical round's bid end has passed (33). Submitting an evaluation that scores only one of two responding vendors must be refused (571); a vendor who never responded cannot be scored (101); once both responses are scored the submit is accepted.",
    clients: [198678, 32461],
    vendors: 3,
    needsTech: true,
    run: async (b, vs) => {
      const [A, B2, C] = vs;
      const tp = b.timing(0, 75, 10);
      const tq = { bst: tp.bst, bet: tp.bet + 60, ect: tp.ect + 60 };
      const ev = await b.build([{ kind: "rfp", timing: tp, audience: vs }, { kind: "rfq", timing: tq, audience: vs }], { title: TITLE("M3") });
      if (!ev) return;
      const rfp = ev.trades.rfp!;
      const aOk = await b.tech(A, rfp);
      const bOk = await b.tech(B2, rfp);
      if (C) b.note(`${b.name(C)} is invited to the technical round and does not respond.`);
      if (!aOk || !bOk) return void b.skip("Score and submit the evaluation", "evaluator", "Both responses are scored and submitted.", "the two vendors' technical responses were not both submitted");
      const ea = await b.evaluator();
      if (!ea) return;
      // The evaluator's own view: the forms assigned to them, and the event's score scale.
      const sch = await send(ea, "GET", b.E.tradeSchema(rfp));
      const forms: any[] = Array.isArray(sch.data?.sheets?.forms) ? sch.data.sheets.forms : [];
      const mine = forms.filter((f) => (f?.evaluators || []).some((e: any) => e?.shared_with_uuid === b.c.evaluatorUuid));
      const scale = scoreScale(sch.data).filter((x) => x.score > 0);
      b.push({
        title: "The evaluator sees the form assigned to them and the event's score scale", actor: "evaluator",
        expected: "At least one form of the technical round is assigned to the evaluator, and the event lists the scores it accepts.",
        actual: !sch.ok ? said(sch) : `${mine.length} of ${forms.length} form${forms.length === 1 ? "" : "s"} assigned to the evaluator; scores accepted: ${scale.length ? scale.map((x) => `${x.score} (${x.label})`).join(", ") : "none listed"}.`,
        verdict: !sch.ok ? "inconclusive" : mine.length ? "pass" : "fail", ms: sch.ms,
      });
      if (!mine.length) return;
      const top = scale.length ? scale[scale.length - 1] : undefined;
      const low = scale.length ? scale[0] : undefined;
      const scoreBody = (v: QaVendor, form: any, s?: { score: number }) =>
        b.B.buildCreateEvaluation({ technicalTradeUuid: rfp, vendorCompanyUuid: v.vendorCompanyUuid, formUuid: String(form.uuid), score: s?.score ?? 1 });
      const words = (s?: { score: number; label: string }) => (s ? `${s.score} (“${s.label}”)` : "1");
      const formNo = (i: number) => (mine.length > 1 ? ` on form ${i + 1}` : "");
      // Before the technical round's bid end: no scoring yet.
      if (nowSec() < tp.bet - 4)
        await b.step({
          title: `While the technical round is still open: score ${b.name(A)}'s response`, actor: "evaluator",
          expected: "Refused: evaluation starts only after the technical round's bid end (33).", expect: { refuse: ["33"] },
          api: ea, method: "POST", path: b.E.evaluations(), body: scoreBody(A, mine[0], top),
        });
      else b.note("The technical round had already ended before the early-scoring check could run; it was left out.");
      await b.until(tp.bet + 4, "the technical round's bid end to pass before scoring");
      for (let i = 0; i < mine.length; i++)
        await b.step({
          title: `Score ${b.name(A)}'s response ${words(top)}${formNo(i)}`, actor: "evaluator",
          expected: "The score is recorded (it is one of the event's own scores).", expect: { accept: true },
          api: ea, method: "POST", path: b.E.evaluations(), body: scoreBody(A, mine[i], top),
          ok: (d) => (d?.success === false ? { short: "the app answered success: false" } : undefined),
        });
      await b.step({
        title: `Submit the evaluation with only ${b.name(A)} scored`, actor: "evaluator",
        expected: `Refused: ${b.name(B2)} also responded and has no score yet (571 “Please, evaluate on all fields”).`, expect: { refuse: ["571"] },
        api: ea, method: "PATCH", path: b.E.submitEvaluation(), body: { trade_request_uuid: rfp },
      });
      if (C)
        await b.step({
          title: `Score ${b.name(C)}, who was invited but never responded`, actor: "evaluator",
          expected: "Refused: there is no response from this vendor to score (101).", expect: { refuse: ["101"] },
          api: ea, method: "POST", path: b.E.evaluations(), body: scoreBody(C, mine[0], top),
        });
      for (let i = 0; i < mine.length; i++)
        await b.step({
          title: `Score ${b.name(B2)}'s response ${words(low)}${formNo(i)}`, actor: "evaluator",
          expected: "The score is recorded.", expect: { accept: true },
          api: ea, method: "POST", path: b.E.evaluations(), body: scoreBody(B2, mine[i], low),
          ok: (d) => (d?.success === false ? { short: "the app answered success: false" } : undefined),
        });
      await b.step({
        title: "Submit the evaluation with both responses scored", actor: "evaluator",
        expected: "Accepted: every vendor with a response is scored. The result comes back as a proposal — “draft” if an approval applies, “selected” otherwise.",
        expect: { accept: true }, api: ea, method: "PATCH", path: b.E.submitEvaluation(), body: { trade_request_uuid: rfp },
        ok: (d) => ({ actual: `The evaluation was submitted; the result came back${d?.status ? ` as “${d.status}”` : ""}.` }),
      });
    },
  },
  {
    id: "M4",
    title: "Technical + pricing rounds: surrogate price without a technical response, surrogate technical after the vendor's own",
    why: "A vendor may not price an RFQ without answering the RFP (737), but the surrogate path has no such check (suspected). A surrogate technical response over the vendor's own must be refused (30).",
    clients: [198678, 32461],
    vendors: 2,
    needsTech: true,
    run: async (b, vs) => {
      const tp = b.timing(0, 150, 10);
      const tq = { bst: tp.bst, bet: tp.bet + 30, ect: tp.ect + 30 };
      const ev = await b.build([{ kind: "rfp", timing: tp, audience: vs }, { kind: "rfq", timing: tq, audience: vs }], { title: TITLE("M4") });
      if (!ev) return;
      await b.surrogate(vs[1], ev, ev.trades.rfq!, 105, { probe: "S11-NO-TECH-CHECK", defectIf: "accepted" },
        "The vendor's own path refuses a price without a technical response (737); the code shows no such check on the surrogate path.",
        `Buyer enters a price for ${b.name(vs[1])}, who never answered the technical round`, "Surrogate price accepted for a vendor with no technical response");
      await b.bid(vs[0], ev, ev.trades.rfq!, 100, { open: { refuse: ["737"] }, label: `${b.name(vs[0])} bids before answering the technical round`, openExpected: "Refused: the vendor was invited to the technical round and has not answered it (737)." });
      const done = await b.tech(vs[0], ev.trades.rfp!);
      const forms = done ? await b.forms(b.c.buyerApi, ev.trades.rfp!) : undefined;
      if (forms) {
        await b.step({
          title: `Buyer enters a technical response for ${b.name(vs[0])}, who already answered`, actor: "buyer",
          expected: "Refused: the vendor already has an active technical response (30).", expect: { refuse: ["30"] }, api: b.c.buyerApi, method: "POST",
          path: b.E.createSurrogateResponse(),
          body: b.B.buildSurrogateTechnicalBody({ technicalTradeUuid: ev.trades.rfp, vendorCompanyUuid: vs[0].vendorCompanyUuid, form0Page: forms[0].page_uuids[0], form1Page: forms[1].page_uuids[0] }),
        });
      }
      await b.bid(vs[0], ev, ev.trades.rfq!, 100, { label: `${b.name(vs[0])} bids after answering the technical round` });
    },
  },
  {
    id: "M5",
    title: "Surrogate bids: before the start, over a vendor's own bid, twice, revised by the vendor, for an uninvited and a stranger company, after the end",
    why: "Each of these takes a different branch of the surrogate code: accepted before the start (a vendor is not), refused over the vendor's own bid (96), refused a second time (99), revisable by the vendor, refused for a company the buyer does not deal with (101), refused after the bid end (33); an uninvited company is suspected to be accepted.",
    clients: [198678, 32461],
    vendors: 4,
    run: async (b, vs) => {
      const [A, B2, C, D] = vs;
      const t = b.timing(80, 130, 60);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: [A, B2, C] }], { title: TITLE("M5") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      await b.surrogate(A, ev, trade, 101, { accept: true }, "Accepted: a surrogate bid is allowed while the round is upcoming.", `Before the start: buyer enters a price for ${b.name(A)}`);
      await b.bid(C, ev, trade, 99, { open: { refuse: ["33"] }, label: `Before the start: ${b.name(C)} tries to bid`, openExpected: "Refused: bidding has not started (33)." });
      await b.until(t.bst + 3, "the bidding window to open");
      await b.bid(C, ev, trade, 99);
      await b.surrogate(C, ev, trade, 98, { refuse: ["96"] }, "Refused: the vendor has already bid themselves (96).", `Buyer tries to bid for ${b.name(C)}, who already bid`);
      await b.surrogate(A, ev, trade, 97, { refuse: ["99"] }, "Refused: a bid was already placed on this vendor's behalf (99).", `Buyer tries a second surrogate bid for ${b.name(A)}`);
      await b.bid(A, ev, trade, 96, { label: `${b.name(A)} signs in and revises the bid the buyer entered` });
      if (D) await b.surrogate(D, ev, trade, 95, { probe: "S7-NO-AUDIENCE-CHECK", defectIf: "accepted" }, "Should be refused — the company is not invited to this event; the code has no audience check on this path.", `Buyer bids for ${b.name(D)}, who is a vendor of the buyer but NOT invited`, "Surrogate bid accepted for a vendor not invited to the event");
      const stranger = b.c.strangers[0];
      if (stranger) await b.surrogate(stranger, ev, trade, 94, { refuse: ["101"] }, "Refused: the buyer does not deal with this company (101).", "Buyer bids for a company it does not deal with");
      await b.until(t.bet + 4, "the bid end time to pass (extra closing time)");
      await b.surrogate(B2, ev, trade, 93, { refuse: ["33"] }, "Refused: the submission time is over (33).", `After the bid end: buyer tries to bid for ${b.name(B2)}`);
      // Last: in one run the buyer's session ended right after this call.
      await b.step({
        title: `Buyer calls the vendor's own bid endpoint for ${b.name(B2)}`, actor: "buyer",
        expected: "Refused: a buyer must use the surrogate path, not the vendor's — by the app gate (the web console may not call the vendor API) or by the bid guard (33).",
        expect: { refuse: ["33", "app_error_auth_failed"] }, api: b.c.buyerApi, method: "POST", path: b.E.createBid(), body: b.B.buildCreateBid({ pricingTradeUuid: trade, vendorCompanyUuid: B2.vendorCompanyUuid }),
      });
    },
  },
  {
    id: "M6",
    title: "Bids in the extra closing time and after it",
    why: "Once the submission time is over the vendor must not be able to submit (33). In the extra closing time a draft may still be opened (counter-offer modification), but pricing (508) and submitting (33) are refused; after the extra closing time even opening is refused.",
    clients: [32461, 198678],
    vendors: 2,
    run: async (b, vs) => {
      const t = b.timing(0, 100, 70);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("M6") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      for (let i = 0; i < vs.length; i++) await b.bid(vs[i], ev, trade, PRICE[i]);
      await b.until(t.bet + 4, "the bid end time to pass");
      await b.bid(vs[0], ev, trade, 90, {
        label: `In the extra closing time: ${b.name(vs[0])} tries to revise`,
        open: { either: ["ok", "33"] }, openExpected: "A draft may open (counter-offer modification) or be refused (33).",
        products: { refuse: ["508", "33"] }, submit: { refuse: ["33"] }, tryAll: true,
      });
      await b.until(t.ect + 4, "the extra closing time to end");
      await b.bid(vs[1], ev, trade, 90, { label: `After the extra closing time: ${b.name(vs[1])} tries to bid`, open: { refuse: ["33"] }, openExpected: "Refused: the submission time is over (33)." });
    },
  },
  {
    id: "M7",
    title: "Extend the submission time, bid again, then the proposal locks",
    why: "After the time is over a vendor is refused; the buyer can reopen it (allowed at PROCOL DEMO, refused 496 elsewhere); then bids go in again. A bid revised after it was put on a proposal makes the proposal submit refuse (1126), and once a proposal exists the time cannot be extended (801).",
    clients: [198678, 32461],
    vendors: 2,
    run: async (b, vs) => {
      const [A, B2] = vs;
      const t = b.timing(0, 80, 15);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("M7") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      await b.bid(A, ev, trade, 100);
      await b.until(t.ect + 5, "the round (and its extra closing time) to close");
      await b.bid(B2, ev, trade, 105, { label: `After the close: ${b.name(B2)} tries to bid`, open: { refuse: ["33"] }, openExpected: "Refused: the submission time is over (33)." });
      const reopen = b.c.companyId === 198678;
      const newBet = nowSec() + 150;
      const ext = await b.extend(trade, newBet, reopen ? { accept: true } : { either: ["ok", "496"] },
        reopen ? "Accepted: PROCOL DEMO lets users reopen an expired event." : "Refused (496) unless this buyer may reopen events (a super admin may: template default).");
      if (!reopen) b.note(ext.reply.ok ? "The expired round was reopened: this buyer is allowed to (super admin / reopen permission)." : "Reopening was refused (496).");
      if (!ext.reply.ok) return;
      const clk = await b.clock(trade);
      b.push({
        title: "The round's clock moved with the extension", actor: "buyer", expected: `The bid end is now ${hhmmss(newBet)} and the extra closing time comes after it.`,
        actual: clk ? `Bid end ${hhmmss(clk.bet)}, extra closing time ${hhmmss(clk.ect)}.` : "The round's times could not be read back.",
        verdict: !clk ? "inconclusive" : Math.abs(clk.bet - newBet) <= 60 && clk.ect >= clk.bet ? "pass" : "fail", ms: 0,
      });
      // Open question (design §4): does a MANUAL extension refresh the end time stored on bids already placed?
      // Code: the extension sets send_buyer_increase_time_notification and the round's after-save hook
      // runs bids.update_all(end_time: bid_end_time) (trade_request.rb send_auction_time_increase_notification).
      const aBid = (await b.activeBid(A, trade)) ?? b.bidOf(A, trade);
      const row = aBid ? await b.bidRow(aBid) : undefined;
      // Rails stores UTC in a zone-less column; extract(epoch) reads it as UTC.
      const stored = row?.end_epoch != null ? Number(row.end_epoch) : undefined;
      const target = clk?.bet ?? newBet;
      b.push({
        title: `${b.name(A)}'s existing bid takes the new end time`, actor: "buyer",
        expected: `The end time stored on ${b.name(A)}'s bid (placed before the close) moves to the new bid end ${hhmmss(target)}.`,
        actual: !row ? "The bid could not be read back." : stored === undefined ? "The bid carries no stored end time at all (empty)." : `The bid's stored end time is ${hhmmss(stored)} (the round's old bid end was ${hhmmss(t.bet)}).`,
        verdict: !row ? "inconclusive" : stored !== undefined && Math.abs(stored - target) <= 5 ? "pass" : "fail", ms: 0,
      });
      await b.bid(B2, ev, trade, 105, { label: `After the extension: ${b.name(B2)} bids` });
      await b.bid(A, ev, trade, 98, { label: `After the extension: ${b.name(A)} revises` });
      // While bidding is open again: put A's bid on a proposal, let A revise, then submit.
      const p = await b.step({
        title: "Open an award proposal while the extended window is open", actor: "buyer", expected: "A proposal is opened.", expect: { accept: true },
        api: b.c.buyerApi, method: "POST", path: b.E.proposal(), body: b.B.buildProposalBody({ eventGroupUuid: ev.eg }),
      });
      const proposal = p.reply.data?.uuid ? String(p.reply.data.uuid) : undefined;
      if (!proposal) return;
      const add = await b.step({
        title: `Put ${b.name(A)}'s bid on the proposal`, actor: "buyer", expected: `${b.c.qty} ${b.c.unit} is awarded to ${b.name(A)} on the proposal.`, expect: { accept: true },
        api: b.c.buyerApi, method: "POST", path: b.E.proposalAddResponse(proposal),
        body: { responses: { [A.vendorCompanyUuid]: { action: "add", egli_data: { [ev.line]: { awarded_quantity: b.c.qty } } } } },
      });
      if (!add.reply.ok) return;
      await b.bid(A, ev, trade, 95, { label: `${b.name(A)} revises after being put on the proposal` });
      const wf = await send(b.c.buyerApi, "GET", b.E.proposalApprovalWorkflows(proposal));
      const flows: any[] = Array.isArray(wf.data) ? wf.data : wf.data?.approval_workflows ?? wf.data?.data ?? [];
      const flow = flows[0]?.uuid ? String(flows[0].uuid) : undefined;
      if (!flow) {
        b.skip("Submit the proposal holding the now-revised bid", "buyer", "Refused.", `no approval workflow is configured for awards at ${b.c.company}`);
        return;
      }
      await b.step({
        title: "Submit the proposal holding the now-revised bid", actor: "buyer",
        expected: "Refused: the price on the proposal is no longer the vendor's current bid — either “revised after it was added” (1126) or, if the revision took the old bid off the proposal, “proposal cannot be empty” (683).",
        expect: { refuse: ["1126", "683"] }, api: b.c.buyerApi, method: "POST", path: b.E.proposalSubmit(proposal), body: b.B.buildAwardSubmitBody({ approvalFlowUuid: flow }),
      });
      // Put the CURRENT bid on the proposal and submit it, so a proposal really exists.
      const again = await b.step({
        title: `Award ${b.name(A)}'s current bid on the proposal again`, actor: "buyer", expected: "Accepted.", expect: { accept: true },
        api: b.c.buyerApi, method: "POST", path: b.E.proposalAddResponse(proposal),
        body: { responses: { [A.vendorCompanyUuid]: { action: "add", egli_data: { [ev.line]: { awarded_quantity: b.c.qty } } } } },
      });
      const sub = again.reply.ok
        ? await b.step({
            title: "Submit the proposal", actor: "buyer", expected: "The proposal is submitted into its approval workflow.", expect: { accept: true },
            api: b.c.buyerApi, method: "POST", path: b.E.proposalSubmit(proposal), body: b.B.buildAwardSubmitBody({ approvalFlowUuid: flow }),
          })
        : undefined;
      if (!sub?.reply.ok) return void b.skip("Try to extend the submission time once a proposal exists", "buyer", "Refused (801).", "no proposal could be submitted");
      const x = await b.extend(trade, nowSec() + 300, { refuse: ["801", "769"] }, "Refused: an award proposal already exists for this event (801). The RFQ-changes guard (769) runs first and also covers a submitted proposal.", {}, "Try to extend the submission time once a proposal exists");
      if (x.reply.code === "769")
        b.note("The extension was refused by the RFQ-changes guard (769) whose message says “You cannot edit rfq once the auction is created” — this event has no auction; the real reason is the submitted proposal (trade_request_model_helper.rb:1434-1445). The 801 guard is never reached for an RFQ in an event project. Misleading message.");
    },
  },
  {
    id: "M8",
    title: "The technical round must not end after the pricing round (712)",
    why: "Business rule: an RFP's bid end may not exceed the RFQ's. Publishing such an event, or extending the RFP past the RFQ, must be refused (712); extending both together is allowed.",
    clients: [32461, 198678],
    vendors: 1,
    needsTech: true,
    run: async (b, vs) => {
      const bad = b.timing(0, 240, 10);
      const rfqEarly = { bst: bad.bst, bet: bad.bst + 150, ect: bad.bst + 160 };
      await b.build([{ kind: "rfp", timing: bad, audience: vs }, { kind: "rfq", timing: rfqEarly, audience: vs }], {
        title: TITLE("M8a"), publishExpect: { refuse: ["712"] }, publishExpected: "Refused: the technical round ends after the pricing round (712).",
      });
      const tp = b.timing(0, 150, 10);
      const tq = { bst: tp.bst, bet: tp.bst + 210, ect: tp.bst + 220 };
      const ev = await b.build([{ kind: "rfp", timing: tp, audience: vs }, { kind: "rfq", timing: tq, audience: vs }], { title: TITLE("M8b") });
      if (!ev) return;
      await b.extend(ev.trades.rfp!, tq.bet + 120, { refuse: ["712"] }, "Refused: the technical round would then end after the pricing round (712).", {}, "Extend the technical round past the pricing round's end");
      const both = await b.extend(ev.trades.rfp!, tq.bet + 120, { accept: true }, "Accepted: the pricing round is moved first, so the rule still holds.", { extend_rfq_time: true }, "Extend the technical round together with the pricing round");
      if (both.reply.ok) {
        const q = await b.clock(ev.trades.rfq!);
        b.push({
          title: "The pricing round moved with it", actor: "buyer", expected: `The pricing round now ends at or after ${hhmmss(tq.bet + 120)}.`,
          actual: q ? `The pricing round ends at ${hhmmss(q.bet)}.` : "The pricing round's times could not be read back.", verdict: !q ? "inconclusive" : q.bet >= tq.bet + 120 - 5 ? "pass" : "fail", ms: 0,
        });
      }
    },
  },
  {
    id: "M9",
    title: "English auction with three vendors: a price that does not beat the best is refused; vendors see their rank",
    why: "In an English auction a vendor who has not bid yet must beat the current best price (ceiling = best − tick, 38). Auctions show vendors their rank.",
    clients: [198678],
    vendors: 3,
    run: async (b, vs) => {
      const t = b.timing(0, 170, 10);
      const ev = await b.build([{ kind: "auction", timing: t, audience: vs, auctionConfig: "rank" }], { title: TITLE("M9") });
      if (!ev) return;
      const trade = ev.trades.auction!;
      await b.bid(vs[0], ev, trade, 100);
      await b.bid(vs[1], ev, trade, 100, { label: `${b.name(vs[1])} bids the same ₹100`, products: { either: ["ok", "38"] }, submit: { either: ["ok", "98"] } });
      await b.bid(vs[1], ev, trade, 99, { label: `${b.name(vs[1])} bids ₹99` });
      // The English-auction ceiling (best − tick) applies only when the line has a ceiling price
      // (trade_product.rb:170 — `is_english_auction? && ceil_price.present?`); these rounds set none.
      await b.surrogate(vs[2], ev, trade, 100, { either: ["ok", "38"] }, "With no ceiling price on the line the English-auction rule does not apply, so ₹100 is accepted; with a ceiling price it would be refused (38).", `Buyer enters ₹100 for ${b.name(vs[2])} (best is ₹99)`);
      const api = await b.vendor(vs[1]);
      if (api) {
        const r = await send(api, "GET", b.E.tradeDetails(trade));
        const m = JSON.stringify(r.data ?? {}).match(/"rank":\s*(\d+)/);
        b.push({
          title: `${b.name(vs[1])} sees its rank in the auction`, actor: b.name(vs[1]), expected: "The vendor's view shows rank 1 (lowest price).",
          actual: r.ok ? (m ? `The vendor's view shows rank ${m[1]}.` : "The vendor's view carries no rank.") : said(r), verdict: !r.ok ? "inconclusive" : m?.[1] === "1" ? "pass" : "fail", ms: r.ms,
        });
      }
      await b.until(t.ect + 8, "the auction to close before awarding");
      await b.award(ev, [{ v: vs[1], qty: b.c.qty }]);
    },
  },
  {
    id: "M10",
    title: "The buyer edits a vendor's submitted bid — no change, a field the buyer may not edit, a field the buyer may edit; while open, in the extra closing time and after it",
    why: "With “buyer can edit a vendor's bid” on, an edit that changes nothing is refused (758), a change to a field not marked buyer-editable is refused (747), a change to a buyer-editable field is accepted while bidding is open and in the extra closing time, and refused once the extra closing time is over (101). Also answers whether a cost-breakdown request has its own vendor call.",
    clients: [198678, 32461],
    vendors: 2,
    run: async (b, vs) => {
      const [A, B2] = vs;
      const cfg = await send(b.c.buyerApi, "GET", b.E.dashboardConfiguration());
      const on = findKey(cfg.data, "can_buyer_edit_bid");
      if (on !== true)
        return void b.skip(
          "The buyer edits a vendor's bid", "buyer", "Buyer edits follow the rules above.",
          cfg.ok ? `buyer edits of a vendor's bid are switched off at ${b.c.company} (the company setting “buyer can edit a vendor's bid” is ${on === false ? "off" : "not set"}), so every edit would simply be refused` : `the company's settings could not be read (${said(cfg)})`,
        );
      const t = b.timing(0, 100, 60);
      // On this QA round only, the price field is marked buyer-editable (no PROCOL DEMO pricing template marks a line field so).
      const markPrice = (body: any) => {
        for (const w of body?.widgets?.inline_components ?? []) if (w?.key_attribute === "price") w.configuration = { ...(w.configuration ?? {}), is_buyer_editable: true };
      };
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs, tweak: markPrice }], { title: TITLE("M10") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      // What the round really carries: the setting copied onto it, and which fields the buyer may edit.
      const sch = await send(b.c.buyerApi, "GET", b.E.tradeSchema(trade));
      const roundOn = sch.data?.trade_config?.can_buyer_edit_bid;
      const editable = ((sch.data?.sheets?.inline_components?.widgets ?? []) as any[]).filter((w) => w?.configuration?.is_buyer_editable === true).map((w) => String(w.key_attribute));
      const priceEditable = editable.includes("price");
      b.push({
        title: "The round allows buyer edits and marks the price buyer-editable", actor: "buyer",
        expected: "The round carries the company's “buyer can edit a vendor's bid” setting, and its price field is buyer-editable.",
        actual: !sch.ok ? said(sch) : `Buyer edits ${roundOn === true ? "allowed" : `not allowed (${String(roundOn)})`} on the round; buyer-editable fields: ${editable.length ? editable.join(", ") : "none"}.`,
        verdict: !sch.ok ? "inconclusive" : roundOn === true && priceEditable ? "pass" : "fail", ms: sch.ms,
      });
      const r = await b.bid(A, ev, trade, 100);
      await b.bid(B2, ev, trade, 110);
      if (!r.submitted) return;
      const tp = await b.tradeProduct(b.c.buyerApi, trade, "the buyer");
      if (!tp) return void b.skip("The buyer edits the bid", "buyer", "Edits follow the rules.", "the round's line item could not be read");
      const edit = async (o: { title: string; expected: string; expect: Expect; price: number; gst?: number }) => {
        const id = (await b.activeBid(A, trade)) ?? b.bidOf(A, trade);
        if (!id) return b.skip(o.title, "buyer", o.expected, `${b.name(A)}'s active bid could not be found`);
        const body: any = b.B.buildSurrogateRfqBody({ pricingTradeUuid: trade, vendorCompanyUuid: A.vendorCompanyUuid, ...b.line(ev, o.price, tp) });
        const row = body.sheets.inline_components.data[A.vendorCompanyUuid][0];
        if (o.gst !== undefined) row.gst = { ...row.gst, value: o.gst };
        const res = await b.step({ title: o.title, actor: "buyer", expected: o.expected, expect: o.expect, api: b.c.buyerApi, method: "PATCH", path: `/bids/sheet_update/${id}`, body });
        if (res.reply.ok) {
          const now = await b.activeBid(A, trade);
          if (now) b.setBid(A, trade, now);
          const row = now ? await b.bidRow(now) : undefined;
          b.push({
            title: `${b.name(A)}'s current bid now carries ₹${o.price}`, actor: "buyer",
            expected: `The edit replaced ${b.name(A)}'s bid: the active bid is a new one at ₹${o.price} per ${b.c.unit}.`,
            actual: !row ? "The vendor's active bid could not be read back." : `The active bid is ${now === id ? "the same bid as before" : "a new bid"} at ₹${row.price ?? "?"} per ${b.c.unit}.`,
            verdict: !row ? "inconclusive" : Number(row.price) === o.price ? "pass" : "fail", ms: 0,
          });
        }
        return res.rec;
      };
      await edit({
        title: `Buyer saves ${b.name(A)}'s bid without changing anything`, price: 100,
        expected: "Refused: nothing was changed (758 “No changes found”).", expect: { refuse: ["758"] },
      });
      await edit({
        title: `Buyer adds 18% GST to ${b.name(A)}'s bid (a field the buyer may not edit)`, price: 100, gst: 18,
        expected: "Refused: only buyer-editable fields may be changed (747).", expect: { refuse: ["747"] },
      });
      await edit({
        title: `While bidding is open: buyer changes ${b.name(A)}'s price to ₹95`, price: 95,
        expected: priceEditable ? "Accepted: the price is buyer-editable and bidding is open." : "Refused (747): the price is not buyer-editable on this round.",
        expect: priceEditable ? { accept: true } : { refuse: ["747"] },
      });
      await b.until(t.bet + 4, "the bid end time to pass (extra closing time)");
      await edit({
        title: `In the extra closing time: buyer changes ${b.name(A)}'s price to ₹92`, price: 92,
        expected: priceEditable ? "Accepted: a buyer edit is allowed in the extra closing time." : "Refused (747): the price is not buyer-editable on this round.",
        expect: priceEditable ? { accept: true } : { refuse: ["747"] },
      });
      await b.until(t.ect + 4, "the extra closing time to end");
      await edit({
        title: `After the extra closing time: buyer changes ${b.name(A)}'s price to ₹90`, price: 90,
        expected: "Refused: buyer edits end with the extra closing time (101).", expect: { refuse: ["101"] },
      });
      // Open question: a cost-breakdown request — is there a separate vendor call? (Code: no; vendors answer through the normal bid.)
      const w = await b.step({
        title: `Ask ${b.name(A)} only for a cost breakdown, for two minutes`, actor: "buyer", expected: "A cost-breakdown window opens for QA vendor 1 only.",
        expect: { accept: true }, api: b.c.buyerApi, method: "PATCH", path: `/trade/${trade}`,
        body: { end_time_type: "request_for_cost_break_down", end_time: nowSec() + 120, end_time_applicable_vendor_ids: [A.vendorCompanyId] },
      });
      if (!w.reply.ok) return;
      await b.bid(A, ev, trade, 91, { label: `${b.name(A)} sends the cost breakdown through the normal bid` });
      await b.bid(B2, ev, trade, 104, {
        label: `${b.name(B2)} (not asked) revises in the cost-breakdown window`,
        open: { either: ["ok", "33"] }, openExpected: "A draft may open (it is only a draft).",
        submit: { probe: "CBD-WINDOW-UI-ONLY", defectIf: "accepted" },
      });
    },
  },
  {
    id: "M11",
    title: "Best-price request for one vendor: can another vendor revise in that window?",
    why: "A best-offer window opened for vendor A only is suspected to be enforced by the UI alone — the server lets every vendor bid while it is open.",
    clients: [198678],
    vendors: 2,
    run: async (b, vs) => {
      const [A, B2] = vs;
      const t = b.timing(0, 90, 5);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("M11") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      await b.bid(A, ev, trade, 100);
      await b.bid(B2, ev, trade, 110);
      await b.until(t.ect + 4, "the round to close");
      const w = await b.step({
        title: `Ask ${b.name(A)} only for a best price, for two minutes`, actor: "buyer", expected: "A best-price window opens for QA vendor 1 only.",
        expect: { accept: true }, api: b.c.buyerApi, method: "PATCH", path: `/trade/${trade}`,
        body: { end_time_type: "request_for_best_price", end_time: nowSec() + 120, end_time_applicable_vendor_ids: [A.vendorCompanyId] },
      });
      if (!w.reply.ok) return;
      await b.bid(B2, ev, trade, 95, {
        label: `${b.name(B2)} (not asked) revises in the best-price window`,
        open: { either: ["ok", "33"] }, openExpected: "A draft may open (it is only a draft).",
        submit: { probe: "REVIEW-WINDOW-UI-ONLY", defectIf: "accepted" },
      });
    },
  },
  {
    id: "M12",
    title: "Award while bidding is still open",
    why: "Awarding is blocked during bidding only when a setting is on (off everywhere), so a proposal can apparently be submitted while vendors can still bid — possibly intended.",
    clients: [32461, 198678],
    vendors: 1,
    run: async (b, vs) => {
      const t = b.timing(0, 240, 10);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("M12") });
      if (!ev) return;
      await b.bid(vs[0], ev, ev.trades.rfq!, 100);
      await b.award(ev, [{ v: vs[0], qty: b.c.qty }], {
        add: { probe: "AWARD-DURING-BIDDING", defectIf: "accepted" },
        addExpected: "Refused while bidding is open (720) — unless awarding during bidding is intended.",
      });
    },
  },
  {
    id: "M13",
    title: "A declined invitation does not stop a bid; declining needs a reason",
    why: "The decline is recorded but no bid guard reads it (suspected). A decline without a reason is refused (2).",
    clients: [198678],
    vendors: 3,
    run: async (b, vs) => {
      const t = b.timing(0, 150, 5);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs.slice(0, 2) }], { title: TITLE("M13") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      const api = await b.vendor(vs[0]);
      if (!api) return;
      await b.step({
        title: `${b.name(vs[0])} declines without a reason`, actor: b.name(vs[0]), expected: "Refused: a decline needs a reason (2).", expect: { refuse: ["2"] },
        api, method: "POST", path: "/user_intents", body: { item_type: "TradeRequest", item_uuid: trade, intent_type: "trade_reject" },
      });
      await b.step({
        title: `${b.name(vs[0])} declines the invitation with a reason`, actor: b.name(vs[0]), expected: "The decline is recorded.", expect: { accept: true },
        api, method: "POST", path: "/user_intents", body: { item_type: "TradeRequest", item_uuid: trade, intent_type: "trade_reject", reason: "QA platform test: declining" },
      });
      await b.bid(vs[0], ev, trade, 100, { label: `${b.name(vs[0])} bids after declining`, submit: { probe: "DECLINE-NOT-ENFORCED", defectIf: "accepted" } });
      await b.bid(vs[1], ev, trade, 110, { label: `${b.name(vs[1])} bids without accepting the terms pop-up` });
      // Suspected defect 3b: the surrogate path has no audience check, and its policy lets a vendor call it for itself.
      const outsider = vs[2];
      const oApi = outsider ? await b.vendor(outsider) : undefined;
      const tp = oApi ? await b.tradeProduct(b.c.buyerApi, trade, "the buyer") : undefined;
      if (oApi && tp)
        await b.step({
          title: `${b.name(outsider)}, not invited, bids for itself through the on-behalf endpoint`, actor: b.name(outsider),
          expected: "Refused — the vendor is not invited (and the on-behalf endpoint is for buyers). Code reading: no audience check, policy allows it.",
          expect: { probe: "SURROGATE-PATH-UNINVITED-VENDOR", defectIf: "accepted" }, api: oApi, method: "POST", path: b.E.surrogateRfqBid(),
          body: b.B.buildSurrogateRfqBody({ pricingTradeUuid: trade, vendorCompanyUuid: outsider.vendorCompanyUuid, ...b.line(ev, 90, tp) }),
          probeTitle: "An uninvited vendor bids on an event through the on-behalf endpoint",
        });
    },
  },
  {
    id: "M14",
    title: "A vendor enters a technical response for another vendor's company",
    why: "The surrogate technical endpoint has no authorization or company check (suspected): vendor A could answer for vendor B.",
    clients: [198678],
    vendors: 2,
    needsTech: true,
    run: async (b, vs) => {
      const t = b.timing(0, 120, 5);
      const ev = await b.build([{ kind: "rfp", timing: t, audience: vs }], { title: TITLE("M14") });
      if (!ev) return;
      const api = await b.vendor(vs[0]);
      const forms = api ? await b.forms(api, ev.trades.rfp!) : undefined;
      if (!api || !forms) return void b.skip("Vendor A answers for vendor B", b.name(vs[0]), "Refused.", "the technical round's forms could not be read as the vendor");
      await b.step({
        title: `${b.name(vs[0])} enters a technical response for ${b.name(vs[1])}'s company`, actor: b.name(vs[0]),
        expected: "Refused — a vendor may only respond for its own company.", expect: { probe: "TECH-FOR-ANY-COMPANY", defectIf: "accepted" },
        api, method: "POST", path: b.E.createSurrogateResponse(),
        body: b.B.buildSurrogateTechnicalBody({ technicalTradeUuid: ev.trades.rfp, vendorCompanyUuid: vs[1].vendorCompanyUuid, form0Page: forms[0].page_uuids[0], form1Page: forms[1].page_uuids[0] }),
        probeTitle: "A vendor can create a technical response for another company",
      });
    },
  },
  {
    id: "M15",
    title: "Auction with dynamic closing: a rank-changing bid in the last minute extends the auction by one minute",
    why: "With dynamic closing on (rank based, trigger = last 1 minute, extension = 1 minute, rank limit 1), a bid in the last minute that changes who is first must push the bid end out by one minute (bid.rb trigger_dynamic_time_extension), and a vendor can bid after the original end. A trigger longer than half the remaining window is refused when the round is created (501).",
    clients: [198678, 32461],
    vendors: 2,
    run: async (b, vs) => {
      const [A, B2] = vs;
      const { c } = b;
      const dyn = (trigger: number) => (body: any) => {
        const x = { is_dynamic_closing_time_allowed: true, dynamic_closing_time_strategy: "rank_based", last_n_minutes_for_time_extension: trigger, time_extension_value: 1, rank_limit_for_time_extension: 1 };
        Object.assign(body.configurations ?? (body.configurations = {}), x);
      };
      // 1) The trigger rule at creation: 2 minutes is more than half of a 3-minute window.
      const d = await b.step({
        title: "Create a draft event for the trigger-time check", actor: "buyer", expected: "A draft event is created.", expect: { accept: true },
        api: c.buyerApi, method: "POST", path: b.E.eventGroups(),
        body: b.B.buildEventGroupBody({ productUuid: c.cat.productUuid, quantityUnit: c.unit, quantityValue: c.qty, productQualityUuid: c.cat.productQualityUuid }),
      });
      const eg0 = d.reply.data?.uuid ? String(d.reply.data.uuid) : undefined;
      const line0 = d.reply.data?.event_group_line_item_ids?.[0] ? String(d.reply.data.event_group_line_item_ids[0]) : undefined;
      if (eg0 && line0) {
        const bad = b.timing(0, 180, 10);
        const body = b.B.buildPricingStageBody({
          eventGroupUuid: eg0, lineItemUuid: line0, vendorCompanyUuid: A.vendorCompanyUuid, pricingTemplateUuid: c.cat.pricingTemplateUuid,
          productUuid: c.cat.productUuid, productQualityUuid: c.cat.productQualityUuid, locationUuid: c.cat.locationUuid,
          quantityValue: c.qty, quantityUnit: c.unit, timing: bad, stageNo: 1, rfxMode: "auction", auctionConfig: "rank",
        });
        dyn(2)(body);
        await b.step({
          title: "Add an auction whose extension trigger (last 2 minutes) is more than half of its 3-minute window", actor: "buyer",
          expected: "Refused: the trigger must be at least 1 minute and less than half of the time left (501 “Invalid Trigger Time for Dynamic Time Extension”).",
          expect: { refuse: ["501"] }, api: c.buyerApi, method: "POST", path: b.E.createTrade(), body: { ...body, audience_company_uuids: [A.vendorCompanyUuid] },
        });
      }
      // 2) A valid dynamic-closing auction.
      const t = b.timing(0, 200, 10);
      const ev = await b.build([{ kind: "auction", timing: t, audience: vs, auctionConfig: "rank", tweak: dyn(1) }], { title: TITLE("M15") });
      if (!ev) return;
      const trade = ev.trades.auction!;
      const cfg = await send(c.buyerApi, "GET", b.E.tradeSchema(trade));
      const tc = cfg.data?.trade_config ?? {};
      b.push({
        title: "The auction carries the dynamic-closing settings", actor: "buyer",
        expected: "Dynamic closing on, rank based, trigger 1 minute, extension 1 minute, rank limit 1.",
        actual: !cfg.ok ? said(cfg) : `Dynamic closing ${tc.is_dynamic_closing_time_allowed === true ? "on" : `off (${String(tc.is_dynamic_closing_time_allowed)})`}, strategy ${tc.dynamic_closing_time_strategy ?? "not set"}, extension ${tc.time_extension_value ?? "?"} min, rank limit ${tc.rank_limit_for_time_extension ?? "?"}.`,
        verdict: !cfg.ok ? "inconclusive" : tc.is_dynamic_closing_time_allowed === true && tc.dynamic_closing_time_strategy === "rank_based" ? "pass" : "fail", ms: cfg.ms,
      });
      await b.bid(B2, ev, trade, 110);
      await b.bid(A, ev, trade, 100);
      const before = (await b.clock(trade))?.bet ?? t.bet;
      await b.until(before - 45, "the last minute before the bid end");
      await b.bid(B2, ev, trade, 95, { label: `In the last minute: ${b.name(B2)} takes first place with ₹95` });
      const after = await b.clock(trade);
      b.push({
        title: "The bid end moved out by one minute", actor: "buyer",
        expected: `The bid end moves from ${hhmmss(before)} to about ${hhmmss(before + 60)}.`,
        actual: after ? `The bid end is now ${hhmmss(after.bet)} (${after.bet - before >= 0 ? "+" : ""}${after.bet - before} s).` : "The round's times could not be read back.",
        verdict: !after ? "inconclusive" : Math.abs(after.bet - before - 60) <= 5 ? "pass" : "fail", ms: 0,
      });
      if (!after || after.bet - before < 30) return;
      await b.until(before + 5, "the ORIGINAL bid end to pass");
      await b.bid(A, ev, trade, 90, { label: `After the original end, inside the extension: ${b.name(A)} bids ₹90` });
      const again = await b.clock(trade);
      if (again)
        b.note(`After that bid (again in the last minute, and again changing first place) the bid end is ${hhmmss(again.bet)} (${again.bet - after.bet >= 0 ? "+" : ""}${again.bet - after.bet} s against the first extension).`);
    },
  },
  {
    id: "MX",
    title: "Configurable: vendors, surrogate, timing and award pattern chosen by the caller",
    why: "Lets a caller pick the permutation (vendor count, who bids on whose behalf, when, and how the award goes).",
    clients: [198678, 32461],
    vendors: 2,
    run: async (b, vs, o) => {
      const timing = o.timing ?? "normal";
      const t = b.timing(timing === "pre-start" ? 60 : 0, 120, timing === "extra-close" ? 60 : 10);
      const ev = await b.build([{ kind: "rfq", timing: t, audience: vs }], { title: TITLE("MX") });
      if (!ev) return;
      const trade = ev.trades.rfq!;
      const sur = (i: number) => o.surrogate === "all" || (o.surrogate === "first" && i === 0);
      if (timing === "pre-start") {
        for (let i = 0; i < vs.length; i++)
          if (sur(i)) await b.surrogate(vs[i], ev, trade, PRICE[i % 3] + i, { accept: true }, "Accepted before the start (surrogate).");
          else await b.bid(vs[i], ev, trade, PRICE[i % 3] + i, { open: { refuse: ["33"] }, label: `Before the start: ${b.name(vs[i])}`, openExpected: "Refused before the start (33)." });
        await b.until(t.bst + 3, "the window to open");
      }
      if (timing === "after-close" || timing === "extra-close") await b.until((timing === "after-close" ? t.ect : t.bet) + 4, "the chosen point in time");
      const late = timing === "after-close" || timing === "extra-close";
      for (let i = 0; i < vs.length; i++) {
        if (timing === "pre-start" && sur(i)) continue;
        if (sur(i)) await b.surrogate(vs[i], ev, trade, PRICE[i % 3] + i, late ? { refuse: ["33"] } : { accept: true }, late ? "Refused after the bid end (33)." : "Accepted.");
        else await b.bid(vs[i], ev, trade, PRICE[i % 3] + i, late ? { open: timing === "extra-close" ? { either: ["ok", "33"] } : { refuse: ["33"] }, products: { refuse: ["508", "33"] }, submit: { refuse: ["33"] } } : {});
      }
      if (timing === "extend") {
        await b.until(t.ect + 4, "the round to close");
        await b.extend(trade, nowSec() + 120, b.c.companyId === 198678 ? { accept: true } : { refuse: ["496"] }, "Extension after the close.");
      }
      if ((o.award ?? "one") !== "none" && !late) {
        await b.until(t.ect + 8, "the window to end before awarding");
        if (o.award === "split" && b.c.companyId === 198678) await b.award(ev, vs.map((v, i) => ({ v, qty: i === 0 ? b.c.qty - (vs.length - 1) * Math.floor(b.c.qty / vs.length) : Math.floor(b.c.qty / vs.length) })));
        else await b.award(ev, [{ v: vs[0], qty: b.c.qty }]);
      }
    },
  },
];

export const DEFAULT_ORDER = ["M1", "M5", "M6", "M7", "M8", "M2", "M3", "M4", "M9", "M10", "M11", "M12", "M13", "M14"];

// ── the run ────────────────────────────────────────────────────────────────

function countOf(steps: MatrixStep[]): Record<MatrixVerdict, number> {
  const c: Record<MatrixVerdict, number> = { pass: 0, fail: 0, defect: 0, inconclusive: 0, skipped: 0 };
  for (const s of steps) c[s.verdict]++;
  return c;
}

function comboVerdict(steps: MatrixStep[]): MatrixVerdict {
  const c = countOf(steps);
  if (c.defect) return "defect";
  if (c.fail) return "fail";
  if (!steps.length || (c.inconclusive && !c.pass)) return "inconclusive";
  if (c.inconclusive) return "inconclusive";
  return c.pass ? "pass" : "skipped";
}

/** Run the matrix for one client (QA vendors must exist — see matrixVendors.ensureQaVendors). */
export async function runBiddingMatrix(companyId: number, opts: MatrixRunOptions = {}): Promise<MatrixRunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const onLine = opts.onLine ?? (() => {});
  const s = await sibling();
  const client = await openClientContext(companyId, opts.baseURL);
  const probes: ProbeResult[] = [];
  const combos: ComboResult[] = [];
  const reopened: any[] = [];
  try {
    const ctx = client.ctx as any;
    const company = client.companyName ?? `company ${companyId}`;
    const vendors = await listQaVendors(companyId);
    const other = companyId === 198678 ? 32461 : 198678;
    const strangers = await listQaVendors(other);
    const cat0 = ctx.catalog ?? {};
    const ch = opts.choose ?? {};
    const cat = {
      productUuid: ch.productUuid ?? cat0.productUuid,
      productQualityUuid: (ch.productUuid && ch.productQualityUuid) || cat0.productQualityUuid,
      technicalTemplateUuid: ch.technicalTemplateUuid ?? cat0.technicalTemplateUuid ?? "",
      pricingTemplateUuid: ch.pricingTemplateUuid ?? cat0.pricingTemplateUuid,
      locationUuid: cat0.locationUuid,
      useRfqQuotes: cat0.useRfqQuotes ?? true,
    };
    // The unit: the caller's, else the configured one if this company lists it, else the best-ranked listed unit.
    const { CONFIG } = await imp("config.ts");
    let unit: string = ch.unit ?? CONFIG?.testData?.quantityUnit ?? "KG";
    if (!ch.unit && s.resolveAlternatives) {
      const alts = await s.resolveAlternatives(ctx.buyerApi).catch(() => undefined);
      const units: string[] = alts?.units ?? [];
      const prod = (alts?.products ?? []).find((p: any) => p.uuid === cat.productUuid);
      if (units.length && !unitListed(units, unit)) {
        const ranked = rankUnits(units, prod?.units ?? []);
        if (ranked[0]) {
          onLine(`Unit: ${company} does not list “${unit}”; using “${ranked[0]}”.`);
          unit = ranked[0];
        }
      }
    }
    let current: any = client;
    const reopenBuyer = async () => {
      const fresh: any = await openClientContext(companyId, opts.baseURL).catch(() => undefined);
      if (!fresh?.ctx?.buyerApi) return undefined;
      current = fresh;
      reopened.push(fresh);
      c.buyerApi = fresh.ctx.buyerApi;
      return c.buyerApi;
    };
    const c: Ctx = {
      reopenBuyer, buyerReopens: 0,
      s, buyerApi: ctx.buyerApi, companyId, company, evaluatorUuid: ctx.evaluatorUuid, evaluatorPhone: ctx.evaluatorPhone, cat, unit, qty: 30, vendors, strangers,
      baseURL: opts.baseURL, onLine, onStep: opts.onStep, probes,
    };
    const ids = opts.combos?.length ? opts.combos : DEFAULT_ORDER;
    for (const id of ids) {
      const combo = COMBOS.find((x) => x.id === id);
      if (!combo) continue;
      if (!combo.clients.includes(companyId) && !opts.combos?.includes(id)) continue;
      const want = id === "MX" ? Math.max(1, Math.min(opts.vendorCount ?? combo.vendors, 4)) : combo.vendors;
      const b = new Bench(c, id);
      const cs = Date.now();
      onLine(`▶ ${id} — ${combo.title} (${company})`);
      try {
        if (!cat.productUuid || !cat.pricingTemplateUuid || !cat.locationUuid) b.skip("Build the event", "buyer", "An event is built.", "this client's catalog has no product, pricing template or location");
        else if (vendors.length < Math.min(want, 3) || (want === 4 && vendors.length < 3)) b.skip("Invite the vendors", "buyer", `${want} QA vendors are invited.`, `only ${vendors.length} QA vendor(s) are set up for ${company} — run the vendor setup first`);
        else if (combo.needsTech && (!cat.technicalTemplateUuid || !ctx.evaluatorUuid)) b.skip("Add the technical round", "buyer", "A technical round is attached.", "no technical template or evaluator is known for this client");
        else await combo.run(b, vendors.slice(0, want), opts);
      } catch (e) {
        b.note(`The combination stopped with an error in the platform: ${e instanceof Error ? e.message : String(e)}`);
        b.push({ title: "The run itself", actor: "platform", expected: "The combination runs to the end.", actual: `It stopped: ${e instanceof Error ? e.message : String(e)}.`, verdict: "inconclusive", ms: 0 });
      } finally {
        await b.dispose();
      }
      const res: ComboResult = {
        id, title: combo.title, why: combo.why, companyId, company, verdict: comboVerdict(b.steps), steps: b.steps, counts: countOf(b.steps),
        notes: b.notes, eventGroupUuid: b.eventGroupUuid, startedAt: new Date(cs).toISOString(), durationMs: Date.now() - cs,
      };
      combos.push(res);
      onLine(`■ ${id}: ${res.verdict} — ${Object.entries(res.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")} in ${Math.round(res.durationMs / 1000)} s`);
    }
    return {
      companyId, company, startedAt, durationMs: Date.now() - t0,
      vendors: vendors.map((v) => ({ n: v.n, name: v.name, email: v.email })), combos, probes,
    };
  } finally {
    for (const r of reopened) await r.dispose?.().catch(() => {});
    await client.dispose().catch(() => {});
  }
}

/** One line per combination, for logs and the CLI. */
export function matrixSummary(r: MatrixRunResult): string[] {
  return r.combos.map((c) => `${c.id.padEnd(4)} ${c.verdict.padEnd(12)} ${String(c.steps.length).padStart(3)} steps  ${Math.round(c.durationMs / 1000)} s  ${lower(c.title)}`);
}
