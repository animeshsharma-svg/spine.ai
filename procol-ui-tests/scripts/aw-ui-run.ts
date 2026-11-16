/**
 * Approval routing — UI execution on cpanel.ag-ri.in (DLF Hospitality UAT), signed in with the tester's token.
 *
 *   npx tsx scripts/aw-ui-run.ts --stage builder|poform|submit|all [--headed]
 *
 * builder : Approval Workflows list → Create → Trigger Settings drawer → conditions table → Publish → list → Edit → Delete
 * poform  : the General Details section of the draft PO form (RFX-2112): locks, dependent dropdown, clearing, saving, errors
 * submit  : the Submit Proposal modal (matching workflows), one real submit routed to the test user, then reject → draft again
 *
 * Every workflow it publishes is named "QA_Platform AW <stamp> …" and has the test user as its only approver.
 * Results → prototype/data/evidence/approval-routing/ui-results.json, screenshots in shots/.
 */
import type { Locator, Page } from "@playwright/test";
import { openBrowser, settle, shot, sleep, toasts, waitToast, WEB, uuidOf, DLF, Ledger, OUT, SHOTS, api, NAME, STAMP, errOf } from "./aw-lib";

const stageArg = (() => { const i = process.argv.indexOf("--stage"); return i >= 0 ? process.argv[i + 1] : "all"; })();
const want = (s: string) => stageArg === "all" || stageArg === s;
const L = new Ledger(`${OUT}/ui-results.json`);
const { browser, page, net } = await openBrowser({ headed: process.argv.includes("--headed") });
const P = uuidOf(DLF.draftProposalId);
const U = DLF.hubs;
const madeFlows: string[] = [];

const ok = (id: string, title: string, pass: boolean, observed: string, shots: string[] = [], extra: any = {}) => L.put({ id, title, verdict: pass ? "Pass" : "Fail", observed, shots, ...extra });
const rec = (id: string, title: string, observed: string, shots: string[] = []) => L.put({ id, title, verdict: "Record", observed, shots });
const tell = (id: string, title: string, observed: string, shots: string[] = []) => L.put({ id, title, verdict: "Couldn't tell", observed, shots });
const text = async (l: Locator) => (await l.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const apiSince = (t: number, re: RegExp) => net.filter((n) => n.at >= t && re.test(n.url));

// ───────── antd helpers ─────────
async function pickFromSelect(sel: Locator, typed: string, optionText: string | RegExp, o: { multi?: boolean; exactClick?: boolean } = {}): Promise<string> {
  await sel.click({ force: true });
  await sleep(300);
  if (typed) await page.keyboard.type(typed, { delay: 40 });
  await sleep(typed ? 3000 : 900);
  const dd = page.locator(".ant-select-dropdown:visible").last();
  const opt = dd.locator(".ant-select-dropdown-menu-item", { hasText: optionText });
  const n = await opt.count();
  if (!n) { const all = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts()).map((t) => t.trim()).slice(0, 15); await page.keyboard.press("Escape"); return `no option "${optionText}" among: ${all.join(" / ")}`; }
  await opt.first().click();
  await sleep(400);
  if (o.multi) await page.keyboard.press("Escape");
  return "";
}
async function dropdownOptions(sel: Locator, typed = ""): Promise<string[]> {
  await sel.click({ force: true }); await sleep(300);
  if (typed) await page.keyboard.type(typed, { delay: 40 });
  await sleep(1200);
  const dd = page.locator(".ant-select-dropdown:visible").last();
  const items = (await dd.locator(".ant-select-dropdown-menu-item").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  const nf = await text(dd.locator(".ant-select-not-found, .ant-empty-description, .ant-select-dropdown-menu-item-disabled").first());
  await page.keyboard.press("Escape"); await sleep(200);
  return items.length ? items : (nf ? [`[${nf}]`] : []);
}


async function setupDrawer() {
  await page.goto(`${WEB}/approvals-workflows/create?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3000);
  await page.getByText("Add Trigger Settings").first().click(); await sleep(1500);
  const d = page.locator(".ant-drawer:visible").last();
  await pickFromSelect(d.locator(".ant-select").first(), "", /^Bid Proposal$/);
  const cs = d.locator(".ant-select").nth(1);
  for (const c of ["Unit Name - DLF PO", "Legal Entity - DLF PO", "Department - DLF PO"]) await pickFromSelect(cs, "", new RegExp("^" + c.replace(/[-()]/g, "\\$&")));
  await pickFromSelect(d.locator(".ant-form-item", { hasText: "Team" }).locator(".ant-select").first(), "", /^All Categories$/);
  await sleep(600);
  const i = d.locator(".ant-form-item", { hasText: /Initiator/ }).locator(".ant-select").first();
  if (await i.count()) await pickFromSelect(i, "", /^Member$/);
  await d.getByRole("button", { name: "Save" }).click(); await sleep(2000);
}

// ═══════════════════════ BUILDER ═══════════════════════
try { if (want("builder")) {
  // list page
  await page.goto(`${WEB}/approvals-workflows?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3000);
  let s = await shot(page, "B-01-list");
  const tabs = (await page.locator(".ant-tabs-tab").allInnerTexts().catch(() => [])).map((t) => t.trim());
  const heads = (await page.locator("th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  ok("UI-LST-001", "Approval Workflows opens on the Team tab with the workflow table and a Create button", tabs.includes("Team") && heads.includes("Name") && heads.includes("Approval Type") && (await page.getByRole("button", { name: /Create/ }).count()) > 0, `tabs=${tabs.join(",")} columns=${heads.join(" | ")}`, [s]);
  ok("UI-LST-002", "The table has one column per routing condition in use, named '<Field> - DLF PO - General Details (Test)'", heads.some((h) => /Form Type - DLF PO - General Details \(Test\)/.test(h)), heads.filter((h) => /General Details/.test(h)).join(" | "), [s]);
  const pager = await text(page.locator(".ant-pagination, [class*=pagination]").first());
  rec("UI-LST-003", "Pagination of the Team list (page x / y)", pager || "no pager text found", [s]);
  const compTab = page.locator(".ant-tabs-tab", { hasText: "Company" });
  if (await compTab.count()) { await compTab.click(); await settle(page, 2500); s = await shot(page, "B-02-company-tab"); const names = (await page.locator("tbody tr td:first-child").allInnerTexts().catch(() => [])).map((t) => t.trim()).slice(0, 8); rec("UI-LST-004", "Company tab lists the company-level workflows (three 'test' catch-alls with no conditions exist on UAT)", names.join(" | "), [s]); }

  // create page + drawer
  await page.goto(`${WEB}/approvals-workflows/create?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3000);
  s = await shot(page, "B-03-create-empty");
  const addTrig = page.getByText("Add Trigger Settings").first();
  ok("UI-CRT-001", "Create page shows the heading 'Setup New Team Approval Workflow' and a dashed '+ Add Trigger Settings' box", (await page.getByText("Setup New Team Approval Workflow").count()) > 0 && (await addTrig.count()) > 0, `heading found; box found=${await addTrig.count()}`, [s]);
  await addTrig.click(); await sleep(1500);
  const drawer = page.locator(".ant-drawer:visible").last();
  s = await shot(page, "B-04-drawer");
  const labels = (await drawer.locator(".ant-form-item-label, label").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  ok("UI-CRT-002", "Trigger Settings drawer opens with Approval Type first; Save and Cancel at the bottom", (await text(drawer)).includes("Trigger Settings") && labels.some((l) => /Approval Type/.test(l)) && (await drawer.getByRole("button", { name: "Save" }).count()) > 0, `labels=${labels.join(",")}`, [s]);
  // approval types
  const typeSel = drawer.locator(".ant-select").first();
  const types = await dropdownOptions(typeSel);
  ok("UI-CRT-003", "Approval Type lists Quote Selection, Bid Proposal, Technical Evaluation, Event Creation, Surrogate Bid Creation, Create Product, Reorder Proposal, Create User…", ["Quote Selection", "Bid Proposal", "Technical Evaluation", "Event Creation"].every((t) => types.includes(t)), types.join(", "), [s]);
  let err = await pickFromSelect(typeSel, "", /^Bid Proposal$/);
  await sleep(800); s = await shot(page, "B-05-drawer-type");
  ok("UI-CRT-004", "Choosing Bid Proposal shows it as a chip with an x, and the Conditions box appears", !err && (await drawer.getByText("Bid Proposal").count()) > 0 && (await drawer.getByText(/Add Conditions/).count()) > 0, err || "chip + Conditions shown", [s]);
  const condSel = drawer.locator(".ant-select").nth(1);
  const conds = await dropdownOptions(condSel);
  ok("UI-CRT-005", "Conditions for Bid Proposal list Auction Rank, Total Proposal Value, PR Price and the five General Details conditions marked '(Test)'", ["Total Proposal Value", "Form Type - DLF PO - General Details (Test)", "Unit Name - DLF PO - General Details (Test)", "Legal Entity - DLF PO - General Details (Test)", "Department - DLF PO - General Details (Test)", "Nature of Expense - DLF PO - General Details (Test)"].every((c) => conds.includes(c)), conds.join(" / "), [s]);
  for (const c of ["Unit Name - DLF PO", "Legal Entity - DLF PO", "Department - DLF PO"]) { err = await pickFromSelect(condSel, "", new RegExp("^" + c.replace(/[-()]/g, "\\$&"))); if (err) break; }
  await sleep(600); s = await shot(page, "B-06-drawer-conditions");
  const dtext = await text(drawer);
  ok("UI-CRT-006", "Three conditions (Unit Name, Legal Entity, Department) can be added; each shows as a chip with an x", !err && /Unit Name - DLF PO/.test(dtext) && /Legal Entity - DLF PO/.test(dtext) && /Department - DLF PO/.test(dtext), err || dtext.slice(0, 300), [s]);
  // the same condition twice?
  const again = await dropdownOptions(condSel);
  ok("UI-CRT-007", "A condition already chosen is no longer offered in the Conditions list", !again.some((t) => /^Department - DLF PO/.test(t)), again.join(" / "), [s]);
  // team
  const teamSel = drawer.locator(".ant-form-item", { hasText: "Team" }).locator(".ant-select").first();
  const teams = await dropdownOptions(teamSel);
  ok("UI-CRT-008", "Team lists the purchase teams (All Categories, Evaluator, Project Purchase, Purchase Club 3…)", teams.includes("All Categories") && teams.some((t) => /Purchase Club/.test(t)), teams.slice(0, 12).join(", "), [s]);
  err = await pickFromSelect(teamSel, "", /^All Categories$/);
  await sleep(800);
  const initSel = drawer.locator(".ant-form-item", { hasText: /Initiator/ }).locator(".ant-select").first();
  const inits = (await initSel.count()) ? await dropdownOptions(initSel) : [];
  s = await shot(page, "B-07-drawer-team");
  ok("UI-CRT-009", "After the team, Initiators offers Member, Manager, Admin (the roles in that team)", inits.includes("Member") && inits.includes("Admin"), inits.join(", ") || "no Initiators box", [s]);
  if (await initSel.count()) err = await pickFromSelect(initSel, "", /^Member$/);
  // save without approval type? (negative) — we test the empty-drawer save separately later
  await drawer.getByRole("button", { name: "Save" }).click(); await sleep(2000);
  s = await shot(page, "B-08-table");
  const cards = await text(page.locator("[class*=triggerDetails], .ant-card").first());
  let ths = (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  ok("UI-CRT-010", "Saving the drawer shows the Bid Proposal summary (Trigger Conditions, Applicable Teams, Initiators) and a table with Action, Name (optional), Prevent Approval Expiry, the three conditions and Step 1", ths.includes("Action") && ths.some((t) => /Name \(optional\)/.test(t)) && ths.some((t) => /Prevent Approval Expiry/.test(t)) && ths.some((t) => /Unit Name/.test(t)) && ths.some((t) => /Step 1/.test(t)), `columns=${ths.join(" | ")}; summary=${cards.slice(0, 160)}`, [s]);
  ok("UI-CRT-011", "The note 'All approval conditions must match for approval workflow to trigger' is shown under the table", (await page.getByText("All approval conditions must match").count()) > 0, "note present", [s]);
  ok("UI-CRT-012", "Publish Workflow button appears at the top right once trigger settings exist", (await page.getByRole("button", { name: /Publish Workflow/ }).count()) > 0, "button present", [s]);

  // Publish with the row untouched → the page claims success and sends an empty list (bug)
  let t0 = Date.now();
  await page.getByRole("button", { name: /Publish Workflow/ }).click(); await sleep(3000);
  s = await shot(page, "B-09-publish-empty");
  let toast0 = (await toasts(page)).join(" | ");
  const emptyPost = apiSince(t0, /create_approval_flows/);
  const errMsg0 = await text(page.locator("[class*=tableErrorMessage]").first());
  ok("UI-CRT-013", "Publish Workflow with the row untouched (no name, no conditions, no approver) must be refused on the page", /Please enter valid responses/.test(errMsg0) && !/successfully published/.test(toast0), `toast="${toast0}" api=${emptyPost.map((c) => `${c.method} ${c.status} body=${c.body}`).join(";")} url=${page.url()}`, [s], { bug: "Publish with an untouched row shows 'Approval workflow has been successfully published', sends approval_flows: [] and returns to the list — nothing is created" });
  // back to a fresh create page with the same trigger settings
  await setupDrawer();
  ths = (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  // fill name
  const row = page.locator("#approvalTable tbody tr").first();
  const nameCell = row.locator("td").nth(1);
  await nameCell.click(); await sleep(600);
  let pop = page.locator(".ant-popover:visible").last();
  const nameInput = pop.locator("input, textarea").first();
  const flowName = NAME("UI1 Kochi IT");
  if (await nameInput.count()) { await nameInput.fill(flowName); await pop.getByRole("button", { name: "Save" }).click(); await sleep(600); }
  // Prevent Approval Expiry toggle
  const toggle = row.locator(".ant-switch").first();
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click({ force: true }); await sleep(500);
  const after = await toggle.getAttribute("aria-checked");
  ok("UI-CRT-014", "Prevent Approval Expiry switch flips from Disabled to Enabled in the row", before === "false" && after === "true" && (await text(row)).includes("Enabled"), `before=${before} after=${after} row=${(await text(row)).slice(0, 80)}`, [await shot(page, "B-10-row-name-toggle")]);

  // Publish with a name but no approver → the row is now a real object → validation fires
  await page.getByRole("button", { name: /Publish Workflow/ }).click(); await sleep(1500);
  const errMsg = await text(page.locator("[class*=tableErrorMessage]").first());
  ok("UI-CRT-013b", "Publish with a name but no approver is refused: 'Please enter valid responses for each row. Step 1 is required fields.'", /Please enter valid responses for each row/.test(errMsg) && /Step 1/.test(errMsg), errMsg || (await toasts(page)).join(" | ") || "no message", [await shot(page, "B-09b-publish-no-step")]);
  // condition: Unit Name = Kochi (multi-select popover)
  const unitIdx = ths.findIndex((t) => /^Unit Name/.test(t));
  await row.locator("td").nth(unitIdx).click(); await sleep(800);
  pop = page.locator(".ant-popover:visible").last();
  s = await shot(page, "B-11-unit-popover");
  const popTitle = await text(pop.locator(".ant-form-item-label").first());
  const hint = await text(pop.locator("[class*=editorHint]").first());
  ok("UI-CRT-015", "The Unit Name cell opens a picker titled 'Select Unit Name - …' with the hint 'Match … with any of the selected options' (several values allowed)", /Select Unit Name/.test(popTitle) && /any of the selected options/.test(hint), `${popTitle} | ${hint}`, [s]);
  const unitSel = pop.locator(".ant-select").first();
  const unitOpts = await dropdownOptions(unitSel);
  ok("UI-CRT-016", "Unit Name offers every buyer hub (34) incl. '-', 'Free Text', 'Plant Name', 'Project BOQ team' and 'DLF Golf and Country Club' twice — not a curated unit list", unitOpts.length >= 30 && unitOpts.includes("-") && unitOpts.filter((t) => t === "DLF Golf and Country Club").length === 2, `${unitOpts.length} options; first: ${unitOpts.slice(0, 8).join(", ")}`, [s], { verdict: "Record" });
  err = await pickFromSelect(unitSel, "Kochi", /Kochi/, { multi: true });
  const err2 = await pickFromSelect(unitSel, "Lodhi", /^The Lodhi$/, { multi: true });
  s = await shot(page, "B-12-unit-two");
  ok("UI-CRT-017", "Two units (National Clubs -Kochi and The Lodhi) can be picked in one condition", !err && !err2 && (await text(pop)).includes("Kochi") && (await text(pop)).includes("Lodhi"), err || err2 || "both chips in the picker", [s]);
  await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
  ok("UI-CRT-018", "After Save the cell shows the first unit and '+1 more' for the second", /Kochi/.test(await text(row)) && /\+1 more/.test(await text(row)), (await text(row)).slice(0, 200), [await shot(page, "B-13-unit-saved")]);

  // Legal Entity picker: does it respect the chosen units? (PRD says yes; PR says no)
  const leIdx = ths.findIndex((t) => /^Legal Entity/.test(t));
  await row.locator("td").nth(leIdx).click(); await sleep(800);
  pop = page.locator(".ant-popover:visible").last();
  const leSel = pop.locator(".ant-select").first();
  const leOpts = await dropdownOptions(leSel);
  s = await shot(page, "B-14-entity-popover");
  rec("UI-CRT-019", "With Units Kochi + Lodhi chosen, the Legal Entity picker still offers all 7 entities (PRD: 'value pickers respect nesting'; the PR decided against it)", `${leOpts.length} options: ${leOpts.join(", ")}`, [s]);
  err = await pickFromSelect(leSel, "DLF LIM", /^DLF LIMITED$/, { multi: true });
  await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
  // Department = IT
  const depIdx = ths.findIndex((t) => /^Department/.test(t));
  await row.locator("td").nth(depIdx).click(); await sleep(800);
  pop = page.locator(".ant-popover:visible").last();
  err = await pickFromSelect(pop.locator(".ant-select").first(), "IT", /^IT$/, { multi: true });
  await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
  ok("UI-CRT-020", "Legal Entity = DLF LIMITED and Department = IT saved into the row", /DLF LIMITED/.test(await text(row)) && /\bIT\b/.test(await text(row)), (await text(row)).slice(0, 220), [await shot(page, "B-15-conditions-set")]);

  // Step 1: fixed, approver = the test user, duration
  const stepIdx = ths.findIndex((t) => /^Step 1/.test(t));
  await row.locator("td").nth(stepIdx).click(); await sleep(1000);
  pop = page.locator(".ant-popover:visible").last();
  s = await shot(page, "B-16-step-popover");
  const popText = await text(pop);
  ok("UI-CRT-021", "The Step 1 cell opens a popover with Step Type Fixed/Dynamic (Fixed: 'Approvers are pre-defined in the workflow and cannot be choosen by the initiator'), Step 1 Approvers, Approval Duration, Step Title", /Step Type/.test(popText) && /Fixed/.test(popText) && /Dynamic/.test(popText) && /Approvers/.test(popText) && /Approval Duration/.test(popText), popText.slice(0, 300), [s]);
  rec("UI-CRT-022", "Typo in the Fixed step hint: 'cannot be choosen'", /choosen/.test(popText) ? "the hint reads 'choosen' (should be 'chosen')" : "hint text: " + popText.slice(0, 120), [s]);
  const apprSel = pop.locator(".ant-form-item", { hasText: /Approvers/ }).locator(".ant-select").first();
  err = await pickFromSelect(apprSel, "Sumanta", /Test - Sumanta Dey/, { multi: true });
  const durInput = pop.getByPlaceholder("Enter approval duration");
  if (await durInput.count()) { await durInput.fill("2"); }
  s = await shot(page, "B-17-step-filled");
  ok("UI-CRT-023", "Approver search finds 'Test - Sumanta Dey (sumonto.dey@gmail.com)' and a duration of 2 can be typed", !err && (await text(pop)).includes("Sumanta"), err || "approver chip + duration 2", [s]);
  await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
  ok("UI-CRT-024", "The Step 1 cell shows the approver's name after Save", /Sumanta/.test(await text(row)), (await text(row)).slice(0, 260), [await shot(page, "B-18-step-saved")]);

  // Duplicate row + delete it
  await row.locator("button").first().click(); await sleep(800);
  let rows = await page.locator("#approvalTable tbody tr").count();
  s = await shot(page, "B-19-duplicated");
  ok("UI-CRT-025", "Duplicate Workflow copies the row (2 rows, same conditions and step)", rows === 2 && /Sumanta/.test(await text(page.locator("#approvalTable tbody tr").nth(1))), `rows=${rows}`, [s]);
  await page.locator("#approvalTable tbody tr").nth(1).locator("button").nth(1).click(); await sleep(800);
  const confirm = page.locator(".ant-modal-confirm:visible").last();
  s = await shot(page, "B-20-delete-confirm");
  ok("UI-CRT-026", "Delete Workflow asks 'Are you sure you want to delete this approval workflow?' with a red OK", /Are you sure you want to delete this approval workflow/.test(await text(confirm)), (await text(confirm)).slice(0, 120), [s]);
  await confirm.getByRole("button", { name: /OK|Yes|Delete/ }).first().click(); await sleep(800);
  rows = await page.locator("#approvalTable tbody tr").count();
  ok("UI-CRT-027", "After OK the duplicate row is gone (1 row)", rows === 1, `rows=${rows}`, [await shot(page, "B-21-deleted")]);

  // Add Step → Step 2 column (then leave it empty: allowed?)
  await page.getByRole("button", { name: /Add Step/ }).click(); await sleep(800);
  const ths2 = (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
  rec("UI-CRT-028", "Add Step adds a 'Step N' column at the right of the table (the create page already shows Step 1–3)", `columns now: ${ths2.filter((t) => /^Step/.test(t)).join(", ")}`, [await shot(page, "B-22-add-step")]);

  // Publish
  t0 = Date.now();
  await page.getByRole("button", { name: /Publish Workflow/ }).click();
  const toast = await waitToast(page, 10000); await sleep(2500);
  s = await shot(page, "B-23-published");
  const created = apiSince(t0, /create_approval_flows/);
  const listed = (await api("GET", "/approval_workflow/approval_flows?page=1&initiator_type=team")).json?.approval_flows || [];
  const madeUuid: string | undefined = listed.find((f: any) => f.name === flowName)?.uuid;
  if (madeUuid) madeFlows.push(madeUuid);
  ok("UI-CRT-029", "Publish Workflow saves it: green 'Approval workflow has been successfully published' and back to the list", /successfully published/.test(toast) && /approvals-workflows\?approvalType=team/.test(page.url()), `toast="${toast}" url=${page.url()} api=${created.map((c) => c.status).join(",")}`, [s]);
  const body = created[0]?.body || "";
  rec("UI-CRT-030", "What the page sends on Publish (conditions as lists of values, steps with approver uuids)", body.slice(0, 700), []);
  // find it in the list
  if (!/approvals-workflows\?/.test(page.url())) { await page.goto(`${WEB}/approvals-workflows?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3000); }
  const listText = await text(page.locator("table").first());
  const listedRow = page.locator("tbody tr", { hasText: flowName }).first();
  ok("UI-CRT-031", "The new workflow appears in the Team list with its conditions in the columns (Kochi +1 more, DLF LIMITED, IT)", madeUuid !== undefined && (await listedRow.count()) > 0 && /Kochi/.test(await text(listedRow)) && /DLF LIMITED/.test(await text(listedRow)), (await listedRow.count()) ? (await text(listedRow)).slice(0, 200) : `not on page 1; made=${madeUuid}`, [await shot(page, "B-24-list-after")]);

  // Edit: open it, change Department IT → IT + HR, Save
  if (madeUuid) {
    await page.goto(`${WEB}/approvals-workflows/edit/${madeUuid}?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3500);
    s = await shot(page, "B-25-edit");
    const erow = page.locator("#approvalTable tbody tr").first();
    const eths = (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
    ok("UI-EDT-001", "Edit opens the saved workflow with its name, conditions and step filled; the button reads 'Save Workflow'", /Kochi/.test(await text(erow)) && /Sumanta/.test(await text(erow)) && (await page.getByRole("button", { name: /Save Workflow/ }).count()) > 0, (await text(erow)).slice(0, 220), [s]);
    const dIdx = eths.findIndex((t) => /^Department/.test(t));
    if (dIdx >= 0) {
      await erow.locator("td").nth(dIdx).click(); await sleep(800);
      pop = page.locator(".ant-popover:visible").last();
      err = await pickFromSelect(pop.locator(".ant-select").first(), "HR", /^HR$/, { multi: true });
      await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
      const t1 = Date.now();
      await page.getByRole("button", { name: /Save Workflow/ }).click();
      const t = await waitToast(page, 10000); await sleep(2000);
      s = await shot(page, "B-26-edit-saved");
      const upd = apiSince(t1, /update_approval_flows/);
      ok("UI-EDT-002", "Adding HR to Department and saving: 'Approval workflow has been successfully updated'; the API gets PATCH update_approval_flows", /successfully updated/.test(t) && upd.some((u) => u.status === 200), `toast="${t}" api=${upd.map((u) => u.status).join(",")}`, [s]);
      const d = (await api("GET", `/approval_workflow/approval_flows/${madeUuid}`)).json;
      const dep = (d?.conditions || []).find((c: any) => c.key === "department");
      ok("UI-EDT-003", "The saved Department condition now holds IT and HR", (dep?.values || []).map((v: any) => v.value).sort().join(",") === "HR,IT", JSON.stringify(dep?.values), []);
    }
  }
  // Drawer negatives: Save with nothing picked
  await page.goto(`${WEB}/approvals-workflows/create?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 2500);
  await page.getByText("Add Trigger Settings").first().click(); await sleep(1200);
  const dr = page.locator(".ant-drawer:visible").last();
  await dr.getByRole("button", { name: "Save" }).click(); await sleep(800);
  s = await shot(page, "B-27-drawer-empty-save");
  const help = (await dr.locator(".ant-form-explain, .ant-form-item-explain, [class*=help]").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  const skeleton = await dr.locator(".ant-skeleton").count();
  const fields = await dr.locator(".ant-select").count();
  L.put({ id: "UI-CRT-032", title: "Saving the drawer with nothing picked shows 'Approval Type cannot be empty' and keeps the fields", verdict: help.some((h) => /cannot be empty/.test(h)) && fields > 0 ? "Pass" : "Fail", observed: (help.join(" | ") || "no message") + `; selects left=${fields}; skeleton bars=${skeleton}. Earlier probe (same day, slower network): the fields vanished and grey loading bars showed with no message (probe2-drawer-empty-save.png) — a race when Save is clicked before the option lists load`, shots: [s, `${SHOTS}/probe2-drawer-empty-save.png`], bug: skeleton > 0 || fields === 0 ? "Save on an empty Trigger Settings drawer replaces the fields with grey loading bars and shows no message" : "Clicking Save before the drawer's lists have loaded blanks the drawer (grey bars, no message)" });
  await dr.getByRole("button", { name: "Cancel" }).click(); await sleep(600);
  // Leaving the page with unsaved work
  await page.goto(`${WEB}/approvals-workflows?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {}); await settle(page, 2000);
  rec("UI-CRT-033", "Leaving the create page: a browser prompt 'Are you sure you want to exit creating approval workflow?' guards unsaved rows (not triggered with an empty page)", page.url(), [await shot(page, "B-28-left")]);
}

} catch (e: any) { console.log("stage builder crashed:", e?.message?.slice(0, 300)); await shot(page, "crash-builder"); }
// ═══════════════════════ EDIT (the team's edit page; other people's rows are never re-saved) ═══════════════════════
try { if (want("edit")) {
  const flowName = NAME("UIE Kochi IT");
  const r0 = await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [{ name: flowName, approval_type: "close_event_group", config: { stop_expiry_in_approval: true }, initiators: [{ type: "team", role: "member", uuid: uuidOf(DLF.teamAll), name: "All Categories" }], conditions: [{ key: "unit_name", values: [U.kochi, U.lodhi] }, { key: "legal_entity", values: ["DLF LIMITED"] }, { key: "department", values: ["IT"] }], steps: [{ name: "Step 1", order: 0, expires_in: 86400, config: { no_of_approvals_required: false }, approvers: [{ type: "user", uuid: uuidOf(DLF.testUserId) }] }] }] });
  const madeUuid = r0.json?.[0]?.uuid; if (madeUuid) madeFlows.push(madeUuid);
  if (madeUuid) {
    // the Edit link of the team block opens /approvals-workflows/edit/<TEAM uuid>: one table with every workflow of the team
    await page.goto(`${WEB}/approvals-workflows?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3500);
    const editLink = page.getByText(/^\s*Edit\s*$/).filter({ has: page.locator("svg") }).first();
    const teamEditUrl = `${WEB}/approvals-workflows/edit/${uuidOf(DLF.teamAll)}?approvalType=team`;
    if (await editLink.count()) { await editLink.click(); await sleep(1500); } 
    if (!/approvals-workflows\/edit\//.test(page.url())) await page.goto(teamEditUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await settle(page, 4000);
    await page.locator("#approvalTable tbody tr").first().waitFor({ timeout: 90_000 }).catch(() => {});
    let s = await shot(page, "E-01-edit-team");
    const rows = page.locator("#approvalTable tbody tr");
    const n = await rows.count();
    const mine = rows.filter({ hasText: flowName }).first();
    ok("UI-EDT-001", "The team's Edit link opens 'Edit Team Workflows - All Categories' (address /approvals-workflows/edit/<team>) with one row per workflow of the team, incl. the new one with its values", /Edit Team Workflows - All Categories/.test(await text(page.locator("body"))) && n >= 2 && (await mine.count()) > 0 && /Kochi/.test(await text(mine)) && /Sumanta/.test(await text(mine)), `url=${page.url()} rows=${n} mine=${(await mine.count()) ? (await text(mine)).slice(0, 200) : "not found"}`, [s]);
    rec("UI-EDT-001b", "The address /approvals-workflows/edit/<workflow uuid> (a workflow's own uuid) opens an empty 'Edit Team Workflows - undefined' page — the id in the address is the TEAM's, not the workflow's", "seen with an API-made workflow's uuid: heading 'Edit Team Workflows - undefined', only '+ Add Trigger Settings'", [`${SHOTS}/crash-edit.png`]);
    if (await mine.count()) {
      const eths = (await page.locator("#approvalTable th").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim());
      const dIdx = eths.findIndex((t) => /^Department/.test(t));
      await mine.locator("td").nth(dIdx).click(); await sleep(800);
      const pop = page.locator(".ant-popover:visible").last();
      const err = await pickFromSelect(pop.locator(".ant-select").first(), "HR", /^HR$/, { multi: true });
      await pop.getByRole("button", { name: "Save" }).click(); await sleep(800);
      ok("UI-EDT-002", "In the team editor the new workflow's Department cell takes a second value (IT +1 more)", !err && /\+1 more|HR/.test(await text(mine)), (await text(mine)).slice(0, 220), [await shot(page, "E-02-edit-changed")]);
      // intercept the save so other people's workflows are never re-sent by this test; inspect the payload instead
      let captured: any = null;
      await page.route("**/update_approval_flows", async (route) => { captured = { method: route.request().method(), body: route.request().postData() }; await route.abort(); });
      await page.getByRole("button", { name: /Save Workflow/ }).click(); await sleep(3000);
      await page.unroute("**/update_approval_flows");
      s = await shot(page, "E-03-save-intercepted");
      let flows: any[] = []; try { flows = JSON.parse(captured?.body || "{}").approval_flows || []; } catch { /* */ }
      const mineRow = flows.find((f: any) => f.name === flowName);
      const others = flows.filter((f: any) => f.name !== flowName).map((f: any) => f.name);
      rec("UI-EDT-003", "Save Workflow on the team editor sends EVERY workflow of the team in one PATCH update_approval_flows (not only the changed row) — the request was blocked by the test so nobody else's workflow was re-saved", `${captured ? captured.method : "no request"}; rows sent=${flows.length}; others included: ${others.join(" | ").slice(0, 300)}`, [s]);
      ok("UI-EDT-004", "The payload for the edited row carries Department IT and HR (what Save would store)", !!mineRow && (mineRow.conditions || []).some((c: any) => c.key === "department" && [...(c.values || [])].sort().join(",") === "HR,IT"), JSON.stringify(mineRow?.conditions).slice(0, 300), []);
      // apply the same change through the API for our own row only, and confirm
      if (mineRow) {
        const d0 = (await api("GET", `/approval_workflow/approval_flows/${madeUuid}`)).json;
        const upd = await api("PATCH", "/approval_workflow/approval_flows/update_approval_flows", { approval_flows: [{ ...mineRow, uuid: madeUuid, conditions: (d0.conditions || []).map((c: any) => ({ uuid: c.uuid, key: c.key, values: c.key === "department" ? ["IT", "HR"] : c.values.map((v: any) => v.value) })), steps: (d0.steps || []).map((st: any) => ({ uuid: st.uuid, order: st.order, expires_in: st.expires_in, config: st.config, approvers: st.approvers.map((a: any) => ({ type: a.type, uuid: a.uuid })) })) }] });
        const d1 = (await api("GET", `/approval_workflow/approval_flows/${madeUuid}`)).json;
        const dep = (d1?.conditions || []).find((c: any) => c.key === "department");
        ok("UI-EDT-005", "Updating only our workflow through the same PATCH: Department becomes IT + HR; the list shows 'IT +1 more'", upd.status === 200 && (dep?.values || []).map((v: any) => v.value).sort().join(",") === "HR,IT", `${upd.status} ${errOf(upd)} → ${JSON.stringify(dep?.values)}`, []);
      }
      // delete our row in the editor: capture the DELETE, block it, then delete through the API
      await page.goto(teamEditUrl, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 4000);
      await page.locator("#approvalTable tbody tr").first().waitFor({ timeout: 90_000 }).catch(() => {});
      const mine2 = page.locator("#approvalTable tbody tr").filter({ hasText: flowName }).first();
      await mine2.locator("button").nth(1).click(); await sleep(800);
      const confirm = page.locator(".ant-modal-confirm:visible").last();
      const ask = await text(confirm);
      await confirm.getByRole("button", { name: /OK/ }).first().click(); await sleep(800);
      let delBody: any = null;
      await page.route("**/delete_approval_flows", async (route) => { delBody = route.request().postData(); await route.abort(); });
      await page.route("**/update_approval_flows", async (route) => { await route.abort(); });
      await page.getByRole("button", { name: /Save Workflow/ }).click(); await sleep(3000);
      await page.unroute("**/delete_approval_flows"); await page.unroute("**/update_approval_flows");
      ok("UI-EDT-006", "Deleting a row in the team editor asks 'Are you sure you want to delete this approval workflow?' and on Save sends DELETE delete_approval_flows with that workflow's uuid only", /Are you sure you want to delete this approval workflow/.test(ask) && !!delBody && delBody.includes(madeUuid) && !delBody.includes(uuidOf(6782)), `confirm="${ask.slice(0, 80)}" delete body=${delBody}`, [await shot(page, "E-04-delete-intercepted")]);
    }
  } else tell("UI-EDT-001", "Edit fixture", `could not create the fixture workflow: ${errOf(r0)}`);
} } catch (e: any) { console.log("stage edit crashed:", e?.message?.slice(0, 300)); await shot(page, "crash-edit"); }
// ═══════════════════════ PO FORM ═══════════════════════
async function gdSelect(label: string): Promise<Locator> {
  return page.locator("section", { hasText: "General Details" }).first().locator("div[class*=row]", { hasText: label }).first().locator(".ant-select").first();
}
async function gdRow(label: string): Promise<Locator> {
  return page.locator("section", { hasText: "General Details" }).first().locator("div[class*=row]", { hasText: label }).first();
}
const BASE = { form_type: "6686", unit_name: U.kochi, legal_entity: "DLF LIMITED", department: "IT", nature_of_expense: "Budgeted with 3 quotes" };
try { if (want("poform")) {
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  await page.goto(`${WEB}/po-form/${P}`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 4000);
  let s = await shot(page, "P-01-po-form");
  const sec = page.locator("section", { hasText: "General Details" }).first();
  const rowsText = (await sec.locator("div[class*=row]").allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => /Form Type|Unit Name|Legal Entity|Department|Nature of Expense|Sanction Note|Comments/.test(t)).slice(0, 7);
  ok("UI-PO-001", "The PO form opens with a 'General Details' section on top, 7 rows in order: Form Type*, Unit Name*, Legal Entity*, Department*, Nature of Expense*, Sanction Note, Comments", rowsText.length === 7 && /^Form Type/.test(rowsText[0]) && /^Comments/.test(rowsText[6]), rowsText.join(" || "), [s]);
  const ft = await gdSelect("Form Type");
  ok("UI-PO-002", "Form Type shows 'DLF Capex NFA Test RFQ' (the event's template), the tag 'Auto-filled', a lock icon and is greyed out", (await text(await gdRow("Form Type"))).includes("Auto-filled") && (await ft.evaluate((e) => e.classList.contains("ant-select-disabled"))) && (await text(ft)).includes("DLF Capex NFA Test RFQ"), await text(await gdRow("Form Type")), [s]);
  const lock = (await gdRow("Form Type")).locator("[class*=lockIcon], .anticon-lock").first();
  if (await lock.count()) { await lock.hover(); await sleep(700); const tip = await text(page.locator(".ant-tooltip:visible").first()); ok("UI-PO-003", "Hovering the lock shows 'Set by the system'", /Set by the system/.test(tip), tip || "no tooltip", [await shot(page, "P-02-lock-tooltip")]); }
  const un = await gdSelect("Unit Name");
  ok("UI-PO-004", "Unit Name is auto-filled with 'National Clubs -Kochi (DLF-021)' (the PR line's location, with its code) but is NOT locked", (await text(await gdRow("Unit Name"))).includes("Auto-filled") && !(await un.evaluate((e) => e.classList.contains("ant-select-disabled"))) && (await text(un)).includes("Kochi"), await text(await gdRow("Unit Name")), [s], { verdict: "Record" });
  const unitOpts = await dropdownOptions(un);
  ok("UI-PO-005", "The Unit Name list offers only the PR line's unit (one option)", unitOpts.length === 1 && /Kochi/.test(unitOpts[0]), unitOpts.join(", "), [await shot(page, "P-03-unit-options")]);
  const le = await gdSelect("Legal Entity");
  const leOpts = await dropdownOptions(le);
  ok("UI-PO-006", "Legal Entity offers only the entities mapped to Kochi: DLF LIMITED", leOpts.length === 1 && leOpts[0] === "DLF LIMITED", leOpts.join(", "), [await shot(page, "P-04-entity-options")]);
  // required star / clear icon
  const star = await (await gdRow("Legal Entity")).locator("[class*=required]").count();
  ok("UI-PO-007", "Required fields show a red * and have no clear (x) icon; the optional long-text rows have no star", star > 0 && (await le.locator(".ant-select-selection__clear").count()) === 0 && (await (await gdRow("Sanction Note")).locator("[class*=required]").count()) === 0, `star=${star} clear=${await le.locator(".ant-select-selection__clear").count()}`, [s]);
  // department search + pick + save call
  const dep = await gdSelect("Department");
  let t0 = Date.now();
  let err = await pickFromSelect(dep, "Mark", /^Marketing$/);
  await sleep(1800);
  let saves = apiSince(t0, /general_details$/).filter((n) => n.method === "POST");
  s = await shot(page, "P-05-department-marketing");
  ok("UI-PO-008", "Typing 'Mark' narrows Department to Marketing (server search); picking it saves at once (POST general_details 200) and the box shows Marketing", !err && saves.some((x) => x.status === 200) && (await text(dep)).includes("Marketing"), err || `saves=${saves.map((x) => x.status).join(",")} value=${await text(dep)}`, [s]);
  rec("UI-PO-009", "What the page sends on a change (the whole set of values, blanks left out)", saves[0]?.body?.slice(0, 300) || "no POST seen", []);
  // reload keeps it
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 4000);
  ok("UI-PO-010", "After a reload Department still reads Marketing (saved on the server)", (await text(await gdSelect("Department"))).includes("Marketing"), await text(await gdSelect("Department")), [await shot(page, "P-06-reload")]);
  // Nature of expense options
  const noe = await gdSelect("Nature of Expense");
  const noeOpts = await dropdownOptions(noe);
  ok("UI-PO-011", "Nature of Expense lists the four values: Budgeted with/without 3 quotes, Non-budgeted with/without 3 quotes", noeOpts.length === 4 && noeOpts.every((o) => /3 quotes/.test(o)), noeOpts.join(" / "), [await shot(page, "P-07-noe-options")]);
  // long text: 5000 limit + save on blur
  const sn = (await gdRow("Sanction Note")).locator("textarea").first();
  await sn.fill("x".repeat(5010)); await sleep(300);
  const len = (await sn.inputValue()).length;
  t0 = Date.now();
  await sn.blur(); await (await gdRow("Comments")).locator("textarea").first().click(); await sleep(1800);
  saves = apiSince(t0, /general_details$/).filter((n) => n.method === "POST");
  ok("UI-PO-012", "Sanction Note stops at 5,000 characters and saves when you leave the box", len === 5000 && saves.some((x) => x.status === 200), `typed 5010 → kept ${len}; saves=${saves.map((x) => x.status).join(",")}`, [await shot(page, "P-08-sanction-5000")]);
  await sn.fill("QA_Platform note"); await sn.blur(); await sleep(1200);
  // Collapse / expand
  const toggle = sec.locator("button[aria-label=Collapse], button[aria-label=Expand]").first();
  if (await toggle.count()) { await toggle.click(); await sleep(600); const hiddenShot = await shot(page, "P-09-collapsed"); const hidden = (await sec.locator(".ant-select:visible").count()) === 0; await toggle.click(); await sleep(600); ok("UI-PO-013", "The caret collapses the section to its title and expands it again", hidden && (await sec.locator(".ant-select:visible").count()) > 0, `collapsed: visible dropdowns=${hidden ? 0 : "some"}; expanded again: ${await sec.locator(".ant-select:visible").count()}`, [hiddenShot, await shot(page, "P-09-collapse")]); }

  // Change the parent → child cleared?  The unit list has one option (Kochi) so we cannot change it from the UI here.
  rec("UI-PO-014", "Changing Unit Name to see Legal Entity cleared ('Please select Legal Entity again') cannot be tried on this PO: the PR line fixes the unit, so the list has one option. Needs a PO whose PR lines have no location (see the API case that sets the parent by request)", "unit list = " + unitOpts.join(", "), []);
  // Server-side rejection surfaced in the UI: set an entity for another unit via API while the page shows Kochi, then change department → toast?  Instead: make the saved set invalid through the API and pick a value in the UI.
  await api("POST", `/proposal/${P}/general_details`, { values: { ...BASE, department: "Marketing" } });
  // Simulate a stale page: the page's local copy has legal entity; we remove the unit's entity mapping? Not possible. So test the error toast via a blocked value: type an entity that is not in the list → the select refuses to pick → nothing sent.
  await api("POST", `/proposal/${P}/general_details`, { values: { form_type: "6686", unit_name: U.kochi, department: "IT", nature_of_expense: "Budgeted with 3 quotes" } });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3500);
  const leNo = await dropdownOptions(await gdSelect("Legal Entity"), "Lodhi");
  ok("UI-PO-015", "With Legal Entity empty, typing an entity not mapped to the unit (Lodhi) shows 'No options configured for this selection' — nothing can be picked", leNo.length === 1 && /No options configured/.test(leNo[0]), leNo.join(" / "), [await shot(page, "P-10-entity-not-mapped")]);
  const leKeep = await dropdownOptions(le, "Lodhi");
  rec("UI-PO-015b", "With DLF LIMITED already chosen, the same search keeps the chosen value in the list instead of the 'No options' message", leKeep.join(" / "), []);
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3500);
  ok("UI-PO-016", "Values saved through the API show in the form after a reload (Department back to IT)", (await text(await gdSelect("Department"))).includes("IT"), await text(await gdSelect("Department")), [await shot(page, "P-11-api-sync")]);
}
} catch (e: any) { console.log("stage poform crashed:", e?.message?.slice(0, 300)); await shot(page, "crash-poform"); }
// ═══════════════════════ SUBMIT (NTD page → modal → one real submission routed to the test user → reject) ═══════════════════════
try { if (want("submit")) {
  const mk = async (name: string, conds: any[]) => { const r = await api("POST", "/approval_workflow/approval_flows/create_approval_flows", { approval_flows: [{ name, approval_type: "close_event_group", config: { stop_expiry_in_approval: true }, initiators: [{ type: "team", role: "member", uuid: uuidOf(DLF.teamAll), name: "All Categories" }], conditions: conds, steps: [{ name: "Step 1", order: 0, expires_in: 86400, config: { no_of_approvals_required: false }, approvers: [{ type: "user", uuid: uuidOf(DLF.testUserId) }] }] }] }); const u = r.json?.[0]?.uuid; if (u) madeFlows.push(u); else console.log("mk failed", errOf(r)); return u; };
  const nA = NAME("SUB-A Kochi IT"); const nB = NAME("SUB-B IT or HR");
  const uA = await mk(nA, [{ key: "unit_name", values: [U.kochi] }, { key: "department", values: ["IT"] }]);
  const uB = await mk(nB, [{ key: "department", values: ["IT", "HR"] }]);
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  const modalSel = ".ant-modal:visible";
  const openModal = async (tag: string) => {
    await page.goto(`${WEB}/po-form/${P}`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 4500);
    await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(5000);
    const ntd = /\/proposal\//.test(page.url());
    const sN = await shot(page, `${tag}-ntd`);
    const t0 = Date.now();
    await page.getByRole("button", { name: /Submit Proposal/ }).first().click({ force: true }); await sleep(5500);
    return { ntd, sN, calls: apiSince(t0, /approval_workflows/), modal: page.locator(modalSel).last() };
  };
  let o = await openModal("S-01");
  let mt = await text(o.modal);
  let s = await shot(page, "S-02-modal");
  rec("UI-SUB-000", "On DLF, 'Submit Proposal' on the PO form first opens the NTD page (Proposal Template NTD: Subject and Scope, Material needed by, Overall Budget, Change in price reason, deviations table) — its own 'Submit Proposal' then opens the approval modal", `NTD page reached=${o.ntd} (${page.url()})`, [o.sN]);
  ok("UI-SUB-001", "The approval modal 'Submit Proposal' lists ONLY the workflows matching the General Details (our two QA_Platform ones) — the page called GET /proposal/:id/approval_workflows", o.calls.length > 0 && mt.includes(nA) && mt.includes(nB), `api=${o.calls.map((c) => c.status).join(",")} modal="${mt.slice(0, 320)}"`, [s]);
  ok("UI-SUB-002", "The Admin-only 'GD Test - CAPEX…' workflows and the company 'test' catch-alls are not offered", !mt.includes("GD Test - CAPEX") && !/Approval Flow Name\s*test\b/.test(mt) && !/\btest\s+Closing/.test(mt), mt.slice(0, 200), [s]);
  rec("UI-SUB-002b", "The modal shows the PO's No. of Line Items, Total Proposal Value, Approval Type Bid Proposal and the warning 'Submitting this proposal will revoke all active counter offers in this project.'", mt.slice(0, 260), [s]);
  // choose A (list mode) → summary
  const pickA = o.modal.getByText(nA).first();
  if (await pickA.count()) { await pickA.click(); await sleep(700); }
  const primary = o.modal.locator(".ant-modal-footer button.ant-btn-primary, .ant-modal button.ant-btn-primary").last();
  if (!/will be sent to the following members/.test(mt)) { await primary.click(); await sleep(2500); }
  mt = await text(o.modal); s = await shot(page, "S-03-summary");
  ok("UI-SUB-003", "Choosing a workflow and continuing shows its summary: 'Approval Flow Name <name>', 'An approval workflow will be sent to the following members:' Step 1 Test - Sumanta Dey 1d, a Closing Remarks box, Cancel / Submit Proposal", /will be sent to the following members/.test(mt) && /Sumanta/.test(mt) && /QA_Platform/.test(mt), mt.slice(0, 320), [s]);
  // stale: change Department through the API while the modal is open → 523 and the modal reloads the list
  await api("POST", `/proposal/${P}/general_details`, { values: { ...BASE, department: "HR" } });
  const remarks = o.modal.locator("[contenteditable=true], textarea").first(); if (await remarks.count()) { await remarks.click(); await page.keyboard.type("QA_Platform routing test"); }
  let t0 = Date.now();
  await o.modal.getByRole("button", { name: /^Submit Proposal$/ }).last().click(); await sleep(5000);
  let subs = apiSince(t0, /\/submit$/); let toast = (await toasts(page)).join(" | ");
  s = await shot(page, "S-04-stale-523");
  ok("UI-SUB-004", "Department changed (to HR) after the modal listed workflow A (Kochi AND IT): Submit is refused with 523 'Invalid Approval' and the modal stays open", subs.some((x) => x.status === 422 && /523/.test(x.reply || "")) && (await page.locator(modalSel).count()) > 0, `submit=${subs.map((x) => `${x.status} ${(x.reply || "").slice(0, 90)}`).join(" ; ")} toast="${toast}"`, [s]);
  await sleep(2500);
  mt = await text(page.locator(modalSel).last());
  ok("UI-SUB-005", "After the 523 the modal lists what matches now (B: IT or HR) and no longer A", mt.includes(nB) && !mt.includes(nA), mt.slice(0, 260), [await shot(page, "S-05-relisted")]);
  await page.keyboard.press("Escape"); await sleep(800);
  // clean single match: remove A, restore values, submit with B
  if (uA) { await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [uA] }); madeFlows.splice(madeFlows.indexOf(uA), 1); }
  await api("POST", `/proposal/${P}/general_details`, { values: BASE });
  o = await openModal("S-06"); mt = await text(o.modal); s = await shot(page, "S-07-single-match");
  ok("UI-SUB-006", "With exactly one matching workflow the modal goes straight to its summary (Approval Flow Name = B, approver Test - Sumanta Dey)", /will be sent to the following members/.test(mt) && mt.includes(nB), mt.slice(0, 260), [s]);
  const rem = o.modal.locator("[contenteditable=true], textarea").first(); if (await rem.count()) { await rem.click(); await page.keyboard.type("QA_Platform routing test — approver is the test user"); }
  t0 = Date.now();
  await o.modal.getByRole("button", { name: /^Submit Proposal$/ }).last().click(); await sleep(6000);
  subs = apiSince(t0, /\/submit$/); toast = (await toasts(page)).join(" | ") || await waitToast(page, 4000);
  s = await shot(page, "S-08-submitted");
  const submitted = subs.some((x) => x.status === 200);
  ok("UI-SUB-007", "Submit succeeds: 'Proposal submitted successfully' and the request is created with workflow B", submitted, `submit=${subs.map((x) => `${x.status} ${(x.reply || "").slice(0, 100)}`).join(" ; ")} toast="${toast}" url=${page.url()}`, [s]);
  if (submitted) {
    await sleep(3000);
    const reqs = (await api("GET", "/approval_workflow/approval_requests?view_type=initiator&page=1")).json;
    const mine = (reqs?.approvals?.data || []).find((r: any) => r.ref_uuid === "RFX-2112" && r.status === "pending");
    ok("UI-SUB-008", "The approval appears in the initiator's list as pending on RFX-2112 with workflow B and one approver", !!mine && mine.approval_flow_name === nB, JSON.stringify({ found: !!mine, flow: mine?.approval_flow_name, approvers: mine?.approvers?.length, total_steps: mine?.total_steps }), []);
    await page.goto(`${WEB}/po-form/${P}`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {}); await settle(page, 4500);
    s = await shot(page, "S-09-po-form-after-submit");
    const sec = page.locator("section", { hasText: "General Details" }).first();
    const selects = await sec.locator(".ant-select").count();
    const ro = (await sec.locator("[class*=readOnlyValue]").allInnerTexts().catch(() => [])).map((t) => t.trim());
    ok("UI-SUB-009", "After submission General Details is read-only: plain values, no dropdowns", selects === 0 && ro.length >= 5 && ro.includes("DLF LIMITED"), `selects=${selects} values=${ro.join(" | ")} url=${page.url()}`, [s]);
    const gd = (await api("GET", `/proposal/${P}/general_details`)).json;
    const postNow = await api("POST", `/proposal/${P}/general_details`, { values: BASE });
    ok("UI-SUB-010", "GET general_details now says is_editable=false and POST is refused (422 code 2)", gd?.is_editable === false && postNow.status === 422, `editable=${gd?.is_editable} post=${postNow.status} ${errOf(postNow)}`, []);
    await page.goto(`${WEB}/approvals`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 4500);
    s = await shot(page, "S-10-approvals-list");
    const card = page.getByText("RFX-2112").first();
    rec("UI-SUB-011", "The approver (the test user) sees the request on the Approvals page", (await card.count()) ? "RFX-2112 listed" : "RFX-2112 not visible on the first screen", [s]);
    if (await card.count()) {
      await card.click(); await settle(page, 4500);
      s = await shot(page, "S-11-approval-detail");
      const pageText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      rec("UI-SUB-012", "What the approver sees of the General Details on the approval page (PRD: values shown so approvers know why; PR: not shown for now)", /Legal Entity|Nature of Expense|Unit Name/.test(pageText) ? "General Details values ARE shown" : "General Details are NOT shown on the approval page", [s]);
    }
    const pend = (await api("GET", "/approval_workflow/approval_requests?view_type=approver&page=1")).json;
    const req = (pend?.approvals?.data || []).find((r: any) => r.ref_uuid === "RFX-2112" && r.status === "pending");
    const myApprover = req?.approvers?.find((a: any) => a.my_approval_required) || req?.approvers?.[0];
    if (myApprover) {
      const rr = await api("POST", "/approval_workflow/approval_requests/resolve_approval", { approver_id: myApprover.uuid, resolution: "rejected", remarks: "QA_Platform: rejecting to return the PO to draft", attachments: [] });
      await sleep(3000);
      const prop = (await api("GET", `/proposal/${P}`)).json;
      const newDraft = (await api("POST", "/proposal", { event_group_uuid: uuidOf(DLF.eventGroupId) })).json;
      const nd = newDraft?.uuid ? (await api("GET", `/proposal/${newDraft.uuid}/general_details`)).json : null;
      ok("UI-SUB-013", "Rejected by the approver: the proposal leaves 'requested'; a new draft for the event carries the same General Details (PR §2.5)", rr.status === 200 && !!nd && nd.values?.legal_entity === "DLF LIMITED" && nd.values?.department === "IT", `reject=${rr.status} ${errOf(rr)}; old status=${prop?.status}; new draft=${newDraft?.uuid} editable=${nd?.is_editable} values=${JSON.stringify(nd?.values)}`, [await shot(page, "S-12-after-reject")]);
      rec("UI-SUB-014", "Fixture after the loop: the new draft proposal for RFX-2112 (use its uuid for the next run)", `${newDraft?.uuid} (id ${newDraft?.uuid ? (await import("./aw-lib")).idOf(newDraft.uuid) : "?"}); old proposal ${P} status ${prop?.status}`, []);
    } else tell("UI-SUB-013", "Reject as the approver", `pending request not found for the approver: ${JSON.stringify((pend?.approvals?.data || []).map((r: any) => [r.ref_uuid, r.status])).slice(0, 200)}`);
  }
} } catch (e: any) { console.log("stage submit crashed:", e?.message?.slice(0, 300)); await shot(page, "crash-submit"); }
// cleanup our workflows
for (const u of madeFlows) { const d = await api("DELETE", "/approval_workflow/approval_flows/delete_approval_flows", { uuids: [u] }); console.log("deleted", u, d.status); }
await browser.close();
console.log(`done: ${L.rows.length} rows; pass ${L.rows.filter((x) => x.verdict === "Pass").length}, fail ${L.rows.filter((x) => x.verdict === "Fail").length}`);
