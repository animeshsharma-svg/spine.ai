-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 017: the first customer, as reference data. Safe to re-run: nothing that
-- already exists is changed (a person may have edited it since).
--
--   organisation  procol — "Procol"
--   environment   uat — Procol's UAT (base URLs only; credentials stay in
--                 `procol test/.env` and are never stored here)
--   companies     the UAT clients spine.ai tests as. 900001 "Procol Sandbox
--                 Demo (PO)" appears in older runs and on the bug sheet.
--                 Any other company a run names is added by the run writer.
--   users         a local owner, and the service identities that start runs
--                 on their own. The owner's real address is set with
--                 `UPDATE users SET email = … WHERE email = 'owner@spine.local'`
--                 — personal addresses are not committed to the repository.
--
-- Idempotent: every statement can run again without error.

SELECT set_config('app.role', 'service', true);  -- this transaction writes across row-level security

INSERT INTO organisations (slug, name, timezone, evidence_retention_days)
VALUES ('procol', 'Procol', 'Asia/Kolkata', 90)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO environments (org_id, key, name, kind, api_base_url, console_url, vendor_url, allows_writes, secrets_ref)
SELECT o.id, 'uat', 'UAT', 'uat', 'https://sec-api-v1.ag-ri.in/api', 'https://cpanel.ag-ri.in', 'https://quotes.ag-ri.in', true, 'procol test/.env'
  FROM organisations o WHERE o.slug = 'procol'
ON CONFLICT (org_id, key) DO NOTHING;

INSERT INTO target_companies (org_id, environment_id, procol_company_id, name, role, is_primary, notes)
SELECT o.id, e.id, c.pid, c.name, c.role, c.is_primary, c.notes
  FROM organisations o
  JOIN environments e ON e.org_id = o.id AND e.key = 'uat'
  CROSS JOIN (VALUES
    (198678, 'PROCOL DEMO',              'buyer',   true,  'The primary client for runs.'),
    (32461,  'Demo Account 2',           'buyer',   false, 'Evaluation scores 0–5; used for the bidding matrix.'),
    (47053,  'GMMCO LIMITED',            'buyer',   false, 'Products linked to units the company does not have ("unit not available").'),
    (900001, 'Procol Sandbox Demo (PO)', 'sandbox', false, 'Purchase-order runs.')
  ) AS c (pid, name, role, is_primary, notes)
 WHERE o.slug = 'procol'
ON CONFLICT (org_id, environment_id, procol_company_id) DO NOTHING;

INSERT INTO users (email, display_name, kind) VALUES
  ('owner@spine.local',         'Local owner',            'person'),
  ('nightly@spine.local',       'Nightly run',            'service'),
  ('ci@spine.local',            'CI',                     'service'),
  ('backend-watch@spine.local', 'Backend watch',          'service'),
  ('assistant@spine.local',     'spine.ai assistant',     'service'),
  ('agent@spine.local',         'Batch agent',            'service'),
  ('hubspot@spine.local',       'HubSpot regression run', 'service')
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO memberships (org_id, user_id, role)
SELECT o.id, u.id, CASE WHEN u.email = 'owner@spine.local' THEN 'owner' ELSE 'qa' END
  FROM organisations o, users u
 WHERE o.slug = 'procol' AND u.email LIKE '%@spine.local'
ON CONFLICT (org_id, user_id) DO NOTHING;
