/**
 * READ SIDE of the product tables — what the dashboard (src/routes/data.ts)
 * and reports ask. Every function takes a Queryable that is already inside
 * withOrg(…) (or withService), so row-level security decides what is visible;
 * the functions still filter by org_id so a service-context caller gets one
 * organisation's rows only.
 *
 * Words for people: verdicts come back as passed / failed / couldnt_tell /
 * not_run, never as the runners' own vocabulary.
 */
import type { Queryable } from "./tenant.js";

export interface CompanyRow {
  companyId: number;
  procolCompanyId: number;
  name: string;
  environment: string;
  isPrimary: boolean;
  runs: number;
  lastRunAt: string | null;
  last30Days: { passed: number; failed: number; couldntTell: number };
  testRecords: number;
  defects: number;
}

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export async function companies(c: Queryable, orgId: number): Promise<CompanyRow[]> {
  const r = await c.query(`SELECT * FROM v_company_overview WHERE org_id = $1 ORDER BY is_primary DESC, runs DESC, procol_company_id`, [orgId]);
  return r.rows.map((x: any) => ({
    companyId: Number(x.company_id),
    procolCompanyId: x.procol_company_id,
    name: x.name,
    environment: x.environment,
    isPrimary: x.is_primary,
    runs: x.runs,
    lastRunAt: iso(x.last_run_at),
    last30Days: { passed: x.passed_30d, failed: x.failed_30d, couldntTell: x.couldnt_tell_30d },
    testRecords: x.test_records,
    defects: x.defects,
  }));
}

async function companyIdOf(c: Queryable, orgId: number, procolCompanyId: number): Promise<number | null> {
  const r = await c.query(`SELECT id FROM target_companies WHERE org_id = $1 AND procol_company_id = $2 ORDER BY id LIMIT 1`, [orgId, procolCompanyId]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

export interface RunRow {
  id: string;
  title: string;
  kind: string;
  trigger: string;
  triggerBasis: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  results: { total: number; passed: number; failed: number; couldntTell: number; notRun: number };
  journey: { outcome: string; steps: number; worked: number; completed: boolean } | null;
  spineGitSha: string | null;
  source: string;
}

/** One company's runs, newest first. `before` (ISO) pages backwards. */
export async function companyRunHistory(c: Queryable, orgId: number, procolCompanyId: number, opts: { limit?: number; before?: string; kind?: string; status?: string } = {}): Promise<RunRow[] | null> {
  const cid = await companyIdOf(c, orgId, procolCompanyId);
  if (!cid) return null;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const r = await c.query(
    `SELECT * FROM test_runs
      WHERE org_id = $1 AND company_id = $2
        AND ($3::timestamptz IS NULL OR started_at < $3) AND ($4::text IS NULL OR kind = $4) AND ($5::text IS NULL OR status = $5)
      ORDER BY started_at DESC, id DESC LIMIT $6`,
    [orgId, cid, opts.before ?? null, opts.kind ?? null, opts.status ?? null, limit],
  );
  return r.rows.map((x: any) => ({
    id: x.id,
    title: x.title,
    kind: x.kind,
    trigger: x.trigger,
    triggerBasis: x.trigger_basis,
    status: x.status,
    startedAt: iso(x.started_at)!,
    durationMs: x.duration_ms,
    results: { total: x.results_total, passed: x.results_passed, failed: x.results_failed, couldntTell: x.results_couldnt_tell, notRun: x.results_not_run },
    journey: x.journey_outcome ? { outcome: x.journey_outcome, steps: x.journey_steps, worked: x.journey_steps_worked, completed: !!x.journey_completed } : null,
    spineGitSha: x.spine_git_sha,
    source: x.source,
  }));
}

export interface TrendDay {
  day: string;
  runs: number;
  passed: number;
  failed: number;
  couldntTell: number;
  /** null when nothing was judged that day */
  passRate: number | null;
  journeys: number;
  journeysCompleted: number;
}

/** Day by day (organisation's time zone) for one company, or all companies. Days with no runs are included as zeros. */
export async function companyTrend(c: Queryable, orgId: number, procolCompanyId: number | null, days = 14): Promise<TrendDay[] | null> {
  const cid = procolCompanyId === null ? null : await companyIdOf(c, orgId, procolCompanyId);
  if (procolCompanyId !== null && !cid) return null;
  const d = Math.min(Math.max(days, 1), 365);
  const r = await c.query(
    `WITH o AS (SELECT timezone FROM organisations WHERE id = $1),
          span AS (SELECT generate_series((now() AT TIME ZONE (SELECT timezone FROM o))::date - ($3::int - 1), (now() AT TIME ZONE (SELECT timezone FROM o))::date, interval '1 day')::date AS day),
          res AS (SELECT day, sum(passed)::int AS passed, sum(failed)::int AS failed, sum(couldnt_tell)::int AS ct
                    FROM v_results_daily WHERE org_id = $1 AND ($2::bigint IS NULL OR company_id = $2) AND kind IN ('case', 'matrix-combo', 'crosscheck-case') GROUP BY day),
          rn AS (SELECT day, sum(runs)::int AS runs, sum(journeys)::int AS journeys, sum(journeys_completed)::int AS jc
                   FROM v_runs_daily WHERE org_id = $1 AND ($2::bigint IS NULL OR company_id = $2) GROUP BY day)
     SELECT span.day::text, coalesce(rn.runs, 0) AS runs, coalesce(res.passed, 0) AS passed, coalesce(res.failed, 0) AS failed, coalesce(res.ct, 0) AS ct,
            coalesce(rn.journeys, 0) AS journeys, coalesce(rn.jc, 0) AS jc
       FROM span LEFT JOIN res ON res.day = span.day LEFT JOIN rn ON rn.day = span.day ORDER BY span.day`,
    [orgId, cid, d],
  );
  return r.rows.map((x: any) => {
    const judged = x.passed + x.failed + x.ct;
    return { day: x.day, runs: x.runs, passed: x.passed, failed: x.failed, couldntTell: x.ct, passRate: judged ? x.passed / judged : null, journeys: x.journeys, journeysCompleted: x.jc };
  });
}

export interface CaseHistory {
  caseKey: string;
  origin: string;
  layer: string;
  retired: boolean;
  feature: string | null;
  journey: string | null;
  versions: Array<{
    version: number;
    title: string;
    hash: string;
    createdAt: string;
    current: boolean;
    results: { runs: number; passed: number; failed: number; couldntTell: number; lastVerdict: string | null; lastAt: string | null };
  }>;
  recent: Array<{ runId: string; at: string; company: string; version: number | null; verdict: string; reason: string | null }>;
  defects: Array<{ ref: string; title: string; status: string }>;
  plans: Array<{ kind: string; version: number; coverage: string; compiledAt: string }>;
}

/** A case across all its versions: how each version fared, the latest results, defects it shows, its compiled plans. */
export async function caseHistory(c: Queryable, orgId: number, caseKey: string, procolCompanyId?: number, recentLimit = 30): Promise<CaseHistory | null> {
  const t = await c.query(
    `SELECT t.*, f.key AS feature_key, j.key AS journey_key FROM test_cases t
       LEFT JOIN features f ON f.id = t.feature_id LEFT JOIN journeys j ON j.id = t.journey_id
      WHERE t.org_id = $1 AND t.case_key = $2`,
    [orgId, caseKey],
  );
  const tc = t.rows[0];
  if (!tc) return null;
  const cid = procolCompanyId ? await companyIdOf(c, orgId, procolCompanyId) : null;
  const v = await c.query(
    `SELECT v.id, v.version, v.title, v.content_hash, v.created_at,
            count(r.id) FILTER (WHERE r.verdict <> 'not_run')::int AS runs,
            count(r.id) FILTER (WHERE r.verdict = 'passed')::int AS passed,
            count(r.id) FILTER (WHERE r.verdict = 'failed')::int AS failed,
            count(r.id) FILTER (WHERE r.verdict = 'couldnt_tell')::int AS ct,
            (array_agg(r.verdict ORDER BY r.started_at DESC) FILTER (WHERE r.id IS NOT NULL))[1] AS last_verdict,
            max(r.started_at) AS last_at
       FROM case_versions v
       LEFT JOIN run_results r ON r.case_version_id = v.id AND r.org_id = v.org_id AND ($3::bigint IS NULL OR r.company_id = $3)
      WHERE v.org_id = $1 AND v.case_id = $2
      GROUP BY v.id ORDER BY v.version`,
    [orgId, tc.id, cid],
  );
  const recent = await c.query(
    `SELECT r.run_id, r.started_at, tco.name, v.version, r.verdict, r.reason
       FROM run_results r JOIN target_companies tco ON tco.id = r.company_id LEFT JOIN case_versions v ON v.id = r.case_version_id
      WHERE r.org_id = $1 AND r.case_id = $2 AND ($3::bigint IS NULL OR r.company_id = $3)
      ORDER BY r.started_at DESC, r.id DESC LIMIT $4`,
    [orgId, tc.id, cid, Math.min(Math.max(recentLimit, 1), 200)],
  );
  const defects = await c.query(
    `SELECT d.ref, d.title, d.status FROM defect_cases dc JOIN defects d ON d.id = dc.defect_id WHERE dc.org_id = $1 AND dc.case_key = $2 ORDER BY d.ref`,
    [orgId, caseKey],
  );
  const plans = await c.query(`SELECT kind, plan_version, coverage, compiled_at FROM compiled_plans WHERE org_id = $1 AND case_id = $2 ORDER BY kind, plan_version`, [orgId, tc.id]);
  return {
    caseKey,
    origin: tc.origin,
    layer: tc.layer,
    retired: !!tc.retired_at,
    feature: tc.feature_key,
    journey: tc.journey_key,
    versions: v.rows.map((x: any) => ({
      version: x.version,
      title: x.title,
      hash: x.content_hash,
      createdAt: iso(x.created_at)!,
      current: Number(x.id) === Number(tc.current_version_id),
      results: { runs: x.runs, passed: x.passed, failed: x.failed, couldntTell: x.ct, lastVerdict: x.last_verdict, lastAt: iso(x.last_at) },
    })),
    recent: recent.rows.map((x: any) => ({ runId: x.run_id, at: iso(x.started_at)!, company: x.name, version: x.version, verdict: x.verdict, reason: x.reason })),
    defects: defects.rows,
    plans: plans.rows.map((x: any) => ({ kind: x.kind, version: x.plan_version, coverage: x.coverage, compiledAt: iso(x.compiled_at)! })),
  };
}

export interface DefectRow {
  ref: string;
  category: string;
  status: string;
  title: string;
  area: string | null;
  severity: string | null;
  kind: string | null;
  clients: string[];
  caseKeys: string[];
  occurrences: number;
  occurrenceRuns: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastConfirmedOn: string | null;
}

export async function defectList(c: Queryable, orgId: number, opts: { category?: string; status?: string } = {}): Promise<DefectRow[]> {
  const r = await c.query(
    `SELECT * FROM v_defect_overview WHERE org_id = $1 AND ($2::text IS NULL OR category = $2) AND ($3::text IS NULL OR status = $3)
      ORDER BY CASE category WHEN 'bug' THEN 1 WHEN 'question' THEN 2 ELSE 3 END, sheet_position, ref`,
    [orgId, opts.category ?? null, opts.status ?? null],
  );
  return r.rows.map((x: any) => ({
    ref: x.ref,
    category: x.category,
    status: x.status,
    title: x.title,
    area: x.area,
    severity: x.severity,
    kind: x.kind,
    clients: x.clients ?? [],
    caseKeys: x.case_keys ?? [],
    occurrences: x.occurrences,
    occurrenceRuns: x.occurrence_runs,
    firstSeenAt: iso(x.first_seen_at),
    lastSeenAt: iso(x.last_occurrence_at ?? x.last_seen_at),
    lastConfirmedOn: x.last_confirmed_on ? toDay(x.last_confirmed_on) : null,
  }));
}

function toDay(d: unknown): string {
  if (d instanceof Date) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return String(d).slice(0, 10);
}

/** One defect in full: its wording, clients, cases, every occurrence, its status history and linked tickets. */
export async function defectDetail(c: Queryable, orgId: number, ref: string) {
  const d = await c.query(`SELECT * FROM defects WHERE org_id = $1 AND ref = $2`, [orgId, ref]);
  const x = d.rows[0];
  if (!x) return null;
  const [overview, occ, hist, tickets] = await Promise.all([
    c.query(`SELECT clients, case_keys FROM v_defect_overview WHERE defect_id = $1`, [x.id]),
    c.query(
      `SELECT o.run_id, o.seen_at, t.name AS company, r.subject_key, r.title, r.reason, r.http_status, o.basis
         FROM defect_occurrences o JOIN run_results r ON r.id = o.result_id JOIN target_companies t ON t.id = o.company_id
        WHERE o.defect_id = $1 ORDER BY o.seen_at DESC LIMIT 200`,
      [x.id],
    ),
    c.query(`SELECT from_status, to_status, changed_at, changed_by_label, note FROM defect_status_history WHERE defect_id = $1 ORDER BY changed_at, id`, [x.id]),
    c.query(`SELECT s.ticket_id, s.subject, s.reproduction_status FROM support_ticket_defects l JOIN support_tickets s ON s.ticket_id = l.ticket_id WHERE l.defect_id = $1`, [x.id]),
  ]);
  return {
    ref: x.ref,
    category: x.category,
    status: x.status,
    title: x.title,
    area: x.area,
    whatGoesWrong: x.description,
    howToSeeIt: x.how_to_see,
    whatShouldHappen: x.expected_behaviour,
    whatActuallyHappens: x.actual_behaviour,
    severity: x.severity,
    kind: x.kind,
    howItWasVerified: x.verification,
    whatToConfirm: x.to_confirm,
    suggestedFix: x.suggested_fix,
    lastConfirmedOn: x.last_confirmed_on ? toDay(x.last_confirmed_on) : null,
    clients: overview.rows[0]?.clients ?? [],
    caseKeys: overview.rows[0]?.case_keys ?? [],
    occurrences: occ.rows.map((o: any) => ({ runId: o.run_id, at: iso(o.seen_at), company: o.company, caseKey: o.subject_key, title: o.title, reason: o.reason, httpStatus: o.http_status, basis: o.basis })),
    statusHistory: hist.rows.map((h: any) => ({ from: h.from_status, to: h.to_status, at: iso(h.changed_at), by: h.changed_by_label, note: h.note })),
    tickets: tickets.rows,
  };
}

export interface TestRecordRow {
  type: string;
  procolUuid: string | null;
  procolId: number | null;
  procolRef: string | null;
  title: string | null;
  company: string;
  createdByRun: string | null;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
  cleanupState: string;
  namedAsTest: boolean;
}

/** The ledger of what spine.ai made on UAT, newest first. */
export async function testRecordLedger(c: Queryable, orgId: number, opts: { procolCompanyId?: number; state?: string; type?: string; limit?: number; before?: string } = {}): Promise<{ total: number; byState: Record<string, number>; rows: TestRecordRow[] }> {
  const cid = opts.procolCompanyId ? await companyIdOf(c, orgId, opts.procolCompanyId) : null;
  if (opts.procolCompanyId && !cid) return { total: 0, byState: {}, rows: [] };
  const where = `org_id = $1 AND ($2::bigint IS NULL OR company_id = $2) AND ($3::text IS NULL OR cleanup_state = $3) AND ($4::text IS NULL OR record_type = $4)`;
  const p = [orgId, cid, opts.state ?? null, opts.type ?? null];
  const totals = await c.query(`SELECT cleanup_state, count(*)::int AS n FROM test_records WHERE ${where} GROUP BY 1`, p);
  const rows = await c.query(
    `SELECT r.*, t.name AS company FROM test_records r JOIN target_companies t ON t.id = r.company_id
      WHERE r.org_id = $1 AND ($2::bigint IS NULL OR r.company_id = $2) AND ($3::text IS NULL OR r.cleanup_state = $3)
        AND ($4::text IS NULL OR r.record_type = $4) AND ($5::timestamptz IS NULL OR r.created_at < $5)
      ORDER BY r.created_at DESC, r.id DESC LIMIT $6`,
    [...p, opts.before ?? null, Math.min(Math.max(opts.limit ?? 100, 1), 1000)],
  );
  const byState: Record<string, number> = {};
  for (const x of totals.rows) byState[x.cleanup_state] = x.n;
  return {
    total: Object.values(byState).reduce((a, b) => a + b, 0),
    byState,
    rows: rows.rows.map((x: any) => ({
      type: x.record_type,
      procolUuid: x.procol_uuid,
      procolId: x.procol_id === null ? null : Number(x.procol_id),
      procolRef: x.procol_ref,
      title: x.title,
      company: x.company,
      createdByRun: x.created_by_run_id,
      createdBy: x.created_by_label,
      createdAt: iso(x.created_at)!,
      lastUsedAt: iso(x.last_used_at),
      useCount: x.use_count,
      cleanupState: x.cleanup_state,
      namedAsTest: x.named_as_test,
    })),
  };
}
