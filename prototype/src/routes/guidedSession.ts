/**
 * THE GUIDED TESTING SESSION — the contract the frontend builds on (docs/Guided_Testing_Session_Plan_2026-11-12.md §4).
 *
 *   POST /api/session/start           {name?}                                   → {id, step}
 *   GET  /api/session/list                                                      → {sessions}
 *   GET  /api/session/env/profiles                                              → {profiles}
 *   GET  /api/session/env/describe?url=                                         → what the URL points at, and the companies it offers
 *   GET  /api/session/:id                                                       → the session
 *   POST /api/session/:id/env         {url, companyId?, signIn?, apiBaseUrl?, tokenVar?, headerName?, label?}
 *                                     SSE: line, reach, signin, settings, gates, vendors, done{profile} | error{why}
 *   POST /api/session/:id/env/use     {profileId}                               → the session (snapshot reused)
 *   POST /api/session/:id/reopen      {step}                                    → the session
 *   POST /api/session/:id/rename      {name}                                    → the session
 *   DELETE /api/session/:id                                                     → {deleted}
 *   POST /api/session/:id/intake      {prd:{text}|{name,data}, notion:{url}, figma:{url,token?}, frames:[{name,data}], sheet:{name,data}}
 *                                     (files as base64) SSE: line, parsed{what,ok,line}, then the reading: line, understanding{card}, questions[], done | error{why}
 *   GET  /api/session/:id/understanding                                         → {card}
 *   POST /api/session/:id/answer      {questionId, answer} | {questionId, skip:true} → {card}
 *   POST /api/session/:id/apply       (apply the answers given so far)          SSE: line, understanding{card}, done | error{why}
 *   POST /api/session/:id/sanity      {flowIds?: []}                            SSE: line, flow-start, frame, flow-done{flow}, done{result} | error{why}
 *   GET  /api/session/:id/sanity                                                → {result}
 *   POST /api/session/:id/sanity/accept  (write cases although no flow worked)  → the session
 *   GET  /api/session/kinds                                                     → {kinds:[{kind,basis}]}
 *   POST /api/session/:id/generate    {kinds:[], depth:"quick"|"standard"|"deep"}  SSE: line, section-start{kind,basis,planned}, case{row}, section-done{kind,count,existing,note?}, done{generation} | error{why}
 *   GET  /api/session/:id/generation                                            → {generation}
 *
 * Later steps (intake, answer, sanity, generate, review, merge, run, report) are added here as their
 * modules land; the names and shapes are fixed by the plan so the frontend can mock them today.
 */
import type { RouteHandler } from "./index.js";
import { createSession, deleteSession, listSessions, loadSession, reopen, saveSession, STEPS, type Step } from "../session/store.js";
import { companiesFor, describeUrl, listProfiles, runEnvironmentStep, useProfile } from "../session/environment.js";
import { figmaLabelsOf, prdTextOf, runIntake } from "../session/intake.js";
import { answerQuestion, applyAnswers, runUnderstanding, understandingOf } from "../session/understanding.js";
import { acceptSanity, runSanity } from "../session/sanity.js";
import { KIND_BASIS, KINDS, runGeneration, type Depth, type Kind } from "../session/generation.js";
import { onLlmWait } from "../ai/llm.js";

/** only the guided session's own paths; /api/session/reply (the Run screen's chat, routes/session.ts) is not ours */
const MINE = /^\/api\/session\/(start|list|kinds|env\/profiles|env\/describe|s-[a-z0-9]+(\/[a-z/]+)?)$/;

export const handle: RouteHandler = async (ctx) => {
  if (!MINE.test(ctx.path)) return false;
  const m = ctx.req.method ?? "GET";
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/session/start" && m === "POST") {
    const b = await ctx.body();
    const s = createSession(typeof b?.name === "string" ? b.name : undefined);
    return ctx.json({ id: s.id, step: s.step, session: s }), true;
  }
  if (ctx.path === "/api/session/list") return ctx.json({ sessions: listSessions(), steps: STEPS }), true;
  if (ctx.path === "/api/session/env/profiles") return ctx.json({ profiles: listProfiles() }), true;
  if (ctx.path === "/api/session/kinds") return ctx.json({ kinds: KINDS.map((k) => ({ kind: k, basis: KIND_BASIS[k] })), depths: ["quick", "standard", "deep"] }), true;
  if (ctx.path === "/api/session/env/describe") {
    const d = describeUrl(sp.get("url") ?? "");
    if (!d.ok) return ctx.json({ ok: false, why: d.why }), true;
    const companies = companiesFor(d.url.hostname, d.kind);
    return ctx.json({ ok: true, kind: d.kind, host: d.url.hostname, what: d.what, companies, needs: d.kind === "custom" ? ["apiBaseUrl", "tokenVar"] : d.kind === "uat" ? ["companyId"] : [] }), true;
  }

  const one = ctx.path.match(/^\/api\/session\/(s-[a-z0-9]+)(?:\/([a-z/]+))?$/);
  if (!one) return false;
  const s = loadSession(one[1]);
  if (!s) return ctx.json({ why: `No session ${one[1]}.` }, 404), true;
  const action = one[2] ?? "";

  if (!action && m === "GET") return ctx.json(s), true;
  if (!action && m === "DELETE") return ctx.json({ deleted: deleteSession(s.id) }), true;

  if (action === "rename" && m === "POST") {
    const b = await ctx.body();
    if (typeof b?.name === "string" && b.name.trim()) s.name = b.name.trim();
    return ctx.json(saveSession(s)), true;
  }
  if (action === "reopen" && m === "POST") {
    const b = await ctx.body();
    const step = String(b?.step ?? "") as Step;
    if (!STEPS.includes(step)) return ctx.json({ why: `"${step}" is not a step; the steps are ${STEPS.join(", ")}.` }, 400), true;
    return ctx.json(reopen(s, step)), true;
  }
  if (action === "env/use" && m === "POST") {
    const b = await ctx.body();
    const out = useProfile(s, String(b?.profileId ?? ""));
    return out ? (ctx.json(out), true) : (ctx.json({ why: "No such environment profile; run the environment step once and it is saved." }, 404), true);
  }
  if (action === "env" && m === "POST") {
    const b = await ctx.body();
    const out = ctx.sse();
    let closed = false;
    ctx.req.on("close", () => { closed = true; });
    const emit = (e: any) => { if (!closed) out.send(e.type, e); };
    try {
      const done = await runEnvironmentStep(s, {
        url: String(b?.url ?? ""), companyId: Number(b?.companyId) || undefined, signIn: b?.signIn, apiBaseUrl: b?.apiBaseUrl, tokenVar: b?.tokenVar, headerName: b?.headerName, label: b?.label,
      }, emit);
      emit({ type: "session", session: done });
    } catch (e) {
      emit({ type: "error", why: String((e as Error).message).slice(0, 300) });
    } finally {
      out.end();
    }
    return true;
  }
  if (action === "understanding" && m === "GET") return ctx.json({ card: understandingOf(s) }), true;
  if (action === "answer" && m === "POST") {
    const b = await ctx.body();
    const card = answerQuestion(s, String(b?.questionId ?? ""), typeof b?.answer === "string" ? b.answer : undefined, !!b?.skip);
    return card ? (ctx.json({ card }), true) : (ctx.json({ why: "No such question on this session's card." }, 404), true);
  }
  if (action === "sanity" && m === "GET") return ctx.json({ result: s.sanity ?? null }), true;
  if (action === "generation" && m === "GET") return ctx.json({ generation: s.generation ?? null }), true;
  if (action === "sanity/accept" && m === "POST") return ctx.json(acceptSanity(s)), true;
  if ((action === "intake" || action === "apply" || action === "sanity" || action === "generate") && m === "POST") {
    const b = action === "apply" ? {} : await ctx.body();
    const out = ctx.sse();
    let closed = false;
    ctx.req.on("close", () => { closed = true; });
    const emit = (e: any) => { if (!closed) out.send(e.type, e); };
    // a long step says when it is queued behind other model calls, instead of going quiet
    const unsub = onLlmWait((ahead) => emit({ type: "line", line: `Waiting for the model (${ahead} call${ahead === 1 ? "" : "s"} ahead in the queue)…`, waiting: ahead }));
    try {
      if (action === "intake") {
        const r = await runIntake(s, b ?? {}, emit);
        const prd = r.prdText || prdTextOf(s);
        if (prd) await runUnderstanding(r.session, prd, r.figmaLabels.length ? r.figmaLabels : figmaLabelsOf(s), emit);
        else emit({ type: "line", line: "No requirement text was read, so there is nothing to understand yet." });
      } else if (action === "sanity") {
        await runSanity(s, Array.isArray(b?.flowIds) ? b.flowIds.map(String) : undefined, emit);
      } else if (action === "generate") {
        await runGeneration(s, (Array.isArray(b?.kinds) ? b.kinds.map(String) : []) as Kind[], (["quick", "standard", "deep"].includes(b?.depth) ? b.depth : "standard") as Depth, emit);
      } else {
        await applyAnswers(s, emit);
      }
      emit({ type: "done", session: loadSession(s.id) });
    } catch (e) {
      emit({ type: "error", why: String((e as Error).message).slice(0, 300) });
    } finally {
      unsub();
      out.end();
    }
    return true;
  }
  return ctx.json({ why: `Nothing at ${ctx.path} for ${m}.` }, 404), true;
};
