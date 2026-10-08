/**
 * The Run screen's chat: what to do with a message typed after a run.
 *
 *   POST /api/session/reply
 *     { message, mode: "api"|"ui"|"both", kind, client, context, history: [{ role, text }] }
 *   → { action: "run", testCase, mode, note }   run this, as the next turn of the same session
 *   → { action: "answer", reply }               a reply in words (markdown); nothing runs
 *
 * The model routes and writes; it never decides a verdict. A "run" goes through
 * the same runners as any typed case (public/session.js hands it to
 * runInstruction), and an "answer" about a run is written from the run's own
 * record — the `context` the page sends — which the prompt holds it to.
 *
 * spine.ai signs in by itself, so the chat never asks for a URL, a login or an
 * OTP, and never "runs" a case that only asks for more details: a message with
 * nothing to check (a bare "login") gets an answer saying what can be tested.
 *
 * With no model available the message is run as a test case, which is what the
 * Run box always did with typed text, and `fallback: true` says so. A model that
 * replied in prose instead of JSON did answer, so its words are shown as the
 * answer rather than the message being run.
 */
import type { RouteHandler } from "./index.js";
import { chat } from "../ai/llm.js";

type Mode = "api" | "ui" | "both";
const MODES = new Set<Mode>(["api", "ui", "both"]);
const isMode = (m: unknown): m is Mode => MODES.has(m as Mode);
const cap = (s: unknown, n: number) => String(s ?? "").slice(0, n);

const SYSTEM = [
  `You are the chat inside spine.ai, the QA platform that tests Procol, a B2B procurement product.`,
  `The person has just run a test; the record of that run is below. Read their new message and do ONE of two things.`,
  ``,
  `spine.ai signs in by itself: every run logs in as the client's own QA user (its saved session, or the login`,
  `screen with the sandbox OTP). So never ask the tester for a URL, a login, credentials, an OTP or a test account,`,
  `and never write a test case that asks for them, waits for them or says details are missing.`,
  ``,
  `RUN — they want something tested: a new test case, a variation of the last one (other data, a negative case,`,
  `the next step of the flow) or the same one again. Write the test case to run as ONE self-contained instruction`,
  `in plain English: what to do in Procol and what should happen. Carry over every concrete detail that the new`,
  `case still needs from the earlier case or from their message (event type, counts, names, amounts, line items,`,
  `vendors, and any URL or phone number they typed themselves), and change only what they asked for.`,
  `Only RUN when there is an action to take and something to check.`,
  ``,
  `When the message names a thing but gives nothing to do or check (a bare "login", "vendor", "award"), ANSWER`,
  `instead: one or two sentences on what spine.ai would test for it, then one concrete test case they can send as`,
  `their next message. For "login": every run already signs in as this client's QA user, so suggest checking what`,
  `the signed-in user should see or be able to do.`,
  ``,
  `ANSWER — they asked a question, want an explanation or a summary, a bug write-up, or the test case written out.`,
  `Answer from the run record only. When the record does not say, say so plainly; never invent results, steps,`,
  `statuses, ids or numbers. To write a test case use: **Title**, **Preconditions**, **Test data**, **Steps**`,
  `(numbered), **Expected result** — built from what the run actually did. Keep answers short and concrete.`,
  ``,
  `Reply with JSON only — no code fence, no text around it:`,
  `{"action":"run","testCase":"…","mode":null,"note":"one short sentence saying what will run"}`,
  `or`,
  `{"action":"answer","reply":"markdown"}`,
  `"mode" stays null unless the message asks for a channel: "ui" for the browser/screen, "api" for the API, "both" for both.`,
].join("\n");

/** The model's JSON, read leniently: a fence or a sentence around it is dropped. */
function parseReply(raw: string, mode: Mode) {
  const text = raw.replace(/```(?:json)?/gi, "");
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  let j: any;
  try {
    j = JSON.parse(text.slice(from, to + 1));
  } catch {
    return null;
  }
  if (j?.action === "answer" && typeof j.reply === "string" && j.reply.trim()) {
    return { action: "answer" as const, reply: cap(j.reply.trim(), 12000) };
  }
  if (j?.action === "run" && typeof j.testCase === "string" && j.testCase.trim()) {
    return {
      action: "run" as const,
      testCase: cap(j.testCase.trim(), 4000),
      mode: isMode(j.mode) ? j.mode : mode,
      note: cap(j.note ?? "", 300),
    };
  }
  return null;
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/session/reply") return false;
  if (ctx.req.method !== "POST") {
    ctx.json({ error: "POST { message, mode, context, history }" }, 405);
    return true;
  }
  const b = await ctx.body();
  const message = cap(b.message, 4000).trim();
  const mode: Mode = isMode(b.mode) ? b.mode : "both";
  if (!message) {
    ctx.json({ error: "message is required" }, 400);
    return true;
  }
  const history = (Array.isArray(b.history) ? b.history : [])
    .slice(-8)
    .map((m: any) => `${m?.role === "assistant" ? "spine.ai" : "Tester"}: ${cap(m?.text, 1500)}`)
    .join("\n");
  const user = [
    `Channel of the last run: ${mode}. Kind of run: ${cap(b.kind, 40) || "typed test case"}. Client: ${cap(b.client, 120) || "unknown"}.`,
    ``,
    `RUN RECORD:`,
    cap(b.context, 12000) || "(nothing recorded)",
    ``,
    `EARLIER IN THIS CHAT:`,
    history || "(nothing)",
    ``,
    `NEW MESSAGE:`,
    message,
  ].join("\n");

  let raw = "";
  try {
    raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { tier: "reason", temperature: 0.2, maxTokens: 1800, reasoningEffort: "low" },
    );
  } catch (e) {
    console.log(`[session] reply failed: ${(e as Error).message.slice(0, 160)}`);
  }
  const reply = parseReply(raw, mode);
  if (reply) {
    ctx.json(reply);
    return true;
  }
  // Prose instead of JSON is still an answer: show it rather than run the
  // message. Broken JSON is not readable as either, so it falls through.
  const prose = raw.replace(/```(?:json|markdown|md)?/gi, "").trim();
  if (prose && !prose.startsWith("{")) {
    ctx.json({ action: "answer", reply: cap(prose, 12000) });
    return true;
  }
  ctx.json({
    action: "run",
    testCase: message,
    mode,
    fallback: true,
    note: "The AI could not read that message, so it runs as a test case exactly as you wrote it.",
  });
  return true;
};
