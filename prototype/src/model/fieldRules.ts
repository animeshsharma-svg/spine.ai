/**
 * FIELD RULES FROM CODE — for each kind of template field, what actually stops
 * a bad value: the backend (with its error code), only the dashboard screen,
 * or nobody (the template just declares it).
 *
 * Read from procol-backend origin/main ae36e86894 and procol-client-dashboard
 * (feat/mvvm-orders-only) on 2026-10-01. Paths: backend ones start with app/,
 * lib/ or config/; dashboard ones with src/.
 *
 * `appliesTo`:
 *   "key:<key_attribute>"   one field (creator_quantity, price …)
 *   "type:<input_type>"     every field of that input type
 *   "section:<section>"     every field in that section (line_item | whole_bid | form)
 *   "*"                     every field
 * `replacesTemplateRule`: the rule refines a rule the template itself already
 * declares (e.g. is_required) — it fills in who enforces it instead of adding a row.
 */
import type { Enforcer, RuleKind } from "./types.js";

export interface LibRule {
  id: string;
  appliesTo: string[];
  /** only for fields filled by this side (default: any) */
  filledBy?: Array<"buyer" | "vendor" | "computed" | "nobody">;
  kind: RuleKind;
  plain: string;
  enforcedBy: Enforcer;
  code?: number;
  message?: string;
  value?: unknown;
  cites: string[];
  replacesTemplateRule?: boolean;
  plainSuffix?: string;
}

export const KIND_LABELS: Record<string, string> = {
  string: "text",
  multiline_text: "long text",
  number: "number",
  quantity: "quantity",
  percentage: "percentage",
  percent_and_amount: "percentage or amount",
  price: "price",
  formula: "calculated value",
  dropdown: "choice from a list",
  multi_select: "several choices from a list",
  radio: "one choice",
  date: "date",
  attachment: "file upload",
  product: "product from the catalogue",
  delivery_location: "delivery location",
  question_group: "group of questions",
  variant: "product quality / variant",
};

export const FIELD_RULE_LIBRARY: LibRule[] = [
  // ── required ──
  {
    id: "required.pricing_sheet",
    appliesTo: ["section:line_item", "section:whole_bid"],
    filledBy: ["buyer"],
    kind: "required",
    plain: "Checked only by the screen when publishing",
    plainSuffix:
      'The screen refuses to publish ("Sheet partially filled, please check again.") while a buyer-editable required cell is empty; the server itself does not check "required" on pricing-sheet cells, so an API call can skip it.',
    enforcedBy: "screen",
    message: "Sheet partially filled, please check again.",
    cites: [
      "src/views/projectCreation/helpers.js:236-274",
      "src/views/projectCreation/projectCreation.jsx:1642-1645",
      "app/controllers/concerns/trade_template_helper.rb:1445-1557 (no is_required check found — unverified negative)",
    ],
    replacesTemplateRule: true,
  },
  {
    id: "required.vendor_pricing",
    appliesTo: ["section:line_item", "section:whole_bid"],
    filledBy: ["vendor"],
    kind: "required",
    plain: "Vendor side",
    plainSuffix: "No server check for an empty optional/required vendor cell was found; the price and quantity limits below are what the server enforces on a bid.",
    enforcedBy: "unknown",
    cites: ["app/controllers/concerns/bids_controller_helper.rb:1828-1912"],
    replacesTemplateRule: true,
  },
  {
    id: "required.form_answer",
    appliesTo: ["section:form"],
    kind: "required",
    plain: "Checked by the server",
    plainSuffix: `A required answer left empty is refused when the response is submitted ("Please fill '<question>'", code 572); hidden questions are skipped.`,
    enforcedBy: "backend",
    code: 572,
    message: "Please fill '<name>'",
    cites: ["app/services/template_responses/validate_service.rb:153-163", "app/controllers/concerns/template_responses_controller_helper.rb:98-101", "config/locales/en-IN.yml:1984-1986"],
    replacesTemplateRule: true,
  },
  // ── calculated / read-only ──
  {
    id: "readonly.formula",
    appliesTo: ["type:formula"],
    kind: "readOnly",
    plain: "Calculated",
    plainSuffix:
      "The screen computes it and makes it read-only (a cell is editable only when the buyer fills it and it is writable); on a bid the server ignores non-writable formula fields when comparing changes. The formula itself is checked when the template is saved (code 2 \"Invalid Formula\").",
    enforcedBy: "screen",
    cites: [
      "src/utils/widgetUtils.js:12-15",
      "src/components/sheet/sheet.jsx:1932-1934,2044-2070,2130-2150",
      "app/controllers/concerns/bids_controller_helper.rb:2434-2436",
      "app/services/templates/validate_service.rb:92-125",
    ],
    replacesTemplateRule: true,
  },
  // ── numbers ──
  {
    id: "type.number",
    appliesTo: ["type:number", "type:quantity", "type:percentage", "type:price"],
    filledBy: ["buyer", "vendor"],
    kind: "type",
    plain: "Must be a number; negative values are refused unless the field allows them",
    enforcedBy: "screen",
    message: "(the screen silently drops an invalid value)",
    cites: ["src/components/sheet/sheet.jsx:1413-1431,1773-1785,2077-2086"],
  },
  {
    id: "precision.number",
    appliesTo: ["type:number", "type:quantity", "type:percentage", "type:formula"],
    kind: "precision",
    plain: "Decimals",
    plainSuffix: "The screen rounds to this many decimals; the server only rewrites precision, it does not refuse extra decimals.",
    enforcedBy: "screen",
    cites: ["src/components/sheet/sheet.jsx:1413-1431", "app/controllers/concerns/trade_template_helper.rb:1816-1830"],
    replacesTemplateRule: true,
  },
  // ── template validations (row rules) ──
  {
    id: "dependency.template_validation",
    appliesTo: ["*"],
    kind: "dependency",
    plain: "Row rule",
    plainSuffix: "The screen evaluates the rule when the cell changes and puts the value back with the template's message if it fails.",
    enforcedBy: "screen",
    cites: ["src/components/sheet/sheet.jsx:2010-2025,2158-2160"],
    replacesTemplateRule: true,
  },
  // ── choices ──
  {
    id: "enum.dropdown",
    appliesTo: ["type:dropdown", "type:radio", "type:multi_select"],
    kind: "enum",
    plain: "Choice list",
    plainSuffix: "The screen offers only these values; the template cannot be saved without options (code 2). No server check that a submitted value is one of them was found.",
    enforcedBy: "screen",
    cites: ["src/components/sheet/sheet.jsx:1478-1518,1652-1666", "app/services/templates/validate_service.rb:74-90"],
    replacesTemplateRule: true,
  },
  {
    id: "regex.form",
    appliesTo: ["section:form"],
    kind: "regex",
    plain: "Pattern",
    plainSuffix: "The screen tests the pattern; GST/PAN/bank-type checks run on the server and refuse the submit (code 773) unless failed validations are allowed.",
    enforcedBy: "screen",
    cites: ["src/components/sheet/sheet.jsx:2027-2035", "app/services/template_responses/validate_service.rb:164-167"],
    replacesTemplateRule: true,
  },
  // ── product / location ──
  {
    id: "product.active",
    appliesTo: ["key:product"],
    kind: "dependency",
    plain: "Must be an active product of this client; a pricing stage needs at least one",
    enforcedBy: "backend",
    code: 80,
    message: "Product not found",
    cites: ["app/controllers/api/trade_controller.rb:127-135,167-169", "src/components/sheet/sheet.jsx (last product row cannot be removed)"],
  },
  {
    id: "product.variant",
    appliesTo: ["key:product"],
    kind: "dependency",
    plain: "Needs a product quality (variant); the line item is keyed on product + quality + quantity + unit + delivery location",
    enforcedBy: "backend",
    cites: ["procol test/src/catalog/resolve.ts:36-42 (the framework picks a product with a variant for this reason)"],
  },
  {
    id: "location.required",
    appliesTo: ["key:buyer_hub"],
    kind: "required",
    plain: "Delivery location",
    plainSuffix: "Leaving it empty on the event's line items made the event update fail with an unexplained server error on UAT (seen 2026-09).",
    enforcedBy: "unknown",
    cites: ["memory: procol-event-group-update-500 (observed, not a code citation)"],
    replacesTemplateRule: true,
  },
  // ── units ──
  {
    id: "unit.blank",
    appliesTo: ["key:creator_quantity"],
    kind: "unit",
    plain: "Every line item must carry a unit (the quantity column's unit, else the product's); none → refused",
    enforcedBy: "backend",
    code: 574,
    message: "Unit cannot be blank",
    cites: ["app/controllers/concerns/trade_template_helper.rb:1391-1395", "config/locales/en-IN.yml:1990-1992"],
  },
  {
    id: "unit.must_be_client_unit",
    appliesTo: ["key:creator_quantity"],
    kind: "unit",
    plain:
      "The unit, lower-cased, must be the symbol of one of this client's active units (own units, plus Procol-wide ones unless material codification / company-only units is on); otherwise the stage is refused",
    enforcedBy: "backend",
    code: 495,
    message: "The unit <x> is not present",
    cites: ["app/controllers/concerns/trade_template_helper.rb:1398-1416", "app/models/unit.rb:48-66", "app/models/company.rb:238-240,394-396"],
  },
  {
    id: "unit.screen_options",
    appliesTo: ["key:creator_quantity"],
    kind: "unit",
    plain: "The screen offers every unit of the client and pre-selects the product's first linked unit (which may belong to another company — not checked by the screen)",
    enforcedBy: "screen",
    cites: ["src/views/projectCreation/components/manageLineItemsModal.jsx:67-80", "src/components/sheet/sheet.jsx:1674-1706,1957-1977", "src/redux/user/index.js:165-170"],
  },
  {
    id: "unit.single_with_global_price",
    appliesTo: ["section:whole_bid"],
    kind: "unit",
    plain: "When the template has whole-bid price fields, all line items must use the same unit",
    enforcedBy: "backend",
    code: 486,
    message: "You cannot add multiple units in this template.",
    cites: ["app/controllers/concerns/trade_template_helper.rb:1843-1853", "config/locales/en-IN.yml:1724-1726"],
  },
  {
    id: "unit.pr_same_unit",
    appliesTo: ["key:creator_quantity"],
    kind: "unit",
    plain: "A line item made from a purchase request must keep the request's unit, and not exceed its open quantity (plus tolerance)",
    enforcedBy: "backend",
    code: 559,
    message: "Quantity should be in same unit as requested",
    cites: ["app/controllers/concerns/trade_controller_helper.rb:1750-1760", "config/locales/en-IN.yml:1942-1947"],
  },
  // ── buyer-set limits ──
  {
    id: "range.buyer_limits",
    appliesTo: ["key:ceil_price", "key:floor_price", "key:floor_quantity"],
    kind: "range",
    plain: "Cannot be negative (202 price cap / 203 floor price / 204 minimum quantity); minimum quantity cannot exceed the requested quantity (205); a price cap cannot be lowered once set (200); needs the template setting that allows it (10)",
    enforcedBy: "backend",
    code: 202,
    cites: ["lib/modules/trade_validation.rb:43-87", "config/locales/en-IN.yml:1372-1387"],
  },
  // ── vendor bid limits ──
  {
    id: "range.bid_price",
    appliesTo: ["key:price"],
    filledBy: ["vendor"],
    kind: "range",
    plain: "On a bid: price must not exceed the price cap (38), must not go below the floor price (41), and a revision must move by at least the tick size (214); an identical landed price to another bid is a tie and refused (98) when ties are off",
    enforcedBy: "backend",
    code: 38,
    cites: ["app/controllers/concerns/bids_controller_helper.rb:1828-1891,1937-1970", "config/locales/en-IN.yml:1177,1186,1249,1526"],
  },
  {
    id: "range.bid_quantity",
    appliesTo: ["key:participant_quantity"],
    filledBy: ["vendor"],
    kind: "range",
    plain: "On a bid: quantity offered ≥ minimum quantity (39); = requested quantity when fixed-quantity bidding is on (207); ≤ requested when the round turns over-quantity off (138 — a round that does not say allows it: trade_request_model_helper.rb:181-183); ≥ requested unless under-quantity is allowed (139)",
    enforcedBy: "backend",
    code: 39,
    cites: ["app/controllers/concerns/bids_controller_helper.rb:1893-1908", "config/locales/en-IN.yml:1180,1330,1333,1390"],
  },
  // ── observed on UAT by the template check (2026-10-01): the server refuses these on a bid line,
  //    though the dashboard code suggested only the screen did. `value.violations` names the
  //    generated violations each rule answers (caseGen.ts backendRuleFor).
  {
    id: "observed.bid_price_invalid",
    appliesTo: ["key:price"],
    filledBy: ["vendor"],
    kind: "type",
    plain: "On a bid line the price must be a number above zero: text, a negative price or an empty price is refused (\"Invalid Input\")",
    enforcedBy: "backend",
    message: "Invalid Input",
    value: { violations: ["vendor_text_in_number", "vendor_negative_number", "vendor_empty_required"] },
    cites: ["observed on UAT 2026-10-01: template:check runs on 198678 and 32461 (POST /v1/bids/:uuid/create_bid_products → 422 \"Invalid Input\"); code location not yet found — unverified"],
  },
  {
    id: "observed.bid_quantity_positive",
    appliesTo: ["key:participant_quantity"],
    filledBy: ["vendor"],
    kind: "range",
    plain: "On a bid line the quantity offered must be above zero (\"Quantity must be greater than zero\")",
    enforcedBy: "backend",
    message: "Quantity must be greater than zero",
    value: { violations: ["vendor_negative_number"] },
    cites: ["observed on UAT 2026-10-01: template:check runs on 198678 and 32461; code location not yet found — unverified"],
  },
  {
    id: "observed.bid_gst_valid",
    appliesTo: ["key:gst"],
    filledBy: ["vendor"],
    kind: "range",
    plain: "On a bid line a negative GST is refused (\"Please enter valid GST\"); text in GST is accepted",
    enforcedBy: "backend",
    message: "Please enter valid GST",
    value: { violations: ["vendor_negative_number"] },
    cites: ["observed on UAT 2026-10-01: template:check runs on 198678 and 32461; code location not yet found — unverified"],
  },
  {
    id: "range.custom_validation_widgets",
    // validation columns are their own widgets (widget.validation {type, target_widget}); listed in the library, not on every field
    appliesTo: ["type:validation"],
    kind: "range",
    plain: "Custom min/max/step validation columns are checked on the bid by the server (code 578 \"Validation Failed\")",
    enforcedBy: "backend",
    code: 578,
    cites: ["lib/modules/trade_validation.rb:157-202", "app/controllers/concerns/bids_controller_helper.rb:1910-1912"],
  },
  {
    id: "readonly.buyer_edits_bid",
    appliesTo: ["section:line_item", "section:whole_bid"],
    filledBy: ["vendor"],
    kind: "readOnly",
    plain: "A buyer editing a vendor's bid may change only vendor fields or fields marked buyer-editable",
    enforcedBy: "backend",
    cites: ["app/controllers/concerns/bids_controller_helper.rb:2102-2109", "app/models/template.rb:312-314"],
  },
  // ── technical forms ──
  {
    id: "dependency.question_group",
    appliesTo: ["type:question_group"],
    kind: "dependency",
    plain: "The questions inside a group are checked when the group is required or any of them is answered (572)",
    enforcedBy: "backend",
    code: 572,
    cites: ["app/services/template_responses/validate_service.rb:96-151"],
  },
  {
    id: "dependency.conditional_block",
    appliesTo: ["section:form"],
    kind: "dependency",
    plain: "Conditional blocks in the template can make a question required or hidden depending on another answer, before the check runs",
    enforcedBy: "backend",
    cites: ["app/services/template_responses/validate_service.rb:80-94", "app/poro_classes/template/conditional_block_handler/condition.rb:5,35-50"],
  },
  {
    id: "range.evaluation_score",
    appliesTo: ["key:score_widget"],
    kind: "range",
    plain: "An evaluator's score must be a whole number that is one of the event's score labels (e.g. 0–5); a score of 0 needs a remark; else refused (code 2)",
    enforcedBy: "backend",
    code: 2,
    cites: ["app/services/evaluations/validate_service.rb:43-75", "config/locales/en-IN.yml:1117-1119"],
  },
  {
    id: "form.structure",
    appliesTo: ["section:form"],
    kind: "type",
    plain: "Each page needs a name, an order and at least one question; each question needs a key, a name and who fills it — else the stage is refused (792)",
    enforcedBy: "backend",
    code: 792,
    cites: ["app/services/templates/validate_service.rb:205-293", "app/controllers/concerns/trade_template_helper.rb:1711-1714", "config/locales/en-IN.yml:2380"],
  },
];

function matches(r: LibRule, key: string, inputType: string, section: string): boolean {
  return r.appliesTo.some((a) => a === "*" || a === `key:${key}` || a === `type:${inputType}` || a === `section:${section}`);
}

/**
 * The library rules for one field. Rules restricted by `filledBy` are filtered
 * by the caller-supplied side; `replacesTemplateRule` rules only upgrade a rule
 * of the same kind the template already declared.
 */
export function libraryRulesFor(key: string, inputType: string, section: string, filledBy?: string): LibRule[] {
  return FIELD_RULE_LIBRARY.filter((r) => matches(r, key, inputType, section) && (!r.filledBy || !filledBy || r.filledBy.includes(filledBy as any)));
}

/** Rows for model_field_rules. */
export function fieldRuleRows() {
  return FIELD_RULE_LIBRARY.map((r) => ({
    id: r.id,
    appliesTo: r.appliesTo.join(" | "),
    kind: r.kind,
    plain: r.plainSuffix ? `${r.plain}. ${r.plainSuffix}` : r.plain,
    enforcedBy: r.enforcedBy,
    code: r.code ?? null,
    message: r.message ?? null,
    details: { filledBy: r.filledBy ?? null, replacesTemplateRule: !!r.replacesTemplateRule },
    cites: r.cites,
  }));
}
