-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 011: WHAT HAPPENED — runs, their results, and the evidence behind them,
-- per organisation, environment and company.
--
--   test_runs          one row per run, whatever ran it (dashboard, assistant,
--                      CI, nightly, backend watch, HubSpot, an agent's batch,
--                      the bidding matrix, the UI↔API cross-check)
--   run_results        one verdict per case / journey step / matrix combination
--                      / cross-check case, pointing at the exact case version
--   result_steps       the steps inside a result (plan steps, earlier failed
--                      tries of a journey step, matrix steps, UI steps)
--   result_assertions  field checks with expected, actual and verdict
--   evidence           what was sent and what came back (already redacted),
--                      screenshots and files — with sizes, for retention
--
-- The older `runs` / `results` tables (001) are kept and still written: every
-- reader that exists today keeps working. These tables are the product model;
-- `npm run db:reconcile` proves the two agree.
--
-- Verdicts are four words everywhere: passed | failed | couldnt_tell | not_run.
-- "Couldn't tell" is never a pass. The runner's own word is kept in raw_verdict
-- (worked / refused / broken / inconclusive …) because it carries meaning a
-- reader may want ("refused" vs "broken").
--
-- Idempotent: every statement can run again without error.

CREATE TABLE IF NOT EXISTS test_runs (
  id                    text PRIMARY KEY CHECK (id ~ '^[0-9A-Za-z][0-9A-Za-z_.:-]{5,119}$'),  -- same id as data/runs/<id>.json
  org_id                bigint NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  environment_id        bigint NOT NULL,
  company_id            bigint NOT NULL,                  -- target_companies.id
  source                text NOT NULL CHECK (source IN ('run-file', 'matrix', 'crosscheck')),
  source_path           text,                             -- where the full record lives on disk
  kind                  text NOT NULL CHECK (kind IN ('feature-run', 'journey', 'api-plan', 'ui-batch', 'batch', 'template-check',
                                                      'agent-pipeline', 'pasted-cases', 'matrix', 'crosscheck', 'other')),
  title                 text NOT NULL,                    -- the request, in the words it was asked
  trigger               text NOT NULL CHECK (trigger IN ('manual', 'assistant', 'ci', 'nightly', 'backend-watch', 'hubspot', 'agent', 'unknown')),
  trigger_basis         text NOT NULL CHECK (trigger_basis IN ('recorded', 'inferred')),
  triggered_by_user_id  bigint REFERENCES users (id) ON DELETE SET NULL,
  triggered_by_label    text,
  spine_git_sha         text CHECK (spine_git_sha IS NULL OR spine_git_sha ~ '^[0-9a-f]{7,40}$'),
  spine_git_dirty       boolean,
  backend_sha           text CHECK (backend_sha IS NULL OR backend_sha ~ '^[0-9a-f]{7,40}$'),
  provider              text,                             -- the AI provider in use, 'deterministic' when none
  status                text NOT NULL CHECK (status IN ('running', 'passed', 'failed', 'couldnt_tell', 'not_run')),
  started_at            timestamptz NOT NULL,
  finished_at           timestamptz,
  duration_ms           integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  -- counts of this run's results (kind 'case', 'matrix-combo', 'crosscheck-case'),
  -- kept by the writer so the run list needs no aggregate; reconcile checks them
  results_total         integer NOT NULL DEFAULT 0 CHECK (results_total >= 0),
  results_passed        integer NOT NULL DEFAULT 0 CHECK (results_passed >= 0),
  results_failed        integer NOT NULL DEFAULT 0 CHECK (results_failed >= 0),
  results_couldnt_tell  integer NOT NULL DEFAULT 0 CHECK (results_couldnt_tell >= 0),
  results_not_run       integer NOT NULL DEFAULT 0 CHECK (results_not_run >= 0),
  -- the journey, when the run walked one
  journey_event_type    text,
  journey_outcome       text,
  journey_steps         integer,
  journey_steps_worked  integer,
  journey_completed     boolean,
  -- the agent pipeline's own report, when it wrote one (older runs)
  report_headline       text,
  report_passed         integer,
  report_failed         integer,
  record_hash           text NOT NULL CHECK (record_hash ~ '^[0-9a-f]{64}$'),  -- of the source record; unchanged = skip
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, id, company_id),     -- lets run_results prove they carry the run's company
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (results_total = results_passed + results_failed + results_couldnt_tell + results_not_run),
  FOREIGN KEY (org_id, environment_id) REFERENCES environments (org_id, id),
  FOREIGN KEY (org_id, company_id) REFERENCES target_companies (org_id, id)
);
CREATE INDEX IF NOT EXISTS test_runs_org_started ON test_runs (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS test_runs_company_started ON test_runs (org_id, company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS test_runs_trigger ON test_runs (org_id, trigger, started_at DESC);
CREATE INDEX IF NOT EXISTS test_runs_status ON test_runs (org_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS run_results (
  id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id           bigint NOT NULL,
  run_id           text NOT NULL,
  company_id       bigint NOT NULL,                 -- = the run's company (denormalised for the dashboard's queries)
  position         integer NOT NULL CHECK (position >= 1),
  kind             text NOT NULL CHECK (kind IN ('case', 'journey-step', 'matrix-combo', 'crosscheck-case', 'flow', 'validation')),
  subject_key      text NOT NULL,                   -- the case id, or the journey step ('create_draft')
  case_id          bigint,
  case_version_id  bigint,
  -- 'recorded': the version current when the run saved its result.
  -- 'backfilled': copied in later from an old run; the case's earliest known
  --   version is assumed. 'none': not a catalog case (a journey step …).
  version_basis    text NOT NULL CHECK (version_basis IN ('recorded', 'backfilled', 'none')),
  feature_id       bigint,
  feature_key      text,                            -- as the runner wrote it, even if not in the tree
  actor            text NOT NULL DEFAULT 'buyer' CHECK (actor IN ('buyer', 'vendor', 'planner', 'admin', 'system', 'unknown')),
  title            text NOT NULL,
  verdict          text NOT NULL CHECK (verdict IN ('passed', 'failed', 'couldnt_tell', 'not_run')),
  raw_verdict      text NOT NULL,
  reason           text,                            -- why, in plain English
  http_status      integer CHECK (http_status IS NULL OR http_status BETWEEN 0 AND 599),
  error_code       text,
  duration_ms      integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  started_at       timestamptz NOT NULL,
  details          jsonb NOT NULL DEFAULT '{}',     -- the technical detail for the Details panel
  UNIQUE (run_id, position),
  UNIQUE (org_id, id),
  CHECK ((version_basis = 'none') = (case_version_id IS NULL)),
  FOREIGN KEY (org_id, run_id, company_id) REFERENCES test_runs (org_id, id, company_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (org_id, company_id) REFERENCES target_companies (org_id, id),
  -- a case with results cannot be deleted (retire it instead: test_cases.retired_at)
  FOREIGN KEY (org_id, case_id) REFERENCES test_cases (org_id, id),
  FOREIGN KEY (org_id, case_version_id) REFERENCES case_versions (org_id, id),
  FOREIGN KEY (org_id, feature_id) REFERENCES features (org_id, id) ON DELETE SET NULL (feature_id)
);
CREATE INDEX IF NOT EXISTS run_results_run ON run_results (run_id);
CREATE INDEX IF NOT EXISTS run_results_case ON run_results (org_id, case_id, started_at DESC);
CREATE INDEX IF NOT EXISTS run_results_subject ON run_results (org_id, subject_key, started_at DESC);
CREATE INDEX IF NOT EXISTS run_results_company_day ON run_results (org_id, company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS run_results_feature ON run_results (org_id, feature_id, started_at DESC);
CREATE INDEX IF NOT EXISTS run_results_failed ON run_results (org_id, started_at DESC) WHERE verdict = 'failed';

CREATE TABLE IF NOT EXISTS result_steps (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id       bigint NOT NULL,
  result_id    bigint NOT NULL,
  position     integer NOT NULL CHECK (position >= 1),
  kind         text NOT NULL CHECK (kind IN ('plan-step', 'attempt', 'matrix-step', 'ui-step', 'crosscheck-item')),
  step_key     text,                       -- API-EVDRGT-020·act1, 'try 1', the screen field …
  title        text NOT NULL,
  actor        text CHECK (actor IS NULL OR actor IN ('buyer', 'vendor', 'planner', 'admin', 'system', 'unknown')),
  expected     text,
  actual       text,
  verdict      text NOT NULL CHECK (verdict IN ('passed', 'failed', 'couldnt_tell', 'not_run')),
  raw_verdict  text NOT NULL,
  http_status  integer CHECK (http_status IS NULL OR http_status BETWEEN 0 AND 599),
  duration_ms  integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  at           timestamptz,
  UNIQUE (result_id, position),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, result_id) REFERENCES run_results (org_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS result_assertions (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id         bigint NOT NULL,
  result_id      bigint NOT NULL,
  position       integer NOT NULL CHECK (position >= 1),
  assertion_key  text NOT NULL,            -- API-FDRAFT-001 (the field-check catalog id)
  title          text NOT NULL,
  field_path     text,
  op             text,
  severity       text,
  expected       text,
  actual         text,
  -- 'not_run': the check could not be evaluated (an empty array …)
  verdict        text NOT NULL CHECK (verdict IN ('passed', 'failed', 'not_run')),
  UNIQUE (result_id, position),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, result_id) REFERENCES run_results (org_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS result_assertions_key ON result_assertions (org_id, assertion_key);
CREATE INDEX IF NOT EXISTS result_assertions_failed ON result_assertions (org_id, result_id) WHERE verdict = 'failed';

CREATE TABLE IF NOT EXISTS evidence (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  org_id         bigint NOT NULL,
  run_id         text NOT NULL,
  result_id      bigint,
  kind           text NOT NULL CHECK (kind IN ('http-exchange', 'screenshot', 'file', 'log')),
  label          text,                     -- 'the request that decided this step'
  method         text CHECK (method IS NULL OR method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  path           text,
  http_status    integer CHECK (http_status IS NULL OR http_status BETWEEN 0 AND 599),
  request        jsonb,                    -- redacted
  response       jsonb,                    -- redacted, trimmed as the run kept it
  file_path      text,                     -- screenshots and files: relative to the repository
  mime           text,
  bytes          integer NOT NULL CHECK (bytes >= 0),
  sha256         text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  -- the writer passed it through the redactor; a row that was not cannot exist
  redacted       boolean NOT NULL DEFAULT true CHECK (redacted),
  captured_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  CHECK (kind <> 'http-exchange' OR (request IS NOT NULL OR response IS NOT NULL OR path IS NOT NULL)),
  CHECK (kind NOT IN ('screenshot', 'file') OR file_path IS NOT NULL),
  FOREIGN KEY (org_id, run_id) REFERENCES test_runs (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, result_id) REFERENCES run_results (org_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_run ON evidence (run_id);
CREATE INDEX IF NOT EXISTS evidence_result ON evidence (result_id);
CREATE INDEX IF NOT EXISTS evidence_age ON evidence (org_id, captured_at);

CREATE OR REPLACE TRIGGER test_runs_touch BEFORE UPDATE ON test_runs FOR EACH ROW EXECUTE FUNCTION spine_touch_updated_at();
