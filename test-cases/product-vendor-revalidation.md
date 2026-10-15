# Vendor revalidation — manual test cases

The 143 manual cases from `test-cases/Vendor_Revalidation_Test_Cases.xlsx` (also Part 3 of the QA guide), in
plain language for a person to run on screen. They were written against TRD v1; where they differ from the UAT build the
automation catalog (`api-vendor-revalidation.md`) and the guide win: the build calls "unverified" `system_error` and
ranks it above passed, checks only vendors whose link status is in `vendor_statuses`, allows a `one_time` cycle, shows a
never-checked vendor as "Pending" and joins errors with "; ". Ids are `PRD-VREV-nnn` = `VR_TC_nnn`.

## 1. 1. Revalidation Settings

#### PRD-VREV-001 — No revalidation happens when it is OFF for the client
- **Why it matters.** Disabled client — Negative case from the manual sheet.
- **Setup.** Revalidation is OFF for the client (default for every client). Test data: Any client with revalidation OFF.
- **Steps.** 1. Ask dev to run the scheduler for the day 2. Login as the client's buyer and open Vendors listing 3. Open any vendor detail page
- **Expected.** No run for this client. No validation columns or filters in listing. Vendor detail has no validation section.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_001`

#### PRD-VREV-002 — Excel bulk download has no validation columns when revalidation is OFF
- **Why it matters.** Disabled client — Negative case from the manual sheet.
- **Setup.** Revalidation OFF for the client.
- **Steps.** 1. Login as buyer 2. Vendors listing > Bulk download (Excel) 3. Open the file
- **Expected.** Validation Status and Validation Errors columns are not in the file.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_002`

#### PRD-VREV-003 — Switching revalidation OFF stops new runs and does not touch vendor onboarding state
- **Why it matters.** Rollback — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. At least 1 run done. Then ops switch it OFF.
- **Steps.** 1. Note onboarding state of 3 vendors (approved / in review / blacklisted) 2. Ops switch revalidation OFF 3. Ask dev to run scheduler on the next due date 4. Check listing and the 3 vendors
- **Expected.** No new run. Onboarding state of all 3 vendors is unchanged. Columns stop updating / are hidden.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_003`

#### PRD-VREV-004 — A client not on vendor onboarding v2 is not picked up even if config is ON
- **Why it matters.** Not on onboarding v2 — Negative case from the manual sheet.
- **Setup.** Client X has revalidation config ON but does not use onboarding v2. Test data: Client X.
- **Steps.** 1. Ask dev to run scheduler 2. Check app logs
- **Expected.** No run for client X.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_004`

#### PRD-VREV-005 — A document type removed from config gets no new rows
- **Why it matters.** Doc type removed — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops with GST, PAN, MSME, Bank. One run done. Ops remove MSME.
- **Steps.** 1. Ask dev to run on the next GST/PAN due date 2. Ask dev to share the vendor's revalidation rows for this run 3. Login as Gmmco buyer and go to Vendors listing 4. Search the vendor by name 5. Open the vendor detail page and check the validation section
- **Expected.** No MSME rows in the new run. MSME drops out of the vendor's latest checks at the next run (not shown in detail any more). Old MSME rows stay in history.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_005`

#### PRD-VREV-006 — A newly added document type first runs on its own start date
- **Why it matters.** Doc type added — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops with GST, PAN. Ops add MSME with start date = 3 days later.
- **Steps.** 1. Ask dev to run scheduler today and on the MSME start date 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** No MSME check before its start date. MSME rows appear on the start date run.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_006`

#### PRD-VREV-007 — Other document types (VAT, CIN, FSSAI, TAN) can be added through config
- **Why it matters.** Other doc types — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Ops add CIN (or FSSAI) for Gmmco with a start date. Test data: Vendor with valid CIN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** CIN is checked with the existing engine and shown like the other document types.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_007`

#### PRD-VREV-008 — Revalidation runs for a client once enabled
- **Why it matters.** Enabled client — Positive case from the manual sheet.
- **Setup.** Ops enable revalidation for Gmmco with GST, PAN, MSME, Bank, start date = today. Test data: Gmmco (47053).
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Run happens. Validation columns appear and are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_008`

## 2. 2. Schedule / Cycles

#### PRD-VREV-009 — No run starts when no document type is due
- **Why it matters.** Not due — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST quarterly from 1 Oct, PAN yearly from 1 Oct. Today 15 Oct.
- **Steps.** 1. Ask dev to run the scheduler for 15 Oct 2. Check app logs 3. Login as Gmmco buyer and go to Vendors listing 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** No run for Gmmco. Last Validated does not change.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_009`

#### PRD-VREV-010 — The same run is not started twice on one date
- **Why it matters.** Duplicate — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST due today.
- **Steps.** 1. Ask dev to trigger the scheduler for today 2. Trigger it again for the same date 3. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** Only one run. Each vendor has one GST row per GST number for today, no duplicates.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_010`

#### PRD-VREV-011 — No new run starts while the previous run of the client is still going
- **Why it matters.** Overlap — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A run is still in progress (vendors waiting on provider) when the next document type is due.
- **Steps.** 1. Ask dev to trigger the next due run while the old one is running 2. Check app logs
- **Expected.** No new run that night. It is picked up by the 2-day catch-up once the old run is done.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_011`

#### PRD-VREV-012 — A due date missed more than 2 days back is not caught up
- **Why it matters.** Catch-up — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST was due 3 days ago and the scheduler did not run.
- **Steps.** 1. Ask dev to run scheduler today 2. Check app logs
- **Expected.** The 3-day-old due date is not caught up (only last 2 days are).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_012`

#### PRD-VREV-013 — A one-off date cannot be used as a schedule
- **Why it matters.** One-off dates — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Ask ops to try setting a specific one-time date for MSME.
- **Steps.** 1. Ask ops / dev to save such a config
- **Expected.** Not supported. Every document type needs a repeating cycle (monthly / quarterly / six-monthly / yearly) and a start date.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_013`

#### PRD-VREV-014 — Start date 31st runs on the last day of a 30-day month
- **Why it matters.** Month end — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 31 Oct 2026.
- **Steps.** 1. Ask dev to run scheduler for 30 Nov and 1 Dec 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** Run on 30 Nov. Not on 1 Dec, not skipped.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_014`

#### PRD-VREV-015 — Start date 30th/31st runs on 28 Feb in a non-leap year
- **Why it matters.** Month end — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 30 Jan 2027.
- **Steps.** 1. Ask dev to run scheduler for 28 Feb 2027 and 1 Mar 2027
- **Expected.** Run on 28 Feb 2027. March run is back on 30 Mar.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_015`

#### PRD-VREV-016 — Start date 29th runs on 29 Feb in a leap year
- **Why it matters.** Month end — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 29 Jan 2028.
- **Steps.** 1. Ask dev to run scheduler for 29 Feb 2028
- **Expected.** Run on 29 Feb 2028.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_016`

#### PRD-VREV-017 — The month-end shift does not drift later runs
- **Why it matters.** Month end — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 31 Jan.
- **Steps.** 1. Ask dev for the next run dates / run them
- **Expected.** Runs on 28/29 Feb, 31 Mar, 30 Apr, 31 May. Goes back to 31 when the month has it.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_017`

#### PRD-VREV-018 — A missed due date is caught up the next night
- **Why it matters.** Catch-up — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST due yesterday, scheduler was down.
- **Steps.** 1. Ask dev to run scheduler today 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** Yesterday's GST run happens today.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_018`

#### PRD-VREV-019 — The start date itself is a run date
- **Why it matters.** Start date — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST quarterly, start date = today.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Run happens on the start date itself.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_019`

#### PRD-VREV-020 — Monthly cycle runs every 1 month(s) on the same day
- **Why it matters.** Cycles — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST monthly, start 10 Oct 2026.
- **Steps.** 1. Ask dev to check / run the next 2 due dates
- **Expected.** Runs on 10 Oct 2026, then every 1 month(s) on the 10th. Nothing in between.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_020`

#### PRD-VREV-021 — Quarterly cycle runs every 3 month(s) on the same day
- **Why it matters.** Cycles — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST quarterly, start 10 Oct 2026.
- **Steps.** 1. Ask dev to check / run the next 2 due dates
- **Expected.** Runs on 10 Oct 2026, then every 3 month(s) on the 10th. Nothing in between.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_021`

#### PRD-VREV-022 — Six-monthly cycle runs every 6 month(s) on the same day
- **Why it matters.** Cycles — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST six-monthly, start 10 Oct 2026.
- **Steps.** 1. Ask dev to check / run the next 2 due dates
- **Expected.** Runs on 10 Oct 2026, then every 6 month(s) on the 10th. Nothing in between.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_022`

#### PRD-VREV-023 — Yearly cycle runs every 12 month(s) on the same day
- **Why it matters.** Cycles — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST yearly, start 10 Oct 2026.
- **Steps.** 1. Ask dev to check / run the next 2 due dates
- **Expected.** Runs on 10 Oct 2026, then every 12 month(s) on the 10th. Nothing in between.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_023`

#### PRD-VREV-024 — Each document type follows its own cycle
- **Why it matters.** Own cycle — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST quarterly, PAN yearly, both from 1 Oct.
- **Steps.** 1. Ask dev to run on 1 Jan 2027 2. Ask dev to share the vendor's revalidation rows for this run 3. Open the vendor detail page and check the validation section
- **Expected.** On 1 Jan only GST rows are created. PAN shows its older latest row (from 1 Oct).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_024`

#### PRD-VREV-025 — Document types due on the same date run together in one run
- **Why it matters.** Same day — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST and PAN both due today.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check app logs 3. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** One run for Gmmco today covering GST and PAN.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_025`

#### PRD-VREV-026 — The run starts at 11 pm IST
- **Why it matters.** Run time — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST due today.
- **Steps.** 1. Do not trigger manually, wait for the scheduled run 2. Check start time in app logs
- **Expected.** Starts at 11 pm IST (not 11 pm UTC).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_026`

## 3. 3. Vendor Coverage

#### PRD-VREV-027 — A vendor unlinked from the client is left out of later runs
- **Why it matters.** Unlinked — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor X validated in the last run, then unlinked from Gmmco. Test data: Vendor X.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** No new rows for vendor X. Its old rows stay.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_027`

#### PRD-VREV-028 — A vendor state change during the run has no effect
- **Why it matters.** State change mid run — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run in progress. Test data: Approve a vendor that is in review during the run.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Approve the vendor while the run is going 3. Check the vendor after the run
- **Expected.** Vendor still validated. Revalidation does not change its onboarding state.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_028`

#### PRD-VREV-029 — A vendor in Approved state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in Approved state with GST and PAN. Test data: Approved vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_029`

#### PRD-VREV-030 — A vendor in In progress state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in In progress state with GST and PAN. Test data: In progress vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_030`

#### PRD-VREV-031 — A vendor in In review state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in In review state with GST and PAN. Test data: In review vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_031`

#### PRD-VREV-032 — A vendor in In approval state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in In approval state with GST and PAN. Test data: In approval vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_032`

#### PRD-VREV-033 — A vendor in Rejected state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in Rejected state with GST and PAN. Test data: Rejected vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_033`

#### PRD-VREV-034 — A vendor in Invited state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in Invited state with GST and PAN. Test data: Invited vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_034`

#### PRD-VREV-035 — A vendor in Blacklisted state is revalidated
- **Why it matters.** Any state — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. A vendor in Blacklisted state with GST and PAN. Test data: Blacklisted vendor.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Open the tab where the vendor is listed 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is validated and the columns are filled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_035`

#### PRD-VREV-036 — Vendors added through bulk upload are revalidated
- **Why it matters.** Bulk upload — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendors created by vendor bulk upload (values in company record / extra data). Test data: Bulk uploaded vendors.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Validated like any other vendor from whatever values they have.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_036`

#### PRD-VREV-037 — A vendor linked to 2 clients gets separate rows and separate final status per client
- **Why it matters.** Many clients — Positive case from the manual sheet.
- **Setup.** Revalidation ON for Gmmco and client B. Vendor V linked to both, with different values / rules. Test data: Vendor V.
- **Steps.** 1. Ask dev to run for both clients 2. Check vendor V in both clients' listing 3. Ask dev for rows
- **Expected.** Separate rows per client. Each client sees its own status (can be Pass in one and Fail in other).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_037`

## 4. 4. Reading Document Values

#### PRD-VREV-038 — Document is Skipped when every configured place is empty
- **Why it matters.** All paths empty — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. MSME paths: onboarding form field, then company extra data. Both empty.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 5. Open the vendor detail page and check the validation section
- **Expected.** MSME row = skipped with error "not provided". Shown under Missing Documents, not in Errors. Vendor is not Fail because of it.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_038`

#### PRD-VREV-039 — An uploaded file in the first place is treated as empty and the next place is tried
- **Why it matters.** File instead of number — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Form MSME field has only the certificate PDF. Company extra data has the MSME number.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** MSME number from company extra data is checked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_039`

#### PRD-VREV-040 — A path pointing to a field / column that does not exist is skipped and the next one is tried
- **Why it matters.** Wrong path — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Ask ops to set first PAN path to a non-existing field, second to company PAN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** No crash. PAN from the company record is checked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_040`

#### PRD-VREV-041 — Document is Skipped when all configured paths are wrong
- **Why it matters.** Wrong path — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. All PAN paths point to non-existing fields.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** PAN = skipped / missing for all vendors. Other document types still run.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_041`

#### PRD-VREV-042 — Bank on company record needs both account number and IFSC
- **Why it matters.** Bank on company record — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Form bank empty. Company extra data has account number but no IFSC.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** That bank entry counts as empty. Bank = skipped / missing (not failed).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_042`

#### PRD-VREV-043 — The vendor's submitted onboarding form is never changed
- **Why it matters.** Form untouched — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor with failed GST.
- **Steps.** 1. Note the vendor's onboarding form values 2. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 3. Open the form again
- **Expected.** Form values and onboarding state are exactly the same.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_043`

#### PRD-VREV-044 — The first place with a value wins even when a later place has a different value
- **Why it matters.** Order — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST on onboarding form = A, GST on company record = B. Test data: A valid, B invalid.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** Only GST A is checked (form comes first). Vendor not failed for B.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_044`

#### PRD-VREV-045 — Company record value is used when the form value is empty
- **Why it matters.** Order — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Form GST empty, company GST filled.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** Company GST is checked (provider check only, no name match).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_045`

#### PRD-VREV-046 — The value is read when the vendor's check runs
- **Why it matters.** Latest value — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Long run. Test data: Update vendor GST before its job runs.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Update the vendor's GST while the run is going (before its turn) 3. Open the vendor detail page and check the validation section
- **Expected.** The new GST is checked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_046`

#### PRD-VREV-047 — Value from onboarding form is checked with the client's onboarding rules (e.g. name match)
- **Why it matters.** Rules — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Form GST is valid but registered to a different name. Client has name match rule.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section 5. Compare with what onboarding v2 shows for the same GST
- **Expected.** Same result as onboarding (fails on name match if onboarding fails it).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_047`

#### PRD-VREV-048 — Value from company record runs provider check only
- **Why it matters.** Rules — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Form GST empty. Company GST valid but name differs from vendor name.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** GST = passed. No name mismatch error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_048`

## 5. 5. GST Validation

#### PRD-VREV-049 — A GST that does not exist is marked failed
- **Why it matters.** Invalid GST — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: 27ABCDE1234F1Z5.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 5. Open the vendor detail page and check the validation section
- **Expected.** Vendor = Fail. Error like "GST 27ABCDE1234F1Z5: <reason same as onboarding>".
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_049`

#### PRD-VREV-050 — GST with wrong length / format is marked failed
- **Why it matters.** Wrong format — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: 14 characters / special characters.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Fail with the onboarding GST error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_050`

#### PRD-VREV-051 — A GST cancelled after onboarding is caught
- **Why it matters.** Cancelled GST — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor passed at onboarding; GST now cancelled on GST portal. Test data: Cancelled GSTIN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 5. Cross check on GST portal
- **Expected.** Vendor = Fail. Error like "GST <no>: GST is cancelled".
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_051`

#### PRD-VREV-052 — A suspended GST gives the same result as onboarding
- **Why it matters.** Suspended GST — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Suspended GSTIN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Same result as onboarding v2 for this GST.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_052`

#### PRD-VREV-053 — Foreign vendor with non-Indian tax number in GST field
- **Why it matters.** Foreign vendor — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: e.g. GB123456789.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Fails GST format check as per TRD (open question with product - note result).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_053`

#### PRD-VREV-054 — Vendor with 2 GSTs where 1 is invalid
- **Why it matters.** Multiple GST — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor form has 2 GSTs, 1 wrong. Test data: 1 valid + 1 invalid.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run 3. Login as Gmmco buyer and go to Vendors listing 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 6. Open the vendor detail page and check the validation section
- **Expected.** 2 GST rows (one per value). Vendor = Fail. Error names only the wrong GST.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_054`

#### PRD-VREV-055 — Same GST checked for another client in last 24h is reused but client rules still applied
- **Why it matters.** 24h reuse — Edge case from the manual sheet.
- **Setup.** Client B checked the same GST few hours ago (same provider). Test data: Common GSTIN.
- **Steps.** 1. Ask dev to run Gmmco 2. Check logs
- **Expected.** Provider not called again. Gmmco's own rules applied. Row counted / billed for Gmmco too.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_055`

#### PRD-VREV-056 — Same GST present on many Gmmco vendors
- **Why it matters.** Same GST many vendors — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Same GST on 5 different Gmmco vendors (UAT has 20 GSTs on 81 vendors).
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run 3. Login as Gmmco buyer and go to Vendors listing
- **Expected.** Each vendor gets its own row and status. Note billing count (open question with product).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_056`

#### PRD-VREV-057 — The client's own GST provider is used (Masters India or Attestr)
- **Why it matters.** Provider per client — Positive case from the manual sheet.
- **Setup.** Gmmco on one GST provider, client B on the other.
- **Steps.** 1. Ask dev to run both 2. Check app logs for provider called
- **Expected.** Each client's GST goes to its own provider.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_057`

#### PRD-VREV-058 — Active valid GST is passed
- **Why it matters.** Valid GST — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Active GSTIN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 5. Open the vendor detail page and check the validation section
- **Expected.** GST row = passed. Vendor Pass (if nothing else failed).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_058`

#### PRD-VREV-059 — Vendor who corrects GST is passed in the next GST run
- **Why it matters.** Fixed GST — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor failed on GST last run, then corrected GST.
- **Steps.** 1. Next GST due run 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** GST passed. Error removed. Vendor Pass.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_059`

## 6. 6. PAN Validation

#### PRD-VREV-060 — A PAN that does not exist is marked failed
- **Why it matters.** Invalid PAN — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: ABCDE1234Z.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor = Fail. PAN masked in error, e.g. "PAN ******234Z: ...".
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_060`

#### PRD-VREV-061 — PAN with wrong format is failed
- **Why it matters.** Wrong format — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: 12345ABCDE / ABCD1234.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Fail with the onboarding PAN error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_061`

#### PRD-VREV-062 — Inoperative PAN gives the same result as onboarding
- **Why it matters.** Inoperative PAN — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Inoperative PAN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Same result as onboarding v2.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_062`

#### PRD-VREV-063 — PAN from company extra data (bulk upload) is checked when form and company PAN are empty
- **Why it matters.** PAN from extra data — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. PAN paths: form, company, company extra data. Only extra data has PAN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** PAN from extra data is checked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_063`

#### PRD-VREV-064 — Valid PAN is passed
- **Why it matters.** Valid PAN — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Valid PAN.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** PAN passed.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_064`

## 7. 7. MSME Validation

#### PRD-VREV-065 — Wrong Udyam number is failed
- **Why it matters.** Invalid Udyam — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: UDYAM-MH-00-0000000.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor = Fail with MSME error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_065`

#### PRD-VREV-066 — Udyam number in wrong format is failed
- **Why it matters.** Wrong format — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: UDYAM-MH-1234 / MH12345.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Fail with onboarding MSME error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_066`

#### PRD-VREV-067 — MSME cancelled after onboarding is caught
- **Why it matters.** Lapsed MSME — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Cancelled Udyam.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor = Fail.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_067`

#### PRD-VREV-068 — Vendor without MSME is not failed for MSME
- **Why it matters.** Missing — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. No MSME anywhere.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** MSME shown in Missing Documents. Not in Errors. Status depends on other checks.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_068`

#### PRD-VREV-069 — Valid Udyam is passed
- **Why it matters.** Valid MSME — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Valid Udyam.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** MSME passed.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_069`

## 8. 8. Bank Validation

#### PRD-VREV-070 — Wrong account number is failed
- **Why it matters.** Invalid account — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Wrong account + valid IFSC.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor = Fail. Account number masked in error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_070`

#### PRD-VREV-071 — Wrong IFSC is failed
- **Why it matters.** Invalid IFSC — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Valid account + wrong IFSC.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Fail.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_071`

#### PRD-VREV-072 — Account closed after onboarding is caught
- **Why it matters.** Closed account — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Closed account.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Fail.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_072`

#### PRD-VREV-073 — Account holder name mismatch fails when client rule needs it
- **Why it matters.** Name mismatch — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Form bank, name match rule on. Test data: Different holder name.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** Bank failed with name mismatch, same as onboarding.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_073`

#### PRD-VREV-074 — 2 bank accounts where 1 is wrong
- **Why it matters.** Multiple accounts — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: 1 valid + 1 invalid.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run 3. Login as Gmmco buyer and go to Vendors listing 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** 2 bank rows. Vendor = Fail. Error names the wrong one (masked).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_074`

#### PRD-VREV-075 — Valid account + IFSC is passed
- **Why it matters.** Valid account — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Valid.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Bank passed.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_075`

## 9. 9. Provider Limits & Outages

#### PRD-VREV-076 — Provider rate limit (429) never makes a vendor Fail
- **Why it matters.** 429 — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Ask dev to make GST provider return 429. Test data: Vendor with valid GST.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Vendor is not Fail. GST check waits and is re-scheduled.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_076`

#### PRD-VREV-077 — Breaker stays open for the provider's Retry-After time (max 1 hour)
- **Why it matters.** 429 + Retry-After — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Provider returns 429 with Retry-After 10 min (and another test with 2 hours).
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check app logs for breaker open / close times
- **Expected.** No calls for 10 min. With 2 hours it is capped at 1 hour.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_077`

#### PRD-VREV-078 — Backoff of about 1, 2, 4, 8 minutes up to 1 hour when there is no Retry-After
- **Why it matters.** No Retry-After — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Provider keeps failing without Retry-After.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check breaker logs
- **Expected.** Wait grows about 1, 2, 4, 8 min ... max 1 hour (small random jitter allowed).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_078`

#### PRD-VREV-079 — 5 timeouts / 5xx in a row open the breaker, and fewer do not
- **Why it matters.** 5 failures — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Ask dev to simulate 4 failures then a success, then 5 failures in a row.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check breaker logs
- **Expected.** 4 failures + success: breaker stays closed (count reset). 5 in a row: breaker opens.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_079`

#### PRD-VREV-080 — Provider login failure is not shown as an invalid document
- **Why it matters.** Login failure — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Ask dev to break provider login on test env.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Counted towards the breaker. If it never recovers, error shows "verification is temporarily unavailable". Vendor not Fail.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_080`

#### PRD-VREV-081 — A check not done within 24 hours of run start is saved as unverified
- **Why it matters.** 24h deadline — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Provider down for more than 24 hours.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Wait 24 h (or ask dev to shorten on test) 3. Ask dev to share the vendor's revalidation rows for this run 4. Login as Gmmco buyer and go to Vendors listing 5. Search the vendor by name 6. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Row = unverified. Error "<doc>: verification is temporarily unavailable". Not Fail. Not billed.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_081`

#### PRD-VREV-082 — Vendor with only unverified / skipped checks shows Not validated
- **Why it matters.** Unverified only — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor has only GST, and GST ended unverified.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status = Not validated (blank / —), even if GST had passed in an earlier run.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_082`

#### PRD-VREV-083 — Only the waiting document type is re-scheduled, the vendor's other documents carry on
- **Why it matters.** Other docs continue — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST provider down, PAN provider fine.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** PAN rows finish normally. Only GST waits.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_083`

#### PRD-VREV-084 — One GST provider down does not stop clients on the other GST provider
- **Why it matters.** Two GST providers — Edge case from the manual sheet.
- **Setup.** Gmmco on provider A (down), client B on provider B (up). Both due.
- **Steps.** 1. Ask dev to run both 2. Check logs
- **Expected.** Only provider A's breaker opens. Client B's GST checks finish.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_084`

#### PRD-VREV-085 — Only one test call is made when the breaker reopens, then others come back spread out
- **Why it matters.** Half-open — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Many vendors waiting on GST provider.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev for logs when breaker reopens
- **Expected.** One test call first. If it passes, waiting vendors come back spread out (not all at once). If it fails, breaker opens again with a longer wait.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_085`

#### PRD-VREV-086 — Revalidation uses only its share of the provider limit so live onboarding still works
- **Why it matters.** Rate budget — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Big run going.
- **Steps.** 1. During the run, do live onboarding validations 2. Ask dev for calls per minute
- **Expected.** Revalidation stays within its share (e.g. 50%). Onboarding validations are not blocked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_086`

#### PRD-VREV-087 — Vendor completes normally when provider comes back
- **Why it matters.** Recovery — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Provider down for 20 min then back. Test data: Valid GST.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Restore provider 3. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** GST row = passed, same row (no duplicate row for the retry).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_087`

## 10. 10. Final Status & Errors

#### PRD-VREV-088 — Vendor is Fail if any latest check failed
- **Why it matters.** Rollup — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST passed, PAN passed, bank failed.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status = Fail. Errors only has bank error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_088`

#### PRD-VREV-089 — Unverified alone never makes vendor Fail
- **Why it matters.** Rollup — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST passed, PAN unverified.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status = Pass. PAN unavailable message is in Errors.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_089`

#### PRD-VREV-090 — Skipped (missing) never makes vendor Fail and is not in Errors
- **Why it matters.** Rollup — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST passed, MSME missing.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status = Pass. MSME only in Missing Documents.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_090`

#### PRD-VREV-091 — Vendor with none of the configured documents is Not validated
- **Why it matters.** Rollup — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. No GST, PAN, MSME, bank.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status = Not validated. Missing Documents lists all 4. Errors empty.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_091`

#### PRD-VREV-092 — Final status uses the latest row of document types not due in this run
- **Why it matters.** Not due docs — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. PAN failed in Oct (yearly). GST passes in Jan run.
- **Steps.** 1. Jan GST run 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 5. Open the vendor detail page and check the validation section
- **Expected.** Status still Fail because PAN's latest row is failed. PAN shows Oct date.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_092`

#### PRD-VREV-093 — One error message per failed / unverified check
- **Why it matters.** Errors — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST failed, PAN unverified.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** 2 messages, e.g. "GST 27ABCDE1234F1Z5: GST is cancelled" and "PAN ******234F: verification is temporarily unavailable".
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_093`

#### PRD-VREV-094 — Vendor is Pass when all present checks pass
- **Why it matters.** Rollup — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. All 4 valid.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status = Pass. Errors and Missing Documents empty.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_094`

#### PRD-VREV-095 — Last Validated = most recent run time among the vendor's latest checks
- **Why it matters.** Last validated — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST checked today, PAN last checked 2 months back.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 5. Open the vendor detail page and check the validation section
- **Expected.** Listing shows today's time. Detail: GST today, PAN older date.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_095`

#### PRD-VREV-096 — Status moves Pass -> Fail when a document turns invalid
- **Why it matters.** Pass to Fail — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Pass in run 1. GST cancelled before run 2.
- **Steps.** 1. Run 1 2. GST cancelled 3. Run 2 4. Login as Gmmco buyer and go to Vendors listing 5. Search the vendor by name 6. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status Fail in run 2. No notification sent (future scope).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_096`

#### PRD-VREV-097 — Status moves Fail -> Pass when the vendor fixes the document
- **Why it matters.** Fail to Pass — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Fail in run 1 on GST.
- **Steps.** 1. Vendor corrects GST 2. Next GST run 3. Login as Gmmco buyer and go to Vendors listing 4. Search the vendor by name 5. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status Pass, error removed.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_097`

## 11. 11. Validation History

#### PRD-VREV-098 — Old rows are never overwritten by a new run
- **Why it matters.** No overwrite — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor has rows from 2 runs.
- **Steps.** 1. Ask dev for run 1 rows 2. Run 3 3. Ask dev for run 1 rows again
- **Expected.** Run 1 rows are unchanged.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_098`

#### PRD-VREV-099 — A retry / re-schedule fills the same row, no extra row
- **Why it matters.** No duplicates — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor's GST waits on breaker twice then passes.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** Only one GST row for this run.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_099`

#### PRD-VREV-100 — One row per document value per run
- **Why it matters.** Row per check — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor with 2 GSTs and 1 PAN, both due.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to share the vendor's revalidation rows for this run
- **Expected.** 3 rows for this run.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_100`

#### PRD-VREV-101 — Rows are created as pending when scheduled and filled when the check finishes
- **Why it matters.** Pending — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev for rows right after start and after finish
- **Expected.** Status empty (pending) at start; passed / failed / skipped / unverified at the end.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_101`

#### PRD-VREV-102 — The vendor's latest checks = new rows for due types + previous rows for types not due
- **Why it matters.** Latest ids — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST due, PAN not due.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev for latest ids on the client-vendor link
- **Expected.** Latest = new GST row(s) + previous PAN row.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_102`

## 12. 12. Usage Count (Billing)

#### PRD-VREV-103 — Skipped rows are not counted for billing
- **Why it matters.** Not billed — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendors with missing MSME.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to run the usage query for the month
- **Expected.** Skipped MSME rows are not counted.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_103`

#### PRD-VREV-104 — Unverified rows are not counted for billing
- **Why it matters.** Not billed — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Some checks unverified.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to run the usage query
- **Expected.** Unverified rows not counted.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_104`

#### PRD-VREV-105 — A reused (24h cache) answer is still counted for each client
- **Why it matters.** Reuse billed — Edge case from the manual sheet.
- **Setup.** Same GST checked for client B earlier today.
- **Steps.** 1. Run Gmmco 2. Usage query for both clients
- **Expected.** Counted once for client B and once for Gmmco.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_105`

#### PRD-VREV-106 — Passed and failed rows are counted
- **Why it matters.** Billed — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Ask dev to run usage query per doc type per vendor 3. Compare with listing
- **Expected.** Count = passed + failed rows per doc type.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_106`

#### PRD-VREV-107 — Client total per document type for a month
- **Why it matters.** Client total — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. 2 runs in the month.
- **Steps.** 1. Ask dev for client total per doc type
- **Expected.** Total matches sum of passed + failed rows of both runs.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_107`

## 13. 13. Vendor Listing & Filters

#### PRD-VREV-108 — A client without revalidation does not see the columns or filters
- **Why it matters.** Other client — Negative case from the manual sheet.
- **Setup.** Client B OFF.
- **Steps.** 1. Login as client B 2. Vendors listing, open filters
- **Expected.** No validation columns or filters.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_108`

#### PRD-VREV-109 — A vendor not checked yet shows blank / Not validated
- **Why it matters.** Not checked yet — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor added after last run.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Search the vendor by name 3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor
- **Expected.** Status blank, other columns empty. No page error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_109`

#### PRD-VREV-110 — Date range filter with From after To
- **Why it matters.** Filters — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: From 30 Oct, To 1 Oct.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply Last Validated filter
- **Expected.** Blocked or no results with a message. Page does not break.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_110`

#### PRD-VREV-111 — Columns show in every vendor listing tab
- **Why it matters.** Tabs — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run done.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Open each tab
- **Expected.** Final status, Last Validated, Errors, Missing Documents in all tabs.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_111`

#### PRD-VREV-112 — Validation Status filter = Pass
- **Why it matters.** Filters — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run done.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply filter = Pass
- **Expected.** Only Pass vendors. Count matches.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_112`

#### PRD-VREV-113 — Validation Status filter = Fail
- **Why it matters.** Filters — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run done.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply filter = Fail
- **Expected.** Only Fail vendors. Count matches.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_113`

#### PRD-VREV-114 — Validation Status filter = Not validated
- **Why it matters.** Filters — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run done.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply filter = Not validated
- **Expected.** Only vendors with blank status (all skipped / unverified / not checked). Count matches.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_114`

#### PRD-VREV-115 — Last Validated date range filter
- **Why it matters.** Filters — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Range covering one run.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply range
- **Expected.** Only vendors validated in the range.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_115`

#### PRD-VREV-116 — Status + date filter together and with existing filters / search
- **Why it matters.** Filters — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: Fail + last 7 days + search.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply all
- **Expected.** Results match all filters. Clear brings back full list.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_116`

#### PRD-VREV-117 — Long error lists display properly
- **Why it matters.** Display — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Vendor with 2 GST + bank failing.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Search the vendor by name 3. Check Errors column
- **Expected.** All messages readable, row does not break.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_117`

#### PRD-VREV-118 — Listing loads normally with all Gmmco vendors
- **Why it matters.** Performance — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. ~800 vendors validated.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Apply Fail filter 3. Change pages
- **Expected.** Loads in normal time.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_118`

## 14. 14. Vendor Detail

#### PRD-VREV-119 — No validation section when client has revalidation OFF
- **Why it matters.** Disabled — Negative case from the manual sheet.
- **Setup.** Client B OFF.
- **Steps.** 1. Login as client B 2. Open vendor detail
- **Expected.** No validation section.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_119`

#### PRD-VREV-120 — Empty validation section for a vendor not checked yet
- **Why it matters.** Not checked — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Search the vendor by name 3. Open the vendor detail page and check the validation section
- **Expected.** Empty, no error.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_120`

#### PRD-VREV-121 — Detail shows each latest check with type, value, status, errors and last run
- **Why it matters.** Each check — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. GST passed, PAN failed, MSME skipped, bank unverified.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Login as Gmmco buyer and go to Vendors listing 3. Search the vendor by name 4. Open the vendor detail page and check the validation section
- **Expected.** Each check shown correctly. PAN and bank masked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_121`

#### PRD-VREV-122 — Listing and detail match
- **Why it matters.** Consistency — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Search the vendor by name 3. Check Validation Status, Last Validated, Errors and Missing Documents for the vendor 4. Open the vendor detail page and check the validation section
- **Expected.** Same status and errors.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_122`

## 15. 15. Excel Bulk Download

#### PRD-VREV-123 — Full PAN / bank number is not in Validation Errors
- **Why it matters.** Masking — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Bulk download (Excel)
- **Expected.** Masked.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_123`

#### PRD-VREV-124 — CSV export does not have the revalidation columns (future scope)
- **Why it matters.** CSV export — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Export CSV (if available)
- **Expected.** No revalidation columns in CSV in v1.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_124`

#### PRD-VREV-125 — Excel has Validation Status and Validation Errors
- **Why it matters.** Columns — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run done.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Bulk download (Excel) 3. Open file
- **Expected.** Two extra columns. Errors one message per line.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_125`

#### PRD-VREV-126 — Excel values match the listing
- **Why it matters.** Values — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Test data: 5 vendors.
- **Steps.** 1. Login as Gmmco buyer and go to Vendors listing 2. Download 3. Compare
- **Expected.** Values match.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_126`

## 16. 16. Access & Masking

#### PRD-VREV-127 — One client cannot see another client's results for a shared vendor
- **Why it matters.** Other client — Negative case from the manual sheet.
- **Setup.** Vendor V on Gmmco and client B, both ON.
- **Steps.** 1. Login as client B 2. Open vendor V
- **Expected.** Only client B's own result.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_127`

#### PRD-VREV-128 — Vendor cannot see revalidation status / errors
- **Why it matters.** Vendor portal — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Login as vendor on vendor portal 2. Check profile / onboarding pages
- **Expected.** Nothing shown to vendor.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_128`

#### PRD-VREV-129 — PAN and bank numbers are masked in stored rows and in the listing response
- **Why it matters.** Masking — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Ask dev to share the vendor's revalidation rows for this run 2. Login as Gmmco buyer and go to Vendors listing 3. Check browser network response
- **Expected.** Masked in rows and in responses.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_129`

#### PRD-VREV-130 — No client settings screen / Revalidate now button / notifications in v1
- **Why it matters.** Out of scope — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Login as buyer admin 2. Look for revalidation settings or a Revalidate now button 3. Check emails after a Pass -> Fail
- **Expected.** None of these exist in v1 (future scope).
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_130`

## 17. 17. Batch Run & Recovery

#### PRD-VREV-131 — A crashed vendor job is retried and saved checks are not run again
- **Why it matters.** Job crash — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Dev kills a vendor job mid way 3. Check logs and rows
- **Expected.** Job retried. Already saved checks not called again. No duplicate rows.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_131`

#### PRD-VREV-132 — One slow vendor does not hold up others
- **Why it matters.** Slow vendor — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. One vendor's provider very slow.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check Sidekiq
- **Expected.** Other vendor jobs keep finishing.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_132`

#### PRD-VREV-133 — Jobs pushed 100 at a time with at most 2 running
- **Why it matters.** Concurrency — Edge case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. 500+ vendors.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check Sidekiq dashboard
- **Expected.** Max 2 running on vendor_revalidation. Waiting vendors moved to vendor_revalidation_retry.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_133`

#### PRD-VREV-134 — Full Gmmco run completes for all linked vendors
- **Why it matters.** Full run — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. All Gmmco vendors.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Wait till done 3. Ask dev for counts
- **Expected.** Every linked vendor has rows for the run.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_134`

## 18. 18. Logs & Alerts

#### PRD-VREV-135 — No Slack alerts for revalidation failures
- **Why it matters.** No Slack — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Many failures.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Check Slack
- **Expected.** Nothing from revalidation.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_135`

#### PRD-VREV-136 — No Sentry events for revalidation
- **Why it matters.** No Sentry — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Dev checks Sentry
- **Expected.** None.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_136`

#### PRD-VREV-137 — One summary line per run with correct counts
- **Why it matters.** Summary — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Dev shares log line 3. Compare with listing filters
- **Expected.** Passed / failed / not validated counts match the listing.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_137`

#### PRD-VREV-138 — Breaker open and close are written in app logs
- **Why it matters.** Breaker logs — Positive case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Provider failing.
- **Steps.** 1. Ask dev to trigger the revalidation run for Gmmco (or wait for the 11 pm IST run) 2. Dev shares logs
- **Expected.** Open and close events logged per provider.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P3 · manual · `PRD-VREV` · `VR_TC_138`

## 19. 19. Onboarding Regression

#### PRD-VREV-139 — Live onboarding is not slowed or blocked during a run
- **Why it matters.** Live onboarding — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Run going.
- **Steps.** 1. Start run 2. New vendor fills onboarding v2 with GST, PAN, bank
- **Expected.** Validations respond normally.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P0 · manual · `PRD-VREV` · `VR_TC_139`

#### PRD-VREV-140 — Revalidation errors do not log out the provider for live onboarding
- **Why it matters.** Login token — Negative case from the manual sheet.
- **Setup.** Revalidation is enabled for Gmmco by Procol ops. Invalid documents during run.
- **Steps.** 1. During run, do a live onboarding validation
- **Expected.** Works without re-login / extra failures.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_140`

#### PRD-VREV-141 — Onboarding error messages are unchanged
- **Why it matters.** Messages — Positive case from the manual sheet.
- **Setup.** Any client. Test data: Invalid GST / PAN / bank.
- **Steps.** 1. Fill onboarding v2 with wrong values
- **Expected.** Same messages as before release.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P1 · manual · `PRD-VREV` · `VR_TC_141`

#### PRD-VREV-142 — Onboarding still sends its Slack alert on provider failure
- **Why it matters.** Alerts — Positive case from the manual sheet.
- **Setup.** Any client.
- **Steps.** 1. Dev makes provider fail during onboarding 2. Check Slack
- **Expected.** Alert still comes.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_142`

#### PRD-VREV-143 — Onboarding still retries the same way as before
- **Why it matters.** Retries — Positive case from the manual sheet.
- **Setup.** Any client.
- **Steps.** 1. Dev makes provider fail once during onboarding
- **Expected.** Same retry behaviour as before.
- **Oracle.** The screen (buyer dashboard on UAT), and the revalidation rows where the steps ask dev for them.
- **Trace.** P2 · manual · `PRD-VREV` · `VR_TC_143`
