import { test as setup, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { LoginPage } from "../src/pages/LoginPage.js";
import { AUTH_FILE, TOKENS_FILE, STORAGE_KEYS, CONFIG, assertConfigured } from "../src/config.js";

/**
 * One-time auth: log in with phone OTP, persist the browser storage state for
 * all other projects to reuse, and capture the access token so the read-only
 * config probe (ClientConfig) can authenticate without a second OTP dance.
 */
setup("authenticate", async ({ page }) => {
  assertConfigured();
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login();

  expect(await loginPage.isLoggedIn(), "access token should be present after login").toBeTruthy();

  // Persist browser storage state (cookies + localStorage incl. token + api).
  await page.context().storageState({ path: AUTH_FILE });

  // Capture the access-token header for the API config probe. The console
  // stores it in localStorage already fully-encoded as
  // base64("appKey:appSecret:<token>") and JSON-quoted — so we parse the JSON
  // string and use the value verbatim as the `access-token` header (no re-wrap).
  const rawStored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEYS.accessToken);
  let accessTokenHeader = rawStored ?? "";
  try {
    accessTokenHeader = JSON.parse(rawStored ?? '""');
  } catch {
    /* already unquoted */
  }
  writeFileSync(
    TOKENS_FILE,
    JSON.stringify({ client: CONFIG.name, apiUrl: CONFIG.apiUrl, accessTokenHeader }, null, 2),
  );
});
