# spine.ai benchmark — 22 October 2026

Everything measured, on the real product (Procol UAT, company PROCOL DEMO), with the sample size
and a 95% Wilson interval beside every proportion. Every number here can be recomputed from the
report named next to it (`prototype/data/eval/reports/`, `prototype/data/evals/results/`).
Definitions: `docs/METRICS.md`.

> Status: sections marked ⏳ are being re-run at the time of writing (the first overnight pass
> hit a network outage on the Mac between ~05:30 and ~12:00 IST; those results are discarded).

## 1. What the benchmark covers

| Layer | Question | How it is measured | Report |
| --- | --- | --- | --- |
| Reading the test case | Does the compiler turn a typed sentence into the right steps, and refuse what it cannot test? | 66 stress prompts, compiled, judged for fidelity; trap prompts for honesty | `eval-prompts` ⏳ |
| Performing the right test | Does the run exercise the asked flow and check the asked outcome? | the same 66, run in the browser, judged on the executed steps | `eval-prompts --run` ⏳ |
| Product knowledge | Does the memory return the right fact first? | 110 questions with known answers, hit@1 / hit@5 / MRR, deterministic | `eval-memory` ✅ |
| Recognising a case | Is a typed case matched to the catalog case it already is, or flagged new? | 112-row labelled corpus (paraphrase, typo, Hinglish) | `eval-matcher` ✅ |
| Orchestrator: routing | Is a free-text instruction routed to the right journey? | 102 labelled instructions | `eval-routing` ✅ |
| Orchestrator: planning | Is a compiled plan statically runnable (steps exist, order the product enforces)? | 15 catalog cases (cost cap) | `eval-planner` ⏳ |
| Orchestrator: running | Pass rate, step reliability, time to verdict, app refusal vs automation stop, self-repair, pictures | every browser run kept since 20 Oct | `eval-orchestrator` ✅ |
| Bugs it finds | Precision on real bugs, recall of known bugs, planted-bug catch rate, repeatability, flakiness | the agent eval (k = 3, planted bugs) | `eval-agent` ⏳ (rerun) |
| Bugs it writes | Are the bug reports complete, clear, reproducible, fixable? | 86 verified bugs, measured + a developer-judge | `eval-bug-reports` ✅ |
| Test cases it writes | Relevance, coverage, coherence (QA-Bench v0's three) | 46 screens / 336 cases, LLM judge + measured coverage | `eval-qabench` ✅ |
| Against production | Would it have caught what customers reported? | 115 RCA'd support tickets vs catalog, stored plans, bug sheet | `eval-prod-bugs` ⏳ |

## 2. Results

### 2.1 Product knowledge (memory) — ✅ `memory-bench-2026-10-22`
110 questions; **hit@1 71.3%, hit@5 87.0%, hit@10 90.4%, MRR 0.78**. By kind: error codes 100%, client facts 100%, jobs 100%, visibility 100%, lessons 85.7%, access rules 80%, product model 77.8%, known bugs 70%, backend code 62.5%, services 50%, run experience 0% (the spine DB was unreachable, so the run track record was not in the store).

### 2.2 Recognising a typed case (matcher) — ✅ `bench-matcher`
All rows (n = 112): **recall 87.3%, precision 70.8%, top-1 84.5%, top-3 97.2%**; a genuinely new case recognised as new 93.3%; existing-vs-new decision 87.9%. Held-out test rows: recall 81.8%, precision 73.2%, top-1 90.9%.

### 2.3 Routing a free-text instruction — ✅ `bench-routing`
**102/102 (100%)** right journey; line-item and template extraction 100%; caveat precision 100% (12/12).

### 2.4 The orchestrator from the run record — ✅ `orchestrator-2026-10-21T21-38`
53 browser plans since 20 Oct: **plans passed 41/53 (77%, 64–87%)**; **steps that did what they should 622/634 (98%, 97–99%)**; time to verdict **p50 51 s, p90 86 s**; failed plans stopped at an app refusal 1, an automation fault 5, other 6; plans starting from an API-built event 7, from a fresh create 40, by searching the list 0; **1,915 spotlight pictures, 36 per plan**. The automation faults are the ones fixed on 21 Oct (invented vendor name, single-stage evaluator, two-stage schedule, BOQ items, counter offer on a surrogate bid).

### 2.5 The bugs it finds (agent eval) — ⏳ rerun in progress; first pass (22 Oct 00:01 UTC, partly in the outage)
31 cases, k = 3: precision on real bugs 4/6 (66.7%), recall 6/7 (85.7%), known-bug recall 4/5, planted bugs 2/2, pass^3 4/6, flaky 0/7, couldn't tell 15/37 (the outage), bug re-check coverage 6/86, verify depth 28/110. Composite 0.72. Gates: precision ≥ 0.85 fail, pass^3 ≥ 0.9 fail, flaky ≤ 0.05 pass.

### 2.6 The bug reports it writes — ✅ `bug-reports-2026-10-21T21-56`
86 verified bugs, 84 judged cold by a model acting as a Procol developer: **completeness 95%** of ten fields (steps, expected, actual, where, severity, kind, verification, date, test case); **clarity 4.65/5, reproducibility 3.31/5, actionability 3.90/5**; **fixable from the report alone 69/84 (82%)**. Weakest: reproducibility — the judge wants the exact event/template and the vendor's state spelled out in more reports.

### 2.7 The test cases it writes (QA-Bench v0's three) — ✅ `qabench-2026-10-21T21-23`
46 screens / 336 cases: **relevance 4.02/5** (38/46 screens ≥ 4), **coverage 1.70/5** (0/46), **coherence 2.89/5** (4/46); measured: the cases name 34% of the controls on screen and cite 11% of the untested code rules. Honest reading: relevance is strong (grounding gate), coverage is thin at 3–8 cases a screen, coherence needs prerequisites spelled out.

### 2.8 Reading the case and testing what was asked — ⏳ `eval-prompts` (rerun)
(filled when the rerun finishes: compile fidelity, honesty on trap prompts, run pass/fail, infra share, run fidelity, time to verdict)

### 2.9 Against production — ✅ `prod-bugs-2026-10-22T06-59`
115 RCA'd support tickets (Dec 2025 → Aug 2026), classified by a model from the CS and engineering descriptions, the triage checks and the RCA: **config 27 · real defect 25 · user error 25 · data 18 · unclear 14 · feature request 6**. Of the 25 real defects, **22 are in the events flow** (events 8, bidding 7, awarding 5, QCS 2); by class: state 5, calculation 4, validation 3, data 3, config 2, UI 2, visibility 1, permission 1.

| Of the 22 events defects customers reported | Share (95%) |
| --- | --- |
| A written case in the catalog is about it (same or partial) | **8/22 — 36%** (20–57%) |
| … exactly (a case asserting that behaviour) | 3/22 — 14% (5–33%) |
| A stored plan can re-check it today | **2/22 — 9%** (3–28%) |
| Already on the verified bug sheet (found by spine.ai on UAT first) | 1/22 — 5% (1–22%) — BUG-03 (surrogate prices accepted without technical participation) |

This is the honest ceiling of today's detection against production: the defects customers hit are mostly **awarding and QCS arithmetic** (awarded DDP/landed amount with global charges and zero-quantity awards, QCS totals, award e-mail using requested quantities, proposal totals) and **state after an edge action** (BOQ closed after a partial award, best-offer request past its deadline, rejected counter offers, a rejected bid deleting its technical score) — the same areas the coverage report (`docs/rule-coverage.md`) marks weakest and where runnable cases are fewest (every-bid-number 5/127, award outcomes 0/35). The 14 uncovered defect summaries are the next cases to write; each needs a multi-vendor, multi-charge awarding state that the API builder does not build yet.

## 3. Against the other platforms

What the others publish, and what this benchmark measures on the same axis. Sources opened on 22 Oct 2026.

| Platform | What they publish | Measured how | spine.ai on the same axis |
| --- | --- | --- | --- |
| [Canary QA-Bench v0](https://www.runcanary.ai/blog/qa-bench-v0) | Relevance 87.4, Coverage 84.5, Coherence 77.4 (0–100) | 35 PRs from 4 open-source repos, Opus 4 judge, outputs anonymised; no bugs actually caught; self-evaluated | Relevance 80, Coverage 34, Coherence 58 (our 1–5 ×20) on 46 screens / 336 cases, judge blind to execution, **plus** measured coverage, plus bugs actually caught (§2.5), planted bugs, repeat runs, false alarms |
| [Wavect's critique of QA-Bench](https://wavect.io/blog/canary-ai-qa-defect-detection/) | asks for planted bugs, clean controls, repeat runs, per-class results, infra failures separated | — | all five are in `eval-agent` (§2.5) |
| QA Wolf | "80%+ coverage", "zero flakes" (vendor claims, human-reviewed) | not benchmarked | flaky rate 0/7 measured; coverage stated as rules covered (62% of 3,713 code rules) |
| Momentic | "99% fewer false positives" (vendor claim) | relative to an unstated baseline | precision on real bugs 4/6 with the interval shown; false alarms named (API-EG-007, API-EVDTME-001) |
| Octomind | "99% test success rate", "78% fewer false positives" (vendor claims) | not benchmarked | pass rate 41/53 on real UAT runs, failures classified |
| Meticulous / Spur | no bug-detection or false-positive rates published | — | — |
| Browser Use / Skyvern (open-source browser agents) | WebVoyager 89.1% / 85.85% | general web-navigation tasks, each on its own task set | not comparable: a QA agent is measured on bugs found, not tasks navigated; our step reliability on the product is 98% (622/634) |
| WebProber (academic, [AI Agents for Web Testing](https://arxiv.org/pdf/2509.05197)) | 85% of reported bugs were false positives; caught 19/32 known bugs (59%) | 120 websites, manual ground truth | precision on real bugs 67% (4/6), known-bug recall 4/5; both with intervals |

Caveats we state ourselves: small n on the bug-level metrics (the intervals say so), one tenant, UAT not production, LLM judges for the writing-quality numbers (deterministic measures beside them wherever possible).

## 4. How to re-run everything

```bash
cd prototype
npx tsx scripts/eval-orchestrator.ts --since 2026-10-20     # instant
npm run eval:memory && npm run eval:matcher && npm run eval:routing
EVAL_LIMIT=15 npm run eval:planner
npx tsx scripts/eval-qabench.ts                              # 3 min, model
npx tsx scripts/eval-bug-reports.ts                          # 5 min, model
npx tsx scripts/eval-prod-bugs.ts                            # needs data/eval/prod/rca-triage.xlsx (never committed)
npx tsx scripts/eval-prompts.ts --run                        # 3–4 h, browser
npx tsx scripts/eval-agent.ts --k 3                          # 2–3 h, API, under caffeinate
```
