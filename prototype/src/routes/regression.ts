/**
 * THE REGRESSION SUITE (public/regression.js) — every case the platform holds, module-wise, in plain words,
 * with the set-up chain that connects them; a selection runs through the sheet runner.
 *
 *   GET  /api/regression                      the suite: modules, set-up nodes, every case as a compact row
 *   GET  /api/regression/case?key=            one case in full (plain steps, expected, pre-conditions) + how it runs
 *   POST /api/regression/rebuild              read the three stores again (new sheets, sessions, plans)
 *   POST /api/regression/run {keys, companyId, headed?}   SSE: order, then the sheet runner's events, then done
 *   GET  /api/regression/runs                 past suite runs, newest first
 */
import type { RouteHandler } from "./index.js";
import { buildSuite, loadSuite, runOrder, runRow, suiteCase, STAGES } from "../regression/suite.js";
import { activeSheetRun, listSheetRuns, runSheetCases } from "../checks/sheetRunner.js";
import { sheetPrep } from "../checks/sheetCases.js";
import { restorePendingSettings } from "../checks/companySettings.js";

const COLUMNS = ["key", "id", "module", "feature", "stage", "layer", "priority", "kind", "title", "state", "needs", "runnable", "source", "prev", "part"] as const;

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/regression")) return false;
  const sp = ctx.url.searchParams;
  const m = ctx.req.method ?? "GET";

  if (ctx.path === "/api/regression" && m === "GET") {
    const s = loadSuite();
    return ctx.json({
      builtAt: s.builtAt, counts: s.counts, stages: STAGES, modules: s.modules, setup: s.setup, columns: COLUMNS,
      rows: s.cases.map((c) => COLUMNS.map((k) => c[k])),
      active: activeSheetRun(),
    }), true;
  }
  if (ctx.path === "/api/regression/case") {
    const c = suiteCase(sp.get("key") ?? "");
    if (!c) return ctx.json({ why: `No case ${sp.get("key")} in the suite.` }, 404), true;
    const row = runRow(c.key);
    let startsFrom = "From scratch — the steps create what they need";
    if (row) {
      if (row.layer === "api") startsFrom = "API — the requests build what they need";
      else { try { const p = sheetPrep(row); if (p) startsFrom = p.unbuilt ? `Needs an event the API cannot build yet — ${p.unbuilt}` : `${p.why} — built by API, opened on ${p.screenWhat}`; } catch { /* as from scratch */ } }
    }
    return ctx.json({ case: c, startsFrom, runSteps: row?.steps ?? [] }), true;
  }
  if (ctx.path === "/api/regression/rebuild" && m === "POST") {
    const s = buildSuite();
    return ctx.json({ builtAt: s.builtAt, counts: s.counts }), true;
  }
  if (ctx.path === "/api/regression/runs") {
    return ctx.json({ runs: listSheetRuns().filter((r) => String((r as { sheet?: string }).sheet ?? "").startsWith("regression-")) }), true;
  }
  if (ctx.path === "/api/regression/run" && m === "POST") {
    const b = await ctx.body();
    const keys: string[] = Array.isArray(b?.keys) ? b.keys.map(String) : [];
    const companyId = Number(b?.companyId) || 198678;
    const out = ctx.sse();
    let closed = false;
    ctx.req.on("close", () => { closed = true; });
    const emit = (e: any) => { if (!closed) out.send(e.type ?? "line", e); };
    try {
      if (!keys.length) { emit({ type: "error", why: "Nothing is ticked — tick at least one case." }); return out.end(), true; }
      if (activeSheetRun()) { emit({ type: "error", why: `A run is already going (${activeSheetRun()}) — wait for it or stop it on Test sheets.` }); return out.end(), true; }
      const order = runOrder(keys);
      const rows = order.ids.map((k) => runRow(k)).filter((r): r is NonNullable<typeof r> => !!r);
      emit({ type: "order", ids: order.ids, setupCases: order.setupCases, unknown: order.unknown, total: rows.length, note: `${rows.length} case(s), set-up first, then the flow's stages in order, P0 first.` });
      if (!rows.length) { emit({ type: "error", why: "None of the ticked keys is a case the runner can take." }); return out.end(), true; }
      await restorePendingSettings().catch(() => undefined);
      const sheet = `regression-${Date.now().toString(36)}`;
      const run = await runSheetCases(rows, { companyId, sheet, headed: !!b?.headed, repair: true, emit });
      const tally: Record<string, number> = {};
      for (const c of run.cases) tally[c.status] = (tally[c.status] ?? 0) + 1;
      emit({ type: "finished", run: run.id, sheet, tally, bugs: run.cases.filter((c) => c.bug).map((c) => ({ caseId: c.id, title: c.bug!.title })), bugsLink: `#/bugs?run=${run.id}`, report: `/api/sheets/report?run=${run.id}`, workbook: `/api/sheets/export?run=${run.id}` });
    } catch (e) {
      emit({ type: "error", why: String((e as Error).message).slice(0, 300) });
    } finally {
      out.end();
    }
    return true;
  }
  return ctx.json({ why: `Nothing at ${ctx.path} for ${m}.` }, 404), true;
};
