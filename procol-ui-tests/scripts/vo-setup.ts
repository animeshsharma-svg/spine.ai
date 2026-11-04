/**
 * Vendor onboarding end to end on cpanel (PROCOL DEMO 198678, backend sec-api):
 * set-up — five vendor-onboarding templates with different field combinations
 * and one buyer form (the payload the Template Studio saves), and one QA
 * prospect vendor per template (invited, signed in, signed up).
 * Every name starts "QA_Platform VOE <stamp>"; every e-mail is qa_…@example.com.
 * Writes prototype/data/evidence/vo-e2e/setup.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { vendorLogin, vcall } from "./vo-vendor-login.js";

const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const API = "https://sec-api.ag-ri.in/api";
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader as string;
const STAMP = String(Date.now()).slice(-6);
async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { "access-token": tok, "app-version": "9.4.377", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t };
}
const W = (key: string, name: string, input_type: string, conf: any = {}, extra: any = {}) => ({ key_attribute: key, name, description: "", input_type, widget_type: "default", configuration: { field_type: "participant", is_required: false, mode_type: "write", ...(["dropdown", "multi_select", "radio"].includes(input_type) ? { cell_options: [] } : {}), ...conf }, ...extra });
const opts = (...l: string[]) => l.map((v, i) => ({ id: `${v.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toLowerCase()}${i}x`.slice(0, 6), value: v }));
const form = (order: number, name: string, description: string, w: any[]) => ({ order, name, description, config: { type: "form" }, page_headers: [], page_response_headers: w, evaluators: [] });
const act = (k: string, key: string, value: unknown) => ({ key_attribute: k, target: { key, value } });
const hide = (k: string) => [act(k, "mode_type", "hidden"), act(k, "is_required", false), act(k, "value", null)];
const show = (k: string) => [act(k, "mode_type", "write")];
const req = (k: string) => [act(k, "mode_type", "write"), act(k, "is_required", true)];
const optional = (k: string) => [act(k, "is_required", false)];
const rule = (key: string, comparison: string, value: unknown, actions: any[]) => ({ conditions: [{ comparison, key_attribute: key, ...(/NULL/.test(comparison) ? {} : { value }) }], logical_operator: "OR", actions });

const CONSTITUTION = opts("Proprietorship", "Partnership", "Company");
const PRODUCTS = opts("Steel", "Cement", "Electricals");
const VTYPE1 = opts("Indian", "Foreign");
const VTYPE3 = [{ id: "indian", value: "Indian" }, { id: "foreign", value: "Foreign" }, { id: "msme01", value: "MSME" }];
const CERTS = [{ id: "iso900", value: "ISO 9001" }, { id: "iso140", value: "ISO 14001" }];

const TEMPLATES: Record<string, any> = {
  T1: { title: "All field types", forms: [
    form(1, "Company profile", "Basic details of your company", [
      W("legal_name", "Legal name", "string", { is_required: true }, { description: "As printed on your GST certificate" }),
      W("business_description", "Business description", "multiline_text"),
      W("employees", "Number of employees", "number", { is_required: true }),
      W("incorporation_date", "Incorporation date", "date", { is_required: true }),
      W("constitution", "Constitution", "dropdown", { is_required: true, cell_options: CONSTITUTION }),
      W("products", "Products supplied", "multi_select", { cell_options: PRODUCTS }),
      W("vendor_type", "Vendor type", "radio", { is_required: true, cell_options: VTYPE1 }),
      W("company_brochure", "Company brochure", "attachment", {}, { file_type: "pdf" }),
    ]),
    form(2, "Contacts", "", [
      W("contact_email", "Contact email", "string", { is_required: true }),
      W("buyer_reference", "Buyer reference", "string", { mode_type: "read" }, { description: "Filled by the buyer" }),
      W("internal_code", "Internal code", "string", { mode_type: "hidden" }),
    ]),
  ], configurations: {} },
  T2: { title: "Validations", forms: [
    form(1, "Tax and bank", "", [
      W("pan", "PAN", "string", { is_required: true }, { regex: "^[A-Z]{5}[0-9]{4}[A-Z]$", validations: [{ type: "internal", check: "regex", regex: "^[A-Z]{5}[0-9]{4}[A-Z]$", error_message: "PAN must look like ABCDE1234F" }, { type: "external", validation_type: "validation_type=pan#pan_no={{pan}}" }] }),
      W("gstin", "GSTIN", "string", {}, { validations: [{ type: "internal", check: "contains", key: "gstin", compare_to_key: "pan", error_message: "GSTIN must contain the PAN" }] }),
      W("account_number", "Account number", "string", { is_required: true }),
      W("reenter_account_number", "Re-enter account number", "string", { is_required: true, disable_paste: true }, { validations: [{ type: "internal", check: "equal", key: "reenter_account_number", compare_to_key: "account_number", compare_to_path: ["value"], compare_with_path: ["value"], error_message: "Account numbers do not match" }] }),
      W("ifsc", "IFSC", "string", { is_required: true }, { validations: [{ type: "internal", check: "regex", regex: "^[A-Z]{4}0[A-Z0-9]{6}$", error_message: "IFSC must look like HDFC0001234" }] }),
      W("mobile", "Mobile number", "string", { is_required: true }, { validations: [{ type: "internal", check: "regex", regex: "^[0-9]{10}$", error_message: "Mobile must be 10 digits" }] }),
    ]),
  ], configurations: {} },
  T3: { title: "Conditional logic", forms: [
    form(1, "Vendor details", "", [
      W("vendor_type", "Vendor type", "radio", { is_required: true, cell_options: VTYPE3 }),
      W("gstin", "GSTIN", "string", { is_required: true }),
      W("udyam_number", "Udyam number", "string", { mode_type: "hidden" }),
      W("annual_turnover", "Annual turnover", "number"),
      W("company_name", "Company name", "string", { is_required: true }),
      W("cin", "CIN", "string"),
    ]),
    form(2, "Certifications", "", [
      W("certifications", "Certifications", "multi_select", { cell_options: CERTS }),
      W("iso_certificate", "ISO 9001 certificate", "attachment", {}, { file_type: "pdf" }),
      W("country", "Country", "string"),
      W("state", "State", "string"),
    ]),
  ], configurations: { conditional_block: [
    rule("vendor_type", "IS", "foreign", hide("gstin")),
    rule("vendor_type", "IS", "msme01", [...show("udyam_number"), ...req("udyam_number")]),
    rule("vendor_type", "IS NOT", "indian", req("annual_turnover")),
    rule("company_name", "CONTAINS", "Pvt", req("cin")),
    rule("certifications", "CONTAINS", "iso900", req("iso_certificate")),
    rule("country", "IS NULL", null, hide("state")),
  ] } },
  T4: { title: "Prefill and data sources", forms: [
    form(1, "Prefilled details", "Some answers come from your Procol profile", [
      W("legal_name", "Legal name", "string", { is_required: true }, { auto_fetch_hash: { object_type: "Company", key: "name" } }),
      W("company_email", "Company email", "string", {}, { auto_fetch_hash: { object_type: "Company", key: "email" } }),
      W("address", "Registered address", "multiline_text", {}, { auto_fetch_hash: { object_type: "Company", key: "address" } }),
      W("currency", "Billing currency", "dropdown", { is_required: true, dropdown_data: "/widget_data_mapping?type=currency&trade_request_uuid={{trade_request_uuid}}" }),
      W("country", "Country", "dropdown", { dropdown_data: "/widget_data_mapping?type=country_custom&trade_request_uuid={{trade_request_uuid}}", dependent_widgets: { region: { actions: [{ type: "reset", value: null }] } } }),
      W("region", "Region", "dropdown", { dropdown_data: "/widget_data_mapping?type=region_custom&trade_request_uuid={{trade_request_uuid}}" }),
      W("supplier_code", "Supplier code (written back)", "string"),
    ]),
  ], configurations: {
    auto_fetch_hash_array: [{ object_type: "Company", key: "name" }, { object_type: "Company", key: "email" }, { object_type: "Company", key: "address" }],
    entity_mappings: { supplier_code: { model: "Company", column: "misc", hash_key: "supplier_code", data_type: "hash", add_to_extended_field: false, callback_required: false } },
  } },
  T5: { title: "Three sections all required", forms: [
    form(1, "Section A", "", [W("a_name", "A name", "string", { is_required: true }), W("a_count", "A count", "number", { is_required: true })]),
    form(2, "Section B", "", [W("b_choice", "B choice", "dropdown", { is_required: true, cell_options: opts("Yes", "No") }), W("b_date", "B date", "date", { is_required: true })]),
    form(3, "Section C", "", [W("c_notes", "C notes", "multiline_text", { is_required: true }), W("c_doc", "C document", "attachment", { is_required: true })]),
  ], configurations: {} },
};

const out: any = { stamp: STAMP, tenant: 198678, templates: {}, prospects: {}, buyerForm: null };
for (const [k, t] of Object.entries(TEMPLATES)) {
  const name = `QA_Platform VOE ${STAMP} ${k} ${t.title}`;
  const r = await call("POST", "/templates", { name, template_for: ["rfi", "vendor_onboarding"], forms: t.forms, configurations: t.configurations });
  console.log("template", k, r.s, r.j?.uuid ?? r.t.slice(0, 120));
  out.templates[k] = { name, uuid: r.j?.uuid, title: t.title };
}
const BF = [["dropdown", "payment_terms_custom", "Payment Terms", "default", true, "/widget_data_mapping?type=payment_terms_custom_buyer_form"], ["string", "vendor_code_custom", "Vendor Code", "custom", true], ["date", "creation_date_custom", "Creation Date", "default", false], ["dropdown", "group_custom", "Group", "custom", true, "/widget_data_mapping?type=group_custom"], ["string", "reconciliation_gl_account_custom", "Reconciliation GL Account", "custom", false]] as const;
const bfName = `QA_Platform VOE ${STAMP} B1 Buyer form`;
const bf = await call("POST", "/templates", { name: bfName, template_for: ["vendor_onboarding_buyer_form"], configurations: {}, widgets: { global_price_components: BF.map(([input_type, key_attribute, name, widget_type, is_required, dd]) => ({ key_attribute, name, description: "", input_type, widget_type, configuration: { field_type: "participant", is_required, ...(dd ? { dropdown_data: dd } : {}) } })), inline_components: [] } });
console.log("buyer form", bf.s, bf.j?.uuid ?? bf.t.slice(0, 120)); out.buyerForm = { name: bfName, uuid: bf.j?.uuid };

for (const k of Object.keys(TEMPLATES)) {
  const email = `qa_voe_${STAMP}_${k.toLowerCase()}@example.com`, firm = `QA_Platform VOE ${STAMP} ${k} Vendor`;
  const inv = await call("POST", "/invitations/send_invite", { invite_type: "vendor_invite", firm_name: firm, name: `QA VOE ${k}`, email, category: "manufacturer", address: `QA Platform Street ${k}`, city_id: 8, skip_vendor_onboarding: false });
  let signed = false, signup = 0;
  try { const { token } = await vendorLogin(email); signed = true; const su = await vcall(token, "POST", "/v1/vendor_signup", { email, name: `QA VOE ${k}`, firm_name: `${firm} Home`, city_id: 8, address: `QA Platform Street ${k}`, terms_and_policy_accepted: true }); signup = su.s; } catch (e) { console.log("vendor login", k, (e as Error).message); }
  console.log("prospect", k, "invite", inv.s, "signed in", signed, "signup", signup);
  out.prospects[k] = { email, firm, uuid: inv.j?.company?.uuid, invite: inv.s, signup };
}
writeFileSync(`${OUT}/setup.json`, JSON.stringify(out, null, 2));
const { closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts"); await closePool();
console.log("saved setup.json");
