# Procol API Test Framework — Complete Reference

A standalone Playwright + TypeScript framework that tests the Procol backend APIs
directly (no browser). It has two layers:

1. **Static specs** — the original flows pinned to one hardcoded client (`clientA`).
2. **DB-driven master** — pick any client by `COMPANY_ID`; the framework logs in,
   discovers that client's catalog from the API, reads its config, and runs only
   the flows the client's configuration enables.

Environment tested: `sec-api-v1.ag-ri.in` (mvvm/UAT), DB `agribid-uat-latest`.

---

## 1. How to run

```bash
cd "procol test"
npm install
npx playwright install

# DB-driven master (any client) — the main entry point
COMPANY_ID=198678 npx playwright test tests/master.spec.ts   # PROCOL DEMO (18 checks)
COMPANY_ID=39490  npx playwright test tests/master.spec.ts   # Moon Beverages (BOQ skips)

# Static clientA specs + reads + the full vendor lifecycle
npx playwright test tests/auth.spec.ts tests/reads.spec.ts tests/flows tests/events

npm run report        # open the HTML report
```

`COMPANY_ID` selects the client. The API base URL is fixed per environment
(one DB + one API host); switching environment = swap `DATABASE_URL` + baseURL.

---

## 2. The master registry — every automated flow (17 modules, config-gated)

Run via `tests/master.spec.ts`. Each is client-agnostic and DB-verified.

| Category | Module key | What it does | Config gate |
|---|---|---|---|
| entry-paths | `entrypath.pr_to_event` | Convert an existing PR into an Event (linked) | `pr` + `trade:create_record` |
| events | `events.rfp_rfq` | 2-stage RFP+RFQ event | `trade:create_record` |
| events | `events.rfp_only` | Technical-only (RFP) event | `trade:create_record` |
| events | `events.rfq_only` | Pricing-only (RFQ) event | `trade:create_record` |
| events | `events.auction_rank` | Rank-based auction event | `trade:create_record` |
| events | `events.auction_price` | Price-based auction event | `trade:create_record` |
| events | `events.rfp_auction` | RFP + Auction (2-stage) event | `trade:create_record` |
| events | `events.surrogate_award` | Create → surrogate bid → award proposal | `trade:create_record` |
| events | `events.versioning` | F2: version an event group | `trade:create_record` |
| events | `events.convert_to_auction` | F5: convert RFQ stage to auction | `trade:create_record` |
| events | `events.boq` | BOQ event: upload sheet → parse → event group | `boq_in_erfx_allowed` |
| masterdata | `masterdata.category` | Create a product category | `product_category:create_record` |
| masterdata | `masterdata.product` | Create product (category→family→product) | `product:create_record` |
| masterdata | `masterdata.location` | Create a location (buyer hub) | `buyer_hub:create_record` |
| masterdata | `masterdata.team` | Create a team | `team:create_record` |
| masterdata | `masterdata.user_permissions` | Create user + grant permission via team | `user:create_record` |
| vendor | `vendor.discovery` | Fetch the client's vendor list | always |

Plus the full **vendor lifecycle** (invite → login as vendor → bid → evaluate →
award) in `tests/flows/vendor-bid.spec.ts` (not yet a registry module because it
needs a short bid-window wait).

Disabled flows **skip with a reason** (e.g. Moon Beverages skips BOQ because
`boq_in_erfx_allowed` is off). The runner prints a per-client capability map
grouped by category.

---

## 3. Source layout (what each file does)

```
src/
  config.ts            CONST (app keys/versions) + CLIENTS map + ACTIVE_CLIENT → CONFIG
  identities.ts        asBuyer/asVendor/asEvaluator/asVendorEmail → logged-in ApiClient
  context.ts           resolveClientContext(COMPANY_ID) → {buyerApi, catalog, vendor, evaluatorUuid}
  fixtures.ts          static clientA fixtures (buyerApi from cached token)
  dbFixtures.ts        DB-driven `client`/`buyerApi` fixtures keyed on COMPANY_ID

  api/
    client.ts          ApiClient (per-identity baseURL + app-version, qs params, ApiError, 200–204)
    endpoints.ts       every endpoint path (55 builders)

  auth/
    token.ts           bootstrap / 3-segment access / lightspeed token builders
    login.ts           authenticate(identity) via OTP: generate_otp → verify_otp
    sessionAuth.ts     build an auth token from a DB session row (NO OTP)
    store.ts           token cache for the setup project

  db/
    pool.ts            read-only Postgres pool (DATABASE_URL, SSL)
    clients.ts         resolveClient(companyId) via live session (incl. workspace/operator model); listTestableClients()
    verify.ts          DB-as-oracle: event_groups / trade_requests / products / categories / buyer_hubs / users / teams

  catalog/
    resolve.ts         resolveCatalog(buyerApi): product/quality/templates/location from the API per client
    users.ts           listCompanyUsers / resolveEvaluatorUuid (get_all_users)

  flows/
    bodies.ts          pure request-body builders (technical/pricing/auction stages, bids, surrogate, counter-offer, auction, awarding, event group)
    createEvent.ts     composable createEvent({stages:[rfp|rfq|auction]}) + createRfqTechnicalEvent wrapper
    enrich.ts          fetch trade-product ids + technical form uuids
    surrogate.ts       buyer places surrogate technical + rfq bid (on vendor's behalf)
    vendorBid.ts       vendor: technical response + priced bid
    evaluation.ts      evaluator: score a technical form
    awarding.ts        buyer: proposal → response → approval flow → submit
    features.ts        F2 versioning, F5 convert-to-auction
    boq.ts             BOQ: template → excel → product_sheet_params parse → BOQ event group
    prToEvent.ts       convert an existing PR into an event
    masterData.ts      create category/product/location/team/user(+team permission)
    vendors.ts         vendor discovery / pickInvitableVendor / listInvitableVendors

  master/
    config.ts          ClientConfig (loads dashboard_configuration; flag() + hasModule())
    types.ts           FlowModule { key, category, title, enabledFor(config), run(ctx) }
    registry.ts        REGISTRY[] — the master list of all flows

tests/
  auth.setup.ts        logs in once, caches tokens
  auth.spec.ts         auth milestone (login → token → GET 200 + negative)
  reads.spec.ts        read-only endpoints (dashboard config, orders, chained trade schema)
  events/create-event.spec.ts    dynamic RFP+RFQ create
  flows/lifecycle.spec.ts        create → surrogate → award proposal (clientA)
  flows/features.spec.ts         F2 versioning, F5 auction
  flows/vendor-bid.spec.ts       FULL vendor lifecycle (invite→bid→evaluate→award)
  flows/vendors.spec.ts          vendor discovery
  clients/lifecycle.spec.ts      DB-driven per-COMPANY_ID lifecycle + DB oracle
  db/client-selection.spec.ts    proves DB-driven client selection; lists testable clients
  master.spec.ts                 THE MASTER RUNNER (config-driven)
```

---

## 4. How the DB-driven mechanism works

**Selecting a client (`COMPANY_ID`).** A "client" is a company inside one
environment; the URL never changes per client — only the login does.

1. **Resolve the client** (`db/clients.ts`) — find the company's buyer via its
   most-recent web-console **session** in Postgres. Handles the *workspace model*:
   some clients (e.g. Moon Beverages) have no direct users and are operated by a
   parent/support account — resolved via `trade_requests`.
2. **Auth without OTP** (`auth/sessionAuth.ts`) — build the token from that
   session: `base64(appKey:appSecret:sessions.access_token)`. Console keys for
   buyers, agribid keys for vendors.
3. **Resolve the catalog** (`catalog/resolve.ts`) — product/quality/templates/
   location come from the **API** (uuids are encoded, so the API is the source),
   plus a vendor and an evaluator user.
4. **Load config** (`master/config.ts`) — `GET /v1/dashboard_configuration`,
   exposing feature flags and authorized modules.
5. **Run enabled flows** and **verify in the DB** (`db/verify.ts`).

**Session reuse caveat:** a client is testable this way only if it has a recent
web-console session. `listTestableClients()` shows which qualify now.

---

## 5. Auth model (verified from source)

- Header `access-token`: bootstrap `base64(appKey:appSecret)` before login;
  `base64(appKey:appSecret:<access_token>)` after.
- Header `lightspeed-token` = `base64(JSON({device-type:web-console, uuid:nanoid}))`.
- Header `app-version` per identity (console 9.4.x for buyer/evaluator, agribid 2.30.x for vendor).
- OTP login: `POST /v1/generate_otp` → `POST /v1/verify_otp` (phone for buyer/evaluator, email for vendor).
- DB-session login: no OTP — token built from `sessions.access_token`.
- Success = HTTP 200–204; errors surface `{ error: { message } }` as `ApiError`.

---

## 6. Config-driven behaviour (flag → flow)

Feature flags come from `dashboard_configuration` (top-level or
`configurations.global_config`); module permissions from `authorized_permissions`.
Key gates used:

- Events: `trade:create_record`; eRFx = `rfx_project_enabled`.
- BOQ: `boq_in_erfx_allowed`.
- PR→Event: `pr` module + `trade:create_record`.
- Master data: `product` / `product_category` / `buyer_hub` / `user` / `team` `:create_record`.
- (Available for future flows) counter-offer hidden by `hide_counter_offer_rfq`,
  vendor onboarding by `is_vendor_onboarding_enabled`, PR splitting by
  `is_pr_splitting_enabled`, etc.

Example: PROCOL DEMO has BOQ on (18 checks run); Moon Beverages has BOQ off
(BOQ skips with reason).

---

## 7. Known clients & the one gap

**Testable example clients (have live console sessions):**
- `198678` PROCOL DEMO — BOQ + intake modules on (best all-round).
- `39490` M/s Moon Beverages — workspace client (operated by support account); BOQ off.
- Others with BOQ on: `32461` Demo Account 2, `41533` Blue Star, `43386` DLF Hospitality.

**The one procurement path not yet automated: Intake → PR.** Creating an intake
is a 4-section template form that differs per client — best built from a captured
intake HAR (like the event flow) or slower code derivation. PR→Event and direct
Event are done.

---

## 8. Configuration (`.env`, git-ignored)

- `DATABASE_URL` — Postgres for the environment (used for client selection + verification).
- `COMPANY_ID` — which client to run as (or pass inline).
- `ACTIVE_CLIENT` / `OTP` — optional overrides for the static clientA path.

Non-secret sandbox values (app keys, sample phones/OTP) live in `src/config.ts`.
