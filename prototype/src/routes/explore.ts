/**
 * Explore a page (src/agents/explorer.ts) from the dashboard — public/explore.html.
 *
 *   POST /api/explore/start   {url, companyId?, max?}  → {id} | {why}
 *   GET  /api/explore/events?id=…                      SSE: session, frame, progress, screen,
 *                                                      cases, question, answered, case, done
 *   POST /api/explore/answer  {id, qid, answer}
 *   POST /api/explore/stop    {id}
 *   GET  /api/explore/runs                             saved reports, newest first
 *   GET  /api/explore/run?id=…                         one report
 * Screenshots are served by /api/ui-evidence (evidence/*.png only).
 */
import type { RouteHandler } from "./index.js";
import { answer, getSession, listSessions, startExplore, stopSession, subscribe } from "../agents/explorer.js";

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/explore/")) return false;
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/explore/start" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const url = String(b?.url ?? "").trim();
    if (!url) return ctx.json({ why: "give a console URL or path" }, 400), true;
    const r = startExplore({ url, companyId: Number(b?.companyId) || 198678, max: Math.min(10, Math.max(1, Number(b?.max) || 6)) });
    ctx.json(r, r.id ? 200 : 400);
    return true;
  }

  if (ctx.path === "/api/explore/events") {
    const id = sp.get("id") ?? "";
    const s = getSession(id);
    if (!s) return ctx.json({ why: "no such session" }, 404), true;
    const out = ctx.sse();
    out.send("session", s);
    const off = subscribe(id, (event, data) => out.send(event, data));
    if (!off) {
      out.send("done", { status: s.status, summary: s.summary });
      out.end();
      return true;
    }
    const ping = setInterval(() => out.send("ping", {}), 25_000);
    ctx.req.on("close", () => {
      clearInterval(ping);
      off();
    });
    return true;
  }

  if (ctx.path === "/api/explore/answer" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const r = answer(String(b?.id ?? ""), String(b?.qid ?? ""), String(b?.answer ?? "").slice(0, 2000));
    ctx.json(r, r.ok ? 200 : 400);
    return true;
  }

  if (ctx.path === "/api/explore/stop" && ctx.req.method === "POST") {
    const b = await ctx.body();
    ctx.json({ ok: stopSession(String(b?.id ?? "")) });
    return true;
  }

  if (ctx.path === "/api/explore/runs") {
    ctx.json({ runs: listSessions(Number(sp.get("limit")) || 30) });
    return true;
  }

  if (ctx.path === "/api/explore/run") {
    const s = getSession(sp.get("id") ?? "");
    ctx.json(s ? { run: s } : { why: "no such session" }, s ? 200 : 404);
    return true;
  }
  return false;
};
