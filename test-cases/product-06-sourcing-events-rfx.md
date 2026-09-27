# Product test cases — 06. Sourcing Events (RFX) (MOD-14)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-14 · 30 features · 77 cases · group `PRD-RFX` · plan availability: All Plans · status: GA

Orchestration of multi-stage sourcing events (technical, RFQ, auction) as a single auditable project. Provide a unified sourcing-event layer that composes technical, RFQ, and auction stages over PR or standalone demand.

## 1. Core features

#### PRD-RFX-001 — RFX Project Creation: happy path for the Buyer

- **Why it matters.** Unified, auditable multi-stage sourcing. Business use: Buyer launches a sourcing project composing technical, RFQ, and auction stages over selected demand.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Create a sourcing project composed of technical, RFQ, and auction stages.
  3. Follow the business scenario the workbook gives: "Buyer launches a sourcing project composing technical, RFQ, and auction stages over selected demand".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: run structured multi-stage sourcing. The business use case is served: buyer launches a sourcing project composing technical, RFQ, and auction stages over selected demand.
- **Oracle.** Observable proof that RFX Project Creation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-001.
- **Trace.** P0 · manual · `FEAT-RFX-001` · `MOD-03` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-002 — RFX Project Creation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of RFX Project Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use RFX Project Creation to create a sourcing project composed of technical, RFQ, and auction stages.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-001` · `MOD-03` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-003 — Two Entry Routes: happy path for the Buyer

- **Why it matters.** Flexible event origination. Business use: The event is started from open PR lines (single or across PRs) or as a standalone RFX.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Start an event from PR lines or as a standalone RFX.
  3. Follow the business scenario the workbook gives: "The event is started from open PR lines (single or across PRs) or as a standalone RFX".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: source from ERP demand or ad-hoc needs. The business use case is served: the event is started from open PR lines (single or across PRs) or as a standalone RFX.
- **Oracle.** Observable proof that Two Entry Routes did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-002.
- **Trace.** P0 · manual · `FEAT-RFX-002` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-004 — Two Entry Routes: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Two Entry Routes. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Two Entry Routes to start an event from PR lines or as a standalone RFX.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-002` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-005 — Cart View (PR Route): happy path for the Buyer

- **Why it matters.** Scope review prevents over-sourcing. Business use: Coming from PRs; the buyer reviews a cart of selected lines (delete/reduce qty) before configuring.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Cart View (PR Route) to get what the story asks for: a cart of selected PR lines with delete and quantity-reduce.
  3. Follow the business scenario the workbook gives: "Coming from PRs; the buyer reviews a cart of selected lines (delete/reduce qty) before configuring".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: finalize scope before configuring the event. The business use case is served: coming from PRs; the buyer reviews a cart of selected lines (delete/reduce qty) before configuring.
- **Oracle.** Observable proof that Cart View (PR Route) did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-003.
- **Trace.** P0 · manual · `FEAT-RFX-003` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-006 — Cart View (PR Route): refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Cart View (PR Route). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Cart View (PR Route) to get a cart of selected PR lines with delete and quantity-reduce.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-003` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-007 — Stage Selection and Configuration: happy path for the Buyer

- **Why it matters.** Right-sized events per category. Business use: On the configuration screen; the buyer chooses and sets up each stage of the event.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Choose and configure each stage.
  3. Follow the business scenario the workbook gives: "On the configuration screen; the buyer chooses and sets up each stage of the event".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: right-size the event to the sourcing need. The business use case is served: on the configuration screen; the buyer chooses and sets up each stage of the event.
- **Oracle.** Observable proof that Stage Selection and Configuration did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-004.
- **Trace.** P0 · manual · `FEAT-RFX-004` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-008 — Stage Selection and Configuration: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Stage Selection and Configuration. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Stage Selection and Configuration to choose and configure each stage.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-004` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-009 — Parallel/Sequential Flow and Scheduling: happy path for the Buyer

- **Why it matters.** Flexible event timing and gating. Business use: Buyer schedules stages and runs technical and RFQ in parallel or sequentially (technical-gated).
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Run stages in parallel or sequence and schedule each.
  3. Follow the business scenario the workbook gives: "Buyer schedules stages and runs technical and RFQ in parallel or sequentially (technical-gated)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: balance speed against gated evaluation. The business use case is served: buyer schedules stages and runs technical and RFQ in parallel or sequentially (technical-gated).
- **Oracle.** Observable proof that Parallel/Sequential Flow and Scheduling did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-005.
- **Trace.** P0 · manual · `FEAT-RFX-005` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-010 — Parallel/Sequential Flow and Scheduling: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Parallel/Sequential Flow and Scheduling. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Parallel/Sequential Flow and Scheduling to run stages in parallel or sequence and schedule each.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-005` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-011 — Terms and Conditions: happy path for the Buyer

- **Why it matters.** Consistent, enforceable terms. Business use: Buyer attaches default or custom T&Cs at project or stage level before floating.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  Context from the workbook: Defaults set in MOD-10.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Attach default or custom T&Cs at project or stage level.
  3. Follow the business scenario the workbook gives: "Buyer attaches default or custom T&Cs at project or stage level before floating".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: consistent terms apply to every event. The business use case is served: buyer attaches default or custom T&Cs at project or stage level before floating.
- **Oracle.** Observable proof that Terms and Conditions did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-006.
- **Trace.** P0 · manual · `FEAT-RFX-006` · `MOD-10` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-012 — Terms and Conditions: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Terms and Conditions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Terms and Conditions to attach default or custom T&Cs at project or stage level.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-006` · `MOD-10` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-013 — Vendor Invitation and Auto-Suggestion: happy path for the Buyer

- **Why it matters.** Faster, data-driven vendor selection. Business use: At vendor selection; Procol suggests vendors from PO history/AVL/recommendations/Clara and the buyer adjusts the list.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  Context from the workbook: Pulls from MOD-01 AVLs.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Vendor Invitation and Auto-Suggestion to get what the story asks for: vendors auto-suggested by category from PO, AVL, and Clara sources.
  3. Follow the business scenario the workbook gives: "At vendor selection; Procol suggests vendors from PO history/AVL/recommendations/Clara and the buyer adjusts the list".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: assemble the bidder list quickly. The business use case is served: at vendor selection; Procol suggests vendors from PO history/AVL/recommendations/Clara and the buyer adjusts the list.
- **Oracle.** Observable proof that Vendor Invitation and Auto-Suggestion did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-007.
- **Trace.** P0 · manual · `FEAT-RFX-007` · `MOD-01` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-014 — Vendor Invitation and Auto-Suggestion: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Vendor Invitation and Auto-Suggestion. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Invitation and Auto-Suggestion to get vendors auto-suggested by category from PO, AVL, and Clara sources.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-007` · `MOD-01` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-015 — Participation Consent and Decline Capture: happy path for the Buyer

- **Why it matters.** Visibility into vendor engagement. Business use: Invited vendors record participate or decline; declines capture a configurable reason.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Participation Consent and Decline Capture to get what the story asks for: vendors to record participate or decline with a reason.
  3. Follow the business scenario the workbook gives: "Invited vendors record participate or decline; declines capture a configurable reason".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: see engagement and why suppliers opt out. The business use case is served: invited vendors record participate or decline; declines capture a configurable reason.
- **Oracle.** Observable proof that Participation Consent and Decline Capture did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-009.
- **Trace.** P0 · manual · `FEAT-RFX-009` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-016 — Participation Consent and Decline Capture: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Participation Consent and Decline Capture. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Participation Consent and Decline Capture to get vendors to record participate or decline with a reason.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-009` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-017 — Multi-Channel Invitation and Reminders: happy path for the Buyer

- **Why it matters.** Timely nudges improve response rates. Business use: On publish and during the window; vendors are notified and reminded across email/WhatsApp/SMS at set intervals.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Multi-Channel Invitation and Reminders to get what the story asks for: vendors notified across channels with automated reminders.
  3. Follow the business scenario the workbook gives: "On publish and during the window; vendors are notified and reminded across email/WhatsApp/SMS at set intervals".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: maximize participation. The business use case is served: on publish and during the window; vendors are notified and reminded across email/WhatsApp/SMS at set intervals.
- **Oracle.** Observable proof that Multi-Channel Invitation and Reminders did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-010.
- **Trace.** P0 · manual · `FEAT-RFX-010` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-018 — Multi-Channel Invitation and Reminders: tenant configuration — Intervals configurable

- **Why it matters.** The workbook says "Intervals configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Buyer (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Intervals configurable") and record its current value.
  2. As the Buyer: use Multi-Channel Invitation and Reminders to get vendors notified across channels with automated reminders.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Multi-Channel Invitation and Reminders follows the tenant's configured value, as the workbook states: "Intervals configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-RFX-010` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-019 — Multi-Channel Invitation and Reminders: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multi-Channel Invitation and Reminders. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Channel Invitation and Reminders to get vendors notified across channels with automated reminders.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-010` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-020 — Embedded Communication Module: happy path for the Buyer

- **Why it matters.** Auditable, segregated Q&A. Business use: Within the event; vendors, buyers, and evaluators exchange general/commercial/technical queries under confidentiality rules.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Embedded Communication Module to get what the story asks for: an in-event query system with type-based routing and confidentiality.
  3. Follow the business scenario the workbook gives: "Within the event; vendors, buyers, and evaluators exchange general/commercial/technical queries under confidentiality rules".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: clarifications stay in context and auditable. The business use case is served: within the event; vendors, buyers, and evaluators exchange general/commercial/technical queries under confidentiality rules.
- **Oracle.** Observable proof that Embedded Communication Module did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-011.
- **Trace.** P0 · manual · `FEAT-RFX-011` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-021 — Embedded Communication Module: commercial queries hidden from evaluators/requisitioners

- **Why it matters.** The workbook records this access rule for Embedded Communication Module: "Commercial queries hidden from evaluators/requisitioners".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Commercial queries hidden from evaluators/requisitioners".
  3. Use Embedded Communication Module to get an in-event query system with type-based routing and confidentiality.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Embedded Communication Module behaves as the workbook states: "Commercial queries hidden from evaluators/requisitioners".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-RFX-011 quoting the note.
- **Trace.** P1 · automate-later · `FEAT-RFX-011` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-022 — Embedded Communication Module: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Embedded Communication Module. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Embedded Communication Module to get an in-event query system with type-based routing and confidentiality.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-011` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-023 — Multi-Currency Bidding: happy path for the Buyer

- **Why it matters.** Apples-to-apples multi-currency comparison. Business use: For multi-country sourcing; vendors bid in their own currency with rates locked at publish for fair comparison.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
  Context from the workbook: Rate API (MOD-11).
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Multi-Currency Bidding to get what the story asks for: vendors to bid in their own currency with rates locked at publish.
  3. Follow the business scenario the workbook gives: "For multi-country sourcing; vendors bid in their own currency with rates locked at publish for fair comparison".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: compare bids fairly. The business use case is served: for multi-country sourcing; vendors bid in their own currency with rates locked at publish for fair comparison.
- **Oracle.** Observable proof that Multi-Currency Bidding did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-012.
- **Trace.** P0 · manual · `FEAT-RFX-012` · `MOD-11` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-024 — Multi-Currency Bidding: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Currency Bidding to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Multi-Currency Bidding to get vendors to bid in their own currency with rates locked at publish.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-012` · `MOD-11` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-025 — Multi-Currency Bidding: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multi-Currency Bidding. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Currency Bidding to get vendors to bid in their own currency with rates locked at publish.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-012` · `MOD-11` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-026 — Master QCS (MQCS): happy path for the Buyer

- **Why it matters.** Holistic, defensible award decisions. Business use: During evaluation and award; the buyer and approvers review the cross-stage Master QCS (scores, bid evolution, benchmarks).
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Master QCS (MQCS) to get what the story asks for: a cross-stage Master QCS showing each vendor's bid evolution and benchmarks.
  3. Follow the business scenario the workbook gives: "During evaluation and award; the buyer and approvers review the cross-stage Master QCS (scores, bid evolution, benchmarks)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: make defensible award decisions. The business use case is served: during evaluation and award; the buyer and approvers review the cross-stage Master QCS (scores, bid evolution, benchmarks).
- **Oracle.** Observable proof that Master QCS (MQCS) did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-013.
- **Trace.** P0 · manual · `FEAT-RFX-013` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-027 — Master QCS (MQCS): not available on the Growth plan

- **Why it matters.** The workbook limits Master QCS (MQCS) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Master QCS (MQCS) to get a cross-stage Master QCS showing each vendor's bid evolution and benchmarks.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-013` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-028 — Master QCS (MQCS): refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Master QCS (MQCS). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Master QCS (MQCS) to get a cross-stage Master QCS showing each vendor's bid evolution and benchmarks.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-013` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-029 — Project Overview Page: happy path for the Buyer

- **Why it matters.** Operational visibility. Business use: Stakeholders open the project overview to see lines, stages, vendors, participation, T&Cs, and timelines at a glance.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Project Overview Page to get what the story asks for: a single overview of line items, stages, vendors, T&Cs, and timelines.
  3. Follow the business scenario the workbook gives: "Stakeholders open the project overview to see lines, stages, vendors, participation, T&Cs, and timelines at a glance".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: grasp the event at a glance. The business use case is served: stakeholders open the project overview to see lines, stages, vendors, participation, T&Cs, and timelines at a glance.
- **Oracle.** Observable proof that Project Overview Page did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-015.
- **Trace.** P0 · manual · `FEAT-RFX-015` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-030 — Project Overview Page: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Project Overview Page. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Project Overview Page to get a single overview of line items, stages, vendors, T&Cs, and timelines.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-015` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-031 — Per-Stage Activity Log: happy path for the Auditor

- **Why it matters.** Auditability per stage. Business use: Auditors and buyers review the per-stage activity log of all stakeholder actions.
- **Setup.**
  Persona: Auditor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Auditor on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Per-Stage Activity Log to get what the story asks for: every stage to log all stakeholder activity.
  3. Follow the business scenario the workbook gives: "Auditors and buyers review the per-stage activity log of all stakeholder actions".
  4. Check the result against the story's promised outcome.
- **Expected.** The Auditor achieves the story's outcome: trace exactly what happened. The business use case is served: auditors and buyers review the per-stage activity log of all stakeholder actions.
- **Oracle.** Observable proof that Per-Stage Activity Log did its job for the Auditor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-016.
- **Trace.** P0 · manual · `FEAT-RFX-016` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-032 — Per-Stage Activity Log: feeds audit trail

- **Why it matters.** The workbook records this edge case for Per-Stage Activity Log: "Feeds audit trail".
- **Setup.**
  Persona: Auditor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Auditor on the tenant described in Setup.
  2. Set up the situation the note describes: "Feeds audit trail".
  3. Use Per-Stage Activity Log to get every stage to log all stakeholder activity.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Per-Stage Activity Log behaves as the workbook states: "Feeds audit trail".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-RFX-016 quoting the note.
- **Trace.** P2 · manual · `FEAT-RFX-016` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-033 — Per-Stage Activity Log: refused for a user without the Auditor role

- **Why it matters.** The workbook names Auditor as the user of Per-Stage Activity Log. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Auditor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Per-Stage Activity Log to get every stage to log all stakeholder activity.
  3. Repeat as an Auditor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Auditor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Auditor.
- **Trace.** P1 · automate-later · `FEAT-RFX-016` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-034 — Award via Master QCS: happy path for the Buyer

- **Why it matters.** Single award surface with full context. Business use: At award; the buyer selects line-item by vendor and allocates quantities from the Master QCS.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Award directly from the Master QCS by line item and vendor.
  3. Follow the business scenario the workbook gives: "At award; the buyer selects line-item by vendor and allocates quantities from the Master QCS".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: finalize allocations with full context. The business use case is served: at award; the buyer selects line-item by vendor and allocates quantities from the Master QCS.
- **Oracle.** Observable proof that Award via Master QCS did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-017.
- **Trace.** P0 · manual · `FEAT-RFX-017` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-035 — Award via Master QCS: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Award via Master QCS. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Award via Master QCS to award directly from the Master QCS by line item and vendor.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-017` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-036 — Award Decision Metrics & Allocation: happy path for the Buyer

- **Why it matters.** Informed award decisions. Business use: While awarding; the buyer sees total/L1/non-L1 values and pending and location-wise allocation before committing.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Award Decision Metrics & Allocation to get what the story asks for: total, L1, and non-L1 values with allocation visibility.
  3. Follow the business scenario the workbook gives: "While awarding; the buyer sees total/L1/non-L1 values and pending and location-wise allocation before committing".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: see the value and split before committing. The business use case is served: while awarding; the buyer sees total/L1/non-L1 values and pending and location-wise allocation before committing.
- **Oracle.** Observable proof that Award Decision Metrics & Allocation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-018.
- **Trace.** P0 · manual · `FEAT-RFX-018` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-037 — Award Decision Metrics & Allocation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Award Decision Metrics & Allocation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Award Decision Metrics & Allocation to get total, L1, and non-L1 values with allocation visibility.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-018` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-038 — Project Clone / Recreate: happy path for the Buyer

- **Why it matters.** Faster event creation. Business use: The buyer clones a prior project to set up a similar event quickly.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Clone an existing project.
  3. Follow the business scenario the workbook gives: "The buyer clones a prior project to set up a similar event quickly".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: reuse a prior setup and create events faster. The business use case is served: the buyer clones a prior project to set up a similar event quickly.
- **Oracle.** Observable proof that Project Clone / Recreate did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-025.
- **Trace.** P0 · manual · `FEAT-RFX-025` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-039 — Project Clone / Recreate: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Project Clone / Recreate. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Project Clone / Recreate to clone an existing project.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-025` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-040 — Lock Vendor Addition & Per-Event Masking: happy path for the Buyer

- **Why it matters.** Event-level integrity and confidentiality. Business use: After creation; the buyer locks the bidder set and masks vendor identities for that event.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Lock the bidder set and mask vendors per event.
  3. Follow the business scenario the workbook gives: "After creation; the buyer locks the bidder set and masks vendor identities for that event".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: protect event integrity and anonymity. The business use case is served: after creation; the buyer locks the bidder set and masks vendor identities for that event.
- **Oracle.** Observable proof that Lock Vendor Addition & Per-Event Masking did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-027.
- **Trace.** P0 · manual · `FEAT-RFX-027` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-041 — Lock Vendor Addition & Per-Event Masking: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Lock Vendor Addition & Per-Event Masking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Lock Vendor Addition & Per-Event Masking to lock the bidder set and mask vendors per event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-027` · workbook sheet "6. Sourcing Events (RFX)"

## 2. Optional features

#### PRD-RFX-042 — Clara AI Sourcing Assistant: happy path for the Buyer

- **Why it matters.** AI augmentation of sourcing. Business use: Throughout the event; Clara assists the buyer with vendor suggestions and recommendations.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Beta.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Clara AI Sourcing Assistant to get what the story asks for: Clara to assist them through the sourcing event.
  3. Follow the business scenario the workbook gives: "Throughout the event; Clara assists the buyer with vendor suggestions and recommendations".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: work faster with AI support. The business use case is served: throughout the event; Clara assists the buyer with vendor suggestions and recommendations.
- **Oracle.** Observable proof that Clara AI Sourcing Assistant did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-008.
- **Trace.** P1 · manual · `FEAT-RFX-008` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-043 — Clara AI Sourcing Assistant: not available on the Growth plan

- **Why it matters.** The workbook limits Clara AI Sourcing Assistant to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Beta.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Clara AI Sourcing Assistant to get Clara to assist them through the sourcing event.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-008` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-044 — Clara AI Sourcing Assistant: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Clara AI Sourcing Assistant. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Beta.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Clara AI Sourcing Assistant to get Clara to assist them through the sourcing event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-008` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-045 — Benchmarking: happy path for the Buyer

- **Why it matters.** Objective price assessment. Business use: During evaluation; bids are compared against LPP, budget, and custom benchmarks.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Benchmarking to get what the story asks for: bids compared to historical, budgeted, and custom benchmarks.
  3. Follow the business scenario the workbook gives: "During evaluation; bids are compared against LPP, budget, and custom benchmarks".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: judge competitiveness objectively. The business use case is served: during evaluation; bids are compared against LPP, budget, and custom benchmarks.
- **Oracle.** Observable proof that Benchmarking did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-014.
- **Trace.** P1 · manual · `FEAT-RFX-014` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-046 — Benchmarking: not available on the Growth plan

- **Why it matters.** The workbook limits Benchmarking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Benchmarking to get bids compared to historical, budgeted, and custom benchmarks.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-014` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-047 — Benchmarking: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Benchmarking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Benchmarking to get bids compared to historical, budgeted, and custom benchmarks.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-014` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-048 — Over-Ordering Config: happy path for the Buyer

- **Why it matters.** Flexibility for batch/MOQ buys. Business use: For batch or MOQ buys; the buyer awards above the requested quantity within a configured tolerance.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Award beyond the requested quantity within tolerance.
  3. Follow the business scenario the workbook gives: "For batch or MOQ buys; the buyer awards above the requested quantity within a configured tolerance".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: handle batch and minimum-order-quantity buys. The business use case is served: for batch or MOQ buys; the buyer awards above the requested quantity within a configured tolerance.
- **Oracle.** Observable proof that Over-Ordering Config did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-019.
- **Trace.** P1 · manual · `FEAT-RFX-019` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-049 — Over-Ordering Config: not available on the Growth plan

- **Why it matters.** The workbook limits Over-Ordering Config to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Over-Ordering Config to award beyond the requested quantity within tolerance.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-019` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-050 — Over-Ordering Config: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Over-Ordering Config. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Over-Ordering Config to award beyond the requested quantity within tolerance.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-019` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-051 — Share-of-Business / Award via Sheet: happy path for the Buyer

- **Why it matters.** Risk diversification and capacity sharing. Business use: To diversify supply; the buyer splits the award across vendors, including via an uploaded allocation sheet.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Split award across vendors as share-of-business.
  3. Follow the business scenario the workbook gives: "To diversify supply; the buyer splits the award across vendors, including via an uploaded allocation sheet".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: diversify risk and share capacity. The business use case is served: to diversify supply; the buyer splits the award across vendors, including via an uploaded allocation sheet.
- **Oracle.** Observable proof that Share-of-Business / Award via Sheet did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-020.
- **Trace.** P1 · manual · `FEAT-RFX-020` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-052 — Share-of-Business / Award via Sheet: not available on the Growth plan

- **Why it matters.** The workbook limits Share-of-Business / Award via Sheet to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Share-of-Business / Award via Sheet to split award across vendors as share-of-business.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-020` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-053 — Share-of-Business / Award via Sheet: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Share-of-Business / Award via Sheet. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Share-of-Business / Award via Sheet to split award across vendors as share-of-business.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-020` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-054 — Smart Awarding: happy path for the Buyer

- **Why it matters.** Faster, optimized awards. Business use: For complex multi-vendor awards; the system recommends an optimized split.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Beta.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Smart Awarding to get what the story asks for: an optimized award recommendation.
  3. Follow the business scenario the workbook gives: "For complex multi-vendor awards; the system recommends an optimized split".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: reach the best split faster. The business use case is served: for complex multi-vendor awards; the system recommends an optimized split.
- **Oracle.** Observable proof that Smart Awarding did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-021.
- **Trace.** P1 · manual · `FEAT-RFX-021` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-055 — Smart Awarding: not available on the Growth plan

- **Why it matters.** The workbook limits Smart Awarding to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Beta.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Smart Awarding to get an optimized award recommendation.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-021` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-056 — Smart Awarding: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Smart Awarding. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Beta.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Smart Awarding to get an optimized award recommendation.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-021` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-057 — BOQ Events: happy path for the Buyer

- **Why it matters.** Supports high-line-count, BOQ-driven categories. Business use: Infra/construction sourcing with very large BOQs, rate-only lines, protected BOQ Excel, and a pre-bid BOQ meeting.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use BOQ Events to get what the story asks for: BOQ events with thousands of lines, rate-only items, and pre-bid updates.
  3. Follow the business scenario the workbook gives: "Infra/construction sourcing with very large BOQs, rate-only lines, protected BOQ Excel, and a pre-bid BOQ meeting".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: run large infra and construction tenders. The business use case is served: infra/construction sourcing with very large BOQs, rate-only lines, protected BOQ Excel, and a pre-bid BOQ meeting.
- **Oracle.** Observable proof that BOQ Events did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-022.
- **Trace.** P1 · manual · `FEAT-RFX-022` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-058 — BOQ Events: not available on the Growth plan

- **Why it matters.** The workbook limits BOQ Events to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use BOQ Events to get BOQ events with thousands of lines, rate-only items, and pre-bid updates.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-022` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-059 — BOQ Events: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of BOQ Events. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use BOQ Events to get BOQ events with thousands of lines, rate-only items, and pre-bid updates.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-022` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-060 — Service & Hierarchical Events: happy path for the Buyer

- **Why it matters.** Service procurement parity with materials. Business use: Services sourcing run as an ERFx with hierarchical scope and service-PR-to-event flow.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Service & Hierarchical Events to get what the story asks for: ERFx for services with hierarchical scope.
  3. Follow the business scenario the workbook gives: "Services sourcing run as an ERFx with hierarchical scope and service-PR-to-event flow".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: source services as robustly as materials. The business use case is served: services sourcing run as an ERFx with hierarchical scope and service-PR-to-event flow.
- **Oracle.** Observable proof that Service & Hierarchical Events did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-023.
- **Trace.** P1 · manual · `FEAT-RFX-023` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-061 — Service & Hierarchical Events: not available on the Growth plan

- **Why it matters.** The workbook limits Service & Hierarchical Events to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Service & Hierarchical Events to get ERFx for services with hierarchical scope.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-023` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-062 — Service & Hierarchical Events: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Service & Hierarchical Events. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Service & Hierarchical Events to get ERFx for services with hierarchical scope.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-023` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-063 — Recurring Events: happy path for the Buyer

- **Why it matters.** Reduces repetitive setup. Business use: For repeating spend; the buyer schedules recurring events.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Schedule recurring events.
  3. Follow the business scenario the workbook gives: "For repeating spend; the buyer schedules recurring events".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: automate periodic sourcing. The business use case is served: for repeating spend; the buyer schedules recurring events.
- **Oracle.** Observable proof that Recurring Events did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-024.
- **Trace.** P1 · manual · `FEAT-RFX-024` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-064 — Recurring Events: not available on the Growth plan

- **Why it matters.** The workbook limits Recurring Events to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Recurring Events to schedule recurring events.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-024` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-065 — Recurring Events: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Recurring Events. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Recurring Events to schedule recurring events.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-024` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-066 — Open / Public Tender: happy path for the Buyer

- **Why it matters.** Wider competition. Business use: For open tenders; the event is published to suppliers without an explicit invite.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Publish tenders visible without an invite.
  3. Follow the business scenario the workbook gives: "For open tenders; the event is published to suppliers without an explicit invite".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: open sourcing to broad participation. The business use case is served: for open tenders; the event is published to suppliers without an explicit invite.
- **Oracle.** Observable proof that Open / Public Tender did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-026.
- **Trace.** P1 · manual · `FEAT-RFX-026` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-067 — Open / Public Tender: not available on the Growth plan

- **Why it matters.** The workbook limits Open / Public Tender to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Open / Public Tender to publish tenders visible without an invite.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-026` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-068 — Open / Public Tender: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Open / Public Tender. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Open / Public Tender to publish tenders visible without an invite.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-026` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-069 — Mobile Vendor Bidding: happy path for the Vendor

- **Why it matters.** Higher participation in mobile-first markets. Business use: When away from a desk; vendors participate and bid from the mobile app.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Sourcing Events (RFX).
  2. Bid from the mobile app.
  3. Follow the business scenario the workbook gives: "When away from a desk; vendors participate and bid from the mobile app".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: participate on the go. The business use case is served: when away from a desk; vendors participate and bid from the mobile app.
- **Oracle.** Observable proof that Mobile Vendor Bidding did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-028.
- **Trace.** P1 · manual · `FEAT-RFX-028` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-070 — Mobile Vendor Bidding: not available on the Growth plan

- **Why it matters.** The workbook limits Mobile Vendor Bidding to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Mobile Vendor Bidding to bid from the mobile app.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-028` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-071 — Mobile Vendor Bidding: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Mobile Vendor Bidding. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Mobile Vendor Bidding to bid from the mobile app.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-RFX-028` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-072 — Multiple Scope of Work (SoW): happy path for the Buyer

- **Why it matters.** Handles complex service scopes. Business use: For differentiated service scopes; the buyer attaches multiple scopes of work per vendor.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Use Multiple Scope of Work (SoW) to get what the story asks for: multiple scopes of work per vendor.
  3. Follow the business scenario the workbook gives: "For differentiated service scopes; the buyer attaches multiple scopes of work per vendor".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: handle complex, differentiated service scopes in one event. The business use case is served: for differentiated service scopes; the buyer attaches multiple scopes of work per vendor.
- **Oracle.** Observable proof that Multiple Scope of Work (SoW) did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-029.
- **Trace.** P1 · manual · `FEAT-RFX-029` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-073 — Multiple Scope of Work (SoW): not available on the Growth plan

- **Why it matters.** The workbook limits Multiple Scope of Work (SoW) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Multiple Scope of Work (SoW) to get multiple scopes of work per vendor.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-029` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-074 — Multiple Scope of Work (SoW): refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multiple Scope of Work (SoW). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multiple Scope of Work (SoW) to get multiple scopes of work per vendor.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-029` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-075 — Project / WBS / Cost-Centre Tagging: happy path for the Buyer

- **Why it matters.** Financial traceability. Business use: For project or capex spend; lines are tagged with project, WBS, control number, and cost centre.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Sourcing Events (RFX).
  2. Tag lines with project, WBS, and cost centre.
  3. Follow the business scenario the workbook gives: "For project or capex spend; lines are tagged with project, WBS, control number, and cost centre".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: costs map to the right financial objects. The business use case is served: for project or capex spend; lines are tagged with project, WBS, control number, and cost centre.
- **Oracle.** Observable proof that Project / WBS / Cost-Centre Tagging did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFX-030.
- **Trace.** P1 · manual · `FEAT-RFX-030` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-076 — Project / WBS / Cost-Centre Tagging: not available on the Growth plan

- **Why it matters.** The workbook limits Project / WBS / Cost-Centre Tagging to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Project / WBS / Cost-Centre Tagging to tag lines with project, WBS, and cost centre.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFX-030` · workbook sheet "6. Sourcing Events (RFX)"

#### PRD-RFX-077 — Project / WBS / Cost-Centre Tagging: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Project / WBS / Cost-Centre Tagging. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Project / WBS / Cost-Centre Tagging to tag lines with project, WBS, and cost centre.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFX-030` · workbook sheet "6. Sourcing Events (RFX)"
