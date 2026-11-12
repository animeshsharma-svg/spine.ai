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
 *
 * Later steps (intake, answer, sanity, generate, review, merge, run, report) are added here as their
 * modules land; the names and shapes are fixed by the plan so the frontend can mock them today.
 */
import type { RouteHandler } from "./index.js";
import { createSession, deleteSession, listSessions, loadSession, reopen, saveSession, STEPS, type Step } from "../session/store.js";
import { companiesFor, describeUrl, listProfiles, runEnvironmentStep, useProfile } from "../session/environment.js";

/** only the guided session's own paths; /api/session/reply (the Run screen's chat, routes/session.ts) is not ours */
const MINE = /^\/api\/session\/(start|list|env\/profiles|env\/describe|s-[a-z0-9]+(\/[a-z/]+)?)$/;

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
  return ctx.json({ why: `Nothing at ${ctx.path} for ${m}.` }, 404), true;
};
