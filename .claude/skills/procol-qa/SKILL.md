---
name: procol-qa
description: How to test a Procol feature end to end with the spine.ai platform — understand the flow (PRD first, the live app second, the code only to know where to look), write house-format test cases from the PRD alone, run them (sheet runner, API plans, read-only DB confirm), judge them fairly, report bugs in the house bug-sheet format, and CLOSE AUTOMATION GAPS (cases the platform cannot run yet) by adding the missing label, step, start state, setting or test data and measuring the gain. Use for any Procol QA task — "test this feature", "write test cases for this PRD", "run this sheet", "why doesn't this case run", "make the platform able to run X", "upgrade the automation".
---

# Procol QA — understand, write, run, judge, close the gap

This is the way every Procol feature in this repo was tested (approval routing, PR assignee, Template Studio,
vendor onboarding, sourcing PR→PO, the RCA replays, the 8,940-case night run) written down as one method.
The platform (spine.ai, `prototype/` + `procol-ui-tests/`) does most of it on its own; this skill is what you
do around it, and how you make it do more.

## The loop

1. **Understand** the feature → `references/understand.md`. The PRD says what is right. The live app says what
   happens. The code is the thing under test: read it only to know *where* to look, never to decide *what* is right.
2. **Write** cases from the PRD alone, in the 14 house columns + PRD Reference → `references/write-cases.md`
   (prompt: `references/prompt-test-case-writer.md`).
3. **Map** placeholders (PR-1, User A, Vendor B) to real records with read-only SELECTs; map another company's test
   data to this company's own (`prototype/config/test-data-map.json`) → `references/understand.md` §4.
4. **Run** them → `references/execute.md`. Sheets go through the sheet runner (start state built by API, plan
   compiled or reused, settings switched and restored, one browser, evidence per step). API cases through API plans.
   What was saved is confirmed in the DB (SELECT only).
5. **Judge** with the verdict table and the fairness rules → `references/execute.md` §5–6. A Fail needs evidence
   and a reproduction on a fresh event; an automation shortfall is "Couldn't tell", never a bug.
6. **Report**: the sheet back with Status / Actual Result / Screenshots, and bugs in the house bug-sheet format
   (`test-cases/bug_sheet.py`) — one-line bug, description, separate numbered steps, embedded screenshot.
7. **Close the gap**: every case that could not run is a missing capability. Count them (`gap-census.ts`), fix the
   biggest kind in the right layer, verify live, recompile only the affected cases, measure before → after
   → `references/build-automation.md`. What is left, and how to build it: `references/gap-backlog.md`.
8. **Remember** what was learnt (traps, ids, rules) in memory and in the platform's own files.

## Non-negotiables

- **Read-only**: procol-backend and procol-client-dashboard (git show / grep only); the database (SELECT only).
- **Test records only**: titles `QA_Platform…`, users `qa_…@example.com`, QA vendors only (never a real supplier).
  Company settings are switched only on approved companies (PROCOL DEMO 198678) and always switched back.
- **Never** print OTPs, tokens or passwords; never sign in as a real person; never send approvals, assignments or
  emails to real people; never edit teams, users, templates or workflows you did not create.
- **Honesty of coverage**: a gap is removed only when a step in the plan really does it. A compile the model did not
  answer never replaces a real plan. A guessed label is a guess until the product's source or a live screen confirms it.
- **One browser at a time**; a second server never resumes someone else's campaign.
- Confirm before anything outward-facing or irreversible that the user did not ask for.

## Where things are

`references/platform-map.md` — every file, command, port and data folder this skill touches.

## Quick commands

```bash
cd prototype
npx tsx scripts/gap-census.ts                         # what cannot run yet, by missing capability
npx tsx scripts/gap-census.ts --theme start-state     # the cases and gaps of one kind
cd ../procol-ui-tests && npx tsx scripts/scan-dashboard-labels.ts && npx tsx scripts/dump-plan-catalog.ts
cd ../prototype && npx tsx scripts/night-compile.ts --ids SRC-AWD-016,SRC-NEG-024 --stale --workers 4
npx tsx scripts/night-ui-run.ts --help               # run compiled cases in the browser, one at a time
```
