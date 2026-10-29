import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";
import { slotState } from "../ui/browserSlot.js";

/**
 * TAKE CONTROL OF THE LIVE BROWSER — the dashboard's half (the run's half is
 * procol-ui-tests/src/support/liveControl.ts).
 *
 *   GET  /api/live/control                 → { held, running, tabs }   is a browser run on, who holds it,
 *        and (while held) the run's tabs with their addresses, for the live view's browser bar
 *   POST /api/live/control { held }        → take (true) or hand back (false)
 *   POST /api/live/input   { events: [...] } → what the tester does, in the page's own pixels, as a real
 *        browser gets it (Aanya, 28 Oct: "act like a real browser"): move · down · up {x, y, button,
 *        clickCount} · click {x, y} · wheel {x, y, dx, dy} · type {text} · key {key, e.g. "Meta+a"} ·
 *        nav {to: back|forward|reload|url, url} · tab {op: show|close|new, id, url}
 *
 * Written as files beside the explorer's answers (.plans/), which the run polls.
 * The switch names the run in the browser slot (its id from the slot's label): a
 * second run going at the same time — another session's, or one whose page was
 * closed — neither pauses nor receives the clicks (26 Oct: a 19:12 run got every
 * click meant for the 19:31 one). The run also ignores anything older than itself.
 */
const here = dirname(fileURLToPath(import.meta.url));
const PLANS = join(here, "..", "..", "..", "procol-ui-tests", ".plans");
const CONTROL = join(PLANS, "live-control.json");
const INPUT = join(PLANS, "live-input.jsonl");
const VIEW = join(PLANS, "live-view.json");

/** A key as Playwright presses it: up to three modifiers, then one printable character or a named key. */
const KEYS = /^(?:(?:Control|Meta|Alt|Shift)\+){0,3}(?:[!-~]|Enter|Tab|Escape|Backspace|Delete|Insert|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space|F(?:[1-9]|1[0-2]))$/;
const BUTTONS = new Set(["left", "right", "middle"]);

function held(): boolean {
  try {
    return existsSync(CONTROL) && !!JSON.parse(readFileSync(CONTROL, "utf8")).held;
  } catch {
    return false;
  }
}

/** One input, checked: only these shapes, only sane sizes. */
function clean(e: any): object | null {
  if (!e || typeof e !== "object") return null;
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
  // A pointer on the vendor portal's picture beside the buyer's goes to that page.
  const pane = e.pane === "side" ? { pane: "side" } : {};
  const d = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-3000, Math.min(3000, Math.round(v))) : 0);
  if (e.type === "click" || e.type === "move" || e.type === "down" || e.type === "up") {
    const x = n(e.x, 5000), y = n(e.y, 5000);
    if (x === null || y === null) return null;
    if (e.type === "click" || e.type === "move") return { type: e.type, x, y, ...pane };
    return { type: e.type, x, y, button: BUTTONS.has(e.button) ? e.button : "left", clickCount: Math.max(1, Math.min(3, Math.round(Number(e.clickCount) || 1))), ...pane };
  }
  if (e.type === "type" && typeof e.text === "string" && e.text.length) return { type: "type", text: e.text.slice(0, 2000) };
  if (e.type === "key" && typeof e.key === "string" && KEYS.test(e.key)) return { type: "key", key: e.key };
  if (e.type === "wheel") {
    const x = n(e.x, 5000), y = n(e.y, 5000);
    return { type: "wheel", dx: d(e.dx), dy: d(e.dy), ...(x !== null && y !== null ? { x, y } : {}), ...pane };
  }
  if (e.type === "nav" && ["back", "forward", "reload", "url"].includes(e.to)) {
    if (e.to !== "url") return { type: "nav", to: e.to };
    return typeof e.url === "string" && e.url.trim() ? { type: "nav", to: "url", url: e.url.trim().slice(0, 2000) } : null;
  }
  if (e.type === "tab" && ["show", "close", "new"].includes(e.op)) {
    const id = n(e.id, 1e6);
    if (e.op !== "new" && id === null) return null;
    return { type: "tab", op: e.op, ...(id !== null ? { id } : {}), ...(typeof e.url === "string" && e.url.trim() ? { url: e.url.trim().slice(0, 2000) } : {}) };
  }
  return null;
}

/** The run's tabs as it last wrote them (fresh ones only), for the live view's browser bar. */
function viewTabs(): unknown[] | null {
  try {
    if (!existsSync(VIEW)) return null;
    const v = JSON.parse(readFileSync(VIEW, "utf8"));
    return Array.isArray(v.tabs) && Date.now() - Number(v.at) < 15_000 ? v.tabs : null;
  } catch {
    return null;
  }
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/live/control" && ctx.path !== "/api/live/input" && ctx.path !== "/api/live/say") return false;
  const running = slotState().running;
  mkdirSync(PLANS, { recursive: true });

  if (ctx.path === "/api/live/control") {
    if (ctx.req.method === "GET") {
      const isHeld = !!running && held();
      ctx.json({ held: isHeld, running: running ? running.label : null, tabs: isHeld ? viewTabs() : null });
      return true;
    }
    const b = await ctx.body();
    const want = b?.held === true;
    if (want && !running) {
      ctx.json({ error: "no browser run is going, so there is nothing to take control of" }, 409);
      return true;
    }
    const runId = running?.label.match(/\b((?:plan|ui|explore|uicase)-[\w-]+)\b/)?.[1];
    writeFileSync(CONTROL, JSON.stringify({ held: want, at: Date.now(), ...(runId ? { runId } : {}) }));
    console.log(`[live-control] ${want ? "the tester took control of" : "the tester handed back"} ${running?.label ?? "the browser"}`);
    ctx.json({ held: want, running: running ? running.label : null });
    return true;
  }

  // /api/live/say { runId, text } — what the tester types while a browser run goes (Aanya, 26 Oct: "when
  // the browser keeps running, the user cannot send any command in between"). One file per run
  // (.plans/<run>-told.jsonl), read by that run only: the explorer follows it at its next move, and
  // between steps "stop" ends the run and "skip" skips a step (procol-ui-tests liveControl takeTold).
  if (ctx.path === "/api/live/say") {
    if (ctx.req.method !== "POST") return ctx.json({ error: "POST only" }, 405), true;
    const b = await ctx.body();
    const runId = String(b?.runId ?? "");
    const text = String(b?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!/^(plan|ui|explore|uicase)-[\w-]{3,60}$/.test(runId) || !text) return ctx.json({ ok: false, error: "send the run's id and a message" }, 400), true;
    appendFileSync(join(PLANS, `${runId}-told.jsonl`), JSON.stringify({ text, at: Date.now() }) + "\n");
    console.log(`[live-say] a message for ${runId}: ${text.slice(0, 80)}`);
    ctx.json({ ok: true });
    return true;
  }

  // /api/live/input
  if (!held() || !running) {
    ctx.json({ error: "take control first" }, 409);
    return true;
  }
  const b = await ctx.body();
  const events: object[] = (Array.isArray(b?.events) ? (b.events as unknown[]) : []).slice(0, 100).map(clean).filter((e): e is object => !!e);
  if (events.length) appendFileSync(INPUT, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  ctx.json({ queued: events.length });
  return true;
};
