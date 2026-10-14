# How spine.ai measures its agent

Every number in an eval report can be recomputed by hand from the outcomes listed in the same
report. This page defines each metric, how it is counted and where the definition comes from.

- Code: `prototype/src/eval/metrics.ts`, one pure function per metric.
- Tests: `prototype/scripts/ci-unit-tests.ts` ("eval metrics"), with hand-computed values that CI checks on every push.
- Run it: `npx tsx scripts/eval-agent.ts`.
- Reports: `prototype/data/eval/reports/` (JSON and Markdown).
- Settings: weights and gates are in `prototype/data/eval/config.json`.

## What is measured, and against what truth

The eval runs the **real agent** on **stored API plans**. Those plans need no AI model at run time, so two runs of the same version differ only where Procol UAT does. Each run builds its own fresh records, using QA test vendors only.

Every case carries a **label** that comes from outside the run being measured:

| Label | Where the truth comes from | The agent should |
|---|---|---|
| **bug** | The bug sheet (`docs/bugs/Procol_bugs_found_*.xlsx`) names the case for a verified bug. People confirmed each bug on fresh test events. | report it |
| **planted** | We injected the bug, so it exists by construction (see *Planted bugs*). | report it at the planted call |
| **clean** | It passed at least twice before, never failed or gave up, and no bug names it. Its earlier runs make it clean, not this run. | stay quiet |

A stored plan with no clean history is a **candidate**. It never counts towards precision. It only carries planted bugs, and only after it passes every baseline run of the eval: a planted bug counts only where the real reply passes.

### What the agent said on one run

| Said | When |
|---|---|
| **reported** | The plan failed, and failed the same way again on a second fresh record. This is the agent's own rule for reporting a bug. |
| **passed** | The plan passed. |
| **excluded** | Couldn't tell, not run, or the setup or environment failed. |

**Excluded runs never count as a detection or a false alarm.** They are counted on their own (*couldn't-tell rate*), so giving up can never hide a miss or a false alarm.

### Counting rules
- **Dedup.** One bug counts once, however many cases or runs report it. The key is the bug id, or `case#class` for a planted bug.
- **A bug is detected** when any usable run reported it. For a planted bug, the failing step must also be a call the plant changed.
- **A bug is missed** when it had at least one usable run and none detected it.
- **A clean case is a false alarm** when **any** usable run reported it. This is the strict reading: a person would have seen that alarm.

## The metrics

| Metric | Formula | Source |
|---|---|---|
| Precision (real) | known bugs detected ÷ (known bugs detected + false alarms). Planted bugs are left out, because catching an injected 500 is easy and would flatter it. **The gate judges this one.** | ML classification |
| Precision (all) | detected bugs, planted included ÷ (detected + false alarms) | ML classification |
| Recall | detected ÷ (detected + missed), also split into known bugs and planted bugs | ML classification |
| F0.5 | (1 + 0.25) · P · R ÷ (0.25 · P + R): precision weighs twice recall | van Rijsbergen F-beta |
| False-alarm rate | clean cases reported ÷ clean cases with a usable run | ML classification |
| Mutation score | planted bugs caught at the right call ÷ planted bugs with a usable run, overall and per class | Mutation testing (TestGenEval, Meta ACH) |
| pass^k | cases where all k runs gave the expected verdict ÷ cases with k usable runs | τ-bench |
| Flaky rate | cases whose verdict changed between runs ÷ cases with ≥ 2 usable runs | Google / Trunk flakiness |
| Couldn't-tell rate | excluded runs ÷ all runs | spine.ai: makes giving up visible |
| DDP | bugs the agent found ÷ (found + found later, e.g. support tickets) | ISTQB |
| Leakage | escaped bugs ÷ (escaped + found by the agent) | ISTQB |
| Bug re-check coverage | verified bugs a stored plan can re-check ÷ verified bugs | ISO 25010 functional completeness |
| Verify depth | stored plans whose read-back checks data, not only a 2xx status ÷ stored plans | spine.ai: shows which plans *cannot* see wrong data |
| Time to verdict | p50 and p90 of baseline run time (nearest-rank) | ISO 25010 performance efficiency |
| Cost per run | model spend during the eval ÷ runs | — |

**Confidence intervals.**
- Every proportion carries **k / n** and a **Wilson 95% interval**: (p + z²/2n ± z·√(p(1−p)/n + z²/4n²)) ÷ (1 + z²/n), with z = 1.96.
- With small n the interval is wide, and the report shows it rather than hiding it.
- A proportion with n = 0 is reported as **—**, never as 0% or 100%.

## Planted bugs
- A reply from UAT is changed **inside our own harness**, after UAT sent it. Procol's code and data are never touched.
- Only the act and verify phases are changed, never the setup, so the record the case runs on is real.
- The planted bug is applied again on the agent's confirmation re-run.

| Class | What changes | Applies to |
|---|---|---|
| server_error | The first call of the plan's **decisive** step answers 500. The decisive step is the one marked decisive, else the last act that is not a wait, as the planner defines it. With no act step, the first verify read answers 500 instead. | every plan with an act or verify call |
| flipped_outcome | Success expected: the decisive step's first call is refused. Refusal expected: **every** refusal the decisive step meets becomes a success (a missing validation). | plans expecting accept or reject |
| wrong_data | Every verify read-back comes back with values altered. Ids, uuids and timestamps are kept. | plans with a verify read |

- A planted bug that was never applied, because its target call was not made, is **excluded** with that reason.
- A catch counts only when the agent's failing step is a call the plant changed: the failure has to point at the right flow.

## Composite score and gates
- **Composite score.** An ISO 25040-style weighted sum of the inputs, each normalised to 0–1:
  - F0.5: 25
  - DDP: 15
  - mutation score: 10
  - pass^k: 15
  - 1 − flaky rate: 10
  - time p90 (as max(0, 1 − p90 ÷ 300 s)): 10
  - cost (as max(0, 1 − $/run ÷ $1)): 5
  - DORA: 10
- **When an input cannot be measured yet** (DDP before escaped bugs arrive, DORA), it is **left out and listed**, and the score is re-weighted over what was measured. It is never treated as 0 or 1.
- **Hard gates** fail the eval whatever the score. Defaults: precision (real) ≥ 0.85, pass^k ≥ 0.90, flaky rate ≤ 0.05. A gate on an unmeasured metric reports **unknown**, not pass. The command exits 1 when a gate fails, so CI can stop on it.

## Escaped bugs (DDP, leakage)
- **File:** `prototype/data/eval/escaped-bugs.json`, a list of `{id, source, title, foundAt, linkedBug?}`. See `escaped-bugs.example.json`.
- **A bug that escaped** is one found later (for example a HubSpot ticket) that is not linked to a bug on the sheet.
- **Until that file exists,** DDP and leakage say "waiting for escaped bugs". They are not estimated.
- **Privacy:** the file holds support-ticket content, so it is git-ignored. Titles must carry no personal data.

## Labels and plan identity
- **History belongs to a plan, not a case id.** A case recompiled into a different plan starts with no history. Plans are matched by a hash of their setup, act, verify and expected outcome. Matching by case id once let a stored plan that had never run borrow the passes of an earlier, different plan.
- **Traced labels** live in `prototype/data/eval/labels.json`, with the reason and who settled them. They override history, can be pinned to one plan hash, and can be added with `POST /api/eval/label`.
- **A report on an unlabelled case** is listed under *unlabelled reports* for a person to settle. It never counts towards precision or recall until it is labelled.

## Limits, stated
- Known bugs come only from cases a stored plan can re-check. The *bug re-check coverage* metric shows how many of the sheet's bugs that is.
- Clean controls are few until more stored plans have a clean history. Every metric shows its n, so a small sample is visible.
- Planted bugs are injected at the API layer. They measure whether a plan's checks would notice; they say nothing about screens.
