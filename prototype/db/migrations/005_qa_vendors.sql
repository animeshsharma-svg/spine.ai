-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 005: QA vendor companies the platform created on UAT for multi-vendor runs
--   qa_vendors — one row per QA vendor company (fake reserved-domain email,
--                name "QA_Platform Vendor <n> <stamp>"), per buyer workspace.
--                Later runs reuse these instead of creating more.
--
-- Idempotent: every statement can run again without error.

CREATE TABLE IF NOT EXISTS qa_vendors (
  id                  bigserial PRIMARY KEY,
  workspace_id        integer NOT NULL,          -- the buyer company on UAT (198678, 32461)
  vendor_company_id   integer NOT NULL,          -- the invited company the buyer deals with
  vendor_company_uuid text NOT NULL,
  home_company_id     integer,                   -- the company the vendor's own signup made
  user_id             integer,
  user_uuid           text,
  email               text NOT NULL,             -- qa_<stamp>_v<n>@example.com (reserved test domain)
  name                text NOT NULL,             -- QA_Platform Vendor <n> <stamp>
  stamp               text NOT NULL,
  n                   integer NOT NULL,
  link_status         text,                      -- buyer_seller_company_mappings.status, as last read
  login_ok            boolean NOT NULL DEFAULT false,
  verified_at         timestamptz,
  created_by          text NOT NULL DEFAULT 'invite+vendor_signup',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, vendor_company_id)
);

CREATE INDEX IF NOT EXISTS qa_vendors_ws_idx ON qa_vendors (workspace_id, login_ok);
