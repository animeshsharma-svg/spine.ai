# Events list and housekeeping — deep cases (LST)

Deep cases for the events list (Live / History / Drafts / Recurring tabs, search, filters, sort, tab counts, card refresh), list export, project cloning and owner change, and who sees which events. Grounded in `procol-backend` at `origin/main` and `procol-client-dashboard`. API cases are `API-XDLST-NNN`; where a runnable twin exists it is `EDGE-DLST-NNN` in `prototype/data/api-cases-extra/deep-lst.json` with the same number. Screen cases are `UI-XDLST-NNN`.

**Read before running.** The events list is `GET /event_groups` (not `GET /orders`, which lists purchase orders). List filters travel as a JSON string in `filters`; uuids inside it are decoded by `CommonFunctions.parse_filters`. `Z2dnWmdaUWtnZw==` decodes to id 999999999 (no such row); `WrongUuid1=` decodes to nil. PROCOL DEMO settings at the time of writing: restrict_event_visibility_to_owner off, allowed_to_clone_project off, scheduled_events_enabled on, event_groups_tab_counts_enabled on, allow_draft_project_creation on, is_download_bulk_report_disabled_for_members off.

## 1. The Live tab list — GET /event_groups

The Live tab calls `GET /event_groups` with `latest_cursor`, `newest_cursor`, a JSON `filters` string (title, dates, stage status, saved filters) and `sort_by`/`sort_direction` (useOrdersListViewModel.js:188-201). Ten projects per page, cursor-paginated on the sort column (trade_controller_helper.rb:2392-2407). This exact path is not on the runner's allowlist (`GET /event_groups/<x>` is, the bare list is not), so these twins need the coordinator to allow `GET /event_groups?…` — every one of them is a read.

#### API-XDLST-001 — The Live list answers with its four keys and includes the run's open sandbox event
- **Why it matters.** Every buyer lands here after login. If the response shape or the sandbox's presence regresses, the Live tab is empty or broken for everyone and later cases cannot find their own event.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Ask for the first page of the Live list with no parameters. `GET /event_groups`
- **Expected.** HTTP 200 with `event_groups` (at most 10 cards), `cursor`, `updated_projects_present` and `event_group_count`. The sandbox event is one of the cards (newest id first); none of the cards is a recurring template or a closed project.
- **Oracle.** Response keys present; a card whose ref id is the sandbox's; `event_group_count` ≥ number of cards.
- **Trace.** P1 · automate · `EDGE-DLST-001` · `app/controllers/api/event_groups_controller.rb:290-329` · `app/controllers/concerns/event_group_controller_helper.rb:670-680` · `app/controllers/concerns/trade_controller_helper.rb:2320-2370`

#### API-XDLST-002 — A garbage pagination cursor returns an empty page, not an error
- **Why it matters.** The cursor is echoed back from the previous page and compared against the sort column; a client that corrupts it (stale tab, manual URL) must get an empty page, never a database error.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Ask for the Live list with a non-numeric cursor. `GET /event_groups?latest_cursor=abc`
- **Expected.** HTTP 200. The cursor is type-cast to the id column ("abc" becomes 0), so the page holds no cards while `event_group_count` still shows the real total. No 500.
- **Oracle.** 200; `event_groups` is empty; `event_group_count` equals the baseline's.
- **Trace.** P2 · automate · `EDGE-DLST-002` · `app/controllers/concerns/trade_controller_helper.rb:2392-2407`

#### API-XDLST-003 — An unknown sort column and direction fall back to newest-first
- **Why it matters.** sort_by is turned into a column name for ORDER BY and for the cursor comparison. Anything outside the allow-list must fall back, otherwise the parameter is an injection point.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Ask for the Live list sorted by a hostile column name and a nonsense direction. `GET /event_groups?sort_by=title%3BDROP%20TABLE%20event_groups&sort_direction=sideways`
- **Expected.** HTTP 200, sorted by id descending, exactly like the baseline. Only id, created_at, updated_at and latest_stage_time are accepted; the direction must be asc or desc.
- **Oracle.** Same card order as the baseline; no 500.
- **Trace.** P1 · automate · `EDGE-DLST-003` · `app/controllers/concerns/trade_controller_helper.rb:6807-6820` · `app/models/event_group.rb:96-108` · `app/models/event_group.rb:216-218`

#### API-XDLST-004 — Sorting by two columns, the way the screen builds it, is silently ignored
- **Why it matters.** The dashboard joins every chosen sorter with commas (sort_by=created_at,id). The backend accepts a single column only, so a multi-sort silently becomes newest-id-first. Today the Sorter offers only 'RFX Number', so this is latent — the day a second sortable column is added, users will see their sort ignored.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Ask for the Live list with two sort columns. `GET /event_groups?sort_by=created_at%2Cid&sort_direction=asc%2Cdesc`
- **Expected.** HTTP 200, ordered by id descending (the fallback), not by created_at ascending. No error tells the client its sort was dropped.
- **Oracle.** Card order equals the baseline order, not the oldest-first order the request asked for.
- **Trace.** P2 · automate · `EDGE-DLST-004` · `procol-client-dashboard/src/viewModels/orders/useOrdersListViewModel.js:199-200` · `procol-client-dashboard/src/views/orders/constants.js:224-229` · `app/controllers/concerns/trade_controller_helper.rb:6807-6811`

#### API-XDLST-005 — Unreadable filters and search together crash the Live list
- **Why it matters.** `filters` and `search` are both JSON strings. When `filters` does not parse, the code falls back to `search`; when that does not parse either, the filter hash is left as nothing at all and the list code dereferences it. A stale bookmark or a bad client is enough to take the Live tab down with an untyped 500.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Ask for the Live list with both parameters unparsable. `GET /event_groups?filters=notjson&search=notjson`
- **Expected.** Should answer 200 with the unfiltered list (or a 422). Today: parse_filters swallows the first error and returns nil, the fallback JSON.parse(search) raises inside a rescue, @filters stays nil, and filter_on_date reads @filters["starting_from"] → NoMethodError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P1 · automate · `EDGE-DLST-005` · `lib/common_functions.rb:83-96` · `app/controllers/api/event_groups_controller.rb:1578-1609` · `app/controllers/concerns/trade_controller_filter_helper.rb:199-201`

#### API-XDLST-006 — Picking a date range on the Live tab hides every event that is still running
- **Why it matters.** The Live tab has the same date picker as History. The chosen 'to' date is clamped to now and then compared with each stage's closed_at — but a running stage closes in the future, so it is filtered out. A buyer who narrows Live to 'this month' sees an empty or partial list and thinks their events vanished.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab. The sandbox's bid window ends ~30 minutes in the future.
- **Steps.** Ask for the Live list for a range from 1 Jan 2024 to 2100 (the backend clamps the end to now). `GET /event_groups?filters=%7B%22starting_from%22%3A1704067200%2C%22ending_at%22%3A4102444800%7D`
- **Expected.** The sandbox (created inside the range) should still be listed. Today it is excluded: create_filter_params clamps ending_at to now and filter_on_date adds `trade_requests.closed_at <= now`, which no open stage satisfies.
- **Oracle.** Compare with the baseline: the sandbox card disappears and `event_group_count` drops to events whose stages already closed. A correct fix keeps the sandbox.
- **Trace.** P1 · automate · `EDGE-DLST-006` · `app/controllers/api/event_groups_controller.rb:1583-1585` · `app/controllers/concerns/trade_controller_filter_helper.rb:199-226` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:656-675`

#### API-XDLST-007 — The 'Live' stage filter keeps the open sandbox and drops events in evaluation
- **Why it matters.** The radio buttons All / Live / In-Evaluation / Upcoming become stage_status buckets that the backend expands to event statuses. A wrong mapping silently moves events between buckets.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Ask for the Live list filtered to stages in bidding. `GET /event_groups?filters=%7B%22stage_status%22%3A%5B%22bidding%22%5D%7D`
- **Expected.** HTTP 200. The sandbox (bidding open) is listed; events whose stages are all in evaluation are not.
- **Oracle.** Sandbox card present; every card has at least one stage whose bid window is open now.
- **Trace.** P1 · automate · `EDGE-DLST-007` · `app/controllers/api/event_groups_controller.rb:1611-1617` · `app/controllers/concerns/trade_controller_filter_helper.rb:528-552` · `procol-client-dashboard/src/views/orders/constants.js:178-196`

## 2. The History tab list — GET /event_groups/history

History is date-grouped and paginated by `last_updated_at` (20 stages per page, not 20 events). For a buyer it lists event groups whose `closed_at` is set (closed or withdrawn), status active or withdrawn. Every filter key in the JSON `filters` string goes through `apply_all_filters` (trade_controller_filter_helper.rb:114-144) — several of them assume a type and crash on any other.

#### API-XDLST-008 — History answers with date groups and a total, and never shows the open sandbox
- **Why it matters.** History is where buyers audit closed and withdrawn events; it must not leak events that are still running.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Ask for the first History page. `GET /event_groups/history`
- **Expected.** HTTP 200 with `event_groups` = [{date, data:[cards]}], `event_group_count` and `last_updated_at`. Only closed or withdrawn projects; the sandbox (still open, closed_at empty) is not among them.
- **Oracle.** Keys present; no card carries the sandbox's ref id.
- **Trace.** P1 · automate · `EDGE-DLST-008` · `app/controllers/api/event_groups_controller.rb:415-462` · `app/controllers/concerns/trade_controller_helper.rb:6012-6020` · `app/models/event_group.rb:147`

#### API-XDLST-009 — A text 'statuses' filter crashes History
- **Why it matters.** filter_on_statuses assumes an array and calls include?(2) on it. A single status sent as text — a natural mistake for an integrator or an old mobile build — becomes an untyped 500.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History by statuses given as the text "1". `GET /event_groups/history?filters=%7B%22statuses%22%3A%221%22%7D`
- **Expected.** Should answer 200 (ignored or coerced) or 422. Today: "1".include?(2) raises TypeError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P1 · automate · `EDGE-DLST-009` · `app/controllers/concerns/trade_controller_filter_helper.rb:241-252`

#### API-XDLST-010 — A minimum-quantity filter sent as a list crashes History
- **Why it matters.** min_quantity is converted with to_f, which only exists on numbers and strings. A list (what a multi-select widget would send) crashes the whole list.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History with min_quantity [5]. `GET /event_groups/history?filters=%7B%22min_quantity%22%3A%5B5%5D%7D`
- **Expected.** Should answer 200 or 422. Today [5].to_f raises NoMethodError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-010` · `app/controllers/concerns/trade_controller_filter_helper.rb:294-300`

#### API-XDLST-011 — A creator filter sent as a list under 'user_id' crashes History
- **Why it matters.** The singular user_id filter calls to_i on whatever arrives. The screen sends creator_ids (a list) — a client that reuses the list under the singular key takes the tab down.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History with user_id [1]. `GET /event_groups/history?filters=%7B%22user_id%22%3A%5B1%5D%7D`
- **Expected.** Should answer 200 or 422. Today [1].to_i raises NoMethodError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-011` · `app/controllers/concerns/trade_controller_filter_helper.rb:231-239`

#### API-XDLST-012 — A team filter holding objects instead of ids crashes History
- **Why it matters.** team_ids is checked to be an array, then every element gets to_i. Objects (e.g. {id, name} pairs straight from a select widget) have no to_i.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History with team_ids [{"id":1}]. `GET /event_groups/history?filters=%7B%22team_ids%22%3A%5B%7B%22id%22%3A1%7D%5D%7D`
- **Expected.** Should answer 200 or 422. Today Hash#to_i raises NoMethodError → HTTP 500. The same shape crashes delivery_zone_ids, vendor_ids, company_ids and product_category_ids, which use the same `.map(&:to_i)` guard.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-012` · `app/controllers/concerns/trade_controller_filter_helper.rb:335-340` · `app/controllers/concerns/trade_controller_filter_helper.rb:302-309` · `app/controllers/concerns/trade_controller_filter_helper.rb:343-358`

#### API-XDLST-013 — A start date millions of years ahead must not reach the database as a timestamp
- **Why it matters.** starting_from is an epoch number turned into a Time and sent to Postgres. A value past the database's timestamp range (year 294276) makes Postgres raise, which the app re-raises as a 500.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History from epoch 99999999999999. `GET /event_groups/history?filters=%7B%22starting_from%22%3A99999999999999%7D`
- **Expected.** Should answer 200 (empty) or 422. Expected today: `trade_requests.closed_at >= <year 3170843>` → Postgres out-of-range error → ActiveRecord::StatementInvalid re-raised → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-013` · `app/controllers/concerns/trade_controller_filter_helper.rb:199-218` · `app/controllers/concerns/conditional_api_caching.rb:40-41`

#### API-XDLST-014 — A legacy 'search' parameter holding a list crashes History
- **Why it matters.** When no filters are sent, the old `search` parameter becomes the whole filter object. A JSON list there replaces the filter hash with an array, and the next line indexes it with a string.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call History with search=[1] and no filters. `GET /event_groups/history?search=%5B1%5D`
- **Expected.** Should answer 200 or 422. Today @filters becomes [1] and get_data_for_history_page evaluates [1]["ending_at"] → TypeError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-014` · `app/controllers/api/event_groups_controller.rb:1604-1606` · `app/controllers/concerns/trade_controller_helper.rb:41-47`

#### API-XDLST-015 — A legacy 'search' parameter holding plain text crashes History
- **Why it matters.** Same path as the previous case but with a JSON string: String#[]= with a substring that is not there raises IndexError.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call History with search="x" (a JSON string). `GET /event_groups/history?search=%22x%22`
- **Expected.** Should answer 200 or 422. Today @filters becomes "x"; `"x"["ending_at"] = now` raises IndexError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-015` · `app/controllers/api/event_groups_controller.rb:1604-1606` · `app/controllers/concerns/trade_controller_helper.rb:41-43`

#### API-XDLST-016 — Unparsable filters on History are silently ignored and the full list comes back
- **Why it matters.** A broken filter string should either be refused or applied — never silently dropped, because the buyer then trusts an unfiltered list as filtered. This pins today's behaviour so a change is noticed.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call History with filters=notjson. `GET /event_groups/history?filters=notjson`
- **Expected.** HTTP 200 with exactly the unfiltered list (same `event_group_count` as the baseline). No hint that the filter was dropped.
- **Oracle.** event_group_count equals the baseline; no 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-016` · `lib/common_functions.rb:83-96` · `app/controllers/api/event_groups_controller.rb:1604-1606`

#### API-XDLST-017 — A non-numeric 'last_updated_at' returns an empty page instead of the first page
- **Why it matters.** History pages backwards from last_updated_at. Text becomes 0 → 1 Jan 1970, so the 'next page' is empty and infinite scroll stops early. A client bug here makes history look empty.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call History with last_updated_at=abc. `GET /event_groups/history?last_updated_at=abc`
- **Expected.** HTTP 200 with an empty `event_groups` list (everything closed after 1970 is excluded). No error.
- **Oracle.** event_groups empty while event_group_count is unchanged.
- **Trace.** P2 · automate · `EDGE-DLST-017` · `app/controllers/concerns/trade_controller_helper.rb:54` · `app/controllers/concerns/trade_controller_helper.rb:5995-6003`

#### API-XDLST-018 — The 'Withdrawn' History filter lists only withdrawn projects
- **Why it matters.** Withdrawn projects stay in History and buyers relaunch them from here. The bucket maps to in_active/withdrawn stages; a mapping slip would mix completed and withdrawn events.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History to withdrawn. `GET /event_groups/history?filters=%7B%22stage_status%22%3A%5B%22withdrawn%22%5D%7D`
- **Expected.** HTTP 200; every card has at least one withdrawn/removed stage; no purely completed event appears.
- **Oracle.** Every card's stages include a withdrawn one.
- **Trace.** P2 · automate · `EDGE-DLST-018` · `app/controllers/concerns/trade_controller_filter_helper.rb:528-536` · `procol-client-dashboard/src/views/orders/constants.js:163-176`

#### API-XDLST-019 — An unknown stage-status bucket is silently ignored
- **Why it matters.** Unknown buckets map to nothing and the filter disappears, returning the whole History. A typo in a saved view therefore shows everything instead of nothing.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History with an unknown bucket. `GET /event_groups/history?filters=%7B%22stage_status%22%3A%5B%22not_a_bucket%22%5D%7D`
- **Expected.** HTTP 200 with the unfiltered list (same count as the baseline).
- **Oracle.** event_group_count equals the baseline.
- **Trace.** P2 · automate · `EDGE-DLST-019` · `app/controllers/api/event_groups_controller.rb:1611-1617` · `app/controllers/concerns/trade_controller_filter_helper.rb:528-531`

#### API-XDLST-020 — An event status the user's role may not filter by is dropped, not applied
- **Why it matters.** The status list differs for purchasers and planners. Statuses outside the role's list are removed before filtering, so a purchaser cannot use planner-only statuses — and an unknown status silently shows everything.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History by a status that does not exist. `GET /event_groups/history?filters=%7B%22event_statuses%22%3A%5B%22not_a_status%22%5D%7D`
- **Expected.** HTTP 200 with the unfiltered list.
- **Oracle.** event_group_count equals the baseline.
- **Trace.** P2 · automate · `EDGE-DLST-020` · `app/controllers/api/event_groups_controller.rb:1619-1630`

#### API-XDLST-021 — The 'Auction' stage-type filter lists only events with an auction stage
- **Why it matters.** stage_type is expanded server-side to rfx modes (auction also means rfq_then_auction). A broken expansion hides converted auctions from the filter.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History to auctions. `GET /event_groups/history?filters=%7B%22stage_type%22%3A%5B%22auction%22%5D%7D`
- **Expected.** HTTP 200; every card has an auction or RFQ-then-auction stage.
- **Oracle.** All listed stages are auction-type.
- **Trace.** P2 · automate · `EDGE-DLST-021` · `app/controllers/api/event_groups_controller.rb:1586-1592` · `app/controllers/concerns/trade_controller_filter_helper.rb:191-197`

#### API-XDLST-022 — A creator filter with an undecodable id returns nothing rather than everything
- **Why it matters.** creator_uuids are decoded inside the filter JSON; an undecodable one becomes nil. The filter must then match nothing — falling open would show every colleague's events to someone who asked for one person's.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History by creator WrongUuid1=. `GET /event_groups/history?filters=%7B%22creator_uuids%22%3A%5B%22WrongUuid1%3D%22%5D%7D`
- **Expected.** HTTP 200 with no events (user_id IN (NULL) matches nothing).
- **Oracle.** event_groups empty.
- **Trace.** P2 · automate · `EDGE-DLST-022` · `app/controllers/concerns/params_auth.rb:70-84` · `app/controllers/concerns/trade_controller_helper.rb:6033-6043`

#### API-XDLST-023 — An unknown auction strategy in the filter does not crash History
- **Why it matters.** auction_strategy goes straight into an enum WHERE clause. Unknown enum values must not reach Postgres as a type error.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter History by auction_strategy "bogus". `GET /event_groups/history?filters=%7B%22auction_strategy%22%3A%22bogus%22%7D`
- **Expected.** HTTP 200 (empty or unfiltered), never 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-023` · `app/controllers/concerns/trade_controller_filter_helper.rb:161-166`

#### API-XDLST-024 — History pages hold 20 stages, so a page can show fewer than 20 events
- **Why it matters.** The page limit is applied to stages, then grouped into events. An event with many stages can take a whole page, and the next page's cursor can skip that event's remaining stages — buyers see 'missing' stages on history cards.
- **Setup.** Needs a company with an event whose stage count exceeds 20 or several multi-stage events closed in the same window; the sandbox has one stage, so this is not a runnable twin.
- **Steps.** Open History; scroll page by page; count events and stages per page.
- **Expected.** Each page covers at most 20 stages; every stage of every listed event appears on some page; no event repeats across pages.
- **Oracle.** Union of stages across pages equals the set of stages of closed events.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:86-99`

## 3. The Drafts tab — GET /event_groups/draft

Drafts show the caller's draft projects that were saved at least once (`draft_project_data.saved_count > 0`) and — less obviously — active projects that still have an unpublished stage. The action has no Pundit `authorize` call.

#### API-XDLST-025 — The Drafts list answers for the run's buyer and contains only their own drafts
- **Why it matters.** Drafts are private work in progress; a regression that lists colleagues' drafts leaks unpublished specs and prices.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The run's buyer has at least one saved draft (clones made by the case run land here).
- **Steps.** Ask for the Drafts list. `GET /event_groups/draft`
- **Expected.** HTTP 200 with date groups, `event_group_count`, `last_updated_at`. Every card was created by the caller (unless the caller is an auction-team member or super admin).
- **Oracle.** Every card's creator is the run's buyer.
- **Trace.** P1 · automate · `EDGE-DLST-025` · `app/controllers/api/event_groups_controller.rb:331-372` · `app/controllers/concerns/trade_controller_helper.rb:6113-6116` · `app/controllers/concerns/event_group_controller_helper.rb:908-917`

#### API-XDLST-026 — 'listing_view=true' keeps only drafts that came from purchase requests
- **Why it matters.** The PR screen reuses the Drafts endpoint with listing_view=true to offer 'add to an existing draft'. If the switch stops working, PR items get attached to unrelated drafts.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Ask for the Drafts list in listing view. `GET /event_groups/draft?listing_view=true`
- **Expected.** HTTP 200; every card is linked to at least one purchase request.
- **Oracle.** No card without a PR link.
- **Trace.** P2 · automate · `EDGE-DLST-026` · `app/controllers/api/event_groups_controller.rb:350-352`

#### API-XDLST-027 — A text 'statuses' filter crashes the Drafts list too
- **Why it matters.** Drafts share apply_all_filters with History, so the same type bug takes this tab down.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Filter Drafts with statuses "1". `GET /event_groups/draft?filters=%7B%22statuses%22%3A%221%22%7D`
- **Expected.** Should answer 200 or 422. Today HTTP 500 ("1".include?(2) → TypeError).
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-027` · `app/controllers/concerns/trade_controller_filter_helper.rb:241-252` · `app/controllers/concerns/trade_controller_helper.rb:101-118`

#### API-XDLST-028 — The Drafts list has no permission check of its own
- **Why it matters.** Every other list action calls authorize (index?/history?/all?). draft does not, so a user whose role lacks 'trade read' still gets an answer. Today the data is limited to their own drafts, but the missing check means any future widening of the query leaks immediately.
- **Setup.** Needs a second console user whose role has no trade read_record permission — not available to the runner.
- **Steps.** As that user, call `GET /event_groups/draft`; then `GET /event_groups/history`.
- **Expected.** Both should be refused with 455. Today history is refused (policy history? → index?) but draft answers 200.
- **Oracle.** draft and history give the same verdict.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:331-333` · `app/policies/event_group_policy.rb:9-15`

#### API-XDLST-029 — Active projects with an unpublished stage show up under Drafts
- **Why it matters.** fetch_event_groups_for_draft unions saved drafts with ACTIVE projects that still have a draft stage. Buyers find a live event under Drafts and may think it was unpublished.
- **Setup.** Needs an active event with an extra stage saved but not published; the sandbox has none.
- **Steps.** Publish an event, add a second stage and save it without publishing; open Drafts and Live.
- **Expected.** The project appears on both tabs; the Drafts card shows only the unpublished stage. Recurring templates never appear.
- **Oracle.** Card present on both tabs; is_scheduled_template projects absent.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:908-917`

## 4. Search text — the `title` key inside `filters`

The search box is debounced (1 s) and sent as `filters.title`; the backend matches it with ILIKE against stage title, stage ref id, event title and event ref id (trade_controller_filter_helper.rb:492-504). The value is bound as a parameter (no SQL injection) but `%` and `_` are not escaped. All twins use the History list because it is on the runner's allowlist; the Live and Drafts tabs run the same filter.

#### API-XDLST-030 — Searching '%' matches every event
- **Why it matters.** % is an SQL wildcard and is not escaped, so a buyer looking for '10% discount' or just '%' gets the entire list. Search results that ignore the text erode trust in the list.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History for '%'. `GET /event_groups/history?filters=%7B%22title%22%3A%22%25%22%7D`
- **Expected.** Should return only events whose title or ref id contains a literal '%'. Today it returns every event (count equals the unfiltered baseline). '_' behaves the same way as a one-character wildcard.
- **Oracle.** event_group_count equals the baseline (defect if so).
- **Trace.** P2 · automate · `EDGE-DLST-030` · `app/controllers/concerns/trade_controller_filter_helper.rb:492-504`

#### API-XDLST-031 — SQL-looking search text is treated as plain text
- **Why it matters.** The title is bound as :query, so classic payloads must simply find nothing. This guards the binding against a future refactor to string interpolation.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History for "' OR 1=1 --". `GET /event_groups/history?filters=%7B%22title%22%3A%22%27%20OR%201%3D1%20--%22%7D`
- **Expected.** HTTP 200 with no events (or only events literally containing that text). No 500, no full list.
- **Oracle.** event_groups empty; no 5xx.
- **Trace.** P1 · automate · `EDGE-DLST-031` · `app/controllers/concerns/trade_controller_filter_helper.rb:492-504`

#### API-XDLST-032 — Unicode search text (accents, CJK, emoji) works
- **Why it matters.** Vendors and products are named in many scripts; the search must not break on multi-byte input.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History for 'Ω≈ç√ 中文 😀 ñ'. `GET /event_groups/history?filters=%7B%22title%22%3A%22%CE%A9%E2%89%88%C3%A7%E2%88%9A%20%E4%B8%AD%E6%96%87%20%F0%9F%98%80%20%C3%B1%22%7D`
- **Expected.** HTTP 200 (normally no matches). No 500, no encoding error.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-032` · `app/controllers/concerns/trade_controller_filter_helper.rb:492-504`

#### API-XDLST-033 — A 2,000-character search does not crash the list
- **Why it matters.** There is no length cap on the search text. Very long input should be refused or simply match nothing, not time out or 500.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History for 'QA_Platform_' followed by 1,988 'A's (2,000 characters). `GET /event_groups/history?filters={"title":"QA_Platform_AAAA…"}`
- **Expected.** HTTP 200 with no matches, answered quickly. No 500 or gateway timeout.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-033` · `app/controllers/concerns/trade_controller_filter_helper.rb:492-504`

#### API-XDLST-034 — Script tags in the search text are stripped, not executed or crashed on
- **Why it matters.** Every string parameter is HTML-stripped before the controller runs — including the whole JSON filters string. Search text with markup must not break the JSON or crash the list.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History for '<script>alert(1)</script>'. `GET /event_groups/history?filters=%7B%22title%22%3A%22%3Cscript%3Ealert%281%29%3C%2Fscript%3E%22%7D`
- **Expected.** HTTP 200; the tags are stripped before parsing so the search runs on the remaining text (or nothing). No 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-034` · `app/controllers/concerns/params_auth.rb:18-42`

#### API-XDLST-035 — Searching for the run's naming prefix finds the closed QA events
- **Why it matters.** Positive control: searching by a known title fragment must find events by event title (not only by stage title).
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History for 'QA_Platform_'. `GET /event_groups/history?filters=%7B%22title%22%3A%22QA_Platform_%22%7D`
- **Expected.** HTTP 200; every card's event title or a stage title/ref id contains 'QA_Platform_' (case-insensitive).
- **Oracle.** Non-empty result where QA history exists; every card matches.
- **Trace.** P1 · automate · `EDGE-DLST-035` · `app/controllers/concerns/trade_controller_filter_helper.rb:492-504`

#### API-XDLST-036 — A search value that is a list instead of text does not crash
- **Why it matters.** The title is interpolated into a LIKE pattern; a list turns into its printed form ("[\"a\", \"b\"]"). It must not 500.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Search History with title ["a","b"]. `GET /event_groups/history?filters=%7B%22title%22%3A%5B%22a%22%2C%22b%22%5D%7D`
- **Expected.** HTTP 200 (no matches). Ideally a 422 for a non-text title.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-036` · `app/controllers/concerns/trade_controller_filter_helper.rb:492-496`

#### API-XDLST-037 — The legacy 'search' parameter still filters when 'filters' is absent
- **Why it matters.** Older mobile builds send search={json}. It is the fallback when filters is empty; if it silently stops working, those users see unfiltered lists.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Company has closed QA_Platform_ events in History.
- **Steps.** Call History with search={"title":"QA_Platform_"} and no filters. `GET /event_groups/history?search=%7B%22title%22%3A%22QA_Platform_%22%7D`
- **Expected.** HTTP 200 with the same result as the filters-based search for 'QA_Platform_'.
- **Oracle.** Same event_group_count as the positive search case.
- **Trace.** P2 · automate · `EDGE-DLST-037` · `app/controllers/api/event_groups_controller.rb:1604-1606`

## 5. Tab counts — GET /event_groups/tab_counts

Badges for Live / Draft / History. Gated by `event_groups_tab_counts_enabled`; Draft is counted only when `allow_draft_project_creation` is on or the user has Clara access. Results are cached for 30 minutes under a key made of user + company only (event_group.rb:161-163), and that cache is cleared only when the user's saved view changes (user_preference.rb:38).

#### API-XDLST-038 — Tab counts answer live, draft and history numbers when the feature is on
- **Why it matters.** The badges are the first numbers a buyer sees. Wrong or missing counts make them distrust the list.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. event_groups_tab_counts_enabled is ON (it is on PROCOL DEMO).
- **Steps.** Ask for the tab counts. `GET /event_groups/tab_counts`
- **Expected.** HTTP 200 {data:[{key:'live',item_count:n},{key:'draft',…},{key:'history',…}]} with numbers (draft may be null when allow_draft_project_creation is off and the user has no Clara access).
- **Oracle.** live item_count ≥ 1 (the sandbox) and equals event_group_count of GET /event_groups with the same saved view.
- **Trace.** P1 · automate · `EDGE-DLST-038` · `app/controllers/api/event_groups_controller.rb:778-824`

#### API-XDLST-039 — With tab counts switched off, the badges come back empty instead of failing
- **Why it matters.** Companies without the feature must still get a well-formed answer so the screen renders tabs without numbers.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. event_groups_tab_counts_enabled is OFF (skipped on PROCOL DEMO, where it is on).
- **Steps.** Ask for the tab counts. `GET /event_groups/tab_counts`
- **Expected.** HTTP 200 with the three keys and item_count null for each.
- **Oracle.** All item_count values are null.
- **Trace.** P2 · automate · `EDGE-DLST-039` · `app/controllers/api/event_groups_controller.rb:781-789`

#### API-XDLST-040 — Tab counts ignore an explicit filter once cached, and a filtered call poisons them for 30 minutes
- **Why it matters.** The cache key has no filter in it. A call with a filter returns whatever is cached; if the cache was cold, the FILTERED numbers are stored and every later unfiltered call shows them for 30 minutes. The screen only sends no filters, but any other client (mobile, integrations) can make a buyer's badges wrong.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. event_groups_tab_counts_enabled is ON.
- **Steps.** Ask for tab counts filtered to a title nothing matches. `GET /event_groups/tab_counts?filters=%7B%22title%22%3A%22QA_Platform_no_match_{{stamp}}%22%7D`. Then ask again without filters.
- **Expected.** Filtered call: counts reflect the filter (0). Unfiltered call afterwards: real counts. Today either the first call returns the cached unfiltered numbers, or (cache cold) it stores zeros that the second call then returns.
- **Oracle.** Compare the two answers with GET /event_groups event_group_count; any mismatch is the defect.
- **Trace.** P1 · automate · `EDGE-DLST-040` · `app/controllers/api/event_groups_controller.rb:791-793` · `app/models/event_group.rb:161-163` · `app/models/user_preference.rb:38`

#### API-XDLST-041 — Tab counts stay stale for up to 30 minutes after a new event is published
- **Why it matters.** The cache is only cleared when the user's saved view changes. After publishing, the Live badge still shows the old number while the list below already shows the new card.
- **Setup.** Needs a before/after around a publish within the same 30-minute window; the case runner builds the sandbox before cases run, so the 'before' value is not observable from a case.
- **Steps.** 1. GET /event_groups/tab_counts and note live. 2. Publish a new QA_Platform_ event. 3. GET tab_counts again and GET /event_groups.
- **Expected.** The live count increases by one. Today it stays unchanged until the 30-minute cache expires.
- **Oracle.** tab_counts live vs GET /event_groups event_group_count after the publish.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:793` · `app/models/user_preference.rb:38`

#### API-XDLST-042 — The Draft badge is empty when draft creation is off and the user has no Clara access
- **Why it matters.** Companies without draft-project creation should not see a misleading 0 on Drafts.
- **Setup.** Needs a company with allow_draft_project_creation OFF (PROCOL DEMO has it on; Demo Account 2 has it off).
- **Steps.** GET /event_groups/tab_counts on such a company.
- **Expected.** draft item_count is null; live and history are numbers.
- **Oracle.** draft item_count null.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:803-806`

## 6. Card refresh — GET /event_groups/update_cards

The Live tab can re-fetch 'stale' cards by id. The screen's scroll trigger is currently commented out (projectTable.jsx:571, 'creating high load on production'), but the endpoint is live and callable by any buyer.

#### API-XDLST-043 — Refreshing cards without naming any card is refused
- **Why it matters.** Without ids there is nothing to refresh; the endpoint must say so rather than return the whole company.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call card refresh with no ids. `GET /event_groups/update_cards`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-043` · `app/controllers/api/event_groups_controller.rb:727-731`

#### API-XDLST-044 — Card ids sent as one plain value crash the refresh
- **Why it matters.** Rails passes a single query value as text; the code calls uniq on it as if it were a list.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call card refresh with stale_eg_ids=5. `GET /event_groups/update_cards?stale_eg_ids=5`
- **Expected.** Should answer 200 (treating it as one id) or 422. Today String#uniq raises NoMethodError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-044` · `app/controllers/api/event_groups_controller.rb:750`

#### API-XDLST-045 — Card refresh returns other companies' events when given their ids
- **Why it matters.** The refresh loads `EventGroup.where(id: stale_eg_ids)` with no company scope and serialises title, ref id, creator name, company and line-item count. Ids are sequential and the uuid encoding is reversible, so any buyer can read every tenant's event titles and owners. This is a cross-tenant data leak.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. Low event ids (1–5) belong to other companies on UAT.
- **Steps.** Call card refresh with raw ids 1–5. `GET /event_groups/update_cards?stale_eg_ids[]=1&…&stale_eg_ids[]=5`
- **Expected.** HTTP 200 with NO cards from other companies (ideally 422/455 for foreign ids). Today the cards come back with their titles, ref ids, creator names and company.
- **Oracle.** Every returned card's company is PROCOL DEMO; any other company = defect (P0).
- **Trace.** P0 · automate · `EDGE-DLST-045` · `app/controllers/api/event_groups_controller.rb:727-770` · `app/serializers/event_group/card_serializer.rb:1-24` · `lib/encrypt_decrypt.rb:59-73`

#### API-XDLST-046 — Refreshing a card that does not exist returns an empty list
- **Why it matters.** Deleted or bogus ids must simply drop out.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Call card refresh with the bogus uuid. `GET /event_groups/update_cards?stale_eg_uuids=Z2dnWmdaUWtnZw%3D%3D`
- **Expected.** HTTP 200 with `event_groups: []` and `updated_projects_present: false`.
- **Oracle.** Empty card list.
- **Trace.** P2 · automate · `EDGE-DLST-046` · `app/controllers/concerns/params_auth.rb:70-74` · `app/controllers/api/event_groups_controller.rb:750`

#### API-XDLST-047 — Refreshing the sandbox card with a garbage 'newest' cursor still returns the card
- **Why it matters.** newest_cursor is compared against the sort column to detect new projects; garbage must not 500 or hide the requested card.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox is live.
- **Steps.** Call card refresh for the sandbox with newest_cursor=abc and sort_by=created_at. `GET /event_groups/update_cards?stale_eg_uuids={{eventGroupUuid}}&newest_cursor=abc&sort_by=created_at`
- **Expected.** HTTP 200 with the sandbox card and `updated_projects_present: false`.
- **Oracle.** One card, the sandbox's.
- **Trace.** P2 · automate · `EDGE-DLST-047` · `app/controllers/api/event_groups_controller.rb:733-748`

## 7. Filter options, open tenders and the Recurring tab

#### API-XDLST-048 — The filter panel options load for a buyer
- **Why it matters.** The filter panel is built from this list; options depend on the user's read permissions (products, categories, locations, PRs, users) plus order type, status, stage type and — with Clara — auto-pilot status.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Ask for the filter options. `GET /event_groups/filter_options`
- **Expected.** HTTP 200 {data:[…]} sorted by name; includes Order Type, Status and Stage Type; other groups only where the user may read them.
- **Oracle.** Status, Stage Type and Order Type present.
- **Trace.** P2 · automate · `EDGE-DLST-048` · `app/controllers/api/event_groups_controller.rb:773-776` · `app/controllers/concerns/event_group_controller_helper.rb:456-495`

#### API-XDLST-049 — A buyer cannot fetch another company's filter options by passing company_id
- **Why it matters.** For buyers the company is forced to the current workspace; company_id is only honoured for vendors. Otherwise any buyer could enumerate another tenant's products, locations and users.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Ask for filter options with company_id=1. `GET /event_groups/filter_options?company_id=1`
- **Expected.** HTTP 200 with the caller's own options (identical to the baseline).
- **Oracle.** Response equals the baseline response.
- **Trace.** P1 · automate · `EDGE-DLST-049` · `app/controllers/api/event_groups_controller.rb:1528-1535`

#### API-XDLST-050 — A buyer cannot call the vendors' open-tender list
- **Why it matters.** GET /event_groups/all is the vendor-side 'open tenders' feed. Policy all? refuses buyers outright.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Ask for open tenders as the buyer. `GET /event_groups/all`
- **Expected.** HTTP 422, code 455 'You are not authorized to perform this action'.
- **Oracle.** 422 + code 455.
- **Trace.** P2 · automate · `EDGE-DLST-050` · `app/controllers/api/event_groups_controller.rb:269-274` · `app/policies/event_group_policy.rb:33-35`

#### API-XDLST-051 — The Recurring tab ignores search and filters
- **Why it matters.** The Recurring tab shows a search box and sends filters/title, but the scheduled action reads no parameters at all and returns every active or paused template. Buyers type in the box and nothing narrows.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. scheduled_events_enabled is ON (it is on PROCOL DEMO).
- **Steps.** Ask for recurring events filtered to a title nothing matches. `GET /event_groups/scheduled?filters=%7B%22title%22%3A%22QA_Platform_no_match%22%7D`
- **Expected.** Should return only matching templates (none). Today it returns the full list, identical to the unfiltered call.
- **Oracle.** Compare with GET /event_groups/scheduled: identical = defect.
- **Trace.** P2 · automate · `EDGE-DLST-051` · `app/controllers/api/event_groups_controller.rb:374-412` · `procol-client-dashboard/src/viewModels/orders/useOrdersListViewModel.js:223-233` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:928-940`

#### API-XDLST-052 — Only live recurring templates are listed; withdrawn ones and finished schedules are not
- **Why it matters.** The Recurring tab is the buyer's control panel for repeat events. Withdrawn templates or completed/cancelled schedules should not appear; paused ones should (so they can be resumed).
- **Setup.** Needs scheduled templates in several states (active job, paused job, completed job, withdrawn template).
- **Steps.** GET /event_groups/scheduled.
- **Expected.** Active-job and paused-job templates in status active/draft are listed; completed/cancelled jobs and withdrawn templates are not.
- **Oracle.** Listed set equals templates with job status active/paused.
- **Trace.** P2 · manual · `app/controllers/api/event_groups_controller.rb:379-391`

#### API-XDLST-053 — Recurring templates never appear on the Live tab
- **Why it matters.** A template is not a real event; showing it on Live invites bids or edits on the template.
- **Setup.** Needs a scheduled template on the company (scheduled_events_enabled ON).
- **Steps.** GET /event_groups and GET /event_groups/scheduled.
- **Expected.** The template appears only in scheduled; Live excludes is_scheduled_template (also in update_cards).
- **Oracle.** Template ref id absent from Live.
- **Trace.** P2 · manual · `app/controllers/concerns/event_group_controller_helper.rb:670-671` · `app/controllers/api/event_groups_controller.rb:736`

## 8. Exporting the list — GET /reports/download_bulk_report

The 'Download report' button sits on the History tab only (projectTable.jsx:587). It sends the History filters plus `starting_from`/`ending_at` (default: last 3 months), `report_category`, `include_revised_bids` and `column_selection`. With a category the report is built asynchronously and EMAILED to the caller; ranges over 30 days can require approval first (reports_controller_helper.rb:225-234). Not on the runner's allowlist; every twin below stops before the report is queued.

#### API-XDLST-054 — Export without a date range is refused
- **Why it matters.** Without both dates the report would scan the company's whole history. The guard keeps exports bounded.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. is_download_bulk_report_disabled_for_members is OFF (it is off on PROCOL DEMO).
- **Steps.** Request an export with a report category but no dates. `GET /reports/download_bulk_report?report_category=auction_bids_comparison_report`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'. Nothing queued, no email.
- **Oracle.** 422 + code 2; no 'report in your email' message.
- **Trace.** P1 · automate · `EDGE-DLST-054` · `app/controllers/api/reports_controller.rb:154-165`

#### API-XDLST-055 — Export with only a start date is refused
- **Why it matters.** Both ends are required; a half-open range is the same unbounded scan.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. is_download_bulk_report_disabled_for_members is OFF (it is off on PROCOL DEMO).
- **Steps.** Request an export with only starting_from. `GET /reports/download_bulk_report?report_category=auction_bids_comparison_report&filters=%7B%22starting_from%22%3A1727740800%7D`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-055` · `app/controllers/api/reports_controller.rb:162-164`

#### API-XDLST-056 — Export with unreadable filters crashes before any check runs
- **Why it matters.** The export controller uses the shared filter parser, which leaves the filter hash empty-handed on bad JSON; the next before-action indexes it. An untyped 500 instead of 'Insufficient parameters'.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. is_download_bulk_report_disabled_for_members is OFF (it is off on PROCOL DEMO).
- **Steps.** Request an export with filters=notjson. `GET /reports/download_bulk_report?report_category=auction_bids_comparison_report&filters=notjson`
- **Expected.** Should answer 422 (code 2). Today: create_filter_params rescues and leaves @filters nil, then set_order_type_filter reads @filters["buy_offers"] → NoMethodError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P1 · automate · `EDGE-DLST-056` · `app/controllers/concerns/trade_controller_filter_helper.rb:555-575` · `app/controllers/concerns/trade_controller_filter_helper.rb:577-580` · `app/controllers/api/reports_controller.rb:18-19`

#### API-XDLST-057 — Export with a product filter sent as text crashes before the date check
- **Why it matters.** set_product_and_delivery_zone_maps_to_filter iterates product_ids with each; text has no each. The crash happens before the date guard, so the request never gets a readable error.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. is_download_bulk_report_disabled_for_members is OFF (it is off on PROCOL DEMO).
- **Steps.** Request an export with product_ids "5" and only a start date. `GET /reports/download_bulk_report?report_category=auction_bids_comparison_report&filters=%7B%22product_ids%22%3A%225%22%2C%22starting_from%22%3A1727740800%7D`
- **Expected.** Should answer 422 (code 2, the missing end date). Today String#each raises NoMethodError → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-057` · `app/controllers/concerns/trade_controller_filter_helper.rb:607-625`

#### API-XDLST-058 — A member is refused the export when the company disables it for members
- **Why it matters.** Some companies restrict bulk exports to super admins. Members must get a clear refusal, and the screen must show it.
- **Setup.** Needs a member (not super admin) on a company with is_download_bulk_report_disabled_for_members ON.
- **Steps.** As the member, request an export with a valid 7-day range.
- **Expected.** HTTP 422, code 10 'You are not allowed to use this functionality'. The screen today shows the generic 'Some error occurred while exporting report' instead (see UI case).
- **Oracle.** 422 + code 10; no report queued.
- **Trace.** P1 · manual · `app/controllers/api/reports_controller.rb:160-161`

#### API-XDLST-059 — A valid export is queued and emailed to the caller only
- **Why it matters.** The export is asynchronous: the API answers with a message and the file arrives by email. It must go to the caller, carry the History filters, and ranges over 30 days must go through approval where configured.
- **Setup.** Needs a mailbox for the caller; sends a real email — run manually on a QA account. Use a range ≤ 30 days to avoid the approval flow (which notifies approvers).
- **Steps.** Request an export for the last 7 days with category auction_bids_comparison_report and two columns.
- **Expected.** HTTP 200 'You will receive the report in your email shortly'. A Report row (status draft, report_type custom) with the filters and column_selection is created and a ReportDownloadLog is written. > 30 days with approval required: '…after export request is approved' and an approval request instead.
- **Oracle.** Email received by the caller only; report columns match the selection.
- **Trace.** P1 · manual · `app/controllers/api/reports_controller.rb:261-282` · `app/controllers/concerns/reports_controller_helper.rb:225-234`

#### API-XDLST-060 — A category-less export builds the file synchronously and returns a signed link
- **Why it matters.** Without report_category the controller builds a data-dump Excel inside the request. On a large company this ties up a web worker for the whole build.
- **Setup.** Manual: needs a company with substantial history; measure response time.
- **Steps.** Request an export with valid dates and no report_category.
- **Expected.** HTTP 200 {report_url: signed S3 URL}; response time recorded (should stay under the gateway timeout).
- **Oracle.** Signed URL downloads; time within budget.
- **Trace.** P2 · manual · `app/controllers/api/reports_controller.rb:166-172` · `app/controllers/api/reports_controller.rb:330-335`

## 9. Cloning a project — POST /event_groups/:id/create_clone

Existing coverage: API-LC-007..011, EDGE-PUB-109..113 (live baseline, draft → 455, PR → 455, in_active → 1122, vendor). These go deeper: lookup and routing guards, the config gate that only the screen enforces, and exactly what is copied (clone_service.rb, clones/trade_request.rb). A clone is a new DRAFT owned by the cloner, same title, ref id regenerated; only RFI/RFP/RFQ stages that are not in_active are copied (auctions and lot RFQs are not), each with a fresh 21-day window; audiences (vendors) are copied; no emails are sent because the stages stay draft.

#### API-XDLST-061 — Cloning a project that does not exist answers 'Project does not exist.'
- **Why it matters.** The lookup happens before the policy; a bogus id must give a clean 533, not a 500 from authorising nil.
- **Setup.** Signed in as the run's buyer (creator of the sandbox).
- **Steps.** Clone the bogus project id. `POST /event_groups/Z2dnWmdaUWtnZw==/create_clone` with `{}`
- **Expected.** HTTP 422, code 533 'Project does not exist.'. No project created.
- **Oracle.** 422 + code 533.
- **Trace.** P2 · automate · `EDGE-DLST-061` · `app/controllers/api/event_groups_controller.rb:105-107`

#### API-XDLST-062 — Cloning with an undecodable id answers 'Project does not exist.'
- **Why it matters.** WrongUuid1= decodes to nil; find_by(id: nil) must not pick up some row with a null id or crash.
- **Setup.** Signed in as the run's buyer (creator of the sandbox).
- **Steps.** Clone id WrongUuid1=. `POST /event_groups/WrongUuid1=/create_clone` with `{}`
- **Expected.** HTTP 422, code 533 'Project does not exist.'.
- **Oracle.** 422 + code 533.
- **Trace.** P2 · automate · `EDGE-DLST-062` · `app/controllers/concerns/params_auth.rb:57-67` · `app/controllers/api/event_groups_controller.rb:106-107`

#### API-XDLST-063 — Clone cannot be triggered with GET
- **Why it matters.** Only POST is routed. A GET (link prefetch, crawler, image tag) must never create a project.
- **Setup.** Signed in as the run's buyer (creator of the sandbox).
- **Steps.** Send GET to the clone URL of the sandbox. `GET /event_groups/{{eventGroupUuid}}/create_clone`
- **Expected.** HTTP 404 (no route). No project created.
- **Oracle.** Non-2xx, not 5xx; Drafts list unchanged.
- **Trace.** P2 · automate · `EDGE-DLST-063` · `config/routes.rb:699`

#### API-XDLST-064 — The API clones even when the company has cloning switched off
- **Why it matters.** The screen hides 'Clone Project' unless allowed_to_clone_project is on, but neither the policy nor the controller reads that setting. Any buyer with create permission can clone through the API on a company that has not bought or enabled the feature.
- **Setup.** Signed in as the run's buyer (creator of the sandbox). allowed_to_clone_project is OFF (it is off on PROCOL DEMO). The sandbox is active and not from a PR.
- **Steps.** Clone the sandbox. `POST /event_groups/{{eventGroupUuid}}/create_clone` with `{}`
- **Expected.** Should be refused (feature off). Today HTTP 200 {event_group_uuid} and a draft copy appears in Drafts.
- **Oracle.** Status; a new QA_Platform_ draft in GET /event_groups/draft = the gate is UI-only.
- **Trace.** P1 · automate · `EDGE-DLST-064` · `app/controllers/concerns/event_group_controller_helper.rb:534` · `app/controllers/concerns/event_group_controller_helper.rb:565` · `app/policies/event_group_policy.rb:46-50` · `app/controllers/api/event_groups_controller.rb:105-128`

#### API-XDLST-065 — The project detail config tells the screen whether Clone and Change Owner are offered
- **Why it matters.** These two flags are the only thing standing between a buyer and the menu items; they must follow the documented rules (clone: setting on, not planner, not draft, not from PR; change owner: active commercial stage, restrict_event_visibility_to_owner on, caller not on the planning team, caller owner/super admin/Procol employee).
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The sandbox event is published (active, bid window open) and still on the Live tab.
- **Steps.** Read the sandbox. `GET /event_groups/{{eventGroupUuid}}`
- **Expected.** HTTP 200. On PROCOL DEMO (both settings off): config.allowed_to_clone_project is false and config.is_allowed_to_change_ownership is false; config.should_redirect_after_changing_ownership is false.
- **Oracle.** Flags match the settings returned by the dashboard configuration.
- **Trace.** P2 · automate · `EDGE-DLST-065` · `app/controllers/concerns/event_group_controller_helper.rb:563-565` · `app/controllers/concerns/event_group_controller_helper.rb:595-614`

#### API-XDLST-066 — A clone copies line items, technical and RFQ stages, and vendors — and nothing that belongs to the old run
- **Why it matters.** Buyers clone to rerun the same sourcing. They expect the same items, stages and invited vendors, and no leftovers (bids, proposals, rankings, closed dates, lots).
- **Setup.** Needs the new clone's uuid from the create_clone response (the runner cannot chain it). Source: an active RFP+RFQ event with 2 line items, one inactive line item, invited vendors and an evaluator.
- **Steps.** 1. POST create_clone. 2. GET /event_groups/<clone>, /get_line_items, /get_audience, and each stage.
- **Expected.** Clone is draft, owned by the cloner, same title, new ref id; only ACTIVE line items (status draft, serial order kept); RFP stage with its forms and evaluator access lists; RFQ stage with its trade products; same vendors; no bids, proposals, precomputed ranks, lot_config, started_at or closed_at; meta_data.source_event_group_id = source id.
- **Oracle.** Field-by-field comparison with the source.
- **Trace.** P1 · manual · `app/services/event_groups/clone_service.rb:13-46` · `app/services/clones/trade_request.rb:15-42` · `app/services/trade_request_replication_base.rb:5-80`

#### API-XDLST-067 — A clone gets a fresh 21-day bid window — and a 21-day extra closing time
- **Why it matters.** Source timings are usually in the past, so the clone resets them. But the extra closing window is also set to 21 days regardless of the source (often minutes or hours), so a buyer who publishes without checking gives vendors three extra weeks after bidding closes.
- **Setup.** Needs the clone uuid (see previous case).
- **Steps.** Clone an event whose extra closing time is 1 hour; read the clone's schedules.
- **Expected.** Bid window: now → now+21 days (clone time). Extra closing: should keep the source's duration; today it is +21 days after the bid end.
- **Oracle.** rfq_extra_closing_time / extra_closing_time end − start on the clone.
- **Trace.** P1 · manual · `app/services/clones/trade_request.rb:49-82`

#### API-XDLST-068 — Cloning a withdrawn project produces a project with no stages
- **Why it matters.** Withdrawal marks every stage in_active, and the clone copies only stages that are not in_active. The controller explicitly allows withdrawn projects ('Only active or withdrawn events can be cloned.') and buyers use it to relaunch — but the copy has line items and no RFP/RFQ at all.
- **Setup.** Needs a withdrawn QA event and the clone uuid; the runner's sandbox is withdrawn only at the very end of a run.
- **Steps.** Withdraw a QA_Platform_ event with an RFQ stage; clone it; read the clone's stages.
- **Expected.** The clone should carry the RFQ stage as a draft. Today it has zero stages.
- **Oracle.** Clone's stages list is empty = defect.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:111-113` · `app/services/event_groups/update_service.rb:316-330` · `app/services/event_groups/clone_service.rb:57-66`

#### API-XDLST-069 — Cloning an RFQ that was converted to an auction drops the auction
- **Why it matters.** The clone copies only rfi/rfp/rfq modes. An RFQ converted to rfq_then_auction, or a plain auction stage, is skipped, and the screen only warns 'Cloning is supported only for the Technical and RFQ stages'.
- **Setup.** Needs an event with an auction stage.
- **Steps.** Clone it and read the stages.
- **Expected.** Only technical/RFQ stages are present; the auction stage is absent; the modal warned about it.
- **Oracle.** Stage modes on the clone.
- **Trace.** P2 · manual · `app/services/event_groups/clone_service.rb:57-66` · `procol-client-dashboard/src/views/projectDetails/components/cloneProjectModal.jsx:51-53`

#### API-XDLST-070 — Cloning a lot event copies only the parent RFQ
- **Why it matters.** Lot RFQs are listed in lot_config; the clone excludes them and clears lot_config, so the copy is one un-lotted RFQ.
- **Setup.** Needs an event with active lots.
- **Steps.** Clone it; read stages and lot_config.
- **Expected.** One parent RFQ, no lot RFQs, lot_config empty.
- **Oracle.** Stage count and lot_config on the clone.
- **Trace.** P2 · manual · `app/services/event_groups/clone_service.rb:66-86` · `app/services/event_groups/clone_service.rb:41`

#### API-XDLST-071 — Cloning a closed or awarded project copies the setup but none of the award
- **Why it matters.** Awarded projects are the common source for a rerun. Proposals, awards and POs must stay with the original.
- **Setup.** Needs the journey's own event (closed, one bid, a submitted proposal); its event uuid is not exposed to cases.
- **Steps.** Clone the journey's event; read the clone's proposals and bids.
- **Expected.** Clone is draft with no proposals, bids, orders or precomputed ranking; the source's award is untouched.
- **Oracle.** GET proposals/bids on the clone are empty; source unchanged.
- **Trace.** P1 · manual · `app/services/event_groups/clone_service.rb:32-46` · `app/services/trade_request_replication_base.rb:5-18`

#### API-XDLST-072 — Cloning a recurring template copies the template flag and its job link
- **Why it matters.** deep_dup keeps is_scheduled_template and config.scheduled_job_id; nothing resets them. The clone is a draft 'template' pointing at the SOURCE's job — republishing it can resume or alter the original schedule.
- **Setup.** Needs scheduled_events_enabled ON and an active template.
- **Steps.** Clone a template; read the clone's is_scheduled_template and config.scheduled_job_id; publish the clone.
- **Expected.** Clone should be a plain event (flag false, no job id). Today both are copied.
- **Oracle.** Clone fields; source job status after the clone is published.
- **Trace.** P2 · manual · `app/services/event_groups/replication_base.rb:5-13` · `app/services/event_groups/clone_service.rb:32-46`

#### API-XDLST-073 — Cloning copies stale meta data such as owner history and pending-bid counts
- **Why it matters.** Only cloned_event_group_ids is removed from meta_data. owner_trail, pending_unregistered_bids_count, is_auto_created and clara_stuck_reasons ride along, so a brand-new draft shows 'pending unregistered bids' and a previous owner history.
- **Setup.** Needs a source whose meta_data has those keys (ownership transferred once; an unregistered bid pending).
- **Steps.** Clone; read the clone's card (GET /event_groups/draft) and meta data.
- **Expected.** Clone card shows pending_unregistered_bids_count 0 and no owner trail. Today the source values are copied.
- **Oracle.** Card counters on the clone.
- **Trace.** P2 · manual · `app/services/event_groups/clone_service.rb:43-45` · `app/serializers/event_group/card_serializer.rb:42-44`

#### API-XDLST-074 — A withdrawn project that came from a purchase request becomes clonable
- **Why it matters.** created_from_pr? ignores in_active PR mappings, and withdrawal sets them in_active. So the 'PR events cannot be cloned' rule stops applying after withdrawal. The code comment says this is intended; the clone carries no PR link.
- **Setup.** Needs a PR-created event that is then withdrawn.
- **Steps.** Withdraw it; clone it.
- **Expected.** HTTP 200; the clone has no PurchaseRequestTradeMapping; PR quantities are not consumed twice.
- **Oracle.** PR open quantity unchanged by the clone.
- **Trace.** P2 · manual · `app/models/event_group.rb:1010-1013` · `app/services/event_groups/update_service.rb:338-342`

#### API-XDLST-075 — Cloning someone else's company's project is refused
- **Why it matters.** create_clone looks the project up by id with no company scope; only the policy's allowed-companies check stops a forged id (the uuid encoding is reversible) from copying another tenant's specs.
- **Setup.** Needs a known event id of another company and a correctly encoded uuid for it.
- **Steps.** POST /event_groups/<other tenant uuid>/create_clone.
- **Expected.** HTTP 422, code 455; nothing created.
- **Oracle.** 455; no draft appears.
- **Trace.** P0 · manual · `app/controllers/api/event_groups_controller.rb:106-109` · `app/policies/event_group_policy.rb:46-48`

#### API-XDLST-076 — Two quick clones make two drafts, each pointing back to the source
- **Why it matters.** There is no lock; a double click creates two drafts. Each must be complete and independently linked to the source.
- **Setup.** Manual double-submit on the screen or two parallel API calls.
- **Steps.** Clone twice within a second.
- **Expected.** Two drafts, both complete, both with meta_data.source_event_group_id = source; source meta_data unchanged.
- **Oracle.** Two clones; no partial one.
- **Trace.** P2 · manual · `app/services/event_groups/clone_service.rb:40-45`

## 10. Changing the owner — POST /event_groups/:id/change_ownership and GET …/team_buyers

Existing coverage: API-LC-014, EDGE-PUB-090..095 (blank owner, outside team 960, vendor, non-owner buyer, draft, inactive owner). The lookup is scoped to the workspace; the policy needs show? plus owner/super admin/Procol employee; the new owner is `User.active.find_by(id: new_owner_id)` (NOT company-scoped) and validate_new_owner returns 2 for missing/self, nil (valid) when the current owner is inactive, 960 when no active team is shared. NOTE: who 'the owner' is depends on restrict_event_visibility_to_owner — when it is off, EventGroup#user is always the creator (event_group.rb:1227-1235). Every runnable twin targets only the run's own buyer or ids that resolve to nobody; none can transfer anything.

#### API-XDLST-077 — Making yourself the owner is refused as missing parameters
- **Why it matters.** Self-transfer must be a no-op refusal, not a transfer that deactivates and recreates the owner access row and emails the owner about themselves.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer the sandbox to the run's own buyer. `POST /event_groups/{{eventGroupUuid}}/change_ownership` with `{"new_owner_uuid": "{{buyerUserUuid}}"}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'. Owner unchanged; no email.
- **Oracle.** 422 + code 2; GET the event: owner unchanged.
- **Trace.** P1 · automate · `EDGE-DLST-077` · `app/controllers/api/event_groups_controller.rb:1089-1095` · `app/controllers/concerns/trade_controller_helper.rb:5948-5952`

#### API-XDLST-078 — Transferring to a user id that does not exist is refused
- **Why it matters.** A well-formed uuid for no user must not reach the transfer service (which would create an owner row for a ghost).
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer to the bogus uuid. `POST …/change_ownership` with `{"new_owner_uuid": "Z2dnWmdaUWtnZw=="}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · automate · `EDGE-DLST-078` · `app/controllers/api/event_groups_controller.rb:1093-1095`

#### API-XDLST-079 — Transferring to an undecodable user id is refused
- **Why it matters.** WrongUuid1= decodes to nil; find_by(id: nil) must not match anything.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer to WrongUuid1=. `POST …/change_ownership` with `{"new_owner_uuid": "WrongUuid1="}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-079` · `app/controllers/concerns/params_auth.rb:70-74` · `app/controllers/api/event_groups_controller.rb:1093`

#### API-XDLST-080 — Transferring to null is refused
- **Why it matters.** A cleared select box sends null; it must be the same refusal as a missing field.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer to null. `POST …/change_ownership` with `{"new_owner_uuid": null}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-080` · `lib/encrypt_decrypt.rb:59-60` · `app/controllers/concerns/trade_controller_helper.rb:5950-5952`

#### API-XDLST-081 — A raw numeric user id bypasses uuid decoding and is looked up directly
- **Why it matters.** new_owner_id is read straight from params, so a client can skip uuids and pass internal ids. A nonexistent one must still be refused; the case also documents that raw ids are accepted at all.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer to raw id 999999999. `POST …/change_ownership` with `{"new_owner_id": 999999999}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-081` · `app/controllers/api/event_groups_controller.rb:1093`

#### API-XDLST-082 — A list where one uuid is expected is decoded leniently (here: yourself) and refused
- **Why it matters.** decode_data stringifies whatever it gets and Base64-decodes leniently, so ["<uuid>"] decodes like "<uuid>". With the caller's own uuid this lands on the self-transfer refusal; it documents that wrong types are not rejected.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer to a one-element list holding your own uuid. `POST …/change_ownership` with `{"new_owner_uuid": ["{{buyerUserUuid}}"]}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters' (either decoded to yourself, or to nothing).
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-082` · `lib/encrypt_decrypt.rb:59-73` · `app/controllers/concerns/params_auth.rb:70-75`

#### API-XDLST-083 — Changing the owner of a project that does not exist answers 'Project does not exist.'
- **Why it matters.** The lookup is scoped to the workspace and runs before the policy.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Transfer the bogus project. `POST /event_groups/Z2dnWmdaUWtnZw==/change_ownership` with `{"new_owner_uuid": "{{buyerUserUuid}}"}`
- **Expected.** HTTP 422, code 533 'Project does not exist.'.
- **Oracle.** 422 + code 533.
- **Trace.** P2 · automate · `EDGE-DLST-083` · `app/controllers/api/event_groups_controller.rb:1090-1091`

#### API-XDLST-084 — Owner change cannot be triggered with GET
- **Why it matters.** Only POST is routed.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** GET the change-owner URL. `GET /event_groups/{{eventGroupUuid}}/change_ownership`
- **Expected.** HTTP 404 (no route).
- **Oracle.** Non-2xx, not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-084` · `config/routes.rb:708`

#### API-XDLST-085 — The new-owner picker lists the owner's active team-mates, without the owner or planners
- **Why it matters.** This list is the only choice the Change Owner modal offers. It must contain exactly the people the backend will accept.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Ask for eligible owners of the sandbox. `GET /event_groups/{{eventGroupUuid}}/team_buyers`
- **Expected.** HTTP 200, a list of {user_id, user_name}: active users sharing an active team with the owner, minus the owner and minus planners. (If the owner were inactive: every buyer of the company minus planners.)
- **Oracle.** The run's buyer is not in the list; every listed user would pass the 960 team check.
- **Trace.** P1 · automate · `EDGE-DLST-085` · `app/controllers/api/event_groups_controller.rb:1065-1087` · `app/policies/event_group_policy.rb:84-86`

#### API-XDLST-086 — The new-owner picker for a project that does not exist answers 'Project does not exist.'
- **Why it matters.** Scoped lookup before policy, same as the transfer itself.
- **Setup.** Signed in as the run's buyer, who created (owns) the sandbox.
- **Steps.** Ask for eligible owners of the bogus project. `GET /event_groups/Z2dnWmdaUWtnZw==/team_buyers`
- **Expected.** HTTP 422, code 533 'Project does not exist.'.
- **Oracle.** 422 + code 533.
- **Trace.** P2 · automate · `EDGE-DLST-086` · `app/controllers/api/event_groups_controller.rb:1066-1067`

#### API-XDLST-087 — With owner-only visibility OFF, an API transfer 'succeeds' but nothing changes
- **Why it matters.** The screen hides Change Owner unless restrict_event_visibility_to_owner is on, but the API accepts the transfer anyway. With the setting off, EventGroup#user ignores the new owner row and keeps returning the creator — so policy, cards and the next transfer still treat the creator as owner, while the creator's draft award proposal is moved to the 'new owner' and both people get 'event assigned/unassigned' emails.
- **Setup.** Needs restrict_event_visibility_to_owner OFF (as on PROCOL DEMO) and a SECOND QA buyer on the owner's team — never a real colleague, so not a runnable twin.
- **Steps.** 1. Owner has a draft proposal. 2. POST change_ownership to the QA team-mate. 3. GET the event, the Live card and the proposal.
- **Expected.** Should be refused when the feature is off (or actually change the owner). Today: 200 'Ownership transferred successfully', card still shows the creator, creator can still transfer again, the draft proposal now belongs to the other user, two emails.
- **Oracle.** Card user.name and policy behaviour after the call.
- **Trace.** P1 · manual · `app/models/event_group.rb:1227-1235` · `app/services/event_groups/transfer_ownership_service.rb:9-20` · `app/services/event_groups/transfer_ownership_service.rb:42-56` · `app/controllers/concerns/event_group_controller_helper.rb:604-614`

#### API-XDLST-088 — Transferring to a deactivated user is refused
- **Why it matters.** Ownership must never land on someone who cannot log in.
- **Setup.** Needs a deactivated QA user id on the company.
- **Steps.** POST change_ownership with that user's uuid.
- **Expected.** HTTP 422, code 2 'Insufficient parameters' — User.active excludes them.
- **Oracle.** 422 + code 2.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:1093`

#### API-XDLST-089 — A user who left the company may still be offered and accepted as the new owner
- **Why it matters.** Both the picker and the check use User.active and TeamMember.active; neither checks the user's membership status in THIS company. A person removed from the company but still on a team row could be offered and accepted. (To verify: whether removal also deactivates team memberships.)
- **Setup.** Needs a QA user removed from the company (UserCompanyMapping inactive) whose team membership row is still active.
- **Steps.** GET team_buyers; POST change_ownership to that user.
- **Expected.** The user is neither listed nor accepted.
- **Oracle.** Picker contents and the transfer's answer.
- **Trace.** P1 · manual · `app/controllers/api/event_groups_controller.rb:1078-1080` · `app/controllers/concerns/trade_controller_helper.rb:5955-5957`

#### API-XDLST-090 — A vendor's user cannot be made owner while the owner is active — but can once the owner is deactivated
- **Why it matters.** With an active owner the team check (960) blocks vendor users. With an inactive owner validate_new_owner returns 'valid' immediately and the lookup is not company-scoped, so a supplier's user can be made owner of the buyer's event (extends EDGE-PUB-095 to the vendor case).
- **Setup.** Needs a super admin, an event whose owner is deactivated, and a QA vendor user id.
- **Steps.** POST change_ownership with the vendor user's uuid, first with an active owner, then with the owner deactivated.
- **Expected.** Both refused. Today: first 960, second 200.
- **Oracle.** Second call's status.
- **Trace.** P0 · manual · `app/controllers/concerns/trade_controller_helper.rb:5953-5954` · `app/controllers/api/event_groups_controller.rb:1093`

#### API-XDLST-091 — Only the owner, a super admin or a Procol employee can open the picker
- **Why it matters.** team_buyers? mirrors change_ownership?. A plain team-mate must not be able to list candidates or transfer.
- **Setup.** Needs a second buyer (non-admin) on the owner's team.
- **Steps.** As that buyer: GET team_buyers; POST change_ownership.
- **Expected.** Both HTTP 422, code 455.
- **Oracle.** 455 twice.
- **Trace.** P1 · manual · `app/policies/event_group_policy.rb:84-90`

#### API-XDLST-092 — After a transfer the new owner can transfer onwards and the previous owner cannot (owner-only visibility ON)
- **Why it matters.** With the setting on, ownership follows the owner access row; the policy compares the caller with record.user_id.
- **Setup.** Needs restrict_event_visibility_to_owner ON and two QA buyers on one team.
- **Steps.** A transfers to B; A tries to transfer again; B transfers back to A.
- **Expected.** A's second attempt: 455. B's attempt: 200. Exactly one active owner row at every step.
- **Oracle.** Responses and AccessList rows.
- **Trace.** P1 · manual · `app/models/event_group.rb:1227-1235` · `app/policies/event_group_policy.rb:88-90` · `app/services/event_groups/transfer_ownership_service.rb:23-41`

#### API-XDLST-093 — A transfer hands over open work: draft proposal, submitted proposals, chats
- **Why it matters.** The point of a transfer is that the new owner can finish the award. Draft proposals are duplicated, submitted ('requested') ones are re-pointed with their template responses, chat assignments move and the old owner is muted.
- **Setup.** Needs two QA buyers and an event with a draft proposal, a requested proposal and a vendor chat.
- **Steps.** Transfer; read proposals, chat assignments and participants.
- **Expected.** Old draft proposal in_active and a copy owned by the new owner; requested proposals' creator = new owner; chat assignment revised → new active assignment; old owner muted; meta_data.owner_trail has one entry; quotation template cache dropped.
- **Oracle.** Each item checked.
- **Trace.** P1 · manual · `app/services/event_groups/transfer_ownership_service.rb:42-131`

#### API-XDLST-094 — Both owners are emailed after a transfer
- **Why it matters.** The new owner must learn they own the event; the previous owner must learn they lost it.
- **Setup.** Needs two QA buyers with QA mailboxes (example.com addresses are not delivered); manual.
- **Steps.** Transfer and check both inboxes.
- **Expected.** New owner: 'event assigned'; previous owner: 'event unassigned' naming the new owner. Nobody else.
- **Oracle.** Two emails.
- **Trace.** P2 · manual · `app/workers/event_ownership_transfer_worker.rb:8-31`

#### API-XDLST-095 — Two simultaneous transfers leave exactly one owner
- **Why it matters.** There is no lock; two concurrent transfers can each deactivate 'the' owner row and create a new one, leaving two active owner rows. EventGroup#user then picks whichever comes first.
- **Setup.** Needs two parallel requests to two different QA team-mates.
- **Steps.** Fire both transfers at the same moment; read AccessList owner rows.
- **Expected.** Exactly one active owner row.
- **Oracle.** Count of active owner rows.
- **Trace.** P2 · manual · `app/services/event_groups/transfer_ownership_service.rb:9-20` · `app/services/event_groups/transfer_ownership_service.rb:23-29`

## 11. Who sees which events — visibility per role and team

The list visibility rules live in get_live_page_data / get_live_page_filter_for_user (Live) and get_trade_requests_for_user (History, Drafts). Super admins and Procol employees see everything in the company. Each case needs a second, differently-privileged session, so none is a runnable twin.

#### API-XDLST-096 — A member sees their own and their teams' events, not other teams'
- **Why it matters.** Team scoping is the default privacy model between buying teams.
- **Setup.** Two buyers in different teams; each publishes a QA event (restrict_event_visibility_to_owner OFF).
- **Steps.** Each opens Live and History.
- **Expected.** Each sees their own event and their team's; not the other team's. A super admin sees both.
- **Oracle.** Cards per user.
- **Trace.** P0 · manual · `app/controllers/concerns/trade_controller_helper.rb:6052-6083` · `app/controllers/concerns/trade_controller_helper.rb:6101-6127`

#### API-XDLST-097 — With owner-only visibility ON, a member sees only events they own, approve, chat on or were shared
- **Why it matters.** restrict_event_visibility_to_owner narrows the list to ownership, approver role, assigned chats and explicit shares.
- **Setup.** Company with the setting ON; buyers A (owner) and B (same team, not approver).
- **Steps.** B opens Live; then A assigns B a vendor chat; B reopens Live.
- **Expected.** First: B does not see A's event. After the chat assignment: B sees it.
- **Oracle.** Cards per step.
- **Trace.** P0 · manual · `app/controllers/concerns/trade_controller_helper.rb:6085-6099` · `app/controllers/concerns/trade_controller_helper.rb:2419-2420`

#### API-XDLST-098 — Auction-team users see only auction stages
- **Why it matters.** Auction desks should not see RFP/RFQ work.
- **Setup.** A user in the auction team; events with RFQ and auction stages.
- **Steps.** Open Live and History as that user.
- **Expected.** Only auction / RFQ-then-auction stages are listed; Drafts additionally include RFQ-then-auction drafts.
- **Oracle.** Stage modes on cards.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:2383` · `app/controllers/concerns/trade_controller_helper.rb:2386-2388`

#### API-XDLST-099 — Planners see only technical (RFP/RFI) stages
- **Why it matters.** Planner roles evaluate specs; commercial stages are hidden.
- **Setup.** A planner-gated user who is not a purchaser.
- **Steps.** Open Live and History.
- **Expected.** Only RFP/RFI stages; filtered_stages_count shows 'n/m Stage'.
- **Oracle.** Stage modes on cards.
- **Trace.** P1 · manual · `app/controllers/concerns/trade_controller_helper.rb:6079-6081` · `app/serializers/event_group/card_serializer.rb:66-69`

#### API-XDLST-100 — A vendor sees only events they are invited to, and never a draft stage
- **Why it matters.** The same endpoints serve vendors; audience scoping and the draft-stage skip in the card are the only barriers.
- **Setup.** QA vendor invited to the sandbox; another QA event without that vendor.
- **Steps.** As the vendor: GET /event_groups, /history, /tab_counts.
- **Expected.** Only the sandbox appears; draft stages are not serialised; tab counts match the lists.
- **Oracle.** Cards and counts.
- **Trace.** P0 · manual · `app/controllers/concerns/event_group_controller_helper.rb:682-694` · `app/serializers/event_group/card_serializer.rb:46-64`

#### API-XDLST-101 — A user without sourcing access gets empty lists, not an error
- **Why it matters.** Users of other modules land on the events screen by deep link.
- **Setup.** A console user without sourcing-events access.
- **Steps.** GET /event_groups and /history.
- **Expected.** HTTP 200 with no events (or 455 where policy applies); never another user's events.
- **Oracle.** Empty lists.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_helper.rb:2385`

#### API-XDLST-102 — Old events beyond the user's history window are hidden
- **Why it matters.** Users can be limited to recent history (starting_date_for_historical_data); an earlier start date is clamped.
- **Setup.** A user with a historical-data start date after some closed events.
- **Steps.** GET history with starting_from before that date.
- **Expected.** Events closed before the user's start date are not listed.
- **Oracle.** Oldest card's date ≥ the user's start date.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_filter_helper.rb:203-206` · `app/controllers/concerns/event_group_controller_helper.rb:863-866`

#### API-XDLST-103 — Withdrawn events leave Live and appear in History; removed (in_active) events appear nowhere
- **Why it matters.** Withdrawal sets closed_at, so the project moves tabs; only active and withdrawn projects are valid for the dashboard.
- **Setup.** A QA event that is then withdrawn.
- **Steps.** Withdraw; GET /event_groups and /history?filters={stage_status:[withdrawn]}.
- **Expected.** Gone from Live; present in History under Withdrawn; tab counts move by one each (after cache expiry).
- **Oracle.** Card positions and counts.
- **Trace.** P1 · manual · `app/services/event_groups/update_service.rb:316-320` · `app/models/event_group.rb:147`

## 12. GET /orders is the purchase-order list, not the events list

`GET /orders` (OrdersController#index) lists purchase ORDERS (PurchaseOrders::SearchQueryPo), with `query` as the search text and `filters` keys po_amount, po_status, contract_status, buyer_hub_ids, vendor_ids, product_ids, creator_ids, created_at, erp_order_type. The events list is `GET /event_groups`. These cases cover the PO list's parameters because it is the cheapest allowlisted read; they do not duplicate EVT-TPL-003 (forged company filter).

#### API-XDLST-104 — The PO list answers with orders and its counters
- **Why it matters.** Baseline for the shared /orders read used by several platform checks.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The user may read POs.
- **Steps.** Ask for the PO list. `GET /orders`
- **Expected.** HTTP 200 {data, total_pages, number_of_purchase_orders, number_of_success_po, …}; all orders belong to PROCOL DEMO.
- **Oracle.** Keys present.
- **Trace.** P2 · automate · `EDGE-DLST-104` · `app/controllers/api/orders_controller.rb:20-58` · `app/services/purchase_orders/search_query_po.rb:25-44`

#### API-XDLST-105 — A product filter with non-numeric ids crashes the PO list
- **Why it matters.** The product scope casts JSON to bigint in SQL and compares with the raw values; text makes Postgres fail.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The user may read POs.
- **Steps.** Filter POs by product_ids ["abc"]. `GET /orders?filters=%7B%22product_ids%22%3A%5B%22abc%22%5D%7D`
- **Expected.** Should answer 200 (no match) or 422. Expected today: `(order_items.product->>'id')::bigint in ('abc')` → Postgres invalid input for bigint → HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-105` · `app/models/order.rb:191` · `app/services/purchase_orders/search_query_po.rb:13`

#### API-XDLST-106 — A location filter with non-numeric ids crashes the PO list
- **Why it matters.** Same SQL cast in the buyer_hub scope.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The user may read POs.
- **Steps.** Filter POs by buyer_hub_ids ["abc"]. `GET /orders?filters=%7B%22buyer_hub_ids%22%3A%5B%22abc%22%5D%7D`
- **Expected.** Should answer 200 or 422. Expected today: HTTP 500.
- **Oracle.** Status is not 5xx.
- **Trace.** P2 · automate · `EDGE-DLST-106` · `app/models/order.rb:192` · `app/services/purchase_orders/search_query_po.rb:11`

#### API-XDLST-107 — Searching POs for '%' returns every PO
- **Why it matters.** The PO search (invoice no, PO number, vendor name) has the same unescaped-wildcard behaviour as the events search.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The user may read POs.
- **Steps.** Search POs for '%'. `GET /orders?query=%25`
- **Expected.** Should match only literal '%'. Today: every PO (count equals the baseline).
- **Oracle.** number_of_purchase_orders equals the baseline.
- **Trace.** P2 · automate · `EDGE-DLST-107` · `app/models/order.rb:188` · `app/services/purchase_orders/search_query_po.rb:27`

#### API-XDLST-108 — A negative page number is treated as page 1
- **Why it matters.** Pagination input from the client must be clamped, not passed to OFFSET.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The user may read POs.
- **Steps.** Ask for page -5. `GET /orders?page=-5`
- **Expected.** HTTP 200, same first page as the baseline.
- **Oracle.** Same data as baseline.
- **Trace.** P2 · automate · `EDGE-DLST-108` · `app/controllers/api/orders_controller.rb:527-530`

#### API-XDLST-109 — A created-at range made of text returns nothing instead of crashing
- **Why it matters.** created_at from/to are converted with to_i; text becomes 1970-01-01 for both ends.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO. The user may read POs.
- **Steps.** Filter POs created between 'abc' and 'xyz'. `GET /orders?filters=%7B%22created_at%22%3A%7B%22from%22%3A%22abc%22%2C%22to%22%3A%22xyz%22%7D%7D`
- **Expected.** HTTP 200 with no orders.
- **Oracle.** Empty data.
- **Trace.** P2 · automate · `EDGE-DLST-109` · `app/models/order.rb:185`

## 13. Finding events for purchase-request items — POST /event_groups/search

Used from the PR screen to find live events that can absorb selected PR items (projectService.js:36-37). Read-only; not on the runner's allowlist (POST).

#### API-XDLST-110 — Searching without PR items is refused
- **Why it matters.** The search is defined by the PR items; without them there is nothing to match.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Search with an empty body. `POST /event_groups/search` with `{}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-110` · `app/controllers/api/event_groups_controller.rb:838-845`

#### API-XDLST-111 — PR items sent as text instead of a list are refused
- **Why it matters.** The guard checks the type explicitly; text must be refused, not split or crashed on.
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Search with purchase_request_item_ids "abc". `POST /event_groups/search` with `{"purchase_request_item_ids": "abc"}`
- **Expected.** HTTP 422, code 2 'Insufficient parameters'.
- **Oracle.** 422 + code 2.
- **Trace.** P2 · automate · `EDGE-DLST-111` · `app/controllers/api/event_groups_controller.rb:843-845`

#### API-XDLST-112 — Unknown PR items are refused — with a misleading message
- **Why it matters.** When none of the items exist, the code answers 834 whose text is 'Purchase request item has no product' — the user is told the item lacks a product when it does not exist (or belongs to another company).
- **Setup.** Signed in as the run's buyer on PROCOL DEMO.
- **Steps.** Search with a bogus PR item uuid. `POST /event_groups/search` with `{"purchase_request_item_uuids": ["Z2dnWmdaUWtnZw=="]}`
- **Expected.** HTTP 422, code 834 'Purchase request item has no product' (a 'not found' message would be correct).
- **Oracle.** 422 + code 834.
- **Trace.** P2 · automate · `EDGE-DLST-112` · `app/controllers/concerns/event_group_controller_helper.rb:2970-2978`

## 14. The events list screen (procol-client-dashboard)

Screen-level cases for the Orders/Projects page: tabs, badges, search, filters, sort, date range, export, and the Clone / Change Owner menu on project details.

#### UI-XDLST-001 — The list shows Live and History always, Drafts and Recurring only when enabled
- **Why it matters.** Tabs that appear without their feature (or vanish with it) confuse buyers and hide work.
- **Setup.** PROCOL DEMO (show_draft_tab ON, scheduled_events_enabled ON) and Demo Account 2 (both OFF).
- **Steps.** Open the events page on each company.
- **Expected.** PROCOL DEMO: Live, History, Drafts, Recurring. Demo Account 2: Live and History only.
- **Oracle.** Visible tab labels per company.
- **Trace.** P1 · automate · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:626-628` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:755-760` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:864-868` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:928-929`

#### UI-XDLST-002 — Tab badges match the lists underneath
- **Why it matters.** The Live badge comes from the Live list's event_group_count; History/Drafts from their own totals. Mismatches are the first sign of the stale tab-count cache.
- **Setup.** A buyer with a few live, draft and closed QA events.
- **Steps.** Read each badge, then count the cards after scrolling to the end of each tab.
- **Expected.** Each badge equals the number of projects in its tab.
- **Oracle.** Badge vs card count.
- **Trace.** P1 · automate · `procol-client-dashboard/src/viewModels/orders/useOrdersListViewModel.js:345` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:627` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:757-759` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:866`

#### UI-XDLST-003 — Search waits for the user to stop typing and searches title and reference
- **Why it matters.** The box is debounced by one second and sends the text as filters.title; it matches event and stage titles and ref ids.
- **Setup.** A published QA event with a unique title.
- **Steps.** Type part of the title; then type the RFX ref id.
- **Expected.** One request per pause (not per keystroke); the event is found by title and by ref id.
- **Oracle.** Network log shows one /event_groups call per pause; card present.
- **Trace.** P1 · automate · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:399-411` · `procol-client-dashboard/src/viewModels/orders/useOrdersListViewModel.js:188-196`

#### UI-XDLST-004 — Typing '%' in search shows every event
- **Why it matters.** Users expect literal search. Today the backend treats % and _ as wildcards.
- **Setup.** Any company with events.
- **Steps.** Type '%' in the History search.
- **Expected.** Only events whose title contains '%'. Today: the full list.
- **Oracle.** Card count vs unfiltered.
- **Trace.** P2 · manual · `app/controllers/concerns/trade_controller_filter_helper.rb:492-504` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:770-777`

#### UI-XDLST-005 — The date picker cannot choose future dates, and on Live it hides running events
- **Why it matters.** The picker disables future days; combined with the backend's closed_at rule, choosing any range on Live drops every event whose stage is still open.
- **Setup.** A live QA event created today.
- **Steps.** On Live, pick 'This month' (or any range ending today).
- **Expected.** Future days are greyed out. The live event should stay visible; today it disappears from the list (and the badge drops).
- **Oracle.** Card present before/after picking the range.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:656-675` · `app/controllers/api/event_groups_controller.rb:1583-1585` · `app/controllers/concerns/trade_controller_filter_helper.rb:219-226`

#### UI-XDLST-006 — Live stage radio and History stage radio filter the list
- **Why it matters.** All / Live / In-Evaluation / Upcoming on Live; All / Completed / Withdrawn on History.
- **Setup.** Events in bidding, in evaluation, closed and withdrawn.
- **Steps.** Click each radio option on both tabs.
- **Expected.** Each option shows only its bucket; All shows everything.
- **Oracle.** Cards per option.
- **Trace.** P2 · automate · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:676-692` · `procol-client-dashboard/src/views/orders/constants.js:163-196`

#### UI-XDLST-007 — The sorter offers only 'RFX Number' and remembers the choice
- **Why it matters.** Sort is saved to the user's preference (saveSorters). Only one sortable column exists, which keeps the backend's single-column limit hidden.
- **Setup.** Any buyer.
- **Steps.** Open the sorter, choose RFX Number ascending, reload.
- **Expected.** Only 'RFX Number' is offered; after reload the order is still ascending.
- **Oracle.** Order of ref ids after reload.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:647-653` · `procol-client-dashboard/src/views/orders/constants.js:224-229` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:555-562`

#### UI-XDLST-008 — 'Download report' appears only on History and warns about the default 3-month range
- **Why it matters.** The export is History-only; without a chosen range it silently uses the last 3 months, which the drawer must say.
- **Setup.** A buyer on PROCOL DEMO.
- **Steps.** Open each tab; on History click Download report without choosing dates.
- **Expected.** The button is visible on History only. The drawer states 'Report will be generated for duration of <3 months ago> to <today>'. Submitting shows 'Processing…' then the server message 'You will receive the report in your email shortly'.
- **Oracle.** Button visibility; drawer text; toast text.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:587-600` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:523-532` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:500-521` · `procol-client-dashboard/src/redux/orders/actions.js:1114-1142`

#### UI-XDLST-009 — A refused export shows a generic error instead of the reason
- **Why it matters.** When a member is blocked (code 10) or the range is missing (code 2), the screen discards the server message and shows 'Some error occurred while exporting report. Please try again.' — the user retries forever.
- **Setup.** A member on a company with is_download_bulk_report_disabled_for_members ON.
- **Steps.** Click Download report and submit.
- **Expected.** The screen should say the export is not allowed for their role. Today: the generic retry message.
- **Oracle.** Toast text.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:508-516` · `app/controllers/api/reports_controller.rb:160-161`

#### UI-XDLST-010 — 'Clone Project' is offered only when the company allows it and the project qualifies
- **Why it matters.** The menu item is removed unless allowed_to_clone_project is on, the user is not a planner, and the project is neither draft nor PR-created. Note: the API does not enforce the company setting (see API case on cloning with the feature off), and UI-PUB-021's expectation of a 1122 message for drafts cannot happen on screen because the item is hidden.
- **Setup.** PROCOL DEMO (setting off) and a company with it on; an active, a draft and a PR-created project.
- **Steps.** Open the project options menu on each.
- **Expected.** Setting off: no Clone item anywhere. Setting on: Clone only on the active non-PR project.
- **Oracle.** Menu items per project.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/projectDetails.jsx:258-272` · `app/controllers/concerns/event_group_controller_helper.rb:534` · `app/controllers/concerns/event_group_controller_helper.rb:565` · `procol-client-dashboard/src/views/projectDetails/projectOptionConfig.jsx:20-24`

#### UI-XDLST-011 — Cloning warns about unsupported stages and opens the new draft
- **Why it matters.** The modal is the only place a buyer learns auctions are not copied; after success they land on the clone, which is a draft.
- **Setup.** Company with cloning on; an active RFQ project.
- **Steps.** Clone Project → read the modal → Yes, Clone Project.
- **Expected.** Modal text 'Cloning is supported only for the Technical and RFQ stages.'; toast 'Project cloned successfully'; the browser opens the new project's Details tab; it shows as Draft with a new ref id and the same title.
- **Oracle.** URL uuid differs from the source; status Draft.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/components/cloneProjectModal.jsx:12-53`

#### UI-XDLST-012 — 'Change Owner' is offered only with owner-only visibility on and an active commercial stage
- **Why it matters.** The item is removed unless is_allowed_to_change_ownership is true: an active RFQ/auction stage, restrict_event_visibility_to_owner ON, caller not on the planning team, caller owner/super admin/Procol employee.
- **Setup.** PROCOL DEMO (setting off) and a company with it on; a project with only an RFP stage live.
- **Steps.** Open the options menu as owner, as super admin, as a team-mate.
- **Expected.** Setting off: no item. Setting on: item for owner and super admin only, and only when a commercial stage is active.
- **Oracle.** Menu items per user.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/projectDetails.jsx:263-265` · `app/controllers/concerns/event_group_controller_helper.rb:604-614` · `procol-client-dashboard/src/views/projectDetails/projectOptionConfig.jsx:15-19`

#### UI-XDLST-013 — The Change Owner modal lists eligible team-mates and redirects non-admins after success
- **Why it matters.** The modal states the consequences, disables the button until a user is picked, and — for non-admins with owner-only visibility — sends them back to the list because they lose access.
- **Setup.** Company with restrict_event_visibility_to_owner ON; owner (non-admin) with a QA team-mate.
- **Steps.** Open Change Owner; read the text; pick the team-mate; confirm.
- **Expected.** Text 'Remove access from the current owner'; Change owner disabled until a pick; list equals GET team_buyers; on success 'Owner changed successfully' and redirect to the events list; the project disappears from the old owner's Live tab.
- **Oracle.** Toast, URL after success, card absence.
- **Trace.** P1 · manual · `procol-client-dashboard/src/views/projectDetails/components/changeOwnerModal.jsx:21-56` · `procol-client-dashboard/src/views/projectDetails/components/changeOwnerModal.jsx:63-85` · `app/controllers/concerns/event_group_controller_helper.rb:595-602`

#### UI-XDLST-014 — A refused owner change shows only 'Failed to change owner'
- **Why it matters.** 960 ('New Owner must be in same team as that of current owner') or 2 are replaced by a generic toast; the user cannot tell what to fix.
- **Setup.** Force a refusal (e.g. pick a user who left the team between opening and confirming).
- **Steps.** Confirm the change.
- **Expected.** The toast should carry the server's reason. Today: 'Failed to change owner'.
- **Oracle.** Toast text.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/projectDetails/components/changeOwnerModal.jsx:52-54`

#### UI-XDLST-015 — The Recurring tab's search box does not narrow the list
- **Why it matters.** The box sends filters.title but the backend ignores all parameters on this endpoint.
- **Setup.** PROCOL DEMO with two recurring templates.
- **Steps.** Type one template's title in the Recurring search.
- **Expected.** Only that template. Today: both remain.
- **Oracle.** Card count.
- **Trace.** P2 · manual · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:928-940` · `app/controllers/api/event_groups_controller.rb:374-412`

#### UI-XDLST-016 — A cloned project appears at the top of Drafts under today's date
- **Why it matters.** Clones are marked as saved drafts so they show up in Drafts; the buyer expects to find their copy there.
- **Setup.** Company with cloning on.
- **Steps.** Clone a project, go back to the list, open Drafts.
- **Expected.** The clone is listed under today's date group with the source's title.
- **Oracle.** Card present in Drafts.
- **Trace.** P2 · manual · `app/services/event_groups/clone_service.rb:88-100` · `app/controllers/concerns/event_group_controller_helper.rb:908-917`

#### UI-XDLST-017 — Live keeps refreshing every 30 seconds only while visible, and the 'new projects' pill scrolls up
- **Why it matters.** The Live query polls every 30 s while the tab is active and the page visible; when newer projects exist a pill appears.
- **Setup.** Two browser sessions on the same company.
- **Steps.** Keep Live open in session 1; publish a QA event in session 2; wait 30 s; switch tab away and back.
- **Expected.** The new project shows up (or the pill appears; clicking scrolls to top and reloads). No polling while the browser tab is hidden.
- **Oracle.** Network log intervals; pill visibility.
- **Trace.** P2 · manual · `procol-client-dashboard/src/viewModels/orders/useOrdersListViewModel.js:235-251` · `procol-client-dashboard/src/views/orders/constants.js:156` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:732-733` · `procol-client-dashboard/src/views/orders/components/projectTable.jsx:542-553`
