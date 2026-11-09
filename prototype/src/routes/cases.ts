/**
 * The test cases about what was typed.
 *
 *   GET /api/cases/search?q=&k=&groups=&perGroup=   the sections about the topic with their best cases, then the flat list
 *   POST /api/cases/index                          embed the cases the memory lacks (once; cached in data/case-index-extra.json)
 */
import type { RouteHandler } from "./index.js";
import { searchCases, fillCaseIndex } from "../checks/caseSearch.js";
import { allCases } from "../checks/testCatalog.js";

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/cases/")) return false;
  const sp = ctx.url.searchParams;
  if (ctx.path === "/api/cases/search") {
    const q = (sp.get("q") ?? "").trim();
    if (!q) return ctx.json({ why: "Type what the cases should be about." }, 400), true;
    const r = await searchCases(q, { k: Number(sp.get("k")) || 40, groups: Number(sp.get("groups")) || 8, perGroup: Number(sp.get("perGroup")) || 8 });
    // the full rows of the shown cases, so the page can open one without another call
    const byId = new Map(allCases().map((c) => [c.id, c]));
    const detail = (id: string) => {
      const c = byId.get(id);
      return c ? { setup: c.setup, steps: c.steps, expected: c.expected, why: c.why, verdict: c.verdict, source: c.source } : {};
    };
    return ctx.json({ ...r, groups: r.groups.map((g) => ({ ...g, cases: g.cases.map((c) => ({ ...c, ...detail(c.id) })) })), cases: r.cases.map((c) => ({ ...c, ...detail(c.id) })) }), true;
  }
  if (ctx.path === "/api/cases/index" && ctx.req.method === "POST") {
    const lines: string[] = [];
    const r = await fillCaseIndex((l) => lines.push(l));
    return ctx.json({ ...r, lines }), true;
  }
  return false;
};
