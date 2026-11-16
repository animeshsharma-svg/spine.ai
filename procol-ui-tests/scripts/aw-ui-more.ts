/**
 * Approval routing — the remaining cases, run for real on DLF UAT (cpanel.ag-ri.in).
 *   npx tsx scripts/aw-ui-more.ts [--part ui|api|approve|all]
 * ui   : filter, drawer negatives/cancel/edit/remove, picker search/cancel/bin, two approvers, two rows,
 *        dynamic step in the modal, lone-entity auto-select, offline save, PO list filters, control sweeps
 * api  : change approver, edit-while-pending + withdraw, bad template config, delete by id vs uuid, go-live facts
 * approve: submit with a QA workflow and APPROVE it as the approver (awards RFX-2112 to Demo10 — last, deliberate)
 * Everything it creates is named QA_Platform AW … and deleted at the end.
 */
import type { Locator } from "@playwright/test";
import { openBrowser, settle, shot, sleep, toasts, waitToast, WEB, uuidOf, idOf, DLF, Ledger, OUT, SHOTS, api, NAME, errOf } from "./aw-lib";

const part = (() => { const i = process.argv.indexOf("--part"); return i >= 0 ? process.argv[i + 1] : "all"; })();
const want = (p: string) => part === "all" || part === p;
const L = new Ledger(`${OUT}/ui-results.json`);
const P = uuidOf(DLF.draftProposalId);
const U = DLF.hubs;
const BASE = { form_type: "6686", unit_name: U.kochi, legal_entity: "DLF LIMITED", department: "IT", nature_of_expense: "Budgeted with 3 quotes" };
const made: string[] = [];
const ok = (id: string, title: string, pass: boolean, observed: string, shots: string[] = [], extra: any = {}) => L.put({ id, title, verdict: pass ? "Pass" : "Fail", observed, shots, ...extra });
const rec = (id: string, title: string, observed: string, shots: string[] = []) => L.put({ id, title, verdict: "Record", observed, shots });
const text = async (l: Locator) => (await l.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const teamUuid = uuidOf(DLF.teamAll);
const me = { type: "user", uuid: uuidOf(DLF.testUserId) };
const flowBody = (name: string, conds: any[], o: any = {}) => ({ name, approval_type: "close_event_group", config: { stop_expiry_in_approval: o.stopExpiry ?? true }, initiators: [{ type: "team", role: "member", uuid: teamUuid, name: "All Categories" }], conditions: conds, steps: [{ name: "Step 1", order: 0, expires_in: o.expires ?? 86400, config: { no_of_approvals_required: false, ...(o.dynamic ? { approver_select: true } : {}) }, approvers: o.approvers ?? [me] }] });
async function mk(name: string, conds: any[], o: any = {}) { const r = await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [flowBody(name, conds, o)] }); const u = r.json?.[0]?.uuid; if (u) made.push(u); else console.log("mk failed", name, errOf(r)); return u as string | undefined; }
async function del(u?: string) { if (!u) return; const d = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [u] }); const i = made.indexOf(u); if (i >= 0) made.splice(i, 1); return d.status; }

const { browser, ctx, page, net } = await openBrowser();
const apiSince = (t: number, re: RegExp) => net.filter((n) => n.at >= t && re.test(n.url));
const go = async (u: string, ms = 3500) => { await page.goto(u, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, ms); };
async function pick(sel: Locator, typed: string, optionText: RegExp, multi = false): Promise<string> {
  await sel.click({ force: true }); await sleep(300);
  if (typed) await page.keyboard.type(typed, { delay: 40 });
  await sleep(typed ? 3000 : 900);
  const dd = page.locator(".ant-select-dropdown:visible").last();
  const opt = dd.locator(".ant-select-dropdown-menu-item", { hasText: optionText });
  if (!(await opt.count())) { const all = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts()).map((t) => t.trim()).slice(0, 12); await page.keyboard.press("Escape"); return `no option "${optionText}" among: ${all.join(" / ")}`; }
  await opt.first().click(); await sleep(400); if (multi) await page.keyboard.press("Escape"); return "";
}
async function options(sel: Locator, typed = ""): Promise<string[]> {
  await sel.click({ force: true }); await sleep(300); if (typed) await page.keyboard.type(typed, { delay: 40 }); await sleep(typed ? 2500 : 1200);
  const dd = page.locator(".ant-select-dropdown:visible").last();
  const items = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  const nf = await text(dd.locator(".ant-select-not-found, .ant-empty-description, .ant-select-dropdown-menu-item-disabled").first());
  await page.keyboard.press("Escape"); await sleep(200); return items.length ? items : (nf ? [`[${nf}]`] : []);
}
async function drawerSetup(conds: string[], o: { noTeam?: boolean; noInit?: boolean } = {}) {
  await go(`${WEB}/approvals-workflows/create?approvalType=team`, 3000);
  await page.getByText("Add Trigger Settings").first().click(); await sleep(1500);
  const d = page.locator(".ant-drawer:visible").last();
  await d.locator(".ant-select").first().waitFor({ timeout: 30_000 }).catch(() => {});
  await pick(d.locator(".ant-select").first(), "", /^Bid Proposal$/);
  const cs = d.locator(".ant-select").nth(1);
  for (const c of conds) await pick(cs, "", new RegExp("^" + c.replace(/[-()]/g, "\\$&")));
  if (!o.noTeam) { await pick(d.locator(".ant-form-item", { hasText: "Team" }).locator(".ant-select").first(), "", /^All Categories$/); await sleep(600); }
  if (!o.noTeam && !o.noInit) { const i = d.locator(".ant-form-item", { hasText: /Initiator/ }).locator(".ant-select").first(); if (await i.count()) await pick(i, "", /^Member$/); }
  return d;
}
const ths = async () => (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const row = (n = 0) => page.locator("#approvalTable tbody tr").nth(n);
async function cell(r: Locator, head: RegExp) { const h = await ths(); return r.locator("td").nth(h.findIndex((t) => head.test(t))); }
async function sweep(name: string, scope: Locator, max = 40): Promise<string> {
  const names: string[] = [];
  const btns = scope.locator("button, [role=button], a, input, .ant-select, .ant-switch, textarea");
  const n = Math.min(await btns.count(), max);
  for (let i = 0; i < n; i++) { const b = btns.nth(i); const t = ((await b.getAttribute("aria-label")) || (await b.getAttribute("placeholder")) || (await text(b))).slice(0, 40); const vis = await b.isVisible().catch(() => false); if (vis && t) names.push(t); }
  let tabbed = 0; const focused: string[] = [];
  for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); const f = await page.evaluate(() => { const e = document.activeElement as HTMLElement | null; return e ? `${e.tagName.toLowerCase()}${e.getAttribute("aria-label") ? "[" + e.getAttribute("aria-label") + "]" : ""}:${(e.innerText || (e as any).placeholder || "").trim().slice(0, 25)}` : ""; }); if (f && !focused.includes(f)) { focused.push(f); tabbed++; } }
  return `${name}: ${names.length} visible controls (${names.slice(0, 18).join(", ")}); Tab reached ${tabbed} distinct controls (${focused.slice(0, 10).join(" → ")})`;
}

// ═════════════════════ UI ═════════════════════
try { if (want("ui")) {
  // LST-004 filter
  await go(`${WEB}/approvals-workflows?approvalType=team`);
  const filterBtn = page.locator("[class*=filter] button, button[class*=filter], [class*=Filter] button").first();
  if (await filterBtn.count()) await filterBtn.click({ force: true }).catch(() => {}); else await page.mouse.click(96, 207);
  await sleep(1500);
  let s = await shot(page, "M-01-filter");
  const panel = page.locator(".ant-drawer:visible, .ant-popover:visible, .ant-dropdown:visible, [class*=filter]:visible").last();
  const ptext = await text(panel);
  const labels = (await panel.locator(".ant-form-item-label, label, [class*=label]").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 14);
  rec("UI-LST-005", "The filter button on the Approval Workflows list: what it offers", ptext ? `panel: ${ptext.slice(0, 300)} | labels: ${labels.join(", ")}` : "no filter panel opened", [s]);
  const typeSel = panel.locator(".ant-select").first();
  if (await typeSel.count()) {
    const err = await pick(typeSel, "", /^Bid Proposal$/, true); await sleep(2500);
    const rowsNow = (await page.locator("tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    ok("UI-LST-006", "Filtering by Approval Type = Bid Proposal leaves only Bid Proposal rows", !err && rowsNow.length > 0 && rowsNow.every((r) => /Bid Proposal/.test(r)), err || `${rowsNow.length} rows: ${rowsNow.map((r) => r.slice(0, 40)).join(" | ")}`, [await shot(page, "M-02-filter-bid")]);
    const unitSel = panel.locator(".ant-form-item", { hasText: /Unit Name/ }).locator(".ant-select").first();
    if (await unitSel.count()) { const e2 = await pick(unitSel, "Lodhi", /^The Lodhi$/, true); await sleep(2500); const r2 = (await page.locator("tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()); ok("UI-LST-007", "Filtering by Unit Name = The Lodhi keeps only workflows whose Unit Name condition includes The Lodhi (workflows with no Unit condition drop out)", !e2 && r2.every((r) => /Lodhi/.test(r)), e2 || `${r2.length} rows: ${r2.map((r) => r.slice(0, 50)).join(" | ")}`, [await shot(page, "M-03-filter-unit")]); }
  }
  // sweeps: list page
  await go(`${WEB}/approvals-workflows?approvalType=team`);
  rec("UI-BTN-001", "Control sweep — Approval Workflows list", await sweep("list", page.locator("body")), [await shot(page, "M-04-sweep-list")]);
  // TRG-008 drawer: type but no team
  let d = await drawerSetup(["Department - DLF PO"], { noTeam: true });
  await d.getByRole("button", { name: "Save" }).click(); await sleep(1200);
  s = await shot(page, "M-05-drawer-no-team");
  let help = (await d.locator(".ant-form-explain, [class*=help], .has-error").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  ok("UI-TRG-008", "Saving the drawer with an approval type but no team shows 'Team cannot be empty' and stays open", help.some((h) => /Team cannot be empty/.test(h)) && (await d.count()) > 0, help.join(" | ") || `no message; drawer open=${await d.count()}; text=${(await text(d)).slice(0, 150)}`, [s]);
  rec("UI-BTN-002", "Control sweep — Trigger Settings drawer", await sweep("drawer", d), []);
  // TRG-009 cancel
  await d.getByRole("button", { name: "Cancel" }).click(); await sleep(800);
  ok("UI-TRG-009", "Cancel closes the drawer; the page still shows only '+ Add Trigger Settings'; reopening starts empty", (await page.locator(".ant-drawer:visible").count()) === 0 && (await page.getByText("Add Trigger Settings").count()) > 0, `drawers=${await page.locator(".ant-drawer:visible").count()} box=${await page.getByText("Add Trigger Settings").count()}`, [await shot(page, "M-06-drawer-cancel")]);
  await page.getByText("Add Trigger Settings").first().click(); await sleep(1200);
  d = page.locator(".ant-drawer:visible").last();
  const chips = await text(d);
  L.put({ id: "UI-TRG-009b", title: "After Cancel, reopening the drawer should start empty", verdict: !/Bid Proposal|Department - DLF PO/.test(chips) ? "Pass" : "Fail", observed: /Bid Proposal/.test(chips) ? `Cancel kept everything: reopened drawer still shows ${chips.slice(0, 200)}` : chips.slice(0, 160), shots: [await shot(page, "M-06b-drawer-reopened")], bug: /Bid Proposal/.test(chips) ? "Cancel on the Trigger Settings drawer does not discard the selections (and keeps the 'Team cannot be empty' error) — reopening shows them again" : undefined });
  await d.getByRole("button", { name: "Cancel" }).click(); await sleep(500);
  // TRG-010 edit summary reopens drawer; TRG-011 remove used condition
  d = await drawerSetup(["Unit Name - DLF PO", "Department - DLF PO"]);
  await d.getByRole("button", { name: "Save" }).click(); await sleep(2000);
  await (await cell(row(), /^Unit Name/)).click(); await sleep(800);
  let pop = page.locator(".ant-popover:visible").last();
  await pick(pop.locator(".ant-select").first(), "Lodhi", /^The Lodhi$/, true); await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
  const summaryEdit = page.locator("div", { hasText: /Trigger Conditions/ }).locator("a, button, span", { hasText: /^\s*Edit\s*$/ }).last();
  await summaryEdit.click({ force: true }); await sleep(1500);
  d = page.locator(".ant-drawer:visible").last();
  const dt = await text(d);
  ok("UI-TRG-010", "Edit on the Bid Proposal summary reopens the drawer with Bid Proposal, the two conditions, All Categories and Member already chosen", /Bid Proposal/.test(dt) && /Unit Name - DLF PO/.test(dt) && /Department - DLF PO/.test(dt) && /All Categories/.test(dt) && /Member/.test(dt), dt.slice(0, 260), [await shot(page, "M-07-edit-trigger")]);
  await pick(d.locator(".ant-select").nth(1), "", /^Legal Entity - DLF PO/);
  await d.getByRole("button", { name: "Save" }).click(); await sleep(2000);
  let h = await ths();
  ok("UI-TRG-010b", "Adding Legal Entity in the reopened drawer adds its column; the Unit Name value (The Lodhi) typed before is kept", h.some((t) => /^Legal Entity/.test(t)) && /Lodhi/.test(await text(row())), `columns=${h.join(" | ")} row=${(await text(row())).slice(0, 120)}`, [await shot(page, "M-08-added-column")]);
  await page.locator("div", { hasText: /Trigger Conditions/ }).locator("a, button, span", { hasText: /^\s*Edit\s*$/ }).last().click({ force: true }); await sleep(1500);
  d = page.locator(".ant-drawer:visible").last();
  const unitChip = d.locator(".ant-form-item", { hasText: "Conditions" }).getByText(/Unit Name - DLF PO/).first();
  const x = unitChip.locator("xpath=..").locator("[aria-label=close], .anticon-close, svg").last();
  await x.click({ force: true }).catch(async () => { await d.locator("[aria-label=close]").nth(1).click({ force: true }).catch(() => {}); });
  await sleep(500); s = await shot(page, "M-09-remove-condition");
  await d.getByRole("button", { name: "Save" }).click(); await sleep(2000);
  h = await ths();
  ok("UI-TRG-011", "Removing the Unit Name condition (x on its chip) and saving drops the column and its value (The Lodhi) from the table without a warning", !h.some((t) => /^Unit Name/.test(t)) && !/Lodhi/.test(await text(row())), `columns=${h.join(" | ")} row=${(await text(row())).slice(0, 120)} toasts=${(await toasts(page)).join("|")}`, [s, await shot(page, "M-10-after-remove")]);
  // TBL-009 search in picker, TBL-010 cancel + bin
  await (await cell(row(), /^Department/)).click(); await sleep(800);
  pop = page.locator(".ant-popover:visible").last();
  const narrowed = await options(pop.locator(".ant-select").first(), "ma");
  ok("UI-TBL-009", "Typing 'ma' in the Department picker narrows the list to Marketing", narrowed.length === 1 && narrowed[0] === "Marketing", narrowed.join(" / "), [await shot(page, "M-11-picker-search")]);
  await pick(pop.locator(".ant-select").first(), "", /^IT$/, true); await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
  await (await cell(row(), /^Department/)).click(); await sleep(800); pop = page.locator(".ant-popover:visible").last();
  await pick(pop.locator(".ant-select").first(), "", /^HR$/, true); await pop.getByRole("button", { name: "Cancel" }).click(); await sleep(800);
  const afterCancel = await text(await cell(row(), /^Department/));
  ok("UI-TBL-010", "Cancel in a picker throws the change away (the cell still reads IT only)", afterCancel === "IT", afterCancel, [await shot(page, "M-12-picker-cancel")]);
  await (await cell(row(), /^Department/)).click(); await sleep(800); pop = page.locator(".ant-popover:visible").last();
  const bin = pop.locator("button").filter({ has: page.locator("svg") }).first();
  await bin.click({ force: true }); await sleep(800);
  const afterBin = await text(await cell(row(), /^Department/));
  ok("UI-TBL-010b", "The bin icon in the picker clears the cell (= any Department)", afterBin === "", afterBin || "(empty)", [await shot(page, "M-13-picker-bin")]);
  // TBL-014 two approvers → No of approvals required
  await (await cell(row(), /^Step 1/)).click(); await sleep(1000); pop = page.locator(".ant-popover:visible").last();
  const ap = pop.locator(".ant-form-item", { hasText: /Approvers/ }).locator(".ant-select").first();
  const e1 = await pick(ap, "Sumanta", /Test - Sumanta Dey/, true);
  const before = await pop.locator(".ant-form-item", { hasText: /No of approvals required/ }).count();
  const e2 = await pick(ap, "Sumanta", /Test 2 - Sumanta Dey/, true);
  const after = await pop.locator(".ant-form-item", { hasText: /No of approvals required/ }).count();
  const minOpts = after ? await options(pop.locator(".ant-form-item", { hasText: /No of approvals required/ }).locator(".ant-select").first()) : [];
  ok("UI-TBL-014", "With one approver there is no 'No of approvals required' box; with two it appears, offering 1 and 2", !e1 && !e2 && before === 0 && after === 1 && minOpts.join(",") === "1,2", `${e1 || e2 || ""} before=${before} after=${after} options=${minOpts.join(",")}`, [await shot(page, "M-14-two-approvers")]);
  await pop.getByRole("button", { name: "Cancel" }).click(); await sleep(500);
  rec("UI-BTN-003", "Control sweep — conditions table", await sweep("table", page.locator("#approvalTable").locator("xpath=..")), []);
  // TBL-020 two rows → two workflows
  const n1 = NAME("ROW1 IT"), n2 = NAME("ROW2 HR");
  await (await cell(row(), /Name \(optional\)/)).click(); await sleep(600); pop = page.locator(".ant-popover:visible").last(); await pop.locator("input, textarea").first().fill(n1); await pop.getByRole("button", { name: "Save" }).click(); await sleep(500);
  await (await cell(row(), /^Department/)).click(); await sleep(800); pop = page.locator(".ant-popover:visible").last(); await pick(pop.locator(".ant-select").first(), "", /^IT$/, true); await pop.getByRole("button", { name: "Save" }).click(); await sleep(600);
  await (await cell(row(), /^Step 1/)).click(); await sleep(1000); pop = page.locator(".ant-popover:visible").last();
  await pick(pop.locator(".ant-form-item", { hasText: /Approvers/ }).locator(".ant-select").first(), "Sumanta", /Test - Sumanta Dey/, true);
  await pop.getByPlaceholder("Enter approval duration").fill("1"); await pop.getByRole("button", { name: "Save" }).click(); await sleep(600);
  await page.getByRole("button", { name: /Add Approval Workflow/ }).click(); await sleep(800);
  const r2txt = await text(row(1));
  ok("UI-TBL-020", "'Add Approval Workflow' adds a second row pre-filled like the first (same name, Department IT, same approver)", (await page.locator("#approvalTable tbody tr").count()) === 2 && /IT/.test(r2txt) && /Sumanta/.test(r2txt), r2txt.slice(0, 200), [await shot(page, "M-15-second-row")]);
  await (await cell(row(1), /Name \(optional\)/)).click(); await sleep(600); pop = page.locator(".ant-popover:visible").last(); await pop.locator("input, textarea").first().fill(n2); await pop.getByRole("button", { name: "Save" }).click(); await sleep(500);
  await (await cell(row(1), /^Department/)).click(); await sleep(800); pop = page.locator(".ant-popover:visible").last();
  const dd = page.locator(".ant-select-dropdown:visible").last();
  await pop.locator(".ant-select").first().click({ force: true }); await sleep(600);
  const itChip = pop.locator(".ant-select-selection__choice", { hasText: "IT" }).locator(".ant-select-selection__choice__remove").first(); if (await itChip.count()) await itChip.click({ force: true });
  await pick(pop.locator(".ant-select").first(), "", /^HR$/, true); await pop.getByRole("button", { name: "Save" }).click(); await sleep(600);
  const t0 = Date.now();
  await page.getByRole("button", { name: /Publish Workflow/ }).click(); const tt = await waitToast(page, 12000); await sleep(3000);
  const listed = (await api("GET", "/approval_workflow/approval_flows?page=1&initiator_type=team")).json?.approval_flows || [];
  const f1 = listed.find((f: any) => f.name === n1), f2 = listed.find((f: any) => f.name === n2);
  if (f1) made.push(f1.uuid); if (f2) made.push(f2.uuid);
  ok("UI-TBL-020b", "Publishing two rows creates two workflows (IT and HR), each with its own approver", /successfully published/.test(tt) && !!f1 && !!f2 && f2.conditions?.some((c: any) => c.key === "department" && c.values?.some((v: any) => v.value === "HR")), `toast="${tt}" rows sent=${apiSince(t0, /create_approval_flows/).length} made=${!!f1}/${!!f2} f2 dept=${JSON.stringify(f2?.conditions?.find((c: any) => c.key === "department")?.values)}`, [await shot(page, "M-16-two-published")]);
  rec("UI-TBL-023", "Overlap: ROW1 (IT) and ROW2 (HR) plus the earlier SUB-A/SUB-B all matched one PO at the same time and published with no warning; the buyer chose in the modal", "no overlap warning anywhere in the builder; see UI-SUB-001 (two matches listed)", []);
  await del(f1?.uuid); await del(f2?.uuid);
  // TBL-015 dynamic step → "Select Approver(s)" in the modal
  const uD = await mk(NAME("DYN IT"), [{ key: "department", values: ["IT"] }], { dynamic: true });
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  await go(`${WEB}/po-form/${P}`, 4500);
  await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(5000);
  await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(5500);
  let modal = page.locator(".ant-modal:visible").last(); let mt = await text(modal);
  if (!/will be sent/.test(mt)) { const pickD = modal.getByText(NAME("DYN IT")).first(); if (await pickD.count()) { await pickD.click(); await sleep(500); await modal.locator("button.ant-btn-primary").last().click(); await sleep(2500); mt = await text(modal); } }
  s = await shot(page, "M-17-dynamic-step");
  const hasSelect = /Select Approver/i.test(mt) || (await modal.locator(".ant-select").count()) > 0;
  ok("UI-TBL-015", "A Dynamic step shows a 'Select Approver(s)' box in the submit modal; Submit without picking one is refused with 'Please select at least one approver to proceed.'", hasSelect, `modal: ${mt.slice(0, 300)}`, [s]);
  if (hasSelect) { await modal.getByRole("button", { name: /^Submit Proposal$/ }).last().click(); await sleep(2000); const tl = (await toasts(page)).join(" | "); ok("UI-TBL-015b", "Submit without an approver picked is refused: 'Please select at least one approver to proceed.'", /select at least one approver/i.test(tl), tl || "no toast", [await shot(page, "M-18-dynamic-refused")]); }
  rec("UI-BTN-005", "Control sweep — submit modal", await sweep("modal", modal), []);
  await page.keyboard.press("Escape"); await sleep(600); await del(uD);
  // PO-GD-008 lone entity auto-select
  await api("POST", `/proposal/${P}/general_details`, { values: { ...BASE, legal_entity: undefined } });
  await go(`${WEB}/po-form/${P}`, 5000);
  const sec = page.locator("section", { hasText: "General Details" }).first();
  const leSel = sec.locator("div[class*=row]", { hasText: "Legal Entity" }).first().locator(".ant-select").first();
  const leVal = await text(leSel);
  const gdNow = (await api("GET", `/proposal/${P}/general_details`)).json?.values;
  ok("UI-PO-017", "Kochi has exactly one mapped entity (DLF LIMITED): with Legal Entity empty, the form should pick it for the user (PRD rule)", /DLF LIMITED/.test(leVal) && gdNow?.legal_entity === "DLF LIMITED", `box reads "${leVal || "(empty)"}"; saved=${gdNow?.legal_entity ?? "(none)"} — server-backed lists are never auto-selected as built`, [await shot(page, "M-19-lone-entity")]);
  rec("UI-BTN-004", "Control sweep — PO form General Details", await sweep("po-form", sec), []);
  // PO-GD-014 offline save
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  await go(`${WEB}/po-form/${P}`, 4500);
  await ctx.setOffline(true);
  const noe = page.locator("section", { hasText: "General Details" }).first().locator("div[class*=row]", { hasText: "Nature of Expense" }).first().locator(".ant-select").first();
  await noe.click({ force: true }); await sleep(2000);
  const offItems = (await page.locator(".ant-select-dropdown:visible .ant-select-dropdown-menu-item").allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press("Escape");
  const depSel = page.locator("section", { hasText: "General Details" }).first().locator("div[class*=row]", { hasText: "Department" }).first().locator(".ant-select").first();
  await depSel.click({ force: true }); await sleep(1500); await page.keyboard.press("Escape");
  s = await shot(page, "M-20-offline");
  const offToast = (await toasts(page)).join(" | ");
  await ctx.setOffline(false); await sleep(1500);
  rec("UI-PO-018", "With the network off, opening a dropdown cannot load its options (the list shows a spinner / nothing) and a save cannot happen; back online the form works again", `offline list items=${offItems.join(",") || "(none)"}; toast="${offToast}"`, [s]);
  // PO-AFT-008 PO list filters
  await go(`${WEB}/purchase_orders`, 4500);
  const poText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const filterLabels = (await page.locator("th, [class*=filter] label, .ant-select-selection__placeholder").allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 25);
  rec("UI-AFT-008", "Purchase Orders list: no filter or column for Unit Name / Legal Entity / Department / Nature of Expense (PRD asked for filters and export)", /Legal Entity|Nature of Expense|Unit Name/.test(poText) ? "General Details columns/filters ARE present" : `not present; columns/filters seen: ${filterLabels.join(", ")}`, [await shot(page, "M-21-po-list")]);
} } catch (e: any) { console.log("ui part crashed:", e?.message?.slice(0, 300)); await shot(page, "crash-more-ui"); }

// ═════════════════════ API ═════════════════════
try { if (want("api")) {
  // EDT-002 change approver
  const uE = await mk(NAME("EDT approver"), [{ key: "department", values: ["IT"] }]);
  const d0 = (await api("GET", `/approval_workflow/approval_flows/${uE}`)).json;
  const t2uuid = "cEROZ2M="; // Test 2 - Sumanta Dey (seen in the approver search)
  const upd = await api("PATCH", "/approval_workflow/approval_flows/update_approval_flows", { approval_flows: [{ uuid: uE, name: d0.name, approval_type: "close_event_group", config: d0.config, initiators: d0.initiators.map((i: any) => ({ type: i.type, role: i.role, uuid: i.uuid, name: i.name })), conditions: d0.conditions.map((c: any) => ({ uuid: c.uuid, key: c.key, values: c.values.map((v: any) => v.value) })), steps: d0.steps.map((st: any) => ({ uuid: st.uuid, order: st.order, expires_in: st.expires_in, config: st.config, approvers: [{ type: "user", uuid: t2uuid }] })) }] });
  const d1 = (await api("GET", `/approval_workflow/approval_flows/${uE}`)).json;
  const appr = d1?.steps?.[0]?.approvers?.map((a: any) => a.name).join(",");
  ok("API-EDT-002", "Changing a workflow's approver (Test → Test 2 - Sumanta Dey) through the editor's PATCH saves the new approver", upd.status === 200 && appr === "Test 2 - Sumanta Dey", `${upd.status} ${errOf(upd)} → approvers now: ${appr}`, []);
  await del(uE);
  // EDT-003 + AFT-006: submit via API with our flow, edit its conditions while pending, check, withdraw
  const uW = await mk(NAME("PEND IT"), [{ key: "department", values: ["IT"] }]);
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  const sub = await api("POST", `/proposal/${P}/submit`, { approval_flow_uuid: uW, attachments: [], remarks: "QA_Platform: edit-while-pending test", step_uuid_vs_user_uuid: {} });
  ok("API-SUB-008", "Submit through the API (the dashboard's shape) with a matching QA workflow succeeds: status 'requested'", sub.status === 200 && sub.json?.status === "requested", `${sub.status} ${errOf(sub)} status=${sub.json?.status}`, []);
  if (sub.status === 200) {
    await sleep(2500);
    const dW = (await api("GET", `/approval_workflow/approval_flows/${uW}`)).json;
    const upd2 = await api("PATCH", "/approval_workflow/approval_flows/update_approval_flows", { approval_flows: [{ uuid: uW, name: dW.name, approval_type: "close_event_group", config: dW.config, initiators: dW.initiators.map((i: any) => ({ type: i.type, role: i.role, uuid: i.uuid, name: i.name })), conditions: dW.conditions.map((c: any) => ({ uuid: c.uuid, key: c.key, values: ["Security"] })), steps: dW.steps.map((st: any) => ({ uuid: st.uuid, order: st.order, expires_in: st.expires_in, config: st.config, approvers: st.approvers.map((a: any) => ({ type: a.type, uuid: a.uuid })) })) }] });
    const reqs = (await api("GET", "/approval_workflow/approval_requests?view_type=initiator&page=1")).json;
    const mine = (reqs?.approvals?.data || []).find((r: any) => r.ref_uuid === "RFX-2112" && r.status === "pending");
    const matchesNow = (await api("GET", `/proposal/${P}/approval_workflows`)).json;
    ok("API-EDT-003", "Changing the workflow's condition (IT → Security) while a request is pending: the pending request keeps its workflow and approver; the workflow no longer matches a new IT PO", upd2.status === 200 && !!mine && mine.approval_flow_name === dW.name && mine.status === "pending", `patch=${upd2.status}; pending=${!!mine} flow=${mine?.approval_flow_name} approvers=${mine?.approvers?.map((a: any) => a.status).join(",")}`, []);
    // withdraw
    const wd = await api("POST", `/approval_workflow/approval_requests/${mine?.uuid}/withdraw_approval`, { remarks: "QA_Platform: withdrawing", attachments: [] });
    await sleep(2500);
    const prop = (await api("GET", `/proposal/${P}`)).json;
    const gd = (await api("GET", `/proposal/${P}/general_details`)).json;
    ok("API-AFT-006", "The initiator can withdraw the pending request; the proposal goes back to draft with its General Details editable", wd.status === 200 && prop?.status === "draft" && gd?.is_editable === true, `withdraw=${wd.status} ${errOf(wd)} ${JSON.stringify(wd.json).slice(0, 80)}; proposal=${prop?.status}; editable=${gd?.is_editable}`, []);
  }
  await del(uW);
  // PO-API-009 bad template config (a NEW template, never the live one)
  const bad = (fields: any[]) => api("POST", "/templates", { name: NAME("BAD PO cfg"), template_for: ["po"], configurations: { is_condition_based_approval_routing_enabled: true, general_details_fields: fields }, widgets: { global_price_components: [], inline_components: [] } });
  const r1 = await bad([{ key: "total_proposal_value", label: "X", input_type: "dropdown", options: [{ key: "a", label: "A" }], order: 1 }]);
  const r2 = await bad([{ key: "legal_entity", label: "LE", input_type: "dropdown", source: "widget_data_mapping", source_key: "gd_legal_entity", parent_key: "ghost", order: 1 }]);
  const r3 = await bad([{ key: "a", label: "A", input_type: "dropdown", options: [{ key: "x", label: "X" }], parent_key: "b", order: 1 }, { key: "b", label: "B", input_type: "dropdown", options: [{ key: "y", label: "Y" }], parent_key: "a", order: 2 }]);
  for (const r of [r1, r2, r3]) if (r.status === 200 && r.json?.uuid) await api("DELETE", `/templates/${r.json.uuid}`);
  ok("API-CFG-009", "A PO template with a bad General Details set-up is refused: a reserved key, a parent that does not exist, a circular parent chain", [r1, r2, r3].every((r) => r.status === 422 && /general_details_fields/.test(r.text)), [r1, r2, r3].map((r) => `${r.status} ${errOf(r).slice(0, 110)}`).join(" || "), []);
  // AW-API-012 delete by ids vs uuids
  const uX = await mk(NAME("DEL test"), [{ key: "department", values: ["IT"] }]);
  const dIds = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { ids: [uX] });
  const dUu = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [uX] });
  if (dUu.status === 200) made.splice(made.indexOf(uX!), 1);
  ok("API-FLW-019", "Delete takes uuids ({uuids:[…]} → success); {ids:[…]} answers 'Approval Flow not found'", dIds.status === 422 && dUu.status === 200, `ids→${dIds.status} ${errOf(dIds)}; uuids→${dUu.status}`, []);
  // CFG-005/006 facts
  const comp = (await api("GET", "/approval_workflow/approval_flows?page=1&initiator_type=company")).json?.approval_flows || [];
  const catchAll = comp.filter((f: any) => f.approval_type?.key === "close_event_group" && (f.conditions || []).length === 0);
  rec("API-CFG-005", "Company-level Bid Proposal workflows with no conditions (catch-alls) on DLF UAT — they must go before go-live", `${catchAll.length} found: ${catchAll.map((f: any) => `"${f.name}" initiators ${f.initiators?.map((i: any) => i.role).join("/")}, approvers ${f.steps?.flatMap((s: any) => s.approvers.map((a: any) => a.name)).join("+")}`).join(" | ")}`, []);
  const cats = (await api("GET", "/approval_workflow/approval_flows/conditions")).json || [];
  rec("API-CFG-006", "The condition names carry the PO template's name, '(Test)' included", cats.filter((c: any) => /General Details/.test(c.name)).map((c: any) => c.name).join(" | "), []);
} } catch (e: any) { console.log("api part crashed:", e?.message?.slice(0, 300)); }

// ═════════════════════ APPROVE (awards RFX-2112 to Demo10 — the last thing we do) ═════════════════════
try { if (want("approve")) {
  const uA = await mk(NAME("APPROVE IT"), [{ key: "department", values: ["IT"] }]);
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  const sub = await api("POST", `/proposal/${P}/submit`, { approval_flow_uuid: uA, attachments: [], remarks: "QA_Platform: approve test", step_uuid_vs_user_uuid: {} });
  console.log("submit", sub.status, errOf(sub));
  if (sub.status === 200) {
    await sleep(3000);
    const pend = (await api("GET", "/approval_workflow/approval_requests?view_type=approver&page=1")).json;
    const req = (pend?.approvals?.data || []).find((r: any) => r.ref_uuid === "RFX-2112" && r.status === "pending");
    const ap = req?.approvers?.find((a: any) => a.my_approval_required) || req?.approvers?.[0];
    await go(`${WEB}/approvals`, 4500);
    const s0 = await shot(page, "M-22-pending-before-approve");
    const rr = await api("POST", "/approval_workflow/approval_requests/resolve_approval", { approver_uuid: ap?.uuid, resolution: "accepted", remarks: "QA_Platform: approving", attachments: [] });
    await sleep(5000);
    const prop = (await api("GET", `/proposal/${P}`)).json;
    const reqAfter = (await api("GET", "/approval_workflow/approval_requests?view_type=initiator&page=1")).json?.approvals?.data?.find((r: any) => r.ref_uuid === "RFX-2112");
    const gdAfter = (await api("GET", `/proposal/${P}/general_details`)).json;
    await go(`${WEB}/po-form/${P}`, 4500);
    const s1 = await shot(page, "M-23-after-approve");
    ok("API-AFT-004", "Approving the request (as its approver) completes the approval: the request is approved and the proposal moves on from 'requested'", rr.status === 200 && prop?.status !== "requested" && reqAfter?.status !== "pending", `approve=${rr.status} ${errOf(rr)}; proposal status=${prop?.status}; request=${reqAfter?.status}; GD editable=${gdAfter?.is_editable} values kept=${gdAfter?.values?.legal_entity === "DLF LIMITED"}`, [s0, s1]);
    rec("API-AFT-004b", "What the PO form shows after approval (General Details read-only, values kept)", `url=${page.url()} editable=${gdAfter?.is_editable} values=${JSON.stringify(gdAfter?.values)}`, [s1]);
  } else ok("API-AFT-004", "Approve flow — submit failed", false, `${sub.status} ${errOf(sub)}`);
  await del(uA);
} } catch (e: any) { console.log("approve part crashed:", e?.message?.slice(0, 300)); }

for (const u of [...made]) console.log("deleted", u, await del(u));
await browser.close();
console.log(`done: ${L.rows.length} rows; pass ${L.rows.filter((x) => x.verdict === "Pass").length}, fail ${L.rows.filter((x) => x.verdict === "Fail").length}`);
