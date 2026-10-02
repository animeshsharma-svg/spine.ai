# How to Run a Knockout Auction

Source: Notion Knowledge Base — How to Run a Knockout Auction (https://app.notion.com/p/51c92226c8b28281a485810edb48fab9) · last edited 2026-04-21
Section: Sourcing › Auction

Knockout Auction is a competitive bidding strategy where vendors receive fixed offers in multiple rounds with defined **starting price, tick size, and time differences**. Vendors must choose to either **accept or reject** the offer in each round. Only those who accept the previous offer proceed to the next round, creating a **last-man-standing** scenario.

## Steps to Enable Serial Bidding — Run a Knockout Auction

(The heading is as written in Notion; the steps below set up a Knockout auction.)

1. Create a new event in Procol.
   [image: create new event]
2. In the **Event Type** dropdown, select **Auction**.
   [image: Event Type dropdown]
   [image: Auction selected]
3. Select The "Traffic Light" Auction Strategy
   (Written this way in Notion — apparently copied from the Traffic Light article; this article is about the Knockout strategy.)
   [image: strategy selection]
4. Choose on which entity should offers be based on.
   [image: offers based on]
5. Add the Starting price, Tick Size and Time difference between each consecutive offer,
   [image: Starting price, Tick Size, Time difference]
6. Click on Save and Publish the Event
   [image: Save and Publish]
7. Once published, the auction screen under the **Responses tab** will show:
   - Current round details (offer amount, tick size, and time difference).
   - Upcoming offers.
   - List of Bidders
   [image: Responses tab]
8. **Vendor Participation**
   - Each round presents a fixed offer (e.g., ₹X, then ₹X - Tick Size, then ₹X - Tick).
   - Vendors can either **Accept** or **Not Accept**.
   [image: vendor Accept / Not Accept]
   - Only vendors who **accept the current offer** move forward to the next round.
   [image: vendors moving to next round]
9. **Round Controls for Buyers**
   [image: round controls]
   - Extend time for the ongoing round by clicking the **plus button (+)** and selecting additional time.
   [image: plus button]
   [image: additional time selection]
   - Update **tick size** and **time difference** by editing the fields and clicking **Update**.
   [image: edit tick size and time difference]
   [image: Update]
10. **Awarding the Bid**
    [image: awarding]
    - On the right side, view the list of bidders still in the running.
    [image: bidders still in the running]
    - Click **Select Bid** on the vendor you want to award.
    [image: Select Bid]
    - A **full-screen awarding window** opens to confirm the proposal amount.
    [image: full-screen awarding window]
    - Choose an **approval workflow** based on conditions.
    [image: approval workflow]
    - Click **Next → Review → Request Approval**.
    [image: Request Approval]
11. **Post-Award Process**
    - Once the bid is sent for approval the system completes the awarding process.
    [image: awarding complete]
    - A **Purchase Order (PO)** is generated automatically after approval
    [image: generated PO]

**Best Use Case:** Knockout Auctions are ideal when you want to progressively eliminate vendors round by round, ensuring only the most competitive bidders remain till the end.
