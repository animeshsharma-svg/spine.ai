# Stress prompts for the events module (21 Oct 2026)

Paste one line at a time into **Run tests → UI** (PROCOL DEMO · UAT). Each is built to find a gap:
the note after the arrow says where the platform is expected to struggle. A pass that should not
be a pass (a plan that skips the hard part and goes green) counts as a finding too — read the plan
the compiler shows before trusting a green run.

## A. Create and publish, every shape

1. Create an eRFX project with one RFQ stage, 3 line items, invite 1 vendor and publish it. → baseline
2. Create an eRFX project with a technical stage and an RFQ stage, fill the questionnaire, assign an evaluator, 2 line items, and publish. → two-stage schedule (both stages must end together)
3. Create an eRFX project with a technical stage and an auction stage and publish it. → rfp + auction
4. Create an eRFX project with an auction stage and 5 line items and publish it. → bigger sheet
5. Create an eRFX project with 25 line items and publish it. → sheet filling at scale, scroll
6. Create an eRFX project with 70 line items and publish it. → the company's line-item ceiling (65 for non-BOQ): publish should be refused, not pass
7. Create an RFQ, add 3 line items, then remove 2 of them and publish. → remove_line_items on a fresh draft
8. Create an RFQ with 2 line items and save it as a draft, then find it under Drafts. → draft path
9. Create a single-stage RFQ with line-item awarding and publish it. → configuration drawer
10. Create a single-stage rank-based auction with lot awarding, 2 items, and publish it. → auction strategy
11. Create a single-stage price-based auction with line-item awarding and publish it. → strategy × awarding
12. Create a single-stage traffic-light auction with a green range of 80 to 120 and publish it. → range before Save
13. Create a single-stage RFP, fill the questionnaire, assign an evaluator and publish it. → the single-stage RFP screen (own evaluator select)
14. Create a single-stage RFQ and save it as a draft. → must be refused honestly: that screen has no Save as draft
15. Create a BOQ project, choose a BOQ template, add 2 line items and publish. → BOQ items arrive by upload only: expect "cannot be expressed", never a fake pass
16. Create an RFQ with one line item whose quantity is -5 and try to publish. → inline validation on a numeric cell
17. Create an RFQ with one line item whose quantity is "ten" and try to publish. → text in a number cell
18. Create an RFQ and publish it without choosing a template. → Participants and Publish stay locked
19. Create an RFQ and publish it without any line items. → "Please choose a template and add a product"
20. Create an RFQ with 2 line items and publish it without inviting any vendor. → publish blocked with no participants
21. Create an RFQ with a line item and publish it without a title. → title required
22. Create a technical stage only, add a questionnaire but no evaluator, and publish. → "Please add Evaluator"
23. Create an eRFX project with both an RFQ stage and an auction stage. → impossible composition: must be refused/reshaped, never composed

## B. Vendors, bids and the bidding rules

24. Create an RFQ with 2 line items, invite 2 vendors, place a surrogate bid for each and open Master QCS. → two invited, two distinct bids
25. Create an RFQ, invite 1 vendor, place a surrogate bid, then place a second surrogate bid for the same vendor. → Add Bid is gone after a bid: expect the refusal, not a second bid
26. Create an RFQ, invite 3 vendors and place surrogate bids for all three, then compare them on Master QCS. → three bids, vendor coherence
27. Create an RFQ, invite the vendor "QA_Platform Vendor 1" by name and place a surrogate bid for that vendor. → named vendor by search
28. Create an RFQ and invite the vendor "Acme Nonexistent Supplier" by name. → a name the search cannot find: falls back to invite-all, says so
29. Create an auction with one item, invite a vendor and place a surrogate bid of 100, then a revised bid of 90 for the same vendor. → revision on an auction
30. Create an RFQ with one item, invite a vendor, place a surrogate bid, close the event and try to place another surrogate bid. → no bid after the window (unless the tenant allows surrogate post-expiry)
31. Create a technical-only event, invite a vendor and place a surrogate bid. → surrogate bids are not possible on a technical stage: expect a refusal
32. Create an RFQ, publish it, convert it to a knockout auction and place a surrogate bid. → knockout forbids surrogate bids
33. Create an RFQ, invite a vendor, place a surrogate bid and send a counter offer of 90 to that vendor. → Counter Offer is disabled on a surrogate bid: expect the honest refusal
34. On an event where a vendor has already bid, send a counter offer of 90 and confirm it was sent. → prepared "bid" state, counter offer on the vendor's own bid
35. On an event where a vendor has already bid, send a counter offer and have the vendor accept it from the supplier portal. → vendor-portal step, QA vendor identity
36. On an event where a vendor has already bid, open the vendor's bid on the Responses tab and verify the bid price and total match what the API holds. → expect_api_value on bidPrice / bidTotal
37. Create an RFQ with 2 items, invite a vendor, place a surrogate bid, then reject that vendor's quote from the Responses tab. → reject participant flow

## C. Closing, awarding, proposal, PO

38. Create an RFQ with 3 line items, invite 1 vendor, place a surrogate bid and award that vendor. → the full chain with the wait for the window to close
39. On an event with bids in, start awarding, allocate every line to the vendor and check the counters read 3/3 items and 1/1 vendors. → counters with explicit values
40. On an event with bids in, start awarding and submit the proposal, then approve the award. → approval flow
41. On an event with an award proposal, open the proposal and submit it with the required remarks left empty. → required-field refusal on the proposal
42. On an awarded event, create a purchase order and check the PO lists the awarded items. → create_po + expect_po_items
43. On an event with bids in, award the vendor and then try to place another surrogate bid. → bidding after award
44. On an event with bids in, open Master QCS and verify the L1 vendor is the one with the lowest total. → comparison logic
45. On an event where a vendor has bid, close the event and open Master QCS before any award. → closed state, Start Awarding offered

## D. Live event actions, schedule, versions

46. Create an RFQ, publish it and extend the submission time by 30 minutes from the Settings menu. → extend bidding time
47. Create an RFQ, publish it and withdraw it with a remark. → withdraw needs a remark
48. Create an RFQ scheduled to start in 2 hours, publish it and reschedule it to start 4 hours from now. → upcoming-only Reschedule dialog
49. Create an RFQ, publish it, create a new version, remove one line item and publish the version. → BUG-86 territory (removing items blocks the version's publish)
50. Create an RFQ, publish it, create a new version and publish it without changing anything. → version keeps the stage schedule on one preset
51. Create a technical + RFQ project, publish it, create a new version and publish it. → the copy drops the evaluator and questionnaire (chained recovery)
52. Create an RFQ, publish it and convert it to an auction, then publish the converted auction. → conversion opens a new tab; continue there
53. Create an RFQ, publish it and convert it to a dutch auction with a price difference of 5. → dutch via conversion
54. Create an RFQ, set the bidding window to 3 minutes, publish it and wait for it to close, then confirm it shows under History. → the smallest preset is 30 min: the app keeps 30; the plan must report that honestly
55. Create an RFQ, publish it and force-close it now from the Settings menu. → "End" needs trade_force_close on the tenant: expect it to be absent on PROCOL DEMO

## E. The list, search and navigation

56. Open the events list and search for an event titled "this title does not exist anywhere". → empty state, no random row click
57. Open the events list, switch to History and open the first closed event's Master QCS. → navigation on an existing closed event
58. Create an RFQ, publish it, go back to the events list and open the same event by its title. → find the plan's own event, not another
59. Open the Drafts tab and open a draft that has a technical stage. → reopen a two-stage draft
60. Open the events list, switch to Recurring and confirm the tab lists recurring events or an empty state. → recurring tab

## F. Honesty traps (a green run here is a false positive)

61. Create an RFQ and verify the vendor receives an email invitation. → no mail step exists: must be "cannot be expressed"
62. Create an RFQ and verify the event is visible to a buyer in another company. → needs a second company: must be refused
63. Create an RFQ, publish it and check the vendor sees the bid count. → vendor-portal visibility: refused or partial, never silently passed
64. Create an RFQ and check that the audit log records the publish. → no audit-log step: must be refused
65. Create an auction where the price cap is 50 and place a surrogate bid of 60. → price cap step missing on eRFX: expect partial with the gap named
66. Create an RFQ with a lot-based award and two lots. → lots have no browser step: expect "cannot be expressed"

## How to read the results

- **Passed with every step you asked for** → real coverage.
- **"Only part of this case can be tested"** → read the gap; the plan ran without the hard part.
- **Refused by the app with its own message** (title required, evaluator missing, no participants) → the product's rule, captured with a picture.
- **A failure at `invite_vendor`, `place_surrogate_bid` or `open_event`** → a platform bug: report it with the session link.
