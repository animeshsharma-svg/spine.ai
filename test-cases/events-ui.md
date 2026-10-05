# Events — UI test cases

The buyer console, the supplier portal, and everything that happens between them.
Written as journeys a person can follow, with the assertion an automation would make
underneath each one.

Read [README.md](README.md) first for the case format, the priority scale and the
gating rule. In short: **Setup** is what must be true before step 1, **Expected** is the
acceptance criterion, **Oracle** is what the machine checks, and a `gate:` in Setup
means the case is *not applicable* — not failing — on a tenant without that flag.

Two environment facts that shape almost every case below:

- **The eRFX create screen is order-sensitive.** Template before line items, always;
  the `Items N` toolbar button is inert until a template defines the sheet schema.
  Schedule is not persisted until **Save Schedule** is pressed. A test that gets this
  order wrong produces a failure that reads exactly like a product bug.
- **`/orders/quick-create` is not a project id.** Any "did it publish?" check that
  matches `/orders/[^/]+` passes on the create screen itself. Every redirect oracle in
  this catalog excludes `quick-create|create|detail|new`.

**Contents**

1. [Before you start — entry points and environment](#1-before-you-start)
2. [Composing the project — stages and event types](#2-composing-the-project)
3. [Templates and the pricing sheet](#3-templates-and-the-pricing-sheet)
4. [Line items](#4-line-items)
5. [The technical (RFP) stage](#5-the-technical-rfp-stage)
6. [Auction configuration, strategy by strategy](#6-auction-configuration)
7. [Schedule and the bid window](#7-schedule-and-the-bid-window)
8. [Participants and audience](#8-participants-and-audience)
9. [Savings, terms and conditions](#9-savings-terms-and-conditions)
10. [Publish and draft](#10-publish-and-draft)
11. [RFQ → Auction conversion](#11-rfq--auction-conversion)
12. [BOQ events](#12-boq-events)
13. [PR → event](#13-pr--event)
14. [Classic single-stage events](#14-classic-single-stage-events)
15. [The vendor's bid, in the supplier portal](#15-the-vendors-bid)
16. [Surrogate bidding — the buyer bids for a vendor](#16-surrogate-bidding)
17. [Awarding](#17-awarding)
18. [Isolation, masking and permissions](#18-isolation-masking-and-permissions)
19. [Data validation and unpleasant input](#19-data-validation-and-unpleasant-input)
20. [Non-functional and resilience](#20-non-functional-and-resilience)

---

## 1. Before you start

Entry points, and the environment facts that make everything after this section
either possible or a waste of a run. These are cheap and they fail loudly, which is
exactly what you want at the front of a suite.

#### UI-ENV-001 — A buyer with trade-create permission reaches the events list
- **Why it matters.** If `/orders` does not render, every other case in this file
  fails for the same uninteresting reason. This case makes that one line of output
  instead of three hundred.
- **Setup.** Buyer credentials for the tenant under test; `trade` module readable.
- **Steps.** Log in. Land on the dashboard. Open **Events** from the left rail.
- **Expected.** The events list renders with its rows, filters and the Create Event
  control. No error toast.
- **Oracle.** `/orders` reached with `waitUntil: "domcontentloaded"` (this console
  holds long-lived connections open, so `load` may never fire and a `load` wait times
  out at 45s on a page that is already usable); the Create Event control is visible.
- **Trace.** P0 · automate · flow `auth` + `EventsPage.goto` · PRD §7.1

#### UI-ENV-002 — The Create Event menu offers eRFX and single-stage per tenant config
- **Why it matters.** The two creation screens are different products. Picking the
  wrong one is the single most common way a test ends up asserting the wrong screen.
- **Setup.** Two tenants: one with `rfx_project_enabled` on, one with it off.
- **Steps.** On the events list, open **Create Event** and read the options.
- **Expected.** With `rfx_project_enabled` on, both eRFX (multi-stage project) and
  single-stage are offered. With it off, only the classic single-stage path exists and
  no stage tabs appear anywhere.
- **Oracle.** On the eRFX tenant the create URL carries `projectCreation=true`; on the
  classic tenant it carries `singleStage=true` and no stage tab strip renders.
- **Trace.** P1 · automate · `ClientConfig.flag("rfx_project_enabled")`

#### UI-ENV-003 — The capability map matches what the screens actually offer
- **Why it matters.** Gating is the whole reason a case can be "not applicable". If
  the map the runner reads disagrees with the screen, every gated case is decided on
  bad information.
- **Setup.** Any tenant.
- **Steps.** Read the tenant's config/flag map. Open the create screen. Compare: does
  each flag the map claims is on correspond to a control that exists?
- **Expected.** They agree. A flag the map says is on has its control; a flag it says
  is off has none.
- **Oracle.** Diff the flag set against a DOM probe of the gated controls; report each
  disagreement as a finding, not as a test failure.
- **Trace.** P2 · automate · `master/config.ts` · CONFIG_CATALOG.md

#### UI-ENV-004 — One browser window per run, and the session survives the whole journey
- **Why it matters.** Buyer→vendor→buyer journeys span contexts. A run that loses its
  buyer session halfway through reports a bid failure that is really a login failure.
- **Setup.** A journey that switches to the vendor portal and back (see §15).
- **Steps.** Run a full create → bid → award journey.
- **Expected.** The buyer's session is still valid when control returns to the console;
  the vendor's context is separate and closed at the end.
- **Oracle.** After the vendor context closes, the buyer page still resolves an
  authenticated route without being bounced to `/login`.
- **Trace.** P1 · automate · `bid.submit` (vendor gets its own `browser.newContext()`)

#### UI-ENV-005 — Events list loads inside the performance budget
- **Why it matters.** The PRD sets an explicit target and it is the first thing a
  buyer feels every morning.
- **Setup.** A tenant with a realistic event volume (not a fresh empty workspace).
- **Steps.** Navigate to the events list from the dashboard, cold.
- **Expected.** Rows are on screen in under ~3 seconds.
- **Oracle.** Measure navigation start → first row painted; record the number rather
  than asserting a hard pass/fail on a shared environment, and flag anything over 3s.
- **Trace.** P2 · automate · PRD §7.1

#### UI-ENV-006 — Events list filters and search find a just-published event
- **Why it matters.** Later cases find their event by title. If search does not index
  it, half the catalog cannot locate its own fixture.
- **Setup.** An event published in this run with a unique generated title.
- **Steps.** Return to the events list. Search the title. Also filter by status Live.
- **Expected.** Exactly one row, matching the title, with the expected status and ref
  id (`RFX-…` at project level, `RFQ-…`/`AUC-…` per stage).
- **Oracle.** One row; its ref id matches the id in the URL the publish redirect
  produced.
- **Trace.** P1 · automate · `EventsPage`

#### UI-ENV-007 — A vendor can reach the supplier portal login
- **Why it matters.** Same argument as UI-ENV-001, for the other half of the journey.
- **Setup.** `VENDOR_URL` and a vendor email that is a real participant somewhere.
- **Steps.** Open the supplier portal `/login`.
- **Expected.** The login screen renders and offers "Continue with email".
- **Oracle.** The email-mode control is present; the app's stored backend pointer
  matches the environment under test, so no API injection is needed.
- **Trace.** P0 · automate · `VendorPortalPage.goto`

#### UI-ENV-008 — Vendor email-OTP login completes
- **Why it matters.** Every vendor-side case depends on it, and OTP is the flakiest
  step in the catalog.
- **Setup.** Vendor email plus a usable OTP (fixed test OTP on non-production).
- **Steps.** Continue with email → enter the email → Send OTP → enter OTP → Log in.
- **Expected.** The portal leaves `/login` and lands on the events list with Live and
  History tabs.
- **Oracle.** URL no longer contains `/login`; if it still does, report the error
  toast text rather than a bare timeout.
- **Trace.** P0 · automate · `VendorPortalPage.login`

#### UI-ENV-009 — An evaluator and an admin can each sign in
- **Why it matters.** The RFP and master-data cases need those roles, and role setup
  is where tenant provisioning usually bites.
- **Setup.** One user in an evaluator team, one admin.
- **Steps.** Sign in as each in turn.
- **Expected.** Each lands on a dashboard whose navigation reflects the role — the
  evaluator sees evaluation entry points, the admin sees master data.
- **Oracle.** Per role, assert the presence of one nav item unique to it and the
  absence of one it should not have.
- **Trace.** P2 · automate-later · PRD §2

#### UI-ENV-010 — Distraction dismissal never closes the panel under test
- **Why it matters.** A generic "close any dialog" helper is the classic own-goal here:
  the line-items drawer's own close button is `button.ant-drawer-close`, so a
  `/^(close|dismiss)$/i` candidate slams shut the drawer the test just opened.
- **Setup.** A create screen with the Manage Line Items drawer open.
- **Steps.** Trigger the automation's distraction-dismissal routine while the drawer
  is open.
- **Expected.** Product tours, cookie notices and unrelated toasts are dismissed. The
  drawer stays open.
- **Oracle.** After dismissal the drawer's own combobox is still visible;
  `.ant-drawer-close` / `.ant-modal-close` are excluded from the candidate list.
- **Trace.** P1 · automate · create-screen-contract.md "Traps for automation"

---

## 2. Composing the project

An eRFX project is a container for one or two stages. Which stages you can hold at
once is the least obvious rule in the product, and it is enforced in three places at
the same time (`isValidStage`, the `+` menu builder, and the tab's own delete
control). These cases pin all three.

#### UI-CRE-001 — The create screen arrives with exactly one Auction stage
- **Why it matters.** Every composition case starts from this state. If the default
  changes, the four-move dance in UI-CRE-003 silently builds something else.
- **Setup.** gate: `rfx_project_enabled`. Buyer with `trade: create_record`.
- **Steps.** Events → Create Event → eRFX. Read the stage tab strip.
- **Expected.** One tab, an Auction stage, selected.
- **Oracle.** Exactly one tab; its mode is `auction` (`DEFAULT_STAGE.AUCTION`).
- **Trace.** P1 · automate · `projectCreation.jsx` · flow `events.auction_rank`

#### UI-CRE-002 — A default Auction publishes with nothing but the defaults touched
- **Why it matters.** It is the shortest possible successful event and therefore the
  fastest smoke test of the whole publish path.
- **Setup.** gate: `rfx_project_enabled`.
- **Steps.** Create eRFX → title → pick a template → add one line item → fill the
  sheet → Save Schedule → invite a vendor → Publish → confirm.
- **Expected.** The event publishes as a rank-based auction: `mode=auction`,
  `strategy=rank`, lot-based closing, offers on base price.
- **Oracle.** Redirect to a real project id (excluding `quick-create|create|detail|new`)
  and no error toast within 1s of the redirect.
- **Trace.** P0 · automate · flow `events.auction_rank` · PRD §3.2

#### UI-CRE-003 — RFQ-only takes four moves, and they must be in this order
- **Why it matters.** There is no "start from RFQ". You add Technical to unlock the
  delete control, delete Auction, add RFQ, then delete Technical. Get the order wrong
  and you ping-pong forever, deleting the filler you just added.
- **Setup.** gate: `rfx_project_enabled`.
- **Steps.** From the default Auction tab: `+` → Technical Stage. Auction tab `⋮` →
  Delete. `+` → RFQ. Technical tab `⋮` → Delete. Select the RFQ tab.
- **Expected.** One stage remains and it is RFQ. The panel renders RFQ's own fields.
- **Oracle.** Exactly one tab matching `/\bRFQ\b/i`; after the last delete, click the
  wanted tab explicitly — the panel can render blank until a tab is selected.
- **Trace.** P0 · automate · flow `events.rfq_only` · create-screen-contract.md

#### UI-CRE-004 — The `+` menu offers only the stages that are still valid
- **Why it matters.** The menu is the product's own statement of what can coexist.
  Reading it is cheaper and more honest than inferring the rule.
- **Setup.** A project holding one Auction stage.
- **Steps.** Open the `+` menu.
- **Expected.** Only Technical Stage is offered. Auction is not (it is already present),
  and neither is RFQ: RFQ and Auction never sit in one project (`isValidStage`).
- **Oracle.** Menu item set is exactly {Technical Stage}.
- **Trace.** P1 · automate · `getDropdownMenu` · `isValidStage` (projectCreation.jsx:3059)
- **Corrected.** 5 Oct 2026 — the first version expected RFQ to be offered too; the live
  screen and the code both say RFQ is refused while an Auction is present.

#### UI-CRE-005 — Adding an Auction while an RFQ is present is refused, with a reason
- **Why it matters.** This is the mutual exclusion, and the product explains it in
  words. A test should assert the words, because that sentence is what a buyer acts on.
- **Setup.** A project holding a Technical stage and an RFQ stage.
- **Steps.** Hover the `+`.
- **Expected.** The `+` is disabled (two stages is the ceiling) and its tooltip reads
  "Remove RFQ to add Auction". (With an RFQ alone, Auction is simply absent from the
  menu and no reason is shown — the tooltip exists only at two stages.)
- **Oracle.** `+` disabled; tooltip text matches.
- **Trace.** P1 · automate · `isValidStage` · `getTooltipContent` (projectCreation.jsx:3184)
- **Corrected.** 5 Oct 2026 — the first version expected the tooltip with one RFQ stage;
  the code shows it only when two stages are present.

#### UI-CRE-006 — Adding an RFQ while an Auction is present is refused, with a reason
- **Why it matters.** The mirror of UI-CRE-005; the tooltip differs and buyers read it.
- **Setup.** A project holding one Auction stage plus one Technical stage.
- **Steps.** Open `+`.
- **Expected.** RFQ is not offered; the tooltip reads "Remove Auction to add RFQ".
- **Oracle.** Tooltip text matches; `+` offers nothing addable.
- **Trace.** P1 · automate · `isValidStage`

#### UI-CRE-007 — Technical + RFQ is a legal pair
- **Why it matters.** It is the most common real two-stage event: qualify, then price.
- **Setup.** gate: `rfx_project_enabled`.
- **Steps.** Compose Technical + RFQ. Fill each stage's own requirements. Publish.
- **Expected.** Two stages publish, ordered RFP then RFQ.
- **Oracle.** Two stage tabs; after publish the project shows two stages in
  `STANDARD_STAGES_SEQUENCE` order (rfp=1, rfq=2).
- **Trace.** P0 · automate · flow `events.rfp_rfq` · PRD §3.2

#### UI-CRE-008 — Technical + Auction is a legal pair
- **Why it matters.** The other legal pair, and it exercises auction config on a
  two-stage project where the RFP's window constrains the auction's.
- **Setup.** gate: `rfx_project_enabled`.
- **Steps.** Compose Technical + Auction. Fill both. Publish.
- **Expected.** Two stages publish, ordered RFP then Auction.
- **Oracle.** Two stages; the auction stage carries its strategy config.
- **Trace.** P1 · automate · flow `events.rfp_auction`

#### UI-CRE-009 — Two stages is the ceiling
- **Why it matters.** The cap is enforced purely on count, independent of validity, so
  it needs its own case rather than riding on the exclusion cases.
- **Setup.** A project holding Technical + RFQ.
- **Steps.** Try `+`.
- **Expected.** `+` is disabled with a tooltip explaining that a stage must be removed
  first.
- **Oracle.** `+` disabled; the count is 2.
- **Trace.** P1 · automate · `getTabBarExtraContent`

#### UI-CRE-010 — Delete is disabled while one stage remains
- **Why it matters.** It is why UI-CRE-003 needs the filler stage at all. If this ever
  becomes enabled, a project can reach zero stages and publish becomes undefined.
- **Setup.** A project with exactly one stage.
- **Steps.** Open that tab's `⋮` menu.
- **Expected.** Delete is present but disabled.
- **Oracle.** The Delete menu item exists and is disabled — not absent.
- **Trace.** P1 · automate · `projectCreation.jsx` stageConfig length check

#### UI-CRE-011 — Delete is hidden entirely while editing a recurring stage
- **Why it matters.** Hidden and disabled are different states, and a test that only
  knows "not clickable" will not notice the change.
- **Setup.** gate: `scheduled_events_enabled`. An existing recurring stage, in edit.
- **Steps.** Open the tab's `⋮` menu.
- **Expected.** No Delete item at all.
- **Oracle.** Zero Delete menu items in the DOM.
- **Trace.** P2 · automate-later

#### UI-CRE-012 — Deleting a persisted stage queues it for server-side cleanup
- **Why it matters.** A stage that exists on the server and is deleted client-side has
  to be told to the server, or the published event carries a ghost stage.
- **Setup.** A draft project reopened for edit, with a persisted stage.
- **Steps.** Delete that stage. Save the draft.
- **Expected.** The stage disappears and does not come back when the draft is reopened.
- **Oracle.** The stage's backend id appears in `delete_draft_stage_uuids` on the save
  request; on reload the stage is gone.
- **Trace.** P1 · automate-later · `update_service.rb` draft branch

#### UI-CRE-013 — A second stage of a type already present is refused
- **Why it matters.** Duplicate-type is a different rule from the RFQ/Auction
  exclusion, and it is the one that catches "RFQ 2" tabs.
- **Setup.** A project holding one RFQ.
- **Steps.** Open `+` and look for RFQ.
- **Expected.** RFQ is not offered a second time.
- **Oracle.** No second RFQ item.
- **Trace.** P2 · automate

#### UI-CRE-014 — Tab titles auto-number repeated stage modes
- **Why it matters.** Automation matches tabs by label. The app builds them as
  `RFQ ${n > 0 ? n + 1 : ""}`, so the first RFQ tab is literally `"RFQ "` with a
  trailing space and `/^RFQ$/` matches nothing.
- **Setup.** A project where a second Technical stage is legal.
- **Steps.** Add a second Technical stage. Read both tab labels.
- **Expected.** "Technical Stage" and "Technical Stage 2".
- **Oracle.** Match tabs with unanchored patterns (`/\bRFQ\b/i`, `/technical stage/i`),
  never with `^…$`.
- **Trace.** P2 · automate · `getTitleForStage` · `createErfx.ts` STAGE_TAB

#### UI-CRE-015 — Renaming a stage inline trims whitespace and ignores an empty name
- **Why it matters.** Small, but a whitespace-only stage title makes every later tab
  match ambiguous.
- **Setup.** Any stage tab.
- **Steps.** Rename to `"  My Stage  "`. Then rename to `"   "`.
- **Expected.** First becomes `My Stage`; the whitespace-only rename is ignored and the
  previous title stands.
- **Oracle.** Tab label equals `My Stage` after both attempts.
- **Trace.** P3 · automate

#### UI-CRE-016 — An unvisited stage is flagged and blocks the publish confirmation
- **Why it matters.** The product will not let you publish a stage you never looked at,
  and it says so with an icon rather than a toast — easy to miss in automation.
- **Setup.** A two-stage project where only the first tab has been opened.
- **Steps.** Press Publish and read the confirm modal.
- **Expected.** The unvisited tab shows the eye-off icon with "Stage is not reviewed",
  and the confirm modal's OK is disabled.
- **Oracle.** Confirm-modal OK disabled while the icon is present; enabled after the
  tab is visited.
- **Trace.** P1 · automate

#### UI-CRE-017 — The project title is required to publish
- **Why it matters.** It is the field every downstream case uses to find the event.
- **Setup.** A fully valid project with no title.
- **Steps.** Press Publish.
- **Expected.** Publish is refused and the title field is called out.
- **Oracle.** No redirect; the title input carries the error state.
- **Trace.** P0 · automate · create-screen-contract.md "A title is required"

#### UI-CRE-018 — The title actually sticks before anything else is done
- **Why it matters.** The most infamous mis-fill on this screen: matching the drawer by
  the phrase "Manage Line Items" types the product name into the project **Title**,
  because once a template is picked the main page prints "You can manage the product
  and quantity from the Manage Line Items section".
- **Setup.** A create screen with a template chosen.
- **Steps.** Set the title. Then open the line-items drawer and add a product. Re-read
  the title.
- **Expected.** The title is still what you typed.
- **Oracle.** `expect(titleInput).toHaveValue(title)` **after** line items are added,
  not just after typing; identify the drawer by its own combobox prompt "Search and
  add line items".
- **Trace.** P0 · automate · `createErfx.ts` · erfx-create-screen-contract memory

#### UI-CRE-019 — A long title is accepted or refused, but never silently truncated
- **Why it matters.** PRD §6 calls out very long strings, and a silently truncated
  title breaks every find-by-title oracle downstream.
- **Setup.** A valid project.
- **Steps.** Enter a 255-character title and publish.
- **Expected.** Either it is accepted whole, or it is refused with a stated limit.
  Not quietly cut.
- **Oracle.** Compare the title on the published event's detail page against what was
  typed, character for character.
- **Trace.** P2 · automate · PRD §6

#### UI-CRE-020 — Emoji and non-Latin script in the title survive the round trip
- **Why it matters.** Same requirement, different failure mode — encoding, not length.
- **Setup.** A valid project.
- **Steps.** Title it `Événement 🚀 事件 — RFQ`. Publish. Reopen from the list.
- **Expected.** The title renders identically on the list, the detail page and the
  vendor's invitation.
- **Oracle.** Byte-for-byte equality on the detail page; no mojibake in the list row.
- **Trace.** P2 · automate · PRD §6

#### UI-CRE-021 — A description and attachments ride along unchanged
- **Why it matters.** They are pass-through fields, which is exactly the kind of thing
  that regresses without anyone noticing.
- **Setup.** A valid project.
- **Steps.** Add a description and two attachments. Publish. Reopen.
- **Expected.** Both are on the published event, with the original filenames.
- **Oracle.** Description text matches; attachment count and names match.
- **Trace.** P2 · automate-later

#### UI-CRE-022 — An attachment from another company's storage is refused
- **Why it matters.** It is a cross-tenant data path, and the backend validates every
  attachment URL for company ownership before it writes anything.
- **Setup.** An attachment URL belonging to a different company.
- **Steps.** Attach it (by crafting the request the screen would send) and publish.
- **Expected.** Refused with "You are not allowed to perform this action", nothing
  written.
- **Oracle.** Error code 101; the event stays in draft. Pairs with API-PUB-014.
- **Trace.** P1 · automate-later · `event_groups_controller.rb:77-78`

#### UI-CRE-023 — More than the allowed attachments is refused with a limit message
- **Why it matters.** The cap is server-side (`489`) and the screen should surface it
  as a readable message, not a raw code.
- **Setup.** Enough files to exceed the tenant's attachment cap.
- **Steps.** Attach past the cap.
- **Expected.** A readable "Maximum attachment limit exceeded." message.
- **Oracle.** The message is shown and the extra files are not attached.
- **Trace.** P2 · manual

#### UI-CRE-024 — Leaving the create screen mid-way warns, and abandons nothing published
- **Why it matters.** PRD §7.3 — a half-finished draft must not corrupt or publish
  anything.
- **Setup.** A partially filled create screen.
- **Steps.** Navigate away. Confirm leaving. Search the events list for the title.
- **Expected.** A warning is offered; after leaving, no event with that title exists in
  any status the buyer can see, or it exists strictly as a draft.
- **Oracle.** Zero Live rows for the title; if a draft row exists it is `draft`.
- **Trace.** P1 · automate · PRD §7.3

#### UI-CRE-025 — Reopening a saved draft restores every field
- **Why it matters.** The draft is the product's promise that work is not lost. It is
  also the path that seeds the amendment and add-stage cases.
- **Setup.** A draft saved with title, template, 2 line items, sheet values, schedule
  and participants.
- **Steps.** Leave. Reopen the draft from the events list.
- **Expected.** Every value is as it was, including the sheet cells and the stage set.
- **Oracle.** Field-by-field comparison against what was entered; line-item badge count
  matches.
- **Trace.** P1 · automate-later

#### UI-CRE-026 — A stage added to an already-live event goes through the same gates
- **Why it matters.** Adding a stage post-publish is a different endpoint with its own
  policy, and it is the path buyers use when a technical round has to follow a live RFQ.
- **Setup.** gate: `add_new_stage_config`. A published event.
- **Steps.** From the live event, add a new stage. Fill it. Publish the addition.
- **Expected.** The stage appears on the live event; existing stages and bids are
  untouched.
- **Oracle.** Stage count increases by one; the pre-existing stage's bid count is
  unchanged.
- **Trace.** P1 · automate-later · `add_new_stage_in_live_event`

---

## 3. Templates and the pricing sheet

The template is the schema. It decides which columns exist, which of them the buyer
fills and which are left for vendors, and whether savings validation can even run.
Almost every "weird" failure on this screen traces back to a template that was never
chosen.

A translation rule worth remembering before reading these: the rendered grid and the
template schema **name the same column differently**. The cell's `data-celltype` is
the column key (`buyer_hub`); the template's `input_type` is its kind
(`delivery_location`). Anything that reads columns off the DOM must translate before
deciding how to fill them.

#### UI-TPL-001 — Choosing a template on a fresh stage populates the sheet schema
- **Why it matters.** It is the gate for line items, the sheet, and savings. Nothing
  works before it.
- **Setup.** A fresh eRFX stage, no template.
- **Steps.** Open **Select Templates** and pick one.
- **Expected.** The template name replaces the prompt, and the sheet renders that
  template's columns.
- **Oracle.** The stage carries a template id and name; the grid's header row
  (`sheet-cell-0-*`) matches the template's widget keys.
- **Trace.** P0 · automate · `CreateEventPage.selectFirstTemplateAndExtractWidgets`

#### UI-TPL-002 — The `Items` button is inert until a template exists
- **Why it matters.** This is *the* ordering rule. Clicking Items first is a no-op, and
  the run stalls showing `Items 0` while looking like a broken line-item picker.
- **Setup.** A fresh stage with no template.
- **Steps.** Click the toolbar `Items 0` button.
- **Expected.** Nothing opens (or a tooltip explains a template is needed first).
- **Oracle.** No drawer with the "Search and add line items" combobox appears; after a
  template is chosen the same click opens it.
- **Trace.** P0 · automate · create-screen-contract.md §Ordering.1

#### UI-TPL-003 — Changing a chosen template asks before it discards sheet data
- **Why it matters.** Changing the schema throws away the values entered under the old
  one. Silently is not acceptable.
- **Setup.** A stage with a template and filled sheet cells.
- **Steps.** Pick a different template.
- **Expected.** A confirmation ("Do you really want to change the template?"). On
  confirm, the sheet resets; on cancel, nothing changes.
- **Oracle.** Both branches: after cancel the old values are still there; after confirm
  they are gone and the new columns are present.
- **Trace.** P1 · automate-later

#### UI-TPL-004 — A stage with no template fails publish on savings, not on the template
- **Why it matters.** The error message is actively misleading: the default
  `savingsColumn` is `{budget: "price"}` and validation needs that widget to exist in
  the chosen template, so a missing template reports "Please select a valid column for
  savings". Anyone chasing a savings bug here is chasing the wrong thing.
- **Setup.** A stage with no template, everything else valid.
- **Steps.** Publish.
- **Expected.** Publish is refused. (Today's message is the savings one; the case
  documents the real cause.)
- **Oracle.** Publish blocked; the template control also carries its error styling.
  Assert both, so the day the message improves the test still passes.
- **Trace.** P1 · automate · create-screen-contract.md §Savings

#### UI-TPL-005 — A section-wise-scoring template is refused outside Vendor Assessment
- **Why it matters.** It is a scoring template used where scoring does not exist; the
  product refuses it in words.
- **Setup.** gate: a section-wise-scoring template exists on the tenant.
- **Steps.** Try to select it as a pricing-stage template.
- **Expected.** "Section-wise scoring templates can only be selected in the Vendor
  Assessment section." and the template is not applied.
- **Oracle.** Error message shown; the stage still has no template.
- **Trace.** P2 · automate-later

#### UI-TPL-006 — A template already used by the RFQ is offered but disabled
- **Why it matters.** Reuse across stages produces two stages writing the same schema;
  the product blocks it with a tooltip and the tooltip is the assertion.
- **Setup.** A two-stage project whose RFQ already uses template T.
- **Steps.** On the other stage, open the template picker and hover T.
- **Expected.** T is disabled with "Template used in RFQ has already been selected".
- **Oracle.** Tooltip text matches; clicking it does not apply.
- **Trace.** P3 · automate-later

#### UI-TPL-007 — Template deletion is offered only on an RFP stage that has one
- **Why it matters.** A narrow rule (`!!templateName && isModeRfp`) that is easy to
  break when the control is refactored.
- **Setup.** One RFP stage with a template, one RFQ stage with a template.
- **Steps.** Look for the delete-template control on each.
- **Expected.** Present on the RFP stage only.
- **Oracle.** Control count is 1 on RFP, 0 on RFQ.
- **Trace.** P3 · automate-later

#### UI-TPL-008 — The buyer fills only the creator columns; vendor columns are locked
- **Why it matters.** If a buyer could type a price, the whole event is meaningless.
- **Setup.** A Buy-side pricing template.
- **Steps.** Try to edit every cell in a data row.
- **Expected.** `buyer_hub` (delivery location) and other creator columns accept input;
  `price`, `participant_quantity`, `gst`, `total_amount` are disabled.
- **Oracle.** Those four carry `aria-disabled="true"`; at least one creator column
  accepts a value.
- **Trace.** P0 · automate · create-screen-contract.md §The pricing sheet

#### UI-TPL-009 — Leaving a creator column blank is refused as a partially filled sheet
- **Why it matters.** The specific historical bug: a blank delivery location used to
  make `PATCH /api/event_groups/:id` return a 500. Now it says "Sheet partially filled,
  please check again." This case keeps it that way.
- **Setup.** A pricing stage whose template has a delivery-location column.
- **Steps.** Fill every cell except the delivery location. Publish.
- **Expected.** "Sheet partially filled, please check again." — a message, not a 500.
- **Oracle.** The message appears; no 5xx is observed on the publish request.
- **Trace.** P0 · automate · create-screen-contract.md

#### UI-TPL-010 — Sweeping the rendered grid is required, not just the creator-marked fields
- **Why it matters.** Filling only the columns the template marks `field_type:
  "creator"` is *not* sufficient — the grid can render more that the buyer must fill.
  A test that trusts the schema alone reports a false publish failure.
- **Setup.** A template where the rendered grid has more editable columns than the
  schema marks creator.
- **Steps.** Fill from the schema only, and publish. Then fill by sweeping the rendered
  grid, and publish.
- **Expected.** The second publishes; the first is refused as partially filled.
- **Oracle.** Fill strategy = sweep every non-`aria-disabled` cell in every data row.
- **Trace.** P1 · automate · `CreateEventPage.fillSheet`

#### UI-TPL-011 — Header row is row 0 and must never be filled
- **Why it matters.** `sheet-cell-{row}-{key}` starts at the header. A fill loop that
  begins at 0 types into the column names.
- **Setup.** Any pricing sheet.
- **Steps.** Run the fill routine.
- **Expected.** Column headers still read as column names.
- **Oracle.** Data fills start at row 1; header cells are excluded by
  `:not([data-testid^="sheet-header"])`.
- **Trace.** P1 · automate

#### UI-TPL-012 — Adding a price field adds a column, and an added one cannot be added twice
- **Why it matters.** Duplicate columns break the sheet's own totalling.
- **Setup.** A pricing stage with the Add-price-field menu.
- **Steps.** Add a price field. Reopen the menu.
- **Expected.** The column appears; that field's menu item is now disabled.
- **Oracle.** Column count +1; the item is disabled, not merely absent.
- **Trace.** P2 · automate-later

#### UI-TPL-013 — Freight charges only become available at three or more line items
- **Why it matters.** A count-driven column, and the sort of rule that silently
  inverts.
- **Setup.** A pricing stage with 2 line items.
- **Steps.** Open the price-field menu. Add a third line item. Reopen.
- **Expected.** `freight_charges` absent at 2, present at 3.
- **Oracle.** Menu item presence flips exactly at the third item.
- **Trace.** P3 · automate-later

#### UI-TPL-014 — Product, quantity and variant stay read-only on an eRFX sheet
- **Why it matters.** On eRFX those come from the project's line items, not the sheet.
  If they became editable the sheet and the line items could disagree.
- **Setup.** gate: `rfx_project_enabled`. Any eRFX pricing stage.
- **Steps.** Try to edit the product, creator-quantity and variant cells.
- **Expected.** All three are read-only.
- **Oracle.** Each carries the disabled state; the values equal the line items.
- **Trace.** P1 · automate

#### UI-TPL-015 — A negative price entered by the buyer where it is allowed is refused
- **Why it matters.** PRD §5 — quantities and prices must be positive, and the refusal
  must be polite.
- **Setup.** A sheet column that accepts a number from the buyer (e.g. a budget or
  reference price).
- **Steps.** Enter `-1`. Try to publish.
- **Expected.** A readable validation message; no publish.
- **Oracle.** Message shown, publish blocked, no 500.
- **Trace.** P1 · automate · PRD §5

#### UI-TPL-016 — Text in a numeric sheet cell is rejected, not coerced
- **Why it matters.** Silent coercion turns `"abc"` into `0` and an event goes out with
  a zero budget.
- **Setup.** A numeric sheet column.
- **Steps.** Type `abc`. Move focus away.
- **Expected.** The cell refuses it or clears it and says why. It does not become 0.
- **Oracle.** The cell's value is not `0` and not `abc`; a message is shown.
- **Trace.** P1 · automate · PRD §5

#### UI-TPL-017 — A very large numeric value is handled without precision loss
- **Why it matters.** Prices in some currencies are legitimately large, and float
  rounding shows up first in totals.
- **Setup.** A numeric column and a total column.
- **Steps.** Enter `999999999.99`. Read the computed total.
- **Expected.** The total is arithmetically correct to the displayed precision.
- **Oracle.** Compare the rendered total against the expected product of quantity ×
  price at the template's precision.
- **Trace.** P2 · automate-later

#### UI-TPL-018 — Pasting a block of values into the sheet lands in the right cells
- **Why it matters.** It is how buyers actually fill a 40-row sheet, and paste
  offsetting by one is a classic.
- **Setup.** A sheet with 5 data rows.
- **Steps.** Copy a 5-row column of values and paste into the first data cell.
- **Expected.** Rows 1..5 receive values 1..5 in order; nothing lands in the header.
- **Oracle.** Cell-by-cell comparison of the 5 rows.
- **Trace.** P2 · manual

#### UI-TPL-019 — Clipboard permission denial is reported, not swallowed
- **Why it matters.** The browser can refuse; the product has a message for it and the
  buyer needs to see it rather than a dead paste.
- **Setup.** A context where clipboard read is denied.
- **Steps.** Attempt a paste into the sheet.
- **Expected.** "Clipboard permission denied. Please allow access or paste manually."
- **Oracle.** Message shown.
- **Trace.** P3 · manual

#### UI-TPL-020 — The sheet survives a stage switch and back
- **Why it matters.** On a two-stage project, switching tabs remounts panels. Values
  that do not survive that are lost without a warning.
- **Setup.** A two-stage project with the RFQ sheet filled.
- **Steps.** Switch to the other stage. Switch back.
- **Expected.** Every value is still there.
- **Oracle.** Re-read every filled cell after the round trip.
- **Trace.** P1 · automate

---

## 4. Line items

Line items belong to the **project**, not to a stage — the `Items` button is in the top
toolbar, above the tab strip. They are added once and every stage sees them. This
catches out anyone who assumes per-stage items and adds them twice.

#### UI-LI-001 — The Items button opens the drawer and shows a live count
- **Why it matters.** The badge is the cheapest honest oracle on the whole screen: it
  is the app's own count, not the test's.
- **Setup.** A stage with a template chosen.
- **Steps.** Click `Items N`.
- **Expected.** The Manage Line Items drawer opens; the tag shows the current count.
- **Oracle.** Drawer identified by its own combobox prompt "Search and add line items"
  — never by the text "Manage Line Items", which also matches a page-level container
  once a template is chosen.
- **Trace.** P0 · automate · erfx-create-screen-contract memory

#### UI-LI-002 — Adding one product by search creates one line item
- **Why it matters.** The base case for every event in this catalog.
- **Setup.** Drawer open.
- **Steps.** Type a search term, pick an option, set a quantity, Save.
- **Expected.** One line item; the badge reads 1; the sheet has one data row.
- **Oracle.** Badge = 1 **and** sheet data rows = 1. Options render in a body-level
  portal outside the drawer, so scope the input to the drawer and the options to the
  page.
- **Trace.** P0 · automate · `CreateEventPage.addLineItems`

#### UI-LI-003 — Adding N products creates N line items and N sheet rows
- **Why it matters.** The line-item count is a run parameter (`UI_LINE_ITEMS`), and it
  used to be ignored by every flow but one — the count in the dashboard appeared to do
  nothing.
- **Setup.** `UI_LINE_ITEMS=5`.
- **Steps.** Add 5 distinct products with distinct quantities. Save.
- **Expected.** 5 line items, 5 sheet rows, quantities as entered.
- **Oracle.** Badge = 5, sheet data rows = 5, and each row's quantity matches its
  input — this triple is what proves the parameter is honoured end to end.
- **Trace.** P0 · automate · `master/params.ts`

#### UI-LI-004 — Removing every line item and saving is refused
- **Why it matters.** A zero-item event cannot be bid on. The product says so.
- **Setup.** A project with line items.
- **Steps.** Remove all of them. Save.
- **Expected.** "Please add atleast one item to proceed!" and the drawer stays open.
- **Oracle.** Message shown; drawer still visible; badge unchanged.
- **Trace.** P1 · automate

#### UI-LI-005 — A zero or blank quantity on any row is refused
- **Why it matters.** PRD §5 — quantities must be positive. One bad row must block the
  save, not just itself.
- **Setup.** Three line items.
- **Steps.** Blank the second row's quantity. Save.
- **Expected.** "Please fill valid quantity on every line item"; nothing saved.
- **Oracle.** Message shown; the drawer stays open; the other two rows keep their
  values.
- **Trace.** P1 · automate · PRD §5

#### UI-LI-006 — A negative quantity is refused
- **Why it matters.** Same requirement, and the sign check is separate from the
  presence check.
- **Setup.** Drawer open.
- **Steps.** Enter `-5` as a quantity. Save.
- **Expected.** Refused with a readable message.
- **Oracle.** Message shown; no line item persisted with a negative quantity.
- **Trace.** P1 · automate · PRD §5

#### UI-LI-007 — A fractional quantity is either accepted or refused, consistently
- **Why it matters.** Some units are divisible and some are not; whichever the product
  decides, the sheet, the bid and the award must agree.
- **Setup.** A product whose UOM allows decimals, and one that does not.
- **Steps.** Enter `2.5` for each.
- **Expected.** Consistent behaviour per UOM, with a message when refused.
- **Oracle.** The accepted value survives to the published event and to the vendor's
  bid sheet unchanged.
- **Trace.** P2 · automate-later

#### UI-LI-008 — Saving with no changes closes the drawer and calls nothing
- **Why it matters.** A no-op save that fires an update is how draft events pick up
  spurious versions.
- **Setup.** Drawer open, nothing edited.
- **Steps.** Press Save.
- **Expected.** The drawer closes quietly.
- **Oracle.** No line-item update request is issued.
- **Trace.** P2 · automate-later

#### UI-LI-009 — The drawer is read-only when the project came from a PR
- **Why it matters.** The PR owns the items; editing them in the event would desync the
  requisition.
- **Setup.** gate: PR→event path. A project created from a PR.
- **Steps.** Open the drawer.
- **Expected.** Add and remove are inert; the item list is fixed.
- **Oracle.** Add/remove controls disabled.
- **Trace.** P1 · automate-later

#### UI-LI-010 — Quantity stays editable in that read-only drawer
- **Why it matters.** The one deliberate exception (`quantityChangeEnabled = fromPR`),
  and it is the kind of exception a refactor removes.
- **Setup.** Same as UI-LI-009.
- **Steps.** Edit a quantity in the disabled drawer. Save.
- **Expected.** The quantity change is accepted.
- **Oracle.** The new quantity persists to the published event and reconciles back to
  the PR.
- **Trace.** P1 · automate-later

#### UI-LI-011 — The drawer is read-only while editing a draft that forbids edits
- **Why it matters.** `disableProjectEditInDraft` and `isAddNewStage` reach the same
  read-only state by different routes; both need cover.
- **Setup.** gate: `disableProjectEditInDraft`, or an add-new-stage flow.
- **Steps.** Open the drawer in each situation.
- **Expected.** Read-only in both.
- **Oracle.** Add/remove disabled in both entry paths.
- **Trace.** P2 · automate-later

#### UI-LI-012 — Non-BOQ line items are capped at 65
- **Why it matters.** A real boundary with a real message, and it is configurable per
  tenant with a 65 fallback.
- **Setup.** A non-BOQ project.
- **Steps.** Add 65 items and publish. Then try a 66th.
- **Expected.** 65 publishes cleanly; the 66th triggers "Maximum no of product addition
  reached".
- **Oracle.** Publish succeeds at 65; the message appears at 66 and no 66th row is
  created.
- **Trace.** P1 · automate-later · PRD §6

#### UI-LI-013 — BOQ line items are capped at 500
- **Why it matters.** The other side of the same config, and the PRD explicitly calls
  out "a BOQ sheet with hundreds of line items".
- **Setup.** gate: `boq_in_erfx_allowed`. A BOQ project.
- **Steps.** Load 500 items and publish. Then try 501.
- **Expected.** 500 publishes; 501 is refused with the max-line-items error.
- **Oracle.** Publish succeeds at 500, refused at 501. Watch the publish duration too —
  see UI-NFR-004.
- **Trace.** P1 · automate-later · PRD §6

#### UI-LI-014 — A basket auction is exempt from the line-item cap
- **Why it matters.** The exemption is deliberate (`!isBasketAuction`) and inverting it
  would break basket auctions everywhere.
- **Setup.** gate: `isBasketAuction`.
- **Steps.** Exceed the normal cap on a basket-auction stage.
- **Expected.** No max-line-items error.
- **Oracle.** No message; publish proceeds.
- **Trace.** P2 · automate-later

#### UI-LI-015 — Missing tenant config falls back to 500 / 65
- **Why it matters.** A tenant with no limit config must not end up with a limit of
  zero or infinity.
- **Setup.** A tenant with no line-item-limit config.
- **Steps.** Read the effective limits.
- **Expected.** `{boq: 500, nonBoq: 65}`.
- **Oracle.** The selector returns those defaults.
- **Trace.** P2 · automate

#### UI-LI-016 — The same product twice is either merged or refused, never duplicated silently
- **Why it matters.** PRD §6 lists duplicates as an edge case, and two identical rows
  make the award ambiguous.
- **Setup.** Drawer open.
- **Steps.** Add product P. Add product P again.
- **Expected.** Either it is refused as a duplicate, or the quantities merge — and the
  behaviour is stated on screen.
- **Oracle.** Row count and quantity reflect exactly one of those two outcomes; not two
  independent rows with the same product and no notice.
- **Trace.** P2 · automate-later · PRD §6

#### UI-LI-017 — Deleting a line item after publish is refused when it is the last active one
- **Why it matters.** The backend refuses with "You cannot delete this line item from
  the project" (711); the UI must surface that rather than appear to succeed.
- **Setup.** A published event with one active line item.
- **Steps.** Try to delete it.
- **Expected.** Refused with that message; the item remains.
- **Oracle.** Message shown; the item is still listed after a reload.
- **Trace.** P1 · automate-later · `update_service.rb:134-141`

#### UI-LI-018 — Deleting a line item that a proposal already references is refused
- **Why it matters.** It would orphan an award in progress.
- **Setup.** A published event with a draft/requested proposal against a line item.
- **Steps.** Try to delete that line item.
- **Expected.** Refused (711); the proposal is untouched.
- **Oracle.** Message shown; the proposal still lists the line item.
- **Trace.** P1 · automate-later

---

## 5. The technical (RFP) stage

A technical stage is a questionnaire, not a price sheet. It has one RFI section per
line item plus a global "Vendor Assessment" section, and its evaluator placement
depends on a tenant setting. The trap: **missing per-item templates do not block
publish**, so events go out with empty item questionnaires and nobody notices.

#### UI-TECH-001 — A technical-only project publishes with assessment and evaluators
- **Why it matters.** The RFP-only shape is a real event type (pre-qualification) and
  the shortest path through the questionnaire machinery.
- **Setup.** gate: `rfx_project_enabled`. An evaluator user exists.
- **Steps.** Compose RFP-only. Title. Template. One line item. Fill Vendor Assessment.
  Add an evaluator. Save Schedule. Invite. Publish.
- **Expected.** Publishes with no vendor-section or evaluator errors.
- **Oracle.** Redirect to a real project id; assert the evaluator count assigned was
  greater than zero before publish.
- **Trace.** P0 · automate · flow `events.rfp_only`

#### UI-TECH-002 — An empty Vendor Assessment blocks publish
- **Why it matters.** The refusal message is generic — "There are some errors in vendor
  specific sections, please check and try again" — and points at no field, so this case
  is the only place the cause is written down.
- **Setup.** An RFP stage with everything except Vendor Assessment.
- **Steps.** Publish.
- **Expected.** Refused with that message.
- **Oracle.** Message shown; no redirect. Cause: `isGlobalSectionEmpty`.
- **Trace.** P0 · automate · create-screen-contract.md §Technical stages

#### UI-TECH-003 — The Vendor Assessment template picker is found by class, not by text
- **Why it matters.** The section has two dropdown triggers — template and evaluator —
  and the text "Select Template" becomes the template's name once chosen. Matching on
  text picks the wrong control roughly half the time.
- **Setup.** An RFP stage.
- **Steps.** Open the Vendor Assessment template picker and choose a template.
- **Expected.** The template is applied to the global section only.
- **Oracle.** Locate via `div[class*=templateName].ant-dropdown-trigger` inside
  `div[class*=rfiSectionWrapper]`; assert the evaluator picker is unchanged.
- **Trace.** P1 · automate · `CreateEventPage.fillVendorAssessment`

#### UI-TECH-004 — A question row with a description but no question is refused
- **Why it matters.** It is the one malformed row the validator catches, and it is easy
  to create by tabbing through the grid.
- **Setup.** A Vendor Assessment grid.
- **Steps.** Fill a row's description, leave its question empty. Publish.
- **Expected.** Refused with the vendor-specific-sections message.
- **Oracle.** Publish blocked; filling the question clears it.
- **Trace.** P1 · automate

#### UI-TECH-005 — The trailing blank row is legal
- **Why it matters.** Every grid carries one, and a validator that flagged it would
  make the screen unpublishable. A test that "cleans up" that row hides a real bug.
- **Setup.** A Vendor Assessment grid with content plus its trailing blank row.
- **Steps.** Publish without touching the blank row.
- **Expected.** Publishes.
- **Oracle.** Publish succeeds with the blank row present.
- **Trace.** P1 · automate · create-screen-contract.md

#### UI-TECH-006 — Question cells are the specification column
- **Why it matters.** Automation needs to find the question cell, and it is identified
  by cell type rather than by its visible label.
- **Setup.** A Vendor Assessment grid.
- **Steps.** Enter a question.
- **Expected.** It lands in the Specification column.
- **Oracle.** Fill `[data-celltype="rfi_question"]`.
- **Trace.** P2 · automate

#### UI-TECH-007 — Per-line-item sections each get their own item template
- **Why it matters.** Each line item has its own questionnaire, and the buyer's intent
  is per-item questions.
- **Setup.** An RFP stage with 2 line items.
- **Steps.** Set an Item Template on each section.
- **Expected.** Both sections show their template name and their questions.
- **Oracle.** Two item-template triggers, both non-default after the step.
- **Trace.** P1 · automate-later

#### UI-TECH-008 — Missing per-item templates do not block publish — and that is a finding
- **Why it matters.** The product lets an event go out with empty item questionnaires.
  This case exists to *record* that, so the day it changes the suite notices, and so a
  reviewer sees it stated rather than discovering it in production.
- **Setup.** An RFP stage with Vendor Assessment filled and no item templates.
- **Steps.** Publish.
- **Expected (today).** Publish succeeds. Log a finding: vendors receive empty item
  questionnaires with no warning.
- **Oracle.** Publish succeeds **and** the finding is recorded. Do not assert a
  failure — assert the state and report it.
- **Trace.** P1 · automate · create-screen-contract.md §Technical stages

#### UI-TECH-009 — On a lot-mode tenant there is one section-level evaluator control
- **Why it matters.** `rfpEvaluationOn: lot` versus `line` changes how many controls
  exist. Assuming one shape breaks the other tenant.
- **Setup.** gate: `rfpEvaluationOn = lot`.
- **Steps.** Count the evaluator-add controls.
- **Expected.** Exactly one, on Vendor Assessment.
- **Oracle.** Read the count from the DOM rather than assuming it — one per item in
  `line` mode, one overall in `lot` mode.
- **Trace.** P1 · automate

#### UI-TECH-010 — On a line-mode tenant there is one evaluator control per line item
- **Why it matters.** The other half of UI-TECH-009.
- **Setup.** gate: `rfpEvaluationOn = line`. Two line items.
- **Steps.** Count the evaluator-add controls.
- **Expected.** Two.
- **Oracle.** Control count equals line-item count.
- **Trace.** P2 · automate-later

#### UI-TECH-011 — The evaluator picker's first row is its own search box
- **Why it matters.** Picking "the first option" picks the search field and assigns
  nobody, and the rows arrive a beat after the panel becomes visible.
- **Setup.** An open evaluator picker.
- **Steps.** Open the picker, wait for rows, select a real evaluator.
- **Expected.** That evaluator is assigned.
- **Oracle.** Skip the first (empty) option; assert the assigned name is non-empty.
- **Trace.** P1 · automate · create-screen-contract.md

#### UI-TECH-012 — Publishing with no evaluator is refused
- **Why it matters.** An RFP with nobody to score it cannot be evaluated, and the
  automation asserts an assignment count greater than zero for exactly this reason.
- **Setup.** An RFP stage with Vendor Assessment filled and no evaluator.
- **Steps.** Publish.
- **Expected.** Refused, with the evaluator called out.
- **Oracle.** Publish blocked; `isEvaluatorNotPresent` state visible.
- **Trace.** P1 · automate

#### UI-TECH-013 — Two evaluators on one section are both retained
- **Why it matters.** Multi-evaluator scoring is a normal setup and the second
  assignment is where the picker's state handling shows.
- **Setup.** An RFP stage.
- **Steps.** Assign evaluator A, then evaluator B.
- **Expected.** Both are listed.
- **Oracle.** Two names on the section after a reload.
- **Trace.** P2 · automate-later

#### UI-TECH-014 — An evaluator can be removed before publish
- **Why it matters.** Removal paths are usually built after the add path and less well.
- **Setup.** An RFP stage with two evaluators.
- **Steps.** Remove one.
- **Expected.** One remains and publish still succeeds.
- **Oracle.** One name; publish succeeds.
- **Trace.** P3 · automate-later

#### UI-TECH-015 — Evaluators can only be changed during evaluation time
- **Why it matters.** The backend refuses outside that window with "You can update
  evaluators only in evaluation time." (741) and the UI must not offer a dead control.
- **Setup.** A published RFP stage that is *not* in extra-closing/evaluation time.
- **Steps.** Try to change the evaluator.
- **Expected.** Either the control is unavailable, or the attempt is refused with that
  message.
- **Oracle.** No silent success: after a reload the evaluator is unchanged.
- **Trace.** P1 · automate-later · `update_egli`

#### UI-TECH-016 — RFP's bid window may not outlast the RFQ's
- **Why it matters.** Publishing both stages with an RFP that ends after the RFQ is
  refused server-side with "RFP duration exceeds RFQ end time. Please adjust." (712).
  The screen should stop it before the round trip.
- **Setup.** A two-stage RFP + RFQ project.
- **Steps.** Schedule the RFP to end after the RFQ ends. Publish.
- **Expected.** Refused with that message (client-side ideally, server-side acceptably).
- **Oracle.** Publish blocked and the message readable — not a bare 422 code.
- **Trace.** P0 · automate · `update_service.rb:191,262-273`

#### UI-TECH-017 — A vendor sees the technical questionnaire before the price sheet
- **Why it matters.** It is the sequencing promise of a two-stage event; if the price
  sheet opens first the technical round is pointless.
- **Setup.** A published RFP + RFQ event with an invited vendor.
- **Steps.** As the vendor, open the event.
- **Expected.** The technical stage is the one open for response; pricing is not yet
  fillable.
- **Oracle.** From the vendor's view: technical form editable, price cells not.
- **Trace.** P1 · automate-later

#### UI-TECH-018 — An evaluator scores a submitted technical response
- **Why it matters.** It closes the RFP loop, and the score feeds the awarding grid.
- **Setup.** gate: evaluation enabled. A submitted vendor technical response, and the
  stage in evaluation time.
- **Steps.** Sign in as the evaluator. Open the response. Score each question. Submit.
- **Expected.** The score is saved and visible to the buyer on the comparison.
- **Oracle.** The buyer's Master QCS shows a non-empty evaluation score for that vendor.
- **Trace.** P1 · automate-later · PRD §2

---

## 6. Auction configuration

`AUCTION_STRATEGY` is `{rank, price, traffic_light, knockout, dutch, book_building,
alternate_bidding}`, and each strategy changes what the vendor sees while bidding.
Two of them — **Knockout and Dutch — are not reachable from a fresh create screen at
all**; they are gated off unless the project is converting an existing RFQ
(`isRfqToAuction`). Any case below that names them therefore starts from §11's
conversion, and a test that expects to find them on a blank create screen is testing a
path that does not exist.

#### UI-AUC-001 — Rank-based is the default and needs no configuration
- **Why it matters.** It is what a buyer gets by pressing publish, so it must be right
  with zero input.
- **Setup.** gate: `rfx_project_enabled`. Default Auction stage.
- **Steps.** Publish without opening the strategy picker.
- **Expected.** Published as `strategy=rank`, indicator `rank`.
- **Oracle.** The live event's strategy reads Rank; the vendor's view shows rank, not
  price.
- **Trace.** P0 · automate · flow `events.auction_rank`

#### UI-AUC-002 — Price-based auction publishes and shows best price
- **Why it matters.** The second-most-used strategy, and its indicator differs
  (`best_price`).
- **Setup.** An Auction stage.
- **Steps.** Choose Price Based. Publish.
- **Expected.** `strategy=price`; the auction indicator is best price.
- **Oracle.** Strategy on the live event = `price`; the vendor sees a price indicator.
- **Trace.** P1 · automate

#### UI-AUC-003 — Traffic Light with a price range publishes
- **Why it matters.** Traffic light has two range types and they validate differently.
- **Setup.** An Auction stage; buy-side order.
- **Steps.** Choose Traffic Light, range type Price, lower ≤ upper. Publish.
- **Expected.** Accepted; colours derive from the price range.
- **Oracle.** Strategy = `traffic_light`, range type `price`, bounds as entered.
- **Trace.** P1 · automate-later

#### UI-AUC-004 — Traffic Light with a rank range publishes
- **Why it matters.** The other range type, with integer bounds.
- **Setup.** An Auction stage.
- **Steps.** Choose Traffic Light, range type Rank, lower ≤ upper. Publish.
- **Expected.** Accepted.
- **Oracle.** Range type `rank`; bounds as entered.
- **Trace.** P2 · automate-later

#### UI-AUC-005 — Traffic Light with lower above upper is refused
- **Why it matters.** An inverted range makes the colour bands undefined.
- **Setup.** Traffic Light selected.
- **Steps.** Enter lower > upper. Publish.
- **Expected.** Refused with a readable message.
- **Oracle.** Publish blocked; message names the range.
- **Trace.** P1 · automate-later

#### UI-AUC-006 — Traffic Light colours render for a vendor as configured
- **Why it matters.** The colour *is* the feedback the strategy exists to give.
- **Setup.** A live traffic-light auction with a configured range.
- **Steps.** As a vendor, place a bid inside the green band, then inside the red band.
- **Expected.** The indicator shows green, then red.
- **Oracle.** The vendor's indicator colour matches the band the bid falls in.
- **Trace.** P2 · manual

#### UI-AUC-007 — Knockout is not selectable on a fresh create screen
- **Why it matters.** This is the gate. Asserting the absence is what stops someone
  "fixing" a test by force-clicking a disabled tab.
- **Setup.** A fresh eRFX Auction stage (no `isRfqToAuction`).
- **Steps.** Open the strategy tabs.
- **Expected.** Knockout is present but disabled.
- **Oracle.** The Knockout option exists and is disabled.
- **Trace.** P1 · automate

#### UI-AUC-008 — Knockout becomes selectable during an RFQ→Auction conversion
- **Why it matters.** It is the only route to the strategy, and it therefore depends on
  §11 working.
- **Setup.** A published RFQ; convert it (see UI-CONV-001).
- **Steps.** On the conversion create screen, choose Knockout. Publish.
- **Expected.** Selectable and publishes.
- **Oracle.** Strategy = `knockout` on the resulting auction; the parent RFQ is linked.
- **Trace.** P1 · automate-later

#### UI-AUC-009 — Knockout combined with a basket auction is refused
- **Why it matters.** The backend forbids the combination outright (474, "Sorry, trade
  with this configuration is not allowed"); the screen should not let a buyer build it.
- **Setup.** Conversion screen with Knockout and basket auction both available.
- **Steps.** Select both. Publish.
- **Expected.** Refused with a readable configuration message.
- **Oracle.** Publish blocked; no auction stage created.
- **Trace.** P1 · automate-later · `trade_controller.rb` knockout/dutch + basket guard

#### UI-AUC-010 — A knockout offer can be accepted by a vendor
- **Why it matters.** Knockout's whole mechanic is the automated offer, and acceptance
  is its own endpoint.
- **Setup.** A live knockout auction with a vendor holding an offer.
- **Steps.** As the vendor, accept the offer.
- **Expected.** Accepted once; the round advances.
- **Oracle.** The vendor's state moves to accepted; the buyer sees the acceptance.
- **Trace.** P1 · automate-later

#### UI-AUC-011 — Accepting the same knockout offer twice is harmless
- **Why it matters.** Double submission on a slow connection must not double-book the
  round.
- **Setup.** As UI-AUC-010.
- **Steps.** Accept, then accept again (double-click / retry).
- **Expected.** The second attempt changes nothing and does not error unpleasantly.
- **Oracle.** One acceptance recorded; no 500.
- **Trace.** P1 · automate-later

#### UI-AUC-012 — A Dutch auction on a buy order needs end price above base
- **Why it matters.** The price direction is the whole point of Dutch, and it inverts
  between buy and sell.
- **Setup.** Conversion screen, buy order, Dutch selected.
- **Steps.** Set base price and an end price above it. Publish.
- **Expected.** Accepted.
- **Oracle.** `basePrice <= endPrice` honoured on the published auction.
- **Trace.** P1 · automate-later

#### UI-AUC-013 — A Dutch auction on a sell order needs end price below base
- **Why it matters.** The mirror; getting it backwards makes the clock run the wrong
  way.
- **Setup.** Conversion screen, sell order, Dutch selected.
- **Steps.** Set base price and an end price below it. Publish.
- **Expected.** Accepted.
- **Oracle.** `basePrice >= endPrice` honoured.
- **Trace.** P1 · automate-later

#### UI-AUC-014 — A Dutch price direction that contradicts the order type is refused
- **Why it matters.** It is the negative of the two cases above and the only one a
  buyer will actually hit by accident.
- **Setup.** Buy order, Dutch.
- **Steps.** Set an end price below the base price. Publish.
- **Expected.** Refused with a message naming the prices.
- **Oracle.** Publish blocked.
- **Trace.** P1 · automate-later

#### UI-AUC-015 — Dutch single-vendor and multi-vendor modes both publish
- **Why it matters.** `DUTCH_OPTIONS_TYPES` has both, and the award shape differs.
- **Setup.** Conversion screen, Dutch.
- **Steps.** Publish once as single-vendor, once as multi-vendor.
- **Expected.** Both accepted; the closing mode reflects the choice.
- **Oracle.** `dutchClosingOn` equals `single` / `multiple` respectively.
- **Trace.** P2 · automate-later

#### UI-AUC-016 — Dutch offers can be based on base price or on total amount
- **Why it matters.** The two option types compute a vendor's offer differently.
- **Setup.** Conversion screen, Dutch.
- **Steps.** Publish with each `offersOn` setting.
- **Expected.** Both accepted; the vendor's offer screen reflects the basis.
- **Oracle.** `offersOn` = `base_price` / `total_amount`.
- **Trace.** P2 · automate-later

#### UI-AUC-017 — A Dutch offer accepted without a quantity is refused
- **Why it matters.** Acceptance carries a quantity, and the backend has a dedicated
  error for the missing case (249, "Quantity Missing").
- **Setup.** A live Dutch auction with an open offer.
- **Steps.** As the vendor, accept without entering a quantity.
- **Expected.** Refused with a quantity message.
- **Oracle.** Message shown; no acceptance recorded.
- **Trace.** P1 · automate-later

#### UI-AUC-018 — A Dutch acceptance below the minimum quantity is refused
- **Why it matters.** The floor exists so partial acceptances stay useful (246).
- **Setup.** A Dutch auction with a minimum quantity.
- **Steps.** Accept with less than the minimum.
- **Expected.** "Quantity is less than minimum quantity".
- **Oracle.** Message shown; nothing recorded.
- **Trace.** P2 · automate-later

#### UI-AUC-019 — A Dutch acceptance with zero or negative quantity is refused
- **Why it matters.** The sign check is separate from the minimum check.
- **Setup.** As above.
- **Steps.** Accept with `0`, then `-1`.
- **Expected.** Both refused.
- **Oracle.** No acceptance in either case; readable messages.
- **Trace.** P2 · automate-later

#### UI-AUC-020 — Basket auction publishes as one event over many products
- **Why it matters.** It is a distinct event type with its own closing semantics.
- **Setup.** gate: `isBasketAuction`.
- **Steps.** Build a multi-product auction as a basket. Publish.
- **Expected.** Publishes; closing mode is not sent per line item; savings are forced to
  line-item.
- **Oracle.** `closingOn` absent from the payload; the savings control is fixed to
  line-item.
- **Trace.** P1 · automate-later

#### UI-AUC-021 — Basket auction fixes savings to line-item with an explanation
- **Why it matters.** The gross-total option is disabled *with a tooltip*, and the
  tooltip is the buyer's only explanation.
- **Setup.** gate: `isBasketAuction`.
- **Steps.** Open the savings strategy control.
- **Expected.** Gross total disabled, tooltip "For basket auction, savings can only be
  on line item."
- **Oracle.** Tooltip text matches; line-item is selected.
- **Trace.** P2 · automate-later

#### UI-AUC-022 — Book building publishes where the tenant allows it
- **Why it matters.** It is in the strategy enum and gated; an ungated appearance is
  itself a bug.
- **Setup.** gate: book-building enabled.
- **Steps.** Select Book Building. Publish.
- **Expected.** Publishes with that strategy.
- **Oracle.** Strategy = `book_building`.
- **Trace.** P2 · automate-later

#### UI-AUC-023 — Book building is absent where the tenant does not allow it
- **Why it matters.** The negative of UI-AUC-022; gating cases are only worth something
  in pairs.
- **Setup.** A tenant without book building.
- **Steps.** Open the strategy tabs.
- **Expected.** No Book Building option.
- **Oracle.** Option count for that strategy is 0.
- **Trace.** P2 · automate-later

#### UI-AUC-024 — Awarding mode: the whole lot to one vendor
- **Why it matters.** It constrains the award screen later; picking it here is what
  makes UI-AWD-004 meaningful.
- **Setup.** Any auction or RFQ.
- **Steps.** In the configuration drawer choose "award the entire lot to a single
  vendor". Publish.
- **Expected.** Published lot-based; the awarding grid later allows one winner.
- **Oracle.** Closing/awarding mode = lot on the live event.
- **Trace.** P1 · automate · `SingleStagePage.configure({awarding: "lot"})`

#### UI-AUC-025 — Awarding mode: partial award across multiple vendors
- **Why it matters.** Line-item awarding is what most real events use, and it changes
  the allocation grid.
- **Setup.** An event with 2+ line items.
- **Steps.** Choose "partially award … multiple vendors". Publish.
- **Expected.** Published line-item based.
- **Oracle.** Awarding mode = line_item; the award grid offers per-line allocation.
- **Trace.** P1 · automate

#### UI-AUC-026 — Switching closing mode from line-item to lot on a multi-product trade is refused
- **Why it matters.** The backend refuses it during conversion (503, "You cannot award
  entire lot when RFQ was done for partial lot."), and the reason is genuinely subtle.
- **Setup.** A multi-product RFQ run as partial-lot; convert to auction.
- **Steps.** On the conversion screen switch closing mode to lot. Publish.
- **Expected.** Refused with that message.
- **Oracle.** Publish blocked; the RFQ is unchanged.
- **Trace.** P1 · automate-later

#### UI-AUC-027 — Extra closing time extends the auction as configured
- **Why it matters.** It is the mechanism that stops an auction ending mid-flurry, and
  it is a separate schedule row.
- **Setup.** An auction with extra closing time set.
- **Steps.** Publish. Let the main window end. Observe the event state.
- **Expected.** The event enters extra closing time rather than closing outright.
- **Oracle.** State shows extra closing; bidding remains possible for the configured
  period.
- **Trace.** P1 · manual

#### UI-AUC-028 — Dynamic closing time triggers on a late bid
- **Why it matters.** "Last-minute bid extends the clock" is the rule vendors game, so
  it must behave exactly as configured (`price_based` / `rank_based`).
- **Setup.** gate: dynamic closing enabled, with a trigger window.
- **Steps.** Place a qualifying bid inside the trigger window.
- **Expected.** The end time moves out by the configured amount.
- **Oracle.** End time after the bid minus end time before = the configured extension.
- **Trace.** P1 · manual

#### UI-AUC-029 — A sealed-bid auction hides rank and price until it opens
- **Why it matters.** It is the whole promise of a sealed bid, and it is a config on the
  stage (`is_sealbid_allowed` / `is_sealbid_enabled`).
- **Setup.** gate: sealbid allowed. A live sealed-bid auction with two bids.
- **Steps.** As each vendor, look at the indicators.
- **Expected.** No rank, no competitor price, until the seal opens.
- **Oracle.** The vendor's own bid is visible; every competitor indicator is masked.
- **Trace.** P0 · manual · PRD §7.2

#### UI-AUC-030 — Sealbid enabling is refused when the tenant does not allow it
- **Why it matters.** `sealbid_enabled=` only takes effect if `sealbid_allowed` — a
  silent no-op would leave a buyer believing bids are sealed when they are not. That is
  the worst possible failure in this section.
- **Setup.** A tenant with sealbid *not* allowed.
- **Steps.** Try to turn sealed bidding on.
- **Expected.** The control is absent or refuses. It must never appear on and be off.
- **Oracle.** After a reload the setting reads off, and the vendor's view is unsealed —
  assert both, because agreement between them is the point.
- **Trace.** P0 · automate-later · `trade_request_model_helper.rb:1040-1061`

---

## 7. Schedule and the bid window

The single most costly misunderstanding on the create screen: **the footer chip lies.**
It shows a default window like "Now - 02:33 am, 9th Sep (30 Mins)" which reads as
already set, and it is not persisted until **Save Schedule** is pressed inside the
drawer. A stage published without that press has no bidding-time `TradeSchedule` row —
and the backend dereferences that row unguarded while activating.

#### UI-SCH-001 — The schedule drawer opens once a line item exists
- **Why it matters.** The control is disabled until then, with the tooltip "Please
  choose a template and add a product" — which is why this looked like a broken drawer
  for a long time.
- **Setup.** A stage with a template and at least one line item.
- **Steps.** Open the schedule control.
- **Expected.** The drawer opens with start date/time, end/evaluation duration and a
  recurring toggle.
- **Oracle.** Drawer visible with those fields. Before the line item, the control is
  disabled and the tooltip states why.
- **Trace.** P1 · automate · `SingleStagePage.scheduleForLater`

#### UI-SCH-002 — Save Schedule persists the window
- **Why it matters.** It is the difference between an event that publishes and one that
  500s.
- **Setup.** The drawer open with a valid window.
- **Steps.** Press **Save Schedule**. Reopen the drawer.
- **Expected.** The saved window is what the drawer shows on reopen, and the footer chip
  agrees.
- **Oracle.** Reopened drawer values equal what was saved — not the default window.
- **Trace.** P0 · automate · `CreateEventPage.saveSchedule`

#### UI-SCH-003 — Publishing without pressing Save Schedule
- **Why it matters.** This is the guard for the unguarded backend nil dereference. The
  correct product behaviour is a clear refusal or a persisted default — never a 500.
- **Setup.** A stage where the drawer was opened but Save Schedule was never pressed.
- **Steps.** Publish.
- **Expected.** Either publish succeeds having persisted the displayed default, or it is
  refused with a message about the schedule. **Not** an untyped 500.
- **Oracle.** Assert the response is not a bare `{"status":500,...}`; if it is, that is
  the finding. Pairs with API-PUB-002.
- **Trace.** P0 · automate · `trade_controller_helper.rb:4309` · `trade_schedule.rb:139`

#### UI-SCH-004 — A bid window in the future publishes as Upcoming
- **Why it matters.** Scheduling ahead is the normal buyer workflow, and the state name
  drives what a vendor can do.
- **Setup.** A valid event.
- **Steps.** Set start = now + 2 hours. Save Schedule. Publish.
- **Expected.** The event is Upcoming; vendors can see it but cannot bid yet.
- **Oracle.** Buyer sees Upcoming; a vendor attempting to bid is told to wait
  ("Kindly wait for the auction to start").
- **Trace.** P1 · automate-later

#### UI-SCH-005 — A window starting now publishes as Live and is immediately biddable
- **Why it matters.** It is what every bid case in §15 depends on.
- **Setup.** A valid event.
- **Steps.** Set start = now, a 30-minute duration. Save Schedule. Publish.
- **Expected.** Live; the invited vendor can bid at once.
- **Oracle.** Buyer sees Live; the vendor's bid cells are editable.
- **Trace.** P0 · automate · flow `bid.submit`

#### UI-SCH-006 — A window that has already closed at publish time
- **Why it matters.** PRD §6 lists it explicitly. Publishing into the past creates an
  event nobody can bid on, so the product must either refuse it or say plainly that it
  is closed.
- **Setup.** A valid event.
- **Steps.** Set an end time in the past. Save Schedule. Publish.
- **Expected.** Refused with a message, or published in a Closed state that is labelled
  as such — and in the second case a vendor's bid attempt is refused with "Order not
  active", not accepted.
- **Oracle.** Whichever branch: assert no vendor can place a bid afterwards.
- **Trace.** P0 · automate-later · PRD §6

#### UI-SCH-007 — End before start is refused
- **Why it matters.** Nothing downstream can make sense of an inverted window, and the
  DB has no validation to stop it (`trade_schedules` has no Rails validations at all).
- **Setup.** The drawer open.
- **Steps.** Set end earlier than start. Save Schedule.
- **Expected.** Refused with a readable message.
- **Oracle.** The window is not saved; reopening shows the previous values.
- **Trace.** P0 · automate-later

#### UI-SCH-008 — A blank end time cannot be saved
- **Why it matters.** `trade_schedules.end_time` is `NOT NULL` at the database level, so
  a blank one surfaces as a constraint failure — an ugly 500 instead of a message.
- **Setup.** The drawer open.
- **Steps.** Clear the end time. Save Schedule.
- **Expected.** A field-level validation message.
- **Oracle.** Save blocked client-side; no request with a null end time is issued.
- **Trace.** P0 · automate-later · `db/schema.rb` trade_schedules

#### UI-SCH-009 — Evaluation time is configured separately and persists
- **Why it matters.** It is a separate schedule type and it is what makes evaluator
  changes legal later (UI-TECH-015).
- **Setup.** An RFP stage.
- **Steps.** Set an evaluation duration. Save Schedule. Publish.
- **Expected.** The live event shows an evaluation window after the bid window.
- **Oracle.** Evaluation window present and starting at bid end.
- **Trace.** P1 · automate-later

#### UI-SCH-010 — Extending a live event's window works and is visible to vendors
- **Why it matters.** Buyers do it constantly when bids are thin.
- **Setup.** A live event with an invited vendor.
- **Steps.** Extend the end time by 30 minutes.
- **Expected.** The new end time shows for buyer and vendor; bidding continues.
- **Oracle.** The vendor's countdown reflects the new end within a reload.
- **Trace.** P1 · automate-later

#### UI-SCH-011 — Shortening a live window below the current time closes the event cleanly
- **Why it matters.** It is the ad-hoc way buyers stop an event, and it must not leave
  bids in limbo.
- **Setup.** A live event with one submitted bid.
- **Steps.** Set the end time to a minute from now. Wait for it to pass.
- **Expected.** The event closes; the submitted bid remains valid and awardable.
- **Oracle.** State = closed; the bid is still listed and can be allocated in §17.
- **Trace.** P1 · automate-later

#### UI-SCH-012 — A recurring schedule creates the series, not just one event
- **Why it matters.** gate: `scheduled_events_enabled`. A template that never recurs is
  a silent no-op the buyer only notices next week.
- **Setup.** gate: `scheduled_events_enabled`.
- **Steps.** Turn on recurring, set a cadence and an occurrence count. Save Schedule.
  Publish.
- **Expected.** A scheduled template is created and the next occurrence is listed.
- **Oracle.** The template exists with the cadence; occurrence count matches.
- **Trace.** P2 · automate-later

#### UI-SCH-013 — Recurring keys are not persisted onto the event's own config
- **Why it matters.** `is_scheduled_template`, `schedule`, `ends_at` and
  `max_occurrences` are deliberately stripped from a plain update, and a leak would
  make an ordinary event look like a template.
- **Setup.** A published non-recurring event.
- **Steps.** Update its title and re-read the config.
- **Expected.** None of those four keys are on the event config.
- **Oracle.** Those keys absent after the update. Pairs with API-PUB-021.
- **Trace.** P2 · automate-later · `update_service.rb:52,206`

#### UI-SCH-014 — The footer chip agrees with the saved schedule
- **Why it matters.** The chip is what a buyer trusts before pressing Publish. If it
  shows one window and the event gets another, that is a data-integrity bug the buyer
  cannot see.
- **Setup.** A schedule saved with a distinctive window.
- **Steps.** Read the chip. Publish. Read the live event's window.
- **Expected.** All three agree — chip, saved drawer, published event.
- **Oracle.** Compare all three values.
- **Trace.** P1 · automate

#### UI-SCH-015 — The confirm modal's schedule summary matches what will be published
- **Why it matters.** It is the last screen before the commit and the only place the
  whole configuration is summarised.
- **Setup.** A valid event ready to publish.
- **Steps.** Press Publish and read the modal.
- **Expected.** Window, evaluation time and "Vendors invited: N" all match reality.
- **Oracle.** Modal values match the saved schedule and the participant count.
- **Trace.** P1 · automate

#### UI-SCH-016 — Timezone: the window means the same thing to buyer and vendor
- **Why it matters.** A vendor in another timezone reading a different end time is
  indistinguishable from a broken auction.
- **Setup.** A live event; buyer and vendor sessions in different timezones.
- **Steps.** Compare the end time each sees.
- **Expected.** The same instant, each rendered in the viewer's zone.
- **Oracle.** Convert both to UTC and compare.
- **Trace.** P1 · manual

---

## 8. Participants and audience

Publishing needs an audience. On some tenants it auto-populates from the line items
(154 vendors on one client), on others it does not — and when it does not, the confirm
modal quietly says "Vendors invited: 0" and the event goes out unusable.

#### UI-PART-001 — Publish is blocked with no participants
- **Why it matters.** It short-circuits before any per-stage validation, so it also
  masks other errors — worth knowing which message you are looking at.
- **Setup.** A valid project, audience emptied.
- **Steps.** Publish.
- **Expected.** "Please add participants to proceed!"; nothing published.
- **Oracle.** Message shown; no redirect.
- **Trace.** P0 · automate

#### UI-PART-002 — A named vendor can be searched and added
- **Why it matters.** Every vendor-side case needs a *specific* vendor invited, not
  "whoever the audience defaulted to".
- **Setup.** A known test vendor company.
- **Steps.** Search the participant list for its name. Select it.
- **Expected.** It is added and counted.
- **Oracle.** The vendor appears in the selected list; the count includes it.
- **Trace.** P0 · automate · `SingleStagePage.addParticipant`

#### UI-PART-003 — The audience auto-populates where the tenant does that
- **Why it matters.** It is the difference between a 1-vendor and a 154-vendor event,
  which changes pagination in every later participant case.
- **Setup.** A tenant that maps vendors to categories.
- **Steps.** Add a line item and open the participants panel.
- **Expected.** Vendors matching the product's category are pre-selected.
- **Oracle.** Count > 0 without manual selection; the count matches the confirm modal.
- **Trace.** P1 · automate

#### UI-PART-004 — A blacklisted vendor is not pre-selected even when tagged
- **Why it matters.** Blacklisting has to beat convenience, or a barred vendor gets
  invited automatically.
- **Setup.** A blacklisted vendor tagged to the product's category.
- **Steps.** Open the participants panel.
- **Expected.** Not pre-selected.
- **Oracle.** That vendor is absent from the pre-filled set.
- **Trace.** P1 · automate-later

#### UI-PART-005 — At least one participant must be selected to continue
- **Why it matters.** The panel states it inline, and the inline note is a different
  code path from the publish-time toast in UI-PART-001.
- **Setup.** The participants panel with everything deselected.
- **Steps.** Try to continue.
- **Expected.** "Select atleast one participant in order to continue."
- **Oracle.** Note shown; the step does not advance.
- **Trace.** P1 · automate-later

#### UI-PART-006 — Quick-inviting a new vendor by email confirms with that email
- **Why it matters.** It is how buyers add a vendor who is not on the platform yet, and
  the toast repeating the address is the only receipt they get.
- **Setup.** The participants panel.
- **Steps.** Quick-invite `newvendor@example.com`.
- **Expected.** A success toast naming that address; the vendor joins the audience.
- **Oracle.** Toast contains the email; the audience count increases by one.
- **Trace.** P2 · automate-later

#### UI-PART-007 — An invalid email in quick invite is refused
- **Why it matters.** PRD §5 requires valid email format everywhere it is accepted.
- **Setup.** The participants panel.
- **Steps.** Quick-invite `not-an-email`.
- **Expected.** Refused with a format message; no invitation sent.
- **Oracle.** Message shown; audience count unchanged.
- **Trace.** P1 · automate-later · PRD §5

#### UI-PART-008 — 500 participants publish; 501 is refused
- **Why it matters.** The cap is server-side and explicit ("Participants limit
  exceeded. Maximum 500 participants are allowed.") and it is the only place a
  large-audience event fails.
- **Setup.** A tenant with 500+ vendors.
- **Steps.** Publish with 500. Then attempt 501.
- **Expected.** 500 succeeds; 501 is refused with that message.
- **Oracle.** Message on the 501 attempt; the event keeps its 500. Pairs with
  API-AUD-004.
- **Trace.** P1 · manual

#### UI-PART-009 — Publishing twice does not double the audience
- **Why it matters.** `Audience` uniqueness is scoped to `(item, visible, status)`, so a
  repeated publish that created a second active row for one company would break that
  invariant.
- **Setup.** A published event.
- **Steps.** Repeat the publish action (retry / double-submit).
- **Expected.** The audience is unchanged.
- **Oracle.** Participant count identical before and after. Pairs with API-AUD-006.
- **Trace.** P1 · automate-later

#### UI-PART-010 — A vendor removed before any bid disappears cleanly
- **Why it matters.** Pre-bid removal is legal and must actually revoke access.
- **Setup.** A live event with two invited vendors, no bids.
- **Steps.** Remove vendor B.
- **Expected.** B no longer sees the event.
- **Oracle.** As B, the event is not in the portal list and direct access is refused.
- **Trace.** P1 · automate-later

#### UI-PART-011 — A vendor who already participated cannot be removed
- **Why it matters.** The backend refuses ("You cannot remove a vendor who has already
  participated"), and removing a bidder would silently invalidate a bid.
- **Setup.** A live event where vendor B has submitted a bid.
- **Steps.** Try to remove B.
- **Expected.** Refused with that message; B's bid stands.
- **Oracle.** Message shown; the bid is still counted.
- **Trace.** P0 · automate-later

#### UI-PART-012 — Hiding a vendor who holds an active bid is flagged internally
- **Why it matters.** The model emits a Sentry message rather than raising, so nothing
  visible happens — this case is the only way it is ever noticed.
- **Setup.** A vendor with an active bid.
- **Steps.** Set that vendor's audience visibility to no.
- **Expected.** The action is recorded and reported; the bid is not silently orphaned.
- **Oracle.** Check that the vendor's bid is still reachable by the buyer afterwards.
- **Trace.** P2 · manual · `audience.rb:71-90`

#### UI-PART-013 — Adding a vendor to a live auction works where allowed
- **Why it matters.** Late invitations are a real workflow and a separate endpoint with
  its own policy.
- **Setup.** gate: live-auction audience edits allowed. A live auction.
- **Steps.** Add a vendor mid-auction.
- **Expected.** The vendor is invited and can bid within the remaining window.
- **Oracle.** As that vendor, the event is visible and biddable.
- **Trace.** P1 · automate-later

#### UI-PART-014 — Rejecting a participant requires remarks
- **Why it matters.** The remark is the audit trail; the backend refuses without it
  ("Please enter remarks to reject the participant.").
- **Setup.** A live event with a participant.
- **Steps.** Reject them with an empty remark, then with a real one.
- **Expected.** First refused, second accepted.
- **Oracle.** Message on the empty attempt; the vendor shows as rejected after the
  second.
- **Trace.** P1 · automate-later

#### UI-PART-015 — Only a purchaser or the auction team can reject a participant
- **Why it matters.** The check is inline in the controller rather than in the policy,
  which is exactly the kind of check that gets lost in a refactor.
- **Setup.** A buyer who is neither the purchaser nor on the auction team.
- **Steps.** Attempt the rejection.
- **Expected.** Refused ("You are not allowed to perform this action").
- **Oracle.** Refusal; the participant is unchanged.
- **Trace.** P1 · automate-later

#### UI-PART-016 — A vendor self-participates on an open tender
- **Why it matters.** It is the only path where a vendor joins an event nobody invited
  them to, and it needs `open_tenders` on the company.
- **Setup.** gate: `open_tenders`. An active event listed under open events.
- **Steps.** As a vendor, find the open event and participate.
- **Expected.** Joined; the event appears in their Live list.
- **Oracle.** The vendor appears in the buyer's participant list with source
  self-registered.
- **Trace.** P1 · automate-later

#### UI-PART-017 — Self-participation is refused where open tenders are off
- **Why it matters.** The negative half; without it the gate is untested.
- **Setup.** A tenant without `open_tenders`.
- **Steps.** As a vendor, attempt to participate in an event they were not invited to.
- **Expected.** Refused.
- **Oracle.** No audience row created.
- **Trace.** P1 · automate-later

#### UI-PART-018 — "Show under open events" is honoured
- **Why it matters.** It is the flag that decides whether an event is publicly listed at
  all — a wrong default exposes an event to every vendor on the platform.
- **Setup.** Two events, the flag on and off.
- **Steps.** As an uninvited vendor, browse open events.
- **Expected.** Only the flagged event is listed.
- **Oracle.** The unflagged event is absent from the uninvited vendor's view.
- **Trace.** P0 · automate-later · `update_service.rb:254-260`

---

## 9. Savings, terms and conditions

Savings is where a missing template surfaces as a misleading error (see UI-TPL-004),
and where one tenant flag can block every publish. Terms and conditions is a
pass-through structure whose *shape* has broken activation before.

#### UI-SAV-001 — A new stage defaults to budget/price savings on historical price
- **Why it matters.** The defaults decide whether publish works at all, so they are
  worth asserting rather than assuming.
- **Setup.** A fresh stage.
- **Steps.** Open the savings drawer without changing anything.
- **Expected.** `savingsColumn = {budget: "price"}`, reference strategy
  `historical_price`, strategy gross-total (lot).
- **Oracle.** Those three values, read from the drawer.
- **Trace.** P1 · automate

#### UI-SAV-002 — Savings-mandatory tenants block publish without a savings entry
- **Why it matters.** gate: `isSavingsConfigurationMandatory`. On those tenants it is
  the most common publish refusal, and the message is specific.
- **Setup.** gate: `isSavingsConfigurationMandatory`.
- **Steps.** Publish with no savings configured.
- **Expected.** "Savings configuration is mandatory".
- **Oracle.** Message shown; publish blocked.
- **Trace.** P1 · automate-later

#### UI-SAV-003 — An RFQ→Auction conversion bypasses the savings-mandatory check
- **Why it matters.** A deliberate exemption. If it regressed, conversions would become
  impossible on exactly the tenants that use them most.
- **Setup.** gate: `isSavingsConfigurationMandatory` + a conversion in progress.
- **Steps.** Publish the converted auction with no savings entry.
- **Expected.** Publishes; no savings error.
- **Oracle.** No savings message; the auction is created.
- **Trace.** P1 · automate-later

#### UI-SAV-004 — A duplicate custom savings strategy name is refused
- **Why it matters.** Two strategies with one name make the picker ambiguous forever.
- **Setup.** An existing custom strategy named S.
- **Steps.** Create another named S.
- **Expected.** "Savings Strategy Already Present!"
- **Oracle.** Message shown; strategy count unchanged.
- **Trace.** P2 · automate-later

#### UI-SAV-005 — A new custom strategy is created and auto-selected
- **Why it matters.** Auto-selection is the convenience that makes the feature usable;
  without it the buyer thinks the creation failed.
- **Setup.** The savings drawer.
- **Steps.** Create a strategy with a fresh name.
- **Expected.** "New Savings Strategy Created!" and it becomes the current strategy.
- **Oracle.** Toast shown; the picker's value is the new strategy.
- **Trace.** P2 · automate-later

#### UI-SAV-006 — A savings reference price in the wrong currency is refused
- **Why it matters.** Mixed-currency reference prices produce savings numbers that are
  wrong but plausible — the worst kind of wrong.
- **Setup.** A multi-currency tenant, event currency INR.
- **Steps.** Enter a reference price in another currency.
- **Expected.** "Please enter price in INR" (naming the event's currency).
- **Oracle.** Message names the correct currency; the value is not accepted.
- **Trace.** P1 · automate-later

#### UI-SAV-007 — The multi-currency modal refuses zero selected currencies
- **Why it matters.** An event with no currency cannot price anything.
- **Setup.** gate: multi-currency. The currency modal.
- **Steps.** Deselect all and try to proceed.
- **Expected.** "Please select atleast one currency." and the modal stays open.
- **Oracle.** Message shown; modal open.
- **Trace.** P2 · automate-later

#### UI-SAV-008 — Savings computes correctly against the reference
- **Why it matters.** It is the number the buyer reports upward. A sign error or a
  per-unit/total mix-up here is embarrassing and invisible.
- **Setup.** A closed event with a known reference price and one known bid.
- **Steps.** Read the savings on the event.
- **Expected.** Savings = (reference − bid) × quantity, at the configured basis.
- **Oracle.** Compute the expected number from the fixture and compare.
- **Trace.** P1 · automate-later

#### UI-SAV-009 — Line-item savings and gross-total savings agree on the same data
- **Why it matters.** Two bases over one dataset must total the same, or one of them is
  wrong.
- **Setup.** A closed multi-line event.
- **Steps.** Read savings under each basis.
- **Expected.** The sum of the line-item savings equals the gross-total savings.
- **Oracle.** Arithmetic equality within display precision.
- **Trace.** P2 · automate-later

#### UI-SAV-010 — Terms and conditions clauses and attachments publish and persist
- **Why it matters.** It is contractual content; losing it silently is a legal problem,
  not a UI problem.
- **Setup.** A valid event.
- **Steps.** Add two clauses and one attachment. Publish. Reopen.
- **Expected.** Both clauses and the attachment are on the published event and visible
  to the vendor.
- **Oracle.** Clause text and attachment name match on the buyer's and vendor's views.
- **Trace.** P1 · automate-later

#### UI-SAV-011 — An empty terms structure does not break activation
- **Why it matters.** The screen sends `{clauses: [], attachments: [{type: "t_and_c",
  value: []}]}` even when the buyer added nothing, and the rehydration of that shape
  has been a suspect in the activation 500.
- **Setup.** A valid event with no terms touched.
- **Steps.** Publish.
- **Expected.** Publishes normally.
- **Oracle.** No 500; the published event has an empty terms structure, not a null one.
- **Trace.** P1 · automate · `terms_and_conditions.rb`

#### UI-SAV-012 — A malformed terms attachment is refused cleanly
- **Why it matters.** A missing `type` key must produce a readable error, not an
  exception — this is exactly the shape-sensitivity the PRD's §5 "never a 500" clause
  is about.
- **Setup.** A crafted terms attachment without `type`.
- **Steps.** Publish.
- **Expected.** A 4xx with a readable message.
- **Oracle.** Not a 500. Pairs with API-PUB-022.
- **Trace.** P1 · automate-later · PRD §5

#### UI-SAV-013 — A vendor must see the terms before bidding where acceptance is required
- **Why it matters.** If acceptance is configured and not enforced, the buyer believes
  they have consent they do not have.
- **Setup.** gate: terms acceptance required. A published event with clauses.
- **Steps.** As the vendor, open the event and try to bid without accepting.
- **Expected.** Bidding is blocked until the terms are accepted.
- **Oracle.** Submit disabled until acceptance; enabled after.
- **Trace.** P1 · automate-later

#### UI-SAV-014 — Terms edited after publish are versioned, not silently swapped
- **Why it matters.** A vendor who bid against version 1 must not be held to version 2
  without being told.
- **Setup.** A published event with a submitted bid.
- **Steps.** Amend the terms.
- **Expected.** The amendment is recorded as such and vendors are notified.
- **Oracle.** An amendment record exists with remarks; the vendor sees the change.
- **Trace.** P1 · manual

---

## 10. Publish and draft

The commit point. Everything before this section is preparation; everything after it
depends on this having worked and, crucially, on it having worked *completely* — a
publish that redirects but wrote no schedule produces an event that fails much later
in a way nobody connects back here.

#### UI-PUB-001 — A complete single-stage RFQ publishes and lands on the project
- **Why it matters.** It is the reference happy path — the one the whole catalog is
  measured against.
- **Setup.** gate: `rfx_project_enabled`.
- **Steps.** Create eRFX → RFQ-only → title → template → line items → sheet → Save
  Schedule → invite → Publish → confirm.
- **Expected.** Redirect to the published project; the event is Live with the invited
  vendor count on it.
- **Oracle.** Project id in the URL, **excluding** `quick-create|create|detail|new` —
  without that exclusion a rejected publish passes, because the create screen's own URL
  matches `/orders/[^/]+`. Plus: no error toast within 1s.
- **Trace.** P0 · automate · flow `events.rfq_only` · PRD §3.3

#### UI-PUB-002 — Publish must never answer with an untyped 500
- **Why it matters.** The standing regression: from ~16:29 on 2026-09-08, `PATCH
  /api/event_groups/:id` returned a bare `{"status":500,"error":"Internal Server
  Error"}` for both publish and save-as-draft, across every stage type, 0/1/154
  vendors, sheet filled or empty. The user saw a button that did nothing.
- **Setup.** Any valid eRFX event.
- **Steps.** Publish, and watch the network response for the event-group PATCH.
- **Expected.** Either 200, or a `render_error_json` failure with a `{code, message}`.
  This API answers failures that way by convention, so an untyped 500 is by definition
  an unhandled exception.
- **Oracle.** Assert on the *shape*: fail the case if the body is
  `{"status":500,"error":...}` with no code. Capture the request payload with the
  failure — the payload is what makes the report actionable.
- **Trace.** P0 · automate · regression-event-group-update-500.md

#### UI-PUB-003 — Save as draft writes a draft and nothing more
- **Why it matters.** PRD §7.3. A draft must be recoverable and must not be visible as
  a live event to anyone.
- **Setup.** A partially configured project with a title.
- **Steps.** Save as draft. Search the events list for the title.
- **Expected.** One row, status Draft. No vendor can see it.
- **Oracle.** Status is draft; as an invited-vendor-to-be, the event is absent from the
  portal.
- **Trace.** P0 · automate

#### UI-PUB-004 — Save as draft is available before the event is valid
- **Why it matters.** The point of a draft is to save work that is not yet publishable.
  If draft ran the publish validations it would be useless.
- **Setup.** A project with a title only.
- **Steps.** Save as draft.
- **Expected.** Saved, with no validation errors about sheet, schedule or participants.
- **Oracle.** Draft created; no error toast.
- **Trace.** P1 · automate

#### UI-PUB-005 — The confirm modal states the invited vendor count
- **Why it matters.** "Vendors invited: 0" in that modal is the last chance to catch an
  audience that never populated — and it is easy to click straight past.
- **Setup.** An event with a known number of participants.
- **Steps.** Press Publish and read the modal.
- **Expected.** The count matches the participants actually selected.
- **Oracle.** Modal count == participant count; fail if 0 when participants were
  selected.
- **Trace.** P0 · automate · create-screen-contract.md §Ordering.3

#### UI-PUB-006 — Cancelling the confirm modal publishes nothing
- **Why it matters.** A cancel that half-commits is the worst possible outcome at this
  step.
- **Setup.** A valid event.
- **Steps.** Press Publish, then cancel the modal.
- **Expected.** Still on the create screen; no event with that title exists as Live.
- **Oracle.** URL unchanged; zero Live rows for the title.
- **Trace.** P1 · automate

#### UI-PUB-007 — Double-clicking Publish creates one event, not two
- **Why it matters.** A slow publish invites a second click, and two events with one
  title breaks every find-by-title oracle after it.
- **Setup.** A valid event.
- **Steps.** Click Publish twice quickly, confirm.
- **Expected.** One event.
- **Oracle.** Exactly one row for the title in the events list.
- **Trace.** P1 · automate-later

#### UI-PUB-008 — Publishing a two-stage event orders the stages correctly
- **Why it matters.** `STANDARD_STAGES_SEQUENCE` is `{rfp: 1, rfq: 2, auction: 3,
  rfq_then_auction: 4}`, and out-of-order stages would let vendors price before they
  qualify.
- **Setup.** An RFP + RFQ event.
- **Steps.** Publish. Read the stage order on the project.
- **Expected.** RFP first, RFQ second, regardless of the order the tabs were built in.
- **Oracle.** Stage sequence numbers ascend in that order.
- **Trace.** P1 · automate

#### UI-PUB-009 — A stage left out of the publish selection is voided, not published
- **Why it matters.** Only the stages named in the publish request go live; any other
  stage on the event group is voided. A stage that survives as a ghost would accept
  bids nobody expects.
- **Setup.** A project with three draft stages, two selected for publish.
- **Steps.** Publish the two.
- **Expected.** Two live stages; the third is voided and invisible.
- **Oracle.** Stage count on the live event = 2. Pairs with API-PUB-024.
- **Trace.** P1 · automate-later · `update_service.rb:441-443`

#### UI-PUB-010 — Publish is refused for a user without trade create permission
- **Why it matters.** Publishing is the privileged action in this module, and the gate
  is a team-based permission rather than a role name.
- **Setup.** A user in a team without `trade: create_record`.
- **Steps.** Try to reach the create screen and publish.
- **Expected.** Either the entry point is absent or the publish is refused with "You
  are not allowed to perform this action".
- **Oracle.** No event created; a readable refusal.
- **Trace.** P0 · automate-later · `event_group_policy.rb:21-23`

#### UI-PUB-011 — Publish on a superseded version of the event is refused
- **Why it matters.** Two tabs on one draft is a real scenario, and publishing the
  stale one would silently discard the newer work.
- **Setup.** A draft opened in two tabs; publish from tab 1, then from tab 2.
- **Steps.** Publish from the older tab.
- **Expected.** Refused because that version is not the latest.
- **Oracle.** Error code 101 / "not allowed"; the event reflects tab 1's publish only.
- **Trace.** P1 · automate-later · `event_group.latest?`

#### UI-PUB-012 — An approval-required event goes to Requested, not Live
- **Why it matters.** On tenants with publish approvals, "published" means "awaiting
  approval", and a test asserting Live would fail forever on those tenants.
- **Setup.** gate: publish approval configured.
- **Steps.** Publish.
- **Expected.** The stage status is Requested and an approval task exists.
- **Oracle.** Status Requested; the approver sees a pending task.
- **Trace.** P1 · automate-later

#### UI-PUB-013 — Auto-routing to the auction team leaves the stage in Draft
- **Why it matters.** gate: `routeAuctionsToAuctionTeam`. The publish appears not to
  have worked, and this case is where that expectation is written down.
- **Setup.** gate: `routeAuctionsToAuctionTeam`. An auction stage.
- **Steps.** Publish.
- **Expected.** The stage is handed to the auction team and stays Draft for the
  publisher.
- **Oracle.** Status draft plus an auction-team assignment — not an error.
- **Trace.** P1 · automate-later

#### UI-PUB-014 — Publishing sends invitations to every invited vendor
- **Why it matters.** PRD §3.3's audience promise is only real if the invitation lands.
- **Setup.** An event with two invited vendors.
- **Steps.** Publish. Check each vendor's portal list and mailbox.
- **Expected.** Both see the event; both receive an invitation.
- **Oracle.** Portal listing is the automatable half; mail delivery is manual.
- **Trace.** P1 · automate-later (portal) / manual (mail)

#### UI-PUB-015 — The published event carries a reference id
- **Why it matters.** `RFX-…` at project level and per-stage ids are how humans talk
  about events; a missing one makes support impossible.
- **Setup.** A published event.
- **Steps.** Read the ids on the project and each stage.
- **Expected.** A project ref id and a per-stage ref id, both non-empty and unique.
- **Oracle.** Ids present and matching the events-list row.
- **Trace.** P1 · automate

#### UI-PUB-016 — Republishing an already-live event is idempotent
- **Why it matters.** A retry after a timeout must not duplicate stages or audiences.
- **Setup.** A live event.
- **Steps.** Re-issue the publish action.
- **Expected.** Nothing changes.
- **Oracle.** Stage count, audience count and bid count all unchanged. Pairs with
  API-PUB-025.
- **Trace.** P1 · automate-later

#### UI-PUB-017 — Withdrawing a live event requires a remark and closes it to vendors
- **Why it matters.** Withdrawal is the buyer's emergency stop; without the remark
  requirement there is no audit trail.
- **Setup.** A live event with an invited vendor.
- **Steps.** Withdraw with an empty remark, then with a real one.
- **Expected.** First refused; second withdraws the event and the vendor can no longer
  bid.
- **Oracle.** Status withdrawn; as the vendor, bidding is refused ("Order not active").
- **Trace.** P0 · automate-later

#### UI-PUB-018 — A withdrawn event cannot be re-activated
- **Why it matters.** Resurrecting a withdrawn event would reopen bidding vendors were
  told was over.
- **Setup.** A withdrawn event.
- **Steps.** Try to publish/activate it again.
- **Expected.** Refused.
- **Oracle.** Status stays withdrawn. Pairs with API-LC-005.
- **Trace.** P1 · automate-later

#### UI-PUB-019 — Withdrawing twice does not duplicate the remark or the notification
- **Why it matters.** Idempotency on the emergency stop, and vendors receiving two
  withdrawal mails is a support call.
- **Setup.** A withdrawn event.
- **Steps.** Withdraw again.
- **Expected.** No second remark, no second notification.
- **Oracle.** One withdrawal record.
- **Trace.** P2 · automate-later

#### UI-PUB-020 — An active event can be cloned
- **Why it matters.** Cloning is how buyers run the same event monthly, and its policy
  has four separate refusal conditions worth pinning.
- **Setup.** An active event, not created from a PR, buyer not a planner.
- **Steps.** Clone it.
- **Expected.** A new draft with the same line items, template and configuration, and
  its own ref id.
- **Oracle.** New draft exists; line items and template match; the ref id differs.
- **Trace.** P1 · automate-later

#### UI-PUB-021 — Cloning a draft is refused
- **Why it matters.** One of the four refusals, and the least intuitive.
- **Setup.** A draft event.
- **Steps.** Try to clone.
- **Expected.** Refused ("Only active or withdrawn events can be cloned.").
- **Oracle.** Message shown; no clone created.
- **Trace.** P2 · automate-later

#### UI-PUB-022 — Cloning a PR-created event is refused
- **Why it matters.** The clone would have no requisition behind it.
- **Setup.** An event created from a PR.
- **Steps.** Try to clone.
- **Expected.** Refused ("Events with purchase requests cannot be cloned.").
- **Oracle.** Message shown.
- **Trace.** P2 · automate-later

#### UI-PUB-023 — Amending a published event requires amendment remarks
- **Why it matters.** An amendment changes the terms vendors bid against; the remark is
  what they are shown.
- **Setup.** A published event, amendment started.
- **Steps.** Publish the amendment with blank remarks, then with real ones.
- **Expected.** First refused; second published and vendors notified.
- **Oracle.** Amendment recorded with the remark text.
- **Trace.** P1 · automate-later

#### UI-PUB-024 — Changing ownership of an event works for the owner and not for others
- **Why it matters.** It is how an event survives someone leaving, and it is
  permission-sensitive (owner, super-admin or Procol employee only).
- **Setup.** An event, its owner, and an unrelated buyer.
- **Steps.** Change ownership as the owner; then attempt it as the unrelated buyer.
- **Expected.** The first succeeds; the second is refused.
- **Oracle.** New owner reflected; refusal on the second attempt.
- **Trace.** P1 · automate-later

---

## 11. RFQ → Auction conversion

Not a stage composition — a conversion. The create screen refuses to hold an RFQ and an
Auction at once and says so ("Remove Auction to add RFQ"), so a flow that asks for
`stages: ["rfq", "auction"]` can never be satisfied; it quietly publishes a plain
auction on the leftover default tab and calls that a pass. The real journey starts on a
**published** RFQ.

#### UI-CONV-001 — Convert to Auction is offered on a published RFQ
- **Why it matters.** The entry point is behind the event Settings menu and is gated
  three ways: published (not draft), vendor masking off, and the tenant allowing it.
- **Setup.** A published RFQ; vendor masking off.
- **Steps.** Open the event → Settings (`event-settings-button`) → read the menu.
- **Expected.** "Convert to Auction" is listed.
- **Oracle.** The item exists. If Settings opens and simply does not list it, report
  that the feature is gated off on this tenant — not that the automation is wrong.
- **Trace.** P1 · automate · flow `events.rfq_auction`

#### UI-CONV-002 — Conversion opens a prefilled create screen in a new tab
- **Why it matters.** It `window.open`s with `isRfqToAuction=true&draftStageIds=…`; a
  test driving the original tab watches a page that never changes.
- **Steps.** Settings → Convert to Auction → Continue.
- **Expected.** A new tab on the create screen with the conversion query params, the
  RFQ's template and sheet already in place.
- **Oracle.** Handle the new page object; assert `isRfqToAuction=true` in its URL.
- **Trace.** P1 · automate

#### UI-CONV-003 — The converted auction publishes with the RFQ's data
- **Why it matters.** The whole point: carry the RFQ's quotes and participants into an
  auction without re-entering anything.
- **Steps.** On the conversion screen, invite vendors and publish.
- **Expected.** An auction event linked to the RFQ, with the same line items.
- **Oracle.** Redirect to a project id; no error toast; line items match the RFQ's.
- **Trace.** P0 · automate · flow `events.rfq_auction`

#### UI-CONV-004 — The template picker is locked during conversion
- **Why it matters.** Changing the schema would invalidate the carried-over quotes.
- **Setup.** A conversion screen.
- **Steps.** Try to open the template dropdown.
- **Expected.** Disabled.
- **Oracle.** Dropdown disabled.
- **Trace.** P1 · automate-later

#### UI-CONV-005 — "All invited" carries every RFQ participant, not just the bidders
- **Why it matters.** The toggle switches the audience source, and the difference
  decides who can bid in the auction.
- **Setup.** An RFQ where 2 of 5 invited vendors bid.
- **Steps.** Convert with the toggle off, then (on a second conversion) with it on.
- **Expected.** Off: only the 2 bidders carry forward as bidding participants. On: all 5
  carry, with the bidders flagged.
- **Oracle.** Participant counts 2 and 5 respectively; the bid-placed flag set on the
  right ones.
- **Trace.** P1 · automate-later

#### UI-CONV-006 — TNA vendors are included or excluded per the flag
- **Why it matters.** gate: `allowTnaVendorsToBid`. Getting it wrong either bars
  legitimate bidders or admits ones who should not bid.
- **Setup.** An RFQ audience containing TNA vendors.
- **Steps.** Convert with the flag off, then on.
- **Expected.** Excluded when off, included when on.
- **Oracle.** The TNA vendor's presence in the bidding audience flips with the flag.
- **Trace.** P2 · automate-later

#### UI-CONV-007 — Converting the same RFQ twice is refused
- **Why it matters.** The model enforces at most one non-cancelled auction per parent
  RFQ, so the second attempt must be refused rather than creating an orphan.
- **Setup.** An already-converted RFQ.
- **Steps.** Try to convert again.
- **Expected.** Refused ("An auction has already been made for this trade.").
- **Oracle.** Message shown; still exactly one auction child.
- **Trace.** P1 · automate-later · `trade_request.rb:3004-3009`

#### UI-CONV-008 — The RFQ becomes uneditable once its auction exists
- **Why it matters.** The backend refuses RFQ edits after conversion ("You cannot edit
  rfq once the auction is created.", 769) and the UI must not offer them.
- **Setup.** A converted RFQ.
- **Steps.** Try to edit the RFQ's sheet or schedule.
- **Expected.** Refused or unavailable.
- **Oracle.** No successful edit; a readable refusal if attempted.
- **Trace.** P1 · automate-later

#### UI-CONV-009 — Convert to Auction is hidden when vendor masking is on
- **Why it matters.** Masking and conversion are incompatible, and the control's
  visibility is the whole enforcement.
- **Setup.** gate: `isVendorMaskingEnabled`. A published RFQ.
- **Steps.** Open Settings.
- **Expected.** No Convert to Auction item, regardless of the RFQ's state.
- **Oracle.** Item absent.
- **Trace.** P1 · automate-later

#### UI-CONV-010 — Conversion on a draft RFQ is not offered
- **Why it matters.** There are no quotes to carry from a draft, so the control must
  not appear.
- **Setup.** A draft RFQ.
- **Steps.** Open Settings.
- **Expected.** Not offered.
- **Oracle.** Item absent.
- **Trace.** P2 · automate-later

#### UI-CONV-011 — Conversion is refused on a superseded event version
- **Why it matters.** Same staleness problem as UI-PUB-011, on a path that creates a new
  trade record.
- **Setup.** An RFQ whose event group has a newer version.
- **Steps.** Attempt the conversion.
- **Expected.** Refused.
- **Oracle.** No auction created.
- **Trace.** P2 · automate-later

#### UI-CONV-012 — Fast bidding needs more than one line item
- **Why it matters.** The backend refuses with a specific message ("CBD mode requires at
  least two active line items."), which is only meaningful if the UI surfaces it.
- **Setup.** gate: fast bidding. A single-line-item RFQ.
- **Steps.** Convert with fast bidding on.
- **Expected.** Refused with that message.
- **Oracle.** Message shown; no auction created.
- **Trace.** P2 · automate-later

#### UI-CONV-013 — Vendors carried into the auction can bid immediately
- **Why it matters.** The conversion is only useful if the carried audience can act, and
  audience-carry bugs show up here first.
- **Setup.** A converted auction, live.
- **Steps.** As a carried-over vendor, open the auction and bid.
- **Expected.** The bid is accepted.
- **Oracle.** Bid submitted; visible to the buyer on the auction.
- **Trace.** P1 · automate-later

#### UI-CONV-014 — The RFQ's bids remain visible after conversion
- **Why it matters.** The RFQ's history is the baseline the auction's savings are
  measured against.
- **Setup.** A converted RFQ that had bids.
- **Steps.** Open the RFQ stage on the project.
- **Expected.** Its bids are still there, read-only.
- **Oracle.** Bid count on the RFQ unchanged after conversion.
- **Trace.** P1 · automate-later

---

## 12. BOQ events

A bill-of-quantities event carries its line items in a spreadsheet rather than in the
picker, which is why its cap is 500 rather than 65 and why the PRD calls out "a BOQ
sheet with hundreds of line items" as an edge case. It also takes a different creation
path: the draft event group is created on mount with `isBoqBasedRfx: true`.

#### UI-BOQ-001 — A BOQ project creates its draft event group exactly once on mount
- **Why it matters.** A re-render that fires it again produces two draft events and the
  buyer works in one while the other lingers.
- **Setup.** gate: `boq_in_erfx_allowed`.
- **Steps.** Enter BOQ project creation. Let the screen re-render (resize, switch tabs).
- **Expected.** One draft event group.
- **Oracle.** Exactly one create request; one draft in the events list.
- **Trace.** P1 · automate-later

#### UI-BOQ-002 — A BOQ event is accepted with no line items in the create request
- **Why it matters.** It is the one legal way to create an event with an empty
  `line_items` array — the flag is what makes it legal.
- **Setup.** gate: `boq_in_erfx_allowed`.
- **Steps.** Create the BOQ draft before uploading anything.
- **Expected.** Created.
- **Oracle.** Draft created with zero line items. Pairs with API-EG-004.
- **Trace.** P1 · automate-later

#### UI-BOQ-003 — BOQ creation is refused on a tenant that does not allow it
- **Why it matters.** The negative half of the gate; without it the flag is unproven.
- **Setup.** A tenant without `boq_in_erfx_allowed`.
- **Steps.** Attempt BOQ creation.
- **Expected.** Refused ("You are not allowed to perform this action") or the entry
  point absent.
- **Oracle.** No draft created. Pairs with API-EG-005.
- **Trace.** P1 · automate-later

#### UI-BOQ-004 — Downloading the blank BOQ template gives a usable sheet
- **Why it matters.** It is the buyer's starting point; a template whose columns do not
  match the importer is an immediate dead end.
- **Setup.** A BOQ project with a template chosen.
- **Steps.** Download the blank BOQ items sheet.
- **Expected.** A spreadsheet whose columns match the chosen template's schema.
- **Oracle.** Column headers equal the template's widget names.
- **Trace.** P1 · automate-later

#### UI-BOQ-005 — Uploading a filled BOQ sheet creates one line item per row
- **Why it matters.** It is the core BOQ mechanic and the only bulk line-item path.
- **Setup.** A filled sheet with 25 rows.
- **Steps.** Upload it.
- **Expected.** 25 line items, values as in the sheet.
- **Oracle.** Badge = 25; spot-check three rows' product, quantity and unit.
- **Trace.** P0 · automate-later · `UI_BOQ_ITEMS`

#### UI-BOQ-006 — A malformed BOQ row is reported with its row number
- **Why it matters.** "Upload failed" on a 500-row sheet is useless; the row number is
  the whole value of the error.
- **Setup.** A sheet with a bad quantity on row 12.
- **Steps.** Upload.
- **Expected.** A readable error naming row 12; either nothing imports or the good rows
  import and the bad one is listed.
- **Oracle.** The message contains the row identifier; no 500.
- **Trace.** P1 · automate-later · PRD §5

#### UI-BOQ-007 — A BOQ upload with a product that does not exist is refused
- **Why it matters.** The backend answers "Product not found" (80) and the buyer needs
  to know which product.
- **Setup.** A sheet naming an unknown product.
- **Steps.** Upload.
- **Expected.** Refused, naming the offending value.
- **Oracle.** Message identifies the product; no partial import of that row.
- **Trace.** P1 · automate-later

#### UI-BOQ-008 — Re-uploading replaces the previous BOQ items
- **Why it matters.** Appending instead of replacing silently doubles a 500-row event.
- **Setup.** A BOQ event with 25 items.
- **Steps.** Upload a different 25-row sheet.
- **Expected.** 25 items, the new ones; the old ones are removed.
- **Oracle.** Count is 25, not 50; the old products are gone. Pairs with API-LI-007.
- **Trace.** P1 · automate-later

#### UI-BOQ-009 — 500 BOQ items publish
- **Why it matters.** The documented ceiling, and the only case that exercises the
  publish path at scale.
- **Setup.** gate: `boq_in_erfx_allowed`.
- **Steps.** Load 500 items. Publish.
- **Expected.** Publishes.
- **Oracle.** Publish succeeds; record the duration (see UI-NFR-004).
- **Trace.** P1 · manual

#### UI-BOQ-010 — 501 BOQ items are refused
- **Why it matters.** The other side of the boundary.
- **Steps.** Attempt 501.
- **Expected.** Refused with the max-line-items message.
- **Oracle.** Message shown; the event keeps 500.
- **Trace.** P2 · manual

#### UI-BOQ-011 — A vendor bidding on a BOQ event gets all rows in their sheet
- **Why it matters.** A truncated vendor sheet produces a partial bid that looks
  complete.
- **Setup.** A live BOQ event with 25 items and an invited vendor.
- **Steps.** As the vendor, open the bid sheet.
- **Expected.** 25 rows, matching the buyer's items.
- **Oracle.** Row count and the products in each row match.
- **Trace.** P1 · automate-later

#### UI-BOQ-012 — A BOQ event linked to a purchase request validates the PR
- **Why it matters.** `purchase_request_id` must resolve to an active BOQ PR owned by
  the workspace, or the event is attached to nothing.
- **Setup.** A BOQ project and an inactive/foreign PR id.
- **Steps.** Attempt to link it.
- **Expected.** Refused ("not allowed").
- **Oracle.** No link created. Pairs with API-PUB-016.
- **Trace.** P2 · automate-later

---

## 13. PR → event

An event created from a purchase requisition inherits its line items and is not allowed
to change them — only quantities. This is also the only path with a *dormant PR lock*,
which refuses the create outright with its own error shape.

#### UI-PR-001 — An approved PR converts into a draft event
- **Why it matters.** It is the intake-to-sourcing handoff, and everything about the
  resulting event is constrained by it.
- **Setup.** gate: PR module. An approved PR with line items.
- **Steps.** From the PR, create an event.
- **Expected.** A draft event carrying the PR's line items and quantities.
- **Oracle.** Line-item count and products match the PR; the event records the PR link.
- **Trace.** P1 · automate-later

#### UI-PR-002 — PR line items cannot be added to or removed
- **Why it matters.** Diverging from the requisition breaks the consumption
  reconciliation.
- **Setup.** A PR-created draft.
- **Steps.** Open the line-items drawer and try to add and remove.
- **Expected.** Both inert.
- **Oracle.** Controls disabled; count unchanged.
- **Trace.** P1 · automate-later

#### UI-PR-003 — PR quantities can be reduced and reconcile back
- **Why it matters.** Buyers routinely source part of a requisition; the remainder must
  return to the PR.
- **Setup.** A PR line item of 100.
- **Steps.** Reduce to 60 on the event. Publish. Open the PR.
- **Expected.** The PR shows 60 in progress and 40 still open.
- **Oracle.** PR in-progress quantity = 60. `update_quantity_of_purchase_request_items`
  is the mechanism.
- **Trace.** P1 · automate-later

#### UI-PR-004 — A quantity above the PR's is refused
- **Why it matters.** Sourcing more than was requisitioned is an approval bypass.
- **Setup.** A PR line item of 100.
- **Steps.** Set 150 on the event.
- **Expected.** Refused with a readable message.
- **Oracle.** Refusal; the PR is unchanged.
- **Trace.** P1 · automate-later

#### UI-PR-005 — A dormant-locked PR line item blocks creation before anything is written
- **Why it matters.** It has a dedicated error shape (not the generic
  `render_error_json`), and the guard runs before any write — so a partial event must
  never appear.
- **Setup.** A PR whose line item is dormant-locked.
- **Steps.** Try to create an event from it.
- **Expected.** Refused with the dormant-PR message; no draft created.
- **Oracle.** Zero drafts for that PR afterwards. Pairs with API-EG-006.
- **Trace.** P1 · automate-later · `create_service.rb:102-123`

#### UI-PR-006 — A PR-created event cannot be cloned
- **Why it matters.** Already stated as UI-PUB-022; here it is reached from the PR side,
  which is how a buyer actually meets it.
- **Setup.** A published PR-created event.
- **Steps.** Try to clone.
- **Expected.** Refused.
- **Oracle.** Message shown.
- **Trace.** P2 · automate-later

#### UI-PR-007 — Multiple PRs merged into one event keep their PR numbers per row
- **Why it matters.** The PR-number column is how the buyer proves which requisition a
  row served.
- **Setup.** Two approved PRs.
- **Steps.** Create one event from both.
- **Expected.** Every line item shows its originating PR number.
- **Oracle.** Each row's `pr_number` matches its source PR.
- **Trace.** P2 · automate-later

#### UI-PR-008 — Awarding a PR-created event writes back to the PR
- **Why it matters.** It closes the intake loop; without it the PR stays open forever.
- **Setup.** A PR-created event, awarded.
- **Steps.** Complete the award. Open the PR.
- **Expected.** The PR reflects the awarded quantity and vendor.
- **Oracle.** PR state and awarded quantity match the proposal.
- **Trace.** P1 · manual

#### UI-PR-009 — Withdrawing a PR-created event returns the quantity to the PR
- **Why it matters.** Otherwise a withdrawn event permanently consumes the requisition.
- **Setup.** A published PR-created event.
- **Steps.** Withdraw it. Open the PR.
- **Expected.** The in-progress quantity returns to open.
- **Oracle.** PR open quantity is back to its pre-event value.
- **Trace.** P1 · automate-later · `update_in_progress_quantity`

#### UI-PR-010 — A PR-created event's line item cannot be deleted below one
- **Why it matters.** Combines the PR constraint with the 711 rule; the message must be
  the readable one, not a raw code.
- **Setup.** A PR-created event with one line item.
- **Steps.** Try to delete it.
- **Expected.** Refused with "You cannot delete this line item from the project".
- **Oracle.** Message shown; item remains.
- **Trace.** P2 · automate-later

---

## 14. Classic single-stage events

The non-eRFX screen (`/orders/quick-create?singleStage=true`) is a different product
with the same vocabulary. Event type, auction sub-type and awarding mode are chosen in a
"Configuration for Event" drawer opened from the Event Type chip; line items *are* the
pricing template's sheet rows rather than a pre-sheet picker. It matters practically:
this path kept working throughout the eRFX activation regression, which is why the bid
and award journeys could be built at all.

#### UI-SS-001 — A single-stage RFQ publishes
- **Why it matters.** The most reliable event in the product and the seed for §15 and
  §16.
- **Setup.** Buyer with trade create; single-stage entry.
- **Steps.** Create → configure `eventType: rfq`, `awarding: lot` → title → Buy template
  → fill the first line item → add a participant → Publish.
- **Expected.** Lands on `/project/:id/details` with the event Live.
- **Oracle.** A real project id in the URL; no error toast.
- **Trace.** P0 · automate · flow `bid.submit` (buyer half)

#### UI-SS-002 — A single-stage RFP publishes
- **Why it matters.** The classic path has its own RFP shape, distinct from eRFX's
  technical stage.
- **Steps.** As UI-SS-001 with `eventType: rfp`.
- **Expected.** Publishes.
- **Oracle.** Project id; the event type reads RFP.
- **Trace.** P1 · automate-later

#### UI-SS-003 — A single-stage auction publishes with each sub-type
- **Why it matters.** Rank, price and traffic light are all selectable here, and the
  sub-type section only renders after the event type is chosen — a timing trap.
- **Steps.** For each of rank / price / traffic light: configure and publish.
- **Expected.** All three publish with the chosen sub-type.
- **Oracle.** Sub-type on the live event matches; wait for the conditional section to
  render before selecting.
- **Trace.** P1 · automate

#### UI-SS-004 — The configuration drawer renders awarding only after event type
- **Why it matters.** Selecting awarding before the type finds nothing and the run
  reports a missing control.
- **Setup.** A fresh single-stage create.
- **Steps.** Open the drawer and observe which sections exist before and after choosing
  a type.
- **Expected.** Sub-type and awarding appear only after the type is chosen.
- **Oracle.** Options absent before, present after.
- **Trace.** P1 · automate · `SingleStagePage.configure`

#### UI-SS-005 — Awarding "entire lot to a single vendor" is honoured downstream
- **Why it matters.** It constrains the awarding grid, so a mismatch surfaces only at
  award time.
- **Steps.** Publish lot-based; reach the awarding screen.
- **Expected.** The grid allows one winner for the whole lot.
- **Oracle.** Awarding mode reads lot at both ends.
- **Trace.** P1 · automate

#### UI-SS-006 — Awarding "partially award to multiple vendors" is honoured downstream
- **Why it matters.** The other mode, and the one the two-competing-bids journey needs.
- **Steps.** Publish line-item based; reach the awarding screen.
- **Expected.** Per-line allocation across vendors.
- **Oracle.** Awarding mode reads line_item at both ends.
- **Trace.** P1 · automate

#### UI-SS-007 — Line items are the template's sheet rows
- **Why it matters.** It is the structural difference from eRFX, and the reason the
  eRFX line-item helper does not work here.
- **Setup.** A single-stage create with a Buy template.
- **Steps.** Fill the first row's product, variant, quantity, delivery and price cells.
- **Expected.** One line item exists, defined by that row.
- **Oracle.** The row is complete and the event publishes with one item.
- **Trace.** P1 · automate · `SingleStagePage.fillFirstLineItem`

#### UI-SS-008 — Adding a second sheet row adds a second line item
- **Why it matters.** Multi-line classic events behave differently from eRFX's shared
  project items.
- **Steps.** Add a second row and publish.
- **Expected.** Two line items on the live event.
- **Oracle.** Line-item count = 2.
- **Trace.** P2 · automate-later

#### UI-SS-009 — Publishing with an incomplete row is refused
- **Why it matters.** The sheet is the line items here, so a half row is a half event.
- **Steps.** Leave the delivery location blank and publish.
- **Expected.** Refused with a readable message.
- **Oracle.** Publish blocked; no 500.
- **Trace.** P1 · automate

#### UI-SS-010 — "Invite whole audience" is the fallback when a named vendor is not found
- **Why it matters.** It is what keeps the bid journey alive on a tenant where the named
  test vendor is not in the searchable list — but it must be reported, because the run
  is then bidding as *someone*, not as the intended vendor.
- **Setup.** A vendor search term that matches nothing.
- **Steps.** Search, fail, fall back to inviting the audience, publish.
- **Expected.** The event publishes with a non-zero audience.
- **Oracle.** Audience count > 0 **and** a log line saying the named vendor was not
  matched. Never assert the specific vendor is on the event after this fallback.
- **Trace.** P1 · automate · flow `bid.submit`

#### UI-SS-011 — Scheduling a single-stage event for later works
- **Why it matters.** It was thought broken for a long time; the real cause was that the
  Schedule control is disabled until a line item exists ("Please choose a template and
  add a product").
- **Setup.** A single-stage create with a template and one line item.
- **Steps.** Open Schedule Event, set start/end and evaluation duration, Save Schedule.
- **Expected.** The drawer opens and the schedule persists.
- **Oracle.** Reopened drawer shows the saved window.
- **Trace.** P1 · automate · flow `event.scheduled`

#### UI-SS-012 — A classic event's detail page exposes the same lifecycle controls
- **Why it matters.** §15 to §17 navigate from here; if the tabs differ, the later cases
  need a different path.
- **Setup.** A published single-stage event.
- **Steps.** Read the tab strip and the Settings menu.
- **Expected.** Participants, bids/comparison, Master QCS and Settings are reachable.
- **Oracle.** Each entry point resolves.
- **Trace.** P1 · automate

#### UI-SS-013 — A single-stage event is unaffected by eRFX-only gates
- **Why it matters.** It is why this path survived the activation regression, and it is
  worth an explicit assertion so the isolation is not accidental.
- **Setup.** A tenant where eRFX publish is failing.
- **Steps.** Publish a single-stage event.
- **Expected.** Succeeds.
- **Oracle.** Publish succeeds while the eRFX path fails — report both in one run so
  the contrast is visible.
- **Trace.** P1 · automate

#### UI-SS-014 — Stage tabs do not appear on a classic tenant
- **Why it matters.** The clearest structural assertion that the right screen is under
  test — the "wrong screen" mistake is the most expensive one in this catalog.
- **Setup.** A tenant with `rfx_project_enabled` off.
- **Steps.** Open the create screen.
- **Expected.** No stage tab strip, no `+` stage control anywhere.
- **Oracle.** Zero elements matching the tab strip.
- **Trace.** P1 · automate

---

## 15. The vendor's bid

The other half of the product. The supplier portal is a separate application on its own
domain; the vendor logs in with an email OTP, finds the event they were invited to,
answers the technical questionnaire if there is one, fills the price sheet and submits.

Two structural notes that shape every case here. The vendor's event view opens on
**Event Overview** — the bid sheet lives behind the *stage* tab, and some builds need an
explicit "Add bid"/"Place bid" press before cells become editable. And the buyer's side
of the fixture must invite a **specific** vendor: an event published with a fallback
"invite everyone" audience cannot support any assertion about *this* vendor's bid.

#### UI-VBID-001 — An invited vendor sees the event in their Live list
- **Why it matters.** If the invitation does not arrive at the portal, nothing else in
  this section can run, and the cause is on the buyer's side.
- **Setup.** A live event with this vendor's company invited by name.
- **Steps.** Log in to the portal. Open the events list. Search the event title.
- **Expected.** The event is listed under Live with its ref id.
- **Oracle.** One matching card; fail loudly rather than falling back to "the first Live
  event" for any case that asserts something about *this* event.
- **Trace.** P0 · automate · flow `bid.submit`

#### UI-VBID-002 — An uninvited vendor does not see the event
- **Why it matters.** It is the first half of the isolation promise (PRD §7.2) and it is
  cheap to check.
- **Setup.** A live event; a vendor not on its audience.
- **Steps.** Search for the title in that vendor's portal.
- **Expected.** No result; direct URL access is refused.
- **Oracle.** Zero cards; a direct navigation lands on a refusal, not the event.
- **Trace.** P0 · automate-later · PRD §7.2

#### UI-VBID-003 — Opening the event lands on Event Overview
- **Why it matters.** It is the tab a test must move *off* of. Filling "the sheet" on
  the overview finds no cells and reports a missing bid form.
- **Setup.** An invited vendor on a live event.
- **Steps.** Open the event card.
- **Expected.** Event Overview, with the event's details and a stage tab beside it.
- **Oracle.** The overview is active; at least one other tab exists.
- **Trace.** P1 · automate

#### UI-VBID-004 — The stage tab exposes the bid sheet
- **Why it matters.** The actual entry to bidding.
- **Steps.** Switch to the stage tab. Press "Add bid"/"Place bid" if the build shows one.
- **Expected.** The bid sheet renders with the buyer's line items and editable price
  cells.
- **Oracle.** At least one non-disabled price cell exists.
- **Trace.** P0 · automate · `VendorPortalPage.startBidding`

#### UI-VBID-005 — The vendor sees the buyer's line items, quantities and locations
- **Why it matters.** The vendor prices against them; a wrong quantity is a wrong bid.
- **Setup.** A live event with two line items of known quantities.
- **Steps.** Read the sheet.
- **Expected.** Both items, with the buyer's quantities, units and delivery locations.
- **Oracle.** Row-by-row comparison against the buyer's event.
- **Trace.** P0 · automate

#### UI-VBID-006 — The vendor fills price cells and the total computes
- **Why it matters.** The total is what the buyer compares, and it is derived — a wrong
  derivation is invisible to both sides.
- **Setup.** A bid sheet with a quantity of 10 and a price cell.
- **Steps.** Enter 100.
- **Expected.** Total = 1000 (plus GST if the template has it, per its rule).
- **Oracle.** Rendered total equals the expected arithmetic.
- **Trace.** P0 · automate

#### UI-VBID-007 — Every price cell on a multi-line sheet is filled
- **Why it matters.** Submitting with one row priced can be *allowed* while being an
  incomplete bid. A test that fills only the first row can pass while creating a bid the
  buyer cannot use.
- **Setup.** A 3-line event.
- **Steps.** Fill all three price cells. Submit.
- **Expected.** All three prices are on the submitted bid.
- **Oracle.** Count the cells filled and assert it equals the row count; then check the
  buyer's comparison shows three prices.
- **Trace.** P0 · automate

#### UI-VBID-008 — Submitting the bid confirms it
- **Why it matters.** The core acceptance criterion of PRD §3.4.
- **Steps.** Press Submit and confirm if a modal appears.
- **Expected.** A success state — the bid is shown as submitted with its values.
- **Oracle.** The portal shows the bid as submitted; the buyer's bid count rises by one.
  Assert both sides, not just the portal's toast.
- **Trace.** P0 · automate · flow `bid.submit`

#### UI-VBID-009 — Submitting an empty bid is refused
- **Why it matters.** An empty bid would count as participation without a price.
- **Steps.** Open the sheet and press Submit with nothing entered.
- **Expected.** Refused — the control is disabled or the attempt is rejected with a
  message.
- **Oracle.** No bid appears on the buyer's side.
- **Trace.** P0 · automate

#### UI-VBID-010 — A negative price is refused
- **Why it matters.** The backend has a dedicated refusal ("Please enter a valid price",
  106) and the portal should not need it.
- **Steps.** Enter `-100`. Submit.
- **Expected.** Refused with a readable message.
- **Oracle.** No bid created; message shown.
- **Trace.** P0 · automate-later · PRD §5

#### UI-VBID-011 — Zero as a price is either refused or accepted deliberately
- **Why it matters.** Free-of-charge lines are real in some categories; whichever the
  product allows, it must be consistent and visible to the buyer.
- **Steps.** Enter `0` and submit.
- **Expected.** Consistent behaviour, stated on screen.
- **Oracle.** If accepted, the buyer's comparison shows 0 rather than blank.
- **Trace.** P1 · automate-later

#### UI-VBID-012 — Text in a price cell is refused, not coerced
- **Why it matters.** A coerced `0` is a winning bid.
- **Steps.** Type `abc` into a price cell.
- **Expected.** Refused or cleared with a message; never stored as 0.
- **Oracle.** No bid with price 0 created.
- **Trace.** P0 · automate · PRD §5

#### UI-VBID-013 — A negative quantity in the vendor's quantity column is refused
- **Why it matters.** Separate refusal from price ("Quantity must be greater than
  zero", 35).
- **Steps.** Enter `-1` as the offered quantity.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P1 · automate-later

#### UI-VBID-014 — Offering more than the requested quantity is refused
- **Why it matters.** The backend refuses it ("Quantity should be less than requested
  quantity", 511) and a vendor over-offering distorts the comparison.
- **Setup.** A line item requesting 10.
- **Steps.** Offer 15.
- **Expected.** Refused with that message.
- **Oracle.** No bid, or the bid capped and the vendor told.
- **Trace.** P1 · automate-later

#### UI-VBID-015 — Offering in a different unit is refused
- **Why it matters.** "Quantity should be in same unit as requested" (512) — a unit
  mismatch makes every price incomparable.
- **Steps.** Change the unit on the offer.
- **Expected.** Refused, or the unit is not editable at all.
- **Oracle.** The submitted bid's unit equals the requested unit.
- **Trace.** P1 · automate-later

#### UI-VBID-016 — A negative GST is refused
- **Why it matters.** Its own refusal path ("Please enter valid GST", 107).
- **Steps.** Enter a negative GST.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P2 · automate-later

#### UI-VBID-017 — A discount above 100% is refused
- **Why it matters.** "Please enter a valid discount" (369) — above 100% inverts the
  price.
- **Setup.** gate: trade credit / discount column present.
- **Steps.** Enter 150%.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P2 · automate-later

#### UI-VBID-018 — Bidding before the window opens is refused
- **Why it matters.** An Upcoming event must not accept bids; the product says "Kindly
  wait for the auction to start".
- **Setup.** An Upcoming event with this vendor invited.
- **Steps.** Open it and try to bid.
- **Expected.** Cells are not editable, or submission is refused with that message.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### UI-VBID-019 — Bidding after the window closes is refused
- **Why it matters.** The clearest integrity rule in the product: "Order not active"
  (33). A late bid that lands is a fairness failure, not a UI bug.
- **Setup.** A closed event with this vendor invited.
- **Steps.** Open it and try to bid.
- **Expected.** Refused.
- **Oracle.** Bid count on the buyer's side unchanged.
- **Trace.** P0 · automate-later

#### UI-VBID-020 — Bidding on a withdrawn event is refused
- **Why it matters.** Withdrawal must be immediate for vendors, not just cosmetic for
  the buyer.
- **Setup.** A withdrawn event.
- **Steps.** As an invited vendor, attempt a bid.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### UI-VBID-021 — Revising a bid inside the window replaces the value
- **Why it matters.** Revision is normal in an auction, and the *latest* bid is what
  ranks.
- **Setup.** A live event with a submitted bid of 100.
- **Steps.** Revise to 90 and submit.
- **Expected.** The vendor's current bid is 90; the buyer sees 90 as current with 100 in
  history.
- **Oracle.** Buyer's current price = 90; the revision is visible in the bid history.
- **Trace.** P0 · automate-later

#### UI-VBID-022 — A second bid without revising is refused as already placed
- **Why it matters.** The backend distinguishes "revise" from "create again" and refuses
  the second create ("You have already placed a bid for this company.", 99 / "A bid has
  already been placed by your team", 96).
- **Setup.** A vendor with an active bid.
- **Steps.** Attempt to create a fresh bid rather than revising.
- **Expected.** Refused with that message.
- **Oracle.** One active bid remains.
- **Trace.** P1 · automate-later

#### UI-VBID-023 — Another user from the same vendor company cannot bid twice
- **Why it matters.** "A bid has already been placed by your team" — the check is at
  company level, which is the level that matters commercially.
- **Setup.** Two users on the same vendor company; one has bid.
- **Steps.** As the second user, try to bid.
- **Expected.** Refused, with the existing bid visible instead.
- **Oracle.** Still one bid for that company.
- **Trace.** P1 · automate-later

#### UI-VBID-024 — Bidding after revoking a previous bid is refused
- **Why it matters.** A dedicated rule ("You cannot place a bid after revoking the
  previous one", 370) that is easy to violate by accident.
- **Setup.** A vendor who revoked their bid.
- **Steps.** Try to bid again.
- **Expected.** Refused with that message.
- **Oracle.** No new bid.
- **Trace.** P2 · automate-later

#### UI-VBID-025 — A vendor cannot see another vendor's price
- **Why it matters.** PRD §7.2 in the plainest possible form. This is the case you would
  keep if you could keep only one from this section.
- **Setup.** A live event with bids from vendor A (100) and vendor B (90).
- **Steps.** As A, inspect every screen the portal offers — sheet, overview,
  indicators, any comparison.
- **Expected.** A sees their own 100 and never B's 90. Rank or a colour is acceptable;
  a competitor's number is not.
- **Oracle.** Scan the rendered page text and the network responses the portal receives
  for B's price. Checking only the visible DOM is not enough — a price present in the
  payload is a leak.
- **Trace.** P0 · automate-later · PRD §7.2

#### UI-VBID-026 — Rank feedback is shown on a rank-based auction
- **Why it matters.** It is the only competitive signal the vendor gets, and it is why
  the strategy exists.
- **Setup.** A live rank auction with two bids.
- **Steps.** As the trailing vendor, read the indicator.
- **Expected.** A rank (e.g. L2), not a price.
- **Oracle.** Rank shown; no competitor price anywhere.
- **Trace.** P1 · automate-later

#### UI-VBID-027 — Best price is shown on a price-based auction, per configuration
- **Why it matters.** Here a number *is* shown deliberately, so the isolation rule and
  this rule must not be confused with one another.
- **Setup.** gate: show-best-price. A live price auction with two bids.
- **Steps.** As the trailing vendor, read the indicator.
- **Expected.** The best price is shown, without attribution to a vendor.
- **Oracle.** The number equals the leading bid; no vendor name accompanies it.
- **Trace.** P1 · automate-later

#### UI-VBID-028 — A vendor answers the technical questionnaire before pricing
- **Why it matters.** It is the RFP half of a two-stage event, and the pricing stage
  should not be reachable until it is done.
- **Setup.** A live RFP + RFQ event with this vendor invited.
- **Steps.** Open the technical stage. Answer each question. Submit the response.
- **Expected.** The response is submitted and the buyer can see it.
- **Oracle.** The buyer's view shows a submitted technical response for this vendor.
- **Trace.** P1 · automate-later

#### UI-VBID-029 — An incomplete technical response is refused
- **Why it matters.** A partial questionnaire cannot be evaluated, and evaluators score
  against completeness.
- **Steps.** Leave a required question blank and submit.
- **Expected.** Refused, naming the missing question.
- **Oracle.** No submitted response; message identifies the gap.
- **Trace.** P1 · automate-later

#### UI-VBID-030 — Attaching a document to a bid works and the buyer can open it
- **Why it matters.** Bid attachments are contractual (certificates, specs) and a broken
  link is only discovered at award time.
- **Setup.** A live event, bid in progress.
- **Steps.** Attach a PDF and submit.
- **Expected.** The buyer sees and can download the attachment.
- **Oracle.** The file opens from the buyer's side with the original name.
- **Trace.** P1 · automate-later

#### UI-VBID-031 — A bid survives a portal reload before submission
- **Why it matters.** A 40-row sheet lost to a refresh is the vendor's worst experience,
  and drafts exist to prevent it.
- **Setup.** A partially filled bid sheet.
- **Steps.** Reload the portal and reopen the event.
- **Expected.** Either the draft values are restored, or the vendor is warned before
  leaving. Not silently emptied.
- **Oracle.** Values restored, or a warning was shown.
- **Trace.** P1 · automate-later

#### UI-VBID-032 — Two vendors bidding on one event produce two competing bids
- **Why it matters.** Everything in §17 needs more than one bid to award between, and a
  journey that accidentally bids twice as the *same* vendor produces one bid while
  claiming two — a test asserting "two bids" then passes on a broken fixture.
- **Setup.** A live event with two distinct vendor companies invited.
- **Steps.** As vendor A, bid 100. As vendor B, bid 90.
- **Expected.** Two bids from two different companies.
- **Oracle.** The buyer's comparison lists two distinct vendor names — assert the *names
  differ*, not just that the count is 2.
- **Trace.** P0 · automate · flow "two competing bids"

---

## 16. Surrogate bidding

The buyer entering a bid on a vendor's behalf, without ever leaving the console. It is
in the PRD (§3.4) as a first-class capability and it is fenced in more ways than any
other action in the module.

The contract, from the app: the trigger is an **Add Bid** control rendered per vendor on
a published event's **Participants** tab, and only when that vendor is selected, the
event is not withdrawn or draft, and its status is upcoming or live — unless the company
has post-expiry surrogate bidding switched on. The drawer's submit stays **disabled
until at least one row has a price**. And the drawer does not render at all for knockout
or dutch auctions, nor for technical stages, which use a separate "Add Technical Bid".

#### UI-SUR-001 — The Participants tab of a published event offers Add Bid per vendor
- **Why it matters.** It is the entry point, and it lives on a *stage* tab, not the
  project tab — selecting a stage navigates, so the list arrives with a new page.
- **Setup.** A published, live event with invited vendors.
- **Steps.** Open the event. Select the stage tab. Open Participants.
- **Expected.** The vendor list renders with an Add Bid control on the eligible rows.
- **Oracle.** Reaching the list is the success condition — **not** finding an Add Bid
  control. The list is paginated and only eligible vendors show the control, so a
  single-vendor event shows a first page of other companies with none. Demanding the
  control here reports "surrogate bidding is unavailable" when the vendor is simply on
  another page.
- **Trace.** P0 · automate · `SurrogateBidPage.openParticipants`

#### UI-SUR-002 — A named vendor is found by searching the participant list
- **Why it matters.** With 154 vendors, the wanted one is almost never on page one, and
  a surrogate bid placed for the wrong vendor is worse than none.
- **Setup.** A live event with a known vendor on its audience.
- **Steps.** Type the vendor's name into the participant search. Wait for the list to
  narrow.
- **Expected.** That vendor's row is visible with its Add Bid control.
- **Oracle.** Narrow the list *before* looking for the control; assert the chosen row's
  text contains the vendor name. Read the name from the row (the `rowItem` ancestor),
  not from the button's wrapper — the wrapper says only "Add Bid", which makes every
  vendor look identical and sends every match to the first row.
- **Trace.** P0 · automate

#### UI-SUR-003 — The Add Bid drawer opens with that vendor's sheet
- **Why it matters.** The drawer is per-vendor; opening the wrong one attributes the bid
  to the wrong company.
- **Steps.** Click Add Bid on the chosen row.
- **Expected.** A drawer with the event's line items and the vendor's name on it.
- **Oracle.** Drawer identified by containing the submit control; the vendor name in the
  drawer matches the row.
- **Trace.** P0 · automate

#### UI-SUR-004 — Submit is disabled until a price is entered
- **Why it matters.** It is the product's own guard against an empty surrogate bid, and
  it doubles as the oracle for "did my values register in the sheet's state".
- **Setup.** The drawer open, nothing entered.
- **Steps.** Read the submit control.
- **Expected.** Disabled.
- **Oracle.** Disabled with nothing entered; enabled after one price. If it stays
  disabled after prices are typed, report exactly that — the values did not register —
  rather than clicking blindly and reporting "nothing happened".
- **Trace.** P0 · automate

#### UI-SUR-005 — A surrogate bid is submitted and attributed to the vendor
- **Why it matters.** The core of PRD §3.4's second half.
- **Steps.** Fill every price cell. Submit. Confirm if a modal appears.
- **Expected.** The bid is recorded against that vendor, marked as buyer-added.
- **Oracle.** The comparison shows a bid for that vendor at that price, flagged
  surrogate; no error toast after submit.
- **Trace.** P0 · automate · flow "surrogate bidding by vendor name"

#### UI-SUR-006 — Every price cell in the drawer is filled, not just the first
- **Why it matters.** The drawer reuses the data grid, so one priced row is enough to
  enable submit while leaving an incomplete bid — the same trap as UI-VBID-007, on the
  buyer's side.
- **Setup.** A multi-line event.
- **Steps.** Fill all price cells (and the offered-quantity cells the grid exposes).
  Submit.
- **Expected.** A complete bid across every line.
- **Oracle.** Count the filled cells; assert the buyer's comparison shows a price on
  every line.
- **Trace.** P0 · automate

#### UI-SUR-007 — Two unnamed surrogate bids land on two different vendors
- **Why it matters.** Without tracking who was already bid for, two "give me any
  vendor" surrogate bids both pick the first row — the event ends with one bid while a
  test asserting two passes.
- **Setup.** A live event with at least two eligible vendors.
- **Steps.** Place a surrogate bid without naming a vendor, twice.
- **Expected.** Two bids from two different companies.
- **Oracle.** The two chosen row texts differ; the comparison shows two distinct vendors.
- **Trace.** P0 · automate

#### UI-SUR-008 — Add Bid is absent on a draft event
- **Why it matters.** A bid on an unpublished event has nothing to bid against.
- **Setup.** A draft event.
- **Steps.** Look for the participant list and the control.
- **Expected.** Not offered.
- **Oracle.** Zero Add Bid controls.
- **Trace.** P1 · automate-later

#### UI-SUR-009 — Add Bid is absent on a withdrawn event
- **Why it matters.** Withdrawal must close the buyer's path too, not just the vendor's.
- **Setup.** A withdrawn event.
- **Steps.** Open Participants.
- **Expected.** No Add Bid controls.
- **Oracle.** Zero controls.
- **Trace.** P1 · automate-later

#### UI-SUR-010 — Add Bid is offered on an Upcoming event
- **Why it matters.** Deliberately wider than the vendor's own window — a buyer can
  enter a bid received by phone before the event opens.
- **Setup.** An Upcoming event.
- **Steps.** Open Participants and place a surrogate bid.
- **Expected.** Offered and accepted.
- **Oracle.** Bid recorded; contrast with UI-VBID-018, where the vendor cannot.
- **Trace.** P1 · automate-later

#### UI-SUR-011 — After expiry, Add Bid depends on the company's post-expiry setting
- **Why it matters.** It is the one setting that changes whether late surrogate bids are
  possible at all, and it has obvious integrity implications.
- **Setup.** Two tenants: post-expiry surrogate bidding on and off. A closed event on
  each.
- **Steps.** Open Participants on each.
- **Expected.** Offered where the setting is on, absent where it is off.
- **Oracle.** Control presence flips with the setting; where absent, a crafted attempt is
  refused with "Order not active".
- **Trace.** P0 · automate-later · `is_allowed_to_add_surrogate_bid_post_expiry?`

#### UI-SUR-012 — Add Bid is absent on a knockout auction
- **Why it matters.** Knockout runs on automated offers; a manual surrogate bid has no
  meaning in it.
- **Setup.** A live knockout auction.
- **Steps.** Open Participants.
- **Expected.** No Add Bid drawer.
- **Oracle.** Zero controls.
- **Trace.** P1 · automate-later

#### UI-SUR-013 — Add Bid is absent on a dutch auction
- **Why it matters.** Same reasoning, different strategy.
- **Setup.** A live dutch auction.
- **Steps.** Open Participants.
- **Expected.** No Add Bid drawer.
- **Oracle.** Zero controls.
- **Trace.** P1 · automate-later

#### UI-SUR-014 — A technical stage offers Add Technical Bid, not Add Bid
- **Why it matters.** They are different controls with different payloads; conflating
  them makes a technical surrogate response look impossible.
- **Setup.** A live RFP stage.
- **Steps.** Open Participants.
- **Expected.** A technical-bid control, no price drawer.
- **Oracle.** The technical control exists; the price drawer does not.
- **Trace.** P1 · automate-later

#### UI-SUR-015 — A surrogate technical response can be entered for a vendor
- **Why it matters.** It is the technical half of surrogate bidding, and the API has a
  dedicated endpoint for it.
- **Setup.** A live RFP stage with an invited vendor.
- **Steps.** Add a technical bid for that vendor: answer both the global and the
  line-item forms, submit.
- **Expected.** Submitted and attributed to the vendor.
- **Oracle.** The buyer sees a submitted technical response for that vendor, marked
  surrogate. Pairs with API-SUR-002.
- **Trace.** P1 · automate-later

#### UI-SUR-016 — Surrogate bidding is refused when the company forbids it
- **Why it matters.** `is_buyer_not_allowed_to_add_surrogate_bid` exists precisely so
  some organisations can bar it, and honouring it is a compliance matter.
- **Setup.** An event whose config forbids buyer surrogate bids.
- **Steps.** Attempt a surrogate bid.
- **Expected.** Refused ("You are not allowed to use this functionality", 10).
- **Oracle.** No bid created; the control is absent or the attempt refused.
- **Trace.** P0 · automate-later

#### UI-SUR-017 — Only a valid surrogate bidder may place one
- **Why it matters.** The gate is super-admin, a member of a valid bidding team, or the
  event's own creator. Anyone else placing bids for vendors is a serious problem.
- **Setup.** A buyer who is none of those three, on an event they can otherwise see.
- **Steps.** Attempt a surrogate bid.
- **Expected.** Refused (165).
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later · `is_surrogate_bidding_and_is_allowed?`

#### UI-SUR-018 — A surrogate bid for a vendor who already bid is refused by default
- **Why it matters.** Overwriting a vendor's own bid is the most damaging thing this
  feature could do; by default it is refused (99) and only a specific config allows it.
- **Setup.** A vendor who has submitted their own bid, on a tenant without
  `allowed_surrogate_bid_even_after_bid`.
- **Steps.** Attempt a surrogate bid for them.
- **Expected.** Refused.
- **Oracle.** The vendor's own bid is unchanged.
- **Trace.** P0 · automate-later

#### UI-SUR-019 — Where the config allows it, a later surrogate bid revises rather than duplicates
- **Why it matters.** With `allowed_surrogate_bid_even_after_bid` on, the product
  *revises* the existing surrogate bid. Creating a second one instead would double-count
  the vendor in the comparison.
- **Setup.** gate: `allowed_surrogate_bid_even_after_bid`. A vendor with an existing
  surrogate bid.
- **Steps.** Place another surrogate bid for them at a new price.
- **Expected.** One bid, at the new price, with the old value in history.
- **Oracle.** Bid count for that vendor is still 1; the current price is the new one.
- **Trace.** P0 · automate-later · `validate_existing_bids_if_present`

#### UI-SUR-020 — A surrogate bid may require approval before it counts
- **Why it matters.** On tenants with a surrogate-bid approval flow, the bid is
  *requested*, not active — and a test asserting an immediate active bid fails there
  forever.
- **Setup.** gate: surrogate-bid approval configured.
- **Steps.** Place a surrogate bid.
- **Expected.** It enters an approval-pending state and an approver has a task.
- **Oracle.** Bid status is approval-requested; the approver's task list contains it.
- **Trace.** P1 · automate-later

#### UI-SUR-021 — Reading the surrogate approval flows needs approval-read permission
- **Why it matters.** It is the one genuinely gated method on an otherwise open bid
  policy, which makes it easy to lose.
- **Setup.** A buyer without approval-flow read permission.
- **Steps.** Trigger the surrogate approval-flow lookup.
- **Expected.** Refused.
- **Oracle.** Refusal rather than an empty list — an empty list would look like "no
  approval needed" and let the bid through. Pairs with API-SUR-011.
- **Trace.** P1 · automate-later · `bid_policy.rb:53-60`

#### UI-SUR-022 — A surrogate bid is visibly marked as buyer-entered
- **Why it matters.** At award time it matters enormously whether a price came from the
  vendor or from the buyer's phone call. If it is not labelled, the audit trail is gone.
- **Setup.** An event with one vendor bid and one surrogate bid.
- **Steps.** Read the buyer's comparison.
- **Expected.** The surrogate bid is labelled as such; the vendor's own is not.
- **Oracle.** The label is present on exactly one of the two.
- **Trace.** P0 · automate-later

#### UI-SUR-023 — A surrogate bid is refused with a negative or absent price
- **Why it matters.** Same validation as a vendor's bid; the surrogate path must not be
  the lenient one.
- **Steps.** Enter a negative price, then clear the cell entirely, and try to submit
  each time.
- **Expected.** Refused both times.
- **Oracle.** Submit stays disabled for the empty case; a message for the negative.
- **Trace.** P1 · automate-later

#### UI-SUR-024 — A surrogate bid appears to the vendor as their own bid
- **Why it matters.** If the vendor cannot see it, they may bid again and the two
  disagree; if they can, they can query it. Either way, the state must be honest.
- **Setup.** An event with a surrogate bid placed for a vendor.
- **Steps.** As that vendor, open the event.
- **Expected.** The bid is visible with its price, and the product is clear about who
  entered it.
- **Oracle.** The vendor's portal shows a bid at that price.
- **Trace.** P1 · automate-later

---

## 17. Awarding

The end of the journey: choosing whose bid wins and turning that into a proposal that
goes through an approval workflow. Two things about this screen are easy to get wrong,
and both were discovered the hard way.

**The entry control changes once a proposal exists.** Master QCS renders "Start
Awarding" only while there is no current proposal; afterwards it becomes "Bid Selection
Proposal" with a Draft tag. A flow that knows only the first control works exactly once
and then reports the feature missing.

**There are two counters and they measure different things.** "Tot. selected line items"
counts what will be awarded; "Awarded Vendors" counts who it goes to. The checkbox that
awards a vendor moves only the second — treating it as an unrelated toggle and unticking
it makes Create Proposal refuse with "Please award for at least one Vendor".

#### UI-AWD-001 — Master QCS is reachable on a closed event with bids
- **Why it matters.** It is the door to awarding; if it does not open, nothing else here
  runs.
- **Setup.** A published event with at least one submitted bid.
- **Steps.** Open the event → Master QCS tab.
- **Expected.** The comparison grid renders with the line items and the bidding vendors.
- **Oracle.** The grid is present and lists the expected vendor(s).
- **Trace.** P0 · automate · `AwardPage.openMasterQcs`

#### UI-AWD-002 — The comparison shows every bid, per line item, with totals
- **Why it matters.** It is the decision surface. A missing or misattributed bid here
  produces a wrong award.
- **Setup.** An event with two vendors' bids at known prices.
- **Steps.** Read the grid.
- **Expected.** Both vendors, both prices, correct per-line and total amounts.
- **Oracle.** Compare every rendered price against the fixture; assert the vendor names
  are the real ones and not placeholders.
- **Trace.** P0 · automate

#### UI-AWD-003 — Start Awarding enters the awarding flow
- **Why it matters.** The first of the two entry controls.
- **Setup.** An event with bids and no proposal yet.
- **Steps.** Press Start Awarding.
- **Expected.** The awarding screen opens for this event.
- **Oracle.** URL moves to the awarding route with the event's id.
- **Trace.** P0 · automate

#### UI-AWD-004 — Bid Selection Proposal re-enters the flow once a draft proposal exists
- **Why it matters.** Without this, awarding appears to work once per event and then
  vanish.
- **Setup.** An event with a draft proposal.
- **Steps.** Return to Master QCS and read the entry control.
- **Expected.** "Bid Selection Proposal" with a Draft tag, and it re-enters the flow.
- **Oracle.** The second control exists and navigates; the first is absent.
- **Trace.** P0 · automate

#### UI-AWD-005 — A disabled awarding control explains itself
- **Why it matters.** Awarding is gated by `is_awarding_allowed` and the button carries
  a tooltip saying why — a live event, a stage still in draft, or a superseded version.
  That reason is worth reporting instead of discovering as a dead click.
- **Setup.** A live event whose bidding is still open.
- **Steps.** Hover the awarding control.
- **Expected.** Disabled, with a tooltip naming the reason.
- **Oracle.** Report the tooltip text; do not click through.
- **Trace.** P1 · automate

#### UI-AWD-006 — Awarding is blocked while a selected or requested proposal exists
- **Why it matters.** Two live proposals on one event would award it twice.
- **Setup.** An event with a submitted (requested) proposal.
- **Steps.** Try to start a new award.
- **Expected.** Blocked, with the existing proposal offered instead.
- **Oracle.** No second proposal is created. Pairs with API-AWD-005.
- **Trace.** P0 · automate-later · `is_awarding_allowed?`

#### UI-AWD-007 — Awarding is blocked while this user holds a draft proposal
- **Why it matters.** The gate is per-user for drafts, which is subtly different from
  the previous case.
- **Setup.** The same buyer with a draft proposal on the event.
- **Steps.** Try to start a fresh award.
- **Expected.** Blocked; the draft is offered.
- **Oracle.** Proposal count unchanged.
- **Trace.** P1 · automate-later

#### UI-AWD-008 — Allocating a line item to a vendor moves the item counter
- **Why it matters.** It is one of the two counters, and it is the one that says *what*
  is being awarded.
- **Setup.** The awarding grid with two line items.
- **Steps.** Allocate one line item to a vendor.
- **Expected.** "Tot. selected line items" reads 1/2.
- **Oracle.** Read the app's own counter — it is a more honest oracle than inferring
  which checkbox belongs to which vendor from the DOM.
- **Trace.** P0 · automate · `AwardPage.allocate`

#### UI-AWD-009 — Awarding a vendor moves the vendor counter
- **Why it matters.** It is the counter the Create Proposal validation actually checks,
  and the one that was mistaken for an unrelated toggle.
- **Steps.** Tick the control that awards the vendor.
- **Expected.** "Awarded Vendors" rises to 1.
- **Oracle.** Both counters must be non-zero before Create Proposal; assert each
  separately so a failure says which one is missing.
- **Trace.** P0 · automate

#### UI-AWD-010 — Create Proposal is refused with no vendor awarded
- **Why it matters.** It is the exact failure the two-counter confusion produced:
  "Please award for at least one Vendor".
- **Setup.** Line items allocated but no vendor awarded.
- **Steps.** Press Create Proposal.
- **Expected.** Refused with that message.
- **Oracle.** Message shown; no proposal created.
- **Trace.** P0 · automate

#### UI-AWD-011 — Create Proposal produces a draft proposal
- **Why it matters.** Creation and submission are deliberately separate — which is why
  the Master QCS control changes — and a draft proposal is not an awarded event.
- **Steps.** Allocate, award, Create Proposal.
- **Expected.** A draft proposal exists with the allocation on it.
- **Oracle.** Proposal exists in draft with the expected vendor and line items. A
  missing submit control must be reported, not treated as success.
- **Trace.** P0 · automate

#### UI-AWD-012 — Submitting the proposal sends it into the approval workflow
- **Why it matters.** PRD §3.5 — the award goes through a proposal *and* an approval
  workflow. Submission is the point of no return.
- **Steps.** Submit the draft proposal.
- **Expected.** Status moves to requested; approvers have tasks.
- **Oracle.** Proposal status requested; approver task exists.
- **Trace.** P0 · automate · flow `award` (create → bid → award)

#### UI-AWD-013 — An approver approves and the award completes
- **Why it matters.** It is the last step of the whole catalog and the one that changes
  commercial reality.
- **Setup.** A submitted proposal and its approver.
- **Steps.** As the approver, open the task and approve.
- **Expected.** The proposal is selected; the event shows as awarded to that vendor.
- **Oracle.** Event state awarded; the awarded vendor and quantity match the allocation.
- **Trace.** P0 · automate-later

#### UI-AWD-014 — A rejected proposal returns the event to awardable
- **Why it matters.** Otherwise a rejection deadlocks the event.
- **Setup.** A submitted proposal.
- **Steps.** As the approver, reject with remarks.
- **Expected.** The event can be awarded again; the rejection and remarks are recorded.
- **Oracle.** Awarding controls re-enable; the rejection is in the history.
- **Trace.** P1 · automate-later

#### UI-AWD-015 — Discarding a draft proposal re-enables awarding
- **Why it matters.** It is the escape hatch from UI-AWD-007, and it must actually clear
  the gate.
- **Setup.** A draft proposal.
- **Steps.** Discard it.
- **Expected.** Awarding is available again.
- **Oracle.** The Start Awarding control returns.
- **Trace.** P1 · automate-later

#### UI-AWD-016 — Partial awarding splits one line item across vendors
- **Why it matters.** It is the whole reason line-item awarding mode exists, and the
  quantities must add up.
- **Setup.** A line-item-awarding event with a quantity of 100 and two bids.
- **Steps.** Award 60 to A and 40 to B.
- **Expected.** Both allocations recorded; total awarded = 100.
- **Oracle.** Sum of awarded quantities equals the requested quantity; neither vendor
  exceeds their offered quantity.
- **Trace.** P0 · automate-later

#### UI-AWD-017 — Awarding more than the requested quantity is refused
- **Why it matters.** Over-awarding creates a commitment the requisition never covered.
- **Setup.** A quantity of 100.
- **Steps.** Try to award 60 + 60.
- **Expected.** Refused with a readable message.
- **Oracle.** No proposal with 120 awarded.
- **Trace.** P0 · automate-later

#### UI-AWD-018 — Awarding the whole lot on a partial-lot RFQ is refused
- **Why it matters.** The backend refuses it in words ("You cannot award entire lot when
  RFQ was done for partial lot.", 503) and the reason is genuinely non-obvious.
- **Setup.** An RFQ run as partial lot.
- **Steps.** Try to award the entire lot to one vendor.
- **Expected.** Refused with that message.
- **Oracle.** Message shown; no proposal.
- **Trace.** P1 · automate-later

#### UI-AWD-019 — Closing the bid to select a winner is refused outside the allowed window
- **Why it matters.** `close_bid` has its own timing gate ("Unable to close the order at
  this time. Please wait for the bidding to end", 9), and closing early would cut off
  bids that were still permitted.
- **Setup.** A live event still inside its bidding window.
- **Steps.** Attempt to close the bid and select a winner.
- **Expected.** Refused with that message.
- **Oracle.** The event stays live; no winner is set.
- **Trace.** P1 · automate-later

#### UI-AWD-020 — The awarding report downloads and matches the screen
- **Why it matters.** The report is what leaves the building — it goes to finance and to
  the vendor. A mismatch with the screen is the most consequential inconsistency in the
  module.
- **Setup.** An awarded event.
- **Steps.** Download the awarding sheet.
- **Expected.** A file whose vendors, line items, quantities and prices match the grid.
- **Oracle.** Parse the file and compare the numbers cell by cell against the rendered
  grid.
- **Trace.** P1 · automate-later

---

## 18. Isolation, masking and permissions

The cases that answer "can the wrong person see or do this?". PRD §7.2 makes bid
isolation an absolute, and everything else here is the permission matrix expressed as
journeys.

#### UI-PERM-001 — A vendor cannot open an event they were not invited to
- **Why it matters.** Direct-URL access is the first thing anyone tries.
- **Setup.** An event's URL and an uninvited vendor.
- **Steps.** Navigate directly.
- **Expected.** Refused, not rendered.
- **Oracle.** The event's title and prices are absent from the response.
- **Trace.** P0 · automate-later

#### UI-PERM-002 — A vendor with no visible stage cannot view the event at all
- **Why it matters.** Read permission alone is not enough — the policy also requires at
  least one visible stage, which is a rule people forget exists.
- **Setup.** A vendor on the company's platform but not on any stage's audience.
- **Steps.** Attempt to open the event.
- **Expected.** Refused.
- **Oracle.** Authorization failure rather than an empty event page. Pairs with
  API-PERM-001.
- **Trace.** P0 · automate-later · `event_group_policy.rb:52-54`

#### UI-PERM-003 — A buyer from another company cannot see the event
- **Why it matters.** Cross-tenant isolation, the highest-stakes boundary in the system.
- **Setup.** Two companies; an event in company A.
- **Steps.** As a buyer in company B, search for and navigate to it.
- **Expected.** Not found; direct access refused.
- **Oracle.** Zero rows and a refusal.
- **Trace.** P0 · automate-later

#### UI-PERM-004 — A buyer without trade-create permission cannot create or publish
- **Why it matters.** Permissions are team-based here, so a user can look like a buyer
  and not be one.
- **Setup.** A user whose teams grant read but not create on `trade`.
- **Steps.** Try to reach the create screen and publish.
- **Expected.** Refused or unavailable.
- **Oracle.** No event created.
- **Trace.** P0 · automate-later

#### UI-PERM-005 — A user without sourcing-events access cannot create a stage
- **Why it matters.** `has_access_for_sourcing_events?` is a second, independent gate on
  stage creation; passing the first and failing this one is a real configuration.
- **Setup.** A user with trade-create but without sourcing-events access.
- **Steps.** Attempt to create a stage.
- **Expected.** Refused.
- **Oracle.** No stage created. Pairs with API-PERM-004.
- **Trace.** P1 · automate-later

#### UI-PERM-006 — A planner cannot clone an event
- **Why it matters.** A specific policy carve-out that would otherwise pass silently
  because cloning needs only create permission.
- **Setup.** A planner with create permission.
- **Steps.** Try to clone an active event.
- **Expected.** Refused.
- **Oracle.** No clone created.
- **Trace.** P2 · automate-later

#### UI-PERM-007 — Vendor masking removes the Audience tab
- **Why it matters.** gate: `isVendorMaskingEnabled`. Masking exists so a buyer's team
  cannot see who is bidding; leaving the tab in defeats it entirely.
- **Setup.** gate: `isVendorMaskingEnabled`.
- **Steps.** Open a published event's tabs.
- **Expected.** No Audience tab.
- **Oracle.** Tab absent from the list.
- **Trace.** P0 · automate-later

#### UI-PERM-008 — Vendor masking hides vendor identities in the comparison
- **Why it matters.** The tab being gone is worthless if the names appear on the grid.
- **Setup.** gate: `isVendorMaskingEnabled`. An event with two bids.
- **Steps.** Open Master QCS.
- **Expected.** Vendors appear as anonymised labels, not company names.
- **Oracle.** No real vendor name in the rendered grid **or** in the payload behind it.
- **Trace.** P0 · manual

#### UI-PERM-009 — An evaluator sees the technical response and not the prices
- **Why it matters.** The separation of technical and commercial evaluation is the point
  of a two-stage event.
- **Setup.** An RFP + RFQ event with a submitted technical response and a bid.
- **Steps.** As the evaluator, open the response.
- **Expected.** Questionnaire answers visible; prices not.
- **Oracle.** No bid price in the evaluator's view or its payload.
- **Trace.** P0 · automate-later · PRD §2

#### UI-PERM-010 — A vendor cannot reach the buyer console
- **Why it matters.** Two applications, one identity provider — the boundary must hold.
- **Setup.** Vendor credentials.
- **Steps.** Try to log into the buyer console.
- **Expected.** Refused.
- **Oracle.** No authenticated buyer session.
- **Trace.** P0 · automate-later

#### UI-PERM-011 — A buyer cannot place a bid as their own company
- **Why it matters.** "Cannot place bid on trade by your own company" (165) — otherwise
  a buyer could bid against their own event.
- **Setup.** A buyer on their own event.
- **Steps.** Attempt to bid as the buying company.
- **Expected.** Refused.
- **Oracle.** No bid created.
- **Trace.** P0 · automate-later

#### UI-PERM-012 — Feedback on a bid is restricted to the order's team or a super admin
- **Why it matters.** A narrow gate on an otherwise open bid policy, so it is easy to
  lose in a refactor.
- **Setup.** A buyer not on the order's team and not a super admin.
- **Steps.** Attempt to add feedback on a bid.
- **Expected.** Refused.
- **Oracle.** No feedback recorded. Pairs with API-PERM-011.
- **Trace.** P2 · automate-later

#### UI-PERM-013 — Uploading a bid Excel needs view access to the event
- **Why it matters.** It is a bulk write path, and bulk write paths with weak
  authorization are the worst kind.
- **Setup.** A user without view access to the event.
- **Steps.** Attempt the upload.
- **Expected.** Refused.
- **Oracle.** No bids created.
- **Trace.** P1 · automate-later

#### UI-PERM-014 — Session expiry mid-journey is handled, not crashed into
- **Why it matters.** A long bidding session outlives a token, and the vendor must be
  told rather than losing a filled sheet to a silent failure.
- **Setup.** A filled bid sheet and an expired session.
- **Steps.** Submit.
- **Expected.** A re-authentication prompt or a clear message; the entered values are
  not lost without warning.
- **Oracle.** A readable message rather than a blank screen or a swallowed error.
- **Trace.** P1 · manual

---

## 19. Data validation and unpleasant input

PRD §5 in one place: required fields enforced, valid formats, positive quantities, and
malformed input answered **politely** — a 4xx with a readable message, never a 500 and
never a silent partial save. Plus §6's unusual text.

#### UI-VAL-001 — Every required field on the create screen is enforced
- **Why it matters.** It is the requirement stated most broadly in the PRD, so it needs
  a systematic case rather than one per field.
- **Setup.** A create screen.
- **Steps.** Attempt publish with each required field blank in turn — title, template,
  line items, schedule, participants.
- **Expected.** Each is refused with a message naming the field. No partial event.
- **Oracle.** For each: publish blocked, message present, and zero events created.
- **Trace.** P0 · automate · PRD §5

#### UI-VAL-002 — A whitespace-only title is treated as blank
- **Why it matters.** It is the standard way past a presence check.
- **Steps.** Title `"   "`. Publish.
- **Expected.** Refused as missing.
- **Oracle.** Publish blocked.
- **Trace.** P1 · automate

#### UI-VAL-003 — HTML in a title is escaped, not rendered
- **Why it matters.** Stored XSS in an event title would reach every invited vendor.
- **Steps.** Title `<img src=x onerror=alert(1)>`. Publish. View the list, the detail
  page and the vendor's portal.
- **Expected.** The text renders literally; no script executes anywhere.
- **Oracle.** No dialog/console error; the DOM contains escaped text, not an element.
- **Trace.** P0 · automate-later

#### UI-VAL-004 — A script payload in a line-item or clause field is escaped
- **Why it matters.** Titles are the obvious field; clauses and item descriptions reach
  vendors too.
- **Steps.** Put the same payload in a T&C clause and an item description. Publish. View
  as the vendor.
- **Expected.** Escaped everywhere.
- **Oracle.** No execution in either view.
- **Trace.** P0 · manual

#### UI-VAL-005 — SQL-ish input is handled as text
- **Why it matters.** `'; DROP TABLE` in a search box is the cheapest smoke test for a
  whole class of failure.
- **Steps.** Search the events list and the participant list for `'; DROP TABLE
  event_groups; --`.
- **Expected.** Zero or literal matches; no error.
- **Oracle.** A normal empty-result state; no 500.
- **Trace.** P1 · automate

#### UI-VAL-006 — A very long string in every text field is bounded politely
- **Why it matters.** PRD §6. Unbounded fields become database errors, which become
  500s.
- **Steps.** Enter 10,000 characters into the title, description and a clause.
- **Expected.** Either accepted whole or refused with a stated limit. No 500, no silent
  truncation.
- **Oracle.** Per field: a message, or a value that round-trips exactly.
- **Trace.** P1 · automate-later · PRD §6

#### UI-VAL-007 — Emoji survive in titles, descriptions and clauses
- **Why it matters.** Four-byte characters are where encoding assumptions break.
- **Steps.** Use emoji in each. Publish. Read back on the buyer's and vendor's views.
- **Expected.** Identical rendering everywhere.
- **Oracle.** Byte equality on read-back.
- **Trace.** P2 · automate · PRD §6

#### UI-VAL-008 — Right-to-left and CJK text render without breaking layout
- **Why it matters.** Real tenants have them, and a broken grid is unusable rather than
  merely ugly.
- **Steps.** Enter Arabic and Chinese text in a title and a line-item description.
- **Expected.** Rendered correctly; the sheet's columns stay aligned.
- **Oracle.** No horizontal overflow of the grid container; text matches.
- **Trace.** P3 · manual

#### UI-VAL-009 — Leading and trailing whitespace is trimmed consistently
- **Why it matters.** `"RFQ "` and `"RFQ"` as two different titles makes search
  unreliable for everyone.
- **Steps.** Publish with `"  Event A  "`. Search for `"Event A"`.
- **Expected.** Found; the stored title is trimmed.
- **Oracle.** Search hit and an exact stored value.
- **Trace.** P2 · automate

#### UI-VAL-010 — A number field rejects `e`-notation and thousands separators
- **Why it matters.** `1e5` and `1,00,000` both parse to something unexpected somewhere
  in the stack.
- **Steps.** Enter `1e5` and `1,00,000` into a price cell.
- **Expected.** Refused or normalised visibly. Not stored as an unrelated number.
- **Oracle.** The stored value equals what is displayed.
- **Trace.** P2 · automate-later

#### UI-VAL-011 — More decimal places than the template allows are rounded visibly
- **Why it matters.** Silent rounding of a price changes the bid.
- **Steps.** Enter `100.999` where 2 decimals are configured.
- **Expected.** Rounded to `101.00` **and** shown that way before submission.
- **Oracle.** Displayed and stored values agree.
- **Trace.** P1 · automate-later

#### UI-VAL-012 — Duplicate product names in master data do not confuse the picker
- **Why it matters.** PRD §6 lists duplicate product names; the picker must disambiguate
  or the buyer adds the wrong item.
- **Setup.** Two products with the same name and different codes.
- **Steps.** Search for the name in the line-items picker.
- **Expected.** Both are offered, distinguishable (code, category or variant).
- **Oracle.** Two options with distinguishing text; the chosen one is the one that lands.
- **Trace.** P1 · automate-later · PRD §6

#### UI-VAL-013 — A duplicate user email is refused when adding a user
- **Why it matters.** PRD §6, and duplicated identities break team-based permissions.
- **Setup.** An existing user's email.
- **Steps.** Create a user with the same email.
- **Expected.** Refused with a readable message.
- **Oracle.** No second user created.
- **Trace.** P1 · automate-later · PRD §4

#### UI-VAL-014 — A 10-digit phone number is accepted and stored with a country prefix
- **Why it matters.** The PRD states this as an acceptance criterion *and* flags it for
  verification: the specified rule is "any 10-digit number, prefixed `+91` by default".
  If the product is stricter or looser, the difference is the finding.
- **Setup.** The user-create form.
- **Steps.** Enter `9876543210` and save. Then try `1234567890`, `0000000000`, a 9-digit
  and an 11-digit number.
- **Expected (as specified).** All 10-digit values accepted and stored as `+91…`;
  9- and 11-digit refused.
- **Oracle.** Record the exact behaviour per input and compare against the specified
  rule — this case is expected to produce a finding either way.
- **Trace.** P1 · automate-later · PRD §4.3

#### UI-VAL-015 — An invalid email format is refused
- **Why it matters.** PRD §5 names email format explicitly, and it is the field most
  often loosely validated.
- **Steps.** Try `a@`, `a@b`, `a b@c.com`, `a@@b.com`.
- **Expected.** All refused with a format message.
- **Oracle.** No record created for any of them.
- **Trace.** P1 · automate-later · PRD §5

#### UI-VAL-016 — A malformed request never produces a partial event
- **Why it matters.** PRD §5's "no partial record" clause. A half-written event is worse
  than a refused one because nobody knows it exists.
- **Setup.** A crafted create request with a malformed `line_items` (a string, not an
  array).
- **Steps.** Send it.
- **Expected.** A 4xx with a readable message; nothing written.
- **Oracle.** No event group and no line items created. Pairs with API-VAL-003.
- **Trace.** P0 · automate-later · PRD §5

#### UI-VAL-017 — Every validation message is readable and names the problem
- **Why it matters.** PRD §5's "politely" clause is a real requirement. `Error 712` on
  screen is a defect even when the refusal is correct.
- **Setup.** Any five refusal paths from this catalog.
- **Steps.** Trigger each and read the message.
- **Expected.** Each is a sentence naming the problem, not a bare code.
- **Oracle.** No message consists only of a number; each contains a field or an action.
- **Trace.** P1 · automate · PRD §5

#### UI-VAL-018 — A failed request does not leave the screen in a dead state
- **Why it matters.** After the activation regression, the button did nothing and the
  buyer had no idea why — the absence of feedback was as damaging as the failure.
- **Setup.** Any refused publish.
- **Steps.** After the refusal, try to correct the problem and publish again.
- **Expected.** The screen is still usable; the second attempt works.
- **Oracle.** No reload needed to recover; the retry succeeds.
- **Trace.** P0 · automate

---

## 20. Non-functional and resilience

Small section, deliberately. These are the ones worth running on a schedule rather than
on every commit.

#### UI-NFR-001 — The events list stays under the 3-second target as volume grows
- **Why it matters.** PRD §7.1, measured rather than assumed.
- **Setup.** Tenants with ~10, ~100 and ~1000 events.
- **Steps.** Time a cold load of the list on each.
- **Expected.** Under ~3s throughout.
- **Oracle.** Record the three numbers and trend them; flag regressions rather than
  asserting a hard threshold on shared infrastructure.
- **Trace.** P2 · automate · PRD §7.1

#### UI-NFR-002 — The create screen stays responsive with 65 line items
- **Why it matters.** The sheet is the heaviest component in the product and the cap is
  the realistic worst case for a non-BOQ event.
- **Setup.** A non-BOQ event at the cap.
- **Steps.** Scroll and edit cells at the top and bottom of the sheet.
- **Expected.** Edits register without visible lag; no dropped keystrokes.
- **Oracle.** Every value entered is present after the pass.
- **Trace.** P2 · automate-later

#### UI-NFR-003 — A 500-row BOQ sheet renders and can be scrolled
- **Why it matters.** PRD §6's large-event case, at the UI layer.
- **Setup.** A 500-item BOQ event.
- **Steps.** Open the sheet; scroll to the last row.
- **Expected.** It renders (virtualised is fine) and the last row is reachable.
- **Oracle.** Row 500 is present and correct.
- **Trace.** P2 · manual

#### UI-NFR-004 — Publishing a 500-item event completes within a stated budget
- **Why it matters.** A publish that times out client-side while succeeding server-side
  is the worst outcome: the buyer retries and creates a second event.
- **Setup.** A 500-item BOQ event.
- **Steps.** Publish and time it.
- **Expected.** Completes; the client waits long enough. If it times out, the event must
  not be duplicated by a retry.
- **Oracle.** One event afterwards, whatever the timing; record the duration.
- **Trace.** P1 · manual

#### UI-NFR-005 — A slow network does not double-submit a bid
- **Why it matters.** Vendors bid on bad connections at the last minute; a duplicate bid
  is a real integrity problem.
- **Setup.** Throttled network, a live event.
- **Steps.** Submit a bid and click again while it is in flight.
- **Expected.** One bid.
- **Oracle.** Bid count = 1 on the buyer's side.
- **Trace.** P1 · automate-later

#### UI-NFR-006 — A dropped connection mid-publish leaves a recoverable state
- **Why it matters.** PRD §7.3 — a half-finished action must corrupt nothing.
- **Setup.** A valid event.
- **Steps.** Kill the network during the publish request. Restore it. Reload.
- **Expected.** Either published or still a draft; never a broken half-state, and never
  two events.
- **Oracle.** Exactly one event with that title, in a coherent status.
- **Trace.** P1 · manual · PRD §7.3

#### UI-NFR-007 — The bid countdown agrees with the server's clock
- **Why it matters.** A vendor bidding against a fast client clock loses the event
  through no fault of their own.
- **Setup.** A live event near its end.
- **Steps.** Compare the rendered countdown with the server's end time.
- **Expected.** Within a couple of seconds.
- **Oracle.** Difference under a small threshold; a client-clock skew must not shift it.
- **Trace.** P1 · manual

#### UI-NFR-008 — Two buyers editing one draft do not silently overwrite each other
- **Why it matters.** The version guard exists for this, and the failure mode is losing
  a colleague's work without either of them knowing.
- **Setup.** One draft, two buyers.
- **Steps.** Both edit; both save.
- **Expected.** The second save is either merged or refused as stale, with a message.
- **Oracle.** No silent loss: after both saves, the surviving state is explainable and
  the loser was told. Pairs with UI-PUB-011.
- **Trace.** P1 · automate-later

#### UI-NFR-009 — The console recovers from a backend 5xx without losing the form
- **Why it matters.** During the activation regression every publish failed; how the
  screen behaved then decided whether buyers lost their work as well as their event.
- **Setup.** A create screen with a full configuration; force a 5xx on publish.
- **Steps.** Publish. Read the screen.
- **Expected.** An error is surfaced and every entered value is still there.
- **Oracle.** The form retains its values; a message is visible.
- **Trace.** P0 · automate

#### UI-NFR-010 — Accessibility basics on the create and bid screens
- **Why it matters.** They are the two screens people spend hours in, and the automation
  depends on roles and labels to find anything at all — so it is also a testability
  matter.
- **Setup.** The create screen and the vendor bid sheet.
- **Steps.** Tab through each; check that every control has an accessible name.
- **Expected.** Focus order follows the visual order; no unlabelled interactive control.
- **Oracle.** An accessibility scan with zero critical violations on named controls.
- **Trace.** P2 · automate-later

---

## Exit criteria

The UI slice of the events module is releasable when:

1. Every **P0** case passes, or has a filed defect with an agreed owner.
2. The happy path publishes for each event type the tenant supports — RFQ, technical,
   auction (each available strategy), each legal two-stage pair, and the RFQ→Auction
   conversion.
3. A vendor can bid through the portal, and a buyer can bid on their behalf, and the two
   are distinguishable afterwards (UI-SUR-022).
4. Two competing bids from **two different companies** exist on one event, and an award
   goes through allocation, proposal and approval (UI-AWD-012 / UI-AWD-013).
5. No case anywhere in the run observed an untyped 500 (UI-PUB-002).
6. Bid isolation holds under the payload-level check, not only the visual one
   (UI-VBID-025).
7. Every gated case that did not run reports **not applicable with its gate named** —
   an unexplained skip is treated as a failure of the run, not of the feature.

## Known behaviours to log, not to raise as new

- **Missing per-item RFP templates do not block publish** (UI-TECH-008) — events go out
  with empty item questionnaires.
- **A stage with no template fails on the savings message** (UI-TPL-004) — the message
  names the wrong cause.
- **The schedule chip shows an unsaved default** (UI-SCH-014) — it reads as set before
  Save Schedule is pressed.
- **`PATCH /api/event_groups/:id` returned an untyped 500** from 2026-09-08 (UI-PUB-002)
  — a filed regression, kept in the suite as a permanent guard.
