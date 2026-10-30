/**
 * The person's answer to a question a run asked in the session (src/agents/questions.ts).
 *
 *   POST /api/ask/answer  {id, qid, answer}
 */
import { answerQuestion } from "../agents/questions.js";
import type { RouteHandler } from "./index.js";

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/ask/answer" || ctx.req.method !== "POST") return false;
  const b = await ctx.body();
  const r = answerQuestion(String(b?.id ?? ""), String(b?.qid ?? ""), String(b?.answer ?? "").slice(0, 2000));
  ctx.json(r, r.ok ? 200 : 400);
  return true;
};
