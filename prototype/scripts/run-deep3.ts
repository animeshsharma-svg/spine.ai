/**
 * EVENTS DEEP-DIG ROUND 3 — award outcomes and real multi-vendor competition, run live.
 *
 *   npx tsx scripts/run-deep3.ts --check                         parse the deep3 catalog files; list scenarios and the cases each one checks (no network)
 *   npx tsx scripts/run-deep3.ts --c 198678                      run every scenario on its own fresh event
 *     --scenarios S1,S2,S3   only these scenarios
 *     --no-confirm           do not re-run a scenario with a failure on a second fresh event
 *
 * Scenarios (each builds its OWN fresh QA_Platform_ event with the client's QA vendors — never real suppliers):
 *   S1  four vendors on one RFQ: own bids, a surrogate bid, rebids, a tie at the best price, one vendor that never bids;
 *       buyer standings and every vendor's view after each move; a split award with exact totals; remove / re-add;
 *       submit into an approval the buyer can approve; the orders the award creates.
 *   S2  rank auction with dynamic closing: ranks each vendor sees, a tie at the best price, a late bid that must
 *       extend the closing time and an early one that must not; nothing of a competitor in any vendor reply.
 *   S3  two line items, three vendors: line-wise split award, exact totals, the orders carry only the awarded line.
 *
 * Every request goes through `send()`, which refuses — without sending — any request the acting app may not make
 * (versioned routes: data/app-access.json; unversioned: procol-backend config/app_auth_config.yml, read with
 * `git show origin/main:`). A buyer token never calls a vendor-only route and vice versa (json_helpers.rb:31-35:
 * a wrong-app 401 signs that session out).
 *
 * Numbers are never hard-coded expectations: every expected total, rank and quantity is computed from what THIS run
 * submitted. Procol's database is read with SELECT only, and only for this run's own records.
 *
 * Results: data/runs/deep3/<company>-<time>.json (git-ignored with the rest of data/runs).
 * Case ids in the results are the catalog ids of test-cases/events-deep3-*.md (API-EVD<AREA>-NNN); the runnable
 * scenario id of each case is named in its Trace as EVD3-<AREA>-NNN.
 */
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });

import { openClientContext, PROCOL_TEST } from "../src/executor.js";
import { listQaVendors, vendorClient, type QaVendor } from "../src/checks/matrixVendors.js";
import { decodeProcolId, encodeProcolId } from "../src/checks/biddingMatrix.js";
import { redactSecrets } from "../src/checks/engine.js";
import { appOf } from "../src/checks/appAccess.js";
import { backoffMs, rankUnits, unitListed } from "../src/checks/resilience.js";

const ROOT = join(here, "..", "..");
const BACKEND = join(ROOT, "procol-backend");
const RUNS_DIR = join(here, "..", "data", "runs", "deep3");
const MD_DIR = join(ROOT, "test-cases");

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);
const hhmmss = (sec: number) => new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const rupees = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const near = (a: number | undefined, b: number, eps = 0.01) => a !== undefined && Number.isFinite(a) && Math.abs(a - b) <= eps;
const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);

// ── which app may call what ────────────────────────────────────────────────

interface AccessFile { routes: { method: string; pattern: string; version: string; controller: string; action: string }[]; apps: Record<"console" | "vendor", Record<string, Record<string, string[]>>> }
let accessFile: AccessFile | null | undefined;
function access(): AccessFile | null {
  if (accessFile !== undefined) return accessFile;
  try {
    accessFile = JSON.parse(readFileSync(join(here, "..", "data", "app-access.json"), "utf8"));
  } catch {
    accessFile = null;
  }
  return accessFile ?? null;
}

/** Unversioned routes this runner uses → controller#action (config/routes.rb). Anything else unversioned is never sent. */
const UNVERSIONED: Array<[string, RegExp, string, string]> = [
  ["POST", /^\/event_groups$/, "event_groups", "create"],
  ["GET", /^\/event_groups\/[^/]+$/, "event_groups", "show"],
  ["PATCH", /^\/event_groups\/[^/]+$/, "event_groups", "update"],
  ["POST", /^\/trade\/template_input$/, "trade", "template_input"],
  ["GET", /^\/trade\/[^/]+$/, "trade", "show"],
  ["PATCH", /^\/trade\/[^/]+$/, "trade", "update"],
  ["POST", /^\/bids\/template_input$/, "bids", "template_input"],
  ["GET", /^\/bids\/[^/]+$/, "bids", "show"],
  ["POST", /^\/proposal$/, "proposal", "create"],
  ["GET", /^\/proposal\/[^/]+$/, "proposal", "show"],
  ["POST", /^\/proposal\/[^/]+\/add_response$/, "proposal", "add_response"],
  ["GET", /^\/proposal\/[^/]+\/approval_workflows$/, "proposal", "approval_workflows_for_proposal_create"],
  ["POST", /^\/proposal\/[^/]+\/submit$/, "proposal", "submit"],
  ["POST", /^\/proposal\/discard_draft_proposal$/, "proposal", "discard_draft_proposal"],
  ["GET", /^\/orders\/[^/]+$/, "orders", "show"],
];
const APP_CLIENT = { console: "client_admin_dashboard", vendor: "agribid_website" } as const;
let aac: any;
function appAuthConfig(): any {
  if (aac !== undefined) return aac;
  try {
    aac = YAML.parse(execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/app_auth_config.yml"], { encoding: "utf8", maxBuffer: 16e6, timeout: 30_000 }));
  } catch {
    aac = null;
  }
  return aac;
}

/** Why this app may not send this request (undefined = allowed). Strict: an unmapped route is never sent. */
function wrongApp(app: "console" | "vendor" | undefined, method: string, rawPath: string): string | undefined {
  if (!app) return "the session's app could not be identified — not sent";
  const path = rawPath.split("?")[0];
  const m = method.toUpperCase();
  if (/^\/(v1|v2|v3|supplier_suite|approval_workflow)\//.test(path)) {
    const a = access();
    if (!a) return "data/app-access.json could not be read — not sent";
    const segs = path.split("/").filter(Boolean);
    const r = a.routes.find((x) => {
      if (x.method !== m) return false;
      const p = x.pattern.split("/").filter(Boolean);
      return p.length === segs.length && p.every((s, i) => s.startsWith(":") || s === segs[i]);
    });
    if (!r) return `${m} ${path} is not in the route table — not sent`;
    const ok = (a.apps[app]?.[r.version]?.[r.controller] ?? []).includes(r.action);
    return ok ? undefined : `the ${app === "console" ? "buyer console" : "vendor website"} may not call ${r.controller}#${r.action} — a 401 would sign the session out`;
  }
  const hit = UNVERSIONED.find(([mm, re]) => mm === m && re.test(path));
  if (!hit) return `${m} ${path} is not in this runner's route table — not sent`;
  const cfg = appAuthConfig();
  if (!cfg) return "procol-backend's config/app_auth_config.yml could not be read — not sent";
  const ok = Object.prototype.hasOwnProperty.call(cfg?.[APP_CLIENT[app]]?.[hit[2]] ?? {}, hit[3]);
  return ok ? undefined : `the ${app === "console" ? "buyer console" : "vendor website"} may not call ${hit[2]}#${hit[3]} (config/app_auth_config.yml) — a 401 would sign the session out`;
}

// ── one request ────────────────────────────────────────────────────────────

interface Reply { status: number; ok: boolean; data: any; code?: string; message?: string; ms: number; notSent?: string }
const ENV_STATUS = new Set([0, 408, 429, 502, 503, 504]);

/** The only way this runner talks to Procol: app-guarded, 60 s bound per try, environment failures tried twice more. */
async function send(api: any, method: string, path: string, body?: unknown): Promise<Reply> {
  const why = wrongApp(appOf(api), method, path);
  if (why) return { status: 0, ok: false, data: null, message: `not sent: ${why}`, ms: 0, notSent: why };
  const t = Date.now();
  for (let tries = 1; ; tries++) {
    let r: Reply;
    try {
      const x: any = await Promise.race([
        api.attempt(method, path, body === undefined ? {} : { body }),
        sleep(60_000).then(() => ({ status: 0, ok: false, data: null, errorMessage: "no reply within 60 s" })),
      ]);
      r = { status: typeof x?.status === "number" ? x.status : 0, ok: !!x?.ok, data: x?.data, code: x?.errorCode != null ? String(x.errorCode) : undefined, message: redactSecrets(x?.errorMessage) ?? undefined, ms: 0 };
    } catch (e) {
      r = { status: 0, ok: false, data: null, message: redactSecrets(e instanceof Error ? e.message : String(e)) ?? "request failed", ms: 0 };
    }
    if (!ENV_STATUS.has(r.status) || tries > 2) return { ...r, ms: Date.now() - t };
    await sleep(backoffMs(tries));
  }
}

function said(r: Reply): string {
  if (r.notSent) return `not sent — ${r.notSent}`;
  if (r.status === 0) return `no reply came back (${r.message ?? "network"})`;
  if (r.ok) return `the app accepted it (HTTP ${r.status})`;
  return `the app refused it: “${r.message ?? "no message"}” (HTTP ${r.status}${r.code ? `, code ${r.code}` : ""})`;
}

const SECRET_KEY = /otp|token|password|secret|authorization|cookie/i;
function redact(body: unknown): unknown {
  if (body === undefined || body === null) return body;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length > 8 ? [...v.slice(0, 8).map(walk), `… ${v.length - 8} more`] : v.map(walk);
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

/** A Procol formatted amount ("₹ 1,23,456.00", 123456, "123456.0") as a number. */
function amount(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[^\d.-]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ── what a run records ─────────────────────────────────────────────────────

type Verdict = "passed" | "failed" | "couldn't tell" | "not run";
type Expect = { accept: true } | { refuse: string[] } | { either: string[] };

interface Step {
  n: number;
  /** catalog case ids this step decides (API-EVD<AREA>-NNN) */
  cases: string[];
  title: string;
  actor: string;
  expected: string;
  actual: string;
  verdict: Verdict;
  /** a stable key, so a re-run on a fresh event can be compared step by step */
  key: string;
  details?: { method?: string; path?: string; body?: unknown; status?: number; code?: string; message?: string; evidence?: unknown };
  ms: number;
  at: string;
}

interface ScenarioResult {
  id: string;
  title: string;
  companyId: number;
  company: string;
  attempt: number;
  eventGroupUuid?: string;
  eventTitle?: string;
  steps: Step[];
  notes: string[];
  startedAt: string;
  durationMs: number;
}

// ── the bench: one scenario's state and moves ──────────────────────────────

interface Ctx {
  bodies: any;
  E: any;
  buyerApi: any;
  buyerUserId?: number;
  companyId: number;
  company: string;
  cat: { productUuid: string; productQualityUuid: string; pricingTemplateUuid: string; locationUuid: string };
  unit: string;
  vendors: QaVendor[];
  baseURL?: string;
  reopenBuyer: () => Promise<any | undefined>;
}

interface Line { uuid: string; qty: number }
interface Built { eg: string; title: string; lines: Line[]; trade: string; bst: number; bet: number; ect: number }

let dbq: ((sql: string, params?: unknown[]) => Promise<any[]>) | undefined;
async function db(sql: string, params: unknown[] = []): Promise<any[] | undefined> {
  try {
    if (!dbq) dbq = (await imp("db/pool.ts")).query;
    return await Promise.race([dbq!(sql, params), sleep(40_000).then(() => undefined)]);
  } catch {
    return undefined;
  }
}

class Bench {
  steps: Step[] = [];
  notes: string[] = [];
  eventGroupUuid?: string;
  eventTitle?: string;
  private apis = new Map<number, any>();
  private products = new Map<string, any[]>();
  /** each vendor's latest submitted bid uuid per round */
  bidUuid = new Map<string, string>();
  /** approver row ids this run approved (for the approve-twice check) */
  approved: number[] = [];
  constructor(readonly c: Ctx, readonly scenario: string) {}

  name(v: QaVendor) {
    return `QA vendor ${v.n}`;
  }
  get B() {
    return this.c.bodies;
  }
  get E() {
    return this.c.E;
  }

  push(st: Omit<Step, "n" | "at" | "key"> & { key?: string }): Step {
    const rec: Step = { ...st, n: this.steps.length + 1, at: new Date().toISOString(), key: st.key ?? `${st.cases.join("+") || "setup"}:${st.title}` } as Step;
    this.steps.push(rec);
    const mark = { passed: "✓", failed: "✗", "couldn't tell": "?", "not run": "–" }[rec.verdict];
    log(`  ${mark} ${this.scenario}.${rec.n} ${rec.title} — ${rec.actual}`);
    return rec;
  }
  skip(cases: string[], title: string, actor: string, expected: string, reason: string) {
    return this.push({ cases, title, actor, expected, actual: `Not run: ${reason}.`, verdict: "not run", ms: 0 });
  }
  note(t: string) {
    this.notes.push(t);
    log(`  · ${t}`);
  }

  /** One decisive request with its expectation, judged only by the reply. */
  async step(o: {
    cases: string[]; title: string; actor: string; expected: string; expect: Expect; api: any; method: string; path: string; body?: unknown; key?: string;
    ok?: (data: any) => { actual?: string; short?: string } | void;
  }): Promise<{ rec: Step; reply: Reply }> {
    let reply = await send(o.api, o.method, o.path, o.body);
    if (reply.status === 401 && o.api === this.c.buyerApi) {
      const fresh = await this.c.reopenBuyer().catch(() => undefined);
      if (fresh) {
        this.note(`The buyer's session answered 401; a fresh session was opened and the request sent again.`);
        reply = await send(fresh, o.method, o.path, o.body);
      }
    }
    let verdict: Verdict;
    let actual = said(reply);
    if (reply.notSent || reply.status === 0) verdict = "couldn't tell";
    else if (reply.status >= 500) {
      verdict = "failed";
      actual = `The app crashed: HTTP ${reply.status} with no typed error (${reply.message ?? "no message"}).`;
    } else if ("accept" in o.expect) verdict = reply.ok ? "passed" : "failed";
    else if ("refuse" in o.expect) {
      verdict = !reply.ok && reply.code !== undefined && o.expect.refuse.includes(reply.code) ? "passed" : "failed";
      if (reply.ok) actual = `The app ACCEPTED it, though it should have refused (${o.expect.refuse.join(" / ")}).`;
      else if (verdict === "failed") actual = `Refused, but not for the expected reason: “${reply.message ?? "no message"}” (code ${reply.code ?? "none"}; expected ${o.expect.refuse.join(" / ")}).`;
    } else {
      const hit = reply.ok ? o.expect.either.includes("ok") : reply.code !== undefined && o.expect.either.includes(reply.code);
      verdict = hit ? "passed" : "failed";
    }
    if (reply.ok && o.ok) {
      const x = o.ok(reply.data) ?? {};
      if (x.actual) actual = x.actual;
      if (x.short && "accept" in o.expect) {
        verdict = "failed";
        actual = `The app answered success but ${x.short}.`;
      }
    }
    const rec = this.push({
      cases: o.cases, title: o.title, actor: o.actor, expected: o.expected, key: o.key,
      actual: actual.charAt(0).toUpperCase() + actual.slice(1), verdict,
      details: { method: o.method, path: o.path, ...(o.body === undefined ? {} : { body: redact(o.body) }), status: reply.status, code: reply.code, message: reply.message },
      ms: reply.ms,
    });
    return { rec, reply };
  }

  /** Wait until an epoch second, capped at `capMin` minutes; returns false when the cap cut the wait short. */
  async until(sec: number, why: string, capMin = 7): Promise<boolean> {
    const due = sec * 1000 - Date.now();
    if (due <= 0) return true;
    const cap = Math.min(due, capMin * 60_000);
    log(`  … waiting ${Math.round(cap / 1000)} s until ${hhmmss(sec)} — ${why}`);
    await sleep(cap);
    return cap === due;
  }

  async vendor(v: QaVendor): Promise<any | undefined> {
    if (this.apis.has(v.n)) return this.apis.get(v.n);
    const t = Date.now();
    const r = await vendorClient(this.c.companyId, v.email, this.c.baseURL);
    if (!r.api) this.push({ cases: [], title: `Sign in as ${this.name(v)}`, actor: this.name(v), expected: "The QA vendor signs in with an emailed one-time code.", actual: `Could not sign in: ${r.error}.`, verdict: "couldn't tell", ms: Date.now() - t });
    else this.apis.set(v.n, r.api);
    return r.api;
  }
  async dispose() {
    for (const api of this.apis.values()) await Promise.resolve(api?.dispose?.()).catch(() => {});
    this.apis.clear();
  }

  // ── the buyer builds ──

  /**
   * Draft with `qtys.length` line items → one pricing round (RFQ or auction) → publish. The round's real clock is read
   * back (the app moves a start already in the past to now).
   */
  async build(o: { kind: "rfq" | "auction"; qtys: number[]; openFor: number; extra: number; audience: QaVendor[]; tweak?: (cfg: any) => void; titleTag: string }): Promise<Built | undefined> {
    const { c } = this;
    const title = `QA_Platform_Deep3_${o.titleTag}_${Date.now()}`;
    const body: any = this.B.buildEventGroupBody({ productUuid: c.cat.productUuid, quantityUnit: c.unit, quantityValue: o.qtys[0], productQualityUuid: c.cat.productQualityUuid });
    body.line_items = o.qtys.map((q) => ({ product_uuid: c.cat.productUuid, quantity: { unitSymbol: c.unit, value: q }, product_quality_uuid: c.cat.productQualityUuid }));
    const draft = await this.step({
      cases: [], title: `Create the draft event with ${o.qtys.length} line item${o.qtys.length > 1 ? "s" : ""}`, actor: "buyer",
      expected: `A draft event is created (${o.qtys.map((q) => `${q} ${c.unit}`).join(" and ")}).`, expect: { accept: true },
      api: c.buyerApi, method: "POST", path: this.E.eventGroups(), body,
      ok: (d) => ((d?.event_group_line_item_ids?.length ?? 0) >= o.qtys.length ? { actual: `Draft ${d.uuid} was created.` } : { short: `the reply carried ${d?.event_group_line_item_ids?.length ?? 0} line item id(s), not ${o.qtys.length}` }),
    });
    if (draft.rec.verdict !== "passed") return undefined;
    const eg = String(draft.reply.data.uuid);
    this.eventGroupUuid = eg;
    this.eventTitle = title;
    const lineIds: string[] = draft.reply.data.event_group_line_item_ids.map(String);
    const lines: Line[] = o.qtys.map((q, i) => ({ uuid: lineIds[i], qty: q }));
    const bst = nowSec();
    const timing = { bst, bet: bst + o.openFor, ect: bst + o.openFor + o.extra };
    const stage: any = this.B.buildPricingStageBody({
      eventGroupUuid: eg, lineItemUuid: lines[0].uuid, vendorCompanyUuid: o.audience[0].vendorCompanyUuid, pricingTemplateUuid: c.cat.pricingTemplateUuid,
      productUuid: c.cat.productUuid, productQualityUuid: c.cat.productQualityUuid, locationUuid: c.cat.locationUuid,
      quantityValue: lines[0].qty, quantityUnit: c.unit, timing, stageNo: 1, rfxMode: o.kind, ...(o.kind === "auction" ? { auctionConfig: "rank" } : {}),
    });
    const row0 = stage.data[0];
    stage.data = lines.map((l, i) => ({
      ...JSON.parse(JSON.stringify(row0)),
      product: { ...row0.product, event_group_line_item_uuid: l.uuid },
      creator_quantity: { ...row0.creator_quantity, value: l.qty },
      order: i + 1,
    }));
    o.tweak?.(stage.configurations);
    const label = o.kind === "auction" ? "auction round" : "pricing round (RFQ)";
    const r = await this.step({
      cases: [], title: `Add the ${label} for ${o.audience.length} vendors`, actor: "buyer",
      expected: `The ${label} is attached with ${o.audience.map((v) => this.name(v)).join(", ")} invited; bidding ${hhmmss(timing.bst)}–${hhmmss(timing.bet)}.`, expect: { accept: true },
      api: c.buyerApi, method: "POST", path: this.E.createTrade(), body: { ...stage, audience_company_uuids: o.audience.map((v) => v.vendorCompanyUuid) },
      ok: (d) => (d?.uuid ? { actual: `The ${label} was attached as ${d.uuid}.` } : { short: "the reply carried no round id" }),
    });
    if (r.rec.verdict !== "passed") return undefined;
    const trade = String(r.reply.data.uuid);
    const pub = await this.step({
      cases: [], title: "Publish the event", actor: "buyer", expected: `The event goes live for ${o.audience.length} vendors.`, expect: { accept: true },
      api: c.buyerApi, method: "PATCH", path: this.E.eventGroup(eg),
      body: { ...this.B.buildPublishBody({ title, technicalTradeUuid: trade, pricingTradeUuid: trade, vendorCompanyUuid: o.audience[0].vendorCompanyUuid }), draft_trade_request_uuids: [trade], audience_company_uuids: o.audience.map((v) => v.vendorCompanyUuid) },
      ok: (d) => (d?.status === "active" ? { actual: `“${title}” is live.` } : { short: `the event came back as “${d?.status}”` }),
    });
    if (!pub.reply.ok) return undefined;
    const clk = await this.clock(trade);
    if (clk && Math.abs(clk.bet - timing.bet) >= 2) this.note(`The app moved the round's window by ${clk.bet - timing.bet} s: bid end ${hhmmss(clk.bet)}.`);
    return { eg, title, lines, trade, bst: clk?.bst || timing.bst, bet: clk?.bet ?? timing.bet, ect: clk?.ect ?? timing.ect };
  }

  /** The round's clock as the app has it now (buyer read). */
  async clock(trade: string): Promise<{ bst: number; bet: number; ect: number } | undefined> {
    const r = await send(this.c.buyerApi, "GET", this.E.tradeDetails(trade));
    const d = r.data ?? {};
    const pick = (...ks: string[]) => {
      for (const k of ks) {
        const v = d[k] ?? d.trade_config?.[k] ?? d.config?.[k];
        if (v !== undefined && v !== null && v !== "") return typeof v === "number" ? (v > 1e12 ? Math.floor(v / 1000) : v) : Math.floor(new Date(v).getTime() / 1000);
      }
      return undefined;
    };
    const bet = pick("ending_at", "bid_end_time", "end_time");
    const ect = pick("extra_closing_time", "closed_at");
    const bst = pick("starting_from", "starting_at", "bid_start_time");
    return bet ? { bst: bst ?? 0, bet, ect: ect ?? bet } : undefined;
  }

  /** The round's products (one per line item, in line order) as `who` reads them. */
  async tradeProducts(api: any, b: Built, who: string): Promise<any[] | undefined> {
    const key = `${who}:${b.trade}`;
    if (this.products.has(key)) return this.products.get(key);
    const r = await send(api, "GET", this.E.tradeDetails(b.trade));
    const od: any[] = Array.isArray(r.data?.order_details) ? r.data.order_details : [];
    const out: any[] = [];
    for (const l of b.lines) {
      const hit = od.find((x) => x?.product?.event_group_line_item_uuid === l.uuid) ?? od[out.length];
      const p = hit?.product;
      if (!p?.trade_product_uuid) {
        this.note(`${who} could not read the round's line items (${said(r)}).`);
        return undefined;
      }
      out.push({ trade_product_uuid: p.trade_product_uuid, trade_product_id: p.trade_product_id, trade_product_category_uuid: p.trade_product_category_uuid, product_id: p.id, product_code: p.product_code });
    }
    this.products.set(key, out);
    return out;
  }

  private row(b: Built, li: number, price: number, tp: any, v: QaVendor, surrogate: boolean) {
    const a = { pricingTradeUuid: b.trade, vendorCompanyUuid: v.vendorCompanyUuid, productUuid: this.c.cat.productUuid, productQualityUuid: this.c.cat.productQualityUuid, locationUuid: this.c.cat.locationUuid, lineItemUuid: b.lines[li].uuid, quantityValue: b.lines[li].qty, quantityUnit: this.c.unit, price, tradeProduct: tp };
    const body: any = surrogate ? this.B.buildSurrogateRfqBody(a) : this.B.buildBidProductsBody(a).body;
    const row = body.sheets.inline_components.data[v.vendorCompanyUuid][0];
    row.serial_number = { value: li + 1, key: "serial_number" };
    return { body, row };
  }

  /** The vendor's own bid (open → price every line → submit). `prices[i]` is the unit price of line i. */
  async bid(v: QaVendor, b: Built, prices: number[], o: { cases?: string[]; label?: string; expectSubmit?: Expect; expectedSubmit?: string } = {}): Promise<{ submitted: boolean; code?: string }> {
    const who = this.name(v);
    const label = o.label ?? `${who} bids ${prices.map(rupees).join(" / ")} per ${this.c.unit}`;
    const api = await this.vendor(v);
    if (!api) return { submitted: false };
    const open = await this.step({
      cases: [], title: `${label}: open a bid`, actor: who, expected: `A bid is opened for ${who}.`, expect: { accept: true },
      api, method: "POST", path: this.E.createBid(), body: this.B.buildCreateBid({ pricingTradeUuid: b.trade, vendorCompanyUuid: v.vendorCompanyUuid }),
      ok: (d) => ((d?.bid_uuid ?? d?.uuid) ? { actual: `Bid ${d.bid_uuid ?? d.uuid} was opened.` } : { short: "the reply carried no bid id" }),
    });
    if (!open.reply.ok) return { submitted: false, code: open.reply.code };
    const bidUuid = String(open.reply.data?.bid_uuid ?? open.reply.data?.uuid);
    const tps = await this.tradeProducts(api, b, who);
    if (!tps) return { submitted: false };
    const rows = prices.map((p, i) => this.row(b, i, p, tps[i], v, false));
    const body = rows[0].body;
    body.sheets.inline_components.data[v.vendorCompanyUuid] = rows.map((r) => r.row);
    const total = prices.reduce((s, p, i) => s + p * b.lines[i].qty, 0);
    const prod = await this.step({
      cases: [], title: `${label}: price ${b.lines.length > 1 ? "the lines" : "the line"}`, actor: who,
      expected: `${prices.map((p, i) => `${rupees(p)} × ${b.lines[i].qty}`).join(" + ")} = ${rupees(total)} is accepted.`, expect: { accept: true },
      api, method: "POST", path: this.E.createBidProducts(bidUuid), body,
    });
    if (!prod.reply.ok) return { submitted: false, code: prod.reply.code };
    const sub = await this.step({
      cases: o.cases ?? [], title: `${label}: submit`, actor: who, expected: o.expectedSubmit ?? `${who}'s bid of ${rupees(total)} is submitted.`, expect: o.expectSubmit ?? { accept: true },
      api, method: "PATCH", path: this.E.submitBid(bidUuid), body: this.B.buildSubmitBidBody({ pricingTradeUuid: b.trade, vendorCompanyUuid: v.vendorCompanyUuid, total }),
      ok: (d) => (d?.success === false ? { short: "the app answered success: false" } : { actual: `${who}'s bid of ${rupees(total)} was submitted.` }),
    });
    if (sub.reply.ok) this.bidUuid.set(`${v.n}:${b.trade}`, bidUuid);
    return { submitted: sub.reply.ok, code: sub.reply.code };
  }

  /** The buyer enters a price on a vendor's behalf (surrogate RFQ bid), single-line rounds. */
  async surrogate(v: QaVendor, b: Built, price: number, cases: string[], expect: Expect = { accept: true }, expected?: string) {
    const tps = await this.tradeProducts(this.c.buyerApi, b, "the buyer");
    if (!tps) return this.skip(cases, `Buyer bids for ${this.name(v)}`, "buyer", "Accepted.", "the round's line item could not be read");
    const { body } = this.row(b, 0, price, tps[0], v, true);
    return (await this.step({
      cases, title: `Buyer enters ${rupees(price)} on ${this.name(v)}'s behalf`, actor: "buyer", expected: expected ?? `The surrogate bid is placed for ${this.name(v)}.`, expect,
      api: this.c.buyerApi, method: "POST", path: this.E.surrogateRfqBid(), body,
    })).rec;
  }

  /** The vendor's active bid on the round, read with SELECT (a surrogate bid has no uuid in our hands). */
  async activeBid(v: QaVendor, b: Built): Promise<{ uuid: string; id: number; price: number | null; status: number; end_epoch: number | null } | undefined> {
    const tid = decodeProcolId(b.trade);
    if (!tid) return undefined;
    const rows = await db(
      "SELECT b.id, b.price, b.status, extract(epoch FROM b.end_time)::bigint AS end_epoch FROM bids b JOIN bid_trades bt ON bt.bid_id = b.id WHERE bt.trade_request_id = $1 AND b.company_id = $2 AND b.status IN (1, 2, 6) ORDER BY b.id DESC LIMIT 1",
      [tid, v.vendorCompanyId],
    );
    const r = rows?.[0];
    return r ? { uuid: encodeProcolId(Number(r.id)), id: Number(r.id), price: r.price == null ? null : Number(r.price), status: Number(r.status), end_epoch: r.end_epoch == null ? null : Number(r.end_epoch) } : undefined;
  }

  /** The buyer's comparison: best bidder flag and rank per vendor on one line, and the L1 price of that line. */
  async standings(b: Built, li = 0): Promise<{ by: Map<string, { rank?: number; best?: boolean }>; l1?: number; raw: unknown } | undefined> {
    const by = new Map<string, { rank?: number; best?: boolean }>();
    const line = b.lines[li].uuid;
    // The indicators are keyed by the round's product (trade product) uuid, not the line item's
    // (app/services/sourcing_engine/auction_indicators_service.rb:122-150).
    const tps = await this.tradeProducts(this.c.buyerApi, b, "the buyer");
    const tpu: string | undefined = tps?.[li]?.trade_product_uuid;
    const ind = await send(this.c.buyerApi, "GET", this.E.eventIndicators(b.trade));
    for (const [company, v] of Object.entries<any>(ind.data?.auction_identifiers_data ?? {})) {
      const inl = (tpu ? v?.inline?.[tpu]?.rank : undefined) ?? v?.inline?.[line]?.rank ?? (b.lines.length === 1 ? Object.values<any>(v?.inline ?? {})[0]?.rank : undefined);
      const raw = inl?.value ?? v?.global?.rank?.value;
      const n = typeof raw === "number" ? raw : /^\D*(\d+)$/.test(String(raw ?? "")) ? Number(String(raw).replace(/\D/g, "")) : undefined;
      by.set(company, { rank: n, best: typeof inl?.best_bidder === "boolean" ? inl.best_bidder : undefined });
    }
    const sch = await send(this.c.buyerApi, "GET", `/v1/trade/${b.trade}/schema?response_type=template&additional_fields=order_details&l1_prices=true`);
    const lib = sch.data?.l1_prices?.line_item_based ?? {};
    const l1raw = (lib[line] ?? (tpu ? lib[tpu] : undefined) ?? (b.lines.length === 1 ? Object.values<any>(lib)[0] : undefined))?.price;
    if (!ind.ok && !sch.ok) return undefined;
    return { by, l1: amount(l1raw), raw: { indicators: ind.data?.auction_identifiers_data, l1_prices: sch.data?.l1_prices } };
  }

  async checkStandings(b: Built, best: QaVendor[], all: QaVendor[], l1: number, cases: string[], title: string, li = 0) {
    const st = await this.standings(b, li);
    const expected = `${best.map((v) => this.name(v)).join(" and ")} marked best bidder${best.length > 1 ? "s" : ""}, every other vendor not; lowest (L1) price ${rupees(l1)}.`;
    if (!st) return this.push({ cases, title, actor: "buyer", expected, actual: "The buyer's comparison could not be read.", verdict: "couldn't tell", ms: 0 });
    const words = all.map((v) => {
      const x = st.by.get(v.vendorCompanyUuid);
      return `${this.name(v)}: ${x?.best ? "best bidder" : x ? "not best" : "not listed"}${x?.rank !== undefined ? ` (rank ${x.rank})` : ""}`;
    });
    const bestOk = all.every((v) => (st.by.get(v.vendorCompanyUuid)?.best ?? false) === best.includes(v));
    const l1Ok = near(st.l1, l1);
    return this.push({
      cases, title, actor: "buyer", expected,
      actual: `${words.join("; ")}. L1 price ${st.l1 !== undefined ? rupees(st.l1) : "not shown"}.`,
      verdict: bestOk && l1Ok ? "passed" : st.l1 === undefined && bestOk ? "couldn't tell" : "failed", details: { evidence: st.raw }, ms: 0,
    });
  }

  // ── what a vendor can see ──

  /**
   * Read everything the vendor's own app shows about the round and scan it for anything of the competitors: their
   * company names, company ids/uuids, unit prices and totals. Values equal to the vendor's OWN prices are not
   * counted (a tie makes a competitor's price indistinguishable from one's own, so it is dropped from the list).
   */
  async leakScan(v: QaVendor, b: Built, competitors: { v: QaVendor; prices: number[] }[], own: number[], cases: string[], when: string, allowBest?: number[]) {
    const who = this.name(v);
    const api = await this.vendor(v);
    const title = `${when}: ${who}'s own views show nothing of the other vendors`;
    const expected = `Nothing of another vendor — no name, no company id, no price or total — in the round, the round's page data or the event as ${who} reads them.`;
    if (!api) return this.skip(cases, title, who, expected, `${who} could not sign in`);
    const ownSet = new Set([...own.map((x) => x.toFixed(2)), ...own.flatMap((x) => b.lines.map((l) => (x * l.qty).toFixed(2)))]);
    const allowSet = new Set((allowBest ?? []).map((x) => x.toFixed(2)));
    const nums = new Map<string, string>();
    const strs = new Map<string, string>();
    for (const c of competitors) {
      strs.set(c.v.name, `${this.name(c.v)}'s company name`);
      strs.set(c.v.vendorCompanyUuid, `${this.name(c.v)}'s company id`);
      for (const [i, p] of c.prices.entries()) {
        const unit = p.toFixed(2);
        const tot = (p * b.lines[Math.min(i, b.lines.length - 1)].qty).toFixed(2);
        if (!ownSet.has(unit) && !allowSet.has(unit)) nums.set(unit, `${this.name(c.v)}'s price ${rupees(p)}`);
        if (!ownSet.has(tot)) nums.set(tot, `${this.name(c.v)}'s total ${rupees(Number(tot))}`);
      }
    }
    const reads: [string, string][] = [
      ["the round", this.E.tradeDetails(b.trade)],
      ["the round's page data", this.E.tradeSchema(b.trade)],
      ["the event", this.E.eventGroup(b.eg)],
    ];
    const hits: { where: string; path: string; what: string }[] = [];
    let readOk = 0;
    const failed: string[] = [];
    for (const [where, path] of reads) {
      const r = await send(api, "GET", path);
      if (!r.ok) {
        failed.push(`${where}: ${said(r)}`);
        continue;
      }
      readOk++;
      const walk = (x: any, p: string, depth: number) => {
        if (depth > 14 || hits.length > 40) return;
        if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${p}[${i}]`, depth + 1));
        else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) walk(y, p ? `${p}.${k}` : k, depth + 1);
        else if (typeof x === "number" || (typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x.trim()))) {
          const key = Number(x).toFixed(2);
          if (nums.has(key) && !/(_id|uuid|^id|\.id|count|time|_at|epoch|stamp|no|number|order|quantity)$/i.test(p)) hits.push({ where, path: p, what: nums.get(key)! });
        } else if (typeof x === "string") {
          for (const [s, what] of strs) if (x.includes(s)) hits.push({ where, path: p, what });
        }
      };
      walk(r.data, "", 0);
    }
    const verdict: Verdict = readOk === 0 ? "couldn't tell" : hits.length ? "failed" : "passed";
    return this.push({
      cases, title, actor: who, expected,
      actual: readOk === 0 ? `None of the views could be read (${failed.join("; ")}).`
        : hits.length ? `${who} can see: ${[...new Set(hits.map((h) => `${h.what} (in ${h.where})`))].slice(0, 6).join("; ")}.`
        : `${readOk} of ${reads.length} views read; none shows anything of another vendor${failed.length ? ` (not readable: ${failed.join("; ")})` : ""}.`,
      verdict, details: { evidence: { hits: hits.slice(0, 20), looked_for: [...nums.values(), ...strs.values()] } }, ms: 0,
    });
  }

  /** A vendor opens another vendor's bid by its id: must be refused (32). */
  async peekOtherBid(v: QaVendor, other: QaVendor, b: Built, cases: string[]) {
    const who = this.name(v);
    const ob = await this.activeBid(other, b);
    const api = await this.vendor(v);
    const title = `${who} opens ${this.name(other)}'s bid by its id`;
    const expected = `Refused: a vendor may not open another vendor's quote (code 32 “Bid not found”).`;
    if (!ob || !api) return this.skip(cases, title, who, expected, !ob ? `${this.name(other)}'s bid could not be found` : `${who} could not sign in`);
    return (await this.step({ cases, title, actor: who, expected, expect: { refuse: ["32"] }, api, method: "GET", path: `/v1/trade/${b.trade}/quote_details/${ob.uuid}` })).rec;
  }

  /** The rank the vendor sees for itself (auction views). */
  async vendorRank(v: QaVendor, b: Built): Promise<{ rank?: number; ok: boolean; said: string }> {
    const api = await this.vendor(v);
    if (!api) return { ok: false, said: "could not sign in" };
    const r = await send(api, "GET", this.E.tradeDetails(b.trade));
    if (!r.ok) return { ok: false, said: said(r) };
    const m = JSON.stringify(r.data ?? {}).match(/"rank":\s*\{?\s*(?:"value":\s*)?"?L?(\d+)/);
    return { ok: true, rank: m ? Number(m[1]) : undefined, said: m ? `rank ${m[1]}` : "no rank" };
  }

  // ── award ──

  async openProposal(b: Built, cases: string[] = [], expect: Expect = { accept: true }, title = "Open an award proposal", expected = "A draft award proposal is opened.") {
    const p = await this.step({ cases, title, actor: "buyer", expected, expect, api: this.c.buyerApi, method: "POST", path: this.E.proposal(), body: this.B.buildProposalBody({ eventGroupUuid: b.eg }) });
    return p.reply.ok && p.reply.data?.uuid ? String(p.reply.data.uuid) : undefined;
  }

  async addResponse(proposal: string, b: Built, parts: { v: QaVendor; lines: { li: number; qty?: number }[]; action?: "add" | "remove" }[], cases: string[], title: string, expected: string, expect: Expect = { accept: true }) {
    const responses: Record<string, any> = {};
    for (const p of parts) {
      // As the dashboard sends it (procol-client-dashboard src/redux/project/actions.js updateProposalResponse):
      // a quantity goes in egli_data; without one (and for every remove) only the line ids go, as egli_uuids.
      const withQty = p.lines.filter((l) => l.qty !== undefined);
      if ((p.action ?? "add") === "add" && withQty.length === p.lines.length) {
        const egli: Record<string, any> = {};
        for (const l of p.lines) egli[b.lines[l.li].uuid] = { awarded_quantity: l.qty };
        responses[p.v.vendorCompanyUuid] = { action: "add", egli_data: egli };
      } else responses[p.v.vendorCompanyUuid] = { action: p.action ?? "add", egli_uuids: p.lines.map((l) => b.lines[l.li].uuid) };
    }
    await sleep(3_200); // the app refuses a second change to the same proposal within 3 s (516)
    return this.step({ cases, title, actor: "buyer", expected, expect, api: this.c.buyerApi, method: "POST", path: this.E.proposalAddResponse(proposal), body: { responses } });
  }

  /** The proposal's stored numbers (SELECT): per-vendor total and awarded quantities, and the L1 / non-L1 totals. */
  async proposalRow(proposal: string): Promise<{ status: number; l1: number; nonL1: number; vendors: Record<string, { total: number; egli: Record<string, any> }> } | undefined> {
    const id = decodeProcolId(proposal);
    const rows = id ? await db("SELECT status, responses_hash, meta_data FROM proposals WHERE id = $1", [id]) : undefined;
    const r = rows?.[0];
    if (!r) return undefined;
    const data = r.responses_hash?.data ?? {};
    const vendors: Record<string, { total: number; egli: Record<string, any> }> = {};
    for (const [cid, x] of Object.entries<any>(data)) vendors[cid] = { total: Number(x?.total_amount ?? 0), egli: x?.egli_data ?? {} };
    return { status: Number(r.status), l1: Number(r.meta_data?.total_l1_proposal ?? 0), nonL1: Number(r.meta_data?.total_non_l1_proposal ?? 0), vendors };
  }

  /**
   * The award maths, against what this run submitted: each vendor's total = Σ awarded quantity × its unit price on
   * that line; the proposal total = Σ vendors; L1 total = the part awarded to a vendor holding the best price on the
   * line (a tie at the best price is still the best price).
   */
  async checkAwardMaths(proposal: string, b: Built, award: { v: QaVendor; lines: { li: number; qty: number; price: number; isBest: boolean }[] }[], cases: { vendor: string[]; total: string[]; l1?: string[] }, when: string) {
    const row = await this.proposalRow(proposal);
    const show = await send(this.c.buyerApi, "GET", `/proposal/${proposal}`);
    const pv = show.data?.proposal_values ?? {};
    const shown = { total: amount(pv.total_proposal_value), l1: amount(pv.total_l1_proposal), nonL1: amount(pv.total_non_l1_proposal) };
    const exp = award.map((a) => ({ a, total: a.lines.reduce((s, l) => s + l.qty * l.price, 0) }));
    const expTotal = exp.reduce((s, x) => s + x.total, 0);
    const expL1 = award.reduce((s, a) => s + a.lines.filter((l) => l.isBest).reduce((t, l) => t + l.qty * l.price, 0), 0);
    for (const x of exp) {
      const got = row?.vendors[String(x.a.v.vendorCompanyId)];
      this.push({
        cases: cases.vendor, title: `${when}: the amount awarded to ${this.name(x.a.v)}`, actor: "buyer",
        expected: `${x.a.lines.map((l) => `${l.qty} ${this.c.unit} × ${rupees(l.price)}`).join(" + ")} = ${rupees(x.total)}.`,
        actual: !row ? "The proposal could not be read back." : !got ? `${this.name(x.a.v)} is not on the proposal.` : `The proposal holds ${rupees(got.total)} for ${this.name(x.a.v)} (awarded quantities: ${Object.values(got.egli).map((e: any) => e?.awarded_quantity ?? "whole line").join(", ")}).`,
        verdict: !row ? "couldn't tell" : got && near(got.total, x.total) ? "passed" : "failed", details: { evidence: { stored: got } }, ms: 0,
      });
    }
    const totalGot = shown.total ?? (row ? row.l1 + row.nonL1 : undefined);
    this.push({
      cases: cases.total, title: `${when}: the proposal's total value`, actor: "buyer",
      expected: `The total is ${rupees(expTotal)} (the sum of what each vendor was awarded).`,
      actual: totalGot === undefined ? `The total could not be read (${said(show)}).` : `The proposal shows ${rupees(totalGot)}${row ? ` (stored: L1 ${rupees(row.l1)} + other ${rupees(row.nonL1)})` : ""}.`,
      verdict: totalGot === undefined ? "couldn't tell" : near(totalGot, expTotal) ? "passed" : "failed", details: { evidence: { proposal_values: pv, stored: row && { l1: row.l1, nonL1: row.nonL1 } } }, ms: 0,
    });
    if (cases.l1) {
      const l1Got = shown.l1 ?? row?.l1;
      this.push({
        cases: cases.l1, title: `${when}: the part awarded at the best (L1) price`, actor: "buyer",
        expected: `${rupees(expL1)} of the award went to vendors holding the best price on their line.`,
        actual: l1Got === undefined ? "Could not be read." : `The proposal shows ${rupees(l1Got)} as awarded to L1 and ${rupees(shown.nonL1 ?? row?.nonL1 ?? 0)} to others.`,
        verdict: l1Got === undefined ? "couldn't tell" : near(l1Got, expL1) ? "passed" : "failed", details: { evidence: { proposal_values: pv } }, ms: 0,
      });
    }
    return row;
  }

  /** Pick the award approval flow whose every step the BUYER can approve (so the award can be completed); else the first. */
  async pickFlow(proposal: string): Promise<{ uuid?: string; buyerCanApprove: boolean; count: number; said: string }> {
    const wf = await send(this.c.buyerApi, "GET", this.E.proposalApprovalWorkflows(proposal));
    const flows: any[] = Array.isArray(wf.data) ? wf.data : wf.data?.approval_workflows ?? wf.data?.data ?? [];
    if (!flows.length) return { buyerCanApprove: false, count: 0, said: wf.ok ? "no approval workflow applies" : said(wf) };
    const me = this.c.buyerUserId ? encodeProcolId(this.c.buyerUserId) : undefined;
    const mine = me ? flows.find((f) => Array.isArray(f?.steps) && f.steps.length > 0 && f.steps.every((s: any) => JSON.stringify(s?.approvers ?? s).includes(me))) : undefined;
    const f = mine ?? flows[0];
    return { uuid: f?.uuid ? String(f.uuid) : undefined, buyerCanApprove: !!mine, count: flows.length, said: `${flows.length} flow(s) apply` };
  }

  /** Approve every pending step the buyer is the approver of (SELECT for the approver id, then resolve as the buyer). */
  async approveAsBuyer(proposal: string, cases: string[]): Promise<boolean> {
    const pid = decodeProcolId(proposal);
    const me = this.c.buyerUserId ? `u-${this.c.buyerUserId}` : undefined;
    if (!pid || !me) {
      this.skip(cases, "Approve the award", "buyer (approver)", "Each step is approved.", "the proposal or the buyer's user id is unknown");
      return false;
    }
    for (let stepNo = 1; stepNo <= 4; stepNo++) {
      let pending: any[] | undefined;
      for (let i = 0; i < 6; i++) {
        pending = await db(
          `SELECT a.id, a.approver_identifier, s."order" FROM approvers a JOIN approval_steps s ON s.id = a.approval_step_id JOIN approval_requests ar ON ar.id = s.approval_request_id
            WHERE ar.resource_type = 'Proposal' AND ar.resource_id = $1 AND a.status = 2 ORDER BY ar.id DESC, s."order"`,
          [pid],
        );
        if (pending?.length) break;
        const st = await this.proposalRow(proposal);
        if (st && st.status !== 4) return st.status === 2;
        await sleep(3_000);
      }
      const mineRow = pending?.find((p) => p.approver_identifier === me);
      if (!pending?.length) {
        this.skip(cases, `Approve step ${stepNo} of the award`, "buyer (approver)", "The step is approved.", "no pending approver was found in 18 s");
        return false;
      }
      if (!mineRow) {
        this.skip(cases, `Approve step ${stepNo} of the award`, "approver", "The step is approved.", `the pending approver is another user (${pending.map((p) => p.approver_identifier.replace(/\d(?=\d{2})/g, "•")).join(", ")}), not the buyer this run signs in as`);
        return false;
      }
      const r = await this.step({
        cases, title: `Approve step ${mineRow.order} of the award (the buyer is its approver)`, actor: "buyer (approver)", expected: "The step is approved.", expect: { accept: true },
        api: this.c.buyerApi, method: "POST", path: "/approval_workflow/approval_requests/resolve_approval",
        body: { approver_uuid: encodeProcolId(Number(mineRow.id)), resolution: "accepted", remarks: "QA_Platform_deep3 approve" },
      });
      if (!r.reply.ok) return false;
      this.approved.push(Number(mineRow.id));
      await sleep(2_000);
    }
    const st = await this.proposalRow(proposal);
    return st?.status === 2;
  }

  /** Orders this round created (SELECT), with their items. */
  async orders(b: Built): Promise<any[] | undefined> {
    const tid = decodeProcolId(b.trade);
    if (!tid) return undefined;
    const rows = await db("SELECT id, invoice_no, seller_company_id, quantity, price, final_price, status, bid_id FROM orders WHERE trade_request_id = $1 ORDER BY id", [tid]);
    if (!rows) return undefined;
    for (const o of rows) o.items = (await db("SELECT id, quantity, price_json, parent_detail, other_details FROM order_items WHERE order_id = $1 ORDER BY id", [o.id])) ?? [];
    return rows;
  }
}


// ── shared tail: submit the award, approve it, and check the orders it creates ──

interface Awarded { v: QaVendor; lines: { li: number; qty: number; price: number; isBest: boolean }[] }

async function submitApproveAndOrders(b: Bench, ev: Built, proposal: string, award: Awarded[], losers: QaVendor[], ids: { nfaSubmit: string[]; nfa573: string[]; nfa721: string[]; nfa888: string[]; nfaApprove: string[]; nfaTwice: string[]; apoOne: string[]; apoItemQty: string[]; apoPrice: string[]; apoHeaderQty: string[]; apoOnlyLine?: string[]; apoApi?: string[]; awdStatus: string[] }) {
  const c = b.c;
  const flow = await b.pickFlow(proposal);
  if (!flow.uuid) {
    b.skip(ids.nfaSubmit, "Submit the award", "buyer", "The award is submitted.", `no approval workflow could be chosen (${flow.said}); a no-approval award is out of this run's reach at ${c.company}`);
    return;
  }
  if (!flow.buyerCanApprove) b.note(`None of the ${flow.count} applicable award flows at ${c.company} has the buyer as approver on every step; the award will stay in approval and the order checks cannot run.`);
  const sub = await b.step({
    cases: ids.nfaSubmit, title: "Submit the award into its approval workflow", actor: "buyer",
    expected: "Accepted; the proposal now waits for approval (status requested) and is no longer a draft.", expect: { accept: true },
    api: c.buyerApi, method: "POST", path: b.E.proposalSubmit(proposal), body: b.B.buildAwardSubmitBody({ approvalFlowUuid: flow.uuid }),
  });
  if (!sub.reply.ok) return;
  const st = await b.proposalRow(proposal);
  b.push({
    cases: ids.nfaSubmit, title: "The submitted proposal is waiting for approval", actor: "buyer", expected: "Proposal status “requested”.",
    actual: st ? `Proposal status is ${({ 2: "selected", 3: "draft", 4: "requested" } as Record<number, string>)[st.status] ?? st.status}.` : "Could not be read.",
    verdict: !st ? "couldn't tell" : st.status === 4 ? "passed" : "failed", ms: 0,
  });
  await b.openProposal(ev, ids.nfa573, { refuse: ["573"] }, "Open a second award proposal while one is in approval", "Refused: an award for this event is already submitted (573).");
  await b.addResponse(proposal, ev, [{ v: award[0].v, lines: [{ li: award[0].lines[0].li, qty: award[0].lines[0].qty }] }], ids.nfa721, "Change the submitted proposal", "Refused: only a draft proposal can be changed (721 “Proposal does not exists”), or 573 because the award is already submitted.", { refuse: ["721", "573"] });
  await b.step({
    cases: ids.nfa888, title: "Discard the submitted proposal", actor: "buyer", expected: "Refused: only a draft can be discarded (888).", expect: { refuse: ["888"] },
    api: c.buyerApi, method: "POST", path: "/proposal/discard_draft_proposal", body: { proposal_uuid: proposal },
  });
  if (!flow.buyerCanApprove) {
    b.skip([...ids.nfaApprove, ...ids.apoOne, ...ids.apoItemQty, ...ids.apoPrice, ...ids.apoHeaderQty, ...(ids.apoOnlyLine ?? []), ...ids.awdStatus], "Approve the award and read the orders", "approver",
      "The award completes and one order per awarded vendor is created.", `the approvers of every applicable flow at ${c.company} include someone other than the buyer this run signs in as`);
    return;
  }
  const done = await b.approveAsBuyer(proposal, ids.nfaApprove);
  const after = await b.proposalRow(proposal);
  b.push({
    cases: ids.nfaApprove, title: "Once every step is approved the award is final", actor: "buyer", expected: "Proposal status “selected”.",
    actual: after ? `Proposal status is ${({ 2: "selected", 3: "draft", 4: "requested", 5: "rejected" } as Record<number, string>)[after.status] ?? after.status}.` : "Could not be read.",
    verdict: !after ? "couldn't tell" : after.status === 2 ? "passed" : done ? "failed" : "couldn't tell", ms: 0,
  });
  if (b.approved.length)
    await b.step({
      cases: ids.nfaTwice, title: "Approve the same (already approved) step again", actor: "buyer (approver)",
      expected: "Refused: the step is no longer pending (4 “Request not found”); nothing changes.", expect: { refuse: ["4", "491"] },
      api: c.buyerApi, method: "POST", path: "/approval_workflow/approval_requests/resolve_approval",
      body: { approver_uuid: encodeProcolId(b.approved[0]), resolution: "accepted", remarks: "QA_Platform_deep3 approve again" },
    });
  if (after?.status !== 2) return;
  // Orders: created when the awarded bids become selected (bid.rb:2190-2209). Bounded poll: 60 s.
  let orders: any[] | undefined;
  for (let i = 0; i < 12; i++) {
    orders = await b.orders(ev);
    if ((orders?.length ?? 0) >= award.length) break;
    await sleep(5_000);
  }
  if (!orders) return void b.skip(ids.apoOne, "Read the orders the award created", "buyer", "One order per awarded vendor.", "the orders could not be read");
  const sellers = orders.map((o) => Number(o.seller_company_id));
  const expectSellers = award.map((a) => a.v.vendorCompanyId);
  const extra = losers.filter((v) => sellers.includes(v.vendorCompanyId));
  const missing = award.filter((a) => !sellers.includes(a.v.vendorCompanyId));
  b.push({
    cases: ids.apoOne, title: "One order per awarded vendor, none for anyone else", actor: "buyer",
    expected: `${award.length} order${award.length > 1 ? "s" : ""}: ${award.map((a) => b.name(a.v)).join(", ")}; none for ${losers.map((v) => b.name(v)).join(", ") || "anyone else"}.`,
    actual: `${orders.length} order(s) for ${orders.map((o) => { const v = c.vendors.find((x) => x.vendorCompanyId === Number(o.seller_company_id)); return v ? b.name(v) : `company ${o.seller_company_id}`; }).join(", ") || "nobody"}.`,
    verdict: !missing.length && !extra.length && orders.length === expectSellers.length ? "passed" : "failed", details: { evidence: orders.map((o) => ({ seller: o.seller_company_id, quantity: o.quantity, price: o.price, items: o.items.map((i: any) => i.quantity) })) }, ms: 0,
  });
  for (const a of award) {
    const os = orders.filter((o) => Number(o.seller_company_id) === a.v.vendorCompanyId);
    const o = os[0];
    const qty = a.lines.reduce((s, l) => s + l.qty, 0);
    const itemQty = os.flatMap((x) => x.items).reduce((s: number, i: any) => s + Number(i.quantity), 0);
    b.push({
      cases: ids.apoItemQty, title: `${b.name(a.v)}'s order lines carry the awarded quantity`, actor: "buyer",
      expected: `${a.lines.map((l) => `${l.qty} ${c.unit}`).join(" + ")} on the order lines.`,
      actual: !o ? "No order was created." : `The order lines hold ${os.flatMap((x) => x.items).map((i: any) => `${Number(i.quantity)} ${c.unit}`).join(" + ") || "nothing"}.`,
      verdict: !o ? "failed" : near(itemQty, qty) && os.flatMap((x) => x.items).length === a.lines.length ? "passed" : "failed", ms: 0,
    });
    if (a.lines.length === 1)
      b.push({
        cases: ids.apoPrice, title: `${b.name(a.v)}'s order carries its awarded unit price`, actor: "buyer", expected: `${rupees(a.lines[0].price)} per ${c.unit}.`,
        actual: !o ? "No order was created." : `The order's price is ${rupees(Number(o.price))} per ${c.unit}.`,
        verdict: !o ? "failed" : near(Number(o.price), a.lines[0].price) ? "passed" : "failed", ms: 0,
      });
    b.push({
      cases: ids.apoHeaderQty, title: `${b.name(a.v)}'s order states the awarded quantity`, actor: "buyer",
      expected: `The order's quantity is ${qty} ${c.unit} — what was awarded, not what was quoted.`,
      actual: !o ? "No order was created." : `The order's quantity is ${Number(o.quantity)} ${c.unit} (order lines: ${itemQty}).`,
      verdict: !o ? "failed" : near(Number(o.quantity), qty) ? "passed" : "failed", details: { evidence: { order_id: o?.id, header_quantity: o?.quantity, item_quantities: o?.items?.map((i: any) => i.quantity) } }, ms: 0,
    });
    if (ids.apoApi && o) {
      // orders#show looks the order up by its invoice number (app/controllers/api/orders_controller.rb:206-211).
      const r = await send(c.buyerApi, "GET", `/orders/${encodeURIComponent(String(o.invoice_no))}`);
      const d = r.data ?? {};
      const q = amount(d.quantity ?? d.order?.quantity);
      const p = amount(d.price ?? d.order?.price);
      b.push({
        cases: ids.apoApi, title: `The buyer's order page for ${b.name(a.v)} shows the same quantity and price`, actor: "buyer",
        expected: `${qty} ${c.unit}${a.lines.length === 1 ? ` at ${rupees(a.lines[0].price)}` : ""}.`,
        actual: !r.ok ? said(r) : `The order page shows ${q ?? "no"} quantity${p !== undefined ? ` at ${rupees(p)}` : ""}.`,
        verdict: !r.ok || q === undefined ? "couldn't tell" : near(q, qty) && (a.lines.length > 1 || p === undefined || near(p, a.lines[0].price)) ? "passed" : "failed",
        details: { evidence: { keys: Object.keys(d).slice(0, 40), quantity: d.quantity, price: d.price } }, ms: r.ms,
      });
    }
  }
  if (ids.apoOnlyLine) {
    const tid = decodeProcolId(ev.trade);
    for (const a of award) {
      const lineIds = a.lines.map((l) => decodeProcolId(ev.lines[l.li].uuid));
      const rows = await db(
        `SELECT btp.status, m.event_group_line_item_id egli FROM bid_trade_products btp
           JOIN event_group_line_item_trade_mappings m ON m.reference_type = 'TradeProduct' AND m.reference_id = btp.trade_product_id
          WHERE btp.company_id = $1 AND btp.trade_product_id IN (SELECT id FROM trade_products WHERE trade_request_id = $2) AND btp.status IN (2, 10)`,
        [a.v.vendorCompanyId, tid],
      );
      const sel = (rows ?? []).filter((r) => Number(r.status) === 2).map((r) => Number(r.egli));
      const neg = (rows ?? []).filter((r) => Number(r.status) === 10).map((r) => Number(r.egli));
      const otherLines = ev.lines.map((l) => decodeProcolId(l.uuid)).filter((x) => !lineIds.includes(x));
      b.push({
        cases: ids.apoOnlyLine, title: `${b.name(a.v)}'s bid: only the awarded line is selected`, actor: "buyer",
        expected: `Line${lineIds.length > 1 ? "s" : ""} ${a.lines.map((l) => l.li + 1).join(", ")} selected; the vendor's other line${otherLines.length > 1 ? "s" : ""} marked not awarded (negotiated).`,
        actual: !rows ? "Could not be read." : `Selected line(s): ${sel.map((x) => ev.lines.findIndex((l) => decodeProcolId(l.uuid) === x) + 1).join(", ") || "none"}; not awarded: ${neg.map((x) => ev.lines.findIndex((l) => decodeProcolId(l.uuid) === x) + 1).join(", ") || "none"}.`,
        verdict: !rows ? "couldn't tell" : lineIds.every((x) => sel.includes(x!)) && otherLines.every((x) => neg.includes(x!)) && sel.length === lineIds.length ? "passed" : "failed",
        details: { evidence: rows }, ms: 0,
      });
    }
  }
  for (const a of award) {
    const bid = await b.activeBid(a.v, ev);
    b.push({
      cases: ids.awdStatus, title: `${b.name(a.v)}'s bid is marked awarded`, actor: "buyer", expected: "The vendor's bid status is “selected”.",
      actual: !bid ? "No active or awarded bid was found." : `The bid's status is ${({ 1: "active", 2: "selected", 6: "requested" } as Record<number, string>)[bid.status] ?? bid.status}.`,
      verdict: !bid ? "couldn't tell" : bid.status === 2 ? "passed" : "failed", ms: 0,
    });
  }
}

// ── the scenarios ──────────────────────────────────────────────────────────

interface Scenario { id: string; title: string; vendors: number; run: (b: Bench, vs: QaVendor[]) => Promise<void> }

const left = (ev: Built) => ev.bet - nowSec();

const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    title: "Four vendors on one RFQ — own bids, a surrogate bid, rebids and a tie; a split award with exact totals; approval; orders",
    vendors: 4,
    run: async (b, vs) => {
      const [V1, V2, V3, V4] = vs;
      const QTY = 30;
      const ev = await b.build({ kind: "rfq", qtys: [QTY], openFor: 330, extra: 20, audience: vs, titleTag: "S1" });
      if (!ev) return;
      const guard = (what: string) => {
        if (left(ev) > 15) return true;
        b.note(`Only ${left(ev)} s of bidding left — “${what}” and the bids after it were not attempted.`);
        return false;
      };
      const P = { v1: 4817, v3s: 4861, v2: 4903, v2r: 4789, v1r: 4789, v3own: 4851 };
      // 1. first bid
      if (!guard("QA vendor 1's first bid")) return;
      await b.bid(V1, ev, [P.v1]);
      await b.checkStandings(ev, [V1], vs, P.v1, ["API-EVDCMP-001"], "After the first bid: QA vendor 1 leads");
      await b.leakScan(V2, ev, [{ v: V1, prices: [P.v1] }], [], ["API-EVDLEK-001"], "Before QA vendor 2 has bid");
      // 2. surrogate bid at a higher price
      if (!guard("the surrogate bid")) return;
      await b.surrogate(V3, ev, P.v3s, ["API-EVDCMP-002"], { accept: true }, `The buyer's bid for ${b.name(V3)} is placed while bidding is open.`);
      await b.checkStandings(ev, [V1], vs, P.v1, ["API-EVDCMP-002"], "A higher surrogate bid does not take the lead");
      await b.leakScan(V1, ev, [{ v: V3, prices: [P.v3s] }], [P.v1], ["API-EVDLEK-003"], "After the buyer bid for QA vendor 3");
      // 3. a third own bid, higher
      if (!guard("QA vendor 2's bid")) return;
      await b.bid(V2, ev, [P.v2]);
      await b.checkStandings(ev, [V1], vs, P.v1, ["API-EVDCMP-003"], "A higher third bid leaves QA vendor 1 in the lead");
      // 4. the vendor the buyer bid for now bids itself
      if (!guard("QA vendor 3's own bid")) return;
      const own = await b.bid(V3, ev, [P.v3own], { cases: ["API-EVDCMP-007"], label: `${b.name(V3)} bids itself after the buyer's surrogate bid (${rupees(P.v3own)})`, expectSubmit: { either: ["ok", "96", "99"] }, expectedSubmit: "Either accepted as the vendor's revision of the surrogate bid, or refused because a bid already exists (96/99) — but never a second live bid." });
      const v3bid = await b.activeBid(V3, ev);
      const v3rows = await db("SELECT count(*)::int n FROM bids b JOIN bid_trades bt ON bt.bid_id = b.id WHERE bt.trade_request_id = $1 AND b.company_id = $2 AND b.status IN (1,2,6)", [decodeProcolId(ev.trade), V3.vendorCompanyId]);
      const v3price = own.submitted ? P.v3own : P.v3s;
      b.push({
        cases: ["API-EVDCMP-007"], title: "QA vendor 3 has exactly one live bid, at its latest price", actor: "buyer",
        expected: `One live bid for ${b.name(V3)} at ${rupees(v3price)}.`,
        actual: !v3bid ? "No live bid found." : `${v3rows?.[0]?.n ?? "?"} live bid(s); the latest at ${rupees(Number(v3bid.price))}.`,
        verdict: !v3bid || !v3rows ? "couldn't tell" : v3rows[0].n === 1 && near(Number(v3bid.price), v3price) ? "passed" : "failed", ms: 0,
      });
      // 5. rebid below the leader
      if (!guard("QA vendor 2's rebid")) return;
      await b.bid(V2, ev, [P.v2r], { label: `${b.name(V2)} rebids ${rupees(P.v2r)}` });
      await b.checkStandings(ev, [V2], vs, P.v2r, ["API-EVDCMP-004"], "A rebid below the leader takes the lead and the L1 price");
      await b.leakScan(V1, ev, [{ v: V2, prices: [P.v2, P.v2r] }, { v: V3, prices: [v3price] }], [P.v1], ["API-EVDLEK-001"], "After QA vendor 2 took the lead");
      // 6. tie at the best price
      if (!guard("QA vendor 1's tying rebid")) return;
      await b.bid(V1, ev, [P.v1r], { label: `${b.name(V1)} matches the best price ${rupees(P.v1r)}` });
      await b.checkStandings(ev, [V1, V2], vs, P.v1r, ["API-EVDCMP-005", "API-EVDCMP-006"], "A tie at the best price on an RFQ: both shown as best, the vendor that never bid is not");
      await b.leakScan(V4, ev, [{ v: V1, prices: [P.v1, P.v1r] }, { v: V2, prices: [P.v2, P.v2r] }, { v: V3, prices: [v3price, P.v3s] }], [], ["API-EVDLEK-007"], "While three others have bid");
      await b.peekOtherBid(V4, V2, ev, ["API-EVDLEK-002"]);
      await b.peekOtherBid(V1, V2, ev, ["API-EVDLEK-002"]);
      // 7. award after the close
      await b.until(ev.ect + 8, "the round and its extra closing time to end before awarding");
      const proposal = await b.openProposal(ev);
      if (!proposal) return;
      const partial = b.c.companyId === 198678;
      let award: Awarded[];
      if (partial) {
        award = [
          { v: V2, lines: [{ li: 0, qty: 15, price: P.v2r, isBest: true }] },
          { v: V1, lines: [{ li: 0, qty: 10, price: P.v1r, isBest: true }] },
          { v: V3, lines: [{ li: 0, qty: 5, price: v3price, isBest: false }] },
        ];
        const add = await b.addResponse(proposal, ev, award.map((a) => ({ v: a.v, lines: [{ li: 0, qty: a.lines[0].qty }] })), ["API-EVDAWD-001"],
          "Split the line: 15 to QA vendor 2, 10 to QA vendor 1, 5 to QA vendor 3", "Accepted: partial awarding is on and 15 + 10 + 5 = 30, the line's quantity.");
        if (!add.reply.ok) return;
        await b.checkAwardMaths(proposal, ev, award, { vendor: ["API-EVDAWD-002"], total: ["API-EVDAWD-003"], l1: ["API-EVDAWD-004"] }, "Three-way split");
        await b.addResponse(proposal, ev, [{ v: V4, lines: [{ li: 0, qty: 1 }] }], ["API-EVDAWD-009"], "Award QA vendor 4, who never bid", "Refused: the vendor has no bid in the round (826).", { refuse: ["826", "715"] });
        await b.addResponse(proposal, ev, [{ v: V3, lines: [{ li: 0, qty: 10 }] }], ["API-EVDAWD-007"], "Raise QA vendor 3 to 10 (25 + 10 = 35 > 30)", "Refused: more than the line's quantity would be awarded (561).", { refuse: ["561"] });
        const re = await b.addResponse(proposal, ev, [{ v: V3, lines: [{ li: 0, qty: 3 }] }], ["API-EVDAWD-006"], "Lower QA vendor 3's award from 5 to 3", "Accepted; QA vendor 3's amount becomes 3 × its price.");
        if (re.reply.ok) {
          const row = await b.proposalRow(proposal);
          const got = row?.vendors[String(V3.vendorCompanyId)];
          b.push({
            cases: ["API-EVDAWD-006"], title: "After lowering QA vendor 3 to 3: its awarded quantity and amount", actor: "buyer",
            expected: `Awarded quantity 3; amount 3 × ${rupees(v3price)} = ${rupees(3 * v3price)}.`,
            actual: !got ? "Not readable." : `Awarded quantity ${Object.values(got.egli).map((e: any) => e?.awarded_quantity).join(", ")}; amount ${rupees(got.total)}.`,
            verdict: !got ? "couldn't tell" : near(got.total, 3 * v3price) && Object.values(got.egli).some((e: any) => Number(e?.awarded_quantity) === 3) ? "passed" : "failed", details: { evidence: got }, ms: 0,
          });
        }
        const rm = await b.addResponse(proposal, ev, [{ v: V3, lines: [{ li: 0 }], action: "remove" }], ["API-EVDAWD-005"], "Take QA vendor 3 off the award", "Accepted; QA vendor 3 leaves the proposal.");
        if (rm.reply.ok) await b.checkAwardMaths(proposal, ev, award.slice(0, 2), { vendor: ["API-EVDAWD-005"], total: ["API-EVDAWD-005"] }, "After removing QA vendor 3");
        const back = await b.addResponse(proposal, ev, [{ v: V3, lines: [{ li: 0, qty: 5 }] }], ["API-EVDAWD-005"], "Put QA vendor 3 back with 5", "Accepted.");
        if (!back.reply.ok) award = award.slice(0, 2);
        await b.checkAwardMaths(proposal, ev, award, { vendor: ["API-EVDAWD-002"], total: ["API-EVDAWD-003"] }, "Final split before submitting");
      } else {
        award = [{ v: V2, lines: [{ li: 0, qty: QTY, price: P.v2r, isBest: true }] }];
        const add = await b.addResponse(proposal, ev, [{ v: V2, lines: [{ li: 0, qty: QTY }] }], ["API-EVDAWD-010"], `Award the whole ${QTY} to QA vendor 2`, "Accepted.");
        if (!add.reply.ok) return;
        await b.checkAwardMaths(proposal, ev, award, { vendor: ["API-EVDAWD-010"], total: ["API-EVDAWD-010"], l1: ["API-EVDAWD-004"] }, "Whole line to one vendor");
        await b.addResponse(proposal, ev, [{ v: V1, lines: [{ li: 0 }] }], ["API-EVDAWD-011"], "Also award QA vendor 1 its quoted quantity (the line is already fully awarded)",
          "Refused: partial awarding is off and the line's quantity is already awarded (561).", { refuse: ["561"] });
        await b.addResponse(proposal, ev, [{ v: V4, lines: [{ li: 0, qty: 1 }] }], ["API-EVDAWD-009"], "Award QA vendor 4, who never bid", "Refused: the vendor has no bid in the round (826).", { refuse: ["826", "715"] });
        const rm = await b.addResponse(proposal, ev, [{ v: V2, lines: [{ li: 0 }], action: "remove" }], ["API-EVDAWD-005"], "Take QA vendor 2 off the award", "Accepted; the proposal is empty again.");
        if (rm.reply.ok) {
          const row = await b.proposalRow(proposal);
          b.push({
            cases: ["API-EVDAWD-005"], title: "After removing the only vendor the proposal holds nothing", actor: "buyer", expected: "No vendor and a total of ₹0.",
            actual: row ? `${Object.keys(row.vendors).length} vendor(s); totals L1 ${rupees(row.l1)}, other ${rupees(row.nonL1)}.` : "Not readable.",
            verdict: !row ? "couldn't tell" : !Object.keys(row.vendors).length && near(row.l1 + row.nonL1, 0) ? "passed" : "failed", ms: 0,
          });
        }
        await b.addResponse(proposal, ev, [{ v: V2, lines: [{ li: 0, qty: QTY }] }], ["API-EVDAWD-005"], "Award QA vendor 2 again", "Accepted.");
        await b.checkAwardMaths(proposal, ev, award, { vendor: ["API-EVDAWD-010"], total: ["API-EVDAWD-010"] }, "Re-awarded");
      }
      const awardedSet = new Set(award.map((a) => a.v.n));
      await submitApproveAndOrders(b, ev, proposal, award, vs.filter((v) => !awardedSet.has(v.n)), {
        nfaSubmit: ["API-EVDNFA-001"], nfa573: ["API-EVDNFA-002"], nfa721: ["API-EVDNFA-003"], nfa888: ["API-EVDNFA-004"], nfaApprove: ["API-EVDNFA-005"], nfaTwice: ["API-EVDNFA-006"],
        apoOne: ["API-EVDAPO-001"], apoItemQty: ["API-EVDAPO-002"], apoPrice: ["API-EVDAPO-003"], apoHeaderQty: ["API-EVDAPO-004"], apoApi: ["API-EVDAPO-006"], awdStatus: ["API-EVDAWD-012"],
      });
      // What each vendor sees after the award.
      const all = [{ v: V1, prices: [P.v1, P.v1r] }, { v: V2, prices: [P.v2, P.v2r] }, { v: V3, prices: [P.v3s, v3price] }];
      await b.leakScan(V4, ev, all, [], ["API-EVDLEK-005"], "After the award");
      await b.leakScan(V3, ev, all.filter((x) => x.v !== V3), [P.v3s, v3price], ["API-EVDLEK-005", "API-EVDLEK-006"], "After the award");
      await b.leakScan(V2, ev, all.filter((x) => x.v !== V2), [P.v2, P.v2r], ["API-EVDLEK-006"], "After the award");
    },
  },
  {
    id: "S2",
    title: "Rank auction with dynamic closing — vendor ranks, a tie at the best price, late bids that extend and one that must not",
    vendors: 3,
    run: async (b, vs) => {
      const [V1, V2, V3] = vs;
      const EXT_MIN = 2;
      const ev = await b.build({
        kind: "auction", qtys: [30], openFor: 270, extra: 20, audience: vs, titleTag: "S2",
        tweak: (cfg) => {
          cfg.is_english_auction_enabled = false;
          cfg.is_dynamic_closing_time_allowed = true;
          cfg.last_n_minutes_for_time_extension = 1;
          cfg.time_extension_value = EXT_MIN;
          cfg.rank_limit_for_time_extension = 1;
          cfg.dynamic_closing_time_strategy = "rank_based";
        },
      });
      if (!ev) return;
      // What the round really carries.
      const sch = await send(b.c.buyerApi, "GET", b.E.tradeSchema(ev.trade));
      const tc = sch.data?.trade_config ?? sch.data?.config ?? {};
      const dte = tc.is_dynamic_closing_time_allowed === true;
      const showBest = tc?.other_auction_indicators_config?.best_price === true || tc.is_english_auction_enabled === true;
      b.push({
        cases: ["API-EVDAUX-001"], title: "The auction carries the dynamic closing settings it was created with", actor: "buyer",
        expected: `Dynamic closing on, last 1 minute, +${EXT_MIN} minutes, rank limit 1, rank based.`,
        actual: !sch.ok ? said(sch) : `Dynamic closing ${dte ? "on" : `off (${String(tc.is_dynamic_closing_time_allowed)})`}; +${tc.time_extension_value ?? "?"} min; rank limit ${tc.rank_limit_for_time_extension ?? "?"}; strategy ${tc.dynamic_closing_time_strategy ?? sch.data?.dynamic_closing_time_strategy ?? "?"}; best price shown to vendors: ${showBest ? "yes" : "no"}.`,
        verdict: !sch.ok ? "couldn't tell" : dte && Number(tc.time_extension_value) === EXT_MIN ? "passed" : "failed", details: { evidence: { trade_config: tc } }, ms: 0,
      });
      const P = { a: 4817, c: 4903, late1: 4700, notTop: 4810, late2: 4650 };
      await b.bid(V1, ev, [P.a]);
      const c0 = await b.clock(ev.trade);
      await b.bid(V2, ev, [P.a], { cases: ["API-EVDCMP-010"], label: `${b.name(V2)} bids the same ${rupees(P.a)}`, expectSubmit: { either: ["ok", "98"] }, expectedSubmit: "Accepted when tie bids are allowed (the default), refused 98 when the round forbids ties." });
      const tieAccepted = !!(await b.activeBid(V2, ev));
      await b.bid(V3, ev, [P.c]);
      const c1 = await b.clock(ev.trade);
      b.push({
        cases: ["API-EVDAUX-002"], title: "Bids placed well before the last minute do not move the closing time", actor: "buyer",
        expected: `The bid end stays at ${hhmmss(ev.bet)}.`, actual: c1 ? `The bid end is ${hhmmss(c1.bet)}${c0 ? ` (was ${hhmmss(c0.bet)})` : ""}.` : "The clock could not be read.",
        verdict: !c1 ? "couldn't tell" : Math.abs(c1.bet - ev.bet) <= 2 ? "passed" : "failed", ms: 0,
      });
      // Ranks each vendor sees.
      const r1 = await b.vendorRank(V1, ev), r2 = await b.vendorRank(V2, ev), r3 = await b.vendorRank(V3, ev);
      const tieExp = tieAccepted ? [2, 2, 3] : [1, undefined, 2];
      b.push({
        cases: ["API-EVDCMP-008", "API-EVDCMP-009"], title: "Each vendor sees its own rank", actor: "QA vendors",
        expected: tieAccepted ? "Tie at the best price: the two tied vendors both see rank 2 and the third sees rank 3 (the app's dense ranking shifts every rank when the best price is shared — bid_rank_helper.rb:215-218)." : "QA vendor 1 rank 1, QA vendor 3 rank 2.",
        actual: `QA vendor 1: ${r1.said}; QA vendor 2: ${r2.said}; QA vendor 3: ${r3.said}.`,
        verdict: !r1.ok || !r3.ok ? "couldn't tell" : r1.rank === tieExp[0] && (tieExp[1] === undefined || r2.rank === tieExp[1]) && r3.rank === tieExp[2] ? "passed" : "failed", ms: 0,
      });
      await b.leakScan(V3, ev, [{ v: V1, prices: [P.a] }, { v: V2, prices: [P.a] }], [P.c], ["API-EVDLEK-004"], "Live auction", showBest ? [P.a] : undefined);
      // Late bid 1: QA vendor 3 jumps from last to first inside the last minute → must extend by EXT_MIN.
      const base = (c1 ?? ev).bet;
      if (!(await b.until(base - 40, "the last minute before the bid end"))) return void b.note("The wait was cut short; the late-bid checks were not run.");
      await b.bid(V3, ev, [P.late1], { label: `In the last minute: ${b.name(V3)} drops to ${rupees(P.late1)} and takes rank 1` });
      let c2: Awaited<ReturnType<Bench["clock"]>> | undefined;
      for (let i = 0; i < 6; i++) {
        c2 = await b.clock(ev.trade);
        if (c2 && c2.bet > base + 5) break;
        await sleep(5_000);
      }
      b.push({
        cases: ["API-EVDAUX-001"], title: "A late bid that changes the leader extends the closing time", actor: "buyer",
        expected: `The bid end moves from ${hhmmss(base)} to ${hhmmss(base + EXT_MIN * 60)} (+${EXT_MIN} minutes).`,
        actual: c2 ? `The bid end is ${hhmmss(c2.bet)} (${c2.bet - base >= 0 ? "+" : ""}${c2.bet - base} s).` : "The clock could not be read.",
        verdict: !c2 ? "couldn't tell" : Math.abs(c2.bet - (base + EXT_MIN * 60)) <= 5 ? "passed" : "failed", ms: 0,
      });
      const ends = await Promise.all([V1, V2, V3].map((v) => b.activeBid(v, ev)));
      const target = c2?.bet;
      b.push({
        cases: ["API-EVDAUX-004"], title: "Every vendor's bid takes the extended end time", actor: "buyer",
        expected: target ? `Each live bid's stored end time is ${hhmmss(target)}.` : "Each live bid's end time follows the extension.",
        actual: ends.map((x, i) => `QA vendor ${i + 1}: ${x?.end_epoch ? hhmmss(x.end_epoch) : "none"}`).join("; ") + ".",
        verdict: !target || ends.some((x) => !x) ? "couldn't tell" : ends.every((x) => x!.end_epoch !== null && Math.abs(x!.end_epoch - target) <= 5) ? "passed" : "failed", ms: 0,
      });
      if (!c2 || c2.bet <= base + 5) return;
      const base2 = c2.bet;
      if (!(await b.until(base2 - 45, "the last minute of the extended window"))) return;
      // A late bid that does not reach rank 1 → must NOT extend (rank limit 1).
      await b.bid(V2, ev, [P.notTop], { label: `In the extended window's last minute: ${b.name(V2)} improves to ${rupees(P.notTop)} but stays behind` });
      await sleep(6_000);
      const c3 = await b.clock(ev.trade);
      b.push({
        cases: ["API-EVDAUX-005"], title: "A late bid that does not reach the top rank does not extend", actor: "buyer",
        expected: `The bid end stays at ${hhmmss(base2)}.`, actual: c3 ? `The bid end is ${hhmmss(c3.bet)}.` : "Could not be read.",
        verdict: !c3 ? "couldn't tell" : Math.abs(c3.bet - base2) <= 2 ? "passed" : "failed", ms: 0,
      });
      await b.bid(V1, ev, [P.late2], { label: `In the extended window's last minute: ${b.name(V1)} drops to ${rupees(P.late2)} and takes rank 1` });
      let c4: Awaited<ReturnType<Bench["clock"]>> | undefined;
      for (let i = 0; i < 6; i++) {
        c4 = await b.clock(ev.trade);
        if (c4 && c4.bet > base2 + 5) break;
        await sleep(5_000);
      }
      b.push({
        cases: ["API-EVDAUX-003"], title: "A second late lead change extends again", actor: "buyer",
        expected: `The bid end moves from ${hhmmss(base2)} to ${hhmmss(base2 + EXT_MIN * 60)}.`,
        actual: c4 ? `The bid end is ${hhmmss(c4.bet)} (${c4.bet - base2} s).` : "Could not be read.",
        verdict: !c4 ? "couldn't tell" : Math.abs(c4.bet - (base2 + EXT_MIN * 60)) <= 5 ? "passed" : "failed", ms: 0,
      });
      const f1 = await b.vendorRank(V1, ev), f2 = await b.vendorRank(V2, ev), f3 = await b.vendorRank(V3, ev);
      b.push({
        cases: ["API-EVDCMP-008"], title: "After the late bids each vendor sees its new rank", actor: "QA vendors",
        expected: `QA vendor 1 rank 1 (${rupees(P.late2)}), QA vendor 3 rank 2 (${rupees(P.late1)}), QA vendor 2 rank 3 (${rupees(P.notTop)}).`,
        actual: `QA vendor 1: ${f1.said}; QA vendor 2: ${f2.said}; QA vendor 3: ${f3.said}.`,
        verdict: !f1.ok || !f2.ok || !f3.ok ? "couldn't tell" : f1.rank === 1 && f3.rank === 2 && f2.rank === 3 ? "passed" : "failed", ms: 0,
      });
      await b.leakScan(V2, ev, [{ v: V1, prices: [P.a, P.late2] }, { v: V3, prices: [P.c, P.late1] }], [P.a, P.notTop], ["API-EVDLEK-004"], "After the late bids", showBest ? [P.late2] : undefined);
    },
  },
  {
    id: "S3",
    title: "Two line items, three vendors — line-wise split award, exact totals, each order carries only its awarded line",
    vendors: 3,
    run: async (b, vs) => {
      const [V1, V2, V3] = vs;
      const Q = [30, 20];
      const ev = await b.build({ kind: "rfq", qtys: Q, openFor: 150, extra: 15, audience: vs, titleTag: "S3" });
      if (!ev) return;
      const P = { v1: [4817, 4950], v2: [4903, 4870], v3: [4890, 4990] };
      await b.bid(V1, ev, P.v1);
      await b.bid(V2, ev, P.v2);
      await b.bid(V3, ev, P.v3);
      await b.checkStandings(ev, [V1], vs, P.v1[0], ["API-EVDCMP-011"], "Line 1: QA vendor 1 holds the best price", 0);
      await b.checkStandings(ev, [V2], vs, P.v2[1], ["API-EVDCMP-011"], "Line 2: QA vendor 2 holds the best price", 1);
      await b.until(ev.ect + 8, "the round to close before awarding");
      const proposal = await b.openProposal(ev);
      if (!proposal) return;
      const award: Awarded[] = [
        { v: V1, lines: [{ li: 0, qty: Q[0], price: P.v1[0], isBest: true }] },
        { v: V2, lines: [{ li: 1, qty: Q[1], price: P.v2[1], isBest: true }] },
      ];
      const add = await b.addResponse(proposal, ev, award.map((a) => ({ v: a.v, lines: [{ li: a.lines[0].li, qty: a.lines[0].qty }] })), ["API-EVDAWD-008"],
        "Award line 1 to QA vendor 1 and line 2 to QA vendor 2", "Accepted: each line goes whole to its best bidder.");
      if (!add.reply.ok) return;
      await b.checkAwardMaths(proposal, ev, award, { vendor: ["API-EVDAWD-008"], total: ["API-EVDAWD-008"], l1: ["API-EVDAWD-008"] }, "Line-wise split");
      await submitApproveAndOrders(b, ev, proposal, award, [V3], {
        nfaSubmit: ["API-EVDNFA-001"], nfa573: ["API-EVDNFA-002"], nfa721: ["API-EVDNFA-003"], nfa888: ["API-EVDNFA-004"], nfaApprove: ["API-EVDNFA-005"], nfaTwice: ["API-EVDNFA-006"],
        apoOne: ["API-EVDAPO-001"], apoItemQty: ["API-EVDAPO-002"], apoPrice: ["API-EVDAPO-003"], apoHeaderQty: ["API-EVDAPO-004"], apoOnlyLine: ["API-EVDAPO-005"], awdStatus: ["API-EVDAWD-012"],
      });
    },
  },
];

// ── the written catalog (same parsing rules as scripts/import-test-cases.ts) ──

interface MdCase { id: string; title: string; trace: string; file: string }
function loadMd(): MdCase[] {
  const out: MdCase[] = [];
  for (const f of readdirSync(MD_DIR).filter((n) => n.startsWith("events-deep3-") && n.endsWith(".md")).sort()) {
    let cur: MdCase | undefined;
    for (const raw of readFileSync(join(MD_DIR, f), "utf8").split("\n")) {
      const head = raw.match(/^#{3,4}\s+((?:UI|API|PRD)-[A-Z]+-\d+)\s*[—–-]\s*(.+)$/);
      if (head) {
        cur = { id: head[1], title: head[2].trim(), trace: "", file: f };
        out.push(cur);
        continue;
      }
      const t = raw.match(/^-\s+\*\*Trace\.\*\*\s*(.*)$/);
      if (t && cur) cur.trace = t[1];
    }
  }
  return out;
}

// ── running ────────────────────────────────────────────────────────────────

async function openCtx(companyId: number): Promise<{ c: Ctx; dispose: () => Promise<void> }> {
  const client: any = await openClientContext(companyId);
  const ctx = client.ctx;
  const reopened: any[] = [];
  const [bodies, ep] = await Promise.all([imp("flows/bodies.ts"), imp("api/endpoints.ts")]);
  const cat0 = ctx.catalog ?? {};
  const { CONFIG } = await imp("config.ts");
  let unit: string = CONFIG?.testData?.quantityUnit ?? "KG";
  const resolve = await imp("catalog/resolve.ts").catch(() => undefined);
  if (resolve?.resolveCatalogAlternatives) {
    const alts = await resolve.resolveCatalogAlternatives(ctx.buyerApi).catch(() => undefined);
    const units: string[] = alts?.units ?? [];
    const prod = (alts?.products ?? []).find((p: any) => p.uuid === cat0.productUuid);
    if (units.length && !unitListed(units, unit)) {
      const ranked = rankUnits(units, prod?.units ?? []);
      if (ranked[0]) unit = ranked[0];
    }
  }
  const c: Ctx = {
    bodies, E: ep.Endpoints, buyerApi: ctx.buyerApi, buyerUserId: ctx.buyerUserId, companyId, company: client.companyName ?? `company ${companyId}`,
    cat: { productUuid: cat0.productUuid, productQualityUuid: cat0.productQualityUuid, pricingTemplateUuid: cat0.pricingTemplateUuid, locationUuid: cat0.locationUuid },
    unit, vendors: await listQaVendors(companyId),
    reopenBuyer: async () => {
      const fresh: any = await openClientContext(companyId).catch(() => undefined);
      if (!fresh?.ctx?.buyerApi) return undefined;
      reopened.push(fresh);
      c.buyerApi = fresh.ctx.buyerApi;
      return c.buyerApi;
    },
  };
  return { c, dispose: async () => { for (const r of reopened) await r.dispose?.().catch(() => {}); await client.dispose().catch(() => {}); } };
}

async function runScenario(c: Ctx, sc: Scenario, attempt: number): Promise<ScenarioResult> {
  const t0 = Date.now();
  const b = new Bench(c, sc.id);
  log(`▶ ${sc.id} (attempt ${attempt}) — ${sc.title} — ${c.company}`);
  try {
    if (!c.cat.productUuid || !c.cat.pricingTemplateUuid || !c.cat.locationUuid) b.skip([], "Build the event", "buyer", "An event is built.", "this client's catalog has no product, pricing template or location");
    else if (c.vendors.length < sc.vendors) b.skip([], "Invite the vendors", "buyer", `${sc.vendors} QA vendors.`, `only ${c.vendors.length} QA vendor(s) are set up for ${c.company}`);
    else await Promise.race([sc.run(b, c.vendors.slice(0, sc.vendors)), sleep(40 * 60_000).then(() => b.note("The scenario hit its 40-minute limit and was stopped."))]);
  } catch (e) {
    b.push({ cases: [], title: "The run itself", actor: "platform", expected: "The scenario runs to the end.", actual: `It stopped with an error in the runner: ${e instanceof Error ? e.message : String(e)}.`, verdict: "couldn't tell", ms: 0 });
  } finally {
    await b.dispose();
  }
  return { id: sc.id, title: sc.title, companyId: c.companyId, company: c.company, attempt, eventGroupUuid: b.eventGroupUuid, eventTitle: b.eventTitle, steps: b.steps, notes: b.notes, startedAt: new Date(t0).toISOString(), durationMs: Date.now() - t0 };
}

const RANK: Record<Verdict, number> = { failed: 3, "couldn't tell": 2, passed: 1, "not run": 0 };

/** Per case: the worst verdict of its steps in the first attempt; a failure stands only if the confirmation attempt failed the same step again. */
function caseVerdicts(first: ScenarioResult[], confirm: ScenarioResult[]) {
  const out = new Map<string, { verdict: Verdict; reproduced?: boolean; steps: { scenario: string; title: string; actual: string; verdict: Verdict; again?: Verdict }[] }>();
  for (const r of first) {
    const again = confirm.find((x) => x.id === r.id);
    for (const s of r.steps) {
      for (const id of s.cases) {
        const e = out.get(id) ?? { verdict: "not run" as Verdict, steps: [] };
        let v = s.verdict;
        let againV: Verdict | undefined;
        if (v === "failed" && again) {
          const twin = again.steps.find((x) => x.key === s.key);
          againV = twin?.verdict;
          if (againV !== "failed") v = "couldn't tell";
        }
        e.steps.push({ scenario: r.id, title: s.title, actual: s.actual, verdict: s.verdict, ...(againV ? { again: againV } : {}) });
        if (RANK[v] > RANK[e.verdict]) e.verdict = v;
        if (s.verdict === "failed") e.reproduced = (e.reproduced ?? true) && againV === "failed";
        out.set(id, e);
      }
    }
  }
  return out;
}

async function main() {
  const md = loadMd();
  if (flag("check")) {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const used = new Set([...src.matchAll(/"(API-EVD[A-Z]+-\d{3})"/g)].map((m) => m[1]));
    const ids = new Set(md.map((c) => c.id));
    console.log(`${md.length} deep3 cases in ${new Set(md.map((c) => c.file)).size} files; the runner decides ${used.size} of them.`);
    const missing = [...used].filter((x) => !ids.has(x));
    if (missing.length) console.log(`  ⚠ referenced by the runner but not written: ${missing.join(", ")}`);
    const noTwin = md.filter((c) => /\bautomate\b/.test(c.trace) && !/automate-later/.test(c.trace) && !used.has(c.id));
    if (noTwin.length) console.log(`  ⚠ marked automate but not decided by the runner: ${noTwin.map((c) => c.id).join(", ")}`);
    const twinNotAutomate = md.filter((c) => used.has(c.id) && !/\bautomate\b/.test(c.trace));
    if (twinNotAutomate.length) console.log(`  ⚠ decided by the runner but not marked automate: ${twinNotAutomate.map((c) => c.id).join(", ")}`);
    for (const s of SCENARIOS) console.log(`  ${s.id}: ${s.title}`);
    return;
  }
  const companyId = Number(arg("c") ?? arg("company"));
  if (!companyId) throw new Error("--c <companyId> is required (198678 or 32461)");
  if (![198678, 32461].includes(companyId)) throw new Error("deep3 runs only on PROCOL DEMO 198678 and Demo Account 2 32461 (they have QA vendors)");
  const want = (arg("scenarios") ?? "").split(",").filter(Boolean);
  const list = SCENARIOS.filter((s) => !want.length || want.includes(s.id));
  mkdirSync(RUNS_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const file = join(RUNS_DIR, `${companyId}-${startedAt.replace(/[:.]/g, "-")}.json`);
  const { c, dispose } = await openCtx(companyId);
  const first: ScenarioResult[] = [];
  const confirm: ScenarioResult[] = [];
  const save = () => {
    const cases = caseVerdicts(first, confirm);
    const titles = new Map(md.map((x) => [x.id, x.title]));
    writeFileSync(file, JSON.stringify({
      companyId, company: c.company, startedAt, finishedAt: new Date().toISOString(), unit: c.unit,
      vendors: c.vendors.map((v) => ({ n: v.n, name: v.name })),
      cases: Object.fromEntries([...cases].sort().map(([id, v]) => [id, { title: titles.get(id), ...v }])),
      scenarios: first, confirmations: confirm,
    }, null, 2));
    return cases;
  };
  try {
    log(`${c.company}: ${c.vendors.length} QA vendors; unit ${c.unit}; buyer user ${c.buyerUserId ? "known" : "unknown"}`);
    for (const sc of list) {
      first.push(await runScenario(c, sc, 1));
      save();
    }
    if (!flag("no-confirm")) {
      for (const r of first) {
        if (!r.steps.some((s) => s.verdict === "failed")) continue;
        const sc = SCENARIOS.find((s) => s.id === r.id)!;
        log(`↻ ${r.id} had failures — running it again on a second fresh event to confirm`);
        confirm.push(await runScenario(c, sc, 2));
        save();
      }
    }
  } finally {
    const cases = save();
    await dispose();
    const tally: Record<string, number> = {};
    for (const v of cases.values()) tally[v.verdict] = (tally[v.verdict] ?? 0) + 1;
    log(`Cases: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ")} — ${file}`);
    for (const [id, v] of [...cases].sort()) if (v.verdict === "failed") log(`  ✗ ${id} (reproduced ${v.reproduced ? "yes" : "no"}) — ${v.steps.find((s) => s.verdict === "failed")?.title}`);
    try {
      (await imp("db/pool.ts")).closePool?.();
    } catch {
      /* nothing to close */
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    },
  );
}
