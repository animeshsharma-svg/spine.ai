/**
 * THE COLLECTION'S DATA-FILE ROWS, AS NAMED SCENARIOS.
 *
 * Postman ran these as iterations of the collection runner. Here one is picked
 * with RFP_SCENARIO=<number> (1-based), and its values win over the
 * environment for that run — the same precedence iteration data had.
 *
 * Row 5 names exact products, vendors and a template by uuid and name. Those
 * belong to the account the collection was written against; on another
 * account the run stops at the step that looks them up and says which one
 * was missing.
 */
export interface Scenario {
  name: string;
  values: Record<string, string>;
}

export const SCENARIOS: Scenario[] = [
  {
    name: "Default — 2 line items, qty 5 each, 3 vendors",
    values: { num_line_items: "2", quantities: "", num_vendors: "3" },
  },
  {
    name: "Single line item, qty 7",
    values: { num_line_items: "1", quantities: "7", num_vendors: "2" },
  },
  {
    name: "4 line items, per-item qty (decimal allowed)",
    values: { num_line_items: "4", quantities: "1,2.5,3,40", num_vendors: "5", evaluators_per_line_item: "2" },
  },
  {
    name: "Random qty 10–50, no vendor assessment, extra dropdown header",
    values: {
      num_line_items: "3",
      qty_mode: "random",
      qty_min: "10",
      qty_max: "50",
      vendor_assessment_enabled: "false",
      extra_line_item_headers: '[{"name":"Make","input_type":"dropdown","options":["OEM","Local"],"is_required":true}]',
    },
  },
  {
    name: "Exact products + units + template by name",
    values: {
      product_search_query: "a",
      product_uuids: "WmNEWFpERA==,Y1prcFpERA==",
      quantities: "5,10",
      unit_symbols: "Unit,Meter",
      template_name: "technical test",
      vendor_uuids: "RFpRZFg=,cGROWlpk,ZGRRZHA=",
    },
  },
  {
    name: "No template, 1 hr event, starts in 10 min",
    values: { use_template: "false", event_duration_sec: "3600", bid_start_offset_sec: "600", stage_title: "Commercial Stage" },
  },
  {
    name: "RFQ — 2 items, all product-audience vendors",
    values: { rfx_mode: "rfq", num_line_items: "2", quantities: "5,10", num_vendors: "all" },
  },
  {
    name: "RFQ — exact products/units/hubs, Buy Template, price cap",
    values: {
      rfx_mode: "rfq",
      product_uuids: "Y2tRTlpERA==,Y2tOTlpERA==",
      quantities: "5,10",
      unit_symbols: "Each,Lot",
      template_uuid: "RFFEaw==",
      rfq_delivery_locations: "UXBaZ3A=|Gurgaon,UWRaZ3A=|Gurgaon",
      rfq_extra_inline_widgets: "ceil_price",
      rfq_creator_values: '{"ceil_price":[120,90]}',
    },
  },
  {
    name: "RFQ — 3 items, 5 vendors via vendor search, 1 hr",
    values: { rfx_mode: "rfq", num_line_items: "3", audience_source: "vendor_search", num_vendors: "5", event_duration_sec: "3600" },
  },
];
