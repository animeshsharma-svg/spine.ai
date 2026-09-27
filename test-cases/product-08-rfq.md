# Product test cases — 08. RFQ (MOD-03)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-03 · 16 features · 46 cases · group `PRD-RFQ` · plan availability: All Plans · status: GA

Structured competitive commercial bidding. Drive competitive pricing and vendor selection through a governed, auditable bidding process.

## 1. Core features

#### PRD-RFQ-001 — RFQ Templates (Line/Global/Formula): happy path for the Buyer

- **Why it matters.** Consistent, computable commercial bids. Business use: The commercial stage uses configurable templates (line + global terms + formula fields) set at implementation.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  gate: `rfq.bid.allow_partial` at its default (OFF) — CONF-RFQ-001 "Allow Partial Bidding".
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use RFQ Templates (Line/Global/Formula) to get what the story asks for: configurable RFQ templates with line and global terms and formulas.
  3. Follow the business scenario the workbook gives: "The commercial stage uses configurable templates (line + global terms + formula fields) set at implementation".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: commercial bids are consistent and computable. The business use case is served: the commercial stage uses configurable templates (line + global terms + formula fields) set at implementation.
- **Oracle.** Observable proof that RFQ Templates (Line/Global/Formula) did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-001.
- **Trace.** P0 · manual · `FEAT-RFQ-001` · `rfq.bid.allow_partial` · workbook sheet "8. RFQ"

#### PRD-RFQ-002 — Allow Partial Bidding (rfq.bid.allow_partial) = ON

- **Why it matters.** For large RFQs with many line items, forcing full bids limits vendor participation. Partial bidding increases competition and can reduce overall cost by splitting award across specialists.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: tenant on Growth (Plan Required: Growth, Enterprise).
  gate: `rfq.bid.allow_partial` = ON (default: OFF) — CONF-RFQ-001 "Allow Partial Bidding", Toggle, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `rfq.bid.allow_partial` to ON.
  2. As a Buyer: use RFQ Templates (Line/Global/Formula) to get configurable RFQ templates with line and global terms and formulas.
  3. Observe the behaviour the setting controls: when ON, vendors can submit bids for a subset of line items in the RFQ rather than the full BOQ.
- **Expected.** With the setting ON, the behaviour follows it. What the setting controls: When ON, vendors can submit bids for a subset of line items in the RFQ rather than the full BOQ. Stated business impact: Enabling this requires Procurement team to handle split-award decisions and manage multiple POs; disabling ensures single-source RFQ completion.
- **Oracle.** The behaviour in step 3 matches the ON setting; compare with the case for the other value — they must differ as the description states.
- **Trace.** P1 · automate-later · `FEAT-RFQ-001` · `rfq.bid.allow_partial` · `CONF-RFQ-001` · workbook sheet "25. Configuration Reference"

#### PRD-RFQ-003 — Allow Partial Bidding (rfq.bid.allow_partial) = OFF (default)

- **Why it matters.** For large RFQs with many line items, forcing full bids limits vendor participation. Partial bidding increases competition and can reduce overall cost by splitting award across specialists.
- **Setup.**
  Persona: Tenant Admin and Buyer.
  Plan: tenant on Growth (Plan Required: Growth, Enterprise).
  gate: `rfq.bid.allow_partial` = OFF (default: OFF) — CONF-RFQ-001 "Allow Partial Bidding", Toggle, risk if changed: Medium.
- **Steps.**
  1. As the Tenant Admin, set `rfq.bid.allow_partial` to OFF.
  2. As a Buyer: use RFQ Templates (Line/Global/Formula) to get configurable RFQ templates with line and global terms and formulas.
  3. Observe the behaviour the setting controls: when ON, vendors can submit bids for a subset of line items in the RFQ rather than the full BOQ.
- **Expected.** With the setting OFF, the behaviour follows it. What the setting controls: When ON, vendors can submit bids for a subset of line items in the RFQ rather than the full BOQ. Stated business impact: Enabling this requires Procurement team to handle split-award decisions and manage multiple POs; disabling ensures single-source RFQ completion.
- **Oracle.** The behaviour in step 3 matches the OFF setting; compare with the case for the other value — they must differ as the description states.
- **Trace.** P1 · automate-later · `FEAT-RFQ-001` · `rfq.bid.allow_partial` · `CONF-RFQ-001` · workbook sheet "25. Configuration Reference"

#### PRD-RFQ-004 — Allow Partial Bidding (rfq.bid.allow_partial): not available on plans below Growth

- **Why it matters.** The Configuration Reference limits Allow Partial Bidding to "Growth, Enterprise".
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  gate: `rfq.bid.allow_partial` — CONF-RFQ-001.
- **Steps.**
  1. As the Tenant Admin on the lower-plan tenant, try to change `rfq.bid.allow_partial`.
  2. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the setting is not available to change. On Growth it is.
- **Oracle.** The setting is absent or refused on the lower plan and available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RFQ-001` · `rfq.bid.allow_partial` · `CONF-RFQ-001` · workbook sheet "25. Configuration Reference"

#### PRD-RFQ-005 — RFQ Templates (Line/Global/Formula): refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of RFQ Templates (Line/Global/Formula). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use RFQ Templates (Line/Global/Formula) to get configurable RFQ templates with line and global terms and formulas.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-001` · `rfq.bid.allow_partial` · workbook sheet "8. RFQ"

#### PRD-RFQ-006 — Bidding Scope Rule: happy path for the Buyer

- **Why it matters.** Balances participation and award strategy. Business use: Buyer sets whether vendors must bid all lines or may bid partially, enabling line- or lot-level award.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
  gate: `rfq.bid.allow_partial` at its default (OFF) — CONF-RFQ-001 "Allow Partial Bidding".
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Require all-line or allow partial bidding.
  3. Follow the business scenario the workbook gives: "Buyer sets whether vendors must bid all lines or may bid partially, enabling line- or lot-level award".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: control coverage and award flexibility. The business use case is served: buyer sets whether vendors must bid all lines or may bid partially, enabling line- or lot-level award.
- **Oracle.** Observable proof that Bidding Scope Rule did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-002.
- **Trace.** P0 · manual · `FEAT-RFQ-002` · `rfq.bid.allow_partial` · workbook sheet "8. RFQ"

#### PRD-RFQ-007 — Bidding Scope Rule: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Bidding Scope Rule. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bidding Scope Rule to require all-line or allow partial bidding.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-002` · `rfq.bid.allow_partial` · workbook sheet "8. RFQ"

#### PRD-RFQ-008 — Commercial Masking and RFQ Opening: happy path for the Buyer

- **Why it matters.** Integrity of the sealed-bid process. Business use: Commercials stay sealed until close, then open automatically or via OTP and password by an authorized person.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use Commercial Masking and RFQ Opening to get what the story asks for: commercials masked until close and opened automatically or by OTP.
  3. Follow the business scenario the workbook gives: "Commercials stay sealed until close, then open automatically or via OTP and password by an authorized person".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: bid confidentiality holds. The business use case is served: commercials stay sealed until close, then open automatically or via OTP and password by an authorized person.
- **Oracle.** Observable proof that Commercial Masking and RFQ Opening did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-003.
- **Trace.** P0 · manual · `FEAT-RFQ-003` · workbook sheet "8. RFQ"

#### PRD-RFQ-009 — Commercial Masking and RFQ Opening: RFQ never visible to evaluators/requisitioners

- **Why it matters.** The workbook records this access rule for Commercial Masking and RFQ Opening: "RFQ never visible to evaluators/requisitioners".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "RFQ never visible to evaluators/requisitioners".
  3. Use Commercial Masking and RFQ Opening to get commercials masked until close and opened automatically or by OTP.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Commercial Masking and RFQ Opening behaves as the workbook states: "RFQ never visible to evaluators/requisitioners".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-RFQ-003 quoting the note.
- **Trace.** P1 · automate-later · `FEAT-RFQ-003` · workbook sheet "8. RFQ"

#### PRD-RFQ-010 — Commercial Masking and RFQ Opening: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Commercial Masking and RFQ Opening. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Commercial Masking and RFQ Opening to get commercials masked until close and opened automatically or by OTP.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-003` · workbook sheet "8. RFQ"

#### PRD-RFQ-011 — Counter Offers: happy path for the Buyer

- **Why it matters.** Structured negotiation. Business use: During negotiation; the buyer issues counters on commercial and non-commercial terms per the template.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Counter on commercial and non-commercial terms per the template.
  3. Follow the business scenario the workbook gives: "During negotiation; the buyer issues counters on commercial and non-commercial terms per the template".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: negotiate better terms. The business use case is served: during negotiation; the buyer issues counters on commercial and non-commercial terms per the template.
- **Oracle.** Observable proof that Counter Offers did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-004.
- **Trace.** P0 · manual · `FEAT-RFQ-004` · workbook sheet "8. RFQ"

#### PRD-RFQ-012 — Counter Offers: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Counter Offers. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Counter Offers to counter on commercial and non-commercial terms per the template.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-004` · workbook sheet "8. RFQ"

#### PRD-RFQ-013 — Request for Best Offer: happy path for the Buyer

- **Why it matters.** Competitive final-price discovery. Business use: The buyer requests full-and-final pricing without revealing a target, within a set window.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Request full-and-final pricing without revealing a target.
  3. Follow the business scenario the workbook gives: "The buyer requests full-and-final pricing without revealing a target, within a set window".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: drive best pricing. The business use case is served: the buyer requests full-and-final pricing without revealing a target, within a set window.
- **Oracle.** Observable proof that Request for Best Offer did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-005.
- **Trace.** P0 · manual · `FEAT-RFQ-005` · workbook sheet "8. RFQ"

#### PRD-RFQ-014 — Request for Best Offer: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Request for Best Offer. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Request for Best Offer to request full-and-final pricing without revealing a target.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-005` · workbook sheet "8. RFQ"

#### PRD-RFQ-015 — Bid Revisions and History: happy path for the Buyer

- **Why it matters.** Auditable negotiation trail. Business use: Each accepted counter creates a bid revision the buyer can review in the QCS.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use Bid Revisions and History to get what the story asks for: every counter to create a revision they can review.
  3. Follow the business scenario the workbook gives: "Each accepted counter creates a bid revision the buyer can review in the QCS".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: they have an auditable negotiation trail. The business use case is served: each accepted counter creates a bid revision the buyer can review in the QCS.
- **Oracle.** Observable proof that Bid Revisions and History did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-006.
- **Trace.** P0 · manual · `FEAT-RFQ-006` · workbook sheet "8. RFQ"

#### PRD-RFQ-016 — Bid Revisions and History: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Bid Revisions and History. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bid Revisions and History to get every counter to create a revision they can review.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-006` · workbook sheet "8. RFQ"

#### PRD-RFQ-017 — QCS Ranking and L1 Highlighting: happy path for the Buyer

- **Why it matters.** Faster, clearer award decisions. Business use: The QCS ranks bids (including landed price) and highlights L1 per line for award.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use QCS Ranking and L1 Highlighting to get what the story asks for: the QCS to rank bids and highlight L1 per line.
  3. Follow the business scenario the workbook gives: "The QCS ranks bids (including landed price) and highlights L1 per line for award".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: spot the best bid instantly. The business use case is served: the QCS ranks bids (including landed price) and highlights L1 per line for award.
- **Oracle.** Observable proof that QCS Ranking and L1 Highlighting did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-007.
- **Trace.** P0 · manual · `FEAT-RFQ-007` · workbook sheet "8. RFQ"

#### PRD-RFQ-018 — QCS Ranking and L1 Highlighting: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of QCS Ranking and L1 Highlighting. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use QCS Ranking and L1 Highlighting to get the QCS to rank bids and highlight L1 per line.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-007` · workbook sheet "8. RFQ"

#### PRD-RFQ-019 — Vendor Bid Submission: happy path for the Vendor

- **Why it matters.** Lower-friction commercial bidding. Business use: Vendors submit commercial quotes manually, by Excel, or quick-fill, revising during the window.
- **Setup.**
  Persona: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open RFQ.
  2. Submit quotes manually, by Excel, or quick-fill with revisions.
  3. Follow the business scenario the workbook gives: "Vendors submit commercial quotes manually, by Excel, or quick-fill, revising during the window".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: quote efficiently. The business use case is served: vendors submit commercial quotes manually, by Excel, or quick-fill, revising during the window.
- **Oracle.** Observable proof that Vendor Bid Submission did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-008.
- **Trace.** P0 · manual · `FEAT-RFQ-008` · workbook sheet "8. RFQ"

#### PRD-RFQ-020 — Vendor Bid Submission: refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Vendor Bid Submission. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Bid Submission to submit quotes manually, by Excel, or quick-fill with revisions.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-RFQ-008` · workbook sheet "8. RFQ"

#### PRD-RFQ-021 — Delete Line Items: happy path for the Buyer

- **Why it matters.** Keeps events clean; recovers demand. Business use: When all vendors regret a line; the buyer deletes it (it returns to the open PR pool) and proceeds.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Delete lines and return them to the open PR pool.
  3. Follow the business scenario the workbook gives: "When all vendors regret a line; the buyer deletes it (it returns to the open PR pool) and proceeds".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: proceed with viable lines only. The business use case is served: when all vendors regret a line; the buyer deletes it (it returns to the open PR pool) and proceeds.
- **Oracle.** Observable proof that Delete Line Items did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-011.
- **Trace.** P0 · manual · `FEAT-RFQ-011` · `MOD-02` · workbook sheet "8. RFQ"

#### PRD-RFQ-022 — Delete Line Items: returns to MOD-02 Open

- **Why it matters.** The workbook records this edge case for Delete Line Items: "Returns to MOD-02 Open".
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Returns to MOD-02 Open".
  3. Use Delete Line Items to delete lines and return them to the open PR pool.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Delete Line Items behaves as the workbook states: "Returns to MOD-02 Open".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-RFQ-011 quoting the note.
- **Trace.** P2 · manual · `FEAT-RFQ-011` · `MOD-02` · workbook sheet "8. RFQ"

#### PRD-RFQ-023 — Delete Line Items: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Delete Line Items. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Delete Line Items to delete lines and return them to the open PR pool.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-011` · `MOD-02` · workbook sheet "8. RFQ"

#### PRD-RFQ-024 — Participation Status Tracking: happy path for the Buyer

- **Why it matters.** Drives reminder actions. Business use: During the window; the buyer monitors per-vendor participation status stage by stage.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use Participation Status Tracking to get what the story asks for: stage-wise per-vendor participation status.
  3. Follow the business scenario the workbook gives: "During the window; the buyer monitors per-vendor participation status stage by stage".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: monitor engagement and nudge laggards. The business use case is served: during the window; the buyer monitors per-vendor participation status stage by stage.
- **Oracle.** Observable proof that Participation Status Tracking did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-012.
- **Trace.** P0 · manual · `FEAT-RFQ-012` · workbook sheet "8. RFQ"

#### PRD-RFQ-025 — Participation Status Tracking: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Participation Status Tracking. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Participation Status Tracking to get stage-wise per-vendor participation status.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-012` · workbook sheet "8. RFQ"

#### PRD-RFQ-026 — Bulk / Line-wise Counter Offer: happy path for the Buyer

- **Why it matters.** Negotiation at scale. Business use: Across many lines; the buyer issues bulk counters and vendors accept/reject line-by-line with auto price propagation.
- **Setup.**
  Persona: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use Bulk / Line-wise Counter Offer to get what the story asks for: bulk counters with line-wise accept/reject and auto price propagation.
  3. Follow the business scenario the workbook gives: "Across many lines; the buyer issues bulk counters and vendors accept/reject line-by-line with auto price propagation".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: negotiate many lines efficiently. The business use case is served: across many lines; the buyer issues bulk counters and vendors accept/reject line-by-line with auto price propagation.
- **Oracle.** Observable proof that Bulk / Line-wise Counter Offer did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-016.
- **Trace.** P0 · manual · `FEAT-RFQ-016` · workbook sheet "8. RFQ"

#### PRD-RFQ-027 — Bulk / Line-wise Counter Offer: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Bulk / Line-wise Counter Offer. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: any tenant (Plan Required: All Plans).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Bulk / Line-wise Counter Offer to get bulk counters with line-wise accept/reject and auto price propagation.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-016` · workbook sheet "8. RFQ"

## 2. Optional features

#### PRD-RFQ-028 — RFQ to Auction Conversion: happy path for the Buyer

- **Why it matters.** Price discovery via auction. Business use: When more competition is needed; the buyer flips the latest RFQ bids into an auction.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Flip the latest RFQ bids into an auction.
  3. Follow the business scenario the workbook gives: "When more competition is needed; the buyer flips the latest RFQ bids into an auction".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: escalate to live competition. The business use case is served: when more competition is needed; the buyer flips the latest RFQ bids into an auction.
- **Oracle.** Observable proof that RFQ to Auction Conversion did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-009.
- **Trace.** P1 · manual · `FEAT-RFQ-009` · `MOD-05` · workbook sheet "8. RFQ"

#### PRD-RFQ-029 — RFQ to Auction Conversion: not available on plans below Growth

- **Why it matters.** The workbook limits RFQ to Auction Conversion to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use RFQ to Auction Conversion to flip the latest RFQ bids into an auction.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RFQ-009` · `MOD-05` · workbook sheet "8. RFQ"

#### PRD-RFQ-030 — RFQ to Auction Conversion: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of RFQ to Auction Conversion. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use RFQ to Auction Conversion to flip the latest RFQ bids into an auction.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-009` · `MOD-05` · workbook sheet "8. RFQ"

#### PRD-RFQ-031 — Mid-Event Lot Splitting: happy path for the Buyer

- **Why it matters.** Negotiation leverage. Business use: Mid-event; the buyer splits RFQ lines into lots to aid negotiation and processing.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Split RFQ lines into lots mid-event.
  3. Follow the business scenario the workbook gives: "Mid-event; the buyer splits RFQ lines into lots to aid negotiation and processing".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: improve negotiation and processing. The business use case is served: mid-event; the buyer splits RFQ lines into lots to aid negotiation and processing.
- **Oracle.** Observable proof that Mid-Event Lot Splitting did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-010.
- **Trace.** P1 · manual · `FEAT-RFQ-010` · workbook sheet "8. RFQ"

#### PRD-RFQ-032 — Mid-Event Lot Splitting: not available on plans below Growth

- **Why it matters.** The workbook limits Mid-Event Lot Splitting to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Mid-Event Lot Splitting to split RFQ lines into lots mid-event.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RFQ-010` · workbook sheet "8. RFQ"

#### PRD-RFQ-033 — Mid-Event Lot Splitting: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Mid-Event Lot Splitting. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Mid-Event Lot Splitting to split RFQ lines into lots mid-event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-010` · workbook sheet "8. RFQ"

#### PRD-RFQ-034 — Quote Mode (Discount % or Price): happy path for the Vendor

- **Why it matters.** Flexible commercial capture. Business use: Vendors quote either a discount percentage or an absolute price per line, per configuration.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the tenant described in Setup and open RFQ.
  2. Quote a discount percentage or an absolute price per line.
  3. Follow the business scenario the workbook gives: "Vendors quote either a discount percentage or an absolute price per line, per configuration".
  4. Check the result against the story's promised outcome.
- **Expected.** The Vendor achieves the story's outcome: bid the way their market prices. The business use case is served: vendors quote either a discount percentage or an absolute price per line, per configuration.
- **Oracle.** Observable proof that Quote Mode (Discount % or Price) did its job for the Vendor — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-013.
- **Trace.** P1 · manual · `FEAT-RFQ-013` · workbook sheet "8. RFQ"

#### PRD-RFQ-035 — Quote Mode (Discount % or Price): not available on the Growth plan

- **Why it matters.** The workbook limits Quote Mode (Discount % or Price) to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Vendor.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Vendor on the lower-plan tenant.
  2. Try it: use Quote Mode (Discount % or Price) to quote a discount percentage or an absolute price per line.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFQ-013` · workbook sheet "8. RFQ"

#### PRD-RFQ-036 — Quote Mode (Discount % or Price): refused for a user without the Vendor role

- **Why it matters.** The workbook names Vendor as the user of Quote Mode (Discount % or Price). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Vendor.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Quote Mode (Discount % or Price) to quote a discount percentage or an absolute price per line.
  3. Repeat as a Vendor.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Vendor can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Vendor.
- **Trace.** P1 · automate-later · `FEAT-RFQ-013` · workbook sheet "8. RFQ"

#### PRD-RFQ-037 — Baseline / Historical Price: happy path for the Buyer

- **Why it matters.** Protects negotiation position. Business use: A hidden baseline/historical price in the template lets the buyer benchmark bids without revealing targets.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Use Baseline / Historical Price to get what the story asks for: a baseline price in the template.
  3. Follow the business scenario the workbook gives: "A hidden baseline/historical price in the template lets the buyer benchmark bids without revealing targets".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: benchmark bids without revealing their target. The business use case is served: a hidden baseline/historical price in the template lets the buyer benchmark bids without revealing targets.
- **Oracle.** Observable proof that Baseline / Historical Price did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-014.
- **Trace.** P1 · manual · `FEAT-RFQ-014` · workbook sheet "8. RFQ"

#### PRD-RFQ-038 — Baseline / Historical Price: not available on the Growth plan

- **Why it matters.** The workbook limits Baseline / Historical Price to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Baseline / Historical Price to get a baseline price in the template.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RFQ-014` · workbook sheet "8. RFQ"

#### PRD-RFQ-039 — Baseline / Historical Price: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Baseline / Historical Price. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Baseline / Historical Price to get a baseline price in the template.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-014` · workbook sheet "8. RFQ"

#### PRD-RFQ-040 — Previous RFQ Terms Prefill: happy path for the Buyer

- **Why it matters.** Faster event setup. Business use: Setting up a new event; the buyer pulls in terms from a previous RFQ for the same product/commodity.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open RFQ.
  2. Pull previous RFQ terms into a new event.
  3. Follow the business scenario the workbook gives: "Setting up a new event; the buyer pulls in terms from a previous RFQ for the same product/commodity".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: set up events faster. The business use case is served: setting up a new event; the buyer pulls in terms from a previous RFQ for the same product/commodity.
- **Oracle.** Observable proof that Previous RFQ Terms Prefill did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RFQ-015.
- **Trace.** P1 · manual · `FEAT-RFQ-015` · workbook sheet "8. RFQ"

#### PRD-RFQ-041 — Previous RFQ Terms Prefill: not available on plans below Growth

- **Why it matters.** The workbook limits Previous RFQ Terms Prefill to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Previous RFQ Terms Prefill to pull previous RFQ terms into a new event.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RFQ-015` · workbook sheet "8. RFQ"

#### PRD-RFQ-042 — Previous RFQ Terms Prefill: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Previous RFQ Terms Prefill. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Previous RFQ Terms Prefill to pull previous RFQ terms into a new event.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RFQ-015` · workbook sheet "8. RFQ"

## 3. Integrations

#### PRD-RFQ-043 — Email Notifications: any workflow event: approval request, bid invitation, PO issued, etc

- **Why it matters.** Template customisation per module event is configurable in Admin. Required for the module: Yes (all modules).
- **Setup.**
  Integration INT-005 "Email Notifications" (Outbound) configured on the tenant; key parameters: email.provider (SES/SendGrid/SMTP), email.from_address, email.reply_to, email.template_overrides.
  Auth: API Key / SMTP.
- **Steps.**
  1. Make sure the integration is configured as in Setup.
  2. Cause the trigger: any workflow event: approval request, bid invitation, PO issued, etc.
  3. Compare the data on both sides.
- **Expected.** The integration runs for this trigger and exchanges: Notification content: recipient email, subject, body, action links, attachments.
- **Oracle.** The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.
- **Trace.** P1 · automate-later · `INT-005` · workbook sheet "28. Integration Catalog"

#### PRD-RFQ-044 — Email Notifications: on failure — failed emails retried 3x

- **Why it matters.** The Integration Catalog states how Email Notifications must fail: "Failed emails retried 3x; after failures, notification logged as 'undelivered'; fallback to in-app notification". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-005 "Email Notifications" (Outbound) configured on the tenant; key parameters: email.provider (SES/SendGrid/SMTP), email.from_address, email.reply_to, email.template_overrides.
  Auth: API Key / SMTP.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: any workflow event: approval request, bid invitation, PO issued, etc.
- **Expected.** The stated failure handling happens: failed emails retried 3x.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-005` · workbook sheet "28. Integration Catalog"

#### PRD-RFQ-045 — Email Notifications: on failure — after failures, notification logged as 'undelivered'

- **Why it matters.** The Integration Catalog states how Email Notifications must fail: "Failed emails retried 3x; after failures, notification logged as 'undelivered'; fallback to in-app notification". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-005 "Email Notifications" (Outbound) configured on the tenant; key parameters: email.provider (SES/SendGrid/SMTP), email.from_address, email.reply_to, email.template_overrides.
  Auth: API Key / SMTP.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: any workflow event: approval request, bid invitation, PO issued, etc.
- **Expected.** The stated failure handling happens: after failures, notification logged as 'undelivered'.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-005` · workbook sheet "28. Integration Catalog"

#### PRD-RFQ-046 — Email Notifications: on failure — fallback to in-app notification

- **Why it matters.** The Integration Catalog states how Email Notifications must fail: "Failed emails retried 3x; after failures, notification logged as 'undelivered'; fallback to in-app notification". A silent failure leaves the two systems out of step with nobody told.
- **Setup.**
  Integration INT-005 "Email Notifications" (Outbound) configured on the tenant; key parameters: email.provider (SES/SendGrid/SMTP), email.from_address, email.reply_to, email.template_overrides.
  Auth: API Key / SMTP.
- **Steps.**
  1. Configure the integration as in Setup.
  2. Make the external side fail or be unreachable.
  3. Cause the trigger: any workflow event: approval request, bid invitation, PO issued, etc.
- **Expected.** The stated failure handling happens: fallback to in-app notification.
- **Oracle.** Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.
- **Trace.** P2 · automate-later · `INT-005` · workbook sheet "28. Integration Catalog"
