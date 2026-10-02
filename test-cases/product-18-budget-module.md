# Product test cases — 18. Budget Module (MOD-23)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-23 · 8 features · 32 cases · group `PRD-BUD` · plan availability: All Plans · status: GA

Budget creation, mapping and consumption tracking across the P2P cycle.

## 1. Core features

#### PRD-BUD-001 — Budget Creation: happy path for the Finance Controller

- **Why it matters.** Flexibility to match diverse organizational budgeting structures. Business use: Budgets are created against cost center, department, project, or any other configured hierarchy key.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. Create budgets against any configurable hierarchy key.
  3. Follow the business scenario the workbook gives: "Budgets are created against cost center, department, project, or any other configured hierarchy key".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: spend limits align with how the organisation actually plans budgets. The business use case is served: budgets are created against cost center, department, project, or any other configured hierarchy key.
- **Oracle.** Observable proof that Budget Creation did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-001.
- **Trace.** P0 · manual · `FEAT-BUD-001` · workbook sheet "18. Budget Module"

#### PRD-BUD-002 — Budget Creation: tenant configuration — Hierarchy key is fully configurable, not fixed to cost center alone

- **Why it matters.** The workbook says "Hierarchy key is fully configurable, not fixed to cost center alone". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Hierarchy key is fully configurable, not fixed to cost center alone") and record its current value.
  2. As the Finance Controller: use Budget Creation to create budgets against any configurable hierarchy key.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Budget Creation follows the tenant's configured value, as the workbook states: "Hierarchy key is fully configurable, not fixed to cost center alone". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-BUD-001` · workbook sheet "18. Budget Module"

#### PRD-BUD-003 — Budget Creation: not available on the Growth plan

- **Why it matters.** The workbook limits Budget Creation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Budget Creation to create budgets against any configurable hierarchy key.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-BUD-001` · workbook sheet "18. Budget Module"

#### PRD-BUD-004 — Budget Creation: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Budget Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget Creation to create budgets against any configurable hierarchy key.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-BUD-001` · workbook sheet "18. Budget Module"

#### PRD-BUD-005 — Budget Consumption Tracking: happy path for the Finance Controller

- **Why it matters.** Prevents budget overruns from being discovered only at period-end. Business use: Every PR/PO/invoice against a budget line reduces available budget visibly and immediately.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. See budget consumption in real time.
  3. Follow the business scenario the workbook gives: "Every PR/PO/invoice against a budget line reduces available budget visibly and immediately".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: they know how much is left before approving further spend. The business use case is served: every PR/PO/invoice against a budget line reduces available budget visibly and immediately.
- **Oracle.** Observable proof that Budget Consumption Tracking did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-002.
- **Trace.** P0 · manual · `FEAT-BUD-002` · workbook sheet "18. Budget Module"

#### PRD-BUD-006 — Budget Consumption Tracking: consumption updates at the relevant transaction stage (PR, PO, or invoice, per…

- **Why it matters.** The workbook records this edge case for Budget Consumption Tracking: "Consumption updates at the relevant transaction stage (PR, PO, or invoice, per config)".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Consumption updates at the relevant transaction stage (PR, PO, or invoice, per config)".
  3. Use Budget Consumption Tracking to see budget consumption in real time.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Budget Consumption Tracking behaves as the workbook states: "Consumption updates at the relevant transaction stage (PR, PO, or invoice, per config)".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-BUD-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-BUD-002` · workbook sheet "18. Budget Module"

#### PRD-BUD-007 — Budget Consumption Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Budget Consumption Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Budget Consumption Tracking to see budget consumption in real time.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-BUD-002` · workbook sheet "18. Budget Module"

#### PRD-BUD-008 — Budget Consumption Tracking: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Budget Consumption Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget Consumption Tracking to see budget consumption in real time.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-BUD-002` · workbook sheet "18. Budget Module"

#### PRD-BUD-009 — Configurable Budget Hierarchy Key: happy path for the Finance Controller

- **Why it matters.** Avoids forcing a rigid, one-size-fits-all budget structure on every client. Business use: Admin configures whether budgets check against cost center, project, WBS, or a custom key.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. Define which hierarchy key drives budget checks.
  3. Follow the business scenario the workbook gives: "Admin configures whether budgets check against cost center, project, WBS, or a custom key".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: budgeting logic matches the organisation's specific structure. The business use case is served: admin configures whether budgets check against cost center, project, WBS, or a custom key.
- **Oracle.** Observable proof that Configurable Budget Hierarchy Key did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-003.
- **Trace.** P0 · manual · `FEAT-BUD-003` · workbook sheet "18. Budget Module"

#### PRD-BUD-010 — Configurable Budget Hierarchy Key: different hierarchy keys can be used for different budget types simultaneously

- **Why it matters.** The workbook records this edge case for Configurable Budget Hierarchy Key: "Different hierarchy keys can be used for different budget types simultaneously".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Different hierarchy keys can be used for different budget types simultaneously".
  3. Use Configurable Budget Hierarchy Key to define which hierarchy key drives budget checks.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Configurable Budget Hierarchy Key behaves as the workbook states: "Different hierarchy keys can be used for different budget types simultaneously".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-BUD-003 quoting the note.
- **Trace.** P2 · manual · `FEAT-BUD-003` · workbook sheet "18. Budget Module"

#### PRD-BUD-011 — Configurable Budget Hierarchy Key: not available on the Growth plan

- **Why it matters.** The workbook limits Configurable Budget Hierarchy Key to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Configurable Budget Hierarchy Key to define which hierarchy key drives budget checks.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-BUD-003` · workbook sheet "18. Budget Module"

#### PRD-BUD-012 — Configurable Budget Hierarchy Key: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Configurable Budget Hierarchy Key. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Budget Hierarchy Key to define which hierarchy key drives budget checks.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-BUD-003` · workbook sheet "18. Budget Module"

#### PRD-BUD-013 — Realized vs. Actual Budget Consumption: happy path for the Finance Controller

- **Why it matters.** Gives an accurate picture of remaining budget, not just cash spent to date. Business use: Dashboard distinguishes budget locked by open POs (realized) from budget actually spent (invoiced/actual).
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. See both realized (committed) and actual (invoiced) budget consumption.
  3. Follow the business scenario the workbook gives: "Dashboard distinguishes budget locked by open POs (realized) from budget actually spent (invoiced/actual)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: they understand true remaining headroom. The business use case is served: dashboard distinguishes budget locked by open POs (realized) from budget actually spent (invoiced/actual).
- **Oracle.** Observable proof that Realized vs. Actual Budget Consumption did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-004.
- **Trace.** P0 · manual · `FEAT-BUD-004` · workbook sheet "18. Budget Module"

#### PRD-BUD-014 — Realized vs. Actual Budget Consumption: realized consumption should release back to available budget on PO…

- **Why it matters.** The workbook records this edge case for Realized vs. Actual Budget Consumption: "Realized consumption should release back to available budget on PO cancel/short-close".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Realized consumption should release back to available budget on PO cancel/short-close".
  3. Use Realized vs. Actual Budget Consumption to see both realized (committed) and actual (invoiced) budget consumption.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Realized vs. Actual Budget Consumption behaves as the workbook states: "Realized consumption should release back to available budget on PO cancel/short-close".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-BUD-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-BUD-004` · workbook sheet "18. Budget Module"

#### PRD-BUD-015 — Realized vs. Actual Budget Consumption: not available on the Growth plan

- **Why it matters.** The workbook limits Realized vs. Actual Budget Consumption to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Realized vs. Actual Budget Consumption to see both realized (committed) and actual (invoiced) budget consumption.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-BUD-004` · workbook sheet "18. Budget Module"

#### PRD-BUD-016 — Realized vs. Actual Budget Consumption: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Realized vs. Actual Budget Consumption. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Realized vs. Actual Budget Consumption to see both realized (committed) and actual (invoiced) budget consumption.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-BUD-004` · workbook sheet "18. Budget Module"

## 2. Reporting features

#### PRD-BUD-017 — Budget vs. Actual Variance Reporting: happy path for the Finance Manager

- **Why it matters.** Standard financial control reporting expected by finance leadership. Business use: Report breaks down budget vs. realized vs. actual by hierarchy key, with variance highlighted.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Manager on the tenant described in Setup and open Budget Module.
  2. Use Budget vs. Actual Variance Reporting to get what the story asks for: a variance report comparing budgeted vs. actual spend.
  3. Follow the business scenario the workbook gives: "Report breaks down budget vs. realized vs. actual by hierarchy key, with variance highlighted".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Manager achieves the story's outcome: deviations are visible at period close. The business use case is served: report breaks down budget vs. realized vs. actual by hierarchy key, with variance highlighted.
- **Oracle.** Observable proof that Budget vs. Actual Variance Reporting did its job for the Finance Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-008.
- **Trace.** P0 · manual · `FEAT-BUD-008` · workbook sheet "18. Budget Module"

#### PRD-BUD-018 — Budget vs. Actual Variance Reporting: should be exportable and schedulable like other reports

- **Why it matters.** The workbook records this edge case for Budget vs. Actual Variance Reporting: "Should be exportable and schedulable like other reports". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should be exportable and schedulable like other reports".
  3. Use Budget vs. Actual Variance Reporting to get a variance report comparing budgeted vs. actual spend.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Budget vs. Actual Variance Reporting behaves as the workbook states: "Should be exportable and schedulable like other reports".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-BUD-008 quoting the note.
- **Trace.** P3 · manual · `FEAT-BUD-008` · workbook sheet "18. Budget Module"

#### PRD-BUD-019 — Budget vs. Actual Variance Reporting: not available on the Growth plan

- **Why it matters.** The workbook limits Budget vs. Actual Variance Reporting to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Finance Manager on the lower-plan tenant.
  2. Try it: use Budget vs. Actual Variance Reporting to get a variance report comparing budgeted vs. actual spend.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-BUD-008` · workbook sheet "18. Budget Module"

#### PRD-BUD-020 — Budget vs. Actual Variance Reporting: refused for a user without the Finance Manager role

- **Why it matters.** The workbook names Finance Manager as the user of Budget vs. Actual Variance Reporting. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget vs. Actual Variance Reporting to get a variance report comparing budgeted vs. actual spend.
  3. Repeat as a Finance Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Manager.
- **Trace.** P1 · automate-later · `FEAT-BUD-008` · workbook sheet "18. Budget Module"

## 3. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-BUD-021 — [Roadmap] Budget Threshold Alerts: happy path for the Finance Controller

- **Why it matters.** Enables proactive budget management instead of reactive overrun handling. Business use: Configurable threshold alerts notify budget owners as consumption approaches the limit.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. Use Budget Threshold Alerts to get what the story asks for: alerts when a budget line crosses a threshold (e.g., 80% consumed).
  3. Follow the business scenario the workbook gives: "Configurable threshold alerts notify budget owners as consumption approaches the limit".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: act before it's fully exhausted. The business use case is served: configurable threshold alerts notify budget owners as consumption approaches the limit.
- **Oracle.** Observable proof that Budget Threshold Alerts did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-005.
- **Trace.** P3 · manual · `FEAT-BUD-005` · workbook sheet "18. Budget Module"

#### PRD-BUD-022 — [Roadmap] Budget Threshold Alerts: tenant configuration — Threshold % and recipients configurable per budget line

- **Why it matters.** The workbook says "Threshold % and recipients configurable per budget line". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Threshold % and recipients configurable per budget line") and record its current value.
  2. As the Finance Controller: use Budget Threshold Alerts to get alerts when a budget line crosses a threshold (e.g., 80% consumed).
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Budget Threshold Alerts follows the tenant's configured value, as the workbook states: "Threshold % and recipients configurable per budget line". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-BUD-005` · workbook sheet "18. Budget Module"

#### PRD-BUD-023 — [Roadmap] Budget Threshold Alerts: not available on the Growth plan

- **Why it matters.** The workbook limits Budget Threshold Alerts to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Budget Threshold Alerts to get alerts when a budget line crosses a threshold (e.g., 80% consumed).
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-BUD-005` · workbook sheet "18. Budget Module"

#### PRD-BUD-024 — [Roadmap] Budget Threshold Alerts: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Budget Threshold Alerts. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget Threshold Alerts to get alerts when a budget line crosses a threshold (e.g., 80% consumed).
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-BUD-005` · workbook sheet "18. Budget Module"

#### PRD-BUD-025 — [Roadmap] Budget Carry-Forward Rules: happy path for the Finance Controller

- **Why it matters.** Supports different organizational policies on budget carry-forward. Business use: At period close, unused budget either lapses or carries forward based on a configured rule per budget type.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. Configure whether unused budget carries forward to the next period.
  3. Follow the business scenario the workbook gives: "At period close, unused budget either lapses or carries forward based on a configured rule per budget type".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: budget policy matches the organisation's fiscal rules. The business use case is served: at period close, unused budget either lapses or carries forward based on a configured rule per budget type.
- **Oracle.** Observable proof that Budget Carry-Forward Rules did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-006.
- **Trace.** P3 · manual · `FEAT-BUD-006` · workbook sheet "18. Budget Module"

#### PRD-BUD-026 — [Roadmap] Budget Carry-Forward Rules: tenant configuration — Should be configurable per budget category, not just globally

- **Why it matters.** The workbook says "Should be configurable per budget category, not just globally". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Should be configurable per budget category, not just globally") and record its current value.
  2. As the Finance Controller: use Budget Carry-Forward Rules to configure whether unused budget carries forward to the next period.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Budget Carry-Forward Rules follows the tenant's configured value, as the workbook states: "Should be configurable per budget category, not just globally". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-BUD-006` · workbook sheet "18. Budget Module"

#### PRD-BUD-027 — [Roadmap] Budget Carry-Forward Rules: not available on the Growth plan

- **Why it matters.** The workbook limits Budget Carry-Forward Rules to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Budget Carry-Forward Rules to configure whether unused budget carries forward to the next period.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-BUD-006` · workbook sheet "18. Budget Module"

#### PRD-BUD-028 — [Roadmap] Budget Carry-Forward Rules: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Budget Carry-Forward Rules. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget Carry-Forward Rules to configure whether unused budget carries forward to the next period.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-BUD-006` · workbook sheet "18. Budget Module"

#### PRD-BUD-029 — [Roadmap] Budget Revision Workflow: happy path for the Finance Controller

- **Why it matters.** Prevents budget figures from being changed without oversight. Business use: Requests to increase/decrease a budget line route through approval before taking effect.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Budget Module.
  2. Use Budget Revision Workflow to get what the story asks for: budget revisions to go through an approval workflow.
  3. Follow the business scenario the workbook gives: "Requests to increase/decrease a budget line route through approval before taking effect".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: mid-year budget changes are controlled. The business use case is served: requests to increase/decrease a budget line route through approval before taking effect.
- **Oracle.** Observable proof that Budget Revision Workflow did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-BUD-007.
- **Trace.** P3 · manual · `FEAT-BUD-007` · workbook sheet "18. Budget Module"

#### PRD-BUD-030 — [Roadmap] Budget Revision Workflow: revision history should remain visible alongside current budget

- **Why it matters.** The workbook records this edge case for Budget Revision Workflow: "Revision history should remain visible alongside current budget".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "Revision history should remain visible alongside current budget".
  3. Use Budget Revision Workflow to get budget revisions to go through an approval workflow.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Budget Revision Workflow behaves as the workbook states: "Revision history should remain visible alongside current budget".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-BUD-007 quoting the note.
- **Trace.** P3 · manual · `FEAT-BUD-007` · workbook sheet "18. Budget Module"

#### PRD-BUD-031 — [Roadmap] Budget Revision Workflow: not available on the Growth plan

- **Why it matters.** The workbook limits Budget Revision Workflow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Budget Revision Workflow to get budget revisions to go through an approval workflow.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-BUD-007` · workbook sheet "18. Budget Module"

#### PRD-BUD-032 — [Roadmap] Budget Revision Workflow: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Budget Revision Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Budget Revision Workflow to get budget revisions to go through an approval workflow.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P3 · manual · `FEAT-BUD-007` · workbook sheet "18. Budget Module"
