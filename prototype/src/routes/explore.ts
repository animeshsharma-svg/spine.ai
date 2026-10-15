/**
 * The explorer's two lines back to the platform (procol-ui-tests/src/explore/).
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
 */
import type { RouteHandler } from "./index.js";
import { chat, type ChatMessage, type Tier } from "../ai/llm.js";
import { EXPLORE_KEY, writeExploreAnswer } from "../ui/uiFlowRunner.js";

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const TIERS = new Set<Tier>(["fast", "reason", "long"]);

export const handle: RouteHandler = async (ctx) => {
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

  return false;
};
