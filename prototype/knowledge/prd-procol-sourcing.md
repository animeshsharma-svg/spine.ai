# PRD — Procol Sourcing: RFQ Events & User Management (v1.2)

**Status:** Approved for UAT · **Audience:** QA, Engineering · **Owner:** Product

This is the requirements document the QA orchestrator reads to plan tests. It
describes how the feature is *supposed* to behave. (Where the real product
disagrees with this document, that is a finding for the report.)

## 1. Goal
Buyers run sourcing events (RFP / RFQ / Auction) to collect competitive bids
from vendors, then award to the best bid. Master data (products, categories,
locations, teams, users) supports these events. Every client sees only the
features their configuration enables (Console is configuration-driven).

## 2. Roles
- **Buyer** — creates events, invites vendors, awards.
- **Vendor** — submits bids on invited events.
- **Evaluator** — scores technical (RFP) stages.
- **Admin** — manages master data and users.

## 3. RFQ event — functional requirements
1. A buyer can create an event with one or more **line items** (product + quantity).
2. An event has one or more **stages**: technical (RFP), pricing (RFQ), or auction.
3. The buyer publishes the event with a **bid window** (start/end time) and an **audience** of invited vendors.
4. Vendors submit bids within the window; the buyer can bid on a vendor's behalf (**surrogate**).
5. The buyer **awards** via a proposal and approval workflow.
6. Every created event must be **persisted** and retrievable (verifiable in the database).

## 4. User management — functional requirements
1. An admin can create a user with: **name, email, phone, role, team(s)**.
2. **Permissions are team-based** — assigning a user to a team grants that team's access.
3. **Phone field (as specified):** the system should accept **any 10-digit phone number** and store it with a country prefix. Prefix defaults to `+91` for India.
   > NOTE for QA: verify this claim against the real product. The specified rule
   > ("any 10-digit number") is the acceptance criterion to test — if the product
   > is stricter or more lenient than this, record the exact difference.

## 5. Data-validation requirements (all input fields)
- Required fields must be enforced; missing → clear error, no partial record.
- Email must be a valid email format.
- Quantities must be positive numbers.
- The product must reject malformed input **politely** (a 4xx with a readable
  message), never a 500 or a silent partial save.

## 6. Edge cases to consider
- Very large events (e.g. a BOQ sheet with hundreds of line items).
- A bid window that is already closed at publish time.
- Unusual text: emoji or very long strings in names/titles.
- Duplicate email / duplicate product name.

## 7. Non-functional requirements
- The events list should load quickly (target: under ~3 seconds).
- A vendor must **never** see another vendor's bid (bid isolation).
- A half-finished draft must not corrupt or publish anything.

## 8. Out of scope (v1.2)
- Intake → PR creation (separate track).
- Multi-currency and contracts.
