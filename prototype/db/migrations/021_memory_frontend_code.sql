-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 021: one more kind of memory chunk:
--   frontend-code   the per-screen digest of the buyer console's event screens
--                   (knowledge/events/frontend-digest: route, API calls, fields,
--                   client-side validations, what is hidden/disabled when, number
--                   formatting), cited to procol-client-dashboard file:line.
-- Kept apart from backend-code so a caller can ask "what does the SCREEN do" and
-- "what does the API do" separately — the gaps between the two are test cases.
-- The list keeps every kind added before it (008, 020).
-- Idempotent: drop the old CHECK if present, add the wider one.

ALTER TABLE memory_chunks DROP CONSTRAINT IF EXISTS memory_chunks_kind_check;
ALTER TABLE memory_chunks ADD CONSTRAINT memory_chunks_kind_check CHECK (kind IN (
  'doc', 'flow', 'test-case', 'api-contract', 'experience',
  'product-fact', 'error-code', 'access-rule', 'backend-code', 'known-bug', 'lesson',
  'automation-exemplar', 'frontend-code'
));
