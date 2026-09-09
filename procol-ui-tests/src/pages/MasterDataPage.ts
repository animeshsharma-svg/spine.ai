import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { CONFIG, TIMEOUTS, NAV } from "../config.js";
import { randomNumber, randomString } from "../helpers/data.js";

/**
 * Master-data create screens (categories/products/locations/teams/users/vendor
 * mapping). Routes + form fields verified live on cpanel.ag-ri.in. Each creator
 * fills every field the form exposes and submits, returning the unique name it
 * used so the caller can verify. Records are left in place (no cleanup), same as
 * the API framework, prefixed UI_Auto_ for easy identification.
 */
export class MasterDataPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private base = CONFIG.appUrl.replace(/\/$/, "");

  async goto(route: string): Promise<void> {
    await this.page.goto(this.base + route, NAV);
    await this.page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
    await this.dismissDistractions();
    await this.page.waitForTimeout(800);
  }

  /**
   * Open the antd select that belongs to the form field labelled `labelOrText`
   * and pick its first option. Scopes to the form-item/row containing the label
   * (labels sit outside the select), then clicks the select there.
   */
  private async pickFirstInSelect(labelOrText: RegExp, opts: { search?: string } = {}): Promise<boolean> {
    const container = this.page
      .locator(".ant-form-item, .ant-row, [class*='formItem' i], [class*='field' i]")
      .filter({ hasText: labelOrText })
      .first();
    let clicked = false;
    if ((await container.count().catch(() => 0)) > 0) {
      const sel = container.locator(".ant-select-selector, .ant-select").first();
      if ((await sel.count().catch(() => 0)) > 0) {
        await sel.click({ timeout: 3_000 }).catch(() => {});
        clicked = true;
      }
    }
    if (!clicked) {
      clicked = await this.clickIfPresent(
        [this.page.locator(".ant-select").filter({ hasText: labelOrText }), this.page.getByText(labelOrText)],
        { label: `open-select:${labelOrText}`, timeout: TIMEOUTS.SHORT },
      );
    }
    if (!clicked) return false;
    await this.page.waitForTimeout(300);
    if (opts.search) {
      const input = this.page.locator("input.ant-select-selection-search-input, .ant-select-open input").first();
      await input.fill(opts.search).catch(() => {});
      await this.page.waitForTimeout(900);
    }
    return this.clickIfPresent(
      [
        this.page.locator(".ant-select-dropdown .ant-select-item-option:not(.ant-select-item-option-disabled)").first(),
        this.page.getByRole("option").first(),
        this.page.locator(".ant-select-item-option").first(),
      ],
      { label: "select-first-option", timeout: TIMEOUTS.MEDIUM },
    );
  }

  private async submit(names: RegExp = /^(submit|ok|create|save)$/i): Promise<void> {
    await this.click(
      [
        this.page.getByRole("dialog").getByRole("button", { name: names }),
        this.page.getByRole("button", { name: names }),
      ],
      { label: "submit", timeout: TIMEOUTS.MEDIUM },
    );
  }

  private async created(): Promise<boolean> {
    const ok = await this.successToastText(TIMEOUTS.MEDIUM);
    if (ok) return true;
    // If no toast, absence of an error toast is our fallback signal.
    const err = await this.errorToastText(1_000);
    return !err;
  }

  // ── Team ───────────────────────────────────────────────────────────────────
  async createTeam(): Promise<{ name: string; ok: boolean }> {
    await this.goto("/teams");
    const name = `UI_Auto_Team_${randomString(6)}`;
    await this.click([this.page.getByRole("button", { name: /create team|add team|new team/i })], { label: "create-team", timeout: TIMEOUTS.MEDIUM });
    const nameInput = this.page.locator('input[name="name"]').first();
    await nameInput.click();
    await nameInput.pressSequentially(name, { delay: 15 }); // real keystrokes → antd marks touched
    await this.page.keyboard.press("Tab").catch(() => {});
    await this.pickFirstInSelect(/team type/i).catch(() => {});
    // Turn OFF "Add category-based limitations" so its Add Category field isn't
    // required (team then has access to all categories).
    const catToggle = this.page
      .locator(".ant-row, .ant-form-item, div")
      .filter({ hasText: /add category-based limitations/i })
      .locator("button.ant-switch")
      .first();
    if ((await catToggle.getAttribute("aria-checked").catch(() => null)) === "true") {
      await catToggle.click().catch(() => {});
      await this.page.waitForTimeout(400);
    }
    await this.page.waitForTimeout(500);
    await this.submit(/^(submit|create|save)$/i);
    return { name, ok: await this.created() };
  }

  // ── Location (buyer hub) ─────────────────────────────────────────────────────
  async createLocation(): Promise<{ name: string; ok: boolean }> {
    await this.goto("/locations");
    const name = `UI_Auto_Loc_${randomString(6)}`;
    await this.click(
      [this.page.getByRole("button", { name: /create|add location|new location/i }), this.page.getByText(/create buyer hub|add location/i)],
      { label: "create-location", timeout: TIMEOUTS.MEDIUM },
    );
    await this.fill([this.page.locator('input[name="name"]'), this.page.getByPlaceholder(/enter location name/i)], name, { label: "loc-name" });
    // Location type
    await this.clickIfPresent([this.page.getByText(/^buying hub$/i), this.page.locator('input[name="locationType"]').first()], { label: "loc-type", timeout: TIMEOUTS.SHORT });
    // City (searchable select)
    await this.pickFirstInSelect(/city/i, { search: "a" }).catch(() => {});
    await this.fill([this.page.locator('input[name="address"]'), this.page.getByPlaceholder(/enter location address/i)], "UI Auto Address", { label: "loc-address" }).catch(() => {});
    await this.fill([this.page.locator('input[name="locationCode"]'), this.page.getByPlaceholder(/enter location code/i)], `LC${randomNumber()}`, { label: "loc-code" }).catch(() => {});
    await this.submit(/^(ok|submit|create|save)$/i);
    return { name, ok: await this.created() };
  }

  // ── User ─────────────────────────────────────────────────────────────────────
  async createUser(): Promise<{ name: string; email: string; ok: boolean }> {
    await this.goto("/users");
    const stamp = randomString(6);
    const name = `UI_Auto_User_${stamp}`;
    const email = `uiauto_${stamp.toLowerCase()}@example.com`;
    const phone = `98${String(randomNumber()).padStart(3, "0")}${String(randomNumber()).padStart(5, "0")}`.slice(0, 10);
    await this.click([this.page.getByRole("button", { name: /create user|add user/i })], { label: "create-user", timeout: TIMEOUTS.MEDIUM });
    await this.fill([this.page.locator('input[name="name"]'), this.page.getByPlaceholder(/enter user'?s name/i)], name, { label: "user-name" });
    await this.fill([this.page.locator('input[name="erpId"]'), this.page.getByPlaceholder(/enter erp id/i)], `ERP${stamp}`, { label: "user-erp" }).catch(() => {});
    await this.fill([this.page.locator('input[name="email"]'), this.page.getByPlaceholder(/email/i)], email, { label: "user-email" });
    await this.fill([this.page.locator('input[name="phone"]'), this.page.getByPlaceholder(/phone/i)], phone, { label: "user-phone" });
    await this.pickFirstInSelect(/role/i).catch(() => {});
    await this.submit(/^(submit|create|save)$/i);
    return { name, email, ok: await this.created() };
  }

  // ── Product ───────────────────────────────────────────────────────────────────
  async createProduct(): Promise<{ name: string; ok: boolean }> {
    await this.goto("/products");
    const name = `UI_Auto_Prod_${randomString(6)}`;
    await this.click([this.page.getByRole("button", { name: /create product|add product|new product/i }), this.page.getByText(/add product/i)], { label: "add-product", timeout: TIMEOUTS.MEDIUM });
    await this.fill(
      [this.page.locator('textarea[name="name"]'), this.page.getByPlaceholder(/what is the name of your product/i)],
      name,
      { label: "product-name" },
    );
    await this.pickFirstInSelect(/unit of measurement|uom/i, { search: "a" }).catch(() => {});
    await this.pickFirstInSelect(/^category$/i, { search: "a" }).catch(() => {});
    await this.pickFirstInSelect(/subcategory/i, { search: "a" }).catch(() => {});
    await this.fill([this.page.locator('input[name="articleCode"]'), this.page.getByPlaceholder(/unique identifier/i)], `ART${randomNumber()}`, { label: "article-code" }).catch(() => {});
    // A product needs at least one variant.
    await this.clickIfPresent([this.page.getByRole("button", { name: /add product variant/i }), this.page.getByText(/add product variant/i)], { label: "add-variant", timeout: TIMEOUTS.SHORT });
    await this.page.waitForTimeout(600);
    await this.fill([this.page.locator("input").filter({ hasNot: this.page.locator("[disabled]") }).last()], `Variant_${randomString(4)}`, { label: "variant-name" }).catch(() => {});
    await this.submit(/^(create|submit|save)$/i);
    return { name, ok: await this.created() };
  }
}
