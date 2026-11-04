// Probe the create page DOM after saving the drawer: table structure, row/cell selectors, popovers.
import { openBrowser, settle, shot, sleep, WEB } from "./aw-lib";
const { browser, page, net } = await openBrowser();
await page.goto(`${WEB}/approvals-workflows/create?approvalType=team`, { waitUntil: "domcontentloaded", timeout: 120_000 }); await settle(page, 3000);
await page.getByText("Add Trigger Settings").first().click(); await sleep(1500);
const drawer = page.locator(".ant-drawer:visible").last();
async function pick(sel: any, txt: RegExp) { await sel.click({ force: true }); await sleep(600); const dd = page.locator(".ant-select-dropdown:visible").last(); await dd.locator(".ant-select-dropdown-menu-item", { hasText: txt }).first().click(); await sleep(500); await page.keyboard.press("Escape"); await sleep(200); }
await pick(drawer.locator(".ant-select").first(), /^Bid Proposal$/);
const condSel = drawer.locator(".ant-select").nth(1);
await pick(condSel, /^Unit Name - DLF PO/); await pick(condSel, /^Department - DLF PO/);
console.log("drawer chips:", (await drawer.locator("[class*=chip], [class*=tag], .ant-tag, [class*=selected]").allInnerTexts()).map((t) => t.trim()).filter(Boolean));
console.log("drawer text:", (await drawer.innerText()).replace(/\s+/g, " ").slice(0, 600));
await pick(drawer.locator(".ant-form-item", { hasText: "Team" }).locator(".ant-select").first(), /^All Categories$/);
await sleep(800);
await pick(drawer.locator(".ant-form-item", { hasText: /Initiator/ }).locator(".ant-select").first(), /^Member$/);
await drawer.getByRole("button", { name: "Save" }).click(); await sleep(2500);
await shot(page, "probe-table");
const html = await page.locator("#approvalTable").evaluate((e) => e.outerHTML).catch(() => "no #approvalTable");
console.log("table html head:", html.slice(0, 1500));
const rows = page.locator("#approvalTable .ant-table-row, #approvalTable tbody tr, .ant-table-row");
console.log("rows:", await rows.count());
const cells = rows.first().locator("td");
console.log("cells:", await cells.count(), (await cells.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()));
// click the Name cell
await cells.nth(1).click(); await sleep(900);
let pop = page.locator(".ant-popover:visible").last();
console.log("name popover:", (await pop.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 300), "inputs:", await pop.locator("input,textarea").count());
await shot(page, "probe-name-popover");
await page.keyboard.press("Escape"); await sleep(400);
// publish empty
const t0 = Date.now();
await page.getByRole("button", { name: /Publish Workflow/ }).click(); await sleep(2500);
console.log("after publish url:", page.url());
console.log("errors:", (await page.locator("p").allInnerTexts()).map((t) => t.trim()).filter((t) => /required|valid/.test(t)));
console.log("api:", net.filter((n) => n.at >= t0 && /approval_flows/.test(n.url)).map((n) => `${n.method} ${n.status} ${n.url} body=${(n.body || "").slice(0, 200)} reply=${(n.reply || "").slice(0, 120)}`));
await shot(page, "probe-publish-empty");
await browser.close();
