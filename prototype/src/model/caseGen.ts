/**
 * FIELD-LEVEL CASE GENERATOR — one test case per (field × rule × violation),
 * worked out from the product model of ONE client's ONE template.
 *
 * Pure: no network. The template check run (templateCheck.ts) fires them.
 *
 * Where a case is fired (`target`):
 *   template   GET the template itself (does it open?)
 *   stage      the buyer saves a pricing round built from this template (POST /trade/template_input)
 *   bid        the vendor fills their line on the published round (POST /v1/bids/:id/create_bid_products)
 *   form-stage the buyer saves a technical (RFP) round built from this template
 *   form-answer the vendor answers the technical round (submit of the template response)
 *
 * The expected outcome comes from WHO enforces the rule (types.ts Enforcer):
 *   backend  → "reject", with the server's own message where the code says it
 *   screen   → "no-5xx": the API is allowed to take it; the case says so in
 *              plain words ("only the screen stops it") — a gap worth reporting
 *   unknown / template-only → "no-5xx"
 * The verdict itself is engine.ts `classify` — deterministic, no LLM.
 *
 * Every case maps to one catalog case in test-cases/api-template-fields.md
 * (API-XTPL-NNN) — the generic wording; the generated case carries the
 * template's own field names.
 */
import type { ClientModel, Enforcer, ModelField, ModelTemplate } from "./types.js";
import { libraryRulesFor, type LibRule } from "./fieldRules.js";

/** A library rule the server enforces for exactly this generated violation (observed or from code). */
function backendRuleFor(f: ModelField, violation: string): LibRule | undefined {
  return libraryRulesFor(f.key, f.inputType, f.section, f.filledBy).find(
    (r) => r.enforcedBy === "backend" && Array.isArray((r.value as any)?.violations) && (r.value as any).violations.includes(violation),
  );
}

export type Target = "template" | "stage" | "bid" | "form-stage" | "form-answer";

export type Violation =
  | "opens"
  | "positive_stage"
  | "positive_bid"
  | "positive_form"
  | "template_missing"
  | "product_missing"
  | "unit_blank"
  | "unit_not_client"
  | "unit_other_company"
  | "empty_required"
  | "text_in_number"
  | "negative_number"
  | "too_many_decimals"
  | "not_in_options"
  | "unicode_text"
  | "very_long_text"
  | "invalid_date"
  | "computed_sent"
  | "vendor_field_by_buyer"
  | "negative_limit"
  | "floor_qty_above_requested"
  | "outside_range"
  | "location_missing"
  | "vendor_empty_required"
  | "vendor_text_in_number"
  | "vendor_negative_number"
  | "vendor_too_many_decimals"
  | "over_quantity"
  | "above_price_cap"
  | "below_floor_price"
  | "buyer_field_by_vendor"
  | "vendor_computed_sent"
  | "page_no_name"
  | "question_no_key"
  | "question_no_filler"
  | "answer_required_empty"
  | "answer_not_in_options"
  | "below_min_quantity"
  | "vendor_not_in_options"
  | "positive_answer";

/** Violation → catalog case id (test-cases/api-template-fields.md). */
export const CATALOG_ID: Record<Violation, string> = {
  opens: "API-XTPL-001",
  positive_stage: "API-XTPL-002",
  positive_bid: "API-XTPL-003",
  positive_form: "API-XTPL-004",
  template_missing: "API-XTPL-005",
  product_missing: "API-XTPL-006",
  unit_blank: "API-XTPL-007",
  unit_not_client: "API-XTPL-008",
  unit_other_company: "API-XTPL-009",
  empty_required: "API-XTPL-010",
  text_in_number: "API-XTPL-011",
  negative_number: "API-XTPL-012",
  too_many_decimals: "API-XTPL-013",
  not_in_options: "API-XTPL-014",
  unicode_text: "API-XTPL-015",
  very_long_text: "API-XTPL-016",
  invalid_date: "API-XTPL-017",
  computed_sent: "API-XTPL-018",
  vendor_field_by_buyer: "API-XTPL-019",
  negative_limit: "API-XTPL-020",
  floor_qty_above_requested: "API-XTPL-021",
  outside_range: "API-XTPL-022",
  location_missing: "API-XTPL-023",
  vendor_empty_required: "API-XTPL-024",
  vendor_text_in_number: "API-XTPL-025",
  vendor_negative_number: "API-XTPL-026",
  vendor_too_many_decimals: "API-XTPL-027",
  over_quantity: "API-XTPL-028",
  above_price_cap: "API-XTPL-029",
  below_floor_price: "API-XTPL-030",
  buyer_field_by_vendor: "API-XTPL-031",
  vendor_computed_sent: "API-XTPL-032",
  page_no_name: "API-XTPL-033",
  question_no_key: "API-XTPL-034",
  question_no_filler: "API-XTPL-035",
  answer_required_empty: "API-XTPL-036",
  answer_not_in_options: "API-XTPL-037",
  below_min_quantity: "API-XTPL-038",
  vendor_not_in_options: "API-XTPL-039",
  positive_answer: "API-XTPL-040",
};

export interface TemplateCase {
  /** unique within a run: <catalog id>.<n> */
  id: string;
  catalogId: string;
  violation: Violation;
  target: Target;
  side: "buyer" | "vendor";
  expected: "accept" | "reject" | "no-5xx";
  /** the server's message the refusal must carry (engine: another reason → couldn't tell) */
  expectMessage?: string;
  expectCode?: number;
  /** true when only the screen enforces the rule — an accepted request is the documented gap */
  screenOnly: boolean;
  enforcedBy: Enforcer | "n/a";
  /** the cell to change; absent for template-level cases */
  field?: { key: string; name: string; section: string; filledBy: string; inputType: string; page?: string };
  /** what is sent in place of a valid value (undefined = cell left out/empty) */
  value?: unknown;
  /** when a case needs the round to carry a buyer limit first (e.g. a price cap for the bid) */
  stageSetup?: Record<string, unknown>;
  priority: "P0" | "P1" | "P2" | "P3";
  // ── what a person reads ──
  title: string;
  why: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  details: { rule?: string; ruleText?: string; code?: number; cites?: string[]; template: string; templateUuid: string; note?: string };
}

export interface GenOptions {
  /** the event type the template is used for — "rfq" | "auction" | "rfp" | "boq" … (default from the template) */
  eventType?: string;
}

const LONG_TEXT = "QA long text ".repeat(400).trim(); // ~5,200 characters
const UNICODE_TEXT = "QA ✓ Ünïcødé — 测试 テスト 🚚 «quotes» 'apostrophe' <b>tag</b>";

const NUMERIC = new Set(["number", "quantity", "percentage", "price", "percent_and_amount"]);
const TEXT = new Set(["string", "multiline_text"]);
const CHOICE = new Set(["dropdown", "radio", "multi_select"]);

function ruleOf(f: ModelField, kind: string) {
  return f.rules.find((r) => r.kind === kind);
}

function enforcer(f: ModelField, kind: string): Enforcer {
  return ruleOf(f, kind)?.enforcedBy ?? "unknown";
}

const fieldRef = (f: ModelField): TemplateCase["field"] => ({
  key: f.key,
  name: f.name,
  section: f.section,
  filledBy: f.filledBy,
  inputType: f.inputType,
  ...(f.page ? { page: f.page } : {}),
});

/** What the case expects, in plain words, from who enforces the rule. */
function expectFrom(by: Enforcer, refusal: string, accepted: string): { expected: TemplateCase["expected"]; screenOnly: boolean; text: string } {
  if (by === "backend") return { expected: "reject", screenOnly: false, text: refusal };
  if (by === "screen")
    return {
      expected: "no-5xx",
      screenOnly: true,
      text: `Today the API accepts it — only the screen stops it. ${accepted} The check passes as long as the server answers cleanly (no server error); an accepted request is recorded as a gap: anything that calls the API directly can save this value.`,
    };
  return {
    expected: "no-5xx",
    screenOnly: false,
    text: `Nobody is known to check this. ${accepted} The check passes as long as the server answers cleanly (no server error) and records what it did.`,
  };
}

export function generateTemplateCases(model: ClientModel, t: ModelTemplate, opts: GenOptions = {}): TemplateCase[] {
  const out: TemplateCase[] = [];
  const counters: Record<string, number> = {};
  const isForm = t.useFor.includes("rfp") || t.fields.some((f) => f.section === "form");
  const eventType = opts.eventType ?? (isForm ? "rfp" : t.useFor.includes("boq") ? "boq" : "rfq");
  const roundWord = isForm ? "technical (RFP) round" : eventType === "auction" ? "auction round" : "pricing (RFQ) round";
  const client = model.companyName ?? `client ${model.companyId}`;
  const pre = `Signed in as a buyer of ${client}. A sandbox draft event (named QA_Platform_…) with one line item of a catalogue product.`;
  const preBid = `${pre} A ${roundWord} built from "${t.name}" is published to the client's test vendor, who is signed in and has started a bid.`;
  const details = (extra: Partial<TemplateCase["details"]> = {}): TemplateCase["details"] => ({ template: t.name, templateUuid: t.uuid, ...extra });

  const add = (c0: Omit<TemplateCase, "id" | "catalogId">) => {
    let c = c0;
    const f = c.field ? t.fields.find((x) => x.key === c.field!.key && x.section === c.field!.section) : undefined;
    const br = f && c.expected === "no-5xx" ? backendRuleFor(f, c.violation) : undefined;
    if (br) {
      c = {
        ...c,
        expected: "reject",
        screenOnly: false,
        enforcedBy: "backend",
        ...(br.message ? { expectMessage: br.message } : {}),
        expectedResult: `Refused${br.message ? `: “${br.message}”` : ""}. ${br.plain}.`,
        details: { ...c.details, rule: br.id, cites: br.cites },
      };
    }
    const catalogId = CATALOG_ID[c.violation];
    counters[catalogId] = (counters[catalogId] ?? 0) + 1;
    out.push({ ...c, catalogId, id: `${catalogId}.${String(counters[catalogId]).padStart(2, "0")}` });
  };

  // ── the template itself ──
  add({
    violation: "opens",
    target: "template",
    side: "buyer",
    expected: "accept",
    screenOnly: false,
    enforcedBy: "n/a",
    priority: "P0",
    title: `Template "${t.name}" opens`,
    why: `A buyer who picks "${t.name}" for a ${roundWord} first has it opened; if opening it fails, nobody can use it.`,
    preconditions: `Signed in as a buyer of ${client}.`,
    steps: [`Open the template "${t.name}" as the event-creation screen does.`],
    expectedResult: `The template opens and lists its columns${t.opens ? "" : " (when the product model was built it did NOT open — the server answered with an error)"}.`,
    details: details({ note: t.opens ? undefined : t.problems.map((p) => p.plain).join(" ") }),
  });
  if (!t.opens) return out; // nothing else can be built from a template that does not open

  // ── positives ──
  if (isForm) {
    add({
      violation: "positive_form",
      target: "form-stage",
      side: "buyer",
      expected: "accept",
      screenOnly: false,
      enforcedBy: "n/a",
      priority: "P0",
      title: `A technical round saves with the questions of "${t.name}" exactly as the template defines them`,
      why: "The baseline: if a correct round is refused, every negative case below would be refused for the wrong reason.",
      preconditions: pre,
      steps: [`Add a technical (RFP) round to the draft using "${t.name}", with its pages and questions unchanged.`, "Save the round as a draft."],
      expectedResult: "The round is saved and comes back with its id.",
      details: details(),
    });
  } else {
    add({
      violation: "positive_stage",
      target: "stage",
      side: "buyer",
      expected: "accept",
      screenOnly: false,
      enforcedBy: "n/a",
      priority: "P0",
      title: `A ${roundWord} saves with every buyer column of "${t.name}" filled correctly`,
      why: "The baseline: if a correct round is refused, every negative case below would be refused for the wrong reason.",
      preconditions: pre,
      steps: [
        `Add a ${roundWord} to the draft using "${t.name}".`,
        "Fill every column the buyer fills with a valid value (catalogue product, a quantity in one of the client's units, a delivery location, valid values in the other buyer columns).",
        "Save the round as a draft.",
      ],
      expectedResult: "The round is saved and comes back with its id.",
      details: details(),
    });
  }

  // ── a template that does not exist (one per template is enough to tie it to the run) ──
  if (!isForm) {
    add({
      violation: "template_missing",
      target: "stage",
      side: "buyer",
      expected: "reject",
      screenOnly: false,
      enforcedBy: "unknown",
      priority: "P1",
      value: "QA_DOES_NOT_EXIST",
      title: "A pricing round that names a template which does not exist is refused",
      why: "A round must be built from a real template of this client; if the server stores a round against a template id that does not exist, later steps that read the template (bids, award) break — the engine journey saw award fail with “Bid not present on this line item” after such a round was accepted.",
      preconditions: pre,
      steps: [`Add a ${roundWord} exactly like the valid one, but naming a template id that does not exist.`, "Save the round as a draft."],
      expectedResult: "The round is refused with a clear message; it is not stored.",
      details: details({ note: "Probe (b): accepted once on 198678 by the engine journey (unverified until this case runs)." }),
    });
  }

  const unitSymbols = new Set(model.units.usable.map((u) => u.symbol.toLowerCase()));

  for (const f of t.fields) {
    const ref = fieldRef(f);
    // ── technical (RFP) questions ──
    if (f.section === "form") {
      if (f.filledBy !== "vendor") continue;
      if (f.required && f.inputType !== "question_group") {
        add({
          violation: "answer_required_empty",
          target: "form-answer",
          side: "vendor",
          expected: "reject",
          expectCode: 572,
          // the refusal must name THIS question — another missing answer would be a refusal for the wrong reason
          expectMessage: f.name,
          screenOnly: false,
          enforcedBy: "backend",
          field: ref,
          value: "",
          priority: "P1",
          title: `Vendor submits the technical answers with the required question "${f.name}" (page "${f.page}") left empty`,
          why: "A required question must be answered before the response counts; the server checks it on submit.",
          preconditions: preBid.replace("has started a bid", "has opened the technical round"),
          steps: [`Answer every question of "${t.name}" except "${f.name}" on page "${f.page}".`, "Submit the response."],
          expectedResult: `The submit is refused: “Please fill '${f.name}'” (the server's mandatory-answer check).`,
          details: details({ code: 572, cites: ruleOf(f, "required")?.cites }),
        });
      }
      if (CHOICE.has(f.inputType) && f.options?.length) {
        const e = expectFrom(enforcer(f, "enum"), "", `The vendor's answer "QA not an option" is stored for "${f.name}".`);
        add({
          violation: "answer_not_in_options",
          target: "form-answer",
          side: "vendor",
          ...e,
          expected: e.expected,
          enforcedBy: enforcer(f, "enum"),
          field: ref,
          value: "QA not an option",
          priority: "P2",
          title: `Vendor answers "${f.name}" with a value that is not one of its choices`,
          why: `The question offers only ${f.options.slice(0, 5).join(", ")}${f.options.length > 5 ? " …" : ""}; an answer outside the list breaks comparison and scoring.`,
          preconditions: preBid.replace("has started a bid", "has opened the technical round"),
          steps: [`Answer "${f.name}" with "QA not an option" and every other question validly.`, "Submit the response."],
          expectedResult: e.text,
          details: details({ cites: ruleOf(f, "enum")?.cites }),
        });
      }
      continue;
    }

    // ── pricing-sheet columns, buyer side ──
    if (f.filledBy === "buyer" && f.section === "line_item") {
      if (f.key === "product") {
        add({
          violation: "product_missing",
          target: "stage",
          side: "buyer",
          expected: "reject",
          expectCode: 80,
          screenOnly: false,
          enforcedBy: "backend",
          field: ref,
          priority: "P1",
          title: `A ${roundWord} whose line item has no product is refused`,
          why: "Every line item is a product of the client's catalogue; a line without one cannot be quoted or awarded.",
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with the line item's product left out (unit and quantity still given).`, "Save the round."],
          expectedResult: "The round is refused with a clear message (the server's product check — “Product not found”), not a server error.",
          details: details({ code: 80, cites: ruleOf(f, "dependency")?.cites }),
        });
        continue;
      }
      if (f.key === "creator_quantity") {
        add({
          violation: "unit_blank",
          target: "stage",
          side: "buyer",
          expected: "reject",
          expectMessage: "Unit cannot be blank",
          expectCode: 574,
          screenOnly: false,
          enforcedBy: "backend",
          field: ref,
          priority: "P1",
          title: `A ${roundWord} whose line item has no unit is refused`,
          why: "Quantities and prices are per unit; without one the round cannot be compared or awarded.",
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with the quantity's unit left empty (and no unit on the product row).`, "Save the round."],
          expectedResult: "The round is refused: “Unit cannot be blank”.",
          details: details({ code: 574 }),
        });
        const missing = ["kg", "nos", "piece", "litre", "mt", "ton"].find((u) => !unitSymbols.has(u)) ?? "qa_unit_x";
        add({
          violation: "unit_not_client",
          target: "stage",
          side: "buyer",
          expected: "reject",
          expectMessage: "is not present",
          expectCode: 495,
          screenOnly: false,
          enforcedBy: "backend",
          field: ref,
          value: missing.toUpperCase(),
          priority: "P1",
          title: `A ${roundWord} in the unit "${missing.toUpperCase()}", which ${client} does not have, is refused`,
          why: `The unit must be one of the client's own active units (${model.units.count} on this client); the default Procol templates assume KG, which some clients (Demo Account 2) do not have.`,
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with the quantity in "${missing.toUpperCase()}".`, "Save the round."],
          expectedResult: `The round is refused: “The unit ${missing} is not present”.`,
          details: details({ code: 495, cites: ruleOf(f, "unit")?.cites, note: `"${missing}" is not among this client's usable units in the product model.` }),
        });
        for (const u of model.units.unusableProductUnits.slice(0, 1)) {
          add({
            violation: "unit_other_company",
            target: "stage",
            side: "buyer",
            expected: "reject",
            expectMessage: "is not present",
            expectCode: 495,
            screenOnly: false,
            enforcedBy: "backend",
            field: ref,
            value: { unit: u.symbol, product: u.sample[0], products: u.sample },
            priority: "P1",
            title: `A product whose linked unit "${u.unitName}" belongs to another company cannot be quoted in that unit`,
            why: `${u.products} product(s) of ${client} (e.g. "${u.sample[0]}") are linked to the unit "${u.unitName}", which is not one of this client's units; the screen pre-selects the product's first linked unit, so a buyer picking such a product hits a refusal they cannot explain.`,
            preconditions: pre,
            steps: [`Add a ${roundWord} using "${t.name}" for a product linked only to "${u.unitName}" (one of: ${u.sample.join(", ")}), in that unit.`, "Save the round."],
            expectedResult: `The round is refused: “The unit ${u.symbol} is not present” — the screen should not offer that unit.`,
            details: details({ code: 495, note: `unit owner company ${u.ownerCompanyId ?? "?"}` }),
          });
        }
        addNegative(f, "negative_number", "stage", "buyer");
        if (f.precision !== undefined) addDecimals(f, "too_many_decimals", "stage", "buyer");
        addTextInNumber(f, "text_in_number", "stage", "buyer");
        continue;
      }
      if (f.key === "buyer_hub") {
        const e = expectFrom("unknown", "", "The line item is stored without a delivery location.");
        add({
          violation: "location_missing",
          target: "stage",
          side: "buyer",
          ...e,
          enforcedBy: "unknown",
          field: ref,
          priority: "P2",
          title: `A ${roundWord} whose line item has no delivery location`,
          why: "A missing delivery location once made a later event update fail with an unexplained server error on UAT; this checks the round itself is handled cleanly.",
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with the delivery location left out.`, "Save the round."],
          expectedResult: e.text,
          details: details({ cites: ruleOf(f, "required")?.cites }),
        });
        continue;
      }
      if (["ceil_price", "floor_price", "floor_quantity"].includes(f.key)) {
        const code = f.key === "ceil_price" ? 202 : f.key === "floor_price" ? 203 : 204;
        const msg = f.key === "ceil_price" ? "Price Cap cannot be negative" : f.key === "floor_price" ? "Floor Price cannot be negative" : "Floor Quantity cannot be negative";
        add({
          violation: "negative_limit",
          target: "stage",
          side: "buyer",
          expected: "reject",
          expectMessage: msg,
          expectCode: code,
          screenOnly: false,
          enforcedBy: "backend",
          field: ref,
          value: -10,
          priority: "P1",
          title: `A ${roundWord} with a negative "${f.name}" (−10) is refused`,
          why: "Buyer limits steer every bid; a negative limit would reject every honest bid or none.",
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with "${f.name}" = −10.`, "Save the round."],
          expectedResult: `The round is refused: “${msg}”.`,
          details: details({ code, cites: ["lib/modules/trade_validation.rb:64-87"] }),
        });
        if (f.key === "floor_quantity") {
          add({
            violation: "floor_qty_above_requested",
            target: "stage",
            side: "buyer",
            expected: "reject",
            expectMessage: "Floor Quantity cannot be greater than the Total Quantity",
            expectCode: 205,
            screenOnly: false,
            enforcedBy: "backend",
            field: ref,
            value: "requested+1000",
            priority: "P2",
            title: `A ${roundWord} whose minimum quantity is above the requested quantity is refused`,
            why: "No vendor could ever meet a minimum quantity larger than what is asked for.",
            preconditions: pre,
            steps: [`Add a ${roundWord} using "${t.name}" with "${f.name}" 1,000 above the requested quantity.`, "Save the round."],
            expectedResult: "The round is refused: “Floor Quantity cannot be greater than the Total Quantity”.",
            details: details({ code: 205, cites: ["lib/modules/trade_validation.rb:80-84"] }),
          });
        }
        continue;
      }
      // other buyer columns
      if (f.required) {
        const e = expectFrom(enforcer(f, "required"), "", `The round is saved with "${f.name}" empty.`);
        add({
          violation: "empty_required",
          target: "stage",
          side: "buyer",
          ...e,
          enforcedBy: enforcer(f, "required"),
          field: ref,
          value: "",
          priority: "P1",
          title: `A ${roundWord} saved with the required column "${f.name}" left empty`,
          why: `"${f.name}" is marked required in "${t.name}"; the screen refuses to publish while it is empty ("Sheet partially filled, please check again.").`,
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with "${f.name}" left empty and every other column valid.`, "Save the round."],
          expectedResult: e.text,
          details: details({ cites: ruleOf(f, "required")?.cites, ruleText: ruleOf(f, "required")?.plain }),
        });
      }
      if (NUMERIC.has(f.inputType)) {
        addTextInNumber(f, "text_in_number", "stage", "buyer");
        addNegative(f, "negative_number", "stage", "buyer");
        if (f.precision !== undefined) addDecimals(f, "too_many_decimals", "stage", "buyer");
      }
      if (TEXT.has(f.inputType)) {
        addText(f, "unicode_text", UNICODE_TEXT);
        addText(f, "very_long_text", LONG_TEXT);
      }
      if (CHOICE.has(f.inputType) && f.options?.length) addNotInOptions(f, "not_in_options", "stage", "buyer");
      if (f.inputType === "date") {
        const e = expectFrom("unknown", "", `The round is saved with "${f.name}" = "31-02-2026".`);
        add({
          violation: "invalid_date",
          target: "stage",
          side: "buyer",
          ...e,
          enforcedBy: "unknown",
          field: ref,
          value: "31-02-2026",
          priority: "P2",
          title: `A ${roundWord} with an impossible date (31 February) in "${f.name}"`,
          why: "Dates drive delivery and contract terms; an impossible date must not crash the save or be stored silently.",
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with "${f.name}" = 31-02-2026.`, "Save the round."],
          expectedResult: e.text,
          details: details(),
        });
      }
      addRanges(f, "stage", "buyer");
      continue;
    }

    // ── calculated columns: the buyer sends one ──
    if (f.filledBy === "computed" && f.section === "line_item") {
      const by = enforcer(f, "readOnly");
      const e = expectFrom(by, "", `The value the buyer sent for "${f.name}" is stored or silently replaced.`);
      add({
        violation: "computed_sent",
        target: "stage",
        side: "buyer",
        ...e,
        enforcedBy: by,
        field: ref,
        value: 999999,
        priority: "P2",
        title: `A ${roundWord} that sends its own value (999999) for the calculated column "${f.name}"`,
        why: `"${f.name}" is worked out${f.formula ? ` as ${f.formula}` : ""}; nobody should be able to type it.`,
        preconditions: pre,
        steps: [`Add a ${roundWord} using "${t.name}" with "${f.name}" = 999999 in the line item.`, "Save the round."],
        expectedResult: e.text,
        details: details({ cites: ruleOf(f, "readOnly")?.cites, ruleText: f.formula }),
      });
      if (out.filter((c) => c.violation === "vendor_computed_sent").length === 0 && t.vendorFields > 0) {
        const e2 = expectFrom(by, "", `The vendor's own value for "${f.name}" is stored or silently replaced.`);
        add({
          violation: "vendor_computed_sent",
          target: "bid",
          side: "vendor",
          ...e2,
          enforcedBy: by,
          field: ref,
          value: 999999,
          priority: "P2",
          title: `Vendor sends their own value (999999) for the calculated column "${f.name}"`,
          why: `"${f.name}" is worked out${f.formula ? ` as ${f.formula}` : ""}; a vendor typing it could make a bid look cheaper than it is.`,
          preconditions: preBid,
          steps: [`Fill the vendor line validly, but with "${f.name}" = 999999.`, "Save the line."],
          expectedResult: e2.text,
          details: details({ cites: ruleOf(f, "readOnly")?.cites, ruleText: f.formula }),
        });
      }
      continue;
    }

    // ── vendor columns ──
    if (f.filledBy === "vendor" && f.section === "line_item") {
      // the buyer fills a vendor column when saving the round
      const eB = expectFrom("unknown", "", `The buyer's value for the vendor column "${f.name}" is stored or ignored.`);
      if (out.filter((c) => c.violation === "vendor_field_by_buyer").length < 2) {
        add({
          violation: "vendor_field_by_buyer",
          target: "stage",
          side: "buyer",
          ...eB,
          enforcedBy: "unknown",
          field: ref,
          value: f.inputType === "string" ? "QA buyer text" : 123,
          priority: "P2",
          title: `The buyer fills the vendor's column "${f.name}" when saving a ${roundWord}`,
          why: `"${f.name}" belongs to the vendor; a value the buyer puts there could pre-fill or skew the vendor's bid.`,
          preconditions: pre,
          steps: [`Add a ${roundWord} using "${t.name}" with a value in the vendor column "${f.name}".`, "Save the round."],
          expectedResult: eB.text,
          details: details(),
        });
      }
      if (f.required) {
        const by = enforcer(f, "required");
        const e = expectFrom(by, "", `The vendor's line is saved with "${f.name}" empty.`);
        add({
          violation: "vendor_empty_required",
          target: "bid",
          side: "vendor",
          ...e,
          enforcedBy: by,
          field: ref,
          value: null,
          priority: f.key === "price" ? "P1" : "P2",
          title: `Vendor saves their line with the required column "${f.name}" empty`,
          why: `"${f.name}" is required in "${t.name}"; a bid line without it cannot be compared.`,
          preconditions: preBid,
          steps: [`Fill the vendor line validly except "${f.name}", left empty.`, "Save the line."],
          expectedResult: e.text,
          details: details({ cites: ruleOf(f, "required")?.cites }),
        });
      }
      if (NUMERIC.has(f.inputType)) {
        addTextInNumber(f, "vendor_text_in_number", "bid", "vendor");
        addNegative(f, "vendor_negative_number", "bid", "vendor");
        if (f.precision !== undefined) addDecimals(f, "vendor_too_many_decimals", "bid", "vendor");
      }
      if (CHOICE.has(f.inputType) && f.options?.length) addNotInOptions(f, "vendor_not_in_options", "bid", "vendor");
      if (f.key === "participant_quantity") {
        add({
          violation: "over_quantity",
          target: "bid",
          side: "vendor",
          expected: "reject",
          expectMessage: "Quantity cannot be greater than the mentioned quantity",
          expectCode: 138,
          screenOnly: false,
          enforcedBy: "backend",
          field: ref,
          value: "requested+1000",
          stageSetup: { "config.is_over_quantity_allowed": false },
          priority: "P1",
          title: `Vendor offers 1,000 more than the requested quantity in "${f.name}" on a round that does not allow over-quantity`,
          why: "When the round does not allow over-quantity, a vendor may not offer more than asked for. (A round that says nothing allows it — the server's default is “allowed”.)",
          preconditions: `${preBid} The round is saved with over-quantity NOT allowed.`,
          steps: [`Fill the vendor line with "${f.name}" = requested quantity + 1,000.`, "Save the line."],
          expectedResult: "The line is refused: “Quantity cannot be greater than the mentioned quantity.”",
          details: details({ code: 138, cites: ["app/controllers/concerns/bids_controller_helper.rb:1901-1903"] }),
        });
        if (t.fields.some((x) => x.key === "floor_quantity" && x.filledBy === "buyer")) {
          add({
            violation: "below_min_quantity",
            target: "bid",
            side: "vendor",
            expected: "reject",
            expectMessage: "Quantity cannot be less than the allowed quantity",
            expectCode: 39,
            screenOnly: false,
            enforcedBy: "backend",
            field: ref,
            value: 1,
            stageSetup: { floor_quantity: 10 },
            priority: "P1",
            title: `Vendor offers less than the buyer's minimum quantity`,
            why: "The buyer set a minimum quantity per vendor; a smaller offer must be refused.",
            preconditions: `${preBid} The round's minimum quantity is 10.`,
            steps: [`Fill the vendor line with "${f.name}" = 1.`, "Save the line."],
            expectedResult: "The line is refused: “Quantity cannot be less than the allowed quantity”.",
            details: details({ code: 39 }),
          });
        }
      }
      if (f.key === "price") {
        const hasCap = t.fields.some((x) => x.key === "ceil_price" && x.filledBy === "buyer");
        const damaged = f.rules.find((r) => r.kind === "dependency" && /ceil_price/.test(String(r.value ?? "")));
        if (hasCap) {
          add({
            violation: "above_price_cap",
            target: "bid",
            side: "vendor",
            expected: "reject",
            expectMessage: "Price cannot be more than the allowed price",
            expectCode: 38,
            screenOnly: false,
            enforcedBy: "backend",
            field: ref,
            value: 150,
            stageSetup: { ceil_price: 100 },
            priority: "P1",
            title: `Vendor quotes 150 when the buyer's price cap is 100`,
            why: `The price cap is the buyer's upper limit.${damaged ? ` In this template the stored rule reads "${String(damaged.value)}" with its comparison sign damaged in storage ("u003c"); the server's own price-cap check does not read that text, so it should still hold.` : ""}`,
            preconditions: `${preBid} The round's price cap (ceiling price) is 100.`,
            steps: [`Fill the vendor line with "${f.name}" = 150.`, "Save the line."],
            expectedResult: "The line is refused: “Price cannot be more than the allowed price”.",
            details: details({ code: 38, ruleText: damaged ? String(damaged.value) : undefined, cites: ["app/controllers/concerns/bids_controller_helper.rb:1839-1846"], note: damaged ? "Probe (c): damaged '<' in the stored base_price<ceil_price rule." : undefined }),
          });
        }
        if (t.fields.some((x) => x.key === "floor_price" && x.filledBy === "buyer")) {
          add({
            violation: "below_floor_price",
            target: "bid",
            side: "vendor",
            expected: "reject",
            expectMessage: "Price cannot be less than the allowed price",
            expectCode: 41,
            screenOnly: false,
            enforcedBy: "backend",
            field: ref,
            value: 5,
            stageSetup: { floor_price: 10 },
            priority: "P1",
            title: `Vendor quotes 5 when the buyer's floor price is 10`,
            why: "The floor price is the buyer's lower limit.",
            preconditions: `${preBid} The round's floor price is 10.`,
            steps: [`Fill the vendor line with "${f.name}" = 5.`, "Save the line."],
            expectedResult: "The line is refused: “Price cannot be less than the allowed price”.",
            details: details({ code: 41 }),
          });
        }
      }
      addRanges(f, "bid", "vendor");
      continue;
    }
  }

  // ── template-level vendor cases ──
  if (!isForm && t.vendorFields > 0) {
    add({
      violation: "positive_bid",
      target: "bid",
      side: "vendor",
      expected: "accept",
      screenOnly: false,
      enforcedBy: "n/a",
      priority: "P0",
      title: `Vendor saves their line on a "${t.name}" round with every vendor column valid`,
      why: "The vendor-side baseline: if a correct line is refused, every vendor case is refused for the wrong reason.",
      preconditions: preBid,
      steps: ["Fill every vendor column with a valid value (quantity = requested, a price, valid values elsewhere).", "Save the line."],
      expectedResult: "The line is saved.",
      details: details(),
    });
    const cq = t.fields.find((f) => f.key === "creator_quantity");
    if (cq) {
      const e = expectFrom("unknown", "", "The vendor's change to the requested quantity is stored or ignored.");
      add({
        violation: "buyer_field_by_vendor",
        target: "bid",
        side: "vendor",
        ...e,
        enforcedBy: "unknown",
        field: fieldRef(cq),
        value: "requested+500",
        priority: "P2",
        title: `Vendor changes the buyer's column "${cq.name}" in their line`,
        why: "The requested quantity belongs to the buyer; a vendor changing it could make their offer look complete when it is not.",
        preconditions: preBid,
        steps: [`Fill the vendor line validly, but send "${cq.name}" 500 higher than the buyer asked.`, "Save the line."],
        expectedResult: e.text,
        details: details(),
      });
    }
  }

  // ── technical answers baseline ──
  if (isForm && t.fields.some((f) => f.section === "form" && f.filledBy === "vendor")) {
    const files = t.fields.filter((f) => f.section === "form" && f.filledBy === "vendor" && f.required && f.inputType === "attachment");
    add({
      violation: "positive_answer",
      target: "form-answer",
      side: "vendor",
      expected: "accept",
      screenOnly: false,
      enforcedBy: "n/a",
      priority: "P0",
      title: `Vendor submits the technical answers of "${t.name}" with every question answered`,
      why: "The vendor-side baseline: if a complete response is refused, every missing-answer case is refused for the wrong reason.",
      preconditions: preBid.replace("has started a bid", "has opened the technical round"),
      steps: ["Answer every question on every page with a valid value.", "Submit the response."],
      expectedResult: "The response is submitted.",
      details: details({ note: files.length ? `Needs a file for: ${files.map((f) => f.name).join(", ")} — file uploads are not built by this check.` : undefined }),
    });
  }

  // ── technical round structure (the form the buyer saves) ──
  if (isForm && t.fields.some((f) => f.section === "form")) {
    const structure: Array<[Violation, string, string]> = [
      ["page_no_name", "a page with no name", "Remove the name of the first page."],
      ["question_no_key", "a question with no key", "Remove the key of the first question."],
      ["question_no_filler", "a question that does not say who fills it", "Remove “who fills it” (vendor / buyer) from the first question."],
    ];
    for (const [v, what, step] of structure) {
      add({
        violation: v,
        target: "form-stage",
        side: "buyer",
        expected: "reject",
        expectMessage: "Please fill all the required fields",
        expectCode: 792,
        screenOnly: false,
        enforcedBy: "backend",
        priority: "P2",
        title: `A technical round with ${what} is refused`,
        why: "Each page needs a name and each question a key, a name and who fills it; otherwise vendors get a form nobody can answer or score.",
        preconditions: pre,
        steps: [`Add a technical (RFP) round using "${t.name}".`, step, "Save the round."],
        expectedResult: "The round is refused: “Please fill all the required fields”.",
        details: details({ code: 792, cites: ["app/services/templates/validate_service.rb:205-293"] }),
      });
    }
  }

  return out;

  // ── helpers (hoisted) ──
  function addTextInNumber(f: ModelField, v: Violation, target: Target, side: "buyer" | "vendor") {
    const by = enforcer(f, "type");
    const e = expectFrom(by, "", `The text "abc" is stored in the number column "${f.name}".`);
    add({
      violation: v,
      target,
      side,
      ...e,
      enforcedBy: by,
      field: fieldRef(f),
      value: "abc",
      priority: "P2",
      title: `${side === "buyer" ? `A ${roundWord} with` : "Vendor sends"} the text "abc" in the number column "${f.name}"`,
      why: `"${f.name}" is a ${f.kindLabel}; text there breaks totals and comparisons.`,
      preconditions: side === "buyer" ? pre : preBid,
      steps: [side === "buyer" ? `Add a ${roundWord} using "${t.name}" with "${f.name}" = "abc".` : `Fill the vendor line validly, but with "${f.name}" = "abc".`, side === "buyer" ? "Save the round." : "Save the line."],
      expectedResult: e.text,
      details: details({ cites: ruleOf(f, "type")?.cites }),
    });
  }
  function addNegative(f: ModelField, v: Violation, target: Target, side: "buyer" | "vendor") {
    const by = enforcer(f, "type");
    const e = expectFrom(by, "", `The negative value −5 is stored in "${f.name}".`);
    add({
      violation: v,
      target,
      side,
      ...e,
      enforcedBy: by,
      field: fieldRef(f),
      value: -5,
      priority: f.key === "price" ? "P1" : "P2",
      title: `${side === "buyer" ? `A ${roundWord} with` : "Vendor sends"} a negative value (−5) in "${f.name}"`,
      why: `Negative values in "${f.name}" turn totals upside down; the screen refuses them unless the column allows negatives.`,
      preconditions: side === "buyer" ? pre : preBid,
      steps: [side === "buyer" ? `Add a ${roundWord} using "${t.name}" with "${f.name}" = −5.` : `Fill the vendor line validly, but with "${f.name}" = −5.`, side === "buyer" ? "Save the round." : "Save the line."],
      expectedResult: e.text,
      details: details({ cites: ruleOf(f, "type")?.cites }),
    });
  }
  function addDecimals(f: ModelField, v: Violation, target: Target, side: "buyer" | "vendor") {
    const by = enforcer(f, "precision");
    const value = Number(`1.${"3".repeat((f.precision ?? 2) + 3)}`);
    const e = expectFrom(by, "", `The value ${value} is stored (the server may round it to ${f.precision} decimals).`);
    add({
      violation: v,
      target,
      side,
      ...e,
      enforcedBy: by,
      field: fieldRef(f),
      value,
      priority: "P3",
      title: `${side === "buyer" ? `A ${roundWord} with` : "Vendor sends"} more decimals than "${f.name}" allows (${f.precision})`,
      why: `"${f.name}" is set to ${f.precision} decimals; extra decimals change totals by rounding.`,
      preconditions: side === "buyer" ? pre : preBid,
      steps: [side === "buyer" ? `Add a ${roundWord} using "${t.name}" with "${f.name}" = ${value}.` : `Fill the vendor line validly, but with "${f.name}" = ${value}.`, side === "buyer" ? "Save the round." : "Save the line."],
      expectedResult: e.text,
      details: details({ cites: ruleOf(f, "precision")?.cites }),
    });
  }
  function addNotInOptions(f: ModelField, v: Violation, target: Target, side: "buyer" | "vendor") {
    const by = enforcer(f, "enum");
    const e = expectFrom(by, "", `"QA not an option" is stored in "${f.name}".`);
    add({
      violation: v,
      target,
      side,
      ...e,
      enforcedBy: by,
      field: fieldRef(f),
      value: "QA not an option",
      priority: "P2",
      title: `${side === "buyer" ? `A ${roundWord} with` : "Vendor sends"} a value outside the choices of "${f.name}"`,
      why: `"${f.name}" offers only ${(f.options ?? []).slice(0, 5).join(", ")}${(f.options ?? []).length > 5 ? " …" : ""}.`,
      preconditions: side === "buyer" ? pre : preBid,
      steps: [side === "buyer" ? `Add a ${roundWord} using "${t.name}" with "${f.name}" = "QA not an option".` : `Fill the vendor line validly, but with "${f.name}" = "QA not an option".`, side === "buyer" ? "Save the round." : "Save the line."],
      expectedResult: e.text,
      details: details({ cites: ruleOf(f, "enum")?.cites }),
    });
  }
  function addText(f: ModelField, v: Violation, value: string) {
    const e = expectFrom("unknown", "", `The text is stored as sent.`);
    add({
      violation: v,
      target: "stage",
      side: "buyer",
      ...e,
      enforcedBy: "unknown",
      field: fieldRef(f),
      value,
      priority: "P3",
      title: v === "unicode_text" ? `A ${roundWord} with accented, Chinese, Japanese, emoji and HTML characters in "${f.name}"` : `A ${roundWord} with a very long text (about 5,200 characters) in "${f.name}"`,
      why: v === "unicode_text" ? "Buyers type names and specifications in many scripts; the save must not crash or mangle them." : "A pasted specification can be long; the save must not crash on it.",
      preconditions: pre,
      steps: [`Add a ${roundWord} using "${t.name}" with that text in "${f.name}".`, "Save the round."],
      expectedResult: e.text,
      details: details(),
    });
  }
  function addRanges(f: ModelField, target: Target, side: "buyer" | "vendor") {
    for (const r of f.rules.filter((x) => x.kind === "range" && !x.cites)) {
      const v = r.value as { min?: number; max?: number } | undefined;
      if (!v || (v.min === undefined && v.max === undefined)) continue;
      const value = v.max !== undefined && v.max !== null ? Number(v.max) + 1 : Number(v.min) - 1;
      if (!Number.isFinite(value)) continue;
      const e = expectFrom(r.enforcedBy === "unknown" ? "screen" : r.enforcedBy, "", `The value ${value} is stored in "${f.name}".`);
      add({
        violation: "outside_range",
        target,
        side,
        ...e,
        enforcedBy: r.enforcedBy,
        field: fieldRef(f),
        value,
        priority: "P2",
        title: `${side === "buyer" ? `A ${roundWord} with` : "Vendor sends"} ${value} in "${f.name}", outside the template's limits`,
        why: `The template limits "${f.name}": ${r.plain}.`,
        preconditions: side === "buyer" ? pre : preBid,
        steps: [side === "buyer" ? `Add a ${roundWord} using "${t.name}" with "${f.name}" = ${value}.` : `Fill the vendor line validly, but with "${f.name}" = ${value}.`, side === "buyer" ? "Save the round." : "Save the line."],
        expectedResult: e.text,
        details: details({ ruleText: r.plain }),
      });
    }
  }
}

/**
 * A bounded selection for "sample" mode: the positives and template-level
 * probes always, then one case per violation kind (backend-enforced first),
 * up to `max`.
 */
export function sampleCases(cases: TemplateCase[], max = 14): TemplateCase[] {
  const always = new Set<Violation>(["opens", "positive_stage", "positive_bid", "positive_form", "positive_answer", "template_missing"]);
  const picked: TemplateCase[] = cases.filter((c) => always.has(c.violation));
  const seen = new Set<Violation>(picked.map((c) => c.violation));
  const rest = [...cases.filter((c) => !always.has(c.violation))].sort(
    (a, b) => Number(b.expected === "reject") - Number(a.expected === "reject") || a.priority.localeCompare(b.priority),
  );
  for (const c of rest) {
    if (picked.length >= max) break;
    if (seen.has(c.violation)) continue;
    seen.add(c.violation);
    picked.push(c);
  }
  return picked;
}

/** Counts for the report: per violation, per target, per expected. */
export function caseCounts(cases: TemplateCase[]) {
  const by = (k: (c: TemplateCase) => string) => cases.reduce<Record<string, number>>((a, c) => ((a[k(c)] = (a[k(c)] ?? 0) + 1), a), {});
  return { total: cases.length, byTarget: by((c) => c.target), byExpected: by((c) => c.expected), screenOnly: cases.filter((c) => c.screenOnly).length, byCatalog: by((c) => c.catalogId) };
}
