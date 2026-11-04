// Adds template T7 "Number rules with numeric limits" (Template Studio payload) + its QA prospect to vo-e2e/setup.json.
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
const W = (key: string, name: string, input_type: string, conf: any = {}, extra: any = {}) => ({ key_attribute: key, name, description: "", input_type, widget_type: "default", configuration: { field_type: "participant", is_required: false, mode_type: "write", ...(input_type === "radio" ? { cell_options: [] } : {}), ...conf }, ...extra });
const act = (k: string, key: string, value: unknown) => ({ key_attribute: k, target: { key, value } });
const cond = (key: string, comparison: string, value?: unknown) => ({ comparison, key_attribute: key, ...(/NULL/.test(comparison) ? {} : { value }) });
const forms = [{ order: 1, name: "Rules on numbers and AND", description: "", config: { type: "form" }, page_headers: [], evaluators: [], page_response_headers: [
  W("vendor_type", "Vendor type", "radio", { is_required: true, cell_options: [{ id: "indian", value: "Indian" }, { id: "foreign", value: "Foreign" }] }),
  W("turnover", "Annual turnover", "number"),
  W("swift_code", "SWIFT code", "string", { mode_type: "hidden" }),
  W("employees", "Number of employees", "number"),
  W("hr_policy", "HR policy reference", "string"),
] }, { order: 2, name: "Rule on a filled answer", description: "", config: { type: "form" }, page_headers: [], evaluators: [], page_response_headers: [
  W("gstin", "GSTIN (optional)", "string"),
  W("gst_certificate", "GST certificate", "attachment", {}, { file_type: "pdf" }),
] }];
const conditional_block = [
  { logical_operator: "AND", conditions: [cond("vendor_type", "IS", "foreign"), cond("turnover", "IS GREATER THAN", 1000000)], actions: [act("swift_code", "mode_type", "write"), act("swift_code", "is_required", true)] },
  { logical_operator: "OR", conditions: [cond("employees", "IS GREATER THAN", 100)], actions: [act("hr_policy", "is_required", true)] },
  { logical_operator: "OR", conditions: [cond("gstin", "IS NOT NULL")], actions: [act("gst_certificate", "is_required", true)] },
];
const name = `QA_Platform VOE ${setup.stamp} T7 Number rules with numeric limits`;
const r = await fetch("https://sec-api.ag-ri.in/api/templates", { method: "POST", headers: { "access-token": tok, "app-version": "9.4.377", "Content-Type": "application/json" }, body: JSON.stringify({ name, template_for: ["rfi", "vendor_onboarding"], forms, configurations: { conditional_block } }) });
const j: any = await r.json().catch(() => ({})); console.log("template T7", r.status, j?.uuid);
setup.templates.T7 = { name, uuid: j?.uuid, title: "Number rules with numeric limits" };
writeFileSync(`${OUT}/setup.json`, JSON.stringify(setup, null, 2));
