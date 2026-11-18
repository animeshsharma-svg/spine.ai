# PO Amendment, end to end — test cases

These cases cover the whole journey. A PO is generated, the buyer clicks **Amend** and adds new products, and a new
version of the event (".1") is created. Vendors bid on it. Then the award either **amends the original PO** (the same
vendor won) or **creates a new PO** (a different vendor won). An event can be amended many times (.1, .2, .3 …).

Each case is written so that anyone can run it by hand. "What should happen" is the pass condition. If the app does
anything else, it's a bug.

**What this is built on.** The cases are based on the code itself, not on a spec:
- Buyer screens: [Procol-Tech/procol-client-dashboard#5755](https://github.com/Procol-Tech/procol-client-dashboard/pull/5755)
- Vendor screens: [Procol-Tech/web-bidding#1300](https://github.com/Procol-Tech/web-bidding/pull/1300)
- Server: `procol-backend` branch `feat/po-sourcing-amendment-type3` (services in `app/services/amendment/purchase_order/`)

The vendor-screen-only cases for PR #1300 are in [pr-web-bidding-1300-po-amendment.md](pr-web-bidding-1300-po-amendment.md).
This file covers the whole flow.

---

## Read this first

### Words used in this file

| Word | Meaning |
|---|---|
| **Original event** | The first event (call it v1). It was awarded and a PO came out of it. |
| **Original PO** | The PO generated from the original event. This is the PO you click **Amend** on. |
| **Amendment event / ".1"** | The new version of the event that **Amend** creates. A second amendment makes ".2", and so on. |
| **Old items** (locked) | Line items carried over from the original event. Nobody can bid on them again. The screen shows them as **Locked**. |
| **New items** (open) | The products you added in the Amend screen. These are the only items vendors bid on. |
| **Vendor A** | The vendor who holds the original PO. |
| **Vendor B** | A brand-new vendor, invited only to the amendment event. Never bid before. |
| **Vendor C** | A vendor who bid on the original event but **lost**. Invited again to the amendment. |
| **Service PO** | A PO for services, where items have activities under them, instead of goods. |
| **PR-backed PO** | A PO whose event was created from a Purchase Requisition (PR). |
| **Standalone PO** | A PO whose event was created directly, without a PR. |

### What the server allows (so you know what "should" happen)

These are the rules in the backend code. Any case that breaks one of them should be **refused**, with the message shown.

| Rule | Message the buyer should see |
|---|---|
| Only an **active**, **generated**, **purchase** order (buy side) can be amended | "This purchase order cannot be amended." / "…has not been generated yet…" |
| The PO must have come from a Procol event | "This purchase order was not sourced on Procol…" |
| The event can't be **BOQ**, **lot-based**, **Dutch auction** or **knockout auction**, and must have a commercial stage | "Sourcing amendments are not supported for this type of event." |
| Only **one draft amendment** at a time | "A draft amendment already exists… Resume it or discard it…" |
| You can't start a new amendment while the previous one is **still running** (published but not yet awarded or ended) | "The previous amendment for this purchase order has not finished yet…" |
| A PR-backed PO takes **PR line items**; a standalone PO takes **products** | "The line items sent do not match this purchase order…" |
| A PR item must have **open quantity** left | "…have no open quantity left to source." |
| A product needs an **active variant** and a **unit** in this workspace | "Some of the selected products could not be found, or have no active variant." |
| Standalone products need a **quantity**, and it must be more than 0 | quantity error |
| A vendor can't price an **old (locked)** item | "These line items are carried over from the original purchase order and cannot be priced again." |
| You can't award **only** locked items | "Locked line items cannot be awarded. Select at least one line item that is open for awarding." |
| A draft amendment is **discarded** from the PO, not withdrawn | "This is a draft purchase order amendment. Discard it from the purchase order instead of withdrawing it." |
| The whole feature is behind a company setting: `po_amendment_sourcing_enabled` | Amend isn't offered, or is refused, when it's off |

**How the award decides between "amend PO" and "new PO".** If the winner is the **same vendor as the original PO**, the
setting is on, and the original PO is still active, then the **original PO is amended**. Otherwise a **new PO** is
created. If anything goes wrong while amending, the server **silently falls back to a new PO**: it only logs the error,
so the buyer isn't told.

### Things in the code that look risky (test these first)

1. **New vendor's bid may fail.** On the server, a vendor who isn't the original PO vendor gets error 1156 if their
   bid includes a locked item. If the vendor screen sends the locked rows along with the new ones, Vendor B's and
   Vendor C's whole bid fails. See POAM-120 and POAM-121.
2. **Currency lock may not show.** The server stores the lock per vendor company id. The vendor screen looks it up by
   stage (`layerId`), and the buyer's surrogate drawer looks it up by vendor uuid. If these keys don't match, the
   currency pencil still shows. See POAM-112 and POAM-150.
3. **The other bid page (PlaceBidV2) still validates locked rows.** A locked row with an empty required field would
   block submit there. See POAM-131.
4. **Silent fallback to a new PO.** See POAM-215.
5. **Two drafts at once.** A code comment says two buyers clicking Amend at the same moment can both get a draft.
   See POAM-047.
6. **Vendor C sees their own old losing price** on locked rows, not blank. Confirm this is what product wants. See
   POAM-123.
7. **Fully locked surrogate bid can't be submitted**, by design, according to the PR thread. See POAM-144.

### Test data to set up once

Create these before you start. Write the event ids and PO numbers down.

| Set | What to create |
|---|---|
| **D1: standalone goods PO** | An RFQ (no PR) with 3 items: Bolt (qty 100), Nut (qty 200), Washer (qty 300). Vendors A and C bid, A wins everything, and the PO is generated. Add 2 T&C clauses, 1 T&C attachment, 1 event attachment, and 1 technical stage with 3 questions. A bids in **USD**; the event allows INR and USD. |
| **D2: PR-backed goods PO** | Same as D1, but the event is created from a PR that has 5 lines, with only 3 of them used. The other 2 PR lines still have open quantity. |
| **D3: service PO** | A service event: 2 services, each with 3 activities. A wins and the PO is generated. |
| **D4: split PO** | An event where A wins Bolt and C wins Nut, giving two POs: one to A and one to C. |
| **D5: multi-stage event** | Technical (RFP) stage, then RFQ, then auction. A wins and the PO is generated. |
| **D6: events that can't be amended** | One BOQ event, one lot event, one Dutch auction and one knockout auction, each with a PO generated. |
| **Users** | Buyer with PO rights; buyer **without** PO rights; approver; Vendor A, Vendor B (new) and Vendor C (old loser) logins. |

Use a **fresh** set for every full run. Sharing events between runs gives false results.

---

## 1. The Amend button — who sees it and when

#### POAM-001 — Amend shows on a generated, active PO
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D1. The PO is generated and active.
- **Steps:** 1. Open the PO list. 2. Open the D1 PO. 3. Look for **Amend**.
- **What should happen:** **Amend** is visible and clickable.

#### POAM-002 — Amend shows on a service PO too
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D3.
- **Steps:** Open the service PO and look for **Amend**.
- **What should happen:** **Amend** is visible, and clicking it opens the add-products/services screen.

#### POAM-003 — Amend is not offered (or is refused) when the company setting is off
- **Who:** Buyer · **Priority:** P0
- **Before you start:** Turn off `po_amendment_sourcing_enabled` for the company.
- **Steps:** Open the D1 PO and try **Amend**.
- **What should happen:** **Amend** is hidden or disabled. If you call the API directly, you get "not allowed". Turn the setting back on afterwards.

#### POAM-004 — PO not yet generated (draft or pending approval)
- **Who:** Buyer · **Priority:** P0
- **Before you start:** An award whose PO is still in draft or awaiting approval.
- **Steps:** Open it and try **Amend**.
- **What should happen:** Not allowed: "This purchase order has not been generated yet, so it cannot be amended."

#### POAM-005 — Cancelled or closed PO
- **Who:** Buyer · **Priority:** P1
- **Before you start:** Cancel one copy of the D1 PO.
- **Steps:** Try **Amend** on it.
- **What should happen:** Not allowed: "This purchase order cannot be amended."

#### POAM-006 — PO made outside an event (custom or manual PO)
- **Who:** Buyer · **Priority:** P1
- **Steps:** Create a manual/custom PO that has no event behind it, then try **Amend**.
- **What should happen:** Not allowed: "This purchase order was not sourced on Procol…". The old normal PO amendment, if any, still works.

#### POAM-007 — BOQ, lot, Dutch and knockout events can't be amended
- **Who:** Buyer · **Priority:** P1
- **Before you start:** D6.
- **Steps:** Try **Amend** on each of the 4 POs.
- **What should happen:** All 4 are refused: "Sourcing amendments are not supported for this type of event."

#### POAM-008 — A buyer without PO rights can't amend
- **Who:** Buyer without PO permission · **Priority:** P1
- **Steps:** Log in as that user and open the D1 PO.
- **What should happen:** **Amend** isn't visible, and the API refuses.

#### POAM-009 — A vendor never sees Amend
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Vendor A opens their PO on the supplier portal.
- **What should happen:** There's no **Amend** button. The vendor can only view the PO.

#### POAM-010 — Amend on a sell or sales order is refused
- **Who:** Buyer · **Priority:** P3
- **Steps:** If your tenant has sell orders, try **Amend** on one.
- **What should happen:** Refused: "Only buy orders can be amended."

---

## 2. Picking new products (the Amend screen)

#### POAM-020 — Standalone PO: add one new product with a quantity
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D1.
- **Steps:** 1. Click **Amend** → **Add new products**. 2. Search for "Screw" and select it. 3. Enter qty 50. 4. Confirm.
- **What should happen:** A new draft event opens, named like the original with a ".1" version. It has Bolt, Nut and Washer (locked) plus Screw (open, qty 50).

#### POAM-021 — Standalone PO: several new products at once
- **Who:** Buyer · **Priority:** P0
- **Steps:** Add Screw (50), Rivet (20) and Pin (10).
- **What should happen:** All three come in as open items with their quantities, and the old three are locked.

#### POAM-022 — Standalone PO: quantity left empty
- **Who:** Buyer · **Priority:** P0
- **Steps:** Select a product but leave the quantity empty, then confirm.
- **What should happen:** Not allowed. The buyer is asked for a quantity, and no draft is created.

#### POAM-023 — Quantity 0, negative or text
- **Who:** Buyer · **Priority:** P1
- **Steps:** Try qty 0, then -5, then "abc".
- **What should happen:** All three are refused, and no draft is created.

#### POAM-024 — Product with no active variant, inactive, or no unit
- **Who:** Buyer · **Priority:** P1
- **Before you start:** Three test products, one in each bad state.
- **Steps:** Try adding each one.
- **What should happen:** Refused: "Some of the selected products could not be found, or have no active variant." No draft is created.

#### POAM-025 — The same product that is already on the PO
- **Who:** Buyer · **Priority:** P1
- **Steps:** Add "Bolt" again as a new product with qty 40.
- **What should happen:** Record what happens. Either it's added as a **separate open line** (Bolt, qty 40) next to the locked Bolt, or there's a clear message. It must not unlock or change the old Bolt line.

#### POAM-026 — The same product picked twice in the picker
- **Who:** Buyer · **Priority:** P2
- **Steps:** Select Screw twice, with different quantities.
- **What should happen:** Only one Screw line is created (duplicates are merged) or a clear warning shows. There's no crash.

#### POAM-027 — Nothing selected
- **Who:** Buyer · **Priority:** P1
- **Steps:** Click **Amend** → **Add new products**, select nothing and confirm.
- **What should happen:** The confirm button is disabled, or the buyer sees "Line items required". No draft is created.

#### POAM-028 — Delivery location for each new line
- **Who:** Buyer · **Priority:** P1
- **Steps:** Add Screw and pick a delivery location (buyer hub), then add Rivet and pick a different one.
- **What should happen:** Each line keeps its own location in the draft. A location from another company is refused.

#### POAM-029 — PR-backed PO: pick the open PR lines
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D2 (2 PR lines are still open).
- **Steps:** Click **Amend** → **Add new products**.
- **What should happen:** The picker shows **PR lines** (not the product catalogue). Choose the 2 open lines and confirm. The draft has the 3 old items locked and the 2 PR lines open, with the PR quantities filled in.

#### POAM-030 — PR-backed PO: a PR line with no open quantity
- **Who:** Buyer · **Priority:** P1
- **Steps:** Try picking a PR line that is already fully ordered.
- **What should happen:** It isn't offered, or it's refused: "…have no open quantity left to source."

#### POAM-031 — PR-backed PO: trying to add a free product instead of a PR line
- **Who:** Buyer · **Priority:** P1
- **Steps:** Via the API (or the UI, if it allows it), send a product instead of a PR line.
- **What should happen:** Refused: "A requisition backed purchase order takes purchase request line items…"

#### POAM-032 — Standalone PO: trying to add a PR line
- **Who:** Buyer · **Priority:** P2
- **Steps:** Via the API, send a PR line id for D1.
- **What should happen:** Refused: "…one from a standalone event takes products."

#### POAM-033 — PR-backed PO: a rate-only PR line
- **Who:** Buyer · **Priority:** P2
- **Steps:** Pick a rate-only PR line (no quantity).
- **What should happen:** Allowed. It comes in as a rate-only open line.

#### POAM-034 — PR-backed PO: change the quantity of a PR line before confirming
- **Who:** Buyer · **Priority:** P2
- **Steps:** Pick a PR line with open qty 100, change it to 60 and confirm.
- **What should happen:** The draft line shows 60, and the PR's open quantity is still correct afterwards.

#### POAM-035 — Service PO: add a new service with activities
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D3.
- **Steps:** Amend → add a new service (or new activities).
- **What should happen:** The draft shows the old services and activities **locked** and the new ones **open**.

#### POAM-036 — Cancel out of the picker
- **Who:** Buyer · **Priority:** P2
- **Steps:** Open the picker, select a few products, then cancel or close.
- **What should happen:** No draft is created and the PO is unchanged. Clicking Amend again starts clean.

---

## 3. The new draft event (".1") — what it looks like and what carries over

#### POAM-040 — Version number
- **Who:** Buyer · **Priority:** P0
- **Steps:** Look at the draft's title, header and event list.
- **What should happen:** It's shown as a new version of the original (".1"). The original event still exists, unchanged, and links to the new version.

#### POAM-041 — T&C clauses carry over
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open the T&C section of the draft.
- **What should happen:** Both T&C clauses from the original event are there, word for word.

#### POAM-042 — T&C attachment carries over and opens
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open the T&C attachment in the draft.
- **What should happen:** It's the same file as on the original, and it downloads and opens. The file isn't broken and the link hasn't expired.

#### POAM-043 — Event attachments and line-item attachments carry over
- **Who:** Buyer · **Priority:** P0
- **Steps:** Check the event-level attachments, the stage-level attachments, and any attachment on the old line items.
- **What should happen:** All of them are present and open.

#### POAM-044 — Editing T&C or attachments in the draft doesn't change the original
- **Who:** Buyer · **Priority:** P1
- **Steps:** In the draft, edit one T&C clause, delete one attachment and add a new one. Then open the original event.
- **What should happen:** The original event's T&C and attachments are unchanged.

#### POAM-045 — Technical (RFP) stage carries over
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D5.
- **Steps:** Open the technical stage of the draft.
- **What should happen:** The questions are there. Sections for **old items are locked**: you can't add or delete questions, change the type, or add evaluators. Sections for **new items** can be edited.

#### POAM-046 — Second click on Amend while the draft exists
- **Who:** Buyer · **Priority:** P0
- **Steps:** Go back to the PO and click **Amend** again.
- **What should happen:** Refused: "A draft amendment already exists… Resume it or discard it…". The message offers a way to open the existing draft.

#### POAM-047 — Two buyers click Amend at the same moment (race)
- **Who:** Two buyers · **Priority:** P2
- **Steps:** Two buyers open the same PO and click **Amend** at the same time.
- **What should happen:** Only **one** draft is created and the other buyer gets "draft already exists". (A code comment says this isn't fully guarded, so check carefully.)

#### POAM-048 — Old items are locked on the create screen
- **Who:** Buyer · **Priority:** P0
- **Steps:** On each old item (Bolt, Nut, Washer), try to change the variant, change the quantity, delete it, and change its price cap.
- **What should happen:** None of these are possible. The variant field shows "Variant of product cannot be modified", there's no delete icon, and quantity and price cap are read-only.

#### POAM-049 — New items are fully editable
- **Who:** Buyer · **Priority:** P0
- **Steps:** On Screw, change the quantity, change the variant, set a price cap, and delete it.
- **What should happen:** Everything works.

#### POAM-050 — Add one more new item from inside the draft
- **Who:** Buyer · **Priority:** P1
- **Steps:** In the draft, use **Add line item** to add another product.
- **What should happen:** It's added as an open item.

#### POAM-051 — Template can't be changed
- **Who:** Buyer · **Priority:** P1
- **Steps:** Try to change or delete the event template.
- **What should happen:** Template selection is disabled and there's no delete option.

#### POAM-052 — Recurring and scheduled settings are hidden
- **Who:** Buyer · **Priority:** P2
- **Before you start:** Make the original event a recurring event if possible.
- **Steps:** Look for recurring settings in the draft.
- **What should happen:** They're hidden. The draft isn't a recurring template.

#### POAM-053 — Close time and schedule start fresh
- **Who:** Buyer · **Priority:** P0
- **Steps:** Look at the schedule of each stage.
- **What should happen:** The original's close time isn't copied. The buyer must set new start and end times. Old schedules that ended before they started are dropped.

#### POAM-054 — Stages carry over correctly
- **Who:** Buyer · **Priority:** P1
- **Before you start:** D5.
- **Steps:** Look at the stages in the draft.
- **What should happen:** The technical, RFQ and auction stages are all present. The commercial (RFQ) stage has old items locked and new items open.

#### POAM-055 — Participants: who is pre-filled
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open the participants/vendors list of the draft.
- **What should happen:** Note which vendors are pre-filled. Vendor A at least should be there. Removing or adding vendors works.

#### POAM-056 — Add a new vendor (Vendor B)
- **Who:** Buyer · **Priority:** P0
- **Steps:** Add Vendor B to the participants.
- **What should happen:** B is added and receives the invite when the event is published.

#### POAM-057 — Add an old losing vendor (Vendor C)
- **Who:** Buyer · **Priority:** P1
- **Steps:** Add C.
- **What should happen:** C is added.

#### POAM-058 — Invite a vendor who isn't onboarded yet
- **Who:** Buyer · **Priority:** P2
- **Steps:** Invite a new vendor by email.
- **What should happen:** The invite goes out, and the vendor can sign up and see the amendment event.

#### POAM-059 — Currency settings
- **Who:** Buyer · **Priority:** P1
- **Steps:** Look at the allowed currencies of the draft.
- **What should happen:** They're the same as the original. Remember that Vendor A will be locked to the currency they bid in last time.

#### POAM-060 — Savings and target price
- **Who:** Buyer · **Priority:** P2
- **Steps:** Open the savings drawer and set a target or benchmark price.
- **What should happen:** Old items are skipped or read-only, and new items can be set.

#### POAM-061 — Every button on the create screen works
- **Who:** Buyer · **Priority:** P0
- **Steps:** Click each of these once on the draft: **Save draft**, **Preview**, **Add stage**, **Set schedule**, **Add participants**, **Add T&C**, **Upload attachment**, **Add evaluator** (new-item sections), **Approval flow / Send for approval**, **Publish**, **Withdraw / Discard draft**.
- **What should happen:** Each one does its normal job with no error. On old-item sections, the edit buttons (add question, change type, add evaluator, select template) are hidden or disabled.

#### POAM-062 — Save the draft, leave and come back
- **Who:** Buyer · **Priority:** P1
- **Steps:** Make changes, save the draft, log out, log in and open the draft from the PO or the events list.
- **What should happen:** All changes are still there. Old items are still locked.

#### POAM-063 — The draft can be found from the PO page
- **Who:** Buyer · **Priority:** P1
- **Steps:** Open the original PO.
- **What should happen:** There's a way to open or resume the draft amendment.

---

## 4. Throwing away a draft amendment

#### POAM-070 — Discard the draft from the PO
- **Who:** Buyer · **Priority:** P0
- **Steps:** On the draft, click **Withdraw/Discard**, enter a remark and confirm.
- **What should happen:** The message says the draft was withdrawn, the draft disappears, and the PO is unchanged. Clicking **Amend** now starts a **new** draft.

#### POAM-071 — Discard with a remark and an attachment
- **Who:** Buyer · **Priority:** P2
- **Steps:** Discard with a remark and a file attached.
- **What should happen:** It works, and the remark and file are saved in the history.

#### POAM-072 — Discard with an empty remark
- **Who:** Buyer · **Priority:** P2
- **Steps:** Try to discard with no remark.
- **What should happen:** Either a remark is required, or the discard works. Behaviour should match the normal draft withdraw.

#### POAM-073 — PR lines come back after a discard (PR-backed)
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D2. Pick 2 PR lines, then discard.
- **Steps:** Open the PR and look at those 2 lines.
- **What should happen:** They show **open** quantity again and can be used in a new amendment or a new event.

#### POAM-074 — The normal "withdraw event" path is blocked for an amendment draft
- **Who:** Buyer · **Priority:** P2
- **Steps:** Try to withdraw the draft through the normal events list (not via the PO), or via the API.
- **What should happen:** Refused: "This is a draft purchase order amendment. Discard it from the purchase order instead of withdrawing it."

#### POAM-075 — Discard when there's no draft
- **Who:** Buyer · **Priority:** P3
- **Steps:** Via the API, call discard on a PO with no draft.
- **What should happen:** "There is no draft amendment on this purchase order to discard."

---

## 5. Publishing the amendment event

#### POAM-080 — Publish with old and new items
- **Who:** Buyer · **Priority:** P0
- **Steps:** Set the schedule, add vendors A, B and C, then **Publish**.
- **What should happen:** The event goes live, and A, B and C get invites.

#### POAM-081 — Publish through an approval flow
- **Who:** Buyer + approver · **Priority:** P1
- **Steps:** Send for approval. The approver approves, then publish.
- **What should happen:** It works like any event. A rejection sends it back to draft with the remark.

#### POAM-082 — Publish without a schedule
- **Who:** Buyer · **Priority:** P1
- **Steps:** Try to publish without setting new times.
- **What should happen:** Refused, with a message pointing to the schedule.

#### POAM-083 — Publish without vendors
- **Who:** Buyer · **Priority:** P2
- **Steps:** Remove all vendors and publish.
- **What should happen:** Refused, the same as a normal event.

#### POAM-084 — Invite email content
- **Who:** Vendor A, B · **Priority:** P2
- **Steps:** Open the invite emails.
- **What should happen:** They show the right event name and version and a working link. They show **no prices** (not A's old price, nobody else's).

#### POAM-085 — Original event after publish
- **Who:** Buyer · **Priority:** P1
- **Steps:** Open the original event.
- **What should happen:** It's still closed or awarded, and its data (bids, award, PO) is unchanged.

---

## 6. Vendor A (holds the original PO) — every screen and button

#### POAM-100 — A sees the amendment event
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Log in to the supplier portal.
- **What should happen:** The new event is listed and opens.

#### POAM-101 — T&C acceptance popup
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Open the event.
- **What should happen:** The T&C popup shows the **same clauses** as the original, and the T&C attachment downloads. **Accept** lets them in. **Decline** keeps them out and the buyer sees the decline.

#### POAM-102 — Intent to participate
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Click **Participate**, and on another copy click **Not participating**.
- **What should happen:** Both work and the buyer sees the status.

#### POAM-103 — Technical stage: old sections are read-only, new ones can be answered
- **Who:** Vendor A · **Priority:** P0
- **Before you start:** D5 amendment.
- **Steps:** Open the technical stage.
- **What should happen:** Sections for old items show A's previous answers and can't be edited (including question groups). Sections for new items can be answered. **Save** and **Submit** work.

#### POAM-104 — Technical stage: required questions on old sections don't block submit
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Answer only the new sections and submit.
- **What should happen:** It submits.

#### POAM-105 — Technical stage: required questions on new sections do block submit
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Leave a required question empty on a new section and submit.
- **What should happen:** Blocked, with the error on that question.

#### POAM-106 — Technical attachments
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Upload a file on a new section, and try to upload on an old section.
- **What should happen:** The upload works on the new section and isn't possible on the old one.

#### POAM-107 — Commercial sheet: old items show A's own old price and are locked
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Open **Place Bid**.
- **What should happen:** Bolt, Nut and Washer show **A's own winning price** from the original, plus A's old quantity and GST. Nothing on these rows can be edited, including the checkbox, remarks, delivery date and attachments. Screw is empty and editable.

#### POAM-108 — Totals include the old items
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Enter a price for Screw.
- **What should happen:** The grand total equals the old items at their old prices plus Screw at the new price, including taxes, freight and other formula columns.

#### POAM-109 — Submit with only the new items filled
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Fill Screw and **Submit**.
- **What should happen:** The bid is submitted. The buyer sees the old items at the old prices and Screw at the new price.

#### POAM-110 — The new items still need valid values
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Leave Screw empty, enter -1, enter text, or enter a price above the cap.
- **What should happen:** Submit is blocked each time, and the error points at Screw only.

#### POAM-111 — The error list never shows old items
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Cause an error on Screw and open the error summary.
- **What should happen:** Only Screw is listed.

#### POAM-112 — Currency is locked to what A used last time
- **Who:** Vendor A · **Priority:** P0
- **Before you start:** A bid in USD on the original, and the event allows INR and USD.
- **Steps:** Open **Place Bid**.
- **What should happen:** The currency is USD, and there's **no pencil** to change it. Check both bid pages (the normal one and the V2 one). If the pencil shows, see risk #2 above.

#### POAM-113 — Download and upload the bid sheet
- **Who:** Vendor A · **Priority:** P0
- **Steps:** 1. **Download** the sheet. 2. In Excel, change Bolt's price to 999 and fill Screw. 3. **Upload**.
- **What should happen:** Bolt stays at the old price (the upload ignores it). Screw takes the uploaded value. Nothing errors.

#### POAM-114 — Upload a sheet with rows deleted
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Delete the Screw row in Excel and upload.
- **What should happen:** Screw stays empty and submit is blocked asking for Screw. It must never submit with Screw unpriced.

#### POAM-115 — Save as draft, then come back
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Fill Screw, **Save draft**, log out and back in.
- **What should happen:** Screw keeps the value, and the old items are still locked at the old price.

#### POAM-116 — Revise the bid
- **Who:** Vendor A · **Priority:** P0
- **Steps:** After submitting, click **Revise**, change Screw and submit again.
- **What should happen:** Works. The old items still can't be changed.

#### POAM-117 — Regret a new item
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Regret Screw (if regret is enabled).
- **What should happen:** Works for Screw. There's **no** regret option on the old items.

#### POAM-118 — Select-all, copy-paste and fill-down
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Click select-all, paste a value across all rows, and drag-fill down across the old rows.
- **What should happen:** The old rows never change.

#### POAM-119 — Other vendor buttons
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Use **Ask a query / Clarification**, **Chat**, **View bid history**, **Download event attachments** and **Withdraw bid** (if allowed).
- **What should happen:** All of them work as on a normal event.

---

## 7. Vendor B (new) and Vendor C (old loser) — bidding and privacy

#### POAM-120 — B bids on the new items only, and it goes through
- **Who:** Vendor B · **Priority:** P0
- **Steps:** B accepts the T&C, opens **Place Bid**, fills Screw and submits.
- **What should happen:** The bid is accepted. **Watch for the error "These line items are carried over… cannot be priced again"**: if it appears, the vendor screen is sending the locked rows and this is a **bug** (risk #1).

#### POAM-121 — C bids on the new items only, and it goes through
- **Who:** Vendor C · **Priority:** P0
- **Steps:** Same as POAM-120, as C.
- **What should happen:** Same: accepted, with no 1156 error.

#### POAM-122 — B sees no old prices at all
- **Who:** Vendor B · **Priority:** P0
- **Steps:** Look at the old rows on B's sheet. Also open the browser's Network tab and search the event responses for A's old price number.
- **What should happen:** The old rows are locked and show **no price** (blank). A's price appears nowhere: not on screen, not in the downloaded sheet, not in the API response.

#### POAM-123 — C sees only their own old price, never A's
- **Who:** Vendor C · **Priority:** P0
- **Steps:** Look at the old rows on C's sheet.
- **What should happen:** The old rows are locked. They show **C's own losing price** from the original event (this is the current code behaviour; confirm with product that it's wanted). They must **never** show A's winning price.

#### POAM-124 — No vendor can see another vendor's bid on the amendment event
- **Who:** A, B, C · **Priority:** P0
- **Steps:** All three bid on Screw. Each vendor then checks their sheet, rank/L1 display, bid history, the downloaded sheet and the Network tab.
- **What should happen:** Each vendor sees only their own prices. Rank shows only if the event is set to show rank. No other vendor's name or price appears.

#### POAM-125 — The API response has no hidden data from other vendors
- **Who:** Vendor B · **Priority:** P0
- **Steps:** In the Network tab, open the event/trade response and search for `prior_bids`, `prior_vendor_uuid` and `prior_fields`.
- **What should happen:** `prior_bids` and `prior_vendor_uuid` aren't present for a vendor. `prior_fields`, if present, contains only B's own data.

#### POAM-126 — B's currency isn't locked
- **Who:** Vendor B · **Priority:** P1
- **Steps:** Open **Place Bid**.
- **What should happen:** B can choose any allowed currency, because B has no old bid to lock to.

#### POAM-127 — C's currency is locked to C's old currency
- **Who:** Vendor C · **Priority:** P1
- **Before you start:** C bid in INR on the original.
- **Steps:** Open **Place Bid**.
- **What should happen:** Locked to INR, with no pencil.

#### POAM-128 — Old rows are read-only for B and C too
- **Who:** B, C · **Priority:** P0
- **Steps:** Try editing an old row, and try uploading a sheet with prices on the old rows.
- **What should happen:** Not possible. The upload ignores those rows.

#### POAM-129 — B or C sends a price for an old item through the API (security)
- **Who:** Vendor B · **Priority:** P1
- **Steps:** Replay the submit request with a price added for Bolt.
- **What should happen:** Refused (1156), or the price for Bolt is dropped. It must never be stored as B's bid on Bolt.

#### POAM-130 — Vendor A can't overwrite the old price through the API (security)
- **Who:** Vendor A · **Priority:** P1
- **Steps:** Replay A's submit with Bolt's price changed to 1.
- **What should happen:** The server keeps A's **old** price for Bolt (it overwrites locked cells with the old values).

#### POAM-131 — The V2 bid page lets A, B and C submit
- **Who:** A, B, C on the V2 bid page · **Priority:** P0
- **Before you start:** Use a vendor or event that opens the V2 bid page. Make an old row have an empty required field (for example delivery date).
- **Steps:** Fill Screw and submit.
- **What should happen:** It submits. If it says a required field is missing on an old row (which can't be edited), that's a **bug** (risk #3).

#### POAM-132 — Auction stage with locked items
- **Who:** A, B, C · **Priority:** P1
- **Before you start:** D5 amendment, auction stage live.
- **Steps:** All three bid on Screw in the live auction.
- **What should happen:** Bids, decrements and rank work for Screw. The old items are locked for everyone, and their prices don't count against B's or C's rank.

#### POAM-133 — Service event: vendor bidding on activities
- **Who:** Vendor A, B · **Priority:** P0
- **Before you start:** D3 amendment.
- **Steps:** Open the bid page.
- **What should happen:** Old activities are locked (A sees their own old prices; B sees blank). New activities can be bid on, and submit works.

---

## 8. Buyer during the live amendment event

#### POAM-140 — Comparison sheet shows old items as "Locked"
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open the comparison / awarding sheet.
- **What should happen:** Old rows show **Locked**, and their award checkbox is disabled. New rows can be selected. For a service event, if every activity under a service is locked, the service shows **Locked**.

#### POAM-141 — The buyer sees all vendors' bids side by side
- **Who:** Buyer · **Priority:** P0
- **Steps:** Look at Screw's row in the comparison.
- **What should happen:** A's, B's and C's prices all show. The old rows show A's old price.

#### POAM-142 — Surrogate bid for Vendor A
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open **Add bid on behalf of** Vendor A.
- **What should happen:** The old rows are pre-filled with A's old price and fields, and are locked. The currency is fixed to A's old currency (the dropdown is disabled). Fill Screw and submit, and it works.

#### POAM-143 — Surrogate bid for Vendor B
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open a surrogate bid for B.
- **What should happen:** The old rows are locked and **not** filled with A's price. Fill Screw and submit, and it works.

#### POAM-144 — Surrogate bid with every row locked
- **Who:** Buyer · **Priority:** P2
- **Steps:** Using an amendment where the only new line was removed before publish (if possible), open a surrogate bid.
- **What should happen:** **Submit** is disabled. This is by design, because there's nothing to bid on.

#### POAM-145 — Counter offer skips old items
- **Who:** Buyer · **Priority:** P1
- **Steps:** Send a counter offer to A.
- **What should happen:** Only new items can take a counter value, and old items aren't touched. A accepts or rejects, and that works.

#### POAM-146 — Price cap modal
- **Who:** Buyer · **Priority:** P2
- **Steps:** Open **Add price cap**.
- **What should happen:** Old rows are read-only and new rows can be set.

#### POAM-147 — Technical bid on behalf of a vendor
- **Who:** Buyer · **Priority:** P1
- **Steps:** Add a technical bid for B.
- **What should happen:** Locked sections aren't offered, and new sections can be filled.

#### POAM-148 — Bid upload by the buyer
- **Who:** Buyer · **Priority:** P2
- **Steps:** Upload a bid sheet on behalf of a vendor, with values on the old rows.
- **What should happen:** The old rows are ignored.

#### POAM-149 — Live-event buttons
- **Who:** Buyer · **Priority:** P1
- **Steps:** Use **Extend time**, **Request revised bid**, **Add vendor mid-event**, **Send reminder**, **Convert RFQ to auction**, **Close early** and **Technical evaluation / scoring**.
- **What should happen:** All of them work as on a normal event, and old items stay locked through each one.

#### POAM-150 — The surrogate drawer's currency lock really applies
- **Who:** Buyer · **Priority:** P1
- **Steps:** Open the surrogate bid for A and look at the currency field.
- **What should happen:** Fixed to A's old currency. If it can be changed, it's a bug (risk #2).

#### POAM-151 — Reports
- **Who:** Buyer · **Priority:** P2
- **Steps:** Download the comparison report, the QCS / Master QCS and the awarding proposal report.
- **What should happen:** Old rows are marked or shown with the old prices, new rows with the new bids. There are no errors and no blank files.

#### POAM-152 — The buyer can't award the old items again
- **Who:** Buyer · **Priority:** P0
- **Steps:** In the awarding sheet, try to tick an old row.
- **What should happen:** It's disabled and shows "Locked".

---

## 9. Awarding — every combination

In each case, "**amended**" means the same PO number now has the new lines added. "**New PO**" means a separate PO
with its own number.

#### POAM-200 — All new items to Vendor A → the original PO is amended
- **Who:** Buyer · **Priority:** P0
- **Steps:** Award Screw (and Rivet) to A, then submit and approve the award proposal.
- **What should happen:** **No new PO.** The original PO (same number) now has Bolt, Nut, Washer, Screw and Rivet. The new lines get the next PO line numbers (for example 40 and 50 if the old ones were 10/20/30; the step comes from the company setting, default 10). The PO total and quantity go up by the new lines only. The old lines are unchanged.

#### POAM-201 — All new items to Vendor B → a new PO for B
- **Who:** Buyer · **Priority:** P0
- **Steps:** Award Screw to B.
- **What should happen:** A **new PO** is created for B with Screw only. A's original PO is **unchanged**.

#### POAM-202 — All new items to Vendor C → a new PO for C
- **Who:** Buyer · **Priority:** P0
- **Steps:** Award Screw to C.
- **What should happen:** A new PO for C, with Screw only. A's PO is unchanged.

#### POAM-203 — Split: Screw to A, Rivet to B
- **Who:** Buyer · **Priority:** P0
- **Steps:** Award Screw to A and Rivet to B in one proposal.
- **What should happen:** A's original PO is **amended** with Screw. A **new PO** is created for B with Rivet. Nobody gets both items.

#### POAM-204 — Split across three: Screw to A, Rivet to B, Pin to C
- **Who:** Buyer · **Priority:** P1
- **What should happen:** A's PO is amended with Screw, plus a new PO for B (Rivet) and a new PO for C (Pin).

#### POAM-205 — Partial quantity of one item: Screw qty 50 split 30 to A and 20 to B
- **Who:** Buyer · **Priority:** P0
- **Steps:** Use quantity split on Screw.
- **What should happen:** A's PO is amended with Screw ×30, and B's new PO has Screw ×20. The quantities add up to 50 and the amounts match each vendor's price.

#### POAM-206 — Only part of the new items are awarded now
- **Who:** Buyer · **Priority:** P0
- **Steps:** Award Screw to A now and leave Rivet un-awarded.
- **What should happen:** A's PO is amended with Screw only. Rivet stays open for a later award.

#### POAM-207 — Award the rest later (second tranche)
- **Who:** Buyer · **Priority:** P0
- **Steps:** After POAM-206, award Rivet to A in a second proposal.
- **What should happen:** The **same** original PO is amended again with Rivet, and the history shows **two** revisions. Screw isn't added twice.

#### POAM-208 — Second tranche goes to a different vendor
- **Who:** Buyer · **Priority:** P1
- **Steps:** After POAM-206, award Rivet to B.
- **What should happen:** A new PO for B with Rivet. A's PO keeps only the Screw amendment.

#### POAM-209 — Award proposal with old and new items ticked together
- **Who:** Buyer · **Priority:** P1
- **Steps:** Via the API (the UI disables it), send an award that includes Bolt and Screw.
- **What should happen:** Bolt is ignored and only Screw is awarded.

#### POAM-210 — Award proposal with only old items
- **Who:** Buyer · **Priority:** P1
- **Steps:** Via the API, award only Bolt.
- **What should happen:** Refused: "Locked line items cannot be awarded. Select at least one line item that is open for awarding."

#### POAM-211 — Award goes through an approval workflow
- **Who:** Buyer + approver · **Priority:** P0
- **Steps:** Submit the award proposal and the approver **approves** it.
- **What should happen:** The PO is amended (or a new one created) **only after approval**. Before approval, the PO is untouched.

#### POAM-212 — Award approval rejected
- **Who:** Approver · **Priority:** P0
- **Steps:** The approver **rejects** the proposal.
- **What should happen:** The PO is untouched and no new PO is created. The buyer can re-award.

#### POAM-213 — Award with PO form fields
- **Who:** Buyer · **Priority:** P1
- **Steps:** While awarding, fill the PO form (payment terms, delivery and so on).
- **What should happen:** Fields carried from the original PO are pre-filled. On the amended PO, the global PO fields are merged and don't wipe the original's fields.

#### POAM-214 — Currency of the amended PO
- **Who:** Buyer · **Priority:** P0
- **Steps:** Look at the amended PO.
- **What should happen:** Same currency as the original. Totals aren't mixed across currencies.

#### POAM-215 — Silent fallback to a new PO (risk #4)
- **Who:** Buyer · **Priority:** P1
- **Before you start:** Cancel or close A's original PO **after** the amendment is published but **before** the award.
- **Steps:** Award Screw to A.
- **What should happen:** Because the original PO isn't active any more, a **new PO** is created for A. Check whether the buyer is told why. If there's no message at all, log it as a UX bug.

#### POAM-216 — Feature switched off between publish and award
- **Who:** Buyer · **Priority:** P2
- **Steps:** Turn `po_amendment_sourcing_enabled` off, then award Screw to A.
- **What should happen:** A **new PO** for A (no amendment). Turn the setting back on afterwards.

#### POAM-217 — The same award saved twice (double click)
- **Who:** Buyer · **Priority:** P2
- **Steps:** Double-click **Award / Submit**, or retry after a slow network.
- **What should happen:** The PO is amended **once**, with no duplicate Screw line.

#### POAM-218 — Service PO: award new activities to A
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D3 amendment.
- **What should happen:** The original service PO is amended with the new activities, and the old activities are unchanged.

#### POAM-219 — Service PO: award new services to B
- **Who:** Buyer · **Priority:** P0
- **What should happen:** A new service PO for B.

#### POAM-220 — Service PO: split activities between A and B
- **Who:** Buyer · **Priority:** P1
- **What should happen:** A's service PO is amended with A's activities, and B gets a new PO with B's.

#### POAM-221 — PR-backed PO: award new PR lines to A
- **Who:** Buyer · **Priority:** P0
- **Before you start:** D2 amendment.
- **What should happen:** A's PO is amended. Those PR lines show as ordered and their open quantity drops to 0 (or by the awarded amount).

#### POAM-222 — PR-backed PO: award a PR line partly
- **Who:** Buyer · **Priority:** P1
- **Steps:** Award 60 out of a PR line's 100.
- **What should happen:** The PR shows 40 still open (if the company uses "open PR quantity on partial order").

#### POAM-223 — No award: the event just ends
- **Who:** Buyer · **Priority:** P1
- **Steps:** Let the amendment event close without awarding.
- **What should happen:** The original PO is unchanged and no new PO is created. The buyer can start a **new** amendment (see POAM-243).

#### POAM-224 — Original split PO (D4): amend A's PO, award to C
- **Who:** Buyer · **Priority:** P1
- **Before you start:** D4. A holds a PO for Bolt, and C holds a PO for Nut.
- **Steps:** Amend **A's** PO, add Screw, and award Screw to **C**.
- **What should happen:** A **new PO** for C. C's existing Nut PO is **not** changed, because only the PO that was amended can be amended.

---

## 10. Many amendments (versions .1, .2, .3 …)

#### POAM-240 — Second amendment after the first was awarded
- **Who:** Buyer · **Priority:** P0
- **Before you start:** POAM-200 done (A's PO amended with Screw).
- **Steps:** Click **Amend** on the same PO again and add Gear.
- **What should happen:** A ".2" draft is created **from the .1 event**. Bolt, Nut, Washer **and Screw** are locked, and Gear is open.

#### POAM-241 — Old price on .2 for an item first bought in .1
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Open **Place Bid** on .2.
- **What should happen:** Screw shows the price A won in **.1**, and Bolt, Nut and Washer show the original prices. All four are locked.

#### POAM-242 — Amend while .1 is still live (not awarded)
- **Who:** Buyer · **Priority:** P0
- **Steps:** With .1 published and running, click **Amend** on the PO.
- **What should happen:** Refused: "The previous amendment for this purchase order has not finished yet…"

#### POAM-243 — Amend after .1 ended with no award
- **Who:** Buyer · **Priority:** P1
- **Steps:** After POAM-223, click **Amend**.
- **What should happen:** Allowed. The new draft is built correctly, and the items from the abandoned .1 aren't treated as bought.

#### POAM-244 — Amend while .1 is in award approval
- **Who:** Buyer · **Priority:** P1
- **Steps:** The .1 award is waiting for approval and the bid time has ended. Click **Amend**.
- **What should happen:** Refused (an amendment is still running) until the approval is finished.

#### POAM-245 — Three amendments in a row (.1 → .2 → .3)
- **Who:** Buyer · **Priority:** P0
- **Steps:** Amend, award to A; amend, award to A; amend, award to A. Each time, add one new item.
- **What should happen:** One PO number throughout, with 3 entries in its history. Line numbers keep increasing and are never reused. All T&C and attachments are still there on .3, and the currency is the same throughout.

#### POAM-246 — Mixed chain: .1 to A (amend), .2 to B (new PO), .3 to A (amend)
- **Who:** Buyer · **Priority:** P0
- **What should happen:** A's PO is amended twice (.1 and .3). B gets one new PO from .2. On .3, the item B won in .2 is locked. Check whose price A and B each see on it: A must **not** see B's price.

#### POAM-247 — Amend the new PO that B got from .2
- **Who:** Buyer · **Priority:** P1
- **Steps:** Open B's new PO and click **Amend**.
- **What should happen:** Either it's allowed (its own chain, with B as the PO vendor) or it's refused clearly. Record which. It must not change A's chain.

#### POAM-248 — T&C changed in .1 carries the changed version into .2
- **Who:** Buyer · **Priority:** P1
- **Steps:** Edit a T&C clause in .1 before publishing, then create .2 later.
- **What should happen:** .2 has the **.1** wording, not the original v1 wording.

#### POAM-249 — Discard .2 draft, then make a new .2
- **Who:** Buyer · **Priority:** P2
- **What should happen:** It works. The version numbering stays sensible and there are no duplicate ".2" events in the list.

---

## 11. The PO after amendment

#### POAM-260 — The amended PO page
- **Who:** Buyer · **Priority:** P0
- **Steps:** Open the amended PO.
- **What should happen:** It shows all lines (old and new), the new total and the amendment history (which event version, when, and what was added).

#### POAM-261 — PO PDF
- **Who:** Buyer · **Priority:** P0
- **Steps:** Download the PO PDF.
- **What should happen:** It includes the new lines and totals, and shows the amendment or revision if the template supports it.

#### POAM-262 — The vendor sees the amended PO
- **Who:** Vendor A · **Priority:** P0
- **Steps:** Open the PO on the supplier portal.
- **What should happen:** The new lines and totals are visible.

#### POAM-263 — Vendor acknowledgement of the amended PO
- **Who:** Vendor A · **Priority:** P2
- **Steps:** If PO acknowledgement is on, check whether A is asked to acknowledge again.
- **What should happen:** Record the behaviour and confirm it with product.

#### POAM-264 — PO email
- **Who:** Vendor A · **Priority:** P2
- **What should happen:** A receives an email that the PO was amended, with the right PO number.

#### POAM-265 — ERP sync of the amendment
- **Who:** Buyer / integration · **Priority:** P1
- **Before you start:** A company with an ERP integration template that has a "PO amended" trigger.
- **Steps:** Amend and award to A.
- **What should happen:** Only the **new** lines are sent to the ERP as an amendment, and a second tranche sends only its own lines. Nothing is sent twice.

#### POAM-266 — DMS upload
- **Who:** Integration · **Priority:** P3
- **What should happen:** If PO DMS is configured, the amended PO document is uploaded once per revision.

#### POAM-267 — GRN and invoices on old lines still work
- **Who:** Buyer · **Priority:** P1
- **Before you start:** Create a GRN or invoice against Bolt **before** amending.
- **Steps:** Amend and award, then create another GRN or invoice on Bolt and on Screw.
- **What should happen:** Bolt's received and invoiced quantities aren't reset or doubled, and Screw can be received or invoiced.

#### POAM-268 — PR quantities after amendment
- **Who:** Buyer · **Priority:** P1
- **Before you start:** A company with PR integration on.
- **What should happen:** PR line quantities are closed once for the new lines, and the old lines' quantities aren't closed a second time.

#### POAM-269 — The PO list and search
- **Who:** Buyer · **Priority:** P2
- **Steps:** Search for the PO number in the PO list, and filter by vendor.
- **What should happen:** The PO is found once, with the new total.

---

## 12. Things that must still work (regression)

#### POAM-280 — A normal event with no amendment
- **Who:** Buyer, vendors · **Priority:** P0
- **Steps:** Create, publish, bid, award and generate the PO on a fresh normal event.
- **What should happen:** Everything works as before. There are no "Locked" labels, nothing is read-only that shouldn't be, and the currency pencil shows where it used to.

#### POAM-281 — Normal event versioning (non-PO "new version")
- **Who:** Buyer · **Priority:** P1
- **Steps:** Create a new version of a live event the normal way (not via PO Amend).
- **What should happen:** No line is locked, and vendors can re-quote everything.

#### POAM-282 — The old PO amendment (editing a PO without an event)
- **Who:** Buyer · **Priority:** P1
- **Steps:** If your tenant has the older "amend PO with approval" flow, use it.
- **What should happen:** It still works.

#### POAM-283 — Language: Indonesian
- **Who:** Buyer · **Priority:** P3
- **Steps:** Switch to Bahasa Indonesia.
- **What should happen:** The Locked label reads "Terkunci".

---

## Quick coverage map

| Area | Cases |
|---|---|
| Amend button and who can use it | 001–010 |
| Picking products, PR lines and services | 020–036 |
| Draft .1, carry-over (T&C, attachments, stages), every create-screen button | 040–063 |
| Discarding a draft | 070–075 |
| Publish | 080–085 |
| Vendor A, every screen and button | 100–119 |
| Vendors B and C, bidding and privacy | 120–133 |
| Buyer during the live event | 140–152 |
| Award combinations (same vendor, new vendor, split, partial, tranches, approvals, services, PR) | 200–224 |
| Many amendments (.1/.2/.3, chains, races) | 240–249 |
| PO after amendment (PDF, vendor view, ERP, GRN, PR) | 260–269 |
| Regression | 280–283 |

**Run these first (P0 smoke, about 2 hours):** 001, 020, 041, 042, 048, 080, 107, 109, 112, 120, 122, 124, 140, 142,
200, 201, 203, 205, 207, 211, 240, 241, 242, 245, 260, 280.
