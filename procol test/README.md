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

It is organised **client → flow → case kind → test case → the API calls that
case made**, and every call carries its full evidence:

| | |
|---|---|
| API URI | path + query, and the absolute URL |
| Method | GET / POST / PATCH / PUT / DELETE |
| HTTP status code | with the status text, coloured by class |
| Response time | per call, plus p50 / p95 / slowest for the run |
| Log time | wall clock at request start, local and UTC |
| Request headers | credentials replaced with `<redacted, n chars>` |
| Response headers | as returned |
| Request body | pretty-printed |
| Response body | pretty-printed, capped by `API_LOG_MAX_BODY` (default 24 kB) |
| Error message | for a failed call, the message the API itself returned |

A **Failed API calls** table sits at the top: every non-2xx call in the run with
its error message, so triage starts from the evidence rather than from a test
name. Filters above the flows narrow by status, kind, or free text.

`reports/api-report.json` holds the same model as data, for CI gates or the
`prototype/` dashboard.

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
    apiLog.ts        evidence recorder (JSONL per worker) + reader
    model.ts         raw calls + test results → client/flow/kind/case model
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
