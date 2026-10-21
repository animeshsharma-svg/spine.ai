# Lessons: bidding, surrogate bids and which event a test must run on (21 October 2026)

Written from the night's runs (every point has a picture under `procol-ui-tests/evidence/combo-*`
or `walk-*`) and from the tester's own account of what goes wrong.

### Lesson: a vendor bids once — after a bid is in, that vendor's "Add Bid" is gone
On the participants list the buyer bids on a vendor's behalf through "Add Bid". Once that vendor
has a bid, the control disappears for them. A second surrogate bid must therefore name a
DIFFERENT vendor; a plan that bids twice for the same vendor cannot pass, and that is the
product's rule, not a defect.
Where: combo E4, 21 Oct 2026, place_surrogate_bid.

### Lesson: bids for N vendors need N vendors on the event
Two competing bids need two invited participants before publish: `invite_vendor{count: 2}` (or
`vendors: [names]`). The default invite puts ONE QA vendor on the event, so the second bid found
nobody. The runner now names as many QA test vendors as the case asks for; the planner lint raises
the invite count to the number of bids.
Where: combo E4 (eRFX rfq · 3 items · two-vendors), 21 Oct 2026.

### Lesson: no bid after the bidding window ends — unless the tenant allows surrogate bids post-expiry
A bid on a stage whose window has ended is refused ("Order not active", code 33). The one
exception is a SURROGATE bid on a tenant whose config `is_allowed_to_add_surrogate_bid_post_expiry`
is on (bids_controller.rb:50; default false). A case about bidding after expiry must say which
tenant and expect the refusal everywhere else.
Where: rules R-BID-019-1, R-DOC-018-3, R-MTR-039-5; tester's account, 21 Oct 2026.

### Lesson: a counter offer needs the vendor's own bid
The "Counter Offer" button on the Responses tab is DISABLED for a surrogate bid. A counter-offer
case starts from an event where the vendor has bid (the API-built "bid" state), never from a
surrogate bid placed in the same plan.
Where: combo E11, 21 Oct 2026 (picture: 15-place_counter_offer.png).

### Lesson: comparing, Master QCS and awarding need an event WITH BIDS — never "some" event from the list
A plan that searches the events list and opens whatever matches tests a random event in an
unknown state: an awarding case lands on an event with no bids, a participants case on one whose
vendors differ. Cases about Master QCS, Responses, Analytics, awarding or a proposal start from the
prepared state the API builds ("bid" for comparing and awarding, "proposal" for the proposal page),
opened by its route with `open_prepared`; or they create → publish → bid inside the same plan.
Where: tester's account and a failed screen case on RFX-18629, 21 Oct 2026.

### Lesson: the single-stage screen has no "Save as draft"
Only "Publish Event" is offered there; a draft needs the eRFX screen.
Where: combo S10, 21 Oct 2026.

### Lesson: BOQ line items arrive by upload
The BOQ create screen's Items control stays inert; items come from "Upload Sheet". No browser step
uploads a BOQ yet, so BOQ plans stop at the template.
Where: walk boq-draft, 21 Oct 2026.

### Lesson: a two-stage schedule must use one preset for both stages
A duration that is not a preset (45 minutes) landed on 60 for the technical stage and 30 for the
RFQ, and publish was refused with "RFP duration exceeds RFQ end time". Use the 30-minute preset;
`set_schedule` re-schedules every stage on it when the blocks disagree.
Where: walk create-erfx, 21 Oct 2026.
