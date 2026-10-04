import type { Locator, Page } from "@playwright/test";
import { recipesFor } from "../../ai/learned.js";

/**
 * FINDING AN ELEMENT FROM A PLAN'S WORDS — deterministic, ordered, recorded.
 *
 * A generic step names what it wants the way a person would: "the Publish
 * button", "the field labelled Title", "the text Please add participants".
 * Those words are turned into Playwright locators in a FIXED order of
 * preference, and the strategy that found the element is reported with the
 * step, so a reader can see HOW the automation decided it had the right thing:
 *
 *   1. role + accessible name   (getByRole — what assistive tech sees)
 *   2. label                    (getByLabel — form fields, aria-label)
 *   3. placeholder              (getByPlaceholder — antd inputs often have no label)
 *   4. visible text             (getByText — the last deterministic resort)
 *   5. learned recipe           (a locator a previous AI heal wrote down)
 *
 * The AI healer is NOT here: it ACTS (clicks/fills) rather than finds, so it is
 * offered by the action steps only, as the very last resort. An assertion never
 * asks a model what is on the screen — the oracle stays deterministic.
 */

export interface Target {
  /** ARIA role: button, link, tab, menuitem, checkbox, switch, textbox, combobox, row, heading, dialog, tooltip … */
  role?: string;
  /** Accessible name (with role) — case-insensitive substring unless exact. */
  name?: string;
  /** Form label / aria-label. */
  label?: string;
  /** Visible text. */
  text?: string;
  placeholder?: string;
  /** Match the whole name/text, not a substring. */
  exact?: boolean;
  /**
   * Narrow the search to a region: "dialog" (an open modal or drawer),
   * "menu" (an open dropdown), or any other text — the smallest row/card
   * holding that text.
   */
  within?: string;
}

export interface Found {
  locator: Locator;
  /** Human-readable description of the strategy that matched. */
  strategy: string;
  /** How many VISIBLE elements that strategy matched. */
  visible: number;
}

const ROLES_FOR_NAME = [
  "button", "link", "tab", "menuitem", "checkbox", "radio", "switch", "option",
  "combobox", "textbox", "heading", "columnheader", "row", "cell", "listitem", "dialog",
] as const;

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive, whitespace-tolerant pattern for a name or text. */
export function pattern(s: string, exact = false): RegExp {
  const body = esc(s.trim()).replace(/\s+/g, "\\s*");
  return new RegExp(exact ? `^\\s*${body}\\s*$` : body, "i");
}

/** What a target is called, for messages. */
export function describe(t: Target): string {
  const what = t.name ?? t.label ?? t.text ?? t.placeholder ?? "";
  const role = t.role ? `${t.role} ` : "";
  return `${role}"${what}"${t.within ? ` within ${t.within}` : ""}`;
}

/** The words a target uses — what the compiler checks against known labels. */
export function targetWords(t: Target): string[] {
  return [t.name, t.label, t.text, t.placeholder].filter((x): x is string => !!x && !!x.trim());
}

/** ARIA roles a plan may write in front of a name: `button "Add Bid"`, `tab Responses`. */
const ROLE_WORDS = /^(button|link|tab|menuitem|menu item|checkbox|switch|radio|textbox|combobox|row|heading|dialog|option|cell|columnheader|tooltip)\s+["'“]?(.+?)["'”]?$/i;

/** Split "button Add Bid" / 'tab "Responses"' into role + name; plain text stays text. */
export function parseTargetString(raw: string): Target {
  // "role button name Items 0" — a shape models write despite the contract.
  const rn = raw.trim().match(/^role\s+(\w+)\s+name\s+["'“]?(.+?)["'”]?$/i);
  if (rn) return { role: rn[1].toLowerCase(), name: rn[2].trim() };
  const m = raw.trim().match(ROLE_WORDS);
  if (m) return { role: m[1].toLowerCase().replace(/\s+/g, ""), name: m[2].trim() };
  return { text: raw.trim().replace(/^["'“](.*)["'”]$/, "$1") };
}

export function targetFromArgs(a: Record<string, unknown>): Target {
  if (typeof a.target === "string" && a.target.trim() && !a.name && !a.text && !a.label && !a.placeholder && !a.control) {
    const parsed = parseTargetString(a.target);
    return { ...parsed, role: (a.role ? String(a.role).toLowerCase() : parsed.role), exact: a.exact === true, within: a.within ? String(a.within) : undefined };
  }
  const s = (k: string) => (a[k] === undefined || a[k] === null || a[k] === "" ? undefined : String(a[k]));
  const t: Target = {
    role: s("role")?.toLowerCase(),
    name: s("name") ?? s("control"),
    label: s("label"),
    text: s("text") ?? s("target"),
    placeholder: s("placeholder"),
    exact: a.exact === true,
    within: s("within"),
  };
  // A role with only text/label is still a named role.
  if (t.role && !t.name) t.name = t.text ?? t.label;
  return t;
}

/** The region a target lives in. */
async function scopeFor(page: Page, within?: string): Promise<{ root: Page | Locator; note: string }> {
  if (!within) return { root: page, note: "" };
  const w = within.trim();
  if (/^(dialog|drawer|modal)$/i.test(w)) {
    const dlg = page.locator(".ant-drawer-open .ant-drawer-content, .ant-modal-content, [role='dialog']").filter({ visible: true }).last();
    return { root: dlg, note: " (inside the open dialog/drawer)" };
  }
  if (/^(menu|dropdown)$/i.test(w)) {
    const m = page.locator(".ant-dropdown:not(.ant-dropdown-hidden), [role='menu'], .ant-select-dropdown:not(.ant-select-dropdown-hidden)").filter({ visible: true }).last();
    return { root: m, note: " (inside the open menu)" };
  }
  // A text anchor: the smallest row-like block that holds it.
  const rowish = page
    .locator("tr, [role='row'], li, [role='listitem'], .ant-list-item, .ant-card, [class*='row' i], [class*='card' i]")
    .filter({ hasText: pattern(w) })
    .filter({ visible: true });
  const n = await rowish.count().catch(() => 0);
  if (n) {
    // The LAST match in document order is usually the innermost.
    let best = rowish.first();
    let bestLen = Number.POSITIVE_INFINITY;
    for (let i = 0; i < Math.min(n, 25); i++) {
      const len = ((await rowish.nth(i).innerText().catch(() => "")) || "").length;
      if (len && len < bestLen) {
        bestLen = len;
        best = rowish.nth(i);
      }
    }
    return { root: best, note: ` (inside the block holding "${w}")` };
  }
  // No such block: an impossible scope, so nothing is found inside it.
  return { root: page.locator(`xpath=//*[false()]`), note: ` (no block holding "${w}" is on screen)` };
}

/** The candidate locators for a target, in strategy order. */
async function candidates(page: Page, t: Target): Promise<Array<{ loc: Locator; strategy: string }>> {
  const { root, note } = await scopeFor(page, t.within);
  const out: Array<{ loc: Locator; strategy: string }> = [];
  const named = t.name ?? t.label ?? t.text;
  if (t.role && named) {
    out.push({ loc: root.getByRole(t.role as any, { name: pattern(named, t.exact) }), strategy: `role ${t.role} + name "${named}"${note}` });
  } else if (t.name) {
    for (const r of ROLES_FOR_NAME) out.push({ loc: root.getByRole(r, { name: pattern(t.name, t.exact) }), strategy: `role ${r} + name "${t.name}"${note}` });
  }
  const lab = t.label ?? (t.role ? undefined : t.name);
  if (lab) out.push({ loc: root.getByLabel(pattern(lab, t.exact)), strategy: `label "${lab}"${note}` });
  if (t.placeholder ?? lab) {
    const ph = (t.placeholder ?? lab)!;
    out.push({ loc: root.getByPlaceholder(pattern(ph, t.exact)), strategy: `placeholder "${ph}"${note}` });
  }
  const txt = t.text ?? t.name ?? t.label;
  if (txt) {
    out.push({ loc: root.getByText(pattern(txt, t.exact)), strategy: `visible text "${txt}"${note}` });
    out.push({ loc: root.getByTitle(pattern(txt, t.exact)), strategy: `title attribute "${txt}"${note}` });
  }
  // A locator a past AI heal recorded for these words.
  for (const r of recipesFor(`generic:${(named ?? t.placeholder ?? "").toLowerCase()}`)) {
    if (r.kind === "role") out.push({ loc: page.getByRole(r.value as any, r.name ? { name: r.name } : {}), strategy: `learned recipe role ${r.value}` });
    else if (r.kind === "text") out.push({ loc: page.getByText(r.value), strategy: `learned recipe text "${r.value}"` });
  }
  return out;
}

async function visibleCount(loc: Locator, cap = 50): Promise<{ n: number; first: Locator | null }> {
  const total = await loc.count().catch(() => 0);
  let n = 0;
  let first: Locator | null = null;
  for (let i = 0; i < Math.min(total, cap); i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      n++;
      if (!first) first = el;
    }
  }
  return { n, first };
}

/**
 * Find the first VISIBLE element for a target, polling every strategy until
 * one matches or the budget runs out. Returns null — never throws — so the
 * caller decides what "not found" means.
 */
export async function findVisible(page: Page, t: Target, timeoutMs = 15_000): Promise<Found | null> {
  const deadline = Date.now() + Math.max(500, timeoutMs);
  do {
    for (const c of await candidates(page, t)) {
      const { n, first } = await visibleCount(c.loc);
      if (n && first) return { locator: first, strategy: c.strategy, visible: n };
    }
    await page.waitForTimeout(300);
  } while (Date.now() < deadline);
  return null;
}

/**
 * How many visible elements match, by the FIRST strategy that matches any.
 * When none matches, every strategy was tried and saw zero — that is what an
 * absence check needs to be able to say.
 */
export async function countVisible(page: Page, t: Target): Promise<{ n: number; strategy: string }> {
  const tried: string[] = [];
  for (const c of await candidates(page, t)) {
    const { n } = await visibleCount(c.loc, 200);
    if (n) return { n, strategy: c.strategy };
    tried.push(c.strategy.split(" (")[0]);
  }
  return { n: 0, strategy: `none of ${tried.length} strategies matched (${tried.slice(0, 4).join("; ")}${tried.length > 4 ? "; …" : ""})` };
}

/** Is a found element disabled, by any of the ways antd marks it? */
export async function isDisabled(el: Locator): Promise<boolean> {
  if (await el.isDisabled().catch(() => false)) return true;
  if ((await el.getAttribute("aria-disabled").catch(() => null)) === "true") return true;
  const cls = (await el.getAttribute("class").catch(() => "")) ?? "";
  if (/\b(ant-btn-disabled|ant-dropdown-menu-item-disabled|ant-menu-item-disabled|ant-tabs-tab-disabled|ant-select-disabled|ant-switch-disabled|ant-checkbox-disabled|disabled)\b/.test(cls)) return true;
  // A disabled antd button wrapped in a span (for its tooltip) is disabled
  // on the inner <button>.
  const inner = el.locator("button[disabled], [aria-disabled='true']").first();
  return (await inner.count().catch(() => 0)) > 0;
}

/** Normalised text for comparisons: case, spacing and punctuation do not decide a verdict. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹%.]+/g, " ").replace(/\s+/g, " ").trim();
