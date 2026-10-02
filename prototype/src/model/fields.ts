/**
 * Template → fields, each with machine-readable rules and one plain sentence.
 *
 * A template's real fields (not the palette of widgets that COULD be added):
 *   pricing / BOQ / service templates  widgets.inline_components   → one row per line item
 *                                      widgets.global_price_components → once per bid
 *   technical (RFP / rfi) templates    forms[] (pages) → page_headers (buyer columns)
 *                                                      + page_response_headers (vendor answers)
 * (templates_helper.rb:104-129: rfi/intake templates carry no mapped widgets;
 *  the `mapped_widgets` list of a pricing template is the addable palette.)
 *
 * The rules come from two places:
 *   - the template itself (is_required, cell_options, precision, formula,
 *     mode_type, validations, regex …), which says what the template WANTS;
 *   - the rule library (fieldRules.ts), which says who actually ENFORCES it,
 *     with the backend / dashboard file:line.
 */
import type { FieldRule, ModelField } from "./types.js";
import { libraryRulesFor, KIND_LABELS } from "./fieldRules.js";

interface RawWidget {
  key_attribute?: string;
  name?: string;
  input_type?: string;
  widget_type?: string;
  configuration?: Record<string, any>;
  date_format?: string;
  [k: string]: unknown;
}

export interface NormaliseContext {
  /** the client's usable unit symbols (lower-case) */
  unitSymbols: Set<string>;
  /** options of data-driven dropdowns, from widget_data_mappings */
  dropdownOptions: Record<string, { count: number; values: string[] }>;
}

/** Validation rule strings in stored templates lost their "<" / ">" (seen live as "base_priceu003cceil_price"). */
function readableRule(rule: unknown): string {
  return String(rule ?? "")
    .replace(/u003c/g, "<")
    .replace(/u003e/g, ">");
}

function filledBy(cfg: Record<string, any>, inputType: string): ModelField["filledBy"] {
  if (cfg.mode_type === "hidden") return "nobody";
  if (inputType === "formula" || cfg.field_type === "formula" || cfg.mode_type === "read") return "computed";
  return cfg.field_type === "participant" ? "vendor" : "buyer";
}

function optionsOf(w: RawWidget, ctx: NormaliseContext): { options?: string[]; source?: string } {
  const cfg = w.configuration ?? {};
  if (Array.isArray(cfg.cell_options) && cfg.cell_options.length) {
    return { options: cfg.cell_options.map((o: any) => String(o?.value ?? o?.key ?? o)), source: "listed in the template" };
  }
  if (Array.isArray(cfg.options) && cfg.options.length) return { options: cfg.options.map(String), source: "listed in the template" };
  const dd = typeof cfg.dropdown_data === "string" ? cfg.dropdown_data : "";
  const m = dd.match(/widget_data_mapping\?type=([^&]+)/);
  if (m) {
    let key = m[1];
    try {
      key = decodeURIComponent(m[1]);
    } catch {
      /* a literal % in the key — keep it as written */
    }
    const o = ctx.dropdownOptions[key];
    return {
      options: o?.values,
      source: o
        ? `the client's "${cfg.data_source?.name ?? key}" list (${o.count} value${o.count === 1 ? "" : "s"})`
        : `the client's "${cfg.data_source?.name ?? key}" list (not read)`,
    };
  }
  if (dd === "/api/products") return { source: "the client's product catalogue" };
  return {};
}

function sentence(f: Omit<ModelField, "plain">): string {
  const who =
    f.filledBy === "buyer" ? "The buyer fills" : f.filledBy === "vendor" ? "The vendor fills" : f.filledBy === "computed" ? "Worked out automatically:" : "Hidden —";
  const parts: string[] = [];
  if (f.filledBy === "computed") {
    parts.push(`${who} ${f.name}${f.formula ? ` = ${f.formula}` : ""}. Nobody types it.`);
  } else if (f.filledBy === "nobody") {
    parts.push(`${who} ${f.name} is in the template but not shown on the form.`);
  } else {
    parts.push(`${who} "${f.name}" (${f.kindLabel}${f.unit ? `, in ${f.unit}` : ""}${f.currency ? `, ${f.currency}` : ""}).`);
    parts.push(f.required ? "Required." : "Optional.");
  }
  if (f.options?.length) parts.push(`Allowed values: ${f.options.slice(0, 8).join(", ")}${f.options.length > 8 ? ` and ${f.options.length - 8} more` : ""}.`);
  else if (f.optionsSource) parts.push(`Values come from ${f.optionsSource}.`);
  // only a range the template itself declares (library rules carry citations and are listed separately)
  const range = f.rules.find((r) => r.kind === "range" && !r.cites);
  if (range) parts.push(range.plain.endsWith(".") ? range.plain : `${range.plain}.`);
  if (f.precision !== undefined && f.filledBy !== "computed") parts.push(`Up to ${f.precision} decimals.`);
  return parts.join(" ");
}

/** One field, from one raw widget/header. */
export function normaliseField(
  w: RawWidget,
  position: number,
  section: ModelField["section"],
  ctx: NormaliseContext,
  page?: string,
  pageType?: string,
): ModelField {
  const cfg = w.configuration ?? {};
  const inputType = String(w.input_type ?? "string");
  const key = String(w.key_attribute ?? `field_${position}`);
  const name = String(w.name ?? key).trim();
  const by = filledBy(cfg, inputType);
  const { options, source } = optionsOf(w, ctx);
  const rules: FieldRule[] = [];

  // what the template itself says
  if (by !== "computed" && by !== "nobody") {
    rules.push({
      kind: "required",
      value: !!cfg.is_required,
      plain: cfg.is_required ? `${name} must be filled` : `${name} may be left empty`,
      enforcedBy: "unknown",
    });
  }
  if (by === "computed") {
    rules.push({
      kind: "readOnly",
      value: cfg.formula ?? true,
      plain: cfg.formula ? `Calculated as ${cfg.formula}; cannot be typed` : `Read-only`,
      enforcedBy: "unknown",
    });
  }
  if (by === "nobody") rules.push({ kind: "visibility", value: "hidden", plain: `${name} is hidden on the form`, enforcedBy: "template-only" });
  if (cfg.hide_for_participant) rules.push({ kind: "visibility", value: "hidden_for_vendor", plain: `Vendors do not see ${name}`, enforcedBy: "unknown" });
  if (options?.length) rules.push({ kind: "enum", value: options, plain: `Must be one of: ${options.slice(0, 12).join(", ")}${options.length > 12 ? " …" : ""}`, enforcedBy: "unknown" });
  if (typeof cfg.precision === "number") rules.push({ kind: "precision", value: cfg.precision, plain: `At most ${cfg.precision} decimals`, enforcedBy: "unknown" });
  if (cfg.regex?.pattern) rules.push({ kind: "regex", value: cfg.regex.pattern, message: cfg.regex.message, plain: `Must match the pattern set in the template${cfg.regex.message ? ` ("${cfg.regex.message}")` : ""}`, enforcedBy: "unknown" });
  for (const v of Array.isArray(cfg.validations) ? cfg.validations : []) {
    const hasRange = v?.min_value !== undefined || v?.max_value !== undefined;
    rules.push({
      kind: hasRange ? "range" : "dependency",
      value: hasRange ? { min: v.min_value, max: v.max_value } : readableRule(v?.rule),
      message: v?.error_message,
      plain: hasRange
        ? `Between ${v.min_value ?? "−∞"} and ${v.max_value ?? "∞"}${v?.error_message ? ` ("${v.error_message}")` : ""}`
        : `${v?.error_message ?? "Must satisfy"} (${readableRule(v?.rule)})`,
      enforcedBy: "unknown",
    });
  }
  // the evaluation score of a technical page is a helper widget on the page config
  if (inputType === "number" && cfg.allow_zero_value === false) rules.push({ kind: "range", value: { min: 0, exclusive: true }, plain: "Zero is not accepted", enforcedBy: "unknown" });

  // what the code says about this kind of field (enforcer + citations)
  const lib = libraryRulesFor(key, inputType, section, by);
  for (const r of lib) {
    const same = rules.find((x) => x.kind === r.kind && x.enforcedBy === "unknown");
    if (same && r.replacesTemplateRule) {
      same.enforcedBy = r.enforcedBy;
      same.code = r.code ?? same.code;
      same.message = same.message ?? r.message;
      same.cites = r.cites;
      if (r.plainSuffix) same.plain = `${same.plain}. ${r.plainSuffix}`;
    } else if (!r.replacesTemplateRule) {
      rules.push({ kind: r.kind, plain: r.plain, enforcedBy: r.enforcedBy, code: r.code, message: r.message, value: r.value, cites: r.cites });
    }
  }

  const unit = typeof cfg.suffix === "string" && cfg.suffix && !["%"].includes(cfg.suffix) ? cfg.suffix.replace(/^\//, "") : undefined;
  if (key === "creator_quantity" && unit) {
    const ok = ctx.unitSymbols.has(unit.toLowerCase());
    rules.push({
      kind: "unit",
      value: { unit, usable: ok },
      plain: ok
        ? `The quantity unit ${unit} is one of this client's units, so the stage can be created`
        : `The default quantity unit ${unit} is NOT one of this client's units — each line item must be given one of the client's units; sending ${unit} as it is gets the stage refused ("The unit ${unit.toLowerCase()} is not present")`,
      enforcedBy: "backend",
      code: 495,
      cites: ["procol-backend app/controllers/concerns/trade_template_helper.rb:1392-1416", "procol-backend app/models/unit.rb:48-66"],
    });
  }

  const base: Omit<ModelField, "plain"> = {
    position,
    section,
    ...(page ? { page } : {}),
    key,
    name,
    inputType,
    kindLabel: KIND_LABELS[inputType] ?? inputType.replace(/_/g, " "),
    filledBy: by,
    required: by === "computed" || by === "nobody" ? false : !!cfg.is_required,
    ...(cfg.mode_type ? { mode: cfg.mode_type } : {}),
    ...(unit ? { unit } : {}),
    ...(typeof cfg.prefix === "string" && cfg.prefix ? { currency: cfg.prefix } : {}),
    ...(typeof cfg.precision === "number" ? { precision: cfg.precision } : {}),
    ...(options ? { options } : {}),
    ...(source ? { optionsSource: source } : {}),
    ...(cfg.formula ? { formula: cfg.formula } : {}),
    rules,
    details: {
      key_attribute: key,
      input_type: inputType,
      widget_type: w.widget_type,
      field_type: cfg.field_type,
      ...(pageType ? { page_type: pageType } : {}),
      configuration: cfg,
    },
  };
  return { ...base, plain: sentence(base) };
}

/** Every field of one template detail (GET /templates/:uuid). */
export function fieldsOfTemplate(detail: any, ctx: NormaliseContext): ModelField[] {
  const out: ModelField[] = [];
  let pos = 0;
  const w = detail?.widgets;
  if (w && typeof w === "object") {
    for (const x of Array.isArray(w.inline_components) ? w.inline_components : []) out.push(normaliseField(x, pos++, "line_item", ctx));
    for (const x of Array.isArray(w.global_price_components) ? w.global_price_components : []) out.push(normaliseField(x, pos++, "whole_bid", ctx));
  }
  for (const form of Array.isArray(detail?.forms) ? detail.forms : []) {
    const page = String(form?.name ?? "Page").trim();
    const type = form?.config?.type;
    for (const x of Array.isArray(form?.page_headers) ? form.page_headers : []) out.push(normaliseField(x, pos++, "form", ctx, page, type));
    for (const x of Array.isArray(form?.page_response_headers) ? form.page_response_headers : []) out.push(normaliseField(x, pos++, "form", ctx, page, type));
    // the evaluator's score box of a page (config.helper_widgets) — filled by the buyer's evaluator
    for (const h of Array.isArray(form?.config?.helper_widgets) ? form.config.helper_widgets : []) {
      const f = normaliseField(h, pos++, "form", ctx, page, type);
      f.plain = `The evaluator scores page "${page}". ${f.plain}`;
      out.push(f);
    }
  }
  return out;
}
