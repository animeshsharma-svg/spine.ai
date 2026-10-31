import type { Locator, Page, Request } from "@playwright/test";

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
  // the award proposal page has no event tabs: a draft shows the proposal document with
  // "Submit Proposal" / "Go back to project", a submitted one the Approvals panel
  if (/^\/project\/[^/]+\/proposal\//.test(path)) {
    return { name: "the proposal's own controls", present: await vis(page.getByRole("button", { name: /submit proposal|go back to project|approve/i }).or(page.getByRole("tab", { name: /approvals|comments/i }))) };
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
  let hydrationNote = "";
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
    let blocker = loading
      ? `${loading} is showing`
      : anchor && !anchor.present
        ? `${anchor.name} has not appeared`
        : !stable
          ? "the screen is still changing"
          : "";
    // The controls are drawn but the page's scripts have not taken them over yet (hydration — see
    // hydrationState below): a press now lands on a dead button. Waited for up to 8s; after that the
    // screen counts as ready and the note says the scripts were still behind.
    if (!blocker) {
      const h = await hydrationState(page);
      if (!h.hydrated) {
        if (now - start < 8_000) blocker = `the page's scripts have not taken over its controls yet (${h.framework} still hydrating)`;
        else if (!hydrationNote) hydrationNote = `${h.framework} had not finished hydrating after ${now - start}ms — proceeding`;
      }
    }
    if (!blocker) {
      if (!otherwiseReadySince) otherwiseReadySince = now;
      if (pending === 0) {
        notes.push(`screen ready after ${now - start}ms${anchor ? ` (${anchor.name} visible)` : ""}${hydrationNote ? `; ${hydrationNote}` : ""}`);
        return { ready: true, ms: now - start, notes };
      }
      if (now - otherwiseReadySince >= 8_000) {
        notes.push(`screen ready after ${now - start}ms; ${pending} background request(s) still open — this console keeps some open, so proceeding${hydrationNote ? `; ${hydrationNote}` : ""}`);
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

/**
 * HYDRATION — a server-rendered page (Next.js / React, Nuxt / Vue) shows its controls before its
 * scripts have attached their handlers. A click in that window lands on a dead button: Playwright
 * reports it clicked and the page does nothing — or React replays the queued clicks against the
 * state it had before any of them, so two "Next page" presses moved the pager ONE page (bench H-10,
 * 31 Oct, with the CPU busy: 26 of 161 challenges failed that way at 4 browsers and passed at 1).
 *
 * The framework marks every element it has taken over (React: a `__reactFiber$…` own property on the
 * node; Vue: `__vnode`), so "has this control been taken over yet" is a direct read of the DOM, not a
 * guess about timing. A page with no such framework is live as soon as it is drawn.
 */
export interface Hydration {
  framework: string;
  hydrated: boolean;
}

export async function hydrationState(page: Page, el?: Locator): Promise<Hydration> {
  // No inner function bindings here: the bundler would wrap them in a __name helper the page lacks.
  const probe = (node: Element | null) => {
    const w = window as unknown as Record<string, unknown>;
    const ssrReact = !!(w.__next_f || w.__NEXT_DATA__ || w.__remixContext || document.querySelector("script[src*='/_next/'], [data-reactroot]"));
    const ssrVue = !!(w.__NUXT__ || document.querySelector("#__nuxt"));
    const controls = Array.prototype.slice.call(document.querySelectorAll("button, a[href], input, select, textarea, [role='button'], [role='link'], [role='tab']"), 0, 400) as Element[];
    let reactN = 0;
    let vueN = 0;
    for (const c of controls) {
      let react = false;
      for (const k of Object.keys(c)) if (k.indexOf("__reactFiber") === 0 || k.indexOf("__reactProps") === 0 || k.indexOf("__reactContainer") === 0) react = true;
      if (react) reactN++;
      else if ("__vnode" in c || "__vueParentComponent" in c) vueN++;
    }
    const framework = reactN || ssrReact ? "react" : vueN || ssrVue ? "vue" : "";
    if (!framework) return { framework: "", hydrated: true };
    const takenN = framework === "react" ? reactN : vueN;
    if (node) {
      for (let e: Element | null = node; e && e !== document.documentElement; e = e.parentElement) {
        let taken = false;
        if (framework === "react") {
          for (const k of Object.keys(e)) if (k.indexOf("__reactFiber") === 0 || k.indexOf("__reactProps") === 0 || k.indexOf("__reactContainer") === 0) taken = true;
        } else taken = "__vnode" in e || "__vueParentComponent" in e;
        if (taken) return { framework, hydrated: true };
      }
      // Outside the framework's tree (a static island): nothing will ever mark it — it is live once the page's own controls are.
      return { framework, hydrated: takenN > 0 && takenN >= controls.length * 0.5 };
    }
    return { framework, hydrated: controls.length === 0 ? !ssrReact && !ssrVue : takenN >= controls.length * 0.9 };
  };
  const fallback: Hydration = { framework: "", hydrated: true };
  const quiet = (e: unknown) => {
    if (process.env.UI_TRACE === "1") console.log(`  [trace] hydrationState could not read the page: ${String((e as Error).message).split("\n")[0].slice(0, 160)}`);
    return fallback;
  };
  if (el) return el.evaluate(probe, undefined, { timeout: 2_500 }).catch(quiet);
  return page.evaluate(probe, null).catch(quiet);
}

/**
 * Wait until a control (or, with none given, the page) has been taken over by its scripts, for at
 * most `budgetMs`; then act regardless. Returns a note for the step's detail: empty when there was
 * nothing to wait for, how long it waited when that mattered, and a warning when it ran out.
 */
export async function interactive(page: Page, el?: Locator, budgetMs = 6_000): Promise<string> {
  const start = Date.now();
  let last: Hydration = { framework: "", hydrated: true };
  for (;;) {
    last = await hydrationState(page, el);
    if (last.hydrated || Date.now() - start >= budgetMs) break;
    await page.waitForTimeout(150);
  }
  const waited = Date.now() - start;
  if (!last.hydrated) return ` (the page's scripts had not taken over ${el ? "this control" : "the page"} after ${waited}ms — acted anyway)`;
  return waited >= 300 ? ` (waited ${waited}ms for the page's scripts to take over)` : "";
}
