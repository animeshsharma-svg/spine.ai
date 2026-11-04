/**
 * Template Studio — API execution of the TS_* cases (and extra API-only checks).
 *
 *   npx tsx scripts/ts-api-run.ts
 *
 * Runs against the backend behind console.ag-ri.in (sec-api) inside the client
 * company kept in .auth/console.json (support-console session: every call gets
 * client_company_uuid, as the console's appendClientId middleware does).
 * Builds payloads exactly as the studio's payload.js / gridPayload.js do.
 * Every template it creates is named "QA_Platform TS <stamp> …" and is deleted
 * at the end; it never edits or deletes a template it did not create.
 * Writes prototype/data/evidence/template-studio/api-results.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/template-studio";
mkdirSync(OUT, { recursive: true });
const cfg = JSON.parse(readFileSync(".auth/console.json", "utf8"));
const API = cfg.api as string;
const Q = `client_company_uuid=${encodeURIComponent(cfg.companyUuid)}`;
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
const NAME = (s: string) => `QA_Platform TS ${STAMP} ${s}`;
const created: string[] = [];

type Res = { status: number; json: any; text: string; ms: number };
async function call(method: string, path: string, body?: unknown, opts: { token?: string | null } = {}): Promise<Res> {
  const t0 = Date.now();
  const headers: Record<string, string> = { "app-version": "9.4.377", "Content-Type": "application/json" };
  const tok = opts.token === undefined ? cfg.accessTokenHeader : opts.token;
  if (tok) headers["access-token"] = tok;
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}${Q}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
      const text = await r.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: r.status, json, text, ms: Date.now() - t0 };
    } catch (e) {
      if (i === 2) return { status: 0, json: null, text: String((e as Error).message), ms: Date.now() - t0 };
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw new Error("unreachable");
}

// ── results ────────────────────────────────────────────────────────────────
type Verdict = "Pass" | "Fail" | "Record" | "Not run";
type Row = { id: string; layer: "API"; title: string; verdict: Verdict; checks: string[]; evidence: string[]; bug?: string };
const rows: Row[] = [];
let cur: Row | null = null;
function begin(id: string, title: string) { cur = { id, layer: "API", title, verdict: "Pass", checks: [], evidence: [] }; rows.push(cur); }
function ok(cond: boolean, what: string, failVerdict: Verdict = "Fail") {
  cur!.checks.push(`${cond ? "✔" : "✘"} ${what}`);
  if (!cond && (cur!.verdict === "Pass" || (cur!.verdict === "Record" && failVerdict === "Fail"))) cur!.verdict = failVerdict;
  return cond;
}
function note(s: string) { cur!.checks.push(`• ${s}`); }
function ev(label: string, r: Res, sent?: unknown) {
  const body = r.json ? JSON.stringify(r.json) : r.text;
  cur!.evidence.push(`${label} → HTTP ${r.status} in ${r.ms} ms${sent !== undefined ? `\n  sent: ${JSON.stringify(sent).slice(0, 600)}` : ""}\n  reply: ${body.slice(0, 700)}`);
}
function bug(s: string) { cur!.bug = s; }
function notRun(id: string, title: string, why: string) { rows.push({ id, layer: "API", title, verdict: "Not run", checks: [`• ${why}`], evidence: [] }); }

// ── payload builders (mirror payload.js / gridPayload.js) ─────────────────
const W = (key: string, name: string, input_type: string, conf: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  key_attribute: key, name, description: "", input_type, widget_type: "default",
  configuration: { field_type: "participant", is_required: false, mode_type: "write", ...(["dropdown", "multi_select", "radio"].includes(input_type) ? { cell_options: [] } : {}), ...conf },
  ...extra,
});
const form = (order: number, name: string, description: string, widgets: unknown[]) => ({ order, name, description, config: { type: "form" }, page_headers: [], page_response_headers: widgets, evaluators: [] });
const voBody = (name: string, forms: unknown[], configurations: Record<string, unknown> = {}) => ({ name, template_for: ["rfi", "vendor_onboarding"], forms, configurations });

const OPT = { ind: "vtInd1", for: "vtFor1", msme: "vtMsm1", iso9: "iso901", iso14: "iso141" };
function fullTemplate(name: string) {
  const s1 = [
    W("legal_name", "Legal name", "string", { is_required: true }, { description: "As printed on the GST certificate", regex: "^[A-Za-z0-9 .&-]+$", auto_fetch_hash: { object_type: "Company", key: "name" } }),
    W("pan", "PAN", "string", { is_required: true, disable_paste: true }, {
      regex: "^[A-Z]{5}[0-9]{4}[A-Z]$",
      validations: [
        { type: "external", validation_type: "validation_type=pan#pan_no={{pan}}" },
        { type: "internal", check: "regex", regex: "^[A-Z]{5}[0-9]{4}[A-Z]$", error_message: "PAN must look like ABCDE1234F" },
      ],
      autofill: { legal_name: { data_path: ["full_name", "value"], fetch_type: "validation" } },
    }),
    W("gstin", "GSTIN", "string", {}, {
      validations: [
        { type: "external", validation_type: "validation_type=gst#gstin={{gstin}}" },
        { type: "internal", check: "contains", key: "gstin", compare_to_key: "pan", error_message: "GSTIN must contain the PAN" },
      ],
      auto_fetch_hash: { object_type: "Company", key: "gst_no", response_type: "hash" },
    }),
    W("vendor_type", "Vendor type", "radio", { is_required: true, cell_options: [{ id: OPT.ind, value: "Indian" }, { id: OPT.for, value: "Foreign" }, { id: OPT.msme, value: "MSME" }] }),
    W("address", "Address", "multiline_text", {}, { auto_fetch_hash: { object_type: "Company", key: "address" } }),
    W("annual_turnover", "Annual turnover", "number", { disable_paste: true }, { validations: [{ type: "internal", check: "regex", regex: "^[0-9]+$", error_message: "Numbers only" }] }),
    W("incorporation_date", "Incorporation date", "date"),
  ];
  const s2 = [
    W("account_number", "Account number", "string", { is_required: true }, {
      validations: [{
        type: "external", validation_type: "validation_type=bank#bank_account_no={{account_number}}&ifsc={{ifsc}}",
        response_rules: [{ type: "cross_field_compare", source_path: "validation_data.full_name.value", reference_fields: [{ field_key: "legal_name", paths: ["legal_name", "trade_name"], match: "any", when: { field_key: "vendor_type", value: OPT.ind } }], error_msg: "Account holder must match the legal name" }],
      }],
    }),
    W("reenter_account_number", "Re-enter account number", "string", { disable_paste: true }, { validations: [{ type: "internal", check: "equal", key: "reenter_account_number", compare_to_key: "account_number", compare_to_path: ["value"], compare_with_path: ["value"], error_message: "Account numbers do not match" }] }),
    W("ifsc", "IFSC", "string"),
    W("country", "Country", "dropdown", { dropdown_data: "/widget_data_mapping?type=Country & Region&trade_request_uuid={{trade_request_uuid}}", dependent_widgets: { state: { actions: [{ type: "reset", value: null }] } } }),
    W("state", "State", "dropdown", { dropdown_data: "/widget_data_mapping?type=state&parent_key={{country}}", populate_on_select: [{ source_key: "code", target_key_attribute: "state_code" }] }),
    W("state_code", "State code", "string"),
    W("certifications", "Certifications", "multi_select", { cell_options: [{ id: OPT.iso9, value: "ISO 9001" }, { id: OPT.iso14, value: "ISO 14001" }] }),
    W("iso_certificate", "ISO certificate", "attachment", { mode_type: "hidden" }, { file_type: "pdf" }),
    W("udyam_number", "Udyam number", "string", { mode_type: "hidden" }, { validations: [{ type: "internal", check: "duplicate", model: "Company", key: "udyam_number" }] }),
  ];
  const act = (k: string, key: string, value: unknown) => ({ key_attribute: k, target: { key, value } });
  const hide = (k: string) => [act(k, "mode_type", "hidden"), act(k, "is_required", false), act(k, "value", null)];
  const conditional_block = [
    { conditions: [{ comparison: "IS", key_attribute: "vendor_type", value: OPT.for }], logical_operator: "OR", actions: [...hide("gstin")] },
    { conditions: [{ comparison: "IS", key_attribute: "vendor_type", value: OPT.msme }], logical_operator: "OR", actions: [act("udyam_number", "mode_type", "write"), act("udyam_number", "is_required", true)] },
    { conditions: [{ comparison: "CONTAINS", key_attribute: "certifications", value: OPT.iso9 }], logical_operator: "OR", actions: [act("iso_certificate", "mode_type", "write")] },
    { conditions: [{ comparison: "IS NOT NULL", key_attribute: "legal_name" }], logical_operator: "OR", actions: [act("address", "is_required", false)] },
    { conditions: [{ comparison: "IS NULL", key_attribute: "country" }], logical_operator: "OR", actions: [...hide("state")] },
    { conditions: [{ comparison: "IS NOT", key_attribute: "vendor_type", value: OPT.ind }], logical_operator: "OR", actions: [act("annual_turnover", "mode_type", "write"), act("annual_turnover", "is_required", true)] },
  ];
  const configurations = {
    conditional_block,
    auto_fetch_hash_array: [{ object_type: "Company", key: "name" }, { object_type: "Company", key: "gst_no", response_type: "hash" }, { object_type: "Company", key: "address" }],
    entity_mappings: { legal_name: { model: "Company", column: "misc", hash_key: "legal_name", data_type: "hash", add_to_extended_field: false, callback_required: false } },
    widget_mapping: { pan: ["legal_name"] },
  };
  return voBody(name, [form(1, "Company details", "Legal identity of the vendor", s1), form(2, "Bank & documents", "", s2)], configurations);
}

const BUYER_DEFAULTS: Array<[string, string, string, string, boolean, string?]> = [
  ["dropdown", "oem_non_oem_custom", "OEM / NON OEM", "default", false, "/widget_data_mapping?type=oem_non_oem_custom"],
  ["dropdown", "payment_terms_custom", "Payment Terms", "default", true, "/widget_data_mapping?type=payment_terms_custom_buyer_form"],
  ["string", "buyer_email_id_custom", "Email ID (Buyer)", "default", false],
  ["string", "buyer_alternate_email_id_custom", "Alternate Email ID (Buyer)", "default", false],
  ["string", "vendor_code_custom", "Vendor Code", "custom", false],
  ["date", "creation_date_custom", "Creation Date", "default", false],
  ["dropdown", "group_custom", "Group", "custom", true, "/widget_data_mapping?type=group_custom"],
  ["string", "reconciliation_gl_account_custom", "Reconciliation GL Account", "custom", true],
  ["dropdown", "region_custom", "Region", "custom", false, "/widget_data_mapping?type=region_custom"],
  ["dropdown", "vendor_account_group_custom", "Vendor A/C Group", "custom", true, "/widget_data_mapping?type=vendor_account_group_custom"],
  ["dropdown", "payment_method_custom", "Payment Method", "custom", false, "/widget_data_mapping?type=payment_method_custom"],
  ["dropdown", "confirmation_control_custom", "Confirmation Control", "custom", false, "/widget_data_mapping?type=confirmation_control_custom"],
  ["dropdown", "schema_group_custom", "Schema Group", "custom", false, "/widget_data_mapping?type=schema_group_custom"],
];
const buyerField = ([input_type, key_attribute, name, widget_type, req, dd]: (typeof BUYER_DEFAULTS)[number]) => ({
  key_attribute, name, description: "", input_type, widget_type,
  configuration: { field_type: "participant", is_required: req, ...(dd ? { dropdown_data: dd } : {}) },
});
const buyerBody = (name: string, fields: unknown[], extra: Record<string, unknown> = {}) => ({ name, template_for: ["vendor_onboarding_buyer_form"], configurations: {}, widgets: { global_price_components: fields, inline_components: [] }, ...extra });

// ── helpers ───────────────────────────────────────────────────────────────
const deepEq = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: any): any { return Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v; }
const widgetsOf = (t: any) => (t?.forms ?? []).flatMap((f: any) => f.page_response_headers ?? []);
const wOf = (t: any, key: string) => widgetsOf(t).find((w: any) => w.key_attribute === key);
async function create(body: any) { const r = await call("POST", "/templates", body); if (r.json?.uuid) created.push(r.json.uuid); return r; }
async function show(uuid: string) { return call("GET", `/templates/${encodeURIComponent(uuid)}`); }

// ═══════════════════════════════════ RUN ═══════════════════════════════════
console.log(`Template Studio API run ${STAMP} → ${API} as ${cfg.companyName}`);

// list + data sources
begin("TS_002", "List shows the studio's template types");
const list0 = await call("GET", "/templates"); ev("GET /templates", { ...list0, json: { saved: (list0.json?.saved ?? []).length, default: (list0.json?.default ?? []).length } as any });
const all0 = [...(list0.json?.saved ?? []), ...(list0.json?.default ?? [])];
ok(list0.status === 200 && all0.length > 0, `GET /templates answers 200 with ${all0.length} templates`);
const kinds = [...new Set(all0.flatMap((t: any) => t.template_for ?? []))].sort();
note(`template_for values present in this company: ${kinds.join(", ")} — the studio lists only vendor_onboarding, vendor_onboarding_buyer_form, po and trade; the rest are hidden by the list filter`);

begin("TS_052", "Data sources for dropdowns");
const ds = await call("GET", "/widget_data_mapping/data_sources"); const dsl = Array.isArray(ds.json) ? ds.json : ds.json?.data ?? [];
ev("GET /widget_data_mapping/data_sources", { ...ds, json: dsl.slice(0, 4) });
ok(ds.status === 200 && dsl.length > 0, `data sources answer 200 with ${dsl.length} sources`);
ok(dsl.every((s: any) => s.name && s.data_source_dropdown_url), "every source has a name and a data_source_dropdown_url (what the Data source picker shows and stores)");

// full vendor-onboarding template
begin("TS_081", "Save creates the template with the right shape (full template, 2 sections, 16 fields, 6 rules)");
const full = fullTemplate(NAME("VO full"));
const c1 = await create(full); ev("POST /templates (studio payload)", c1, { name: full.name, template_for: full.template_for, forms: `${full.forms.length} forms`, configurations: Object.keys(full.configurations) });
ok(c1.status === 200 && !!c1.json?.uuid, "create answers 200 with a uuid");
const fullUuid = c1.json?.uuid;
const got = fullUuid ? (await show(fullUuid)).json : null;
if (got) {
  ok(deepEq(got.template_for, ["rfi", "vendor_onboarding"]), `stored template_for = ${JSON.stringify(got.template_for)}`);
  ok(deepEq(got.type_identifier?.slice().sort(), ["t-rfi", "t-vendor_onboarding"]), `type_identifier = ${JSON.stringify(got.type_identifier)} (server adds the t- prefix)`);
  ok(got.forms?.length === 2, `2 sections stored (got ${got.forms?.length})`);
  ok(widgetsOf(got).length === 16, `16 fields stored (got ${widgetsOf(got).length})`);
  const sent = full.forms.flatMap((f: any) => f.page_response_headers);
  const lost = sent.filter((w: any) => !deepEq(sortKeys(w), sortKeys(wOf(got, w.key_attribute))));
  ok(lost.length === 0, lost.length ? `fields that came back different: ${lost.map((w: any) => w.key_attribute).join(", ")}` : "every field comes back exactly as sent (all settings round-trip)");
  for (const w of lost.slice(0, 4)) cur!.evidence.push(`field ${w.key_attribute}\n  sent: ${JSON.stringify(w)}\n  got:  ${JSON.stringify(wOf(got, w.key_attribute))}`);
  const lostCfg = Object.keys(full.configurations).filter((k) => !deepEq((full.configurations as any)[k], got.configurations?.[k]));
  ok(lostCfg.length === 0, lostCfg.length ? `template settings that came back different: ${lostCfg.join(", ")}` : "conditional_block, auto_fetch_hash_array, entity_mappings and widget_mapping come back exactly as sent");
  for (const k of lostCfg) cur!.evidence.push(`configurations.${k}\n  sent: ${JSON.stringify((full.configurations as any)[k]).slice(0, 500)}\n  got:  ${JSON.stringify(got.configurations?.[k]).slice(0, 500)}`);
}

// per-capability round-trip checks (each a case of the sheet)
const capCases: Array<[string, string, (g: any) => [boolean, string]]> = [
  ["TS_016", "Sections keep order, name and description", (g) => [g.forms?.[0]?.name === "Company details" && g.forms?.[0]?.description === "Legal identity of the vendor" && g.forms?.[1]?.order === 2, `sections: ${g.forms?.map((f: any) => `${f.order}. ${f.name} — "${f.description}"`).join(" | ")}`]],
  ["TS_033", "Visibility saved as mode_type", (g) => [wOf(g, "iso_certificate")?.configuration?.mode_type === "hidden" && wOf(g, "pan")?.configuration?.mode_type === "write", `iso_certificate.mode_type=${wOf(g, "iso_certificate")?.configuration?.mode_type}, pan.mode_type=${wOf(g, "pan")?.configuration?.mode_type}`]],
  ["TS_034", "Required saved as is_required", (g) => [wOf(g, "legal_name")?.configuration?.is_required === true && wOf(g, "ifsc")?.configuration?.is_required === false, `legal_name.is_required=${wOf(g, "legal_name")?.configuration?.is_required}, ifsc=${wOf(g, "ifsc")?.configuration?.is_required}`]],
  ["TS_035", "Helper text saved as the field description", (g) => [wOf(g, "legal_name")?.description === "As printed on the GST certificate", `legal_name.description="${wOf(g, "legal_name")?.description}"`]],
  ["TS_036", "Format mask saved as top-level regex", (g) => [wOf(g, "pan")?.regex === "^[A-Z]{5}[0-9]{4}[A-Z]$", `pan.regex=${wOf(g, "pan")?.regex}`]],
  ["TS_037", "Block paste saved as configuration.disable_paste", (g) => [wOf(g, "pan")?.configuration?.disable_paste === true && wOf(g, "annual_turnover")?.configuration?.disable_paste === true, `pan=${wOf(g, "pan")?.configuration?.disable_paste}, annual_turnover=${wOf(g, "annual_turnover")?.configuration?.disable_paste}`]],
  ["TS_038", "External PAN / GST validation DSL saved", (g) => [wOf(g, "pan")?.validations?.[0]?.validation_type === "validation_type=pan#pan_no={{pan}}" && wOf(g, "gstin")?.validations?.[0]?.validation_type === "validation_type=gst#gstin={{gstin}}", `pan: ${wOf(g, "pan")?.validations?.[0]?.validation_type}; gstin: ${wOf(g, "gstin")?.validations?.[0]?.validation_type}`]],
  ["TS_039", "Bank validation with two inputs saved", (g) => [/bank_account_no=\{\{account_number\}\}&ifsc=\{\{ifsc\}\}/.test(wOf(g, "account_number")?.validations?.[0]?.validation_type ?? ""), `account_number: ${wOf(g, "account_number")?.validations?.[0]?.validation_type}`]],
  ["TS_040", "Response rule (cross-field compare with 'only when') saved", (g) => [deepEq(wOf(g, "account_number")?.validations?.[0]?.response_rules, full.forms[1].page_response_headers[0].validations[0].response_rules), JSON.stringify(wOf(g, "account_number")?.validations?.[0]?.response_rules ?? null).slice(0, 300)]],
  ["TS_041", "Internal regex validation saved", (g) => [wOf(g, "pan")?.validations?.[1]?.check === "regex" && wOf(g, "pan")?.validations?.[1]?.error_message === "PAN must look like ABCDE1234F", JSON.stringify(wOf(g, "pan")?.validations?.[1])]],
  ["TS_042", "Internal 'must equal another field' saved", (g) => [wOf(g, "reenter_account_number")?.validations?.[0]?.compare_to_key === "account_number", JSON.stringify(wOf(g, "reenter_account_number")?.validations?.[0])]],
  ["TS_043", "Internal 'reject duplicate' saved", (g) => [wOf(g, "udyam_number")?.validations?.[0]?.check === "duplicate" && wOf(g, "udyam_number")?.validations?.[0]?.model === "Company", JSON.stringify(wOf(g, "udyam_number")?.validations?.[0])]],
  ["TS_044", "Internal 'contains' saved", (g) => [wOf(g, "gstin")?.validations?.[1]?.check === "contains" && wOf(g, "gstin")?.validations?.[1]?.compare_to_key === "pan", JSON.stringify(wOf(g, "gstin")?.validations?.[1])]],
  ["TS_045", "Several validations on one field keep their order", (g) => [deepEq(wOf(g, "pan")?.validations?.map((v: any) => v.type), ["external", "internal"]), `pan validations: ${JSON.stringify(wOf(g, "pan")?.validations?.map((v: any) => v.type))}`]],
  ["TS_046", "Prefill on load saved per field and as the template-level list", (g) => [deepEq(wOf(g, "gstin")?.auto_fetch_hash, { object_type: "Company", key: "gst_no", response_type: "hash" }) && (g.configurations?.auto_fetch_hash_array ?? []).length === 3, `gstin.auto_fetch_hash=${JSON.stringify(wOf(g, "gstin")?.auto_fetch_hash)}; auto_fetch_hash_array has ${(g.configurations?.auto_fetch_hash_array ?? []).length}`]],
  ["TS_047", "Autofill after validation saved with widget_mapping", (g) => [deepEq(wOf(g, "pan")?.autofill, { legal_name: { data_path: ["full_name", "value"], fetch_type: "validation" } }) && deepEq(g.configurations?.widget_mapping, { pan: ["legal_name"] }), `pan.autofill=${JSON.stringify(wOf(g, "pan")?.autofill)}; widget_mapping=${JSON.stringify(g.configurations?.widget_mapping)}`]],
  ["TS_048", "Write back to a record saved as entity_mappings", (g) => [deepEq(g.configurations?.entity_mappings, full.configurations.entity_mappings), JSON.stringify(g.configurations?.entity_mappings)]],
  ["TS_049", "Options keep their ids", (g) => [deepEq(wOf(g, "vendor_type")?.configuration?.cell_options?.map((o: any) => o.id), [OPT.ind, OPT.for, OPT.msme]), JSON.stringify(wOf(g, "vendor_type")?.configuration?.cell_options)]],
  ["TS_053", "Data source URL with {{field}} and the always-available {{trade_request_uuid}} saved as typed", (g) => [wOf(g, "country")?.configuration?.dropdown_data === full.forms[1].page_response_headers[3].configuration.dropdown_data, `country.dropdown_data=${wOf(g, "country")?.configuration?.dropdown_data}`]],
  ["TS_054", "Cascade parent saved as parent_key={{country}}", (g) => [/parent_key=\{\{country\}\}/.test(wOf(g, "state")?.configuration?.dropdown_data ?? ""), `state.dropdown_data=${wOf(g, "state")?.configuration?.dropdown_data}`]],
  ["TS_055", "Populate on select saved", (g) => [deepEq(wOf(g, "state")?.configuration?.populate_on_select, [{ source_key: "code", target_key_attribute: "state_code" }]), JSON.stringify(wOf(g, "state")?.configuration?.populate_on_select)]],
  ["TS_056", "Reset fields on change saved as dependent_widgets", (g) => [deepEq(wOf(g, "country")?.configuration?.dependent_widgets, { state: { actions: [{ type: "reset", value: null }] } }), JSON.stringify(wOf(g, "country")?.configuration?.dependent_widgets)]],
  ["TS_059", "Attachment's allowed file type saved", (g) => [wOf(g, "iso_certificate")?.file_type === "pdf", `iso_certificate.file_type=${wOf(g, "iso_certificate")?.file_type}`]],
  ["TS_062", "A Hide rule is saved as the three backend action rows", (g) => [deepEq(g.configurations?.conditional_block?.[0]?.actions?.map((a: any) => a.target.key), ["mode_type", "is_required", "value"]), JSON.stringify(g.configurations?.conditional_block?.[0]).slice(0, 400)]],
  ["TS_063", "All five comparisons saved (is, is not, is empty, is not empty, contains)", (g) => { const c = (g.configurations?.conditional_block ?? []).map((b: any) => b.conditions[0].comparison); return [["IS", "IS NOT", "IS NULL", "IS NOT NULL", "CONTAINS"].every((x) => c.includes(x)) && (g.configurations?.conditional_block ?? []).filter((b: any) => /NULL/.test(b.conditions[0].comparison)).every((b: any) => !("value" in b.conditions[0])), `comparisons stored: ${c.join(", ")}; empty / not-empty rules carry no value`]; }],
  ["TS_064", "All four effects saved (show, hide, make required, make optional)", (g) => { const a = JSON.stringify(g.configurations?.conditional_block ?? []); return [a.includes('"hidden"') && a.includes('"write"') && /"is_required","value":true/.test(a) && /"is_required","value":false/.test(a), "hidden / write / is_required true / is_required false all present"]; }],
  ["TS_057", "Multi-select 'contains' rule saved against the option id", (g) => [g.configurations?.conditional_block?.[2]?.conditions?.[0]?.value === OPT.iso9, JSON.stringify(g.configurations?.conditional_block?.[2]?.conditions)]],
  ["TS_070", "Rules across sections are kept", (g) => [g.configurations?.conditional_block?.[1]?.conditions?.[0]?.key_attribute === "vendor_type" && g.configurations?.conditional_block?.[1]?.actions?.[0]?.key_attribute === "udyam_number", "controller vendor_type (section 1) → target udyam_number (section 2)"]],
];
for (const [id, title, f] of capCases) {
  begin(id, title);
  if (!got) { cur!.verdict = "Not run"; note("the full template could not be created"); continue; }
  const [pass, what] = f(got); ok(pass, what);
}

// list shows it; TS_089 (offered in the onboarding template list) needs the event screen
begin("TS_087", "The saved template is listed with its type");
const list1 = await call("GET", "/templates"); const mine = [...(list1.json?.saved ?? [])].find((t: any) => t.uuid === fullUuid);
ok(!!mine, `the new template is in GET /templates (saved): ${mine ? `"${mine.name}", template_for ${JSON.stringify(mine.template_for)}` : "missing"}`);
note(`the list row carries forms: ${mine?.forms ? `${mine.forms.length}` : "no forms in the list reply"} — the studio's Fields column falls back to '-' when the list reply has no forms`);

// PATCH: edit label, add field, remove a rule; option rename keeps id (TS_069)
begin("TS_082", "Edit and save an existing template (rename a label, add a field, remove a rule)");
if (fullUuid) {
  const edit = JSON.parse(JSON.stringify(full));
  edit.forms[0].page_response_headers[0].name = "Legal name (registered)";
  edit.forms[1].page_response_headers.push(W("website", "Website", "string"));
  edit.configurations.conditional_block = edit.configurations.conditional_block.slice(0, 5);
  edit.forms[0].page_response_headers[3].configuration.cell_options[1].value = "Overseas";
  const p = await call("PATCH", `/templates/${fullUuid}`, edit); ev("PATCH /templates/:uuid", p, { changed: ["legal_name label", "+website field", "6 → 5 rules", "option Foreign → Overseas"] });
  ok(p.status === 200, "update answers 200");
  const g2 = (await show(fullUuid)).json;
  ok(wOf(g2, "legal_name")?.name === "Legal name (registered)", `label now "${wOf(g2, "legal_name")?.name}", key still legal_name`);
  ok(!!wOf(g2, "website"), "the added field is stored");
  ok((g2?.configurations?.conditional_block ?? []).length === 5, `rules now ${(g2?.configurations?.conditional_block ?? []).length}`);
  begin("TS_069", "Renaming an option keeps its id, so the rule still points at it");
  const opt = wOf(g2, "vendor_type")?.configuration?.cell_options?.[1];
  ok(opt?.id === OPT.for && opt?.value === "Overseas", `option now {id: ${opt?.id}, value: ${opt?.value}}`);
  ok(g2?.configurations?.conditional_block?.[0]?.conditions?.[0]?.value === OPT.for, "rule 1 still compares against the same option id");
  begin("TS_083", "Save with nothing changed");
  const p2 = await call("PATCH", `/templates/${fullUuid}`, edit); ev("PATCH with the same body", p2);
  ok(p2.status === 200, `the studio always sends the full body, so an unchanged save answers ${p2.status} (no 758 'no change')`);
} else { cur!.verdict = "Not run"; note("no template to edit"); }

// empty extra section
begin("TS_019", "A section with no fields is refused by the backend");
const emptySec = voBody(NAME("VO empty section"), [form(1, "Section 1", "", [W("name_a", "Name", "string")]), form(2, "Section 2", "", [])]);
const r19 = await create(emptySec); ev("POST /templates (section 2 has no fields)", r19);
ok(r19.status === 422 && (r19.json?.error?.code === 792 || /Invalid Form/i.test(r19.text)), `backend refuses with ${r19.status} ${r19.json?.error?.code ?? ""} "${r19.json?.error?.message ?? r19.json?.error ?? ""}"`);
if (r19.status >= 500) { const again = await create(emptySec); ev("POST again (same body)", again); note(`repeated: ${again.status} — reproducible`); bug("Saving a vendor-onboarding template that has a section with no fields crashes the server (HTTP 500 'Internal Server Error') instead of answering 422 'Invalid Form'. In the studio this surfaces as a generic failure; the user cannot tell which section is empty."); }
note("the studio's own check only needs one field in the whole template, so it sends this and shows the backend's 'Invalid Form' — see the UI run for what the user sees");

begin("TS_020", "A section with a blank name is refused");
const r20 = await create(voBody(NAME("VO blank section"), [form(1, "", "", [W("name_b", "Name", "string")])])); ev("POST /templates (section name '')", r20);
ok(r20.status === 422, `refused: ${r20.status} ${r20.json?.error?.code ?? ""} "${r20.json?.error?.message ?? r20.json?.error ?? ""}"`);
if (r20.status >= 500) bug("Saving a vendor-onboarding template whose section name is blank crashes the server (HTTP 500) instead of a clear 'section name is required' answer (the form check raises InvalidFormDataError, which is not rescued).");

begin("TS_085", "A field without field_type / key / name is refused");
for (const [what, w] of [["no configuration.field_type", { ...W("x1", "X1", "string"), configuration: { is_required: false } }], ["no key_attribute", { ...W("", "X2", "string") }], ["no name", { ...W("x3", "", "string") }]] as const) {
  const r = await create(voBody(NAME(`VO bad widget ${what}`), [form(1, "Section 1", "", [w])])); ev(`POST /templates (${what})`, r);
  ok(r.status === 422, `${what}: refused with ${r.status} ${r.json?.error?.code ?? ""} "${r.json?.error?.message ?? ""}"`);
}

begin("TS_084", "Two templates with the same name");
const dupName = NAME("VO same name");
const a1 = await create(voBody(dupName, [form(1, "Section 1", "", [W("f_a", "A", "string")])]));
const a2 = await create(voBody(dupName, [form(1, "Section 1", "", [W("f_a", "A", "string")])]));
ev("POST #1", { ...a1, json: { uuid: a1.json?.uuid } as any }); ev("POST #2 with the same name", a2);
if (a2.status === 200) { cur!.verdict = "Record"; ok(true, "both accepted — no name-uniqueness rule; the list then shows two identical names", "Record"); }
else ok(a1.status === 200 && a2.status === 422, `the second one is refused: ${a2.status} ${a2.json?.error?.code ?? ""} "${a2.json?.error?.message ?? ""}" — names are unique per company; the studio has no pre-check, so the user only learns it on Save`);

begin("TS_031", "A key with spaces and capitals typed by hand");
const r31 = await create(voBody(NAME("VO key spaces"), [form(1, "Section 1", "", [W("PAN Number", "PAN", "string")])])); ev("POST (key 'PAN Number')", r31);
cur!.verdict = "Record"; ok(r31.status === 200, `backend accepts the key as typed (${r31.status}); a {{PAN Number}} reference in a URL or validation would then never resolve — product to decide whether keys must be snake_case`, "Record");

begin("TS_029", "Two fields with the same key in one template (API)");
const r29 = await create(voBody(NAME("VO dup keys"), [form(1, "Section 1", "", [W("pan_no", "PAN", "string"), W("pan_no", "PAN again", "string")])])); ev("POST (two fields keyed pan_no)", r29);
ok(r29.status === 422, `backend ${r29.status === 200 ? "ACCEPTS" : "refuses"} duplicate keys (${r29.status}) — only the studio blocks them ('Duplicate field key: pan_no')`, "Record");
if (r29.status === 200) bug("The backend stores a vendor-onboarding template with two fields sharing one key (only the studio's own check stops it); any other caller can save a form whose answers overwrite each other.");

begin("TS_039B", "Bank validation saved with the IFSC input left empty");
const r39 = await create(voBody(NAME("VO bank no ifsc"), [form(1, "Section 1", "", [W("acc", "Account", "string", {}, { validations: [{ type: "external", validation_type: "validation_type=bank#bank_account_no={{acc}}&ifsc={{}}" }] })])])); ev("POST (ifsc={{}})", r39);
ok(r39.status === 422, `backend ${r39.status === 200 ? "accepts" : "refuses"} a bank check whose IFSC input points at no field (${r39.status})`);
if (r39.status === 200) bug("A bank-account validation can be saved with its IFSC input mapped to nothing ('ifsc={{}}'); neither the studio nor the backend refuses it, so the vendor's bank check runs without an IFSC.");

begin("TS_050", "An option with an empty label");
const r50 = await create(voBody(NAME("VO empty option"), [form(1, "Section 1", "", [W("opt_f", "Pick", "dropdown", { cell_options: [{ id: "o1", value: "" }, { id: "o2", value: "Yes" }] })])])); ev("POST (option label '')", r50);
cur!.verdict = "Record"; ok(r50.status === 200, `accepted (${r50.status}); the vendor would see an empty choice`, "Record");

begin("TS_075B", "A rule pointing at a field that does not exist (API)");
const r75 = await create(voBody(NAME("VO broken rule"), [form(1, "Section 1", "", [W("ctl", "Ctl", "radio", { cell_options: [{ id: "c1", value: "Y" }] })])], { conditional_block: [{ conditions: [{ comparison: "IS", key_attribute: "ctl", value: "c1" }], logical_operator: "OR", actions: [{ key_attribute: "ghost_field", target: { key: "mode_type", value: "hidden" } }] }] })); ev("POST (rule targets ghost_field)", r75);
ok(r75.status === 422, `backend ${r75.status === 200 ? "accepts" : "refuses"} a rule whose target field does not exist (${r75.status}) — the studio blocks it ('A rule or field references a missing field')`, "Record");

begin("TS_112", "Very long label and helper text");
const long = W("long_f", "L".repeat(200), "string", {}, { description: "H".repeat(1000) });
const r112 = await create(voBody(NAME("VO long text"), [form(1, "Section 1", "", [long])])); ev("POST (200-char label, 1000-char helper)", { ...r112, json: { uuid: r112.json?.uuid, error: r112.json?.error } as any });
if (ok(r112.status === 200, `accepted (${r112.status})`)) { const g = (await show(r112.json.uuid)).json; ok(wOf(g, "long_f")?.name?.length === 200 && wOf(g, "long_f")?.description?.length === 1000, `stored in full: label ${wOf(g, "long_f")?.name?.length} chars, helper ${wOf(g, "long_f")?.description?.length} chars`); }

begin("TS_113", "Special characters in the label");
const r113 = await create(voBody(NAME("VO special"), [form(1, "Section 1", "", [W("pan_gst_as_per_certificate_co", "PAN / GST (as per certificate) & co.", "string")])])); ev("POST (label with / ( ) & .)", r113);
if (ok(r113.status === 200, `accepted (${r113.status})`)) { const g = (await show(r113.json.uuid)).json; ok(wOf(g, "pan_gst_as_per_certificate_co")?.name === "PAN / GST (as per certificate) & co.", `label stored unchanged: "${wOf(g, "pan_gst_as_per_certificate_co")?.name}"`); }

// validation of the template itself
begin("TS_079B", "Template name empty / only spaces (API)");
let blank = 0;
for (const nm of ["", "   "]) { const r = await create(voBody(nm, [form(1, "Section 1", "", [W("n1", "N", "string")])])); ev(`POST (name ${JSON.stringify(nm)})`, { ...r, json: { uuid: r.json?.uuid, name: r.json?.name, error: r.json?.error } as any }); if (r.status === 200) blank++; ok(r.status === 422, `name ${JSON.stringify(nm)}: ${r.status === 200 ? "SAVED (200)" : `refused ${r.status} ${r.json?.error?.message ?? ""}`}`); }
if (blank) bug("The backend saves a template whose name is empty or only spaces (HTTP 200); only the studio's own check stops it, so any other caller (or an older screen) can create nameless templates that show as blank rows in Manage Templates.");

begin("TS_A01", "Unknown template_for is refused");
const ra1 = await create({ ...voBody(NAME("bad type"), [form(1, "S", "", [W("n1", "N", "string")])]), template_for: ["banana"] }); ev("POST (template_for banana)", ra1);
ok(ra1.status === 422, `refused: ${ra1.status} ${ra1.json?.error?.code ?? ""} "${ra1.json?.error?.message ?? ra1.json?.error ?? ""}"`);
if (ra1.status >= 500) bug("POST /templates with an unknown template type (template_for ['banana']) crashes the server (HTTP 500) instead of refusing it.");

begin("TS_A02", "forms sent as an object instead of a list");
const ra2 = await create({ ...voBody(NAME("forms object"), []), forms: { order: 1 } }); ev("POST (forms: {...})", ra2);
ok(ra2.status !== 0 && ra2.status < 500, `no server crash (${ra2.status} ${ra2.json?.error?.message ?? ""})`);
if (ra2.status >= 500) bug("POST /templates with forms sent as an object (not a list) crashes the server (5xx) instead of answering 'Invalid Form'.");

begin("TS_A03", "Opening a template that does not exist");
const ra3 = await show("bm90LWEtdGVtcGxhdGU="); ev("GET /templates/<unknown uuid>", ra3);
ok(ra3.status >= 400 && ra3.status < 500, `clean refusal ${ra3.status} ${ra3.json?.error?.code ?? ""} "${ra3.json?.error?.message ?? ""}"`);
const ra3b = await show("%%%garbage%%%"); ev("GET /templates/<garbled id>", ra3b);
ok(ra3b.status >= 400 && ra3b.status < 500, `garbled id: ${ra3b.status} (not a crash)`);
if (ra3.status >= 500 || ra3b.status >= 500) bug("Opening a template id that does not exist / cannot be decoded crashes the server (5xx).");

begin("TS_088", "No sign-in: list, create, edit and delete are refused");
const nt = [await call("GET", "/templates", undefined, { token: null }), await call("POST", "/templates", fullTemplate(NAME("no token")), { token: null }), await call("PATCH", `/templates/${fullUuid}`, { name: "x" }, { token: null }), await call("DELETE", `/templates/${fullUuid}`, undefined, { token: null })];
nt.forEach((r, i) => ev(["GET", "POST", "PATCH", "DELETE"][i] + " without access-token", r));
ok(nt.every((r) => r.status === 401 || r.status === 422), `all refused: ${nt.map((r) => r.status).join(", ")}`);
note("a signed-in user WITHOUT template permissions was not available in this session (the given login is a Procol employee / super admin) — the permission-denied path is not exercised here");

// buyer form
begin("TS_107", "Buyer form saved shape (13 standard fields + a custom text + a formula)");
const bfFields = [...BUYER_DEFAULTS.map(buyerField), { key_attribute: "cost_centre_custom", name: "Cost centre", description: "", input_type: "string", widget_type: "custom", configuration: { field_type: "participant", is_required: false } }, { key_attribute: "rate_custom", name: "Rate", description: "", input_type: "number", widget_type: "custom", configuration: { field_type: "participant", is_required: false } }, { key_attribute: "qty_custom", name: "Qty", description: "", input_type: "number", widget_type: "custom", configuration: { field_type: "participant", is_required: false } }, { key_attribute: "value_custom", name: "Value", description: "", input_type: "formula", widget_type: "custom", configuration: { field_type: "participant", is_required: false, formula: "rate_custom*qty_custom", mode_type: "read" } }];
const bf = buyerBody(NAME("Buyer form"), bfFields);
const rb = await create(bf); ev("POST /templates (buyer form)", rb, { name: bf.name, template_for: bf.template_for, fields: bfFields.length });
const bfUuid = rb.json?.uuid; ok(rb.status === 200 && !!bfUuid, `create answers ${rb.status}`);
const gb = bfUuid ? (await show(bfUuid)).json : null;
if (gb) {
  const gpc = gb.widgets?.global_price_components ?? gb.global_price_components ?? [];
  ok(deepEq(gb.template_for, ["vendor_onboarding_buyer_form"]), `template_for ${JSON.stringify(gb.template_for)}`);
  ok(gpc.length === bfFields.length, `${gpc.length} buyer fields stored (sent ${bfFields.length})`);
  const diffs = bfFields.filter((f: any) => { const g = gpc.find((x: any) => x.key_attribute === f.key_attribute); return !g || g.name !== f.name || g.input_type !== f.input_type || !!g.configuration?.is_required !== f.configuration.is_required || (f.configuration as any).dropdown_data !== g.configuration?.dropdown_data && (f.configuration as any).dropdown_data !== undefined; });
  ok(diffs.length === 0, diffs.length ? `fields that came back different: ${diffs.map((f: any) => f.key_attribute).join(", ")}` : "every buyer field (name, type, required, data source) comes back as sent");
  for (const f of diffs.slice(0, 3)) cur!.evidence.push(`field ${(f as any).key_attribute}\n  sent: ${JSON.stringify(f)}\n  got: ${JSON.stringify(gpc.find((x: any) => x.key_attribute === (f as any).key_attribute))}`);
  if (!gb.widgets && !gb.global_price_components) cur!.evidence.push(`GET reply keys: ${Object.keys(gb).join(", ")}`);
  begin("TS_105", "Formula field saved as the key expression");
  const fx = gpc.find((x: any) => x.key_attribute === "value_custom");
  ok(fx?.configuration?.formula === "rate_custom*qty_custom", `value_custom.formula=${fx?.configuration?.formula}`);
  begin("TS_101", "Standard buyer fields keep their fixed keys");
  ok(BUYER_DEFAULTS.every(([, k]) => gpc.some((x: any) => x.key_attribute === k)), "all 13 standard keys present");
  begin("TS_111", "Edit an existing buyer form (rename a field, flip Required)");
  const bf2 = JSON.parse(JSON.stringify(bf)); bf2.widgets.global_price_components[4].name = "Vendor Code (SAP)"; bf2.widgets.global_price_components[4].configuration.is_required = true;
  const pb = await call("PATCH", `/templates/${bfUuid}`, bf2); ev("PATCH buyer form", pb);
  const gb2 = (await show(bfUuid)).json; const vc = (gb2?.widgets?.global_price_components ?? []).find((x: any) => x.key_attribute === "vendor_code_custom");
  ok(pb.status === 200 && vc?.name === "Vendor Code (SAP)" && vc?.configuration?.is_required === true, `update ${pb.status}; vendor_code_custom now "${vc?.name}", required ${vc?.configuration?.is_required}; key unchanged`);
  begin("TS_108", "Remove and reorder standard buyer fields");
  const bf3 = JSON.parse(JSON.stringify(bf2)); const arr = bf3.widgets.global_price_components; arr.splice(12, 1); arr.unshift(arr.splice(4, 1)[0]);
  const pc = await call("PATCH", `/templates/${bfUuid}`, bf3); ev("PATCH (Schema Group removed, Vendor Code first)", pc);
  const gb3 = (await show(bfUuid)).json; const ks = (gb3?.widgets?.global_price_components ?? []).map((x: any) => x.key_attribute);
  ok(pc.status === 200 && ks[0] === "vendor_code_custom" && !ks.includes("schema_group_custom"), `order now starts with ${ks[0]}; schema_group_custom ${ks.includes("schema_group_custom") ? "still there" : "gone"}`);
} else { cur!.verdict = "Not run"; }

begin("TS_A04", "Buyer form sent without inline_components (the list the code says must always be present)");
const ra4 = await create({ name: NAME("Buyer no inline"), template_for: ["vendor_onboarding_buyer_form"], configurations: {}, widgets: { global_price_components: [buyerField(BUYER_DEFAULTS[2])] } }); ev("POST (widgets without inline_components)", ra4);
ok(ra4.status < 500 && ra4.status !== 0, `answer ${ra4.status} "${ra4.json?.error?.message ?? ""}" (a 5xx would be the crash the studio guards against)`);
if (/implicit conversion/i.test(ra4.json?.error?.message ?? "")) note("the refusal leaks a raw Ruby error text ('no implicit conversion of nil into Array') to the caller instead of a readable message");
if (ra4.status >= 500) bug("POST /templates for a buyer form without widgets.inline_components crashes the server (5xx, 'no implicit conversion of nil into Array') instead of refusing the request.");

// AI draft
begin("TS_100", "Generate with AI: the draft endpoint");
const tinyPdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
const rai = await call("POST", "/ask_ai_chats/vendor_onboarding_template_draft", { file_data: tinyPdf, file_name: "vendor-registration.pdf" }); ev("POST /ask_ai_chats/vendor_onboarding_template_draft", rai);
ok(rai.status === 200 && !!rai.json?.external_request_uuid, `the endpoint the studio calls answers ${rai.status} "${(rai.json?.error?.message ?? rai.text).slice(0, 80)}"`);
if (rai.status === 404) bug("'Generate with AI' cannot work: the studio posts to /ask_ai_chats/vendor_onboarding_template_draft but the backend behind console.ag-ri.in has no such route (404 'Route you are looking for doesn't exists'). The user sees 'Could not reach the AI service. Please try again.'");

// delete (our own) — TS_007 and twice
begin("TS_007", "Delete removes the template (API)");
const victim = created.find((u) => u !== fullUuid && u !== bfUuid);
if (victim) {
  const d1 = await call("DELETE", `/templates/${victim}`); ev("DELETE /templates/:uuid", d1);
  ok(d1.status === 200, `delete answers ${d1.status}`);
  const after = await show(victim); ev("GET after delete", after);
  ok(after.status >= 400, `the template no longer opens (${after.status})`);
  const l2 = await call("GET", "/templates"); ok(![...(l2.json?.saved ?? [])].some((t: any) => t.uuid === victim), "and it is gone from the list");
  begin("TS_A05", "Deleting the same template twice");
  const d2 = await call("DELETE", `/templates/${victim}`); ev("DELETE again", d2);
  ok(d2.status >= 400 && d2.status < 500, `second delete refused cleanly (${d2.status} ${d2.json?.error?.code ?? ""} "${d2.json?.error?.message ?? ""}")`);
  created.splice(created.indexOf(victim), 1);
}

notRun("TS_086", "Workspace on vendor onboarding v3", "M3M NOIDA is on vendor onboarding v2 (dashboard_configuration.vendor_onboarding_version = v2); a v3 company is needed.");
notRun("TS_010", "Read-only template user", "the session given is a Procol employee / super admin; no read-only user was available.");

// cleanup — only what this run created
const cleanup: string[] = [];
for (const u of created) { const d = await call("DELETE", `/templates/${u}`); cleanup.push(`${u}: ${d.status}`); }
const left = [...((await call("GET", "/templates")).json?.saved ?? [])].filter((t: any) => String(t.name).startsWith(`QA_Platform TS ${STAMP}`));
writeFileSync(`${OUT}/api-results.json`, JSON.stringify({ at: new Date().toISOString(), stamp: STAMP, api: API, company: cfg.companyName, rows, cleanup, leftovers: left.map((t: any) => t.name) }, null, 2));
const tally = rows.reduce((m: any, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
console.log(`API rows: ${rows.length}`, tally, `cleanup: ${cleanup.length} deleted, leftovers ${left.length}`);
for (const r of rows) console.log(`${r.verdict.padEnd(7)} ${r.id.padEnd(8)} ${r.title}${r.bug ? "  ⚑ BUG" : ""}\n          ${r.checks.join("\n          ")}`);
