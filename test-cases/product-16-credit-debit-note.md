# Product test cases — 16. Credit-Debit Note (MOD-21)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-21 · 12 features · 48 cases · group `PRD-CDN` · plan availability: All Plans · status: GA

Credit and debit notes for post-invoice adjustments and mismatches.

## 1. Core features

#### PRD-CDN-001 — Credit/Debit Note Auto-Suggestion on Invoice Mismatch: happy path for the AP Executive

- **Why it matters.** Keeps every unmatched item resolved through an auditable financial document rather than an ad-hoc adjustment. Business use: When invoice-to-PO matching finds no corresponding line, the system prompts a credit or debit note instead of leaving it as an open exception.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note Auto-Suggestion on Invoice Mismatch to get what the story asks for: the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  3. Follow the business scenario the workbook gives: "When invoice-to-PO matching finds no corresponding line, the system prompts a credit or debit note instead of leaving it as an open exception".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: mismatches are resolved through a formal document. The business use case is served: when invoice-to-PO matching finds no corresponding line, the system prompts a credit or debit note instead of leaving it as an open exception.
- **Oracle.** Observable proof that Credit/Debit Note Auto-Suggestion on Invoice Mismatch did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-001.
- **Trace.** P0 · manual · `FEAT-CDN-001` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-002 — Credit/Debit Note Auto-Suggestion on Invoice Mismatch: direction (credit vs. debit) is inferred from whether the discrepancy favors…

- **Why it matters.** The workbook records this edge case for Credit/Debit Note Auto-Suggestion on Invoice Mismatch: "Direction (credit vs. debit) is inferred from whether the discrepancy favors buyer or vendor".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Direction (credit vs. debit) is inferred from whether the discrepancy favors buyer or vendor".
  3. Use Credit/Debit Note Auto-Suggestion on Invoice Mismatch to get the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Credit/Debit Note Auto-Suggestion on Invoice Mismatch behaves as the workbook states: "Direction (credit vs. debit) is inferred from whether the discrepancy favors buyer or vendor".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-CDN-001` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-003 — Credit/Debit Note Auto-Suggestion on Invoice Mismatch: not available on plans below Growth

- **Why it matters.** The workbook limits Credit/Debit Note Auto-Suggestion on Invoice Mismatch to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Auto-Suggestion on Invoice Mismatch to get the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-CDN-001` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-004 — Credit/Debit Note Auto-Suggestion on Invoice Mismatch: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Credit/Debit Note Auto-Suggestion on Invoice Mismatch. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Auto-Suggestion on Invoice Mismatch to get the system to suggest a credit or debit note when an invoiced item isn't found on the PO.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-CDN-001` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-005 — Return Note (RTV Note): happy path for the Warehouse Executive

- **Why it matters.** Provides the physical-movement counterpart to the financial credit/debit note. Business use: Return-to-vendor movements are recorded with quantity, reason, and reference to the originating GRN/QC rejection.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open Credit / Debit Note.
  2. Use Return Note (RTV Note) to get what the story asks for: a return note raised when goods are sent back to the vendor.
  3. Follow the business scenario the workbook gives: "Return-to-vendor movements are recorded with quantity, reason, and reference to the originating GRN/QC rejection".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: the physical return is documented against the original GRN. The business use case is served: return-to-vendor movements are recorded with quantity, reason, and reference to the originating GRN/QC rejection.
- **Oracle.** Observable proof that Return Note (RTV Note) did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-002.
- **Trace.** P0 · manual · `FEAT-CDN-002` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-006 — Return Note (RTV Note): should link to the QC rejection or GRN shortage that triggered it

- **Why it matters.** The workbook records this edge case for Return Note (RTV Note): "Should link to the QC rejection or GRN shortage that triggered it". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should link to the QC rejection or GRN shortage that triggered it".
  3. Use Return Note (RTV Note) to get a return note raised when goods are sent back to the vendor.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Return Note (RTV Note) behaves as the workbook states: "Should link to the QC rejection or GRN shortage that triggered it".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-CDN-002` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-007 — Return Note (RTV Note): not available on the Growth plan

- **Why it matters.** The workbook limits Return Note (RTV Note) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Return Note (RTV Note) to get a return note raised when goods are sent back to the vendor.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CDN-002` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-008 — Return Note (RTV Note): refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Return Note (RTV Note). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Return Note (RTV Note) to get a return note raised when goods are sent back to the vendor.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-CDN-002` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-009 — Credit/Debit Note Approval Workflow: happy path for the Finance Controller

- **Why it matters.** Prevents unauthorized or erroneous financial adjustments. Business use: Notes crossing a configured value threshold route for approval before posting.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note Approval Workflow to get what the story asks for: credit/debit notes above a threshold to require approval.
  3. Follow the business scenario the workbook gives: "Notes crossing a configured value threshold route for approval before posting".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: financial adjustments have a control check. The business use case is served: notes crossing a configured value threshold route for approval before posting.
- **Oracle.** Observable proof that Credit/Debit Note Approval Workflow did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-003.
- **Trace.** P0 · manual · `FEAT-CDN-003` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-010 — Credit/Debit Note Approval Workflow: tenant configuration — Threshold and approver chain configurable per entity

- **Why it matters.** The workbook says "Threshold and approver chain configurable per entity". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Threshold and approver chain configurable per entity") and record its current value.
  2. As the Finance Controller: use Credit/Debit Note Approval Workflow to get credit/debit notes above a threshold to require approval.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Credit/Debit Note Approval Workflow follows the tenant's configured value, as the workbook states: "Threshold and approver chain configurable per entity". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-CDN-003` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-011 — Credit/Debit Note Approval Workflow: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note Approval Workflow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Approval Workflow to get credit/debit notes above a threshold to require approval.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CDN-003` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-012 — Credit/Debit Note Approval Workflow: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Credit/Debit Note Approval Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Approval Workflow to get credit/debit notes above a threshold to require approval.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-CDN-003` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-013 — Credit/Debit Note Vendor Acknowledgment: happy path for the Vendor

- **Why it matters.** Preserves vendor dispute rights before a deduction is locked in. Business use: Vendor receives the note via portal and can accept or raise a dispute within a defined window.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Credit / Debit Note.
  2. Acknowledge or dispute a debit note raised against them.
  3. Follow the business scenario the workbook gives: "Vendor receives the note via portal and can accept or raise a dispute within a defined window".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: they have a formal chance to respond before deduction is finalized. The business use case is served: vendor receives the note via portal and can accept or raise a dispute within a defined window.
- **Oracle.** Observable proof that Credit/Debit Note Vendor Acknowledgment did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-004.
- **Trace.** P0 · manual · `FEAT-CDN-004` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-014 — Credit/Debit Note Vendor Acknowledgment: deduction should not be finalized until the dispute window closes or the…

- **Why it matters.** The workbook records this edge case for Credit/Debit Note Vendor Acknowledgment: "Deduction should not be finalized until the dispute window closes or the vendor responds".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Deduction should not be finalized until the dispute window closes or the vendor responds".
  3. Use Credit/Debit Note Vendor Acknowledgment to acknowledge or dispute a debit note raised against them.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Credit/Debit Note Vendor Acknowledgment behaves as the workbook states: "Deduction should not be finalized until the dispute window closes or the vendor responds".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-CDN-004` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-015 — Credit/Debit Note Vendor Acknowledgment: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note Vendor Acknowledgment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Vendor Acknowledgment to acknowledge or dispute a debit note raised against them.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CDN-004` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-016 — Credit/Debit Note Vendor Acknowledgment: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Credit/Debit Note Vendor Acknowledgment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Vendor Acknowledgment to acknowledge or dispute a debit note raised against them.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-CDN-004` · workbook sheet "16. Credit-Debit Note"

## 2. Integration features

#### PRD-CDN-017 — Credit/Debit Note GL/Accounting Posting Integration: happy path for the Finance Controller

- **Why it matters.** Removes manual journal entry and the errors that come with it. Business use: Approved credit/debit notes push to SAP/Oracle FI as accounting documents.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note GL/Accounting Posting Integration to get what the story asks for: approved notes to post automatically to the GL via ERP integration.
  3. Follow the business scenario the workbook gives: "Approved credit/debit notes push to SAP/Oracle FI as accounting documents".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: the books reflect adjustments without manual journal entries. The business use case is served: approved credit/debit notes push to SAP/Oracle FI as accounting documents.
- **Oracle.** Observable proof that Credit/Debit Note GL/Accounting Posting Integration did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-005.
- **Trace.** P0 · manual · `FEAT-CDN-005` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-018 — Credit/Debit Note GL/Accounting Posting Integration: posting failures need a retry/alert mechanism, not silent drop

- **Why it matters.** The workbook records this edge case for Credit/Debit Note GL/Accounting Posting Integration: "Posting failures need a retry/alert mechanism, not silent drop".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Posting failures need a retry/alert mechanism, not silent drop".
  3. Use Credit/Debit Note GL/Accounting Posting Integration to get approved notes to post automatically to the GL via ERP integration.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Credit/Debit Note GL/Accounting Posting Integration behaves as the workbook states: "Posting failures need a retry/alert mechanism, not silent drop".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-005 quoting the note.
- **Trace.** P2 · manual · `FEAT-CDN-005` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-019 — Credit/Debit Note GL/Accounting Posting Integration: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note GL/Accounting Posting Integration to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Credit/Debit Note GL/Accounting Posting Integration to get approved notes to post automatically to the GL via ERP integration.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CDN-005` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-020 — Credit/Debit Note GL/Accounting Posting Integration: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Credit/Debit Note GL/Accounting Posting Integration. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note GL/Accounting Posting Integration to get approved notes to post automatically to the GL via ERP integration.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-CDN-005` · workbook sheet "16. Credit-Debit Note"

## 3. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-CDN-021 — [Roadmap] Credit/Debit Note Aging & Ledger Reconciliation: happy path for the Finance Controller

- **Why it matters.** Ensures adjustments actually get realized, not just recorded. Business use: Report shows outstanding notes and their offset status against future invoices or payments.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Credit / Debit Note.
  2. See open credit/debit notes by age against the vendor ledger.
  3. Follow the business scenario the workbook gives: "Report shows outstanding notes and their offset status against future invoices or payments".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: unresolved adjustments don't linger. The business use case is served: report shows outstanding notes and their offset status against future invoices or payments.
- **Oracle.** Observable proof that Credit/Debit Note Aging & Ledger Reconciliation did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-006.
- **Trace.** P3 · manual · `FEAT-CDN-006` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-022 — [Roadmap] Credit/Debit Note Aging & Ledger Reconciliation: tenant configuration — Should flag notes open beyond a configurable SLA

- **Why it matters.** The workbook says "Should flag notes open beyond a configurable SLA". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Should flag notes open beyond a configurable SLA") and record its current value.
  2. As the Finance Controller: use Credit/Debit Note Aging & Ledger Reconciliation to see open credit/debit notes by age against the vendor ledger.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Credit/Debit Note Aging & Ledger Reconciliation follows the tenant's configured value, as the workbook states: "Should flag notes open beyond a configurable SLA". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-CDN-006` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-023 — [Roadmap] Credit/Debit Note Aging & Ledger Reconciliation: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note Aging & Ledger Reconciliation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Aging & Ledger Reconciliation to see open credit/debit notes by age against the vendor ledger.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CDN-006` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-024 — [Roadmap] Credit/Debit Note Aging & Ledger Reconciliation: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Credit/Debit Note Aging & Ledger Reconciliation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Aging & Ledger Reconciliation to see open credit/debit notes by age against the vendor ledger.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-CDN-006` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-025 — [Roadmap] Quality-Rejection-Triggered Debit Note: happy path for the Quality Inspector

- **Why it matters.** Speeds up financial recovery for quality failures without a manual handoff. Business use: A failed QC inspection creates a draft debit note pending finance/vendor confirmation of the deduction amount.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup and open Credit / Debit Note.
  2. Use Quality-Rejection-Triggered Debit Note to get what the story asks for: a QC rejection to auto-generate a draft debit note.
  3. Follow the business scenario the workbook gives: "A failed QC inspection creates a draft debit note pending finance/vendor confirmation of the deduction amount".
  4. Check the result against the story's promised outcome.
- **Expected.** The Quality Inspector achieves the story's outcome: recovery for rejected goods starts immediately. The business use case is served: a failed QC inspection creates a draft debit note pending finance/vendor confirmation of the deduction amount.
- **Oracle.** Observable proof that Quality-Rejection-Triggered Debit Note did its job for the Quality Inspector — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-007.
- **Trace.** P3 · manual · `FEAT-CDN-007` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-026 — [Roadmap] Quality-Rejection-Triggered Debit Note: should stay in draft until confirmation authority signs off on the amount — an…

- **Why it matters.** The workbook records this edge case for Quality-Rejection-Triggered Debit Note: "Should stay in draft until confirmation authority signs off on the amount — an open question flagged for confirmation-authority design". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the tenant described in Setup.
  2. Set up the situation the note describes: "Should stay in draft until confirmation authority signs off on the amount — an open question flagged for confirmation-authority design".
  3. Use Quality-Rejection-Triggered Debit Note to get a QC rejection to auto-generate a draft debit note.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Quality-Rejection-Triggered Debit Note behaves as the workbook states: "Should stay in draft until confirmation authority signs off on the amount — an open question flagged for confirmation-authority design".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-007 quoting the note.
- **Trace.** P3 · manual · `FEAT-CDN-007` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-027 — [Roadmap] Quality-Rejection-Triggered Debit Note: not available on the Growth plan

- **Why it matters.** The workbook limits Quality-Rejection-Triggered Debit Note to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Quality Inspector.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Quality Inspector on the lower-plan tenant.
  2. Try it: use Quality-Rejection-Triggered Debit Note to get a QC rejection to auto-generate a draft debit note.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CDN-007` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-028 — [Roadmap] Quality-Rejection-Triggered Debit Note: refused for a user without the Quality Inspector role

- **Why it matters.** The workbook names Quality Inspector as the user of Quality-Rejection-Triggered Debit Note. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Quality Inspector.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Quality-Rejection-Triggered Debit Note to get a QC rejection to auto-generate a draft debit note.
  3. Repeat as a Quality Inspector.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Quality Inspector can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Quality Inspector.
- **Trace.** P3 · manual · `FEAT-CDN-007` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-029 — [Roadmap] Debit Note Recovery Tracking: happy path for the Finance Controller

- **Why it matters.** Closes the loop between raising a debit note and actually recovering the value. Business use: Each debit note's realization method and status is tracked until fully offset or recovered.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Credit / Debit Note.
  2. Track how a debit note is actually recovered (offset against future invoice vs. direct deduction).
  3. Follow the business scenario the workbook gives: "Each debit note's realization method and status is tracked until fully offset or recovered".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: recovery is auditable end-to-end. The business use case is served: each debit note's realization method and status is tracked until fully offset or recovered.
- **Oracle.** Observable proof that Debit Note Recovery Tracking did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-008.
- **Trace.** P3 · manual · `FEAT-CDN-008` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-030 — [Roadmap] Debit Note Recovery Tracking: should support partial recovery across multiple future invoices

- **Why it matters.** The workbook records this edge case for Debit Note Recovery Tracking: "Should support partial recovery across multiple future invoices". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support partial recovery across multiple future invoices".
  3. Use Debit Note Recovery Tracking to track how a debit note is actually recovered (offset against future invoice vs. direct deduction).
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Debit Note Recovery Tracking behaves as the workbook states: "Should support partial recovery across multiple future invoices".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-008 quoting the note.
- **Trace.** P3 · manual · `FEAT-CDN-008` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-031 — [Roadmap] Debit Note Recovery Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Debit Note Recovery Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Debit Note Recovery Tracking to track how a debit note is actually recovered (offset against future invoice vs. direct deduction).
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CDN-008` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-032 — [Roadmap] Debit Note Recovery Tracking: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Debit Note Recovery Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Debit Note Recovery Tracking to track how a debit note is actually recovered (offset against future invoice vs. direct deduction).
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-CDN-008` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-033 — [Roadmap] Credit/Debit Note Template Customization: happy path for the AP Executive

- **Why it matters.** Consistency with the rest of the document-template framework. Business use: Note layout, numbering, and required fields are configured like PO/invoice templates.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note Template Customization to get what the story asks for: credit/debit note templates configurable per entity.
  3. Follow the business scenario the workbook gives: "Note layout, numbering, and required fields are configured like PO/invoice templates".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: issued notes match the organisation's required format. The business use case is served: note layout, numbering, and required fields are configured like PO/invoice templates.
- **Oracle.** Observable proof that Credit/Debit Note Template Customization did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-009.
- **Trace.** P3 · manual · `FEAT-CDN-009` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-034 — [Roadmap] Credit/Debit Note Template Customization: should reuse the same templating engine as PO/invoice templates

- **Why it matters.** The workbook records this edge case for Credit/Debit Note Template Customization: "Should reuse the same templating engine as PO/invoice templates". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should reuse the same templating engine as PO/invoice templates".
  3. Use Credit/Debit Note Template Customization to get credit/debit note templates configurable per entity.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Credit/Debit Note Template Customization behaves as the workbook states: "Should reuse the same templating engine as PO/invoice templates".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-009 quoting the note.
- **Trace.** P3 · manual · `FEAT-CDN-009` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-035 — [Roadmap] Credit/Debit Note Template Customization: not available on plans below Growth

- **Why it matters.** The workbook limits Credit/Debit Note Template Customization to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Template Customization to get credit/debit note templates configurable per entity.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P3 · manual · `FEAT-CDN-009` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-036 — [Roadmap] Credit/Debit Note Template Customization: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Credit/Debit Note Template Customization. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Template Customization to get credit/debit note templates configurable per entity.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P3 · manual · `FEAT-CDN-009` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-037 — [Roadmap] Credit/Debit Note Numbering Series per Entity: happy path for the Finance Controller

- **Why it matters.** Meets statutory sequential-numbering compliance requirements. Business use: Numbering series is configured per entity/GSTIN and auto-increments without gaps.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note Numbering Series per Entity to get what the story asks for: a distinct, sequential numbering series per legal entity.
  3. Follow the business scenario the workbook gives: "Numbering series is configured per entity/GSTIN and auto-increments without gaps".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: notes comply with statutory numbering requirements. The business use case is served: numbering series is configured per entity/GSTIN and auto-increments without gaps.
- **Oracle.** Observable proof that Credit/Debit Note Numbering Series per Entity did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-010.
- **Trace.** P3 · manual · `FEAT-CDN-010` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-038 — [Roadmap] Credit/Debit Note Numbering Series per Entity: tenant configuration — Series reset rules (annual, fiscal-year) need to be configurable

- **Why it matters.** The workbook says "Series reset rules (annual, fiscal-year) need to be configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Series reset rules (annual, fiscal-year) need to be configurable") and record its current value.
  2. As the Finance Controller: use Credit/Debit Note Numbering Series per Entity to get a distinct, sequential numbering series per legal entity.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Credit/Debit Note Numbering Series per Entity follows the tenant's configured value, as the workbook states: "Series reset rules (annual, fiscal-year) need to be configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-CDN-010` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-039 — [Roadmap] Credit/Debit Note Numbering Series per Entity: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note Numbering Series per Entity to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Numbering Series per Entity to get a distinct, sequential numbering series per legal entity.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CDN-010` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-040 — [Roadmap] Credit/Debit Note Numbering Series per Entity: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Credit/Debit Note Numbering Series per Entity. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Numbering Series per Entity to get a distinct, sequential numbering series per legal entity.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-CDN-010` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-041 — [Roadmap] Credit/Debit Note Dispute Flag & Resolution Log: happy path for the AP Executive

- **Why it matters.** Keeps dispute resolution auditable instead of happening off-system. Business use: Disputes raised by a vendor are logged against the note with a resolution trail (accepted, revised, withdrawn).
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note Dispute Flag & Resolution Log to get what the story asks for: a disputed note flagged and its resolution logged.
  3. Follow the business scenario the workbook gives: "Disputes raised by a vendor are logged against the note with a resolution trail (accepted, revised, withdrawn)".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: disagreements with vendors don't get lost in email. The business use case is served: disputes raised by a vendor are logged against the note with a resolution trail (accepted, revised, withdrawn).
- **Oracle.** Observable proof that Credit/Debit Note Dispute Flag & Resolution Log did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-011.
- **Trace.** P3 · manual · `FEAT-CDN-011` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-042 — [Roadmap] Credit/Debit Note Dispute Flag & Resolution Log: should support partial resolution (amount revised, not just accept/reject)

- **Why it matters.** The workbook records this edge case for Credit/Debit Note Dispute Flag & Resolution Log: "Should support partial resolution (amount revised, not just accept/reject)". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support partial resolution (amount revised, not just accept/reject)".
  3. Use Credit/Debit Note Dispute Flag & Resolution Log to get a disputed note flagged and its resolution logged.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Credit/Debit Note Dispute Flag & Resolution Log behaves as the workbook states: "Should support partial resolution (amount revised, not just accept/reject)".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-011 quoting the note.
- **Trace.** P3 · manual · `FEAT-CDN-011` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-043 — [Roadmap] Credit/Debit Note Dispute Flag & Resolution Log: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note Dispute Flag & Resolution Log to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Dispute Flag & Resolution Log to get a disputed note flagged and its resolution logged.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CDN-011` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-044 — [Roadmap] Credit/Debit Note Dispute Flag & Resolution Log: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Credit/Debit Note Dispute Flag & Resolution Log. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Dispute Flag & Resolution Log to get a disputed note flagged and its resolution logged.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P3 · manual · `FEAT-CDN-011` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-045 — [Roadmap] Credit/Debit Note Reporting Dashboard: happy path for the Finance Manager

- **Why it matters.** Surfaces systemic vendor or process issues, not just individual transactions. Business use: Aggregated view of notes issued, broken down by reason code, vendor, and status.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Manager on the tenant described in Setup and open Credit / Debit Note.
  2. Use Credit/Debit Note Reporting Dashboard to get what the story asks for: a dashboard of all credit/debit notes by vendor, category, and reason.
  3. Follow the business scenario the workbook gives: "Aggregated view of notes issued, broken down by reason code, vendor, and status".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Manager achieves the story's outcome: recurring issues (e.g., a vendor with frequent debit notes) are visible. The business use case is served: aggregated view of notes issued, broken down by reason code, vendor, and status.
- **Oracle.** Observable proof that Credit/Debit Note Reporting Dashboard did its job for the Finance Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CDN-012.
- **Trace.** P3 · manual · `FEAT-CDN-012` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-046 — [Roadmap] Credit/Debit Note Reporting Dashboard: reason-code taxonomy should be consistent with QC and GRN reason codes

- **Why it matters.** The workbook records this edge case for Credit/Debit Note Reporting Dashboard: "Reason-code taxonomy should be consistent with QC and GRN reason codes".
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Reason-code taxonomy should be consistent with QC and GRN reason codes".
  3. Use Credit/Debit Note Reporting Dashboard to get a dashboard of all credit/debit notes by vendor, category, and reason.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Credit/Debit Note Reporting Dashboard behaves as the workbook states: "Reason-code taxonomy should be consistent with QC and GRN reason codes".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CDN-012 quoting the note.
- **Trace.** P3 · manual · `FEAT-CDN-012` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-047 — [Roadmap] Credit/Debit Note Reporting Dashboard: not available on the Growth plan

- **Why it matters.** The workbook limits Credit/Debit Note Reporting Dashboard to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Manager on the lower-plan tenant.
  2. Try it: use Credit/Debit Note Reporting Dashboard to get a dashboard of all credit/debit notes by vendor, category, and reason.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CDN-012` · workbook sheet "16. Credit-Debit Note"

#### PRD-CDN-048 — [Roadmap] Credit/Debit Note Reporting Dashboard: refused for a user without the Finance Manager role

- **Why it matters.** The workbook names Finance Manager as the user of Credit/Debit Note Reporting Dashboard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Credit/Debit Note Reporting Dashboard to get a dashboard of all credit/debit notes by vendor, category, and reason.
  3. Repeat as a Finance Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Manager.
- **Trace.** P3 · manual · `FEAT-CDN-012` · workbook sheet "16. Credit-Debit Note"
