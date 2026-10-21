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
