// Builds a fresh DLF event FROM A PR LINE the way the dashboard does (draft project linked to the PR line → RFQ stage on
// template 6686 → publish → Demo10 quote filled by the buyer) so the approval-routing chain can be run end to end.
// Usage: npx tsx scripts/aw-e2e-build.ts --step create|bid|proposal|status
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { api, errOf, uuidOf, idOf, NAME, OUT } from "./aw-lib";
const STATE = `${OUT}/e2e-fixture.json`;
const S = JSON.parse(existsSync(STATE) ? readFileSync(STATE, "utf8") : "{}");
const save = () => writeFileSync(STATE, JSON.stringify(S, null, 1));
const step = process.argv[process.argv.indexOf("--step") + 1] || "status";
const W = JSON.parse(readFileSync("/private/tmp/claude-501/-Users-animesh-Desktop-procol/f9cb15d1-0780-4694-8954-a5a5bc10390e/scratchpad/widgets-6686-pr.json", "utf8"));
// PR 369 (id 31081) line 204718: GARAM MASALA 500GM MDH, 100 Pkt requested at The Aralias (hub 12522, DLF-026), nothing used yet
const LINES: Record<string, { PR: any; HUB: any }> = {
  "204718": { PR: { uuid: uuidOf(31081), no: "369", lineUuid: uuidOf(204718), lineNo: "20", productUuid: uuidOf(503729), productId: 503729, productName: "GARAM MASALA 500GM MDH", productCode: "90030607", variantUuid: uuidOf(506038), unit: "Pkt", qty: 10 }, HUB: { uuid: uuidOf(12522), id: 12522, name: "The Aralias", code: "DLF-026" } },
  "204717": { PR: { uuid: uuidOf(31081), no: "369", lineUuid: uuidOf(204717), lineNo: "19", productUuid: uuidOf(503727), productId: 503727, productName: "CHICKEN MASALA 100GMS MDH", productCode: "90030604", variantUuid: uuidOf(506036), unit: "Pkt", qty: 10 }, HUB: { uuid: uuidOf(12521), id: 12521, name: "Super Luxury", code: "DLF-025" } },
};
const lineArg = process.argv.includes("--line") ? process.argv[process.argv.indexOf("--line") + 1] : (S.line || "204718");
const WINDOW = process.argv.includes("--window") ? Number(process.argv[process.argv.indexOf("--window") + 1]) : 420;
const { PR, HUB } = LINES[lineArg];
const DEMO10 = uuidOf(44124);
const TPL = uuidOf(6686);
const UNIT = PR.unit, QTY = PR.qty, PRICE = 100;

if (step === "create") {
  const title = NAME(`E2E from PR 369 (${HUB.name})`); S.line = lineArg; for (const k of ["eventGroupUuid","eventGroupId","lineItemUuid","tradeUuid","tradeId","refId","published","bidPlaced","proposalUuid","proposalId","requestUuid"]) delete S[k];
  const g = await api("POST", "/event_groups", { status: "draft", title, purchase_request_uuid: PR.uuid, line_items: [{ product_uuid: PR.productUuid, product_quality_uuid: PR.variantUuid, quantity: { unitSymbol: UNIT, value: QTY }, serial_number: 1, pr_line_item_uuid: PR.lineUuid }] });
  console.log("event_groups", g.status, errOf(g), JSON.stringify(g.json).slice(0, 300));
  if (!g.json?.uuid) process.exit(1);
  S.eventGroupUuid = g.json.uuid; S.eventGroupId = idOf(g.json.uuid); S.lineItemUuid = g.json.event_group_line_item_ids?.[0]; S.title = title; save();
  const now = Math.floor(Date.now() / 1000); const bst = now, bet = now + WINDOW, ect = now + WINDOW + 300;
  const row: any = {
    action: { key: "action", value: null, configuration: { mode_type: "hidden" } }, status: { key: "status", value: null, label: null }, serial_number: { key: "serial_number", value: 1 },
    product: { key: "product", value: PR.productName, uuid: PR.productUuid, id: PR.productId, product_code: PR.productCode, pr_line_item_uuid: PR.lineUuid, event_group_line_item_uuid: S.lineItemUuid, unit_type: UNIT, is_rate_only: false, meta: { qualityParams: [] }, configuration: {} },
    specification_custom: { key: "specification_custom", value: "QA spec" }, location_name_custom: { key: "location_name_custom", value: HUB.name },
    buyer_hub: { key: "buyer_hub", value: HUB.name, uuid: HUB.uuid, id: HUB.id, location_code: HUB.code, configuration: {} },
    creator_quantity: { key: "creator_quantity", value: QTY, postfix: UNIT, configuration: { unit_type: UNIT, suffix: UNIT } },
    last_rate_custom: { key: "last_rate_custom", value: 100, configuration: { prefix: "₹" } }, last_amount_custom: { key: "last_amount_custom", value: 1000, configuration: { prefix: "₹" } },
    vendor_specification_custom: { key: "vendor_specification_custom" }, price: { key: "price", prefix: "₹", postfix: "/" + UNIT, configuration: { prefix: "₹", suffix: "/" + UNIT, unit_type: UNIT } },
    total_amount: { key: "total_amount", prefix: "₹", configuration: { prefix: "₹" } }, creator_attachment: { key: "creator_attachment", value: [] },
    variant: { key: "variant", uuid: PR.variantUuid, value: "Variant 1", quality_params: [], configuration: {} },
    pr_number: { key: "pr_number", value: PR.no, uuid: PR.uuid }, material_code: { key: "material_code", value: PR.productCode }, item_no: { key: "item_no", value: PR.lineNo },
    baseline_cost_adjustment: { key: "baseline_cost_adjustment", value: null, configuration: { unit_type: UNIT, prefix: "₹", suffix: "/" + UNIT } }, order: 1,
  };
  const body = { widgets: W, data: [row], configurations: { stage_no: 1, event_group_uuid: S.eventGroupUuid, is_tnc_mandatory: false, currency_configuration: null, is_english_auction_enabled: false, is_alternate_bidding_allowed: false, order_type: "buy", rfx_mode: "rfq", auction_closing_mode: "line_item_based", rfp_evaluation_mode: "lot_based", pickup_schedules: false, bid_start_time: bst, bid_end_time: bet, extra_closing_time: ect, title: "RFQ", terms_and_conditions: [], attachments: [{ type: "t_and_c", value: [] }], template_uuid: TPL, savings_configuration: null, bulk_price: null, time_extension_value: null, last_n_minutes_for_time_extension: null, rank_limit_for_time_extension: null, dynamic_closing_time_strategy: "price_based", price_difference: null, time_difference: null, end_price: 0, is_auction_on_base_price: false, closing_mode: "single", is_basket_auction: false }, tabs: [], status: "draft", audience_company_uuids: [DEMO10], creation_flow_type: "quick_flow", use_rfq_quotes_as_bids: false };
  const t = await api("POST", "/trade/template_input?template_name=trade&additional_fields=order_details", body);
  console.log("trade create", t.status, errOf(t), JSON.stringify(t.json).slice(0, 300));
  if (!t.json?.uuid) process.exit(1);
  S.tradeUuid = t.json.uuid; S.tradeId = idOf(t.json.uuid); S.bidEnd = bet; save();
  const p = await api("PATCH", `/event_groups/${S.eventGroupUuid}`, { attachments: [], title, status: "active", draft_trade_request_uuids: [S.tradeUuid], audience_company_uuids: [DEMO10], line_items: [], terms_and_conditions: { clauses: [], attachments: [] }, show_under_open_events: false, delete_draft_stage_uuids: [], amendment_remarks: { remarks: "" } });
  console.log("publish", p.status, errOf(p), JSON.stringify({ status: p.json?.status, ref: p.json?.ref_uuid, stages: (p.json?.stages || []).map((s: any) => [s.uuid, s.rfx_mode, s.status]) }));
  S.refId = p.json?.ref_uuid; S.published = p.status === 200 && p.json?.status === "active"; save();
}

if (step === "bid") {
  const tr = await api("GET", `/trade/${S.tradeUuid}?response_type=template&additional_fields=order_details`);
  const p = tr.json?.order_details?.[0]?.product; console.log("trade", tr.status, tr.json?.status, tr.json?.current_status, "product", JSON.stringify(p).slice(0, 300));
  const row: any = {
    action: { key: "action", value: null, configuration: { mode_type: "hidden" } }, status: { key: "status", value: null, label: null, type: "checkbox" }, serial_number: { key: "serial_number", value: 1 },
    creator_quantity: { key: "creator_quantity", value: String(QTY), postfix: UNIT, configuration: { unit_type: UNIT, suffix: UNIT } },
    participant_quantity: { key: "participant_quantity", value: String(QTY), validations: [], postfix: UNIT, configuration: { unit_type: UNIT, suffix: UNIT } },
    price: { key: "price", value: PRICE, precision: 2, validations: [], prefix: "₹", postfix: "/" + UNIT, configuration: { unit_type: UNIT, prefix: "₹", suffix: "/" + UNIT } },
    total_amount: { key: "total_amount", value: PRICE * QTY, precision: 2, prefix: "₹", configuration: { prefix: "₹" } },
    vendor_specification_custom: { key: "vendor_specification_custom", value: "QA vendor spec", validations: null },
    specification_custom: { value: "QA spec" }, location_name_custom: { value: HUB.name }, last_rate_custom: { value: 100 }, last_amount_custom: { value: 1000 }, pr_number: { value: PR.no, uuid: PR.uuid }, material_code: { value: PR.productCode }, item_no: { value: PR.lineNo },
    product: { key: "product", value: PR.productName, id: p?.id ?? PR.productId, uuid: p?.uuid ?? PR.productUuid, trade_product_id: p?.trade_product_id, trade_product_uuid: p?.trade_product_uuid, trade_product_category_uuid: p?.trade_product_category_uuid, pr_line_item_uuid: p?.pr_line_item_uuid ?? PR.lineUuid, unit_type: UNIT, product_code: PR.productCode, event_group_line_item_uuid: p?.event_group_line_item_uuid ?? S.lineItemUuid, is_rate_only: false, event_group_line_item_status: "active", qualities: [] },
    variant: { key: "variant", uuid: PR.variantUuid, value: "Variant 1", quality_params: [], status: "active", attachments: null },
    buyer_hub: { key: "buyer_hub", value: HUB.name, uuid: HUB.uuid, id: HUB.id, location_code: HUB.code },
  };
  const gd: any = { loading_factor: { value: "0" } };
  for (const k of ["gst_charges_custom", "payment_terms_custom", "brand_custom", "warranty_custom", "installation_charges_custom", "delivery_timeline_custom", "insurance_custom", "freight_charges_custom", "unloading_charges_custom"]) gd[k] = { value: k === "gst_charges_custom" ? "18%" : k === "payment_terms_custom" ? "30 days" : "QA " + k.replace(/_custom$/, "").replace(/_/g, " ") };
  const b = await api("POST", "/bids/template_input", { company_uuid: DEMO10, currency_preference: null, sheets: { global_price_components: { global_data: { [DEMO10]: gd } }, inline_components: { data: { [DEMO10]: [row] } } }, trade_request_uuid: S.tradeUuid, surrogate_remarks: { remarks: "QA surrogate quote", attachments: [] } });
  console.log("surrogate bid", b.status, errOf(b), JSON.stringify(b.json).slice(0, 400));
  S.bidPlaced = b.status === 200; save();
}

if (step === "proposal") {
  const pr = await api("POST", "/proposal", { event_group_uuid: S.eventGroupUuid });
  console.log("proposal", pr.status, errOf(pr), JSON.stringify(pr.json).slice(0, 300));
  if (!pr.json?.uuid) process.exit(1);
  S.proposalUuid = pr.json.uuid; S.proposalId = idOf(pr.json.uuid); save();
  const r = await api("POST", `/proposal/${S.proposalUuid}/add_response?lot_no=`, { responses: { [DEMO10]: { action: "add", egli_data: { [S.lineItemUuid]: { awarded_quantity: QTY } } } } });
  console.log("add_response", r.status, errOf(r), JSON.stringify(r.json).slice(0, 300));
  const gd = await api("GET", `/proposal/${S.proposalUuid}/general_details`);
  console.log("general_details", gd.status, JSON.stringify(gd.json).slice(0, 600));
}

if (step === "status") {
  console.log(JSON.stringify(S, null, 1));
  if (S.eventGroupUuid) { const g = await api("GET", `/event_groups/${S.eventGroupUuid}`); console.log("event", g.status, g.json?.status, g.json?.ref_uuid, JSON.stringify((g.json?.stages || []).map((s: any) => [s.uuid, s.rfx_mode, s.status, s.ending_at || s.bid_end_time])), "proposals", JSON.stringify(g.json?.proposals).slice(0, 300)); }
}
