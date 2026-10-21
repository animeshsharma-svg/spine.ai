-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 022: measuring the agent (docs/METRICS.md, scripts/eval-agent.ts)
--   eval_reports     one row per eval run: agent version, dataset version, k, every metric
--                    (value, k, n, interval, ids), composite, gates — the report as written
--   eval_outcomes    every run behind a report: case, label, planted class, what the agent said,
--                    whether a planted failure pointed at the right call, why it was excluded
--   escaped_bugs     bugs found after the agent (support tickets): DDP and leakage
--   feedback_labels  a person's verdict on something the agent reported (valid / false alarm /
--                    unclear): live precision
-- Idempotent: every statement can run again without error.

CREATE TABLE IF NOT EXISTS eval_reports (
  id              bigserial PRIMARY KEY,
  agent_version   text NOT NULL,
  dataset_version text NOT NULL,
  company_id      bigint,
  k               int NOT NULL,
  plant_k         int,
  composite       double precision,
  gates_passed    boolean,
  report          jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eval_reports_created ON eval_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS eval_outcomes (
  id            bigserial PRIMARY KEY,
  report_id     bigint NOT NULL REFERENCES eval_reports (id) ON DELETE CASCADE,
  case_id       text NOT NULL,
  label         text NOT NULL CHECK (label IN ('bug', 'planted', 'clean')),
  bug_key       text,
  plant_class   text,
  run           int NOT NULL,
  said          text NOT NULL CHECK (said IN ('reported', 'passed', 'excluded')),
  right_place   boolean,
  excluded_why  text,
  verdict       text,
  reason        text,
  ms            int
);
CREATE INDEX IF NOT EXISTS eval_outcomes_report ON eval_outcomes (report_id);

CREATE TABLE IF NOT EXISTS escaped_bugs (
  id           text PRIMARY KEY,
  source       text NOT NULL,
  title        text NOT NULL,
  found_at     date,
  linked_bug   text,
  added_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_labels (
  id          bigserial PRIMARY KEY,
  subject     text NOT NULL,
  label       text NOT NULL CHECK (label IN ('valid', 'false_alarm', 'unclear')),
  note        text,
  labelled_by text,
  labelled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_labels_subject ON feedback_labels (subject);
