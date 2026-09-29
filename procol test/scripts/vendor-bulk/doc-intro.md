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
| `extra_fields_for_vendor_invite` | 4 optional | 9, four required | extra columns; required ones join the mandatory list |
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
4. **"Record created with no city" (A5).** The company builder stores `city_id 38` ('-'), a placeholder city, not null;
   and a partial name like "a" is fuzzy-matched to a real city (VBU-075, VBU-076).
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
12. **Sandbox master data.** 36 countries are named "India"; `Country.find_by(name:)` has no order or status filter,
    so GST rows intermittently fail 'Tax Type not configured for the selected Business Location' (VBU-059). The
    duplicate suite therefore uses UK VAT numbers — the duplicate key reads `companies.gst_no` whatever the tax type.
