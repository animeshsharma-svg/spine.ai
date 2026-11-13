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
 *   GET  /api/session/:id/review                                                → {sheet, cases, sections, frozen?}
 *   POST /api/session/:id/review      {edits:[{id,patch}], drops:[id], approve?:true|[ids]} → {edited, dropped, sheet?:{id,name,version,count}}
 *   POST /api/session/:id/merge       {name, data}  (a sheet as base64)         → {added:[…], duplicates:[{id,title,matches}]}
 *   POST /api/session/:id/run         {scope:"all"|"p0p1"|"sections", sections?:[], overnightRest?:true}  SSE: the sheet runner's events, queued{…}, done
 *   POST /api/session/:id/rerun       {caseId}                                  SSE: the sheet runner's events, done
 *   GET  /api/session/:id/report                                                → {sheet, runs[], tally, latest, bugs[], queued}
 *
 *   THE PLATFORM ASKS ON SCREEN (session/questions.ts) — every step stream above also carries ask{question} and answered{question}:
 *   GET  /api/session/:id/questions                                             → {questions:[Q], open}
 *   POST /api/session/:id/questions/answer  {qid, answer} | {qid, skip:true}    → {ok, question} | {ok:false, why}
 *   GET  /api/session/:id/questions/stream                                      SSE: ask{question}, answered{question}, closed{qid,how}, ping
 *   Q = {qid, step, source, kind:"yes-no"|"one"|"many"|"text", text, why?, options:[{value,label,means?}], suggested?, blocking,
 *        deadlineAt?, ifNoAnswer?, askedAt, answer?, answeredAt?, skipped?, outcome?, closed?, ref?}
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
import { approve, dropCases, editCase, mergeSheet, reviewState } from "../session/review.js";
import { report, rerunCase, runExecution, type Scope } from "../session/execution.js";
import { onLlmWait } from "../ai/llm.js";
import { answerQuestion as answerOnScreen, openQuestions, questionsOf, subscribe } from "../session/questions.js";

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
  // what the platform asked on screen, and the tester's answers
  if (action === "questions" && m === "GET") { const questions = questionsOf(s); return ctx.json({ questions, open: questions.filter((q) => !q.answer && !q.skipped && !q.closed).length }), true; }
  if (action === "questions/answer" && m === "POST") {
    const b = await ctx.body();
    const r = answerOnScreen(s, String(b?.qid ?? ""), typeof b?.answer === "string" ? b.answer : undefined, !!b?.skip);
    return ctx.json(r, r.ok ? 200 : 400), true;
  }
  if (action === "questions/stream" && m === "GET") {
    const out = ctx.sse();
    let closed = false;
    const unsub = subscribe(s.id, (e) => { if (!closed) out.send(e.type, e); });
    for (const q of openQuestions(s)) out.send("ask", { type: "ask", question: q });
    const ping = setInterval(() => { if (!closed) out.send("ping", { type: "ping", at: new Date().toISOString() }); }, 25_000);
    ctx.req.on("close", () => { closed = true; unsub(); clearInterval(ping); });
    return true;
  }

  if (action === "env" && m === "POST") {
    const b = await ctx.body();
    const out = ctx.sse();
    let closed = false;
    ctx.req.on("close", () => { closed = true; });
    const emit = (e: any) => { if (!closed) out.send(e.type, e); };
    const unsubQ = subscribe(s.id, emit);
    try {
      const done = await runEnvironmentStep(s, {
        url: String(b?.url ?? ""), companyId: Number(b?.companyId) || undefined, signIn: b?.signIn, apiBaseUrl: b?.apiBaseUrl, tokenVar: b?.tokenVar, headerName: b?.headerName, label: b?.label,
      }, emit);
      emit({ type: "session", session: done });
    } catch (e) {
      emit({ type: "error", why: String((e as Error).message).slice(0, 300) });
    } finally {
      unsubQ();
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
  if (action === "review" && m === "GET") return ctx.json(reviewState(s)), true;
  if (action === "report" && m === "GET") return ctx.json(report(s)), true;
  if (action === "review" && m === "POST") {
    const b = await ctx.body();
    const edited: string[] = [];
    for (const e of Array.isArray(b?.edits) ? b.edits : []) if (e?.id && e?.patch && editCase(s, String(e.id), e.patch)) edited.push(String(e.id));
    const dropped = Array.isArray(b?.drops) && b.drops.length ? dropCases(s, b.drops.map(String)) : 0;
    const frozen = b?.approve ? approve(s, Array.isArray(b.approve) ? b.approve.map(String) : undefined) : undefined;
    return ctx.json({ edited, dropped, ...(frozen ? { sheet: frozen } : {}), review: reviewState(s) }), true;
  }
  if (action === "merge" && m === "POST") {
    const b = await ctx.body();
    if (!b?.name || !b?.data) return ctx.json({ why: "Give the sheet as {name, data} with the file as base64." }, 400), true;
    try { return ctx.json(mergeSheet(s, String(b.name), String(b.data))), true; } catch (e) { return ctx.json({ why: `The sheet could not be merged: ${String((e as Error).message).slice(0, 200)}` }, 400), true; }
  }
  if (action === "sanity/accept" && m === "POST") return ctx.json(acceptSanity(s)), true;
  if ((action === "intake" || action === "apply" || action === "sanity" || action === "generate" || action === "run" || action === "rerun") && m === "POST") {
    const b = action === "apply" ? {} : await ctx.body();
    const out = ctx.sse();
    let closed = false;
    ctx.req.on("close", () => { closed = true; });
    const emit = (e: any) => { if (!closed) out.send(e.type, e); };
    // a long step says when it is queued behind other model calls, instead of going quiet
    const unsub = onLlmWait((ahead) => emit({ type: "line", line: `Waiting for the model (${ahead} call${ahead === 1 ? "" : "s"} ahead in the queue)…`, waiting: ahead }));
    // the questions the step asks on screen, and their answers, ride on the step's own stream too
    const unsubQ = subscribe(s.id, emit);
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
      } else if (action === "run") {
        await runExecution(s, (["all", "p0p1", "sections"].includes(b?.scope) ? b.scope : "all") as Scope, Array.isArray(b?.sections) ? b.sections.map(String) : undefined, !!b?.overnightRest, emit as any);
      } else if (action === "rerun") {
        await rerunCase(s, String(b?.caseId ?? ""), emit as any);
      } else {
        await applyAnswers(s, emit);
      }
      emit({ type: "done", session: loadSession(s.id) });
    } catch (e) {
      emit({ type: "error", why: String((e as Error).message).slice(0, 300) });
    } finally {
      unsub();
      unsubQ();
      out.end();
    }
    return true;
  }
  return ctx.json({ why: `Nothing at ${ctx.path} for ${m}.` }, 404), true;
};
