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
}

export interface ScreenInventory {
  url: string;
  path: string;
  title: string;
  headings: string[];
  controls: InventoryControl[];
  /** banners, alerts, empty states and helper text the screen shows unprompted */
  messages: string[];
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
    const out: any[] = [];
    const seen = new Set<string>();
    const add = (c: any) => {
      c.name = clean(c.name).slice(0, 90);
      if (!c.name || /^\d+([.,]\d+)?$/.test(c.name)) return;
      const k = `${c.kind}|${c.name}`;
      if (seen.has(k)) return;
      seen.add(k);
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
      const name = (el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "";
      const cls = el.getAttribute("class") || "";
      add({
        kind: "button",
        name,
        disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || /ant-btn-disabled|disabled/.test(cls),
        danger: /ant-btn-danger|danger/.test(cls) || /\b(delete|remove|withdraw|cancel event|reject)\b/i.test(name),
        hint: hintOf(el),
      });
    });
    document.querySelectorAll("[role='tab']").forEach((el) => visible(el) && add({ kind: "tab", name: (el as HTMLElement).innerText, selected: el.getAttribute("aria-selected") === "true" }));
    document.querySelectorAll("[role='menuitem']").forEach((el) => visible(el) && add({ kind: "menuitem", name: (el as HTMLElement).innerText, disabled: el.getAttribute("aria-disabled") === "true" || /disabled/.test(el.getAttribute("class") || "") }));
    document.querySelectorAll("a[href]").forEach((el) => {
      if (!visible(el) || el.closest("nav, aside, [class*='sider' i], [class*='sidebar' i]")) return;
      add({ kind: "link", name: (el as HTMLElement).innerText });
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
      });
    });
    document.querySelectorAll(".ant-select, [role='combobox']").forEach((el) => {
      if (!visible(el)) return;
      const ph = clean(el.querySelector(".ant-select-selection__placeholder, .ant-select-selection-placeholder")?.textContent);
      add({ kind: "select", name: labelFor(el) || ph || clean((el as HTMLElement).innerText), placeholder: ph || undefined, required: requiredOf(el), disabled: /ant-select-disabled/.test(el.getAttribute("class") || "") });
    });
    document.querySelectorAll("[role='switch'], .ant-switch").forEach((el) => {
      if (!visible(el)) return;
      const row = el.closest(".ant-form-item, .ant-row, div");
      add({ kind: "switch", name: labelFor(el) || clean(row?.textContent).slice(0, 60), checked: el.getAttribute("aria-checked") === "true", disabled: /disabled/.test(el.getAttribute("class") || "") });
    });
    document.querySelectorAll("input[type='checkbox']").forEach((el) => {
      const w = el.closest("label, .ant-checkbox-wrapper") || el.parentElement;
      if (!w || !visible(w)) return;
      add({ kind: "checkbox", name: clean(w.textContent) || labelFor(el), checked: (el as HTMLInputElement).checked, disabled: (el as HTMLInputElement).disabled });
    });
    document.querySelectorAll("th, .data-grid-container table tr:first-child td, [role='columnheader']").forEach((el) => {
      if (!visible(el)) return;
      const t = clean((el as HTMLElement).innerText);
      add({ kind: "column", name: t.replace(/\*$/, "").trim(), required: /\*$/.test(t) });
    });

    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, .ant-drawer-title, .ant-modal-title, .ant-page-header-heading-title, [class*='panelHeader' i], [class*='sectionTitle' i]"))
      .filter(visible).map((el) => clean((el as HTMLElement).innerText)).filter((t) => t && t.length <= 90);
    const messages = Array.from(document.querySelectorAll(".ant-alert, .ant-empty-description, [role='alert'], .ant-form-explain, [class*='banner' i], [class*='helperText' i], [class*='infoText' i]"))
      .filter(visible).map((el) => clean((el as HTMLElement).innerText)).filter((t) => t && t.length <= 240);
    return { title: document.title, headings: Array.from(new Set(headings)).slice(0, 30), controls: out.slice(0, 400), messages: Array.from(new Set(messages)).slice(0, 30) };
  });
  const u = new URL(page.url());
  return { url: page.url(), path: u.pathname, ...data, takenAt: new Date().toISOString() };
}
