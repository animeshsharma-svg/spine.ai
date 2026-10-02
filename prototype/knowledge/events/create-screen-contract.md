# The eRFX create screen — the contract, as the app actually enforces it

Everything here was established against the live application, and every item was
a defect in the automation before it was written down. This is the highest-value
document in the knowledge base for planning a create test: the ordering rules are
not guessable, and a plan that violates one fails in a way that looks like a
product bug.

## Ordering

1. **The template comes before the line items.** The toolbar `Items N` button
   that opens the "Manage Line Items" drawer is **inert until a template is
   chosen**, because the template defines the sheet schema items are added into.
   Clicking it first is a no-op and the run stalls with `Items 0`.
2. **The schedule must be committed.** The footer chip displays a default window
   ("Now - 02:33 am, 9th Sep (30 Mins)") which reads as already set. It is not
   persisted until **Save Schedule** is pressed in the drawer.
3. **Participants before publish.** The product's audience usually
   auto-populates once line items exist (154 vendors on clientA), but when it
   does not, the confirm modal says `Vendors invited: 0` and the event is
   unusable.
4. **A title is required.** Publishing without one is refused.

## Stage composition

Rules from `projectCreation.jsx` (`isValidStage`, `getDropdownMenu`,
`getTabBarExtraContent`):

- The screen arrives with **one default Auction stage**.
- The `+` menu offers only stages that are still valid: one already present is
  hidden, and **RFQ and Auction are mutually exclusive** ("Remove Auction to add
  RFQ").
- **Two stages maximum** — `+` disables at two.
- A tab's `⋮` **Delete is disabled while one stage remains**.

So RFQ-only takes four moves: add Technical (to unlock Delete) → delete Auction →
add RFQ → delete Technical. When reconciling, delete the stage that *blocks* what
you need, not the first extra one, or you ping-pong deleting the filler you just
added. After deleting a tab the panel can render blank; select the wanted tab to
force it to mount.

**RFQ→Auction cannot be composed at all.** It is a conversion: on a published
RFQ, Settings (`[data-testid="event-settings-button"]`) → "Convert to Auction" →
Continue, which opens the create screen in a **new tab** with
`isRfqToAuction=true&draftStageIds=…`.

## The pricing sheet

Cells are `sheet-cell-{row}-{key}`, row 0 being the header. The grid and the
template schema **name the same column differently**: the cell's `data-celltype`
is the column key (`buyer_hub`), the template's `input_type` is its kind
(`delivery_location`). Anything reading columns off the rendered sheet must
translate before deciding how to fill them.

Only some columns are creator-editable. On a Buy template the creator fills
`buyer_hub`; `price`, `participant_quantity`, `gst` and `total_amount` are
`aria-disabled` because vendors fill them. **Leaving the delivery location blank
makes the app refuse with "Sheet partially filled, please check again."** — and,
before that message existed on this build, made
`PATCH /api/event_groups/:id` return a 500. Filling only the columns the template
marks `field_type: "creator"` is not sufficient; sweep the rendered grid.

## Technical (RFP) stages

A technical stage has **one RFI section per line item plus a global one**:

```
Vendor Assessment   Template: Select Template   + Add Evaluator   (global)
AAC BLOCKS          Item Template: Select Template                (per line item)
BACK FILLING        Item Template: Select Template                (per line item)
```

- Each section needs its own template. Missing them does **not** block publish,
  so events go out with empty item questionnaires and nobody notices.
- The app rejects a row that has a **description but no question**
  (`isGlobalSectionEmpty` → "There are some errors in vendor specific sections,
  please check and try again"). Every grid also carries a legal trailing blank
  row with neither — that one is fine.
- **The evaluator is section-level on this build**, not per line item: there is a
  single `evaluator-add-button`, on the Vendor Assessment section
  (`rfpEvaluationOn: lot`). In `line` mode there would be one per item, so read
  the count from the DOM rather than assuming.
- The evaluator picker renders its search box as an **empty first option**, so
  the first row must be skipped, and its rows populate a moment after the panel
  becomes visible.

## Savings

The default `savingsColumn` is `{budget: "price"}` and validation requires that
widget to exist in the chosen template. A stage with **no template** therefore
fails with "Please select a valid column for savings" — which reads like a
savings bug and is actually a missing template.

## Traps for automation

- `/orders/quick-create` is **not** a project id. A redirect check of
  `/orders/[^/]+` treats the create screen itself as a published project, so a
  rejected publish passes. Exclude `quick-create|create|detail|new`.
- Dismissing distractions must never dismiss the drawer: its close button is
  `button.ant-drawer-close[aria-label="Close"]`, so a generic close/dismiss
  candidate slams shut the panel just opened.
- Option lists must be scoped to their own panel. A generic
  `[class*='dropdown']:visible li` matches the **left sidebar's 14 menu items**.
- Playwright auto-scrolls for a normal click but **not** for `force: true`, and
  retry paths force — so scroll explicitly or clicks land on nothing.
- `page.goto` must use `waitUntil: "domcontentloaded"`; this console holds
  long-lived connections open, so `load` may never fire.
