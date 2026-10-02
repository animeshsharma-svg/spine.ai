/**
 * THE VENDOR BID — the vendor signs in to the portal and answers the round.
 *
 * Ported from the collection (U.vendorAppToken, U.vendorSessionToken,
 * U.parseForms, U.vbPageBody, U.vbCheckQuote). Where a surrogate bid is the
 * buyer answering on a vendor's behalf, this is the vendor itself: an OTP
 * login with the vendor app's key, a draft bid sheet, one page of answers per
 * form, then the submit.
 */
import { expect } from "@playwright/test";

import type { Api, ApiResponse } from "./api.js";
import { cfgList, cfgNum, cfgStr } from "./config.js";
import type { Ctx } from "./harness.js";
import { now } from "./harness.js";
import type { RunState, SbForm } from "./state.js";
import { sbValueFor } from "./surrogate.js";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** The vendor app's own token, before anyone has logged in. */
export const vendorAppToken = () => b64(`${cfgStr("vendor_app_key")}:${cfgStr("vendor_app_secret")}`);
/** A logged-in vendor's token: the app key and secret plus the session. */
export const vendorSessionToken = (session: string) => b64(`${cfgStr("vendor_app_key")}:${cfgStr("vendor_app_secret")}:${session}`);

/** Every call as the vendor portal makes it: its token, its app version, its client header. */
export function asVendor(
  api: Api,
  token: string,
  shown: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  opts: { body?: unknown; raw?: string } = {},
): Promise<ApiResponse> {
  return api.call(method, path, {
    ...opts,
    auth: { token, shown },
    appVersion: cfgStr("vendor_app_version"),
    headers: { "X-Proc-Client": "vendor" },
  });
}

/** The participant questions on each form of a round, as buyer or vendor sees them. */
export function parseForms(sheetsForms: any[]): SbForm[] {
  return (sheetsForms || []).map((f) => ({
    form_uuid: f.uuid,
    name: f.name,
    page_uuid: (f.page_uuids || [])[0],
    egli: f.egli_uuid || null,
    headers: (f.page_response_headers || [])
      .filter(
        (h: any) =>
          h.key_attribute !== "evaluation_score" &&
          (h.configuration || {}).mode_type !== "read" &&
          ((h.configuration || {}).field_type || "participant") === "participant",
      )
      .map((h: any) => ({
        key: h.key_attribute,
        name: h.name,
        input_type: h.input_type,
        required: !!(h.configuration || {}).is_required,
        description: h.description,
        options: (h.configuration || {}).cell_options || null,
      })),
  }));
}

/** One form's answers, as create_page_responses takes them (untouched optional fields are null, like the portal). */
export function vbPageBody(state: RunState, form: SbForm, vendor: { uuid: string; name?: string }, n: number) {
  return {
    form_uuid: form.form_uuid,
    page_uuids: [form.page_uuid],
    page_responses: {
      [form.page_uuid]: form.headers.map((h) => {
        const v = sbValueFor(form, h, vendor, n);
        let val = v.set ? v.value : null;
        if (val === "" && !h.required) val = null;
        return { key_attribute: h.key, value: val };
      }),
    } as Record<string, Array<{ key_attribute: string; value: unknown }>>,
    item_type: "TradeRequest",
    item_uuid: state.bidTrade,
  };
}

/** A vendor's submitted bid, held against what it sent — from the vendor's side or the buyer's. */
export function vbCheckQuote(t: Ctx, b: any, v: NonNullable<RunState["vbVendors"]>[number], view: "vendor" | "buyer") {
  const p = `${view === "vendor" ? "Vendor" : "Buyer"} view — ${v.name}: `;
  const forms = v.forms ?? [];
  t.check(`${p}it is the bid submitted`, () => expect(b.sheet_uuid).toBe(v.sheet));
  t.check(`${p}placed in the last 10 minutes`, () => expect(Math.abs(b.placed_at - now())).toBeLessThan(600));
  t.check(`${p}placed after the sheet was created`, () => expect(b.placed_at).toBeGreaterThanOrEqual(b.created_at));
  t.check(`${p}the bid is the vendor's company`, () => expect(b.participants.company.uuid).toBe(v.uuid));
  if (view === "vendor") t.check(`${p}placed by the vendor who logged in`, () => expect(b.participants.user.uuid).toBe(v.user));
  t.check(`${p}a real vendor bid, not a surrogate one`, () => expect(b.participants.bid_config.is_surrogate_bid).toBe(false));
  if (view === "vendor") t.check(`${p}the vendor sees it as its own bid`, () => expect(b.participants.bid_config.is_my_bid).toBe(true));
  t.check(`${p}active and registered`, () => {
    expect(b.participants.status).toBe("active");
    expect(b.participants.is_unregistered_bid).toBe(false);
  });
  const rows = (b.data || {})[v.uuid] || [];
  t.check(`${p}one response per form submitted (${forms.length})`, () => expect(rows).toHaveLength(forms.length));
  for (const f of forms) {
    const r = rows.find((x: any) => x.form_uuid === f.form_uuid);
    t.check(`${p}${f.name}: stored`, () => expect(r).toBeTruthy());
    if (!r) continue;
    t.check(`${p}${f.name}: line item not regretted`, () => expect(r.is_egli_regretted).toBe(false));
    for (const sv of (v.sent ?? {})[f.page_uuid] || []) {
      const h = f.headers.find((x) => x.key === sv.key_attribute) || { name: sv.key_attribute };
      t.check(`${p}${f.name} / ${h.name}: stored exactly as sent`, () => {
        const g = (r[f.page_uuid] || []).find((x: any) => x.key_attribute === sv.key_attribute);
        expect(g, "missing").toBeTruthy();
        expect(g.value === undefined ? null : g.value).toEqual(sv.value);
      });
    }
    t.check(`${p}${f.name}: required answers filled`, () =>
      f.headers.filter((h) => h.required).forEach((h) => {
        const g = (r[f.page_uuid] || []).find((x: any) => x.key_attribute === h.key);
        expect([null, undefined, ""], h.name).not.toContain(g && g.value);
      }),
    );
  }
}

// ── RFQ: the price bid ──────────────────────────────────────────────────────

export const CURRENCIES: Record<string, Record<string, unknown>> = {
  INR: { name: "Indian Rupees (INR)", code: "INR", symbol: "\u20b9", rateInBase: 1, adjustedPrecision: 2, configuredPrecision: null, defaultPrecision: 2, numberSystem: "INDIAN", currencyLabel: "\u20b9" },
};
export const round2 = (x: number) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

/**
 * The vendor's price rows, as create_bid_products takes them: the round's own
 * rows with the vendor's price, quantity and GST filled in — the console's
 * shape exactly, down to a `key` on every cell. Vendor n bids n × step% above
 * the first, so the first vendor comes out L1.
 */
export function vbRfqRows(rows: any[], pad: Record<string, any>, vIdx: number) {
  const pick = (k: "rfq_bid_prices" | "rfq_bid_quantities" | "rfq_bid_gst", i: number) => {
    const l = cfgList(k);
    return l.length === 0 ? null : l.length === 1 ? l[0] : l[i];
  };
  const step = 1 + (Number(vIdx) || 0) * (cfgNum("rfq_price_step_pct") || 0) / 100;
  const out: any[] = [];
  const plan: NonNullable<NonNullable<RunState["vbVendors"]>[number]["plan"]> = [];
  rows.forEach((r0, i) => {
    const r = JSON.parse(JSON.stringify(r0));
    for (const k of ["action", "status", "serial_number", "creator_quantity", "participant_quantity", "price", "gst", "total_amount", "product", "variant", "buyer_hub"]) {
      if (r[k] && typeof r[k] === "object") r[k].key = k;
    }
    const unit = (r.creator_quantity.configuration || {}).unit_type || (r.product || {}).unit_type || "";
    const qRaw = pick("rfq_bid_quantities", i);
    const qty = Number(qRaw !== null ? qRaw : r.participant_quantity.value != null ? r.participant_quantity.value : r.creator_quantity.value);
    const price = round2(Number(pick("rfq_bid_prices", i)) * step);
    const gRaw = pick("rfq_bid_gst", i);
    const gst = gRaw !== null ? Number(gRaw) : null;
    r.creator_quantity.postfix = unit;
    r.participant_quantity.value = String(qty);
    r.participant_quantity.postfix = unit;
    r.price.postfix = (r.price.configuration || {}).suffix || `/${unit}`;
    r.price.prefix = (r.price.configuration || {}).prefix;
    r.price.value = price;
    r.price.precision = 2;
    if (r.gst) {
      r.gst.postfix = "%";
      if (gst !== null) r.gst.value = gst;
    }
    const total = round2(price * qty * (1 + (gst || 0) / 100));
    if (r.total_amount) {
      r.total_amount.prefix = (r.total_amount.configuration || {}).prefix;
      r.total_amount.value = total;
      r.total_amount.precision = 2;
    }
    const pd = (pad || {})[r.product.uuid] || {};
    r.product.qualities = pd.quality_params || [];
    r.product.description = pd.description || null;
    r.product.image = pd.image_url || null;
    r.checkbox_selector = { key: "checkbox_selector" };
    out.push(r);
    plan.push({ egli: r.product.event_group_line_item_uuid, name: r.product.value, qty, price, gst, total, creator_qty: Number(r.creator_quantity.value) });
  });
  return { rows: out, plan, gross: round2(plan.reduce((a, p) => a + p.total, 0)) };
}

/** The body create_bid_products takes for a vendor's rows. */
export const bidProductsBody = (s: RunState, company: string, rows: any[]) => ({
  company_uuid: company,
  trade_request_uuid: s.bidTrade,
  sheets: { inline_components: { data: { [company]: rows } } },
});

/** The body that submits an RFQ bid with its gross total. */
export const bidSubmitBody = (s: RunState, company: string, gross: number | string, status = "active") => ({
  company_uuid: company,
  bill_to_broker: false,
  trade_request_uuid: s.bidTrade,
  currency_preference: { code: cfgStr("bid_currency_code") },
  sheets: { global_price_components: { global_data: { [company]: { gross_total: { value: String(gross) } } } } },
  status,
  fast_bid_enabled: false,
});

/** An RFQ bid's rows held against what the vendor priced (4B.10, and again after the negatives). */
export function vbRfqCheckRows(t: Ctx, b: any, v: NonNullable<RunState["vbVendors"]>[number], p: string) {
  const rows = ((b.sheets.inline_components.data || {})[v.uuid]) || [];
  const plan = v.plan ?? [];
  t.check(`${p}a price row per line item (${plan.length})`, () => expect(rows).toHaveLength(plan.length));
  for (const e of plan) {
    const r = rows.find((x: any) => x.product.event_group_line_item_uuid === e.egli);
    t.check(`${p}${e.name}: has a row`, () => expect(r).toBeTruthy());
    if (!r) continue;
    t.check(`${p}${e.name}: price ${e.price}`, () => expect(Number(r.price.value)).toBe(e.price));
    t.check(`${p}${e.name}: offered quantity ${e.qty}`, () => expect(Number(r.participant_quantity.value)).toBe(e.qty));
    t.check(`${p}${e.name}: GST ${e.gst == null ? "blank" : `${e.gst}%`}`, () => expect(Number((r.gst || {}).value || 0)).toBe(e.gst || 0));
    t.check(`${p}${e.name}: the line is active`, () => expect((r.status || {}).value).toBe("active"));
    if (r.total_amount && r.total_amount.value != null) {
      t.check(`${p}${e.name}: line total ${e.total} (price × quantity × GST)`, () => expect(round2(r.total_amount.value)).toBe(e.total));
    }
  }
  const g = ((b.sheets.global_price_components.global_data || {})[v.uuid] || {}).gross_total;
  t.check(`${p}gross total ${v.gross}`, () => expect(round2(g && g.value)).toBe(v.gross));
  t.check(`${p}gross total = Σ price × quantity × (1 + GST)`, () =>
    expect(round2(plan.reduce((a, e) => a + e.price * e.qty * (1 + (e.gst || 0) / 100), 0))).toBe(v.gross),
  );
}
