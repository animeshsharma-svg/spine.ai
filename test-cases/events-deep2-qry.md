# Clarifications and queries inside an event — the Messages drawer, threads, assignment and resolution

Deep cases for the vendor ↔ buyer query module on a sourcing event: the Messages list and its counts, raising a general,
technical or commercial query (by line item), replies, assigning a thread to a colleague and marking it resolved, the
pickers behind the "New Message" form (vendors, line items, filters), the per-vendor "unresolved queries" badge on the
comparison sheet, and the older one-to-one personal chats (`/chats`). Every case is grounded in `procol-backend` at
`origin/main` (`app/controllers/api/v1/chats_controller.rb`, `app/controllers/concerns/chats_controller_helper.rb`,
`app/policies/chat_policy.rb`, `app/models/chat.rb`, `app/controllers/api/chats_controller.rb`, routes
`config/routes.rb:625-630` and `1007-1017`) or in `procol-client-dashboard` for the UI cases
(`src/components/communicationDrawer/*`, `src/redux/communication/*`).

**How ids reach the controller.** The dashboard sends `module=EventGroup&module_uuid=<event uuid>` (or `module=TradeRequest`
with a round uuid, which `resolve_module_params` translates to the round's event). `module_uuid` contains "uuid", so
`ParamsAuth#check_for_uuid` decodes it into an integer `module_id` before the controller runs; the same happens to
`event_uuid` → `event_id`, `reference_uuids` → `reference_ids`, `message_to_uuids` → `message_to_ids`, `assign_to_uuid` →
`assign_to_id` and the path `:id`. `thread_id` is a raw text uuid and is not decoded. So every read can be templated with
`{{eventGroupUuid}}` / `{{tradeId}}`. `Z2dnWmdaUWtnZw==` decodes to 999999999 (no such row); `WrongUuid1=` decodes to nil.
Both apps (buyer console and vendor website) may call every v1 chats action and every `/chats` action
(`data/app-access.json`, `aac.mjs`), so no case here risks the "wrong app" sign-out.

**What is runnable and what is not.** Twins live in `prototype/data/deep2-cases/qry.json` and use the DIRECT runner (one
shared fresh event per recipe). Creating a query, replying, assigning or resolving all write a chat and e-mail / push the
event owner, the unmuted participants and the vendor company's users (`Chat#send_notification_for_chat_creation`,
`ChatConversation#send_push_notification`, `NewCommunicationModuleWorker`, `ChatAssignment#notify_on_close`), so every
happy path that writes is MANUAL. The twins are: reads on the run's own event (list, counts, pickers, filter options,
per-vendor counts), refusals that return before anything is saved (unknown event / chat / thread / purchase request,
missing module id, draft event), and the suspected crashes — each traced to the line that raises BEFORE the first
`Chat.create!` / `ChatConversation.create!` / assignment save. Because no fresh event ever has a chat, nothing that needs an
existing thread (show, reply, assign, resolve on a real thread) can be a twin.

## 1. The query list on an event — `GET /v1/chats`

#### API-EVDQRY-001 — The buyer opens the Messages list on a live event
- **Why it matters.** This is the first call the Messages drawer makes; if it fails the buyer cannot see any vendor query on the event.
- **Setup.** A published RFQ (QA vendor 1 invited, no queries yet). Read only.
- **Steps.** As the event's buyer, `GET /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}&group_by=thread_id`.
- **Expected.** The list opens and is empty (no thread has been raised on a fresh event). HTTP 200 with `[]`.
- **Oracle.** 200 and an empty array; never 4xx/5xx for the event's own buyer.
- **Trace.** P0 · automate · `EVD2-QRY-001` · `app/controllers/api/v1/chats_controller.rb:14-61`

#### API-EVDQRY-002 — An invited vendor opens the Messages list on the same event
- **Why it matters.** Vendors raise and read their clarifications from the same list; a vendor invited to the round must pass the event visibility check.
- **Setup.** A published RFQ with QA vendor 1 invited. Read only.
- **Steps.** As QA vendor 1, `GET /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}&group_by=thread_id`.
- **Expected.** The list opens and is empty. HTTP 200 with `[]`. The vendor would only ever see threads its company takes part in (participant filter).
- **Oracle.** 200, `[]`.
- **Trace.** P1 · automate · `EVD2-QRY-002` · `app/controllers/api/v1/chats_controller.rb:17-23,43` · `app/models/model_helpers/trade_request_model_helper.rb:366-369`

#### API-EVDQRY-003 — Older screens that pass the round instead of the event still reach the event's list
- **Why it matters.** The bids header sends `module=TradeRequest` with the round's uuid when the round has no project metadata; the controller rewrites it to the round's event. A break here empties the drawer on those screens.
- **Setup.** A published RFQ. Read only.
- **Steps.** As the buyer, `GET /v1/chats?module=TradeRequest&module_uuid={{tradeId}}&group_by=thread_id`.
- **Expected.** Same answer as the event-level list: HTTP 200 with `[]`.
- **Oracle.** 200, `[]`.
- **Trace.** P2 · automate · `EVD2-QRY-003` · `app/controllers/api/v1/chats_controller.rb:423-432` · `procol-client-dashboard src/views/orderDetails/bidsSection/bidsHeader.jsx:406-413`

#### API-EVDQRY-004 — An unknown round sent as "TradeRequest" crashes every chats request
- **Why it matters.** The translation runs as a before-action on every v1 chats action and looks the round up with `find_by_id`, then calls `.event_group_id` on the result without checking it. A stale or mistyped round id is a server error on the list, the counts, the pickers and even "create".
- **Setup.** Any signed-in buyer; no event needed.
- **Steps.** `GET /v1/chats?module=TradeRequest&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Should be refused cleanly (HTTP 422, code 533 "Project does not exist."). Today `TradeRequest.find_by_id` returns nil and `nil.event_group_id` raises NoMethodError → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-QRY-004` · `app/controllers/api/v1/chats_controller.rb:11,423-432`

#### API-EVDQRY-005 — Asking for the event list without an event id
- **Why it matters.** A screen that loses its event id must get a clear "bad request", not someone else's chats.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats?module=EventGroup` (no `module_uuid`).
- **Expected.** Refused as missing parameters. HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-QRY-005` · `app/controllers/api/v1/chats_controller.rb:16-17,33`

#### API-EVDQRY-006 — The list for an event that does not exist
- **Why it matters.** The list checks the event exists before the permission check, so an unknown id is a readable refusal.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats?module=EventGroup&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Refused. HTTP 422, code 533 "Project does not exist.".
- **Oracle.** 422 code 533.
- **Trace.** P2 · automate · `EVD2-QRY-006` · `app/controllers/api/v1/chats_controller.rb:18-19`

#### API-EVDQRY-007 — A draft event has no Messages list
- **Why it matters.** Only live and withdrawn events are looked up (`VALID_STATUSES_FOR_DASHBOARD`), and the screen hides the Messages button on drafts; the API must agree and refuse, not crash.
- **Setup.** A draft event with an unpublished RFQ round, owned by the run's buyer.
- **Steps.** As the owner, `GET /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** Refused as "not found" for drafts. HTTP 422, code 533 "Project does not exist.".
- **Oracle.** 422 code 533.
- **Trace.** P2 · automate · `EVD2-QRY-007` · `app/controllers/api/v1/chats_controller.rb:18-19` · `app/models/event_group.rb:147`

#### API-EVDQRY-008 — A malformed filter on the thread view is a server error
- **Why it matters.** The filter text is parsed with a blanket `rescue` that returns nil; the thread view then reads `@filters["thread_id"]` without a nil check. A bad deep link or a hand-edited URL takes the drawer down with a 500 instead of ignoring the filter.
- **Setup.** A published RFQ. Read only.
- **Steps.** As the buyer, `GET /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}&group_by=thread_id&filters=QA_Platform_not_json`.
- **Expected.** Should either ignore the filter (200 `[]`) or refuse it (422 code 2). Today `CommonFunctions.parse_filters` swallows the JSON error and returns nil, and `nil["thread_id"]` raises NoMethodError → HTTP 500.
- **Oracle.** Any 5xx is the defect. The same URL without `group_by=thread_id` answers 200 (the nil filter is only read on the thread view).
- **Trace.** P2 · automate · `EVD2-QRY-008` · `app/controllers/api/v1/chats_controller.rb:39,54-57,434-436` · `lib/common_functions.rb:83-95`

#### API-EVDQRY-009 — The list of event 12 also shows queries from events 120–129, 1200–1299 …
- **Why it matters.** The list and the "total" count match chats with `context_identifier ILIKE 'EG_<id>%'`. Event ids are global, so the pattern for event 12 also matches `EG_120…`, `EG_1234…` of any company. A buyer or vendor sees their own queries from unrelated events mixed into this event; a user for whom `show_all_chats` is on (an NFA approver of a submitted proposal, a Procol employee) sees EVERY chat of those events — other companies' vendor queries included. A matched chat whose event is not active/withdrawn can also crash the thread view (`chats.first.event_group.id` in the log line).
- **Setup.** Needs two events whose ids share a prefix (e.g. ids N and N·10+k) with a query on the longer one, and a user who can see both (or an NFA approver of the shorter one). Ids cannot be chosen on UAT, so manual: find such a pair read-only in the database (`SELECT id FROM event_groups WHERE id::text LIKE '<N>%'`).
- **Steps.** 1. Raise a query on the longer-id event (QA vendor + QA buyer only). 2. As the NFA approver / Procol support login of the shorter-id event, `GET /v1/chats?module=EventGroup&module_uuid=<short event uuid>&group_by=thread_id`. 3. Read `GET /v1/chats/get_chats_count_data` for the same event.
- **Expected.** Only chats of the requested event (`context_identifier = 'EG_<id>'` or starting with `'EG_<id>_'`). Today the other event's thread is listed and counted.
- **Oracle.** A thread whose `line_items` / title belong to a different event appears; `total_threads_count` is larger than the number of threads actually on the event.
- **Trace.** P0 · manual · `app/controllers/api/v1/chats_controller.rb:21,35,42-43` · `app/controllers/concerns/chats_controller_helper.rb:27,247-249` · `app/models/chat.rb:223-237`

#### API-EVDQRY-010 — Who sees which threads on the list
- **Why it matters.** Confidentiality of vendor queries rests on one filter: participants see their own threads; NFA approvers of a requested/selected proposal and Procol employees see all; planning-team members see all "Tech Query" threads plus their own. A colleague added to the purchase team AFTER a query was raised is not a participant and never sees it.
- **Setup.** Event with two threads (QA vendor 1 general query; buyer technical query to QA vendor 2). Users: owner, a team-mate added later, an NFA approver on the submitted proposal, a planning-team user. Manual (needs writes and several users).
- **Steps.** As each user, `GET /v1/chats?module=EventGroup&module_uuid=:id&group_by=thread_id`.
- **Expected.** Owner: both threads. Late team-mate: none. NFA approver: both. Planning-team user: the technical thread only (plus any it takes part in). QA vendor 1: only its own thread; QA vendor 2: only the technical thread.
- **Oracle.** Thread titles per user as listed.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:22-23,42-43` · `app/controllers/concerns/chats_controller_helper.rb:48-62` · `app/models/event_group.rb:848-852`

## 2. The counts on the Messages button — `GET /v1/chats/get_chats_count_data`

#### API-EVDQRY-011 — The buyer's Messages counts on a live event
- **Why it matters.** The button polls this every 30 seconds on every event page; it must answer cheaply and correctly.
- **Setup.** A published RFQ, no queries. Read only.
- **Steps.** As the buyer, `GET /v1/chats/get_chats_count_data?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200 with `total_threads_count: 0` and `unresolved_threads_count` null (no thread has an active assignment, so the per-event hash has no key for the event).
- **Oracle.** 200; total 0.
- **Trace.** P1 · automate · `EVD2-QRY-011` · `app/controllers/api/v1/chats_controller.rb:197-235,460-477`

#### API-EVDQRY-012 — Counts are allowed on the owner's draft event
- **Why it matters.** Unlike every other read here, the count accepts draft events (`+ [:draft]`). The owner must get zeros, not an error.
- **Setup.** A draft event with an unpublished RFQ round, owned by the run's buyer.
- **Steps.** As the owner, `GET /v1/chats/get_chats_count_data?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200, `total_threads_count: 0`.
- **Oracle.** 200.
- **Trace.** P2 · automate · `EVD2-QRY-012` · `app/controllers/api/v1/chats_controller.rb:203` · `app/models/event_group.rb:511-514`

#### API-EVDQRY-013 — A vendor cannot read counts of a draft event
- **Why it matters.** Draft events are invisible to vendors; the count accepts drafts, so the permission check is what stops a vendor from probing them.
- **Setup.** A draft event with an unpublished RFQ round.
- **Steps.** As QA vendor 1, `GET /v1/chats/get_chats_count_data?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** Refused by the event permission check. HTTP 422, code 455 "You are not authorized to perform this action".
- **Oracle.** 422 code 455.
- **Trace.** P1 · automate · `EVD2-QRY-013` · `app/controllers/api/v1/chats_controller.rb:203-204` · `app/models/event_group.rb:511-514` · `app/policies/event_group_policy.rb:52-54` · `app/controllers/concerns/api_auth.rb:16,117-119`

#### API-EVDQRY-014 — Counts for an event that does not exist crash
- **Why it matters.** Unlike the list, the count does not check that the event was found before the permission check; `authorize nil` raises Pundit::NotDefinedError, which is not rescued.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_chats_count_data?module=EventGroup&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Should be refused cleanly (422 code 533, as the list does). Today `authorize(nil, :show?)` → Pundit::NotDefinedError → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-QRY-014` · `app/controllers/api/v1/chats_controller.rb:203-204` · `app/controllers/concerns/api_auth.rb:16`

#### API-EVDQRY-015 — "Total" and "unresolved" are counted by different rules
- **Why it matters.** The badge shows unresolved, the dot shows total. Total uses the prefix pattern (case 009) over all chats; unresolved uses the exact `event_group_id` and only chats whose assignment is active (`status = 1`, no NULL branch). They can disagree in both directions, and resolving the last open thread shows null rather than 0.
- **Setup.** Event with three threads: one open (assigned), one resolved, one on a prefix-matching other event. Manual.
- **Steps.** `GET /v1/chats/get_chats_count_data?module=EventGroup&module_uuid=:id` before and after resolving the open thread.
- **Expected.** total = 2, unresolved = 1, then unresolved = 0. Today: total counts the foreign thread too, and unresolved becomes null once nothing is open.
- **Oracle.** Compare with the thread list's `assignment_status` values.
- **Trace.** P2 · manual · `app/controllers/api/v1/chats_controller.rb:222-229,469-476` · `app/models/chat.rb:173-211,223-237`

## 3. Raising a query — `POST /v1/chats`

#### API-EVDQRY-016 — A vendor raises a general query on a live event
- **Why it matters.** The core flow: a vendor asks the buyer a question. The vendor screen sends no recipients, so the code addresses the buyer company itself, assigns the thread to the event owner and e-mails the unmuted participants.
- **Setup.** A published RFQ with QA vendor 1 invited; QA buyer as owner. Manual: creating the chat e-mails the owner and pushes to every participant, including the owner's purchase-team colleagues.
- **Steps.** As QA vendor 1, `POST /v1/chats?module=EventGroup&module_uuid=:id` with `{"context": "general", "message_body": "QA_Platform_query_<stamp>"}`. Then, as the buyer, open the list.
- **Expected.** HTTP 200 with the chat (title "General Query", `body.message` = the text, `assignment_status: "active"`, `assigned_to` = the owner). Participants: the owner and his purchase-team members (team members muted), the event's RFP evaluators, and every user of QA vendor 1's company. The owner gets one "query raised" e-mail; muted team-mates get none.
- **Oracle.** Buyer list shows one thread from QA vendor 1; `get_chats_count_data` total 1, unresolved 1.
- **Trace.** P0 · manual · `app/controllers/api/v1/chats_controller.rb:97-157` · `app/controllers/concerns/chats_controller_helper.rb:64-119,478-498` · `app/workers/new_communication_module_worker.rb:21-40`

#### API-EVDQRY-017 — A buyer sends one technical query on a line item to two vendors
- **Why it matters.** One query to several vendors becomes one chat per vendor sharing a thread id; each vendor must see only its own copy. Technical queries are pinned to the latest RFP/RFI stage and keep the line-item evaluators unmuted.
- **Setup.** A live RFP+RFQ event, QA vendors 1 and 2 invited, an evaluator on the line item's technical form. Manual (writes, e-mails QA vendors and the evaluator).
- **Steps.** As the buyer, `POST /v1/chats?module=EventGroup&module_uuid=:id` with `{"context": "technical", "reference_uuids": [":lineItemUuid"], "message_to_uuids": [":vendor1", ":vendor2"], "message_body": "QA_Platform_tq_<stamp>"}`.
- **Expected.** Two chats, same `thread_uuid`, title "Tech Query : 1. | <code> | <name>", context `EG_<id>_Stage_<rfp id>_EGLI_<egli id>`; assigned to the line item's first evaluator. Each vendor's list shows one thread; the buyer's list shows one thread with both vendors in `message_to`. A commercial query instead pins to the latest RFQ/auction stage, is assigned to the event owner and carries no evaluators. **Expected (today), worth a defect check.** When the line item has NO evaluator, a technical query gets no assignee at all (the technical branch never falls back to the owner): nobody can "Mark as Resolve" it, and the unresolved badge (which counts only chats with an active assignment) never counts it.
- **Oracle.** As vendor 1, `GET /v1/chats/<chat uuid>` → `siblings_count: 1`, `message_to` names only vendor 1. Without an evaluator: `assignment_status` null and `get_chats_count_data` unresolved unchanged.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:125,144-153` · `app/controllers/concerns/chats_controller_helper.rb:73,158-187,198-216,247-268,478-498` · `app/models/chat.rb:174-176`

#### API-EVDQRY-018 — Raising a query on an event that does not exist crashes before anything is saved
- **Why it matters.** The event is fetched with `find_by_id` and used straight away (`@event_group.company_id`) when no recipients are given — the vendor-side shape of the request.
- **Setup.** Any signed-in buyer; no event.
- **Steps.** `POST /v1/chats?module=EventGroup&module_uuid=Z2dnWmdaUWtnZw==` with `{"context": "general", "message_body": "QA_Platform_query_{{stamp}}"}`.
- **Expected.** Should be refused cleanly (422 code 533). Today `nil.company_id` raises NoMethodError at line 109 → HTTP 500. Nothing is created (the transaction has not started).
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-QRY-018` · `app/controllers/api/v1/chats_controller.rb:106-110`

#### API-EVDQRY-019 — The same unknown event with a recipient named crashes in the permission check
- **Why it matters.** With recipients given (the buyer-side shape) line 109 is skipped and `authorize nil` raises Pundit::NotDefinedError, which only NotAuthorizedError handling would have turned into a 455.
- **Setup.** Any signed-in buyer; no event.
- **Steps.** `POST /v1/chats?module=EventGroup&module_uuid=Z2dnWmdaUWtnZw==` with `{"context": "general", "message_to_uuids": ["{{vendorUuid}}"], "message_body": "QA_Platform_query_{{stamp}}"}`.
- **Expected.** Should be 422 code 533. Today HTTP 500 (NotDefinedError at line 110). Nothing is created.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-QRY-019` · `app/controllers/api/v1/chats_controller.rb:102,107-110` · `app/controllers/concerns/api_auth.rb:16`

#### API-EVDQRY-020 — Raising a query without saying which event it is about
- **Why it matters.** With no module the controller skips every branch and only fails inside the transaction at `@event_group.user_id`; the request should be refused up front.
- **Setup.** Any signed-in buyer.
- **Steps.** `POST /v1/chats` with `{"context": "general", "message_body": "QA_Platform_query_{{stamp}}"}` (no `module`, no `module_uuid`).
- **Expected.** Should be 422 code 2 "Insufficient parameters". Today NoMethodError on nil at line 128 → HTTP 500; the first write (`Chat.create!`) is never reached.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-020` · `app/controllers/api/v1/chats_controller.rb:106-128`

#### API-EVDQRY-021 — Raising a query on a draft event crashes
- **Why it matters.** Drafts are excluded by the status filter, so a draft id behaves like an unknown event: the buyer gets a 500 instead of "the event is not live yet".
- **Setup.** A draft event with an unpublished RFQ round, owned by the run's buyer.
- **Steps.** As the owner, `POST /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}` with `{"context": "general", "message_body": "QA_Platform_query_{{stamp}}"}`.
- **Expected.** Should be refused (422 code 533). Today HTTP 500 at line 109; nothing saved.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-021` · `app/controllers/api/v1/chats_controller.rb:107-109` · `app/models/event_group.rb:147`

#### API-EVDQRY-022 — A query on a purchase request that does not exist
- **Why it matters.** The same endpoint serves purchase-request chats; that branch looks the request up within the caller's company and refuses cleanly.
- **Setup.** Any signed-in buyer.
- **Steps.** `POST /v1/chats?module=PurchaseRequest&module_uuid=Z2dnWmdaUWtnZw==` with `{"context": "general", "message_body": "QA_Platform_query_{{stamp}}"}`.
- **Expected.** Refused. HTTP 422, code 812 "Purchase Request not found".
- **Oracle.** 422 code 812.
- **Trace.** P2 · automate · `EVD2-QRY-022` · `app/controllers/api/v1/chats_controller.rb:117-118,438-447`

#### API-EVDQRY-023 — An unknown "regarding" value with a line item crashes
- **Why it matters.** Only general / technical / commercial are understood. Anything else reaches the title builder, which calls `T.must(nil)`. An unknown value should be a validation error.
- **Setup.** A published RFQ. Safe to send: the error is raised while building the title, before `Chat.create!`.
- **Steps.** As the buyer, `POST /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}` with `{"context": "QA_Platform_context", "reference_uuids": ["{{lineItemUuid}}"], "message_body": "QA_Platform_query_{{stamp}}"}`.
- **Expected.** Should be 422 code 2. Today `get_chat_title` leaves `title` nil and `T.must(nil)` raises TypeError → HTTP 500.
- **Oracle.** Any 5xx is the defect; the event's list stays empty afterwards.
- **Trace.** P2 · automate · `EVD2-QRY-023` · `app/controllers/api/v1/chats_controller.rb:144-146` · `app/controllers/concerns/chats_controller_helper.rb:189-216,478-498`

#### API-EVDQRY-024 — A query with no "regarding" and no line item is not refused
- **Why it matters.** Without a context the code takes the line-item branch with an empty list, loops zero times, creates nothing and still answers as if it succeeded (or crashes serialising a nil chat). The screen would say "Message posted successfully!" for a query that was never saved.
- **Setup.** A published RFQ. Safe: the loop body (the only place a chat is created) never runs.
- **Steps.** As the buyer, `POST /v1/chats?module=EventGroup&module_uuid={{eventGroupUuid}}` with `{"message_body": "QA_Platform_query_{{stamp}}"}`.
- **Expected.** Should be refused, HTTP 422 code 2 "Insufficient parameters". **Expected (today).** No chat is created and the reply is either HTTP 200 with `null` or HTTP 500 from serialising nil (`render json: nil, serializer: ChatSerializer`).
- **Oracle.** Any 2xx or 5xx is the defect; the event's list stays empty.
- **Trace.** P2 · automate · `EVD2-QRY-024` · `app/controllers/api/v1/chats_controller.rb:100,131,144-156` · `app/controllers/concerns/chats_controller_helper.rb:189-196`

#### API-EVDQRY-025 — Attachments sent as text crash the request
- **Why it matters.** The attachments list is mapped with `to_unsafe_h` before anything is validated; a client that sends a string (or a list of strings) gets a 500.
- **Setup.** Any signed-in buyer. The purchase-request module with an unknown id is used so that, if attachments were parsed, the request would still stop at 812 — nothing can be created either way.
- **Steps.** `POST /v1/chats?module=PurchaseRequest&module_uuid=Z2dnWmdaUWtnZw==` with `{"context": "general", "message_body": "QA_Platform_query_{{stamp}}", "attachments": "QA_Platform_not_a_list"}`.
- **Expected.** Should be refused cleanly (422 code 2, or 812). Today `"…".map` raises NoMethodError at line 103 → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-025` · `app/controllers/api/v1/chats_controller.rb:103-104`

#### API-EVDQRY-026 — An attachment without its file link crashes the request
- **Why it matters.** Each attachment value must carry `name` and `private_url`; the value object is built with required keyword arguments, so a missing key is an ArgumentError instead of a validation message.
- **Setup.** As case 025 (unknown purchase request; nothing can be saved).
- **Steps.** `POST /v1/chats?module=PurchaseRequest&module_uuid=Z2dnWmdaUWtnZw==` with `{"context": "general", "message_body": "QA_Platform_query_{{stamp}}", "attachments": [{"type": "chats", "value": [{"name": "QA_Platform_file_{{stamp}}.pdf"}]}]}`.
- **Expected.** Should be 422 (code 2). Today `AttachmentValue.new(name:)` raises ArgumentError (missing keyword `private_url`) → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-026` · `app/controllers/api/v1/chats_controller.rb:103-104` · `app/poro_classes/attachment.rb:12-16` · `app/poro_classes/attachment_value.rb:15-19`

#### API-EVDQRY-027 — An empty query is accepted
- **Why it matters.** The screen requires text or a file, but the API never checks `message_body`; a client can post an empty question that notifies the buyer.
- **Setup.** A live event, QA vendor 1 invited. Manual (writes and e-mails the owner).
- **Steps.** As QA vendor 1, `POST /v1/chats?module=EventGroup&module_uuid=:id` with `{"context": "general", "message_body": ""}` and no attachments.
- **Expected.** Should be 422 code 2. **Expected (today).** HTTP 200, a thread whose first message is blank.
- **Oracle.** Thread list shows a thread with an empty `message`.
- **Trace.** P2 · manual · `app/controllers/api/v1/chats_controller.rb:101` · `app/controllers/concerns/chats_controller_helper.rb:93` · `procol-client-dashboard src/components/communicationDrawer/components/newMessageForm/newMessageForm.jsx:101-103`

#### API-EVDQRY-028 — A vendor can open a thread with a competing vendor
- **Why it matters.** Recipients are taken as given. When a vendor names another company in `message_to_uuids`, that company becomes a participant (all its users), sees the first vendor's question and identity, and is e-mailed. Nothing checks that a vendor may only write to the buyer, or that the recipient is invited.
- **Setup.** A live event with QA vendors 1 and 2 invited (use only QA vendors). Manual (writes, e-mails QA vendor 2).
- **Steps.** As QA vendor 1, `POST /v1/chats?module=EventGroup&module_uuid=:id` with `{"context": "general", "message_to_uuids": [":vendor2CompanyUuid"], "message_body": "QA_Platform_x_<stamp>"}`. Then, as QA vendor 2, list the event's threads.
- **Expected.** Should be refused (422 455). Today: 200; QA vendor 2 sees QA vendor 1's question and company name.
- **Oracle.** QA vendor 2's list contains the thread; participants include both vendor companies.
- **Trace.** P0 · manual · `app/controllers/api/v1/chats_controller.rb:102,108-110,150-151` · `app/controllers/concerns/chats_controller_helper.rb:97-119,134-148`

#### API-EVDQRY-029 — A buyer can address any company, invited or not — or none
- **Why it matters.** The vendor picker only offers invited vendors with an allowed onboarding status, but the API accepts any company id; a typo or a scripted call notifies a company that was never invited. With no recipient at all, the query is "addressed" to the buyer's own company.
- **Setup.** A live event; QA vendor 2 NOT invited. Manual (writes, e-mails QA vendor 2).
- **Steps.** 1. As the buyer, create a general query with `message_to_uuids: [":vendor2CompanyUuid"]`. 2. Create another with no `message_to_uuids`.
- **Expected.** Both should be 422. **Expected (today).** 1: 200, QA vendor 2 users become participants and are e-mailed about an event they cannot open. 2: 200, a thread whose only participants are the buyer's team.
- **Oracle.** `message_to` of thread 1 names QA vendor 2; thread 2 has no vendor in `message_to`.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:102,108-109` · `app/controllers/concerns/chats_controller_helper.rb:97-119` · `app/controllers/api/v1/chats_controller.rb:242-251`

#### API-EVDQRY-030 — Line items of another event leak into the query title
- **Why it matters.** `reference_uuids` are decoded and looked up with `EventGroupLineItem.where(id:)` / `.find` without checking they belong to this event. The title and "info" of the new chat then carry another company's product code, name and PR number, returned in the reply.
- **Setup.** Needs a line-item uuid from a second event of the SAME QA company (never probe other companies). Manual.
- **Steps.** As the buyer of event A, create a commercial query on event A with `reference_uuids: [":lineItemOfEventB"]`.
- **Expected.** Should be 422 (line item not on this event). Today 200; the title reads "Comm Query : n. | <B's product>" and `info` shows B's PR number; the thread is assigned to B's owner.
- **Oracle.** Title / info / `assigned_to` come from event B.
- **Trace.** P1 · manual · `app/controllers/concerns/chats_controller_helper.rb:198-226,489-497`

#### API-EVDQRY-031 — New queries are still accepted after award when "block new message" is on
- **Why it matters.** With the company setting `enable_block_message` on, the event serializer sets `block_new_message` once the proposal is selected or in approval, and the screen disables the "Message" button. The create endpoint never reads it, so the vendor app or a stale tab can still raise queries on an awarded event.
- **Setup.** A company with `enable_block_message` ON (read at `app/serializers/event_group/show_serializer.rb:295`); an awarded event (proposal submitted). Manual (config + writes).
- **Steps.** 1. `GET /event_groups/:id` and confirm `block_new_message: true`. 2. As QA vendor 1, raise a general query.
- **Expected.** Should be refused (422). Today 200.
- **Oracle.** A thread created while `block_new_message` was true.
- **Trace.** P1 · manual · `app/serializers/event_group/show_serializer.rb:294-313` · `app/controllers/api/v1/chats_controller.rb:97-157` · `procol-client-dashboard src/redux/project/slice.js:362`

#### API-EVDQRY-032 — A query on a withdrawn event is saved but nobody is told
- **Why it matters.** Create accepts withdrawn events (they are in `VALID_STATUSES_FOR_DASHBOARD`), but the e-mail worker looks the event up with `EventGroup.active` and silently stops. The vendor believes the buyer was notified.
- **Setup.** A withdrawn event that QA vendor 1 was invited to. Manual.
- **Steps.** As QA vendor 1, raise a general query on it; check the owner's mailbox.
- **Expected.** Either refused (event withdrawn) or delivered. **Expected (today).** 200, thread saved, no "query raised" e-mail.
- **Oracle.** Thread present; no mail.
- **Trace.** P2 · manual · `app/controllers/api/v1/chats_controller.rb:107` · `app/workers/new_communication_module_worker.rb:31-32`

#### API-EVDQRY-033 — A blacklisted vendor can still raise queries
- **Why it matters.** The visibility check deliberately lets blacklisted vendors see events they were invited to (for history); the create endpoint uses that same check, so a blacklisted vendor can keep e-mailing the buyer's team.
- **Setup.** A live event with a QA vendor invited, then blacklisted by the buyer company. Manual.
- **Steps.** As the blacklisted QA vendor, raise a general query.
- **Expected.** Should be 455. Today 200.
- **Oracle.** New thread from the blacklisted vendor.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:110` · `app/models/model_helpers/trade_request_model_helper.rb:346-350`

#### API-EVDQRY-034 — A vendor removed from the event cannot raise new queries
- **Why it matters.** Positive control for the permission check: once the vendor is no longer in the round's visible audience, `show?` fails.
- **Setup.** A live RFQ (restricted audience) with QA vendor 1 invited, then removed (`remove_audience`). Manual.
- **Steps.** As QA vendor 1, raise a general query.
- **Expected.** Refused. HTTP 422, code 455 "You are not authorized to perform this action".
- **Oracle.** 422 code 455; no thread created.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:110` · `app/models/model_helpers/trade_request_model_helper.rb:366-369` · `app/policies/event_group_policy.rb:52-54`

#### API-EVDQRY-035 — With the communication module switched off the API still works
- **Why it matters.** `show_communication_module` only hides the Messages button (console) and is passed to the vendor app in the event config; no chats action reads it. A company that turned queries off can still receive them from any client.
- **Setup.** A company with `show_communication_module` OFF (read at `app/controllers/api/v1/users_controller.rb:591` and `app/controllers/concerns/event_group_controller_helper.rb:527`). Manual (config).
- **Steps.** Confirm the Messages button is absent, then as QA vendor 1 raise a general query through the API.
- **Expected.** Should be refused. **Expected (today).** 200.
- **Oracle.** Thread created while the module is off.
- **Trace.** P2 · manual · `app/controllers/api/v1/users_controller.rb:591,693` · `app/controllers/concerns/event_group_controller_helper.rb:527,540`

#### API-EVDQRY-036 — Chats on a vendor-onboarding response skip every permission check
- **Why it matters.** The FxResponse branch of create never calls `authorize` and never checks the response exists. Any signed-in user can open a chat on any onboarding response id. Its success reply is also empty: `first_message && return` returns before `render`.
- **Setup.** A QA vendor-onboarding response of the QA company. Manual (writes).
- **Steps.** As a user with no access to that response, `POST /v1/chats?module=FxResponse&module_uuid=:responseUuid` with `{"context": "general", "message_body": "QA_Platform_fx_<stamp>"}`.
- **Expected.** Should be 455. Today the chat is created and the reply has no body (`first_message && return` leaves the action before `render`, so Rails answers 204 No Content); with a context other than "general" nothing is created, `render json: nil` runs and execution falls through to line 128, which raises on the nil event → HTTP 500.
- **Oracle.** Chat row exists for a user without access.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:111-116` · `app/controllers/concerns/fx_response_controller_helper.rb:8-19`

## 4. Opening a thread and replying — `GET /v1/chats/:id`, `POST /v1/chats/:id/send_message`

#### API-EVDQRY-037 — Opening a thread marks it read and tells a vendor how many others got the same query
- **Why it matters.** Show queues a "seen" update for every message and returns `siblings_count` (other chats in the same thread). For a vendor that is the number of OTHER vendors who received the buyer's query — competitive information.
- **Setup.** A buyer query sent to QA vendors 1 and 2 (case 017). Manual.
- **Steps.** As QA vendor 1, `GET /v1/chats/:chatUuid`.
- **Expected.** 200 with `body` (first message), later `conversations`, `message_to` = vendor 1 only. **Expected (today).** `siblings_count: 1` reveals a second recipient.
- **Oracle.** `siblings_count` > 0 for a vendor.
- **Trace.** P2 · manual · `app/controllers/api/v1/chats_controller.rb:69-94`

#### API-EVDQRY-038 — Opening a chat that does not exist
- **Why it matters.** Deep links from e-mails carry chat ids; a stale one must be a readable refusal.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/Z2dnWmdaUWtnZw==`.
- **Expected.** Refused. HTTP 422, code 2 "Insufficient parameters" (the code the controller uses for "chat not found" here).
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-QRY-038` · `app/controllers/api/v1/chats_controller.rb:70-72`

#### API-EVDQRY-039 — A chat without any message crashes the thread view
- **Why it matters.** Show reads `all_conversations[0].id` with no guard. The v1 show accepts ANY active chat, including one-to-one personal chats created empty by `GET /chats/get_chat_id`.
- **Setup.** A personal chat between two QA buyers created with `GET /chats/get_chat_id?user_id=<colleague id>` and no message sent. Manual (writes a chat).
- **Steps.** As either user, `GET /v1/chats/:personalChatUuid`.
- **Expected.** Should be 200 with an empty body (or 422). Today `nil.id` → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · manual · `app/controllers/api/v1/chats_controller.rb:76-78` · `app/models/chat.rb:75-90`

#### API-EVDQRY-040 — Replying to a chat that does not exist
- **Why it matters.** The reply box keeps a chat id from an earlier screen; if the chat is gone the vendor must get a clean refusal.
- **Setup.** QA vendor 1 signed in.
- **Steps.** As QA vendor 1, `POST /v1/chats/Z2dnWmdaUWtnZw==/send_message` with `{"message": "QA_Platform_reply_{{stamp}}"}`.
- **Expected.** Refused, nothing sent. HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-QRY-040` · `app/controllers/api/v1/chats_controller.rb:160-167`

#### API-EVDQRY-041 — A reply with attachments sent as text crashes before the chat is even looked up
- **Why it matters.** Same unguarded `to_unsafe_h` as create, and it runs first, so even a request for a missing chat answers 500.
- **Setup.** Any signed-in buyer.
- **Steps.** `POST /v1/chats/Z2dnWmdaUWtnZw==/send_message` with `{"message": "QA_Platform_reply_{{stamp}}", "attachments": "QA_Platform_not_a_list"}`.
- **Expected.** Should be 422 (code 2). Today NoMethodError at line 163 → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-041` · `app/controllers/api/v1/chats_controller.rb:163-164`

#### API-EVDQRY-042 — A resolved query cannot be replied to
- **Why it matters.** Once the assignee marks the thread resolved, both sides must stop adding messages; the screen disables the box with "You can't reply to a resolved message".
- **Setup.** A thread resolved by the owner (case 046). Manual.
- **Steps.** As QA vendor 1, `POST /v1/chats/:chatUuid/send_message` with `{"message": "QA_Platform_late_<stamp>"}`.
- **Expected.** Refused, no message saved, nobody notified. HTTP 422, code 579 "This message is already closed".
- **Oracle.** 422 code 579; conversation count unchanged.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:169-170`

#### API-EVDQRY-043 — Someone allowed to view a thread but not a participant crashes when replying
- **Why it matters.** `ChatPolicy#show?` also admits Procol employees (support login) and planning-team members on "Tech Query" threads — neither is a participant. The reply looks the participant up and calls `.muted = false` on nil.
- **Setup.** A technical thread on a QA event; a planning-team user of the buyer company (designation in `DESIGNATIONS_FOR_PLANNING_TEAM`) who is not a participant, or a Procol support login. Manual.
- **Steps.** As that user, open the thread, then `POST /v1/chats/:chatUuid/send_message` with a QA_Platform_ text.
- **Expected.** Either refused (422 455/101) or the user is added as a participant and the reply saved. Today `nil.muted=` → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:169,176-180` · `app/policies/chat_policy.rb:10-19`

#### API-EVDQRY-044 — A vendor removed from the event keeps reading and replying in its old threads
- **Why it matters.** Thread access is "were you ever a participant" — it never re-checks that the vendor can still see the event. A removed (or rejected) vendor keeps a channel into the buyer's team.
- **Setup.** QA vendor 1 has a thread on a live event, then is removed from the audience. Manual.
- **Steps.** As QA vendor 1, `GET /v1/chats/:chatUuid`, then send a reply.
- **Expected.** Should be 455. **Expected (today).** 200 for both; the buyer is e-mailed the reply.
- **Oracle.** New conversation from a vendor no longer in the audience.
- **Trace.** P1 · manual · `app/policies/chat_policy.rb:10-13` · `app/models/chat.rb:279-282`

#### API-EVDQRY-045 — Muted team-mates get no e-mails but still get a push for every reply
- **Why it matters.** Muting is meant to keep the owner's colleagues quiet until a thread is assigned to them. The e-mail worker honours `muted: false`; the push notification sent on every new message goes to all participants.
- **Setup.** A thread with a muted purchase-team member who has the mobile app / web push. Manual.
- **Steps.** QA vendor 1 replies to the thread.
- **Expected.** Muted member: no e-mail and no push. **Expected (today).** No e-mail, but a push.
- **Oracle.** Push log for the muted member.
- **Trace.** P2 · manual · `app/models/chat_conversation.rb:12,47-49` · `lib/modules/push_notification.rb:2510-2516` · `app/workers/new_communication_module_worker.rb:67-73`

## 5. Assigning and resolving — `assign`, `close`, `close_chat`, `assignee_options`

#### API-EVDQRY-046 — Only the current assignee can mark a thread resolved
- **Why it matters.** "Mark as Resolve" is shown only to the assignee; the API closes only the caller's own active assignment and refuses everyone else — including a second click by the assignee, which gets the same 101 rather than "already closed".
- **Setup.** A general thread assigned to the owner; a team-mate participant. Manual (writes, e-mails on close).
- **Steps.** 1. As the team-mate, `POST /v1/chats/close?thread_id=:threadUuid`. 2. As the owner, the same. 3. As the owner, again.
- **Expected.** 1: HTTP 422, code 101 "You are not allowed to perform this action". 2: 200, `assignment_status: "closed"`, `closed_at` set, close notification sent. 3: 422 code 101 (not 579).
- **Oracle.** Thread list shows `assignment_status: "closed"` after step 2 only.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:359-378` · `app/models/chat_assignment.rb:10-16`

#### API-EVDQRY-047 — A vendor can reassign the buyer's query — even to itself — and then close it
- **Why it matters.** `assign` and `close` only check `ChatPolicy#show?` (any participant) and that the new assignee is a participant. Vendor users are participants, so a vendor can move a buyer's query to another buyer colleague or to itself, then mark it resolved, hiding it from the buyer's unresolved count. The assignee picker only offers the caller's own company, but the API does not enforce that.
- **Setup.** A general thread raised by QA vendor 1 on a QA event. Manual.
- **Steps.** 1. As QA vendor 1, `POST /v1/chats/assign?thread_id=:threadUuid&assign_to_uuid=:vendorUserUuid`. 2. `POST /v1/chats/close?thread_id=:threadUuid`.
- **Expected.** Both should be 455. Today both 200; the buyer sees the thread "closed by" the vendor and the unresolved badge drops.
- **Oracle.** `assigned_to` is a vendor user; `get_chats_count_data` unresolved decreases.
- **Trace.** P0 · manual · `app/controllers/api/v1/chats_controller.rb:336-378,380-399` · `app/controllers/concerns/chats_controller_helper.rb:346-370`

#### API-EVDQRY-048 — Assigning a query to a technical evaluator opens the commercial round to them
- **Why it matters.** Round visibility for a buyer-side user includes "a chat on this event is assigned to me". Assigning any query to a technical-only evaluator (a participant on technical threads) lets them open the RFQ round with prices.
- **Setup.** RFP+RFQ event; an evaluator who cannot see the RFQ round; a technical thread where the evaluator is a participant. Manual.
- **Steps.** 1. As the evaluator, `GET /trade/:rfqUuid` → refused. 2. Owner assigns the thread to the evaluator. 3. Repeat step 1.
- **Expected.** Step 3 still refused. Today step 3 succeeds (unless the evaluator is in the gated planning team).
- **Oracle.** RFQ round readable only after the assignment.
- **Trace.** P1 · manual · `app/models/model_helpers/trade_request_model_helper.rb:443-446` · `app/models/chat.rb:61-63`

#### API-EVDQRY-049 — Resolving a thread that does not exist
- **Why it matters.** A stale "Mark as Resolve" click must be refused clearly.
- **Setup.** QA vendor 1 signed in.
- **Steps.** As QA vendor 1, `POST /v1/chats/close?thread_id=QA_Platform_thread_{{stamp}}`.
- **Expected.** Refused. HTTP 422, code 475 "Chat not found".
- **Oracle.** 422 code 475.
- **Trace.** P2 · automate · `EVD2-QRY-049` · `app/controllers/api/v1/chats_controller.rb:359-362`

#### API-EVDQRY-050 — Reassigning a thread that does not exist
- **Why it matters.** Same guard on the assign action; nothing is assigned and nobody is notified.
- **Setup.** Any signed-in buyer.
- **Steps.** `POST /v1/chats/assign?thread_id=QA_Platform_thread_{{stamp}}`.
- **Expected.** Refused. HTTP 422, code 475 "Chat not found".
- **Oracle.** 422 code 475.
- **Trace.** P2 · automate · `EVD2-QRY-050` · `app/controllers/api/v1/chats_controller.rb:336-340`

#### API-EVDQRY-051 — Assignee options for a thread that does not exist
- **Why it matters.** The assignee picker loads lazily; an unknown thread must not crash it.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/assignee_options?thread_id=QA_Platform_thread_{{stamp}}`.
- **Expected.** Refused. HTTP 422, code 475 "Chat not found".
- **Oracle.** 422 code 475.
- **Trace.** P2 · automate · `EVD2-QRY-051` · `app/controllers/api/v1/chats_controller.rb:380-383`

#### API-EVDQRY-052 — Closing a single chat that does not exist
- **Why it matters.** The per-chat close (`/:id/close_chat`) has its own lookup and code.
- **Setup.** Any signed-in buyer.
- **Steps.** `POST /v1/chats/Z2dnWmdaUWtnZw==/close_chat`.
- **Expected.** Refused. HTTP 422, code 475 "Chat not found".
- **Oracle.** 422 code 475.
- **Trace.** P2 · automate · `EVD2-QRY-052` · `app/controllers/api/v1/chats_controller.rb:317-320`

## 6. The pickers behind "New Message" — vendors, line items, filters

#### API-EVDQRY-053 — The buyer's vendor picker lists the event's invited vendors
- **Why it matters.** The "Select vendor(s)" box is filled from this call; an error means the buyer cannot ask any vendor anything.
- **Setup.** A published RFQ with QA vendor 1 invited. Read only.
- **Steps.** As the buyer, `GET /v1/chats/get_possible_participants?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200, a list of `{uuid, name, vendor_code, location}`; it contains QA vendor 1 when its relationship status is one of the company's allowed vendor statuses.
- **Oracle.** 200; array.
- **Trace.** P1 · automate · `EVD2-QRY-053` · `app/controllers/api/v1/chats_controller.rb:237-251,261-270`

#### API-EVDQRY-054 — A vendor can read the list of competing vendors invited to the event
- **Why it matters.** The vendor screen never needs recipients (the code comment says so), yet the participant picker and the "Vendor" filter answer a vendor with every invited vendor's name, vendor code and city — the competitor list of a sealed RFQ.
- **Setup.** A live RFQ with QA vendors 1 and 2 invited. Manual (needs vendor 2 invited; the shared direct-runner event invites only vendor 1).
- **Steps.** As QA vendor 1, `GET /v1/chats/get_possible_participants?module=EventGroup&module_uuid=:id` and `GET /v1/chats/filter_options?module=EventGroup&module_uuid=:id`.
- **Expected.** Should be refused (455) or limited to the vendor itself. Today 200 listing QA vendor 2 with its vendor code and city.
- **Oracle.** QA vendor 2 present in a vendor's answer.
- **Trace.** P0 · manual · `app/controllers/api/v1/chats_controller.rb:108,242-251,278-286` · `app/controllers/concerns/chats_controller_helper.rb:445-457`

#### API-EVDQRY-055 — The vendor picker on a draft event crashes
- **Why it matters.** Unlike the list, this action does not check the event was found before `authorize`; drafts are filtered out by status, so a draft id is a 500.
- **Setup.** A draft event with an unpublished RFQ round, owned by the run's buyer.
- **Steps.** As the owner, `GET /v1/chats/get_possible_participants?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** Should be 422 code 533. Today `authorize(nil, :show?)` → Pundit::NotDefinedError → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-QRY-055` · `app/controllers/api/v1/chats_controller.rb:243-244`

#### API-EVDQRY-056 — The vendor picker without an event id crashes
- **Why it matters.** With the module but no id, no branch sets the participant list and the code maps over nil.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_possible_participants?module=EventGroup`.
- **Expected.** Should be 422 code 2. Today `nil.map` → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-056` · `app/controllers/api/v1/chats_controller.rb:240-242,261`

#### API-EVDQRY-057 — The vendor picker for an unknown onboarding response crashes
- **Why it matters.** The FxResponse branch calls `fetch_vendor_details` on the result of `find_by_id` without a nil check (and without any permission check).
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_possible_participants?module=FxResponse&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Should be 422. Today `nil.fetch_vendor_details` → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-057` · `app/controllers/api/v1/chats_controller.rb:252-255`

#### API-EVDQRY-058 — The buyer's line-item picker lists the event's line items
- **Why it matters.** Technical and commercial queries must name line items; this call fills "Select line item(s)" with label, encoded id and the suggested assignee.
- **Setup.** A published RFQ with one line item. Read only.
- **Steps.** As the buyer, `GET /v1/chats/get_reference_options?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200, one option `{label: "1. | <code> | <name>", value, info, assignee_uuid}` (assignee empty because no context is sent).
- **Oracle.** 200; one option.
- **Trace.** P1 · automate · `EVD2-QRY-058` · `app/controllers/api/v1/chats_controller.rb:289-315`

#### API-EVDQRY-059 — An invited vendor's line-item picker
- **Why it matters.** Vendors raise line-item queries too; the picker must open for an invited vendor.
- **Setup.** A published RFQ with QA vendor 1 invited. Read only.
- **Steps.** As QA vendor 1, `GET /v1/chats/get_reference_options?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200 with the event's line item.
- **Oracle.** 200; array.
- **Trace.** P2 · automate · `EVD2-QRY-059` · `app/controllers/api/v1/chats_controller.rb:296-299` · `app/controllers/concerns/event_group_controller_helper.rb:2534-2555`

#### API-EVDQRY-060 — A vendor cannot list the line items of a draft event
- **Why it matters.** This picker looks the event up with no status filter at all, so the permission check alone keeps draft contents from vendors.
- **Setup.** A draft event with an unpublished RFQ round.
- **Steps.** As QA vendor 1, `GET /v1/chats/get_reference_options?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** Refused. HTTP 422, code 455 "You are not authorized to perform this action".
- **Oracle.** 422 code 455.
- **Trace.** P1 · automate · `EVD2-QRY-060` · `app/controllers/api/v1/chats_controller.rb:297-298` · `app/models/event_group.rb:511-514`

#### API-EVDQRY-061 — The line-item picker for an unknown event crashes
- **Why it matters.** `authorize nil` again (no existence check).
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_reference_options?module=EventGroup&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Should be 422 code 533. Today Pundit::NotDefinedError → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · automate · `EVD2-QRY-061` · `app/controllers/api/v1/chats_controller.rb:297-298`

#### API-EVDQRY-062 — The line-item picker for an unsupported module crashes
- **Why it matters.** Only EventGroup and PurchaseRequest set the line-item list; any other module name (including FxResponse, which the screen supports) maps over nil.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_reference_options?module=FxResponse&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Should be 422 code 2 (or an empty list). Today `nil.map` → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-062` · `app/controllers/api/v1/chats_controller.rb:296-305`

#### API-EVDQRY-063 — The line-item picker without an event id
- **Why it matters.** This action, unlike the vendor picker, checks for a missing id first.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_reference_options?module=EventGroup`.
- **Expected.** Refused. HTTP 422, code 2 "Insufficient parameters".
- **Oracle.** 422 code 2.
- **Trace.** P2 · automate · `EVD2-QRY-063` · `app/controllers/api/v1/chats_controller.rb:293-295`

#### API-EVDQRY-064 — Deleted line items are offered for new queries
- **Why it matters.** The picker includes line items with status `deleted` (the filter list does not). A vendor can raise a query on an item the buyer already removed, which then lands on a line the buyer no longer sees.
- **Setup.** A live event with two line items, one deleted after publishing (QA event). Manual.
- **Steps.** As QA vendor 1, `GET /v1/chats/get_reference_options?module=EventGroup&module_uuid=:id`; compare with `GET /v1/chats/filter_options` (Line Item options).
- **Expected.** Only active items. **Expected (today).** The deleted item is offered by the picker but not by the filter.
- **Oracle.** Option count differs between the two calls.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:2534-2537` · `app/controllers/concerns/chats_controller_helper.rb:431-432`

#### API-EVDQRY-065 — On a lot event a vendor sees line items of lots it was not invited to
- **Why it matters.** Vendor-side, the picker returns every line item of the event; only buyer planning-team users are narrowed. A vendor invited to lot 1 learns the products and quantities of lot 2.
- **Setup.** A live lot event (two lots, QA vendor 1 invited to lot 1 only). Manual.
- **Steps.** As QA vendor 1, `GET /v1/chats/get_reference_options?module=EventGroup&module_uuid=:id`.
- **Expected.** Only lot-1 line items. Today all line items.
- **Oracle.** A lot-2 product in the vendor's options.
- **Trace.** P1 · manual · `app/controllers/api/v1/chats_controller.rb:299` · `app/controllers/concerns/event_group_controller_helper.rb:2540-2554`

#### API-EVDQRY-066 — The buyer's filter options for the thread list
- **Why it matters.** The filter bar (Line Item, Vendor, Status, Type) is built from this call.
- **Setup.** A published RFQ. Read only.
- **Steps.** As the buyer, `GET /v1/chats/filter_options?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** HTTP 200, `data` with four filters: `reference_uuids` (Line Item), `company_uuids` (Vendor), `resolution_status` (Closed/Open), `title` (General / Technical / Commercial).
- **Oracle.** 200; four keys in that order.
- **Trace.** P2 · automate · `EVD2-QRY-066` · `app/controllers/api/v1/chats_controller.rb:273-287` · `app/controllers/concerns/chats_controller_helper.rb:402-428`

#### API-EVDQRY-067 — Filter options for an event that does not exist
- **Why it matters.** This action does check existence first, so it is the clean counterpart of cases 014/055/061.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/filter_options?module=EventGroup&module_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Refused. HTTP 422, code 533 "Project does not exist.".
- **Oracle.** 422 code 533.
- **Trace.** P2 · automate · `EVD2-QRY-067` · `app/controllers/api/v1/chats_controller.rb:279-280`

#### API-EVDQRY-068 — Filter options without an event id crash
- **Why it matters.** With the module but no id, `eg` stays nil and is passed to a method typed `EventGroup` (and then dereferenced).
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/filter_options?module=EventGroup`.
- **Expected.** Should be 422 code 2. Today the Sorbet signature (or `nil.event_group_line_items`) raises → HTTP 500.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P2 · automate · `EVD2-QRY-068` · `app/controllers/api/v1/chats_controller.rb:276-286` · `app/controllers/concerns/chats_controller_helper.rb:401-405`

#### API-EVDQRY-069 — Filter options on a draft event
- **Why it matters.** Drafts are excluded by status; the refusal must be clean.
- **Setup.** A draft event with an unpublished RFQ round, owned by the run's buyer.
- **Steps.** As the owner, `GET /v1/chats/filter_options?module=EventGroup&module_uuid={{eventGroupUuid}}`.
- **Expected.** Refused. HTTP 422, code 533 "Project does not exist.".
- **Oracle.** 422 code 533.
- **Trace.** P2 · automate · `EVD2-QRY-069` · `app/controllers/api/v1/chats_controller.rb:279-280`

## 7. Per-vendor unresolved counts on the comparison sheet — `GET /v1/chats/get_unresolved_queries_count`

#### API-EVDQRY-070 — The buyer reads per-vendor unresolved counts on a round with a bid
- **Why it matters.** The comparison sheet shows a red message badge on each vendor column with open queries; the dashboard calls this with `event_uuid=<round uuid>` once the round has bids.
- **Setup.** A live RFQ where QA vendor 1 has submitted a bid; no queries. Read only.
- **Steps.** As the buyer, `GET /v1/chats/get_unresolved_queries_count?event_uuid={{tradeId}}`.
- **Expected.** HTTP 200 with `{}` (no vendor has an open query).
- **Oracle.** 200; empty object.
- **Trace.** P1 · automate · `EVD2-QRY-070` · `app/controllers/api/v1/chats_controller.rb:401-418` · `app/controllers/concerns/chats_controller_helper.rb:500-513` · `procol-client-dashboard src/redux/orders/api.js:175-178`

#### API-EVDQRY-071 — Per-vendor counts for a round that does not exist
- **Why it matters.** The round id is the only input; an unknown one must be refused.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /v1/chats/get_unresolved_queries_count?event_uuid=Z2dnWmdaUWtnZw==`.
- **Expected.** Refused. HTTP 422, code 101 "You are not allowed to perform this action".
- **Oracle.** 422 code 101.
- **Trace.** P2 · automate · `EVD2-QRY-071` · `app/controllers/api/v1/chats_controller.rb:402-404`

#### API-EVDQRY-072 — Per-vendor counts have no permission check at all
- **Why it matters.** The action never calls `authorize`. Any signed-in user — another company's buyer, or a vendor invited to the round — gets, for that round, the company uuid of every vendor who has submitted a bid AND has an open query, with the count. For a vendor that reveals which competitors bid. It also accepts a raw numeric `event_id`, which makes enumeration trivial.
- **Setup.** A live RFQ with QA vendors 1 and 2 bidding and an open query from QA vendor 2 (QA records only; never probe other companies' ids). Manual.
- **Steps.** As QA vendor 1, `GET /v1/chats/get_unresolved_queries_count?event_uuid=:roundUuid`.
- **Expected.** Should be 455 for anyone who cannot manage the round. Today 200 with `{"<vendor 2 company uuid>": {"unresolved_query_count": 1}}`.
- **Oracle.** QA vendor 2's company uuid in a vendor's answer.
- **Trace.** P0 · manual · `app/controllers/api/v1/chats_controller.rb:401-418`

#### API-EVDQRY-073 — A vendor's queries on other events are counted on this round
- **Why it matters.** The "general" pattern is `%EG_<id>%` (no end anchor), so for event 12 it also matches general queries of events 120…, 1200…; the result is limited only to vendors who bid on this round. A vendor that asked something on another event shows an unresolved badge here.
- **Setup.** Two QA events with prefix-related ids (see case 009) and the same QA vendor bidding on the shorter-id one with an open general query on the longer-id one. Manual.
- **Steps.** `GET /v1/chats/get_unresolved_queries_count?event_uuid=:shortEventRound`.
- **Expected.** `{}`. Today the vendor shows a count of 1.
- **Oracle.** A count with no thread on this event.
- **Trace.** P2 · manual · `app/controllers/concerns/chats_controller_helper.rb:500-512`

## 8. Personal one-to-one chats — `/chats` (console and vendor apps)

#### API-EVDQRY-074 — Listing my personal chats
- **Why it matters.** The older chat inbox (not tied to an event) must open for any signed-in user.
- **Setup.** The run's buyer. Read only.
- **Steps.** `GET /chats`.
- **Expected.** HTTP 200 with `total_unread_chats` and a `chats` list (possibly empty).
- **Oracle.** 200.
- **Trace.** P2 · automate · `EVD2-QRY-074` · `app/controllers/api/chats_controller.rb:8-33` · `app/views/api/chats/index.json.jbuilder`

#### API-EVDQRY-075 — Opening a personal chat that does not exist
- **Why it matters.** Clean refusal for a stale deep link.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /chats/Z2dnWmdaUWtnZw==`.
- **Expected.** Refused. HTTP 422, code 475 "Chat not found".
- **Oracle.** 422 code 475.
- **Trace.** P2 · automate · `EVD2-QRY-075` · `app/controllers/api/chats_controller.rb:35-38`

#### API-EVDQRY-076 — Messages of a personal chat that does not exist
- **Why it matters.** The conversation call uses a different code from the show call for the same "not found".
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /chats/Z2dnWmdaUWtnZw==/conversations`.
- **Expected.** Refused. HTTP 422, code 15 "Operation failed".
- **Oracle.** 422 code 15.
- **Trace.** P2 · automate · `EVD2-QRY-076` · `app/controllers/api/chats_controller.rb:62-69`

#### API-EVDQRY-077 — Sending into a personal chat you are not part of
- **Why it matters.** The participant check is the only thing between a user and someone else's private chat.
- **Setup.** Any signed-in buyer.
- **Steps.** `POST /chats/Z2dnWmdaUWtnZw==/send` with `{"message": "QA_Platform_dm_{{stamp}}"}`.
- **Expected.** Refused, nothing saved. HTTP 422, code 4 "Request not found".
- **Oracle.** 422 code 4.
- **Trace.** P1 · automate · `EVD2-QRY-077` · `app/controllers/api/chats_controller.rb:84-96`

#### API-EVDQRY-078 — Starting a personal chat with a user who does not exist
- **Why it matters.** Starting a chat creates it on first call; the "may these two users talk" check must refuse before anything is created.
- **Setup.** Any signed-in buyer.
- **Steps.** `GET /chats/get_chat_id?user_id=999999999`.
- **Expected.** Refused, no chat created. HTTP 422, code 101 "You are not allowed to perform this action".
- **Oracle.** 422 code 101.
- **Trace.** P2 · automate · `EVD2-QRY-078` · `app/controllers/api/chats_controller.rb:44-51` · `app/models/chat.rb:146-154`

#### API-EVDQRY-079 — The message "context" type is turned into a class name without an allow-list
- **Why it matters.** `item_type` is passed to `constantize` and queried by id with no ownership check. "TradeRequest" or "Bid" with an unknown id crashes on `nil.unit_value`; any model name is accepted and another company's record can be attached as context.
- **Setup.** A personal chat between two QA buyers (manual: creating it writes).
- **Steps.** `POST /chats/:chatUuid/send` with `{"message": "QA_Platform_dm_<stamp>", "item_type": "TradeRequest", "item_id": 999999999}`.
- **Expected.** Should be 422 (unknown item). Today `nil.unit_value` → HTTP 500 before save; with an allowed-looking but foreign id the context is saved.
- **Oracle.** Any 5xx is the defect.
- **Trace.** P1 · manual · `app/controllers/api/chats_controller.rb:150-158`

## 9. Screens — the Messages drawer in the buyer console

#### UI-EVDQRY-080 — The Messages button appears only on live events of companies that enabled it
- **Why it matters.** The button is the only way into queries; it is gated by the company setting `show_communication_module` and hidden on drafts.
- **Setup.** A live and a draft event in a company with `show_communication_module` ON; a company with it OFF.
- **Steps.** Open each event's detail page.
- **Expected.** Live event, setting ON: "Messages" button visible. Draft: hidden. Setting OFF: hidden everywhere.
- **Oracle.** Button presence per case.
- **Trace.** P2 · manual · `procol-client-dashboard src/views/projectDetails/projectDetails.jsx:1056-1063` · `src/redux/communication/selectors.js:20-21`

#### UI-EVDQRY-081 — The badge shows open threads and refreshes every 30 seconds
- **Why it matters.** Buyers rely on the badge to notice new vendor questions without reopening the drawer.
- **Setup.** A live QA event; QA vendor 1 raises a general query while the buyer has the page open.
- **Steps.** Keep the event page open for up to 40 seconds.
- **Expected.** A dot appears when there is any thread; the number tag shows the unresolved count and updates within one 30-second poll.
- **Oracle.** Tag text equals `unresolved_threads_count` from the count call.
- **Trace.** P2 · manual · `procol-client-dashboard src/components/communicationDrawer/communication.jsx:14,57-66,70-86`

#### UI-EVDQRY-082 — New Message form refuses incomplete queries; planners can only ask technical ones
- **Why it matters.** The form is the buyer's validation layer (the API has almost none, see cases 024/027).
- **Setup.** A live QA event; a normal buyer and a planner-team user.
- **Steps.** Click "Message" and try: no vendor; no "Message Regarding"; technical without a line item; blank text and no file. Repeat as a planner.
- **Expected.** Each missing field is outlined red and nothing is sent. Planner: "Message Regarding" is locked to the first option and the request is sent as technical.
- **Oracle.** No create request in the network log until all required fields are filled.
- **Trace.** P2 · manual · `procol-client-dashboard src/components/communicationDrawer/components/newMessageForm/newMessageForm.jsx:88-136,258-280`

#### UI-EVDQRY-083 — After award the "Message" button is disabled when blocking is enabled
- **Why it matters.** The setting `enable_block_message` is meant to stop new queries once the award is decided; the screen enforces it, the API does not (case 031).
- **Setup.** Company with `enable_block_message` ON; an event with a submitted proposal.
- **Steps.** Open the Messages drawer.
- **Expected.** The "Message" button is disabled; existing threads still open.
- **Oracle.** Button disabled ↔ event `block_new_message: true`.
- **Trace.** P2 · manual · `procol-client-dashboard src/components/communicationDrawer/components/threadList/threadList.jsx:38,162-170` · `src/redux/project/slice.js:362`

#### UI-EVDQRY-084 — Resolve and reply controls follow the assignment
- **Why it matters.** Only the assignee sees "Mark as Resolve"; once resolved the reply box and the assignee picker are disabled with "You can't reply to a resolved message". The assignee picker is shown only when the thread went to a single vendor.
- **Setup.** A thread assigned to the owner (single vendor) and a thread sent to two vendors.
- **Steps.** Open each as the owner and as a team-mate; resolve one as the owner.
- **Expected.** Owner sees "Mark as Resolve", team-mate does not; after resolving, "Closed by <name>" shows and the reply box is disabled; the two-vendor thread shows no assignee picker in the message view.
- **Oracle.** Controls per user/state as described.
- **Trace.** P2 · manual · `procol-client-dashboard src/components/communicationDrawer/components/messageDetails/messageDetails.jsx:160-212,249-251` · `src/components/communicationDrawer/components/threadDetails/threadDetails.jsx:181-198`

#### UI-EVDQRY-085 — The comparison sheet flags vendors with open queries
- **Why it matters.** The per-vendor badge lets the buyer clear doubts before awarding; it is skipped when the round hides bidding stats or the module is off.
- **Setup.** A live RFQ with a QA vendor bid and an open query from that vendor; a second round with `trade_config.show_bidding_stats` on.
- **Steps.** Open each round's comparison sheet.
- **Expected.** Round 1: the vendor's column header shows a message badge with the count; clicking it opens the Messages drawer. Round 2: no badge and no count request.
- **Oracle.** Badge number equals `unresolved_query_count` for that company.
- **Trace.** P2 · manual · `procol-client-dashboard src/views/orderDetails/orderDetails.jsx:1051-1058` · `src/components/dataGrid/formatters/comparisonHeaderFormatter.jsx:454-457,1352-1368`

#### UI-EVDQRY-086 — A deep link opens the drawer straight on a thread
- **Why it matters.** E-mails and notifications link to `?msgVisible=true&id=<thread>&idType=thread`; the drawer must open on that thread and closing it must clear the link parameters.
- **Setup.** A live QA event with a thread.
- **Steps.** Open the event URL with `?msgVisible=true&id=<thread uuid>&idType=thread`; then close the drawer.
- **Expected.** The drawer opens on "Messages Details" for that thread; closing removes `msgVisible`, `id`, `idType` and `q` from the URL.
- **Oracle.** URL parameters after close.
- **Trace.** P2 · manual · `procol-client-dashboard src/components/communicationDrawer/communicationDrawer.jsx:27-36` · `src/components/communicationDrawer/communication.jsx:29-55`
