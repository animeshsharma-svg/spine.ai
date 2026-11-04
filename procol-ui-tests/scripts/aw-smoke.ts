// First look: does the token open cpanel? What do the workflow list, the create page and the PO form look like?
import { openBrowser, settle, shot, WEB, uuidOf, DLF, sleep } from "./aw-lib";

const { browser, page, net } = await openBrowser();
const seen: string[] = [];
async function look(url: string, name: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, 3000);
  const title = await page.title();
  const h = (await page.locator("h1, h2, .ant-page-header-heading-title").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 6);
  const btns = (await page.getByRole("button").allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean).slice(0, 25);
  const f = await shot(page, name);
  seen.push(`${name}: ${page.url()} | title=${title} | heads=${h.join(" / ")} | buttons=${btns.join(", ")} | shot=${f}`);
  console.log(seen[seen.length - 1]);
}
await look(`${WEB}/approvals-workflows?approvalType=team`, "smoke-01-list");
await look(`${WEB}/approvals-workflows/create?approvalType=team`, "smoke-02-create");
await look(`${WEB}/orders/${uuidOf(DLF.eventGroupId)}`, "smoke-03-event");
await look(`${WEB}/projects/${uuidOf(DLF.eventGroupId)}`, "smoke-04-project");
// the PO form of the draft proposal
await look(`${WEB}/custom-po/${uuidOf(DLF.draftProposalId)}`, "smoke-05-po-guess");
console.log("--- api calls seen ---");
for (const n of net.slice(-40)) console.log(n.method, n.status, n.url.slice(0, 120));
await sleep(500);
await browser.close();
