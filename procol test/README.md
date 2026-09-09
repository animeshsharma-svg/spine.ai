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
npm test              # all specs
npm run report        # open the HTML report
npx playwright test tests/flows/lifecycle.spec.ts   # one spec
```

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
  auth.setup.ts, auth.spec.ts, reads.spec.ts
  events/create-event.spec.ts
  flows/{lifecycle,features,vendors,vendor-bid}.spec.ts
```

Every `api.get/post/patch/put` throws an `ApiError` (`.status`, `.code`, `.data`)
on non 200–204, so a resolved call is already a success.
