# How to Run a Dutch Auction.

Source: Notion Knowledge Base — How to Run a Dutch Auction. (https://app.notion.com/p/13292226c8b2821aa94c8125a45ae6aa) · last edited 2026-04-21
Section: Sourcing › Auction

Knockout Auction is a competitive bidding strategy where vendors receive fixed offers in multiple rounds with defined **starting price, tick size, and time differences**. Vendors must choose to either **accept or reject** the offer in each round. Only those who accept the previous offer proceed to the next round, creating a **last-man-standing** scenario.

(This intro is copied from the Knockout article in Notion; the steps below describe a Dutch auction.)

## Steps to Enable Serial Bidding — Run a Dutch Auction

(The heading is as written in Notion; the steps below set up a Dutch auction.)

1. Create a new event in Procol.
   [image: create new event]
2. In the **Event Type** dropdown, select **Auction**.
   [image: Event Type dropdown]
   [image: Auction selected]
3. Select The "Traffic Light" Auction Strategy
   (Written this way in Notion — apparently copied from the Traffic Light article; this article is about the Dutch strategy.)
   [image: strategy selection]
4. Choose on which entity should offers be based on.
   [image: offers based on]
5. Choose on which condition should event be closed on.
   [image: closing condition]
6. Configure the Starting Price, Ending Price, Tick Size, and Time Difference
   [image: Starting Price, Ending Price, Tick Size, Time Difference]
7. Click on Save and Publish the Event
   [image: Save and Publish]
8. Once published, the auction screen under the **Responses tab** will show:
   - Current round details (offer amount, End Price tick size, and time difference).
   - Upcoming offers.
   - List of Bidders
   [image: Responses tab]

The End Price refers to the price the Auction will end at. The Starting price increases by the tick size every round until the end price is reached. It cannot be edited

[image: End Price]

9. **Round Controls for Buyers**
   [image: round controls]
   - Extend time for the ongoing round by clicking the **plus button (+)** and selecting additional time.
   [image: plus button]
   [image: additional time selection]
   - Update **tick size** and **time difference** by editing the fields and clicking **Update**.
   [image: edit tick size and time difference]
   [image: Update]
10. **Vendor Participation**
    - Each round presents a fixed offer (e.g., ₹X, then ₹X - Tick Size, then ₹X - Tick).
    - Vendors can either **Accept** or **Not Accept**.
    [image: vendor Accept / Not Accept]
    - When no vendors accept this price, the next round starts with the offer being "Starting Price" + Tick Size
    [image: next round]
    - If a Vendor Accepts, the auction is closed and the Vendor who accepts is awarded the bid. (Dutch Auction is first come first serve basis)
    [image: vendor accepts]
    1. The Bid is Awarded
       [image: bid awarded]

> **Note.** In case no Vendor accepts the offers and the End Price is reached, Auction is closed without awarding to any vendor.
