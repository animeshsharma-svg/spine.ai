import { Page } from "@playwright/test";
import { CONFIG, STORAGE_KEYS, NAV } from "../config.js";
import { CompanyLogin, resolveCompanyLogin } from "./multiClient.js";

/**
 * Log the UI in as ANY company by injecting a DB-resolved console token into
 * localStorage before the SPA boots — no OTP. This is what lets the whole flow
 * suite run for any client: pick a COMPANY_ID, inject, run its enabled flows.
 */
export async function loginAsCompany(page: Page, companyId: number): Promise<CompanyLogin> {
  const login = await resolveCompanyLogin(companyId);
  if (!login) {
    throw new Error(
      `No usable console session in the DB for company ${companyId} — cannot DB-login. ` +
        `Pick a loginnable company (see loginnableCompanies()).`,
    );
  }
  const validity = Math.floor(Date.now() / 1000) + 24 * 3600; // 24h ahead

  await page.addInitScript(
    (d: { token: string; api: string; ver: string; validity: number; keys: { accessToken: string; selectedApi: string } }) => {
      try {
        // Values mirror the console's own localStorage shape (JSON-quoted).
        localStorage.setItem(d.keys.accessToken, JSON.stringify(d.token));
        localStorage.setItem(d.keys.selectedApi, d.api);
        localStorage.setItem("procol_app_version", JSON.stringify(d.ver));
        localStorage.setItem("procol_login_validity", String(d.validity));
      } catch {
        /* ignore */
      }
    },
    { token: login.accessToken, api: CONFIG.apiUrl, ver: login.appVersion, validity, keys: STORAGE_KEYS },
  );

  await page.goto(`${CONFIG.appUrl.replace(/\/$/, "")}/home`, NAV);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  // Confirm we didn't bounce to /login.
  const onLogin = new URL(page.url()).pathname.includes("/login");
  if (onLogin) {
    throw new Error(`DB-login as company ${companyId} bounced to /login — session token may be stale/expired`);
  }
  return login;
}
