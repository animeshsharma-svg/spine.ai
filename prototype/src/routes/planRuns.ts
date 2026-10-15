/**
 * A typed browser run, opened again from Sessions.
 *
 *   GET /api/plan-runs/:id   → the run's record (what was asked, every step,
 *                              how it ended) — ui/planRunStore.ts
 *
 * The Sessions list carries only a summary of each run; opening one replays
 * its steps from this.
 */
import type { RouteHandler } from "./index.js";
import { readPlanRun } from "../ui/planRunStore.js";

export const handle: RouteHandler = async (ctx) => {
  const m = ctx.path.match(/^\/api\/plan-runs\/([^/]+)$/);
  if (!m) return false;
  const rec = readPlanRun(decodeURIComponent(m[1]));
  if (!rec) {
    ctx.json({ error: "no such run" }, 404);
    return true;
  }
  ctx.json(rec);
  return true;
};
