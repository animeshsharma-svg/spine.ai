/**
 * End-to-end on the fresh PR-based event RFX-2116 (built by aw-e2e-build.ts): does the approval workflow trigger
 * correctly from the General Details, and what does the approver see / do.
 *   npx tsx scripts/aw-e2e-ui.ts --part matrix|po|approver|all
 * Results → prototype/data/evidence/approval-routing/e2e-results.json, screenshots E-*.png
 */
import type { Locator } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { openBrowser, settle, shot, sleep, toasts, waitToast, WEB, uuidOf, idOf, DLF, Ledger, OUT, api, errOf } from "./aw-lib";
const STATE = `${OUT}/e2e-fixture.json`; const S = JSON.parse(readFileSync(STATE, "utf8")); const save = () => writeFileSync(STATE, JSON.stringify(S, null, 1));
const part = process.argv[process.argv.indexOf("--part") + 1] || "all"; const want = (p: string) => part === "all" || part === p;
const L = new Ledger(`${OUT}/e2e-results.json`);
const ok = (id: string, title: string, pass: boolean, observed: string, shots: string[] = []) => { L.put({ id, title, verdict: pass ? "Pass" : "Fail", observed, shots }); console.log(pass ? "PASS" : "FAIL", id, observed.slice(0, 160)); };
const rec = (id: string, title: string, observed: string, shots: string[] = []) => { L.put({ id, title, verdict: "Record", observed, shots }); console.log("REC ", id, observed.slice(0, 160)); };
const F = S.flows as Record<string, { uuid: string; name: string }>;
const REF = S.refId as string;
const ARALIAS = "12522"; // unit_name is stored as the hub id, not its uuid
const GD = (o: Partial<Record<string, string>> = {}) => ({ form_type: String(DLF.rfqTemplateId), unit_name: ARALIAS, legal_entity: "DLF LIMITED", department: "IT", nature_of_expense: "Budgeted with 3 quotes", ...o });
async function ensureProposal() {
  if (S.proposalUuid) { const p = await api("GET", `/proposal/${S.proposalUuid}`); if (p.json?.status === "draft") return; }
  const pr = await api("POST", "/proposal", { event_group_uuid: S.eventGroupUuid }); if (!pr.json?.uuid) { console.log("proposal failed", pr.status, errOf(pr)); process.exit(1); }
  S.proposalUuid = pr.json.uuid; S.proposalId = idOf(pr.json.uuid); save();
  const r = await api("POST", `/proposal/${S.proposalUuid}/add_response?lot_no=`, { responses: { [uuidOf(44124)]: { action: "add", egli_data: { [S.lineItemUuid]: { awarded_quantity: 10 } } } } });
  const f = await api("POST", `/proposal/${S.proposalUuid}/create_po_form`, {});   // the PO form itself (what the dashboard calls when you open the PO form after awarding)
  console.log("proposal", S.proposalUuid, "add_response", r.status, errOf(r), "create_po_form", f.status, errOf(f));
}
const matchNames = async () => ((await api("GET", `/proposal/${S.proposalUuid}/approval_workflows`)).json || []).map((f: any) => f.name as string);
const mine = (names: string[]) => Object.keys(F).filter((k) => names.includes(F[k].name)).join("") || "none";
const others = (names: string[]) => names.filter((n) => !Object.values(F).some((f) => f.name === n));

if (part !== "approver") await ensureProposal();   // the approver part works on the submitted proposal
const P = S.proposalUuid as string;

if (want("matrix")) {
  const cases: Array<[string, string, Partial<Record<string, string>>, string]> = [
    ["E2E-M01", "Department HR, Budgeted → only B (Department HR)", { department: "HR" }, "B"],
    ["E2E-M02", "Department IT, Budgeted, unit The Aralias → only A (Aralias + DLF LIMITED + IT); C (Kochi + IT) must not appear", {}, "A"],
    ["E2E-M03", "Department IT + Non-budgeted without 3 quotes → A and D (Capex RFQ + that nature)", { nature_of_expense: "Non-budgeted without 3 quotes" }, "AD"],
    ["E2E-M04", "Department HR + Non-budgeted without 3 quotes → B and D", { department: "HR", nature_of_expense: "Non-budgeted without 3 quotes" }, "BD"],
    ["E2E-M05", "Department Marketing, Budgeted → none of the four team workflows", { department: "Marketing" }, "none"],
  ];
  for (const [id, title, vals, exp] of cases) {
    const s = await api("POST", `/proposal/${P}/general_details`, { values: GD(vals) });
    const names = await matchNames(); const got = mine(names);
    ok(id, title, s.status === 200 && got === exp, `saved=${s.status} ${errOf(s)} matched=${got} (expected ${exp}); other workflows offered: ${others(names).join(" | ") || "none"}`);
    if (id === "E2E-M05") rec("E2E-M05b", "When no team workflow matches, what the list falls back to (company-level workflows of DLF)", others(names).join(" | ") || "nothing — the list is empty");
  }
  // unit from the PR line
  const opts = (await api("GET", `/proposal/${P}/general_details/unit_name/options?search_query=&page_number=1`)).json;
  const names = (opts?.options || opts?.data || opts || []).map((o: any) => o.label || o.name || o.value).filter(Boolean);
  ok("E2E-M06", "Unit Name offered for this PO = the PR line's unit only (The Aralias)", names.length === 1 && /Aralias/.test(names[0]), JSON.stringify(names).slice(0, 200));
  // submit refusals on the fresh event
  await api("POST", `/proposal/${P}/general_details`, { values: GD({ legal_entity: "" }) });
  const r1 = await api("POST", `/proposal/${P}/submit`, { approval_flow_uuid: F.A.uuid, attachments: [], remarks: {}, step_uuid_vs_user_uuid: {} });
  ok("E2E-M07", "Submit with Legal Entity empty is refused: 'Please fill Legal Entity'", r1.status === 422 && /Legal Entity/.test(errOf(r1)), `${r1.status} ${errOf(r1)}`);
  await api("POST", `/proposal/${P}/general_details`, { values: GD({ department: "HR" }) });
  const r2 = await api("POST", `/proposal/${P}/submit`, { approval_flow_uuid: F.A.uuid, attachments: [], remarks: {}, step_uuid_vs_user_uuid: {} });
  ok("E2E-M08", "Submit with workflow A while the PO says HR (A no longer matches) is refused: 523 Invalid Approval", r2.status === 422 && /523/.test(errOf(r2)), `${r2.status} ${errOf(r2)}`);
  await api("POST", `/proposal/${P}/general_details`, { values: GD() });
}

const { browser, page, net } = await openBrowser();
const text = async (l: Locator) => (await l.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const apiSince = (t: number, re: RegExp) => net.filter((n) => n.at >= t && re.test(n.url));
const sec = () => page.locator("section", { hasText: "General Details" }).first();
const gdRow = (label: string) => sec().locator("div[class*=row]", { hasText: label }).first();
const gdSelect = (label: string) => gdRow(label).locator(".ant-select").first();
async function pick(sel: Locator, typed: string, optionText: RegExp): Promise<string> {
  await page.keyboard.press("Escape"); await sleep(200);
  await sel.click({ force: true }); await sleep(300); if (typed) await page.keyboard.type(typed, { delay: 40 }); await sleep(typed ? 3000 : 1200);
  const dd = page.locator(".ant-select-dropdown:visible").last(); const opt = dd.locator(".ant-select-dropdown-menu-item", { hasText: optionText });
  for (let i = 0; i < 8 && !(await opt.count()); i++) await sleep(500);
  if (!(await opt.count())) { const all = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts()).map((t) => t.trim()).slice(0, 12); await page.keyboard.press("Escape"); return `no option ${optionText} among: ${all.join(" / ")}`; }
  await opt.first().click(); await sleep(1500); return "";
}
async function options(sel: Locator): Promise<string[]> { await sel.click({ force: true }); await sleep(1500); const dd = page.locator(".ant-select-dropdown:visible").last(); const items = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean); await page.keyboard.press("Escape"); await sleep(300); return items; }
const go = async (u: string, ms = 4500) => { await page.goto(u, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, ms); };
async function openModal(tag: string) {
  await go(`${WEB}/po-form/${P}`, 5000);
  await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(6000);
  const ntd = /\/proposal\//.test(page.url()); const sN = await shot(page, `${tag}-ntd`);
  const t0 = Date.now(); await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(6000);
  const modal = page.locator(".ant-modal:visible").last(); return { ntd, sN, calls: apiSince(t0, /approval_workflows/), modal, text: await text(modal) };
}
const listed = (t: string) => Object.keys(F).filter((k) => t.includes(F[k].name)).join("") || "none";

try { if (want("po")) {
  await api("POST", `/proposal/${P}/general_details`, { values: { form_type: String(DLF.rfqTemplateId), unit_name: ARALIAS } });
  await go(`${WEB}/po-form/${P}`, 5000);
  let s = await shot(page, "E-01-po-form");
  const ft = await text(gdRow("Form Type")); const un = await text(gdRow("Unit Name"));
  ok("E2E-U01", "PO form of the PR-based event: Form Type is auto-filled with the event's template 'DLF Capex NFA Test RFQ' and locked", /DLF Capex NFA Test RFQ/.test(ft) && /Auto-filled/.test(ft), ft.slice(0, 160), [s]);
  ok("E2E-U02", "Unit Name is auto-filled with the PR line's unit 'The Aralias (DLF-026)'", /Aralias/.test(un), un.slice(0, 160), [s]);
  const uo = await options(gdSelect("Unit Name"));
  ok("E2E-U03", "The Unit Name list offers only that unit", uo.length === 1 && /Aralias/.test(uo[0]), uo.join(" / "), [await shot(page, "E-02-unit-options")]);
  let e = await pick(gdSelect("Legal Entity"), "", /DLF LIMITED/); ok("E2E-U04", "Legal Entity: pick DLF LIMITED (the entity mapped to The Aralias)", !e, e || "picked", []);
  e = await pick(gdSelect("Department"), "HR", /^HR$/); ok("E2E-U05", "Department: pick HR", !e, e || "picked", []);
  e = await pick(gdSelect("Nature of Expense"), "", /^Budgeted with 3 quotes$/); ok("E2E-U06", "Nature of Expense: pick 'Budgeted with 3 quotes'", !e, e || "picked", [await shot(page, "E-03-filled-hr")]);
  await sleep(1500);
  const saved = (await api("GET", `/proposal/${P}/general_details`)).json?.values;
  ok("E2E-U07", "The values typed in the form are saved on the server as you go (HR / DLF LIMITED / Budgeted)", saved?.department === "HR" && saved?.legal_entity === "DLF LIMITED", JSON.stringify(saved));
  // 1) HR → only B
  let o = await openModal("E-04"); s = await shot(page, "E-05-modal-hr");
  rec("E2E-U08", "Submit Proposal on the PO form first opens the NTD page, whose Submit Proposal opens the approval window", `NTD reached=${o.ntd} url=${page.url()}`, [o.sN]);
  ok("E2E-U09", "With Department = HR the approval window offers ONLY workflow B (Department HR): straight to its summary with approver Test - Sumanta Dey", listed(o.text) === "B" && /will be sent to the following members/.test(o.text) && /Sumanta/.test(o.text), `listed=${listed(o.text)} text="${o.text.slice(0, 260)}"`, [s]);
  await page.keyboard.press("Escape"); await sleep(800);
  // 2) IT → only A
  await go(`${WEB}/po-form/${P}`, 5000); e = await pick(gdSelect("Department"), "IT", /^IT$/); await sleep(1500);
  o = await openModal("E-06"); s = await shot(page, "E-07-modal-it");
  ok("E2E-U10", "Department changed to IT in the form → the window now offers ONLY A (Aralias + DLF LIMITED + IT); B gone, C (Kochi + IT) never offered", !e && listed(o.text) === "A", `${e}listed=${listed(o.text)} text="${o.text.slice(0, 260)}"`, [s]);
  await page.keyboard.press("Escape"); await sleep(800);
  // 3) IT + Non-budgeted w/o 3 quotes → A and D (a list to choose from)
  await go(`${WEB}/po-form/${P}`, 5000); e = await pick(gdSelect("Nature of Expense"), "", /^Non-budgeted without 3 quotes$/); await sleep(1500);
  o = await openModal("E-08"); s = await shot(page, "E-09-modal-a-d");
  ok("E2E-U11", "Nature changed to 'Non-budgeted without 3 quotes' → the window lists two workflows to choose from: A and D", !e && listed(o.text) === "AD" && !/will be sent to the following members/.test(o.text), `${e}listed=${listed(o.text)} text="${o.text.slice(0, 260)}"`, [s]);
  const primaryDisabled = await o.modal.locator(".ant-modal-footer button.ant-btn-primary, .ant-modal button.ant-btn-primary").last().isDisabled().catch(() => false);
  rec("E2E-U11b", "Before a workflow is chosen in the list, is the continue button disabled?", primaryDisabled ? "disabled until one is chosen" : "enabled even with nothing chosen (pressing it: see E2E-U11c)");
  if (!primaryDisabled) { await o.modal.locator(".ant-modal-footer button.ant-btn-primary, .ant-modal button.ant-btn-primary").last().click(); await sleep(2500); const tl = (await toasts(page)).join(" | "); rec("E2E-U11c", "Pressing continue with nothing chosen", `toast="${tl}" modal now: ${(await text(page.locator(".ant-modal:visible").last())).slice(0, 160)}`, [await shot(page, "E-10-nothing-chosen")]); }
  await page.keyboard.press("Escape"); await sleep(800);
  // 4) back to Budgeted → A summary → real submit
  await go(`${WEB}/po-form/${P}`, 5000); e = await pick(gdSelect("Nature of Expense"), "", /^Budgeted with 3 quotes$/); await sleep(1500);
  o = await openModal("E-11"); s = await shot(page, "E-12-modal-a");
  ok("E2E-U12", "Nature back to 'Budgeted with 3 quotes' → only A again, summary shown", !e && listed(o.text) === "A" && /will be sent to the following members/.test(o.text), `${e}listed=${listed(o.text)}`, [s]);
  const rem = o.modal.locator("[contenteditable=true], textarea").first(); if (await rem.count()) { await rem.click(); await page.keyboard.type("QA_Platform E2E: PR 369 line at The Aralias, IT, budgeted"); }
  const t0 = Date.now(); await o.modal.getByRole("button", { name: /^Submit Proposal$/ }).last().click(); await sleep(7000);
  const subs = apiSince(t0, /\/submit$/); const toast = (await toasts(page)).join(" | ") || (await waitToast(page, 4000));
  s = await shot(page, "E-13-submitted");
  ok("E2E-U13", "Submit goes through: 'Proposal submitted successfully'", subs.some((x) => x.status === 200), `submit=${subs.map((x) => `${x.status} ${(x.reply || "").slice(0, 80)}`).join(" ; ")} toast="${toast}" url=${page.url()}`, [s]);
  await sleep(3000);
  const reqs = (await api("GET", "/approval_workflow/approval_requests?view_type=initiator&page=1")).json;
  const r = (reqs?.approvals?.data || []).find((x: any) => x.ref_uuid === REF && x.status === "pending");
  S.requestUuid = r?.uuid; save();
  ok("E2E-U14", `The request is created on ${REF} with workflow A, status pending, one step, approver = the test user`, !!r && r.approval_flow_name === F.A.name, JSON.stringify({ found: !!r, flow: r?.approval_flow_name, status: r?.status, steps: r?.total_steps, approvers: r?.approvers?.map((a: any) => a.name || a.display_name || a.uuid) }).slice(0, 300));
  const routing = r ? (await api("GET", `/approval_workflow/approval_requests/${r.uuid}`)).json : null;
  rec("E2E-U14b", "What the request stores about why it was routed (the routing snapshot)", JSON.stringify(routing?.meta_data?.data?.routing || routing?.routing || routing?.meta_data || "not exposed by the API").slice(0, 400));
  const prop = (await api("GET", `/proposal/${P}`)).json;
  ok("E2E-U15", "The proposal is now 'requested' and its General Details are locked", prop?.status === "requested" && (await api("GET", `/proposal/${P}/general_details`)).json?.is_editable === false, `status=${prop?.status}`);
} } catch (e: any) { console.log("po part crashed:", e?.message?.slice(0, 300)); await shot(page, "E-crash-po"); }

try { if (want("approver")) {
  // the approver (same test user) on the Approvals page
  await go(`${WEB}/approvals`, 5000); let s = await shot(page, "E-20-approvals-list");
  const row = page.locator("tbody tr", { hasText: REF }).first();
  const rowText = await text(row);
  ok("E2E-A01", `The approver sees ${REF} on the Approvals page, pending, with the workflow name`, (await row.count()) > 0 && /pending/i.test(rowText), rowText.slice(0, 300) || `no row with ${REF} on the first page`, [s]);
  const pend = (await api("GET", "/approval_workflow/approval_requests?view_type=approver&page=1")).json;
  const req = (pend?.approvals?.data || []).find((x: any) => x.ref_uuid === REF && x.status === "pending");
  const myApprover = req?.approvers?.find((a: any) => a.my_approval_required) || req?.approvers?.[0];
  ok("E2E-A02", "The approver's own list (view_type=approver) has the request, marked as needing their approval", !!myApprover, JSON.stringify({ flow: req?.approval_flow_name, approvers: req?.approvers?.map((a: any) => ({ name: a.name || a.display_name, mine: a.my_approval_required, status: a.status })) }).slice(0, 300));
  if (await row.count()) {
    await row.locator("td").nth(2).click({ force: true }); await settle(page, 6000);
    s = await shot(page, "E-21-approval-detail");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const btns = (await page.getByRole("button").allInnerTexts()).map((t) => t.trim()).filter((t) => /approve|reject|accept|decline/i.test(t));
    rec("E2E-A03", "What opens when the approver clicks the request", `url=${page.url()}; approve/reject buttons: ${btns.join(" / ") || "none on this page"}; General Details ${/Legal Entity|Nature of Expense|Unit Name/.test(body) ? "ARE shown" : "are NOT shown"}; text: ${body.slice(0, 300)}`, [s]);
    ok("E2E-A04", "The approver can see WHY this workflow was picked: the PO's Unit Name / Legal Entity / Department / Nature of Expense are shown on the approval page", /Legal Entity|Nature of Expense/.test(body), /Legal Entity|Nature of Expense/.test(body) ? "shown" : "not shown anywhere on the page the approver lands on", [s]);
    // Reject through the UI
    const rej = page.getByRole("button", { name: /^Reject$/i }).first();
    if (await rej.count()) {
      await rej.click(); await sleep(2000); const m = page.locator(".ant-modal:visible, .ant-drawer:visible").last(); const mt = await text(m);
      s = await shot(page, "E-22-reject-dialog");
      const box = m.locator("textarea, [contenteditable=true], input[type=text]").first(); if (await box.count()) { await box.click(); await page.keyboard.type("QA_Platform E2E: rejecting from the approver screen"); }
      const t0 = Date.now(); await m.getByRole("button", { name: /reject|confirm|submit|yes/i }).last().click(); await sleep(6000);
      const calls = apiSince(t0, /resolve_approval|reject/); const tl = (await toasts(page)).join(" | ");
      const prop = (await api("GET", `/proposal/${P}`)).json;
      ok("E2E-A05", "Reject from the approver's screen (with a remark) works: confirmation, the proposal becomes 'rejected'", calls.some((c) => c.status === 200) && prop?.status === "rejected", `dialog="${mt.slice(0, 120)}" calls=${calls.map((c) => `${c.method} ${c.status}`).join(",")} toast="${tl}" proposal=${prop?.status}`, [s, await shot(page, "E-23-after-reject")]);
    } else if (myApprover) {
      const rr = await api("POST", "/approval_workflow/approval_requests/resolve_approval", { approver_uuid: myApprover.uuid, resolution: "not_accepted", remarks: "QA_Platform E2E reject", attachments: [] });
      const prop = (await api("GET", `/proposal/${P}`)).json;
      ok("E2E-A05", "Reject as the approver (no Reject button found on the page → done through the API the button uses): the proposal becomes 'rejected'", rr.status === 200 && prop?.status === "rejected", `reject=${rr.status} ${errOf(rr)} proposal=${prop?.status}`, [s]);
    }
  }
  // after the reject: new draft carries the General Details; the PO can be submitted again
  const nd = (await api("POST", "/proposal", { event_group_uuid: S.eventGroupUuid })).json;
  const gd = nd?.uuid ? (await api("GET", `/proposal/${nd.uuid}/general_details`)).json : null;
  ok("E2E-A06", "After the rejection the buyer gets a new draft PO for the event and it still carries the same General Details (no re-typing)", !!gd && gd.values?.department === "IT" && gd.values?.unit_name === ARALIAS && gd.is_editable === true, JSON.stringify({ draft: nd?.uuid, editable: gd?.is_editable, values: gd?.values }).slice(0, 300));
  if (nd?.uuid) {
    S.proposalUuid = nd.uuid; S.proposalId = idOf(nd.uuid); save();
    await api("POST", `/proposal/${nd.uuid}/add_response?lot_no=`, { responses: { [uuidOf(44124)]: { action: "add", egli_data: { [S.lineItemUuid]: { awarded_quantity: 10 } } } } });
    await api("POST", `/proposal/${nd.uuid}/create_po_form`, {});
    const names = await matchNames();
    ok("E2E-A07", "The new draft matches the same workflow (A) again", mine(names) === "A", `matched=${mine(names)}`);
    const sub = await api("POST", `/proposal/${nd.uuid}/submit`, { approval_flow_uuid: F.A.uuid, attachments: [], remarks: {}, step_uuid_vs_user_uuid: {} });
    ok("E2E-A08", "Second submission (same values) goes through with workflow A", sub.status === 200, `${sub.status} ${errOf(sub)}`);
    await sleep(3000);
    // Approve through the UI
    await go(`${WEB}/approvals`, 5000);
    const row2 = page.locator("tbody tr", { hasText: REF }).first();
    if (await row2.count()) {
      await row2.locator("td").nth(2).click({ force: true }); await settle(page, 6000);
      const s2 = await shot(page, "E-24-approval-detail-2");
      const apr = page.getByRole("button", { name: /^Approve$/i }).first();
      if (await apr.count()) {
        await apr.click(); await sleep(2000); const m = page.locator(".ant-modal:visible, .ant-drawer:visible").last(); const mt = await text(m);
        const s3 = await shot(page, "E-25-approve-dialog");
        const box = m.locator("textarea, [contenteditable=true], input[type=text]").first(); if (await box.count()) { await box.click(); await page.keyboard.type("QA_Platform E2E: approving from the approver screen"); }
        const t0 = Date.now(); await m.getByRole("button", { name: /approve|confirm|submit|yes/i }).last().click(); await sleep(7000);
        const calls = apiSince(t0, /resolve_approval|approve/); const tl = (await toasts(page)).join(" | ");
        const prop = (await api("GET", `/proposal/${nd.uuid}`)).json; const eg = (await api("GET", `/event_groups/${S.eventGroupUuid}`)).json;
        ok("E2E-A09", "Approve from the approver's screen works: the proposal is accepted (status 'selected') and the event moves on (awarded)", calls.some((c) => c.status === 200) && prop?.status === "selected", `dialog="${mt.slice(0, 120)}" calls=${calls.map((c) => `${c.method} ${c.status}`).join(",")} toast="${tl}" proposal=${prop?.status} event=${eg?.status} stages=${JSON.stringify((eg?.stages || []).map((x: any) => x.status))}`, [s2, s3, await shot(page, "E-26-after-approve")]);
      } else {
        const pend2 = (await api("GET", "/approval_workflow/approval_requests?view_type=approver&page=1")).json;
        const req2 = (pend2?.approvals?.data || []).find((x: any) => x.ref_uuid === REF && x.status === "pending"); const a2 = req2?.approvers?.find((a: any) => a.my_approval_required) || req2?.approvers?.[0];
        const rr = a2 ? await api("POST", "/approval_workflow/approval_requests/resolve_approval", { approver_uuid: a2.uuid, resolution: "accepted", remarks: "QA_Platform E2E approve", attachments: [] }) : null;
        const prop = (await api("GET", `/proposal/${nd.uuid}`)).json;
        ok("E2E-A09", "Approve as the approver (no Approve button found → through the API the button uses): proposal 'selected'", rr?.status === 200 && prop?.status === "selected", `approve=${rr?.status} ${rr ? errOf(rr) : "no approver"} proposal=${prop?.status}`, [s2]);
      }
    }
    await go(`${WEB}/po-form/${nd.uuid}`, 5000);
    rec("E2E-A10", "The PO form after approval (read-only General Details, values kept)", `values=${JSON.stringify((await api("GET", `/proposal/${nd.uuid}/general_details`)).json?.values)} editable=${(await api("GET", `/proposal/${nd.uuid}/general_details`)).json?.is_editable}`, [await shot(page, "E-27-po-after-approve")]);
  }
} } catch (e: any) { console.log("approver part crashed:", e?.message?.slice(0, 300)); await shot(page, "E-crash-approver"); }
await browser.close();
console.log(`done: ${L.rows.length} rows; pass ${L.rows.filter((x) => x.verdict === "Pass").length}, fail ${L.rows.filter((x) => x.verdict === "Fail").length}`);
