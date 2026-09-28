# How to do Cost Breakdown as a Vendor?

Source: Notion Knowledge Base — How to do Cost Breakdown as a Vendor? (https://app.notion.com/p/41592226c8b282d8ad86817e533d809a) · last edited 2026-04-12
Section: Vendor Dashboard

Cost Breakdown Mode allows vendors to submit a single total value at the time of bidding and later break it down line-item-wise after the auction ends. This is useful in events where buyers want to capture negotiated lump-sum values during live auctions but still require transparency into per-item pricing later for PO, audit, or comparison purposes. Once cost breakdown is submitted, vendors cannot revise it unless the buyer reopens the window or shares counteroffers.

## Step by Step Process — Cost Breakdown as a Vendor

[image: auction screen in Cost Breakdown Mode]

1. During the auction, vendors will see a message:
   *"You are bidding on the total lot amount we received from your RFQ Quotes. A request for line item-wise cost breakdown will be triggered once the auction submission time ends."*
   [image: cost breakdown message on the auction screen]
2. Vendors can only bid on the Sum Total. For example, for a value of ₹11,204.34:
   [image: Sum Total bid field]
3. They can reduce their bid by two means by clicking on the dropdown next to "Fixed Value":
   - They can bid by reducing it by **Fixed Value**, Eg: ₹204.34
   - Select **"Percentage"** and apply a discount on the Sum Total. Eg: 10%
   [image: Fixed Value / Percentage dropdown]
4. After placing their bid and clicking **Revise Bid**, the vendor sees their new current bid reflecting the reduction.
   [image: current bid after Revise Bid]
5. Once the auction submission time ends, the **Cost Breakdown Time (CBD time)** begins automatically.
   [image: Cost Breakdown Time countdown]
6. Vendors will now be prompted to break down their submitted total bid across line items:
   [image: line-item breakdown screen]

   The system already fills in the auto breakdown (sufficient discounts according to pro rata distribution) for the vendor.
   - They can manually change the discount applied to each price
   - They can **manually edit** each price
   [image: editable per-item discount and price]
7. The system ensures that **no individual line item** can have a price **greater than the RFQ value** and the **total must match the submitted auction bid**.
8. If a vendor tries to exceed limits, an error message will be shown, and the system will indicate how much needs to be reduced further.
   [image: error message indicating the amount still to reduce]
9. Once the breakdown is completed, the vendor clicks **Submit Cost Breakdown**.
10. A confirmation dialog appears:
    *"This is the final submission for item prices. Once submitted, you won't be able to change these item prices."*
    [image: final-submission confirmation dialog]
11. Upon clicking **Yes, Submit**, the cost breakdown is locked. Vendors now see a confirmation message indicating their cost breakdown has been successfully submitted and justified.
    [image: cost breakdown submitted confirmation]
