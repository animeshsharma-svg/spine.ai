-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 018: two more places runs are kept, found while reconciling the dashboard's
-- run history with the database:
--   data/ui-trails/*.json   browser journeys (src/ui/trailStore.ts)
--   data/po-runs/*.json     purchase-order automation runs (src/poRunStore.ts)
-- Both appear in the dashboard's "Recent runs" (/api/runs), so both belong in
-- test_runs. Widen the source and kind lists (same pattern as 008), and add
-- the PO sandbox company those runs name.
--
-- Idempotent: every statement can run again without error.

ALTER TABLE test_runs DROP CONSTRAINT IF EXISTS test_runs_source_check;
ALTER TABLE test_runs ADD CONSTRAINT test_runs_source_check
  CHECK (source IN ('run-file', 'matrix', 'crosscheck', 'ui-trail', 'po-run'));

ALTER TABLE test_runs DROP CONSTRAINT IF EXISTS test_runs_kind_check;
ALTER TABLE test_runs ADD CONSTRAINT test_runs_kind_check
  CHECK (kind IN ('feature-run', 'journey', 'api-plan', 'ui-batch', 'batch', 'template-check', 'agent-pipeline',
                  'pasted-cases', 'matrix', 'crosscheck', 'browser-journey', 'po-run', 'other'));

SELECT set_config('app.role', 'service', true);
INSERT INTO target_companies (org_id, environment_id, procol_company_id, name, role, notes)
SELECT o.id, e.id, 900002, 'Decathlon (PO → Bill)', 'sandbox', 'Purchase-order to bill runs.'
  FROM organisations o JOIN environments e ON e.org_id = o.id AND e.key = 'uat'
 WHERE o.slug = 'procol'
ON CONFLICT (org_id, environment_id, procol_company_id) DO NOTHING;
