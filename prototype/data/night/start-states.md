# Night of 10 Nov 2026 — starting states the API set-up builds (branch night/start-states)

Agent: start-states. Worktree /Users/animesh/Desktop/procol-night-start-states. Company PROCOL DEMO 198678 only,
SPINE_QA_VENDORS_ONLY=1, no browser, verification by API read-back (+ read-only SQL).

## 00:55 — baseline (scripts/_states-baseline.ts, no model, no network)

UI- cases the screen-case runner cannot start yet: 93 of 645 (552 buildable)
-  32  needs another user / second company / load            (not this agent's area)
-  29  purchase-request screens not in the screen model      (not this agent's area)
-  11  dutch / knockout auction
-   9  amended event (older version beside a newer one)
-   6  withdrawn event
-   3  client with vendor masking switched on
-   3  needs a vendor the event does not have (uninvited / second vendor)
→ in scope: 32 UI cases.

Sheet cases (1,096; 500 start from nothing; 575 built by API) that start from an unbuilt event: 21
-   9  live forward auction (SRC-SET-007)
-   5  withdrawn RFQ (SRC-SET-012)
-   4  RFQ made from a PR line (SRC-SET-010)
-   3  service RFQ (SRC-SET-013)
Partial builds carried as a note: 49 cases on "RFQ with two bids" (SRC-SET-002) get one QA vendor's bid, not two.

## Facts read from the app code (READ-ONLY repos)
- Withdraw an event = `PATCH /event_groups/:uuid {status:"withdrawn", withdraw_remark:{remarks, attachments:[]}}`
  (client-dashboard projectDetails/components/mutation.js useWithdrawProject; backend EventGroups::UpdateService). Event status enum: in_active 0, active 1, draft 2, withdrawn 3.
- Amend = `POST /item_versions {item_uuid, item_type:"EventGroup"}` (already the journey's `version` step) → a draft copy; the old event stops being `latest?`
  the moment the ItemVersion exists (versioning/methods.rb). Publishing the copy = PATCH /event_groups/:newUuid status active + amendment_remarks
  (`is_amendment_draft_event_published`). Gate: company config `is_event_versioning_enabled` (event_group.rb can_create_new_version?).
- Auction strategies: trade_requests.auction_config enum rank 0, price 1, rank_and_price 2, traffic_light 3, knockout 4, dutch 5, book_building 6.
  Procol has no "japanese" strategy: a Japanese (ascending-for-buyer / accept-the-price) auction is Procol's KNOCKOUT; dutch is the other.
  Fields (trade_controller_helper set_configurations_for_trade): knockout needs bulk_price>0, time_difference>=30 s, price_difference;
  dutch needs bulk_price, end_price, time_difference, price_difference, closing_mode single|multiple, is_auction_on_base_price;
  buy side: bulk_price <= end_price, price_difference <= end−bulk (errors 237/238/241–243/106/248); start+time_difference <= bid_end_time.
  On an eRFX company move_to_auction also checks L1 vs bulk/end (966/968) — creating the strategy on a fresh stage avoids that.
- Forward auction = trade order_type "sell" (enum buy 0, sell 1); `is_forward_auction?` = auction + auctioning + sell. Sent as configurations.order_type.
- Vendor masking is a per-TRADE config: `is_vendor_masking_enabled` is honoured only when the trade config carries
  `is_vendor_masking_allowed_for_everyone` or `…_except_super_admin` (company config via CustomConfiguration), or the company has `vendor_masking_true`
  (then every new trade is masked). mask_participant_name? = enabled for user AND round upcoming/running.

## 00:55 — DEMO facts probed by API (scripts/_probe-demo.ts)
- 4 QA vendors with logins on PROCOL DEMO (QA_Platform Vendor 1–4, qa_…@example.com) → a second bidder and an uninvited vendor exist.
- Company settings read (no change made): is_vendor_masking_allowed_for_everyone = true, …_except_super_admin = true (so masking is a
  per-round flag, no setting switch needed); is_event_versioning_enabled = true (hidden), allow_versioning_post_auction = true;
  rfx_project_enabled = true; vendor_masking_true not in the catalogue; disable_withdraw_during_submission_time = false.
- Read-only SQL: the UAT DB (agribid-uat-latest) stores created_at 5 h 30 min behind the true UTC (tonight's rows carry yesterday-evening
  stamps), and the API client renames every generated title to spine-API-automation-<n> as it sends it (the sandbox tag) — so events are
  matched by id, not title; verification is by API read-back (GET /event_groups/:uuid, GET /trade/:uuid).

## 01:00 — states built and verified live on PROCOL DEMO (ids masked; logs in data/night/build-*.log, not committed)
| state | build | read-back |
|---|---|---|
| withdrawn | live RFQ, then PATCH status withdrawn with remark; 18 s | GET event → status "withdrawn" |
| amended / amendment | live RFQ + QA vendor's bid (8,415), POST /item_versions, PATCH publish the copy with amendment_remarks; ~70 s | old event stages[0].ref_id RFQ-24264, is_latest_version on the event; new event RFQ-24264.1, status "active", amendment_remarks.remarks = "QA_Platform_… amendment issued by the API set-up" |
| two_bids | live RFQ, QA Vendor 1 bids, switch_vendor, QA Vendor 2 bids (both 3,536); ~110 s | journey made.bidUuid + bidUuidVendor2; integrity INV-COUNT "count says 1; 1 bid listed" per vendor view |
| dutch | auction_only round with auction_config dutch, bulk 3000 / end 4500 / tick 250 / 120 s, single closing, 2 QA vendors invited; ~40 s | GET /trade → auction_config "dutch", rfx_mode "auction", current_status "auctioning", order_type "buy" |
| knockout | same with auction_config knockout (Procol's Japanese auction) | GET /trade → auction_config "knockout" |
Observation for the integrity owners (not this agent's area): on two_bids the INV-ISOLATION check said QA Vendor 1's view shows QA Vendor 2's company
name — a possible masking leak between vendors on an unmasked RFQ; recorded, not re-confirmed.

## Routing after the uiCasePrep / sheet-table edits (scripts/_states-baseline.ts, no network)
UI unbuildable 93 → 61: the 32 in-scope cases (11 dutch/knockout, 9 amended, 6 withdrawn, 3 masking, 3 uninvited/second vendor) are all routed
to a state; 61 left = 32 "another user / second company / load" + 29 purchase-request screens (other agents' areas).
Sheet unbuildable 21 → 7 (9 forward + 5 withdrawn now build); 7 left = 4 PR-based RFQ + 3 service RFQ. The 49 "two bids" notes are gone:
SRC-SET-002 builds two_bids (two QA vendors' bids).
Pre-existing bug found: uiCasePrep's title check `/on an old version|old version/` carried literal backspace characters (\x08) where \b was
meant — it never matched. Replaced.

## 01:35 — all states built once on PROCOL DEMO and read back (ids masked; build logs data/night/build-*.log stay local)
Verification = GET /event_groups/:uuid and GET /trade/:uuid through the buyer's guarded sender, plus read-only SELECTs
(scripts/_states-verify.ts <title>) on the UAT database. The app renamed every event to spine-API-automation-<n> on send (the sandbox tag);
the context now carries that shown title (values.requestedTitle keeps the QA_Platform_UI_… one).

| state | built in | API read-back | SQL read-back |
|---|---|---|---|
| withdrawn | 18 s | event status "withdrawn", stage RFQ-24251 in_active, is_latest true | event_groups.status 3, trade status 0, remark withdraw_project_remark = the set-up's remark |
| amended | ~70 s | old event is_latest_version FALSE, stage RFQ-24264 active with 1 bid; new event RFQ-24264.1 active, amendment_remarks.remarks "QA_Platform_… amendment issued by the API set-up" | item_versions row item → new, status 1, version_order 1; ref_id RFX-20505 / RFX-20505.1; remark EventGroup_amendment stored |
| amendment | ~70 s | same build, context opens the NEW version (RFQ-24305 → RFQ-24305.1 active) | as above |
| two_bids | ~110 s | participants_data total_participants 2, total_bids 2 (QA Vendor 1 and QA Vendor 2, 3,536 each) | — |
| two_invited | ~25 s | total_participants 2, total_bids 0 | — |
| uninvited | ~25 s | total_participants 1 (QA Vendor 1); context vendor = QA Vendor 2 (not invited), values.invitedVendorName / uninvitedVendorName | — |
| dutch | ~40 s | stage RA-24279 rfx_mode auction, trade auction_config "dutch", current_status "auctioning", order_type buy; 2 QA vendors invited | — |
| knockout | ~40 s | stage RA-24284, trade auction_config "knockout" | — |
| forward | ~40 s | stage FA-24296 (the app's forward-auction prefix), trade order_type "sell", auction_config price | — |
| masked | ~70 s | the round's masking flag is not in the trade read (values.vendorMasking "on" as sent; 1 bid in) | trade_requests.config->>'is_vendor_masking_enabled' = true |
| pr_rfq | ~30 s | journey create_draft "Starting from purchase request 0150000345: Generator — 1 NOS", made.prUuid; event active | event_group_line_items has no PR column in this schema (the link lives on the PR side) |

Strategy sizes sent (strategyFor): dutch start 3,000 / end 4,500 / tick 250 / 120 s step / single closing, on the total amount;
knockout start 3,000 / tick 250 / 120 s. Japanese = knockout (Procol has no japanese strategy).

## 01:40 — after (scripts/_states-baseline.ts, no network)
UI- unbuildable 93 → 61 (buildable 552 → 584 of 645). Left: 32 "another user / second company / load", 29 purchase-request screens — not
this agent's area. Routing now, by new state (case → first screen):
- amended 9: UI-CONV-011, UI-FPUB-003, UI-XDAMD-009/-010 (Master QCS), -011, -012, -015, UI-XDAUC-002, UI-XDQCS-013 (Master QCS) — the two
  multi-event setups (XDAUC-002, XDQCS-013) get the older version only; their other events are not built (said in the why)
- amendment 1: UI-XDAMD-007
- withdrawn 4: UI-PUB-018, UI-PUB-019, UI-SUR-009 (Participants), UI-XDLST-006 (events list — the other buckets are not built)
- masked 3: UI-CONV-009, UI-XDAUC-001, UI-XDQCS-018 (Responses)
- dutch 2: UI-AUC-018, UI-SUR-013; knockout 2: UI-SUR-012, UI-XDAUC-019
- two_bids 4: UI-AWD-002 (Master QCS), UI-XDNEG-011, UI-XDNEG-018, UI-XDQCS-012 (Responses) — these used to run on ONE bid and compare nothing
- two_invited 2: UI-VBID-032 (vendor portal), UI-EVDQRY-084; uninvited 2: UI-VBID-002, UI-VBID-025 (vendor portal, signed in as the uninvited vendor)
- the 7 "dutch/knockout" cases about the CONVERSION DRAWER (UI-AUC-009/-012/-013/-014/-015/-016, UI-XDAUC-011) now start from the published
  RFQ with a bid the drawer opens on (they were refused as "a dutch auction")
- UI-XDAPR-012/-014 ("a withdrawn approval") no longer read as a withdrawn event; they take the award rules.
Sheet unbuildable 21 → 3 (built by API 575 → 597; 500 → 496 start from nothing):
- forward 11: SRC-RCO-043, SRC-BID-027/-028/-029/-040/-044, SRC-REV-009/-010/-011/-012, SRC-QCS-022
- withdrawn 6: SRC-PRJ-012, SRC-WDR-022/-023, SRC-RCO-027, SRC-VEN-008, SRC-STS-005
- pr_rfq 5: SRC-PR-032/-052/-053, SRC-MNU-013, SRC-RCO-029
- knockout 3: SRC-AUC-020, SRC-EXT-017, SRC-STR-016; dutch 1: SRC-STR-012
- two_bids 50 (SRC-SET-002 "RFQ with two bids" — no longer one bid with a note): SRC-WDR-007/-008/-009, SRC-MNU-002/-006, SRC-RJB-001,
  SRC-SEL-005/-007, SRC-ACT-013, SRC-REV-001/-002/-003/-030, SRC-RVK-008, SRC-NEG-001…-004, SRC-QCS-003/-009/-011/-013/-020, SRC-AWD-033,
  SRC-VEN-003, SRC-STG-001…-015, SRC-SAM-003/-009/…/-057 (10)
Left (3): the service RFQ (SRC-SET-013: an RFQ from a SERVICE PR line with activities) — the journey's fromPr takes material lines only and
the vendor's bid body prices a product row, not activity rates; a service build needs its own bid body. Not attempted.

## Not done / caveats
- Company settings: none changed (masking is per round on DEMO; versioning already on). withSettings was not needed.
- "closed with two bids" is not a state (two_bids stops at the second bid; the closed/proposal/awarded states keep one bidder).
- The vendor-side two_bids/uninvited routes rely on the UI runner's open_prepared{screen:"vendor"} signing in as context.vendorEmail
  (runPlan.ts 1119): not exercised tonight (no browser).
- Events created tonight on DEMO: 12 (all spine-API-automation-<n>, QA vendors only, rounds open 1 h).

## 01:55 — amended with a technical round (UI-XDAMD-011 "v1 of an amended RFP with responses")
Built once: RFP + RFQ event, QA vendor's technical response and bid, new version issued and published → old stages RFP-24321, RFQ-24322
(is_latest_version false), new RFP-24321.1, RFQ-24322.1 active. ~3 min. Events created tonight on DEMO: 13.
