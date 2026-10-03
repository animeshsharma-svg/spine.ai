# spine.ai — autonomous QA for Procol

spine.ai tests Procol the way a careful QA engineer would, but continuously: it knows how a sourcing
event is supposed to work (from Procol's own code and each client's live configuration), drives the
real product through its API and its screens, decides pass or fail with **deterministic rules**, and
reports every result as a plain-language test case with the evidence behind it.

> **Private repository.** It contains test data for Procol's UAT environment and knowledge mined from
> Procol's code. Procol's own repositories (`procol-backend/`, `procol-client-dashboard/`) sit next to
> it for reference only, are git-ignored, and are never modified. Secrets live only in local `.env`
> files (git-ignored); nothing in this repository is a credential.

## What it does today (events module)

| Capability | What happens |
|---|---|
| **Vendors** | Only the platform's own QA test vendors (`qa_…@example.com`) are ever invited or signed in as; a client without one runs without a vendor. |
| **Event journeys** | Builds a real event on UAT (draft → rounds → publish → vendor responds → bidding closes → evaluation → award), one request per step, with ~1,000 field-level checks on the replies. |
| **Never-stuck engine** | Every step is time-bounded. A refused data choice (e.g. *"The unit kg is not present"*) is retried with the next real alternative, backtracking to the step that made the choice — and the first failure is still reported as **failed**, with the reason. |
| **Product model** | 380 facts about how events work, each cited to Procol's code; for every client the real templates, their fields and rules, units, products and vendors (versioned in the database). |
| **Template field tests** | For any template a client really has, one test per field × rule × violation, run against a fresh test event. |
| **Edge and negative cases** | ~950 runnable cases that each change one thing in a working request; the shared test event is rebuilt whenever a case breaks it, so no case is judged on another's damage. |
| **API test compiler** | A test case (typed or written) becomes setup → actions → read-back checks, run on its own fresh event; a failure counts only if it repeats on a second fresh event. |
| **Bidding scenarios** | 15 scenarios with several QA vendors bidding through their own logins, surrogate bids, late bids, extensions, the RFP-before-RFQ rule, evaluation completeness, dynamic closing, awards. |
| **UI ↔ API cross-check** | Compares what the backend sent each screen with what the screen shows (12 event screens), normalising numbers, currency, dates and units. |
| **Assistant** | A test case typed in plain language (Hinglish included) is matched to the catalog and run, or — if it is new — turned into a gated automation and saved as a draft for review. |
| **CI/CD** | Offline checks on every push (GitHub Actions); a nightly live regression and a backend-change watcher (local, opt-in). |

The catalog holds **5,457 written test cases in 42 journeys** (`test-cases/*.md`), every one placed in a
journey. So far the platform has found **59 verified product defects** (`docs/bugs/`) — each reproduced on a
fresh test event before it was reported.

## How a verdict is reached

```
 what to test ─▶ product model + memory ─▶ run against UAT ─▶ oracle ─▶ report
 (journey,        (rules, templates,       (API requests,     (fixed     (plain-language test
  scenario,        units, past results)     browser, cross-    rules —    case; evidence under
  typed case)                               check)             no LLM)    "Details")
```

* **The oracle is deterministic.** An HTTP 5xx is always a defect; a refusal passes only if it is
  the refusal the case expects (same reason); 401s, unusable fixtures and environment failures are
  "couldn't tell", never a pass. No language model ever decides pass or fail.
* **Guards against false positives.** Each is there because a real false alarm was seen:
  * expected messages are matched, not just status codes;
  * cases whose request body is a summary of the real payload are held out rather than run;
  * a case that crashes or ends the shared test event triggers a fresh copy for the cases after it;
  * cases run in an order where destructive ones (withdraw, close) come last;
  * per-client settings are never pinned to one client's values (a field check that learned
    PROCOL DEMO's defaults would fail every other client);
  * vendors are always QA test vendors (`qa_…@example.com`), never real suppliers.
* **AI is used to propose, never to judge**: interpreting a typed instruction, compiling a test case
  into browser steps (from a fixed vocabulary of 47 steps, linted afterwards), drafting new cases,
  confirming case matches. Every model output is schema-validated and gated.

## Repository layout

| Path | What it is |
|---|---|
| `prototype/` | The platform: dashboard + server (`src/server.ts`, route modules in `src/routes/`), journey engine (`src/checks/eventJourney.ts`, `resilience.ts`), bidding matrix (`biddingMatrix.ts`), product model (`src/model/`), memory (`src/rag/`), agents (`src/agents/`), its own database layer (`src/db/`, `db/migrations/`). |
| `procol test/` | The API test framework the platform builds on: request builders, sign-in (UAT one-time codes), catalog resolution, read-only access to Procol's database. |
| `procol-ui-tests/` | Playwright browser automation: page objects, the plan executor, the UI oracle, the UI ↔ API cross-check. |
| `test-cases/` | The written catalog — the source of truth. Edit the markdown, then `npm run cases:import`. |
| `docs/` | `CI.md` (pipelines), `phase3-bidding-matrix.md` (bidding design, cited to the backend). |
| `api-suite/`, `three-way-match/` | Earlier standalone suites, kept for reference. |

The three code directories must stay siblings: the platform imports `procol test` and spawns
`procol-ui-tests` by relative path.

## Setup

Requires Node 24 and PostgreSQL 17 with pgvector (macOS: `brew install postgresql@17 pgvector`,
then `brew services start postgresql@17`).

```bash
# install
cd prototype && npm install
cd "../procol test" && npm install
cd ../procol-ui-tests && npm install && npx playwright install chromium

# configure — copy the examples and fill them in (values are shared out of band, never committed)
cp prototype/.env.example prototype/.env
cp "procol test/.env.example" "procol test/.env"
cp procol-ui-tests/.env.example procol-ui-tests/.env

# spine.ai's own database (memory, run history, product model) — SPINE_DB_URL in prototype/.env
cd prototype && npm run db:migrate

# build the memory, then start the dashboard on http://localhost:4300
npm run rag:build
npm run serve
```

| Variable | Where | What it is |
|---|---|---|
| `SPINE_DB_URL` | `prototype/.env` | spine.ai's own Postgres. The platform still runs without it (file fallbacks). |
| `SLINGRING_API_KEY` | `prototype/.env` | Procol's AI gateway. Groq / Gemini keys are optional fallbacks. |
| `DATABASE_URL` | `procol test/.env` | Procol's UAT database — **read-only** (SELECT only). |
| `CLIENTA_OTP`, … | `procol test/.env`, `procol-ui-tests/.env` | UAT sign-in codes (per-company codes are otherwise looked up). |

## Running it

```bash
cd prototype
npm run serve                                        # dashboard
npm run matrix -- --company 198678 --combos M1,M5    # bidding scenarios
npm run template:check -- --c 198678 --type rfq      # field tests for a client's template
npm run model:build -- --c 198678                    # refresh a client's product model
npm run nightly                                      # live regression (own server, lock, time limits)
npm run ci:check                                     # everything CI checks, locally
npm run eval:matcher && npm run eval:routing         # measure the AI parts
npm run coverage:report                              # what runs, what has run, what to build next
```

Live runs create test records on UAT only — events named `QA_Platform_…` / `API_Test_…`, inviting
QA test vendors. Nothing deletes or changes real data, and Procol's database is only read.

## Measured, not claimed

| | Today |
|---|---|
| Verified product defects found | 59 (1 critical, 11 high) — each reproduced on a fresh test event |
| Typed test case → right existing case (rules + model) | 97% top-1 · new cases detected 100% |
| Instruction → right journey | 95.1% |
| Written case → runnable browser plan | 92.7% |
| Test case → correct API test plan | 90% exact (49 cases) |
| "Couldn't tell" share of results (7 days) | 12% — target ≤ 5% |
| Flaky share (checks run 3+ times) | 4.3% — target ≤ 2% |
| Catalog cases that can run today | 55% (2,271 of 4,142 automatable) · 1,959 have run on PROCOL DEMO |

## Working on it

* Branch from `main`, keep commits small, and run `npm run ci:check` before pushing — CI runs the same
  checks (typecheck, catalog freshness, case-data schema, migrations, unit tests, no secrets).
* Never commit `.env`, `.auth/`, run outputs (`data/runs`, `data/matrix`, …) or Procol's repositories;
  `.gitignore` covers all of them.
* New dashboard endpoints go in their own file under `prototype/src/routes/` (loaded automatically);
  new tables go in a new numbered migration.

## Known limits

* About half of the automatable catalog cannot run yet; `npm run coverage:report` lists what to build next.
* The nightly run and backend watcher are prepared but not scheduled (`docs/CI.md`).
* HubSpot ticket ingestion and modules beyond events are planned, not built.
