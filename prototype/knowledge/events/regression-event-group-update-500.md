# Finding — every eRFX event-group update returns 500 (regression, 2026-09-08)

Severity: **critical** · blast radius: **7 of 7 eRFX journeys** · found by: UI Oracle, run `events-full`

## Symptom

`PATCH /api/event_groups/:uuid` returns `{"status":500,"error":"Internal Server Error"}` on every
attempt, for **both** statuses:

- `status: "active"` — Publish. The confirm modal accepts, then nothing happens; the browser stays on
  `/orders/quick-create?projectCreation=true`.
- `status: "draft"` — Save as draft. Same 500.

The user sees a button that does nothing. Nothing is created: searching the events list for a
`UI_Probe_Draft_*` title returns no rows, so the raise happens **before the write commits**.

## Why it is a product defect and not bad test data

- Client-side validation passes first: no error toast appears before the confirm modal, and the modal
  itself renders correctly ("Vendors invited: 1", schedule, evaluation time).
- The failing payload is built by the application itself (`src/redux/project/actions.js`
  `updateProject`), not by the test.
- `{"status":500,"error":"Internal Server Error"}` does not match this API's `render_error_json`
  convention, so it is an **unhandled exception**, not a deliberate error code.

## It is a regression, and the window is known

`UI_Auto_RFQ_2026-09-08_07-49-22-827` is **Live** on the events list (`RFX-11034` / `RFQ-16086`,
0/154 bids) — an eRFX RFQ event published successfully by this same automation at **07:49 on
2026-09-08**. Every attempt from **16:29 on 2026-09-08** onward fails. So the regression landed in an
≈8-hour window on 2026-09-08.

The local `procol-backend` checkout is stale (HEAD = 2026-09-01 23:44), so the deployed code in that
window has not been diffed.

## Invariant across the repro

Changing these makes no difference — all still 500:

| Varied | Values tried |
|---|---|
| Stage type | auction, RFQ, technical (RFP) |
| Line items | 1, 2 |
| Invited vendors | 0, 1, 154 |
| Pricing sheet | filled, empty |
| Schedule | default, explicitly saved via "Save Schedule" |
| Status | `active`, `draft` |

Non-eRFX **single-stage** creation on the same environment succeeds and lands on `/project/:id/details`,
so the environment is not globally broken — the fault is specific to the event-group update path.

## Exact reproduction

1. `/orders` → Create Event → eRFX (`/orders/quick-create?projectCreation=true`).
2. Set a title. Pick a template (`Select Templates` → any) — required before the next step.
3. Toolbar `Items N` → "Manage Line Items" → add 1 product → Save.
4. Press **Save as draft** (no need to publish).
5. `PATCH /api/event_groups/:uuid` → 500.

Payload sent at step 5:

```json
{"attachments":[],"title":"UI_Probe_Draft_1788900084546","status":"draft",
 "draft_trade_request_uuids":["WE5na0RO"],"audience_company_uuids":[],"line_items":[],
 "terms_and_conditions":{"clauses":[],"attachments":[{"type":"t_and_c","value":[]}]},
 "show_under_open_events":true,"delete_draft_stage_uuids":[],"amendment_remarks":{}}
```

## Candidate causes and what rules each in or out

See [publish-500-analysis.md](publish-500-analysis.md) for the full static trace. Summary:

| Candidate | Reachable with `status: "draft"`? | Verdict |
|---|---|---|
| `lock_transaction` double-render — `event_groups_controller.rb:74` calls it bare, and on a held lock it `render_error_json(516)` then falls through to the trailing `render` → `DoubleRenderError` | yes (runs before the status branch) | Fits the response shape exactly, but needs a lock already held; our repro sends a single PATCH minutes after the create, and the lock TTL is 8 seconds |
| `set_customized_audiences` — `trade_controller_helper.rb:687-729`, called for both statuses (`update_service.rb:69` and `:317`); an eRFX stage never gets its audience initialised at creation | yes | No raise found by static trace; cannot be excluded without live state |
| `TradeSchedule.change_auction_time(nil)` in `publish_auction` — `trade_controller_helper.rb:4309`, `trade_schedule.rb:139`, no nil guard | **no** — only under `@event_group.draft? && @status == 'active'` | A real unguarded raise and worth fixing, but it cannot explain the draft 500 |

## Fastest confirmation

Pull the exception class and backtrace for one repro from Sentry (wired in
`config/initializers/sentry.rb`) or the raw Rails log. The app's own `log_error` never fires for an
unhandled exception, so the application log alone will not show it.

- `AbstractController::DoubleRenderError` → candidate 1.
- A frame in `trade_controller_helper.rb:687-729` → candidate 2.
- Anything else → the static trace missed it; diff the deployed backend across
  2026-09-08 07:49 → 16:29.
