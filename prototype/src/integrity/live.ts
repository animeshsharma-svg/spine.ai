/**
 * THE LIVE RIG — build a fresh QA_Platform_ event with the numbers we choose,
 * bid on it as the QA vendors (own login) and as the buyer (surrogate), and
 * read back every figure Procol reports. Used by scripts/run-integrity.ts.
 *
 * Safety:
 *   - every request goes through send.ts (app-guarded, bounded, never throws);
 *   - only QA vendors (spine table qa_vendors, qa_…@example.com) — never real suppliers;
 *   - every record is named QA_Platform_Integrity_…;
 *   - Procol's database is read with SELECT only, and only for this run's own rows.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST, openClientContext } from "../executor.js";
import { listQaVendors, vendorClient, type QaVendor } from "../checks/matrixVendors.js";
import { decodeProcolId } from "../checks/biddingMatrix.js";
import { rankUnits, unitListed } from "../checks/resilience.js";
import { send, said, type Reply } from "./send.js";
import { Dec } from "./decimal.js";
import { computeBid, templateFromWidgets, type BidInput, type Template } from "./calculator.js";

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

export interface RigCtx {
  bodies: any;
  E: any;
  buyerApi: any;
  companyId: number;
  company: string;
  cat: { productUuid: string; productQualityUuid: string; pricingTemplateUuid: string; locationUuid: string };
  unit: string;
  vendors: QaVendor[];
  reopenBuyer: () => Promise<any | undefined>;
  dispose: () => Promise<void>;
}

export async function openRig(companyId: number): Promise<RigCtx> {
  const client: any = await openClientContext(companyId);
  const ctx = client.ctx;
  const reopened: any[] = [];
  const [bodies, ep, cfg] = await Promise.all([imp("flows/bodies.ts"), imp("api/endpoints.ts"), imp("config.ts")]);
  const cat0 = ctx.catalog ?? {};
  let unit: string = cfg.CONFIG?.testData?.quantityUnit ?? "KG";
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
  const rig: RigCtx = {
    bodies, E: ep.Endpoints, buyerApi: ctx.buyerApi, companyId, company: client.companyName ?? `company ${companyId}`,
    cat: { productUuid: cat0.productUuid, productQualityUuid: cat0.productQualityUuid, pricingTemplateUuid: cat0.pricingTemplateUuid, locationUuid: cat0.locationUuid },
    unit, vendors: await listQaVendors(companyId),
    reopenBuyer: async () => {
      const fresh: any = await openClientContext(companyId).catch(() => undefined);
      if (!fresh?.ctx?.buyerApi) return undefined;
      reopened.push(fresh);
      rig.buyerApi = fresh.ctx.buyerApi;
      return rig.buyerApi;
    },
    dispose: async () => {
      for (const r of reopened) await r.dispose?.().catch(() => {});
      await client.dispose().catch(() => {});
    },
  };
  return rig;
}

export interface Built {
  eg: string;
  title: string;
  trade: string;
  lines: { uuid: string; qty: number }[];
  widgets: any;
  template: Template;
  bst: number;
  bet: number;
  ect: number;
  audience: QaVendor[];
}

export interface Logged {
  title: string;
  ok: boolean;
  actual: string;
  reply?: Reply;
  method?: string;
  path?: string;
  body?: unknown;
}

/** A stage's widgets: the template's own, optionally with extra widgets appended (custom charges, discount…). */
export async function stageWidgets(rig: RigCtx, templateUuid: string | undefined, extra?: { inline?: any[]; global?: any[] }): Promise<{ widgets: any; from: string }> {
  let widgets: any;
  let from = "the sibling framework's default pricing widgets";
  if (templateUuid) {
    const r = await send(rig.buyerApi, "GET", `/templates/${templateUuid}`);
    if (r.ok && r.data?.widgets?.inline_components?.length) {
      widgets = JSON.parse(JSON.stringify(r.data.widgets));
      from = `template “${r.data.name ?? templateUuid}”`;
    }
  }
  widgets ??= JSON.parse(JSON.stringify(rig.bodies.PRICING_WIDGETS));
  widgets.global_price_components ??= [];
  // Every bid needs a whole-bid total the comparison can rank on.
  if (!widgets.global_price_components.some((w: any) => w.key_attribute === "gross_total")) {
    widgets.global_price_components.unshift(JSON.parse(JSON.stringify(rig.bodies.PRICING_WIDGETS.global_price_components[0])));
  }
  if (extra?.inline) widgets.inline_components.push(...extra.inline);
  if (extra?.global) widgets.global_price_components.push(...extra.global);
  return { widgets, from };
}

export class Rig {
  log: Logged[] = [];
  notes: string[] = [];
  private vapis = new Map<number, any>();
  private products = new Map<string, any[]>();
  constructor(readonly c: RigCtx, readonly onLine: (s: string) => void = () => {}) {}

  note(s: string) {
    this.notes.push(s);
    this.onLine(`  · ${s}`);
  }
  name(v: QaVendor) {
    return `QA vendor ${v.n}`;
  }

  async call(title: string, api: any, method: string, path: string, body?: unknown): Promise<Reply> {
    let r = await send(api, method, path, body);
    if (r.status === 401 && api === this.c.buyerApi) {
      const fresh = await this.c.reopenBuyer().catch(() => undefined);
      if (fresh) r = await send(fresh, method, path, body);
    }
    const actual = said(r);
    this.log.push({ title, ok: r.ok, actual, reply: r.ok ? undefined : r, method, path });
    this.onLine(`  ${r.ok ? "✓" : "✗"} ${title} — ${actual}`);
    return r;
  }

  async vendor(v: QaVendor): Promise<any | undefined> {
    if (this.vapis.has(v.n)) return this.vapis.get(v.n);
    const r = await vendorClient(this.c.companyId, v.email);
    if (!r.api) {
      this.note(`${this.name(v)} could not sign in: ${r.error}`);
      return undefined;
    }
    this.vapis.set(v.n, r.api);
    return r.api;
  }
  async dispose() {
    for (const a of this.vapis.values()) await Promise.resolve(a?.dispose?.()).catch(() => {});
    this.vapis.clear();
  }

  /** Draft with `qtys` line items → one pricing round with `widgets` → publish. */
  async build(o: { tag: string; qtys: number[]; widgets: any; audience: QaVendor[]; openFor: number; extra?: number; kind?: "rfq" | "auction"; tweak?: (cfg: any) => void }): Promise<Built | undefined> {
    const { c } = this;
    const title = `QA_Platform_Integrity_${o.tag}_${Date.now()}`;
    const body: any = c.bodies.buildEventGroupBody({ productUuid: c.cat.productUuid, quantityUnit: c.unit, quantityValue: o.qtys[0], productQualityUuid: c.cat.productQualityUuid });
    body.line_items = o.qtys.map((q) => ({ product_uuid: c.cat.productUuid, quantity: { unitSymbol: c.unit, value: q }, product_quality_uuid: c.cat.productQualityUuid }));
    const d = await this.call(`Create the draft event (${o.qtys.length} line items)`, c.buyerApi, "POST", c.E.eventGroups(), body);
    const ids: string[] = (d.data?.event_group_line_item_ids ?? []).map(String);
    if (!d.ok || ids.length < o.qtys.length) return undefined;
    const eg = String(d.data.uuid);
    const lines = o.qtys.map((q, i) => ({ uuid: ids[i], qty: q }));
    const bst = nowSec();
    const timing = { bst, bet: bst + o.openFor, ect: bst + o.openFor + (o.extra ?? 60) };
    const stage: any = c.bodies.buildPricingStageBody({
      eventGroupUuid: eg, lineItemUuid: lines[0].uuid, vendorCompanyUuid: o.audience[0].vendorCompanyUuid, pricingTemplateUuid: c.cat.pricingTemplateUuid,
      productUuid: c.cat.productUuid, productQualityUuid: c.cat.productQualityUuid, locationUuid: c.cat.locationUuid,
      quantityValue: lines[0].qty, quantityUnit: c.unit, timing, stageNo: 1, rfxMode: o.kind ?? "rfq", ...(o.kind === "auction" ? { auctionConfig: "rank" } : {}),
      title: `Integrity ${o.tag}`,
    });
    stage.widgets = o.widgets;
    const row0 = stage.data[0];
    stage.data = lines.map((l, i) => ({
      ...JSON.parse(JSON.stringify(row0)),
      product: { ...row0.product, event_group_line_item_uuid: l.uuid },
      creator_quantity: { ...row0.creator_quantity, value: l.qty },
      order: i + 1,
    }));
    o.tweak?.(stage.configurations);
    const t = await this.call(`Add the pricing round for ${o.audience.length} vendors`, c.buyerApi, "POST", c.E.createTrade(), { ...stage, audience_company_uuids: o.audience.map((v) => v.vendorCompanyUuid) });
    if (!t.ok || !t.data?.uuid) return undefined;
    const trade = String(t.data.uuid);
    const pub = await this.call("Publish the event", c.buyerApi, "PATCH", c.E.eventGroup(eg), {
      ...c.bodies.buildPublishBody({ title, technicalTradeUuid: trade, pricingTradeUuid: trade, vendorCompanyUuid: o.audience[0].vendorCompanyUuid }),
      draft_trade_request_uuids: [trade], audience_company_uuids: o.audience.map((v) => v.vendorCompanyUuid),
    });
    if (!pub.ok) return undefined;
    // the stage's widgets as the app stored them (precision overrides applied) drive the oracle
    const show = await send(c.buyerApi, "GET", c.E.tradeDetails(trade));
    const template = templateFromWidgets(pickWidgets(show.data) ?? o.widgets);
    if (!pickWidgets(show.data)) this.note("The round's stored widgets could not be read back; the oracle uses the widgets this run sent.");
    const clk = clockOf(show.data);
    return { eg, title, trade, lines, widgets: o.widgets, template, bst: clk?.bst || timing.bst, bet: clk?.bet ?? timing.bet, ect: clk?.ect ?? timing.ect, audience: o.audience };
  }

  /** The round's products (one per line, in line order) as `api` reads them. */
  async tradeProducts(api: any, b: Built, who: string): Promise<any[] | undefined> {
    const key = `${who}:${b.trade}`;
    if (this.products.has(key)) return this.products.get(key);
    const r = await send(api, "GET", this.c.E.tradeDetails(b.trade));
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

  /**
   * The sheet rows a bid sends: every participant input the oracle was given, and every formula
   * widget filled with the value the UI would compute (`sendTotals: "oracle"`) — or a tampered
   * value (`"tamper"`) to see whether the app trusts a client-sent total.
   */
  private rows(b: Built, v: QaVendor, input: BidInput, tps: any[], surrogate: boolean, sendTotals: "oracle" | "tamper" | "none") {
    const calc = computeBid(b.template, input);
    const rows = input.lines.map((ln, i) => {
      const a = {
        pricingTradeUuid: b.trade, vendorCompanyUuid: v.vendorCompanyUuid, productUuid: this.c.cat.productUuid, productQualityUuid: this.c.cat.productQualityUuid,
        locationUuid: this.c.cat.locationUuid, lineItemUuid: b.lines[i].uuid, quantityValue: b.lines[i].qty, quantityUnit: this.c.unit,
        price: Number(ln.price ?? 0), tradeProduct: tps[i],
      };
      const body: any = surrogate ? this.c.bodies.buildSurrogateRfqBody(a) : this.c.bodies.buildBidProductsBody(a).body;
      const row = body.sheets.inline_components.data[v.vendorCompanyUuid][0];
      row.serial_number = { value: i + 1, key: "serial_number" };
      for (const w of b.template.inline) {
        if (w.formula) {
          if (sendTotals === "none") delete row[w.key];
          else {
            const val = calc.lines[i]?.[w.key];
            const sent = sendTotals === "tamper" && w.key === "total_amount" ? Dec.of(1) : val;
            row[w.key] = { ...(row[w.key] ?? {}), key: w.key, value: sent === undefined ? null : sent.toNumber() };
          }
        } else if (w.participant && ln[w.key] !== undefined && w.key !== "price") {
          row[w.key] = { ...(row[w.key] ?? {}), key: w.key, value: w.key === "participant_quantity" ? String(ln[w.key]) : ln[w.key] };
        }
      }
      if (ln.participant_quantity !== undefined && row.participant_quantity) row.participant_quantity.value = String(ln.participant_quantity);
      return { body, row };
    });
    const global: Record<string, any> = {};
    for (const w of b.template.global) {
      if (w.formula) {
        if (sendTotals === "none") continue;
        const val = calc.global[w.key];
        const sent = sendTotals === "tamper" && w.key === "gross_total" ? Dec.of(1) : val;
        global[w.key] = { value: sent === undefined ? null : String(sent.toNumber()) };
      } else if (input.global?.[w.key] !== undefined) global[w.key] = { value: input.global[w.key] };
    }
    return { rows, global, calc };
  }

  /** The vendor's own bid: open → price every line → submit (with the global inputs). */
  async vendorBid(v: QaVendor, b: Built, input: BidInput, opts: { sendTotals?: "oracle" | "tamper" | "none"; label?: string } = {}): Promise<{ submitted: boolean; bidUuid?: string; code?: string }> {
    const who = this.name(v);
    const label = opts.label ?? `${who} bids`;
    const api = await this.vendor(v);
    if (!api) return { submitted: false };
    const open = await this.call(`${label}: open a bid`, api, "POST", this.c.E.createBid(), this.c.bodies.buildCreateBid({ pricingTradeUuid: b.trade, vendorCompanyUuid: v.vendorCompanyUuid }));
    if (!open.ok) return { submitted: false, code: open.code };
    const bidUuid = String(open.data?.bid_uuid ?? open.data?.uuid);
    const tps = await this.tradeProducts(api, b, who);
    if (!tps) return { submitted: false };
    const { rows, global } = this.rows(b, v, input, tps, false, opts.sendTotals ?? "oracle");
    const body = rows[0].body;
    body.sheets.inline_components.data[v.vendorCompanyUuid] = rows.map((r) => r.row);
    await sleep(3_200); // the 3 s per-company bid lock (516)
    const prod = await this.call(`${label}: price the lines`, api, "POST", this.c.E.createBidProducts(bidUuid), body);
    if (!prod.ok) return { submitted: false, code: prod.code };
    const sub: any = this.c.bodies.buildSubmitBidBody({ pricingTradeUuid: b.trade, vendorCompanyUuid: v.vendorCompanyUuid, total: 0 });
    sub.sheets.global_price_components.global_data[v.vendorCompanyUuid] = global;
    await sleep(3_200);
    const s = await this.call(`${label}: submit`, api, "PATCH", this.c.E.submitBid(bidUuid), sub);
    return { submitted: s.ok && s.data?.success !== false, bidUuid, code: s.code };
  }

  /** The buyer enters the whole bid on a vendor's behalf (surrogate). */
  async surrogateBid(v: QaVendor, b: Built, input: BidInput, opts: { sendTotals?: "oracle" | "tamper" | "none" } = {}): Promise<{ submitted: boolean; code?: string }> {
    const tps = await this.tradeProducts(this.c.buyerApi, b, "the buyer");
    if (!tps) return { submitted: false };
    const { rows, global } = this.rows(b, v, input, tps, true, opts.sendTotals ?? "oracle");
    const body = rows[0].body;
    body.sheets.inline_components.data[v.vendorCompanyUuid] = rows.map((r) => r.row);
    body.sheets.global_price_components.global_data[v.vendorCompanyUuid] = global;
    const r = await this.call(`Buyer enters a bid on ${this.name(v)}'s behalf`, this.c.buyerApi, "POST", this.c.E.surrogateRfqBid(), body);
    return { submitted: r.ok, code: r.code };
  }

  /** Wait until an epoch second, capped. */
  async until(sec: number, why: string, capMin = 8): Promise<boolean> {
    const due = sec * 1000 - Date.now();
    if (due <= 0) return true;
    const cap = Math.min(due, capMin * 60_000);
    this.onLine(`  … waiting ${Math.round(cap / 1000)} s — ${why}`);
    await sleep(cap);
    return cap === due;
  }
}

/** The widgets block of a trade/schema reply, wherever the serializer put it. */
export function pickWidgets(d: any): any | undefined {
  if (!d || typeof d !== "object") return undefined;
  if (Array.isArray(d.sheets?.inline_components?.widgets) && d.sheets.inline_components.widgets.length) {
    return { inline_components: d.sheets.inline_components.widgets, global_price_components: d.sheets?.global_price_components?.widgets ?? [] };
  }
  const cands = [d.widgets, d.sheets?.widgets, d.template?.widgets, d.data?.widgets];
  for (const w of cands) if (w?.inline_components?.length) return w;
  if (Array.isArray(d.inline_widgets) && d.inline_widgets.length) return { inline_components: d.inline_widgets, global_price_components: d.global_widgets ?? [] };
  return undefined;
}

function clockOf(d: any): { bst: number; bet: number; ect: number } | undefined {
  if (!d) return undefined;
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

export { decodeProcolId };
