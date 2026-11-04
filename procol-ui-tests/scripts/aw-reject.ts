// Finish the submit loop: reject the pending RFX-2112 request as its approver (the test user), then check the new draft.
import { api, appVersion, uuidOf, DLF, Ledger, OUT, errOf, idOf, sleep } from "./aw-lib";
await appVersion();
const L = new Ledger(`${OUT}/ui-results.json`);
const P = uuidOf(DLF.draftProposalId);
const pend = (await api("GET", "/approval_workflow/approval_requests?view_type=approver&page=1")).json;
const req = (pend?.approvals?.data || []).find((r: any) => r.ref_uuid === "RFX-2112" && r.status === "pending");
console.log("pending:", req ? { uuid: req.uuid, flow: req.approval_flow_name, approvers: req.approvers } : "none");
const myApprover = req?.approvers?.find((a: any) => a.my_approval_required) || req?.approvers?.[0];
if (!myApprover) { L.put({ id: "UI-SUB-013", title: "Reject as the approver", verdict: "Couldn't tell", observed: "no pending RFX-2112 request found for the approver", shots: [] }); process.exit(0); }
// approver's detail page: are the General Details shown? (PRD yes / PR not for now)
if (process.argv.includes("--detail")) {
  const { openBrowser, settle, shot, WEB } = await import("./aw-lib");
  const { browser, page } = await openBrowser();
  await page.goto(`${WEB}/approvals`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 4500);
  const row = page.locator("tbody tr", { hasText: "RFX-2112" }).first();
  if (await row.count()) { await row.locator("td").nth(2).click({ force: true }); await settle(page, 5000); }
  const url = page.url(); const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const sh = await shot(page, "S-11b-approval-detail");
  const shown = /Legal Entity|Nature of Expense|Unit Name/.test(body);
  L.put({ id: "UI-SUB-012", title: "What the approver sees of the General Details on the approval page (PRD: values shown so approvers know why; PR: not shown for now)", verdict: "Record", observed: `${shown ? "General Details values ARE shown" : "General Details are NOT shown"} on ${url}; page text: ${body.slice(0, 300)}`, shots: [sh] });
  await browser.close();
}
// the request's workflow was deleted by the test's cleanup while the request was pending — does the request still work?
const flowStillThere = req.approval_flow_name;
const rr = await api("POST", "/approval_workflow/approval_requests/resolve_approval", { approver_uuid: myApprover.uuid, resolution: "not_accepted", remarks: "QA_Platform: rejecting to return the PO to draft", attachments: [] });
console.log("reject:", rr.status, errOf(rr));
await sleep(3000);
const prop = (await api("GET", `/proposal/${P}`)).json;
const newDraft = (await api("POST", "/proposal", { event_group_uuid: uuidOf(DLF.eventGroupId) })).json;
const nd = newDraft?.uuid ? (await api("GET", `/proposal/${newDraft.uuid}/general_details`)).json : null;
const okRej = rr.status === 200;
L.put({ id: "UI-SUB-013", title: "Rejected by the approver (resolution 'not_accepted', key approver_uuid): the proposal leaves 'requested'; a new draft for the event carries the same General Details (PR §2.5)", verdict: okRej && !!nd && nd.values?.legal_entity === "DLF LIMITED" && nd.values?.department === "IT" ? "Pass" : "Fail", observed: `reject=${rr.status} ${errOf(rr)}; old proposal status=${prop?.status}; new draft=${newDraft?.uuid ?? errOf({ status: 0, json: newDraft, text: JSON.stringify(newDraft) } as any)} editable=${nd?.is_editable} values=${JSON.stringify(nd?.values)}`, shots: [] });
L.put({ id: "UI-SUB-013b", title: "resolve_approval accepts only 'accepted' / 'not_accepted', but the error for anything else says 'Please choose either Approve or Reject.' — the message names values the API does not take", verdict: "Record", observed: "'rejected' and 'Reject' → 422 734 'Invalid resolution value. Please choose either Approve or Reject.'; 'not_accepted' works", shots: [] });
L.put({ id: "UI-SUB-015", title: "A pending request whose workflow was deleted meanwhile can still be resolved by its approver", verdict: okRej ? "Pass" : "Fail", observed: `workflow '${flowStillThere}' had been deleted before the reject; resolve → ${rr.status} ${errOf(rr)}`, shots: [] });
L.put({ id: "UI-SUB-014", title: "Fixture after the loop: the draft proposal for RFX-2112 to use next", verdict: "Record", observed: `${newDraft?.uuid} (id ${newDraft?.uuid ? idOf(newDraft.uuid) : "?"}); old proposal ${P} status ${prop?.status}`, shots: [] });
console.log("new draft", newDraft?.uuid, nd?.values);
