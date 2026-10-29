/**
 * A saved browser journey, as Sessions replays it.
 *
 *   GET /api/ui-trail?run=<ui-… run id>
 *
 * Its steps (the same rows the live run drew) and the pictures it left in
 * procol-ui-tests/evidence/<run>/ — the spotlight frames of each action and the
 * screenshots a step took — so a saved run shows what happened and what the
 * screen looked like. A saved journey used to reopen as its closing box alone
 * ("27 steps in the browser", none of them listed) beside an empty browser
 * panel (Aanya, 21 Oct: "why doesn't it show the steps").
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTrail } from "../ui/trailStore.js";
import type { RouteHandler } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(here, "..", "..", "..", "procol-ui-tests", "evidence");

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/ui-trail") return false;
  const runId = ctx.url.searchParams.get("run") ?? "";
  if (!/^[\w.-]+$/.test(runId)) {
    ctx.json({ error: "no such run" }, 404);
    return true;
  }
  const trail = readTrail(runId);
  if (!trail) {
    ctx.json({ error: "no such run" }, 404);
    return true;
  }
  const dir = join(EVIDENCE, runId);
  const pictures = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.(png|jpe?g)$/i.test(f))
        .sort()
        .map((f) => {
          // spot-02-001-click.jpg: a framed action · 03-RBV_006-general_user-own-po-by-link.png: a step's screenshot
          const spot = f.match(/^spot-(\d+)-\d+-([a-z-]+)\.jpe?g$/i);
          return {
            file: join(dir, f),
            action: spot ? spot[2] : "screenshot",
            step: spot ? Number(spot[1]) : 0,
            target: spot ? "" : f.replace(/\.(png|jpe?g)$/i, "").replace(/^\d+-/, "").replace(/[-_]+/g, " "),
          };
        })
    : [];
  ctx.json({
    runId,
    flowKey: trail.flowKey,
    exitCode: trail.exitCode,
    startedAt: trail.startedAt,
    durationMs: trail.durationMs,
    steps: trail.steps,
    pictures,
  });
  return true;
};
