/**
 * THE SPOTLIGHT — a photograph of every action, with the control it acts on framed.
 *
 * A person watching a tester works out what is being tested from where the cursor goes. A
 * plain screenshot taken after the fact shows none of that. So before every action a plan
 * performs (a click, a fill, a check, a chosen option), the runner draws a frame around the
 * control it is about to act on, dims the rest of the screen a little, writes the step and
 * the control's name on a label, and takes the picture — then removes the frame and acts.
 * After every assertion that passes, it takes a second kind of picture: a green "verified"
 * banner over the screen the assertion was judged on.
 *
 * How it hooks in: every page object acts through Playwright locators, and every locator
 * shares one prototype. Patching that prototype's action methods once covers every page
 * object, the generic steps and the vendor portal's pages alike — no page object changes.
 * The frame is drawn with `pointer-events: none` and removed before the action runs, so it
 * can never intercept the click it photographs.
 *
 * Each picture is a JPEG under evidence/<run>/spot-… (quality 72, ~60–120 KB); the same
 * bytes go out as a `[frame]` line, so the dashboard's live view shows the framed screen the
 * moment it is taken, and a `[spot]` line names the file, the step and the control, which the
 * run result keeps per step. At most 160 pictures a run.
 *
 * SAVED PICTURES ARE OPT-IN since 26 Oct (Aanya: "screenshots taken at every point is not the optimal
 * way … for each step we can save the console or divs or buttons, but not a screenshot of each
 * step"). By default every action is kept as WORDS (stepActions: the verb, the control as the locator
 * names it, the value typed, codes masked) for the step's screen record (observe.ts), and the purple
 * frame is still drawn and sent to the LIVE VIEW only — nothing saved, no strip ("you removed the
 * purple highlight thing, i want that", 27 Oct). UI_SPOTLIGHT=1 (or "all") also saves a picture of
 * every action, for a walk meant to; UI_SPOTLIGHT=0 turns frame and words off.
 */
import type { Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { mask } from "../explore/ask.js";
import { paneOfPage } from "../support/liveCursor.js";

export interface SpotShot {
  file: string;
  /** click · fill · check · select · verify … */
  action: string;
  /** the control's visible name, or the assertion's words */
  target: string;
  step: number;
  stepName: string;
  /** the frame's viewport box, when one was drawn */
  box?: { x: number; y: number; w: number; h: number };
  url: string;
  at: string;
}

const ACTIONS: Array<[string, string]> = [
  ["click", "click"],
  ["dblclick", "double-click"],
  ["fill", "fill"],
  ["type", "type"],
  ["pressSequentially", "type"],
  ["check", "check"],
  ["uncheck", "uncheck"],
  ["selectOption", "select"],
  ["setInputFiles", "attach file"],
  ["press", "press"],
];

const ACCENT = "#d946ef"; // the frame colour for an action
const GOOD = "#16a34a"; // the frame colour for a verified assertion
const MAX_SHOTS = 160;

let dir = "";
const MODE = (process.env.UI_SPOTLIGHT ?? "").toLowerCase();
/** Save a picture of every action (opt-in). */
let enabled = MODE === "1" || MODE === "all";
/** Draw the frame on the live view (the default): the purple highlight, not saved. */
const highlight = MODE !== "0" && MODE !== "off";
/**
 * How long a frame stays on the page before the action goes on (Aanya, 29 Oct: "the purple highlighter
 * steps are going too fast … not too slow not too fast"). The frame was erased the moment its picture
 * was taken, so on a fast stretch it flashed by. It now holds: 0.6 s for an action, 0.9 s for a green
 * "verified". UI_SPOTLIGHT_HOLD_MS sets the action's hold (0 for none); the verified one is 1.5× it.
 */
const HOLD_MS = Math.max(0, Math.min(3_000, Number(process.env.UI_SPOTLIGHT_HOLD_MS ?? 600) || 0));
const hold = (ms: number) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
/** Shown on the live view only: a framed still sent as a [frame] line, never written to disk. */
async function liveOnly(page: Page): Promise<void> {
  const buf = await page.screenshot({ type: "jpeg", quality: 62, timeout: 5_000 }).catch(() => null);
  if (buf) console.log(`[frame${paneOfPage(page) ? `@${paneOfPage(page)}` : ""}] ${buf.toString("base64")}`);
}
/** What each action of the running step did, in words (kept even when no picture is taken). */
export interface StepAction {
  verb: string;
  target: string;
  value?: string;
}
let actions: StepAction[] = [];
/** The actions of the step that is running now. */
export function stepActions(): StepAction[] {
  return actions.slice();
}
/** The locator as Playwright describes it — getByRole('button', { name: 'Publish' }) — with no call to the page. */
const describe = (loc: Locator) => String(loc).replace(/^locator\((.*)\)$/s, "$1").replace(/\s+/g, " ").slice(0, 140);
const keepValue = (target: string, v: string) => (/password|otp|\bcode\b|passcode|\bpin\b/i.test(target) ? "•••" : v.replace(/\s+/g, " ").slice(0, 60));
let count = 0;
let current = { no: 0, name: "plan", total: 0 };
let perStep: SpotShot[] = [];
let busy = false;
const patched = new WeakSet<object>();

/** Where this run's pictures go; patches the locator prototype once. */
export function installSpotlight(page: Page, evidenceDir: string): void {
  dir = evidenceDir;
  if (MODE === "0" || MODE === "off") return;
  const proto = Object.getPrototypeOf(page.locator("body")) as Record<string, any>;
  if (patched.has(proto)) return;
  patched.add(proto);
  for (const [method, verb] of ACTIONS) {
    const orig = proto[method];
    if (typeof orig !== "function") continue;
    proto[method] = async function (this: Locator, ...args: unknown[]) {
      const value = method === "fill" || method === "type" || method === "pressSequentially" ? String(args[0] ?? "") : method === "selectOption" ? optionWords(args[0]) : method === "press" ? String(args[0] ?? "") : undefined;
      if (actions.length < 40) {
        const target = describe(this);
        actions.push({ verb, target, ...(value !== undefined ? { value: keepValue(target, value) } : {}) });
      }
      if (enabled || highlight) await spotlight(this, verb, value).catch(() => {});
      return orig.apply(this, args);
    };
  }
}

function optionWords(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : (x as any)?.label ?? (x as any)?.value ?? "")).join(", ");
  return (v as any).label ?? (v as any).value ?? undefined;
}

/** The step about to run: numbers the pictures and starts a fresh list for the step. */
export function beginStep(no: number, name: string, total: number): void {
  current = { no, name, total };
  perStep = [];
  actions = [];
}

/** The pictures taken during the step that is running now. */
export function stepShots(): SpotShot[] {
  return perStep.slice();
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The visible name of what a locator points at — what a person would call it. */
async function nameOf(loc: Locator): Promise<string> {
  return loc
    .evaluate((el: Element) => {
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
      const e = el as HTMLElement;
      const inner = e.querySelector("input, textarea") as HTMLInputElement | null;
      const own = clean(e.innerText) || clean(e.getAttribute("aria-label")) || clean((e as HTMLInputElement).placeholder) || clean(e.getAttribute("placeholder")) || clean(inner?.placeholder) || clean(inner?.getAttribute("aria-label")) || clean(e.getAttribute("title")) || clean(e.getAttribute("name"));
      if (own) return own;
      const id = e.getAttribute("id");
      const lab = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : e.closest(".ant-form-item")?.querySelector("label");
      const kind = /^(input|textarea|select)$/i.test(e.tagName) ? "field" : e.getAttribute("role") || e.tagName.toLowerCase();
      return clean(lab?.textContent) || clean(e.closest("[role='row'], .ant-form-item, label")?.textContent).slice(0, 60) || `the ${kind}`;
    }, undefined, { timeout: 1_500 })
    .catch(() => "");
}

/**
 * Frame one control and photograph it. Does nothing when the locator is not visible,
 * matches several elements, or the run is over its picture budget.
 */
async function spotlight(loc: Locator, verb: string, value?: string): Promise<void> {
  const saving = enabled && count < MAX_SHOTS && !!dir;
  if ((!saving && !highlight) || busy) return;
  const page = loc.page();
  if (page.isClosed()) return;
  busy = true;
  try {
    const box = await loc.boundingBox({ timeout: 1_500 }).catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) return;
    const target = clip((await nameOf(loc)) || verb, 60);
    // Closing a pop-up the product threw in the way ("Not now" on the notification prompt, a
    // tour's "Skip") is housekeeping, not the test: no picture, or the strip fills with them.
    if (verb === "click" && /^(not now|skip|skip tour|got it|later|maybe later|dismiss|no thanks|remind me later)$/i.test(target)) return;
    // What was typed, as the picture may show it: never a code or a password,
    // never a whole phone number, never a login the tester typed in the chat.
    const shown = value && /otp|one[- ]?time|verification|\bcode\b|password|passcode|\bpin\b/i.test(target)
      ? "•••"
      : value ? mask(value).replace(/\d{6,}(\d{4})/g, "…$1") : value;
    const label = `Step ${current.no}${current.total ? `/${current.total}` : ""} · ${verb}${shown && verb !== "press" ? ` “${clip(shown, 28)}”` : shown ? ` ${shown}` : ""} · ${mask(target)}`;
    await draw(page, { x: box.x, y: box.y, w: box.width, h: box.height }, label, ACCENT, `${current.name.replace(/_/g, " ")}`);
    if (saving) await snap(page, verb, target, { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) });
    else await liveOnly(page);
    await hold(HOLD_MS);
  } finally {
    await erase(page);
    busy = false;
  }
}

/** A green "verified" picture after an assertion passed. */
export async function spotlightVerify(page: Page, text: string): Promise<void> {
  const saving = enabled && count < MAX_SHOTS && !!dir;
  if ((!saving && !highlight) || busy || page.isClosed()) return;
  busy = true;
  try {
    await draw(page, null, `✓ Verified · ${clip(text.replace(/_/g, " "), 110)}`, GOOD, `step ${current.no}${current.total ? `/${current.total}` : ""}`);
    if (saving) await snap(page, "verify", clip(text, 120));
    else await liveOnly(page);
    await hold(Math.round(HOLD_MS * 1.5));
  } finally {
    await erase(page);
    busy = false;
  }
}

/** A green frame around one control an assertion looked at (generic expect steps). */
export async function spotlightMark(loc: Locator, text: string): Promise<void> {
  const saving = enabled && count < MAX_SHOTS && !!dir;
  if ((!saving && !highlight) || busy) return;
  const page = loc.page();
  if (page.isClosed()) return;
  busy = true;
  try {
    const box = await loc.boundingBox({ timeout: 1_500 }).catch(() => null);
    if (!box) return;
    await draw(page, { x: box.x, y: box.y, w: box.width, h: box.height }, `✓ Verified · ${clip(text, 90)}`, GOOD, `step ${current.no}${current.total ? `/${current.total}` : ""}`);
    if (saving) await snap(page, "verify", clip(text, 120), { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) });
    else await liveOnly(page);
    await hold(Math.round(HOLD_MS * 1.5));
  } finally {
    await erase(page);
    busy = false;
  }
}

/**
 * The annotated map of a screen: every inventoried control framed and numbered, in one
 * picture, so a person (or the dashboard) can point at "control 7" and mean one thing.
 * Returns the file written, or null.
 */
export async function spotlightMap(page: Page, label: string, controls: Array<{ n?: number; kind: string; box?: { x: number; y: number; w: number; h: number }; offscreen?: boolean }>): Promise<string | null> {
  if (!dir || page.isClosed()) return null;
  const boxes = controls.filter((c) => c.box && !c.offscreen && c.box.w > 0 && c.box.h > 0).map((c) => ({ n: c.n ?? 0, kind: c.kind, box: c.box! }));
  if (!boxes.length) return null;
  busy = true;
  try {
    await page
      .evaluate(
        ({ boxes, label }) => {
          document.getElementById("__spine_spot")?.remove();
          const root = document.createElement("div");
          root.id = "__spine_spot";
          root.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:-apple-system,Inter,Segoe UI,Roboto,sans-serif;");
          const colour = (kind: string) => (kind === "field" || kind === "select" || kind === "checkbox" || kind === "switch" ? "#0ea5e9" : kind === "tab" || kind === "link" ? "#f59e0b" : kind === "column" ? "#64748b" : "#d946ef");
          for (const b of boxes) {
            const c = colour(b.kind);
            const f = document.createElement("div");
            f.setAttribute("style", `position:fixed;left:${b.box.x - 2}px;top:${b.box.y - 2}px;width:${b.box.w + 4}px;height:${b.box.h + 4}px;border:2px solid ${c};border-radius:6px;box-shadow:0 0 0 2px ${c}33;`);
            root.appendChild(f);
            const tag = document.createElement("div");
            tag.setAttribute("style", `position:fixed;left:${Math.max(0, b.box.x - 2)}px;top:${Math.max(0, b.box.y - 16)}px;min-width:16px;height:16px;padding:0 4px;border-radius:4px 4px 4px 0;background:${c};color:#fff;font-size:10.5px;font-weight:700;line-height:16px;text-align:center;box-shadow:0 2px 6px rgba(2,6,23,.35);`);
            tag.textContent = String(b.n);
            root.appendChild(tag);
          }
          const brand = document.createElement("div");
          brand.setAttribute("style", "position:fixed;right:14px;bottom:12px;background:rgba(2,6,23,.78);color:#fff;font-size:11px;font-weight:600;line-height:1;padding:6px 10px;border-radius:999px;");
          brand.textContent = `spine.ai · screen map · ${label}`;
          root.appendChild(brand);
          document.documentElement.appendChild(root);
        },
        { boxes, label },
      )
      .catch(() => {});
    const buf = await page.screenshot({ type: "png", timeout: 8_000 }).catch(() => null);
    if (!buf) return null;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `map-${String(current.no).padStart(2, "0")}-${label.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 50)}.png`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, buf);
    return file;
  } finally {
    await erase(page);
    busy = false;
  }
}

async function draw(page: Page, box: { x: number; y: number; w: number; h: number } | null, label: string, colour: string, tag: string): Promise<void> {
  await page
    .evaluate(
      ({ box, label, colour, tag }) => {
        document.getElementById("__spine_spot")?.remove();
        const root = document.createElement("div");
        root.id = "__spine_spot";
        root.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:-apple-system,Inter,Segoe UI,Roboto,sans-serif;");
        const pad = 5;
        if (box) {
          const vw = window.innerWidth, vh = window.innerHeight;
          const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
          const w = Math.min(vw - x, box.w + pad * 2), h = Math.min(vh - y, box.h + pad * 2);
          const frame = document.createElement("div");
          frame.setAttribute("style", `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:3px solid ${colour};border-radius:9px;box-shadow:0 0 0 4px ${colour}44,0 0 0 9999px rgba(2,6,23,.30),0 12px 36px ${colour}66;background:${colour}0d;`);
          root.appendChild(frame);
          const pill = document.createElement("div");
          const above = y >= 40;
          pill.setAttribute("style", `position:fixed;left:${Math.min(x, Math.max(0, vw - 480))}px;top:${above ? y - 36 : y + h + 8}px;max-width:470px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${colour};color:#fff;font-size:13px;font-weight:600;line-height:1;padding:8px 12px;border-radius:999px;box-shadow:0 6px 20px rgba(2,6,23,.35);letter-spacing:.1px;`);
          pill.textContent = label;
          root.appendChild(pill);
        } else {
          const edge = document.createElement("div");
          edge.setAttribute("style", `position:fixed;inset:0;box-shadow:inset 0 0 0 6px ${colour}cc, inset 0 0 60px ${colour}33;`);
          root.appendChild(edge);
          const banner = document.createElement("div");
          banner.setAttribute("style", `position:fixed;left:50%;top:18px;transform:translateX(-50%);max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${colour};color:#fff;font-size:14px;font-weight:600;line-height:1;padding:10px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(2,6,23,.35);`);
          banner.textContent = label;
          root.appendChild(banner);
        }
        const brand = document.createElement("div");
        brand.setAttribute("style", "position:fixed;right:14px;bottom:12px;background:rgba(2,6,23,.78);color:#fff;font-size:11px;font-weight:600;line-height:1;padding:6px 10px;border-radius:999px;letter-spacing:.2px;");
        brand.textContent = `spine.ai · ${tag}`;
        root.appendChild(brand);
        document.documentElement.appendChild(root);
      },
      { box, label, colour, tag },
    )
    .catch(() => {});
}

async function erase(page: Page): Promise<void> {
  if (page.isClosed()) return;
  await page.evaluate(() => document.getElementById("__spine_spot")?.remove()).catch(() => {});
}

async function snap(page: Page, action: string, target: string, box?: SpotShot["box"]): Promise<void> {
  const buf = await page.screenshot({ type: "jpeg", quality: 72, timeout: 8_000 }).catch(() => null);
  if (!buf) return;
  count += 1;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `spot-${String(current.no).padStart(2, "0")}-${String(count).padStart(3, "0")}-${action.replace(/[^a-z-]+/gi, "")}.jpg`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(file, buf);
  const shot: SpotShot = { file, action, target, step: current.no, stepName: current.name, ...(box ? { box } : {}), url: page.url(), at: new Date().toISOString() };
  perStep.push(shot);
  console.log(`[frame${paneOfPage(page) ? `@${paneOfPage(page)}` : ""}] ${buf.toString("base64")}`);
  console.log(`[spot] ${JSON.stringify(shot)}`);
}
