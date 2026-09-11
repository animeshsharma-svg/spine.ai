# Procol Autonomous QA Platform — the complete technical account

*State as of 11 September 2026. Every number below was measured on that day against the live sandbox (`cpanel.ag-ri.in`, company PROCOL DEMO), not estimated.*

---

## 1. What it is, in one paragraph

An AI system that **conducts a QA investigation** against Procol's events module. It takes a written test case — one of 648 in a human-readable catalog, or a sentence typed by a person — decides how that case can actually be tested with the capabilities that exist, drives the real product (a real browser against the real console, or real HTTP calls against the real API), judges the evidence with a deterministic Oracle, files what it finds as defects grouped by root cause, and remembers all of it for the next run. When it *cannot* test something, it says so precisely and writes the missing capability onto a ledger that becomes the build order.

The thesis, stated as an engineering rule: **an LLM decides what to try; it never decides pass or fail.** Verdicts come from HTTP status codes, the application's own error messages, the final URL, and the state of controls on screen.

---

## 2. The three code directories and how they connect

| Directory | Role | Runtime |
|---|---|---|
| `prototype/` | The platform: dashboard server, catalog, routing, compiler, Oracle summary, RAG memory, LLM providers | Node 24, TypeScript run with `tsx`, single process on port 4300 |
| `procol-ui-tests/` | Browser automation: Playwright page objects, the plan executor, learned locators, stuck reports, the UI Oracle | Playwright + Chromium, spawned as a child process by the platform |
| `procol test/` | API automation: 103 contract cases (52 implemented, 51 declared skips with reasons), fixtures, the API Oracle | Imported **in-process** by the platform via `file://` URL (the directory name has a space) |

Two read-only reference checkouts sit beside them and are **git-ignored and never committed**: `procol-backend/` (Rails) and `procol-client-dashboard/` (React). They are read to learn the product's rules (`isValidStage`, `PROJECT_STAGES`, `rfpEvaluationOn`, the `buyer_hub`/`delivery_location` naming) — nothing is executed from them.

**Security constraint, absolute:** the platform never modifies Procol's code, configuration or database. It creates only the sandbox records the frameworks are designed to create, all named so they are recognisable: `UI_Plan_<timestamp>`, `API_Test_Contract_*`, `QA_Platform_*`.

**How the platform reaches the frameworks:**

- UI: `prototype/src/ui/uiFlowRunner.ts` spawns `npx playwright test tests/plan.spec.ts` (for compiled plans) or `tests/ui-master.spec.ts -g "<journey> — "` (for hand-written journeys) inside `procol-ui-tests/`, with parameters passed as environment variables (`UI_PLAN_FILE`, `COMPANY_ID`, `UI_LINE_ITEMS`, `UI_TEMPLATE`, `QA_RUN_ID`…). Output streams back line by line.
- API: `prototype/src/checks/apiCaseRunner.ts` imports `procol test/src/flows/eventsContract.ts`, `identities.ts`, `oracle/oracle.ts` directly. One login and one fixture build are cached for 20 minutes and shared across every case a person picks — ~0.5 s per case once warm, against ~60 s each if every case paid for a runner start-up.

---

## 3. The written catalog — the source of truth

`test-cases/events-ui.md` (362 cases) and `test-cases/events-api.md` (286 cases) are written for people. Each case has a fixed shape:

```
#### UI-TPL-001 — Choosing a template on a fresh stage populates the sheet schema
- **Why it matters.** …
- **Setup.** …          (optional — absent from 218 cases by design)
- **Steps.** …
- **Expected.** …       (may be qualified: "Expected (today)." records current behaviour)
- **Oracle.** …         (how to tell it worked)
- **Trace.** P0 · automate · flow `events.rfq_only` · PRD §3.2
```

`prototype/scripts/import-test-cases.ts` parses both files into `prototype/data/test-cases.json` **without changing them** — the prose stays the thing humans edit; the JSON is a derived artefact. Each case carries: id, layer, section code (`UI-TPL`), the enclosing section heading read from the markdown ("3. Templates and the pricing sheet"), priority P0–P3, the catalog's own verdict (`automate` 261 · `automate-later` 364 · `manual` 23), any feature gate named in Setup (54 cases), and the flows/files the Trace line points at.

Sections: UI — Before you start, Composing the project, Templates and the pricing sheet, Line items, The technical (RFP) stage, Auction configuration, Schedule and the bid window, Participants and audience, Savings/terms, Publish and draft, RFQ → Auction conversion, BOQ events, PR → event, Classic single-stage, The vendor's bid, Surrogate bidding, Awarding, Isolation/masking/permissions, Data validation, Non-functional. API — Auth and session, Creating the draft event group, Creating stages, Activation, Line items, Audience and participants, Vendor technical response, Vendor bid, Surrogate bids, RFQ → Auction, Awarding, Lifecycle, Authorization matrix, Validation and robustness, Persistence, Non-functional.

The catalog is also **indexed into the QA memory, one chunk per case** (944 of the memory's 1,295 chunks), so the compiler retrieves the written expectation for whatever it is about to test.

---

## 4. Routing — how a case reaches a runner, honestly

`prototype/src/checks/caseRouting.ts` assigns each case the **most specific runner that genuinely exists**, most specific first:

| Route | Meaning | Count |
|---|---|---|
| `ui-journey` | A hand-written, self-healing journey covers it exactly (the Trace line names a journey key) | 17 |
| `api-case` | The API framework implements this case by its own id (`BE-x.y` in `CASE_RUNNERS`) | 22 |
| `api-section` | No exact runner; the framework's cases for the same **area** run instead (labelled as such — real traffic against the right endpoints, not this case word for word) | 208 |
| `api-suite` | A validation suite covers the section | 18 |
| `ui-compile` | No journey; the compiler builds a plan from the prose | 323 |
| `manual` | The catalog itself says a person must do this | 23 |
| `none` | Honestly unrunnable today (vendor technical response, DB persistence oracles, auth/session, non-functional) | 37 |

**588 of 648 reach a runner.** The implemented API case ids are read from the framework's own `CASE_RUNNERS` object at runtime — a list maintained by hand would drift the first time someone added a case there. The registry's `SKIP_REASONS` object (51 cases, each with the reason it cannot run yet) is deliberately *not* counted as implemented.

Why the distinction matters: a dashboard where all 648 rows show the same green Run button — half of them quietly compiling to a generic plan — makes the pass rate meaningless. The tag on every row is the product's honesty made visible.

---

## 5. The compiler — a compiler, not a code generator

`prototype/src/agents/planner.ts`, `compileTestCase(text)`.

### 5.1 The vocabulary

The executor implements a **fixed set of 43 steps** (36 at the time of the first eval below; 43 by evening — see §5.5 and the appendix) (`procol-ui-tests/src/plan/steps.ts`, published to `plan-catalog.json`). A model can only choose verbs the machine can perform; a step that does not exist is dropped by name. That is what makes it a compiler: the target instruction set is fixed and every instruction is a healed, self-verifying page-object method.

Actions: `open_events_list`, `filter_events{tab}`, `open_stage_menu{stage?}`, `open_create{path: erfx|single-stage|boq}`, `compose_stages{stages[]}`, `set_title{title?}`, `switch_stage{stage}`, `select_template{name?}`, `add_line_items{count}`, `fill_sheet`, `fill_questionnaires`, `assign_evaluator`, `set_schedule{minutes?}`, `invite_vendor{names?|count?}`, `publish`, `save_draft`, `place_bid{vendor?}`, `place_surrogate_bid{vendor?}`, `award_event`.

Assertions: `expect_events_list`, `expect_create_options{options[],absent[]}`, `expect_url_contains{text}`, `expect_event_in_list{title?}`, `expect_event_status{status,title?}`, `expect_template_selected{name?}`, `expect_sheet_columns{columns[]?}`, `expect_disabled{control}`, `expect_enabled{control}`, `expect_line_items{count}`, `expect_published`, `expect_no_error`, `expect_error{message?}`, `expect_awarded`, `expect_bid_submitted`, `expect_publish_blocked`, `expect_stages{stages[]}`.

Eight of these were built **on 11 September from the gap ledger** (section 5.5): the events-list and menu steps, template/sheet assertions, the status-row reader, the stage-menu opener and the disabled/enabled pair.

### 5.2 The prompt

The model receives: the case text (a catalog id such as `UI-TPL-001` is resolved to the written case's prose first — title, Setup, Steps, Expected, Oracle); the step catalog with each step's purpose and arguments; retrieved memory (top-k *expectations* — catalog cases, mined cases, docs — and top-k *experience* — previous findings and previous plan results for similar cases); and `DOMAIN_RULES`, the product's ordering invariants written as rules:

- First decide **which screen** the case is about. A case about the events *list* uses `open_events_list` and stops; opening the create screen to test the list "passes while proving nothing".
- `open_create` first on a create test; eRFX unless the case says single-stage; stage steps exist only on the eRFX screen.
- `set_title` is mandatory on a create test (publish refuses a nameless event).
- The default stage is **Auction**; any RFQ/technical/two-stage case must `compose_stages`. RFQ and Auction cannot coexist; at most two stages.
- `select_template` before `add_line_items` (the Items drawer is inert until a template exists); `fill_sheet` after line items; technical stages need `fill_questionnaires` and `assign_evaluator`; `set_schedule` before `publish`.
- **Be honest about coverage** (below).

### 5.3 The output contract

```json
{"title":"…","reasoning":"…","coverage":"full|partial|none",
 "cannotExpress":["each thing the case asks for that no step can do"],
 "steps":[{"step":"<catalog name>","args":{…},"note":"why"}]}
```

`coverage` is a first-class result:

| Coverage | Meaning | What happens |
|---|---|---|
| `full` | every behaviour the case checks has a step | runs; can PASS |
| `partial` | it runs, but something the case asks for has no step | runs; verdict is **PARTIAL**, never PASS |
| `none` | the case's *subject* has no step | reported **not run**; nothing is executed in its place |

A model that lists gaps but claims `full` is contradicting itself; the gaps are the more specific claim and win. A model that returns **no steps and a reason** is an honest refusal and is returned as such (`source: llm`, empty plan, coverage `none`) — this branch used to fall back to the generic publish plan, which would have run, passed, and tested nothing the case was about. Only "no steps and no reason" takes the deterministic default, and even that is marked `partial`.

### 5.4 The linter

`lintPlan(plan, testCase)` repairs a plan against the invariants the product enforces and **names every repair** rather than correcting silently. It decides list-test vs create-test **once, before any insertion** (an inserted step must not flip the classification — that bug moved `open_create` to the front and bolted a title onto a list test). Rules include: list plans start with `open_events_list` and assert something; a create-screen URL check gets `open_create` inserted before it; `compose_stages` when the case names RFQ/technical; `open_create` first; `select_template` before `add_line_items`; `invite_vendor` after the line items (vendor suggestions come from the products' audience); `set_schedule` before `publish`; a technical stage's questionnaires and evaluator; RFQ+Auction conflicts; bid-before-publish ordering; surrogate vs vendor-side swap by the case's own words; **stripping vendor names the case never mentioned**; and — measured twice on 11 September — `save_draft` needs a template *and* one line item, because the product disables *Save as draft* until then.

### 5.5 The gap ledger — how the automation grows from the cases

Every `partial`/`none` writes its `cannotExpress` items to `prototype/data/vocabulary-gaps.json` (`src/agents/vocabularyGaps.ts`), keyed by case id, and **reconciled on every compile**: when a case stops listing a gap (because the step now exists), the case drops off that gap, and a gap nobody asks for is removed. The dashboard shows it as **Steps the automation still needs**, most-asked-for first. That list is the build order.

Worked example, same day: `UI-TPL-001` compiled `partial` ("no step to assert the selected template name replaces the prompt; the sheet header row matches the template's widget keys") → two steps built (`expect_template_selected`, `expect_sheet_columns`) → the case, **unchanged**, compiled `full` and passed 5/5, reading the live sheet: `product, variant, creator_quantity, buyer_hub, price, participant_quantity, gst, total_amount`. Its gaps left the ledger on that compile.

---

## 6. Execution — the browser layer

### 6.1 The plan executor

`procol-ui-tests/tests/plan.spec.ts` + `src/plan/runPlan.ts`. A plan arrives as a file (`.plans/<runId>.json`; a shell has opinions about quoting that JSON does not survive). `runStep()` is a `switch` over the 36 names, delegating to page objects. `RunState` carries what later steps need: the event's title, the sheet schema (`widgets`) captured from the template response, line items added, `bidSubmitted`, `surrogateBids[]`, `awarded`, `templateName`. Every step writes `{status: ok|failed|skipped, detail, ms}` to `.plans/<runId>-result.json`, which the platform reads for the per-step verdict and which the memory indexes as *experience*.

### 6.2 Page objects (the healed, self-verifying methods)

- `EventsPage` — `goto()` (`waitUntil: domcontentloaded`; this console holds long-lived connections so `load` may never fire), `startCreate(path)` (chevron → menu → direct-URL fallback, checking where it actually landed after each), `readCreateMenu()`, `openTab(tab)`, `searchByTitle`, `rowTextFor(title)`, `expectListReady()`.
- `CreateEventPage` — `ensureStages()` (the four-move stage dance, choosing the *blocking* stage as victim so it never ping-pongs), `selectTemplate()` (4 open attempts; applied = trigger hidden **or** sheet visible, because applying is a network round-trip), `addOneLineItem` (re-resolves the option at click time; a debounced dropdown detaches nodes), `fillSheet()` (fills `max(requested, rendered)` rows by `data-celltype`), `fillVendorAssessment()` (iterates **all** `rfiSectionWrapper` sections — global and per-line-item), `assignEvaluatorToAllLineItems()`, `saveSchedule()` (the footer chip lies until *Save Schedule* is pressed), `inviteVendors({names,count})`, `publishAndAwaitOutcome()`, `saveAsDraft()` (reads the disabled state and reports it as product behaviour), `sheetHeaderKeys()`, `appliedTemplateName()`, `openStageMenuFor()`.
- `SurrogateBidPage` — reach the participants list (paginated; reaching it is success), find the vendor row **by name first**, then the Add Bid control, fill the bid sheet.
- `AwardPage` — `startAwarding()` (`#goToAwardingFlow` or `#bidSelectionProposal`), `allocate()` (ticks the vendor's own *Select All*, waits out `ant-spin`, polls *Tot. selected line items* and *Awarded Vendors (n/m)*), `createAndSubmitProposal()` (`#submitProposal` **or** a button named *Submit Proposal*).
- `VendorPortalPage` — vendor-side login and `[data-testid="add-bid-button"]` / `submit-bid-button`.

### 6.3 Resilient locators, learned locators, stuck reports, teaching

Every interaction takes a **list of candidates** (`Candidate[]`) tried in order. Before the hand-written candidates come the **learned** ones (`src/ai/learned.ts`, `locators.learned.json`, keyed by the step's label, capped at five recipes): when the healer once finds an element the built-ins missed, the way it got there is written down, so a locator that drifted once is deterministic from then on. Recipes never replace built-ins, so a stale recipe costs one failed attempt, not the step.

When every candidate fails, `recordStuck()` writes `stuck/<label>-<id>.json` with the label, URL, message, every candidate tried, a **screenshot** and a 20k-character **accessibility tree**. This is the difference between "a locator failed somewhere" and a fix someone can make without reproducing the journey. The dashboard's **Stuck points** panel shows them with a **Teach this locator** button (`tests/teach.spec.ts`), which opens the page, asks the AI healer for the element, and stores the recipe.

Three "locator failures" on 11 September were diagnosed from these reports and turned out not to be locators: *Save as draft* was `[disabled]` (product behaviour); the Create Event chevron is *inside* the button (`icon: plus Create Event icon: down`), not a sibling; and the **"Want to stay updated?"** card appears 2–5 s after a screen renders and covers its primary action (it covered the chevron, *Save as draft* and *Create Proposal* in one day). `BasePage.click()` now, on failure, clears distractions and retries once **only if something was actually dismissed**, so a genuine miss is not slowed down.

### 6.4 One browser, one case at a time

`prototype/src/ui/browserSlot.ts` is a process-wide slot. `uiFlowRunner.launch()` takes it before **every** Playwright spawn (journeys, plans, teaching). A second run receives a `queued` event — *"waiting for the browser — X is using it (position 1)"* — and starts the moment the slot frees. Verified with two concurrent case runs: one window, sequential. `retries: 0` and `setup.skip()` when the saved session is fresh mean no second window from retries or login. `/api/run-state` feeds the dashboard's now-running strip. API cases do not need the slot and run alongside.

### 6.5 Speed

58 hard-coded sleeps were replaced by `pause(ms)`: a short floor for animations, then return as soon as the network goes quiet, scaled by `UI_SPEED`. `actionTimeout` 15 s; `open_create` waits for the title field (up to 60 s) because the create screen can take 20 s+ to hydrate here — the "could not fill title within 10 s" flake was this.

---

## 7. Execution — the API layer

`procol test/src/flows/eventsContract.ts` holds `CASE_RUNNERS` — 52 implemented `BE-x.y` cases across creation (1.x), activation (2.x), line items (3.x), audience (4.x), bids (5.x), awarding (6.x), RFQ→Auction (7.x), authorization (8.x), state transitions (9.x) — plus `SKIP_REASONS` (51, each with its reason), `CONTRACT_CHECKS` (response-shape checks) and `ANY_REJECTION_OK` (cases where any 4xx is acceptable). `buildContractFixtures()` creates the minimum shared live state once: a draft with one line item, a draft with two, a staged draft (rfp+rfq, consistent timing), a deliberately bad-timing draft, an **active (published)** event, an auction draft, plus vendor and evaluator identities.

The platform's `apiCaseRunner.ts` reuses all of it in-process and judges with the framework's own `judgeContractCase` — there is exactly one API Oracle. Results are recorded into the same findings store as suite runs, so a defect found from the dashboard groups with one found from the terminal.

The API framework publishes events fine. The `PATCH /api/event_groups/:id → 500` that once looked like a release blocker was **ours**: the UI never filled the pricing sheet's *Delivery location*, because the grid names that column `buyer_hub` while the template schema calls it `delivery_location`. (A missing required input should still be a 422, not an unhandled 500 — that remains a reportable finding, not a blocker.)

---

## 8. The Oracles — deterministic verdicts from evidence

Two Oracles, one policy: **an LLM never decides pass/fail.**

**UI Oracle** (`procol-ui-tests/src/oracle/`): the evidence collector records HTTP failures (with `routeShape()` normalising ids to `:id`), toasts (success and error — a success toast next to a failing request is how a UI-says-yes/API-says-500 *contradiction* is detected), console errors, and the journey's own notes. `judge()` returns one of: `pass`, `product_defect` (the app failed on valid input), `product_rejected_input` (the app refused, and said why), `automation_defect` (the harness could not drive the journey, and the app produced no evidence against itself), `environment` (gateway-level statuses), `contradiction`. Findings carry a `fingerprint` derived from the evidence, so many journeys hitting one defect produce **one** defect group ("affects 5 journeys, seen 5×").

**API Oracle** (`procol test/src/oracle/oracle.ts`): compares the documented contract (status, error code, shape) to what came back: `pass`, `product_defect` (200 where rejection is required, or a documented success refused), `contract_violation` (rejected as documented but with a different error code — drift between doc and app, behaviour right), `automation_defect`, `environment`; a 500 where a validation error is documented is reported as a contradiction.

The dashboard's **Defects found** panel groups by defect, not by case; `GET /api/report` renders the bug report as markdown with reproduction steps.

---

## 9. The memory — two-tier RAG

`prototype/src/rag/knowledgeBase.ts`. **1,295 chunks**: `test-case` 944 (the written catalog, one per case, plus the mined frontend/backend cases), `doc` 227 (design docs, the create-screen contract, PRD notes, split by heading), `experience` 71 (previous findings and previous plan results — *how far a test of this shape got and which step stopped it*), `flow` 17.

Retrieval is **hybrid**: dense similarity × 0.75 + lexical term overlap × 0.25, because a 384-dimension sentence embedding is good at meaning and bad at identifiers (`buyer_hub`, `BE-2.1`) — exactly what someone searching for them typed. `recall(query)` returns *expectations* (what should happen) and *experience* (what has happened) separately; the compiler sees both, and the dashboard's QA memory panel shows them separately so a reader never mistakes history for spec.

The store records **which embedder built it**. If the active embedder differs (a key added after the last build), retrieval refuses to compare across the gap — dense scores would be confident nonsense — goes word-only, and the dashboard says "run `npm run rag:build`". `ensureEmbedderReady()` probes the gateway embedder once at startup and at build; on failure the whole process uses the local model so no store is half one and half the other.

Embedder today: `local:Xenova/all-MiniLM-L6-v2` (384-dim, in-process, ₹0). `HACK26_TEXT_EMBED_3_LARGE` (3072-dim) is wired and preferred when it works.

---

## 10. LLM providers — tiers, chain, and what actually answered

`prototype/src/ai/llm.ts`. Agent code names a **tier**, never a model: `reason` (the compiler — where a wrong answer is a wrong run), `fast` (routing, narration), `long` (whole-section context). Providers, in order: **Slingring** (Procol's OpenAI-compatible LiteLLM gateway, `SLINGRING_API_KEY`) → **Groq** (`openai/gpt-oss-120b`, free tier, 200k tokens/day) → **Gemini** (`gemini-flash-lite-latest`). Every hand-off is logged, and `lastProviderUsed` is reported so output is never attributed to the wrong model. With no key at all the platform still runs end to end: routing falls back to keywords, narration to templates, plans to the deterministic default (marked `partial`).

**Slingring, measured 11 September:** authentication works (a mangled key returned 401 *token not found*; the real key 200). Every `HACK26_GPT_*` request — ASTRA, LUNA, SOL — was **served by `azure_ai/Kimi-K2.7-Code`** (the gateway's `BIG_THINKING` fallback; the model, asked, says "I'm Kimi, developed by Moonshot AI"). That is the gateway's own circuit-breaker routing, not our code. Kimi is a *reasoning* model: it spends tokens on `reasoning_content` before `content`, so the client adds a reasoning allowance (6,000 tokens on the `reason` tier, 1,500 on `fast`), treats empty content as a failure to hand down the chain, and tallies spend against the **served** model (`/api/ai-usage`). `HACK26_TEXT_EMBED_3_LARGE` fails upstream (Azure auth, no fallback group). The key is scoped to the HACK26 models only.

The same trap exists on Groq: `gpt-oss-120b` returns HTTP 200 with `content: ""` and `finish_reason: length` unless `reasoning_effort: "low"` is set — that silently degraded 15 of 25 plans to the default before it was caught by the eval.

---

## 11. The dashboard — `http://localhost:4300`

Classic three-column layout. **Top strip**: what holds the single browser and for how long, queue length, AI provider, calls and spend. **Centre**: the request box with four buttons — *Run QA (API automation)* (the multi-agent orchestrator), *AI: run my instruction in the browser* (`uiIntent` picks a built journey and its parameters from a sentence), *Compile my test case & run it* (`/api/plan-run`; accepts a catalog id or prose), *plan only*; then the **Test catalog** (filters: layer, section, priority, verdict, search; per-row route tag; tick → *Run selected cases*; **watch it** opt-in for the one visible window; **raw log** toggle); the **run narration** in plain language (*"Testing 2 of 5: … decided on 4 steps: open the eRFX create screen → give the event a title → … Step 3 of 4 ✓"*) with PASS / PARTIAL / GAP / FAIL badges; agent reasoning; UI coverage of the 92 features; browser journeys. **Right**: Recent runs, **Defects found** (grouped) + bug report, **Stuck points** + teach, **Steps the automation still needs**, QA memory search.

Endpoints: `/api/test-cases` (filtered catalog + routes + coverage), `/api/case-run` (SSE: `plan`, `case`, `compiled`, `note`, `queued`, `api-case`, `check`, `done`), `/api/plan-run`, `/api/ai-run`, `/api/ui-run`, `/api/run`, `/api/findings`, `/api/report[?download=1]`, `/api/stuck`, `/api/stuck/fix`, `/api/vocabulary-gaps`, `/api/run-state`, `/api/ai-usage`, `/api/knowledge[?q=]`, `/api/capability`, `/api/suites`, `/api/suites-run`, `/api/flow-run`, `/api/flow-checks`, `/api/rerun-check`, `/api/features`, `/api/features-run`, `/api/company-config`, `/api/multi-company`, `/api/runs`, `/api/clients`, `/api/ui-flows`.

---

## 12. Measuring the AI instead of trusting it

Two evaluation sets (not training data — they measure accuracy and catch regressions; they change no weights):

- **Routing eval** — 102 instructions → does the right journey get picked with the right parameters? Journey accuracy 98.0%, parameters 100%, caveat precision/recall 100%. It exposed that vendor-portal and mobile requests produced no caveat.
- **Planner eval** — 42 test cases (26 written sentences + 16 catalog ids) → does each compile to a runnable plan? Structural invariants (starts on the right screen, template before line items, schedule before publish, no list steps before the event is committed…) plus per-case `mustInclude` / `mustExclude` / `mustAnyOf`. It exposed the Groq empty-content trap, and today the compiler's empty-steps fallback. Refusals (coverage `none`, no steps) are counted on their own line and leave the runnable denominator; a case the vocabulary cannot test is not a broken plan.

Trajectory of "compiled clean, no repair needed" as the vocabulary grew: 16/25 → 28/39 → 29/42 → 32–33/42 with the 32- and 36-step vocabularies. **Rerun on the fixed code: 38/39 testable runnable (97.4%), 33 clean, 3 honest refusals — see the appendix.**

---

## 13. What the platform learned about Procol (domain facts, all verified live)

- The eRFX create screen is **template-first**: *Items N* is inert until a template exists; the drawer is identified by its own prompt *Search and add line items*, never by the text "Manage Line Items" (that phrase also appears on the page). Options render in a body-level portal.
- **Stage composition is a dance**: the screen arrives with one **Auction** stage; RFQ and Auction are mutually exclusive; max two; a tab's ⋮ *Delete* is disabled while one stage remains — RFQ-only takes four moves. RFQ→Auction cannot be composed; it is a *conversion* on a published RFQ (Settings → Convert to Auction).
- A technical stage has **per-line-item Vendor Assessment sections** as well as the global one (a 3-item event has 4 sections); publish is refused with *"errors in vendor specific sections"* otherwise. A stage with no template fails savings validation (*"Please select a valid column for savings"*: default `savingsColumn = {budget: "price"}`).
- The schedule chip **lies** until *Save Schedule* is pressed.
- `/orders/quick-create` is **not** a project id — a redirect oracle of `/orders/[^/]+` treats the create screen itself as a published project.
- The pricing grid names the delivery column `buyer_hub`; the template schema calls it `delivery_location`. Leaving it blank makes `PATCH /api/event_groups/:id` return a bare 500.
- The Create Event menu on this tenant offers **Single Stage · eRFX Project · BOQ based RFX Project**; the chevron is inside the button; the menu opens on hover.
- **Save as draft** is disabled with a title alone and still disabled with a template and *Items 0*; it enables once a line item exists.
- The "Want to stay updated?" notification card appears 2–5 s after a screen renders and covers the top-right action.
- Awarding grid: the vendor's own *Select All* cell reads `AMD LTD Select All`; counters *Tot. selected line items n/m* and *Awarded Vendors (n/m)* must be read **after** `ant-spin` clears, or the oracle reads mid-update.

---

## 14. Findings to date (defects, judged by the Oracles)

From the API contract cases, verdicts as recorded:

- **Product defects** — `BE-3.8` (critical): a string quantity on a line item is accepted with 200, not rejected with 422. `BE-3.10` (critical): deleting the last remaining line item is accepted. `BE-1.11`: a create the contract says must be rejected (code 15) is accepted with 200. `BE-2.13`: a PATCH on an active event that must be refused (code 101) is accepted. `BE-2.17` / lifecycle: withdraw fails *"failed to add remark"* (422, code 472) where the contract documents success. `BE-3.3`: deleting a line item on an active event returns *"You cannot delete this line item from the project"* where a 200 is documented.
- **Contradictions (500 where a 4xx is documented)** — `BE-1.12`, `BE-2.22`, `BE-3.4`.
- **Contract drift (behaviour right, error code differs from the doc)** — `BE-3.5` (533 vs 741), `BE-3.6`, `BE-4.4` (2 vs 752), `BE-8.3` (455 vs 1122).

Dashboard totals at time of writing: 26 finding groups — 6 defects, 15 harness/automation, 1 gap, 0 environment.

---

## 15. Runs on 11 September (the evidence for the claims above)

- **Happy flow, headed, 13/13, first attempt after the popover fix**, from one sentence: RFQ-only eRFX → template → 2 line items → sheet → schedule → invite AMD → publish (`WHBwY0Rn`) → surrogate bid for AMD → award 2 line items to 1 vendor, submitted → awarded ✓. (The run before it reached 14/16 and stopped on *Create Proposal* under the popover — diagnosed from the stuck screenshot.)
- **Publish-then-find, 17/17**: create RFQ → publish (`Tk5jY0Rn`) → open the list → Live tab → found by its own title.
- **Catalog cases**: UI-CRE-001, UI-CRE-003, UI-PUB-001 PASS (built journeys); UI-TPL-001 PASS 5/5 (was PARTIAL that morning); UI-CRE-010 PASS 4/4 (*"stage menu open: Edit title, Delete (disabled)"*); UI-PUB-003 9/9 PARTIAL (draft saved, found under Drafts; the row's status label check is the new `expect_event_status`); UI-ENV-002 PARTIAL (menu read live; the tenant-flag-off branch has no step); UI-LI-001 PARTIAL; UI-VAL-001 refused (a blank-title negative test needs a step that does not exist yet); API-EG-001/002/003, API-PUB-001 PASS; API-LI-003 and API-PERM/AUD/LC area runs surfaced the findings in section 14.
- **Queueing**: two concurrent case runs → second showed *"waiting for the browser … position 1"*, then ran. One window.

---

## 16. Limits, stated plainly

- Everything routed `ui-compile` (323 cases) depends on the compiler; its quality is bounded by the model the gateway actually serves (Kimi today, ASTRA when routing is fixed) and by the 36-step vocabulary. The ledger says what is missing; the honesty rules keep a missing step from becoming a false pass.
- `api-section` (208 cases) runs the framework's cases for the *area*, not the written case word for word. The tag says so on every row.
- 37 cases have no runner at all (vendor technical response, DB persistence, auth/session, non-functional).
- The applied template's *name* is not found by the current selectors after applying on a pricing stage; `expect_template_selected` reports *"(applied — name not displayed)"* rather than inventing a match.
- The environment is slow and occasionally offline (`ERR_INTERNET_DISCONNECTED` during one run); the Oracle classifies these as `environment`/`automation_defect`, non-actionable, rather than product failures.
- Groq's free tier was rate-limited most of the day; Slingring serves Kimi, not ASTRA. Both are logged, not hidden.

---

## 17. Running it

```bash
cd prototype && npm install && cd ../procol-ui-tests && npm install && npx playwright install chromium && cd "../procol test" && npm install
cp prototype/.env.example prototype/.env   # SLINGRING_API_KEY / GROQ_API_KEY / GOOGLE_API_KEY
cd prototype && npm run cases:import && npm run rag:build && npm run serve   # http://localhost:4300
```

`npm run cases:coverage` (routing counts) · `npm run cases:api BE-1.1 BE-1.2` (API cases from the terminal) · `npm run cases:compile UI-TPL-001` (compile one written case) · `npm run eval:planner` · `npm run eval:routing` · in `procol-ui-tests`: `npx tsx scripts/dump-plan-catalog.ts` after adding a step.

Only one server per port; no hot reload (`Ctrl+C`, `npm run serve` again after code changes; browser files pick up on refresh).

---

## 18. Questions you will be asked, with the answers

**"Isn't this just an LLM writing Playwright tests?"** No. The model chooses from 36 fixed verbs the executor already implements; it cannot write code, invent a locator, or assert something the machine cannot observe. Every verb is a healed page-object method with its own verification. And the model never judges the outcome.

**"How do you know a pass means anything?"** Three ways. The Oracle's verdict comes from HTTP codes, the app's own messages and the final URL — never from the model. Coverage is explicit: a plan that cannot observe the case's subject is refused or marked PARTIAL, never PASS. And `/orders/quick-create` is not a project id — the one place a rejected publish used to count as success is closed.

**"What happens when a locator breaks?"** Every step tries an ordered list of candidates, learned recipes first. When all fail, a stuck report captures the screenshot and accessibility tree, the dashboard shows where, and one button teaches the fix, which is stored and used deterministically from then on. Three times today the report showed the "failure" was the product or a popover — and the fix went into the framework, not the case.

**"What if I change a test case?"** Edit the markdown, run `npm run cases:import`. The compiler reads the prose; the linter enforces the product's invariants; coverage says what it can and cannot do. If it cannot, the gap goes on the ledger; build that step and the case compiles untouched — demonstrated on UI-TPL-001 and UI-CRE-010 today.

**"Why one browser?"** A process-wide slot around every Playwright spawn. Concurrent requests queue visibly. API cases do not need it and run alongside.

**"Is the AI key working? What is Kimi?"** Yes — authenticated and metered. Slingring is a LiteLLM gateway that reroutes on its own circuit breakers; every HACK26 model request was served by `azure_ai/Kimi-K2.7-Code` today, and the platform reports the served model rather than the requested one. ASTRA will light up here with zero code changes when the gateway's routing is fixed.

**"Does it touch Procol's data?"** Read-only on code, config and DB. It creates only sandbox records the frameworks are designed to create, all recognisably named.

**"How does memory help?"** The compiler retrieves the written expectation for the case and the experience of previous similar runs (which step stopped and why). The two tiers are kept separate so history is never mistaken for spec, and the memory never decides pass/fail.

**"What did it find?"** Section 14. Two critical: a string quantity accepted, and the last line item deletable.

---

## Appendix — planner eval, rerun on the fixed code

**Rerun on the fixed code (11 September, 36-step vocabulary, served by Kimi via Slingring):**

| | |
|---|---|
| Test cases | 42 (26 written sentences + 16 catalog ids) |
| Refused honestly | **3** — coverage `none`, no steps: `FE-3.1` and `FE-12.4` need the RFQ→Auction conversion flow, `BE-2.11` is API-only. All three on the gap ledger. |
| Testable | 39 |
| Runnable plans | **38/39 — 97.4%** |
| Compiled clean, no repair | **33** |
| Needed a linter repair | 5 |
| Not runnable | 1 — `tc042`: the model appended a list check to a create case that did not ask for one (over-planning, flagged by the case's own `mustExclude`) |

The run before this one, on the same day and before the fixes: 36/42 runnable, 32 clean, 6 failures — four from a step added mid-run reading as "unknown", two honest refusals mislabelled as unreachable. Both classes fixed; nothing about the compiler's actual choices changed between the two runs.

**Second rerun, later the same day — 50 cases, 43-step vocabulary (eight permutation cases added, including a counter offer):**

| | |
|---|---|
| Test cases | 50 |
| Refused honestly | **1** — `BE-2.11`, API-only (PATCH a non-existent event group). `FE-3.1` and `FE-12.4`, refused in the morning, now **compile** — `convert_to_auction` exists. |
| Testable | 49 |
| Runnable plans | **48/49 — 98.0%** |
| Compiled clean, no repair | **41** |
| Needed a linter repair | 7 |
| Not runnable | 1 — `tc042`, the same over-planning (a list check appended to a create case) |
