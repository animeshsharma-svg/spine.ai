-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 002: the PRODUCT MODEL of a sourcing event — what the platform KNOWS
-- (instead of guesses) about how an event works and what each client has.
--
--   anatomy      how an event is built and runs, from the backend + dashboard
--                code, every fact with its file:line (static, rebuilt from
--                src/model/anatomy.json)
--   field rules  what the backend / the screen accepts or refuses for each kind
--                of template field (static, from code)
--   snapshots    per client, what it really has (templates + every field,
--                units, products, vendors, settings), versioned by content
--                hash so a change between two fetches is visible

-- ── static knowledge ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_anatomy (
  id           text PRIMARY KEY,            -- e.g. time_rule.rfp_end_before_rfq_end
  section      text NOT NULL,               -- event_type | stage | status | transition | action | time_rule | actor | permission | template_type | unit_rule
  title        text NOT NULL,               -- plain-English name
  plain        text NOT NULL,               -- plain-English explanation
  code         integer,                     -- Procol error code, when a refusal carries one
  details      jsonb NOT NULL DEFAULT '{}', -- enum values, conditions, messages …
  cites        text[] NOT NULL DEFAULT '{}',
  backend_ref  text,
  built_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_anatomy_section ON model_anatomy (section);

CREATE TABLE IF NOT EXISTS model_field_rules (
  id           text PRIMARY KEY,            -- e.g. number.precision
  applies_to   text NOT NULL,               -- an input type (number, dropdown …), a field key (creator_quantity …) or '*'
  kind         text NOT NULL,               -- required | type | range | enum | dependency | readOnly | regex | unit | precision | maxLength
  plain        text NOT NULL,
  enforced_by  text NOT NULL,               -- backend | screen | template-only | unknown
  code         integer,
  message      text,
  details      jsonb NOT NULL DEFAULT '{}',
  cites        text[] NOT NULL DEFAULT '{}',
  built_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_field_rules_applies ON model_field_rules (applies_to);

-- ── per-client snapshots ────────────────────────────────────────────────────
-- One row per fetch. When nothing changed since the previous fetch the row
-- still records WHEN it was checked, but points at the snapshot that holds the
-- (identical) detail rows instead of copying them (same_as).
CREATE TABLE IF NOT EXISTS model_snapshots (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL,
  company_name   text,
  fetched_at     timestamptz NOT NULL,
  content_hash   text NOT NULL,
  previous_hash  text,
  changed        boolean NOT NULL,
  same_as        bigint REFERENCES model_snapshots (id) ON DELETE SET NULL,
  summary        jsonb NOT NULL,             -- counts, shown without opening the detail
  changes        jsonb NOT NULL DEFAULT '[]',-- plain-English list of what changed since previous_hash
  model          jsonb                       -- the whole built model (null when same_as is set)
);
CREATE INDEX IF NOT EXISTS model_snapshots_company ON model_snapshots (company_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS model_templates (
  snapshot_id      bigint NOT NULL REFERENCES model_snapshots (id) ON DELETE CASCADE,
  company_id       integer NOT NULL,
  uuid             text NOT NULL,
  name             text NOT NULL,
  template_type    text,                     -- default | custom | dynamic
  order_type       text,                     -- buy | sell
  type_identifiers text[] NOT NULL DEFAULT '{}',
  listed_under     text[] NOT NULL DEFAULT '{}',  -- which GET /templates?type_identifier=… lists returned it
  use_for          text[] NOT NULL DEFAULT '{}',  -- rfq | rfp | auction | boq …
  is_default       boolean NOT NULL DEFAULT false,
  opens            boolean NOT NULL DEFAULT true, -- GET /templates/:uuid answered
  field_count      integer NOT NULL DEFAULT 0,
  required_count   integer NOT NULL DEFAULT 0,
  problems         jsonb NOT NULL DEFAULT '[]',
  content_hash     text,
  PRIMARY KEY (snapshot_id, uuid)
);
CREATE INDEX IF NOT EXISTS model_templates_company ON model_templates (company_id, uuid);

CREATE TABLE IF NOT EXISTS model_template_fields (
  snapshot_id    bigint NOT NULL,
  company_id     integer NOT NULL,
  template_uuid  text NOT NULL,
  position       integer NOT NULL,
  section        text NOT NULL,              -- line_item | whole_bid | form
  page           text,                       -- the form page, for technical (RFP) templates
  key            text NOT NULL,
  name           text NOT NULL,
  input_type     text NOT NULL,
  filled_by      text NOT NULL,              -- buyer | vendor | computed | nobody
  required       boolean NOT NULL DEFAULT false,
  mode           text,                       -- write | read | hidden
  unit           text,
  options        jsonb,
  formula        text,
  rules          jsonb NOT NULL DEFAULT '[]',
  plain          text NOT NULL,
  PRIMARY KEY (snapshot_id, template_uuid, position),
  FOREIGN KEY (snapshot_id, template_uuid) REFERENCES model_templates (snapshot_id, uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_units (
  snapshot_id       bigint NOT NULL REFERENCES model_snapshots (id) ON DELETE CASCADE,
  company_id        integer NOT NULL,
  unit_id           integer NOT NULL,
  symbol            text NOT NULL,
  name              text,
  owner_company_id  integer,                 -- null = a Procol-wide unit
  base_unit_id      integer,
  conversion_factor double precision,
  PRIMARY KEY (snapshot_id, unit_id)
);

-- The newest fetch per client, resolved to the snapshot that holds its rows.
CREATE OR REPLACE VIEW model_latest AS
SELECT DISTINCT ON (s.company_id)
  s.company_id, s.company_name, s.fetched_at, s.content_hash, s.changed, s.summary, s.changes,
  coalesce(s.same_as, s.id) AS data_snapshot_id, s.id AS snapshot_id
FROM model_snapshots s
ORDER BY s.company_id, s.fetched_at DESC, s.id DESC;
