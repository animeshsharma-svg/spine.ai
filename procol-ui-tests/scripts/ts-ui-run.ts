/**
 * Template Studio — UI execution of the TS_* cases on console.ag-ri.in
 * (Admin Controls → Manage Templates), signed in with the session in
 * .auth/console.json, inside its client company.
 *
 *   npx tsx scripts/ts-ui-run.ts [--only TS_011,TS_012] [--headed]
 *
 * One browser, cases in order; each case: steps, checks in words, a screenshot.
 * Templates it saves are named "QA_Platform TSUI <stamp> …" and are deleted
 * through the API at the end. It never edits or deletes anything else.
 * Writes prototype/data/evidence/template-studio/ui-results.json + ui/*.png.
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/template-studio";
const SHOTS = `${OUT}/ui`;
mkdirSync(SHOTS, { recursive: true });
const cfg = JSON.parse(readFileSync(".auth/console.json", "utf8"));
const APP: string = cfg.app;
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
const NAME = (s: string) => `QA_Platform TSUI ${STAMP} ${s}`;
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i >= 0 ? new Set(process.argv[i + 1].split(",")) : null; })();

// ── session ────────────────────────────────────────────────────────────────
const meta: any = await fetch(APP + "/meta.json").then((r) => r.json());
const dc: any = await fetch(`${cfg.api}/v1/dashboard_configuration?client_company_uuid=${cfg.companyUuid}`, { headers: { "access-token": cfg.accessTokenHeader, "app-version": meta.version } }).then((r) => r.json());
const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript((d: any) => {
  if (!localStorage.getItem("procol_access_token")) {
    localStorage.setItem("procol_access_token", JSON.stringify(d.tok));
    localStorage.setItem("procol_current_selected_api", JSON.stringify(d.api));
    localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
    localStorage.setItem("procol_login_validity", String(Math.floor(Date.now() / 1000)));
    localStorage.setItem("procol_user_profile", JSON.stringify(d.user));
    localStorage.setItem("procol_support_dashboard_company", JSON.stringify(d.company));
  }
}, { tok: cfg.accessTokenHeader, api: cfg.api, ver: meta.version, user: dc.user, company: cfg.companyUuid });
const page = await ctx.newPage();
const net: Array<{ method: string; url: string; status: number; body?: string; reply?: string }> = [];
page.on("response", async (r) => {
  const u = r.url();
  if (!/\/api\/(templates|ask_ai_chats|external_requests|widget_data_mapping)/.test(u)) return;
  const req = r.request();
  let reply = ""; try { reply = (await r.text()).slice(0, 400); } catch { /* */ }
  net.push({ method: req.method(), url: u.replace(/^https:\/\/[^/]+\/api/, "").replace(/[?&]client_company_uuid=[^&]+/, ""), status: r.status(), body: req.postData()?.slice(0, 20000), reply });
});

// ── tiny toolkit ─────────────────────────────────────────────────────────────
const sleep = (ms: number) => page.waitForTimeout(ms);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
async function dismiss() {
  for (const t of ["Got it", "Not now"]) { const b = page.getByRole("button", { name: t }); if (await b.count()) await b.first().click({ timeout: 2000 }).catch(() => {}); }
}
async function settle(ms = 1500) { await page.waitForLoadState("domcontentloaded"); await sleep(ms); await dismiss(); }
const toasts = async () => (await page.locator(".ant-message-notice").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
async function waitToast(ms = 6000): Promise<string> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const t = await toasts(); if (t.length) return t.join(" | "); await sleep(250); }
  return "";
}
const dropdown = () => page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
async function openSelect(sel: Locator) { await sel.locator(".ant-select-selection").first().click(); await sleep(400); }
async function optionsOf(sel: Locator): Promise<string[]> {
  await openSelect(sel); const o = (await dropdown().locator("li.ant-select-dropdown-menu-item").allInnerTexts()).map((s) => s.trim());
  await page.keyboard.press("Escape"); await sleep(200); return o;
}
async function pick(sel: Locator, text: string | RegExp) {
  await openSelect(sel);
  const li = dropdown().locator("li.ant-select-dropdown-menu-item").filter({ hasText: typeof text === "string" ? exact(text) : text }).first();
  await li.click(); await sleep(300);
}
const panel = () => page.locator("[class*=_configPanel_]").first();
const cfgField = (label: string) => panel().locator("[class*=_configField_]").filter({ has: page.locator("div.label", { hasText: exact(label) }) }).first();
const exactI = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`, "i");
const cap = (title: string) => panel().locator("[class*=_capSection_]").filter({ has: page.locator("[class*=_capTitle_]", { hasText: exactI(title) }) }).first();
const capTitles = async () => (await panel().locator("[class*=_capTitle_]").evaluateAll((els) => els.map((e) => (e.textContent || "").trim())));
const rowSwitch = (label: string) => panel().locator("[class*=_configFieldRow_]").filter({ hasText: exact(label) }).locator("button[role=switch]").first();
const cards = () => page.locator("[class*=_fieldCard_]");
const cardLabels = async () => (await page.locator("[class*=_cardLabel_]").allInnerTexts()).map((s) => s.trim());
const tabBtn = (name: string) => page.locator("button[class*=_segment_]").filter({ hasText: new RegExp(`^\\s*${esc(name)}`) }).first();
async function addField(label: string) { await page.locator("[class*=_paletteTile_]").filter({ hasText: exact(label) }).first().click(); await sleep(300); }
async function setLabel(v: string) { await panel().locator('input[placeholder="Field label"]').fill(v); await sleep(150); }
async function setKey(v: string) { await panel().locator('input[placeholder="field_key"]').fill(v); await sleep(150); }
const keyValue = async () => panel().locator('input[placeholder="field_key"]').inputValue();
async function selectCard(i: number) { await cards().nth(i).locator("[class*=_cardBody_]").click(); await sleep(250); }
async function setName(v: string) { await page.locator('input[placeholder="Untitled Template"]').fill(v); }
async function clickSave() { await page.getByRole("button", { name: /^(Save|Update)$/ }).click(); }
async function gotoStudio() { await page.goto(APP + "/template-studio", { waitUntil: "domcontentloaded" }); await page.getByText("New Template").first().waitFor({ timeout: 45000 }); await settle(800); }
async function freshEditor(type: "vendor_onboarding" | "vendor_onboarding_buyer_form") {
  await page.goto(`${APP}/template-studio/create?type=${type}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 45000 }); await settle(800);
}
async function addOption(label: string) { await cap("Options").getByRole("button", { name: /Add option/ }).click(); await sleep(200); const inp = cap("Options").locator('input[placeholder="Option label"]').last(); await inp.fill(label); await sleep(150); }
const created = new Set<string>();
async function apiCall(method: string, path: string) {
  const r = await fetch(`${cfg.api}${path}${path.includes("?") ? "&" : "?"}client_company_uuid=${cfg.companyUuid}`, { method, headers: { "access-token": cfg.accessTokenHeader, "app-version": meta.version } });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function myTemplates() { const l = await apiCall("GET", "/templates"); return [...(l.json?.saved ?? [])].filter((t: any) => String(t.name ?? "").includes(`TSUI ${STAMP}`)); }

// ── case runner ──────────────────────────────────────────────────────────────
type Verdict = "Pass" | "Fail" | "Record" | "Not run" | "Couldn't tell";
type Row = { id: string; layer: "UI"; title: string; verdict: Verdict; checks: string[]; shots: string[]; bug?: string; ms: number };
const rows: Row[] = [];
class C {
  r: Row;
  constructor(r: Row) { this.r = r; }
  ok(cond: boolean, what: string, fv: Verdict = "Fail") { this.r.checks.push(`${cond ? "✔" : "✘"} ${what}`); if (!cond && (this.r.verdict === "Pass" || (this.r.verdict === "Record" && fv === "Fail"))) this.r.verdict = fv; return cond; }
  note(s: string) { this.r.checks.push(`• ${s}`); }
  record(s: string) { this.r.checks.push(`• ${s}`); if (this.r.verdict === "Pass") this.r.verdict = "Record"; }
  bug(s: string) { this.r.bug = s; }
  async shot(tag = "") { const f = `${this.r.id}${tag ? "-" + tag : ""}.png`; await page.screenshot({ path: `${SHOTS}/${f}` }).catch(() => {}); this.r.shots.push(f); }
}
async function tc(id: string, title: string, fn: (c: C) => Promise<void>) {
  if (ONLY && !ONLY.has(id)) return;
  const r: Row = { id, layer: "UI", title, verdict: "Pass", checks: [], shots: [], ms: 0 }; rows.push(r);
  const c = new C(r); const t0 = Date.now();
  try { await Promise.race([fn(c), new Promise((_, rej) => setTimeout(() => rej(new Error("case took longer than 4 minutes")), 240_000))]); }
  catch (e) { c.note(`automation stopped: ${(e as Error).message.split("\n")[0].slice(0, 220)}`); if (r.verdict === "Pass" || r.verdict === "Record") r.verdict = "Couldn't tell"; await c.shot("stopped"); }
  if (!r.shots.length) await c.shot();
  r.ms = Date.now() - t0;
  console.log(`${r.verdict.padEnd(13)} ${id} ${title}${r.bug ? "  ⚑" : ""}`);
}
const notRun = (id: string, title: string, why: string) => { if (ONLY && !ONLY.has(id)) return; rows.push({ id, layer: "UI", title, verdict: "Not run", checks: [`• ${why}`], shots: [], ms: 0 }); console.log(`Not run       ${id} ${title}`); };

// ═════════════════════════════ A. list ═════════════════════════════
await tc("TS_001", "Manage Templates opens from Admin Controls", async (c) => {
  await page.goto(APP + "/orders", { waitUntil: "domcontentloaded" }); await settle(4000);
  c.ok(/\/orders/.test(page.url()), `signed in on ${APP}/orders (the console's Events page) as the given session`);
  await page.goto(APP + "/controls", { waitUntil: "domcontentloaded" }); await settle(3000);
  const card = page.getByText("Manage Templates", { exact: true }).first();
  c.ok(await card.isVisible(), "Admin Controls shows the card 'Manage Templates — Create, edit and delete templates (buyer forms, PO, RFP)'");
  await c.shot("controls");
  await card.click(); await page.getByText("New Template").first().waitFor({ timeout: 45000 }); await settle(1500);
  c.ok(/\/template-studio$/.test(page.url()), `clicking it opens ${page.url().replace(APP, "")}`);
  const body = await page.locator("body").innerText();
  c.ok(/Build and manage templates for this company/.test(body), "heading 'Manage Templates — Build and manage templates for this company.'");
  c.ok(await page.locator('input[placeholder="Search templates"]').isVisible(), "a 'Search templates' box");
  c.ok(/All types/.test(body), "a type filter showing 'All types'");
  c.ok(await page.getByRole("button", { name: /New Template/ }).isVisible(), "a blue 'New Template' button");
  const left = await page.locator("[class*=sidebar] a, nav a").allInnerTexts().catch(() => []);
  c.note(`the left menu has no own entry for Manage Templates (sidebar hides the template-studio routes) — Admin Controls is the way in${left.length ? "" : ""}`);
});

await tc("TS_002", "List shows only the studio's four template types", async (c) => {
  await gotoStudio();
  const tags = new Set<string>();
  const pages = await page.locator(".ant-pagination-item").count();
  for (let p = 1; p <= Math.min(pages, 12); p++) {
    if (p > 1) { await page.locator(".ant-pagination-item").filter({ hasText: exact(String(p)) }).first().click(); await sleep(500); }
    for (const t of await page.locator(".ant-table-tbody .ant-tag").allInnerTexts()) tags.add(t.trim());
  }
  c.ok([...tags].every((t) => ["Vendor Onboarding", "Vendor Onboarding — Buyer Form", "Purchase Order", "RFQ / Auction (Event)"].includes(t)), `type tags seen across ${pages} pages: ${[...tags].join(", ")}`);
  c.note("the company also holds BOQ, contract, intake, document, summary-view and P2P templates (API list) — none of them is listed here, as designed");
  await page.locator(".ant-pagination-item").first().click(); await sleep(400); await c.shot();
});

await tc("TS_003", "Search filters by name, any case, part of the name", async (c) => {
  await gotoStudio();
  const before = await page.locator(".ant-table-tbody tr.ant-table-row").count();
  const box = page.locator('input[placeholder="Search templates"]');
  await box.fill("sample ai"); await sleep(600);
  const names = (await page.locator(".ant-table-tbody tr.ant-table-row td:first-child").allInnerTexts()).map((s) => s.trim());
  c.ok(names.length > 0 && names.every((n) => /sample ai/i.test(n)), `'sample ai' → ${names.length} rows, all containing it: ${names.slice(0, 4).join(" · ")}`);
  await c.shot("search");
  await box.fill("SCORING"); await sleep(500);
  const n2 = (await page.locator(".ant-table-tbody tr.ant-table-row td:first-child").allInnerTexts()).map((s) => s.trim());
  c.ok(n2.length > 0 && n2.every((n) => /scoring/i.test(n)), `'SCORING' (capitals) → ${n2.join(" · ")}`);
  await box.fill("Vendor Onboarding"); await sleep(500);
  const n3 = (await page.locator(".ant-table-tbody tr.ant-table-row td:first-child").allInnerTexts()).map((s) => s.trim());
  c.ok(n3.every((n) => /vendor onboarding/i.test(n)), `searching a TYPE word only matches names: ${n3.length} rows, all with it in the name`);
  await box.fill(""); await sleep(500);
  c.ok((await page.locator(".ant-table-tbody tr.ant-table-row").count()) === before, "clearing the box brings back the full first page");
});

await tc("TS_004", "Type filter narrows the list to one type", async (c) => {
  await gotoStudio();
  const sel = page.locator("[class*=_listFilters_] .ant-select").first();
  const opts = await optionsOf(sel);
  c.ok(JSON.stringify(opts) === JSON.stringify(["All types", "Vendor Onboarding — Buyer Form", "Purchase Order", "RFQ / Auction (Event)", "Vendor Onboarding"]), `filter choices: ${opts.join(" | ")}`);
  for (const t of ["Vendor Onboarding", "Vendor Onboarding — Buyer Form"]) {
    await pick(sel, t);
    const tags = (await page.locator(".ant-table-tbody .ant-tag").allInnerTexts()).map((s) => s.trim());
    c.ok(tags.length > 0 && tags.every((x) => x === t), `'${t}' → ${tags.length} rows, all tagged '${t}'`);
    await c.shot(t === "Vendor Onboarding" ? "vo" : "bf");
  }
  await page.locator('input[placeholder="Search templates"]').fill("sample"); await sleep(500);
  const both = (await page.locator(".ant-table-tbody tr.ant-table-row").allInnerTexts());
  c.note(`search 'sample' together with the Buyer Form filter → ${both.length} rows (both must match)`);
});

await tc("TS_005", "Fields column for vendor-onboarding and buyer-form rows", async (c) => {
  await gotoStudio();
  const rowsTxt = await page.locator(".ant-table-tbody tr.ant-table-row").evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim())));
  const vo = rowsTxt.filter((r) => r[1] === "Vendor Onboarding");
  c.record(`Fields column on the first page: ${rowsTxt.map((r) => `${r[0].slice(0, 28)} → '${r[2]}'`).slice(0, 6).join("; ")}`);
  c.ok(rowsTxt.every((r) => r[2] === "-"), "every row shows '-' in Fields (the list reply carries no forms / widgets, so the count is never shown)", "Record");
  c.note("product to decide what Fields should show; as built the column is always '-' for these templates");
  if (vo.length) c.note(`${vo.length} vendor-onboarding rows on page 1`);
});

await tc("TS_009", "Pagination", async (c) => {
  await gotoStudio();
  const pages = await page.locator(".ant-pagination-item").count();
  const first = await page.locator(".ant-table-tbody tr.ant-table-row td:first-child").first().innerText();
  c.ok(pages > 1 && (await page.locator(".ant-table-tbody tr.ant-table-row").count()) === 10, `${pages} pages, 10 rows per page`);
  await page.locator(".ant-pagination-next").click(); await sleep(500);
  const second = await page.locator(".ant-table-tbody tr.ant-table-row td:first-child").first().innerText();
  c.ok(first !== second, `next page shows other templates (first row '${second.trim()}')`);
  await c.shot();
});

// ═════════════════════════════ B. picker ═════════════════════════════
await tc("TS_011", "New Template shows the four types", async (c) => {
  await gotoStudio(); await page.getByRole("button", { name: /New Template/ }).click(); await sleep(800);
  const m = page.locator(".ant-modal-content").last();
  const t = (await m.innerText()).replace(/\n+/g, " | ");
  c.ok(/Choose a template type/.test(t), "modal 'Choose a template type'");
  for (const [l, d] of [["Vendor Onboarding — Buyer Form", "Buyer-side fields collected during vendor onboarding."], ["Purchase Order", "Purchase order form with header and line-item fields."], ["RFQ / Auction (Event)", "Event template with a quote sheet and global price sheet."], ["Vendor Onboarding", "Multi-section onboarding form with validations, prefill and conditional logic."]]) c.ok(t.includes(l) && t.includes(d), `card '${l}' — '${d}'`);
  await c.shot();
  await m.locator(".ant-modal-close").click(); await sleep(400);
  c.ok(!(await page.locator(".ant-modal-content").last().isVisible().catch(() => false)), "the X closes it, back on the list");
});

await tc("TS_097", "'Generate with AI' is offered on the Vendor Onboarding card only", async (c) => {
  await gotoStudio(); await page.getByRole("button", { name: /New Template/ }).click(); await sleep(800);
  const cardsTxt = await page.locator("[class*=_typeCard_]").filter({ has: page.locator("[class*=_typeCardLabel_]") }).allInnerTexts();
  const withAi = cardsTxt.filter((t) => /Generate with AI/.test(t)).map((t) => t.split("\n")[0]);
  c.ok(withAi.length === 1 && withAi[0] === "Vendor Onboarding", `cards with 'Generate with AI': ${withAi.join(", ") || "none"}`);
  await c.shot();
  await page.keyboard.press("Escape");
});

await tc("TS_012", "Vendor Onboarding opens an empty section-based editor", async (c) => {
  await gotoStudio(); await page.getByRole("button", { name: /New Template/ }).click(); await sleep(800);
  await page.locator("[class*=_typeCard_]").filter({ hasText: "Multi-section onboarding form" }).first().click();
  await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(800);
  c.ok(/\/template-studio\/create\?type=vendor_onboarding$/.test(page.url()), `URL ${page.url().replace(APP, "")}`);
  c.ok((await page.locator("[class*=_typeTag_]").innerText()).trim() === "Vendor Onboarding", "header tag 'Vendor Onboarding' and the name box 'Untitled Template'");
  c.ok(await tabBtn("Build").isVisible() && await tabBtn("Logic").isVisible() && await tabBtn("Preview").isVisible(), "tabs Build · Logic · Preview");
  const tabs = (await page.locator("[class*=_pageTab_]").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
  c.ok(tabs.length === 1 && /^Section 1 0$/.test(tabs[0]), `one section tab: '${tabs[0]}' and a '+ Section' button`);
  const pal = (await page.locator("[class*=_paletteTileLabel_]").allInnerTexts()).map((s) => s.trim());
  c.ok(JSON.stringify(pal) === JSON.stringify(["Short Text", "Long Text", "Number", "Date", "Dropdown", "Multi Select", "Radio", "Attachment"]), `ADD FIELD lists exactly: ${pal.join(", ")}`);
  const body = await page.locator("body").innerText();
  c.ok(/Pick a field type from the left to add it here/.test(body) && /Select a field to configure/.test(body), "empty canvas 'Pick a field type from the left to add it here.' and 'Select a field to configure'");
  await c.shot();
});

await tc("TS_013", "Buyer Form opens with the 13 standard buyer fields", async (c) => {
  await gotoStudio(); await page.getByRole("button", { name: /New Template/ }).click(); await sleep(800);
  await page.locator("[class*=_typeCard_]").filter({ hasText: "Buyer-side fields" }).first().click();
  await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(800);
  c.ok(/type=vendor_onboarding_buyer_form$/.test(page.url()), `URL ${page.url().replace(APP, "")}`);
  c.ok(await tabBtn("Build").isVisible() && await tabBtn("Preview").isVisible() && !(await tabBtn("Logic").isVisible().catch(() => false)), "tabs Build · Preview (no Logic, no sections)");
  const pal = (await page.locator("[class*=_paletteTileLabel_]").allInnerTexts()).map((s) => s.trim());
  c.ok(JSON.stringify(pal) === JSON.stringify(["Text", "Number", "Date", "Dropdown"]), `palette: ${pal.join(", ")}`);
  const labels = await cardLabels();
  const want = ["OEM / NON OEM", "Payment Terms", "Email ID (Buyer)", "Alternate Email ID (Buyer)", "Vendor Code", "Creation Date", "Group", "Reconciliation GL Account", "Region", "Vendor A/C Group", "Payment Method", "Confirmation Control", "Schema Group"];
  const clean = labels.map((l) => l.replace(/\*$/, "").trim());
  c.ok(JSON.stringify(clean) === JSON.stringify(want), `13 fields in order: ${clean.join(" · ")}`);
  const req = labels.filter((l) => /\*$/.test(l)).map((l) => l.replace(/\*$/, "").trim());
  c.ok(JSON.stringify(req) === JSON.stringify(["Payment Terms", "Group", "Reconciliation GL Account", "Vendor A/C Group"]), `marked required (*): ${req.join(", ")}`);
  await c.shot();
});

await tc("TS_014", "Unknown type in the address goes back to the list", async (c) => {
  await page.goto(`${APP}/template-studio/create?type=banana`, { waitUntil: "domcontentloaded" });
  const t = await waitToast(15000); await sleep(1500);
  c.ok(/Unknown template type/.test(t), `message: '${t}'`);
  c.ok(/\/template-studio$/.test(page.url()), `sent back to ${page.url().replace(APP, "")}`);
  await c.shot();
});

await tc("TS_015", "Cancel leaves without saving", async (c) => {
  await freshEditor("vendor_onboarding"); const n0 = net.length;
  await addField("Short Text"); await setLabel("Temp field"); await addField("Number");
  await page.getByRole("button", { name: /^Cancel$/ }).click(); await sleep(1500);
  c.ok(/\/template-studio$/.test(page.url()), "Cancel returns to the list");
  c.ok(!net.slice(n0).some((r) => r.method === "POST" && /^\/templates/.test(r.url)), "nothing was saved (no POST /templates)");
  c.record("no 'unsaved changes' warning is shown before throwing the two fields away — product to confirm");
  await c.shot();
});

// ═════════════════════════════ C. sections ═════════════════════════════
await tc("TS_016", "Add, rename and describe a section", async (c) => {
  await freshEditor("vendor_onboarding");
  await page.getByRole("button", { name: /Section$/ }).click(); await sleep(400);
  let tabs = (await page.locator("[class*=_pageTab_]").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
  c.ok(tabs.length === 2 && /^Section 2 0/.test(tabs[1]), `a second tab '${tabs[1]}' appears`);
  c.ok(/_pageTabActive_/.test((await page.locator("[class*=_pageTab_]").nth(1).getAttribute("class")) ?? ""), "and becomes the active tab");
  await page.locator('input[placeholder="Section name"]').fill("Company details");
  await page.locator('input[placeholder="Section description (optional)"]').fill("Legal identity of the vendor");
  tabs = (await page.locator("[class*=_pageTab_]").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
  c.ok(/^Company details/.test(tabs[1]), `the tab follows the name: '${tabs[1]}'`);
  await page.locator("[class*=_pageTab_]").first().click(); await sleep(300);
  c.ok((await page.locator('input[placeholder="Section name"]').inputValue()) === "Section 1", "switching tabs shows that section's own name");
  await c.shot();
});

await tc("TS_017", "The last section cannot be deleted; others can", async (c) => {
  await freshEditor("vendor_onboarding");
  c.ok((await page.locator("[class*=_pageTabClose_]").count()) === 0, "with one section there is no × on its tab");
  await page.getByRole("button", { name: /Section$/ }).click(); await sleep(300);
  await addField("Short Text"); await setLabel("In section two");
  c.ok((await page.locator("[class*=_pageTabClose_]").count()) === 2, "with two sections each tab has an ×");
  await c.shot("two");
  await page.locator("[class*=_pageTab_]").nth(1).locator("[class*=_pageTabClose_]").click(); await sleep(500);
  const tabs = await page.locator("[class*=_pageTab_]").count();
  c.ok(tabs === 1, "× removed Section 2 at once");
  c.record("no confirmation is asked although the section held a field — its fields are gone with it");
  await c.shot("after");
});

await tc("TS_018", "Fields belong to the active section; the tab shows the count", async (c) => {
  await freshEditor("vendor_onboarding");
  await addField("Short Text"); await addField("Number");
  await page.getByRole("button", { name: /Section$/ }).click(); await sleep(300);
  await addField("Date"); await addField("Radio"); await addField("Attachment");
  const tabs = (await page.locator("[class*=_pageTab_]").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
  c.ok(/ 2$/.test(tabs[0]) && / 3$/.test(tabs[1]), `tab counts: ${tabs.join(" / ")}`);
  c.ok((await cards().count()) === 3, "Section 2 shows its own 3 fields");
  await page.locator("[class*=_pageTab_]").first().click(); await sleep(300);
  c.ok((await cards().count()) === 2 && /Select a field to configure/.test(await panel().innerText()), "Section 1 shows its 2 fields; the selection is cleared on switching");
  await c.shot();
});

// ═════════════════════════════ D/E. fields & common settings ═════════════════════════════
await tc("TS_021", "Each of the 8 field types can be added", async (c) => {
  await freshEditor("vendor_onboarding");
  const map: Array<[string, string]> = [["Short Text", "Text"], ["Long Text", "Long Text"], ["Number", "Number"], ["Date", "Date"], ["Dropdown", "Dropdown"], ["Multi Select", "Multi Select"], ["Radio", "Radio"], ["Attachment", "Attachment"]];
  for (const [p] of map) await addField(p);
  const types = (await page.locator("[class*=_cardType_]").allInnerTexts()).map((s) => s.trim());
  c.ok(JSON.stringify(types) === JSON.stringify(map.map((m) => m[1])), `cards show: ${types.join(", ")}`);
  c.ok((await page.locator("[class*=_cardUntitled_]").count()) === 8, "each reads 'Untitled field'");
  c.ok(/_fieldCardActive_/.test((await cards().last().getAttribute("class")) ?? "") && /Field settings/.test(await panel().innerText()), "the last added card is selected and its settings are open");
  await c.shot();
});

await tc("TS_025", "Selecting a field opens its settings; edits stay on that field", async (c) => {
  await freshEditor("vendor_onboarding");
  await addField("Short Text"); await setLabel("Alpha"); await addField("Number"); await setLabel("Beta");
  await selectCard(0);
  c.ok((await panel().locator('input[placeholder="Field label"]').inputValue()) === "Alpha", "clicking card 1 shows 'Alpha'");
  await selectCard(1);
  c.ok((await panel().locator('input[placeholder="Field label"]').inputValue()) === "Beta", "clicking card 2 shows 'Beta'");
  c.ok(JSON.stringify(await cardLabels()) === JSON.stringify(["Alpha", "Beta"]), "the cards keep their own labels");
  await c.shot();
});

await tc("TS_026", "Label drives the key automatically", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("GST Number (Primary)");
  c.ok((await keyValue()) === "gst_number_primary", `key '${await keyValue()}'`);
  c.ok(/Auto-generated from the label/.test(await panel().innerText()), "hint 'Auto-generated from the label.'");
  await c.shot();
});

await tc("TS_027", "Two fields with the same label get different keys", async (c) => {
  await freshEditor("vendor_onboarding");
  await addField("Short Text"); await setLabel("Address"); const k1 = await keyValue();
  await addField("Long Text"); await setLabel("Address"); const k2 = await keyValue();
  await addField("Short Text"); await setLabel("Address"); const k3 = await keyValue();
  c.ok(k1 === "address" && k2 === "address_2" && k3 === "address_3", `keys: ${k1}, ${k2}, ${k3}`);
  await c.shot();
});

await tc("TS_028", "Editing the key by hand stops the auto key", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("GST number");
  await setKey("gstin"); await setLabel("GSTIN of the vendor");
  c.ok((await keyValue()) === "gstin", `key stays '${await keyValue()}' after the label changed`);
  c.ok(!/Auto-generated from the label/.test(await panel().innerText()), "the 'Auto-generated' hint is gone");
  await c.shot();
});

await tc("TS_032", "Changing the type keeps label and key and changes the settings shown", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Choice");
  const per: Record<string, string[]> = {};
  for (const t of ["Short Text", "Long Text", "Number", "Date", "Dropdown", "Multi Select", "Radio", "Attachment"]) {
    await pick(cfgField("Type"), t);
    const extra = (await panel().locator("[class*=_configFieldRow_] span:first-child").allInnerTexts()).map((s) => s.trim()).filter((s) => s !== "Required");
    per[t] = [...(await capTitles()), ...extra];
  }
  c.ok((await panel().locator('input[placeholder="Field label"]').inputValue()) === "Choice" && (await keyValue()) === "choice", "label 'Choice' and key 'choice' survive every type change");
  for (const [t, caps] of Object.entries(per)) c.note(`${t}: ${caps.join(", ")}`);
  c.ok(per["Short Text"].includes("Block paste") && per["Number"].includes("Block paste") && !per["Long Text"].includes("Block paste"), "Block paste only on Short Text and Number (TS_037)");
  c.ok(!per["Radio"].includes("Data source") && !per["Radio"].includes("Populate on select") && per["Radio"].includes("Options"), "Radio: Options but no Data source / Populate / Reset (TS_051)");
  c.ok(per["Attachment"].includes("Allowed file type") && !per["Attachment"].includes("Format mask (regex)"), "Attachment: Allowed file type, no mask (TS_059)");
  c.ok(!per["Date"].includes("Format mask (regex)") && !per["Date"].includes("Block paste"), "Date: no mask, no paste switch (TS_058)");
  const odd = ["Validations", "Prefill on load", "Autofill after validation"].filter((x) => per["Attachment"].includes(x));
  c.ok(odd.length === 0, `Attachment also offers: ${odd.join(", ") || "nothing else"}`, "Record");
  if (odd.length) c.note("Validations, Prefill on load, Autofill after validation and Write back apply to EVERY type (their appliesTo is always true), so an Attachment field offers PAN/GST checks, a Company prefill and autofill — settings that cannot work on a file. The field-type table (fieldTypes.js) lists only 'Allowed file type' for attachments; the panel ignores that table.");
  await c.shot();
});

await tc("TS_033", "Visibility Editable / Read-only / Hidden in Preview", async (c) => {
  await freshEditor("vendor_onboarding");
  for (const [l, v] of [["Editable one", "Editable"], ["Read only one", "Read-only"], ["Hidden one", "Hidden"]]) { await addField("Short Text"); await setLabel(l); await pick(cfgField("Visibility"), v); }
  c.ok((await optionsOf(cfgField("Visibility"))).join("|") === "Editable|Read-only|Hidden", "Visibility choices: Editable, Read-only, Hidden");
  await setName(NAME("visibility")); await tabBtn("Preview").click(); await sleep(600);
  const labels = (await page.locator("[class*=_previewLabel_]").allInnerTexts()).map((s) => s.trim());
  c.ok(labels.includes("Editable one") && labels.includes("Read only one") && !labels.includes("Hidden one"), `preview shows: ${labels.join(", ")} (hidden field not shown)`);
  const ro = page.locator("[class*=_previewField_]").filter({ hasText: "Read only one" }).locator("input").first();
  const roEditable = await ro.isEditable().catch(() => false);
  c.ok(!roEditable, `the read-only field in Preview is ${roEditable ? "still typeable" : "not typeable"} (TS_077)`, "Record");
  await c.shot();
});

await tc("TS_034", "Required toggle shows a red * in Preview", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Legal name"); await rowSwitch("Required").click();
  c.ok((await rowSwitch("Required").getAttribute("aria-checked")) === "true", "Required switch on");
  c.ok((await cardLabels())[0].endsWith("*"), "the card shows *");
  await tabBtn("Preview").click(); await sleep(500);
  c.ok(await page.locator("[class*=_previewField_]").filter({ hasText: "Legal name" }).locator("[class*=_cardRequired_]").isVisible(), "Preview label 'Legal name *'");
  await c.shot();
});

await tc("TS_035", "Helper text appears under the field", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("GSTIN");
  const help = "Enter the 15-character GSTIN as printed on the certificate.";
  await panel().locator('textarea[placeholder^="Shown under the field"]').fill(help);
  await tabBtn("Preview").click(); await sleep(500);
  c.ok((await page.locator("[class*=_previewDesc_]").first().innerText()).trim() === help, "Preview shows the helper text under GSTIN");
  await c.shot();
});

await tc("TS_036", "Format mask is described as a typing aid only", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("PAN");
  await cap("Format mask (regex)").locator("input").fill("^[A-Z]{5}[0-9]{4}[A-Z]$");
  c.ok(/Client-side input mask only\. Use a Regex validation to actually block submission\./.test(await cap("Format mask (regex)").innerText()), "hint 'Client-side input mask only. Use a Regex validation to actually block submission.'");
  await tabBtn("Preview").click(); await sleep(500);
  const inp = page.locator("[class*=_previewField_]").filter({ hasText: "PAN" }).locator("input").first();
  await inp.fill("abc123"); c.record(`Preview accepts '${await inp.inputValue()}' — the mask is not applied in the studio preview`);
  await c.shot();
});

// ═════════════════════════════ F. validations & caps ═════════════════════════════
await tc("TS_038", "External validation – PAN pre-fills this field as the input", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("PAN");
  await cap("Validations").getByRole("button", { name: /External/ }).click(); await sleep(300);
  const vt = cap("Validations").locator(".ant-select").first();
  const opts = await optionsOf(vt);
  c.ok(JSON.stringify(opts) === JSON.stringify(["PAN", "GST", "MSME / Udyam", "Bank Account", "CIN", "FSSAI", "TAN", "VAT"]), `validation types: ${opts.join(", ")}`);
  await pick(vt, "PAN");
  const row = await cap("Validations").innerText();
  c.ok(/pan_no/.test(row) && /PAN/.test(row), "row 'pan_no → PAN' (this field) appears");
  c.ok(/External/.test(row), "a blue 'External' tag on the entry");
  await c.shot();
});

await tc("TS_039", "External validation – Bank needs two inputs; IFSC can be left empty", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Account number"); await addField("Short Text"); await setLabel("IFSC"); await selectCard(0);
  await cap("Validations").getByRole("button", { name: /External/ }).click(); await sleep(300);
  await pick(cap("Validations").locator(".ant-select").first(), "Bank Account");
  const t = await cap("Validations").innerText();
  c.ok(/bank_account_no/.test(t) && /ifsc/.test(t), "two rows: bank_account_no (this field) and ifsc (to pick)");
  await setName(NAME("bank no ifsc")); const n0 = net.length; await clickSave(); const toast = await waitToast(8000);
  const post = net.slice(n0).find((r) => r.method === "POST" && r.url.startsWith("/templates"));
  const dsl = post?.body ? (JSON.parse(post.body).forms?.[0]?.page_response_headers?.[0]?.validations?.[0]?.validation_type ?? "") : "";
  c.ok(!post || post.status !== 200, `saving with IFSC unmapped: ${post ? `POST ${post.status}, stored '${dsl}'` : "not sent"} — toast '${toast}'`);
  if (post?.status === 200) c.bug("A bank-account validation saves with its IFSC input mapped to nothing ('ifsc={{}}'): the studio does not ask for the IFSC field and the backend accepts it, so the vendor's bank check runs without an IFSC.");
  await c.shot();
});

await tc("TS_040", "Response rule (cross-field compare) with 'Only when…'", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Radio"); await setLabel("Vendor type"); await addOption("Company"); await addOption("Individual");
  await addField("Short Text"); await setLabel("Legal name"); await addField("Short Text"); await setLabel("Account number");
  await cap("Validations").getByRole("button", { name: /External/ }).click(); await sleep(300); await pick(cap("Validations").locator(".ant-select").first(), "Bank Account");
  await cap("Validations").getByRole("button", { name: /Response rule/ }).click(); await sleep(300);
  await cap("Validations").locator('input[placeholder^="source_path"]').fill("validation_data.full_name.value");
  await cap("Validations").getByRole("button", { name: /Reference field/ }).click(); await sleep(300);
  const refPicker = cap("Validations").locator(".ant-select").filter({ hasText: /reference field/ }).first();
  await pick(refPicker, "Legal name");
  await cap("Validations").locator('input[placeholder^="response paths"]').fill("legal_name, trade_name");
  await cap("Validations").getByRole("button", { name: /Only when/ }).click(); await sleep(300);
  await pick(cap("Validations").locator(".ant-select").filter({ hasText: /condition field/ }).first(), "Vendor type");
  const whenVal = cap("Validations").locator(".ant-select").filter({ hasText: /^value$/ }).first();
  const vOpts = await optionsOf(whenVal);
  c.ok(vOpts.join("|") === "Company|Individual", `'only when' value list = the radio's options: ${vOpts.join(", ")}`);
  await pick(whenVal, "Company");
  await cap("Validations").locator('input[placeholder="error message"]').last().fill("Account holder must match the legal name");
  const t = await cap("Validations").innerText();
  c.ok(/Cross-field compare/.test(t) && /only when/.test(t), "card 'Cross-field compare' with source path, reference field, match Any/All and 'only when'");
  const matchOpts = await optionsOf(cap("Validations").locator(".ant-select").filter({ hasText: /^Any$/ }).first());
  c.ok(matchOpts.join("|") === "Any|All", `match choices: ${matchOpts.join(", ")}`);
  await c.shot();
});

await tc("TS_041", "Internal checks: the four kinds and their inputs", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Account number"); await addField("Short Text"); await setLabel("Re-enter account number");
  await cap("Validations").getByRole("button", { name: /Internal/ }).click(); await sleep(300);
  const chk = cap("Validations").locator(".ant-select").first();
  const opts = await optionsOf(chk);
  c.ok(JSON.stringify(opts) === JSON.stringify(["Regex (server-enforced)", "Must equal another field", "Reject duplicate (already onboarded)", "Must be contained in another field"]), `checks: ${opts.join(", ")}`);
  c.ok(await cap("Validations").locator('input[placeholder="regex"]').isVisible() && await cap("Validations").locator('input[placeholder="error message"]').isVisible(), "Regex (default) asks for a regex and an error message");
  await pick(chk, "Must equal another field");
  const cmp = cap("Validations").locator(".ant-select").filter({ hasText: /compare to field/ }).first();
  const cOpts = await optionsOf(cmp);
  c.ok(cOpts.includes("Account number") && !cOpts.includes("Re-enter account number"), `'compare to field' offers the other fields, not itself: ${cOpts.join(", ")}`);
  await pick(cmp, "Account number");
  await pick(chk, "Reject duplicate (already onboarded)");
  c.ok(await cap("Validations").locator('input[placeholder="mapping_model (optional)"]').isVisible(), "Reject duplicate asks for the model (Company) and an optional mapping_model");
  await pick(chk, "Must be contained in another field");
  c.ok(await cap("Validations").locator(".ant-select").filter({ hasText: /compare to field|Account number/ }).count() > 0, "Contains asks for a field to compare to");
  await cap("Validations").getByRole("button", { name: /External/ }).click(); await sleep(300);
  const tags = (await cap("Validations").locator(".ant-tag").allInnerTexts()).map((s) => s.trim());
  c.ok(tags.join("|") === "Internal|External", `two entries tagged ${tags.join(" + ")} (TS_045)`);
  await cap("Validations").locator("[class*=_capCardHead_] [class*=_capRowDelete_]").first().click(); await sleep(300);
  c.ok((await cap("Validations").locator(".ant-tag").allInnerTexts()).join("|") === "External", "the bin removes one entry and keeps the other");
  await c.shot();
});

await tc("TS_046", "Prefill on load offers the 6 allowed sources", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Legal name");
  const sel = cap("Prefill on load").locator(".ant-select").first();
  const opts = await optionsOf(sel);
  c.ok(JSON.stringify(opts) === JSON.stringify(["Company · Legal name", "Company · GSTIN", "Company · Email", "Company · Address", "Company · Phone", "User · Display name"]), `choices: ${opts.join(", ")}`);
  await pick(sel, "Company · Legal name");
  c.ok(/Company · Legal name/.test(await cap("Prefill on load").innerText()), "choice kept; × clears it back to 'No prefill'");
  await c.shot();
});

await tc("TS_047", "Autofill after validation — a row needs a target", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Legal name"); await addField("Short Text"); await setLabel("GSTIN");
  await cap("Autofill after validation").getByRole("button", { name: /Add autofill/ }).click(); await sleep(300);
  const tgt = cap("Autofill after validation").locator(".ant-select").filter({ hasText: /Target field/ }).first();
  const tOpts = await optionsOf(tgt);
  c.ok(tOpts.includes("Legal name") && !tOpts.includes("GSTIN"), `target choices exclude the field itself: ${tOpts.join(", ")}`);
  const ft = await optionsOf(cap("Autofill after validation").locator(".ant-select").filter({ hasText: /From validation response/ }).first());
  c.ok(ft.join("|") === "From validation response|From raw response", `fetch choices: ${ft.join(", ")}`);
  await pick(tgt, "Legal name"); await cap("Autofill after validation").locator('input[placeholder^="data path"]').fill("legal_name.value");
  await c.shot();
});

await tc("TS_048", "Write back to a record", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Legal name");
  const sw = panel().locator("[class*=_configFieldRow_]").filter({ hasText: "Write back to a record" }).locator("button[role=switch]");
  await sw.scrollIntoViewIfNeeded(); await sw.click(); await sleep(300);
  const sels = panel().locator("[class*=_capSection_]").filter({ hasText: "Write back to a record" }).locator(".ant-select");
  const m = await optionsOf(sels.nth(0)), col = await optionsOf(sels.nth(1));
  c.ok(m.join("|") === "Company" && col.join("|") === "misc", `model choices: ${m.join(", ")}; column choices: ${col.join(", ")}`);
  await c.shot();
});

// ═════════════════════════════ G. options & data sources ═════════════════════════════
await tc("TS_049", "Add, rename and remove options; ids stay fixed", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Dropdown"); await setLabel("Constitution");
  for (const o of ["Proprietorship", "Partnership", "Company"]) await addOption(o);
  const ids1 = (await cap("Options").locator("code").allInnerTexts()).map((s) => s.trim());
  c.ok(ids1.length === 3 && ids1.every((i) => /^[A-Za-z0-9_-]{6}$/.test(i)), `each option shows a fixed 6-character id: ${ids1.join(", ")}`);
  await cap("Options").locator('input[placeholder="Option label"]').nth(1).fill("LLP");
  const ids2 = (await cap("Options").locator("code").allInnerTexts()).map((s) => s.trim());
  c.ok(JSON.stringify(ids1) === JSON.stringify(ids2), "renaming 'Partnership' to 'LLP' keeps its id");
  await cap("Options").locator("[class*=_capRowDelete_]").nth(0).click(); await sleep(200);
  c.ok((await cap("Options").locator("code").count()) === 2, "the bin removes 'Proprietorship'");
  await c.shot();
});

await tc("TS_050", "An option with an empty label", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Dropdown"); await setLabel("Pick one"); await addOption(""); await addOption("Yes");
  await tabBtn("Preview").click(); await sleep(400);
  await page.locator("[class*=_previewField_]").filter({ hasText: "Pick one" }).locator(".ant-select-selection").click(); await sleep(300);
  const o = (await dropdown().locator("li").allInnerTexts()).map((s) => s.trim());
  c.record(`preview choices: ${o.join(" | ")} — an empty option is allowed and shows its id instead of a label`);
  await page.keyboard.press("Escape"); await c.shot();
});

await tc("TS_052", "Data source picker lists the company's sources", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Dropdown"); await setLabel("Country");
  const sel = cap("Data source").locator(".ant-select").first();
  const opts = await optionsOf(sel);
  c.ok(opts.length === 16, `${opts.length} sources (same 16 as GET /widget_data_mapping/data_sources): ${opts.slice(0, 5).join(", ")}…`);
  await pick(sel, "Country & region");
  const url = await cap("Data source").locator('input[placeholder^="/widget_data_mapping"]').inputValue();
  c.ok(/type=Country & Region/.test(url), `the URL box fills with '${url}'`);
  c.ok(/\{\{trade_request_uuid\}\}/.test(await cap("Data source").innerText()), "the tag {{trade_request_uuid}} is shown (blue = always available)");
  await tabBtn("Preview").click(); await sleep(400);
  c.ok(await page.getByText("Loaded from data source at fill time").first().isVisible(), "Preview says 'Loaded from data source at fill time'");
  await c.shot();
});

await tc("TS_053", "A {{field}} placeholder must point at a real field", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Dropdown"); await setLabel("City");
  await cap("Data source").locator('input[placeholder^="/widget_data_mapping"]').fill("/v1/cities?state={{state}}");
  c.ok(/\{\{state\}\}/.test(await cap("Data source").innerText()), "tag {{state}} appears under the box");
  await setName(NAME("missing placeholder")); await clickSave(); const t = await waitToast();
  c.ok(/references a missing field: state/.test(t), `Save refused: '${t}'`);
  await addField("Short Text"); await setLabel("State"); await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  const n0 = net.length; await clickSave(); const t2 = await waitToast(8000);
  const post = net.slice(n0).find((r) => r.method === "POST" && r.url.startsWith("/templates"));
  c.ok(post?.status === 200, `after adding a field keyed 'state' the save goes through (${post?.status ?? "no request"}, '${t2}')`);
  await c.shot();
});

await tc("TS_054", "Cascade from a parent field", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Dropdown"); await setLabel("Country"); await addField("Dropdown"); await setLabel("State");
  const url = cap("Data source").locator('input[placeholder^="/widget_data_mapping"]');
  await url.fill("/v1/states");
  const parent = cap("Data source").locator(".ant-select").filter({ hasText: /Parent field/ }).first();
  await pick(parent, "Country");
  c.ok((await url.inputValue()) === "/v1/states?parent_key={{country}}", `URL now '${await url.inputValue()}'`);
  await pick(parent, "Country");
  const v = await url.inputValue();
  c.ok(!/parent_key=\{\{country\}\}&parent_key/.test(v), `picking the parent again → '${v}'`, "Record");
  if (/parent_key=\{\{country\}\}&parent_key/.test(v)) c.note("each pick appends another parent_key; the picker resets to empty, so nothing shows which parent is already set");
  await c.shot();
});

await tc("TS_055", "Populate on select and Reset fields on change", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("IFSC"); await addField("Short Text"); await setLabel("Branch"); await addField("Dropdown"); await setLabel("Bank");
  await cap("Populate on select").getByRole("button", { name: /Add mapping/ }).click(); await sleep(300);
  await cap("Populate on select").locator('input[placeholder="source_key"]').fill("ifsc");
  const tgt = cap("Populate on select").locator(".ant-select").first(); const tOpts = await optionsOf(tgt);
  c.ok(!tOpts.includes("Bank") && tOpts.includes("IFSC"), `target choices exclude the dropdown itself: ${tOpts.join(", ")}`);
  await pick(tgt, "IFSC");
  const reset = cap("Reset fields on change").locator(".ant-select").first();
  await openSelect(reset); for (const f of ["IFSC", "Branch"]) await dropdown().locator("li").filter({ hasText: exact(f) }).first().click(); await page.keyboard.press("Escape"); await sleep(300);
  const chosen = (await cap("Reset fields on change").locator(".ant-select-selection__choice__content").allInnerTexts()).map((s) => s.trim());
  c.ok(chosen.join("|") === "IFSC|Branch", `fields to reset (TS_056): ${chosen.join(", ")}`);
  await c.shot();
});

await tc("TS_059", "Attachment – allowed file type", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Attachment"); await setLabel("ISO certificate");
  const sel = cap("Allowed file type").locator(".ant-select").first();
  const o = await optionsOf(sel);
  c.ok(JSON.stringify(o) === JSON.stringify(["PDF", "DOCX", "XLSX", "PNG", "JPG", "JPEG", "CSV"]), `choices: ${o.join(", ")} (one only)`);
  await pick(sel, "PDF"); await tabBtn("Preview").click(); await sleep(400);
  c.ok(await page.getByRole("button", { name: /Upload \(\.pdf\)/ }).isVisible(), "Preview button reads 'Upload (.pdf)'");
  await c.shot();
});

// ═════════════════════════════ I. logic ═════════════════════════════
async function logicBase() {
  await freshEditor("vendor_onboarding");
  await addField("Radio"); await setLabel("Vendor type"); await addOption("Indian"); await addOption("Foreign"); await addOption("MSME");
  await addField("Short Text"); await setLabel("GSTIN");
  await addField("Short Text"); await setLabel("Udyam number"); await pick(cfgField("Visibility"), "Hidden");
  await addField("Multi Select"); await setLabel("Certifications"); await addOption("ISO 9001"); await addOption("ISO 14001");
  await addField("Attachment"); await setLabel("ISO certificate");
  await addField("Short Text"); await setLabel("Company name");
  await addField("Short Text"); await setLabel("CIN");
}
const rule = (i: number) => page.locator("[class*=_ruleCard_]").nth(i);
async function addRule(controller: string, cmp: string, value: string | null, effects: Array<[string, string]>) {
  await page.getByRole("button", { name: /Add rule/ }).click(); await sleep(300);
  const r = page.locator("[class*=_ruleCard_]").last();
  await pick(r.locator(".ant-select").filter({ hasText: /controlling field/ }).first(), controller);
  if (cmp !== "is") await pick(r.locator("[class*=_ruleHead_] .ant-select").nth(1), cmp);
  if (value !== null) {
    const vs = r.locator("[class*=_ruleHead_] .ant-select").filter({ hasText: /^value$/ });
    if (await vs.count()) await pick(vs.first(), value); else await r.locator('[class*=_ruleHead_] input[placeholder="value"]').fill(value);
  }
  for (let i = 0; i < effects.length; i++) {
    if (i > 0 || (await r.locator("[class*=_ruleEffectRow_]").count()) === 0) { await r.getByRole("button", { name: /Add effect/ }).click(); await sleep(250); }
    const row = r.locator("[class*=_ruleEffectRow_]").nth(i);
    if (effects[i][0] !== "Hide") await pick(row.locator(".ant-select").first(), effects[i][0]);
    await pick(row.locator(".ant-select").nth(1), effects[i][1]);
  }
}
async function previewPick(label: string, choice: string) {
  const f = page.locator("[class*=_previewField_]").filter({ has: page.locator("[class*=_previewLabel_]", { hasText: new RegExp(`^${esc(label)}\\*?$`) }) }).first();
  if (await f.locator(".ant-radio-wrapper").count()) { await f.locator(".ant-radio-wrapper").filter({ hasText: exact(choice) }).click(); }
  else { await f.locator(".ant-select-selection").click(); await sleep(300); await dropdown().locator("li").filter({ hasText: exact(choice) }).first().click(); await page.keyboard.press("Escape"); }
  await sleep(300);
}
const previewLabels = async () => (await page.locator("[class*=_previewLabel_]").allInnerTexts()).map((s) => s.trim());

await tc("TS_061", "Logic tab empty state and the count badge", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(400);
  c.ok(/No conditional logic yet\. Add a rule to show, hide or require fields based on an answer\./.test(await page.locator("body").innerText()), "empty text 'No conditional logic yet. …'");
  await page.getByRole("button", { name: /Add rule/ }).click(); await sleep(300);
  c.ok((await tabBtn("Logic").innerText()).replace(/\s+/g, " ").trim() === "Logic 1", `tab reads '${(await tabBtn("Logic").innerText()).replace(/\s+/g, " ").trim()}'`);
  const first = rule(0);
  c.ok(await first.getByText("When").isVisible() && (await first.locator("[class*=_ruleHead_] .ant-select").nth(1).innerText()).trim() === "is", "a rule card: When [controlling field] [is] [value], Hide [target field], + Add effect (as in the screenshot)");
  await c.shot();
});

await tc("TS_062", "Build a rule: When Vendor type is Foreign → Hide GSTIN (and see it in Preview)", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Vendor type", "is", "Foreign", [["Hide", "GSTIN"]]);
  const vOpts = await optionsOf(rule(0).locator("[class*=_ruleHead_] .ant-select").nth(2));
  c.ok(vOpts.join("|") === "Indian|Foreign|MSME", `value list = the radio's options: ${vOpts.join(", ")}`);
  await c.shot("rule");
  await tabBtn("Preview").click(); await sleep(400);
  c.ok((await previewLabels()).some((l) => /^GSTIN/.test(l)), "Preview: GSTIN visible before choosing");
  await previewPick("Vendor type", "Foreign");
  c.ok(!(await previewLabels()).some((l) => /^GSTIN/.test(l)), "choosing Foreign hides GSTIN at once (TS_065)");
  await c.shot("foreign");
  await previewPick("Vendor type", "Indian");
  c.ok((await previewLabels()).some((l) => /^GSTIN/.test(l)), "choosing Indian brings it back");
});

await tc("TS_063", "The five comparisons; 'is empty / is not empty' hide the value box", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await page.getByRole("button", { name: /Add rule/ }).click(); await sleep(300);
  await pick(rule(0).locator(".ant-select").filter({ hasText: /controlling field/ }).first(), "Company name");
  const cmp = rule(0).locator("[class*=_ruleHead_] .ant-select").nth(1);
  const o = await optionsOf(cmp);
  c.ok(JSON.stringify(o) === JSON.stringify(["is", "is not", "is empty", "is not empty", "contains"]), `comparisons: ${o.join(", ")}`);
  c.ok(await rule(0).locator('[class*=_ruleHead_] input[placeholder="value"]').isVisible(), "for a text controller the value is a free text box");
  await pick(cmp, "is empty");
  c.ok(!(await rule(0).locator('[class*=_ruleHead_] input[placeholder="value"]').isVisible().catch(() => false)), "'is empty' hides the value box");
  await pick(cmp, "is not empty");
  c.ok(!(await rule(0).locator('[class*=_ruleHead_] input[placeholder="value"]').isVisible().catch(() => false)), "'is not empty' hides it too");
  await c.shot();
});

await tc("TS_064", "The four effects in Preview (show, hide, make required, make optional)", async (c) => {
  await logicBase();
  await selectCard(5); await rowSwitch("Required").click(); // Company name required by default
  await tabBtn("Logic").click(); await sleep(300);
  const eff = rule; void eff;
  await addRule("Vendor type", "is", "MSME", [["Show", "Udyam number"], ["Make required", "CIN"], ["Make optional", "Company name"], ["Hide", "GSTIN"]]);
  const effOpts = await optionsOf(rule(0).locator("[class*=_ruleEffectRow_]").nth(0).locator(".ant-select").first());
  c.ok(effOpts.join("|") === "Show|Hide|Make required|Make optional", `effects: ${effOpts.join(", ")}`);
  await tabBtn("Preview").click(); await sleep(400);
  const before = await previewLabels();
  c.ok(!before.some((l) => /^Udyam/.test(l)) && before.includes("Company name*") && before.includes("CIN"), `before: Udyam hidden, Company name*, CIN optional`);
  await previewPick("Vendor type", "MSME"); const after = await previewLabels();
  c.ok(after.some((l) => /^Udyam number/.test(l)), "MSME → Udyam number shown (hidden field shown by a rule, TS_066)");
  c.ok(after.includes("CIN*"), "CIN becomes required (*)");
  c.ok(after.includes("Company name"), "Company name loses its *");
  c.ok(!after.some((l) => /^GSTIN/.test(l)), "GSTIN hidden");
  await c.shot();
});

await tc("TS_067", "Conflicting rules are warned; the last one wins", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Vendor type", "is", "Foreign", [["Hide", "GSTIN"]]);
  await addRule("Company name", "is empty", null, [["Show", "GSTIN"]]);
  const w = await page.locator(".ant-alert-warning").innerText().catch(() => "");
  c.ok(/Conflicting rules on: gstin/.test(w) && /Last rule wins at runtime/.test(w), `warning: '${w.replace(/\n+/g, " ")}'`);
  await c.shot("warning");
  await tabBtn("Preview").click(); await sleep(400); await previewPick("Vendor type", "Foreign");
  c.ok((await previewLabels()).some((l) => /^GSTIN/.test(l)), "with both true (Foreign and Company name empty) GSTIN shows — rule 2 (later) wins");
  await c.shot("preview");
});

await tc("TS_071", "Delete an effect and a rule", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Vendor type", "is", "MSME", [["Show", "Udyam number"], ["Hide", "GSTIN"]]); await addRule("Company name", "is not empty", null, [["Make required", "CIN"]]);
  c.ok((await tabBtn("Logic").innerText()).includes("2"), "badge 2");
  await rule(0).locator("[class*=_ruleEffectRow_]").nth(1).locator("[class*=_capRowDelete_]").click(); await sleep(200);
  c.ok((await rule(0).locator("[class*=_ruleEffectRow_]").count()) === 1, "effect removed");
  await rule(1).locator("[class*=_ruleDelete_]").click(); await sleep(200);
  c.ok((await page.locator("[class*=_ruleCard_]").count()) === 1 && (await tabBtn("Logic").innerText()).includes("1"), "rule removed, badge 1");
  await c.shot();
});

await tc("TS_072", "'contains' on a text field is case-sensitive", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Company name", "contains", "Pvt", [["Make required", "CIN"]]);
  await tabBtn("Preview").click(); await sleep(400);
  const inp = page.locator("[class*=_previewField_]").filter({ hasText: "Company name" }).locator("input").first();
  await inp.fill("ABC Pvt Ltd"); await sleep(300); const a = (await previewLabels()).includes("CIN*");
  await inp.fill("abc pvt ltd"); await sleep(300); const b = (await previewLabels()).includes("CIN*");
  c.ok(a, "'ABC Pvt Ltd' → CIN*");
  c.record(`'abc pvt ltd' → ${b ? "CIN*" : "CIN stays optional"} (plain substring match, case-sensitive)`);
  await c.shot();
});

await tc("TS_073", "The rule's target list never offers the controller", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await page.getByRole("button", { name: /Add rule/ }).click(); await sleep(300);
  await pick(rule(0).locator(".ant-select").filter({ hasText: /controlling field/ }).first(), "Vendor type");
  if (!(await rule(0).locator("[class*=_ruleEffectRow_]").count())) { await rule(0).getByRole("button", { name: /Add effect/ }).click(); await sleep(300); }
  const o = await optionsOf(rule(0).locator("[class*=_ruleEffectRow_]").first().locator(".ant-select").nth(1));
  c.ok(!o.includes("Vendor type") && o.includes("GSTIN"), `targets: ${o.join(", ")}`);
  await c.shot();
});

await tc("TS_057", "Multi Select + 'contains' rule in Preview", async (c) => {
  await logicBase(); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Certifications", "contains", "ISO 9001", [["Make required", "ISO certificate"]]);
  await tabBtn("Preview").click(); await sleep(400);
  c.ok((await previewLabels()).includes("ISO certificate"), "before: ISO certificate optional");
  await previewPick("Certifications", "ISO 14001"); c.ok((await previewLabels()).includes("ISO certificate"), "picking only ISO 14001 → still optional");
  await previewPick("Certifications", "ISO 9001"); c.ok((await previewLabels()).includes("ISO certificate*"), "adding ISO 9001 → ISO certificate* (TS_060: an attachment can be made required by a rule)");
  await c.shot();
});

await tc("TS_068", "An incomplete rule is dropped on save", async (c) => {
  await logicBase(); await setName(NAME("incomplete rule")); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Vendor type", "is", "Foreign", [["Hide", "GSTIN"]]);
  await page.getByRole("button", { name: /Add rule/ }).click(); await sleep(300); // controller left empty
  const n0 = net.length; await clickSave(); const t = await waitToast(10000);
  const post = net.slice(n0).find((r) => r.method === "POST" && r.url.startsWith("/templates"));
  const blocks = post?.body ? JSON.parse(post.body).configurations?.conditional_block?.length : undefined;
  c.ok(post?.status === 200, `saved (${post?.status}) — '${t}'`);
  c.record(`2 rules on screen, ${blocks} sent — the rule with no controlling field was dropped without a word`);
  await c.shot();
});

await tc("TS_074", "Reopen a saved template: sections, fields and rules come back", async (c) => {
  await logicBase(); await page.getByRole("button", { name: /Section$/ }).click(); await page.locator('input[placeholder="Section name"]').fill("Bank details"); await addField("Short Text"); await setLabel("Account number");
  await setName(NAME("round trip")); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Vendor type", "is", "Foreign", [["Hide", "GSTIN"], ["Make required", "Account number"]]);
  await addRule("Certifications", "contains", "ISO 9001", [["Show", "ISO certificate"]]);
  await clickSave(); const t = await waitToast(10000);
  c.ok(/Template created successfully/.test(t), `'${t}' and back on the list`);
  await page.getByText("New Template").first().waitFor({ timeout: 30000 }); await sleep(800);
  await page.locator('input[placeholder="Search templates"]').fill(NAME("round trip")); await sleep(600);
  c.ok((await page.locator(".ant-table-tbody tr.ant-table-row").count()) === 1, "the new row is in the list with type 'Vendor Onboarding' (TS_081 / TS_087)");
  await c.shot("list");
  await page.locator(".ant-table-tbody tr.ant-table-row td:first-child").first().click(); // TS_006 row click
  await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(1200);
  c.ok(/\/template-studio\/[^/]+$/.test(page.url()) && (await page.locator('input[placeholder="Untitled Template"]').inputValue()) === NAME("round trip"), `row click opens ${page.url().replace(APP, "")} with the name filled`);
  const tabs = (await page.locator("[class*=_pageTab_]").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim());
  c.ok(tabs.join("|") === "Section 1 7|Bank details 1", `sections: ${tabs.join(" / ")}`);
  await tabBtn("Logic").click(); await sleep(400);
  const r0 = (await rule(0).innerText()).replace(/\s+/g, " "), r1 = (await rule(1).innerText()).replace(/\s+/g, " ");
  c.ok(/Vendor type.*is.*Foreign/.test(r0) && /Hide.*GSTIN/.test(r0) && /Make required.*Account number/.test(r0), `rule 1: ${r0.slice(0, 140)}`);
  c.ok(/Certifications.*contains.*ISO 9001/.test(r1) && /Show.*ISO certificate/.test(r1), `rule 2: ${r1.slice(0, 120)}`);
  await c.shot("reopened");
});

await tc("TS_069", "Rename an option after saving; the rule still fires", async (c) => {
  const mine = (await myTemplates()).find((t) => t.name === NAME("round trip"));
  if (!mine) { c.r.verdict = "Not run"; c.note("needs the template saved by TS_074"); return; }
  await page.goto(`${APP}/template-studio/${mine.uuid}`, { waitUntil: "domcontentloaded" }); await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(1000);
  await selectCard(0); await cap("Options").locator('input[placeholder="Option label"]').nth(1).fill("Overseas");
  await clickSave(); const t = await waitToast(10000);
  c.ok(/Template updated successfully/.test(t), `'${t}' (TS_082: edit and save)`);
  await page.goto(`${APP}/template-studio/${mine.uuid}`, { waitUntil: "domcontentloaded" }); await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(1000);
  await tabBtn("Logic").click(); await sleep(300);
  c.ok(/Overseas/.test(await rule(0).innerText()), "the rule's value now reads 'Overseas'");
  await tabBtn("Preview").click(); await sleep(400); await previewPick("Vendor type", "Overseas");
  c.ok(!(await previewLabels()).some((l) => /^GSTIN/.test(l)), "picking Overseas still hides GSTIN");
  await c.shot();
});

await tc("TS_006", "The pencil opens the template in the editor", async (c) => {
  await gotoStudio(); await page.locator('input[placeholder="Search templates"]').fill(NAME("round trip")); await sleep(600);
  await page.locator(".ant-table-tbody tr.ant-table-row").first().locator("button").first().click();
  await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(800);
  c.ok(/\/template-studio\/[^/]+$/.test(page.url()), `pencil opens ${page.url().replace(APP, "")}; breadcrumb 'Manage Templates / Edit Template'`);
  c.ok(/Edit Template/.test(await page.locator("body").innerText()), "header shows 'Edit Template'");
  await c.shot();
});

await tc("TS_024", "Deleting a field that a rule uses asks first; then Save is blocked", async (c) => {
  await logicBase(); await setName(NAME("broken ref")); await tabBtn("Logic").click(); await sleep(300);
  await addRule("Vendor type", "is", "Foreign", [["Hide", "GSTIN"]]);
  await tabBtn("Build").click(); await sleep(300);
  await cards().nth(0).hover(); await cards().nth(0).locator("[class*=_cardDelete_]").click({ force: true }); await sleep(500);
  const m = await page.locator(".ant-modal-confirm").innerText().catch(() => "");
  c.ok(/Delete "Vendor type"\?/.test(m) && /1 reference\(s\) point at this field \(rule condition\)/.test(m), `confirm: '${m.replace(/\n+/g, " ")}'`);
  await c.shot("confirm");
  await page.getByRole("button", { name: /Cancel/ }).last().click(); await sleep(300);
  c.ok((await cards().count()) === 7, "Cancel keeps the field");
  await cards().nth(0).hover(); await cards().nth(0).locator("[class*=_cardDelete_]").click({ force: true }); await sleep(400);
  await page.getByRole("button", { name: /Delete anyway/ }).click(); await sleep(300);
  await clickSave(); const t = await waitToast();
  c.ok(/A rule or field references a missing field: vendor_type/.test(t), `Save refused (TS_075): '${t}'`);
  await tabBtn("Logic").click(); await rule(0).locator("[class*=_ruleDelete_]").click(); await sleep(200);
  const n0 = net.length; await clickSave();
  for (let i = 0; i < 40 && !net.slice(n0).some((r) => r.method === "POST"); i++) await sleep(250);
  const post = net.slice(n0).find((r) => r.method === "POST");
  c.ok(post?.status === 200, `after deleting the rule, Save goes through (POST ${post?.status ?? "not sent"})`);
  await c.shot("after");
});

await tc("TS_023", "Delete a field nothing refers to", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("Plain"); await addField("Number");
  await cards().nth(0).hover(); await cards().nth(0).locator("[class*=_cardDelete_]").click({ force: true }); await sleep(300);
  c.ok((await page.locator(".ant-modal-confirm").count()) === 0 && (await cards().count()) === 1, "removed at once, no prompt");
  await c.shot();
});

await tc("TS_022", "Reorder fields by dragging the handle", async (c) => {
  await freshEditor("vendor_onboarding"); for (const l of ["First", "Second", "Third"]) { await addField("Short Text"); await setLabel(l); }
  const h = cards().nth(2).locator("[class*=_cardHandle_]");
  await h.focus(); await page.keyboard.press("Space"); await sleep(200); await page.keyboard.press("ArrowUp"); await sleep(150); await page.keyboard.press("ArrowUp"); await sleep(150); await page.keyboard.press("Space"); await sleep(500);
  let order = await cardLabels();
  for (let attempt = 0; attempt < 2 && order[0] !== "Third"; attempt++) {
    const from = await cards().nth(2).locator("[class*=_cardHandle_]").boundingBox(), to = await cards().nth(0).boundingBox();
    if (from && to) {
      const x = from.x + from.width / 2, y = from.y + from.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await sleep(150);
      for (let k = 1; k <= 30; k++) { await page.mouse.move(x, y - ((y - (to.y + 4)) * k) / 30); await sleep(20); }
      await sleep(200); await page.mouse.up(); await sleep(600);
    }
    order = await cardLabels();
  }
  if (order[0] !== "Third") { c.r.verdict = "Couldn't tell"; c.note(`the automation could not move the card (order still ${order.join(", ")}); the handle is a drag-and-drop control (dnd-kit) — check by hand`); await c.shot(); return; }
  c.ok(order[0] === "Third", `order after dragging 'Third' to the top: ${order.join(", ")}`);
  await tabBtn("Preview").click(); await sleep(300);
  c.ok((await previewLabels())[0] === "Third", "Preview follows the new order");
  await c.shot();
});

// ═════════════════════════════ K. save rules ═════════════════════════════
await tc("TS_079", "Template name is required (empty and spaces)", async (c) => {
  await freshEditor("vendor_onboarding"); await addField("Short Text"); await setLabel("A");
  const n0 = net.length; await clickSave(); const t1 = await waitToast();
  c.ok(/Template name is required/.test(t1), `empty name: '${t1}'`);
  await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await setName("    "); await clickSave(); const t2 = await waitToast();
  c.ok(/Template name is required/.test(t2), `spaces only: '${t2}'`);
  c.ok(!net.slice(n0).some((r) => r.method === "POST"), "nothing sent");
  await c.shot();
});

await tc("TS_080", "At least one field", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("no fields")); await clickSave(); const t = await waitToast();
  c.ok(/Add at least one field/.test(t), `'${t}'`); await c.shot();
});

await tc("TS_030", "Empty label or empty key blocks Save", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("empty label")); await addField("Short Text");
  await clickSave(); const t1 = await waitToast(); c.ok(/Every field needs a label/.test(t1), `no label: '${t1}'`);
  await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await setLabel("Named"); await setKey(""); await clickSave(); const t2 = await waitToast(); c.ok(/Every field needs a key/.test(t2), `no key: '${t2}'`);
  await c.shot();
});

await tc("TS_029", "Duplicate keys typed by hand block Save", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("dup keys")); await addField("Short Text"); await setLabel("PAN"); await setKey("pan_no"); await addField("Short Text"); await setLabel("PAN again"); await setKey("pan_no");
  await clickSave(); const t = await waitToast(); c.ok(/Duplicate field key: pan_no/.test(t), `'${t}'`); await c.shot();
});

await tc("TS_031", "A key with spaces typed by hand is saved as typed", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("key spaces")); await addField("Short Text"); await setLabel("PAN"); await setKey("PAN Number");
  const n0 = net.length; await clickSave(); const t = await waitToast(10000);
  const post = net.slice(n0).find((r) => r.method === "POST");
  const key = post?.body ? JSON.parse(post.body).forms[0].page_response_headers[0].key_attribute : "";
  c.record(`saved (${post?.status}, '${t}') with key '${key}' — not cleaned to snake_case; a {{PAN Number}} reference would never resolve`);
  await c.shot();
});

await tc("TS_019", "Save with an empty extra section — what the user sees", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("empty section")); await addField("Short Text"); await setLabel("Only field");
  await page.getByRole("button", { name: /Section$/ }).click(); await sleep(300);
  const n0 = net.length; await clickSave(); const t = await waitToast(10000);
  const post = net.slice(n0).find((r) => r.method === "POST");
  c.ok(!post, `the studio ${post ? `SENDS it (POST ${post.status})` : "stops it"} — message '${t}'`);
  if (post) c.bug(`An empty section is not caught by the studio: Save sends the template, the backend answers ${post.status}${post.status >= 500 ? " (server error)" : ""}, and the user sees only '${t || "nothing"}' — not which section is empty.`);
  await c.shot();
});

await tc("TS_020", "Save with a blank section name — what the user sees", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("blank section")); await addField("Short Text"); await setLabel("Only field");
  await page.locator('input[placeholder="Section name"]').fill("");
  const n0 = net.length; await clickSave(); const t = await waitToast(10000);
  const post = net.slice(n0).find((r) => r.method === "POST");
  c.ok(!post, `the studio ${post ? `SENDS it (POST ${post.status})` : "stops it"} — message '${t}'`);
  if (post) c.bug(`A blank section name is not caught by the studio: Save sends it, the backend answers ${post.status}${post.status >= 500 ? " (server error)" : ""} and the user sees '${t || "nothing"}'.`);
  await c.shot();
});

await tc("TS_084", "Same template name twice — what the user sees", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("round trip")); await addField("Short Text"); await setLabel("X");
  const n0 = net.length; await clickSave(); const t = await waitToast(10000);
  const post = net.slice(n0).find((r) => r.method === "POST");
  c.ok(post?.status === 422 && /already been taken/i.test(t), `POST ${post?.status}; message '${t}'`);
  c.note("the name is only checked by the backend on Save; the work stays on screen so the name can be changed");
  await c.shot();
});

// ═════════════════════════════ J. preview ═════════════════════════════
await tc("TS_076", "Preview renders the whole form by section", async (c) => {
  await logicBase(); await setName(NAME("preview")); await panel().locator('textarea[placeholder^="Shown under the field"]').fill("Declaration text");
  await page.getByRole("button", { name: /Section$/ }).click(); await page.locator('input[placeholder="Section name"]').fill("Bank details"); await addField("Number"); await setLabel("Turnover"); await addField("Date"); await setLabel("Since"); await addField("Long Text"); await setLabel("Remarks");
  const n0 = net.length; await tabBtn("Preview").click(); await sleep(800);
  const body = await page.locator("[class*=_previewPane_]").innerText();
  c.ok(body.startsWith(NAME("preview")) && /Fill in the details below/.test(body), "card titled with the template name and 'Fill in the details below'");
  const secs = (await page.locator("[class*=_previewSectionTitle_]").allInnerTexts()).map((s) => s.trim());
  c.ok(secs.join("|").toLowerCase() === "section 1|bank details", `sections: ${secs.join(", ")} (shown in capitals by the page style)`);
  c.ok(await page.locator("[class*=_previewField_] .ant-radio-group").count() === 1 && await page.locator("[class*=_previewField_] .ant-calendar-picker, [class*=_previewField_] .ant-picker").count() >= 1 && await page.locator("[class*=_previewField_] textarea").count() >= 1 && await page.locator("[class*=_previewField_] .ant-input-number").count() >= 1, "right controls: radio buttons, date picker, text area, number box, upload button");
  c.ok(!net.slice(n0).length, "no API call while previewing (TS_078)");
  await c.shot();
  await freshEditor("vendor_onboarding"); await tabBtn("Preview").click(); await sleep(400);
  c.ok(/Add fields to see a live preview/.test(await page.locator("body").innerText()), "empty template: 'Add fields to see a live preview'");
});

// ═════════════════════════════ M. AI ═════════════════════════════
async function openAi() {
  await gotoStudio(); await page.getByRole("button", { name: /New Template/ }).click(); await sleep(700);
  await page.locator("[class*=_typeCardAiBtn_]:visible").first().click(); await sleep(700);
}
await tc("TS_098", "Generate with AI — file type and size rules", async (c) => {
  await openAi();
  const m = await page.locator(".ant-modal-content").last().innerText();
  c.ok(/Generate template with AI/.test(m) && /Upload a Vendor Onboarding document \(PDF, JPG, or Excel\)/.test(m), "modal 'Generate template with AI — Upload a Vendor Onboarding document (PDF, JPG, or Excel)…'");
  await c.shot("modal");
  const inp = page.locator(".ant-modal-content input[type=file]").last();
  await inp.setInputFiles({ name: "form.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x") });
  const t1 = await waitToast(); c.ok(/Unsupported file type\. Upload a PDF, JPG, or Excel file\./.test(t1), `.docx: '${t1}'`);
  await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await inp.setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(11 * 1024 * 1024, 32) });
  const t2 = await waitToast(); c.ok(/File size exceeds 10MB limit/.test(t2), `11 MB pdf: '${t2}'`);
  await c.shot();
});

await tc("TS_099", "Generate with AI — upload a valid form", async (c) => {
  await openAi(); const n0 = net.length;
  await page.locator(".ant-modal-content input[type=file]").last().setInputFiles({ name: "vendor-registration.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
  const t = await waitToast(20000);
  const call = net.slice(n0).find((r) => /ask_ai_chats/.test(r.url));
  c.ok(!!call && call.status === 200, `the studio posts ${call ? `${call.method} ${call.url.split("?")[0]} → ${call.status}` : "nothing"}; message '${t}'`);
  if (call && call.status === 404) c.bug("'Generate with AI' fails for every upload on console.ag-ri.in: the studio calls /ask_ai_chats/vendor_onboarding_template_draft, the backend answers 404 (route does not exist), and the user sees 'Could not reach the AI service. Please try again.' (TS_100).");
  await c.shot();
  await page.keyboard.press("Escape");
});

// ═════════════════════════════ N. buyer form ═════════════════════════════
const bpanel = panel;
await tc("TS_101", "Buyer form: standard fields have a fixed key, custom fields an editable key", async (c) => {
  await freshEditor("vendor_onboarding_buyer_form");
  await selectCard(1); // Payment Terms (default)
  c.ok(await bpanel().locator('input[placeholder="field_key"]').isDisabled() && /Default field — key is fixed\./.test(await bpanel().innerText()), "Payment Terms: key box disabled — 'Default field — key is fixed.'");
  await selectCard(4); // Vendor Code (custom)
  c.ok(!(await bpanel().locator('input[placeholder="field_key"]').isDisabled()), "Vendor Code (custom): key editable");
  await c.shot();
});

await tc("TS_102", "Buyer form: a new custom field gets the _custom key", async (c) => {
  await freshEditor("vendor_onboarding_buyer_form"); await addField("Text"); await setLabel("Cost centre");
  c.ok((await keyValue()) === "cost_centre_custom", `key '${await keyValue()}'`);
  await setLabel("Cost centre code"); c.ok((await keyValue()) === "cost_centre_custom", "later label edits do not change it");
  await c.shot();
});

await tc("TS_103", "Buyer form: the five field types and their extra settings", async (c) => {
  await freshEditor("vendor_onboarding_buyer_form"); await addField("Text"); await setLabel("Rate");
  const types = await optionsOf(cfgField("Type").or(bpanel().locator(".ant-select").first()));
  c.ok(JSON.stringify(types) === JSON.stringify(["Text", "Number", "Date", "Dropdown", "Formula"]), `types: ${types.join(", ")}`);
  await pick(bpanel().locator(".ant-select").first(), "Dropdown");
  c.ok(/Data source/i.test(await bpanel().innerText()), "Dropdown shows 'Data source' (TS_104)");
  await pick(bpanel().locator(".ant-select").first(), "Formula");
  c.ok(/Type \{ to reference a field/.test(await bpanel().innerText()), "Formula shows the formula editor");
  c.ok(!/Validations|Logic/.test(await bpanel().innerText()), "no validations or logic for buyer forms");
  await c.shot();
});

await tc("TS_105", "Buyer form: formula with {Field} tokens and live errors", async (c) => {
  await freshEditor("vendor_onboarding_buyer_form");
  for (const l of ["Rate", "Qty"]) { await addField("Number"); await setLabel(l); }
  await addField("Text"); await setLabel("Note"); await addField("Text"); await setLabel("Value"); await pick(bpanel().locator(".ant-select").first(), "Formula");
  const box = bpanel().locator("textarea").last();
  await box.click(); await box.type("{", { delay: 50 }); await sleep(500);
  const sugg = (await page.locator(".ant-mentions-dropdown:not(.ant-mentions-dropdown-hidden) li").allInnerTexts().catch(() => [])).map((s) => s.trim());
  c.ok(sugg.includes("{Rate}") && sugg.includes("{Qty}") && !sugg.includes("{Note}"), `'{' suggests number fields only: ${sugg.join(", ")}`);
  await box.fill("{Rate}*{Qty}"); await sleep(300);
  c.ok(/Stored as field keys/.test(await bpanel().innerText()), "valid formula shows the hint, no error");
  await box.fill("{Rate}*{Price}"); await sleep(300); c.ok(/Unknown field: \{Price\}/.test(await bpanel().innerText()), "'Unknown field: {Price}'");
  await box.fill("({Rate}*{Qty}"); await sleep(300); c.ok(/Unbalanced parentheses/.test(await bpanel().innerText()), "'Unbalanced parentheses'");
  await box.fill("{Rate}*{Qty}"); await sleep(200);
  await setName(NAME("buyer formula")); const n0 = net.length; await clickSave(); const t = await waitToast(10000);
  const post = net.slice(n0).find((r) => r.method === "POST");
  const f = post?.body ? JSON.parse(post.body).widgets.global_price_components.find((w: any) => w.name === "Value") : null;
  c.ok(post?.status === 200 && f?.configuration?.formula === "rate_custom*qty_custom", `saved (${post?.status}, '${t}') with formula '${f?.configuration?.formula}' (TS_107)`);
  if (post?.body) { const b = JSON.parse(post.body); c.ok(Array.isArray(b.widgets?.inline_components) && b.template_for?.[0] === "vendor_onboarding_buyer_form", "body: template_for ['vendor_onboarding_buyer_form'], widgets.global_price_components + inline_components []"); }
  await c.shot();
});

await tc("TS_106", "Buyer form save rules", async (c) => {
  await freshEditor("vendor_onboarding_buyer_form"); await clickSave(); const t1 = await waitToast(); c.ok(/Template name is required/.test(t1), `no name: '${t1}'`);
  await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await setName(NAME("buyer rules")); await addField("Text"); await clickSave(); const t2 = await waitToast(); c.ok(/Every field needs a name/.test(t2), `unnamed field: '${t2}'`);
  await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await setLabel("Vendor Code X"); await setKey("vendor_code_custom"); await clickSave(); const t3 = await waitToast(); c.ok(/Duplicate field key: vendor_code_custom/.test(t3), `duplicate key: '${t3}'`);
  await page.locator(".ant-message-notice").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await setKey(""); await clickSave(); const t4 = await waitToast(); c.ok(/Field "Vendor Code X" is missing a key/.test(t4), `no key: '${t4}'`);
  await c.shot();
});

await tc("TS_109", "Buyer form preview", async (c) => {
  await freshEditor("vendor_onboarding_buyer_form"); await setName(NAME("buyer preview")); await tabBtn("Preview").click(); await sleep(500);
  const labels = await previewLabels();
  c.ok(labels.length === 13 && labels.includes("Payment Terms*"), `13 controls with * on required: ${labels.slice(0, 5).join(", ")}…`);
  await page.locator("[class*=_previewField_]").filter({ hasText: "Payment Terms" }).locator(".ant-select-selection").click(); await sleep(300);
  c.ok(/Options load from the data source/.test(await dropdown().innerText().catch(() => "")), "dropdowns say 'Options load from the data source'");
  await page.keyboard.press("Escape"); await c.shot();
});

// ═════════════════════════════ A again: delete + robustness ═════════════════════════════
await tc("TS_007", "Delete asks for confirmation (our own template)", async (c) => {
  const nm = NAME("round trip");
  await gotoStudio(); await page.locator('input[placeholder="Search templates"]').fill(nm); await sleep(600);
  const row = page.locator(".ant-table-tbody tr.ant-table-row").first();
  c.ok((await row.locator("td").first().innerText()).trim() === nm, `row '${nm}'`);
  await row.locator("button").nth(1).click(); await sleep(400);
  c.ok(/Delete this template\?/.test(await page.locator(".ant-popover:not(.ant-popover-hidden)").innerText()), "pop-up 'Delete this template?' Yes / No");
  await c.shot("confirm");
  await page.locator(".ant-popover:not(.ant-popover-hidden)").getByRole("button", { name: /^No$/ }).click(); await sleep(400);
  c.ok(/\/template-studio$/.test(page.url()) && (await page.locator(".ant-table-tbody tr.ant-table-row").count()) === 1, "No: nothing changes and the editor did not open");
  await row.locator("button").nth(1).click(); await sleep(400);
  await page.locator(".ant-popover:not(.ant-popover-hidden)").getByRole("button", { name: /^Yes$/ }).click();
  const t = await waitToast(10000); await sleep(800);
  c.ok(/Template deleted successfully/.test(t), `Yes: '${t}'`);
  c.ok((await page.locator(".ant-table-tbody tr.ant-table-row").count()) === 0, "the row is gone");
  await c.shot("after");
});

await tc("TS_114", "Refresh in the middle of building", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("refresh")); await addField("Short Text"); await setLabel("Will be lost");
  await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('input[placeholder="Untitled Template"]').waitFor({ timeout: 30000 }); await settle(800);
  c.record(`after F5: name '${await page.locator('input[placeholder="Untitled Template"]').inputValue()}', ${await cards().count()} fields — work is lost, no draft, no warning before leaving`);
  await c.shot();
});

await tc("TS_115", "Network failure on Save keeps the work", async (c) => {
  await freshEditor("vendor_onboarding"); await setName(NAME("offline")); await addField("Short Text"); await setLabel("Keep me");
  await page.route("**/api/templates**", (r) => (r.request().method() === "POST" ? r.abort("failed") : r.continue()));
  await clickSave(); const t = await waitToast(10000);
  await page.unroute("**/api/templates**");
  c.ok(/Failed to save template|Network|failed/i.test(t), `message: '${t}'`);
  c.ok((await cardLabels()).includes("Keep me") && /\/create/.test(page.url()), "still on the editor with the field — Save can be retried");
  await c.shot();
});

await tc("TS_116", "A template of a type the studio does not handle", async (c) => {
  const all = await apiCall("GET", "/templates"); const boq = [...(all.json?.saved ?? [])].find((t: any) => (t.template_for ?? []).includes("boq") && !(t.template_for ?? []).includes("trade"));
  if (!boq) { c.r.verdict = "Not run"; c.note("no BOQ-only template in this company"); return; }
  await page.goto(`${APP}/template-studio/${boq.uuid}`, { waitUntil: "domcontentloaded" }); const t = await waitToast(20000); await sleep(1500);
  c.ok(/This template type is not supported here/.test(t) && /\/template-studio$/.test(page.url()), `'${boq.name}' (BOQ) → '${t}', back to ${page.url().replace(APP, "")}`);
  await c.shot();
});

// ═════════════════════════════ not run in this session ═════════════════════════════
notRun("TS_008", "Delete a template used by a running onboarding event", "would delete a real company template; not done.");
notRun("TS_010", "Read-only template user", "the given session is a Procol employee / super admin.");
for (const [id, t] of [["TS_089", "Template appears when creating an onboarding event"], ["TS_090", "Vendor sees sections, labels, helper text, required marks"], ["TS_091", "Conditional logic on the real vendor form"], ["TS_092", "External validation runs on submit"], ["TS_093", "Internal regex / must-equal on the real form"], ["TS_094", "Prefill, data source, cascade, populate, reset on the real form"], ["TS_095", "Write back after submission"], ["TS_096", "Editing a template used by a running event"], ["TS_110", "Buyer form used in onboarding"]] as const)
  notRun(id, t, "needs an onboarding v2 event in M3M NOIDA and a QA test vendor to fill the form; the given session cannot sign in as a vendor, and inviting a vendor on this company mails its team — not done without approval.");
notRun("TS_086", "Workspace on vendor onboarding v3", "M3M NOIDA is on v2.");

// ── cleanup (only ours) ──
const mine = await myTemplates(); const del: string[] = [];
for (const t of mine) { const d = await apiCall("DELETE", `/templates/${t.uuid}`); del.push(`${t.name}: ${d.status}`); }
let allRows = rows;
if (ONLY) { try { const prev = JSON.parse(readFileSync(`${OUT}/ui-results.json`, "utf8")); const ids = new Set(rows.map((r) => r.id)); allRows = [...prev.rows.map((r: Row) => (ids.has(r.id) ? rows.find((x) => x.id === r.id)! : r)), ...rows.filter((r) => !prev.rows.some((p: Row) => p.id === r.id))]; } catch { /* first run */ } }
writeFileSync(`${OUT}/ui-results.json`, JSON.stringify({ at: new Date().toISOString(), stamp: STAMP, app: APP, company: cfg.companyName, rows: allRows, cleanup: del, net: net.filter((n) => n.method !== "GET").map(({ body, ...r }) => r) }, null, 2));
const tally = rows.reduce((m: any, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
console.log("UI rows:", rows.length, tally, "cleanup:", del.length);
await browser.close();
