# Vendor revalidation — findings

What the code (procol-backend rfx-uat-main @ 76b986a012 (15 Oct 2026)) and the live UAT checks say against the QA guide and the TRD. **Confirmed live** means the
platform reproduced it on UAT; **from the code** means the line is quoted and the behaviour follows from it with no
assumption, but it was not (or must not be) triggered. Each finding names the cases that cover it in
`api-vendor-revalidation.md`; the runner attaches the finding to a failing case.

| Id | Severity | Status | Finding | Cases |
| --- | --- | --- | --- | --- |
| REV-25 | High | confirmed live 2026-10-21 (13:02 and 13:18 IST) | A document the provider will not answer keeps the vendor 'pending' for up to 25 hours and leaves its whole status stale - and pauses that document type for every customer | B-21 |
| REV-23 | Medium | confirmed live 2026-10-21 | The Validation Status filter cannot select vendors that were never checked | H-06 |
| REV-24 | Medium | confirmed live 2026-10-21 | There is no 'Last Validated At' date filter on the vendor list | H-03, H-07, H-08 |
| REV-22 | Medium | seen in the recorded runs 2026-10-21 - confirm with dev | Attestr was asked 38 questions in one minute - above the 30-per-minute cap | F-13 |
| REV-21 | Medium | seen in the recorded runs 2026-10-21 — confirm with dev | Checks are given up as System Error after about 16-17 hours, not after the documented 24 hours | F-07 |
| REV-20 | Low | confirmed on the preview screen 2026-10-20 | The vendor page shows times as '23:00 PM' - a 24-hour clock with AM/PM added | H-09 |
| REV-19 | Critical | FIXED — deploy of 2026-10-21 ~12:00 IST; verified 12:22, 13:02 and 13:18 IST (forced runs start within 10 s) | A revalidation run that has vendors to check never starts — it stays 'scheduled' for ever | B-12, B-15, A-26 |
| REV-18 | Low | confirmed live 2026-10-20 | An impossible start date (30 Feb) is not refused; it is rolled over to the next real date | A-23 |
| REV-17 | Medium | from the code (20 Oct 2026 rewrite) | Revalidation settings are no longer checked when they are saved |  |
| REV-01 | Critical | fixed in the 20 Oct 2026 rewrite — A-30 re-checks it | A customer's admin can read and change another customer's revalidation settings, and the controls are no longer blocked on production | A-30, I-05 |
| REV-02 | High | from the code — not sent on purpose | An empty vendor scope (vendor_ids: [] or vendor_limit "") revalidates every vendor of the client | A-34 |
| REV-03 | High | from the code | Client onboarding rules (name match etc.) are never applied in revalidation | E-05, E-11 |
| REV-04 | High | confirmed live 2026-10-15 | PAN and bank account numbers are shown in full in the listing errors, the vendor page and the Excel | I-01, I-02, I-03 |
| REV-05 | Medium | to confirm live (E-08) | The PAN format pre-check accepts any text that merely contains a PAN | E-08 |
| REV-06 | Low | confirmed live 2026-10-15 | A vendor no run has checked shows 'Pending' instead of a blank status | H-02 |
| REV-07 | Low | confirmed live 2026-10-15 | Validation errors are joined with '; ' instead of one per line in the Excel | H-10 |
| REV-08 | Medium | to confirm live (F-16) | Switching revalidation off mid-run leaves the cut-off vendors with no final status | F-16 |
| REV-09 | Medium | to confirm live (B-19) | A QA trigger can delete another trigger's queued run for the same day | B-19 |
| REV-10 | Low | fixed in the 20 Oct 2026 rewrite | A QA trigger in the hour before 11 pm makes the nightly run skip the client | B-20 |
| REV-11 | Medium | to confirm live (G-17) | Removing a document type from the config hides its error lines but keeps the status it caused | G-17 |
| REV-12 | Low | product decision | A system error outranks a pass (TRD: 'unverified' never affects Pass) | G-04 |
| REV-13 | Low | from the code | Revalidation still reports to Sentry | I-06 |
| REV-14 | Medium | to confirm by audit (C-09) | Vendors of other company categories are revalidated but never shown | C-09 |
| REV-15 | Medium | confirmed live 2026-10-15 (found in passing) | GET /api/companies/vendor_detail answers 500 for every vendor |  |
| REV-16 | Low | confirmed live 2026-10-15 (found in passing) | rfx-uat-api answers errors with the full Rails debug page |  |


## REV-25 — A document the provider will not answer keeps the vendor 'pending' for up to 25 hours and leaves its whole status stale - and pauses that document type for every customer

**Severity** High · **Status** confirmed live 2026-10-21 (13:02 and 13:18 IST) · **Cases** B-21

Forced run for vendors 70959, 47168, 56616 at 13:02 IST and again (scheduled) at 13:18 IST on 21 Oct: GST, MSME and bank rows of all three finished within seconds, but vendor 70959's PAN row (QATZQ0568Q, a well-formed test PAN nobody holds) stayed 'pending' - one retry 5 minutes later (13:07:47, then 13:23:54) and nothing since. Because of that one row the run reports complete=false, and the vendor's overall status and last-validated time are never written: its page and the list still show the 15 Oct answers (vendor page screenshot vendor-page-revalidation-force-70959-stuck.png). The same PAN ended the 15 Oct night run as 'verification is temporarily unavailable' 16 hours later (REV-21). A real PAN of another vendor passed at 12:22 the same day, so the PAN provider itself is up. In the code (provider_guard.rb) the provider's answer for this PAN is classed as a breaker error (provider_down / auth_failed / rate_limited, not 'invalid'); five of those open a circuit breaker that is shared by all customers - 15 minutes, doubling after each failed probe up to 24 hours - and while it is open every PAN row of every customer waits; rows are only given up as System Error at the run's 24-hour deadline (+1 hour sweeper).

**Evidence.** vendor_validation_histories rows 4420-4423 (run 2a967c9c…, vendor 70959): PAN status pending, last_run_at 13:07:47 then 13:23:54 IST; buyer_seller_company_mappings 70959 vendor_last_validated_at still 2026-10-15 17:30 UTC; GET /runs ... complete=false with by_status pending 1 (reval-force/report.json).

**Suggested fix.** (1) Dev to read the log lines 'Vendor revalidation pan <error_type>' / 'breaker_opened provider=... reason=...' at 13:02:47 and 13:07:47 IST on 21 Oct: if the provider answers a nonexistent PAN with an error code, classify it as invalid (row Failed) instead of provider-down, so one bad PAN cannot open the breaker. (2) A forced run for named vendors should not wait behind the breaker for a day: give those rows a short deadline (for example 30 minutes) and then close them as System Error so the vendor's status and last-validated time are written. (3) On the vendor page show that a check is in progress ('Pending since 13:02') instead of the previous run's answers.


## REV-23 — The Validation Status filter cannot select vendors that were never checked

**Severity** Medium · **Status** confirmed live 2026-10-21 · **Cases** H-06

The vendor list's filter options (GET /companies/filter_options) offer Validation Status with Passed, Failed, Skipped and System Error only. A vendor no run has checked shows 'Pending' in the column (REV-06) but there is no 'Pending' / 'Not checked' choice, so a buyer cannot list the vendors still waiting for a check - the one list they need before a go-live. The backend already maps a 'pending' value to NULL (companies_controller_filter_helper.rb filter_by_bsm_column), so only the option is missing.

**Evidence.** GET /api/companies/filter_options?tab=verified -> vendor_validation_status.options = passed, failed, skipped, system_error (21 Oct 2026).

**Suggested fix.** Add a 'Not checked yet' option (value pending) to the vendor_validation_status filter options.


## REV-24 — There is no 'Last Validated At' date filter on the vendor list

**Severity** Medium · **Status** confirmed live 2026-10-21 · **Cases** H-03, H-07, H-08

The guide (and the TRD) describe a last-validated date-range filter next to the status filter. Neither the backend's filter options nor the preview dashboard's filter panel has one; the column is shown but cannot be filtered. Three guide cases (H-03, H-07, part of H-08) have nothing to run against.

**Evidence.** GET /api/companies/filter_options?tab=verified lists no date filter; the preview's filter panel shows Teams, Deals In, City, Tags, Type, Onboarding Status, Country, Initiated By, PAN No, Validation Status (screenshot filter-panel.png).

**Suggested fix.** Add a date-range filter on buyer_seller_company_mappings.vendor_last_validated_at (bsm_column source) and show it in the panel.


## REV-22 — Attestr was asked 38 questions in one minute - above the 30-per-minute cap

**Severity** Medium · **Status** seen in the recorded runs 2026-10-21 - confirm with dev · **Cases** F-13

In the 14 Oct run (the first run ever, so the 24-hour answer cache was empty) 38 PAN/MSME/bank rows got their provider answer within the minute of 13:07 UTC (18:37 IST), and 105 rows of all kinds in the next minute. The engine is meant to keep each provider at 30 calls per minute (ProviderGuard RATE_LIMIT_PER_MINUTE) and the run worker spreads vendor jobs at that rate; a burst above it risks the provider's own rate limit, which then opens the breaker for everyone.

**Evidence.** vendor_validation_histories: passed rows grouped by provider and minute of last_run_at (query in the F-13 audit).

**Suggested fix.** Dev to compare with the provider's request log for 13:07-13:08 UTC on 14 Oct; if real, make the guard count calls across all Attestr document types (they share one host) and keep the spread in RunWorker aligned with it.


## REV-21 — Checks are given up as System Error after about 16-17 hours, not after the documented 24 hours

**Severity** Medium · **Status** seen in the recorded runs 2026-10-21 — confirm with dev · **Cases** F-07

In both recorded GMMCO runs, every row that ended as System Error ('verification is temporarily unavailable') was closed in the same two-minute window: 16.1 h after the start of the 15 Oct run (started 23:00 IST, closed 15:06-15:08 IST next day) and 17.2 h after the start of the 14 Oct run (started 18:36 IST, closed 11:47-11:49 IST next day). The guide and the code say rows get 24 hours (plus a 1-hour grace for the cleaner). Two different durations in one two-minute window each time looks like a batch close by something other than the per-row deadline - a Sidekiq restart or a deploy at that time, or the vendor job's retries running out (VendorWorker retry: 3 then close_pending! 'retries_exhausted').

**Evidence.** vendor_validation_histories: status 4 rows per run, last_run_at minus the run's first created_at (query in the F-07 audit).

**Suggested fix.** Dev to check the Sidekiq logs at 15:07 IST on 16 Oct and 11:48 IST on 15 Oct for rows_closed reason= lines; if the close came from a restart or retries, make the deadline the only thing that gives up a row.


## REV-20 — The vendor page shows times as '23:00 PM' - a 24-hour clock with AM/PM added

**Severity** Low · **Status** confirmed on the preview screen 2026-10-20 · **Cases** H-09

On the vendor page's Revalidation Details card, 'Last validated' and 'Last Run At' read '15-Oct-2026 23:00 PM' and '16-Oct-2026 15:07 PM'. The vendor list shows the same moment as 'October 15, 2026 11:00 PM', so the two screens disagree and the card's format is wrong either way.

**Evidence.** https://client-feat-vendor-revalidation-details.preview.procol.tech/vendors/RGtwWkRr?tab=info, Revalidation Details card (screenshot vendor-page-revalidation-passed.png).

**Suggested fix.** Use one date format on both screens (revalidationDetails.jsx / columns.jsx use appFormatDate with DATE_KIND.DATE_TIME).


## REV-19 — A revalidation run that has vendors to check never starts — it stays 'scheduled' for ever

**Severity** Critical · **Status** FIXED — deploy of 2026-10-21 ~12:00 IST; verified 12:22, 13:02 and 13:18 IST (forced runs start within 10 s) · **Cases** B-12, B-15, A-26

Since the 20 Oct rewrite, POST /api/vendor_validation/trigger answers 200 with a job id, but the run never begins: GET /runs/<run_id>?job_id= keeps saying state 'scheduled', no row is created and no vendor is checked. Seen six times on GMMCO - 20 Oct 20:01, 20:06, 20:16, 20:55, 21:0x and 21 Oct 00:05 IST - for a forced run with no start time, a forced run with run_at 20 s in the past, a run scheduled 2 minutes ahead and a run for a vendor of another company; each watched for 2 to 15 minutes. A scheduler-mode run with nothing due DID finish (state 'nothing_due'), so the TriggerWorker job is picked up from the batch_low queue and dies only in the part that runs when there is work: TriggerService#call after due_doc_types - the reset step (delete rows of the run date, clear the vendors' status, delete Redis locks, walk every Sidekiq queue plus the scheduled and retry sets in delete_jobs) and then RunWorker.perform_async. The worker has retry: false, so the failure is silent: no retry, nothing written to the job state, and the API keeps answering 'scheduled' for 7 days. The database shows the symptom too: no row dated 20 or 21 Oct exists for GMMCO although six runs were accepted. Nothing from outside can tell which line raises; the Sidekiq Dead set (jobs with retry off land there) and the log lines for VendorRevalidation::TriggerWorker at those times will.

**Evidence.** Runs 2d448f72-dbf3-5e99-b78e-facd11f966d5 (20 Oct; jobs 1ceeac833123d7ae8b151d9e, e2bfc669fb5b7d6fd79aa360, 336d40bacccec22600527906 and B-12/B-15's) and 2a967c9c-5381-5ca5-98f6-76da20080e38 (21 Oct 00:05, job 3b6c30e5da1a991a78f47e89): state 'scheduled', total_rows 0 throughout; vendor_validation_histories has no row dated 2026-10-20 or 2026-10-21 for client 47053.

**Suggested fix.** Open Sidekiq's Dead tab on UAT and the logs around the times above for VendorRevalidation::TriggerWorker; fix the raise (most likely in TriggerService#reset / delete_jobs); and in TriggerService#call wrap the work in a rescue that saves state 'failed' with the error message, so a buyer is never told 'scheduled' for ever.


## REV-18 — An impossible start date (30 Feb) is not refused; it is rolled over to the next real date

**Severity** Low · **Status** confirmed live 2026-10-20 · **Cases** A-23

run_at is read with Time.zone.parse, which does not reject impossible calendar dates: 2026-02-30T10:00:00 becomes 2 Mar 2026 and is then refused as 'run_at is in the past' instead of 'run_at must be a time like …'. A future impossible date (e.g. 2026-11-31) would be accepted and the run scheduled for 1 Dec.

**Evidence.** POST /api/vendor_validation/trigger?workspace_id=47053 with run_at 2026-02-30T10:00:00 → 422 code 8 'run_at is in the past' (A-23, 20 Oct 2026 20:0x IST).

**Suggested fix.** Parse run_at strictly (Time.iso8601 or Date.valid_date? on the date part) and refuse impossible dates with the 'must be a time like' message.


## REV-17 — Revalidation settings are no longer checked when they are saved

**Severity** Medium · **Status** from the code (20 Oct 2026 rewrite) · **Cases** 

The rewrite deleted the settings API together with all its checks (enabled must be true/false, known statuses, known document types, frequency, start date, paths). Settings are now saved by Procol ops through the general custom-configuration screen, which does not know these rules. A wrong value is accepted silently; the nightly scheduler then skips that document type and only writes a config_error log line, so the customer's vendors are simply not re-checked.

**Evidence.** app/controllers/api/vendor_revalidation_qa_controller.rb (config_error) deleted in 0f365a7e52; scheduler_worker.rb due? only logs settings_error.

**Suggested fix.** Validate vendor_revalidation_config wherever it is saved (move the old config_error rules into a CustomConfiguration validation).


## REV-01 — A customer's admin can read and change another customer's revalidation settings, and the controls are no longer blocked on production

**Severity** Critical · **Status** fixed in the 20 Oct 2026 rewrite — A-30 re-checks it · **Cases** A-30, I-05

Client super admins are allowed on purpose (product decision: they may run their own revalidation). But the controls never check WHICH customer is asked for: set_client takes any client_company_id, and run_status / cancel take no customer at all. GMMCO's super admin got 200 and PROCOL DEMO's settings; the same login can change any customer's settings and start paid provider checks for any customer's vendors. Commit eaf002de08 ('access', 15 Oct) also removed the Rails.env.production? block, and routes.rb has none, so this is open on production once released.

**Evidence.** GET /api/vendor_revalidation_qa/config?client_company_id=198678 with GMMCO user 20030's session → 200 with PROCOL DEMO's settings (A-30).

**Suggested fix.** Let a client super admin act only on their own customer (compare client_company_id with the caller's workspace; scope run_status and cancel the same way). Restore the production block or replace it with this ownership check.


## REV-02 — An empty vendor scope (vendor_ids: [] or vendor_limit "") revalidates every vendor of the client

**Severity** High · **Status** from the code — not sent on purpose · **Cases** A-34

The trigger still treats a blank vendor_ids / vendor_limit as 'no scope' and checks every vendor of the company against the paid providers — and since the 20 Oct rewrite any buyer allowed to edit vendors can send it, from the product's own API.

**Evidence.** vendor_validation_controller.rb parse_vendor_scope; trigger_service.rb select_vendors (@ a717f107ce).

**Suggested fix.** Refuse an explicitly empty vendor_ids / blank vendor_limit ('vendor_ids must not be empty'); require mode force without scope to say so (e.g. all_vendors: true).


## REV-03 — Client onboarding rules (name match etc.) are never applied in revalidation

**Severity** High · **Status** from the code · **Cases** E-05, E-11

ExternalApi::Validation#request_external_api returns revalidation_result before apply_response_rules (validation.rb:238-240), so a GST / bank registered to a different legal name passes revalidation although onboarding v2 would fail it. The guide (and the config reference) say form paths apply client rules.

**Evidence.** lib/external_api/validation.rb:238-240 @ 76b986a012.

**Suggested fix.** Apply the client's response rules for form-path values before revalidation_result, or document that revalidation is provider-only.


## REV-04 — PAN and bank account numbers are shown in full in the listing errors, the vendor page and the Excel

**Severity** High · **Status** confirmed live 2026-10-15 · **Cases** I-01, I-02, I-03

errors_by_vendor writes '<DOC> <value>: <message>' with the raw value, documents returns value: row.value, and the history stores it unmasked. The TRD requires masking in the table, listing, detail and download.

**Evidence.** Listing errors 'PAN SHII789JSJ: PAN input is incorrect' (vendor 47168) and 'BANK 12345678901 / QATZ0100070: Invalid IFSC code' (71696); GET /api/companies/54927 revalidation_data shows PAN AAFCP8182N and bank 004805022068 / ICIC0000048 in full (I-01, I-02, I-03). Code: app/models/vendor_validation_history.rb:53,62.

**Suggested fix.** Mask PAN and account numbers (keep the last 4) when building error lines and documents.


## REV-05 — The PAN format pre-check accepts any text that merely contains a PAN

**Severity** Medium · **Status** to confirm live (E-08) · **Cases** E-08

precheck does `value.to_s.match(regex)` and the PAN regex in validation_types is `[A-Z]{5}[0-9]{4}[A-Z]{1}` without ^ and $. A GSTIN in a PAN field passes the pre-check and goes to the provider (a paid call) instead of failing 'PAN input is incorrect'.

**Evidence.** lib/external_api/validation.rb:74; validation_types id 1 required_data.

**Suggested fix.** Anchor the regex (\A…\z) or use match? with anchors in precheck.


## REV-06 — A vendor no run has checked shows 'Pending' instead of a blank status

**Severity** Low · **Status** confirmed live 2026-10-15 · **Cases** H-02

vendor_validation_values_for labels a nil status as 'Pending'. The guide expects blank; a buyer reads 'Pending' as 'a check is running'.

**Evidence.** Vendor 72118 (invited, never checked) shows vendor_validation_status 'Pending' on the unverified tab (H-02). Code: companies_controller_helper.rb:702.

**Suggested fix.** Show blank (or 'Not checked') for a nil status; keep 'Pending' for rows really waiting.


## REV-07 — Validation errors are joined with '; ' instead of one per line in the Excel

**Severity** Low · **Status** confirmed live 2026-10-15 · **Cases** H-10

The same joined string feeds the listing and the Excel download.

**Evidence.** GMMCO verified-tab Excel: 22 cells with errors joined by '; ' (H-10). Code: companies_controller_helper.rb:705.

**Suggested fix.** Join with a newline for the Excel cell.


## REV-08 — Switching revalidation off mid-run leaves the cut-off vendors with no final status

**Severity** Medium · **Status** to confirm live (F-16) · **Cases** F-16

VendorCheckService closes the remaining rows as system_error, but finalize returns early when the client is disabled — and a QA trigger has already cleared the vendor's status — so those vendors show 'Pending' with no result.

**Evidence.** vendor_check_service.rb:26-30,73-74.

**Suggested fix.** Finalize the closed vendors (or keep their previous status) when closing for 'disabled'.


## REV-09 — A QA trigger can delete another trigger's queued run for the same day

**Severity** Medium · **Status** to confirm live (B-19) · **Cases** B-19

QaTriggerWorker#delete_jobs deletes every queued RunWorker job of the run id, not only the chosen vendors', so two triggers firing together (or in quick succession) can drop the first one's run: its state says started and complete never comes.

**Evidence.** qa_trigger_worker.rb:113-124.

**Suggested fix.** Delete only RunWorker jobs whose only_vendor_ids overlap the chosen vendors.


## REV-10 — A QA trigger in the hour before 11 pm makes the nightly run skip the client

**Severity** Low · **Status** fixed in the 20 Oct 2026 rewrite · **Cases** B-20

The QA trigger sets the nightly claim key for its run date (nx, 1 hour). start_run then finds the claim taken and returns.

**Evidence.** qa_trigger_worker.rb:39, scheduler_worker.rb:82.

**Suggested fix.** Use a separate key for QA triggers.


## REV-11 — Removing a document type from the config hides its error lines but keeps the status it caused

**Severity** Medium · **Status** to confirm live (G-17) · **Cases** G-17

Error lines are read only for configured types; the stored final status is not recomputed until the vendor's next run. A vendor can show Failed with no reason.

**Evidence.** vendor_validation_history.rb:47-56 vs vendor_check_service.rb:72-99.

**Suggested fix.** Recompute the final status from configured types when reading, or on config change.


## REV-12 — A system error outranks a pass (TRD: 'unverified' never affects Pass)

**Severity** Low · **Status** product decision · **Cases** G-04

STATUS_PRECEDENCE is failed > system_error > passed > skipped. A vendor with every document passed but one provider timeout shows System Error.

**Evidence.** vendor_validation_history.rb:39.

**Suggested fix.** Confirm with product; if the TRD stands, rank system_error below passed.


## REV-13 — Revalidation still reports to Sentry

**Severity** Low · **Status** from the code · **Cases** I-06

SchedulerWorker#perform captures a client's start failure and validation.rb captures UNEXPECTED errors on the revalidation path. The guide says nothing goes to Slack or Sentry.

**Evidence.** scheduler_worker.rb:22-23, validation.rb:251.

**Suggested fix.** Log only, or tag and mute revalidation events.


## REV-14 — Vendors of other company categories are revalidated but never shown

**Severity** Medium · **Status** to confirm by audit (C-09) · **Cases** C-09

d18f8ac4c9 dropped the selling_firm / brokerage / subsidiary filter from RunWorker.vendor_ids_for, while the listing still keeps only those categories. Their results (and provider calls) are invisible to the buyer.

**Evidence.** run_worker.rb:53-58 vs companies_controller.rb:346.

**Suggested fix.** Keep the category filter in vendor_ids_for, or show those vendors.


## REV-15 — GET /api/companies/vendor_detail answers 500 for every vendor

**Severity** Medium · **Status** confirmed live 2026-10-15 (found in passing) · **Cases** 

NoMethodError: undefined method `integration_status' for Company, raised in app/serializers/base_serializer.rb:18 from companies_controller.rb:561. Seen on rfx-uat-api and sec-api-v1 for GMMCO vendors 54927 and 47168 — older than revalidation, but any screen that uses vendor_detail is broken. (The vendor page's revalidation details come from GET /api/companies/:id, which works.)

**Evidence.** GET /api/companies/vendor_detail?company_id=54927 → 500 on both hosts (15 Oct 2026, 21:45 IST).

**Suggested fix.** Stop serializing integration_status from Company (it is a buyer_seller_company_mappings column), or pass the mapping.


## REV-16 — rfx-uat-api answers errors with the full Rails debug page

**Severity** Low · **Status** confirmed live 2026-10-15 (found in passing) · **Cases** 

The 500 above came back as the 'Action Controller: Exception caught' HTML page with the exception, the stack and an inspect of the Company record (name, address, email). sec-api-v1 answers the same error as {"status":500}. On a UAT host reachable from the internet this exposes code paths and vendor data.

**Evidence.** GET /api/companies/vendor_detail?company_id=54927 on rfx-uat-api.ag-ri.in.

**Suggested fix.** Set consider_all_requests_local = false (and show_exceptions) on the rfx UAT environment.
