import type { Download, Locator, Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
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
import { countVisible, describe, esc, findVisible, isDisabled, norm, pattern, Target, targetFromArgs, targetWords, visibleMatches, visibleText } from "./find.js";
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
  /**
   * The screen under test is not Procol (plan.context.site): no Procol
   * pop-up is dismissed on arrival — a site's own banner may be what the
   * case clicks next.
   */
  site?: boolean;
  /** Files the browser saved during this plan, newest last (expect_download). */
  downloads: Array<{ name: string; path: string; download: Download }>;
  /** What the next browser dialog (alert/confirm/prompt) should get, armed by the dialog step. */
  armedDialog?: { action: "accept" | "dismiss"; text?: string };
  /** The last browser dialog seen, for the report. */
  lastDialog?: { type: string; message: string; action: string };
  /** The last control a click step pressed — the opener to press again when a pop-up closed what it opened. */
  lastClick?: Target;
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

/** Reads of an element that may have been re-rendered away wait this long, not Playwright's default 30s. */
const Q = { timeout: 2_500 } as const;

const bool = (v: unknown, dflt: boolean) => (v === undefined || v === null || v === "" ? dflt : !/^(false|no|0|off)$/i.test(String(v)));
const num = (v: unknown): number | undefined => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

/** Step-internal timing, printed only with UI_TRACE=1 (for finding where a step stalls). */
const trace = (() => {
  let t0 = Date.now();
  return (what: string) => {
    if (process.env.UI_TRACE !== "1") return;
    console.log(`  [trace +${Date.now() - t0}ms] ${what}`);
    t0 = Date.now();
  };
})();

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
  const tag = await el.evaluate((n) => (n as HTMLElement).tagName.toLowerCase(), undefined, Q).catch(() => "");
  const role = (await el.getAttribute("role", Q).catch(() => null)) ?? "";
  if (["input", "textarea", "select", "button", "output"].includes(tag) || ["textbox", "combobox", "switch", "checkbox", "radio", "spinbutton", "button", "listbox"].includes(role)) return el;
  const cls = (await el.getAttribute("class", Q).catch(() => "")) ?? "";
  if (/ant-select|ant-switch|ant-checkbox|ant-radio-group|ant-picker/.test(cls)) return el;
  // A <label for>: its control. A label wrapping a control: that control.
  const forId = tag === "label" ? await el.getAttribute("for", Q).catch(() => null) : null;
  if (forId) {
    const target = el.page().locator(`[id="${forId}"]`).first();
    if (await target.count().catch(() => 0)) return target;
  }
  const wrapped = el.locator("input:not([type='hidden']), textarea, select, [role='combobox'], [role='switch'], [role='checkbox'], [role='radio'], .ant-select, .ant-checkbox, .ant-switch").first();
  if (await wrapped.count().catch(() => 0)) return wrapped;
  // The nearest block that holds a field — and in it, the first field AFTER
  // the words in reading order (the words label what follows them, not the
  // quantity select three fields up).
  const holder = el.locator(
    "xpath=ancestor::*[.//input or .//textarea or .//select or .//*[contains(@class,'ant-select')] or .//*[@role='switch'] or .//*[@role='radio'] or .//*[@role='combobox'] or .//*[contains(@class,'ant-radio-group')]][1]",
  );
  const after = el.locator("xpath=following::*[(self::input and not(@type='hidden')) or self::textarea or self::select or @role='combobox' or @role='switch' or @role='radiogroup' or @role='group' or contains(@class,'ant-select') or contains(@class,'ant-radio-group') or contains(@class,'ant-checkbox')][1]");
  if (await after.count().catch(() => 0)) {
    const inHolder = await after.evaluate((n, h) => !!h && h.contains(n), await holder.elementHandle({ timeout: 2_500 }).catch(() => null)).catch(() => false);
    if (inHolder) return after;
  }
  const inside = holder.locator("input:not([type='hidden']), textarea, select, .ant-select, [role='switch'], .ant-radio-group, [role='radiogroup'], .ant-checkbox").first();
  if (await inside.count().catch(() => 0)) return inside;
  return el;
}

/** A date format a text field asks for ("DD/MM/YY", "MM-DD-YYYY", "YYYY.MM.DD") in its placeholder, its description or the words beside it. */
async function dateFormatHint(f: Locator): Promise<string | null> {
  const hint = await f
    .evaluate((n) => {
      const e = n as HTMLInputElement;
      const described = (e.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      let around = "";
      let up: HTMLElement | null = e;
      for (let i = 0; i < 3 && up; i++) {
        up = up.parentElement;
        if (up && (up.innerText ?? "").length < 400) around = up.innerText ?? "";
      }
      return [e.placeholder ?? "", e.title ?? "", described, around].join(" ¦ ");
    })
    .catch(() => "");
  const m = hint.match(/\b(DD?[\/.\-]MM?[\/.\-]Y{2,4}|MM?[\/.\-]DD?[\/.\-]Y{2,4}|Y{4}[\/.\-]MM?[\/.\-]DD?)\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** "March 5, 2027", "5 March 2027", "2027-03-05" → a date, or null. */
function parseDateWords(v: string): Date | null {
  const t = Date.parse(v);
  if (Number.isNaN(t)) {
    // "5 March 2027" is not parsed by every engine: swap to "March 5 2027".
    const m = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (!m) return null;
    const t2 = Date.parse(`${m[2]} ${m[1]} ${m[3]}`);
    return Number.isNaN(t2) ? null : new Date(t2);
  }
  return new Date(t);
}

function formatDate(d: Date, fmt: string): string {
  const dd = String(d.getDate());
  const mm = String(d.getMonth() + 1);
  const yyyy = String(d.getFullYear());
  return fmt
    .replace(/DD/, dd.padStart(2, "0")).replace(/D/, dd)
    .replace(/MM/, mm.padStart(2, "0")).replace(/M/, mm)
    .replace(/YYYY/, yyyy).replace(/YY/, yyyy.slice(2));
}

/**
 * Click a form control the way a person does: a visually hidden checkbox or
 * radio (a styled box or swatch in its place) is reached through its label.
 */
async function clickControl(ctx: GenericCtx, field: Locator, words = ""): Promise<void> {
  const { page } = ctx;
  const box = await field.boundingBox().catch(() => null);
  const visible = await field.isVisible().catch(() => false);
  if (visible && box && box.width >= 8 && box.height >= 8) {
    await clickHard(ctx, field, 8_000);
    return;
  }
  const id = await field.getAttribute("id", Q).catch(() => null);
  const byFor = id ? page.locator(`label[for="${id}"]`).filter({ visible: true }).first() : null;
  if (byFor && (await byFor.count().catch(() => 0))) {
    await byFor.click({ timeout: 8_000 });
    return;
  }
  const wrapping = field.locator("xpath=ancestor::label[1]");
  if (await wrapping.count().catch(() => 0)) {
    await wrapping.first().click({ timeout: 8_000 });
    return;
  }
  const sibling = field.locator("xpath=following-sibling::*[1] | ../following-sibling::*[1]").filter({ visible: true }).first();
  if (words && (await sibling.count().catch(() => 0)) && pattern(words).test((await sibling.innerText(Q).catch(() => "")) ?? "")) {
    await sibling.click({ timeout: 8_000 });
    return;
  }
  await field.click({ timeout: 8_000, force: true });
}

/** The name a person knows a field by: its aria-label, its <label>, or the words just before it. */
async function accessibleName(f: Locator): Promise<string> {
  return f
    .evaluate((n) => {
      const e = n as HTMLElement;
      const byId = e.id ? document.querySelector(`label[for="${e.id}"]`)?.textContent : "";
      const labelled = (e.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      const wrapping = e.closest("label")?.textContent ?? "";
      const before = e.previousElementSibling?.textContent ?? e.parentElement?.previousElementSibling?.textContent ?? "";
      return [e.getAttribute("aria-label") ?? "", byId ?? "", labelled, wrapping, before].join(" | ");
    }, undefined, Q)
    .catch(() => "");
}

/** What kind of field this is, for fill: text (typeable), select, range, picker (read-only, opens one), check, button, other. */
async function fieldKind(f: Locator): Promise<string> {
  return f
    .evaluate((n) => {
      const e = n as HTMLElement;
      const tag = e.tagName.toLowerCase();
      const role = e.getAttribute("role") ?? "";
      if (tag === "select" || role === "listbox") return "select";
      if (tag === "output") return "output";
      if (tag === "textarea" || e.isContentEditable) return "text";
      if (tag === "input") {
        const type = ((e as HTMLInputElement).type || "text").toLowerCase();
        if (["checkbox", "radio"].includes(type)) return "check";
        if (["button", "submit", "reset", "image", "file", "hidden"].includes(type)) return "button";
        if (type === "range") return "range";
        if ((e as HTMLInputElement).readOnly && role === "spinbutton") return "spin";
        if ((e as HTMLInputElement).readOnly && (e.getAttribute("aria-haspopup") || /date|time|calendar|picker/i.test(e.className + " " + (e.getAttribute("placeholder") ?? "")))) return "picker";
        return "text";
      }
      if (role === "spinbutton") return e.isContentEditable || tag === "input" ? "text" : "spin";
      if (role === "textbox" || role === "searchbox") return "text";
      if (role === "combobox") return e.querySelector("input") ? "text" : "select";
      if (/ant-select/.test(e.className)) return "select";
      if (/ant-picker/.test(e.className)) return "picker";
      if (tag === "button" || role === "button" || tag === "a") return "button";
      return "other";
    })
    .catch(() => "other");
}

/** What a field currently shows, however it is built. */
async function fieldValue(f: Locator): Promise<string> {
  const tag = await f.evaluate((n) => (n as HTMLElement).tagName.toLowerCase(), undefined, Q).catch(() => "");
  const cls = (await f.getAttribute("class", Q).catch(() => "")) ?? "";
  if (tag === "select") return f.evaluate((n) => (n as HTMLSelectElement).selectedOptions[0]?.textContent ?? "", undefined, Q).catch(() => "");
  if (tag === "input" || tag === "textarea") {
    const type = (await f.getAttribute("type", Q).catch(() => "")) ?? "";
    if (/checkbox|radio/.test(type)) return (await f.isChecked(Q).catch(() => false)) ? "checked" : "unchecked";
    const v = await f.inputValue(Q).catch(() => "");
    if (v) return v;
    // antd select search inputs are empty; read the select around them.
    const sel = f.locator("xpath=ancestor::*[contains(@class,'ant-select')][1]");
    if (await sel.count().catch(() => 0)) return fieldValue(sel.first());
    return "";
  }
  if (/ant-select/.test(cls)) {
    const shown = f.locator(".ant-select-selection-selected-value, .ant-select-selection-item, .ant-select-selection__choice__content, .ant-select-selection-item-content").first();
    if (await shown.count().catch(() => 0)) return ((await shown.innerText(Q).catch(() => "")) || (await shown.getAttribute("title", Q).catch(() => "")) || "").trim();
    return ((await f.innerText(Q).catch(() => "")) || "").trim();
  }
  if (/ant-radio-group/.test(cls) || (await f.getAttribute("role", Q).catch(() => "")) === "radiogroup") {
    const checked = f.locator(".ant-radio-wrapper-checked, .ant-radio-button-wrapper-checked, [role='radio'][aria-checked='true']").first();
    return ((await checked.innerText(Q).catch(() => "")) || "").trim();
  }
  const role = await f.getAttribute("role", Q).catch(() => "");
  if (role === "switch" || /ant-switch|ant-checkbox/.test(cls)) return (await isOn(f)) ? "on" : "off";
  return ((await f.innerText(Q).catch(() => "")) || "").trim();
}

async function isOn(f: Locator): Promise<boolean> {
  const aria = await f.getAttribute("aria-checked", Q).catch(() => null);
  if (aria === "true") return true;
  if (aria === "false") return false;
  const cls = (await f.getAttribute("class", Q).catch(() => "")) ?? "";
  if (/ant-switch-checked|ant-checkbox-checked|ant-checkbox-wrapper-checked/.test(cls)) return true;
  const input = f.locator("input[type='checkbox']").first();
  if (await input.count().catch(() => 0)) return input.isChecked(Q).catch(() => false);
  return f.isChecked(Q).catch(() => false);
}

/** Overlays that count as "something opened". */
async function openOverlays(page: Page): Promise<number> {
  return page
    .locator(".ant-drawer-open, .ant-modal-wrap:not([style*='display: none']) .ant-modal, [role='dialog'], .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden)")
    .filter({ visible: true })
    .count()
    .catch(() => 0);
}

/**
 * Click an element that Playwright will not click: one re-created on every
 * render never counts as "stable". If the element is on top at its own centre
 * (what a person sees is what they would press), press there with the mouse.
 */
async function clickHard(ctx: GenericCtx, el: Locator, timeoutMs = 3_000): Promise<string> {
  const { page } = ctx;
  try {
    await el.click({ timeout: timeoutMs });
    return "clicked";
  } catch (e) {
    const box = await el.boundingBox().catch(() => null);
    trace(`clickHard: ${String((e as Error).message).split("\n")[0].slice(0, 80)}; box=${JSON.stringify(box)}; matches=${await el.count().catch(() => -1)}`);
    if (!box) throw e;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // A veil that flickers over the control, or a control re-created every frame: watch the point
    // until the control itself is on top there, then press at once.
    let onTop = false;
    let covering = "";
    for (let i = 0; i < 40 && !onTop; i++) {
      const seen = await el
        .evaluate((n, pt) => {
          const top = document.elementFromPoint(pt.x, pt.y);
          const ok = !!top && (top === n || n.contains(top) || top.contains(n));
          return { ok, top: top ? `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ""}${top.className ? `.${String(top.className).split(" ")[0]}` : ""}` : "nothing" };
        }, { x, y }, Q)
        .catch(() => ({ ok: false, top: "?" }));
      onTop = seen.ok;
      covering = seen.top;
      if (!onTop) await page.waitForTimeout(100);
    }
    trace(`clickHard: onTop=${onTop} (${covering})`);
    if (onTop) {
      await page.mouse.click(x, y);
      return `pressed with the mouse (${covering === "?" ? "it kept re-rendering" : "it was briefly covered"})`;
    }
    // A stray backdrop/veil over the control (not a dialog with content): a keyboard user gets past it —
    // focus the control and press Enter, as they would.
    const backdropLike = /back|overlay|veil|mask|scrim|backdrop|shade|dim/i.test(covering) || covering === "nothing";
    const coverText = await page
      .evaluate((pt) => {
        const top = document.elementFromPoint(pt.x, pt.y) as HTMLElement | null;
        return top ? (top.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200) : "";
      }, { x, y })
      .catch(() => "?");
    trace(`clickHard: cover reads "${coverText}"`);
    const coverHasText = coverText.length > 0;
    if (coverHasText) {
      // A pop-up with something to say ("Insider deal … Maybe later"): a person closes it and carries on.
      const closed = await declineDialog(page);
      if (closed) {
        let reopened = "";
        if (!(await el.isVisible().catch(() => false)) && ctx.lastClick) {
          // Closing the pop-up also closed the popover the control lived in: open it again as before.
          const opener = await findVisible(page, ctx.lastClick, 3_000);
          if (opener) {
            await opener.locator.click({ timeout: 3_000 }).catch(() => {});
            await page.waitForTimeout(400);
            reopened = ` and pressing ${describe(ctx.lastClick)} again`;
          }
        }
        trace(`clickHard: ${closed}${reopened}; control visible=${await el.isVisible().catch(() => false)}`);
        await el.click({ timeout: timeoutMs });
        return `clicked after ${closed}${reopened}`;
      }
    }
    if (backdropLike && !coverHasText) {
      const tag = await el.evaluate((n) => (n as HTMLElement).tagName.toLowerCase(), undefined, Q).catch(() => "");
      await el.focus({ timeout: 2_000 });
      await page.keyboard.press(tag === "a" ? "Enter" : "Space");
      return `activated by keyboard (an empty ${covering} lay over it)`;
    }
    throw new Error(`${String((e as Error).message).split("\n")[0]} — ${covering} stays over it`);
  }
}

/** Styles that make an element unclickable without disabling it. */
async function ignoresPointer(el: Locator): Promise<boolean> {
  return el
    .evaluate((n) => {
      let e: HTMLElement | null = n as HTMLElement;
      while (e) {
        if (getComputedStyle(e).pointerEvents === "none") return true;
        e = e.parentElement;
      }
      return false;
    })
    .catch(() => false);
}

/**
 * Click a target: find → (disabled? fail) → click → on a covered or inert
 * match try the next one → retry once after dismissing pop-ups → healer.
 *
 * The screen is looked at BEFORE any pop-up is dismissed: a cookie banner's
 * own "Accept all" is a thing a case clicks, and dismissing it first would
 * remove the very control the step names.
 */
async function clickTarget(ctx: GenericCtx, t: Target, timeoutMs: number): Promise<GenericOutcome> {
  const { page } = ctx;
  requireWords(t, "click");
  // Procol's own pop-ups and confirmations, never on another site (the bench).
  if (!ctx.site) {
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
  }
  let found = await findVisible(page, t, Math.min(timeoutMs, 4_000));
  if (!found && !ctx.site) {
    await ctx.events.dismissDistractions().catch(() => false);
    found = await findVisible(page, t, Math.min(timeoutMs, 4_000));
  }
  if (!found) {
    // Not on the screen as it stands: a person scrolls — the row may be
    // further down a long page or a list that fills in as it scrolls.
    found = await scrollUntil(ctx, t, {}, Math.max(timeoutMs - 4_000, 5_000), false)
      .then(() => findVisible(page, t, 2_000))
      .catch(() => null);
  }
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
  let matches = await visibleMatches(found);
  if (/^(visible text|title attribute)/.test(found.strategy)) {
    // A styled radio or checkbox: the real input is hidden just before the words.
    const hiddenInput = found.locator.locator("xpath=(preceding-sibling::input[@type='radio' or @type='checkbox'][1] | ../preceding-sibling::input[@type='radio' or @type='checkbox'][1] | ancestor::label[1]//input[@type='radio' or @type='checkbox'])[1]");
    if (await hiddenInput.count().catch(() => 0)) {
      if (await isDisabled(hiddenInput)) throw new Error(`${describe(t)} is on screen but DISABLED — use attempt{step:"click"} if the case expects that`);
      await clickControl(ctx, hiddenInput, targetWords(t)[0]);
      await page.waitForTimeout(400);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      return { detail: `clicked ${describe(t)} (the radio/checkbox it labels)`, strategy: `${found.strategy} → its radio/checkbox` };
    }
    const resolved = await controlNear(page, found.locator, targetWords(t)[0]);
    if (resolved === "ambiguous") throw new Error(`"${targetWords(t)[0]}" is a label with several controls around it — name the control itself (role + name)`);
    if (resolved) {
      found.locator = resolved;
      matches = [resolved];
      strategy = `${found.strategy} → the control beside it`;
    }
  }
  if (!matches.length) matches = [found.locator];
  // "Harbor Books" among "Harbor Books Ltd" and "Harbor Books": the match that
  // reads EXACTLY as the words comes first; a longer name is a different thing.
  if (matches.length > 1) {
    const want = norm(targetWords(t)[0] ?? "");
    const names = await Promise.all(matches.map((m) => m.evaluate((n) => ((n as HTMLElement).getAttribute("aria-label") || (n as HTMLElement).innerText || n.textContent || "")).catch(() => "")));
    const exact = matches.filter((_, i) => norm(names[i]) === want);
    if (exact.length && exact.length < matches.length) matches = [...exact, ...matches.filter((_, i) => norm(names[i]) !== want)];
  }
  // The same words in the page chrome (menu bar, footer) and in the content:
  // a person means the content unless told otherwise — "Business" on a
  // pricing page is the plans tab, not the top menu's "Business ▾".
  if (matches.length > 1 && !t.within) {
    // An OPEN menu or dialog outranks everything (the item under the menu a
    // hover just opened), then the content, then the page chrome.
    const where = await Promise.all(
      matches.map((m) =>
        m
          .evaluate((n) => {
            const e = n as HTMLElement;
            if (e.closest("[role='menu'], [role='listbox'], [role='dialog'], [role='alertdialog'], .ant-dropdown, .ant-select-dropdown, .ant-modal, .ant-drawer")) return 0;
            // The panel of the tab that is open: what the person is looking at.
            if (e.closest("[role='tabpanel'], .ant-tabs-tabpane-active")) return 0.5;
            if (e.closest("nav, header, footer, [role='navigation'], [role='banner'], [role='contentinfo']")) return 2;
            return 1;
          })
          .catch(() => 1),
      ),
    );
    if (new Set(where).size > 1) matches = matches.map((m, i) => ({ m, w: where[i], i })).sort((x, y) => x.w - y.w || x.i - y.i).map((x) => x.m);
  }
  // Several matches: the first that can take a click. A match that is
  // disabled, inert (pointer-events none) or covered is skipped for the
  // next; only when none works is the failure reported.
  const skipped: string[] = [];
  let lastErr: Error | null = null;
  for (const [i, el] of matches.entries()) {
    if (await isDisabled(el)) {
      if (matches.length === 1) throw new Error(`${describe(t)} is on screen but DISABLED — use attempt{step:"click"} if the case expects that`);
      skipped.push(`#${i + 1} disabled`);
      continue;
    }
    if (await ignoresPointer(el)) {
      skipped.push(`#${i + 1} ignores the pointer`);
      continue;
    }
    try {
      await el.click({ timeout: matches.length > 1 ? 4_000 : Math.max(10_000, timeoutMs) });
      lastErr = null;
      ctx.lastClick = t;
      noteSeen(targetWords(t)[0], page.url(), strategy);
      await page.waitForTimeout(400);
      const which = matches.length > 1 ? ` (match ${i + 1} of ${matches.length}${skipped.length ? `; skipped ${skipped.join(", ")}` : ""})` : "";
      return { detail: `clicked ${describe(t)}${which}`, strategy };
    } catch (e) {
      lastErr = e as Error;
      const msg = String((e as Error).message);
      if (/intercepts pointer events|not receive pointer events|outside of the viewport|Timeout/i.test(msg)) {
        // On top at its own centre but never "stable" (re-rendered every frame): press there.
        const hard = await clickHard(ctx, el, 500).catch(() => "");
        if (hard) {
          noteSeen(targetWords(t)[0], page.url(), strategy);
          await page.waitForTimeout(400);
          return { detail: `clicked ${describe(t)} (${hard})`, strategy };
        }
        skipped.push(`#${i + 1} covered`);
        continue;
      }
      throw e;
    }
  }
  // Every match was covered or inert: something is over them — an open menu
  // left by a hover, a dialog with a "No thanks", a Procol pop-up. Close it
  // as a person would and try once more.
  const closed = await closeCover(ctx);
  if (closed) {
    const again = await findVisible(page, t, 5_000);
    const el = again?.locator ?? found.locator;
    await el.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
    await el.click({ timeout: 8_000 });
    await page.waitForTimeout(400);
    return { detail: `clicked ${describe(t)} (after ${closed})`, strategy };
  }
  if (skipped.length && skipped.every((x) => /disabled/.test(x))) throw new Error(`every ${describe(t)} on screen is DISABLED (${matches.length} found)`);
  throw new Error(`${describe(t)} could not be clicked: ${skipped.join(", ") || lastErr?.message.split("\n")[0]}`);
}

/** The declining half of a pop-up: what a person presses to get it out of the way. */
const DECLINE = /^(no,? thanks?|not now|maybe later|later|dismiss|close|skip|got it|reject( all| non-essential)?|decline|only necessary|continue without|×|✕|x)$/i;

/**
 * Close whatever covers the screen: an open menu (Escape, pointer away), a
 * dialog with a declining button, a Procol pop-up. Says what it closed.
 */
async function closeCover(ctx: GenericCtx): Promise<string> {
  const { page } = ctx;
  const declined = await declineDialog(page);
  if (declined) return declined;
  const menus = page.locator("[role='menu'], .ant-dropdown:not(.ant-dropdown-hidden)").filter({ visible: true });
  if (await menus.count().catch(() => 0)) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.move(2, 2).catch(() => {});
    await page.waitForTimeout(400);
    if (!(await menus.count().catch(() => 0))) return "closing the open menu";
  }
  if (!ctx.site && (await ctx.events.dismissDistractions().catch(() => false))) return "dismissing a pop-up";
  return "";
}

/** A pop-up with a declining button ("No thanks", "Maybe later", "Close"): press it. Says what was pressed. */
async function declineDialog(page: Page): Promise<string> {
  const dialogs = page.locator("[role='dialog'], [role='alertdialog'], [class*='modal' i], [class*='popup' i], [class*='banner' i], [class*='overlay' i], [class*='toast' i], [class*='cookie' i]").filter({ visible: true });
  const n = await dialogs.count().catch(() => 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = dialogs.nth(i);
    const btn = d.locator("button, [role='button'], a").filter({ hasText: DECLINE }).filter({ visible: true }).first();
    const labelled = d.locator("button[aria-label], [role='button'][aria-label]").filter({ visible: true });
    let pick = (await btn.count().catch(() => 0)) ? btn : null;
    if (!pick) {
      const m = await labelled.count().catch(() => 0);
      for (let k = 0; k < m && !pick; k++) if (DECLINE.test(((await labelled.nth(k).getAttribute("aria-label").catch(() => "")) ?? "").trim())) pick = labelled.nth(k);
    }
    if (pick) {
      const name = ((await pick.innerText().catch(() => "")) || (await pick.getAttribute("aria-label").catch(() => "")) || "close").trim();
      await pick.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(400);
      return `closing the pop-up with "${name}"`;
    }
  }
  return "";
}

const INTERACTIVE =
  "button, [role='button'], a[href], [role='tab'], [role='menuitem'], [role='option'], [role='switch'], [role='checkbox'], [role='radio'], input, select, textarea, summary, .ant-dropdown-trigger, .ant-select, .ant-btn";

/**
 * For an element found by its text: null when it is (inside) a control, a
 * <label> (clicking it reaches its field) or looks clickable itself; else
 * the single visible control within three ancestors of it — or, among
 * several, the one named by the same words; "ambiguous" otherwise.
 */
async function controlNear(page: Page, el: Locator, words = ""): Promise<Locator | null | "ambiguous"> {
  const verdict = await el
    .evaluate(
      (node, { sel, words }) => {
        const e = node as HTMLElement;
        if (e.closest(sel) || e.closest("label") || e.closest("[onclick], [tabindex]") || getComputedStyle(e).cursor === "pointer") return "self";
        document.querySelectorAll("[data-qa-generic-target]").forEach((x) => x.removeAttribute("data-qa-generic-target"));
        // No helper functions in here: the bundler names them with a helper the page does not have.
        const w = words.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        let up: HTMLElement | null = e;
        for (let i = 0; i < 3 && up?.parentElement; i++) {
          up = up.parentElement;
          const near = Array.from(up.querySelectorAll<HTMLElement>(sel)).filter((v) => v.offsetParent !== null && !v.closest("[aria-hidden='true']"));
          if (near.length === 1) {
            near[0].setAttribute("data-qa-generic-target", "1");
            return "near";
          }
          if (near.length > 1) {
            const nameOf = (v: HTMLElement) => `${v.textContent ?? ""} ${v.getAttribute("aria-label") ?? ""} ${(v as HTMLInputElement).value ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            // The control that reads exactly as the words, else the one that starts with them, else the one that contains them.
            const exact = w ? near.filter((v) => (v.textContent ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === w || (v.getAttribute("aria-label") ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === w) : [];
            const starts = w ? near.filter((v) => nameOf(v).startsWith(w)) : [];
            const same = w ? near.filter((v) => nameOf(v).includes(w)) : [];
            const pick = exact.length === 1 ? exact : starts.length === 1 ? starts : same.length === 1 ? same : [];
            if (pick.length === 1) {
              pick[0].setAttribute("data-qa-generic-target", "1");
              return "near";
            }
            return "ambiguous";
          }
        }
        return "none";
      },
      { sel: INTERACTIVE, words },
    )
    .catch(() => "self");
  if (verdict === "near") return page.locator("[data-qa-generic-target='1']").first();
  if (verdict === "ambiguous") return "ambiguous";
  return null;
}

/**
 * Move the plan to another tab of the same browser: the newest one (default),
 * or the one whose title/URL contains `title`/`url`. Later steps run there.
 */
async function switchTab(ctx: GenericCtx, a: Record<string, unknown>): Promise<GenericOutcome> {
  const { page } = ctx;
  const context = page.context();
  const wantTitle = a.title ? String(a.title) : a.name ? String(a.name) : "";
  const wantUrl = a.url ? String(a.url) : "";
  const deadline = Date.now() + 15_000;
  let target: Page | null = null;
  do {
    const pages = context.pages().filter((p) => !p.isClosed());
    const others = pages.filter((p) => p !== page);
    if (wantTitle || wantUrl) {
      for (const p of pages) {
        const title = await p.title().catch(() => "");
        if ((wantTitle && pattern(wantTitle).test(title)) || (wantUrl && p.url().includes(wantUrl))) target = p;
      }
    } else if (others.length) target = others[others.length - 1];
    if (!target) await page.waitForTimeout(300);
  } while (!target && Date.now() < deadline);
  if (!target) throw new Error(`no ${wantTitle ? `tab titled "${wantTitle}"` : wantUrl ? `tab at "${wantUrl}"` : "other tab"} opened within 15s (the browser has ${context.pages().length} tab(s))`);
  await target.bringToFront().catch(() => {});
  await target.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  ctx.page = target;
  trackRequests(target);
  let where = "";
  try {
    const u = new URL(target.url());
    where = u.pathname + u.search + u.hash;
  } catch {
    where = target.url();
  }
  return { detail: `now on the tab at ${where}${(await target.title().catch(() => "")) ? ` ("${await target.title()}")` : ""}`, strategy: "browser tab" };
}

/** A file the plan may upload: a fixture by name, or a file fetched from the app's own host / a URL. */
async function uploadSource(file: string, pageUrl: string): Promise<{ path: string; name: string }> {
  const fixture = join(FIXTURES, basename(file));
  if (!/[/:]/.test(file) && existsSync(fixture)) return { path: fixture, name: basename(file) };
  // Next to the page first (as a link on it would resolve), then the site root.
  const rel = file.replace(/^\/?(public\/)?/, "");
  const urls = /^https?:\/\//.test(file) ? [file] : [new URL(rel, pageUrl).href];
  if (!/^https?:\/\//.test(file)) {
    // Beside the page, then each directory above it, then the site root.
    let dir = new URL(".", pageUrl).href;
    for (let i = 0; i < 4 && /\/[^/]+\/$/.test(new URL(dir).pathname); i++) {
      dir = new URL("..", dir).href;
      urls.push(new URL(rel, dir).href);
    }
    urls.push(`${CONFIG.appUrl.replace(/\/$/, "")}/${rel}`);
  }
  let res: Response | null = null;
  for (const url of urls) {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (res?.ok) break;
  }
  if (!res?.ok) throw new Error(`upload: ${urls.join(" and ")} answered ${res ? res.status : "nothing"} — no fixture "${basename(file)}" either (available: sample.pdf, sample.png, sample.csv, sample.txt)`);
  const dir = mkdtempSync(join(tmpdir(), "spine-upload-"));
  const path = join(dir, basename(file));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return { path, name: basename(file) };
}

/** Money or a plain number in a text: the first amount, as a number. */
function amountIn(text: string, measure: RegExp): number {
  const m = text.match(measure);
  if (!m) return Number.NaN;
  const raw = (m[1] ?? m[0]).replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  return Number(raw.replace(/,/, "."));
}

/**
 * Read a number off every candidate block (a price, a rating, hours of
 * battery), pick the lowest or highest, and press the control in that
 * block: "add the cheapest pack", "open the longest-lasting model",
 * "click the cheapest result that is not Sponsored".
 */
async function chooseByNumber(ctx: GenericCtx, a: Record<string, unknown>, timeoutMs: number): Promise<GenericOutcome> {
  const { page } = ctx;
  const by = /high|most|large|long|max|great|big|expens/i.test(String(a.by ?? "lowest")) ? "highest" : "lowest";
  const measureArg = String(a.measure ?? "price");
  const measure =
    measureArg === "price"
      ? /(?:[$€£₹]|USD|EUR|GBP|INR)\s?(\d[\d,]*(?:\.\d+)?)/
      : measureArg === "number"
        ? /(-?\d[\d,]*(?:\.\d+)?)/
        : new RegExp(measureArg, "i");
  const exclude = a.exclude ? pattern(String(a.exclude)) : null;
  // "Among the Voltpine AA packs": only blocks naming that, as whole words — "AA" is not "AAA".
  const only = a.only ? new RegExp(`(?<![A-Za-z0-9])${pattern(String(a.only)).source}(?![A-Za-z0-9])`, "i") : null;
  const scopeText = a.within ? String(a.within) : "";
  // The blocks to compare: rows, cards, list items, articles — each with its own amount.
  const root = scopeText ? ((await findVisible(page, { text: scopeText }, 5_000))?.locator.locator("xpath=ancestor-or-self::*[.//button or .//a][1]") ?? page) : page;
  const blocks = (root as Locator | Page).locator("tr, li, article, [role='row'], [role='listitem'], [role='article'], [class*='card' i], [class*='item' i], [class*='result' i], [class*='product' i], [class*='row' i], [class*='option' i], [class*='pack' i], label").filter({ visible: true });
  const deadline = Date.now() + timeoutMs;
  let scored: Array<{ i: number; n: number; text: string; len: number }> = [];
  const CHROME = "aside, nav, header, footer, form, [role='complementary'], [role='navigation'], [role='banner'], [role='contentinfo']";
  do {
    scored = [];
    // Every block's text and whether it sits in the page chrome, in one trip (a results page has hundreds of blocks).
    const infos = await blocks
      .evaluateAll((els, sel) => els.map((e) => ({ text: ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").trim(), chrome: !!(e as HTMLElement).closest(sel) })), CHROME)
      .catch(() => [] as Array<{ text: string; chrome: boolean }>);
    for (const [i, info] of infos.entries()) {
      const text = info.text;
      if (!text || info.chrome || (exclude && exclude.test(text)) || (only && !only.test(text))) continue;
      // Not a filter ("$25 to $50", "Under $25"): a thing with its own single amount.
      if (measureArg === "price" && /\b(under|over|up to|to|-|–)\s*[$€£₹]?\s*\d/i.test(text) && (text.match(/[$€£₹]\s?\d/g) ?? []).length > 1 && text.length < 40) continue;
      const n = amountIn(text, measure);
      if (Number.isFinite(n)) scored.push({ i, n, text, len: text.length });
    }
    if (scored.length >= 2) break;
    await page.waitForTimeout(400);
  } while (Date.now() < deadline);
  if (!scored.length) throw new Error(`no block on screen shows a ${measureArg === "price" ? "price" : measureArg} to compare${only ? ` among those naming "${a.only}"` : ""}${exclude ? ` (after leaving out "${a.exclude}")` : ""}`);
  // Nested blocks (a card inside a list item) repeat the same amount: keep the innermost of each.
  const innermostOf = (list: typeof scored) => list.filter((s) => !list.some((o) => o !== s && o.len < s.len && s.text.includes(o.text)));
  let innermost = innermostOf(scored).map((s) => ({ ...s, pageNo: 0 }));
  // A paged list ("Showing 1-5 of 9", a Next button): the best may be on a later page. Read them all, then return to the winner's page.
  const nextBtn = () => page.getByRole("button", { name: /^(next|next page|›|»|>)$/i }).or(page.getByRole("link", { name: /^(next|next page|›|»)$/i })).or(page.locator("[aria-label='Next page'], [aria-label='Next']")).filter({ visible: true }).first();
  const prevBtn = () => page.getByRole("button", { name: /^(previous|prev|previous page|‹|«|<)$/i }).or(page.getByRole("link", { name: /^(previous|prev|previous page|‹|«)$/i })).or(page.locator("[aria-label='Previous page'], [aria-label='Previous']")).filter({ visible: true }).first();
  let pages = 0;
  if (!scopeText) {
    while (pages < 12 && (await nextBtn().count().catch(() => 0)) && !(await isDisabled(nextBtn()))) {
      await nextBtn().click({ timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(500);
      pages++;
      const infos = await blocks
        .evaluateAll((els, sel) => els.map((e) => ({ text: ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").trim(), chrome: !!(e as HTMLElement).closest(sel) })), CHROME)
        .catch(() => [] as Array<{ text: string; chrome: boolean }>);
      const here: typeof scored = [];
      for (const [i, info] of infos.entries()) {
        const text = info.text;
        if (!text || info.chrome || (exclude && exclude.test(text)) || (only && !only.test(text))) continue;
        const n = amountIn(text, measure);
        if (Number.isFinite(n)) here.push({ i, n, text, len: text.length });
      }
      const fresh = innermostOf(here).filter((h) => !innermost.some((s) => s.text === h.text));
      if (!fresh.length) break; // the same page again: no real pagination
      innermost.push(...fresh.map((s) => ({ ...s, pageNo: pages })));
    }
  }
  innermost.sort((x, y) => (by === "lowest" ? x.n - y.n : y.n - x.n));
  const best = innermost[0];
  const tie = innermost.filter((s) => s.n === best.n);
  if (pages && best.pageNo !== pages) {
    // Back to the winner's page: Previous until there.
    for (let p = pages; p > best.pageNo; p--) {
      await prevBtn().click({ timeout: 4_000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  // The winning block, found again by its text (the page may have re-rendered): the SMALLEST block
  // holding it, so a list that contains every review is not mistaken for the one review.
  let block = blocks.nth(best.i);
  if (pages) {
    const again = blocks.filter({ hasText: best.text.slice(0, 60) });
    const m = await again.count().catch(() => 0);
    let bestLen = Number.POSITIVE_INFINITY;
    for (let i = 0; i < Math.min(m, 30); i++) {
      const len = ((await again.nth(i).innerText().catch(() => "")) || "").length;
      if (len && len < bestLen) {
        bestLen = len;
        block = again.nth(i);
      }
    }
  }
  const t = targetOf({ ...a, within: undefined, by: undefined, measure: undefined, exclude: undefined, only: undefined });
  let control: Locator;
  if (targetWords(t).length) {
    const named = t.role ? block.getByRole(t.role as any, { name: pattern(targetWords(t)[0]) }) : block.getByText(pattern(targetWords(t)[0]));
    if (!(await named.filter({ visible: true }).count().catch(() => 0))) throw new Error(`the ${by} block (${best.text.slice(0, 80)}) has no ${describe(t)} to press`);
    control = named.filter({ visible: true }).first();
  } else {
    const firstControl = block.locator("a[href], button, [role='button'], [role='link'], h1 a, h2 a, h3 a").filter({ visible: true }).first();
    if (!(await firstControl.count().catch(() => 0))) throw new Error(`the ${by} block (${best.text.slice(0, 80)}) has nothing to press — name the control (role + name)`);
    control = firstControl;
  }
  await control.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
  await control.click({ timeout: 8_000 });
  await page.waitForTimeout(400);
  return {
    detail: `${by} ${measureArg === "price" ? "price" : measureArg} ${best.n} of ${innermost.length}${pages ? ` across ${pages + 1} pages` : ""} (${innermost.map((s) => s.n).join(", ")})${tie.length > 1 ? ` — ${tie.length} tie; took the first` : ""}: pressed ${targetWords(t)[0] ?? "its control"} in "${best.text.slice(0, 90)}"`,
    strategy: "compared the blocks' numbers",
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Pick a date in a calendar: open the field's picker, bring the month into
 * view with the picker's own month/year controls, press the day. Days are
 * found by their accessible name ("12 December 2026", "December 12, 2026")
 * or by their number inside the month's block.
 */
async function pickDate(ctx: GenericCtx, a: Record<string, unknown>, timeoutMs: number): Promise<GenericOutcome> {
  const { page } = ctx;
  const dateStr = String(a.date ?? a.value ?? "").trim();
  const d = parseDateWords(dateStr);
  if (!d) throw new Error(`pick_date: "${dateStr}" is not a date I can read (use "12 December 2026" or 2026-12-12)`);
  const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target, text: undefined, date: undefined });
  let opened = "";
  if (targetWords(t).length) {
    const found = await findVisible(page, t, timeoutMs);
    if (!found) throw new Error(`no date field ${describe(t)} on screen`);
    const field = await fieldFor(found.locator);
    const kind = await fieldKind(field);
    if (kind === "text") {
      // A plain date input: type it.
      const type = ((await field.getAttribute("type").catch(() => "")) ?? "").toLowerCase();
      if (type === "date") {
        await field.fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        return { detail: `${describe(t)} set to ${dateStr}`, strategy: found.strategy };
      }
    }
    await field.click({ timeout: 8_000 }).catch(async () => found.locator.click({ timeout: 8_000 }));
    await page.waitForTimeout(400);
    opened = ` (opened from ${describe(t)})`;
  }
  const monthCaption = new RegExp(`(${MONTHS.join("|")})\\s+\\d{4}`, "i");
  const pickers = page.locator("[role='dialog'], [role='grid'], [role='application'], .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), [class*='calendar' i], [class*='picker' i], [class*='datepicker' i], [class*='pop' i]").filter({ visible: true });
  let picker: Locator | null = null;
  const np = await pickers.count().catch(() => 0);
  for (let i = np - 1; i >= 0 && !picker; i--) {
    const cand = pickers.nth(i);
    if (monthCaption.test((await cand.innerText().catch(() => "")) || "")) picker = cand;
  }
  const scope = picker ?? page;
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  // The day's name starts with the date; a price or a note may follow ("8 January 2027, $167").
  const startsWith = (s: string) => new RegExp(`^\\s*(\\w+,?\\s+)?${pattern(s).source}(?![0-9])`, "i");
  const names = [startsWith(`${day} ${month} ${year}`), startsWith(`${month} ${day}, ${year}`), startsWith(`${month} ${day} ${year}`)];
  const dayButton = () => {
    let loc = scope.getByRole("button", { name: names[0] }).or(scope.getByRole("gridcell", { name: names[0] })).or(scope.getByRole("option", { name: names[0] })).or(scope.getByRole("link", { name: names[0] }));
    for (const re of names.slice(1)) loc = loc.or(scope.getByRole("button", { name: re })).or(scope.getByRole("gridcell", { name: re })).or(scope.getByRole("link", { name: re }));
    // By number inside the block captioned with the month.
    loc = loc.or(scope.locator("[role='group'], table, [class*='month' i], [role='grid']").filter({ hasText: new RegExp(`${month}\\s+${year}`, "i") }).getByRole("button", { name: new RegExp(`^\\s*${day}\\s*$`) }));
    loc = loc.or(scope.locator("[role='group'], table, [class*='month' i], [role='grid']").filter({ hasText: new RegExp(`${month}\\s+${year}`, "i") }).getByRole("gridcell", { name: new RegExp(`^\\s*${day}\\s*$`) }));
    return loc.filter({ visible: true }).first();
  };
  // Month/year selects inside the picker: set them outright.
  const monthSel = scope.getByRole("combobox", { name: /month/i }).first();
  const yearSel = scope.getByRole("combobox", { name: /year/i }).first();
  if ((await monthSel.count().catch(() => 0)) && (await yearSel.count().catch(() => 0))) {
    await yearSel.selectOption({ label: String(year) }).catch(() => yearSel.selectOption(String(year)).catch(() => {}));
    await monthSel.selectOption({ label: month }).catch(() => monthSel.selectOption(String(d.getMonth() + 1)).catch(() => {}));
    await page.waitForTimeout(300);
  }
  const deadline = Date.now() + Math.max(timeoutMs, 20_000);
  let turned = 0;
  while (Date.now() < deadline) {
    const btn = dayButton();
    if (await btn.count().catch(() => 0)) {
      if (await isDisabled(btn)) throw new Error(`${dateStr} is shown in the calendar but cannot be chosen (disabled)${opened}`);
      await btn.click({ timeout: 8_000 });
      await page.waitForTimeout(300);
      return { detail: `picked ${dateStr}${turned ? ` after turning ${turned} month(s)` : ""}${opened}`, strategy: "calendar day by name" };
    }
    // Which months are on screen? Turn towards the target.
    const captions = ((await (picker ?? page.locator("body")).innerText().catch(() => "")) || "").match(new RegExp(`(${MONTHS.join("|")})\\s+(\\d{4})`, "gi")) ?? [];
    const shown = captions.map((c) => {
      const [m, y] = c.split(/\s+/);
      return Number(y) * 12 + MONTHS.findIndex((x) => x.toLowerCase() === m.toLowerCase());
    });
    const want = year * 12 + d.getMonth();
    if (!shown.length) throw new Error(`no calendar is open to pick ${dateStr} in${opened || " — name the date field so it can be opened"}`);
    const forward = want > Math.max(...shown);
    const backward = want < Math.min(...shown);
    if (!forward && !backward) {
      const sample = (await scope.getByRole("button").allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean).slice(0, 12);
      const labels = await scope.locator("[aria-label]").evaluateAll((els) => els.slice(0, 8).map((e) => e.getAttribute("aria-label"))).catch(() => []);
      throw new Error(`the calendar shows ${captions.join(" and ")} but has no day ${day} to choose for ${dateStr}${opened} — its buttons read: ${sample.join(" ")}; labels: ${labels.join(" | ")}`);
    }
    const turn = forward
      ? scope.getByRole("button", { name: /next|forward|›|»|>/i }).or(scope.locator("[aria-label*='next' i], .ant-picker-header-next-btn, .ant-picker-header-super-next-btn")).filter({ visible: true }).first()
      : scope.getByRole("button", { name: /prev|previous|back|‹|«|</i }).or(scope.locator("[aria-label*='prev' i], .ant-picker-header-prev-btn, .ant-picker-header-super-prev-btn")).filter({ visible: true }).first();
    if (!(await turn.count().catch(() => 0)) || (await isDisabled(turn))) throw new Error(`the calendar shows ${captions.join(" and ")} and cannot turn ${forward ? "forward" : "back"} to ${month} ${year}${opened}`);
    await turn.click({ timeout: 5_000 });
    turned++;
    if (turned > 60) throw new Error(`turned the calendar ${turned} times without reaching ${month} ${year}${opened}`);
    await page.waitForTimeout(250);
  }
  throw new Error(`could not pick ${dateStr} within the time budget${opened}`);
}

/** The element that scrolls: the nearest scrollable ancestor of `from`, else the window. */
async function scrollUntil(ctx: GenericCtx, t: Target, a: Record<string, unknown>, budgetMs: number, paginate = true): Promise<GenericOutcome> {
  const { page } = ctx;
  const container = a.within ? String(a.within) : a.container ? String(a.container) : "";
  const deadline = Date.now() + budgetMs;
  let scroller: Locator | null = null;
  if (container) {
    const c = await findVisible(page, { text: container }, 5_000);
    if (c) scroller = c.locator.locator("xpath=ancestor-or-self::*[(contains(@style,'overflow') or self::table or self::ul or self::div)][1]");
  }
  let turns = 0;
  let pages = 0;
  let stuck = 0;
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 10 || Array.from(document.querySelectorAll<HTMLElement>("*")).some((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 80)).catch(() => false);
  if (!scrollable && !paginate) throw new Error("nothing to scroll");
  while (Date.now() < deadline) {
    const found = await findVisible(page, { ...t, within: undefined }, 400);
    if (found) {
      await found.locator.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      return { detail: `scrolled ${turns} time(s)${pages ? ` and turned ${pages} page(s)` : ""} until ${describe(t)} came into view`, strategy: found.strategy };
    }
    // One screen further down the tallest scrollable block, else the window; true at its bottom.
    const atEnd = await page
      .evaluate(() => {
        const all = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((e) => {
          const cs = getComputedStyle(e);
          return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 80;
        });
        const box = all.sort((x, y) => y.clientHeight - x.clientHeight)[0] ?? null;
        if (box) {
          const before = box.scrollTop;
          box.scrollTop = before + Math.max(200, box.clientHeight * 0.9);
          return box.scrollTop === before;
        }
        const before = window.scrollY;
        window.scrollBy(0, Math.max(300, window.innerHeight * 0.9));
        return window.scrollY === before;
      })
      .catch(() => true);
    if (scroller) await scroller.evaluate((n) => ((n as HTMLElement).scrollTop += Math.max(200, (n as HTMLElement).clientHeight * 0.9))).catch(() => {});
    turns++;
    // The bottom: wait for a list that loads more, then give up after three still turns.
    if (atEnd) {
      stuck++;
      await page.waitForTimeout(700);
    } else stuck = 0;
    if (stuck >= 3) {
      if (!paginate) break;
      // The end of what is loaded: a paged list has a "Next" / "Load more"; press it and keep looking.
      const more = page.getByRole("button", { name: /^(next|next page|load more|show more|more results|see more)\b/i }).or(page.getByRole("link", { name: /^(next|next page|load more|show more)\b/i })).filter({ visible: true }).first();
      if ((await more.count().catch(() => 0)) && !(await isDisabled(more)) && pages < 50) {
        await more.click({ timeout: 5_000 }).catch(() => {});
        pages++;
        stuck = 0;
        await page.waitForTimeout(600);
        continue;
      }
      break;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`scrolled ${turns} time(s)${pages ? ` and turned ${pages} page(s)` : ""} and ${describe(t)} never came into view${Date.now() >= deadline ? " (budget spent)" : " (reached the end)"}`);
}

async function goTo(ctx: GenericCtx, a: Record<string, unknown>): Promise<GenericOutcome> {
  const { page } = ctx;
  // go_to {path:"/x"} with no screen named means the path (11 of 157 bench plans wrote it that way, 30 Oct).
  const screen = (String(a.screen ?? "") || (a.path || a.url ? "path" : "")).toLowerCase().replace(/[\s-]+/g, "_");
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
    case "back": {
      const before = page.url();
      await page.goBack({ timeout: 20_000, waitUntil: "domcontentloaded" }).catch(() => null);
      if (page.url() === before) throw new Error("the browser could not go back (no earlier page in this tab's history)");
      what = `back to ${new URL(page.url()).pathname}${new URL(page.url()).hash}`;
      break;
    }
    case "new_tab":
    case "newest_tab":
    case "tab_opened":
      return switchTab(ctx, a);
    case "url_on_screen":
    case "link_in_text": {
      // A confirmation link shown as plain text (a mail preview): read it and open it.
      const region = a.within ? String(a.within) : "";
      const src = region ? (await findVisible(page, { text: region }, 10_000))?.locator.locator("xpath=ancestor-or-self::*[string-length(normalize-space()) > 40][1]") : page.locator("body");
      const text = ((await (src ?? page.locator("body")).innerText().catch(() => "")) || "");
      const m = text.match(/https?:\/\/[^\s"'<>)]+|(?<![\w/])\/[\w\-./?=&#%]+\?[\w\-=&%.]+/);
      if (!m) throw new Error(`no URL is written on the screen${region ? ` near "${region}"` : ""}`);
      const url = m[0].replace(/[.,;)]+$/, "");
      const href = /^https?:/.test(url) ? url : `${CONFIG.appUrl.replace(/\/$/, "")}${url}`;
      await page.goto(href, NAV);
      what = `the link written on the screen (${url.slice(0, 80)})`;
      break;
    }
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
      throw new Error(`go_to does not know the screen "${screen}" — use one of: stage, responses, overview, participants, analytics, price_trends, participant_remarks, tab, path, back, new_tab, events_list, event, master_qcs`);
  }
  if (!ctx.site) await ctx.events.dismissDistractions().catch(() => false);
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
      // The first VISIBLE match that is a field a person can type into — a
      // label's words also sit on a heading, a select or a button nearby.
      const deadline = Date.now() + timeoutMs;
      const softDeadline = Date.now() + Math.min(4_000, timeoutMs);
      let field: Locator | null = null;
      let strategy = "";
      let kind = "";
      let sawOther = "";
      do {
        const found = await findVisible(page, { ...t, role: t.role ?? undefined }, 1_500);
        if (!found) continue;
        // A field to type into first; a dropdown only when no such field
        // carries the words ("Search" is on the department select AND the search box).
        let dropdown: Locator | null = null;
        for (const el of [...(await visibleMatches(found)), found.locator]) {
          const f = await fieldFor(el);
          const k = await fieldKind(f);
          if (k === "text" || k === "range" || k === "picker" || k === "spin") {
            field = f;
            strategy = found.strategy;
            kind = k;
            break;
          }
          if (k === "select" && !dropdown) dropdown = f;
          else sawOther = k;
        }
        // The words resolved to a display or plain text, not a field: a stepper may stand there.
        // Try it after a short first pass rather than hunting for 15s while a popover closes.
        if (!field && sawOther && Date.now() > softDeadline) break;
        if (!field && dropdown && !/\bsearch\b/i.test(targetWords(t)[0] ?? "")) {
          field = dropdown;
          strategy = found.strategy;
          kind = "select";
        }
      } while (!field && Date.now() < deadline);
      if (!field && /\bsearch\b/i.test(targetWords(t)[0] ?? "")) {
        // "the search box": any site has one; the words name the role, not a label.
        const box = page.locator("[role='searchbox'], input[type='search'], [role='search'] input:not([type='hidden']), input[placeholder*='search' i], input[aria-label*='search' i], [role='combobox'][aria-label*='search' i]").filter({ visible: true }).first();
        if (await box.count().catch(() => 0)) {
          field = box;
          strategy = "the page's search box";
          kind = "text";
        }
      }
      // "Adults: − 2 +" — a stepper: a number between two buttons, no field to type into. It wins over a
      // select or read-only display the words happen to resolve to, and over "no field at all".
      let stepperTried = false;
      // The select the words resolved to is theirs when it carries all of them in any order ("Age of child 1" for "Child age").
      const wordsOf = (targetWords(t)[0] ?? "").split(/\s+/).filter((w) => w.length >= 2);
      const carriesWords = (name: string) => wordsOf.every((w) => new RegExp(`(?<![a-z0-9])${esc(w)}(?![a-z0-9])`, "i").test(name));
      const resolvedElsewhere = field && kind === "select" && !carriesWords(await accessibleName(field));
      const readOnlyField = field && kind === "text" && (await field.evaluate((n) => (n as HTMLInputElement).readOnly === true, undefined, Q).catch(() => false));
      if (!field || resolvedElsewhere || readOnlyField) {
        stepperTried = true;
        const words = targetWords(t)[0] ?? "";
        // The count display named by the words ("Children count"), else the words themselves —
        // inside an open dialog/popover first, where such steppers live.
        const display = page.locator("output, [role='spinbutton'], input[readonly]").filter({ visible: true }).and(page.getByLabel(pattern(words)));
        const inDialog = page.locator("[role='dialog'], [class*='pop' i], [class*='dropdown' i]").filter({ visible: true }).getByText(pattern(words)).filter({ visible: true });
        let anchor = (await display.count().catch(() => 0)) ? { locator: display.first(), strategy: `count display named "${words}"` } : null;
        if (!anchor && (await inDialog.count().catch(() => 0))) anchor = { locator: inDialog.first(), strategy: `"${words}" in the open dialog` };
        if (!anchor) anchor = await findVisible(page, { text: words }, 2_000);
        if (anchor && Number.isFinite(Number(value))) {
          // The row of THIS counter: two buttons and at most one count display.
          const block = anchor.locator.locator("xpath=ancestor-or-self::*[count(.//button) >= 2 and count(.//output | .//*[@role='spinbutton'] | .//input) <= 1][1]");
          const plus = block.getByRole("button", { name: /^(\+|＋|add|increase|more|up|▲|increment)\b|^\+$/i }).or(block.locator("button, [role='button']").filter({ hasText: /^\s*[+＋▲]\s*$/ })).first();
          const minus = block.getByRole("button", { name: /^(-|−|–|remove|decrease|fewer|less|down|▼|decrement)\b|^[-−–]$/i }).or(block.locator("button, [role='button']").filter({ hasText: /^\s*[-−–▼]\s*$/ })).first();
          if ((await plus.count().catch(() => 0)) && (await minus.count().catch(() => 0))) {
            const display = block.locator("input, output, [role='spinbutton']").first();
            const readCount = async () => {
              if (await display.count().catch(() => 0)) {
                const v = (await display.inputValue(Q).catch(() => null)) ?? (await display.innerText(Q).catch(() => ""));
                const m0 = String(v).match(/-?\d+/);
                if (m0) return Number(m0[0]);
              }
              const txt = ((await block.innerText().catch(() => "")) || "").replace(pattern(targetWords(t)[0]), " ");
              const m = txt.match(/-?\d+/);
              return m ? Number(m[0]) : Number.NaN;
            };
            const target = Number(value);
            let cur = await readCount();
            for (let i = 0; i < 60 && Number.isFinite(cur) && cur !== target; i++) {
              await clickHard(ctx, cur < target ? plus : minus, 3_000);
              await page.waitForTimeout(120);
              const next = await readCount();
              if (next === cur) break;
              cur = next;
            }
            if (cur !== target) throw new Error(`stepped ${describe(t)} but it reads ${cur}, not ${target}`);
            return { detail: `${describe(t)} stepped to ${cur}`, strategy: `${anchor.strategy} → stepper buttons` };
          }
        }
        if (resolvedElsewhere) field = null;
        // No stepper either: the field may still be loading — hunt until the real deadline.
        if (!field && Date.now() < deadline) {
          const late = await findVisible(page, { ...t, role: t.role ?? undefined }, Math.max(deadline - Date.now(), 500));
          if (late) {
            for (const el of [...(await visibleMatches(late)), late.locator]) {
              const f = await fieldFor(el);
              const k = await fieldKind(f);
              if (k === "text" || k === "range" || k === "picker" || k === "spin") {
                field = f;
                strategy = late.strategy;
                kind = k;
                break;
              }
            }
          }
        }
      }
      void stepperTried;
      if (!field) throw new Error(`no field ${describe(t)} on screen within ${Math.round(timeoutMs / 1000)}s${sawOther ? ` (the words match a ${sawOther}, not a field to type into)` : ""}`);
      if (await isDisabled(field)) throw new Error(`the field ${describe(t)} is disabled`);
      if (kind === "select") {
        // "Fill X with Y" on a dropdown means choose Y.
        return execute(ctx, "select", { ...a, label: targetWords(t)[0], option: value }, runInner);
      }
      if (kind === "range") {
        await field.evaluate((n, v) => {
          const input = n as HTMLInputElement;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter ? setter.call(input, v) : (input.value = v);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }, value);
        const now = await field.inputValue().catch(() => "");
        if (now !== value) throw new Error(`set the slider ${describe(t)} to ${value} but it reads ${now} (its range may not allow that value)`);
        return { detail: `slider ${describe(t)} set to ${now}`, strategy };
      }
      if (kind === "spin") {
        // A read-only spinner (hour, minute, quantity): step it with the arrow
        // keys, or its own increase/decrease buttons, until it reads the value.
        const target = Number(value);
        if (!Number.isFinite(target)) throw new Error(`${describe(t)} is a spinner; it takes a number, not "${value}"`);
        const read = async () => {
          for (const raw of [await field!.getAttribute("aria-valuenow").catch(() => null), await field!.inputValue().catch(() => null), await field!.getAttribute("aria-valuetext").catch(() => null), await field!.innerText().catch(() => null)]) {
            const n = raw === null || raw === undefined ? Number.NaN : Number(String(raw).replace(/[^\d.-]/g, ""));
            if (Number.isFinite(n)) return n;
          }
          return Number.NaN;
        };
        const vmin = Number(await field.getAttribute("aria-valuemin").catch(() => null));
        const vmax = Number(await field.getAttribute("aria-valuemax").catch(() => null));
        const wraps = Number.isFinite(vmin) && Number.isFinite(vmax) && vmax > vmin;
        const up = field.locator("xpath=(preceding-sibling::button | following-sibling::button | ../preceding-sibling::button | ../following-sibling::button)").filter({ hasText: /▲|\+|up|increase|more/i }).or(page.getByRole("button", { name: new RegExp(`^(increase|more|up|\\+) ?${esc(targetWords(t)[0] ?? "")}`, "i") })).first();
        const down = field.locator("xpath=(preceding-sibling::button | following-sibling::button | ../preceding-sibling::button | ../following-sibling::button)").filter({ hasText: /▼|-|−|down|decrease|less/i }).or(page.getByRole("button", { name: new RegExp(`^(decrease|less|down|-|−) ?${esc(targetWords(t)[0] ?? "")}`, "i") })).first();
        let cur = await read();
        if (!Number.isFinite(cur)) throw new Error(`the spinner ${describe(t)} shows no number to step from`);
        let last = Number.NaN;
        for (let i = 0; i < 150 && cur !== target; i++) {
          // On a clock-like range go the shorter way round.
          const span = wraps ? vmax - vmin + 1 : 0;
          const goUp = wraps ? ((target - cur + span) % span) <= span / 2 : cur < target;
          const btn = goUp ? up : down;
          if (await btn.count().catch(() => 0)) await clickHard(ctx, btn, 3_000);
          else {
            await field.focus().catch(() => {});
            await page.keyboard.press(goUp ? "ArrowUp" : "ArrowDown");
          }
          await page.waitForTimeout(80);
          const next = await read();
          if (!Number.isFinite(next)) break;
          if (next === cur && next === last) break;
          last = cur;
          cur = next;
        }
        if (cur !== target) throw new Error(`stepped the spinner ${describe(t)} but it reads ${cur}, not ${target} (its range or step may not allow that value)`);
        return { detail: `spinner ${describe(t)} set to ${cur}`, strategy };
      }
      if (kind === "picker") {
        await field.click({ timeout: 8_000 }).catch(() => {});
        throw new Error(`${describe(t)} is a read-only field that opens a picker — it cannot be typed into; use pick_date, or click the value in the picker`);
      }
      await field.click({ timeout: 8_000 }).catch(() => {});
      const type = ((await field.getAttribute("type").catch(() => "")) ?? "").toLowerCase();
      // A date written in words into a plain text field that states its
      // format ("DD/MM/YY" in the placeholder, a hint beside it): write it the
      // way the form asks, as a person would.
      let typedValue = value;
      let reformatted = "";
      if (type === "text" || type === "") {
        const fmt = await dateFormatHint(field);
        const asDate = fmt && /[a-z]{3,}|\d{4}/i.test(value) && !new RegExp(`^${fmt.replace(/[DMY]+/g, "\\d+")}$`).test(value) ? parseDateWords(value) : null;
        if (fmt && asDate) {
          typedValue = formatDate(asDate, fmt);
          reformatted = ` (written as ${fmt}: ${typedValue})`;
        }
      }
      // An autocomplete field (a combobox, aria-autocomplete, a datalist) reacts to keystrokes: type it.
      const autocompletes = await field.evaluate((n) => {
        const e = n as HTMLElement;
        return !!(e.getAttribute("aria-autocomplete") || e.getAttribute("role") === "combobox" || e.getAttribute("list") || e.closest("[role='combobox']"));
      }, undefined, Q).catch(() => false);
      if (autocompletes) {
        await field.fill("", { timeout: 4_000 }).catch(() => {});
        await field.pressSequentially(typedValue, { delay: 40, timeout: 10_000 });
      } else
      try {
        await field.fill(typedValue, { timeout: 8_000 });
      } catch (e) {
        if (!/not an <input>|not editable|Malformed value|Cannot type/i.test(String((e as Error).message))) throw e;
        // antd number inputs / grid cells wrap the real input: fill that; else a masked or typed
        // field: select all and type it in, like a person.
        const innerEl = field.locator("input:not([type='hidden']), textarea, [contenteditable='true']").first();
        const innerOk = (await innerEl.count().catch(() => 0)) > 0 && (await innerEl.fill(typedValue, { timeout: 5_000 }).then(() => true).catch(() => false));
        if (!innerOk) {
          await field.press("ControlOrMeta+a").catch(() => {});
          await field.pressSequentially(typedValue, { timeout: 8_000 });
        }
      }
      const now = await fieldValue(field);
      const typed = /date|time|month|week|color|number/.test(type);
      if (typedValue && !typed && !norm(now).includes(norm(typedValue))) throw new Error(`typed "${typedValue}" into ${describe(t)} but the field now shows "${now}"${reformatted}`);
      if (value && typed && !now) throw new Error(`typed "${value}" into the ${type} field ${describe(t)} but it stayed empty — the format may be wrong (${type} inputs take ${type === "date" ? "YYYY-MM-DD" : type === "time" ? "HH:MM" : type === "color" ? "#rrggbb" : "a number"})`);
      noteSeen(targetWords(t)[0], page.url(), strategy);
      // A search box commits on Enter: typing alone left the events list unfiltered (23 Oct, E01:
      // "Search Title" held the text, the list still showed live events, and "No Results found"
      // never came). Submit it unless the plan says not to.
      const searchy = /search/i.test(`${describe(t)} ${await field.getAttribute("placeholder").catch(() => "") ?? ""} ${type}`);
      if (value && searchy && a.submit !== false) {
        await field.press("Enter", { timeout: 5_000 }).catch(() => page.keyboard.press("Enter").catch(() => {}));
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        return { detail: `${describe(t)} now holds "${now}"${reformatted} — submitted with Enter`, strategy };
      }
      return { detail: `${describe(t)} now holds "${now}"${reformatted}`, strategy };
    }

    case "select": {
      const option = String(a.option ?? a.value ?? "").trim();
      if (!option) throw new Error('select needs an "option"');
      const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target, text: undefined });
      requireWords(t, "select");
      // Named by its option ("choose lb", "select in"): the one select on screen that offers
      // it — looked for before any loose text match on such short words.
      const namedByOption = norm(targetWords(t)[0] ?? "") === norm(option);
      const byOption = async () => {
        const offering = page.locator("select").filter({ has: page.locator("option", { hasText: pattern(option, true) }) }).filter({ visible: true });
        if ((await offering.count().catch(() => 0)) !== 1) return null;
        await offering.first().selectOption({ label: option }, { timeout: 8_000 }).catch(() => offering.first().selectOption(option, { timeout: 8_000 }));
        const chosen = await fieldValue(offering.first());
        return { detail: `the select offering "${option}" set to "${chosen || option}"`, strategy: `the only select with the option "${option}"` } as GenericOutcome;
      };
      if (namedByOption) {
        const done = await byOption();
        if (done) return done;
      }
      const found =
        (await findVisible(page, { ...t, role: "combobox", strict: true }, 3_000)) ??
        (await findVisible(page, { ...t, role: "button", strict: true }, 1_000)) ??
        (namedByOption ? null : await findVisible(page, t, timeoutMs));
      if (!found) {
        const done = await byOption();
        if (done) return done;
        // A "select" is sometimes a radio group or segmented tabs: pick the option directly.
        const direct = await findVisible(page, { name: option, exact: false }, 3_000);
        if (direct && /radio|tab|button/.test(direct.strategy)) {
          await direct.locator.click({ timeout: 8_000 });
          return { detail: `no select labelled "${targetWords(t)[0]}"; chose the option "${option}" directly`, strategy: direct.strategy };
        }
        throw new Error(`no select ${describe(t)} on screen within ${Math.round(timeoutMs / 1000)}s`);
      }
      trace(`select: found by ${found.strategy}`);
      // "Choose Top 50 in Top 50": the control IS the option (a tab, a toggle button) — press it.
      if (/^role (button|tab|radio|menuitem)/.test(found.strategy) && pattern(option, true).test(((await found.locator.innerText().catch(() => "")) || "").trim())) {
        await found.locator.click({ timeout: 8_000 });
        await page.waitForTimeout(300);
        return { detail: `pressed ${describe(t)} (it is the option itself)`, strategy: found.strategy };
      }
      // A group of radios, checkboxes or swatches under the words ("Finish: Black / White"): pick the one named.
      const group = found.locator.locator("xpath=ancestor-or-self::*[@role='radiogroup' or @role='group' or self::fieldset or contains(@class,'ant-radio-group')][1]");
      const groupRoot = (await group.count().catch(() => 0)) ? group.first() : found.locator.locator("xpath=..");
      const choice = groupRoot.getByRole("radio", { name: pattern(option, true) }).or(groupRoot.getByRole("checkbox", { name: pattern(option, true) })).or(groupRoot.getByRole("button", { name: pattern(option, true) })).first();
      if (await choice.count().catch(() => 0)) {
        await clickControl(ctx, choice, option);
        await page.waitForTimeout(300);
        return { detail: `${describe(t)}: chose "${option}" in its group`, strategy: `${found.strategy} → option in the group` };
      }
      trace("select: no option in a group");
      const field = await fieldFor(found.locator);
      const tag = await field.evaluate((n) => (n as HTMLElement).tagName.toLowerCase()).catch(() => "");
      trace(`select: field is <${tag}>`);
      if (tag === "select") {
        // By visible label first; a native select whose labels differ in case/spacing by value.
        try {
          await field.selectOption({ label: option }, { timeout: 8_000 });
        } catch {
          const match = await field.evaluate((n, want) => {
            const w = want.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
            const o = Array.from((n as HTMLSelectElement).options).find(
              (x) => x.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().includes(w) || x.value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === w,
            );
            return o ? o.value : null;
          }, option);
          if (match === null) {
            const offered = await field.evaluate((n) => Array.from((n as HTMLSelectElement).options).map((o) => o.text.trim()));
            throw new Error(`the select ${describe(t)} does not offer "${option}" — it offers: ${offered.slice(0, 12).join(", ")}`);
          }
          await field.selectOption(match, { timeout: 8_000 });
        }
      } else {
        const opener = field.locator(".ant-select-selection, .ant-select-selector").first();
        const trigger = (await opener.count().catch(() => 0)) ? opener : field;
        const OPTIONS = "[role='option'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='treeitem'], [role='radiogroup'] [role='radio'], [role='radiogroup'] label, .ant-select-dropdown-menu-item, .ant-select-item-option, .ant-dropdown-menu-item, .ant-cascader-menu-item, [role='listbox'] li, [role='menu'] li";
        const optionsOpen = async () => (await page.locator(OPTIONS).filter({ visible: true }).count().catch(() => 0)) > 0;
        if (!(await optionsOpen())) await trigger.click({ timeout: 8_000 });
        trace("select: list opened");
        const LISTS = "[role='listbox'], [role='menu'], [role='radiogroup'], [role='group'][aria-expanded], .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)";
        const optFor = () =>
          page
            .locator(OPTIONS)
            .filter({ hasText: pattern(option) })
            .filter({ visible: true })
            .or(page.locator(LISTS).filter({ visible: true }).last().getByText(pattern(option, true)))
            .or(page.locator(LISTS).filter({ visible: true }).last().getByRole("radio", { name: pattern(option, true) }))
            .first();
        let opt = optFor();
        await opt.waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});
        trace(`select: option located (${await opt.count().catch(() => -1)})`);
        if (!(await opt.count())) {
          // A searchable dropdown: type the option to filter the list.
          const search = page.locator("[role='listbox'] input, [role='combobox'] input, input[type='search'], [role='searchbox'], .ant-select-selection-search-input").filter({ visible: true }).first();
          if (await search.count().catch(() => 0)) {
            await search.fill(option, { timeout: 4_000 }).catch(() => {});
            opt = optFor();
            await opt.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
          }
        }
        if (!(await opt.count())) {
          const offered = (await page.locator(OPTIONS).filter({ visible: true }).allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
          await page.keyboard.press("Escape").catch(() => {});
          throw new Error(`the select ${describe(t)} does not offer "${option}" — it offers: ${offered.slice(0, 12).join(", ") || "(nothing visible)"}`);
        }
        await clickControl(ctx, opt, option);
        trace("select: option clicked");
      }
      await page.waitForTimeout(300);
      // The control may have re-rendered with the choice as its text: read whatever stands there now.
      const stillThere = (await field.count().catch(() => 0)) > 0;
      const now = stillThere ? await fieldValue(field) : ((await findVisible(page, { ...t, within: t.within }, 2_000))?.locator ? await fieldValue((await findVisible(page, { ...t, within: t.within }, 1_000))!.locator) : option);
      trace("select: value read");
      const tagNow = stillThere ? await field.evaluate((n) => (n as HTMLElement).tagName.toLowerCase(), undefined, Q).catch(() => "") : "";
      if (now && !norm(now).includes(norm(option)) && tagNow !== "button") throw new Error(`chose "${option}" in ${describe(t)} but it now shows "${now}"`);
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      return { detail: `${describe(t)} set to "${norm(now).includes(norm(option)) ? now : option}"`, strategy: found.strategy };
    }

    case "toggle": {
      const want = bool(a.on, true);
      const t = targetOf({ ...a, label: a.label ?? a.name ?? a.target, text: undefined });
      requireWords(t, "toggle");
      const lookFor = async (ms: number) =>
        (await findVisible(page, { ...t, role: "switch", strict: true }, Math.min(ms, 2_000))) ??
        (await findVisible(page, { ...t, role: "checkbox", strict: true }, Math.min(ms, 2_000))) ??
        (await findVisible(page, { ...t, role: "radio", strict: true }, Math.min(ms, 1_000))) ??
        (await findVisible(page, t, ms));
      let found = await lookFor(Math.min(timeoutMs, 6_000));
      if (!found) {
        // A filter list folded behind "See more": unfold it once, then look again.
        const more = page.getByRole("button", { name: /^(see|show) (more|all)\b/i }).or(page.getByRole("link", { name: /^(see|show) (more|all)\b/i })).filter({ visible: true }).first();
        if (await more.count().catch(() => 0)) {
          await more.click({ timeout: 3_000 }).catch(() => {});
          found = await lookFor(timeoutMs);
        }
      }
      if (!found) throw new Error(`no switch or checkbox ${describe(t)} on screen`);
      let field = await fieldFor(found.locator);
      const checkLike = async (f: Locator) => {
        const k = await fieldKind(f);
        if (k === "check") return true;
        const role = (await f.getAttribute("role").catch(() => "")) ?? "";
        const cls = (await f.getAttribute("class").catch(() => "")) ?? "";
        return /^(switch|checkbox|radio|menuitemcheckbox)$/.test(role) || /ant-switch|ant-checkbox|ant-radio/.test(cls);
      };
      if (!(await checkLike(field))) {
        // The words were found on something that is not a switch (a product
        // card with the brand's name): look for the real control once more.
        const strictLook = async () => (await findVisible(page, { ...t, role: "checkbox", strict: true }, 3_000)) ?? (await findVisible(page, { ...t, role: "switch", strict: true }, 1_000)) ?? (await findVisible(page, { ...t, role: "radio", strict: true }, 1_000));
        let strict = await strictLook();
        if (!strict) {
          const more = page.getByRole("button", { name: /^(see|show) (more|all)\b/i }).or(page.getByRole("link", { name: /^(see|show) (more|all)\b/i })).filter({ visible: true }).first();
          if (await more.count().catch(() => 0)) {
            await more.click({ timeout: 3_000 }).catch(() => {});
            strict = await strictLook();
          }
        }
        if (!strict) throw new Error(`no switch or checkbox ${describe(t)} on screen (the words are on a ${await fieldKind(field)}, not a switch)`);
        field = await fieldFor(strict.locator);
      }
      if (await isDisabled(field)) throw new Error(`the switch ${describe(t)} is disabled`);
      const before = await isOn(field);
      if (before !== want) {
        await clickControl(ctx, field, targetWords(t)[0]);
        await page.waitForTimeout(400);
      }
      const after = await isOn(field);
      if (after !== want) throw new Error(`${describe(t)} is still ${after ? "on" : "off"} after clicking it`);
      let others = "";
      if (bool(a.only, false) && want) {
        // "Keep only Nonstop": every other switch in the same group goes off.
        const group = field.locator("xpath=ancestor::*[self::fieldset or @role='group' or @role='radiogroup' or count(.//input[@type='checkbox'] | .//*[@role='checkbox'] | .//*[@role='switch']) >= 2][1]");
        const siblings = group.locator("input[type='checkbox'], [role='checkbox'], [role='switch']");
        const n = await siblings.count().catch(() => 0);
        const turnedOff: string[] = [];
        for (let i = 0; i < n; i++) {
          const sib = siblings.nth(i);
          if (await sib.evaluate((n2, f) => n2 === f, await field.elementHandle({ timeout: 2_500 }).catch(() => null)).catch(() => false)) continue;
          if (await isOn(sib)) {
            await clickControl(ctx, sib, "");
            await page.waitForTimeout(250);
            turnedOff.push((await accessibleName(sib)).split(" | ").find(Boolean) ?? `#${i + 1}`);
          }
        }
        others = turnedOff.length ? `; turned off ${turnedOff.map((x) => `"${x.trim()}"`).join(", ")}` : "; nothing else in its group was on";
      }
      noteSeen(targetWords(t)[0], page.url(), found.strategy);
      return { detail: `${describe(t)} is ${after ? "on" : "off"}${before === want ? " (it already was)" : ""}${others}`, strategy: found.strategy };
    }

    case "upload": {
      const src = await uploadSource(String(a.file ?? "sample.pdf"), page.url());
      const file = src.name;
      const path = src.path;
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
      const shown = await page.getByText(pattern(file.replace(/\.[a-z0-9]+$/i, ""))).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      const ok = shown || !!(await waitForMessage(page, "success", { mark: ctx.prevMark, timeoutMs: 1_500 })).matched;
      if (!ok) throw new Error(`attached ${file} ${how}, but the screen shows no sign of it (no file name, no success message)`);
      return { detail: `uploaded ${file} ${how}; the screen shows it`, strategy };
    }

    case "switch_tab":
      return switchTab(ctx, a);

    case "pick_date":
      return pickDate(ctx, a, timeoutMs);

    case "choose_by_number":
      return chooseByNumber(ctx, a, timeoutMs);

    case "scroll_to": {
      const t = targetOf(a);
      requireWords(t, "scroll_to");
      return scrollUntil(ctx, t, a, Math.min(Math.max(num(a.timeoutMs) ?? 120_000, 5_000), 240_000));
    }

    case "drag": {
      const from = targetOf({ ...(typeof a.from === "object" && a.from ? (a.from as Record<string, unknown>) : { text: a.from }) });
      const to = targetOf({ ...(typeof a.to === "object" && a.to ? (a.to as Record<string, unknown>) : { text: a.to }) });
      requireWords(from, "drag (from)");
      requireWords(to, "drag (to)");
      const src = await findVisible(page, from, timeoutMs);
      if (!src) throw new Error(`nothing to drag: no ${describe(from)} on screen`);
      const dst = await findVisible(page, to, timeoutMs);
      if (!dst) throw new Error(`nowhere to drop: no ${describe(to)} on screen`);
      // The draggable is often the row/card around the words.
      const handle = src.locator.locator("xpath=ancestor-or-self::*[@draggable='true' or contains(@class,'drag') or @role='listitem' or self::li or self::tr][1]");
      const grab = (await handle.count().catch(() => 0)) ? handle.first() : src.locator;
      const target = dst.locator.locator("xpath=ancestor-or-self::*[@draggable='true' or contains(@class,'drag') or @role='listitem' or self::li or self::tr][1]");
      // "Drop it on the Sprint 42 list": the words are the list's heading; the
      // drop zone is the list beside it.
      const besideHeading = dst.locator.locator("xpath=ancestor-or-self::*[self::h1 or self::h2 or self::h3 or self::h4 or self::label or self::legend][1]/following-sibling::*[self::ul or self::ol or self::table or self::div or @role='list'][1]");
      const drop = (await target.count().catch(() => 0)) ? target.first() : (await besideHeading.count().catch(() => 0)) ? besideHeading.first() : dst.locator;
      const before = ((await grab.locator("xpath=..").innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      const b1 = await grab.boundingBox();
      const b2 = await drop.boundingBox();
      if (!b1 || !b2) throw new Error("drag: could not measure the elements");
      const place = String(a.place ?? "before").toLowerCase();
      const yTarget = b2.height < 8 ? b2.y + 4 : place === "after" ? b2.y + b2.height - 2 : b2.y + 2;
      // HTML5 drag-and-drop first (dragTo), then a real pointer drag with steps for pointer/mouse-event lists.
      await grab.dragTo(drop, { timeout: 8_000 }).catch(() => {});
      let after = ((await grab.locator("xpath=..").innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      if (after === before) {
        await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
        await page.mouse.down();
        await page.mouse.move(b1.x + b1.width / 2 + 2, b1.y + b1.height / 2 + 2, { steps: 2 });
        await page.mouse.move(b2.x + b2.width / 2, yTarget, { steps: 12 });
        await page.waitForTimeout(150);
        await page.mouse.up();
        await page.waitForTimeout(400);
        after = ((await grab.locator("xpath=..").innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
      }
      if (after === before) throw new Error(`dragged ${describe(from)} onto ${describe(to)} but the list reads the same as before: ${before.slice(0, 120)}`);
      return { detail: `dragged ${describe(from)} ${place} ${describe(to)} — now: ${after.slice(0, 120)}`, strategy: src.strategy };
    }

    case "dialog": {
      const action = /dismiss|cancel|reject/i.test(String(a.action ?? "accept")) ? "dismiss" : "accept";
      ctx.armedDialog = { action, text: a.text === undefined ? undefined : String(a.text) };
      return { detail: `the next browser dialog will be ${action}ed${a.text !== undefined ? ` with "${a.text}"` : ""}` };
    }

    case "expect_dialog": {
      const want = a.text ? String(a.text) : "";
      const deadline = Date.now() + Math.min(timeoutMs, 10_000);
      while (!ctx.lastDialog && Date.now() < deadline) await page.waitForTimeout(200);
      const d = ctx.lastDialog;
      if (!d) throw new Error(`no browser dialog (alert/confirm/prompt) appeared${ctx.armedDialog ? "" : " — arm one with the dialog step before the click that opens it"}`);
      if (want && !norm(d.message).includes(norm(want))) throw new Error(`the ${d.type} said "${d.message}" — the case expects "${want}"`);
      return { detail: `the ${d.type} said "${d.message}" and was ${d.action}ed` };
    }

    case "expect_download": {
      const name = a.name ? String(a.name) : "";
      const contains = a.contains === undefined ? [] : Array.isArray(a.contains) ? a.contains.map(String) : [String(a.contains)];
      const absent = a.notContains === undefined ? [] : Array.isArray(a.notContains) ? a.notContains.map(String) : [String(a.notContains)];
      const deadline = Date.now() + Math.min(timeoutMs, 20_000);
      let hit: GenericCtx["downloads"][number] | undefined;
      do {
        hit = [...ctx.downloads].reverse().find((d) => !name || pattern(name, true).test(d.name));
        if (!hit) await page.waitForTimeout(300);
      } while (!hit && Date.now() < deadline);
      if (!hit) throw new Error(`no file ${name ? `named "${name}" ` : ""}was downloaded in this plan${ctx.downloads.length ? ` (downloaded: ${ctx.downloads.map((d) => d.name).join(", ")})` : ""}`);
      const { readFileSync } = await import("node:fs");
      const buf = readFileSync(hit.path);
      const head = buf.subarray(0, 8).toString("latin1");
      const isPdf = head.startsWith("%PDF");
      const text = isPdf ? await pdfText(buf) : buf.toString("utf8");
      const vis = visibleText(text);
      for (const c of contains) if (!vis.includes(visibleText(c)) && !text.includes(c)) throw new Error(`the downloaded ${hit.name} does not contain "${c}" — it starts: ${vis.slice(0, 160)}`);
      for (const c of absent) if (vis.includes(visibleText(c)) || text.includes(c)) throw new Error(`the downloaded ${hit.name} contains "${c}", which the case says it must not`);
      if (a.rows !== undefined) {
        const rows = text.trim().split(/\r?\n/).length - 1;
        if (rows !== Number(a.rows)) throw new Error(`the downloaded ${hit.name} has ${rows} data row(s) below its header — the case expects ${a.rows}`);
      }
      if (a.eachRow !== undefined) {
        const want = String(a.eachRow);
        const bad = text.trim().split(/\r?\n/).slice(1).filter((r) => r.trim() && !r.includes(want));
        if (bad.length) throw new Error(`${bad.length} data row(s) of ${hit.name} lack "${want}", e.g. ${bad[0].slice(0, 80)}`);
      }
      if (a.json !== undefined) {
        let obj: unknown;
        try {
          obj = JSON.parse(text);
        } catch {
          throw new Error(`the downloaded ${hit.name} is not valid JSON`);
        }
        const pathStr = String(a.json);
        const got = pathStr.split(/[.\[\]]+/).filter(Boolean).reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
        if (a.equals !== undefined && String(got) !== String(a.equals)) throw new Error(`in ${hit.name}, ${pathStr} is ${JSON.stringify(got)} — the case expects ${JSON.stringify(a.equals)}`);
      }
      return { detail: `downloaded ${hit.name} (${buf.length} bytes${isPdf ? ", PDF" : ""})${contains.length ? `, contains ${contains.map((c) => `"${c}"`).join(", ")}` : ""}`, strategy: "download" };
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
        // A tester reading the screen also reads the hint inside an empty box ("Starting from",
        // "Search Title") and a control's own label — text the page shows that is not page text.
        const q = text.replace(/"/g, '\\"');
        const hint = page.locator(`[placeholder*="${q}" i]:visible, [aria-label*="${q}" i]:visible, [title*="${q}" i]:visible`).first();
        if (await hint.count().catch(() => 0)) {
          noteSeen(text, page.url(), "placeholder/label");
          await spotlightMark(hint, `"${text}" is on screen (as a field hint or label)`).catch(() => {});
          return { detail: `"${text}" is on screen as a field hint or label`, strategy: "placeholder/label" };
        }
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
      if (!found) {
        // the words may be a field's hint or label ("Starting from" in an empty date box)
        const word = String(targetWords(t)[0] ?? "").replace(/"/g, '\\"');
        const hint = word ? page.locator(`[placeholder*="${word}" i]:visible, [aria-label*="${word}" i]:visible, [title*="${word}" i]:visible`).first() : null;
        if (hint && (await hint.count().catch(() => 0))) {
          noteSeen(word, page.url(), "placeholder/label");
          await spotlightMark(hint, `${describe(t)} is visible (as a field hint or label)`).catch(() => {});
          return { detail: `${describe(t)} is visible as a field hint or label`, strategy: "placeholder/label" };
        }
        throw new Error(`${describe(t)} is not visible within ${Math.round(timeoutMs / 1000)}s`);
      }
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

/** The text strings of a simple PDF (uncompressed text operators), enough to check a total or a name. */
async function pdfText(buf: Buffer): Promise<string> {
  const raw = buf.toString("latin1");
  const parts: string[] = [];
  for (const m of raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ/g)) {
    const strs = Array.from(m[0].matchAll(/\(((?:\\.|[^\\)])*)\)/g)).map((x) => x[1].replace(/\\([()\\])/g, "$1"));
    parts.push(strs.join(""));
  }
  return parts.join(" ") || raw;
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
