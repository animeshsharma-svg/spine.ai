# Spine — the guided testing session: design, backlog and work split (v2, 12 Nov 2026)

*Why this change: typing a prompt into one box, again and again, makes the user guess what the platform wants and makes the platform guess what the user meant. A tester's real work has an order: know the environment, read the requirement, prove the happy path works, write cases on a basis you can name, get them approved, then execute. The platform walks that order with the user, one question at a time, and remembers the answers.*

*Scope honesty: this backlog is about thirty working days for one person. It fits in five only because the two tracks run in parallel against a fixed API contract (section 4), most engines already exist (section 3), and the backlog is cut into "must for the demo" and "stretch" (section 7). Build the musts first in each day; take stretch items only when the day's musts are done.*

## 1. The session, step by step (what the user sees)

A **session** replaces the free prompt as the main entry. Home keeps the box for power users; its big button becomes **Start a testing session**. A session is saved as it goes, can be resumed from a list, and every later step can reopen an earlier answer.

| Step | The platform asks / does | The user does | What is shown |
|---|---|---|---|
| 0 Environment | "Which environment do you want to test?" URL + company/tenant + how you sign in (UAT OTP rule, token client, console) | pastes the URL, picks the company | Reachability, a sign-in as the buyer, a snapshot of the company's settings and feature gates ("eRFX on, masking off, partial awarding on, 12 hidden settings"), the QA vendors available. Saved as an **environment profile** (reusable; two profiles can be compared later). |
| 1 Requirement | "Share the PRD, the Figma, and anything else." Pasted text, .md/.docx/.pdf, a Notion page, a Figma file link (+ personal token, optional) or exported frames, an existing test-case sheet. | uploads / pastes | **Understanding card**: features, user roles, flows (one happy path per feature), business rules (validations, permissions, settings, limits), states and transitions, data the feature needs, out-of-scope, and **open questions** the user answers or skips. From Figma: screens, labels and controls, which become the expected labels for screen checks. |
| 2 Sanity | "These are the happy flows I found. Which should I run first?" | ticks, presses Run | Each flow runs live: reached / works / broken / couldn't reach, framed screenshot per action, settings switched, blockers named. Nothing else is written until the happy path is proven. |
| 3 Cases | "What kinds of cases?" happy · negative · edge/boundary · permission · state · settings · data · timing · visibility · API contract · design (vs Figma). Depth: quick ≈20 · standard ≈60 · deep 150+. | ticks, presses Generate | Section by section with live progress. **Each section states its basis before its cases** (section 2 below). House-format rows with "Why this case" and the PRD reference. Catalog duplicates shown as "already have it". |
| 4 Review | "N cases in M sections. Approve, edit, drop, or add." **Upload a test-case sheet** merges the user's own cases. | edits inline, approves | Frozen as a named, versioned sheet (`<feature>-v1`); a changed PRD later yields v2 with a diff. |
| 5 Execution | "Run the approved cases now?" all / by section / P0–P1 now and the rest overnight | presses Run | The sheet runner: start states by API, settings switched and restored, one browser, screenshots, verdict per check, fairness re-read, Bugs page in the tester's format, results workbook; a failure repeats on a fresh event before it is a bug. |

## 2. How the cases are made (the basis text the user sees)

- **Happy path** — "From the PRD's flow '<name>': one case per step that changes state, ending on the state the PRD promises."
- **Negative** — "Each rule in the PRD that says must / cannot / only becomes one refusal case: the forbidden input and the message or state the PRD expects."
- **Edge / boundary** — "Each numeric or length limit gives three cases: the limit, one below, one above; each list of allowed values gives one case per partition."
- **Permission** — "Role × action matrix: every role the PRD names against every action; the forbidden cells, and the two roles nearest to each."
- **State** — "State-transition table from the PRD's states: each action in each state; allowed once, forbidden as refusals."
- **Settings** — "Each company setting the feature depends on (from the settings catalogue): the flow with it on and off; hidden settings listed, not run."
- **Data** — "Units, currencies, Indian digit grouping, empty, whitespace, duplicates, very long names, special characters, from the PRD's field types."
- **Timing** — "Before start, during, last minute, after close, extended; two users at once where the PRD allows both."
- **Visibility** — "What the buyer, the vendor, an uninvited vendor and a colleague each see at each state."
- **Error guessing** — "From last quarter's HubSpot/RCA tickets in this module: each root cause becomes a regression case on this feature."
- **Design** — "From the Figma frames: each labelled control must exist with that label; each state frame (empty, loading, error) must be reachable."

## 3. What exists and is reused (nobody rebuilds these)

Sign-in and settings snapshot (`companyConfig`, `companySettings`, token clients), the derive agent (`deriveCases.ts`: understand → ground → matrix → dedupe), the product questionnaire, the explorer (`/api/explore/*`), start states by API (draft / live / bid / closed / awarded / converted / withdrawn / amended / two bids / dutch / forward / PR-based), the sheet runner with settings switching and fairness rules, the Bugs page and `bug_sheet.py`, case search, the 8,940-case catalog, the stored plans for every text case, the night runner and night report.

## 4. The API contract between the two tracks (fixed on day 1, additive after)

All under `/api/session/`. JSON in, JSON out; long work streams Server-Sent Events (SSE) with `{type, ...}` lines. The frontend (Aanya) builds against these shapes with a mock first; the backend (Animesh) implements them in this order.

```
POST /api/session/start            {name?}                                  → {id, step: "environment"}
GET  /api/session/list                                                      → {sessions: [{id, name, step, env?, feature?, updatedAt}]}
GET  /api/session/:id                                                       → the whole session object (below)
POST /api/session/:id/env          {url, companyId?, signIn: "otp"|"token"|"console", tokenName?}
                                   SSE: reach, signin, settings, vendors, done{profile} | error{why}
GET  /api/session/env/profiles                                              → {profiles: [{id, label, url, companyId, snapshotAt, gates}]}
POST /api/session/:id/intake       multipart: prd (text|file), figma {url, token?}, frames[], sheet?
                                   SSE: parsed{kind, chars|pages|frames}, understanding{card}, questions[], done
POST /api/session/:id/answer       {questionId, answer|skip}                → {card}  (the card is re-derived where the answer matters)
POST /api/session/:id/sanity       {flowIds[]}                              SSE: flow-start, frame, line, flow-done{verdict, why, shots[], blockers[]}, done
POST /api/session/:id/generate     {kinds[], depth: "quick"|"standard"|"deep"}
                                   SSE: section-start{kind, basis, planned}, case{row}, section-done{kind, count, existing}, done{total}
POST /api/session/:id/review       {edits: [{id, patch}], drops: [id], approve: true} → {sheet: {id, version, count}}
POST /api/session/:id/merge        multipart: sheet                          → {added, duplicates: [{id, matches}]}
POST /api/session/:id/run          {scope: "all"|"p0p1"|"sections", sections?[], overnightRest?: true}
                                   SSE: the sheet runner's events (case-start, line, frame, case-done, done{runId})
GET  /api/session/:id/report                                                → {runs[], tally, bugs[], workbook}

Session object:
{ id, name, step, createdAt, updatedAt,
  env: {profileId, url, companyId, companyName, signIn, snapshot: {settings: n, hidden: n, gates: {...}, vendors: n}},
  intake: {prd: {kind, title, chars}, figma: {file, frames: n, labels: n} | null, sheet: {id, count} | null},
  understanding: {features[], roles[], flows[{id, name, steps[], layer}], rules[{id, text, kind, source}], states[], data[], outOfScope[], questions[{id, text, answer?}]},
  sanity: {flows[{id, verdict, why, shots[], blockers[], runId}]},
  generation: {kinds[], depth, sections[{kind, basis, count, existing, caseIds[]}], total},
  review: {sheetId, version, approved: n, dropped: n, merged: n},
  execution: {runIds[], tally, bugIds[]} }
```

Case row (the house format plus two columns): `{id, module, scenario, title, role, portal, preconditions, configs, testData, steps[], expected, priority, type, why, source}` where `why` is the basis sentence for this case and `source` the PRD line or ticket id.

### 4.1 Added 13 Nov — the platform asks on screen (`prototype/src/session/questions.ts`)

Whenever a step is unsure it asks the tester, in plain words, and goes on when told. Questions live on the session (`session.questions[]`), so a reload shows them; they stream on the step's own stream and on a session-wide stream. Two kinds: a question the run **waits for** (blocking, with a deadline and a stated fallback: "If I hear nothing in 5 minutes, I'll go with 'Leave them out'") and a question the run **goes on without** (the answer is applied when it comes, even after a restart).

```
GET  /api/session/:id/questions                              → {questions:[Q], open:n}
POST /api/session/:id/questions/answer   {qid, answer} | {qid, skip:true}   → {ok, question:Q} | {ok:false, why}
GET  /api/session/:id/questions/stream   SSE: ask{question}, answered{question}, closed{qid, how:"deadline"|"cancelled"}, ping
Q = {qid, step, source, kind:"yes-no"|"one"|"many"|"text", text, why?, options:[{value,label,means?}], suggested?,
     blocking, deadlineAt?, ifNoAnswer?, askedAt, answer?, answeredAt?, skipped?, outcome?, closed?, ref?}
```

Who asks what (source → when → what the answer changes):

| source | step | asked when | the answer changes |
|---|---|---|---|
| company | environment | a UAT address with no company chosen (waits 10 min, suggests PROCOL DEMO) | the company the step signs into |
| flows | requirement | the card is read: "I found 5 flows. Which ones should I test?" (all ticked) | flows left out get no sanity run and no cases (`flow.skip`) |
| prd | requirement | each question the PRD leaves open, one thing per question, "I don't know" allowed | the card's Qn (answer or skipped); Apply answers rewrites the rules |
| setting | requirement | a feature the company has off: switch on for the runs / leave out / test as it is | `feature.testAnyway` → a Configs line on its cases; or its flows skipped |
| sanity | sanity | before the run when the company has no QA vendor (waits 5 min); after a flow comes back broken or unreachable | stop / run anyway; `flow.skip` or `flow.unproven` (cases marked as resting on an unproven flow) |
| cases | cases | every generated case whose expected result is "To confirm with the product team" | the case's expected result on the generated sheet and, by title, on the frozen one |
| run | run | cases the company cannot carry (a setting to switch off DEMO, a vendor to invite with none): leave out / run anyway / stop (waits 5 min, suggests leave out) | which cases run |

The frontend shows `text`, `why`, the options with `means`, the suggested one outlined, the deadline and `ifNoAnswer` when blocking, "Skip for now", and the answered ones collapsed with their `outcome`. It never rewrites the words.

## 5. Backlog — Animesh (backend, engines, data): about 16 days of work in 5

| # | Item | Must / stretch | Day |
|---|---|---|---|
| A1 | Session store (`prototype/data/sessions/<id>.json`), state machine, list/resume; routes `start`, `list`, `:id` | must | 1 |
| A2 | Environment step: URL → reachability; sign-in by OTP rule / token client / console; settings + gates snapshot; QA vendor count; profile saved and reusable; errors in plain words ("the OTP rule for this company is unknown") | must | 1 |
| A3 | Environment profiles for other hosts (console.ag-ri.in, rfx-uat-api, a customer UAT) via token clients; profile compare view data (same feature on two environments, side-by-side verdicts) | stretch | 1 |
| A4 | Intake parsers: pasted text, .md, .docx, .pdf (text layer), Notion page (connector), test-case sheet (existing importer) | must | 2 |
| A5 | Figma: REST (file → pages → frames → text nodes, component names, states) with a personal token; fallback: exported frames → labels via the explorer's screen model; what was read is reported | must (REST) / stretch (image fallback) | 2 |
| A6 | Understanding agent: extend `deriveCases` understand → features, roles, flows (with layer: browser/API), rules (kind: validation / permission / setting / limit / state), states, data, out-of-scope, questions; answers re-derive only the affected parts; "the PRD gives no rule for X" never invents | must | 2 |
| A7 | Happy-flow planner: flow → journey plan (reuse compiler + explorer); run with verdicts works / broken / couldn't reach, blockers (settings, vendors, permissions); "broken" only on an app refusal or error with evidence | must | 3 |
| A8 | Generation engine v2: kinds × depth; techniques as code where they are mechanical (boundary triples, equivalence partitions, state table, role × action matrix, settings on/off) and the model only for the words; basis sentence per section; dedupe against the catalog and inside the set; "Why this case" + PRD/ticket source per row; live SSE | must | 3–4 |
| A9 | Error-guessing section reads Aanya's extended `rca-defects.json` (module, root-cause phrase, case ids) and cites tickets by id | must | 4 |
| A10 | Review: edits, drops, approve → frozen versioned sheet; merge uploaded sheet with duplicate matching (`matchTestCase`); v2 diff when the PRD changes | must (freeze, merge) / stretch (diff) | 4–5 |
| A11 | Execution: scope all / P0–P1 / sections; "rest overnight" hands to the night runner; results, bugs, workbook; re-run a failure on a fresh event from the session | must | 5 |
| A12 | Generation quality eval: a manual sheet of a known feature vs the generated set (recall of the manual cases, duplicate rate, basis correctness); printed as numbers for the demo | stretch | 5 |
| A13 | Rate-limit scheduler: one queue for all model calls, concurrency 2, backoff, live "waiting for the model" state instead of silence | must | 3 |
| A14 | Fixes from the night: the single-stage drawer for auction subtypes (SRC-AUC group), the `awarded_rfq` recipe on proposal-creation plans, XREV cases not routed api-plan, tsconfig exclude for the DOM-library noise, the RFP template menu check | must (drawer, recipe) / stretch (rest) | any day, between items |
| A15 | Platform fixes Aanya files in `docs/bugs/platform-fixes-needed.md` (misreads, missing steps, labels) | must, daily | daily |

### Animesh, day by day

- **Day 1**: A1, A2 (A3 if time). Done when a session for PROCOL DEMO and one for a token client reach the Requirement step with a profile card.
- **Day 2**: A4, A5 (REST), A6. Done when the counter-offer PRD and one product-sheet feature produce a card with ≥ 1 flow, ≥ 5 rules, questions answerable inline, and the Figma labels of one frame appear.
- **Day 3**: A7, A13, start A8. Done when two flows of a real feature run from the session; one deliberately broken flow reads "broken".
- **Day 4**: finish A8, A9, A10 (freeze + merge). Done when a deep run on one feature yields 100+ cases across ≥ 6 kinds with a basis per section in under 10 minutes; the merge of Aanya's sheet marks duplicates.
- **Day 5**: A11, A14 (drawer, recipe), A12 if time. Done when an approved sheet runs from the session, its report and bugs open from it, and a failure re-runs on a fresh event.

Files: `prototype/src/session/**` (new), `prototype/src/routes/session.ts` (new), `prototype/src/agents/understanding.ts` + `generation.ts` (new), additive hooks in `deriveCases.ts`, `sheetRunner.ts`, `explore.ts`, `companySettings.ts`. Never `prototype/public/session*`.

## 6. Backlog — Aanya (frontend of the new flow, proof corpus, demo): about 14 days of work in 5

### Track B1 — the session frontend (built against the contract with a mock, then the real routes)

| # | Item | Must / stretch | Day |
|---|---|---|---|
| B1.1 | Session shell: `#/sessions` list (resume, rename, delete), `#/s/<id>` page with a stepper (Environment → Requirement → Sanity → Cases → Review → Run), each step a card; `public/session-guided.js` + `session-guided.css`; a mock of every route in `public/session-mock.js` switchable with `?mock=1` | must | 1 |
| B1.2 | Step 0 UI: URL field, company picker, sign-in method; live SSE lines (reach, sign-in, settings, vendors); profile card; profile list to reuse; errors in plain words | must | 1 |
| B1.3 | Step 1 UI: dropzone (paste / .md / .docx / .pdf), Notion link, Figma link + token field, frames upload, sheet upload; the **understanding card** (features, roles, flows, rules by kind, states, data, out-of-scope) and the **questions list** with inline answer / skip | must | 2 |
| B1.4 | Step 2 UI: flow list with tick boxes, Run, live frame, per-flow verdict chip (works / broken / couldn't reach), blockers, screenshots strip | must | 3 |
| B1.5 | Step 3 UI: kinds picker (with the one-line basis under each kind), depth, Generate; live progress per section (basis sentence first, then rows appearing), counts, "already have it" badges | must | 3 |
| B1.6 | Step 4 UI: review table grouped by section, inline edit of any cell, drop, approve all / section, **Upload a test-case sheet** (merge result with duplicates shown), freeze → sheet name + version | must | 4 |
| B1.7 | Step 5 UI: scope choice, Run, the runner's live events, tally, Bugs rows, report + workbook links, "re-run on a fresh event" | must | 4–5 |
| B1.8 | Polish: empty / loading / error states for every card, keyboard flow (Enter advances), resume mid-step, responsive at phone width, light/dark; Home's big button → Start a testing session | must | 5 |
| B1.9 | Compare view: the same feature's sanity verdicts on two environment profiles side by side | stretch | 5 |

### Track B2 — the proof corpus (unchanged from v1, the full brief is in `docs/Prompt_for_Aanya_RCA_Bugs.md`)

| # | Item | Must / stretch | Day |
|---|---|---|---|
| B2.1 | 40 reproducible tickets → 60–90 house-format cases (`RCA_Real_Bugs_v2.xlsx`), Understand ≥ 30 reachable | must | 1 |
| B2.2 | First run, every Fail re-read, `rca-review-v2.json`, run report | must | 2 |
| B2.3 | Bug sheet in the tester's layout, ≥ 8 bugs reproduced twice with evidence; the 21 API-plan candidates dispositioned with reply pairs | must | 3 |
| B2.4 | Known-defect corpus for error guessing (`rca-defects.json` additive fields) + module map | must | 4 |
| B2.5 | `platform-fixes-needed.md` kept daily | must | daily |

### Track B3 — demo and content

| # | Item | Must / stretch | Day |
|---|---|---|---|
| B3.1 | The demo feature pack: one feature with a real PRD (counter offer or awarding), its Figma frames exported, the settings it needs, a seeded environment profile; this is what the session demo runs on | must | 2 |
| B3.2 | Daily QA of the new flow on Animesh's branch (she is the tester of the product): a 20-line checklist per step, bugs in `docs/bugs/session-ui-bugs.md` with screenshots | must | 2–5 |
| B3.3 | Demo script: the 25-minute order (session on the demo feature → generated cases with basis → approve → run P0–P1 → bugs; then the RCA proof: the sheet, the bug sheet, the 15-ticket playbook), with the sentence to say at each screen and the three honest non-results shown on purpose | must | 5 |
| B3.4 | Recorded walkthrough (screen capture) as the fallback if UAT is slow on the day; slides with the numbers (reachable cases, cases generated, bugs found, tickets covered) | must | 5 |
| B3.5 | User guide `docs/SESSION.md` (what each step asks, what it shows, what the basis sentences mean) | stretch | 5 |

### Aanya, day by day

- **Day 1**: B1.1, B1.2 (on the mock), B2.1. Done when the session shell runs on the mock end to end and the v2 sheet imports with ≥ 30 reachable.
- **Day 2**: B1.3, B3.1, B2.2 started (runs in the background while she builds). Done when the understanding card renders the mock and then Animesh's real card; the demo feature pack exists.
- **Day 3**: B1.4, B1.5, B2.2 finished, B2.3 started. Done when sanity and generation render live events from the real routes.
- **Day 4**: B1.6, B1.7, B2.3 finished, B2.4. Done when review → freeze → run works on the real routes; the bug sheet has its 8.
- **Day 5**: B1.8, B3.3, B3.4, B2.5 final; B1.9/B3.5 if time. Done when the demo runs end to end twice on a clean session.

Files: `prototype/public/session-guided.js`, `session-guided.css`, `session-mock.js`, the `#/sessions` and `#/s/` routes in `public/app.js` (one small additive block, agreed with Animesh on day 1), `test-cases/RCA_Real_Bugs_v2*`, `test-cases/build-rca-v2-cases.py`, `test-cases/rca-review-v2.json`, `prototype/data/knowledge/rca-defects.json` (local), `docs/bugs/**`, `docs/DEMO-*.md`, `docs/SESSION.md`. Never `prototype/src/**`.

## 7. The cut line for the demo (if a day slips)

Must have on day 6, in this order: Step 0 → Step 1 understanding card with questions → Step 3 generation with the basis per section → Step 4 approve + upload merge → Step 5 run P0–P1 and the Bugs page → the RCA proof with ≥ 8 bugs. Can be shown as "next": Step 2 sanity (demo it on one flow), Figma (demo on one frame), compare view, v2 diff, eval numbers.

## 8. Working agreements (both)

- Branches `animesh` and `aanya`; each stages only their own files; merge to `demo` each evening after the daily QA pass; `main` untouched until the senior is told.
- Day 1, first hour: both agree the contract in section 4 (names and shapes); after that it is additive only — a new field is fine, a renamed one is not.
- Aanya's mock is the truth for the UI until the real route exists; when a real route lands, Animesh posts the route name in `docs/DAILY-STANDUP.md` and Aanya switches it the same day.
- Hard rules: SELECT only on Procol's DB; `procol-backend` and `procol-client-dashboard` read-only; never commit `.env`, `.auth`, run outputs, ticket text; mask ids and OTPs; QA vendors only; settings switched only through the platform on PROCOL DEMO; one browser run per machine; a Fail is a bug only after a re-read and a fresh-event repeat; one Claude agent at a time, no sub-agents.
- End of each day: one paragraph each in `docs/DAILY-STANDUP.md` (done / blocked / needs the other); the daily QA bugs from B3.2 are the first thing Animesh reads the next morning.

## 9. Risks

- **Rate limits**: generation of 150 cases is 20–40 model calls; the scheduler (A13) and the live progress (B1.5) make waiting visible instead of silent.
- **Figma**: REST needs a token; without it the frame-image fallback is a stretch; say which path was used on the card.
- **Thin PRDs**: the card says "no rule for X" and asks; the question list is the honest output, not a weakness.
- **Browser time**: 150 cases is 6–10 hours of browser; the session offers "P0–P1 now, the rest overnight".
- **Two people, one UAT company**: both create events on PROCOL DEMO; keep the sandbox prefix; never reuse another run's event; browser runs never overlap on one machine.
- **The contract drifting**: any change to section 4 is a line in the standup file first, code second.

## 10. Resumed 19 Nov 2026 — where the plan stands, and the days left

The plan paused after day 2 (14 Nov). From 14 to 18 Nov the time went to the auction-strategy runs, the In-Principle Approval cases, the platform bug hunt, the HubSpot replays and the one-branch merge. The merge matters here: the session engines and Aanya's screens now live on one trunk (`demo`), so the flip from the mock to the real routes is no longer blocked.

**Status by item (measured from the code on `demo`, 19 Nov):**

| Item | State |
|---|---|
| A1 store, A2 environment, A4 intake, A6 understanding, A7 sanity, A13 model queue | Built 12 Nov, verified live on PROCOL DEMO then |
| Questions on screen (§4.1) | Built and verified 13 Nov |
| A8 generation | Built; quick depth verified (8 cases, basis per section). Deep run (100+ cases, 6+ kinds, under 10 min) never measured |
| A9 error-guessing | Reads the RCA tickets (`defectsFor`); does not yet read the 112 open-defect HubSpot cases |
| A10 review | Edit, drop, merge with duplicates, approve into a versioned sheet: built and verified. v2 diff not built |
| A11 run | P0–P1 through the sheet runner, re-run, report: built. The overnight queue is written but the night runner does not read it |
| A5 Figma | Waits for a `FIGMA_TOKEN` |
| A12 generation eval | Not built |
| Aanya B1.1–B1.3 + question card | Built on the mock (14 Nov). Not yet on the real routes |
| Aanya B1.4–B1.7, B2.4, B3.1 | Not started or not shown |

**The days left (demo proposed for Tue 24 Nov):**

- **Thu 19 Nov.** Animesh: walk one session end to end on the real routes after the merge and fix what breaks; the night runner reads the overnight queue; final HubSpot funnel. Aanya: the day-4 brief items 1–3 (branch from `demo`, Environment / Requirement / Sanity / Cases on the real routes on :4320, PRD page Run hands to the sheet runner). Done when Animesh's stand-up names a session id, an approved sheet and a run tally, and Aanya's shows `#/s` working on the real routes.
- **Fri 20 Nov.** Animesh: a deep generation measured (count, kinds, minutes); the generation eval (A12) against a real hand-written sheet (PR assignee, 66 cases); error-guessing also cites the open-defect HubSpot cases; Figma if a token is given. Aanya: Review and Run screens on the real routes (B1.6, B1.7); the known-defect corpus (B2.4).
- **Mon 23 Nov.** Both: re-run on a fresh event and the Bugs page from the session; two clean dry runs of the demo script on a new session; anything that fails is cut by §7, not patched on the day.
- **Tue 24 Nov.** Demo, in the §7 order.
