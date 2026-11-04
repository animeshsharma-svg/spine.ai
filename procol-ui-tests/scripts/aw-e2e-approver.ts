/**
 * Approver side, done the way an approver does it: Approvals page → tick the request → Add Response → remarks → Reject / Approve.
 * Runs on the second PR-based event (built with aw-e2e-build.ts --line 204717). Submits through workflow B (Department HR).
 *   npx tsx scripts/aw-e2e-approver.ts
 */
import type { Locator } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { openBrowser, settle, shot, sleep, toasts, WEB, uuidOf, idOf, DLF, Ledger, OUT, api, errOf } from "./aw-lib";
const STATE = `${OUT}/e2e-fixture.json`; const S = JSON.parse(readFileSync(STATE, "utf8")); const save = () => writeFileSync(STATE, JSON.stringify(S, null, 1));
const L = new Ledger(`${OUT}/e2e-results.json`);
const ok = (id: string, title: string, pass: boolean, observed: string, shots: string[] = []) => { L.put({ id, title, verdict: pass ? "Pass" : "Fail", observed, shots }); };
const rec = (id: string, title: string, observed: string, shots: string[] = []) => { L.put({ id, title, verdict: "Record", observed, shots }); };
const F = S.flows as Record<string, { uuid: string; name: string }>; const REF = S.refId as string; const DEMO10 = uuidOf(44124);
const GD = { form_type: String(DLF.rfqTemplateId), unit_name: "12521", legal_entity: "DLF LIMITED", department: "HR", nature_of_expense: "Budgeted with 3 quotes" };
async function newDraft(): Promise<string> {
  const pr = await api("POST", "/proposal", { event_group_uuid: S.eventGroupUuid }); if (!pr.json?.uuid) { console.log("proposal failed", pr.status, errOf(pr)); process.exit(1); }
  const u = pr.json.uuid; S.proposalUuid = u; S.proposalId = idOf(u); save();
  const r = await api("POST", `/proposal/${u}/add_response?lot_no=`, { responses: { [DEMO10]: { action: "add", egli_data: { [S.lineItemUuid]: { awarded_quantity: 10 } } } } });
  const f = await api("POST", `/proposal/${u}/create_po_form`, {});
  console.log("draft", u, "add_response", r.status, errOf(r), "create_po_form", f.status, errOf(f)); return u;
}
async function submitB(u: string, tag: string) {
  const g = await api("POST", `/proposal/${u}/general_details`, { values: GD });
  const names = ((await api("GET", `/proposal/${u}/approval_workflows`)).json || []).map((f: any) => f.name);
  const mine = Object.keys(F).filter((k) => names.includes(F[k].name)).join("") || "none";
  ok(`${tag}-match`, `Second PR-based event (Super Luxury line), Department HR → only workflow B matches (A needs The Aralias, C needs Kochi)`, g.status === 200 && mine === "B", `saved=${g.status} matched=${mine}`);
  const s = await api("POST", `/proposal/${u}/submit`, { approval_flow_uuid: F.B.uuid, attachments: [], remarks: {}, step_uuid_vs_user_uuid: {} });
  ok(`${tag}-submit`, `Submitted through workflow B (status requested)`, s.status === 200 && s.json?.status === "requested", `${s.status} ${errOf(s)} status=${s.json?.status}`);
  await sleep(2500);
}
const { browser, page, net } = await openBrowser();
const text = async (l: Locator) => (await l.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const go = async (u: string, ms = 6000) => { await page.goto(u, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, ms); };
async function respond(kind: "Reject" | "Approve", remarks: string, tag: string) {
  const t0 = Date.now();
  await go(`${WEB}/approvals?viewType=approver`, 7000);
  const bad = net.filter((n) => n.at >= t0 && n.status >= 500).map((n) => `${n.method} ${n.status} ${n.url.replace(/^.*\/api/, "")}`);
  const tl = (await toasts(page)).join(" | ");
  await page.locator(".ant-tooltip, [class*=delegate] .anticon-close").first().click({ force: true, timeout: 1500 }).catch(() => {});
  const row = page.locator("tbody tr", { hasText: REF }).first();
  const s1 = await shot(page, `${tag}-01-list`);
  ok(`${tag}-01`, `The approver sees the ${REF} request under 'Pending on me' (team All Categories, initiator the test user, stage 1/1)`, (await row.count()) > 0, (await text(row)).slice(0, 240) || "row not found", [s1]);
  if (bad.length || /Internal Server Error/.test(tl)) rec("E2E-X01", "Opening the Approvals page shows a red 'Internal Server Error' toast (a call behind the filters fails)", `toast="${tl}" failing call: ${bad.join(", ")}`, [s1]);
  if (!(await row.count())) return;
  await row.locator("input[type=checkbox], .ant-checkbox").first().click({ force: true }); await sleep(1000);
  const ar = page.getByRole("button", { name: /Add Response/ }).first();
  ok(`${tag}-02`, `Ticking the request enables 'Add Response' (with a count of 1)`, await ar.isEnabled(), `enabled=${await ar.isEnabled()} label="${await text(ar)}"`);
  await ar.click(); await sleep(2500);
  const pop = page.locator(".ant-popover:visible").last(); const pt = await text(pop);
  const rej = pop.getByRole("button", { name: /^Reject$/ }).first(), apr = pop.getByRole("button", { name: /^Approve$/ }).first();
  const s2 = await shot(page, `${tag}-02-popover`);
  ok(`${tag}-03`, `'Add Response' opens a small window 'Approval Remarks *' with Reject and Approve — both greyed out until a remark is typed`, /Approval Remarks/.test(pt) && (await rej.isDisabled()) && (await apr.isDisabled()), `text="${pt.slice(0, 120)}" reject disabled=${await rej.isDisabled().catch(() => "?")} approve disabled=${await apr.isDisabled().catch(() => "?")}`, [s2]);
  rec(`${tag}-03b`, "What the approver can see about the PO before deciding (the General Details are not in this window; the row shows event, type, team, value, initiator)", `window: "${pt.slice(0, 200)}"`, [s2]);
  await pop.locator("textarea").first().fill(remarks); await sleep(600);
  ok(`${tag}-04`, `After typing a remark both buttons become active`, !(await rej.isDisabled()) && !(await apr.isDisabled()), `reject disabled=${await rej.isDisabled()} approve disabled=${await apr.isDisabled()}`);
  const t1 = Date.now();
  await (kind === "Reject" ? rej : apr).click(); await sleep(6000);
  const calls = net.filter((n) => n.at >= t1 && /resolve_approval/.test(n.url)).map((n) => `${n.status} ${(n.body || "").slice(0, 160)} → ${(n.reply || "").slice(0, 80)}`);
  const tl2 = (await toasts(page)).join(" | ");
  const s3 = await shot(page, `${tag}-03-after-${kind.toLowerCase()}`);
  const prop = (await api("GET", `/proposal/${S.proposalUuid}`)).json;
  const stillListed = await page.locator("tbody tr", { hasText: REF }).count();
  const want = kind === "Reject" ? "rejected" : "selected";
  ok(`${tag}-05`, `${kind} from the approver's window: the request is resolved, the row leaves 'Pending on me', and the PO becomes '${want}'`, calls.some((c) => c.startsWith("200")) && prop?.status === want && stillListed === 0, `resolve_approval: ${calls.join(" ; ") || "no call seen"}; toast="${tl2}"; proposal=${prop?.status}; still listed=${stillListed}`, [s3]);
}
try {
  const u1 = await newDraft(); await submitB(u1, "E2E-B1");
  await respond("Reject", "QA_Platform E2E: rejecting from the Approvals page", "E2E-B2");
  const nd = (await api("POST", "/proposal", { event_group_uuid: S.eventGroupUuid })).json;
  const gd = nd?.uuid ? (await api("GET", `/proposal/${nd.uuid}/general_details`)).json : null;
  ok("E2E-B3", "After the rejection a new draft PO carries the same General Details (unit Super Luxury, HR, DLF LIMITED)", !!gd && gd.values?.department === "HR" && gd.values?.unit_name === "12521" && gd.is_editable === true, JSON.stringify({ draft: nd?.uuid, editable: gd?.is_editable, values: gd?.values }).slice(0, 300));
  const u2 = nd?.uuid || (await newDraft());
  if (nd?.uuid) { S.proposalUuid = u2; S.proposalId = idOf(u2); save(); await api("POST", `/proposal/${u2}/add_response?lot_no=`, { responses: { [DEMO10]: { action: "add", egli_data: { [S.lineItemUuid]: { awarded_quantity: 10 } } } } }); await api("POST", `/proposal/${u2}/create_po_form`, {}); }
  await submitB(u2, "E2E-B4");
  await respond("Approve", "QA_Platform E2E: approving from the Approvals page", "E2E-B5");
  const eg = (await api("GET", `/event_groups/${S.eventGroupUuid}`)).json;
  rec("E2E-B6", "The event after the approval", `status=${eg?.status} stages=${JSON.stringify((eg?.stages || []).map((x: any) => x.status))} proposals=${JSON.stringify(eg?.proposals).slice(0, 160)}`, [await shot(page, "E2E-B6-event")]);
  // Initiated by me tab
  await go(`${WEB}/approvals?viewType=initiator`, 6000);
  const r2 = page.locator("tbody tr", { hasText: REF }).first();
  rec("E2E-B7", "'Initiated by me' shows the request with its final state", (await text(r2)).slice(0, 240) || "row not on the first page", [await shot(page, "E2E-B7-initiated")]);
} catch (e: any) { console.log("crashed:", e?.message?.slice(0, 300)); await shot(page, "E-crash-approver2"); }
await browser.close();
console.log(`done: ${L.rows.length} rows; pass ${L.rows.filter((x) => x.verdict === "Pass").length}, fail ${L.rows.filter((x) => x.verdict === "Fail").length}`);
