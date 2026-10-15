import type { APIRequestContext, Page } from "@playwright/test";
import { CONFIG, STORAGE_KEYS } from "../config.js";
import { newApiContext } from "../master/config.js";
import { resolveCompanyLogin } from "../db/multiClient.js";

/**
 * The buyer's own session, for a read through Procol's API mid-run.
 *
 * What the browser is signed in with right now (its localStorage token), else
 * the company's session from the database — never the captured token file,
 * which goes stale (it answered 401 on 2026-10-13, captured on 10-03).
 */
export async function buyerToken(page: Page): Promise<string | undefined> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEYS.accessToken).catch(() => null);
  if (raw) {
    try {
      return String(JSON.parse(raw));
    } catch {
      return raw;
    }
  }
  const id = Number(process.env.COMPANY_ID);
  return id ? (await resolveCompanyLogin(id).catch(() => null))?.accessToken : undefined;
}

/** An API client signed in as the buyer; dispose it when done. Null when no session can be found. */
export async function buyerApi(page: Page): Promise<APIRequestContext | null> {
  return newApiContext(CONFIG, await buyerToken(page)).catch(() => null);
}
