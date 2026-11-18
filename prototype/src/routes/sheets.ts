/**
 * Test-case sheets — upload a sheet in the 13-column format, run one case or many one by one, read the report.
 *
 *   GET  /api/sheets                         the imported sheets, and the run going on (if any)
 *   GET  /api/sheets/cases?sheet=            a sheet's cases (with where each one starts from)
 *   POST /api/sheets/upload {name, data}     an .xlsx / .csv as base64 → imported (same name replaces)
 *   GET  /api/sheets/run?sheet=&ids=&headed= SSE: case-start, line, frame, spot, case-done, done
 *   POST /api/sheets/stop {id}
 *   GET  /api/sheets/runs                    past runs, newest first
 *   GET  /api/sheets/report?run=             the report (bugs with screenshots, every case)
 *   GET  /api/sheets/export?run=&format=     the sheet back with Status filled (xlsx | csv)
 *   GET  /api/sheets/single?text=&c=&headed=&dry=   SSE, single-case mode: case, understanding, then the run's
 *                                            events (case-start, line, frame, case-done), suggestions, done
 *   GET  /api/sheets/understand?sheet=&ids=  what the platform understood of each case before running it
 *   POST /api/sheets/add {cases:[…]}         add typed / suggested rows to the "Typed test cases" sheet
 *   GET  /api/sheets/derive?text=&c=&max=    SSE, derive the permutation matrix of cases for a feature / flow / PRD /
 *                                            case / ticket: understanding, grounding, cases, questions, done
 *   GET  /api/sheets/questions[?format=xlsx] the product questions the derivations could not settle
 */
import type { RouteHandler } from "./index.js";
import { addSheetCases, importSheetBuffer, listSheets, sheetCaseById, sheetCases, sheetPrep, sheetProfile, TYPED_SHEET } from "../checks/sheetCases.js";
import { caseFromText, suggestEdgeCases, understandCase } from "../checks/singleCase.js";
import { deriveCases, allQuestions } from "../agents/deriveCases.js";
import { askQuestion, cancelQuestions } from "../agents/questions.js";
import * as XLSX from "xlsx";
import { activeSheetRun, listSheetRuns, loadSheetRun, runSheetCases, stopSheetRun } from "../checks/sheetRunner.js";
import { exportSheetRun, renderSheetReport } from "../report/sheetReport.js";
import { activeCampaign, campaignFrame, campaignResults, listCampaigns, loadCampaign, planModules, renderCampaignReport, resumeCampaigns, startCampaign, stopCampaign } from "../checks/sheetCampaign.js";
import { backlog } from "../checks/selfRepair.js";
import { restorePendingSettings } from "../checks/companySettings.js";

// a setting left switched by a server that stopped mid-case is switched back first; then a campaign that
// was running when the server stopped carries on
void restorePendingSettings().catch(() => undefined).finally(() => resumeCampaigns());

function startsFrom(c: ReturnType<typeof sheetCases>[number]): string {
  if (c.layer === "api") return "API — the requests build what they need";
  const p = sheetPrep(c);
  if (!p) return "From scratch — the steps create what they need";
  if (p.unbuilt) return `Needs an event the API cannot build yet — ${p.unbuilt}`;
  return `${p.why} — built by API, opened on ${p.screenWhat}`;
}

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/sheets")) return false;
  const sp = ctx.url.searchParams;

  if (ctx.path === "/api/sheets") return ctx.json({ sheets: listSheets(), active: activeSheetRun() }), true;

  if (ctx.path === "/api/sheets/cases") {
    const sheet = sp.get("sheet") ?? "";
    const cases = sheetCases(sheet || undefined).map((c) => ({
      id: c.id, sheet: c.sheet, module: c.module, scenario: c.scenario, title: c.title, role: c.role, portal: c.portal, priority: c.priority, testType: c.testType, layer: c.layer,
      preconditions: c.preconditions, configs: c.configs ?? "None", testData: c.testData, steps: c.steps, expected: c.expected, reference: c.reference ?? "", startsFrom: startsFrom(c),
    }));
    return ctx.json({ cases }), true;
  }

  if (ctx.path === "/api/sheets/upload" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const name = String(b?.name ?? "sheet.xlsx").replace(/[^\w .()-]/g, "").slice(0, 80) || "sheet.xlsx";
    if (!/\.(xlsx|xls|csv)$/i.test(name)) return ctx.json({ why: "Upload an .xlsx, .xls or .csv file." }, 400), true;
    try {
      const buf = Buffer.from(String(b?.data ?? ""), "base64");
      if (buf.length > 15 * 1024 * 1024) return ctx.json({ why: "The file is larger than 15 MB." }, 400), true;
      const info = importSheetBuffer(name, buf);
      return ctx.json({ sheet: info }), true;
    } catch (e) {
      return ctx.json({ why: `The sheet could not be read: ${(e as Error).message}. It needs at least the columns "Test Case Title" and "Test Steps" (the 13 columns of the team's sheets are best).` }, 400), true;
    }
  }

  if (ctx.path === "/api/sheets/run") {
    const sheet = sp.get("sheet") ?? "";
    const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const pool = sheetCases(sheet || undefined);
    const picked = ids.length ? ids.map((id) => pool.find((c) => c.id.toUpperCase() === id)).filter((c): c is NonNullable<typeof c> => !!c) : pool;
    const out = ctx.sse();
    if (!picked.length) {
      out.send("run-error", { line: "None of those test case IDs are in this sheet." });
      out.end();
      return true;
    }
    if (activeSheetRun()) {
      out.send("run-error", { line: `A sheet run is already going (${activeSheetRun()}). Wait for it to finish or stop it first.` });
      out.end();
      return true;
    }
    let closed = false;
    let runId = "";
    ctx.req.on("close", () => {
      closed = true;
    });
    out.send("plan", { total: picked.length, cases: picked.map((c) => ({ id: c.id, title: c.title, layer: c.layer })) });
    await runSheetCases(picked, {
      companyId: Number(sp.get("c")) || sheetProfile(sheet)?.companyId || 198678,
      sheet: sheet || picked[0].sheet,
      headed: sp.get("headed") === "1",
      emit: (e) => {
        if (e.type === "case-start" && !runId) runId = activeSheetRun() ?? "";
        if (closed) return; // the run goes on; its report is kept and listed in /api/sheets/runs
        if (e.type === "done") out.send("done", { runId: e.run.id, report: `/api/sheets/report?run=${e.run.id}`, export: `/api/sheets/export?run=${e.run.id}&format=xlsx`, counts: e.run.cases.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {}) });
        else out.send(e.type, e);
      },
    }).catch((err) => {
      if (!closed) out.send("run-error", { line: (err as Error).message });
    });
    if (!closed) out.end();
    return true;
  }

  if (ctx.path === "/api/sheets/stop" && ctx.req.method === "POST") {
    const b = await ctx.body();
    return ctx.json({ ok: stopSheetRun(String(b?.id ?? activeSheetRun() ?? "")) }), true;
  }
  // ── campaigns: a whole sheet in flow order, on its own ──
  if (ctx.path === "/api/sheets/campaign/plan") return ctx.json({ modules: planModules(sp.get("sheet") ?? "", sp.get("from") ?? undefined).map((m) => ({ key: m.key, name: m.name, cases: m.ids.length })) }), true;
  if (ctx.path === "/api/sheets/campaign/start" && ctx.req.method === "POST") {
    const b = await ctx.body();
    try {
      const c = startCampaign({ sheet: String(b?.sheet ?? ""), companyId: Number(b?.companyId) || 198678, from: b?.from ? String(b.from) : undefined, only: Array.isArray(b?.only) ? b.only.map(String) : undefined });
      return ctx.json({ campaign: c, report: `/api/sheets/campaign/report?id=${c.id}` }), true;
    } catch (e) {
      return ctx.json({ why: (e as Error).message }, 400), true;
    }
  }
  if (ctx.path === "/api/sheets/campaign/stop" && ctx.req.method === "POST") return ctx.json({ ok: stopCampaign() }), true;
  if (ctx.path === "/api/sheets/campaign") {
    const c = sp.get("id") ? loadCampaign(sp.get("id")!) : activeCampaign() ?? listCampaigns()[0] ?? null;
    if (!c) return ctx.json({ campaign: null }), true;
    const res = campaignResults(c);
    const counts: Record<string, number> = {};
    for (const r of res) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return ctx.json({ campaign: c, running: activeCampaign()?.id === c.id, counts, bugs: res.filter((r) => r.bug).length, repaired: res.filter((r) => r.repaired).length, backlog: backlog().length, report: `/api/sheets/campaign/report?id=${c.id}` }), true;
  }
  if (ctx.path === "/api/sheets/campaign/report") {
    const c = loadCampaign(sp.get("id") ?? "") ?? activeCampaign() ?? listCampaigns()[0];
    ctx.res.writeHead(c ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    ctx.res.end(c ? renderCampaignReport(c) : "<p>No campaign yet.</p>");
    return true;
  }
  if (ctx.path === "/api/sheets/campaign/frame") {
    const f = campaignFrame();
    if (!f) return ctx.json({ why: "no picture yet" }, 404), true;
    ctx.res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" });
    ctx.res.end(Buffer.from(f, "base64"));
    return true;
  }
  if (ctx.path === "/api/sheets/backlog") return ctx.json({ backlog: backlog() }), true;

  if (ctx.path === "/api/sheets/runs") return ctx.json({ runs: listSheetRuns(), active: activeSheetRun() }), true;

  // ── single-case mode: typed words → house-format case → understanding → run → suggestions ──
  if (ctx.path === "/api/sheets/single") {
    const text = (sp.get("text") ?? "").trim();
    const out = ctx.sse();
    if (!text) {
      out.send("run-error", { line: "Type the test case first." });
      out.end();
      return true;
    }
    let closed = false;
    ctx.req.on("close", () => {
      closed = true;
    });
    const line = (l: string) => !closed && out.send("line", { id: "typed", line: l });
    try {
      const made = await caseFromText(text, { log: line });
      let c = made.case;
      // Home's "API" choice: the case is checked through the API, whatever words it used
      if (sp.get("layer") === "api" && c.layer !== "api" && made.source !== "sheet") {
        [c] = addSheetCases([{ ...c, portal: "API", layer: "api" }], c.sheet);
        line("Run through the API, as chosen on Home.");
      }
      if (!closed) out.send("case", { case: c, source: made.source, note: made.note });
      const u = await understandCase(c, { compile: true, log: line });
      if (!closed) out.send("understanding", u);
      if (sp.get("dry") === "1") {
        if (!closed) out.send("done", { dry: true, caseId: c.id, sheet: c.sheet });
        if (!closed) out.end();
        return true;
      }
      if (!u.canRunHere) {
        if (!closed) out.send("done", { caseId: c.id, sheet: c.sheet, notRun: u.whyNot });
        if (!closed) out.end();
        return true;
      }
      if (activeSheetRun()) {
        if (!closed) out.send("run-error", { line: `A sheet run is already going (${activeSheetRun()}). Wait for it to finish or stop it first.` });
        if (!closed) out.end();
        return true;
      }
      const run = await runSheetCases([c], {
        companyId: Number(sp.get("c")) || sheetProfile(c.sheet)?.companyId || 198678, sheet: c.sheet, headed: sp.get("headed") === "1",
        emit: (e) => {
          if (closed) return;
          if (e.type === "done") return;
          out.send(e.type, e);
        },
      });
      const result = run.cases[0];
      const suggestions = await suggestEdgeCases(c, line);
      if (!closed) out.send("suggestions", { cases: suggestions });
      if (!closed) out.send("done", { runId: run.id, caseId: c.id, sheet: c.sheet, status: result?.status, why: result?.why, report: `/api/sheets/report?run=${run.id}`, export: `/api/sheets/export?run=${run.id}&format=xlsx` });
    } catch (err) {
      if (!closed) out.send("run-error", { line: (err as Error).message });
    }
    if (!closed) out.end();
    return true;
  }
  if (ctx.path === "/api/sheets/derive") {
    const text = (sp.get("text") ?? "").trim();
    const out = ctx.sse();
    if (!text) {
      out.send("run-error", { line: "Type the feature, flow, PRD or case to derive from first." });
      out.end();
      return true;
    }
    let closed = false;
    // the derivation asks on screen before it guesses (src/agents/questions.ts): each question has a deadline,
    // and a closed screen releases whatever is still waiting
    const runId = `derive-${Date.now().toString(36)}`;
    ctx.req.on("close", () => {
      closed = true;
      cancelQuestions(runId);
    });
    try {
      await deriveCases({
        text, companyId: Number(sp.get("c")) || 198678, max: Number(sp.get("max")) || 40,
        ask: (q, timeoutMs) => askQuestion(runId, q, (full) => { if (!closed) out.send("ask", full); }, timeoutMs),
      }, (e) => {
        if (closed) return;
        if (e.type === "line") out.send("line", { id: "derive", line: e.line });
        else out.send(e.type, e);
      });
    } catch (err) {
      if (!closed) out.send("run-error", { line: (err as Error).message });
    }
    if (!closed) out.end();
    return true;
  }
  if (ctx.path === "/api/sheets/questions") {
    const qs = allQuestions();
    if (sp.get("format") === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(qs.map((q) => ({ "#": q.id, Area: q.area, Question: q.question, "Why we ask": q.why, "What we assume now": q.assume, "Came from": q.from, Raised: q.at, Answer: "" })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Product questions");
      const body = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      ctx.res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="Product_Questions.xlsx"', "cache-control": "no-store" });
      ctx.res.end(body);
      return true;
    }
    return ctx.json({ questions: qs }), true;
  }
  if (ctx.path === "/api/sheets/understand") {
    const sheet = sp.get("sheet") ?? "";
    const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const pool = sheetCases(sheet || undefined);
    const picked = ids.length ? ids.map((id) => pool.find((c) => c.id.toUpperCase() === id)).filter((c): c is NonNullable<typeof c> => !!c) : pool.slice(0, 60);
    const compile = sp.get("compile") !== "0";
    const list = [];
    for (const c of picked) list.push(await understandCase(c, { compile }));
    return ctx.json({ understood: list }), true;
  }
  if (ctx.path === "/api/sheets/add" && ctx.req.method === "POST") {
    const b = await ctx.body();
    const rows = Array.isArray(b?.cases) ? b.cases : [];
    if (!rows.length) return ctx.json({ why: "No cases to add." }, 400), true;
    const clean = rows
      .filter((r: any) => r && r.title && (Array.isArray(r.steps) ? r.steps.length : r.steps))
      .map((r: any) => ({
        id: String(r.id || "").trim() || `TYP-${Date.now().toString(36).toUpperCase()}`, module: String(r.module || "Typed"), scenario: String(r.scenario || "-"), title: String(r.title),
        role: String(r.role || "Buyer"), portal: String(r.portal || "Buyer portal"), preconditions: String(r.preconditions || "-"), configs: String(r.configs || "None"), testData: String(r.testData || "-"),
        steps: Array.isArray(r.steps) ? r.steps.map(String) : String(r.steps).split(/\n+/).filter(Boolean), expected: String(r.expected || "-"), priority: String(r.priority || "Medium"),
        testType: String(r.testType || "Positive"), status: "Not Run", reference: r.reference ? String(r.reference) : undefined,
      }));
    const added = addSheetCases(clean, String(b?.sheet || TYPED_SHEET));
    return ctx.json({ added: added.map((c) => ({ id: c.id, sheet: c.sheet, title: c.title })), sheet: added[0]?.sheet ?? TYPED_SHEET }), true;
  }
  if (ctx.path === "/api/sheets/case") {
    const c = sheetCaseById(sp.get("id") ?? "", sp.get("sheet") || undefined);
    return ctx.json(c ? { case: c } : { why: "no such case" }, c ? 200 : 404), true;
  }

  if (ctx.path === "/api/sheets/report") {
    const run = loadSheetRun(sp.get("run") ?? "");
    ctx.res.writeHead(run ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    ctx.res.end(run ? renderSheetReport(run) : "<p>No such run.</p>");
    return true;
  }
  if (ctx.path === "/api/sheets/export") {
    const run = loadSheetRun(sp.get("run") ?? "");
    if (!run) return ctx.json({ why: "no such run" }, 404), true;
    const out = exportSheetRun(run, sp.get("format") === "csv" ? "csv" : "xlsx");
    ctx.res.writeHead(200, { "content-type": out.mime, "content-disposition": `attachment; filename="${out.name}"`, "cache-control": "no-store" });
    ctx.res.end(out.body);
    return true;
  }
  return false;
};
