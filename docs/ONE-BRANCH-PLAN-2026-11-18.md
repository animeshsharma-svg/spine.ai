# One branch, no confusion — the merge plan (18 Nov 2026)

Written by Animesh's Claude on 18 Nov 2026 after measuring every branch, worktree and uncommitted file on this Mac and on the team repo (`spine`). Numbers below are from `git rev-list`, `git merge-tree` and `git merge-file`, not from memory.

## 1. The finding: the work is less scattered than it feels

`rca-wt` (commit `0802c0bd`, pushed to `spine/rca-wt`) already **contains every commit** of `animesh`, `spine/animesh`, `gap-close`, `night/api-vocab`, `night/start-states`, `night/ui-vocab`, `vendor-bulk-upload` and `spine/demo` (all 0 commits ahead of it). Only two things are outside it:

| Where | What is outside `rca-wt` | Size |
|---|---|---|
| `spine/aanya` | 3 commits: guided-session frontend on the mock (day 1), the question card + drawer + `rca-build-v2-cases.py` + PDF parser (day 2), and her merge of `spine/rca-wt` on 16 Nov | 19 source files, 4,057 lines; **1 conflict** (`procol-ui-tests/src/plan/runPlan.ts`, one 20-line hunk in `fill_sheet`) |
| `/Users/animesh/Desktop/procol` (branch `animesh`, the other chat's checkout) | **uncommitted**: the homepage upload (PRD / sheet / both → cases → run → report xlsx: `routes/home.ts`, `checks/homeJobs.ts`, `checks/prdDocs.ts`, `agents/prdCases.ts`, `agents/caseUnderstanding.ts`, `public/homeUpload.js`), plus edits to `sheetRunner.ts`, `sheetCases.ts`, `eventJourney.ts`, `ai/llm.ts`, `server.ts`, 12 `test-cases/build-*.py` builders, 8 knowledge screens, docs | 232 files differ from `rca-wt`, 63 new; **8 conflicts** in 4 files (`sheetCases.ts` 2, `sheetRunner.ts` 3, `llm.ts` 2, `home.css` 1) |

Two more uncommitted piles live in worktrees that are otherwise fully inside `rca-wt`:

| Worktree | Uncommitted | Conflicts with `rca-wt`'s working copy |
|---|---|---|
| `procol-rca-wt` itself | 109 files: in-principle-approval runner (`ipaStates.ts`, `ipa-setup.ts`, `qaIdentities.ts`, `procolIds.ts`), sheet runner and journey edits, `runPlan.ts`, the IPA / RCA xlsx reports | — (it is the target) |
| `procol-gap-wt` (`gap-close`) | 2,755 recompiled plans under `data/compiled-plans`, `vocabulary-gaps.json`, 3 source files, 24 `_probe` scripts | **1** (`matrixVendors.ts`) |

`spine/main` is a **separate history** (a squashed import from 3–4 Oct, no common ancestor with `rca-wt`). It is not behind; it is a different root. It is replaced, never merged.

So "everything in one branch" is: commit three uncommitted piles, merge Aanya's three commits, resolve ten conflict hunks in total. Half a day, not a week.

## 2. Why things "work in one branch and not another"

It is mostly not the code. It is state that git never carries:

1. **Per-machine data that is git-ignored or untracked**: `prototype/data/runs`, `data/hubspot` (tickets, plans, the export), `data/run-cases`, `data/prd`, `data/sessions`, `data/sheets`, `.local-rca`, `prototype/.auth`, `.env`. A feature "works on demo" because demo's folder holds the runs, tokens and compiled plans it needs. A fresh clone of the same commit has none of them.
2. **Five servers from five folders** (`.claude/launch.json`): 4300 main checkout, 4310 the bench, 4320 `procol-rca-wt`, 4330 upload test, 4335 `procol-gap-wt`. Each serves its own folder's code and data. "It works on :4320 and not :4300" means the folders differ, not the branch.
3. **The spine database** (`SPINE_DB_URL`) is set on none of the `.env` files here today, so every server reads the JSON files. When one machine has the database and another does not, the same page shows different tickets and runs.
4. **Two PRD → test-cases engines were built in parallel**: Aanya's `routes/prd.ts` (writes cases into a run-cases set, which the Test cases tab runs by *typing each case into the chat session* — `session.js runCase → /api/session/reply`), and the other chat's `routes/home.ts` (writes cases, then runs them through the **sheet runner** with a fresh event per case and a report xlsx). The loop Aanya sees ("does the same things again and again") is the first path: a case typed into the session is re-planned as a journey on every turn, and when the planner cannot reach a step it explores, asks, waits for the deadline and plans again. The second path has no loop because the sheet runner executes a fixed plan per case and records one verdict.

## 3. The decision

- **One trunk: `demo` on the team repo** (`spine/demo`). Everything merges into it; the demo and Aanya both run from it. `main` stays untouched until the senior is told, then `demo → main` by one pull request (unchanged from the day-2 brief, §7).
- `rca-wt` becomes `demo`'s content today (fast-forward after the merges below); from tomorrow `rca-wt` and `aanya` are **short-lived**: branch from `demo` in the morning, merge back the same evening. No branch older than a day.
- **One PRD engine**: the homepage upload (`/api/home/*`, sheet runner). Aanya's `routes/prd.ts` page stays as the *writer* of cases (rules R1…Rn, coverage per rule), but its Run button hands the set to `/api/home/job/run` (sheet runner), never to the chat session. This removes the loop and gives every case the same verdict shape as a Test sheet run.
- **One server per person**: Animesh :4320 from `procol-rca-wt` today, then from the `demo` worktree; Aanya her own :4320 from her `demo` checkout. The other three launch entries (4300 / 4310 / 4330 / 4335) are deleted once their folders are merged.
- **The two other worktrees close**: `procol-gap-wt` and the main checkout's other chat commit their piles, merge, and are removed with `git worktree remove`.

## 4. The steps, in order (about half a day; nobody loses a line)

> **Executed 18 Nov 2026, 11:00–12:30.** Steps 1–5 are done; `spine/demo` = `rca-wt` = d4c95414 (a fast-forward of the old demo 4c16953a). Step 1: 47c6273a. Step 2: the main checkout committed on `animesh` as 7b4e989a (a bug-sheet xlsx slipped in and was taken out again within the minute by amending that just-pushed head) and merged as 6c58ea03 with the 8 hunks resolved as §4 says, plus two notes files concatenated and the generated ledgers kept from rca-wt. Step 3: f7b2e79f merged as 7a706ed2 (newer compiles win; vocabulary-gap ledger = union of both sides, 9,426 needs; the QA-vendor workspace rule keeps the config list and the per-run env override). Step 4: merged as d4c95414, `fill_sheet` keeps the 17 Nov side. Typecheck and `hubspot:unit` (32 pass) green after each merge. Step 6 remains, by hand.

Every step ends with a push, so the other person can see it. Nothing is rebased, nothing force-pushed, no branch deleted until §5.

**Step 1 — `procol-rca-wt` commits its own pile (Animesh's Claude, this session).**
```
cd /Users/animesh/Desktop/procol-rca-wt
git add prototype/src prototype/scripts prototype/config procol-ui-tests/src procol-ui-tests/scripts "procol test/src" test-cases/*.py test-cases/*.md docs
git commit -m "In-principle approval runner, sheet runner and journey edits, IPA/RCA reports"
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push spine rca-wt
```
(The xlsx reports and `test-cases/.bug-sheet-img` stay local, as the rules say.)

**Step 2 — the other chat commits the main checkout (in that chat, on branch `animesh`).** Ask it to run, in `/Users/animesh/Desktop/procol`:
```
git add prototype/src prototype/public prototype/knowledge prototype/config test-cases/*.py test-cases/*.md docs .claude/launch.json
git commit -m "Homepage upload: PRD / sheet / both → cases → sheet run → report"
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push spine animesh
```
Then, back here: `git merge spine/animesh` into `rca-wt`. Expect the 8 hunks in §1 (`sheetCases.ts`, `sheetRunner.ts`, `llm.ts`, `home.css`). Rule for each: the newer dated comment wins; where both sides added a function, keep both. Run `npx tsc --noEmit -p prototype` and `npm run hubspot:unit` before committing the merge.

**Step 3 — `procol-gap-wt` commits and merges (this session).** `git -C /Users/animesh/Desktop/procol-gap-wt add -A prototype/src prototype/data/compiled-plans prototype/data/vocabulary-gaps.json && git commit`, push `gap-close`, merge into `rca-wt` (1 hunk, `matrixVendors.ts`). The 24 `_probe` scripts are deleted, not merged.

**Step 4 — Aanya's branch (this session).** `git merge spine/aanya` into `rca-wt`: one hunk in `runPlan.ts` `fill_sheet` — keep the `rca-wt` side (17 Nov, `completeRequiredCells` + range cells) and drop the older 6 Nov block, because the newer one already does what the older one was for. Her `routes/prd.ts`, `converse.ts`, `tokenClients.ts` (Decathlon sign-in) and the three session-guided files merge clean.

**Step 5 — `rca-wt` becomes `demo`.**
```
git checkout demo && git merge --ff-only rca-wt   # or: git branch -f demo rca-wt
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push spine demo
```
Aanya then does `git fetch spine && git checkout -B aanya spine/demo` and continues on top of it. The private mirror is pushed from Animesh's own terminal: `git push origin demo`.

**Step 6 — one `.env`, one data folder.** Copy `SPINE_DB_URL`, `SLINGRING_API_KEY` and the token names into the `demo` worktree's `prototype/.env` by hand (never committed). Point every launch entry at that one folder. The ignored data folders (`runs`, `hubspot`, `sessions`, `run-cases`, `prd`, `sheets`) are copied once from `procol-rca-wt` into the `demo` worktree; after that only the database and that folder hold state.

## 5. The rules that keep it in one branch

1. **Morning**: `git fetch spine && git merge spine/demo` into your branch. **Evening**: merge your branch into `demo` and push. A branch that is not merged by evening is written in the stand-up with the reason.
2. **Owners stay as in the day-2 brief** (Animesh: `prototype/src/**`, `procol-ui-tests/**`, `prototype/data/**`; Aanya: `session-guided.*`, `session-mock.js`, `test-cases/rca-*`, `.local-rca/*`). A conflict in an owned file is resolved by its owner; the other person re-applies their one-line change.
3. **"Done" means three things in the stand-up line**: the commit hash on `demo`, the run id (`plan-…` / `sheet-…` / `session-…`) on PROCOL DEMO, and the verdict line the platform printed. A feature without a run id is "built", not "done".
4. **One run engine per kind of input**: typed words → the session (journeys); a sheet or a PRD → the sheet runner (`/api/home`, `/api/sheets`); a ticket → `hubspot:reproduce`. Nothing runs a test case by typing it into the chat.
5. **No new worktree without a launch entry and a close date.** Worktrees are for a night run or a demo freeze, closed with `git worktree remove` the next day.
6. **The ignored folders are state, not code.** When a page needs a file in `data/`, the stand-up names it, so the other machine can be given the same file or the database row.

## 6. What this fixes for the three problems named on 18 Nov

- *"Many things are not synced."* After §4 there is one branch and one folder per person; the per-machine state is named (§2.1) and copied once (§4 step 6).
- *"Some things work on Aanya's branch, some on mine, some on rca-wt, many on demo."* `rca-wt` already holds `demo` and `animesh`; after steps 2–4 it also holds the home upload, the gap-close plans and Aanya's screens, and it *is* `demo`.
- *"PRD → cases runs in a loop and never tests the case."* The cases run through the sheet runner (§3), where each case gets one fresh event, a fixed plan, one verdict and a screenshot, and the report says Pass / Fail / Not run / Couldn't tell with the reason.
