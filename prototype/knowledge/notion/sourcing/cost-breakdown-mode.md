# Cost Breakdown Mode

Source: Notion Knowledge Base — Cost Breakdown Mode (https://app.notion.com/p/79792226c8b282488053817b07f0b667) · last edited 2026-04-21
Section: Sourcing › Auction

Cost Breakdown Mode allows vendors to submit a single total value at the time of bidding and later break it down line-item-wise after the auction ends. This is useful in events where buyers want to capture negotiated lump-sum values during live auctions but still require transparency into per-item pricing later for PO, audit, or comparison purposes. Once cost breakdown is submitted, vendors cannot revise it unless the buyer reopens the window or shares counteroffers.

## Persona — Cost Breakdown Mode

**Buyer / Purchaser** – Responsible for converting an RFQ to Auction, configuring auction rules, and ensuring vendors follow structured quoting. This feature helps buyers receive item-level pricing from vendors while allowing total bidding flexibility during the auction stage.

## Step-by-Step Process — Cost Breakdown Mode

1. Start by navigating to the **RFQ you want to convert to an Auction**.
2. Click on **"Convert to Auction"** to begin the process.

> **Note.** Want to know how exactly to convert to Auction? Go to the below page → (link to the Convert to Auction article)

3. You'll be taken to the auction creation page.
   [image: auction creation page]
4. Click on the **Event Type** with "Rank on line" written below it
   [image: Event Type with Rank on line]
5. Below the event type dropdown, find the checkbox for **"Enable Cost Breakdown Mode"**.
   [image: Enable Cost Breakdown Mode checkbox]
6. Hover over the eye icon beside this checkbox to read the tooltip: "Choosing this option will enable vendors to submit their responses with a single value. Vendors will be asked to fill the justified prices in the allotted CBD Time after the bidding ends."
   [image: tooltip]
7. Select the checkbox to **enable cost breakdown**. This allows vendors to place a lot-level bid during the auction and submit line-item-wise pricing during the CBD (Cost Breakdown) window.
   [image: checkbox selected]
8. Configure other auction settings as needed and **launch the auction**.
9. During the Submission time, Vendor's will be bidding on the Sum Total only. All Submissions will appear as Auto-breakdown bids. (Auto breakdown happens on pro-rata basis)
   [image: auto-breakdown bids]
   [image: The Red highlighted number is the Total Amount submitted via bidding by the vendor]
10. Once the Submission time is over, the Cost Breakdown Time automatically starts.
    [image: Cost Breakdown Time]
11. As a buyer you can extend the Cost Breakdown Time as well.
    [image: extend Cost Breakdown Time]
12. Once Cost Breakdown has been submitted by the Vendor you can now see the **"Supplier Submitted CB"** tag on his bid.
    [image: Supplier Submitted CB tag]

## On the Vendor's Screen — Cost Breakdown Mode

[image: vendor auction screen]

1. During the auction, vendors will see a message:
   [image: vendor message]
   *"You are bidding on the total lot amount we received from your RFQ Quotes. A request for line item-wise cost breakdown will be triggered once the auction submission time ends."*
2. Vendors can only bid on the Sum Total. For example, for a value of ₹11,204.34:
   [image: Sum Total bid]
3. They can reduce their bid by two means by clicking on the dropdown next to "Fixed Value" :
   - They can bid by reducing it by **Fixed Value** , Eg: ₹204.34
   - Select **"Percentage"** and apply a discount on the Sum Total. Eg: 10%
   [image: Fixed Value / Percentage dropdown]
   [image: fixed value reduction]
   [image: percentage reduction]
4. After placing their bid and clicking **Revise Bid**, the vendor sees their new current bid reflecting the reduction.
   [image: revised current bid]
5. Once the auction submission time ends, the **Cost Breakdown Time (CBD time)** begins automatically.
   [image: CBD time started]
6. Vendors will now be prompted to break down their submitted total bid across line items:
   [image: cost breakdown prompt]
   [image: cost breakdown table]
   The system already fills in the auto breakdown (sufficient discounts according to pro rata distribution) for the vendor.
   - They can manually change the discount applied to each price
   - They can **manually edit** each price
   [image: manual edit of prices]
7. The system ensures that **no individual line item** can have a price **greater than the RFQ value** and the **total must match the submitted auction bid**.
   [image: validation]
8. If a vendor tries to exceed limits, an error message will be shown, and the system will indicate how much needs to be reduced further.
   [image: error message with amount to reduce]
9. Once the breakdown is completed, the vendor clicks **Submit Cost Breakdown**.
   [image: Submit Cost Breakdown]
10. A confirmation dialog appears:
    *"This is the final submission for item prices. Once submitted, you won't be able to change these item prices."*
    [image: confirmation dialog]
11. Upon clicking **Yes, Submit**, the cost breakdown is locked. Vendors now see a confirmation message indicating their cost breakdown has been successfully submitted and justified.
    [image: cost breakdown submitted confirmation]
