/**
 * spine.ai's own data, company by company (the product tables, 009–018).
 *
 *   GET /api/data/companies                              every company: runs, last run, last-30-day verdicts, records, defects
 *   GET /api/data/companies/:procolId/runs?limit=&before=&kind=&status=   that company's runs, newest first
 *   GET /api/data/trend?c=<procolId>&days=14             verdicts and journeys per day (all companies without c)
 *   GET /api/data/cases/:caseKey?c=<procolId>            a case across its versions, latest results, defects, plans
 *   GET /api/data/defects?category=&status=              every defect with clients, cases and occurrence counts
 *   GET /api/data/defects/:ref                           one defect in full, with every occurrence and its history
 *   GET /api/data/test-records?c=&state=&type=&limit=&before=   the ledger of what spine.ai made on UAT
 *
 * Read only. Every request runs in the organisation's own row-level-security
 * context (withOrg); the dashboard has no sign-in yet, so that is the default
 * organisation (SPINE_ORG, "procol"). With the database down every route
 * answers { database: false } with HTTP 200, so the page can say so.
 */
import type { RouteHandler } from "./index.js";
import { spineDb } from "../db/spineDb.js";
import { defaultContext, withOrg, withService } from "../db/tenant.js";
import { caseHistory, companies, companyRunHistory, companyTrend, defectDetail, defectList, testRecordLedger } from "../db/dataRepo.js";

let orgIdCache: number | undefined;

const int = (v: string | null): number | undefined => {
  const n = Number(v ?? "");
  return Number.isInteger(n) && n > 0 ? n : undefined;
};
const word = (v: string | null, allowed: string[]): string | undefined => (v && allowed.includes(v) ? v : undefined);
const isoOrNull = (v: string | null): string | undefined => (v && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);

export const handle: RouteHandler = async (ctx) => {
  if (!ctx.path.startsWith("/api/data/") || ctx.req.method !== "GET") return false;
  const db = await spineDb().catch(() => null);
  if (!db) {
    ctx.json({ database: false, error: "spine.ai's database is not available — nothing to show" });
    return true;
  }
  try {
    orgIdCache ??= (await withService(db, (c) => defaultContext(c), "dashboard")).orgId;
    const orgId = orgIdCache;
    const q = ctx.url.searchParams;
    const parts = ctx.path.slice("/api/data/".length).split("/").map((p) => decodeURIComponent(p));
    const read = <T>(fn: (c: import("pg").PoolClient) => Promise<T>) => withOrg(db, orgId, fn, "dashboard");

    if (parts[0] === "companies" && parts.length === 1) {
      ctx.json({ database: true, companies: await read((c) => companies(c, orgId)) });
      return true;
    }
    if (parts[0] === "companies" && parts[2] === "runs" && parts.length === 3) {
      const pid = int(parts[1]);
      if (!pid) return bad(ctx, "the company must be a Procol company id, e.g. /api/data/companies/198678/runs");
      const runs = await read((c) =>
        companyRunHistory(c, orgId, pid, {
          limit: int(q.get("limit")),
          before: isoOrNull(q.get("before")),
          kind: word(q.get("kind"), ["feature-run", "journey", "api-plan", "ui-batch", "batch", "template-check", "agent-pipeline", "pasted-cases", "matrix", "crosscheck", "browser-journey", "po-run", "other"]),
          status: word(q.get("status"), ["running", "passed", "failed", "couldnt_tell", "not_run"]),
        }),
      );
      if (!runs) return notFound(ctx, `no company ${pid} in spine.ai's database`);
      ctx.json({ database: true, procolCompanyId: pid, runs, next: runs.length ? runs[runs.length - 1].startedAt : null });
      return true;
    }
    if (parts[0] === "trend" && parts.length === 1) {
      const pid = int(q.get("c")) ?? null;
      const days = await read((c) => companyTrend(c, orgId, pid, int(q.get("days")) ?? 14));
      if (!days) return notFound(ctx, `no company ${pid} in spine.ai's database`);
      ctx.json({ database: true, procolCompanyId: pid, days });
      return true;
    }
    if (parts[0] === "cases" && parts.length === 2 && parts[1]) {
      const h = await read((c) => caseHistory(c, orgId, parts[1], int(q.get("c"))));
      if (!h) return notFound(ctx, `no case "${parts[1]}" in spine.ai's database`);
      ctx.json({ database: true, ...h });
      return true;
    }
    if (parts[0] === "defects" && parts.length === 1) {
      const list = await read((c) =>
        defectList(c, orgId, {
          category: word(q.get("category"), ["bug", "question", "data-problem"]),
          status: word(q.get("status"), ["open", "confirmed", "fixed", "wont-fix", "needs-confirmation"]),
        }),
      );
      ctx.json({ database: true, defects: list });
      return true;
    }
    if (parts[0] === "defects" && parts.length === 2) {
      const d = await read((c) => defectDetail(c, orgId, parts[1]));
      if (!d) return notFound(ctx, `no defect ${parts[1]}`);
      ctx.json({ database: true, ...d });
      return true;
    }
    if (parts[0] === "test-records" && parts.length === 1) {
      const l = await read((c) =>
        testRecordLedger(c, orgId, {
          procolCompanyId: int(q.get("c")),
          state: word(q.get("state"), ["active", "cleanup-pending", "cleaned", "left-in-place", "cleanup-failed", "gone"]),
          type: q.get("type") ?? undefined,
          limit: int(q.get("limit")),
          before: isoOrNull(q.get("before")),
        }),
      );
      ctx.json({ database: true, ...l, next: l.rows.length ? l.rows[l.rows.length - 1].createdAt : null });
      return true;
    }
    return notFound(ctx, `unknown data route ${ctx.path}`);
  } catch (e) {
    ctx.json({ database: true, error: `could not read spine.ai's database: ${(e as Error).message}` }, 500);
    return true;
  }
};

function bad(ctx: Parameters<RouteHandler>[0], error: string): true {
  ctx.json({ error }, 400);
  return true;
}
function notFound(ctx: Parameters<RouteHandler>[0], error: string): true {
  ctx.json({ error }, 404);
  return true;
}
