# 4. Make new automation — close the gap between "written" and "runs"

A case that cannot run is not a failure of the case; it names a capability the platform lacks. The compiler says
exactly which: every stored plan (`prototype/data/compiled-plans/ui-text/<id>.json`) carries `coverage`
(full / partial / none) and `gaps` (what no step could do). Closing gaps is counting them, building the missing
capability in the right layer, proving it live, recompiling only what it affects, and measuring.

## 4.1 The method

1. **Count.** `npx tsx scripts/gap-census.ts` (sourcing-side families; `--all` adds the PRD roadmap). Each gap is
   sorted into the kind of fix that closes it; "alone" = cases this kind ALONE holds back (fixing it makes them full).
   `--theme <key>` lists them. Keep the baseline: `--out data/gap-close/census-baseline.json`.
2. **Read before building.** Read 20–40 gap texts of the theme. Many "gaps" are not missing steps:
   - a real step whose description never told the compiler it can do this (set_sheet_cell could pick a dropdown
     option; its text did not say so → 92 cases called "no step targets the delivery location");
   - a compiler rule that is out of date ("no step changes a company setting" — while the runner had switched
     settings safely for weeks → ~130 cases);
   - a label the product renders but the curated label list lacks ("Ok", "Increase Event Time" → ~145 cases);
   - a start state built smaller than the case states (one bid where the sheet's set-up says A 100 / B 90).
   Fix those first: they are cheap and they are most of the numbers.
3. **Pick the layer** (4.2) and build the smallest thing that closes the theme for every case of that kind — never a
   special case for one id.
4. **Prove it live** on PROCOL DEMO: build the state / run the step once and read it back (API + SELECT).
5. **Recompile only the affected cases**: snapshot their plans (`data/gap-close/before/`), then
   `npx tsx scripts/night-compile.ts --ids <list> --stale --workers 4` (≤ 6 in flight: the gateway rate-limits). A
   vocabulary edit makes every stored plan stale (the cache key includes planner.ts / steps.ts / plan-catalog.json
   mtimes) — publish the catalog (`dump-plan-catalog.ts`) BEFORE recompiling, or the compile reads the old words.
6. **Measure**: `gap-census.ts --compare data/gap-close/census-baseline.json`, and read a sample of the new plans: the
   gap must be gone because a step now does it, not because the model stopped mentioning it.
7. **Run a few in the browser** (night-ui-run `--ids` or Test sheets) and re-read every Fail.
8. **Record** the trap or fact you learnt (memory + the file's own comment, dated).

## 4.2 Fix kinds and exactly where they go

### a. A label the product renders (theme `labels`)
- `procol-ui-tests/scripts/scan-dashboard-labels.ts` reads procol-client-dashboard at a ref (read-only `git show`):
  JSX text, UI props (title, label, placeholder, okText…), toasts, `|| "Ok"` fallbacks, `src/translations/en.json`.
  Output `src/plan/generic/sourceLabels.json` (4,987 strings at fe-main-uat-test a40cdf1489).
- `dump-plan-catalog.ts` publishes them as `sourceLabels`; the planner's guard (`labelGuesses`) accepts them on an
  EXACT normalised match only (a substring test over thousands of strings would let any word through). They are not
  put in the prompt (the curated `labels` per screen stay the prompt's list).
- Labels found on live screens are learnt automatically (`labels.seen.json`).
- A label the product never renders stays a guess ("Revise" — correctly).

### b. A step's description or a compiler rule (the step exists; the compiler does not know)
- Step descriptions: `procol-ui-tests/src/plan/steps.ts` (`purpose`, `args`) → `dump-plan-catalog.ts`.
- Compiler rules: `prototype/src/agents/planner.ts` — `GENERIC_RULES`, `preparedRules`, `shapeRules`.
- Gaps the model keeps listing although the plan has the step: add a rule to `resolveCoveredGaps` — it drops a gap
  ONLY when the plan holds the very step that does it, and says so in the warnings.

### c. A new plan step (theme names a real missing action or check)
1. `procol-ui-tests/src/plan/steps.ts` — `{ name, purpose, args, assertion? }`. The purpose is the compiler's only
   documentation: say when to use it, when NOT, and what it proves.
2. `procol-ui-tests/src/plan/runPlan.ts` — a `case "<name>":` in the executor. Return a sentence of what it saw;
   throw `could not tell: …` / `not checked: …` when the screen gave nothing to judge (→ Couldn't tell, never Fail);
   throw a plain sentence when the product contradicts the case (→ Fail with evidence); tag a product refusal `[product]`.
   Prefer a page object in `src/pages/` for anything reused.
3. Words for reports: `prototype/src/agents/journeyCases.ts` (`stepWords`, `expectedWords`).
4. `npx tsx scripts/dump-plan-catalog.ts`; a selftest beside the step family when it reads a screen
   (`src/plan/*Selftest.ts`, `generic/selftest.ts`).
5. Run one case live that uses it before recompiling the theme.

### d. A start state the API builds (theme `start-state`)
1. The journey can do it? `prototype/src/checks/eventJourney.ts` options (`lineItemCount`, `quantity`, `bidPrices`,
   `extraBidders`, `alsoInvite`, `stageBody`, `fromPr`, `startDelaySec`…). Add an option there if not.
2. `prototype/src/ui/uiSetup.ts` — the `UiState`, its `PREFIX` (the journey step it stops after), who bids
   (`TWO_BIDDERS`, `WANTS_SECOND_VENDOR`), window length, what goes into `values` (read back for `expect_api_value`).
3. `prototype/src/checks/sheetCases.ts` — how a case names it: `SETUP_EVENTS` (the sheet's set-up cases, with their
   `shape`), `stateFromWords`, `shapeFromWords` (line count, quantity, each vendor's price, from the words).
4. `prototype/src/agents/planner.ts` `preparedRules` / `shapeRules` + `src/agents/screenModel.ts` `VALUE_KEYS` — tell
   the compiler what exists, so it asserts it instead of calling it a gap.
5. `scripts/night-compile.ts` passes the same `prepared` (state, screen, shape) as the runner — keep them identical.
5b. **The executor's screen table**: `procol-ui-tests/src/plan/screens.ts` — every screen lists the lifecycle states it
   opens on; a new state must map to one in `BASE_STATE` (`screenState()`), or `open_prepared` refuses it with
   "automation needs update". (12 Nov: none of the ten states added on 10 Nov were in it — every case on them would
   have stopped at step 1; found only by running one live. Compiling is not proof; running is.)
6. Build it once live and read it back (12 Nov: `closed_two_bids`, 10 units, QA Vendor 1 at 100, QA Vendor 2 at 90 —
   341 s, values bidPrice 100 / bidPrice2 90 / bidders 2).

### e. A company setting (theme `settings`)
- The plan step `require_setting{key | phrase, value}`; the runner switches it (Configs Needed and the stored plan's
  steps before the case; a fresh plan's inside `runUiCase`) through `withSettings` and tells the executor what it
  applied (`UI_SETTINGS_APPLIED`); the executor never pretends a setting it was not given.
- A key the catalogue does not have is looked up by its words (`settingsFor`); a hidden setting is Blocked; a setting
  the app refuses per company goes to `config/setting-blockers.json`.
- The case's Configs Needed is in the text the compiler reads, so it writes `require_setting` instead of a gap.
- A plan tier (Growth, Enterprise) or another company is not a setting.

### f. Test data from another company (theme `test-data`)
- `prototype/config/test-data-map.json` per company: `{from, to, why, checked}` — only after a SELECT shows the
  company's own value. `sheetCaseProse` applies it and appends "Test data mapped to this company: …".

### g. Things that must stay honest gaps
Another person's session (approver, planner, assignee's bell), a mailbox, the mobile app, a phone — the step is
`ask_tester` / the case Blocked with the exact text a person checks, until the capability exists for real (identity
vault, mailbox reader: `gap-backlog.md`). Never mark these covered.

## 4.3 Honesty rules for coverage

- A gap disappears only because a step in the plan does it (`resolveCoveredGaps` names the step).
- A compile the model did not answer (`source: fallback`) never replaces a stored real plan (night-compile keeps it).
- The guard's verdict on labels is deterministic; the model's own label doubts are re-judged by it.
- After a recompile, read the new plans of a sample: right step, right args, nothing asserted that the state lacks.
- A case made runnable is not a case that passes: run some, and re-read every Fail. (12 Nov: of two newly "full"
  cases run live, one was rightly Blocked by a hidden setting and one reached a compiler choice the screen does not
  offer — Couldn't tell, never a bug. Compile → run a sample → read → fix the vocabulary → recompile.)

## 4.4 Worked example — 12 Nov 2026 (branch gap-close)

Census of 1,799 sourcing-side compiled cases: 633 full / 1,070 partial / 96 none. Biggest fixable kinds: labels 147,
settings 128, start-state 123, test-data 92. Built:

- **Labels**: `scan-dashboard-labels.ts` (4,987 product strings) + exact-match guard.
- **Settings**: `require_setting` step + runner/executor wiring + the compiler rule replaced + Configs Needed in the
  compiler's text + key validation against the catalogue.
- **Test data**: `set_sheet_cell` described as the dropdown picker it is; `test-data-map.json` ("Default Variant" →
  "Variant 1" on DEMO).
- **Start state**: `closed_two_bids` + per-bidder prices + the case's shape from its words; the sourcing set-up events
  SRC-SET-002/003/004 carry A 100 / B 90 / 10 units → 332 cases start from the event they describe.
- **Recompiled** the 602 affected cases (868 compiles incl. ids shared across derived sheets; 57 min, 4 workers):
  before 0 full / 552 partial / 50 none → after **193 full / 382 partial / 27 none**; 221 moved up (39 had been
  unrunnable), 16 moved down — each re-read: the model now (correctly) says no step covers the subject (Dutch /
  knockout / sealed-bid strategies, a blacklisted vendor, a three-vendor split) instead of a vague partial.
- **All sourcing-side cases** (1,799): full 633 → **826**, none 96 → **73**, partial 1,070 → 900. By kind: settings
  128 → 24, test data 92 → 19, labels 147 → 78, start state 123 → 61, negotiation 46 → 32.
- **Live proof** on PROCOL DEMO: `closed_two_bids` built (A 100 / B 90, 10 units, read back); a plan on it opened
  Master QCS, Start Awarding, allocated to vendor 2 (1/1 items, Awarded Vendors 1/2, Proposal ₹900 = L1). Running it
  found a bug compiling never would: the executor's screen table refused every new state (5b above).
- **Award split** (`allocate_award{vendor, quantity}`, `expect_award_counters{proposal}`): built from the live grid —
  "Qty Awarded" row per line, a column per vendor; the app refuses a tick that puts a line over its requested quantity
  ("You cannot select bid with more than requested quantity."), so the quantity is typed before the vendor is ticked.
- Files: `data/gap-close/result.md`, `census-baseline.json`, `targets.json`, `before/`, `recompile.log`, `probe-award*.log`.
