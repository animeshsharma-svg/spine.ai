import { test as setup, expect } from "@playwright/test";
import { writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { LoginPage } from "../src/pages/LoginPage.js";
import { AUTH_FILE, TOKENS_FILE, STORAGE_KEYS, CONFIG, assertConfigured } from "../src/config.js";

/**
 * One-time auth: log in with phone OTP, persist the browser storage state for
 * all other projects to reuse, and capture the access token so the read-only
 * config probe (ClientConfig) can authenticate without a second OTP dance.
 */
/**
 * Is the saved session still usable?
 *
 * Playwright runs this setup project as a dependency of every run, in its own
 * browser — which is why a single journey opened TWO Chromium windows: one to
 * log in, one to do the work. When the stored state is recent there is nothing
 * to do, and a skipped test never touches the `page` fixture, so no browser is
 * launched at all.
 */
function savedSessionIsFresh(): { fresh: boolean; reason: string } {
  if (!existsSync(AUTH_FILE)) return { fresh: false, reason: "no saved session" };
  try {
    const state = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as {
      origins?: Array<{ localStorage?: Array<{ name: string }> }>;
    };
    const hasToken = state.origins?.some((o) =>
      o.localStorage?.some((e) => e.name === STORAGE_KEYS.accessToken),
    );
    if (!hasToken) return { fresh: false, reason: "the saved session has no access token" };
  } catch {
    return { fresh: false, reason: "the saved session is unreadable" };
  }
  // The console's token outlives a working day, but re-authenticating daily is
  // cheap insurance against a silently expired one.
  const ageHours = (Date.now() - statSync(AUTH_FILE).mtimeMs) / 3_600_000;
  const maxHours = Number(process.env.UI_AUTH_MAX_AGE_HOURS ?? 8);
  if (ageHours > maxHours) {
    return { fresh: false, reason: `the saved session is ${ageHours.toFixed(1)}h old (max ${maxHours}h)` };
  }
  return { fresh: true, reason: `reusing the saved session (${ageHours.toFixed(1)}h old)` };
}

const saved = savedSessionIsFresh();

setup("authenticate", async ({ page }) => {
  // Skipped before the browser is needed, so no second window opens.
  setup.skip(saved.fresh && process.env.UI_FORCE_LOGIN !== "1", saved.reason);
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
