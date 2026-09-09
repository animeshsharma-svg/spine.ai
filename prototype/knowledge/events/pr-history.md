# Events Module — PR/Commit History Digest

Mined from local git history of `procol-client-dashboard` (frontend) and `procol-backend`
(backend) — `gh` was not installed in this environment, so no GitHub PR bodies, review
comments, or closed-issue data were available; everything below is reconstructed from
commit subjects and diffs (`git log` / `git show`) on the paths named in the brief:

- Frontend: `src/views/projectCreation`, `src/views/eventCreation`, `src/views/rfiBuilder`,
  `src/views/orderDetails`, `src/components/savingsDrawer`
- Backend: files/dirs matching `event_group`, `trade_request`, `line_item`, `audience`,
  `bid`, `award`

Both repos' commit history goes back to 2018, but GitHub PR-numbered squash-merges (the
`(#NNNN)` suffix, which is what `gh pr view <n>` would resolve if `gh` were available)
only start around **2023-02-21** in both repos. This digest covers PR-numbered commits
from that point through the current HEAD (~2026-09). Older, pre-2023 commits exist but
carry no PR reference and were out of scope for this pass.

Every entry below is a real commit found in `git log -p` on the paths above; nothing is
invented. Where a symptom or root cause is not explicit in the commit message, it is
inferred from the diff itself (noted inline). Severity is my judgment based on user
impact, not a field present in source control.

---

## 2023

### PR #111 — `fix: savings null check fix for RFI` (2023-04-06)
Savings drawer / RFI flow crashed with a runtime error when a reference-input strategy
key existed on `referenceInput` but not on `savingConfig`. Fix added the missing
intermediate null check (`savingConfig[currentPrice] && savingConfig[currentPrice][key]`).
**Regression case:** open the savings drawer on an RFI-derived event with a mismatched
reference/strategy key combination — must not crash.

### PR #78 — `fix: savings strip not rendering after surrogate bid` (2023-04-12)
Placing a surrogate bid on a vendor's behalf didn't re-fetch aggregate savings, so the
savings strip stayed stale until a manual refresh. Fix added `fetchAggregateSavings(tradeId)`
to the post-submit `.finally`.
**Regression case:** place a surrogate bid, check the savings strip updates without a
page refresh.

### PR #400 — `fix: egli mapping issue in rfq to auction` (2023-08-15)
Converting RFQ → Auction explicitly nulled `event_group_line_item_uuid` on the recreated
product, severing the line-item lineage link between the RFQ and the new Auction.
**Regression case:** convert a completed RFQ to Auction, verify every line item's EGLI
mapping still points to its RFQ origin.

### PR #402 — `fix: wrong payload for global widgets in rfq to auction` (2023-08-16)
`selectFullyRecreationalGlobalWidgets` fell back to `{}` instead of `[]`, mismatching the
array shape expected by the RFQ→Auction payload builder.
**Regression case:** convert an RFQ with global formula widgets to Auction, verify global
field values carry over with no type errors.

### PR #408 — `fix: switching to TL event while moving to auction` (2023-08-17)
The RFQ→Auction conversion reused a generic `defaultWidgets` selector instead of a
dedicated `selectRfqToAuctionWidgets`, so TL (template) events got the wrong widget set.
**Regression case:** convert a TL/template-based RFQ to Auction, verify widgets match the
template exactly.

---

## 2024

### PR #2958 — `fix: everyone audience issue in projects` (backend, 2024-01-03)
Selecting "Everyone" (i.e. an empty/blank audience list) as the audience on draft project
activation was silently ignored, because the assignment was gated on
`data[:audience_company_ids].present?` — which is false for an intentionally empty array.
**Regression case:** explicitly choose "Everyone" as audience on a draft, activate, verify
all eligible vendors are included.

### PR #3909 — `fix: rank update in rejected bid` (backend, 2024-04-02)
Rejecting a surrogate bid could leave a stale `buyer_rank` in `event_score_for_participants`
because the code always wrote whatever `trade.get_score(self)` returned instead of
deleting the key when no score existed anymore.
**Regression case:** place then reject a surrogate bid, confirm no leftover rank data.

### PR #4208 — `Bugfix: category mapping customized audience fix` (backend, 2024-04-14)
Customized (category-based) audience resolution during project activation didn't receive
`trade_products` in its options hash, so it fell back to a company-wide default instead
of resolving per-stage, per-category audiences.
**Regression case:** multi-stage project with different product categories per stage +
category-based vendor mapping — each stage's audience must reflect its own categories.

### PR #1738 — `fix: sorting line items in lot creation` (2024-07-03)
Lot creation payload used a possibly-stale cached `tradeProductIds` order instead of the
live sorted `tableData`, so line items could be submitted out of order.
**Regression case:** reorder line items in the split-lot drawer, submit, verify order
matches what was shown.

### PR #1739 — `fix: race condition in lot creation` (2024-07-03)
`createSplitEvent` returned the raw API response instead of a stable `lotKey`, so
concurrent lot-creation calls couldn't be reliably correlated back to the correct lot in
the reducer.
**Regression case:** create two lots in quick succession, verify each lot's UI state
updates only from its own response.

### PR #1945 — `fix: approval flows not visible in approval flow selection` (2024-08-21)
Auto-selection and summary-display logic in the approval flow selection modal was gated
on a transient `approvalSelectionModalVisible` flag that could be false at the moment
data loaded, hiding flows that had actually arrived.
**Regression case:** approval flow data loading slightly after modal open — flows must
still render once loaded.

---

## 2025

### PR #2756 — `fix: counter offer logs zero values handling` (2025-03-18)
Counter-offer log/selectors treated a genuine value of exactly `0` as absent, because
plain truthiness checks (`if (counter_offer_value)`) can't distinguish `0` from
`null`/`undefined`. Needed a dedicated `isExactZero` helper in two separate files.
**Regression case:** counter offer a component to exactly `0`, verify it shows correctly
in the log (not blank).

### PR #7014 — `Fix: PR quantity worker race condition` (backend, 2025-03-24)
Withdrawing an event group enqueued `UpdateInProgressQuantityWorker` from inside the
update service at the same moment bulk `update_all` calls changed
`PurchaseRequestTradeMapping` status — a race that could leave the source PR's
in-progress quantity stale. Fixed by moving the enqueue into an `after_update_commit`
callback on `EventGroup`, so it only fires post-commit.
**Regression case:** withdraw an event group generated from a PR, verify the PR's
in-progress quantity is correctly recalculated with no race.

### PR #2768 — `fix: prevent counter-offer modal from closing on backend error` (2025-03-26)
The counter-offer modal closed on `.finally` regardless of whether the backend call
actually succeeded, silently discarding the buyer's edits on a failed submission.
**Regression case:** force a counter-offer API failure, verify the modal stays open with
the entered data and shows the error.

### PR #2811 — `fix: counter offer validation for selected line item` (2025-04-04)
Bulk counter-offer validation ran against all *changed* row indexes rather than only
those the user had actually *selected*, conflating "edited" with "selected for this
counter offer."
**Regression case:** edit values on both selected and unselected rows in a bulk
counter-offer flow — only selected rows should be validated/submitted.

### PR #2948 — `fix: savings in rfq to auction` (2025-05-09)
Savings figures were wrong/missing after RFQ→Auction conversion because the standard
savings-normalization logic never handled the conversion API's different payload shape
(`lot_reference_prices` / `line_item_reference_prices`). A new
`getNormalizedSavingsData` helper had to be written specifically for this path.
**Regression case:** run an RFQ with reference prices to completion, convert to Auction,
verify savings drawer figures are correct immediately.

### PR #8633 — `fix: reject bid lot handling` (backend, 2025-08-01)
Bid rejection on a lot-split event used event-group-wide participant/vendor data instead
of the specific lot's own data — both the eligibility check
(`proposal_created_for_vendor?`) and the layer/vendor display defaulted to the
ungrouped, whole-event-group precomputed data.
**Regression case:** split an event into 2+ lots with different participant sets, reject
a bid on one lot's vendor — must use that lot's own participant data.

### PR #9524 — `fix: stale data update for misc in trade` (backend, 2025-09-15)
Concurrent bid submissions on the same trade request could lose each other's writes to
`trade_request.misc` (bid_company_ids, precomputed data), because the code read
`trade.misc` off an already-loaded, possibly-stale in-memory object rather than
re-fetching from the DB immediately before the read-modify-write.
**Regression case:** submit two bids from different vendors on the same line item nearly
simultaneously — both must persist in `misc`, neither silently dropped.

### PR #9783 — `fix: double draft auction creation in rfq to auction` (backend, 2025-09-29)
No uniqueness validation existed to stop a second auction being created for a parent
trade request that already had one via `move_to_auction` — a double-submit created two
draft auctions.
**Regression case:** double-submit "move to auction" for the same RFQ — only one auction
must be created; the second attempt gets a clear error.

### PR #3690 — `fix: product mapped audience in rfq to auction` (2025-10-07)
Product-level audience mapping was only populated for non-draft projects
(`!isProjectDraft` guard); RFQ→Auction conversion of a *draft* project left audience
blank. A new `getAudienceForDraftEvents` helper was added to cover this path.
**Regression case:** draft RFQ with product-mapped audience, convert to Auction while
still draft — audience must populate.

### PR #3707 — `fix: default object in savings column` (2025-10-09)
A savings-column data-shape migration (flat value → `{ budget: value }` object) wasn't
reflected in the fallback default used in three separate places in
`projectCreation.jsx`, breaking events created without an explicit savings column.
**Regression case:** create an event with no explicit savings column via direct creation,
from-PR, and RFQ-to-auction recreation — all three must produce the same correctly
shaped default.

### PR #3730 — `fix: single stage rfq to auction bugs` (2025-10-10)
Bundle of bugs specific to the single-stage RFQ→Auction path: mode not recognized as
auction, title incorrectly editable, draft-lock logic not applied — because several code
paths checked only `mode === ORDER_MODE.rfqToAuction` and missed the parallel
`isRFQtoAuction` flag used by this flow.
**Regression case:** single-stage RFQ converted via the single-stage entry point — check
mode, title lock, and stage editability all match the multi-stage conversion's rules.

### PR #10262 / PR #10371 — awarding proposal report quantity/share-of-business (backend, 2025-10-31 / 2025-11-06)
Two-part fix: the "Quantity Awarded" column and widget allow-list didn't branch on
`awarding_proposal_report_v2_enabled?`, so v2 companies read the wrong (v1) quantity
source (#10262); a week later, the same wrong-source bug was found still present in the
**Share of Business** percentage calculation, which hadn't been updated in the first pass
(#10371).
**Regression case:** on both v1 and v2 awarding-report companies, award partial
quantities across vendors on one line item and verify both "Quantity Awarded" and "Share
of Business" reconcile with the actual split.

### PR #10374 — `fix: stale snapshot data post bid rejection` (backend, 2025-11-07)
Bid rejection never re-triggered precomputation of the event's commercial-proposal
snapshot, so reports/UI kept showing pre-rejection data. Added
`get_latest_commercial_proposal` + a follow-up `precompute_event_snapshot` enqueue.
**Regression case:** reject a bid, immediately pull the event's commercial snapshot —
must reflect the post-rejection state.

### PR #10651 → #10709 (revert) → #10711 — stale `trade_request` association in bid precompute (backend, 2025-11-25, same day)
Three commits in one day on the exact same method (`Bid#precompute_bids_data_v2`):
`self.trade_request` was cached in a local variable before other code in the same
request updated the trade's misc/currency data, so precompute ran against stale data
after RFQ→Auction conversion. The first fix (`.reload` at the top of the method) broke
early-return cases (draft/approval-pending/revised bids) and was reverted within hours;
the corrected version moved the `.reload` to *after* the early-return guards.
**Regression case:** this is the single strongest signal in the whole history that this
method needs a permanent test matrix — draft bid, approval-pending bid, revised bid
(with/without refresh), active bid immediately post-RFQ-to-Auction-conversion, and
surrogate bid, all checked for both correctness and no unnecessary reload.

### PR #3998 — `Fix: Approval flow empty vendor state` (2025-12-02)
Expanding an approval item's vendor bid detail set the "expanded" UI state *before* the
`getBidForVendor` API call resolved, so the panel briefly rendered against stale/empty
data. Fixed by moving the state update into the `.then` after `unwrapResult`.
**Regression case:** expand a vendor bid's approval detail, verify no flash of
stale/empty state before real data loads.

### PR #4170 — `fix: savings comparison drawer when savings_comparison_on=lot_based` (2025-12-29)
`localSavingsColumn[currentStrategy]` was accessed without optional chaining;
`localSavingsColumn` itself could be `undefined` for lot-based comparison configs,
breaking the drawer entirely for those companies.
**Regression case:** company configured with `savings_comparison_on=lot_based`, open
savings comparison drawer on a multi-lot event.

---

## 2026

### PR #12026 → #12193 (revert) — lot-count validation and inactive trade products (backend, 2026-01-30 / 2026-02-09)
Buyers couldn't save a lot config or delete a line item when some trade products were
already inactive, because `validate_lot_config` compared the lot config's total (built
from *all* trade products) against a count that excluded inactive ones — a false "842"
mismatch error. The fix (drop the `where.not(status: :in_active)` filter) was itself
reverted ~10 days later, implying it broke a different, legitimately-rejected case.
**Regression case:** this pair is unresolved tension between two valid scenarios — (a)
lot save / line-item delete must succeed when a product went inactive mid-flow, and (b) a
genuinely mismatched lot config must still be rejected. Both cases belong in the
permanent suite regardless of which version of the validation is currently live.

### PR #12638 → #13725 (revert) — RFQ-then-Auction withdraw status propagation (backend, 2026-02-26 / 2026-04-21)
Withdrawing an RFQ-then-Auction child stage didn't reset the parent RFQ's
`is_rfq_converted_to_auction` flag, leaving the parent stuck thinking it was still
converted. The fix (`update_trade_request_rfq_then_auction` hook) was reverted wholesale
~2 months later — evidence the interaction with other withdraw-time status logic wasn't
fully understood before merging.
**Regression case:** withdraw an RFQ-to-Auction event at multiple points (before bidding,
after bidding, after approval) and confirm parent/child status + available next actions
stay logically consistent, independent of which fix version is deployed.

### PR #4691 — `fix: counter offer changed index data filtering` (2026-03-19)
"Edited row" detection for counter offer compared sheet rows purely by array index; any
reordering/refiltering of the sheet desynced the comparison, mis-flagging or missing
edited rows. Fixed by keying the comparison on `product.trade_product_uuid`.
**Regression case:** edit a row, then reorder/refilter the sheet before submitting for
counter offer — only the actually-edited product must be flagged.

### PR #4737 — `fix: Line-Lot Parsing Fix` (2026-03-25)
Select-bid submission with per-line-item award checkboxes sent only the *checked* rows,
silently dropping unchecked rows from the payload instead of marking them
`unchecked: true` — corrupting downstream lot/line parsing. `enableCheckboxes` also
wasn't resynced on modal reopen or `auctionClosingMode` change.
**Regression case:** uncheck some line items in Select Bid, submit — payload must include
the full line-item set with correct checked/unchecked flags.

### PR #4832 — `Fix: corrected the race condition in approval flows` (2026-04-09)
No Redux reset action existed for `approvalFlows`, so stale approval-flow data from a
previously viewed event could leak into a different event's approval flow selection UI.
Added `resetProjectApprovalFlows`.
**Regression case:** begin approval flow selection on event A without submitting,
navigate to event B — B's approval flows must never show A's data.

### PR #5263 → #5270 → #5334 → #5359 → #5416 → #5504 — the "event creation state" series (2026-06-16 through 2026-07-21)
**Six separate PRs in five weeks, all re-fixing variants of the same underlying bug
class in `projectCreation.jsx` / `rfiBuilder`:** a `useEffect` that recomputes and
overwrites per-stage draft data (technical/RFI answers, global section fields, invited
participants) fires on tab/stage switches or unrelated dependency changes, instead of
only when the data it's meant to derive from actually changes.
- **#5263 / #5270** (2026-06-16, same day): technical stage RFI data + global section
  reset when `isRfpEditAllowed` becomes true, recomputing from stale/wrong line-item
  sources.
- **#5334** (2026-06-25): the reset effect didn't exclude stages already hydrated from a
  saved draft (`draftStageIds`), so reopening a draft re-triggered the reset.
- **#5359** (2026-07-01): `currentStageId` was still in the effect's dependency array,
  so merely clicking between tabs re-ran the reset.
- **#5416** (2026-07-09): antd's `Tabs` used `destroyInactiveTabPane` unconditionally,
  unmounting (and losing) unsaved participant selections on every tab switch for draft
  events.
- **#5504** (2026-07-21): the same class of bug recurred in the RFI/RFP global section
  component (`trGlobalSection.jsx`), which kept its own local copy of global-section data
  that fell out of sync with the parent, requiring ~60 lines of new reconciliation logic.

**Regression case:** this is the single most repeated defect pattern in the entire
history. A QA platform should treat "open a multi-stage draft event, fill data on one
stage, switch tabs repeatedly, come back" as a standing, always-run check — covering
technical/RFI fields, global section fields, and participant selections — every time
`projectCreation.jsx` or `rfiBuilder/*` changes.

### PR #15595 — `Fix: clara-system-message-race-condition` (backend, 2026-08-18)
Email-triggered bid creation via the Clara AI chat integration could race with chat
identifier creation: `clara_chat_identifier` was lazily created and returned
inconsistently between the event-groups and bids controllers, so the AI's system message
could land in the wrong or a duplicate thread.
**Regression case:** trigger email-bid creation via Clara for an event with no prior chat
identifier — the AI response must land in exactly one, correctly identified thread.

### PR #15672 — `fix: audience anotate model` (backend, 2026-08-18)
Missing composite index (`audience_id`, `item_type`) on `audiences`, risking slow queries
/ timeouts on audience resolution at scale.
**Regression case:** performance check on audience lookups at scale — index usage,
response time.

### PR #15662 — `fix: rank to use current landed value instead of frozen landed_price` (backend, 2026-08-20)
Rank-relevant formula recalculation iterated `self.bid_products` instead of
`self.all_bid_products`, missing some bid products when recomputing global formulas —
so vendors could see a stale rank after a recalculation event (e.g. currency change).
**Regression case:** trigger a formula recalculation (currency change, global field
edit) after multiple vendors have bid — rank ordering must reflect the fresh landed
price for every vendor immediately.

### PR #15758 — `fix: prevent QCS report crash when no vendor has placed a bid` (backend, 2026-08-26)
QCS/auction report generation crashed for an event with zero bids: report-eligibility
didn't check `get_participant_vendor_company_ids.present?`, and downstream currency
formula generators assumed `currency_preferences` / `misc["currency_preferences"]` were
always non-nil.
**Regression case:** publish an event, invite vendors, ensure zero bids are placed,
request the QCS/auction report — must not 500.

---

## Recurring defect themes

These are the patterns that repeat across independent PRs, multiple authors, and (in
several cases) fix→revert→refix cycles on the *same line of code within hours or days*.
An autonomous QA platform for the Events module should treat each of these as a
standing, always-run probe rather than a one-off regression test — every time code
touches the module, not just when the originating PR is reopened.

1. **Draft/stage state clobbered by `useEffect` recomputation on unrelated
   dependency/tab changes** (the `projectCreation.jsx` series, 6 PRs in 5 weeks: #5263,
   #5270, #5334, #5359, #5416, #5504). The single hottest file in the frontend history.
   Probe: fill draft data on one stage, switch tabs/stages repeatedly, come back, verify
   nothing reset — for technical/RFI fields, global section fields, and participants
   independently.

2. **Stale in-memory ActiveRecord associations feeding `misc`/JSON-column
   read-modify-write in bid precomputation** (backend: #10651/#10709/#10711 same-day
   fix-revert-refix, #9524, #10374, #15662). A cached `self.trade_request` or
   `self.bid_products` reference goes stale mid-request when something else in the same
   flow updates the underlying row, and the write silently loses or misapplies data.
   Probe: run precomputation-triggering actions (bid, reject, RFQ-to-Auction convert,
   formula recalculation) in tight succession or concurrently and diff `misc`/rank/score
   before and after.

3. **RFQ-to-Auction conversion payload/state mismatches** (#400, #402, #408, #2948,
   #3690, #3730, #9783 backend). Nearly every aspect of the conversion — EGLI mapping,
   global widgets, widget selection, savings normalization, audience, mode detection,
   duplicate-creation guarding — has had at least one dedicated bug. Probe: full
   RFQ-to-Auction conversion (single-stage and multi-stage, draft and non-draft) with
   assertions on line-item lineage, global widgets, savings, audience, and idempotency of
   the "move to auction" action.

4. **Savings drawer/column null-safety and shape mismatches across flows** (#111,
   #3707, #4170, #2948). Savings code repeatedly breaks when a config key, strategy, or
   comparison mode isn't the one the reading code assumed, especially at data-shape
   migration boundaries. Probe: exercise every `savings_comparison_on` / closing-mode
   combination through creation, RFQ-to-Auction, and surrogate-bid paths.

5. **Counter-offer edit/validation tracking by array index instead of stable line-item
   identity** (#4691), **zero-value truthiness bugs** (#2756), and **error-swallowing on
   failed submission** (#2768, #2811). Probe: counter offer with reordering, zero
   values, partial selection, and forced backend failure, each as separate cases.

6. **Fix→revert→refix pairs on the same code within days**, indicating validation logic
   whose two required behaviors are in tension and were never both covered by a test
   (#12026/#12193 lot-count validation vs. inactive trade products; #12638/#13725
   RFQ-then-Auction withdraw status propagation). Probe: whenever a revert appears in
   history for this module, both the original bug and whatever the revert was protecting
   against must be captured as two permanent, co-located cases — not just the most
   recent one.

7. **Audience/participant resolution edge cases**: "everyone" as an empty selection
   being dropped (#2958), category-mapped audience missing `trade_products` context
   (#4208), lot-scoped vs. event-group-wide participant data for reject-bid checks
   (#8633), draft-only gating leaving RFQ-to-Auction audience blank (#3690). Probe:
   every audience-resolution path (everyone, category-mapped, product-mapped, lot-split)
   against every entry point (create, draft, activate, RFQ-to-Auction, reject).

8. **Reporting/awarding calculations reading the wrong quantity source or crashing on
   an empty/edge-case dataset** (#10262, #10371 v1-vs-v2 awarded quantity; #15758 QCS
   report crash on zero bids). Probe: generate every report (QCS, awarding proposal,
   NFA) for edge-case events — zero bids, partial awarding, v1 vs. v2 report
   configuration — and assert no crash plus correct source data.

Cross-cutting note: a large share of these defects are *null/undefined access* on a
value that changed shape or presence between two related code paths (frontend) or a
*stale/cached reference* re-read at the wrong point in a request (backend). Static
analysis or property-based fuzzing that specifically targets "this field can legitimately
be nil/empty/zero — does the code handle that?" would likely catch a meaningful fraction
of future events-module regressions before they ship.
