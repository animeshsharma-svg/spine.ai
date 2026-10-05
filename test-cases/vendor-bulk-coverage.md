# Vendor bulk upload — coverage check

**Every scenario the backend code allows is now a test case.** An audit on 5 Oct 2026 read the code under test (procol-backend PR 16267 @ 65728150bc) and listed 161 scenarios. 82 were already covered. 8 were only partly covered, and 53 had no case at all. All 53 gaps, and the partly covered history counters (S-039), now have cases: 58 in total. 36 of them run on the sandbox; 22 are listed with the reason they do not run (they mail real people, change a workspace for good, need two workspaces in sequence, or need a setting no test client has).

The suite is now **204 cases** (25 described for a person or waiting for approval). Bugs: **34 reproduced, 1 suspected**; see `vendor-bulk-bug-sheet.md`.

## What the audit changed in the existing cases

- **VBU-119 and VBU-120 may have mailed real people.** Their POC 2 invitation carried no skip-onboarding flag, so by the code each run queued the 'new prospect' mail to the workspace's vendor-management team. The sandbox database holds 8 such invitations from 29-30 Sep (6 GMMCO, 2 PROCOL DEMO). VBU-119 is now approval-only, VBU-120 has no POC 2, and the runner checks the flag on EVERY invitation. There is no mail log to confirm delivery. This is filed as BUG-29.
- **VBU-156 and VBU-157 cannot run on either test client.** They need a workspace with no duplicate-check fields AND same-GST-multiple-addresses on.
- **A no-contact 'rejected' row creates a user with no email** (VBU-232). By the code, that user then blocks every later no-contact row with 'This email is already invited.' A read-only check on 5 Oct found no such user from our runs. The case runs only with the workspace owner's approval.

## Every gap, the case that covers it, and its latest result

| Gap | Case | What it checks | Tier | Latest result | Bug |
|---|---|---|---|---|---|
| GAP-01 | VBU-119 | A full row (UK VAT) with 'Onboarding Required = No' becomes an Active vendor with every field stored | real-mail | earlier 'pass' results were false (the runner checked only the first invitation's flag); now approval-only because it mails the vendor-management team — BUG-29 proven from the database | BUG-29 |
| GAP-02 | VBU-232 | A contactless 'rejected' row with no contact creates a user with no email — and blocks every later no-email row | creates | not run: Leaves a lasting change on the workspace (a user with no email that breaks later uploads). Run only with the workspace owner's approval; a read-only probe on 5 Oct 2026 found no such user from our runs. | — |
| GAP-03 | VBU-233 | A Status=rejected row that becomes a subsidiary is not rejected | real-mail | not run: Sends the invite and 'new prospect' mails to the vendor-management team (real people). Needs approval (run with --real-mail). | — |
| GAP-04 | VBU-234 | A rejected vendor with POC 2 still sends POC 2 an active invitation | real-mail | not run: Mails the vendor-management team (and POC 2). Needs approval. | — |
| GAP-05 | VBU-235 | A blank City/Address copies ANOTHER workspace's vendor details in | creates | not run: Needs a run across two workspaces in sequence, which the runner does not do yet. Test vendors only, no real mail — safe to build next. | — |
| GAP-06 | VBU-236 | A new tax number with no Address triggers a live GST/VAT provider lookup | safe | not run: Sends the tax number to an external provider. Needs approval. | — |
| GAP-07 | VBU-200 | Contactless OFF: a tax number with an unknown city is refused, not saved as city 0 | creates | PROCOL DEMO: FAIL | BUG-10 |
| GAP-08 | VBU-201 | Contactless OFF: a blank Vendor Profile is refused as mandatory | safe | PROCOL DEMO: pass | — |
| GAP-09 | VBU-202 | Contactless OFF: a blank POC - Full Name is refused as mandatory | safe | PROCOL DEMO: pass | — |
| GAP-10 | VBU-203 | Contactless OFF: no tax number and no Address is refused ('Either Tax No. or …') | safe | PROCOL DEMO: pass | — |
| GAP-11 | VBU-220 | Deals In by category NAME is either refused or linked — never accepted and dropped | creates | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-32 |
| GAP-12 | VBU-219 | Deals In with a valid category code puts the vendor in that category's team | creates | GMMCO: pass · PROCOL DEMO: pass | — |
| GAP-13 | VBU-205 | Deals In with ANOTHER workspace's category code is refused | safe | GMMCO: pass · PROCOL DEMO: pass | — |
| GAP-15 | VBU-221 | Status 'active' with Onboarding Required = Yes still makes a Prospect | creates | GMMCO: pass | — |
| GAP-16 | VBU-243 | A profile that maps to broker/brokerage takes the broker invite | creates | not run: Neither test client maps a profile to broker. | — |
| GAP-17 | VBU-245 | Read-only: a contactless blank profile stores the first 'manufacturer' mapping | safe | not run: A database read of another case's vendor; not wired as its own check yet. | — |
| GAP-18 | VBU-206 | Contactless: the PAN is derived from the GSTIN (characters 3–12) | safe | GMMCO: pass | — |
| GAP-18 | VBU-207 | Contactless OFF: no PAN is derived from the GSTIN | safe | PROCOL DEMO: pass | — |
| GAP-20 | VBU-216 | A VRP Code that another vendor already has is refused | creates | GMMCO: pass · PROCOL DEMO: pass | — |
| GAP-21 | VBU-217 | Vendor Code of one vendor + VRP Code of another is refused | creates | GMMCO: pass | — |
| GAP-22 | VBU-218 | Tax number of one vendor + Vendor Code of another is refused | creates | GMMCO: pass | — |
| GAP-23 | VBU-212 | A Vendor Code that differs only in letter case is still a duplicate | creates | GMMCO: FAIL | BUG-31 |
| GAP-24 | VBU-211 | Two new rows in one sheet with the same Vendor Code — only one is created | creates | GMMCO: pass · PROCOL DEMO: FAIL | BUG-01 |
| GAP-25 | VBU-208 | A Vendor Code with a dot and trailing zeros keeps its zeros ('QA….100') | safe | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-09 |
| GAP-26 | VBU-209 | Entity-encoded markup ('&lt;script&gt;') is not decoded into a live tag | safe | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-30 |
| GAP-27 | VBU-230 | POC 2 email equal to the main POC email is refused before the vendor is created | creates | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-07 |
| GAP-28 | VBU-210 | POC 2 email without a name is refused BEFORE the vendor is created | creates | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-07 |
| GAP-29 | VBU-240 | A POC email that belongs to a buyer user is refused | safe | not run: Needs a buyer user that is one of OUR QA test accounts; the GMMCO admin is a real person's account, so it is never used as data. | — |
| GAP-30 | VBU-239 | A contact who is already a vendor user elsewhere is silently auto-joined | creates | not run: Needs a run across two workspaces in sequence. Test vendors only. | — |
| GAP-31 | VBU-237 | Same contact + Vendor Code (no tax) makes a subsidiary that inherits the original's tax number | real-mail | not run: The subsidiary invitation mails the vendor-management team (CODE-2). Needs approval. | — |
| GAP-32 | VBU-241 | A registered contact's subsidiary with no City/Address is refused 'Incorrect details' | safe | not run: Depends on another case's vendor user within the same run; not wired yet. | — |
| GAP-33 | VBU-246 | Read-only: an Active vendor raises the P2P vendor-portal request (GMMCO) | safe | not run: A database read of another case's vendor; not wired as its own check yet. | — |
| GAP-34 | VBU-242 | An onboarding payload with a broken form gives a 'success' row and no event | creates | not run: Needs a deliberately broken onboarding payload builder; not wired yet. | — |
| GAP-35 | VBU-238 | Onboarding payload + Status rejected + Yes starts onboarding for a rejected vendor | real-mail | not run: Starts an onboarding event (mails). Needs approval. | — |
| GAP-36 | VBU-213 | An existing vendor with NO pincode blocks a new branch that has one | creates | GMMCO: pass | — |
| GAP-37 | VBU-214 | A back-filled address with a DIFFERENT pincode makes a new branch | creates | GMMCO: pass | — |
| GAP-38 | VBU-215 | A Rejected vendor still blocks an exact duplicate | creates | GMMCO: pass | — |
| GAP-39 | VBU-247 | Duplicate fields = [gst_no] only falls back to the old rule | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-40 | VBU-248 | pan_no in the duplicate key: a different PAN makes a new vendor | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-41 | VBU-156 | Old rule, same-GST-multiple-addresses ON: same tax number + same address is blocked | creates | cannot run on either test client (needs no duplicate-check fields AND same-GST-multiple-addresses ON) | — |
| GAP-41 | VBU-157 | Old rule, same-GST-multiple-addresses ON: same tax number at another address is allowed | creates | cannot run on either test client (needs no duplicate-check fields AND same-GST-multiple-addresses ON) | — |
| GAP-42 | VBU-249 | can_skip OFF: Vendor Onboarding Required is not validated and 'No' still makes a Prospect | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-43 | VBU-250 | vendor_invitation_v2 ON (contactless OFF): Profile/City/Address optional, POC email still mandatory | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-44 | VBU-251 | No onboarding version: a matching row is 'already_mapped' and the vendor updated | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-45 | VBU-252 | disable_manual_vendor_creation ON, as a Procol employee: upload allowed | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-46 | VBU-253 | restricted_pan_email_domains: a PAN on the wrong email domain is refused | safe | not run: Needs a workspace with this setting; neither test client has it (the settings are the owner's to change). | — |
| GAP-47 | VBU-222 | A workbook whose FIRST sheet is an instructions sheet: the vendor sheet is still read | safe | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-17 |
| GAP-48 | VBU-223 | The template uploaded as downloaded gives a sensible row error | safe | GMMCO: FAIL | BUG-12 |
| GAP-49 | VBU-231 | The error sheet's Vendor Profile dropdown sits on the Vendor Profile column | safe | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-34 |
| GAP-50 | VBU-224 | Error sheet for a job id that does not decode is refused 'Insufficient parameters' | safe | GMMCO: pass · PROCOL DEMO: pass | — |
| GAP-51 | VBU-225 | A user who may not upload cannot read the upload status list | safe | GMMCO: couldn't tell · PROCOL DEMO: couldn't tell | — |
| GAP-51 | VBU-226 | A user who may not upload cannot download error sheets | safe | GMMCO: couldn't tell · PROCOL DEMO: couldn't tell | — |
| GAP-52 | VBU-244 | Another user's job id is not exposed through the error sheet | safe | not run: Needs a second QA user who uploads; none exists yet. | — |
| GAP-53 | VBU-227 | An old-format 'GST ' column (trailing space) is caught like 'GST' | safe | GMMCO: FAIL · PROCOL DEMO: FAIL | BUG-33 |
| GAP-54 | VBU-204 | Contactless OFF: Tax Type and Business Location filled but Tax No. blank | safe | PROCOL DEMO: pass | — |
| GAP-55 | VBU-228 | A city typed in capitals ('MUMBAI') resolves to Mumbai | safe | GMMCO: pass · PROCOL DEMO: pass | — |
| GAP-56 | VBU-229 | A lower-case VAT number cannot slip past the duplicate check (it is refused) | safe | GMMCO: pass · PROCOL DEMO: pass | — |
| S-039 | VBU-254 | The upload history counts a mixed upload correctly (Completed 1 · Failed 1) | creates | GMMCO: pass | — |

Tiers: **safe** = creates nothing (rows stop in validation); **creates** = creates QA_Platform_ test vendors whose only mail goes to qa_…@example.com; **real-mail** = would email real people (runs only with approval).

## Still only partly covered (low value, noted)

- S-037: the onboarding payload's negative branches (VBU-242 lists the broken-form one).
- S-047: the error sheet drops unknown columns such as 'Remarks'.
- S-054 and S-056: the template's Data Sheet lists of Business Location and Tax Type, and the 'Mandatory Details' grouping of required extra fields, are read but not asserted.
- S-083: a blank City defaults to city 38 ('-'); not asserted on the vendor.
- S-100: VBU-245 (read-only); S-140: who receives the mails (section D).

---

# Appendix — the audit

The full read-only audit as written, for reference. Its 'gap' lines now map to the cases above.

## A. Scenario map

Status: **covered** · **partial** (the branch is reached, but the outcome that matters is not asserted) · **gap** · **skipped-both** (only a case that neither GMMCO 47053 nor PROCOL DEMO 198678 can run covers it) · **n/a** (unreachable in code; listed for completeness).
Client notes: "(G)" = runs only on GMMCO, "(PD)" = runs only on PROCOL DEMO, from the cases' `requires` and the stated settings.

| # | Area | Scenario | Code ref | Covering case(s) | Status |
|---|---|---|---|---|---|
| S-001 | request | `excel_data` missing → 422 code 2 | ctrl:209 | VBU-001 | covered |
| S-002 | request | `excel_data` null | ctrl:209 | VBU-002 | covered |
| S-003 | request | `excel_data` "" → 0-byte file, Roo error not rescued | ctrl:209-211, sheet:2-14 | VBU-003 (BUG-03) | covered |
| S-004 | request | non-base64 text | sheet:20 | VBU-004 | covered |
| S-005 | file | PDF / PNG / CSV / docx / data-URL prefix | sheet:4-12 | VBU-005…009 | covered |
| S-006 | file | old-format header (GST / POC - Phone Number / POC 2 - Mobile on row 3) | parse:164-166 | VBU-010, VBU-011 | covered |
| S-007 | file | old-format header carrying a trailing space ("GST ") is not detected (exact array intersection, no rstrip) | parse:164 vs 177 | — | gap (low, GAP-53) |
| S-008 | file | empty workbook (`last_row` nil) | parse:170-171 | VBU-012 (BUG-05) | covered |
| S-009 | file | header rows only → 200, nothing staged | parse:171; helper:680-714 | VBU-013 | covered |
| S-010 | file | headers on row 1 | parse:168 | VBU-014 | covered |
| S-011 | file | .xls through the Roo::Excel fallback | sheet:8 | VBU-015 | covered |
| S-012 | file | column order irrelevant (keyed by name) | parse:175-178 | VBU-016 | covered |
| S-013 | file | header leading space / trailing space / case | parse:177 | VBU-017, 018, 019 | covered |
| S-014 | file | unknown column passed through into params | parse:177; utils:893-895 | VBU-020 | covered |
| S-015 | file | blank row staged as a failed row | parse:171-181 | VBU-021 | covered |
| S-016 | file | duplicate header → last copy wins | parse:175-178 | VBU-022 | covered |
| S-017 | file | **only the first worksheet is read** (`sheet(0)`); a sheet whose upload tab is not first is read from the wrong tab | parse:164,168,170,173 | — | gap (GAP-47) |
| S-018 | file | a value under a column with no header is dropped silently (`keys.each_with_index` over headers only) | parse:172-178 | — | gap (low, GAP-53) |
| S-019 | file | 1,000-row load | ctrl:210-213 | VBU-023 | covered |
| S-020 | file | job id = distinct-count + 1 → two concurrent uploads share an id | helper:684 | VBU-024 (BUG-24) | covered |
| S-021 | file | duplicate emails kept at staging (subsidiary flow); `email_counter` computed and never used | helper:685-703 | VBU-130, VBU-131 | covered |
| S-022 | file | `VendorBulkUploadJob.import` result is an object (always truthy), so 263 'Invalid query' is unreachable | ctrl:212 | — | n/a |
| S-023 | cell | `strip_trailing_zero` on any text with a dot (address, name) | parse:176; utils:641-647 | VBU-160, 161 (BUG-09) | covered |
| S-024 | cell | same stripper on **Vendor Code** ('QA.100' → 'QA.1'), which can make two codes collide | parse:176; wrk:106-108; send:263-264 | — | gap (GAP-25) |
| S-025 | cell | Nokogiri `.text`: '<' truncates, script tag removed, '&' kept | parse:177 | VBU-162, 163, 167 | covered |
| S-026 | cell | **entity-encoded** markup ('&lt;script&gt;') is DECODED into a live tag | parse:177 | — | gap (GAP-26) |
| S-027 | cell | numeric cells: Tax No. float, 17-digit account, pincode float | parse:176; utils:910-915 | VBU-072, 165, 166 | covered |
| S-028 | cell | formula injection in the error sheet | tpl:339-361 | VBU-164 | covered |
| S-029 | access | `disable_manual_vendor_creation` → 745 on upload / template | ctrl:205-208, 219-222 | VBU-040, VBU-043 | skipped-both |
| S-030 | access | Procol employee bypasses the 745 gate | ctrl:206, 220 | — | skipped-both (GAP-45) |
| S-031 | access | seller user refused (app auth 401 / policy) | pol:123-126; config/app_auth_config.yml | VBU-041 | covered |
| S-032 | access | buyer without company:create_record refused (455) | pol:123-126; apiauth:117-119 | VBU-044 | covered |
| S-033 | access | template endpoint has no `authorize` | ctrl:218-229 | VBU-042 (BUG-25) | covered |
| S-034 | access | status endpoint for a member without create_record → 455 | pol:132-134; ctrl:248 | — | gap (GAP-51) |
| S-035 | access | error sheet needs create **and** read_record → 455 | pol:128-130; ctrl:233 | — | gap (GAP-51) |
| S-036 | access | onboarding payload needs `create_vendor_onboarding_events?` → 455 | ctrl:203-204 | — | gap (GAP-51, needs member) |
| S-037 | access | payload ignored unless v2 + `configurations` hash + order_type vendor_onboarding + forms | helper:716-730 | VBU-132 (positive only) | partial |
| S-038 | status | status list shape | ctrl:247-275 | VBU-036 | covered |
| S-039 | status | counters per status after a mixed job (success + failed); `already_mapped` only via the legacy path | ctrl:251-268 | runner reads `statusApi` in bulk cases; no case asserts the counters | partial |
| S-040 | error sheet | no job id → 2 | ctrl:235 | VBU-037 | covered |
| S-041 | error sheet | job_uuid that does not decode → `job_id` nil → 2 (not 487) | pauth:70-75; ctrl:235 | — | gap (low, GAP-50) |
| S-042 | error sheet | job with no failed rows → 487 text about phones | ctrl:238 | VBU-038 (BUG-21) | covered |
| S-043 | error sheet | another user's job → 487, never their rows (scoped by `user_id`) | ctrl:236-238 | — | gap (GAP-52, needs a 2nd uploader) |
| S-044 | error sheet | lists failed rows with an Error column | ctrl:232-245; tpl:339-361 | VBU-039 | covered |
| S-045 | error sheet | re-upload of the error sheet | tpl:63-79; parse:168-181 | VBU-045 | covered |
| S-046 | error sheet | **Vendor Profile dropdown hard-coded to F4:F100** (one column off on PD; on City for GMMCO) | tpl:97 | VBU-032 checks the template only | gap (GAP-49) |
| S-047 | error sheet | only `status: 2` rows, columns limited to the CURRENT headers (unknown columns such as 'Remarks' are dropped) | ctrl:236; tpl:339-361 | VBU-039 (1 row) | partial |
| S-048 | template | headers per settings | tpl:104-116; utils:792-852 | VBU-030 | covered |
| S-049 | template | sample row shifted against the headers | tpl:295-337 | VBU-031 (BUG-12) | covered |
| S-050 | template | **template uploaded as downloaded** (sample row left in) | tpl:295-337; val:24-25,86-95 | — | gap (GAP-48) |
| S-051 | template | Vendor Profile dropdown range D4:D100 | tpl:96-102 | VBU-032 (BUG-13) | covered |
| S-052 | template | declared dimension | axlsx | VBU-033 | covered |
| S-053 | template | Data Sheet: profiles, onboarding Yes/No, status | tpl:124-145 | VBU-034 | covered |
| S-054 | template | Data Sheet Business Location (unique country names of active TTCMs) + Tax Type (hard-coded GST, VAT) lists | tpl:287-293 | VBU-034 does not assert these two | partial |
| S-055 | template | contactless mandatory group | utils:801-805,820 | VBU-035 (G) | covered |
| S-056 | template | required extra fields drawn as mandatory (PD) | utils:806-807,841 | VBU-030 lists them; group not asserted | partial |
| S-057 | template | template with vendor_invitation_v2 ON (dynamic profile range) / can_skip OFF (no onboarding column) | tpl:96-102, 55-58; utils:834 | — | skipped-both (GAP-43) |
| S-058 | tax | Tax No. with BL or Tax Type blank → Invalid Tax No. | val:87-89 | VBU-065, 066 | covered |
| S-059 | tax | pair with no active mapping / case-sensitive names → not configured | val:90-95 | VBU-067, 068, 069 | covered |
| S-060 | tax | 36 "India" countries | val:90 | VBU-059 (BUG-02) | covered |
| S-061 | tax | regex: lower case, 14/16 chars, numeric cell, trailing space | val:96 | VBU-061, 063, 064, 072, 062 | covered |
| S-062 | tax | valid GST / valid UK VAT | val:86-103 | VBU-060, VBU-071 | covered |
| S-063 | tax | tax error wins over other errors | val:50-58 | VBU-070 | covered |
| S-064 | tax | Tax Type + BL filled, Tax No. blank → treated as a no-tax row (tax fields silently ignored) | val:24-32 | — | gap (low, GAP-54) |
| S-065 | tax | **PAN derived from GSTIN** when contactless or inv_v2 (no PAN column) / not derived otherwise (PD) | val:99-118 | VBU-120 sets PAN explicitly; VBU-060 tripwired, `data.pan_no` not read | gap (GAP-18) |
| S-066 | tax | PAN No. column: no format check, overrides the derived PAN | utils:905 | VBU-073, VBU-074 | covered |
| S-067 | tax | VAT number differing only in case vs an existing one (dup key is an exact SQL match) | send:275 | — | gap (conditional, GAP-56) |
| S-068 | mandatory | Company Name blank / spaces | val:33, 220-225 | VBU-050, 051 | covered |
| S-069 | mandatory | contactless: POC name / email / profile blank; no tax and no city/address | utils:801-805,828; val:39,191 | VBU-052, 053, 054, 056 (G) | covered |
| S-070 | mandatory | contactless: supplied email still checked | val:39-41 | VBU-055 (G) | covered |
| S-071 | mandatory | contactless OFF: POC email blank | utils:802 | VBU-180 (PD) | covered |
| S-072 | mandatory | contactless OFF: **POC Full Name blank** | utils:802 | — | gap (GAP-09) |
| S-073 | mandatory | contactless OFF: **Vendor Profile blank** | utils:803-805; val:192 | — | gap (GAP-08) |
| S-074 | mandatory | contactless OFF: no tax, City AND Address blank | val:27-31 | VBU-181 (PD) | covered |
| S-075 | mandatory | contactless OFF: no tax, **City set but Address blank** (or vice versa) | val:144-149 | — | gap (GAP-10) |
| S-076 | mandatory | required extra field blank not enforced | val:14-16 (no `extra_fields:`) | VBU-182 (PD, BUG-08) | covered |
| S-077 | mandatory | vendor_invitation_v2 ON + contactless OFF (profile/city/address optional, email still mandatory) | utils:803,828; val:191 | — | skipped-both (GAP-43) |
| S-078 | city | contactless: unknown city → city_id 0 | val:35-37,77; utils:892; mixin:27 | VBU-075 (G, BUG-10) | covered |
| S-079 | city | fuzzy ILIKE match ('a') | val:126-135 | VBU-076 (G) | covered |
| S-080 | city | contactless OFF, no tax, unknown city → Invalid City Name | val:77-79 | VBU-183 (PD) | covered |
| S-081 | city | **contactless OFF + Tax No. + unknown city → accepted, city_id 0** | val:77 (needs Tax No. blank); send:42 | — | gap (GAP-07) |
| S-082 | city | city_id 0 vendor's tax number reused with no city → crash | helper:739 | VBU-154 (G, BUG-06) | covered |
| S-083 | city | City blank → city_id defaults to 38 ('-'); upper-case city ('MUMBAI') resolved by `lower(name) =` | mixin:27; val:129 | VBU-121/122 do not read city_id | partial (low, GAP-55) |
| S-084 | email | 80-89 regex cases | utils:13; val:151-155 | VBU-080…089 | covered |
| S-085 | email | POC 2 email invalid | val:42-44 | VBU-090 | covered |
| S-086 | POC 2 | name without email → failed AFTER the vendor is created | wrk:175-179 | VBU-128 (BUG-07) | covered |
| S-087 | POC 2 | email without name (other half of the pair) | wrk:176 | — | gap (GAP-28) |
| S-088 | POC 2 | **POC 2 email = POC email** → 688 after creation (or a second invite via 778 when VRP Code is set) | wrk:37-47; send:237,241-253, 88-89 | — | gap (GAP-27) |
| S-089 | POC 2 | **member invite has no skip flag → prospect mail on "No" rows** | wrk:38-44; send:434; inv:135-138 | VBU-119/120 assert skip on "2 invitations" but tier=creates | gap / tier defect (GAP-01) |
| S-090 | POC 2 | contactless row with POC 2 only → vendor without invitation + POC 2 member invite | send:332, 352 | — | gap (folded into GAP-01) |
| S-091 | Deals In | unknown code named in the error | val:165-183 | VBU-091 | covered |
| S-092 | Deals In | valid uuid passes | val:172-173 | VBU-092 (tripwired) | covered |
| S-093 | Deals In | only the first valid token is checked | val:169-181 | VBU-093, 094 (BUG-14) | covered |
| S-094 | Deals In | **unique category NAME passes validation but the vendor is never linked** (`category_ids` = decode of a name = nil) | val:176-179; utils:898-900; teams:33 | — | gap (GAP-11) |
| S-095 | Deals In | valid uuid actually creates the category team on the vendor (side effect) | vpchelper:20; teams:23-44 | — | gap (GAP-12) |
| S-096 | Deals In | uuid of ANOTHER workspace's category refused | val:172 (`all_product_ids` = workspace) | — | gap (GAP-13) |
| S-097 | Deals In | name present twice in the workspace refused; name with a space after the comma refused (no strip) | val:176-178 | — | gap (data-dependent, section D) |
| S-098 | profile | custom profiles: 'manufacturer' refused, label refused, upper case ok, trailing space refused | val:185-199; utils:861-871 | VBU-095, 096, 097, 098 | covered |
| S-099 | profile | profile resolving to broker/brokerage → `broker_invite`, company category brokerage | wrk:115-125 | — | gap (conditional on mapping, GAP-16) |
| S-100 | profile | contactless blank profile → `misc.category_data` = first mapping entry whose category is manufacturer | wrk:116-130 | VBU-054 (validation only) | partial (GAP-17) |
| S-101 | status | unknown / blacklisted / trimmed REJECTED | val:201-207 | VBU-100, 101, 102 | covered |
| S-102 | status | **Status 'active' is deleted before the invite → no effect** (Yes row stays a Prospect) | wrk:97 | — | gap (GAP-15) |
| S-103 | onboarding | invalid values | val:209-218 | VBU-105…108 | covered |
| S-104 | onboarding | No → Active + skip; Yes → Prospect; blank → Prospect; ' no ' | wrk:66-71,92-99; vpc:240-249 | VBU-119/120/184, 123, 124, 127 | covered |
| S-105 | onboarding | can_skip OFF: column not validated, ignored; vendor always onboarded | val:211; wrk:92-93 | — | skipped-both (GAP-42) |
| S-106 | vendor code | >100 chars refused before invite; 100 ok | wrk:106-113 | VBU-110, 111 | covered |
| S-107 | vendor code | existing vendor code → 584 | send:263-281 | VBU-146 (G) | covered |
| S-108 | vendor code | **existing VRP code → 584** | send:266-267,281 | — | gap (GAP-20) |
| S-109 | vendor code | **Vendor Code of A + VRP of B → 716** | send:269-271 | — | gap (GAP-21) |
| S-110 | vendor code | **Tax No. of A + Vendor Code of B → 717** | send:278-279 | — | gap (GAP-22) |
| S-111 | vendor code | code differing only in case / trailing space is not a duplicate (exact `where`) | send:264 | — | gap (GAP-23) |
| S-112 | vendor code | two rows in one sheet with the same NEW code → both created (race) | mwrk:11-14; send:261-264 | — | gap (GAP-24) |
| S-113 | extra fields | dropdown not enforced | mixin:49-69 | VBU-112 (G, BUG-15) | covered |
| S-114 | extra fields | stored in misc | mixin:49-69 | VBU-119, VBU-120 | covered |
| S-115 | extra fields | attachment / number / date-typed extra field fed plain text (stored raw; attachment expects an array) | mixin:55-66 | — | gap (data-dependent, section D) |
| S-116 | invite | contactless + no email → no invitation | send:332,337 | VBU-121, 122 (G) | covered |
| S-117 | invite | contactless + email, no name → invite with blank name | send:309 | VBU-129 (G) | covered |
| S-118 | invite | same email, no tax → 688 (race between parallel rows) | send:241-253 | VBU-130 | covered |
| S-119 | invite | **POC email of a BUYER user → 687 'This email is already registered.'** | send:147-167, 117 | — | gap (GAP-29) |
| S-120 | invite | **POC email of an already-registered vendor user NOT mapped here → invitation `accepted`, user mapped, no invite mail** | send:69, 329, 341-343, 396; inv:46-48 | — | gap (GAP-30) |
| S-121 | invite | POC email of a broker user → that user's category flipped to seller (side effect on someone else's data) | send:117-121 | — | section D (destructive) |
| S-122 | invite | conflicting broker invitation (731) / buyer-share invitation (743) | send:187-197 | — | section D (needs data) |
| S-123 | invite | **restricted_pan_email_domains → 1138** | pan:14-41; send:60-61; sub:46-47 | — | gap (setting unknown, GAP-46) |
| S-124 | back-fill | tax present + City or Address blank → GST lookup; existing same-workspace vendor copied (name capitalised) | send:41-54; helper:732-747 | VBU-152, 153 (G) | covered |
| S-125 | back-fill | **lookup is GLOBAL (`Company.active.find_by(gst_no:)`) → another workspace's vendor name/address/city copied into this one** | helper:734-746 | — | gap (GAP-05) |
| S-126 | back-fill | **new tax number + City/Address blank → external GST provider call** (fails → 133/774/provider message; a tax type with no validation type raises → 'Internal error in sending invitation') | helper:748-754; ext:23-38; models/tax_type_country_mapping.rb:31-34; wrk:145-152 | — | gap (GAP-06) |
| S-127 | rejected | Status rejected → mapping + invitation rejected, POC user created | wrk:159-171; send:393-406 | VBU-125 | covered |
| S-128 | rejected | rejected wins over Yes | vpc:241 | VBU-126 | covered |
| S-129 | rejected | **contactless rejected + no email → user with NULL email → later no-email rows fail 688 / 2** | wrk:28-35; mixin:14,15; models/user.rb:130; send:233-235 | — | gap (GAP-02) |
| S-130 | rejected | **rejected + POC 2 → active member invite → mail to POC 2 + prospect mail** | wrk:175-182; send:374-381; models/company.rb:934-936 | — | gap (GAP-04) |
| S-131 | rejected | **rejected row routed to the subsidiary path is NOT rejected** (subsidiary ignores `status`) | sub:199-201, 218 | — | gap (GAP-03) |
| S-132 | rejected | rejected-user creation fails → 'Internal error creating user…'; a later POC 2 success flips the row back to success | wrk:162-170, 61 | — | section D |
| S-133 | subsidiary | same email + tax → subsidiary; invitation lacks skip flag | send:85-87; sub:146-235 | VBU-131 (CODE-2) | covered (real-mail) |
| S-134 | subsidiary | **same email + Vendor Code (no tax) → subsidiary that INHERITS the original's GST** (`vendor.dup`, nil params compacted) | send:242; sub:191-197; mixin:30,39 | — | gap (GAP-31) |
| S-135 | subsidiary | **registered-user path: no City/Address → 350 'Incorrect details'** | sub:149-160, 94-96 | — | gap (GAP-32) |
| S-136 | subsidiary | registered-user path: 563 duplicate name / 70 company category not seller / 1111 | sub:97-111 | — | section D (needs a vendor with mixed categories) |
| S-137 | subsidiary | invitation path: 134 (sameGst OFF) / 1111 / 563 (same name+address+city, no tax) | sub:176-189 | — | gap (folded into GAP-31, the 563 variant) |
| S-138 | subsidiary | broker category → 730 | sub:154-155,165-166 | — | gap (conditional, GAP-16) |
| S-139 | side effect | Active mapping → P2P vendor-portal external request (GMMCO is_p2p_vendor_portal_enabled) | bscm:48,185-215 | — | gap (GAP-33) |
| S-140 | side effect | invite mail / prospect mail recipients; custom template suppresses prospect mail; `stopping_invite_for_onboarding_team`; recipient scope | inv:97-140; mail:174-203 | VBU-123/124 (real-mail, not asserted) | partial (section D) |
| S-141 | onboarding payload | payload + failed row → no event; payload + Yes → event | wrk:195-197; evw:10-41 | VBU-132, VBU-134 | covered |
| S-142 | onboarding payload | **event creation error is only logged → row success, no event** | evw:36-38 | — | gap (GAP-34) |
| S-143 | onboarding payload | **payload + Status rejected + Yes → onboarding event started for a REJECTED vendor** | wrk:93,195 | — | gap (GAP-35) |
| S-144 | onboarding payload | event worker raises → row rolled back with 'Vendor onboarding could not be started…' | wrk:199-207 | — | section D (needs an exception) |
| S-145 | dedup | GMMCO key gst+address+pincode+account_group variations | send:288-298; dup:23-32,98-119 | VBU-140…150, 152, 153 (G) | covered |
| S-146 | dedup | in-sheet identical new vendors | mwrk:11-14 | VBU-151 (G, BUG-01) | covered |
| S-147 | dedup | a contactless Prospect is seen | send:227-228 | VBU-155 (G) | covered |
| S-148 | dedup | **existing vendor with NO pincode (all legacy rows) blocks a new branch with a pincode** (treat_as_match) | dup:27,114-115 | — | gap (GAP-36) |
| S-149 | dedup | **back-filled address + different pincode → allowed** (PR spec duplicate_check_integration_spec.rb:74) | send:41-54; dup:27 | VBU-153 (same pincode only) | gap (GAP-37) |
| S-150 | dedup | **a Rejected vendor still blocks a duplicate** (statuses = all but in_active) | send:227, 259, 275 | — | gap (GAP-38) |
| S-151 | dedup | fallback, sameGstMulti ON | send:292-293 | VBU-156, 157 | skipped-both |
| S-152 | dedup | fallback, sameGstMulti OFF → 134 | send:294-295 | VBU-158 (PD) | covered |
| S-153 | dedup | config without gst_no / with unknown field → fallback | dup:63-65,71 | VBU-159, VBU-138 | skipped-both |
| S-154 | dedup | config `["gst_no"]` alone → no comparison fields → `configured?` false → FALLBACK (not "block every GST") | dup:67-74,46-48 | — | skipped-both (GAP-39) |
| S-155 | dedup | `pan_no` in the key (no_match on blank) | dup:25 | — | skipped-both (GAP-40) |
| S-156 | dedup | manual Invite form parity | send:274-298 | VBU-135, VBU-136 (G) | covered |
| S-157 | legacy | workspace with no `vendor_onboarding_version` → UpdateMappedVendorService → `already_mapped` or its errors | wrk:131-140; legacy:12-70 | — | skipped-both (GAP-44) |
| S-158 | worker | `deals_in` error branch in the worker is dead code (validation already failed the row) | wrk:100-105 | — | n/a |
| S-159 | worker | 690 / 692 / 509 / 568 / 393 / 691 unreachable from the bulk main invite (worker always sets invite_type + category; validation catches email/name first) | send:304-326, 455-469 | — | n/a |
| S-160 | manual form | contactless also relaxes the manual Invite form | send:351-354 | VBU-133 (G, BUG-26) | covered |
| S-161 | UI | picker accepts .csv; onboarding page shows Bulk Upload; job tags | client | VBU-046, 047, 048 (manual) | covered (manual; 047 skipped-both) |

**Totals: 161 scenarios.** Covered 82 (including the 3 manual UI checks in S-161 and the real-mail VBU-131), partial 8, gap 53 (10 of them low, conditional on a setting, or dependent on data), skipped-both 10, section D only 5, n/a 3. Section B proposes 54 cases (GAP-01…56). GAP-14 and GAP-19 do not exist: the Deals-In duplicate-name case went to section D, and the PD half of PAN derivation is part of GAP-18.

---

## C. Error-message catalogue

HTTP-level messages (rendered via `render_error_json`; 422 unless noted):

| Message | Where | Trigger | Covered by |
|---|---|---|---|
| Insufficient parameters (2) | ctrl:209; ctrl:235 | no / null `excel_data`; error sheet without a decodable job id | VBU-001, 002, 037 (GAP-50 for a bad uuid) |
| Invalid file format | sheet:10 → ctrl:211 (code 15, message replaced) | Roo can open the file neither as xlsx nor as xls | VBU-004…009 |
| Format is updated for bulk upload, please download the format to continue. | parse:165; loc:506 | 'POC - Phone Number' / 'POC 2 - Mobile' / 'GST' on row 3 | VBU-010, 011 |
| Manual vendor creation is disabled (745) | ctrl:207, 221 | setting ON, non-Procol user | VBU-040, 043 (skipped-both) |
| Invalid query (263) | ctrl:212 | unreachable (`import` returns an object) | — (n/a) |
| You are not allowed to change the phone number. (487) | ctrl:238 | error sheet, no failed rows for this user and job | VBU-038 |
| You are not authorized to perform this action (455) | apiauth:117-119 (authorize at ctrl:200, 204, 233, 248) | policy refused | VBU-044 (upload); GAP-51 (status, error sheet, payload) |
| This app is not authorized to use this API (401) | config/error_config.yml:393; loc:1499 | endpoint not enabled for the calling app | VBU-041 |
| HTTP 500 (no message) | ctrl:209-211; sheet:5-11; parse:170-171 | "" / docx / empty workbook | VBU-003, 008, 012 |

Row-level messages from validation (val, PR head lines; checked in this order):

| Message | Where | Trigger | Covered by |
|---|---|---|---|
| Either Tax No. or Without Tax No. fields are needed | val:51 | no tax, City or Address blank, contactless and inv_v2 OFF | VBU-181; GAP-10, 54 |
| Tax Type not configured for the selected Business Location | val:54 | country or tax type not found, no active mapping, or regex nil | VBU-059, 067, 068, 069; GAP-48 |
| Invalid Tax No. | val:54 | BL / Tax Type blank, or regex mismatch | VBU-061…066, 070, 072 |
| Mandatory Item cannot be left empty | val:57 | a mandatory column blank | VBU-019, 050, 051, 180, 182 (BUG); GAP-08, 09 |
| Invalid Deals In : <token> | val:60 | a token that is neither a workspace category id nor a unique name | VBU-091, 093, 094; GAP-13 |
| Invalid Email | val:63 | POC email fails `VALID_EMAIL_REGEX` | VBU-022, 055, 080…086 |
| Invalid Email 2 | val:66 | POC 2 email present and invalid | VBU-090 |
| Invalid Vendor Profile | val:69 | not a profile key; blank when contactless and inv_v2 are OFF falls to "Mandatory" first | VBU-095, 096, 098 |
| Invalid Status | val:72 | not blank / active / rejected | VBU-100, 101 + every tripwire |
| Invalid Vendor Onboarding Required. Choose Yes or No from the dropdown | val:75 | can_skip ON, not Yes/No | VBU-102, 105…108 |
| Invalid City Name | val:78 | no tax, city unresolved, contactless OFF | VBU-183 |

Row-level messages from the worker and the invite path (joined with ", " when a row collects several):

| Message | Where | Trigger | Covered by |
|---|---|---|---|
| Invalid Value for Vendor Code. | wrk:109 | code > 100 chars | VBU-110 |
| Invalid Values for POC 2. | wrk:177 | only one half of POC 2, or an invalid POC 2 email | VBU-128; GAP-28 |
| Internal error in sending invitation | wrk:151; loc:502 | exception in SendService (city_id 0 vendor, tax type with no validation type) | VBU-154; GAP-06 |
| Internal error creating user for rejected vendor | wrk:167; loc:504 | exception in the rejected-user creation | — (section D) |
| Internal error mapping POC 2 | wrk:188; loc:503 | exception in the member invite | — (section D) |
| Vendor onboarding could not be started, so the vendor was not created. Please re-upload this row. | wrk:204; loc:505 | any exception in the row transaction (incl. the onboarding event) | — (section D) |
| This email is already registered. (687) | send:165 | POC email is a buyer (or a non-convertible broker) user | GAP-29 |
| This email is already invited. (688) | send:251 (also buyer path send:208) | email mapped or invited here, no tax/code/VRP | VBU-130; GAP-02, 27 |
| (689 → SubsidiaryService, no text) | send:244, 85-87 | as above with tax / code / VRP, worker caller | VBU-131 |
| Send invite for the company. (778) | send:247 → send:88-89 sends anyway | member invite whose email is already mapped | GAP-27 (VRP variant) |
| POC name is not present (691) | send:310 | unreachable from bulk (mandatory rule first; skipped under contactless) | VBU-129 shows it skipped |
| Email Not Present (568) / Invalid Email ID (393) | send:458, 460 | unreachable from bulk; manual form only | VBU-133 (568, manual form) |
| Category not valid for vendor company (509) / Invitation type is not present (690) / Invalid invite type (692) | send:464, 306, 322 | unreachable from the bulk worker | — (n/a) |
| Please select Manufacturer instead of Broker for the vendor profile category. (730) | send:180; sub:155, 166 | broker invite vs a manufacturer invitation, or a broker subsidiary | GAP-16 (conditional) |
| Please select Broker instead of Manufacturer for the vendor profile category. (731) | send:191; sub:157, 168 | manufacturer invite vs a broker invitation or company | — (section D) |
| This email exists for a buyer (743) | send:184, 195 | the email has a buyer-share invitation | — (section D) |
| Vendor code and VRP Code belong to different companies (716) | send:270 | code of A + VRP of B | GAP-21 |
| Code and GST Number belong to different companies (717) | send:279 | tax of A + code of B | GAP-22 |
| Vendor Code or GST Number is already taken (584) | send:281 | existing vendor code or VRP code | VBU-146; GAP-20, 24 |
| Vendor with this GST and address already exists (1111) | send:291, 293; sub:109, 184 | duplicate key / same address | VBU-140…155, 156, 159, 138, 135; GAP-36, 38 |
| Tax no. already registered with another company (134) | send:295; sub:181 | repeated tax number, no fields, sameGst OFF | VBU-158 |
| This PAN cannot be registered with this email address (1138) | pan:40 via send:60-61, sub:46-47 | restricted_pan_email_domains | GAP-46 |
| Invalid Tax number (133) | helper:733, 754 | GST lookup: blank tax / not validated | GAP-06 |
| Tax type country mapping not found (776) | helper:750 | lookup without an active TTCM id | — (unreachable: validation sets the id) |
| Validation type not found (774) / %{param} is missing / %{param} input is incorrect / provider errors | ext:25, 30, 32, 42+ | external lookup | GAP-06 |
| Insufficient parameters (2) — subsidiary | sub:44 | subsidiary with a nil email | GAP-02 (follow-up row) |
| Incorrect details (350) | sub:95, 105 | registered-user subsidiary without address/city (inv_v2 OFF) | GAP-32 |
| User Already exists as Vendor (563) | sub:98, 187 | duplicate subsidiary (name / name+address+city) with no tax | GAP-31 variant |
| User does not exist (70) | sub:101 | registered user whose workspace companies are not all 'seller' | — (section D) |
| You are not allowed to perform this action (101) / Company not found (130) | teams:28, 31 | category team on a company not mapped / not found | — (unreachable in a normal row) |
| Insufficient parameters (2) / Unable to create invite (693) / Company not found (130) — member invite | send:488, 494, 504 | POC 2 member invite with a missing or foreign company | — (unreachable: company just created and mapped) |
| Could not find vendor company. / Could not find vendor mapping to update. / Failed to sync vendor categories. / An internal error occurred while updating the vendor. / ActiveRecord messages | legacy:17, 23, 31, 33, 39; loc:517-520 | legacy (no onboarding version) update path | GAP-44 (skipped-both) |

---

## D. Not testable via the API, or needing data we cannot create

- **UI-only:** the CSV picker, the onboarding-page link and the job tags (VBU-046/047/048); whether Excel enforces the template's dropdowns (data-validation is client-side Excel behaviour).
- **Mail delivery and recipients:** the invite mail, the "new prospect" mail and their recipients (vendor-management team vs initiator, `stopping_invite_for_onboarding_team`, custom vendor-invite template) can only be asserted from the mail log or the Sidekiq queue, not from the API. Settings we may not change.
- **Exception-only branches:** 'Internal error creating user for rejected vendor', 'Internal error mapping POC 2', 'Vendor onboarding could not be started…', and the status flip in which a POC 2 success overrides an earlier failure (wrk:61). All need an injected exception.
- **Data we should not create or touch:**
  - a broker user, or a vendor with a broker invitation (730/731; send:117-121 would also flip a real broker user's category to seller);
  - a buyer-share invitation for the email (743);
  - a registered vendor user whose workspace companies are not all 'seller' (70);
  - two active categories with the same name (the Deals In name-count rule);
  - attachment-, number- or date-typed extra fields (the field types of GMMCO/PD were not read; a text value is stored raw, mixin:55-66);
  - a second uploading user for the error-sheet IDOR check (GAP-52), unless a QA member with create_record exists;
  - a multi-workspace (non-boxed) user, to see jobs and error rows from another workspace (ctrl:237, 250).
- **Template Deals-In codes:** these come from `Current.allowed_companies` (tpl:253-261), while validation accepts only the workspace's own categories (val:157-163). They differ only where allowed_companies spans several companies, which depends on the account hierarchy.
- **Master-data-dependent outcomes:** which "India" row wins (VBU-059); the exact external-lookup message (GAP-06); whether the UK VAT regex accepts lower case (GAP-56). Read them with a SELECT before asserting exact text.
