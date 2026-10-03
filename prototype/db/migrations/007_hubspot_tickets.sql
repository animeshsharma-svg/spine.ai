-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 007: support tickets from HubSpot, turned into regression cases
--   (scripts/hubspot-ingest.ts, scripts/hubspot-reproduce.ts, src/hubspot/*).
--
-- PERSONAL DATA: there is deliberately NO raw-text column. Only text that has
-- been through src/hubspot/strip.ts is stored (subject, summary, scenario),
-- and a ticket whose stripped text still trips the leak check is stored with
-- its text withheld (leak_kinds says what tripped it).
--
-- reproduction_status:
--   not_tried           no live run yet
--   reproduced          the defect showed on TWO fresh test events AND the
--                       backend code confirms the rule (backend_cite) — the
--                       only status that may reach the bug sheet
--   not_reproduced      the regression case ran and the defect did not show
--                       (or the run could not tell — see the evidence)
--   needs_confirmation  failed on two fresh events but the plan covers the
--                       case only in part, or no backend line confirms it yet
--   not_automatable     no API plan can express it (screen-only, documents,
--                       live auctions …) — a person must check it
--
-- Idempotent: every statement can run again without error.

CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id              text PRIMARY KEY,
  dataset                text NOT NULL DEFAULT 'hubspot',      -- hubspot | synthetic
  input_kind             text,                                  -- json | csv | xlsx
  subject                text,                                  -- STRIPPED
  summary                text,                                  -- STRIPPED
  category               text,
  priority               text,
  pipeline_stage         text,
  source_type            text,
  created_at             timestamptz,
  closed_at              timestamptz,
  client_id              integer,                               -- only when the company maps to a known Procol client
  module                 text,                                  -- feature-tree group id (events, bids, award …)
  feature_key            text,                                  -- feature-tree node id (bids.submit …)
  in_events_scope        boolean NOT NULL DEFAULT false,
  classification         text,                                  -- defect | how_to | request | config | data | unclear
  confidence             real,
  classified_by          text,                                  -- rule | llm | none
  mapped_by              text,                                  -- rule | embedding | llm | none
  map_confidence         real,
  classification_why     text,
  scenario               jsonb,
  linked_case_ids        text[] NOT NULL DEFAULT '{}',
  reproduction_status    text NOT NULL DEFAULT 'not_tried',
  reproduction_evidence  jsonb,
  last_run_at            timestamptz,
  pii_removed            jsonb,                                 -- counts by kind, never the values
  leak_kinds             text[] NOT NULL DEFAULT '{}',          -- non-empty = text withheld, kept away from AI
  ai_skipped             boolean NOT NULL DEFAULT false,
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_repro_chk
    CHECK (reproduction_status IN ('not_tried', 'reproduced', 'not_reproduced', 'needs_confirmation', 'not_automatable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_class_chk
    CHECK (classification IS NULL OR classification IN ('defect', 'how_to', 'request', 'config', 'data', 'unclear'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS support_tickets_feature_idx ON support_tickets (module, feature_key);
CREATE INDEX IF NOT EXISTS support_tickets_class_idx ON support_tickets (classification);
CREATE INDEX IF NOT EXISTS support_tickets_repro_idx ON support_tickets (reproduction_status);
