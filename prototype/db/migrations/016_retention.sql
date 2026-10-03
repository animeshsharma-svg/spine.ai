-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 016: RETENTION of evidence, as a function (not a cron): whoever runs
-- maintenance calls it, sees what it would do, then does it.
--
--   SELECT * FROM spine_apply_retention();                    -- dry run, every organisation
--   SELECT * FROM spine_apply_retention(NULL, false);         -- really delete
--   SELECT * FROM spine_apply_retention(1, false, now());     -- one organisation
--   npm run db:retention [-- --apply]                         -- the same, from the shell
--
-- The rule: evidence (requests, responses, screenshots, files) is kept for
-- organisations.evidence_retention_days (90 by default) after it was captured,
-- EXCEPT evidence a defect needs — evidence of a run result that is an
-- occurrence of a defect, or run-level evidence of a run with such an
-- occurrence. That is kept for as long as the defect exists.
--
-- What is NOT deleted, ever, by this function: runs, results, steps, field
-- checks, defects, test records, the audit log. Verdicts are small and they
-- are the history; only the bulky proof expires. Each real (non-dry) run
-- writes one audit_log row per organisation.
--
-- Idempotent: every statement can run again without error.

CREATE OR REPLACE FUNCTION spine_apply_retention(
  p_org      bigint      DEFAULT NULL,
  p_dry_run  boolean     DEFAULT true,
  p_now      timestamptz DEFAULT now()
) RETURNS TABLE (
  org_id            bigint,
  retention_days    integer,
  cutoff            timestamptz,
  expired           integer,     -- older than the cutoff
  kept_for_defects  integer,     -- of those, kept because a defect needs them
  deleted           integer,     -- 0 on a dry run
  bytes_freed       bigint       -- what deleting would free / freed
) LANGUAGE plpgsql AS $$
DECLARE
  o record;
BEGIN
  FOR o IN SELECT x.id, x.evidence_retention_days FROM organisations x WHERE p_org IS NULL OR x.id = p_org ORDER BY x.id LOOP
    org_id := o.id;
    retention_days := o.evidence_retention_days;
    cutoff := p_now - make_interval(days => o.evidence_retention_days);

    CREATE TEMP TABLE IF NOT EXISTS spine_retention_candidates (id bigint PRIMARY KEY, bytes integer, protected boolean) ON COMMIT DROP;
    TRUNCATE spine_retention_candidates;
    INSERT INTO spine_retention_candidates
    SELECT e.id, e.bytes,
           EXISTS (SELECT 1 FROM defect_occurrences d
                    WHERE d.org_id = e.org_id
                      AND (d.result_id = e.result_id OR (e.result_id IS NULL AND d.run_id = e.run_id)))
      FROM evidence e
     WHERE e.org_id = o.id AND e.captured_at < cutoff;

    SELECT count(*)::int, count(*) FILTER (WHERE c.protected)::int, coalesce(sum(c.bytes) FILTER (WHERE NOT c.protected), 0)::bigint
      INTO expired, kept_for_defects, bytes_freed
      FROM spine_retention_candidates c;

    IF p_dry_run THEN
      deleted := 0;
    ELSE
      DELETE FROM evidence e USING spine_retention_candidates c WHERE e.id = c.id AND NOT c.protected;
      GET DIAGNOSTICS deleted = ROW_COUNT;
      IF deleted > 0 OR kept_for_defects > 0 THEN
        INSERT INTO audit_log (org_id, actor_label, action, entity_type, entity_id, summary, after)
        VALUES (o.id, coalesce(nullif(current_setting('app.actor', true), ''), 'retention'), 'evidence.retention_applied', 'evidence', 'retention',
                format('Deleted %s piece(s) of evidence older than %s days (%s bytes); kept %s that defects need.',
                       deleted, o.evidence_retention_days, bytes_freed, kept_for_defects),
                jsonb_build_object('cutoff', cutoff, 'deleted', deleted, 'kept_for_defects', kept_for_defects, 'bytes_freed', bytes_freed));
      END IF;
    END IF;
    TRUNCATE spine_retention_candidates;
    RETURN NEXT;
  END LOOP;
END $$;
