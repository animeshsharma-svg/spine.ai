// Vendor-portal onboarding form helpers (quotes.ag-ri.in → Events → onboarding event → Submission Sheet).
// Every question is div[class*=formQuestionWrapper] with id "<response id>#<field key>".
import type { Page } from "@playwright/test";

export async function openOnboardingForm(page: Page) {
  await page.goto("https://quotes.ag-ri.in/events", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(5000);
  for (const b of ["Got it", "Not now"]) await page.getByRole("button", { name: b }).first().click({ timeout: 1200 }).catch(() => {});
  await page.getByText(/Vendor Onboarding/).first().click(); await page.waitForTimeout(5000);
  await page.getByRole("tab").filter({ hasNotText: /overview/i }).first().click(); await page.waitForTimeout(5000);
  await page.getByText("Submission Sheet").first().waitFor({ timeout: 30000 });
  await page.locator("[class*=formQuestionWrapper]").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(7000); // the saved draft is restored a few seconds after the form appears
}
export async function resetDraft(page: Page) {
  const r = page.getByText(/^Reset$/).first(); if (await r.isVisible().catch(() => false)) { await r.click(); await page.waitForTimeout(1500); const ok = page.locator(".ant-modal-content:visible, .ant-popover:not(.ant-popover-hidden)").getByRole("button", { name: /^(Yes|OK|Reset|Confirm)$/ }).last(); if (await ok.count()) await ok.click(); await page.waitForTimeout(4000); return true; } return false;
}
export async function status(page: Page, key: string): Promise<"passed" | "failed" | "running" | "none"> {
  return page.evaluate((k) => { const f = document.querySelector(`[class*=formQuestionWrapper][id$="#${k}"]`); if (!f) return "none"; const h = f.innerHTML;
    if (/anticon-close-circle|exclamation-circle/.test(h)) return "failed"; if (/anticon-check-circle/.test(h)) return "passed"; if (/spin|loading/.test(h)) return "running"; return "none"; }, key) as any;
}
export async function reason(page: Page, key: string): Promise<string> {
  const ic = field(page, key).locator("[class*=formHeader] .anticon, .anticon-close-circle").first(); if (!(await ic.count())) return "";
  await ic.hover().catch(() => {}); await page.waitForTimeout(900);
  const t = (await page.locator(".ant-tooltip:not(.ant-tooltip-hidden) .ant-tooltip-inner, .ant-popover:not(.ant-popover-hidden) .ant-popover-inner").allInnerTexts().catch(() => [])).join(" | ");
  await page.mouse.move(2, 2); await page.waitForTimeout(300); return t.trim();
}
export async function settle(page: Page, keys: string[], ms = 15000) {
  const end = Date.now() + ms; while (Date.now() < end) { const st = await Promise.all(keys.map((k) => status(page, k))); if (!st.includes("running")) return; await page.waitForTimeout(500); }
}
export const field = (page: Page, key: string) => page.locator(`[class*=formQuestionWrapper][id$="#${key}"]`).first();
export async function keysShown(page: Page): Promise<string[]> {
  return page.locator("[class*=formQuestionWrapper]").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id.split("#").pop() || ""));
}
export async function label(page: Page, key: string) { return (await field(page, key).locator("[class*=formHeader]").first().innerText()).split("\n")[0].replace(/\*$/, "").trim(); }
export async function helper(page: Page, key: string) { return (await field(page, key).locator("[class*=formDescription]").first().innerText().catch(() => "")).trim(); }
export async function isRequired(page: Page, key: string) { return (await field(page, key).locator("[class*=formHeader] [class*=isRequired]").count()) > 0; }
export async function controlKind(page: Page, key: string) {
  const f = field(page, key);
  if (await f.locator(".ant-calendar-picker").count()) return "date";
  if (await f.locator(".ant-radio-group, .ant-radio-wrapper").count()) return "radio";
  if (await f.locator(".ant-select-selection--multiple").count()) return "multi-select";
  if (await f.locator(".ant-select-selection--single").count()) return "dropdown";
  if (await f.locator("input[type=file], .ant-upload, [class*=uploadTag], [class*=attachmentMainWrapper]").count()) return "attachment";
  if (await f.locator("textarea").count()) return "long text";
  if (await f.locator("input[type=number]").count()) return "number";
  if (await f.locator("input").count()) return "text";
  return "unknown";
}
export async function isEditable(page: Page, key: string) { return field(page, key).locator("input, textarea").first().isEditable().catch(() => false); }
export async function fillText(page: Page, key: string, v: string) {
  const box = field(page, key).locator("textarea, input:not([type=file])").first();
  for (let i = 0; i < 3; i++) { await box.fill(v); await box.press("Tab").catch(() => {}); await page.waitForTimeout(1200); if ((await box.inputValue().catch(() => v)) === v) return; }
}
export async function valueOf(page: Page, key: string) { return field(page, key).locator("textarea, input:not([type=file])").first().inputValue().catch(() => ""); }
export async function chooseRadio(page: Page, key: string, v: string) { await field(page, key).locator(".ant-radio-wrapper").filter({ hasText: v }).first().click(); await page.waitForTimeout(700); }
async function closeDropdown(page: Page) { await page.keyboard.press("Escape").catch(() => {}); await page.locator("text=Submission Sheet").first().click({ force: true }).catch(() => {}); await page.waitForTimeout(400); }
export async function optionsOf(page: Page, key: string): Promise<string[]> {
  await field(page, key).locator(".ant-select-selection").first().click(); await page.waitForTimeout(2500);
  const o = (await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  await closeDropdown(page); return o;
}
export async function chooseOption(page: Page, key: string, values: string[]) {
  await field(page, key).locator(".ant-select-selection").first().click(); await page.waitForTimeout(1500);
  for (const v of values) await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").filter({ hasText: v }).first().click();
  await closeDropdown(page);
}
export async function selected(page: Page, key: string) { return (await field(page, key).locator(".ant-select-selection").first().innerText()).replace(/\n+/g, ", ").trim(); }
export async function pickToday(page: Page, key: string) {
  await field(page, key).locator(".ant-calendar-picker input").first().click(); await page.waitForTimeout(600);
  await page.locator(".ant-calendar-today-btn").first().click().catch(async () => { await page.locator(".ant-calendar-today .ant-calendar-date").first().click(); });
  await page.waitForTimeout(500);
}
export async function upload(page: Page, key: string, name = "certificate.pdf", body = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"): Promise<string> {
  await field(page, key).getByText(/Upload/).first().click(); await page.waitForTimeout(1500);
  const modal = page.locator(".ant-modal-content:visible").last();
  await modal.locator("input[type=file]").first().setInputFiles({ name, mimeType: name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(body) });
  await page.waitForTimeout(4000);
  const said = await toasts(page, 2500);
  const inModal = (await modal.innerText().catch(() => "")).replace(/\n+/g, " | ");
  const save = modal.getByRole("button", { name: /^Save$/ }).last();
  if (await save.isEnabled().catch(() => false)) await save.click(); else await modal.getByRole("button", { name: /^Cancel$/ }).last().click().catch(() => {});
  await page.waitForTimeout(2500);
  return `${said}${said ? " · " : ""}modal: ${inModal.slice(0, 200)}`;
}
export async function fieldText(page: Page, key: string) { return (await field(page, key).innerText().catch(() => "")).replace(/\n+/g, " | "); }
export async function toasts(page: Page, ms = 6000): Promise<string> {
  const end = Date.now() + ms; let seen: string[] = [];
  while (Date.now() < end) { seen = (await page.locator(".ant-message-notice, .ant-notification-notice-message, .ant-notification-notice-description").allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean); if (seen.length) break; await page.waitForTimeout(250); }
  return [...new Set(seen)].filter((t) => !/miss out on updates|Enable browser notifications/.test(t)).join(" | ");
}
export async function typeInto(page: Page, key: string, v: string) { const box = field(page, key).locator("input, textarea").first(); await box.click(); await box.press("ControlOrMeta+a").catch(() => {}); await box.press("Backspace").catch(() => {}); await page.keyboard.type(v); await box.press("Tab").catch(() => {}); await page.waitForTimeout(300); }
export async function errorsShown(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll("[class*=formQuestionWrapper] [class*=rror], [class*=formQuestionWrapper] .ant-form-explain, [class*=formQuestionWrapper] [style*='color: red'], [class*=formQuestionWrapper] [class*=danger]"))
    .map((e) => `${(e.closest("[class*=formQuestionWrapper]") as HTMLElement).id.split("#").pop()}: ${(e.textContent || "").trim()}`).filter((t) => !/: $/.test(t))).then((a) => [...new Set(a)]);
}
export async function submitState(page: Page) { return page.getByRole("button", { name: /^Submit$/ }).last().isEnabled().catch(() => false); }
export async function submit(page: Page): Promise<{ enabled: boolean; text: string; dialog?: string }> {
  const b = page.getByRole("button", { name: /^Submit$/ }).last();
  const enabled = await b.isEnabled().catch(() => false);
  if (!enabled) return { enabled, text: "" };
  await b.click(); await page.waitForTimeout(1500);
  const dlg = page.locator(".ant-modal-content:visible, .ant-modal-confirm:visible").last();
  if (await dlg.isVisible().catch(() => false)) {
    const t = (await dlg.innerText()).replace(/\n+/g, " ");
    const ok = dlg.getByRole("button", { name: /^(Submit|Yes|Confirm|OK|Proceed|Submit Response)$/i }).last();
    if (await ok.count()) await ok.click();
    return { enabled, dialog: t, text: await toasts(page, 9000) };
  }
  return { enabled, text: await toasts(page, 9000) };
}
