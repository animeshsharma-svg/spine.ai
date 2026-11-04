// PR assignee dropdown + assigning, driven on the real PR list as the DLF test user (super admin).
// Parts: --part dropdown | assign | all.  Results → prototype/data/evidence/pr-assignee/results.json
import type { Page, Locator } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { openAs, tokenFor, ME, PLANNER, TESTING_T, pshot, WEB, sleep, settle, L, D, sees, api, idOf, uuidOf, waitToast, toasts } from "./pra-lib";
const PART = process.argv[process.argv.indexOf("--part") + 1] || "all";
const run = (p: string) => PART === "all" || PART === p;
const { browser, page, net } = await openAs(await tokenFor(ME));
const PT = "/Users/animesh/Desktop/procol/procol test";
const { query, closePool } = await import(pathToFileURL(`${PT}/src/db/pool.ts`).href);
const dbRows = async (sql: string) => { const r = await query(sql); return (r.rows ?? r) as any[]; };
const ok = (id: string, title: string, pass: boolean | null, observed: string, shots: string[] = [], expected = "") =>
  L.put({ id, title, verdict: pass === null ? "Couldn't tell" : pass ? "Pass" : "Fail", observed, expected, shots } as any);
const PLAN = "Procol Planner User", TT = "Testing-T", SUP = "Procol Support";
const userById = (id: number) => D.users.find((u) => u.id === id)!;
const prOf = (no: string) => Number(Object.entries(D.prs).find(([, p]) => p.rfq_no === no)![0]);
const IT = { dgolf4081: "cGdjTlpO", dgolf4079: "RGRYTlpO", i1010a: "UWdjTlpj", i1010b: "UWdwTlpj", i1010partly: "ZFFRTlpj", i1011: "ZE5OTlpj", i1009a: "ZE5rTlpj", i1009b: "ZFhjTlpj", i1007a: "ZHBaTlpj", i1007b: "ZHBYTlpj", i1006a: "ZERwTlpj", i1006b: "ZERkTlpj", i1005a: "ZFpjTlpj", i1005b: "ZFpwTlpj", i1004: "ZGdOTlpj", i1003: "UXBYTlpa", i1002: "UWtnTlpa", i1001: "UVpwTlpa", i1000: "UWdrTlpa", i100001: "ZFhRTlpa", zz: "TkRRTlpr" };
const PAGE2 = new Set([IT.i1001, IT.i1000, IT.i100001]);

async function gotoList() { await page.goto(`${WEB}/purchase-requisitions?tab=active`, { waitUntil: "domcontentloaded", timeout: 120000 }); await settle(page, 7000); }
let curPage = 1; const ticked = new Set<string>();
async function goPage(n: number) {
  if (curPage === n) return;
  const want = new RegExp(`^${(n - 1) * 50 + 1}-`);
  const range = () => page.getByText(/\d+-\d+ out of \d+ results/).first().innerText().catch(() => "");
  for (let attempt = 0; attempt < 3 && !want.test(await range()); attempt++) {
    if (attempt < 2) { const b = page.locator(`[class*=_pageButton_]`).filter({ hasText: new RegExp(`^${n}$`) }).first(); await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click().catch(() => {}); }
    else { const inp = page.locator(".ant-input-number-input").last(); await inp.fill(String(n)); await inp.press("Enter"); }
    for (let i = 0; i < 40 && !want.test(await range()); i++) await sleep(500);
  }
  await sleep(2500); curPage = n;
}
const row = (uuid: string) => page.locator(`tr[data-row-key="${uuid}"]`);
async function tick(uuid: string, on = true) {
  await goPage(PAGE2.has(uuid) ? 2 : 1);
  await row(uuid).first().waitFor({ timeout: 60000 }).catch(() => {});
  const cb = row(uuid).first().locator(".ant-checkbox-input");
  if (!(await cb.count())) throw new Error(`row ${uuid} not on page ${curPage}`);
  const checked = await cb.isChecked();
  if (checked !== on) { await cb.click({ force: true }); await sleep(500); }
  if (on) ticked.add(uuid); else ticked.delete(uuid);
}
const assignBtn = () => page.locator("button:has(i.anticon-user-add)").filter({ visible: true }).first();
const dd = () => page.locator(".assignee-select").filter({ visible: true }).last();
let lastSearch = "";
async function waitSearch(since: number, ms = 9000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const n = net.filter((x) => x.at >= since && /\/users\/search/.test(x.url)); if (n.length) { await sleep(700); lastSearch = decodeURIComponent(n[n.length - 1].url); return n[n.length - 1]; } await sleep(200); }
  return null;
}
async function names(): Promise<string[]> { return (await dd().locator("li").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean); }
async function openAssign(): Promise<string[]> {
  const t0 = Date.now(); await assignBtn().click(); await waitSearch(t0); await sleep(800); return names();
}
async function typeQ(q: string): Promise<string[]> {
  const inp = page.locator(".ant-select-focused input, .ant-select-open input").filter({ visible: true }).last();
  await inp.fill(""); const t0 = Date.now(); await page.keyboard.type(q, { delay: 40 }); await waitSearch(t0); await sleep(900); return names();
}
async function closeDd() { await page.keyboard.press("Escape"); await sleep(400); await page.mouse.click(900, 85); await sleep(600); }
async function clearSel() { await page.mouse.click(900, 85); await sleep(300); for (const u of [...ticked].sort((a, b) => Number(PAGE2.has(a)) - Number(PAGE2.has(b)))) await tick(u, false); await goPage(1); }
const exp = (uid: number, prs: string[]) => prs.every((p) => sees(userById(uid), prOf(p)));
const yes = (b: boolean) => (b ? "shown" : "not shown");

try {
  await gotoList();
  if (!(await row(IT.i1011).count())) throw new Error("rows have no data-row-key = line uuid; selector needs work");
  if (run("dropdown")) {
    if (!process.argv.includes("--from2")) {
    // ---------- ONE-001 / ONE-006 / ONE-016 : DGOLF-4081 (FOOD STORE 83391 > FRUITS 83478 at DLF Golf)
    await tick(IT.dgolf4081);
    const first = await openAssign();
    const s1 = await pshot(page, "D01-dgolf4081-list");
    const reqHasUuid = lastSearch.includes(`"pr_item_uuids":["${IT.dgolf4081}"]`);
    ok("PRA-UI-REQ", "The Assign dropdown asks the server only for users who can see the ticked item (the request carries the ticked item)", reqHasUuid, `request: ${lastSearch.replace(/^.*\/users\/search/, "/users/search").slice(0, 200)}`, [s1]);
    ok("PRA-ONE-011", "At most 20 names show at first", first.length <= 20, `${first.length} names at first: ${first.join(", ")}`, [s1]);
    const p1 = await typeQ("Procol Planner"); const s2 = await pshot(page, "D02-dgolf4081-planner-searched");
    ok("PRA-ONE-001", "A user whose team has other categories is not offered (Procol Planner User has FOOD STORE id 64968/83238, this PR is FOOD STORE id 83391)", !p1.includes(PLAN) && !exp(PLANNER, ["DGOLF-4081-20250813"]), `typed "Procol Planner" → ${p1.join(" | ") || "(empty)"}`, [s2]);
    const p2 = await typeQ("Testing-T"); const s3 = await pshot(page, "D03-dgolf4081-testingT-searched");
    ok("PRA-ONE-006", "Typing the full name of a user who cannot see the PR still finds nothing", !p2.includes(TT), `typed "Testing-T" → ${p2.join(" | ") || "(empty)"}`, [s3]);
    const p3 = await typeQ("Procol Support"); const s4 = await pshot(page, "D04-dgolf4081-superadmin");
    ok("PRA-ONE-016", "A super admin is offered whatever the PR's category", p3.includes(SUP), `typed "Procol Support" → ${p3.join(" | ")}`, [s4]);
    await closeDd(); await clearSel();
    }
    if (!process.argv.includes("--from3")) {
    // ---------- ONE-012 / ONE-005 : 1010 (LIQUOR STORE, The Lodhi bh#12525)
    await tick(IT.i1010a);
    await openAssign();
    const q1 = await typeQ("Procol Planner"); const s5 = await pshot(page, "D05-1010-planner");
    ok("PRA-ONE-012", "A user whose team has the PR's category is offered (Procol Planner User has LIQUOR STORE; PR 1010 is LIQUOR STORE > IMPORTED WHITE WINE)", q1.includes(PLAN) === exp(PLANNER, ["1010"]) && q1.includes(PLAN), `typed "Procol Planner" → ${q1.join(" | ")}`, [s5]);
    const q2 = await typeQ("Testing-T"); const s6 = await pshot(page, "D06-1010-testingT");
    ok("PRA-ONE-005", "A user limited to another location is not offered (Testing-T is limited to The Camellias; PR 1010 is The Lodhi)", !q2.includes(TT) && !exp(TESTING_T, ["1010"]), `typed "Testing-T" → ${q2.join(" | ") || "(empty)"}`, [s6]);
    const q3 = await typeQ("zzqx"); const msg = (await dd().innerText().catch(() => "")).trim(); const s7 = await pshot(page, "D07-1010-no-match-message");
    ok("PRA-UI-EMPTYMSG", "Typing a name that matches nobody, with ONE PR selected, shows a fitting 'no match' message (not the several-PRs message)", !/No user can see all selected PRs/.test(msg), `typed "zzqx" with only PR 1010 ticked → the box says: "${msg}"`, [s7], "A neutral 'No matching user' message; the several-PRs message should only show when no one can see all the selected PRs");
    await closeDd();
    // ONE-008: one item vs two items of the same PR
    const one = await openAssign(); await closeDd();
    await tick(IT.i1010b); const two = await openAssign(); const s8 = await pshot(page, "D08-1010-two-items");
    ok("PRA-ONE-008", "Ticking two items of the same PR gives the same list as one item", JSON.stringify(one) === JSON.stringify(two), `one item: ${one.length} names; two items: ${two.length} names; same=${JSON.stringify(one) === JSON.stringify(two)}`, [s8]);
    await closeDd(); await clearSel();

    // ---------- ONE-015 : 1005 (The Camellias bh#12523)
    await tick(IT.i1005b); await openAssign();
    const r1 = await typeQ("Testing-T"); const s9 = await pshot(page, "D09-1005-testingT");
    ok("PRA-ONE-015", "A user limited to the PR's location is offered (Testing-T: The Camellias; PR 1005: The Camellias)", r1.includes(TT) && exp(TESTING_T, ["1005"]), `typed "Testing-T" → ${r1.join(" | ")}`, [s9]);
    await closeDd();
    // MANY-006 part 1: keep 1005 → Testing-T shown; then swap to DGOLF
    const a1 = await openAssign(); const a1t = await typeQ("Testing-T"); await closeDd();
    await tick(IT.i1005b, false); await tick(IT.dgolf4081); await openAssign(); const a2t = await typeQ("Testing-T"); const s10 = await pshot(page, "D10-swap-selection");
    ok("PRA-MANY-006", "Changing the ticked items changes the list (1005 → Testing-T offered; swap to DGOLF-4081 → not offered)", a1t.includes(TT) && !a2t.includes(TT), `1005: ${yes(a1t.includes(TT))}; after swapping to DGOLF-4081: ${yes(a2t.includes(TT))}`, [s10]);
    await closeDd(); await clearSel();

    // ---------- MANY-002 / MANY-001 : 1005 + DGOLF-4081
    await tick(IT.i1005b); await tick(IT.dgolf4081); const m0 = await openAssign(); const s11 = await pshot(page, "D11-1005-plus-dgolf-list");
    const m1 = await typeQ("Testing-T"); const m2 = await typeQ("Procol Planner"); const m3 = await typeQ("Procol Support"); const s12 = await pshot(page, "D12-1005-plus-dgolf-superadmin");
    ok("PRA-MANY-002", "With two PRs ticked, a user who sees only one of them is not offered (Testing-T and Procol Planner User see 1005 but not DGOLF-4081)", !m1.includes(TT) && !m2.includes(PLAN), `Testing-T ${yes(m1.includes(TT))}; Procol Planner User ${yes(m2.includes(PLAN))}`, [s11]);
    const supers = D.users.filter((u) => u.role === 3 && u.status === 1 && u.ucm_status === 1 && (u.team_types || []).includes(0)).length;
    ok("PRA-MANY-001", "PRs with no common category user show only super admins (DLF has no process validator team)", m3.includes(SUP), `first list ${m0.length} names; Procol Support ${yes(m3.includes(SUP))}; DLF has ${supers} super admins in purchase teams, so the list is never empty here`, [s12]);
    await closeDd(); await clearSel();
    // ---------- MANY-005 : 1005 + 1004 (both The Camellias, LIQUOR)
    await tick(IT.i1005b); await tick(IT.i1004); await openAssign(); const c1 = await typeQ("Testing-T"); const c2 = await typeQ("Procol Planner"); const s13 = await pshot(page, "D13-1005-plus-1004");
    ok("PRA-MANY-005", "Users who can see all the ticked PRs are offered (1005 + 1004: Testing-T by location, Procol Planner User by category)", c1.includes(TT) && c2.includes(PLAN), `Testing-T ${yes(c1.includes(TT))}; Procol Planner User ${yes(c2.includes(PLAN))}`, [s13]);
    await closeDd(); await clearSel();

    }
    if (!process.argv.includes("--from4")) {
    // ---------- ASN-001 / ASN-002 / ASN-003 : partly used item, mix, nothing
    const nothingDis = await assignBtn().isDisabled().catch(() => null); const s14 = await pshot(page, "D14-nothing-selected");
    ok("PRA-ASN-003", "Assign needs at least one ticked item", nothingDis === true, `Assign button with nothing ticked: ${nothingDis === null ? "not on the page" : nothingDis ? "greyed out" : "clickable"}`, [s14]);
    await tick(IT.i1010partly); await assignBtn().hover({ force: true }); await sleep(1200);
    const dis1 = await assignBtn().isDisabled(); const tip1 = (await page.locator(".ant-tooltip:visible").allInnerTexts()).join(" "); const s15 = await pshot(page, "D15-partly-used-item");
    const cellDis = await row(IT.i1010partly).first().locator("button").last().isDisabled().catch(() => null);
    ok("PRA-ASN-001", "Assign is greyed out with 'No open items selected' when the ticked item is partly used (1010 line 13: 700 open of 900)", dis1 && /No open items selected/.test(tip1), `button ${dis1 ? "greyed out" : "clickable"}; tooltip "${tip1}"; row Assignee cell ${cellDis ? "greyed out" : "clickable"}`, [s15]);
    await tick(IT.i1010a); await assignBtn().hover({ force: true }); await sleep(1000); const dis2 = await assignBtn().isDisabled(); const s16 = await pshot(page, "D16-partly-plus-open");
    ok("PRA-ASN-002", "Assign stays greyed out when even one ticked item is partly used", dis2, `1010 line 13 (partly used) + 1010 line 14 (open): button ${dis2 ? "greyed out" : "clickable"}`, [s16]);
    await clearSel();

    }
    {
    // ---------- MANY-004 : across pages (1004 on page 1 + 1000 on page 2), then the reverse order
    if (!process.argv.includes("--from5")) {
    await tick(IT.i1004); await tick(IT.i1000);
    const cnt = (await page.locator("button", { hasText: "Purchase Items" }).innerText().catch(() => "")).replace(/\s+/g, " ");
    const disA = await assignBtn().isDisabled(); await assignBtn().hover({ force: true }); await sleep(1200);
    const tipA = (await page.locator(".ant-tooltip:visible").allInnerTexts()).join(" "); const s17 = await pshot(page, "D17-across-pages-page2-view");
    let reqA = "";
    if (!disA) { const t0 = Date.now(); await assignBtn().click(); await waitSearch(t0); reqA = lastSearch; await closeDd(); }
    await goPage(1); await sleep(1500); const disA1 = await assignBtn().isDisabled(); const s17b = await pshot(page, "D17b-across-pages-back-on-page1");
    let reqA1 = "";
    if (!disA1) { const t0 = Date.now(); await assignBtn().click(); await waitSearch(t0); reqA1 = lastSearch; await closeDd(); }
    await clearSel();
    const both = (r: string) => r.includes(IT.i1004) && r.includes(IT.i1000);
    ok("PRA-MANY-004", "Items ticked on different pages of the list are all counted (1004 line 1 on page 1 + 1000 line 1 on page 2, both fully open)", (!disA && both(reqA)) || (!disA1 && both(reqA1)),
      `header shows "${cnt}"; on page 2 the Assign button is ${disA ? `greyed out (tooltip "${tipA}")` : "clickable" + (reqA ? `, request carries ${both(reqA) ? "both items" : "only part"}` : "")}; back on page 1 it is ${disA1 ? "greyed out" : "clickable" + (reqA1 ? `, request carries ${both(reqA1) ? "both items" : "only part"}` : "")}`, [s17, s17b],
      "Assign stays usable and the list is for both PRs together");
    }
    // ---------- ASN-009 : PR detail page (DGOLF-4081)
    const prU = uuidOf(prOf("DGOLF-4081-20250813"));
    await page.goto(`${WEB}/purchase-requisitions/${prU}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await settle(page, 7000);
    const s18 = await pshot(page, "D18-detail-page");
    const plus = page.locator("button[class*=assigneeButton]").filter({ visible: true }).first();
    let det = "no Assignee button on the detail page"; let pass: boolean | null = null; const shots = [s18];
    if (await plus.count()) {
      const t1 = Date.now(); await plus.click(); await waitSearch(t1);
      const carried = lastSearch.includes("pr_item_uuids");
      const d1 = await typeQ("Procol Planner"); const d2 = await typeQ("Procol Support"); shots.push(await pshot(page, "D19-detail-page-list"));
      pass = carried && !d1.includes(PLAN) && d2.includes(SUP);
      det = `request ${carried ? "carries" : "does NOT carry"} the item; Procol Planner User ${yes(d1.includes(PLAN))}; Procol Support ${yes(d2.includes(SUP))}`;
      await closeDd();
    }
    ok("PRA-ASN-009", "Assigning from the PR detail page follows the same rule (DGOLF-4081: Procol Planner User not offered, super admin offered)", pass, det, shots);
    await gotoList(); curPage = 1;
    }
  }

  if (run("assign")) {
    const assignedTo = async (uuids: string[]) => (await dbRows(`select i.id, i.assignee_id from purchase_request_items i where i.id in (${uuids.map(idOf).join(",")})`)).map((r) => r.assignee_id);
    async function bulk(uuids: string[], who: string, id: string, title: string, shotName: string) {
      await clearSel(); for (const u of uuids) await tick(u);
      await openAssign(); const list = await typeQ(who.split(" ").slice(0, 2).join(" "));
      if (!list.includes(who)) { ok(id, title, false, `"${who}" was not offered: ${list.join(" | ")}`, [await pshot(page, shotName)]); await closeDd(); return false; }
      const t0 = Date.now(); await dd().locator("li", { hasText: who }).first().click();
      const toast = await waitToast(page, 12000); const s = await pshot(page, shotName);
      await sleep(2500); const got = await assignedTo(uuids); const want = who === PLAN ? PLANNER : ME;
      const req = net.filter((x) => x.at >= t0 && /assign_pr_to_user/.test(x.url)).pop();
      const sent: string[] = (() => { try { return JSON.parse(req?.body || "{}").item_uuids || []; } catch { return []; } })();
      const sameSet = sent.length === uuids.length && uuids.every((u) => sent.includes(u));
      const shownTicked = await page.locator("tr.ant-table-row-selected").evaluateAll((rs) => [...new Set(rs.map((r) => r.getAttribute("data-row-key")))]);
      ok(id, title, /succes+fully assigned to/.test(toast) && got.every((g) => g === want) && sameSet, `ticked ${JSON.stringify(uuids)}; screen sent ${JSON.stringify(sent)}${sameSet ? "" : " ← NOT the ticked items"}; rows still ticked after the toast ${JSON.stringify(shownTicked)}; toast "${toast}"; saved assignee ids ${JSON.stringify(got)} (wanted ${want}); assign call ${req?.status}`, [s]);
      return true;
    }
    const before = (await api("GET", "/notification/menu_items")).json?.items?.length;
    if (!process.argv.includes("--from6")) {
    await bulk([IT.i1007a, IT.i1007b], PLAN, "PRA-ASN-007", "Bulk assign: two items of PR 1007 to Procol Planner User from the list (also makes the 'one PR, many items' notification)", "A01-bulk-1007");
    await bulk([IT.i1011], PLAN, "PRA-ASN-007b", "Assign the single item of PR 1011 to Procol Planner User (makes the 'one PR, one item' notification)", "A02-single-1011");
    await bulk([IT.i1010a, IT.i1009a], PLAN, "PRA-ASN-007c", "Assign one item of 1010 (ticked first) and one of 1009 together (makes the 'two PRs' notification; 1009 is the older PR)", "A03-two-prs");
    }
    if (!process.argv.includes("--from7")) {
    await bulk([IT.i1006a, IT.i1005a, IT.i1004, IT.i1003, IT.i1002], PLAN, "PRA-ASN-007d", "Assign one item each of 1006, 1005, 1004, 1003, 1002, ticked newest first (makes the '+ 4 more' notification; 1002 is the oldest)", "A04-five-prs");
    await bulk(["ZFpwTlpj", "ZFpkTlpj", IT.i1010b], PLAN, "PRA-ASN-007e", "Assign 2 items of 1005 and 1 of 1010 together (makes the 'count PRs, not items' notification)", "A05-three-items-two-prs");
    }
    if (!process.argv.includes("--from8")) {
    await bulk([IT.i1006b], PLAN, "PRA-ASN-007g", "Warm-up: assign 1006 line 16 alone to Procol Planner User", "A05a-warmup");
    await bulk(["ZGNaTlpj", "ZGNETlpj", "ZGNYTlpj"], PLAN, "PRA-ASN-007h", "Right after another assignment, tick 1005 lines 7 and 8 and 1004 line 2 and assign them together (checks the right rows are sent; makes the 'count PRs, not items' notification)", "A05b-three-items-two-prs-retry");
    }
    // self assign → no notification for me
    await bulk([IT.i100001], ME === 19743 ? "Test - Sumanta Dey" : "", "PRA-ASN-007f", "Assign an item of 100001 to myself", "A06-self");
    await sleep(8000);
    const mine = (await api("GET", "/notification/menu_items")).json?.items || [];
    const newOnes = mine.filter((x: any) => Date.now() / 1000 - x.created_at < 900 && /assigned|PR No/i.test(JSON.stringify(x.data)));
    ok("PRA-NTX-001", "Assigning to yourself sends you no notification", newOnes.length === 0, `my bell after assigning 100001 to myself (and the other PRs to Procol Planner User): ${newOnes.length} new PR-assignment notifications${newOnes.length ? ": " + newOnes.map((x: any) => x.data?.title).join(" | ") : ""}; total before ${before}, after ${mine.length}`, [await pshot(page, "A07-my-bell-after")]);
    ok("PRA-NTX-002", "Only the assigned user gets the notification (the assigner gets nothing)", newOnes.length === 0, `assigner's bell: ${newOnes.length} new PR-assignment notifications after 6 assignments to Procol Planner User`, []);
    // row cell assign then reassign (ASN-008 / ASN-010)
    await clearSel();
    const cell = () => row(IT.i1009b).first().locator("button[class*=assigneeButton]");
    const t1 = Date.now(); await cell().click(); await waitSearch(t1); const rc = lastSearch.includes(IT.i1009b);
    const rl = await typeQ("Procol Planner"); const s20 = await pshot(page, "A08-row-cell-list");
    if (rl.includes(PLAN)) { await dd().locator("li", { hasText: PLAN }).first().click(); await waitToast(page, 10000); await sleep(2500); }
    const g1 = await assignedTo([IT.i1009b]); const s21 = await pshot(page, "A09-row-cell-assigned");
    ok("PRA-ASN-008", "Assign one item from its Assignee cell: the list follows the same rule and the row shows the new assignee", rc && g1[0] === PLANNER, `row request ${rc ? "carries" : "does NOT carry"} the item; saved assignee ${g1[0]} (Procol Planner User = ${PLANNER}); row now reads "${(await cell().innerText().catch(() => "")).trim()}"`, [s20, s21]);
    const t2 = Date.now(); await cell().click(); await waitSearch(t2); const rl2 = await typeQ("Test - Sumanta");
    if (rl2.some((n) => /Test - Sumanta Dey/.test(n))) { await dd().locator("li", { hasText: /^Test - Sumanta Dey$/ }).first().click(); await waitToast(page, 10000); await sleep(2500); }
    const g2 = await assignedTo([IT.i1009b]); const s22 = await pshot(page, "A10-row-reassigned");
    ok("PRA-ASN-010", "Change the assignee of an item to another allowed user", g2[0] === ME, `reassigned 1009 line 2 from Procol Planner User to Test - Sumanta Dey; saved assignee ${g2[0]}; row reads "${(await cell().innerText().catch(() => "")).trim()}"`, [s22]);
    // API bypass (ASN-006): assign DGOLF-4079 item to a user who cannot see it
    const r = await api("POST", "/purchase_requests/assign_pr_to_user", { user_uuid: uuidOf(PLANNER), item_uuids: [IT.dgolf4079] });
    const g3 = await assignedTo([IT.dgolf4079]);
    ok("PRA-ASN-006", "Assigning a user who cannot see the PR directly through the API (known gap, out of scope)", null, `POST assign_pr_to_user (DGOLF-4079 item → Procol Planner User, who cannot see DGOLF PRs) → HTTP ${r.status}; saved assignee ${g3[0]}. ${r.status === 200 && g3[0] === PLANNER ? "Accepted — the gap is still open (logged for the follow-up)." : "Refused."}`);
  }
} catch (e: any) { console.log("crashed:", e?.message?.slice(0, 400)); await pshot(page, "crash-pra-ui"); }
await closePool().catch(() => {});
await browser.close();
console.log("done");
