# Procol Autonomous QA Platform

An AI system that conducts a QA investigation against Procol: it decides what to test, drives the
real product in a browser, judges the evidence, and remembers what it found.

> **This repository must stay private.** `procol-ui-tests/src/config.ts` carries sandbox credentials
> as defaults (buyer phone, OTP, vendor email, internal `*.ag-ri.in` hostnames), and
> `prototype/knowledge/` holds mined API contracts and defect history. Procol's own source
> (`procol-backend/`, `procol-client-dashboard/`) is deliberately git-ignored and is **not** part of
> this project.

## The pieces

| Directory | What it is |
|---|---|
| `prototype/` | The platform: LangGraph agent orchestration, the two-tier QA memory (RAG), the Oracle, the dashboard. |
| `procol-ui-tests/` | Playwright browser automation — the journeys the platform actually runs, plus the execution-layer Oracle that records evidence and issues verdicts. |
| `procol test/` | Playwright API automation — the same idea at the HTTP layer. |
| `test-cases/` | The written catalog both automations implement — 648 humanised UI and API cases for the whole events flow, traced to the PRD, the backend contract and the create-screen contract. **The source of truth**: edit the markdown, then `npm run cases:import`. |

`prototype` spawns `procol-ui-tests` as a child process, so **keep the three code directories
siblings** exactly as they are checked out. Relative paths (`../procol-ui-tests`) depend on it.

## How it fits together

```
you type an instruction
        │
        ▼
  Interpreter ── picks a journey from the real catalog + its parameters
        │           (never invents one; says so when nothing covers your ask)
        ▼
   QA memory ── what SHOULD happen here · what HAS broken here before
        │
        ▼
   Playwright ── drives the live console deterministically
        │
        ▼
     Oracle ── product defect? test gap? harness? environment?
        │        deterministic — from HTTP codes, the app's own messages,
        │        the final URL. An LLM never decides pass/fail.
        ▼
    Findings ── grouped by defect, with evidence and reproduction
```

## First-time setup

```bash
# 1 · install
cd prototype && npm install
cd ../procol-ui-tests && npm install && npx playwright install chromium
cd "../procol test" && npm install

# 2 · configure (ask a teammate for the values — never commit these)
cp prototype/.env.example prototype/.env
cp procol-ui-tests/.env.example procol-ui-tests/.env
cp "procol test/.env.example" "procol test/.env"

# 3 · build the QA memory (embeds the knowledge base locally, ~10s)
cd prototype && npm run rag:build

# 4 · run the dashboard
npm run serve      # then open http://localhost:4300
```

`GROQ_API_KEY` in `prototype/.env` turns on the LLM. Without it the platform still runs end to end —
routing falls back to keyword matching and agent narration is templated — so nothing hard-fails in a
demo.

## Running things

```bash
# One browser journey, watching it happen
cd procol-ui-tests
UI_LINE_ITEMS=3 UI_QUIET_MAP=1 npx playwright test tests/ui-master.spec.ts -g "events\.rfq_only" --workers=1 --headed --reporter=line

# The whole events module (11 journeys, ~25 min)
UI_LINE_ITEMS=2 UI_QUIET_MAP=1 npx playwright test tests/ui-master.spec.ts -g "events\." --workers=1 --reporter=line
```

Run-time parameters (all optional): `UI_LINE_ITEMS`, `UI_BOQ_ITEMS`, `UI_TEMPLATE`,
`UI_SCHEDULE_MINUTES`, `UI_AI_HEAL=1`, `ACTIVE_CLIENT`, `COMPANY_ID`, `QA_RUN_ID`.

## Adding a new journey step (the pattern)

Every step a journey can vary is a parameter, so the AI can drive it without new plumbing. Four
edits, always the same four:

1. a reader in `procol-ui-tests/src/master/params.ts`
2. the step itself on the page object (`src/pages/CreateEventPage.ts`)
3. a field on `UiRunOptions` in `prototype/src/ui/uiFlowRunner.ts`, passed through as an env var
4. a field on `UiIntent` in `prototype/src/agents/uiIntent.ts` so an instruction can set it

`UI_TEMPLATE` and `UI_SCHEDULE_MINUTES` are worked examples of exactly this.

## Working together

Two rules keep this pleasant:

- **Never commit a `.env`, `.auth/`, or anything under `findings/`.** `.gitignore` covers them; don't
  force past it. If you need to share a value, share it out of band.
- **Never add `procol-backend/` or `procol-client-dashboard/`.** They are company repositories that
  happen to live in the same folder for reference. `git add -A` will not pick them up — keep it that
  way.

Branch, then open a PR:

```bash
git checkout -b your-name/what-you-are-doing
git add -A && git commit -m "what changed"
git push -u origin your-name/what-you-are-doing
```

Both TypeScript projects must typecheck before you push:

```bash
cd prototype && npx tsc --noEmit && cd ../procol-ui-tests && npx tsc --noEmit
```

## Writing a test case and having it run

Type a test case in plain English on the dashboard and press **Compile my test
case & run it**. It is compiled into a plan of steps the executor implements,
shown to you before it runs, and executed against the live console:

```
open_create -> compose_stages{rfp,rfq} -> set_title -> switch_stage{rfp} ->
select_template -> add_line_items{3} -> expect_line_items{3} ->
fill_questionnaires -> assign_evaluator -> switch_stage{rfq} ->
select_template -> fill_sheet -> set_schedule -> invite_vendor -> publish ->
expect_published -> expect_no_error
```

It is a **compiler, not a code generator**. The vocabulary is fixed
(`procol-ui-tests/src/plan/steps.ts`), a step that does not exist is dropped by
name, and each step delegates to the same healed, self-verifying page-object
method a hand-written journey uses. A model that can only choose verbs the
machine can perform cannot produce a run that silently tests nothing.

A **linter** then repairs the plan against the invariants the product enforces —
a template before line items, a technical stage's questionnaires and evaluator,
the schedule committed before publish — and names each repair rather than
correcting silently.

You can also give it a catalog id (`FE-2.4`, `BE-2.11`) and it will resolve the
real case from `knowledge/events/` before planning.

## The written catalog, and running a case by hand

`test-cases/events-ui.md` and `events-api.md` hold **648 cases written for
people** — each one says why it matters before it says what to do, and how to
tell whether it worked. They are the source of truth; everything below is
derived from them.

```bash
cd prototype
npm run cases:import      # test-cases/*.md  →  data/test-cases.json
npm run cases:coverage    # what the catalog covers vs what actually runs
```

The dashboard's **Test catalog** panel lists them with filters (layer, section,
priority, verdict, free text). Tick the ones you want, press **Run selected
cases**, and each one is run one at a time.

The point of that panel is the little tag on every row, which says how that
case will actually be run:

| Tag | What happens |
|---|---|
| `built journey` | A hand-written, healed journey covers it exactly — deterministic, no compile step. |
| `exact API case` | The API framework already implements this case by its own id, and runs it. |
| `API area only` | **Weaker.** No exact runner; the framework's cases for that area run instead. Real traffic against the right endpoints, but not this case. |
| `compiled plan` | The prose is compiled into a plan, shown to you, then executed. |
| `for a person` / `no runner yet` | Not runnable, and not offered as if it were. |

Measured, not claimed — `npm run cases:coverage`:

```
Catalog: 648 cases — 362 UI, 286 API
Routable to a real runner: 588/648  (60 not)
  ui-compile   323      api-case     22
  api-section  208      api-suite    18
  manual        23      ui-journey   17
  none          37
```

The 37 with no runner are honest gaps: the vendor's technical response, the DB
persistence oracles, auth/session and the non-functional cases have nothing at
the API layer that covers them yet.

**A distinction worth keeping.** `API area only` is deliberately a different
colour from `exact API case`. Running the framework's line-item cases is not
running `API-LI-007`; a dashboard where all 648 rows showed the same green tick
would make the pass rate meaningless, which is worse than showing a gap.

### The API cases run in process

`procol test/` implements the contract cases and judges them with its own
Oracle. The platform imports those modules directly by `file://` URL rather
than spawning `npx playwright test`, so one login and one set of fixtures are
shared across every case you pick:

```
building the shared fixtures (draft, staged, active, auction events)…
PASS  BE-1.1  POST /event_groups          200 (want 200)  609ms
PASS  BE-1.2  POST /event_groups          422 (want 422)  341ms
PASS  BE-3.1  PATCH /event_groups/:id     200 (want 200)  507ms
```

About half a second per case once warm, against roughly a minute each if every
case paid for its own runner start-up, login and fixture build. The verdict is
the framework's own `judgeContractCase` — there is one Oracle, and it stays
deterministic.

```bash
npm run cases:api BE-1.1 BE-1.2 BE-3.1     # straight from the terminal
npm run cases:compile UI-TPL-001           # compile one written case to a plan
```

### The catalog is also memory

Every case is indexed into the QA memory as its own chunk (1240 chunks total),
so the planner retrieves the written expectation for whatever it is about to
test. A catalog id is accepted anywhere a test case is:

```
npm run cases:compile UI-TPL-001
  resolved UI-TPL-001 from the test-case catalog
  open_create -> set_title -> select_template -> expect_no_error
```

## The automation follows the test cases — and says when it cannot

The compiler no longer just produces a plan; it says **how much of the case
the plan actually tests**:

| Coverage | What happens |
|---|---|
| `full` | Every behaviour the case checks has a step. Runs; can pass. |
| `partial` | It runs, but something the case asks for has no step yet. The verdict is **PARTIAL**, never PASS. |
| `none` | The *subject* of the case has no step. It is reported **not run** — running the nearest steps and calling it a pass is the worst possible outcome. |

Everything the compiler could not express goes on a ledger,
`prototype/data/vocabulary-gaps.json`, shown on the dashboard as **Steps the
automation still needs**, most-asked-for first. That list is the build order:
build the top gap as a step, regenerate the vocabulary, and every case that
needed it compiles without anyone touching it.

```bash
cd procol-ui-tests && npx tsx scripts/dump-plan-catalog.ts   # publish the vocabulary after adding a step
```

Worked example, `UI-ENV-002` (the Create Event menu): the compiler said
*partial — no step to assert which options the menu offers*; two steps were
built (`expect_create_options`, `expect_url_contains`); the live run then read
the menu — *Single Stage · eRFX Project · BOQ based RFX Project* — and the
verdict stayed PARTIAL, because the case's negative branch (tenant flag off)
still has no step. That is the correct answer.

## Combinations — every event type, reached the way the product reaches it

`prototype/knowledge/events/event-permutations.md` maps what a request can
legitimately ask for — entry path × stages × auction strategy × line items ×
vendors × bidding side × awarding rule × outcome — with the screen and the
steps that reach each, and the combinations that are impossible (RFQ +
Auction composed on one screen) or conversion-only (knockout, dutch). It is
indexed into the memory and distilled into the compiler's rules, so a
sentence like *"single-stage price-based auction, award the whole lot"*
compiles to `open_create{single-stage} → configure_single_stage{auction,
price, lot} → …`, and *"convert the published RFQ to an auction"* compiles to
`compose_stages{rfq} → … → publish → expect_published → convert_to_auction`.
The executor knows which screen it is on: the same step names — title, template, line items, invite, publish — act through the single-stage page object when the plan is on that screen, so the compiler keeps one vocabulary.

## Counter offers, from the product's own trigger

On a published stage's **Responses** sub-tab (the stage's own comparison
grid — not the project-level Master QCS, which shows the same bids without
header actions), each vendor's column header carries the buyer's **Counter
Offer** button while that bid is live and active; a pending accept/reject
request or an approval view takes that slot first. `place_counter_offer
{vendor, price, remark}` waits for the stage page to finish loading, opens
Responses, presses it, fills the drawer's sheet, adds the remark and sends;
`expect_counter_offer_sent` reads the mark on the bid. Verified live on 11 September: a 16-step plan from one sentence — publish, vendor bid, Master QCS, counter offer of 90 to AMD, mark on the bid, and a **Revoke Counter Offer** control on screen afterwards. The vendor's side exists too: `accept_counter_offer{vendor}` signs into the supplier portal as the vendor and accepts, and `expect_counter_offer_accepted` reads the accepted mark on the buyer's grid. The
surrogate drawer, the vendor portal's bid sheet and the counter-offer drawer
share one sheet filler (`procol-ui-tests/src/support/sheet.ts`).

## Demos: visible login, demo pace

Tick **demo pace + visible login** (headed runs only). The run drops the
saved session in the *same* window, logs in for real so the OTP flow is
seen, and spaces every action a quarter-second apart. Verification runs stay
headless and fast, and the strip at the top narrates them step by step —
*"Running plan … (headless) — step 4/9 fill sheet"*.

## One browser, one case at a time

Every browser run takes a single process-wide slot
(`prototype/src/ui/browserSlot.ts`) before spawning Chromium. Start a second
run and it **queues** — the dashboard says *"waiting for the browser — X is
using it (position 1)"* — and starts the moment the first finishes. The strip
at the top of the dashboard shows what holds the browser and for how long.
Two windows never open again, whichever buttons are pressed.

## Plain-language runs

The catalog panel narrates each run as it happens — *"Testing 2 of 5:
UI-TPL-001 — … Read the test case and decided on 4 steps: open the eRFX create
screen → give the event a title → pick a pricing template → check the app
showed no error"* — with each step ticking in place. Tick **raw log** to see
Playwright's own output underneath.

## Slingring

Procol's OpenAI-compatible gateway is the primary provider the moment
`SLINGRING_API_KEY` is in `prototype/.env`:

| Tier | Model | Used for |
|---|---|---|
| `reason` | `HACK26_GPT_6_ASTRA` | the compiler — where a wrong answer is a wrong run ($50/1M, spent deliberately) |
| `fast` | `HACK26_GPT_5_6_LUNA` | routing, narration, the inner loop |
| embeddings | `HACK26_TEXT_EMBED_3_LARGE` | the QA memory (`npm run rag:build` after adding the key) |

Agent code names a **tier, never a model**. The chain is Slingring → Groq →
Gemini, every hand-off logged, and the gateway's reported token usage is
tallied per model at `/api/ai-usage` and on the dashboard strip, so the daily
allowance is visible rather than discovered at 10am. The memory records which
embedder built it; add the key after a build and retrieval goes word-only with
a visible "run `npm run rag:build`" until you do.

**What the gateway actually did on 2026-09-11** (probed, not assumed):

- Every `HACK26_GPT_*` request was served by `azure_ai/Kimi-K2.7-Code`, the
  gateway's fallback — a *reasoning* model. The client therefore adds a
  1,500-token reasoning allowance to every budget, treats empty `content` as a
  failure to hand down the chain, and logs the model that **actually answered**
  (`[llm] slingring served "HACK26_GPT_6_ASTRA" with azure_ai/Kimi-K2.7-Code`).
  Spend is tallied against the served model.
- `HACK26_TEXT_EMBED_3_LARGE` failed upstream (Azure key not configured on the
  gateway, no fallback group). The embedder probes the endpoint once at startup
  and at build time; on failure the whole process uses the local 384-dim model
  and the store says so. Nothing is indexed half with one embedder and half
  with another.
- The hackathon key is scoped to the HACK26 models only; `FAST_SMALLER` and
  `BIG_THINKING` are refused by name.

## Measuring the AI, not trusting it

```bash
cd prototype
npm run eval:routing    # 102 cases: does an instruction reach the right journey?
npm run eval:planner    # 42 cases: does a test case compile into a runnable plan?
```

Current, measured live:

| | |
|---|---|
| Routing — journey accuracy | 98.0% (100/102) |
| Routing — parameters (line items, template, duration) | 100% |
| Routing — caveat precision / recall | 100% / 100% |
| Planner — runnable plans | 100% (42/42) |
| Planner — compiled clean, no repair needed | 28/42 |

These are **evaluation** sets, not training data: they measure accuracy and
catch regressions, they do not change model weights.

Both evals have earned their keep. The routing one exposed that vendor-portal
and mobile requests produced no caveat; the planner one exposed that
`openai/gpt-oss-120b` is a reasoning model returning HTTP 200 with empty content,
which was silently degrading every plan to a generic default.

The planner eval also carries the case that found the worst bug in the
compiler. `UI-ENV-001` is about reaching the events **list**; the vocabulary had
no step for that, so the compiler reached for `open_create`, the linter added a
mandatory title, and the plan **passed** — having opened the create screen and
never looked at the list. `open_events_list` / `expect_events_list` now exist,
`lintPlan` decides which screen a test is about before any repair runs, and
three eval cases hold it in place: a list case, the same case in different
words, and a create case that must not pick the list step up.

## Providers

Groq first, Gemini as fallback (`GOOGLE_API_KEY`, already needed for the UI
healer). Groq's free tier has a 200,000 token daily ceiling; hitting it
mid-demo would otherwise turn every agent into its deterministic fallback with
no visible cause. The swap is logged so output is never attributed to the wrong
model. With no key at all, routing falls back to keyword matching and the
platform still runs end to end.

## A note on the environment

`PATCH /api/event_groups/:id` used to return 500 on every event save and
publish. The cause was ours, not the product's: the pricing sheet's **Delivery
location** was never filled, because the grid names that column `buyer_hub`
while the template schema calls it `delivery_location`. With it filled, events
publish.

That 500 is still worth reporting — a missing required input should produce a
422, not an unhandled 500 — but it is not a release blocker, and the earlier
write-up in
[`prototype/knowledge/events/regression-event-group-update-500.md`](prototype/knowledge/events/regression-event-group-update-500.md)
draws the wrong conclusion. Read it as a record of the investigation, not as a
current finding.
