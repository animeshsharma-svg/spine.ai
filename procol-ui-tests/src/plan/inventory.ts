/**
 * WHAT IS ON THIS SCREEN — a structured inventory of every visible control, read from the DOM.
 *
 * It is the input for writing test cases from a screen (prototype/src/agents/screenCases.ts).
 * The screenshot shows a person what was there; this inventory is what a case may name: a
 * draft that names a control not in it is dropped, so no case is written about a button that
 * does not exist. Read-only — it clicks nothing.
 */
import type { Page } from "@playwright/test";

export interface InventoryControl {
  kind: "button" | "link" | "tab" | "field" | "select" | "switch" | "checkbox" | "column" | "menuitem";
  name: string;
  disabled?: boolean;
  /** the button is styled as destructive (antd danger / red) — listed, never pressed by a crawl */
  danger?: boolean;
  required?: boolean;
  placeholder?: string;
  /** a tooltip or title the control carries (often the reason it is disabled) */
  hint?: string;
  inputType?: string;
  maxLength?: number;
  selected?: boolean;
  checked?: boolean;
  /** 1-based number, as drawn on the annotated map picture */
  n?: number;
  /** where it is on the screen (viewport pixels), so a picture can frame it and a hover can find it */
  box?: { x: number; y: number; w: number; h: number };
  /** below or beside the viewport when the inventory was taken (not on the screenshot) */
  offscreen?: boolean;
}

export interface ScreenInventory {
  url: string;
  path: string;
  title: string;
  headings: string[];
  controls: InventoryControl[];
  /** banners, alerts, empty states and helper text the screen shows unprompted */
  messages: string[];
  /** the viewport the boxes are measured in */
  viewport?: { w: number; h: number };
  takenAt: string;
}

export async function screenInventory(page: Page): Promise<ScreenInventory> {
  const data = await page.evaluate(() => {
    const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    // separate text pieces joined by spaces: a tab "LIVE" with a count badge "7950" reads
    // "LIVE 7950", not "LIVE7950"; a button with a shortcut badge reads "Create Event M"
    const textOf = (el: Element): string => {
      const parts: string[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const t = clean(n.textContent);
        if (t) parts.push(t);
      }
      return parts.join(" ");
    };
    const out: any[] = [];
    const seen = new Set<string>();
    const vw = window.innerWidth, vh = window.innerHeight;
    const add = (c: any, el?: Element) => {
      c.name = clean(c.name).slice(0, 90);
      if (!c.name || /^\d+([.,]\d+)?$/.test(c.name)) return;
      const k = `${c.kind}|${c.name}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (el) {
        const r = (el as HTMLElement).getBoundingClientRect();
        c.box = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) c.offscreen = true;
      }
      c.n = out.length + 1;
      out.push(c);
    };
    const labelFor = (el: Element): string => {
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l) return clean(l.textContent);
      }
      const item = el.closest(".ant-form-item, .ant-row, [class*='formItem' i], [class*='field' i]");
      const lab = item?.querySelector(".ant-form-item-label, label");
      return clean(lab?.textContent) || clean(el.getAttribute("aria-label")) || clean(el.getAttribute("placeholder"));
    };
    const requiredOf = (el: Element): boolean => {
      const item = el.closest(".ant-form-item, .ant-row");
      return !!(el as HTMLInputElement).required || el.getAttribute("aria-required") === "true" || !!item?.querySelector(".ant-form-item-required") || /\*\s*$/.test(labelFor(el));
    };
    const hintOf = (el: Element): string | undefined => {
      const h = el.getAttribute("title") || el.closest("[title]")?.getAttribute("title") || el.getAttribute("aria-description") || "";
      return clean(h) || undefined;
    };

    document.querySelectorAll("button, [role='button'], .ant-btn").forEach((el) => {
      if (!visible(el)) return;
      const name = textOf(el) || el.getAttribute("aria-label") || el.getAttribute("title") || "";
      const cls = el.getAttribute("class") || "";
      add({
        kind: "button",
        name,
        disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || /ant-btn-disabled|disabled/.test(cls),
        danger: /ant-btn-danger|danger/.test(cls) || /\b(delete|remove|withdraw|cancel event|reject)\b/i.test(name),
        hint: hintOf(el),
      }, el);
    });
    document.querySelectorAll("[role='tab']").forEach((el) => visible(el) && add({ kind: "tab", name: textOf(el), selected: el.getAttribute("aria-selected") === "true" }, el));
    document.querySelectorAll("[role='menuitem']").forEach((el) => visible(el) && add({ kind: "menuitem", name: textOf(el), disabled: el.getAttribute("aria-disabled") === "true" || /disabled/.test(el.getAttribute("class") || "") }, el));
    document.querySelectorAll("a[href]").forEach((el) => {
      if (!visible(el) || el.closest("nav, aside, [class*='sider' i], [class*='sidebar' i]")) return;
      add({ kind: "link", name: (el as HTMLElement).innerText }, el);
    });
    document.querySelectorAll("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea").forEach((el) => {
      if (!visible(el)) return;
      const i = el as HTMLInputElement;
      if (i.closest(".ant-select")) return;
      add({
        kind: "field",
        name: labelFor(el) || i.placeholder || i.name,
        required: requiredOf(el),
        placeholder: clean(i.placeholder) || undefined,
        inputType: i.type || el.tagName.toLowerCase(),
        maxLength: i.maxLength > 0 ? i.maxLength : undefined,
        disabled: i.disabled || i.readOnly,
      }, el);
    });
    document.querySelectorAll(".ant-select, [role='combobox']").forEach((el) => {
      if (!visible(el)) return;
      const ph = clean(el.querySelector(".ant-select-selection__placeholder, .ant-select-selection-placeholder")?.textContent);
      add({ kind: "select", name: labelFor(el) || ph || clean((el as HTMLElement).innerText), placeholder: ph || undefined, required: requiredOf(el), disabled: /ant-select-disabled/.test(el.getAttribute("class") || "") }, el);
    });
    document.querySelectorAll("[role='switch'], .ant-switch").forEach((el) => {
      if (!visible(el)) return;
      const row = el.closest(".ant-form-item, .ant-row, div");
      add({ kind: "switch", name: labelFor(el) || clean(row?.textContent).slice(0, 60), checked: el.getAttribute("aria-checked") === "true", disabled: /disabled/.test(el.getAttribute("class") || "") }, el);
    });
    document.querySelectorAll("input[type='checkbox']").forEach((el) => {
      const w = el.closest("label, .ant-checkbox-wrapper") || el.parentElement;
      if (!w || !visible(w)) return;
      add({ kind: "checkbox", name: clean(w.textContent) || labelFor(el), checked: (el as HTMLInputElement).checked, disabled: (el as HTMLInputElement).disabled }, w);
    });
    document.querySelectorAll("th, .data-grid-container table tr:first-child td, [role='columnheader']").forEach((el) => {
      if (!visible(el)) return;
      const t = clean((el as HTMLElement).innerText);
      add({ kind: "column", name: t.replace(/\*$/, "").trim(), required: /\*$/.test(t) }, el);
    });

    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, .ant-drawer-title, .ant-modal-title, .ant-page-header-heading-title, [class*='panelHeader' i], [class*='sectionTitle' i]"))
      .filter(visible).map((el) => clean((el as HTMLElement).innerText)).filter((t) => t && t.length <= 90);
    const messages = Array.from(document.querySelectorAll(".ant-alert, .ant-empty-description, [role='alert'], .ant-form-explain, [class*='banner' i], [class*='helperText' i], [class*='infoText' i]"))
      .filter(visible).map((el) => clean((el as HTMLElement).innerText)).filter((t) => t && t.length <= 240);
    return { title: document.title, headings: Array.from(new Set(headings)).slice(0, 30), controls: out.slice(0, 400), messages: Array.from(new Set(messages)).slice(0, 30), viewport: { w: vw, h: vh } };
  });
  const u = new URL(page.url());
  return { url: page.url(), path: u.pathname, ...data, takenAt: new Date().toISOString() };
}
