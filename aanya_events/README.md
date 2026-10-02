# aanya_events — sourcing-event API automation

One folder per event type. Each is a self-contained Playwright project that
the QA platform drives through the **test** client.

| Folder | What it automates | Cases |
|---|---|---|
| `rfp/` | Publishing an RFP **or RFQ** event, and a surrogate bid on an RFP: the "RFP/RFQ Event Publish + Surrogate Bid" Postman collection, request for request | 10 publish · 10 verification · 84 negative/edge · 15 surrogate · 35 surrogate validations · 3 parallel-latency |

## rfp/

```bash
cd aanya_events/rfp
npm install
cp .env.example .env        # paste AANYA_EVENTS_ACCESS_TOKEN (cpanel → DevTools → any sec-api call)
npx playwright test         # publish + verify + negative
RFP_SUITES=publish npx playwright test
RFP_FEATURES=events.rfp_only,events.config npx playwright test   # as the platform picks
RFP_NUM_LINE_ITEMS=3 RFP_QUANTITIES=5,10,2.5 RFP_NUM_VENDORS=2 npx playwright test
RFP_SCENARIO=4 npx playwright test   # one of the collection's data-file rows (src/scenarios.ts; 7–9 are RFQ)
RFP_RFX_MODE=rfq npx playwright test   # an RFQ instead of an RFP
open reports/rfp-report.html
```

Nothing about the account is hard-coded. Products, units, variants, the
template, evaluators and vendors are looked up at run time. The settings in
`src/config.ts` (every variable the collection had, as `RFP_<NAME>`) only say
how many to use, or which ones by name.

**Layout**
- `tests/01-publish.spec.ts`: 1.1–1.10, from new_request_config to publish
- `tests/02-verify.spec.ts`: 2.1–2.10, reading the published event back
- `tests/03-negative.spec.ts`: 3.0–3.5.99, one broken thing per case
- `tests/04-surrogate.spec.ts`: 4.1–4.15, the buyer bids on a vendor's behalf
- `tests/05-surrogate-negative.spec.ts`: 5.1.1–5.3.99, broken surrogate bids
- `tests/06-latency.spec.ts`: 6.1–6.3, the same reads fired in parallel
- `tests/07-vendor-bid.spec.ts`: 4.0a–4B.16, the vendor bids from the vendor portal
- `tests/08-vendor-bid-negative.spec.ts`: 5B.1.1–5B.3.99, broken logins and bid sheets
- `src/harness.ts`: one case = one test; the collection's `pm.test` lines become named checks; critical checks stop the publish flow
- `src/reporter.ts` + `src/reportHtml.ts`: `reports/rfp-run.json` and `reports/rfp-report.html`

**The report** follows the collection's steps in order. Each negative case
sits under the step it attacks. Every row has a plain sentence, an Expected
result (written before the request goes out), an Actual result and a verdict.
Open a row to see its checks and a curl for the call the verdict turned on.
The curl prints the token as `$ACCESS_TOKEN`.

## On the platform

Pick **test** in the client dropdown. Its tree is the same as every other
account's, module for module. The features this suite tests are live; every
other feature is greyed out ("no tests yet"). `features.json` decides which
cases test which feature:

| Feature | Cases |
|---|---|
| Sourcing events → Technical / RFP only | 1.1–1.10, the publish flow as an RFP |
| Sourcing events → RFQ only | the same flow as an RFQ: price template (1.4–1.5), its RFQ settings (1.5b), a delivery location looked up live (1.5c), the products' own vendors (1.7), a price round with a row per line item (1.9) — no evaluators |
| Sourcing events → Publish event | 2.1–2.10 read-backs, 3.4.x publish validation |
| Sourcing events → Event validation | 3.0, 3.2.x create-event validation |
| Sourcing events → Event configuration | 3.3.x stage validation — each case in the shape of the round being built; 3.3.25–3.3.37 are the RFQ price sheet's own rules |
| Sourcing events → Invite vendors | 3.5.10–3.5.11 |
| Sourcing events → Surrogate bid | 4.1–4.15 the surrogate bid, 5.x its validations — runs only when ticked |
| Sourcing events → Vendor bid (vendor portal) | 4.0a–4.0c pick the vendors, 4B.1–4B.16 each vendor logs in with its email + OTP and bids itself, 5B.x its validations — runs only when ticked |
| Platform & config → API hardening | 3.1.x security, remaining 3.5.x, 6.x parallel latency |

Tick features, then set the line items, the quantity (one for all, or `5,10`
one per item) and the number of vendors, and run. The publish flow always runs
first. Each case streams in as a row. At the end the run links its own
**RFP test report** and **bug sheet**. Runs are kept under
`prototype/data/rfp-runs/`.

**RFP or RFQ is one suite**, as it is one collection. Tick *RFQ only* and the run is an RFQ; anything else is an RFP. Cases that only make sense for one kind (evaluators and the surrogate bid for RFP; the RFQ settings, delivery location and price-sheet cases for RFQ) are left out of the other — the surrogate bid says so when ticked on an RFQ. An RFQ uses `RFP_RFQ_TEMPLATE_UUID` / `RFP_RFQ_TEMPLATE_NAME` when set; a template named for the RFP is set aside, since it is not an RFQ template.

**Signing in never needs a pasted token.** Like the UAT clients, the suite reads the freshest live console session for Demo Account 2 (`AANYA_EVENTS_DB_COMPANY=32461`) out of Procol's database, using `procol test`'s own lookup and its `DATABASE_URL`. The platform does this on every run, and so does `npx playwright test` from a terminal. `AANYA_EVENTS_ACCESS_TOKEN` in `rfp/.env` is only a fallback for when the database can't be reached. The one thing that can still stop a run is having no live session at all: someone who operates the company needs to have signed in to the console. The run says so if that happens.
