import type { Locator, Page } from "@playwright/test";
import { released, wireLiveView } from "./liveControl.js";

/**
 * THE LIVE VIEW OF A WATCHED RUN: frames, and a pointer in them.
 *
 * The dashboard shows a run's browser as "[frame] <jpeg>" lines on stdout
 * (`launch()` in uiFlowRunner.ts pumps every line to the server). Someone
 * watching sees the page change but not what the automation is about to
 * touch, so a yellow arrow with a "spine.ai" pill marks the element just
 * before the automation clicks, types into, ticks, hovers or picks from it.
 *
 * Built for a feed of still pictures, not for a screen:
 * - The arrow JUMPS to the element. A glide only ever showed up in the feed
 *   as an arrow caught halfway between two elements, pointing at nothing
 *   (half the frames, measured, with a 420ms glide and a frame every 800ms).
 * - A frame is taken the moment the arrow lands, before the action, so every
 *   action is in the feed with the arrow on its element. The timer's frames
 *   fill the gaps, and screenshots are taken one at a time, in order.
 * - The arrow follows its element while the page scrolls or slides, and
 *   fades once the run moves on, so it is never left over the wrong thing.
 *
 * Hooked once, on the prototype of Playwright's Locator, so every page object
 * and plan step is covered without a change to any of them; only pages with a
 * feed (startLiveFrames) get the arrow. It is drawn inside a CLOSED shadow
 * root on a custom <spine-cursor> element: aria-hidden, pointer-events none,
 * so locators, getByText, the accessibility snapshot and Playwright's own
 * "does this element receive the click" check never see it.
 *
 * UI_LIVE_CURSOR=0 keeps the frames and drops the arrow. UI_CURSOR_LABEL
 * changes the pill's word.
 */

/** A frame on this beat when nothing else took one. */
const FRAME_MS = 800;
/** A timer tick this soon after another frame is skipped: the feed has a fresh picture. */
const MIN_GAP_MS = 350;
/** The arrow fades this long after it last landed. */
const REST_MS = 1_600;
/** The longest an action waits for its frame (a slow screenshot must not stall the run). */
const FRAME_WAIT_MS = 1_500;

const POINTED = ["click", "dblclick", "tap", "fill", "pressSequentially", "type", "press", "check", "uncheck", "setChecked", "hover", "selectOption", "setInputFiles"] as const;
const CLICKS = new Set(["click", "dblclick", "tap", "check", "uncheck", "setChecked", "selectOption"]);

type Feed = { page: Page; chain: Promise<void>; pending: number; last: number; stopped: boolean; paused: boolean };
const feeds = new WeakMap<Page, Feed>();
/** The feeds streaming now — so a vendor's page can take the live view for a while (focusFrames). */
const active = new Set<Feed>();
let hooked = false;

/**
 * Stream this page to the dashboard: a frame every FRAME_MS, and one each time
 * the pointer lands. Returns the function that stops it (closing the page
 * stops it too).
 */
export function startLiveFrames(page: Page): () => void {
  const feed: Feed = { page, chain: Promise.resolve(), pending: 0, last: 0, stopped: false, paused: false };
  // "Take control" (liveControl.ts) acts on the page the live view shows.
  wireLiveView(viewPage, (p) => void frameNow(p));
  feeds.set(page, feed);
  active.add(feed);
  enableLiveCursor(page);
  const timer = setInterval(() => {
    // Paused (another page has the view), one already on its way, or one just taken.
    if (feed.paused || feed.pending || Date.now() - feed.last < MIN_GAP_MS) return;
    void frameNow(page);
  }, FRAME_MS);
  const stop = () => {
    feed.stopped = true;
    active.delete(feed);
    clearInterval(timer);
  };
  page.on("close", stop);
  return stop;
}

/** Print one frame. Queued behind the one in flight, so frames arrive in the order taken. */
function frameNow(page: Page): Promise<void> {
  const feed = feeds.get(page);
  if (!feed || feed.stopped || feed.paused || page.isClosed()) return Promise.resolve();
  feed.pending++;
  feed.chain = feed.chain.then(async () => {
    try {
      if (feed.stopped || page.isClosed()) return;
      const buf = await page.screenshot({ type: "jpeg", quality: 40, timeout: 5_000 });
      feed.last = Date.now();
      console.log(`[frame] ${buf.toString("base64")}`);
    } catch {
      // Mid-navigation or the page just closed — skip this one, not fatal.
    } finally {
      feed.pending--;
    }
  });
  return feed.chain;
}

/**
 * Give the live view to another page while it is driven — the vendor portal,
 * which runs in its own browser context: every other feed pauses and this page
 * streams (with the pointer). The returned function stops it and hands the
 * view back. Without it the watcher saw the buyer's page sit still while a
 * vendor bid out of sight. A run with no live view gets a no-op.
 */
/** The page the live view is showing: the newest feed that is not paused. */
export function viewPage(): Page | undefined {
  let shown: Page | undefined;
  for (const f of active) if (!f.paused && !f.stopped && !f.page.isClosed()) shown = f.page;
  return shown;
}

export function focusFrames(page: Page): () => void {
  if (!active.size) return () => {};
  const paused = [...active].filter((f) => !f.paused);
  for (const f of paused) f.paused = true;
  const stop = startLiveFrames(page);
  return () => {
    stop();
    for (const f of paused) f.paused = false;
  };
}

/** Hook the pointer into Locator's actions (once per process). startLiveFrames calls it. */
export function enableLiveCursor(page: Page): void {
  if (hooked || process.env.UI_LIVE_CURSOR === "0") return;
  hooked = true;
  const label = (process.env.UI_CURSOR_LABEL || "spine.ai").slice(0, 24);
  const proto = Object.getPrototypeOf(page.locator("html")) as Record<string, unknown>;
  for (const name of POINTED) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    proto[name] = async function (this: Locator, ...args: unknown[]) {
      // A trial click only checks the element could be clicked; the real one follows.
      const trial = args.some((a) => !!a && typeof a === "object" && (a as { trial?: boolean }).trial === true);
      if (!trial) await pointAt(this, name, label).catch(() => {});
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

/** Put the arrow on this element and get it into the feed, then let the real action run. */
async function pointAt(loc: Locator, action: string, label: string): Promise<void> {
  const page = loc.page();
  const feed = feeds.get(page);
  if (!feed || feed.stopped || page.isClosed()) return;
  // The tester holds the browser (Take control): the automation's next action waits for the hand-back.
  await released();
  // Only an element that is on screen NOW. The suite tries several candidate
  // locators in turn and most are absent; waiting for each would slow every
  // run. isVisible() answers at once, and is false for no match or several.
  if (!(await loc.isVisible().catch(() => false))) return;
  // The action would scroll it into view anyway; do it first so the arrow is on it.
  // Short waits: the element was on screen a moment ago, and if it has just
  // gone (a pop-up closing itself) the pointer must not hold the action up —
  // at 1.5 s each, a vanished prompt cost three seconds before its click failed.
  await loc.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => {});
  const placed = await loc
    .evaluate(drawFn, { label, click: CLICKS.has(action), rest: REST_MS }, { timeout: 500 })
    .catch(() => "none");
  // A retry on the element the arrow is already on: the feed has that frame.
  if (placed !== "moved") return;
  await Promise.race([frameNow(page), new Promise((r) => setTimeout(r, FRAME_WAIT_MS))]);
}

/**
 * Runs in the page, with the element: draws the pointer on first use (every
 * new document starts without it), puts it on the element's centre, follows
 * the element while it moves, and fades it after `rest` ms. Returns "moved",
 * "same" (already on this element) or "none" (nothing to point at).
 *
 * Kept as source text so no compiler helper (a renamed function, a __name
 * call) ends up inside code that only runs in the browser; drawFn below turns
 * it into a function, whose source Playwright sends to the page as written.
 * (Passed as a string, Playwright evaluates it and never calls it.)
 */
const DRAW = String.raw`(el, o) => {
  let st = window.__spineCursor;
  if (!st || !st.root.host.isConnected) {
    const host = document.createElement("spine-cursor");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;contain:layout style;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = '<style>' +
      '* { pointer-events: none; box-sizing: border-box; }' +
      '.c { position: fixed; left: 0; top: 0; opacity: 0; transition: opacity 280ms ease; will-change: transform, opacity; }' +
      '.c.on { opacity: 1; transition: none; }' +
      '.arrow { position: absolute; left: -4px; top: -3px; width: 34px; height: 37px; filter: drop-shadow(0 2px 3px rgba(60, 40, 0, .35)); }' +
      '.pill { position: absolute; left: 24px; top: 30px; padding: 7px 14px; border-radius: 999px; background: #f8d24a; color: #1f1a0e; white-space: nowrap;' +
      ' font: 600 14px/1.1 -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif; letter-spacing: .1px;' +
      ' box-shadow: 0 3px 10px rgba(60, 40, 0, .28), inset 0 0 0 1px rgba(150, 110, 0, .25); }' +
      '.c.up .pill { top: -38px; }' +
      '.c.left .pill { left: auto; right: 4px; }' +
      '.ring { position: absolute; left: -15px; top: -15px; width: 30px; height: 30px; border-radius: 50%; border: 2px solid #f2c21b; opacity: 0; }' +
      '.ring.on { animation: ping 700ms ease-out forwards; }' +
      '@keyframes ping { 0% { opacity: .95; transform: scale(1); } 100% { opacity: 0; transform: scale(1.7); } }' +
      '</style>' +
      '<div class="c"><span class="ring"></span>' +
      '<svg class="arrow" viewBox="0 0 26 28" aria-hidden="true"><path d="M3 2.5 L23 11.2 Q24.4 11.9 23 12.6 L14.6 15.6 L11.4 24.4 Q10.8 25.9 10 24.4 Z" fill="#f8d24a" stroke="#b8860b" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
      '<span class="pill"></span></div>';
    (document.documentElement || document.body).appendChild(host);
    st = { root: root, c: root.querySelector(".c"), ring: root.querySelector(".ring"), pill: root.querySelector(".pill"), target: null, at: 0, raf: 0 };
    window.__spineCursor = st;
  }
  if (st.pill.textContent !== o.label) st.pill.textContent = o.label;
  const same = st.target === el && Date.now() - st.at < 2000;
  st.target = el;
  st.at = Date.now();
  const place = () => {
    const t = st.target;
    const r = t && t.isConnected ? t.getBoundingClientRect() : null;
    if (!r || r.width <= 0 || r.height <= 0) {
      st.c.classList.remove("on");
      return false;
    }
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    st.c.style.transform = "translate(" + x + "px, " + y + "px)";
    // Near the bottom or right edge the pill goes above / to the left, so it is never cut off.
    st.c.classList.toggle("up", y > innerHeight - 72);
    st.c.classList.toggle("left", x > innerWidth - 150);
    return true;
  };
  cancelAnimationFrame(st.raf);
  if (!place()) return "none";
  st.c.classList.add("on");
  if (o.click) {
    st.ring.classList.remove("on");
    void st.ring.offsetWidth;
    st.ring.classList.add("on");
  }
  const until = st.at + o.rest;
  const follow = () => {
    if (Date.now() > until) {
      st.c.classList.remove("on");
      return;
    }
    if (place()) st.raf = requestAnimationFrame(follow);
  };
  st.raf = requestAnimationFrame(follow);
  return same ? "same" : "moved";
}`;

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const drawFn = new Function(`return ${DRAW}`)() as (el: Element, o: { label: string; click: boolean; rest: number }) => "moved" | "same" | "none";
