import type { Page } from "@playwright/test";
import { CONFIG, NAV } from "../config.js";
import { BasePage } from "../pages/BasePage.js";
import type { PlanStep } from "./steps.js";
import { SCREENS, resolveScreen, type PlanContext } from "./screens.js";
import { EXPECTATION_NAMES } from "./expectCatalog.js";
import { observe, responsesSince, waitForCalls } from "./observe.js";
import { findVisible, describe, norm, targetFromArgs } from "./generic/find.js";
import { waitForMessage } from "./generic/messages.js";
import { screenReady } from "./generic/ready.js";

/**
 * PREPARED-STATE AND EXPECTATION STEPS (docs/ui-automation-design.md §2, §4, §5).
 *
 *   open_prepared       open the case's screen on the state the API built for it
 *   expect_navigated    the browser landed on a named screen
 *   expect_field_error  an error message sits under/next to a named field
 *   expect_toast        a toast (optionally of a kind, optionally with text) appeared
 *   expect_api_value    a value the API holds is what the screen shows
 *   expect_order        items appear in a given order / a column is sorted
 *   expect_screen_clean the observation pass found nothing wrong on this screen
 *
 * Deterministic; every wait bounded. An assertion never passes by not finding
 * something it was told to look for.
 */
export interface ExpectCtx {
  page: Page;
  context: PlanContext;
  prevMark: number;
  stepNo: number;
}

const digits = (s: string) => s.replace(/[₹,\s]/g, "").replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export async function runExpectationStep(x: ExpectCtx, step: PlanStep): Promise<string | null> {
  if (!EXPECTATION_NAMES.includes(step.step)) return null;
  const a = step.args ?? {};
  const { page } = x;
  switch (step.step) {
    case "open_prepared": {
      const screen = String(a.screen ?? "").toLowerCase().replace(/[\s-]+/g, "_");
      const { path, feeds, spec } = resolveScreen(screen, x.context);
      const state = x.context.state ?? "none";
      if (!spec.needs.includes(state)) throw new Error(`the screen "${screen}" needs one of the states ${spec.needs.join("/")}, and this case's state is ${state} — automation needs update`);
      const since = Date.now();
      await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}${path}`, NAV);
      await new BasePage(page).dismissDistractions().catch(() => false);
      const missing = await waitForCalls(page, feeds, since, 45_000);
      if (missing.length) throw new Error(`opened ${spec.what}, but the screen never asked for ${missing.join(", ")} within 45s — not ready (couldn't tell)`);
      const ready = await screenReady(page, 45_000);
      if (!ready.ready) throw new Error(`opened ${spec.what}, but ${ready.notes.join("; ")}`);
      // The Participants tab lists EVERY vendor of the product, ten a page; the
      // round's own vendors are shown by "Show only selected vendors" — a filter
      // applied in the browser only (audienceList.jsx:421-449), no data changes.
      const shown = screen === "participants" ? await showOnlySelected(page) : "";
      return `opened ${spec.what}${shown ? ` (${shown})` : ""} on ${x.context.title ?? "the prepared event"}${feeds.length ? ` — fed by ${feeds.length} API call(s)` : ""}`;
    }
    case "expect_navigated": {
      const screen = a.screen ? String(a.screen).toLowerCase().replace(/[\s-]+/g, "_") : "";
      const want = a.path ? String(a.path) : "";
      if (!screen && !want) throw new Error("expect_navigated needs a screen or a path");
      const deadline = Date.now() + 20_000;
      const ok = () => (screen ? SCREENS[screen]?.lands.test(page.url()) : page.url().includes(want));
      if (screen && !SCREENS[screen]) throw new Error(`no screen "${screen}" in the screen model`);
      while (Date.now() < deadline && !ok()) await page.waitForTimeout(400);
      if (!ok()) throw new Error(`the browser is at ${new URL(page.url()).pathname}${new URL(page.url()).search} — not ${screen ? SCREENS[screen].what : `a URL containing "${want}"`}`);
      const ready = await screenReady(page, 30_000);
      return `on ${screen ? SCREENS[screen].what : want}${ready.ready ? "" : ` (${ready.notes.join("; ")})`}`;
    }
    case "expect_field_error": {
      const field = String(a.field ?? a.label ?? "").trim();
      if (!field) throw new Error("expect_field_error needs the field's label");
      const want = a.message ? String(a.message) : "";
      const found = await findVisible(page, targetFromArgs({ label: field }), 10_000);
      const anchor = found?.locator ?? page.getByText(field, { exact: false }).first();
      if (!found && !(await anchor.count())) throw new Error(`no field "${field}" on screen`);
      // The field's own container: an antd form item, a grid cell or the nearest block holding both.
      const deadline = Date.now() + 10_000;
      let seen = "";
      while (Date.now() < deadline) {
        seen = await anchor
          .evaluate((el) => {
            const box = el.closest(".ant-form-item, .ant-row, [role='gridcell'], [role='cell'], td, .ant-col") ?? el.parentElement?.parentElement ?? el;
            const errs = box.querySelectorAll(".ant-form-item-explain-error, .ant-form-explain, .ant-form-item-explain, [role='alert'], .error, [class*='error']");
            return [...errs].map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean).join(" | ");
          })
          .catch(() => "");
        if (seen && (!want || norm(seen).includes(norm(want)))) return `the "${field}" field shows: ${seen.slice(0, 160)}`;
        await page.waitForTimeout(400);
      }
      throw new Error(seen ? `the "${field}" field shows "${seen.slice(0, 160)}" — the case expects "${want}"` : `no error is shown at the "${field}" field`);
    }
    case "expect_toast": {
      const kind = String(a.kind ?? "any").toLowerCase();
      const k = kind === "any" ? "toast" : (kind as "success" | "error" | "warning");
      const want = a.text ? String(a.text) : undefined;
      const r = await waitForMessage(page, k, { want, mark: x.prevMark, timeoutMs: 12_000 });
      if (!r.matched) throw new Error(`no ${kind === "any" ? "" : `${kind} `}toast${want ? ` containing "${want}"` : ""} — ${r.seen.length ? `seen: ${r.seen.map((m) => `[${m.kind}] ${m.text}`).join(" | ")}` : "none appeared"}`);
      return `[${r.matched.kind}] ${r.matched.text}`;
    }
    case "expect_api_value": {
      const key = String(a.key ?? "").trim();
      const v = x.context.values?.[key] ?? (key === "title" ? x.context.title : key === "vendorName" ? x.context.vendorName : undefined);
      if (!v) throw new Error(`the API setup holds no value "${key}" for this case — automation needs update (known: ${Object.keys(x.context.values ?? {}).join(", ") || "none"})`);
      const within = a.within ? page.getByText(String(a.within)).first().locator("xpath=ancestor-or-self::*[self::section or self::div][3]") : page.locator("body");
      const deadline = Date.now() + 15_000;
      const numeric = /^[\d.,₹\s]+$/.test(v);
      while (Date.now() < deadline) {
        const text = ((await within.innerText({ timeout: 5_000 }).catch(() => "")) || "").slice(0, 200_000);
        if (numeric ? text.split(/[^\d.,₹]+/).some((t) => t && digits(t) === digits(v)) : norm(text).includes(norm(v))) return `the screen shows ${key} = "${v}" (the value the API holds)`;
        await page.waitForTimeout(500);
      }
      throw new Error(`the screen does not show ${key} = "${v}", the value the API holds`);
    }
    case "expect_order": {
      const items = Array.isArray(a.items) ? a.items.map(String).filter(Boolean) : [];
      const text = ((await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")) || "").toLowerCase();
      if (items.length) {
        const at = items.map((it) => text.indexOf(it.toLowerCase()));
        const missing = items.filter((_, i) => at[i] < 0);
        if (missing.length) throw new Error(`not on screen: ${missing.map((m) => `"${m}"`).join(", ")}`);
        for (let i = 1; i < at.length; i++) if (at[i] < at[i - 1]) throw new Error(`"${items[i]}" appears before "${items[i - 1]}" — the case expects ${items.join(" → ")}`);
        return `in order: ${items.join(" → ")}`;
      }
      const t = targetFromArgs(a);
      const loc = t.role ? page.getByRole(t.role as any, t.name ? { name: new RegExp(t.name, "i") } : {}) : page.getByText(new RegExp(String(a.text ?? ""), "i"));
      const vals = (await loc.filter({ visible: true }).allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean).slice(0, 100);
      if (vals.length < 2) throw new Error(`fewer than two ${describe(t)} on screen to compare (${vals.length})`);
      const num = vals.every((s) => /\d/.test(s)) ? vals.map((s) => Number(digits(s.replace(/[^\d.,]/g, "")))) : null;
      const desc = String(a.by ?? "asc").toLowerCase() === "desc";
      for (let i = 1; i < vals.length; i++) {
        const c = num ? num[i] - num[i - 1] : vals[i].localeCompare(vals[i - 1], undefined, { sensitivity: "base", numeric: true });
        if (desc ? c > 0 : c < 0) throw new Error(`not sorted ${desc ? "descending" : "ascending"}: "${vals[i - 1]}" then "${vals[i]}"`);
      }
      return `${vals.length} item(s) sorted ${desc ? "descending" : "ascending"}`;
    }
    case "expect_request": {
      const a = (step.args ?? {}) as Record<string, unknown>;
      const frag = String(a.path ?? "").trim();
      if (!frag) throw new Error('expect_request needs a "path" fragment');
      const method = a.method ? String(a.method).toUpperCase() : undefined;
      const query = a.query ? String(a.query) : undefined;
      const status = a.status !== undefined ? Number(a.status) : undefined;
      // ids in a case's path ("/v1/trade/<stage>/download") are placeholders: match the fixed parts in order
      const parts = frag.split(/<[^>]+>|:\w+|\{\{[^}]+\}\}/).map((x) => x.trim()).filter(Boolean);
      const hit = (r: { url: string; method: string; status: number }) => {
        const u = new URL(r.url);
        const path = u.pathname;
        let from = 0;
        for (const part of parts) {
          const i = path.indexOf(part, from);
          if (i < 0) return false;
          from = i + part.length;
        }
        if (method && r.method !== method) return false;
        if (query && !decodeURIComponent(u.search).includes(query)) return false;
        if (status !== undefined ? r.status !== status : r.status < 200 || r.status >= 300) return false;
        return true;
      };
      const deadline = Date.now() + Math.min(Math.max(Number(a.timeoutMs) || 15_000, 1_000), 60_000);
      let found = responsesSince(page, 0).find(hit);
      while (!found && Date.now() < deadline) {
        await page.waitForTimeout(500);
        found = responsesSince(page, 0).find(hit);
      }
      if (!found) {
        const near = responsesSince(page, 0).filter((r) => parts.some((p) => r.url.includes(p))).slice(-3).map((r) => `${r.method} ${new URL(r.url).pathname} → ${r.status}`);
        throw new Error(`no ${method ?? ""} request to ${frag}${query ? ` with ${query}` : ""}${status !== undefined ? ` answered ${status}` : " answered 2xx"} was sent${near.length ? ` (similar: ${near.join("; ")})` : ""}`);
      }
      return `the screen sent ${found.method} ${new URL(found.url).pathname} → ${found.status}`;
    }
    case "expect_screen_clean": {
      const o = await observe(page, x.stepNo, "screen-clean", { force: true });
      if (!o) throw new Error("the observation pass is not installed on this page — automation needs update");
      if (o.findings.length) throw new Error(`the screen is not clean: ${o.findings.map((f) => `${f.rule}: ${f.detail}`).join(" | ").slice(0, 400)}`);
      return `clean — no NaN/undefined/raw ids, no server error or page crash${o.consoleErrors.length ? ` (${o.consoleErrors.length} console error(s) kept as evidence)` : ""}`;
    }
  }
  return null;
}

/** Turn on "Show only selected vendors" on a Participants tab (bounded; a view filter only). */
async function showOnlySelected(page: Page): Promise<string> {
  const sw = page.getByText(/show only selected vendors/i).first().locator("xpath=following::button[contains(@class,'ant-switch')][1]");
  if (!(await sw.count().catch(() => 0))) return "no \"Show only selected vendors\" switch";
  const isOn = async () => (await sw.getAttribute("aria-checked").catch(() => null)) === "true";
  for (let i = 0; i < 4 && !(await isOn()); i++) {
    await new BasePage(page).dismissDistractions().catch(() => false);
    if (i === 0) await sw.click({ timeout: 3_000 }).catch(() => sw.dispatchEvent("click"));
    else await sw.dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1_000);
  }
  return (await isOn()) ? "showing only the round's selected vendors" : "the \"Show only selected vendors\" switch did not turn on";
}
