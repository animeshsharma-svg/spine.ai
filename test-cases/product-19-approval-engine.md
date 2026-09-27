# Product test cases — 19. Approval Engine (MOD-09)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-09 · 18 features · 55 cases · group `PRD-AE` · plan availability: All Plans · status: GA

Configurable multi-level approval workflows across all modules. Centralise approval logic to enforce spend controls, delegation of authority, and escalation policies consistently.

## 1. Core features

#### PRD-AE-001 — Modular Approval Setup: happy path for the Tenant Admin

- **Why it matters.** One engine governs approvals platform-wide. Business use: Approvals are attached to many entities (events, onboarding, counters, PO release, payments, LC, etc.) per the customer's governance.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  gate: `approval.doa.currency` at its default (INR) — CONF-AE-001 "DoA Threshold Currency".
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Modular Approval Setup to get what the story asks for: approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Follow the business scenario the workbook gives: "Approvals are attached to many entities (events, onboarding, counters, PO release, payments, LC, etc.) per the customer's governance".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: every critical action is governed. The business use case is served: approvals are attached to many entities (events, onboarding, counters, PO release, payments, LC, etc.) per the customer's governance.
- **Oracle.** Observable proof that Modular Approval Setup did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-001.
- **Trace.** P0 · manual · `FEAT-AE-001` · `approval.doa.currency` · `MOD-01` · workbook sheet "19. Approval Engine"

#### PRD-AE-002 — DoA Threshold Currency (approval.doa.currency) = INR (default)

- **Why it matters.** Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.doa.currency` = INR (default: INR) — CONF-AE-001 "DoA Threshold Currency", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `approval.doa.currency` to INR.
  2. As a Tenant Admin: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Observe the behaviour the setting controls: currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Expected.** With INR selected, the behaviour follows it. What the setting controls: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Oracle.** The behaviour in step 3 matches INR.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `CONF-AE-001` · workbook sheet "25. Configuration Reference"

#### PRD-AE-003 — DoA Threshold Currency (approval.doa.currency) = USD

- **Why it matters.** Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.doa.currency` = USD (default: INR) — CONF-AE-001 "DoA Threshold Currency", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `approval.doa.currency` to USD.
  2. As a Tenant Admin: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Observe the behaviour the setting controls: currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Expected.** With USD selected, the behaviour follows it. What the setting controls: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix. Stated business impact: Affects all approval routing thresholds; changing after go-live requires reconfiguration of all DoA rules.
- **Oracle.** The behaviour in step 3 matches USD and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `CONF-AE-001` · workbook sheet "25. Configuration Reference"

#### PRD-AE-004 — DoA Threshold Currency (approval.doa.currency) = EUR

- **Why it matters.** Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.doa.currency` = EUR (default: INR) — CONF-AE-001 "DoA Threshold Currency", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `approval.doa.currency` to EUR.
  2. As a Tenant Admin: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Observe the behaviour the setting controls: currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Expected.** With EUR selected, the behaviour follows it. What the setting controls: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix. Stated business impact: Affects all approval routing thresholds; changing after go-live requires reconfiguration of all DoA rules.
- **Oracle.** The behaviour in step 3 matches EUR and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `CONF-AE-001` · workbook sheet "25. Configuration Reference"

#### PRD-AE-005 — DoA Threshold Currency (approval.doa.currency) = GBP

- **Why it matters.** Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.doa.currency` = GBP (default: INR) — CONF-AE-001 "DoA Threshold Currency", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `approval.doa.currency` to GBP.
  2. As a Tenant Admin: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Observe the behaviour the setting controls: currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Expected.** With GBP selected, the behaviour follows it. What the setting controls: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix. Stated business impact: Affects all approval routing thresholds; changing after go-live requires reconfiguration of all DoA rules.
- **Oracle.** The behaviour in step 3 matches GBP and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `CONF-AE-001` · workbook sheet "25. Configuration Reference"

#### PRD-AE-006 — DoA Threshold Currency (approval.doa.currency) = AED

- **Why it matters.** Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.doa.currency` = AED (default: INR) — CONF-AE-001 "DoA Threshold Currency", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `approval.doa.currency` to AED.
  2. As a Tenant Admin: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Observe the behaviour the setting controls: currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Expected.** With AED selected, the behaviour follows it. What the setting controls: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix. Stated business impact: Affects all approval routing thresholds; changing after go-live requires reconfiguration of all DoA rules.
- **Oracle.** The behaviour in step 3 matches AED and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `CONF-AE-001` · workbook sheet "25. Configuration Reference"

#### PRD-AE-007 — DoA Threshold Currency (approval.doa.currency) = SGD

- **Why it matters.** Multi-geography tenants may operate in different currencies. Locking DoA amounts to a single currency config prevents ambiguity in approval routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.doa.currency` = SGD (default: INR) — CONF-AE-001 "DoA Threshold Currency", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `approval.doa.currency` to SGD.
  2. As a Tenant Admin: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Observe the behaviour the setting controls: currency unit used for all spend threshold definitions in the Delegation of Authority matrix.
- **Expected.** With SGD selected, the behaviour follows it. What the setting controls: Currency unit used for all spend threshold definitions in the Delegation of Authority matrix. Stated business impact: Affects all approval routing thresholds; changing after go-live requires reconfiguration of all DoA rules.
- **Oracle.** The behaviour in step 3 matches SGD and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `CONF-AE-001` · workbook sheet "25. Configuration Reference"

#### PRD-AE-008 — Modular Approval Setup: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Modular Approval Setup. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Modular Approval Setup to get approvals attachable to any entity (events, onboarding, PO, payments, LC, and more).
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-001` · `approval.doa.currency` · `MOD-01` · workbook sheet "19. Approval Engine"

#### PRD-AE-009 — Condition-Based Triggering: happy path for the Tenant Admin

- **Why it matters.** Targeted governance. Business use: Approval chains fire based on conditions such as value, currency, category, or site.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  gate: `approval.escalation.timeout_hours` at its default (48) — CONF-AE-002 "Escalation Timeout (Hours)".
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Condition-Based Triggering to get what the story asks for: approvals triggered by conditions like value or category.
  3. Follow the business scenario the workbook gives: "Approval chains fire based on conditions such as value, currency, category, or site".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: the right approvals fire for the right cases. The business use case is served: approval chains fire based on conditions such as value, currency, category, or site.
- **Oracle.** Observable proof that Condition-Based Triggering did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-002.
- **Trace.** P0 · manual · `FEAT-AE-002` · `approval.escalation.timeout_hours` · workbook sheet "19. Approval Engine"

#### PRD-AE-010 — Escalation Timeout (Hours) (approval.escalation.timeout_hours) = 48 (default)

- **Why it matters.** Without a timeout, approvals can stall indefinitely. SLA-based escalation ensures procurement cycles don't block on individual approver availability.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.escalation.timeout_hours` = 48 (default: 48) — CONF-AE-002 "Escalation Timeout (Hours)", Number, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `approval.escalation.timeout_hours` to 48.
  2. As a Tenant Admin: use Condition-Based Triggering to get approvals triggered by conditions like value or category.
  3. Observe the behaviour the setting controls: number of hours an approval can remain pending before it is auto-escalated to the next level.
- **Expected.** The value 48 is accepted and takes effect. What the setting controls: Number of hours an approval can remain pending before it is auto-escalated to the next level. Stated business impact: Setting too low creates approval fatigue; too high defeats the purpose of escalation. Must be aligned to the tenant's internal SLA policy.
- **Oracle.** The behaviour in step 3 reflects the value 48 exactly (the boundary of 1 – 720 is honoured).
- **Trace.** P1 · automate-later · `FEAT-AE-002` · `approval.escalation.timeout_hours` · `CONF-AE-002` · workbook sheet "25. Configuration Reference"

#### PRD-AE-011 — Escalation Timeout (Hours) (approval.escalation.timeout_hours) = 1 (minimum)

- **Why it matters.** Without a timeout, approvals can stall indefinitely. SLA-based escalation ensures procurement cycles don't block on individual approver availability.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.escalation.timeout_hours` = 1 (default: 48) — CONF-AE-002 "Escalation Timeout (Hours)", Number, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `approval.escalation.timeout_hours` to 1.
  2. As a Tenant Admin: use Condition-Based Triggering to get approvals triggered by conditions like value or category.
  3. Observe the behaviour the setting controls: number of hours an approval can remain pending before it is auto-escalated to the next level.
- **Expected.** The value 1 is accepted and takes effect. What the setting controls: Number of hours an approval can remain pending before it is auto-escalated to the next level. Stated business impact: Setting too low creates approval fatigue; too high defeats the purpose of escalation. Must be aligned to the tenant's internal SLA policy.
- **Oracle.** The behaviour in step 3 reflects the value 1 exactly (the boundary of 1 – 720 is honoured).
- **Trace.** P1 · automate-later · `FEAT-AE-002` · `approval.escalation.timeout_hours` · `CONF-AE-002` · workbook sheet "25. Configuration Reference"

#### PRD-AE-012 — Escalation Timeout (Hours) (approval.escalation.timeout_hours) = 720 (maximum)

- **Why it matters.** Without a timeout, approvals can stall indefinitely. SLA-based escalation ensures procurement cycles don't block on individual approver availability.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.escalation.timeout_hours` = 720 (default: 48) — CONF-AE-002 "Escalation Timeout (Hours)", Number, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `approval.escalation.timeout_hours` to 720.
  2. As a Tenant Admin: use Condition-Based Triggering to get approvals triggered by conditions like value or category.
  3. Observe the behaviour the setting controls: number of hours an approval can remain pending before it is auto-escalated to the next level.
- **Expected.** The value 720 is accepted and takes effect. What the setting controls: Number of hours an approval can remain pending before it is auto-escalated to the next level. Stated business impact: Setting too low creates approval fatigue; too high defeats the purpose of escalation. Must be aligned to the tenant's internal SLA policy.
- **Oracle.** The behaviour in step 3 reflects the value 720 exactly (the boundary of 1 – 720 is honoured).
- **Trace.** P1 · automate-later · `FEAT-AE-002` · `approval.escalation.timeout_hours` · `CONF-AE-002` · workbook sheet "25. Configuration Reference"

#### PRD-AE-013 — Escalation Timeout (Hours) (approval.escalation.timeout_hours) = 0 (below the allowed range)

- **Why it matters.** Without a timeout, approvals can stall indefinitely. SLA-based escalation ensures procurement cycles don't block on individual approver availability.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.escalation.timeout_hours` = 0 (default: 48) — CONF-AE-002 "Escalation Timeout (Hours)", Number, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, try to set `approval.escalation.timeout_hours` to 0.
  2. Check the value that is actually stored.
- **Expected.** The value 0 is not accepted: the allowed range is 1 – 720.
- **Oracle.** Saving 0 is refused; the stored value of `approval.escalation.timeout_hours` is not 0.
- **Trace.** P1 · automate-later · `FEAT-AE-002` · `approval.escalation.timeout_hours` · `CONF-AE-002` · workbook sheet "25. Configuration Reference"

#### PRD-AE-014 — Escalation Timeout (Hours) (approval.escalation.timeout_hours) = 721 (above the allowed range)

- **Why it matters.** Without a timeout, approvals can stall indefinitely. SLA-based escalation ensures procurement cycles don't block on individual approver availability.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  gate: `approval.escalation.timeout_hours` = 721 (default: 48) — CONF-AE-002 "Escalation Timeout (Hours)", Number, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, try to set `approval.escalation.timeout_hours` to 721.
  2. Check the value that is actually stored.
- **Expected.** The value 721 is not accepted: the allowed range is 1 – 720.
- **Oracle.** Saving 721 is refused; the stored value of `approval.escalation.timeout_hours` is not 721.
- **Trace.** P1 · automate-later · `FEAT-AE-002` · `approval.escalation.timeout_hours` · `CONF-AE-002` · workbook sheet "25. Configuration Reference"

#### PRD-AE-015 — Condition-Based Triggering: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Condition-Based Triggering. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Condition-Based Triggering to get approvals triggered by conditions like value or category.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-002` · `approval.escalation.timeout_hours` · workbook sheet "19. Approval Engine"

#### PRD-AE-016 — Person or Role Assignment: happy path for the Tenant Admin

- **Why it matters.** Resilient to staffing changes. Business use: Each step targets a named person or a role, set during configuration.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Person or Role Assignment to get what the story asks for: steps assigned to a person or a role.
  3. Follow the business scenario the workbook gives: "Each step targets a named person or a role, set during configuration".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: approvals stay resilient to staffing changes. The business use case is served: each step targets a named person or a role, set during configuration.
- **Oracle.** Observable proof that Person or Role Assignment did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-003.
- **Trace.** P0 · manual · `FEAT-AE-003` · workbook sheet "19. Approval Engine"

#### PRD-AE-017 — Person or Role Assignment: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Person or Role Assignment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Person or Role Assignment to get steps assigned to a person or a role.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-003` · workbook sheet "19. Approval Engine"

#### PRD-AE-018 — Series & Parallel Routing: happy path for the Tenant Admin

- **Why it matters.** Faster, accurate routing. Business use: Chains model real structures using sequential and parallel routing.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Series & Parallel Routing to get what the story asks for: sequential and parallel routing.
  3. Follow the business scenario the workbook gives: "Chains model real structures using sequential and parallel routing".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: model the organisation's real approval structures. The business use case is served: chains model real structures using sequential and parallel routing.
- **Oracle.** Observable proof that Series & Parallel Routing did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-004.
- **Trace.** P0 · manual · `FEAT-AE-004` · workbook sheet "19. Approval Engine"

#### PRD-AE-019 — Series & Parallel Routing: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Series & Parallel Routing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Series & Parallel Routing to get sequential and parallel routing.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-004` · workbook sheet "19. Approval Engine"

#### PRD-AE-020 — Dynamic Approvals: happy path for the Approver

- **Why it matters.** Adaptive approvals. Business use: Mid-flow; an approver inserts a step or sets the next approver to handle an exception.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Add a step or set the next approver.
  3. Follow the business scenario the workbook gives: "Mid-flow; an approver inserts a step or sets the next approver to handle an exception".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: handle exceptions mid-flow. The business use case is served: mid-flow; an approver inserts a step or sets the next approver to handle an exception.
- **Oracle.** Observable proof that Dynamic Approvals did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-005.
- **Trace.** P0 · manual · `FEAT-AE-005` · workbook sheet "19. Approval Engine"

#### PRD-AE-021 — Dynamic Approvals: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Dynamic Approvals. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dynamic Approvals to add a step or set the next approver.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-005` · workbook sheet "19. Approval Engine"

#### PRD-AE-022 — Delegation: happy path for the Approver

- **Why it matters.** No approval bottlenecks. Business use: An approver on leave delegates to a subordinate for a set period.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Delegate to a subordinate for a period.
  3. Follow the business scenario the workbook gives: "An approver on leave delegates to a subordinate for a set period".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: approvals don't stall while they are away. The business use case is served: an approver on leave delegates to a subordinate for a set period.
- **Oracle.** Observable proof that Delegation did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-007.
- **Trace.** P0 · manual · `FEAT-AE-007` · workbook sheet "19. Approval Engine"

#### PRD-AE-023 — Delegation: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Delegation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Delegation to delegate to a subordinate for a period.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-007` · workbook sheet "19. Approval Engine"

#### PRD-AE-024 — Version Control on Proposals: happy path for the Approver

- **Why it matters.** Auditable change history. Business use: Across rejections and amendments; proposal versions are retained for comparison.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Use Version Control on Proposals to get what the story asks for: proposal versions kept across rejections.
  3. Follow the business scenario the workbook gives: "Across rejections and amendments; proposal versions are retained for comparison".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: see what changed. The business use case is served: across rejections and amendments; proposal versions are retained for comparison.
- **Oracle.** Observable proof that Version Control on Proposals did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-008.
- **Trace.** P0 · manual · `FEAT-AE-008` · workbook sheet "19. Approval Engine"

#### PRD-AE-025 — Version Control on Proposals: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Version Control on Proposals. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Version Control on Proposals to get proposal versions kept across rejections.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-008` · workbook sheet "19. Approval Engine"

#### PRD-AE-026 — Approver Actions: happy path for the Approver

- **Why it matters.** Clear decision trail. Business use: At each step; the approver approves, rejects, comments, or withdraws.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Approve, reject, comment, or withdraw.
  3. Follow the business scenario the workbook gives: "At each step; the approver approves, rejects, comments, or withdraws".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: their decisions are clear and recorded. The business use case is served: at each step; the approver approves, rejects, comments, or withdraws.
- **Oracle.** Observable proof that Approver Actions did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-009.
- **Trace.** P0 · manual · `FEAT-AE-009` · workbook sheet "19. Approval Engine"

#### PRD-AE-027 — Approver Actions: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Approver Actions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approver Actions to approve, reject, comment, or withdraw.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-009` · workbook sheet "19. Approval Engine"

#### PRD-AE-028 — Approvals Dashboard: happy path for the Approver

- **Why it matters.** Efficient approver workflow. Business use: Approvers work their queue via the dashboard's mine/upcoming/completed/rejected buckets and filters.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Use Approvals Dashboard to get what the story asks for: a dashboard with mine, upcoming, completed, and rejected buckets and filters.
  3. Follow the business scenario the workbook gives: "Approvers work their queue via the dashboard's mine/upcoming/completed/rejected buckets and filters".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: manage their queue efficiently. The business use case is served: approvers work their queue via the dashboard's mine/upcoming/completed/rejected buckets and filters.
- **Oracle.** Observable proof that Approvals Dashboard did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-010.
- **Trace.** P0 · manual · `FEAT-AE-010` · workbook sheet "19. Approval Engine"

#### PRD-AE-029 — Approvals Dashboard: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Approvals Dashboard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approvals Dashboard to get a dashboard with mine, upcoming, completed, and rejected buckets and filters.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-010` · workbook sheet "19. Approval Engine"

#### PRD-AE-030 — TAT & Step-Time Enforcement: happy path for the Procurement Manager

- **Why it matters.** Accountability on cycle time. Business use: TAT is shown and per-step durations are enforced, flagging overdue steps to managers.
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Approval Engine.
  2. Use TAT & Step-Time Enforcement to get what the story asks for: TAT shown and step durations enforced with overdue flags.
  3. Follow the business scenario the workbook gives: "TAT is shown and per-step durations are enforced, flagging overdue steps to managers".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: surface and reduce delays. The business use case is served: TAT is shown and per-step durations are enforced, flagging overdue steps to managers.
- **Oracle.** Observable proof that TAT & Step-Time Enforcement did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-011.
- **Trace.** P0 · manual · `FEAT-AE-011` · workbook sheet "19. Approval Engine"

#### PRD-AE-031 — TAT & Step-Time Enforcement: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of TAT & Step-Time Enforcement. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use TAT & Step-Time Enforcement to get TAT shown and step durations enforced with overdue flags.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-AE-011` · workbook sheet "19. Approval Engine"

#### PRD-AE-032 — Escalation Matrix: happy path for the Tenant Admin

- **Why it matters.** Prevents bottlenecks; top recurring squad ask. Business use: When an approver (or vendor) does not act in time; the request auto-escalates to the next authority.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Escalation Matrix to get what the story asks for: stalled approvals auto-escalated to the next authority.
  3. Follow the business scenario the workbook gives: "When an approver (or vendor) does not act in time; the request auto-escalates to the next authority".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: non-response doesn't bottleneck the process. The business use case is served: when an approver (or vendor) does not act in time; the request auto-escalates to the next authority.
- **Oracle.** Observable proof that Escalation Matrix did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-012.
- **Trace.** P0 · manual · `FEAT-AE-012` · workbook sheet "19. Approval Engine"

#### PRD-AE-033 — Escalation Matrix: not available on the Growth plan

- **Why it matters.** The workbook limits Escalation Matrix to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Escalation Matrix to get stalled approvals auto-escalated to the next authority.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-AE-012` · workbook sheet "19. Approval Engine"

#### PRD-AE-034 — Escalation Matrix: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Escalation Matrix. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Escalation Matrix to get stalled approvals auto-escalated to the next authority.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-012` · workbook sheet "19. Approval Engine"

#### PRD-AE-035 — Reject & Send-Back Logging: happy path for the Approver

- **Why it matters.** Auditability and clarity. Business use: Rejects and send-backs are logged with reasons and notify stakeholders.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Use Reject & Send-Back Logging to get what the story asks for: rejects and send-backs logged with reasons.
  3. Follow the business scenario the workbook gives: "Rejects and send-backs are logged with reasons and notify stakeholders".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: returns are fully traceable. The business use case is served: rejects and send-backs are logged with reasons and notify stakeholders.
- **Oracle.** Observable proof that Reject & Send-Back Logging did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-016.
- **Trace.** P0 · manual · `FEAT-AE-016` · workbook sheet "19. Approval Engine"

#### PRD-AE-036 — Reject & Send-Back Logging: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Reject & Send-Back Logging. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Reject & Send-Back Logging to get rejects and send-backs logged with reasons.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-016` · workbook sheet "19. Approval Engine"

#### PRD-AE-037 — Vendor Lifecycle Approval Hooks: happy path for the Approver

- **Why it matters.** Consistent vendor governance. Business use: Vendor lifecycle actions (onboarding/amendment/blocking/extension) invoke approval hooks.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Use Vendor Lifecycle Approval Hooks to get what the story asks for: approval hooks across the vendor lifecycle.
  3. Follow the business scenario the workbook gives: "Vendor lifecycle actions (onboarding/amendment/blocking/extension) invoke approval hooks".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: vendor actions stay consistently governed. The business use case is served: vendor lifecycle actions (onboarding/amendment/blocking/extension) invoke approval hooks.
- **Oracle.** Observable proof that Vendor Lifecycle Approval Hooks did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-018.
- **Trace.** P0 · manual · `FEAT-AE-018` · `MOD-01` · workbook sheet "19. Approval Engine"

#### PRD-AE-038 — Vendor Lifecycle Approval Hooks: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Vendor Lifecycle Approval Hooks. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Lifecycle Approval Hooks to get approval hooks across the vendor lifecycle.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-018` · `MOD-01` · workbook sheet "19. Approval Engine"

## 2. Optional features

#### PRD-AE-039 — Initiator-Added Approvers: happy path for the Buyer

- **Why it matters.** Flexibility with governance. Business use: An initiator adds extra approvers ad hoc when a request needs additional review.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Approval Engine.
  2. Add approvers ad hoc.
  3. Follow the business scenario the workbook gives: "An initiator adds extra approvers ad hoc when a request needs additional review".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: include needed reviewers. The business use case is served: an initiator adds extra approvers ad hoc when a request needs additional review.
- **Oracle.** Observable proof that Initiator-Added Approvers did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-006.
- **Trace.** P0 · manual · `FEAT-AE-006` · workbook sheet "19. Approval Engine"

#### PRD-AE-040 — Initiator-Added Approvers: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Initiator-Added Approvers. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Initiator-Added Approvers to add approvers ad hoc.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-AE-006` · workbook sheet "19. Approval Engine"

#### PRD-AE-041 — Dimension-Based Routing: happy path for the Tenant Admin

- **Why it matters.** Accurate authority mapping. Business use: Approvals route by department, state, or category to match the org's authority structure.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Dimension-Based Routing to get what the story asks for: approvals routed by department, state, or category.
  3. Follow the business scenario the workbook gives: "Approvals route by department, state, or category to match the org's authority structure".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: authority mapping matches the organisation's org. The business use case is served: approvals route by department, state, or category to match the org's authority structure.
- **Oracle.** Observable proof that Dimension-Based Routing did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-013.
- **Trace.** P1 · manual · `FEAT-AE-013` · workbook sheet "19. Approval Engine"

#### PRD-AE-042 — Dimension-Based Routing: not available on the Growth plan

- **Why it matters.** The workbook limits Dimension-Based Routing to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Dimension-Based Routing to get approvals routed by department, state, or category.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-AE-013` · workbook sheet "19. Approval Engine"

#### PRD-AE-043 — Dimension-Based Routing: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Dimension-Based Routing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dimension-Based Routing to get approvals routed by department, state, or category.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-013` · workbook sheet "19. Approval Engine"

#### PRD-AE-044 — Mobile Approvals: happy path for the Approver

- **Why it matters.** Faster turnaround. Business use: Approvers act on requests from the mobile app.
- **Setup.**
  Persona: Approver.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Approve from mobile.
  3. Follow the business scenario the workbook gives: "Approvers act on requests from the mobile app".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: act on the go. The business use case is served: approvers act on requests from the mobile app.
- **Oracle.** Observable proof that Mobile Approvals did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-014.
- **Trace.** P0 · manual · `FEAT-AE-014` · workbook sheet "19. Approval Engine"

#### PRD-AE-045 — Mobile Approvals: not available on plans below Growth

- **Why it matters.** The workbook limits Mobile Approvals to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Approver.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the lower-plan tenant.
  2. Try it: use Mobile Approvals to approve from mobile.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-AE-014` · workbook sheet "19. Approval Engine"

#### PRD-AE-046 — Mobile Approvals: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Mobile Approvals. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Mobile Approvals to approve from mobile.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-014` · workbook sheet "19. Approval Engine"

#### PRD-AE-047 — Techno-Commercial Peer Review: happy path for the Approver

- **Why it matters.** Higher-quality decisions. Business use: A techno-commercial peer-review step validates an award across functions before approval.
- **Setup.**
  Persona: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Approval Engine.
  2. Use Techno-Commercial Peer Review to get what the story asks for: a peer-review step combining technical and commercial input.
  3. Follow the business scenario the workbook gives: "A techno-commercial peer-review step validates an award across functions before approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: awards get cross-functional validation. The business use case is served: a techno-commercial peer-review step validates an award across functions before approval.
- **Oracle.** Observable proof that Techno-Commercial Peer Review did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-015.
- **Trace.** P1 · manual · `FEAT-AE-015` · workbook sheet "19. Approval Engine"

#### PRD-AE-048 — Techno-Commercial Peer Review: not available on the Growth plan

- **Why it matters.** The workbook limits Techno-Commercial Peer Review to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Approver.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the lower-plan tenant.
  2. Try it: use Techno-Commercial Peer Review to get a peer-review step combining technical and commercial input.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-AE-015` · workbook sheet "19. Approval Engine"

#### PRD-AE-049 — Techno-Commercial Peer Review: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Techno-Commercial Peer Review. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Techno-Commercial Peer Review to get a peer-review step combining technical and commercial input.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-AE-015` · workbook sheet "19. Approval Engine"

#### PRD-AE-050 — Approvals on Master-Data Creation: happy path for the Tenant Admin

- **Why it matters.** Master-data integrity. Business use: Creation of users, items, and products is routed through approval to govern master data.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Approval Engine.
  2. Use Approvals on Master-Data Creation to get what the story asks for: user, item, and product creation routed through approval.
  3. Follow the business scenario the workbook gives: "Creation of users, items, and products is routed through approval to govern master data".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: master-data changes are governed. The business use case is served: creation of users, items, and products is routed through approval to govern master data.
- **Oracle.** Observable proof that Approvals on Master-Data Creation did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-AE-017.
- **Trace.** P0 · manual · `FEAT-AE-017` · `MOD-12` · workbook sheet "19. Approval Engine"

#### PRD-AE-051 — Approvals on Master-Data Creation: not available on the Growth plan

- **Why it matters.** The workbook limits Approvals on Master-Data Creation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Approvals on Master-Data Creation to get user, item, and product creation routed through approval.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-AE-017` · `MOD-12` · workbook sheet "19. Approval Engine"

#### PRD-AE-052 — Approvals on Master-Data Creation: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Approvals on Master-Data Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Approvals on Master-Data Creation to get user, item, and product creation routed through approval.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-AE-017` · `MOD-12` · workbook sheet "19. Approval Engine"

## 3. Configuration dependencies

#### PRD-AE-053 — Escalation Timeout (Hours) with DoA Threshold Currency correctly configured (DEP-006)

- **Why it matters.** Escalation Timeout (Hours) depends on DoA Threshold Currency. Always configure CONF-AE-001 (DoA Currency) before setting up escalation policies in CONF-AE-002.
- **Setup.**
  Source: CONF-AE-002 "Escalation Timeout (Hours)" (`approval.escalation.timeout_hours`).
  Depends on: CONF-AE-001 "DoA Threshold Currency" (`approval.doa.currency`) (Conditional).
  gate: `approval.escalation.timeout_hours`.
  gate: `approval.doa.currency`.
  Condition: Only matters when DoA matrix thresholds trigger escalation.
  Workbook guidance: Always configure CONF-AE-001 (DoA Currency) before setting up escalation policies in CONF-AE-002.
  DoA Threshold Currency configured correctly.
- **Steps.**
  1. Configure DoA Threshold Currency (CONF-AE-001) correctly.
  2. Configure Escalation Timeout (Hours) (CONF-AE-002).
  3. Exercise the behaviour Escalation Timeout (Hours) controls with the condition true (only matters when DoA matrix thresholds trigger escalation).
- **Expected.** Escalation Timeout (Hours) works as configured; none of the stated failure impact occurs.
- **Oracle.** The impact named in the missing-dependency case (DEP-006) is absent.
- **Trace.** P1 · automate-later · `DEP-006` · `CONF-AE-002` · `CONF-AE-001` · `approval.escalation.timeout_hours` · `approval.doa.currency` · workbook sheet "29. Config Dependencies"

#### PRD-AE-054 — Escalation Timeout (Hours) with DoA Threshold Currency missing or misconfigured (DEP-006)

- **Why it matters.** The workbook states the impact: "If DoA currency is misconfigured, amount-based escalation rules may route to wrong approver level".
- **Setup.**
  Source: CONF-AE-002 "Escalation Timeout (Hours)" (`approval.escalation.timeout_hours`).
  Depends on: CONF-AE-001 "DoA Threshold Currency" (`approval.doa.currency`) (Conditional).
  gate: `approval.escalation.timeout_hours`.
  gate: `approval.doa.currency`.
  Condition: Only matters when DoA matrix thresholds trigger escalation.
  Workbook guidance: Always configure CONF-AE-001 (DoA Currency) before setting up escalation policies in CONF-AE-002.
  DoA Threshold Currency missing or misconfigured.
- **Steps.**
  1. Leave DoA Threshold Currency (CONF-AE-001) missing or misconfigured.
  2. Configure Escalation Timeout (Hours) (CONF-AE-002).
  3. Exercise the behaviour Escalation Timeout (Hours) controls with the condition true (only matters when DoA matrix thresholds trigger escalation).
- **Expected.** The stated impact appears: if DoA currency is misconfigured, amount-based escalation rules may route to wrong approver level.
- **Oracle.** The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.
- **Trace.** P1 · automate-later · `DEP-006` · `CONF-AE-002` · `CONF-AE-001` · `approval.escalation.timeout_hours` · `approval.doa.currency` · workbook sheet "29. Config Dependencies"

#### PRD-AE-055 — Escalation Timeout (Hours): dependency on DoA Threshold Currency does not apply when "Only matters when DoA matrix thresholds trigger escalation" is false (DEP-006)

- **Why it matters.** The dependency is conditional: "Only matters when DoA matrix thresholds trigger escalation". Outside that condition, DoA Threshold Currency must not constrain Escalation Timeout (Hours).
- **Setup.**
  Source: CONF-AE-002 "Escalation Timeout (Hours)" (`approval.escalation.timeout_hours`).
  Depends on: CONF-AE-001 "DoA Threshold Currency" (`approval.doa.currency`) (Conditional).
  gate: `approval.escalation.timeout_hours`.
  gate: `approval.doa.currency`.
  Workbook guidance: Always configure CONF-AE-001 (DoA Currency) before setting up escalation policies in CONF-AE-002.
  Condition NOT met: Only matters when DoA matrix thresholds trigger escalation.
- **Steps.**
  1. Make the condition false.
  2. Leave DoA Threshold Currency unconfigured and configure Escalation Timeout (Hours).
  3. Exercise the behaviour Escalation Timeout (Hours) controls.
- **Expected.** Escalation Timeout (Hours) works without DoA Threshold Currency; the stated impact does not occur.
- **Oracle.** No trace of the impact "If DoA currency is misconfigured, amount-based escalation rules may route to…".
- **Trace.** P1 · automate-later · `DEP-006` · `CONF-AE-002` · `CONF-AE-001` · `approval.escalation.timeout_hours` · `approval.doa.currency` · workbook sheet "29. Config Dependencies"
