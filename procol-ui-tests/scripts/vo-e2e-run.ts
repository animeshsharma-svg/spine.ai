/**
 * Vendor onboarding end to end on cpanel / vendor portal, one template at a time.
 *   npx tsx scripts/vo-e2e-run.ts --t T1 [--start]   (--start = buyer starts onboarding first, in the cpanel drawer)
 * Uses vo-e2e/setup.json (templates + QA prospects). Writes vo-e2e/results-<T>.json and shots/.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as F from "./vo-form.js";
import { vendorUiLogin } from "./vo-vendor-ui.js";

const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
mkdirSync(`${OUT}/shots`, { recursive: true });
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const T = process.argv[process.argv.indexOf("--t") + 1];
const tpl = setup.templates[T], pro = setup.prospects[T];
const API = "https://sec-api.ag-ri.in/api";
const buyerTok = JSON.parse(readFileSync(".auth/tokens.json", "utf8")).accessTokenHeader as string;
async function bcall(method: string, path: string, body?: unknown, ver = "9.4.377") {
  const r = await fetch(API + path, { method, headers: { "access-token": buyerTok, "app-version": ver, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {} return { s: r.status, j, t };
}

type V = "Pass" | "Fail" | "Record" | "Not run" | "Couldn't tell";
type Row = { id: string; template: string; side: string; title: string; verdict: V; checks: string[]; shots: string[]; bug?: string };
const rows: Row[] = [];
let page!: Page;
async function tc(id: string, side: string, title: string, fn: (c: { ok: (b: boolean, w: string, fv?: V) => boolean; note: (s: string) => void; record: (s: string) => void; bug: (s: string) => void; shot: (t?: string) => Promise<void> }) => Promise<void>) {
  const r: Row = { id, template: `${T} ${tpl.title}`, side, title, verdict: "Pass", checks: [], shots: [] }; rows.push(r);
  const c = {
    ok: (b: boolean, w: string, fv: V = "Fail") => { r.checks.push(`${b ? "✔" : "✘"} ${w}`); if (!b && (r.verdict === "Pass" || (r.verdict === "Record" && fv === "Fail"))) r.verdict = fv; return b; },
    note: (s: string) => { r.checks.push(`• ${s}`); },
    record: (s: string) => { r.checks.push(`• ${s}`); if (r.verdict === "Pass") r.verdict = "Record"; },
    bug: (s: string) => { r.bug = s; },
    shot: async (t = "") => { const f = `${id}${t ? "-" + t : ""}.png`; await page.screenshot({ path: `${OUT}/shots/${f}`, fullPage: true }).catch(() => {}); r.shots.push(f); },
  };
  try { await Promise.race([fn(c), new Promise((_, rej) => setTimeout(() => rej(new Error("case took longer than 4 minutes")), 240000))]); }
  catch (e) { c.note(`automation stopped: ${(e as Error).message.split("\n")[0].slice(0, 200)}`); if (r.verdict === "Pass" || r.verdict === "Record") r.verdict = "Couldn't tell"; await c.shot("stopped"); }
  if (!r.shots.length) await c.shot();
  console.log(`${r.verdict.padEnd(13)} ${id} ${title}${r.bug ? "  ⚑" : ""}`);
}
const save = () => writeFileSync(`${OUT}/results-${T}.json`, JSON.stringify({ at: new Date().toISOString(), template: tpl, prospect: { firm: pro.firm, email: pro.email, uuid: pro.uuid }, rows }, null, 2));

const browser = await chromium.launch();

// ── buyer: start onboarding in the cpanel drawer ──
if (process.argv.includes("--start")) {
  const bctx = await browser.newContext({ storageState: ".auth/user.json", viewport: { width: 1600, height: 1000 } });
  page = await bctx.newPage();
  const posts: string[] = []; page.on("response", (r) => { if (/create_vendor_onboarding_events/.test(r.url())) posts.push(`${r.status()}`); });
  await tc(`VOE-${T}-B01`, "Buyer (cpanel)", `Start onboarding for the prospect with template '${tpl.title}'`, async (c) => {
    await page.goto("https://cpanel.ag-ri.in/vendors", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(6000);
    for (const b of ["Got it", "Not now"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1500 }).catch(() => {});
    await page.getByRole("tab", { name: /Prospects/ }).first().click(); await page.waitForTimeout(3000);
    const search = page.locator('input[placeholder*="Search" i]').first(); await search.fill(pro.firm); await page.keyboard.press("Enter"); await page.waitForTimeout(3500);
    const row = page.locator("tr").filter({ hasText: pro.firm }).first();
    c.ok(/Not Initiated/.test(await row.innerText()), `Prospects tab lists '${pro.firm}' with status 'Not Initiated'`);
    await row.locator(".ant-checkbox").first().click(); await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Start Onboarding/i }).first().click(); await page.waitForTimeout(2500);
    const drawer = page.locator(".ant-drawer-content").last();
    c.ok(/Onboarding Prospects/.test(await drawer.innerText()), "drawer 'Onboarding Prospects' opens with Onboarding Template *, time frame and the prospect");
    await drawer.locator(".ant-select-selection").first().click(); await page.waitForTimeout(1500);
    const list = (await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").allInnerTexts()).map((s) => s.trim());
    c.ok(list.includes(tpl.name), `the studio-made template is offered: '${tpl.name}' (${list.length} templates in the list)`);
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").filter({ hasText: tpl.name }).first().click(); await page.waitForTimeout(1500);
    // longest submission window offered
    const durTrigger = drawer.getByText(/^\s*30 Mins\s*$/).first();
    if (await durTrigger.count()) { await durTrigger.click().catch(() => {}); await page.waitForTimeout(800);
      const items = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li, .ant-dropdown:not(.ant-dropdown-hidden) li, .ant-popover:not(.ant-popover-hidden) [role=radio], .ant-popover:not(.ant-popover-hidden) label");
      const names = (await items.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
      c.note(`submission window choices: ${names.join(", ") || "none found"}`);
      const pick = names.find((n) => /1 Days?/i.test(n)) ?? names.find((n) => /4 Hrs/i.test(n));
      if (pick) await items.filter({ hasText: pick }).first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    c.note(`window: ${(await drawer.innerText({ timeout: 5000 }).catch(() => "")).match(/Prospect Submission Deadline:[^|\n]+/)?.[0] ?? "?"}`);
    await c.shot("drawer");
    await drawer.getByRole("button", { name: /^Start$/ }).click(); await page.waitForTimeout(5000);
    c.ok(posts.includes("200"), `Start → POST create_vendor_onboarding_events ${posts.join(",") || "not sent"}`);
    await page.getByRole("tab", { name: /Onboarding In Progress/ }).first().click(); await page.waitForTimeout(3000);
    const s2 = page.locator('input[placeholder*="Search" i]:visible').first();
    if (await s2.count()) { await s2.fill(pro.firm, { timeout: 8000 }).catch(() => {}); await page.keyboard.press("Enter"); await page.waitForTimeout(3500); }
    const r2 = page.locator("tr").filter({ hasText: pro.firm }).first();
    if (!(await r2.count())) { const rq = await bcall("GET", `/companies/${pro.uuid}/onboarding_requests`); c.note(`in-progress list not searchable here; onboarding requests by API: ${(rq.j?.onboarding_requests ?? []).map((x: any) => x.template?.name).join(", ") || "none"}`); }
    c.ok(await r2.count() > 0 || (await bcall("GET", `/companies/${pro.uuid}/onboarding_requests`)).j?.onboarding_requests?.some((x: any) => x.template?.uuid === tpl.uuid), `the prospect moved to 'Onboarding In Progress' (${(await r2.innerText().catch(() => "")).match(/In Progress|Review Pending|Not Initiated|Submission Pending/)?.[0] ?? "status ?"})`);
    await c.shot("in-progress");
  });
  await bctx.close(); save();
}

// ── vendor: sign in and open the form ──
const vctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
page = await vctx.newPage();
await tc(`VOE-${T}-V01`, "Vendor portal", "The prospect finds the onboarding event and opens the form", async (c) => {
  c.ok(await vendorUiLogin(page, pro.email), `signed in on quotes.ag-ri.in as ${pro.email}`);
  const body = await page.locator("body").innerText();
  c.ok(/VENDOR ONBOARDING/.test(body) && /\[Procol Demo\] Vendor Onboarding/.test(body), "Live events show '[Procol Demo] Vendor Onboarding — VENDOR ONBOARDING' with a countdown");
  await page.getByText("Business Partners", { exact: true }).first().click(); await page.waitForTimeout(4000);
  const bp = await page.locator("body").innerText();
  c.ok(/PROCOL DEMO/.test(bp) && /Submission Pending/.test(bp) && /View Onboarding Event/.test(bp), "Business Partners: PROCOL DEMO — 'Onboarding In Progress', 'Submission Pending', 'View Onboarding Event'");
  await c.shot("partners");
  await F.openOnboardingForm(page);
  c.ok(/Submission Sheet/.test(await page.locator("body").innerText()), "the Submission Sheet opens");
  await c.shot("form");
});

const exp = (ks: string[]) => ks.join(", ");
if (T === "T1") {
  const SHOWN = ["legal_name", "business_description", "employees", "incorporation_date", "constitution", "products", "vendor_type", "company_brochure", "contact_email", "buyer_reference"];
  await tc("VOE-T1-V02", "Vendor portal", "Every field of the template is on the form, in order, with the right control", async (c) => {
    const keys = await F.keysShown(page);
    c.ok(JSON.stringify(keys) === JSON.stringify(SHOWN), `fields shown: ${exp(keys)}`);
    c.ok(!keys.includes("internal_code"), "the Hidden field 'Internal code' is not shown");
    const want: Record<string, string> = { legal_name: "text", business_description: "long text", employees: "number", incorporation_date: "date", constitution: "dropdown", products: "multi-select", vendor_type: "radio", company_brochure: "attachment", contact_email: "text", buyer_reference: "text" };
    for (const [k, kind] of Object.entries(want)) { const got = await F.controlKind(page, k); c.ok(got === kind, `${await F.label(page, k)}: ${got}`); }
    const nav = await page.locator("body").innerText();
    c.ok(/2 Sections/.test(nav) && /Company profile/.test(nav) && /Contacts/.test(nav), "right panel '2 Sections': Company profile, Contacts");
  });
  await tc("VOE-T1-V03", "Vendor portal", "Required marks, helper text and the read-only field", async (c) => {
    const req = []; for (const k of SHOWN) if (await F.isRequired(page, k)) req.push(k);
    c.ok(exp(req) === "legal_name, employees, incorporation_date, constitution, vendor_type, contact_email", `* on: ${exp(req)}`);
    c.ok((await F.helper(page, "legal_name")) === "As printed on your GST certificate", `helper under Legal name: '${await F.helper(page, "legal_name")}'`);
    c.ok((await F.helper(page, "buyer_reference")) === "Filled by the buyer", `helper under Buyer reference: '${await F.helper(page, "buyer_reference")}'`);
    c.ok(!(await F.isEditable(page, "buyer_reference")), "Buyer reference (Read-only) is greyed and cannot be typed into");
  });
  await tc("VOE-T1-V04", "Vendor portal", "Dropdown, multi-select and radio show the template's options", async (c) => {
    c.ok(exp(await F.optionsOf(page, "constitution")) === "Proprietorship, Partnership, Company", `Constitution: ${exp(await F.optionsOf(page, "constitution"))}`);
    c.ok(exp(await F.optionsOf(page, "products")) === "Steel, Cement, Electricals", `Products supplied: ${exp(await F.optionsOf(page, "products"))}`);
    c.ok(/Indian.*Foreign/.test(await F.fieldText(page, "vendor_type")), "Vendor type radios: Indian, Foreign");
  });
  await tc("VOE-T1-V05", "Vendor portal", "Submit with required fields missing is refused", async (c) => {
    c.ok(!(await F.submitState(page)), "Submit is disabled on an untouched form", "Record");
    await F.fillText(page, "legal_name", "QA Steel Pvt Ltd");
    const s = await F.submit(page);
    c.ok(!/success|submitted/i.test(s.text), `Submit with only Legal name: enabled ${s.enabled}; ${s.dialog ? `dialog '${s.dialog.slice(0, 160)}'; ` : ""}message '${s.text}'`);
    c.note(`errors on the form: ${(await F.errorsShown(page)).slice(0, 8).join(" | ") || "none marked"}`);
    await c.shot();
  });
  await tc("VOE-T1-V06", "Vendor portal", "Number field refuses letters", async (c) => {
    await F.typeInto(page, "employees", "abc"); const v = await F.valueOf(page, "employees");
    c.ok(v === "", `typing 'abc' leaves '${v}' (the box is a number input)`); await F.typeInto(page, "employees", "120"); c.ok((await F.valueOf(page, "employees")) === "120", "120 is kept");
  });
  await tc("VOE-T1-V07", "Vendor portal", "Attachment limited to PDF", async (c) => {
    const u1 = await F.upload(page, "company_brochure", "brochure.docx", "not a pdf"); const after1 = await F.fieldText(page, "company_brochure");
    c.ok(!/brochure\.docx/.test(after1), `uploading brochure.docx (template allows PDF only): ${u1}; field shows '${after1.slice(0, 80)}'`);
    if (/brochure\.docx/.test(after1)) c.bug("An attachment field limited to PDF in the template accepts a .docx file on the vendor's onboarding form — the file-type setting is not enforced.");
    const u2 = await F.upload(page, "company_brochure", "brochure.pdf"); c.note(`pdf upload: ${u2}`);
    c.ok(/brochure\.pdf/.test(await F.fieldText(page, "company_brochure")), `brochure.pdf uploaded: '${(await F.fieldText(page, "company_brochure")).slice(0, 80)}'`);
    await c.shot();
  });
  await tc("VOE-T1-V08", "Vendor portal", "Fill every field and submit", async (c) => {
    await F.fillText(page, "business_description", "Manufacturer of GI coated sheets");
    await F.pickToday(page, "incorporation_date");
    await F.chooseOption(page, "constitution", ["Company"]); await F.chooseOption(page, "products", ["Steel", "Cement"]);
    await F.chooseRadio(page, "vendor_type", "Indian"); await F.fillText(page, "contact_email", "qa.contact@example.com");
    c.note(`chosen: Constitution '${await F.selected(page, "constitution")}', Products '${await F.selected(page, "products")}'`);
    await c.shot("filled");
    const s = await F.submit(page);
    c.ok(/success|submitted/i.test(s.text) || /Submitted/.test(await page.locator("body").innerText()), `Submit: ${s.dialog ? `dialog '${s.dialog.slice(0, 160)}' → ` : ""}'${s.text}'`);
    await page.waitForTimeout(3000); await c.shot("after");
  });
}

if (T === "T2") {
  const err = async (k: string) => (await F.errorsShown(page)).filter((e) => e.startsWith(k + ":")).join(" ");
  await tc("VOE-T2-V02", "Vendor portal", "PAN in the wrong format shows the template's message", async (c) => {
    await F.fillText(page, "pan", "abcde1234f"); c.note(`typed 'abcde1234f' → field now '${await F.valueOf(page, "pan")}' (format mask ^[A-Z]{5}[0-9]{4}[A-Z]$)`);
    await F.fillText(page, "pan", "ABCD1234F"); await page.waitForTimeout(2500);
    const e = await err("pan"); c.ok(/PAN must look like ABCDE1234F/.test(e + (await F.fieldText(page, "pan"))), `ABCD1234F → '${e || (await F.fieldText(page, "pan")).slice(0, 120)}'`);
    await c.shot();
  });
  await tc("VOE-T2-V03", "Vendor portal", "A well-formed PAN runs the PAN check (external validation)", async (c) => {
    await F.fillText(page, "pan", "ABCPE1234F"); await page.waitForTimeout(8000);
    c.record(`ABCPE1234F (well-formed, not a real PAN) → field shows '${(await F.fieldText(page, "pan")).slice(0, 200)}'`);
    await c.shot();
  });
  await tc("VOE-T2-V04", "Vendor portal", "GSTIN must contain the PAN", async (c) => {
    await F.fillText(page, "gstin", "27AAAAA0000A1Z5"); await page.waitForTimeout(2500);
    c.ok(/GSTIN must contain the PAN/.test((await err("gstin")) + (await F.fieldText(page, "gstin"))), `GSTIN without the PAN → '${(await F.fieldText(page, "gstin")).slice(0, 160)}'`);
    await F.fillText(page, "gstin", "27ABCPE1234F1Z5"); await page.waitForTimeout(2500);
    c.ok(!/GSTIN must contain the PAN/.test(await F.fieldText(page, "gstin")), "GSTIN containing ABCPE1234F → message gone");
    await c.shot();
  });
  await tc("VOE-T2-V05", "Vendor portal", "Re-enter account number: must match and paste is blocked", async (c) => {
    await F.fillText(page, "account_number", "000123456789");
    const box = F.field(page, "reenter_account_number").locator("input").first();
    await box.focus(); await page.evaluate(() => { const el = document.activeElement as HTMLInputElement; const dt = new DataTransfer(); dt.setData("text/plain", "000123456789"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
    await page.waitForTimeout(500); c.ok((await box.inputValue()) === "", `pasting into Re-enter account number → '${await box.inputValue()}' (Block paste)`);
    await F.fillText(page, "reenter_account_number", "000123456780"); await page.waitForTimeout(2500);
    c.ok(/Account numbers do not match/.test(await F.fieldText(page, "reenter_account_number")), `mismatch → '${(await F.fieldText(page, "reenter_account_number")).slice(0, 120)}'`);
    await F.fillText(page, "reenter_account_number", "000123456789"); await page.waitForTimeout(2500);
    c.ok(!/do not match/.test(await F.fieldText(page, "reenter_account_number")), "matching value → message gone");
    await c.shot();
  });
  await tc("VOE-T2-V06", "Vendor portal", "IFSC and mobile number formats", async (c) => {
    await F.fillText(page, "ifsc", "HDFC123"); await F.fillText(page, "mobile", "98765"); await page.waitForTimeout(2500);
    c.ok(/IFSC must look like HDFC0001234/.test(await F.fieldText(page, "ifsc")), `IFSC 'HDFC123' → '${(await F.fieldText(page, "ifsc")).slice(0, 120)}'`);
    c.ok(/Mobile must be 10 digits/.test(await F.fieldText(page, "mobile")), `mobile '98765' → '${(await F.fieldText(page, "mobile")).slice(0, 120)}'`);
    await c.shot("wrong");
    const s = await F.submit(page); c.ok(!/success|submitted/i.test(s.text), `Submit with wrong IFSC / mobile: '${s.text}' ${s.dialog ?? ""}`);
    await F.fillText(page, "ifsc", "HDFC0001234"); await F.fillText(page, "mobile", "9876543210"); await page.waitForTimeout(2500);
    c.ok(!/must look like|must be 10/.test((await F.fieldText(page, "ifsc")) + (await F.fieldText(page, "mobile"))), "correct values → messages gone");
  });
  await tc("VOE-T2-V07", "Vendor portal", "Submit with every check satisfied", async (c) => {
    await c.shot("filled"); const s = await F.submit(page);
    c.ok(/success|submitted/i.test(s.text) || /Submitted/.test(await page.locator("body").innerText()), `Submit: ${s.dialog ? `dialog '${s.dialog.slice(0, 160)}' → ` : ""}'${s.text}'`);
    c.note(`PAN field at submit: '${(await F.fieldText(page, "pan")).slice(0, 160)}'`);
    await page.waitForTimeout(3000); await c.shot("after");
  });
}

if (T === "T2B" || T === "T2C" || T === "T2D") {
  // the form checks each answer on its own (icon next to the answer) and again on Submit
  const good: Record<string, string> = { pan: "ABCPE1234F", gstin: "27ABCPE1234F1Z5", account_number: "000123456789", reenter_account_number: "000123456789", ifsc: "HDFC0001234", mobile: "9876543210" };
  const KEYS = Object.keys(good);
  const fillAll = async (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) await F.fillText(page, k, v); await F.settle(page, KEYS); };
  const states = async () => (await Promise.all(KEYS.map(async (k) => `${k}=${await F.status(page, k)}`))).join(", ");
  const tryBad = async (c: any, key: string, bad: string, msg: RegExp, label: string, required: boolean) => {
    await fillAll(good); await F.fillText(page, key, bad); await F.settle(page, [key]);
    const st = await F.status(page, key), why = await F.reason(page, key);
    c.note(`${label}: icon state '${st}'${why ? `, hover '${why}'` : ""}`);
    const s = await F.submit(page);
    c.ok(!/submitted successfully/i.test(s.text), `Submit refused → '${s.text}'`);
    if (required) c.ok(msg.test(s.text), `the Submit message names the problem (field is required): '${s.text}'`);
    else c.ok(msg.test(s.text), `the Submit message names the problem: '${s.text}'`);
    await c.shot();
    await F.fillText(page, key, (good as any)[key]); await F.settle(page, [key]);
  };
  await tc(`VOE-${T}-V02`, "Vendor portal", "PAN in the wrong format", async (c) => {
    await F.resetDraft(page);
    await F.fillText(page, "pan", "abcde1234f"); c.record(`format mask ^[A-Z]{5}[0-9]{4}[A-Z]$: lower-case 'abcde1234f' stays as typed ('${await F.valueOf(page, "pan")}') — the mask neither capitalises nor blocks`);
    await tryBad(c, "pan", "ABCD1234F", /PAN must look like ABCDE1234F/, "PAN 'ABCD1234F'", true);
  });
  await tc(`VOE-${T}-V03`, "Vendor portal", "GSTIN that does not contain the PAN (optional field)", async (c) => { await tryBad(c, "gstin", "27AAAAA0000A1Z5", /GSTIN must contain the PAN/, "GSTIN '27AAAAA0000A1Z5' with PAN ABCPE1234F", false); });
  await tc(`VOE-${T}-V04`, "Vendor portal", "Re-entered account number must match; paste is blocked", async (c) => {
    const box = F.field(page, "reenter_account_number").locator("input").first(); await box.fill("");
    await box.focus(); await page.evaluate(() => { const el = document.activeElement as HTMLInputElement; const dt = new DataTransfer(); dt.setData("text/plain", "000123456789"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
    await page.waitForTimeout(400); c.ok((await box.inputValue()) === "", `pasting into Re-enter account number leaves '${await box.inputValue()}'`);
    await tryBad(c, "reenter_account_number", "000123456780", /Account numbers do not match/, "re-entered '000123456780'", true);
  });
  await tc(`VOE-${T}-V05`, "Vendor portal", "IFSC in the wrong format", async (c) => { await tryBad(c, "ifsc", "HDFC123", /IFSC must look like HDFC0001234/, "IFSC 'HDFC123'", true); });
  await tc(`VOE-${T}-V06`, "Vendor portal", "Mobile number in the wrong format", async (c) => { await tryBad(c, "mobile", "98765", /Mobile must be 10 digits/, "mobile '98765'", true); });
  await tc(`VOE-${T}-V07`, "Vendor portal", "A well-formed PAN goes through the PAN check", async (c) => {
    await fillAll(good); await F.settle(page, ["pan"], 25000);
    c.record(`PAN 'ABCPE1234F' (well-formed, not a real PAN) → ${await F.status(page, "pan")} ${await F.reason(page, "pan")}`);
  });
  await tc(`VOE-${T}-V08`, "Vendor portal", "All answers valid: Submit goes through", async (c) => {
    await fillAll(good); c.note(`states before Submit: ${await states()}`);
    const s = await F.submit(page); c.ok(/submitted successfully/i.test(s.text), `Submit → '${s.text}'`);
    await page.waitForTimeout(3000); await c.shot("after");
  });
}

if (T === "T3") {
  const shown = async () => F.keysShown(page);
  await tc("VOE-T3-V02", "Vendor portal", "Starting state: hidden and optional fields as built", async (c) => {
    const k = await shown();
    c.ok(k.includes("gstin") && !k.includes("udyam_number") && !k.includes("state"), `shown: ${exp(k)} (Udyam hidden by default; State hidden while Country is empty)`);
    c.ok(await F.isRequired(page, "gstin") && !(await F.isRequired(page, "annual_turnover")) && !(await F.isRequired(page, "cin")), "GSTIN required; Annual turnover and CIN optional");
    await c.shot();
  });
  await tc("VOE-T3-V03", "Vendor portal", "Vendor type Foreign hides GSTIN and makes turnover required", async (c) => {
    await F.chooseRadio(page, "vendor_type", "Foreign"); const k = await shown();
    c.ok(!k.includes("gstin"), "GSTIN disappears"); c.ok(await F.isRequired(page, "annual_turnover"), "Annual turnover gets *");
    await c.shot();
  });
  await tc("VOE-T3-V04", "Vendor portal", "Vendor type MSME shows Udyam (required); Indian brings everything back", async (c) => {
    await F.chooseRadio(page, "vendor_type", "MSME"); let k = await shown();
    c.ok(k.includes("udyam_number") && (await F.isRequired(page, "udyam_number")), "Udyam number appears with *");
    c.ok(k.includes("gstin"), "GSTIN is back"); await c.shot("msme");
    await F.chooseRadio(page, "vendor_type", "Indian"); k = await shown();
    c.ok(!k.includes("udyam_number") && k.includes("gstin") && !(await F.isRequired(page, "annual_turnover")), "Indian: Udyam hidden again, GSTIN shown, turnover optional");
  });
  await tc("VOE-T3-V05", "Vendor portal", "'Company name contains Pvt' makes CIN required (case-sensitive)", async (c) => {
    await F.fillText(page, "company_name", "QA Steel Pvt Ltd"); c.ok(await F.isRequired(page, "cin"), "'QA Steel Pvt Ltd' → CIN*");
    await F.fillText(page, "company_name", "qa steel pvt ltd"); c.record(`'qa steel pvt ltd' → CIN ${(await F.isRequired(page, "cin")) ? "required" : "optional"} (same as the studio preview: plain, case-sensitive match)`);
    await F.fillText(page, "company_name", "QA Steel Pvt Ltd");
  });
  await tc("VOE-T3-V06", "Vendor portal", "Certification ISO 9001 makes the certificate required; Country shows State", async (c) => {
    await F.chooseOption(page, "certifications", ["ISO 14001"]); c.ok(!(await F.isRequired(page, "iso_certificate")), "ISO 14001 only → certificate optional");
    await F.chooseOption(page, "certifications", ["ISO 9001"]); c.ok(await F.isRequired(page, "iso_certificate"), "adding ISO 9001 → certificate*");
    await F.fillText(page, "country", "India"); c.ok((await shown()).includes("state"), "typing a Country shows State");
    await c.shot();
  });
  await tc("VOE-T3-V07", "Vendor portal", "A field made required by a rule blocks Submit; a hidden required field does not", async (c) => {
    await F.chooseRadio(page, "vendor_type", "MSME"); await F.fillText(page, "gstin", "27ABCPE1234F1Z5"); await F.typeInto(page, "annual_turnover", "5000000"); await F.fillText(page, "cin", "U12345MH2020PTC123456");
    await F.upload(page, "iso_certificate", "iso9001.pdf"); await F.fillText(page, "state", "Maharashtra");
    const s1 = await F.submit(page);
    c.ok(!/success|submitted/i.test(s1.text), `MSME with Udyam empty: Submit refused ('${s1.text}' ${s1.dialog ?? ""})`);
    await c.shot("refused");
    await F.chooseRadio(page, "vendor_type", "Foreign"); await page.waitForTimeout(800);
    c.ok(!(await shown()).includes("gstin"), "switch to Foreign: GSTIN (required in the template) is hidden");
    const s2 = await F.submit(page);
    c.ok(/success|submitted/i.test(s2.text) || /Submitted/.test(await page.locator("body").innerText()), `Foreign: Submit goes through without GSTIN → '${s2.text}' ${s2.dialog ?? ""}`);
    await page.waitForTimeout(3000); await c.shot("after");
  });
}

if (T === "T6" || T === "T7") {
  const shown = async () => F.keysShown(page);
  await tc(`VOE-${T}-V02`, "Vendor portal", "AND rule: SWIFT code appears only when Foreign AND turnover above 10 lakh", async (c) => {
    c.ok(!(await shown()).includes("swift_code"), "fresh form: SWIFT code hidden");
    await F.chooseRadio(page, "vendor_type", "Foreign"); c.ok(!(await shown()).includes("swift_code"), "Foreign only (turnover empty): SWIFT still hidden");
    await F.typeInto(page, "turnover", "500000"); c.ok(!(await shown()).includes("swift_code"), "Foreign + turnover 5,00,000: SWIFT still hidden");
    await F.typeInto(page, "turnover", "2500000"); c.ok((await shown()).includes("swift_code") && (await F.isRequired(page, "swift_code")), "Foreign + turnover 25,00,000: SWIFT appears with *");
    await c.shot("and-true");
    await F.typeInto(page, "turnover", "900000"); c.ok(!(await shown()).includes("swift_code"), "turnover back to 9,00,000: SWIFT hidden again");
  });
  await tc(`VOE-${T}-V03`, "Vendor portal", "Number rule: HR policy required only when employees are more than 100", async (c) => {
    await F.typeInto(page, "employees", "150"); c.ok(await F.isRequired(page, "hr_policy"), "150 employees → HR policy *");
    await F.typeInto(page, "employees", "99"); c.ok(!(await F.isRequired(page, "hr_policy")), "99 employees → HR policy optional (checks a number, not text order)");
    await F.typeInto(page, "employees", "20"); c.ok(!(await F.isRequired(page, "hr_policy")), "20 employees → HR policy optional");
    await c.shot();
  });
  await tc(`VOE-${T}-V04`, "Vendor portal", "'Is not empty' rule: typing a GSTIN makes the GST certificate required", async (c) => {
    const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
    c.ok(!(await F.isRequired(page, "gst_certificate")), "GSTIN empty: certificate optional");
    await F.fillText(page, "gstin", "27ABCPE1234F1Z5").catch(() => {});
    const crashed = /Something Broke Down/i.test(await page.locator("body").innerText());
    c.ok(!crashed, crashed ? `typing a GSTIN crashed the form: 'Oops! Something Broke Down…' (${errs.join(" | ")})` : "form still works after typing GSTIN");
    await c.shot();
    if (!crashed) c.ok(await F.isRequired(page, "gst_certificate"), "GSTIN filled: certificate *");
  });
}

if (T === "T4") {
  await tc("VOE-T4-V02", "Vendor portal", "Prefill on load fills answers from the vendor's Procol profile", async (c) => {
    const ln = await F.valueOf(page, "legal_name"), em = await F.valueOf(page, "company_email"), ad = await F.valueOf(page, "address");
    c.ok(!!ln, `Legal name prefilled: '${ln}' (company is '${pro.firm}' / home '${pro.firm} Home')`);
    c.ok(!!ad, `Registered address prefilled: '${ad}'`, "Record"); c.ok(!!em, `Company email prefilled: '${em}'`, "Record");
    await c.shot();
  });
  await tc("VOE-T4-V03", "Vendor portal", "Dropdowns load their options from the data sources", async (c) => {
    const cur = await F.optionsOf(page, "currency"); c.ok(cur.length > 0, `Billing currency: ${cur.length} options (${cur.slice(0, 5).join(", ")})`);
    const co = await F.optionsOf(page, "country"); c.ok(co.length > 0, `Country: ${co.length} options (${co.slice(0, 5).join(", ")})`, "Record");
    const rg = await F.optionsOf(page, "region"); c.ok(rg.length > 0, `Region: ${rg.length} options (${rg.slice(0, 5).join(", ")})`, "Record");
    await c.shot();
  });
  await tc("VOE-T4-V04", "Vendor portal", "Changing Country resets Region", async (c) => {
    const co = await F.optionsOf(page, "country"), rg = await F.optionsOf(page, "region");
    if (co.length < 2 || !rg.length) { c.record(`not enough options to test (Country ${co.length}, Region ${rg.length})`); return; }
    await F.chooseOption(page, "country", [co[0]]); await F.chooseOption(page, "region", [rg[0]]);
    const before = await F.selected(page, "region"); await F.chooseOption(page, "country", [co[1]]); const after = await F.selected(page, "region");
    c.ok(before.includes(rg[0]) && !after.includes(rg[0]), `Region '${before}' → after changing Country '${after}'`);
    await c.shot();
  });
  await tc("VOE-T4-V05", "Vendor portal", "Submit; the supplier code is written back to the vendor record", async (c) => {
    if (!(await F.valueOf(page, "legal_name"))) await F.fillText(page, "legal_name", pro.firm);
    const cur = await F.optionsOf(page, "currency"); if (cur.length) await F.chooseOption(page, "currency", [cur[0]]);
    await F.fillText(page, "supplier_code", `QAVOE-${setup.stamp}`);
    const s = await F.submit(page);
    c.ok(/success|submitted/i.test(s.text) || /Submitted/.test(await page.locator("body").innerText()), `Submit: '${s.text}' ${s.dialog ?? ""}`);
    await page.waitForTimeout(4000); await c.shot("after");
  });
}

if (T === "T5") {
  await tc("VOE-T5-V02", "Vendor portal", "Three sections in the side panel", async (c) => {
    const b = await page.locator("body").innerText(); c.ok(/3 Sections/.test(b) && /Section A/.test(b) && /Section B/.test(b) && /Section C/.test(b), "'3 Sections': Section A, B, C");
    c.ok(exp(await F.keysShown(page)) === "a_name, a_count, b_choice, b_date, c_notes, c_doc", `fields: ${exp(await F.keysShown(page))}`);
  });
  await tc("VOE-T5-V03", "Vendor portal", "Only Section A filled: Submit refused", async (c) => {
    await F.fillText(page, "a_name", "Alpha"); await F.typeInto(page, "a_count", "3");
    const s = await F.submit(page); c.ok(!/success|submitted/i.test(s.text), `Submit: '${s.text}' ${s.dialog ?? ""}`);
    c.note(`errors marked: ${(await F.errorsShown(page)).join(" | ") || "none"}`); await c.shot();
  });
  await tc("VOE-T5-V04", "Vendor portal", "Required attachment must be uploaded", async (c) => {
    await F.chooseOption(page, "b_choice", ["Yes"]); await F.pickToday(page, "b_date"); await F.fillText(page, "c_notes", "All documents attached");
    const s = await F.submit(page); c.ok(!/success|submitted/i.test(s.text), `everything except the required document: Submit '${s.text}' ${s.dialog ?? ""}`);
    await c.shot();
  });
  await tc("VOE-T5-V05", "Vendor portal", "All three sections complete: Submit", async (c) => {
    await F.upload(page, "c_doc", "registration.pdf");
    const s = await F.submit(page); c.ok(/success|submitted/i.test(s.text) || /Submitted/.test(await page.locator("body").innerText()), `Submit: '${s.text}' ${s.dialog ?? ""}`);
    await page.waitForTimeout(3000); await c.shot("after");
  });
}
await vctx.close();

// ── buyer: what arrived ──
const bctx2 = await browser.newContext({ storageState: ".auth/user.json", viewport: { width: 1600, height: 1000 } });
page = await bctx2.newPage();
await tc(`VOE-${T}-B02`, "Buyer (cpanel)", "The buyer sees the vendor's submitted answers", async (c) => {
  const req = await bcall("GET", `/companies/${pro.uuid}/onboarding_requests`);
  const list = req.j?.onboarding_requests ?? []; c.note(`onboarding requests for the vendor: ${JSON.stringify(list).slice(0, 300)}`);
  await page.goto(`https://cpanel.ag-ri.in/vendors/${pro.uuid}?tab=onboarding_details`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(8000);
  for (const b of ["Got it", "Not now"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1500 }).catch(() => {});
  const body = await page.locator("body").innerText();
  c.ok(/Onboarding/i.test(body), "vendor page opens on the onboarding details tab");
  c.note(`page says: ${body.replace(/\n+/g, " | ").slice(0, 900)}`);
  await c.shot();
});
await bctx2.close();
save();
await browser.close();
const { closePool } = await import("file:///Users/animesh/Desktop/procol/procol%20test/src/db/pool.ts"); await closePool().catch(() => {});
