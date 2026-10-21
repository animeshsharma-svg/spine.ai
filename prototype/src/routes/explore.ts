/**
 * Two explorers share /api/explore/ (both branches added this file; merged 2026-10-21).
 *
 * 1. A browser run's explorer (procol-ui-tests/src/explore/) — two lines back to the platform:
 *
 *   POST /api/explore/decide   { runId, messages, tier }        header x-spine-explore
 *   → { text }    the model's answer: the explorer's next move
 *
 *   POST /api/explore/answer   { runId, n, option, text }
 *   → { ok }      the tester's reply to question n, handed to the waiting run
 *
 * decide is the platform's model chain (ai/llm.ts), used by a browser run this
 * server started: it must come from this machine and carry the key the run was
 * given (EXPLORE_KEY in ui/uiFlowRunner.ts), so it is not an open model proxy.
 * The explorer re-reads the screen and asks again on every step, so one slow
 * answer is waited for (20 s) rather than handed straight down the chain.
 *
 * 2. Explore a page (src/agents/explorer.ts) from the dashboard — public/explore.html:
 *
 *   POST /api/explore/start   {url, companyId?, max?}  → {id} | {why}
 *   GET  /api/explore/events?id=…                      SSE: session, frame, progress, screen,
 *                                                      cases, question, answered, case, done
 *   POST /api/explore/answer  {id, qid, answer}
 *   POST /api/explore/stop    {id}
 *   GET  /api/explore/runs                             saved reports, newest first
 *   GET  /api/explore/run?id=…                         one report
 * Screenshots are served by /api/ui-evidence (evidence/*.png only).
 *
 * /api/explore/answer serves both: the body says which — {runId, n} is a browser
 * run's question, {id, qid} an Explore-a-page session's.
 */
import type { RouteHandler } from "./index.js";
import { chat, type ChatMessage, type Tier } from "../ai/llm.js";
import { EXPLORE_KEY, writeExploreAnswer } from "../ui/uiFlowRunner.js";
import { answer, getSession, listSessions, startExplore, stopSession, subscribe } from "../agents/explorer.js";

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const TIERS = new Set<Tier>(["fast", "reason", "long"]);

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/explore/")) return false;
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/explore/decide") {
    if (ctx.req.method !== "POST") {
      ctx.json({ error: "POST only" }, 405);
      return true;
    }
    if (!LOCAL.has(ctx.req.socket.remoteAddress ?? "") || ctx.req.headers["x-spine-explore"] !== EXPLORE_KEY) {
      ctx.json({ error: "only a run this server started can ask its model" }, 403);
      return true;
    }
    const b = await ctx.body();
    const messages: ChatMessage[] = (Array.isArray(b.messages) ? b.messages : [])
      .filter((m: any) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 40_000) }))
      .slice(0, 12);
    if (!messages.length) {
      ctx.json({ error: "no messages" }, 400);
      return true;
    }
    const tier: Tier = TIERS.has(b.tier) ? b.tier : "fast";
    try {
      const text = await chat(messages, { tier, maxTokens: 500, deadlineMs: tier === "fast" ? 20_000 : undefined });
      ctx.json({ text });
    } catch (err) {
      ctx.json({ text: "", error: (err as Error).message.slice(0, 200) }, 502);
    }
    return true;
  }

  if (ctx.path === "/api/explore/answer") {
    if (ctx.req.method !== "POST") {
      ctx.json({ error: "POST only" }, 405);
      return true;
    }
    const b = await ctx.body();
    // Explore a page: {id, qid, answer}
    if (b?.qid !== undefined || (b?.id !== undefined && b?.runId === undefined)) {
      const r = answer(String(b?.id ?? ""), String(b?.qid ?? ""), String(b?.answer ?? "").slice(0, 2000));
      ctx.json(r, r.ok ? 200 : 400);
      return true;
    }
    // a browser run's explorer: {runId, n, option, text}
    const text = String(b.text ?? "").trim().slice(0, 2000);
    const option = b.option ? String(b.option).slice(0, 40) : null;
    if (!text && !option) {
      ctx.json({ ok: false, error: "an empty answer" }, 400);
      return true;
    }
    const ok = writeExploreAnswer(String(b.runId ?? ""), Number(b.n), { option, text });
    ctx.json({ ok }, ok ? 200 : 404);
    return true;
  }

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
