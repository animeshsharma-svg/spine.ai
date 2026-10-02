# Product test cases — 05. Purchase Requisition (MOD-02)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-02 · 22 features · 103 cases · group `PRD-PR` · plan availability: Growth, Enterprise · status: GA

Employee-initiated requests to purchase goods or services. Digitise and govern the purchase request process with approvals, budget checks, and GL coding before PO creation.

## 1. Core features

#### PRD-PR-001 — ERP PR Ingestion: happy path for the Buyer

- **Why it matters.** Brings governed ERP demand into Procol without re-keying. Business use: Integrated tenants; only released PRs flow from SAP/Oracle into Procol automatically (drafts are excluded).
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Use ERP PR Ingestion to get what the story asks for: released PRs to flow automatically from the ERP into Procol.
  3. Follow the business scenario the workbook gives: "Integrated tenants; only released PRs flow from SAP/Oracle into Procol automatically (drafts are excluded)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: act on ready-to-source demand without re-keying. The business use case is served: integrated tenants; only released PRs flow from SAP/Oracle into Procol automatically (drafts are excluded).
- **Oracle.** Observable proof that ERP PR Ingestion did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-001.
- **Trace.** P0 · manual · `FEAT-PR-001` · `MOD-11` · `INT-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-002 — ERP PR Ingestion: only released PRs

- **Why it matters.** The workbook records this edge case for ERP PR Ingestion: "Only released PRs".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Only released PRs".
  3. Use ERP PR Ingestion to get released PRs to flow automatically from the ERP into Procol.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ERP PR Ingestion behaves as the workbook states: "Only released PRs".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PR-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-PR-001` · `MOD-11` · `INT-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-003 — ERP PR Ingestion: not available on plans below Growth

- **Why it matters.** The workbook limits ERP PR Ingestion to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use ERP PR Ingestion to get released PRs to flow automatically from the ERP into Procol.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-001` · `MOD-11` · `INT-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-004 — ERP PR Ingestion: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of ERP PR Ingestion. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ERP PR Ingestion to get released PRs to flow automatically from the ERP into Procol.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-001` · `MOD-11` · `INT-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-005 — Configurable PR Dashboard: happy path for the Buyer

- **Why it matters.** Relevant, persistent views improve buyer throughput. Business use: Buyers personalize the PR worklist (columns, freeze, filters) and the layout persists per user across logins.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Arrange, freeze, hide, filter, and save their PR dashboard view.
  3. Follow the business scenario the workbook gives: "Buyers personalize the PR worklist (columns, freeze, filters) and the layout persists per user across logins".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: work their queue the way that suits them. The business use case is served: buyers personalize the PR worklist (columns, freeze, filters) and the layout persists per user across logins.
- **Oracle.** Observable proof that Configurable PR Dashboard did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-002.
- **Trace.** P0 · manual · `FEAT-PR-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-006 — Configurable PR Dashboard: saved view persists per user

- **Why it matters.** The workbook records this edge case for Configurable PR Dashboard: "Saved view persists per user".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Saved view persists per user".
  3. Use Configurable PR Dashboard to arrange, freeze, hide, filter, and save their PR dashboard view.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Configurable PR Dashboard behaves as the workbook states: "Saved view persists per user".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PR-002 quoting the note.
- **Trace.** P3 · manual · `FEAT-PR-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-007 — Configurable PR Dashboard: not available on plans below Growth

- **Why it matters.** The workbook limits Configurable PR Dashboard to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Configurable PR Dashboard to arrange, freeze, hide, filter, and save their PR dashboard view.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-008 — Configurable PR Dashboard: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Configurable PR Dashboard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable PR Dashboard to arrange, freeze, hide, filter, and save their PR dashboard view.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-002` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-009 — PR Status Buckets: happy path for the Buyer

- **Why it matters.** Clear lifecycle visibility per line item. Business use: Buyers track each PR line across Open/In-Progress/Completed/Hold/Draft buckets throughout the sourcing cycle.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Use PR Status Buckets to get what the story asks for: PR line items tracked across Open, In-Progress, Completed, Hold, and Draft.
  3. Follow the business scenario the workbook gives: "Buyers track each PR line across Open/In-Progress/Completed/Hold/Draft buckets throughout the sourcing cycle".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: see where each item sits in the sourcing cycle. The business use case is served: buyers track each PR line across Open/In-Progress/Completed/Hold/Draft buckets throughout the sourcing cycle.
- **Oracle.** Observable proof that PR Status Buckets did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-003.
- **Trace.** P0 · manual · `FEAT-PR-003` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-010 — PR Status Buckets: tenant configuration — Statuses configurable and filterable

- **Why it matters.** The workbook says "Statuses configurable and filterable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Buyer (to use the feature).
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Statuses configurable and filterable") and record its current value.
  2. As the Buyer: use PR Status Buckets to get PR line items tracked across Open, In-Progress, Completed, Hold, and Draft.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs PR Status Buckets follows the tenant's configured value, as the workbook states: "Statuses configurable and filterable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-PR-003` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-011 — PR Status Buckets: not available on plans below Growth

- **Why it matters.** The workbook limits PR Status Buckets to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Status Buckets to get PR line items tracked across Open, In-Progress, Completed, Hold, and Draft.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-003` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-012 — PR Status Buckets: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Status Buckets. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Status Buckets to get PR line items tracked across Open, In-Progress, Completed, Hold, and Draft.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-003` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-013 — PR Hold and ERP Send-Back: happy path for the Buyer

- **Why it matters.** Resolves requirement ambiguity without losing the PR. Business use: When a requirement is ambiguous; the buyer holds the line and sends it back to the ERP for the requester to correct.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Hold an ambiguous PR line and send it back to the ERP for correction.
  3. Follow the business scenario the workbook gives: "When a requirement is ambiguous; the buyer holds the line and sends it back to the ERP for the requester to correct".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: resolve unclear demand without losing the PR. The business use case is served: when a requirement is ambiguous; the buyer holds the line and sends it back to the ERP for the requester to correct.
- **Oracle.** Observable proof that PR Hold and ERP Send-Back did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-004.
- **Trace.** P0 · manual · `FEAT-PR-004` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-014 — PR Hold and ERP Send-Back: round-trips to ERP

- **Why it matters.** The workbook records this edge case for PR Hold and ERP Send-Back: "Round-trips to ERP".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Round-trips to ERP".
  3. Use PR Hold and ERP Send-Back to hold an ambiguous PR line and send it back to the ERP for correction.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** PR Hold and ERP Send-Back behaves as the workbook states: "Round-trips to ERP".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PR-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-PR-004` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-015 — PR Hold and ERP Send-Back: not available on the Growth plan

- **Why it matters.** The workbook limits PR Hold and ERP Send-Back to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Hold and ERP Send-Back to hold an ambiguous PR line and send it back to the ERP for correction.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-004` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-016 — PR Hold and ERP Send-Back: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Hold and ERP Send-Back. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Hold and ERP Send-Back to hold an ambiguous PR line and send it back to the ERP for correction.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-004` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-017 — PR Detail View: happy path for the Buyer

- **Why it matters.** Context for processing decisions. Business use: Buyers open a PR to inspect all its line items, statuses, and the requisitioner before processing.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Use PR Detail View to get what the story asks for: a PR detail view showing all line items, their statuses, and the requisitioner.
  3. Follow the business scenario the workbook gives: "Buyers open a PR to inspect all its line items, statuses, and the requisitioner before processing".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: make informed processing decisions. The business use case is served: buyers open a PR to inspect all its line items, statuses, and the requisitioner before processing.
- **Oracle.** Observable proof that PR Detail View did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-005.
- **Trace.** P0 · manual · `FEAT-PR-005` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-018 — PR Detail View: not available on plans below Growth

- **Why it matters.** The workbook limits PR Detail View to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Detail View to get a PR detail view showing all line items, their statuses, and the requisitioner.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-005` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-019 — PR Detail View: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Detail View. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Detail View to get a PR detail view showing all line items, their statuses, and the requisitioner.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-005` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-020 — PR Sync Modes (Real-time / Batch): happy path for the Tenant Admin

- **Why it matters.** Different ERP landscapes need different sync modes. Business use: At integration setup; PR ingestion is configured as real-time on release or scheduled batch to suit the ERP.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
  gate: `integration.sap.pr.sync_mode` at its default (Push (SAP → Procol)) — CONF-INT-001 "SAP PR Sync Mode".
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Purchase Requisition.
  2. Use PR Sync Modes (Real-time / Batch) to get what the story asks for: PR sync configurable as real-time or scheduled batch.
  3. Follow the business scenario the workbook gives: "At integration setup; PR ingestion is configured as real-time on release or scheduled batch to suit the ERP".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: align ingestion with the organisation's ERP's capability. The business use case is served: at integration setup; PR ingestion is configured as real-time on release or scheduled batch to suit the ERP.
- **Oracle.** Observable proof that PR Sync Modes (Real-time / Batch) did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-006.
- **Trace.** P0 · manual · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-021 — SAP PR Sync Mode (integration.sap.pr.sync_mode) = Push (SAP → Procol) (default)

- **Why it matters.** Different SAP landscapes have different integration capabilities. Some S/4HANA environments support event-driven push; others require scheduled polling. This config avoids hardcoding integration mode in code.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (Plan Required: Enterprise).
  gate: `integration.sap.pr.sync_mode` = Push (SAP → Procol) (default: Push (SAP → Procol)) — CONF-INT-001 "SAP PR Sync Mode", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `integration.sap.pr.sync_mode` to Push (SAP → Procol).
  2. As a Tenant Admin: use PR Sync Modes (Real-time / Batch) to get PR sync configurable as real-time or scheduled batch.
  3. Observe the behaviour the setting controls: controls the direction of Purchase Requisition data flow between SAP and Procol.
- **Expected.** With Push (SAP → Procol) selected, the behaviour follows it. What the setting controls: Controls the direction of Purchase Requisition data flow between SAP and Procol.
- **Oracle.** The behaviour in step 3 matches Push (SAP → Procol).
- **Trace.** P1 · automate-later · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "25. Configuration Reference"

#### PRD-PR-022 — SAP PR Sync Mode (integration.sap.pr.sync_mode) = Pull (Procol polls SAP)

- **Why it matters.** Different SAP landscapes have different integration capabilities. Some S/4HANA environments support event-driven push; others require scheduled polling. This config avoids hardcoding integration mode in code.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (Plan Required: Enterprise).
  gate: `integration.sap.pr.sync_mode` = Pull (Procol polls SAP) (default: Push (SAP → Procol)) — CONF-INT-001 "SAP PR Sync Mode", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `integration.sap.pr.sync_mode` to Pull (Procol polls SAP).
  2. As a Tenant Admin: use PR Sync Modes (Real-time / Batch) to get PR sync configurable as real-time or scheduled batch.
  3. Observe the behaviour the setting controls: controls the direction of Purchase Requisition data flow between SAP and Procol.
- **Expected.** With Pull (Procol polls SAP) selected, the behaviour follows it. What the setting controls: Controls the direction of Purchase Requisition data flow between SAP and Procol. Stated business impact: Affects data freshness and system load; Bidirectional mode requires conflict resolution logic to be configured.
- **Oracle.** The behaviour in step 3 matches Pull (Procol polls SAP) and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "25. Configuration Reference"

#### PRD-PR-023 — SAP PR Sync Mode (integration.sap.pr.sync_mode) = Bidirectional

- **Why it matters.** Different SAP landscapes have different integration capabilities. Some S/4HANA environments support event-driven push; others require scheduled polling. This config avoids hardcoding integration mode in code.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (Plan Required: Enterprise).
  gate: `integration.sap.pr.sync_mode` = Bidirectional (default: Push (SAP → Procol)) — CONF-INT-001 "SAP PR Sync Mode", Dropdown, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `integration.sap.pr.sync_mode` to Bidirectional.
  2. As a Tenant Admin: use PR Sync Modes (Real-time / Batch) to get PR sync configurable as real-time or scheduled batch.
  3. Observe the behaviour the setting controls: controls the direction of Purchase Requisition data flow between SAP and Procol.
- **Expected.** With Bidirectional selected, the behaviour follows it. What the setting controls: Controls the direction of Purchase Requisition data flow between SAP and Procol. Stated business impact: Affects data freshness and system load; Bidirectional mode requires conflict resolution logic to be configured.
- **Oracle.** The behaviour in step 3 matches Bidirectional and differs from the default.
- **Trace.** P1 · automate-later · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "25. Configuration Reference"

#### PRD-PR-024 — SAP PR Sync Mode (integration.sap.pr.sync_mode): not available on the Growth plan

- **Why it matters.** The Configuration Reference limits SAP PR Sync Mode to "Enterprise".
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001.
- **Steps.**
  1. As the Tenant Admin on the lower-plan tenant, try to change `integration.sap.pr.sync_mode`.
  2. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the setting is not available to change. On Enterprise it is.
- **Oracle.** The setting is absent or refused on the lower plan and available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "25. Configuration Reference"

#### PRD-PR-025 — PR Sync Modes (Real-time / Batch): not available on plans below Growth

- **Why it matters.** The workbook limits PR Sync Modes (Real-time / Batch) to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use PR Sync Modes (Real-time / Batch) to get PR sync configurable as real-time or scheduled batch.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-026 — PR Sync Modes (Real-time / Batch): refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of PR Sync Modes (Real-time / Batch). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Sync Modes (Real-time / Batch) to get PR sync configurable as real-time or scheduled batch.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-PR-006` · `integration.sap.pr.sync_mode` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-027 — Reassign Line Item: happy path for the Procurement Manager

- **Why it matters.** Operational flexibility. Business use: When an owner is unavailable; a permissioned user reassigns the PR line to someone else.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Purchase Requisition.
  2. Reassign a PR line item to another user.
  3. Follow the business scenario the workbook gives: "When an owner is unavailable; a permissioned user reassigns the PR line to someone else".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: reroute work when an owner is unavailable. The business use case is served: when an owner is unavailable; a permissioned user reassigns the PR line to someone else.
- **Oracle.** Observable proof that Reassign Line Item did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-009.
- **Trace.** P0 · manual · `FEAT-PR-009` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-028 — Reassign Line Item: not available on plans below Growth

- **Why it matters.** The workbook limits Reassign Line Item to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Reassign Line Item to reassign a PR line item to another user.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-009` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-029 — Reassign Line Item: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Reassign Line Item and marks it RBAC-gated. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Reassign Line Item to reassign a PR line item to another user.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-PR-009` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-030 — Bulk Consolidate Across PRs: happy path for the Buyer

- **Why it matters.** Fewer, larger events. Business use: Buyers select lines across several PRs and consolidate them into a single event.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Consolidate line items across multiple PRs into one event.
  3. Follow the business scenario the workbook gives: "Buyers select lines across several PRs and consolidate them into a single event".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: run fewer, larger sourcing events. The business use case is served: buyers select lines across several PRs and consolidate them into a single event.
- **Oracle.** Observable proof that Bulk Consolidate Across PRs did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-011.
- **Trace.** P0 · manual · `FEAT-PR-011` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-031 — Bulk Consolidate Across PRs: not available on plans below Growth

- **Why it matters.** The workbook limits Bulk Consolidate Across PRs to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Bulk Consolidate Across PRs to consolidate line items across multiple PRs into one event.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-011` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-032 — Bulk Consolidate Across PRs: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Bulk Consolidate Across PRs. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk Consolidate Across PRs to consolidate line items across multiple PRs into one event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-011` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-033 — Line-Item Quantity Split: happy path for the Buyer

- **Why it matters.** Phased or partial sourcing. Business use: When sourcing part of a line now (e.g., 500 of 1,000); the buyer splits the quantity, capped at the PR amount.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Split a line item's quantity (capped at the PR amount) before an event.
  3. Follow the business scenario the workbook gives: "When sourcing part of a line now (e.g., 500 of 1,000); the buyer splits the quantity, capped at the PR amount".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: source partial quantities now. The business use case is served: when sourcing part of a line now (e.g., 500 of 1,000); the buyer splits the quantity, capped at the PR amount.
- **Oracle.** Observable proof that Line-Item Quantity Split did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-012.
- **Trace.** P0 · manual · `FEAT-PR-012` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-034 — Line-Item Quantity Split: cannot exceed PR quantity

- **Why it matters.** The workbook records this edge case for Line-Item Quantity Split: "Cannot exceed PR quantity".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Cannot exceed PR quantity".
  3. Use Line-Item Quantity Split to split a line item's quantity (capped at the PR amount) before an event.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Line-Item Quantity Split behaves as the workbook states: "Cannot exceed PR quantity".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PR-012 quoting the note.
- **Trace.** P2 · manual · `FEAT-PR-012` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-035 — Line-Item Quantity Split: not available on plans below Growth

- **Why it matters.** The workbook limits Line-Item Quantity Split to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Line-Item Quantity Split to split a line item's quantity (capped at the PR amount) before an event.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-012` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-036 — Line-Item Quantity Split: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Line-Item Quantity Split. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Line-Item Quantity Split to split a line item's quantity (capped at the PR amount) before an event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-012` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-037 — Bulk ARC Processing: happy path for the Buyer

- **Why it matters.** Throughput for rate-contract items. Business use: Buyers bulk-select many contracted items and push them through the ARC route at once.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Bulk-process items through the ARC route.
  3. Follow the business scenario the workbook gives: "Buyers bulk-select many contracted items and push them through the ARC route at once".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: clear many contracted items at once. The business use case is served: buyers bulk-select many contracted items and push them through the ARC route at once.
- **Oracle.** Observable proof that Bulk ARC Processing did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-015.
- **Trace.** P0 · manual · `FEAT-PR-015` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-038 — Bulk ARC Processing: not available on the Growth plan

- **Why it matters.** The workbook limits Bulk ARC Processing to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Bulk ARC Processing to bulk-process items through the ARC route.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-015` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-039 — Bulk ARC Processing: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Bulk ARC Processing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk ARC Processing to bulk-process items through the ARC route.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-015` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-040 — Add to Draft RFX from PR: happy path for the Buyer

- **Why it matters.** Incremental event assembly. Business use: Buyers add selected PR lines to an in-progress draft event over time.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Append PR line items to an existing draft RFX.
  3. Follow the business scenario the workbook gives: "Buyers add selected PR lines to an in-progress draft event over time".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: build up an event incrementally. The business use case is served: buyers add selected PR lines to an in-progress draft event over time.
- **Oracle.** Observable proof that Add to Draft RFX from PR did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-016.
- **Trace.** P0 · manual · `FEAT-PR-016` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-041 — Add to Draft RFX from PR: not available on plans below Growth

- **Why it matters.** The workbook limits Add to Draft RFX from PR to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Add to Draft RFX from PR to append PR line items to an existing draft RFX.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-016` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-042 — Add to Draft RFX from PR: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Add to Draft RFX from PR. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Add to Draft RFX from PR to append PR line items to an existing draft RFX.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-016` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-043 — PR Amendment Flow: happy path for the Buyer

- **Why it matters.** Controlled demand changes. Business use: When demand changes; buyers amend PR lines with re-validation and approval.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Amend PR line items with re-validation and approval.
  3. Follow the business scenario the workbook gives: "When demand changes; buyers amend PR lines with re-validation and approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: revise demand in a controlled way. The business use case is served: when demand changes; buyers amend PR lines with re-validation and approval.
- **Oracle.** Observable proof that PR Amendment Flow did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-019.
- **Trace.** P0 · manual · `FEAT-PR-019` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-044 — PR Amendment Flow: not available on plans below Growth

- **Why it matters.** The workbook limits PR Amendment Flow to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Amendment Flow to amend PR line items with re-validation and approval.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-019` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-045 — PR Amendment Flow: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Amendment Flow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Amendment Flow to amend PR line items with re-validation and approval.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-019` · workbook sheet "5. Purchase Requisition"

## 2. Optional features

#### PRD-PR-046 — Line-Item Assignment Rule Engine: happy path for the Procurement Manager

- **Why it matters.** Removes manual triage of incoming PRs. Business use: As PRs arrive; rule-based routing auto-assigns lines to buyers by category, location, or value.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Purchase Requisition.
  2. Use Line-Item Assignment Rule Engine to get what the story asks for: PR line items auto-assigned by category, location, and value rules.
  3. Follow the business scenario the workbook gives: "As PRs arrive; rule-based routing auto-assigns lines to buyers by category, location, or value".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: route demand to the right buyer without manual triage. The business use case is served: as PRs arrive; rule-based routing auto-assigns lines to buyers by category, location, or value.
- **Oracle.** Observable proof that Line-Item Assignment Rule Engine did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-007.
- **Trace.** P1 · manual · `FEAT-PR-007` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-047 — Line-Item Assignment Rule Engine: not available on plans below Growth

- **Why it matters.** The workbook limits Line-Item Assignment Rule Engine to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Line-Item Assignment Rule Engine to get PR line items auto-assigned by category, location, and value rules.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-007` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-048 — Line-Item Assignment Rule Engine: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Line-Item Assignment Rule Engine. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Line-Item Assignment Rule Engine to get PR line items auto-assigned by category, location, and value rules.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-PR-007` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-049 — ERP Assignee Auto-Mapping: happy path for the Buyer

- **Why it matters.** Fallback assignment without rule setup. Business use: Where no routing rule exists but the PR carries an ERP assignee; it is mapped to the matching Procol user.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Use ERP Assignee Auto-Mapping to get what the story asks for: the PR's ERP assignee mapped to a Procol user when no rule exists.
  3. Follow the business scenario the workbook gives: "Where no routing rule exists but the PR carries an ERP assignee; it is mapped to the matching Procol user".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: ownership is honored without extra setup. The business use case is served: where no routing rule exists but the PR carries an ERP assignee; it is mapped to the matching Procol user.
- **Oracle.** Observable proof that ERP Assignee Auto-Mapping did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-008.
- **Trace.** P1 · manual · `FEAT-PR-008` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-050 — ERP Assignee Auto-Mapping: not available on plans below Growth

- **Why it matters.** The workbook limits ERP Assignee Auto-Mapping to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use ERP Assignee Auto-Mapping to get the PR's ERP assignee mapped to a Procol user when no rule exists.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-008` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-051 — ERP Assignee Auto-Mapping: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of ERP Assignee Auto-Mapping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ERP Assignee Auto-Mapping to get the PR's ERP assignee mapped to a Procol user when no rule exists.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-008` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-052 — PR Grouping and Consolidation Engine: happy path for the Buyer

- **Why it matters.** Consolidation improves leverage and reduces event count. Business use: Before sourcing; buyers group lines by category/location/vendor within guardrails and float an RFX from the group.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Group line items by category, location, or vendor within guardrails and float an RFX from the group.
  3. Follow the business scenario the workbook gives: "Before sourcing; buyers group lines by category/location/vendor within guardrails and float an RFX from the group".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: consolidate demand for better leverage. The business use case is served: before sourcing; buyers group lines by category/location/vendor within guardrails and float an RFX from the group.
- **Oracle.** Observable proof that PR Grouping and Consolidation Engine did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-010.
- **Trace.** P1 · manual · `FEAT-PR-010` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-053 — PR Grouping and Consolidation Engine: not available on plans below Growth

- **Why it matters.** The workbook limits PR Grouping and Consolidation Engine to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Grouping and Consolidation Engine to group line items by category, location, or vendor within guardrails and float an RFX from the group.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-010` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-054 — PR Grouping and Consolidation Engine: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Grouping and Consolidation Engine. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Grouping and Consolidation Engine to group line items by category, location, or vendor within guardrails and float an RFX from the group.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-010` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-055 — ARC Item Tagging: happy path for the Buyer

- **Why it matters.** Avoids redundant sourcing for rate-contracted items. Business use: For items under an Annual Rate Contract; buyers tag them and route straight to PO, skipping sourcing.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Use ARC Item Tagging to get what the story asks for: ARC-tagged items to skip sourcing and go straight to PO.
  3. Follow the business scenario the workbook gives: "For items under an Annual Rate Contract; buyers tag them and route straight to PO, skipping sourcing".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: avoid redundant events for rate-contracted items. The business use case is served: for items under an Annual Rate Contract; buyers tag them and route straight to PO, skipping sourcing.
- **Oracle.** Observable proof that ARC Item Tagging did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-013.
- **Trace.** P1 · manual · `FEAT-PR-013` · `MOD-06` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-056 — ARC Item Tagging: not available on the Growth plan

- **Why it matters.** The workbook limits ARC Item Tagging to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use ARC Item Tagging to get ARC-tagged items to skip sourcing and go straight to PO.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-013` · `MOD-06` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-057 — ARC Item Tagging: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of ARC Item Tagging. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ARC Item Tagging to get ARC-tagged items to skip sourcing and go straight to PO.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-013` · `MOD-06` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-058 — Reorder Flow: happy path for the Buyer

- **Why it matters.** Speeds repeat procurement. Business use: When a matching item was bought within the lookback window; the buyer re-awards to the same vendor without an RFX.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Use Reorder Flow to get what the story asks for: a reorder option to re-award to the previous vendor within a lookback window.
  3. Follow the business scenario the workbook gives: "When a matching item was bought within the lookback window; the buyer re-awards to the same vendor without an RFX".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: repeat recent purchases without an RFX. The business use case is served: when a matching item was bought within the lookback window; the buyer re-awards to the same vendor without an RFX.
- **Oracle.** Observable proof that Reorder Flow did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-014.
- **Trace.** P1 · manual · `FEAT-PR-014` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-059 — Reorder Flow: window per SOP

- **Why it matters.** The workbook records this edge case for Reorder Flow: "Window per SOP".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Window per SOP".
  3. Use Reorder Flow to get a reorder option to re-award to the previous vendor within a lookback window.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Reorder Flow behaves as the workbook states: "Window per SOP".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PR-014 quoting the note.
- **Trace.** P2 · manual · `FEAT-PR-014` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-060 — Reorder Flow: not available on the Growth plan

- **Why it matters.** The workbook limits Reorder Flow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Reorder Flow to get a reorder option to re-award to the previous vendor within a lookback window.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-014` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-061 — Reorder Flow: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Reorder Flow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Reorder Flow to get a reorder option to re-award to the previous vendor within a lookback window.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-014` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-062 — PR Ageing Auto-Lock: happy path for the Procurement Manager

- **Why it matters.** Prevents acting on outdated requirements. Business use: PRs left unactioned past a threshold are auto-locked from sourcing until reviewed.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Purchase Requisition.
  2. Use PR Ageing Auto-Lock to get what the story asks for: PRs older than a threshold locked from sourcing.
  3. Follow the business scenario the workbook gives: "PRs left unactioned past a threshold are auto-locked from sourcing until reviewed".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: force review of stale demand before acting on it. The business use case is served: PRs left unactioned past a threshold are auto-locked from sourcing until reviewed.
- **Oracle.** Observable proof that PR Ageing Auto-Lock did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-017.
- **Trace.** P1 · manual · `FEAT-PR-017` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-063 — PR Ageing Auto-Lock: not available on the Growth plan

- **Why it matters.** The workbook limits PR Ageing Auto-Lock to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use PR Ageing Auto-Lock to get PRs older than a threshold locked from sourcing.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-017` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-064 — PR Ageing Auto-Lock: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of PR Ageing Auto-Lock. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Ageing Auto-Lock to get PRs older than a threshold locked from sourcing.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-PR-017` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-065 — PR Linkage to Non-PR Event: happy path for the Buyer

- **Why it matters.** Connects ad-hoc events back to demand. Business use: Buyers link a PR to a standalone (non-PR) event to tie ad-hoc sourcing back to demand.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Link a PR to a standalone event.
  3. Follow the business scenario the workbook gives: "Buyers link a PR to a standalone (non-PR) event to tie ad-hoc sourcing back to demand".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: connect ad-hoc sourcing back to demand. The business use case is served: buyers link a PR to a standalone (non-PR) event to tie ad-hoc sourcing back to demand.
- **Oracle.** Observable proof that PR Linkage to Non-PR Event did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-018.
- **Trace.** P1 · manual · `FEAT-PR-018` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-066 — PR Linkage to Non-PR Event: not available on plans below Growth

- **Why it matters.** The workbook limits PR Linkage to Non-PR Event to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Linkage to Non-PR Event to link a PR to a standalone event.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-018` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-067 — PR Linkage to Non-PR Event: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Linkage to Non-PR Event. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Linkage to Non-PR Event to link a PR to a standalone event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-018` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-068 — Bulk PR Upload: happy path for the Procurement Manager

- **Why it matters.** Non-integrated demand entry at scale. Business use: Non-integrated tenants bulk-upload PRs (with assignee and preferred vendor) via template.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Purchase Requisition.
  2. Bulk-upload PRs via template.
  3. Follow the business scenario the workbook gives: "Non-integrated tenants bulk-upload PRs (with assignee and preferred vendor) via template".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: load demand at scale without an ERP feed. The business use case is served: non-integrated tenants bulk-upload PRs (with assignee and preferred vendor) via template.
- **Oracle.** Observable proof that Bulk PR Upload did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-020.
- **Trace.** P1 · manual · `FEAT-PR-020` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-069 — Bulk PR Upload: not available on plans below Growth

- **Why it matters.** The workbook limits Bulk PR Upload to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Bulk PR Upload to bulk-upload PRs via template.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-PR-020` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-070 — Bulk PR Upload: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Bulk PR Upload. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk PR Upload to bulk-upload PRs via template.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-PR-020` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-071 — Off-Platform & Partial PR Closure: happy path for the Buyer

- **Why it matters.** Accurate demand closure. Business use: Buyers reconcile demand handled off-platform or partially fulfilled by closing/short-closing lines with approval.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Short-close or close off-platform PRs with approval.
  3. Follow the business scenario the workbook gives: "Buyers reconcile demand handled off-platform or partially fulfilled by closing/short-closing lines with approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: reconcile demand accurately. The business use case is served: buyers reconcile demand handled off-platform or partially fulfilled by closing/short-closing lines with approval.
- **Oracle.** Observable proof that Off-Platform & Partial PR Closure did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-021.
- **Trace.** P1 · manual · `FEAT-PR-021` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-072 — Off-Platform & Partial PR Closure: short close needs approval

- **Why it matters.** The workbook records this edge case for Off-Platform & Partial PR Closure: "Short close needs approval".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Short close needs approval".
  3. Use Off-Platform & Partial PR Closure to short-close or close off-platform PRs with approval.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Off-Platform & Partial PR Closure behaves as the workbook states: "Short close needs approval".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-PR-021 quoting the note.
- **Trace.** P2 · manual · `FEAT-PR-021` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-073 — Off-Platform & Partial PR Closure: not available on the Growth plan

- **Why it matters.** The workbook limits Off-Platform & Partial PR Closure to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Off-Platform & Partial PR Closure to short-close or close off-platform PRs with approval.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-021` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-074 — Off-Platform & Partial PR Closure: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Off-Platform & Partial PR Closure. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Off-Platform & Partial PR Closure to short-close or close off-platform PRs with approval.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-021` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-075 — PR Collator: happy path for the Buyer

- **Why it matters.** Consolidated supplier engagement. Business use: Buyers collate multiple PRs into a single supplier window for aggregated engagement.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Purchase Requisition.
  2. Collate multiple PRs into one supplier window.
  3. Follow the business scenario the workbook gives: "Buyers collate multiple PRs into a single supplier window for aggregated engagement".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: engage a supplier across aggregated demand. The business use case is served: buyers collate multiple PRs into a single supplier window for aggregated engagement.
- **Oracle.** Observable proof that PR Collator did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-PR-022.
- **Trace.** P1 · manual · `FEAT-PR-022` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-076 — PR Collator: not available on the Growth plan

- **Why it matters.** The workbook limits PR Collator to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use PR Collator to collate multiple PRs into one supplier window.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-PR-022` · workbook sheet "5. Purchase Requisition"

#### PRD-PR-077 — PR Collator: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of PR Collator. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PR Collator to collate multiple PRs into one supplier window.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-PR-022` · workbook sheet "5. Purchase Requisition"

## 3. Workflow WF-PR-001 — PR Approval

#### PRD-PR-078 — PR Approval (WF-PR-001): end-to-end order of steps

- **Why it matters.** Every pr approval must pass through the same governed chain; a skipped or reordered step is a control failure.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Workflow WF-PR-001 as configured in the workbook (4 steps).
- **Steps.**
  1. Cause the trigger: employee submits Purchase Requisition.
  2. Let step 1 "Budget Check" (System Validation, System (Auto)) complete.
  3. Let step 2 "Line Manager Approval" (Approval, Requestor's Line Manager) complete with an approval.
  4. Let step 3 "Finance Approval" (Approval, Finance Controller) complete with an approval.
  5. Let step 4 "PR-to-PO Conversion" (System Action, System / Buyer) complete.
- **Expected.** The steps run in this order: 1. Budget Check (System (Auto)) → 2. Line Manager Approval (Requestor's Line Manager) → 3. Finance Approval (Finance Controller) → 4. PR-to-PO Conversion (System / Buyer). At the end: Auto-converts to PO if template mapped; else Buyer manually creates PO.
- **Oracle.** The workflow's history shows each step, its actor and its outcome in the order above, and nothing out of sequence.
- **Trace.** P0 · automate-later · `WF-PR-001` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-079 — PR Approval: step 1 "Budget Check" runs automatically

- **Why it matters.** Step 1 is a System Validation step performed by System (Auto); if it does not run, everything after it rests on an unchecked premise.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
- **Steps.**
  1. Cause the trigger: employee submits Purchase Requisition.
  2. Let the workflow reach step 1 "Budget Check".
- **Expected.** Step 1 is carried out by System (Auto) without manual action (workbook: "Checks available budget against GL code; blocks if exceeded"), and the workflow moves on.
- **Oracle.** The workflow history records step 1 as done by System (Auto) and step 2 becomes active.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 1` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-080 — PR Approval: step 1 "Budget Check" blocks if exceeded

- **Why it matters.** The workbook says the step "Checks available budget against GL code; blocks if exceeded". Letting the item through defeats the check.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Workbook note for the step: Checks available budget against GL code; blocks if exceeded.
- **Steps.**
  1. Cause the trigger with an item for which the step's check fails — the "exceeded" case the note describes.
  2. Let the workflow reach step 1.
- **Expected.** The workflow is blocked at step 1 "Budget Check".
- **Oracle.** No later step becomes active; the item is shown as blocked at step 1.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 1` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-081 — PR Approval: step 2 "Line Manager Approval" routes to Requestor's Line Manager

- **Why it matters.** Approval 2 belongs to Requestor's Line Manager; routing it anywhere else puts the decision in the wrong hands.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Approval mode: Sequential.
  Requestor's Line Manager user exists on the tenant.
- **Steps.**
  1. Cause the trigger: employee submits Purchase Requisition.
  2. Complete the steps before step 2.
  3. Check who has the pending approval.
- **Expected.** The approval for step 2 "Line Manager Approval" is assigned to the Requestor's Line Manager, and only after the previous step has completed (sequential).
- **Oracle.** The pending-approval record for step 2 names Requestor's Line Manager as the approver.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-082 — PR Approval: step 2 "Line Manager Approval" is not routed before step 1 completes

- **Why it matters.** The approval mode is Sequential; an approver who sees an item before the previous level decides is approving out of order.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Step 1 still pending.
- **Steps.**
  1. Cause the trigger.
  2. Leave step 1 undecided.
  3. Check the Requestor's Line Manager's pending approvals.
- **Expected.** Nothing is pending for the Requestor's Line Manager at step 2 until step 1 completes.
- **Oracle.** No step-2 approval record exists while step 1 is pending; it appears once that step completes.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-083 — PR Approval: step 2 escalates to Department Head after 24h

- **Why it matters.** An approval left with the Requestor's Line Manager beyond its 24-hour SLA stalls the pr approval; escalation is the control that unblocks it.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  SLA for step 2: 24 hours; escalation to Department Head.
- **Steps.**
  1. Route an item to step 2 (Requestor's Line Manager).
  2. Leave it undecided for more than 24 hours.
- **Expected.** After 24 hours without action the approval escalates to the Department Head.
- **Oracle.** The approval history shows the SLA breach and the Department Head as the new or added approver.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-084 — PR Approval: step 2 does not escalate before 24h

- **Why it matters.** Escalating early takes the decision away from the Requestor's Line Manager before their SLA is up.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  SLA for step 2: 24 hours.
- **Steps.**
  1. Route an item to step 2 (Requestor's Line Manager).
  2. Check its state shortly before 24 hours have passed.
- **Expected.** The approval is still with the Requestor's Line Manager; nothing has gone to the Department Head.
- **Oracle.** No escalation entry exists before the 24-hour mark.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-085 — PR Approval: step 2 bypassed when "Amount ≤ INR 10,000 and vendor pre-approved"

- **Why it matters.** The workbook's bypass condition for step 2 is "Amount ≤ INR 10,000 and vendor pre-approved". Requiring the approval anyway adds friction the tenant chose to remove.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Bypass condition holds: Amount ≤ INR 10,000 and vendor pre-approved.
  Amount at the boundary: INR 10,000.
- **Steps.**
  1. Cause the trigger so that every part of the bypass condition holds (amount exactly INR 10,000).
  2. Follow the workflow to step 2.
- **Expected.** Step 2 "Line Manager Approval" is bypassed — no approval is requested from the Requestor's Line Manager.
- **Oracle.** The workflow history shows step 2 skipped under its bypass condition and the next step active.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-086 — PR Approval: step 2 not bypassed at INR 10,001 (just past the threshold)

- **Why it matters.** The bypass threshold is "Amount ≤ INR 10,000". One unit past it, the approval must be required.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Amount: INR 10,001; every other part of the bypass condition holds.
- **Steps.**
  1. Cause the trigger with amount INR 10,001 and the rest of the condition true.
  2. Follow the workflow to step 2.
- **Expected.** Step 2 "Line Manager Approval" is required and routed to the Requestor's Line Manager.
- **Oracle.** A pending step-2 approval exists for the Requestor's Line Manager.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-087 — PR Approval: step 2 not bypassed when "vendor pre-approved" does not hold

- **Why it matters.** The bypass needs all of "Amount ≤ INR 10,000 and vendor pre-approved". If one part fails, the approval must stand.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Not true: vendor pre-approved; every other part of the bypass condition holds.
- **Steps.**
  1. Cause the trigger with "vendor pre-approved" false and the amount within the threshold (INR 10,000).
  2. Follow the workflow to step 2.
- **Expected.** Step 2 "Line Manager Approval" is required and routed to the Requestor's Line Manager.
- **Oracle.** A pending step-2 approval exists for the Requestor's Line Manager.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-088 — PR Approval: step 2 "Line Manager Approval" follows the tenant's configuration

- **Why it matters.** The workbook marks step 2 tenant-configurable; note: Bypass threshold is configurable. The workflow must follow what the tenant set, not a fixed default.
- **Setup.**
  Persona: Tenant Admin.
  Trigger: Employee submits Purchase Requisition.
  Workbook note: Bypass threshold is configurable.
- **Steps.**
  1. As a Tenant Admin, change the configurable part of step 2 — bypass threshold is configurable.
  2. Cause the trigger and follow the workflow to step 2.
- **Expected.** Step 2 behaves according to the new configuration.
- **Oracle.** The step's routing/timing observed after the change matches the configured values, and differs from before the change.
- **Trace.** P1 · automate-later · `WF-PR-001` · `WF-PR-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-089 — PR Approval: step 3 "Finance Approval" routes to Finance Controller

- **Why it matters.** Approval 3 belongs to Finance Controller; routing it anywhere else puts the decision in the wrong hands.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Approval mode: Sequential.
  Finance Controller user exists on the tenant.
- **Steps.**
  1. Cause the trigger: employee submits Purchase Requisition.
  2. Complete the steps before step 3.
  3. Check who has the pending approval.
- **Expected.** The approval for step 3 "Finance Approval" is assigned to the Finance Controller, and only after the previous step has completed (sequential).
- **Oracle.** The pending-approval record for step 3 names Finance Controller as the approver.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-090 — PR Approval: step 3 "Finance Approval" is not routed before step 2 completes

- **Why it matters.** The approval mode is Sequential; an approver who sees an item before the previous level decides is approving out of order.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Step 2 still pending.
- **Steps.**
  1. Cause the trigger.
  2. Leave step 2 undecided.
  3. Check the Finance Controller's pending approvals.
- **Expected.** Nothing is pending for the Finance Controller at step 3 until step 2 completes.
- **Oracle.** No step-3 approval record exists while step 2 is pending; it appears once that step completes.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-091 — PR Approval: step 3 escalates to CFO after 48h

- **Why it matters.** An approval left with the Finance Controller beyond its 48-hour SLA stalls the pr approval; escalation is the control that unblocks it.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  SLA for step 3: 48 hours; escalation to CFO.
- **Steps.**
  1. Route an item to step 3 (Finance Controller).
  2. Leave it undecided for more than 48 hours.
- **Expected.** After 48 hours without action the approval escalates to the CFO.
- **Oracle.** The approval history shows the SLA breach and the CFO as the new or added approver.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-092 — PR Approval: step 3 does not escalate before 48h

- **Why it matters.** Escalating early takes the decision away from the Finance Controller before their SLA is up.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  SLA for step 3: 48 hours.
- **Steps.**
  1. Route an item to step 3 (Finance Controller).
  2. Check its state shortly before 48 hours have passed.
- **Expected.** The approval is still with the Finance Controller; nothing has gone to the CFO.
- **Oracle.** No escalation entry exists before the 48-hour mark.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-093 — PR Approval: step 3 bypassed when "Amount ≤ INR 50,000 and within budget"

- **Why it matters.** The workbook's bypass condition for step 3 is "Amount ≤ INR 50,000 and within budget". Requiring the approval anyway adds friction the tenant chose to remove.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Bypass condition holds: Amount ≤ INR 50,000 and within budget.
  Amount at the boundary: INR 50,000.
- **Steps.**
  1. Cause the trigger so that every part of the bypass condition holds (amount exactly INR 50,000).
  2. Follow the workflow to step 3.
- **Expected.** Step 3 "Finance Approval" is bypassed — no approval is requested from the Finance Controller.
- **Oracle.** The workflow history shows step 3 skipped under its bypass condition and the next step active.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-094 — PR Approval: step 3 not bypassed at INR 50,001 (just past the threshold)

- **Why it matters.** The bypass threshold is "Amount ≤ INR 50,000". One unit past it, the approval must be required.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Amount: INR 50,001; every other part of the bypass condition holds.
- **Steps.**
  1. Cause the trigger with amount INR 50,001 and the rest of the condition true.
  2. Follow the workflow to step 3.
- **Expected.** Step 3 "Finance Approval" is required and routed to the Finance Controller.
- **Oracle.** A pending step-3 approval exists for the Finance Controller.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-095 — PR Approval: step 3 not bypassed when "within budget" does not hold

- **Why it matters.** The bypass needs all of "Amount ≤ INR 50,000 and within budget". If one part fails, the approval must stand.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Not true: within budget; every other part of the bypass condition holds.
- **Steps.**
  1. Cause the trigger with "within budget" false and the amount within the threshold (INR 50,000).
  2. Follow the workflow to step 3.
- **Expected.** Step 3 "Finance Approval" is required and routed to the Finance Controller.
- **Oracle.** A pending step-3 approval exists for the Finance Controller.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-096 — PR Approval: step 3 "Finance Approval" follows the tenant's configuration

- **Why it matters.** The workbook marks step 3 tenant-configurable; note: Conditional on DoA matrix thresholds. The workflow must follow what the tenant set, not a fixed default.
- **Setup.**
  Persona: Tenant Admin.
  Trigger: Employee submits Purchase Requisition.
  Workbook note: Conditional on DoA matrix thresholds.
- **Steps.**
  1. As a Tenant Admin, change the configurable part of step 3 — conditional on DoA matrix thresholds.
  2. Cause the trigger and follow the workflow to step 3.
- **Expected.** Step 3 behaves according to the new configuration.
- **Oracle.** The step's routing/timing observed after the change matches the configured values, and differs from before the change.
- **Trace.** P1 · automate-later · `WF-PR-001` · `WF-PR-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-097 — PR Approval: step 4 "PR-to-PO Conversion" runs automatically

- **Why it matters.** Step 4 is a System Action step performed by System / Buyer; if it does not run, everything after it rests on an unchecked premise.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  Condition stated for this step: All approvals complete.
- **Steps.**
  1. Cause the trigger: employee submits Purchase Requisition, with the condition met (all approvals complete).
  2. Let the workflow reach step 4 "PR-to-PO Conversion".
- **Expected.** Step 4 is carried out by System / Buyer (workbook: "Auto-converts to PO if template mapped; else Buyer manually creates PO"), and the workflow completes.
- **Oracle.** The workflow history records step 4 as done by System / Buyer and the workflow as complete.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 4` · workbook sheet "26. Workflow & Approvals"

#### PRD-PR-098 — PR Approval: step 4 "PR-to-PO Conversion" does not happen until all approvals complete

- **Why it matters.** Step 4 is gated on "All approvals complete"; running it early would act on an unapproved item.
- **Setup.**
  Trigger: Employee submits Purchase Requisition.
  One earlier approval step still pending.
- **Steps.**
  1. Cause the trigger.
  2. Leave one earlier approval step pending.
  3. Check whether step 4 has run.
- **Expected.** Step 4 "PR-to-PO Conversion" has not run — so none of this has happened yet: Auto-converts to PO if template mapped; else Buyer manually creates PO.
- **Oracle.** No record of step 4 exists while any earlier step is pending.
- **Trace.** P0 · automate-later · `WF-PR-001` · `WF-PR-001 step 4` · workbook sheet "26. Workflow & Approvals"

## 4. Integrations

#### PRD-PR-099 — SAP MM (Purchase Requisition): PR approved in Procol → PO created in SAP

- **Why it matters.** RFC-based for older SAP versions; REST API for S/4HANA Cloud. Required for the module: Yes (SAP tenants).
- **Setup.**
  Integration INT-002 "SAP MM (Purchase Requisition)" (Bidirectional) configured on the tenant; key parameters: sap.mm.rfc_host, sap.mm.pr_doc_type, sap.mm.plant_mapping, sap.mm.sync_interval_minutes.
  Auth: RFC / API Key.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  Config dependencies (workbook): CONF-INT-001.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: PR approved in Procol → PO created in SAP.
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: PR fields: PR number, line items, GL code, cost centre, plant, vendor, amount, currency.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-002` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "28. Integration Catalog"

#### PRD-PR-100 — SAP MM (Purchase Requisition): PR created in SAP → pulled into Procol

- **Why it matters.** RFC-based for older SAP versions; REST API for S/4HANA Cloud. Required for the module: Yes (SAP tenants).
- **Setup.**
  Integration INT-002 "SAP MM (Purchase Requisition)" (Bidirectional) configured on the tenant; key parameters: sap.mm.rfc_host, sap.mm.pr_doc_type, sap.mm.plant_mapping, sap.mm.sync_interval_minutes.
  Auth: RFC / API Key.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  Config dependencies (workbook): CONF-INT-001.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: PR created in SAP → pulled into Procol.
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: PR fields: PR number, line items, GL code, cost centre, plant, vendor, amount, currency.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-002` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "28. Integration Catalog"

#### PRD-PR-101 — SAP MM (Purchase Requisition): on failure — failed PO creation triggers webhook alert

- **Why it matters.** The Integration Catalog states how SAP MM (Purchase Requisition) must fail: "Failed PO creation triggers webhook alert; PR held in 'Sync Pending' state; daily reconciliation job re-attempts". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-002 "SAP MM (Purchase Requisition)" (Bidirectional) configured on the tenant; key parameters: sap.mm.rfc_host, sap.mm.pr_doc_type, sap.mm.plant_mapping, sap.mm.sync_interval_minutes.
  Auth: RFC / API Key.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  Config dependencies (workbook): CONF-INT-001.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: PR approved in Procol → PO created in SAP.
- **Expected.** The stated failure handling happens: failed PO creation triggers webhook alert.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-002` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "28. Integration Catalog"

#### PRD-PR-102 — SAP MM (Purchase Requisition): on failure — PR held in 'Sync Pending' state

- **Why it matters.** The Integration Catalog states how SAP MM (Purchase Requisition) must fail: "Failed PO creation triggers webhook alert; PR held in 'Sync Pending' state; daily reconciliation job re-attempts". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-002 "SAP MM (Purchase Requisition)" (Bidirectional) configured on the tenant; key parameters: sap.mm.rfc_host, sap.mm.pr_doc_type, sap.mm.plant_mapping, sap.mm.sync_interval_minutes.
  Auth: RFC / API Key.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  Config dependencies (workbook): CONF-INT-001.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: PR approved in Procol → PO created in SAP.
- **Expected.** The stated failure handling happens: PR held in 'Sync Pending' state.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-002` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "28. Integration Catalog"

#### PRD-PR-103 — SAP MM (Purchase Requisition): on failure — daily reconciliation job re-attempts

- **Why it matters.** The Integration Catalog states how SAP MM (Purchase Requisition) must fail: "Failed PO creation triggers webhook alert; PR held in 'Sync Pending' state; daily reconciliation job re-attempts". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-002 "SAP MM (Purchase Requisition)" (Bidirectional) configured on the tenant; key parameters: sap.mm.rfc_host, sap.mm.pr_doc_type, sap.mm.plant_mapping, sap.mm.sync_interval_minutes.
  Auth: RFC / API Key.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  Config dependencies (workbook): CONF-INT-001.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: PR approved in Procol → PO created in SAP.
- **Expected.** The stated failure handling happens: daily reconciliation job re-attempts.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-002` · `integration.sap.pr.sync_mode` · `CONF-INT-001` · workbook sheet "28. Integration Catalog"
