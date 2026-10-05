/**
 * Pure request-body builders, translated 1:1 from the Postman collection's
 * pre-request scripts. Each returns a plain object ready to POST/PATCH.
 * No network, no globals — everything comes in via args.
 */

// The RFQ pricing-stage widget definition (verbatim from the collection).
export const PRICING_WIDGETS = {
  global_price_components: [
    {
      uuid: "cFpwZw==",
      name: "Sum Total",
      key_attribute: "gross_total",
      input_type: "formula",
      widget_type: "default",
      configuration: {
        field_type: "formula",
        mode_type: "read",
        precision: 4,
        prefix: "₹",
        input_group: "amount",
        is_removable: true,
        formula: "SUM(total_amount)",
        is_required: false,
      },
    },
  ],
  inline_components: [
    {
      name: "Product",
      key_attribute: "product",
      input_type: "product",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "creator",
        is_required: true,
        dropdown_data: "/api/products",
        mode_type: "write",
        freeze_widget: "primary",
        priority: "1",
        is_removable: false,
        options: [],
      },
    },
    {
      name: "Quantity Requested",
      key_attribute: "creator_quantity",
      input_type: "quantity",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "creator",
        is_required: true,
        mode_type: "write",
        freeze_widget: "secondary",
        suffix: "KG",
        priority: "2",
        is_removable: false,
        input_group: "quantity",
        precision: 4,
        options: [],
      },
    },
    {
      name: "Delivery location",
      key_attribute: "buyer_hub",
      input_type: "delivery_location",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "creator",
        is_required: true,
        mode_type: "write",
        priority: "3",
        is_removable: false,
        options: [],
      },
    },
    {
      name: "Quantity Available",
      key_attribute: "participant_quantity",
      input_type: "quantity",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "participant",
        is_required: true,
        is_negotiable: true,
        mode_type: "write",
        validations: [
          {
            error_message: "Quantity should be greater than the Minimum quantity",
            severity: 1,
            rule: "floor_quantity<participant_quantity",
          },
        ],
        freeze_widget: "secondary",
        suffix: "KG",
        priority: "5",
        is_removable: false,
        input_group: "quantity",
        precision: 4,
        options: [],
      },
    },
    {
      name: "Price",
      key_attribute: "price",
      input_type: "number",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "participant",
        is_required: true,
        is_negotiable: true,
        mode_type: "write",
        validations: [
          { error_message: "Price should be less than the Cap price", severity: 1, rule: "base_price<ceil_price" },
          {
            error_message: "Please change your price at least by mentioned tick price",
            severity: 1,
            rule: "prev.price-price>=tick_size||prev.price-price<=tick_size",
          },
        ],
        freeze_widget: "primary",
        prefix: "₹",
        suffix: "KG",
        priority: "4",
        is_removable: false,
        input_group: "price",
        precision: 4,
        options: [],
      },
    },
    {
      name: "GST",
      key_attribute: "gst",
      input_type: "percentage",
      widget_type: "default",
      validation: {},
      configuration: {
        is_replicable: true,
        field_type: "participant",
        is_required: false,
        mode_type: "write",
        suffix: "%",
        priority: "6",
        is_removable: true,
        precision: 4,
        options: [],
      },
    },
    {
      name: "Total Amount",
      key_attribute: "total_amount",
      input_type: "formula",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "creator",
        is_required: true,
        mode_type: "read",
        prefix: "₹",
        priority: "7",
        formula: "price*participant_quantity+price*participant_quantity*(gst/100)",
        is_removable: false,
        input_group: "amount",
        precision: 4,
        options: [],
      },
    },
    {
      name: "Product Variant",
      key_attribute: "variant",
      input_type: "variant",
      widget_type: "default",
      validation: {},
      configuration: {
        field_type: "creator",
        is_required: true,
        mode_type: "write",
        freeze_widget: "primary",
        priority: "1",
        is_removable: false,
        options: [],
      },
    },
  ],
};

export interface StageTiming {
  bst: number;
  bet: number;
  ect: number;
}

/** now → {bst: now, bet: now+durSec, ect: now+2*durSec} (collection default). */
export function stageTiming(nowSec: number, durSec = 1800): StageTiming {
  return { bst: nowSec, bet: nowSec + durSec, ect: nowSec + 2 * durSec };
}

export interface TechnicalStageArgs {
  eventGroupUuid: string;
  lineItemUuid: string;
  evaluatorUuid: string;
  vendorCompanyUuid: string;
  technicalTemplateUuid: string;
  timing: StageTiming;
  /** position in the event (1-based). Default 1. */
  stageNo?: number;
}

/** Template Technical (rfp). Collection request [8]. */
export function buildTechnicalStageBody(a: TechnicalStageArgs) {
  return {
    forms: [
      {
        order: 1,
        name: "Vendor Assessment",
        description: "",
        config: { type: "table" },
        page_response_headers: [
          { key_attribute: "Kh4H2", name: "dcf", description: "nn", input_type: "multiline_text", configuration: { field_type: "participant", is_required: false }, widget_type: "default" },
          { key_attribute: "pf9ij", name: "fcvg", description: "nn", input_type: "multiline_text", configuration: { field_type: "participant", is_required: false }, widget_type: "default" },
        ],
        page_headers: [],
        evaluators: [{ shared_with_uuid: a.evaluatorUuid, shared_with_type: "User" }],
      },
      {
        order: 2,
        name: "Line Item",
        description: "",
        config: { type: "table" },
        event_group_line_item_uuid: a.lineItemUuid,
        page_response_headers: [
          { key_attribute: "mgCKG", name: "Specs", description: "As per company ", input_type: "multiline_text", configuration: { field_type: "participant", is_required: true }, widget_type: "default" },
        ],
        page_headers: [],
        evaluators: [],
      },
    ],
    configurations: {
      stage_no: a.stageNo ?? 1,
      event_group_uuid: a.eventGroupUuid,
      is_tnc_mandatory: false,
      currency_configuration: null,
      is_english_auction_enabled: false,
      is_alternate_bidding_allowed: false,
      rfx_mode: "rfp",
      auction_closing_mode: "line_item_based",
      rfp_evaluation_mode: "lot_based",
      pickup_schedules: false,
      bid_start_time: a.timing.bst,
      bid_end_time: a.timing.bet,
      extra_closing_time: a.timing.ect,
      title: "Technical Stage",
      terms_and_conditions: [],
      attachments: [{ type: "t_and_c", value: [] }],
      template_uuid: a.technicalTemplateUuid,
      vendor_assessment_template_uuid: a.technicalTemplateUuid,
      savings_configuration: null,
      bulk_price: null,
      time_extension_value: null,
      last_n_minutes_for_time_extension: null,
      rank_limit_for_time_extension: null,
      dynamic_closing_time_strategy: "price_based",
      price_difference: null,
      time_difference: null,
      end_price: 0,
      is_auction_on_base_price: false,
      closing_mode: "single",
      is_basket_auction: false,
    },
    tabs: [],
    status: "draft",
    audience_company_uuids: [a.vendorCompanyUuid],
    creation_flow_type: "quick_flow",
    use_rfq_quotes_as_bids: false,
  };
}

export interface PricingStageArgs {
  eventGroupUuid: string;
  lineItemUuid: string;
  vendorCompanyUuid: string;
  pricingTemplateUuid: string;
  productUuid: string;
  productQualityUuid: string;
  locationUuid: string;
  quantityValue: number;
  quantityUnit: string;
  timing: StageTiming;
  /** position in the event (1-based). Default 2. */
  stageNo?: number;
  /** "rfq" (default) or "auction" for a standalone auction stage. */
  rfxMode?: "rfq" | "auction";
  /** auction strategy when rfxMode==="auction". */
  auctionConfig?: "rank" | "price";
  title?: string;
  /** the round's Delivery Date (unix seconds) — sent as configurations.delivery_schedules, as the create screen does */
  deliveryBy?: number;
}

/** Template Pricing (rfq) — also used for a standalone auction stage. Collection request [9]. */
export function buildPricingStageBody(a: PricingStageArgs) {
  return {
    widgets: PRICING_WIDGETS,
    data: [
      {
        product: {
          key: "product",
          value: "product",
          uuid: a.productUuid,
          event_group_line_item_uuid: a.lineItemUuid,
          meta: { qualityParams: [{ name: "Specs", value: "As per company" }] },
          configuration: {},
        },
        creator_quantity: { key: "creator_quantity", value: a.quantityValue, postfix: a.quantityUnit, configuration: { suffix: a.quantityUnit } },
        buyer_hub: { key: "buyer_hub", value: "location", uuid: a.locationUuid, configuration: {} },
        participant_quantity: { key: "participant_quantity", postfix: a.quantityUnit, configuration: { suffix: a.quantityUnit } },
        price: { key: "price", prefix: "₹", postfix: a.quantityUnit, configuration: { prefix: "₹", suffix: a.quantityUnit } },
        gst: { key: "gst", postfix: "%", configuration: { suffix: "%" } },
        total_amount: { key: "total_amount", prefix: "₹", configuration: { prefix: "₹" } },
        variant: { uuid: a.productQualityUuid, configuration: {} },
        order: 1,
      },
    ],
    configurations: (() => {
      const isAuction = a.rfxMode === "auction";
      const strategy = a.auctionConfig ?? "price";
      return {
        stage_no: a.stageNo ?? 2,
        event_group_uuid: a.eventGroupUuid,
        is_tnc_mandatory: true,
        currency_configuration: null,
        is_english_auction_enabled: isAuction,
        is_alternate_bidding_allowed: false,
        order_type: "buy",
        rfx_mode: isAuction ? "auction" : "rfq",
        ...(isAuction ? { auction_config: strategy } : {}),
        ...(isAuction && strategy === "rank" ? { rank_type: "inline" } : {}),
        auction_closing_mode: isAuction ? "lot_based" : "line_item_based",
        rfp_evaluation_mode: "lot_based",
        pickup_schedules: false,
        ...(a.deliveryBy ? { delivery_schedules: [{ delivery_by: a.deliveryBy }] } : {}),
        bid_start_time: a.timing.bst,
        bid_end_time: a.timing.bet,
        extra_closing_time: a.timing.ect,
        title: a.title ?? (isAuction ? "Auction" : "RFQ"),
        terms_and_conditions: ["Your evaluation for this event will depend on Gross Total."],
        attachments: [{ type: "t_and_c", value: [] }],
        template_uuid: a.pricingTemplateUuid,
        savings_configuration: null,
        bulk_price: null,
        time_extension_value: null,
        last_n_minutes_for_time_extension: null,
        rank_limit_for_time_extension: null,
        dynamic_closing_time_strategy: isAuction && strategy === "rank" ? "rank_based" : "price_based",
        price_difference: null,
        time_difference: null,
        end_price: 0,
        is_auction_on_base_price: false,
        closing_mode: "single",
        is_basket_auction: false,
      };
    })(),
    tabs: [],
    status: "draft",
    audience_company_uuids: [a.vendorCompanyUuid],
    creation_flow_type: "quick_flow",
    use_rfq_quotes_as_bids: false,
  };
}

export interface PublishArgs {
  title: string;
  technicalTradeUuid: string;
  pricingTradeUuid: string;
  vendorCompanyUuid: string;
}

/** Publish / finalize the event group. Collection request [10]. */
export function buildPublishBody(a: PublishArgs) {
  return {
    attachments: [],
    title: a.title,
    status: "active",
    draft_trade_request_uuids: [a.technicalTradeUuid, a.pricingTradeUuid],
    audience_company_uuids: [a.vendorCompanyUuid],
    line_items: [],
    terms_and_conditions: { clauses: [], attachments: [] },
    show_under_open_events: true,
    delete_draft_stage_uuids: [],
    amendment_remarks: { remarks: "" },
  };
}

// ── VENDOR: technical response + bid ────────────────────────────────────────

/** Start technical response [13]. */
export function buildStartTechnicalResponse(a: {
  technicalTradeUuid: string;
  vendorCompanyUuid: string;
}) {
  return {
    item_uuid: a.technicalTradeUuid,
    item_type: "TradeRequest",
    company_uuid: a.vendorCompanyUuid,
  };
}

/** Fill technical answers for the Line-Item form (form 1) [14]. */
export function buildTechnicalAnswerBody(a: {
  technicalTradeUuid: string;
  formUuid: string;
  pageUuid: string;
}) {
  const page_responses: Record<string, unknown> = {};
  page_responses[a.pageUuid] = [{ key_attribute: "mgCKG", value: "auto spec answer" }];
  return {
    form_uuid: a.formUuid,
    page_uuids: [a.pageUuid],
    page_responses,
    item_type: "TradeRequest",
    item_uuid: a.technicalTradeUuid,
  };
}

/** Submit technical response [15]. */
export function buildSubmitTechnicalResponse(a: {
  technicalTradeUuid: string;
  vendorCompanyUuid: string;
}) {
  return {
    status: "active",
    item_uuid: a.technicalTradeUuid,
    item_type: "TradeRequest",
    company_uuid: a.vendorCompanyUuid,
  };
}

/** Create bid [16]. */
export function buildCreateBid(a: { pricingTradeUuid: string; vendorCompanyUuid: string }) {
  return {
    trade_request_uuid: a.pricingTradeUuid,
    company_uuid: a.vendorCompanyUuid,
    currency_preference: {
      name: "Indian Rupees (INR)",
      code: "INR",
      symbol: "₹",
      rateInBase: 1,
      adjustedPrecision: 2,
      defaultPrecision: 2,
      numberSystem: "INDIAN",
      currencyLabel: "₹",
    },
    broker_company_uuid: false,
  };
}

export interface TradeProduct {
  trade_product_uuid: string;
  trade_product_id: number;
  trade_product_category_uuid: string;
  product_id: number;
  product_code: string;
}

/** Create bid products [17]. Returns { body, total }. */
export function buildBidProductsBody(a: {
  pricingTradeUuid: string;
  vendorCompanyUuid: string;
  productUuid: string;
  productQualityUuid: string;
  locationUuid: string;
  lineItemUuid: string;
  quantityValue: number;
  quantityUnit: string;
  price: number;
  tradeProduct: TradeProduct;
}) {
  const unit = a.quantityUnit;
  const qty = a.quantityValue;
  const total = a.price * qty;
  const row = {
    action: { value: null, configuration: { mode_type: "hidden" }, key: "action" },
    status: { value: null, label: null, key: "status" },
    serial_number: { value: 1, key: "serial_number" },
    creator_quantity: { value: String(qty), configuration: { unit_type: unit, suffix: unit }, key: "creator_quantity", postfix: unit },
    participant_quantity: { value: String(qty), validations: [], configuration: { unit_type: unit, suffix: unit }, key: "participant_quantity", postfix: unit },
    price: { validations: [], configuration: { unit_type: unit, prefix: "₹", suffix: "/" + unit }, key: "price", postfix: "/" + unit, prefix: "₹", value: a.price, precision: 2 },
    gst: { validations: [], configuration: { suffix: "%" }, key: "gst", postfix: "%" },
    total_amount: { configuration: { prefix: "₹" }, key: "total_amount", prefix: "₹", value: total, precision: 2 },
    product: {
      value: "product",
      id: a.tradeProduct.product_id,
      uuid: a.productUuid,
      line_item_no: "",
      trade_product_id: a.tradeProduct.trade_product_id,
      trade_product_uuid: a.tradeProduct.trade_product_uuid,
      trade_product_category_uuid: a.tradeProduct.trade_product_category_uuid,
      pr_line_item_uuid: null,
      integration_line_item_uuid: null,
      unit_type: unit,
      product_code: a.tradeProduct.product_code,
      product_type: null,
      event_group_line_item_uuid: a.lineItemUuid,
      is_rate_only: false,
      event_group_line_item_status: "active",
      qualities: [{ name: "Specs", value: "As per company" }],
      image: "",
      key: "product",
    },
    variant: {
      uuid: a.productQualityUuid,
      value: "Variant 1",
      quality_params: [{ name: "Specs", value: "As per company" }],
      status: "active",
      attachments: null,
      key: "variant",
    },
    buyer_hub: { uuid: a.locationUuid, value: "location", key: "buyer_hub" },
  };
  const dataObj: Record<string, unknown[]> = {};
  dataObj[a.vendorCompanyUuid] = [row];
  return {
    total,
    body: {
      company_uuid: a.vendorCompanyUuid,
      trade_request_uuid: a.pricingTradeUuid,
      sheets: { inline_components: { data: dataObj } },
    },
  };
}

/** Submit bid [18]. */
export function buildSubmitBidBody(a: {
  pricingTradeUuid: string;
  vendorCompanyUuid: string;
  total: number;
}) {
  const gp: Record<string, unknown> = {};
  gp[a.vendorCompanyUuid] = { gross_total: { value: String(a.total) } };
  return {
    company_uuid: a.vendorCompanyUuid,
    bill_to_broker: false,
    trade_request_uuid: a.pricingTradeUuid,
    currency_preference: { code: "INR" },
    sheets: { global_price_components: { global_data: gp } },
    status: "active",
    fast_bid_enabled: false,
  };
}

// ── SURROGATE (buyer bids on behalf of vendor) ──────────────────────────────

/** Surrogate technical response [24] — answers both forms. */
export function buildSurrogateTechnicalBody(a: {
  technicalTradeUuid: string;
  vendorCompanyUuid: string;
  form0Page: string;
  form1Page: string;
}) {
  const page_responses: Record<string, unknown> = {};
  page_responses[a.form0Page] = [
    { key_attribute: "Kh4H2", value: "surrogate answer" },
    { key_attribute: "pf9ij", value: "surrogate answer 2" },
  ];
  page_responses[a.form1Page] = [{ key_attribute: "mgCKG", value: "As per company" }];
  return {
    item_type: "TradeRequest",
    item_uuid: a.technicalTradeUuid,
    company_uuid: a.vendorCompanyUuid,
    page_responses,
    page_uuids: [a.form0Page, a.form1Page],
    surrogate_remarks: { remarks: "", attachments: [] },
  };
}

/** Surrogate RFQ bid [25]. */
export function buildSurrogateRfqBody(a: {
  pricingTradeUuid: string;
  vendorCompanyUuid: string;
  productUuid: string;
  productQualityUuid: string;
  locationUuid: string;
  lineItemUuid: string;
  quantityValue: number;
  quantityUnit: string;
  price: number;
  tradeProduct: TradeProduct;
}) {
  const unit = a.quantityUnit;
  const qty = a.quantityValue;
  const total = a.price * qty;
  const row = {
    action: { value: null, configuration: { mode_type: "hidden" }, key: "action" },
    status: { value: null, label: null, key: "status", type: "checkbox" },
    serial_number: { value: 1, key: "serial_number" },
    creator_quantity: { value: String(qty), configuration: { unit_type: unit, suffix: unit }, key: "creator_quantity", postfix: unit },
    participant_quantity: { value: String(qty), validations: [], configuration: { unit_type: unit, suffix: unit }, key: "participant_quantity", postfix: unit },
    price: { validations: [], configuration: { unit_type: unit, prefix: "₹", suffix: "/" + unit }, key: "price", postfix: "/" + unit, prefix: "₹", value: a.price, precision: 2 },
    gst: { validations: [], configuration: { suffix: "%" }, key: "gst", postfix: "%" },
    total_amount: { configuration: { prefix: "₹" }, key: "total_amount", prefix: "₹", value: total, precision: 2 },
    product: {
      value: "product",
      id: a.tradeProduct.product_id,
      uuid: a.productUuid,
      trade_product_id: a.tradeProduct.trade_product_id,
      trade_product_uuid: a.tradeProduct.trade_product_uuid,
      trade_product_category_uuid: a.tradeProduct.trade_product_category_uuid,
      unit_type: unit,
      product_code: a.tradeProduct.product_code,
      event_group_line_item_uuid: a.lineItemUuid,
      is_rate_only: false,
      event_group_line_item_status: "active",
      qualities: [{ name: "Specs", value: "As per company" }],
      key: "product",
    },
    variant: {
      uuid: a.productQualityUuid,
      value: "Variant 1",
      quality_params: [{ name: "Specs", value: "As per company" }],
      status: "active",
      attachments: null,
      key: "variant",
    },
    buyer_hub: { uuid: a.locationUuid, value: "location", key: "buyer_hub" },
  };
  const gp: Record<string, unknown> = {};
  gp[a.vendorCompanyUuid] = {};
  const dataObj: Record<string, unknown[]> = {};
  dataObj[a.vendorCompanyUuid] = [row];
  return {
    company_uuid: a.vendorCompanyUuid,
    currency_preference: null,
    sheets: {
      global_price_components: { global_data: gp },
      inline_components: { data: dataObj },
    },
    trade_request_uuid: a.pricingTradeUuid,
    surrogate_remarks: { remarks: "", attachments: [] },
  };
}

// ── EVALUATION (evaluator) ──────────────────────────────────────────────────

/** create_evaluations [20]. */
export function buildCreateEvaluation(a: {
  technicalTradeUuid: string;
  vendorCompanyUuid: string;
  formUuid: string;
  score: number;
}) {
  return {
    trade_request_uuid: a.technicalTradeUuid,
    company_uuid: a.vendorCompanyUuid,
    form: { uuid: a.formUuid, score: a.score, remark: "auto evaluation" },
  };
}

// ── FEATURES ────────────────────────────────────────────────────────────────

/** F2 versioning [23]. */
export function buildItemVersionBody(a: { eventGroupUuid: string }) {
  return { item_uuid: a.eventGroupUuid, item_type: "EventGroup" };
}

/** F4 counter-offer [26]. */
export function buildCounterOfferBody(a: {
  bidUuid: string;
  productUuid: string;
  productQualityUuid: string;
  locationUuid: string;
  lineItemUuid: string;
  quantityValue: number;
  quantityUnit: string;
  counterPrice: number;
  tradeProduct: TradeProduct;
}) {
  const unit = a.quantityUnit;
  const qty = a.quantityValue;
  const total = a.counterPrice * qty;
  const row = {
    action: { value: { label: "Choose" }, configuration: { mode_type: "hidden" }, readOnly: false, key: "action" },
    status: { value: "active", label: null, key: "status", inactive: true, actualValue: true, type: "checkbox" },
    serial_number: { value: 1, key: "serial_number" },
    creator_quantity: { value: String(qty), configuration: { unit_type: unit, suffix: unit }, key: "creator_quantity", postfix: unit },
    participant_quantity: { value: String(qty), validations: [], configuration: { unit_type: unit, suffix: unit }, key: "participant_quantity", postfix: unit },
    price: { value: a.counterPrice, last_valid_price: null, validations: [], savings: null, configuration: { unit_type: unit, prefix: "₹", suffix: "/" + unit }, key: "price", postfix: "/" + unit, prefix: "₹" },
    gst: { value: "0.0", configuration: { suffix: "%" }, validations: [], key: "gst", postfix: "%" },
    total_amount: { configuration: { prefix: "₹" }, savings: null, key: "total_amount", prefix: "₹", value: total },
    product: {
      value: "product",
      id: a.tradeProduct.product_id,
      uuid: a.productUuid,
      line_item_no: "",
      trade_product_id: a.tradeProduct.trade_product_id,
      trade_product_uuid: a.tradeProduct.trade_product_uuid,
      trade_product_category_uuid: a.tradeProduct.trade_product_category_uuid,
      unit_type: unit,
      product_code: a.tradeProduct.product_code,
      event_group_line_item_uuid: a.lineItemUuid,
      qualities: [{ name: "Specs", value: "As per company" }],
      key: "product",
    },
    variant: {
      uuid: a.productQualityUuid,
      value: { key: a.productQualityUuid, label: "Variant 1", qualityParams: [{ name: "Specs", value: "As per company" }] },
      quality_params: [{ name: "Specs", value: "As per company" }],
      key: "variant",
    },
    buyer_hub: { value: "location", uuid: a.locationUuid, key: "buyer_hub" },
    rank: { value: "1", key: "rank", isBestBidder: true },
    rfp_status: { value: null, label: null },
    service_name: { value: null, validations: null },
  };
  return {
    item_uuid: a.bidUuid,
    item_type: "counter_offer_for_bid",
    sheets: { inline_components: { data: [row] } },
    remarks: "",
  };
}

/** F5 convert-to-auction [27]. */
export function buildAuctionBody(a: {
  pricingTradeUuid: string;
  vendorCompanyUuid: string;
  productUuid: string;
  productQualityUuid: string;
  locationUuid: string;
  lineItemUuid: string;
  pricingTemplateUuid: string;
  quantityValue: number;
  quantityUnit: string;
  useRfqQuotes: boolean;
  timing: StageTiming;
}) {
  const unit = a.quantityUnit;
  const qty = a.quantityValue;
  const dataRow = {
    product: {
      key: "product",
      value: "product",
      uuid: a.productUuid,
      event_group_line_item_uuid: a.lineItemUuid,
      meta: { qualityParams: [{ name: "Specs", value: "As per company" }] },
      configuration: {},
    },
    creator_quantity: { key: "creator_quantity", value: qty, postfix: unit, configuration: { suffix: unit } },
    buyer_hub: { key: "buyer_hub", value: "location", uuid: a.locationUuid, configuration: {} },
    participant_quantity: { key: "participant_quantity", postfix: unit, configuration: { suffix: unit } },
    price: { key: "price", prefix: "₹", postfix: unit, configuration: { prefix: "₹", suffix: unit } },
    gst: { key: "gst", postfix: "%", configuration: { suffix: "%" } },
    total_amount: { key: "total_amount", prefix: "₹", configuration: { prefix: "₹" } },
    variant: { uuid: a.productQualityUuid, configuration: {} },
    order: 1,
  };
  return {
    widgets: PRICING_WIDGETS,
    data: [dataRow],
    configurations: {
      stage_no: 1,
      is_tnc_mandatory: true,
      currency_configuration: null,
      is_english_auction_enabled: false,
      is_alternate_bidding_allowed: false,
      order_type: "buy",
      rfx_mode: "rfq_then_auction",
      auction_config: "rank",
      auction_closing_mode: "lot_based",
      rfp_evaluation_mode: "lot_based",
      pickup_schedules: false,
      bid_start_time: a.timing.bst,
      bid_end_time: a.timing.bet,
      extra_closing_time: a.timing.ect,
      title: "Auction",
      terms_and_conditions: ["Your evaluation for this event will depend on Gross Total."],
      attachments: [{ type: "t_and_c", value: [] }],
      template_uuid: a.pricingTemplateUuid,
      savings_configuration: null,
      bulk_price: null,
      traffic_light_ranges: { lower_bound: null, upper_bound: null },
      time_extension_value: null,
      last_n_minutes_for_time_extension: null,
      rank_limit_for_time_extension: null,
      dynamic_closing_time_strategy: "price_based",
      price_difference: null,
      time_difference: null,
      end_price: null,
      is_auction_on_base_price: false,
      closing_mode: "single",
      is_basket_auction: false,
    },
    status: "active",
    audience_company_uuids: [a.vendorCompanyUuid],
    creation_flow_type: "quick_flow",
    trade_request_uuid: a.pricingTradeUuid,
    use_rfq_quotes_as_bids: a.useRfqQuotes,
    allow_tna_vendors_to_bid: true,
    transfer_weights: false,
  };
}

// ── AWARDING (buyer) ────────────────────────────────────────────────────────

/** create proposal [28]. */
export function buildProposalBody(a: { eventGroupUuid: string }) {
  return { event_group_uuid: a.eventGroupUuid };
}

/** add response [29]. */
export function buildAwardResponseBody(a: {
  vendorCompanyUuid: string;
  lineItemUuid: string;
  quantityValue: number;
}) {
  const responses: Record<string, any> = {};
  responses[a.vendorCompanyUuid] = { action: "add", egli_data: {} };
  responses[a.vendorCompanyUuid].egli_data[a.lineItemUuid] = { awarded_quantity: a.quantityValue };
  return { responses };
}

/** submit proposal [31]. */
export function buildAwardSubmitBody(a: { approvalFlowUuid: string }) {
  return {
    approval_flow_uuid: a.approvalFlowUuid,
    attachments: [],
    remarks: {
      root: {
        children: [
          {
            children: [
              { detail: 0, format: 0, mode: "normal", style: "", text: "auto award", type: "text", version: 1 },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
            textFormat: 0,
            textStyle: "",
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    },
    step_uuid_vs_user_uuid: {},
  };
}

/** Create-event group body. Collection request [7]. */
export function buildEventGroupBody(a: {
  productUuid: string;
  quantityUnit: string;
  quantityValue: number;
  productQualityUuid: string;
}) {
  return {
    status: "draft",
    line_items: [
      {
        product_uuid: a.productUuid,
        quantity: { unitSymbol: a.quantityUnit, value: a.quantityValue },
        product_quality_uuid: a.productQualityUuid,
      },
    ],
  };
}
