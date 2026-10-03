-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 014: the numbers the dashboard shows, as views over 011 — per organisation,
-- company, feature and day. Every view is security_invoker, so row-level
-- security (015) applies to whoever reads it: a view never leaks another
-- organisation's rows.
--
--   v_results_daily      verdict counts per org / company / feature / kind / day
--   v_runs_daily         runs, journeys and journeys that reached the end, per day
--   v_case_track_record  how each case has fared on each company, flaky or not
--   v_company_overview   one line per company: runs, last run, last-30-day verdicts
--   v_defect_overview    each defect with its clients, cases and occurrences
--   spine_trust_totals() the Success page's trust numbers for a window
--
-- Days are counted in the organisation's own time zone (organisations.timezone).
-- Counting rules (the same as src/checks/metrics.ts):
--   "couldn't tell" is never a pass; "not run" is not a run;
--   flaky = both passed and failed on the SAME company in the window.
--
-- Idempotent: every statement can run again without error.

CREATE OR REPLACE VIEW v_results_daily WITH (security_invoker = true) AS
SELECT r.org_id,
       r.company_id,
       r.feature_id,
       r.kind,
       (r.started_at AT TIME ZONE o.timezone)::date             AS day,
       count(*)::int                                           AS results,
       count(*) FILTER (WHERE r.verdict = 'passed')::int       AS passed,
       count(*) FILTER (WHERE r.verdict = 'failed')::int       AS failed,
       count(*) FILTER (WHERE r.verdict = 'couldnt_tell')::int AS couldnt_tell,
       count(*) FILTER (WHERE r.verdict = 'not_run')::int      AS not_run
  FROM run_results r
  JOIN organisations o ON o.id = r.org_id
 GROUP BY r.org_id, r.company_id, r.feature_id, r.kind, (r.started_at AT TIME ZONE o.timezone)::date;

CREATE OR REPLACE VIEW v_runs_daily WITH (security_invoker = true) AS
SELECT t.org_id,
       t.company_id,
       (t.started_at AT TIME ZONE o.timezone)::date                        AS day,
       count(*)::int                                                      AS runs,
       count(*) FILTER (WHERE t.status = 'failed')::int                   AS runs_failed,
       count(*) FILTER (WHERE t.journey_outcome IS NOT NULL)::int         AS journeys,
       count(*) FILTER (WHERE t.journey_completed)::int                   AS journeys_completed,
       (percentile_disc(0.5) WITHIN GROUP (ORDER BY t.duration_ms))::int  AS median_duration_ms
  FROM test_runs t
  JOIN organisations o ON o.id = t.org_id
 GROUP BY t.org_id, t.company_id, (t.started_at AT TIME ZONE o.timezone)::date;

CREATE OR REPLACE VIEW v_case_track_record WITH (security_invoker = true) AS
SELECT r.org_id,
       r.company_id,
       r.kind,
       r.subject_key,
       max(r.case_id)                                                    AS case_id,
       count(*) FILTER (WHERE r.verdict <> 'not_run')::int               AS runs,
       count(*) FILTER (WHERE r.verdict = 'passed')::int                 AS passed,
       count(*) FILTER (WHERE r.verdict = 'failed')::int                 AS failed,
       count(*) FILTER (WHERE r.verdict = 'couldnt_tell')::int           AS couldnt_tell,
       count(*) FILTER (WHERE r.verdict = 'not_run')::int                AS not_run,
       min(r.started_at)                                                 AS first_at,
       max(r.started_at)                                                 AS last_at,
       (array_agg(r.verdict ORDER BY r.started_at DESC, r.id DESC))[1]   AS last_verdict,
       count(DISTINCT r.case_version_id)::int                            AS versions_run,
       bool_or(r.verdict = 'passed') AND bool_or(r.verdict = 'failed')   AS flaky
  FROM run_results r
 GROUP BY r.org_id, r.company_id, r.kind, r.subject_key;

CREATE OR REPLACE VIEW v_company_overview WITH (security_invoker = true) AS
SELECT c.org_id,
       c.id                 AS company_id,
       c.procol_company_id,
       c.name,
       e.key                AS environment,
       c.is_primary,
       c.active,
       (SELECT count(*)::int FROM test_runs t WHERE t.org_id = c.org_id AND t.company_id = c.id)                   AS runs,
       (SELECT max(t.started_at) FROM test_runs t WHERE t.org_id = c.org_id AND t.company_id = c.id)               AS last_run_at,
       (SELECT count(*)::int FROM run_results r WHERE r.org_id = c.org_id AND r.company_id = c.id
           AND r.kind IN ('case', 'matrix-combo', 'crosscheck-case') AND r.verdict = 'passed'
           AND r.started_at >= now() - interval '30 days')                                                         AS passed_30d,
       (SELECT count(*)::int FROM run_results r WHERE r.org_id = c.org_id AND r.company_id = c.id
           AND r.kind IN ('case', 'matrix-combo', 'crosscheck-case') AND r.verdict = 'failed'
           AND r.started_at >= now() - interval '30 days')                                                         AS failed_30d,
       (SELECT count(*)::int FROM run_results r WHERE r.org_id = c.org_id AND r.company_id = c.id
           AND r.kind IN ('case', 'matrix-combo', 'crosscheck-case') AND r.verdict = 'couldnt_tell'
           AND r.started_at >= now() - interval '30 days')                                                         AS couldnt_tell_30d,
       (SELECT count(*)::int FROM test_records x WHERE x.org_id = c.org_id AND x.company_id = c.id)                AS test_records,
       (SELECT count(DISTINCT dc.defect_id)::int FROM defect_companies dc WHERE dc.org_id = c.org_id AND dc.company_id = c.id) AS defects
  FROM target_companies c
  JOIN environments e ON e.org_id = c.org_id AND e.id = c.environment_id;

CREATE OR REPLACE VIEW v_defect_overview WITH (security_invoker = true) AS
SELECT d.org_id,
       d.id                AS defect_id,
       d.ref,
       d.category,
       d.status,
       d.title,
       d.area,
       d.severity,
       d.kind,
       d.last_confirmed_on,
       d.first_seen_at,
       d.last_seen_at,
       d.sheet_position,
       coalesce((SELECT array_agg(c.name ORDER BY dc.position) FROM defect_companies dc
                  JOIN target_companies c ON c.org_id = dc.org_id AND c.id = dc.company_id
                 WHERE dc.defect_id = d.id), '{}')                                                   AS clients,
       coalesce((SELECT array_agg(x.case_key ORDER BY x.position) FROM defect_cases x WHERE x.defect_id = d.id), '{}') AS case_keys,
       (SELECT count(*)::int FROM defect_occurrences o WHERE o.defect_id = d.id)                     AS occurrences,
       (SELECT count(DISTINCT o.run_id)::int FROM defect_occurrences o WHERE o.defect_id = d.id)     AS occurrence_runs,
       (SELECT max(o.seen_at) FROM defect_occurrences o WHERE o.defect_id = d.id)                    AS last_occurrence_at
  FROM defects d;

-- The Success page's trust numbers (src/checks/metrics.ts trustTotals) for one
-- organisation, optionally one company (target_companies.id), over the last
-- p_days days. Plan sub-steps are not cases and are not counted.
CREATE OR REPLACE FUNCTION spine_trust_totals(p_org bigint, p_company bigint, p_days integer)
RETURNS TABLE (passed integer, failed integer, couldnt_tell integer, flaky integer, repeated integer, journeys integer, journeys_completed integer)
LANGUAGE sql STABLE AS $$
  WITH w AS (
    SELECT r.* FROM run_results r
     WHERE r.org_id = p_org AND (p_company IS NULL OR r.company_id = p_company)
       AND r.started_at >= now() - make_interval(days => p_days)
  ),
  verdicts AS (
    SELECT count(*) FILTER (WHERE verdict = 'passed')::int AS passed,
           count(*) FILTER (WHERE verdict = 'failed')::int AS failed,
           count(*) FILTER (WHERE verdict = 'couldnt_tell')::int AS couldnt_tell
      FROM w WHERE kind = 'case'
  ),
  -- a case, or a field check, that ran at least twice on one company
  repeats AS (
    SELECT w.company_id, w.subject_key AS k,
           count(*) FILTER (WHERE w.verdict = 'passed') AS p, count(*) FILTER (WHERE w.verdict = 'failed') AS x
      FROM w WHERE w.kind = 'case' AND w.verdict IN ('passed', 'failed')
     GROUP BY 1, 2 HAVING count(*) >= 2
    UNION ALL
    SELECT w.company_id, a.assertion_key,
           count(*) FILTER (WHERE a.verdict = 'passed'), count(*) FILTER (WHERE a.verdict = 'failed')
      FROM w JOIN result_assertions a ON a.org_id = w.org_id AND a.result_id = w.id
     WHERE a.verdict IN ('passed', 'failed')
     GROUP BY 1, 2 HAVING count(*) >= 2
  ),
  j AS (
    SELECT count(*)::int AS journeys, count(*) FILTER (WHERE t.journey_completed)::int AS journeys_completed
      FROM test_runs t
     WHERE t.org_id = p_org AND (p_company IS NULL OR t.company_id = p_company)
       AND t.journey_outcome IS NOT NULL AND t.started_at >= now() - make_interval(days => p_days)
  )
  SELECT v.passed, v.failed, v.couldnt_tell,
         (SELECT count(*) FILTER (WHERE p > 0 AND x > 0)::int FROM repeats),
         (SELECT count(*)::int FROM repeats),
         j.journeys, j.journeys_completed
    FROM verdicts v, j
$$;
