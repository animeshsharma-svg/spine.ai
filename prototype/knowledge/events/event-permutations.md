# Event permutations — what can be combined, how each combination is reached, and what to expect

Written 2026-09-11 from the product's own rules (`isValidStage`, `PROJECT_STAGES`, the create-screen contract) and from live runs. This is the map the compiler consults when a request names a combination: which combinations exist, which screen reaches them, which steps express them, and which are gated or only reachable by conversion.

## 1. Entry paths (the Create Event menu offers three on this tenant)

| Path | Screen | `open_create` arg | What it gives |
|---|---|---|---|
| eRFX Project | `/orders/quick-create?projectCreation=true` | `erfx` (default) | stage tabs; 1–2 stages; templates per stage; technical stages with vendor assessment |
| Single Stage | `/orders/quick-create?singleStage=true` | `single-stage` | one event, type chosen in a configuration drawer (RFQ / RFP / Auction), auction strategy and awarding rule set there |
| BOQ based RFX Project | `/orders/quick-create?projectCreation=true&boq=true` | `boq` | eRFX with BOQ line items (gated by `boq_in_erfx_allowed`; 500 line-item ceiling) |

## 2. Stage compositions on the eRFX screen

The screen arrives with **one Auction stage**. Rules: RFQ and Auction are mutually exclusive ("Remove Auction to add RFQ"); at most two stages; Delete is disabled while one stage remains.

| Composition | `compose_stages` | Notes |
|---|---|---|
| Auction only | `["auction"]` (default — may be omitted) | strategy is configured on the stage |
| RFQ only | `["rfq"]` | four moves internally: add Technical → delete Auction → add RFQ → delete Technical |
| Technical (RFP) only | `["rfp"]` | needs `fill_questionnaires` + `assign_evaluator` before publish |
| Technical + RFQ | `["rfp","rfq"]` | per-stage tabs: `switch_stage` before each stage's template/sheet/questionnaires |
| Technical + Auction | `["rfp","auction"]` | same per-stage pattern |
| RFQ + Auction | **impossible to compose** | reached only by **conversion** of a published RFQ (§4) |

Every stage needs a template (`select_template` on that tab); a stage with none fails savings validation. Two-stage timing: RFP bid-end must be ≤ RFQ bid-end.

## 3. Auction strategies

| Strategy | Where it is set | Step |
|---|---|---|
| Rank based (default) | single-stage configuration drawer; eRFX auction stage ("Rank on lot") | `configure_single_stage{eventType:"auction", auctionSubtype:"rank"}` |
| Price based | single-stage configuration drawer | `configure_single_stage{…, auctionSubtype:"price"}` |
| Traffic light | single-stage configuration drawer (rank-range / price-range variants; needs a "specified range" before Save) | `configure_single_stage{…, auctionSubtype:"traffic_light"}` |
| Knockout | eRFX: **only** via RFQ → Auction conversion. Single-stage: the configuration drawer **offers a Knockout radio** on PROCOL DEMO (captured 2026-09-11) — whether it is enabled is unverified | eRFX: `convert_to_auction`, then configure. Single-stage: `configure_single_stage{auctionSubtype:"knockout"}` is not wired yet |
| Dutch | eRFX: **only** via RFQ → Auction conversion (buy and sell price directions differ). Single-stage: the drawer **offers a Dutch Auction radio** (captured 2026-09-11) — enabled state unverified | as above |
| Traffic light — the specifics | drawer: "Group traffic light by: Price / Rank"; GREEN and YELLOW "Gross total less than" bounds (inclusive of price); the sheet then requires **Green (Inclusive Range)** and **Yellow (Inclusive Range)** per line item, or Publish stays put with no toast | `configure_single_stage{auctionSubtype:"traffic_light", rangeLower, rangeUpper}` fills both the drawer and the sheet |
| Book building | tenant-gated | not composable here |
| Basket auction | multi-product single event; forces line-item savings | `add_line_items{count ≥ 2}` on an auction |

On this build the strategy picker the executor can drive is the **single-stage** drawer. Setting the strategy on an eRFX auction stage has no step yet — say so (coverage partial) rather than substituting.

## 4. RFQ → Auction conversion

Preconditions: a **published** RFQ (`publish` + `expect_published`), on its project page, with the Settings control available. `convert_to_auction` opens Settings → Convert to Auction → Continue; the app opens the converted event's create screen in a **new tab** (`isRfqToAuction=true&draftStageIds=…`), which becomes the page for later steps. RFQ quotes carry over as starting bids. Knockout and dutch become available only here.

## 5. Awarding rules

| Rule | Where | Step |
|---|---|---|
| Entire lot to one vendor | single-stage drawer (`awarding:"lot"`); eRFX stage default | `configure_single_stage{…, awarding:"lot"}` |
| Line-item-wise (partially, multiple vendors) | single-stage drawer (`awarding:"line_item"`); eRFX per stage | `configure_single_stage{…, awarding:"line_item"}` |

Awarding itself (`award_event`) happens after bidding: Master QCS → Start Awarding → allocate (the vendor's own *Select All*) → Create Proposal → Submit Proposal. `expect_awarded` confirms. Awarding routes into an approval flow on some builds.

## 6. Bidding side

| Who bids | Step | Notes |
|---|---|---|
| The vendor, from the supplier portal | `place_bid{vendor?}` | vendor email/OTP login; `add-bid-button` → sheet → `submit-bid-button`; `expect_bid_submitted` |
| The buyer on the vendor's behalf (surrogate) | `place_surrogate_bid{vendor?}` | participants list → row by name → Add Bid → sheet; not available for knockout or dutch auctions, nor for technical stages (those use Add Technical Bid) |
| Two vendors competing | two `place_bid` / `place_surrogate_bid` steps with different `vendor` | the executor picks a different vendor for a second surrogate bid |
| Counter offer (buyer → vendor negotiation) | **no step yet** | the product has a buyer-side Counter Offer drawer on order details; vendor-side acceptance is not modelled. Report as a gap. |

Vendors must be **invited** before publish (`invite_vendor{names}`); suggestions come from the line items' product audience, so invite after line items. Name the vendor when the case cares which one bids (`AMD` is the default surrogate vendor).

## 7. Lifecycle after publish

Draft (`save_draft` — enabled only once a template and a line item exist) · Live (`publish`) · Scheduled for later (`set_schedule{minutes}` with a future start) · History (closed). Withdrawing a live event needs a remark. Extend submission deadline reopens the vendor window. `filter_events{tab}` + `expect_event_in_list` / `expect_event_status` verify where an event landed.

## 8. Valid combination grid (what a request can legitimately ask for)

entry ∈ {eRFX, single-stage, BOQ} × stages ∈ {auction, rfq, rfp, rfp+rfq, rfp+auction} × strategy ∈ {rank, price, traffic light | knockout, dutch via conversion} × line items ∈ {1…n; BOQ up to 500} × vendors ∈ {by name, by count} × bidding ∈ {vendor portal, surrogate, both, two vendors} × awarding ∈ {lot, line item} × outcome ∈ {publish, draft, schedule later, convert to auction, award}.

Not valid, and to be refused or reshaped by the linter: RFQ + Auction composed on one eRFX screen; a strategy on an RFQ or technical stage; a surrogate bid on a knockout/dutch auction or a technical stage; awarding before any bid; publishing a technical stage without questionnaires and an evaluator; saving a draft with no template or no line item.
