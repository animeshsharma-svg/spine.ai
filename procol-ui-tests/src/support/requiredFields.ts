import type { Locator, Page } from "@playwright/test";

/**
 * MANDATORY FIELDS, WHATEVER THE CLIENT (Aanya, 29 Oct: "even if I switch client, find all mandatory fields and fill
 * them in the ongoing process — don't tell the user you're stuck on such a basic step").
 *
 * Each client switches on its own mandatory things (custom_configurations: is_payment_tnc_enabled,
 * enable_tnc_mandatory_button, mandatory_rfp_form_widgets, is_saving_configuration_mandatory,
 * is_surrogate_bid_reference_mandatory, …), so the run cannot know them in advance. It reads them off the screen
 * instead: a form item Procol marks required (antd's required label, a "*" label, aria-required, a red has-error
 * item) whose control is still empty gets a valid value of its kind. Fields a case is about (participants, vendors,
 * the evaluator, the title) are never touched here — their own steps own them.
 *
 * The page-side scan is a plain string, not a function: tsx wraps named helpers in __name(), which does not exist
 * in the browser (LESSONS).
 */

export type FieldFill = { field: string; value: string };
export type SweepResult = { filled: FieldFill[]; left: string[] };

/** Fields a sweep never fills: their own steps decide them, and a case may be about them. */
const OWNED = /participant|vendor|supplier|evaluator|^\s*(event |project )?title\b|approver/i;

/** A refusal that is about something mandatory being empty. */
export const MANDATORY_SAID =
  /\b(mandatory|required)\b|please (fill|select|add|enter|choose|provide|upload|attach)|can(no|')t be (empty|blank)|cannot be empty|is empty|are empty|missing/i;

const SCAN = `(args) => {
  const roots = args.rootSel ? Array.from(document.querySelectorAll(args.rootSel)).filter((r) => r.getClientRects().length) : [document.body];
  const seen = new Set();
  const out = [];
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const text = (el) => ((el && (el.innerText || el.textContent)) || "").replace(/\\s+/g, " ").trim();
  const controlOf = (box) => {
    const pick = [
      [".ant-select:not(.ant-select-disabled)", "select"],
      [".ant-picker:not(.ant-picker-disabled), .ant-calendar-picker", "date"],
      [".ant-radio-group, [role=radiogroup]", "radio"],
      [".ant-checkbox-group", "checkbox"],
      ["textarea:not([disabled])", "text"],
      [".ant-input-number-input:not([disabled]), input[type=number]:not([disabled])", "number"],
      ["input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]):not([disabled]):not([readonly])", "text"],
      [".ant-checkbox-wrapper:not(.ant-checkbox-wrapper-disabled)", "checkbox"],
      [".ant-upload, input[type=file]", "upload"],
    ];
    for (const [sel, kind] of pick) {
      const el = Array.from(box.querySelectorAll(sel)).find((e) => visible(e) || kind === "upload");
      if (el) return { el, kind };
    }
    return null;
  };
  const isEmpty = (el, kind) => {
    if (kind === "select") return !el.querySelector(".ant-select-selection-selected-value, .ant-select-selection-item, .ant-select-selection__choice, .ant-select-selection-item-content");
    if (kind === "date") { const i = el.querySelector("input"); return !i || !(i.value || "").trim(); }
    if (kind === "radio") return !el.querySelector(".ant-radio-wrapper-checked, [aria-checked=true], input:checked");
    if (kind === "checkbox") return !el.querySelector(".ant-checkbox-checked, input:checked") && !el.classList.contains("ant-checkbox-wrapper-checked");
    if (kind === "upload") return !(el.closest(".ant-form-item, .ant-row") || el.parentElement).querySelector(".ant-upload-list-item");
    return !(el.value || "").trim();
  };
  const add = (box, label) => {
    const c = controlOf(box);
    if (!c || seen.has(c.el) || !isEmpty(c.el, c.kind)) return;
    seen.add(c.el);
    const id = "r" + out.length + "-" + Date.now();
    c.el.setAttribute("data-spine-req", id);
    out.push({ id, kind: c.kind, label: (label || c.el.getAttribute("placeholder") || c.el.getAttribute("aria-label") || c.kind).replace(/[*:]/g, "").trim().slice(0, 80) });
  };
  for (const root of roots) {
    // 1. antd form items Procol marks required, or flags red after a refused save.
    root.querySelectorAll(".ant-form-item, .ant-legacy-form-item").forEach((item) => {
      if (!visible(item)) return;
      const lab = item.querySelector(".ant-form-item-label, .ant-legacy-form-item-label, label");
      const req = args.all || !!item.querySelector(".ant-form-item-required, .ant-legacy-form-item-required, [aria-required=true], [required]") ||
        /\\*/.test(text(lab)) || item.matches(".has-error, .ant-form-item-has-error") || !!item.querySelector(".has-error, .ant-form-item-has-error");
      if (req) add(item, text(lab));
    });
    // 2. a control marked required outside any form item.
    root.querySelectorAll("[aria-required=true], input[required], textarea[required], select[required]").forEach((el) => {
      if (!visible(el) || el.closest(".ant-form-item, .ant-legacy-form-item")) return;
      add(el.parentElement || el, el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
    });
    // 3. Procol's own labels: a short text ending (or starting) with "*", its control just after it.
    root.querySelectorAll("label, span, div, p, h4, h5").forEach((el) => {
      if (el.children.length > 2 || !visible(el) || el.closest(".ant-form-item, .ant-legacy-form-item, .data-grid-container, [data-testid^=sheet-]")) return;
      const t = text(el);
      if (t.length < 2 || t.length > 60 || !(/\\*\\s*$/.test(t) || /^\\*/.test(t))) return;
      let box = el.parentElement;
      for (let up = 0; up < 3 && box; up++, box = box.parentElement) {
        const c = controlOf(box);
        if (c) { add(box, t); break; }
      }
    });
    // 4. a drawer opened for a refusal: every empty control in it.
    if (args.all) root.querySelectorAll("input, textarea, .ant-select, .ant-picker, .ant-calendar-picker").forEach((el) => {
      if (!visible(el) || el.closest(".ant-form-item, .ant-legacy-form-item")) return;
      const box = el.closest("div") || el;
      add(box, el.getAttribute("placeholder") || el.getAttribute("aria-label") || "");
    });
  }
  return out;
}`;

/** A value a field of this name accepts. */
function textFor(label: string, numeric: boolean): string {
  const l = label.toLowerCase();
  // a number by its name — but "Cost Centre", "PO Number" and "Rate Contract" are names, not amounts
  if (numeric || (/\b(qty|quantity|amount|price|rate|count|days?|percent(age)?|%|budget|weeks?|months?)\b/.test(l) && !/\b(centre|center|code|name|type|contract|no|number|id)\b/.test(l))) return "10";
  if (/e-?mail/.test(l)) return "qa.automation@example.com";
  if (/phone|mobile|contact no|whatsapp/.test(l)) return "9876543210";
  if (/url|link|website/.test(l)) return "https://example.com";
  if (/pin ?code|zip|postal/.test(l)) return "110001";
  if (/\bpan\b/.test(l)) return "AAAPA1234A";
  if (/gst/.test(l)) return "07AAAPA1234A1Z5";
  return "QA automation";
}

const OPEN_MENU =
  ".ant-select-dropdown:not(.ant-select-dropdown-hidden) [role='option']:not(.ant-select-item-option-disabled):not(.ant-select-dropdown-menu-item-disabled), " +
  ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-dropdown-menu-item:not(.ant-select-dropdown-menu-item-disabled)";

async function fillOne(page: Page, el: Locator, kind: string, label: string): Promise<string | null> {
  await el.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
  switch (kind) {
    case "text":
    case "number": {
      const v = textFor(label, kind === "number");
      await el.fill(v, { timeout: 5_000 }).catch(() => {});
      let got = ((await el.inputValue().catch(() => "")) ?? "").trim();
      if (!got && v !== "10") {
        await el.fill("10", { timeout: 5_000 }).catch(() => {});
        got = ((await el.inputValue().catch(() => "")) ?? "").trim();
      }
      // leave the box so an onBlur save fires, without Escape (it closes the drawer the box is in)
      await el.press("Tab").catch(() => {});
      return got || null;
    }
    case "select": {
      const options = page.locator(OPEN_MENU).filter({ hasText: /\S/ });
      await el.locator(".ant-select-selection, .ant-select-selector").first().click({ timeout: 5_000 }).catch(() => el.click({ timeout: 5_000 }).catch(() => {}));
      await options.first().waitFor({ state: "visible", timeout: 4_000 }).catch(() => {});
      if (!(await options.count())) {
        // a search-select lists nothing until something is typed
        await page.keyboard.type("a", { delay: 40 }).catch(() => {});
        await options.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      }
      const first = options.first();
      if (!(await first.count())) return null;
      const v = ((await first.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
      await first.click({ timeout: 5_000 }).catch(() => first.dispatchEvent("click").catch(() => {}));
      // a multi-select stays open: close it by clicking its own box again, never Escape
      if (await el.evaluate((n) => n.className.includes("multiple")).catch(() => false)) await el.click({ timeout: 2_000 }).catch(() => {});
      return v || "the first option";
    }
    case "date": {
      await el.locator("input").first().click({ timeout: 5_000 }).catch(() => el.click({ timeout: 5_000 }).catch(() => {}));
      const panel = page.locator(".ant-calendar-picker-container:visible, .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)").last();
      await panel.waitFor({ state: "visible", timeout: 4_000 }).catch(() => {});
      // today, or the first day after it the picker allows (some dates must be in the future)
      const day = panel
        .locator(
          ".ant-calendar-today:not(.ant-calendar-disabled-cell) .ant-calendar-date, .ant-picker-cell-today:not(.ant-picker-cell-disabled) .ant-picker-cell-inner, " +
            ".ant-calendar-today ~ td:not(.ant-calendar-disabled-cell) .ant-calendar-date, .ant-picker-cell-today ~ td:not(.ant-picker-cell-disabled) .ant-picker-cell-inner",
        )
        .first();
      const any = panel.locator("td:not(.ant-calendar-disabled-cell):not(.ant-calendar-last-month-cell) .ant-calendar-date, td.ant-picker-cell-in-view:not(.ant-picker-cell-disabled) .ant-picker-cell-inner").last();
      const target = (await day.count()) ? day : any;
      if (!(await target.count())) return null;
      await target.click({ timeout: 5_000 }).catch(() => {});
      await panel.locator(".ant-calendar-ok-btn, .ant-picker-ok button").first().click({ timeout: 1_500 }).catch(() => {});
      return ((await el.locator("input").first().inputValue().catch(() => "")) ?? "").trim() || "a date";
    }
    case "radio": {
      const r = el.locator(".ant-radio-wrapper:not(.ant-radio-wrapper-disabled), [role=radio]").first();
      const v = ((await r.textContent().catch(() => "")) ?? "").trim();
      await r.click({ timeout: 5_000 }).catch(() => {});
      return v || "the first choice";
    }
    case "checkbox": {
      const c = (await el.evaluate((n) => n.classList.contains("ant-checkbox-wrapper")).catch(() => false)) ? el : el.locator(".ant-checkbox-wrapper:not(.ant-checkbox-wrapper-disabled)").first();
      const v = ((await c.textContent().catch(() => "")) ?? "").trim();
      await c.click({ timeout: 5_000 }).catch(() => {});
      return v || "ticked";
    }
    default:
      return null; // an upload needs a file the case did not give: reported as left
  }
}

/**
 * Fill every required control that is still empty inside the visible elements matching `rootSel` (the whole page
 * when omitted). `all` fills every empty control there, required or not — for a drawer opened because the app
 * named it in a refusal. Answers what was filled (field and value) and what could not be.
 */
export async function fillRequiredFields(page: Page, opts: { rootSel?: string; all?: boolean; skip?: RegExp } = {}): Promise<SweepResult> {
  const filled: FieldFill[] = [];
  const left: string[] = [];
  const done = new Set<string>();
  // Filling one field can reveal another (a dependent select), so scan again until nothing new appears.
  for (let pass = 0; pass < 3; pass++) {
    const found = ((await page.evaluate(`(${SCAN})(${JSON.stringify({ rootSel: opts.rootSel ?? null, all: !!opts.all })})`).catch(() => [])) ?? []) as Array<{
      id: string;
      kind: string;
      label: string;
    }>;
    const todo = found.filter((f) => !done.has(`${f.label}|${f.kind}`) && !OWNED.test(f.label) && !(opts.skip && opts.skip.test(f.label)));
    if (!todo.length) break;
    for (const f of todo) {
      done.add(`${f.label}|${f.kind}`);
      const el = page.locator(`[data-spine-req="${f.id}"]`).first();
      if (!(await el.count())) continue;
      const v = await fillOne(page, el, f.kind, f.label).catch(() => null);
      if (v) filled.push({ field: f.label || f.kind, value: v.slice(0, 60) });
      else left.push(`${f.label || f.kind}${f.kind === "upload" ? " (needs a file)" : ""}`);
    }
  }
  if (filled.length) console.log(`[required] filled ${filled.length} mandatory field(s): ${filled.map((f) => `${f.field} = “${f.value}”`).join(", ")}`);
  if (left.length) console.log(`[required] could not fill: ${left.join(", ")}`);
  return { filled, left };
}

/**
 * The app refused because something it names is missing ("Payment Terms and Conditions are mandatory"): open the
 * control that carries that name, fill the drawer or dialog it opens, and save it. Answers what was done, or null
 * when nothing on screen carries the name.
 */
export async function fillWhatTheAppNamed(page: Page, said: string): Promise<{ opened: string; sweep: SweepResult; saved: boolean } | null> {
  const subject = said
    .replace(/^.*?rejected by the app:\s*/i, "")
    .replace(/\b(please|kindly|add|fill|select|enter|choose|provide|upload|attach|the|a|an|for|to|proceed|is|are|be|mandatory|required|missing|empty|cannot|can't|before|publishing|publish|event|this|and|or|of|in|on)\b/gi, " ")
    .replace(/[^a-z0-9& ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = subject.split(" ").filter((w) => w.length > 2).slice(0, 3);
  if (!words.length) return null;
  // "Payment Terms and Conditions" → a button reading "Payment Terms": the longest leading run of the words that names something
  let clickable: Locator | null = null;
  for (let n = words.length; n >= 1 && !clickable; n--) {
    if (n === 1 && words[0].length < 5) break;
    const name = new RegExp(words.slice(0, n).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]{0,20}"), "i");
    const c = page.locator("button, a, [role=button], [role=tab], .ant-btn, .ant-tag").filter({ hasText: name }).filter({ visible: true }).first();
    if (await c.count()) clickable = c;
  }
  if (!clickable) return null;
  const opened = ((await clickable.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  await clickable.click({ timeout: 5_000 }).catch(() => {});
  const box = ".ant-drawer-open .ant-drawer-content, .ant-modal-wrap:not([style*='display: none']) .ant-modal-content";
  await page.locator(box).last().waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});
  const inBox = (await page.locator(box).filter({ visible: true }).count()) > 0;
  const sweep = await fillRequiredFields(page, { rootSel: inBox ? box : undefined, all: inBox });
  let saved = false;
  if (inBox) {
    const save = page.locator(box).filter({ visible: true }).last().getByRole("button", { name: /^\s*(save|submit|done|apply|ok|confirm|add|update)\b/i }).filter({ visible: true }).last();
    if (await save.count()) {
      await save.click({ timeout: 5_000 }).catch(() => {});
      saved = true;
      await page.waitForTimeout(1_200);
    }
  }
  console.log(`[required] the app named “${said.slice(0, 80)}”: opened “${opened}”, filled ${sweep.filled.length}${saved ? ", saved" : ""}`);
  return { opened, sweep, saved };
}

/** Say what a sweep did, in one clause for a step's result. */
export function sweepSaid(r: SweepResult): string {
  const parts: string[] = [];
  if (r.filled.length) parts.push(`filled ${r.filled.length} mandatory field${r.filled.length === 1 ? "" : "s"} this client requires (${r.filled.map((f) => `${f.field}: “${f.value}”`).join(", ")})`);
  if (r.left.length) parts.push(`could not fill ${r.left.join(", ")}`);
  return parts.join("; ");
}

/** What a sweep would fill, without touching anything — for a dry look at a client's create screen. */
export async function findRequiredFields(page: Page, opts: { rootSel?: string; all?: boolean } = {}): Promise<Array<{ kind: string; label: string; owned: boolean }>> {
  const found = ((await page.evaluate(`(${SCAN})(${JSON.stringify({ rootSel: opts.rootSel ?? null, all: !!opts.all })})`).catch(() => [])) ?? []) as Array<{ kind: string; label: string }>;
  return found.map((f) => ({ kind: f.kind, label: f.label, owned: OWNED.test(f.label) }));
}
