# Vendor revalidation — test cases

The scheduling engine re-checks every vendor's GST, PAN, MSME and bank on the cycle the client's config sets (nightly at
11 pm IST, or on a QA trigger), writes one row per document value and one final status per client–vendor link, and shows
it on the vendor listing, the vendor page and the Excel download.

These are the guide's 138 automation cases (`test-cases/Vendor_Revalidation_QA_Automation_Guide.md`, Part 2) read
against the code — **procol-backend rfx-uat-main @ 76b986a012 (15 Oct 2026)** — plus 21 cases the code revealed. Each case keeps the guide's
id; **Expected** is what the build does (what the runner asserts); where the guide says otherwise it is quoted, and a
finding (REV-nn, `test-cases/vendor-revalidation-findings.md`) is named where the code contradicts the guide or the TRD.
Every case mirrors a runnable case in `prototype/data/api-cases-extra/revalidation.json`; both are generated from
`procol test/scripts/revalidation/spec.ts`. The 143 manual cases are in `product-vendor-revalidation.md`.

**Run it.** Tick *Vendor revalidation* in Run tests, or `cd prototype && npm run reval:run -- --company 47053`.

| How a case runs | Cases | Needs |
| --- | --- | --- |
| read — a GET to the QA API | 7 | nothing |
| audit — SELECTs on recorded runs | 14 | nothing |
| listing — the buyer's listing / vendor page / Excel vs the database | 13 | nothing (the client's session) |
| config — PUTs and refused triggers, config restored | 31 | `VR_QA_TOKEN` |
| run — a real run on 1–5 named vendors, config restored | 45 | `VR_QA_TOKEN` |
| dev / manual / ui / code — reported as not run, with why | 49 | a person or dev |

**Host and token.** The QA API exists only on `https://rfx-uat-api.ag-ri.in` (override with `VR_API_BASE`); the
platform's usual host answers 404. The database is the same, so the client's session works there for reads.
`VR_QA_TOKEN` in `prototype/.env` is a Procol employee's `access-token` copied from that host (never logged).
Writes are allowed only for clients in `VR_WRITE_CLIENTS` (default 47053).

**Safety, in the order it matters.** `vendor_ids: []` is never sent (the API reads it as every vendor — REV-02); no
trigger without a scope or with more than 5 vendors; the config is backed up to `prototype/data/reval-backup/` before
the first write and restored after (a backup left by a crash is restored first); mechanics cases use a *silent* config
whose only document reads a column that does not exist, so every row is skipped and no provider is called; vendors whose
shown status a case changed are re-run under the original config. The client super-admin session is used for GETs only.

**Test vendors.** The guide's prepared vendors (V-PASS, V-BADGST …) are found from the client's last run and company
records (V-PASS = every check passed, V-NODOCS = nothing provided, …); an id in
`prototype/config/revalidationVendors.json` wins: `{"47053": {"V-CANCELLED": 12345}}`. Vendors already shown as
Skipped are preferred, so a run changes nothing a buyer sees.

## 1. API access and input validation

Who may call the QA API and every refusal it gives. Config cases PUT a bad config and check it was refused AND left the saved config alone.

#### API-XREV-A-01 — Non-Procol-employee token is refused
- **Why it matters.** Guide A-01 (API). Finding REV-01 (Critical): The QA revalidation API is open to every client super admin, for every client, and is no longer blocked on production.
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /config?client_company_id=<client> with the client's own super-admin session (not a Procol employee)
- **Expected.** Code 5 'Not authorized'; nothing returned. _Guide:_ Code 5 Not authorized for any client user.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P0 · automate · `API-XREV-A` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:103-106 (check_qa_access = is_procol_employee? || is_super_admin, since eaf002de08)` · `REV-01`

#### API-XREV-A-02 — Missing / wrong token is refused
- **Why it matters.** Guide A-02 (API).
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /config with no access-token header 2. GET /config with a random access-token
- **Expected.** Refused each time (auth error or code 5); no config in the body.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:9 (before_action check_qa_access)`

#### API-XREV-A-03 — Unknown client
- **Why it matters.** Guide A-03 (API).
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /config?client_company_id=999999999
- **Expected.** 422, code 2 'client_company_id not found'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:108-111`

#### API-XREV-A-04 — Config not an object
- **Why it matters.** Guide A-04 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. PUT /config with "config": "abc" 2. PUT with "config": [1] 3. GET /config
- **Expected.** 422 'config must be an object' each time; GET shows the config unchanged.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:122-123`

#### API-XREV-A-05 — enabled missing or not true/false
- **Why it matters.** Guide A-05 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. PUT the current config without enabled 2. then with "enabled": "yes" 3. then with "enabled": "true" (a string)
- **Expected.** 422 'enabled must be true or false' each time; config unchanged.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:124`

#### API-XREV-A-06 — vendor_statuses empty or unknown
- **Why it matters.** Guide A-06 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. vendor_statuses [] 2. vendor_statuses ["approved"] 3. vendor_statuses ["active","approved"] 4. vendor_statuses "active" (not a list)
- **Expected.** 422 'vendor_statuses must be a non-empty list from: in_active, active, invited, onboarding_in_progress, in_review, rejected, in_approval, blacklisted' (the enum's order) each time; config unchanged.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:126-130`

#### API-XREV-A-07 — validations empty
- **Why it matters.** Guide A-07 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. "validations": {} 2. "validations": []
- **Expected.** 422 'validations must be a non-empty object'; config unchanged.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:132-134`

#### API-XREV-A-08 — Unknown document type
- **Why it matters.** Guide A-08 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. add "aadhaar": {...} to validations
- **Expected.** 422 'unsupported doc types: aadhaar'; config unchanged.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:136-137`

#### API-XREV-A-09 — Bad frequency
- **Why it matters.** Guide A-09 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. gst frequency weekly 2. gst frequency missing
- **Expected.** 422 "gst: unsupported frequency 'weekly'"; with none, "gst: unsupported frequency ''".
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:46-50`

#### API-XREV-A-10 — Bad start date
- **Why it matters.** Guide A-10 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. gst start_date 2026-13-45 2. then 15-10-2026 3. then 2026-02-30
- **Expected.** 422 "gst: invalid start_date '<value>'" each time (Date.iso8601).
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:51,60-65`

#### API-XREV-A-11 — No paths
- **Why it matters.** Guide A-11 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. gst paths [] 2. gst paths missing
- **Expected.** 422 'gst: paths must be a non-empty list'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:53-54`

#### API-XREV-A-12 — Bad path syntax
- **Why it matters.** Guide A-12 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. gst paths ["vendor.gst"] 2. then ["form."] 3. then ["company.GST_NO"]
- **Expected.** 422 "gst: unsupported path '<value>'" each time.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:56-57, app/services/vendor_revalidation/value_reader.rb:46-55`

#### API-XREV-A-13 — Trigger on a disabled client
- **Why it matters.** Guide A-13 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. PUT a config with enabled false 2. POST /trigger mode force, vendor_ids [V-NODOCS]
- **Expected.** 422 'vendor revalidation is not enabled for this client (needs vendor onboarding v2 and config enabled: true)'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P0 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:30-32`

#### API-XREV-A-14 — Mode missing or wrong
- **Why it matters.** Guide A-14 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. POST /trigger without mode 2. mode now 3. mode FORCE
- **Expected.** 422 'mode must be one of: force, scheduler' each time (case-sensitive).
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:34-35`

#### API-XREV-A-15 — Both vendor_ids and vendor_limit
- **Why it matters.** Guide A-15 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. POST /trigger with vendor_ids [V-NODOCS] and vendor_limit 1
- **Expected.** 422 'send either vendor_ids or vendor_limit, not both'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:167-169`

#### API-XREV-A-16 — vendor_limit not positive
- **Why it matters.** Guide A-16 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. vendor_limit 0 2. -1 3. "abc" 4. 1.5
- **Expected.** 422 'vendor_limit must be a positive integer' for each.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:171-175`

#### API-XREV-A-17 — vendor_ids not integers
- **Why it matters.** Guide A-17 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. vendor_ids ["abc", 1.5] 2. vendor_ids ["1x"]
- **Expected.** 422 'vendor_ids must be a list of integers'. (Numeric strings such as "123" are accepted.)
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:178-179`

#### API-XREV-A-18 — Vendor not of this client
- **Why it matters.** Guide A-18 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NOTCLIENT.
- **Steps.** 1. vendor_ids [V-NOTCLIENT] — an active vendor linked to another client only
- **Expected.** 422 "vendor_ids not among this client's vendors in the configured statuses: <id>".
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:181-182`

#### API-XREV-A-19 — Vendor in a status not configured
- **Why it matters.** Guide A-19 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-STATUS-invited.
- **Steps.** 1. PUT vendor_statuses ["active"] 2. vendor_ids [V-STATUS-invited]
- **Expected.** Same message as A-18 with that id.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:181-182, app/workers/vendor_revalidation/run_worker.rb:53-58`

#### API-XREV-A-20 — No vendor matches statuses
- **Why it matters.** Guide A-20 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. find a link status with no eligible vendor for the client (database) 2. PUT vendor_statuses [that status] 3. POST /trigger vendor_limit 1
- **Expected.** 422 'no vendors match the configured vendor_statuses'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:43-44`

#### API-XREV-A-21 — run_at in the past
- **Why it matters.** Guide A-21 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. run_at = now − 10 min (IST)
- **Expected.** 422 'run_at is in the past'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:151`

#### API-XREV-A-22 — run_at more than 30 days ahead
- **Why it matters.** Guide A-22 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. run_at = now + 31 days
- **Expected.** 422 'run_at must be within 30 days from now'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:152`

#### API-XREV-A-23 — run_at not a time
- **Why it matters.** Guide A-23 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. run_at tomorrow 2. run_at 2026-02-30T10:00:00
- **Expected.** 422 'run_at must be a time like <now+1h, ISO with +05:30> (IST if no offset)'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P3 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:149-150,158-162`

#### API-XREV-A-24 — Cancel unknown or started job
- **Why it matters.** Guide A-24 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. DELETE /trigger/abc123 2. (a job already started: covered in B-12)
- **Expected.** 404, code 2 'trigger not found or already started'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:60-64`

#### API-XREV-A-25 — Run status for unknown run
- **Why it matters.** Guide A-25 (API).
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /runs/<random uuid>
- **Expected.** 200 with total_rows 0, vendors 0, complete false; no error.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P3 · automate · `API-XREV-A` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:70-100`

#### API-XREV-A-26 — run_at 30 seconds in the past is accepted
- **Why it matters.** Guide A-26 (API).
- **Setup.** Not run unattended (dev): covered by the code (PAST_TOLERANCE 1 minute) and by A-21's boundary; run by hand if wanted — a clock difference between this machine and the server makes the 30 s margin flaky
- **Steps.** 1. run_at = now − 30 s
- **Expected.** Accepted (1-minute tolerance); runs now.
- **Oracle.** —
- **Trace.** P3 · manual · `API-XREV-A` · dev · `app/controllers/api/vendor_revalidation_qa_controller.rb:6,151`

#### API-XREV-A-27 — GET config returns the saved config
- **Why it matters.** Guide A-27 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. PUT the current config with vendor_statuses in reverse order 2. GET /config
- **Expected.** GET config equals the PUT exactly; PUT answers with it too; enabled = config.enabled AND vendor_onboarding_v2.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:12-27,113-120`

#### API-XREV-A-28 — PUT replaces the whole config
- **Why it matters.** Guide A-28 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. PUT with only gst 2. GET
- **Expected.** Only gst is in the config; the other document types are gone.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:16-27`

#### API-XREV-A-29 — run_at without offset is IST
- **Why it matters.** Guide A-29 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. silent config 2. run_at <tomorrow>T15:00:00 (no offset) 3. cancel at once
- **Expected.** scheduled_for <tomorrow>T15:00:00+05:30; run_scheduled_on tomorrow and that date's run id; cancel → state cancelled.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:146-162`

#### API-XREV-A-30 — A client's super admin reads another client's config
- **Why it matters.** Added from the code (not in the guide). Finding REV-01 (Critical): The QA revalidation API is open to every client super admin, for every client, and is no longer blocked on production.
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /config?client_company_id=<another client> with this client's super-admin session
- **Expected.** Code 5 'Not authorized'.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P0 · automate · `API-XREV-A` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:103-111 (set_client takes any client_company_id)` · `REV-01`

#### API-XREV-A-31 — run_at with a UTC offset late in the evening belongs to the next IST date
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-NODOCS.
- **Steps.** 1. silent config 2. run_at <day>T20:00:00Z (= 01:30 IST next day) 3. cancel
- **Expected.** run_scheduled_on = the IST date (next day) and its run id.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-A` · config (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:45-46 (run_at.to_date in IST)`

#### API-XREV-A-32 — Document settings that are not an object
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. "gst": "yearly"
- **Expected.** 422 'gst: settings must be an object' (a message the guide's table does not list).
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P3 · automate · `API-XREV-A` · config (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:47`

#### API-XREV-A-33 — A single path given as a string is accepted
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. gst paths "form.gstin" (a string, not a list)
- **Expected.** Accepted (Array.wrap); the guide documents paths as a list only.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P3 · automate · `API-XREV-A` · config (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:53`

#### API-XREV-A-34 — An empty vendor scope runs every vendor of the client
- **Why it matters.** Added from the code (not in the guide). Finding REV-02 (High): An empty vendor scope (vendor_ids: [] or vendor_limit "") revalidates every vendor of the client.
- **Setup.** Not run unattended (code): NOT SENT ON PURPOSE: on this build it would revalidate every GMMCO vendor against the real providers. Proved from the code: [] and "" are blank, parse_vendor_scope returns no scope, select_vendors returns all_vendor_ids.
- **Steps.** 1. POST /trigger with "vendor_ids": [] (or vendor_limit "" / null)
- **Expected.** Refused, like any other bad scope.
- **Oracle.** —
- **Trace.** P1 · automate-later · `API-XREV-A` · code · `app/controllers/api/vendor_revalidation_qa_controller.rb:164-185 (raw_ids.blank? → no scope), app/workers/vendor_revalidation/qa_trigger_worker.rb:50-56 (no scope → all vendors)` · `REV-02`

## 2. Triggers and schedule

Force vs scheduler, the cycle arithmetic, catch-up, cancel, the shared run id and re-triggers. Scheduler cases set start dates relative to today so every cycle can be proved on the day the suite runs; they read a column that does not exist, so no provider is called.

#### API-XREV-B-01 — Scheduler mode with nothing due
- **Why it matters.** Guide B-01 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. config: gst quarterly, start = today − 10 days 2. POST /trigger mode scheduler, vendor_ids [V-NODOCS] 3. GET /runs/<run_id>?job_id=
- **Expected.** trigger.state nothing_due; no rows created for the vendor. _Guide:_ …complete false.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:28-32, app/workers/vendor_revalidation/scheduler_worker.rb:34-44`

#### API-XREV-B-02 — Scheduler does not repeat a type already checked since its due date
- **Why it matters.** Guide B-02 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. find a GST run of this client 1–2 days ago (date D) 2. config: gst monthly, start = D one month back (so D is the due date) 3. scheduler trigger today
- **Expected.** nothing_due: rows exist for gst on D, inside due_date…today.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:60-69 (due_date...run_date, exclusive)`

#### API-XREV-B-03 — one_time does not run again
- **Why it matters.** Guide B-03 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. config: msme one_time, start = today − 5 2. scheduler trigger today
- **Expected.** nothing_due.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:34-37`

#### API-XREV-B-04 — Catch-up stops after 2 days
- **Why it matters.** Guide B-04 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. config: cin monthly with its cycle date 3 days ago (no rows) 2. scheduler trigger today
- **Expected.** nothing_due.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:12,34-44`

#### API-XREV-B-05 — Cancelled trigger does nothing
- **Why it matters.** Guide B-05 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. silent config 2. trigger run_at now + 2 min 3. DELETE /trigger/<job_id> 4. wait past run_at 5. GET /runs?job_id=
- **Expected.** Cancel answers state cancelled; afterwards still cancelled; the vendor's rows untouched.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:60-68`

#### API-XREV-B-06 — Config switched off before a scheduled trigger fires
- **Why it matters.** Guide B-06 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. silent config 2. trigger run_at now + 2 min 3. PUT enabled false 4. wait past run_at
- **Expected.** trigger.state disabled; no rows created or reset.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:24-27`

#### API-XREV-B-07 — Force checks every configured type regardless of dates
- **Why it matters.** Guide B-07 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS.
- **Steps.** 1. config: the client's document types, each starting 20 days ahead 2. run force [V-PASS]
- **Expected.** Rows for every configured type; by_doc_type lists them all; by_status adds up.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:30`

#### API-XREV-B-08 — Scheduler on the start date
- **Why it matters.** Guide B-08 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. config: gst quarterly, start = today 2. scheduler trigger now
- **Expected.** state started; gst rows only.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:39-43`

#### API-XREV-B-09 — Each cycle length
- **Why it matters.** Guide B-09 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. for monthly / quarterly / six_monthly / yearly: start = today minus 1/3/6/12 months → scheduler trigger 2. then start whose cycle date was 3 days ago → scheduler trigger 3. quarterly with start 2 months ago → scheduler trigger
- **Expected.** Due (started) exactly on whole cycles; nothing_due 3 days after a cycle date and on a non-cycle month. _Guide:_ run_at on 10 Nov / Jan / Apr / Oct — not possible: run_at is capped at 30 days and a future trigger only fires then; the same rule is proved by moving the start date instead.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:14,39-43`

#### API-XREV-B-10 — Month end
- **Why it matters.** Guide B-10 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. on the last day of a month shorter than 31 days: config gst monthly from the newest 31st 2. scheduler trigger
- **Expected.** Due on the clamped month end (e.g. 30 Nov). _Guide:_ …and not on 1 Dec — but the 2-day catch-up makes 30 Nov's due date still due on 1 Dec if not run.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:39-43 (start_date >> months clamps)`

#### API-XREV-B-11 — Catch-up within 2 days
- **Why it matters.** Guide B-11 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. config: a document type the client has never checked (cin), monthly, cycle date 2 days ago 2. scheduler trigger
- **Expected.** Due and started.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:12,35`

#### API-XREV-B-12 — Same-day triggers share one run id
- **Why it matters.** Guide B-12 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. silent config 2. run force twice 3. DELETE the first job after it started
- **Expected.** Same run_id = uuid v5('procol://vendor_revalidation/<client>/<date>'); cancel after start → 404.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/scheduler_worker.rb:29-31, app/controllers/api/vendor_revalidation_qa_controller.rb:60-64`

#### API-XREV-B-13 — Re-trigger rebuilds with no duplicates
- **Why it matters.** Guide B-13 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS, V-BADGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS, V-BADGST.
- **Steps.** 1. run force [V-PASS, V-BADGST] 2. run them again
- **Expected.** Same row count and per-status counts; rows rebuilt (new ids); one row per vendor per document value.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:103-111`

#### API-XREV-B-14 — Re-trigger of a subset leaves others alone
- **Why it matters.** Guide B-14 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS, V-BADGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS, V-BADGST.
- **Steps.** 1. run [V-PASS, V-BADGST] 2. run [V-PASS] only
- **Expected.** V-BADGST's rows unchanged; V-PASS's rebuilt.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:104 (reset limited to the chosen vendors)`

#### API-XREV-B-15 — Scheduled trigger starts on time
- **Why it matters.** Guide B-15 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. silent config 2. trigger run_at now + 2 min 3. poll
- **Expected.** state scheduled before; started within 2 minutes after run_at.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-B` · run (token) · `app/controllers/api/vendor_revalidation_qa_controller.rb:54`

#### API-XREV-B-16 — vendor_limit picks the same vendors every time
- **Why it matters.** Guide B-16 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on 1–3 vendors; config saved and restored, vendors whose shown status the case changed are re-run under the original config.
- **Steps.** 1. silent config 2. run vendor_limit 3 twice
- **Expected.** Same 3 vendor ids, the lowest eligible ids.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/run_worker.rb:53-58, app/workers/vendor_revalidation/qa_trigger_worker.rb:50-56`

#### API-XREV-B-17 — Nightly run skips a client with pending rows
- **Why it matters.** Guide B-17 (Dev).
- **Setup.** Not run unattended (dev): needs the nightly scheduler and app logs
- **Steps.** 1. leave a run with pending rows 2. let the 11 pm scheduler run
- **Expected.** No new run that night; log run_skipped … previous run in progress.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-B` · dev · `app/workers/vendor_revalidation/scheduler_worker.rb:74-77`

#### API-XREV-B-18 — Nightly run time
- **Why it matters.** Guide B-18 (Dev).
- **Setup.** Not run unattended (dev): needs the nightly scheduler and app logs
- **Steps.** 1. config due today; do not trigger
- **Expected.** Run starts at 11 pm IST (log run_started).
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-B` · dev · `config/sidekiq.yml (0 23 * * * Asia/Kolkata)`

#### API-XREV-B-19 — Two triggers for different vendors firing together both run
- **Why it matters.** Added from the code (not in the guide). Finding REV-09 (Medium): A QA trigger can delete another trigger's queued run for the same day.
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS, V-NODOCS2; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS, V-NODOCS2.
- **Steps.** 1. silent config 2. trigger [V-NODOCS] and [V-NODOCS2] for the same run_at (now + 90 s) 3. wait for both
- **Expected.** Both complete with their vendor's rows.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-B` · run (token) · `app/workers/vendor_revalidation/qa_trigger_worker.rb:113-124 (delete_jobs deletes every queued RunWorker job of the run, not only the chosen vendors')` · `REV-09`

#### API-XREV-B-20 — A QA trigger takes the nightly run's claim for that date
- **Why it matters.** Added from the code (not in the guide). Finding REV-10 (Low): A QA trigger in the hour before 11 pm makes the nightly run skip the client.
- **Setup.** Not run unattended (code): needs the nightly scheduler; proved from the code: the QA trigger sets the same claim key with a 1-hour TTL, so the nightly start_run returns early
- **Steps.** 1. QA trigger at 10:30 pm IST 2. nightly scheduler at 11 pm
- **Expected.** The nightly run still starts.
- **Oracle.** —
- **Trace.** P3 · automate-later · `API-XREV-B` · code · `app/workers/vendor_revalidation/qa_trigger_worker.rb:39 ($redis.set claim nx, ex 3600), app/workers/vendor_revalidation/scheduler_worker.rb:82` · `REV-10`

## 3. Vendor coverage

Which vendors a run picks: link status in vendor_statuses, source referral/procol, active company, sorted by id.

#### API-XREV-C-01 — Status not in vendor_statuses is left out
- **Why it matters.** Guide C-01 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on 1–3 vendors; config saved and restored, vendors whose shown status the case changed are re-run under the original config.
- **Steps.** 1. silent config, vendor_statuses ["active"] 2. run vendor_limit 3
- **Expected.** Every chosen vendor is linked as active; no rows for others. _Guide:_ vendor_limit 50 — cut to 3 to keep runs small (the rule is the same).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-C` · run (token) · `app/workers/vendor_revalidation/run_worker.rb:53-58`

#### API-XREV-C-02 — Unlinked vendor is left out
- **Why it matters.** Guide C-02 (API+Dev).
- **Setup.** Not run unattended (manual): needs a vendor unlinked from the client — a change to real data the platform does not make
- **Steps.** 1. unlink a vendor from the client 2. run with vendor_limit covering it
- **Expected.** No rows for it; its older rows still exist.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-C` · manual · `app/workers/vendor_revalidation/run_worker.rb:53-58`

#### API-XREV-C-03 — Inactive vendor company is left out
- **Why it matters.** Guide C-03 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-INACTIVE.
- **Steps.** 1. silent config, vendor_statuses ["active","invited"] 2. trigger vendor_ids [V-INACTIVE] (linked, company inactive)
- **Expected.** Refused: "vendor_ids not among this client's vendors in the configured statuses: <id>" (inactive companies are never eligible).
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-C` · config (token) · `app/workers/vendor_revalidation/run_worker.rb:56 (Company.active)`

#### API-XREV-C-04 — Client not on onboarding v2
- **Why it matters.** Guide C-04 (API).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. GET /config for an active client without onboarding v2
- **Expected.** enabled false, vendor_onboarding_v2 false. (The write half — enable it, trigger refused — is manual: an empty config cannot be put back.)
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-C` · config (token) · `app/models/company.rb:925-927`

#### API-XREV-C-05 — Each link status is included when configured
- **Why it matters.** Guide C-05 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on 1–3 vendors; config saved and restored, vendors whose shown status the case changed are re-run under the original config.
- **Steps.** 1. for each link status with an eligible vendor: silent config with vendor_statuses [that status] 2. run [V-STATUS-<status>]
- **Expected.** Rows created; vendor finished.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-C` · run (token) · `app/workers/vendor_revalidation/run_worker.rb:53-58`

#### API-XREV-C-06 — Bulk-uploaded vendor is included
- **Why it matters.** Guide C-06 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-MISC; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-MISC.
- **Steps.** 1. config: pan paths ["company.misc.pan"] 2. run [V-MISC]
- **Expected.** A PAN row whose value is the vendor's misc.pan (bulk-uploaded vendors are linked as referral, so they are eligible).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-C` · run (token) · `app/workers/vendor_revalidation/run_worker.rb:55, app/services/vendor_revalidation/value_reader.rb:148-162`

#### API-XREV-C-07 — Vendor under two clients is kept separate
- **Why it matters.** Guide C-07 (API+UI).
- **Setup.** Not run unattended (manual): needs a second client's config switched on — another tenant's real setting
- **Steps.** 1. config both clients 2. run each with [V-OTHERCLIENT]
- **Expected.** Separate rows and final status per client.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-C` · manual · `app/models/vendor_validation_history.rb:68-80`

#### API-XREV-C-08 — Status change during a run has no effect
- **Why it matters.** Guide C-08 (API).
- **Setup.** Not run unattended (manual): needs a vendor's link status changed mid-run
- **Steps.** 1. start a run 2. approve / change one chosen vendor's link mid-run
- **Expected.** Vendor still checked in this run.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-C` · manual · `app/services/vendor_revalidation/vendor_check_service.rb:23-50 (rows already created)`

#### API-XREV-C-09 — Every checked vendor can appear on the listing
- **Why it matters.** Added from the code (not in the guide). Finding REV-14 (Medium): Vendors of other company categories are revalidated but never shown.
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. latest run: categories of the companies checked
- **Expected.** All are selling firm, brokerage or subsidiary — the categories the listing shows.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P2 · automate · `API-XREV-C` · audit · `app/workers/vendor_revalidation/run_worker.rb:53-58 (category filter dropped in d18f8ac4c9) vs app/controllers/api/companies_controller.rb:346 (listing keeps it)` · `REV-14`

#### API-XREV-C-10 — A full run fits inside the 24-hour deadline
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. eligible vendors × configured documents ÷ 30 calls/min
- **Expected.** ≤ 24 h; beyond it the last vendors would end as system_error by design (run_exceeds_deadline is only logged).
- **Oracle.** The database rows (SELECT only).
- **Trace.** P2 · automate · `API-XREV-C` · audit · `app/workers/vendor_revalidation/run_worker.rb:28-48`

## 4. Reading document values

Paths are tried in order; the first that gives a value wins. Several cases point a document at a company column on purpose, so the value is known without preparing data.

#### API-XREV-D-01 — All paths empty gives skipped
- **Why it matters.** Guide D-01 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS.
- **Steps.** 1. run [V-NODOCS] under the client's config
- **Expected.** Every row skipped 'not provided'; final status skipped (listing label 'Skipped'). _Guide:_ …shown as not validated.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:134-163, app/models/vendor_validation_history.rb:37`

#### API-XREV-D-02 — Uploaded file is not a value
- **Why it matters.** Guide D-02 (API).
- **Setup.** Not run unattended (manual): needs a vendor whose MSME field holds only a file — record its id in config/revalidationVendors.json to run Test vendors: V-FILEONLY.
- **Steps.** 1. msme paths [form.msme_no] 2. run [V-FILEONLY]
- **Expected.** msme skipped.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-D` · manual · `app/services/vendor_revalidation/value_reader.rb:58-84 (url / public_url → empty)`

#### API-XREV-D-03 — Link text is not a value
- **Why it matters.** Guide D-03 (API).
- **Setup.** Not run unattended (manual): needs a vendor's GST field edited
- **Steps.** 1. put https://… in the GST field 2. run
- **Expected.** gst skipped (or the next path used). Note: an upper-case 'HTTPS://' is NOT treated as a link (start_with? is case-sensitive).
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-D` · manual · `app/services/vendor_revalidation/value_reader.rb:63`

#### API-XREV-D-04 — Bank with account but no IFSC
- **Why it matters.** Guide D-04 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-BANKHALF; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-BANKHALF.
- **Steps.** 1. config: bank paths [{bank_account_no: company.misc.bank_account_number, ifsc: company.misc.bank_ifsc_code}] 2. run [V-BANKHALF]
- **Expected.** bank skipped 'not provided'.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/value_reader.rb:86-97`

#### API-XREV-D-05 — Column that does not exist
- **Why it matters.** Guide D-05 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-COMPANYGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-COMPANYGST.
- **Steps.** 1. gst paths ["company.gst_number_wrong", "company.gst_no"] 2. run [V-COMPANYGST]
- **Expected.** No error; the GST row's value is the company's gst_no.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/value_reader.rb:150 (& Company.column_names)`

#### API-XREV-D-06 — First path with a value wins
- **Why it matters.** Guide D-06 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-COMPANYGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-COMPANYGST.
- **Steps.** 1. gst paths ["company.gst_no", "company.pan_no"] — both have a value 2. run
- **Expected.** Only the first (gst_no) is checked. _Guide:_ form A vs company B — needs a prepared vendor; two company columns prove the same rule.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/value_reader.rb:24-44`

#### API-XREV-D-07 — Falls to company record when form is empty
- **Why it matters.** Guide D-07 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-COMPANYGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-COMPANYGST.
- **Steps.** 1. gst paths ["form.<a field no form has>", "company.gst_no"] 2. run
- **Expected.** GST from the company record is checked. _Guide:_ …no name-match rule applied (no rule is applied on any path — REV-03).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/value_reader.rb:24-44,125-143`

#### API-XREV-D-08 — Several values give several rows
- **Why it matters.** Guide D-08 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-2GST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-2GST.
- **Steps.** 1. run [V-2GST]
- **Expected.** One gst row per value, value_index 0..n-1.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:134-163`

#### API-XREV-D-09 — Extra data with nested key
- **Why it matters.** Guide D-09 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-MISC; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-MISC.
- **Steps.** 1. pan paths ["company.misc.pan"] 2. run [V-MISC]
- **Expected.** PAN read from misc.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/value_reader.rb:148-162`

#### API-XREV-D-10 — Extended field path
- **Why it matters.** Guide D-10 (API).
- **Setup.** Not run unattended (manual): needs a vendor with an active extended field holding a document number
- **Steps.** 1. gst paths ["company.extended_fields.<key>"] for a vendor with that field
- **Expected.** Value read and checked.
- **Oracle.** —
- **Trace.** P3 · manual · `API-XREV-D` · manual · `app/services/vendor_revalidation/value_reader.rb:163-168`

#### API-XREV-D-11 — Latest onboarding response is used
- **Why it matters.** Guide D-11 (API).
- **Setup.** Not run unattended (manual): needs a vendor to re-submit onboarding
- **Steps.** 1. vendor re-submits onboarding with a new GST 2. run
- **Expected.** New GST is checked (accepted response preferred).
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-D` · manual · `app/services/vendor_revalidation/value_reader.rb:206-215`

#### API-XREV-D-12 — Spaces are trimmed
- **Why it matters.** Guide D-12 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-SPACES; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-SPACES.
- **Steps.** 1. gst paths [company.gst_no] for a vendor whose gst_no has spaces around it 2. run
- **Expected.** Checked and stored as the trimmed value.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P3 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/value_reader.rb:62`

#### API-XREV-D-13 — Onboarding form is never changed
- **Why it matters.** Guide D-13 (UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS.
- **Steps.** 1. snapshot the vendor's template_responses, link status and company record 2. run [V-PASS] 3. snapshot again
- **Expected.** Unchanged.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-D` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb (no writes outside vendor_validation_histories and the link's three columns)`

#### API-XREV-D-14 — Upper-case link text is read as a value
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Not run unattended (code): needs a vendor's field edited; proved from the code
- **Steps.** 1. GST field 'HTTPS://example.com'
- **Expected.** Treated as a link (empty).
- **Oracle.** —
- **Trace.** P3 · automate-later · `API-XREV-D` · code · `app/services/vendor_revalidation/value_reader.rb:63 (start_with?('http://', 'https://') is case-sensitive)`

## 5. GST, PAN, MSME and bank checks

The format pre-check runs before any provider call; pointing a document at the wrong column (a PAN read as GST) proves it without touching a provider.

#### API-XREV-E-01 — GST that does not exist
- **Why it matters.** Guide E-01 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-BADGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-BADGST.
- **Steps.** 1. run [V-BADGST]
- **Expected.** gst failed; vendor Failed; listing error 'GST <value>: <message>'.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-E` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:208-230, app/models/vendor_validation_history.rb:47-56`

#### API-XREV-E-02 — GST wrong format
- **Why it matters.** Guide E-02 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-COMPANYPAN; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-COMPANYPAN.
- **Steps.** 1. gst paths ["company.pan_no"] — a 10-character PAN read as GST 2. run
- **Expected.** gst failed 'GST input is incorrect' from the pre-check (no provider call).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-E` · run (token) · `lib/external_api/validation.rb:66-77`

#### API-XREV-E-03 — Cancelled GST
- **Why it matters.** Guide E-03 (API+UI).
- **Setup.** Not run unattended (manual): needs a vendor with a real cancelled GSTIN — record it in config/revalidationVendors.json Test vendors: V-CANCELLED.
- **Steps.** 1. run [V-CANCELLED]
- **Expected.** gst failed; message says cancelled / inactive.
- **Oracle.** —
- **Trace.** P0 · manual · `API-XREV-E` · manual · `lib/external_api/validation.rb:126-131`

#### API-XREV-E-04 — One of two GSTs invalid
- **Why it matters.** Guide E-04 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-2GST-MIXED; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-2GST-MIXED.
- **Steps.** 1. run [V-2GST-MIXED]
- **Expected.** 1 gst passed, 1 failed; vendor Failed; the error names only the bad GST.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-E` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:72-99`

#### API-XREV-E-05 — GST name mismatch on form path
- **Why it matters.** Guide E-05 (API). Finding REV-03 (High): Client onboarding rules (name match etc.) are never applied in revalidation.
- **Setup.** Not run unattended (code): from the code no client rule is ever applied in revalidation; needs a prepared vendor to show it live Test vendors: V-NAMEMISMATCH.
- **Steps.** 1. client rule needs a name match 2. run [V-NAMEMISMATCH]
- **Expected.** gst failed with the name-mismatch message, as onboarding gives.
- **Oracle.** —
- **Trace.** P1 · automate-later · `API-XREV-E` · code · `lib/external_api/validation.rb:238 (revalidation returns before apply_response_rules at :240)` · `REV-03`

#### API-XREV-E-06 — Foreign tax number in GST field
- **Why it matters.** Guide E-06 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-FOREIGN; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-FOREIGN.
- **Steps.** 1. gst paths [company.gst_no] for a vendor whose gst_no is foreign (GB…) 2. run
- **Expected.** gst failed 'GST input is incorrect' (pre-check).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-E` · run (token) · `lib/external_api/validation.rb:74-75`

#### API-XREV-E-07 — PAN that does not exist
- **Why it matters.** Guide E-07 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-BADPAN; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-BADPAN.
- **Steps.** 1. run [V-BADPAN]
- **Expected.** pan failed; vendor Failed.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-E` · run (token) · `lib/external_api/validation.rb:126-131`

#### API-XREV-E-08 — PAN wrong format
- **Why it matters.** Guide E-08 (API). Finding REV-05 (Medium): The PAN format pre-check accepts any text that merely contains a PAN.
- **Setup.** Needs VR_QA_TOKEN. A real run on V-COMPANYGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-COMPANYGST.
- **Steps.** 1. pan paths ["company.gst_no"] — a 15-character GSTIN read as PAN 2. run
- **Expected.** pan failed 'PAN input is incorrect' from the pre-check.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-E` · run (token) · `lib/external_api/validation.rb:74 (value.match(regex) — the PAN regex [A-Z]{5}[0-9]{4}[A-Z]{1} has no anchors, so a GSTIN containing a PAN passes)` · `REV-05`

#### API-XREV-E-09 — Udyam number wrong format
- **Why it matters.** Guide E-09 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-COMPANYPAN; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-COMPANYPAN.
- **Steps.** 1. msme paths ["company.pan_no"] 2. run
- **Expected.** msme failed 'MSME input is incorrect' (pre-check).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-E` · run (token) · `lib/external_api/validation.rb:74-75`

#### API-XREV-E-10 — Bank account wrong
- **Why it matters.** Guide E-10 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-BANKFAIL; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-BANKFAIL.
- **Steps.** 1. run [V-BANKFAIL]
- **Expected.** bank failed; vendor Failed. _Guide:_ one vendor each for wrong account / wrong IFSC / closed — the others need prepared vendors.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P1 · automate · `API-XREV-E` · run (token) · `lib/external_api/validation.rb:126-131`

#### API-XREV-E-11 — Bank holder name mismatch on form path
- **Why it matters.** Guide E-11 (API). Finding REV-03 (High): Client onboarding rules (name match etc.) are never applied in revalidation.
- **Setup.** Not run unattended (code): as E-05: no client rule is applied in revalidation
- **Steps.** 1. client rule needs a name match
- **Expected.** bank failed with name mismatch.
- **Oracle.** —
- **Trace.** P2 · automate-later · `API-XREV-E` · code · `lib/external_api/validation.rb:238` · `REV-03`

#### API-XREV-E-12 — All documents valid
- **Why it matters.** Guide E-12 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS.
- **Steps.** 1. run [V-PASS]
- **Expected.** Every row passed; vendor Passed; listing Passed with no errors.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-E` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:72-99`

#### API-XREV-E-13 — Company-record value skips name match
- **Why it matters.** Guide E-13 (API).
- **Setup.** Not run unattended (code): holds trivially on this build — no path applies name rules (REV-03)
- **Steps.** 1. run [V-COMPANYONLY] whose GST legal name differs
- **Expected.** gst passed (provider check only).
- **Oracle.** —
- **Trace.** P1 · automate-later · `API-XREV-E` · code · `lib/external_api/validation.rb:238`

#### API-XREV-E-14 — Right GST provider per client
- **Why it matters.** Guide E-14 (Dev).
- **Setup.** Not run unattended (dev): needs provider logs
- **Steps.** 1. run two clients on different GST providers
- **Expected.** Each client's calls go to its own provider.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-E` · dev · `lib/external_api/validation.rb:102-110`

#### API-XREV-E-15 — 24-hour reuse of a provider answer
- **Why it matters.** Guide E-15 (Dev).
- **Setup.** Not run unattended (dev): needs provider logs
- **Steps.** 1. same GST checked for client B within 24 h 2. run the client
- **Expected.** Answer reused; row still counted. _Guide:_ …client rules still applied — none are (REV-03).
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-E` · dev · `lib/external_api/validation.rb:79-80,117-120 (cache key has no client)`

#### API-XREV-E-16 — Vendor fixes a bad document
- **Why it matters.** Guide E-16 (API+UI).
- **Setup.** Not run unattended (manual): needs a vendor's document corrected
- **Steps.** 1. after E-01, correct the GST 2. run again next day
- **Expected.** gst passed; vendor Passed; error gone.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-E` · manual · `app/services/vendor_revalidation/vendor_check_service.rb:72-99`

#### API-XREV-E-17 — Other document types through config
- **Why it matters.** Guide E-17 (API).
- **Setup.** Not run unattended (manual): needs a vendor with a CIN / FSSAI value
- **Steps.** 1. add cin or fssai with paths 2. run a vendor with that value
- **Expected.** Rows created and checked like the others. (tan is routed via SAP: UNSUPPORTED → system_error.)
- **Oracle.** —
- **Trace.** P3 · manual · `API-XREV-E` · manual · `lib/external_api/validation.rb:66-70`

## 6. Provider limits, outages and deadline

Mostly dev-assisted. The switch-off mid-run is the one the QA API can stage.

#### API-XREV-F-01 — Rate limit never fails a vendor
- **Why it matters.** Guide F-01 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** gst stays pending (not failed); vendor not Failed while waiting.
- **Oracle.** —
- **Trace.** P0 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:19-80, app/services/vendor_revalidation/vendor_check_service.rb:183-207`

#### API-XREV-F-02 — Breaker uses Retry-After
- **Why it matters.** Guide F-02 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** No GST calls for about Retry-After; log breaker_opened … reason=rate_limited. (Retry-After is used as sent, uncapped.)
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:47-80`

#### API-XREV-F-03 — Breaker without Retry-After
- **Why it matters.** Guide F-03 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Wait about 15 min, then one test call.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:9`

#### API-XREV-F-04 — 5 failures in a row open the breaker; fewer do not
- **Why it matters.** Guide F-04 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** 4 + success: no breaker; 5: breaker_opened.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:8`

#### API-XREV-F-05 — Failed test call doubles the wait
- **Why it matters.** Guide F-05 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** 15 → 30 → 60 min … max 24 h.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:9-10`

#### API-XREV-F-06 — Only one test call when the breaker reopens
- **Why it matters.** Guide F-06 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** One call first (5-min probe lock); the rest come back with up to 2 min jitter.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:12-13`

#### API-XREV-F-07 — 24-hour deadline gives system_error
- **Why it matters.** Guide F-07 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Rows system_error 'verification is temporarily unavailable'; vendor System Error (or Failed if another check failed).
- **Oracle.** —
- **Trace.** P0 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/vendor_check_service.rb:19, app/models/vendor_validation_history.rb:40`

#### API-XREV-F-08 — Cleaner closes stuck rows after 25 h
- **Why it matters.** Guide F-08 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Rows closed as system_error; run summary logged.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-F` · dev · `app/workers/vendor_revalidation/sweeper_worker.rb:11-25`

#### API-XREV-F-09 — Crashing vendor job
- **Why it matters.** Guide F-09 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Its rows closed as system_error after 3 retries; other vendors finish.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-F` · dev · `app/workers/vendor_revalidation/vendor_worker.rb:15-21`

#### API-XREV-F-11 — Other providers continue
- **Why it matters.** Guide F-11 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** pan rows finish passed; only gst waits.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb (per provider host)`

#### API-XREV-F-12 — Two GST providers are independent
- **Why it matters.** Guide F-12 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Only provider A's breaker opens.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-F` · dev · `lib/external_api/validation.rb:85-92 (provider_key = host)`

#### API-XREV-F-13 — Rate stays under 30 calls per minute
- **Why it matters.** Guide F-13 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Calls spread; no provider rate-limit answers.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-F` · dev · `app/workers/vendor_revalidation/run_worker.rb:28-44 (spread at the cap)`

#### API-XREV-F-14 — Recovery after a short outage
- **Why it matters.** Guide F-14 (Dev).
- **Setup.** Not run unattended (dev): needs a provider outage, a forced crash or a shortened deadline on UAT
- **Steps.** 1. dev makes the provider answer as the case needs (or shortens the wait) 2. run [V-PASS] 3. read app logs
- **Expected.** Same rows move to passed; no duplicates.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-F` · dev · `app/services/vendor_revalidation/provider_guard.rb:47-80`

#### API-XREV-F-10 — Revalidation switched off mid-run
- **Why it matters.** Guide F-10 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS, V-NODOCS2, V-NODOCS3, V-NODOCS4, V-NODOCS5; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS, V-NODOCS2, V-NODOCS3, V-NODOCS4, V-NODOCS5.
- **Steps.** 1. silent config 2. run force on 5 vendors (jobs spread 2 s apart) 3. PUT enabled false 1.5 s later 4. wait until nothing is pending
- **Expected.** Rows not yet checked are closed system_error 'verification is temporarily unavailable'; none left pending.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-F` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:26-30`

#### API-XREV-F-15 — Live onboarding not hurt during a run
- **Why it matters.** Guide F-15 (Manual).
- **Setup.** Not run unattended (manual): needs a person filling onboarding during a large run
- **Steps.** 1. run 20 vendors 2. meanwhile a new vendor fills onboarding v2
- **Expected.** Onboarding checks answer in normal time.
- **Oracle.** —
- **Trace.** P0 · manual · `API-XREV-F` · manual · `—`

#### API-XREV-F-16 — Vendors cut off by a switch-off still get a final status
- **Why it matters.** Added from the code (not in the guide). Finding REV-08 (Medium): Switching revalidation off mid-run leaves the cut-off vendors with no final status.
- **Setup.** Needs VR_QA_TOKEN. A real run on V-NODOCS, V-NODOCS2, V-NODOCS3, V-NODOCS4, V-NODOCS5; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-NODOCS, V-NODOCS2, V-NODOCS3, V-NODOCS4, V-NODOCS5.
- **Steps.** 1. as F-10 2. read the final status of the vendors whose rows were closed
- **Expected.** Each has a final status (system_error).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P2 · automate · `API-XREV-F` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:26-30 (close) and :73-74 (finalize returns when disabled; the QA reset already cleared the status)` · `REV-08`

## 7. Final status, errors and history

failed > system_error > passed > skipped over each document type's latest rows; one error line per failed or system_error row.

#### API-XREV-G-01 — Any failed check makes the vendor Failed
- **Why it matters.** Guide G-01 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-BANKFAIL; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-BANKFAIL.
- **Steps.** 1. run [V-BANKFAIL] (bank failed, nothing else failed last time)
- **Expected.** Final = precedence of its rows (Failed); errors list only the failed / system_error lines. _Guide:_ V-PASS with bank changed to invalid — needs a data change; a vendor already in that state proves the same rule.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-G` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:72-99, app/models/vendor_validation_history.rb:47-56`

#### API-XREV-G-02 — Skipped never makes the vendor Failed
- **Why it matters.** Guide G-02 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS-SKIP; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS-SKIP.
- **Steps.** 1. run [V-PASS-SKIP] (some passed, the rest not provided)
- **Expected.** Final Passed; skipped documents not in the errors.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-G` · run (token) · `app/models/vendor_validation_history.rb:39, app/models/vendor_validation_history.rb:47-56`

#### API-XREV-G-03 — Skipped is not shown as an error
- **Why it matters.** Guide G-03 (API+UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-NODOCS.
- **Steps.** 1. open V-NODOCS on the listing (client session)
- **Expected.** Errors empty; status 'Skipped'. _Guide:_ …shown as skipped / not validated.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P1 · automate · `API-XREV-G` · listing · `app/models/vendor_validation_history.rb:52 (failed, system_error only)`

#### API-XREV-G-04 — system_error outranks passed
- **Why it matters.** Guide G-04 (Dev). Finding REV-12 (Low): A system error outranks a pass (TRD: 'unverified' never affects Pass).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. every vendor whose latest rows mix passed and system_error (no failure) — from the runs already recorded
- **Expected.** Final System Error, not Passed. _Guide:_ via F-07 (dev) — the recorded runs already contain such vendors. TRD expected Pass: confirm with product.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-G` · audit · `app/models/vendor_validation_history.rb:39` · `REV-12`

#### API-XREV-G-05 — Failed outranks system_error
- **Why it matters.** Guide G-05 (Dev).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. every vendor whose latest rows mix failed and system_error
- **Expected.** Final Failed.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-G` · audit · `app/models/vendor_validation_history.rb:39`

#### API-XREV-G-06 — Types not due keep their older result
- **Why it matters.** Guide G-06 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-BADPAN; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-BADPAN.
- **Steps.** 1. V-BADPAN failed PAN on an earlier day 2. config: gst quarterly from today (due), pan yearly from 10 days ago (not due) 3. scheduler run [V-BADPAN]
- **Expected.** Only gst rows today; final still Failed because PAN's latest row (earlier day) failed.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-G` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:76-90, app/models/vendor_validation_history.rb:68-80`

#### API-XREV-G-07 — All passed
- **Why it matters.** Guide G-07 (API+UI).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS.
- **Steps.** 1. run [V-PASS]
- **Expected.** Final Passed; last validated = this run's start (whole seconds, = the trigger's fired_at).
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-G` · run (token) · `app/services/vendor_revalidation/vendor_check_service.rb:95 (Time.zone.at(run_started_at))`

#### API-XREV-G-08 — Error line format
- **Why it matters.** Guide G-08 (API+UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-BADGST.
- **Steps.** 1. open V-BADGST on the listing
- **Expected.** Line reads 'GST <value>: <message>'.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P1 · automate · `API-XREV-G` · listing · `app/models/vendor_validation_history.rb:53`

#### API-XREV-G-09 — One error line per bad row
- **Why it matters.** Guide G-09 (API+UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-MULTIFAIL.
- **Steps.** 1. open a vendor with 2+ failed / system_error rows on the listing
- **Expected.** One line per bad row (joined with '; ').
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P2 · automate · `API-XREV-G` · listing · `app/models/vendor_validation_history.rb:47-56, app/controllers/concerns/companies_controller_helper.rb:705`

#### API-XREV-G-10 — Pass to Fail between days
- **Why it matters.** Guide G-10 (API+UI).
- **Setup.** Not run unattended (manual): needs a vendor's document changed between two days
- **Steps.** 1. day 1 V-PASS passes 2. day 2 make GST invalid; run
- **Expected.** Day 2 final Failed.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-G` · manual · `app/services/vendor_revalidation/vendor_check_service.rb:72-99`

#### API-XREV-G-11 — Fail to Pass between days
- **Why it matters.** Guide G-11 (API+UI).
- **Setup.** Not run unattended (manual): as G-10
- **Steps.** 1. after G-10 fix GST; run next day
- **Expected.** Final Passed; error gone.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-G` · manual · `app/services/vendor_revalidation/vendor_check_service.rb:72-99`

#### API-XREV-G-12 — Older days' rows are kept
- **Why it matters.** Guide G-12 (Dev).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. runs recorded on 2+ dates
- **Expected.** Each date has its own run id; an earlier day's rows are not changed once a later day's run began.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-G` · audit · `app/workers/vendor_revalidation/scheduler_worker.rb:29-31, app/workers/vendor_revalidation/qa_trigger_worker.rb:104`

#### API-XREV-G-13 — No duplicate rows within one run
- **Why it matters.** Guide G-13 (API).
- **Setup.** Needs VR_QA_TOKEN. A real run on V-PASS, V-BADGST; config saved and restored, vendors whose shown status the case changed are re-run under the original config. Test vendors: V-PASS, V-BADGST.
- **Steps.** 1. run; re-trigger the same vendors the same day
- **Expected.** One row per vendor per document value for that run.
- **Oracle.** GET /runs, the rows and the client–vendor link in the database, and the listing.
- **Trace.** P0 · automate · `API-XREV-G` · run (token) · `app/models/vendor_validation_history.rb:36 (unique index), app/workers/vendor_revalidation/qa_trigger_worker.rb:104`

#### API-XREV-G-14 — by_status adds up
- **Why it matters.** Guide G-14 (API).
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /runs/<the client's latest run> 2. count its rows in the database
- **Expected.** Sum of by_status = total_rows = rows in the database; vendors and finished_vendors match; complete as the rows say.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-G` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:70-100`

#### API-XREV-G-15 — top_errors lists failures
- **Why it matters.** Guide G-15 (API).
- **Setup.** Runs every time: a GET to the QA API, nothing changes.
- **Steps.** 1. GET /runs/<latest run> 2. group its failed / system_error rows in the database
- **Expected.** Up to 10 entries, largest first, each with doc_type, status, message and the right count.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-G` · read · `app/controllers/api/vendor_revalidation_qa_controller.rb:85-88`

#### API-XREV-G-16 — Run summary in logs
- **Why it matters.** Guide G-16 (Dev).
- **Setup.** Not run unattended (dev): needs app logs
- **Steps.** 1. any complete run
- **Expected.** One run_summary log line with counts matching the API.
- **Oracle.** —
- **Trace.** P3 · manual · `API-XREV-G` · dev · `app/services/vendor_revalidation/vendor_check_service.rb:101-114`

#### API-XREV-G-17 — Removing a document type from the config
- **Why it matters.** Added from the code (not in the guide). Finding REV-11 (Medium): Removing a document type from the config hides its error lines but keeps the status it caused.
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called. Test vendors: V-BADPAN.
- **Steps.** 1. V-BADPAN failed PAN 2. PUT the config without pan 3. open V-BADPAN on the listing
- **Expected.** The shown status matches the remaining documents.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P2 · automate · `API-XREV-G` · config (token) · `app/models/vendor_validation_history.rb:47-56 (errors filtered by configured types) vs app/services/vendor_revalidation/vendor_check_service.rb:72-99 (status kept until the next run)` · `REV-11`

## 8. Vendor listing, vendor page and Excel

Read with the client's own session on the revalidation host and compared with the database, vendor by vendor.

#### API-XREV-H-01 — Client with revalidation off shows nothing
- **Why it matters.** Guide H-01 (UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database.
- **Steps.** 1. on a client with revalidation off (e.g. 198678): GET the listing
- **Expected.** No vendor_validation_* fields on any vendor.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P1 · automate · `API-XREV-H` · listing · `app/controllers/api/companies_controller.rb:341,375-381`

#### API-XREV-H-02 — Vendor never checked
- **Why it matters.** Guide H-02 (UI). Finding REV-06 (Low): A vendor no run has checked shows 'Pending' instead of a blank status.
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-NEVER.
- **Steps.** 1. open a linked vendor no run has finished
- **Expected.** Status blank, no date, no errors.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P2 · automate · `API-XREV-H` · listing · `app/controllers/concerns/companies_controller_helper.rb:702 (nil status → label 'Pending')` · `REV-06`

#### API-XREV-H-03 — Date filter From after To
- **Why it matters.** Guide H-03 (UI).
- **Setup.** Not run unattended (ui): a screen behaviour — procol-ui-tests
- **Steps.** 1. Last validated filter 30 Oct to 1 Oct
- **Expected.** Blocked or empty with a message.
- **Oracle.** —
- **Trace.** P3 · manual · `API-XREV-H` · ui · `app/controllers/concerns/companies_controller_filter_helper.rb`

#### API-XREV-H-04 — Columns in every tab
- **Why it matters.** Guide H-04 (API+UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database.
- **Steps.** 1. GET each listing tab (verified, unverified, onboarding_in_progress, rejected), page 1
- **Expected.** vendor_validation_status, vendor_last_validated_at and vendor_validation_errors on every vendor.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P1 · automate · `API-XREV-H` · listing · `app/controllers/concerns/companies_controller_helper.rb:698-708`

#### API-XREV-H-05 — Listing matches the rows
- **Why it matters.** Guide H-05 (API+UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database.
- **Steps.** 1. GET the verified tab, page 1 2. for each vendor: final status label and error lines worked out from the database
- **Expected.** Status and errors equal for every vendor.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P0 · automate · `API-XREV-H` · listing · `app/controllers/concerns/companies_controller_helper.rb:698-708, app/models/vendor_validation_history.rb:47-80`

#### API-XREV-H-06 — Status filter
- **Why it matters.** Guide H-06 (API+UI).
- **Setup.** Not run unattended (ui): the filter payload is built by the screen — procol-ui-tests
- **Steps.** 1. filter Passed, then Failed, then not validated
- **Expected.** Only matching vendors; 'pending' maps to vendors never checked.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-H` · ui · `app/controllers/concerns/companies_controller_filter_helper.rb:436`

#### API-XREV-H-07 — Date range filter
- **Why it matters.** Guide H-07 (UI).
- **Setup.** Not run unattended (ui): screen case
- **Steps.** 1. range covering the run date
- **Expected.** Only vendors validated in range.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-H` · ui · `app/controllers/concerns/companies_controller_filter_helper.rb`

#### API-XREV-H-08 — Filters together with search
- **Why it matters.** Guide H-08 (UI).
- **Setup.** Not run unattended (ui): screen case
- **Steps.** 1. Failed + date range + vendor search
- **Expected.** Results match all three.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-H` · ui · `app/controllers/concerns/companies_controller_filter_helper.rb`

#### API-XREV-H-09 — Vendor page details
- **Why it matters.** Guide H-09 (API+UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-MULTIFAIL.
- **Steps.** 1. GET /api/companies/<vendor> (the vendor page) for a vendor with several results 2. compare revalidation_data.documents with its latest rows
- **Expected.** One entry per check: value, status, error (none for skipped), last run.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P0 · automate · `API-XREV-H` · listing · `app/controllers/api/companies_controller.rb:44-85 (show → revalidation_data), app/controllers/concerns/companies_controller_helper.rb:711-725, app/models/vendor_validation_history.rb:59-66`

#### API-XREV-H-10 — Excel download
- **Why it matters.** Guide H-10 (UI). Finding REV-07 (Low): Validation errors are joined with '; ' instead of one per line in the Excel.
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database.
- **Steps.** 1. download the verified tab's Excel 2. find Validation Status / Validation Errors
- **Expected.** Both columns; errors one per line.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P1 · automate · `API-XREV-H` · listing · `app/controllers/concerns/companies_controller_helper.rb:705 (joined with '; ')` · `REV-07`

#### API-XREV-H-11 — Shared vendor shows each client's own result
- **Why it matters.** Guide H-11 (UI).
- **Setup.** Not run unattended (ui): needs two clients' logins and configs
- **Steps.** 1. V-OTHERCLIENT, log in as each client
- **Expected.** Each sees only its own status and errors.
- **Oracle.** —
- **Trace.** P0 · manual · `API-XREV-H` · ui · `app/models/vendor_validation_history.rb:68-80`

#### API-XREV-H-12 — Listing speed
- **Why it matters.** Guide H-12 (UI).
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database.
- **Steps.** 1. GET the verified tab 3 times
- **Expected.** Median ≤ 5 s. _Guide:_ with a 50-vendor run and the Failed filter.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P2 · automate · `API-XREV-H` · listing · `app/controllers/api/companies_controller.rb:320-415`

## 9. Security, logs and onboarding regression

Masking, the vendor portal, the production guard and switching the feature off.

#### API-XREV-I-01 — PAN masked on screen
- **Why it matters.** Guide I-01 (API+UI). Finding REV-04 (High): PAN and bank account numbers are shown in full in the listing errors, the vendor page and the Excel.
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-BADPAN.
- **Steps.** 1. open V-BADPAN (failed PAN) on the listing
- **Expected.** PAN masked (e.g. ******234F).
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P0 · automate · `API-XREV-I` · listing · `app/models/vendor_validation_history.rb:53 (value written in full)` · `REV-04`

#### API-XREV-I-02 — Bank number masked on screen and Excel
- **Why it matters.** Guide I-02 (UI). Finding REV-04 (High): PAN and bank account numbers are shown in full in the listing errors, the vendor page and the Excel.
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-BANKFAIL.
- **Steps.** 1. open V-BANKFAIL (failed bank) on the listing
- **Expected.** Account number masked.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P0 · automate · `API-XREV-I` · listing · `app/models/vendor_validation_history.rb:53` · `REV-04`

#### API-XREV-I-03 — Masked in API responses
- **Why it matters.** Guide I-03 (UI). Finding REV-04 (High): PAN and bank account numbers are shown in full in the listing errors, the vendor page and the Excel.
- **Setup.** Runs every time: the buyer's own listing / vendor page read with the client's session and compared with the database. Test vendors: V-BADPAN.
- **Steps.** 1. GET /api/companies/<V-BADPAN> (the vendor page's data)
- **Expected.** No full PAN or bank number in revalidation_data.
- **Oracle.** The listing / vendor page reply against the rows and link worked out from the database.
- **Trace.** P1 · automate · `API-XREV-I` · listing · `app/models/vendor_validation_history.rb:59-66 (value: row.value)` · `REV-04`

#### API-XREV-I-04 — Vendor cannot see revalidation results
- **Why it matters.** Guide I-04 (UI).
- **Setup.** Not run unattended (ui): vendor portal screen case
- **Steps.** 1. log in as the vendor on the vendor portal
- **Expected.** No validation status or errors shown.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-I` · ui · `app/controllers/concerns/companies_controller_helper.rb:713 (workspace.id == company.id → nil)`

#### API-XREV-I-05 — QA APIs blocked on production
- **Why it matters.** Guide I-05 (Dev). Finding REV-01 (Critical): The QA revalidation API is open to every client super admin, for every client, and is no longer blocked on production.
- **Setup.** Not run unattended (code): never called against production; proved from the code
- **Steps.** 1. call the production base with an employee token
- **Expected.** Code 5 'Not authorized'.
- **Oracle.** —
- **Trace.** P1 · automate-later · `API-XREV-I` · code · `app/controllers/api/vendor_revalidation_qa_controller.rb:103-106 — the Rails.env.production? guard was removed in eaf002de08 and routes.rb:695-701 has none` · `REV-01`

#### API-XREV-I-06 — No Slack or Sentry noise
- **Why it matters.** Guide I-06 (Dev). Finding REV-13 (Low): Revalidation still reports to Sentry.
- **Setup.** Not run unattended (code): needs Sentry access; from the code two paths still report to Sentry
- **Steps.** 1. run with many failures
- **Expected.** No revalidation alerts in Slack or Sentry.
- **Oracle.** —
- **Trace.** P1 · automate-later · `API-XREV-I` · code · `app/workers/vendor_revalidation/scheduler_worker.rb:22-23 (Sentry on a client's start failure), lib/external_api/validation.rb:251 (Sentry on UNEXPECTED in revalidation)` · `REV-13`

#### API-XREV-I-07 — Breaker events logged
- **Why it matters.** Guide I-07 (Dev).
- **Setup.** Not run unattended (dev): needs app logs
- **Steps.** 1. during F-02
- **Expected.** breaker_opened and breaker_closed lines with provider name.
- **Oracle.** —
- **Trace.** P3 · manual · `API-XREV-I` · dev · `app/services/vendor_revalidation/provider_guard.rb:47-80`

#### API-XREV-I-08 — Onboarding messages unchanged
- **Why it matters.** Guide I-08 (Manual).
- **Setup.** Not run unattended (manual): needs a person filling onboarding
- **Steps.** 1. new vendor fills onboarding v2 with bad GST / PAN / bank
- **Expected.** Same error messages as before this release.
- **Oracle.** —
- **Trace.** P1 · manual · `API-XREV-I` · manual · `lib/external_api/validation.rb:240 (onboarding path unchanged)`

#### API-XREV-I-09 — Onboarding still alerts and retries as before
- **Why it matters.** Guide I-09 (Dev).
- **Setup.** Not run unattended (dev): needs a provider failure
- **Steps.** 1. dev makes a provider fail once during onboarding
- **Expected.** Onboarding retries and alerts as before.
- **Oracle.** —
- **Trace.** P2 · manual · `API-XREV-I` · dev · `lib/external_api/validation.rb:243-260`

#### API-XREV-I-10 — Rollback
- **Why it matters.** Guide I-10 (API+UI).
- **Setup.** Needs VR_QA_TOKEN (Procol employee). The config is saved before and put back after; no provider is called.
- **Steps.** 1. PUT enabled false 2. GET config, the listing, row counts, link statuses 3. restore
- **Expected.** enabled false; listing drops the columns; old rows kept; every vendor's link status unchanged.
- **Oracle.** The QA API's reply (status, error code, message) and GET /config afterwards.
- **Trace.** P1 · automate · `API-XREV-I` · config (token) · `app/models/company.rb:925-927, app/controllers/api/companies_controller.rb:341`

## 10. Audit of the runs already recorded

SELECT-only checks on the client's latest real run — they need no token and change nothing, so they run every time.

#### API-XREV-R-01 — Run ids follow the documented formula
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. every run of the client
- **Expected.** run_id = uuid v5(URL namespace, 'procol://vendor_revalidation/<client>/<date>').
- **Oracle.** The database rows (SELECT only).
- **Trace.** P2 · automate · `API-XREV-R` · audit · `app/workers/vendor_revalidation/scheduler_worker.rb:29-31`

#### API-XREV-R-02 — No document value checked twice in one run
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. group rows by run, vendor, document, value
- **Expected.** No group has more than one row.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P0 · automate · `API-XREV-R` · audit · `app/models/vendor_validation_history.rb:36, app/services/vendor_revalidation/vendor_check_service.rb:134-163`

#### API-XREV-R-03 — Every vendor's final status follows the precedence
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. vendors finished by the latest run: final status vs failed > system_error > passed > skipped over their latest rows
- **Expected.** Equal for every vendor.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P0 · automate · `API-XREV-R` · audit · `app/services/vendor_revalidation/vendor_check_service.rb:72-99, app/models/vendor_validation_history.rb:39,68-80`

#### API-XREV-R-04 — Row messages follow their status
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. latest run's rows
- **Expected.** skipped: no value, 'not provided'; passed: no error; failed: a message; system_error: 'verification is temporarily unavailable'.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-R` · audit · `app/models/vendor_validation_history.rb:37-38, app/services/vendor_revalidation/vendor_check_service.rb:208-230`

#### API-XREV-R-05 — Nothing stays pending past the sweeper
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. rows pending for more than 25 hours
- **Expected.** None.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-R` · audit · `app/workers/vendor_revalidation/sweeper_worker.rb:11-25`

#### API-XREV-R-06 — A full run covered exactly the eligible vendors
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. the config in force at the run's start (audit trail) 2. eligible vendors then vs vendors in the run
- **Expected.** None missing, none extra.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-R` · audit · `app/workers/vendor_revalidation/run_worker.rb:53-58`

#### API-XREV-R-07 — Last validated is the run's start
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. vendors finished by the latest run (made after d18f8ac4c9)
- **Expected.** Whole seconds, not after the vendor's first row.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P2 · automate · `API-XREV-R` · audit · `app/services/vendor_revalidation/vendor_check_service.rb:95`

#### API-XREV-R-08 — value_index has no gaps
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. latest run, per vendor and document
- **Expected.** 0..n-1.
- **Oracle.** The database rows (SELECT only).
- **Trace.** P3 · automate · `API-XREV-R` · audit · `app/services/vendor_revalidation/vendor_check_service.rb:134-163`

#### API-XREV-R-09 — Every finished vendor was finalised
- **Why it matters.** Added from the code (not in the guide).
- **Setup.** Runs every time: SELECTs on the runs already recorded, no request at all.
- **Steps.** 1. vendors with no pending row in the latest run
- **Expected.** Their link carries this run's id and a final status (unless a later run has rows).
- **Oracle.** The database rows (SELECT only).
- **Trace.** P1 · automate · `API-XREV-R` · audit · `app/services/vendor_revalidation/vendor_check_service.rb:72-99,116-119`
