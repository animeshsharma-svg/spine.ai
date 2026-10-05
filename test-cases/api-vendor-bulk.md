# Vendor bulk upload — test cases

A buyer uploads one sheet; each row becomes a vendor that lands in **Prospects** (onboarding required) or straight in
**Vendors** (onboarding skipped), or in **Rejected**. These cases cover every column, every file-level rule, the
settings that change behaviour, who may upload, and what each row creates — tested for **GMMCO LIMITED (47053)** on
the sandbox, with regression cases for workspaces where GMMCO's switches are off (PROCOL DEMO, 198678).

Sources read (all read-only): `procol-backend` `origin/main` @ `ae36e86894` (25 Sep) and **PR 16267 @ `65728150bc`**
("vendor bulk upload optimisations for gmmco", 28 Sep — deployed on the sandbox, not yet on main); the client app
`procol-client-dashboard` (`src/views/vendorBulkUpload/*`, `src/views/vendors/vendorOnboardingFlow/*`); and the PR's QA
document "Vendor bulk upload + dedup — QA test cases". File:line references marked `PR16267` are in the PR's version
of the file; the others are `origin/main`. Every case mirrors a runnable case `VBU-NNN` in
`prototype/data/api-cases-extra/vbu.json` and, where it uploads a sheet, a fixture in
`procol test/fixtures/vendor-bulk-upload/`. All three are generated from `procol test/scripts/vendor-bulk/spec.ts`.

**Run it.** `cd prototype && npm run vbu:run -- --company 47053` (or tick *Vendor bulk upload* in the dashboard).
`--cases VBU-050,VBU-060` runs a subset; `--no-create` only the cases that create nothing; `--real-mail` adds the four
Prospect cases, which email the workspace's vendor-management team (real people on the sandbox) — ask before using it.

## How a row is judged

The upload request only parses the file and stages one `vendor_bulk_upload_jobs` row per sheet row; it answers
`{"status":"success"}` with no job id (`app/controllers/api/v1/companies_controller.rb:199-215`). Every row rule runs
later in Sidekiq (`app/workers/vendor_bulk_upload_worker_v2.rb`). So a row case uploads, waits until no staged row is
`in_progress`, and reads the row's status and error (SELECT only) — and, for rows that create a vendor, the company,
its buyer–seller mapping and its invitations.

**The tripwire.** A negative row the product wrongly accepts would create a vendor — and on an onboarding workspace,
email the vendor-management team. So every row-rule fixture also carries `Status = QA_TRIPWIRE`, which fails a LATER
check in the validator's fixed order (`vendor_bulk_upload_validation_service_v2.rb:19-78`):

`tax → mandatory → Deals In → POC email → POC 2 email → Vendor Profile → Status → Onboarding Required → City`

If the rule under test fires, its own message comes back. If it does not, the row still stops at **"Invalid Status"**
and nothing is created — so "Invalid Status" means "every earlier rule let this row through", which is also how the
positive checks are proved without creating anything. Rows that must reach the worker use
`Vendor Onboarding Required = No` (vendor lands Active; the only mail goes to the `qa_…@example.com` address) or
`Status = rejected` (no mail at all). Test data is always `QA_Platform_VBU_<stamp>_…`, `qa_vbu_<stamp>_…@example.com`,
fake GSTINs whose PAN part carries entity letter Z (no real PAN has it), fake UK VAT `GB9…`, phone `0000000001`.

## Feature map

### Columns (GMMCO: contactless ON, onboarding v2, can-skip ON, 4 extra fields)

| Column | Required? | Rule | Error | Where |
| --- | --- | --- | --- | --- |
| Company Name | always | not blank (whitespace = blank) | Mandatory Item cannot be left empty | validation_v2.rb:215-220 |
| Tax Type / Tax No. / Business Location | only together | Country + TaxType by exact name → active mapping → regex (India GST `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][0-9A-Z]{2}$`, upper-case, no trim) | Invalid Tax No. · Tax Type not configured for the selected Business Location | validation_v2.rb:82-100 |
| City / Address | contactless OFF: needed when no Tax No. · ON: optional | city = exact name, else `ILIKE %x%` fuzzy; unknown city refused only when contactless OFF | Either Tax No. or Without Tax No. fields are needed · Invalid City Name | validation_v2.rb:24-30,122-138; PR16267 validation:77 |
| Vendor Profile | contactless OFF: required · ON: optional (defaults manufacturer) | a key of `vendor_category_type_mapping` (GMMCO: manufacturer_trader, service_provider_contractor, transporter_Logistics_provider, liscening_supplier), case-insensitive, not trimmed | Invalid Vendor Profile | utils.rb:847-857; validation_v2.rb:181-194 |
| POC - Full Name / POC - Email Address | contactless OFF: required · ON: optional | email `VALID_EMAIL_REGEX`; blank email not checked when contactless | Invalid Email | utils.rb:13; PR16267 validation:39 |
| POC 2 - Full Name / Email | optional, as a pair | email regex in validation; pair checked in the worker AFTER the vendor is created | Invalid Email 2 · Invalid Values for POC 2. | validation_v2.rb:38-40; worker:175-193 |
| Deals In | optional | comma list of category uuids or unique names; stops at the first valid one | Invalid Deals In : <token> | validation_v2.rb:161-179 |
| Status | optional | blank / active / rejected, trimmed, any case | Invalid Status | validation_v2.rb:196-202 |
| Vendor Onboarding Required | only when can-skip | Yes / No, trimmed, any case; blank = Yes | Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown | validation_v2.rb:204-213; worker:66-71 |
| Vendor Code / VRP Code | optional | ≤ 100 chars; unique per workspace | Invalid Value for Vendor Code. · Vendor Code or GST Number is already taken | worker:106-113; send_service.rb:258-281 |
| PAN No. / Pincode (new, every workspace) | optional | PAN strip+upcase, no format check; pincode → digits, stored in `misc.pincode` | — | PR16267 utils:904-915, mixin:42-47 |
| Account Group, MSME, Bank A/C, IFSC (GMMCO extra fields) | optional | stored in `companies.misc`; dropdown options NOT enforced | — | vpc_params_mixin.rb:41-60 |

### File-level rules

| Rule | Behaviour | Where |
| --- | --- | --- |
| `excel_data` missing / null | 422 code 2 'Insufficient parameters' | controller:209 |
| not a workbook | Roo::Excelx → Roo::Excel → 422 'Invalid file format' (only Zip::Error / ArgumentError / Ole::Storage::FormatError rescued) | lib/excel_sheet_utils.rb:2-13 |
| old format (row 3 has GST, POC - Phone Number or POC 2 - Mobile) | 422 'Format is updated for bulk upload, please download the format to continue.' | excel_to_json:164-167 |
| layout | headers on ROW 3, data from row 4, matched by header NAME (order irrelevant), header rstrip only | excel_to_json:168-181 |
| every cell | `strip_trailing_zero` then `Nokogiri::HTML(v).text` | excel_to_json:176-177 |
| size / row count / empty sheet / blank rows | no limit, no check; blank rows are staged as failed rows | — |
| duplicate emails inside one sheet | kept on purpose (subsidiary flow); refused per row at invite time | companies_helper.rb:686-703 |
| concurrency | job id = "this user's job count + 1" → two concurrent uploads by one user share a job | companies_helper.rb:684 |

### Settings that change behaviour

| Setting | GMMCO | PROCOL DEMO | Effect |
| --- | --- | --- | --- |
| `allow_contactless_vendor_upload` | on | off | POC name/email/profile optional; no Tax-or-City rule; unknown city accepted; no invitation when email blank; also relaxes the manual Invite form (PR16267 send_service:351-354) |
| `vendor_onboarding_version` | v2 | v2 | mapping lands `invited` (Prospects) unless skipped or rejected (create_service.rb:240-249) |
| `can_skip_vendor_onboarding` | on | on | adds the Vendor Onboarding Required column; "No" → Active + `skip_vendor_onboarding` on the invitation |
| `vendor_duplicate_check_fields` | gst_no, address, pincode, account_group | — | duplicate only when every field matches; address blank = no match; pincode/extra blank = match (PR16267 duplicate_check_fields.rb) |
| `allow_same_gst_multiple_addresses_vendor_invite` | on | — | fallback when no field list: same GST + same address blocked (1111), else any repeated GST blocked (134) |
| `extra_fields_for_vendor_invite` | 4 optional | 9, four required | extra columns; required ones are drawn as mandatory in the template but NOT enforced on upload (VBU-182) |
| `vendor_category_type_mapping` | 4 keys | 5 keys | the valid Vendor Profile values |
| `vendor_invitation_v2` | off | off | profile + city/address optional, PAN derived from GST |
| `disable_manual_vendor_creation` | off | off | 745 on upload and template for non-Procol users |
| `is_p2p_vendor_portal_enabled` | on | — | a mapping turning Active triggers the P2P vendor-portal integration (bscm.rb:48,185-215) |

### Who may upload

`CompanyPolicy#bulk_create_vendor?`: not a seller, and `company` → `create_record` (company_policy.rb:123-126); status
the same; error sheet also `read_record`. The **template endpoint has no `authorize`** (controller:218-229). An
onboarding payload (`configurations.order_type = vendor_onboarding` + `forms`) additionally needs
`create_vendor_onboarding_events?` — the web app never sends one.

### What a row creates

| Row | Company | Mapping (tab) | Invitation | Mail |
| --- | --- | --- | --- | --- |
| contact + Onboarding **No** | yes | active (Vendors) | active, `skip_vendor_onboarding` | invite to the POC |
| contact + **Yes** / blank | yes | invited (Prospects) | active | invite to the POC **+ "new prospect added" to every vendor-management user** |
| Status **rejected** | yes + a user for the POC | rejected (Rejected) | rejected | none |
| contactless, no email | yes | Prospects (or Vendors if No) | **none** | none |
| POC email already mapped + tax/code | a subsidiary copy | invited/active | active, `is_subsidiary` — **without** the skip flag | invite + prospect mail even for "No" |
| POC 2 pair | — | — | + vendor_member_invite | invite to POC 2 |

Mails: `app/models/invitations.rb:125-140` (after_commit on an active invitation), recipients of the prospect mail
`app/workers/vendor_onboarding_mailer_worker.rb:174-203`. The sandbox sends real mail (`config/environments/staging.rb:57`).

## Where the written spec and the code disagree

1. **Vendor Profile values.** QA doc: "manufacturer or brokerage". GMMCO's valid values are its
   `vendor_category_type_mapping` keys; "manufacturer" is refused (VBU-034, VBU-095).
2. **Account Group.** QA doc treats it as free text and uses `ZDOM`; GMMCO configures it as a dropdown of ten SAP codes
   (ZCOV, ZDGS, …) and ZDOM is not one of them. The bulk path does not enforce the dropdown at all (VBU-112).
3. **"An old sheet puts values in the wrong columns."** The parser maps cells by header name, so column order never
   matters (VBU-016). What IS misaligned is the template's own sample row (VBU-031) and its Vendor Profile dropdown
   (VBU-032) — both still use the flag-off positions after PR 16267.
4. **"Record created with no city" (A5).** The unresolved city NAME travels as `city_id` and is cast to **0** — the
   vendor points at a city that does not exist, and a later upload with the same tax number and no city crashes the
   worker ('Internal error in sending invitation', VBU-154). A partial name like "a" is fuzzy-matched to a real city
   (VBU-075, VBU-076).
5. **Manual Invite form "Unchanged" (D7).** `contactless_vendor_record?` is workspace-wide, so on GMMCO the manual form
   also accepts a blank POC name and email (VBU-133).
6. **Contactless + email but no name.** Not covered by the doc; the PR skips error 691 for it, so the invite goes out
   addressed to nobody (VBU-129).
7. **Lead: "duplicate emails inside one sheet appear to be ACCEPTED".** Intended at staging (companies_helper.rb:703
   comment: subsidiary flow). Per row: no tax/code → 688 'This email is already invited.'; with a tax number → a
   subsidiary, whose invitation drops the skip flag (VBU-130, VBU-131).
8. **Lead: "vendor_invitation_v2 changes the invite path".** In the bulk worker it only relaxes profile/city/address and
   derives PAN; the worker always uses `Invitation::SendService`, never `SendServiceV3`.
9. **Lead: "only the V2 path is live".** Confirmed — the controller enqueues `VendorBulkUploadMasterWorkerV2`; the V1
   worker and validator are dead code.
10. **UI vs API.** The file picker accepts `.csv`, which the backend cannot read (VBU-007); the onboarding-mode Vendors
    page shows *Bulk Upload* without the `disable_manual_vendor_creation` check the legacy lists apply (VBU-040);
    the UI never sends the onboarding payload, so per-row onboarding events are API-only (VBU-132); the job list maps
    status only to completed / in_progress, so its Error and Duplicate tags are never shown.
11. **Error sheet with no failed rows** answers error 487, whose text is "You are not allowed to change the phone
    number." (VBU-038).
12. **Required extra fields.** The template shows them under Mandatory Details, but the validator is built without
    `extra_fields`, so a blank required extra field passes (VBU-182, PR16267 validation:14-16).
13. **Sandbox master data.** 36 countries are named "India"; `Country.find_by(name:)` has no order or status filter,
    so GST rows intermittently fail 'Tax Type not configured for the selected Business Location' (VBU-059). The
    duplicate suite therefore uses UK VAT numbers — the duplicate key reads `companies.gst_no` whatever the tax type.

## 1. The request and the file itself

#### API-XVBU-001 — Upload with no excel_data is refused
- **Why it matters.** The only required parameter. An API client that forgets it must get a clean 422, never a 500 from decoding nil.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. POST /v1/bulk_create_vendor with body {}
- **Expected.** HTTP 422, error code 2 'Insufficient parameters'. No job rows are staged.
- **Oracle.** 422 + code 2; vendor_bulk_upload_jobs has no new row for this user.
- **Trace.** P1 · automate · `VBU-001` · `app/controllers/api/v1/companies_controller.rb:209`

#### API-XVBU-002 — excel_data sent as null is refused
- **Why it matters.** JSON null reaches Rails as nil — same guard as a missing key; proves the guard is `nil?` and not `key?`.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. POST /v1/bulk_create_vendor with body {"excel_data": null}
- **Expected.** HTTP 422, error code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `VBU-002` · `app/controllers/api/v1/companies_controller.rb:209`

#### API-XVBU-003 — excel_data as an empty string is refused cleanly
- **Why it matters.** The guard only catches nil. An empty string goes on to Base64-decode into a 0-byte temp file; Roo then has to fail on it without a 500.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. POST /v1/bulk_create_vendor with body {"excel_data": ""}
- **Expected.** HTTP 422 'Invalid file format' (error 15 carrying messages.invalid_file_format). Never a 500.
- **Oracle.** 4xx with that message; any 5xx is a defect.
- **Trace.** P1 · automate · `VBU-003` · `app/controllers/api/v1/companies_controller.rb:209-211, lib/excel_sheet_utils.rb:2-13`

#### API-XVBU-004 — excel_data that is not base64 at all is refused
- **Why it matters.** Ruby's Base64.decode64 silently skips characters outside the alphabet, so garbage decodes to a few junk bytes instead of raising — the Roo fallback chain must still end in a clean refusal.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. POST /v1/bulk_create_vendor with body {"excel_data": "@@@ this is not base64 @@@"}
- **Expected.** HTTP 422 'Invalid file format'.
- **Oracle.** 4xx with that message; no 5xx.
- **Trace.** P1 · automate · `VBU-004` · `lib/excel_sheet_utils.rb:4-11`

#### API-XVBU-005 — A PDF renamed as a spreadsheet is refused
- **Why it matters.** File type is decided only by trying Excelx then Excel; a PDF must fall through both to the 'Invalid file format' branch.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-005.pdf`.
- **Steps.** 1. Base64 the fixture PDF 2. POST /v1/bulk_create_vendor {excel_data}
- **Expected.** HTTP 422 'Invalid file format'. No job staged.
- **Oracle.** 4xx + message; no job rows.
- **Trace.** P1 · automate · `VBU-005` · `lib/excel_sheet_utils.rb:4-11`

#### API-XVBU-006 — A PNG image is refused
- **Why it matters.** Binary non-zip, non-OLE input — the second Roo fallback must raise Ole::Storage::FormatError, which is the only error the helper rescues there.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-006.png`.
- **Steps.** 1. Base64 a 1×1 PNG 2. POST it as excel_data
- **Expected.** HTTP 422 'Invalid file format'.
- **Oracle.** 4xx; no 5xx.
- **Trace.** P2 · automate · `VBU-006` · `lib/excel_sheet_utils.rb:4-11`

#### API-XVBU-007 — A CSV — which the upload screen lets you pick — is refused by the API
- **Why it matters.** The upload dialog's file picker accepts .csv, but the backend only opens xlsx/xls. A buyer can pick a CSV and get an error they cannot act on.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-007.csv`.
- **Steps.** 1. Base64 a CSV with the right headers 2. POST it as excel_data
- **Expected.** HTTP 422 'Invalid file format' — and the UI should not offer CSV in the first place.
- **Oracle.** 4xx with that message; UI accept list includes .csv (client bug).
- **Spec vs code.** Client accepts .csv; backend cannot parse CSV.
- **Trace.** P1 · automate · `VBU-007` · `lib/excel_sheet_utils.rb:4-11; procol-client-dashboard/src/views/vendorBulkUpload/uploadExcelModal.jsx:124-128 (accept=".csv, …")`

#### API-XVBU-008 — A Word .docx (a zip that is not a workbook) is refused without a 500
- **Why it matters.** A .docx is a valid zip, so Roo::Excelx gets further than with a PDF and can raise errors the helper does not rescue (only Zip::Error/ArgumentError are).
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-008.docx`.
- **Steps.** 1. Base64 a minimal docx 2. POST it as excel_data
- **Expected.** HTTP 422 'Invalid file format'. Any 5xx is a defect.
- **Oracle.** 4xx; no 5xx.
- **Trace.** P1 · automate · `VBU-008` · `lib/excel_sheet_utils.rb:4-11`

#### API-XVBU-009 — base64 with the data-URL prefix left on is refused cleanly
- **Why it matters.** The web app strips 'data:…;base64,' before sending; any other client that forgets gets junk bytes in front of the zip.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-009.xlsx`.
- **Steps.** 1. Take a valid tripwired sheet 2. Prefix its base64 with data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64, 3. POST
- **Expected.** A clean 4xx — 422 'Invalid file format', or the sandbox firewall's bare 403 (seen 2026-09-29); never a 500.
- **Oracle.** 4xx; no 5xx.
- **Trace.** P2 · automate · `VBU-009` · `lib/excel_sheet_utils.rb:17-23; client strips at uploadExcelModal.jsx:57`

#### API-XVBU-010 — The old sheet format (GST / POC - Phone Number columns) is refused
- **Why it matters.** Buyers still hold the pre-V2 template. The parser must refuse it outright instead of staging rows that all fail.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-010.xlsx`.
- **Steps.** 1. Build a sheet whose row 3 has the V1 headers (Company Name, POC - Full Name, POC - Phone Number, POC - Email Address, Vendor Profile, GST, City, Address) 2. POST
- **Expected.** HTTP 422 'Format is updated for bulk upload, please download the format to continue.' No job staged.
- **Oracle.** 4xx + that message.
- **Trace.** P0 · automate · `VBU-010` · `app/services/conversions/excel_to_json_conversion_service.rb:164-167; config/locales/en-IN.yml:506`

#### API-XVBU-011 — A new-format sheet with just one old column (POC 2 - Mobile) is also refused
- **Why it matters.** The old-format test is 'any one of three headers', so one leftover column rejects an otherwise current sheet — worth knowing when a buyer adds a column by hand.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-011.xlsx`.
- **Steps.** 1. Current template headers + an extra 'POC 2 - Mobile' column 2. POST
- **Expected.** HTTP 422 'Format is updated for bulk upload, please download the format to continue.'
- **Oracle.** 4xx + that message.
- **Trace.** P2 · automate · `VBU-011` · `app/services/conversions/excel_to_json_conversion_service.rb:164`

#### API-XVBU-012 — An empty workbook (no cells at all) is refused without a 500
- **Why it matters.** sheet.last_row is nil for an empty sheet and the loop compares 4 <= nil — an ArgumentError outside any rescue.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-012.xlsx`.
- **Steps.** 1. Workbook with one sheet and no cells 2. POST
- **Expected.** HTTP 422 with a clear message (e.g. 'no data rows'); never a 500.
- **Oracle.** 4xx; 5xx = defect.
- **Trace.** P0 · automate · `VBU-012` · `app/services/conversions/excel_to_json_conversion_service.rb:168-171`

#### API-XVBU-013 — Headers only, no data rows, is refused with a message
- **Why it matters.** There is no empty-sheet rule: the upload answers success, the UI toasts 'Vendors Sheet Uploaded', and no job ever appears. The buyer cannot tell anything happened.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-013.xlsx`.
- **Steps.** 1. The template's 3 header rows, nothing from row 4 2. POST 3. Read GET /v1/bulk_create_vendor_status
- **Expected.** HTTP 422 'no vendor rows found' (or similar). Today: HTTP 200 and nothing staged.
- **Oracle.** Refusal expected; a 200 with zero staged rows is the defect.
- **Trace.** P1 · automate · `VBU-013` · `app/services/conversions/excel_to_json_conversion_service.rb:168-181; app/helpers/api/companies_helper.rb:680-714 (no empty check)`

#### API-XVBU-014 — A normal spreadsheet (headers on row 1) is refused with a message
- **Why it matters.** The parser always reads headers from row 3. A buyer who builds their own sheet with headers on row 1 gets row 3 (a data row) read as headers — silently.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-014.xlsx`.
- **Steps.** 1. Headers on row 1, two tripwired data rows on rows 2-3 2. POST
- **Expected.** HTTP 422 telling the buyer to use the template. Today: 200 and nothing staged.
- **Oracle.** Refusal expected; success with zero staged rows is the defect.
- **Trace.** P1 · automate · `VBU-014` · `app/services/conversions/excel_to_json_conversion_service.rb:168-170`

#### API-XVBU-015 — A legacy .xls (BIFF8) file is parsed like an .xlsx
- **Why it matters.** The Roo::Excel fallback is the only path for .xls; it must hand the same row to the validator.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-015.xls`.
- **Steps.** 1. Tripwired row saved as .xls 2. POST 3. Read the staged row
- **Expected.** HTTP 200; one row, failed 'Invalid Status' (every rule before Status passed).
- **Oracle.** Job row status failed, error 'Invalid Status'.
- **Trace.** P1 · automate · `VBU-015` · `lib/excel_sheet_utils.rb:6-8`

#### API-XVBU-016 — Columns in a different order are matched by name
- **Why it matters.** The QA doc warns that an old template 'puts values in the wrong columns'. The parser keys every cell by its header name, so order should not matter at all.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-016.xlsx`.
- **Steps.** 1. Tripwired row with the columns reversed 2. POST
- **Expected.** HTTP 200; row failed 'Invalid Status' (every value found under its own name).
- **Oracle.** Job row error 'Invalid Status'.
- **Spec vs code.** QA doc says a sheet downloaded before the flag change 'will put values in the wrong columns'; the parser maps by header name, so only a changed header NAME matters, not order.
- **Trace.** P1 · automate · `VBU-016` · `app/services/conversions/excel_to_json_conversion_service.rb:172-178`

#### API-XVBU-017 — A header with a leading space (' Company Name') is still recognised
- **Why it matters.** The parser rstrips headers (trailing spaces) but not leading ones, so a stray space in front silently empties the column.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-017.xlsx`.
- **Steps.** 1. Rename the header to ' Company Name' 2. Tripwired row 3. POST
- **Expected.** Row failed 'Invalid Status' (header trimmed on both sides). Today likely 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-017` · `app/services/conversions/excel_to_json_conversion_service.rb:177 (key.to_s.rstrip)`

#### API-XVBU-018 — A header with a trailing space ('Company Name ') is recognised
- **Why it matters.** Pins the rstrip that exists today.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-018.xlsx`.
- **Steps.** 1. Rename the header to 'Company Name ' 2. Tripwired row 3. POST
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-018` · `app/services/conversions/excel_to_json_conversion_service.rb:177`

#### API-XVBU-019 — Header names are case-sensitive ('company name' is not 'Company Name')
- **Why it matters.** Documents the strictness: a lower-cased header is an unknown column, so Company Name is empty.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-019.xlsx`.
- **Steps.** 1. Rename the header to 'company name' 2. POST
- **Expected.** Row failed 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-019` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:215-220`

#### API-XVBU-020 — An unknown extra column is ignored
- **Why it matters.** Buyers add notes columns. Unknown columns are passed straight through into the invite parameters, so they must at least not break validation.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-020.xlsx`.
- **Steps.** 1. Tripwired row + a 'Remarks' column 2. POST
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-020` · `app/controllers/concerns/utils.rb:877-884 (unknown keys copied as-is)`

#### API-XVBU-021 — A blank row between two vendors is skipped, not reported as a failed vendor
- **Why it matters.** Every row up to last_row is staged, including empty ones, so the error sheet fills with 'failed' rows the buyer never wrote.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-021.xlsx`.
- **Steps.** 1. Two tripwired rows with one empty row between them 2. POST
- **Expected.** Exactly 2 staged rows, both failed 'Invalid Status'. Today a 3rd (blank) row is staged and failed.
- **Oracle.** Count of staged rows = 2.
- **Trace.** P1 · automate · `VBU-021` · `app/services/conversions/excel_to_json_conversion_service.rb:171-181 (no blank-row skip)`

#### API-XVBU-022 — The same column twice — the last copy wins
- **Why it matters.** Two 'POC - Email Address' columns (a valid then an invalid one) collapse into one hash key; which one survives decides the error.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-022.xlsx`.
- **Steps.** 1. Grid with two POC - Email Address columns, valid then invalid 2. POST
- **Expected.** Row failed 'Invalid Email' (the second, invalid value was used). Behaviour to document, not a defect.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-022` · `app/services/conversions/excel_to_json_conversion_service.rb:175-178`

#### API-XVBU-023 — 1,000 rows upload within the request and every row is processed
- **Why it matters.** Parsing and the staging insert happen inside the web request (the PR doc warns about an 11,000-row load). 1,000 tripwired rows measure it without creating anything.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-023.xlsx`.
- **Steps.** 1. 1,000 tripwired rows 2. POST and time it 3. Wait until no row is in_progress
- **Expected.** HTTP 200 in well under 60 s; all 1,000 rows end failed 'Invalid Status'; none left in_progress.
- **Oracle.** HTTP time, staged count 1000, every error 'Invalid Status'.
- **Trace.** P1 · automate · `VBU-023` · `app/controllers/api/v1/companies_controller.rb:210-213; app/helpers/api/companies_helper.rb:680-714`

#### API-XVBU-024 — Two uploads by the same user at the same moment get separate jobs
- **Why it matters.** The job id is 'this user's job count + 1', read before the insert, so two uploads at the same time can share an id — their rows, status and error sheet then mix.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-024.xlsx`.
- **Steps.** 1. POST two different tripwired sheets at the same moment 2. Read the job id of every staged row
- **Expected.** Two jobs with one row each. Today the two rows can land in one job id.
- **Oracle.** vendor_bulk_upload_jobs.job_id of both rows.
- **Trace.** P1 · automate · `VBU-024` · `app/helpers/api/companies_helper.rb:684`

#### API-XVBU-222 — A workbook whose FIRST sheet is an instructions sheet: the vendor sheet is still read
- **Why it matters.** Coverage audit GAP-47: only the first worksheet is read (parse:164-173); a buyer who adds an instructions tab in front gets HTTP 200 and nothing staged.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-222.xlsx`.
- **Steps.** 1. Sheet 1 'Instructions' with one line; sheet 2 the vendor sheet with one tripwired row
- **Expected.** The vendor sheet is read (row failed 'Invalid Status'), or the file is refused with a message. Per the code: HTTP 200 and nothing staged.
- **Oracle.** Job rows.
- **Trace.** P2 · automate · `VBU-222` · `app/services/conversions/excel_to_json_conversion_service.rb:164-173`

#### API-XVBU-227 — An old-format 'GST ' column (trailing space) is caught like 'GST'
- **Why it matters.** Coverage audit GAP-53: the old-format check compares the raw header (parse:164), so 'GST ' slips past it.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-227.xlsx`.
- **Steps.** 1. Tripwired row in a sheet that also has a 'GST ' column
- **Expected.** HTTP 422 'Format is updated for bulk upload, please download the format to continue.'
- **Oracle.** HTTP status + message.
- **Trace.** P3 · automate · `VBU-227` · `app/services/conversions/excel_to_json_conversion_service.rb:164-165`

## 2. Who may upload, and the template / status / error-sheet endpoints

#### API-XVBU-030 — The template carries every column this workspace needs
- **Why it matters.** The template is generated per workspace from its settings (extra fields, can-skip, contactless). A missing column means a rule a buyer can never satisfy.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. GET /v1/bulk_create_vendor_template 2. Download excel_url 3. Read row 3
- **Expected.** HTTP 200; row 3 lists Company Name, Tax Type, Tax No., Business Location, City, Address, Vendor Profile, POC name/email, Vendor Code, VRP Code, PAN No., Pincode, POC 2 name/email, Deals In, Status, every extra field, and 'Vendor Onboarding Required' when onboarding can be skipped.
- **Oracle.** Header list compared with the workspace settings.
- **QA doc.** Covers D1 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-030` · `app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:101-113; PR16267 app/controllers/concerns/utils.rb:792-848 (PAN No./Pincode at 813-814 for every workspace)`

#### API-XVBU-031 — The template's sample row lines up with its headers
- **Why it matters.** The sample row is written by position from a fixed list in the flag-OFF order. When contactless moves columns, 'Procol Contact' lands under Tax Type and the email under Tax No. A buyer who edits the sample row uploads garbage.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. Download the template 2. Compare row 4 with row 3
- **Expected.** Row 4: Company Name=Procol, POC - Full Name=Procol Contact, POC - Email Address=example@procol.in, City=Gurgaon, Address=Platina Tower.
- **Oracle.** Cell-by-cell comparison.
- **Trace.** P1 · automate · `VBU-031` · `PR16267 app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:295-336 (sample written by position in the flag-OFF order; PR did not touch it)`

#### API-XVBU-032 — Each dropdown sits on its own column
- **Why it matters.** The Vendor Profile dropdown range is hard-coded to D4:D100 unless vendor_invitation_v2 is on; with the contactless layout D is Business Location, so D gets two conflicting lists and Vendor Profile gets none.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. Download the template 2. Read the data-validation ranges from the sheet XML
- **Expected.** Vendor Profile list on the Vendor Profile column; Tax Type, Business Location, Status, Vendor Onboarding Required each on their own column; no column with two lists.
- **Oracle.** sqref of each <dataValidation> vs the header position.
- **Trace.** P1 · automate · `VBU-032` · `PR16267 app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:97 (D4:D100 unless vendor_invitation_v2 — not updated for contactless), 263-282`

#### API-XVBU-033 — The template's declared range covers every column
- **Why it matters.** The <dimension> of the generated sheet can end before the last columns; readers that trust it (SheetJS, some ERPs' importers) drop Bank IFSC Code and Vendor Onboarding Required.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. Download the template 2. Compare <dimension ref> with the last used cell
- **Expected.** Declared range = the real range.
- **Oracle.** ref string comparison.
- **Trace.** P3 · automate · `VBU-033` · `app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:21-85 (axlsx dimension)`

#### API-XVBU-034 — The Data Sheet offers this workspace's profiles and Yes/No for onboarding
- **Why it matters.** Vendor Profile values come from vendor_category_type_mapping (GMMCO: manufacturer_trader …) — not 'manufacturer/brokerage' as the QA doc says.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. Download the template 2. Read the Data Sheet columns
- **Expected.** Vendor Profiles = the keys of vendor_category_type_mapping; Vendor Onboarding Required = Yes, No (when onboarding can be skipped); Status = rejected, active.
- **Oracle.** Compared with the workspace settings.
- **Spec vs code.** QA doc: 'Valid values: Vendor Profile manufacturer or brokerage'. For GMMCO the valid values are manufacturer_trader, service_provider_contractor, transporter_Logistics_provider, liscening_supplier.
- **Trace.** P2 · automate · `VBU-034` · `app/controllers/concerns/utils.rb:847-857; app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:121-142`

#### API-XVBU-035 — With contactless on, only Company Name is in the Mandatory block
- **Why it matters.** The flag moves POC Name, POC Email and Vendor Profile out of the mandatory group; the template must show that, or buyers keep filling fields they don't need.
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation).
- **Steps.** 1. Download the template 2. Read the row-1 group of each column
- **Expected.** Mandatory Details: Company Name (+ the With Tax No. trio). POC - Full Name, POC - Email Address, Vendor Profile, City, Address under Optional Details.
- **Oracle.** Row-1 grouping.
- **Trace.** P1 · automate · `VBU-035` · `PR16267 app/controllers/concerns/utils.rb:800-848`

#### API-XVBU-036 — The job status list answers for the caller
- **Why it matters.** The page polls this every 30 s while a job runs; it must answer with the job counters.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. GET /v1/bulk_create_vendor_status
- **Expected.** HTTP 200 with jobs[] {job_uuid, success, failed, in_progress, already_mapped, total, created_at}.
- **Oracle.** 200.
- **Trace.** P2 · automate · `VBU-036` · `app/controllers/api/v1/companies_controller.rb:247-270`

#### API-XVBU-037 — Error sheet without a job id is refused
- **Why it matters.** job_id is required; the guard must answer 422, not 500.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. GET /v1/bulk_create_vendor_error_sheet (no job_uuid)
- **Expected.** HTTP 422 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `VBU-037` · `app/controllers/api/v1/companies_controller.rb:235`

#### API-XVBU-038 — Error sheet for a job with no failed rows says so
- **Why it matters.** The 'no failed rows' branch renders error 487, whose text is about phone numbers — a buyer clicking 'Download Excel' sees a message that makes no sense.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. GET /v1/bulk_create_vendor_error_sheet?job_uuid=<an id with no failed rows>
- **Expected.** HTTP 422 with a message like 'This job has no failed rows'. Today: 'You are not allowed to change the phone number.'
- **Oracle.** Status 4xx and the message is about the job, not phones.
- **Trace.** P2 · automate · `VBU-038` · `app/controllers/api/v1/companies_controller.rb:238; config/locales/en-IN.yml api_errors.487`

#### API-XVBU-039 — Error sheet of a failed job lists the failed rows with their error
- **Why it matters.** The error sheet is how a buyer fixes a big upload; it must hold every failed row and an Error column.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-039.xlsx`.
- **Steps.** 1. Upload one tripwired row 2. GET the error sheet for that job 3. Read it
- **Expected.** HTTP 200 excel_url; the file's first column is 'Error' = 'Invalid Status', followed by the row's values.
- **Oracle.** Parsed error sheet.
- **Trace.** P1 · automate · `VBU-039` · `app/controllers/api/v1/companies_controller.rb:232-245; app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:336-359`

#### API-XVBU-040 — disable_manual_vendor_creation blocks the upload for client users
- **Why it matters.** The setting exists to force vendors in through integration only. It runs before the file is even read.
- **Setup.** gate: disable_manual_vendor_creation is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-040.xlsx`.
- **Steps.** 1. On a workspace with the setting on, as a client (non-Procol) user: POST a tripwired sheet
- **Expected.** HTTP 422 error 745 'Manual vendor creation is disabled'; nothing staged. (A Procol employee is allowed.)
- **Oracle.** 422 + 745; no job rows.
- **Spec vs code.** The Vendors page in onboarding mode still shows the Bulk Upload link with no check (vendorOnboardingFlow.jsx:249-258); the legacy lists hide it — see VBU-047.
- **Trace.** P1 · automate · `VBU-040` · `app/controllers/api/v1/companies_controller.rb:205-208`

#### API-XVBU-043 — disable_manual_vendor_creation also blocks the template download
- **Why it matters.** Same gate on the template endpoint, so the buyer is told before filling a sheet.
- **Setup.** gate: disable_manual_vendor_creation is on. Data: creates nothing (every row stops in validation).
- **Steps.** 1. GET /v1/bulk_create_vendor_template on a workspace with the setting on
- **Expected.** HTTP 422 error 745 'Manual vendor creation is disabled'.
- **Oracle.** 422 + 745.
- **Trace.** P2 · automate · `VBU-043` · `app/controllers/api/v1/companies_controller.rb:219-222`

#### API-XVBU-041 — A vendor (seller) user cannot bulk upload vendors
- **Why it matters.** The upload creates companies, users and invitations; CompanyPolicy#bulk_create_vendor? refuses sellers first. Run as one of our own QA test vendors (qa_…@example.com), never a real supplier.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-041.xlsx`.
- **Steps.** 1. Sign in as a QA test vendor of this workspace (vendor app, OTP rule of the sandbox) 2. POST a tripwired sheet
- **Expected.** Refused and nothing staged — HTTP 401 'This app is not authorized to use this API' (the vendor app may not call it at all) or 403/422 from the policy.
- **Oracle.** Refusal + no job rows for that user.
- **Trace.** P0 · automate · `VBU-041` · `app/policies/company_policy.rb:123-126; config/app_auth_config.yml (bulk_create_vendor only in the console apps)`

#### API-XVBU-044 — A buyer without company:create_record cannot bulk upload vendors
- **Why it matters.** The policy's second condition. The runner only uses a member session after the dashboard configuration confirms it lacks company:create_record.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-044.xlsx`.
- **Steps.** 1. Use a workspace user whose permissions lack company:create_record 2. POST a tripwired sheet
- **Expected.** HTTP 422 'You are not authorized to perform this action' (or 401/403); nothing staged.
- **Oracle.** Refusal + no job rows for that user.
- **Trace.** P0 · automate · `VBU-044` · `app/policies/company_policy.rb:123-126`

#### API-XVBU-042 — The template endpoint refuses a user who may not upload
- **Why it matters.** bulk_create_vendor_template never calls authorize, so anyone signed in to the console app gets the workspace's category codes and profile types.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. As a user without company:create_record: GET /v1/bulk_create_vendor_template
- **Expected.** Refused like the upload itself (401/403/422 not authorised). Today: served.
- **Oracle.** Status.
- **Trace.** P2 · automate · `VBU-042` · `app/controllers/api/v1/companies_controller.rb:218-229 (no authorize)`

#### API-XVBU-045 — Uploading the error sheet back re-checks the rows (its Error column is ignored)
- **Why it matters.** The normal way to fix a big upload is: download the error sheet, correct it, upload it again. The error sheet has an extra 'Error' column first; it must not break the re-upload.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-045.xlsx`.
- **Steps.** 1. Upload a tripwired sheet 2. Download that job's error sheet 3. Upload the error sheet as it is 4. Compare the rows
- **Expected.** The re-uploaded job has the same rows with the same error ('Invalid Status').
- **Oracle.** Rows of both jobs.
- **Trace.** P1 · automate · `VBU-045` · `app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:336-359; app/services/conversions/excel_to_json_conversion_service.rb:168-181`

#### API-XVBU-046 — The upload screen's file picker offers only files the API can read
- **Why it matters.** The picker accepts .csv, which the API always refuses with 'Invalid file format' (VBU-007).
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: A screen check in the web app (UI automation).
- **Steps.** 1. Vendors → Bulk Upload → New Upload 2. Open the file picker and check the allowed types
- **Expected.** Only .xlsx / .xls. Today .csv is offered too.
- **Oracle.** The input's accept attribute.
- **Trace.** P2 · manual · `VBU-046` · `procol-client-dashboard/src/views/vendorBulkUpload/uploadExcelModal.jsx:124-128`

#### API-XVBU-047 — In onboarding mode the Bulk Upload link is hidden when manual creation is disabled
- **Why it matters.** The legacy vendor lists hide the link; the onboarding-mode page shows it with no check, and the API then answers 745.
- **Setup.** gate: disable_manual_vendor_creation is on. Data: creates nothing (every row stops in validation). Not automated: A screen check; needs a workspace with disable_manual_vendor_creation on.
- **Steps.** 1. On an onboarding (v2/v3) workspace with disable_manual_vendor_creation on, as a client user, open Vendors
- **Expected.** No Bulk Upload link (as on the legacy lists).
- **Oracle.** Link visibility.
- **Trace.** P2 · manual · `VBU-047` · `procol-client-dashboard/src/views/vendors/vendorOnboardingFlow/vendorOnboardingFlow.jsx:249-258`

#### API-XVBU-048 — The job list tags a job with failed or duplicate rows
- **Why it matters.** The page defines Error and Duplicate tags but the data mapping only ever assigns Completed / In Progress.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: A screen check in the web app.
- **Steps.** 1. Upload a sheet with a failed row 2. Open Vendors → Bulk Upload
- **Expected.** The job shows an Error tag (or its failed count stands out). Today: 'Completed'.
- **Oracle.** Tag on the job row.
- **Trace.** P3 · manual · `VBU-048` · `procol-client-dashboard/src/redux/vendors/index.js:4-9, 53-64`

#### API-XVBU-254 — The upload history counts a mixed upload correctly (Completed 1 · Failed 1)
- **Why it matters.** Coverage audit S-039: the counters a buyer reads in the Bulk Upload history (ctrl:251-268) were never asserted.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-254.xlsx`.
- **Steps.** 1. One valid row (onboarding No) and one tripwired row in one sheet 2. POST 3. Read GET /v1/bulk_create_vendor_status for the job
- **Expected.** History line for the job: Total 2 · Completed 1 · Failed 1 · Duplicate 0.
- **Oracle.** Status API counters.
- **Trace.** P1 · automate · `VBU-254` · `app/controllers/api/v1/companies_controller.rb:251-268`

#### API-XVBU-223 — The template uploaded as downloaded gives a sensible row error
- **Why it matters.** Coverage audit GAP-48. A buyer who uploads the template untouched sends its sample row. The runner sets that row's Status to the tripwire first, so even a corrected template (whose sample contact is a real procol.in address) creates nothing.
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation).
- **Steps.** 1. Download the template 2. Set the sample row's Status to QA_TRIPWIRE 3. Upload it
- **Expected.** The sample row lines up with its columns, so it reaches the Status check ('Invalid Status'). Today: 'Tax Type not configured…' because the row is shifted (BUG-12).
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-223` · `PR16267 app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:295-337; PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:24-25,86-95`

#### API-XVBU-224 — Error sheet for a job id that does not decode is refused 'Insufficient parameters'
- **Why it matters.** Coverage audit GAP-50.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. GET /v1/bulk_create_vendor_error_sheet?job_uuid=QA_NOT_A_UUID
- **Expected.** HTTP 422 'Insufficient parameters' (not 487, not 500).
- **Oracle.** HTTP status + message.
- **Trace.** P3 · automate · `VBU-224` · `app/controllers/concerns/params_auth.rb:74-75; app/controllers/api/v1/companies_controller.rb:235`

#### API-XVBU-225 — A user who may not upload cannot read the upload status list
- **Why it matters.** Coverage audit GAP-51: status, error sheet and onboarding payload are authorised like the upload (pol:128-134).
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. As a QA user without company:create_record: GET /v1/bulk_create_vendor_status
- **Expected.** HTTP 422 'You are not authorized to perform this action'.
- **Oracle.** HTTP status + message.
- **Trace.** P2 · automate · `VBU-225` · `app/policies/company_policy.rb:128-134; app/controllers/api/v1/companies_controller.rb:204`

#### API-XVBU-226 — A user who may not upload cannot download error sheets
- **Why it matters.** Coverage audit GAP-51.
- **Setup.** Data: creates nothing (every row stops in validation).
- **Steps.** 1. As a QA user without company:create_record: GET the error sheet
- **Expected.** HTTP 422 'You are not authorized to perform this action' (checked before the job id).
- **Oracle.** HTTP status + message.
- **Trace.** P2 · automate · `VBU-226` · `app/policies/company_policy.rb:128-134; app/controllers/api/v1/companies_controller.rb:233`

#### API-XVBU-231 — The error sheet's Vendor Profile dropdown sits on the Vendor Profile column
- **Why it matters.** Coverage audit GAP-49: the error sheet hard-codes the profile list on F4:F100 (tpl:97), but the column is E on PROCOL DEMO and H on GMMCO.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-231.xlsx`.
- **Steps.** 1. Upload a tripwired row 2. Download its error sheet 3. Compare the profile dropdown's range with the Vendor Profile column
- **Expected.** The 'Invalid Vendor Profile' dropdown covers the Vendor Profile column.
- **Oracle.** Error sheet data validations.
- **Trace.** P2 · automate · `VBU-231` · `app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:97`

## 3. Row rules — every column

#### API-XVBU-050 — Company Name blank is refused
- **Why it matters.** The one field that is mandatory in every configuration.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-050.xlsx`.
- **Steps.** 1. Tripwired row with Company Name blank 2. POST 3. Read the row
- **Expected.** Row failed 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **QA doc.** Covers A4 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-050` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:215-220`

#### API-XVBU-051 — Company Name of only spaces is refused
- **Why it matters.** '   ' is present to Excel but blank to Rails; it must not create a nameless vendor.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-051.xlsx`.
- **Steps.** 1. Company Name = three spaces
- **Expected.** Row failed 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-051` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:217 (.blank?)`

#### API-XVBU-052 — With contactless on, POC Full Name may be blank
- **Why it matters.** Suite A of the PR: the contact fields become optional.
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-052.xlsx`.
- **Steps.** 1. Tripwired row with POC - Full Name blank
- **Expected.** Row passes every rule before Status → failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P0 · automate · `VBU-052` · `PR16267 app/controllers/concerns/utils.rb:802,820`

#### API-XVBU-053 — With contactless on, POC Email may be blank
- **Why it matters.** On the old code a blank email fails verify_email ('Invalid Email') even when it is not mandatory; the PR must skip the format check for a blank value.
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-053.xlsx`.
- **Steps.** 1. Tripwired row with POC - Email Address blank
- **Expected.** Row failed 'Invalid Status' (email not required, not format-checked when blank).
- **Oracle.** Job row error.
- **Trace.** P0 · automate · `VBU-053` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:39`

#### API-XVBU-054 — With contactless on, Vendor Profile may be blank
- **Why it matters.** The live template lists Vendor Profile under Optional; a blank value must default to manufacturer, not fail.
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-054.xlsx`.
- **Steps.** 1. Tripwired row with Vendor Profile blank
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-054` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:186-192`

#### API-XVBU-055 — With contactless on, a supplied POC email is still format-checked
- **Why it matters.** Optional must not mean unvalidated (QA doc A3).
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-055.xlsx`.
- **Steps.** 1. Tripwired row with POC - Email Address 'not-an-email'
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **QA doc.** Covers A3 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-055` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:37,58-60`

#### API-XVBU-056 — With contactless on, a row with no tax number and no city/address passes validation
- **Why it matters.** QA doc A1: Company Name alone is a valid row. On the old code this was 'Either Tax No. or Without Tax No. fields are needed'.
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-056.xlsx`.
- **Steps.** 1. Tripwired row with Tax No., City and Address blank
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P0 · automate · `VBU-056` · `PR16267 app/controllers/concerns/utils.rb:828,842 (no Without-Tax group under contactless); app/services/validations/vendor_bulk_upload_validation_service_v2.rb:24-30`

#### API-XVBU-059 — Business Location 'India' + Tax Type GST resolves to the active GST mapping
- **Why it matters.** verify_tax_no does Country.find_by(name: 'India') with no order or status filter, then looks for an ACTIVE mapping for that one country row. The sandbox has 36 countries named 'India' (35 added 15-16 Jan 2026, all with inactive GST mappings), so which one Postgres returns first decides whether ANY GST row can be uploaded. 55 real rows failed this way in the last 60 days.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-059.xlsx`.
- **Steps.** 1. Tripwired row with Tax Type GST, a well-formed GSTIN {{gst}}, Business Location India
- **Expected.** Row passes the tax check → failed 'Invalid Status'. Failing with 'Tax Type not configured for the selected Business Location' means the duplicate-country trap fired.
- **Oracle.** Job row error; SELECT id FROM countries WHERE name='India' shows the duplicates.
- **Trace.** P0 · automate · `VBU-059` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:86-91 (find_by without order/active); countries table on the sandbox`

#### API-XVBU-060 — A valid GSTIN with Tax Type GST and Business Location India passes
- **Why it matters.** The tax path looks up Country and TaxType by exact name and matches the mapping's regex.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-060.xlsx`.
- **Steps.** 1. Tripwired row with Tax Type GST, Tax No. {{gst}}, Business Location India
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **QA doc.** Covers A2 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-060` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:82-100`

#### API-XVBU-061 — A lower-case GSTIN is refused
- **Why it matters.** The India GST regex is upper-case only and the value is not upcased first.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-061.xlsx`.
- **Steps.** 1. Tax No. = {{gst}} in lower case
- **Expected.** Row failed 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-061` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:92`

#### API-XVBU-062 — A GSTIN with a trailing space is accepted after trimming
- **Why it matters.** Values pasted into Excel often carry a trailing space; the regex is anchored and the value is never stripped, so a correct GSTIN fails.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-062.xlsx`.
- **Steps.** 1. Tax No. = '{{gst}} '
- **Expected.** Row failed 'Invalid Status' (the space ignored). Today likely 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-062` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:92 (no strip)`

#### API-XVBU-063 — A 14-character GSTIN is refused
- **Why it matters.** Length boundary below the 15-character GSTIN.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-063.xlsx`.
- **Steps.** 1. Tax No. = first 14 chars of {{gst}}
- **Expected.** Row failed 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-063` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:92`

#### API-XVBU-064 — A 16-character GSTIN is refused
- **Why it matters.** Length boundary above.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-064.xlsx`.
- **Steps.** 1. Tax No. = {{gst}} + 'X'
- **Expected.** Row failed 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-064` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:92`

#### API-XVBU-065 — Tax No. without Tax Type is refused
- **Why it matters.** Business Location and Tax Type are both needed to pick the regex.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-065.xlsx`.
- **Steps.** 1. Tax No. set, Tax Type blank
- **Expected.** Row failed 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-065` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:83-85`

#### API-XVBU-066 — Tax No. without Business Location is refused
- **Why it matters.** Same guard, other field.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-066.xlsx`.
- **Steps.** 1. Tax No. set, Business Location blank
- **Expected.** Row failed 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-066` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:83-85`

#### API-XVBU-067 — VAT for India (a pair with no mapping) is refused with the 'not configured' message
- **Why it matters.** The Tax Type dropdown offers GST and VAT for every country; VAT+India has no TaxTypeCountryMapping.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-067.xlsx`.
- **Steps.** 1. Tax Type VAT, Business Location India
- **Expected.** Row failed 'Tax Type not configured for the selected Business Location'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-067` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:86-91; app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:284-286 (GST, VAT hard-coded)`

#### API-XVBU-068 — Business Location typed in lower case ('india') is refused
- **Why it matters.** Country.find_by(name:) is an exact, case-sensitive match; a typed value (not from the dropdown) fails with a misleading message.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-068.xlsx`.
- **Steps.** 1. Business Location = 'india'
- **Expected.** Row failed 'Tax Type not configured for the selected Business Location' (documents the case sensitivity).
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-068` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:86`

#### API-XVBU-069 — Tax Type typed in lower case ('gst') is refused
- **Why it matters.** TaxType.find_by(name:) is exact too.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-069.xlsx`.
- **Steps.** 1. Tax Type = 'gst'
- **Expected.** Row failed 'Tax Type not configured for the selected Business Location'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-069` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:87`

#### API-XVBU-070 — The tax error wins over a missing Company Name
- **Why it matters.** Pins the error order: the tax check runs first, so a row broken twice reports tax.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-070.xlsx`.
- **Steps.** 1. Invalid Tax No. AND Company Name blank
- **Expected.** Row failed 'Invalid Tax No.'.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-070` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:46-54`

#### API-XVBU-071 — A valid UK VAT number with Business Location United Kingdom passes
- **Why it matters.** International vendors: VAT + a non-India country uses a different regex.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-071.xlsx`.
- **Steps.** 1. Tax Type VAT, Tax No. GB123456789, Business Location United Kingdom
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-071` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:82-100`

#### API-XVBU-072 — A Tax No. typed as a number cell is refused cleanly
- **Why it matters.** A numeric cell reaches the parser as a Float; it is stringified before .match?, so it must fail the regex, not raise.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-072.xlsx`.
- **Steps.** 1. Tax No. = 123456789012345 as a NUMBER cell
- **Expected.** Row failed 'Invalid Tax No.'; no worker crash.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-072` · `app/services/conversions/excel_to_json_conversion_service.rb:176; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:92`

#### API-XVBU-073 — PAN No. that is not a PAN is accepted (no format check — known gap)
- **Why it matters.** The PR adds the column; its QA doc lists PAN format validation as out of scope. Pinned so a later change is noticed.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-073.xlsx`.
- **Steps.** 1. PAN No. = 'NOT-A-PAN'
- **Expected.** Row failed 'Invalid Status' (PAN not validated).
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-073` · `PR16267 app/controllers/concerns/utils.rb:905 (strip+upcase only, no format check); QA doc 'Out of scope'`

#### API-XVBU-074 — PAN No. that contradicts the GSTIN is accepted (no cross-check — known gap)
- **Why it matters.** Characters 3-12 of a GSTIN are the PAN. A different PAN in the PAN column is stored side by side with it.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-074.xlsx`.
- **Steps.** 1. Valid GST {{gst}}; PAN No. = ABCDE1234F
- **Expected.** Row failed 'Invalid Status' today. Recommended: refuse 'PAN does not match GST'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-074` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:106-118 (PAN derived from GST under contactless); PR16267 app/controllers/concerns/utils.rb:905 (the PAN No. column then overwrites it)`

#### API-XVBU-075 — A city that is not in the master (no tax number) does not become a random city
- **Why it matters.** Old code: 'Invalid City Name'. QA doc A5: 'Success. Record created with no city'. The company builder defaults a missing city to id 38 ('-'). Status=rejected keeps the row mail-free if it is created.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-075.xlsx`.
- **Steps.** 1. Status rejected, City 'QA Nowhere {{stamp}}', no Tax No. 2. POST 3. Read the row and the vendor
- **Expected.** Per the PR's QA doc: success, vendor stored with NO city (city_id null, or the '-' placeholder 38). Never a city id that does not exist.
- **Oracle.** Row status + companies.city_id.
- **Spec vs code.** Found 2026-09-29: the unresolved city NAME is passed as city_id and cast to 0, so the vendor points at a city that does not exist (see VBU-154 for the crash it causes).
- **QA doc.** Covers A5 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-075` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:77 (city error skipped under contactless); app/controllers/concerns/utils.rb:877-884 ('City' → key city_id holds the NAME); PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:27 (params city_id present, so no fallback)`

#### API-XVBU-076 — A one-letter city ('a') is not fuzzy-matched to some real city
- **Why it matters.** City lookup falls back to name ILIKE '%a%' and takes the first alphabetically — any typo becomes a real, wrong city.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-076.xlsx`.
- **Steps.** 1. Status rejected, City 'a', no Tax No.
- **Expected.** Either refused 'Invalid City Name' or stored with no city — never a city the buyer didn't name. Today: the first city containing 'a'.
- **Oracle.** companies.city_id → cities.name.
- **Trace.** P1 · automate · `VBU-076` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:122-131; app/models/city.rb:30 (ILIKE %x%)`

#### API-XVBU-154 — A second vendor with the tax number of a 'no city' vendor does not crash the upload
- **Why it matters.** A contactless row with an unknown city is stored with city_id 0 (VBU-075). When a later row carries the same tax number but no City/Address, the invite looks the tax number up and reads existing_company.city.name — on a city that does not exist.
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Baseline (uploaded first): UK VAT {{vatF}}, City 'QA Nowhere {{stamp}}', address set, onboarding No — stored with city_id 0. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-154.xlsx`.
- **Steps.** 1. Upload the baseline 2. Upload a second row: same tax number {{vatF}}, a different name, City and Address blank, onboarding No 3. Read the second row
- **Expected.** The row is handled cleanly — refused 'Vendor with this GST and address already exists' (the back-filled address matches) — not a worker error.
- **Oracle.** Job row error; a worker 'Internal error …' is the async 500.
- **QA doc.** Covers A5 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-154` · `app/helpers/api/companies_helper.rb:731-745 (existing_company.city.name); app/services/invitation/send_service.rb:41-54`

#### API-XVBU-080 — An email with no @ is refused
- **Why it matters.** The basic case.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-080.xlsx`.
- **Steps.** 1. POC - Email Address = not-an-email
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P0 · automate · `VBU-080` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-081 — An email with no top-level domain is refused
- **Why it matters.** VALID_EMAIL_REGEX needs a dot-TLD.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-081.xlsx`.
- **Steps.** 1. POC - Email Address = qa_{{stamp}}@example
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-081` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-082 — An email with a space inside is refused
- **Why it matters.** Excel users paste 'first last@…'.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-082.xlsx`.
- **Steps.** 1. POC - Email Address = qa {{stamp}}@example.com
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-082` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-083 — An email with consecutive dots is refused
- **Why it matters.** The regex allows [\w+\-.&]+ in the local part, so 'a..b' passes although no mail server accepts it.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-083.xlsx`.
- **Steps.** 1. POC - Email Address = qa..{{stamp}}@example.com
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-083` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-084 — An email whose local part is over 64 characters is refused
- **Why it matters.** RFC 5321 caps the local part at 64; the regex has no length limit.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-084.xlsx`.
- **Steps.** 1. POC - Email Address = qa_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@example.com
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-084` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-085 — Two emails in one cell are refused
- **Why it matters.** A common Excel habit; must not be sent a single invite to a comma list.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-085.xlsx`.
- **Steps.** 1. POC - Email Address = qa_{{stamp}}_a@example.com, qa_{{stamp}}_b@example.com
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-085` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-086 — A non-ASCII domain is refused
- **Why it matters.** The regex is ASCII-only.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-086.xlsx`.
- **Steps.** 1. POC - Email Address = qa_{{stamp}}@exämple.com
- **Expected.** Row failed 'Invalid Email'.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-086` · `app/controllers/concerns/utils.rb:13 (VALID_EMAIL_REGEX), 506-509; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:147-151`

#### API-XVBU-087 — An upper-case email is accepted
- **Why it matters.** The regex is case-insensitive; the invite matches users with lower(email).
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-087.xlsx`.
- **Steps.** 1. POC - Email Address = 'QA_VBU_{{stamp}}_087@EXAMPLE.COM'
- **Expected.** Row failed 'Invalid Status' (email accepted).
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-087` · `app/controllers/concerns/utils.rb:13; app/helpers/api/companies_helper.rb:687-690`

#### API-XVBU-088 — An email with spaces around it is accepted after trimming
- **Why it matters.** The upload helper strips POC emails before staging.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-088.xlsx`.
- **Steps.** 1. POC - Email Address = '  qa_vbu_{{stamp}}_088@example.com  '
- **Expected.** Row failed 'Invalid Status' (email accepted).
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-088` · `app/controllers/concerns/utils.rb:13; app/helpers/api/companies_helper.rb:687-690`

#### API-XVBU-089 — An email with a +tag is accepted
- **Why it matters.** Plus-addressing is legal and common.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-089.xlsx`.
- **Steps.** 1. POC - Email Address = 'qa_vbu_{{stamp}}_089+tag@example.com'
- **Expected.** Row failed 'Invalid Status' (email accepted).
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-089` · `app/controllers/concerns/utils.rb:13; app/helpers/api/companies_helper.rb:687-690`

#### API-XVBU-090 — An invalid POC 2 email is refused
- **Why it matters.** The second contact gets its own invite; its email is checked separately.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-090.xlsx`.
- **Steps.** 1. POC 2 - Full Name set, POC 2 - Email Address 'bad@'
- **Expected.** Row failed 'Invalid Email 2'.
- **Oracle.** Job row error (exact).
- **Trace.** P1 · automate · `VBU-090` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:38-40,61-63`

#### API-XVBU-091 — Deals In with an unknown category is refused and names it
- **Why it matters.** Deals In ties the vendor to category teams; an unknown code must be named in the error.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-091.xlsx`.
- **Steps.** 1. Deals In = QA_NOT_A_CATEGORY
- **Expected.** Row failed 'Invalid Deals In : QA_NOT_A_CATEGORY'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-091` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:161-179`

#### API-XVBU-092 — Deals In with a valid category code passes
- **Why it matters.** The template's Data Sheet lists the codes; one must be accepted.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-092.xlsx`.
- **Steps.** 1. Deals In = {{categoryUuid}}
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-092` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:165-169`

#### API-XVBU-093 — Deals In 'valid,unknown' refuses the unknown one
- **Why it matters.** verify_deals_in RETURNS 'valid' on the first good code, so every code after it is never checked — the garbage one is silently dropped (or decoded to nil).
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-093.xlsx`.
- **Steps.** 1. Deals In = {{categoryUuid}},QA_NOT_A_CATEGORY
- **Expected.** Row failed 'Invalid Deals In : QA_NOT_A_CATEGORY'. Today likely 'Invalid Status' (the bad code slipped through).
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-093` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:165-170 (return on first valid id)`

#### API-XVBU-094 — Deals In 'unknown,valid' refuses the unknown one
- **Why it matters.** The mirror of VBU-093 — shows the result depends only on order.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-094.xlsx`.
- **Steps.** 1. Deals In = QA_NOT_A_CATEGORY,{{categoryUuid}}
- **Expected.** Row failed 'Invalid Deals In : QA_NOT_A_CATEGORY'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-094` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:171-175`

#### API-XVBU-095 — 'manufacturer' is refused where the workspace defines its own profiles
- **Why it matters.** With vendor_category_type_mapping set, only its keys are valid — the QA doc's 'manufacturer or brokerage' is wrong for GMMCO.
- **Setup.** gate: vendor_category_type_mapping defines the workspace's own profiles. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-095.xlsx`.
- **Steps.** 1. Vendor Profile = manufacturer
- **Expected.** Row failed 'Invalid Vendor Profile'.
- **Oracle.** Job row error.
- **Spec vs code.** QA doc lists manufacturer/brokerage as the valid profiles.
- **Trace.** P1 · automate · `VBU-095` · `app/controllers/concerns/utils.rb:847-857; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:189-192`

#### API-XVBU-096 — The profile's display label is refused (the key is required)
- **Why it matters.** Buyers see 'Manufacturer/Trader' in the product; the sheet needs 'manufacturer_trader'.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-096.xlsx`.
- **Steps.** 1. Vendor Profile = Manufacturer/Trader
- **Expected.** Row failed 'Invalid Vendor Profile'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-096` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:189`

#### API-XVBU-097 — The profile key in upper case is accepted
- **Why it matters.** The match is case-insensitive.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-097.xlsx`.
- **Steps.** 1. Vendor Profile = {{profile}} upper-cased
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-097` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:189`

#### API-XVBU-098 — A profile with a trailing space is accepted after trimming
- **Why it matters.** Status and onboarding values are stripped before comparing; the profile is not — inconsistent, and a common copy-paste result.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-098.xlsx`.
- **Steps.** 1. Vendor Profile = '{{profile}} '
- **Expected.** Row failed 'Invalid Status'. Today likely 'Invalid Vendor Profile'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-098` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:189 (no strip) vs 199 (strip)`

#### API-XVBU-100 — An unknown Status is refused
- **Why it matters.** Only blank, active and rejected are allowed.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-100.xlsx`.
- **Steps.** 1. Status = banana (onboarding tripwire behind it)
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-100` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:196-202`

#### API-XVBU-101 — Status 'blacklisted' is refused
- **Why it matters.** A real BSCM status, but not one the sheet may set.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-101.xlsx`.
- **Steps.** 1. Status = blacklisted
- **Expected.** Row failed 'Invalid Status'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-101` · `app/controllers/concerns/utils.rb:836 (vendor_status_types)`

#### API-XVBU-102 — Status '  REJECTED  ' is accepted (trimmed, any case)
- **Why it matters.** Pins the strip/downcase the validator does.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-102.xlsx`.
- **Steps.** 1. Status = '  REJECTED  '
- **Expected.** Row passes Status and stops at the onboarding tripwire: 'Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-102` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:199-200`

#### API-XVBU-105 — 'Vendor Onboarding Required' = 'Maybe' is refused
- **Why it matters.** Anything but Yes/No must fail loudly: a silently-ignored value decides whether the vendor is onboarded. Status=rejected keeps the row mail-free even if the rule is broken.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-105.xlsx`.
- **Steps.** 1. Status rejected, Vendor Onboarding Required = Maybe
- **Expected.** Row failed 'Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown'.
- **Oracle.** Job row error.
- **QA doc.** Covers D6 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-105` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:204-213`

#### API-XVBU-106 — 'Vendor Onboarding Required' = 'N' is refused
- **Why it matters.** Anything but Yes/No must fail loudly: a silently-ignored value decides whether the vendor is onboarded. Status=rejected keeps the row mail-free even if the rule is broken.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-106.xlsx`.
- **Steps.** 1. Status rejected, Vendor Onboarding Required = N
- **Expected.** Row failed 'Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown'.
- **Oracle.** Job row error.
- **QA doc.** Covers D6 of the PR's QA document.
- **Trace.** P2 · automate · `VBU-106` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:204-213`

#### API-XVBU-107 — 'Vendor Onboarding Required' = 'true' is refused
- **Why it matters.** Anything but Yes/No must fail loudly: a silently-ignored value decides whether the vendor is onboarded. Status=rejected keeps the row mail-free even if the rule is broken.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-107.xlsx`.
- **Steps.** 1. Status rejected, Vendor Onboarding Required = true
- **Expected.** Row failed 'Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown'.
- **Oracle.** Job row error.
- **QA doc.** Covers D6 of the PR's QA document.
- **Trace.** P2 · automate · `VBU-107` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:204-213`

#### API-XVBU-108 — 'Vendor Onboarding Required' = 'yess' is refused
- **Why it matters.** Anything but Yes/No must fail loudly: a silently-ignored value decides whether the vendor is onboarded. Status=rejected keeps the row mail-free even if the rule is broken.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-108.xlsx`.
- **Steps.** 1. Status rejected, Vendor Onboarding Required = yess
- **Expected.** Row failed 'Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown'.
- **Oracle.** Job row error.
- **QA doc.** Covers D6 of the PR's QA document.
- **Trace.** P2 · automate · `VBU-108` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:204-213`

#### API-XVBU-110 — A 101-character Vendor Code is refused before anything is created
- **Why it matters.** The worker checks size > 100 and marks the row failed before the invite runs.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-110.xlsx`.
- **Steps.** 1. Valid row (onboarding No), Vendor Code = 101 × 'V'
- **Expected.** Row failed 'Invalid Value for Vendor Code.'; no vendor created.
- **Oracle.** Job row + no company.
- **Trace.** P1 · automate · `VBU-110` · `app/workers/vendor_bulk_upload_worker_v2.rb:106-113`

#### API-XVBU-111 — A 100-character Vendor Code is accepted
- **Why it matters.** The boundary itself.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-111.xlsx`.
- **Steps.** 1. Valid row (onboarding No), Vendor Code = 100 chars
- **Expected.** Row success; vendor Active with that code.
- **Oracle.** Job row + BSCM vendor_code.
- **Trace.** P2 · automate · `VBU-111` · `app/workers/vendor_bulk_upload_worker_v2.rb:108`

#### API-XVBU-112 — An Account Group that is not one of the dropdown's options is refused
- **Why it matters.** GMMCO configures Account Group as a DROPDOWN (ZCOV, ZDGS, …) that feeds SAP. The single-vendor form enforces the list; the bulk path stores any text.
- **Setup.** gate: extra_fields_for_vendor_invite has a 'Account Group' column. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-112.xlsx`.
- **Steps.** 1. Account Group = QA_NOT_A_GROUP
- **Expected.** Row failed with an Account Group error. Today likely 'Invalid Status' (value accepted).
- **Oracle.** Job row error.
- **Spec vs code.** QA doc models Account Group as free text and uses 'ZDOM', which is not one of GMMCO's options.
- **QA doc.** Covers A7 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-112` · `app/services/vpc_network/concerns/vpc_params_mixin.rb:41-60 (stores any value); custom config extra_fields_for_vendor_invite type=dropdown`

#### API-XVBU-200 — Contactless OFF: a tax number with an unknown city is refused, not saved as city 0
- **Why it matters.** Coverage audit GAP-07. 'Invalid City Name' fires only when Tax No. is blank (val:77); with a tax number the unknown city name is cast to city_id 0 — BUG-10 reached on a normal workspace. Status rejected keeps the row mail-free if it is wrongly created.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_invitation_v2 is off. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-200.xlsx`.
- **Steps.** 1. Row with UK VAT {{vatK}}, City 'QA Nowhere <stamp>', Status rejected, PD's required extra fields 2. POST 3. Read the row and the vendor
- **Expected.** Row failed 'Invalid City Name'; no vendor. Per the code: success and the vendor saved with city_id 0.
- **Oracle.** Job row + companies lookup.
- **Trace.** P1 · automate · `VBU-200` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:35-37,77; PR16267 app/controllers/concerns/utils.rb:892; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:27`

#### API-XVBU-201 — Contactless OFF: a blank Vendor Profile is refused as mandatory
- **Why it matters.** Coverage audit GAP-08: the mandatory rule for Vendor Profile (utils:803-805) had no case on a normal workspace.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_invitation_v2 is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-201.xlsx`.
- **Steps.** 1. Tripwired row with Vendor Profile blank
- **Expected.** Row failed 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-201` · `PR16267 app/controllers/concerns/utils.rb:803-805; PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:33,56-58`

#### API-XVBU-202 — Contactless OFF: a blank POC - Full Name is refused as mandatory
- **Why it matters.** Coverage audit GAP-09.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_invitation_v2 is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-202.xlsx`.
- **Steps.** 1. Tripwired row with POC - Full Name blank
- **Expected.** Row failed 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-202` · `PR16267 app/controllers/concerns/utils.rb:801-802`

#### API-XVBU-203 — Contactless OFF: no tax number and no Address is refused ('Either Tax No. or …')
- **Why it matters.** Coverage audit GAP-10: without a tax number, City AND Address are both needed.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_invitation_v2 is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-203.xlsx`.
- **Steps.** 1. Tripwired row with Address blank, no tax
- **Expected.** Row failed 'Either Tax No. or Without Tax No. fields are needed'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-203` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:27-31,51`

#### API-XVBU-204 — Contactless OFF: Tax Type and Business Location filled but Tax No. blank
- **Why it matters.** Coverage audit GAP-54: with Tax No. blank the tax columns are ignored and the no-tax rule applies.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_invitation_v2 is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-204.xlsx`.
- **Steps.** 1. Tripwired row: Tax Type GST, Business Location India, Tax No., City and Address blank
- **Expected.** Row failed 'Either Tax No. or Without Tax No. fields are needed'.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-204` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:24-31`

#### API-XVBU-205 — Deals In with ANOTHER workspace's category code is refused
- **Why it matters.** Coverage audit GAP-13: the code must be one of this workspace's categories (val:172-179); a code copied from another client must not pass.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-205.xlsx`.
- **Steps.** 1. Tripwired row whose Deals In is a category code of the other test client (read from its own run)
- **Expected.** Row failed 'Invalid Deals In : <that code>'.
- **Oracle.** Job row error.
- **Trace.** P2 · automate · `VBU-205` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:157-159,172-179`

## 4. What a row creates: Prospect vs Vendor, Status, POC 2

#### API-XVBU-119 — A full row (UK VAT) with 'Onboarding Required = No' becomes an Active vendor with every field stored
- **Why it matters.** The same non-PQ path as VBU-120 with a tax number the sandbox can resolve — so the creation, routing and storage can be verified even while GST rows are blocked (VBU-059).
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); extra_fields_for_vendor_invite has a 'Account Group' column. Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-119.xlsx`.
- **Steps.** 1. Row with UK VAT, city, address, pincode, PAN, profile 2, POC, POC 2, Account Group, MSME, bank, onboarding No 2. POST 3. Read the vendor, mapping and invitations
- **Expected.** Row success. Vendor Active (Vendors tab); 2 invitations (POC + POC 2), BOTH with skip_vendor_onboarding=true; tax number, PAN, address, city, pincode (digits only) and the extra fields stored; no 'new prospect' mail. Found 2026-10-05: the POC 2 invitation carries no skip flag, so the vendor-management team is mailed (BUG-29) — hence the real-mail tier.
- **Oracle.** companies / buyer_seller_company_mappings / invitations rows.
- **QA doc.** Covers A6, A7, D2 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-119` · `app/workers/vendor_bulk_upload_worker_v2.rb:92-99,141-158; app/services/invitation/send_service.rb:386-393,407-434; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:42-47; PR16267 app/controllers/concerns/utils.rb:904-905`

#### API-XVBU-120 — A full row with 'Onboarding Required = No' becomes an Active vendor with every field stored
- **Why it matters.** The non-PQ path: skip onboarding, land straight on the Vendors tab, carry every column into the vendor record.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); extra_fields_for_vendor_invite has a 'Account Group' column. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-120.xlsx`.
- **Steps.** 1. Row with GST, PAN, city, address, pincode, profile 2, POC, Account Group, MSME, bank, onboarding No (no POC 2: its invitation would mail the vendor-management team, BUG-29) 2. POST 3. Read the vendor, mapping and invitations
- **Expected.** Row success. Vendor Active (Vendors tab); 1 invitation (the POC) with skip_vendor_onboarding=true; GST, PAN, address, city and the extra fields stored; no 'new prospect' mail (skip flag). POC 2 is left out on purpose — see VBU-119 / BUG-29.
- **Oracle.** companies / buyer_seller_company_mappings / invitations rows.
- **QA doc.** Covers A2 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-120` · `app/workers/vendor_bulk_upload_worker_v2.rb:92-99,141-158; app/services/invitation/send_service.rb:386-393,407-434; app/models/invitations.rb:125-140; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:42-47 (pincode → misc.pincode)`

#### API-XVBU-121 — Company Name only + 'No' creates an Active vendor with NO invitation
- **Why it matters.** QA doc: 'a contactless load sends ZERO invite emails' and leaves no invitations row.
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-121.xlsx`.
- **Steps.** 1. Row: Company Name only, onboarding No 2. POST 3. Read the vendor and its invitations
- **Expected.** Row success; vendor Active; 0 invitations; therefore no mail.
- **Oracle.** BSCM + invitations count.
- **QA doc.** Covers A1, A-no-mail, D6 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-121` · `PR16267 app/services/invitation/send_service.rb:332-337 (no Invitations row when the email is blank)`

#### API-XVBU-122 — Company Name only, onboarding left blank → Prospect, still no mail
- **Why it matters.** Blank means 'onboarding required' → the vendor must sit in Prospects. With no contact there is no invitation, so no mail — including the vendor-management notice.
- **Setup.** gate: allow_contactless_vendor_upload is on; vendor_onboarding_version is v2. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-122.xlsx`.
- **Steps.** 1. Row: Company Name only 2. POST 3. Read the mapping and invitations
- **Expected.** Row success; vendor in Prospects (status invited); 0 invitations.
- **Oracle.** BSCM + invitations.
- **QA doc.** Covers A1, A-no-mail of the PR's QA document.
- **Trace.** P0 · automate · `VBU-122` · `app/workers/vendor_bulk_upload_worker_v2.rb:66-71,93; app/services/vpc_network/create_service.rb:240-249; PR16267 app/services/invitation/send_service.rb:332-337 (no invitation → no after_commit mail)`

#### API-XVBU-123 — A full row with 'Onboarding Required = Yes' becomes a Prospect
- **Why it matters.** The PQ path: the vendor waits in Prospects until onboarding. The invite mails the POC AND tells the vendor-management team a prospect was added.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-123.xlsx`.
- **Steps.** 1. Row with contact, onboarding Yes 2. POST 3. Read the mapping and invitation
- **Expected.** Row success; vendor in Prospects (invited); invitation active without the skip flag; 'new prospect added' mail queued to the vendor-management team.
- **Oracle.** BSCM + invitation.other_details.
- **Trace.** P0 · automate · `VBU-123` · `app/services/vpc_network/create_service.rb:240-243; app/models/invitations.rb:125-140`

#### API-XVBU-124 — Onboarding Required left blank means Yes (Prospect)
- **Why it matters.** The default must be the safe one: onboarding required.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-124.xlsx`.
- **Steps.** 1. Row with contact, onboarding blank
- **Expected.** Row success; vendor in Prospects.
- **Oracle.** BSCM.
- **Trace.** P1 · automate · `VBU-124` · `app/workers/vendor_bulk_upload_worker_v2.rb:66-71`

#### API-XVBU-125 — Status 'rejected' lands the vendor on the Rejected tab and creates its user
- **Why it matters.** Rejected vendors are imported for history; the worker also creates a user for the POC so the record is complete, and no mail is sent.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-125.xlsx`.
- **Steps.** 1. Row with contact, Status rejected, onboarding No
- **Expected.** Row success; mapping rejected; invitation rejected (no mail); one user mapped to the vendor.
- **Oracle.** BSCM + invitation + user_company_mappings.
- **Trace.** P1 · automate · `VBU-125` · `app/workers/vendor_bulk_upload_worker_v2.rb:28-35,159-171; app/services/invitation/send_service.rb:379-393`

#### API-XVBU-126 — Status 'rejected' wins over 'Onboarding Required = Yes'
- **Why it matters.** Two routing columns disagree; rejected must win and nothing must be mailed.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-126.xlsx`.
- **Steps.** 1. Status rejected, onboarding Yes
- **Expected.** Row success; mapping rejected; invitation rejected.
- **Oracle.** BSCM.
- **Trace.** P2 · automate · `VBU-126` · `app/services/vpc_network/create_service.rb:241 (status != rejected)`

#### API-XVBU-127 — ' no ' (any case, spaces) skips onboarding
- **Why it matters.** The worker trims and compares case-insensitively; a typed value must behave like the dropdown's.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-127.xlsx`.
- **Steps.** 1. Onboarding Required = ' no '
- **Expected.** Row success; vendor Active.
- **Oracle.** BSCM.
- **QA doc.** Covers D6 of the PR's QA document.
- **Trace.** P2 · automate · `VBU-127` · `app/workers/vendor_bulk_upload_worker_v2.rb:66-71; app/services/validations/vendor_bulk_upload_validation_service_v2.rb:208-212`

#### API-XVBU-128 — POC 2 name without an email is refused BEFORE the vendor is created
- **Why it matters.** The POC 2 pair is only checked after the invite has run: the vendor and its invitation already exist when the row is marked failed. Re-uploading the corrected row then hits 'already exists'.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-128.xlsx`.
- **Steps.** 1. Valid row (onboarding No) + POC 2 - Full Name, no POC 2 email 2. POST 3. Look for the vendor
- **Expected.** Row failed 'Invalid Values for POC 2.' and NO vendor created. Today: failed, but the vendor was created and invited.
- **Oracle.** Job row + companies lookup.
- **Trace.** P1 · automate · `VBU-128` · `app/workers/vendor_bulk_upload_worker_v2.rb:141-158 (invite) then 175-179 (POC 2 check)`

#### API-XVBU-129 — Contactless with an email but no POC name is invited with a blank name
- **Why it matters.** One half of a contact is the likeliest real-world legacy row. The PR skips the 'POC name is not present' check for the whole workspace, so the invite goes out with no name.
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-129.xlsx`.
- **Steps.** 1. Company Name + POC email, no POC name, onboarding No
- **Expected.** Row success with ONE invitation to the POC email and an empty POC name (the PR skips error 691 'POC name is not present' for every contactless-workspace invite). Worth a product decision: the invite mail greets nobody.
- **Oracle.** Job row + invitation.
- **Trace.** P1 · automate · `VBU-129` · `PR16267 app/services/invitation/send_service.rb:309 (name check skipped when contactless)`

#### API-XVBU-130 — The same POC email on two rows (no tax number) — second row says 'already invited'
- **Why it matters.** Duplicate emails are deliberately allowed into staging (subsidiary flow). With no tax number or code the second row must be refused 688. Rows run in parallel workers, so both may pass the check — a race.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-130.xlsx`.
- **Steps.** 1. Two valid rows (onboarding No), different names, same POC email 2. POST
- **Expected.** One row success, the other failed 'This email is already invited.'. Two successes = race defect.
- **Oracle.** Job rows.
- **Spec vs code.** Lead said duplicate emails 'appear to be accepted' — confirmed intentional at staging (comment at companies_helper.rb:703); refused per row at invite time.
- **Trace.** P1 · automate · `VBU-130` · `app/helpers/api/companies_helper.rb:686-703 (duplicates kept on purpose); app/services/invitation/send_service.rb:233-253`

#### API-XVBU-131 — Same POC email with a tax number becomes a subsidiary — and keeps 'No'
- **Why it matters.** Error 689 routes to SubsidiaryService, whose invitation other_details has no skip_vendor_onboarding, so a non-PQ subsidiary still triggers the 'new prospect' mail. Real-mail tier because of exactly that mail.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Baseline (uploaded first): contact qa_vbu_{{stamp}}_sub@example.com, UK VAT {{vatG}}, onboarding No. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-131.xlsx`.
- **Steps.** 1. Upload the baseline 2. Upload a second row: same contact email, a different UK VAT, onboarding No 3. Read the new vendor's mapping and invitation
- **Expected.** Row success as a subsidiary; mapping Active; its invitation carries skip_vendor_onboarding=true, so no prospect mail. Code today omits the flag.
- **Oracle.** invitations.other_details of the subsidiary.
- **Trace.** P1 · automate · `VBU-131` · `app/services/invitation/send_service.rb:84-87; app/services/vpc_network/subsidiary_service.rb:199-235; app/models/invitations.rb:135-138`

#### API-XVBU-132 — An upload carrying an onboarding payload is accepted and still checks every row
- **Why it matters.** The API accepts configurations{order_type: vendor_onboarding} + forms beside excel_data (the web app never sends it). The payload adds a permission check; a tripwired row proves the rows are still validated and no event is created for a failed row.
- **Setup.** gate: vendor_onboarding_version is v2. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-132.xlsx`.
- **Steps.** 1. Resolve a vendor_onboarding template and its forms 2. POST excel_data + configurations + forms with one tripwired row
- **Expected.** HTTP 200; the row failed 'Invalid Status'; no onboarding event for it.
- **Oracle.** Job row.
- **Spec vs code.** Client never sends configurations/forms with the bulk upload (uploadExcelModal.jsx sends only excel_data).
- **Trace.** P2 · automate · `VBU-132` · `app/helpers/api/companies_helper.rb:716-729; app/controllers/api/v1/companies_controller.rb:201-204; app/workers/vendor_bulk_upload_worker_v2.rb:195-197`

#### API-XVBU-134 — An onboarding payload starts onboarding for a 'Yes' row
- **Why it matters.** With the payload, each row that needs onboarding gets an onboarding event straight away — the vendor and evaluators are mailed, hence the real-mail tier.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_onboarding_version is v2. Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-134.xlsx`.
- **Steps.** 1. POST excel_data + configurations + forms with one row, onboarding Yes 2. Read the vendor
- **Expected.** Row success; vendor in Prospects with an onboarding event started (Onboarding In Progress once the vendor opens it).
- **Oracle.** Row + mapping; event visible under Start Onboarding.
- **Trace.** P2 · automate · `VBU-134` · `app/workers/vendor_bulk_upload_worker_v2.rb:195-197; app/workers/vendor_onboarding_event_worker.rb:10-41`

#### API-XVBU-133 — The manual Invite Vendor form still requires a contact on a contactless workspace
- **Why it matters.** contactless_vendor_record? looks only at the workspace flag, and SendService serves every invite path. The ordinary Invite Vendor form now accepts a blank POC name and email. Skip onboarding + no email keeps the test mail-free.
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com.
- **Steps.** 1. POST /invitations/send_invite with a company name, city and address, no POC name, no email, skip_vendor_onboarding=true
- **Expected.** HTTP 422 'Email Not Present' (the form is for vendors with a contact). Today: the vendor is created with no invitation.
- **Oracle.** HTTP status + companies lookup.
- **Spec vs code.** QA doc D7: 'Manual Invite Vendor form, normal vendor → Unchanged'. The PR changes it for contactless workspaces.
- **QA doc.** Covers D7 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-133` · `PR16267 app/services/invitation/send_service.rb:351-354 (workspace-wide), 309, 332, 457; app/controllers/api/invitations_controller.rb send_invite`

#### API-XVBU-210 — POC 2 email without a name is refused BEFORE the vendor is created
- **Why it matters.** Coverage audit GAP-28, the mirror of BUG-07 (name without email). The POC 2 pair is checked after the vendor and its invite exist. No POC 2 invitation is made on this branch, so no mail.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-210.xlsx`.
- **Steps.** 1. Row with POC 2 - Email Address filled, POC 2 - Full Name blank 2. POST 3. Read the row and the vendor
- **Expected.** Row failed 'Invalid Values for POC 2.' and NO vendor created.
- **Oracle.** Job row + companies lookup.
- **Trace.** P2 · automate · `VBU-210` · `app/workers/vendor_bulk_upload_worker_v2.rb:175-179`

#### API-XVBU-219 — Deals In with a valid category code puts the vendor in that category's team
- **Why it matters.** Coverage audit GAP-12: the category link itself (a teams row on the vendor) had no check.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-219.xlsx`.
- **Steps.** 1. Row with Deals In = one of the workspace's category codes 2. POST 3. Read the vendor's teams
- **Expected.** Row success; the vendor is in one category team.
- **Oracle.** teams rows (SELECT).
- **Trace.** P2 · automate · `VBU-219` · `app/controllers/concerns/teams_create_concern.rb:23-48`

#### API-XVBU-220 — Deals In by category NAME is either refused or linked — never accepted and dropped
- **Why it matters.** Coverage audit GAP-11: a unique category name passes validation, but the worker decodes it as a code (nil), so no team is made — the category silently disappears.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-220.xlsx`.
- **Steps.** 1. Row with Deals In = a category NAME 2. POST 3. Read the vendor's teams
- **Expected.** Row success and the vendor is in that category's team (or the row is refused). Per the code: success and NO team.
- **Oracle.** teams rows (SELECT).
- **Trace.** P1 · automate · `VBU-220` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:176-179; PR16267 app/controllers/concerns/utils.rb:898-900; app/controllers/concerns/teams_create_concern.rb:33-40`

#### API-XVBU-221 — Status 'active' with Onboarding Required = Yes still makes a Prospect
- **Why it matters.** Coverage audit GAP-15: the worker drops Status unless it is 'rejected' (wrk:97), so 'active' changes nothing. No contact, so no invitation and no mail.
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-221.xlsx`.
- **Steps.** 1. Contactless row: only Company Name, Status active, Vendor Onboarding Required Yes
- **Expected.** Row success; the vendor is a Prospect (invited), 0 invitations.
- **Oracle.** Mapping + invitations.
- **Trace.** P2 · automate · `VBU-221` · `app/workers/vendor_bulk_upload_worker_v2.rb:97; PR16267 app/services/invitation/send_service.rb:400-407`

#### API-XVBU-230 — POC 2 email equal to the main POC email is refused before the vendor is created
- **Why it matters.** Coverage audit GAP-27. The member invite for the same address is refused 'already invited' (688) — after the vendor and its invite exist. No VRP Code in the row: with one, the code sends a second invitation instead (778), which would mail the vendor-management team.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-230.xlsx`.
- **Steps.** 1. Row whose POC 2 - Email Address is the same as POC - Email Address 2. POST 3. Read the row and the vendor
- **Expected.** Row failed (POC 2 must be a different person) and NO vendor created. Per the code: failed 'This email is already invited.' but the vendor exists.
- **Oracle.** Job row + companies lookup.
- **Trace.** P2 · automate · `VBU-230` · `app/workers/vendor_bulk_upload_worker_v2.rb:37-58,175-182; PR16267 app/services/invitation/send_service.rb:237,241-253`

## 5. Duplicates — inside one sheet and against existing vendors

#### API-XVBU-140 — Same GST + address + pincode + account group is blocked
- **Why it matters.** The exact duplicate — QA doc B1/C1.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-140.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B1, C1 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-140` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-141 — Same GST + address, different pincode is allowed (another branch)
- **Why it matters.** QA doc B2 — the case GMMCO reported as wrongly blocked.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-141.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row success; a second, separate vendor is created (Active).
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B2 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-141` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-142 — Same GST, different address is allowed
- **Why it matters.** QA doc B3; also the allow_same_gst_multiple_addresses rule.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-142.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row success; a second, separate vendor is created (Active).
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B3 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-142` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-143 — Same GST + address, pincode blank is blocked
- **Why it matters.** QA doc B4: a missing pincode must never rescue a duplicate.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-143.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B4 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-143` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-144 — Pincode with a space ('560 001') is treated as the same pincode
- **Why it matters.** QA doc B5: normalised to digits before comparing.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-144.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B5 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-144` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-145 — Different GST, everything else identical is allowed
- **Why it matters.** QA doc B6: the rule only applies once GST matches.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-145.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row success; a second, separate vendor is created (Active).
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B6 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-145` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-146 — An existing vendor code is blocked
- **Why it matters.** QA doc B7: vendor codes are unique per workspace.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-146.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor Code or GST Number is already taken'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B7 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-146` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-147 — A different account group releases the block
- **Why it matters.** QA doc C2: account_group is part of GMMCO's key.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-147.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row success; a second, separate vendor is created (Active).
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers C2 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-147` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-148 — A blank account group never rescues a duplicate
- **Why it matters.** QA doc C3.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-148.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers C3 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-148` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-149 — Account group in lower case ('zcov') still matches
- **Why it matters.** QA doc C4: compared case-insensitively.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-149.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers C4 of the PR's QA document.
- **Trace.** P2 · automate · `VBU-149` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-150 — The same address with different case and spacing still matches
- **Why it matters.** same_address? downcases and squishes; a re-typed address must not slip through.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-150.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **Trace.** P1 · automate · `VBU-150` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-151 — Two identical new vendors in ONE sheet — only one is created
- **Why it matters.** Each row runs in its own Sidekiq worker; the duplicate check reads committed rows only, so two identical rows processed together can both pass. The QA doc expects most of an 11,000-row load to be duplicates.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-151.xlsx`.
- **Steps.** 1. Two rows, same new tax number {{vatE}}, same address and pincode, different emails 2. POST 3. Read both rows
- **Expected.** One row success, one failed 'Vendor with this GST and address already exists'. Two successes = race defect.
- **Oracle.** Job rows.
- **Trace.** P0 · automate · `VBU-151` · `app/services/invitation/send_service.rb:258-290; app/workers/vendor_bulk_upload_worker_v2.rb (one job per row, parallel)`

#### API-XVBU-152 — Same GST with City blank copies the existing vendor's address — and is blocked
- **Why it matters.** QA doc: 'If City is blank, the invite flow copies the address from the existing vendor with that GST'. It also copies the existing vendor's NAME over the one in the sheet.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-152.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B-city of the PR's QA document.
- **Trace.** P2 · automate · `VBU-152` · `app/services/invitation/send_service.rb:41-54 (GST lookup only when city/address missing); app/helpers/api/companies_helper.rb:731-745 (existing company's name/address/city merged)`

#### API-XVBU-153 — Same GST with the address left blank is back-filled from the existing vendor — and blocked
- **Why it matters.** An address blank on the sheet makes the invite look the GSTIN up and copy the existing vendor's address in (the PR spec calls this 'back-filled'), so a blank address can never sneak a duplicate through.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared baseline vendor exists: tax number {{vatB}} (UK VAT — the duplicate key reads companies.gst_no whatever the tax type, and the sandbox's 'India' rows block GST, see VBU-059), Address 'QA Dedup Road 12', Pincode 560001, City Mumbai, Account Group ZCOV, Vendor Code QAVC{{stamp}}. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-153.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B-city of the PR's QA document.
- **Trace.** P1 · automate · `VBU-153` · `app/services/invitation/send_service.rb:41-54; PR16267 app/services/vendors/duplicate_check_fields.rb:26 (address: blank = no match — only safe because of the back-fill)`

#### API-XVBU-155 — A contactless Prospect is seen by the duplicate check
- **Why it matters.** QA doc 'Prospect visibility': before the PR a Prospect was invisible to the check and a second vendor code was minted. The baseline is a contactless Prospect (no email → no invitation → no mail).
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Baseline (uploaded first): a contactless Prospect — UK VAT {{vatI}}, 'QA Prospect Road 3', pincode 560003, account group ZCOV, no contact. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-155.xlsx`.
- **Steps.** 1. Upload the variation row (onboarding No) 2. Read the row and look for the vendor
- **Expected.** Row failed 'Vendor with this GST and address already exists'; no second vendor.
- **Oracle.** Job row + companies lookup.
- **QA doc.** Covers B-prospect of the PR's QA document.
- **Trace.** P0 · automate · `VBU-155` · `PR16267 app/services/invitation/send_service.rb:274-298 (duplicate_code_for_repeated_tax_no); PR16267 app/services/vendors/duplicate_check_fields.rb:23-32,111-119 (address blank=no match; pincode & extra fields blank=match)`

#### API-XVBU-156 — Old rule, same-GST-multiple-addresses ON: same tax number + same address is blocked
- **Why it matters.** Workspaces without vendor_duplicate_check_fields keep the old rule (QA doc D5): same GST at the same address → 1111.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); allow_same_gst_multiple_addresses_vendor_invite is on. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Baseline: UK VAT {{vatJ}}, 'QA Fallback Road 4'. Runs only on a workspace with allow_same_gst_multiple_addresses_vendor_invite on and no duplicate field list. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-156.xlsx`.
- **Steps.** 1. Upload the baseline 2. Upload a row with the same tax number and address
- **Expected.** Row failed 'Vendor with this GST and address already exists'.
- **Oracle.** Job row.
- **QA doc.** Covers D5, C7 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-156` · `PR16267 app/services/invitation/send_service.rb:288-298 (fallback branch)`

#### API-XVBU-157 — Old rule, same-GST-multiple-addresses ON: same tax number at another address is allowed
- **Why it matters.** The other half of D5.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); allow_same_gst_multiple_addresses_vendor_invite is on. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. As VBU-156. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-157.xlsx`.
- **Steps.** 1. Upload a row with the same tax number and a different address
- **Expected.** Row success; a second vendor.
- **Oracle.** Job row + vendor.
- **QA doc.** Covers D5, C7 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-157` · `PR16267 app/services/invitation/send_service.rb:288-298`

#### API-XVBU-158 — Old rule, same-GST-multiple-addresses OFF: any repeated tax number is blocked
- **Why it matters.** QA doc D4 — the behaviour every other client has today. Runs on PROCOL DEMO with a UK VAT number because GST rows are blocked by the sandbox's 'India' data (VBU-059).
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); allow_same_gst_multiple_addresses_vendor_invite is off. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. As VBU-156, on a workspace with allow_same_gst_multiple_addresses_vendor_invite off. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-158.xlsx`.
- **Steps.** 1. Upload a row with the same tax number and a different address
- **Expected.** Row failed 'Tax no. already registered with another company' (error 134).
- **Oracle.** Job row.
- **QA doc.** Covers D4, C7 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-158` · `PR16267 app/services/invitation/send_service.rb:295-296; config/locales/en-IN.yml api_errors.134`

#### API-XVBU-159 — A duplicate-field list without gst_no is ignored (old rule applies)
- **Why it matters.** QA doc C5: an unusable config must fall back to the old behaviour, never let everything through. Runs only where such a config exists.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-159.xlsx`.
- **Steps.** 1. Upload the exact duplicate of the baseline
- **Expected.** Row blocked (1111 or 134, per allow_same_gst_multiple_addresses_vendor_invite); config rejection logged.
- **Oracle.** Job row.
- **QA doc.** Covers C5 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-159` · `PR16267 app/services/vendors/duplicate_check_fields.rb:58-82`

#### API-XVBU-138 — A duplicate-field list naming an unknown field is ignored (old rule applies)
- **Why it matters.** QA doc C6: the unknown field must not be silently skipped. Runs only where such a config exists.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-138.xlsx`.
- **Steps.** 1. Upload the exact duplicate of the baseline
- **Expected.** Row blocked by the old rule.
- **Oracle.** Job row.
- **QA doc.** Covers C6 of the PR's QA document.
- **Trace.** P1 · automate · `VBU-138` · `PR16267 app/services/vendors/duplicate_check_fields.rb:71-82`

#### API-XVBU-135 — Manual Invite form: exact duplicate of an existing vendor is blocked
- **Why it matters.** QA doc: 'Run B1, B2 and B3 twice — once through bulk upload, once through the manual Invite Vendor form. A difference between them is a bug.'
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. The shared duplicate baseline exists (UK VAT {{vatB}}, 'QA Dedup Road 12', pincode 560001, ZCOV).
- **Steps.** 1. POST /invitations/send_invite with the baseline's tax number, address and account group, a new name and email, skip onboarding
- **Expected.** HTTP 422 'Vendor with this GST and address already exists' — the same answer as bulk (VBU-140).
- **Oracle.** HTTP + companies lookup.
- **QA doc.** Covers B1-form, B-form of the PR's QA document.
- **Trace.** P0 · automate · `VBU-135` · `PR16267 app/services/invitation/send_service.rb:274-298`

#### API-XVBU-136 — Manual Invite form: same tax number + address, different pincode is allowed
- **Why it matters.** QA doc B2 through the form. The form's allowed parameters do not include pincode, so it may not be able to tell two branches apart.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. As VBU-135.
- **Steps.** 1. POST /invitations/send_invite with the baseline's tax number and address, pincode 110001, a new name and email, skip onboarding
- **Expected.** HTTP 200; a second vendor (another branch) — the same answer as bulk (VBU-141).
- **Oracle.** HTTP + vendor.
- **QA doc.** Covers B2-form, B-form of the PR's QA document.
- **Trace.** P0 · automate · `VBU-136` · `app/controllers/api/invitations_controller.rb send_invite (permit list has no :pincode); PR16267 app/services/vendors/duplicate_check_fields.rb:27 (blank pincode = match)`

#### API-XVBU-211 — Two new rows in one sheet with the same Vendor Code — only one is created
- **Why it matters.** Coverage audit GAP-24: the same per-row parallel workers as BUG-01, on the Vendor Code.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-211.xlsx`.
- **Steps.** 1. Two rows, same new Vendor Code QADUP<stamp>, different names and emails 2. POST 3. Read both rows
- **Expected.** One row success, the other failed 'Vendor Code or GST Number is already taken'. Two successes = race defect.
- **Oracle.** Job rows.
- **Trace.** P1 · automate · `VBU-211` · `app/workers/vendor_bulk_upload_master_worker_v2.rb:11-14; PR16267 app/services/invitation/send_service.rb:261-264`

#### API-XVBU-212 — A Vendor Code that differs only in letter case is still a duplicate
- **Why it matters.** Coverage audit GAP-23: the code is matched exactly (where(vendor_code:)), so 'qavc…' slips past 'QAVC…'.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-212.xlsx`.
- **Steps.** 1. Row with Vendor Code = the baseline's code in lower case, no tax number
- **Expected.** Row failed 'Vendor Code or GST Number is already taken'.
- **Oracle.** Job row + companies lookup.
- **Trace.** P2 · automate · `VBU-212` · `PR16267 app/services/invitation/send_service.rb:263-264`

#### API-XVBU-213 — An existing vendor with NO pincode blocks a new branch that has one
- **Why it matters.** Coverage audit GAP-36: a blank pincode counts as a match (the PR's treat_as_match), so a pincode can never separate branches of the legacy vendors, which carry none.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-213.xlsx`.
- **Steps.** 1. Baseline vendor without pincode 2. Same tax number, address and account group, a new name and email, Pincode 110001
- **Expected.** Row failed 'Vendor with this GST and address already exists' (the PR's design: blank pincode = match).
- **Oracle.** Job row.
- **Spec vs code.** QA doc B2 says a different pincode makes a new branch; against a vendor with no pincode it never does.
- **Trace.** P1 · automate · `VBU-213` · `PR16267 app/services/vendors/duplicate_check_fields.rb:27,111-119`

#### API-XVBU-214 — A back-filled address with a DIFFERENT pincode makes a new branch
- **Why it matters.** Coverage audit GAP-37: a blank Address is filled in from the vendor with the same tax number; the pincode must still tell the branches apart (PR spec duplicate_check_integration_spec.rb:74).
- **Setup.** gate: allow_contactless_vendor_upload is on; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-214.xlsx`.
- **Steps.** 1. Baseline vendor with pincode 560007 2. Row with the same tax number, Address blank, City Mumbai, Pincode 110007
- **Expected.** Row success: a second vendor (another branch). Note: the back-fill also replaces the company name typed in the sheet with the existing vendor's name (send:41-51), so the new branch is not findable under the name the buyer gave it.
- **Oracle.** Job row.
- **Trace.** P1 · automate · `VBU-214` · `PR16267 app/services/invitation/send_service.rb:41-54; PR16267 app/services/vendors/duplicate_check_fields.rb:27`

#### API-XVBU-215 — A Rejected vendor still blocks an exact duplicate
- **Why it matters.** Coverage audit GAP-38: rejected vendors are part of the duplicate search (send:227,259,275).
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-215.xlsx`.
- **Steps.** 1. Baseline vendor with Status rejected 2. Exact duplicate (tax number, address, pincode, account group), new name and email
- **Expected.** Row failed 'Vendor with this GST and address already exists'.
- **Oracle.** Job row.
- **Trace.** P2 · automate · `VBU-215` · `PR16267 app/services/invitation/send_service.rb:227,259,275`

#### API-XVBU-216 — A VRP Code that another vendor already has is refused
- **Why it matters.** Coverage audit GAP-20: the VRP Code is a unique key like the Vendor Code.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-216.xlsx`.
- **Steps.** 1. Baseline vendor with VRP Code QAVRP<stamp> 2. New row with the same VRP Code
- **Expected.** Row failed 'Vendor Code or GST Number is already taken'.
- **Oracle.** Job row + companies lookup.
- **Trace.** P1 · automate · `VBU-216` · `PR16267 app/services/invitation/send_service.rb:266-267,272,280-281`

#### API-XVBU-217 — Vendor Code of one vendor + VRP Code of another is refused
- **Why it matters.** Coverage audit GAP-21.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-217.xlsx`.
- **Steps.** 1. Both baselines exist 2. Row with the dedup baseline's Vendor Code and the VRP baseline's VRP Code
- **Expected.** Row failed 'Vendor code and VRP Code belong to different companies'.
- **Oracle.** Job row.
- **Trace.** P2 · automate · `VBU-217` · `PR16267 app/services/invitation/send_service.rb:269-271`

#### API-XVBU-218 — Tax number of one vendor + Vendor Code of another is refused
- **Why it matters.** Coverage audit GAP-22.
- **Setup.** gate: can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_duplicate_check_fields lists gst_no, address, pincode, account_group. Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-218.xlsx`.
- **Steps.** 1. Both baselines exist 2. Row with the dedup baseline's tax number and address and the VRP baseline's Vendor Code
- **Expected.** Row failed 'Code and GST Number belong to different companies'.
- **Oracle.** Job row.
- **Trace.** P1 · automate · `VBU-218` · `PR16267 app/services/invitation/send_service.rb:274-279`

#### API-XVBU-229 — A lower-case VAT number cannot slip past the duplicate check (it is refused)
- **Why it matters.** Coverage audit GAP-56: the duplicate search matches gst_no exactly, so 'gb…' stored next to 'GB…' would be two vendors. The VAT pattern is upper-case only, so the row is refused before that can happen.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-229.xlsx`.
- **Steps.** 1. Tripwired row with Tax No. = {{vatB}} in lower case
- **Expected.** Row failed 'Invalid Tax No.' (the pattern is upper-case only), so no lower-case duplicate can be stored.
- **Oracle.** Job row error.
- **Trace.** P3 · automate · `VBU-229` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:92-95; PR16267 app/services/invitation/send_service.rb:275`

## 6. Data fidelity — what the parser does to the values

#### API-XVBU-206 — Contactless: the PAN is derived from the GSTIN (characters 3–12)
- **Why it matters.** Coverage audit GAP-18: under contactless (or vendor_invitation_v2) the PAN is filled in from the GSTIN (val:99-118).
- **Setup.** gate: allow_contactless_vendor_upload is on. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-206.xlsx`.
- **Steps.** 1. Tripwired row with GST {{gst}}, Business Location India, PAN No. blank 2. Read the staged row's data
- **Expected.** Row stops at the tripwire with data.pan_no = {{pan}}.
- **Oracle.** Job row data.
- **Trace.** P1 · automate · `VBU-206` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:99-118`

#### API-XVBU-207 — Contactless OFF: no PAN is derived from the GSTIN
- **Why it matters.** Coverage audit GAP-18, the other side: on a normal workspace the PAN is not derived.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2); vendor_invitation_v2 is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-207.xlsx`.
- **Steps.** 1. Tripwired row with GST {{gst}}, Business Location India 2. Read the staged row's data
- **Expected.** Row stops at the tripwire with no derived pan_no.
- **Oracle.** Job row data.
- **Trace.** P2 · automate · `VBU-207` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:99-104`

#### API-XVBU-208 — A Vendor Code with a dot and trailing zeros keeps its zeros ('QA….100')
- **Why it matters.** Coverage audit GAP-25: the same zero-stripper as BUG-09, on the vendor code — 'X.100' and 'X.1000' both become 'X.1' and collide as duplicates.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-208.xlsx`.
- **Steps.** 1. Tripwired row with Vendor Code 'QA<stamp>.100'
- **Expected.** Staged Vendor Code unchanged.
- **Oracle.** Job row data.
- **Trace.** P1 · automate · `VBU-208` · `app/services/conversions/excel_to_json_conversion_service.rb:176; app/controllers/concerns/utils.rb:641-647`

#### API-XVBU-209 — Entity-encoded markup ('&lt;script&gt;') is not decoded into a live tag
- **Why it matters.** Coverage audit GAP-26: every cell goes through Nokogiri .text, which DECODES '&lt;script&gt;' into '<script>'. VBU-163 covers a plain tag; this is the encoded one.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-209.xlsx`.
- **Steps.** 1. Tripwired row whose Company Name starts with '&lt;script&gt;alert(1)&lt;/script&gt;'
- **Expected.** The staged name never contains a live '<script'.
- **Oracle.** Job row data.
- **Trace.** P1 · automate · `VBU-209` · `app/services/conversions/excel_to_json_conversion_service.rb:177`

#### API-XVBU-228 — A city typed in capitals ('MUMBAI') resolves to Mumbai
- **Why it matters.** Coverage audit GAP-55.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-228.xlsx`.
- **Steps.** 1. Tripwired row with City 'MUMBAI' 2. Read the staged row's city_id
- **Expected.** Staged city_id = 8 (Mumbai).
- **Oracle.** Job row data.
- **Trace.** P3 · automate · `VBU-228` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:122-131`

#### API-XVBU-160 — An address ending in zeros keeps them ('Plot No. 100')
- **Why it matters.** Every cell goes through strip_trailing_zero, meant for '84149090.0'. Any value that contains a dot and ends in zeros loses them: 'Plot No. 100' becomes 'Plot No. 1'.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-160.xlsx`.
- **Steps.** 1. Tripwired row, Address 'Plot No. 100' 2. Read the staged row's data
- **Expected.** Staged Address = 'Plot No. 100'. Today: 'Plot No. 1'.
- **Oracle.** vendor_bulk_upload_jobs.data.
- **Trace.** P1 · automate · `VBU-160` · `app/services/conversions/excel_to_json_conversion_service.rb:176; app/controllers/concerns/utils.rb:641-647`

#### API-XVBU-161 — A company name ending in zeros keeps them ('… Pvt. Ltd 2000')
- **Why it matters.** Same stripper, on the vendor's legal name.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-161.xlsx`.
- **Steps.** 1. Company Name ending 'Pvt. Ltd 2000'
- **Expected.** Staged Company Name unchanged. Today: '… Pvt. Ltd 2'.
- **Oracle.** Job data.
- **Trace.** P1 · automate · `VBU-161` · `app/controllers/concerns/utils.rb:641-647`

#### API-XVBU-162 — A '<' in a company name does not cut the name short
- **Why it matters.** Every cell is passed through Nokogiri::HTML(...).text, which treats '<B Traders' as a tag and drops the rest.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-162.xlsx`.
- **Steps.** 1. Company Name '… A<B Traders'
- **Expected.** Staged name unchanged. Today: truncated at '<'.
- **Oracle.** Job data.
- **Trace.** P1 · automate · `VBU-162` · `app/services/conversions/excel_to_json_conversion_service.rb:177`

#### API-XVBU-163 — Script tags in a name are neutralised
- **Why it matters.** Vendor names are rendered in lists, mails and PDFs. The HTML pass should leave no tag behind.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-163.xlsx`.
- **Steps.** 1. Company Name '<script>alert(1)</script>QA_Platform_…'
- **Expected.** Staged name has no '<script'.
- **Oracle.** Job data.
- **Trace.** P1 · automate · `VBU-163` · `app/services/conversions/excel_to_json_conversion_service.rb:177`

#### API-XVBU-164 — A name starting with '=' comes back as text in the error sheet, not as a live formula
- **Why it matters.** CSV/formula injection: the error sheet is written with axlsx, which turns a string starting with '=' into a formula. A buyer opening it runs whatever the uploader wrote.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-164.xlsx`.
- **Steps.** 1. Tripwired row, Company Name '=HYPERLINK("https://example.com","QA")' 2. Download the job's error sheet 3. Inspect the name cell
- **Expected.** The cell is a plain string (or escaped with a leading ').
- **Oracle.** Cell type in the downloaded error sheet.
- **Trace.** P1 · automate · `VBU-164` · `app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:336-359 (sheet.add_row row — axlsx type detection)`

#### API-XVBU-165 — A 17-digit bank account number typed as a number is not turned into scientific notation
- **Why it matters.** Indian bank accounts run to 17 digits. Typed into Excel as a number, the cell reaches Roo as a Float, and Ruby prints a Float of 17+ digits as '1.23456789012345e+16' — that string is what gets stored. (Excel itself keeps only 15 significant digits, so the cell should be text; the product should refuse or warn rather than store scientific notation.)
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-165.xlsx`.
- **Steps.** 1. Bank Account Number = 12345678901234500 as a NUMBER cell
- **Expected.** Staged value '12345678901234500' (or the row refused as not text).
- **Oracle.** Job data.
- **Trace.** P1 · automate · `VBU-165` · `app/services/conversions/excel_to_json_conversion_service.rb:176`

#### API-XVBU-166 — A pincode typed as a number is stored as the plain digits
- **Why it matters.** The common case the trailing-zero fix was written for ('560001.0').
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-166.xlsx`.
- **Steps.** 1. Pincode = 560001 as a NUMBER cell
- **Expected.** Staged Pincode '560001'.
- **Oracle.** Job data.
- **Trace.** P2 · automate · `VBU-166` · `app/controllers/concerns/utils.rb:641-647`

#### API-XVBU-167 — An ampersand in a name survives ('R & D')
- **Why it matters.** Pins that the HTML pass leaves a plain '&' alone.
- **Setup.** Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-167.xlsx`.
- **Steps.** 1. Company Name '… R & D'
- **Expected.** Staged name unchanged.
- **Oracle.** Job data.
- **Trace.** P3 · automate · `VBU-167` · `app/services/conversions/excel_to_json_conversion_service.rb:177`

## 7. Settings on other workspaces (regression)

#### API-XVBU-180 — Contactless OFF: a blank POC email is still mandatory
- **Why it matters.** Suite D: every other client must behave exactly as before the PR.
- **Setup.** gate: allow_contactless_vendor_upload is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-180.xlsx`.
- **Steps.** 1. Tripwired row with POC email blank (plus the workspace's required extra columns)
- **Expected.** Row failed 'Mandatory Item cannot be left empty'.
- **Oracle.** Job row error.
- **QA doc.** Covers A-flag-off, D1, D3 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-180` · `app/controllers/concerns/utils.rb:795-802`

#### API-XVBU-181 — Contactless OFF: no tax number and no city/address is refused
- **Why it matters.** The 'With Tax No. OR Without Tax No.' rule must still hold.
- **Setup.** gate: allow_contactless_vendor_upload is off; vendor_invitation_v2 is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-181.xlsx`.
- **Steps.** 1. Tripwired row, City and Address blank
- **Expected.** Row failed 'Either Tax No. or Without Tax No. fields are needed'.
- **Oracle.** Job row error.
- **Trace.** P0 · automate · `VBU-181` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:24-30,46-48`

#### API-XVBU-182 — A required extra field left blank is refused
- **Why it matters.** extra_fields_for_vendor_invite with is_required=true is drawn under Mandatory Details in the template (PROCOL DEMO: Contact Number, Feedback Score, Feedback Report, Non-PQ Remark). The validator, though, builds its column list WITHOUT the extra fields, so the requirement is never checked on upload.
- **Setup.** gate: extra_fields_for_vendor_invite has at least one is_required field. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-182.xlsx`.
- **Steps.** 1. Tripwired row with the required extra fields blank
- **Expected.** Row failed 'Mandatory Item cannot be left empty'. Found 2026-09-29: passes validation ('Invalid Status' tripwire) — the rule is not enforced.
- **Oracle.** Job row error.
- **Spec vs code.** The template tells the buyer these columns are mandatory; the upload does not require them.
- **Trace.** P1 · automate · `VBU-182` · `PR16267 app/services/validations/vendor_bulk_upload_validation_service_v2.rb:14-16 (get_vendor_bulk_upload_params_v2 called with no extra_fields:) vs app/services/procol_excel/vendor_bulk_upload_excel_service_v2.rb:9-13 (template passes them); app/controllers/concerns/utils.rb:803-806`

#### API-XVBU-184 — Contactless OFF: a normal vendor with full details is created and invited
- **Why it matters.** QA doc D2 on a client without GMMCO's switch: the everyday path must be unchanged, including the new PAN No. and Pincode columns.
- **Setup.** gate: allow_contactless_vendor_upload is off; can_skip_vendor_onboarding is on (with vendor_onboarding_version v2). Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-184.xlsx`.
- **Steps.** 1. Row with every mandatory column, UK VAT, PAN, pincode, the workspace's required extra fields, onboarding No
- **Expected.** Row success; vendor Active; one invitation (skip onboarding); PAN and pincode stored.
- **Oracle.** Vendor, mapping, invitation.
- **QA doc.** Covers D2 of the PR's QA document.
- **Trace.** P0 · automate · `VBU-184` · `app/workers/vendor_bulk_upload_worker_v2.rb:92-158; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:42-47`

#### API-XVBU-183 — Contactless OFF: the invalid-city rule still fires
- **Why it matters.** Old behaviour, which the PR's A5 change must not leak to other workspaces. The tripwire is not needed: the city check is last, and a valid Status=rejected row stays mail-free if it passes.
- **Setup.** gate: allow_contactless_vendor_upload is off. Data: creates nothing (every row stops in validation). Fixture: `procol test/fixtures/vendor-bulk-upload/VBU-183.xlsx`.
- **Steps.** 1. Status rejected, no Tax No., City 'QA Nowhere {{stamp}}'
- **Expected.** Row failed 'Invalid City Name'.
- **Oracle.** Job row error.
- **Trace.** P1 · automate · `VBU-183` · `app/services/validations/vendor_bulk_upload_validation_service_v2.rb:73-75`

## 8. Found by the coverage audit, not run: they mail real people, change a workspace for good, need two workspaces in sequence, or need a setting no test client has

#### API-XVBU-232 — A contactless 'rejected' row with no contact creates a user with no email — and blocks every later no-email row
- **Why it matters.** Coverage audit GAP-02. create_user_for_rejected_vendor looks the email up as NULL, finds nothing and creates a user whose email is NULL; afterwards send:233 matches that user for every no-email row ('This email is already invited.'). GMMCO's 11,000-row legacy load is exactly this row type.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Not automated: Leaves a lasting change on the workspace (a user with no email that breaks later uploads). Run only with the workspace owner's approval; a read-only probe on 5 Oct 2026 found no such user from our runs.
- **Steps.** 1. Row: Company Name, Status rejected, Vendor Onboarding Required No (no contact) 2. Second upload: a no-contact row
- **Expected.** No blank user is created and the second row succeeds. Per the code: a NULL-email user, then 'This email is already invited.' on every later no-email row.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P0 · manual · `VBU-232` · `app/workers/vendor_bulk_upload_worker_v2.rb:28-35,159-161; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:14-15; PR16267 app/services/invitation/send_service.rb:233-253`

#### API-XVBU-233 — A Status=rejected row that becomes a subsidiary is not rejected
- **Why it matters.** Coverage audit GAP-03: the subsidiary path ignores Status, so the mapping is active and the subsidiary is invited (mail).
- **Setup.** Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Not automated: Sends the invite and 'new prospect' mails to the vendor-management team (real people). Needs approval (run with --real-mail).
- **Steps.** 1. Subsidiary baseline (VBU-131's) 2. Row reusing its contact email, Status rejected, a new UK VAT number
- **Expected.** Mapping rejected, no mail. Per the code: active or invited, and the invite and prospect mails go out.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-233` · `PR16267 app/services/invitation/send_service.rb:85-87; app/services/vpc_network/subsidiary_service.rb:199-235`

#### API-XVBU-234 — A rejected vendor with POC 2 still sends POC 2 an active invitation
- **Why it matters.** Coverage audit GAP-04: the member invite ignores the rejected status and carries no skip flag.
- **Setup.** Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Not automated: Mails the vendor-management team (and POC 2). Needs approval.
- **Steps.** 1. Row with Status rejected and POC 2 name + email
- **Expected.** No POC 2 invitation for a rejected vendor. Per the code: an active vendor_member_invite and the prospect mail.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-234` · `app/workers/vendor_bulk_upload_worker_v2.rb:175-182; PR16267 app/services/invitation/send_service.rb:374-381,393-398`

#### API-XVBU-235 — A blank City/Address copies ANOTHER workspace's vendor details in
- **Why it matters.** Coverage audit GAP-05: the tax-number back-fill searches every workspace (Company.active.find_by(gst_no:)), so another client's vendor name, address and city are merged in.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Not automated: Needs a run across two workspaces in sequence, which the runner does not do yet. Test vendors only, no real mail — safe to build next.
- **Steps.** 1. On PROCOL DEMO: a vendor with UK VAT {{vatN}} and 'QA PD Leak Road 1' 2. On GMMCO: a no-contact row with only that VAT number
- **Expected.** No data from another workspace. Per the code: the GMMCO vendor is named and addressed after the PROCOL DEMO one.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P0 · manual · `VBU-235` · `app/helpers/api/companies_helper.rb:732-747; PR16267 app/services/invitation/send_service.rb:41-54`

#### API-XVBU-236 — A new tax number with no Address triggers a live GST/VAT provider lookup
- **Why it matters.** Coverage audit GAP-06: the back-fill calls the external tax-number provider when no vendor in Procol has the number.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Sends the tax number to an external provider. Needs approval.
- **Steps.** 1. GMMCO row: GST {{gst}}, Business Location India, City Mumbai, Address blank, onboarding No
- **Expected.** Decided without a third-party call, or refused clearly. Per the code: an external lookup; the message depends on the provider.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-236` · `PR16267 app/services/invitation/send_service.rb:42-52; app/helpers/api/companies_helper.rb:748-767`

#### API-XVBU-237 — Same contact + Vendor Code (no tax) makes a subsidiary that inherits the original's tax number
- **Why it matters.** Coverage audit GAP-31: the subsidiary copies the parent (vendor.dup) and a nil gst_no is dropped by .compact, so a second company carries the same tax number without the duplicate check ever seeing it.
- **Setup.** Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Not automated: The subsidiary invitation mails the vendor-management team (CODE-2). Needs approval.
- **Steps.** 1. Subsidiary baseline 2. Row reusing its contact email with a Vendor Code and no tax number
- **Expected.** Refused or created without the parent's tax number. Per the code: a subsidiary with gst_no = the parent's.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-237` · `app/services/vpc_network/subsidiary_service.rb:164-212; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:30,39`

#### API-XVBU-238 — Onboarding payload + Status rejected + Yes starts onboarding for a rejected vendor
- **Why it matters.** Coverage audit GAP-35.
- **Setup.** Data: creates a Prospect — the backend emails the workspace's vendor-management team (real people on the sandbox); runs only with realMail=1. Not automated: Starts an onboarding event (mails). Needs approval.
- **Steps.** 1. VBU-134's payload; row with Status rejected, Vendor Onboarding Required Yes
- **Expected.** No onboarding event for a rejected vendor. Per the code: mapping rejected AND an onboarding event.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-238` · `app/workers/vendor_bulk_upload_worker_v2.rb:93,195`

#### API-XVBU-239 — A contact who is already a vendor user elsewhere is silently auto-joined
- **Why it matters.** Coverage audit GAP-30: the invitation is created as accepted and the existing user gets a mapping to the new vendor without being asked.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Not automated: Needs a run across two workspaces in sequence. Test vendors only.
- **Steps.** 1. On PROCOL DEMO: a rejected row creates a vendor user qa_vbu_<stamp>_reg@example.com 2. On GMMCO: a row with that email
- **Expected.** Product decision: ask the user, or auto-join. Per the code: invitation accepted, user mapped.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-239` · `PR16267 app/services/invitation/send_service.rb:69,100-108,329,341-343`

#### API-XVBU-240 — A POC email that belongs to a buyer user is refused
- **Why it matters.** Coverage audit GAP-29.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a buyer user that is one of OUR QA test accounts; the GMMCO admin is a real person's account, so it is never used as data.
- **Steps.** 1. Row with Status rejected and the POC email of a buyer user
- **Expected.** Row failed 'This email is already registered.'
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-240` · `PR16267 app/services/invitation/send_service.rb:147-167`

#### API-XVBU-241 — A registered contact's subsidiary with no City/Address is refused 'Incorrect details'
- **Why it matters.** Coverage audit GAP-32.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Depends on another case's vendor user within the same run; not wired yet.
- **Steps.** 1. VBU-125's vendor user exists 2. Row reusing its email with a Vendor Code, no City/Address
- **Expected.** Row failed 'Incorrect details'.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-241` · `app/services/vpc_network/subsidiary_service.rb:88-96,149-160`

#### API-XVBU-242 — An onboarding payload with a broken form gives a 'success' row and no event
- **Why it matters.** Coverage audit GAP-34.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Not automated: Needs a deliberately broken onboarding payload builder; not wired yet.
- **Steps.** 1. VBU-132's payload with a non-existent form id; a no-contact 'Yes' row
- **Expected.** Row failed (onboarding could not start). Per the code: success, Prospect, no event (only logged).
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-242` · `app/workers/vendor_onboarding_event_worker.rb:36-38`

#### API-XVBU-243 — A profile that maps to broker/brokerage takes the broker invite
- **Why it matters.** Coverage audit GAP-16.
- **Setup.** Data: creates QA_Platform_ test vendors; the only mail goes to qa_…@example.com. Not automated: Neither test client maps a profile to broker.
- **Steps.** 1. Row whose Vendor Profile maps to broker
- **Expected.** Company category brokerage; invite type broker_invite.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-243` · `app/workers/vendor_bulk_upload_worker_v2.rb:115-125; PR16267 app/services/vpc_network/concerns/vpc_params_mixin.rb:80-93`

#### API-XVBU-244 — Another user's job id is not exposed through the error sheet
- **Why it matters.** Coverage audit GAP-52.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a second QA user who uploads; none exists yet.
- **Steps.** 1. As user B, GET the error sheet of user A's job
- **Expected.** HTTP 422 487 (no job for this user).
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-244` · `app/controllers/api/v1/companies_controller.rb:236-238`

#### API-XVBU-245 — Read-only: a contactless blank profile stores the first 'manufacturer' mapping
- **Why it matters.** Coverage audit GAP-17.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: A database read of another case's vendor; not wired as its own check yet.
- **Steps.** 1. SELECT misc->'category_data' of VBU-121's vendor
- **Expected.** The first vendor_category_type_mapping entry whose category is manufacturer.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-245` · `app/workers/vendor_bulk_upload_worker_v2.rb:116-130`

#### API-XVBU-246 — Read-only: an Active vendor raises the P2P vendor-portal request (GMMCO)
- **Why it matters.** Coverage audit GAP-33.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: A database read of another case's vendor; not wired as its own check yet.
- **Steps.** 1. SELECT external_requests p2p_boiler_plate_upsert for VBU-121's vendor
- **Expected.** One request per Active vendor (none for a Prospect).
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-246` · `app/models/buyer_seller_company_mapping.rb:48,185-215`

#### API-XVBU-247 — Duplicate fields = [gst_no] only falls back to the old rule
- **Why it matters.** Coverage audit GAP-39.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-247` · `dup:67-74`

#### API-XVBU-248 — pan_no in the duplicate key: a different PAN makes a new vendor
- **Why it matters.** Coverage audit GAP-40.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-248` · `dup:25`

#### API-XVBU-249 — can_skip OFF: Vendor Onboarding Required is not validated and 'No' still makes a Prospect
- **Why it matters.** Coverage audit GAP-42.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-249` · `val:211; wrk:93`

#### API-XVBU-250 — vendor_invitation_v2 ON (contactless OFF): Profile/City/Address optional, POC email still mandatory
- **Why it matters.** Coverage audit GAP-43.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-250` · `val; tpl:99-101; sub:116-128`

#### API-XVBU-251 — No onboarding version: a matching row is 'already_mapped' and the vendor updated
- **Why it matters.** Coverage audit GAP-44.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-251` · `wrk:131-140; update_mapped_vendor_service.rb:12-70`

#### API-XVBU-252 — disable_manual_vendor_creation ON, as a Procol employee: upload allowed
- **Why it matters.** Coverage audit GAP-45.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-252` · `ctrl:206`

#### API-XVBU-253 — restricted_pan_email_domains: a PAN on the wrong email domain is refused
- **Why it matters.** Coverage audit GAP-46.
- **Setup.** Data: creates nothing (every row stops in validation). Not automated: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change).
- **Steps.** 1. See the coverage audit
- **Expected.** As the audit's expected outcome.
- **Oracle.** Job row + records (SELECT).
- **Trace.** P1 · manual · `VBU-253` · `pan_email_domain_service.rb:28-41`
