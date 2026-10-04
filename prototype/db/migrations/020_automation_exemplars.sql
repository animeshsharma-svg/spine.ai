-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 020: the memory learns how automation is built. One new kind of memory chunk:
--   automation-exemplar   one test case that has a WORKING automation (a validated
--                         API plan: a stored full plan, a runnable library case,
--                         a deep-dig twin, an approved assistant draft), stored as
--                         "case text → plan". The API test compiler retrieves the
--                         closest ones for a new case and shows them to the model
--                         as worked examples, or reuses one outright when it fits
--                         exactly (src/agents/exemplars.ts).
-- The plan itself is kept in data/exemplars.json; the chunk holds the case's words
-- (what is embedded) and labels with the plan's shape (recipe, op, actor, outcome).
-- Idempotent: drop the old CHECK if present, add the wider one.

ALTER TABLE memory_chunks DROP CONSTRAINT IF EXISTS memory_chunks_kind_check;
ALTER TABLE memory_chunks ADD CONSTRAINT memory_chunks_kind_check CHECK (kind IN (
  'doc', 'flow', 'test-case', 'api-contract', 'experience',
  'product-fact', 'error-code', 'access-rule', 'backend-code', 'known-bug', 'lesson',
  'automation-exemplar'
));
