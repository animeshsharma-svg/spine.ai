/**
 * ClientFacts (what the API + DB returned) → ClientModel (what the platform
 * knows about this client, in plain words, with rules per field).
 */
import { createHash } from "node:crypto";
import type { ClientModel, EventUse, ModelTemplate, TemplateProblem } from "./types.js";
import { fieldsOfTemplate, type NormaliseContext } from "./fields.js";
import { useForOf, TEMPLATE_KIND_PLAIN } from "./templateUse.js";

/** Structural twin of procol test/src/model/clientFacts.ts#ClientFacts (kept loose: it crosses a project boundary). */
export type ClientFactsLike = {
  companyId: number;
  companyName: string | null;
  fetchedAt: string;
  hash: string;
  templatesByType: Record<string, { default: any[]; saved: any[]; error?: string }>;
  templateDetails: Record<string, any>;
  units: any;
  products: any;
  locations: { active: number };
  dropdownOptions: Record<string, { count: number; values: string[] }>;
  vendors: any;
  config: Record<string, unknown>;
  permissions: { count: number; sample: string[] };
  gates: Record<string, { on: boolean | null; reasons: string[] }>;
  errors: Array<{ section: string; message: string }>;
};

const SETTING_PLAIN: Record<string, (v: any) => string> = {
  rfx_project_enabled: (v) => (v ? "Events are built as projects (ERFX): one event holds RFP, RFQ and auction stages." : "Events are single-stage (not project mode)."),
  boq_in_erfx_allowed: (v) => (v ? "Bill-of-quantities (BOQ) events are allowed." : "BOQ events are not allowed."),
  allowed_maximum_line_items: (v) => (v && typeof v === "object" ? `At most ${v.non_boq ?? "?"} line items in a normal event and ${v.boq ?? "?"} in a BOQ event.` : `Line-item limit: ${JSON.stringify(v)}`),
  scheduled_events_enabled: (v) => (v ? "Recurring (scheduled) events can be set up." : "Recurring (scheduled) events are off."),
  is_material_codification_enabled: (v) => (v ? "Material codification is on: only the client's own units can be used." : "Material codification is off."),
  allow_user_to_add_uom: (v) => (v ? "Buyers may add new units of measure." : "Buyers cannot add units of measure."),
  enable_bid_masking_for_event: (v) => (v ? "Bid masking is available (vendor names can be hidden)." : "Bid masking is off."),
  lock_vendors_addition_in_event_creation: (v) => (v ? "Vendors cannot be added while creating the event." : "Vendors can be added while creating the event."),
  restrict_event_visibility_to_owner: (v) => (v ? "Only the owner sees an event." : "Team members can see events."),
  can_buyer_edit_bid: (v) => (v ? "Buyers may edit a vendor's bid after closing." : "Buyers cannot edit bids."),
  is_user_allowed_to_withdraw_project: (v) => (v ? "Users may withdraw a project." : "Users may not withdraw a project."),
  enable_template_access_filtering: (v) => (v ? "Templates are filtered by who they are shared with." : "Every buyer sees every template."),
  "db:hide_default_templates": (v) => (v ? "Procol's default templates are hidden for this client." : "Procol's default templates are offered as well."),
  "db:is_saving_configuration_mandatory": (v) => (v ? "RFQ/auction stages must carry a savings configuration (else refused, code 719)." : "A savings configuration is optional."),
};

function problemsOf(t: Omit<ModelTemplate, "problems" | "summary">, detail: any, ctx: NormaliseContext): TemplateProblem[] {
  const out: TemplateProblem[] = [];
  if (!t.opens) {
    out.push({
      plain: "Opening this template fails with a server error, so it cannot be used to build a stage.",
      severity: "blocks",
      details: { error: detail?.error },
    });
    return out;
  }
  const qty = t.fields.find((f) => f.key === "creator_quantity");
  if (qty?.unit && !ctx.unitSymbols.has(qty.unit.toLowerCase())) {
    out.push({
      plain: `Its default quantity unit "${qty.unit}" is not one of this client's units. On the screen each line item gets the product's unit or one picked from the client's list, so it can still be used there; a stage sent with "${qty.unit}" as it is (as the API test framework does today) is refused ("The unit ${qty.unit.toLowerCase()} is not present", code 495).`,
      severity: "warning",
      code: 495,
      details: { cites: ["procol-backend app/controllers/concerns/trade_template_helper.rb:1392-1416", "procol-backend app/models/unit.rb:48-66", "dashboard src/components/sheet/sheet.jsx:1957-1977", "procol test/src/config.ts:221 (quantityUnit KG)"] },
    });
  }
  if (t.useFor.some((u) => u === "rfq" || u === "auction" || u === "boq") && !t.fields.some((f) => f.key === "product")) {
    out.push({ plain: "It has no Product column; a pricing stage needs one line per product.", severity: "warning" });
  }
  if (t.useFor.includes("rfp") && t.fieldCount === 0) out.push({ plain: "It has no questions.", severity: "warning" });
  const brokenRules = t.fields.flatMap((f) => (Array.isArray((f.details.configuration as any)?.validations) ? (f.details.configuration as any).validations : [])).filter((v: any) => /u003[ce]/.test(String(v?.rule ?? "")));
  if (brokenRules.length) {
    out.push({
      plain: `${brokenRules.length} validation rule(s) are stored with a damaged comparison sign ("u003c" instead of "<"); any check that reads the rule text cannot work as written.`,
      severity: "info",
      details: { rules: brokenRules.map((v: any) => v.rule) },
    });
  }
  return out;
}

export function buildClientModel(f: ClientFactsLike): ClientModel {
  const unitSymbols = new Set<string>((f.units?.usable ?? []).map((u: any) => String(u.symbol).toLowerCase()));
  const ctx: NormaliseContext = { unitSymbols, dropdownOptions: f.dropdownOptions ?? {} };

  // one entry per template uuid, remembering every list it appeared in
  const seen = new Map<string, { item: any; listedUnder: Set<string>; isDefault: boolean }>();
  for (const [type, lists] of Object.entries(f.templatesByType)) {
    for (const item of [...(lists.default ?? []), ...(lists.saved ?? [])]) {
      const e = seen.get(item.uuid) ?? { item, listedUnder: new Set<string>(), isDefault: false };
      e.listedUnder.add(type);
      e.isDefault ||= !!item.isDefault;
      seen.set(item.uuid, e);
    }
  }

  const templates: ModelTemplate[] = [];
  for (const [uuid, { item, listedUnder, isDefault }] of seen) {
    const detail = f.templateDetails[uuid];
    const opens = !!detail && !detail.error;
    const fields = opens ? fieldsOfTemplate(detail, ctx) : [];
    const useFor: EventUse[] = useForOf({ typeIdentifier: item.typeIdentifier, orderType: item.orderType, listedUnder: [...listedUnder] });
    const base = {
      uuid,
      name: item.name,
      templateType: item.templateType,
      orderType: item.orderType ?? null,
      typeIdentifiers: item.typeIdentifier,
      listedUnder: [...listedUnder].sort(),
      useFor,
      isDefault,
      opens,
      fieldCount: fields.length,
      requiredCount: fields.filter((x) => x.required).length,
      buyerFields: fields.filter((x) => x.filledBy === "buyer").length,
      vendorFields: fields.filter((x) => x.filledBy === "vendor").length,
      computedFields: fields.filter((x) => x.filledBy === "computed").length,
      quantityUnit: fields.find((x) => x.key === "creator_quantity")?.unit,
      fields,
      updatedAt: item.updatedAt,
    };
    const problems = problemsOf(base, detail, ctx);
    const kind = useFor.map((u) => TEMPLATE_KIND_PLAIN[u]).join(" / ") || "not used for events";
    const summary = opens
      ? `${isDefault ? "Procol default" : "Client's own"} ${kind} template · ${base.fieldCount} fields (${base.buyerFields} buyer, ${base.vendorFields} vendor, ${base.computedFields} calculated)${problems.some((p) => p.severity === "blocks") ? " · cannot be used as it is" : ""}`
      : `${isDefault ? "Procol default" : "Client's own"} ${kind} template · cannot be opened`;
    templates.push({ ...base, problems, summary });
  }
  templates.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

  const usable = (f.units?.usable ?? []).map((u: any) => ({ symbol: u.symbol, name: u.name, owner: (u.companyId === null ? "procol-wide" : "client") as "client" | "procol-wide" }));
  const scope = f.units?.scope ?? {};
  const rulePlain = scope.companyOnly
    ? `Only the client's own ${scope.companyRows} units can be used (material codification ${scope.materialCodification === true ? "is on" : "is off"}, company-only units ${scope.companyOnlyUnits ? "is on" : "is off"}); Procol-wide units are not accepted.`
    : `The client's ${scope.companyRows} units plus ${scope.procolWideRows} Procol-wide unit(s) can be used.`;

  const settings = Object.entries(f.config)
    .filter(([k]) => !k.endsWith(":from"))
    .map(([key, value]) => ({ key, value, plain: SETTING_PLAIN[key]?.(value) ?? `${key.replace(/^db:/, "").replace(/_/g, " ")}: ${JSON.stringify(value)}` }));

  const findings: ClientModel["findings"] = [];
  const broken = templates.filter((t) => !t.opens);
  if (broken.length) {
    findings.push({
      plain: `${broken.length} template(s) offered in the template list cannot be opened — the server answers with an unexplained error (HTTP 500): ${broken.map((t) => `"${t.name}"`).join(", ")}.`,
      severity: "defect",
      details: { uuids: broken.map((t) => t.uuid), errors: broken.map((t) => f.templateDetails[t.uuid]?.error) },
    });
  }
  const badUnit = templates.filter((t) => t.problems.some((p) => p.code === 495));
  if (badUnit.length) {
    findings.push({
      plain: `${badUnit.length} pricing template(s) default to a quantity unit this client does not have (${[...new Set(badUnit.map((t) => t.quantityUnit))].join(", ")}), e.g. ${badUnit.slice(0, 4).map((t) => `"${t.name}"`).join(", ")}. Fine on the screen (the unit is set per line item), but an API call that keeps the default unit is refused (495) — the API test framework sends "KG" on every client.`,
      severity: "risk",
      details: { templates: badUnit.map((t) => ({ uuid: t.uuid, name: t.name, unit: t.quantityUnit })) },
    });
  }
  const pu = f.products?.productsWithUnusableUnit ?? 0;
  if (pu > 0) {
    findings.push({
      plain: `${pu} active product(s) are linked to a unit this client cannot use (${(f.products.unusableUnitLinks ?? []).map((u: any) => `${u.symbol} ×${u.products}`).join(", ")}). A line item for such a product in that unit is refused.`,
      severity: "risk",
      details: { links: f.products.unusableUnitLinks },
    });
  }

  const byType = Object.fromEntries(
    Object.entries(f.templatesByType).map(([k, v]) => [k, (v.default?.length ?? 0) + (v.saved?.length ?? 0)]),
  );
  const summary = {
    templatesByType: byType,
    templates: templates.length,
    templatesThatOpen: templates.filter((t) => t.opens).length,
    fields: templates.reduce((n, t) => n + t.fieldCount, 0),
    rules: templates.reduce((n, t) => n + t.fields.reduce((m, x) => m + x.rules.length, 0), 0),
    units: usable.length,
    products: f.products?.active ?? 0,
    invitableVendors: f.vendors?.invitable ?? 0,
    locations: f.locations?.active ?? 0,
    findings: findings.length,
  };

  const model: ClientModel = {
    companyId: f.companyId,
    companyName: f.companyName,
    fetchedAt: f.fetchedAt,
    hash: "",
    templates,
    units: {
      usable,
      count: usable.length,
      companyOnly: !!scope.companyOnly,
      rulePlain,
      defaultUnit: f.units?.defaultUnit ?? null,
      allowUserToAddUom: f.units?.allowUserToAddUom ?? null,
      unusableProductUnits: (f.products?.unusableUnitLinks ?? []).map((u: any) => ({ symbol: u.symbol, unitName: u.unitName, ownerCompanyId: u.unitOwnerCompanyId, products: u.products, sample: u.sample })),
      productsWithUnusableUnit: pu,
    },
    products: { active: f.products?.active ?? 0, activeQualities: f.products?.activeQualities ?? 0, withUnitLinks: f.products?.withUnitLinks ?? 0, sample: f.products?.sample ?? [] },
    locations: f.locations,
    vendors: {
      invitable: f.vendors?.invitable ?? 0,
      byStatus: f.vendors?.byStatus ?? {},
      allowedStatuses: f.vendors?.allowedStatuses ?? [],
      allowedStatusesFrom: f.vendors?.allowedStatusesFrom ?? "",
      qaSafe: f.vendors?.qaSafe ?? [],
    },
    settings,
    gates: f.gates,
    findings,
    errors: f.errors,
    summary: { ...summary, factsHash: f.hash },
  };
  // The version key is what the MODEL says, not the raw reply: a change in how
  // the model is built is a new version too, and a template's last-edited time alone is not.
  const { fetchedAt: _t, hash: _h, errors: _e, summary: _s, ...knowledge } = model;
  model.hash = createHash("sha256").update(canonical(knowledge)).digest("hex");
  return model;
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Plain-English differences between two models of the same client. */
export function diffModels(prev: ClientModel | null, next: ClientModel): string[] {
  if (!prev) return ["First snapshot of this client."];
  const out: string[] = [];
  const p = new Map(prev.templates.map((t) => [t.uuid, t]));
  const n = new Map(next.templates.map((t) => [t.uuid, t]));
  for (const [u, t] of n) if (!p.has(u)) out.push(`New template "${t.name}".`);
  for (const [u, t] of p) if (!n.has(u)) out.push(`Template "${t.name}" is no longer offered.`);
  for (const [u, t] of n) {
    const o = p.get(u);
    if (!o) continue;
    if (o.name !== t.name) out.push(`Template "${o.name}" was renamed to "${t.name}".`);
    const ok = new Set(o.fields.map((f) => f.key));
    const nk = new Set(t.fields.map((f) => f.key));
    const added = t.fields.filter((f) => !ok.has(f.key)).map((f) => f.name);
    const removed = o.fields.filter((f) => !nk.has(f.key)).map((f) => f.name);
    if (added.length) out.push(`"${t.name}" gained field(s): ${added.join(", ")}.`);
    if (removed.length) out.push(`"${t.name}" lost field(s): ${removed.join(", ")}.`);
    for (const f of t.fields) {
      const of = o.fields.find((x) => x.key === f.key && x.section === f.section);
      if (of && of.required !== f.required) out.push(`"${t.name}" → "${f.name}" is now ${f.required ? "required" : "optional"}.`);
    }
    if (o.opens !== t.opens) out.push(`"${t.name}" ${t.opens ? "opens again" : "no longer opens"}.`);
  }
  if (prev.units.count !== next.units.count) out.push(`Usable units went from ${prev.units.count} to ${next.units.count}.`);
  if (prev.vendors.invitable !== next.vendors.invitable) out.push(`Invitable vendors went from ${prev.vendors.invitable} to ${next.vendors.invitable}.`);
  if (prev.units.productsWithUnusableUnit !== next.units.productsWithUnusableUnit)
    out.push(`Products linked to a unit the client cannot use went from ${prev.units.productsWithUnusableUnit} to ${next.units.productsWithUnusableUnit}.`);
  const pf = new Set(prev.findings.map((f) => f.plain));
  for (const f of next.findings) if (!pf.has(f.plain)) out.push(`New finding: ${f.plain}`);
  if (prev.products.active !== next.products.active) out.push(`Active products went from ${prev.products.active} to ${next.products.active}.`);
  const ps = new Map(prev.settings.map((s) => [s.key, JSON.stringify(s.value)]));
  for (const s of next.settings) if (ps.has(s.key) && ps.get(s.key) !== JSON.stringify(s.value)) out.push(`Setting ${s.key.replace(/^db:/, "")} changed to ${JSON.stringify(s.value)}.`);
  return out.length ? out : ["The model was rebuilt with updated rules or wording; the client's data itself did not change in a tracked way."];
}
