/**
 * The screen library and the screen walk (src/agents/screenModel.ts, screenWalk.ts) — the
 * dashboard's Screens page (public/screens.js).
 *
 *   GET  /api/screens                      every screen (summaries), the walks on offer, what runs now
 *   GET  /api/screens/one?id=              one screen: controls with boxes, what each does, its cases
 *   GET  /api/screens/img?id=&kind=plain|map   the picture (PNG, copied out of the run's evidence)
 *   POST /api/screens/walk  {companyId, walks?, cases?}      start a walk → {id}
 *   GET  /api/screens/walk/events?id=      SSE: session, walk, progress, log, frame, spot, screen, done
 *   POST /api/screens/walk/stop {id}
 *   GET  /api/screens/walk/list · /api/screens/walk/one?id=
 *   POST /api/screens/case  {id, n, companyId?}   turn "what control n does" into a test case (+ plan)
 *   POST /api/screens/newcase {id, text, companyId?}  a typed check on this screen → compiled case (+ plan)
 *   GET  /api/screens/run?draft=GEN-SCR-012&c=    run a screen case's plan, spotlight on (SSE)
 *   GET  /api/screens/combos                 the latest combination run (scripts/combo-night.ts)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./index.js";
import { caseFromEffect, getScreen, listScreens, newCaseOnScreen, planForScreenCase, screenImage } from "../agents/screenModel.js";
import { getWalk, listWalks, runningWalk, startWalk, stopWalk, subscribeWalk, WALKS } from "../agents/screenWalk.js";
import { getDraftAutomation } from "../agents/drafts.js";
import { runUiPlan, readPlanResult } from "../ui/uiFlowRunner.js";

const COMBOS_LATEST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "combos", "latest.json");

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/screens")) return false;
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/screens/combos") {
    if (!existsSync(COMBOS_LATEST)) return ctx.json({ run: null }), true;
    try {
      ctx.json({ run: JSON.parse(readFileSync(COMBOS_LATEST, "utf8")) });
    } catch {
      ctx.json({ run: null });
    }
    return true;
  }

  if (ctx.path === "/api/screens") {
    const r = runningWalk();
    ctx.json({ screens: listScreens(), walks: WALKS.map((w) => ({ id: w.id, title: w.title, covers: w.covers, state: w.state, minutes: w.minutes, screens: w.steps.filter((s) => s.step === "inventory_screen").length })), running: r ? { id: r.id, walks: r.walks, current: r.current, startedAt: r.startedAt } : null, recent: listWalks(6) });
    return true;
  }

  if (ctx.path === "/api/screens/one") {
    const s = getScreen(sp.get("id") ?? "");
    ctx.json(s ? { screen: s } : { why: "no such screen" }, s ? 200 : 404);
    return true;
  }

  if (ctx.path === "/api/screens/img") {
    const f = screenImage(sp.get("id") ?? "", sp.get("kind") === "map" ? "map" : "plain");
    if (!f || !existsSync(f)) {
      ctx.res.writeHead(404, { "content-type": "text/plain" });
      ctx.res.end("no picture");
      return true;
    }
    ctx.res.writeHead(200, { "content-type": "image/png", "cache-control": "private, max-age=300" });
    ctx.res.end(readFileSync(f));
    return true;
  }

  if (ctx.path === "/api/screens/walk" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const r = startWalk({ companyId: Number(b?.companyId) || 198678, walks: Array.isArray(b?.walks) ? b.walks.map(String) : undefined, cases: b?.cases !== false, maxCases: Number(b?.maxCases) || undefined });
    ctx.json(r, r.id ? 200 : 400);
    return true;
  }

  if (ctx.path === "/api/screens/walk/events") {
    const id = sp.get("id") ?? "";
    const s = getWalk(id);
    if (!s) return ctx.json({ why: "no such walk" }, 404), true;
    const out = ctx.sse();
    out.send("session", s);
    const off = subscribeWalk(id, (event, data) => out.send(event, data));
    if (!off) {
      out.send("done", { status: s.status, summary: s.summary, screens: s.screens });
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

  if (ctx.path === "/api/screens/walk/stop" && ctx.req.method === "POST") {
    const b = await ctx.body();
    ctx.json({ ok: stopWalk(String(b?.id ?? "")) });
    return true;
  }

  if (ctx.path === "/api/screens/walk/list") {
    ctx.json({ walks: listWalks(Number(sp.get("limit")) || 20) });
    return true;
  }

  if (ctx.path === "/api/screens/walk/one") {
    const s = getWalk(sp.get("id") ?? "");
    ctx.json(s ? { walk: s } : { why: "no such walk" }, s ? 200 : 404);
    return true;
  }

  if (ctx.path === "/api/screens/case" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const r = await caseFromEffect(String(b?.id ?? ""), Number(b?.n), { companyId: Number(b?.companyId) || undefined });
    ctx.json(r, "why" in r ? 400 : 200);
    return true;
  }

  if (ctx.path === "/api/screens/newcase" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const r = await newCaseOnScreen(String(b?.id ?? ""), String(b?.text ?? ""), { companyId: Number(b?.companyId) || undefined });
    ctx.json(r, "why" in r ? 400 : 200);
    return true;
  }

  // Run one screen case's stored plan, spotlight on; the same stream shape as /api/plan-run.
  if (ctx.path === "/api/screens/run") {
    const draft = sp.get("draft") ?? "";
    const screen = sp.get("screen") ?? undefined;
    const c = Number(sp.get("c")) || 198678;
    const out = ctx.sse();
    // The plan: the drafts table first, then the screen record (kept there too), else compiled
    // now from the case's own words with the route to its screen in front.
    const auto = draft ? await getDraftAutomation(draft).catch(() => null) : null;
    let plan = auto?.uiPlan as { title?: string; steps?: unknown[] } | undefined;
    if (!plan?.steps?.length) {
      out.send("stage", { name: "compile", line: `Finding ${draft}'s browser plan…` });
      const r = await planForScreenCase(draft, screen, (l) => out.send("log", { line: l }));
      if (r.why || !r.plan?.steps?.length) {
        out.send("run-error", { line: r.why ?? `${draft} has no browser plan yet` });
        out.send("done", { exitCode: 1 });
        out.end();
        return true;
      }
      plan = r.plan;
      if (r.compiledNow) out.send("stage", { name: "compile", line: `Compiled ${draft}: ${plan.steps!.length} step(s), coverage ${r.coverage}` });
    }
    const runId = `scr-${Date.now().toString(36)}`;
    const steps = plan.steps ?? [];
    out.send("stage", { name: "execute", line: `Running ${draft}: ${steps.length} step(s), spotlight on` });
    const { stop } = runUiPlan({ plan, companyId: c, runId, headed: false }, (e) => {
      const ending = e.type === "done" || e.type === "run-error";
      if (ending) {
        const result = readPlanResult(runId);
        if (result) out.send("plan-result", result);
      }
      out.send(e.type, e);
      if (ending) out.end();
    });
    ctx.req.on("close", () => stop());
    return true;
  }
  return false;
};
