import { Locator, Page } from "@playwright/test";
import { TIMEOUTS } from "../config.js";

/**
 * Resilient, self-healing locator utilities.
 *
 * The console UI drifts (button labels, testids and DOM shape change between
 * builds — e.g. "New Event" became "Create Event"). So no action here is pinned
 * to a single selector. Every helper takes an ORDERED LIST of candidate
 * locators built with different strategies (role, text, testid, css, ...) and
 * keeps polling across all of them until one is actually actionable, or the
 * budget runs out. If the first strategy doesn't resolve, it silently falls
 * through to the next — "understand if it doesn't get clicked, try another".
 *
 * Pass the most specific/stable candidate first (testid, role) and looser
 * fallbacks (text, css contains) after.
 */

export type Candidate = Locator;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isActionable(loc: Locator, requireEnabled: boolean): Promise<boolean> {
  try {
    if (!(await loc.isVisible())) return false;
    if (requireEnabled && !(await loc.isEnabled())) return false;
    return true;
  } catch {
    return false;
  }
}

export interface FindOptions {
  timeout?: number;
  /** Also require the element to be enabled (not just visible). */
  requireEnabled?: boolean;
  /** Human label used in error messages / traces. */
  label?: string;
}

/**
 * Poll all candidates until one is visible (and optionally enabled).
 * Returns the resolved `.first()` locator, or null if none surfaced in time.
 */
export async function firstMatch(
  candidates: Candidate[],
  opts: FindOptions = {},
): Promise<Locator | null> {
  const { timeout = TIMEOUTS.SHORT, requireEnabled = false } = opts;
  const deadline = Date.now() + timeout;
  do {
    for (const c of candidates) {
      const loc = c.first();
      if (await isActionable(loc, requireEnabled)) return loc;
    }
    await sleep(200);
  } while (Date.now() < deadline);
  return null;
}

/** Like firstMatch but throws a descriptive error instead of returning null. */
export async function expectFirst(
  candidates: Candidate[],
  opts: FindOptions = {},
): Promise<Locator> {
  const loc = await firstMatch(candidates, opts);
  if (!loc) {
    throw new Error(
      `expectFirst${opts.label ? ` [${opts.label}]` : ""}: none of ${candidates.length} candidate locator(s) became ${opts.requireEnabled ? "actionable" : "visible"} within ${opts.timeout ?? TIMEOUTS.SHORT}ms`,
    );
  }
  return loc;
}

export interface ClickOptions extends FindOptions {
  force?: boolean;
}

/**
 * Try to click any of the candidates. Polls across all strategies; when one is
 * visible+enabled it attempts the click, and if that specific click throws it
 * falls through to the next candidate/pass rather than giving up.
 */
export async function clickFirst(
  page: Page,
  candidates: Candidate[],
  opts: ClickOptions = {},
): Promise<Locator> {
  const { timeout = TIMEOUTS.MEDIUM, force = false, label } = opts;
  const deadline = Date.now() + timeout;
  let lastErr: unknown;
  do {
    for (const c of candidates) {
      const loc = c.first();
      if (await isActionable(loc, true)) {
        try {
          // Scroll before clicking. Playwright auto-scrolls for a normal click,
          // but NOT for `force: true` — and force is exactly what the retry
          // paths use — so an off-screen control was "clicked" at coordinates
          // nothing occupied and the run stalled with no error.
          await loc.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
          await loc.click({ timeout: 2_000, force });
          return loc;
        } catch (e) {
          lastErr = e;
        }
      }
    }
    await sleep(200);
  } while (Date.now() < deadline);
  throw new Error(
    `clickFirst${label ? ` [${label}]` : ""}: no candidate was clickable within ${timeout}ms. Last error: ${errMsg(lastErr)}`,
  );
}

/** Fill the first actionable candidate input, verifying the value stuck. */
export async function fillFirst(
  page: Page,
  candidates: Candidate[],
  value: string,
  opts: FindOptions = {},
): Promise<Locator> {
  const { timeout = TIMEOUTS.MEDIUM, label } = opts;
  const deadline = Date.now() + timeout;
  let lastErr: unknown;
  do {
    for (const c of candidates) {
      const loc = c.first();
      if (await isActionable(loc, true)) {
        try {
          await loc.fill(value, { timeout: 2_000 });
          // Data validation: confirm the input actually holds what we typed.
          const got = await loc.inputValue().catch(() => null);
          if (got === value || got == null) return loc;
          lastErr = new Error(`value mismatch after fill: wanted "${value}", got "${got}"`);
        } catch (e) {
          lastErr = e;
        }
      }
    }
    await sleep(200);
  } while (Date.now() < deadline);
  throw new Error(
    `fillFirst${label ? ` [${label}]` : ""}: could not fill "${value}" within ${timeout}ms. Last error: ${errMsg(lastErr)}`,
  );
}

/**
 * Best-effort click: click if a candidate shows up quickly, otherwise return
 * false. For optional/transient UI (popups, banners) that may not appear.
 */
export async function clickIfPresent(
  page: Page,
  candidates: Candidate[],
  opts: ClickOptions = {},
): Promise<boolean> {
  const loc = await firstMatch(candidates, {
    timeout: opts.timeout ?? TIMEOUTS.SHORT,
    requireEnabled: true,
    label: opts.label,
  });
  if (!loc) return false;
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
    await loc.click({ timeout: 2_000, force: opts.force });
    return true;
  } catch {
    return false;
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message.split("\n")[0];
  return String(e ?? "n/a");
}
