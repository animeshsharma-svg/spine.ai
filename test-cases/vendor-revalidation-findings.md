# Vendor revalidation — findings

What the code (procol-backend rfx-uat-main @ 76b986a012 (15 Oct 2026)) and the live UAT checks say against the QA guide and the TRD. **Confirmed live** means the
platform reproduced it on UAT; **from the code** means the line is quoted and the behaviour follows from it with no
assumption, but it was not (or must not be) triggered. Each finding names the cases that cover it in
`api-vendor-revalidation.md`; the runner attaches the finding to a failing case.

| Id | Severity | Status | Finding | Cases |
| --- | --- | --- | --- | --- |
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
