import type { Browser, BrowserContext, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASE, EVIDENCE, OTP, ROLES, phoneOf, type Role } from "./config.js";
// The platform's live browser view and framed pictures, shared with the UI suite.
import { startLiveFrames } from "../../procol-ui-tests/src/support/liveCursor.js";
import { installSpotlight, beginStep } from "../../procol-ui-tests/src/plan/spotlight.js";

/** One narrated line: the dashboard turns "[decath] …" into a step of the run. */
export const tell = (text: string): void => console.log(`[decath] ${text}`);

let shots = 0;
export interface Session {
  role: Role;
  ctx: BrowserContext;
  page: Page;
  /** a screenshot of the page now, saved where the dashboard serves it */
  shot: (words: string) => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Sign in on screen as one role, the way a person does: mobile number, the
 * one-time code, Login. The phone is never printed in full, the code never.
 */
export async function signIn(browser: Browser, role: Role, caseId: string): Promise<Session> {
  const phone = phoneOf(role);
  if (!phone) throw new Error(`no login for the ${ROLES[role].words} in decath/.env (DECATH_PHONE_${role.toUpperCase()})`);
  if (!OTP) throw new Error("no sign-in code in decath/.env (DECATH_OTP)");
  mkdirSync(EVIDENCE, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const stopFrames = process.env.UI_LIVE_FRAMES === "1" ? startLiveFrames(page) : () => {};
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^got it$/i }).click({ timeout: 2000 }).catch(() => {});
  const mobile = page.getByRole("button", { name: /continue with mobile number/i });
  if (await mobile.isVisible().catch(() => false)) await mobile.click();
  await page.getByPlaceholder(/phone|mobile/i).or(page.getByRole("textbox", { name: /phone|mobile/i })).first().fill(phone);
  await page.getByRole("button", { name: /send verification code|send otp|get otp/i }).first().click();
  const code = page.getByPlaceholder(/otp|code|verification/i).or(page.locator('input[type="password"], input[autocomplete="one-time-code"]')).first();
  await code.waitFor({ state: "visible", timeout: 20_000 });
  await code.fill(OTP);
  const go = page.getByRole("button", { name: /^log ?in$|^verify|^submit|^continue$/i }).first();
  if (await go.isVisible().catch(() => false)) await go.click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30_000 });
  await page.waitForTimeout(1200);
  // Framed pictures of every action from here on — after sign-in, so the code is never photographed.
  installSpotlight(page, EVIDENCE);
  beginStep(0, `${caseId} · ${ROLES[role].words}`, 0);
  tell(`${caseId} · signed in as the ${ROLES[role].words} (phone ending ${phone.slice(-4)})`);
  return {
    role,
    ctx,
    page,
    shot: async (words) => {
      const f = join(EVIDENCE, `${String(++shots).padStart(2, "0")}-${caseId}-${role}-${words.replace(/[^a-z0-9]+/gi, "-").slice(0, 50)}.png`);
      await page.screenshot({ path: f }).catch(() => {});
      return f;
    },
    close: async () => {
      stopFrames();
      await ctx.close().catch(() => {});
    },
  };
}

/** Procol's "Want to stay updated?" pop-up covers the list's corner. */
export const dismissPopups = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: /^not now$/i }).click({ timeout: 1500 }).catch(() => {});
};
