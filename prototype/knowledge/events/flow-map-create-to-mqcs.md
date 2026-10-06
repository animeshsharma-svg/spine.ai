# Flow map — a fresh event, from Create Event to Master QCS and its report

This is the layout of the events flow for a **fresh event** (not reopened from a draft), in the
order a buyer walks it. Every statement carries where it comes from:

- `[code]` — read from procol-client-dashboard or procol-backend (file given).
- `[live]` — seen on UAT by the automation (client in brackets).
- `[?]` — not in the code or not yet observed: **needs the product team's answer**.

How to annotate (the training loop): next to any line or cell write
`✓` correct · `✗ <what it should be>` · `⚠ <where it breaks>` · `★ clients use this a lot`.
Every confirmed line becomes a gold-set entry and a test case; every ✗ becomes a bug or a product
question; every ⚠ gets extra combination cases.

---

## 0. The lifecycle, in order

| # | State | What it means | Enters when | Leaves when |
| --- | --- | --- | --- | --- |
| 1 | **Draft** | Saved but not published; lives under Drafts | Save as draft / template chosen on eRFX | Publish, or delete |
| 2 | **Upcoming** | Published, bidding starts later | Publish with a future start time | Start time arrives |
| 3 | **Live** | Bidding open | Publish with "Start now" or start time reached | End time (plus extra closing / dynamic extension) |
| 4 | **Closed** | Bidding over | End time reached, or force-close | Evaluation / awarding begins |
| 5 | **Evaluation / review** | Evaluation time, best-price or cost-breakdown request window | After close when evaluation time or a review window is set `[code trade_schedule.rb:69]` | Window ends |
| 6 | **Award proposal** | Buyer selects bids; proposal draft → requested → selected / rejected | Start Awarding on Master QCS | Approval decision |
| 7 | **Approval** | Proposal sent into the client's approval workflow | Submit proposal | Approved / rejected / withdrawn |
| 8 | **PO** | Purchase order generated from the selected proposal | Approval complete | — |
| — | **Withdrawn** | Event withdrawn by the buyer | Settings → Withdraw (live, upcoming, requested, draft, expired) `[code eventHeader.jsx]` | — |

`[?] Q1` Is "expired" shown to buyers as a separate state from "closed", or the same thing with a
different label? `[?] Q2` Can a withdrawn event be reopened or recreated, and does Recreate Order
copy participants and bids?

---

## 1. The Events page

| Element | Behaviour | Source |
| --- | --- | --- |
| Tabs | Live · History · Drafts, each with a count badge | `[live]` |
| Create Event → **Single Stage** | "Source through RFP / RFQ / Auction": one round, one screen | `[live]` |
| Create Event → **eRFX Project** | "Manage sourcing via a project approach": stages composed on one screen | `[live]`; offered only when the client's custom config `rfx_project_enabled` is on `[code orders_controller.rb:33]` |
| Create Event → BOQ project | Only for BOQ-enabled clients | `[live]` (UI-XDBOQ) |
| Each event row | Title, RFX number, stages with their own status, overdue badge, vendor counts (participated/invited), next action (e.g. "Evaluate RFQ Commercials", "NFA in Progress", "Send for TR") | `[live]` |

`[?] Q3` For a client with `rfx_project_enabled` **off**, is Single Stage the only path, and does the
"Create Event" button then open the single-stage screen directly?

---

## 2. Two create screens

| | Single Stage | eRFX Project |
| --- | --- | --- |
| Address | `/orders/quick-create` (single-stage) | `/orders/quick-create` too — tell them apart by content, not URL `[live]` |
| Event type | Chosen first: **RFP · RFQ · Auction** (the default on arrival is **RFP**) `[live 198678]` | Stages added with the icon-only **+** ("Add Stages" is the menu title); default stage **Auction** `[live]`; RFQ and Auction never coexist `[code projectCreation.jsx:3059 isValidStage]`; two stages is the ceiling (the + is disabled, tooltip "Remove RFQ to add Auction" / "Remove Auction to add RFQ") `[code :3184]` |
| Title | Typed, or auto-generated from the sheet (§3) | Typed; stage titles derived (`getTitleForStage`) |
| Template | Per event | Per stage, on that stage's tab |
| Line items | Typed straight into the sheet | **Items** → Manage Line Items drawer (opens even before a template `[live]`; the sheet needs a template) |
| Participants | "Search vendors you want to add" | Participants section; locked until template + product on some flows ("Please choose a template and add a product") `[live]` |
| Publish | "Publish Event" | "Publish" and "Save as draft" |

---

## 3. Template → title → sheet

**Template.** Templates are per company, `buy` or `sell`, `template_for` trade/boq/rfi/… `[code template.rb]`.
Choosing one brings, at once:

| What the template sets | Where it shows up | Source |
| --- | --- | --- |
| Sheet columns (`widgets`), split into **creator** (buyer) and **participant** (vendor) widgets by `field` | The product sheet, and the Add Columns menu | `[code selectors.js:507-531]` |
| Default terms & conditions clauses + attachments | T&C, loaded on template select | `[code templateSelection.jsx:330-334]` |
| Default savings configuration | Savings drawer defaults | `[code template.configurations.savings_configuration]` |
| Validation widgets configuration | Which sheet values are checked | `[code validation_widgets_configuration]` |
| `trade_audience_flow` | A stepper flow for participants on the legacy create screen | `[code createOrder.jsx:1298-2364]` |
| `is_english_auction_allowed`, `is_allowed_to_create_knockout_auction`, `is_allowed_to_create_dutch_auction` | Which auction strategies the drawer offers | `[code selectors.js:4759-4773]` |
| `is_buyer_not_allowed_to_add_surrogate_bid` | Hides Add Bid on Participants | same |
| `widget_precision`, `event_duration_predefined_values`, `enable_open_tender_events`, `enable_multi_currency_flow`, `show_participants_list` | Decimals, duration presets, open tender, currency, participant list | same |

`[?] Q4` Which of these template settings are set per client in practice (and by whom — Procol or the
client admin)? `[?] Q5` RFP templates are questionnaires with no price sheet `[live]`; is an RFP
ever expected to carry a price sheet?

**Title auto-generation** `[code eventCreation.jsx:124-160]` — only while the title is empty or still
the previous auto title; rows count only when they have both a product and a delivery location:

| Sheet | Auto title |
| --- | --- |
| 1 product, 1 location | `<product name> - <location>` (product truncated to 70) |
| Several products, same family | `<family> products - <location>` |
| Several products, mixed families | `<first product> & more - <location>` |
| Several locations | `… - N locations` |

`[?] Q6` Do clients rely on the auto title (reports, PO references), so a wrong auto title is a real bug?

**Product sheet.** Product (searched from the catalog, shows the code), Product Variant (auto),
Quantity Requested, Delivery location, Price, Quantity Available, GST, Total Amount `[live]`.
Picking a product can pull its **terms and conditions** and **category** in `[code eventCreation.jsx:1340-1400]`.
Numeric cells reject non-numbers on commit `[live]`.

**Add Columns** `[live]` — two sub-menus, filled from the template's optional widgets:

| Creator (buyer) columns | What it does | Source |
| --- | --- | --- |
| **Price Cap** (`ceil_price`) | The vendor's net price must be **≤ cap**: "Net Price should be less than ₹X/unit" | `[code trade_template_helper.rb get_validations_for_attributes]` |
| **Min Quantity** (`floor_quantity`) | "Quantity should be greater than X unit" | same |
| **Tick Size** / **Tick Size Percentage** | In an English auction the next bid must improve by the tick; the cap moves with it (`ceil_price − tick%` once a bid exists) | `[code trade_product.rb:176-208]` |
| **Creator Attachments** | Buyer files per line | `[code excel_to_json_conversion_service.rb:137]` |
| **Custom Column** | Free text, buyer-filled (`custom_text_widget_creator`) | `[code widget.rb:855]` |
| Participant columns | Vendor-filled custom text (`custom_text_widget_participant`) and others the template allows | same |

`[?] Q7` Floor price (minimum a vendor may bid) exists in code (`floor_price`) — is it offered on the
menu for buy events, or only on sell events?

**Upload Sheet** `[code uploadExcelModal.jsx; bulk_upload_controller.rb]`: download the template →
fill → upload (10 MB cap). Failures: "Failed to upload N entries" with "View failed entries";
"Sheet partially filled, please check again." `[code en.json]`. The conversion knows the sheet
types `trade / multistage / bid / boq_bid / template_response / product / vendor / …` `[code conversions]`.
`[?] Q8` You mentioned a **separate vendor mapping** for uploaded sheets — is that the vendor
column in a `bid` upload (a sheet with one column per vendor), or a mapping of uploaded vendor
names/codes to companies? Where does a buyer see it fail?

---

## 4. Participants

| Behaviour | Rule | Source |
| --- | --- | --- |
| **Suggestion banner** "Invite N more participant based on the products" | Vendors linked to the sheet's products; link built from purchase-price records (vendor codes) when the client has `vendor_recommendation_on_product` | `[live]`; `[code product.rb:418, product_vendor_mapping.rb, companies_controller.rb:827]` |
| Manual add | "Search vendors you want to add": active vendors in the client's allowed onboarding statuses; **blocked** vendors are excluded from suggestions | `[code participantsSelection.jsx:226-240]` |
| Vendors listed as `menuitem` under "VENDORS" | — | `[live]` |
| **Invite Vendor** (new) | Opens the invite-new-vendor drawer unless `disable_manual_vendor_creation` | `[code :818-830]`; never clicked by the automation (real suppliers) |
| TNA vendors | Allowed to bid only with `allow_tna_vendors_to_bid` | `[code base.rb]` |
| Open tender | Any vendor may participate when `enable_open_tender_events` / `allow_other_vendors_to_participate` | `[code]` |
| Publish with **no** participants | Refused: "Please add participants to proceed!" — checked **before** the template | `[live 198678]` |

`[?] Q9` When a product's mapped vendors exist, are they **auto-added** on some clients (no click
needed) or always behind the Suggestion click? `[?] Q10` Should a blocked vendor ever be addable
manually? `[?] Q11` Is there a maximum number of participants?

---

## 5. Savings

Drawer "Savings Calculation" `[live]`:

| Choice | Meaning | Source |
| --- | --- | --- |
| Measure on **Gross Total** (lot) or **Line Item** | Savings key `gross_total` vs per-line | `[code savings_calculator.rb:38]` |
| Strategy tabs **Budget · Historical Price · Existing Proposal** | Reference price sources | `[code savingsDrawer/constants.js]` |
| **Add Custom Reference** | Extra named reference (`custom_savings`) | `[code savings_configuration.rb:154]` |
| Buy formulas | savings = reference − final; % = (reference − final) / reference × 100 | `[code :53-60]` |
| Sell formulas | reversed | same |
| Per-unit reference | multiplied by quantity (creator quantity for default, best bid quantity for custom) | `[code :112-118]` |
| Negative savings on the default strategy | handled specially | `[code :41]` — `[?] Q12` shown as negative, zero, or hidden? |
| Where it shows | Overview savings card; Master QCS report (`existing_proposal_percent` …) | `[code master_qcs_report_components/config.rb]` |
| Savings mandatory | Some tenants block publish without a reference | UI-SAV-002 |

`[?] Q13` Does a reference entered on the line item change any total the vendor sees, or only the
buyer's savings figures? `[?] Q14` Which clients have savings mandatory?

---

## 6. Terms & Conditions

| Level | Where stored | Notes | Source |
| --- | --- | --- | --- |
| **Event-wise** | `event_group.terms_and_conditions` (clauses) + attachments | Shown when the group has them | `[code event_group.rb:352-368]` |
| **Stage-wise** (RFP / RFQ / Auction) | `trade_request.terms_and_conditions` | Used when the group has none and exactly one stage | same |
| Template default clauses | Loaded on template select | `[code templateSelection.jsx:330]` |
| Product-level clauses | Merged in from each product's `terms_and_conditions` into the "default" group | `[code eventCreation.jsx:1340-1400, 1550-1591]` |
| **Mandatory switch** `is_tnc_mandatory` | When on, **every clause and attachment is required** for the vendor, whatever its own mode | `[code trade_request.rb:991-1000 effective_tnc_mode]` |
| Payment terms & Incoterms | Mandatory on the payment-terms form | `[code paymentTerms.jsx:20-21]` |

`[?] Q15` What does the vendor see when T&C are mandatory — a checkbox per clause, one accept-all,
or a blocked Submit? `[?] Q16` Are stage-wise T&C shown per stage to the vendor, or merged?

---

## 7. Schedule

Drawer "Schedule Event" `[live]`:

| Field | Options | Rules | Source |
| --- | --- | --- | --- |
| **Start time** | Start now · a date + time | Date not before today and at most 3 months ahead | `[code projectScheduler/helpers.js:6]` |
| **End time** | **Duration** (presets 30 min · 1 h · 4 h · 24 h · custom; per-client presets via `event_duration_predefined_values`) · absolute | end = start + duration | `[code constants.js, helpers.js:12-44]` |
| **Evaluation time** | Duration · none | evaluation = end (+ cost-breakdown window) + evaluation | same |
| Extra closing time | Grace after end | `extra_closing_time` | `[code base.rb]` |
| Dynamic closing (auction) | Extension when a bid lands in the last N minutes, up to a limit | `is_dynamic_closing_time_allowed`, `time_extension_value`, `last_n_minutes_for_time_extension` | `[code base.rb]` |
| Review window after close | `request_for_best_price` or `request_for_cost_break_down` | `[code trade_schedule.rb:69]` |
| Refusals | "Start time cannot be less than the current time" · "Start time should be less than end time" · "End time cannot be less than the current time" | `[code en.json:325-327]`; backend refuses an end in the past (except BOQ) `[code trade_controller_helper.rb:331]` |
| Default | "Now – <now + 30 min> (30 Mins)" shown on the footer | `[live]` |

`[?] Q17` Is there a **minimum** duration (e.g. 5 minutes)? `[?] Q18` Must Save Schedule be pressed,
or does Publish take the footer's default? (UI-SCH-007 asks this.)

---

## 8. Publish

Footer: Savings · Terms & Conditions · Schedule · **Publish Event** `[live]`.

Refusals the screen can give (order as seen live; `[?]` where not yet seen):

| # | Refusal | Message | Source |
| --- | --- | --- | --- |
| 1 | No participants | "Please add participants to proceed!" | `[live 198678]` — checked before the template |
| 2 | No template (participants present) | "Please select a valid column for savings" (misleading; the cause is the template) | `[live]` UI-TPL-004 |
| 3 | No title | "Please enter title." | `[code en.json]` |
| 4 | Sheet incomplete | "Sheet partially filled, please check again." | `[code en.json]` |
| 5 | Auction without a strategy | "Please select a valid auction strategy" | `[code]` |
| 6 | Traffic light range missing / inverted | "Traffic light type is required" (same message for both — BUG-84) | `[live]` |
| 7 | Knockout / Dutch without base price | "Please enter (valid) base price" | `[code]` |
| 8 | Delivery date missing where required | "Please enter a delivery date" | `[code]` |
| 9 | Single product + "multiple vendor" closing | "In case of single product, please choose multiple vendor closing." | `[code]` |
| 10 | Not the latest version | HTTP 101 | `[code trade_controller.rb:395]` |
| 11 | RFQ changes restricted | HTTP 769 | `[code :401]` |
| 12 | End time already past | refused | `[code trade_controller_helper.rb:331]` |

On success: the browser lands on the project page, status **Live** (or **Upcoming** with a later
start) `[live]`. **If every mandatory field is filled and Publish still does nothing, that is a bug.**

`[?] Q19` Please confirm the intended order of these checks (which message a buyer should see
first when several things are missing).

---

## 9. After publish — the stage page

Header: title, RFX number; tabs **Project Details · <stage> · Master QCS**; stage sub-tabs
**Responses · Overview · Participants · Analytics · Price Trends · Participant Remarks**; countdown
timer; **Live** badge; **Settings** (gear) with actions by status (Reschedule Event only while
upcoming; Convert to Auction on a published RFQ; Extend Submission Time; Withdraw; Rejected Bids;
Order Activity; Recreate Order …) `[live]`.

**Participants tab** `[live]`:

| Control | Rule | Source |
| --- | --- | --- |
| Checkbox per vendor; "Show only selected vendors" | Selected = the round's audience | `[live]` |
| **Add Bid** (surrogate: buyer bids on the vendor's behalf) | Drawer with that vendor's sheet; Submit disabled until a price is typed; may route through a surrogate-bid **approval** flow; hidden when the template says `is_buyer_not_allowed_to_add_surrogate_bid`; absent on a draft | `[code addBidDrawer.jsx:144-152]`, UI-SUR cases |
| **Add Price Cap** (per vendor) | Sets that vendor's `ceil_price`; "Price Cap added successfully!"; "Bid & Price Cap can be added after event creation." | `[code en.json:271,647]` |
| Editing a cap after bids | Increase/decrease rules depend on existing bids | `[code trade_controller_helper.rb:469-477]` — `[?] Q20` what exactly is allowed? |
| Add Weight Params | Weighted evaluation params | `[live]` |

`[?] Q21` A surrogate bid: does the vendor see it as their own bid and can they revise it?
(UI-EVDLEK/UI-SUR cover parts.) `[?] Q22` Which clients require approval for surrogate bids?

---

## 10. Master QCS and its report

**Master QCS** (the comparison across rounds) `[live]`:

| Behaviour | Rule | Source |
| --- | --- | --- |
| Before any bid | "No bids are placed yet!" | `[live]` |
| After the first bid | One column per vendor; rows per line item: PR Qty, Product, Qty Offer, **Rank**, Auction Amount, Auction rate, Auction Landed, RFQ Amount, Final Negotiated Rate/Amount, Freight Custom, GST Custom, Account Assignment; sections **Auction Final** and **Other Charges** with Sum Total and Loading Factor | `[live]` |
| Updates | Re-rendered as bids arrive; ranks recomputed | `[live]` |
| **Rank rule** | Rank by score (lower is better for buy, higher for sell). **Ties at the top: nobody gets rank 1 — every tied vendor gets rank 2** | `[code rank_calculator.rb ranking_for_scores]` — `[?] Q23` is that the intended behaviour? ⚠ |
| Rank on item vs lot | `rankOnItem`, inline rank type | `[code trade_request.rb:1066]` |
| Vendor-side rank | Shown to vendors only with `display_vendor_rank_in_auction_qcs` | `[code]` |
| **Start Awarding** | Hidden while a proposal exists ("Approval in Progress"); disabled with a tooltip while a stage is live / draft / not the latest version | `[code masterQcs.jsx:286, 406-415]` `[live]` |
| **Download Report** | Report version by client: a Report Template if one is set, else V4 → V3 → V1 → V2 by `mqcs_report_vN_enabled`, else default | `[code master_qcs_report_selector.rb]` |
| Report columns (V4) | Summary: Event link/id/title/template/date/start/end/duration/creator/vendors invited/participated/closed at. Per vendor: Rate, P&F Amount, Basic Rate Before GST, GST %, TCS %, Total Freight, Other Charges Incl GST, Gross Amount, **Rank**; purchase history (last PO vendor/number/qty/price/date) | `[code master_qcs_report_components/config.rb:39-73]` |
| Product self-check | `MqcsDiffCheckerService` recomputes line-item data and reports differences (`PrecomputationDataValidationWorkerV2`) | `[code]` — spine.ai's 17 integrity rules do the same independently |

**What must always agree** (the report is a contract): every rank, amount and total in the
downloaded report equals what Master QCS shows at download time; the vendor's own sheet equals
the buyer's view of it (UI-EVDLEK); totals = Σ line totals; savings = the formula above.

`[?] Q24` Which report version does each client use? `[?] Q25` Should the report ever include
vendors who were invited but never bid (and with what in their cells)?

---

## 11. The combination axes (what the generator multiplies)

| Axis | Values |
| --- | --- |
| Event shape | single-stage RFP · RFQ · Auction; eRFX RFP · RFQ · Auction · RFP+RFQ · RFP+Auction; BOQ project |
| Auction strategy | rank · price · traffic light · knockout · dutch · basket; English auction on/off; dynamic closing on/off |
| Awarding | entire lot to one vendor · partial across vendors (`is_partial_awarding_enabled`) · line-item-wise |
| Savings | none · gross · line item × budget · historical · existing proposal · custom reference |
| Extra columns | price cap · min quantity · tick size (value / %) · creator attachments · custom column |
| T&C | none · optional · mandatory; payment terms present / absent |
| Participants | suggested from products · manual · TNA · open tender · invite new |
| Schedule | start now · later; duration · absolute; evaluation none · set; extra closing; review window |
| Client gates | `rfx_project_enabled` · `vendor_recommendation_on_product` · `disable_manual_vendor_creation` · `mqcs_report_vN_enabled` · `display_vendor_rank_in_auction_qcs` · `is_partial_awarding_enabled` · `enable_multi_currency_flow` · `is_add_new_stage_allowed` · `restrict_event_visibility_to_owner` |

Pairwise coverage of these axes is the automatic scenario source. The gold set marks which
pairs clients really use (★).

---

## 12. The seven QA questions, per transition

For each arrow in the lifecycle (Draft→Published, Published→Live, Live→Closed, Closed→Proposal,
Proposal→Approval, Approval→PO) answer each: **yes / no / should be …**

| Question | Draft→Published | Published→Live | Live→Closed | Closed→Proposal | Proposal→Approval |
| --- | --- | --- | --- | --- | --- |
| 1. Done twice? (double publish, double bid, second proposal) | | | | | |
| 2. Done by the wrong role? (vendor publishes; evaluator awards) | | | | | |
| 3. Done at the wrong time? (bid after close; reschedule while live) | | | | | |
| 4. Done with partial data? (sheet half filled; no price) | | | | | |
| 5. Done while something else is in progress? (amendment during approval) | | | | | |
| 6. Done after an edit or a new version? (old version awarded) | | | | | |
| 7. Does a client setting change the answer? (which one) | | | | | |

---

## 13. Open questions, collected

Q1–Q25 above. Answer in any order; each answer is turned into a product fact, a gold-set entry
and test cases the same day.
