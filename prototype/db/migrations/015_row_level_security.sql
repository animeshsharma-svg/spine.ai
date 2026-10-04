-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 015: ROW-LEVEL SECURITY — one customer can never read another's rows.
--
-- Every tenant table (009–013) gets the same policy: a row is visible, and may
-- be written, only when its org_id is the organisation of the current
-- transaction (app.org_id), or when the platform itself is working across
-- organisations (app.role = 'service', which the tenant-facing login role
-- spine_app can never use — see spine_is_service() in 009).
--
-- FORCE makes the policies apply to the tables' owner too, so a query that
-- forgets "WHERE org_id = …" returns nothing instead of everybody's rows.
-- Unset context = no rows (fail closed). Foreign-key checks are not affected
-- (Postgres runs them without row security).
--
-- The tables from 001–008 predate organisations and are not covered; they are
-- read by platform internals only. See docs/DATA_MODEL.md.
--
-- Idempotent: every statement can run again without error.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'environments', 'target_companies', 'memberships', 'audit_log',
    'features', 'journeys', 'test_cases', 'case_versions', 'compiled_plans',
    'test_runs', 'run_results', 'result_steps', 'result_assertions', 'evidence',
    'test_records', 'test_record_uses',
    'defects', 'defect_companies', 'defect_cases', 'defect_occurrences', 'defect_status_history', 'support_ticket_defects'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (spine_row_visible(org_id)) WITH CHECK (spine_row_visible(org_id))', t);
  END LOOP;
END $$;

-- An organisation sees its own row.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organisations;
CREATE POLICY tenant_isolation ON organisations FOR ALL
  USING (spine_row_visible(id)) WITH CHECK (spine_is_service());

-- Users are global (one person, several organisations): a tenant sees the
-- users who are members of it; only the platform creates or edits users.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
DROP POLICY IF EXISTS member_read ON users;
DROP POLICY IF EXISTS service_write ON users;
CREATE POLICY member_read ON users FOR SELECT
  USING (spine_is_service() OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.org_id = spine_current_org()));
CREATE POLICY service_write ON users FOR ALL
  USING (spine_is_service()) WITH CHECK (spine_is_service());

-- When the deployment has created the tenant-facing login role (a superuser
-- runs db/roles.example.sql once), give it exactly the new tables — never the
-- pre-tenant ones from 001–008. Skipped quietly when the role does not exist.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spine_app') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO spine_app', current_schema());
    FOREACH t IN ARRAY ARRAY[
      'organisations', 'environments', 'target_companies', 'users', 'memberships', 'audit_log',
      'features', 'journeys', 'test_cases', 'case_versions', 'compiled_plans',
      'test_runs', 'run_results', 'result_steps', 'result_assertions', 'evidence',
      'test_records', 'test_record_uses',
      'defects', 'defect_companies', 'defect_cases', 'defect_occurrences', 'defect_status_history', 'support_ticket_defects'
    ] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO spine_app', t);
    END LOOP;
    EXECUTE format('GRANT SELECT ON roles, v_results_daily, v_runs_daily, v_case_track_record, v_company_overview, v_defect_overview TO spine_app');
    EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA %I TO spine_app', current_schema());
    EXECUTE 'REVOKE DELETE ON audit_log FROM spine_app';
  END IF;
END $$;
