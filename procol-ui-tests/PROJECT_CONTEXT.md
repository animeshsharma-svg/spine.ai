# Procol UI Tests — Project Context

Conventions, hard-won quirks, and extension guide. Read before touching flows.

## Design principles

1. **Mirror the API layer.** Same `FlowModule` shape (`key`, `category`, `title`,
   `enabledFor(config) -> Gate`, `run(ctx)`), same config-gating, same
   skip-with-reason. UI and API flows must be interchangeable to the orchestrator.
2. **Everything dynamic.** No hardcoded per-client catalog. Titles are stamped
   unique; line items are searched (`"a"`); the pricing sheet is filled from the
   template's own schema (widgets discovered at runtime from the `/templates/`
   response), never from fixed field ids.
3. **Resilient locators, not names.** See below.
4. **Validate as you go.** Each step asserts its effect (title stuck, redirected
   to a project URL with a real id, no error toast) rather than assuming success.
5. **Config-driven.** Flows gate on the live client config; disabled flows skip
   with a reason and show in the capability map.

## Resilient locator pattern (`src/support/locate.ts`)

No action is pinned to a single selector — the console drifts (e.g. the create
trigger is **"Create Event"** on cpanel but was **"New Event"** in older builds;
the create menu offers *Single Stage / eRFX Project / BOQ*).

Every action takes an **ordered list of candidate locators** built with different
strategies and polls across all of them until one is actionable, then acts:

```ts
await this.click(
  [
    p.getByRole("button", { name: /create event/i }), // most specific first
    p.getByRole("button", { name: /new event/i }),    // legacy label
    p.getByRole("button", { name: /\+?\s*event/i }),  // loose fallback
  ],
  { label: "create-event-trigger" },
);
```

- `clickFirst` / `fillFirst` / `firstMatch` / `expectFirst` / `clickIfPresent`.
- They poll (visible + enabled) across candidates within a budget; if one
  candidate's click throws, they fall through to the next — "if it doesn't get
  clicked, try another".
- `BasePage` exposes them as `this.click/fill/find/expect/clickIfPresent`.
- Put the **stable** candidate first (testid, role), looser text/css after.

## Status (green flows)

Verified live-green on cpanel.ag-ri.in (each publishes a real event). 11 registered:

**eRFX (project) — `createAndPublishErfx(page, {stages, products, titlePrefix})`:**

| Flow key | Stages |
|---|---|
| `events.rfq_only` | RFQ |
| `events.rfp_only` | Technical (RFP) + evaluator per line item |
| `events.rfp_rfq` | Technical + RFQ |
| `events.rfp_auction` | Technical + Auction |
| `events.rfq_auction` | RFQ + Auction |
| `events.auction_rank` | Auction (default rank-based) |
| `events.multi_product` | RFQ, 3 line items |

**Single-stage (non-eRFX) — `createAndPublishSingleStage(page, {eventType, auctionSubtype, awarding, ...})`:**

| Flow key | Config |
|---|---|
| `events.single_stage_rfq` | RFQ, lot-wise |
| `events.auction_price` | Auction, Price Based |
| `events.award_lot_wise` | RFQ, award entire lot to single vendor |
| `events.award_line_item_wise` | RFQ, partially award to multiple vendors |

Covers every event type asked for (single-stage / eRFX / non-eRFX / rfq+rfp /
rfp+auction / only rfq|rfp|auction) plus both awarding modes, all selected at
creation time.

**Deferred (code present in `src/flows/singleStage.ts`, not registered):**
`events.auction_traffic_light` (Traffic Light needs a "specified range" config
step before Save), `events.single_stage_rfp` (title-fill edge case; RFP already
covered by `events.rfp_only`), `events.auction_dutch` (Dutch + Knockout are
greyed-out / config-disabled for clientA), `events.boq_event` (BOQ Excel path).

## Composable event engine

`createAndPublishErfx` sequence: enter eRFX → add line items → pick stages
(checkboxes: *Technical Stage* / *RFQ* / *Auction*) → title → per stage:
- **rfp**: `selectFirstTemplate()` + `assignEvaluatorToAllLineItems()`
- **rfq/auction**: `selectFirstTemplateAndExtractWidgets()` + `fillSheet()`
→ invite vendor → publish → assert project URL + no error toast.

- **Technical-stage evaluator is mandatory to publish.** Each line item shows an
  `evaluator-add-button`; the picker options are `evaluator-option-*`. Click the
  add button then the first option — do **not** type a query first (typing can
  filter out the only evaluator and silently leave the line item unassigned →
  publish blocked with "Please add Evaluator to all the line items").
- **Later stages can inherit a template** (no *Select Templates* picker, shows the
  template name instead). `selectFirstTemplateAndExtractWidgets()` detects the
  missing picker and derives widgets from the already-rendered sheet.

## Auction sub-types (rank / price / dutch / traffic-light / knockout)

Discovered mechanism (the "deep probe" result): sub-types are configured in a
**"Configuration for Event"** modal, reachable **only from the single-stage flow**
(`/orders/quick-create?singleStage=true`) via the **Event Type** chip button
(shows `RFP`/`RFQ`/`Auction`). The eRFX schedule button does NOT open it.

Modal contents: Event Type tabs **Auction / RFQ / RFP**; picking Auction reveals
**Rank Based / Price Based / Traffic Light / Knockout / Dutch Auction** (each with
a description) + award config; a **Save** button commits it.

- `events.auction_rank` is green via eRFX (default is rank-based) — no modal needed.
- `auction_price`, `auction_dutch`, `auction_traffic_light` require the
  **single-stage page object** (below) to reach that modal. Roadmapped, not yet built.

## Single-stage quick-create (roadmap — page object not yet built)

`/orders/quick-create?singleStage=true`. Distinct from eRFX:
- Title input placeholder `Enter the title of this event`.
- Event Type chip button (`RFP` default) → the config modal above.
- *Select Templates* → `template-item-*` / `template-search-input`.
- **Line items are the template sheet itself** (`sheet-cell-*`), NOT a separate
  "add line items" combobox — this is the main thing to work out to finish it.
- Participants combobox placeholder `Search vendors you want to add`.
- *Publish Event* button.

Building this one page object unlocks `single_stage_quick` + all auction sub-types.

## App quirks (verified live on cpanel.ag-ri.in)

- **Login is two-step + laggy.** phone → *Send OTP* → OTP field appears → *Login*
  → `/home`. `procol_access_token` in `localStorage` is the proof of login. It is
  stored **already fully-encoded** as `base64("appKey:appSecret:<token>")` and
  JSON-quoted — the config probe parses the JSON and uses it verbatim as the
  `access-token` header (do NOT re-encode).
- **Backend is chosen via `localStorage.procol_current_selected_api`**, injected
  by `LoginPage.goto()` before the SPA boots. This is what makes one frontend
  point at any backend.
- **Transient popups intercept clicks:** browser-notification prompt (*Not now*),
  cookie banner (*Got it*), "stay updated" notice. `BasePage.dismissDistractions()`
  clears them; it's cheap and safe to call before important interactions.
- **Create-event entry:** `/orders` → *Create Event* → *eRFX Project* (multi-stage
  project) or *Single Stage* (`/orders/quick-create?singleStage=true`).
- **Inline sheet cells** use the build-stable testid `sheet-cell-{rowNo}-{widgetKey}`
  (row 0 = header). Widget keys are per-event, discovered from the template schema
  — never pin absolute ids. See `src/helpers/inlineSheet.ts`.
- **Publish** may or may not show a confirm modal depending on build; the publish
  step tries the modal confirm and tolerates its absence.
- **Each green run publishes a REAL RFQ** (invites the client's full vendor
  audience, e.g. 152 vendors) with a `UI_Auto_RFQ_<timestamp>` title. This is the
  same live-data trade-off the API framework makes on UAT; there is no cleanup.

## Environment (clientA)

- App: `https://cpanel.ag-ri.in`  ·  API: `https://sec-api.ag-ri.in/api`
  (same backend family as the API framework's `sec-api-v1`).
- Buyer: phone `1234567516`, fixed sandbox OTP `130899`.
- This buyer has 27 authorized modules incl. `trade`, `pr`, `intake`, `approvals`.

## Adding a new flow

1. Create `src/flows/<name>.ts` exporting a `UiFlowModule`.
2. Reuse Page Objects / add methods with resilient locators; keep data dynamic
   and assert effects.
3. Write `enabledFor(config)` using `config.hasModule(name, op?)` /
   `config.flag(key)` — match the API layer's gate meaning for the same feature.
4. Register it in `src/master/registry.ts`.
5. Optionally add a focused spec under `tests/flows/`.
6. `npm run typecheck` then `npm run test:master`.

### Batch 1 roadmap (remaining, in build order)

**Events (4 left)** — `single_stage_quick`, `auction_price`, `auction_dutch`,
`auction_traffic_light` all need the single-stage page object above;
`boq_event` needs the *BOQ based RFX Project* entry + Excel upload (see API
framework `src/flows/boq.ts` for the `product_sheet_params` mechanics).

**Event lifecycle (7)** — operate on a created event's detail page:
`event.terms_conditions` (create-time *Add T&Cs* button — cheapest),
`event.add_participants` (Participants combobox — cheap),
`event.versioning` (event detail → *Create New Version*),
`event.convert_to_auction` (RFQ detail → convert),
`event.extend_submission_time` (needs expired/eval state — `ProjectStagePage` in
the app e2e has the pattern: settings → *Extend Submission Time*),
`event.surrogate_bid` (event detail → Participants → add-bid sheet),
`event.counter_offer` (needs a live bid first).

**Entry paths (4)** — `entrypath.pr_create` (PR module UI, independent),
`entrypath.pr_to_event` (PR → convert), `entrypath.intake_to_pr` (intake module),
`entrypath.pr_bulk_upload` (file upload). Nav links live: `/purchase-requisitions`,
`/intake-requests`.

**Evaluation/award/savings (5)** — `eval.*` all need a live submitted bid first;
fastest path is to seed the bid via the API framework (`../procol test`
`tests/flows/vendor-bid.spec.ts`) then verify in the UI. The auction/RFQ close
wait makes these the slowest flows.

Cross-reference `../procol test` `src/master/registry.ts` for the API twin of each.

## Known gaps / next

- Config gate `enabledFor` is proven across the event flows; extend as flows land.
- Vendor-side flows (bid/onboarding response) will need the vendor app
  (`quotes.ag-ri.in`) + the one-login-per-vendor handling noted in the master doc.
- Consider reusing the API layer's DB-session auth to mint a token and inject it
  into `localStorage` to skip OTP entirely (master doc decision D4) — would also
  let eval flows seed bids without the vendor OTP dance.
- Each event flow run is ~20–75s (live publish); tech-stage flows are slowest.
  Keep runs sequential — parallel runs collide on shared UAT data.
