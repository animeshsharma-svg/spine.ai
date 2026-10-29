import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

/**
 * TAKING CONTROL OF THE LIVE BROWSER.
 *
 * When a run is stuck — or the tester simply wants to do a step themselves —
 * they press "Take control" on the session's live view, click and type on the
 * picture, then "Hand back". The run's browser does what they did, and the
 * run carries on from the page as they left it.
 *
 * The channel is files beside the explorer's answer files — a file, not a
 * socket, so nothing has to stay connected while a person works:
 *   .plans/live-control.json   { held, at, runId }   who holds the browser now (the dashboard writes it)
 *   .plans/live-input.jsonl    one input per line (the dashboard writes it): the pointer as it really
 *                              moves — move · down · up {x, y, button, clickCount}, so double-clicks,
 *                              hover menus and drags work — wheel {dx, dy}, type {text}, key {key, with
 *                              Control/Meta/Alt/Shift}, nav {back|forward|reload|url}, tab {show|close|new}
 *   .plans/live-view.json      the tabs and address the live view's bar shows (this file writes it)
 * One browser run at a time holds the slot, so the files need no run id; a
 * run ignores anything written before it started (a control left held by a
 * run that has ended must not freeze the next one).
 *
 *  - released(): every action the automation takes waits here first (the
 *    pointer's Locator hook, liveCursor.ts), so ANY run — a journey, a typed
 *    plan, the explorer — stops before its next step while the tester holds it.
 *  - The poller applies the tester's inputs to the page the live view shows,
 *    streams frames faster while they work, and narrates each input as a
 *    `[control]` line, so the run's steps and report say a person helped.
 */

const PLANS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".plans");
const CONTROL = join(PLANS, "live-control.json");
const INPUT = join(PLANS, "live-input.jsonl");
const STARTED = Date.now();
const POLL_MS = 150;

// ── what the tester types while the run goes ────────────────────────────────
// The session's composer (POST /api/live/say) appends to .plans/<run>-told.jsonl, one file per run, so
// another run never reads it (Aanya, 26 Oct: "when the browser keeps running, the user cannot send any
// command in between"). Each message is used once: by the explorer at its next move, or between steps
// as "stop" / "skip".
const toldQueue: string[] = [];
let toldOffset = 0;
function readTold(): void {
  const file = join(PLANS, `${String(process.env.QA_RUN_ID ?? "none").replace(/[^\w.-]+/g, "_")}-told.jsonl`);
  try {
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    if (size <= toldOffset) return;
    const text = readFileSync(file, "utf8").slice(toldOffset);
    toldOffset = size;
    for (const line of text.split("\n")) {
      try {
        const t = String(JSON.parse(line).text ?? "").trim();
        if (t) toldQueue.push(t.slice(0, 500));
      } catch {
        /* a half-written line: the next read has it */
      }
    }
  } catch {
    /* nothing to read */
  }
}
/** Messages the tester typed to this run that nothing has used yet. */
export function pendingTold(): string[] {
  readTold();
  return toldQueue.slice();
}
/** Take the tester's messages — all, or the ones `which` picks; each is used once. */
export function takeTold(which: (t: string) => boolean = () => true): string[] {
  readTold();
  const out: string[] = [];
  for (let i = 0; i < toldQueue.length; ) {
    if (which(toldQueue[i])) out.push(...toldQueue.splice(i, 1));
    else i++;
  }
  return out;
}

type Button = "left" | "right" | "middle";
type Input =
  | { type: "click"; x: number; y: number; pane?: "side" }
  | { type: "move"; x: number; y: number; pane?: "side" }
  | { type: "down" | "up"; x: number; y: number; button?: Button; clickCount?: number; pane?: "side" }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "wheel"; x?: number; y?: number; dx?: number; dy: number; pane?: "side" }
  | { type: "nav"; to: "back" | "forward" | "reload" | "url"; url?: string }
  | { type: "tab"; op: "show" | "close" | "new"; id?: number; url?: string };

let lastRead = 0;
let heldCache = false;
/** Is the browser in the tester's hands right now? */
export function controlHeld(): boolean {
  if (Date.now() - lastRead < 100) return heldCache;
  lastRead = Date.now();
  try {
    if (!existsSync(CONTROL)) return (heldCache = false);
    const c = JSON.parse(readFileSync(CONTROL, "utf8"));
    // The switch names the run the tester is watching: another run going at the same time (a second
    // session, or one whose page was closed) neither pauses nor gets their clicks (26 Oct: a 19:12 run
    // waiting to close received every click meant for the 19:31 one).
    const mine = !c.runId || !process.env.QA_RUN_ID || c.runId === process.env.QA_RUN_ID;
    heldCache = mine && !!c.held && Number(c.at) >= STARTED - 2_000;
  } catch {
    heldCache = false;
  }
  return heldCache;
}

// ── the page the live view shows, and how to refresh it — set by liveCursor.ts ──
let viewOf: () => Page | undefined = () => undefined;
let refresh: (page: Page) => void = () => {};
let focusOn: (page: Page) => () => void = () => () => {};
let paneOf: (pane: "" | "side") => Page | undefined = () => undefined;
export function wireLiveView(view: () => Page | undefined, nudge: (page: Page) => void, focus?: (page: Page) => () => void, pane?: (pane: "" | "side") => Page | undefined): void {
  viewOf = view;
  refresh = nudge;
  if (focus) focusOn = focus;
  if (pane) paneOf = pane;
  startPoller();
}

/** Wait while the tester holds the browser. The automation's next action happens after they hand it back. */
export async function released(): Promise<void> {
  if (!controlHeld()) return;
  console.log("[control] the run is waiting before its next step while you have the browser");
  while (controlHeld()) await new Promise((r) => setTimeout(r, POLL_MS));
  lastHandBack = Date.now();
  console.log("[control] you handed the browser back — the run carries on from this page");
}

/**
 * When the tester last handed the browser back in this run (0: never). What
 * they did meanwhile may have moved the journey on — published the event
 * themselves — and the steps meant for the screen they left must not be
 * driven against the one they handed back.
 */
let lastHandBack = 0;
export const handedBackAt = (): number => lastHandBack;
/** When the hold now going (or the last one) began (0: never). */
let holdBegan = 0;
export const holdStartedAt = (): number => holdBegan;

// ── a real browser while they hold it: tabs, the address bar, back and forward ──
/**
 * Aanya, 28 Oct: "i want it to act like a real browser where user can do whatever he wants, open
 * whatever he wants". While they hold it, the live view is their browser: a link that opens a new
 * tab shows that tab, they can switch and close tabs, type an address, go back, forward and reload.
 * The run's own page is the one it carries on with when they hand it back; the view returns to it.
 */
let basePage: Page | undefined;
let shownTab: { page: Page; undo: () => void } | null = null;
const tabIds = new WeakMap<Page, number>();
let nextTab = 1;
const tabId = (p: Page): number => {
  let id = tabIds.get(p);
  if (!id) tabIds.set(p, (id = nextTab++));
  return id;
};
const watched = new WeakSet<object>();
/** The page the main picture shows: a tab they switched to, else the run's own. */
const mainPage = (): Page | undefined => {
  const t = shownTab?.page;
  return t && !t.isClosed() ? t : paneOf("") ?? viewOf();
};
/** The page they last pointed at — where their typing, keys and the address bar go. */
let lastTarget: Page | undefined;
const current = (): Page | undefined => (lastTarget && !lastTarget.isClosed() ? lastTarget : mainPage());
/** Which page an input is for: a pointer goes to the picture it landed on (the vendor portal beside the buyer is its own). */
function targetOf(input: Input): Page | undefined {
  if (input.type !== "move" && input.type !== "down" && input.type !== "up" && input.type !== "click" && input.type !== "wheel") return current();
  const p = input.pane === "side" ? paneOf("side") ?? mainPage() : mainPage();
  if (p && input.type !== "move") lastTarget = p;
  return p;
}
function tabsNow(): Page[] {
  const pages = new Set<Page>();
  for (const base of [basePage, paneOf("side")]) if (base && !base.isClosed()) for (const p of base.context().pages()) pages.add(p);
  const c = current();
  if (c && !c.isClosed()) pages.add(c);
  return [...pages].filter((p) => !p.isClosed());
}
async function show(p: Page): Promise<void> {
  if (p.isClosed() || p === current()) return;
  if (shownTab) {
    shownTab.undo();
    shownTab = null;
  }
  if (p !== basePage) shownTab = { page: p, undo: focusOn(p) };
  lastTarget = p;
  await p.bringToFront().catch(() => {});
  console.log(`[control] showing the tab “${(await titleOf(p)) || p.url()}”`);
  refresh(p);
}
async function titleOf(p: Page): Promise<string> {
  return Promise.race([p.title().catch(() => ""), new Promise<string>((r) => setTimeout(() => r(""), 300))]);
}
/** A tab a click opened while they hold the browser comes forward, as it would in a browser. */
function watchTabs(page: Page): void {
  const ctx = page.context();
  if (watched.has(ctx)) return;
  watched.add(ctx);
  ctx.on("page", (p) => {
    if (!controlHeld()) return;
    console.log("[control] a new tab opened");
    void p.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {}).then(() => show(p));
  });
}
function beginHold(): void {
  holdBegan = Date.now();
  basePage = paneOf("") ?? viewOf();
  lastTarget = undefined;
  if (basePage) watchTabs(basePage);
  lastView = "";
}
function endHold(): void {
  lastHandBack = Date.now();
  lastTarget = undefined;
  if (shownTab) {
    shownTab.undo();
    shownTab = null;
  }
  void basePage?.bringToFront().catch(() => {});
  writeView(null);
}

// What the live view's address bar and tab strip show (read by GET /api/live/control).
const VIEW = join(PLANS, "live-view.json");
let lastView = "";
let lastViewAt = 0;
function writeView(tabs: { id: number; title: string; url: string; active: boolean }[] | null): void {
  try {
    const body = JSON.stringify({ runId: process.env.QA_RUN_ID ?? null, tabs });
    if (body === lastView && Date.now() - lastViewAt < 3_000) return;
    lastView = body;
    lastViewAt = Date.now();
    writeFileSync(VIEW, JSON.stringify({ runId: process.env.QA_RUN_ID ?? null, at: Date.now(), tabs }));
  } catch {
    /* the bar shows less; the browser still works */
  }
}
async function paintView(): Promise<void> {
  const c = current();
  const tabs = await Promise.all(tabsNow().map(async (p) => ({ id: tabId(p), title: (await titleOf(p)).slice(0, 80), url: p.url(), active: p === c })));
  writeView(tabs);
}

// ── the tester's inputs ──────────────────────────────────────────────────────
let offset = -1;
let poller: ReturnType<typeof setInterval> | undefined;
let busy = false;
let lastFrame = 0;
let lastPaint = 0;
let wasHeld = false;

function startPoller(): void {
  if (poller) return;
  // Inputs written before this run started are someone else's.
  try {
    offset = existsSync(INPUT) ? statSync(INPUT).size : 0;
  } catch {
    offset = 0;
  }
  poller = setInterval(() => void tick(), POLL_MS);
  poller.unref?.();
}

async function tick(): Promise<void> {
  if (busy) return;
  const held = controlHeld();
  if (held && !wasHeld) {
    console.log("[control] you took control of the browser");
    beginHold();
  }
  if (!held && wasHeld) endHold();
  wasHeld = held;
  if (!held) return;
  busy = true;
  try {
    const inputs = newInputs();
    // A run of pointer moves is only where the pointer ended up.
    const kept = inputs.filter((x, i) => !(x.type === "move" && inputs[i + 1]?.type === "move"));
    for (const input of kept) {
      const page = targetOf(input);
      if (!page || page.isClosed()) continue;
      await apply(page, input);
    }
    const page = current();
    if (!page || page.isClosed()) return;
    // Faster pictures while a person is working on them, and one straight after what they did.
    if (Date.now() - lastFrame > 250 || kept.some((x) => x.type !== "move")) {
      lastFrame = Date.now();
      refresh(page);
    }
    if (Date.now() - lastPaint > 500) {
      lastPaint = Date.now();
      await paintView();
    }
  } finally {
    busy = false;
  }
}

function newInputs(): Input[] {
  try {
    if (!existsSync(INPUT)) return [];
    const size = statSync(INPUT).size;
    if (size < offset) offset = 0; // the file was cleared
    if (size === offset) return [];
    const text = readFileSync(INPUT, "utf8").slice(offset);
    offset = size;
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as Input;
        } catch {
          return null;
        }
      })
      .filter((x): x is Input => !!x);
  } catch {
    return [];
  }
}

/** What sits at a point, in the words on screen — for the narration. */
async function labelAt(page: Page, x: number, y: number): Promise<{ label: string; secret: boolean }> {
  return page
    .evaluate(
      `(() => {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return { label: "", secret: false };
        const f = el.closest("button, a, input, textarea, select, [role=button], [role=option], [role=tab], label, td, li") || el;
        const t = (f.getAttribute("aria-label") || f.getAttribute("placeholder") || f.innerText || f.value || "").replace(/\\s+/g, " ").trim().slice(0, 60);
        const secret = f.tagName === "INPUT" && /password|otp|code/i.test((f.type || "") + " " + (f.name || "") + " " + (f.placeholder || "") + " " + (f.autocomplete || ""));
        return { label: t, secret };
      })()`,
    )
    .catch(() => ({ label: "", secret: false })) as Promise<{ label: string; secret: boolean }>;
}

// ── what the tester did, kept as steps a run can repeat ──────────────────────
/**
 * WHAT THE TESTER DID BY HAND, AS STEPS (Aanya, 26 Oct 2026: "whatever i do in ui, learn that
 * so that u dont get stuck again"). Every input applied while they hold the browser is journaled
 * with the control it landed on — its role and name, which is how the explorer's saved routes
 * find a control again — so a part done by hand can be saved as a route and the next run can
 * repeat it on its own instead of asking again. A typed code or password is never kept: a
 * journal that had one comes back flagged `secret`, and is not saved.
 */
export interface HandStep {
  action: "click" | "dblclick" | "fill" | "press" | "goto" | "back";
  /** in words, the way the explorer's steps read: Clicked “Technical Stage” */
  step: string;
  recipe?: { role: string; name: string; placeholder?: string; tag?: string; where?: string };
  value?: string;
  path: string;
  /** when it was done (ms) — a part takes only what was done since it began */
  at: number;
}
let journal: HandStep[] = [];
let journalSecret = false;
let lastField: HandStep["recipe"] | undefined;

/**
 * The tester's steps (only those done since `since`, when given) and whether a code or password was
 * typed among them. The journal starts empty again after: anything older belonged to no part.
 */
export function takeHandSteps(since = 0): { steps: HandStep[]; secret: boolean } {
  const out = { steps: journal.filter((h) => h.at >= since), secret: journalSecret };
  journal = [];
  journalSecret = false;
  return out;
}

/**
 * Their part done by hand, after a question they answered with "I'll do it myself" — or answered by
 * simply handing the browser back while it was open. Waits for the hold (one taken up to `graceMs`
 * after counts), then for the hand-back, and returns what they did since the question or since the
 * hold began, whichever was first. `held` is false when they never took the browser.
 */
export async function handPart(askedAt: number, graceMs = 8_000): Promise<{ steps: HandStep[]; secret: boolean; held: boolean }> {
  const until = Date.now() + graceMs;
  while (!controlHeld() && lastHandBack < askedAt && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
  const held = controlHeld() || lastHandBack >= askedAt;
  const since = Math.min(askedAt, holdBegan || askedAt);
  if (controlHeld()) await released();
  return { ...takeHandSteps(held ? since : Date.now()), held };
}

const pathOf = (page: Page) => {
  try {
    const u = new URL(page.url());
    return u.pathname + u.search;
  } catch {
    return page.url();
  }
};

/** The control at a point as a recipe (role + name), the way findByRecipe looks it up again. */
async function recipeAt(page: Page, x: number, y: number): Promise<HandStep["recipe"] | undefined> {
  return page
    .evaluate(
      `(() => {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return null;
        // A tick-box (the real input is often hidden under a drawn box): kept as "select this row"
        // with the row's words, the way the explorer lists and finds it again.
        const wrap = el.closest(".ant-checkbox-wrapper, .ant-checkbox, label, [class*='checkbox' i], [role='checkbox']");
        const realBox = el.matches("input[type='checkbox']") ? el : wrap && (wrap.matches("[role='checkbox']") ? wrap : wrap.querySelector("input[type='checkbox']"));
        if (realBox) {
          const head = el.closest("thead, .ant-table-thead");
          const row = head ? null : el.closest("tr, [role='row'], .ant-table-row");
          const words = ((wrap && wrap.innerText) || "").replace(/\\s+/g, " ").trim().slice(0, 80);
          return { role: "checkbox", name: words || (head ? "select all rows" : row ? "select this row" : "tick box"), tag: "input",
                   where: row ? "row: " + row.innerText.replace(/\\s+/g, " ").trim().slice(0, 70) : undefined };
        }
        // A sheet cell (an empty one has no words of its own): kept by its column's name and its row,
        // so "Delivery location" on line 2 reads as that, not as a click somewhere.
        const cell = el.closest("td, [role='gridcell'], [data-testid^='sheet-cell-']");
        if (cell && !el.closest("button, a, input, textarea, select") && !(cell.innerText || "").trim()) {
          const key = (cell.getAttribute("data-testid") || "").match(/^sheet-cell-\\d+-(.+)$/);
          let head = key ? document.querySelector("[data-testid='sheet-header-" + key[1] + "']") : null;
          if (!head && cell.tagName === "TD") {
            const table = cell.closest("table");
            const i = Array.prototype.indexOf.call(cell.parentElement.children, cell);
            head = table && table.querySelectorAll("thead th")[i];
          }
          const row = cell.closest("tr, [role='row']");
          const col = head ? (head.innerText || "").replace(/[*\\s]+/g, " ").trim().slice(0, 60) : "";
          if (col) return { role: "cell", name: col, tag: cell.tagName.toLowerCase(),
                            where: row ? "row: " + (row.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 70) : undefined };
        }
        const f = el.closest("button, a, input, textarea, select, [role]") || el;
        const tag = f.tagName.toLowerCase();
        const type = (f.getAttribute("type") || "").toLowerCase();
        const role = f.getAttribute("role") || (tag === "a" ? "link" : tag === "button" ? "button" : tag === "select" ? "combobox"
          : tag === "textarea" ? "textbox" : tag === "input" ? (type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : "textbox") : "text");
        const first = (t) => (t || "").split("\\n").map((l) => l.trim()).filter(Boolean)[0] || "";
        // A named control keeps its own name; anything else is found by the words actually clicked.
        const named = role !== "text" ? (f.getAttribute("aria-label") || first(f.innerText) || f.getAttribute("title") || "") : "";
        const name = (named || first(el.innerText) || first(f.innerText)).replace(/\\s+/g, " ").trim().slice(0, 80);
        return { role, name, placeholder: f.getAttribute("placeholder") || undefined, tag };
      })()`,
    )
    .then((r) => (r && ((r as any).name || (r as any).placeholder) ? (r as HandStep["recipe"]) : undefined))
    .catch(() => undefined);
}

let typingSecret = false;
/** A press, kept from the moment the button went down (the page may change before it comes up). */
let pressed: { x: number; y: number; label: string; recipe?: HandStep["recipe"]; path: string } | undefined;

/** A click or double-click, said and journaled. */
function noteClick(page: Page, at: { x: number; y: number; label: string; recipe?: HandStep["recipe"]; path: string }, count: number): void {
  const what = at.label ? `“${at.label}”` : `at ${Math.round(at.x)}, ${Math.round(at.y)}`;
  if (count >= 3) return;
  const last = journal[journal.length - 1];
  if (count === 2) {
    console.log(`[control] you double-clicked ${what}`);
    // The first click of the pair is already kept: it becomes the double-click.
    if (at.recipe && last?.action === "click" && last.recipe?.name === at.recipe.name) {
      last.action = "dblclick";
      last.step = last.step.replace(/^Clicked/, "Double-clicked");
    } else if (at.recipe) journal.push({ action: "dblclick", step: `Double-clicked “${at.recipe.name || at.recipe.placeholder}”`, recipe: at.recipe, path: at.path, at: Date.now() });
    return;
  }
  console.log(`[control] you clicked ${what}`);
  if (!at.recipe) {
    lastField = undefined; // typing after this goes to whatever that click focused, not the field before
    return;
  }
  lastField = at.recipe;
  const words = at.recipe.role === "checkbox" ? `Ticked “${at.recipe.name}”${at.recipe.where ? ` (${at.recipe.where.slice(0, 60)})` : ""}` : `Clicked “${at.recipe.name || at.recipe.placeholder}”`;
  journal.push({ action: "click", step: words, recipe: at.recipe, path: at.path, at: Date.now() });
}

const sameOrigin = (a: string, b: string) => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

async function apply(page: Page, input: Input): Promise<void> {
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  try {
    if (input.type === "move" && ok(input.x) && ok(input.y)) {
      await page.mouse.move(input.x, input.y);
    } else if (input.type === "down" && ok(input.x) && ok(input.y)) {
      const { label, secret } = await labelAt(page, input.x, input.y);
      typingSecret = secret;
      pressed = { x: input.x, y: input.y, label, recipe: await recipeAt(page, input.x, input.y), path: pathOf(page) };
      await page.mouse.move(input.x, input.y);
      await page.mouse.down({ button: input.button ?? "left", clickCount: Math.max(1, Math.min(3, input.clickCount ?? 1)) });
    } else if (input.type === "up" && ok(input.x) && ok(input.y)) {
      await page.mouse.move(input.x, input.y);
      const count = Math.max(1, Math.min(3, input.clickCount ?? 1));
      await page.mouse.up({ button: input.button ?? "left", clickCount: count });
      const at = pressed;
      pressed = undefined;
      if (!at) return;
      if (Math.hypot(input.x - at.x, input.y - at.y) > 6) console.log(`[control] you dragged from ${at.label ? `“${at.label}”` : "the page"} to ${Math.round(input.x)}, ${Math.round(input.y)}`);
      else if ((input.button ?? "left") !== "left") console.log(`[control] you right-clicked ${at.label ? `“${at.label}”` : "the page"}`);
      else noteClick(page, at, count);
    } else if (input.type === "click" && ok(input.x) && ok(input.y)) {
      const { label, secret } = await labelAt(page, input.x, input.y);
      typingSecret = secret;
      const at = { x: input.x, y: input.y, label, recipe: await recipeAt(page, input.x, input.y), path: pathOf(page) };
      await page.mouse.click(input.x, input.y);
      noteClick(page, at, 1);
    } else if (input.type === "type" && input.text) {
      await page.keyboard.type(String(input.text).slice(0, 2000));
      // A code or password is never written into the log or the report.
      console.log(typingSecret ? "[control] you typed into the code box" : `[control] you typed “${String(input.text).slice(0, 60)}”`);
      if (typingSecret) journalSecret = true;
      else {
        // Typing arrives in pieces: one fill per field, with all of its text.
        const last = journal[journal.length - 1];
        const text = String(input.text).slice(0, 2000);
        if (last?.action === "fill" && last.recipe === lastField) {
          last.value = (last.value ?? "") + text;
          last.step = `Typed “${last.value.slice(0, 60)}” in “${lastField?.name || lastField?.placeholder || "the field"}”`;
        } else {
          journal.push({ action: "fill", step: `Typed “${text.slice(0, 60)}” in “${lastField?.name || lastField?.placeholder || "the field"}”`, recipe: lastField, value: text, path: pathOf(page), at: Date.now() });
        }
      }
    } else if (input.type === "key" && typeof input.key === "string" && input.key.length <= 40 && !/[\n\r]/.test(input.key)) {
      await page.keyboard.press(input.key);
      console.log(`[control] you pressed ${input.key}`);
      if (/^(Enter|Escape|Tab)$/.test(input.key)) journal.push({ action: "press", step: `Pressed ${input.key}`, recipe: lastField, value: input.key, path: pathOf(page), at: Date.now() });
      // Typing fixed with Backspace keeps the field's text as it now is.
      if (input.key === "Backspace") {
        const last = journal[journal.length - 1];
        if (last?.action === "fill" && last.value) last.value = last.value.slice(0, -1);
      }
    } else if (input.type === "wheel" && ok(input.dy)) {
      if (ok(input.x) && ok(input.y)) await page.mouse.move(input.x, input.y);
      const clamp = (v: number) => Math.max(-3000, Math.min(3000, v));
      await page.mouse.wheel(clamp(ok(input.dx) ? input.dx : 0), clamp(input.dy));
    } else if (input.type === "nav") {
      const from = page.url();
      if (input.to === "back") {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
        console.log("[control] you went back");
        journal.push({ action: "back", step: "Went back", path: pathOf(page), at: Date.now() });
      } else if (input.to === "forward") {
        await page.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 });
        console.log("[control] you went forward");
      } else if (input.to === "reload") {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
        console.log("[control] you reloaded the page");
      } else if (input.to === "url" && input.url) {
        const url = toUrl(input.url);
        if (!url) return void console.log(`[control] “${String(input.url).slice(0, 80)}” is not a web address`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        console.log(`[control] you opened ${url.slice(0, 120)}`);
        // Only a page of the app itself is something a route can open again.
        if (sameOrigin(url, from)) journal.push({ action: "goto", step: `Opened ${new URL(url).pathname}`, value: new URL(url).pathname + new URL(url).search, path: pathOf(page), at: Date.now() });
      }
    } else if (input.type === "tab") {
      const tabs = tabsNow();
      const pick = tabs.find((p) => tabId(p) === input.id);
      if (input.op === "show" && pick) await show(pick);
      else if (input.op === "close" && pick) {
        if (pick === basePage) return void console.log("[control] the run's own tab stays open");
        if (shownTab?.page === pick) {
          shownTab.undo();
          shownTab = null;
        }
        await pick.close().catch(() => {});
        console.log("[control] you closed a tab");
      } else if (input.op === "new" && basePage) {
        const p = await basePage.context().newPage();
        tabId(p);
        const url = input.url ? toUrl(input.url) : null;
        if (url) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
        await show(p);
        console.log(`[control] you opened a new tab${url ? ` at ${url.slice(0, 120)}` : ""}`);
      }
      await paintView();
    }
  } catch (e) {
    console.log(`[control] that ${input.type} could not be done: ${(e as Error).message.split("\n")[0]}`);
  }
}

/** What they typed in the address bar, as a web address: "procol.in/x" → "https://procol.in/x"; nothing else. */
function toUrl(raw: string): string | null {
  const t = String(raw).trim();
  if (!t || /\s/.test(t)) return null;
  // "procol.in/x" → https; "localhost:4300" or an IP → http; anything with its own scheme stays as typed.
  const local = /^(localhost|127\.|\d{1,3}(\.\d{1,3}){3})(:|\/|$)/i.test(t);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `${local ? "http" : "https"}://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** For tests: drop an input into the channel the way the dashboard does. */
export function _queueInput(input: Input): void {
  appendFileSync(INPUT, JSON.stringify(input) + "\n");
}
