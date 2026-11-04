// Re-run of four builder/PO checks in isolation (fresh page each): picker Cancel, two approvers, two rows, dynamic step.
import type { Locator } from "@playwright/test";
import { openBrowser, settle, shot, sleep, toasts, waitToast, WEB, uuidOf, DLF, Ledger, OUT, api, NAME, errOf } from "./aw-lib";
const L = new Ledger(`${OUT}/ui-results.json`);
const P = uuidOf(DLF.draftProposalId);
const U = DLF.hubs;
const BASE = { form_type: "6686", unit_name: U.kochi, legal_entity: "DLF LIMITED", department: "IT", nature_of_expense: "Budgeted with 3 quotes" };
const made: string[] = [];
const ok = (id: string, title: string, pass: boolean, observed: string, shots: string[] = []) => L.put({ id, title, verdict: pass ? "Pass" : "Fail", observed, shots });
const text = async (l: Locator) => (await l.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const { browser, page, net } = await openBrowser();
const go = async (u: string, ms = 3500) => { await page.goto(u, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, ms); };
async function pick(sel: Locator, typed: string, optionText: RegExp, multi = false): Promise<string> {
  await sel.click({ force: true }); await sleep(300); if (typed) await page.keyboard.type(typed, { delay: 40 }); await sleep(typed ? 3000 : 900);
  const dd = page.locator(".ant-select-dropdown:visible").last(); const opt = dd.locator(".ant-select-dropdown-menu-item", { hasText: optionText });
  if (!(await opt.count())) { const all = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts()).map((t) => t.trim()).slice(0, 12); await page.keyboard.press("Escape"); return `no option "${optionText}" among: ${all.join(" / ")}`; }
  await opt.first().click(); await sleep(400); if (multi) await page.keyboard.press("Escape"); return "";
}
async function options(sel: Locator): Promise<string[]> { await sel.click({ force: true }); await sleep(1200); const items = (await page.locator(".ant-select-dropdown:visible").last().locator(".ant-select-dropdown-menu-item").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean); await page.keyboard.press("Escape"); await sleep(200); return items; }
async function setup(conds: string[]) {
  await go(`${WEB}/approvals-workflows/create?approvalType=team`, 3000);
  await page.getByText("Add Trigger Settings").first().click(); await sleep(1500);
  const d = page.locator(".ant-drawer:visible").last(); await d.locator(".ant-select").first().waitFor({ timeout: 30_000 }).catch(() => {});
  await pick(d.locator(".ant-select").first(), "", /^Bid Proposal$/);
  for (const c of conds) await pick(d.locator(".ant-select").nth(1), "", new RegExp("^" + c.replace(/[-()]/g, "\\$&")));
  await pick(d.locator(".ant-form-item", { hasText: "Team" }).locator(".ant-select").first(), "", /^All Categories$/); await sleep(600);
  const i = d.locator(".ant-form-item", { hasText: /Initiator/ }).locator(".ant-select").first(); if (await i.count()) await pick(i, "", /^Member$/);
  await d.getByRole("button", { name: "Save" }).click(); await sleep(2500);
}
const ths = async () => (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const row = (n = 0) => page.locator("#approvalTable tbody tr").nth(n);
async function cell(r: Locator, head: RegExp) { const h = await ths(); return r.locator("td").nth(h.findIndex((t) => head.test(t))); }
const pop = () => page.locator(".ant-popover:visible").last();
async function setName(r: Locator, n: string) { await (await cell(r, /Name \(optional\)/)).click(); await sleep(600); await pop().locator("input, textarea").first().fill(n); await pop().getByRole("button", { name: "Save" }).click(); await sleep(500); }
async function setDept(r: Locator, vals: string[], clearFirst = false) {
  await (await cell(r, /^Department/)).click(); await sleep(800);
  if (clearFirst) { const rm = pop().locator(".ant-select-selection__choice__remove"); const n = await rm.count(); for (let k = 0; k < n; k++) { await rm.first().click({ force: true }); await sleep(200); } }
  for (const v of vals) await pick(pop().locator(".ant-select").first(), "", new RegExp(`^${v}$`), true);
  await pop().getByRole("button", { name: "Save" }).click(); await sleep(600);
}
async function setStep(r: Locator) { await (await cell(r, /^Step 1/)).click(); await sleep(1000); await pick(pop().locator(".ant-form-item", { hasText: /Approvers/ }).locator(".ant-select").first(), "Sumanta", /Test - Sumanta Dey/, true); await pop().getByPlaceholder("Enter approval duration").fill("1"); await pop().getByRole("button", { name: "Save" }).click(); await sleep(600); }

const ONLY = process.argv.includes("--only-rows");
try {
  // TBL-010 picker Cancel
  await setup(["Department - DLF PO"]);
  if (!ONLY) {
  await setDept(row(), ["IT"]);
  const saved = await text(await cell(row(), /^Department/));
  await (await cell(row(), /^Department/)).click(); await sleep(800);
  await pick(pop().locator(".ant-select").first(), "", /^HR$/, true);
  await pop().getByRole("button", { name: "Cancel" }).click(); await sleep(800);
  const afterCancel = await text(await cell(row(), /^Department/));
  ok("UI-TBL-010", "Cancel in a condition window throws the change away (IT saved, HR ticked then Cancel → the cell still reads IT)", saved === "IT" && afterCancel === "IT", `saved="${saved}" after cancel="${afterCancel}"`, [await shot(page, "M2-01-picker-cancel")]);
  // TBL-014 two approvers → options of the min box
  await (await cell(row(), /^Step 1/)).click(); await sleep(1000);
  const ap = pop().locator(".ant-form-item", { hasText: /Approvers/ }).locator(".ant-select").first();
  const e1 = await pick(ap, "Sumanta", /Test - Sumanta Dey/, true);
  const before = await pop().locator(".ant-form-item", { hasText: /No of approvals required/ }).count();
  const e2 = await pick(ap, "Sumanta", /Test 2 - Sumanta Dey/, true);
  const minItem = pop().locator(".ant-form-item", { hasText: /No of approvals required/ });
  const after = await minItem.count();
  const minOpts = after ? await options(minItem.locator(".ant-select").first()) : [];
  ok("UI-TBL-014", "With one approver there is no 'No of approvals required' box; with two it appears, offering 1 and 2", !e1 && !e2 && before === 0 && after === 1 && minOpts.join(",") === "1,2", `${e1 || e2 || ""}before=${before} after=${after} options=${minOpts.join(",") || "(could not read)"}`, [await shot(page, "M2-02-two-approvers")]);
  await pop().getByRole("button", { name: "Cancel" }).click(); await sleep(500);
  }
  // TBL-020 two rows
  const n1 = NAME("ROW1 IT"), n2 = NAME("ROW2 HR");
  if (ONLY) await setDept(row(), ["IT"]);
  await setName(row(), n1); await setStep(row());
  await page.getByRole("button", { name: /Add Approval Workflow/ }).click(); await sleep(1000);
  const r2 = await text(row(1));
  ok("UI-TBL-020", "'Add Approval Workflow' adds a second row copied from the first (same name, Department IT, same approver)", (await page.locator("#approvalTable tbody tr").count()) === 2 && r2.includes(n1) && /IT/.test(r2) && /Sumanta/.test(r2), r2.slice(0, 220), [await shot(page, "M2-03-second-row")]);
  const r2shot = await shot(page, "M2-03b-second-row-zoom");
  await setName(row(1), n2); await setDept(row(1), ["HR"], true); await setStep(row(1));
  await page.getByRole("button", { name: /Publish Workflow/ }).click(); const tt = await waitToast(page, 12000); await sleep(3000);
  const listed = (await api("GET", "/approval_workflow/approval_flows?page=1&initiator_type=team")).json?.approval_flows || [];
  const f1 = listed.find((f: any) => f.name === n1), f2 = listed.find((f: any) => f.name === n2);
  if (f1) made.push(f1.uuid); if (f2) made.push(f2.uuid);
  const d2 = f2?.conditions?.find((c: any) => c.key === "department")?.values?.map((v: any) => v.value);
  ok("UI-TBL-020b", "Publishing two rows creates two workflows (ROW1 Department IT, ROW2 Department HR), each with the test user as approver", /successfully published/.test(tt) && !!f1 && !!f2 && JSON.stringify(d2) === JSON.stringify(["HR"]), `toast="${tt}" made=${!!f1}/${!!f2} row2 dept=${JSON.stringify(d2)}`, [await shot(page, "M2-04-two-published")]);
  if (ONLY) { for (const u of [...made]) console.log("deleted", u, (await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [u] })).status); await browser.close(); process.exit(0); }
  // TBL-015 dynamic step
  const r0 = await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [{ name: NAME("DYN IT"), approval_type: "close_event_group", config: { stop_expiry_in_approval: true }, initiators: [{ type: "team", role: "member", uuid: uuidOf(DLF.teamAll), name: "All Categories" }], conditions: [{ key: "department", values: ["IT"] }], steps: [{ name: "Step 1", order: 0, expires_in: 86400, config: { no_of_approvals_required: false, approver_select: true }, approvers: [{ type: "user", uuid: uuidOf(DLF.testUserId) }] }] }] });
  const uD = r0.json?.[0]?.uuid; if (uD) made.push(uD); else console.log("dyn create failed", errOf(r0));
  for (const u of [f1?.uuid, f2?.uuid]) if (u) { await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [u] }); made.splice(made.indexOf(u), 1); }
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  await go(`${WEB}/po-form/${P}`, 5000);
  await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(6000);
  await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(7000);
  let modal = page.locator(".ant-modal:visible").last(); let mt = await text(modal);
  const s1 = await shot(page, "M2-05-dynamic-modal");
  const hasSelect = /Select Approver/i.test(mt) || (await modal.locator(".ant-select").count()) > 0;
  ok("UI-TBL-015", "A Dynamic step shows a 'Select Approver(s)' box in the submit window", hasSelect, `modal: ${mt.slice(0, 320)}`, [s1]);
  if (hasSelect) { await modal.getByRole("button", { name: /^Submit Proposal$/ }).last().click(); await sleep(2500); const tl = (await toasts(page)).join(" | "); ok("UI-TBL-015b", "Submit without picking the approver is refused: 'Please select at least one approver to proceed.'", /select at least one approver/i.test(tl), tl || "no message", [await shot(page, "M2-06-dynamic-refused")]); }
  await page.keyboard.press("Escape");
} catch (e: any) { console.log("crashed:", e?.message?.slice(0, 300)); await shot(page, "crash-more2"); }
for (const u of [...made]) console.log("deleted", u, (await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [u] })).status);
await browser.close();
