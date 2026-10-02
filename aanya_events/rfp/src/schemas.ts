/**
 * THE SHAPES EACH REPLY MUST HAVE — ported one for one from the collection.
 *
 * A schema check fails on a missing or mistyped field, not on an extra one:
 * the product adds fields often, and a suite that breaks every time it does
 * stops being read.
 */
import Ajv from "ajv";

type S = Record<string, unknown>;

const T = {
  str: { type: "string" },
  int: { type: "integer" },
  num: { type: "number" },
  bool: { type: "boolean" },
  nstr: { type: ["string", "null"] },
  nint: { type: ["integer", "null"] },
  arr: (items?: S): S => ({ type: "array", items: items ?? {} }),
  obj: (props: Record<string, S> = {}, req?: string[]): S => ({
    type: "object",
    properties: props,
    required: req ?? Object.keys(props),
  }),
  nobj: (props: Record<string, S> = {}, req: string[] = []): S => ({
    type: ["object", "null"],
    properties: props,
    required: req,
  }),
};

const header = T.obj(
  { key_attribute: T.str, name: T.str, input_type: T.str, configuration: T.obj({ field_type: T.str }, ["field_type"]) },
  ["key_attribute", "name", "input_type"],
);
const company = T.obj({ uuid: T.str, name: T.str, status: T.str }, ["uuid", "name", "status"]);
const stage = T.obj({
  title: T.str,
  status: T.str,
  rfx_mode: T.str,
  ref_id: T.str,
  stage_no: T.int,
  uuid: T.str,
  template_uuid: T.nstr,
  starting_from: T.int,
  ending_at: T.int,
  extra_closing_time: T.int,
  no_of_products: T.int,
  is_any_bid_placed: T.bool,
  participants_data: T.obj({ total_participants: T.int, active_participants: T.int, total_bids: T.int, revised_bids: T.int }),
});
const bidder = T.obj(
  {
    uuid: T.str,
    // A vendor invited but not signed up yet has no user.
    user: T.obj({ uuid: T.nstr, company_uuid: T.str, firm_name: T.nstr }, ["uuid", "company_uuid"]),
    bid_placed: T.bool,
    resent: T.bool,
    modes: T.arr(),
  },
  ["uuid", "user", "bid_placed"],
);

export const SCHEMAS = {
  newRequestConfig: T.obj(
    {
      all_terms_and_conditions: T.arr(T.obj({ uuid: T.str, title: T.str }, ["uuid", "title"])),
      default_closing_mode: T.str,
      default_rfp_evaluation_mode: T.str,
      default_event_type: T.str,
      is_allowed_to_modify_audience: T.bool,
      event_duration_predefined_values: {
        type: "object",
        additionalProperties: T.obj({
          default_duration: T.int,
          default_evaluation: T.int,
          event_duration: T.arr(T.int),
          evaluation_duration: T.arr(T.int),
        }),
      },
    },
    ["default_closing_mode", "default_rfp_evaluation_mode", "event_duration_predefined_values"],
  ),
  productSearch: T.obj(
    {
      products: T.arr(
        T.obj(
          {
            uuid: T.str,
            name: T.str,
            status: T.str,
            product_code: T.nstr,
            category: T.nstr,
            family_name: T.nstr,
            quality_params: T.arr(T.obj({ name: T.str }, ["name"])),
            variants: T.arr(T.obj({ uuid: T.str, name: T.str, quality_params: { type: ["array", "null"] } }, ["uuid", "name"])),
            units: T.arr(T.obj({ uuid: T.str, name: T.str, symbol: T.str, conversion_factor: T.num, status: T.str })),
          },
          ["uuid", "name", "status", "variants", "units"],
        ),
      ),
    },
    ["products"],
  ),
  audienceForProduct: T.obj({ companies: T.arr(T.obj({ uuid: T.str }, ["uuid"])) }),
  templatesList: T.obj(
    {
      default: T.arr(T.obj({ uuid: T.str, name: T.str }, ["uuid", "name"])),
      saved: T.arr(
        T.obj(
          { uuid: T.str, name: T.str, template_for: T.arr(T.str), template_type: T.str, type_identifier: T.arr(T.str) },
          ["uuid", "name", "template_for"],
        ),
      ),
    },
    ["saved"],
  ),
  templateDetail: T.obj(
    {
      uuid: T.str,
      name: T.str,
      template_for: T.arr(T.str),
      template_type: T.str,
      forms: T.arr(
        T.obj(
          {
            order: T.int,
            name: T.str,
            config: T.obj({ type: T.str }),
            page_response_headers: T.arr(header),
            page_headers: T.arr(),
            evaluators: T.arr(),
          },
          ["name", "config", "page_response_headers"],
        ),
      ),
      order_configs: { type: ["object", "array"] },
    },
    ["uuid", "name", "forms"],
  ),
  users: T.obj({
    users: T.arr(
      T.obj(
        { uuid: T.str, first_name: T.nstr, last_name: T.nstr, status: T.str, email: T.nstr, category: T.str, role: T.str },
        ["uuid", "status"],
      ),
    ),
    total_pages: T.int,
    current_page: T.int,
  }),
  vendorList: T.obj(
    {
      companies: T.arr(
        T.obj(
          { uuid: T.str, name: T.str, status: T.str, category: T.str, is_vendor_tna: T.bool, tags: T.arr(), vendor_code: T.nstr, email: T.nstr },
          ["uuid", "name", "status"],
        ),
      ),
      tags: T.arr(T.obj({ uuid: T.str, name: T.str }, ["uuid", "name"])),
      total_count: T.int,
      total_pages: T.int,
    },
    ["companies", "total_count", "total_pages"],
  ),
  eventGroup: T.obj(
    {
      uuid: T.str,
      company,
      config: T.obj(
        {
          is_show_under_open_events: T.bool,
          label_vs_evaluation_score: T.arr(T.obj({ band: T.str, label: T.str, score: T.int })),
        },
        ["is_show_under_open_events"],
      ),
      status: T.str,
      created_at: T.int,
      updated_at: T.int,
      stages: T.arr(stage),
      is_project_on_hold: T.bool,
      terms_and_conditions_structured: T.obj({ clauses: T.arr(), attachments: T.arr() }),
      user_details: T.obj({ uuid: T.str, first_name: T.nstr, email: T.nstr }, ["uuid"]),
    },
    ["uuid", "company", "config", "status", "created_at", "updated_at", "stages", "user_details"],
  ),
  trade: T.obj({
    uuid: T.str,
    title: T.str,
    status: T.str,
    starting_from: T.int,
    ending_at: T.int,
    extra_closing_time: T.int,
    user: T.obj({ uuid: T.str }, ["uuid"]),
    misc: T.obj({ creation_flow_type: T.str }, ["creation_flow_type"]),
    trade_config: { type: "object" },
    rfx_mode: T.str,
    created_at: T.int,
    updated_at: T.int,
    bids: T.arr(),
    is_multi_product: T.bool,
    company_uuid: T.str,
    event_group_uuid: T.str,
    event_flow_version: T.str,
    ranking_widgets: T.obj({ inline: T.str, global: T.str }),
  }),
  lineItems: T.obj({
    data: T.arr(
      T.obj(
        {
          uuid: T.str,
          title: T.str,
          quantity: T.str,
          product_code: T.nstr,
          created_at: T.int,
          category: T.nstr,
          subcategory: T.nstr,
          status: T.str,
          quality_params: T.arr(T.obj({ name: T.str }, ["name"])),
          variant: T.nobj({ uuid: T.str, name: T.str }, ["uuid"]),
          serial_number: T.int,
          product_uuid: T.str,
          quantity_open: T.num,
        },
        ["uuid", "title", "quantity", "status", "serial_number", "product_uuid", "quantity_open"],
      ),
    ),
    filters_data: T.arr(T.obj({ key: T.str, name: T.str, options: T.arr(), type: T.str })),
    total_pages: T.int,
    count: T.int,
  }),
  audience: T.obj({
    vendors: T.arr(T.obj({ name: T.str, uuid: T.str, scope: T.str, vendor_status: T.str, tags: T.arr() }, ["name", "uuid", "scope"])),
    stages: T.arr(
      T.obj({
        title: T.str,
        uuid: T.str,
        bid_placed_company_uuids: T.arr(T.str),
        invited_company_uuids: T.arr(T.str),
        rejected_company_uuids: T.arr(T.str),
        vendors: { type: "object" },
      }),
    ),
    total_pages: T.int,
    count: T.int,
  }),
  filterOptions: T.obj({ data: T.arr(T.obj({ key: T.str, name: T.str, type: T.str, options: T.arr() })) }),
  stageSchema: T.obj(
    {
      uuid: T.str,
      ref_uuid: T.str,
      title: T.str,
      status: T.str,
      rfx_mode: T.str,
      starting_from: T.int,
      ending_at: T.int,
      extra_closing_time: T.int,
      sheets: T.obj(
        {
          forms: T.arr(
            T.obj(
              {
                uuid: T.str,
                name: T.str,
                serial_number: T.int,
                status: T.str,
                evaluators: T.arr(),
                page_response_headers: T.arr(header),
                config: { type: "object" },
              },
              ["uuid", "name", "serial_number", "page_response_headers"],
            ),
          ),
        },
        ["forms"],
      ),
      bid_count: T.int,
      template_uuid: T.nstr,
      template_name: T.nstr,
      event_group_uuid: T.str,
      stage_no: T.int,
      event_group: T.obj({ uuid: T.str, title: T.str, is_project_on_hold: T.bool }),
      proposals: T.arr(),
    },
    ["uuid", "ref_uuid", "title", "status", "rfx_mode", "sheets", "bid_count", "event_group_uuid", "stage_no", "event_group"],
  ),
  bidderStats: T.obj({
    seen: T.arr(),
    invited: T.arr(bidder),
    bid_placed: T.arr(),
    bid_not_placed: T.arr(bidder),
    total_active_bids: T.int,
    unregistered_poc_bids: T.arr(),
  }),
  eventIndicators: T.obj({ auction_identifiers: T.arr(), auction_identifiers_data: { type: "object" } }),
  viewingStats: T.obj({ seen: T.arr() }),
  chatsCount: T.obj({ total_threads_count: T.int, unresolved_threads_count: T.nint }, ["total_threads_count"]),
  userPrefs: T.obj(
    { columns: { type: "object" }, applied_filters: { type: ["object", "array"] }, applied_order_by: T.arr() },
    ["columns"],
  ),
  success: T.obj({ success: { type: "boolean", enum: [true] } }),
  participantsList: {
    type: "object",
    properties: {
      participants_data: {
        type: "array",
        items: T.obj(
          { label: T.str, vendor_status: T.str, type: T.str, key: T.str, created_at: T.int, bids_count: T.int, sheet_uuid: T.str, bid_status: T.str, is_bid_allowed_to_edit: T.bool, is_vendor_tna: T.bool },
          ["label", "key", "sheet_uuid", "bid_status"],
        ),
      },
    },
  },
  quoteDetails: T.obj(
    {
      sheet_uuid: T.str,
      alternative_uuid: T.nstr,
      placed_at: T.int,
      created_at: T.int,
      data: {
        type: "object",
        minProperties: 1,
        additionalProperties: T.arr(T.obj({ form_uuid: T.str, form_response_uuid: T.str, is_egli_regretted: T.bool }, ["form_uuid", "form_response_uuid"])),
      },
      participants: T.obj(
        {
          user: T.obj({ uuid: T.str }, ["uuid"]),
          company: T.obj({ uuid: T.str, name: T.str, category: T.str }, ["uuid", "name"]),
          status: T.str,
          revised_bids: T.arr(),
          bid_config: T.obj({ is_allowed_to_edit_bid: T.bool, is_my_bid: T.bool, is_team_bid: T.bool, is_surrogate_bid: T.bool }),
          is_unregistered_bid: T.bool,
        },
        ["user", "company", "status", "bid_config"],
      ),
    },
    ["sheet_uuid", "placed_at", "data", "participants"],
  ),
  approvals: T.arr(),
  audienceBidders: T.obj({
    companies: T.arr(T.obj({ uuid: T.str, name: T.str, status: T.str, category: T.str, is_vendor_tna: T.bool }, ["uuid", "name", "status"])),
  }),
  viewingSeen: T.obj({ seen: T.arr(T.obj({ uuid: T.str, user_name: T.str, last_seen_at: T.int, currently_viewing: T.bool }, ["uuid", "last_seen_at"])) }),
  objectAny: { type: "object" },
  templateDetailRfq: T.obj(
    {
      uuid: T.str,
      name: T.str,
      template_for: T.arr(T.str),
      order_type: T.nstr,
      widgets: T.obj(
        {
          inline_components: T.arr(
            T.obj(
              { name: T.str, key_attribute: T.str, input_type: T.str, configuration: T.obj({ field_type: T.str, mode_type: T.str }, ["field_type"]) },
              ["name", "key_attribute", "input_type", "configuration"],
            ),
          ),
          global_price_components: T.arr(),
        },
        ["inline_components"],
      ),
      mapped_widgets: T.arr(T.obj({ key_attribute: T.str, name: T.str, input_type: T.str }, ["key_attribute", "name", "input_type"])),
      global_mapped_widgets: T.arr(T.obj({ key_attribute: T.str, name: T.str, input_type: T.str }, ["key_attribute", "name", "input_type"])),
    },
    ["uuid", "name", "widgets"],
  ),
  rfqStage: T.obj(
    {
      uuid: T.str,
      ref_uuid: T.str,
      event_flow_version: T.str,
      title: T.str,
      status: T.str,
      order_type: T.str,
      rfx_mode: T.str,
      current_status: T.str,
      starting_from: T.int,
      ending_at: T.int,
      extra_closing_time: T.int,
      created_at: T.int,
      updated_at: T.int,
      sheets: T.obj({
        inline_components: T.obj({ widgets: T.arr(T.obj({ key_attribute: T.str, name: T.str, input_type: T.str }, ["key_attribute", "input_type"])) }, ["widgets"]),
        global_price_components: T.obj({ widgets: T.arr() }, ["widgets"]),
      }),
      order_details: T.arr(
        T.obj(
          {
            serial_number: T.obj({ value: T.int }),
            creator_quantity: T.obj({ value: {} }, ["value"]),
            product: T.obj({ value: T.str, uuid: T.str, event_group_line_item_uuid: T.str, unit_type: T.nstr }, ["value", "uuid", "event_group_line_item_uuid"]),
            variant: T.nobj({ uuid: T.str }, ["uuid"]),
            buyer_hub: T.nobj({ uuid: T.nstr, value: T.nstr }, []),
          },
          ["serial_number", "creator_quantity", "product"],
        ),
      ),
      creator: T.obj({ user: T.obj({ uuid: T.str }, ["uuid"]) }, ["user"]),
      template_uuid: T.nstr,
      template_name: T.nstr,
      event_group_uuid: T.str,
      stage_no: T.int,
      proposals: T.arr(),
      ranking_widgets: T.obj({ inline: T.str, global: T.str }),
    },
    ["uuid", "ref_uuid", "title", "status", "rfx_mode", "starting_from", "ending_at", "extra_closing_time", "order_details", "event_group_uuid", "stage_no"],
  ),
} satisfies Record<string, S>;

export type SchemaName = keyof typeof SCHEMAS;

const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = new Map<SchemaName, ReturnType<typeof ajv.compile>>();

/** null when the reply fits, otherwise the first few mismatches in plain words. */
export function schemaErrors(name: SchemaName, data: unknown): string | null {
  let v = compiled.get(name);
  if (!v) {
    v = ajv.compile(SCHEMAS[name]);
    compiled.set(name, v);
  }
  if (v(data)) return null;
  return (v.errors ?? [])
    .slice(0, 4)
    .map((e) => `${e.instancePath || "(root)"} ${e.message}`)
    .join("; ");
}
