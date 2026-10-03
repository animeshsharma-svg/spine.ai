-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 006: the Success page (src/checks/metrics.ts, /api/metrics)
--   metric_inputs    numbers only a person can give — how many reported bugs
--                    Procol accepted or turned down, and target overrides
--                    ("target:<metric>"). One row per key, last write wins.
--   metric_snapshots one value per metric per day, written when the page is
--                    read, so numbers that cannot be rebuilt from history
--                    (what is runnable today) still get a trend.
--
-- Idempotent: every statement can run again without error.

CREATE TABLE IF NOT EXISTS metric_inputs (
  key         text PRIMARY KEY,
  value       double precision NOT NULL,
  note        text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  day    date NOT NULL,
  key    text NOT NULL,
  value  double precision NOT NULL,
  at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, key)
);
