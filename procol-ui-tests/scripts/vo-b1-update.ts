// B1 (my QA buyer form): first dropdown uses the currency data source (PROCOL DEMO has no payment-terms master data).
import { readFileSync } from "node:fs";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const tok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader;
const BF = [["dropdown", "billing_currency_custom", "Billing Currency", "custom", true, "/widget_data_mapping?type=currency"], ["string", "vendor_code_custom", "Vendor Code", "custom", true], ["date", "creation_date_custom", "Creation Date", "default", false], ["dropdown", "group_custom", "Group", "custom", true, "/widget_data_mapping?type=group_custom"], ["string", "reconciliation_gl_account_custom", "Reconciliation GL Account", "custom", false]] as const;
const body = { name: setup.buyerForm.name, template_for: ["vendor_onboarding_buyer_form"], configurations: {}, widgets: { global_price_components: BF.map(([input_type, key_attribute, name, widget_type, is_required, dd]) => ({ key_attribute, name, description: "", input_type, widget_type, configuration: { field_type: "participant", is_required, ...(dd ? { dropdown_data: dd } : {}) } })), inline_components: [] } };
const r = await fetch(`https://sec-api.ag-ri.in/api/templates/${encodeURIComponent(setup.buyerForm.uuid)}`, { method: "PUT", headers: { "access-token": tok, "app-version": "9.4.377", "Content-Type": "application/json" }, body: JSON.stringify(body) });
console.log("update B1", r.status, (await r.text()).slice(0, 200));
const c = await fetch("https://sec-api.ag-ri.in/api/widget_data_mapping?type=currency", { headers: { "access-token": tok, "app-version": "9.4.377" } }); console.log("currency options", c.status, ((await c.json()) as any[]).length);
