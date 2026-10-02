/**
 * The chat-box assistant: type a test case, get it matched, run, or built.
 *
 *   GET /api/assistant?q=<typed test case>[&c=<companyId>][&run=0][&llm=0][&compile=0][&build=0][&journey=0][&stageSeconds=45]
 *       Server-sent events, in order:
 *         step         {name: understand|match|resolve|run|build|store, status, line}
 *         match        {decision: existing|partial|new, headline, same[], partial[], others[], memory, llm}
 *         plan         {targets[]}                     (existing cases: where each one runs)
 *         line         {line}                          (progress while something runs)
 *         result       {caseId, verdict, line, details} (one per matched case)
 *         built        {id, draft, coverage, gaps, layer, api, apiSkipped, ui}   (new case)
 *         draft-result {id, ran, verdict, line, details} (the new case's API part, when run)
 *         draft        {id, mdFile, stored, status:"draft", needsReview:true}
 *         answer       {paragraphs[], decision, usage, ms, turnId}
 *         done         {ok}
 *         fatal        {message}
 *
 *   GET /api/assistant/match?q=…[&llm=0]   → the matcher's answer only, as JSON (nothing runs)
 *   GET /api/assistant/drafts              → drafts the assistant has written, newest first
 *   GET /api/assistant/turns               → recent turns (typed text, decision, answer)
 */
import type { RouteHandler } from "./index.js";
import { runAssistant } from "../agents/assistant.js";
import { listDrafts, recentTurns } from "../agents/drafts.js";
import { matchTestCase } from "../checks/caseMatcher.js";
import { DEFAULT_CLIENT } from "../../config/settings.js";

const flag = (v: string | null, dflt: boolean) => (v === null ? dflt : v !== "0" && v !== "false");

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/assistant")) return false;
  const q = (ctx.url.searchParams.get("q") ?? "").trim();
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/assistant/drafts") {
    ctx.json({ drafts: await listDrafts(Number(sp.get("limit")) || 50) });
    return true;
  }
  if (ctx.path === "/api/assistant/turns") {
    ctx.json({ turns: await recentTurns(Number(sp.get("limit")) || 20) });
    return true;
  }
  if (ctx.path === "/api/assistant/match") {
    if (!q) {
      ctx.json({ error: "q is required — the test case, as typed" }, 400);
      return true;
    }
    ctx.json(await matchTestCase(q, { llm: flag(sp.get("llm"), true) }));
    return true;
  }
  if (ctx.path !== "/api/assistant") return false;

  const s = ctx.sse();
  if (!q) {
    s.send("fatal", { message: "Type a test case first." });
    s.end();
    return true;
  }
  // The run endpoints are called on this same server, at the port this request came in on.
  const port = ctx.req.socket.localPort ?? Number(process.env.PORT ?? 4300);
  const companyId = Number(sp.get("c") ?? DEFAULT_CLIENT.companyId);
  let closed = false;
  ctx.req.on("close", () => (closed = true));
  const emit = (event: string, data: unknown) => {
    if (!closed) s.send(event, data);
  };
  try {
    await runAssistant(
      q,
      {
        companyId,
        run: flag(sp.get("run"), true),
        llm: flag(sp.get("llm"), true),
        compile: flag(sp.get("compile"), true),
        build: flag(sp.get("build"), true),
        journey: flag(sp.get("journey"), true),
        stageSeconds: Number(sp.get("stageSeconds")) || undefined,
        baseUrl: `http://127.0.0.1:${port}`,
      },
      emit,
    );
    emit("done", { ok: true });
  } catch (e) {
    emit("fatal", { message: (e as Error).message });
  }
  s.end();
  return true;
};
