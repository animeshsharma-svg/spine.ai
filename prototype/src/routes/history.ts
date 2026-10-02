/**
 * A case's track record across runs, from spine.ai's database.
 *
 *   GET /api/track-record?case=EDGE-PUB-019[&c=<companyId>]
 *   → { runs, passed, failed, inconclusive, lastVerdict, lastSeen, flaky } | { none: true }
 */
import type { RouteHandler } from "./index.js";
import { trackRecord } from "../db/runHistory.js";

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/track-record") return false;
  const id = ctx.url.searchParams.get("case");
  if (!id) {
    ctx.json({ error: "case is required" }, 400);
    return true;
  }
  const c = Number(ctx.url.searchParams.get("c")) || undefined;
  const tr = await trackRecord(id, c).catch(() => null);
  ctx.json(tr ?? { none: true });
  return true;
};
