# Product test cases — 09. Reverse Auction (MOD-05)

Generated from `Procol Modules and Features.xlsx` by `prototype/scripts/import-product-knowledge.ts` — do not edit by hand; edit the workbook and run `npm run product:import`.

Module MOD-05 · 15 features · 46 cases · group `PRD-RA` · plan availability: Growth, Enterprise · status: GA

Real-time price discovery via live online auction events. Achieve best-price outcomes for high-value, commodity, or repeat procurement through competitive real-time bidding.

## 1. Core features

#### PRD-RA-001 — Vendor Selection into Auction: happy path for the Buyer

- **Why it matters.** Focused competition. Business use: Before the auction; the buyer selects which qualified vendors advance.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Choose which vendors advance to the auction.
  3. Follow the business scenario the workbook gives: "Before the auction; the buyer selects which qualified vendors advance".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: curate the live bidder set. The business use case is served: before the auction; the buyer selects which qualified vendors advance.
- **Oracle.** Observable proof that Vendor Selection into Auction did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-001.
- **Trace.** P0 · manual · `FEAT-RA-001` · workbook sheet "9. Reverse Auction"

#### PRD-RA-002 — Vendor Selection into Auction: not available on plans below Growth

- **Why it matters.** The workbook limits Vendor Selection into Auction to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Vendor Selection into Auction to choose which vendors advance to the auction.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-001` · workbook sheet "9. Reverse Auction"

#### PRD-RA-003 — Vendor Selection into Auction: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Vendor Selection into Auction. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Vendor Selection into Auction to choose which vendors advance to the auction.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-001` · workbook sheet "9. Reverse Auction"

#### PRD-RA-004 — TNA and Regret Gating: happy path for the Buyer

- **Why it matters.** Only qualified vendors compete. Business use: Technically-rejected and regretted vendors are gated out of bidding the relevant lines.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use TNA and Regret Gating to get what the story asks for: technically-rejected and regretted vendors barred from bidding those lines.
  3. Follow the business scenario the workbook gives: "Technically-rejected and regretted vendors are gated out of bidding the relevant lines".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: only qualified vendors compete. The business use case is served: technically-rejected and regretted vendors are gated out of bidding the relevant lines.
- **Oracle.** Observable proof that TNA and Regret Gating did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-002.
- **Trace.** P0 · manual · `FEAT-RA-002` · workbook sheet "9. Reverse Auction"

#### PRD-RA-005 — TNA and Regret Gating: not available on plans below Growth

- **Why it matters.** The workbook limits TNA and Regret Gating to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use TNA and Regret Gating to get technically-rejected and regretted vendors barred from bidding those lines.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-002` · workbook sheet "9. Reverse Auction"

#### PRD-RA-006 — TNA and Regret Gating: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of TNA and Regret Gating. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use TNA and Regret Gating to get technically-rejected and regretted vendors barred from bidding those lines.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-002` · workbook sheet "9. Reverse Auction"

#### PRD-RA-007 — Multiple Auction Strategies: happy path for the Buyer

- **Why it matters.** Strategy fit to category/market. Business use: The buyer picks an auction format (English/Dutch/Japanese/etc.) suited to the category and market.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Multiple Auction Strategies to get what the story asks for: multiple auction formats (English, Dutch, Japanese, and more).
  3. Follow the business scenario the workbook gives: "The buyer picks an auction format (English/Dutch/Japanese/etc.) suited to the category and market".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: pick the best format for the category. The business use case is served: the buyer picks an auction format (English/Dutch/Japanese/etc.) suited to the category and market.
- **Oracle.** Observable proof that Multiple Auction Strategies did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-004.
- **Trace.** P0 · manual · `FEAT-RA-004` · workbook sheet "9. Reverse Auction"

#### PRD-RA-008 — Multiple Auction Strategies: not available on plans below Growth

- **Why it matters.** The workbook limits Multiple Auction Strategies to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Multiple Auction Strategies to get multiple auction formats (English, Dutch, Japanese, and more).
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-004` · workbook sheet "9. Reverse Auction"

#### PRD-RA-009 — Multiple Auction Strategies: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Multiple Auction Strategies. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Multiple Auction Strategies to get multiple auction formats (English, Dutch, Japanese, and more).
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-004` · workbook sheet "9. Reverse Auction"

#### PRD-RA-010 — Auction Scope (Line/Lot): happy path for the Buyer

- **Why it matters.** Flexible competition scope. Business use: The auction runs at line-item or whole-lot level, ranking at both.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Auction Scope (Line/Lot) to get what the story asks for: auctions at line or lot level with rankings at both.
  3. Follow the business scenario the workbook gives: "The auction runs at line-item or whole-lot level, ranking at both".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: compete at the right granularity. The business use case is served: the auction runs at line-item or whole-lot level, ranking at both.
- **Oracle.** Observable proof that Auction Scope (Line/Lot) did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-005.
- **Trace.** P0 · manual · `FEAT-RA-005` · workbook sheet "9. Reverse Auction"

#### PRD-RA-011 — Auction Scope (Line/Lot): not available on plans below Growth

- **Why it matters.** The workbook limits Auction Scope (Line/Lot) to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Auction Scope (Line/Lot) to get auctions at line or lot level with rankings at both.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-005` · workbook sheet "9. Reverse Auction"

#### PRD-RA-012 — Auction Scope (Line/Lot): refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Auction Scope (Line/Lot). If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Auction Scope (Line/Lot) to get auctions at line or lot level with rankings at both.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-005` · workbook sheet "9. Reverse Auction"

#### PRD-RA-013 — Dynamic Time Extension: happy path for the Buyer

- **Why it matters.** Fair price discovery. Business use: Last-moment bids auto-extend the auction per configured anti-sniping rules.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Dynamic Time Extension to get what the story asks for: auctions to auto-extend on last-moment bids.
  3. Follow the business scenario the workbook gives: "Last-moment bids auto-extend the auction per configured anti-sniping rules".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: prevent sniping and ensure a fair close. The business use case is served: last-moment bids auto-extend the auction per configured anti-sniping rules.
- **Oracle.** Observable proof that Dynamic Time Extension did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-006.
- **Trace.** P0 · manual · `FEAT-RA-006` · workbook sheet "9. Reverse Auction"

#### PRD-RA-014 — Dynamic Time Extension: not available on plans below Growth

- **Why it matters.** The workbook limits Dynamic Time Extension to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Dynamic Time Extension to get auctions to auto-extend on last-moment bids.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-006` · workbook sheet "9. Reverse Auction"

#### PRD-RA-015 — Dynamic Time Extension: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Dynamic Time Extension. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dynamic Time Extension to get auctions to auto-extend on last-moment bids.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-006` · workbook sheet "9. Reverse Auction"

#### PRD-RA-016 — Price Caps and Tick Size: happy path for the Buyer

- **Why it matters.** Meaningful, bounded bidding. Business use: The buyer sets a starting price cap and minimum decrement (tick size) before the auction.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Price Caps and Tick Size to get what the story asks for: starting price caps and a minimum decrement (tick size).
  3. Follow the business scenario the workbook gives: "The buyer sets a starting price cap and minimum decrement (tick size) before the auction".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: control auction dynamics. The business use case is served: the buyer sets a starting price cap and minimum decrement (tick size) before the auction.
- **Oracle.** Observable proof that Price Caps and Tick Size did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-007.
- **Trace.** P0 · manual · `FEAT-RA-007` · workbook sheet "9. Reverse Auction"

#### PRD-RA-017 — Price Caps and Tick Size: not available on plans below Growth

- **Why it matters.** The workbook limits Price Caps and Tick Size to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Price Caps and Tick Size to get starting price caps and a minimum decrement (tick size).
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-007` · workbook sheet "9. Reverse Auction"

#### PRD-RA-018 — Price Caps and Tick Size: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Price Caps and Tick Size. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Price Caps and Tick Size to get starting price caps and a minimum decrement (tick size).
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-007` · workbook sheet "9. Reverse Auction"

#### PRD-RA-019 — Auction Time Controls: happy path for the Buyer

- **Why it matters.** Controlled, auditable timing. Business use: During a live auction; the buyer extends, shortens, or ends submission, logging a reason.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Extend, shorten, or end submission with a logged reason.
  3. Follow the business scenario the workbook gives: "During a live auction; the buyer extends, shortens, or ends submission, logging a reason".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: manage live timing accountably. The business use case is served: during a live auction; the buyer extends, shortens, or ends submission, logging a reason.
- **Oracle.** Observable proof that Auction Time Controls did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-009.
- **Trace.** P0 · manual · `FEAT-RA-009` · workbook sheet "9. Reverse Auction"

#### PRD-RA-020 — Auction Time Controls: reason logged

- **Why it matters.** The workbook records this edge case for Auction Time Controls: "Reason logged".
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup.
  2. Set up the situation the note describes: "Reason logged".
  3. Use Auction Time Controls to extend, shorten, or end submission with a logged reason.
  4. Observe how the feature handles the situation from step 2.
- **Expected.** Auction Time Controls behaves as the workbook states: "Reason logged".
- **Oracle.** The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against FEAT-RA-009 quoting the note.
- **Trace.** P2 · manual · `FEAT-RA-009` · workbook sheet "9. Reverse Auction"

#### PRD-RA-021 — Auction Time Controls: not available on plans below Growth

- **Why it matters.** The workbook limits Auction Time Controls to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Auction Time Controls to extend, shorten, or end submission with a logged reason.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-009` · workbook sheet "9. Reverse Auction"

#### PRD-RA-022 — Auction Time Controls: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Auction Time Controls. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Auction Time Controls to extend, shorten, or end submission with a logged reason.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-009` · workbook sheet "9. Reverse Auction"

#### PRD-RA-023 — Post-Auction Negotiation: happy path for the Buyer

- **Why it matters.** Continued negotiation leverage. Business use: After the auction closes; the buyer issues per-vendor counters in the QCS for final value.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Counter per vendor in the QCS after the auction.
  3. Follow the business scenario the workbook gives: "After the auction closes; the buyer issues per-vendor counters in the QCS for final value".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: extract final value. The business use case is served: after the auction closes; the buyer issues per-vendor counters in the QCS for final value.
- **Oracle.** Observable proof that Post-Auction Negotiation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-011.
- **Trace.** P0 · manual · `FEAT-RA-011` · workbook sheet "9. Reverse Auction"

#### PRD-RA-024 — Post-Auction Negotiation: not available on plans below Growth

- **Why it matters.** The workbook limits Post-Auction Negotiation to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Post-Auction Negotiation to counter per vendor in the QCS after the auction.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-011` · workbook sheet "9. Reverse Auction"

#### PRD-RA-025 — Post-Auction Negotiation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Post-Auction Negotiation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Post-Auction Negotiation to counter per vendor in the QCS after the auction.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-011` · workbook sheet "9. Reverse Auction"

#### PRD-RA-026 — Request for Best Offer in Auction: happy path for the Buyer

- **Why it matters.** Continued competition. Business use: A best-offer request is issued within the auction, re-locking bids on a revised offer.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Request for Best Offer in Auction to get what the story asks for: a best-offer request within the auction with bid re-lock.
  3. Follow the business scenario the workbook gives: "A best-offer request is issued within the auction, re-locking bids on a revised offer".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: extract final pricing. The business use case is served: a best-offer request is issued within the auction, re-locking bids on a revised offer.
- **Oracle.** Observable proof that Request for Best Offer in Auction did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-013.
- **Trace.** P0 · manual · `FEAT-RA-013` · workbook sheet "9. Reverse Auction"

#### PRD-RA-027 — Request for Best Offer in Auction: not available on plans below Growth

- **Why it matters.** The workbook limits Request for Best Offer in Auction to "Growth, Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on a plan below Growth (any plan not listed in "Growth, Enterprise") (Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Request for Best Offer in Auction to get a best-offer request within the auction with bid re-lock.
  3. Repeat on a tenant on Growth.
- **Expected.** On a plan below Growth (any plan not listed in "Growth, Enterprise") the capability is not available to use. On Growth the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Growth.
- **Trace.** P1 · automate-later · `FEAT-RA-013` · workbook sheet "9. Reverse Auction"

#### PRD-RA-028 — Request for Best Offer in Auction: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Request for Best Offer in Auction. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Growth (lowest plan with access; Plan Required: Growth, Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Request for Best Offer in Auction to get a best-offer request within the auction with bid re-lock.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-013` · workbook sheet "9. Reverse Auction"

## 2. Optional features

#### PRD-RA-029 — Loading Factors: happy path for the Buyer

- **Why it matters.** Comparable rankings despite gaps. Business use: Loading factors (template-defined) normalize bids for ranking, auto-applied for non-bidders.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Loading Factors to get what the story asks for: loading factors applied to bids for ranking.
  3. Follow the business scenario the workbook gives: "Loading factors (template-defined) normalize bids for ranking, auto-applied for non-bidders".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: compare vendors on a normalized basis. The business use case is served: loading factors (template-defined) normalize bids for ranking, auto-applied for non-bidders.
- **Oracle.** Observable proof that Loading Factors did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-003.
- **Trace.** P1 · manual · `FEAT-RA-003` · workbook sheet "9. Reverse Auction"

#### PRD-RA-030 — Loading Factors: not available on the Growth plan

- **Why it matters.** The workbook limits Loading Factors to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Loading Factors to get loading factors applied to bids for ranking.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RA-003` · workbook sheet "9. Reverse Auction"

#### PRD-RA-031 — Loading Factors: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Loading Factors. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Loading Factors to get loading factors applied to bids for ranking.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-003` · workbook sheet "9. Reverse Auction"

#### PRD-RA-032 — Cost-Breakdown Auction: happy path for the Buyer

- **Why it matters.** Granular award from lot competition. Business use: Vendors compete on lot price then provide a line-item breakup so the buyer can split award and share-of-business.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Cost-Breakdown Auction to get what the story asks for: vendors to compete on lot price then break it down.
  3. Follow the business scenario the workbook gives: "Vendors compete on lot price then provide a line-item breakup so the buyer can split award and share-of-business".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: split award and share-of-business. The business use case is served: vendors compete on lot price then provide a line-item breakup so the buyer can split award and share-of-business.
- **Oracle.** Observable proof that Cost-Breakdown Auction did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-008.
- **Trace.** P1 · manual · `FEAT-RA-008` · workbook sheet "9. Reverse Auction"

#### PRD-RA-033 — Cost-Breakdown Auction: not available on the Growth plan

- **Why it matters.** The workbook limits Cost-Breakdown Auction to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Cost-Breakdown Auction to get vendors to compete on lot price then break it down.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RA-008` · workbook sheet "9. Reverse Auction"

#### PRD-RA-034 — Cost-Breakdown Auction: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Cost-Breakdown Auction. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Cost-Breakdown Auction to get vendors to compete on lot price then break it down.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-008` · workbook sheet "9. Reverse Auction"

#### PRD-RA-035 — Auction Team Permissions: happy path for the Tenant Admin

- **Why it matters.** Separation of duties. Business use: Where a dedicated auction team runs auctions; the buyer drafts and hands off with proper permissions.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the tenant described in Setup and open Reverse Auction.
  2. Use Auction Team Permissions to get what the story asks for: a dedicated auction team with handoff permissions.
  3. Follow the business scenario the workbook gives: "Where a dedicated auction team runs auctions; the buyer drafts and hands off with proper permissions".
  4. Check the result against the story's promised outcome.
- **Expected.** The Tenant Admin achieves the story's outcome: specialists can run auctions with proper separation. The business use case is served: where a dedicated auction team runs auctions; the buyer drafts and hands off with proper permissions.
- **Oracle.** Observable proof that Auction Team Permissions did its job for the Tenant Admin — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-010.
- **Trace.** P1 · manual · `FEAT-RA-010` · workbook sheet "9. Reverse Auction"

#### PRD-RA-036 — Auction Team Permissions: not available on the Growth plan

- **Why it matters.** The workbook limits Auction Team Permissions to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Tenant Admin.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Tenant Admin on the lower-plan tenant.
  2. Try it: use Auction Team Permissions to get a dedicated auction team with handoff permissions.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RA-010` · workbook sheet "9. Reverse Auction"

#### PRD-RA-037 — Auction Team Permissions: refused for a user without the Tenant Admin role

- **Why it matters.** The workbook names Tenant Admin as the user of Auction Team Permissions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Tenant Admin.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Auction Team Permissions to get a dedicated auction team with handoff permissions.
  3. Repeat as a Tenant Admin.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Tenant Admin can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Tenant Admin.
- **Trace.** P1 · automate-later · `FEAT-RA-010` · workbook sheet "9. Reverse Auction"

#### PRD-RA-038 — Serial / Sequential Lot Auctions: happy path for the Buyer

- **Why it matters.** Better price discovery per lot. Business use: Lots run live one-by-one to focus bidder attention and improve per-lot discovery.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Serial / Sequential Lot Auctions to get what the story asks for: lots to run one-by-one.
  3. Follow the business scenario the workbook gives: "Lots run live one-by-one to focus bidder attention and improve per-lot discovery".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: focus bidder attention and improve per-lot discovery. The business use case is served: lots run live one-by-one to focus bidder attention and improve per-lot discovery.
- **Oracle.** Observable proof that Serial / Sequential Lot Auctions did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-012.
- **Trace.** P1 · manual · `FEAT-RA-012` · workbook sheet "9. Reverse Auction"

#### PRD-RA-039 — Serial / Sequential Lot Auctions: not available on the Growth plan

- **Why it matters.** The workbook limits Serial / Sequential Lot Auctions to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Serial / Sequential Lot Auctions to get lots to run one-by-one.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RA-012` · workbook sheet "9. Reverse Auction"

#### PRD-RA-040 — Serial / Sequential Lot Auctions: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Serial / Sequential Lot Auctions. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Serial / Sequential Lot Auctions to get lots to run one-by-one.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-012` · workbook sheet "9. Reverse Auction"

#### PRD-RA-041 — Dummy Quote Auto-Generation: happy path for the Buyer

- **Why it matters.** Consistent auction ranking. Business use: Dummy quotes are generated for non-bidding/regretted/TNA vendors so rankings stay complete.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Dummy Quote Auto-Generation to get what the story asks for: dummy quotes generated for non-bidders.
  3. Follow the business scenario the workbook gives: "Dummy quotes are generated for non-bidding/regretted/TNA vendors so rankings stay complete".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: auction rankings stay complete. The business use case is served: dummy quotes are generated for non-bidding/regretted/TNA vendors so rankings stay complete.
- **Oracle.** Observable proof that Dummy Quote Auto-Generation did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-014.
- **Trace.** P1 · manual · `FEAT-RA-014` · workbook sheet "9. Reverse Auction"

#### PRD-RA-042 — Dummy Quote Auto-Generation: not available on the Growth plan

- **Why it matters.** The workbook limits Dummy Quote Auto-Generation to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Dummy Quote Auto-Generation to get dummy quotes generated for non-bidders.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RA-014` · workbook sheet "9. Reverse Auction"

#### PRD-RA-043 — Dummy Quote Auto-Generation: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Dummy Quote Auto-Generation. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Dummy Quote Auto-Generation to get dummy quotes generated for non-bidders.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-014` · workbook sheet "9. Reverse Auction"

#### PRD-RA-044 — Enhanced Rank-Based Auction Logic: happy path for the Buyer

- **Why it matters.** Accurate competitive ranking. Business use: Refined rank-based logic governs ranking beyond raw price.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the tenant described in Setup and open Reverse Auction.
  2. Use Enhanced Rank-Based Auction Logic to get what the story asks for: refined rank-based logic beyond raw price.
  3. Follow the business scenario the workbook gives: "Refined rank-based logic governs ranking beyond raw price".
  4. Check the result against the story's promised outcome.
- **Expected.** The Buyer achieves the story's outcome: rankings are fair. The business use case is served: refined rank-based logic governs ranking beyond raw price.
- **Oracle.** Observable proof that Enhanced Rank-Based Auction Logic did its job for the Buyer — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against FEAT-RA-015.
- **Trace.** P1 · manual · `FEAT-RA-015` · workbook sheet "9. Reverse Auction"

#### PRD-RA-045 — Enhanced Rank-Based Auction Logic: not available on the Growth plan

- **Why it matters.** The workbook limits Enhanced Rank-Based Auction Logic to "Enterprise". A tenant on a lower plan must not get it, or plan packaging is not enforced.
- **Setup.**
  Persona: Buyer.
  Plan: tenant on the Growth plan (Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as a Buyer on the lower-plan tenant.
  2. Try it: use Enhanced Rank-Based Auction Logic to get refined rank-based logic beyond raw price.
  3. Repeat on a tenant on Enterprise.
- **Expected.** On the Growth plan the capability is not available to use. On Enterprise the same steps work.
- **Oracle.** Same user role, same steps, different plan: refused or absent on the lower plan, available on Enterprise.
- **Trace.** P1 · automate-later · `FEAT-RA-015` · workbook sheet "9. Reverse Auction"

#### PRD-RA-046 — Enhanced Rank-Based Auction Logic: refused for a user without the Buyer role

- **Why it matters.** The workbook names Buyer as the user of Enhanced Rank-Based Auction Logic. If any role can do it, the intended separation of duties is gone.
- **Setup.**
  Persona: a user who holds none of these roles: Buyer.
  Plan: tenant on Enterprise (lowest plan with access; Plan Required: Enterprise).
  Status: GA.
- **Steps.**
  1. Sign in as that user on the tenant described in Setup.
  2. Try it: use Enhanced Rank-Based Auction Logic to get refined rank-based logic beyond raw price.
  3. Repeat as a Buyer.
- **Expected.** The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the Buyer can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)
- **Oracle.** Same tenant, same steps, different role: refused or absent for the other user, available to the Buyer.
- **Trace.** P1 · automate-later · `FEAT-RA-015` · workbook sheet "9. Reverse Auction"
