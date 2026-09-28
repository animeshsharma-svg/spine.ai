# Product test cases — 13. GRN (MOD-19)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-19 · 16 features · 59 cases · group `PRD-GRN` · plan availability: All Plans · status: GA

Goods Receipt Notes against POs — physical receipt, acceptance and returns.

## 1. Core features

#### PRD-GRN-001 — GRN Creation against PO / ASN: happy path for the Warehouse Executive

- **Why it matters.** Anchors physical receipt to the procurement record for downstream matching. Business use: Goods Receipt Note is raised at the point of physical receipt, referencing the PO (and ASN where available).
- **Setup.**
  Persona: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Create a GRN against an open PO or linked ASN.
  3. Follow the business scenario the workbook gives: "Goods Receipt Note is raised at the point of physical receipt, referencing the PO (and ASN where available)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: receipt is tied to what was actually ordered. The business use case is served: goods Receipt Note is raised at the point of physical receipt, referencing the PO (and ASN where available).
- **Oracle.** Observable proof that GRN Creation against PO / ASN did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-001.
- **Trace.** P0 · manual · `FEAT-GRN-001` · workbook sheet "13. GRN"

#### PRD-GRN-002 — GRN Creation against PO / ASN: GRN without a PO reference (non-PO receipt) needs a separate controlled path

- **Why it matters.** The workbook records this edge case for GRN Creation against PO / ASN: "GRN without a PO reference (non-PO receipt) needs a separate controlled path".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "GRN without a PO reference (non-PO receipt) needs a separate controlled path".
  3. Use GRN Creation against PO / ASN to create a GRN against an open PO or linked ASN.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GRN Creation against PO / ASN behaves as the workbook states: "GRN without a PO reference (non-PO receipt) needs a separate controlled path".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-GRN-001` · workbook sheet "13. GRN"

#### PRD-GRN-003 — GRN Creation against PO / ASN: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of GRN Creation against PO / ASN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN Creation against PO / ASN to create a GRN against an open PO or linked ASN.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-GRN-001` · workbook sheet "13. GRN"

#### PRD-GRN-004 — Partial / Multiple GRNs against a Single PO: happy path for the Warehouse Executive

- **Why it matters.** Reflects real receiving patterns instead of forcing one lump-sum GRN. Business use: Each delivery tranche against a PO is recorded as its own GRN, rolling up to overall PO consumption.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Raise multiple partial GRNs against one PO.
  3. Follow the business scenario the workbook gives: "Each delivery tranche against a PO is recorded as its own GRN, rolling up to overall PO consumption".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: staggered deliveries are each recorded as they arrive. The business use case is served: each delivery tranche against a PO is recorded as its own GRN, rolling up to overall PO consumption.
- **Oracle.** Observable proof that Partial / Multiple GRNs against a Single PO did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-002.
- **Trace.** P0 · manual · `FEAT-GRN-002` · workbook sheet "13. GRN"

#### PRD-GRN-005 — Partial / Multiple GRNs against a Single PO: PO consumption tracking must aggregate correctly across all partial GRNs

- **Why it matters.** The workbook records this edge case for Partial / Multiple GRNs against a Single PO: "PO consumption tracking must aggregate correctly across all partial GRNs".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "PO consumption tracking must aggregate correctly across all partial GRNs".
  3. Use Partial / Multiple GRNs against a Single PO to raise multiple partial GRNs against one PO.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Partial / Multiple GRNs against a Single PO behaves as the workbook states: "PO consumption tracking must aggregate correctly across all partial GRNs".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-GRN-002` · workbook sheet "13. GRN"

#### PRD-GRN-006 — Partial / Multiple GRNs against a Single PO: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Partial / Multiple GRNs against a Single PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Partial / Multiple GRNs against a Single PO to raise multiple partial GRNs against one PO.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-GRN-002` · workbook sheet "13. GRN"

#### PRD-GRN-007 — GRN–PO Line-Item Auto-Match: happy path for the Warehouse Executive

- **Why it matters.** Reduces manual entry and the chance of mismatched line references. Business use: System pre-fills GRN lines from the PO (or ASN) and the user confirms or edits received quantity.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Use GRN–PO Line-Item Auto-Match to get what the story asks for: GRN lines automatically matched to PO lines.
  3. Follow the business scenario the workbook gives: "System pre-fills GRN lines from the PO (or ASN) and the user confirms or edits received quantity".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: they only need to confirm quantities received. The business use case is served: system pre-fills GRN lines from the PO (or ASN) and the user confirms or edits received quantity.
- **Oracle.** Observable proof that GRN–PO Line-Item Auto-Match did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-003.
- **Trace.** P0 · manual · `FEAT-GRN-003` · workbook sheet "13. GRN"

#### PRD-GRN-008 — GRN–PO Line-Item Auto-Match: should support many-to-many mapping where deliveries don't mirror PO lines…

- **Why it matters.** The workbook records this edge case for GRN–PO Line-Item Auto-Match: "Should support many-to-many mapping where deliveries don't mirror PO lines exactly". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support many-to-many mapping where deliveries don't mirror PO lines exactly".
  3. Use GRN–PO Line-Item Auto-Match to get GRN lines automatically matched to PO lines.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GRN–PO Line-Item Auto-Match behaves as the workbook states: "Should support many-to-many mapping where deliveries don't mirror PO lines exactly".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-003 quoting the note.
- **Trace.** P2 · manual · `FEAT-GRN-003` · workbook sheet "13. GRN"

#### PRD-GRN-009 — GRN–PO Line-Item Auto-Match: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of GRN–PO Line-Item Auto-Match. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN–PO Line-Item Auto-Match to get GRN lines automatically matched to PO lines.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-GRN-003` · workbook sheet "13. GRN"

#### PRD-GRN-010 — Under-Receipt / Shortage Handling: happy path for the Warehouse Executive

- **Why it matters.** Creates an auditable record for vendor follow-up and short-close decisions. Business use: Received quantity less than PO/ASN quantity is logged with a shortage reason and routed for follow-up.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Record a shortage against the PO quantity.
  3. Follow the business scenario the workbook gives: "Received quantity less than PO/ASN quantity is logged with a shortage reason and routed for follow-up".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: the gap is documented rather than silently closed. The business use case is served: received quantity less than PO/ASN quantity is logged with a shortage reason and routed for follow-up.
- **Oracle.** Observable proof that Under-Receipt / Shortage Handling did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-005.
- **Trace.** P0 · manual · `FEAT-GRN-005` · workbook sheet "13. GRN"

#### PRD-GRN-011 — Under-Receipt / Shortage Handling: shortage should optionally auto-trigger a debit note or vendor query

- **Why it matters.** The workbook records this edge case for Under-Receipt / Shortage Handling: "Shortage should optionally auto-trigger a debit note or vendor query".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Shortage should optionally auto-trigger a debit note or vendor query".
  3. Use Under-Receipt / Shortage Handling to record a shortage against the PO quantity.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Under-Receipt / Shortage Handling behaves as the workbook states: "Shortage should optionally auto-trigger a debit note or vendor query".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-005 quoting the note.
- **Trace.** P2 · manual · `FEAT-GRN-005` · workbook sheet "13. GRN"

#### PRD-GRN-012 — Under-Receipt / Shortage Handling: not available on the Growth plan

- **Why it matters.** The workbook limits Under-Receipt / Shortage Handling to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Under-Receipt / Shortage Handling to record a shortage against the PO quantity.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-GRN-005` · workbook sheet "13. GRN"

#### PRD-GRN-013 — Under-Receipt / Shortage Handling: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Under-Receipt / Shortage Handling. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Under-Receipt / Shortage Handling to record a shortage against the PO quantity.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-GRN-005` · workbook sheet "13. GRN"

#### PRD-GRN-014 — GRN Approval Workflow: happy path for the Warehouse Manager

- **Why it matters.** Adds a control layer for high-value or high-risk receipts. Business use: GRNs crossing a configured threshold route to a manager for approval before the GRN is finalized.
- **Setup.**
  Persona: Warehouse Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Manager on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Use GRN Approval Workflow to get what the story asks for: GRNs above a value/quantity threshold to require approval.
  3. Follow the business scenario the workbook gives: "GRNs crossing a configured threshold route to a manager for approval before the GRN is finalized".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Manager achieves the story's outcome: large receipts get a second check before posting. The business use case is served: GRNs crossing a configured threshold route to a manager for approval before the GRN is finalized.
- **Oracle.** Observable proof that GRN Approval Workflow did its job for the Warehouse Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-009.
- **Trace.** P0 · manual · `FEAT-GRN-009` · workbook sheet "13. GRN"

#### PRD-GRN-015 — GRN Approval Workflow: tenant configuration — Threshold and approver chain configurable per category/entity

- **Why it matters.** The workbook says "Threshold and approver chain configurable per category/entity". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Warehouse Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Threshold and approver chain configurable per category/entity") and record its current value.
  2. As the Warehouse Manager: use GRN Approval Workflow to get GRNs above a value/quantity threshold to require approval.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs GRN Approval Workflow follows the tenant's configured value, as the workbook states: "Threshold and approver chain configurable per category/entity". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-GRN-009` · workbook sheet "13. GRN"

#### PRD-GRN-016 — GRN Approval Workflow: not available on the Growth plan

- **Why it matters.** The workbook limits GRN Approval Workflow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Manager on the lower-plan tenant.
  2. Try it: use GRN Approval Workflow to get GRNs above a value/quantity threshold to require approval.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-GRN-009` · workbook sheet "13. GRN"

#### PRD-GRN-017 — GRN Approval Workflow: refused for a user without the Warehouse Manager role

- **Why it matters.** The workbook names Warehouse Manager as the user of GRN Approval Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN Approval Workflow to get GRNs above a value/quantity threshold to require approval.
  3. Repeat as a Warehouse Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Manager.
- **Trace.** P1 · automate-later · `FEAT-GRN-009` · workbook sheet "13. GRN"

#### PRD-GRN-018 — GRN-to-Invoice 3-Way Match Trigger: happy path for the AP Executive

- **Why it matters.** Removes a manual handoff step between receiving and AP. Business use: GRN completion event feeds directly into the invoice matching queue.
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Use GRN-to-Invoice 3-Way Match Trigger to get what the story asks for: a posted GRN to automatically become available for 3-way matching.
  3. Follow the business scenario the workbook gives: "GRN completion event feeds directly into the invoice matching queue".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: invoice processing isn't delayed waiting on manual GRN lookups. The business use case is served: GRN completion event feeds directly into the invoice matching queue.
- **Oracle.** Observable proof that GRN-to-Invoice 3-Way Match Trigger did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-015.
- **Trace.** P0 · manual · `FEAT-GRN-015` · workbook sheet "13. GRN"

#### PRD-GRN-019 — GRN-to-Invoice 3-Way Match Trigger: should respect the GRN's QC-hold status before making it match-eligible

- **Why it matters.** The workbook records this edge case for GRN-to-Invoice 3-Way Match Trigger: "Should respect the GRN's QC-hold status before making it match-eligible". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should respect the GRN's QC-hold status before making it match-eligible".
  3. Use GRN-to-Invoice 3-Way Match Trigger to get a posted GRN to automatically become available for 3-way matching.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GRN-to-Invoice 3-Way Match Trigger behaves as the workbook states: "Should respect the GRN's QC-hold status before making it match-eligible".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-015 quoting the note.
- **Trace.** P2 · manual · `FEAT-GRN-015` · workbook sheet "13. GRN"

#### PRD-GRN-020 — GRN-to-Invoice 3-Way Match Trigger: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of GRN-to-Invoice 3-Way Match Trigger. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN-to-Invoice 3-Way Match Trigger to get a posted GRN to automatically become available for 3-way matching.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-GRN-015` · workbook sheet "13. GRN"

## 2. Optional features

#### PRD-GRN-021 — GRN Photo / Document Attachment: happy path for the Warehouse Executive

- **Why it matters.** Provides visual evidence for disputes, damage claims, or quality escalation. Business use: Photos of received goods, damage, or packaging are attached directly to the GRN record.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  Context from the workbook: Particularly relevant for damage or shortage GRNs.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Attach photos or documents to a GRN.
  3. Follow the business scenario the workbook gives: "Photos of received goods, damage, or packaging are attached directly to the GRN record".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: condition-at-receipt is visually documented. The business use case is served: photos of received goods, damage, or packaging are attached directly to the GRN record.
- **Oracle.** Observable proof that GRN Photo / Document Attachment did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-008.
- **Trace.** P1 · manual · `FEAT-GRN-008` · workbook sheet "13. GRN"

#### PRD-GRN-022 — GRN Photo / Document Attachment: not available on the Growth plan

- **Why it matters.** The workbook limits GRN Photo / Document Attachment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use GRN Photo / Document Attachment to attach photos or documents to a GRN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-GRN-008` · workbook sheet "13. GRN"

#### PRD-GRN-023 — GRN Photo / Document Attachment: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of GRN Photo / Document Attachment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN Photo / Document Attachment to attach photos or documents to a GRN.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-GRN-008` · workbook sheet "13. GRN"

## 3. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-GRN-024 — [Roadmap] Over-Receipt Tolerance Control: happy path for the Warehouse Executive

- **Why it matters.** Prevents unauthorized over-delivery from silently entering the books. Business use: GRN quantity exceeding the PO balance beyond a configured tolerance % is stopped or requires approval.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Use Over-Receipt Tolerance Control to get what the story asks for: over-receipt beyond a tolerance to be blocked or flagged.
  3. Follow the business scenario the workbook gives: "GRN quantity exceeding the PO balance beyond a configured tolerance % is stopped or requires approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: we don't accept and pay for excess quantity. The business use case is served: GRN quantity exceeding the PO balance beyond a configured tolerance % is stopped or requires approval.
- **Oracle.** Observable proof that Over-Receipt Tolerance Control did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-004.
- **Trace.** P3 · manual · `FEAT-GRN-004` · workbook sheet "13. GRN"

#### PRD-GRN-025 — [Roadmap] Over-Receipt Tolerance Control: tenant configuration — Tolerance % configurable by category

- **Why it matters.** The workbook says "Tolerance % configurable by category". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Warehouse Executive (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Tolerance % configurable by category") and record its current value.
  2. As the Warehouse Executive: use Over-Receipt Tolerance Control to get over-receipt beyond a tolerance to be blocked or flagged.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Over-Receipt Tolerance Control follows the tenant's configured value, as the workbook states: "Tolerance % configurable by category". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-GRN-004` · workbook sheet "13. GRN"

#### PRD-GRN-026 — [Roadmap] Over-Receipt Tolerance Control: tenant configuration — hard-block vs. soft-flag configurable

- **Why it matters.** The workbook says "hard-block vs. soft-flag configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Warehouse Executive (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("hard-block vs. soft-flag configurable") and record its current value.
  2. As the Warehouse Executive: use Over-Receipt Tolerance Control to get over-receipt beyond a tolerance to be blocked or flagged.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Over-Receipt Tolerance Control follows the tenant's configured value, as the workbook states: "hard-block vs. soft-flag configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-GRN-004` · workbook sheet "13. GRN"

#### PRD-GRN-027 — [Roadmap] Over-Receipt Tolerance Control: not available on the Growth plan

- **Why it matters.** The workbook limits Over-Receipt Tolerance Control to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Over-Receipt Tolerance Control to get over-receipt beyond a tolerance to be blocked or flagged.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-004` · workbook sheet "13. GRN"

#### PRD-GRN-028 — [Roadmap] Over-Receipt Tolerance Control: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Over-Receipt Tolerance Control. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Over-Receipt Tolerance Control to get over-receipt beyond a tolerance to be blocked or flagged.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-004` · workbook sheet "13. GRN"

#### PRD-GRN-029 — [Roadmap] GRN Rejection & Return-to-Vendor Trigger: happy path for the Warehouse Executive

- **Why it matters.** Keeps rejected goods out of consumable inventory and starts recovery immediately. Business use: Rejected quantity at receipt kicks off the Return-to-Vendor (RTV) process instead of being GRN'd as accepted.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Reject part of a GRN and trigger a return.
  3. Follow the business scenario the workbook gives: "Rejected quantity at receipt kicks off the Return-to-Vendor (RTV) process instead of being GRN'd as accepted".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: defective or wrong goods don't sit in inventory. The business use case is served: rejected quantity at receipt kicks off the Return-to-Vendor (RTV) process instead of being GRN'd as accepted.
- **Oracle.** Observable proof that GRN Rejection & Return-to-Vendor Trigger did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-006.
- **Trace.** P3 · manual · `FEAT-GRN-006` · workbook sheet "13. GRN"

#### PRD-GRN-030 — [Roadmap] GRN Rejection & Return-to-Vendor Trigger: should link directly into the Quality Check and Credit/Debit Note modules

- **Why it matters.** The workbook records this edge case for GRN Rejection & Return-to-Vendor Trigger: "Should link directly into the Quality Check and Credit/Debit Note modules". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should link directly into the Quality Check and Credit/Debit Note modules".
  3. Use GRN Rejection & Return-to-Vendor Trigger to reject part of a GRN and trigger a return.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GRN Rejection & Return-to-Vendor Trigger behaves as the workbook states: "Should link directly into the Quality Check and Credit/Debit Note modules".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-006 quoting the note.
- **Trace.** P3 · manual · `FEAT-GRN-006` · workbook sheet "13. GRN"

#### PRD-GRN-031 — [Roadmap] GRN Rejection & Return-to-Vendor Trigger: not available on the Growth plan

- **Why it matters.** The workbook limits GRN Rejection & Return-to-Vendor Trigger to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use GRN Rejection & Return-to-Vendor Trigger to reject part of a GRN and trigger a return.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-006` · workbook sheet "13. GRN"

#### PRD-GRN-032 — [Roadmap] GRN Rejection & Return-to-Vendor Trigger: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of GRN Rejection & Return-to-Vendor Trigger. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN Rejection & Return-to-Vendor Trigger to reject part of a GRN and trigger a return.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-006` · workbook sheet "13. GRN"

#### PRD-GRN-033 — [Roadmap] Batch / Lot & Serial Number Capture at GRN: happy path for the Warehouse Executive

- **Why it matters.** Enables recall, warranty, and quality traceability back to the receiving event. Business use: Batch/lot/serial data entered or scanned at GRN feeds inventory and later quality/warranty traceability.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Capture batch/lot or serial numbers at GRN.
  3. Follow the business scenario the workbook gives: "Batch/lot/serial data entered or scanned at GRN feeds inventory and later quality/warranty traceability".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: traceability is preserved from receipt onward. The business use case is served: batch/lot/serial data entered or scanned at GRN feeds inventory and later quality/warranty traceability.
- **Oracle.** Observable proof that Batch / Lot & Serial Number Capture at GRN did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-007.
- **Trace.** P3 · manual · `FEAT-GRN-007` · workbook sheet "13. GRN"

#### PRD-GRN-034 — [Roadmap] Batch / Lot & Serial Number Capture at GRN: mandatory only for categories where the item master flags batch/serial tracking

- **Why it matters.** The workbook records this edge case for Batch / Lot & Serial Number Capture at GRN: "Mandatory only for categories where the item master flags batch/serial tracking".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Mandatory only for categories where the item master flags batch/serial tracking".
  3. Use Batch / Lot & Serial Number Capture at GRN to capture batch/lot or serial numbers at GRN.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Batch / Lot & Serial Number Capture at GRN behaves as the workbook states: "Mandatory only for categories where the item master flags batch/serial tracking".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-007 quoting the note.
- **Trace.** P3 · manual · `FEAT-GRN-007` · workbook sheet "13. GRN"

#### PRD-GRN-035 — [Roadmap] Batch / Lot & Serial Number Capture at GRN: not available on the Growth plan

- **Why it matters.** The workbook limits Batch / Lot & Serial Number Capture at GRN to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Batch / Lot & Serial Number Capture at GRN to capture batch/lot or serial numbers at GRN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-007` · workbook sheet "13. GRN"

#### PRD-GRN-036 — [Roadmap] Batch / Lot & Serial Number Capture at GRN: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Batch / Lot & Serial Number Capture at GRN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Batch / Lot & Serial Number Capture at GRN to capture batch/lot or serial numbers at GRN.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-007` · workbook sheet "13. GRN"

#### PRD-GRN-037 — [Roadmap] GRN Reversal / Cancellation: happy path for the Warehouse Executive

- **Why it matters.** Auditability of corrections to physical receipt records. Business use: An erroneous GRN is reversed through a controlled flow rather than deleted, preserving the audit trail.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Reverse a GRN posted in error.
  3. Follow the business scenario the workbook gives: "An erroneous GRN is reversed through a controlled flow rather than deleted, preserving the audit trail".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: inventory and PO consumption correct themselves cleanly. The business use case is served: an erroneous GRN is reversed through a controlled flow rather than deleted, preserving the audit trail.
- **Oracle.** Observable proof that GRN Reversal / Cancellation did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-010.
- **Trace.** P3 · manual · `FEAT-GRN-010` · workbook sheet "13. GRN"

#### PRD-GRN-038 — [Roadmap] GRN Reversal / Cancellation: reversal should be blocked once an invoice has matched against the GRN

- **Why it matters.** The workbook records this edge case for GRN Reversal / Cancellation: "Reversal should be blocked once an invoice has matched against the GRN".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Reversal should be blocked once an invoice has matched against the GRN".
  3. Use GRN Reversal / Cancellation to reverse a GRN posted in error.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GRN Reversal / Cancellation behaves as the workbook states: "Reversal should be blocked once an invoice has matched against the GRN".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-010 quoting the note.
- **Trace.** P3 · manual · `FEAT-GRN-010` · workbook sheet "13. GRN"

#### PRD-GRN-039 — [Roadmap] GRN Reversal / Cancellation: not available on the Growth plan

- **Why it matters.** The workbook limits GRN Reversal / Cancellation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use GRN Reversal / Cancellation to reverse a GRN posted in error.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-010` · workbook sheet "13. GRN"

#### PRD-GRN-040 — [Roadmap] GRN Reversal / Cancellation: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of GRN Reversal / Cancellation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN Reversal / Cancellation to reverse a GRN posted in error.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-010` · workbook sheet "13. GRN"

#### PRD-GRN-041 — [Roadmap] Warehouse / Bin Location Mapping at GRN: happy path for the Warehouse Executive

- **Why it matters.** Links receiving directly into warehouse/inventory management. Business use: Received items are mapped to a bin/location code as part of the GRN transaction.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  Context from the workbook: Relevant mainly for clients with WMS-level granularity needs.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Assign a bin/storage location at GRN.
  3. Follow the business scenario the workbook gives: "Received items are mapped to a bin/location code as part of the GRN transaction".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: put-away is tracked from the moment of receipt. The business use case is served: received items are mapped to a bin/location code as part of the GRN transaction.
- **Oracle.** Observable proof that Warehouse / Bin Location Mapping at GRN did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-011.
- **Trace.** P3 · manual · `FEAT-GRN-011` · workbook sheet "13. GRN"

#### PRD-GRN-042 — [Roadmap] Warehouse / Bin Location Mapping at GRN: not available on the Growth plan

- **Why it matters.** The workbook limits Warehouse / Bin Location Mapping at GRN to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Warehouse / Bin Location Mapping at GRN to assign a bin/storage location at GRN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-011` · workbook sheet "13. GRN"

#### PRD-GRN-043 — [Roadmap] Warehouse / Bin Location Mapping at GRN: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Warehouse / Bin Location Mapping at GRN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Warehouse / Bin Location Mapping at GRN to assign a bin/storage location at GRN.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-011` · workbook sheet "13. GRN"

#### PRD-GRN-044 — [Roadmap] GRN-Triggered Quality Check Hold: happy path for the Warehouse Executive

- **Why it matters.** Prevents goods from entering use or invoicing ahead of required quality sign-off. Business use: GRN for a QC-mandatory category is held in a pending-inspection state until the Quality Check module clears it.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Use GRN-Triggered Quality Check Hold to get what the story asks for: GRNs for QC-flagged categories to auto-hold pending inspection.
  3. Follow the business scenario the workbook gives: "GRN for a QC-mandatory category is held in a pending-inspection state until the Quality Check module clears it".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: unchecked goods aren't consumed or invoiced. The business use case is served: GRN for a QC-mandatory category is held in a pending-inspection state until the Quality Check module clears it.
- **Oracle.** Observable proof that GRN-Triggered Quality Check Hold did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-012.
- **Trace.** P3 · manual · `FEAT-GRN-012` · workbook sheet "13. GRN"

#### PRD-GRN-045 — [Roadmap] GRN-Triggered Quality Check Hold: hold should release automatically on QC pass, or route to RTV/debit-note on QC…

- **Why it matters.** The workbook records this edge case for GRN-Triggered Quality Check Hold: "Hold should release automatically on QC pass, or route to RTV/debit-note on QC fail".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Hold should release automatically on QC pass, or route to RTV/debit-note on QC fail".
  3. Use GRN-Triggered Quality Check Hold to get GRNs for QC-flagged categories to auto-hold pending inspection.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** GRN-Triggered Quality Check Hold behaves as the workbook states: "Hold should release automatically on QC pass, or route to RTV/debit-note on QC fail".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-012 quoting the note.
- **Trace.** P3 · manual · `FEAT-GRN-012` · workbook sheet "13. GRN"

#### PRD-GRN-046 — [Roadmap] GRN-Triggered Quality Check Hold: not available on the Growth plan

- **Why it matters.** The workbook limits GRN-Triggered Quality Check Hold to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use GRN-Triggered Quality Check Hold to get GRNs for QC-flagged categories to auto-hold pending inspection.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-012` · workbook sheet "13. GRN"

#### PRD-GRN-047 — [Roadmap] GRN-Triggered Quality Check Hold: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of GRN-Triggered Quality Check Hold. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN-Triggered Quality Check Hold to get GRNs for QC-flagged categories to auto-hold pending inspection.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-012` · workbook sheet "13. GRN"

#### PRD-GRN-048 — [Roadmap] GRN Aging Report: happy path for the Warehouse Manager

- **Why it matters.** Surfaces AP-GRN bottlenecks before they become accrual problems. Business use: Report buckets GRNs by how long they've sat without a matching invoice.
- **Setup.**
  Persona: Warehouse Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Manager on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. See GRNs pending invoice matching by age.
  3. Follow the business scenario the workbook gives: "Report buckets GRNs by how long they've sat without a matching invoice".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Manager achieves the story's outcome: stuck receipts are surfaced for follow-up. The business use case is served: report buckets GRNs by how long they've sat without a matching invoice.
- **Oracle.** Observable proof that GRN Aging Report did its job for the Warehouse Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-013.
- **Trace.** P3 · manual · `FEAT-GRN-013` · workbook sheet "13. GRN"

#### PRD-GRN-049 — [Roadmap] GRN Aging Report: tenant configuration — Aging buckets configurable per tenant

- **Why it matters.** The workbook says "Aging buckets configurable per tenant". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Warehouse Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Aging buckets configurable per tenant") and record its current value.
  2. As the Warehouse Manager: use GRN Aging Report to see GRNs pending invoice matching by age.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs GRN Aging Report follows the tenant's configured value, as the workbook states: "Aging buckets configurable per tenant". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-GRN-013` · workbook sheet "13. GRN"

#### PRD-GRN-050 — [Roadmap] GRN Aging Report: not available on the Growth plan

- **Why it matters.** The workbook limits GRN Aging Report to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Manager on the lower-plan tenant.
  2. Try it: use GRN Aging Report to see GRNs pending invoice matching by age.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-013` · workbook sheet "13. GRN"

#### PRD-GRN-051 — [Roadmap] GRN Aging Report: refused for a user without the Warehouse Manager role

- **Why it matters.** The workbook names Warehouse Manager as the user of GRN Aging Report. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use GRN Aging Report to see GRNs pending invoice matching by age.
  3. Repeat as a Warehouse Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Manager.
- **Trace.** P3 · manual · `FEAT-GRN-013` · workbook sheet "13. GRN"

#### PRD-GRN-052 — [Roadmap] Mobile / Barcode-Scanner GRN Entry: happy path for the Warehouse Executive

- **Why it matters.** Speeds up dock-side receiving and reduces manual keying errors. Business use: Barcode/QR scan of items and PO reference populates the GRN on a mobile device at the point of receipt.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Scan barcodes to create a GRN on a handheld device.
  3. Follow the business scenario the workbook gives: "Barcode/QR scan of items and PO reference populates the GRN on a mobile device at the point of receipt".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: receiving on the dock is fast and accurate. The business use case is served: barcode/QR scan of items and PO reference populates the GRN on a mobile device at the point of receipt.
- **Oracle.** Observable proof that Mobile / Barcode-Scanner GRN Entry did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-014.
- **Trace.** P3 · manual · `FEAT-GRN-014` · workbook sheet "13. GRN"

#### PRD-GRN-053 — [Roadmap] Mobile / Barcode-Scanner GRN Entry: requires offline-capable mobile app for low-connectivity warehouse zones

- **Why it matters.** The workbook records this edge case for Mobile / Barcode-Scanner GRN Entry: "Requires offline-capable mobile app for low-connectivity warehouse zones".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Requires offline-capable mobile app for low-connectivity warehouse zones".
  3. Use Mobile / Barcode-Scanner GRN Entry to scan barcodes to create a GRN on a handheld device.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Mobile / Barcode-Scanner GRN Entry behaves as the workbook states: "Requires offline-capable mobile app for low-connectivity warehouse zones".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-014 quoting the note.
- **Trace.** P3 · manual · `FEAT-GRN-014` · workbook sheet "13. GRN"

#### PRD-GRN-054 — [Roadmap] Mobile / Barcode-Scanner GRN Entry: not available on the Growth plan

- **Why it matters.** The workbook limits Mobile / Barcode-Scanner GRN Entry to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Mobile / Barcode-Scanner GRN Entry to scan barcodes to create a GRN on a handheld device.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-014` · workbook sheet "13. GRN"

#### PRD-GRN-055 — [Roadmap] Mobile / Barcode-Scanner GRN Entry: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Mobile / Barcode-Scanner GRN Entry. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Mobile / Barcode-Scanner GRN Entry to scan barcodes to create a GRN on a handheld device.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-014` · workbook sheet "13. GRN"

#### PRD-GRN-056 — [Roadmap] Consignment / Non-PO GRN Handling: happy path for the Warehouse Executive

- **Why it matters.** Accommodates procurement models that don't start with a PO. Business use: Goods received under a consignment arrangement are GRN'd against a consignment agreement reference instead of a PO.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open GRN (Goods Receipt Note).
  2. Record receipt of consignment stock without a PO.
  3. Follow the business scenario the workbook gives: "Goods received under a consignment arrangement are GRN'd against a consignment agreement reference instead of a PO".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: vendor-owned inventory is tracked correctly. The business use case is served: goods received under a consignment arrangement are GRN'd against a consignment agreement reference instead of a PO.
- **Oracle.** Observable proof that Consignment / Non-PO GRN Handling did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-GRN-016.
- **Trace.** P3 · manual · `FEAT-GRN-016` · workbook sheet "13. GRN"

#### PRD-GRN-057 — [Roadmap] Consignment / Non-PO GRN Handling: consumption from consignment stock should trigger billing separately

- **Why it matters.** The workbook records this edge case for Consignment / Non-PO GRN Handling: "Consumption from consignment stock should trigger billing separately".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Consumption from consignment stock should trigger billing separately".
  3. Use Consignment / Non-PO GRN Handling to record receipt of consignment stock without a PO.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Consignment / Non-PO GRN Handling behaves as the workbook states: "Consumption from consignment stock should trigger billing separately".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-GRN-016 quoting the note.
- **Trace.** P3 · manual · `FEAT-GRN-016` · workbook sheet "13. GRN"

#### PRD-GRN-058 — [Roadmap] Consignment / Non-PO GRN Handling: not available on the Growth plan

- **Why it matters.** The workbook limits Consignment / Non-PO GRN Handling to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use Consignment / Non-PO GRN Handling to record receipt of consignment stock without a PO.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-GRN-016` · workbook sheet "13. GRN"

#### PRD-GRN-059 — [Roadmap] Consignment / Non-PO GRN Handling: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of Consignment / Non-PO GRN Handling. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Consignment / Non-PO GRN Handling to record receipt of consignment stock without a PO.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-GRN-016` · workbook sheet "13. GRN"
