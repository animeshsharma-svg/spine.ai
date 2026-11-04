// Buyer side on cpanel for one QA prospect: look | evaluate | approve-open | reject.
//   npx tsx scripts/vo-buyer-actions.ts T1 look
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const OUT = "/Users/animesh/Desktop/procol/prototype/data/evidence/vo-e2e";
const setup = JSON.parse(readFileSync(`${OUT}/setup.json`, "utf8"));
const [K, mode = "look"] = process.argv.slice(2); const pro = setup.prospects[K];
const browser = await chromium.launch(); const ctx = await browser.newContext({ storageState: ".auth/user.json", viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
const net: string[] = []; page.on("response", (r) => { const u = r.url(); if (/sec-api.*\/api\//.test(u) && (r.request().method() !== "GET" || /validate_custom|approval_flows|get_approvals|resolution/.test(u))) net.push(`${r.request().method()} ${r.status()} ${u.replace(/^.*\/api/, "").slice(0, 120)}`); });
page.on("response", async (r) => { const u = r.url(); if (/validate_custom|create_page_responses|create_custom_buyer_form/.test(u)) { const b = await r.text().catch(() => ""); console.log(`  NET ${r.request().method()} ${r.status()} ${u.replace(/^.*\/api/, "")}\n     sent: ${(r.request().postData() ?? "").slice(0, 600)}\n     got: ${b.slice(0, 600)}`); } });
const txt = async (sel = "body") => (await page.locator(sel).last().innerText().catch(() => "")).replace(/\n+/g, " | ");
let n = 0; const shot = async (t: string) => page.screenshot({ path: `${OUT}/shots/buyer-${K}-${mode}-${++n}-${t}.png`, fullPage: false });
await page.goto(`https://cpanel.ag-ri.in/vendors/${pro.uuid}?tab=onboarding_details`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(9000);
for (const b of ["Got it", "Not now"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1500 }).catch(() => {});
console.log("PAGE:", (await txt()).slice(0, 1600)); await shot("page");
const btns = (await page.getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean); console.log("BUTTONS:", [...new Set(btns)].join(" / "));
if (mode === "evaluate") {
  await page.getByRole("button", { name: /Start Evaluation/ }).first().click(); await page.waitForTimeout(3000);
  console.log("AFTER START EVALUATION:", (await txt()).slice(0, 1500)); await shot("evaluation");
}
if (mode === "approve-open" || mode === "approve") {
  await page.getByRole("button", { name: /Send For Approval/ }).first().click(); await page.waitForTimeout(5000);
  const d = ".ant-drawer-content:visible"; console.log("DRAWER:", (await txt(d)).slice(0, 2500)); await shot("drawer");
  console.log("DRAWER BUTTONS:", (await page.locator(d).last().getByRole("button").allInnerTexts()).map((s) => s.trim()).join(" / "));
  if (mode === "approve") {
    const dr = page.locator(d).last();
    await dr.getByRole("button", { name: /^Next$/ }).click(); await page.waitForTimeout(3000);
    console.log("NEXT WITH EMPTY REQUIRED:", (await txt(".ant-message, .ant-notification")) || "(no message)", "| still on form:", /Buyer Added Attributes/.test(await txt(d)));
    await shot("empty-next");
    const vals: Record<string, string> = { "Vendor Code": `QAVOE${setup.stamp}${K}`, "Reconciliation GL Account": "400100" };
    const rowOf = (l: string) => dr.locator(".rdg-row").filter({ has: page.locator(".rdg-cell", { hasText: new RegExp(`^${l}$`) }) }).first();
    const valueCell = (l: string) => rowOf(l).locator(".rdg-cell").nth(1);
    async function pickFirst(l: string) {
      await valueCell(l).locator(".ant-select-selection").click({ force: true }); await page.waitForTimeout(2500);
      const opts = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li:not(.ant-select-dropdown-menu-item-disabled)");
      const names = (await opts.allInnerTexts()).map((x) => x.trim()).filter(Boolean);
      if (names.length) { const want = names.find((x) => /^INR/.test(x)) ?? names[0]; const typed = want.split("-")[0];
        await page.keyboard.type(typed); await page.waitForTimeout(1500); await page.keyboard.press("Enter"); await page.waitForTimeout(1500);
        await dr.locator("text=Buyer Added Attributes").first().click({ force: true }).catch(() => {}); }
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(800); console.log(`  ${l}: dropdown (${names.length} options: ${names.slice(0, 4).join(", ")}) → '${(await valueCell(l).innerText()).trim()}'`);
    }
    async function typeText(l: string, v: string) {
      await valueCell(l).click({ force: true }); await page.waitForTimeout(1200);
      const ed = page.locator(".ant-popover:not(.ant-popover-hidden) textarea, .ant-popover:not(.ant-popover-hidden) input, .cellEditor textarea, .cellEditor input").last();
      console.log(`  ${l}: editor found ${await ed.count()}`);
      if (await ed.count()) { await ed.fill(v); await page.waitForTimeout(400); await ed.press("Enter").catch(() => {}); } else { await page.keyboard.type(v); await page.keyboard.press("Enter"); }
      await page.waitForTimeout(800); await dr.locator(".ant-drawer-title, text=Buyer Added Attributes").first().click({ force: true }).catch(() => {}); await page.waitForTimeout(800);
      console.log(`  ${l}: text → '${(await valueCell(l).innerText()).trim()}'`);
    }
    async function today(l: string) {
      await valueCell(l).locator("input").first().click({ force: true }).catch(async () => valueCell(l).click({ force: true })); await page.waitForTimeout(1000);
      await page.locator(".ant-calendar-today-btn:visible, .ant-calendar-today .ant-calendar-date").first().click({ force: true }).catch(() => {}); await page.waitForTimeout(800);
      console.log(`  ${l}: date → '${(await valueCell(l).innerText()).trim() || await valueCell(l).locator("input").first().inputValue().catch(() => "")}'`);
    }
    for (const step of [() => pickFirst("Billing Currency"), () => typeText("Vendor Code", `QAVOE${setup.stamp}${K}`), () => today("Creation Date"), () => pickFirst("Group"), () => typeText("Reconciliation GL Account", "400100")])
      await step().catch((e) => console.log("  could not fill:", (e as Error).message.split("\n")[0]));
    await shot("filled");
    await dr.locator("text=Buyer Added Attributes").first().click({ force: true }).catch(() => {}); await page.waitForTimeout(1500);
    for (let i = 0; i < 2; i++) { const before = await txt(d); await dr.getByRole("button", { name: /^Next$/ }).click(); await page.waitForTimeout(7000); if ((await txt(d)) !== before) break; console.log("  Next did not move; retry"); }
    console.log("MSG:", await txt(".ant-message, .ant-notification")); console.log("STEP 2:", (await txt(d)).slice(0, 2000)); await shot("step2");
    console.log("STEP 2 BUTTONS:", (await page.locator(d).last().getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(" / "));
    for (let step = 3; step <= 6; step++) {
      const bt = (await dr.getByRole("button").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
      const send = bt.find((b) => /^(Send For Approval|Send|Submit|Send for approval|Approve)$/i.test(b));
      if (send) {
        console.log(`  final button '${send}'`);
        const remark = dr.locator("textarea").last(); if (await remark.count()) await remark.fill(`QA_Platform approval test ${setup.stamp}`).catch(() => {});
        if (!process.argv.includes("--go")) break;
        await dr.getByRole("button", { name: send }).last().click(); await page.waitForTimeout(6000);
        console.log("AFTER SEND:", await txt(".ant-message, .ant-notification"), "| drawer open:", await page.locator(d).count()); await shot("sent");
        await page.reload(); await page.waitForTimeout(9000); console.log("PAGE AFTER:", (await txt()).slice(0, 1200)); await shot("after");
        break;
      }
      const nx = bt.find((b) => /^(Next|Continue)$/.test(b)); if (!nx) break;
      // approval flow steps: pick an approver in every empty select
      const sels = dr.locator(".ant-select-selection"); for (let i = 0; i < await sels.count(); i++) { const t = (await sels.nth(i).innerText()).trim(); if (/Select|approver/i.test(t)) { await sels.nth(i).click({ force: true }).catch(() => {}); await page.waitForTimeout(1500); const all = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li"); console.log("  approver choices:", (await all.allInnerTexts()).map((x) => x.trim()).join(" / ").slice(0, 600)); const o = all.filter({ hasText: /Procol Support/ }).first(); if (!(await o.count())) { console.log("  'Procol Support' is not offered as approver — stopping"); await browser.close(); process.exit(0); } if (await o.count()) { console.log(`  pick '${(await o.innerText()).trim()}' for '${t}'`); await o.click({ force: true }).catch(() => {}); } await page.waitForTimeout(800); } }
      const radios = dr.locator(".ant-radio-wrapper"); if (await radios.count() && !(await dr.locator(".ant-radio-wrapper-checked").count())) await radios.first().click();
      if (nx === "Continue" && !process.argv.includes("--go")) { console.log("  stop: 'Continue' sends the request (needs --go)"); break; }
      console.log(`  before ${nx}:`, (await txt(d)).slice(0, 600)); await shot(`before-${step}`);
      await dr.getByRole("button", { name: new RegExp(`^${nx}$`) }).click(); await page.waitForTimeout(6000);
      console.log(`MSG: ${await txt(".ant-message, .ant-notification")}`); console.log(`STEP ${step}:`, (await txt(d)).slice(0, 1500)); await shot(`step${step}`);
    }
  }
}
if (mode === "approvals") {
  const card = page.getByText("Request to Accept Vendor").first(); await card.click().catch(() => {}); await page.waitForTimeout(3000);
  console.log("APPROVAL VIEW:", (await txt(".ant-drawer-content:visible, .ant-modal-content:visible")).slice(0, 1500)); await shot("approval");
  console.log("ALL BUTTONS:", [...new Set((await page.getByRole("button").allInnerTexts()).map((x) => x.trim()).filter(Boolean))].join(" / "));
  await page.mouse.click(1568, 337); await page.waitForTimeout(1500);
  const items = (await page.locator(".ant-dropdown:not(.ant-dropdown-hidden) li, .ant-popover:not(.ant-popover-hidden) li, .ant-popover:not(.ant-popover-hidden) button").allInnerTexts()).map((x) => x.trim()).filter(Boolean);
  console.log("CARD MENU:", items.join(" / ") || "none"); await shot("menu");
  const want = process.argv.find((a) => a.startsWith("--choose="))?.slice(9);
  if (want) { await page.locator(".ant-dropdown:not(.ant-dropdown-hidden) li, .ant-popover:not(.ant-popover-hidden) li").filter({ hasText: want }).first().click(); await page.waitForTimeout(2500);
    console.log("CONFIRM:", (await txt(".ant-modal-content:visible, .ant-popover:not(.ant-popover-hidden)")).slice(0, 600)); await shot("confirm");
    const panel = page.locator(".ant-modal-content:visible, .ant-drawer-content:visible").last();
    const sel = panel.locator(".ant-select-selection").first(); if (await sel.count()) { await sel.click(); await page.waitForTimeout(2000); console.log("APPROVER CHOICES:", (await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").allInnerTexts()).map((x) => x.trim()).slice(0, 40).join(" / ")); await page.keyboard.press("Escape"); }
    if (!process.argv.includes("--go")) { console.log("PANEL BUTTONS:", (await panel.getByRole("button").allInnerTexts()).map((x) => x.trim()).filter(Boolean).join(" / ")); await browser.close(); process.exit(0); }
    const box = page.locator(".ant-modal-content:visible textarea").first(); if (await box.count()) await box.fill("QA_Platform test request sent by mistake — withdrawn");
    const ok = page.locator(".ant-modal-content:visible, .ant-popover:not(.ant-popover-hidden)").getByRole("button", { name: /^(Yes|OK|Confirm|Withdraw|Submit|Cancel Request)$/i }).last();
    if (await ok.count()) { console.log("clicking", await ok.innerText()); await ok.click(); await page.waitForTimeout(5000); console.log("TOAST:", await txt(".ant-message, .ant-notification")); }
    await page.reload(); await page.waitForTimeout(9000); console.log("AFTER:", (await txt()).slice(0, 900)); await shot("after-withdraw"); }
}
if (mode === "reject") {
  await page.getByRole("button", { name: /^Reject$/ }).first().click(); await page.waitForTimeout(4000);
  const d = ".ant-drawer-content:visible, .ant-modal-content:visible"; console.log("REJECT PANEL:", (await txt(d)).slice(0, 1500)); await shot("panel");
  const box = page.locator(`${d}`).last().locator("textarea, input[type=text]").first();
  if (await box.count()) await box.fill(`QA_Platform test rejection ${setup.stamp}`);
  const btn = page.locator(d).last().getByRole("button", { name: /^(Reject|Reject Onboarding|Submit|Confirm)$/ }).last();
  console.log("reject button:", await btn.innerText().catch(() => "none"), "enabled:", await btn.isEnabled().catch(() => false));
  if (process.argv.includes("--go")) { await btn.click(); await page.waitForTimeout(6000); console.log("TOAST:", await txt(".ant-message, .ant-notification")); await page.reload(); await page.waitForTimeout(9000); console.log("AFTER:", (await txt()).slice(0, 900)); await shot("after"); }
}
console.log("WRITES:", net.join(" || ") || "none");
await browser.close();
