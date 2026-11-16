/**
 * Approval routing — API execution on DLF Hospitality UAT (company 43386).
 *
 *   npx tsx scripts/aw-api-run.ts [--phase gd|flows|match|submit|all] [--keep]
 *
 * Fixture: the draft PO form (proposal 14728) on RFX-2112, created by the token's user.
 * Every workflow this run creates is named "QA_Platform AW <stamp> …", its only approver is the
 * token's own user (Test - Sumanta Dey), and it is deleted at the end unless --keep.
 * Values on the draft are restored to what they were at the start.
 * Results → prototype/data/evidence/approval-routing/api-results.json
 */
import { api, errOf, uuidOf, Ledger, OUT, DLF, NAME, appVersion, STAMP, sleep } from "./aw-lib";
import { writeFileSync } from "node:fs";

await appVersion();
const L = new Ledger(`${OUT}/api-results.json`);
const P = uuidOf(DLF.draftProposalId);
const GD = `/proposal/${P}/general_details`;
const phase = (() => { const i = process.argv.indexOf("--phase"); return i >= 0 ? process.argv[i + 1] : "all"; })();
const KEEP = process.argv.includes("--keep");
const want = (p: string) => phase === "all" || phase === p;

const baseline = (await api("GET", GD)).json;
if (!baseline?.is_configured) { console.log("draft not configured / not reachable", JSON.stringify(baseline).slice(0, 300)); process.exit(1); }
const BASE_VALUES = { ...baseline.values };
console.log("baseline values", BASE_VALUES);
const U = DLF.hubs;
const FULL = { form_type: "6686", unit_name: U.kochi, legal_entity: "DLF LIMITED", department: "IT", nature_of_expense: "Budgeted with 3 quotes" };
const post = (values: any) => api("POST", GD, { values });
const rec = (id: string, title: string, ok: boolean, observed: string, extra: Partial<Parameters<Ledger["put"]>[0]> = {}) =>
  L.put({ id, title, verdict: ok ? "Pass" : "Fail", observed, ...extra });

// ───────────────────────── GD: General Details API ─────────────────────────
if (want("gd")) {
  let r = await api("GET", GD);
  const f = r.json.fields as any[];
  rec("API-GD-001", "GET general_details returns the 7 configured fields in order with flags", r.status === 200 && f.length === 7 && f.map((x) => x.key).join(",") === "form_type,unit_name,legal_entity,department,nature_of_expense,sanction_note,comments" && r.json.is_condition_based_approval_routing_enabled === true && r.json.is_editable === true,
    `${r.status}; keys=${f.map((x) => x.key).join(",")}; routing=${r.json.is_condition_based_approval_routing_enabled}; editable=${r.json.is_editable}`);
  const ft = f.find((x) => x.key === "form_type");
  rec("API-GD-002", "Form Type is locked and auto-filled with the RFQ template (one option only)", ft.disabled === true && ft.is_auto_filled === true && ft.prefilled_value?.label === "DLF Capex NFA Test RFQ" && (ft.options || []).length === 1,
    `disabled=${ft.disabled} auto=${ft.is_auto_filled} prefilled=${JSON.stringify(ft.prefilled_value)} options=${(ft.options || []).length}`);
  const un = f.find((x) => x.key === "unit_name");
  rec("API-GD-003", "Unit Name is auto-filled from the PR line's location but stays editable (not locked)", un.is_auto_filled === true && un.disabled === false && un.prefilled_value?.key === U.kochi && !!un.dropdown_url,
    `auto=${un.is_auto_filled} disabled=${un.disabled} prefilled=${JSON.stringify(un.prefilled_value)} url=${un.dropdown_url}`, { expected: "PRD: an auto-filled Unit Name should ideally not be editable (optional for this release)" });
  const le = f.find((x) => x.key === "legal_entity");
  rec("API-GD-004", "Legal Entity declares Unit Name as its parent and is required", le.parent_key === "unit_name" && le.is_required === true, `parent_key=${le.parent_key} required=${le.is_required}`);
  const sn = f.find((x) => x.key === "sanction_note");
  rec("API-GD-005", "Sanction Note and Comments are optional long text", sn.input_type === "long_text" && sn.is_required === false, `type=${sn.input_type} required=${sn.is_required}`);
  for (const k of ["department", "nature_of_expense"]) { const x = f.find((y) => y.key === k); rec(`API-GD-006-${k}`, `${x.label} is a required routing dropdown with a server list`, x.is_required === true && !!x.dropdown_url, `required=${x.is_required} url=${!!x.dropdown_url}`); }

  // options endpoint
  r = await api("GET", `${GD}/unit_name/options`);
  rec("API-OPT-001", "Unit Name options = only the PR line's location (one unit)", r.status === 200 && r.json.options?.length === 1 && r.json.options[0].key === U.kochi, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  r = await api("GET", `${GD}/legal_entity/options?parent_value=${U.kochi}`);
  rec("API-OPT-002", "Legal Entity options for National Clubs -Kochi = DLF LIMITED only", r.status === 200 && r.json.options?.map((o: any) => o.key).join("|") === "DLF LIMITED", `${r.status} ${JSON.stringify(r.json.options)}`);
  r = await api("GET", `${GD}/legal_entity/options?parent_value=${U.lodhi}`);
  rec("API-OPT-003", "Legal Entity options for The Lodhi = DCHL, DLF LIMITED, LODHI PROPERTY, RIVERIA (4)", r.status === 200 && r.json.options?.length === 4, `${r.status} ${JSON.stringify(r.json.options?.map((o: any) => o.key))}`);
  r = await api("GET", `${GD}/legal_entity/options?parent_value=${U.emporio}`);
  rec("API-OPT-004", "Legal Entity options for DLF Emporio Mall = CYBERCITY, DLF LIMITED, PROPERTY DEVELOPER (3, as the PRD sheet)", r.status === 200 && r.json.options?.length === 3, `${r.status} ${JSON.stringify(r.json.options?.map((o: any) => o.key))}`);
  r = await api("GET", `${GD}/legal_entity/options?parent_value=${U.plant}`);
  rec("API-OPT-005", "Legal Entity options for 'Plant Name' (a non-DLF unit) = DLF LIMITED only; on UAT every one of the 34 units is mapped to DLF LIMITED, so the PRD's 'no options configured' state cannot be reached with this data", r.status === 200 && r.json.options?.map((o: any) => o.key).join("|") === "DLF LIMITED", `${r.status} ${JSON.stringify(r.json.options)}`, { verdict: "Record" } as any);
  r = await api("GET", `${GD}/legal_entity/options?parent_value=999999`);
  rec("API-OPT-005b", "Legal Entity options for a unit id that does not exist = empty list (never the full list)", r.status === 200 && (r.json.options || []).length === 0, `${r.status} ${JSON.stringify(r.json)}`);
  r = await api("GET", `${GD}/legal_entity/options`);
  rec("API-OPT-006", "Legal Entity options without parent_value fall back to the saved Unit Name", r.status === 200 && r.json.options?.map((o: any) => o.key).join("|") === "DLF LIMITED", `${r.status} ${JSON.stringify(r.json.options)}`);
  r = await api("GET", `${GD}/department/options?search_query=f`);
  rec("API-OPT-007", "Department options search 'f' = F&B Production only", r.status === 200 && r.json.options?.length === 1 && r.json.options[0].key === "F&B Production", `${r.status} ${JSON.stringify(r.json.options)}`);
  r = await api("GET", `${GD}/department/options?search_query=%25`);
  rec("API-OPT-008", "Department search '%' does not act as a wildcard (SQL LIKE escaped)", r.status === 200 && (r.json.options || []).length === 0, `${r.status} ${(r.json.options || []).length} options`, { expected: "0 options" });
  r = await api("GET", `${GD}/department/options?page_number=2`);
  rec("API-OPT-009", "Department page 2 is empty (10 options, 20 per page) and has_more=false", r.status === 200 && (r.json.options || []).length === 0 && r.json.has_more === false, `${r.status} ${JSON.stringify(r.json)}`);
  r = await api("GET", `${GD}/nature_of_expense/options`);
  rec("API-OPT-010", "Nature of Expense = the 4 values of the PRD sheet", r.status === 200 && r.json.options?.length === 4, `${r.status} ${JSON.stringify(r.json.options?.map((o: any) => o.key))}`);
  r = await api("GET", `${GD}/sanction_note/options`);
  rec("API-OPT-011", "Options of a long-text field = empty list (no crash)", r.status === 200 && (r.json.options || []).length === 0, `${r.status} ${r.text.slice(0, 120)}`);
  r = await api("GET", `${GD}/ghost_field/options`);
  rec("API-OPT-012", "Options of an unknown field key = empty list, not 500", r.status === 200 && (r.json.options || []).length === 0, `${r.status} ${r.text.slice(0, 120)}`);
  r = await api("GET", `${GD}/form_type/options`);
  rec("API-OPT-013", "Form Type options = the one RFQ template of the event", r.status === 200 && r.json.options?.length === 1 && r.json.options[0].key === "6686", `${r.status} ${JSON.stringify(r.json.options)}`);

  // saving values
  r = await post(FULL);
  rec("API-SAVE-001", "POST the full valid set saves and echoes the same payload as GET", r.status === 200 && JSON.stringify(r.json.values) === JSON.stringify(FULL) && Array.isArray(r.json.fields), `${r.status} ${JSON.stringify(r.json.values)}`);
  r = await post({ ...FULL, form_type: "2784" });
  rec("API-SAVE-002", "A different Form Type sent by the client is ignored: the locked value wins", r.status === 200 && r.json.values?.form_type === "6686", `${r.status} form_type=${r.json.values?.form_type}`);
  r = await post({ ...FULL, legal_entity: "LODHI PROPERTY COMPANY LIMITED" });
  rec("API-SAVE-003", "Legal Entity not mapped to the unit → 2015 'Selected Legal Entity is not valid for this proposal'", r.status === 422 && r.json?.error?.code === 2015 && /Legal Entity/.test(r.json.error.message), `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, unit_name: U.lodhi, legal_entity: "DLF LIMITED" });
  rec("API-SAVE-004", "Unit Name outside the allowed list (The Lodhi while the PR line is Kochi) → 2015 names Unit Name", r.status === 422 && r.json?.error?.code === 2015 && /Unit Name/.test(r.json.error.message), `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, department: "Finance" });
  rec("API-SAVE-005", "Department value that is not in the list (Finance) → 2015", r.status === 422 && r.json?.error?.code === 2015, `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, department: "it" });
  rec("API-SAVE-006", "Department 'it' in lower case is refused (values are exact)", r.status === 422 && r.json?.error?.code === 2015, `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, nature_of_expense: "Budgeted with 3 quotes " });
  rec("API-SAVE-007", "A trailing space on a value is trimmed and accepted", r.status === 200 && r.json.values?.nature_of_expense === "Budgeted with 3 quotes", `${r.status} ${r.json.values?.nature_of_expense ?? errOf(r)}`);
  r = await post({ form_type: "6686", unit_name: U.kochi, department: "IT", nature_of_expense: "Budgeted with 3 quotes" });
  rec("API-SAVE-008", "Leaving Legal Entity out clears it (POST replaces the whole set); save still OK", r.status === 200 && !("legal_entity" in (r.json.values || {})), `${r.status} ${JSON.stringify(r.json.values)}`);
  r = await post({ legal_entity: "DLF LIMITED", department: "IT", nature_of_expense: "Budgeted with 3 quotes" });
  rec("API-SAVE-009", "Legal Entity without a Unit Name → 2015 'Select Unit Name before Legal Entity'", r.status === 422 && r.json?.error?.code === 2015 && /Select Unit Name before Legal Entity/.test(r.json.error.message), `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, extra_field: "x", total_proposal_value: "1" });
  rec("API-SAVE-010", "Unknown keys are dropped silently", r.status === 200 && !("extra_field" in r.json.values) && !("total_proposal_value" in r.json.values), `${r.status} ${JSON.stringify(r.json.values)}`);
  r = await post({ ...FULL, sanction_note: "x".repeat(5000) });
  rec("API-SAVE-011", "Sanction Note of exactly 5,000 characters is accepted", r.status === 200 && r.json.values?.sanction_note?.length === 5000, `${r.status} len=${r.json.values?.sanction_note?.length ?? errOf(r)}`);
  r = await post({ ...FULL, sanction_note: "x".repeat(5001) });
  rec("API-SAVE-012", "Sanction Note of 5,001 characters → 2015 'Sanction Note must be at most 5000 characters'", r.status === 422 && r.json?.error?.code === 2015 && /5000/.test(r.json.error.message), `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, comments: "Rate & terms: 'single' \"double\" <b>bold</b> 50% off" });
  rec("API-SAVE-013", "Comments with &, quotes, a <b> tag and % are stored as typed", r.status === 200 && r.json.values?.comments?.includes("<b>"), `${r.status} ${JSON.stringify(r.json.values?.comments ?? errOf(r))}`);
  r = await post({ ...FULL, comments: "<script>alert(1)</script>" });
  rec("API-SAVE-013b", "Comments containing a <script> tag: the web firewall answers an HTML 403 page before the app sees it (the form would show a generic error, not a field message) — record", r.status === 403 || r.status === 200, `${r.status} ${r.status === 403 ? "HTML 403 page from the edge" : JSON.stringify(r.json.values?.comments)}`, { verdict: "Record" } as any);
  r = await post({ ...FULL, department: ["IT", "HR"] });
  rec("API-SAVE-014", "An array as a dropdown value is refused (2015), not saved", r.status === 422, `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, department: { key: "IT" } });
  rec("API-SAVE-015", "An object as a dropdown value is refused, not saved", r.status === 422, `${r.status} ${errOf(r)}`);
  r = await api("POST", GD, { values: "IT" });
  rec("API-SAVE-016", "values that is not an object: no 500", r.status !== 500, `${r.status} ${errOf(r)}`);
  r = await api("POST", GD, {});
  rec("API-SAVE-017", "POST with no values clears every optional/routing field (documented behaviour) or refuses — record", r.status !== 500, `${r.status} ${JSON.stringify(r.json?.values ?? r.json).slice(0, 200)}`, { verdict: r.status === 500 ? "Fail" : "Record" } as any);
  r = await post({ ...FULL, department: "IT'; drop table proposals;--" });
  rec("API-SAVE-018", "SQL-looking value is just an invalid option (2015)", r.status === 422 && r.json?.error?.code === 2015, `${r.status} ${errOf(r)}`);
  r = await post({ ...FULL, unit_name: `${U.kochi}` , legal_entity: "dlf limited" });
  rec("API-SAVE-019", "Legal Entity in lower case is refused (exact match on the WDM value)", r.status === 422 && r.json?.error?.code === 2015, `${r.status} ${errOf(r)}`);

  // permissions
  r = await api("GET", GD, undefined, { token: null });
  rec("API-PERM-001", "GET general_details without a token is refused (the app's standard reply: 422 code 2 'Insufficient parameters')", r.status === 401 || (r.status === 422 && r.json?.error?.code === 2), `${r.status} ${r.text.slice(0, 80)}`);
  r = await api("POST", GD, { values: FULL }, { token: null });
  rec("API-PERM-002", "POST general_details without a token is refused (422 code 2)", r.status === 401 || (r.status === 422 && r.json?.error?.code === 2), `${r.status} ${r.text.slice(0, 80)}`);
  const submitted = uuidOf(14739); // RFX-2114 proposal, requested, created by another user
  r = await api("GET", `/proposal/${submitted}/general_details`);
  rec("API-PERM-003", "GET general_details of another user's submitted proposal: is_editable=false and values readable", r.status === 200 && r.json.is_editable === false && !!r.json.values?.unit_name, `${r.status} editable=${r.json?.is_editable} values=${JSON.stringify(r.json?.values).slice(0, 120)}`);
  r = await api("POST", `/proposal/${submitted}/general_details`, { values: FULL });
  rec("API-PERM-004", "POST general_details on a submitted proposal → refused with 2 (not a draft / not the creator)", r.status === 422 && r.json?.error?.code === 2, `${r.status} ${errOf(r)}`);
  r = await api("GET", `/proposal/${submitted}/general_details/department/options`);
  rec("API-PERM-005", "Options of a submitted proposal → refused with 2", r.status === 422 && r.json?.error?.code === 2, `${r.status} ${errOf(r)}`);
  r = await api("GET", `/proposal/${uuidOf(99999999)}/general_details`);
  rec("API-PERM-006", "Unknown proposal → 2, not 500", r.status === 422 && r.json?.error?.code === 2, `${r.status} ${errOf(r)}`);
  r = await api("GET", `/proposal/not-a-uuid/general_details`);
  rec("API-PERM-007", "Garbage uuid → 4xx, not 500", r.status < 500, `${r.status} ${errOf(r)}`);

  // proposal payload
  r = await post(FULL);
  r = await api("GET", `/proposal/${P}`);
  const gd = r.json?.general_details as any[];
  rec("API-GD-007", "GET /proposal shows general_details with value labels (unit name, template name)", Array.isArray(gd) && gd.find((x) => x.key === "unit_name")?.value_label === "National Clubs -Kochi" && gd.find((x) => x.key === "form_type")?.value_label === "DLF Capex NFA Test RFQ", JSON.stringify(gd).slice(0, 300));
}

// ───────────────────────── FLOWS: approval workflow API ─────────────────────────
const made: string[] = [];
const me = { type: "user", uuid: uuidOf(DLF.testUserId) };
const teamUuid = uuidOf(DLF.teamAll);
function flow(name: string, conditions: Array<{ key: string; values: any[] }>, o: { role?: string; approvers?: any[]; expires?: number; stopExpiry?: boolean; extraSteps?: any[]; type?: string } = {}) {
  return {
    name, approval_type: o.type ?? "close_event_group",
    config: { stop_expiry_in_approval: o.stopExpiry ?? true },
    initiators: [{ type: "team", role: o.role ?? "member", uuid: teamUuid, name: "All Categories" }],
    conditions,
    steps: [{ name: "Step 1", order: 0, expires_in: o.expires ?? 86400, config: { no_of_approvals_required: false }, approvers: o.approvers ?? [me] }, ...(o.extraSteps ?? [])],
  };
}
async function create(f: any) { const r = await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [f] }); const u = r.json?.[0]?.uuid; if (u) made.push(u); return { r, uuid: u as string | undefined }; }
async function createdFlow(uuid: string) { const r = await api("GET", `/approval_workflow/approval_flows/${uuid}`); return r.json; }

if (want("flows")) {
  // happy path: one condition, "is any of" two values
  let { r, uuid } = await create(flow(NAME("F1 unit Lodhi/Camellias"), [{ key: "unit_name", values: [U.lodhi, U.camellias] }]));
  rec("API-FLW-001", "Create a Bid Proposal workflow with Unit Name is any of The Lodhi, The Camellias", r.status === 200 && !!uuid, `${r.status} ${uuid ?? errOf(r)}`);
  if (uuid) { const d = await createdFlow(uuid); const c = d?.conditions?.find((x: any) => x.key === "unit_name"); rec("API-FLW-002", "The saved condition keeps both values with their labels", c?.values?.length === 2 && c.values.some((v: any) => v.label === "The Lodhi"), JSON.stringify(c).slice(0, 300)); }
  // all five routing conditions + PO value
  ({ r, uuid } = await create(flow(NAME("F2 five fields + value"), [
    { key: "form_type", values: ["6686"] }, { key: "unit_name", values: [U.kochi] }, { key: "legal_entity", values: ["DLF LIMITED"] },
    { key: "department", values: ["IT"] }, { key: "nature_of_expense", values: ["Budgeted with 3 quotes"] }, { key: "total_proposal_value", values: [1, 100000] },
  ])));
  rec("API-FLW-003", "Create a workflow with all five routing conditions plus Total Proposal Value 1–1,00,000", r.status === 200 && !!uuid, `${r.status} ${uuid ?? errOf(r)}`);
  // unmapped combination (nesting not respected by the builder)
  ({ r, uuid } = await create(flow(NAME("F3 unmapped unit+entity"), [{ key: "unit_name", values: [U.kochi] }, { key: "legal_entity", values: ["LODHI PROPERTY COMPANY LIMITED"] }])));
  rec("API-FLW-004", "A workflow with Unit Kochi + Legal Entity LODHI PROPERTY (a pair no PO can ever have) is accepted without warning", r.status === 200, `${r.status} ${uuid ?? errOf(r)} — PRD asked the value picker to respect nesting and warn on overlap; the PR dropped both`, { verdict: r.status === 200 ? "Record" : "Pass" } as any);
  // value not in the catalogue
  ({ r, uuid } = await create(flow(NAME("F4 ghost value"), [{ key: "department", values: ["Finance"] }])));
  rec("API-FLW-005", "A condition value that is not in the catalogue (Department = Finance) is refused", r.status !== 200, `${r.status} ${uuid ?? errOf(r)}`, { expected: "refused; it can never match a PO" });
  // unknown condition key
  ({ r, uuid } = await create(flow(NAME("F5 unknown key"), [{ key: "colour", values: ["red"] }])));
  rec("API-FLW-006", "A condition with an unknown key is refused or dropped (no 500)", r.status !== 500, `${r.status} ${uuid ? "saved uuid " + uuid : errOf(r)}`, { verdict: r.status === 500 ? "Fail" : r.status === 200 ? "Record" : "Pass" } as any);
  if (uuid) { const d = await createdFlow(uuid); rec("API-FLW-006b", "…and if saved, the unknown condition is not part of the workflow", (d?.conditions || []).every((c: any) => c.key !== "colour"), JSON.stringify(d?.conditions).slice(0, 200)); }
  // empty values
  ({ r, uuid } = await create(flow(NAME("F6 empty values"), [{ key: "unit_name", values: [] }])));
  rec("API-FLW-007", "A condition with an empty value list is refused or ignored (never a workflow that matches nothing silently)", r.status !== 500, `${r.status} ${uuid ? "saved " + uuid : errOf(r)}`, { verdict: r.status === 500 ? "Fail" : "Record" } as any);
  if (uuid) { const d = await createdFlow(uuid); rec("API-FLW-007b", "…rule saved for an empty value list", true, `conditions=${JSON.stringify(d?.conditions).slice(0, 200)}`, { verdict: "Record" } as any); }
  // duplicate condition key twice
  ({ r, uuid } = await create(flow(NAME("F7 same key twice"), [{ key: "department", values: ["IT"] }, { key: "department", values: ["HR"] }])));
  rec("API-FLW-008", "The same condition sent twice in one workflow is refused (uniqueness per workflow)", r.status === 422, `${r.status} ${uuid ?? errOf(r)}`);
  // no steps
  r = (await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [{ ...flow(NAME("F8 no steps"), []), steps: [] }] }));
  rec("API-FLW-009", "A workflow without any step is refused ('Approval flow steps can't be blank')", r.status === 422 && /step/i.test(r.text), `${r.status} ${errOf(r)}`);
  // step without approvers
  r = (await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [{ ...flow(NAME("F9 no approvers"), []), steps: [{ name: "S", order: 0, expires_in: 86400, config: {}, approvers: [] }] }] }));
  rec("API-FLW-010", "A step with no approvers is refused", r.status === 422, `${r.status} ${errOf(r)}`);
  // approver from another company
  r = (await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [flow(NAME("F10 foreign approver"), [], { approvers: [{ type: "user", uuid: uuidOf(715) }] })] }));
  rec("API-FLW-011", "An approver who is not a user of this company is dropped → step has no approvers → refused", r.status === 422, `${r.status} ${errOf(r)} ${r.json?.[0]?.uuid ? "SAVED " + r.json[0].uuid : ""}`);
  if (r.json?.[0]?.uuid) made.push(r.json[0].uuid);
  // duplicate name allowed?
  ({ r, uuid } = await create(flow(NAME("F1 unit Lodhi/Camellias"), [{ key: "unit_name", values: [U.lodhi] }])));
  rec("API-FLW-012", "Two workflows with the same name are allowed (names are not unique) — record", r.status !== 500, `${r.status} ${uuid ?? errOf(r)}`, { verdict: "Record" } as any);
  // blank name
  ({ r, uuid } = await create(flow("", [{ key: "department", values: ["IT"] }])));
  rec("API-FLW-013", "A workflow with no name saves (name is optional in the builder)", r.status === 200, `${r.status} ${uuid ?? errOf(r)}`);
  // expires 0
  ({ r, uuid } = await create(flow(NAME("F13 expiry 0"), [], { expires: 0 })));
  rec("API-FLW-014", "Approval duration 0 seconds is refused", r.status === 422, `${r.status} ${uuid ? "saved " + uuid : errOf(r)}`);
  // negative expiry
  ({ r, uuid } = await create(flow(NAME("F14 expiry -1"), [], { expires: -3600 })));
  rec("API-FLW-015", "A negative approval duration is refused", r.status === 422, `${r.status} ${uuid ? "saved " + uuid : errOf(r)}`);
  // wrong approval type
  ({ r, uuid } = await create(flow(NAME("F15 wrong type"), [{ key: "department", values: ["IT"] }], { type: "banana" })));
  rec("API-FLW-016", "An unknown approval type is refused", r.status === 422, `${r.status} ${uuid ? "saved " + uuid : errOf(r)}`);
  // routing conditions on a non-proposal approval type
  ({ r, uuid } = await create(flow(NAME("F16 GD on Event Creation"), [{ key: "department", values: ["IT"] }], { type: "create_trade" })));
  rec("API-FLW-017", "Department (a PO-form field) can be attached to an Event Creation workflow, where no PO form exists — record", r.status !== 500, `${r.status} ${uuid ? "saved " + uuid : errOf(r)}`, { verdict: r.status === 200 ? "Record" : "Pass" } as any);
  // PO value range reversed
  ({ r, uuid } = await create(flow(NAME("F17 reversed range"), [{ key: "total_proposal_value", values: [100000, 1] }])));
  rec("API-FLW-018", "Total Proposal Value max smaller than min is refused", r.status === 422, `${r.status} ${uuid ? "saved " + uuid : errOf(r)}`);
  // conditions catalogue
  r = await api("GET", "/approval_workflow/approval_flows/conditions");
  const cats = r.json as any[];
  const keys = cats.map((c) => c.key);
  rec("API-CAT-001", "Conditions catalogue lists the five routing fields, named '<Label> - DLF PO - General Details (Test)'", ["form_type", "unit_name", "legal_entity", "department", "nature_of_expense"].every((k) => keys.includes(k)) && cats.find((c) => c.key === "unit_name")?.name === "Unit Name - DLF PO - General Details (Test)", keys.join(","));
  const un = cats.find((c) => c.key === "unit_name");
  const unLabels = (un?.values || []).map((v: any) => v.label);
  rec("API-CAT-002", "Unit Name condition offers every active buyer hub (34), including '-', 'Free Text', 'Plant Name', 'Project BOQ team', 'AMBUJA NEOTIA' and two 'DLF Golf and Country Club'", un?.values?.length === 34 && unLabels.includes("-") && unLabels.filter((l: string) => l === "DLF Golf and Country Club").length === 2,
    `${un?.values?.length} values; odd: ${unLabels.filter((l: string) => ["-", "Free Text", "Plant Name", "Project BOQ team", "AMBUJA NEOTIA"].includes(l)).join(", ")}`, { verdict: "Record" } as any);
  const ft = cats.find((c) => c.key === "form_type");
  rec("API-CAT-003", "Form Type condition offers 29 RFQ templates (BOQ, Buy, Tender… ) — not the PRD's six form types", ft?.values?.length === 29, `${ft?.values?.length} values: ${(ft?.values || []).slice(0, 6).map((v: any) => v.label).join(", ")}…`, { verdict: "Record" } as any);
  const le = cats.find((c) => c.key === "legal_entity");
  rec("API-CAT-004", "Legal Entity condition values carry parent_values (unit ids) for nesting", (le?.values || []).some((v: any) => Array.isArray(v.parent_values) && v.parent_values.length), JSON.stringify((le?.values || []).find((v: any) => v.label === "LODHI PROPERTY COMPANY LIMITED")).slice(0, 200));
  rec("API-CAT-005", "Legal Entity ATRIUM PLACE DEVELOPERS has no parent unit (PRD maps it to APPDL-THAP, a unit that does not exist on UAT)", !((le?.values || []).find((v: any) => v.label === "ATRIUM PLACE DEVELOPERS PRIVATE LIMITED")?.parent_values), JSON.stringify((le?.values || []).find((v: any) => v.label === "ATRIUM PLACE DEVELOPERS PRIVATE LIMITED")), { verdict: "Record" } as any);
}

// ───────────────────────── MATCH: who matches what (GET approval_workflows, no side effects) ─────────────────────────
const matchNames = async () => { const r = await api("GET", `/proposal/${P}/approval_workflows`); return { r, names: (r.json || []).map((f: any) => f.name) as string[] }; };
if (want("match")) {
  const mk = async (label: string, conds: any[], o: any = {}) => { const { r, uuid } = await create(flow(NAME(label), conds, o)); if (!uuid) console.log("create failed", label, errOf(r)); return NAME(label); };
  const nIT = await mk("M1 dept IT", [{ key: "department", values: ["IT"] }]);
  const nHR = await mk("M2 dept HR", [{ key: "department", values: ["HR"] }]);
  const nITorHR = await mk("M3 dept IT or HR", [{ key: "department", values: ["IT", "HR"] }]);
  const nKochiIT = await mk("M4 Kochi and IT", [{ key: "unit_name", values: [U.kochi] }, { key: "department", values: ["IT"] }]);
  const nLodhiIT = await mk("M5 Lodhi and IT", [{ key: "unit_name", values: [U.lodhi] }, { key: "department", values: ["IT"] }]);
  const nAdmin = await mk("M6 IT initiator admin", [{ key: "department", values: ["IT"] }], { role: "admin" });
  const nValue = await mk("M7 IT and value 1-5000", [{ key: "department", values: ["IT"] }, { key: "total_proposal_value", values: [1, 5000] }]);
  const nValue2 = await mk("M8 IT and value 5000-20000", [{ key: "department", values: ["IT"] }, { key: "total_proposal_value", values: [5000, 20000] }]);
  const nNone = await mk("M9 no conditions", []);
  const nForm = await mk("M10 form type Capex", [{ key: "form_type", values: ["6686"] }]);
  const nFormOther = await mk("M11 form type Buy Template", [{ key: "form_type", values: ["2784"] }]);
  const nEnt = await mk("M12 entity DCHL", [{ key: "legal_entity", values: ["DLF CLUB AND HOSPITALITY LIMITED"] }]);
  await sleep(500);
  await post(FULL); // IT, Kochi, DLF LIMITED, Budgeted with 3 quotes; proposal value 9,000
  let { r, names } = await matchNames();
  const has = (n: string) => names.includes(n);
  rec("API-MAT-001", "Department = IT → the IT workflow matches; HR does not", has(nIT) && !has(nHR), names.join(" | "));
  rec("API-MAT-002", "'IT or HR' (OR within a field) matches a Department IT PO", has(nITorHR), names.join(" | "));
  rec("API-MAT-003", "Unit Kochi AND Department IT (AND across fields) matches; Unit Lodhi AND IT does not", has(nKochiIT) && !has(nLodhiIT), names.join(" | "));
  rec("API-MAT-004", "A workflow whose initiators are team Admins is not offered to a Member initiator", !has(nAdmin), `${names.join(" | ")} — the test user is a Member of All Categories`);
  rec("API-MAT-005", "PO value 9,000: 'IT and value 5,000–20,000' matches, 'IT and value 1–5,000' does not", has(nValue2) && !has(nValue), names.join(" | "));
  rec("API-MAT-006", "A workflow with no condition matches any PO", has(nNone), names.join(" | "));
  rec("API-MAT-007", "Form Type = this event's RFQ template matches; a different template does not", has(nForm) && !has(nFormOther), names.join(" | "));
  rec("API-MAT-008", "Legal Entity DCHL does not match a PO with DLF LIMITED", !has(nEnt), names.join(" | "));
  rec("API-MAT-009", "While a team workflow matches, the company-level catch-all 'test' workflow is NOT offered (team flows win)", !names.includes("test"), names.join(" | "));
  rec("API-MAT-010", "The pre-existing team workflows for Admin initiators (GD Test – CAPEX…) are not offered to this Member", !names.some((n) => n.startsWith("GD Test - CAPEX")), names.join(" | "));
  // change department → HR
  await post({ ...FULL, department: "HR" });
  ({ r, names } = await matchNames());
  rec("API-MAT-011", "After changing Department to HR the match set changes at once (HR, IT-or-HR, no-condition…; IT ones gone)", has(nHR) && has(nITorHR) && !has(nIT) && !has(nKochiIT), names.join(" | "));
  // incomplete: clear legal entity
  await post({ form_type: "6686", unit_name: U.kochi, department: "IT", nature_of_expense: "Budgeted with 3 quotes" });
  ({ r, names } = await matchNames());
  rec("API-MAT-012", "With Legal Entity empty the workflow list still answers (matching ignores the empty field) — record what is offered", r.status === 200, `${r.status} ${names.join(" | ")}`, { verdict: "Record" } as any);
  // F&B + Non-budgeted → the pre-existing member flow 6783 should match
  await post({ ...FULL, department: "F&B Production", nature_of_expense: "Non-budgeted without 3 quotes" });
  ({ r, names } = await matchNames());
  rec("API-MAT-013", "F&B Production + Non-budgeted without 3 quotes matches the pre-existing 'GD Test - Non-budgeted without 3 quotes - F&B Production' (Member initiators)", names.some((n) => n.startsWith("GD Test - Non-budgeted")), names.join(" | "));
  await post(FULL);
}

// ───────────────────────── SUBMIT: error codes (every call fails before anything is sent) ─────────────────────────
if (want("submit")) {
  const mkOne = async (label: string, conds: any[]) => (await create(flow(NAME(label), conds))).uuid;
  const uA = await mkOne("S1 dept IT", [{ key: "department", values: ["IT"] }]);
  const uB = await mkOne("S2 dept IT or HR", [{ key: "department", values: ["IT", "HR"] }]);
  await post(FULL);
  let { names } = await matchNames();
  // the dashboard's exact shape: approval_flow_uuid, attachments, remarks, step_uuid_vs_user_uuid, peer_uuid
  const submit = (body: any) => api("POST", `/proposal/${P}/submit`, { attachments: [], remarks: "QA_Platform test", step_uuid_vs_user_uuid: {}, ...body });
  let r = await api("POST", `/proposal/${P}/submit`, { remarks: "QA_Platform test" });
  rec("API-SUB-000", "Submit with a minimal body (no attachments / step map) answers a clean error, not HTTP 500", r.status !== 500, `${r.status} ${errOf(r)}`);
  r = await submit({});
  rec("API-SUB-001", "Submit without choosing a workflow while several match → 2018 'Please select an approval workflow'", r.status === 422 && r.json?.error?.code === 2018, `${r.status} ${errOf(r)} (matches: ${names.length})`);
  r = await submit({ approval_flow_uuid: uuidOf(6782) });
  rec("API-SUB-002", "Submit with a workflow that exists but is NOT among the matches (Admin-only 'CAPEX - any unit - IT') → 523", r.status === 422 && r.json?.error?.code === 523, `${r.status} ${errOf(r)}`);
  await post({ form_type: "6686", unit_name: U.kochi, department: "IT", nature_of_expense: "Budgeted with 3 quotes" });
  r = await submit({ approval_flow_uuid: uA });
  rec("API-SUB-003", "Submit with Legal Entity empty → 2016 'Please fill Legal Entity'", r.status === 422 && r.json?.error?.code === 2016 && /Legal Entity/.test(r.json.error.message), `${r.status} ${errOf(r)}`);
  await post({ form_type: "6686", unit_name: U.kochi });
  r = await submit({ approval_flow_uuid: uA });
  rec("API-SUB-004", "Submit with three fields empty → 2016 lists all of them", r.status === 422 && r.json?.error?.code === 2016 && /Legal Entity, Department, Nature of Expense/.test(r.json.error.message), `${r.status} ${errOf(r)}`);
  await post({ ...FULL, department: "HR" });
  r = await submit({ approval_flow_uuid: uA });
  rec("API-SUB-005", "Department changed to HR after the modal listed the IT workflow → submit with the IT workflow → 523 (no longer among the matches)", r.status === 422 && r.json?.error?.code === 523, `${r.status} ${errOf(r)}`);
  r = await submit({ approval_flow_uuid: "garbage" });
  rec("API-SUB-006", "Submit with a garbage workflow id is refused cleanly (2018 'Please select an approval workflow' — the id decodes to nothing), not 500", r.status === 422 && [523, 2018].includes(r.json?.error?.code), `${r.status} ${errOf(r)}`);
  await post(FULL);
  rec("API-SUB-007", "No-match (2017) cannot be reached on DLF UAT: the company-level 'test' workflows (rule 'true') catch every PO once no team workflow matches", true, "By design of the UAT data (PR §8); the PRD's 'user can't submit when nothing matches' needs a company without catch-all workflows", { verdict: "Not run" } as any);
}

// restore + cleanup
await post(BASE_VALUES);
const after = (await api("GET", GD)).json?.values;
console.log("restored values", after);
if (!KEEP) {
  for (const u of made) { const d = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [u] }); console.log("deleted", u, d.status, d.status !== 200 ? d.text.slice(0, 100) : ""); }
} else console.log("kept", made);
writeFileSync(`${OUT}/api-made-${STAMP}.json`, JSON.stringify({ made, kept: KEEP }, null, 1));
console.log(`done: ${L.rows.length} rows; pass ${L.rows.filter((x) => x.verdict === "Pass").length}, fail ${L.rows.filter((x) => x.verdict === "Fail").length}`);
