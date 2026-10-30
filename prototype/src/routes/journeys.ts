/**
 * The test cases a typed journey produced (src/agents/journeyCases.ts), and their export.
 *
 *   GET /api/journeys                       the recent journeys, newest first
 *   GET /api/journey?run=<runId>            one journey: its cases, the new ones, the result
 *   GET /api/journey/export?run=&format=    csv | md | xlsx — the cases as a file to download
 */
import { exportJourney, listJourneys, loadJourney } from "../agents/journeyCases.js";
import type { RouteHandler } from "./index.js";

export const handle: RouteHandler = async (ctx) => {
  // The typed journeys (runs with their test cases): /api/journeys itself is the catalog's journey list (server.ts).
  if (ctx.path === "/api/journeys/typed") {
    ctx.json({ journeys: listJourneys(Number(ctx.url.searchParams.get("limit") ?? 30) || 30) });
    return true;
  }
  if (ctx.path === "/api/journey") {
    const r = loadJourney(ctx.url.searchParams.get("run") ?? "");
    if (!r) ctx.json({ error: "no such journey" }, 404);
    else ctx.json(r);
    return true;
  }
  if (ctx.path === "/api/journey/export") {
    const r = loadJourney(ctx.url.searchParams.get("run") ?? "");
    if (!r) {
      ctx.json({ error: "no such journey" }, 404);
      return true;
    }
    const f = ctx.url.searchParams.get("format") ?? "csv";
    const format = f === "md" || f === "xlsx" ? f : "csv";
    const out = await exportJourney(r, format);
    ctx.res.writeHead(200, { "content-type": out.mime, "content-disposition": `attachment; filename="${out.name}"`, "cache-control": "no-store" });
    ctx.res.end(out.body);
    return true;
  }
  return false;
};
