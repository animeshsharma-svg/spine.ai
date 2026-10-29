import type { Locator, Page } from "@playwright/test";
import { spotlightMark } from "../spotlight.js";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, NAV } from "../../config.js";
import { EventsPage } from "../../pages/EventsPage.js";
import { AwardPage } from "../../pages/AwardPage.js";
import { SurrogateBidPage } from "../../pages/SurrogateBidPage.js";
import { CounterOfferPage } from "../../pages/CounterOfferPage.js";
import { BasePage } from "../../pages/BasePage.js";
import { heal, healerEnabled } from "../../ai/healer.js";
import type { PlanStep } from "../steps.js";
import { GENERIC_NAMES } from "./catalog.js";
import { countVisible, describe, findVisible, isDisabled, norm, pattern, Target, targetFromArgs, targetWords } from "./find.js";
import { screenReady, trackRequests } from "./ready.js";
import { MessageKind, toastMark, waitForMessage } from "./messages.js";
import { isKnownLabel, noteSeen } from "./labels.js";

/**
 * THE GENERIC EXECUTOR — one case per generic step, all bounded, all honest.
 *
 * Contract with runPlan: `runGenericStep` returns null for a step it does not
 * own, otherwise `{ detail, strategy }` or throws with a sentence a person can
 * read. Three rules it never breaks:
 *
 *   1. Every wait is bounded (each step has a budget, and the whole step runs
 *      under a deadline).
 *   2. Not finding something is a FAILURE — except in an explicit absence
 *      check, which may only conclude "absent" on a screen that passed the
 *      page-ready signal, and only after looking twice.
 *   3. A refusal (attempt) passes only on POSITIVE evidence: a message, a
 *      disabled control, or nothing opening on a ready screen. If our own
 *      action broke, the verdict is "could not tell", never "blocked".
 */

export interface GenericCtx {
  page: Page;
  events: EventsPage;
  /** This plan's own event title. */
  title: string;
  /** remember{} values. */
  memory: Record<string, { target: Target; text: string }>;
  /** Toast-journal mark taken before the PREVIOUS step, so a message that step caused is still "new". */
  prevMark: number;
}

export interface GenericOutcome {
  detail: string;
  /** Which locator strategy found the element (for the report). */
  strategy?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "fixtures");

/** Known QA tenants a plan may switch to (PROCOL DEMO, Demo Account 2, GMMCO) + env. */
const ALLOWED_COMPANIES = new Set<number>([198678, 32461, 47053, ...String(process.env.UI_ALLOWED_COMPANIES ?? "").split(",").map(Number).filter((x) => x > 0)]);

const bool = (v: unknown, dflt: boolean) => (v === undefined || v === null || v === "" ? dflt : !/^(false|no|0|off)$/i.test(String(v)));
const num = (v: unknown): number | undefined => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${what} did not finish within ${Math.round(ms / 1000)}s — stopped (bounded step)`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** The flattened target a step names: args.target may be a string or an object. */
function targetOf(a: Record<string, unknown>): Target {
  const raw = a.target;
  if (raw && typeof raw === "object") return targetFromArgs({ ...(raw as Record<string, unknown>), within: (raw as any).within ?? a.within });
  return targetFromArgs(a);
}

function requireWords(t: Target, step: string): void {
  if (!targetWords(t).length) throw new Error(`${step} needs something to look for — a name, label, placeholder or text`);
}

/** Absence is only evidence on a ready screen, looked at twice. */
async function confirmAbsent(page: Page, t: Target, readyMs: number): Promise<{ ok: boolean; detail: string }> {
  // What a naive check would have concluded, had it looked immediately —
  // recorded so the report shows what the ready-wait protected against.
  const glance = await countVisible(page, t).catch(() => ({ n: -1, strategy: "" }));
  const ready = await screenReady(page, readyMs);
  if (!ready.ready) {
    return { ok: false, detail: `could not tell: ${ready.notes.join("; ")} — an absence on an unready screen proves nothing` };
  }
  const first = await countVisible(page, t);
  if (first.n) return { ok: false, detail: `${describe(t)} IS on screen (${first.n} found by ${first.strategy}) — looked once the ${ready.notes.join("; ")}${glance.n === 0 ? "; an immediate look would have seen none (a false pass the ready-wait prevented)" : ""}` };
  // Late renders: look again a moment later before concluding.
  await page.waitForTimeout(1_500);
  const second = await countVisible(page, t);
  if (second.n) return { ok: false, detail: `${describe(t)} appeared a moment after the screen looked ready (${second.n} found by ${second.strategy})` };
  const guessed = targetWords(t).some((w) => !isKnownLabel(w));
  return {
    ok: true,
    detail: `${describe(t)} is absent — ${ready.notes.join("; ")}; checked twice 1.5s apart; ${second.strategy}${glance.n > 0 ? `; (it was visible ${glance.n}× before the screen settled)` : ""}${guessed ? " (NOTE: this label is not among the known labels — confirm it is spelt as the product spells it)" : ""}`,
  };
}

/** The input/select/switch that belongs to a label. */
async function fieldFor(el: Locator): Promise<Locator> {
  const tag = await el.evaluate((n) => (n as HTMLElement).tagName.toLowerCase()).catch(() => "");
  const role = (await el.getAttribute("role").catch(() => null)) ?? "";
  if (["input", "textarea", "select"].includes(tag) || ["textbox", "combobox", "switch", "checkbox", "radio", "spinbutton"].includes(role)) return el;
  const cls = (await el.getAttribute("class").catch(() => "")) ?? "";
  if (/ant-select|ant-switch|ant-checkbox|ant-radio-group|ant-picker/.test(cls)) return el;
  // The nearest ancestor that holds a field, then that field.
  const holder = el.locator(
    "xpath=ancestor::*[.//input or .//textarea or .//select or .//*[contains(@class,'ant-select')] or .//*[@role='switch'] or .//*[@role='radio'] or .//*[contains(@class,'ant-radio-group')]][1]",
  );
  const inside = holder.locator("input:not([type='hidden']), textarea, select, .ant-select, [role='switch'], .ant-radio-group, [role='radiogroup'], .ant-checkbox").first();
  if (await inside.count().catch(() => 0)) return inside;
  return el;
}

/** What a field currently shows, however it is built. */
async function fieldValue(f: Locator): Promise<string> {
  const tag = await f.evaluate((n) => (n as HTMLElement).tagName.toLowerCase()).catch(() => "");
  const cls = (await f.getAttribute("class").catch(() => "")) ?? "";
  if (tag === "select") return f.evaluate((n) => (n as HTMLSelectElement).selectedOptions[0]?.textContent ?? "").catch(() => "");
  if (tag === "input" || tag === "textarea") {
    const type = (await f.getAttribute("type").catch(() => "")) ?? "";
    if (/checkbox|radio/.test(type)) return (await f.isChecked().catch(() => false)) ? "checked" : "unchecked";
    const v = await f.inputValue().catch(() => "");
    if (v) return v;
    // antd select search inputs are empty; read the select around them.
    const sel = f.locator("xpath=ancestor::*[contains(@class,'ant-select')][1]");
    if (await sel.count().catch(() => 0)) return fieldValue(sel.first());
    return "";
  }
  if (/ant-select/.test(cls)) {
    const shown = f.locator(".ant-select-selection-selected-value, .ant-select-selection-item, .ant-select-selection__choice__content, .ant-select-selection-item-content").first();
    if (await shown.count().catch(() => 0)) return ((await shown.innerText().catch(() => "")) || (await shown.getAttribute("title").catch(() => "")) || "").trim();
    return ((await f.innerText().catch(() => "")) || "").trim();
  }
  if (/ant-radio-group/.test(cls) || (await f.getAttribute("role").catch(() => "")) === "radiogroup") {
    const checked = f.locator(".ant-radio-wrapper-checked, .ant-radio-button-wrapper-checked, [role='radio'][aria-checked='true']").first();
    return ((await checked.innerText().catch(() => "")) || "").trim();
  }
  const role = await f.getAttribute("role").catch(() => "");
  if (role === "switch" || /ant-switch|ant-checkbox/.test(cls)) return (await isOn(f)) ? "on" : "off";
  return ((await f.innerText().catch(() => "")) || "").trim();
}

async function isOn(f: Locator): Promise<boolean> {
  const aria = await f.getAttribute("aria-checked").catch(() => null);
  if (aria === "true") return true;
  if (aria === "false") return false;
  const cls = (await f.getAttribute("class").catch(() => "")) ?? "";
  if (/ant-switch-checked|ant-checkbox-checked|ant-checkbox-wrapper-checked/.test(cls)) return true;
  const input = f.locator("input[type='checkbox']").first();
  if (await input.count().catch(() => 0)) return input.isChecked().catch(() => false);
  return f.isChecked().catch(() => false);
}

/** Overlays that count as "something opened". */
async function openOverlays(page: Page): Promise<number> {
  return page
    .locator(".ant-drawer-open, .ant-modal-wrap:not([style*='display: none']) .ant-modal, [role='dialog'], .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden)")
    .filter({ visible: true })
    .count()
    .catch(() => 0);
}

/** Click a target: find → (disabled? fail) → click → retry once after dismissing popovers → healer. */
async function clickTarget(ctx: GenericCtx, t: Target, timeoutMs: number): Promise<GenericOutcome> {
  const { page } = ctx;
  requireWords(t, "click");
  await ctx.events.dismissDistractions().catch(() => false);
  // A plan that "clicks" a confirmation's question ("Are you sure to delete this line item?")
  // means: answer it. antd renders it as a popconfirm whose question is not a control — click
  // its confirming button instead (Yes / OK / Confirm / Delete), the way a person would.
  const words0 = targetWords(t)[0] ?? "";
  if (/\?$|^are you sure|^do you want|^confirm\b/i.test(words0.trim())) {
    const pop = page.locator(".ant-popover:not(.ant-popover-hidden), .ant-popconfirm, .ant-modal-confirm, .ant-modal-wrap:not([style*='display: none'])").filter({ hasText: words0.replace(/\?$/, "").slice(0, 40) }).last();
    if (await pop.isVisible().catch(() => false)) {
      const yes = pop.locator("button.ant-btn-primary, button").filter({ hasText: /^(yes|ok|confirm|delete|remove|proceed|continue)$/i }).first();
      if (await yes.isVisible().catch(() => false)) {
        await yes.click({ timeout: 8_000 });
        return { detail: `answered the confirmation “${words0}” with ${(await yes.innerText().catch(() => "its confirm button")).trim()}`, strategy: "confirmation pop-up → its confirm button" };
      }
    }
  }
  const found = await findVisible(page, t, timeoutMs);
  if (!found) {
    const words = targetWords(t)[0];
    if (healerEnabled() && (await heal(page, `click ${describe(t)}`, `generic:${words.toLowerCase()}`))) {
      return { detail: `clicked ${describe(t)} (found by the AI healer — no deterministic strategy matched)`, strategy: "AI healer (last resort)" };
    }
    throw new Error(`no ${describe(t)} is on screen within ${Math.round(timeoutMs / 1000)}s (tried role+name, label, placeholder, text${healerEnabled() ? ", AI healer" : ""})`);
  }
  // Text found by its words may be a LABEL beside the control, not the
  // control ("Schedule" sits above the schedule chip). Clicking a label does
  // nothing and the step would "succeed" — so resolve it to its control.
  let strategy = found.strategy;
  if (/^(visible text|title attribute)/.test(found.strategy)) {
    const resolved = await controlNear(page, found.locator);
    if (resolved === "ambiguous") throw new Error(`"${targetWords(t)[0]}" is a label with several controls around it — name the control itself (role + name)`);
    if (resolved) {
      found.locator = resolved;
      strategy = `${found.strategy} → the control beside it`;
    }
  }
  if (await isDisabled(found.locator)) throw new Error(`${describe(t)} is on screen but DISABLED — use attempt{step:"click"} if the case expects that`);
  try {
    await found.locator.click({ timeout: 10_000 });
  } catch (e) {
    if (await ctx.events.dismissDistractions().catch(() => false)) await found.locator.click({ timeout: 5_000 });
    else throw e;
  }
  noteSeen(targetWords(t)[0], page.url(), strategy);
  await page.waitForTimeout(400);
  return { detail: `clicked ${describe(t)}${found.visible > 1 ? ` (first of ${found.visible} visible matches)` : ""}`, strategy };
}

const INTERACTIVE =
  "button, [role='button'], a[href], [role='tab'], [role='menuitem'], [role='option'], [role='switch'], [role='checkbox'], [role='radio'], input, select, textarea, .ant-dropdown-trigger, .ant-select, .ant-btn";

/**
 * For an element found by its text: null when it is (inside) a control or
 * looks clickable itself; else the single visible control within three
 * ancestors of it; "ambiguous" when there are several.
 */
async function controlNear(page: Page, el: Locator): Promise<Locator | null | "ambiguous"> {
  const verdict = await el
    .evaluate((node, sel) => {
      const e = node as HTMLElement;
      if (e.closest(sel) || getComputedStyle(e).cursor === "pointer") return "self";
      document.querySelectorAll("[data-qa-generic-target]").forEach((x) => x.removeAttribute("data-qa-generic-target"));
      let up: HTMLElement | null = e;
      for (let i = 0; i < 3 && up?.parentElement; i++) {
        up = up.parentElement;
        const near = Array.from(up.querySelectorAll<HTMLElement>(sel)).filter((v) => v.offsetParent !== null && !v.closest("[aria-hidden='true']"));
        if (near.length === 1) {
          near[0].setAttribute("data-qa-generic-target", "1");
          return "near";
        }
        if (near.length > 1) return "ambiguous";
      }
      return "none";
    }, INTERACTIVE)
    .catch(() => "self");
  if (verdict === "near") return page.locator("[data-qa-generic-target='1']").first();
  if (verdict === "ambiguous") return "ambiguous";
  return null;
}

async function goTo(ctx: GenericCtx, a: Record<string, unknown>): Promise<GenericOutcome> {
  const { page } = ctx;
  const screen = String(a.screen ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const onProject = () => /\/project\//.test(page.url());
  const needProject = () => {
    if (!onProject()) throw new Error(`go_to ${screen} needs a published event's page — publish (or open_event) first; the browser is at ${new URL(page.url()).pathname}`);
  };
  const clickTab = async (name: RegExp, label: string) => {
    const tab = page.getByRole("tab", { name }).filter({ visible: true }).first();
    await tab.waitFor({ state: "visible", timeout: 45_000 }).catch(() => {});
    if (!(await tab.count())) {
      const tabs = (await page.getByRole("tab").allTextContents().catch(() => [])).map((x) => x.trim()).filter(Boolean);
      throw new Error(`no "${label}" tab here — the tabs on screen are: ${tabs.join(", ") || "(none)"}`);
    }
    if ((await tab.getAttribute("aria-selected").catch(() => null)) !== "true") await tab.click({ timeout: 10_000 });
    return `tab "${((await tab.innerText().catch(() => label)) || label).replace(/\s+/g, " ").trim()}"`;
  };
  const stageTab = async (stage?: string) => {
    await page.getByText(/loading your event details/i).first().waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
    const re = stage === "rfp" ? /technical|\brfp\b/i : stage === "rfq" ? /^\s*rfq\b/i : stage === "auction" ? /auction/i : /^\s*(rfq|auction|technical|rfp)\b/i;
    return clickTab(re, stage ?? "first stage");
  };
  const subTab = async (name: RegExp, label: string) => {
    needProject();
    // Sub-tabs live on a STAGE; from the project tab, enter the first stage.
    if (!(await page.getByRole("tab", { name }).filter({ visible: true }).count())) await stageTab(a.stage ? String(a.stage) : undefined).catch(() => "");
    return clickTab(name, label);
  };
  let what: string;
  switch (screen) {
    case "events_list":
    case "list":
      await ctx.events.goto();
      what = "the events list";
      break;
    case "event": {
      const id = a.id ? String(a.id) : undefined;
      const title = a.title ? String(a.title) : id ? undefined : ctx.title;
      what = `event ${await ctx.events.openEvent({ id, title })}`;
      break;
    }
    case "master_qcs":
    case "qcs":
      needProject();
      if (!(await new AwardPage(page).openMasterQcs())) throw new Error("this event has no Master QCS tab");
      what = "Master QCS";
      break;
    case "participants":
      needProject();
      if (!(await new SurrogateBidPage(page).openParticipants())) throw new Error("the Participants list did not open on this event");
      what = "the Participants list";
      break;
    case "responses":
      needProject();
      await new CounterOfferPage(page).ready();
      what = await clickTab(/^\s*responses\b/i, "Responses");
      break;
    case "stage":
      needProject();
      what = await stageTab(a.stage ? String(a.stage).toLowerCase() : undefined);
      break;
    case "overview":
      what = await subTab(/^\s*overview\b/i, "Overview");
      break;
    case "analytics":
      what = await subTab(/^\s*analytics\b/i, "Analytics");
      break;
    case "price_trends":
      what = await subTab(/price\s*trends/i, "Price Trends");
      break;
    case "participant_remarks":
      what = await subTab(/participant\s*remarks/i, "Participant Remarks");
      break;
    case "tab": {
      const name = String(a.name ?? a.tab ?? "").trim();
      if (!name) throw new Error('go_to screen "tab" needs a "name"');
      what = await clickTab(pattern(name), name);
      break;
    }
    case "path": {
      const path = String(a.path ?? "").trim();
      if (!path.startsWith("/") || /^\/\//.test(path)) throw new Error('go_to screen "path" needs a console path starting with "/" (no host)');
      await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}${path}`, NAV);
      what = path;
      break;
    }
    default:
      throw new Error(`go_to does not know the screen "${screen}" — use one of: stage, responses, overview, participants, analytics, price_trends, participant_remarks, tab, path, events_list, event, master_qcs`);
  }
  await ctx.events.dismissDistractions().catch(() => false);
  const ready = await screenReady(page, 45_000);
  if (!ready.ready) throw new Error(`reached ${what}, but ${ready.notes.join("; ")}`);
  return { detail: `on ${what} — ${ready.notes.join("; ")}` };
}

export function isGenericStep(name: string): boolean {
  return GENERIC_NAMES.includes(name);
}

export async function runGenericStep(
  ctx: GenericCtx,
  step: PlanStep,
  runInner: (inner: PlanStep) => Promise<string | undefined>,
): Promise<GenericOutcome | null> {
  if (!isGenericStep(step.step)) return null;
  trackRequests(ctx.page);
  const a = step.args ?? {};
  const budget = step.step === "attempt" ? 300_000 : step.step === "go_to" ? 150_000 : 120_000;
  return withDeadline(execute(ctx, step.step, a, runInner), budget, step.step);
}

async function execute(
  ctx: GenericCtx,
  name: string,
  a: Record<string, unknown>,
  runInner: (inner: PlanStep) => Promise<string | undefined>,
): Promise<GenericOutcome> {
  const { page } = ctx;
  const timeoutMs = Math.min(Math.max(num(a.timeoutMs) ?? 15_000, 1_000), 90_000);
  // How long an absence/count check waits for the page-ready signal.
  const readyMs = Math.min(Math.max(num(a.readyMs) ?? 45_000, 2_000), 120_000);
  switch (name) {
    case "go_to":
      return goTo(ctx, a);

    case "click":
      return clickTarget(ctx, targetOf(a), timeoutMs);

    case "hover": {
      const t = targetOf(a);
      requireWords(t, "hover");
      const found = await findVisible(page, t, timeoutMs);
      if (!found) throw new Error(`no ${describe(t)} to hover`);
      await hoverEl(page, found.locator);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      return { detail: `hovering ${describe(t)}`, strategy: found.strategy };
    }

    case "press": {
      const key = String(a.key ?? "").trim();
      if (!/^(Escape|Enter|Tab|ArrowDown|ArrowUp|ArrowLeft|ArrowRight|Backspace|Delete|Space|PageDown|PageUp|Home|End)$/.test(key)) throw new Error(`press: "${key}" is not an allowed key`);
      await page.keyboard.press(key === "Space" ? " " : key);
      await page.waitForTimeout(300);
      return { detail: `pressed ${key}` };
    }

    case "fill": {
      const value = a.value === undefined ? "" : String(a.value);
      const t = targetOf({ ...a, text: undefined, label: a.label ?? a.name ?? a.placeholder ?? a.target, placeholder: a.placeholder });
      requireWords(t, "fill");
      const found = await findVisible(page, { ...t, role: t.role ?? undefined }, timeoutMs);
      if (!found) throw new Error(`no field ${describe(t)} on screen within ${Math.round(timeoutMs / 1000)}s`);
      const field = await fieldFor(found.locator);
      if (await isDisabled(field)) throw new Error(`the field ${describe(t)} is disabled`);
      await field.click({ timeout: 8_000 }).catch(() => {});
      // antd number inputs / grid cells wrap the real input: fill that; if nothing inside is
      // fillable, select what is there and type, like a person.
      const filled = await field.fill(value, { timeout: 8_000 }).then(() => true).catch(() => false);
      if (!filled) {
        const inner = field.locator("input:not([type='hidden']), textarea, [contenteditable='true']").first();
        const innerOk = (await inner.count().catch(() => 0)) > 0 && (await inner.fill(value, { timeout: 5_000 }).then(() => true).catch(() => false));
        if (!innerOk) {
          await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
          await page.keyboard.type(value, { delay: 20 });
        }
      }
      const now = await fieldValue(field);
      if (value && !norm(now).includes(norm(value))) throw new Error(`typed "${value}" into ${describe(t)} but the field now shows "${now}"`);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      // A search box commits on Enter: typing alone left the events list unfiltered (23 Oct, E01:
      // "Search Title" held the text, the list still showed live events, and "No Results found"
      // never came). Submit it unless the plan says not to.
      const searchy = /search/i.test(`${describe(t)} ${await field.getAttribute("placeholder").catch(() => "") ?? ""} ${await field.getAttribute("type").catch(() => "") ?? ""}`);
      if (value && searchy && a.submit !== false) {
        await field.press("Enter", { timeout: 5_000 }).catch(() => page.keyboard.press("Enter").catch(() => {}));
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        return { detail: `${describe(t)} now holds "${now}" — submitted with Enter`, strategy: found.strategy };
      }
      return { detail: `${describe(t)} now holds "${now}"`, strategy: found.strategy };
    }

    case "select": {
      const option = String(a.option ?? a.value ?? "").trim();
      if (!option) throw new Error('select needs an "option"');
      const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target, text: undefined });
      requireWords(t, "select");
      const found = (await findVisible(page, { ...t, role: "combobox" }, 3_000)) ?? (await findVisible(page, t, timeoutMs));
      if (!found) {
        // A "select" is sometimes a radio group or segmented tabs: pick the option directly.
        const direct = await findVisible(page, { name: option, exact: false }, 3_000);
        if (direct && /radio|tab|button/.test(direct.strategy)) {
          await direct.locator.click({ timeout: 8_000 });
          return { detail: `no select labelled "${targetWords(t)[0]}"; chose the option "${option}" directly`, strategy: direct.strategy };
        }
        throw new Error(`no select ${describe(t)} on screen within ${Math.round(timeoutMs / 1000)}s`);
      }
      const field = await fieldFor(found.locator);
      const tag = await field.evaluate((n) => (n as HTMLElement).tagName.toLowerCase()).catch(() => "");
      if (tag === "select") {
        await field.selectOption({ label: option }, { timeout: 8_000 });
      } else {
        const opener = field.locator(".ant-select-selection, .ant-select-selector").first();
        await ((await opener.count().catch(() => 0)) ? opener : field).click({ timeout: 8_000 });
        const opt = page
          .locator("[role='option'], .ant-select-dropdown-menu-item, .ant-select-item-option, .ant-dropdown-menu-item, .ant-cascader-menu-item")
          .filter({ hasText: pattern(option) })
          .filter({ visible: true })
          .first();
        await opt.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        if (!(await opt.count())) {
          const offered = (await page.locator("[role='option'], .ant-select-dropdown-menu-item, .ant-select-item-option").filter({ visible: true }).allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
          await page.keyboard.press("Escape").catch(() => {});
          throw new Error(`the select ${describe(t)} does not offer "${option}" — it offers: ${offered.slice(0, 12).join(", ") || "(nothing visible)"}`);
        }
        await opt.click({ timeout: 8_000 });
      }
      await page.waitForTimeout(300);
      const now = await fieldValue(field);
      if (now && !norm(now).includes(norm(option))) throw new Error(`chose "${option}" in ${describe(t)} but it now shows "${now}"`);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      return { detail: `${describe(t)} set to "${now || option}"`, strategy: found.strategy };
    }

    case "toggle": {
      const want = bool(a.on, true);
      const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target, text: undefined });
      requireWords(t, "toggle");
      const found =
        (await findVisible(page, { ...t, role: "switch" }, 2_000)) ??
        (await findVisible(page, { ...t, role: "checkbox" }, 2_000)) ??
        (await findVisible(page, t, timeoutMs));
      if (!found) throw new Error(`no switch or checkbox ${describe(t)} on screen`);
      const field = await fieldFor(found.locator);
      if (await isDisabled(field)) throw new Error(`the switch ${describe(t)} is disabled`);
      const before = await isOn(field);
      if (before !== want) {
        await field.click({ timeout: 8_000 });
        await page.waitForTimeout(400);
      }
      const after = await isOn(field);
      if (after !== want) throw new Error(`${describe(t)} is still ${after ? "on" : "off"} after clicking it`);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      return { detail: `${describe(t)} is ${after ? "on" : "off"}${before === want ? " (it already was)" : ""}`, strategy: found.strategy };
    }

    case "upload": {
      const file = basename(String(a.file ?? "sample.pdf"));
      const path = join(FIXTURES, file);
      if (!existsSync(path)) throw new Error(`upload: no fixture "${file}" — available: sample.pdf, sample.png, sample.csv, sample.txt`);
      const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target });
      let how = "";
      let strategy: string | undefined;
      const found = targetWords(t).length ? await findVisible(page, t, timeoutMs) : null;
      if (found) {
        strategy = found.strategy;
        const chooser = await Promise.all([page.waitForEvent("filechooser", { timeout: 8_000 }), found.locator.click({ timeout: 8_000 })])
          .then(([c]) => c)
          .catch(() => null);
        if (chooser) {
          await chooser.setFiles(path);
          how = "through the file chooser";
        } else {
          const input = found.locator.locator("xpath=ancestor-or-self::*[.//input[@type='file']][1]").locator("input[type='file']").first();
          if (await input.count().catch(() => 0)) {
            await input.setInputFiles(path);
            how = "into the control's file input";
          }
        }
      }
      if (!how) {
        const inputs = page.locator("input[type='file']");
        const n = await inputs.count().catch(() => 0);
        if (n !== 1) throw new Error(`upload: ${found ? `${describe(t)} opened no file chooser and` : `no ${describe(t)} on screen and`} the screen has ${n} file inputs — cannot tell which to use`);
        await inputs.first().setInputFiles(path);
        how = "into the screen's only file input";
        strategy = strategy ?? "the screen's only input[type=file]";
      }
      // Proof the app took it: the file name on screen, or a success toast.
      const shown = await page.getByText(pattern(file)).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      const ok = shown || !!(await waitForMessage(page, "success", { mark: ctx.prevMark, timeoutMs: 1_500 })).matched;
      if (!ok) throw new Error(`attached ${file} ${how}, but the screen shows no sign of it (no file name, no success message)`);
      return { detail: `uploaded ${file} ${how}; the screen shows it`, strategy };
    }

    case "expect_text": {
      const text = String(a.text ?? "").trim();
      if (!text) throw new Error('expect_text needs a "text"');
      const t: Target = { text, exact: a.exact === true, within: a.within ? String(a.within) : undefined };
      if (!bool(a.present, true)) {
        const r = await confirmAbsent(page, t, readyMs);
        if (!r.ok) throw new Error(r.detail);
        return { detail: r.detail, strategy: "absence (page-ready + double check)" };
      }
      const found = await findVisible(page, t, timeoutMs);
      if (!found) {
        const body = ((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
        throw new Error(`the text "${text}" is not on screen within ${Math.round(timeoutMs / 1000)}s${t.within ? ` inside ${t.within}` : ""} — the screen reads: ${body.slice(0, 220)}…`);
      }
      noteSeen(text, page.url(), found.strategy);
      await spotlightMark(found.locator, `"${text}" is on screen`).catch(() => {});
      return { detail: `"${text}" is on screen`, strategy: found.strategy };
    }

    case "expect_visible": {
      const t = targetOf(a);
      requireWords(t, "expect_visible");
      if (!bool(a.visible, true)) {
        const r = await confirmAbsent(page, t, readyMs);
        if (!r.ok) throw new Error(r.detail);
        return { detail: r.detail, strategy: "absence (page-ready + double check)" };
      }
      const found = await findVisible(page, t, timeoutMs);
      if (!found) throw new Error(`${describe(t)} is not visible within ${Math.round(timeoutMs / 1000)}s`);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      await spotlightMark(found.locator, `${describe(t)} is visible`).catch(() => {});
      return { detail: `${describe(t)} is visible${found.visible > 1 ? ` (${found.visible} matches)` : ""}`, strategy: found.strategy };
    }

    case "expect_count": {
      const t = targetOf(a);
      requireWords(t, "expect_count");
      const exact = num(a.count);
      const min = num(a.min);
      const max = num(a.max);
      if (exact === undefined && min === undefined && max === undefined) throw new Error("expect_count needs count, min or max");
      if (exact === 0 || max === 0) {
        const r = await confirmAbsent(page, t, readyMs);
        if (!r.ok) throw new Error(r.detail.replace(/ IS on screen/, " should number 0 but IS on screen"));
        return { detail: `0 × ${r.detail}`, strategy: "absence (page-ready + double check)" };
      }
      const ready = await screenReady(page, readyMs);
      if (!ready.ready) throw new Error(`could not tell: ${ready.notes.join("; ")} — a count on an unready screen proves nothing`);
      const okFor = (n: number) => (exact === undefined || n === exact) && (min === undefined || n >= min) && (max === undefined || n <= max);
      const deadline = Date.now() + timeoutMs;
      let last = { n: 0, strategy: "" };
      let prev = -1;
      do {
        last = await countVisible(page, t);
        // Two equal reads ~800ms apart: a list still filling in cannot pass an exact count.
        if (okFor(last.n) && last.n === prev) {
          noteSeen(targetWords(t)[0], page.url(), last.strategy);
          return { detail: `${last.n} × ${describe(t)} (wanted ${exact !== undefined ? exact : `${min ?? 0}…${max ?? "∞"}`})`, strategy: last.strategy };
        }
        prev = last.n;
        await page.waitForTimeout(800);
      } while (Date.now() < deadline);
      throw new Error(`counted ${last.n} × ${describe(t)} (by ${last.strategy}) — the case wants ${exact !== undefined ? `exactly ${exact}` : `${min !== undefined ? `at least ${min}` : ""}${min !== undefined && max !== undefined ? " and " : ""}${max !== undefined ? `at most ${max}` : ""}`}`);
    }

    case "expect_value": {
      const want = String(a.value ?? "").trim();
      const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target, text: undefined });
      requireWords(t, "expect_value");
      const found = await findVisible(page, t, timeoutMs);
      if (!found) throw new Error(`no field ${describe(t)} on screen within ${Math.round(timeoutMs / 1000)}s`);
      const field = await fieldFor(found.locator);
      const deadline = Date.now() + 8_000;
      let now = "";
      do {
        now = await fieldValue(field);
        if (norm(now).includes(norm(want)) && (want || !now)) {
          noteSeen(targetWords(t)[0], page.url(), found.strategy);
          return { detail: `${describe(t)} shows "${now}"`, strategy: found.strategy };
        }
        await page.waitForTimeout(400);
      } while (Date.now() < deadline);
      throw new Error(`${describe(t)} shows "${now || "(empty)"}" — the case expects "${want}"`);
    }

    case "expect_message": {
      const kind = String(a.kind ?? "any").toLowerCase() as MessageKind;
      if (!["toast", "error", "warning", "success", "tooltip", "inline", "modal", "any"].includes(kind)) throw new Error(`expect_message: unknown kind "${kind}"`);
      const want = a.text ? String(a.text) : undefined;
      let strategy: string | undefined;
      if (kind === "tooltip") {
        const on = a.on ?? a.target ?? a.name;
        if (!on) throw new Error('expect_message kind "tooltip" needs `on` — the element to hover');
        const t = typeof on === "object" ? targetFromArgs(on as Record<string, unknown>) : ({ name: String(on) } as Target);
        const found = await findVisible(page, t, timeoutMs);
        if (!found) throw new Error(`no ${describe(t)} to hover for its tooltip`);
        strategy = found.strategy;
        await hoverEl(page, found.locator);
      }
      let r = await waitForMessage(page, kind, { want, mark: ctx.prevMark, timeoutMs: kind === "tooltip" ? 6_000 : Math.min(timeoutMs, 12_000) });
      // The text is what the case is about; HOW the app shows it varies (many console errors are
      // logError → a toast, not a message under the field). Accept the same text in any form,
      // and say which form it took.
      if (!r.matched && want && kind !== "any" && kind !== "tooltip") {
        const anyForm = await waitForMessage(page, "any", { want, mark: ctx.prevMark, timeoutMs: 1_500 });
        if (anyForm.matched) {
          if (want) noteSeen(want, page.url(), `message ${anyForm.matched.kind}`);
          return { detail: `[${anyForm.matched.kind}] ${anyForm.matched.text} (shown as ${anyForm.matched.kind}, not ${kind})`, strategy: `message ${anyForm.matched.kind}` };
        }
        r = { matched: null, seen: [...r.seen, ...anyForm.seen.filter((m) => !r.seen.some((x) => x.text === m.text))] };
      }
      if (!r.matched) {
        throw new Error(
          `no ${kind === "any" ? "" : `${kind} `}message${want ? ` containing "${want}"` : ""} — ${r.seen.length ? `the app showed: ${r.seen.map((m) => `[${m.kind}] ${m.text}`).join(" | ")}` : "the app showed no message at all"}`,
        );
      }
      if (want) noteSeen(want, page.url(), `message ${r.matched.kind}`);
      return { detail: `[${r.matched.kind}] ${r.matched.text}`, strategy: strategy ? `${strategy} → ${r.matched.kind}` : `message ${r.matched.kind}` };
    }

    case "remember": {
      const key = String(a.key ?? "").trim();
      if (!key) throw new Error('remember needs a "key"');
      const t = targetOf(a);
      requireWords(t, "remember");
      const ready = await screenReady(page, 30_000);
      const found = await findVisible(page, t, timeoutMs);
      if (!found) throw new Error(`nothing to remember — no ${describe(t)} on screen${ready.ready ? "" : ` (${ready.notes.join("; ")})`}`);
      const text = ((await found.locator.innerText().catch(() => "")) || (await fieldValue(found.locator))).replace(/\s+/g, " ").trim();
      ctx.memory[key] = { target: t, text };
      return { detail: `remembered "${key}" = ${text.slice(0, 160)}${text.length > 160 ? "…" : ""}`, strategy: found.strategy };
    }

    case "expect_remembered": {
      const key = String(a.key ?? "").trim();
      const kept = ctx.memory[key];
      if (!kept) throw new Error(`nothing was remembered as "${key}" earlier in this plan`);
      await screenReady(page, 30_000);
      const found = await findVisible(page, kept.target, timeoutMs);
      if (!found) throw new Error(`${describe(kept.target)} is no longer on screen to compare with "${key}"`);
      const now = ((await found.locator.innerText().catch(() => "")) || (await fieldValue(found.locator))).replace(/\s+/g, " ").trim();
      const same = norm(now) === norm(kept.text);
      const wantSame = bool(a.same, true);
      if (same !== wantSame) throw new Error(`"${key}" ${same ? "is unchanged" : "changed"} — the case expects it ${wantSame ? "unchanged" : "changed"}. Before: ${kept.text.slice(0, 120)} · now: ${now.slice(0, 120)}`);
      return { detail: `"${key}" is ${same ? "unchanged" : "changed"}, as expected`, strategy: found.strategy };
    }

    case "switch_company": {
      const id = Number(a.companyId ?? a.company);
      if (!ALLOWED_COMPANIES.has(id)) throw new Error(`switch_company: ${a.companyId ?? a.company} is not one of the known QA tenants (${[...ALLOWED_COMPANIES].join(", ")})`);
      const { loginAsCompany } = await import("../../db/dbLogin.js");
      await loginAsCompany(page, id);
      return { detail: `the console is now signed in as company ${id} (token injected from the database; no setting changed)` };
    }

    case "skip": {
      const what = String(a.step ?? "").trim();
      if (!what) throw new Error('skip needs the "step" it leaves out');
      return { detail: `deliberately left out ${what}${a.reason ? ` — ${a.reason}` : ""} (negative test)` };
    }

    case "attempt":
      return attempt(ctx, a, runInner);

    default:
      throw new Error(`generic step "${name}" has no executor`);
  }
}

async function hoverEl(page: Page, el: Locator): Promise<void> {
  await el.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
  // A disabled antd button ignores pointer events — its tooltip lives on a
  // wrapper span, so move the real mouse to the spot rather than hover() the
  // node, and if no tooltip shows, fire the hover on the wrapper as React
  // listens for it (mouseover bubbling to the root).
  const box = await el.boundingBox().catch(() => null);
  if (box) {
    // Leave first: if the pointer already sits on the element, moving "to" it
    // fires no enter event and the tooltip never opens.
    await page.mouse.move(1, 1);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  } else {
    await el.hover({ timeout: 5_000, force: true }).catch(() => {});
  }
  await page.waitForTimeout(700);
  const tip = page.locator("[role='tooltip'], .ant-tooltip:not(.ant-tooltip-hidden), .ant-popover:not(.ant-popover-hidden)").filter({ visible: true });
  if (await tip.count().catch(() => 0)) return;
  for (const target of [el, el.locator("xpath=..")]) {
    await target.dispatchEvent("mouseover").catch(() => {});
    await target.dispatchEvent("mouseenter").catch(() => {});
    await page.waitForTimeout(500);
    if (await tip.count().catch(() => 0)) return;
  }
}

/** The control a domain step presses, for "it was disabled" evidence. */
const DOMAIN_CONTROLS: Record<string, Target> = {
  publish: { role: "button", name: "Publish" },
  save_draft: { role: "button", name: "Save as draft" },
  add_line_items: { role: "button", name: "Items" },
};

async function attempt(
  ctx: GenericCtx,
  a: Record<string, unknown>,
  runInner: (inner: PlanStep) => Promise<string | undefined>,
): Promise<GenericOutcome> {
  const { page } = ctx;
  const innerName = String(a.step ?? "").trim();
  if (!innerName || innerName === "attempt" || innerName === "skip") throw new Error('attempt needs the "step" to try (not attempt or skip)');
  const innerArgs = (a.args && typeof a.args === "object" ? a.args : {}) as Record<string, unknown>;
  const because = a.because ? String(a.because) : undefined;
  const mode = String(a.expect ?? "refused").toLowerCase();
  const mark = await toastMark(page);
  const startUrl = page.url();

  // Evidence 1: the control is there but disabled — checked before pressing.
  const control = innerName === "click" ? targetOf(innerArgs) : DOMAIN_CONTROLS[innerName];
  let controlStrategy: string | undefined;
  if (control && targetWords(control).length) {
    const found = await findVisible(page, control, 15_000);
    if (!found && innerName === "click") {
      throw new Error(`could not tell: ${describe(control)} is not on screen, so the attempt could not be made — absence is not a refusal`);
    }
    if (found) {
      controlStrategy = found.strategy;
      if (await isDisabled(found.locator)) {
        let tip = "";
        if (because || mode === "refused") {
          await hoverEl(page, found.locator);
          const t = await waitForMessage(page, "tooltip", { want: because, timeoutMs: 3_000 });
          tip = t.matched ? ` — its tooltip says: ${t.matched.text}` : "";
          if (because && !t.matched) throw new Error(`${describe(control)} is disabled, but no message says "${because}"${t.seen.length ? ` (tooltip: ${t.seen.map((m) => m.text).join(" | ")})` : ""}`);
        }
        return { detail: `blocked: ${describe(control)} is disabled${tip}`, strategy: found.strategy };
      }
    }
  }

  // Evidence 3 setup: what is open before, on a ready screen.
  let overlaysBefore = 0;
  if (mode === "nothing_opens") {
    const ready = await screenReady(page, 45_000);
    if (!ready.ready) throw new Error(`could not tell: ${ready.notes.join("; ")}`);
    overlaysBefore = await openOverlays(page);
  }

  let innerErr: Error | null = null;
  let innerDetail: string | undefined;
  try {
    innerDetail = await runInner({ step: innerName, args: innerArgs });
  } catch (e) {
    innerErr = e instanceof Error ? e : new Error(String(e));
  }

  if (mode === "nothing_opens") {
    await page.waitForTimeout(2_500);
    const after = await openOverlays(page);
    if (after > overlaysBefore) {
      const title = ((await page.locator(".ant-drawer-open .ant-drawer-title, .ant-modal-title, [role='dialog'] h1, [role='dialog'] h2, [role='dialog'] h3").filter({ visible: true }).last().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      throw new Error(`the app allowed it: ${title ? `"${title.slice(0, 80)}" opened` : `${after - overlaysBefore} drawer/dialog/menu opened`} after ${innerName}`);
    }
    if (innerErr && !/disabled/i.test(innerErr.message)) throw new Error(`could not tell: the attempt itself failed (${innerErr.message.split("\n")[0]}) — that is our failure, not the app's refusal`);
    return { detail: `blocked: nothing opened after ${innerName} on a ready screen${innerDetail ? ` (${innerDetail})` : ""}`, strategy: controlStrategy };
  }

  // Evidence 0: the inner step saw the refusal itself and said so ("blocked: …" — a withdraw with no remark,
  // a price cap with no value, eventMenuSteps.ts). Its words are the evidence (27 Oct).
  const innerSaid = innerErr ? innerErr.message.split("\n")[0] : innerDetail;
  if (innerSaid?.startsWith("blocked:") && (!because || innerSaid.toLowerCase().includes(because.toLowerCase()))) {
    return { detail: innerSaid, strategy: controlStrategy ?? "the step's own check" };
  }

  // Evidence 2: a refusal message — new toast in the journal, or on screen.
  const r = await waitForMessage(page, "error", { want: because, mark, timeoutMs: 10_000 });
  if (r.matched) return { detail: `blocked: ${r.matched.text}${innerErr ? "" : " (the action ran; the app refused it)"}`, strategy: controlStrategy ? `${controlStrategy} → message ${r.matched.kind}` : `message ${r.matched.kind}` };
  if (because) {
    const any = await waitForMessage(page, "any", { want: because, mark, timeoutMs: 1_000 });
    if (any.matched) return { detail: `blocked: ${any.matched.text}`, strategy: `message ${any.matched.kind}` };
  }
  const allowed = BasePage.projectIdFromUrl(page.url()) && !BasePage.projectIdFromUrl(startUrl);
  if (allowed) throw new Error(`the app allowed it: ${innerName} went through to ${new URL(page.url()).pathname} — no refusal`);
  if (r.seen.length && because) throw new Error(`the app refused with a different message: ${r.seen.map((m) => `[${m.kind}] ${m.text}`).join(" | ")} — the case expects "${because}"`);
  if (innerErr) throw new Error(`could not tell: ${innerName} failed (${innerErr.message.split("\n")[0].slice(0, 200)}) and the app showed no refusal — that may be our own failure, so it is not counted as blocked`);
  throw new Error(`the app allowed it: ${innerName} ran${innerDetail ? ` (${innerDetail})` : ""} with no refusal message and no disabled control`);
}
