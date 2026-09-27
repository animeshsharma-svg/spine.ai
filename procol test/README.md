# Procol API Tests

Standalone [Playwright Test](https://playwright.dev/) framework that drives the
**Procol backend APIs directly** (no browser, no UI) — a Postman collection
rebuilt as typed, chained Playwright API tests.

It mirrors the dynamic design of the source Postman collection: one config with a
`CLIENTS` map + `ACTIVE_CLIENT` selector, three identities (buyer / vendor /
evaluator), and body builders translated 1:1 from the collection's pre-request
scripts. Verified against `procol-client-dashboard` source for the exact auth,
base-URL, header, and error contracts.

## Setup

```bash
cd "procol test"
npm install
npx playwright install
```

No `.env` required — the config ships with working sandbox values (see
`src/config.ts`). Override the active client via env if you like:

```bash
ACTIVE_CLIENT=clientA npm test      # default
CLIENTA_BASE_URL=... OTP=... npm test
```

## Run

```bash
npm test              # all specs, writes reports/api-report.html
npm run test:cases    # only the negative/edge table
npm run test:master   # only the DB-driven flow registry (needs DATABASE_URL)
npm run report:api    # open the API evidence report
npm run report        # open Playwright's own HTML report
npx playwright test tests/flows/lifecycle.spec.ts   # one spec
```

> Passing `--reporter=…` on the command line **replaces** the configured
> reporters, so the API report is not written. Use `--project` or a path to
> narrow a run instead.

## Configuration — `src/config.ts` (the one place to change)

Mirrors the collection's master config:

- `CONST` — app keys/secrets/versions per app (console = buyer/evaluator,
  agribid = vendor) and phone prefix. These never change across clients.
- `CLIENTS` — per-client inputs: `baseURL`, logins (`buyerPhone`, `vendorEmail`,
  `evalPhone`), `otp`, and catalog ids (`productUuid`, `productQualityUuid`,
  `technicalTemplateUuid`, `pricingTemplateUuid`, `locationUuid`,
  `vendorBidCompanyUuid`). Add a client by copying a block.
- `ACTIVE_CLIENT` — the one line (or `ACTIVE_CLIENT` env) that flips environment.

`CONFIG` then derives the three `identities` (each with its own key/secret/
app-version), the `catalog`, and fresh-per-run `testData` (quantity, bid price).

## Auth model (verified from source)

- `access-token` header — bootstrap `btoa(key:secret)` before login;
  `btoa(key:secret:<access_token from verify_otp>)` after.
- `lightspeed-token` = `btoa(JSON({ "device-type":"web-console", uuid: nanoid }))`.
- `app-version` header per identity. Login: `POST /v1/generate_otp` →
  `POST /v1/verify_otp`. Buyer/evaluator use phone; vendor uses email.
- Success = 200–204. Errors surface `{ error: { message } }` as `ApiError`.

## Flows

| Flow | Spec | Identity | Status |
| --- | --- | --- | --- |
| Auth (buyer/evaluator) | `tests/auth.spec.ts` | buyer | ✅ |
| Read-only endpoints | `tests/reads.spec.ts` | buyer | ✅ |
| Create event (RFQ + Technical) | `tests/events/create-event.spec.ts` | buyer + evaluator | ✅ |
| Lifecycle: create → surrogate → award proposal | `tests/flows/lifecycle.spec.ts` | buyer | ✅ |
| F2 versioning, F5 convert-to-auction | `tests/flows/features.spec.ts` | buyer | ✅ |
| Vendor discovery | `tests/flows/vendors.spec.ts` | buyer | ✅ |
| Vendor self-bid + evaluation | `tests/flows/vendor-bid.spec.ts` | vendor + evaluator | ⏭️ skipped — needs a valid vendor login |

**Surrogate bidding** (buyer places the technical response + RFQ bid on the
vendor's behalf) means most of the lifecycle is exercised without a vendor login.
The remaining two flows (a vendor's *own* submitted bid, and evaluating a real
vendor proposal) need a working `vendorEmail` for the active client — the current
one is rejected by `generate_otp`. Fill a valid vendor email in `src/config.ts`
and remove `.skip` in `vendor-bid.spec.ts`.

## The API report

Every run writes **`reports/api-report.html`** — one self-contained file, no
external assets, openable from disk or attachable to a ticket.

```bash
npm test              # runs everything, writes the report
npm run test:cases    # just the negative/edge table — fastest useful subset
npm run report:api    # open the report
```

The page is the **run, in order**: case 1, case 2, case 3 — the same sequence
the automation executed, never re-sorted — with headings for the areas it moves
through ("Signing in and access control", "Creating an event", "Publishing an
event"). Each case is one row:

| Column | What it holds |
|---|---|
| **#** | position in the run, so the report reads as the run happened |
| **Test case** | what the case does, in one plain-English sentence |
| **Expected result** | what should happen, in plain English — declared before the request went out |
| **Actual result** | what did happen, read off this run's recorded traffic |
| **Result** | Pass / Fail / Not run, plus **⚠ Unproven** where the evidence contradicts the verdict |

Expanding a row gives *How this was decided*, the assertion message if it
failed, the skip reason if it did not run, and **the call the case turns on** —
as a `curl` you can paste into a terminal, with the one line of response that
decided it. The full request/response is one click further down.

### A journey reads as the sequence it performs

"Create a two-stage event and publish it" is four requests, and when it goes
red the only useful question is *which* of the four broke. So a journey reports
its own business steps, numbered under the case, each with its own expectation,
its own result and the calls it made:

```
 2   Create a two-stage event — a technical round (RFP) followed by a live
     price auction — and publish it.                                     Fail
 2.1 Create the draft event                                              Pass
 2.2 Add the technical round (RFP)                                       Pass
 2.3 Add the live auction round (price-based)                            Pass
 2.4 Publish the event                                                   Fail   ← 500
     The journey stopped at step 2.4. Whatever this flow does after that
     never ran, so it is neither passed nor failed — it is untested.
```

A flow declares those steps with `step()` from `src/report/steps.ts`:

```ts
await step(
  "Publish the event",
  'The event goes live — status "active" — with all 2 rounds attached to it.',
  async () => {
    const live = await buyerApi.patch(Endpoints.eventGroup(uuid), { body });
    stepResult(`"${title}" came back with status "${live.status}".`);
  },
);
```

The expectation is stated at the call site, before the body runs — the same
rule the whole report is built on. Steps are recorded only inside a test that
called `startJourney()`, so the same flow helpers reused by a `beforeAll`
fixture or a one-off script do not staple their steps onto an unrelated case;
and they never nest, because a reader wants one flat sequence.

Instrumented today: the events flows (`createEvent` — draft → each round →
publish — plus the DB check, surrogate bidding, awarding, versioning,
RFQ→auction, BOQ) and PR→event. Any other flow that adds `step()` calls is
rendered the same way with no change to the reporter.

### A hundred mined cases, cut into the life of an event

The `events` module contributes 103 cases mined from the backend
(`tests/events/contract.spec.ts`). They declare the stage of an event's life
they belong to — *Creating an event*, *The items being sourced*, *Who the event
goes out to*, *Publishing an event*, *Bids from suppliers*, *Awarding the
event*, *Who is allowed to do what* — and the report cuts the run into those
stages instead of listing a hundred rows under one "events" heading. Each row
still carries its mined id (`BE-2.4`) so it traces back to the file it came
from, and its live request/response is attached as a `curl` like any other
call.

Above the table: a pass rate, coverage split by case type, API latency, and the
environment. Tabs alongside it re-cut the same rows **by module**, list every
**non-2xx call**, give the **full call log**, and hold the hand-written
**findings**. Search and the Pass/Fail/Not-run filters narrow the run table.

### How expected is compared with actual

The tab **"How pass/fail is decided"** answers this inside the report itself.
In short:

1. **The expectation is fixed before the call is made.** Each step declares it
   at the top of the test, via `declareCase()` in `src/report/caseSpec.ts` —
   never inferred from the response. An expectation recorded after the answer
   arrives is a transcript, not an expectation.
2. **The actual result is read off this run.** Every call passes through
   `ApiClient.request`, which records the real status code, error code, message
   and timing. The Actual column is that record as a sentence.
3. **The verdict is the comparison**, and each row names which kind applies:
   a single declared request (status class), a mined contract case (the API
   Oracle's classification), or a multi-step journey (its assertions, including
   the Postgres rows where the DB is reachable).
4. **And the verdict is re-checked against the evidence.** For every step with
   one declared request, the report independently re-derives the verdict from
   the recorded status code and compares it with the runner's. Disagreement is
   flagged **⚠ Unproven** on the row, counted in the masthead, and called out
   in the notes — a green test whose own evidence says otherwise is the most
   dangerous thing a report can hide.

`reports/api-report.json` holds the same model as data, for CI gates or the
`prototype/` dashboard. Credentials never reach either file: headers are
redacted by `redactHeaders`, and credential-bearing query parameters by
`redactQuery`.

### How the evidence is captured

`ApiClient.request` is the single funnel every call passes through, so one hook
there covers the whole framework — a new flow is reported without touching the
reporter. Records are appended as JSONL to `reports/api-calls/`, one file per
worker process, because Playwright workers are separate processes and an
in-memory array would die with the worker. `tests/globalSetup.ts` clears that
directory before a run, so a report never mixes two runs. A run that is killed
half way still leaves every call it had already made.

Nothing in the pipeline can fail a test: `recordApiCall` swallows its own
errors by design.

## Positive, negative and edge cases

Coverage is split across two registries, both config-driven:

| Registry | What it holds | Runner |
|---|---|---|
| `src/master/registry.ts` | the **positive** flows — create an event, bid, evaluate, award, master data | `tests/master.spec.ts` |
| `src/cases/registry.ts` | the **negative** and **edge** table — what the API must refuse, and how it behaves at the boundaries | `tests/cases.spec.ts` |

A case in the second table is one request and one expectation, so adding
coverage is a table entry rather than a new spec:

```ts
{
  id: "events.create.negative_quantity",
  flowKey: "events.create",
  flowTitle: "Create event group (validation)",
  title: "a negative quantity is refused",
  kind: "negative",
  expects: "reject",
  because: "you cannot tender for a negative amount, whatever the column type allows",
  build: (ctx) => ({
    method: "POST",
    path: Endpoints.eventGroups(),
    body: { status: "draft", line_items: [{ ...validLineItem(ctx), quantity: { unitSymbol: "kg", value: -5 } }] },
  }),
}
```

`expects` has three values, and the third one matters:

- **`accept`** — 2xx. The request is legitimate and must work.
- **`reject`** — 4xx. Invalid input must be refused *by the server*, with a
  client error — not a 500, and not a silent success.
- **`no-server-error`** — 2xx or 4xx. For boundaries where the correct answer is
  genuinely undocumented. The case pins down that the server *decides* rather
  than crashing, and the report records which way it went. Better than asserting
  a guess and calling it a contract.

`auth` on a case swaps the credentials it sends (`none`, `malformed`,
`wrongSecret`, `noLightspeed`), which is how the authorization cases are written
without a second login.

Each case annotates itself with its kind, flow, expectation and rationale, and
the reporter reads those annotations — so the grouping in the report follows the
table automatically. A case with `skip` set is parked with its reason visible in
the report rather than deleted.

## DB-driven client selection (any client, no hardcoding)

Instead of hardcoding a client, resolve everything from the database by company id:

```bash
COMPANY_ID=39490 npx playwright test tests/clients
```

How it works (all read-only on the DB):
1. **Resolve the client** — `src/db/clients.ts` finds the company's buyer via its
   most-recent web-console **session** in Postgres.
2. **Auth without OTP** — `src/auth/sessionAuth.ts` builds the token from that
   session (`base64(appKey:appSecret:sessions.access_token)`).
3. **Resolve the catalog** — `src/catalog/resolve.ts` pulls that company's
   product/quality/templates/location from the **API** (the uuids are encoded,
   so the API is the source of truth), plus a vendor + an evaluator user.
4. **Run flows** — the `client` fixture (`src/dbFixtures.ts`) exposes an
   authenticated `buyerApi` + resolved `catalog`/`vendor`/`evaluatorUuid`.
5. **Verify in the DB** — `src/db/verify.ts` asserts the event/stages actually
   landed in `event_groups` / `trade_requests` (DB-as-oracle).

The **URL does not change per client** — a client is a company *inside* one
environment (one API URL + one DB, matched). Switch environment by swapping
`DATABASE_URL` + the client's `baseURL` together.

`tests/db/client-selection.spec.ts` also prints which companies are currently
testable (have a live session):

```
COMPANY_ID=500    "Procol Traders"
COMPANY_ID=10     "Dalal Sudhir Kumar & Company"
```

> Caveat: session reuse needs the company to have a **recent, unexpired**
> web-console session (someone logged in lately). Companies without one are
> reported clearly rather than failing silently.

## Layout

```
src/
  config.ts          CONST + CLIENTS + ACTIVE_CLIENT → CONFIG (identities/catalog/testData)
  context.ts         resolveClientContext(COMPANY_ID) → { buyerApi, catalog, vendor, evaluatorUuid }
  dbFixtures.ts      `client` / `buyerApi` fixtures (DB-driven, COMPANY_ID)
  db/
    pool.ts          read-only Postgres pool (DATABASE_URL)
    clients.ts       resolveClient(companyId) via live session; listTestableClients()
    verify.ts        DB-as-oracle: event_groups / trade_requests / bids assertions
  catalog/
    resolve.ts       resolve product/templates/location from the API per company
    users.ts         list company users; pick an evaluator uuid
  auth/
    sessionAuth.ts   build an authenticated client from a DB session (no OTP)
  identities.ts      asBuyer()/asVendor()/asEvaluator()/asVendorEmail() → logged-in ApiClient
  auth/
    token.ts         bootstrap / access / lightspeed builders
    login.ts         authenticate(identity) + loginBuyer/Vendor/Evaluator
    store.ts         token cache for the setup project
  api/
    client.ts        ApiClient (per-identity baseURL + app-version, qs, ApiError)
    endpoints.ts     every endpoint path
  cases/
    types.ts         ApiCase / Expectation / AuthMode — the case contract
    registry.ts      THE CASE TABLE: negative + edge cases per flow
  report/
    apiLog.ts        evidence recorder (JSONL per worker) + reader + redaction
    caseSpec.ts      declareCase()/recordActual() — what a spec tells the report
    steps.ts         step()/stepResult() — a journey's own numbered business steps
    outcome.ts       expected vs actual vs verdict, and the independent re-check
    curl.ts          a recorded call → a runnable curl + the line that decided it
    model.ts         raw calls + test results → the run, in order, plus sections
    html.ts          the model → one self-contained HTML file
  flows/
    bodies.ts        pure request-body builders (translated from the collection)
    enrich.ts        fetch trade-product ids + technical form uuids
    createEvent.ts   buyer: group → technical → pricing → publish
    surrogate.ts     buyer: surrogate technical + rfq bid
    evaluation.ts    evaluator: score a technical form
    awarding.ts      buyer: proposal → response → approval flow → submit
    features.ts      F2 versioning, F5 convert-to-auction
    vendorBid.ts     vendor: technical response + priced bid
    vendors.ts       vendor discovery / collection
tests/
  globalSetup.ts     clears reports/api-calls/ before a run
  apiReporter.ts     writes reports/api-report.{html,json} after a run
  cases.spec.ts      runs src/cases/registry.ts (negative + edge)
  auth.setup.ts, auth.spec.ts, reads.spec.ts
  events/create-event.spec.ts
  flows/{lifecycle,features,vendors,vendor-bid}.spec.ts
```

Every `api.get/post/patch/put` throws an `ApiError` (`.status`, `.code`, `.data`)
on non 200–204, so a resolved call is already a success.
