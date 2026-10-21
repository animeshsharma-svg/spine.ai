import { Page } from "@playwright/test";
import { uatLoginCodes } from "./uatOtp.js";
import { CONFIG, STORAGE_KEYS, NAV } from "../config.js";
import { LoginPage } from "../pages/LoginPage.js";
import { CompanyLogin, resolveCompanyLogin } from "./multiClient.js";

/**
 * Log the UI in as ANY company by injecting a DB-resolved console token into
 * localStorage before the SPA boots — no OTP. This is what lets the whole flow
 * suite run for any client: pick a COMPANY_ID, inject, run its enabled flows.
 */
export async function loginAsCompany(page: Page, companyId: number, preferUserId?: number): Promise<CompanyLogin> {
  const login = await resolveCompanyLogin(companyId, preferUserId);
  if (preferUserId && login && login.userId !== preferUserId) {
    throw new Error(`the API setup's buyer (user ${preferUserId}) has no live console session, and another user's would not be allowed to open its event`);
  }
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

/** How a journey ended up signed in, for the run's record. */
export interface SignedIn {
  /** on-screen: the login page was really used; saved-session: a token was injected */
  how: "on-screen" | "saved-session";
  /** the last four digits of the phone that signed in, when the screen was used */
  phoneEnding?: string;
  /** why the screen could not be used, when it fell back */
  fellBackBecause?: string;
}

/** The DB stores phones as "+91/1234567516"; the login screen wants the number alone. */
function phoneNumberOf(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const number = raw.includes("/") ? raw.split("/").pop()! : raw;
  const digits = number.replace(/\D/g, "");
  return digits.length >= 6 ? digits : undefined;
}

const firstLine = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).split("\n")[0].trim();

/**
 * Sign in THROUGH THE LOGIN SCREEN, the way a person does.
 *
 * `loginAsCompany` above is the fast path: a session token read from Postgres
 * is dropped into localStorage and the app boots already signed in, so the
 * login screen is never seen. That is right for an unattended verification
 * run and wrong for two other things a run is used for. Someone watching the
 * browser expects to see the sign-in — a journey that starts on the home page
 * looks like it skipped a step — and the login screen is itself part of the
 * product, which a token injection never tests. So when asked, the journey
 * clears whatever session the browser was started with, opens /login, types
 * the phone the company's own user signs in with, asks for a one-time code
 * and enters it. Every step is narrated, so the trail and the report show the
 * sign-in as steps.
 *
 * If the screen refuses — the code is not accepted for this user, the form
 * moved — the run falls back to the injected session and says so, because a
 * login problem should be reported as a login problem, not as the whole
 * journey failing to start.
 */
export async function loginOnScreen(page: Page, companyId: number | null): Promise<SignedIn> {
  let phone = CONFIG.buyerPhone;
  let otp = process.env.OTP?.trim() || CONFIG.otp;
  let who = "the configured buyer";
  /** the phone as the users table holds it, for the code lookup */
  let phoneOnRecord: string | undefined;
  /** the client's name, when its sign-in is an operator's account */
  let operated: string | undefined;
  if (companyId) {
    const login = await resolveCompanyLogin(companyId).catch(() => null);
    const number = phoneNumberOf(login?.phone);
    if (number) {
      phone = number;
      phoneOnRecord = login?.phone ? String(login.phone) : undefined;
      const company = login?.companyName ?? `company ${companyId}`;
      // An operator signs in as themselves and works inside the client's
      // account; saying they are the client's own user would be untrue.
      who = login?.viaOperator ? `the account that operates ${company}` : `${company}'s own user`;
      if (login?.viaOperator) operated = company;
    } else {
      console.log(
        `[login] this company's signed-in user has no phone on record — signing in with the configured buyer's phone instead`,
      );
    }
  }
  const ending = phone.slice(-4);
  // No code in the environment: the one UAT accepts for THIS user, read the way
  // the backend reads it (uatOtp.ts) — their own company's UAT login code. The
  // vendor portal signs in the same way. Never the client's code for someone
  // else: asking for a code texts the real phone, and a code the backend will
  // not accept would only do that for nothing. Never printed.
  //
  // The one exception is the operator. Its own company has no code, and UAT
  // accepts the client's code for it: PROCOL DEMO's code signed Procol Support
  // in on the login screen (checked 15 Oct, after Aanya pointed out she had
  // the code). Before that, every PROCOL DEMO run skipped the login screen.
  let codeFrom = "";
  let noCodeWhy = "no one-time code is saved for this account";
  if (!otp) {
    const own = await uatLoginCodes({ phone: phoneOnRecord ?? phone }, operated ? companyId ?? undefined : undefined).catch(() => []);
    if (own[0]) {
      otp = own[0].otp;
      codeFrom = ` with ${own[0].source}`;
    } else if (operated) {
      noCodeWhy =
        `${operated} is signed into through an operator's account (phone ending ${phone.slice(-4)}), and that account has no UAT login code — ` +
        `nor has ${operated}`;
    } else {
      noCodeWhy = `no UAT login code is on file for this user (phone ending ${phone.slice(-4)})`;
    }
  }
  // Without a code the screen only gets as far as the code box: Login stays
  // greyed out, the click waits out its timeout and is recorded as a stuck
  // point, which reads like a broken login page. Say what is missing instead,
  // before a code is requested for nothing.
  if (!otp) {
    const because = noCodeWhy;
    if (!companyId) throw new Error(`Cannot sign in on screen: ${because} (set OTP or ${CONFIG.name.toUpperCase()}_OTP).`);
    console.log(`[login] skipped the login screen — ${because}, so it would stop at the code box. Falling back to the saved session`);
    await loginAsCompany(page, companyId);
    console.log(`[login] signed in with the saved session — the app opened ${new URL(page.url()).pathname}`);
    return { how: "saved-session", fellBackBecause: because };
  }
  console.log(`[login] showing the login screen — signing in as ${who} (phone ending ${ending})${codeFrom}`);

  // The browser was started with a saved session; drop it, or the app will
  // bounce straight from /login to /home and there will be nothing to see.
  // Keep a copy first: once the login page asks for a code it deletes the
  // signed-in user's profile from storage too, and a fallback that puts back
  // only the token lands on /home and is sent back to /login seconds later.
  await page.goto(CONFIG.appUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  const keptStorage = await page
    .evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k) ?? ""])))
    .catch(() => ({}) as Record<string, string>);
  const keptCookies = await page.context().cookies().catch(() => []);
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEYS.accessToken).catch(() => {});
  await page.context().clearCookies().catch(() => {});

  const loginPage = new LoginPage(page);
  try {
    await loginPage.goto();
    await loginPage.login(phone, otp);
    return { how: "on-screen", phoneEnding: ending };
  } catch (err) {
    const because = firstLine(err);
    if (!companyId) throw err;
    console.log(`[login] falling back to the saved web-console session so the journey can still run — ${because}`);
    await page.context().addCookies(keptCookies).catch(() => {});
    await page
      .evaluate((all) => {
        for (const [k, v] of Object.entries(all)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      }, keptStorage)
      .catch(() => {});
    await loginAsCompany(page, companyId);
    // The app's own redirect to /login comes a few seconds after /home has
    // loaded, later than loginAsCompany looks. Saying "signed in" and then
    // failing at the first screen of the journey blames the wrong step.
    const bounced = await page
      .waitForURL((u) => u.pathname.includes("/login"), { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (bounced) {
      console.log(`[login] the saved session did not get in either — the app went back to the login page`);
      throw new Error(`Could not sign in: the login screen failed (${because}) and the saved session was sent back to /login.`);
    }
    console.log(`[login] signed in with the saved session — the app opened ${new URL(page.url()).pathname}`);
    return { how: "saved-session", fellBackBecause: because };
  }
}
