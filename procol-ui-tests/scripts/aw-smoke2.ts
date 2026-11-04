// Second look: the PO form of the draft proposal, the event page, the awarding page, the edit page of a workflow.
import { openBrowser, settle, shot, WEB, uuidOf, DLF, sleep, api } from "./aw-lib";

const { browser, page, net } = await openBrowser();
async function look(url: string, name: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, 3500);
  const btns = (await page.getByRole("button").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 30);
  const f = await shot(page, name);
  console.log(`${name}: ${page.url()} | buttons=${btns.join(", ")} | shot=${f}`);
}
await look(`${WEB}/po-form/${uuidOf(DLF.draftProposalId)}`, "smoke-06-po-form");
// General Details section as the DOM shows it
const gd = page.locator("section", { hasText: "General Details" }).first();
if (await gd.count()) {
  const rows = await gd.locator("div[class*=row]").allInnerTexts().catch(() => []);
  console.log("GD rows:", rows.map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12));
  const selects = gd.locator(".ant-select");
  console.log("selects:", await selects.count());
  for (let i = 0; i < (await selects.count()); i++) {
    const s = selects.nth(i);
    console.log(i, "disabled=", await s.evaluate((e) => e.classList.contains("ant-select-disabled")), "text=", (await s.innerText()).replace(/\s+/g, " ").trim());
  }
}
// open the Submit Proposal modal (NOT submitting) and photograph the workflow list
const submit = page.getByRole("button", { name: /Submit Proposal/ });
if (await submit.count()) {
  await submit.first().click();
  await sleep(3500);
  const modal = page.locator(".ant-modal").last();
  console.log("modal text:", (await modal.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 900));
  console.log("modal buttons:", await modal.getByRole("button").allInnerTexts().catch(() => []));
  await shot(page, "smoke-07-submit-modal");
  const cancel = modal.getByRole("button", { name: /Cancel|Close/ });
  if (await cancel.count()) await cancel.first().click().catch(() => {}); else await page.keyboard.press("Escape");
  await sleep(800);
}
await look(`${WEB}/project/${uuidOf(DLF.eventGroupId)}/${uuidOf(131623)}`, "smoke-08-event");
await look(`${WEB}/awarding/${uuidOf(DLF.eventGroupId)}`, "smoke-09-awarding");
const flows = (await api("GET", "/approval_workflow/approval_flows?page=1&initiator_type=team")).json;
const hello = (flows.approval_flows || []).find((f: any) => f.name === "hello");
console.log("hello flow:", hello ? JSON.stringify({ uuid: hello.uuid, conditions: hello.conditions, steps: (hello.steps || []).length }).slice(0, 700) : "not in page 1");
if (hello) await look(`${WEB}/approvals-workflows/edit/${hello.uuid}?approvalType=team`, "smoke-10-edit");
console.log("--- api calls seen ---");
for (const n of net.filter((x) => /proposal|approval_flows|awarding|po_form|sheets/.test(x.url)).slice(-40)) console.log(n.method, n.status, n.url.slice(0, 140), n.body ? "body=" + n.body.slice(0, 200) : "");
await browser.close();
