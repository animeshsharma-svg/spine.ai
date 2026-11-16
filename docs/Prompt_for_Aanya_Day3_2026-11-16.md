# Prompt for Aanya's Claude — day 3 onward (paste everything below the line)

Written by Animesh on 16 Nov 2026 after reading Aanya's day-2 hand-off (12–14 Nov). It replaces nothing in `docs/Prompt_for_Aanya_Day2_2026-11-13.md` (owners, §3 contract, §4 questions, §7 merge rules, §9 stand-up format all stand). It adds: what is live now, the answers to day 2's asks, the exact day-3 and day-4 work, and the Track A plan now that the runner gaps she listed are mostly closed.

---

You are the Claude working with Aanya on spine.ai, Procol's QA platform. Read `docs/Prompt_for_Aanya_Day2_2026-11-13.md` first; its rules apply unchanged. This brief is the day-3 plan on top of it.

## 0. Answers to day 2's asks (read before anything else)

1. **Repo access — it is already there.** `aanyaa-singhal` is a collaborator on `animeshsharma-svg/spine.ai`, and the `aanya` branch exists on it. "Repository not found" means the local remote or the login is wrong, not the access. Fix it in this order and stop at the first line that makes `git fetch origin` work:
   ```
   git remote -v                                   # origin MUST be https://github.com/animeshsharma-svg/spine.ai.git
   git remote set-url origin https://github.com/animeshsharma-svg/spine.ai.git
   gh auth status                                  # the account must be aanyaa-singhal (the collaborator), not another login
   gh auth login                                   # if it is another account; then:
   git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch origin
   ```
   Then push day 2's commit: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin aanya`. The private mirror (`animeshsharmaa208/procol-qa-platform`) is Animesh's personal copy; nothing of yours needs it.
2. **`question` stays in the reply of `POST :id/questions/answer`.** The route returns `{ok:true, question}` on success and `{ok:false, why}` (HTTP 400) on a bad answer, exactly as your card expects. One field was added to `Q` on 13 Nov: `ref?: {…}` — a small map of ids the backend uses to tell two questions with the same words apart (never show it).
3. **"questions: live"** — it has been live since 13 Nov on the worktree server (`spine-demo-merged`, port 4320): `GET :id/questions`, `POST :id/questions/answer`, `GET :id/questions/stream`, and every step stream carries `ask` / `answered`. Flip the card to real today.
4. **Every `/api/session/*` route in §3 of the day-2 brief is real** on port 4320 (start, list, kinds, env/profiles, env/describe, env/use, :id, delete, rename, reopen, env, intake, understanding, answer, apply, sanity, sanity/accept, generate, generation, review GET/POST, merge, run, rerun, report). The exact payloads are in the header comment of `prototype/src/routes/guidedSession.ts`. Keep `session-mock.js` as the fallback behind one flag; the real routes are the default from now.
5. **Your 3 Fails from the 40 (QCS-009, BID-005, VIS-008)** are runner gaps on my side and are on my list for today: "Download Excel" inside the Download Reports panel, "Update audience" after ticking a vendor, and the Activity panel read. Do not rewrite those cases; rerun them when my stand-up says the three are in.
6. **Runner gaps you listed — status today** (so Track A picks cases the runner can start):
   - vendor-portal steps: DONE (2–14 Nov): `switch_portal{to:"vendor", vendor:N}`, `vendor_open_event`, `vendor_bid{price}`, `expect_bid_submitted`, `expect_zone`, `set_zone_visibility`, `wait_for_end_window`, `expect_time_extended`, `expect_participants_summary`. A case that says "the vendor sees …" now runs on the real supplier portal.
   - closed event with 3 QA bidders: the plan builds it itself — `place_bid{vendor:1}` … `{vendor:3}` then `close_event` (force-end on DEMO) — no API state needed; the API states still build one or two bidders (`two_bids`, `closed_two_bids`).
   - save draft: DONE 13 Nov (a draft built by API opens on its own create screen).
   - two-stage event with technical evaluation / planner: `compose_stages(rfp, rfq)` + `evaluate_technical` exist; a case must name the technical stage in its words.
   - two-line BOQ with two bidders, lots, template edit in Admin: NOT built as start states; a BOQ case can add two lines itself (`add_line_items{count:2}`), lots and Admin template edits stay "Couldn't tell" for now — keep them out of today's run.
   - unattended `ask_tester` → "Couldn't tell": by design. Those cases are for the daytime run with you on screen (Track A below) — through the session's Run step the question reaches your card with a deadline and `ifNoAnswer`.
7. The RCA workbook copy and the yes/veto on the 40: the 40 are approved as proposed (no veto); the workbook stays where it is (`.local-rca/`, never committed).

## 1. Day 3 — Track B: Sanity and Cases on the real routes (morning)

Start from a clean merge:
```
git fetch origin && git merge origin/rca-wt
```
Server: the worktree entry `spine-demo-merged` (port 4320) — never start the dashboard with Bash; use the launch entry. PROCOL DEMO (company 198678) is the only company whose settings may be switched.

**Sanity screen** (`POST :id/sanity` SSE, `GET :id/sanity`, `POST :id/sanity/accept`):
- The flow list pre-ticked from the "flows" question (the one the requirement step asked); a tick changes `flowIds` in the POST.
- Live: `flow-start` → a card per flow; `frame` → the live picture inside that card (the frame's `data` is a JPEG, show it, keep the last one); `flow-done{flow}` → the verdict chip (reached / blocked / not reached) with the blocker sentence under it; `ask` → the question card inline, `answered` → collapse it.
- Done: `done{result}` → the summary line and the Accept button; `GET :id/sanity` on reload repaints the same.
- Error: `error{why}` → the sentence in a red band, nothing else changes.

**Cases screen** (`GET :id/kinds`, `POST :id/generate` SSE, `GET :id/generation`):
- Kinds as tick boxes with the basis sentence under each (from `/kinds`); depth as three buttons (quick / standard / deep) with one line each saying what it costs.
- Live: `section-start{kind,basis,planned}` → a section header with "0 of N"; `case{row}` → one row appended under its section (title, priority, type); `section-done{kind,count,existing,note?}` → "N new, M already in the sheet" and the note in grey; `ask` / `answered` as everywhere.
- Done: `done{generation}` → the Review button; `GET :id/generation` on reload repaints.

**Verify before the stand-up** (write how under "Done"): Playwright drive on the real server with the counter-offer PRD from `docs/demo-pack/` on PROCOL DEMO: Environment → Requirement → Sanity → Cases, reload on each step, answer one question on each step from the card, 0 console errors, no horizontal scroll at 390 px, dark mode readable.

## 2. Day 4 — Track B: Review and Run on the real routes

- Review (`GET/POST :id/review`, `POST :id/merge`): grouped table, inline edit → `edits`, drop → `drops`, "Merge a sheet" → upload (base64) → `{added, duplicates}` shown as a list under the button, Approve → `sheet{name, version, count}` becomes the title.
- Run (`POST :id/run` SSE, `POST :id/rerun`, `GET :id/report`): scope buttons (all / P0+P1 / sections), the sheet runner's events (`case-start`, `line`, `frame`, `case-done{result}`), live tally, per-case latest verdict with Rerun, `queued{…}` as a grey "waiting" row, the run-step questions on the card (these are the ones with deadlines — show the countdown), `done` → the report (`GET :id/report`: runs, tally, latest, bugs, queued).
- Standing bugs on the report come straight from `bugs[]`; show them in the house format (one-line bug, steps, expected, actual) — never reword them.

## 3. Day 5 — polish and demo

Empty, loading and error states on every step; resume mid-step; reload mid-question; phone width; dark mode; the daily QA checklist on every screen (states × reload × 390 px × dark); demo pack rehearsal with Animesh; `docs/demo-pack/` complete (PRD, the sheet it makes, the report it ends on).

## 4. Track A (afternoons) — the daytime RCA run with you on screen

1. Start a session on the real server, PROCOL DEMO, intake = your `RCA_Real_Bugs_v2.xlsx` through `merge` (it is a sheet: `{name, data}`), skip generation, approve the review, run scope "sections" with only the one-line-event cases (the ones that need no 3-bidder / BOQ / lot / Admin set-up — about 25 of the 40).
2. Stay on the Run screen and answer every question from the card (this is the integration test of §4: a blocking question with a deadline, `ifNoAnswer`, the answered collapse and the `outcome`).
3. Re-read every Fail against its screenshots the way you did on day 2. A real bug goes into `docs/bugs/platform-fixes-needed.md` in the house format via `test-cases/bug_sheet.py` (never ticket text in the repo); a test problem goes into your stand-up with the exact missing click, as you wrote the three on day 2 — that wording is exactly what I need.
4. Keep `.local-rca/rca-review-v2.json` as the ledger (case → verdict → your reading → what the runner lacked).
5. When my stand-up says the three missing clicks are in, rerun QCS-009, BID-005, VIS-008 through `rerun`.

## 5. What I need from you in the stand-up (every evening)

- Which steps are now on the real routes (a table: step → mock / real → verified how).
- Any route whose events did not match §3 (the exact event name and the field) — I fix the backend, you do not work around it.
- The Track A ledger counts (ran / pass / fail / couldn't tell / not run) and the one-line reason per Fail.
- Anything the question card could not show (a `kind`, an option without `label`, a `why` longer than a line).

## 6. Rules that did not change

Owners, not areas (day-2 §1). SELECT only on Procol's database. `procol-backend` and `procol-client-dashboard` read only. Never commit `.env`, `.auth`, `prototype/data/`, run outputs, HubSpot or RCA ticket content. QA vendors only (`SPINE_QA_VENDORS_ONLY=1` on any server you start for a run — day 2's 205-vendor invite is why). Settings are switched only on PROCOL DEMO through the platform and restored. `main` untouched. Nothing rebased, nothing force-pushed.

Start now with §0 item 1 (make `git fetch origin` work and push `aanya`), then §1.
