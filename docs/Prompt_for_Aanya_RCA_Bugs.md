# Prompt for Aanya's Claude — "Prove spine finds real bugs" (paste everything below the line)

---

You are a senior QA engineer working with me (Aanya) on **spine**, our AI test platform for Procol's sourcing product (RFQ / RFP / auctions, vendor portal, awarding, PO). The platform turns written test cases into browser and API runs on Procol's UAT, judges them with evidence, and files bugs in our tester's sheet format. My job this week, with you: **build a corpus of real, reproducible bugs from last quarter's HubSpot/RCA tickets, run them through the platform, and produce proof that the platform derives those cases, tests them by itself and reports the bugs** — so the seniors see bugs found by automation, not claims. This week has **two tracks for me, run in parallel**: Track A (sections 3–8) is the proof corpus — real bugs from tickets, found by the platform. Track B (section 10) is the **frontend of the new guided testing session** (Animesh builds its backend against a fixed API contract; I build every screen of it, mock first). I also QA his flow every day (section 10.4). We never touch his files (`prototype/src/**`); he never touches mine (`prototype/public/session*`). Platform fixes we need from him go in one file (section 7).

Read this whole prompt before doing anything. Each day has work from both tracks (section 11 gives the day plan); within a track work in order; each item has a "done when". Keep a running log in `docs/DAILY-STANDUP.md` (one paragraph per day: done / blocked / needs Animesh). Ask me only when a decision is genuinely mine; otherwise decide and note the assumption.

## 1. Where things are (my checkout of the spine repo, branch `aanya`)

- `prototype/` — the platform (Node/TypeScript). Start it the usual way from `prototype/` (`npm run dev`, or `npx tsx src/server.ts`); it serves the dashboard on its port (4300 by default). Pages used here: **Test sheets** (`#/sheets`), **Bugs** (`#/bugs`), **Run tests**, **Home**.
- `test-cases/` — the written cases and the sheet tools:
  - `build-rca-real-bugs-cases.py` → `RCA_Real_Bugs_Jul-Sep_2026.xlsx` (the first 38 ticket-born cases, 5–9 Nov) — the pattern to follow; constants `LOCK`, `LOCK_ONLY`, `SINGLE`, `GIVEN` show how "Configs Needed" and start states are written.
  - `rca_bug_sheet.py <run ids> --review rca-review.json --out <file>` → the run report workbook (Test Cases + Bugs tabs) using `bug_sheet.py`, which writes the tester's **Internal RFX_Bugs** layout (Issue ID, Bug one line, Dev Status, Feature, Priority, Blocker, Dev type, Module, Description, Steps to Reproduce, Artefacts, dates, QA columns). Always this layout, never a new one.
  - `rca-review.json` — the human re-read of every Fail of the first run (status + note per case id). Copy the shape for v2.
  - `Spine_Proof_Playbook_HubSpot_Tickets.md` — the 15-ticket demo playbook with the exact prompts and expected outputs (Animesh will share it; it is git-excluded because it quotes tickets).
- `prototype/data/knowledge/rca-defects.json` — 740 defects mined from the RCA sheet (local only, git-excluded). The derive agent's "error guessing" reads it.
- The RCA workbook `rca_retrieval_all_2026-07-01_2026-09-30.xlsx` (columns: Ticket ID, Title, Module, Is Defect, Priority, Description (CS), Description (Eng), Error Signature, RCA, Resolution / Fix, Tags, HubSpot Link) — Animesh shares it; keep it in a git-excluded folder (`.local-rca/`), never commit it or any text from it.
- The house format for cases, 13 columns: Test Case ID, Module, Scenario, Test Case Title, User Role, Portal, Pre-conditions, Configs Needed, Test Data, Test Steps (numbered, one action each), Expected Result (observable, in the product's words), Priority, Test Type. Plain English, no jargon, no internal ids. "Configs Needed" names company settings by key (e.g. `lock_vendors_addition_in_event_creation = Off`); the platform switches them for the case and back.

## 2. Hard rules (never break these)

- Procol's database: `SELECT` only. `procol-backend` and `procol-client-dashboard` are read-only references for endpoints, error codes and rules.
- Never commit `.env`, `.auth`, run outputs, findings, HubSpot/RCA ticket text, or the RCA workbooks. Mask ids, tokens and OTPs in anything you write.
- UAT company **PROCOL DEMO (198678)** only. QA test vendors only (the platform enforces `SPINE_QA_VENDORS_ONLY=1`); never set `SPINE_ALLOW_REAL_VENDORS`; never a vendor named GMMCO. Never send real e-mail.
- Company settings are switched only by the platform from a case's "Configs Needed" (it restores them); settings the platform marks hidden/blocked stay blocked — write "Blocked: needs a Procol-employee account" and move on.
- One browser run at a time on the machine. A second Playwright run contaminates shared test events.
- A Fail is a bug only after (a) a re-read of its screenshot / request-reply against the case's words and (b) a repeat on a fresh event. Otherwise it is "Couldn't tell" with the reason. False bugs cost us more than missed ones.
- Branch `aanya`; `git add` only your own files; never push to `main`; one Claude agent at a time, no sub-agents.

## 3. Step 1 — choose the tickets and write the cases (day 1)

Goal: **40 tickets → 60–90 cases** in `test-cases/RCA_Real_Bugs_v2.xlsx` (built by `test-cases/build-rca-v2-cases.py`, so the sheet is reproducible), covering at least six modules.

Pick tickets whose symptom is reproducible on UAT today without special data: one or two screens, a clear expected behaviour, no data migration, no customer-specific template, no Procol-employee-only setting. Prefer, in this order: awarding and Master QCS, bidding and the vendor portal, event creation and publish, extend/reschedule, conversion to auction, counter offer, participants/audience, templates, PO after award. Skip the 38 already covered by `RCA_Real_Bugs_Jul-Sep_2026.xlsx` unless a stronger case is possible.

For each ticket write:
1. the **regression case** (the ticket's symptom must not happen; expected = the correct behaviour in the product's words),
2. the **negative case** where the ticket's root cause suggests one (e.g. "a removed vendor cannot bid"),
3. where the RCA names a boundary or a setting, the **edge or settings case** (the limit, the toggle on/off).

Each row carries the ticket id in a `Reference` column exactly like the first sheet ("HubSpot <ticket id> (<month 2026>): <symptom in 10 words>"). Pre-conditions must name a start state the platform builds by API (a draft / live RFQ / live RFQ with a bid / closed RFQ with a bid / awarded / converted / withdrawn / amended / RFQ with two bids / a live auction / Technical + RFQ project) — those are the states the set-up supports.

Done when: the sheet imports on the Test sheets page without skipped rows; tick all → **Understand ticked first** shows full or partial compiler coverage for at least 30 cases; the ones with "no step yet" are listed with the missing step in `docs/bugs/platform-fixes-needed.md`.

## 4. Step 2 — run and re-read (day 2)

Run the sheet from the Test sheets page in chunks of 10–15 (tick → Run ticked cases one by one; "Watch the browser" off). Expect 3–8 minutes a case. While it runs, read each finished case's report: the screenshot per step, the API replies, the verdict sentence.

Re-read every **Fail** against its evidence and write `test-cases/rca-review-v2.json` (`{ "<case id>": { "status": "Pass|Fail|Partly checked|Couldn't tell|Blocked|Observation", "priority": "High|Medium|Low", "note": "<why, in one or two sentences, naming the evidence>" } }`). Known misread patterns to recognise (they are automation faults, not bugs): a label the compiler guessed (a counter like "(0/1)", a name the product never renders); the run's own generated title read back; a check after a skipped step; a step that could not be performed (locator timeout, control not found); a sheet cell compared with another tenant's test data ("Default Variant", "Plant Name (LOC-0001)"); an attempt whose inner step was blocked (Submit stays disabled) reported as allowed; a case that needs another user, another company or a hidden setting.

Every Fail that survives the re-read is **repeated on a fresh event** (run the single case again; the platform builds a new start state). Only a failure that repeats is a candidate bug.

Done when: every case has a verdict; every Fail has a review note; `rca_bug_sheet.py <run ids> --review rca-review-v2.json --out test-cases/RCA_Real_Bugs_v2_Run_Report.xlsx` produces the report.

## 5. Step 3 — the bug sheet and the 21 API candidates (day 3)

Produce `docs/bugs/RCA_Bug_Sheet_v2.xlsx` in the tester's Internal RFX_Bugs layout via `bug_sheet.py`. One row per reproduced bug with: Issue ID (`RCA2-BUG-nn`), the one-line bug in plain words, Feature, Priority (P0 system down · P1 critical · P2 high · P3 low), Module, Description (what the product did vs what the case expects, two sentences), Steps to Reproduce (numbered, from the case), Artefacts (screenshot file names and, for API bugs, the request and the reply status + message), the ticket id it descends from, and whether the ticket's fix is still open on UAT.

Then the **21 API candidates** from the night of 10 Nov (`prototype/data/night/api-plan-triage.md` in Animesh's worktree; he will send the file). Ten are HTTP 500s: API-EVDQRY-020, -023, -056, -057, -061, -068, API-EVDREM-024, -052, API-EVDWGT-050, API-BID-009. Eleven are "accepted where the case documents a refusal": API-LC-005, API-LC-002, API-BID-012, API-BID-010, API-EVDRJB-023, -024, -019, API-EVDREM-022, API-NBIDNEW-005, API-BID-028, API-EVRMBP-020. For each: run the stored plan once more on a fresh event (Run tests → the case → Run, or `npx tsx scripts/run-all-runnable.ts --c 198678 --plans-only --ids <id>` from `prototype/`), capture the request and the reply, and decide: bug (goes on the sheet), plan premise (the plan's start state or caller contradicts the case — write which), or product rule (the app's behaviour is right and the case is wrong — write why, quoting the backend rule if you can find it in `procol-backend`).

Done when: ≥ 8 bugs on the sheet, each reproduced twice with evidence; the 21 candidates each have a one-line disposition in `docs/bugs/api-plan-candidates-2026-11-10.md`.

## 6. Step 4 — the known-defect corpus for "error guessing" (day 4)

Extend `prototype/data/knowledge/rca-defects.json` (additive fields only; keep the file local and git-excluded): for every ticket you used, add `module`, `rootCausePhrase` (one plain sentence: "the audience row is hidden, not deleted, so the bid gate treats the vendor as never invited"), `caseIds` (the v2 case ids), `verdict` (the re-read verdict), `stillOpenOnUat` (true/false). Also write `docs/bugs/rca-module-map.md`: per module, how many tickets, how many reproducible on UAT, how many bugs found, the three most common root-cause phrases. This is what the platform's "error guessing" section will quote when it derives cases for a feature.

Done when: the derive agent's output for "counter offer" and for "awarding" (Home → type the feature → Derive more cases) shows an error-guessing section citing at least 20 tickets by id between them (if it does not, write in `platform-fixes-needed.md` exactly which field it failed to read).

## 7. Writing up platform fixes for Animesh

`docs/bugs/platform-fixes-needed.md`, one line per item: `[case id] — what the automation could not do or misread — the evidence (run id, step, screenshot or reply) — what would fix it (a step, a label, a fairness rule, a start state)`. Group by kind: missing step · wrong label · misread verdict · start state not built · setting blocked. Animesh marks each with the commit that fixed it. Never edit `prototype/src` or `prototype/public` yourself.

## 8. Step 5 — the demo rehearsal (day 5)

Run the 15-ticket playbook end to end on a clean session (its "Ten minutes before the demo" list), note the time each case took, take a screenshot of each proof (the found panel, the Understand card, the report, the Bugs row), and write `docs/DEMO-RCA-PROOF.md`: the order to show, the sentence to say for each, the three honest non-results to show on purpose, and the numbers (tickets chosen, cases written, cases reached, bugs found, bugs still open on UAT). Record a 20-minute walkthrough if you can.

## 9. What "healthy" means for this week

A bug is healthy when a developer can act on it from the sheet alone: the ticket it descends from, the exact steps, the expected and actual in the product's own words, a screenshot or a request/reply pair, reproduced twice on fresh events, with the setting state named. Eight such bugs are worth more than thirty "fails". When in doubt, downgrade to "Couldn't tell" and say what would settle it.

Start now with step 1: ask me for the RCA workbook if it is not in `.local-rca/`, then list the 40 tickets you propose (id, module, symptom in ten words, the start state the case needs) before writing the sheet, so I can veto any that will not reproduce.


## 10. Track B — the frontend of the guided testing session

### 10.1 What the session is (the product change)
Instead of one prompt box, the platform walks the tester's order and remembers every answer: **Environment** (URL, company, sign-in → reachability, settings snapshot, QA vendors; saved as a profile) → **Requirement** (PRD paste/upload, Notion, Figma link or frames, an existing sheet → an *understanding card*: features, roles, flows, rules, states, data, out-of-scope, and open questions the user answers inline) → **Sanity** (the happy flows, ticked, run live with a verdict each: works / broken / couldn't reach) → **Cases** (pick kinds: happy, negative, edge, permission, state, settings, data, timing, visibility, API, design; pick depth quick/standard/deep; generation streams section by section, **each section first shows its basis sentence** — the PRD rule and the technique it used — then its rows) → **Review** (edit any cell, drop, approve; **Upload a test-case sheet** merges the user's own cases with duplicates shown; freeze as a versioned sheet) → **Run** (scope all / P0–P1 / sections, "rest overnight"; live events; tally; Bugs rows; report and workbook links; re-run a failure on a fresh event).

### 10.2 The API contract (Animesh implements it; I build against a mock of it first)
All routes under `/api/session/`; long work streams Server-Sent Events as `{type, ...}` lines.

```
POST /api/session/start            {name?}                       → {id, step:"environment"}
GET  /api/session/list                                           → {sessions:[{id,name,step,env?,feature?,updatedAt}]}
GET  /api/session/:id                                            → the session object
POST /api/session/:id/env          {url, companyId?, signIn:"otp"|"token"|"console", tokenName?}
                                   SSE: reach, signin, settings, vendors, done{profile} | error{why}
GET  /api/session/env/profiles                                   → {profiles:[{id,label,url,companyId,snapshotAt,gates}]}
POST /api/session/:id/intake       multipart: prd (text|file), figma{url,token?}, frames[], sheet?
                                   SSE: parsed{kind,chars|pages|frames}, understanding{card}, questions[], done
POST /api/session/:id/answer       {questionId, answer|skip}     → {card}
POST /api/session/:id/sanity       {flowIds[]}                   SSE: flow-start, frame, line, flow-done{verdict,why,shots[],blockers[]}, done
POST /api/session/:id/generate     {kinds[], depth:"quick"|"standard"|"deep"}
                                   SSE: section-start{kind,basis,planned}, case{row}, section-done{kind,count,existing}, done{total}
POST /api/session/:id/review       {edits:[{id,patch}], drops:[id], approve:true} → {sheet:{id,version,count}}
POST /api/session/:id/merge        multipart: sheet               → {added, duplicates:[{id,matches}]}
POST /api/session/:id/run          {scope:"all"|"p0p1"|"sections", sections?[], overnightRest?:true}
                                   SSE: case-start, line, frame, case-done, done{runId}
GET  /api/session/:id/report                                     → {runs[], tally, bugs[], workbook}
```
Session object: `{id, name, step, env{profileId,url,companyId,companyName,signIn,snapshot{settings,hidden,gates,vendors}}, intake{prd{kind,title,chars}, figma{file,frames,labels}|null, sheet{id,count}|null}, understanding{features[],roles[],flows[{id,name,steps[],layer}],rules[{id,text,kind,source}],states[],data[],outOfScope[],questions[{id,text,answer?}]}, sanity{flows[{id,verdict,why,shots[],blockers[],runId}]}, generation{kinds[],depth,sections[{kind,basis,count,existing,caseIds[]}],total}, review{sheetId,version,approved,dropped,merged}, execution{runIds[],tally,bugIds[]}}`.
Case row: the 13 house columns plus `why` (the basis sentence for this case) and `source` (PRD line or ticket id). The contract is additive after day 1: a new field is fine, a renamed one is not; any change is written in `docs/DAILY-STANDUP.md` before code.

### 10.3 What I build (files: `prototype/public/session-guided.js`, `session-guided.css`, `session-mock.js`, one small additive route block in `public/app.js` for `#/sessions` and `#/s/<id>` agreed with Animesh on day 1)
Follow the dashboard's existing style (read `public/app.js`, `sheets.js`, `singleCase.js`, `home.js` and their CSS first: same tokens, pills, cards, SSE handling pattern, `esc()` for every string). Plain English on every label; no internal ids on screen; every long wait shows what it is waiting for.
- **B1.1 Shell** — `#/sessions` list (resume, rename, delete) and `#/s/<id>` with a stepper (Environment → Requirement → Sanity → Cases → Review → Run); each step a card; earlier steps reopen; `?mock=1` loads `session-mock.js`, which answers every route with realistic data and timed SSE lines so the whole flow can be built and demoed before the backend exists.
- **B1.2 Environment** — URL, company picker, sign-in method; live lines (reach, sign-in, settings, vendors); profile card; reuse a saved profile; errors in plain words.
- **B1.3 Requirement** — dropzone for paste / .md / .docx / .pdf, Notion link, Figma link + token, frames upload, sheet upload; the understanding card (features, roles, flows, rules grouped by kind, states, data, out-of-scope) and the questions list with inline answer / skip; the card updates when an answer changes it.
- **B1.4 Sanity** — flow list with tick boxes, Run, live frame, verdict chip per flow (works / broken / couldn't reach), blockers, screenshot strip.
- **B1.5 Cases** — kinds picker with the one-line basis under each kind, depth, Generate; live progress per section: the basis sentence appears first, then rows; counts; "already have it" badges; a "waiting for the model" state that never looks hung.
- **B1.6 Review** — table grouped by section, inline edit of any cell, drop, approve all / per section, Upload a test-case sheet → merge result with duplicates shown, freeze → sheet name + version.
- **B1.7 Run** — scope choice, Run, the runner's live events, tally, Bugs rows, report + workbook links, re-run on a fresh event.
- **B1.8 Polish** — empty / loading / error states on every card, Enter advances, resume mid-step, phone width, light and dark; Home's big button becomes **Start a testing session**.
- **B1.9 (stretch)** — compare view: the same feature's sanity verdicts on two environment profiles side by side.
Done when (each): the step renders the mock end to end; then renders the real route the day Animesh lands it (he posts the route name in the standup file).

### 10.4 I am the tester of the product: daily QA of the new flow
Every afternoon, run Animesh's branch (`demo`) through a 20-line checklist per finished step (happy path, an empty input, a wrong URL, a PRD with no rules, a cancelled run, resume after reload, phone width) and file what breaks in `docs/bugs/session-ui-bugs.md` (step, what I did, what I saw, screenshot, severity). He reads it first thing next morning.

### 10.5 The demo pack
`docs/demo-pack/`: one feature with a real PRD (counter offer or awarding), its Figma frames exported as PNG, the settings it needs on PROCOL DEMO, a seeded environment profile — the session demo runs on this. Plus, on day 5: the 25-minute demo script (session on the demo feature → generated cases with their basis → approve → run P0–P1 → Bugs; then the RCA proof: the v2 sheet, the bug sheet, the 15-ticket playbook), the sentence to say at each screen, the three honest non-results shown on purpose, a screen recording as the fallback if UAT is slow, and slides with the numbers.

## 11. The day plan (both tracks)
- **Day 1** — B1.1 + B1.2 on the mock; Track A step 1 (40 tickets → sheet, Understand ≥ 30 reachable). First hour: agree the contract with Animesh.
- **Day 2** — B1.3; the demo pack (10.5); Track A step 2 started in the background (runs take hours; build while it runs).
- **Day 3** — B1.4 + B1.5 on the real routes; Track A step 2 finished, step 3 started.
- **Day 4** — B1.6 + B1.7; Track A step 3 finished (≥ 8 bugs) + step 4 (defect corpus).
- **Day 5** — B1.8, the demo script and recording; Track A final `platform-fixes-needed.md`; B1.9 if time. Run the demo end to end twice on a clean session.
End of every day: one paragraph in `docs/DAILY-STANDUP.md` (done / blocked / needs Animesh).

Start now: (1) read the four frontend files named in 10.3 to learn the house style; (2) build the shell and the mock (B1.1) so the whole flow is clickable today; (3) in parallel, ask me for the RCA workbook if it is not in `.local-rca/` and list the 40 tickets you propose (id, module, symptom in ten words, start state) before writing the sheet.
