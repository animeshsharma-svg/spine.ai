import { readFileSync } from "node:fs";
const API = "https://sec-api.ag-ri.in/api";
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
async function call(method: string, path: string, body?: unknown, ver = "9.4.377") {
  const r = await fetch(API + path, { method, headers: { "access-token": tok, "app-version": ver, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t };
}
const W = (key: string, name: string, input_type: string, conf: any = {}, extra: any = {}) => ({ key_attribute: key, name, description: "", input_type, widget_type: "default", configuration: { field_type: "participant", is_required: false, mode_type: "write", ...(["dropdown", "multi_select", "radio"].includes(input_type) ? { cell_options: [] } : {}), ...conf }, ...extra });
const name = `QA_Platform VOE probe ${Date.now() % 1e6}`;
const t = await call("POST", "/templates", { name, template_for: ["rfi", "vendor_onboarding"], forms: [{ order: 1, name: "Company details", description: "", config: { type: "form" }, page_headers: [], page_response_headers: [W("legal_name", "Legal name", "string", { is_required: true })], evaluators: [] }], configurations: {} });
console.log("template", t.s, t.j?.uuid);
const det = await call("GET", `/templates/${t.j.uuid}`);
const vendorUuid = process.argv[2];
const now = Math.floor(Date.now() / 1000);
const body = { audience_company_uuids: [vendorUuid], configurations: { bid_start_time: now, bid_end_time: now + 7 * 86400, extra_closing_time: now + 8 * 86400, title: `[QA] Vendor Onboarding probe`, rfx_mode: "rfi", order_type: "vendor_onboarding", is_tnc_mandatory: false, template_uuid: t.j.uuid, terms_and_conditions: [] }, forms: det.j.forms };
const e = await call("POST", "/trade/create_vendor_onboarding_events", body);
console.log("create_vendor_onboarding_events", e.s, e.t.slice(0, 400));
console.log(JSON.stringify({ template: t.j.uuid }));
