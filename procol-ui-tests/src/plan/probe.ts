/**
 * "WHAT HAPPENS IF I CLICK THIS?" — click every control a screen offers, one at a time, each time on a freshly
 * reloaded screen, and record what the app did: a dialog (its title, fields and buttons), a menu (its items), a new
 * page, a message, a request it sent, an error, or nothing. A greyed-out control is hovered for its tooltip
 * instead. The confirm button inside a dialog is NEVER pressed — the probe records the question the app asks,
 * not the answer. Controls that change the event (Publish, Submit, Save …) are clicked last, so the rest are
 * probed on the screen as it was.
 *
 * Writes evidence/<run>/probe-<step>.json and a screenshot per click; the prototype turns each record into a test
 * case (and a question for the tester when what happened looks wrong).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { appMessagesSince, toastMark } from "./generic/messages.js";
import { screenReady } from "./generic/ready.js";
import { BasePage } from "../pages/BasePage.js";

export interface ProbeRecord {
  n: number;
  role: string;
  name: string;
  disabled: boolean;
  tooltip?: string;
  outcome: "dialog" | "menu" | "navigated" | "message" | "request" | "error" | "nothing" | "disabled" | "not found" | "skipped" | "probe failed";
  dialog?: { title: string; buttons: string[]; fields: string[]; text: string };
  menu?: string[];
  url?: string;
  messages?: Array<{ kind: string; text: string }>;
  requests?: Array<{ method: string; path: string; status: number }>;
  newText?: string[];
  changedEvent?: boolean;
  screenshot?: string;
  note?: string;
}

// never clicked: leaves the app, signs out, or reaches outside the event under test
const NEVER = /^(log ?out|sign ?out|logout|help|support|notifications?|switch (company|account)|profile|my account|chat)$|\bclara\b/i;
// clicked last: these usually change the event (still never their dialog's confirm)
const CHANGES = /\b(publish|submit|save|send|award|withdraw|delete|remove|reject|revoke|revert|close|extend|reschedule|convert|create|approve|accept|decline|invite|add|start|end|confirm|copy|duplicate|cancel event|recreate)\b/i;

const clean = (t: string) => t.replace(/\s+/g, " ").trim();

/** Every control on screen worth clicking: buttons, tabs, menu items, links in the page body — not the app's side menu. */
type Control = { role: string; name: string; nth: number; tag: string };
async function controls(page: Page, include?: string[], skip?: string[]): Promise<Control[]> {
  const raw = (await page
    .evaluate(() => {
      const out: Array<{ role: string; name: string; tag: string }> = [];
      const tally: Record<string, number> = {};
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const st = getComputedStyle(el as HTMLElement);
        return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none";
      };
      // the app's own top bar (logo, Ask Clara, bells, profile) and side menu are not the screen under test
      let appBar: Element | null = Array.from(document.querySelectorAll("button, a, [role='button']")).find((e) => /ask clara/i.test((e as HTMLElement).innerText || "")) ?? null;
      while (appBar && appBar.parentElement && (appBar.parentElement as HTMLElement).getBoundingClientRect().height < 130) appBar = appBar.parentElement;
      const inChrome = (el: Element) => !!el.closest("nav, aside, .ant-layout-sider, [class*='sidebar'], [class*='Sidebar'], [class*='userMenu']") || !!(appBar && appBar.contains(el));
      // an icon-only button is named by its icon ("⋮ (more)") so a tester can find it
      const ICONS: Record<string, string> = { more: "⋮ (more)", ellipsis: "⋮ (more)", setting: "gear (settings)", "zoom-in": "zoom in", "zoom-out": "zoom out", fullscreen: "full screen", download: "download", delete: "bin (delete)", edit: "pencil (edit)", plus: "+ (add)", close: "× (close)", filter: "filter", search: "search", reload: "refresh", sync: "refresh", copy: "copy", info: "i (info)", "info-circle": "i (info)", eye: "eye (view)", export: "export", upload: "upload" };
      const iconName = (el: Element) => {
        const i = el.querySelector("[class*='anticon-']");
        const m = i ? /anticon-([a-z-]+)/.exec(i.getAttribute("class") ?? "") : null;
        if (!m) return "";
        const k = m[1].replace(/-(o|outline|outlined|filled|circle)$/, "");
        return ICONS[k] ?? ICONS[m[1]] ?? `${k} icon`;
      };
      const nameOf = (el: Element) =>
        ((el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || el.querySelector("[title]")?.getAttribute("title") || iconName(el) || "") as string).replace(/\s+/g, " ").trim().slice(0, 60);
      const sel: Array<[string, string]> = [
        ["button", "button, [role='button'], .ant-btn"],
        ["tab", "[role='tab'], .ant-tabs-tab"],
        ["menuitem", "[role='menuitem']"],
        ["link", "main a[href], .ant-layout-content a[href]"],
        ["switch", "[role='switch'], .ant-switch"],
        ["checkbox", "label.ant-checkbox-wrapper"],
      ];
      const seen = new Set<Element>();
      for (const [role, q] of sel)
        for (const el of Array.from(document.querySelectorAll(q))) {
          if (seen.has(el) || !vis(el) || inChrome(el)) continue;
          if (el.closest(".ant-modal-wrap, .ant-drawer-open, .ant-dropdown, .ant-select-dropdown")) continue;
          // a sheet / table cell is data, not a control (its click only selects the cell)
          if (role === "button" && el.closest("td, th, [role='gridcell'], .data-grid-container")) continue;
          seen.add(el);
          const name = nameOf(el);
          if (!name || name.length < 2) continue;
          // tag it, so the same control is found again after a reload by listing again
          const k = `${role}|${name}`;
          tally[k] = (tally[k] ?? 0) + 1;
          const tag = `${k}|${tally[k]}`;
          el.setAttribute("data-qa-probe", tag);
          out.push({ role, name, tag });
        }
      return out;
    })
    .catch(() => [])) as Array<{ role: string; name: string; tag: string }>;
  const count = new Map<string, number>();
  const list = raw
    .filter((c) => !NEVER.test(c.name))
    .filter((c) => !include?.length || include.some((w) => c.name.toLowerCase().includes(w.toLowerCase())))
    .filter((c) => !skip?.some((w) => c.name.toLowerCase().includes(w.toLowerCase())))
    .map((c) => {
      const k = `${c.role}|${c.name}`;
      const nth = count.get(k) ?? 0;
      count.set(k, nth + 1);
      return { ...c, nth };
    })
    .filter((c) => c.nth === 0); // the same name twice is one control for the tester
  const rank = (c: Control) => (CHANGES.test(c.name) ? 2 : c.role === "tab" || c.role === "link" ? 1 : 0);
  return list.sort((a, b) => rank(a) - rank(b));
}

/** The control again: list the (reloaded) screen, which re-tags every control, and take the one with the same tag. */
async function locate(page: Page, c: Control): Promise<Locator> {
  await controls(page);
  const tagged = page.locator(`[data-qa-probe="${c.tag.replace(/"/g, '\\"')}"]`);
  if (await tagged.count().catch(() => 0)) return tagged.first();
  const esc = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole(c.role === "tab" || c.role === "menuitem" || c.role === "link" || c.role === "switch" ? (c.role as "tab") : "button", { name: new RegExp(`^\\s*${esc}\\s*$`, "i") }).first();
}

const OVERLAYS = ".ant-modal-wrap:not([style*='display: none']) .ant-modal-content, .ant-drawer-open .ant-drawer-content, [role='dialog'], .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden)";
/** Mark every overlay open now, so after the click only the NEW one is read (a feedback widget's menu stays open on some screens). */
async function markOverlays(page: Page): Promise<void> {
  await page.evaluate((sel) => document.querySelectorAll(sel).forEach((e) => e.setAttribute("data-qa-before", "1")), OVERLAYS).catch(() => {});
}
async function openOverlay(page: Page): Promise<{ dialog?: ProbeRecord["dialog"]; menu?: string[] }> {
  const modal = page.locator(".ant-modal-wrap:not([style*='display: none']) .ant-modal-content:not([data-qa-before]), .ant-drawer-open .ant-drawer-content:not([data-qa-before]), [role='dialog']:not([data-qa-before])").filter({ visible: true }).last();
  if (await modal.count().catch(() => 0)) {
    const title = clean((await modal.locator(".ant-modal-title, .ant-drawer-title, .ant-modal-confirm-title, h1, h2, h3").first().innerText().catch(() => "")) || "");
    const buttons = (await modal.locator("button").filter({ visible: true }).allInnerTexts().catch(() => [] as string[])).map(clean).filter(Boolean);
    const fields = (await modal.locator("label, .ant-form-item-label, input[placeholder], textarea[placeholder]").evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText || e.getAttribute("placeholder") || "").trim())).catch(() => [] as string[])).map(clean).filter(Boolean);
    const text = clean((await modal.innerText().catch(() => "")) || "").slice(0, 600);
    return { dialog: { title, buttons: [...new Set(buttons)].slice(0, 12), fields: [...new Set(fields)].slice(0, 15), text } };
  }
  const menu = page.locator(".ant-dropdown:not(.ant-dropdown-hidden):not([data-qa-before]), .ant-popover:not(.ant-popover-hidden):not([data-qa-before]), .ant-select-dropdown:not(.ant-select-dropdown-hidden):not([data-qa-before])").filter({ visible: true }).last();
  if (await menu.count().catch(() => 0)) {
    const items = (await menu.locator("[role='menuitem'], [role='option'], li, button").allInnerTexts().catch(() => [] as string[])).map(clean).filter(Boolean);
    return { menu: [...new Set(items)].slice(0, 25) };
  }
  return {};
}

async function closeOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);
  }
  // a dialog with no Escape: its Cancel / close (never its confirm)
  const x = page.locator(".ant-modal-wrap .ant-modal-close, .ant-drawer-open .ant-drawer-close").filter({ visible: true }).first();
  if (await x.count().catch(() => 0)) await x.click({ timeout: 2_000 }).catch(() => {});
  await page.mouse.move(1, 1).catch(() => {});
}

const MENUS = ".ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden), [role='menu']";
/** Open the menu behind the control named `within` (e.g. "Settings", "⋮ (more)", "Actions") and read its items there and then
 *  (the menu closes again on its own); null when the control is not there or no menu opened. */
async function openParent(page: Page, within: string): Promise<{ menu: Locator; names: string[] } | null> {
  const all = await controls(page);
  const want = within.toLowerCase();
  const c = all.find((x) => x.name.toLowerCase() === want) ?? all.find((x) => x.name.toLowerCase().includes(want));
  if (!c) return null;
  const el = page.locator(`[data-qa-probe="${c.tag.replace(/"/g, '\\"')}"]`).first();
  const items = "[role='menuitem'], .ant-dropdown-menu-item";
  // the overlay that holds menu items — never the feedback survey that sometimes pops up at the same moment
  const menu = page.locator(MENUS).filter({ visible: true }).filter({ has: page.locator(items) }).filter({ hasNotText: /give feedback|hello procol/i }).last();
  const read = async () =>
    [...new Set((await menu.locator(items).evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim())).catch(() => [] as string[])).filter((t) => t && t.length >= 2))];
  for (const how of ["click", "hover"] as const) {
    if (how === "click") await el.click({ timeout: 8_000 }).catch(() => el.click({ timeout: 5_000, force: true }).catch(() => {}));
    else await el.hover({ timeout: 3_000 }).catch(() => {});
    for (let k = 0; k < 8; k++) {
      await page.waitForTimeout(300);
      const names = await read();
      if (names.length) return { menu, names };
    }
  }
  return null;
}

export async function probeControls(page: Page, a: Record<string, unknown>, outDir: string, stepNo: number): Promise<{ records: ProbeRecord[]; file: string }> {
  const max = Math.max(1, Math.min(80, Number(a.max) || 40));
  const include = Array.isArray(a.include) ? (a.include as string[]) : undefined;
  const skip = Array.isArray(a.skip) ? (a.skip as string[]) : undefined;
  const reload = a.reload !== false;
  const home = page.url();
  await screenReady(page, 30_000).catch(() => undefined);
  const within = a.within ? String(a.within) : "";
  let list: Control[];
  if (within) {
    // the items of one menu: open it, list its items, and later open it again before each click
    await new BasePage(page).dismissDistractions().catch(() => false);
    const opened = await openParent(page, within);
    if (!opened) throw new Error(`not checked: no "${within}" menu could be opened on this screen`);
    const names = opened.names;
    console.log(`[probe] the "${within}" menu offers: ${names.join(" | ")}`);
    list = names
      .filter((n) => !NEVER.test(n) && (!include?.length || include.some((w) => n.toLowerCase().includes(w.toLowerCase()))) && !skip?.some((w) => n.toLowerCase().includes(w.toLowerCase())))
      .map((name) => ({ role: "menuitem", name, nth: 0, tag: `within|${name}` }))
      .slice(0, max);
    await closeOverlays(page);
  } else list = (await controls(page, include, skip)).slice(0, max);
  console.log(`[probe] ${list.length} control(s) on ${new URL(home).pathname}: ${list.map((c) => c.name).join(" | ").slice(0, 600)}`);
  mkdirSync(outDir, { recursive: true });
  const records: ProbeRecord[] = [];
  let changed = false;
  if (a.listOnly) {
    // what the screen OFFERS, without clicking anything but the menu: each control and whether it is greyed out
    if (within) {
      const opened = await openParent(page, within);
      for (const [k, { name }] of list.entries()) {
        const it = opened?.menu.locator("[role='menuitem'], .ant-dropdown-menu-item").filter({ hasText: name }).first();
        const cls = it ? (await it.getAttribute("class").catch(() => "")) ?? "" : "";
        const dis = /disabled/.test(cls) || (it ? (await it.getAttribute("aria-disabled").catch(() => null)) === "true" : false);
        records.push({ n: k + 1, role: "menuitem", name: `${within} → ${name}`, disabled: dis, outcome: dis ? "disabled" : "skipped" });
      }
      await closeOverlays(page);
    } else {
      for (const [k, c] of list.entries()) {
        const el = page.locator(`[data-qa-probe="${c.tag.replace(/"/g, '\\"')}"]`).first();
        const dis = (await el.isDisabled().catch(() => false)) || /disabled/.test((await el.getAttribute("class").catch(() => "")) ?? "") || (await el.getAttribute("aria-disabled").catch(() => null)) === "true";
        records.push({ n: k + 1, role: c.role, name: c.name, disabled: dis, outcome: dis ? "disabled" : "skipped" });
      }
    }
    const file = join(outDir, `probe-${stepNo}.json`);
    writeFileSync(file, JSON.stringify({ url: home, at: new Date().toISOString(), listOnly: true, within: within || undefined, listed: records.map((r) => r.name), records }, null, 1));
    console.log(`[probe] listed ${records.length}: ${records.map((r) => `${r.name}${r.disabled ? " (greyed)" : ""}`).join(" | ").slice(0, 700)}`);
    return { records, file };
  }
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const rec: ProbeRecord = { n: i + 1, role: c.role, name: within ? `${within} → ${c.name}` : c.name, disabled: false, outcome: "nothing", ...(changed ? { changedEvent: true } : {}) };
    try {
      if (i > 0 && reload) {
        await page.goto(home, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await screenReady(page, 30_000).catch(() => undefined);
      } else await closeOverlays(page);
      // pop-ups that cover the screen (feedback survey, notification prompt) are closed first
      await new BasePage(page).dismissDistractions().catch(() => false);
      const fb = page.locator(".ant-popover:not(.ant-popover-hidden), .ant-modal-wrap").filter({ hasText: /give feedback|hello procol/i }).filter({ visible: true });
      if (await fb.count().catch(() => 0)) await fb.locator(".ant-popover-close, .ant-modal-close, [aria-label='close'], .anticon-close").first().click({ timeout: 2_000 }).catch(() => page.keyboard.press("Escape").catch(() => {}));
      let el: Locator;
      if (within) {
        const opened = await openParent(page, within);
        const menu = opened?.menu;
        if (!menu) {
          rec.outcome = "not found";
          rec.note = `the "${within}" menu did not open after reloading the screen`;
          records.push(rec);
          continue;
        }
        const esc = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        el = menu.locator("[role='menuitem'], .ant-dropdown-menu-item").filter({ hasText: new RegExp(`^\\s*${esc}\\s*$`, "i") }).first();
      } else el = await locate(page, c);
      if (!(await el.count().catch(() => 0))) {
        rec.outcome = "not found";
        rec.note = "not on the screen after reloading it (it may appear only in some states)";
        records.push(rec);
        continue;
      }
      await el.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      const disabled = (await el.isDisabled().catch(() => false)) || /disabled/.test((await el.getAttribute("class").catch(() => "")) ?? "") || (await el.getAttribute("aria-disabled").catch(() => null)) === "true";
      if (disabled) {
        rec.disabled = true;
        rec.outcome = "disabled";
        await el.hover({ force: true, timeout: 3_000 }).catch(() => {});
        await el.locator("xpath=..").hover({ force: true, timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(800);
        const tip = page.locator("[role='tooltip'], .ant-tooltip:not(.ant-tooltip-hidden) .ant-tooltip-inner, .ant-popover:not(.ant-popover-hidden) .ant-popover-inner-content").filter({ visible: true }).last();
        rec.tooltip = clean((await tip.innerText().catch(() => "")) || "") || undefined;
      } else {
        await markOverlays(page);
        const mark = await toastMark(page);
        const before = new Set(((await page.locator("body").innerText().catch(() => "")) || "").split("\n").map(clean).filter(Boolean));
        const reqs: ProbeRecord["requests"] = [];
        const onResp = (r: import("@playwright/test").Response) => {
          const m = r.request().method();
          const u = new URL(r.url());
          if (!/\/api\//.test(u.pathname) && !/ag-ri\.in$/.test(u.hostname)) return;
          if (m === "GET" && r.status() < 400) return;
          reqs.push({ method: m, path: u.pathname.replace(/\/[0-9a-f-]{20,}|\/\d{3,}/gi, "/:id"), status: r.status() });
        };
        page.on("response", onResp);
        const url0 = page.url();
        // like a person; then forced; then the element's own click (an item wrapped in a tooltip or a sub-menu title)
        await el.click({ timeout: 6_000 }).catch(() => el.click({ timeout: 3_000, force: true })).catch(() => el.evaluate((e) => (e as HTMLElement).click()));
        await page.waitForTimeout(1_800);
        await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
        page.off("response", onResp);
        const over = await openOverlay(page);
        const msgs = await appMessagesSince(page, mark).catch(() => []);
        const after = ((await page.locator("body").innerText().catch(() => "")) || "").split("\n").map(clean).filter(Boolean);
        const fresh = [...new Set(after.filter((l) => !before.has(l) && l.length > 2 && l.length < 200))].slice(0, 12);
        const shot = join(outDir, `probe-${stepNo}-${String(i + 1).padStart(2, "0")}.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        rec.screenshot = shot;
        if (msgs.length) rec.messages = msgs.slice(0, 5);
        if (reqs.length) rec.requests = reqs.slice(0, 8);
        if (fresh.length) rec.newText = fresh;
        if (page.url() !== url0) rec.url = page.url();
        if (over.dialog) rec.dialog = over.dialog;
        if (over.menu) rec.menu = over.menu;
        rec.outcome = reqs.some((r) => r.status >= 500) || msgs.some((m) => m.kind === "error")
          ? "error"
          : over.dialog ? "dialog" : over.menu ? "menu" : rec.url && new URL(rec.url).pathname !== new URL(url0).pathname ? "navigated" : msgs.length ? "message" : reqs.length ? "request" : fresh.length ? "message" : "nothing";
        if (reqs.some((r) => r.method !== "GET" && r.status < 400)) changed = true;
        await closeOverlays(page);
      }
    } catch (e) {
      rec.outcome = "probe failed";
      rec.note = `the probe itself failed: ${(e as Error).message.split("\n")[0].slice(0, 160)}`;
    }
    console.log(`[probe] ${rec.n}. ${rec.role} "${rec.name}" → ${rec.outcome}${rec.dialog ? ` "${rec.dialog.title}" [${rec.dialog.buttons.join(", ")}]` : ""}${rec.menu ? ` [${rec.menu.slice(0, 8).join(", ")}]` : ""}${rec.tooltip ? ` tooltip "${rec.tooltip}"` : ""}${rec.url ? ` → ${new URL(rec.url).pathname}` : ""}${rec.messages ? ` msg "${rec.messages[0].text.slice(0, 80)}"` : ""}`);
    records.push(rec);
  }
  if (reload && page.url() !== home) await page.goto(home, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
  const file = join(outDir, `probe-${stepNo}.json`);
  writeFileSync(file, JSON.stringify({ url: home, at: new Date().toISOString(), within: within || undefined, listed: list.map((c) => (within ? `${within} → ${c.name}` : c.name)), records }, null, 1));
  return { records, file };
}
