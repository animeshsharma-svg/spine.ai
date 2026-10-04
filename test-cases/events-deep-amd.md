# Amending a live event — versions, in-place edits, remarks, notifications and the audit trail

Deep cases for changing an event after it has been published: issuing a new version (`POST /item_versions`), what happens
to the original and to the bids already placed while the amendment is drafted and after it is published, the amendment
remark and the "Event Revised" notification, vendor re-acceptance (T&C popup, participation intent), editing a live event
or stage in place without a version (`PATCH /event_groups/:id`, `PATCH /trade/:id`, widgets, add-new-stage), amending a
closed or awarded event, and reading the audit trail back. Every case is grounded in `procol-backend` at `origin/main`
(backend paths below are relative to that repo) or in `procol-client-dashboard` for the UI cases. Cases whose Trace names
an `EDGE-DAMD-NNN` id have a runnable twin in `prototype/data/api-cases-extra/deep-amd.json`; it acts on the run's sandbox
event (published, one open RFQ stage, no bids) or, for "after close", on the journey's own closed stage.
This file goes deeper than `api-edge-pub.md` §10 (EDGE-PUB-096…108), which already covers the version baseline, version
twice, missing/disallowed item_type, draft, raw id 1, vendor caller, the original refusing edits, and the missing/blank
remark on publish.

**Read before running.** The amendment draft that `/item_versions` creates is a separate event group whose id no run can
template, so every case that needs "an amendment draft" is manual (or an extension of the journey's F2 versioning step).
`Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row); `WrongUuid1=` decodes to nil. Keys containing `uuid` are decoded by
`ParamsAuth#check_for_uuid` (app/controllers/concerns/params_auth.rb:57-80); a raw `id` / `item_id` is not.

## 1. Issuing a new version — `POST /item_versions`

#### API-XDAMD-001 — The item type must be exactly "EventGroup"
- **Why it matters.** The type string is the only thing standing between the request and `constantize`; a "helpful" case-insensitive fix would widen it.
- **Setup.** The sandbox event, published; nothing is versioned by this case.
- **Steps.** `POST /item_versions` with body `{"item_uuid": "{{eventGroupUuid}}", "item_type": "eventgroup"}`. Then read the event back.
- **Expected.** Refused as missing parameters; no new version, the event is still the latest. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2; `GET /event_groups/{{eventGroupUuid}}` still shows `is_latest_version: true` and `item_versions: []`.
- **Trace.** P2 · automate · `EDGE-DAMD-001` · `app/controllers/api/item_versions_controller.rb:3,9-11`

#### API-XDAMD-002 — An item type sent as a list is refused before it reaches the class lookup
- **Why it matters.** A JSON array is not blank, so only the allow-list stops it reaching `item_type.constantize`, which would crash on an Array.
- **Setup.** The sandbox event.
- **Steps.** `POST /item_versions` with body `{"item_uuid": "{{eventGroupUuid}}", "item_type": ["EventGroup"]}`.
- **Expected.** Refused, no crash. HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2, never 500; no version created.
- **Trace.** P2 · automate · `EDGE-DAMD-002` · `app/controllers/api/item_versions_controller.rb:9-13`

#### API-XDAMD-003 — A garbled event id is a parameter error
- **Why it matters.** The id decodes to nothing; that must read as "bad request", not "not found" or a crash.
- **Setup.** Any buyer.
- **Steps.** `POST /item_versions` with body `{"item_uuid": "WrongUuid1=", "item_type": "EventGroup"}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters' — `item_uuid` becomes `item_id = nil`.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EDGE-DAMD-003` · `app/controllers/api/item_versions_controller.rb:9-10`

#### API-XDAMD-004 — Versioning an event that does not exist
- **Why it matters.** The same code (888) answers "not found", "not live" and "not latest", so the screen cannot tell the buyer which one happened.
- **Setup.** Any buyer.
- **Steps.** `POST /item_versions` with body `{"item_uuid": "Z2dnWmdaUWtnZw==", "item_type": "EventGroup"}`.
- **Expected.** Refused before the policy runs. HTTP 422, code 888 'Invalid Parameters'.
- **Oracle.** 422 code 888.
- **Trace.** P1 · automate · `EDGE-DAMD-004` · `app/controllers/api/item_versions_controller.rb:13-16`

#### API-XDAMD-005 — A raw text item_id does not crash the lookup
- **Why it matters.** The controller also accepts a raw `item_id`, which skips uuid decoding; its type handling is untested elsewhere.
- **Setup.** Any buyer.
- **Steps.** `POST /item_versions` with body `{"item_id": "QA_Platform_abc_{{stamp}}", "item_type": "EventGroup"}`.
- **Expected.** HTTP 422, code 888 'Invalid Parameters'; not a 500.
- **Oracle.** 422 code 888.
- **Trace.** P2 · automate · `EDGE-DAMD-005` · `app/controllers/api/item_versions_controller.rb:13-15`

#### API-XDAMD-006 — The API versions an event even when the company has versioning switched off
- **Why it matters.** The "Create New Version" button is driven by `can_create_new_version?`, which checks the company setting `is_event_versioning_enabled`, draft/withdrawn state, latest, awarded proposals, lot split, post-auction and team membership. `POST /item_versions` checks none of these — it only asks "active and latest" plus the create-record permission. Any client (or a stale tab) can amend events the product says cannot be amended.
- **Setup.** A company with `is_event_versioning_enabled` OFF; a published event. Not a runnable twin: the setting is not in the dashboard configuration the runner reads, so the case cannot be gated and would be a false positive on a company where versioning is on.
- **Steps.** 1. `GET /event_groups/:id` and confirm `config.can_create_new_version` is false. 2. `POST /item_versions` with `{"item_uuid": ":id", "item_type": "EventGroup"}`.
- **Expected.** Should be refused (422) whenever `can_create_new_version` is false. Today: HTTP 200 with a new draft version.
- **Oracle.** A 200 here while step 1 said false is the defect; `GET` the original afterwards shows `is_latest_version: false`.
- **Trace.** P0 · manual · `app/controllers/api/item_versions_controller.rb:13-18` vs `app/models/event_group.rb:1091-1107`

#### API-XDAMD-007 — An event whose award proposal is already submitted can still be versioned
- **Why it matters.** `can_create_new_version?` refuses once a proposal is selected, requested or active; the API does not. A version issued after award orphans the award on a superseded event.
- **Setup.** The journey's own event after `award_submit`. The journey's F2 step (`version`, run when `events.versioning` is ticked) sends exactly this request last, so no separate twin is needed — read that step's verdict.
- **Steps.** `POST /item_versions` with the journey event's uuid (the journey's F2 step).
- **Expected.** Should be 422 (proposal in requested/selected). Today: 200 — the controller never consults proposals.
- **Oracle.** The F2 step answering 200 while `GET /event_groups/:id` showed `config.can_create_new_version: false` is the defect.
- **Trace.** P0 · automate-later · `app/controllers/api/item_versions_controller.rb:14-18` · `app/models/event_group.rb:1098`

#### API-XDAMD-008 — Versioning after an auction ignores allow_versioning_post_auction
- **Why it matters.** Re-opening an auction's commercial terms after prices were revealed is exactly what `allow_versioning_post_auction` exists to stop.
- **Setup.** `allow_versioning_post_auction` OFF; an event whose latest commercial stage is an auction (e.g. after RFQ→Auction conversion). Needs an auction event; no twin.
- **Steps.** Confirm `config.can_create_new_version` is false, then `POST /item_versions` for the event.
- **Expected.** Should be refused. Today: 200.
- **Oracle.** New version exists despite the setting.
- **Trace.** P1 · manual · `app/models/event_group.rb:1100-1102`

#### API-XDAMD-009 — Versioning a lot-split event ignores lot_splitting_done?
- **Why it matters.** Once lots are published as separate stages, a replica built from `latest_non_lot_commercial_stage` drops the lot stages.
- **Setup.** A live event with published lots (lot_config status active). No twin (needs lot split).
- **Steps.** `POST /item_versions` for the event.
- **Expected.** Should be refused. Today: 200 and a version without the lot stages.
- **Oracle.** `new_item_data.trade_uuids` lacks the lot stages.
- **Trace.** P1 · manual · `app/models/event_group.rb:1080-1089,1099` · `app/services/versions/event_group.rb:60-61`

#### API-XDAMD-010 — A buyer outside the owner's team can version someone else's event
- **Why it matters.** The UI allows versioning only to super admins or users sharing a team with the owner; the API allows anyone in the company with create-record permission.
- **Setup.** Buyer B in PROCOL DEMO with create permission, no team shared with the event owner, not super admin. Needs a second buyer; no twin.
- **Steps.** As B, `POST /item_versions` for A's live event.
- **Expected.** Should be 455. Today: 200.
- **Oracle.** Version row `created_by` = B.
- **Trace.** P1 · manual · `app/policies/event_group_policy.rb:42-44` vs `app/models/event_group.rb:1103-1106`

#### API-XDAMD-011 — Two quick "Create New Version" clicks
- **Why it matters.** There is no lock; both requests pass the latest check, the second insert hits the unique partial index and surfaces as an untyped 500.
- **Setup.** A live event; two concurrent requests (the runner sends cases one at a time, so no twin).
- **Steps.** Fire two identical `POST /item_versions` within a few milliseconds.
- **Expected.** One 200, one readable 422 (888). Today the loser is likely a 500 from `index_item_versions_unique_active_item`.
- **Oracle.** Exactly one draft version and one replica event; no orphan replica.
- **Trace.** P1 · manual · `app/models/versioning/item_version.rb:28` · `app/controllers/api/item_versions_controller.rb:21-23`

#### API-XDAMD-012 — A withdrawn event cannot be versioned
- **Why it matters.** Withdrawn is final; reviving it through a version would re-invite vendors who were told it was over.
- **Setup.** A withdrawn event. No twin: the runner rebuilds the sandbox right after any withdrawal, so a later case never sees it withdrawn.
- **Steps.** `POST /item_versions` for the withdrawn event.
- **Expected.** HTTP 422, code 888 'Invalid Parameters' (`!item.active?`).
- **Oracle.** No version created.
- **Trace.** P1 · manual · `app/controllers/api/item_versions_controller.rb:14-15`

#### API-XDAMD-013 — What the new version copies and what it resets
- **Why it matters.** Vendors and buyers rely on the amendment carrying the right things: same line items, stages, vendors and evaluators — but no bids.
- **Setup.** Run right after EDGE-PUB-096 (or the journey's F2 step) on its own event.
- **Steps.** `GET /event_groups/<new uuid>` and `GET /trade/<each new stage>`; compare with the original.
- **Expected.** New draft event with copies of the active line items (`meta_data.old_egli_id` set), the RFP stage and the latest non-lot commercial stage as drafts, audiences and access lists copied, schedules re-based to start "now" with the configured duration, `misc.bid_company_ids` / savings / precomputed bids reset, no bids, evaluation scores stripped from line items.
- **Oracle.** Field-by-field comparison; bid count 0 on the new stages.
- **Trace.** P1 · manual · `app/services/versions/event_group.rb:31-87` · `app/services/versions/trade_request.rb:18-64,111-123`

## 2. While the amendment is being drafted — the original is frozen

#### API-XDAMD-014 — Vendors cannot start, update or submit a bid on the original while the amendment is drafted
- **Why it matters.** The original is no longer the latest the moment the draft version exists; bids there would be lost.
- **Setup.** A versioned event (draft amendment exists), original stage still open; vendor session. No twin (vendor actor).
- **Steps.** As the vendor: `POST /v1/bids`, `PATCH /v1/bids/:id`, `POST /v1/bids/:id/create_bid_products`, and a commercial submit.
- **Expected.** The first three: HTTP 422 code 101 'You are not allowed to perform this action'. The submit service: code 805 'Invalid action type' — a misleading message for "this version is superseded".
- **Oracle.** No bid rows change.
- **Trace.** P0 · manual · `app/controllers/api/v1/bids_controller.rb:18,50,124` · `app/services/bid_submit/commercial_bid_service.rb:76`

#### API-XDAMD-015 — Revising a submitted bid on the superseded version is not blocked
- **Why it matters.** `PATCH /bids/revise_bid/:id` (the legacy revise path) has no latest-version check, so while the amendment is drafted (the original's window is still open) a vendor can still move prices on the version that is about to be archived.
- **Setup.** A vendor with an active bid on the original; buyer has created a new version but not yet published it. No twin (vendor actor).
- **Steps.** As the vendor, `PATCH /bids/revise_bid/:bid` with a lower price.
- **Expected.** Should be 101 like the v1 bid endpoints. Today: accepted.
- **Oracle.** Bid price changed after the version was created.
- **Trace.** P0 · manual · `app/controllers/api/bids_controller.rb:109-123`

#### API-XDAMD-016 — The original drops off vendors' live page as soon as the version is created
- **Why it matters.** The live page lists `TradeRequest.latest`, and the draft version already counts; vendors lose the event from their list for as long as the buyer drafts the amendment, with no notice.
- **Setup.** Vendor invited to a live event; buyer creates a new version and leaves it in draft.
- **Steps.** As the vendor, load the live page (`GET /orders?tab=live` or the home live list) before and after the version is created.
- **Expected.** Product decision needed; today the event disappears for vendors while its window is still open.
- **Oracle.** Event present before, absent after.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:2323,2348` · `app/models/versioning/versionable.rb:17-22`

#### API-XDAMD-017 — An award proposal on the superseded version can still be submitted
- **Why it matters.** Proposal creation checks "latest", but adding responses and submitting an existing proposal do not, so an award can be approved on a version vendors were told is archived.
- **Setup.** Journey state (proposal created, not yet submitted), then the event is versioned. No twin (needs the journey's event uuid).
- **Steps.** `POST /proposal/<uuid>/add_response` and `/submit` on the original's proposal.
- **Expected.** Should be 101. Today: only `POST /proposal` refuses (101).
- **Oracle.** Proposal status advances on a non-latest event.
- **Trace.** P0 · manual · `app/controllers/api/proposal_controller.rb:51` (only create is guarded)

#### API-XDAMD-018 — Counter offers and evaluations are not guarded on the superseded version
- **Why it matters.** Negotiation and scoring on an archived version waste evaluator time and can leak into the QCS.
- **Setup.** A closed RFP/RFQ with bids, then versioned. No twin.
- **Steps.** Raise a counter offer (`POST /additional_request/raise_additional_request`) and score (`POST /evaluations`) on the original.
- **Expected.** Should be 101 (old version). Today: no latest check in either controller.
- **Oracle.** New additional_request / evaluation rows on the old version.
- **Trace.** P1 · manual · `app/controllers/api/additional_requests_controller.rb` · `app/services/evaluations/validate_service.rb` (no `latest?`)

#### API-XDAMD-019 — Withdrawing the amendment draft freezes the original for good
- **Why it matters.** The amendment screen offers "Withdraw". Withdrawing a draft marks its ItemVersion ACTIVE (the status callback treats withdrawn like active), so the original stays non-latest forever — no edits, no bids, no award — while its stages stay open and visible because the previous version is force-closed only on a draft→active publish.
- **Setup.** Live event, amendment draft created; buyer withdraws the draft with a remark.
- **Steps.** 1. `PATCH /event_groups/<draft>` with `{"status": "withdrawn", "withdraw_remark": {"remarks": "QA_Platform_{{stamp}}"}}`. 2. `GET` the original. 3. As vendor, try to bid on the original.
- **Expected.** Either the original becomes latest again or it is withdrawn too. Today: original `is_latest_version: false`, its stage still active, vendor bids answer 101.
- **Oracle.** item_versions row status = active pointing at a withdrawn draft.
- **Trace.** P0 · manual · `app/models/versioning/methods.rb:149-152` · `app/models/versioning/versionable.rb:7-12` · `app/models/event_group.rb:118`

#### API-XDAMD-020 — Setting the amendment draft in_active restores the original
- **Why it matters.** It is the only path that gives the original back its "latest" status, and it is reachable only by sending `status: in_active` with a config key.
- **Setup.** Amendment draft exists.
- **Steps.** `PATCH /event_groups/<draft>` with `{"status": "in_active", "config": {"show_reference_id": false}}`, then `GET` the original.
- **Expected.** Original `is_latest_version: true` again; vendors can bid. Document as intended or close it.
- **Oracle.** item_versions row status in_active.
- **Trace.** P1 · manual · `app/models/versioning/methods.rb:149-152` · `app/controllers/concerns/event_group_controller_helper.rb:33`

## 3. Publishing the amendment — remark, notification, re-acceptance, old bids

#### API-XDAMD-021 — An amendment remark sent as plain text publishes the amendment and then crashes
- **Why it matters.** `add_amendment_remarks!` reads `"text"["remarks"]` (nil) and stores a remark with no message; the notification then calls `params.dig('amendment_remarks','remarks')` on a String, which raises — after the publish has committed. The buyer sees an error for an amendment that went live without the "Event Revised" email.
- **Setup.** Amendment draft with its stages.
- **Steps.** Publish the draft with `"amendment_remarks": "QA_Platform_reason_{{stamp}}"` (a string, not an object).
- **Expected.** 422 (remarks must be an object). Today: event active, version active, then 500.
- **Oracle.** Draft is now active and the previous version is force-closed, yet the reply was 5xx and no email job was queued.
- **Trace.** P1 · manual · `app/models/versioning/methods.rb:102-111` · `app/controllers/concerns/event_group_controller_helper.rb:2632-2637`

#### API-XDAMD-022 — An empty remark object crashes the publish
- **Why it matters.** `{}` is blank, so `add_amendment_remarks!` raises a plain StandardError that nothing rescues (EDGE-PUB-107 covers the key being absent; this is the key present but empty).
- **Setup.** Amendment draft.
- **Steps.** Publish with `"amendment_remarks": {}`.
- **Expected.** 422 'remarks required'. Today: 500 "Remarks for amendment not found", publish rolled back.
- **Oracle.** Draft still draft after the 500.
- **Trace.** P1 · manual · `app/models/versioning/methods.rb:103` · `app/services/event_groups/update_service.rb:234`

#### API-XDAMD-023 — A whitespace-only remark is accepted
- **Why it matters.** Neither the screen (it checks length > 0, no trim) nor the backend (it checks the hash, not the text) rejects "   ", so vendors get an "Event Revised" mail that says nothing.
- **Setup.** Amendment draft.
- **Steps.** Publish with `"amendment_remarks": {"remarks": "   "}`.
- **Expected.** Should be refused. Today: published; Addendum panel shows a blank remark.
- **Oracle.** Remark row with message "   "; email job queued with that remark.
- **Trace.** P2 · manual · `app/models/versioning/methods.rb:103-108` · `procol-client-dashboard/src/views/eventCreation/components/footer/confirmModal.jsx:39-42`

#### API-XDAMD-024 — A very long remark has no limit
- **Why it matters.** The remark is copied into every vendor's email; there is no length cap on the screen or the column.
- **Setup.** Amendment draft.
- **Steps.** Publish with a 20,000-character remark.
- **Expected.** Either a documented cap (422) or stored in full; never a 5xx or a truncated mail.
- **Oracle.** Remark length stored = sent; email renders.
- **Trace.** P2 · manual · `db/schema.rb` remarks.message (string, no limit) · `app/views/event_revise_notification_mailer/event_revise_notification_mailer.html.erb`

#### API-XDAMD-025 — Script in the remark is stripped before it reaches vendors
- **Why it matters.** The remark is rendered in the vendor email and in the buyer's Addendum panel.
- **Setup.** Amendment draft.
- **Steps.** Publish with remarks `<script>alert(1)</script>QA_Platform_{{stamp}}`.
- **Expected.** Stored without the tag (input sanitizer strips HTML), publish succeeds.
- **Oracle.** Remark message contains no `<script>`.
- **Trace.** P2 · manual · `app/controllers/concerns/params_auth.rb:16-40`

#### API-XDAMD-026 — The "Event Revised" mail and push reach only the latest commercial stage's vendors
- **Why it matters.** Recipients are `latest_commercial_stage.get_audiences`; an RFP-only event has no commercial stage, so its amendment notifies nobody, and vendors invited only to the RFP of an RFP+RFQ event are skipped.
- **Setup.** An RFP-only live event, versioned and republished with a remark.
- **Steps.** Publish the amendment; inspect queued EmailNotificationWorker / mails for each invited vendor.
- **Expected.** Every invited vendor of every stage is told. Today: zero mails for RFP-only; the push worker also returns early.
- **Oracle.** No `event_revise_notification_mailer` delivery.
- **Trace.** P1 · manual · `app/workers/email_notification_worker.rb:643-652` · `lib/modules/trade_request_push_notification.rb:85-88`

#### API-XDAMD-027 — No company setting controls the revise notification
- **Why it matters.** Teams ask to switch the mail off (or on); there is no `CustomConfiguration` key for it — only the global `send_mail` flag — so the answer is "cannot" and tests should not look for one.
- **Setup.** Any amendment publish.
- **Steps.** Publish an amendment in two companies with different notification settings.
- **Expected.** Both send "<ref> | Event Revised" to the stage audience.
- **Oracle.** Same mail in both.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2632-2637` · `app/mailers/event_revise_notification_mailer.rb:6-15`

#### API-XDAMD-028 — Publishing the amendment force-closes the previous version
- **Why it matters.** Vendors must not keep bidding on v1 once v2 is live; the close happens in an async worker, so there is a window where both are open.
- **Setup.** Live event with an open stage, amendment published.
- **Steps.** Immediately and again after a few seconds, `GET /trade/<old stage>`.
- **Expected.** Old stages' bid end time = publish time (end_time_for force_close_event); old event group status stays active; PR mappings point to the new version.
- **Oracle.** Old trade schedule end_time ≈ publish time.
- **Trace.** P0 · manual · `app/models/event_group.rb:118,703-708` · `app/services/versions/event_group.rb:91-114`

#### API-XDAMD-029 — Bids placed before the amendment stay on the old version and are not carried over
- **Why it matters.** The confirmation modal promises "all bids received on the previous version" become read-only and fresh bids are needed; the backend must match that promise.
- **Setup.** Vendor bid on v1, then amendment published. Vendor session for the last step.
- **Steps.** 1. `GET /trade/<old stage>`: bid still there. 2. `GET /trade/<new stage>`: no bids. 3. As vendor, revise on old (should fail) and bid on new (should work).
- **Expected.** Old bids untouched and read-only; new stage empty; vendor can bid on v2.
- **Oracle.** Bid counts per stage.
- **Trace.** P0 · manual · `app/services/versions/trade_request.rb:18-27` · `procol-client-dashboard/src/components/versions/createNewVersionModal.jsx:23-36`

#### API-XDAMD-030 — Vendors' T&C popup acceptance is copied to the amended stage
- **Why it matters.** The replica is `trade_request.dup`; `misc.tnc_popup_acceptances` is not cleared (only bid_company_ids, savings and precomputed bids are), so a vendor who accepted v1's terms is treated as having accepted v2's — even when the amendment changed them.
- **Setup.** `tnc_popup` enabled for rfq; vendor accepted on v1; amendment changes the terms and is published.
- **Steps.** As the vendor, `GET /trade/<new stage>`.
- **Expected.** `tnc_popup_accepted: false` on v2. Today: true.
- **Oracle.** `misc.tnc_popup_acceptances` present on the new stage.
- **Trace.** P1 · manual · `app/services/versions/trade_request.rb:18-24` · `app/models/trade_request.rb:3048-3063`

#### API-XDAMD-031 — Participation intent is not carried to the new version
- **Why it matters.** Intents are stored against the event group id; v2 has a new id, so vendors must accept participation again — while their T&C acceptance (above) silently carries over. The two behaviours should match.
- **Setup.** Vendor declared "accept" (`POST /user_intents`, intent_type trade_accept) on v1; amendment published.
- **Steps.** As vendor, `GET /event_groups/<v2>` and read `user_intent`.
- **Expected.** Product decision; today `user_intent` is null on v2.
- **Oracle.** No user_intents row for v2.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:166` · `app/controllers/api/user_intents_controller.rb:4-24`

#### API-XDAMD-032 — The published amendment carries a ".1" reference and the version list labels it latest
- **Why it matters.** Buyers and vendors quote the reference id in mails and POs; the suffix is how they tell versions apart.
- **Setup.** Amendment published.
- **Steps.** `GET /event_groups/<v2>` and `GET /event_groups/<v1>`; read `ref_uuid` and `item_versions`.
- **Expected.** v2 ref id `<base>.1`; item_versions = [v2 "(Latest)", default v1]; v1 keeps its original ref id.
- **Oracle.** Labels and version_order.
- **Trace.** P2 · manual · `app/models/versioning/methods.rb:37-70,86-95` · `app/models/versioning/versionable.rb:13-15`

#### API-XDAMD-033 — Requisition mappings move to the new version
- **Why it matters.** A PR-linked event that is amended must keep its PR quantities in progress against v2, not v1.
- **Setup.** PR-linked live event, amendment published.
- **Steps.** Read the PR and its items' trade mappings.
- **Expected.** v1 PR mappings in_active; v2 active; PR item in-progress quantities unchanged.
- **Oracle.** purchase_request_trade_mappings rows.
- **Trace.** P1 · manual · `app/services/versions/event_group.rb:116-210`

## 4. Editing a live event in place — the amendment bypass (`PATCH /event_groups/:id`)

#### API-XDAMD-034 — A live line item's quantity can be changed without a version
- **Why it matters.** This is the core bypass: what is being bought changes on a published event with no version, no remark and no vendor notice, and the RFQ line vendors quote against keeps the old quantity.
- **Setup.** The sandbox event (published, one open RFQ stage, one line item, no bids). Runs last because it changes the line item.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with body `{"line_items": [{"uuid": "{{lineItemUuid}}", "product_uuid": "{{productUuid}}", "product_quality_uuid": "{{productQualityUuid}}", "quantity": {"unitSymbol": "KG", "value": 7}}]}`. Then read the line items and the stage.
- **Expected.** Should be refused or routed through a new version. Today: HTTP 200; the event line item says 7, the stage's trade product still says the original quantity, and no "Event Revised" mail is sent.
- **Oracle.** `GET /event_groups/{{eventGroupUuid}}/get_line_items` vs `GET /trade/{{tradeId}}` quantities differ.
- **Trace.** P0 · automate · `EDGE-DAMD-034` · `app/controllers/concerns/event_group_controller_helper.rb:33-35` · `app/services/event_groups/update_service.rb:95-140`

#### API-XDAMD-035 — A negative quantity is stored on a live line item
- **Why it matters.** Nothing on this path validates the quantity; -5 on a published event breaks savings and awarding maths.
- **Setup.** The sandbox event. Runs last.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with the existing line item and `"quantity": {"unitSymbol": "KG", "value": -5}`.
- **Expected.** Should be 422. Today: 200 and -5 stored.
- **Oracle.** get_line_items shows -5.
- **Trace.** P1 · automate · `EDGE-DAMD-035` · `app/controllers/concerns/trade_controller_helper.rb:6303-6318`

#### API-XDAMD-036 — The only line item of a live event cannot be deleted
- **Why it matters.** An event with nothing to buy must be withdrawn, not emptied.
- **Setup.** The sandbox event (exactly one line item).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with body `{"line_items": [{"uuid": "{{lineItemUuid}}", "status": "deleted"}]}`.
- **Expected.** HTTP 422, code 711 'You cannot delete this line item from the project'; line item still active.
- **Oracle.** 422 code 711; get_line_items unchanged.
- **Trace.** P1 · automate · `EDGE-DAMD-036` · `app/services/event_groups/update_service.rb:171-176`

#### API-XDAMD-037 — An unknown product on a live line-item edit crashes the server
- **Why it matters.** A stale product id (product deactivated after publish) turns a buyer's edit into a 500, and the 8-second event lock is left behind.
- **Setup.** The sandbox event.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with `{"line_items": [{"uuid": "{{lineItemUuid}}", "product_uuid": "Z2dnWmdaUWtnZw==", "quantity": {"unitSymbol": "KG", "value": 5}}]}`.
- **Expected.** 422 (unknown product). Today: 500 — `product.id` on nil.
- **Oracle.** Not 5xx.
- **Trace.** P1 · automate · `EDGE-DAMD-037` · `app/controllers/concerns/trade_controller_helper.rb:6299-6300`

#### API-XDAMD-038 — A new line item can be added to a live event without a stage line
- **Why it matters.** The new event line item is created as active but the live RFQ gets no trade product, so vendors cannot quote it and the award screen shows a line nobody bid on.
- **Setup.** The sandbox event. Runs last (adds a second line item).
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with the existing line item plus `{"product_uuid": "{{productUuid}}", "product_quality_uuid": "{{productQualityUuid}}", "quantity": {"unitSymbol": "KG", "value": 3}}`.
- **Expected.** Should be refused on a live event. Today: 200, two event line items, one quotable line.
- **Oracle.** get_line_items count 2 vs `GET /trade/{{tradeId}}` trade_products count 1.
- **Trace.** P1 · automate · `EDGE-DAMD-038` · `app/services/event_groups/update_service.rb:110-148`

#### API-XDAMD-039 — A live rename happens only if an unrelated config key rides along
- **Why it matters.** A title alone is silently ignored (EDGE-CRT-020); the same title plus any config key renames the live event. The rule is accidental, and neither path tells vendors.
- **Setup.** The sandbox event.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with `{"title": "QA_Platform_LiveRetitle_{{stamp}}", "description": "QA_Platform_live_desc_{{stamp}}", "config": {"show_reference_id": false}}`.
- **Expected.** A consistent rule (always allowed with notice, or always refused). Today: 200 and renamed.
- **Oracle.** `GET` shows the new title.
- **Trace.** P1 · automate · `EDGE-DAMD-039` · `app/services/event_groups/update_service.rb:47-54`

#### API-XDAMD-040 — The event's terms can be replaced on a live event with no notice
- **Why it matters.** Vendors are held to terms they never saw; no remark, mail or acceptance reset.
- **Setup.** The sandbox event. Runs last.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with `{"config": {"show_reference_id": false}, "terms_and_conditions": {"clauses": ["QA_Platform_live_clause_{{stamp}}"], "attachments": []}}`.
- **Expected.** Should require an amendment. Today: 200; terms replaced.
- **Oracle.** `GET` terms show only the new clause.
- **Trace.** P1 · automate · `EDGE-DAMD-040` · `app/services/event_groups/update_service.rb:80-82`

#### API-XDAMD-041 — An extra key in the terms object crashes a live edit
- **Why it matters.** On a live event the terms object is only ever built on this path; EDGE-PUB-021 sends the same key down the publish branch, which does not build it for an active event.
- **Setup.** The sandbox event.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with `{"config": {"show_reference_id": false}, "terms_and_conditions": {"clauses": [], "attachments": [], "QA_Platform_extra": 1}}`.
- **Expected.** 422. Today: 500 (ArgumentError, unknown keyword).
- **Oracle.** Not 5xx.
- **Trace.** P1 · automate · `EDGE-DAMD-041` · `app/services/event_groups/update_service.rb:80-81` · `app/poro_classes/terms_and_conditions.rb:34`

#### API-XDAMD-042 — A config key can turn a live event into a BOQ event
- **Why it matters.** Config is merged with no allow-list; once `boq_based_rfx` is true, the next line-item edit deletes every line item not in the request.
- **Setup.** The sandbox event. Runs last.
- **Steps.** `PATCH /event_groups/{{eventGroupUuid}}` with `{"config": {"boq_based_rfx": true}}`.
- **Expected.** Should be refused. Today: 200 and `config.boq_based_rfx: true`.
- **Oracle.** `GET` config.
- **Trace.** P1 · automate · `EDGE-DAMD-042` · `app/services/event_groups/update_service.rb:50-54,164-166` · `app/models/event_group.rb:937`

## 5. Editing a live stage in place (`PATCH /trade/:id`)

#### API-XDAMD-043 — A live stage's terms change with only a push, and earlier acceptances stand
- **Why it matters.** No email, no remark, and vendors who accepted the old terms still show as accepted.
- **Setup.** The sandbox stage, no bids. Runs last.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"terms_and_conditions": ["QA_Platform_amended_clause_{{stamp}}"]}`, then `GET /trade/{{tradeId}}`.
- **Expected.** Should notify and reset acceptance. Today: 200; push "update_trade_notification" only; `misc.tnc_popup_acceptances` kept.
- **Oracle.** New clause present; tnc_popup_accepted unchanged for a vendor who had accepted.
- **Trace.** P1 · automate · `EDGE-DAMD-043` · `app/controllers/api/trade_controller.rb:714-722` · `app/models/trade_request.rb:2423-2428`

#### API-XDAMD-044 — All terms can be cleared from a live stage
- **Why it matters.** Mandatory clauses vanish mid-bidding.
- **Setup.** The sandbox stage. Runs last.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"terms_and_conditions": []}`.
- **Expected.** Should need a remark at least. Today: 200 and an empty list.
- **Oracle.** `GET` shows no clauses.
- **Trace.** P1 · automate · `EDGE-DAMD-044` · `app/controllers/api/trade_controller.rb:714-722`

#### API-XDAMD-045 — A running stage cannot be rescheduled
- **Why it matters.** Moving the start of a live stage would reopen or cut bidding under vendors.
- **Setup.** The sandbox stage (already started).
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"bid_start_time": 4102444800, "bid_end_time": 4102448400}`.
- **Expected.** HTTP 422, code 258 'You cannot re-schedule this event!'.
- **Oracle.** Schedules unchanged.
- **Trace.** P1 · automate · `EDGE-DAMD-045` · `app/controllers/api/trade_controller.rb:605-606`

#### API-XDAMD-046 — An unknown end-time type is refused
- **Why it matters.** The end-time edit drives best-offer and cost-breakdown windows; an unknown type must not silently pick one.
- **Setup.** The sandbox stage.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"end_time_type": "QA_Platform_bogus", "end_time": 4102444800}`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EDGE-DAMD-046` · `app/controllers/api/trade_controller.rb:442-443`

#### API-XDAMD-047 — An unknown delivery schedule id crashes a live edit
- **Why it matters.** Outside the reschedule branch the schedule is looked up with no scope and no nil check.
- **Setup.** The sandbox stage.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"delivery_schedules": [{"id": 999999999, "delivery_by": 4102444800}]}`.
- **Expected.** 422. Today: 500.
- **Oracle.** Not 5xx.
- **Trace.** P1 · automate · `EDGE-DAMD-047` · `app/controllers/api/trade_controller.rb:759-765`

#### API-XDAMD-048 — A live stage can be renamed without a remark
- **Why it matters.** Baseline for the closed-stage rename; also shows the description is overwritten with the delivery location for single-product sheet stages and the title is replaced by the product name for non-sheet single-product stages.
- **Setup.** The sandbox stage.
- **Steps.** `PATCH /trade/{{tradeId}}` with `{"title": "QA_Platform_LiveStage_{{stamp}}"}`.
- **Expected.** 200; title per the layout rule; no notification.
- **Oracle.** `GET /trade/{{tradeId}}` title/description.
- **Trace.** P2 · automate · `EDGE-DAMD-048` · `app/controllers/api/trade_controller.rb:504-509` · `app/controllers/concerns/trade_controller_helper.rb:1408-1428`

#### API-XDAMD-049 — Terms can change under a submitted bid while the window is open
- **Why it matters.** The API refuses T&C edits only when bids exist AND the window has closed; the screen hides the edit as soon as one bid exists. A vendor's submitted bid ends up against terms it was not priced on, and nothing flags the bid for revision.
- **Setup.** Open stage with one submitted vendor bid (vendor session to place it; no twin — the sandbox has no bids).
- **Steps.** `PATCH /trade/:id` with new terms.
- **Expected.** Should be refused once any bid exists (matching the UI), or the bid flagged. Today: 200.
- **Oracle.** Terms changed; bid status unchanged.
- **Trace.** P1 · manual · `app/controllers/api/trade_controller.rb:715` · `procol-client-dashboard/src/views/orderDetails/eventDetails.jsx:276-279`

#### API-XDAMD-050 — A price cap cannot be lowered below a bid already received
- **Why it matters.** After bids, only savings widgets, tick size and price cap can change; the cap must stay at or above the highest bid.
- **Setup.** Open sheet-template RFQ with a bid of 100 (vendor session; no twin).
- **Steps.** `PATCH /trade/:id` with `trade_products[0].validations.default.ceil_price = 50`.
- **Expected.** HTTP 422 code 15 with "Price Cap should be greater than or equal to ₹ 100.0 … for <product>".
- **Oracle.** Cap unchanged.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:436-449`

#### API-XDAMD-051 — Replacing a sheet stage's lines before any bid discards vendors' saved drafts
- **Why it matters.** With no submitted bids the whole line set is rebuilt and every DRAFT bid is set in_active — a vendor's half-filled quote disappears without notice.
- **Setup.** Open sheet-template RFQ; vendor has a saved draft bid, nothing submitted.
- **Steps.** `PATCH /trade/:id` with a new `trade_products` sheet.
- **Expected.** Product decision; today the draft bid becomes in_active and only a sheet-change push is sent.
- **Oracle.** Draft bid status in_active.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:349-380`

#### API-XDAMD-052 — A delivery schedule of another company's event can be edited
- **Why it matters.** `DeliverySchedule.where(id: …)` has no scope to the stage or company, so a buyer can move another tenant's delivery date by id.
- **Setup.** Two companies; the id of a delivery schedule owned by company B. Security, manual only — must never run against real records.
- **Steps.** As company A's buyer, `PATCH /trade/<A's live stage>` with `{"delivery_schedules": [{"id": <B's id>, "delivery_by": <time>}]}`.
- **Expected.** 422/404. Today: B's schedule is updated.
- **Oracle.** B's delivery_by changed.
- **Trace.** P0 · manual · `app/controllers/api/trade_controller.rb:759-765`

## 6. Amending after close (the journey's closed stage)

#### API-XDAMD-053 — A closed, awarded stage can still be renamed
- **Why it matters.** The title branch runs before the status allow-list, so the one record that should be frozen — a closed stage with bids and a submitted award — can be renamed.
- **Setup.** `{{pricingTradeUuid}}` = the journey's pricing stage, closed, one bid, proposal submitted; `rfx_project_enabled` OFF (else 769); the journey's event was not versioned (else 101).
- **Steps.** `PATCH /trade/{{pricingTradeUuid}}` with `{"title": "QA_Platform_ClosedStage_{{stamp}}"}`.
- **Expected.** Should be refused. Today: 200.
- **Oracle.** `GET /trade/{{pricingTradeUuid}}` title changed.
- **Trace.** P1 · automate · `EDGE-DAMD-053` · `app/controllers/api/trade_controller.rb:504-509,590-594`

#### API-XDAMD-054 — Terms cannot change on a closed stage that has bids
- **Why it matters.** Vendors priced against the terms in force when they bid.
- **Setup.** As API-XDAMD-053.
- **Steps.** `PATCH /trade/{{pricingTradeUuid}}` with `{"terms_and_conditions": ["QA_Platform_late_clause_{{stamp}}"]}`.
- **Expected.** HTTP 422, code 4 'Request not found' — a misleading message for "closed with bids".
- **Oracle.** Terms unchanged.
- **Trace.** P1 · automate · `EDGE-DAMD-054` · `app/controllers/api/trade_controller.rb:714-717`

#### API-XDAMD-055 — Stage configuration cannot change after close
- **Why it matters.** Configuration drives ranking, visibility and savings already computed for the award.
- **Setup.** As API-XDAMD-053.
- **Steps.** `PATCH /trade/{{pricingTradeUuid}}` with `{"configurations": {"QA_Platform_marker": true}}`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** Config unchanged.
- **Trace.** P2 · automate · `EDGE-DAMD-055` · `app/controllers/api/trade_controller.rb:723-726`

#### API-XDAMD-056 — Line quantities, specs and price caps cannot change after close
- **Why it matters.** The award is computed from these lines.
- **Setup.** As API-XDAMD-053.
- **Steps.** `PATCH /trade/{{pricingTradeUuid}}` with `{"trade_products": [{"id": 999999999, "validations": {"default": {"ceil_price": 1}}}]}`.
- **Expected.** HTTP 422, code 4 'Request not found'.
- **Oracle.** Lines unchanged.
- **Trace.** P1 · automate · `EDGE-DAMD-056` · `app/controllers/concerns/trade_controller_helper.rb:329-333`

## 7. Widgets, T&C acceptance and adding a stage to a live event

#### API-XDAMD-057 — A buyer cannot rewrite a stage's widgets
- **Why it matters.** Widgets are the columns vendors quote against; the endpoint is Procol-support only.
- **Setup.** The sandbox stage (has widgets); the run's buyer is not a Procol employee.
- **Steps.** `PATCH /v1/trade/{{tradeId}}/widgets` with `{"operations": [{"operation": "QA_Platform_noop", "widget_type": "inline_components"}]}`.
- **Expected.** HTTP 422, code 455 (not authorized). 891 if the stage has no widgets.
- **Oracle.** Widgets unchanged.
- **Trace.** P2 · automate · `EDGE-DAMD-057` · `app/policies/trade_request_policy.rb:208-210` · `app/controllers/api/v1/trade_controller.rb:1635-1647`

#### API-XDAMD-058 — Support can rewrite widgets of a stage with bids, after close, or on an old version
- **Why it matters.** The widget update has no state, bid or latest-version check, so columns can change under submitted bids with no amendment or notice.
- **Setup.** Procol-employee session; a closed stage with bids. No twin (actor).
- **Steps.** `PATCH /v1/trade/:id/widgets` with a valid `update_field` operation.
- **Expected.** Should refuse after bids/close or create an amendment. Today: 200.
- **Oracle.** trade_requests.widgets changed; bids untouched.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:1438-1464`

#### API-XDAMD-059 — A buyer cannot accept the vendor T&C popup
- **Why it matters.** Acceptance is a vendor's legal act; the buyer of the event must not be able to record it.
- **Setup.** The sandbox stage; the buyer user is not also mapped as a vendor of the company.
- **Steps.** `PATCH /v1/trade/{{tradeId}}/accept_auction_tnc` with `{}`.
- **Expected.** HTTP 422, code 101 'You are not allowed to perform this action'.
- **Oracle.** `misc.tnc_popup_acceptances` unchanged.
- **Trace.** P1 · automate · `EDGE-DAMD-059` · `app/controllers/api/v1/trade_controller.rb:899-917`

#### API-XDAMD-060 — A vendor can accept T&C after the window closed or on a superseded version
- **Why it matters.** accept_auction_tnc checks only "stage active" and the vendor's audience; no window or latest check, so the audit trail can show an acceptance dated after close.
- **Setup.** Vendor session; closed (status still active) stage, or a versioned original.
- **Steps.** As the vendor, `PATCH /v1/trade/:id/accept_auction_tnc`.
- **Expected.** Should be refused. Today: 200.
- **Oracle.** acceptance accepted_at after closed_at.
- **Trace.** P2 · manual · `app/controllers/api/v1/trade_controller.rb:899-917`

#### API-XDAMD-061 — A new stage can only be added from an RFP
- **Why it matters.** Add-new-stage is how an RFP-only live event grows its RFQ; from an RFQ it must be refused.
- **Setup.** The sandbox (RFQ-only); `is_add_new_stage_allowed` ON (else 1127). PROCOL DEMO has it OFF (checked live 2026-10-03: 1127 every time), so the runnable twin is held there.
- **Steps.** `POST /v1/trade/{{tradeId}}/add_new_stage_in_live_event` with `{"event_group_uuid": "{{eventGroupUuid}}"}`.
- **Expected.** HTTP 422, code 2001 'New stage cannot be added unless the referring stage is an RFP'.
- **Oracle.** Stage count unchanged.
- **Trace.** P2 · automate · `EDGE-DAMD-061` · `app/services/add_new_stage/validate_service.rb:37-43`

#### API-XDAMD-062 — Adding a stage without naming the event
- **Why it matters.** The event id is the second lookup; it must fail cleanly.
- **Setup.** The sandbox stage.
- **Steps.** `POST /v1/trade/{{tradeId}}/add_new_stage_in_live_event` with `{}`.
- **Expected.** HTTP 422, code 533 'Project does not exist.'.
- **Oracle.** 422 code 533.
- **Trace.** P2 · automate · `EDGE-DAMD-062` · `app/controllers/api/v1/trade_controller.rb:1123-1124`

#### API-XDAMD-063 — A stage of one event cannot seed a stage in another event
- **Why it matters.** Without the link check a buyer could graft stages across events.
- **Setup.** `{{pricingTradeUuid}}` (journey event) and `{{eventGroupUuid}}` (sandbox event); `is_add_new_stage_allowed` ON. PROCOL DEMO has it OFF (checked live 2026-10-03), so the runnable twin is held there.
- **Steps.** `POST /v1/trade/{{pricingTradeUuid}}/add_new_stage_in_live_event` with `{"event_group_uuid": "{{eventGroupUuid}}"}`.
- **Expected.** HTTP 422, code 2000 'Trade request and event group are not linked'.
- **Oracle.** Neither event changes.
- **Trace.** P1 · automate · `EDGE-DAMD-063` · `app/services/add_new_stage/validate_service.rb:29-35`

#### API-XDAMD-064 — An RFP+RFQ event cannot take another stage
- **Why it matters.** The event already has both stage types.
- **Setup.** rfp_rfq run; `is_add_new_stage_allowed` ON. PROCOL DEMO has it OFF (checked live 2026-10-03), so the runnable twin is held there.
- **Steps.** `POST /v1/trade/{{rfpTradeId}}/add_new_stage_in_live_event` with `{"event_group_uuid": "{{eventGroupUuid}}"}`.
- **Expected.** HTTP 422, code 1129 'New stage cannot be added to an RFP and RFQ event'.
- **Oracle.** Stage count unchanged.
- **Trace.** P2 · automate · `EDGE-DAMD-064` · `app/services/add_new_stage/validate_service.rb:54-59`

#### API-XDAMD-065 — Adding a stage from a stage that does not exist
- **Why it matters.** The referring-stage lookup is scoped to the caller's workspace and runs before the policy.
- **Setup.** Any buyer.
- **Steps.** `POST /v1/trade/Z2dnWmdaUWtnZw==/add_new_stage_in_live_event` with `{"event_group_uuid": "{{eventGroupUuid}}"}`.
- **Expected.** HTTP 422, code 95 'Trade Request not found'.
- **Oracle.** 422 code 95.
- **Trace.** P2 · automate · `EDGE-DAMD-065` · `app/controllers/api/v1/trade_controller.rb:1120-1121`

## 8. Version guards and reading the audit trail back

#### API-XDAMD-066 — The version fields of a never-amended event
- **Why it matters.** Every amendment case compares against this baseline.
- **Setup.** The sandbox event, not versioned.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}`.
- **Expected.** 200; `is_latest_version: true`, `item_versions: []`, `is_amendment_draft: null`, `amendment_remarks.remarks: null`, `config.can_create_new_version` true only if `is_event_versioning_enabled` is on and the caller is super admin or shares the owner's team.
- **Oracle.** Field values as listed.
- **Trace.** P1 · automate · `EDGE-DAMD-066` · `app/serializers/event_group/show_serializer.rb:44-58,282-284`

#### API-XDAMD-067 — Live line items read back
- **Why it matters.** The oracle for the live line-item edits.
- **Setup.** The sandbox event.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_line_items`.
- **Expected.** 200 listing the active line items and quantities.
- **Oracle.** Compare with `GET /trade/{{tradeId}}` trade products.
- **Trace.** P2 · automate · `EDGE-DAMD-067` · `app/controllers/api/event_groups_controller.rb:466`

#### API-XDAMD-068 — Stage terms and acceptance read back
- **Why it matters.** The oracle for the T&C amendment cases.
- **Setup.** The sandbox stage.
- **Steps.** `GET /trade/{{tradeId}}`.
- **Expected.** 200 with terms, `is_tnc_popup_enabled`, `tnc_popup_accepted`.
- **Oracle.** Values per the company's `tnc_popup` config.
- **Trace.** P2 · automate · `EDGE-DAMD-068` · `app/models/trade_request.rb:3035-3063`

#### API-XDAMD-069 — Reading lots of an event that does not exist crashes
- **Why it matters.** The "is this the latest version" check was placed above the "does it exist" check.
- **Setup.** Any buyer.
- **Steps.** `GET /event_groups/Z2dnWmdaUWtnZw==/get_lots`.
- **Expected.** 422 code 2. Today: 500 (nil.latest?).
- **Oracle.** Not 5xx.
- **Trace.** P1 · automate · `EDGE-DAMD-069` · `app/controllers/api/event_groups_controller.rb:894-896`

#### API-XDAMD-070 — Reading lots without naming the stage
- **Why it matters.** Positive control for the crash above: same endpoint, existing event, readable refusal.
- **Setup.** The sandbox event.
- **Steps.** `GET /event_groups/{{eventGroupUuid}}/get_lots`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EDGE-DAMD-070` · `app/controllers/api/event_groups_controller.rb:893-899`

#### API-XDAMD-071 — Saving draft lots on an event that does not exist crashes
- **Why it matters.** Same guard order on a write.
- **Setup.** Any buyer; nothing can be written.
- **Steps.** `PATCH /event_groups/Z2dnWmdaUWtnZw==/save_draft_lots` with `{"lots": {"1": {"old_trade_product_ids": []}}}`.
- **Expected.** 422. Today: 500.
- **Oracle.** Not 5xx.
- **Trace.** P2 · automate · `EDGE-DAMD-071` · `app/controllers/api/event_groups_controller.rb:925-929`

#### API-XDAMD-072 — Resetting smart lots on an event that does not exist crashes
- **Why it matters.** Third endpoint with the same ordering.
- **Setup.** Any buyer.
- **Steps.** `PATCH /event_groups/Z2dnWmdaUWtnZw==/reset_to_smart_lots` with `{"trade_request_uuid": "Z2dnWmdaUWtnZw=="}`.
- **Expected.** 422 code 2. Today: 500.
- **Oracle.** Not 5xx.
- **Trace.** P2 · automate · `EDGE-DAMD-072` · `app/controllers/api/event_groups_controller.rb:908-916`

#### API-XDAMD-073 — A buyer cannot download a stage's bid history
- **Why it matters.** The history export is Procol-support only, so buyers have no API audit of bid changes across an amendment.
- **Setup.** The sandbox stage; the buyer is not a Procol employee.
- **Steps.** `GET /v1/trade/{{tradeId}}/trade_history`.
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action'.
- **Oracle.** No fileUrl.
- **Trace.** P2 · automate · `EDGE-DAMD-073` · `app/controllers/api/v1/trade_controller.rb:1412-1418`

#### API-XDAMD-074 — The change log of a live stage
- **Why it matters.** It is the audit trail for live-stage edits (terms, end time, title).
- **Setup.** The sandbox stage.
- **Steps.** `GET /versions_log/all?entity_type=TradeRequest&entity_uuid={{tradeId}}&count=50`.
- **Expected.** 200 `{versions: [{type, changes: [{column, changes: [old, new]}], user}]}`, newest first.
- **Oracle.** After the run-last edits, entries for terms_and_conditions / title appear.
- **Trace.** P1 · automate · `EDGE-DAMD-074` · `app/controllers/api/versions_log_controller.rb:4-16`

#### API-XDAMD-075 — The change log needs an entity id
- **Why it matters.** Missing-parameter baseline.
- **Setup.** Any buyer.
- **Steps.** `GET /versions_log/all?entity_type=TradeRequest`.
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EDGE-DAMD-075` · `app/controllers/api/versions_log_controller.rb:9-10`

#### API-XDAMD-076 — Event and line-item edits have no readable change log
- **Why it matters.** Only six entity types are readable; amendments to the event group and its line items (which are recorded) cannot be read back through the API.
- **Setup.** The sandbox event.
- **Steps.** `GET /versions_log/all?entity_type=EventGroup&entity_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 422, code 5 'Not authorized'.
- **Oracle.** 422 code 5.
- **Trace.** P1 · automate · `EDGE-DAMD-076` · `app/controllers/api/versions_log_controller.rb:11,20-22`

#### API-XDAMD-077 — Negative paging on the change log
- **Why it matters.** Boundary values must fall back, not crash.
- **Setup.** The sandbox stage.
- **Steps.** `GET /versions_log/all?entity_type=TradeRequest&entity_uuid={{tradeId}}&count=-5&offset=-10`.
- **Expected.** 200, 20 rows max from the start.
- **Oracle.** Not 5xx.
- **Trace.** P2 · automate · `EDGE-DAMD-077` · `app/controllers/api/versions_log_controller.rb:8,13`

#### API-XDAMD-078 — The change log page size is unbounded
- **Why it matters.** The table grows with every edit; one request can pull it all.
- **Setup.** The sandbox stage.
- **Steps.** `GET /versions_log/all?entity_type=TradeRequest&entity_uuid={{tradeId}}&count=1000000`.
- **Expected.** A cap would be expected; at minimum no 5xx.
- **Oracle.** Not 5xx; response time.
- **Trace.** P2 · automate · `EDGE-DAMD-078` · `app/controllers/api/versions_log_controller.rb:8,14`

#### API-XDAMD-079 — Any signed-in user can read any company's change log
- **Why it matters.** The controller has no policy and no tenant scope: `Version.where(item_type:, item_id:)` with a raw integer id returns every column change (and who made it) for any company, user, team, stage or bid on the platform.
- **Setup.** Two tenants you control (A and B). Security, manual only — never point this at a real tenant's ids.
- **Steps.** As A's buyer, `GET /versions_log/all?entity_type=TradeRequest&entity_id=<B's stage id>` (and `Company`, `User`).
- **Expected.** 455/404. Today: 200 with B's history.
- **Oracle.** Response contains B's changes and user details.
- **Trace.** P0 · manual · `app/controllers/api/versions_log_controller.rb:4-16`

## 9. The amendment screens (procol-client-dashboard)

#### UI-XDAMD-001 — "Create New Version" appears only when the backend allows it
- **Why it matters.** The button is the only guard the product actually applies (the API does not, API-XDAMD-006).
- **Setup.** Two events: one where `config.can_create_new_version` is true, one with an approved award.
- **Steps.** Open each event's details; look at the tab bar's right side.
- **Expected.** Button (or the "Create New Version" option inside the version dropdown) shown only for the first.
- **Oracle.** Visibility matches `config.can_create_new_version` from `GET /event_groups/:id`.
- **Trace.** P0 · automate · `src/views/projectDetails/projectDetails.jsx:240,1043-1049` · `src/components/versions/projectVersionDropdown.jsx:48-71`

#### UI-XDAMD-002 — The confirmation explains the consequences and Cancel creates nothing
- **Why it matters.** The modal promises old bids become read-only and fresh bids are needed; that text is the buyer's only warning.
- **Setup.** An event where versioning is allowed.
- **Steps.** Click Create New Version; read the modal; click Cancel; reload.
- **Expected.** Title "Are you sure you want to create a new version?", three bullets (archive, bids read-only, collect fresh bids), "This action cannot be undone."; Cancel sends no request.
- **Oracle.** No `POST /item_versions` in the network log; `item_versions` still empty.
- **Trace.** P1 · automate · `src/components/versions/createNewVersionModal.jsx:10-38`

#### UI-XDAMD-003 — Confirming opens the amendment draft in the create screen
- **Why it matters.** The redirect carries the new event and its draft stages; a wrong id edits the original.
- **Setup.** As above.
- **Steps.** Confirm the modal.
- **Expected.** Navigates to the create screen with `projectCreation=true&projectId=<new uuid>&draftStageIds=<new stage uuids>&isEditingAllowed=true` (and `boqProject` for BOQ events).
- **Oracle.** URL params equal `new_item_data` from the response.
- **Trace.** P1 · automate · `src/views/projectDetails/projectDetails.jsx:312-339` · `src/utils/mutations/mutation.js:4-11`

#### UI-XDAMD-004 — In an amendment draft stages cannot be deleted or added
- **Why it matters.** The amendment must keep the event's stage structure.
- **Setup.** Amendment draft open in the create screen.
- **Steps.** Open a stage tab's menu; look for the Add Stages dropdown.
- **Expected.** "Delete" disabled; Add Stages dropdown not rendered.
- **Oracle.** Menu item disabled attribute; dropdown absent.
- **Trace.** P1 · automate · `src/views/projectCreation/projectCreation.jsx:3129-3133,3201`

#### UI-XDAMD-005 — Withdrawing an amendment draft
- **Why it matters.** The draft footer shows a red Withdraw button; its backend effect freezes the original (API-XDAMD-019).
- **Setup.** Amendment draft.
- **Steps.** Click Withdraw; try OK with an empty and a whitespace-only remark; then with a real one.
- **Expected.** OK disabled until a non-blank remark (trimmed, max 500 chars); success toast "Draft project withdrawn successfully"; redirect to the live tab. Then open the original: it should be either live-and-latest or withdrawn — not stuck.
- **Oracle.** Original's `is_latest_version` after withdrawal.
- **Trace.** P0 · manual · `src/views/projectCreation/projectCreation.jsx:3363-3372,375-379` · `src/views/projectCreation/components/withdrawDraftProjectModal.jsx:13-61`

#### UI-XDAMD-006 — Addendum Remarks are required to publish an amendment
- **Why it matters.** The remark is what vendors are told.
- **Setup.** Amendment draft, all stages reviewed.
- **Steps.** Click Publish; try OK with an empty remark, with "   ", then with a 5,000-character remark.
- **Expected.** Field labelled "Addendum Remarks *"; OK disabled while empty. Today "   " enables OK (no trim) and there is no length limit — both should be fixed to match the withdraw modal.
- **Oracle.** OK button enabled state; request body `amendment_remarks.remarks`.
- **Trace.** P1 · automate · `src/views/eventCreation/components/footer/confirmModal.jsx:39-42,215-230` · `src/views/projectCreation/projectCreation.jsx:3550-3553`

#### UI-XDAMD-007 — The Addendum panel shows the amendment remark
- **Why it matters.** Buyers reviewing an event must see why it was amended.
- **Setup.** A published amendment with remark "QA_Platform_{{stamp}}"; and a never-amended event.
- **Steps.** Open each event's Details tab.
- **Expected.** "Addendum" panel with the remark above Overview on the amended event; no panel on the other.
- **Oracle.** Panel text equals `amendment_remarks.remarks`.
- **Trace.** P2 · automate · `src/views/projectDetails/projectDetails.jsx:518-531`

#### UI-XDAMD-008 — The version dropdown lists every version, newest labelled Latest
- **Why it matters.** It is how buyers move between v1 and v2.
- **Setup.** An event amended once (published).
- **Steps.** Open the dropdown; pick the older version.
- **Expected.** Entries `<ref>.1 (Latest)` and `<ref>`; picking one navigates to that version's details tab.
- **Oracle.** Labels equal `item_versions[].label`; URL id changes.
- **Trace.** P2 · automate · `src/components/versions/projectVersionDropdown.jsx:57-82` · `src/views/projectDetails/projectDetails.jsx:286-294`

#### UI-XDAMD-009 — An old version's settings menu disables changing actions
- **Why it matters.** The backend refuses these on a non-latest event (101); the UI should not offer them.
- **Setup.** Open the original (v1) of an amended event.
- **Steps.** Open the stage Settings menu.
- **Expected.** Disabled: final price, recreate, split line items, extend submission time, end time, extend CBD time, withdraw, convert to auction, edit evaluation time, unlock bids, re-evaluation, stop auto awarding, bulk vendor skip approval. Check also Reschedule (offered only for upcoming) and Reject bid — neither checks the version.
- **Oracle.** Disabled attribute per item.
- **Trace.** P1 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:167-169,598-849`

#### UI-XDAMD-010 — Awarding is blocked on an old version with a reason
- **Why it matters.** An award on v1 would point at bids the buyer was told are read-only.
- **Setup.** v1 of an amended event with bids.
- **Steps.** Open the QCS/award view; hover the award action.
- **Expected.** Award disabled; tooltip "Awarding is only allowed for the latest version".
- **Oracle.** Tooltip text.
- **Trace.** P1 · automate · `src/components/masterQcs/masterQcs.jsx:326-334,410-411`

#### UI-XDAMD-011 — Send to Evaluation is disabled on an old version
- **Why it matters.** Evaluations on v1 waste evaluator time (API-XDAMD-018).
- **Setup.** v1 of an amended RFP with responses.
- **Steps.** Open the RFP stage header.
- **Expected.** "Send to Evaluation" disabled.
- **Oracle.** Disabled attribute.
- **Trace.** P2 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:1214-1222`

#### UI-XDAMD-012 — Reject bid is still offered on an old version
- **Why it matters.** Every other changing action is disabled on v1; Reject bid is not, so the buyer can act on bids the modal called read-only.
- **Setup.** v1 of an amended RFQ with bids.
- **Steps.** Open Settings; click Reject bid and complete it.
- **Expected.** Should be disabled. Record what the backend answers.
- **Oracle.** Menu item state; bid status after.
- **Trace.** P2 · manual · `src/views/orderDetails/eventHeader/eventHeader.jsx:758-762`

#### UI-XDAMD-013 — In-place edits of a live stage disappear after the first bid
- **Why it matters.** The screen allows title, T&C and savings edits only while upcoming/live with zero bids; the API still accepts T&C edits with bids until close (API-XDAMD-049). The two rules should match.
- **Setup.** A live RFQ; then the same after one vendor bid.
- **Steps.** Open the Details panels (Order details, Terms & Conditions, Savings) before and after the bid.
- **Expected.** Edit buttons present before, absent after.
- **Oracle.** Presence of the OrderEditButton per panel.
- **Trace.** P1 · automate · `src/views/orderDetails/eventDetails.jsx:273-279,1425-1440,1956-1972,2205-2215`

#### UI-XDAMD-014 — Reschedule is offered only before the stage starts
- **Why it matters.** The backend refuses a reschedule once started (code 258); the UI hides it then.
- **Setup.** One upcoming stage, one live stage.
- **Steps.** Open Settings on each.
- **Expected.** "Reschedule" only on the upcoming stage.
- **Oracle.** Menu item presence.
- **Trace.** P2 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:696-704`

#### UI-XDAMD-015 — "Add new Stage" follows the backend configuration
- **Why it matters.** The menu label, hidden and disabled state all come from `add_new_stage_config`; it must be hidden on old versions and on anything but an RFP-only live event.
- **Setup.** `is_add_new_stage_allowed` ON; an RFP-only live event, an RFQ-only event, and v1 of an amended RFP-only event.
- **Steps.** Open Settings on each.
- **Expected.** "Add new Stage" enabled only on the RFP-only live latest event; confirmation text "Do you want to add a new RFQ Stage?".
- **Oracle.** Menu item disabled state vs `tradeConfig.addNewStageConfig`.
- **Trace.** P2 · automate · `src/views/orderDetails/eventHeader/eventHeader.jsx:748-757` · `app/models/event_group.rb:528-560`

#### UI-XDAMD-016 — A scheduled (recurring) template shows Edit instead of versions
- **Why it matters.** Templates are edited in place; versioning them would fork the schedule.
- **Setup.** A recurring event template.
- **Steps.** Open its details.
- **Expected.** No version dropdown / Create New Version; an "Edit" button instead.
- **Oracle.** Element presence.
- **Trace.** P2 · automate · `src/views/projectDetails/projectDetails.jsx:1040-1056`

#### UI-XDAMD-017 — Vendor selection in an amendment draft
- **Why it matters.** The participant picker's disable rule includes "is amendment draft", but it is ANDed with "not a draft project" and an amendment draft IS a draft, so the picker may stay editable — vendors added here would join v2 without being on v1.
- **Setup.** Amendment draft of a live RFQ.
- **Steps.** Open the stage's participants field; try to add and remove a vendor; publish.
- **Expected.** Decide and document; today verify whether the picker is enabled and whether the change reaches v2's audience.
- **Oracle.** Picker disabled state; v2 audience after publish.
- **Trace.** P1 · manual · `src/views/eventCreation/eventCreation.jsx:2392-2397`

#### UI-XDAMD-018 — What an invited vendor sees after an amendment
- **Why it matters.** There is no "event updated" banner for vendors in this repository; the vendor learns of the amendment only from the "<ref> | Event Revised" email (and a push) that carries the remark.
- **Setup.** QA vendor invited to an RFQ; buyer publishes an amendment with remark "QA_Platform_{{stamp}}".
- **Steps.** As the vendor: check the mailbox, open the event from the mail and from the live list, try to bid on the old link.
- **Expected.** Mail subject "<ref> | Event Revised" with the remark; the new version opens; the old link refuses bids. Note today: the event vanishes from the live list while the amendment is drafted (API-XDAMD-016).
- **Oracle.** Mail received; bid on old link refused (101).
- **Trace.** P1 · manual · `app/mailers/event_revise_notification_mailer.rb:6-15` · `app/workers/email_notification_worker.rb:643-652`
