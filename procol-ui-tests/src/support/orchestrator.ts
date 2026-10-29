import type { BrowserContext, Page } from "@playwright/test";
import { NOISE_TEXT } from "../oracle/noise.js";

/**
 * THE ORCHESTRATOR — one owner for the pop-ups that get in a run's way.
 *
 * Until now three things fought the same prompts ("Want to stay updated?",
 * "Turn on notifications", tours, cookie bars):
 *   • every step called dismissDistractions(): eight "is it on screen?" round
 *     trips to the browser, before the step and again inside page objects;
 *   • a Playwright locator handler ran the same dismissal before actions;
 *   • a click that failed ran it once more and retried.
 * They raced. One closed the prompt; the other had already decided to click
 * it, and its click waited for a button that was gone — the live pointer 1.5 s,
 * the click 1 s more. A trace of the RFQ journey's first eight steps (55 s)
 * spent about 9 s that way, on prompts that were already closed.
 *
 * Now a small watcher lives INSIDE the page (an init script on the browser
 * context, so every page and every navigation has it). The moment a known
 * prompt appears it presses the prompt's own declining or close control —
 * "Not now", "Got it", the ×; never "Enable", "Allow" or "Yes" — with no round
 * trip to the test and no waiting. Drawers and dialogs the run opened are
 * never touched: only a container showing one of the NOISE_TEXT phrases
 * (oracle/noise.ts) counts, the same rule the oracle uses. What it closed is
 * kept on the page and printed once per kind ("[orchestrator] closed …").
 *
 * dismissDistractions() asks the watcher to look now (one call) instead of
 * polling eight locators, so every existing call site gets the fast path.
 */

const GUARD = String.raw`(() => {
  if (window.__spineGuard) return;
  const NOISE = new RegExp(__NOISE__, "i");
  // The declining half of a prompt, or its close control. Never the accepting half.
  const DECLINE = /^(not\s*now|no,?\s*thanks|maybe later|later|skip( tour)?|dismiss|close|got it|ok,? got it|×|✕|x)$/i;
  const NEVER = /enable|allow|yes|turn on|subscribe|i'?m in|accept all/i;
  const BOXES = ".ant-notification-notice, .ant-message-notice, .ant-modal-wrap, [role='dialog'], [role='alert'], [class*='popup' i], [class*='banner' i], [class*='toast' i], [class*='cookie' i], [class*='tour' i], [class*='joyride' i], .introjs-tooltip, .shepherd-element, [role='tooltip'], .ant-popover, .ant-tooltip";
  const state = { closed: [], scans: 0 };
  window.__spineGuard = state;
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  };
  const words = (el) => ((el.innerText || el.textContent || el.getAttribute("aria-label") || "") + "").replace(/\s+/g, " ").trim();
  const scan = () => {
    state.scans++;
    let closed = 0;
    const boxes = Array.from(document.querySelectorAll(BOXES)).filter(shown);
    // Innermost first: a prompt inside a wrapper is handled once, by its own box.
    boxes.sort((a, b) => (a.contains(b) ? 1 : b.contains(a) ? -1 : 0));
    const done = new Set();
    for (const box of boxes) {
      if ([...done].some((d) => d.contains(box) || box.contains(d))) continue;
      const text = words(box).slice(0, 600);
      if (!NOISE.test(text)) continue;
      // Never a drawer the run opened, even if its text happens to match.
      if (box.closest(".ant-drawer")) continue;
      const controls = Array.from(box.querySelectorAll("button, [role='button'], a, .anticon-close, .ant-notification-notice-close, .ant-modal-close, [aria-label*='close' i]")).filter(shown);
      const pick =
        controls.find((c) => DECLINE.test(words(c)) && !NEVER.test(words(c))) ||
        controls.find((c) => c.matches(".anticon-close, .ant-notification-notice-close, .ant-modal-close, [aria-label*='close' i]") && !NEVER.test(words(c)));
      if (!pick) continue;
      try {
        pick.click();
      } catch (e) {
        continue;
      }
      done.add(box);
      closed++;
      state.closed.push({ at: Date.now(), what: text.slice(0, 70), button: (words(pick) || "×").slice(0, 24) });
    }
    return closed;
  };
  state.scan = scan;
  let queued = 0;
  const soon = () => {
    if (queued) return;
    queued = setTimeout(() => { queued = 0; try { scan(); } catch (e) {} }, 120);
  };
  const watch = () => {
    try {
      new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };
  if (document.documentElement) watch();
  else document.addEventListener("DOMContentLoaded", watch, { once: true });
  // Prompts that fade in without adding nodes (a class change) are caught on the beat.
  setInterval(() => { try { scan(); } catch (e) {} }, 1500);
})();`;

const script = GUARD.replace("__NOISE__", JSON.stringify(NOISE_TEXT.map((r) => r.source).join("|")));

const guarded = new WeakSet<BrowserContext>();
const told = new WeakMap<Page, Set<string>>();

/** Give a browser context (every page in it, every navigation) the in-page watcher. */
export async function orchestrate(target: Page | BrowserContext): Promise<void> {
  if (process.env.UI_ORCHESTRATOR === "0") return;
  const ctx = "context" in target && typeof (target as Page).context === "function" ? (target as Page).context() : (target as BrowserContext);
  if (guarded.has(ctx)) return;
  guarded.add(ctx);
  await ctx.addInitScript({ content: script }).catch(() => {});
  // Pages already open (and already loaded) get it now too.
  for (const p of ctx.pages()) await p.evaluate(script).catch(() => {});
}

/**
 * Look now, from the test's side: one call into the page. True when something
 * was closed. Null when the page has no watcher (the caller falls back to its
 * own checks).
 */
export async function clearBlockers(page: Page): Promise<boolean | null> {
  const r = await page
    .evaluate(() => {
      const g = (window as unknown as { __spineGuard?: { scan: () => number } }).__spineGuard;
      return g ? g.scan() : -1;
    })
    .catch(() => -1);
  await report(page);
  return r < 0 ? null : r > 0;
}

/** Print what the watcher closed since last asked — once per kind of prompt per page. */
export async function report(page: Page): Promise<void> {
  const closed = await page
    .evaluate(() => {
      const g = (window as unknown as { __spineGuard?: { closed: Array<{ what: string; button: string }> } }).__spineGuard;
      if (!g) return [];
      const out = g.closed.slice();
      g.closed.length = 0;
      return out;
    })
    .catch(() => [] as Array<{ what: string; button: string }>);
  if (!closed.length) return;
  let seen = told.get(page);
  if (!seen) told.set(page, (seen = new Set()));
  for (const c of closed) {
    const kind = NOISE_TEXT.find((r) => r.test(c.what))?.source ?? c.what;
    if (seen.has(kind)) continue;
    seen.add(kind);
    console.log(`[orchestrator] closed a pop-up that was in the way — “${c.what.slice(0, 60)}” (pressed ${c.button})`);
  }
}
