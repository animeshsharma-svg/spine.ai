# Vendor Revalidation - QA and Automation Guide

> Part 1: Guide. Part 2: Automation test cases (138). Part 3: Manual test cases in plain language (143).

# Part 1 - Guide

2026-10-15 · @Animesh

Everything needed to test and automate vendor document revalidation on UAT: access, setup, the QA APIs, the rules the engine follows, what to check on screen, and the full test case list (in the Test Cases tab). Rules here are taken from the UAT code (branch rfx-uat-main) and the QA API guide, not only the TRD.

## Environment and access

The QA APIs run only on UAT and only for a Procol employee login; anything else returns code 5 "Not authorized".

| Item | Value |
| --- | --- |
| Base URL | `https://rfx-uat-api.ag-ri.in/api/vendor_revalidation_qa` |
| Environment | UAT only. Blocked on production by code (any production call returns code 5). |
| Who can call | A user whose company is the Procol employee company. Client users (Gmmco buyers, `qa_` test users) get code 5 even with a valid token. |
| Headers | `access-token: <token>`, `Content-Type: application/json`, `User-Agent: <any>` |
| Client under test | Gmmco, `client_company_id` = 47053 |
| Time zone | All times are IST. A `run_at` without an offset is read as IST. |
| Provider calls | Real GST / PAN / MSME / bank providers. Keep runs small with `vendor_ids` or `vendor_limit`. |

**Getting the token**

1. Log in to the UAT dashboard whose network calls go to `rfx-uat-api.ag-ri.in`, with a Procol employee account.
2. Press F12, open Network, click any request whose URL starts with `https://rfx-uat-api.ag-ri.in/`.
3. Copy the `access-token` request header.

**Why "Not authorized" (code 5) happens**

- The token is from another environment (for example a cpanel.ag-ri.in session that talks to sec-api.ag-ri.in). Sessions do not carry across environments.
- The logged-in user is not in the Procol employee company.
- In Postman, a selected environment has its own `token` or `base` variable, which overrides the collection variable. Select "No environment" or update the environment's value.
- The token expired after logout. Copy a fresh one.

## Setup

Use the Postman collection for manual runs, or call the same five endpoints over HTTP from the automation platform.

**Postman (manual)**

1. Import `test-cases/postman/Vendor_Revalidation_QA.postman_collection.json` (8 requests, folder "Vendor Revalidation QA (UAT)").
2. Collection > Variables: set `token`. `base` and `client_id` (47053) are pre-filled.
3. Select "No environment" in the top-right dropdown, or make sure the selected environment does not define `token` / `base`.
4. The trigger requests save `run_id` and `job_id` into collection variables automatically, so the progress and cancel requests work straight after.

**Automation platform (HTTP)**

| Variable | Value |
| --- | --- |
| `BASE` | `https://rfx-uat-api.ag-ri.in/api/vendor_revalidation_qa` |
| `TOKEN` | Procol employee `access-token` from UAT (secret; never log it) |
| `CLIENT` | 47053 |
| `VENDORS` | 2 to 5 known Gmmco vendor ids with prepared data (see Test data) |

Every request sends the three headers from Environment and access. Save the original config with `GET /config` before a test suite and restore it with `PUT /config` at the end.

## API reference

Five endpoints under `BASE`. Errors come back as `{"error":{"code":N,"message":"..."}}` with HTTP 422 (or 404 for cancel).

| Method | Path | Body / query | Success response |
| --- | --- | --- | --- |
| GET | `/config?client_company_id=47053` | - | `client_company_id`, `config`, `enabled` (true only when config enabled AND client on onboarding v2), `vendor_onboarding_v2` |
| PUT | `/config` | `{"client_company_id":47053,"config":{...}}` - replaces the whole config | Same shape as GET, with the saved config |
| POST | `/trigger` | `client_company_id`, `mode` (`force` / `scheduler`), optional `run_at`, optional `vendor_limit` OR `vendor_ids` | `job_id`, `run_id`, `run_scheduled_on`, `scheduled_for`, `mode`, `vendor_count` |
| GET | `/runs/<run_id>` (optional `?job_id=`) | - | `run_id`, `trigger` (state object), `total_rows`, `vendors`, `finished_vendors`, `by_status`, `by_doc_type`, `top_errors` (max 10), `complete` |
| DELETE | `/trigger/<job_id>` | - | `{"job_id":...,"state":"cancelled"}` |

**Trigger fields**

- `mode: force` checks every configured document type now. `mode: scheduler` checks only document types due on the run date (see How a run works).
- `run_at`: optional, ISO time; IST when no offset. Past by more than 1 minute or more than 30 days ahead is refused.
- `vendor_limit`: first N vendors by vendor id, same N every time. `vendor_ids`: only these vendors. Not both.
- `trigger.state` moves `scheduled` > `started`, or ends as `nothing_due`, `disabled` or `cancelled`.
- `complete` is true only when there is at least one row and no row is `pending`.

**Every error message**

| When | Code | Message |
| --- | --- | --- |
| Not a Procol employee, or production | 5 | `Not authorized` |
| Unknown client | 2 | `client_company_id not found` |
| Config is not an object | 2 | `config must be an object` |
| `enabled` missing / not boolean | 2 | `enabled must be true or false` |
| `vendor_statuses` empty or has an unknown value | 2 | `vendor_statuses must be a non-empty list from: <list>` |
| `validations` empty | 2 | `validations must be a non-empty object` |
| Unknown document type | 2 | `unsupported doc types: <names>` |
| Bad frequency | 2 | `<doc>: unsupported frequency '<value>'` |
| Bad start date | 2 | `<doc>: invalid start_date '<value>'` |
| No paths | 2 | `<doc>: paths must be a non-empty list` |
| Bad path syntax | 2 | `<doc>: unsupported path '<value>'` |
| Trigger on a disabled client | 2 | `vendor revalidation is not enabled for this client (needs vendor onboarding v2 and config enabled: true)` |
| Missing / wrong mode | 2 | `mode must be one of: force, scheduler` |
| Bad `run_at` text | 2 | `run_at must be a time like <example> (IST if no offset)` |
| `run_at` in the past | 2 | `run_at is in the past` |
| `run_at` too far | 2 | `run_at must be within 30 days from now` |
| Both scope fields | 2 | `send either vendor_ids or vendor_limit, not both` |
| `vendor_limit` not a positive integer | 2 | `vendor_limit must be a positive integer` |
| `vendor_ids` not integers | 2 | `vendor_ids must be a list of integers` |
| `vendor_ids` not this client's, or not in configured statuses | 2 | `vendor_ids not among this client's vendors in the configured statuses: <ids>` |
| No vendor matches the statuses | 2 | `no vendors match the configured vendor_statuses` |
| Cancel after start, or unknown job | 2 (HTTP 404) | `trigger not found or already started` |

## Config reference

One config per client, sent whole with `PUT /config`. A field left out is gone, so always send every document type you want kept.

```json
{
  "client_company_id": 47053,
  "config": {
    "enabled": true,
    "vendor_statuses": ["active", "invited"],
    "validations": {
      "gst":  { "paths": ["form.gstin", "company.gst_no"], "frequency": "quarterly", "start_date": "2026-10-15" },
      "pan":  { "paths": ["form.pan_no", "company.pan_no"], "frequency": "yearly", "start_date": "2026-10-15" },
      "msme": { "paths": ["form.msme_no"], "frequency": "one_time", "start_date": "2026-10-15" },
      "bank": { "paths": ["form.bank_account_no", { "bank_account_no": "company.misc.bank_account_number", "ifsc": "company.misc.bank_ifsc_code" }], "frequency": "quarterly", "start_date": "2026-10-15" }
    }
  }
}
```

| Field | Allowed values | Notes |
| --- | --- | --- |
| `enabled` | `true` / `false` | Runs also need the client on vendor onboarding v2 |
| `vendor_statuses` | `active`, `invited`, `onboarding_in_progress`, `in_review`, `in_approval`, `rejected`, `blacklisted`, `in_active` | Non-empty. Only vendors linked to the client in these states are checked |
| document type keys | `gst`, `pan`, `msme`, `bank`, `vat`, `cin`, `fssai`, `tan` | Anything else is refused |
| `frequency` | `one_time`, `monthly`, `quarterly`, `six_monthly`, `yearly` |  |
| `start_date` | `YYYY-MM-DD` | First due date; cycles are counted from it |
| `paths` | list, tried in order; first that gives a value wins | See below |

**Path syntax**

| Path | Reads from |
| --- | --- |
| `form.<field_key>` | The vendor's latest onboarding v2 form for this client (accepted response preferred). Repeated fields (`key#...`) give one check each. Client onboarding rules (name match etc.) apply |
| `company.<column>` | A column on the vendor's company record. Provider check only. A column that does not exist counts as empty |
| `company.misc.<key>` | The company's extra data (mostly from bulk upload); dots go deeper (`a.b`) |
| `company.extended_fields.<key>` | An active extended field on the vendor company |
| `{ "bank_account_no": "<path>", "ifsc": "<path>" }` | Two-input checks (bank). Both values must exist, otherwise the entry counts as empty |

A value counts as empty when it is blank, only spaces, a link (`http://` / `https://`), or an uploaded file. Numbers are turned into text. Then the next path is tried; if all are empty the check is `skipped` with "not provided".

## How a run works

A run is one client on one date; it creates one row per vendor per document value, works through them in the background, and finally sets one status per vendor.

1. **Start.** Either the nightly scheduler (11 pm IST) or a QA trigger. The run id is fixed per client per date, so every trigger on the same day shares one run id.
2. **Pick document types.** Force: every configured type. Scheduler: only types due on that date (start date + whole cycles, moved to the month end when the day does not exist, missed dates caught up for 2 days) and not already checked since that due date. `one_time` is due only on its start date (or within the 2 catch-up days).
3. **Pick vendors.** Vendors linked to the client whose link status is in `vendor_statuses`, linked by referral or Procol, and whose company is active; sorted by vendor id; then cut by `vendor_ids` / `vendor_limit`.
4. **QA reset (trigger only).** Before starting, the chosen vendors' rows for this run are deleted and their final status cleared, so a re-trigger rebuilds them with no duplicates.
5. **Create rows.** One `pending` row per vendor per document type, in batches of 100 (changeable through a Procol setting). Vendor jobs are spread out so calls stay at about 30 per minute per provider.
6. **Read values.** For each row, the paths are tried in order. No value means `skipped` "not provided". Several values (2 GSTs) create extra rows, one per value.
7. **Check.** A format pre-check runs first; then the provider is called through a rate limiter and a breaker (below). Valid gives `passed`; invalid gives `failed` with the provider's message (or "<DOC> Validation failed"); a missing input from the provider gives `skipped`.
8. **Provider trouble.** Rate limit, timeouts, server errors or login errors leave the row `pending` and re-schedule it. Other document types of the same vendor carry on.
9. **Deadline.** A row still pending 24 hours after the run started becomes `system_error` "verification is temporarily unavailable". A cleaner job closes anything left pending after 25 hours. A vendor job that crashes 3 times also closes its rows as `system_error`.
10. **Finish the vendor.** When a vendor has no pending rows, its final status, run id and last validated time are written on the client-vendor link.
11. **Finish the run.** When no row of the run is pending, one summary line goes to the app logs (passed / failed / skipped / system_error counts). Nothing goes to Slack or Sentry.

**Limits and timings (from code)**

| Rule | Value |
| --- | --- |
| Provider rate limit | 30 calls per minute per provider; over that, the call waits for the next minute |
| Breaker opens on | Any rate-limit answer, or 5 failures in a row |
| Breaker wait | Provider's Retry-After if sent; otherwise 15 min, doubling after each failed test call (30, 60 min ...), max 24 hours |
| After breaker wait | One test call (5 min lock); success or an "invalid" answer closes the breaker; others return with up to 2 min random delay |
| Single failure (breaker not open) | Retry after about 60-90 seconds |
| Run deadline | 24 hours from run start, then `system_error` |
| Cleaner | Closes rows pending more than 25 hours |
| Same-day run claim | 1 hour (stops a second nightly start the same day) |
| Scheduler skip | No new nightly run while the client has any pending row |
| QA trigger state kept | 7 days |

## Statuses, final status and error text

Each row has one status; the vendor's final status is the highest-ranked status among its latest row per document type.

| Row status | Meaning | Error text stored |
| --- | --- | --- |
| `pending` | Waiting to be checked (or waiting on the provider) | - |
| `passed` | Provider confirmed it and client rules passed | none |
| `failed` | Provider said invalid, or a client rule failed | Provider message, or `<DOC> Validation failed` |
| `skipped` | No value on any path | `not provided` (not shown as an error) |
| `system_error` | Could not be checked (deadline, crashes, disabled mid-run, provider error type) | `verification is temporarily unavailable` |

**Final vendor status** = first match in this order: `failed` > `system_error` > `passed` > `skipped`. So one failed check makes the vendor Failed; a system error outranks passed checks.

**Which rows count:** for each document type, the rows from the newest run date that has finished rows for that type. Types not due in a run keep their older rows.

**Last validated** = the start time of the run that last finished the vendor.

**Errors list** = one line per `failed` or `system_error` row, written as `<DOC> <value>: <message>`, for example `GST 27ABCDE1234F1Z5: GST input is incorrect`. Skipped documents are not listed.

## What to check in the UI

After a run is complete, the buyer dashboard (Gmmco buyer login on UAT) must show the same results as the API.

| Screen | What must be there |
| --- | --- |
| Vendor listing, every tab | Columns Validation Status, Last Validated At, Validation Errors for each vendor |
| Listing filters | Validation status filter and last validated date range; results match the API counts |
| Vendor page, Revalidation Details | Each latest check: document type, value, status, error (none for skipped), last run time |
| Excel bulk download | Two extra columns: Validation Status and Validation Errors (one message per line) |
| Client with revalidation off | None of the above columns, filters or details |

Cross-check rule for automation: for each vendor in the run, the listing status = the final status worked out from that vendor's latest rows, and the errors shown = the `failed` and `system_error` lines.

## Test data needed

Prepare these Gmmco vendors on UAT once and record their vendor ids; the test cases refer to them by these names.

| Name | What the vendor needs |
| --- | --- |
| V-PASS | Valid active GST, valid PAN, valid Udyam, valid bank + IFSC, on the onboarding v2 form |
| V-BADGST | GST that does not exist (e.g. 27ABCDE1234F1Z5), rest valid |
| V-CANCELLED | A real GST that is cancelled on the GST portal |
| V-2GST | Two GST values on the form, one valid and one invalid |
| V-NODOCS | No GST, PAN, MSME or bank anywhere |
| V-FILEONLY | MSME field holds only an uploaded certificate file |
| V-COMPANYONLY | Form empty, GST and PAN only on the company record |
| V-MISC | Bulk-uploaded vendor with PAN and bank only in company extra data (`misc`) |
| V-BANKHALF | Bank account in company extra data but no IFSC |
| V-NAMEMISMATCH | Valid GST registered to a different legal name, on the form |
| V-STATUS-* | One vendor in each link status: active, invited, onboarding_in_progress, in_review, in_approval, rejected, blacklisted, in_active |
| V-OTHERCLIENT | A vendor linked to Gmmco and to a second client with revalidation on |
| V-NOTGMMCO | A vendor that is not linked to Gmmco (for negative vendor_ids tests) |

## Automation recipe

Most cases follow one loop: set config, trigger a small run, wait until complete, check the API counts, then check the screens.

1. **Before the suite:** `GET /config` and keep the response to restore later.
2. **Arrange:** `PUT /config` with the config the case needs (whole config).
3. **Act:** `POST /trigger` with `mode` from the case and `vendor_ids` of the prepared vendors (prefer ids over `vendor_limit` so results are predictable). Store `run_id` and `job_id`.
4. **Wait:** `GET /runs/<run_id>?job_id=<job_id>` every 30 to 60 seconds until `complete` is true. Timeout 15 minutes for normal cases; mark as Blocked (not Failed) if rows stay `pending` because a provider is rate-limiting.
5. **Assert API:** `trigger.state`, `by_status`, `by_doc_type`, `top_errors`, `vendors` / `finished_vendors` against the case's expected values.
6. **Assert UI:** listing columns and filters, vendor page details, Excel columns for each vendor in the run.
7. **Repeatability:** a second trigger on the same day for the same vendors must give the same counts, not double them.
8. **After the suite:** `PUT /config` with the saved original; cancel any scheduled trigger still waiting with `DELETE /trigger/<job_id>`.

**Rules for the platform**

- Never log or store the token in reports.
- Keep provider calls low: 2 to 5 vendors per case, never the whole client.
- Cases that need a provider outage, a crash or a 24-hour wait are tagged Manual or Dev-assist in the Test Cases tab; skip them in unattended runs.
- Each run on a new date gets a new `run_id`; same-day triggers share one.

## Differences from the TRD and likely defects

The UAT build differs from TRD v1 in these places; cases expect the build's behaviour except where marked as a likely defect.

| Area | TRD v1 | UAT build | Treat as |
| --- | --- | --- | --- |
| Which vendors | Every vendor in any state | Only link statuses in `vendor_statuses` | Build behaviour (new setting) |
| Cycles | monthly to yearly | Also `one_time` | Build behaviour |
| Could-not-verify status | `unverified`, never affects Pass | `system_error`, ranks above `passed` | Confirm with product: a vendor with one passed and one system error shows System Error, not Pass |
| Breaker wait cap | 1 hour | Retry-After used as sent; own backoff up to 24 hours | Confirm with dev |
| Masking | PAN and bank masked in table, listing, detail, download | No masking seen in the code that stores and shows values | **Likely defect** - covered by I-01 to I-03 |
| Same-day re-run | Rows never overwritten | QA trigger deletes and rebuilds that day's rows for chosen vendors | Expected for QA trigger only |
| Duplicate-run claim | 7 days | 1 hour | Low risk; covered by B-12 |

Open questions: retention of history, price per validation, foreign tax numbers in the GST field, whether the Excel download lists missing documents.


# Part 2 - Automation test cases

## How to read the cases

Each module is one table; negative cases come first. Vendor names (V-PASS, V-BADGST ...) are from Test data in the Guide tab.

| Column | Meaning |
| --- | --- |
| ID | Module letter + number, e.g. A-03 |
| Test | What is being checked |
| Steps | API calls and screens, in order. "Run" = trigger with `mode: force` for the given vendors, then wait until `complete` |
| Expected | Exact pass condition (API fields, messages, screen values) |
| P | Priority: C = Critical, H = High, M = Medium, L = Low |
| Type | Neg / Pos / Edge |
| Auto | API = fully automatable over API; API+UI = API run then screen checks; Dev = needs dev help (outage, crash, logs); Manual |

## A. API access and input validation

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Non-Procol-employee token is refused | Use a Gmmco buyer token; GET /config | Code 5 `Not authorized`; nothing returned | C | Neg | API |
| A-02 | Missing / wrong token is refused | No access-token header; then a random string | Not authorized / auth error; no data | H | Neg | API |
| A-03 | Unknown client | GET /config?client_company_id=999999999 | Code 2 `client_company_id not found` | M | Neg | API |
| A-04 | Config not an object | PUT /config with `"config": "abc"` | `config must be an object`; config unchanged (GET shows old) | M | Neg | API |
| A-05 | enabled missing or not true/false | PUT with no `enabled`; then `"enabled":"yes"` | `enabled must be true or false` | M | Neg | API |
| A-06 | vendor_statuses empty or unknown | PUT with `[]`; then `["approved"]` | `vendor_statuses must be a non-empty list from: ...` | H | Neg | API |
| A-07 | validations empty | PUT with `"validations": {}` | `validations must be a non-empty object` | M | Neg | API |
| A-08 | Unknown document type | PUT with `"aadhaar": {...}` | `unsupported doc types: aadhaar` | M | Neg | API |
| A-09 | Bad frequency | gst frequency `weekly` | `gst: unsupported frequency 'weekly'` | M | Neg | API |
| A-10 | Bad start date | gst start_date `2026-13-45`, then `15-10-2026` | `gst: invalid start_date '...'` | M | Neg | API |
| A-11 | No paths | gst `paths: []` | `gst: paths must be a non-empty list` | M | Neg | API |
| A-12 | Bad path syntax | gst paths `["vendor.gst"]`, then `["form."]` | `gst: unsupported path '...'` | M | Neg | API |
| A-13 | Trigger on a disabled client | PUT enabled false; POST /trigger force | `vendor revalidation is not enabled for this client (needs vendor onboarding v2 and config enabled: true)` | C | Neg | API |
| A-14 | Mode missing or wrong | POST /trigger without mode; then `mode: now` | `mode must be one of: force, scheduler` | H | Neg | API |
| A-15 | Both vendor_ids and vendor_limit | Send both | `send either vendor_ids or vendor_limit, not both` | H | Neg | API |
| A-16 | vendor_limit not positive | `0`, `-1`, `"abc"` | `vendor_limit must be a positive integer` for each | M | Neg | API |
| A-17 | vendor_ids not integers | `["abc", 1.5]` | `vendor_ids must be a list of integers` | M | Neg | API |
| A-18 | Vendor not of this client | vendor_ids `[V-NOTGMMCO]` | `vendor_ids not among this client's vendors in the configured statuses: <id>` | H | Neg | API |
| A-19 | Vendor in a status not configured | vendor_statuses `["active"]`; vendor_ids `[V-STATUS-invited]` | Same message as A-18 with that id | H | Neg | API |
| A-20 | No vendor matches statuses | vendor_statuses `["in_active"]` where Gmmco has none | `no vendors match the configured vendor_statuses` | M | Neg | API |
| A-21 | run_at in the past | run_at = now minus 10 min | `run_at is in the past` | M | Neg | API |
| A-22 | run_at more than 30 days ahead | run_at = now + 31 days | `run_at must be within 30 days from now` | M | Neg | API |
| A-23 | run_at not a time | run_at `tomorrow` | `run_at must be a time like ... (IST if no offset)` | L | Neg | API |
| A-24 | Cancel unknown or started job | DELETE /trigger/abc123; DELETE a job already started | HTTP 404, `trigger not found or already started` | M | Neg | API |
| A-25 | Run status for unknown run | GET /runs/<random uuid> | `total_rows` 0, `vendors` 0, `complete` false; no error | L | Edge | API |
| A-26 | run_at 30 seconds in the past is accepted | run_at = now minus 30 s | Accepted (1 minute tolerance); runs now | L | Edge | API |
| A-27 | GET config returns the saved config | GET /config | `config` equals last PUT; `enabled` true only when config enabled and `vendor_onboarding_v2` true | H | Pos | API |
| A-28 | PUT replaces the whole config | PUT with only gst; GET | Only gst is in config; pan / msme / bank gone | H | Pos | API |
| A-29 | run_at without offset is IST | run_at `2026-10-16T15:00:00` | `scheduled_for` shows 15:00 +05:30 | M | Pos | API |

## B. Triggers and schedule

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| B-01 | Scheduler mode with nothing due | gst quarterly start = 10 days ago; POST /trigger mode scheduler, vendor_ids [V-PASS]; GET runs | `trigger.state` = `nothing_due`; no rows; `complete` false | H | Neg | API |
| B-02 | Scheduler does not repeat a type already checked since its due date | Scheduler run today; trigger scheduler again for a later date in the same cycle | Second trigger: `nothing_due` for that type | M | Neg | API |
| B-03 | one_time does not run again | msme one_time start = 5 days ago; scheduler trigger today | msme not checked (`nothing_due` if only msme) | M | Neg | API |
| B-04 | Catch-up stops after 2 days | gst monthly start = 3 days ago (no run since); scheduler trigger today | gst not due; `nothing_due` | M | Neg | API |
| B-05 | Cancelled trigger does nothing | Trigger with run_at +10 min; DELETE /trigger/job_id; wait past run_at | Cancel returns `state: cancelled`; GET runs shows `trigger.state` cancelled and no rows | H | Neg | API |
| B-06 | Config switched off before a scheduled trigger fires | Trigger run_at +5 min; PUT enabled false; wait | `trigger.state` = `disabled`; no rows | M | Neg | API |
| B-07 | Force checks every configured type regardless of dates | Config gst/pan/msme/bank with start dates in the future; Run force [V-PASS] | Rows for all 4 types; `by_doc_type` has gst, pan, msme, bank | C | Pos | API |
| B-08 | Scheduler on the start date | gst quarterly start = today; scheduler trigger now | gst rows created; state started | C | Pos | API |
| B-09 | Each cycle length | For monthly / quarterly / six_monthly / yearly with start 2026-10-10, scheduler trigger with run_at on the cycle date and one day after | Due only on 10th of the right months (Nov / Jan / Apr / Oct next year) | H | Pos | API |
| B-10 | Month end | gst monthly start 2026-10-31; scheduler run_at 2026-11-30, then 2026-12-01 | Due on 30 Nov, not on 1 Dec | H | Edge | API |
| B-11 | Catch-up within 2 days | gst monthly start = 2 days ago, never run; scheduler trigger today | gst is due and runs | M | Edge | API |
| B-12 | Same-day triggers share one run id | Trigger force twice today | Same `run_id` both times | H | Pos | API |
| B-13 | Re-trigger rebuilds with no duplicates | Run force [V-PASS, V-BADGST]; when complete, run again same vendors | Second run: same `total_rows` and `by_status`, not doubled | C | Pos | API |
| B-14 | Re-trigger of a subset leaves others alone | Run [V-PASS, V-BADGST]; then run [V-PASS] only | V-BADGST rows unchanged; V-PASS rebuilt | H | Edge | API |
| B-15 | Scheduled trigger starts on time | Trigger run_at +5 min; poll | `state` scheduled before, started within 1-2 minutes after run_at | H | Pos | API |
| B-16 | vendor_limit picks the same vendors every time | Run vendor_limit 3 twice | Same 3 vendor ids (lowest ids) both times | M | Pos | API |
| B-17 | Nightly run skips a client with pending rows | Leave a run with pending rows; let 11 pm scheduler run | No new run that night; log `run_skipped ... previous run in progress` | M | Edge | Dev |
| B-18 | Nightly run time | Config due today; do not trigger | Run starts at 11 pm IST (log `run_started`) | M | Pos | Dev |

## C. Vendor coverage

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | Status not in vendor_statuses is left out | vendor_statuses `["active"]`; Run with vendor_limit 50 | No rows for invited / rejected / blacklisted vendors | C | Neg | API |
| C-02 | Unlinked vendor is left out | Unlink a vendor from Gmmco; Run with vendor_limit covering it | No rows for it; its older rows still exist | H | Neg | API+Dev |
| C-03 | Inactive vendor company is left out | Vendor whose company is inactive; Run | No rows for it | M | Neg | API |
| C-04 | Client not on onboarding v2 | Second client without v2, config enabled true; GET config; trigger | `enabled` false, `vendor_onboarding_v2` false; trigger refused (A-13 message) | H | Neg | API |
| C-05 | Each link status is included when configured | For each status in the list: vendor_statuses = [that status]; Run [V-STATUS-that] | Rows created; vendor finished | H | Pos | API |
| C-06 | Bulk-uploaded vendor is included | Run [V-MISC] with paths that include company.misc | Rows created from its misc values | C | Pos | API |
| C-07 | Vendor under two clients is kept separate | Config both clients; Run each with [V-OTHERCLIENT] | Separate rows and separate final status per client; each client sees only its own | H | Pos | API+UI |
| C-08 | Status change during a run has no effect | Start Run; approve / change link of one chosen vendor mid-run | Vendor still checked in this run | M | Edge | API |

## D. Reading document values

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | All paths empty gives skipped | Run [V-NODOCS] | All rows `skipped`; error `not provided`; final status `skipped` (shown as not validated) | C | Neg | API+UI |
| D-02 | Uploaded file is not a value | msme paths [form.msme_no]; Run [V-FILEONLY] | msme `skipped` | H | Neg | API |
| D-03 | Link text is not a value | Put `https://...` in the GST field; Run | gst `skipped` (or next path used) | M | Neg | API |
| D-04 | Bank with account but no IFSC | bank paths [object path on misc]; Run [V-BANKHALF] | bank `skipped` | H | Neg | API |
| D-05 | Column that does not exist | gst paths ["company.gst_number_wrong", "company.gst_no"]; Run [V-COMPANYONLY] | No error; GST read from company.gst_no | H | Neg | API |
| D-06 | First path with a value wins | V-PASS has GST on form A and company record B (different); paths [form.gstin, company.gst_no] | Only A is checked (row value = A) | H | Edge | API |
| D-07 | Falls to company record when form is empty | Run [V-COMPANYONLY] with paths [form.gstin, company.gst_no] | GST from company record checked; no name-match rule applied | H | Edge | API |
| D-08 | Several values give several rows | Run [V-2GST] | 2 gst rows for this run (value_index 0 and 1) | C | Pos | API |
| D-09 | Extra data with nested key | pan paths ["company.misc.pan"]; Run [V-MISC] | PAN read from misc | M | Pos | API |
| D-10 | Extended field path | gst paths ["company.extended_fields.<key>"] for a vendor with that field | Value read and checked | L | Pos | API |
| D-11 | Latest onboarding response is used | Vendor re-submitted onboarding with a new GST | New GST is checked (accepted response preferred) | M | Edge | API |
| D-12 | Spaces are trimmed | GST value `"  27AAA...  "` | Checked as trimmed value | L | Edge | API |
| D-13 | Onboarding form is never changed | Note form values; Run; reopen form | Values and onboarding state unchanged | C | Neg | UI |

## E. GST, PAN, MSME and bank checks

Expected messages come from the provider; the rule is "same answer as onboarding v2 gives for that value".

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| E-01 | GST that does not exist | Run [V-BADGST] | gst `failed`; vendor Failed; error `GST 27ABCDE1234F1Z5: <provider message>` | C | Neg | API+UI |
| E-02 | GST wrong format (14 chars, symbols) | Set GST to a 14-character value; Run | gst `failed` from the pre-check (no provider call needed) | H | Neg | API |
| E-03 | Cancelled GST | Run [V-CANCELLED] | gst `failed`; message says cancelled / inactive, same as onboarding | C | Neg | API+UI |
| E-04 | One of two GSTs invalid | Run [V-2GST] | 1 gst row passed, 1 failed; vendor Failed; error names only the bad GST | C | Neg | API+UI |
| E-05 | GST name mismatch on form path | Client rule needs name match; Run [V-NAMEMISMATCH] | gst `failed` with name mismatch message, same as onboarding | H | Neg | API |
| E-06 | Foreign tax number in GST field | GST field holds `GB123456789`; Run | gst `failed` on format (open question with product) | M | Neg | API |
| E-07 | PAN that does not exist | PAN `ABCDE1234Z`; Run | pan `failed`; vendor Failed | C | Neg | API |
| E-08 | PAN wrong format | `12345ABCDE`, `ABCD1234` | pan `failed` | H | Neg | API |
| E-09 | Udyam number wrong / wrong format | `UDYAM-MH-00-0000000`, `MH12345` | msme `failed` | H | Neg | API |
| E-10 | Bank account wrong / IFSC wrong / closed | One vendor each | bank `failed` each, same message as onboarding | H | Neg | API |
| E-11 | Bank holder name mismatch on form path | Client rule needs name match | bank `failed` with name mismatch | M | Neg | API |
| E-12 | All documents valid | Run [V-PASS] | 4 rows `passed`; vendor Passed; no errors | C | Pos | API+UI |
| E-13 | Company-record value skips name match | Run [V-COMPANYONLY] whose GST legal name differs | gst `passed` (provider check only) | H | Edge | API |
| E-14 | Right GST provider per client | Run Gmmco and a client on the other GST provider | Each client's calls go to its own provider (dev checks logs) | M | Pos | Dev |
| E-15 | 24-hour reuse of a provider answer | Same GST checked for client B within 24 h; Run Gmmco | Answer reused (no new provider call), Gmmco rules still applied, row still counted | M | Edge | Dev |
| E-16 | Vendor fixes a bad document | After E-01, correct the GST; Run again next day | gst `passed`; vendor Passed; error gone | H | Pos | API+UI |
| E-17 | Other document types through config | Add `cin` or `fssai` with paths; Run a vendor with that value | Rows created and checked like the others | L | Pos | API |

## F. Provider limits, outages and deadline

Most of these need dev to simulate provider answers or shorten waits on UAT.

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | Rate limit never fails a vendor | Dev makes GST provider return rate-limited; Run [V-PASS] | gst stays `pending` (not failed); vendor not Failed while waiting | C | Neg | Dev |
| F-02 | Breaker uses Retry-After | Provider returns rate-limited with Retry-After 600 s | No GST calls for about 10 min; log `breaker_opened ... reason=rate_limited` | H | Neg | Dev |
| F-03 | Breaker without Retry-After | Rate-limited without header | Wait about 15 min, then one test call | H | Neg | Dev |
| F-04 | 5 failures in a row open the breaker; fewer do not | Dev returns 4 timeouts then success; then 5 timeouts | 4 + success: no breaker; 5: `breaker_opened` | H | Neg | Dev |
| F-05 | Failed test call doubles the wait | Keep provider down through 2 test calls | Waits about 15 min, then 30 min, then 60 min (max 24 h) | M | Neg | Dev |
| F-06 | Only one test call when the breaker reopens | Many vendors waiting; breaker time passes | One call first; on success the rest come back spread out (up to 2 min jitter) | M | Edge | Dev |
| F-07 | 24-hour deadline gives system_error | Provider down beyond 24 h (or dev shortens deadline) | Rows `system_error`, message `verification is temporarily unavailable`; vendor final status System Error (or Failed if another check failed) | C | Neg | Dev |
| F-08 | Cleaner closes stuck rows after 25 h | Leave pending rows older than 25 h | Rows closed as `system_error`; run summary logged | M | Neg | Dev |
| F-09 | Crashing vendor job | Dev forces the vendor job to crash 3 times | Its rows closed as `system_error`; other vendors finish | H | Neg | Dev |
| F-10 | Revalidation switched off mid-run | Start Run; PUT enabled false before it finishes | Remaining rows closed as `system_error` | M | Edge | API |
| F-11 | Other providers continue | GST provider down, PAN provider fine; Run [V-PASS] | pan rows finish `passed`; only gst waits | H | Edge | Dev |
| F-12 | Two GST providers are independent | Gmmco on provider A (down), client B on provider B | Only A's breaker opens; client B finishes | M | Edge | Dev |
| F-13 | Rate stays under 30 calls per minute | Run 20 vendors | Provider calls spread over time; no provider rate-limit answers (dev checks logs) | M | Pos | Dev |
| F-14 | Recovery after a short outage | Provider down 20 min then back | Same rows move to `passed`; no duplicate rows | H | Pos | Dev |
| F-15 | Live onboarding not hurt during a run | Run 20 vendors; meanwhile a new vendor fills onboarding v2 | Onboarding checks answer in normal time; no forced re-login | C | Neg | Manual |

## G. Final status, errors and history

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| G-01 | Any failed check makes the vendor Failed | V-PASS with bank changed to invalid; Run | Final Failed; errors list only the bank line | C | Neg | API+UI |
| G-02 | Skipped never makes the vendor Failed | V-PASS with MSME removed; Run | Final Passed; MSME not in errors | C | Neg | API+UI |
| G-03 | Skipped is not shown as an error | Run [V-NODOCS] | Errors empty; status shown as skipped / not validated | H | Neg | API+UI |
| G-04 | system_error outranks passed | One check passed, one system_error (via F-07) | Final System Error, not Passed (confirm with product; TRD expected Pass) | H | Edge | Dev |
| G-05 | Failed outranks system_error | One failed, one system_error | Final Failed | H | Edge | Dev |
| G-06 | Types not due keep their older result | Day 1: force all types (PAN fails). Day 2: scheduler run where only GST is due | Final still Failed because PAN's latest row (day 1) is failed | C | Edge | API |
| G-07 | All passed | Run [V-PASS] | Final Passed; last validated = this run's start time | C | Pos | API+UI |
| G-08 | Error line format | Run [V-BADGST] | Line reads `GST <value>: <message>` | H | Pos | API+UI |
| G-09 | One error line per bad row | Run [V-2GST] with also a failed PAN | 2 lines: the bad GST and the PAN | M | Pos | API+UI |
| G-10 | Pass to Fail between days | Day 1 V-PASS passes; day 2 make GST invalid; Run | Day 2 final Failed | H | Pos | API+UI |
| G-11 | Fail to Pass between days | After G-10 fix GST; Run next day | Final Passed; error gone | H | Pos | API+UI |
| G-12 | Older days' rows are kept | Run on 2 different days | Rows of day 1 still exist with day 1 run id; day 2 has its own run id | H | Pos | Dev |
| G-13 | No duplicate rows within one run | Run; re-trigger same vendors same day | One row per vendor per document value for that run | C | Neg | API |
| G-14 | by_status adds up | Any run | Sum of `by_status` = `total_rows`; `finished_vendors` = `vendors` when complete | M | Pos | API |
| G-15 | top_errors lists failures | Run [V-BADGST, V-CANCELLED] | `top_errors` has entries with doc_type gst, status failed, message and count | M | Pos | API |
| G-16 | Run summary in logs | Any complete run | One `run_summary` log line with passed / failed / skipped / system_error counts matching the API | L | Pos | Dev |

## H. Vendor listing, vendor page and Excel

All UI steps use a Gmmco buyer login on the UAT dashboard after a run is complete.

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| H-01 | Client with revalidation off shows nothing | Second client with config disabled; open Vendors listing, filters, a vendor page, Excel | No validation columns, filters or Revalidation Details | H | Neg | UI |
| H-02 | Vendor never checked | Vendor outside any run | Status blank, no date, no errors; no page error | M | Neg | UI |
| H-03 | Date filter From after To | Last validated filter 30 Oct to 1 Oct | Blocked or empty with a message; page does not break | L | Neg | UI |
| H-04 | Columns in every tab | Run [V-PASS, V-BADGST, V-NODOCS]; open each listing tab | Validation Status, Last Validated At, Validation Errors present and filled | H | Pos | API+UI |
| H-05 | Listing matches API | Same run | Each vendor's status and errors equal the final status and error lines from the API rows | C | Pos | API+UI |
| H-06 | Status filter | Filter Passed, then Failed, then not validated | Only matching vendors; counts match the run | H | Pos | API+UI |
| H-07 | Date range filter | Range covering the run date | Only vendors validated in range | M | Pos | UI |
| H-08 | Filters together with search | Failed + date range + vendor name search | Results match all three | M | Pos | UI |
| H-09 | Vendor page details | Open V-2GST page, Revalidation Details | One line per check: type, value, status, error, last run; skipped lines show no error | C | Pos | API+UI |
| H-10 | Excel download | Download from listing | Validation Status and Validation Errors columns; errors one per line; values match listing | H | Pos | UI |
| H-11 | Shared vendor shows each client's own result | V-OTHERCLIENT, log in as each client | Each sees only its own status and errors | C | Neg | UI |
| H-12 | Listing speed | Run with 50 vendors; open listing with Failed filter | Loads in normal time | M | Pos | UI |

## I. Security, logs and onboarding regression

| ID | Test | Steps | Expected | P | Type | Auto |
| --- | --- | --- | --- | --- | --- | --- |
| I-01 | PAN masked on screen | Run a vendor with a failed PAN; open listing errors, vendor page | PAN shown masked (e.g. `******234F`). Likely defect: code shows no masking | C | Neg | API+UI |
| I-02 | Bank number masked on screen and Excel | Run a vendor with a failed bank; listing, vendor page, Excel | Account number masked | C | Neg | UI |
| I-03 | Masked in API responses | Check network responses of listing and vendor page | No full PAN or bank number | H | Neg | UI |
| I-04 | Vendor cannot see revalidation results | Log in as the vendor on the vendor portal | No validation status or errors shown | M | Neg | UI |
| I-05 | QA APIs blocked on production | Call production base with an employee token (dev confirms) | Code 5 `Not authorized` | H | Neg | Dev |
| I-06 | No Slack or Sentry noise | Run with many failures | No revalidation alerts in Slack or Sentry | H | Neg | Dev |
| I-07 | Breaker events logged | During F-02 | `breaker_opened` and `breaker_closed` lines with provider name | L | Pos | Dev |
| I-08 | Onboarding messages unchanged | New vendor fills onboarding v2 with bad GST / PAN / bank | Same error messages as before this release | H | Pos | Manual |
| I-09 | Onboarding still alerts and retries as before | Dev makes provider fail once during onboarding | Onboarding retries and alerts as before (revalidation changes apply only to revalidation) | M | Pos | Dev |
| I-10 | Rollback | PUT enabled false after runs | No new runs; vendor onboarding states unchanged; old rows kept | H | Pos | API+UI |


# Part 3 - Manual test cases (plain language)

These are the 143 manual cases written earlier against TRD v1, in plain language for a person to run on screen. Where they differ from the UAT build, the Guide wins: the build calls "unverified" `system_error`, checks only vendors in `vendor_statuses`, and also allows a `one_time` cycle.


## 1. Revalidation Settings

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_001 | Disabled client | Verify no revalidation happens when it is OFF for the client | Revalidation is OFF for the client (default for every client). | Any client with revalidation OFF | 1. Ask dev to run the scheduler for the day<br>2. Login as the client's buyer and open Vendors listing<br>3. Open any vendor detail page | No run for this client. No validation columns or filters in listing. Vendor detail has no validation section. | Critical | Negative |
| VR_TC_002 | Disabled client | Verify Excel bulk download has no validation columns when revalidation is OFF | Revalidation OFF for the client. | - | 1. Login as buyer<br>2. Vendors listing > Bulk download (Excel)<br>3. Open the file | Validation Status and Validation Errors columns are not in the file. | Medium | Negative |
| VR_TC_003 | Rollback | Verify switching revalidation OFF stops new runs and does not touch vendor onboarding state | Revalidation is enabled for Gmmco by Procol ops. At least 1 run done. Then ops switch it OFF. | - | 1. Note onboarding state of 3 vendors (approved / in review / blacklisted)<br>2. Ops switch revalidation OFF<br>3. Ask dev to run scheduler on the next due date<br>4. Check listing and the 3 vendors | No new run. Onboarding state of all 3 vendors is unchanged. Columns stop updating / are hidden. | High | Negative |
| VR_TC_004 | Not on onboarding v2 | Verify a client not on vendor onboarding v2 is not picked up even if config is ON | Client X has revalidation config ON but does not use onboarding v2. | Client X | 1. Ask dev to run scheduler<br>2. Check app logs | No run for client X. | Medium | Negative |
| VR_TC_005 | Doc type removed | Verify a document type removed from config gets no new rows | Revalidation is enabled for Gmmco by Procol ops with GST, PAN, MSME, Bank. One run done. Ops remove MSME. | - | 1. Ask dev to run on the next GST/PAN due date<br>2. Ask dev to share the vendor's revalidation rows for this run<br>3. Login as Gmmco buyer and go to Vendors listing<br>4. Search the vendor by name<br>5. Open the vendor detail page and check the validation section | No MSME rows in the new run. MSME drops out of the vendor's latest checks at the next run (not shown in detail any more). Old MSME rows stay in history. | Medium | Negative |
| VR_TC_006 | Doc type added | Verify a newly added document type first runs on its own start date | Revalidation is enabled for Gmmco by Procol ops with GST, PAN. Ops add MSME with start date = 3 days later. | - | 1. Ask dev to run scheduler today and on the MSME start date<br>2. Ask dev to share the vendor's revalidation rows for this run | No MSME check before its start date. MSME rows appear on the start date run. | Medium | Positive |
| VR_TC_007 | Other doc types | Verify other document types (VAT, CIN, FSSAI, TAN) can be added through config | Revalidation is enabled for Gmmco by Procol ops. Ops add CIN (or FSSAI) for Gmmco with a start date. | Vendor with valid CIN | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | CIN is checked with the existing engine and shown like the other document types. | Low | Positive |
| VR_TC_008 | Enabled client | Verify revalidation runs for a client once enabled | Ops enable revalidation for Gmmco with GST, PAN, MSME, Bank, start date = today. | Gmmco (47053) | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Run happens. Validation columns appear and are filled. | Critical | Positive |

## 2. Schedule / Cycles

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_009 | Not due | Verify no run starts when no document type is due | Revalidation is enabled for Gmmco by Procol ops. GST quarterly from 1 Oct, PAN yearly from 1 Oct. Today 15 Oct. | - | 1. Ask dev to run the scheduler for 15 Oct<br>2. Check app logs<br>3. Login as Gmmco buyer and go to Vendors listing<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | No run for Gmmco. Last Validated does not change. | High | Negative |
| VR_TC_010 | Duplicate | Verify the same run is not started twice on one date | Revalidation is enabled for Gmmco by Procol ops. GST due today. | - | 1. Ask dev to trigger the scheduler for today<br>2. Trigger it again for the same date<br>3. Ask dev to share the vendor's revalidation rows for this run | Only one run. Each vendor has one GST row per GST number for today, no duplicates. | Critical | Negative |
| VR_TC_011 | Overlap | Verify no new run starts while the previous run of the client is still going | Revalidation is enabled for Gmmco by Procol ops. A run is still in progress (vendors waiting on provider) when the next document type is due. | - | 1. Ask dev to trigger the next due run while the old one is running<br>2. Check app logs | No new run that night. It is picked up by the 2-day catch-up once the old run is done. | High | Negative |
| VR_TC_012 | Catch-up | Verify a due date missed more than 2 days back is not caught up | Revalidation is enabled for Gmmco by Procol ops. GST was due 3 days ago and the scheduler did not run. | - | 1. Ask dev to run scheduler today<br>2. Check app logs | The 3-day-old due date is not caught up (only last 2 days are). | Medium | Negative |
| VR_TC_013 | One-off dates | Verify a one-off date cannot be used as a schedule | Revalidation is enabled for Gmmco by Procol ops. Ask ops to try setting a specific one-time date for MSME. | - | 1. Ask ops / dev to save such a config | Not supported. Every document type needs a repeating cycle (monthly / quarterly / six-monthly / yearly) and a start date. | Low | Negative |
| VR_TC_014 | Month end | Verify start date 31st runs on the last day of a 30-day month | Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 31 Oct 2026. | - | 1. Ask dev to run scheduler for 30 Nov and 1 Dec<br>2. Ask dev to share the vendor's revalidation rows for this run | Run on 30 Nov. Not on 1 Dec, not skipped. | High | Edge |
| VR_TC_015 | Month end | Verify start date 30th/31st runs on 28 Feb in a non-leap year | Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 30 Jan 2027. | - | 1. Ask dev to run scheduler for 28 Feb 2027 and 1 Mar 2027 | Run on 28 Feb 2027. March run is back on 30 Mar. | High | Edge |
| VR_TC_016 | Month end | Verify start date 29th runs on 29 Feb in a leap year | Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 29 Jan 2028. | - | 1. Ask dev to run scheduler for 29 Feb 2028 | Run on 29 Feb 2028. | Low | Edge |
| VR_TC_017 | Month end | Verify the month-end shift does not drift later runs | Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 31 Jan. | - | 1. Ask dev for the next run dates / run them | Runs on 28/29 Feb, 31 Mar, 30 Apr, 31 May. Goes back to 31 when the month has it. | Medium | Edge |
| VR_TC_018 | Catch-up | Verify a missed due date is caught up the next night | Revalidation is enabled for Gmmco by Procol ops. GST due yesterday, scheduler was down. | - | 1. Ask dev to run scheduler today<br>2. Ask dev to share the vendor's revalidation rows for this run | Yesterday's GST run happens today. | High | Edge |
| VR_TC_019 | Start date | Verify the start date itself is a run date | Revalidation is enabled for Gmmco by Procol ops. GST quarterly, start date = today. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Run happens on the start date itself. | Critical | Positive |
| VR_TC_020 | Cycles | Verify monthly cycle runs every 1 month(s) on the same day | Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 10 Oct 2026. | - | 1. Ask dev to check / run the next 2 due dates | Runs on 10 Oct 2026, then every 1 month(s) on the 10th. Nothing in between. | Medium | Positive |
| VR_TC_021 | Cycles | Verify quarterly cycle runs every 3 month(s) on the same day | Revalidation is enabled for Gmmco by Procol ops. GST quarterly, start 10 Oct 2026. | - | 1. Ask dev to check / run the next 2 due dates | Runs on 10 Oct 2026, then every 3 month(s) on the 10th. Nothing in between. | High | Positive |
| VR_TC_022 | Cycles | Verify six-monthly cycle runs every 6 month(s) on the same day | Revalidation is enabled for Gmmco by Procol ops. GST six-monthly, start 10 Oct 2026. | - | 1. Ask dev to check / run the next 2 due dates | Runs on 10 Oct 2026, then every 6 month(s) on the 10th. Nothing in between. | Medium | Positive |
| VR_TC_023 | Cycles | Verify yearly cycle runs every 12 month(s) on the same day | Revalidation is enabled for Gmmco by Procol ops. GST yearly, start 10 Oct 2026. | - | 1. Ask dev to check / run the next 2 due dates | Runs on 10 Oct 2026, then every 12 month(s) on the 10th. Nothing in between. | Medium | Positive |
| VR_TC_024 | Own cycle | Verify each document type follows its own cycle | Revalidation is enabled for Gmmco by Procol ops. GST quarterly, PAN yearly, both from 1 Oct. | - | 1. Ask dev to run on 1 Jan 2027<br>2. Ask dev to share the vendor's revalidation rows for this run<br>3. Open the vendor detail page and check the validation section | On 1 Jan only GST rows are created. PAN shows its older latest row (from 1 Oct). | Critical | Positive |
| VR_TC_025 | Same day | Verify document types due on the same date run together in one run | Revalidation is enabled for Gmmco by Procol ops. GST and PAN both due today. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check app logs<br>3. Ask dev to share the vendor's revalidation rows for this run | One run for Gmmco today covering GST and PAN. | High | Positive |
| VR_TC_026 | Run time | Verify the run starts at 11 pm IST | Revalidation is enabled for Gmmco by Procol ops. GST due today. | - | 1. Do not trigger manually, wait for the scheduled run<br>2. Check start time in app logs | Starts at 11 pm IST (not 11 pm UTC). | Medium | Positive |

## 3. Vendor Coverage

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_027 | Unlinked | Verify a vendor unlinked from the client is left out of later runs | Revalidation is enabled for Gmmco by Procol ops. Vendor X validated in the last run, then unlinked from Gmmco. | Vendor X | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run | No new rows for vendor X. Its old rows stay. | High | Negative |
| VR_TC_028 | State change mid run | Verify a vendor state change during the run has no effect | Revalidation is enabled for Gmmco by Procol ops. Run in progress. | Approve a vendor that is in review during the run | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Approve the vendor while the run is going<br>3. Check the vendor after the run | Vendor still validated. Revalidation does not change its onboarding state. | Medium | Edge |
| VR_TC_029 | Any state | Verify a vendor in Approved state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in Approved state with GST and PAN. | Approved vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | High | Positive |
| VR_TC_030 | Any state | Verify a vendor in In progress state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in In progress state with GST and PAN. | In progress vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | Medium | Positive |
| VR_TC_031 | Any state | Verify a vendor in In review state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in In review state with GST and PAN. | In review vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | Medium | Positive |
| VR_TC_032 | Any state | Verify a vendor in In approval state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in In approval state with GST and PAN. | In approval vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | Medium | Positive |
| VR_TC_033 | Any state | Verify a vendor in Rejected state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in Rejected state with GST and PAN. | Rejected vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | High | Positive |
| VR_TC_034 | Any state | Verify a vendor in Invited state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in Invited state with GST and PAN. | Invited vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | Medium | Positive |
| VR_TC_035 | Any state | Verify a vendor in Blacklisted state is revalidated | Revalidation is enabled for Gmmco by Procol ops. A vendor in Blacklisted state with GST and PAN. | Blacklisted vendor | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Open the tab where the vendor is listed<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is validated and the columns are filled. | High | Positive |
| VR_TC_036 | Bulk upload | Verify vendors added through bulk upload are revalidated | Revalidation is enabled for Gmmco by Procol ops. Vendors created by vendor bulk upload (values in company record / extra data). | Bulk uploaded vendors | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Validated like any other vendor from whatever values they have. | Critical | Positive |
| VR_TC_037 | Many clients | Verify a vendor linked to 2 clients gets separate rows and separate final status per client | Revalidation ON for Gmmco and client B. Vendor V linked to both, with different values / rules. | Vendor V | 1. Ask dev to run for both clients<br>2. Check vendor V in both clients' listing<br>3. Ask dev for rows | Separate rows per client. Each client sees its own status (can be Pass in one and Fail in other). | High | Positive |

## 4. Reading Document Values

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_038 | All paths empty | Verify document is Skipped when every configured place is empty | Revalidation is enabled for Gmmco by Procol ops. MSME paths: onboarding form field, then company extra data. Both empty. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>5. Open the vendor detail page and check the validation section | MSME row = skipped with error "not provided". Shown under Missing Documents, not in Errors. Vendor is not Fail because of it. | Critical | Negative |
| VR_TC_039 | File instead of number | Verify an uploaded file in the first place is treated as empty and the next place is tried | Revalidation is enabled for Gmmco by Procol ops. Form MSME field has only the certificate PDF. Company extra data has the MSME number. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | MSME number from company extra data is checked. | High | Negative |
| VR_TC_040 | Wrong path | Verify a path pointing to a field / column that does not exist is skipped and the next one is tried | Revalidation is enabled for Gmmco by Procol ops. Ask ops to set first PAN path to a non-existing field, second to company PAN. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | No crash. PAN from the company record is checked. | High | Negative |
| VR_TC_041 | Wrong path | Verify document is Skipped when all configured paths are wrong | Revalidation is enabled for Gmmco by Procol ops. All PAN paths point to non-existing fields. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | PAN = skipped / missing for all vendors. Other document types still run. | Medium | Negative |
| VR_TC_042 | Bank on company record | Verify bank on company record needs both account number and IFSC | Revalidation is enabled for Gmmco by Procol ops. Form bank empty. Company extra data has account number but no IFSC. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | That bank entry counts as empty. Bank = skipped / missing (not failed). | High | Negative |
| VR_TC_043 | Form untouched | Verify the vendor's submitted onboarding form is never changed | Revalidation is enabled for Gmmco by Procol ops. Vendor with failed GST. | - | 1. Note the vendor's onboarding form values<br>2. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>3. Open the form again | Form values and onboarding state are exactly the same. | Critical | Negative |
| VR_TC_044 | Order | Verify the first place with a value wins even when a later place has a different value | Revalidation is enabled for Gmmco by Procol ops. GST on onboarding form = A, GST on company record = B. | A valid, B invalid | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | Only GST A is checked (form comes first). Vendor not failed for B. | High | Edge |
| VR_TC_045 | Order | Verify company record value is used when the form value is empty | Revalidation is enabled for Gmmco by Procol ops. Form GST empty, company GST filled. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | Company GST is checked (provider check only, no name match). | High | Edge |
| VR_TC_046 | Latest value | Verify the value is read when the vendor's check runs | Revalidation is enabled for Gmmco by Procol ops. Long run. | Update vendor GST before its job runs | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Update the vendor's GST while the run is going (before its turn)<br>3. Open the vendor detail page and check the validation section | The new GST is checked. | Medium | Edge |
| VR_TC_047 | Rules | Verify value from onboarding form is checked with the client's onboarding rules (e.g. name match) | Revalidation is enabled for Gmmco by Procol ops. Form GST is valid but registered to a different name. Client has name match rule. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section<br>5. Compare with what onboarding v2 shows for the same GST | Same result as onboarding (fails on name match if onboarding fails it). | High | Positive |
| VR_TC_048 | Rules | Verify value from company record runs provider check only | Revalidation is enabled for Gmmco by Procol ops. Form GST empty. Company GST valid but name differs from vendor name. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | GST = passed. No name mismatch error. | High | Positive |

## 5. GST Validation

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_049 | Invalid GST | Verify a GST that does not exist is marked failed | Revalidation is enabled for Gmmco by Procol ops. | 27ABCDE1234F1Z5 | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>5. Open the vendor detail page and check the validation section | Vendor = Fail. Error like "GST 27ABCDE1234F1Z5: <reason same as onboarding>". | Critical | Negative |
| VR_TC_050 | Wrong format | Verify GST with wrong length / format is marked failed | Revalidation is enabled for Gmmco by Procol ops. | 14 characters / special characters | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Fail with the onboarding GST error. | High | Negative |
| VR_TC_051 | Cancelled GST | Verify a GST cancelled after onboarding is caught | Revalidation is enabled for Gmmco by Procol ops. Vendor passed at onboarding; GST now cancelled on GST portal. | Cancelled GSTIN | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>5. Cross check on GST portal | Vendor = Fail. Error like "GST <no>: GST is cancelled". | Critical | Negative |
| VR_TC_052 | Suspended GST | Verify a suspended GST gives the same result as onboarding | Revalidation is enabled for Gmmco by Procol ops. | Suspended GSTIN | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Same result as onboarding v2 for this GST. | High | Negative |
| VR_TC_053 | Foreign vendor | Verify foreign vendor with non-Indian tax number in GST field | Revalidation is enabled for Gmmco by Procol ops. | e.g. GB123456789 | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Fails GST format check as per TRD (open question with product - note result). | Medium | Negative |
| VR_TC_054 | Multiple GST | Verify vendor with 2 GSTs where 1 is invalid | Revalidation is enabled for Gmmco by Procol ops. Vendor form has 2 GSTs, 1 wrong. | 1 valid + 1 invalid | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run<br>3. Login as Gmmco buyer and go to Vendors listing<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>6. Open the vendor detail page and check the validation section | 2 GST rows (one per value). Vendor = Fail. Error names only the wrong GST. | Critical | Negative |
| VR_TC_055 | 24h reuse | Verify same GST checked for another client in last 24h is reused but client rules still applied | Client B checked the same GST few hours ago (same provider). | Common GSTIN | 1. Ask dev to run Gmmco<br>2. Check logs | Provider not called again. Gmmco's own rules applied. Row counted / billed for Gmmco too. | Medium | Edge |
| VR_TC_056 | Same GST many vendors | Verify same GST present on many Gmmco vendors | Revalidation is enabled for Gmmco by Procol ops. Same GST on 5 different Gmmco vendors (UAT has 20 GSTs on 81 vendors). | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run<br>3. Login as Gmmco buyer and go to Vendors listing | Each vendor gets its own row and status. Note billing count (open question with product). | Medium | Edge |
| VR_TC_057 | Provider per client | Verify the client's own GST provider is used (Masters India or Attestr) | Gmmco on one GST provider, client B on the other. | - | 1. Ask dev to run both<br>2. Check app logs for provider called | Each client's GST goes to its own provider. | High | Positive |
| VR_TC_058 | Valid GST | Verify active valid GST is passed | Revalidation is enabled for Gmmco by Procol ops. | Active GSTIN | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>5. Open the vendor detail page and check the validation section | GST row = passed. Vendor Pass (if nothing else failed). | Critical | Positive |
| VR_TC_059 | Fixed GST | Verify vendor who corrects GST is passed in the next GST run | Revalidation is enabled for Gmmco by Procol ops. Vendor failed on GST last run, then corrected GST. | - | 1. Next GST due run<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | GST passed. Error removed. Vendor Pass. | High | Positive |

## 6. PAN Validation

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_060 | Invalid PAN | Verify a PAN that does not exist is marked failed | Revalidation is enabled for Gmmco by Procol ops. | ABCDE1234Z | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor = Fail. PAN masked in error, e.g. "PAN ******234Z: ...". | Critical | Negative |
| VR_TC_061 | Wrong format | Verify PAN with wrong format is failed | Revalidation is enabled for Gmmco by Procol ops. | 12345ABCDE / ABCD1234 | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Fail with the onboarding PAN error. | High | Negative |
| VR_TC_062 | Inoperative PAN | Verify inoperative PAN gives the same result as onboarding | Revalidation is enabled for Gmmco by Procol ops. | Inoperative PAN | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Same result as onboarding v2. | High | Negative |
| VR_TC_063 | PAN from extra data | Verify PAN from company extra data (bulk upload) is checked when form and company PAN are empty | Revalidation is enabled for Gmmco by Procol ops. PAN paths: form, company, company extra data. Only extra data has PAN. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | PAN from extra data is checked. | Medium | Edge |
| VR_TC_064 | Valid PAN | Verify valid PAN is passed | Revalidation is enabled for Gmmco by Procol ops. | Valid PAN | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | PAN passed. | Critical | Positive |

## 7. MSME Validation

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_065 | Invalid Udyam | Verify wrong Udyam number is failed | Revalidation is enabled for Gmmco by Procol ops. | UDYAM-MH-00-0000000 | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor = Fail with MSME error. | Critical | Negative |
| VR_TC_066 | Wrong format | Verify Udyam number in wrong format is failed | Revalidation is enabled for Gmmco by Procol ops. | UDYAM-MH-1234 / MH12345 | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Fail with onboarding MSME error. | High | Negative |
| VR_TC_067 | Lapsed MSME | Verify MSME cancelled after onboarding is caught | Revalidation is enabled for Gmmco by Procol ops. | Cancelled Udyam | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor = Fail. | High | Negative |
| VR_TC_068 | Missing | Verify vendor without MSME is not failed for MSME | Revalidation is enabled for Gmmco by Procol ops. No MSME anywhere. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | MSME shown in Missing Documents. Not in Errors. Status depends on other checks. | Critical | Edge |
| VR_TC_069 | Valid MSME | Verify valid Udyam is passed | Revalidation is enabled for Gmmco by Procol ops. | Valid Udyam | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | MSME passed. | High | Positive |

## 8. Bank Validation

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_070 | Invalid account | Verify wrong account number is failed | Revalidation is enabled for Gmmco by Procol ops. | Wrong account + valid IFSC | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor = Fail. Account number masked in error. | Critical | Negative |
| VR_TC_071 | Invalid IFSC | Verify wrong IFSC is failed | Revalidation is enabled for Gmmco by Procol ops. | Valid account + wrong IFSC | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Fail. | High | Negative |
| VR_TC_072 | Closed account | Verify account closed after onboarding is caught | Revalidation is enabled for Gmmco by Procol ops. | Closed account | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Fail. | High | Negative |
| VR_TC_073 | Name mismatch | Verify account holder name mismatch fails when client rule needs it | Revalidation is enabled for Gmmco by Procol ops. Form bank, name match rule on. | Different holder name | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | Bank failed with name mismatch, same as onboarding. | High | Negative |
| VR_TC_074 | Multiple accounts | Verify 2 bank accounts where 1 is wrong | Revalidation is enabled for Gmmco by Procol ops. | 1 valid + 1 invalid | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run<br>3. Login as Gmmco buyer and go to Vendors listing<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | 2 bank rows. Vendor = Fail. Error names the wrong one (masked). | High | Negative |
| VR_TC_075 | Valid account | Verify valid account + IFSC is passed | Revalidation is enabled for Gmmco by Procol ops. | Valid | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Bank passed. | High | Positive |

## 9. Provider Limits & Outages

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_076 | 429 | Verify provider rate limit (429) never makes a vendor Fail | Revalidation is enabled for Gmmco by Procol ops. Ask dev to make GST provider return 429. | Vendor with valid GST | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Vendor is not Fail. GST check waits and is re-scheduled. | Critical | Negative |
| VR_TC_077 | 429 + Retry-After | Verify breaker stays open for the provider's Retry-After time (max 1 hour) | Revalidation is enabled for Gmmco by Procol ops. Provider returns 429 with Retry-After 10 min (and another test with 2 hours). | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check app logs for breaker open / close times | No calls for 10 min. With 2 hours it is capped at 1 hour. | High | Negative |
| VR_TC_078 | No Retry-After | Verify backoff of about 1, 2, 4, 8 minutes up to 1 hour when there is no Retry-After | Revalidation is enabled for Gmmco by Procol ops. Provider keeps failing without Retry-After. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check breaker logs | Wait grows about 1, 2, 4, 8 min ... max 1 hour (small random jitter allowed). | High | Negative |
| VR_TC_079 | 5 failures | Verify 5 timeouts / 5xx in a row open the breaker, and fewer do not | Revalidation is enabled for Gmmco by Procol ops. Ask dev to simulate 4 failures then a success, then 5 failures in a row. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check breaker logs | 4 failures + success: breaker stays closed (count reset). 5 in a row: breaker opens. | High | Negative |
| VR_TC_080 | Login failure | Verify provider login failure is not shown as an invalid document | Revalidation is enabled for Gmmco by Procol ops. Ask dev to break provider login on test env. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Counted towards the breaker. If it never recovers, error shows "verification is temporarily unavailable". Vendor not Fail. | High | Negative |
| VR_TC_081 | 24h deadline | Verify a check not done within 24 hours of run start is saved as unverified | Revalidation is enabled for Gmmco by Procol ops. Provider down for more than 24 hours. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Wait 24 h (or ask dev to shorten on test)<br>3. Ask dev to share the vendor's revalidation rows for this run<br>4. Login as Gmmco buyer and go to Vendors listing<br>5. Search the vendor by name<br>6. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Row = unverified. Error "<doc>: verification is temporarily unavailable". Not Fail. Not billed. | Critical | Negative |
| VR_TC_082 | Unverified only | Verify vendor with only unverified / skipped checks shows Not validated | Revalidation is enabled for Gmmco by Procol ops. Vendor has only GST, and GST ended unverified. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status = Not validated (blank / —), even if GST had passed in an earlier run. | High | Negative |
| VR_TC_083 | Other docs continue | Verify only the waiting document type is re-scheduled, the vendor's other documents carry on | Revalidation is enabled for Gmmco by Procol ops. GST provider down, PAN provider fine. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run | PAN rows finish normally. Only GST waits. | High | Edge |
| VR_TC_084 | Two GST providers | Verify one GST provider down does not stop clients on the other GST provider | Gmmco on provider A (down), client B on provider B (up). Both due. | - | 1. Ask dev to run both<br>2. Check logs | Only provider A's breaker opens. Client B's GST checks finish. | High | Edge |
| VR_TC_085 | Half-open | Verify only one test call is made when the breaker reopens, then others come back spread out | Revalidation is enabled for Gmmco by Procol ops. Many vendors waiting on GST provider. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev for logs when breaker reopens | One test call first. If it passes, waiting vendors come back spread out (not all at once). If it fails, breaker opens again with a longer wait. | Medium | Edge |
| VR_TC_086 | Rate budget | Verify revalidation uses only its share of the provider limit so live onboarding still works | Revalidation is enabled for Gmmco by Procol ops. Big run going. | - | 1. During the run, do live onboarding validations<br>2. Ask dev for calls per minute | Revalidation stays within its share (e.g. 50%). Onboarding validations are not blocked. | Critical | Edge |
| VR_TC_087 | Recovery | Verify vendor completes normally when provider comes back | Revalidation is enabled for Gmmco by Procol ops. Provider down for 20 min then back. | Valid GST | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Restore provider<br>3. Ask dev to share the vendor's revalidation rows for this run | GST row = passed, same row (no duplicate row for the retry). | High | Positive |

## 10. Final Status & Errors

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_088 | Rollup | Verify vendor is Fail if any latest check failed | Revalidation is enabled for Gmmco by Procol ops. GST passed, PAN passed, bank failed. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status = Fail. Errors only has bank error. | Critical | Negative |
| VR_TC_089 | Rollup | Verify unverified alone never makes vendor Fail | Revalidation is enabled for Gmmco by Procol ops. GST passed, PAN unverified. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status = Pass. PAN unavailable message is in Errors. | Critical | Negative |
| VR_TC_090 | Rollup | Verify skipped (missing) never makes vendor Fail and is not in Errors | Revalidation is enabled for Gmmco by Procol ops. GST passed, MSME missing. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status = Pass. MSME only in Missing Documents. | Critical | Negative |
| VR_TC_091 | Rollup | Verify vendor with none of the configured documents is Not validated | Revalidation is enabled for Gmmco by Procol ops. No GST, PAN, MSME, bank. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status = Not validated. Missing Documents lists all 4. Errors empty. | High | Edge |
| VR_TC_092 | Not due docs | Verify final status uses the latest row of document types not due in this run | Revalidation is enabled for Gmmco by Procol ops. PAN failed in Oct (yearly). GST passes in Jan run. | - | 1. Jan GST run<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>5. Open the vendor detail page and check the validation section | Status still Fail because PAN's latest row is failed. PAN shows Oct date. | Critical | Edge |
| VR_TC_093 | Errors | Verify one error message per failed / unverified check | Revalidation is enabled for Gmmco by Procol ops. GST failed, PAN unverified. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | 2 messages, e.g. "GST 27ABCDE1234F1Z5: GST is cancelled" and "PAN ******234F: verification is temporarily unavailable". | High | Positive |
| VR_TC_094 | Rollup | Verify vendor is Pass when all present checks pass | Revalidation is enabled for Gmmco by Procol ops. All 4 valid. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status = Pass. Errors and Missing Documents empty. | Critical | Positive |
| VR_TC_095 | Last validated | Verify Last Validated = most recent run time among the vendor's latest checks | Revalidation is enabled for Gmmco by Procol ops. GST checked today, PAN last checked 2 months back. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>5. Open the vendor detail page and check the validation section | Listing shows today's time. Detail: GST today, PAN older date. | High | Positive |
| VR_TC_096 | Pass to Fail | Verify status moves Pass -> Fail when a document turns invalid | Revalidation is enabled for Gmmco by Procol ops. Pass in run 1. GST cancelled before run 2. | - | 1. Run 1<br>2. GST cancelled<br>3. Run 2<br>4. Login as Gmmco buyer and go to Vendors listing<br>5. Search the vendor by name<br>6. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status Fail in run 2. No notification sent (future scope). | High | Positive |
| VR_TC_097 | Fail to Pass | Verify status moves Fail -> Pass when the vendor fixes the document | Revalidation is enabled for Gmmco by Procol ops. Fail in run 1 on GST. | - | 1. Vendor corrects GST<br>2. Next GST run<br>3. Login as Gmmco buyer and go to Vendors listing<br>4. Search the vendor by name<br>5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status Pass, error removed. | High | Positive |

## 11. Validation History

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_098 | No overwrite | Verify old rows are never overwritten by a new run | Revalidation is enabled for Gmmco by Procol ops. Vendor has rows from 2 runs. | - | 1. Ask dev for run 1 rows<br>2. Run 3<br>3. Ask dev for run 1 rows again | Run 1 rows are unchanged. | High | Negative |
| VR_TC_099 | No duplicates | Verify a retry / re-schedule fills the same row, no extra row | Revalidation is enabled for Gmmco by Procol ops. Vendor's GST waits on breaker twice then passes. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run | Only one GST row for this run. | High | Negative |
| VR_TC_100 | Row per check | Verify one row per document value per run | Revalidation is enabled for Gmmco by Procol ops. Vendor with 2 GSTs and 1 PAN, both due. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to share the vendor's revalidation rows for this run | 3 rows for this run. | High | Positive |
| VR_TC_101 | Pending | Verify rows are created as pending when scheduled and filled when the check finishes | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev for rows right after start and after finish | Status empty (pending) at start; passed / failed / skipped / unverified at the end. | Medium | Positive |
| VR_TC_102 | Latest ids | Verify the vendor's latest checks = new rows for due types + previous rows for types not due | Revalidation is enabled for Gmmco by Procol ops. GST due, PAN not due. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev for latest ids on the client-vendor link | Latest = new GST row(s) + previous PAN row. | High | Positive |

## 12. Usage Count (Billing)

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_103 | Not billed | Verify skipped rows are not counted for billing | Revalidation is enabled for Gmmco by Procol ops. Vendors with missing MSME. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to run the usage query for the month | Skipped MSME rows are not counted. | Critical | Negative |
| VR_TC_104 | Not billed | Verify unverified rows are not counted for billing | Revalidation is enabled for Gmmco by Procol ops. Some checks unverified. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to run the usage query | Unverified rows not counted. | Critical | Negative |
| VR_TC_105 | Reuse billed | Verify a reused (24h cache) answer is still counted for each client | Same GST checked for client B earlier today. | - | 1. Run Gmmco<br>2. Usage query for both clients | Counted once for client B and once for Gmmco. | High | Edge |
| VR_TC_106 | Billed | Verify passed and failed rows are counted | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Ask dev to run usage query per doc type per vendor<br>3. Compare with listing | Count = passed + failed rows per doc type. | Critical | Positive |
| VR_TC_107 | Client total | Verify client total per document type for a month | Revalidation is enabled for Gmmco by Procol ops. 2 runs in the month. | - | 1. Ask dev for client total per doc type | Total matches sum of passed + failed rows of both runs. | Medium | Positive |

## 13. Vendor Listing & Filters

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_108 | Other client | Verify a client without revalidation does not see the columns or filters | Client B OFF. | - | 1. Login as client B<br>2. Vendors listing, open filters | No validation columns or filters. | High | Negative |
| VR_TC_109 | Not checked yet | Verify a vendor not checked yet shows blank / Not validated | Revalidation is enabled for Gmmco by Procol ops. Vendor added after last run. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Search the vendor by name<br>3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor | Status blank, other columns empty. No page error. | Medium | Negative |
| VR_TC_110 | Filters | Verify date range filter with From after To | Revalidation is enabled for Gmmco by Procol ops. | From 30 Oct, To 1 Oct | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply Last Validated filter | Blocked or no results with a message. Page does not break. | Low | Negative |
| VR_TC_111 | Tabs | Verify columns show in every vendor listing tab | Revalidation is enabled for Gmmco by Procol ops. Run done. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Open each tab | Final status, Last Validated, Errors, Missing Documents in all tabs. | High | Positive |
| VR_TC_112 | Filters | Verify Validation Status filter = Pass | Revalidation is enabled for Gmmco by Procol ops. Run done. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply filter = Pass | Only Pass vendors. Count matches. | High | Positive |
| VR_TC_113 | Filters | Verify Validation Status filter = Fail | Revalidation is enabled for Gmmco by Procol ops. Run done. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply filter = Fail | Only Fail vendors. Count matches. | High | Positive |
| VR_TC_114 | Filters | Verify Validation Status filter = Not validated | Revalidation is enabled for Gmmco by Procol ops. Run done. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply filter = Not validated | Only vendors with blank status (all skipped / unverified / not checked). Count matches. | High | Positive |
| VR_TC_115 | Filters | Verify Last Validated date range filter | Revalidation is enabled for Gmmco by Procol ops. | Range covering one run | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply range | Only vendors validated in the range. | Medium | Positive |
| VR_TC_116 | Filters | Verify status + date filter together and with existing filters / search | Revalidation is enabled for Gmmco by Procol ops. | Fail + last 7 days + search | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply all | Results match all filters. Clear brings back full list. | Medium | Positive |
| VR_TC_117 | Display | Verify long error lists display properly | Revalidation is enabled for Gmmco by Procol ops. Vendor with 2 GST + bank failing. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Search the vendor by name<br>3. Check Errors column | All messages readable, row does not break. | Low | Positive |
| VR_TC_118 | Performance | Verify listing loads normally with all Gmmco vendors | Revalidation is enabled for Gmmco by Procol ops. ~800 vendors validated. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Apply Fail filter<br>3. Change pages | Loads in normal time. | Medium | Positive |

## 14. Vendor Detail

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_119 | Disabled | Verify no validation section when client has revalidation OFF | Client B OFF. | - | 1. Login as client B<br>2. Open vendor detail | No validation section. | Medium | Negative |
| VR_TC_120 | Not checked | Verify empty validation section for a vendor not checked yet | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Search the vendor by name<br>3. Open the vendor detail page and check the validation section | Empty, no error. | Medium | Negative |
| VR_TC_121 | Each check | Verify detail shows each latest check with type, value, status, errors and last run | Revalidation is enabled for Gmmco by Procol ops. GST passed, PAN failed, MSME skipped, bank unverified. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Search the vendor by name<br>4. Open the vendor detail page and check the validation section | Each check shown correctly. PAN and bank masked. | Critical | Positive |
| VR_TC_122 | Consistency | Verify listing and detail match | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Search the vendor by name<br>3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor<br>4. Open the vendor detail page and check the validation section | Same status and errors. | High | Positive |

## 15. Excel Bulk Download

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_123 | Masking | Verify full PAN / bank number is not in Validation Errors | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Bulk download (Excel) | Masked. | Critical | Negative |
| VR_TC_124 | CSV export | Verify CSV export does not have the revalidation columns (future scope) | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Export CSV (if available) | No revalidation columns in CSV in v1. | Low | Negative |
| VR_TC_125 | Columns | Verify Excel has Validation Status and Validation Errors | Revalidation is enabled for Gmmco by Procol ops. Run done. | - | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Bulk download (Excel)<br>3. Open file | Two extra columns. Errors one message per line. | High | Positive |
| VR_TC_126 | Values | Verify Excel values match the listing | Revalidation is enabled for Gmmco by Procol ops. | 5 vendors | 1. Login as Gmmco buyer and go to Vendors listing<br>2. Download<br>3. Compare | Values match. | Medium | Positive |

## 16. Access & Masking

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_127 | Other client | Verify one client cannot see another client's results for a shared vendor | Vendor V on Gmmco and client B, both ON. | - | 1. Login as client B<br>2. Open vendor V | Only client B's own result. | Critical | Negative |
| VR_TC_128 | Vendor portal | Verify vendor cannot see revalidation status / errors | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Login as vendor on vendor portal<br>2. Check profile / onboarding pages | Nothing shown to vendor. | Medium | Negative |
| VR_TC_129 | Masking | Verify PAN and bank numbers are masked in stored rows and in the listing response | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Ask dev to share the vendor's revalidation rows for this run<br>2. Login as Gmmco buyer and go to Vendors listing<br>3. Check browser network response | Masked in rows and in responses. | High | Negative |
| VR_TC_130 | Out of scope | Verify no client settings screen / Revalidate now button / notifications in v1 | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Login as buyer admin<br>2. Look for revalidation settings or a Revalidate now button<br>3. Check emails after a Pass -> Fail | None of these exist in v1 (future scope). | Low | Negative |

## 17. Batch Run & Recovery

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_131 | Job crash | Verify a crashed vendor job is retried and saved checks are not run again | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Dev kills a vendor job mid way<br>3. Check logs and rows | Job retried. Already saved checks not called again. No duplicate rows. | High | Negative |
| VR_TC_132 | Slow vendor | Verify one slow vendor does not hold up others | Revalidation is enabled for Gmmco by Procol ops. One vendor's provider very slow. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check Sidekiq | Other vendor jobs keep finishing. | Medium | Edge |
| VR_TC_133 | Concurrency | Verify jobs pushed 100 at a time with at most 2 running | Revalidation is enabled for Gmmco by Procol ops. 500+ vendors. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check Sidekiq dashboard | Max 2 running on vendor_revalidation. Waiting vendors moved to vendor_revalidation_retry. | Medium | Edge |
| VR_TC_134 | Full run | Verify full Gmmco run completes for all linked vendors | Revalidation is enabled for Gmmco by Procol ops. All Gmmco vendors. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Wait till done<br>3. Ask dev for counts | Every linked vendor has rows for the run. | Critical | Positive |

## 18. Logs & Alerts

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_135 | No Slack | Verify no Slack alerts for revalidation failures | Revalidation is enabled for Gmmco by Procol ops. Many failures. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Check Slack | Nothing from revalidation. | High | Negative |
| VR_TC_136 | No Sentry | Verify no Sentry events for revalidation | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Dev checks Sentry | None. | Medium | Negative |
| VR_TC_137 | Summary | Verify one summary line per run with correct counts | Revalidation is enabled for Gmmco by Procol ops. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Dev shares log line<br>3. Compare with listing filters | Passed / failed / not validated counts match the listing. | Medium | Positive |
| VR_TC_138 | Breaker logs | Verify breaker open and close are written in app logs | Revalidation is enabled for Gmmco by Procol ops. Provider failing. | - | 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run)<br>2. Dev shares logs | Open and close events logged per provider. | Low | Positive |

## 19. Onboarding Regression

| TC ID | Scenario | Test Case | Pre-condition | Test Data | Test Steps | Expected Result | Priority | Type |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VR_TC_139 | Live onboarding | Verify live onboarding is not slowed or blocked during a run | Revalidation is enabled for Gmmco by Procol ops. Run going. | - | 1. Start run<br>2. New vendor fills onboarding v2 with GST, PAN, bank | Validations respond normally. | Critical | Negative |
| VR_TC_140 | Login token | Verify revalidation errors do not log out the provider for live onboarding | Revalidation is enabled for Gmmco by Procol ops. Invalid documents during run. | - | 1. During run, do a live onboarding validation | Works without re-login / extra failures. | High | Negative |
| VR_TC_141 | Messages | Verify onboarding error messages are unchanged | Any client. | Invalid GST / PAN / bank | 1. Fill onboarding v2 with wrong values | Same messages as before release. | High | Positive |
| VR_TC_142 | Alerts | Verify onboarding still sends its Slack alert on provider failure | Any client. | - | 1. Dev makes provider fail during onboarding<br>2. Check Slack | Alert still comes. | Medium | Positive |
| VR_TC_143 | Retries | Verify onboarding still retries the same way as before | Any client. | - | 1. Dev makes provider fail once during onboarding | Same retry behaviour as before. | Medium | Positive |
