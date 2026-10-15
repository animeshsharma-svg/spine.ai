/**
 * A browser run, opened again from Sessions.
 *
 *   GET /api/plan-runs/:id          → a typed browser run's record (what was
 *                                     asked, every step, how it ended) — ui/planRunStore.ts
 *   GET /api/run-last-shot?run=:id  → the last screenshot the run took, so a
 *                                     saved run's Browser panel shows its last
 *                                     screen instead of "a saved run doesn't
 *                                     keep the browser". 404 when it kept none.
 *
 * The Sessions list carries only a summary of each run; opening one replays
 * its steps from this.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";
import { readPlanRun } from "../ui/planRunStore.js";
import { planShotPath } from "../report/plainBugs.js";
import { findUiResult, uiShotPath } from "../report/uiReport.js";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(here, "..", "..", "..", "procol-ui-tests", "evidence");

/** A typed run's screenshots are numbered by step ("07-fill_sheet.png"); the highest is the last screen. */
function lastPlanShot(run: string): string | undefined {
  const dir = join(EVIDENCE, run);
  if (!/^plan-[a-z0-9]+$/i.test(run) || !existsSync(dir)) return undefined;
  const shots = readdirSync(dir)
    .filter((f) => /^\d{2}-[\w-]+\.png$/.test(f) && planShotPath(run, f))
    .map((f) => ({ f, n: Number(f.slice(0, 2)), at: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => a.n - b.n || a.at - b.at);
  return shots[shots.length - 1]?.f;
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path === "/api/run-last-shot") {
    const run = ctx.url.searchParams.get("run") ?? "";
    const plan = lastPlanShot(run);
    // A ready-made journey keeps its final screenshot on its result.
    const journey = plan ? undefined : findUiResult(run)?.screenshot;
    const to = plan
      ? `/api/plan-shot?run=${encodeURIComponent(run)}&f=${encodeURIComponent(plan)}`
      : journey && uiShotPath(journey)
        ? `/api/ui-shot?f=${encodeURIComponent(journey)}`
        : null;
    if (!to) {
      ctx.res.writeHead(404, { "content-type": "text/plain" });
      ctx.res.end("this run kept no screenshot");
      return true;
    }
    ctx.res.writeHead(302, { location: to, "cache-control": "no-store" });
    ctx.res.end();
    return true;
  }

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
