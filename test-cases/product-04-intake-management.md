# Product test cases — 04. Intake Management (MOD-13)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-13 · 12 features · 36 cases · group `PRD-INTK` · plan availability: Growth, Enterprise · status: GA

In-platform demand intake and request orchestration when no ERP PR feed exists. Capture and route demand (PR, approvals, material/vendor requests) via configurable templates and Delegation of Authority.

## 1. Core features

#### PRD-INTK-001 — Intake Demand Generation: happy path for the Requester / End User

- **Why it matters.** Captures demand for non-integrated tenants. Business use: Non-integrated tenants; requesters raise demand directly in Procol when there is no ERP PR feed.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Raise demand via intake when there's no ERP feed.
  3. Follow the business scenario the workbook gives: "Non-integrated tenants; requesters raise demand directly in Procol when there is no ERP PR feed".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: initiate a purchase need directly. The business use case is served: non-integrated tenants; requesters raise demand directly in Procol when there is no ERP PR feed.
- **Oracle.** Observable proof that Intake Demand Generation did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-001.
- **Trace.** P0 · manual · `FEAT-INTK-001` · `MOD-02` · workbook sheet "4. Intake Management"

#### PRD-INTK-002 — Intake Demand Generation: not available on plans below Growth

- **Why it matters.** The workbook limits Intake Demand Generation to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Intake Demand Generation to raise demand via intake when there's no ERP feed.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-001` · `MOD-02` · workbook sheet "4. Intake Management"

#### PRD-INTK-003 — Intake Demand Generation: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Intake Demand Generation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Intake Demand Generation to raise demand via intake when there's no ERP feed.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-001` · `MOD-02` · workbook sheet "4. Intake Management"

#### PRD-INTK-004 — Configurable Intake Templates: happy path for the Tenant Admin

- **Why it matters.** One intake layer for many request types. Business use: Admins define intake templates for PRs, standalone approvals, and PO-amendment requests.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Intake Management.
  2. Use Configurable Intake Templates to get what the story asks for: template types for PRs, standalone approvals, and PO-amendment requests.
  3. Follow the business scenario the workbook gives: "Admins define intake templates for PRs, standalone approvals, and PO-amendment requests".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: we standardize how every request is raised. The business use case is served: admins define intake templates for PRs, standalone approvals, and PO-amendment requests.
- **Oracle.** Observable proof that Configurable Intake Templates did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-002.
- **Trace.** P0 · manual · `FEAT-INTK-002` · workbook sheet "4. Intake Management"

#### PRD-INTK-005 — Configurable Intake Templates: not available on plans below Growth

- **Why it matters.** The workbook limits Configurable Intake Templates to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Configurable Intake Templates to get template types for PRs, standalone approvals, and PO-amendment requests.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-002` · workbook sheet "4. Intake Management"

#### PRD-INTK-006 — Configurable Intake Templates: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Configurable Intake Templates. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Intake Templates to get template types for PRs, standalone approvals, and PO-amendment requests.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-INTK-002` · workbook sheet "4. Intake Management"

#### PRD-INTK-007 — Configurable Request Form: happy path for the Tenant Admin

- **Why it matters.** Tailored capture without code. Business use: Intake forms are configured per business to capture exactly what each request type needs.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Intake Management.
  2. Use Configurable Request Form to get what the story asks for: intake forms configurable per business.
  3. Follow the business scenario the workbook gives: "Intake forms are configured per business to capture exactly what each request type needs".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: we capture exactly what each request needs without code. The business use case is served: intake forms are configured per business to capture exactly what each request type needs.
- **Oracle.** Observable proof that Configurable Request Form did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-003.
- **Trace.** P0 · manual · `FEAT-INTK-003` · workbook sheet "4. Intake Management"

#### PRD-INTK-008 — Configurable Request Form: not available on plans below Growth

- **Why it matters.** The workbook limits Configurable Request Form to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Configurable Request Form to get intake forms configurable per business.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-003` · workbook sheet "4. Intake Management"

#### PRD-INTK-009 — Configurable Request Form: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Configurable Request Form. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Request Form to get intake forms configurable per business.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-INTK-003` · workbook sheet "4. Intake Management"

#### PRD-INTK-010 — DoA / DoFP Routing: happy path for the Approver

- **Why it matters.** Enforces spend governance at intake. Business use: Submitted intakes route through the Delegation of Authority for approval.
- **Setup.**
  Persona: Approver.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Intake Management.
  2. Use DoA / DoFP Routing to get what the story asks for: intake routed through the Delegation of Authority.
  3. Follow the business scenario the workbook gives: "Submitted intakes route through the Delegation of Authority for approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: requests are approved by the right authority. The business use case is served: submitted intakes route through the Delegation of Authority for approval.
- **Oracle.** Observable proof that DoA / DoFP Routing did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-004.
- **Trace.** P0 · manual · `FEAT-INTK-004` · `MOD-09` · workbook sheet "4. Intake Management"

#### PRD-INTK-011 — DoA / DoFP Routing: not available on plans below Growth

- **Why it matters.** The workbook limits DoA / DoFP Routing to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Approver.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the lower-plan tenant.
  2. Try it: use DoA / DoFP Routing to get intake routed through the Delegation of Authority.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-004` · `MOD-09` · workbook sheet "4. Intake Management"

#### PRD-INTK-012 — DoA / DoFP Routing: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of DoA / DoFP Routing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use DoA / DoFP Routing to get intake routed through the Delegation of Authority.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-INTK-004` · `MOD-09` · workbook sheet "4. Intake Management"

#### PRD-INTK-013 — Approved-Intake Outcomes: happy path for the Requester / End User

- **Why it matters.** Single intake feeds multiple workflows. Business use: On approval; an intake becomes a PR, ticket, material request, or vendor-onboarding request as appropriate.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Use Approved-Intake Outcomes to get what the story asks for: an approved intake to become a PR, ticket, material request, or vendor request.
  3. Follow the business scenario the workbook gives: "On approval; an intake becomes a PR, ticket, material request, or vendor-onboarding request as appropriate".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: demand flows to the right downstream process. The business use case is served: on approval; an intake becomes a PR, ticket, material request, or vendor-onboarding request as appropriate.
- **Oracle.** Observable proof that Approved-Intake Outcomes did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-005.
- **Trace.** P0 · manual · `FEAT-INTK-005` · `MOD-02` · `MOD-12` · `MOD-01` · workbook sheet "4. Intake Management"

#### PRD-INTK-014 — Approved-Intake Outcomes: not available on plans below Growth

- **Why it matters.** The workbook limits Approved-Intake Outcomes to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Approved-Intake Outcomes to get an approved intake to become a PR, ticket, material request, or vendor request.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-005` · `MOD-02` · `MOD-12` · `MOD-01` · workbook sheet "4. Intake Management"

#### PRD-INTK-015 — Approved-Intake Outcomes: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Approved-Intake Outcomes. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approved-Intake Outcomes to get an approved intake to become a PR, ticket, material request, or vendor request.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-005` · `MOD-02` · `MOD-12` · `MOD-01` · workbook sheet "4. Intake Management"

#### PRD-INTK-016 — multi-Currency Intake: happy path for the Requester / End User

- **Why it matters.** Traceability from demand to fulfillment. Business use: Each intake's unique ID tracks downstream status from PR through sourcing to PO/fulfilment.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Use multi-Currency Intake to get what the story asks for: a unique intake ID that tracks downstream status.
  3. Follow the business scenario the workbook gives: "Each intake's unique ID tracks downstream status from PR through sourcing to PO/fulfilment".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: trace their request from demand to fulfillment. The business use case is served: each intake's unique ID tracks downstream status from PR through sourcing to PO/fulfilment.
- **Oracle.** Observable proof that multi-Currency Intake did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-006.
- **Trace.** P0 · manual · `FEAT-INTK-006` · workbook sheet "4. Intake Management"

#### PRD-INTK-017 — multi-Currency Intake: not available on plans below Growth

- **Why it matters.** The workbook limits multi-Currency Intake to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use multi-Currency Intake to get a unique intake ID that tracks downstream status.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-006` · workbook sheet "4. Intake Management"

#### PRD-INTK-018 — multi-Currency Intake: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of multi-Currency Intake. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use multi-Currency Intake to get a unique intake ID that tracks downstream status.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-006` · workbook sheet "4. Intake Management"

#### PRD-INTK-019 — Withdraw Intake Request: happy path for the Requester / End User

- **Why it matters.** Avoids processing stale demand. Business use: Requesters cancel an intake mid-approval when the need disappears.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Withdraw an intake while approvals are pending.
  3. Follow the business scenario the workbook gives: "Requesters cancel an intake mid-approval when the need disappears".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: cancel demand they no longer need. The business use case is served: requesters cancel an intake mid-approval when the need disappears.
- **Oracle.** Observable proof that Withdraw Intake Request did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-007.
- **Trace.** P0 · manual · `FEAT-INTK-007` · workbook sheet "4. Intake Management"

#### PRD-INTK-020 — Withdraw Intake Request: not available on plans below Growth

- **Why it matters.** The workbook limits Withdraw Intake Request to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Withdraw Intake Request to withdraw an intake while approvals are pending.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-007` · workbook sheet "4. Intake Management"

#### PRD-INTK-021 — Withdraw Intake Request: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Withdraw Intake Request. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Withdraw Intake Request to withdraw an intake while approvals are pending.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-007` · workbook sheet "4. Intake Management"

#### PRD-INTK-022 — Intake Dashboard (Search/Filter): happy path for the Requester / End User

- **Why it matters.** Self-serve request management. Business use: Requesters self-serve via search/filter on the intake dashboard with status visibility.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Search and filter their intakes by category with status visibility.
  3. Follow the business scenario the workbook gives: "Requesters self-serve via search/filter on the intake dashboard with status visibility".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: manage their requests myself. The business use case is served: requesters self-serve via search/filter on the intake dashboard with status visibility.
- **Oracle.** Observable proof that Intake Dashboard (Search/Filter) did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-008.
- **Trace.** P0 · manual · `FEAT-INTK-008` · workbook sheet "4. Intake Management"

#### PRD-INTK-023 — Intake Dashboard (Search/Filter): not available on plans below Growth

- **Why it matters.** The workbook limits Intake Dashboard (Search/Filter) to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Intake Dashboard (Search/Filter) to search and filter their intakes by category with status visibility.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-008` · workbook sheet "4. Intake Management"

#### PRD-INTK-024 — Intake Dashboard (Search/Filter): refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Intake Dashboard (Search/Filter). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Intake Dashboard (Search/Filter) to search and filter their intakes by category with status visibility.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-008` · workbook sheet "4. Intake Management"

## 2. Optional features

#### PRD-INTK-025 — Ticketing Outcome: happy path for the Requester / End User

- **Why it matters.** Handles general approvals outside procurement. Business use: Standard-approval intakes generate a ticket on a ticketing dashboard for non-procurement approvals.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Use Ticketing Outcome to get what the story asks for: standard-approval intakes to generate an id.
  3. Follow the business scenario the workbook gives: "Standard-approval intakes generate a ticket on a ticketing dashboard for non-procurement approvals".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: non-procurement approvals are tracked properly. The business use case is served: standard-approval intakes generate a ticket on a ticketing dashboard for non-procurement approvals.
- **Oracle.** Observable proof that Ticketing Outcome did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-009.
- **Trace.** P1 · manual · `FEAT-INTK-009` · workbook sheet "4. Intake Management"

#### PRD-INTK-026 — Ticketing Outcome: not available on plans below Growth

- **Why it matters.** The workbook limits Ticketing Outcome to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Ticketing Outcome to get standard-approval intakes to generate an id.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-INTK-009` · workbook sheet "4. Intake Management"

#### PRD-INTK-027 — Ticketing Outcome: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Ticketing Outcome. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Ticketing Outcome to get standard-approval intakes to generate an id.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-009` · workbook sheet "4. Intake Management"

#### PRD-INTK-028 — ERP Budget Fetch at Intake: happy path for the Requester / End User

- **Why it matters.** Budget-aware intake prevents overspend. Business use: At intake; available budget is pulled from the ERP fund center/WBS and shown to approvers.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Use ERP Budget Fetch at Intake to get what the story asks for: available budget pulled from the ERP at intake and shown to approvers.
  3. Follow the business scenario the workbook gives: "At intake; available budget is pulled from the ERP fund center/WBS and shown to approvers".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: demand is raised against real budget. The business use case is served: at intake; available budget is pulled from the ERP fund center/WBS and shown to approvers.
- **Oracle.** Observable proof that ERP Budget Fetch at Intake did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-010.
- **Trace.** P0 · manual · `FEAT-INTK-010` · `MOD-11` · `WF-PR-001` · workbook sheet "4. Intake Management"

#### PRD-INTK-029 — ERP Budget Fetch at Intake: not available on the Growth plan

- **Why it matters.** The workbook limits ERP Budget Fetch at Intake to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use ERP Budget Fetch at Intake to get available budget pulled from the ERP at intake and shown to approvers.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INTK-010` · `MOD-11` · `WF-PR-001` · workbook sheet "4. Intake Management"

#### PRD-INTK-030 — ERP Budget Fetch at Intake: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of ERP Budget Fetch at Intake. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ERP Budget Fetch at Intake to get available budget pulled from the ERP at intake and shown to approvers.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-010` · `MOD-11` · `WF-PR-001` · workbook sheet "4. Intake Management"

#### PRD-INTK-031 — Multi-Currency Intake: happy path for the Requester / End User

- **Why it matters.** Global intake support. Business use: Cross-border intakes capture demand in multiple currencies.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open Intake Management.
  2. Use Multi-Currency Intake to get what the story asks for: intake templates to support multiple currencies.
  3. Follow the business scenario the workbook gives: "Cross-border intakes capture demand in multiple currencies".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: raise cross-border demand. The business use case is served: cross-border intakes capture demand in multiple currencies.
- **Oracle.** Observable proof that Multi-Currency Intake did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-011.
- **Trace.** P1 · manual · `FEAT-INTK-011` · workbook sheet "4. Intake Management"

#### PRD-INTK-032 — Multi-Currency Intake: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Currency Intake to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Multi-Currency Intake to get intake templates to support multiple currencies.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INTK-011` · workbook sheet "4. Intake Management"

#### PRD-INTK-033 — Multi-Currency Intake: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Multi-Currency Intake. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Currency Intake to get intake templates to support multiple currencies.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-INTK-011` · workbook sheet "4. Intake Management"

#### PRD-INTK-034 — Intake Estimate-to-Budget Mapping: happy path for the Approver

- **Why it matters.** Budget-aware demand. Business use: The intake estimate is mapped to the PR budget so approvers compare estimate against budget.
- **Setup.**
  Persona: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Intake Management.
  2. Use Intake Estimate-to-Budget Mapping to get what the story asks for: the intake estimate mapped to the PR budget.
  3. Follow the business scenario the workbook gives: "The intake estimate is mapped to the PR budget so approvers compare estimate against budget".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: see estimate against budget when approving. The business use case is served: the intake estimate is mapped to the PR budget so approvers compare estimate against budget.
- **Oracle.** Observable proof that Intake Estimate-to-Budget Mapping did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-INTK-012.
- **Trace.** P0 · manual · `FEAT-INTK-012` · workbook sheet "4. Intake Management"

#### PRD-INTK-035 — Intake Estimate-to-Budget Mapping: not available on the Growth plan

- **Why it matters.** The workbook limits Intake Estimate-to-Budget Mapping to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Approver.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the lower-plan tenant.
  2. Try it: use Intake Estimate-to-Budget Mapping to get the intake estimate mapped to the PR budget.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-INTK-012` · workbook sheet "4. Intake Management"

#### PRD-INTK-036 — Intake Estimate-to-Budget Mapping: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Intake Estimate-to-Budget Mapping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Intake Estimate-to-Budget Mapping to get the intake estimate mapped to the PR budget.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-INTK-012` · workbook sheet "4. Intake Management"
