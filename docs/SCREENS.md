# Screens, the spotlight and the screen library

What spine.ai does when it tests on screen, and how the pictures and the screen knowledge come
about. Built 20–21 October 2026.

## The spotlight: a photograph of every action

Every browser plan now leaves a picture of each thing it did, with the control it acted on framed:

- before a click, a fill, a check or a chosen option, the runner draws a magenta frame around the
  control, dims the rest of the screen, writes "Step 4/12 · click · Publish" on a label, takes the
  picture, removes the frame and acts;
- after every assertion that passes, it takes a green "✓ Verified · …" picture of the screen it judged;
- generic assertions on one control (`expect_text`, `expect_visible`) frame that control in green.

The pictures are JPEGs under `procol-ui-tests/evidence/<run>/spot-…jpg`. Each goes out live to the
dashboard (the browser panel of a session shows it the moment it is taken; a "Screenshots" strip
under the browser collects them, click one to enlarge), and each step of the saved result carries
its own pictures (`spotlights[]`). Nothing in the product is touched: the frame is an overlay with
`pointer-events: none`, removed before the click it photographs.

Code: `procol-ui-tests/src/plan/spotlight.ts`. It patches the Playwright locator prototype once, so
every page object, generic step and vendor-portal page is covered without changing them. Off with
`UI_SPOTLIGHT=0`; at most 160 pictures a run.

## The screen library (dashboard → Screens)

A **walk** is a browser plan with `inventory_screen` at every section: spine.ai goes through the flow
as a buyer would and, at each section, records every visible control (kind, name, disabled,
required, placeholder, hint, **its box on the screen**), the headings and messages, a plain
screenshot and a **numbered map** (every control framed and numbered). Walks on offer: the events
list and its tabs · create an eRFX project (technical + RFQ) through to publish, participants, a
surrogate bid and Master QCS · a single-stage auction · a BOQ draft · compare and award (from an
event the API builds with bids in) · the award proposal · RFQ → auction conversion.

Each screen then becomes a record (`prototype/data/screens/<label>.json`):

- **what each control does** — the model writes "does / affects / leads to / how to check" for every
  numbered control, grounded in the rules Procol's own code enforces on that screen
  (`data/rules/events-rules.json`); a cited rule must be one it was given, and a control it cannot
  ground is "not known yet", never invented;
- **test cases written from it** — the screen-cases agent drafts cases a tester could run on the
  screen (`GEN-SCR-…`), each compiled to a browser plan;
- **how to reach it** — the plan steps that got there, so a new case about that screen can be routed.

Every record also writes a memory page (`prototype/knowledge/events/screens/<label>.md`); after
`npm run rag:build` the planner recalls it, and the compiler's prompt lists the known screens with
the steps that reach each one.

On the Screens page: hover a control or a box on the picture to see what it does; pick one and press
**Write a test case from this**; type something in **Test something new on this screen** and spine.ai
compiles it with the route to that screen in front, saves it, and runs it with the spotlight on,
streaming the framed pictures as it goes.

## A typed journey becomes test cases (Run tests → the Test cases tab)

A sentence typed into Run tests is compiled to a plan and, from 26 October, read back as **test
cases** at once — so a run never passes without saying what it tested:

- **On this journey.** The journey itself is case J-0; every assertion the plan makes is a case of
  its own, with the acts before it as steps and the assertion as the expected result, in a tester's
  words ("The toolbar shows 2 line item(s)"). Then the model drafts what a senior tester would
  add for that flow — refusals, edge values, state checks, the numbers that must be right — grounded
  in the rules Procol's code enforces. Each draft is matched against the written catalog: one the
  catalog already has shows its id; a new one is saved as a draft (`GEN-JRN-…`, in
  `test-cases/generated-<date>.md`) and marked **new**. A draft an earlier journey wrote is reused by
  title, not saved twice.
- **Tested.** When the run ends every case is marked from the steps that cover it: passed, failed
  (with the app's words), not reached (the run stopped before it), or not run (no step of this plan
  checks it yet). A refusal case can only be proved by a refusal assertion, never by the happy
  path beside it; a case maps to a step only when the words that say *what* is checked overlap.
- **New test cases found on this run.** The runner (`UI_DISCOVER=1`, on by default from Run tests)
  inventories every screen the run reaches for the first time — path with ids stripped, controls,
  boxes, numbered map — and after the run the screen-cases agent writes the cases those screens
  deserve (at most 4 a screen, 6 screens a run; a screen the library already has 4+ cases for is
  only re-photographed). They appear under the journey's cases, saved to the catalog as
  `GEN-SCR-…` drafts, each runnable from the Screens page.
- **Export.** Excel, CSV or Markdown of all of it — id, title, steps, expected, result, the app's
  words, source (journey / catalog / new, and the screen it came from), the rule it rests on.

Everything is kept in `prototype/data/journeys/<runId>.json` (`GET /api/journeys`,
`/api/journey?run=`, `/api/journey/export?run=&format=csv|md|xlsx`). A plan-only run (`dry=1`)
still gets its cases. Code: `prototype/src/agents/journeyCases.ts`, the hooks in `/api/plan-run`,
`public/session.js` (the Test cases tab), the discovery in `procol-ui-tests/src/plan/runPlan.ts`.

## A journey no step covers never stops at "not tested" (26 Oct, evening)

Typed: *create an event from a purchase requisition (PR), invite three vendors, accept one bid*.
The step catalog knows events, not purchase requisitions, so the compiler says coverage "none".
The run used to end there. Now:

1. **Find the screen.** `src/agents/routeFinder.ts` scores the console's own routes
   (`data/console-routes.json`, 86 static paths with their names and breadcrumbs read from the
   client-dashboard's `routeConfigs.js`) against the journey's words — buyers' words included
   (PR, PO, intake, supplier, DOA, HSN…) — and a fast model confirms among the top candidates.
   The event screens (`/orders`, `/project`) are never explored: they belong to the step catalog.
   A path typed in the words (`/purchase-requisitions`) wins outright.
2. **Ask only on real doubt.** When the words do not name a screen, the session shows a question
   with the best guesses as chips (and a box to type a menu name or path); the run waits for the
   answer — with a deadline (10 min), so it always ends. `src/agents/questions.ts`,
   `POST /api/ask/answer`.
3. **Explore it, in the session.** The explorer (`src/agents/explorer.ts`, auto mode) opens the
   screen, photographs and inventories it, writes its test cases from the controls and the rules
   Procol's code enforces there, saves them to the catalog (`GEN-SCR-…`), and **runs every case
   that compiles** — every generic step on a non-event screen (`go_to` the path, click, fill,
   expect_text / expect_visible…; the event steps are stripped there, after `expect_events_list`
   failed a healthy PR page). The compiler is told the screen's exact controls and headings
   (`CompileOptions.screen`), so naming one is a known label, not a guess.
4. **Ask about failures nobody can classify alone** — "A product bug / Expected / The test did it
   wrong / Skip" — again with a deadline (5 min); a failure that is the plan's own fault (an empty
   `expect_count`, a key the step refuses) is classified without a question. A case no step can
   do is reported as *not checked* with what is missing, and a note typed in the composer teaches
   it next time.
5. **End honestly.** The DONE box says "No step covered this journey, so spine.ai opened
   Purchase Requisition …: N cases written, worked / broken / not checked"; the Test cases tab
   has each case with its verdict and the app's words; the export has it all.

A partly covered journey runs its plan first, then explores the gap's screen the same way when
the words name it clearly (never a question in that case). `explore=0` on `/api/plan-run` turns
exploration off. Orchestration: `src/agents/journeyExplore.ts`; the session UI's question box,
exploration lines and per-case verdicts: `public/session.js`.

## Every kind of event: the combination run

`scripts/combo-night.ts` runs the product's own grid — entry path (eRFX, single-stage, BOQ) × stages
(auction, RFQ, technical, technical + RFQ, technical + auction) × auction strategy (rank, price,
traffic light) × awarding rule (lot, line item) × line items × outcome (publish, draft, surrogate bid,
two vendors, counter offer, RFQ → auction) — 25 combinations, each a browser plan with the spotlight
on. Results land in `data/combos/latest.json` and on the Screens page.

## Running it

```bash
cd prototype
npx tsx scripts/screen-walk.ts --list                 # the walks
npx tsx scripts/screen-walk.ts --walks list,create-erfx
npx tsx scripts/combo-night.ts --list                 # the grid
npx tsx scripts/combo-night.ts --only E1,S4
npx tsx scripts/screen-record.ts --fill-cases         # cases for library screens without any
npx tsx scripts/ui-plan-run.ts plan.json              # any plan, spotlight on, from the terminal
bash scripts/demo-night.sh                            # walks → combinations → cases → memory
```

One browser at a time: the dashboard server and a script each own a browser slot, so do not start a
walk from the dashboard while a script run is going.
