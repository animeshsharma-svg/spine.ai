/**
 * THE THREE BODIES THAT MAKE AN EVENT, built from what the run looked up.
 *
 * Ported from the collection's shared library (U.buildStageBody,
 * U.buildPublishBody, U.toHeader, U.verifyEventGroup) so a Postman run and a
 * Playwright run send the same thing for the same settings.
 */
import { expect } from "@playwright/test";

import { cfgBool, cfgInt, cfgJson, cfgStr, isRfq, stageTitle } from "./config.js";
import { buildRfqStageBody } from "./rfq.js";
import type { Ctx } from "./harness.js";
import { now } from "./harness.js";
import type { Header, RunState, StagePlan, Timing } from "./state.js";

export const ALLOWED_INPUT_TYPES = ["multiline_text", "text", "number", "date", "attachment", "dropdown"];

const KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
export const randKey = (len = 5) => Array.from({ length: len }, () => KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]).join("");
const randId = () => "_" + randKey(5);

export interface HeaderInput {
  name: string;
  description?: string;
  input_type?: string;
  is_required?: boolean;
  options?: string[];
  cell_options?: Array<{ value: string; id: string }>;
  key_attribute?: string;
  widget_type?: string;
}

export function toHeader(h: HeaderInput, opts: { allowAnyType?: boolean } = {}): Header {
  const inputType = h.input_type || "multiline_text";
  if (!ALLOWED_INPUT_TYPES.includes(inputType) && !opts.allowAnyType) {
    throw new Error(`Unsupported input_type "${inputType}" in header "${h.name}". Allowed: ${ALLOWED_INPUT_TYPES.join(", ")}`);
  }
  const conf: Record<string, unknown> = { field_type: "participant", is_required: h.is_required === undefined ? false : !!h.is_required };
  if (inputType === "dropdown") {
    const opt = h.cell_options || (h.options || []).map((v) => ({ value: String(v), id: randId() }));
    if (!opt.length && !opts.allowAnyType) throw new Error(`Dropdown header "${h.name}" needs "options": ["a","b"]`);
    conf.cell_options = opt;
  }
  return {
    key_attribute: h.key_attribute || randKey(5),
    name: String(h.name),
    description: h.description || "",
    input_type: inputType,
    configuration: conf,
    widget_type: h.widget_type || "default",
  };
}

/** A template header copied into a line-item form, keeping the template's own key and config. */
export const cloneTemplateHeader = (h: any): Header =>
  JSON.parse(
    JSON.stringify({
      key_attribute: h.key_attribute,
      name: h.name,
      description: h.description || "",
      input_type: h.input_type,
      configuration: h.configuration || { field_type: "participant", is_required: false },
      widget_type: h.widget_type || "default",
    }),
  );

export function buildStageBody(state: RunState, eg: string, egli: string[]) {
  // An RFQ round is widgets and priced rows, not forms of questions.
  if (isRfq()) return buildRfqStageBody(state, eg, egli);
  const sel = state.selProducts;
  if (!sel || !egli || !eg) throw new Error("Missing state — step 1.2 (products) and a create-event step must run first");
  const tpl = state.template ?? { uuid: null };
  const tplHeaders = state.templateHeaders ?? [];
  const pool = state.evaluatorPool ?? [];
  const per = cfgBool("assign_evaluators") ? cfgInt("evaluators_per_line_item")! : 0;
  const d = state.cfgDefaults!;
  const tnc = state.tnc;
  const vendors = state.vendors ?? [];
  const extra = (cfgJson<HeaderInput[]>("extra_line_item_headers") || []).map((h) => toHeader(h));

  const forms: any[] = [];
  let order = 1;
  if (cfgBool("vendor_assessment_enabled")) {
    forms.push({
      order: order++,
      name: cfgStr("vendor_assessment_name"),
      description: "",
      config: { type: "table" },
      page_response_headers: (cfgJson<HeaderInput[]>("vendor_assessment_headers") || []).map((h) => toHeader(h)),
      page_headers: [],
      evaluators: [],
    });
  }
  let rr = 0;
  const plan: StagePlan["plan"] = [];
  sel.forEach((s, i) => {
    const headers: Header[] = [];
    if (cfgBool("include_quality_params")) {
      (s.quality_params || []).forEach((q) =>
        headers.push(
          toHeader({
            name: q.name,
            description: [q.value, q.unit].filter((x) => x !== undefined && x !== null && String(x) !== "").join(" "),
            input_type: "multiline_text",
            is_required: cfgBool("quality_params_required"),
          }),
        ),
      );
    }
    if (cfgBool("include_template_headers")) {
      tplHeaders.forEach((h) => {
        if (!headers.find((x) => x.name === h.name)) headers.push(JSON.parse(JSON.stringify(h)));
      });
    }
    extra.forEach((h) => headers.push({ ...h, key_attribute: randKey(5) }));
    const ev: Array<{ shared_with_uuid: string; shared_with_type: string }> = [];
    for (let k = 0; k < per && pool.length; k++) {
      const u = pool[rr++ % pool.length];
      if (!ev.find((e) => e.shared_with_uuid === u)) ev.push({ shared_with_uuid: u, shared_with_type: "User" });
    }
    const f: any = {
      order: order++,
      name: s.name,
      description: "",
      config: { type: "table" },
      event_group_line_item_uuid: egli[i],
      page_response_headers: headers,
      page_headers: [],
      evaluators: ev,
    };
    if (tpl.uuid) f.template_uuid = tpl.uuid;
    forms.push(f);
    plan.push({
      egli: egli[i],
      product_uuid: s.product_uuid,
      name: s.name,
      header_keys: headers.map((h) => h.key_attribute),
      header_names: headers.map((h) => h.name),
      evaluators: ev.map((e) => e.shared_with_uuid),
    });
  });

  const start = now() + cfgInt("bid_start_offset_sec")!;
  const end = start + d.event_duration;
  const extraClose = end + d.evaluation_duration;
  const tncAtt = tnc ? tnc.attachments : [{ type: "t_and_c", value: [] }];
  const body = {
    forms,
    configurations: {
      stage_no: 1,
      event_group_uuid: eg,
      is_tnc_mandatory: cfgBool("is_tnc_mandatory"),
      currency_configuration: null,
      is_english_auction_enabled: cfgBool("is_english_auction_enabled"),
      is_alternate_bidding_allowed: cfgBool("is_alternate_bidding_allowed"),
      rfx_mode: cfgStr("rfx_mode").toLowerCase(),
      auction_closing_mode: d.auction_closing_mode,
      rfp_evaluation_mode: d.rfp_evaluation_mode,
      pickup_schedules: false,
      bid_start_time: start as number | string,
      bid_end_time: end,
      extra_closing_time: extraClose,
      title: stageTitle(),
      terms_and_conditions: tnc ? tnc.terms_and_conditions : [],
      attachments: tncAtt,
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
  } as Record<string, any>;
  const timing: Timing = { start, end, extra: extraClose, duration: d.event_duration, evaluation: d.evaluation_duration };
  const meta: StagePlan = {
    plan,
    vendor_assessment: cfgBool("vendor_assessment_enabled") ? forms[0].page_response_headers.map((h: Header) => h.name) : null,
    forms_count: forms.length,
  };
  return { body, timing, meta };
}

/**
 * The event title: always AS_API_automation_<when this run started>.
 *
 * Every event this suite publishes lands on a real account, so it has to be
 * recognisable as the automation's at a glance in the console — and one run's
 * event distinguishable from the next. The timestamp is fixed on first use and
 * kept in the run state, so every body of the run names the same event.
 */
export const TITLE_PREFIX = "AS_API_automation_";
export function resolveTitle(state: RunState): string {
  if (state.titleResolved?.startsWith(TITLE_PREFIX)) return state.titleResolved;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  state.titleResolved = `${TITLE_PREFIX}${stamp}`;
  return state.titleResolved;
}

export function buildPublishBody(state: RunState, tradeUuid: string) {
  const title = resolveTitle(state);
  const tnc = state.tnc;
  return {
    attachments: [],
    title,
    status: "active",
    draft_trade_request_uuids: [tradeUuid],
    audience_company_uuids: (state.vendors ?? []).map((v) => v.uuid),
    line_items: [],
    terms_and_conditions: { clauses: [], attachments: tnc ? tnc.attachments : [{ type: "t_and_c", value: [] }] },
    show_under_open_events: cfgBool("show_under_open_events"),
    delete_draft_stage_uuids: [],
    amendment_remarks: { remarks: cfgStr("amendment_remarks") },
  } as Record<string, any>;
}

/** Deep check of a published event group — after the publish, and again on a fresh read. */
export function verifyEventGroup(t: Ctx, b: any, phase: "publish" | "read-back") {
  const st = t.state;
  const p = phase === "publish" ? "" : "Read back: ";
  const sel = st.selProducts ?? [];
  const vendors = st.vendors ?? [];
  const tm = st.timing;
  const d = st.cfgDefaults;
  const tpl = st.template ?? { uuid: null };
  const rfx = cfgStr("rfx_mode").toLowerCase();
  t.check(`${p}It is the event this run created`, () => expect(b.uuid).toBe(st.eventGroupUuid));
  t.critical(`${p}Event status is active (published)`, () => expect(b.status).toBe("active"));
  t.check(`${p}Title is "${st.titleResolved}"`, () => expect(b.title).toBe(st.titleResolved));
  t.check(`${p}Exactly one stage`, () => expect(b.stages).toHaveLength(1));
  t.check(`${p}Current stage is the technical stage`, () => expect(b.current_stage_uuid).toBe(st.tradeUuid));
  t.check(`${p}Not on hold`, () => expect(b.is_project_on_hold).toBe(false));
  t.check(`${p}updated_at is not before created_at`, () => expect(b.updated_at).toBeGreaterThanOrEqual(b.created_at));
  if (b.ref_uuid !== undefined) t.check(`${p}Reference looks like RFX-<n>`, () => expect(b.ref_uuid).toMatch(/^RFX-\d+$/));
  t.check(`${p}"Show under open events" kept`, () => expect(b.config?.is_show_under_open_events).toBe(cfgBool("show_under_open_events")));
  if (d && !isRfq() && b.config?.rfp_evaluation_mode !== undefined) {
    t.check(`${p}RFP evaluation mode kept`, () => expect(b.config.rfp_evaluation_mode).toBe(d.rfp_evaluation_mode));
  }
  const s = (b.stages || [])[0];
  if (!s) return;
  t.check(`${p}Stage is the one created in 1.9`, () => expect(s.uuid).toBe(st.tradeUuid));
  t.check(`${p}Stage is active`, () => expect(s.status).toBe("active"));
  t.check(`${p}Stage mode is ${rfx}`, () => expect(s.rfx_mode).toBe(rfx));
  t.check(`${p}Stage reference looks like ${rfx.toUpperCase()}-<n>`, () => expect(s.ref_id).toMatch(new RegExp(`^${rfx.toUpperCase()}-\\d+$`)));
  t.check(`${p}Stage title kept`, () => expect(String(s.title).trim()).toBe(stageTitle().trim()));
  t.check(`${p}It is stage 1`, () => expect(s.stage_no).toBe(1));
  t.check(`${p}Stage template kept`, () => expect(s.template_uuid || null).toBe(tpl.uuid || null));
  t.check(`${p}${sel.length} product${sel.length === 1 ? "" : "s"} on the stage`, () => expect(s.no_of_products).toBe(sel.length));
  t.check(`${p}${vendors.length} vendor${vendors.length === 1 ? "" : "s"} invited`, () =>
    expect(s.participants_data?.total_participants).toBe(vendors.length),
  );
  t.check(`${p}No bids yet`, () => {
    expect(s.is_any_bid_placed).toBe(false);
    expect(s.participants_data.total_bids).toBe(0);
    expect(s.participants_data.revised_bids).toBe(0);
    expect(s.participants_data.active_participants).toBe(0);
  });
  if (tm) {
    t.check(`${p}Bid window is ${tm.duration}s`, () => expect(s.ending_at - s.starting_from).toBe(tm.duration));
    t.check(`${p}Evaluation window is ${tm.evaluation}s`, () => expect(s.extra_closing_time - s.ending_at).toBe(tm.evaluation));
    t.check(`${p}Starts no earlier than asked`, () => expect(s.starting_from).toBeGreaterThanOrEqual(tm.start - 5));
  }
}
