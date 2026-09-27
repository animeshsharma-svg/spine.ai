# Product test cases — 11. Contract Module (MOD-22)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-22 · 9 features · 35 cases · group `PRD-CON` · plan availability: All Plans · status: GA

Contract repository and lifecycle for executed agreements.

## 1. Core features

#### PRD-CON-001 — Contract Repository: happy path for the Category Manager

- **Why it matters.** Removes reliance on scattered local files for contract records. Business use: All executed contracts are stored with metadata (vendor, category, value, validity) for retrieval and reference.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Use Contract Repository to get what the story asks for: a central contract repository.
  3. Follow the business scenario the workbook gives: "All executed contracts are stored with metadata (vendor, category, value, validity) for retrieval and reference".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: all vendor agreements are stored and searchable in one place. The business use case is served: all executed contracts are stored with metadata (vendor, category, value, validity) for retrieval and reference.
- **Oracle.** Observable proof that Contract Repository did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-001.
- **Trace.** P0 · manual · `FEAT-CON-001` · workbook sheet "11. Contract Module"

#### PRD-CON-002 — Contract Repository: should support full-text search across contract documents

- **Why it matters.** The workbook records this edge case for Contract Repository: "Should support full-text search across contract documents". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support full-text search across contract documents".
  3. Use Contract Repository to get a central contract repository.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Contract Repository behaves as the workbook states: "Should support full-text search across contract documents".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-CON-001` · workbook sheet "11. Contract Module"

#### PRD-CON-003 — Contract Repository: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Repository to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Repository to get a central contract repository.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CON-001` · workbook sheet "11. Contract Module"

#### PRD-CON-004 — Contract Repository: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Repository. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Repository to get a central contract repository.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-CON-001` · workbook sheet "11. Contract Module"

#### PRD-CON-005 — Contract Expiry Notification: happy path for the Category Manager

- **Why it matters.** Prevents contracts from lapsing unnoticed and causing supply disruption. Business use: Automated alerts fire at configurable intervals (e.g., 90/60/30 days) before a contract's end date.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Be notified ahead of contract expiry.
  3. Follow the business scenario the workbook gives: "Automated alerts fire at configurable intervals (e.g., 90/60/30 days) before a contract's end date".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: renewal or re-sourcing happens with lead time. The business use case is served: automated alerts fire at configurable intervals (e.g., 90/60/30 days) before a contract's end date.
- **Oracle.** Observable proof that Contract Expiry Notification did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-002.
- **Trace.** P0 · manual · `FEAT-CON-002` · workbook sheet "11. Contract Module"

#### PRD-CON-006 — Contract Expiry Notification: tenant configuration — Notification recipients and lead times are configurable per contract type

- **Why it matters.** The workbook says "Notification recipients and lead times are configurable per contract type". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Category Manager (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Notification recipients and lead times are configurable per contract type") and record its current value.
  2. As the Category Manager: use Contract Expiry Notification to be notified ahead of contract expiry.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Contract Expiry Notification follows the tenant's configured value, as the workbook states: "Notification recipients and lead times are configurable per contract type". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-CON-002` · workbook sheet "11. Contract Module"

#### PRD-CON-007 — Contract Expiry Notification: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Expiry Notification to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Expiry Notification to be notified ahead of contract expiry.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CON-002` · workbook sheet "11. Contract Module"

#### PRD-CON-008 — Contract Expiry Notification: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Expiry Notification. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Expiry Notification to be notified ahead of contract expiry.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-CON-002` · workbook sheet "11. Contract Module"

#### PRD-CON-009 — Contract Amendment: happy path for the Category Manager

- **Why it matters.** Auditability of contractual changes over the contract's life. Business use: Changes to an active contract are recorded as a new version with the amendment reason logged.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Amend a live contract through a controlled flow.
  3. Follow the business scenario the workbook gives: "Changes to an active contract are recorded as a new version with the amendment reason logged".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: term or price changes are tracked with version history. The business use case is served: changes to an active contract are recorded as a new version with the amendment reason logged.
- **Oracle.** Observable proof that Contract Amendment did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-003.
- **Trace.** P0 · manual · `FEAT-CON-003` · workbook sheet "11. Contract Module"

#### PRD-CON-010 — Contract Amendment: original terms remain visible alongside each amendment

- **Why it matters.** The workbook records this edge case for Contract Amendment: "Original terms remain visible alongside each amendment".
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Original terms remain visible alongside each amendment".
  3. Use Contract Amendment to amend a live contract through a controlled flow.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Contract Amendment behaves as the workbook states: "Original terms remain visible alongside each amendment".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-003 quoting the note.
- **Trace.** P2 · manual · `FEAT-CON-003` · workbook sheet "11. Contract Module"

#### PRD-CON-011 — Contract Amendment: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Amendment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Amendment to amend a live contract through a controlled flow.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CON-003` · workbook sheet "11. Contract Module"

#### PRD-CON-012 — Contract Amendment: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Amendment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Amendment to amend a live contract through a controlled flow.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-CON-003` · workbook sheet "11. Contract Module"

#### PRD-CON-013 — Contract Consumption Tracking: happy path for the Category Manager

- **Why it matters.** Prevents over-commitment beyond negotiated contract terms. Business use: POs issued against a rate/blanket contract reduce the contract's tracked balance.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Track how much value/quantity has been drawn against a contract.
  3. Follow the business scenario the workbook gives: "POs issued against a rate/blanket contract reduce the contract's tracked balance".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: they know remaining commitment or entitlement. The business use case is served: POs issued against a rate/blanket contract reduce the contract's tracked balance.
- **Oracle.** Observable proof that Contract Consumption Tracking did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-004.
- **Trace.** P0 · manual · `FEAT-CON-004` · workbook sheet "11. Contract Module"

#### PRD-CON-014 — Contract Consumption Tracking: ties directly into blanket PO consumption tracking

- **Why it matters.** The workbook records this edge case for Contract Consumption Tracking: "Ties directly into blanket PO consumption tracking".
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Ties directly into blanket PO consumption tracking".
  3. Use Contract Consumption Tracking to track how much value/quantity has been drawn against a contract.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Contract Consumption Tracking behaves as the workbook states: "Ties directly into blanket PO consumption tracking".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-CON-004` · workbook sheet "11. Contract Module"

#### PRD-CON-015 — Contract Consumption Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Consumption Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Consumption Tracking to track how much value/quantity has been drawn against a contract.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-CON-004` · workbook sheet "11. Contract Module"

#### PRD-CON-016 — Contract Consumption Tracking: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Consumption Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Consumption Tracking to track how much value/quantity has been drawn against a contract.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-CON-004` · workbook sheet "11. Contract Module"

## 2. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-CON-017 — [Roadmap] Contract Clause Library & Redlining: happy path for the Category Manager

- **Why it matters.** Speeds up contract drafting and keeps negotiation history auditable. Business use: Standard clauses are assembled into a draft contract; negotiation changes are tracked as redlines.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Use Contract Clause Library & Redlining to get what the story asks for: a clause library with redlining support.
  3. Follow the business scenario the workbook gives: "Standard clauses are assembled into a draft contract; negotiation changes are tracked as redlines".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: contract drafting and negotiation happen faster and more consistently. The business use case is served: standard clauses are assembled into a draft contract; negotiation changes are tracked as redlines.
- **Oracle.** Observable proof that Contract Clause Library & Redlining did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-005.
- **Trace.** P3 · manual · `FEAT-CON-005` · workbook sheet "11. Contract Module"

#### PRD-CON-018 — [Roadmap] Contract Clause Library & Redlining: should integrate with e-signature tools like DocuSign for execution

- **Why it matters.** The workbook records this edge case for Contract Clause Library & Redlining: "Should integrate with e-signature tools like DocuSign for execution". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should integrate with e-signature tools like DocuSign for execution".
  3. Use Contract Clause Library & Redlining to get a clause library with redlining support.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Contract Clause Library & Redlining behaves as the workbook states: "Should integrate with e-signature tools like DocuSign for execution".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-005 quoting the note.
- **Trace.** P3 · manual · `FEAT-CON-005` · workbook sheet "11. Contract Module"

#### PRD-CON-019 — [Roadmap] Contract Clause Library & Redlining: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Clause Library & Redlining to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Clause Library & Redlining to get a clause library with redlining support.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CON-005` · workbook sheet "11. Contract Module"

#### PRD-CON-020 — [Roadmap] Contract Clause Library & Redlining: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Clause Library & Redlining. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Clause Library & Redlining to get a clause library with redlining support.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P3 · manual · `FEAT-CON-005` · workbook sheet "11. Contract Module"

#### PRD-CON-021 — [Roadmap] Contract Renewal Auto-Workflow: happy path for the Category Manager

- **Why it matters.** Turns a manual renewal reminder into a structured decision workflow. Business use: Approaching expiry, a renewal task is auto-created for the category manager with the current contract terms pre-loaded.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Use Contract Renewal Auto-Workflow to get what the story asks for: a renewal workflow to auto-trigger ahead of contract expiry.
  3. Follow the business scenario the workbook gives: "Approaching expiry, a renewal task is auto-created for the category manager with the current contract terms pre-loaded".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: renewal decisions aren't made under time pressure. The business use case is served: approaching expiry, a renewal task is auto-created for the category manager with the current contract terms pre-loaded.
- **Oracle.** Observable proof that Contract Renewal Auto-Workflow did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-006.
- **Trace.** P3 · manual · `FEAT-CON-006` · workbook sheet "11. Contract Module"

#### PRD-CON-022 — [Roadmap] Contract Renewal Auto-Workflow: should support auto-renewal vs. manual-decision contract types differently

- **Why it matters.** The workbook records this edge case for Contract Renewal Auto-Workflow: "Should support auto-renewal vs. manual-decision contract types differently". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support auto-renewal vs. manual-decision contract types differently".
  3. Use Contract Renewal Auto-Workflow to get a renewal workflow to auto-trigger ahead of contract expiry.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Contract Renewal Auto-Workflow behaves as the workbook states: "Should support auto-renewal vs. manual-decision contract types differently".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-006 quoting the note.
- **Trace.** P3 · manual · `FEAT-CON-006` · workbook sheet "11. Contract Module"

#### PRD-CON-023 — [Roadmap] Contract Renewal Auto-Workflow: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Renewal Auto-Workflow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Renewal Auto-Workflow to get a renewal workflow to auto-trigger ahead of contract expiry.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CON-006` · workbook sheet "11. Contract Module"

#### PRD-CON-024 — [Roadmap] Contract Renewal Auto-Workflow: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Renewal Auto-Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Renewal Auto-Workflow to get a renewal workflow to auto-trigger ahead of contract expiry.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P3 · manual · `FEAT-CON-006` · workbook sheet "11. Contract Module"

#### PRD-CON-025 — [Roadmap] Contract-to-PO Price Snapshot Enforcement: happy path for the Buyer

- **Why it matters.** Preserves what was actually approved at PO creation; corrections go through amendment, not silent update. Business use: Price/vendor fields pulled from a contract at PO creation are stored as a point-in-time snapshot.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Contract Module.
  2. Use Contract-to-PO Price Snapshot Enforcement to get what the story asks for: contract-fetched pricing on a PO to be locked as a snapshot, not a live link.
  3. Follow the business scenario the workbook gives: "Price/vendor fields pulled from a contract at PO creation are stored as a point-in-time snapshot".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: later contract changes don't silently alter an issued PO. The business use case is served: price/vendor fields pulled from a contract at PO creation are stored as a point-in-time snapshot.
- **Oracle.** Observable proof that Contract-to-PO Price Snapshot Enforcement did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-007.
- **Trace.** P3 · manual · `FEAT-CON-007` · workbook sheet "11. Contract Module"

#### PRD-CON-026 — [Roadmap] Contract-to-PO Price Snapshot Enforcement: not available on the Growth plan

- **Why it matters.** The workbook limits Contract-to-PO Price Snapshot Enforcement to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Contract-to-PO Price Snapshot Enforcement to get contract-fetched pricing on a PO to be locked as a snapshot, not a live link.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CON-007` · workbook sheet "11. Contract Module"

#### PRD-CON-027 — [Roadmap] Contract-to-PO Price Snapshot Enforcement: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Contract-to-PO Price Snapshot Enforcement. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract-to-PO Price Snapshot Enforcement to get contract-fetched pricing on a PO to be locked as a snapshot, not a live link.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P3 · manual · `FEAT-CON-007` · workbook sheet "11. Contract Module"

#### PRD-CON-028 — [Roadmap] Contract Compliance Tracking: happy path for the Category Manager

- **Why it matters.** Turns contract terms into an actively monitored commitment, not just a static document. Business use: Delivery, quality, and pricing performance are tracked against the contracted SLA over the contract's life.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Track vendor compliance against contract SLAs.
  3. Follow the business scenario the workbook gives: "Delivery, quality, and pricing performance are tracked against the contracted SLA over the contract's life".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: non-performance is visible before renewal decisions. The business use case is served: delivery, quality, and pricing performance are tracked against the contracted SLA over the contract's life.
- **Oracle.** Observable proof that Contract Compliance Tracking did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-008.
- **Trace.** P3 · manual · `FEAT-CON-008` · workbook sheet "11. Contract Module"

#### PRD-CON-029 — [Roadmap] Contract Compliance Tracking: should feed into the vendor scorecard alongside QC and delivery data

- **Why it matters.** The workbook records this edge case for Contract Compliance Tracking: "Should feed into the vendor scorecard alongside QC and delivery data". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should feed into the vendor scorecard alongside QC and delivery data".
  3. Use Contract Compliance Tracking to track vendor compliance against contract SLAs.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Contract Compliance Tracking behaves as the workbook states: "Should feed into the vendor scorecard alongside QC and delivery data".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-008 quoting the note.
- **Trace.** P3 · manual · `FEAT-CON-008` · workbook sheet "11. Contract Module"

#### PRD-CON-030 — [Roadmap] Contract Compliance Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Contract Compliance Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Contract Compliance Tracking to track vendor compliance against contract SLAs.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CON-008` · workbook sheet "11. Contract Module"

#### PRD-CON-031 — [Roadmap] Contract Compliance Tracking: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Contract Compliance Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Contract Compliance Tracking to track vendor compliance against contract SLAs.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P3 · manual · `FEAT-CON-008` · workbook sheet "11. Contract Module"

#### PRD-CON-032 — [Roadmap] Multi-Entity Contract Applicability: happy path for the Category Manager

- **Why it matters.** Avoids duplicate contract records for group-wide agreements. Business use: One negotiated contract can be flagged as applicable to multiple legal entities or plants, each drawing from the same terms.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Contract Module.
  2. Use Multi-Entity Contract Applicability to get what the story asks for: a contract to be applicable across multiple entities/plants where relevant.
  3. Follow the business scenario the workbook gives: "One negotiated contract can be flagged as applicable to multiple legal entities or plants, each drawing from the same terms".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: group-negotiated rates aren't re-entered per entity. The business use case is served: one negotiated contract can be flagged as applicable to multiple legal entities or plants, each drawing from the same terms.
- **Oracle.** Observable proof that Multi-Entity Contract Applicability did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-CON-009.
- **Trace.** P3 · manual · `FEAT-CON-009` · workbook sheet "11. Contract Module"

#### PRD-CON-033 — [Roadmap] Multi-Entity Contract Applicability: consumption tracking must still be able to break down usage by entity

- **Why it matters.** The workbook records this edge case for Multi-Entity Contract Applicability: "Consumption tracking must still be able to break down usage by entity".
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Consumption tracking must still be able to break down usage by entity".
  3. Use Multi-Entity Contract Applicability to get a contract to be applicable across multiple entities/plants where relevant.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Multi-Entity Contract Applicability behaves as the workbook states: "Consumption tracking must still be able to break down usage by entity".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-CON-009 quoting the note.
- **Trace.** P3 · manual · `FEAT-CON-009` · workbook sheet "11. Contract Module"

#### PRD-CON-034 — [Roadmap] Multi-Entity Contract Applicability: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Entity Contract Applicability to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Multi-Entity Contract Applicability to get a contract to be applicable across multiple entities/plants where relevant.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-CON-009` · workbook sheet "11. Contract Module"

#### PRD-CON-035 — [Roadmap] Multi-Entity Contract Applicability: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Multi-Entity Contract Applicability. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Entity Contract Applicability to get a contract to be applicable across multiple entities/plants where relevant.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P3 · manual · `FEAT-CON-009` · workbook sheet "11. Contract Module"
