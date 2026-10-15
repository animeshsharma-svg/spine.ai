import type { Locator, Page } from "@playwright/test";

/**
 * THE SCREEN, AS THE EXPLORER READS IT.
 *
 * The explorer decides one action at a time from what is on screen now. An
 * accessibility snapshot alone is the wrong input for that: it has no handle
 * to act on, so the model's answer has to be turned back into a locator and a
 * repeated "Edit" or "View" lands on the wrong row. Instead every control the
 * user could use is numbered in place (a data-spine-ref attribute), listed
 * with its role, its name and where it sits, and the model answers with a
 * number. The action then goes to exactly that element.
 *
 * Controls are what a person can use: buttons, links, fields, tabs, menu
 * items, rows, and anything else the app draws with a pointer cursor (Procol's
 * menus and cards are often plain divs). When a dialog or drawer is open, its
 * controls come first and the ones behind it are marked as such.
 */

export interface Control {
  ref: number;
  role: string;
  name: string;
  /** an input's current value, a checkbox's state */
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  /** the dialog, drawer or table row it sits in */
  where?: string;
  /** behind an open dialog: on screen, but not usable until the dialog closes */
  behind?: boolean;
  tag: string;
  /** off screen now; the action scrolls to it */
  offscreen?: boolean;
}

/** An open dropdown list: still loading, empty, or showing options. */
export interface OpenList {
  state: "loading" | "empty" | "options";
  count: number;
  /** the first few options, as shown */
  sample: string[];
}

export interface ScreenView {
  url: string;
  path: string;
  title: string;
  /** the open dialog or drawer's title, when there is one */
  dialog?: string;
  headings: string[];
  /** toasts, alerts and field errors showing now */
  messages: string[];
  controls: Control[];
  /** the page's visible text, trimmed */
  text: string;
  /** a dropdown list open now, and what it shows */
  openList?: OpenList;
  /** the control that has the keyboard now, when it is one of the listed controls */
  focused?: Control;
  /** changes when the screen does; same fingerprint twice means an action had no effect */
  fingerprint: string;
}

const MAX_CONTROLS = 220;

/** Read the screen and number its controls. */
export async function readView(page: Page): Promise<ScreenView> {
  const raw = await page.evaluate((max: number) => {
    const clean = (t: string | null | undefined, n = 90) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
    for (const el of Array.from(document.querySelectorAll("[data-spine-ref]"))) el.removeAttribute("data-spine-ref");

    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const st = getComputedStyle(el as HTMLElement);
      return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
    };
    const ROLE_OF_TAG: Record<string, string> = { a: "link", button: "button", select: "combobox", textarea: "textbox", summary: "button" };
    const roleOf = (el: Element): string => {
      const r = el.getAttribute("role");
      if (r) return r;
      const tag = el.tagName.toLowerCase();
      if (tag === "input") {
        const t = ((el as HTMLInputElement).type || "text").toLowerCase();
        if (t === "checkbox") return "checkbox";
        if (t === "radio") return "radio";
        if (t === "submit" || t === "button") return "button";
        if (t === "file") return "file";
        if (t === "search") return "searchbox";
        // A text box that offers a list as you type (an autocomplete) is a dropdown, not a plain field.
        if (el.getAttribute("aria-autocomplete") || /listbox|true/.test(el.getAttribute("aria-haspopup") ?? "") || el.hasAttribute("list") || el.closest(".ant-select, .ant-select-auto-complete")) return "combobox";
        return "textbox";
      }
      if (tag === "tr") return "row";
      if ((el as HTMLElement).isContentEditable) return "textbox";
      return ROLE_OF_TAG[tag] ?? "clickable";
    };
    const labelFor = (el: Element): string => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
        if (clean(t)) return t;
      }
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l?.textContent) return l.textContent;
      }
      // An Ant form item's label sits beside the control, not around it.
      const item = el.closest(".ant-form-item, [class*='form-item' i]");
      const lab = item?.querySelector("label, .ant-form-item-label");
      if (lab?.textContent && clean(lab.textContent).length < 60) return lab.textContent;
      // Otherwise the nearest words around it: the smallest box that holds the
      // control and a few words besides its own ("Vendor Name *" beside an empty
      // dropdown). Without this every empty dropdown was named by its
      // placeholder, "Empty", and three different ones read as one step repeated.
      const own = clean((el as HTMLElement).innerText ?? "", 400);
      let box: Element | null = el;
      for (let i = 0; i < 5 && box?.parentElement; i++) {
        box = box.parentElement;
        let around = clean((box as HTMLElement).innerText ?? "", 400);
        if (own && around.startsWith(own)) around = around.slice(own.length);
        else if (own) around = around.replace(own, " ");
        around = clean(around.replace(/\s*\*\s*/g, " "), 400);
        if (!around) continue;
        if (around.length > 40) break; // wide enough to hold other fields' labels too
        // A label has words: a count badge ("1") or a symbol beside the field is not one.
        if (!/[a-z]{2,}/i.test(around)) continue;
        return around;
      }
      return "";
    };
    /** A cell of a table or sheet: its column, and which row. */
    const cellName = (el: Element): string => {
      const cell = el.closest("td, th, [role='gridcell']");
      const row = cell?.closest("tr, [role='row']");
      const table = row?.closest("table, [role='grid'], [role='treegrid']");
      if (!cell || !row || !table) return "";
      // A div grid says which column a cell is in; its header row lives elsewhere in the grid.
      const colIndex = cell.getAttribute("aria-colindex");
      if (colIndex) {
        const header = table.querySelector(`[role='columnheader'][aria-colindex='${colIndex}']`);
        const column = clean((header as HTMLElement | null)?.innerText, 40).replace(/\s*\*$/, "");
        const rowIndex = row.getAttribute("aria-rowindex");
        const text = clean((cell as HTMLElement).innerText, 40);
        if (column) return `${column}${rowIndex ? ` (row ${Math.max(1, Number(rowIndex) - 1)})` : ""}${text ? `: ${text}` : ""}`;
      }
      const rows = Array.from(table.querySelectorAll("tr, [role='row']"));
      const cells = Array.from(row.querySelectorAll(":scope > td, :scope > th, :scope > [role='gridcell']"));
      const col = cells.indexOf(cell);
      const head = table.querySelector("thead tr") ?? rows[0];
      const headCells = head ? Array.from(head.querySelectorAll(":scope > td, :scope > th, :scope > [role='columnheader']")) : [];
      const column = col >= 0 ? clean((headCells[col] as HTMLElement | undefined)?.innerText, 40).replace(/\s*\*$/, "") : "";
      const rowNo = rows.indexOf(row) - (head && rows.includes(head as Element) ? rows.indexOf(head as Element) : 0);
      const text = clean((cell as HTMLElement).innerText, 40);
      if (!column) return text;
      return `${column} (row ${rowNo})${text ? `: ${text}` : ""}`;
    };
    const nameOf = (el: Element, role: string): string => {
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || role === "combobox" || role === "textbox") {
        return clean(labelFor(el) || el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("title"));
      }
      const named = clean(
        el.getAttribute("aria-label") ||
          (el as HTMLElement).innerText ||
          el.getAttribute("title") ||
          el.querySelector("img[alt]")?.getAttribute("alt") ||
          el.querySelector("svg title")?.textContent ||
          (el as HTMLInputElement).value ||
          el.getAttribute("data-testid") ||
          labelFor(el),
      );
      if (named) return named;
      // An icon with no words (the side menu): where it goes, or what its icon is called.
      const href = el.getAttribute("href");
      if (href && !href.startsWith("javascript")) {
        try {
          const u = new URL(href, location.href);
          if (u.origin === location.origin) return `link to ${u.pathname}`;
        } catch {
          /* not a usable address */
        }
      }
      const iconClass = [el, ...Array.from(el.querySelectorAll("[class]")).slice(0, 6)]
        .map((x) => String((x as HTMLElement).className?.toString?.() ?? ""))
        .join(" ")
        .split(/\s+/)
        .find((c) => /icon|ico-|anticon-/i.test(c) && !/^(anticon|icon|pro-icon)$/i.test(c));
      return iconClass ? `icon ${iconClass.replace(/^(anticon-|icon-|ico-)/i, "").replace(/[-_]+/g, " ")}` : "";
    };

    // The open dialog or drawer, if any: the last one in the document is on top.
    const dialogs = Array.from(
      document.querySelectorAll(".ant-modal-wrap, .ant-drawer-open .ant-drawer-content, .ant-drawer.ant-drawer-open, [role='dialog'], .ant-popover:not(.ant-popover-hidden)"),
    ).filter(visible);
    const top = dialogs[dialogs.length - 1] ?? null;
    const dialogTitle = top
      ? clean(top.querySelector(".ant-modal-title, .ant-drawer-title, [class*='title' i], h1, h2, h3, h4")?.textContent, 80)
      : "";

    const INTERACTIVE =
      "a[href], button, input:not([type='hidden']), select, textarea, summary, [contenteditable='true'], " +
      "[role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='menuitemcheckbox'], [role='option'], " +
      "[role='checkbox'], [role='radio'], [role='switch'], [role='combobox'], [role='textbox'], [role='searchbox'], " +
      "[role='treeitem'], [role='gridcell'], .ant-select-selector, .ant-picker, tr[data-row-key], .ant-table-row";
    const picked = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) picked.add(el);
    // Anything drawn with a pointer cursor whose parent is not: the outermost
    // clickable thing (a menu entry, a card), not every span inside it.
    const all = document.body.querySelectorAll("div, span, li, p, img, svg, i, label, td, h1, h2, h3, h4, h5");
    for (let i = 0; i < all.length && i < 12_000; i++) {
      const el = all[i];
      if (picked.has(el)) continue;
      const st = getComputedStyle(el);
      if (st.cursor !== "pointer") continue;
      const parent = el.parentElement;
      if (parent && getComputedStyle(parent).cursor === "pointer") continue;
      if (el.closest(INTERACTIVE)) continue;
      picked.add(el);
    }

    type C = { el: Element; role: string; name: string; value?: string; placeholder?: string; disabled?: boolean; where?: string; behind?: boolean; tag: string; offscreen?: boolean };
    const out: C[] = [];
    for (const el of picked) {
      if (!visible(el)) continue;
      // An input inside an Ant select is listed once, as the select.
      if (el.tagName === "INPUT" && el.closest(".ant-select-selector") && picked.has(el.closest(".ant-select-selector")!)) continue;
      const role = el.matches(".ant-select-selector") ? "combobox" : el.matches(".ant-picker") ? "datepicker" : roleOf(el);
      let name = nameOf(el, role);
      if (role === "combobox" && el.matches(".ant-select-selector")) {
        const shown = clean(el.querySelector(".ant-select-selection-item, .ant-select-selection-placeholder")?.textContent);
        name = clean(labelFor(el.closest(".ant-select") ?? el) || shown || "select");
      }
      // A sheet's cells: by column and row, not "gridcell" or whatever is typed in them.
      if ((role === "gridcell" || el.tagName === "TD" || el.closest(".data-grid-container")) && el.closest("table, [role='grid'], [role='treegrid']")) {
        const cn = cellName(el);
        if (cn) name = cn;
      }
      if (!name && role === "clickable") continue;
      const tag = el.tagName.toLowerCase();
      const input = el as HTMLInputElement;
      let value: string | undefined;
      if (role === "checkbox" || role === "radio" || role === "switch") {
        const on = input.checked ?? el.getAttribute("aria-checked") === "true";
        value = on || el.getAttribute("aria-checked") === "true" || el.classList.contains("ant-checkbox-wrapper-checked") ? "checked" : "unchecked";
      } else if (tag === "input" || tag === "textarea") {
        value = input.type === "password" ? (input.value ? "••••" : "") : clean(input.value, 60);
      } else if (tag === "select") {
        value = clean((el as HTMLSelectElement).selectedOptions?.[0]?.textContent, 60);
      } else if (role === "combobox") {
        value = clean(el.querySelector(".ant-select-selection-item")?.textContent, 60);
      } else if (role === "tab") {
        value = el.getAttribute("aria-selected") === "true" || el.classList.contains("ant-tabs-tab-active") ? "selected" : undefined;
      }
      const disabled =
        (el as HTMLButtonElement).disabled === true ||
        el.getAttribute("aria-disabled") === "true" ||
        /\b(ant-btn-disabled|disabled)\b/.test(el.className?.toString?.() ?? "");
      const row = el.closest("tr");
      const rowText = row && row !== el ? clean((row as HTMLElement).innerText, 70) : "";
      const inDialog = top ? top.contains(el) : false;
      const where = inDialog && dialogTitle ? `in “${dialogTitle}”` : rowText ? `row: ${rowText}` : undefined;
      const r = (el as HTMLElement).getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      out.push({
        el,
        role,
        name: role === "row" ? clean(name, 140) : name,
        value: value || undefined,
        placeholder: clean(el.getAttribute("placeholder"), 50) || undefined,
        disabled: disabled || undefined,
        where,
        behind: top ? !inDialog : undefined,
        tag,
        offscreen: offscreen || undefined,
      });
    }
    // The dialog's controls first, then the page's; on-screen before off-screen.
    out.sort((a, b) => Number(!!a.behind) - Number(!!b.behind) || Number(!!a.offscreen) - Number(!!b.offscreen));
    const kept = out.slice(0, max);
    const controls = kept.map((c, i) => {
      c.el.setAttribute("data-spine-ref", String(i + 1));
      const { el: _el, ...rest } = c;
      return { ref: i + 1, ...rest };
    });

    const headings = Array.from(document.querySelectorAll("h1, h2, h3, .ant-page-header-heading-title, .ant-drawer-title, .ant-modal-title, [class*='page-title' i], [class*='header-title' i]"))
      .filter(visible)
      .map((h) => clean(h.textContent, 80))
      .filter(Boolean)
      .slice(0, 12);
    const messages = Array.from(
      document.querySelectorAll(".ant-message-notice, .ant-notification-notice, [role='alert'], .ant-form-item-explain-error, .ant-alert, [class*='toast' i], [class*='error-message' i]"),
    )
      .filter(visible)
      .map((m) => clean((m as HTMLElement).innerText, 200))
      .filter(Boolean)
      .slice(0, 8);
    const text = clean((top as HTMLElement | null)?.innerText ?? "", 1500) + (top ? "\n— behind it —\n" : "") + clean(document.body.innerText, top ? 1500 : 3000);
    // Where typing goes now: a select that opens as an empty text box (search
    // as you type) only lists anything once letters are typed into it.
    const active = document.activeElement;
    const holder = active && active !== document.body ? (active.closest("[data-spine-ref]") ?? active.querySelector?.("[data-spine-ref]")) : null;
    const focusedRef = holder ? Number(holder.getAttribute("data-spine-ref")) : 0;
    return { title: document.title, dialog: dialogTitle || (top ? "a dialog" : ""), headings, messages, controls, text, focusedRef };
  }, MAX_CONTROLS);

  const openList = (await readOpenList(page)) ?? undefined;
  const url = page.url();
  let path = url;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    /* keep the url */
  }
  const fingerprint = hash(
    [path, raw.dialog, raw.messages.join("|"), openList ? `${openList.state}:${openList.count}` : "", raw.controls.map((c) => `${c.role}:${c.name}:${c.value ?? ""}`).join("|"), raw.text.slice(0, 1500)].join("\n"),
  );
  const focused = raw.focusedRef ? raw.controls.find((c) => c.ref === raw.focusedRef) : undefined;
  return { url, path, title: raw.title, dialog: raw.dialog || undefined, headings: raw.headings, messages: raw.messages, controls: raw.controls, text: raw.text, openList, focused, fingerprint };
}

/**
 * The dropdown list open now, if any. UAT's vendor search often shows only a
 * spinner for 15 s or more; an explorer that cannot see "still loading"
 * clicks the field again, which closes the list (seen on 14 Oct: Vendor Name
 * three times, never a vendor).
 */
export async function readOpenList(page: Page): Promise<OpenList | null> {
  return page
    .evaluate(() => {
      const shown = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const st = getComputedStyle(el as HTMLElement);
        return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none";
      };
      const lists = Array.from(document.querySelectorAll(".ant-select-dropdown:not(.ant-select-dropdown-hidden), [role='listbox']")).filter(shown);
      const list = lists[lists.length - 1];
      if (!list) return null;
      const options = Array.from(list.querySelectorAll(".ant-select-item-option, .ant-select-dropdown-menu-item, [role='option']")).filter(shown);
      const loading = !!list.querySelector(".ant-spin, .ant-spin-spinning, [class*='loading' i], [class*='spinner' i]") || /^\s*loading/i.test((list as HTMLElement).innerText || "");
      const words = (el: Element) => ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
      if (options.length) return { state: "options" as const, count: options.length, sample: options.slice(0, 5).map(words).filter(Boolean) };
      if (loading) return { state: "loading" as const, count: 0, sample: [] };
      return { state: "empty" as const, count: 0, sample: [words(list)].filter(Boolean) };
    })
    .catch(() => null);
}

/** Wait while an open list is loading (up to maxMs); how long it took, and how it ended. */
export async function waitForList(page: Page, maxMs = 20_000, appearMs = 0): Promise<{ waitedMs: number; list: OpenList | null }> {
  const started = Date.now();
  for (;;) {
    const list = await readOpenList(page);
    const waiting = list ? list.state === "loading" : Date.now() - started < appearMs;
    if (!waiting || Date.now() - started >= maxMs) return { waitedMs: Date.now() - started, list };
    await page.waitForTimeout(500);
  }
}

/** The open list in words, for the model and for the tester. */
export function listWords(l: OpenList): string {
  if (l.state === "loading") return "A dropdown list is open but still loading (a spinner, no options yet).";
  if (l.state === "empty") return `A dropdown list is open but empty${l.sample[0] ? ` (it says “${l.sample[0]}”)` : ""}.`;
  return `A dropdown list is open with ${l.count} option${l.count === 1 ? "" : "s"}${l.sample.length ? ` (first: ${l.sample.map((x) => `“${x}”`).join(", ")})` : ""}.`;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** One control as a line of the list the model reads. */
export function controlLine(c: Control): string {
  const bits = [`[${c.ref}] ${c.role} “${c.name || "(no name)"}”`];
  if (c.value) bits.push(`= “${c.value}”`);
  if (c.placeholder && c.placeholder !== c.name) bits.push(`placeholder “${c.placeholder}”`);
  if (c.disabled) bits.push("(disabled)");
  if (c.where) bits.push(c.where);
  if (c.behind) bits.push("(behind the dialog)");
  if (c.offscreen) bits.push("(scroll to see)");
  return bits.join(" ");
}

/** The screen as the model reads it: where it is, what it says, what can be used. */
export function viewText(v: ScreenView, maxChars = 11_000): string {
  const lines = [`Address: ${v.path}`, `Page title: ${v.title || "(none)"}`];
  if (v.dialog) lines.push(`Open dialog/drawer: ${v.dialog}`);
  if (v.headings.length) lines.push(`Headings: ${v.headings.join(" · ")}`);
  if (v.messages.length) lines.push(`Messages on screen: ${v.messages.map((m) => `“${m}”`).join(" · ")}`);
  if (v.openList) lines.push(`Open dropdown: ${listWords(v.openList)}`);
  if (v.focused) lines.push(`Typing goes to: [${v.focused.ref}] ${v.focused.role} “${v.focused.name || "(no name)"}”${v.focused.value ? ` = “${v.focused.value}”` : " (empty)"}${v.openList ? "" : " — no list is open"}`);
  lines.push("", "CONTROLS:");
  let used = lines.join("\n").length;
  for (const c of v.controls) {
    const l = controlLine(c);
    if (used + l.length > maxChars * 0.7) {
      lines.push(`… ${v.controls.length - c.ref + 1} more controls not listed`);
      break;
    }
    lines.push(l);
    used += l.length + 1;
  }
  lines.push("", "VISIBLE TEXT:", v.text.slice(0, Math.max(800, maxChars - used - 40)));
  return lines.join("\n");
}

/** The element a ref names, as numbered by the last readView. */
export function refLocator(page: Page, ref: number): Locator {
  return page.locator(`[data-spine-ref="${ref}"]`);
}

/**
 * How to find a control again on a later run, when the ref numbers are long
 * gone: by its role and name, the way a person would describe it.
 */
export interface Recipe {
  role: string;
  name: string;
  placeholder?: string;
  where?: string;
  tag?: string;
}

export function recipeOf(c: Control): Recipe {
  return { role: c.role, name: c.name, placeholder: c.placeholder, where: c.where, tag: c.tag };
}

const ARIA_ROLES = new Set([
  "button", "link", "tab", "menuitem", "menuitemcheckbox", "option", "checkbox", "radio", "switch",
  "combobox", "textbox", "searchbox", "treeitem", "row", "gridcell",
]);
const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\s*$`, "i");

/** Find a recipe's control on the page now; null when nothing matches. */
export async function findByRecipe(page: Page, r: Recipe, timeoutMs = 8_000): Promise<Locator | null> {
  const tries: Locator[] = [];
  if (r.name && ARIA_ROLES.has(r.role)) tries.push(page.getByRole(r.role as Parameters<Page["getByRole"]>[0], { name: exact(r.name) }));
  if (r.placeholder) tries.push(page.getByPlaceholder(exact(r.placeholder)));
  if (r.name && (r.role === "textbox" || r.role === "combobox")) tries.push(page.getByLabel(exact(r.name)));
  if (r.name) tries.push(page.getByText(exact(r.name)));
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    for (const t of tries) {
      const first = t.first();
      if (await first.isVisible().catch(() => false)) return first;
    }
    await page.waitForTimeout(400);
  }
  return null;
}
