# Stored API plans run — the 34 repeated failures, read against plan + reply (10 Nov, first pass)

Read from the saved runs (plan, set-up recipe, expected outcome, the app's reply). Three buckets; every "real" still needs its request/reply pair attached before it goes on the bug sheet.

## A. Server errors — real by the platform's rule (a 5xx on any input is a defect), 10
API-EVDQRY-020 (POST /v1/chats with no event), -023 (unknown "regarding" with a line item), -056 (vendor picker without event id), -057 (vendor picker, unknown onboarding response), -061 (line-item picker, unknown event), -068 (filter options without event id); API-EVDREM-024 (resource_type sent as a list), -052 (garbled reminder id); API-EVDWGT-050 (weight list sent as text); API-BID-009 (the buying company bids on its own event → 500 instead of a refusal).

## B. Accepted where the case documents a refusal — plausible real, confirm each on a fresh event with the reply attached, 11
API-LC-005 (a withdrawn event can be activated again), API-LC-002 (withdraw with blank remarks accepted), API-BID-012 (a bid after revoking accepted), API-BID-010 (a second bid from the same company accepted — the case expects "Revise bid is locked"), API-EVDRJB-023 (unknown reject status accepted), API-EVDRJB-024 (reject without a status accepted), API-EVDRJB-019 (second vendor not blocked after rejection), API-EVDREM-022 (reminder read without resource type accepted), API-NBIDNEW-005 (open bid without currency_preference.name accepted), API-BID-028 (reject on a non-active bid accepted), API-EVRMBP-020 (another user reads a draft bid: 200 where the case expects 536).

## C. Plan premise, not the product — the set-up state or caller contradicts the case, 13
API-AWD-001/-002/-004/-020/-022 and API-DB-008 (set-up "awarded_rfq" already submitted the proposal, so "proposal already submitted" / "does not exist" / "cannot withdraw" are the product behaving correctly for that state; the plans need the closed-not-awarded recipe); API-EVDNFA-002 (same recipe issue); API-AUD-010 (needs a caller without view access; every run is the super admin; code 455 was inferred by the compiler); API-AWD-006 (inferred code, premise of a draft proposal held by the caller); API-BID-038 (needs a staggered event — DEMO's set-up is not staggered); API-EVDRJB-004/-005/-006 (read-back expects the round to count a second bid after re-bidding; the re-bid replaces the first, so "got 1" may be correct — read-back semantics to settle before any verdict).

Next: fix the awarded_rfq premise in the API planner's recipe choice (closed_rfq_with_bid for proposal-creation cases), rerun A and B on fresh events with `--plans-only --ids`, attach the pairs, then the bug sheet.
