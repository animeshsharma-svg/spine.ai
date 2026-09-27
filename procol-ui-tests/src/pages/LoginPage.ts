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
    // Retry the first navigation. Everything downstream depends on this one
    // request, and a single slow response here fails the whole suite at setup
    // with a bare "page.goto: Timeout" — the least informative failure we can
    // produce, and the one most likely to be transient.
    const url = `${CONFIG.appUrl.replace(/\/$/, "")}/login`;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.goto(url, NAV);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        console.log(`[login] navigation to ${url} failed (attempt ${attempt}/3) — retrying`);
        await this.page.waitForTimeout(3_000);
      }
    }
    if (lastErr) throw lastErr;
    await this.dismissDistractions();
    console.log("[login] opened the sign-in page");
  }

  /**
   * Full phone-OTP login. Validates each step and surfaces inline/toast errors
   * as thrown errors so failures are legible.
   */
  /**
   * Narrated as it goes, one `[login]` line per thing a person would see
   * happen, so the sign-in shows up in the run's trail and report as steps
   * ("typed the phone number", "the code field appeared", "signed in") rather
   * than as a silent gap before the first real screen. Only the last four
   * digits of the phone are ever printed; the code never is.
   */
  async login(
    phone = CONFIG.buyerPhone,
    otp = CONFIG.otp,
  ): Promise<void> {
    const ending = phone.slice(-4);
    await this.fill(this.phoneCandidates(), phone, { label: "phone", timeout: TIMEOUTS.MEDIUM });
    await this.click(this.sendOtpCandidates(), { label: "send-otp" });
    console.log(`[login] typed the phone number ending ${ending} and asked for a one-time code`);

    // The OTP field appearing is proof send-OTP succeeded.
    const otpField = await this.expect(this.otpCandidates(), {
      label: "otp-field",
      timeout: TIMEOUTS.LONG,
    });
    console.log("[login] the one-time code field appeared");
    await otpField.fill(otp, { timeout: TIMEOUTS.MEDIUM });

    await this.click(this.loginCandidates(), { label: "login-submit" });
    console.log("[login] typed the code and pressed Login");

    // Success = we leave /login. Race it against an error toast for a fast, clear failure.
    const left = await this.page
      .waitForURL((url) => !url.pathname.includes("/login"), { timeout: TIMEOUTS.LONG })
      .then(() => true)
      .catch(() => false);

    if (!left) {
      const err =
        (await this.errorToastText(1_000)) ||
        (await this.page.locator('p[role="alert"]').first().textContent().catch(() => null));
      console.log(`[login] the login screen did not let us in${err ? ` — the app said: ${err}` : ""}`);
      throw new Error(`Login did not complete (still on /login). ${err ? `Reason: ${err}` : "No error surfaced."}`);
    }
    console.log(`[login] signed in — the app opened ${new URL(this.page.url()).pathname}`);
  }

  /** True once an access token is present in localStorage. */
  async isLoggedIn(): Promise<boolean> {
    return this.page.evaluate((key) => !!localStorage.getItem(key), STORAGE_KEYS.accessToken);
  }
}
