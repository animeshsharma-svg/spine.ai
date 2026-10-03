import type { Page, Request } from "@playwright/test";

/**
 * THE PAGE-READY SIGNAL — the false-positive guard for every absence check.
 *
 * "There is no Add Bid control" is only evidence if the screen it was looked
 * for on had finished rendering. The stage page shows "Loading your event
 * details…" for a minute at times; an absence check run during that minute
 * would see nothing and pass, having looked at a spinner. So before any step
 * may conclude that something is NOT there, the screen has to prove it is
 * done:
 *
 *   1. no loading indicator is visible (antd spinners, skeletons, aria-busy,
 *      the console's own "Loading …" texts, the bare app shell);
 *   2. the screen's own anchor is visible — the control that exists on that
 *      screen and nowhere else (Create Event on the list, the stage tabs on a
 *      project page, the title field on the create screen);
 *   3. the structure is stable — the count of buttons, tabs, rows and inputs
 *      and the rough text length agree across two reads ~600ms apart (rough,
 *      because the bid countdown ticks every second);
 *   4. no API call is in flight (soft — this console holds long-lived
 *      connections, so after 8s of 1–3 being true the step proceeds and
 *      says so).
 *
 * Bounded: the caller gives a budget; when it runs out the answer is
 * `ready: false` with the reason, and an absence check then FAILS as
 * "could not tell" — it never passes on an unready screen.
 */

export interface Readiness {
  ready: boolean;
  ms: number;
  /** What was waited for and what was seen — for the step's detail. */
  notes: string[];
}

const inflight = new WeakMap<Page, Set<Request>>();

/** Count XHR/fetch calls in flight on this page (installed once per page). */
export function trackRequests(page: Page): void {
  if (inflight.has(page)) return;
  const set = new Set<Request>();
  inflight.set(page, set);
  const isApi = (r: Request) => ["xhr", "fetch"].includes(r.resourceType());
  page.on("request", (r) => {
    if (isApi(r)) set.add(r);
  });
  const done = (r: Request) => set.delete(r);
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}

const LOADING_TEXT = /loading your event details|^\s*loading\s*\.{0,3}\s*$|please wait|fetching/i;

async function loadingVisible(page: Page): Promise<string | null> {
  const spinners = page.locator(".ant-spin-spinning, .ant-skeleton-active, [aria-busy='true'], .ant-table-placeholder .ant-spin").filter({ visible: true });
  if (await spinners.count().catch(() => 0)) return "a loading spinner";
  const text = page.getByText(LOADING_TEXT).filter({ visible: true });
  if (await text.count().catch(() => 0)) return `"${((await text.first().innerText().catch(() => "")) || "loading").trim().slice(0, 40)}"`;
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").trim();
  if (/you need to enable javascript/i.test(body) && body.length < 200) return "the bare app shell";
  if (body.length < 20) return "an empty page";
  return null;
}

/** The control that proves WHICH screen this is, by URL. */
export async function screenAnchor(page: Page): Promise<{ name: string; present: boolean } | null> {
  let url: URL;
  try {
    url = new URL(page.url());
  } catch {
    return null;
  }
  const path = url.pathname;
  const vis = async (loc: ReturnType<Page["locator"]>) => (await loc.filter({ visible: true }).count().catch(() => 0)) > 0;
  if (/^\/orders\/?$/.test(path)) {
    return { name: "the Create Event control", present: await vis(page.getByRole("button", { name: /create event|new event/i })) };
  }
  if (/quick-create|projectCreation=true|singleStage=true/i.test(path + url.search)) {
    return { name: "the event title field", present: await vis(page.getByPlaceholder(/title/i)) };
  }
  if (/^\/project\//.test(path)) {
    return { name: "the event's tabs", present: await vis(page.getByRole("tab")) };
  }
  return null;
}

async function signature(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const q = (s: string) => document.querySelectorAll(s).length;
      const len = (document.body?.innerText ?? "").length;
      return [q("button"), q("[role='tab']"), q("tr,[role='row']"), q("input,textarea"), Math.round(len / 200)].join("/");
    })
    .catch(() => "?");
}

export async function screenReady(page: Page, budgetMs = 45_000): Promise<Readiness> {
  trackRequests(page);
  const start = Date.now();
  const deadline = start + Math.max(1_000, budgetMs);
  const notes: string[] = [];
  let lastSig = "";
  let stableSince = 0;
  let otherwiseReadySince = 0;
  let lastBlocker = "";
  await page.waitForLoadState("domcontentloaded", { timeout: Math.min(budgetMs, 30_000) }).catch(() => {});
  while (Date.now() < deadline) {
    const loading = await loadingVisible(page);
    const anchor = await screenAnchor(page);
    const sig = await signature(page);
    const now = Date.now();
    if (sig !== lastSig) {
      lastSig = sig;
      stableSince = now;
    }
    const stable = now - stableSince >= 600;
    const pending = inflight.get(page)?.size ?? 0;
    const blocker = loading
      ? `${loading} is showing`
      : anchor && !anchor.present
        ? `${anchor.name} has not appeared`
        : !stable
          ? "the screen is still changing"
          : "";
    if (!blocker) {
      if (!otherwiseReadySince) otherwiseReadySince = now;
      if (pending === 0) {
        notes.push(`screen ready after ${now - start}ms${anchor ? ` (${anchor.name} visible)` : ""}`);
        return { ready: true, ms: now - start, notes };
      }
      if (now - otherwiseReadySince >= 8_000) {
        notes.push(`screen ready after ${now - start}ms; ${pending} background request(s) still open — this console keeps some open, so proceeding`);
        return { ready: true, ms: now - start, notes };
      }
    } else {
      otherwiseReadySince = 0;
      lastBlocker = blocker;
    }
    await page.waitForTimeout(300);
  }
  notes.push(`the screen was not ready within ${Math.round(budgetMs / 1000)}s — ${lastBlocker || "API calls were still in flight"}`);
  return { ready: false, ms: Date.now() - start, notes };
}
