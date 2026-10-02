# Procol UI Tests

Standalone **Playwright + TypeScript** browser-automation framework for the Procol
buyer console. It is the UI twin of the API framework (`../procol test`): every
flow is a config-gated, self-verifying `UiFlowModule` with the same shape as the
API layer's `FlowModule`, so a future AI orchestrator can call UI and API tests
interchangeably.

## Status

| Flow | Key | State |
| --- | --- | --- |
| Single-stage RFQ create & publish | `events.rfq_only` | ✅ green (creates a real published RFQ, verified in-app) |

Auth (phone-OTP login → storage state) and the config-driven master runner are
green against `clientA` (`cpanel.ag-ri.in` → `sec-api.ag-ri.in`).

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env        # defaults already target clientA
npm run test:master         # capability map + run enabled flows
```

Other entry points:

```bash
npm run test:auth           # just log in and cache the session/token
npm test                    # run everything
npm run test:headed         # watch it drive the browser
npm run report              # open the last HTML report
npm run typecheck           # tsc --noEmit
```

## How a client is selected

A **client = (frontend URL, backend URL, credentials)**. Because the console
reads its backend from `localStorage` (injected before the SPA boots), one
frontend build can be pointed at any backend.

Run a different client with **zero code changes** — pick any name and give it
env vars:

```bash
ACTIVE_CLIENT=acme \
ACME_APP_URL=https://acme-console.example \
ACME_API_URL=https://acme-api.example/api \
ACME_BUYER_PHONE=99xxxxxxxx ACME_OTP=xxxxxx \
npx playwright test tests/ui-master.spec.ts
```

Generic one-off overrides (`APP_URL`, `API_URL`, `BUYER_PHONE`, `OTP`, ...) win
over everything. See `.env.example` and `src/config.ts`.

## Architecture

```
src/
  config.ts            client-agnostic config (CLIENTS map + env resolution)
  support/locate.ts    resilient multi-candidate locators (self-healing)
  pages/               Page Objects (BasePage, LoginPage, EventsPage, CreateEventPage)
  helpers/             inline-sheet driver, dynamic data generators
  flows/               UiFlowModule implementations (one file per flow)
  master/
    types.ts           UiFlowModule / FlowResult / gate (mirrors API layer)
    config.ts          ClientConfig — read-only dashboard_configuration probe
    registry.ts        REGISTRY[] — the master list of UI flows
tests/
  auth.setup.ts        login → storage state + captured access-token header
  ui-master.spec.ts    config-gated runner + per-client capability map
  flows/               focused per-flow specs
```

See [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) for conventions, the resilient
locator pattern, app quirks, and how to add a new flow.
