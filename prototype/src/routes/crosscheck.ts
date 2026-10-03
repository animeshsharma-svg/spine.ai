/**
 * UI ↔ API cross-check endpoints.
 *
 *   GET  /api/crosscheck/runs                      → { runs: CrossRunSummary[] } newest first
 *   GET  /api/crosscheck/run?id=<runId>[&items=0]  → the run record (cases, findings, screens)
 *   GET  /api/crosscheck/file?id=<runId>&path=shots/summary.png → a screenshot / screen text from the run
 *   GET  /api/crosscheck/maps                      → reviewed field maps + latest discovery
 *   GET  /api/crosscheck/cases                     → the written UI-XCHK cases (id, title, section, priority)
 *   POST /api/crosscheck/start {companyId, event, cases?, headed?} → { runId, state } (queues for the browser slot)
 *   GET  /api/crosscheck/status?id=<runId>         → { state, lastLine, finishedAt }
 */
import { createReadStream } from "node:fs";
import type { RouteHandler } from "./index.js";
import { crossCases, crossRunFile, crossRunState, listCrossRuns, readCrossMaps, readCrossRun, startCrossRun } from "../checks/crosscheck.js";

const TYPES: Record<string, string> = { png: "image/png", json: "application/json", jpg: "image/jpeg" };

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/crosscheck/")) return false;
  const q = ctx.url.searchParams;
  const sub = ctx.path.slice("/api/crosscheck/".length);

  if (sub === "runs" && ctx.req.method === "GET") {
    ctx.json({ runs: listCrossRuns(Number(q.get("limit")) || 50) });
    return true;
  }
  if (sub === "run" && ctx.req.method === "GET") {
    const rec = readCrossRun(q.get("id") ?? "", { items: q.get("items") !== "0" });
    if (!rec) ctx.json({ error: "no such run" }, 404);
    else ctx.json(rec);
    return true;
  }
  if (sub === "file" && ctx.req.method === "GET") {
    const file = crossRunFile(q.get("id") ?? "", q.get("path") ?? "");
    if (!file) {
      ctx.json({ error: "no such file" }, 404);
      return true;
    }
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    ctx.res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "max-age=3600" });
    createReadStream(file).pipe(ctx.res);
    return true;
  }
  if (sub === "maps" && ctx.req.method === "GET") {
    ctx.json(readCrossMaps());
    return true;
  }
  if (sub === "cases" && ctx.req.method === "GET") {
    ctx.json({ cases: crossCases() });
    return true;
  }
  if (sub === "start" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const companyId = Number(b.companyId);
    const event = String(b.event ?? "").trim();
    if (!companyId || !/^[A-Za-z0-9+/=]{3,40}$/.test(event)) {
      ctx.json({ error: "companyId and event (database id or the app's event id) are required" }, 400);
      return true;
    }
    const cases = Array.isArray(b.cases) ? b.cases.map(String).filter((c: string) => /^UI-XCHK-(?:[A-Z]+-)?\d{3}$/i.test(c)) : undefined;
    const st = startCrossRun({ companyId, event, cases, headed: b.headed === true });
    ctx.json(st);
    return true;
  }
  if (sub === "status" && ctx.req.method === "GET") {
    const st = crossRunState(q.get("id") ?? "");
    if (!st) ctx.json({ error: "unknown run (status is kept in memory; read /api/crosscheck/run for finished runs)" }, 404);
    else ctx.json(st);
    return true;
  }
  return false;
};
