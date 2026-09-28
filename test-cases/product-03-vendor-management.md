# Product test cases — 03. Vendor Management (MOD-01)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-01 · 45 features · 184 cases · group `PRD-VM` · plan availability: All Plans · status: GA

End-to-end vendor lifecycle: onboarding, amendment, discovery, blocking. Centralise vendor master data; enforce compliance and qualification before a vendor is usable in any procurement flow.

## 1. Core features

#### PRD-VM-001 — Buyer-Initiated Vendor Invitation: happy path for the Buyer

- **Why it matters.** Structured, invite-based intake prevents ad-hoc vendor creation. Business use: Triggered when a buyer needs a supplier not yet on Procol; buyer enters primary details, the vendor lands in the Prospect list, and onboarding begins once the invite is accepted.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  gate: `vendor.approval.levels` at its default (2) — CONF-VM-003 "Vendor Approval Levels".
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Invite a new supplier with their primary details into the Prospect list.
  3. Follow the business scenario the workbook gives: "Triggered when a buyer needs a supplier not yet on Procol; buyer enters primary details, the vendor lands in the Prospect list, and onboarding begins once the invite is accepted".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: start onboarding in a structured, traceable way instead of creating vendors ad hoc. The business use case is served: triggered when a buyer needs a supplier not yet on Procol; buyer enters primary details, the vendor lands in the Prospect list, and onboarding begins once the invite is accepted.
- **Oracle.** Observable proof that Buyer-Initiated Vendor Invitation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-002.
- **Trace.** P0 · manual · `FEAT-VM-002` · `vendor.approval.levels` · workbook sheet "3. Vendor Management"

#### PRD-VM-002 — Buyer-Initiated Vendor Invitation: adds vendor to Prospect list

- **Why it matters.** The workbook records this edge case for Buyer-Initiated Vendor Invitation: "Adds vendor to Prospect list".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  gate: `vendor.approval.levels` at its default (2) — CONF-VM-003 "Vendor Approval Levels".
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Adds vendor to Prospect list".
  3. Use Buyer-Initiated Vendor Invitation to invite a new supplier with their primary details into the Prospect list.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Buyer-Initiated Vendor Invitation behaves as the workbook states: "Adds vendor to Prospect list".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-002` · `vendor.approval.levels` · workbook sheet "3. Vendor Management"

#### PRD-VM-003 — Vendor Approval Levels (vendor.approval.levels) = 2 (default)

- **Why it matters.** Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.approval.levels` = 2 (default: 2) — CONF-VM-003 "Vendor Approval Levels", Number, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.approval.levels` to 2.
  2. As a Buyer: use Buyer-Initiated Vendor Invitation to invite a new supplier with their primary details into the Prospect list.
  3. Observe the behaviour the setting controls: number of sequential approval levels required before a vendor is activated.
- **Expected.** The value 2 is accepted and takes effect. What the setting controls: Number of sequential approval levels required before a vendor is activated. Stated business impact: Directly affects how many people must approve each new vendor; reducing this relaxes controls, increasing it adds friction.
- **Oracle.** The behaviour in step 3 reflects the value 2 exactly (the boundary of 1 – 5 is honoured).
- **Trace.** P1 · automate-later · `FEAT-VM-002` · `vendor.approval.levels` · `CONF-VM-003` · workbook sheet "25. Configuration Reference"

#### PRD-VM-004 — Vendor Approval Levels (vendor.approval.levels) = 1 (minimum)

- **Why it matters.** Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.approval.levels` = 1 (default: 2) — CONF-VM-003 "Vendor Approval Levels", Number, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.approval.levels` to 1.
  2. As a Buyer: use Buyer-Initiated Vendor Invitation to invite a new supplier with their primary details into the Prospect list.
  3. Observe the behaviour the setting controls: number of sequential approval levels required before a vendor is activated.
- **Expected.** The value 1 is accepted and takes effect. What the setting controls: Number of sequential approval levels required before a vendor is activated. Stated business impact: Directly affects how many people must approve each new vendor; reducing this relaxes controls, increasing it adds friction.
- **Oracle.** The behaviour in step 3 reflects the value 1 exactly (the boundary of 1 – 5 is honoured).
- **Trace.** P1 · automate-later · `FEAT-VM-002` · `vendor.approval.levels` · `CONF-VM-003` · workbook sheet "25. Configuration Reference"

#### PRD-VM-005 — Vendor Approval Levels (vendor.approval.levels) = 5 (maximum)

- **Why it matters.** Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.approval.levels` = 5 (default: 2) — CONF-VM-003 "Vendor Approval Levels", Number, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.approval.levels` to 5.
  2. As a Buyer: use Buyer-Initiated Vendor Invitation to invite a new supplier with their primary details into the Prospect list.
  3. Observe the behaviour the setting controls: number of sequential approval levels required before a vendor is activated.
- **Expected.** The value 5 is accepted and takes effect. What the setting controls: Number of sequential approval levels required before a vendor is activated. Stated business impact: Directly affects how many people must approve each new vendor; reducing this relaxes controls, increasing it adds friction.
- **Oracle.** The behaviour in step 3 reflects the value 5 exactly (the boundary of 1 – 5 is honoured).
- **Trace.** P1 · automate-later · `FEAT-VM-002` · `vendor.approval.levels` · `CONF-VM-003` · workbook sheet "25. Configuration Reference"

#### PRD-VM-006 — Vendor Approval Levels (vendor.approval.levels) = 0 (below the allowed range)

- **Why it matters.** Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.approval.levels` = 0 (default: 2) — CONF-VM-003 "Vendor Approval Levels", Number, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, try to set `vendor.approval.levels` to 0.
  2. Check the value that is actually stored.
- **Expected.** The value 0 is not accepted: the allowed range is 1 – 5.
- **Oracle.** Saving 0 is refused; the stored value of `vendor.approval.levels` is not 0.
- **Trace.** P1 · automate-later · `FEAT-VM-002` · `vendor.approval.levels` · `CONF-VM-003` · workbook sheet "25. Configuration Reference"

#### PRD-VM-007 — Vendor Approval Levels (vendor.approval.levels) = 6 (above the allowed range)

- **Why it matters.** Different organizations have different governance requirements. A startup may need 1 approver; an enterprise like JSPL needs Finance + Legal + Category approval.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.approval.levels` = 6 (default: 2) — CONF-VM-003 "Vendor Approval Levels", Number, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, try to set `vendor.approval.levels` to 6.
  2. Check the value that is actually stored.
- **Expected.** The value 6 is not accepted: the allowed range is 1 – 5.
- **Oracle.** Saving 6 is refused; the stored value of `vendor.approval.levels` is not 6.
- **Trace.** P1 · automate-later · `FEAT-VM-002` · `vendor.approval.levels` · `CONF-VM-003` · workbook sheet "25. Configuration Reference"

#### PRD-VM-008 — Buyer-Initiated Vendor Invitation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Buyer-Initiated Vendor Invitation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Buyer-Initiated Vendor Invitation to invite a new supplier with their primary details into the Prospect list.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-002` · `vendor.approval.levels` · workbook sheet "3. Vendor Management"

#### PRD-VM-009 — Configurable Vendor Lifecycle Statuses: happy path for the Procurement Manager

- **Why it matters.** A governed status model gives clear lifecycle visibility and control. Business use: Day-to-day tracking and filtering of vendors by stage (prospect, in-progress, active, blacklisted, etc.); the status set is configured to the customer's SOP at setup.
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Vendor Management.
  2. Use Configurable Vendor Lifecycle Statuses to get what the story asks for: configurable lifecycle statuses for every vendor.
  3. Follow the business scenario the workbook gives: "Day-to-day tracking and filtering of vendors by stage (prospect, in-progress, active, blacklisted, etc.); the status set is configured to the customer's SOP at setup".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: track and control exactly where each supplier sits from prospect to active. The business use case is served: day-to-day tracking and filtering of vendors by stage (prospect, in-progress, active, blacklisted, etc.); the status set is configured to the customer's SOP at setup.
- **Oracle.** Observable proof that Configurable Vendor Lifecycle Statuses did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-003.
- **Trace.** P0 · manual · `FEAT-VM-003` · workbook sheet "3. Vendor Management"

#### PRD-VM-010 — Configurable Vendor Lifecycle Statuses: tenant configuration — Status set is tenant-configurable

- **Why it matters.** The workbook says "Status set is tenant-configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Procurement Manager (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Status set is tenant-configurable") and record its current value.
  2. As the Procurement Manager: use Configurable Vendor Lifecycle Statuses to get configurable lifecycle statuses for every vendor.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Configurable Vendor Lifecycle Statuses follows the tenant's configured value, as the workbook states: "Status set is tenant-configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-003` · workbook sheet "3. Vendor Management"

#### PRD-VM-011 — Configurable Vendor Lifecycle Statuses: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Configurable Vendor Lifecycle Statuses. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Configurable Vendor Lifecycle Statuses to get configurable lifecycle statuses for every vendor.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-003` · workbook sheet "3. Vendor Management"

#### PRD-VM-012 — Multiple Onboarding Templates: happy path for the Procurement Manager

- **Why it matters.** Different categories need different data and compliance without separate builds. Business use: At onboarding, the vendor's category/subcategory determines which template loads, each with its own fields and required documents (e.g., MRO vs services vs capex).
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Vendor Management.
  2. Use Multiple Onboarding Templates to get what the story asks for: category-specific onboarding templates with configurable fields.
  3. Follow the business scenario the workbook gives: "At onboarding, the vendor's category/subcategory determines which template loads, each with its own fields and required documents (e.g., MRO vs services vs capex)".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: collect the right data per vendor type without building separate forms. The business use case is served: at onboarding, the vendor's category/subcategory determines which template loads, each with its own fields and required documents (e.g., MRO vs services vs capex).
- **Oracle.** Observable proof that Multiple Onboarding Templates did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-004.
- **Trace.** P0 · manual · `FEAT-VM-004` · workbook sheet "3. Vendor Management"

#### PRD-VM-013 — Multiple Onboarding Templates: tenant configuration — MRO/Service/RM/Capex names are tenant config

- **Why it matters.** The workbook says "MRO/Service/RM/Capex names are tenant config". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Procurement Manager (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("MRO/Service/RM/Capex names are tenant config") and record its current value.
  2. As the Procurement Manager: use Multiple Onboarding Templates to get category-specific onboarding templates with configurable fields.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Multiple Onboarding Templates follows the tenant's configured value, as the workbook states: "MRO/Service/RM/Capex names are tenant config". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-004` · workbook sheet "3. Vendor Management"

#### PRD-VM-014 — Multiple Onboarding Templates: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Multiple Onboarding Templates. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multiple Onboarding Templates to get category-specific onboarding templates with configurable fields.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-004` · workbook sheet "3. Vendor Management"

#### PRD-VM-015 — Domestic and Foreign Vendor Types: happy path for the Buyer

- **Why it matters.** Identity and tax fields differ by geography. Business use: Form adapts at load to vendor geography; domestic vendors are asked for PAN/GSTIN while foreign vendors provide VAT/TIN and skip India-specific checks.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Use Domestic and Foreign Vendor Types to get what the story asks for: onboarding to adapt to domestic versus foreign vendor types.
  3. Follow the business scenario the workbook gives: "Form adapts at load to vendor geography; domestic vendors are asked for PAN/GSTIN while foreign vendors provide VAT/TIN and skip India-specific checks".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: capture the correct identity and tax fields for each geography. The business use case is served: form adapts at load to vendor geography; domestic vendors are asked for PAN/GSTIN while foreign vendors provide VAT/TIN and skip India-specific checks.
- **Oracle.** Observable proof that Domestic and Foreign Vendor Types did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-005.
- **Trace.** P0 · manual · `FEAT-VM-005` · workbook sheet "3. Vendor Management"

#### PRD-VM-016 — Domestic and Foreign Vendor Types: foreign vendors skip PAN/GSTIN auto-fetch

- **Why it matters.** The workbook records this edge case for Domestic and Foreign Vendor Types: "Foreign vendors skip PAN/GSTIN auto-fetch".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Foreign vendors skip PAN/GSTIN auto-fetch".
  3. Use Domestic and Foreign Vendor Types to get onboarding to adapt to domestic versus foreign vendor types.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Domestic and Foreign Vendor Types behaves as the workbook states: "Foreign vendors skip PAN/GSTIN auto-fetch".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-005 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-005` · workbook sheet "3. Vendor Management"

#### PRD-VM-017 — Domestic and Foreign Vendor Types: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Domestic and Foreign Vendor Types. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Domestic and Foreign Vendor Types to get onboarding to adapt to domestic versus foreign vendor types.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-005` · workbook sheet "3. Vendor Management"

#### PRD-VM-018 — Onboarding-History and Existing-Vendor Detection: happy path for the Buyer

- **Why it matters.** Prevents duplicate vendor master records. Business use: Fires the moment onboarding is initiated; a history check routes to extension, resume, or rejection-review instead of allowing a duplicate.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Carry out what the user story describes: "As a buyer, I'm not able to easily tell whether a vendor already exists, so that I can be routed to extension instead of creating a duplicate record".
  3. Follow the business scenario the workbook gives: "Fires the moment onboarding is initiated; a history check routes to extension, resume, or rejection-review instead of allowing a duplicate".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: as a buyer, I'm not able to easily tell whether a vendor already exists, so that I can be routed to extension instead of creating a duplicate record. The business use case is served: fires the moment onboarding is initiated; a history check routes to extension, resume, or rejection-review instead of allowing a duplicate.
- **Oracle.** Observable proof that Onboarding-History and Existing-Vendor Detection did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-007.
- **Trace.** P0 · manual · `FEAT-VM-007` · workbook sheet "3. Vendor Management"

#### PRD-VM-019 — Onboarding-History and Existing-Vendor Detection: routes to Vendor Extension

- **Why it matters.** The workbook records this edge case for Onboarding-History and Existing-Vendor Detection: "Routes to Vendor Extension".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Routes to Vendor Extension".
  3. Use Onboarding-History and Existing-Vendor Detection as the user story describes ("As a buyer, I'm not able to easily tell whether a vendor already exists, so that I can be routed to extension instead of creating a duplicate record").
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Onboarding-History and Existing-Vendor Detection behaves as the workbook states: "Routes to Vendor Extension".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-007 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-007` · workbook sheet "3. Vendor Management"

#### PRD-VM-020 — Onboarding-History and Existing-Vendor Detection: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Onboarding-History and Existing-Vendor Detection. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Onboarding-History and Existing-Vendor Detection as the user story describes ("As a buyer, I'm not able to easily tell whether a vendor already exists, so that I can be routed to extension instead of creating a duplicate record").
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-007` · workbook sheet "3. Vendor Management"

#### PRD-VM-021 — Conflict-of-Interest Hard Blocks: happy path for the Compliance Officer

- **Why it matters.** Mitigates fraud and conflict-of-interest risk. Business use: Enforced at submission when a vendor's email domain or PAN matches a group/employee entity; onboarding is hard-blocked pending compliance review.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup and open Vendor Management.
  2. Use Conflict-of-Interest Hard Blocks to get what the story asks for: onboarding blocked when a vendor's email domain or PAN belongs to a group entity.
  3. Follow the business scenario the workbook gives: "Enforced at submission when a vendor's email domain or PAN matches a group/employee entity; onboarding is hard-blocked pending compliance review".
  4. Check the result against the story's promised outcome.
- **Expected.** The Compliance Officer achieves the story's outcome: prevent related-party and fraud risk. The business use case is served: enforced at submission when a vendor's email domain or PAN matches a group/employee entity; onboarding is hard-blocked pending compliance review.
- **Oracle.** Observable proof that Conflict-of-Interest Hard Blocks did its job for the Compliance Officer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-008.
- **Trace.** P0 · manual · `FEAT-VM-008` · workbook sheet "3. Vendor Management"

#### PRD-VM-022 — Conflict-of-Interest Hard Blocks: hard block

- **Why it matters.** The workbook records this edge case for Conflict-of-Interest Hard Blocks: "Hard block".
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup.
  2. Set up the situation the note describes: "Hard block".
  3. Use Conflict-of-Interest Hard Blocks to get onboarding blocked when a vendor's email domain or PAN belongs to a group entity.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Conflict-of-Interest Hard Blocks behaves as the workbook states: "Hard block".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-008 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-008` · workbook sheet "3. Vendor Management"

#### PRD-VM-023 — Conflict-of-Interest Hard Blocks: tenant configuration — domain/PAN rules are tenant config

- **Why it matters.** The workbook says "domain/PAN rules are tenant config". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Compliance Officer (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("domain/PAN rules are tenant config") and record its current value.
  2. As the Compliance Officer: use Conflict-of-Interest Hard Blocks to get onboarding blocked when a vendor's email domain or PAN belongs to a group entity.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Conflict-of-Interest Hard Blocks follows the tenant's configured value, as the workbook states: "domain/PAN rules are tenant config". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-008` · workbook sheet "3. Vendor Management"

#### PRD-VM-024 — Conflict-of-Interest Hard Blocks: not available on the Growth plan

- **Why it matters.** The workbook limits Conflict-of-Interest Hard Blocks to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the lower-plan tenant.
  2. Try it: use Conflict-of-Interest Hard Blocks to get onboarding blocked when a vendor's email domain or PAN belongs to a group entity.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-008` · workbook sheet "3. Vendor Management"

#### PRD-VM-025 — Conflict-of-Interest Hard Blocks: refused for a user without the Compliance Officer role

- **Why it matters.** The workbook names Compliance Officer as the user of Conflict-of-Interest Hard Blocks. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Conflict-of-Interest Hard Blocks to get onboarding blocked when a vendor's email domain or PAN belongs to a group entity.
  3. Repeat as a Compliance Officer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Compliance Officer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Compliance Officer.
- **Trace.** P1 · automate-later · `FEAT-VM-008` · workbook sheet "3. Vendor Management"

#### PRD-VM-026 — Vendor Self-Registration (OTP): happy path for the Vendor

- **Why it matters.** Verified contact details ensure reachability and reduce spam onboarding. Business use: Immediately after a vendor accepts an invite; they verify email and phone via OTP before the registration form opens.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Sign up with email and phone OTP verification.
  3. Follow the business scenario the workbook gives: "Immediately after a vendor accepts an invite; they verify email and phone via OTP before the registration form opens".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: create a verified account quickly. The business use case is served: immediately after a vendor accepts an invite; they verify email and phone via OTP before the registration form opens.
- **Oracle.** Observable proof that Vendor Self-Registration (OTP) did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-010.
- **Trace.** P0 · manual · `FEAT-VM-010` · workbook sheet "3. Vendor Management"

#### PRD-VM-027 — Vendor Self-Registration (OTP): domestic phone starts 9/8/7/6

- **Why it matters.** The workbook records this edge case for Vendor Self-Registration (OTP): "Domestic phone starts 9/8/7/6".
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Domestic phone starts 9/8/7/6".
  3. Use Vendor Self-Registration (OTP) to sign up with email and phone OTP verification.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor Self-Registration (OTP) behaves as the workbook states: "Domestic phone starts 9/8/7/6".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-010 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-010` · workbook sheet "3. Vendor Management"

#### PRD-VM-028 — Vendor Self-Registration (OTP): foreign uses country rules

- **Why it matters.** The workbook records this edge case for Vendor Self-Registration (OTP): "foreign uses country rules".
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "foreign uses country rules".
  3. Use Vendor Self-Registration (OTP) to sign up with email and phone OTP verification.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor Self-Registration (OTP) behaves as the workbook states: "foreign uses country rules".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-010 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-010` · workbook sheet "3. Vendor Management"

#### PRD-VM-029 — Vendor Self-Registration (OTP): refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor Self-Registration (OTP). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Self-Registration (OTP) to sign up with email and phone OTP verification.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-010` · workbook sheet "3. Vendor Management"

#### PRD-VM-030 — Document OCR and Auto-Fill: happy path for the Vendor

- **Why it matters.** Reduces manual data entry and transcription errors. Business use: As the vendor uploads PAN/GST/cheque/MSME documents; OCR extracts and locks key fields, with manual entry as a fail-safe on persistent failure.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Use Document OCR and Auto-Fill to get what the story asks for: their uploaded documents read by OCR to auto-fill the form.
  3. Follow the business scenario the workbook gives: "As the vendor uploads PAN/GST/cheque/MSME documents; OCR extracts and locks key fields, with manual entry as a fail-safe on persistent failure".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: complete onboarding faster with fewer manual errors. The business use case is served: as the vendor uploads PAN/GST/cheque/MSME documents; OCR extracts and locks key fields, with manual entry as a fail-safe on persistent failure.
- **Oracle.** Observable proof that Document OCR and Auto-Fill did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-011.
- **Trace.** P0 · manual · `FEAT-VM-011` · workbook sheet "3. Vendor Management"

#### PRD-VM-031 — Document OCR and Auto-Fill: manual-entry fail-safe on persistent OCR error

- **Why it matters.** The workbook records this edge case for Document OCR and Auto-Fill: "Manual-entry fail-safe on persistent OCR error".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Manual-entry fail-safe on persistent OCR error".
  3. Use Document OCR and Auto-Fill to get their uploaded documents read by OCR to auto-fill the form.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Document OCR and Auto-Fill behaves as the workbook states: "Manual-entry fail-safe on persistent OCR error".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-011 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-011` · workbook sheet "3. Vendor Management"

#### PRD-VM-032 — Document OCR and Auto-Fill: manual edits highlighted

- **Why it matters.** The workbook records this edge case for Document OCR and Auto-Fill: "manual edits highlighted".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "manual edits highlighted".
  3. Use Document OCR and Auto-Fill to get their uploaded documents read by OCR to auto-fill the form.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Document OCR and Auto-Fill behaves as the workbook states: "manual edits highlighted".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-011 quoting the note.
- **Trace.** P3 · manual · `FEAT-VM-011` · workbook sheet "3. Vendor Management"

#### PRD-VM-033 — Document OCR and Auto-Fill: not available on plans below Growth

- **Why it matters.** The workbook limits Document OCR and Auto-Fill to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Document OCR and Auto-Fill to get their uploaded documents read by OCR to auto-fill the form.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-VM-011` · workbook sheet "3. Vendor Management"

#### PRD-VM-034 — Document OCR and Auto-Fill: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Document OCR and Auto-Fill. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Document OCR and Auto-Fill to get their uploaded documents read by OCR to auto-fill the form.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-011` · workbook sheet "3. Vendor Management"

#### PRD-VM-035 — Automated Identity and Bank Verification: happy path for the MDM / Master Data Team

- **Why it matters.** Automated checks de-risk onboarding and ensure payable accuracy. Business use: Pre-approval verification by MDM/system validating PAN, GST, bank (penny drop), and MSME via API; manual override is available on API outage.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Vendor Management.
  2. Use Automated Identity and Bank Verification to get what the story asks for: PAN, GST, bank, and MSME verified automatically via API.
  3. Follow the business scenario the workbook gives: "Pre-approval verification by MDM/system validating PAN, GST, bank (penny drop), and MSME via API; manual override is available on API outage".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: trust vendor identity and bank details before approval. The business use case is served: pre-approval verification by MDM/system validating PAN, GST, bank (penny drop), and MSME via API; manual override is available on API outage.
- **Oracle.** Observable proof that Automated Identity and Bank Verification did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-012.
- **Trace.** P0 · manual · `FEAT-VM-012` · workbook sheet "3. Vendor Management"

#### PRD-VM-036 — Automated Identity and Bank Verification: includes Aadhaar match for proprietors

- **Why it matters.** The workbook records this edge case for Automated Identity and Bank Verification: "Includes Aadhaar match for proprietors".
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup.
  2. Set up the situation the note describes: "Includes Aadhaar match for proprietors".
  3. Use Automated Identity and Bank Verification to get PAN, GST, bank, and MSME verified automatically via API.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Automated Identity and Bank Verification behaves as the workbook states: "Includes Aadhaar match for proprietors".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-012 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-012` · workbook sheet "3. Vendor Management"

#### PRD-VM-037 — Automated Identity and Bank Verification: overrides logged

- **Why it matters.** The workbook records this edge case for Automated Identity and Bank Verification: "overrides logged".
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup.
  2. Set up the situation the note describes: "overrides logged".
  3. Use Automated Identity and Bank Verification to get PAN, GST, bank, and MSME verified automatically via API.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Automated Identity and Bank Verification behaves as the workbook states: "overrides logged".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-012 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-012` · workbook sheet "3. Vendor Management"

#### PRD-VM-038 — Automated Identity and Bank Verification: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of Automated Identity and Bank Verification. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Automated Identity and Bank Verification to get PAN, GST, bank, and MSME verified automatically via API.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-VM-012` · workbook sheet "3. Vendor Management"

#### PRD-VM-039 — Duplicate Detection: happy path for the Buyer

- **Why it matters.** Keeps the vendor master clean and prevents split spend. Business use: At submission, the system matches PAN/GST/bank/email/mobile against the master and alerts the initiator with the existing vendor code.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Use Duplicate Detection to get what the story asks for: new vendors matched against existing records on PAN, GST, bank, email, and mobile.
  3. Follow the business scenario the workbook gives: "At submission, the system matches PAN/GST/bank/email/mobile against the master and alerts the initiator with the existing vendor code".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: avoid creating duplicate suppliers and splitting spend. The business use case is served: at submission, the system matches PAN/GST/bank/email/mobile against the master and alerts the initiator with the existing vendor code.
- **Oracle.** Observable proof that Duplicate Detection did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-015.
- **Trace.** P0 · manual · `FEAT-VM-015` · workbook sheet "3. Vendor Management"

#### PRD-VM-040 — Duplicate Detection: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Duplicate Detection. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Duplicate Detection to get new vendors matched against existing records on PAN, GST, bank, email, and mobile.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-015` · workbook sheet "3. Vendor Management"

#### PRD-VM-041 — Blacklist Re-Onboarding Prevention: happy path for the Compliance Officer

- **Why it matters.** Enforces blacklist integrity. Business use: When a previously blacklisted entity attempts to re-onboard under a new profile; shared digital identifiers block it.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup and open Vendor Management.
  2. Use Blacklist Re-Onboarding Prevention to get what the story asks for: blacklisted entities blocked from re-onboarding via shared identifiers.
  3. Follow the business scenario the workbook gives: "When a previously blacklisted entity attempts to re-onboard under a new profile; shared digital identifiers block it".
  4. Check the result against the story's promised outcome.
- **Expected.** The Compliance Officer achieves the story's outcome: keep barred suppliers out. The business use case is served: when a previously blacklisted entity attempts to re-onboard under a new profile; shared digital identifiers block it.
- **Oracle.** Observable proof that Blacklist Re-Onboarding Prevention did its job for the Compliance Officer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-016.
- **Trace.** P0 · manual · `FEAT-VM-016` · workbook sheet "3. Vendor Management"

#### PRD-VM-042 — Blacklist Re-Onboarding Prevention: not available on the Growth plan

- **Why it matters.** The workbook limits Blacklist Re-Onboarding Prevention to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the lower-plan tenant.
  2. Try it: use Blacklist Re-Onboarding Prevention to get blacklisted entities blocked from re-onboarding via shared identifiers.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-016` · workbook sheet "3. Vendor Management"

#### PRD-VM-043 — Blacklist Re-Onboarding Prevention: refused for a user without the Compliance Officer role

- **Why it matters.** The workbook names Compliance Officer as the user of Blacklist Re-Onboarding Prevention. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Blacklist Re-Onboarding Prevention to get blacklisted entities blocked from re-onboarding via shared identifiers.
  3. Repeat as a Compliance Officer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Compliance Officer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Compliance Officer.
- **Trace.** P1 · automate-later · `FEAT-VM-016` · workbook sheet "3. Vendor Management"

#### PRD-VM-044 — Per-Category Vendor Typing: happy path for the Vendor

- **Why it matters.** Category-accurate typing drives correct sourcing and compliance. Business use: At onboarding, the vendor declares a type (OEM/dealer/trader/etc.) per category; OEM and dealer types must attach the mandatory supporting certificate.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Declare their vendor type per category with the required supporting documents.
  3. Follow the business scenario the workbook gives: "At onboarding, the vendor declares a type (OEM/dealer/trader/etc.) per category; OEM and dealer types must attach the mandatory supporting certificate".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: be sourced accurately for what they actually supply. The business use case is served: at onboarding, the vendor declares a type (OEM/dealer/trader/etc.) per category; OEM and dealer types must attach the mandatory supporting certificate.
- **Oracle.** Observable proof that Per-Category Vendor Typing did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-018.
- **Trace.** P0 · manual · `FEAT-VM-018` · workbook sheet "3. Vendor Management"

#### PRD-VM-045 — Per-Category Vendor Typing: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Per-Category Vendor Typing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Per-Category Vendor Typing to declare their vendor type per category with the required supporting documents.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-018` · workbook sheet "3. Vendor Management"

#### PRD-VM-046 — Collaborative Submission Review: happy path for the Buyer

- **Why it matters.** Speeds correction loops. Business use: After a vendor submits, the buyer/end-user co-edits to fix minor errors before finalizing, avoiding a full resubmission loop.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Edit a vendor's submission collaboratively before finalizing.
  3. Follow the business scenario the workbook gives: "After a vendor submits, the buyer/end-user co-edits to fix minor errors before finalizing, avoiding a full resubmission loop".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: fix minor errors without a full resubmission cycle. The business use case is served: after a vendor submits, the buyer/end-user co-edits to fix minor errors before finalizing, avoiding a full resubmission loop.
- **Oracle.** Observable proof that Collaborative Submission Review did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-020.
- **Trace.** P0 · manual · `FEAT-VM-020` · workbook sheet "3. Vendor Management"

#### PRD-VM-047 — Collaborative Submission Review: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Collaborative Submission Review. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Collaborative Submission Review to edit a vendor's submission collaboratively before finalizing.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-020` · workbook sheet "3. Vendor Management"

#### PRD-VM-048 — Onboarding Approval Workflow: happy path for the Approver

- **Why it matters.** Enforces qualification governance before commercial engagement. Business use: Before activation; the onboarding request runs a configurable multi-level approval (finance/legal/category/MDM) with query and reject.
- **Setup.**
  Persona: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as an Approver on the tenant described in Setup and open Vendor Management.
  2. Use Onboarding Approval Workflow to get what the story asks for: configurable multi-level approval of onboarding with query and reject options.
  3. Follow the business scenario the workbook gives: "Before activation; the onboarding request runs a configurable multi-level approval (finance/legal/category/MDM) with query and reject".
  4. Check the result against the story's promised outcome.
- **Expected.** The Approver achieves the story's outcome: enforce qualification governance before engagement. The business use case is served: before activation; the onboarding request runs a configurable multi-level approval (finance/legal/category/MDM) with query and reject.
- **Oracle.** Observable proof that Onboarding Approval Workflow did its job for the Approver — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-022.
- **Trace.** P0 · manual · `FEAT-VM-022` · `MOD-09` · workbook sheet "3. Vendor Management"

#### PRD-VM-049 — Onboarding Approval Workflow: tenant configuration — 7-level standard / 3-level FI are tenant config

- **Why it matters.** The workbook says "7-level standard / 3-level FI are tenant config". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Approver (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("7-level standard / 3-level FI are tenant config") and record its current value.
  2. As the Approver: use Onboarding Approval Workflow to get configurable multi-level approval of onboarding with query and reject options.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Onboarding Approval Workflow follows the tenant's configured value, as the workbook states: "7-level standard / 3-level FI are tenant config". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-022` · `MOD-09` · workbook sheet "3. Vendor Management"

#### PRD-VM-050 — Onboarding Approval Workflow: refused for a user without the Approver role

- **Why it matters.** The workbook names Approver as the user of Onboarding Approval Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Approver.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Onboarding Approval Workflow to get configurable multi-level approval of onboarding with query and reject options.
  3. Repeat as an Approver.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Approver can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Approver.
- **Trace.** P1 · automate-later · `FEAT-VM-022` · `MOD-09` · workbook sheet "3. Vendor Management"

#### PRD-VM-051 — Finance / Tax / MDM Review: happy path for the Finance Controller

- **Why it matters.** Segregated review ensures accuracy and tax correctness. Business use: Within onboarding approval; finance, taxation, and MDM each review their slice — taxation sets the TDS code/rate, MDM does the final completeness check.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Vendor Management.
  2. Use Finance / Tax / MDM Review to get what the story asks for: a dedicated step to set the TDS code and rate without touching other fields.
  3. Follow the business scenario the workbook gives: "Within onboarding approval; finance, taxation, and MDM each review their slice — taxation sets the TDS code/rate, MDM does the final completeness check".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: ensure tax accuracy before SAP creation. The business use case is served: within onboarding approval; finance, taxation, and MDM each review their slice — taxation sets the TDS code/rate, MDM does the final completeness check.
- **Oracle.** Observable proof that Finance / Tax / MDM Review did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-023.
- **Trace.** P0 · manual · `FEAT-VM-023` · workbook sheet "3. Vendor Management"

#### PRD-VM-052 — Finance / Tax / MDM Review: MDM cannot edit Account Group/PAN

- **Why it matters.** The workbook records this access rule for Finance / Tax / MDM Review: "MDM cannot edit Account Group/PAN".
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup.
  2. Set up the situation the note describes: "MDM cannot edit Account Group/PAN".
  3. Use Finance / Tax / MDM Review to get a dedicated step to set the TDS code and rate without touching other fields.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Finance / Tax / MDM Review behaves as the workbook states: "MDM cannot edit Account Group/PAN".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-023 quoting the note.
- **Trace.** P1 · automate-later · `FEAT-VM-023` · workbook sheet "3. Vendor Management"

#### PRD-VM-053 — Finance / Tax / MDM Review: not available on the Growth plan

- **Why it matters.** The workbook limits Finance / Tax / MDM Review to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Finance / Tax / MDM Review to get a dedicated step to set the TDS code and rate without touching other fields.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-023` · workbook sheet "3. Vendor Management"

#### PRD-VM-054 — Finance / Tax / MDM Review: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Finance / Tax / MDM Review. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Finance / Tax / MDM Review to get a dedicated step to set the TDS code and rate without touching other fields.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-VM-023` · workbook sheet "3. Vendor Management"

#### PRD-VM-055 — SAP Vendor Master Creation: happy path for the MDM / Master Data Team

- **Why it matters.** Procol-as-source-of-truth with automated ERP propagation removes manual master creation. Business use: On final approval; the vendor is created in SAP via API, the returned code is stored, and failures are auto-retried and logged for MDM.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Vendor Management.
  2. Use SAP Vendor Master Creation to get what the story asks for: approved vendors created in SAP automatically with the code returned.
  3. Follow the business scenario the workbook gives: "On final approval; the vendor is created in SAP via API, the returned code is stored, and failures are auto-retried and logged for MDM".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: avoid manual master creation and catch failures. The business use case is served: on final approval; the vendor is created in SAP via API, the returned code is stored, and failures are auto-retried and logged for MDM.
- **Oracle.** Observable proof that SAP Vendor Master Creation did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-024.
- **Trace.** P0 · manual · `FEAT-VM-024` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-056 — SAP Vendor Master Creation: not available on the Growth plan

- **Why it matters.** The workbook limits SAP Vendor Master Creation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the lower-plan tenant.
  2. Try it: use SAP Vendor Master Creation to get approved vendors created in SAP automatically with the code returned.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-024` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-057 — SAP Vendor Master Creation: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of SAP Vendor Master Creation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use SAP Vendor Master Creation to get approved vendors created in SAP automatically with the code returned.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-VM-024` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-058 — Document Push to SAP DMS: happy path for the MDM / Master Data Team

- **Why it matters.** Single source of truth with a read-only ERP mirror. Business use: After creation; vendor documents and metadata are pushed to SAP DMS as read-only for ERP users.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Vendor Management.
  2. Use Document Push to SAP DMS to get what the story asks for: vendor documents pushed to SAP DMS as read-only.
  3. Follow the business scenario the workbook gives: "After creation; vendor documents and metadata are pushed to SAP DMS as read-only for ERP users".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: ERP users can view them without altering the source of truth. The business use case is served: after creation; vendor documents and metadata are pushed to SAP DMS as read-only for ERP users.
- **Oracle.** Observable proof that Document Push to SAP DMS did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-025.
- **Trace.** P0 · manual · `FEAT-VM-025` · workbook sheet "3. Vendor Management"

#### PRD-VM-059 — Document Push to SAP DMS: docs cannot be deleted from SAP

- **Why it matters.** The workbook records this edge case for Document Push to SAP DMS: "Docs cannot be deleted from SAP".
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup.
  2. Set up the situation the note describes: "Docs cannot be deleted from SAP".
  3. Use Document Push to SAP DMS to get vendor documents pushed to SAP DMS as read-only.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Document Push to SAP DMS behaves as the workbook states: "Docs cannot be deleted from SAP".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-025 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-025` · workbook sheet "3. Vendor Management"

#### PRD-VM-060 — Document Push to SAP DMS: not available on the Growth plan

- **Why it matters.** The workbook limits Document Push to SAP DMS to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the lower-plan tenant.
  2. Try it: use Document Push to SAP DMS to get vendor documents pushed to SAP DMS as read-only.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-025` · workbook sheet "3. Vendor Management"

#### PRD-VM-061 — Document Push to SAP DMS: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of Document Push to SAP DMS. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Document Push to SAP DMS to get vendor documents pushed to SAP DMS as read-only.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-VM-025` · workbook sheet "3. Vendor Management"

#### PRD-VM-062 — Vendor Amendment Workflow: happy path for the Vendor

- **Why it matters.** Controlled change management keeps the master accurate and auditable. Business use: Post-onboarding, when bank/address/statutory/tax/status details change; type-specific validation and approval run with a three-way match.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Amend their details through type-specific validation and approval.
  3. Follow the business scenario the workbook gives: "Post-onboarding, when bank/address/statutory/tax/status details change; type-specific validation and approval run with a three-way match".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: keep their record accurate and auditable. The business use case is served: post-onboarding, when bank/address/statutory/tax/status details change; type-specific validation and approval run with a three-way match.
- **Oracle.** Observable proof that Vendor Amendment Workflow did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-026.
- **Trace.** P0 · manual · `FEAT-VM-026` · workbook sheet "3. Vendor Management"

#### PRD-VM-063 — Vendor Amendment Workflow: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor Amendment Workflow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Amendment Workflow to amend their details through type-specific validation and approval.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-026` · workbook sheet "3. Vendor Management"

#### PRD-VM-064 — Vendor Extension: happy path for the Buyer

- **Why it matters.** Avoids duplicate masters across org units. Business use: When an approved vendor is needed at a new plant or company code; extension reuses the existing code and inherited (unexpired) documents.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Extend an existing vendor to a new org or plant reusing its code.
  3. Follow the business scenario the workbook gives: "When an approved vendor is needed at a new plant or company code; extension reuses the existing code and inherited (unexpired) documents".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: avoid duplicate masters across units. The business use case is served: when an approved vendor is needed at a new plant or company code; extension reuses the existing code and inherited (unexpired) documents.
- **Oracle.** Observable proof that Vendor Extension did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-027.
- **Trace.** P0 · manual · `FEAT-VM-027` · workbook sheet "3. Vendor Management"

#### PRD-VM-065 — Vendor Extension: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor Extension to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Vendor Extension to extend an existing vendor to a new org or plant reusing its code.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-027` · workbook sheet "3. Vendor Management"

#### PRD-VM-066 — Vendor Extension: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Vendor Extension. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Extension to extend an existing vendor to a new org or plant reusing its code.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-027` · workbook sheet "3. Vendor Management"

#### PRD-VM-067 — Vendor Blocking and Inactive Lifecycle: happy path for the Procurement Manager

- **Why it matters.** Enforces sourcing/payment controls on risky vendors. Business use: Procurement/compliance blocks a non-compliant vendor across RFQ/PO; SAP-inactivated vendors are reactivated through amendment.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Vendor Management.
  2. Block vendors and reactivate SAP-inactivated ones.
  3. Follow the business scenario the workbook gives: "Procurement/compliance blocks a non-compliant vendor across RFQ/PO; SAP-inactivated vendors are reactivated through amendment".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: enforce controls across sourcing and payments. The business use case is served: procurement/compliance blocks a non-compliant vendor across RFQ/PO; SAP-inactivated vendors are reactivated through amendment.
- **Oracle.** Observable proof that Vendor Blocking and Inactive Lifecycle did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-028.
- **Trace.** P0 · manual · `FEAT-VM-028` · workbook sheet "3. Vendor Management"

#### PRD-VM-068 — Vendor Blocking and Inactive Lifecycle: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor Blocking and Inactive Lifecycle to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Vendor Blocking and Inactive Lifecycle to block vendors and reactivate SAP-inactivated ones.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-028` · workbook sheet "3. Vendor Management"

#### PRD-VM-069 — Vendor Blocking and Inactive Lifecycle: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Vendor Blocking and Inactive Lifecycle. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Blocking and Inactive Lifecycle to block vendors and reactivate SAP-inactivated ones.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-028` · workbook sheet "3. Vendor Management"

#### PRD-VM-070 — Bulk Vendor Upload: happy path for the Implementation Partner

- **Why it matters.** Mass onboarding at implementation without manual entry. Business use: At implementation; the customer's approved-vendor list is mass-created from an Excel template, deduped on PAN.
- **Setup.**
  Persona: Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  Context from the workbook: From master-data onboarding step.
- **Steps.**
  1. Sign in as an Implementation Partner on the tenant described in Setup and open Vendor Management.
  2. Bulk-create vendors from an Excel list deduped on PAN.
  3. Follow the business scenario the workbook gives: "At implementation; the customer's approved-vendor list is mass-created from an Excel template, deduped on PAN".
  4. Check the result against the story's promised outcome.
- **Expected.** The Implementation Partner achieves the story's outcome: onboard an approved-vendor list at go-live without manual entry. The business use case is served: at implementation; the customer's approved-vendor list is mass-created from an Excel template, deduped on PAN.
- **Oracle.** Observable proof that Bulk Vendor Upload did its job for the Implementation Partner — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-032.
- **Trace.** P0 · manual · `FEAT-VM-032` · workbook sheet "3. Vendor Management"

#### PRD-VM-071 — Bulk Vendor Upload: refused for a user without the Implementation Partner role

- **Why it matters.** The workbook names Implementation Partner as the user of Bulk Vendor Upload. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk Vendor Upload to bulk-create vendors from an Excel list deduped on PAN.
  3. Repeat as an Implementation Partner.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Implementation Partner can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Implementation Partner.
- **Trace.** P1 · automate-later · `FEAT-VM-032` · workbook sheet "3. Vendor Management"

#### PRD-VM-072 — Multi-Channel and Broadcast Notifications: happy path for the Tenant Admin

- **Why it matters.** Reliable, branded, trackable vendor communication. Business use: Platform-wide vendor communication; invites/reminders go via email/WhatsApp/SMS, and admins broadcast notices with mandatory acknowledgement.
- **Setup.**
  Persona: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Vendor Management.
  2. Use Multi-Channel and Broadcast Notifications to get what the story asks for: email, WhatsApp, SMS, and broadcast notifications with acknowledgement.
  3. Follow the business scenario the workbook gives: "Platform-wide vendor communication; invites/reminders go via email/WhatsApp/SMS, and admins broadcast notices with mandatory acknowledgement".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: reach vendors reliably and prove receipt. The business use case is served: platform-wide vendor communication; invites/reminders go via email/WhatsApp/SMS, and admins broadcast notices with mandatory acknowledgement.
- **Oracle.** Observable proof that Multi-Channel and Broadcast Notifications did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-034.
- **Trace.** P0 · manual · `FEAT-VM-034` · workbook sheet "3. Vendor Management"

#### PRD-VM-073 — Multi-Channel and Broadcast Notifications: tenant configuration — Email domain/SMTP and WhatsApp consent are tenant config

- **Why it matters.** The workbook says "Email domain/SMTP and WhatsApp consent are tenant config". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Tenant Admin (to use the feature).
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Email domain/SMTP and WhatsApp consent are tenant config") and record its current value.
  2. As the Tenant Admin: use Multi-Channel and Broadcast Notifications to get email, WhatsApp, SMS, and broadcast notifications with acknowledgement.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Multi-Channel and Broadcast Notifications follows the tenant's configured value, as the workbook states: "Email domain/SMTP and WhatsApp consent are tenant config". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-034` · workbook sheet "3. Vendor Management"

#### PRD-VM-074 — Multi-Channel and Broadcast Notifications: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Multi-Channel and Broadcast Notifications. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Channel and Broadcast Notifications to get email, WhatsApp, SMS, and broadcast notifications with acknowledgement.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-VM-034` · workbook sheet "3. Vendor Management"

#### PRD-VM-075 — Prospect-to-Vendor Promotion: happy path for the Procurement Manager

- **Why it matters.** Explicit lifecycle progression control. Business use: The VM team manually advances a vetted prospect to active vendor status.
- **Setup.**
  Persona: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Vendor Management.
  2. Promote a prospect to an active vendor.
  3. Follow the business scenario the workbook gives: "The VM team manually advances a vetted prospect to active vendor status".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: advance qualified suppliers explicitly. The business use case is served: the VM team manually advances a vetted prospect to active vendor status.
- **Oracle.** Observable proof that Prospect-to-Vendor Promotion did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-037.
- **Trace.** P0 · manual · `FEAT-VM-037` · workbook sheet "3. Vendor Management"

#### PRD-VM-076 — Prospect-to-Vendor Promotion: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Prospect-to-Vendor Promotion. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Prospect-to-Vendor Promotion to promote a prospect to an active vendor.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-037` · workbook sheet "3. Vendor Management"

## 2. Optional features

#### PRD-VM-077 — VMS / VRP Import: happy path for the Implementation Partner

- **Why it matters.** Avoids re-keying established vendor data and accelerates go-live. Business use: Run once at go-live for integrated enterprises that already maintain a VMS/VRP; implementation and MDM teams migrate the existing approved-vendor records so history is preserved.
- **Setup.**
  Persona: Implementation Partner.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
  gate: `vendor.form.sections` at its default (Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections".
  gate: `vendor.documents.required` at its default (PAN, GST Certificate) — CONF-VM-002 "Mandatory Document Types".
- **Steps.**
  1. Sign in as an Implementation Partner on the tenant described in Setup and open Vendor Management.
  2. Import vendors directly from the enterprise's existing VMS/VRP.
  3. Follow the business scenario the workbook gives: "Run once at go-live for integrated enterprises that already maintain a VMS/VRP; implementation and MDM teams migrate the existing approved-vendor records so history is preserved".
  4. Check the result against the story's promised outcome.
- **Expected.** The Implementation Partner achieves the story's outcome: avoid re-onboarding established suppliers and accelerate go-live. The business use case is served: run once at go-live for integrated enterprises that already maintain a VMS/VRP; implementation and MDM teams migrate the existing approved-vendor records so history is preserved.
- **Oracle.** Observable proof that VMS / VRP Import did its job for the Implementation Partner — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-001.
- **Trace.** P1 · manual · `FEAT-VM-001` · `vendor.form.sections` · `vendor.documents.required` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-078 — Vendor Form Sections (vendor.form.sections) = default set (Basic Info, Banking, Documents, Tax)

- **Why it matters.** Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.form.sections` = Basic Info, Banking, Documents, Tax (default: Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections", Multi-select, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `vendor.form.sections` to Basic Info, Banking, Documents, Tax.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: controls which sections are visible and required on the vendor onboarding form.
- **Expected.** Exactly the default set applies: Basic Info, Banking, Documents, Tax. What the setting controls: Controls which sections are visible and required on the vendor onboarding form.
- **Oracle.** The behaviour in step 3 reflects each default value and none of the others.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `CONF-VM-001` · workbook sheet "25. Configuration Reference"

#### PRD-VM-079 — Vendor Form Sections (vendor.form.sections) = default plus Qualifications, References

- **Why it matters.** Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.form.sections` = Basic Info, Banking, Documents, Tax, Qualifications, References (default: Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections", Multi-select, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `vendor.form.sections` to Basic Info, Banking, Documents, Tax, Qualifications, References.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: controls which sections are visible and required on the vendor onboarding form.
- **Expected.** Every allowed value is accepted and applies: Basic Info, Banking, Documents, Tax, Qualifications, References. What the setting controls: Controls which sections are visible and required on the vendor onboarding form.
- **Oracle.** The behaviour in step 3 reflects all 6 allowed values.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `CONF-VM-001` · workbook sheet "25. Configuration Reference"

#### PRD-VM-080 — Vendor Form Sections (vendor.form.sections) = default without Basic Info

- **Why it matters.** Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.form.sections` = Banking, Documents, Tax (default: Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections", Multi-select, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `vendor.form.sections` to Banking, Documents, Tax.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: controls which sections are visible and required on the vendor onboarding form.
- **Expected.** Basic Info no longer applies while the remaining values do. What the setting controls: Controls which sections are visible and required on the vendor onboarding form.
- **Oracle.** The behaviour in step 3 no longer reflects Basic Info; the other default values still apply.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `CONF-VM-001` · workbook sheet "25. Configuration Reference"

#### PRD-VM-081 — Vendor Form Sections (vendor.form.sections) = default without Banking

- **Why it matters.** Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.form.sections` = Basic Info, Documents, Tax (default: Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections", Multi-select, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `vendor.form.sections` to Basic Info, Documents, Tax.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: controls which sections are visible and required on the vendor onboarding form.
- **Expected.** Banking no longer applies while the remaining values do. What the setting controls: Controls which sections are visible and required on the vendor onboarding form. Stated business impact: Changes which data is collected at onboarding; removing Banking section means payment details must be captured elsewhere.
- **Oracle.** The behaviour in step 3 no longer reflects Banking; the other default values still apply.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `CONF-VM-001` · workbook sheet "25. Configuration Reference"

#### PRD-VM-082 — Vendor Form Sections (vendor.form.sections) = default without Documents

- **Why it matters.** Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.form.sections` = Basic Info, Banking, Tax (default: Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections", Multi-select, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `vendor.form.sections` to Basic Info, Banking, Tax.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: controls which sections are visible and required on the vendor onboarding form.
- **Expected.** Documents no longer applies while the remaining values do. What the setting controls: Controls which sections are visible and required on the vendor onboarding form.
- **Oracle.** The behaviour in step 3 no longer reflects Documents; the other default values still apply.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `CONF-VM-001` · workbook sheet "25. Configuration Reference"

#### PRD-VM-083 — Vendor Form Sections (vendor.form.sections) = default without Tax

- **Why it matters.** Different tenants have different compliance requirements. A manufacturing client may require HSE certificates; an FMCG client may not. This config avoids building separate forms per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.form.sections` = Basic Info, Banking, Documents (default: Basic Info, Banking, Documents, Tax) — CONF-VM-001 "Vendor Form Sections", Multi-select, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `vendor.form.sections` to Basic Info, Banking, Documents.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: controls which sections are visible and required on the vendor onboarding form.
- **Expected.** Tax no longer applies while the remaining values do. What the setting controls: Controls which sections are visible and required on the vendor onboarding form.
- **Oracle.** The behaviour in step 3 no longer reflects Tax; the other default values still apply.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `CONF-VM-001` · workbook sheet "25. Configuration Reference"

#### PRD-VM-084 — Mandatory Document Types (vendor.documents.required) = default set (PAN, GST Certificate)

- **Why it matters.** Mandatory document lists differ by country, industry, and company policy. Making it configurable ensures compliance without code changes per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.documents.required` = PAN, GST Certificate (default: PAN, GST Certificate) — CONF-VM-002 "Mandatory Document Types", Multi-select / JSON, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.documents.required` to PAN, GST Certificate.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: list of document types a vendor must upload before their profile can be submitted for approval.
- **Expected.** Exactly the default set applies: PAN, GST Certificate. What the setting controls: List of document types a vendor must upload before their profile can be submitted for approval.
- **Oracle.** The behaviour in step 3 reflects each default value and none of the others.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.documents.required` · `CONF-VM-002` · workbook sheet "25. Configuration Reference"

#### PRD-VM-085 — Mandatory Document Types (vendor.documents.required) = default plus MSME Certificate, ISO Certificate, TAN, Bank Cancel Cheque, Trade Licence

- **Why it matters.** Mandatory document lists differ by country, industry, and company policy. Making it configurable ensures compliance without code changes per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.documents.required` = PAN, GST Certificate, MSME Certificate, ISO Certificate, TAN, Bank Cancel Cheque, Trade Licence (default: PAN, GST Certificate) — CONF-VM-002 "Mandatory Document Types", Multi-select / JSON, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.documents.required` to PAN, GST Certificate, MSME Certificate, ISO Certificate, TAN, Bank Cancel Cheque, Trade Licence.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: list of document types a vendor must upload before their profile can be submitted for approval.
- **Expected.** Every allowed value is accepted and applies: PAN, GST Certificate, MSME Certificate, ISO Certificate, TAN, Bank Cancel Cheque, Trade Licence. What the setting controls: List of document types a vendor must upload before their profile can be submitted for approval.
- **Oracle.** The behaviour in step 3 reflects all 7 allowed values.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.documents.required` · `CONF-VM-002` · workbook sheet "25. Configuration Reference"

#### PRD-VM-086 — Mandatory Document Types (vendor.documents.required) = default without PAN

- **Why it matters.** Mandatory document lists differ by country, industry, and company policy. Making it configurable ensures compliance without code changes per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.documents.required` = GST Certificate (default: PAN, GST Certificate) — CONF-VM-002 "Mandatory Document Types", Multi-select / JSON, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.documents.required` to GST Certificate.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: list of document types a vendor must upload before their profile can be submitted for approval.
- **Expected.** PAN no longer applies while the remaining values do. What the setting controls: List of document types a vendor must upload before their profile can be submitted for approval.
- **Oracle.** The behaviour in step 3 no longer reflects PAN; the other default values still apply.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.documents.required` · `CONF-VM-002` · workbook sheet "25. Configuration Reference"

#### PRD-VM-087 — Mandatory Document Types (vendor.documents.required) = default without GST Certificate

- **Why it matters.** Mandatory document lists differ by country, industry, and company policy. Making it configurable ensures compliance without code changes per tenant.
- **Setup.**
  Persona: Tenant Admin and Implementation Partner.
  Plan: any tenant (Plan Required: All Plans).
  gate: `vendor.documents.required` = PAN (default: PAN, GST Certificate) — CONF-VM-002 "Mandatory Document Types", Multi-select / JSON, risk if changed: High.
- **Steps.**
  1. As the Tenant Admin, set `vendor.documents.required` to PAN.
  2. As an Implementation Partner: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Observe the behaviour the setting controls: list of document types a vendor must upload before their profile can be submitted for approval.
- **Expected.** GST Certificate no longer applies while the remaining values do. What the setting controls: List of document types a vendor must upload before their profile can be submitted for approval.
- **Oracle.** The behaviour in step 3 no longer reflects GST Certificate; the other default values still apply.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.documents.required` · `CONF-VM-002` · workbook sheet "25. Configuration Reference"

#### PRD-VM-088 — VMS / VRP Import: not available on the Growth plan

- **Why it matters.** The workbook limits VMS / VRP Import to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Implementation Partner.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an Implementation Partner on the lower-plan tenant.
  2. Try it: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `vendor.documents.required` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-089 — VMS / VRP Import: refused for a user without the Implementation Partner role

- **Why it matters.** The workbook names Implementation Partner as the user of VMS / VRP Import. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Implementation Partner.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use VMS / VRP Import to import vendors directly from the enterprise's existing VMS/VRP.
  3. Repeat as an Implementation Partner.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Implementation Partner can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Implementation Partner.
- **Trace.** P1 · automate-later · `FEAT-VM-001` · `vendor.form.sections` · `vendor.documents.required` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-090 — Section Weightage and Prequalification Scoring: happy path for the Category Manager

- **Why it matters.** Objective, reusable qualification scoring reduces subjective selection. Business use: During onboarding evaluation for prequalification categories; category managers score weighted sections and the rating is later surfaced at RFQ award.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Vendor Management.
  2. Use Section Weightage and Prequalification Scoring to get what the story asks for: weighted sections that auto-score a vendor's prequalification rating.
  3. Follow the business scenario the workbook gives: "During onboarding evaluation for prequalification categories; category managers score weighted sections and the rating is later surfaced at RFQ award".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: qualify suppliers objectively and reuse the score at award. The business use case is served: during onboarding evaluation for prequalification categories; category managers score weighted sections and the rating is later surfaced at RFQ award.
- **Oracle.** Observable proof that Section Weightage and Prequalification Scoring did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-006.
- **Trace.** P1 · manual · `FEAT-VM-006` · workbook sheet "3. Vendor Management"

#### PRD-VM-091 — Section Weightage and Prequalification Scoring: score pulls into RFX/RFQ

- **Why it matters.** The workbook records this edge case for Section Weightage and Prequalification Scoring: "Score pulls into RFX/RFQ".
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Score pulls into RFX/RFQ".
  3. Use Section Weightage and Prequalification Scoring to get weighted sections that auto-score a vendor's prequalification rating.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Section Weightage and Prequalification Scoring behaves as the workbook states: "Score pulls into RFX/RFQ".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-006 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-006` · workbook sheet "3. Vendor Management"

#### PRD-VM-092 — Section Weightage and Prequalification Scoring: not available on plans below Growth

- **Why it matters.** The workbook limits Section Weightage and Prequalification Scoring to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Section Weightage and Prequalification Scoring to get weighted sections that auto-score a vendor's prequalification rating.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-VM-006` · workbook sheet "3. Vendor Management"

#### PRD-VM-093 — Section Weightage and Prequalification Scoring: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Section Weightage and Prequalification Scoring. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Section Weightage and Prequalification Scoring to get weighted sections that auto-score a vendor's prequalification rating.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-006` · workbook sheet "3. Vendor Management"

#### PRD-VM-094 — Multi-GSTIN-per-PAN Selection: happy path for the Vendor

- **Why it matters.** Handles multi-state GST registrations cleanly. Business use: During registration for vendors with multiple state GST registrations; all GSTINs are fetched from the portal and already-registered ones are greyed out.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  Context from the workbook: Depends on GST API.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Use Multi-GSTIN-per-PAN Selection to get what the story asks for: all GSTINs linked to their PAN fetched with the already-registered ones greyed out.
  3. Follow the business scenario the workbook gives: "During registration for vendors with multiple state GST registrations; all GSTINs are fetched from the portal and already-registered ones are greyed out".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: pick the correct registration without duplication. The business use case is served: during registration for vendors with multiple state GST registrations; all GSTINs are fetched from the portal and already-registered ones are greyed out.
- **Oracle.** Observable proof that Multi-GSTIN-per-PAN Selection did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-009.
- **Trace.** P1 · manual · `FEAT-VM-009` · workbook sheet "3. Vendor Management"

#### PRD-VM-095 — Multi-GSTIN-per-PAN Selection: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Multi-GSTIN-per-PAN Selection. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-GSTIN-per-PAN Selection to get all GSTINs linked to their PAN fetched with the already-registered ones greyed out.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-009` · workbook sheet "3. Vendor Management"

#### PRD-VM-096 — Enhanced Due Diligence: happy path for the Finance Controller

- **Why it matters.** Higher-risk vendors warrant deeper financial scrutiny. Business use: For high-value, import, or select categories; finance reviews audited financials and credit ratings before approval.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the tenant described in Setup and open Vendor Management.
  2. Use Enhanced Due Diligence to get what the story asks for: financial and credit-rating due diligence on high-value vendors.
  3. Follow the business scenario the workbook gives: "For high-value, import, or select categories; finance reviews audited financials and credit ratings before approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Finance Controller achieves the story's outcome: assess financial risk before engaging them. The business use case is served: for high-value, import, or select categories; finance reviews audited financials and credit ratings before approval.
- **Oracle.** Observable proof that Enhanced Due Diligence did its job for the Finance Controller — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-013.
- **Trace.** P1 · manual · `FEAT-VM-013` · workbook sheet "3. Vendor Management"

#### PRD-VM-097 — Enhanced Due Diligence: tenant configuration — Provider (CRISIL/Corpository) is tenant config

- **Why it matters.** The workbook says "Provider (CRISIL/Corpository) is tenant config". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Finance Controller (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Provider (CRISIL/Corpository) is tenant config") and record its current value.
  2. As the Finance Controller: use Enhanced Due Diligence to get financial and credit-rating due diligence on high-value vendors.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Enhanced Due Diligence follows the tenant's configured value, as the workbook states: "Provider (CRISIL/Corpository) is tenant config". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-013` · workbook sheet "3. Vendor Management"

#### PRD-VM-098 — Enhanced Due Diligence: not available on the Growth plan

- **Why it matters.** The workbook limits Enhanced Due Diligence to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Finance Controller.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Finance Controller on the lower-plan tenant.
  2. Try it: use Enhanced Due Diligence to get financial and credit-rating due diligence on high-value vendors.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-013` · workbook sheet "3. Vendor Management"

#### PRD-VM-099 — Enhanced Due Diligence: refused for a user without the Finance Controller role

- **Why it matters.** The workbook names Finance Controller as the user of Enhanced Due Diligence. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Finance Controller.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Enhanced Due Diligence to get financial and credit-rating due diligence on high-value vendors.
  3. Repeat as a Finance Controller.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Finance Controller can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Finance Controller.
- **Trace.** P1 · automate-later · `FEAT-VM-013` · workbook sheet "3. Vendor Management"

#### PRD-VM-100 — Related-Party Screening: happy path for the Compliance Officer

- **Why it matters.** Surfaces undisclosed conflicts of interest. Business use: During onboarding, vendor identifiers are screened against HRMS/AD employee data to flag related-party conflicts.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
  Context from the workbook: Depends on HRMS/SuccessFactors API.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup and open Vendor Management.
  2. Use Related-Party Screening to get what the story asks for: vendors screened against employee data for related-party links.
  3. Follow the business scenario the workbook gives: "During onboarding, vendor identifiers are screened against HRMS/AD employee data to flag related-party conflicts".
  4. Check the result against the story's promised outcome.
- **Expected.** The Compliance Officer achieves the story's outcome: surface undisclosed conflicts of interest. The business use case is served: during onboarding, vendor identifiers are screened against HRMS/AD employee data to flag related-party conflicts.
- **Oracle.** Observable proof that Related-Party Screening did its job for the Compliance Officer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-017.
- **Trace.** P1 · manual · `FEAT-VM-017` · workbook sheet "3. Vendor Management"

#### PRD-VM-101 — Related-Party Screening: not available on the Growth plan

- **Why it matters.** The workbook limits Related-Party Screening to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the lower-plan tenant.
  2. Try it: use Related-Party Screening to get vendors screened against employee data for related-party links.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-017` · workbook sheet "3. Vendor Management"

#### PRD-VM-102 — Related-Party Screening: refused for a user without the Compliance Officer role

- **Why it matters.** The workbook names Compliance Officer as the user of Related-Party Screening. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Related-Party Screening to get vendors screened against employee data for related-party links.
  3. Repeat as a Compliance Officer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Compliance Officer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Compliance Officer.
- **Trace.** P1 · automate-later · `FEAT-VM-017` · workbook sheet "3. Vendor Management"

#### PRD-VM-103 — Surrogate Onboarding: happy path for the Buyer

- **Why it matters.** Covers vendors unable to self-serve while preserving traceability. Business use: For import/FI/non-PO vendors who can't self-serve; the buyer completes the form on their behalf with a surrogate tag that carries into RFQ.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Onboard a vendor on their behalf with a persistent surrogate tag.
  3. Follow the business scenario the workbook gives: "For import/FI/non-PO vendors who can't self-serve; the buyer completes the form on their behalf with a surrogate tag that carries into RFQ".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: bring in suppliers who can't self-serve while keeping it traceable. The business use case is served: for import/FI/non-PO vendors who can't self-serve; the buyer completes the form on their behalf with a surrogate tag that carries into RFQ.
- **Oracle.** Observable proof that Surrogate Onboarding did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-019.
- **Trace.** P1 · manual · `FEAT-VM-019` · workbook sheet "3. Vendor Management"

#### PRD-VM-104 — Surrogate Onboarding: surrogate tag visible at all stages

- **Why it matters.** The workbook records this edge case for Surrogate Onboarding: "Surrogate tag visible at all stages".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Surrogate tag visible at all stages".
  3. Use Surrogate Onboarding to onboard a vendor on their behalf with a persistent surrogate tag.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Surrogate Onboarding behaves as the workbook states: "Surrogate tag visible at all stages".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-019 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-019` · workbook sheet "3. Vendor Management"

#### PRD-VM-105 — Surrogate Onboarding: not available on the Growth plan

- **Why it matters.** The workbook limits Surrogate Onboarding to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Surrogate Onboarding to onboard a vendor on their behalf with a persistent surrogate tag.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-019` · workbook sheet "3. Vendor Management"

#### PRD-VM-106 — Surrogate Onboarding: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Surrogate Onboarding. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Surrogate Onboarding to onboard a vendor on their behalf with a persistent surrogate tag.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-019` · workbook sheet "3. Vendor Management"

#### PRD-VM-107 — Site Visit and Assessment: happy path for the Technical Evaluator

- **Why it matters.** Some categories require on-site qualification. Business use: For categories needing physical qualification; an evaluator schedules a site visit and logs immutable findings, photos, and CAPAs, triggering approval.
- **Setup.**
  Persona: Technical Evaluator.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Technical Evaluator on the tenant described in Setup and open Vendor Management.
  2. Attach a site visit or assessment that triggers approval.
  3. Follow the business scenario the workbook gives: "For categories needing physical qualification; an evaluator schedules a site visit and logs immutable findings, photos, and CAPAs, triggering approval".
  4. Check the result against the story's promised outcome.
- **Expected.** The Technical Evaluator achieves the story's outcome: physically qualify a vendor before activation. The business use case is served: for categories needing physical qualification; an evaluator schedules a site visit and logs immutable findings, photos, and CAPAs, triggering approval.
- **Oracle.** Observable proof that Site Visit and Assessment did its job for the Technical Evaluator — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-021.
- **Trace.** P1 · manual · `FEAT-VM-021` · workbook sheet "3. Vendor Management"

#### PRD-VM-108 — Site Visit and Assessment: not available on the Growth plan

- **Why it matters.** The workbook limits Site Visit and Assessment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Technical Evaluator.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Technical Evaluator on the lower-plan tenant.
  2. Try it: use Site Visit and Assessment to attach a site visit or assessment that triggers approval.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-021` · workbook sheet "3. Vendor Management"

#### PRD-VM-109 — Site Visit and Assessment: refused for a user without the Technical Evaluator role

- **Why it matters.** The workbook names Technical Evaluator as the user of Site Visit and Assessment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Technical Evaluator.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Site Visit and Assessment to attach a site visit or assessment that triggers approval.
  3. Repeat as a Technical Evaluator.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Technical Evaluator can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Technical Evaluator.
- **Trace.** P1 · automate-later · `FEAT-VM-021` · workbook sheet "3. Vendor Management"

#### PRD-VM-110 — Periodic Re-Validation Scheduler: happy path for the MDM / Master Data Team

- **Why it matters.** Ongoing compliance instead of point-in-time onboarding checks. Business use: A scheduled job re-validates KYC/PAN/GST/bank/MSME/turnover on configured cadences, auto-blocking on a critical failure.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Vendor Management.
  2. Use Periodic Re-Validation Scheduler to get what the story asks for: vendor compliance re-validated on schedule with auto-block on failure.
  3. Follow the business scenario the workbook gives: "A scheduled job re-validates KYC/PAN/GST/bank/MSME/turnover on configured cadences, auto-blocking on a critical failure".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: keep supplier data current without manual checks. The business use case is served: a scheduled job re-validates KYC/PAN/GST/bank/MSME/turnover on configured cadences, auto-blocking on a critical failure.
- **Oracle.** Observable proof that Periodic Re-Validation Scheduler did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-029.
- **Trace.** P1 · manual · `FEAT-VM-029` · workbook sheet "3. Vendor Management"

#### PRD-VM-111 — Periodic Re-Validation Scheduler: tenant configuration — Cadences tenant-config

- **Why it matters.** The workbook says "Cadences tenant-config". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and MDM / Master Data Team (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Cadences tenant-config") and record its current value.
  2. As the MDM / Master Data Team: use Periodic Re-Validation Scheduler to get vendor compliance re-validated on schedule with auto-block on failure.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs Periodic Re-Validation Scheduler follows the tenant's configured value, as the workbook states: "Cadences tenant-config". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-VM-029` · workbook sheet "3. Vendor Management"

#### PRD-VM-112 — Periodic Re-Validation Scheduler: not available on the Growth plan

- **Why it matters.** The workbook limits Periodic Re-Validation Scheduler to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the lower-plan tenant.
  2. Try it: use Periodic Re-Validation Scheduler to get vendor compliance re-validated on schedule with auto-block on failure.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-029` · workbook sheet "3. Vendor Management"

#### PRD-VM-113 — Periodic Re-Validation Scheduler: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of Periodic Re-Validation Scheduler. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Periodic Re-Validation Scheduler to get vendor compliance re-validated on schedule with auto-block on failure.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-VM-029` · workbook sheet "3. Vendor Management"

#### PRD-VM-114 — Certificate Expiry Tracking: happy path for the MDM / Master Data Team

- **Why it matters.** Prevents transacting with lapsed-compliance vendors. Business use: As certificates near expiry; 60/45/30/15-day reminders are sent to the vendor and a lapse auto-blocks them.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Vendor Management.
  2. Use Certificate Expiry Tracking to get what the story asks for: certificate expiry tracked with staged reminders and auto-block.
  3. Follow the business scenario the workbook gives: "As certificates near expiry; 60/45/30/15-day reminders are sent to the vendor and a lapse auto-blocks them".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: stop transacting with lapsed-compliance vendors. The business use case is served: as certificates near expiry; 60/45/30/15-day reminders are sent to the vendor and a lapse auto-blocks them.
- **Oracle.** Observable proof that Certificate Expiry Tracking did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-030.
- **Trace.** P1 · manual · `FEAT-VM-030` · workbook sheet "3. Vendor Management"

#### PRD-VM-115 — Certificate Expiry Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Certificate Expiry Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the lower-plan tenant.
  2. Try it: use Certificate Expiry Tracking to get certificate expiry tracked with staged reminders and auto-block.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-030` · workbook sheet "3. Vendor Management"

#### PRD-VM-116 — Certificate Expiry Tracking: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of Certificate Expiry Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Certificate Expiry Tracking to get certificate expiry tracked with staged reminders and auto-block.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-VM-030` · workbook sheet "3. Vendor Management"

#### PRD-VM-117 — Vendor Discovery and EOI: happy path for the Category Manager

- **Why it matters.** Expands the supplier base beyond existing AVLs. Business use: When sourcing a requirement with no suitable AVL vendors; category managers search by region/commodity and collect expressions of interest.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the tenant described in Setup and open Vendor Management.
  2. Discover new vendors by region and commodity and collect expressions of interest.
  3. Follow the business scenario the workbook gives: "When sourcing a requirement with no suitable AVL vendors; category managers search by region/commodity and collect expressions of interest".
  4. Check the result against the story's promised outcome.
- **Expected.** The Category Manager achieves the story's outcome: expand the supplier base beyond existing AVLs. The business use case is served: when sourcing a requirement with no suitable AVL vendors; category managers search by region/commodity and collect expressions of interest.
- **Oracle.** Observable proof that Vendor Discovery and EOI did its job for the Category Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-031.
- **Trace.** P1 · manual · `FEAT-VM-031` · workbook sheet "3. Vendor Management"

#### PRD-VM-118 — Vendor Discovery and EOI: not available on plans below Growth

- **Why it matters.** The workbook limits Vendor Discovery and EOI to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Category Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Category Manager on the lower-plan tenant.
  2. Try it: use Vendor Discovery and EOI to discover new vendors by region and commodity and collect expressions of interest.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-VM-031` · workbook sheet "3. Vendor Management"

#### PRD-VM-119 — Vendor Discovery and EOI: refused for a user without the Category Manager role

- **Why it matters.** The workbook names Category Manager as the user of Vendor Discovery and EOI. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Category Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Discovery and EOI to discover new vendors by region and commodity and collect expressions of interest.
  3. Repeat as a Category Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Category Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Category Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-031` · workbook sheet "3. Vendor Management"

#### PRD-VM-120 — Vendor Grievance and SPOC Management: happy path for the Vendor

- **Why it matters.** Structured vendor support and contact governance. Business use: Ongoing vendor support; vendors raise grievances with attachments and maintain their SPOCs, with changes notifying the buyer.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Log grievances and manage their SPOCs.
  3. Follow the business scenario the workbook gives: "Ongoing vendor support; vendors raise grievances with attachments and maintain their SPOCs, with changes notifying the buyer".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: raise issues and keep their contacts current. The business use case is served: ongoing vendor support; vendors raise grievances with attachments and maintain their SPOCs, with changes notifying the buyer.
- **Oracle.** Observable proof that Vendor Grievance and SPOC Management did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-033.
- **Trace.** P1 · manual · `FEAT-VM-033` · workbook sheet "3. Vendor Management"

#### PRD-VM-121 — Vendor Grievance and SPOC Management: not available on plans below Growth

- **Why it matters.** The workbook limits Vendor Grievance and SPOC Management to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Vendor Grievance and SPOC Management to log grievances and manage their SPOCs.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-VM-033` · workbook sheet "3. Vendor Management"

#### PRD-VM-122 — Vendor Grievance and SPOC Management: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor Grievance and SPOC Management. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Grievance and SPOC Management to log grievances and manage their SPOCs.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-033` · workbook sheet "3. Vendor Management"

#### PRD-VM-123 — Broker / Sub-Vendor Flow: happy path for the Broker / Channel Partner

- **Why it matters.** Supports broker-mediated supply models. Business use: A broker/channel-partner model where one party manages multiple sub-vendors; the PO is issued to the supplying vendor, not the broker.
- **Setup.**
  Persona: Broker / Channel Partner.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Broker / Channel Partner on the tenant described in Setup and open Vendor Management.
  2. Onboard and manage their sub-vendors with the PO issued to the supplier.
  3. Follow the business scenario the workbook gives: "A broker/channel-partner model where one party manages multiple sub-vendors; the PO is issued to the supplying vendor, not the broker".
  4. Check the result against the story's promised outcome.
- **Expected.** The Broker / Channel Partner achieves the story's outcome: bring their network onto the platform. The business use case is served: a broker/channel-partner model where one party manages multiple sub-vendors; the PO is issued to the supplying vendor, not the broker.
- **Oracle.** Observable proof that Broker / Sub-Vendor Flow did its job for the Broker / Channel Partner — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-035.
- **Trace.** P1 · manual · `FEAT-VM-035` · workbook sheet "3. Vendor Management"

#### PRD-VM-124 — Broker / Sub-Vendor Flow: PO to supplier, not broker

- **Why it matters.** The workbook records this edge case for Broker / Sub-Vendor Flow: "PO to supplier, not broker".
- **Setup.**
  Persona: Broker / Channel Partner.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Broker / Channel Partner on the tenant described in Setup.
  2. Set up the situation the note describes: "PO to supplier, not broker".
  3. Use Broker / Sub-Vendor Flow to onboard and manage their sub-vendors with the PO issued to the supplier.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Broker / Sub-Vendor Flow behaves as the workbook states: "PO to supplier, not broker".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-035 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-035` · workbook sheet "3. Vendor Management"

#### PRD-VM-125 — Broker / Sub-Vendor Flow: not available on the Growth plan

- **Why it matters.** The workbook limits Broker / Sub-Vendor Flow to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Broker / Channel Partner.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Broker / Channel Partner on the lower-plan tenant.
  2. Try it: use Broker / Sub-Vendor Flow to onboard and manage their sub-vendors with the PO issued to the supplier.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-035` · workbook sheet "3. Vendor Management"

#### PRD-VM-126 — Broker / Sub-Vendor Flow: refused for a user without the Broker / Channel Partner role

- **Why it matters.** The workbook names Broker / Channel Partner as the user of Broker / Sub-Vendor Flow. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Broker / Channel Partner.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Broker / Sub-Vendor Flow to onboard and manage their sub-vendors with the PO issued to the supplier.
  3. Repeat as a Broker / Channel Partner.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Broker / Channel Partner can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Broker / Channel Partner.
- **Trace.** P1 · automate-later · `FEAT-VM-035` · workbook sheet "3. Vendor Management"

#### PRD-VM-127 — Buyer-Side Vendor Profile Editing: happy path for the Buyer

- **Why it matters.** Faster master-data upkeep. Business use: Buyers/MDM correct vendor details directly from the profile (editable fields only) without a full amendment cycle.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Vendor Management.
  2. Edit existing vendor details directly within governance rules.
  3. Follow the business scenario the workbook gives: "Buyers/MDM correct vendor details directly from the profile (editable fields only) without a full amendment cycle".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: correct data without a full amendment cycle. The business use case is served: buyers/MDM correct vendor details directly from the profile (editable fields only) without a full amendment cycle.
- **Oracle.** Observable proof that Buyer-Side Vendor Profile Editing did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-036.
- **Trace.** P1 · manual · `FEAT-VM-036` · workbook sheet "3. Vendor Management"

#### PRD-VM-128 — Buyer-Side Vendor Profile Editing: editable-field rules apply

- **Why it matters.** The workbook records this edge case for Buyer-Side Vendor Profile Editing: "Editable-field rules apply".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Editable-field rules apply".
  3. Use Buyer-Side Vendor Profile Editing to edit existing vendor details directly within governance rules.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Buyer-Side Vendor Profile Editing behaves as the workbook states: "Editable-field rules apply".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-VM-036 quoting the note.
- **Trace.** P2 · manual · `FEAT-VM-036` · workbook sheet "3. Vendor Management"

#### PRD-VM-129 — Buyer-Side Vendor Profile Editing: not available on plans below Growth

- **Why it matters.** The workbook limits Buyer-Side Vendor Profile Editing to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Buyer-Side Vendor Profile Editing to edit existing vendor details directly within governance rules.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-VM-036` · workbook sheet "3. Vendor Management"

#### PRD-VM-130 — Buyer-Side Vendor Profile Editing: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Buyer-Side Vendor Profile Editing. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Buyer-Side Vendor Profile Editing to edit existing vendor details directly within governance rules.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-VM-036` · workbook sheet "3. Vendor Management"

#### PRD-VM-131 — PQ vs Non-PQ Onboarding Paths: happy path for the Procurement Manager

- **Why it matters.** Right-sized onboarding effort. Business use: Orgs choose PQ (scored) vs non-PQ (direct) onboarding by vendor type/risk; low-risk vendors skip prequalification.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Vendor Management.
  2. Use PQ vs Non-PQ Onboarding Paths to get what the story asks for: both pre-qualified and direct onboarding paths.
  3. Follow the business scenario the workbook gives: "Orgs choose PQ (scored) vs non-PQ (direct) onboarding by vendor type/risk; low-risk vendors skip prequalification".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: match qualification rigor to the vendor type. The business use case is served: orgs choose PQ (scored) vs non-PQ (direct) onboarding by vendor type/risk; low-risk vendors skip prequalification.
- **Oracle.** Observable proof that PQ vs Non-PQ Onboarding Paths did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-038.
- **Trace.** P1 · manual · `FEAT-VM-038` · workbook sheet "3. Vendor Management"

#### PRD-VM-132 — PQ vs Non-PQ Onboarding Paths: not available on the Growth plan

- **Why it matters.** The workbook limits PQ vs Non-PQ Onboarding Paths to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use PQ vs Non-PQ Onboarding Paths to get both pre-qualified and direct onboarding paths.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-038` · workbook sheet "3. Vendor Management"

#### PRD-VM-133 — PQ vs Non-PQ Onboarding Paths: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of PQ vs Non-PQ Onboarding Paths. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use PQ vs Non-PQ Onboarding Paths to get both pre-qualified and direct onboarding paths.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-038` · workbook sheet "3. Vendor Management"

#### PRD-VM-134 — Public Self-Registration Link: happy path for the Vendor

- **Why it matters.** Scales vendor acquisition. Business use: Vendors onboard themselves via a shared public link (e.g., from a tender notice) without an internal invite.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Self-register via a public link.
  3. Follow the business scenario the workbook gives: "Vendors onboard themselves via a shared public link (e.g., from a tender notice) without an internal invite".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: onboard without waiting for an internal invite. The business use case is served: vendors onboard themselves via a shared public link (e.g., from a tender notice) without an internal invite.
- **Oracle.** Observable proof that Public Self-Registration Link did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-039.
- **Trace.** P1 · manual · `FEAT-VM-039` · workbook sheet "3. Vendor Management"

#### PRD-VM-135 — Public Self-Registration Link: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Public Self-Registration Link. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Public Self-Registration Link to self-register via a public link.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-039` · workbook sheet "3. Vendor Management"

#### PRD-VM-136 — Foreign Bank Routing & IFSC Autofill: happy path for the Vendor

- **Why it matters.** Payable accuracy. Business use: At bank-detail capture; foreign vendors enter a routing number while domestic IFSC auto-fills the branch.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Use Foreign Bank Routing & IFSC Autofill to get what the story asks for: routing-number capture and IFSC branch autofill.
  3. Follow the business scenario the workbook gives: "At bank-detail capture; foreign vendors enter a routing number while domestic IFSC auto-fills the branch".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: their bank details are accurate. The business use case is served: at bank-detail capture; foreign vendors enter a routing number while domestic IFSC auto-fills the branch.
- **Oracle.** Observable proof that Foreign Bank Routing & IFSC Autofill did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-040.
- **Trace.** P1 · manual · `FEAT-VM-040` · workbook sheet "3. Vendor Management"

#### PRD-VM-137 — Foreign Bank Routing & IFSC Autofill: not available on the Growth plan

- **Why it matters.** The workbook limits Foreign Bank Routing & IFSC Autofill to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Foreign Bank Routing & IFSC Autofill to get routing-number capture and IFSC branch autofill.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-040` · workbook sheet "3. Vendor Management"

#### PRD-VM-138 — Foreign Bank Routing & IFSC Autofill: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Foreign Bank Routing & IFSC Autofill. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Foreign Bank Routing & IFSC Autofill to get routing-number capture and IFSC branch autofill.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-040` · workbook sheet "3. Vendor Management"

#### PRD-VM-139 — Phone-Primary Registration: happy path for the Vendor

- **Why it matters.** Accessibility for mobile-first suppliers. Business use: For mobile-first suppliers; registration uses phone as the primary identifier instead of email.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open Vendor Management.
  2. Register with their phone as the primary authentication.
  3. Follow the business scenario the workbook gives: "For mobile-first suppliers; registration uses phone as the primary identifier instead of email".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: onboard in a mobile-first way. The business use case is served: for mobile-first suppliers; registration uses phone as the primary identifier instead of email.
- **Oracle.** Observable proof that Phone-Primary Registration did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-041.
- **Trace.** P1 · manual · `FEAT-VM-041` · workbook sheet "3. Vendor Management"

#### PRD-VM-140 — Phone-Primary Registration: not available on the Growth plan

- **Why it matters.** The workbook limits Phone-Primary Registration to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Phone-Primary Registration to register with their phone as the primary authentication.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-041` · workbook sheet "3. Vendor Management"

#### PRD-VM-141 — Phone-Primary Registration: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Phone-Primary Registration. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Phone-Primary Registration to register with their phone as the primary authentication.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-VM-041` · workbook sheet "3. Vendor Management"

#### PRD-VM-142 — Vendor Clone: happy path for the Procurement Manager

- **Why it matters.** Reduces re-entry. Business use: Procurement quickly creates a near-identical vendor by cloning an existing active record.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open Vendor Management.
  2. Clone an active vendor.
  3. Follow the business scenario the workbook gives: "Procurement quickly creates a near-identical vendor by cloning an existing active record".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: create a similar record quickly. The business use case is served: procurement quickly creates a near-identical vendor by cloning an existing active record.
- **Oracle.** Observable proof that Vendor Clone did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-042.
- **Trace.** P1 · manual · `FEAT-VM-042` · workbook sheet "3. Vendor Management"

#### PRD-VM-143 — Vendor Clone: not available on plans below Growth

- **Why it matters.** The workbook limits Vendor Clone to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Vendor Clone to clone an active vendor.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-VM-042` · workbook sheet "3. Vendor Management"

#### PRD-VM-144 — Vendor Clone: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Vendor Clone. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Clone to clone an active vendor.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P1 · automate-later · `FEAT-VM-042` · workbook sheet "3. Vendor Management"

#### PRD-VM-145 — Vendor IP Capture: happy path for the Compliance Officer

- **Why it matters.** Fraud detection and auditability. Business use: Compliance captures participating vendors' IP addresses for fraud detection and audit.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup and open Vendor Management.
  2. Use Vendor IP Capture to get what the story asks for: participating vendors' IP addresses captured.
  3. Follow the business scenario the workbook gives: "Compliance captures participating vendors' IP addresses for fraud detection and audit".
  4. Check the result against the story's promised outcome.
- **Expected.** The Compliance Officer achieves the story's outcome: detect fraud and support audit. The business use case is served: compliance captures participating vendors' IP addresses for fraud detection and audit.
- **Oracle.** Observable proof that Vendor IP Capture did its job for the Compliance Officer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-043.
- **Trace.** P1 · manual · `FEAT-VM-043` · workbook sheet "3. Vendor Management"

#### PRD-VM-146 — Vendor IP Capture: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor IP Capture to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the lower-plan tenant.
  2. Try it: use Vendor IP Capture to get participating vendors' IP addresses captured.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-043` · workbook sheet "3. Vendor Management"

#### PRD-VM-147 — Vendor IP Capture: refused for a user without the Compliance Officer role

- **Why it matters.** The workbook names Compliance Officer as the user of Vendor IP Capture. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor IP Capture to get participating vendors' IP addresses captured.
  3. Repeat as a Compliance Officer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Compliance Officer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Compliance Officer.
- **Trace.** P1 · automate-later · `FEAT-VM-043` · workbook sheet "3. Vendor Management"

#### PRD-VM-148 — Litigation Tracking: happy path for the Compliance Officer

- **Why it matters.** Risk visibility beyond blacklist. Business use: Compliance logs and monitors supplier litigation in a dedicated tab, separate from blacklisting.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup and open Vendor Management.
  2. Use Litigation Tracking to get what the story asks for: supplier litigation status tracked in a dedicated tab.
  3. Follow the business scenario the workbook gives: "Compliance logs and monitors supplier litigation in a dedicated tab, separate from blacklisting".
  4. Check the result against the story's promised outcome.
- **Expected.** The Compliance Officer achieves the story's outcome: monitor legal exposure beyond blacklisting. The business use case is served: compliance logs and monitors supplier litigation in a dedicated tab, separate from blacklisting.
- **Oracle.** Observable proof that Litigation Tracking did its job for the Compliance Officer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-044.
- **Trace.** P1 · manual · `FEAT-VM-044` · workbook sheet "3. Vendor Management"

#### PRD-VM-149 — Litigation Tracking: not available on the Growth plan

- **Why it matters.** The workbook limits Litigation Tracking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Compliance Officer on the lower-plan tenant.
  2. Try it: use Litigation Tracking to get supplier litigation status tracked in a dedicated tab.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-044` · workbook sheet "3. Vendor Management"

#### PRD-VM-150 — Litigation Tracking: refused for a user without the Compliance Officer role

- **Why it matters.** The workbook names Compliance Officer as the user of Litigation Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Litigation Tracking to get supplier litigation status tracked in a dedicated tab.
  3. Repeat as a Compliance Officer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Compliance Officer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Compliance Officer.
- **Trace.** P1 · automate-later · `FEAT-VM-044` · workbook sheet "3. Vendor Management"

#### PRD-VM-151 — TAN Verification: happy path for the MDM / Master Data Team

- **Why it matters.** Completes statutory verification. Business use: During verification; TAN is validated via API alongside PAN/GST for applicable vendors.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the tenant described in Setup and open Vendor Management.
  2. Use TAN Verification to get what the story asks for: vendor TAN verified via API.
  3. Follow the business scenario the workbook gives: "During verification; TAN is validated via API alongside PAN/GST for applicable vendors".
  4. Check the result against the story's promised outcome.
- **Expected.** The MDM / Master Data Team achieves the story's outcome: statutory verification is complete. The business use case is served: during verification; TAN is validated via API alongside PAN/GST for applicable vendors.
- **Oracle.** Observable proof that TAN Verification did its job for the MDM / Master Data Team — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-045.
- **Trace.** P1 · manual · `FEAT-VM-045` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-152 — TAN Verification: not available on the Growth plan

- **Why it matters.** The workbook limits TAN Verification to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: MDM / Master Data Team.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as an MDM / Master Data Team on the lower-plan tenant.
  2. Try it: use TAN Verification to get vendor TAN verified via API.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-VM-045` · `MOD-11` · workbook sheet "3. Vendor Management"

#### PRD-VM-153 — TAN Verification: refused for a user without the MDM / Master Data Team role

- **Why it matters.** The workbook names MDM / Master Data Team as the user of TAN Verification. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: MDM / Master Data Team.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use TAN Verification to get vendor TAN verified via API.
  3. Repeat as an MDM / Master Data Team.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the MDM / Master Data Team can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the MDM / Master Data Team.
- **Trace.** P1 · automate-later · `FEAT-VM-045` · `MOD-11` · workbook sheet "3. Vendor Management"

## 3. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-VM-154 — [Roadmap] Sanctions / PEP / UBO Screening: happy path for the Compliance Officer

- **Why it matters.** Regulatory and reputational risk mitigation. Business use: Compliance screens vendors against sanctions/PEP/UBO lists during onboarding for regulated or higher-risk categories.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap — this is an acceptance specification; run it once the feature ships.
  Context from the workbook: Feasibility-pending per SDD.
- **Steps.**
  1. Sign in as a Compliance Officer on the tenant described in Setup and open Vendor Management.
  2. Use Sanctions / PEP / UBO Screening to get what the story asks for: vendors screened against sanctions, PEP, and UBO data.
  3. Follow the business scenario the workbook gives: "Compliance screens vendors against sanctions/PEP/UBO lists during onboarding for regulated or higher-risk categories".
  4. Check the result against the story's promised outcome.
- **Expected.** The Compliance Officer achieves the story's outcome: mitigate regulatory and reputational exposure. The business use case is served: compliance screens vendors against sanctions/PEP/UBO lists during onboarding for regulated or higher-risk categories.
- **Oracle.** Observable proof that Sanctions / PEP / UBO Screening did its job for the Compliance Officer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-VM-014.
- **Trace.** P3 · manual · `FEAT-VM-014` · workbook sheet "3. Vendor Management"

#### PRD-VM-155 — [Roadmap] Sanctions / PEP / UBO Screening: not available on the Growth plan

- **Why it matters.** The workbook limits Sanctions / PEP / UBO Screening to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Compliance Officer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Compliance Officer on the lower-plan tenant.
  2. Try it: use Sanctions / PEP / UBO Screening to get vendors screened against sanctions, PEP, and UBO data.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-VM-014` · workbook sheet "3. Vendor Management"

#### PRD-VM-156 — [Roadmap] Sanctions / PEP / UBO Screening: refused for a user without the Compliance Officer role

- **Why it matters.** The workbook names Compliance Officer as the user of Sanctions / PEP / UBO Screening. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Compliance Officer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Sanctions / PEP / UBO Screening to get vendors screened against sanctions, PEP, and UBO data.
  3. Repeat as a Compliance Officer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Compliance Officer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Compliance Officer.
- **Trace.** P3 · manual · `FEAT-VM-014` · workbook sheet "3. Vendor Management"

## 4. Workflow WF-VM-001 — Vendor Onboarding

#### PRD-VM-157 — Vendor Onboarding (WF-VM-001): end-to-end order of steps

- **Why it matters.** Every vendor onboarding must pass through the same governed chain; a skipped or reordered step is a control failure.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Workflow WF-VM-001 as configured in the workbook (5 steps).
- **Steps.**
  1. Cause the trigger: vendor submits onboarding form.
  2. Let step 1 "Form Completeness Check" (System Validation, System (Auto)) complete.
  3. Let step 2 "Finance Approval" (Approval, Finance Controller) complete with an approval.
  4. Let step 3 "Legal / Compliance Review" (Approval, Legal / Compliance) complete with an approval.
  5. Let step 4 "Category Manager Endorsement" (Approval, Category Manager) complete with an approval.
  6. Let step 5 "Vendor Activation" (System Action, System (Auto)) complete.
- **Expected.** The steps run in this order: 1. Form Completeness Check (System (Auto)) → 2. Finance Approval (Finance Controller) → 3. Legal / Compliance Review (Legal / Compliance) → 4. Category Manager Endorsement (Category Manager) → 5. Vendor Activation (System (Auto)). At the end: Vendor status changes to Active; SAP MDG sync triggered if integration enabled.
- **Oracle.** The workflow's history shows each step, its actor and its outcome in the order above, and nothing out of sequence.
- **Trace.** P0 · automate-later · `WF-VM-001` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-158 — Vendor Onboarding: step 1 "Form Completeness Check" runs automatically

- **Why it matters.** Step 1 is a System Validation step performed by System (Auto); if it does not run, everything after it rests on an unchecked premise.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Condition stated for this step: All required fields and documents present.
- **Steps.**
  1. Cause the trigger: vendor submits onboarding form, with the condition met (all required fields and documents present).
  2. Let the workflow reach step 1 "Form Completeness Check".
- **Expected.** Step 1 is carried out by System (Auto) without manual action, and the workflow moves on.
- **Oracle.** The workflow history records step 1 as done by System (Auto) and step 2 becomes active.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 1` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-159 — Vendor Onboarding: step 1 "Form Completeness Check" holds when "All required fields and documents present" is not true

- **Why it matters.** The step's stated condition is "All required fields and documents present". A workflow that proceeds without it lets an incomplete item through.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Condition NOT met: All required fields and documents present.
- **Steps.**
  1. Cause the trigger with the condition not met ("All required fields and documents present" does not hold).
  2. Let the workflow reach step 1.
- **Expected.** The workflow does not move past step 1 "Form Completeness Check".
- **Oracle.** Step 2 never becomes active while the condition is unmet.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 1` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-160 — Vendor Onboarding: step 2 "Finance Approval" routes to Finance Controller

- **Why it matters.** Approval 2 belongs to Finance Controller; routing it anywhere else puts the decision in the wrong hands.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Approval mode: Sequential.
  Finance Controller user exists on the tenant.
- **Steps.**
  1. Cause the trigger: vendor submits onboarding form.
  2. Complete the steps before step 2.
  3. Check who has the pending approval.
- **Expected.** The approval for step 2 "Finance Approval" is assigned to the Finance Controller, and only after the previous step has completed (sequential).
- **Oracle.** The pending-approval record for step 2 names Finance Controller as the approver.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-161 — Vendor Onboarding: step 2 "Finance Approval" is not routed before step 1 completes

- **Why it matters.** The approval mode is Sequential; an approver who sees an item before the previous level decides is approving out of order.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Step 1 still pending.
- **Steps.**
  1. Cause the trigger.
  2. Leave step 1 undecided.
  3. Check the Finance Controller's pending approvals.
- **Expected.** Nothing is pending for the Finance Controller at step 2 until step 1 completes.
- **Oracle.** No step-2 approval record exists while step 1 is pending; it appears once that step completes.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-162 — Vendor Onboarding: step 2 escalates to Finance Head after 48h

- **Why it matters.** An approval left with the Finance Controller beyond its 48-hour SLA stalls the vendor onboarding; escalation is the control that unblocks it.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  SLA for step 2: 48 hours; escalation to Finance Head.
- **Steps.**
  1. Route an item to step 2 (Finance Controller).
  2. Leave it undecided for more than 48 hours.
- **Expected.** After 48 hours without action the approval escalates to the Finance Head.
- **Oracle.** The approval history shows the SLA breach and the Finance Head as the new or added approver.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-163 — Vendor Onboarding: step 2 does not escalate before 48h

- **Why it matters.** Escalating early takes the decision away from the Finance Controller before their SLA is up.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  SLA for step 2: 48 hours.
- **Steps.**
  1. Route an item to step 2 (Finance Controller).
  2. Check its state shortly before 48 hours have passed.
- **Expected.** The approval is still with the Finance Controller; nothing has gone to the Finance Head.
- **Oracle.** No escalation entry exists before the 48-hour mark.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-164 — Vendor Onboarding: step 2 "Finance Approval" follows the tenant's configuration (timeout + levels)

- **Why it matters.** The workbook marks step 2 tenant-configurable — timeout + levels. The workflow must follow what the tenant set, not a fixed default.
- **Setup.**
  Persona: Tenant Admin.
  Trigger: Vendor submits onboarding form.
- **Steps.**
  1. As a Tenant Admin, change the configurable part of step 2 (timeout + levels).
  2. Cause the trigger and follow the workflow to step 2.
- **Expected.** Step 2 behaves according to the new configuration.
- **Oracle.** The step's routing/timing observed after the change matches the configured values, and differs from before the change.
- **Trace.** P1 · automate-later · `WF-VM-001` · `WF-VM-001 step 2` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-165 — Vendor Onboarding: step 3 "Legal / Compliance Review" routes to Legal / Compliance

- **Why it matters.** Approval 3 belongs to Legal / Compliance; routing it anywhere else puts the decision in the wrong hands.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Approval mode: Sequential.
  Legal / Compliance user exists on the tenant.
- **Steps.**
  1. Cause the trigger: vendor submits onboarding form.
  2. Complete the steps before step 3.
  3. Check who has the pending approval.
- **Expected.** The approval for step 3 "Legal / Compliance Review" is assigned to the Legal / Compliance, and only after the previous step has completed (sequential).
- **Oracle.** The pending-approval record for step 3 names Legal / Compliance as the approver.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-166 — Vendor Onboarding: step 3 "Legal / Compliance Review" is not routed before step 2 completes

- **Why it matters.** The approval mode is Sequential; an approver who sees an item before the previous level decides is approving out of order.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Step 2 still pending.
- **Steps.**
  1. Cause the trigger.
  2. Leave step 2 undecided.
  3. Check the Legal / Compliance's pending approvals.
- **Expected.** Nothing is pending for the Legal / Compliance at step 3 until step 2 completes.
- **Oracle.** No step-3 approval record exists while step 2 is pending; it appears once that step completes.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-167 — Vendor Onboarding: step 3 escalates to Legal Head after 72h

- **Why it matters.** An approval left with the Legal / Compliance beyond its 72-hour SLA stalls the vendor onboarding; escalation is the control that unblocks it.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  SLA for step 3: 72 hours; escalation to Legal Head.
- **Steps.**
  1. Route an item to step 3 (Legal / Compliance).
  2. Leave it undecided for more than 72 hours.
- **Expected.** After 72 hours without action the approval escalates to the Legal Head.
- **Oracle.** The approval history shows the SLA breach and the Legal Head as the new or added approver.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-168 — Vendor Onboarding: step 3 does not escalate before 72h

- **Why it matters.** Escalating early takes the decision away from the Legal / Compliance before their SLA is up.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  SLA for step 3: 72 hours.
- **Steps.**
  1. Route an item to step 3 (Legal / Compliance).
  2. Check its state shortly before 72 hours have passed.
- **Expected.** The approval is still with the Legal / Compliance; nothing has gone to the Legal Head.
- **Oracle.** No escalation entry exists before the 72-hour mark.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-169 — Vendor Onboarding: step 3 bypassed when "Vendor already approved in Global DB"

- **Why it matters.** The workbook's bypass condition for step 3 is "Vendor already approved in Global DB". Requiring the approval anyway adds friction the tenant chose to remove.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Bypass condition holds: Vendor already approved in Global DB.
- **Steps.**
  1. Cause the trigger so that every part of the bypass condition holds.
  2. Follow the workflow to step 3.
- **Expected.** Step 3 "Legal / Compliance Review" is bypassed — no approval is requested from the Legal / Compliance.
- **Oracle.** The workflow history shows step 3 skipped under its bypass condition and the next step active.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-170 — Vendor Onboarding: step 3 not bypassed when "Vendor already approved in Global DB" does not hold

- **Why it matters.** The bypass needs all of "Vendor already approved in Global DB". If it fails, the approval must stand.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Not true: Vendor already approved in Global DB.
- **Steps.**
  1. Cause the trigger with "Vendor already approved in Global DB" false.
  2. Follow the workflow to step 3.
- **Expected.** Step 3 "Legal / Compliance Review" is required and routed to the Legal / Compliance.
- **Oracle.** A pending step-3 approval exists for the Legal / Compliance.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-171 — Vendor Onboarding: step 3 "Legal / Compliance Review" follows the tenant's configuration

- **Why it matters.** The workbook marks step 3 tenant-configurable; note: Optional step; configurable to skip for pre-approved vendors. The workflow must follow what the tenant set, not a fixed default.
- **Setup.**
  Persona: Tenant Admin.
  Trigger: Vendor submits onboarding form.
  Workbook note: Optional step; configurable to skip for pre-approved vendors.
- **Steps.**
  1. As a Tenant Admin, change the configurable part of step 3 — optional step; configurable to skip for pre-approved vendors.
  2. Cause the trigger and follow the workflow to step 3.
- **Expected.** Step 3 behaves according to the new configuration.
- **Oracle.** The step's routing/timing observed after the change matches the configured values, and differs from before the change.
- **Trace.** P1 · automate-later · `WF-VM-001` · `WF-VM-001 step 3` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-172 — Vendor Onboarding: step 4 "Category Manager Endorsement" routes to Category Manager

- **Why it matters.** Approval 4 belongs to Category Manager; routing it anywhere else puts the decision in the wrong hands.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Approval mode: Parallel with Step 3.
  Category Manager user exists on the tenant.
- **Steps.**
  1. Cause the trigger: vendor submits onboarding form.
  2. Complete the steps before step 4.
  3. Check who has the pending approval.
- **Expected.** The approval for step 4 "Category Manager Endorsement" is assigned to the Category Manager and runs at the same time as step 3.
- **Oracle.** The pending-approval record for step 4 names Category Manager as the approver while step 3 is also pending.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 4` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-173 — Vendor Onboarding: step 4 "Category Manager Endorsement" runs in parallel with step 3

- **Why it matters.** The approval mode is "Parallel with Step 3" (Can run parallel with Legal if configured). Serialising it would add avoidable delay; not running it would skip an approval.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Workbook note: Can run parallel with Legal if configured.
- **Steps.**
  1. Cause the trigger and complete the steps before step 3.
  2. Check which approvals are pending.
- **Expected.** Step 4 (Category Manager) and step 3 are pending at the same time when the tenant has configured it so.
- **Oracle.** Both approval records are open simultaneously.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 4` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-174 — Vendor Onboarding: step 4 escalates to Procurement Head after 24h

- **Why it matters.** An approval left with the Category Manager beyond its 24-hour SLA stalls the vendor onboarding; escalation is the control that unblocks it.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  SLA for step 4: 24 hours; escalation to Procurement Head.
- **Steps.**
  1. Route an item to step 4 (Category Manager).
  2. Leave it undecided for more than 24 hours.
- **Expected.** After 24 hours without action the approval escalates to the Procurement Head.
- **Oracle.** The approval history shows the SLA breach and the Procurement Head as the new or added approver.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 4` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-175 — Vendor Onboarding: step 4 does not escalate before 24h

- **Why it matters.** Escalating early takes the decision away from the Category Manager before their SLA is up.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  SLA for step 4: 24 hours.
- **Steps.**
  1. Route an item to step 4 (Category Manager).
  2. Check its state shortly before 24 hours have passed.
- **Expected.** The approval is still with the Category Manager; nothing has gone to the Procurement Head.
- **Oracle.** No escalation entry exists before the 24-hour mark.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 4` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-176 — Vendor Onboarding: step 4 "Category Manager Endorsement" follows the tenant's configuration

- **Why it matters.** The workbook marks step 4 tenant-configurable; note: Can run parallel with Legal if configured. The workflow must follow what the tenant set, not a fixed default.
- **Setup.**
  Persona: Tenant Admin.
  Trigger: Vendor submits onboarding form.
  Workbook note: Can run parallel with Legal if configured.
- **Steps.**
  1. As a Tenant Admin, change the configurable part of step 4 — can run parallel with Legal if configured.
  2. Cause the trigger and follow the workflow to step 4.
- **Expected.** Step 4 behaves according to the new configuration.
- **Oracle.** The step's routing/timing observed after the change matches the configured values, and differs from before the change.
- **Trace.** P1 · automate-later · `WF-VM-001` · `WF-VM-001 step 4` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-177 — Vendor Onboarding: step 5 "Vendor Activation" runs automatically

- **Why it matters.** Step 5 is a System Action step performed by System (Auto); if it does not run, everything after it rests on an unchecked premise.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  Condition stated for this step: All prior steps Approved.
- **Steps.**
  1. Cause the trigger: vendor submits onboarding form, with the condition met (all prior steps Approved).
  2. Let the workflow reach step 5 "Vendor Activation".
- **Expected.** Step 5 is carried out by System (Auto) without manual action (workbook: "Vendor status changes to Active; SAP MDG sync triggered if integration enabled"), and the workflow completes.
- **Oracle.** The workflow history records step 5 as done by System (Auto) and the workflow as complete.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 5` · workbook sheet "26. Workflow & Approvals"

#### PRD-VM-178 — Vendor Onboarding: step 5 "Vendor Activation" does not happen until all prior steps Approved

- **Why it matters.** Step 5 is gated on "All prior steps Approved"; running it early would act on an unapproved item.
- **Setup.**
  Trigger: Vendor submits onboarding form.
  One earlier approval step still pending.
- **Steps.**
  1. Cause the trigger.
  2. Leave one earlier approval step pending.
  3. Check whether step 5 has run.
- **Expected.** Step 5 "Vendor Activation" has not run — so none of this has happened yet: Vendor status changes to Active; SAP MDG sync triggered if integration enabled.
- **Oracle.** No record of step 5 exists while any earlier step is pending.
- **Trace.** P0 · automate-later · `WF-VM-001` · `WF-VM-001 step 5` · workbook sheet "26. Workflow & Approvals"

## 5. Integrations

#### PRD-VM-179 — SAP MDG (Master Data Governance): vendor created/updated in Procol

- **Why it matters.** Primary MDG integration for large enterprise clients. Required for the module: Yes (SAP tenants).
- **Setup.**
  Integration INT-001 "SAP MDG (Master Data Governance)" (Bidirectional) configured on the tenant; key parameters: sap.mdg.endpoint, sap.mdg.client_id, sap.mdg.sync_mode (Push/Pull/Bi), sap.mdg.batch_size.
  Auth: OAuth 2.0.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  gate: `vendor.documents.required` — CONF-VM-002 "Mandatory Document Types".
  Config dependencies (workbook): CONF-INT-001, CONF-VM-002.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: vendor created/updated in Procol.
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: Vendor master: name, PAN, GSTIN, bank details, vendor code, status, category.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-001` · `integration.sap.pr.sync_mode` · `vendor.documents.required` · `CONF-INT-001` · `CONF-VM-002` · workbook sheet "28. Integration Catalog"

#### PRD-VM-180 — SAP MDG (Master Data Governance): vendor changed in SAP MDG

- **Why it matters.** Primary MDG integration for large enterprise clients. Required for the module: Yes (SAP tenants).
- **Setup.**
  Integration INT-001 "SAP MDG (Master Data Governance)" (Bidirectional) configured on the tenant; key parameters: sap.mdg.endpoint, sap.mdg.client_id, sap.mdg.sync_mode (Push/Pull/Bi), sap.mdg.batch_size.
  Auth: OAuth 2.0.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  gate: `vendor.documents.required` — CONF-VM-002 "Mandatory Document Types".
  Config dependencies (workbook): CONF-INT-001, CONF-VM-002.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: vendor changed in SAP MDG.
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: Vendor master: name, PAN, GSTIN, bank details, vendor code, status, category.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-001` · `integration.sap.pr.sync_mode` · `vendor.documents.required` · `CONF-INT-001` · `CONF-VM-002` · workbook sheet "28. Integration Catalog"

#### PRD-VM-181 — SAP MDG (Master Data Governance): on failure — retry 3x with exponential backoff

- **Why it matters.** The Integration Catalog states how SAP MDG (Master Data Governance) must fail: "Retry 3x with exponential backoff; after 3 failures, alert sent to admin and record queued for manual review". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-001 "SAP MDG (Master Data Governance)" (Bidirectional) configured on the tenant; key parameters: sap.mdg.endpoint, sap.mdg.client_id, sap.mdg.sync_mode (Push/Pull/Bi), sap.mdg.batch_size.
  Auth: OAuth 2.0.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  gate: `vendor.documents.required` — CONF-VM-002 "Mandatory Document Types".
  Config dependencies (workbook): CONF-INT-001, CONF-VM-002.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: vendor created/updated in Procol.
- **Expected.** The stated failure handling happens: retry 3x with exponential backoff.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-001` · `integration.sap.pr.sync_mode` · `vendor.documents.required` · `CONF-INT-001` · `CONF-VM-002` · workbook sheet "28. Integration Catalog"

#### PRD-VM-182 — SAP MDG (Master Data Governance): on failure — after 3 failures, alert sent to admin and record queued for manual review

- **Why it matters.** The Integration Catalog states how SAP MDG (Master Data Governance) must fail: "Retry 3x with exponential backoff; after 3 failures, alert sent to admin and record queued for manual review". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-001 "SAP MDG (Master Data Governance)" (Bidirectional) configured on the tenant; key parameters: sap.mdg.endpoint, sap.mdg.client_id, sap.mdg.sync_mode (Push/Pull/Bi), sap.mdg.batch_size.
  Auth: OAuth 2.0.
  gate: `integration.sap.pr.sync_mode` — CONF-INT-001 "SAP PR Sync Mode".
  gate: `vendor.documents.required` — CONF-VM-002 "Mandatory Document Types".
  Config dependencies (workbook): CONF-INT-001, CONF-VM-002.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: vendor created/updated in Procol.
- **Expected.** The stated failure handling happens: after 3 failures, alert sent to admin and record queued for manual review.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-001` · `integration.sap.pr.sync_mode` · `vendor.documents.required` · `CONF-INT-001` · `CONF-VM-002` · workbook sheet "28. Integration Catalog"

## 6. Configuration dependencies

#### PRD-VM-183 — Mandatory Document Types with Vendor Form Sections correctly configured (DEP-001)

- **Why it matters.** Mandatory Document Types depends on Vendor Form Sections. Always ensure 'Documents' is included in vendor form sections when CONF-VM-002 has any values set.
- **Setup.**
  Source: CONF-VM-002 "Mandatory Document Types" (`vendor.documents.required`).
  Depends on: CONF-VM-001 "Vendor Form Sections" (`vendor.form.sections`) (Required).
  gate: `vendor.documents.required`.
  gate: `vendor.form.sections`.
  Workbook guidance: Always ensure 'Documents' is included in vendor form sections when CONF-VM-002 has any values set.
  Vendor Form Sections configured correctly.
- **Steps.**
  1. Configure Vendor Form Sections (CONF-VM-001) correctly.
  2. Configure Mandatory Document Types (CONF-VM-002).
  3. Exercise the behaviour Mandatory Document Types controls.
- **Expected.** Mandatory Document Types works as configured; none of the stated failure impact occurs.
- **Oracle.** The impact named in the missing-dependency case (DEP-001) is absent.
- **Trace.** P1 · automate-later · `DEP-001` · `CONF-VM-002` · `CONF-VM-001` · `vendor.documents.required` · `vendor.form.sections` · workbook sheet "29. Config Dependencies"

#### PRD-VM-184 — Mandatory Document Types with Vendor Form Sections missing or misconfigured (DEP-001)

- **Why it matters.** The workbook states the impact: "If 'Documents' section is removed from form sections (CONF-VM-001), mandatory document config is ignored — vendors can be submitted without documents".
- **Setup.**
  Source: CONF-VM-002 "Mandatory Document Types" (`vendor.documents.required`).
  Depends on: CONF-VM-001 "Vendor Form Sections" (`vendor.form.sections`) (Required).
  gate: `vendor.documents.required`.
  gate: `vendor.form.sections`.
  Workbook guidance: Always ensure 'Documents' is included in vendor form sections when CONF-VM-002 has any values set.
  Vendor Form Sections missing or misconfigured.
- **Steps.**
  1. Leave Vendor Form Sections (CONF-VM-001) missing or misconfigured.
  2. Configure Mandatory Document Types (CONF-VM-002).
  3. Exercise the behaviour Mandatory Document Types controls.
- **Expected.** The stated impact appears: if 'Documents' section is removed from form sections (CONF-VM-001), mandatory document config is ignored — vendors can be submitted without documents.
- **Oracle.** The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.
- **Trace.** P1 · automate-later · `DEP-001` · `CONF-VM-002` · `CONF-VM-001` · `vendor.documents.required` · `vendor.form.sections` · workbook sheet "29. Config Dependencies"
