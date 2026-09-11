# Decathlon 3-Way Match — Playwright API Test Suite

A Playwright port of `../postman/Decathlon_3Way_Match.postman_collection.json` — same 21
requests, same order, same 4 assertion categories per request (status code, response time,
schema validation, data validation). Use this when you want the flow in CI, in TypeScript, or
runnable without Postman installed.

**Live-verified**: `npx playwright test` → 21/21 passing against the real API.

## Setup
```bash
npm install
npx playwright install   # only needed once, installs Playwright's browser/test runtime
cp .env.example .env     # then edit .env
npm test
npm run test:headed-report   # opens the HTML report from the last run
```

## Editing a scenario
Everything is in `.env` — same variables as the Postman environment, just SCREAMING_SNAKE_CASE:

| .env variable | What it is |
|---|---|
| `PO_QTY` / `PO_UNIT_PRICE` | PO Line Item → **PO Amt** |
| `GRN_RECEIVED_QTY` / `GRN_ACCEPTED_QTY` | GRN Line Item (Accepted ≤ Received is enforced) |
| `INVOICE_QTY` / `INVOICE_UNIT_PRICE` / `INVOICE_BASE_PRICE` | Invoice Line Item → **Invoice Amt** |
| `VENDOR_RELATION_UUID` / `COST_CENTER_UUID` / `BUYER_GST_UUID` | Fixed supporting data, rarely need to change |
| `MAX_RESPONSE_TIME_MS` / `MAX_RESPONSE_TIME_MS_HEAVY` | Response-time budgets (light vs. workflow/automation calls) |

No code edits needed to replay a scenario — just edit `.env` and re-run.

## Structure
```
tests/
  fixtures/
    config.ts         -- loads .env into a typed config object
    state.ts           -- mutable state shared across the 21 sequential steps (chained uuids)
    schemas.ts          -- ajv JSON Schemas (5 response shapes) + validateSchema()
    api-helpers.ts       -- callApi(), assertCommon(), findField(), findColumnIndex(), etc.
  3way-match.spec.ts       -- the 21 steps, one test() each, inside test.describe.serial()
```

`test.describe.serial()` guarantees steps run in order on a single worker (see
`playwright.config.ts` — `workers: 1`) since each step's request body depends on the previous
step's captured uuid, same dependency chain as the Postman Runner order.

## Why some assertions look the way they do
Two real behaviors were caught by running this live against the API, not assumed:

- **Cost Center / Buyer GST don't echo their value in the same PATCH response.** Cost Center
  comes back as a raw internal id (not the relation uuid sent); Buyer GST comes back with no
  `value` key at all in that response. Both resolve correctly on a later GET. So instead of
  comparing values, `assertFieldTouched()` checks `updated_at` moved past `created_at` — proof
  the field was genuinely modified by that request (a blank placeholder field_response row
  exists for every field from record creation, so mere row *existence* would prove nothing).
- **`GET /api/fx_responses/{uuid}?` (steps 19/20) has a different shape than
  `GET /api/fx_views/records?...` (steps 10/14)** — the former has no `pagination` key at all.
  They get separate schemas (`viewRecordsSchema` vs. `responseDetailSchema`).
- **Workflow-run/automation-trigger calls are legitimately slower** than plain CRUD (they do
  real cross-record work server-side — creating a whole linked Invoice/GRN/Bill, running match
  logic). They get `MAX_RESPONSE_TIME_MS_HEAVY` instead of the tighter default.

## Known caveats
Same as the Postman kit (see `../postman/README.md` for full detail):
- `ACCESS_TOKEN_RAW` is a static app key captured from a HAR session, not a personal login
  token. Re-capture a fresh HAR and swap it if requests start 401ing.
- Qty Received and Accepted Qty are two separate PATCH calls (steps 11a/11b) — the server checks
  the balance rule against what's already saved, not what's arriving in the same request.
- A handful of PO/GRN/Invoice header fields (Vendor, Cost Center, Buyer GST, Remarks, GRN Type,
  Category, Payment Terms, RCM) are required by the matching automations even though only the
  line-item amounts matter for the scenario you're testing — see step 2/5/12/16 comments in
  `3way-match.spec.ts`.
