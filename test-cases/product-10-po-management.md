# Product test cases — 10. PO Management (MOD-15)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-15 · 25 features · 82 cases · group `PRD-PO` · plan availability: All Plans · status: GA

Purchase order assembly, configurable PO templates, PO amendment, and ERP PO creation. Convert awards into governed, ERP-aligned purchase orders and keep them synced with SAP.

## 1. Core features

#### PRD-PO-001 — Three-Source PO Assembly: happy path for the Buyer

- **Why it matters.** Single, complete PO from all sources. Business use: At PO creation; data from the PR, the event, and the PO form are combined into one complete PO.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use Three-Source PO Assembly to get what the story asks for: a PO assembled from PR, event, and form data.
  3. Follow the business scenario the workbook gives: "At PO creation; data from the PR, the event, and the PO form are combined into one complete PO".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: generate a complete PO from all sources. The business use case is served: at PO creation; data from the PR, the event, and the PO form are combined into one complete PO.
- **Oracle.** Observable proof that Three-Source PO Assembly did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-001.
- **Trace.** P0 · manual · `FEAT-PO-001` · workbook sheet "10. PO Management"

#### PRD-PO-002 — Three-Source PO Assembly: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Three-Source PO Assembly. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Three-Source PO Assembly to get a PO assembled from PR, event, and form data.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-001` · workbook sheet "10. PO Management"

#### PRD-PO-003 — Configurable PO Form / Template: happy path for the Buyer

- **Why it matters.** ERP-aligned PO creation. Business use: The PO form follows the customer's ERP template; Procol's template fills fields not supplied by PR/event.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use Configurable PO Form / Template to get what the story asks for: the PO form to follow the organisation's ERP template and fill the gaps.
  3. Follow the business scenario the workbook gives: "The PO form follows the customer's ERP template; Procol's template fills fields not supplied by PR/event".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: create ERP-aligned POs. The business use case is served: the PO form follows the customer's ERP template; Procol's template fills fields not supplied by PR/event.
- **Oracle.** Observable proof that Configurable PO Form / Template did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-002.
- **Trace.** P0 · manual · `FEAT-PO-002` · `MOD-11` · workbook sheet "10. PO Management"

#### PRD-PO-004 — Configurable PO Form / Template: per-ERP

- **Why it matters.** The workbook records this edge case for Configurable PO Form / Template: "Per-ERP".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Per-ERP".
  3. Use Configurable PO Form / Template to get the PO form to follow the organisation's ERP template and fill the gaps.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Configurable PO Form / Template behaves as the workbook states: "Per-ERP".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-002` · `MOD-11` · workbook sheet "10. PO Management"

#### PRD-PO-005 — Configurable PO Form / Template: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Configurable PO Form / Template. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable PO Form / Template to get the PO form to follow the organisation's ERP template and fill the gaps.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-002` · `MOD-11` · workbook sheet "10. PO Management"

#### PRD-PO-006 — Award Proposal for Approval: happy path for the Buyer

- **Why it matters.** Governed award authorization. Business use: The award proposal (NFA/NTD) is routed through DoFP approval before PO release.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Route the award proposal (NFA/NTD) through the Delegation of Authority.
  3. Follow the business scenario the workbook gives: "The award proposal (NFA/NTD) is routed through DoFP approval before PO release".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: awards are properly authorized. The business use case is served: the award proposal (NFA/NTD) is routed through DoFP approval before PO release.
- **Oracle.** Observable proof that Award Proposal for Approval did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-003.
- **Trace.** P0 · manual · `FEAT-PO-003` · `MOD-09` · `MOD-16` · workbook sheet "10. PO Management"

#### PRD-PO-007 — Award Proposal for Approval: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Award Proposal for Approval. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Award Proposal for Approval to route the award proposal (NFA/NTD) through the Delegation of Authority.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-003` · `MOD-09` · `MOD-16` · workbook sheet "10. PO Management"

#### PRD-PO-008 — PO Amendment Flow: happy path for the Buyer

- **Why it matters.** Controlled PO changes. Business use: When an issued PO needs changes; a controlled amendment flow with approval is used.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Amend an issued PO through approval.
  3. Follow the business scenario the workbook gives: "When an issued PO needs changes; a controlled amendment flow with approval is used".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: revise POs in a controlled way. The business use case is served: when an issued PO needs changes; a controlled amendment flow with approval is used.
- **Oracle.** Observable proof that PO Amendment Flow did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-004.
- **Trace.** P0 · manual · `FEAT-PO-004` · workbook sheet "10. PO Management"

#### PRD-PO-009 — PO Amendment Flow: not available on the Growth plan

- **Why it matters.** The workbook limits PO Amendment Flow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PO Amendment Flow to amend an issued PO through approval.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-004` · workbook sheet "10. PO Management"

#### PRD-PO-010 — PO Amendment Flow: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PO Amendment Flow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Amendment Flow to amend an issued PO through approval.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-004` · workbook sheet "10. PO Management"

#### PRD-PO-011 — PO Export & Search/Filter: happy path for the Buyer

- **Why it matters.** PO traceability. Business use: Buyers export POs and locate events by PO number; event titles show all linked PO numbers.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Export POs and find events by PO number.
  3. Follow the business scenario the workbook gives: "Buyers export POs and locate events by PO number; event titles show all linked PO numbers".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: POs are traceable. The business use case is served: buyers export POs and locate events by PO number; event titles show all linked PO numbers.
- **Oracle.** Observable proof that PO Export & Search/Filter did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-008.
- **Trace.** P0 · manual · `FEAT-PO-008` · workbook sheet "10. PO Management"

#### PRD-PO-012 — PO Export & Search/Filter: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PO Export & Search/Filter. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Export & Search/Filter to export POs and find events by PO number.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-008` · workbook sheet "10. PO Management"

#### PRD-PO-013 — SAP PO Creation & MQCS Push: happy path for the Buyer

- **Why it matters.** Closes the sourcing-to-ERP loop. Business use: On approval; the PO is created in SAP and the final Master QCS is pushed and attached.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use SAP PO Creation & MQCS Push to get what the story asks for: the PO created in SAP with the MQCS pushed and attached.
  3. Follow the business scenario the workbook gives: "On approval; the PO is created in SAP and the final Master QCS is pushed and attached".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: approved awards provision in the ERP automatically. The business use case is served: on approval; the PO is created in SAP and the final Master QCS is pushed and attached.
- **Oracle.** Observable proof that SAP PO Creation & MQCS Push did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-009.
- **Trace.** P0 · manual · `FEAT-PO-009` · `MOD-11` · workbook sheet "10. PO Management"

#### PRD-PO-014 — SAP PO Creation & MQCS Push: not available on the Growth plan

- **Why it matters.** The workbook limits SAP PO Creation & MQCS Push to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use SAP PO Creation & MQCS Push to get the PO created in SAP with the MQCS pushed and attached.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-009` · `MOD-11` · workbook sheet "10. PO Management"

#### PRD-PO-015 — SAP PO Creation & MQCS Push: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of SAP PO Creation & MQCS Push. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use SAP PO Creation & MQCS Push to get the PO created in SAP with the MQCS pushed and attached.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-009` · `MOD-11` · workbook sheet "10. PO Management"

#### PRD-PO-016 — PO Short Close: happy path for the Buyer

- **Why it matters.** Prevents open POs from sitting perpetually pending in reports and budget locks. Business use: Buyer marks a PO short-closed when a vendor can't fulfill the balance quantity, freeing budget and cleaning up open-PO reports.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Short-close a PO before full quantity/value is consumed.
  3. Follow the business scenario the workbook gives: "Buyer marks a PO short-closed when a vendor can't fulfill the balance quantity, freeing budget and cleaning up open-PO reports".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: residual undelivered qty doesn't keep the PO open indefinitely. The business use case is served: buyer marks a PO short-closed when a vendor can't fulfill the balance quantity, freeing budget and cleaning up open-PO reports.
- **Oracle.** Observable proof that PO Short Close did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-010.
- **Trace.** P0 · manual · `FEAT-PO-010` · workbook sheet "10. PO Management"

#### PRD-PO-017 — PO Short Close: requires a reason code and, optionally, approval before short-close is allowed

- **Why it matters.** The workbook records this edge case for PO Short Close: "Requires a reason code and, optionally, approval before short-close is allowed".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Requires a reason code and, optionally, approval before short-close is allowed".
  3. Use PO Short Close to short-close a PO before full quantity/value is consumed.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PO Short Close behaves as the workbook states: "Requires a reason code and, optionally, approval before short-close is allowed".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-010 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-010` · workbook sheet "10. PO Management"

#### PRD-PO-018 — PO Short Close: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PO Short Close. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Short Close to short-close a PO before full quantity/value is consumed.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-010` · workbook sheet "10. PO Management"

#### PRD-PO-019 — PO Hold: happy path for the Buyer / Approver

- **Why it matters.** Risk control — stops further transactions against a PO under review. Business use: A dispute, compliance flag, or vendor issue triggers a hold; GRN/invoice actions are blocked while active.
- **Setup.**
  Persona: Buyer / Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer / Approver on the tenant described in Setup and open PO Management.
  2. Place a PO on hold.
  3. Follow the business scenario the workbook gives: "A dispute, compliance flag, or vendor issue triggers a hold; GRN/invoice actions are blocked while active".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer / Approver achieves the story's outcome: downstream GRN and invoicing pause until the hold is cleared. The business use case is served: a dispute, compliance flag, or vendor issue triggers a hold; GRN/invoice actions are blocked while active.
- **Oracle.** Observable proof that PO Hold did its job for the Buyer / Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-011.
- **Trace.** P0 · manual · `FEAT-PO-011` · workbook sheet "10. PO Management"

#### PRD-PO-020 — PO Hold: tenant configuration — Auto-release rules and hold-reason taxonomy are configurable

- **Why it matters.** The workbook says "Auto-release rules and hold-reason taxonomy are configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Buyer / Approver (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Auto-release rules and hold-reason taxonomy are configurable") and record its current value.
  2. As the Buyer / Approver: use PO Hold to place a PO on hold.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs PO Hold follows the tenant's configured value, as the workbook states: "Auto-release rules and hold-reason taxonomy are configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-PO-011` · workbook sheet "10. PO Management"

#### PRD-PO-021 — PO Hold: refused for a user without the Buyer / Approver role

- **Why it matters.** The workbook names Buyer / Approver as the user of PO Hold. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer / Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Hold to place a PO on hold.
  3. Repeat as a Buyer / Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer / Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer / Approver.
- **Trace.** P1 · automate-later · `FEAT-PO-011` · workbook sheet "10. PO Management"

#### PRD-PO-022 — PO Cancel: happy path for the Buyer

- **Why it matters.** Governance and auditability of PO lifecycle. Business use: Buyer cancels a PO that is no longer needed; the cancellation and reason are logged.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Cancel a PO.
  3. Follow the business scenario the workbook gives: "Buyer cancels a PO that is no longer needed; the cancellation and reason are logged".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: unwanted or erroneous POs are voided with a full audit trail. The business use case is served: buyer cancels a PO that is no longer needed; the cancellation and reason are logged.
- **Oracle.** Observable proof that PO Cancel did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-012.
- **Trace.** P0 · manual · `FEAT-PO-012` · workbook sheet "10. PO Management"

#### PRD-PO-023 — PO Cancel: cannot cancel a PO once GRN or invoice has been posted against it

- **Why it matters.** The workbook records this edge case for PO Cancel: "Cannot cancel a PO once GRN or invoice has been posted against it".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Cannot cancel a PO once GRN or invoice has been posted against it".
  3. Use PO Cancel to cancel a PO.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PO Cancel behaves as the workbook states: "Cannot cancel a PO once GRN or invoice has been posted against it".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-012 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-012` · workbook sheet "10. PO Management"

#### PRD-PO-024 — PO Cancel: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PO Cancel. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Cancel to cancel a PO.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-012` · workbook sheet "10. PO Management"

#### PRD-PO-025 — Blanket PO: happy path for the Buyer

- **Why it matters.** Reduces repetitive PO creation for recurring, pre-negotiated spend. Business use: Long-term or rate-contract-backed spend is drawn down against one blanket PO via multiple releases.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Raise an open-value/open-quantity blanket PO.
  3. Follow the business scenario the workbook gives: "Long-term or rate-contract-backed spend is drawn down against one blanket PO via multiple releases".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: repeat low-value spend doesn't need a fresh PO every time. The business use case is served: long-term or rate-contract-backed spend is drawn down against one blanket PO via multiple releases.
- **Oracle.** Observable proof that Blanket PO did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-013.
- **Trace.** P0 · manual · `FEAT-PO-013` · workbook sheet "10. PO Management"

#### PRD-PO-026 — Blanket PO: tenant configuration — Validity period, max release value, and expiry alerts are configurable

- **Why it matters.** The workbook says "Validity period, max release value, and expiry alerts are configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Buyer (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Validity period, max release value, and expiry alerts are configurable") and record its current value.
  2. As the Buyer: use Blanket PO to raise an open-value/open-quantity blanket PO.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Blanket PO follows the tenant's configured value, as the workbook states: "Validity period, max release value, and expiry alerts are configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-PO-013` · workbook sheet "10. PO Management"

#### PRD-PO-027 — Blanket PO: not available on the Growth plan

- **Why it matters.** The workbook limits Blanket PO to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Blanket PO to raise an open-value/open-quantity blanket PO.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-013` · workbook sheet "10. PO Management"

#### PRD-PO-028 — Blanket PO: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Blanket PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Blanket PO to raise an open-value/open-quantity blanket PO.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-013` · workbook sheet "10. PO Management"

#### PRD-PO-029 — Service PO: happy path for the Buyer

- **Why it matters.** Accommodates non-material procurement correctly. Business use: Used for AMC, consulting, manpower and other non-material spend where receipt is service-based, not goods-based.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Raise a service PO.
  3. Follow the business scenario the workbook gives: "Used for AMC, consulting, manpower and other non-material spend where receipt is service-based, not goods-based".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: service categories are procured against Service Entry Sheets instead of physical GRN. The business use case is served: used for AMC, consulting, manpower and other non-material spend where receipt is service-based, not goods-based.
- **Oracle.** Observable proof that Service PO did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-014.
- **Trace.** P0 · manual · `FEAT-PO-014` · workbook sheet "10. PO Management"

#### PRD-PO-030 — Service PO: service Entry Sheet approval substitutes for GRN in the match cycle

- **Why it matters.** The workbook records this edge case for Service PO: "Service Entry Sheet approval substitutes for GRN in the match cycle".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Service Entry Sheet approval substitutes for GRN in the match cycle".
  3. Use Service PO to raise a service PO.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Service PO behaves as the workbook states: "Service Entry Sheet approval substitutes for GRN in the match cycle".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-014 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-014` · workbook sheet "10. PO Management"

#### PRD-PO-031 — Service PO: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Service PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Service PO to raise a service PO.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-014` · workbook sheet "10. PO Management"

#### PRD-PO-032 — Accruals: happy path for the Finance Controller

- **Why it matters.** Accurate financial close without manual accrual workbooks. Business use: Accrual report is generated automatically from the GRN-minus-Invoice gap, by cost center and GL code.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open PO Management.
  2. Use Accruals to get what the story asks for: the system to compute accrual liability for received-but-not-invoiced value.
  3. Follow the business scenario the workbook gives: "Accrual report is generated automatically from the GRN-minus-Invoice gap, by cost center and GL code".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: month-end close is accurate. The business use case is served: accrual report is generated automatically from the GRN-minus-Invoice gap, by cost center and GL code.
- **Oracle.** Observable proof that Accruals did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-016.
- **Trace.** P0 · manual · `FEAT-PO-016` · workbook sheet "10. PO Management"

#### PRD-PO-033 — Accruals: currency and tax treatment are handled within the accrual calculation

- **Why it matters.** The workbook records this edge case for Accruals: "Currency and tax treatment are handled within the accrual calculation".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Currency and tax treatment are handled within the accrual calculation".
  3. Use Accruals to get the system to compute accrual liability for received-but-not-invoiced value.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Accruals behaves as the workbook states: "Currency and tax treatment are handled within the accrual calculation".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-016 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-016` · workbook sheet "10. PO Management"

#### PRD-PO-034 — Accruals: not available on the Growth plan

- **Why it matters.** The workbook limits Accruals to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Accruals to get the system to compute accrual liability for received-but-not-invoiced value.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-016` · workbook sheet "10. PO Management"

#### PRD-PO-035 — Accruals: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Accruals. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Accruals to get the system to compute accrual liability for received-but-not-invoiced value.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-PO-016` · workbook sheet "10. PO Management"

#### PRD-PO-036 — PO Consumption Tracking: happy path for the Buyer / Finance

- **Why it matters.** Prevents over-delivery and over-billing against a PO. Business use: A live consumption view sits on top of every PO, updated by GRN and invoice postings.
- **Setup.**
  Persona: Buyer / Finance.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer / Finance on the tenant described in Setup and open PO Management.
  2. See consumed vs. remaining PO quantity and value.
  3. Follow the business scenario the workbook gives: "A live consumption view sits on top of every PO, updated by GRN and invoice postings".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer / Finance achieves the story's outcome: they know how much of a blanket/service PO is left. The business use case is served: a live consumption view sits on top of every PO, updated by GRN and invoice postings.
- **Oracle.** Observable proof that PO Consumption Tracking did its job for the Buyer / Finance — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-017.
- **Trace.** P0 · manual · `FEAT-PO-017` · workbook sheet "10. PO Management"

#### PRD-PO-037 — PO Consumption Tracking: handles partial GRNs and multi-invoice splits against a single PO line

- **Why it matters.** The workbook records this edge case for PO Consumption Tracking: "Handles partial GRNs and multi-invoice splits against a single PO line".
- **Setup.**
  Persona: Buyer / Finance.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer / Finance on the tenant described in Setup.
  2. Set up the situation the note describes: "Handles partial GRNs and multi-invoice splits against a single PO line".
  3. Use PO Consumption Tracking to see consumed vs. remaining PO quantity and value.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PO Consumption Tracking behaves as the workbook states: "Handles partial GRNs and multi-invoice splits against a single PO line".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-017 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-017` · workbook sheet "10. PO Management"

#### PRD-PO-038 — PO Consumption Tracking: refused for a user without the Buyer / Finance role

- **Why it matters.** The workbook names Buyer / Finance as the user of PO Consumption Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer / Finance.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Consumption Tracking to see consumed vs. remaining PO quantity and value.
  3. Repeat as a Buyer / Finance.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer / Finance can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer / Finance.
- **Trace.** P1 · automate-later · `FEAT-PO-017` · workbook sheet "10. PO Management"

#### PRD-PO-039 — PO Dispatch & Vendor Notification Log: happy path for the Buyer

- **Why it matters.** Formal dispatch with an audit trail of vendor notification. Business use: On approval, the PO PDF is emailed to the vendor's registered contact and the send/open status is logged.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use PO Dispatch & Vendor Notification Log to get what the story asks for: the signed PO PDF auto-emailed to the vendor with a delivery log.
  3. Follow the business scenario the workbook gives: "On approval, the PO PDF is emailed to the vendor's registered contact and the send/open status is logged".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: dispatch is formal and traceable. The business use case is served: on approval, the PO PDF is emailed to the vendor's registered contact and the send/open status is logged.
- **Oracle.** Observable proof that PO Dispatch & Vendor Notification Log did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-024.
- **Trace.** P0 · manual · `FEAT-PO-024` · workbook sheet "10. PO Management"

#### PRD-PO-040 — PO Dispatch & Vendor Notification Log: bounce-back or undelivered notifications should re-alert the buyer

- **Why it matters.** The workbook records this edge case for PO Dispatch & Vendor Notification Log: "Bounce-back or undelivered notifications should re-alert the buyer".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Bounce-back or undelivered notifications should re-alert the buyer".
  3. Use PO Dispatch & Vendor Notification Log to get the signed PO PDF auto-emailed to the vendor with a delivery log.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PO Dispatch & Vendor Notification Log behaves as the workbook states: "Bounce-back or undelivered notifications should re-alert the buyer".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-024 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-024` · workbook sheet "10. PO Management"

#### PRD-PO-041 — PO Dispatch & Vendor Notification Log: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PO Dispatch & Vendor Notification Log. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Dispatch & Vendor Notification Log to get the signed PO PDF auto-emailed to the vendor with a delivery log.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-024` · workbook sheet "10. PO Management"

#### PRD-PO-042 — Multiple invoice and GRN against 1 PO: happy path for the Buyer

- **Why it matters.** To support batch deliveries.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Carry out what the user story describes: "As a buyer, I receive multiple deliveries against a PO and hence multiple invoices and GRN".
  3. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: as a buyer, I receive multiple deliveries against a PO and hence multiple invoices and GRN.
- **Oracle.** Observable proof that Multiple invoice and GRN against 1 PO did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-025.
- **Trace.** P0 · manual · `FEAT-PO-025` · workbook sheet "10. PO Management"

#### PRD-PO-043 — Multiple invoice and GRN against 1 PO: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multiple invoice and GRN against 1 PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multiple invoice and GRN against 1 PO as the user story describes ("As a buyer, I receive multiple deliveries against a PO and hence multiple invoices and GRN").
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-025` · workbook sheet "10. PO Management"

## 2. Optional features

#### PRD-PO-044 — PO Award Tolerance Validation: happy path for the Finance Controller

- **Why it matters.** Spend control at PO. Business use: At award/PO; the amount is validated against the sanctioned limit and tolerance, flagging overages.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open PO Management.
  2. Use PO Award Tolerance Validation to get what the story asks for: award amounts validated against the approved limit.
  3. Follow the business scenario the workbook gives: "At award/PO; the amount is validated against the sanctioned limit and tolerance, flagging overages".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: prevent overspend at the PO stage. The business use case is served: at award/PO; the amount is validated against the sanctioned limit and tolerance, flagging overages.
- **Oracle.** Observable proof that PO Award Tolerance Validation did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-005.
- **Trace.** P0 · manual · `FEAT-PO-005` · workbook sheet "10. PO Management"

#### PRD-PO-045 — PO Award Tolerance Validation: not available on the Growth plan

- **Why it matters.** The workbook limits PO Award Tolerance Validation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use PO Award Tolerance Validation to get award amounts validated against the approved limit.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-005` · workbook sheet "10. PO Management"

#### PRD-PO-046 — PO Award Tolerance Validation: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of PO Award Tolerance Validation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO Award Tolerance Validation to get award amounts validated against the approved limit.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-PO-005` · workbook sheet "10. PO Management"

#### PRD-PO-047 — Multiple PO Split: happy path for the Buyer

- **Why it matters.** Delivery/batch flexibility. Business use: One award is split into multiple POs for the same product/location/vendor to suit delivery or batches.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Split one award into multiple POs.
  3. Follow the business scenario the workbook gives: "One award is split into multiple POs for the same product/location/vendor to suit delivery or batches".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: handle delivery and batch needs. The business use case is served: one award is split into multiple POs for the same product/location/vendor to suit delivery or batches.
- **Oracle.** Observable proof that Multiple PO Split did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-006.
- **Trace.** P0 · manual · `FEAT-PO-006` · workbook sheet "10. PO Management"

#### PRD-PO-048 — Multiple PO Split: not available on the Growth plan

- **Why it matters.** The workbook limits Multiple PO Split to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Multiple PO Split to split one award into multiple POs.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-006` · workbook sheet "10. PO Management"

#### PRD-PO-049 — Multiple PO Split: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multiple PO Split. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multiple PO Split to split one award into multiple POs.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-006` · workbook sheet "10. PO Management"

#### PRD-PO-050 — PO History Prefill: happy path for the Buyer

- **Why it matters.** Faster PO creation. Business use: The PO form is pre-filled from the most recent PO and edited as needed.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use PO History Prefill to get what the story asks for: the PO form prefilled from the last PO.
  3. Follow the business scenario the workbook gives: "The PO form is pre-filled from the most recent PO and edited as needed".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: create POs faster. The business use case is served: the PO form is pre-filled from the most recent PO and edited as needed.
- **Oracle.** Observable proof that PO History Prefill did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-007.
- **Trace.** P0 · manual · `FEAT-PO-007` · workbook sheet "10. PO Management"

#### PRD-PO-051 — PO History Prefill: not available on plans below Growth

- **Why it matters.** The workbook limits PO History Prefill to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PO History Prefill to get the PO form prefilled from the last PO.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PO-007` · workbook sheet "10. PO Management"

#### PRD-PO-052 — PO History Prefill: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PO History Prefill. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PO History Prefill to get the PO form prefilled from the last PO.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-007` · workbook sheet "10. PO Management"

#### PRD-PO-053 — Recurring PO: happy path for the Buyer

- **Why it matters.** Eliminates manual, repetitive PO creation. Business use: Recurring monthly rent, subscription, or AMC POs are auto-created on schedule.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use Recurring PO to get what the story asks for: POs to auto-generate on a defined schedule.
  3. Follow the business scenario the workbook gives: "Recurring monthly rent, subscription, or AMC POs are auto-created on schedule".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: they don't manually recreate the same PO every period. The business use case is served: recurring monthly rent, subscription, or AMC POs are auto-created on schedule.
- **Oracle.** Observable proof that Recurring PO did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-015.
- **Trace.** P0 · manual · `FEAT-PO-015` · workbook sheet "10. PO Management"

#### PRD-PO-054 — Recurring PO: schedule has an end date

- **Why it matters.** The workbook records this edge case for Recurring PO: "Schedule has an end date".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Schedule has an end date".
  3. Use Recurring PO to get POs to auto-generate on a defined schedule.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Recurring PO behaves as the workbook states: "Schedule has an end date".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-015 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-015` · workbook sheet "10. PO Management"

#### PRD-PO-055 — Recurring PO: failed auto-creation escalates to the buyer

- **Why it matters.** The workbook records this edge case for Recurring PO: "failed auto-creation escalates to the buyer".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "failed auto-creation escalates to the buyer".
  3. Use Recurring PO to get POs to auto-generate on a defined schedule.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Recurring PO behaves as the workbook states: "failed auto-creation escalates to the buyer".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-015 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-015` · workbook sheet "10. PO Management"

#### PRD-PO-056 — Recurring PO: not available on the Growth plan

- **Why it matters.** The workbook limits Recurring PO to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Recurring PO to get POs to auto-generate on a defined schedule.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-015` · workbook sheet "10. PO Management"

#### PRD-PO-057 — Recurring PO: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Recurring PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Recurring PO to get POs to auto-generate on a defined schedule.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-015` · workbook sheet "10. PO Management"

#### PRD-PO-058 — Vendor PO Acknowledgment: happy path for the Vendor

- **Why it matters.** Reduces PO disputes discovered only at delivery. Business use: Vendor confirms qty/price/date on the vendor portal before work begins; disagreements are flagged back to the buyer.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open PO Management.
  2. Accept or flag a PO with a committed delivery date via the portal.
  3. Follow the business scenario the workbook gives: "Vendor confirms qty/price/date on the vendor portal before work begins; disagreements are flagged back to the buyer".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: expectations are aligned before fulfillment starts. The business use case is served: vendor confirms qty/price/date on the vendor portal before work begins; disagreements are flagged back to the buyer.
- **Oracle.** Observable proof that Vendor PO Acknowledgment did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-019.
- **Trace.** P0 · manual · `FEAT-PO-019` · workbook sheet "10. PO Management"

#### PRD-PO-059 — Vendor PO Acknowledgment: auto-escalation to buyer if vendor doesn't respond within SLA

- **Why it matters.** The workbook records this edge case for Vendor PO Acknowledgment: "Auto-escalation to buyer if vendor doesn't respond within SLA".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Auto-escalation to buyer if vendor doesn't respond within SLA".
  3. Use Vendor PO Acknowledgment to accept or flag a PO with a committed delivery date via the portal.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor PO Acknowledgment behaves as the workbook states: "Auto-escalation to buyer if vendor doesn't respond within SLA".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-019 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-019` · workbook sheet "10. PO Management"

#### PRD-PO-060 — Vendor PO Acknowledgment: not available on plans below Growth

- **Why it matters.** The workbook limits Vendor PO Acknowledgment to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Vendor PO Acknowledgment to accept or flag a PO with a committed delivery date via the portal.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PO-019` · workbook sheet "10. PO Management"

#### PRD-PO-061 — Vendor PO Acknowledgment: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor PO Acknowledgment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor PO Acknowledgment to accept or flag a PO with a committed delivery date via the portal.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-PO-019` · workbook sheet "10. PO Management"

#### PRD-PO-062 — Bulk PO Creation / Upload: happy path for the Buyer

- **Why it matters.** Efficiency at scale for high-volume, low-complexity categories. Business use: Buyer uploads a spreadsheet of PO lines; the system validates and creates POs in bulk with an error report for failed rows.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Create multiple POs via a bulk upload template.
  3. Follow the business scenario the workbook gives: "Buyer uploads a spreadsheet of PO lines; the system validates and creates POs in bulk with an error report for failed rows".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: high-volume categories aren't created one at a time. The business use case is served: buyer uploads a spreadsheet of PO lines; the system validates and creates POs in bulk with an error report for failed rows.
- **Oracle.** Observable proof that Bulk PO Creation / Upload did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-023.
- **Trace.** P0 · manual · `FEAT-PO-023` · workbook sheet "10. PO Management"

#### PRD-PO-063 — Bulk PO Creation / Upload: failed rows return a downloadable error report, not a silent partial failure

- **Why it matters.** The workbook records this edge case for Bulk PO Creation / Upload: "Failed rows return a downloadable error report, not a silent partial failure".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Failed rows return a downloadable error report, not a silent partial failure".
  3. Use Bulk PO Creation / Upload to create multiple POs via a bulk upload template.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Bulk PO Creation / Upload behaves as the workbook states: "Failed rows return a downloadable error report, not a silent partial failure".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-023 quoting the note.
- **Trace.** P2 · manual · `FEAT-PO-023` · workbook sheet "10. PO Management"

#### PRD-PO-064 — Bulk PO Creation / Upload: not available on the Growth plan

- **Why it matters.** The workbook limits Bulk PO Creation / Upload to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Bulk PO Creation / Upload to create multiple POs via a bulk upload template.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PO-023` · workbook sheet "10. PO Management"

#### PRD-PO-065 — Bulk PO Creation / Upload: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Bulk PO Creation / Upload. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk PO Creation / Upload to create multiple POs via a bulk upload template.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PO-023` · workbook sheet "10. PO Management"

## 3. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-PO-066 — [Roadmap] Multi-Currency PO: happy path for the Buyer

- **Why it matters.** Accurate books for international procurement. Business use: Cross-border vendor POs are issued in foreign currency and converted to base currency for reporting.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Raise a PO in the vendor's transaction currency with automatic FX conversion.
  3. Follow the business scenario the workbook gives: "Cross-border vendor POs are issued in foreign currency and converted to base currency for reporting".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: international POs book correctly. The business use case is served: cross-border vendor POs are issued in foreign currency and converted to base currency for reporting.
- **Oracle.** Observable proof that Multi-Currency PO did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-018.
- **Trace.** P3 · manual · `FEAT-PO-018` · workbook sheet "10. PO Management"

#### PRD-PO-067 — [Roadmap] Multi-Currency PO: FX rate source and rate-lock date (PO date vs. invoice date) need definition

- **Why it matters.** The workbook records this edge case for Multi-Currency PO: "FX rate source and rate-lock date (PO date vs. invoice date) need definition".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "FX rate source and rate-lock date (PO date vs. invoice date) need definition".
  3. Use Multi-Currency PO to raise a PO in the vendor's transaction currency with automatic FX conversion.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Multi-Currency PO behaves as the workbook states: "FX rate source and rate-lock date (PO date vs. invoice date) need definition".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-018 quoting the note.
- **Trace.** P3 · manual · `FEAT-PO-018` · workbook sheet "10. PO Management"

#### PRD-PO-068 — [Roadmap] Multi-Currency PO: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Currency PO to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Multi-Currency PO to raise a PO in the vendor's transaction currency with automatic FX conversion.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PO-018` · workbook sheet "10. PO Management"

#### PRD-PO-069 — [Roadmap] Multi-Currency PO: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multi-Currency PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Currency PO to raise a PO in the vendor's transaction currency with automatic FX conversion.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P3 · manual · `FEAT-PO-018` · workbook sheet "10. PO Management"

#### PRD-PO-070 — [Roadmap] Rate-Contract-Backed PO Pricing: happy path for the Buyer

- **Why it matters.** Pricing governance and contract compliance; snapshot preserves what was actually approved. Business use: At PO creation, price/vendor fields fetched from the contract are locked as a snapshot of what was matched at that point.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Use Rate-Contract-Backed PO Pricing to get what the story asks for: PO price and terms to auto-populate from the linked rate contract.
  3. Follow the business scenario the workbook gives: "At PO creation, price/vendor fields fetched from the contract are locked as a snapshot of what was matched at that point".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: they can't accidentally issue an off-contract price. The business use case is served: at PO creation, price/vendor fields fetched from the contract are locked as a snapshot of what was matched at that point.
- **Oracle.** Observable proof that Rate-Contract-Backed PO Pricing did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-020.
- **Trace.** P3 · manual · `FEAT-PO-020` · workbook sheet "10. PO Management"

#### PRD-PO-071 — [Roadmap] Rate-Contract-Backed PO Pricing: fetched fields are read-only after commitment

- **Why it matters.** The workbook records this edge case for Rate-Contract-Backed PO Pricing: "Fetched fields are read-only after commitment".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Fetched fields are read-only after commitment".
  3. Use Rate-Contract-Backed PO Pricing to get PO price and terms to auto-populate from the linked rate contract.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Rate-Contract-Backed PO Pricing behaves as the workbook states: "Fetched fields are read-only after commitment".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-020 quoting the note.
- **Trace.** P3 · manual · `FEAT-PO-020` · workbook sheet "10. PO Management"

#### PRD-PO-072 — [Roadmap] Rate-Contract-Backed PO Pricing: corrections go through PO amendment, not a silent edit

- **Why it matters.** The workbook records this edge case for Rate-Contract-Backed PO Pricing: "corrections go through PO amendment, not a silent edit".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "corrections go through PO amendment, not a silent edit".
  3. Use Rate-Contract-Backed PO Pricing to get PO price and terms to auto-populate from the linked rate contract.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Rate-Contract-Backed PO Pricing behaves as the workbook states: "corrections go through PO amendment, not a silent edit".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-020 quoting the note.
- **Trace.** P3 · manual · `FEAT-PO-020` · workbook sheet "10. PO Management"

#### PRD-PO-073 — [Roadmap] Rate-Contract-Backed PO Pricing: not available on the Growth plan

- **Why it matters.** The workbook limits Rate-Contract-Backed PO Pricing to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Rate-Contract-Backed PO Pricing to get PO price and terms to auto-populate from the linked rate contract.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PO-020` · workbook sheet "10. PO Management"

#### PRD-PO-074 — [Roadmap] Rate-Contract-Backed PO Pricing: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Rate-Contract-Backed PO Pricing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Rate-Contract-Backed PO Pricing to get PO price and terms to auto-populate from the linked rate contract.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P3 · manual · `FEAT-PO-020` · workbook sheet "10. PO Management"

#### PRD-PO-075 — [Roadmap] Budget Check at PO Gate: happy path for the Buyer / Finance

- **Why it matters.** Spend control at the point of commitment, not after the fact. Business use: PO release is soft-blocked or hard-blocked if the mapped cost center/budget line is insufficient.
- **Setup.**
  Persona: Buyer / Finance.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Finance on the tenant described in Setup and open PO Management.
  2. Use Budget Check at PO Gate to get what the story asks for: available budget validated before a PO is released.
  3. Follow the business scenario the workbook gives: "PO release is soft-blocked or hard-blocked if the mapped cost center/budget line is insufficient".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer / Finance achieves the story's outcome: we can't commit spend beyond sanction. The business use case is served: PO release is soft-blocked or hard-blocked if the mapped cost center/budget line is insufficient.
- **Oracle.** Observable proof that Budget Check at PO Gate did its job for the Buyer / Finance — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-021.
- **Trace.** P3 · manual · `FEAT-PO-021` · workbook sheet "10. PO Management"

#### PRD-PO-076 — [Roadmap] Budget Check at PO Gate: tenant configuration — Soft-block (warn + override with approval) vs. hard-block is configurable

- **Why it matters.** The workbook says "Soft-block (warn + override with approval) vs. hard-block is configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Buyer / Finance (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Soft-block (warn + override with approval) vs. hard-block is configurable") and record its current value.
  2. As the Buyer / Finance: use Budget Check at PO Gate to get available budget validated before a PO is released.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Budget Check at PO Gate follows the tenant's configured value, as the workbook states: "Soft-block (warn + override with approval) vs. hard-block is configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-PO-021` · workbook sheet "10. PO Management"

#### PRD-PO-077 — [Roadmap] Budget Check at PO Gate: not available on the Growth plan

- **Why it matters.** The workbook limits Budget Check at PO Gate to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer / Finance.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Finance on the lower-plan tenant.
  2. Try it: use Budget Check at PO Gate to get available budget validated before a PO is released.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PO-021` · workbook sheet "10. PO Management"

#### PRD-PO-078 — [Roadmap] Budget Check at PO Gate: refused for a user without the Buyer / Finance role

- **Why it matters.** The workbook names Buyer / Finance as the user of Budget Check at PO Gate. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer / Finance.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget Check at PO Gate to get available budget validated before a PO is released.
  3. Repeat as a Buyer / Finance.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer / Finance can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer / Finance.
- **Trace.** P3 · manual · `FEAT-PO-021` · workbook sheet "10. PO Management"

#### PRD-PO-079 — [Roadmap] Delivery Schedule Lines: happy path for the Buyer

- **Why it matters.** Matches real-world staggered delivery cadence. Business use: A single PO line ships in tranches (e.g., 40% now, 60% in 30 days) with GRN validated per schedule line.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open PO Management.
  2. Define multiple delivery dates/quantities within one PO line.
  3. Follow the business scenario the workbook gives: "A single PO line ships in tranches (e.g., 40% now, 60% in 30 days) with GRN validated per schedule line".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: staggered deliveries don't need separate POs. The business use case is served: a single PO line ships in tranches (e.g., 40% now, 60% in 30 days) with GRN validated per schedule line.
- **Oracle.** Observable proof that Delivery Schedule Lines did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PO-022.
- **Trace.** P3 · manual · `FEAT-PO-022` · workbook sheet "10. PO Management"

#### PRD-PO-080 — [Roadmap] Delivery Schedule Lines: GRN must validate against the schedule line, not just the overall PO line

- **Why it matters.** The workbook records this edge case for Delivery Schedule Lines: "GRN must validate against the schedule line, not just the overall PO line".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "GRN must validate against the schedule line, not just the overall PO line".
  3. Use Delivery Schedule Lines to define multiple delivery dates/quantities within one PO line.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Delivery Schedule Lines behaves as the workbook states: "GRN must validate against the schedule line, not just the overall PO line".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PO-022 quoting the note.
- **Trace.** P3 · manual · `FEAT-PO-022` · workbook sheet "10. PO Management"

#### PRD-PO-081 — [Roadmap] Delivery Schedule Lines: not available on the Growth plan

- **Why it matters.** The workbook limits Delivery Schedule Lines to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Delivery Schedule Lines to define multiple delivery dates/quantities within one PO line.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-PO-022` · workbook sheet "10. PO Management"

#### PRD-PO-082 — [Roadmap] Delivery Schedule Lines: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Delivery Schedule Lines. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Delivery Schedule Lines to define multiple delivery dates/quantities within one PO line.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P3 · manual · `FEAT-PO-022` · workbook sheet "10. PO Management"
