# QA Agent Bench

spine.ai's browser agent run against [QA Agent Bench](https://qa-agents-bench.com/): 161 browser challenges on public copies of real sites, published by Endorphin. The bench is the measuring stick; every improvement it prompted went into the general executor and compiler (`procol-ui-tests/src/plan/generic`, `prototype/src/agents/planner.ts`), never into the scorer or a page-specific branch, and each is guarded by `procol-ui-tests/src/plan/generic/selftest.ts` so it also holds on Procol.

`bench.json` is the bench's own challenge index, downloaded on 2026-10-29.

## How it runs

1. **Compile** (`prototype/`): each challenge's goal and steps go to spine's compiler in site mode (`compileTestCase(…, { site })`). Site mode offers only the generic steps and leaves out Procol's rules, memory, labels and lint repairs. The compiler never sees `passWhen`.
2. **Run and score** (`procol-ui-tests/`): each plan runs in a fresh browser context through the same `runPlan` executor the Procol cases use. A separate scorer reads the final page (every tab and frame, shadow DOM included) and the saved downloads, and grades them by the bench's rules: the task's last "Verify … is visible" text must be on screen, or the file check must hold. It doesn't consult spine's verdict, except where the bench grades what the agent reports (must-refuse challenges, H-11, H-13).

```
cd prototype && npx tsx scripts/bench-compile.ts ../bench/qa-agents-bench/bench.json ../bench/qa-agents-bench/run-1
cd procol-ui-tests && APP_URL=https://qa-agents-bench.com npx tsx scripts/bench-run.ts ../bench/qa-agents-bench/bench.json ../bench/qa-agents-bench/run-1
```

Both steps resume: plans and results that already exist are kept. To re-run a challenge, delete its file. Pass a comma-separated id list to run only those challenges. `BENCH_WORKERS` (default 4) and `BENCH_CAP_MS` (default 180000, the per-challenge cap) tune the run.

Each run directory holds `plans/` (compiled plans with coverage and gaps), `results/` (one verdict per challenge, with the agent's reason and an accessibility snapshot of the final screen when it failed), `downloads/` and `summary.json`.

## Reading a failure

- `npx tsx scripts/bench-inspect.ts /sandbox/r-15/ "hover=TV Shows" "clickrole=button:Next"` — open a page, act, print the accessibility tree after each action (`eval=<js>` prints a value).
- `npx tsx scripts/bench-find.ts /sandbox/h-11/ '{"role":"row","name":"Q3 $4.8M","within":"2025 results"}'` — ask the executor's finder what strategy matches a target, and what a `within` region resolves to.

Both live in `procol-ui-tests/scripts/` and take `APP_URL` (default the bench).

## Scores

| Run | Score | What changed |
|---|---|---|
| run-1 (2026-10-29) | 70 / 161 (43%) | Baseline: generic steps as they were for Procol. |
| run-3 | 122 / 161 (76%) | Tolerant text matching, named regions, frames, tabs, downloads, drag, dialogs, covered-element fallback, custom selects, label resolution. |
| run-4 | 143 / 161 (89%) | Menu-first match ordering, closing covers, hidden radio/checkbox labels, label-aware field resolution, `pick_date`, spinners, virtual-scroll fix, pagination. |
| run-6 | 158 / 161 (98%) | Bounded element reads (a re-rendered control no longer costs 30 s per read), `choose_by_number` (read the numbers on screen, press the lowest/highest, across pages), `url_on_screen`, steppers (− n +), `toggle only:true`, mouse/keyboard press for never-stable or backdrop-covered controls, declining a promo that appears mid-flow and re-opening what it closed, words-in-any-order labels, tab-panel priority. No false passes; 18/18 must-refuse handled. |
| run-demo2 (2026-10-30) | 158 / 161 (98%) | The same plans as run-6 on the `demo` branch after the 30 Oct integration (Aanya's and Animesh's work merged with the bench executor). Four merge regressions found and fixed by this run, all Procol-only behaviour that had leaked onto other sites: the pre-step pop-up dismissal, the search-box Enter, the spotlight photo per action (it closed autocomplete and date pop-ups), and `go_to` refusing a bare path. The same three challenges are out of reach as in run-6. |

Leaderboard rows (the vendor's own runs) sit at 91–94%. The three left are out of reach for a compile-then-run agent by design: a button that exists only as CSS pseudo-content inside nested shadow roots (H-03), a visual "tallest bar" judgement (H-13), and a comparison of two values that live on two different product pages (S-06).


## 31 October — a fresh one-shot compile, and what the parallel run taught

Slingring's budget was raised, so every challenge was compiled again from scratch (`run-fresh`: 161 plans,
all from `HACK26_GPT_6_ASTRA`, no fallback). Run with the executor as it stood on 30 October:

| run | score |
|---|---|
| 4 browsers, machine busy (another spine server held half a core) | 132/161 (82%) |
| same plans, 1 browser | 147/161 (91%) |

The 15-point gap between the two was one cause: the bench's pages are server-rendered (Next.js), and under
CPU load the executor pressed buttons **before React had attached their handlers**. Playwright reported
the click; the page did nothing — or React replayed the queued clicks against stale state, so two
"Next page" presses moved the pager one page (H-10). The fix is generic (`generic/ready.ts`
`hydrationState` / `interactive`): the framework marks every element it has taken over (React: a
`__reactFiber$…` property), so `go_to` waits for the page's controls to be live, and every action waits
for its own element to be, before pressing. A self-test page that hydrates late proves it.

The 11 one-shot losses against run-6's iterated plans were 8 weaker step choices by the model and 3
flakes. Each got a generic answer in the executor (`within:"table"` and "the only row left in the table"
resolve to the table and a list still being filtered is given time to settle — T-04; a field named by
part of or an abbreviation of its label, "Min price" for "Minimum price" / "$ Min" — S-01; a select
whose option is a tab beside it — R-34; `pick_date` on a dropdown of dates — D-10; `choose_by_number`
with `measure:"date"` for "the first available date after 15 November" — D-04; `attempt` on a site
refuses when one name sits on two different controls — G-025) or in the compiler (the rules for those
shapes, and a site lint that drops a check on the control an attempt just found refused — G-R37, and
folds args the model wrote beside the step — S-01). All guarded in `generic/selftest.ts` (50 checks).

Same Slingring plans (plus the deterministic lint) through the fixed executor:

| run | score |
|---|---|
| 4 browsers | 154/161 (96%) |
| 1 browser | 154/161 (96%) |

No execution flake is left between the two. The seven failures are the three out of reach (H-03, H-13,
S-06) and four the **compiler rules** answer (D-04, G-025, R-35 compile to the right shape now; H-20's
"two equally good Remove buttons" stays a judgment the executor's first-match policy does not make) —
but Slingring's budget ran out again 15 plans into the recompile (the first full compile cost ≈ $100 of
the $250), so the rest of `run-fresh2` came from the free fallbacks (Gemini / Groq) and is not a
Slingring number. Its D-04 and G-025 plans do pass through the new steps; R-35 stops at the attempt.
A fresh Slingring compile under the rules is the next measurement when the budget allows: the ceiling
is 157/161 (98%).

Scorer note: G-018 ("Toast that disappears after 1.5 s") is now graded on the agent's own check, as the
bench's rule for it says ("every step passes, including the last check") — the page read after the run
is too late for a toast that lives 1.5s. The 30 October runs read it in time by luck of timing.

Run serially (`BENCH_WORKERS=1`) whenever anything else is using the machine; the per-challenge timings
(`summedChallengeMs`) are only comparable between runs made the same way.
