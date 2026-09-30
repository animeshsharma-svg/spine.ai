-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's. Procol's database is
-- DATABASE_URL in `procol test/.env` and is only ever read.
--
-- 001: the two things every later phase builds on
--   memory   — what the platform knows (docs, cases, flows, past findings),
--              searchable by meaning (pgvector) and by words (tsvector)
--   history  — every run and every result, so "flaky" can be told from "broken"

CREATE EXTENSION IF NOT EXISTS vector;

-- array_to_string is only STABLE, and a generated column needs IMMUTABLE. With
-- a fixed separator it cannot change its answer, so wrap it and say so.
CREATE OR REPLACE FUNCTION spine_labels_text(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT coalesce(array_to_string($1, ' '), '') $$;

-- ── memory ──────────────────────────────────────────────────────────────────
-- One row per chunk. Two embedding columns because the two embedders produce
-- vectors of different lengths that mean nothing to each other:
--   embedding        Slingring HACK26_TEXT_EMBED_3_LARGE, shortened to 1536
--                    (pgvector's HNSW index takes at most 2000 dimensions)
--   embedding_small  local Xenova/all-MiniLM-L6-v2, 384
-- Retrieval uses the column of the embedder in use and never compares across.
CREATE TABLE IF NOT EXISTS memory_chunks (
  id               text PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('doc', 'flow', 'test-case', 'api-contract', 'experience')),
  source           text NOT NULL,
  module           text,
  labels           text[] NOT NULL DEFAULT '{}',
  text             text NOT NULL,
  -- sha256 of text + labels + kind + module: an unchanged chunk is not re-embedded
  content_hash     text NOT NULL,
  embedding        vector(1536),
  embedding_small  vector(384),
  embedded_with    text,
  tsv              tsvector GENERATED ALWAYS AS (
                     to_tsvector('simple', text || ' ' || spine_labels_text(labels) || ' ' || source)
                   ) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_chunks_embedding_hnsw
  ON memory_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memory_chunks_embedding_small_hnsw
  ON memory_chunks USING hnsw (embedding_small vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memory_chunks_tsv ON memory_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS memory_chunks_kind_module ON memory_chunks (kind, module);

-- One row per build, so the dashboard can say when the memory was last refreshed
-- and with which embedder.
CREATE TABLE IF NOT EXISTS memory_builds (
  id          bigserial PRIMARY KEY,
  built_at    timestamptz NOT NULL DEFAULT now(),
  embedder    text NOT NULL,
  chunks      integer NOT NULL,
  embedded    integer NOT NULL,  -- how many were (re-)embedded this time
  removed     integer NOT NULL,
  duration_ms integer NOT NULL
);

-- ── history ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id            text PRIMARY KEY,           -- same id as data/runs/<id>.json
  started_at    timestamptz NOT NULL,
  request       text,
  company_id    integer,
  company_name  text,
  provider      text,
  duration_ms   integer,
  journey_label text,
  outcome       text,
  record        jsonb NOT NULL              -- the whole run record, as saved to disk
);
CREATE INDEX IF NOT EXISTS runs_started_at ON runs (started_at DESC);
CREATE INDEX IF NOT EXISTS runs_company ON runs (company_id, started_at DESC);

-- One row per verdict a run produced: a library case, a journey step, a field check.
CREATE TABLE IF NOT EXISTS results (
  id           bigserial PRIMARY KEY,
  run_id       text NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  company_id   integer,
  kind         text NOT NULL CHECK (kind IN ('case', 'journey-step', 'field-check')),
  case_id      text NOT NULL,              -- EDGE-PUB-019, eval_score, API-FESCORE-001 …
  feature      text,
  title        text,
  verdict      text NOT NULL,              -- pass | fail | inconclusive | worked | refused | broken | not-run
  http_status  integer,
  reason       text,
  duration_ms  integer,
  created_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS results_case ON results (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS results_run ON results (run_id);
CREATE INDEX IF NOT EXISTS results_company_case ON results (company_id, case_id, created_at DESC);

-- The question history exists to answer: has this ever passed, and how often does it fail?
CREATE OR REPLACE VIEW case_track_record AS
SELECT
  company_id,
  kind,
  case_id,
  count(*)                                                        AS runs,
  count(*) FILTER (WHERE verdict IN ('pass', 'worked'))           AS passed,
  count(*) FILTER (WHERE verdict IN ('fail', 'broken', 'refused')) AS failed,
  count(*) FILTER (WHERE verdict = 'inconclusive')                AS inconclusive,
  max(created_at)                                                 AS last_seen,
  (array_agg(verdict ORDER BY created_at DESC))[1]                AS last_verdict,
  -- both outcomes seen = flaky, not simply broken
  bool_or(verdict IN ('pass', 'worked')) AND bool_or(verdict IN ('fail', 'broken', 'refused')) AS flaky
FROM results
GROUP BY company_id, kind, case_id;
