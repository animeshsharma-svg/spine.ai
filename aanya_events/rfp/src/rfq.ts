/**
 * THE RFQ ROUND — price widgets and one row per line item, instead of forms.
 *
 * Ported from the collection's RFQ library (U.buildRfqStageBody,
 * U.rfqTemplateTest, U.rfqStageTest, U.rfqCheckRows, U.rfqSchemaTest). An RFP
 * round asks vendors questions; an RFQ round asks them for prices, so its body
 * is the template's widgets (product, quantity, delivery location, price, …)
 * and a data row per line item filling the buyer's side of each.
 */
import { expect } from "@playwright/test";

import type { ApiResponse } from "./api.js";
import { cfgBool, cfgInt, cfgJson, cfgList, cfgStr, stageTitle } from "./config.js";
import type { Ctx } from "./harness.js";
import { now, uniq } from "./harness.js";
import type { RunState, StagePlan } from "./state.js";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function norm(w: any) {
  const c = clone(w);
  const o: any = {
    name: c.name,
    key_attribute: c.key_attribute,
    input_type: c.input_type,
    widget_type: c.widget_type || "default",
    validation: c.validation || {},
    configuration: { ...(c.configuration || {}) },
  };
  if (o.configuration.options === undefined) o.configuration.options = [];
  return o;
}

function postfix(w: any, unit: string | null) {
  const c = w.configuration || {};
  if (c.suffix === "%") return "%";
  if (["quantity", "price"].includes(c.input_group) || w.input_type === "quantity") return unit ?? undefined;
  return undefined;
}

export function buildRfqStageBody(state: RunState, eg: string, egli: string[]) {
  const sel = state.selProducts;
  if (!sel || !egli || !eg) throw new Error("Missing state — step 1.2 (products) and a create-event step must run first");
  const tplw = state.rfqTemplate;
  if (!tplw) throw new Error("the RFQ template's widgets were not read — step 1.5 must run first (an RFQ needs a template)");
  const tpl = state.template ?? { uuid: null };
  const d = state.cfgDefaults!;
  const tnc = state.tnc;
  const vendors = state.vendors ?? [];

  const inline = (tplw.widgets.inline_components || []).map(norm);
  for (const k of cfgList("rfq_extra_inline_widgets")) {
    if (inline.find((w: any) => w.key_attribute === k)) continue;
    const m = (tplw.mapped_widgets || []).find((w: any) => w.key_attribute === k);
    if (!m) throw new Error(`rfq_extra_inline_widgets: "${k}" is not in the template's mapped widgets (${(tplw.mapped_widgets || []).map((w: any) => w.key_attribute).join(", ")})`);
    inline.push(norm(m));
  }
  if (cfgBool("rfq_add_variant_widget") && !inline.find((w: any) => w.key_attribute === "variant")) {
    inline.push({
      name: "Product Variant",
      key_attribute: "variant",
      input_type: "variant",
      widget_type: "default",
      validation: {},
      configuration: { field_type: "creator", is_required: true, mode_type: "write", freeze_widget: "primary", priority: "1", is_removable: false, options: [] },
    });
  }
  const global = clone(tplw.widgets.global_price_components || []);
  const addGlobal = (k: string) => {
    if (global.find((w: any) => w.key_attribute === k)) return;
    const m = (tplw.global_mapped_widgets || []).find((w: any) => w.key_attribute === k);
    if (!m) throw new Error(`global widget "${k}" is not in the template's global mapped widgets`);
    global.push(clone(m));
  };
  if (cfgBool("rfq_add_sum_total") && (tplw.global_mapped_widgets || []).find((w: any) => w.key_attribute === "gross_total")) addGlobal("gross_total");
  cfgList("rfq_extra_global_widgets").forEach(addGlobal);

  const hubs = state.rfqHubs ?? [];
  if (!hubs.length) throw new Error("no delivery location — step 1.5c must run first");
  const creatorVals = cfgJson<Record<string, unknown>>("rfq_creator_values") || {};
  const rows = sel.map((s, i) => {
    const hub = hubs.length === 1 ? hubs[0] : hubs[i];
    const row: any = {};
    for (const w of inline) {
      const k = w.key_attribute;
      const c = w.configuration || {};
      if (k === "product") {
        row.product = {
          key: "product",
          value: s.name,
          uuid: s.product_uuid,
          product_code: s.product_code,
          event_group_line_item_uuid: egli[i],
          meta: { qualityParams: s.quality_params || [], imageUrl: s.image_url || null },
          configuration: {},
        };
      } else if (k === "creator_quantity") row.creator_quantity = { key: k, value: s.quantity, postfix: s.unit, configuration: { suffix: s.unit } };
      else if (k === "buyer_hub") row.buyer_hub = { key: k, value: hub.value, uuid: hub.uuid, configuration: {} };
      else if (k === "variant") row.variant = { uuid: s.variant_uuid, configuration: {} };
      else {
        const cell: any = { key: k };
        const conf: any = {};
        if (c.prefix) {
          cell.prefix = c.prefix;
          conf.prefix = c.prefix;
        }
        const pf = postfix(w, s.unit);
        if (pf) {
          cell.postfix = pf;
          conf.suffix = pf;
        }
        if (c.field_type === "creator" && c.mode_type !== "read" && Object.prototype.hasOwnProperty.call(creatorVals, k)) {
          const v = creatorVals[k];
          cell.value = Array.isArray(v) ? v[i] : v;
        }
        cell.configuration = conf;
        row[k] = cell;
      }
    }
    row.order = i + 1;
    return row;
  });

  const start = now() + cfgInt("bid_start_offset_sec")!;
  const end = start + d.event_duration;
  const extraClose = end + d.evaluation_duration;
  const body: Record<string, any> = {
    widgets: { global_price_components: global, inline_components: inline },
    data: rows,
    configurations: {
      stage_no: 1,
      event_group_uuid: eg,
      is_tnc_mandatory: cfgBool("is_tnc_mandatory"),
      currency_configuration: null,
      is_english_auction_enabled: cfgBool("is_english_auction_enabled"),
      is_alternate_bidding_allowed: cfgBool("is_alternate_bidding_allowed"),
      order_type: cfgStr("order_type") || tplw.order_type || "buy",
      rfx_mode: "rfq",
      auction_closing_mode: d.auction_closing_mode,
      rfp_evaluation_mode: d.rfp_evaluation_mode,
      pickup_schedules: false,
      bid_start_time: start as number | string,
      bid_end_time: end,
      extra_closing_time: extraClose,
      title: stageTitle(),
      terms_and_conditions: tnc ? tnc.terms_and_conditions : [],
      attachments: tnc ? tnc.attachments : [{ type: "t_and_c", value: [] }],
      template_uuid: tpl.uuid || null,
      savings_configuration: null,
      bulk_price: null,
      time_extension_value: null,
      last_n_minutes_for_time_extension: null,
      rank_limit_for_time_extension: null,
      dynamic_closing_time_strategy: cfgStr("dynamic_closing_time_strategy"),
      price_difference: null,
      time_difference: null,
      end_price: 0,
      is_auction_on_base_price: false,
      closing_mode: cfgStr("closing_mode"),
      is_basket_auction: false,
      is_new_stage_addition: false,
    } as Record<string, any>,
    tabs: [],
    status: "draft",
    audience_company_uuids: vendors.map((v) => v.uuid),
    creation_flow_type: cfgStr("creation_flow_type"),
    use_rfq_quotes_as_bids: cfgBool("use_rfq_quotes_as_bids"),
  };
  const meta: StagePlan = {
    rfq: true,
    rows: rows.map((r: any, i: number) => ({
      egli: egli[i],
      product_uuid: sel[i].product_uuid,
      name: sel[i].name,
      qty: sel[i].quantity,
      unit: sel[i].unit,
      hub: r.buyer_hub ? { uuid: r.buyer_hub.uuid, value: r.buyer_hub.value } : null,
      variant: sel[i].variant_uuid,
    })),
    inline_keys: inline.map((w: any) => w.key_attribute),
    global_keys: global.map((w: any) => w.key_attribute),
    forms_count: 0,
    plan: [],
    vendor_assessment: null,
  };
  return { body, timing: { start, end, extra: extraClose, duration: d.event_duration, evaluation: d.evaluation_duration }, meta };
}

/** 1.5 in RFQ mode: the template's price widgets. */
export function rfqTemplateTest(t: Ctx, res: ApiResponse) {
  t.basic(res, { status: 200, schema: "templateDetailRfq", critical: true });
  const b = res.json;
  const sel = t.state.template!;
  t.check("It is the template chosen", () => expect(b.uuid).toBe(sel.uuid));
  t.check("Its name matches", () => expect(b.name).toBe(sel.name));
  t.check('It is a "trade" (RFQ) template', () => expect(b.template_for).toContain("trade"));
  const inl = b.widgets.inline_components;
  const keys: string[] = inl.map((w: any) => w.key_attribute);
  t.critical("It has the RFQ's required widgets: product, quantity, delivery location, price", () =>
    ["product", "creator_quantity", "buyer_hub", "price"].forEach((k) => expect(keys, k).toContain(k)),
  );
  t.check("Widget keys are unique", () => expect(uniq(keys).length).toBe(keys.length));
  t.check("The vendor's price and quantity are required", () =>
    inl.filter((w: any) => ["price", "participant_quantity"].includes(w.key_attribute)).forEach((w: any) => expect(w.configuration.is_required, w.key_attribute).toBe(true)),
  );
  t.check("Formula widgets are read-only and only refer to widgets that exist", () =>
    inl
      .concat(b.widgets.global_price_components || [])
      .filter((w: any) => w.input_type === "formula")
      .forEach((w: any) => {
        expect(w.configuration.mode_type, w.key_attribute).toBe("read");
        const refs = (String(w.configuration.formula || "").match(/[a-z_]{3,}/g) || []).filter((r) => r !== "sum");
        refs.forEach((r) => expect(keys.concat((b.global_mapped_widgets || []).map((x: any) => x.key_attribute)), `${w.key_attribute} → ${r}`).toContain(r));
      }),
  );
  t.check("Widget priorities are numbers", () =>
    inl.forEach((w: any) => {
      if (w.configuration.priority !== undefined) expect(Number.isNaN(Number(w.configuration.priority)), w.key_attribute).toBe(false);
    }),
  );
  t.check("The order type is buy or sell", () => expect(["buy", "sell"]).toContain(b.order_type || "buy"));
  const extras = cfgList("rfq_extra_inline_widgets").filter((k) => !(b.mapped_widgets || []).find((w: any) => w.key_attribute === k));
  t.critical("The extra widgets asked for exist in the template", () => expect(extras, `unknown: ${extras.join(", ")}`).toEqual([]));
  const gextras = cfgList("rfq_extra_global_widgets").filter((k) => !(b.global_mapped_widgets || []).find((w: any) => w.key_attribute === k));
  t.critical("The extra total widgets asked for exist in the template", () => expect(gextras, `unknown: ${gextras.join(", ")}`).toEqual([]));
  t.state.rfqTemplate = { widgets: b.widgets, mapped_widgets: b.mapped_widgets || [], global_mapped_widgets: b.global_mapped_widgets || [], order_type: b.order_type };
  t.state.template = { uuid: b.uuid, name: b.name };
  t.actual(`"${b.name}" is a ${b.order_type || "buy"} template with ${inl.length} price widget(s): ${keys.join(", ")}.`);
}

/** The rows of an RFQ round, held against what was sent. */
export function rfqCheckRows(t: Ctx, rows: any[], meta: StagePlan, tag: string, phase: "draft" | "active") {
  const want = meta.rows ?? [];
  t.check(`${tag}One row per line item (${want.length})`, () => expect(rows).toHaveLength(want.length));
  want.forEach((m, i) => {
    const r = rows.find((x) => x.product && x.product.event_group_line_item_uuid === m.egli);
    const p = `${tag}#${i + 1} ${m.name}: `;
    t.check(`${p}has a row`, () => expect(r).toBeTruthy());
    if (!r) return;
    t.check(`${p}serial number ${i + 1}`, () => expect(r.serial_number.value).toBe(i + 1));
    t.check(`${p}product`, () => {
      expect(r.product.uuid).toBe(m.product_uuid);
      expect(r.product.value).toBe(m.name);
    });
    t.check(`${p}quantity ${m.qty}`, () => expect(Number(r.creator_quantity.value)).toBe(m.qty));
    t.check(`${p}unit ${m.unit}`, () => expect(String((r.creator_quantity.configuration || {}).unit_type || r.product.unit_type).trim()).toBe(String(m.unit).trim()));
    if (m.hub) {
      t.check(`${p}delivered to ${m.hub.value}`, () => {
        expect(r.buyer_hub.uuid).toBe(m.hub!.uuid);
        expect(r.buyer_hub.value).toBe(m.hub!.value);
      });
    }
    if (m.variant) t.check(`${p}variant`, () => expect(r.variant.uuid).toBe(m.variant));
    t.check(`${p}the vendor's price and quantity are still empty (no bid yet)`, () => {
      if (r.price) expect([null, undefined, ""]).toContain(r.price.value);
      if (r.participant_quantity) expect([null, undefined, ""]).toContain(r.participant_quantity.value);
    });
    if (r.price?.configuration?.suffix) t.check(`${p}price is per ${m.unit}`, () => expect(r.price.configuration.suffix).toContain(String(m.unit).trim()));
    if (r.product.trade_product_desc) {
      t.check(`${p}description mentions the quantity and delivery location`, () => {
        expect(r.product.trade_product_desc).toContain(String(m.qty));
        if (m.hub) expect(r.product.trade_product_desc).toContain(m.hub.value);
      });
    }
    if (r.product.event_group_line_item_status) {
      t.check(`${p}line item is ${phase === "draft" ? "a draft" : "live"}`, () =>
        expect(phase === "draft" ? ["draft"] : ["active", "draft", "published"]).toContain(r.product.event_group_line_item_status),
      );
    }
  });
}

/** 1.9 in RFQ mode. */
export function rfqStageTest(t: Ctx, res: ApiResponse, meta: StagePlan) {
  t.basic(res, { status: 200, sla: "heavy", schema: "rfqStage", critical: true });
  const b = res.json;
  const tm = t.state.timing!;
  const tpl = t.state.template ?? { uuid: null };
  t.critical("A round id came back", () => expect(typeof b.uuid === "string" && b.uuid.length > 0).toBe(true));
  t.check("Reference looks like RFQ-<n>", () => expect(b.ref_uuid).toMatch(/^RFQ-\d+$/));
  t.check("The round is a draft", () => expect(b.status).toBe("draft"));
  t.check("Its mode is RFQ", () => expect(b.rfx_mode).toBe("rfq"));
  t.check('It is "rfqing"', () => expect(b.current_status).toBe("rfqing"));
  t.check("The order type is the one sent", () => expect(b.order_type).toBe(cfgStr("order_type") || t.state.rfqTemplate?.order_type || "buy"));
  t.check("Its title is the one sent", () => expect(String(b.title).trim()).toBe(stageTitle().trim()));
  t.check("It belongs to this event", () => expect(b.event_group_uuid).toBe(t.state.eventGroupUuid));
  t.check("It is round 1", () => expect(b.stage_no).toBe(1));
  t.check("The template is kept", () => {
    expect(b.template_uuid).toBe(tpl.uuid);
    expect(b.template_name).toBe(tpl.name);
  });
  t.check("It starts when asked", () => expect(b.starting_from).toBe(tm.start));
  t.check("It ends when asked", () => expect(b.ending_at).toBe(tm.end));
  t.check("Its evaluation window closes when asked", () => expect(b.extra_closing_time).toBe(tm.extra));
  t.check("It was created by the signed-in user", () => expect(b.creator.user.uuid).toBe(t.state.currentUserUuid));
  t.check("No vendors or proposals yet", () => {
    expect(Object.keys(b.participants || {})).toEqual([]);
    expect(b.proposals).toEqual([]);
  });
  // Most templates rank on price; a custom one can rank on its own (a landed price, say).
  // What must hold is that vendors are ranked on a column that is on the sheet.
  t.check("Vendors are ranked on a price column that is on the sheet", () =>
    expect([...(meta.inline_keys ?? []), "price"], `ranked on "${b.ranking_widgets?.inline}"`).toContain(b.ranking_widgets.inline),
  );
  if (b.ranking_widgets?.global) {
    t.check("The overall ranking uses a total that is on the sheet", () =>
      expect([...(meta.global_keys ?? []), "gross_total"], `ranked on "${b.ranking_widgets.global}"`).toContain(b.ranking_widgets.global),
    );
  }
  if (b.ranking_widgets?.inline && b.ranking_widgets.inline !== "price") t.note(`This template ranks vendors on "${b.ranking_widgets.inline}", not plain price.`);
  const wk = b.sheets.inline_components.widgets.map((w: any) => w.key_attribute);
  t.check("Every widget sent is on the price sheet", () => (meta.inline_keys ?? []).forEach((k) => expect(wk, k).toContain(k)));
  t.check("The platform added its own columns (action, status, serial number)", () => ["action", "status", "serial_number"].forEach((k) => expect(wk).toContain(k)));
  const gk = (b.sheets.global_price_components.widgets || []).map((w: any) => w.key_attribute);
  t.check("Every total widget sent is on the sheet", () => (meta.global_keys ?? []).forEach((k) => expect(gk, k).toContain(k)));
  rfqCheckRows(t, b.order_details, meta, "", "draft");
  return b;
}

/** 2.5 in RFQ mode. */
export function rfqSchemaTest(t: Ctx, res: ApiResponse) {
  if (!t.basic(res, { status: 200, schema: "rfqStage" })) return;
  const b = res.json;
  const meta = t.state.stagePlan!;
  const tm = t.state.timing!;
  t.check("It is the RFQ round", () => expect(b.uuid).toBe(t.state.tradeUuid));
  t.check("Reference looks like RFQ-<n>", () => expect(b.ref_uuid).toMatch(/^RFQ-\d+$/));
  t.check("It is live after publishing", () => expect(b.status).toBe("active"));
  t.check("Its mode is RFQ", () => expect(b.rfx_mode).toBe("rfq"));
  t.check("It belongs to the event", () => expect(b.event_group_uuid).toBe(t.state.eventGroupUuid));
  t.check("The bid window survived publishing", () => expect(b.ending_at - b.starting_from).toBe(tm.duration));
  t.check("The evaluation window survived publishing", () => expect(b.extra_closing_time - b.ending_at).toBe(tm.evaluation));
  if (b.bid_count !== undefined) t.check("No bids yet", () => expect(b.bid_count).toBe(0));
  rfqCheckRows(t, b.order_details, meta, "Published: ", "active");
  t.actual(`Round ${b.ref_uuid} is ${b.status} with ${(b.order_details || []).length} priced row(s).`);
}
