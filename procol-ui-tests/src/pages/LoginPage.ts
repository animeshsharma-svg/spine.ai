import { Page } from "@playwright/test";
import { BasePage } from "./BasePage.js";
import { CONFIG, STORAGE_KEYS, TIMEOUTS, NAV } from "../config.js";

/**
 * Buyer console login. Verified live on cpanel.ag-ri.in:
 *   phone textbox -> "Send OTP" -> OTP password field -> "Login" submit -> /home
 *
 * Selectors are resilient: role-based first, css/placeholder fallbacks after.
 */
export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private phoneCandidates() {
    const p = this.page;
    return [
      p.getByRole("textbox", { name: /phone/i }),
      p.getByPlaceholder(/phone/i),
      p.locator('input[type="text"]').first(),
    ];
  }

  private sendOtpCandidates() {
    const p = this.page;
    return [
      p.getByRole("button", { name: /send otp/i }),
      p.getByRole("button", { name: /get otp|continue|next/i }),
      // On this build the send-OTP control is an unlabeled submit next to phone.
      p.locator('form button[type="submit"]'),
      p.locator("form button").first(),
    ];
  }

  private otpCandidates() {
    const p = this.page;
    return [
      p.getByRole("textbox", { name: /password|otp/i }),
      p.getByPlaceholder(/otp/i),
      p.locator('input[type="password"]'),
    ];
  }

  private loginCandidates() {
    const p = this.page;
    return [
      p.getByRole("button", { name: /^log ?in$/i }),
      p.locator('button[type="submit"]'),
    ];
  }

  async goto(): Promise<void> {
    // Ensure the app talks to the intended backend before the SPA boots.
    await this.page.addInitScript(
      ({ apiUrl, key }: { apiUrl: string; key: string }) => {
        try {
          localStorage.setItem(key, apiUrl);
        } catch {
          /* ignore */
        }
      },
      { apiUrl: CONFIG.apiUrl, key: STORAGE_KEYS.selectedApi },
    );
    await this.page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/login`, NAV);
    await this.dismissDistractions();
  }

  /**
   * Full phone-OTP login. Validates each step and surfaces inline/toast errors
   * as thrown errors so failures are legible.
   */
  async login(
    phone = CONFIG.buyerPhone,
    otp = CONFIG.otp,
  ): Promise<void> {
    await this.fill(this.phoneCandidates(), phone, { label: "phone", timeout: TIMEOUTS.MEDIUM });
    await this.click(this.sendOtpCandidates(), { label: "send-otp" });

    // The OTP field appearing is proof send-OTP succeeded.
    const otpField = await this.expect(this.otpCandidates(), {
      label: "otp-field",
      timeout: TIMEOUTS.LONG,
    });
    await otpField.fill(otp, { timeout: TIMEOUTS.MEDIUM });

    await this.click(this.loginCandidates(), { label: "login-submit" });

    // Success = we leave /login. Race it against an error toast for a fast, clear failure.
    const left = await this.page
      .waitForURL((url) => !url.pathname.includes("/login"), { timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);

    if (!left) {
      const err =
        (await this.errorToastText(1_000)) ||
        (await this.page.locator('p[role="alert"]').first().textContent().catch(() => null));
      throw new Error(`Login did not complete (still on /login). ${err ? `Reason: ${err}` : "No error surfaced."}`);
    }
  }

  /** True once an access token is present in localStorage. */
  async isLoggedIn(): Promise<boolean> {
    return this.page.evaluate((key) => !!localStorage.getItem(key), STORAGE_KEYS.accessToken);
  }
}
