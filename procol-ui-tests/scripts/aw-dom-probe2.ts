// Probe 2: the Step popover's approver search, and the drawer's empty-save validation.
import { openBrowser, settle, shot, sleep, WEB } from "./aw-lib";
const { browser, page, net } = await openBrowser();
const go = (u: string) => page.goto(u, { waitUntil: "domcontentloaded", timeout: 120_000 });
await go(`${WEB}/approvals-workflows/create?approvalType=team`); await settle(page, 3000);
await page.getByText("Add Trigger Settings").first().click(); await sleep(1500);
let drawer = page.locator(".ant-drawer:visible").last();
// empty save
await drawer.getByRole("button", { name: "Save" }).click(); await sleep(1200);
await shot(page, "probe2-drawer-empty-save");
console.log("drawer open?", await drawer.count(), "text:", (await drawer.innerText().catch(() => "closed")).replace(/\s+/g, " ").slice(0, 400));
console.log("explains:", await page.locator(".ant-form-explain, .ant-form-extra, [class*=explain], .has-error").allInnerTexts().catch(() => []));
async function pick(sel: any, txt: RegExp) { await sel.click({ force: true }); await sleep(600); const dd = page.locator(".ant-select-dropdown:visible").last(); await dd.locator(".ant-select-dropdown-menu-item", { hasText: txt }).first().click(); await sleep(500); await page.keyboard.press("Escape"); await sleep(200); }
await pick(drawer.locator(".ant-select").first(), /^Bid Proposal$/);
await pick(drawer.locator(".ant-form-item", { hasText: "Team" }).locator(".ant-select").first(), /^All Categories$/); await sleep(600);
await pick(drawer.locator(".ant-form-item", { hasText: /Initiator/ }).locator(".ant-select").first(), /^Member$/);
await drawer.getByRole("button", { name: "Save" }).click(); await sleep(2500);
const ths = (await page.locator("#approvalTable th").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
const stepIdx = ths.findIndex((t) => /^Step 1/.test(t));
const row = page.locator("#approvalTable tbody tr").first();
await row.locator("td").nth(stepIdx).click(); await sleep(1200);
const pop = page.locator(".ant-popover:visible").last();
console.log("popover html head:", (await pop.evaluate((e) => e.outerHTML)).slice(0, 1200));
const appr = pop.locator(".ant-form-item", { hasText: /Approvers/ });
const input = appr.locator("input").first();
console.log("approver inputs:", await appr.locator("input").count(), "select:", await appr.locator(".ant-select").count());
await appr.locator(".ant-select, input").first().click({ force: true }); await sleep(500);
const t0 = Date.now();
await page.keyboard.type("Suman", { delay: 80 }); await sleep(3500);
console.log("approver api calls:", net.filter((n) => n.at >= t0).map((n) => `${n.method} ${n.status} ${n.url.slice(0, 120)} reply=${(n.reply || "").slice(0, 200)}`));
const dds = page.locator(".ant-select-dropdown:visible");
console.log("visible dropdowns:", await dds.count());
for (let i = 0; i < (await dds.count()); i++) console.log(i, (await dds.nth(i).innerText()).replace(/\s+/g, " ").slice(0, 300));
console.log("any list items:", (await page.locator("li[role=option], .ant-select-dropdown-menu-item, [class*=option]").allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 10));
await shot(page, "probe2-approver-search");
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await sleep(800);
console.log("popover text after enter:", (await pop.innerText()).replace(/\s+/g, " ").slice(0, 400));
await shot(page, "probe2-approver-picked");
await browser.close();
