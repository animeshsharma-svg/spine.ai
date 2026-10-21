/**
 * Every run, and every verdict in it, in spine.ai's database — so a case's
 * track record ("passed 7 of the last 10 times on Demo Account 2") is one query
 * instead of a walk over hundreds of JSON files.
 *
 * The JSON file under data/runs stays the source of truth: it is written first
 * and synchronously, and this copy is best-effort. A database that is down
 * costs the history view, never the run.
 */
import type pg from "pg";
import type { RunRecord } from "../runStore.js";
import { spineDb } from "./spineDb.js";
import { mapRunRecord, writeLedgerRun } from "./runLedger.js";
import { defaultContext, enterService } from "./tenant.js";

type Row = {
  kind: "case" | "journey-step" | "field-check";
  case_id: string;
  feature: string | null;
  title: string | null;
  verdict: string;
  http_status: number | null;
  reason: string | null;
  duration_ms: number | null;
};

/** The verdict text of a check that never ran (caseDisplay.ts reads it the same way). */
const NEVER_RAN = /^not run yet|^never ran/i;

/** Flatten a run record into one row per verdict. */
export function resultRows(rec: RunRecord): Row[] {
  const rows: Row[] = [];
  for (const c of rec.checkResults ?? []) {
    rows.push({
      kind: "case",
      case_id: c.id,
      feature: c.flowId ?? null,
      title: c.scenario ?? null,
      // A check that never ran (an API plan that could not open a session, a
      // step skipped after an earlier failure) is no verdict — not a fail.
      // 15 Oct: 199 plans that hit a network outage were counted as 182 fails.
      verdict: NEVER_RAN.test(String(c.verdict ?? "")) ? "not-run" : c.inconclusive ? "inconclusive" : c.pass ? "pass" : "fail",
      http_status: c.httpStatus ?? null,
      reason: (c.verdict ?? c.message ?? null)?.slice(0, 2000) ?? null,
      duration_ms: c.durationMs ?? null,
    });
  }
  for (const s of rec.journey?.steps ?? []) {
    // Every failed try the never-stuck engine moved past is its own result: a
    // retry that worked must not erase the failure that made it necessary.
    for (const a of s.attempts ?? []) {
      rows.push({
        kind: "journey-step",
        case_id: `${s.kind}#try${a.attempt}`,
        feature: rec.journey?.eventType ?? null,
        title: `${s.title} (try ${a.attempt})`,
        verdict: a.verdict,
        http_status: a.status ?? null,
        reason: a.reason?.slice(0, 2000) ?? null,
        duration_ms: a.ms ?? null,
      });
    }
    rows.push({
      kind: "journey-step",
      case_id: s.kind,
      feature: rec.journey?.eventType ?? null,
      title: s.title,
      verdict: s.verdict,
      http_status: s.status ?? null,
      reason: (s.verdict === "worked" ? s.actual : (s.reason ?? s.message ?? s.actual))?.slice(0, 2000) ?? null,
      duration_ms: s.ms ?? null,
    });
    for (const a of s.assertions?.results ?? []) {
      if (a.pass === null) continue; // not evaluated: no verdict to remember
      rows.push({
        kind: "field-check",
        case_id: a.id,
        feature: s.kind,
        title: a.humanTitle ?? a.title,
        verdict: a.pass ? "pass" : "fail",
        http_status: s.status ?? null,
        reason: a.pass ? null : (a.humanActual ?? a.actual ?? null),
        duration_ms: null,
      });
    }
  }
  return rows;
}

/**
 * The same run into the product tables (011–013), in the caller's transaction
 * but behind a savepoint: if this part fails, the older copy above still
 * commits exactly as before and the failure is only logged (npm run
 * db:backfill or db:reconcile -- --fix picks the run up again).
 */
async function writeLedger(client: pg.PoolClient, rec: RunRecord, basis: "recorded" | "backfilled"): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await client.query("SAVEPOINT ledger");
    try {
      await enterService(client, basis === "recorded" ? "run writer" : "import-runs");
      const ctx = await defaultContext(client);
      const run = mapRunRecord(rec, { envTrigger: basis === "recorded" ? process.env.SPINE_TRIGGER : null });
      await writeLedgerRun(client, ctx, run, { basis, force: basis === "recorded" });
      await client.query("RELEASE SAVEPOINT ledger");
      return;
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT ledger").catch(() => {});
      await client.query("RELEASE SAVEPOINT ledger").catch(() => {});
      // two saves of one catalog case racing for the same new version number: once more
      if ((e as { code?: string }).code === "23505" && attempt === 1) continue;
      console.warn(`[spine-db] run ${rec.id} not copied to the product tables: ${(e as Error).message}`);
      return;
    }
  }
}

async function writeRun(db: pg.Pool, rec: RunRecord, basis: "recorded" | "backfilled" = "recorded"): Promise<number> {
  const rows = resultRows(rec);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO runs (id, started_at, request, company_id, company_name, provider, duration_ms, journey_label, outcome, record)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         request = EXCLUDED.request, company_id = EXCLUDED.company_id, company_name = EXCLUDED.company_name,
         provider = EXCLUDED.provider, duration_ms = EXCLUDED.duration_ms, journey_label = EXCLUDED.journey_label,
         outcome = EXCLUDED.outcome, record = EXCLUDED.record`,
      [
        rec.id,
        rec.ts,
        rec.request ?? null,
        rec.companyId ?? null,
        rec.companyName ?? null,
        rec.provider ?? null,
        rec.durationMs ?? null,
        rec.journey?.label ?? null,
        rec.journey?.outcome ?? null,
        JSON.stringify(rec),
      ],
    );
    // A re-save (a re-run check, an edited record) replaces its rows, never doubles them.
    await client.query(`DELETE FROM results WHERE run_id = $1`, [rec.id]);
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = slice.map((r, j) => {
        const b = j * 11;
        values.push(rec.id, rec.companyId ?? null, r.kind, r.case_id, r.feature, r.title, r.verdict, r.http_status, r.reason, r.duration_ms, rec.ts);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
      });
      await client.query(
        `INSERT INTO results (run_id, company_id, kind, case_id, feature, title, verdict, http_status, reason, duration_ms, created_at) VALUES ${tuples.join(",")}`,
        values,
      );
    }
    await writeLedger(client, rec, basis);
    await client.query("COMMIT");
    return rows.length;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Best-effort copy of one run into the database. Never throws. */
export async function recordRun(rec: RunRecord): Promise<void> {
  try {
    const db = await spineDb();
    if (db) await writeRun(db, rec);
  } catch (e) {
    console.warn(`[spine-db] run ${rec.id} not copied to the database: ${(e as Error).message}`);
  }
}

/** Import (or refresh) a batch of runs; used by scripts/db-import-runs.ts. */
export async function importRuns(recs: RunRecord[]): Promise<{ runs: number; results: number }> {
  const db = await spineDb();
  if (!db) throw new Error("SPINE_DB_URL is not set, or Postgres is not running.");
  let results = 0;
  for (const r of recs) results += await writeRun(db, r, "backfilled");
  return { runs: recs.length, results };
}

export async function removeRun(id: string): Promise<void> {
  try {
    const db = await spineDb();
    if (db) await db.query(`DELETE FROM runs WHERE id = $1`, [id]);
  } catch {
    /* the file is gone; a stale row is harmless and the next import fixes it */
  }
}

export interface TrackRecord {
  runs: number;
  passed: number;
  failed: number;
  inconclusive: number;
  lastVerdict: string;
  lastSeen: string;
  flaky: boolean;
}

/** How one case has fared over time, optionally for one company. Null without a database. */
export async function trackRecord(caseId: string, companyId?: number): Promise<TrackRecord | null> {
  const db = await spineDb();
  if (!db) return null;
  const r = await db.query(
    `SELECT sum(runs)::int AS runs, sum(passed)::int AS passed, sum(failed)::int AS failed,
            sum(inconclusive)::int AS inconclusive, bool_or(flaky) AS flaky, max(last_seen) AS last_seen,
            (array_agg(last_verdict ORDER BY last_seen DESC))[1] AS last_verdict
       FROM case_track_record WHERE case_id = $1 ${companyId ? "AND company_id = $2" : ""}`,
    companyId ? [caseId, companyId] : [caseId],
  );
  const x = r.rows[0];
  if (!x?.runs) return null;
  return {
    runs: x.runs,
    passed: x.passed,
    failed: x.failed,
    inconclusive: x.inconclusive,
    lastVerdict: x.last_verdict,
    lastSeen: new Date(x.last_seen).toISOString(),
    flaky: !!x.flaky,
  };
}
