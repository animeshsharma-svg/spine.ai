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
- **Expected.** RFQ and Technical Stage are offered. Auction is not — it is already
  present.
- **Oracle.** Menu item set is exactly {RFQ, Technical Stage}.
- **Trace.** P1 · automate · `getDropdownMenu`

#### UI-CRE-005 — Adding an Auction while an RFQ is present is refused, with a reason
- **Why it matters.** This is the mutual exclusion, and the product explains it in
  words. A test should assert the words, because that sentence is what a buyer acts on.
- **Setup.** A project holding one RFQ stage.
- **Steps.** Open `+`.
- **Expected.** Auction is absent from the menu; the disabled-state tooltip reads
  "Remove RFQ to add Auction".
- **Oracle.** No Auction menu item; tooltip text matches.
- **Trace.** P1 · automate · `isValidStage`

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
