// Team workflows for the E2E run on RFX-2116 (all named QA_Platform AW …, test user as the only approver)
import { readFileSync, writeFileSync } from "node:fs";
import { api, errOf, uuidOf, NAME, OUT, DLF } from "./aw-lib";
const STATE = `${OUT}/e2e-fixture.json`; const S = JSON.parse(readFileSync(STATE, "utf8"));
const me = { type: "user", uuid: uuidOf(DLF.testUserId) };
const flow = (name: string, conditions: any[]) => ({ name, approval_type: "close_event_group", config: { stop_expiry_in_approval: true }, initiators: [{ type: "team", role: "member", uuid: uuidOf(DLF.teamAll), name: "All Categories" }], conditions, steps: [{ name: "Step 1", order: 0, expires_in: 86400, config: { no_of_approvals_required: false }, approvers: [me] }] });
const specs: Record<string, any[]> = {
  A: [{ key: "unit_name", values: ["12522"] }, { key: "legal_entity", values: ["DLF LIMITED"] }, { key: "department", values: ["IT"] }],   // should trigger
  B: [{ key: "department", values: ["HR"] }],                                                                                                   // only when HR
  C: [{ key: "unit_name", values: [String(DLF.hubs.kochi)] }, { key: "department", values: ["IT"] }],                                           // never (unit is The Aralias)
  D: [{ key: "form_type", values: [String(DLF.rfqTemplateId)] }, { key: "nature_of_expense", values: ["Non-budgeted without 3 quotes"] }],       // only with that nature
};
const names: Record<string, string> = { A: "E2E-A Aralias + DLF LIMITED + IT", B: "E2E-B Department HR", C: "E2E-C Kochi + IT", D: "E2E-D Capex RFQ + Non-budgeted w/o 3 quotes" };
// unit_name / form_type condition values are the hub id / template id as strings (the ids the PO form stores), not uuids
for (const k of Object.keys(S.flows || {})) { const d = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [S.flows[k].uuid] }); console.log("deleted old", k, d.status); }
S.flows = {};
for (const k of Object.keys(specs)) {
  const r = await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [flow(NAME(names[k]), specs[k])] });
  const u = r.json?.[0]?.uuid; console.log(k, r.status, errOf(r), u, NAME(names[k]));
  if (u) S.flows[k] = { uuid: u, name: NAME(names[k]) };
}
writeFileSync(STATE, JSON.stringify(S, null, 1));
console.log("bid ends at", new Date(S.bidEnd * 1000).toISOString(), "in", S.bidEnd - Math.floor(Date.now() / 1000), "s");
