# From award to purchase order — the order must carry exactly what was awarded

Deep cases for the hand-off from a final award to the purchase orders it creates: one order per awarded vendor, each
carrying that vendor's awarded quantity and its own price, on the lines it won and no others. The order is the document
the supplier ships against, so a quantity or price that differs from the award is a costly error. In Procol an order is
created when an awarded bid becomes "selected" — after a no-approval submit, or when the last approver approves
(`app/models/bid.rb:2190-2209`). Grounded in `procol-backend` at `origin/main` ae36e86894. Cases whose Trace names
`EVD3-S1` / `EVD3-S3` are run by `prototype/scripts/run-deep3.ts` on their OWN fresh QA_Platform_ events; the orders
are read back from Procol's database with SELECT (only the run's own records) and through the buyer's order page.

**Read before running.** Both demo clients route every award through an approval flow. The runner completes the award
only where an applicable flow has the signed-in buyer as approver on every step (PROCOL DEMO 198678 has such flows);
elsewhere the order cases are "not run" with that reason, never passed. What the code says about the order's numbers:
the order header copies the bid's quantity and price (`app/models/order.rb:289-321`); the order lines use the awarded
quantity when one was stored on the bid line (`app/models/concerns/bid_concern.rb:7-9`); the price breakup is recomputed
with the awarded quantity only when partial or over-awarding is enabled (`order.rb:369-388`).

## 1. Orders created by a final award

#### API-EVDAPO-001 — One order per awarded vendor, and none for a vendor that was not awarded
- **Why it matters.** A missing order means a supplier never receives the PO; an extra one means paying for goods nobody awarded.
- **Setup.** An award that is final: S1 split between three vendors (198678), or S3 line-wise between two vendors.
- **Steps.** 1. Approve the award to completion. 2. List the orders the event's round created.
- **Expected.** Exactly one order for each awarded vendor; none for the vendors left out.
- **Oracle.** `SELECT … FROM orders WHERE trade_request_id = <round>` — seller_company_id set = awarded vendors.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/models/bid.rb:2190-2209` · `app/helpers/api/proposal_helper.rb:308-338`

#### API-EVDAPO-002 — Each order's lines carry the awarded quantity
- **Why it matters.** A vendor awarded 10 of its quoted 30 units must be ordered 10.
- **Setup.** As API-EVDAPO-001.
- **Steps.** 1. Read each order's lines.
- **Expected.** The lines' quantities add up to exactly what that vendor was awarded, one line per awarded line item.
- **Oracle.** `order_items.quantity` per order = awarded_quantity.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/models/concerns/bid_concern.rb:7-9, 40-80`

#### API-EVDAPO-003 — Each order carries the vendor's own awarded unit price
- **Why it matters.** Two vendors on one split line have different prices; each order must carry its own.
- **Setup.** As API-EVDAPO-001 (single-line awards).
- **Steps.** 1. Read each order's price.
- **Expected.** The order's unit price is the price of that vendor's awarded bid.
- **Oracle.** `orders.price` = the vendor's submitted unit price.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/models/order.rb:289-321`

#### API-EVDAPO-004 — The order states the awarded quantity, not the quoted quantity
- **Why it matters.** The order header's quantity is what lists, reports and integrations read; if it shows the quoted 30 for an award of 10, the PO says 30.
- **Setup.** As API-EVDAPO-001; at least one vendor awarded less than it quoted (S1 on 198678).
- **Steps.** 1. Read each order's quantity.
- **Expected.** The order's quantity equals the awarded quantity.
- **Oracle.** `orders.quantity` = awarded quantity. Code reading: the header copies `bid.quantity` (the quoted quantity) — suspected to state the quoted quantity on every partial award.
- **Trace.** P0 · automate · `EVD3-S1` `EVD3-S3` · `app/models/order.rb:300-306` vs `app/models/concerns/bid_concern.rb:7-9`

#### API-EVDAPO-005 — Line-wise award: each vendor's order holds only the line it won
- **Why it matters.** A vendor that won line 1 must not be ordered line 2 at its (losing) line-2 price.
- **Setup.** S3: QA vendor 1 won line 1, QA vendor 2 won line 2; both had quoted both lines.
- **Steps.** 1. Read each vendor's bid lines after the award.
- **Expected.** The won line is "selected"; the vendor's other line is marked not awarded ("negotiated"); the order holds one line.
- **Oracle.** `bid_trade_products.status` 2 for the won line, 10 for the other; `order_items` count 1.
- **Trace.** P0 · automate · `EVD3-S3` · `app/helpers/api/proposal_helper.rb:1157-1176`

#### API-EVDAPO-006 — The buyer's order page shows the same quantity and price as the award
- **Why it matters.** The buyer reviews and releases the PO from this page.
- **Setup.** As API-EVDAPO-001 (S1).
- **Steps.** 1. As the buyer, open each order.
- **Expected.** Quantity (and, for single-line orders, price) as awarded.
- **Oracle.** `GET /orders/:id` → quantity / price.
- **Trace.** P1 · automate · `EVD3-S1` · `app/controllers/api/orders_controller.rb` (show)

## 2. Not run by the runner

#### API-EVDAPO-007 — An award that goes through a contract creates no order
- **Why it matters.** With contract forms on the award, the contract replaces the PO; an order as well would double the commitment.
- **Setup.** gate: `is_contract_creation_enabled`. An award that carries contract forms.
- **Steps.** 1. Submit the award. 2. List the round's orders.
- **Expected.** No order; a contract is created instead.
- **Oracle.** `orders` empty for the round; `proposal_helper.rb:152` passes `skip_order_creation: true`.
- **Trace.** P1 · manual · `app/helpers/api/proposal_helper.rb:148-166`

#### API-EVDAPO-008 — Without a vendor code, PO integration refuses the award instead of creating a broken order
- **Why it matters.** The ERP rejects a PO without a vendor code; the award must stop before that.
- **Setup.** gate: `is_po_integration_enabled`. An event from a PR; the awarded vendor has no vendor code; the company does not allow orders without a vendor code.
- **Steps.** 1. Award the vendor's bid.
- **Expected.** Refused: "Unable to create order, Vendor Code is not present."
- **Oracle.** 422 code 502.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:5203-5211`

#### API-EVDAPO-009 — Several POs on one bid each carry only their own lines
- **Why it matters.** `allow_multiple_po_on_same_bid` splits one bid into several POs (up to 20); quantities must not repeat across them.
- **Setup.** A round that allows several purchase orders on one bid (off at both demo clients today).
- **Steps.** 1. Close the bid twice with different line selections.
- **Expected.** Two orders whose lines do not overlap; the 21st is refused.
- **Oracle.** `orders` / `order_items`; code 17.
- **Trace.** P2 · manual · `app/models/order.rb:352-366` · `app/controllers/concerns/trade_controller_helper.rb:4857-4873`
