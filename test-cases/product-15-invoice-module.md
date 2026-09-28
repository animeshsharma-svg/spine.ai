# Product test cases — 15. Invoice Module (MOD-17)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-17 · 24 features · 91 cases · group `PRD-INV` · plan availability: All Plans · status: GA

Vendor invoice capture, PO/GRN matching, tax & exception handling in the P2P cycle.

## 1. Core features

#### PRD-INV-001 — Customizable Invoice Template: happy path for the AP Executive

- **Why it matters.** Consistent, correct capture across varied vendor invoice formats. Business use: Field mapping is configured per vendor or invoice type (standard, freight, CHA) to match how vendors actually invoice us.
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Customizable Invoice Template to get what the story asks for: invoice capture templates configurable per vendor/invoice type.
  3. Follow the business scenario the workbook gives: "Field mapping is configured per vendor or invoice type (standard, freight, CHA) to match how vendors actually invoice us".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: every invoice format we receive maps correctly. The business use case is served: field mapping is configured per vendor or invoice type (standard, freight, CHA) to match how vendors actually invoice us.
- **Oracle.** Observable proof that Customizable Invoice Template did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-001.
- **Trace.** P0 · manual · `FEAT-INV-001` · workbook sheet "15. Invoice Module"

#### PRD-INV-002 — Customizable Invoice Template: template varies by invoice type (standard/freight/CHA/credit/debit)

- **Why it matters.** The workbook records this edge case for Customizable Invoice Template: "Template varies by invoice type (standard/freight/CHA/credit/debit)".
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Template varies by invoice type (standard/freight/CHA/credit/debit)".
  3. Use Customizable Invoice Template to get invoice capture templates configurable per vendor/invoice type.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Customizable Invoice Template behaves as the workbook states: "Template varies by invoice type (standard/freight/CHA/credit/debit)".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-001` · workbook sheet "15. Invoice Module"

#### PRD-INV-003 — Customizable Invoice Template: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Customizable Invoice Template. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Customizable Invoice Template to get invoice capture templates configurable per vendor/invoice type.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-001` · workbook sheet "15. Invoice Module"

#### PRD-INV-004 — Invoice OCR: happy path for the AP Executive

- **Why it matters.** Removes manual data entry and reduces keying errors. Business use: Scanned/PDF invoices are parsed and key fields (vendor, amount, tax, line items) are auto-extracted for review.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Invoice OCR to get what the story asks for: the system to OCR-extract invoice data automatically.
  3. Follow the business scenario the workbook gives: "Scanned/PDF invoices are parsed and key fields (vendor, amount, tax, line items) are auto-extracted for review".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: they don't manually key in every field. The business use case is served: scanned/PDF invoices are parsed and key fields (vendor, amount, tax, line items) are auto-extracted for review.
- **Oracle.** Observable proof that Invoice OCR did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-002.
- **Trace.** P0 · manual · `FEAT-INV-002` · workbook sheet "15. Invoice Module"

#### PRD-INV-005 — Invoice OCR: low-confidence extractions are flagged for manual review before posting

- **Why it matters.** The workbook records this edge case for Invoice OCR: "Low-confidence extractions are flagged for manual review before posting".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Low-confidence extractions are flagged for manual review before posting".
  3. Use Invoice OCR to get the system to OCR-extract invoice data automatically.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Invoice OCR behaves as the workbook states: "Low-confidence extractions are flagged for manual review before posting".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-002` · workbook sheet "15. Invoice Module"

#### PRD-INV-006 — Invoice OCR: not available on plans below Growth

- **Why it matters.** The workbook limits Invoice OCR to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Invoice OCR to get the system to OCR-extract invoice data automatically.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-002` · workbook sheet "15. Invoice Module"

#### PRD-INV-007 — Invoice OCR: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Invoice OCR. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice OCR to get the system to OCR-extract invoice data automatically.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-002` · workbook sheet "15. Invoice Module"

#### PRD-INV-008 — Email OCR — Auto-Fetch from Inbox: happy path for the AP Executive

- **Why it matters.** Removes the manual download/upload step entirely from the AP workflow. Business use: A monitored AP inbox is polled; attached invoices are pulled in, OCR'd, and queued for matching without manual upload.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Email OCR — Auto-Fetch from Inbox to get what the story asks for: invoices emailed by vendors to be fetched and OCR'd automatically.
  3. Follow the business scenario the workbook gives: "A monitored AP inbox is polled; attached invoices are pulled in, OCR'd, and queued for matching without manual upload".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: they don't have to download and upload them manually. The business use case is served: a monitored AP inbox is polled; attached invoices are pulled in, OCR'd, and queued for matching without manual upload.
- **Oracle.** Observable proof that Email OCR — Auto-Fetch from Inbox did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-003.
- **Trace.** P0 · manual · `FEAT-INV-003` · workbook sheet "15. Invoice Module"

#### PRD-INV-009 — Email OCR — Auto-Fetch from Inbox: non-invoice attachments/spam need filtering logic to avoid false capture

- **Why it matters.** The workbook records this edge case for Email OCR — Auto-Fetch from Inbox: "Non-invoice attachments/spam need filtering logic to avoid false capture".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Non-invoice attachments/spam need filtering logic to avoid false capture".
  3. Use Email OCR — Auto-Fetch from Inbox to get invoices emailed by vendors to be fetched and OCR'd automatically.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Email OCR — Auto-Fetch from Inbox behaves as the workbook states: "Non-invoice attachments/spam need filtering logic to avoid false capture".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-003 quoting the note.
- **Trace.** P3 · manual · `FEAT-INV-003` · workbook sheet "15. Invoice Module"

#### PRD-INV-010 — Email OCR — Auto-Fetch from Inbox: not available on the Growth plan

- **Why it matters.** The workbook limits Email OCR — Auto-Fetch from Inbox to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Email OCR — Auto-Fetch from Inbox to get invoices emailed by vendors to be fetched and OCR'd automatically.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-003` · workbook sheet "15. Invoice Module"

#### PRD-INV-011 — Email OCR — Auto-Fetch from Inbox: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Email OCR — Auto-Fetch from Inbox. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Email OCR — Auto-Fetch from Inbox to get invoices emailed by vendors to be fetched and OCR'd automatically.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-003` · workbook sheet "15. Invoice Module"

#### PRD-INV-012 — Line-Item Level PO–Invoice Matching: happy path for the AP Executive

- **Why it matters.** Line-level accuracy catches errors that header-level totals would miss. Business use: Every invoice line is checked against the corresponding PO line for item, rate, and quantity.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Line-Item Level PO–Invoice Matching to get what the story asks for: invoice line items matched to PO line items individually.
  3. Follow the business scenario the workbook gives: "Every invoice line is checked against the corresponding PO line for item, rate, and quantity".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: mismatches are caught at the line, not just the header total. The business use case is served: every invoice line is checked against the corresponding PO line for item, rate, and quantity.
- **Oracle.** Observable proof that Line-Item Level PO–Invoice Matching did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-004.
- **Trace.** P0 · manual · `FEAT-INV-004` · workbook sheet "15. Invoice Module"

#### PRD-INV-013 — Line-Item Level PO–Invoice Matching: multiple invoice lines can map to one PO line and vice versa

- **Why it matters.** The workbook records this edge case for Line-Item Level PO–Invoice Matching: "Multiple invoice lines can map to one PO line and vice versa".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Multiple invoice lines can map to one PO line and vice versa".
  3. Use Line-Item Level PO–Invoice Matching to get invoice line items matched to PO line items individually.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Line-Item Level PO–Invoice Matching behaves as the workbook states: "Multiple invoice lines can map to one PO line and vice versa".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-004` · workbook sheet "15. Invoice Module"

#### PRD-INV-014 — Line-Item Level PO–Invoice Matching: not available on plans below Growth

- **Why it matters.** The workbook limits Line-Item Level PO–Invoice Matching to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Line-Item Level PO–Invoice Matching to get invoice line items matched to PO line items individually.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-004` · workbook sheet "15. Invoice Module"

#### PRD-INV-015 — Line-Item Level PO–Invoice Matching: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Line-Item Level PO–Invoice Matching. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Line-Item Level PO–Invoice Matching to get invoice line items matched to PO line items individually.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-004` · workbook sheet "15. Invoice Module"

#### PRD-INV-016 — 3-Way Match (PO – Invoice – GRN): happy path for the AP Executive

- **Why it matters.** Prevents payment for undelivered or unordered goods. Business use: Standard match cycle for goods POs before an invoice is released for payment.
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use 3-Way Match (PO – Invoice – GRN) to get what the story asks for: the system to 3-way match PO, invoice, and GRN.
  3. Follow the business scenario the workbook gives: "Standard match cycle for goods POs before an invoice is released for payment".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: we only pay for what was ordered and received. The business use case is served: standard match cycle for goods POs before an invoice is released for payment.
- **Oracle.** Observable proof that 3-Way Match (PO – Invoice – GRN) did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-005.
- **Trace.** P0 · manual · `FEAT-INV-005` · workbook sheet "15. Invoice Module"

#### PRD-INV-017 — 3-Way Match (PO – Invoice – GRN): partial GRNs allow partial invoice release against the matched portion

- **Why it matters.** The workbook records this edge case for 3-Way Match (PO – Invoice – GRN): "Partial GRNs allow partial invoice release against the matched portion".
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Partial GRNs allow partial invoice release against the matched portion".
  3. Use 3-Way Match (PO – Invoice – GRN) to get the system to 3-way match PO, invoice, and GRN.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** 3-Way Match (PO – Invoice – GRN) behaves as the workbook states: "Partial GRNs allow partial invoice release against the matched portion".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-005 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-005` · workbook sheet "15. Invoice Module"

#### PRD-INV-018 — 3-Way Match (PO – Invoice – GRN): refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of 3-Way Match (PO – Invoice – GRN). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use 3-Way Match (PO – Invoice – GRN) to get the system to 3-way match PO, invoice, and GRN.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-005` · workbook sheet "15. Invoice Module"

#### PRD-INV-019 — 2-Way Match (PO – Invoice): happy path for the AP Executive

- **Why it matters.** Enables matching for non-material spend. Business use: Used for service POs or categories where GRN isn't applicable.
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use 2-Way Match (PO – Invoice) to get what the story asks for: a 2-way match option for service/non-GRN POs.
  3. Follow the business scenario the workbook gives: "Used for service POs or categories where GRN isn't applicable".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: invoices can still be validated without a physical receipt step. The business use case is served: used for service POs or categories where GRN isn't applicable.
- **Oracle.** Observable proof that 2-Way Match (PO – Invoice) did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-006.
- **Trace.** P0 · manual · `FEAT-INV-006` · workbook sheet "15. Invoice Module"

#### PRD-INV-020 — 2-Way Match (PO – Invoice): applies to service POs where Service Entry Sheet substitutes for GRN

- **Why it matters.** The workbook records this edge case for 2-Way Match (PO – Invoice): "Applies to service POs where Service Entry Sheet substitutes for GRN".
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Applies to service POs where Service Entry Sheet substitutes for GRN".
  3. Use 2-Way Match (PO – Invoice) to get a 2-way match option for service/non-GRN POs.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** 2-Way Match (PO – Invoice) behaves as the workbook states: "Applies to service POs where Service Entry Sheet substitutes for GRN".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-006 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-006` · workbook sheet "15. Invoice Module"

#### PRD-INV-021 — 2-Way Match (PO – Invoice): refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of 2-Way Match (PO – Invoice). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use 2-Way Match (PO – Invoice) to get a 2-way match option for service/non-GRN POs.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-006` · workbook sheet "15. Invoice Module"

#### PRD-INV-022 — Configurable Invoice Validation Rule Engine: happy path for the AP Executive

- **Why it matters.** Reduces downstream exceptions by catching data issues at entry. Business use: Rules (duplicate PO reference, missing GSTIN, date sanity, mandatory fields) run automatically at intake.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Configurable Invoice Validation Rule Engine to get what the story asks for: a configurable set of validation checks run on every invoice.
  3. Follow the business scenario the workbook gives: "Rules (duplicate PO reference, missing GSTIN, date sanity, mandatory fields) run automatically at intake".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: bad data is caught before it enters the match/approval cycle. The business use case is served: rules (duplicate PO reference, missing GSTIN, date sanity, mandatory fields) run automatically at intake.
- **Oracle.** Observable proof that Configurable Invoice Validation Rule Engine did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-009.
- **Trace.** P0 · manual · `FEAT-INV-009` · workbook sheet "15. Invoice Module"

#### PRD-INV-023 — Configurable Invoice Validation Rule Engine: tenant configuration — Rule set is configurable per tenant/entity

- **Why it matters.** The workbook says "Rule set is configurable per tenant/entity". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and AP Executive (to use the feature).
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Rule set is configurable per tenant/entity") and record its current value.
  2. As the AP Executive: use Configurable Invoice Validation Rule Engine to get a configurable set of validation checks run on every invoice.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Configurable Invoice Validation Rule Engine follows the tenant's configured value, as the workbook states: "Rule set is configurable per tenant/entity". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-INV-009` · workbook sheet "15. Invoice Module"

#### PRD-INV-024 — Configurable Invoice Validation Rule Engine: not available on plans below Growth

- **Why it matters.** The workbook limits Configurable Invoice Validation Rule Engine to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Configurable Invoice Validation Rule Engine to get a configurable set of validation checks run on every invoice.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-009` · workbook sheet "15. Invoice Module"

#### PRD-INV-025 — Configurable Invoice Validation Rule Engine: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Configurable Invoice Validation Rule Engine. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Invoice Validation Rule Engine to get a configurable set of validation checks run on every invoice.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-009` · workbook sheet "15. Invoice Module"

#### PRD-INV-026 — Fuzzy Line-Item Matching: happy path for the AP Executive

- **Why it matters.** Reduces false-mismatch exceptions caused by cosmetic description differences. Business use: Line item text is matched using similarity scoring rather than exact string match.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Fuzzy Line-Item Matching to get what the story asks for: fuzzy matching between invoice and PO line item descriptions.
  3. Follow the business scenario the workbook gives: "Line item text is matched using similarity scoring rather than exact string match".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: minor wording differences don't block auto-match. The business use case is served: line item text is matched using similarity scoring rather than exact string match.
- **Oracle.** Observable proof that Fuzzy Line-Item Matching did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-013.
- **Trace.** P0 · manual · `FEAT-INV-013` · workbook sheet "15. Invoice Module"

#### PRD-INV-027 — Fuzzy Line-Item Matching: tenant configuration — Similarity threshold is configurable to balance false positives vs. false…

- **Why it matters.** The workbook says "Similarity threshold is configurable to balance false positives vs. false negatives". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and AP Executive (to use the feature).
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Similarity threshold is configurable to balance false positives vs. false negatives") and record its current value.
  2. As the AP Executive: use Fuzzy Line-Item Matching to get fuzzy matching between invoice and PO line item descriptions.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Fuzzy Line-Item Matching follows the tenant's configured value, as the workbook states: "Similarity threshold is configurable to balance false positives vs. false negatives". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-INV-013` · workbook sheet "15. Invoice Module"

#### PRD-INV-028 — Fuzzy Line-Item Matching: not available on plans below Growth

- **Why it matters.** The workbook limits Fuzzy Line-Item Matching to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Fuzzy Line-Item Matching to get fuzzy matching between invoice and PO line item descriptions.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-013` · workbook sheet "15. Invoice Module"

#### PRD-INV-029 — Fuzzy Line-Item Matching: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Fuzzy Line-Item Matching. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Fuzzy Line-Item Matching to get fuzzy matching between invoice and PO line item descriptions.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-013` · workbook sheet "15. Invoice Module"

#### PRD-INV-030 — Rate & Quantity Match at Line-Item Level: happy path for the AP Executive

- **Why it matters.** Precise exception isolation instead of a generic header mismatch. Business use: Each matched line is checked for rate and quantity variance against tolerance.
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Rate & Quantity Match at Line-Item Level to get what the story asks for: rate and quantity checked line-by-line.
  3. Follow the business scenario the workbook gives: "Each matched line is checked for rate and quantity variance against tolerance".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: a rate or quantity discrepancy is caught precisely. The business use case is served: each matched line is checked for rate and quantity variance against tolerance.
- **Oracle.** Observable proof that Rate & Quantity Match at Line-Item Level did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-014.
- **Trace.** P0 · manual · `FEAT-INV-014` · workbook sheet "15. Invoice Module"

#### PRD-INV-031 — Rate & Quantity Match at Line-Item Level: tenant configuration — Tolerance bands (%, absolute) are configurable per category

- **Why it matters.** The workbook says "Tolerance bands (%, absolute) are configurable per category". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and AP Executive (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Tolerance bands (%, absolute) are configurable per category") and record its current value.
  2. As the AP Executive: use Rate & Quantity Match at Line-Item Level to get rate and quantity checked line-by-line.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Rate & Quantity Match at Line-Item Level follows the tenant's configured value, as the workbook states: "Tolerance bands (%, absolute) are configurable per category". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-INV-014` · workbook sheet "15. Invoice Module"

#### PRD-INV-032 — Rate & Quantity Match at Line-Item Level: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Rate & Quantity Match at Line-Item Level. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Rate & Quantity Match at Line-Item Level to get rate and quantity checked line-by-line.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-014` · workbook sheet "15. Invoice Module"

#### PRD-INV-033 — Invoice-Triggered Credit/Debit Note Suggestion: happy path for the AP Executive

- **Why it matters.** Keeps unmatched items auditable rather than stuck as an unresolved exception. Business use: When an invoice line has no PO match, the system prompts creation of a credit/debit note instead of silent rejection.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Invoice-Triggered Credit/Debit Note Suggestion to get what the story asks for: the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  3. Follow the business scenario the workbook gives: "When an invoice line has no PO match, the system prompts creation of a credit/debit note instead of silent rejection".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: the mismatch is resolved formally. The business use case is served: when an invoice line has no PO match, the system prompts creation of a credit/debit note instead of silent rejection.
- **Oracle.** Observable proof that Invoice-Triggered Credit/Debit Note Suggestion did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-015.
- **Trace.** P0 · manual · `FEAT-INV-015` · workbook sheet "15. Invoice Module"

#### PRD-INV-034 — Invoice-Triggered Credit/Debit Note Suggestion: not available on plans below Growth

- **Why it matters.** The workbook limits Invoice-Triggered Credit/Debit Note Suggestion to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Invoice-Triggered Credit/Debit Note Suggestion to get the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-015` · workbook sheet "15. Invoice Module"

#### PRD-INV-035 — Invoice-Triggered Credit/Debit Note Suggestion: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Invoice-Triggered Credit/Debit Note Suggestion. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice-Triggered Credit/Debit Note Suggestion to get the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-015` · workbook sheet "15. Invoice Module"

#### PRD-INV-036 — Invoice Amendment: happy path for the AP Executive

- **Why it matters.** Auditability of invoice corrections. Business use: Corrections to a submitted invoice go through an amendment workflow with the original values preserved for audit.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Amend a submitted invoice through a controlled flow.
  3. Follow the business scenario the workbook gives: "Corrections to a submitted invoice go through an amendment workflow with the original values preserved for audit".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: corrections are tracked, not silently overwritten. The business use case is served: corrections to a submitted invoice go through an amendment workflow with the original values preserved for audit.
- **Oracle.** Observable proof that Invoice Amendment did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-016.
- **Trace.** P0 · manual · `FEAT-INV-016` · workbook sheet "15. Invoice Module"

#### PRD-INV-037 — Invoice Amendment: original invoice values are retained

- **Why it matters.** The workbook records this edge case for Invoice Amendment: "Original invoice values are retained".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Original invoice values are retained".
  3. Use Invoice Amendment to amend a submitted invoice through a controlled flow.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Invoice Amendment behaves as the workbook states: "Original invoice values are retained".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-016 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-016` · workbook sheet "15. Invoice Module"

#### PRD-INV-038 — Invoice Amendment: amendment is logged as a new version

- **Why it matters.** The workbook records this edge case for Invoice Amendment: "amendment is logged as a new version".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "amendment is logged as a new version".
  3. Use Invoice Amendment to amend a submitted invoice through a controlled flow.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Invoice Amendment behaves as the workbook states: "amendment is logged as a new version".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-016 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-016` · workbook sheet "15. Invoice Module"

#### PRD-INV-039 — Invoice Amendment: not available on plans below Growth

- **Why it matters.** The workbook limits Invoice Amendment to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Invoice Amendment to amend a submitted invoice through a controlled flow.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-016` · workbook sheet "15. Invoice Module"

#### PRD-INV-040 — Invoice Amendment: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Invoice Amendment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice Amendment to amend a submitted invoice through a controlled flow.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-016` · workbook sheet "15. Invoice Module"

#### PRD-INV-041 — Specialized Invoice Types (Freight, CHA): happy path for the AP Executive

- **Why it matters.** Logistics and import invoices have structurally different line items than material invoices. Business use: Freight and Customs House Agent invoices use dedicated templates and validation distinct from standard material invoices.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Specialized Invoice Types (Freight, CHA) to get what the story asks for: freight and CHA invoices captured with their own field sets.
  3. Follow the business scenario the workbook gives: "Freight and Customs House Agent invoices use dedicated templates and validation distinct from standard material invoices".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: logistics-specific charges are handled correctly. The business use case is served: freight and Customs House Agent invoices use dedicated templates and validation distinct from standard material invoices.
- **Oracle.** Observable proof that Specialized Invoice Types (Freight, CHA) did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-017.
- **Trace.** P0 · manual · `FEAT-INV-017` · workbook sheet "15. Invoice Module"

#### PRD-INV-042 — Specialized Invoice Types (Freight, CHA): freight/CHA invoices may not link to a standard PO line at all

- **Why it matters.** The workbook records this edge case for Specialized Invoice Types (Freight, CHA): "Freight/CHA invoices may not link to a standard PO line at all".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Freight/CHA invoices may not link to a standard PO line at all".
  3. Use Specialized Invoice Types (Freight, CHA) to get freight and CHA invoices captured with their own field sets.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Specialized Invoice Types (Freight, CHA) behaves as the workbook states: "Freight/CHA invoices may not link to a standard PO line at all".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-017 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-017` · workbook sheet "15. Invoice Module"

#### PRD-INV-043 — Specialized Invoice Types (Freight, CHA): not available on the Growth plan

- **Why it matters.** The workbook limits Specialized Invoice Types (Freight, CHA) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Specialized Invoice Types (Freight, CHA) to get freight and CHA invoices captured with their own field sets.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-017` · workbook sheet "15. Invoice Module"

#### PRD-INV-044 — Specialized Invoice Types (Freight, CHA): refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Specialized Invoice Types (Freight, CHA). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Specialized Invoice Types (Freight, CHA) to get freight and CHA invoices captured with their own field sets.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-017` · workbook sheet "15. Invoice Module"

#### PRD-INV-045 — Match Mismatch → Dispute Case Auto-Creation: happy path for the AP Executive

- **Why it matters.** Keeps mismatch resolution auditable and centralized rather than scattered across email threads. Business use: A discrepancy found during matching auto-creates a linked dispute case with the PO, invoice, and GRN references attached.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Match Mismatch → Dispute Case Auto-Creation to get what the story asks for: a 3-way/4-way match mismatch to automatically open a dispute case.
  3. Follow the business scenario the workbook gives: "A discrepancy found during matching auto-creates a linked dispute case with the PO, invoice, and GRN references attached".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: resolution happens on-platform instead of over email. The business use case is served: a discrepancy found during matching auto-creates a linked dispute case with the PO, invoice, and GRN references attached.
- **Oracle.** Observable proof that Match Mismatch → Dispute Case Auto-Creation did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-018.
- **Trace.** P0 · manual · `FEAT-INV-018` · workbook sheet "15. Invoice Module"

#### PRD-INV-046 — Match Mismatch → Dispute Case Auto-Creation: not available on plans below Growth

- **Why it matters.** The workbook limits Match Mismatch → Dispute Case Auto-Creation to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Match Mismatch → Dispute Case Auto-Creation to get a 3-way/4-way match mismatch to automatically open a dispute case.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-018` · workbook sheet "15. Invoice Module"

#### PRD-INV-047 — Match Mismatch → Dispute Case Auto-Creation: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Match Mismatch → Dispute Case Auto-Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Match Mismatch → Dispute Case Auto-Creation to get a 3-way/4-way match mismatch to automatically open a dispute case.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-018` · workbook sheet "15. Invoice Module"

## 2. Compliance features

#### PRD-INV-048 — Vendor GST Mismatch Validation: happy path for the AP Executive

- **Why it matters.** Prevents compliance and input-tax-credit issues from GST mismatches. Business use: Invoice GSTIN is checked against the vendor master record at capture time.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Vendor GST Mismatch Validation to get what the story asks for: the system to flag when invoice GST doesn't match the vendor master GST.
  3. Follow the business scenario the workbook gives: "Invoice GSTIN is checked against the vendor master record at capture time".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: we don't post invoices with incorrect tax registration. The business use case is served: invoice GSTIN is checked against the vendor master record at capture time.
- **Oracle.** Observable proof that Vendor GST Mismatch Validation did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-008.
- **Trace.** P0 · manual · `FEAT-INV-008` · workbook sheet "15. Invoice Module"

#### PRD-INV-049 — Vendor GST Mismatch Validation: multi-GSTIN vendors (branch-wise registration) need a mapping table

- **Why it matters.** The workbook records this edge case for Vendor GST Mismatch Validation: "Multi-GSTIN vendors (branch-wise registration) need a mapping table".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Multi-GSTIN vendors (branch-wise registration) need a mapping table".
  3. Use Vendor GST Mismatch Validation to get the system to flag when invoice GST doesn't match the vendor master GST.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor GST Mismatch Validation behaves as the workbook states: "Multi-GSTIN vendors (branch-wise registration) need a mapping table".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-008 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-008` · workbook sheet "15. Invoice Module"

#### PRD-INV-050 — Vendor GST Mismatch Validation: not available on plans below Growth

- **Why it matters.** The workbook limits Vendor GST Mismatch Validation to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Vendor GST Mismatch Validation to get the system to flag when invoice GST doesn't match the vendor master GST.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-008` · workbook sheet "15. Invoice Module"

#### PRD-INV-051 — Vendor GST Mismatch Validation: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Vendor GST Mismatch Validation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor GST Mismatch Validation to get the system to flag when invoice GST doesn't match the vendor master GST.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-008` · workbook sheet "15. Invoice Module"

#### PRD-INV-052 — GST Recon (2-Way, Third-Party Integration): happy path for the Finance Controller

- **Why it matters.** Protects ITC claims and simplifies GST compliance. Business use: Invoices are reconciled two-way against the government GST return feed pulled via an integrated third-party service.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Invoice Module.
  2. Use GST Recon (2-Way, Third-Party Integration) to get what the story asks for: invoice GST reconciled against GSTR-2B via a third-party GST tool.
  3. Follow the business scenario the workbook gives: "Invoices are reconciled two-way against the government GST return feed pulled via an integrated third-party service".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: input tax credit claims are accurate. The business use case is served: invoices are reconciled two-way against the government GST return feed pulled via an integrated third-party service.
- **Oracle.** Observable proof that GST Recon (2-Way, Third-Party Integration) did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-010.
- **Trace.** P0 · manual · `FEAT-INV-010` · workbook sheet "15. Invoice Module"

#### PRD-INV-053 — GST Recon (2-Way, Third-Party Integration): recon mismatches are routed to AP for vendor follow-up

- **Why it matters.** The workbook records this edge case for GST Recon (2-Way, Third-Party Integration): "Recon mismatches are routed to AP for vendor follow-up".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Recon mismatches are routed to AP for vendor follow-up".
  3. Use GST Recon (2-Way, Third-Party Integration) to get invoice GST reconciled against GSTR-2B via a third-party GST tool.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GST Recon (2-Way, Third-Party Integration) behaves as the workbook states: "Recon mismatches are routed to AP for vendor follow-up".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-010 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-010` · workbook sheet "15. Invoice Module"

#### PRD-INV-054 — GST Recon (2-Way, Third-Party Integration): not available on the Growth plan

- **Why it matters.** The workbook limits GST Recon (2-Way, Third-Party Integration) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use GST Recon (2-Way, Third-Party Integration) to get invoice GST reconciled against GSTR-2B via a third-party GST tool.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-010` · workbook sheet "15. Invoice Module"

#### PRD-INV-055 — GST Recon (2-Way, Third-Party Integration): refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of GST Recon (2-Way, Third-Party Integration). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GST Recon (2-Way, Third-Party Integration) to get invoice GST reconciled against GSTR-2B via a third-party GST tool.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-INV-010` · workbook sheet "15. Invoice Module"

#### PRD-INV-056 — LDC (Lower Deduction Certificate) Handling: happy path for the AP Executive

- **Why it matters.** Ensures correct TDS deduction per vendor's certificate status. Business use: LDC validity and rate are checked against the vendor master before TDS is computed on an invoice.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use LDC (Lower Deduction Certificate) Handling to get what the story asks for: vendor LDCs applied automatically during TDS computation.
  3. Follow the business scenario the workbook gives: "LDC validity and rate are checked against the vendor master before TDS is computed on an invoice".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: the correct lower/nil TDS rate is used. The business use case is served: LDC validity and rate are checked against the vendor master before TDS is computed on an invoice.
- **Oracle.** Observable proof that LDC (Lower Deduction Certificate) Handling did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-011.
- **Trace.** P0 · manual · `FEAT-INV-011` · workbook sheet "15. Invoice Module"

#### PRD-INV-057 — LDC (Lower Deduction Certificate) Handling: LDC expiry must trigger reversion to standard TDS rate automatically

- **Why it matters.** The workbook records this edge case for LDC (Lower Deduction Certificate) Handling: "LDC expiry must trigger reversion to standard TDS rate automatically".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "LDC expiry must trigger reversion to standard TDS rate automatically".
  3. Use LDC (Lower Deduction Certificate) Handling to get vendor LDCs applied automatically during TDS computation.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** LDC (Lower Deduction Certificate) Handling behaves as the workbook states: "LDC expiry must trigger reversion to standard TDS rate automatically".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-011 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-011` · workbook sheet "15. Invoice Module"

#### PRD-INV-058 — LDC (Lower Deduction Certificate) Handling: not available on the Growth plan

- **Why it matters.** The workbook limits LDC (Lower Deduction Certificate) Handling to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use LDC (Lower Deduction Certificate) Handling to get vendor LDCs applied automatically during TDS computation.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-011` · workbook sheet "15. Invoice Module"

#### PRD-INV-059 — LDC (Lower Deduction Certificate) Handling: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of LDC (Lower Deduction Certificate) Handling. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use LDC (Lower Deduction Certificate) Handling to get vendor LDCs applied automatically during TDS computation.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-011` · workbook sheet "15. Invoice Module"

#### PRD-INV-060 — TDS Computation & Section Mapping: happy path for the AP Executive

- **Why it matters.** Removes manual TDS section lookup and reduces compliance risk. Business use: TDS section (194C, 194J, etc.) is mapped per vendor/category and applied at invoice booking.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use TDS Computation & Section Mapping to get what the story asks for: TDS computed automatically against the correct section.
  3. Follow the business scenario the workbook gives: "TDS section (194C, 194J, etc.) is mapped per vendor/category and applied at invoice booking".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: deduction is compliant without manual lookup. The business use case is served: TDS section (194C, 194J, etc.) is mapped per vendor/category and applied at invoice booking.
- **Oracle.** Observable proof that TDS Computation & Section Mapping did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-012.
- **Trace.** P0 · manual · `FEAT-INV-012` · workbook sheet "15. Invoice Module"

#### PRD-INV-061 — TDS Computation & Section Mapping: section mapping can vary by transaction nature, not just vendor

- **Why it matters.** The workbook records this edge case for TDS Computation & Section Mapping: "Section mapping can vary by transaction nature, not just vendor".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Section mapping can vary by transaction nature, not just vendor".
  3. Use TDS Computation & Section Mapping to get TDS computed automatically against the correct section.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** TDS Computation & Section Mapping behaves as the workbook states: "Section mapping can vary by transaction nature, not just vendor".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-012 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-012` · workbook sheet "15. Invoice Module"

#### PRD-INV-062 — TDS Computation & Section Mapping: not available on the Growth plan

- **Why it matters.** The workbook limits TDS Computation & Section Mapping to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use TDS Computation & Section Mapping to get TDS computed automatically against the correct section.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-012` · workbook sheet "15. Invoice Module"

#### PRD-INV-063 — TDS Computation & Section Mapping: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of TDS Computation & Section Mapping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use TDS Computation & Section Mapping to get TDS computed automatically against the correct section.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-012` · workbook sheet "15. Invoice Module"

## 3. Optional features

#### PRD-INV-064 — 4-Way Match (PO – Invoice – GRN – Quality/Inspection): happy path for the AP Executive

- **Why it matters.** Prevents payment release ahead of quality clearance. Business use: Adds the QC/inspection result as a fourth check before invoice release, for categories requiring inspection.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use 4-Way Match (PO – Invoice – GRN – Quality/Inspection) to get what the story asks for: a 4-way match that also checks quality sign-off.
  3. Follow the business scenario the workbook gives: "Adds the QC/inspection result as a fourth check before invoice release, for categories requiring inspection".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: we never pay for goods that failed inspection. The business use case is served: adds the QC/inspection result as a fourth check before invoice release, for categories requiring inspection.
- **Oracle.** Observable proof that 4-Way Match (PO – Invoice – GRN – Quality/Inspection) did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-007.
- **Trace.** P0 · manual · `FEAT-INV-007` · workbook sheet "15. Invoice Module"

#### PRD-INV-065 — 4-Way Match (PO – Invoice – GRN – Quality/Inspection): requires the Quality Check module result to be available before match completes

- **Why it matters.** The workbook records this edge case for 4-Way Match (PO – Invoice – GRN – Quality/Inspection): "Requires the Quality Check module result to be available before match completes".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Requires the Quality Check module result to be available before match completes".
  3. Use 4-Way Match (PO – Invoice – GRN – Quality/Inspection) to get a 4-way match that also checks quality sign-off.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** 4-Way Match (PO – Invoice – GRN – Quality/Inspection) behaves as the workbook states: "Requires the Quality Check module result to be available before match completes".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-007 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-007` · workbook sheet "15. Invoice Module"

#### PRD-INV-066 — 4-Way Match (PO – Invoice – GRN – Quality/Inspection): not available on the Growth plan

- **Why it matters.** The workbook limits 4-Way Match (PO – Invoice – GRN – Quality/Inspection) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use 4-Way Match (PO – Invoice – GRN – Quality/Inspection) to get a 4-way match that also checks quality sign-off.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-007` · workbook sheet "15. Invoice Module"

#### PRD-INV-067 — 4-Way Match (PO – Invoice – GRN – Quality/Inspection): refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of 4-Way Match (PO – Invoice – GRN – Quality/Inspection). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use 4-Way Match (PO – Invoice – GRN – Quality/Inspection) to get a 4-way match that also checks quality sign-off.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-INV-007` · workbook sheet "15. Invoice Module"

#### PRD-INV-068 — Vendor Self-Service Invoice Submission Portal: happy path for the Vendor

- **Why it matters.** Improves invoice data quality at the source and reduces AP workload. Business use: Vendors upload or key in invoices via a portal, reducing OCR dependency and email-based intake errors.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Invoice Module.
  2. Submit invoices directly through a portal.
  3. Follow the business scenario the workbook gives: "Vendors upload or key in invoices via a portal, reducing OCR dependency and email-based intake errors".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: they don't rely solely on email. The business use case is served: vendors upload or key in invoices via a portal, reducing OCR dependency and email-based intake errors.
- **Oracle.** Observable proof that Vendor Self-Service Invoice Submission Portal did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-023.
- **Trace.** P0 · manual · `FEAT-INV-023` · workbook sheet "15. Invoice Module"

#### PRD-INV-069 — Vendor Self-Service Invoice Submission Portal: portal submissions still pass through the same validation and match engine

- **Why it matters.** The workbook records this edge case for Vendor Self-Service Invoice Submission Portal: "Portal submissions still pass through the same validation and match engine".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Portal submissions still pass through the same validation and match engine".
  3. Use Vendor Self-Service Invoice Submission Portal to submit invoices directly through a portal.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor Self-Service Invoice Submission Portal behaves as the workbook states: "Portal submissions still pass through the same validation and match engine".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-023 quoting the note.
- **Trace.** P2 · manual · `FEAT-INV-023` · workbook sheet "15. Invoice Module"

#### PRD-INV-070 — Vendor Self-Service Invoice Submission Portal: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor Self-Service Invoice Submission Portal to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Vendor Self-Service Invoice Submission Portal to submit invoices directly through a portal.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INV-023` · workbook sheet "15. Invoice Module"

#### PRD-INV-071 — Vendor Self-Service Invoice Submission Portal: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor Self-Service Invoice Submission Portal. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Self-Service Invoice Submission Portal to submit invoices directly through a portal.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-INV-023` · workbook sheet "15. Invoice Module"

## 4. Reporting features

#### PRD-INV-072 — Invoice Aging Report: happy path for the AP Manager

- **Why it matters.** Surfaces payment-cycle bottlenecks proactively. Business use: Dashboard/report buckets open invoices by age (0-30, 31-60, 60+ days) across vendors and entities.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup and open Invoice Module.
  2. Use Invoice Aging Report to get what the story asks for: an invoice aging report by bucket.
  3. Follow the business scenario the workbook gives: "Dashboard/report buckets open invoices by age (0-30, 31-60, 60+ days) across vendors and entities".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Manager achieves the story's outcome: prioritize invoices approaching or past due. The business use case is served: dashboard/report buckets open invoices by age (0-30, 31-60, 60+ days) across vendors and entities.
- **Oracle.** Observable proof that Invoice Aging Report did its job for the AP Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-019.
- **Trace.** P0 · manual · `FEAT-INV-019` · workbook sheet "15. Invoice Module"

#### PRD-INV-073 — Invoice Aging Report: tenant configuration — Aging buckets are configurable per tenant

- **Why it matters.** The workbook says "Aging buckets are configurable per tenant". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and AP Manager (to use the feature).
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Aging buckets are configurable per tenant") and record its current value.
  2. As the AP Manager: use Invoice Aging Report to get an invoice aging report by bucket.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Invoice Aging Report follows the tenant's configured value, as the workbook states: "Aging buckets are configurable per tenant". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-INV-019` · workbook sheet "15. Invoice Module"

#### PRD-INV-074 — Invoice Aging Report: not available on plans below Growth

- **Why it matters.** The workbook limits Invoice Aging Report to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the lower-plan tenant.
  2. Try it: use Invoice Aging Report to get an invoice aging report by bucket.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INV-019` · workbook sheet "15. Invoice Module"

#### PRD-INV-075 — Invoice Aging Report: refused for a user without the AP Manager role

- **Why it matters.** The workbook names AP Manager as the user of Invoice Aging Report. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice Aging Report to get an invoice aging report by bucket.
  3. Repeat as an AP Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Manager.
- **Trace.** P1 · automate-later · `FEAT-INV-019` · workbook sheet "15. Invoice Module"

## 5. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-INV-076 — [Roadmap] Duplicate Invoice Detection: happy path for the AP Executive

- **Why it matters.** Prevents duplicate-payment leakage, a common AP risk. Business use: Invoice number, vendor, amount, and date combinations are checked against invoice history at intake.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use Duplicate Invoice Detection to get what the story asks for: the system to flag potential duplicate invoices.
  3. Follow the business scenario the workbook gives: "Invoice number, vendor, amount, and date combinations are checked against invoice history at intake".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: we never pay the same invoice twice. The business use case is served: invoice number, vendor, amount, and date combinations are checked against invoice history at intake.
- **Oracle.** Observable proof that Duplicate Invoice Detection did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-020.
- **Trace.** P3 · manual · `FEAT-INV-020` · workbook sheet "15. Invoice Module"

#### PRD-INV-077 — [Roadmap] Duplicate Invoice Detection: should catch near-duplicates (same invoice, re-numbered) not just exact matches

- **Why it matters.** The workbook records this edge case for Duplicate Invoice Detection: "Should catch near-duplicates (same invoice, re-numbered) not just exact matches". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should catch near-duplicates (same invoice, re-numbered) not just exact matches".
  3. Use Duplicate Invoice Detection to get the system to flag potential duplicate invoices.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Duplicate Invoice Detection behaves as the workbook states: "Should catch near-duplicates (same invoice, re-numbered) not just exact matches".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-020 quoting the note.
- **Trace.** P3 · manual · `FEAT-INV-020` · workbook sheet "15. Invoice Module"

#### PRD-INV-078 — [Roadmap] Duplicate Invoice Detection: not available on the Growth plan

- **Why it matters.** The workbook limits Duplicate Invoice Detection to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Duplicate Invoice Detection to get the system to flag potential duplicate invoices.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-INV-020` · workbook sheet "15. Invoice Module"

#### PRD-INV-079 — [Roadmap] Duplicate Invoice Detection: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Duplicate Invoice Detection. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Duplicate Invoice Detection to get the system to flag potential duplicate invoices.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P3 · manual · `FEAT-INV-020` · workbook sheet "15. Invoice Module"

#### PRD-INV-080 — [Roadmap] AI Classification for Non-PO Invoices: happy path for the AP Executive

- **Why it matters.** Avoids burdening AP with manual classification while keeping a human check. Business use: For invoices with no linked PO, an AI classifier infers invoice type; AP confirms before the invoice proceeds.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Use AI Classification for Non-PO Invoices to get what the story asks for: non-PO invoices auto-classified by type.
  3. Follow the business scenario the workbook gives: "For invoices with no linked PO, an AI classifier infers invoice type; AP confirms before the invoice proceeds".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: routing doesn't rely on manual tagging. The business use case is served: for invoices with no linked PO, an AI classifier infers invoice type; AP confirms before the invoice proceeds.
- **Oracle.** Observable proof that AI Classification for Non-PO Invoices did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-021.
- **Trace.** P3 · manual · `FEAT-INV-021` · workbook sheet "15. Invoice Module"

#### PRD-INV-081 — [Roadmap] AI Classification for Non-PO Invoices: AP confirmation step stays mandatory even when classifier confidence is high

- **Why it matters.** The workbook records this edge case for AI Classification for Non-PO Invoices: "AP confirmation step stays mandatory even when classifier confidence is high".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "AP confirmation step stays mandatory even when classifier confidence is high".
  3. Use AI Classification for Non-PO Invoices to get non-PO invoices auto-classified by type.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** AI Classification for Non-PO Invoices behaves as the workbook states: "AP confirmation step stays mandatory even when classifier confidence is high".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-021 quoting the note.
- **Trace.** P3 · manual · `FEAT-INV-021` · workbook sheet "15. Invoice Module"

#### PRD-INV-082 — [Roadmap] AI Classification for Non-PO Invoices: not available on the Growth plan

- **Why it matters.** The workbook limits AI Classification for Non-PO Invoices to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use AI Classification for Non-PO Invoices to get non-PO invoices auto-classified by type.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-INV-021` · workbook sheet "15. Invoice Module"

#### PRD-INV-083 — [Roadmap] AI Classification for Non-PO Invoices: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of AI Classification for Non-PO Invoices. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use AI Classification for Non-PO Invoices to get non-PO invoices auto-classified by type.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P3 · manual · `FEAT-INV-021` · workbook sheet "15. Invoice Module"

#### PRD-INV-084 — [Roadmap] Invoice Splitting Across Multiple POs: happy path for the AP Executive

- **Why it matters.** Handles real-world consolidated vendor billing. Business use: A single vendor invoice covering multiple POs is apportioned and matched against each PO separately.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Invoice Module.
  2. Split one invoice across multiple POs.
  3. Follow the business scenario the workbook gives: "A single vendor invoice covering multiple POs is apportioned and matched against each PO separately".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: consolidated vendor billing doesn't block matching. The business use case is served: a single vendor invoice covering multiple POs is apportioned and matched against each PO separately.
- **Oracle.** Observable proof that Invoice Splitting Across Multiple POs did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-022.
- **Trace.** P3 · manual · `FEAT-INV-022` · workbook sheet "15. Invoice Module"

#### PRD-INV-085 — [Roadmap] Invoice Splitting Across Multiple POs: apportionment logic (pro-rata, manual) needs to be defined

- **Why it matters.** The workbook records this edge case for Invoice Splitting Across Multiple POs: "Apportionment logic (pro-rata, manual) needs to be defined".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Apportionment logic (pro-rata, manual) needs to be defined".
  3. Use Invoice Splitting Across Multiple POs to split one invoice across multiple POs.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Invoice Splitting Across Multiple POs behaves as the workbook states: "Apportionment logic (pro-rata, manual) needs to be defined".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-022 quoting the note.
- **Trace.** P3 · manual · `FEAT-INV-022` · workbook sheet "15. Invoice Module"

#### PRD-INV-086 — [Roadmap] Invoice Splitting Across Multiple POs: not available on the Growth plan

- **Why it matters.** The workbook limits Invoice Splitting Across Multiple POs to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Invoice Splitting Across Multiple POs to split one invoice across multiple POs.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-INV-022` · workbook sheet "15. Invoice Module"

#### PRD-INV-087 — [Roadmap] Invoice Splitting Across Multiple POs: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Invoice Splitting Across Multiple POs. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice Splitting Across Multiple POs to split one invoice across multiple POs.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P3 · manual · `FEAT-INV-022` · workbook sheet "15. Invoice Module"

#### PRD-INV-088 — [Roadmap] Invoice Payment Milestone Tracking: happy path for the Finance Controller

- **Why it matters.** Controls payment pacing for milestone-based service contracts. Business use: Service invoices linked to project milestones release payment only as milestones are marked complete.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Invoice Module.
  2. Track invoice payment against defined milestones.
  3. Follow the business scenario the workbook gives: "Service invoices linked to project milestones release payment only as milestones are marked complete".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: milestone-based service payments are controlled. The business use case is served: service invoices linked to project milestones release payment only as milestones are marked complete.
- **Oracle.** Observable proof that Invoice Payment Milestone Tracking did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INV-024.
- **Trace.** P3 · manual · `FEAT-INV-024` · workbook sheet "15. Invoice Module"

#### PRD-INV-089 — [Roadmap] Invoice Payment Milestone Tracking: milestone completion should require the same sign-off as GRN would for goods

- **Why it matters.** The workbook records this edge case for Invoice Payment Milestone Tracking: "Milestone completion should require the same sign-off as GRN would for goods".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Milestone completion should require the same sign-off as GRN would for goods".
  3. Use Invoice Payment Milestone Tracking to track invoice payment against defined milestones.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Invoice Payment Milestone Tracking behaves as the workbook states: "Milestone completion should require the same sign-off as GRN would for goods".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-INV-024 quoting the note.
- **Trace.** P3 · manual · `FEAT-INV-024` · workbook sheet "15. Invoice Module"

#### PRD-INV-090 — [Roadmap] Invoice Payment Milestone Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Invoice Payment Milestone Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Invoice Payment Milestone Tracking to track invoice payment against defined milestones.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-INV-024` · workbook sheet "15. Invoice Module"

#### PRD-INV-091 — [Roadmap] Invoice Payment Milestone Tracking: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Invoice Payment Milestone Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice Payment Milestone Tracking to track invoice payment against defined milestones.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-INV-024` · workbook sheet "15. Invoice Module"
