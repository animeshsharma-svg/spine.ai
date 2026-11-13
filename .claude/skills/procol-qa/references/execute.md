# 3. Run the cases and judge them

## 3.1 How one browser case runs (the sheet runner, `prototype/src/checks/sheetRunner.ts`)

```
case row ─▶ sheetPrep (sheetCases.ts)            what it starts from: a set-up event (SRC-SET-00N), or the state
            │                                    and shape its pre-conditions state in words (closed_two_bids,
            │                                    10 units, A 100 / B 90, two lines…); "creates its own" → none
            ├▶ settings                          Configs Needed + the stored plan's require_setting steps →
            │                                    withSettings (companySettings.ts): approved company only, read
            │                                    back from the app's own answer, restored after (also at start-up)
            ├▶ plan                              the stored compile (data/compiled-plans/ui-text/<id>.json) when it
            │                                    is fresh and for the same start state; else compileTestCase now
            │                                    (planner.ts → steps from procol-ui-tests/plan-catalog.json)
            ├▶ start state                       contextForPlan → buildUiState (uiSetup.ts): the event journey
            │                                    (eventJourney.ts) by API with QA vendors only, read back
            ├▶ browser                           runUiPlan → procol-ui-tests tests/plan.spec.ts → runPlan.ts:
            │                                    one step at a time, spotlight screenshot per action, network kept
            └▶ verdict + evidence                readPlanResult → Pass / Fail / Partly checked / Couldn't tell /
                                                 Not run (Blocked: …), bug with screenshots, saved in
                                                 data/sheet-runs/<run>.json
```

A plan is a list of steps from the catalog (134 today: domain steps like `open_prepared`, `award_event`,
`extend_time`, `require_setting`; generic steps like `click`, `fill`, `expect_text`, `expect_value`, `expect_count`,
`remember`/`expect_remembered`, `attempt` for refusals; `do_on_screen` and `ask_tester` for the parts no step does).

## 3.2 Ways to run

| What | How |
|---|---|
| A sheet, picked cases | Test sheets page `#/sheets` (`/api/sheets/run?sheet=&ids=`) or Home → upload |
| A whole sheet, unattended | campaign: `/api/sheets/campaign/start` (sheetCampaign.ts; resumes after a restart) |
| Every compiled case overnight | `scripts/night-compile.ts` then `scripts/night-ui-run.ts --c 198678 --budget-min 420 --repair`, morning note `scripts/night-report.ts` |
| API cases / stored API plans | `scripts/run-all-runnable.ts --c 198678 [--plans-only]` |
| One typed case | Home composer (single-case mode) |

Rules: **one browser at a time** (`browserSlot.ts`; another Playwright run is waited for, never joined). A server
started from a second checkout must not resume another checkout's campaign. `tsx watch` restarts kill live streams —
run long jobs on a server without watch.

## 3.3 Evidence

Every check keeps: a screenshot (spotlight frame of the control acted on), the request and its answer (tokens
masked), and — for anything that saves — a SELECT confirming exactly the intended records changed. API cases keep the
request/response pairs. Screenshots are served only from `procol-ui-tests/evidence/`.

## 3.4 Data the run changes

Only QA_Platform events with QA vendors; company settings only on 198678 and restored; nothing sent to real people.
List every record created in the summary.

## 3.5 Verdicts

| Verdict | When |
|---|---|
| **Pass** | every check matched and was seen (screen, reply or saved value) |
| **Fail** | the app clearly did something else and you can show it — reproduced on a fresh event |
| **Partly checked** | every step that exists worked; part of the case has no step yet (named) |
| **Blocked** | needs access the run may not use (another person's login, a hidden setting, a mailbox) — the action was done where possible and the exact expected text recorded |
| **Not run** | the company has no such data/setting and it may not be changed; the start state cannot be built; no step for the subject |
| **Observation** | works as built, someone should decide (wording, risky default, data trap, PRD vs case difference) |
| **Couldn't tell** | the automation could not reach the check, or a one-off not reproduced — never a bug |

## 3.6 Fairness rules (each one learnt from a false Fail)

A failure is **Couldn't tell**, not Fail, when: a Playwright timeout / strict-mode / closed page; the step says "not
checked", "could not tell" or "automation needs update"; the control named is not on the screen (a guessed label);
the label carried a guessed counter ("Awarded Vendors (0/1)"); the compiler itself marked the label unconfirmed; the
value read is the run's own generated title; a check came after a part nobody did; a variant / delivery location /
unit is compared with another company's test data; the network dropped (ENETUNREACH ends every later case — rerun).
A recorded 500 is a bug only after it reproduces on its own fresh event (~25% of recorded crashes were shared-event
contamination). Re-read every Fail against its screenshot and reply before reporting it (10 Nov: 13 of 13 browser
Fails were misreads, plan faults or the case's own test data).

## 3.7 Report

- The sheet back: Status, **Actual Result** (what was done, what was seen), **Screenshots**.
- Bugs in the house format (`test-cases/bug_sheet.py → write_bug_sheet`): Issue ID | **Bug (one line)** | Dev Status |
  Feature | Priority | Blocker | DEV TYPE | … | Description (what happens, Expected behavior, Why it matters) |
  **Steps to Reproduce** (own column, numbered, real record names) | ARTEFACTS/JAM (embedded screenshot) | … |
  QA Status FAIL | QA Comment (environment, date, record and case ids).
- A summary: counts per verdict, "does it work?" in one line, at most five things wrong, what was not checked and what
  it needs, every record changed.
