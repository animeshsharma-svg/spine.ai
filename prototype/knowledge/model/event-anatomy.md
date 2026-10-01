# How a sourcing event works in Procol

This is the platform's model of a sourcing event, written for someone who knows
procurement but not Procol's code. Every statement was read from Procol's own
code (backend and buyer dashboard, 1 October 2026); the exact file and line for
each one is in `prototype/src/model/anatomy.json` and in spine.ai's
`model_anatomy` table. Where something was inferred rather than seen running, it
says so.

## The idea in one paragraph

A buyer runs an **event** (Procol calls the container a project or event group)
to get prices from vendors for a list of **line items** (product, quality,
quantity, unit, delivery location). The event is made of one or more **stages**:
a technical round where vendors answer questions, a price round (RFQ) where they
quote, and/or an auction where they bid live against each other. Each stage is
built from a **template** that decides which columns or questions exist, who
fills each one, which are required and which are calculated. After bidding ends,
evaluators score the technical answers, the buyer compares prices, and an
**award proposal** picks the winning vendor(s), usually through an approval.

## The kinds of stage

- **Technical round (RFP).** Vendors answer the buyer's questions page by page
  (text, numbers, choices, documents). Evaluators score each page. Built from a
  *technical* template (Procol type "rfi").
- **Price quote round (RFQ).** Vendors quote a price per line item and may revise
  it until the end time. Built from a *pricing* template (Procol type "trade").
- **Auction.** Vendors bid live and see either their rank or the best price; the
  price keeps moving until the auction ends. Also built from a pricing template.
- **Auction made from an RFQ.** The RFQ's quotes become the opening bids of an
  auction. The RFQ is ended at that moment and locked; its products cannot be
  changed afterwards.

Stages are always ordered technical → RFQ → auction → auction-from-RFQ. When an
event is published, each stage's number is recalculated from that order.

**Buy or sell.** A *buy* template makes a reverse auction / normal RFQ (lower
price wins). A *sell* template makes a forward auction (higher price wins, e.g.
selling scrap). The direction is a property of the template, not of the auction
type.

## Which combinations are allowed

Allowed:
- RFQ only
- Technical only (a live technical-only event can later get an RFQ added, when
  the client has that switched on)
- Technical + RFQ — the technical round **must not end after the RFQ** (error
  712, "RFP duration exceeds RFQ end time. Please adjust."). It is checked when a
  stage is created, edited or extended, and again when the event is published;
  it is skipped for stages still in draft.
- RFQ → auction (convert the RFQ)
- Technical + RFQ → auction (composed from the rules, not run live)
- Direct auction
- Technical + direct auction (composed from the rules, not run live)

Not allowed:
- An RFQ and a direct auction side by side in one event. The screen blocks it
  and the purchase-request route refuses it — but the plain stage-create call
  does **not** check it. That is a gap worth testing.
- Two stages of the same kind in one event: refused on a live event (830); on a
  draft event the older one is silently replaced.
- On the screen, more than two stages.

## Auction types

Rank (vendors see only their own rank), price (vendors see the best price, no
ranks), rank and price, traffic light (buyer-set colour bands; the bands must be
valid), knockout (rounds; vendors who do not accept a round drop out), Dutch
(price moves step by step from a start price; the direction depends on buy or
sell), and book building. English auction and sealed bid are switches on a
stage, not types. In project mode, knockout and Dutch can only be created by
converting an RFQ.

## Statuses

**The event** is one of: draft, active (published), withdrawn, or inactive
(a discarded draft).

**A stage** is one of: draft, requested (waiting for approval to go live),
active, closed, withdrawn/inactive, cancelled (a draft stage that was dropped),
void (removed).

Important: **nothing changes status when bidding starts or ends.** "Upcoming",
"Open" and "Expired" are worked out from the clock every time someone looks.
A stage becomes *closed* only when every line item has been awarded, when a
technical round is fully evaluated, or when all its line items are deleted.
Technical rounds are never auto-closed by the clock.

What happens on publish: a stage that needs approval becomes *requested*; an
auction that must go to the client's auction team stays *draft* until that team
publishes it; otherwise it goes *active*. A start time already in the past is
moved to "now", keeping the same length.

What happens on withdraw: live stages become inactive, draft stages become
cancelled, and open proposals are withdrawn. Withdrawing is refused once an
award proposal has been submitted or selected (841). **A withdrawn draft cannot
be brought back** — cancelled stages drop out of the event and no "undo" exists.

## Time rules

- The real times of a stage live in its **schedules**: the bidding window, then
  the evaluation window ("extra closing time"), plus optional review windows.
  The stage's final close is the end of the last window.
- **Bids only while the stage is running.** A vendor bid before the start or
  after the end is refused ("Order not active", code 33). A revision after the
  end is refused too, except during a counter-offer window, for a bid waiting
  for justification, or a buyer editing a bid when the client allows it.
- **Surrogate bids** (the buyer types a bid on a vendor's behalf) are allowed
  before the start as well as while running, and after the end only when the
  event allows it.
- **Lock after submission.** When switched on, a vendor cannot revise a quote
  once submitted (875).
- **Anti-sniping (dynamic extension).** In an auction, a bid in the last N
  minutes that changes the top ranks (or improves the price) extends the auction
  (default 3 minutes). The trigger window must be at least 1 minute and at most
  half of the remaining time (501).
- **Extending the submission time.** The buyer can push the end time out. For a
  technical round that had closed, this reopens it. For an RFQ or auction whose
  time has already run out, it is a *reopen* and is refused (496) unless the
  user is Procol staff, or the client allows reopening (or allows it for super
  admins). Extending is refused once an award proposal exists (801). Knockout and
  Dutch auctions cannot be extended in project mode (969).
- **Rescheduling** (moving start and end together) is only possible before the
  stage has started (258).
- **Evaluation only in its window.** An evaluator can score only after the
  technical round's bidding has ended and while the stage is still active (33).
  Each score must be one of the event's score labels (e.g. 0–5); a zero needs a
  remark (code 2).
- **Award timing.** Only one award proposal per event (per lot) can be live at a
  time (573). When the client restricts closing to the evaluation window, a
  proposal cannot be created while bidding is still open (720). Submitting a
  proposal for approval closes any bidding still open. A proposal cannot be
  submitted if an awarded bid was revised afterwards (1126).
- **No general rule** was found that a start must be in the future or an end
  after the start on the server; the screen checks these ("Start time should be
  less than end time", "Start time cannot be less than the current time").
- **Recurring (scheduled) events** are copies of a template event made by a
  background job every day/week; they need the client switch
  `scheduled_events_enabled` (else 904).

## Who can do what

- **Buyer** — creates, edits, publishes, extends and withdraws events and creates
  award proposals; needs the "trade: create" permission and the event's company
  among the user's companies. Any refusal of this kind is code 455 (HTTP 422).
- **Evaluator** — a buyer-side user named as evaluator on the technical stage (or
  on a line item / vendor-assessment section). The evaluation endpoints check
  that assignment, not the normal permission system.
- **Vendor** — must be in the stage's audience (else 782) and allowed to bid for
  its company. Vendor companies skip the buyer permission checks entirely.
- **Surrogate (buyer bidding for a vendor)** — only a super admin, the event
  owner or a member of a team covering the event (165), and only if the event
  does not forbid surrogate bids (10). A second surrogate bid for the same vendor
  needs a client switch (99).
- **Approver** — matched by name, team role or company role on the approval
  workflow.
- **Super admin / Procol staff** — bypass most permission checks.
- Permission changes can take **up to 12 hours** to apply (they are cached).

## Templates: which ones a stage can use

- The screen asks for **technical templates** ("rfi") for a technical stage and
  for the vendor-assessment section, **pricing templates** ("trade") for an RFQ
  or auction, and **BOQ templates** ("boq") for the price stage of a BOQ project.
  Outside a BOQ project, BOQ templates are hidden.
- The list has Procol's **default** templates (unless the client hides them) and
  the client's **own** templates (custom ones; technical templates only if made
  after 30 July 2022; filtered by who they are shared with when the client
  switches template sharing on). The screen shows both lists as one menu with
  nothing pre-selected.
- A pricing template holds its fields as **line-item columns** (one value per
  product line) and **whole-bid fields** (once per bid, e.g. a gross total). A
  technical template holds **pages of questions**.
- Each field says **who fills it** (buyer or vendor), whether it is
  **required**, whether it is **calculated** (a formula, read-only), its
  **unit** and **decimals**, and for choice fields the **allowed values**.

## Who actually checks a field

This is the part that decides whether a wrong value can slip through:

- **Required buyer columns** on the price sheet are checked **only by the
  screen** when publishing ("Sheet partially filled, please check again."). The
  server does not check them, so an API call can skip them.
- **Required technical answers** are checked **by the server** when the vendor
  submits ("Please fill '<question>'", 572).
- **Numbers and decimals** are checked by the screen (it drops invalid values
  silently and rounds to the decimals); the server does not refuse extra
  decimals.
- **Choice lists** are offered by the screen; no server check that a submitted
  value is in the list was found.
- **Calculated fields** are computed by the screen and cannot be typed.
- **Bid limits are checked by the server**: price not above the price cap (38)
  or below the floor price (41); a revision must move by at least the tick size
  (214); quantity offered at least the minimum (39), equal to the requested
  quantity when fixed-quantity bidding is on (207), not above / below the
  requested quantity unless over / under quantity is allowed (138 / 139); a tie
  at the same landed price is refused when ties are off (98).
- **Buyer limits**: price cap, floor price and minimum quantity cannot be
  negative; the minimum quantity cannot exceed the requested quantity; a price
  cap cannot be lowered once set.

## Units — and why a line item is refused with "unit not present"

- Every line item must carry a **unit** (else 574 "Unit cannot be blank").
- The unit goes in as the quantity column's unit. The server lower-cases it and
  looks it up among **the client's units**: the client's own list, plus
  Procol-wide units — **unless material codification (or "company-only units")
  is switched on**, in which case only the client's own units count.
- Not found → the stage is refused: **"The unit <x> is not present" (495)**.
- On the screen, the unit list is the client's own units, and **choosing a
  product pre-selects the product's first linked unit**. Product-to-unit links
  are not limited to the client's own units, so a product can be linked to a
  unit that belongs to **another company**. With material codification on, that
  pre-selected unit is refused.
- **GMMCO (47053)** has material codification on, so only its own 276 units
  count. On 1 October 2026, **83 of its active products** were linked to a unit
  owned by another company that GMMCO does not have: "unit" ×52, "litre" ×19,
  "metre" ×6, "square metre" ×3, "kilometre" ×2, "gram" ×1. Any line item for
  those products in that unit fails with "The unit … is not present" unless the
  buyer changes the unit. That is the "unit not available" problem. The fix is
  data (link those products to GMMCO's own units, or add those symbols to
  GMMCO's unit list), not code. (Links to *deactivated* units do not count:
  a product's unit list skips them, and the server matches by symbol.)
- The same pattern exists on **Demo Account 2 (32461)** (84 products: "unit"
  ×43, "kg" ×15, "piece" ×15, "litre" ×14, "metre" ×1 — all owned by another
  company) and **PROCOL DEMO (198678)** (2 products in "litre").
- When the template has whole-bid price fields, **all line items must use the
  same unit** (486). A line item made from a purchase request must keep the
  request's unit (559).
- Demo Account 2 has **no "kg" unit at all**, while Procol's default pricing
  templates default to "KG". The screen sets the unit per line, so this is fine
  there; an API call that keeps "KG" (as the API test framework does) is refused.

## Server errors seen while reading templates

Opening some templates that the template list offers fails with an unexplained
server error (HTTP 500): on PROCOL DEMO "test template for event detailed",
"test_rfi_template" and "test_rfi_template_v2"; on Demo Account 2 "123". A
buyer who picks one of these cannot build a stage from it. These are defects
(an untyped 500 is always a defect).

## Where to look things up

- Per client, live: `GET /api/product-model/templates?c=<id>&type=rfq|rfp|auction|boq`
  (which templates this client really has for that stage),
  `GET /api/product-model/template?c=<id>&uuid=<template>` (its fields and rules),
  `GET /api/product-model/ask?c=<id>&q=<question>`.
- Rebuild: `cd prototype && npm run model:build -- --c 198678,32461,47053`.
