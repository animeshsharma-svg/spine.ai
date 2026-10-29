import type { Frame, Locator, Page } from "@playwright/test";

/** Where a search starts: the page, one of its frames, or a region inside either. */
type Root = Page | Frame | Locator;
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
  /** Only the role strategy: a checkbox named X, never the word X somewhere on the page. */
  strict?: boolean;
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
  /** The whole match set of that strategy, so a caller can try the next one. */
  all: Locator;
}

const ROLES_FOR_NAME = [
  "button", "link", "tab", "menuitem", "checkbox", "radio", "switch", "option",
  "combobox", "textbox", "heading", "columnheader", "row", "cell", "listitem", "dialog",
] as const;

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Characters a screen may put inside a word that a person never types:
 * soft hyphens, zero-width spaces/joiners, word joiners, the BOM.
 */
const INVISIBLE = "\\u00AD\\u200B-\\u200D\\u2060\\uFEFF";

/**
 * Case-insensitive pattern for a name or text that tolerates what the eye
 * ignores: any spacing ("Log in" finds "Login" and vice versa), invisible
 * characters inside words, and smart vs plain quotes/dashes.
 */
export function pattern(s: string, exact = false): RegExp {
  const gap = `[\\s${INVISIBLE}]*`;
  const body = Array.from(s.trim())
    .filter((ch) => !/\s/.test(ch))
    .map((ch) => {
      if (/['\u2018\u2019]/.test(ch)) return "['\u2018\u2019]";
      if (/["\u201C\u201D]/.test(ch)) return '["\u201C\u201D]';
      if (/[-\u2010-\u2015]/.test(ch)) return "[-\u2010-\u2015]";
      return esc(ch);
    })
    .join(gap);
  return new RegExp(exact ? `^\\s*${body}\\s*$` : body, "i");
}

/** Text as a person reads it: no invisible characters, single spaces. */
export const visibleText = (s: string) => s.replace(new RegExp(`[${INVISIBLE}]`, "g"), "").replace(/\s+/g, " ").trim();

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
export async function scopeFor(root: Root, within?: string): Promise<{ root: Root; note: string }> {
  if (!within) return { root, note: "" };
  const w = within.trim();
  if (/^(dialog|drawer|modal)$/i.test(w)) {
    const dlg = root.locator(".ant-drawer-open .ant-drawer-content, .ant-modal-content, [role='dialog'], [role='alertdialog']").filter({ visible: true }).last();
    return { root: dlg, note: " (inside the open dialog/drawer)" };
  }
  if (/^(menu|dropdown|nav|navigation|top menu|menu bar|menubar|header)$/i.test(w)) {
    // An OPEN dropdown first; else the page's navigation.
    const open = root.locator(".ant-dropdown:not(.ant-dropdown-hidden), [role='menu'], .ant-select-dropdown:not(.ant-select-dropdown-hidden), [role='listbox']").filter({ visible: true });
    if (await open.count().catch(() => 0)) return { root: open.last(), note: " (inside the open menu)" };
    // Every visible navigation block (a page has a sidebar AND a top menu): the union is the scope.
    const nav = root.locator("nav, [role='navigation'], [role='menubar'], header, .ant-menu").filter({ visible: true });
    if (await nav.count().catch(() => 0)) return { root: nav, note: " (inside the navigation)" };
    return { root: root.locator("xpath=//*[false()]"), note: " (no menu or navigation is on screen)" };
  }
  if (/^(main|content|page body|main area)$/i.test(w)) {
    const main = root.locator("main, [role='main']").filter({ visible: true });
    if (await main.count().catch(() => 0)) return { root: main.first(), note: " (inside the main area)" };
    return { root, note: "" };
  }
  if (/^(frame|iframe)$/i.test(w)) return { root, note: " (in a frame)" };
  if (/^(footer|page footer|contentinfo)$/i.test(w)) {
    const foot = root.locator("footer, [role='contentinfo']").filter({ visible: true });
    if (await foot.count().catch(() => 0)) return { root: foot, note: " (inside the footer)" };
    return { root: root.locator("xpath=//*[false()]"), note: " (no footer is on screen)" };
  }
  const re = pattern(w);
  // 1. A region NAMED that: aria-label, a table/section/form/group caption or legend.
  const named = root
    .locator("table, section, form, fieldset, nav, aside, article, [role='region'], [role='group'], [role='dialog'], [role='tabpanel'], [role='list'], [role='grid'], [role='table'], [role='treeitem'], [aria-label]:not(img):not(svg):not([role='img']):not(button):not(a):not(input):not(select), [aria-labelledby]:not(input):not(select)")
    .filter({ visible: true })
    .filter({ has: root.locator("xpath=./*") });
  const n0 = await named.count().catch(() => 0);
  for (let i = 0; i < Math.min(n0, 60); i++) {
    const el = named.nth(i);
    const title = await el
      .evaluate((node) => {
        const e = node as HTMLElement;
        const byId = e.getAttribute("aria-labelledby");
        const labelled = byId ? byId.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : "";
        const caption = e.querySelector(":scope > caption, :scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header")?.textContent ?? "";
        return [e.getAttribute("aria-label") ?? "", labelled, caption].join(" | ");
      })
      .catch(() => "");
    if (re.test(title)) return { root: el, note: ` (inside the region "${w}")` };
  }
  // 2. A heading reading that: the block it introduces (its parent).
  const heading = root.getByRole("heading", { name: re }).filter({ visible: true });
  if (await heading.count().catch(() => 0)) {
    // The block a heading introduces: its parent when the heading is the only
    // one there; otherwise the siblings after it up to the next heading of
    // the same level (several models listed one after another in one box).
    const marked = await heading
      .first()
      .evaluate((node) => {
        const h = node as HTMLElement;
        document.querySelectorAll("[data-qa-scope-block]").forEach((x) => x.removeAttribute("data-qa-scope-block"));
        // A heading alone in a wrapper: the wrapper stands for the heading.
        let top: HTMLElement = h;
        while (top.parentElement && top.parentElement.children.length === 1 && top.parentElement.tagName !== "BODY") top = top.parentElement;
        const parent = top.parentElement;
        if (!parent) return 0;
        const tag = h.tagName;
        // Other headings of the same level among the siblings: the block ends at the next one.
        // The block under a heading: what follows it until the next heading of
        // its level (or the end of the container when it is the only one).
        let n = 0;
        for (let sib = top.nextElementSibling; sib && sib.tagName !== tag && !sib.querySelector(tag); sib = sib.nextElementSibling) {
          sib.setAttribute("data-qa-scope-block", "1");
          n++;
        }
        return n;
      })
      .catch(() => 0);
    if (marked) return { root: root.locator("[data-qa-scope-block='1']"), note: ` (inside the block under the heading "${w}")` };
    return { root: heading.first().locator("xpath=.."), note: ` (inside the block under the heading "${w}")` };
  }
  // 3. A text anchor: the smallest row-like block that holds it.
  const rowish = root
    .locator("tr, [role='row'], li, [role='listitem'], article, [role='article'], section, .ant-list-item, .ant-card, [class*='row' i], [class*='card' i], [class*='item' i], [class*='tile' i], [class*='review' i], [class*='comment' i], [class*='result' i], [class*='product' i], label, fieldset, p")
    .filter({ hasText: re })
    .filter({ visible: true });
  const n = await rowish.count().catch(() => 0);
  if (n) {
    // The smallest block holding the words is the innermost — the row, not the table.
    let best = rowish.first();
    let bestLen = Number.POSITIVE_INFINITY;
    for (let i = 0; i < Math.min(n, 40); i++) {
      const len = ((await rowish.nth(i).innerText().catch(() => "")) || "").length;
      if (len && len < bestLen) {
        bestLen = len;
        best = rowish.nth(i);
      }
    }
    // A block with no control in it (a paragraph naming the card) widens to
    // the card: the siblings between the heading before it and the next one.
    const hasControl = await best.locator("button, a[href], input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='tab'], [role='menuitem']").count().catch(() => 0);
    if (!hasControl) {
      const marked = await best
        .evaluate((node) => {
          document.querySelectorAll("[data-qa-scope-block]").forEach((x) => x.removeAttribute("data-qa-scope-block"));
          const el = node as HTMLElement;
          const isHeading = /^H[1-6]$/;
          let head: Element | null = el;
          while (head && !isHeading.test(head.tagName)) head = head.previousElementSibling;
          if (!head) return 0;
          let n = 0;
          for (let sib: Element | null = head; sib && (sib === head || !isHeading.test(sib.tagName)); sib = sib.nextElementSibling) {
            sib.setAttribute("data-qa-scope-block", "1");
            n++;
          }
          return n;
        })
        .catch(() => 0);
      if (marked) return { root: root.locator("[data-qa-scope-block='1']"), note: ` (inside the card holding "${w}")` };
      // Else climb until a block holds a control (a review card with its button two levels up).
      let up = best;
      for (let i = 0; i < 4; i++) {
        up = up.locator("xpath=..");
        const tag = await up.evaluate((n) => n.nodeName.toLowerCase()).catch(() => "html");
        if (tag === "body" || tag === "html" || tag === "#document") break;
        // A form control, not a mere link: the product's own link is not what "within the product" is for.
        if (await up.locator("button, input, select, textarea, [role='button'], [role='checkbox'], [role='radio'], [role='switch'], [role='combobox'], [role='spinbutton']").count().catch(() => 0)) {
          return { root: up, note: ` (inside the block around "${w}")` };
        }
      }
      return { root: best.locator("xpath=.."), note: ` (inside the block around "${w}")` };
    }
    // A table row that was expanded shows its details in the row after it.
    const tag = await best.evaluate((n) => n.nodeName.toLowerCase()).catch(() => "");
    if (tag === "tr") {
      const details = best.locator("xpath=following-sibling::tr[1][td[@colspan] or contains(@class,'detail') or contains(@class,'expand')]");
      if (await details.count().catch(() => 0)) return { root: best.or(details), note: ` (inside the row holding "${w}" and its details)` };
    }
    return { root: best, note: ` (inside the block holding "${w}")` };
  }
  // No row-like block: the words themselves, then the nearest block around them that holds a control.
  const words = root.getByText(re).filter({ visible: true });
  if (await words.count().catch(() => 0)) {
    let up = words.first();
    for (let i = 0; i < 5; i++) {
      up = up.locator("xpath=..");
      const tag = await up.evaluate((n) => n.nodeName.toLowerCase()).catch(() => "html");
      if (tag === "body" || tag === "html" || tag === "#document") break;
      if (await up.locator("button, input, select, textarea, [role='button'], [role='checkbox'], [role='radio'], [role='switch'], [role='combobox'], [role='link'], a[href]").count().catch(() => 0)) {
        return { root: up, note: ` (inside the block around "${w}")` };
      }
    }
  }
  // "enquiry form", "results table": the distinctive word alone names the region when the phrase does not.
  const GENERIC = /^(form|section|area|panel|box|dialog|list|table|card|region|block|group|the|a|an|of|in|on)$/i;
  const distinct = w.split(/\s+/).filter((x) => x.length >= 4 && !GENERIC.test(x)).sort((x, y) => y.length - x.length)[0];
  if (distinct && distinct !== w) return scopeFor(root, distinct);
  // No such block: an impossible scope, so nothing is found inside it.
  return { root: root.locator(`xpath=//*[false()]`), note: ` (no block holding "${w}" is on screen)` };
}

/** The candidate locators for a target, in strategy order. */
async function candidates(start: Root, t: Target): Promise<Array<{ loc: Locator; strategy: string }>> {
  const { root, note } = await scopeFor(start, t.within);
  const out: Array<{ loc: Locator; strategy: string }> = [];
  const named = t.name ?? t.label ?? t.text;
  if (t.role && named) {
    out.push({ loc: root.getByRole(t.role as any, { name: pattern(named, t.exact) }), strategy: `role ${t.role} + name "${named}"${note}` });
    if (t.strict) return out;
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
  // Words given with no role may still be a control's accessible NAME rather
  // than its visible text: a calendar day reads "12" but is named "12 December
  // 2026"; an icon button is named by its aria-label. Try the named controls last.
  if (t.text && !t.role && !t.name) {
    if (!lab) out.push({ loc: root.getByLabel(pattern(t.text, t.exact)), strategy: `aria-label "${t.text}"${note}` });
    for (const r of ROLES_FOR_NAME) out.push({ loc: root.getByRole(r, { name: pattern(t.text, t.exact) }), strategy: `role ${r} + name "${t.text}"${note}` });
  }
  // The same words in another order ("Child age" for a field labelled "Age of child 1"): every word
  // must appear, as a whole word, in the label or name. Last, so an exact phrase always wins.
  const phrase = (t.label ?? t.name ?? t.text ?? "").trim();
  const words = phrase.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length >= 2) {
    const anyOrder = new RegExp(words.map((w) => `(?=.*(?<![a-z0-9])${esc(w)}(?![a-z0-9]))`).join(""), "i");
    if (t.role) out.push({ loc: root.getByRole(t.role as any, { name: anyOrder }), strategy: `role ${t.role} + the words "${phrase}" in any order${note}` });
    out.push({ loc: root.getByLabel(anyOrder), strategy: `label with the words "${phrase}" in any order${note}` });
    if (!t.role) for (const r of ["button", "link", "textbox", "combobox", "checkbox", "tab"] as const) out.push({ loc: root.getByRole(r, { name: anyOrder }), strategy: `role ${r} + the words "${phrase}" in any order${note}` });
  }
  // A locator a past AI heal recorded for these words.
  for (const r of recipesFor(`generic:${(named ?? t.placeholder ?? "").toLowerCase()}`)) {
    if (r.kind === "role") out.push({ loc: start.getByRole(r.value as any, r.name ? { name: r.name } : {}), strategy: `learned recipe role ${r.value}` });
    else if (r.kind === "text") out.push({ loc: start.getByText(r.value), strategy: `learned recipe text "${r.value}"` });
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
 * Every place to look: the page, then each child frame (a page that embeds a
 * form in an iframe shows it to a person as one screen; the finder sees it
 * the same way). The frame is named on the strategy.
 */
async function roots(page: Page, t: Target): Promise<Array<{ root: Root; where: string }>> {
  const out: Array<{ root: Root; where: string }> = [{ root: page, where: "" }];
  if (t.within && /^(frame|iframe)$/i.test(t.within)) out.shift();
  for (const f of page.frames().slice(1)) {
    if (f.isDetached()) continue;
    let where = "";
    try {
      where = ` in frame ${new URL(f.url()).pathname || f.name() || ""}`.replace(/ in frame $/, " in a frame");
    } catch {
      where = " in a frame";
    }
    out.push({ root: f, where });
  }
  return out;
}

/**
 * Find the first VISIBLE element for a target, polling every strategy until
 * one matches or the budget runs out. Returns null — never throws — so the
 * caller decides what "not found" means.
 */
export async function findVisible(page: Page, t: Target, timeoutMs = 15_000): Promise<Found | null> {
  const deadline = Date.now() + Math.max(500, timeoutMs);
  do {
    for (const { root, where } of await roots(page, t)) {
      for (const c of await candidates(root, t)) {
        const { n, first } = await visibleCount(c.loc);
        if (n && first) return { locator: first, strategy: c.strategy + where, visible: n, all: c.loc };
      }
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
  for (const { root, where } of await roots(page, t)) {
    for (const c of await candidates(root, t)) {
      const { n } = await visibleCount(c.loc, 200);
      if (n) return { n, strategy: c.strategy + where };
      if (!where) tried.push(c.strategy.split(" (")[0]);
    }
  }
  return { n: 0, strategy: `none of ${tried.length} strategies matched (${tried.slice(0, 4).join("; ")}${tried.length > 4 ? "; …" : ""})` };
}

/** The visible elements a found strategy matched, in document order (for trying the next one). */
export async function visibleMatches(found: Found, cap = 20): Promise<Locator[]> {
  const out: Locator[] = [];
  const total = await found.all.count().catch(() => 0);
  for (let i = 0; i < Math.min(total, cap); i++) {
    const el = found.all.nth(i);
    if (await el.isVisible().catch(() => false)) out.push(el);
  }
  return out;
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
