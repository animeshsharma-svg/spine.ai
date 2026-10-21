/**
 * The coverage report (src/report/coverage.ts, coverageReportPage.ts).
 *
 *   GET /api/coverage-report            the page: module by module, then the sourcing-event submodules
 *   GET /api/coverage-report?fresh=1    count again now (it is kept ten minutes)
 *   GET /api/coverage-report.json       the same numbers as JSON
 */
import type { RouteHandler } from "./index.js";
import { cachedCoverageReport } from "../report/coverage.js";
import { renderCoverageReport } from "../report/coverageReportPage.js";

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path !== "/api/coverage-report" && ctx.path !== "/api/coverage-report.json") return false;
  try {
    const report = await cachedCoverageReport(ctx.url.searchParams.get("fresh") === "1");
    if (ctx.path.endsWith(".json")) {
      ctx.json(report);
      return true;
    }
    ctx.res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    ctx.res.end(renderCoverageReport(report));
  } catch (e) {
    ctx.json({ error: `could not count coverage: ${(e as Error).message}` }, 500);
  }
  return true;
};
