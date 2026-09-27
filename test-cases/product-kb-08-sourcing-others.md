# Product KB test cases — Sourcing › Others

Generated from the Procol Notion Knowledge Base (help-centre articles) — each case is grounded in the article it traces to. Source pages are read-only; re-derive from Notion rather than editing facts here.

## 1. Customising your QCS View

#### PRD-KBSRC-645 — Switch the QCS between vertical and horizontal view

- **Why it matters.** Layout choice affects readability of vendor comparisons; the toggle must switch the layout without losing data.
- **Setup.** Buyer, Technical Evaluator or Category Manager reviewing vendor quotations; an event with vendor quotes in the QCS.
- **Steps.**
  1. Open the QCS.
  2. Click the layout toggle button.
  3. Click the layout toggle button again.
- **Expected.** The QCS switches between vertical and horizontal views.
- **Oracle.** The QCS layout changes orientation on each click with the same vendor data shown.
- **Trace.** P3 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

#### PRD-KBSRC-646 — Full screen mode expands the QCS

- **Why it matters.** Full screen supports deep analysis on large monitors during evaluation meetings.
- **Setup.** Buyer, Technical Evaluator or Category Manager; an event with vendor quotes in the QCS.
- **Steps.**
  1. Open the QCS.
  2. Click the **full screen icon**.
- **Expected.** The QCS expands across the display.
- **Oracle.** The QCS occupies the full display area.
- **Trace.** P3 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

#### PRD-KBSRC-647 — Zoom control changes QCS text size

- **Why it matters.** Zoom is the stated readability control for dense comparisons.
- **Setup.** Buyer, Technical Evaluator or Category Manager; an event with vendor quotes in the QCS.
- **Steps.**
  1. Open the QCS.
  2. Use the **zoom control** to zoom in.
  3. Use the **zoom control** to zoom out.
- **Expected.** Text size increases on zoom in and decreases on zoom out.
- **Oracle.** QCS text renders larger after zoom in and smaller after zoom out.
- **Trace.** P3 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

#### PRD-KBSRC-648 — View by Vendor shows a quote card per vendor

- **Why it matters.** Vendor mode lets evaluators review each quote in isolation instead of the comparative table.
- **Setup.** Buyer, Technical Evaluator or Category Manager; an event with quotes from several vendors.
- **Steps.**
  1. Open the QCS.
  2. Click **View by Product** to open the dropdown with **Vendor** and Product.
  3. Click on Vendor.
- **Expected.** The QCS shows a vendor-specific quote breakdown with a dedicated quote card for each vendor instead of the comparative table.
- **Oracle.** One quote card per vendor is displayed; the comparative table is not shown.
- **Trace.** P2 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

#### PRD-KBSRC-649 — Hide Fields removes chosen columns from the QCS

- **Why it matters.** Hiding irrelevant columns (GST, Quantity, Delivery Terms) focuses evaluation on relevant fields; hidden columns must actually disappear.
- **Setup.** Buyer, Technical Evaluator or Category Manager; an event whose QCS has GST, Quantity and Delivery Terms columns.
- **Steps.**
  1. Open the QCS.
  2. Use the **Hide Fields** option.
  3. Hide GST, Quantity and Delivery Terms.
- **Expected.** The chosen columns are hidden from the QCS.
- **Oracle.** GST, Quantity and Delivery Terms columns are no longer shown; other columns remain.
- **Trace.** P2 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

#### PRD-KBSRC-650 — Auto button resizes rows/columns to Small, Medium, Large or XL

- **Why it matters.** Size presets adapt the QCS to data density and screen space.
- **Setup.** Buyer, Technical Evaluator or Category Manager; QCS in horizontal view.
- **Steps.**
  1. Open the QCS in horizontal view.
  2. Click on the **Auto** button.
  3. Select each of **Small**, **Medium**, **Large** and **XL** in turn.
- **Expected.** Row height / column width changes to the selected size.
- **Oracle.** QCS row height or column width visibly changes for each option.
- **Trace.** P3 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

#### PRD-KBSRC-651 — Auto sizing is only available in horizontal view

- **Why it matters.** The article states the Auto button is **ONLY AVAILABLE IN HORIZONTAL VIEW**; showing it elsewhere would be a defect.
- **Setup.** Buyer, Technical Evaluator or Category Manager; an event with vendor quotes in the QCS.
- **Steps.**
  1. Open the QCS and switch to vertical view with the layout toggle.
  2. Look for the **Auto** button.
  3. Switch to horizontal view.
  4. Look for the **Auto** button.
- **Expected.** The Auto sizing option is not available in vertical view and is available in horizontal view.
- **Oracle.** Auto button absent (or unavailable) in vertical view; present with Small/Medium/Large/XL in horizontal view.
- **Trace.** P1 · automate-later · `fff92226c8b283f0b77f01742be479ea` · `customising-your-qcs-view` · Notion KB › Sourcing › Others › Customising your QCS View

## 2. How to Enable Vendor Masking?

#### PRD-KBSRC-652 — Buyer enables Vendor Masking on a live RFQ event

- **Why it matters.** Vendor masking eliminates bias and reduces collusion risk by hiding vendor identities during evaluation and negotiation — a compliance control.
- **Setup.** Buyer on a live RFQ event with at least two participating vendors.
- **Steps.**
  1. Go to the **RFQ** event screen where the event is live.
  2. Click the **Actions** button.
  3. Select **Enable Vendor Masking**.
- **Expected.** All vendor names are hidden until bidding ends and replaced with Vendor 1, 2, 3 … N.
- **Oracle.** Vendor names on the event screen/QCS read Vendor 1, Vendor 2, … instead of the real names.
- **Trace.** P0 · automate-later · `d6592226c8b283b28981014976204fd6` · `how-to-enable-vendor-masking` · Notion KB › Sourcing › Others › How to Enable Vendor Masking?

#### PRD-KBSRC-653 — Participants tab is hidden from buyers when masking is enabled

- **Why it matters.** The article states the Participants tab is hidden so buyers cannot see who has or hasn't participated; leaving it visible defeats masking.
- **Setup.** Buyer on a live RFQ or Auction event with Vendor Masking enabled.
- **Steps.**
  1. Open the event screen after enabling Vendor Masking.
  2. Look for the Participants tab.
- **Expected.** The Participants tab is hidden from the buyer.
- **Oracle.** No Participants tab is shown on the event screen for the buyer.
- **Trace.** P1 · automate-later · `d6592226c8b283b28981014976204fd6` · `how-to-enable-vendor-masking` · Notion KB › Sourcing › Others › How to Enable Vendor Masking?

#### PRD-KBSRC-654 — Vendor names stay masked until bidding ends

- **Why it matters.** The article scopes masking to "until bidding ends"; names leaking mid-bidding, or never returning afterwards, are both defects.
- **Setup.** Buyer on a live RFQ or Auction event with Vendor Masking enabled.
- **Steps.**
  1. While bidding is live, view vendor names on the event screen.
  2. Let bidding end.
  3. View vendor names again.
- **Expected.** Names remain as Vendor 1 … N throughout bidding; the masking applies only until bidding ends.
- **Oracle.** During bidding only Vendor 1 … N labels are visible; after bidding ends the tester checks whether real vendor names are shown.
- **Trace.** P1 · manual · `d6592226c8b283b28981014976204fd6` · `how-to-enable-vendor-masking` · Notion KB › Sourcing › Others › How to Enable Vendor Masking?

#### PRD-KBSRC-655 — Vendor Masking on a live Auction event

- **Why it matters.** The article states masking is available on the Auction Event screen as well as RFQ.
- **Setup.** Buyer on a live Auction event with at least two participating vendors.
- **Steps.**
  1. Go to the **Auction Event** screen where the event is live.
  2. Click the **Actions** button.
  3. Select **Enable Vendor Masking**.
- **Expected.** Vendor names are replaced with Vendor 1, 2, 3 … N until bidding ends.
- **Oracle.** Auction screen shows Vendor 1, Vendor 2, … instead of real names.
- **Trace.** P2 · automate-later · `d6592226c8b283b28981014976204fd6` · `how-to-enable-vendor-masking` · Notion KB › Sourcing › Others › How to Enable Vendor Masking?

## 3. How to enable Show Best Price?

#### PRD-KBSRC-656 — Buyer enables Show Best Prices and the QCS gains a best-price row

- **Why it matters.** Show Best Price exposes the current L1 price per line item, changing vendor bidding behaviour; the displayed value must be the true lowest bid.
- **Setup.** Buyer, Auction Owner or Sourcing Manager on an event with bids from several vendors on line items.
- **Steps.**
  1. Click the **Actions** button.
  2. Select **Show Best Prices**.
  3. Open the QCS.
- **Expected.** An extra row is added for each line item displaying the lowest bid across vendors.
- **Oracle.** Each line item in the QCS has an additional row whose value equals the lowest vendor bid for that line item.
- **Trace.** P1 · automate-later · `1dd92226c8b283428cf781dc0f0b52ab` · `how-to-enable-show-best-price` · Notion KB › Sourcing › Others › How to enable Show Best Price?

#### PRD-KBSRC-657 — Participating vendors see the exact best price per line item

- **Why it matters.** The article states the best price is visible to both buyers and participating vendors so vendors know the price to beat to become L1.
- **Setup.** Buyer has enabled **Show Best Prices** on an event; a participating vendor login.
- **Steps.**
  1. As a participating vendor, open the event.
  2. View the line items.
- **Expected.** The vendor sees the exact best price (lowest / L1 bid) for each line item.
- **Oracle.** The vendor's view shows the best price per line item, matching the buyer's best-price row.
- **Trace.** P1 · automate-later · `1dd92226c8b283428cf781dc0f0b52ab` · `how-to-enable-show-best-price` · Notion KB › Sourcing › Others › How to enable Show Best Price?

#### PRD-KBSRC-658 — Best price reflects the current lowest bid after a vendor rebids

- **Why it matters.** The feature shows the current lowest bid and vendors use it to update bids competitively; a stale best price misleads bidding.
- **Setup.** **Show Best Prices** enabled; at least two vendors have bid on a line item.
- **Steps.**
  1. Note the best price for a line item.
  2. As a vendor who is not L1, update the bid below the shown best price.
  3. As the buyer, view the best-price row in the QCS; as another vendor, view the best price.
- **Expected.** The best price updates to the new lowest bid for both buyer and vendors.
- **Oracle.** Best-price row and vendor-side best price both equal the new lower bid.
- **Trace.** P2 · manual · `1dd92226c8b283428cf781dc0f0b52ab` · `how-to-enable-show-best-price` · Notion KB › Sourcing › Others › How to enable Show Best Price?

## 4. English Auction (To be added)

_This article has no content yet in Notion — no test cases._
