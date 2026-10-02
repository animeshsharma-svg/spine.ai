/**
 * Test cases and results in plain words, for every surface of the dashboard.
 *
 *   GET  /api/case-display?id=EDGE-PUB-019          → { display }
 *   GET  /api/case-display?set=library              → { cases: { id: display } } — every runnable library case
 *   GET  /api/case-display?set=library&feature=events.publish → { cases, order } — one feature's cases
 *   POST /api/case-display  { ids: string[] }        → { cases: { id: display } } — any cases by id (catalog, book)
 *   POST /api/case-display  { rows: CheckResult[] } → { items: display[] }       — finished (or running) checks
 *   POST /api/case-display  { steps: JourneyStep[], made } → { steps: [{ step, checks }] } — a journey's steps and field checks
 *   GET  /api/case-display/track?ids=A,B,C[&c=198678] → { records: { id: { words, …record } } }
 *
 * The display model lives in src/checks/caseDisplay.ts; this only serves it.
 * Track records come from spine.ai's own database and degrade to nothing when
 * it is down — a case list must never fail because its history could not be read.
 */
import type { RouteHandler } from "./index.js";
import {
  displayCase,
  displayFieldCheck,
  displayJourneyStep,
  displayLibraryCase,
  displayResult,
  knownIds,
  trackRecordInWords,
  type CaseDisplay,
} from "../checks/caseDisplay.js";
import { loadCases } from "../checks/caseLibrary.js";
import { spineDb } from "../db/spineDb.js";

let libraryCache: Record<string, CaseDisplay> | null = null;

async function trackRecords(ids: string[], companyId?: number) {
  const out: Record<string, unknown> = {};
  if (!ids.length) return out;
  const db = await spineDb().catch(() => null);
  if (!db) return out;
  try {
    const r = await db.query(
      `SELECT case_id, sum(runs)::int AS runs, sum(passed)::int AS passed, sum(failed)::int AS failed,
              sum(inconclusive)::int AS inconclusive, bool_or(flaky) AS flaky, max(last_seen) AS last_seen,
              (array_agg(last_verdict ORDER BY last_seen DESC))[1] AS last_verdict
         FROM case_track_record
        WHERE case_id = ANY($1) ${companyId ? "AND company_id = $2" : ""}
        GROUP BY case_id`,
      companyId ? [ids, companyId] : [ids],
    );
    for (const x of r.rows) {
      if (!x.runs) continue;
      const rec = {
        runs: x.runs,
        passed: x.passed,
        failed: x.failed,
        inconclusive: x.inconclusive,
        lastVerdict: x.last_verdict,
        lastSeen: x.last_seen ? new Date(x.last_seen).toISOString() : undefined,
        flaky: !!x.flaky,
      };
      out[x.case_id] = { ...rec, words: trackRecordInWords(rec) };
    }
  } catch {
    /* the table may not exist yet on this machine — no history, not an error */
  }
  return out;
}

export const handle: RouteHandler = async (ctx) => {
  if (ctx.path === "/api/case-display/track") {
    const ids = (ctx.url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2000);
    const c = Number(ctx.url.searchParams.get("c")) || undefined;
    ctx.json({ records: await trackRecords(ids, c) });
    return true;
  }
  if (ctx.path !== "/api/case-display") return false;

  if (ctx.req.method === "POST") {
    const body = await ctx.body();
    try {
      // { ids: ["UI-CRE-001", "EDGE-PUB-019", …] } → { cases: { id: display } } — any case, from whichever source holds it
      if (Array.isArray(body.ids)) {
        const cases: Record<string, CaseDisplay | null> = {};
        for (const id of body.ids.slice(0, 1000)) if (typeof id === "string") cases[id] = displayCase(id);
        ctx.json({ cases });
        return true;
      }
      if (Array.isArray(body.steps)) {
        const made = body.made ?? {};
        const known = knownIds(made);
        ctx.json({
          steps: body.steps.map((st: any) => ({
            step: displayJourneyStep(st, made),
            checks: (st?.assertions?.results ?? []).map((r: any) => displayFieldCheck(r, st, { ...known, ...knownIds(st.produced) })),
          })),
        });
        return true;
      }
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 3000) : [];
      ctx.json({ items: rows.map((r: any) => (r && r.id ? displayResult(r) : null)) });
    } catch (e) {
      ctx.json({ error: (e as Error).message }, 500);
    }
    return true;
  }

  const id = ctx.url.searchParams.get("id");
  if (id) {
    const d = displayCase(id);
    ctx.json(d ? { display: d } : { none: true });
    return true;
  }
  if (ctx.url.searchParams.get("set") === "library") {
    libraryCache ??= Object.fromEntries(loadCases().map((c) => [c.id, displayLibraryCase(c)]));
    // ?feature=events.publish → only that feature's cases, in library order
    const feature = ctx.url.searchParams.get("feature");
    if (feature) {
      const ids = loadCases().filter((c) => c.feature === feature).map((c) => c.id);
      ctx.json({ cases: Object.fromEntries(ids.map((id) => [id, libraryCache![id]])), order: ids });
      return true;
    }
    ctx.json({ cases: libraryCache });
    return true;
  }
  ctx.json({ error: "id, set=library, or a POST body is required" }, 400);
  return true;
};
