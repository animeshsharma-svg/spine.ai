# Product test cases — 07. RFP - Technical (MOD-04)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-04 · 15 features · 33 cases · group `PRD-RFP` · plan availability: All Plans · status: GA

Structured competitive Technical bidding. Drive competitive scopes/ technical specifications and vendor selection through a governed, auditable bidding process.

## 1. Core features

#### PRD-RFP-001 — Technical Evaluation Modes: happy path for the Buyer

- **Why it matters.** Right depth of technical evaluation. Business use: Buyer scopes the technical stage to evaluate per line item or per vendor against a template.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Technical Evaluation Modes to get what the story asks for: evaluators to evaluate per line item or per vendor against a template.
  3. Follow the business scenario the workbook gives: "Buyer scopes the technical stage to evaluate per line item or per vendor against a template".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: scope technical scrutiny appropriately. The business use case is served: buyer scopes the technical stage to evaluate per line item or per vendor against a template.
- **Oracle.** Observable proof that Technical Evaluation Modes did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-001.
- **Trace.** P0 · manual · `FEAT-RFP-001` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-002 — Technical Evaluation Modes: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Technical Evaluation Modes. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Technical Evaluation Modes to get evaluators to evaluate per line item or per vendor against a template.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-001` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-003 — Configurable Questionnaire Templates: happy path for the Buyer

- **Why it matters.** Consistent technical evaluation. Business use: Category-specific technical questionnaire templates load for the technical stage.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Configurable Questionnaire Templates to get what the story asks for: per-category technical questionnaire templates.
  3. Follow the business scenario the workbook gives: "Category-specific technical questionnaire templates load for the technical stage".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: standardize technical evaluation. The business use case is served: category-specific technical questionnaire templates load for the technical stage.
- **Oracle.** Observable proof that Configurable Questionnaire Templates did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-002.
- **Trace.** P0 · manual · `FEAT-RFP-002` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-004 — Configurable Questionnaire Templates: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Configurable Questionnaire Templates. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Questionnaire Templates to get per-category technical questionnaire templates.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-002` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-005 — Line-Item Templates from PR Specs: happy path for the Buyer

- **Why it matters.** Less manual question authoring. Business use: Line-item question templates are generated from the PR specifications.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  Context from the workbook: Specs from MOD-02.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Line-Item Templates from PR Specs to get what the story asks for: question templates generated from PR specs.
  3. Follow the business scenario the workbook gives: "Line-item question templates are generated from the PR specifications".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: technical questions derive directly from the requirement. The business use case is served: line-item question templates are generated from the PR specifications.
- **Oracle.** Observable proof that Line-Item Templates from PR Specs did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-003.
- **Trace.** P0 · manual · `FEAT-RFP-003` · `MOD-02` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-006 — Line-Item Templates from PR Specs: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Line-Item Templates from PR Specs. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Line-Item Templates from PR Specs to get question templates generated from PR specs.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-003` · `MOD-02` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-007 — Configurable Question Response Types: happy path for the Buyer

- **Why it matters.** Flexible technical data capture. Business use: Each technical question uses an appropriate response type (yes/no, dropdowns, text, file upload).
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Configurable Question Response Types to get what the story asks for: varied response types per question.
  3. Follow the business scenario the workbook gives: "Each technical question uses an appropriate response type (yes/no, dropdowns, text, file upload)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: capture the right kind of answer. The business use case is served: each technical question uses an appropriate response type (yes/no, dropdowns, text, file upload).
- **Oracle.** Observable proof that Configurable Question Response Types did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-004.
- **Trace.** P0 · manual · `FEAT-RFP-004` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-008 — Configurable Question Response Types: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Configurable Question Response Types. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Question Response Types to get varied response types per question.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-004` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-009 — Buyer Add/Remove Questions: happy path for the Buyer

- **Why it matters.** Event-specific technical asks. Business use: Buyer tailors the questionnaire by adding or removing questions per event.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Add or remove questions.
  3. Follow the business scenario the workbook gives: "Buyer tailors the questionnaire by adding or removing questions per event".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: tailor the questionnaire to each event. The business use case is served: buyer tailors the questionnaire by adding or removing questions per event.
- **Oracle.** Observable proof that Buyer Add/Remove Questions did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-005.
- **Trace.** P0 · manual · `FEAT-RFP-005` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-010 — Buyer Add/Remove Questions: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Buyer Add/Remove Questions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Buyer Add/Remove Questions to add or remove questions.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-005` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-011 — Evaluator Assignment and Groups: happy path for the Buyer

- **Why it matters.** Accurate, accountable evaluation. Business use: Evaluators default to the PR requisitioner; the buyer reassigns or assigns groups, at lot or vendor level.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Evaluator Assignment and Groups to get what the story asks for: evaluators auto-fetched from the PR with reassignment and groups.
  3. Follow the business scenario the workbook gives: "Evaluators default to the PR requisitioner; the buyer reassigns or assigns groups, at lot or vendor level".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: the right experts evaluate. The business use case is served: evaluators default to the PR requisitioner; the buyer reassigns or assigns groups, at lot or vendor level.
- **Oracle.** Observable proof that Evaluator Assignment and Groups did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-006.
- **Trace.** P0 · manual · `FEAT-RFP-006` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-012 — Evaluator Assignment and Groups: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Evaluator Assignment and Groups. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Evaluator Assignment and Groups to get evaluators auto-fetched from the PR with reassignment and groups.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-006` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-013 — Weighted Technical Scoring: happy path for the Technical Evaluator

- **Why it matters.** Defensible technical ranking. Business use: Evaluators score weighted questions, producing one comparable technical score per vendor.
- **Setup.**
  Persona: Technical Evaluator.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Technical Evaluator on the tenant described in Setup and open RFP / Technical.
  2. Use Weighted Technical Scoring to get what the story asks for: weighted questions rolled into one technical score.
  3. Follow the business scenario the workbook gives: "Evaluators score weighted questions, producing one comparable technical score per vendor".
  4. Check the result against the story's promised outcome.
- **Expected.** The Technical Evaluator achieves the story's outcome: ranking is objective and comparable. The business use case is served: evaluators score weighted questions, producing one comparable technical score per vendor.
- **Oracle.** Observable proof that Weighted Technical Scoring did its job for the Technical Evaluator — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-007.
- **Trace.** P0 · manual · `FEAT-RFP-007` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-014 — Weighted Technical Scoring: refused for a user without the Technical Evaluator role

- **Why it matters.** The workbook names Technical Evaluator as the user of Weighted Technical Scoring. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Technical Evaluator.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Weighted Technical Scoring to get weighted questions rolled into one technical score.
  3. Repeat as a Technical Evaluator.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Technical Evaluator can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Technical Evaluator.
- **Trace.** P1 · automate-later · `FEAT-RFP-007` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-015 — Configurable Rating Scale: happy path for the Tenant Admin

- **Why it matters.** Familiar scoring conventions. Business use: The org configures the rating scale (T1/T2/T3/TNA, preferences, or numeric) at setup.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open RFP / Technical.
  2. Use Configurable Rating Scale to get what the story asks for: the rating scale configurable (T1/T2/T3, preferences, or numeric).
  3. Follow the business scenario the workbook gives: "The org configures the rating scale (T1/T2/T3/TNA, preferences, or numeric) at setup".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: we use the organisation's preferred convention. The business use case is served: the org configures the rating scale (T1/T2/T3/TNA, preferences, or numeric) at setup.
- **Oracle.** Observable proof that Configurable Rating Scale did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-008.
- **Trace.** P0 · manual · `FEAT-RFP-008` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-016 — Configurable Rating Scale: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Configurable Rating Scale. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Rating Scale to get the rating scale configurable (T1/T2/T3, preferences, or numeric).
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-RFP-008` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-017 — Vendor Technical Response: happy path for the Vendor

- **Why it matters.** Lower-friction vendor responses. Business use: Vendors submit technical responses manually, via bulk Excel, or quick-fill, revising during the window.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open RFP / Technical.
  2. Respond manually, by bulk Excel, or quick-fill with revisions.
  3. Follow the business scenario the workbook gives: "Vendors submit technical responses manually, via bulk Excel, or quick-fill, revising during the window".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: answer technical asks efficiently. The business use case is served: vendors submit technical responses manually, via bulk Excel, or quick-fill, revising during the window.
- **Oracle.** Observable proof that Vendor Technical Response did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-009.
- **Trace.** P0 · manual · `FEAT-RFP-009` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-018 — Vendor Technical Response: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor Technical Response. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Technical Response to respond manually, by bulk Excel, or quick-fill with revisions.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-RFP-009` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-019 — Line-Item Regret: happy path for the Vendor

- **Why it matters.** Accurate bid coverage. Business use: A vendor regrets specific lines it cannot supply, barring commercial quoting on them.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open RFP / Technical.
  2. Regret specific line items.
  3. Follow the business scenario the workbook gives: "A vendor regrets specific lines it cannot supply, barring commercial quoting on them".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: they are not forced to quote items they can't supply. The business use case is served: a vendor regrets specific lines it cannot supply, barring commercial quoting on them.
- **Oracle.** Observable proof that Line-Item Regret did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-010.
- **Trace.** P0 · manual · `FEAT-RFP-010` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-020 — Line-Item Regret: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Line-Item Regret. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Line-Item Regret to regret specific line items.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-RFP-010` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-021 — Technical Evaluation Approval and Re-evaluation: happy path for the Buyer

- **Why it matters.** Approval rigor and recourse. Business use: Evaluators submit scores via a configurable approval; the buyer can challenge and trigger re-evaluation.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Technical Evaluation Approval and Re-evaluation to get what the story asks for: a configurable evaluation approval that they can challenge.
  3. Follow the business scenario the workbook gives: "Evaluators submit scores via a configurable approval; the buyer can challenge and trigger re-evaluation".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: technical scoring is governed and correctable. The business use case is served: evaluators submit scores via a configurable approval; the buyer can challenge and trigger re-evaluation.
- **Oracle.** Observable proof that Technical Evaluation Approval and Re-evaluation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-011.
- **Trace.** P0 · manual · `FEAT-RFP-011` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-022 — Technical Evaluation Approval and Re-evaluation: approval step optional per tenant

- **Why it matters.** The workbook records this edge case for Technical Evaluation Approval and Re-evaluation: "Approval step optional per tenant".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Approval step optional per tenant".
  3. Use Technical Evaluation Approval and Re-evaluation to get a configurable evaluation approval that they can challenge.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Technical Evaluation Approval and Re-evaluation behaves as the workbook states: "Approval step optional per tenant".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-RFP-011 quoting the note.
- **Trace.** P2 · manual · `FEAT-RFP-011` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-023 — Technical Evaluation Approval and Re-evaluation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Technical Evaluation Approval and Re-evaluation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Technical Evaluation Approval and Re-evaluation to get a configurable evaluation approval that they can challenge.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-011` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-024 — Change Evaluator During Event: happy path for the Buyer/Evaluator

- **Why it matters.** Operational continuity. Business use: The buyer/evaluator reassigns the evaluator mid-event to cover an absence.
- **Setup.**
  Persona: Buyer/Evaluator.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer/Evaluator on the tenant described in Setup and open RFP / Technical.
  2. Reassign the evaluator mid-event.
  3. Follow the business scenario the workbook gives: "The buyer/evaluator reassigns the evaluator mid-event to cover an absence".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer/Evaluator achieves the story's outcome: cover absences without stalling. The business use case is served: the buyer/evaluator reassigns the evaluator mid-event to cover an absence.
- **Oracle.** Observable proof that Change Evaluator During Event did its job for the Buyer/Evaluator — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-013.
- **Trace.** P0 · manual · `FEAT-RFP-013` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-025 — Change Evaluator During Event: refused for a user without the Buyer/Evaluator role

- **Why it matters.** The workbook names Buyer/Evaluator as the user of Change Evaluator During Event. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer/Evaluator.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Change Evaluator During Event to reassign the evaluator mid-event.
  3. Repeat as a Buyer/Evaluator.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer/Evaluator can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer/Evaluator.
- **Trace.** P1 · automate-later · `FEAT-RFP-013` · workbook sheet "7. RFP - Technical"

## 2. Optional features

#### PRD-RFP-026 — Department/Location-Based Evaluator Mapping: happy path for the Tenant Admin

- **Why it matters.** Accurate routing at scale. Business use: Technical evaluation auto-routes to evaluators mapped by department or site.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open RFP / Technical.
  2. Use Department/Location-Based Evaluator Mapping to get what the story asks for: evaluation auto-routed by department or location.
  3. Follow the business scenario the workbook gives: "Technical evaluation auto-routes to evaluators mapped by department or site".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: the right experts evaluate at scale. The business use case is served: technical evaluation auto-routes to evaluators mapped by department or site.
- **Oracle.** Observable proof that Department/Location-Based Evaluator Mapping did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-012.
- **Trace.** P1 · manual · `FEAT-RFP-012` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-027 — Department/Location-Based Evaluator Mapping: not available on the Growth plan

- **Why it matters.** The workbook limits Department/Location-Based Evaluator Mapping to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Department/Location-Based Evaluator Mapping to get evaluation auto-routed by department or location.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFP-012` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-028 — Department/Location-Based Evaluator Mapping: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Department/Location-Based Evaluator Mapping. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Department/Location-Based Evaluator Mapping to get evaluation auto-routed by department or location.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-RFP-012` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-029 — Lot-Basis Re-evaluation: happy path for the Buyer

- **Why it matters.** Flexible re-evaluation scope. Business use: Re-evaluation is run at lot level when a lot-wide technical result is challenged.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFP / Technical.
  2. Use Lot-Basis Re-evaluation to get what the story asks for: re-evaluation at lot level.
  3. Follow the business scenario the workbook gives: "Re-evaluation is run at lot level when a lot-wide technical result is challenged".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: challenge a lot-level technical result. The business use case is served: re-evaluation is run at lot level when a lot-wide technical result is challenged.
- **Oracle.** Observable proof that Lot-Basis Re-evaluation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-014.
- **Trace.** P1 · manual · `FEAT-RFP-014` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-030 — Lot-Basis Re-evaluation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Lot-Basis Re-evaluation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Lot-Basis Re-evaluation to get re-evaluation at lot level.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFP-014` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-031 — Intake-Selected Technical Template: happy path for the Requester / End User

- **Why it matters.** Earlier, accurate technical scoping. Business use: The technical template is pre-selected by the intake user upfront.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the tenant described in Setup and open RFP / Technical.
  2. Pick the technical template at intake.
  3. Follow the business scenario the workbook gives: "The technical template is pre-selected by the intake user upfront".
  4. Check the result against the story's promised outcome.
- **Expected.** The Requester / End User achieves the story's outcome: the right questionnaire is set early. The business use case is served: the technical template is pre-selected by the intake user upfront.
- **Oracle.** Observable proof that Intake-Selected Technical Template did its job for the Requester / End User — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFP-015.
- **Trace.** P1 · manual · `FEAT-RFP-015` · `MOD-13` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-032 — Intake-Selected Technical Template: not available on plans below Growth

- **Why it matters.** The workbook limits Intake-Selected Technical Template to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Requester / End User.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Requester / End User on the lower-plan tenant.
  2. Try it: use Intake-Selected Technical Template to pick the technical template at intake.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RFP-015` · `MOD-13` · workbook sheet "7. RFP - Technical"

#### PRD-RFP-033 — Intake-Selected Technical Template: refused for a user without the Requester / End User role

- **Why it matters.** The workbook names Requester / End User as the user of Intake-Selected Technical Template. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Requester / End User.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Intake-Selected Technical Template to pick the technical template at intake.
  3. Repeat as a Requester / End User.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Requester / End User can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Requester / End User.
- **Trace.** P1 · automate-later · `FEAT-RFP-015` · `MOD-13` · workbook sheet "7. RFP - Technical"
