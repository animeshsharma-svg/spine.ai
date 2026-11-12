# Platform fixes needed (for Animesh) — one line per item, grouped by kind

Format: `[case id] — what the automation could not do or misread — evidence (run id, step, screenshot or reply) — what would fix it`. Animesh marks each with the commit that fixed it.

## Already changed under prototype/src before the 12 Nov brief (uncommitted on `aanya`; keep, move or redo as you see fit)
- [decathlon] — browser runs on Decathlon (57675) refused: no UAT DB session — `config/tokenClients.ts` `browserLogin`, `src/ui/uiFlowRunner.ts` `browserLoginEnv`, `src/server.ts` plan-run gate; proven "[login] signed in — the app opened /" on 11 Nov.
- [decathlon] — the planner wrote the UAT event journey for a PO case on Decathlon — `src/server.ts` `ownScreensPlan`: an own-screens tenant gets one on-screen goal per case step, with the ⋮-menu and not-a-Draft hints.
- [po narration] — three lines per API step ("resolve header relations" / "Sent 1 request" / "1 request, all accepted") — `src/server.ts` PO rows reworded; look-ups folded; "1 line item" / "one line item" / "a single line item" parsed.
- [prd] — `src/routes/prd.ts` (new) and `src/routes/runCases.ts` (exports, types Integration/Security/Performance/Bug-confirm/Observation, `qaComment`): the PRD → test cases writer with the self-review pass.

## Missing step
(none yet — filled from Track A step 1 "Understand" results)

## Wrong label
## Misread verdict
## Start state not built
## Setting blocked
