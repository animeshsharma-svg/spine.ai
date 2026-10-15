import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";
import { slotState } from "../ui/browserSlot.js";

/**
 * TAKE CONTROL OF THE LIVE BROWSER — the dashboard's half (the run's half is
 * procol-ui-tests/src/support/liveControl.ts).
 *
 *   GET  /api/live/control                 → { held, running }   is a browser run on, and who holds it
 *   POST /api/live/control { held }        → take (true) or hand back (false)
 *   POST /api/live/input   { events: [...] } → the tester's clicks, typing, keys and scrolls,
 *        in the page's own pixels: click {x,y} · type {text} · key {key} · wheel {dy}
 *
 * Written as files beside the explorer's answers (.plans/), which the run polls.
 * Only one browser run holds the slot at a time, so there is no run id; the run
 * ignores anything older than itself.
 */
const here = dirname(fileURLToPath(import.meta.url));
const PLANS = join(here, "..", "..", "..", "procol-ui-tests", ".plans");
const CONTROL = join(PLANS, "live-control.json");
const INPUT = join(PLANS, "live-input.jsonl");

const KEYS = /^(Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space|Shift\+Tab)$/;

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
  if (e.type === "click") {
    const x = n(e.x, 5000), y = n(e.y, 5000);
    return x !== null && y !== null ? { type: "click", x, y } : null;
  }
  if (e.type === "type" && typeof e.text === "string" && e.text.length) return { type: "type", text: e.text.slice(0, 500) };
  if (e.type === "key" && typeof e.key === "string" && KEYS.test(e.key)) return { type: "key", key: e.key === "Space" ? "Space" : e.key };
  if (e.type === "wheel" && typeof e.dy === "number" && Number.isFinite(e.dy)) return { type: "wheel", dy: Math.max(-3000, Math.min(3000, Math.round(e.dy))) };
  return null;
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/live/control" && ctx.path !== "/api/live/input") return false;
  const running = slotState().running;
  mkdirSync(PLANS, { recursive: true });

  if (ctx.path === "/api/live/control") {
    if (ctx.req.method === "GET") {
      ctx.json({ held: !!running && held(), running: running ? running.label : null });
      return true;
    }
    const b = await ctx.body();
    const want = b?.held === true;
    if (want && !running) {
      ctx.json({ error: "no browser run is going, so there is nothing to take control of" }, 409);
      return true;
    }
    writeFileSync(CONTROL, JSON.stringify({ held: want, at: Date.now() }));
    console.log(`[live-control] ${want ? "the tester took control of" : "the tester handed back"} ${running?.label ?? "the browser"}`);
    ctx.json({ held: want, running: running ? running.label : null });
    return true;
  }

  // /api/live/input
  if (!held() || !running) {
    ctx.json({ error: "take control first" }, 409);
    return true;
  }
  const b = await ctx.body();
  const events: object[] = (Array.isArray(b?.events) ? (b.events as unknown[]) : []).slice(0, 50).map(clean).filter((e): e is object => !!e);
  if (events.length) appendFileSync(INPUT, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  ctx.json({ queued: events.length });
  return true;
};
