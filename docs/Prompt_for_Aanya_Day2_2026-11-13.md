# Prompt for Aanya's Claude — day 2 onward

Written by Animesh on 13 Nov 2026 (Slack, 16:11). It replaces nothing in `docs/Prompt_for_Aanya_RCA_Bugs.md`; it adds how the two of us build together from today, what Animesh is building (so Aanya never builds the same thing), the new on-screen questions feature, and how everything merges at the end. Saved here verbatim by Aanya's Claude the same afternoon.

---

You are the Claude working with Aanya on spine.ai, Procol's QA platform (repo procol-qa-platform, my checkout on branch aanya). Animesh builds the backend engines of the guided testing session on his branch rca-wt; I build the screens of that session and the "prove spine finds real bugs" corpus. This prompt tells you how we work side by side so that nothing is built twice and the final merge is a formality. Read it fully before touching a file, then start on §6.

## 1. The one rule of the collaboration: owners, not areas

Every file has one owner. The owner edits it; the other person reads it and asks for changes in the stand-up file.

| Owner | Files |
|---|---|
| Animesh | `prototype/src/session/*` (store, environment, intake, understanding, sanity, generation, review, execution, questions), `prototype/src/routes/guidedSession.ts`, `prototype/src/checks/*`, `prototype/src/agents/*`, `prototype/scripts/*`, `procol-ui-tests/*`, everything under `prototype/data/` |
| Aanya | `prototype/public/session-guided.js`, `prototype/public/session-guided.css`, `prototype/public/session-mock.js`, `docs/demo-pack/*`, `.local-rca/*` (never committed), the RCA sheets under `test-cases/rca-*` |
| Shared, append only | `docs/DAILY-STANDUP.md` (each person writes under their own dated heading), `prototype/public/index.html` (my ONE nav line for #/sessions, nothing else), `prototype/public/app.js` (my ONE route block for #/sessions and #/s/<id>, nothing else), `docs/bugs/platform-fixes-needed.md` (I add rows, Animesh ticks them) |

Never edit a file in Animesh's rows. If the backend needs a change for the screen to work, write the exact need in the stand-up file (route, field, example payload) and build against the mock until he lands it. Never edit `prototype/src/routes/session.ts` either: that is the older chat route and it is not ours.

Hard rules that still apply: SELECT only on Procol's database; procol-backend and procol-client-dashboard are read only; never commit .env, .auth, run outputs, findings, HubSpot or RCA ticket content (RCA workbooks stay in .local-rca/, which git ignores); mask secrets and OTPs; invite QA vendors only; never GMMCO; settings are switched only on PROCOL DEMO (198678) through the platform, and restored.

## 2. What Animesh is building (do not build any of this)

- The six engines behind the session and every /api/session/... route listed in §3.
- The on-screen questions engine (§4): the backend decides WHEN to ask and WHAT to ask; it stores the questions on the session and streams them. I build only the card that shows them and posts the answer.
- The sheet runner, start states built by API, settings switching, fairness rules, stored text plans, night scripts, the fixes list in docs/bugs/platform-fixes-needed.md.
- Case generation quality (kinds, depth, basis sentences, "already have it" twins).

If a step screen seems to need logic (deciding which flows to run, judging a verdict, de-duplicating cases), it does not: the route already returns the decision. The screen shows it.

## 3. The contract I build against (fixed names; additive after day 1)

All under /api/session/. Long work streams Server-Sent Events as JSON lines {type, ...}.

```
POST   /api/session/start              {name?}                                → {id, step}
GET    /api/session/list                                                      → {sessions:[{id,name,step,env?,feature?,updatedAt,stale[]}]}
GET    /api/session/kinds                                                     → {kinds:[{kind,basis}]}
GET    /api/session/env/profiles                                              → {profiles}
GET    /api/session/env/describe?url=                                         → what the URL points at + the companies it offers
GET    /api/session/:id                                                       → the whole session (env, intake, understanding, sanity, generation, review, execution, questions, stale)
DELETE /api/session/:id                                                       → {deleted}
POST   /api/session/:id/rename         {name}                                 → the session
POST   /api/session/:id/reopen         {step}                                 → the session (later steps kept, marked stale)
POST   /api/session/:id/env            {url, companyId?, signIn?, apiBaseUrl?, tokenVar?, headerName?, label?}
                                       SSE: line, reach, signin, settings, gates, vendors, ask, answered, done{profile} | error{why}
POST   /api/session/:id/env/use        {profileId}                            → the session
POST   /api/session/:id/intake         {prd:{text}|{name,data}, notion:{url}, figma:{url,token?}, frames:[{name,data}], sheet:{name,data}}  (files base64)
                                       SSE: line, parsed{what,ok,line}, understanding{card}, questions[], ask, done | error{why}
GET    /api/session/:id/understanding                                         → {card}
POST   /api/session/:id/answer         {questionId, answer} | {questionId, skip:true}  → {card}   (the PRD's Q1…Qn; same as answering them through §4)
POST   /api/session/:id/apply                                                 SSE: line, understanding{card}, done | error{why}
POST   /api/session/:id/sanity         {flowIds?}                             SSE: line, flow-start, frame, flow-done{flow}, ask, answered, done{result} | error{why}
GET    /api/session/:id/sanity                                                → {result}
POST   /api/session/:id/sanity/accept                                         → the session
POST   /api/session/:id/generate       {kinds[], depth:"quick"|"standard"|"deep"}
                                       SSE: line, section-start{kind,basis,planned}, case{row}, section-done{kind,count,existing,note?}, ask, done{generation} | error{why}
GET    /api/session/:id/generation                                            → {generation}
GET    /api/session/:id/review                                                → {sheet, cases, sections, frozen?}
POST   /api/session/:id/review         {edits:[{id,patch}], drops:[id], approve?:true|[ids]} → {edited, dropped, sheet?:{id,name,version,count}}
POST   /api/session/:id/merge          {name, data}                           → {added, duplicates:[{id,title,matches}]}
POST   /api/session/:id/run            {scope:"all"|"p0p1"|"sections", sections?, overnightRest?}  SSE: the sheet runner's events, ask, answered, queued{…}, done
POST   /api/session/:id/rerun          {caseId}                               SSE: the sheet runner's events, done
GET    /api/session/:id/report                                                → {sheet, runs[], tally, latest, bugs[], queued}
```

The exact event payloads are in the header comment of prototype/src/routes/guidedSession.ts once I pull his branch; until then the shapes in docs/Guided_Testing_Session_Plan_2026-11-12.md §4 and the stand-up entries are the truth. My mock (session-mock.js) must use these exact names and shapes, so flipping one step from mock to real is one flag.

## 4. New today: the platform asks the tester on screen

Animesh is building this today in prototype/src/session/questions.ts. The product idea: whenever the platform is unsure, it stops and asks, the way a careful colleague would, in words anyone can read, and it goes on when answered. It can ask several questions in a row. It asks at every step:

- Environment: "This address hosts several companies. Which one should I test?"
- Requirement: "I found 5 flows in the PRD. Which ones should I test?" (all ticked by default), the PRD's own open questions ("The PRD doesn't say who may counter-offer. Who should I assume?"), and "Feature X is switched off on PROCOL DEMO. Switch it on for the runs and back after, or leave its flows out?"
- Sanity: "I couldn't reach the flow 'Publish an RFQ' because the company has no QA vendor. Skip it, or try again after you fix it?"
- Cases: "For case SSR-004 the PRD doesn't say what should happen when the bid is below the minimum. What should happen?"
- Run: "7 cases need a company setting I can only switch on PROCOL DEMO. Run them anyway (they'll likely come back 'Couldn't tell'), leave them out this time, or stop?"

The contract:

```
GET  /api/session/:id/questions                              → {questions:[Q], open:n}
POST /api/session/:id/questions/answer   {qid, answer} | {qid, skip:true}   → {ok, question:Q, why?}
GET  /api/session/:id/questions/stream   SSE: ask{question}, answered{question}, closed{qid, how:"deadline"|"cancelled"}, ping
```

and every step stream above also carries ask{question} and answered{question} while it runs.

```
Q = {
  qid: "q7",
  step: "requirement",                      // environment | requirement | sanity | cases | review | run
  source: "flows",                          // company | flows | prd | setting | sanity | cases | run
  kind: "yes-no" | "one" | "many" | "text",
  text: "Which of these 5 flows should I test?",          // ONE plain sentence
  why: "A flow you don't tick gets no sanity run and no cases.",   // ONE plain sentence, may be empty
  options: [{ value: "FL1", label: "Create a single-stage RFQ", means: "7 steps, ends with the event live" }],
  suggested: "FL1,FL2",                      // what the platform would pick (comma-joined for many)
  blocking: true | false,                    // true: the run waits for the answer (until the deadline)
  deadlineAt?: "2026-11-13T10:42:00Z",       // only when blocking
  ifNoAnswer?: "I'll go with the suggestion.",
  askedAt, answer?, answeredAt?, skipped?: true, outcome?: "2 flows left out", closed?: "deadline" | "cancelled"
}
```

What I build (the only frontend for it):

- The question card, one component used by every step screen and by a small "Questions" drawer in the session shell. It shows text big, why small under it, the options as buttons (label on the button, means under it in grey), the suggested one outlined, a text box for text questions and as "Other…" for the rest, a "Skip for now" link, and for a blocking question a quiet countdown to deadlineAt with the ifNoAnswer sentence. Several open questions stack in the order asked; answering one shows the next.
- Answered questions stay visible, collapsed, as "You said: … → what changed: outcome", so the tester sees what the platform did with the answer.
- It survives a reload: on opening a session, GET …/questions fills the drawer and GET …/questions/stream keeps it live even when no step stream is open.
- The tone is the product: no jargon on the card, no ids in the sentence, the button label is a thing a person would say ("Yes, test it", "Leave it out", "I don't know"). The backend writes those words; the card never rewrites them, it only shows them.

Mock it first (session-mock.js emits a few ask events per step with the shapes above), then flip to the real stream the day Animesh posts "questions: live" in the stand-up.

## 5. Keeping up day by day

Morning, before any work:

```
git fetch origin
git merge origin/rca-wt        # Animesh's engines land in my branch; my files are never in his commits, so no conflicts
```

Read Animesh's latest stand-up entry: it names the routes and event shapes that went live. Flip those steps from mock to real.

Evening:

```
git add prototype/public/session-guided.js prototype/public/session-guided.css prototype/public/session-mock.js docs/DAILY-STANDUP.md   # and my other owned files
git commit
git push origin aanya
```

Write my stand-up entry: done, verified how, blocked, needs Animesh (with the exact route or field). Never git add -A, never commit .local-rca/, .env, .auth, prototype/data/.

If git fetch origin says the repository is not found, my origin does not point at Animesh's repo (https://github.com/animeshsharmaa208/procol-qa-platform.git) or my GitHub account has no access to it yet. Tell Animesh; until then keep working on the mock and commit locally.

## 6. My plan from day 2 (Track B first each morning, Track A after lunch)

Day 2 (today)

1. Rewire session-mock.js to the exact names in §3 and §4 (events line, parsed, understanding, questions, flow-start, frame, flow-done, section-start, case, section-done, ask, answered, done, error).
2. Build the question card and the drawer (§4) on the mock, on every step.
3. The moment origin/rca-wt is reachable: merge, start the server from the worktree entry spine-demo-merged (port 4320) and point Environment and Requirement at the real routes. Prove it on PROCOL DEMO with the counter-offer PRD in docs/demo-pack/ (or any PRD text).

Day 3 — Sanity and Cases screens on the real routes: flow tick list (pre-ticked from the "flows" question), live frame, verdict chips, blockers; kinds from /api/session/kinds with the basis line under each kind, depth, live section progress, "already have it" badge, the "to confirm" questions appearing as they are asked.

Day 4 — Review and Run screens on the real routes: grouped table, inline edit, drop, merge an uploaded sheet with duplicates shown, approve → sheet name and version; run scope, live tally, per-case latest verdict, standing bugs, the "run" questions, report.

Day 5 — Polish (empty, loading and error states, resume mid-step, reload mid-question, phone width, dark mode), the daily QA checklist on every step, demo pack rehearsal with Animesh; docs/demo-pack/ complete.

Track A, every afternoon — step 2 onward of docs/Prompt_for_Aanya_RCA_Bugs.md: run the first 20 of my 40 that need no special setup now (Animesh reads the 40 and answers in the stand-up; the first 20 are not waiting on that), re-read every Fail against the fairness rules, write the bug sheet with test-cases/bug_sheet.py (it is on origin/main), then the known-defect corpus. The RCA workbook goes in .local-rca/ when Animesh copies it over; until then the two PDFs stand in.

## 7. The merge at the end (so nobody loses work)

- Daily: Animesh pushes rca-wt; I merge origin/rca-wt into aanya each morning; I push aanya; Animesh merges origin/aanya into rca-wt each evening. Because the files are owned, these merges are clean. If a merge ever conflicts, the owner's version of that file wins and the other person re-applies their one-line change.
- Demo day: Animesh pushes rca-wt (which by then contains aanya) to demo: `git push origin rca-wt:demo`. The demo runs from demo.
- main stays untouched until the senior has been told; then demo goes to main through one pull request.
- Nothing is rebased, nothing is force-pushed, no branch is deleted.

## 8. What I need from Animesh (I list these in the stand-up until done)

1. Push rca-wt to origin and give my GitHub account access to the repository, so the frontend runs against the real routes.
2. Confirm the questions contract in §4 once his engine lands (he posts "questions: live" with any field he added).
3. A copy of the real RCA workbook into my .local-rca/.
4. A yes or a veto on the 40 tickets in .local-rca/rca-40-proposal.md.

## 9. Stand-up entry format (every evening, under my own heading in docs/DAILY-STANDUP.md)

```
## 13 Nov 2026 — Aanya
Done: … (one line per thing, each with how it was verified)
Flipped to real: … (which steps now hit the real routes)
Bugs filed: … (rows added to docs/bugs/platform-fixes-needed.md)
Blocked: …
Needs Animesh: … (route, field, example payload)
Tomorrow: …
```

Start now with §6, day 2, item 1.
