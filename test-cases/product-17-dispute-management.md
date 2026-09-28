# Product test cases — 17. Dispute Management (MOD-24)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-24 · 11 features · 44 cases · group `PRD-DIS` · plan availability: All Plans · status: GA

Structured resolution of invoice/GRN/PO mismatches and disputes.

## 1. Core features

#### PRD-DIS-001 — Match Mismatch Dispute Case Creation: happy path for the AP Executive

- **Why it matters.** Keeps mismatch resolution auditable and centralized instead of happening over email. Business use: A discrepancy found during PO-Invoice-GRN(-QC) matching auto-creates a dispute case with all linked documents attached.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Dispute Management.
  2. Use Match Mismatch Dispute Case Creation to get what the story asks for: a 3-way/4-way match mismatch to automatically open a dispute case.
  3. Follow the business scenario the workbook gives: "A discrepancy found during PO-Invoice-GRN(-QC) matching auto-creates a dispute case with all linked documents attached".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: the discrepancy is tracked and resolved on-platform. The business use case is served: a discrepancy found during PO-Invoice-GRN(-QC) matching auto-creates a dispute case with all linked documents attached.
- **Oracle.** Observable proof that Match Mismatch Dispute Case Creation did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-001.
- **Trace.** P0 · manual · `FEAT-DIS-001` · workbook sheet "17. Dispute Management"

#### PRD-DIS-002 — Match Mismatch Dispute Case Creation: case carries direct links to the PO, invoice, and GRN lines that triggered it

- **Why it matters.** The workbook records this edge case for Match Mismatch Dispute Case Creation: "Case carries direct links to the PO, invoice, and GRN lines that triggered it".
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Case carries direct links to the PO, invoice, and GRN lines that triggered it".
  3. Use Match Mismatch Dispute Case Creation to get a 3-way/4-way match mismatch to automatically open a dispute case.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Match Mismatch Dispute Case Creation behaves as the workbook states: "Case carries direct links to the PO, invoice, and GRN lines that triggered it".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-DIS-001` · workbook sheet "17. Dispute Management"

#### PRD-DIS-003 — Match Mismatch Dispute Case Creation: not available on plans below Growth

- **Why it matters.** The workbook limits Match Mismatch Dispute Case Creation to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Match Mismatch Dispute Case Creation to get a 3-way/4-way match mismatch to automatically open a dispute case.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-DIS-001` · workbook sheet "17. Dispute Management"

#### PRD-DIS-004 — Match Mismatch Dispute Case Creation: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Match Mismatch Dispute Case Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Match Mismatch Dispute Case Creation to get a 3-way/4-way match mismatch to automatically open a dispute case.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P1 · automate-later · `FEAT-DIS-001` · workbook sheet "17. Dispute Management"

#### PRD-DIS-005 — In-Platform Stakeholder Collaboration: happy path for the AP Executive / Buyer / Vendor

- **Why it matters.** Centralizes dispute communication and keeps a permanent, auditable record of how it was resolved. Business use: A comment thread with attachments sits on every dispute case, visible to all assigned stakeholders.
- **Setup.**
  Persona: AP Executive / Buyer / Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive / Buyer / Vendor on the tenant described in Setup and open Dispute Management.
  2. Comment and collaborate on a dispute case within the platform.
  3. Follow the business scenario the workbook gives: "A comment thread with attachments sits on every dispute case, visible to all assigned stakeholders".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive / Buyer / Vendor achieves the story's outcome: resolution doesn't happen over scattered emails or calls. The business use case is served: a comment thread with attachments sits on every dispute case, visible to all assigned stakeholders.
- **Oracle.** Observable proof that In-Platform Stakeholder Collaboration did its job for the AP Executive / Buyer / Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-002.
- **Trace.** P0 · manual · `FEAT-DIS-002` · workbook sheet "17. Dispute Management"

#### PRD-DIS-006 — In-Platform Stakeholder Collaboration: vendor-visible comments should be distinguishable from internal-only notes

- **Why it matters.** The workbook records this edge case for In-Platform Stakeholder Collaboration: "Vendor-visible comments should be distinguishable from internal-only notes".
- **Setup.**
  Persona: AP Executive / Buyer / Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive / Buyer / Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Vendor-visible comments should be distinguishable from internal-only notes".
  3. Use In-Platform Stakeholder Collaboration to comment and collaborate on a dispute case within the platform.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** In-Platform Stakeholder Collaboration behaves as the workbook states: "Vendor-visible comments should be distinguishable from internal-only notes".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-DIS-002` · workbook sheet "17. Dispute Management"

#### PRD-DIS-007 — In-Platform Stakeholder Collaboration: not available on plans below Growth

- **Why it matters.** The workbook limits In-Platform Stakeholder Collaboration to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive / Buyer / Vendor.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Executive / Buyer / Vendor on the lower-plan tenant.
  2. Try it: use In-Platform Stakeholder Collaboration to comment and collaborate on a dispute case within the platform.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-DIS-002` · workbook sheet "17. Dispute Management"

#### PRD-DIS-008 — In-Platform Stakeholder Collaboration: refused for a user without the AP Executive / Buyer / Vendor role

- **Why it matters.** The workbook names AP Executive / Buyer / Vendor as the user of In-Platform Stakeholder Collaboration. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive / Buyer / Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use In-Platform Stakeholder Collaboration to comment and collaborate on a dispute case within the platform.
  3. Repeat as an AP Executive / Buyer / Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive / Buyer / Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive / Buyer / Vendor.
- **Trace.** P1 · automate-later · `FEAT-DIS-002` · workbook sheet "17. Dispute Management"

#### PRD-DIS-009 — Dispute Task Assignment to Stakeholders: happy path for the AP Manager

- **Why it matters.** Removes ambiguity over who owns resolving a given mismatch. Business use: A dispute case is assigned or reassigned to whichever role or individual needs to act next.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup and open Dispute Management.
  2. Assign a dispute to the correct stakeholder (buyer, vendor, warehouse, finance).
  3. Follow the business scenario the workbook gives: "A dispute case is assigned or reassigned to whichever role or individual needs to act next".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Manager achieves the story's outcome: resolution ownership is always clear. The business use case is served: a dispute case is assigned or reassigned to whichever role or individual needs to act next.
- **Oracle.** Observable proof that Dispute Task Assignment to Stakeholders did its job for the AP Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-003.
- **Trace.** P0 · manual · `FEAT-DIS-003` · workbook sheet "17. Dispute Management"

#### PRD-DIS-010 — Dispute Task Assignment to Stakeholders: reassignment history is retained so ownership changes are traceable

- **Why it matters.** The workbook records this edge case for Dispute Task Assignment to Stakeholders: "Reassignment history is retained so ownership changes are traceable".
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Reassignment history is retained so ownership changes are traceable".
  3. Use Dispute Task Assignment to Stakeholders to assign a dispute to the correct stakeholder (buyer, vendor, warehouse, finance).
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Dispute Task Assignment to Stakeholders behaves as the workbook states: "Reassignment history is retained so ownership changes are traceable".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-003 quoting the note.
- **Trace.** P2 · manual · `FEAT-DIS-003` · workbook sheet "17. Dispute Management"

#### PRD-DIS-011 — Dispute Task Assignment to Stakeholders: not available on plans below Growth

- **Why it matters.** The workbook limits Dispute Task Assignment to Stakeholders to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the lower-plan tenant.
  2. Try it: use Dispute Task Assignment to Stakeholders to assign a dispute to the correct stakeholder (buyer, vendor, warehouse, finance).
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-DIS-003` · workbook sheet "17. Dispute Management"

#### PRD-DIS-012 — Dispute Task Assignment to Stakeholders: refused for a user without the AP Manager role

- **Why it matters.** The workbook names AP Manager as the user of Dispute Task Assignment to Stakeholders. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dispute Task Assignment to Stakeholders to assign a dispute to the correct stakeholder (buyer, vendor, warehouse, finance).
  3. Repeat as an AP Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Manager.
- **Trace.** P1 · automate-later · `FEAT-DIS-003` · workbook sheet "17. Dispute Management"

#### PRD-DIS-013 — Invoice Assignment for Processing: happy path for the AP Manager

- **Why it matters.** Prevents invoices from stalling because no one has explicit ownership of them. Business use: Invoices are assigned to a specific AP processor or approver based on category, vendor, or exception type.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup and open Dispute Management.
  2. Use Invoice Assignment for Processing to get what the story asks for: invoices routed and assigned to the correct stakeholder for processing.
  3. Follow the business scenario the workbook gives: "Invoices are assigned to a specific AP processor or approver based on category, vendor, or exception type".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Manager achieves the story's outcome: invoices don't sit unowned in a shared queue. The business use case is served: invoices are assigned to a specific AP processor or approver based on category, vendor, or exception type.
- **Oracle.** Observable proof that Invoice Assignment for Processing did its job for the AP Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-004.
- **Trace.** P0 · manual · `FEAT-DIS-004` · workbook sheet "17. Dispute Management"

#### PRD-DIS-014 — Invoice Assignment for Processing: assignment rules can be manual or auto-routed by category/vendor

- **Why it matters.** The workbook records this edge case for Invoice Assignment for Processing: "Assignment rules can be manual or auto-routed by category/vendor".
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Assignment rules can be manual or auto-routed by category/vendor".
  3. Use Invoice Assignment for Processing to get invoices routed and assigned to the correct stakeholder for processing.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Invoice Assignment for Processing behaves as the workbook states: "Assignment rules can be manual or auto-routed by category/vendor".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-DIS-004` · workbook sheet "17. Dispute Management"

#### PRD-DIS-015 — Invoice Assignment for Processing: not available on plans below Growth

- **Why it matters.** The workbook limits Invoice Assignment for Processing to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as an AP Manager on the lower-plan tenant.
  2. Try it: use Invoice Assignment for Processing to get invoices routed and assigned to the correct stakeholder for processing.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-DIS-004` · workbook sheet "17. Dispute Management"

#### PRD-DIS-016 — Invoice Assignment for Processing: refused for a user without the AP Manager role

- **Why it matters.** The workbook names AP Manager as the user of Invoice Assignment for Processing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Invoice Assignment for Processing to get invoices routed and assigned to the correct stakeholder for processing.
  3. Repeat as an AP Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Manager.
- **Trace.** P1 · automate-later · `FEAT-DIS-004` · workbook sheet "17. Dispute Management"

## 2. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-DIS-017 — [Roadmap] Dispute Status Tracking & SLA Timers: happy path for the AP Manager

- **Why it matters.** Turns dispute resolution into a measurable, manageable process instead of an ad-hoc one. Business use: Dispute status (open, in-progress, resolved) and elapsed time are tracked and surfaced on a dashboard.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup and open Dispute Management.
  2. Use Dispute Status Tracking & SLA Timers to get what the story asks for: each dispute's status and age tracked against an SLA.
  3. Follow the business scenario the workbook gives: "Dispute status (open, in-progress, resolved) and elapsed time are tracked and surfaced on a dashboard".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Manager achieves the story's outcome: stale disputes are visible before they become a payment-delay problem. The business use case is served: dispute status (open, in-progress, resolved) and elapsed time are tracked and surfaced on a dashboard.
- **Oracle.** Observable proof that Dispute Status Tracking & SLA Timers did its job for the AP Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-005.
- **Trace.** P3 · manual · `FEAT-DIS-005` · workbook sheet "17. Dispute Management"

#### PRD-DIS-018 — [Roadmap] Dispute Status Tracking & SLA Timers: tenant configuration — SLA duration should be configurable per dispute type/category

- **Why it matters.** The workbook says "SLA duration should be configurable per dispute type/category". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and AP Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("SLA duration should be configurable per dispute type/category") and record its current value.
  2. As the AP Manager: use Dispute Status Tracking & SLA Timers to get each dispute's status and age tracked against an SLA.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Dispute Status Tracking & SLA Timers follows the tenant's configured value, as the workbook states: "SLA duration should be configurable per dispute type/category". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-DIS-005` · workbook sheet "17. Dispute Management"

#### PRD-DIS-019 — [Roadmap] Dispute Status Tracking & SLA Timers: not available on the Growth plan

- **Why it matters.** The workbook limits Dispute Status Tracking & SLA Timers to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the lower-plan tenant.
  2. Try it: use Dispute Status Tracking & SLA Timers to get each dispute's status and age tracked against an SLA.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-005` · workbook sheet "17. Dispute Management"

#### PRD-DIS-020 — [Roadmap] Dispute Status Tracking & SLA Timers: refused for a user without the AP Manager role

- **Why it matters.** The workbook names AP Manager as the user of Dispute Status Tracking & SLA Timers. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dispute Status Tracking & SLA Timers to get each dispute's status and age tracked against an SLA.
  3. Repeat as an AP Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Manager.
- **Trace.** P3 · manual · `FEAT-DIS-005` · workbook sheet "17. Dispute Management"

#### PRD-DIS-021 — [Roadmap] Dispute Escalation on SLA Breach: happy path for the AP Manager

- **Why it matters.** Keeps dispute resolution moving without manual chasing. Business use: A dispute untouched beyond its SLA auto-notifies the assignee's manager or a designated escalation contact.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup and open Dispute Management.
  2. Use Dispute Escalation on SLA Breach to get what the story asks for: an unresolved dispute past its SLA to escalate automatically.
  3. Follow the business scenario the workbook gives: "A dispute untouched beyond its SLA auto-notifies the assignee's manager or a designated escalation contact".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Manager achieves the story's outcome: it doesn't sit indefinitely with an unresponsive stakeholder. The business use case is served: a dispute untouched beyond its SLA auto-notifies the assignee's manager or a designated escalation contact.
- **Oracle.** Observable proof that Dispute Escalation on SLA Breach did its job for the AP Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-006.
- **Trace.** P3 · manual · `FEAT-DIS-006` · workbook sheet "17. Dispute Management"

#### PRD-DIS-022 — [Roadmap] Dispute Escalation on SLA Breach: tenant configuration — Escalation path should be configurable per stakeholder type (internal vs.…

- **Why it matters.** The workbook says "Escalation path should be configurable per stakeholder type (internal vs. vendor)". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and AP Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Escalation path should be configurable per stakeholder type (internal vs. vendor)") and record its current value.
  2. As the AP Manager: use Dispute Escalation on SLA Breach to get an unresolved dispute past its SLA to escalate automatically.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Dispute Escalation on SLA Breach follows the tenant's configured value, as the workbook states: "Escalation path should be configurable per stakeholder type (internal vs. vendor)". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-DIS-006` · workbook sheet "17. Dispute Management"

#### PRD-DIS-023 — [Roadmap] Dispute Escalation on SLA Breach: not available on the Growth plan

- **Why it matters.** The workbook limits Dispute Escalation on SLA Breach to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the lower-plan tenant.
  2. Try it: use Dispute Escalation on SLA Breach to get an unresolved dispute past its SLA to escalate automatically.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-006` · workbook sheet "17. Dispute Management"

#### PRD-DIS-024 — [Roadmap] Dispute Escalation on SLA Breach: refused for a user without the AP Manager role

- **Why it matters.** The workbook names AP Manager as the user of Dispute Escalation on SLA Breach. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dispute Escalation on SLA Breach to get an unresolved dispute past its SLA to escalate automatically.
  3. Repeat as an AP Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Manager.
- **Trace.** P3 · manual · `FEAT-DIS-006` · workbook sheet "17. Dispute Management"

#### PRD-DIS-025 — [Roadmap] Dispute Resolution Audit Trail: happy path for the Tenant Admin

- **Why it matters.** Provides the evidence trail auditors and finance controllers expect for financial adjustments. Business use: Final resolution (accepted, revised, rejected) and supporting comments are locked into an immutable audit log.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Dispute Management.
  2. Use Dispute Resolution Audit Trail to get what the story asks for: every dispute's resolution decision and justification permanently logged.
  3. Follow the business scenario the workbook gives: "Final resolution (accepted, revised, rejected) and supporting comments are locked into an immutable audit log".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: we can demonstrate the reasoning in an audit. The business use case is served: final resolution (accepted, revised, rejected) and supporting comments are locked into an immutable audit log.
- **Oracle.** Observable proof that Dispute Resolution Audit Trail did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-007.
- **Trace.** P3 · manual · `FEAT-DIS-007` · workbook sheet "17. Dispute Management"

#### PRD-DIS-026 — [Roadmap] Dispute Resolution Audit Trail: should be exportable alongside the related credit/debit note

- **Why it matters.** The workbook records this edge case for Dispute Resolution Audit Trail: "Should be exportable alongside the related credit/debit note". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup.
  2. Set up the situation the note describes: "Should be exportable alongside the related credit/debit note".
  3. Use Dispute Resolution Audit Trail to get every dispute's resolution decision and justification permanently logged.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Dispute Resolution Audit Trail behaves as the workbook states: "Should be exportable alongside the related credit/debit note".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-007 quoting the note.
- **Trace.** P3 · manual · `FEAT-DIS-007` · workbook sheet "17. Dispute Management"

#### PRD-DIS-027 — [Roadmap] Dispute Resolution Audit Trail: not available on the Growth plan

- **Why it matters.** The workbook limits Dispute Resolution Audit Trail to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Dispute Resolution Audit Trail to get every dispute's resolution decision and justification permanently logged.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-007` · workbook sheet "17. Dispute Management"

#### PRD-DIS-028 — [Roadmap] Dispute Resolution Audit Trail: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Dispute Resolution Audit Trail. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dispute Resolution Audit Trail to get every dispute's resolution decision and justification permanently logged.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P3 · manual · `FEAT-DIS-007` · workbook sheet "17. Dispute Management"

#### PRD-DIS-029 — [Roadmap] Dispute Root-Cause Tagging & Analytics: happy path for the Procurement Manager

- **Why it matters.** Turns individual disputes into actionable process and vendor-performance insight. Business use: Each resolved dispute is tagged with a root-cause category feeding into a trend dashboard.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Dispute Management.
  2. Use Dispute Root-Cause Tagging & Analytics to get what the story asks for: disputes tagged by root cause (rate, quantity, GST, quality).
  3. Follow the business scenario the workbook gives: "Each resolved dispute is tagged with a root-cause category feeding into a trend dashboard".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: recurring patterns by vendor or category are visible. The business use case is served: each resolved dispute is tagged with a root-cause category feeding into a trend dashboard.
- **Oracle.** Observable proof that Dispute Root-Cause Tagging & Analytics did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-008.
- **Trace.** P3 · manual · `FEAT-DIS-008` · workbook sheet "17. Dispute Management"

#### PRD-DIS-030 — [Roadmap] Dispute Root-Cause Tagging & Analytics: root-cause taxonomy should stay consistent with QC and GRN reason codes

- **Why it matters.** The workbook records this edge case for Dispute Root-Cause Tagging & Analytics: "Root-cause taxonomy should stay consistent with QC and GRN reason codes".
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Root-cause taxonomy should stay consistent with QC and GRN reason codes".
  3. Use Dispute Root-Cause Tagging & Analytics to get disputes tagged by root cause (rate, quantity, GST, quality).
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Dispute Root-Cause Tagging & Analytics behaves as the workbook states: "Root-cause taxonomy should stay consistent with QC and GRN reason codes".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-008 quoting the note.
- **Trace.** P3 · manual · `FEAT-DIS-008` · workbook sheet "17. Dispute Management"

#### PRD-DIS-031 — [Roadmap] Dispute Root-Cause Tagging & Analytics: not available on the Growth plan

- **Why it matters.** The workbook limits Dispute Root-Cause Tagging & Analytics to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Dispute Root-Cause Tagging & Analytics to get disputes tagged by root cause (rate, quantity, GST, quality).
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-008` · workbook sheet "17. Dispute Management"

#### PRD-DIS-032 — [Roadmap] Dispute Root-Cause Tagging & Analytics: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Dispute Root-Cause Tagging & Analytics. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dispute Root-Cause Tagging & Analytics to get disputes tagged by root cause (rate, quantity, GST, quality).
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P3 · manual · `FEAT-DIS-008` · workbook sheet "17. Dispute Management"

#### PRD-DIS-033 — [Roadmap] Vendor-Facing Dispute Portal Access: happy path for the Vendor

- **Why it matters.** Extends collaborative resolution to the vendor side, not just internal stakeholders. Business use: Vendors see relevant dispute cases, can comment, and can accept/dispute a proposed resolution.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Dispute Management.
  2. View and respond to disputes concerning their invoices via the vendor portal.
  3. Follow the business scenario the workbook gives: "Vendors see relevant dispute cases, can comment, and can accept/dispute a proposed resolution".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: participate in resolution directly. The business use case is served: vendors see relevant dispute cases, can comment, and can accept/dispute a proposed resolution.
- **Oracle.** Observable proof that Vendor-Facing Dispute Portal Access did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-009.
- **Trace.** P3 · manual · `FEAT-DIS-009` · workbook sheet "17. Dispute Management"

#### PRD-DIS-034 — [Roadmap] Vendor-Facing Dispute Portal Access: vendor visibility should be scoped only to disputes concerning their own…

- **Why it matters.** The workbook records this access rule for Vendor-Facing Dispute Portal Access: "Vendor visibility should be scoped only to disputes concerning their own invoices".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Vendor visibility should be scoped only to disputes concerning their own invoices".
  3. Use Vendor-Facing Dispute Portal Access to view and respond to disputes concerning their invoices via the vendor portal.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor-Facing Dispute Portal Access behaves as the workbook states: "Vendor visibility should be scoped only to disputes concerning their own invoices".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-009 quoting the note.
- **Trace.** P3 · manual · `FEAT-DIS-009` · workbook sheet "17. Dispute Management"

#### PRD-DIS-035 — [Roadmap] Vendor-Facing Dispute Portal Access: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor-Facing Dispute Portal Access to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Vendor-Facing Dispute Portal Access to view and respond to disputes concerning their invoices via the vendor portal.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-009` · workbook sheet "17. Dispute Management"

#### PRD-DIS-036 — [Roadmap] Vendor-Facing Dispute Portal Access: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor-Facing Dispute Portal Access. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor-Facing Dispute Portal Access to view and respond to disputes concerning their invoices via the vendor portal.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P3 · manual · `FEAT-DIS-009` · workbook sheet "17. Dispute Management"

#### PRD-DIS-037 — [Roadmap] Bulk Dispute Reassignment: happy path for the AP Manager

- **Why it matters.** Efficient workload rebalancing during absences or overload. Business use: Manager selects a batch of open disputes and reassigns them to a new owner in one action.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup and open Dispute Management.
  2. Reassign multiple disputes at once.
  3. Follow the business scenario the workbook gives: "Manager selects a batch of open disputes and reassigns them to a new owner in one action".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Manager achieves the story's outcome: coverage gaps (e.g., a stakeholder going on leave) don't stall multiple cases individually. The business use case is served: manager selects a batch of open disputes and reassigns them to a new owner in one action.
- **Oracle.** Observable proof that Bulk Dispute Reassignment did its job for the AP Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-010.
- **Trace.** P3 · manual · `FEAT-DIS-010` · workbook sheet "17. Dispute Management"

#### PRD-DIS-038 — [Roadmap] Bulk Dispute Reassignment: should preserve the reassignment audit trail per case, not just in bulk

- **Why it matters.** The workbook records this edge case for Bulk Dispute Reassignment: "Should preserve the reassignment audit trail per case, not just in bulk". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should preserve the reassignment audit trail per case, not just in bulk".
  3. Use Bulk Dispute Reassignment to reassign multiple disputes at once.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Bulk Dispute Reassignment behaves as the workbook states: "Should preserve the reassignment audit trail per case, not just in bulk".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-010 quoting the note.
- **Trace.** P3 · manual · `FEAT-DIS-010` · workbook sheet "17. Dispute Management"

#### PRD-DIS-039 — [Roadmap] Bulk Dispute Reassignment: not available on the Growth plan

- **Why it matters.** The workbook limits Bulk Dispute Reassignment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Manager on the lower-plan tenant.
  2. Try it: use Bulk Dispute Reassignment to reassign multiple disputes at once.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-010` · workbook sheet "17. Dispute Management"

#### PRD-DIS-040 — [Roadmap] Bulk Dispute Reassignment: refused for a user without the AP Manager role

- **Why it matters.** The workbook names AP Manager as the user of Bulk Dispute Reassignment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk Dispute Reassignment to reassign multiple disputes at once.
  3. Repeat as an AP Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Manager.
- **Trace.** P3 · manual · `FEAT-DIS-010` · workbook sheet "17. Dispute Management"

#### PRD-DIS-041 — [Roadmap] Dispute-to-Credit/Debit-Note Conversion: happy path for the AP Executive

- **Why it matters.** Removes a manual, error-prone re-entry step between resolution and the financial document. Business use: On resolution, the agreed amount and reason flow directly into a new credit/debit note pre-filled from the dispute case.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup and open Dispute Management.
  2. Use Dispute-to-Credit/Debit-Note Conversion to get what the story asks for: a resolved dispute to convert directly into a credit or debit note.
  3. Follow the business scenario the workbook gives: "On resolution, the agreed amount and reason flow directly into a new credit/debit note pre-filled from the dispute case".
  4. Check the result against the story's promised outcome.
- **Expected.** The AP Executive achieves the story's outcome: they don't have to re-key the agreed adjustment. The business use case is served: on resolution, the agreed amount and reason flow directly into a new credit/debit note pre-filled from the dispute case.
- **Oracle.** Observable proof that Dispute-to-Credit/Debit-Note Conversion did its job for the AP Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-DIS-011.
- **Trace.** P3 · manual · `FEAT-DIS-011` · workbook sheet "17. Dispute Management"

#### PRD-DIS-042 — [Roadmap] Dispute-to-Credit/Debit-Note Conversion: should respect vendor dispute rights before the resulting deduction is locked

- **Why it matters.** The workbook records this edge case for Dispute-to-Credit/Debit-Note Conversion: "Should respect vendor dispute rights before the resulting deduction is locked". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should respect vendor dispute rights before the resulting deduction is locked".
  3. Use Dispute-to-Credit/Debit-Note Conversion to get a resolved dispute to convert directly into a credit or debit note.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Dispute-to-Credit/Debit-Note Conversion behaves as the workbook states: "Should respect vendor dispute rights before the resulting deduction is locked".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-DIS-011 quoting the note.
- **Trace.** P3 · manual · `FEAT-DIS-011` · workbook sheet "17. Dispute Management"

#### PRD-DIS-043 — [Roadmap] Dispute-to-Credit/Debit-Note Conversion: not available on the Growth plan

- **Why it matters.** The workbook limits Dispute-to-Credit/Debit-Note Conversion to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: AP Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as an AP Executive on the lower-plan tenant.
  2. Try it: use Dispute-to-Credit/Debit-Note Conversion to get a resolved dispute to convert directly into a credit or debit note.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-DIS-011` · workbook sheet "17. Dispute Management"

#### PRD-DIS-044 — [Roadmap] Dispute-to-Credit/Debit-Note Conversion: refused for a user without the AP Executive role

- **Why it matters.** The workbook names AP Executive as the user of Dispute-to-Credit/Debit-Note Conversion. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: AP Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dispute-to-Credit/Debit-Note Conversion to get a resolved dispute to convert directly into a credit or debit note.
  3. Repeat as an AP Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the AP Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the AP Executive.
- **Trace.** P3 · manual · `FEAT-DIS-011` · workbook sheet "17. Dispute Management"
