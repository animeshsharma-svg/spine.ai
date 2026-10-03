-- 019: a person reviews each assistant draft (src/agents/draftReview.ts).
-- Approve moves the case into the catalog and stores its automation with the
-- compiled plans; reject keeps it out with the reviewer's reason.
ALTER TABLE generated_cases ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz;
ALTER TABLE generated_cases ADD COLUMN IF NOT EXISTS reviewed_by          text;
ALTER TABLE generated_cases ADD COLUMN IF NOT EXISTS review_note          text;
-- the reviewer confirmed the automation tests what the case says
ALTER TABLE generated_cases ADD COLUMN IF NOT EXISTS automation_confirmed boolean;
-- the catalog file the approved case was written to
ALTER TABLE generated_cases ADD COLUMN IF NOT EXISTS catalog_file         text;
CREATE INDEX IF NOT EXISTS generated_cases_reviewed ON generated_cases (reviewed_at DESC) WHERE reviewed_at IS NOT NULL;
