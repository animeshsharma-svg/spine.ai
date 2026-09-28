# Product test cases — 12. ASN (MOD-18)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-18 · 14 features · 55 cases · group `PRD-ASN` · plan availability: All Plans · status: GA

Advance Shipment Notices from vendors ahead of physical goods receipt.

## 1. Core features

#### PRD-ASN-001 — ASN Creation by Vendor (Portal/EDI): happy path for the Vendor

- **Why it matters.** Gives the buyer/warehouse advance visibility instead of receiving goods unannounced. Business use: Vendor submits shipment details (items, qty, dispatch date, carrier) via portal or EDI ahead of physical delivery.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Raise an Advance Shipment Notice before dispatch.
  3. Follow the business scenario the workbook gives: "Vendor submits shipment details (items, qty, dispatch date, carrier) via portal or EDI ahead of physical delivery".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: the buyer knows what's coming and when. The business use case is served: vendor submits shipment details (items, qty, dispatch date, carrier) via portal or EDI ahead of physical delivery.
- **Oracle.** Observable proof that ASN Creation by Vendor (Portal/EDI) did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-001.
- **Trace.** P0 · manual · `FEAT-ASN-001` · workbook sheet "12. ASN"

#### PRD-ASN-002 — ASN Creation by Vendor (Portal/EDI): EDI-integrated vendors vs. portal-only vendors need two intake paths

- **Why it matters.** The workbook records this edge case for ASN Creation by Vendor (Portal/EDI): "EDI-integrated vendors vs. portal-only vendors need two intake paths".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "EDI-integrated vendors vs. portal-only vendors need two intake paths".
  3. Use ASN Creation by Vendor (Portal/EDI) to raise an Advance Shipment Notice before dispatch.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ASN Creation by Vendor (Portal/EDI) behaves as the workbook states: "EDI-integrated vendors vs. portal-only vendors need two intake paths".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-001 quoting the note.
- **Trace.** P2 · manual · `FEAT-ASN-001` · workbook sheet "12. ASN"

#### PRD-ASN-003 — ASN Creation by Vendor (Portal/EDI): not available on the Growth plan

- **Why it matters.** The workbook limits ASN Creation by Vendor (Portal/EDI) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use ASN Creation by Vendor (Portal/EDI) to raise an Advance Shipment Notice before dispatch.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ASN-001` · workbook sheet "12. ASN"

#### PRD-ASN-004 — ASN Creation by Vendor (Portal/EDI): refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of ASN Creation by Vendor (Portal/EDI). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN Creation by Vendor (Portal/EDI) to raise an Advance Shipment Notice before dispatch.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-ASN-001` · workbook sheet "12. ASN"

#### PRD-ASN-005 — ASN–PO Auto-Linking: happy path for the Warehouse Executive

- **Why it matters.** Removes manual cross-referencing between ASN and PO at the dock. Business use: ASN line items are matched to open PO lines automatically at submission.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Use ASN–PO Auto-Linking to get what the story asks for: an ASN auto-linked to its source PO.
  3. Follow the business scenario the workbook gives: "ASN line items are matched to open PO lines automatically at submission".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: they know exactly what shipment to expect against which order. The business use case is served: ASN line items are matched to open PO lines automatically at submission.
- **Oracle.** Observable proof that ASN–PO Auto-Linking did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-002.
- **Trace.** P0 · manual · `FEAT-ASN-002` · workbook sheet "12. ASN"

#### PRD-ASN-006 — ASN–PO Auto-Linking: one ASN can span multiple POs from the same vendor/shipment

- **Why it matters.** The workbook records this edge case for ASN–PO Auto-Linking: "One ASN can span multiple POs from the same vendor/shipment".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "One ASN can span multiple POs from the same vendor/shipment".
  3. Use ASN–PO Auto-Linking to get an ASN auto-linked to its source PO.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ASN–PO Auto-Linking behaves as the workbook states: "One ASN can span multiple POs from the same vendor/shipment".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-002 quoting the note.
- **Trace.** P2 · manual · `FEAT-ASN-002` · workbook sheet "12. ASN"

#### PRD-ASN-007 — ASN–PO Auto-Linking: not available on the Growth plan

- **Why it matters.** The workbook limits ASN–PO Auto-Linking to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use ASN–PO Auto-Linking to get an ASN auto-linked to its source PO.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ASN-002` · workbook sheet "12. ASN"

#### PRD-ASN-008 — ASN–PO Auto-Linking: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of ASN–PO Auto-Linking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN–PO Auto-Linking to get an ASN auto-linked to its source PO.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-ASN-002` · workbook sheet "12. ASN"

#### PRD-ASN-009 — ASN Line-Item Validation vs. PO: happy path for the Warehouse Executive

- **Why it matters.** Catches shipment errors before they reach the dock. Business use: System validates ASN qty against PO balance and flags excess or unauthorized items.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Use ASN Line-Item Validation vs. PO to get what the story asks for: ASN quantities checked against remaining open PO quantity.
  3. Follow the business scenario the workbook gives: "System validates ASN qty against PO balance and flags excess or unauthorized items".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: over-shipment is flagged before goods arrive. The business use case is served: system validates ASN qty against PO balance and flags excess or unauthorized items.
- **Oracle.** Observable proof that ASN Line-Item Validation vs. PO did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-003.
- **Trace.** P0 · manual · `FEAT-ASN-003` · workbook sheet "12. ASN"

#### PRD-ASN-010 — ASN Line-Item Validation vs. PO: tenant configuration — Tolerance thresholds for over-shipment should be configurable

- **Why it matters.** The workbook says "Tolerance thresholds for over-shipment should be configurable". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Warehouse Executive (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Tolerance thresholds for over-shipment should be configurable") and record its current value.
  2. As the Warehouse Executive: use ASN Line-Item Validation vs. PO to get ASN quantities checked against remaining open PO quantity.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs ASN Line-Item Validation vs. PO follows the tenant's configured value, as the workbook states: "Tolerance thresholds for over-shipment should be configurable". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P1 · manual · `FEAT-ASN-003` · workbook sheet "12. ASN"

#### PRD-ASN-011 — ASN Line-Item Validation vs. PO: not available on the Growth plan

- **Why it matters.** The workbook limits ASN Line-Item Validation vs. PO to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use ASN Line-Item Validation vs. PO to get ASN quantities checked against remaining open PO quantity.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ASN-003` · workbook sheet "12. ASN"

#### PRD-ASN-012 — ASN Line-Item Validation vs. PO: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of ASN Line-Item Validation vs. PO. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN Line-Item Validation vs. PO to get ASN quantities checked against remaining open PO quantity.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-ASN-003` · workbook sheet "12. ASN"

#### PRD-ASN-013 — Shipment & Compliance Document Upload: happy path for the Vendor

- **Why it matters.** Reduces document-chasing at the receiving dock. Business use: Compliance and transport documents travel with the ASN record instead of arriving separately.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Attach the packing list, e-way bill, and LR/AWB to the ASN.
  3. Follow the business scenario the workbook gives: "Compliance and transport documents travel with the ASN record instead of arriving separately".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: the warehouse has everything needed at receipt. The business use case is served: compliance and transport documents travel with the ASN record instead of arriving separately.
- **Oracle.** Observable proof that Shipment & Compliance Document Upload did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-004.
- **Trace.** P0 · manual · `FEAT-ASN-004` · workbook sheet "12. ASN"

#### PRD-ASN-014 — Shipment & Compliance Document Upload: mandatory document types can be configured per category/geography

- **Why it matters.** The workbook records this edge case for Shipment & Compliance Document Upload: "Mandatory document types can be configured per category/geography".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Mandatory document types can be configured per category/geography".
  3. Use Shipment & Compliance Document Upload to attach the packing list, e-way bill, and LR/AWB to the ASN.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Shipment & Compliance Document Upload behaves as the workbook states: "Mandatory document types can be configured per category/geography".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-004 quoting the note.
- **Trace.** P2 · manual · `FEAT-ASN-004` · workbook sheet "12. ASN"

#### PRD-ASN-015 — Shipment & Compliance Document Upload: not available on the Growth plan

- **Why it matters.** The workbook limits Shipment & Compliance Document Upload to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Shipment & Compliance Document Upload to attach the packing list, e-way bill, and LR/AWB to the ASN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ASN-004` · workbook sheet "12. ASN"

#### PRD-ASN-016 — Shipment & Compliance Document Upload: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Shipment & Compliance Document Upload. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Shipment & Compliance Document Upload to attach the packing list, e-way bill, and LR/AWB to the ASN.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-ASN-004` · workbook sheet "12. ASN"

#### PRD-ASN-017 — ASN-to-GRN Auto-Prefill: happy path for the Warehouse Executive

- **Why it matters.** Speeds up GRN creation and reduces manual entry errors. Business use: At receipt, GRN fields default to ASN values and the warehouse team edits only where actuals differ.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Use ASN-to-GRN Auto-Prefill to get what the story asks for: the GRN form pre-filled from the linked ASN.
  3. Follow the business scenario the workbook gives: "At receipt, GRN fields default to ASN values and the warehouse team edits only where actuals differ".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: they only need to confirm actuals, not re-key everything. The business use case is served: at receipt, GRN fields default to ASN values and the warehouse team edits only where actuals differ.
- **Oracle.** Observable proof that ASN-to-GRN Auto-Prefill did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-009.
- **Trace.** P0 · manual · `FEAT-ASN-009` · workbook sheet "12. ASN"

#### PRD-ASN-018 — ASN-to-GRN Auto-Prefill: any GRN quantity differing from ASN should be visibly flagged, not silently…

- **Why it matters.** The workbook records this edge case for ASN-to-GRN Auto-Prefill: "Any GRN quantity differing from ASN should be visibly flagged, not silently accepted".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Any GRN quantity differing from ASN should be visibly flagged, not silently accepted".
  3. Use ASN-to-GRN Auto-Prefill to get the GRN form pre-filled from the linked ASN.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ASN-to-GRN Auto-Prefill behaves as the workbook states: "Any GRN quantity differing from ASN should be visibly flagged, not silently accepted".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-009 quoting the note.
- **Trace.** P2 · manual · `FEAT-ASN-009` · workbook sheet "12. ASN"

#### PRD-ASN-019 — ASN-to-GRN Auto-Prefill: not available on the Growth plan

- **Why it matters.** The workbook limits ASN-to-GRN Auto-Prefill to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use ASN-to-GRN Auto-Prefill to get the GRN form pre-filled from the linked ASN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-ASN-009` · workbook sheet "12. ASN"

#### PRD-ASN-020 — ASN-to-GRN Auto-Prefill: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of ASN-to-GRN Auto-Prefill. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA (Already in Procol).
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN-to-GRN Auto-Prefill to get the GRN form pre-filled from the linked ASN.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P1 · automate-later · `FEAT-ASN-009` · workbook sheet "12. ASN"

## 2. Roadmap features — not in the product yet (acceptance specifications)

#### PRD-ASN-021 — [Roadmap] Expected Delivery Date from ASN: happy path for the Buyer

- **Why it matters.** Keeps delivery expectations grounded in actual shipment data, not just the original PO date. Business use: ASN dispatch and transit data feed the expected-delivery field on the PO/tracking dashboard.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Use Expected Delivery Date from ASN to get what the story asks for: the expected delivery date populated from the ASN.
  3. Follow the business scenario the workbook gives: "ASN dispatch and transit data feed the expected-delivery field on the PO/tracking dashboard".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: PO delivery tracking reflects the actual shipment plan. The business use case is served: ASN dispatch and transit data feed the expected-delivery field on the PO/tracking dashboard.
- **Oracle.** Observable proof that Expected Delivery Date from ASN did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-005.
- **Trace.** P3 · manual · `FEAT-ASN-005` · workbook sheet "12. ASN"

#### PRD-ASN-022 — [Roadmap] Expected Delivery Date from ASN: should recalculate automatically if the ASN is amended

- **Why it matters.** The workbook records this edge case for Expected Delivery Date from ASN: "Should recalculate automatically if the ASN is amended". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Should recalculate automatically if the ASN is amended".
  3. Use Expected Delivery Date from ASN to get the expected delivery date populated from the ASN.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Expected Delivery Date from ASN behaves as the workbook states: "Should recalculate automatically if the ASN is amended".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-005 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-005` · workbook sheet "12. ASN"

#### PRD-ASN-023 — [Roadmap] Expected Delivery Date from ASN: not available on the Growth plan

- **Why it matters.** The workbook limits Expected Delivery Date from ASN to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Expected Delivery Date from ASN to get the expected delivery date populated from the ASN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-005` · workbook sheet "12. ASN"

#### PRD-ASN-024 — [Roadmap] Expected Delivery Date from ASN: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Expected Delivery Date from ASN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Expected Delivery Date from ASN to get the expected delivery date populated from the ASN.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P3 · manual · `FEAT-ASN-005` · workbook sheet "12. ASN"

#### PRD-ASN-025 — [Roadmap] ASN Discrepancy Alerts: happy path for the Buyer / Warehouse Executive

- **Why it matters.** Surfaces problems while there's still time to act, not after goods are on the dock. Business use: Automated alert fires when ASN quantity, item, or date deviates materially from the PO.
- **Setup.**
  Persona: Buyer / Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Warehouse Executive on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Be alerted when ASN and PO details diverge.
  3. Follow the business scenario the workbook gives: "Automated alert fires when ASN quantity, item, or date deviates materially from the PO".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer / Warehouse Executive achieves the story's outcome: flag it before the shipment arrives. The business use case is served: automated alert fires when ASN quantity, item, or date deviates materially from the PO.
- **Oracle.** Observable proof that ASN Discrepancy Alerts did its job for the Buyer / Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-006.
- **Trace.** P3 · manual · `FEAT-ASN-006` · workbook sheet "12. ASN"

#### PRD-ASN-026 — [Roadmap] ASN Discrepancy Alerts: tenant configuration — Alert thresholds should be configurable per category

- **Why it matters.** The workbook says "Alert thresholds should be configurable per category". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.
- **Setup.**
  Persona: Tenant Admin (to change the setting) and Buyer / Warehouse Executive (to use the feature).
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  The Configuration Reference sheet names no config key for this; the setting is the one the note describes.
- **Steps.**
  1. As a Tenant Admin, find the tenant setting the note refers to ("Alert thresholds should be configurable per category") and record its current value.
  2. As the Buyer / Warehouse Executive: use ASN Discrepancy Alerts to be alerted when ASN and PO details diverge.
  3. Change the setting to a different allowed value, then repeat step 2.
- **Expected.** In both runs ASN Discrepancy Alerts follows the tenant's configured value, as the workbook states: "Alert thresholds should be configurable per category". Changing the setting changes the behaviour accordingly.
- **Oracle.** The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.
- **Trace.** P3 · manual · `FEAT-ASN-006` · workbook sheet "12. ASN"

#### PRD-ASN-027 — [Roadmap] ASN Discrepancy Alerts: not available on the Growth plan

- **Why it matters.** The workbook limits ASN Discrepancy Alerts to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer / Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Warehouse Executive on the lower-plan tenant.
  2. Try it: use ASN Discrepancy Alerts to be alerted when ASN and PO details diverge.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-006` · workbook sheet "12. ASN"

#### PRD-ASN-028 — [Roadmap] ASN Discrepancy Alerts: refused for a user without the Buyer / Warehouse Executive role

- **Why it matters.** The workbook names Buyer / Warehouse Executive as the user of ASN Discrepancy Alerts. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer / Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN Discrepancy Alerts to be alerted when ASN and PO details diverge.
  3. Repeat as a Buyer / Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer / Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer / Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-ASN-006` · workbook sheet "12. ASN"

#### PRD-ASN-029 — [Roadmap] Multi-Item / Multi-PO Consolidated ASN: happy path for the Vendor

- **Why it matters.** Matches real-world consolidated logistics. Business use: One shipment carrying items against several POs is captured as a single ASN with line-level PO references.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Raise one ASN covering multiple POs in a single shipment.
  3. Follow the business scenario the workbook gives: "One shipment carrying items against several POs is captured as a single ASN with line-level PO references".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: consolidated dispatches don't need separate notices. The business use case is served: one shipment carrying items against several POs is captured as a single ASN with line-level PO references.
- **Oracle.** Observable proof that Multi-Item / Multi-PO Consolidated ASN did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-007.
- **Trace.** P3 · manual · `FEAT-ASN-007` · workbook sheet "12. ASN"

#### PRD-ASN-030 — [Roadmap] Multi-Item / Multi-PO Consolidated ASN: reporting must still be able to break the consolidated ASN back into per-PO…

- **Why it matters.** The workbook records this edge case for Multi-Item / Multi-PO Consolidated ASN: "Reporting must still be able to break the consolidated ASN back into per-PO views".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Reporting must still be able to break the consolidated ASN back into per-PO views".
  3. Use Multi-Item / Multi-PO Consolidated ASN to raise one ASN covering multiple POs in a single shipment.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Multi-Item / Multi-PO Consolidated ASN behaves as the workbook states: "Reporting must still be able to break the consolidated ASN back into per-PO views".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-007 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-007` · workbook sheet "12. ASN"

#### PRD-ASN-031 — [Roadmap] Multi-Item / Multi-PO Consolidated ASN: not available on the Growth plan

- **Why it matters.** The workbook limits Multi-Item / Multi-PO Consolidated ASN to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Multi-Item / Multi-PO Consolidated ASN to raise one ASN covering multiple POs in a single shipment.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-007` · workbook sheet "12. ASN"

#### PRD-ASN-032 — [Roadmap] Multi-Item / Multi-PO Consolidated ASN: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Multi-Item / Multi-PO Consolidated ASN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multi-Item / Multi-PO Consolidated ASN to raise one ASN covering multiple POs in a single shipment.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P3 · manual · `FEAT-ASN-007` · workbook sheet "12. ASN"

#### PRD-ASN-033 — [Roadmap] ASN Amendment: happy path for the Vendor

- **Why it matters.** Keeps the buyer's expectation in sync with reality while preserving an audit trail. Business use: Changes to dispatch date, quantity, or carrier post-submission are logged as an amendment, not a silent edit.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Amend an ASN if dispatch details change.
  3. Follow the business scenario the workbook gives: "Changes to dispatch date, quantity, or carrier post-submission are logged as an amendment, not a silent edit".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: the buyer always sees the current shipment plan. The business use case is served: changes to dispatch date, quantity, or carrier post-submission are logged as an amendment, not a silent edit.
- **Oracle.** Observable proof that ASN Amendment did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-008.
- **Trace.** P3 · manual · `FEAT-ASN-008` · workbook sheet "12. ASN"

#### PRD-ASN-034 — [Roadmap] ASN Amendment: original ASN values are retained for audit alongside the amendment

- **Why it matters.** The workbook records this edge case for ASN Amendment: "Original ASN values are retained for audit alongside the amendment".
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup.
  2. Set up the situation the note describes: "Original ASN values are retained for audit alongside the amendment".
  3. Use ASN Amendment to amend an ASN if dispatch details change.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ASN Amendment behaves as the workbook states: "Original ASN values are retained for audit alongside the amendment".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-008 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-008` · workbook sheet "12. ASN"

#### PRD-ASN-035 — [Roadmap] ASN Amendment: not available on the Growth plan

- **Why it matters.** The workbook limits ASN Amendment to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use ASN Amendment to amend an ASN if dispatch details change.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-008` · workbook sheet "12. ASN"

#### PRD-ASN-036 — [Roadmap] ASN Amendment: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of ASN Amendment. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN Amendment to amend an ASN if dispatch details change.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P3 · manual · `FEAT-ASN-008` · workbook sheet "12. ASN"

#### PRD-ASN-037 — [Roadmap] ASN Tracking / Status Dashboard: happy path for the Buyer / Warehouse Executive

- **Why it matters.** Centralized inbound-shipment visibility. Business use: Dashboard shows ASN status (submitted, in-transit, received, discrepant) across the org.
- **Setup.**
  Persona: Buyer / Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Warehouse Executive on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Use ASN Tracking / Status Dashboard to get what the story asks for: a dashboard of all in-transit ASNs.
  3. Follow the business scenario the workbook gives: "Dashboard shows ASN status (submitted, in-transit, received, discrepant) across the org".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer / Warehouse Executive achieves the story's outcome: see what's coming across all vendors at a glance. The business use case is served: dashboard shows ASN status (submitted, in-transit, received, discrepant) across the org.
- **Oracle.** Observable proof that ASN Tracking / Status Dashboard did its job for the Buyer / Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-010.
- **Trace.** P3 · manual · `FEAT-ASN-010` · workbook sheet "12. ASN"

#### PRD-ASN-038 — [Roadmap] ASN Tracking / Status Dashboard: should support filtering by vendor, plant, and expected date

- **Why it matters.** The workbook records this edge case for ASN Tracking / Status Dashboard: "Should support filtering by vendor, plant, and expected date". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Buyer / Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Should support filtering by vendor, plant, and expected date".
  3. Use ASN Tracking / Status Dashboard to get a dashboard of all in-transit ASNs.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ASN Tracking / Status Dashboard behaves as the workbook states: "Should support filtering by vendor, plant, and expected date".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-010 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-010` · workbook sheet "12. ASN"

#### PRD-ASN-039 — [Roadmap] ASN Tracking / Status Dashboard: not available on the Growth plan

- **Why it matters.** The workbook limits ASN Tracking / Status Dashboard to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer / Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Buyer / Warehouse Executive on the lower-plan tenant.
  2. Try it: use ASN Tracking / Status Dashboard to get a dashboard of all in-transit ASNs.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-010` · workbook sheet "12. ASN"

#### PRD-ASN-040 — [Roadmap] ASN Tracking / Status Dashboard: refused for a user without the Buyer / Warehouse Executive role

- **Why it matters.** The workbook names Buyer / Warehouse Executive as the user of ASN Tracking / Status Dashboard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer / Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN Tracking / Status Dashboard to get a dashboard of all in-transit ASNs.
  3. Repeat as a Buyer / Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer / Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer / Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-ASN-010` · workbook sheet "12. ASN"

#### PRD-ASN-041 — [Roadmap] Carrier & Transport Details Capture: happy path for the Vendor

- **Why it matters.** Speeds up physical gate entry and receiving processes. Business use: Transport metadata is captured on the ASN and made available to site security/warehouse teams.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
  Context from the workbook: Relevant mainly for manufacturing/plant-gate scenarios.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Record carrier, vehicle, and driver details on the ASN.
  3. Follow the business scenario the workbook gives: "Transport metadata is captured on the ASN and made available to site security/warehouse teams".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: gate/security checks at the receiving site are faster. The business use case is served: transport metadata is captured on the ASN and made available to site security/warehouse teams.
- **Oracle.** Observable proof that Carrier & Transport Details Capture did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-011.
- **Trace.** P3 · manual · `FEAT-ASN-011` · workbook sheet "12. ASN"

#### PRD-ASN-042 — [Roadmap] Carrier & Transport Details Capture: not available on the Growth plan

- **Why it matters.** The workbook limits Carrier & Transport Details Capture to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Carrier & Transport Details Capture to record carrier, vehicle, and driver details on the ASN.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-011` · workbook sheet "12. ASN"

#### PRD-ASN-043 — [Roadmap] Carrier & Transport Details Capture: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Carrier & Transport Details Capture. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Carrier & Transport Details Capture to record carrier, vehicle, and driver details on the ASN.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P3 · manual · `FEAT-ASN-011` · workbook sheet "12. ASN"

#### PRD-ASN-044 — [Roadmap] ASN Notification to Warehouse: happy path for the Warehouse Executive

- **Why it matters.** Enables proactive receiving-dock planning instead of surprise arrivals. Business use: Warehouse team gets an alert (email/in-app) the moment a relevant ASN is submitted or amended.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Be notified automatically when a new ASN is raised against their location.
  3. Follow the business scenario the workbook gives: "Warehouse team gets an alert (email/in-app) the moment a relevant ASN is submitted or amended".
  4. Check the result against the story's promised outcome.
- **Expected.** The Warehouse Executive achieves the story's outcome: plan receiving capacity. The business use case is served: warehouse team gets an alert (email/in-app) the moment a relevant ASN is submitted or amended.
- **Oracle.** Observable proof that ASN Notification to Warehouse did its job for the Warehouse Executive — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-012.
- **Trace.** P3 · manual · `FEAT-ASN-012` · workbook sheet "12. ASN"

#### PRD-ASN-045 — [Roadmap] ASN Notification to Warehouse: notification routing should follow the same location/entity mapping as GRN

- **Why it matters.** The workbook records this edge case for ASN Notification to Warehouse: "Notification routing should follow the same location/entity mapping as GRN".
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the tenant described in Setup.
  2. Set up the situation the note describes: "Notification routing should follow the same location/entity mapping as GRN".
  3. Use ASN Notification to Warehouse to be notified automatically when a new ASN is raised against their location.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** ASN Notification to Warehouse behaves as the workbook states: "Notification routing should follow the same location/entity mapping as GRN".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-012 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-012` · workbook sheet "12. ASN"

#### PRD-ASN-046 — [Roadmap] ASN Notification to Warehouse: not available on the Growth plan

- **Why it matters.** The workbook limits ASN Notification to Warehouse to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Warehouse Executive.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Warehouse Executive on the lower-plan tenant.
  2. Try it: use ASN Notification to Warehouse to be notified automatically when a new ASN is raised against their location.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-012` · workbook sheet "12. ASN"

#### PRD-ASN-047 — [Roadmap] ASN Notification to Warehouse: refused for a user without the Warehouse Executive role

- **Why it matters.** The workbook names Warehouse Executive as the user of ASN Notification to Warehouse. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Warehouse Executive.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use ASN Notification to Warehouse to be notified automatically when a new ASN is raised against their location.
  3. Repeat as a Warehouse Executive.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Warehouse Executive can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Warehouse Executive.
- **Trace.** P3 · manual · `FEAT-ASN-012` · workbook sheet "12. ASN"

#### PRD-ASN-048 — [Roadmap] Vendor ASN Compliance Scorecard: happy path for the Procurement Manager

- **Why it matters.** Turns ASN discipline into a measurable vendor-performance input. Business use: Scorecard tracks ASN timeliness and accuracy rate per vendor over time.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Track how consistently vendors submit ASNs on time and accurately.
  3. Follow the business scenario the workbook gives: "Scorecard tracks ASN timeliness and accuracy rate per vendor over time".
  4. Check the result against the story's promised outcome.
- **Expected.** The Procurement Manager achieves the story's outcome: factor it into vendor performance reviews. The business use case is served: scorecard tracks ASN timeliness and accuracy rate per vendor over time.
- **Oracle.** Observable proof that Vendor ASN Compliance Scorecard did its job for the Procurement Manager — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-013.
- **Trace.** P3 · manual · `FEAT-ASN-013` · workbook sheet "12. ASN"

#### PRD-ASN-049 — [Roadmap] Vendor ASN Compliance Scorecard: should roll up into the broader vendor scorecard, not stand alone

- **Why it matters.** The workbook records this edge case for Vendor ASN Compliance Scorecard: "Should roll up into the broader vendor scorecard, not stand alone". It is stated as a requirement ("should"), so a product that does otherwise falls short of the spec.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the tenant described in Setup.
  2. Set up the situation the note describes: "Should roll up into the broader vendor scorecard, not stand alone".
  3. Use Vendor ASN Compliance Scorecard to track how consistently vendors submit ASNs on time and accurately.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Vendor ASN Compliance Scorecard behaves as the workbook states: "Should roll up into the broader vendor scorecard, not stand alone".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-013 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-013` · workbook sheet "12. ASN"

#### PRD-ASN-050 — [Roadmap] Vendor ASN Compliance Scorecard: not available on the Growth plan

- **Why it matters.** The workbook limits Vendor ASN Compliance Scorecard to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Procurement Manager.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Procurement Manager on the lower-plan tenant.
  2. Try it: use Vendor ASN Compliance Scorecard to track how consistently vendors submit ASNs on time and accurately.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-013` · workbook sheet "12. ASN"

#### PRD-ASN-051 — [Roadmap] Vendor ASN Compliance Scorecard: refused for a user without the Procurement Manager role

- **Why it matters.** The workbook names Procurement Manager as the user of Vendor ASN Compliance Scorecard. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Procurement Manager.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor ASN Compliance Scorecard to track how consistently vendors submit ASNs on time and accurately.
  3. Repeat as a Procurement Manager.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Procurement Manager can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Procurement Manager.
- **Trace.** P3 · manual · `FEAT-ASN-013` · workbook sheet "12. ASN"

#### PRD-ASN-052 — [Roadmap] EDI/API Integration for ASN: happy path for the Vendor / Engineering

- **Why it matters.** Scales ASN intake for high-volume vendors without manual bottlenecks. Business use: Large or system-integrated vendors push ASN data directly via EDI 856 or API instead of the web portal.
- **Setup.**
  Persona: Vendor / Engineering.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor / Engineering on the tenant described in Setup and open ASN (Advance Shipment Notice).
  2. Use EDI/API Integration for ASN to get what the story asks for: ASN data to flow via EDI/API for ERP-integrated vendors.
  3. Follow the business scenario the workbook gives: "Large or system-integrated vendors push ASN data directly via EDI 856 or API instead of the web portal".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor / Engineering achieves the story's outcome: high-volume vendors don't use manual portal entry. The business use case is served: large or system-integrated vendors push ASN data directly via EDI 856 or API instead of the web portal.
- **Oracle.** Observable proof that EDI/API Integration for ASN did its job for the Vendor / Engineering — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-ASN-014.
- **Trace.** P3 · manual · `FEAT-ASN-014` · workbook sheet "12. ASN"

#### PRD-ASN-053 — [Roadmap] EDI/API Integration for ASN: requires a fallback portal path for vendors without EDI capability

- **Why it matters.** The workbook records this edge case for EDI/API Integration for ASN: "Requires a fallback portal path for vendors without EDI capability".
- **Setup.**
  Persona: Vendor / Engineering.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor / Engineering on the tenant described in Setup.
  2. Set up the situation the note describes: "Requires a fallback portal path for vendors without EDI capability".
  3. Use EDI/API Integration for ASN to get ASN data to flow via EDI/API for ERP-integrated vendors.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** EDI/API Integration for ASN behaves as the workbook states: "Requires a fallback portal path for vendors without EDI capability".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-ASN-014 quoting the note.
- **Trace.** P3 · manual · `FEAT-ASN-014` · workbook sheet "12. ASN"

#### PRD-ASN-054 — [Roadmap] EDI/API Integration for ASN: not available on the Growth plan

- **Why it matters.** The workbook limits EDI/API Integration for ASN to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor / Engineering.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as a Vendor / Engineering on the lower-plan tenant.
  2. Try it: use EDI/API Integration for ASN to get ASN data to flow via EDI/API for ERP-integrated vendors.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P3 · manual · `FEAT-ASN-014` · workbook sheet "12. ASN"

#### PRD-ASN-055 — [Roadmap] EDI/API Integration for ASN: refused for a user without the Vendor / Engineering role

- **Why it matters.** The workbook names Vendor / Engineering as the user of EDI/API Integration for ASN. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor / Engineering.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: Roadmap (Suggested — not in product yet) — this is an acceptance specification; run it once the feature ships.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use EDI/API Integration for ASN to get ASN data to flow via EDI/API for ERP-integrated vendors.
  3. Repeat as a Vendor / Engineering.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor / Engineering can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor / Engineering.
- **Trace.** P3 · manual · `FEAT-ASN-014` · workbook sheet "12. ASN"
