-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 008: more kinds of memory. The memory used to know docs, flows, test cases,
-- API contracts and experience. It now also holds, each as its own kind so a
-- caller can ask for exactly one of them:
--   product-fact   one cited fact of the product model (src/model/anatomy.json,
--                  field rules, per-client templates/fields/units/settings)
--   error-code     one backend error code: message, HTTP status, where raised
--   access-rule    which app (buyer web console / vendor website) may call what
--   backend-code   the per-action digest of the event controllers (knowledge/events/backend-digest)
--   known-bug      one verified Procol defect (docs/bugs/*.xlsx)
--   lesson         one hard-won domain rule (knowledge/lessons)
-- Idempotent: drop the old CHECK if present, add the wider one.

ALTER TABLE memory_chunks DROP CONSTRAINT IF EXISTS memory_chunks_kind_check;
ALTER TABLE memory_chunks ADD CONSTRAINT memory_chunks_kind_check CHECK (kind IN (
  'doc', 'flow', 'test-case', 'api-contract', 'experience',
  'product-fact', 'error-code', 'access-rule', 'backend-code', 'known-bug', 'lesson'
));
