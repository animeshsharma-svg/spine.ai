# Prompt for Aanya's Claude — day 4 onward: one branch, cases that actually run (paste everything below the line)

Written by Animesh on 18 Nov 2026. The day-2 brief (`docs/Prompt_for_Aanya_Day2_2026-11-13.md`: owners, §3 contract, §4 questions, §9 stand-up format) and the day-3 brief (`docs/Prompt_for_Aanya_Day3_2026-11-16.md`: what is live, answers to your asks) still stand. This one changes the branch rules (§7 of day 2 is replaced by `docs/ONE-BRANCH-PLAN-2026-11-18.md`) and fixes how PRD cases are executed.

---

You are the Claude working with Aanya on spine.ai, Procol's QA platform. Read `docs/ONE-BRANCH-PLAN-2026-11-18.md` first, then this.

## 0. Why this brief exists

Three problems were named on 18 Nov: work is not synced between branches; a feature works on one server and not another; and PRD → test cases "goes in a loop doing the same things again and again" without testing the case, so nobody can tell what actually works. The plan file explains the causes (git-ignored per-machine state, five servers from five folders, two PRD engines, and cases being executed by typing them into the chat session). This brief is your part of the fix.

## 1. The branch rules from today (replaces day-2 §7)

- The trunk is **`demo` on the team repo** (`spine`, i.e. `https://github.com/animeshsharma-svg/spine.ai`). Animesh merges `rca-wt`, the home-upload work and your `aanya` branch into it today (18 Nov) — your three commits merge with one conflict he resolves (`runPlan.ts`, his file).
- When his stand-up says "`demo` holds everything (18 Nov)", restart your branch from it:
  ```
  git fetch spine
  git checkout -B aanya spine/demo
  ```
  Do **not** merge your old `aanya` into it; everything it had is already in `demo`. If something of yours is missing, name the file in the stand-up and he brings it.
- Every morning: `git fetch spine && git merge spine/demo`. Every evening: push `aanya` and write the commit hash in the stand-up; Animesh merges it into `demo` the same evening. A branch is never more than one day away from `demo`.
- **One server**: start it from the launch entry only, from your `demo`-based checkout, port 4320. Never from Bash. PROCOL DEMO (198678) remains the only company whose settings may be switched.
- **"Done" means three things in your stand-up line**: the commit hash, the run id (`sheet-…`, `session-…` or `plan-…`) on PROCOL DEMO, and the verdict line the platform printed. A screen that is built but has no run id is "built", not "done". This is how we stop guessing what works.

## 2. Per-machine state (why "it works on his and not mine")

These are git-ignored or untracked and never travel with a commit: `prototype/data/runs`, `data/hubspot`, `data/run-cases`, `data/prd`, `data/sessions`, `data/sheets`, `.local-rca`, `prototype/.auth`, `prototype/.env`. When a page on your machine shows nothing where his shows data, it is one of these, not the branch. Say which file or route is empty in the stand-up; he gives you the file or the database row. Never commit any of them.

## 3. PRD → test cases: write with your page, run with the sheet runner

Your `routes/prd.ts` stays the **writer** (rules R1…Rn, positive / negative / boundary / regression per rule, coverage per rule). From today it is no longer the **runner**:

- The Test cases tab executes a case by handing it to the chat session (`public/runCases.js` → `window.spineSession.runCase` → `POST /api/session/reply`). The session treats the case as typed words: it plans a journey, runs it, and when a step cannot be reached it explores, asks on screen, waits for the deadline and plans again. That is the loop you saw. It is by design for a typed instruction and wrong for a test case.
- Animesh's home-upload engine (`routes/home.ts`, `checks/homeJobs.ts`, merged into `demo` today) runs a set of cases through the **sheet runner**: one fresh event per case, a fixed plan, one verdict (Pass / Fail / Not run / Couldn't tell, with the reason and a screenshot), and a report xlsx in the house format. No loop, because nothing re-plans.
- Your change (your files only): in `public/prd.js`, the Run buttons (all / happy flow / selected) stop calling the Test cases tab's queue and instead call `POST /api/home/job/run` with the set key (payload and reply are in the header comment of `prototype/src/routes/home.ts` once merged; until then build against this shape: request `{ id }` where `id` is the home job created by `POST /api/home/upload` with your cases as an xlsx in the 13 sheet columns; reply `{ job }`; progress from `GET /api/home/job?id=`; the report from `GET /api/home/job/report?id=`). If a field you need is missing, write the exact need in the stand-up and build against the mock meanwhile — do not edit `routes/home.ts`.
- Until the route is merged, the honest path for a PRD today is: export your cases from the Test cases tab as the 13-column xlsx, drop it on the Home page (or Test sheets), and let it run there. Record the `sheet-…` run id.

## 4. Track A (RCA) — same rule, no chat runs

- `RCA_Real_Bugs_v2.xlsx` runs only through Test sheets / the Home page (sheet runner). Its 27 "Not run" from 14 Nov were runner gaps; the day-3 brief lists which are closed (vendor-portal steps, 3 QA bidders built by the plan, save draft, two-stage with technical evaluation). Re-run the cases those cover and write the run id; leave lots and Admin template edits out.
- A Fail goes to the bug sheet only after the fairness re-read against the screenshots and a repeat on a second fresh event (your 14 Nov rule, kept).
- The HubSpot replays are Animesh's (`npm run hubspot:reproduce`, API, no browser). Today he replays the remaining 93 open-defect cases; the metrics page that proves "the platform catches tickets on its own" comes from that run and from the catalog. You do not run those.

## 5. Day 4 — in this order

1. Morning: branch from `demo` (§1) the moment his stand-up says it holds everything. Start :4320 from the launch entry. Confirm in the stand-up that `#/s` lists sessions against the real routes, with one session id.
2. Flip Sanity and Cases to the real routes (your day-3 items) and record one `session-…` id where Sanity ran on PROCOL DEMO.
3. `prd.js` Run → sheet runner (§3). Prove it with one PRD (the RFQ PRD is on disk in his checkout; ask for the file if yours lacks it): the stand-up line is the PRD name, the number of cases written, the `sheet-…` run id, and the tally the report shows.
4. Track A re-run of the cases the closed runner gaps unblock (§4), with you on screen for the questions.
5. Evening: push `aanya`, write the stand-up in the §9 format with the three "done" things per item, and list under "Needs Animesh" every route field or data file you were missing, with the exact name.

## 6. What not to do

- Never edit `prototype/src/**`, `procol-ui-tests/**` or `prototype/data/**` (his), nor `public/runCases.js` and `public/session.js` (the older chat route's files). Ask in the stand-up instead.
- Never run a test case by typing it into the session. Never start a server with Bash. Never commit `.env`, `.auth`, runs, findings, ticket content or RCA workbooks. QA vendors only; never GMMCO; mask OTPs and secrets.
- Never merge your old `aanya` into the new one, never rebase, never force-push, never delete a branch.
