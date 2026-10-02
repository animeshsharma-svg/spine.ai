-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 003: test cases the assistant WROTE, and the conversations that led to them.
--
--   generated_cases  a case someone typed into the chat box that matched no
--                    existing case. The assistant built an automation for it
--                    (an API case in the library's shape and/or a compiled UI
--                    plan), ran what it could, and kept it here as a DRAFT.
--                    A draft is not part of the catalog until a person reviews
--                    it: status stays 'draft' until someone sets it otherwise.
--   assistant_turns  one row per message typed into the assistant: what was
--                    typed, what it matched, what ran, what it answered.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS generated_cases (
  id              text PRIMARY KEY,               -- GEN-PUB-001
  area            text NOT NULL,                  -- PUB, BID, AWD, VBU …
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  typed_text      text NOT NULL,                  -- exactly what the person typed
  title           text NOT NULL,
  setup           text NOT NULL DEFAULT '',
  steps           text[] NOT NULL DEFAULT '{}',
  expected        text NOT NULL DEFAULT '',
  oracle          text NOT NULL DEFAULT '',
  layer           text NOT NULL CHECK (layer IN ('api', 'ui', 'api+ui', 'none')),
  -- how much of the typed case the built automation actually tests
  coverage        text NOT NULL CHECK (coverage IN ('full', 'partial', 'none')),
  gaps            text[] NOT NULL DEFAULT '{}',
  -- catalog cases that cover PART of it (the matcher's PARTIAL answers)
  partial_of      text[] NOT NULL DEFAULT '{}',
  api_case        jsonb,                          -- library-shape record (method, path, body, expected …)
  ui_plan         jsonb,                          -- the compiled plan, not executed
  last_run        jsonb,                          -- the API part's last result
  company_id      integer,
  case_md         text NOT NULL,                  -- the block as written to test-cases/generated-<date>.md
  md_file         text,
  embedding       vector(1536),                   -- same columns and embedders as memory_chunks
  embedding_small vector(384),
  embedded_with   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generated_cases_status ON generated_cases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_cases_area ON generated_cases (area);

CREATE TABLE IF NOT EXISTS assistant_turns (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  typed_text    text NOT NULL,
  company_id    integer,
  decision      text NOT NULL,                    -- existing | partial | new | unclear
  matched       text[] NOT NULL DEFAULT '{}',     -- SAME case ids
  partial       text[] NOT NULL DEFAULT '{}',     -- PARTIAL case ids
  generated_id  text,                             -- the GEN- draft written, if any
  run_ids       text[] NOT NULL DEFAULT '{}',     -- saved runs this turn produced
  answer        text,                             -- the plain-English reply
  record        jsonb NOT NULL                    -- everything, for the details panel
);
CREATE INDEX IF NOT EXISTS assistant_turns_at ON assistant_turns (at DESC);
