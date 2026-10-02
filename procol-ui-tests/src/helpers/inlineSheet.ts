import { Locator, Page } from "@playwright/test";
import { TIMEOUTS } from "../config.js";
import { attachmentUrl, randomNumber, randomString } from "./data.js";

/**
 * Widget config extracted from a template's schema. `type` is the widget's
 * input type; `key` is its key_attribute (the sheet cell's testid suffix).
 */
export interface WidgetConfig {
  key: string;
  type: string;
  raw?: Record<string, unknown>;
}

export type SheetRow = Record<string, unknown>;

/**
 * Drives the inline data-grid used on the event-create sheet. Cells are
 * addressed by the build-stable testid `sheet-cell-{rowNo}-{widgetKey}` — the
 * dynamic per-event key model, so we never pin absolute ids.
 *
 * Ported from the proven procol-client-dashboard e2e InlineSheetHelper.
 */
export class InlineSheet {
  readonly container: Locator;

  constructor(
    public readonly page: Page,
    container?: Locator,
  ) {
    this.container = container ?? page.locator(".data-grid-container");
  }

  getCell(rowIndex: number, widgetKey: string): Locator {
    const sheetRow = rowIndex + 1; // header occupies row 0
    return this.container.locator(`[data-testid="sheet-cell-${sheetRow}-${widgetKey}"]`);
  }

  /**
   * Extract creator-fillable widgets from a template schema response.
   * Handles both `{data:{widgets}}` and `{widgets}` response envelopes.
   */
  static extractCreatorWidgets(templateJson: Record<string, unknown>): Record<string, WidgetConfig> {
    const root = (templateJson?.["data"] as Record<string, unknown>) ?? templateJson ?? {};
    const widgetsNode = root?.["widgets"] as Record<string, unknown> | undefined;
    const inline = widgetsNode?.["inline_components"];
    const list: Record<string, unknown>[] = Array.isArray(inline)
      ? (inline as Record<string, unknown>[])
      : inline
        ? (Object.values(inline) as Record<string, unknown>[])
        : [];

    const out: Record<string, WidgetConfig> = {};
    for (const w of list) {
      const key = w?.["key_attribute"] as string | undefined;
      const conf = w?.["configuration"] as Record<string, unknown> | undefined;
      if (key && conf?.["field_type"] === "creator") {
        out[key] = { key, type: (w?.["input_type"] as string) || key, raw: w };
      }
    }
    return out;
  }

  /** Build a dynamic value for each widget in a row. */
  generateRow(widgets: Record<string, WidgetConfig>): SheetRow {
    const row: SheetRow = {};
    for (const [key, cfg] of Object.entries(widgets)) {
      const v = this.valueForType(cfg.type);
      if (v !== undefined) row[key] = v;
    }
    return row;
  }

  generateRows(widgets: Record<string, WidgetConfig>, count = 1): SheetRow[] {
    return Array.from({ length: count }, () => this.generateRow(widgets));
  }

  /**
   * The grid and the template schema name the same column differently.
   *
   * A cell's `data-celltype` is the column's key (`buyer_hub`), while the
   * template's `input_type` is its kind (`delivery_location`). Anything reading
   * columns off the rendered sheet gets the former, so it must be translated
   * before asking how to fill it — otherwise the delivery location silently
   * goes unfilled and the app refuses to publish with "Sheet partially filled".
   */
  canonicalType(cellType: string): string {
    switch (cellType) {
      case "buyer_hub":
      case "delivery_location":
        return "delivery_location";
      case "creator_quantity":
      case "participant_quantity":
      case "quantity":
        return "quantity";
      case "gst":
      case "price":
      case "amount":
        return "price";
      case "variant":
        return "dropdown";
      case "product":
        return "product";
      case "total_amount":
      case "formula":
        return "formula"; // computed — never fillable
      default:
        return cellType;
    }
  }

  /** A sensible value for a column of this type. Public so a caller sweeping
   *  columns discovered at run time can ask for one without guessing. */
  valueForType(type: string): unknown {
    switch (type) {
      case "product":
        return "a";
      case "delivery_location":
        return "g";
      case "number":
      case "quantity":
      case "price":
      case "percentage":
      case "percent_and_amount":
        return randomNumber();
      case "string":
      case "text":
        return randomString();
      case "date":
        return "today";
      case "attachment":
        return attachmentUrl();
      case "dropdown":
        return { strategy: "first" };
      default:
        return undefined;
    }
  }

  async fill(widgets: Record<string, WidgetConfig>, rows: SheetRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i++) {
      for (const [key, value] of Object.entries(rows[i])) {
        if (widgets[key]) await this.fillCell(i, key, widgets[key], value);
      }
    }
  }

  /**
   * How many DATA rows the sheet is actually showing.
   *
   * Filling `products.length` rows assumes the sheet mirrors what we asked for.
   * It usually does, but when it does not — a template that seeds a row, an
   * item added twice, a trailing blank — the mismatch shows up much later as a
   * publish rejected for an empty required cell in a row nobody filled. Read
   * the truth off the grid instead.
   */
  async renderedRowCount(): Promise<number> {
    return this.page.evaluate(() => {
      const rows = new Set<number>();
      document.querySelectorAll("[data-testid^='sheet-cell-']").forEach((el) => {
        const m = (el.getAttribute("data-testid") ?? "").match(/^sheet-cell-(\d+)-/);
        if (m) rows.add(Number(m[1]));
      });
      return rows.size;
    });
  }

  /** A cell's rendered value — its text, or its editor's value while focused. */
  async cellValue(rowIndex: number, widgetKey: string): Promise<string> {
    const cell = this.getCell(rowIndex, widgetKey);
    if (!(await cell.count())) return "";
    const text = ((await cell.textContent().catch(() => "")) ?? "").trim();
    if (text) return text;
    const input = cell.locator("input, textarea").first();
    if (await input.count()) return ((await input.inputValue().catch(() => "")) ?? "").trim();
    return "";
  }

  /**
   * Fill the sheet, then READ IT BACK and fail on any cell that is on screen,
   * editable, was given a value — and is still empty.
   *
   * `fillCell` skips a cell that does not exist for the chosen template, which
   * is correct, but it made a completely unfilled sheet indistinguishable from
   * a correctly filled one: the required `Price` / `Quantity Available` columns
   * stayed blank, the app refused to publish, and the flow reported only
   * "waitForURL timed out" with no hint of the cause.
   */
  async fillAndVerify(widgets: Record<string, WidgetConfig>, rows: SheetRow[]): Promise<void> {
    await this.fill(widgets, rows);
    const empty: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (const key of Object.keys(rows[i])) {
        if (!widgets[key]) continue;
        const cell = this.getCell(i, key);
        if (!(await cell.isVisible().catch(() => false))) continue;
        if ((await cell.getAttribute("aria-disabled").catch(() => null)) === "true") continue;
        if (!(await this.cellValue(i, key))) empty.push(`row ${i + 1} · ${key}`);
      }
    }
    if (empty.length) {
      throw new Error(
        `the pricing sheet did not accept ${empty.length} value(s) — ${empty.join(", ")}. ` +
          "Required sheet columns left blank make the app refuse to publish.",
      );
    }
  }

  async fillCell(rowIndex: number, widgetKey: string, cfg: WidgetConfig, value: unknown): Promise<void> {
    const cell = this.getCell(rowIndex, widgetKey);
    try {
      await cell.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
    } catch {
      // Cell not present (widget hidden/disabled for this template) — skip quietly.
      return;
    }
    if ((await cell.getAttribute("aria-disabled")) === "true") return;

    switch (cfg.type) {
      case "text":
      case "string":
      case "number":
      case "quantity":
      case "price":
      case "percentage":
      case "percent_and_amount": {
        await cell.click();
        let input = cell.locator("input, textarea").first();
        if ((await input.count()) === 0) {
          await cell.dblclick();
          input = cell.locator("input, textarea").first();
        }
        await input.fill(String(value));
        await this.page.keyboard.press("Tab");
        break;
      }
      case "product":
      case "delivery_location": {
        await this.fillSearchSelect(cell, String(value));
        break;
      }
      case "dropdown": {
        await this.fillDropdown(cell);
        break;
      }
      case "date": {
        await this.fillToday(cell);
        break;
      }
      case "attachment": {
        await cell.dblclick();
        await this.fillAttachment(String(value));
        break;
      }
      default: {
        const input = cell.locator("input").first();
        if ((await input.count()) > 0) {
          await input.fill(String(value));
          await this.page.keyboard.press("Tab");
        }
      }
    }
  }

  /**
   * Type into a sheet cell's search-select and pick a matching option.
   *
   * The open-and-type sequence is retried, because a single dblclick on a
   * data-grid cell does not reliably put the antd select into its open state —
   * when it misses, the search field never appears, nothing is typed, and the
   * wait for an option burns thirty seconds before failing with "waiting for
   * [role='option'] filter 'a'", which reads like a missing product rather than
   * a cell that never opened. Re-opening costs a second and removes the flake.
   */
  private async fillSearchSelect(cell: Locator, value: string): Promise<void> {
    const term = value.replace(/\s*\([^)]*\)\s*/, " ").trim() || value.split("(")[0] || value;
    const codeMatch = value.match(/\(([^)]+)\)/);
    const matchText = codeMatch ? codeMatch[1] : value;
    const search = this.page
      .locator(
        ".ant-select-search__field, .ant-select-dropdown input, .ant-select input, .data-grid .ant-select input",
      )
      .first();
    const options = this.page.locator(
      "[role='option'], .ant-select-dropdown-menu-item[role='option'], .ant-select-item-option",
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      await cell.dblclick().catch(() => {});
      await this.page.waitForTimeout(300);
      if (!(await search.isVisible().catch(() => false))) {
        await cell.click().catch(() => {});
        await this.page.waitForTimeout(300);
      }
      const ready = await search
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      if (!ready) continue;

      await search.fill(term).catch(() => {});
      // Wait for the list itself before waiting for a particular row, so a slow
      // product search is distinguishable from a search that never ran.
      const listed = await options
        .first()
        .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
        .then(() => true)
        .catch(() => false);
      if (!listed) continue;

      const option = options.filter({ hasText: matchText }).first();
      const found = await option
        .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
        .then(() => true)
        .catch(() => false);
      // Nothing matched the code, but the list is populated — take the first
      // row rather than failing, which is what the search term asked for.
      await (found ? option : options.first()).click();
      return;
    }
    throw new Error(
      `the search-select in this sheet cell never opened for "${value}" — three attempts produced no ` +
        `search field or no options, so no product could be chosen.`,
    );
  }

  private async fillDropdown(cell: Locator): Promise<void> {
    await cell.dblclick();
    await this.page.waitForTimeout(300);
    const field = cell.locator('[data-testid="custom-dropdown-select"]');
    if (await field.isVisible().catch(() => false)) {
      await field.click();
      await this.page.waitForTimeout(400);
    }
    const dropdown = this.page.locator(".ant-select-dropdown").first();
    await dropdown.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    const first = dropdown
      .locator(
        "[role='option']:not(.ant-select-item-option-disabled):not(.ant-select-dropdown-menu-item-disabled), .ant-select-item-option:not(.ant-select-item-option-disabled)",
      )
      .first();
    await first.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
    await first.click();
  }

  private async fillToday(cell: Locator): Promise<void> {
    await cell.dblclick();
    await this.page.waitForTimeout(300);
    const input = cell.locator("input.ant-calendar-picker-input, input").first();
    await input.click();
    await this.page.waitForTimeout(200);
    const today = this.page
      .locator(
        ".ant-calendar-today .ant-calendar-date, .ant-picker-cell-today .ant-picker-cell-inner",
      )
      .first();
    await today.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    await today.click();
  }

  private async fillAttachment(value: string): Promise<void> {
    const addUrl = this.page.getByText("Add URL");
    await addUrl.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    await addUrl.click();
    const dialog = this.page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: TIMEOUTS.SHORT });
    const urlInput = dialog.getByRole("textbox").first();
    await urlInput.fill(value || attachmentUrl());
    await this.page.keyboard.press("Tab");
    await dialog.getByRole("button", { name: /^Upload$/i }).click();
    await dialog.getByRole("button", { name: /^Save$/i }).click();
  }
}
