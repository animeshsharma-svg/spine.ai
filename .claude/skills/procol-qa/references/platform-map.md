# 5. Platform map — where everything is

## Checkouts

| Path | Branch | What |
|---|---|---|
| `~/Desktop/procol` | `animesh` | main checkout (shared with other chats — stage only your own files); the read-only product repos live here: `procol-backend`, `procol-client-dashboard` |
| `~/Desktop/procol-rca-wt` | `rca-wt` → pushed as `origin/demo` | the live platform (dashboard on :4320) |
| `~/Desktop/procol-gap-wt` | `gap-close` (from rca-wt) | the 12 Nov gap-closing work |

Worktrees link credentials as symlinks to the main checkout (`prototype/.env`, `procol-ui-tests/.env`, `procol-ui-tests/.auth`,
`node_modules`) and copy git-ignored working data (`prototype/data/sheet-cases.json` …). Never commit `.env`, `.auth/`,
`findings/`, run data.

## prototype/ (spine.ai: server, agents, runners)

| File | Role |
|---|---|
| `src/server.ts`, `src/routes/*.ts` | the dashboard server; every `routes/*.ts` exporting `handle` is a route module |
| `src/checks/sheetCases.ts` | sheet import (tolerant headers), `sheetPrep` (start state + shape), `sheetCaseProse` (what the compiler reads; Configs Needed + test-data map) |
| `src/checks/sheetRunner.ts` | runs cases one by one; settings; verdict + fairness rules; bugs |
| `src/checks/sheetCampaign.ts` | a whole sheet unattended, resumable |
| `src/checks/companySettings.ts` | settings catalogue (DB), `settingsFor`, `withSettings` (approved companies, restore), `isSettingKey` |
| `src/checks/compiledUiText.ts` | stored text plans and their freshness |
| `src/checks/eventJourney.ts`, `journeyModel.ts` | the event journey by API (create → publish → bids → close → award), its options |
| `src/ui/uiSetup.ts` | start states (`UiState`), `StateShape`, `buildUiState` |
| `src/ui/prepareForPlan.ts`, `uiCasePrep.ts` | which state a case/plan needs |
| `src/ui/uiFlowRunner.ts` | `runUiPlan` (spawns the Playwright plan run), `readPlanResult` |
| `src/agents/planner.ts` | the compiler: prompt rules, lint, `resolveCoveredGaps`, `labelGuesses`, coverage |
| `src/agents/apiPlanner.ts` | API plans |
| `src/agents/deriveCases.ts`, `screenCases.ts`, `journeyCases.ts`, `caseStyle.ts` | case writers + house style |
| `config/test-data-map.json` | another company's test data → this company's own |
| `config/setting-blockers.json`, `featureGates.json` | settings the app will not switch; feature → setting gates |
| `scripts/gap-census.ts` | what cannot run yet, by kind of fix |
| `scripts/night-compile.ts` | compile text cases (`--ids`, `--groups`, `--redo`, `--stale`, `--workers`) |
| `scripts/night-ui-run.ts`, `run-all-runnable.ts`, `night-report.ts` | browser runs, API runs, the morning note |
| `data/compiled-plans/ui-text/` | the compiler's verdict + plan per case (committed) |
| `data/sheet-runs/`, `data/sheet-campaigns/` | run results (git-ignored) |
| `data/gap-close/` | census files, targets, before-plans, recompile logs |

## procol-ui-tests/ (the executor)

| File | Role |
|---|---|
| `src/plan/steps.ts` | the step catalog (name, purpose, args) |
| `src/plan/runPlan.ts` | the executor: one `case` per step |
| `src/plan/generic/` | generic steps, label lists (`knownLabels.json` curated, `labels.seen.json` live, `sourceLabels.json` scanned) |
| `src/pages/*.ts` | page objects (AwardPage, …) |
| `tests/plan.spec.ts` | the Playwright entry a plan runs in |
| `scripts/dump-plan-catalog.ts` | publishes `plan-catalog.json` for the compiler — run after ANY steps.ts / label change |
| `scripts/scan-dashboard-labels.ts` | every UI string in the dashboard source (read-only) |
| `evidence/` | screenshots (the only folder the dashboard serves pictures from) |

## test-cases/

Sheets and builders; `bug_sheet.py` (house bug format), `sheet_run_report.py` (Test Cases + Bugs report).

## Companies and data

PROCOL DEMO 198678 (default, settings switchable, QA_Platform Vendor 1–4 with logins); QA tenants 32461, 47053;
DLF Hospitality UAT 43386 (real people: no other identities, no setting changes); GMMCO has no QA vendors (never
onboard or invite there). UAT login: per-company OTP rule (memory `procol-uat-login-otp`).

## LLM

`src/ai/llm.ts`: Slingring first ("fast" = LUNA; "reason" = ASTRA at $50/1M — deliberate use only; "long" (SOL) is
refused by the gateway), then Groq, then Gemini. The fast tier waits 4 s (`SLINGRING_FAST_TIMEOUT_MS`) unless the call passes `deadlineMs` — a long answer on the fast tier needs it, or it falls through to rate-limited Groq/Gemini.
Gateway rate limit ≈ 6 compiles in flight.
