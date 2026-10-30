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

Leaderboard rows (the vendor's own runs) sit at 91–94%. The three left are out of reach for a compile-then-run agent by design: a button that exists only as CSS pseudo-content inside nested shadow roots (H-03), a visual "tallest bar" judgement (H-13), and a comparison of two values that live on two different product pages (S-06).
