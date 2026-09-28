# How to choose and configure Auction Strategies?

Source: Notion Knowledge Base — How to choose and configure Auction Strategies? (https://app.notion.com/p/3ff92226c8b2826fac9f0110421d35ce) · last edited 2026-04-12
Section: Sourcing › Auction

## Who Is This For? — Choose and configure Auction Strategies

Buyers, Procurement Managers setting up **Reverse Auctions** on Procol

## Overview — Choose and configure Auction Strategies

When creating an **Auction** **Event** in Procol, buyers must choose an **Auction Strategy**. This determines how vendors see bids, how competition is structured, and how winners are decided.

You can choose from several strategy types based on your sourcing goals — whether you want aggressive price discovery, structured supplier feedback, or fast commitment.

## How to Choose or Change an Auction Strategy — Choose and configure Auction Strategies

1. On the **Create Event** screen below, select **Auction** as your event type.

> **Note.** By default, the **Event Type** is set to **Rank on Line**, a type of Reverse Auction.

[image: Create Event screen with Auction selected]

2. Click on the **Rank on Line** badge to choose your **Event Type** to open a side drawer with multiple strategy options.
   [image: Rank on Line badge]
   [image: side drawer with auction strategy options]

> **Note.** You can update the strategy before publishing the event, but not after the event goes live.

## Auction Strategy Types Explained — Choose and configure Auction Strategies

| Strategy | Description | When to Use |
|---|---|---|
| **Rank Based** | Vendors only see their **rank**, not actual prices. Encourages competitive behavior without full price visibility. | Use for sensitive categories where exposing exact prices may cause collusion or compromise negotiation. Vendors wil know their relative positioning against the competition. **(Most commonly used)** |
| **Price Based** | Vendors see the **lowest bid price** on each item but not ranks. Focuses on beating visible prices. | Use for commodities or standardized goods where price is the main differentiator. Vendors will know the exact price to beat in order to be the best bid. |
| **Traffic Light** | Vendors see a **color-coded status** (Green/Amber/Red) based on their bid range. No ranks or prices shown. | Use when you want vendors to compete without revealing precise positioning. This allows them to experiment with bids until they land in safe zone, without worrying about the competition. Helpful in high-risk or regulated categories. |
| **Knockout** | Vendors are shown a **target price**, and they can only accept or reject it. One-time interaction. | Use when you've done benchmarking and want to quickly identify who is willing to accept a fixed offer. |
| **Dutch Auction** | Items are awarded on a **first-come, first-serve** basis to vendors willing to accept a pre-set decreasing price. | Use for perishable or urgent items, or when inventory must be cleared rapidly. Creates urgency. |

## Best Practices for Selecting Strategy — Choose and configure Auction Strategies

- For **strategic sourcing** or large-value buys: Start with **Rank Based** to increase competition subtly.
- For **commodities** or **rate-based contracts,** go with **Price Based**.
- Use **Traffic Light** when evaluating **new vendors** and want to avoid price anchoring.
- Choose **Knockout** when you've already negotiated or benchmarked pricing and want to **test market acceptance**.
- Use **Dutch** for **disposal events**, urgent turnaround, or end-of-quarter buying.

## Strategy Specific Configurations: 1) Rank-Based — Choose and configure Auction Strategies

[image: Rank-Based configuration]

- **"Show rank to vendor for individual item."** - should be enabled if you would like to Vendors the ranks for each line item, rather than their rank based on the Sum Total. This is often paired with choosing to "**partially award event to multiple vendors"** in the Awarding Type (line-item - level-based event)
- **"Set Minimum revision to show Rank"** - When enabled, ranks are shown to vendors only after they have revised their price at least "n" times.
  You can define the Number of revisions in the input box that appears when you select this option
  [image: minimum revision input]

## Strategy Specific Configurations: 2) Price-Based — Choose and configure Auction Strategies

[image: Price-Based configuration]

- **"Set Minimum revision to show Best price"** - when enabled, the Best price is shown only after vendors have revised their price at least "n" times.
  You can define the Number of revisions in the input box that appears when you select this option

## Strategy Specific Configurations: 3) Traffic Light — Choose and configure Auction Strategies

The first configuration to set is the condition on which the vendors are grouped into different colors.
You can select either Price or Rank.

[image: Traffic Light grouping condition]
[image: Traffic Light configuration]

Now, based on the above configuration, we can set the Rank-based or Price-based bands for the traffic light colors.

[image: rank-based bands]
[image: price-based bands]

- If the Price entered for green is X,
  The green traffic light colour is assigned to all Vendors offering prices / whose rank is ≤ X
- If the Price entered for Y,
  The yellow traffic light colour is assigned to all Vendors offering / whose rank is ≤ Y, and > X

> **Note.** The price is inclusive of the price/rank entered

- **"Set Minimum revision to show Traffic Light color"** - when enabled, the traffic light color is shown only after vendors have revised their price at least "n" times.
  You can define the Number of revisions in the input box that appears when you select this option

## Strategy Specific Configurations: 4) Knockout — Choose and configure Auction Strategies

- The first configuration to set is the condition on which the offers are based on:
  You can select either "Best Price" or "Total Amount"
  [image: offers based on Best Price / Total Amount]
- You then set the Starting Price.
  These refer to the prices at which first and final bids are offered.
  [image: Starting Price]
- Then you can the add the Tick Size
  It's Price Difference between two successive offers placed.
  [image: Tick Size]
- Then you can add the Time Difference
  Time difference between two successive offers placed.
  [image: Time Difference]

## Strategy Specific Configurations: 5) Dutch — Choose and configure Auction Strategies

- The first configuration to set is the condition on which the offers are based on:
  You can select either "Best Price" or "Total Amount"
  [image: offers based on Best Price / Total Amount]
  [image: Dutch configuration]

If you select **"Offers on Best Price"**
then you will have to select the condition for closing the auction
[image: closing condition]

> **Note.** If you select **"Offers on Total Amount"** then you need not any condition, it will be hidden. As only single vendor closing will be done.

- You then set the Starting Price and Ending Price
  These refer to the prices at which first and final bids are offered.
  [image: Starting and Ending Price]
- Then you can the add the Tick Size
  It's Price Difference between two successive offers placed.
  [image: Tick Size]
- Then you can add the Time Difference
  Time difference between two successive offers placed.
  [image: Time Difference]
