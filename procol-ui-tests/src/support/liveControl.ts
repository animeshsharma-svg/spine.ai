import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
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
 * The channel is two files the dashboard writes (src/routes/liveControl.ts),
 * next to the explorer's answer files — a file, not a socket, so nothing has
 * to stay connected while a person works:
 *   .plans/live-control.json   { held, at }   who holds the browser now
 *   .plans/live-input.jsonl    one input per line: click {x,y} · type {text} · key {key} · wheel {dy}
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

type Input =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "wheel"; dy: number };

let lastRead = 0;
let heldCache = false;
/** Is the browser in the tester's hands right now? */
export function controlHeld(): boolean {
  if (Date.now() - lastRead < 100) return heldCache;
  lastRead = Date.now();
  try {
    if (!existsSync(CONTROL)) return (heldCache = false);
    const c = JSON.parse(readFileSync(CONTROL, "utf8"));
    heldCache = !!c.held && Number(c.at) >= STARTED - 2_000;
  } catch {
    heldCache = false;
  }
  return heldCache;
}

// ── the page the live view shows, and how to refresh it — set by liveCursor.ts ──
let viewOf: () => Page | undefined = () => undefined;
let refresh: (page: Page) => void = () => {};
export function wireLiveView(view: () => Page | undefined, nudge: (page: Page) => void): void {
  viewOf = view;
  refresh = nudge;
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

// ── the tester's inputs ──────────────────────────────────────────────────────
let offset = -1;
let poller: ReturnType<typeof setInterval> | undefined;
let busy = false;
let lastFrame = 0;
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
  if (held && !wasHeld) console.log("[control] you took control of the browser");
  if (!held && wasHeld) lastHandBack = Date.now();
  wasHeld = held;
  if (!held) return;
  const page = viewOf();
  if (!page || page.isClosed()) return;
  busy = true;
  try {
    for (const input of newInputs()) await apply(page, input);
    // Faster pictures while a person is working on them.
    if (Date.now() - lastFrame > 300) {
      lastFrame = Date.now();
      refresh(page);
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

let typingSecret = false;
async function apply(page: Page, input: Input): Promise<void> {
  try {
    if (input.type === "click" && Number.isFinite(input.x) && Number.isFinite(input.y)) {
      const { label, secret } = await labelAt(page, input.x, input.y);
      typingSecret = secret;
      await page.mouse.click(input.x, input.y);
      console.log(`[control] you clicked ${label ? `“${label}”` : `at ${Math.round(input.x)}, ${Math.round(input.y)}`}`);
    } else if (input.type === "type" && input.text) {
      await page.keyboard.type(String(input.text).slice(0, 500));
      // A code or password is never written into the log or the report.
      console.log(typingSecret ? "[control] you typed into the code box" : `[control] you typed “${String(input.text).slice(0, 60)}”`);
    } else if (input.type === "key" && /^[A-Za-z0-9+]{1,24}$/.test(input.key)) {
      await page.keyboard.press(input.key);
      console.log(`[control] you pressed ${input.key}`);
    } else if (input.type === "wheel" && Number.isFinite(input.dy)) {
      await page.mouse.wheel(0, Math.max(-3000, Math.min(3000, input.dy)));
    }
  } catch (e) {
    console.log(`[control] that ${input.type} could not be done: ${(e as Error).message.split("\n")[0]}`);
  }
}

/** For tests: drop an input into the channel the way the dashboard does. */
export function _queueInput(input: Input): void {
  appendFileSync(INPUT, JSON.stringify(input) + "\n");
}
