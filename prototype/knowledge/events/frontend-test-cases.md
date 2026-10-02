# QA Test-Case Catalog — Events Module (Frontend)

Source: read-only mining of `procol-client-dashboard` (no code changed). Every case below cites a `file:line` in the Evidence section or inline.

## Feature under test

The Events module spans multi-stage eRFX project creation (`src/views/projectCreation/**`), per-stage event configuration (`src/views/eventCreation/**`), the RFI/RFP question builder (`src/views/rfiBuilder/**`), the savings drawer (`src/components/savingsDrawer/**`), the live-order lifecycle header (`src/views/orderDetails/eventHeader/eventHeader.jsx`), and the project details shell (`src/views/projectDetails/**`). An eRFX project is a container of 1-2 "stages" (Technical/RFP, RFQ, Auction) each carrying its own template, sheet, participants, savings and schedule; a stage is validated by `getStageWiseErrors` (`src/views/projectCreation/helpers.js:154-630`) and published via `handleClickPublish` (`src/views/projectCreation/projectCreation.jsx:1595-1911`). Auction stages support five strategies (Rank, Price, Knockout, Dutch, Traffic Light) plus Basket Auction and English Auction variants; Knockout and Dutch are gated off in the eRFX creation screen unless the project is converting an existing RFQ into an Auction (`isRfqToAuction`). RFQ and Auction stages are mutually exclusive within one project; Technical (RFP) can combine with either. Behaviour throughout is gated by a large `tradeConfig` object sourced from the backend's order/trade config (`src/redux/orders/selectors.js:702-742` and `:4553-4559`) plus a set of boolean feature flags on `state.user` (`src/redux/user/selectors.js`).

## Coverage profile

Three axes must each be exercised — the riskiest defects live at the intersections.

| Axis | Values that matter | Why |
|---|---|---|
| Tenant type | eRFX (`isErfxAllowed=true`) vs classic single-stage (`isErfxAllowed=false`) | Stage tabs, Knockout/Dutch gating, and Add-New-Stage only exist for eRFX; classic tenants use `createOrder.jsx` untouched. |
| Entry path | Fresh create vs PR→event vs RFQ→Auction conversion vs draft recreate | Each path seeds different defaults (`getNewStageData`, `getStageDataForPrToProject`, the `isRfqToAuction` query-param branch, `recreateData`) and enables/disables different fields. |
| Stage composition | Auction only, RFQ only, RFP+RFQ, RFP+Auction | RFQ+Auction together is impossible by design; every other pairing must be tried at least once. |

Also cover at least one tenant with each of: `routeAuctionsToAuctionTeam`, `isSavingsConfigurationMandatory`, `isVendorMaskingEnabled`, and `add_new_stage_config` configured — these tradeConfig keys silently change gating everywhere and are easy to leave untested if the default (off) tenant is the only one used.

## 1. Positive — Happy paths per event type

| # | Case | Expected |
|---|---|---|
| FE-1.1 | 🟡 Quick-create default Auction/Rank event publishes with untouched defaults | Event publishes with mode=auction, strategy=rank, type='Rank', closingOn=lot_based, dutchClosingOn=single, offersOn=base_price |
| FE-1.2 | 🟠 eRFX create screen arrives with exactly one default Auction stage tab _(gates: isErfxAllowed)_ | Exactly one stage tab exists, mode=auction (DEFAULT_STAGE.AUCTION) |
| FE-1.3 | 🔴 RFQ-only eRFX project via add Technical, delete Auction, add RFQ, delete Technical _(gates: isErfxAllowed)_ | Final stage set is RFQ only; publish succeeds |
| FE-1.4 | 🟡 Auction – Price strategy happy path | Publishes; details.strategy=='price' |
| FE-1.5 | 🔴 Auction – Knockout strategy only reachable via RFQ→Auction conversion in eRFX _(gates: isErfxAllowed, isRfqToAuction)_ | Knockout tab is selectable (not disabled) only because isRfqToAuction=true; publishes successfully |
| FE-1.6 | 🟡 Auction – Dutch strategy happy path (sell order, endPrice below basePrice) _(gates: isRfqToAuction)_ | Publishes; basePrice >= endPrice honored for sell |
| FE-1.7 | 🟡 Auction – Dutch strategy happy path (buy order, endPrice above basePrice) _(gates: isRfqToAuction)_ | Publishes; basePrice <= endPrice honored for buy |
| FE-1.8 | 🟡 Auction – Traffic Light (price range) happy path, buy order | Publishes; lowerPrice<=upperPrice accepted for buy orders |
| FE-1.9 | 🟡 Auction – Traffic Light (rank range) happy path | Publishes; lowerRank<=upperRank accepted |
| FE-1.10 | 🟠 Technical Stage (RFP) only project publishes with evaluators added | Publishes; no isEvaluatorNotPresent / isGlobalSectionEmpty errors |
| FE-1.11 | 🟡 Basket auction (multi-product single event) happy path _(gates: isBasketAuction)_ | Publishes; closingOn undefined in payload (isBasketAuction ? undefined : closingOn), savings forced to line-item |
| FE-1.12 | 🟡 BOQ project creation auto-creates its draft event group once on mount _(gates: isBoqProjectCreation)_ | createProject({isBoqBasedRfx:true}) fires exactly once; not repeated on re-render |

## 2. Stage composition & tab machinery

| # | Case | Expected |
|---|---|---|
| FE-2.1 | 🟠 Default stage on create screen is Auction | DEFAULT_STAGE.AUCTION ('auction') used as initial stage mode |
| FE-2.2 | 🟠 '+' menu on single-Auction project offers only RFQ and Technical | Menu lists RFQ and Technical Stage only (isValidStage filters out Auction itself) |
| FE-2.3 | 🟠 '+' button disabled once 2 stages exist, tooltip explains removal needed | Button disabled (currentProjectStages.length===2); tooltip reads 'Remove RFQ to add Auction' or 'Remove Auction to add RFQ' depending on which pair is present |
| FE-2.4 | 🔴 Adding Auction while RFQ present is invalid | isValidStage returns false; Auction not offered in '+' menu |
| FE-2.5 | 🔴 Adding RFQ while Auction present is invalid | isValidStage returns false; RFQ not offered in '+' menu |
| FE-2.6 | 🟠 Technical (RFP) + RFQ combination is allowed | Allowed; 2-stage project with RFP and RFQ |
| FE-2.7 | 🟠 Technical (RFP) + Auction combination is allowed | Allowed; 2-stage project with RFP and Auction |
| FE-2.8 | 🔴 Max 2 stages enforced regardless of which combination is valid | '+' button disabled purely on currentProjectStages.length===2, independent of isValidStage result |
| FE-2.9 | 🔴 Delete stage menu item disabled when only one stage remains | 'Delete' Menu.Item disabled (Object.keys(stageConfig).length===1) |
| FE-2.10 | 🟠 Delete menu item hidden entirely while editing an existing recurring stage | 'Delete' Menu.Item is not rendered at all (not merely disabled) |
| FE-2.11 | 🟡 Deleting a persisted stage queues its backendStageId for server-side cleanup | deletedDraftStageIds gains the stage's backendStageId |
| FE-2.12 | 🟠 Duplicate stage-type add blocked (2nd RFQ while RFQ already present) | isValidStage returns false because currentProjectStages already includes 'rfq' |
| FE-2.13 | ⚪ Inline stage title rename trims whitespace | Stage title stored as 'My Stage' (trimmed); empty/whitespace-only input is ignored, no title change applied |
| FE-2.14 | 🟠 Unvisited stage shows 'Stage is not reviewed' eye-off icon and blocks Publish confirm OK | Tab shows EyeOffFilled icon with tooltip 'Stage is not reviewed'; Confirm modal's OK button is disabled |
| FE-2.15 | ⚪ getTitleForStage auto-numbers repeated stage modes | New stage auto-titled 'Technical Stage 2'; first remains 'Technical Stage' |

## 3. Templates & sheet

| # | Case | Expected |
|---|---|---|
| FE-3.1 | 🟠 Template dropdown disabled during RFQ→Auction conversion _(gates: isRFQtoAuction)_ | Dropdown disabled (isTemplateSelectionDisabled includes isRFQtoAuction) |
| FE-3.2 | 🟡 Selecting a template on a fresh stage sets currentTemplateId and templateName | stageConfig currentTemplateId and templateName populated with the chosen template's uuid/name |
| FE-3.3 | 🟠 Changing an already-selected template asks for confirmation before resetting data | Modal.confirm appears: 'Do you really want to change the template?' (project creation) or the eventCreation-specific reset copy; confirming resets sheet data |
| FE-3.4 | 🔴 Section-wise-scoring template rejected outside Vendor Assessment | message.error: 'Section-wise scoring templates can only be selected in the Vendor Assessment section.'; template not applied |
| FE-3.5 | 🔴 Stage with no template selected shows red error outline at publish | Template dropdown gets dropError styling (errors.allTemplates); publish blocked for that stage |
| FE-3.6 | 🟡 Template deletion allowed only for RFP mode stages with a template applied | isTemplateDeletionAllowed true only when !!templateName && isModeRfp; hidden/disallowed otherwise |
| FE-3.7 | ⚪ Template already used elsewhere in the RFQ shows disabled tooltip | Tooltip: 'Template used in RFQ has already been selected' |
| FE-3.8 | ⚪ freight_charges price field hidden until sheet has 3+ line items | freight_charges option absent while data.length<3; appears once a 3rd line item is added |
| FE-3.9 | 🟡 Price field already added is disabled in the Add-price-field menu | That field's Menu.Item is disabled, preventing duplicate columns |
| FE-3.10 | 🟡 eRFX sheet keeps product/creator_quantity/variant widgets non-editable _(gates: isErfxAllowed)_ | These widgets stay in WIDGETS_TO_BE_DISABLED_FOR_ERFX and are rendered read-only on the sheet |

## 4. Line items

| # | Case | Expected |
|---|---|---|
| FE-4.1 | 🟡 'Items N' toolbar button opens Manage Line Items drawer with live count | ManageLineItemsModal opens; tag shows projectDetails.lineItems.length |
| FE-4.2 | 🟠 Removing every line item and saving is rejected | logError: 'Please add atleast one item to proceed!'; drawer stays open |
| FE-4.3 | 🟠 Zero/blank quantity on any line item is rejected | logError: 'Please fill valid quantity on every line item' |
| FE-4.4 | ⚪ Saving with no actual changes silently closes the drawer | Drawer closes (setVisible(false)); no handleOk/API call fires |
| FE-4.5 | 🟠 Manage Line Items drawer is read-only during fromPR, disableProjectEditInDraft, or isAddNewStage _(gates: fromPR, disableProjectEditInDraft, isAddNewStage)_ | disabled prop true; add/remove/edit controls inert |
| FE-4.6 | 🟡 Quantity remains editable in a disabled drawer only when created from PR _(gates: fromPR)_ | Quantity field editable (quantityChangeEnabled=fromPR) even though other fields are disabled |
| FE-4.7 | 🟠 Non-BOQ line item count boundary at 65 | 65 items publish cleanly; 66 items trigger 'Maximum no of product addition reached' |
| FE-4.8 | 🟠 BOQ line item count boundary at 500 | 500 items publish cleanly; 501 items trigger errors.maxLineItems |
| FE-4.9 | 🟡 maxLineItems check is skipped for basket-auction stages _(gates: isBasketAuction)_ | No maxLineItems error regardless of count (!isBasketAuction guard) |
| FE-4.10 | 🟡 Missing backend line-item-limit config falls back to 500/65 | selectMaximumLineItemsLimit returns {boq:500, nonBoq:65} |

## 5. Participants / Audience

| # | Case | Expected |
|---|---|---|
| FE-5.1 | 🔴 Publish blocked when no valid participants array is present | logError: 'Please add participants to proceed!'; publish short-circuits before any per-stage validation |
| FE-5.2 | 🔴 Vendor masking removes the Audience tab from order details _(gates: tradeConfig.isVendorMaskingEnabled)_ | Audience tab absent from tab list |
| FE-5.3 | 🟠 Vendor masking hides Convert to Auction regardless of RFQ status _(gates: tradeConfig.isVendorMaskingEnabled)_ | 'Convert to Auction' absent (showConvertToAuction requires !isVendorMaskingEnabled) |
| FE-5.4 | ⚪ Quick invite vendor shows success toast with the invited email | message.success interpolates the invited company's email into inviteSentSuccessMessage |
| FE-5.5 | 🟠 Audience panel requires at least one participant selected to continue | Note shown: 'Select atleast one participant in order to continue.' |
| FE-5.6 | 🟡 RFQ→Auction 'All invited' toggle switches audience source _(gates: useRfqParticipants)_ | Off: only bidding participants carried forward (isBidPlace true only for biddingParticipantsUuid); On: all RFQ participants carried with isBidPlace flagged per bidder |
| FE-5.7 | 🟡 Blacklisted vendors excluded from pre-fill even when tagged | preFilledVendor returns false; vendor not auto-selected |
| FE-5.8 | 🟡 TNA vendor bidding gated by allowTnaVendorsToBid during conversion _(gates: allowTnaVendorsToBid)_ | TNA vendors excluded from bidding audience when flag false, included when true |

## 6. Savings

| # | Case | Expected |
|---|---|---|
| FE-6.1 | 🟡 New stage defaults savingsColumn to {budget:'price'} | savingsColumn === {budget: 'price'}; savingsReferenceStrategy==='historical_price' |
| FE-6.2 | 🔴 Stage with no template fails savings column validation | logError: 'Please select a valid column for savings' (savingsColumn key not present in widgets) |
| FE-6.3 | 🔴 Savings mandatory config blocks publish without any savings entry _(gates: isSavingsConfigurationMandatory)_ | logError: 'Savings configuration is mandatory' |
| FE-6.4 | 🟠 RFQ→Auction bypasses the savings-mandatory check _(gates: isSavingsConfigurationMandatory, isRFQtoAuction)_ | No savingConfiguration error even though the tenant mandates it (isRFQtoAuction short-circuits the check) |
| FE-6.5 | 🟡 Duplicate custom savings strategy name rejected | logError: 'Savings Strategy Already Present!' |
| FE-6.6 | ⚪ Valid new custom strategy created and auto-selected | message.success: 'New Savings Strategy Created!'; new strategy becomes currentStrategy |
| FE-6.7 | 🟡 Basket auction forces savings to line-item only _(gates: isBasketAuction)_ | Gross-total option disabled with tooltip 'For basket auction, savings can only be on line item.' |
| FE-6.8 | ⚪ Clipboard paste denial surfaces a readable error | message.error: 'Clipboard permission denied. Please allow access or paste manually.' |
| FE-6.9 | ⚪ savingsStrategy defaults to gross total (lot) | savingsStrategy===ORDER_CLOSING_MODE.lot ('lot_based') |
| FE-6.10 | 🟡 Currency mismatch on savings reference input surfaces currency-specific error | Error label: 'Please enter price in <currency>' |
| FE-6.11 | 🟠 Multi-currency modal blocks proceeding with zero currencies selected | 'Please select atleast one currency.' shown; modal does not close |
| FE-6.12 | ⚪ savingsOptions defaults mirror STRATEGY_OPTIONS_LABEL verbatim | savingsOptions === {budget:'Budget', historical_price:'Historical Price', existing_proposal:'Existing Proposal'} |

## 7. Schedule (duration, evaluation time, recurring events)

| # | Case | Expected |
|---|---|---|
| FE-7.1 | 🟡 New stage eventEndTime defaults to 1800s relative | eventEndTime===1800; eventEndTimeType===EVENT_TIME_SCHEDULE_TYPE.relative |
| FE-7.2 | 🔴 Publish blocked when eventEndTime is unset | logError: 'Please add end time for the event' |
| FE-7.3 | 🔴 Technical stage ending after the RFQ stage's end time blocks publish | logError: 'RFP duration exceeds RFQ end time. Please adjust.'; no stage-level API calls made |
| FE-7.4 | 🟠 Serial bidding without evaluation time blocks publish | logError: 'Evaluation time is mandatory for serial bidding' |
| FE-7.5 | 🟠 hasDeliveryDate without a deliveryDate blocks publish | logError: 'Please add delivery date' |
| FE-7.6 | 🟡 Recurring interval caps differ by cadence: 365 daily/custom, 52 weekly, 12 monthly | Each is clamped/rejected at intervalMaxMap {month:12, week:52} with fallback 365 otherwise |
| FE-7.7 | ⚪ Recurring config defaults to daily/interval-1/never-ends | recurringConfig matches DEFAULT_RECURRING_CONFIG: scheduleType='daily', interval=1, repeatType='day', recurringEnds='never' |
| FE-7.8 | 🟠 Publishing a recurring stage opens the Recurring confirm modal, not the standard one | RecurringConfirmModal opens instead of ConfirmModal; primary button reads 'Save Recurring Event' |
| FE-7.9 | ⚪ Recurring frequency label formats correctly per cadence | Labels read 'Daily', 'Every 3 Weeks on Monday', 'Monthly on Last Day' respectively |
| FE-7.10 | 🟡 Custom dynamic closing time (-1 sentinel) requires its own valid number | errors.customDynamicClosingTime set; independent of the primary dynamicClosingTime check |

## 8. Terms & Conditions

| # | Case | Expected |
|---|---|---|
| FE-8.1 | 🟡 isTncMandatoryByDefault seeds isTncMandatory=true on new stages _(gates: tradeConfig.isTnCMandatoryByDefault)_ | Stage's isTncMandatory initialized true from tradeConfig |
| FE-8.2 | 🟠 Payment Terms modal requires both Payment Terms and Incoterms before Save enables | yup validation errors: 'Payment Terms is mandatory' / 'Incoterms is mandatory'; Save button disabled while form is pristine (!isDirty) |
| FE-8.3 | 🟠 Enabled payment-T&C without a valid paymentTnc object blocks publish _(gates: paymentTncEnabled)_ | logError: 'Payment Terms and Conditions are mandatory' |
| FE-8.4 | 🟡 T&C selection disabled during draft-edit lock, add-new-stage, or RFQ→Auction conversion _(gates: disableProjectEditInDraft, isAddNewStage, isRFQtoAuction)_ | EditTncModal rendered with disabled=true (disableProjectTnCSelection) |
| FE-8.5 | ⚪ 'Added' tag appears on Add T&Cs button once any T&C or attachment exists | Green 'Added' Tag rendered next to the button label |
| FE-8.6 | ⚪ ATTACHMENT_TYPES.tnc key stays 't_and_c' across create/edit | attachment type key remains 't_and_c' (regression guard) |

## 9. Auction configuration per strategy

| # | Case | Expected |
|---|---|---|
| FE-9.1 | 🟡 Rank is the default strategy and type for a new stage | strategy===AUCTION_STRATEGY.RANK ('rank'); type===AUCTION_STRATEGY_NAME.RANK ('Rank') |
| FE-9.2 | 🔴 Knockout/Dutch strategy tabs disabled in eRFX unless converting RFQ→Auction _(gates: isErfxAllowed, isRfqToAuction)_ | Both tabs disabled with tooltips: 'Knockout auctions can be created only when converting an RFQ to an auction.' / 'Dutch auctions can be created only when converting an RFQ to an auction.' |
| FE-9.3 | 🟠 Knockout/Dutch tabs enabled during an actual RFQ→Auction conversion _(gates: isRfqToAuction)_ | Knockout and Dutch tabs selectable (isTabDisabled=false) |
| FE-9.4 | 🔴 basePrice empty/zero for Knockout/Dutch fails validation | errors.basePrice and errors.allStrategy set |
| FE-9.5 | 🔴 knockoutTick (tick size) empty/zero for Knockout/Dutch fails validation | errors.tickSize and errors.allStrategy set |
| FE-9.6 | 🟠 knockoutTick below globalTickSize fails even if otherwise valid _(gates: globalTickSize)_ | errors.tickSize set for both Knockout and Dutch strategies |
| FE-9.7 | 🟠 Dutch tick size exceeding (basePrice-endPrice) fails for sell orders | errors.tickSize set because tickSize(15) > basePrice-endPrice(10) |
| FE-9.8 | 🟠 Dutch tick size exceeding (endPrice-basePrice) fails for buy orders | errors.tickSize set because tickSize(15) > endPrice-basePrice(10) |
| FE-9.9 | 🟡 Knockout tick size exceeding basePrice fails only for buy orders (asymmetric check) | Buy order: errors.tickSize set. Sell order: no equivalent bound is checked (code only tests !isOrderTypeSell branch) — record this asymmetry as a known gap |
| FE-9.10 | 🟠 knockoutTimeDiff boundary at 0.5 minutes | 0.5 passes (>=0.5); 0.49 fails errors.timeDiff |
| FE-9.11 | 🟠 knockoutTimeDiff valid but stage duration too short still fails | errors.timeDiff set because eventDuration is not strictly greater than knockoutTimeDiff*60 |
| FE-9.12 | 🔴 Dutch endPrice direction violated for sell order | errors.endPrice set (sell requires basePrice>=endPrice) |
| FE-9.13 | 🔴 Dutch endPrice direction violated for buy order | errors.endPrice set (buy requires basePrice<=endPrice) |
| FE-9.14 | 🟠 Non-default currency selection blocked for Knockout/Dutch strategies | logError: 'Currency configuration cannot be added in Knockout / Dutch Auction' |
| FE-9.15 | 🟠 Traffic Light price range requires lowerPrice<=upperPrice for buy orders | errors.trafficLight set |
| FE-9.16 | 🟠 Traffic Light price range requires lowerPrice>=upperPrice for sell orders (inverted) | errors.trafficLight set (sell direction is inverted vs buy) |
| FE-9.17 | 🟠 Traffic Light rank range requires lowerRank<=upperRank | errors.trafficLight set |
| FE-9.18 | 🟡 Traffic Light range checks skipped for basket auctions and item-based closing _(gates: isBasketAuction)_ | No errors.trafficLight raised (guard requires !isBasketAuction and closingOn===lot) |
| FE-9.19 | 🟠 Multi-product Auction (non-knockout/dutch/book_building) requires closingOn set | logError: 'Please select closing on mode for the event' |
| FE-9.20 | 🟠 Dynamic closing time only offered for non-Knockout/Dutch auction strategies | Control enabled for Rank/Price/Traffic/Book Building; unavailable for Knockout/Dutch (dynamicClosingAllowed excludes them) |
| FE-9.21 | 🟠 Dynamic closing time enabled with invalid value fails | logError: 'Please add valid dynamic closing time' |
| FE-9.22 | 🟡 numRevisionsReqToShowIndicator must be digits-only when enabled | errors.numRevisionsReqToShowIndicator set (regex /^\d+$/ rejects decimals) |
| FE-9.23 | 🟡 numRevisionsReqToShowIndicator payload omitted for Knockout/Dutch even if enabled | numRevisionsReqToShowIndicator sent as undefined in payload regardless of the entered value |
| FE-9.24 | ⚪ English Auction toggle off by default, gated by isEnglishAuctionAllowed _(gates: isEnglishAuctionAllowed)_ | Both default false; toggle only rendered/enabled when isEnglishAuctionAllowed is provided true from backend config |
| FE-9.25 | 🟠 Closed-envelope bidding sent only when trade mode + project creation + bid-masking flag all true _(gates: enableBidMaskingForEvent, isProjectCreation)_ | First case: closedEnvelopeBidding sent as configured boolean. Second case: field is undefined (omitted), not false |
| FE-9.26 | 🟡 offersOn forced to lineTotal for every eRFX stage at publish time _(gates: isErfxAllowed)_ | stage.offersOn is overridden to WIDGET_TYPES.lineTotal right before payload construction, overriding the UI selection |

## 10. Technical stage questionnaire & evaluators

| # | Case | Expected |
|---|---|---|
| FE-10.1 | 🔴 Empty Vendor Assessment global section blocks publish | logError: 'There are some errors in vendor specific sections, please check and try again' |
| FE-10.2 | 🔴 Lot-level RFP evaluation requires at least one evaluator on the global section | logError: 'Please add Evaluator in the Technical Stage' |
| FE-10.3 | 🔴 Line-level RFP evaluation requires evaluators on every line item | logError: 'Please add Evaluator to all the line items in the Technical Stage' |
| FE-10.4 | 🟠 Single-question RFP section left blank triggers 'some sections are empty' | logError: 'Some sections are empty, please check and try again' |
| FE-10.5 | 🔴 Section-wise-scoring template rejected for any non-Vendor-Assessment RFI section | message.error blocks the apply; template restricted to the global Vendor Assessment section only |
| FE-10.6 | 🟡 getDefaultTrGlobalSection seeds a single-row Vendor Assessment table | sectionId='global_section', name='Vendor Assessment', configuration.type=table, one empty row created via createRow(widgets) |
| FE-10.7 | 🟡 Removing an applied Vendor Assessment template resets template state | rfiGlobalTemplateName='', rfiGlobalSectionTemplateId=null, sectionWiseMaxScore/sectionWiseScoringEnabled cleared, section resets to getDefaultTrGlobalSection |
| FE-10.8 | 🟠 RFI mode requires rfiData to be an array | errors.allTemplates set |
| FE-10.9 | 🟡 AI RFP Generator merge preserves already-answered questions | Manually-answered questions retained; only unresolved/new questions get AI-generated content merged in |
| FE-10.10 | ⚪ Exactly 7 question types are exposed in the field type picker | Exactly: Short Text, Long Text, Single Select, Radio, Number, Attachment, Date |

## 11. Publish / draft

| # | Case | Expected |
|---|---|---|
| FE-11.1 | 🔴 Empty project title blocks publish immediately | logError: 'Please fill project title!'; function returns before any stage validation runs |
| FE-11.2 | 🟠 Confirm-modal OK disabled until every stage has been visited | OK button disabled (areAllStagesReviewed===false) |
| FE-11.3 | 🟡 Confirm-modal OK disabled when remarks are required but empty _(gates: remarksData.showRemarks)_ | OK button remains disabled until remarks is a non-empty string |
| FE-11.4 | ⚪ Per-stage errors stamp onto stageConfig and auto-clear errorData after 3s | errors.errorData is deleted from the current stage after the 3-second timeout, other error keys persist |
| FE-11.5 | 🟡 Rollup toast lists stage title plus humanized error keys when no specific message fired | Toast per stage: '<Stage Title> - There are some errors in <humanized keys>, please check and try again' |
| FE-11.6 | 🟠 Payload status is 'draft' whenever projectId exists or publishToDraft is true | status==='draft'; otherwise 'active' |
| FE-11.7 | 🟠 publishToDraft auto-enables when routing auctions to the auction team and current user isn't on it _(gates: tradeConfig.routeAuctionsToAuctionTeam, isAuctionTeamUser)_ | publishToDraft===true; event routed to draft for the auction team to publish |
| FE-11.8 | 🟠 publishToDraft also enables via isRfqToAuctionInDraft during conversion _(gates: tradeConfig.isRfqToAuctionInDraft, isRfqToAuction)_ | publishToDraft===true regardless of auction-team membership |
| FE-11.9 | 🟠 Auction-team member converting RFQ→Auction calls moveToAuction directly _(gates: isRfqToAuction, isAuctionTeamUser)_ | moveToAuction invoked instead of createOrder/editOrderForCreation |
| FE-11.10 | 🟡 Save (draft) button hidden when auctions route to the auction team _(gates: tradeConfig.routeAuctionsToAuctionTeam)_ | Save Project button not rendered (showSaveProjectButton===false) |
| FE-11.11 | ⚪ Publish button label reflects draft-routing vs recurring vs normal publish | 'Send to Auction team' / 'Save Recurring Event' / 'Publish' respectively |
| FE-11.12 | 🟡 Successful publish clears cached quick-flow draft and redirects | store.remove(PROCOL_EVENT_DRAFT_FOR_QUICK_FLOW) called; isNavigationBlocked set false; redirect executes |

## 12. RFQ→Auction conversion

| # | Case | Expected |
|---|---|---|
| FE-12.1 | 🟠 Convert to Auction offered only for non-draft RFQs without vendor masking _(gates: tradeConfig.isVendorMaskingEnabled)_ | 'Convert to Auction' menu item present |
| FE-12.2 | 🟠 Convert to Auction disabled when closed, old version, or on hold _(gates: isOldVersion, isProjectOnHold)_ | 'Convert to Auction' Menu.Item disabled |
| FE-12.3 | 🟡 Pending bid-justification blocks the conversion popover in favor of the justification modal | isLotJustificationPending set true; the conversion popover does not open until justification is resolved |
| FE-12.4 | 🔴 Confirming conversion opens CREATE_QUICK_ORDERS with the full query-param set | New tab opens with draftStageIds=[id], isRfqToAuction=true, isEditingAllowed=false, plus the four chosen flags echoed verbatim |
| FE-12.5 | 🟠 eRFX tenants get extra projectCreation/title/projectId/boqProject params on conversion _(gates: isErfxAllowed)_ | URL additionally carries projectCreation=true, title, projectId, and boqProject=true only if the source is a BOQ project |
| FE-12.6 | 🔴 Destination screen forces stage mode to auction regardless of source rfx_mode _(gates: isRFQtoAuction)_ | getMode({mode, isRFQtoAuction}) returns 'auction' in all cases |
| FE-12.7 | 🟠 tradeConfig defaults seed the recreated Auction stage on conversion | auctionClosingMode, isTncMandatory, fastBiddingMode, dynamicClosingTime, dynamicConfigurableTime, timeExtensionBidRevision, closedEnvelopeBiddingForRfqs all pulled from tradeConfig into the new stage |
| FE-12.8 | 🟡 dynamicClosingTimeEnabled sourced differently for auction-team vs non-auction-team users on conversion _(gates: isAuctionTeamUser)_ | Auction-team: uses the RFQ's own dynamicClosingTimeEnabled. Non-auction-team: uses tradeConfig.defaultDynamicClosingTimeAllowed |
| FE-12.9 | ⚪ Conversion flags are tracked in analytics | trackEvent(EVENT_NAME.CONVERT_RFQ_TO_AUCTION, {...all four flags}) fires |
| FE-12.10 | 🟠 Product/sheet edits blocked during RFQ→Auction conversion with explanatory copy _(gates: isRFQtoAuction)_ | Edits blocked; copy shown: 'You cannot make changes to the product because you are creating this event from an existing RFQ' |

## 13. Negative — input validation

| # | Case | Expected |
|---|---|---|
| FE-13.1 | ⚪ basePrice with extra decimal precision still accepted via the numeric OR-branch | Accepted (no errors.basePrice) because +basePrice>0 short-circuits, even though the /^\d+(\.\d{1,2})?$/ regex would reject 3 decimal places — record as a validation-looseness finding |
| FE-13.2 | 🟠 Negative basePrice string rejected | errors.basePrice set (fails both the regex and the >0 check) |
| FE-13.3 | 🟠 knockoutTick='0' rejected | errors.tickSize set (0 is not > 0) |
| FE-13.4 | 🟠 knockoutTimeDiff string boundary '0.5' vs '0.49999' | '0.5' passes the >=0.5 bound; '0.49999' fails errors.timeDiff |
| FE-13.5 | 🟠 Non-numeric dynamicClosingTime fails unless it equals the -1 custom sentinel | logError: 'Please add valid dynamic closing time' |
| FE-13.6 | 🟡 Blank customDynamicClosingTime in Custom mode fails silently (no dedicated toast) | errors.customDynamicClosingTime set in stage errors, but handleClickPublish has no logError branch for this key — no toast is shown to the user beyond the generic per-stage rollup |
| FE-13.7 | 🟡 Invalid dynamicConfigurableTime fails silently (no dedicated toast) | errors.dynamicConfigurableTime set, no matching logError in handleClickPublish |
| FE-13.8 | 🟡 Missing timeExtensionBidRevision fails silently (no dedicated toast) | errors.timeExtensionBidRevision set, no matching logError in handleClickPublish |
| FE-13.9 | 🟡 numRevisionsReqToShowIndicator rejects decimal input | errors.numRevisionsReqToShowIndicator set (regex /^\d+$/ has no decimal point) |
| FE-13.10 | 🟠 Required widget left blank on a non-last row fails with sheet-partial toast | logError: 'Sheet partially filled, please check again.'; errors.keyError lists the offending widget keys |
| FE-13.11 | 🟠 Validation-column max<=min fails 'incorrect validation' toast | logError: 'Please fill correct values in the validation columns' |
| FE-13.12 | 🟡 Validation-column tick exceeding (max-min) fails the same check | errors.incorrectValidation set |
| FE-13.13 | 🟡 Single-product order exempt from closingOn-required and traffic-light checks | No errors.closingOn / errors.trafficLight raised (isMultiProductOrder()===false short-circuits both checks) |
| FE-13.14 | 🟠 Basket auction with no time interval set fails publish _(gates: isBasketAuction)_ | logError: 'Please add basked auction interval time' (note: source has this exact duplicated-typo string wired twice under the same condition, not two distinct states) |
| FE-13.15 | 🟡 Basket auction custom interval (-1) with invalid custom time fails silently _(gates: isBasketAuction)_ | errors.basketAuctionCustomTime set, but handleClickPublish has no dedicated logError for this key |
| FE-13.16 | 🟠 Line item count exactly at the limit is accepted; limit+1 is rejected | 65 accepted; 66 rejected with 'Maximum no of product addition reached' |

## 14. Negative — failure handling

| # | Case | Expected |
|---|---|---|
| FE-14.1 | 🔴 One failed per-stage API call short-circuits the whole publish, no redirect | Promise.all resolution detects 'error' via unwrapResult; updateProject/redirect never execute; user remains on the creation screen |
| FE-14.2 | 🟠 savingsColumn referencing a widget removed after a template swap fails revalidation | errors.savingsColumn set again even though a column was previously chosen (widgets[key] no longer an object) |
| FE-14.3 | 🔴 Deleting the last stage is impossible client-side | Delete menu item disabled; no API call to delete the only stage is ever issued |
| FE-14.4 | 🟠 Rapid double-click on Publish does not duplicate stage creation | Second click is a no-op while creationLoading is true; only one set of createOrder calls fires |
| FE-14.5 | 🟡 Confirmed template switch destroys existing sheet data with no undo | Previous sheet data is irrecoverable client-side; confirm-dialog copy discloses this before the user commits |
| FE-14.6 | 🟡 fetchDraftEventDetails failure during single-stage draft population — record actual behavior | No confirmed graceful error state in source for this path; record what actually renders (spinner stuck vs blank vs silent failure) as this is undocumented |
| FE-14.7 | ⚪ Clipboard-read rejection is caught and surfaced, not an unhandled promise rejection | try/catch in the handler surfaces message.error rather than throwing to the console as unhandled |
| FE-14.8 | 🟠 Cross-stage RFP/RFQ time-order guard runs before any network call | The guard fires and returns before Object.keys(stageConfig).forEach(...) begins, so zero createOrder/editOrderForCreation calls are made |

## 15. Access & permission isolation

| # | Case | Expected |
|---|---|---|
| FE-15.1 | 🔴 Non-eRFX tenants never see the multi-stage project-creation UI _(gates: isErfxAllowed)_ | Only the single-stage quick-create screen renders; no stage tabs, no project title field, no '+' stage dropdown |
| FE-15.2 | 🟡 Clara AI summary hidden when isClaraEnabled is false _(gates: isClaraEnabled)_ | Clara summary panel not rendered despite the data being present |
| FE-15.3 | 🟡 Recurring scheduler hidden when isScheduledEventsEnabled is false _(gates: isScheduledEventsEnabled)_ | Recurring-event toggle/settings absent regardless of stage mode |
| FE-15.4 | 🟡 PR-sourced attachments stripped when isPrAttachmentsInEventDisabled is true _(gates: isPrAttachmentsInEventDisabled)_ | PR attachments are not carried into the event's attachment list |
| FE-15.5 | 🟡 Save Project button hidden when service RFP form grouping is enabled _(gates: groupServiceActivitiesInRfp)_ | Save Project draft button not rendered even if allowDraftProjectCreation is true |
| FE-15.6 | 🟡 'Add New Stage' hidden by default when backend omits add_new_stage_config | addNewStageConfig defaults to {disabled:true, hidden:true, label:''}; menu item not rendered |
| FE-15.7 | 🟠 View-only dashboard disables Reschedule, Unlock Bids, CBD extension, and Bulk Counter Offer together _(gates: isViewOnlyDashboardEnabled)_ | All four listed menu items disabled simultaneously |
| FE-15.8 | 🔴 Viewing a superseded amendment (isOldVersion) disables nearly every lifecycle action _(gates: isOldVersion)_ | Recreate, Split Line Items, Extend Time, End Time, Convert to Auction, Unlock Bids, Counter Offer, Re-evaluation, Disable Auto-Awarding, Skip Vendor Review all disabled |
| FE-15.9 | 🟠 isProjectOnHold disables the same broad action set independently of isOldVersion _(gates: isProjectOnHold)_ | Same lifecycle actions disabled as FE-15.8, via an independent OR-condition |
| FE-15.10 | 🟠 Withdraw disabled only while live, under isWithdrawDisabledDuringSubmissionTime _(gates: tradeConfig.isWithdrawDisabledDuringSubmissionTime)_ | Withdraw disabled with tooltip 'Auction cannot be withdrawn when the event is live'; re-enabled once status leaves live |
| FE-15.11 | 🟠 Users without withdraw permission never see the Withdraw/Cancel item _(gates: isUserAllowedToWithdrawProject)_ | Withdraw/Cancel Menu.Item absent entirely, independent of status list matching |
| FE-15.12 | 🟡 hideAudience config also hides Comments and Event Summary tabs, not just Audience _(gates: tradeConfig.hideAudience)_ | Comments and Event Summary tabs absent alongside Audience — broader hide than the flag name suggests |

## 16. Backward compatibility

| # | Case | Expected |
|---|---|---|
| FE-16.1 | 🔴 Amendment drafts freeze stage composition entirely | '+' stage dropdown returns null (not just disabled); Delete menu item never rendered for any stage |
| FE-16.2 | 🟠 Recurring-stage edit mode overrides the length===1 Delete rule | Delete is absent for that stage even though other stages exist (recurring edit mode takes precedence) |
| FE-16.3 | 🟡 Tenants without add_new_stage_config behave identically before and after this feature shipped | Both hide 'Add New Stage' identically via the same default fallback object |
| FE-16.4 | 🟡 Tenants without a configured line-item limit keep the historical 500/65 ceiling | Both still rejected at the hardcoded fallback ceilings, matching pre-existing behavior |
| FE-16.5 | 🟠 Recreated drafts populate through the same getNewStageData defaults as brand-new stages | Fields not present in the old draft (e.g. autoAwardingEnabled, isTncMandatory) fall back to getNewStageData's defaults rather than becoming undefined/crashing |
| FE-16.6 | 🟡 Old creation-flow-configured tenants still route through the legacy createOrder.jsx screen | Legacy single-screen createOrder.jsx flow renders, unaffected by projectCreation.jsx/eventCreation.jsx multi-stage logic |
| FE-16.7 | 🟡 Legacy 'rfq_then_auction' mode string still coerces to plain 'auction' | Returns 'auction' just as isRFQtoAuction=true does, preserving old-format compatibility |
| FE-16.8 | ⚪ ATTACHMENT_TYPES.tnc key and PROJECT_STAGES ordering remain stable | Attachment type key stays 't_and_c'; PROJECT_STAGES order (rfp:0, rfq:1, auction:2) still governs tab ordering, so old stage order doesn't visually shift |

## 17. Regression

| # | Case | Expected |
|---|---|---|
| FE-17.1 | 🟡 Single-stage non-eRFX Auction/Rank creation unaffected by multi-stage logic | Behaves identically to pre-eRFX baseline; no stage-tab machinery involved |
| FE-17.2 | 🟡 BOQ project auto-draft-creation fires exactly once per mount _(gates: isBoqProjectCreation)_ | createProject({isBoqBasedRfx:true}) called exactly once, guarded by !isArray(draftStageIds) && !isRFQtoAuction && !fromPR |
| FE-17.3 | 🟡 PR→event title generation strings remain unchanged | Titles read '[Reverse Auction] <product> - <location>' (buy), '[Forward Auction] ...' (sell), 'RFQ' variant for mode=rfq, with '& more' / family-name grouping for multi-product PRs |
| FE-17.4 | 🟡 Draft-event fetch still populates knockout/dutch fields into the same stage keys | knockoutDutchDetails.tickSize/timeDiff/initialPrice/dutchEndPrice map to knockoutTick/knockoutTimeDiff/basePrice/endPrice respectively, unchanged by new validation logic |
| FE-17.5 | ⚪ Technical-stage question ordering (global section first) preserved on re-edit | combinedRfiData still orders rfiGlobalSection ahead of rfiData, keeping question order stable |
| FE-17.6 | ⚪ Dynamic closing time remains unavailable on re-edit for previously-published Knockout/Dutch auctions | Dynamic closing time control still absent/disabled (dynamicClosingAllowed unchanged) |
| FE-17.7 | ⚪ Stage auto-numbering matches pre-existing titles when reopening an old 2-stage draft | getTitleForStage's numbering scheme still produces 'RFQ'/'RFQ 2' consistent with how the draft was originally titled |
| FE-17.8 | ⚪ WIDGETS_TO_BE_DISABLED_FOR_ERFX still disables product/creator_quantity/variant on eRFX sheets _(gates: isErfxAllowed)_ | All 3 remain non-editable, regardless of any per-stage validation changes made elsewhere |

## Known issues — log, don't raise as new

| Issue | Case | Note |
|---|---|---|
| `basePrice`/`knockoutTick` regex is effectively bypassable | FE-13.1 | `!(regexTest \|\| value > 0)` means any positive number passes even with 3+ decimal places; the `/^\d+(\.\d{1,2})?$/` regex is close to dead code. `src/views/projectCreation/helpers.js:396-408` |
| Knockout tick-vs-basePrice bound is one-sided | FE-9.9 | Only checked for buy orders (`!isOrderTypeSell`); sell-side Knockout has no equivalent tick/basePrice bound. `src/views/projectCreation/helpers.js:424-433` |
| Three validation keys have no toast wired | FE-13.6, FE-13.7, FE-13.8, FE-13.15 | `errors.customDynamicClosingTime`, `errors.dynamicConfigurableTime`, `errors.timeExtensionBidRevision`, `errors.basketAuctionCustomTime` all block publish silently — the user only sees the generic per-stage rollup toast, not a specific message. `src/views/projectCreation/projectCreation.jsx:1595-1730` |
| `numRevisionsReqToShowIndicator` silently dropped for Knockout/Dutch | FE-9.23 | Value the user entered is discarded at payload time even though the field was enabled and validated. `src/views/projectCreation/helpers.js:990-995` |
| `offersOn` UI selection overridden for eRFX | FE-9.26 | Whatever the auction-config UI sets is discarded and forced to `lineTotal` right before payload build when `isErfxAllowed`. `src/views/projectCreation/projectCreation.jsx:1772-1776` |
| `hideAudience` hides more than audience | FE-15.12 | Also hides Comments and Event Summary tabs — name doesn't match scope. `src/views/orderDetails/eventHeader/eventHeader.jsx:433-438` |
| Duplicated basket-auction-interval branch | FE-13.14 | Source has the identical `if (errors.basketAuctionTimeInterval)` / `logError` pair twice in `handleClickPublish` — dead duplication, not two distinct states. `src/views/projectCreation/projectCreation.jsx:1673-1680` |
| `fetchDraftEventDetails` failure path unverified | FE-14.6 | No explicit error-state handling found in source for this fetch; actual UI behaviour on failure needs manual confirmation. `src/views/projectCreation/projectCreation.jsx:1144-1160` |

## Exit criteria

- Sections 1-2 (happy paths, stage composition) pass on both an eRFX and a classic tenant.
- Sections 9-10 (auction config, technical stage) pass for every strategy named, including the Knockout/Dutch RFQ→Auction-only gate.
- Section 12 (RFQ→Auction) passes with both `isErfxAllowed=true` and `=false` destination tenants.
- Sections 13-14 (negative input/failure handling) show every listed toast firing verbatim, and the four silent-gap keys (Known issues) are explicitly re-confirmed as silent, not newly fixed or newly broken.
- Section 15 (access/permission) is re-run against at least one tenant with each gating flag both on and off.
- Sections 16-17 (backward compat, regression) show no movement versus the already-verified live behaviour listed in the ground-truth brief (default Auction stage, 2-stage max, Delete disabled at one stage, Vendor Assessment requirement, template-less savings failure).

## Evidence

Maps every case id to its source citation(s). Line numbers refer to the `procol-client-dashboard` checkout at the time of this audit.

| Case | Source |
|---|---|
| FE-1.1 | src/views/projectCreation/helpers.js:61-75; src/views/projectCreation/helpers.js:85-95 |
| FE-1.2 | src/views/projectCreation/constants.js:115-123; src/views/projectCreation/projectCreation.jsx:2081-2086 |
| FE-1.3 | src/views/projectCreation/projectCreation.jsx:3059-3083; src/views/projectCreation/projectCreation.jsx:3111-3159 |
| FE-1.4 | src/constants/index.js:110-117 |
| FE-1.5 | src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:871-880 |
| FE-1.6 | src/views/projectCreation/helpers.js:450-463 |
| FE-1.7 | src/views/projectCreation/helpers.js:450-463 |
| FE-1.8 | src/views/projectCreation/helpers.js:544-566 |
| FE-1.9 | src/views/projectCreation/helpers.js:568-576 |
| FE-1.10 | src/views/projectCreation/helpers.js:320-367 |
| FE-1.11 | src/views/projectCreation/helpers.js:920-923 |
| FE-1.12 | src/views/projectCreation/projectCreation.jsx:3085-3101 |
| FE-2.1 | src/views/projectCreation/constants.js:121-123; src/views/projectCreation/projectCreation.jsx:2081-2086 |
| FE-2.2 | src/views/projectCreation/projectCreation.jsx:3059-3083; src/views/projectCreation/projectCreation.jsx:3210-3217 |
| FE-2.3 | src/views/projectCreation/projectCreation.jsx:3167-3195 |
| FE-2.4 | src/views/projectCreation/projectCreation.jsx:3075-3080 |
| FE-2.5 | src/views/projectCreation/projectCreation.jsx:3068-3073 |
| FE-2.6 | src/views/projectCreation/projectCreation.jsx:3059-3083 |
| FE-2.7 | src/views/projectCreation/projectCreation.jsx:3059-3083 |
| FE-2.8 | src/views/projectCreation/projectCreation.jsx:3167-3170 |
| FE-2.9 | src/views/projectCreation/projectCreation.jsx:3127-3134 |
| FE-2.10 | src/views/projectCreation/projectCreation.jsx:3112-3134 |
| FE-2.11 | src/views/projectCreation/projectCreation.jsx:3144-3149 |
| FE-2.12 | src/views/projectCreation/projectCreation.jsx:3064-3066 |
| FE-2.13 | src/views/projectCreation/projectCreation.jsx:3047-3056 |
| FE-2.14 | src/views/projectCreation/projectCreation.jsx:3482-3486; src/views/eventCreation/components/footer/confirmModal.jsx:35-41; src/views/eventCreation/eventCreation.jsx:1713-1717 |
| FE-2.15 | src/views/projectCreation/helpers.js:1017-1037 |
| FE-3.1 | src/views/eventCreation/templateSelection.jsx:136-138,569 |
| FE-3.2 | src/views/eventCreation/templateSelection.jsx:337-339 |
| FE-3.3 | src/views/eventCreation/templateSelection.jsx:348-359 |
| FE-3.4 | src/views/eventCreation/templateSelection.jsx:361-372; src/views/rfiBuilder/rfiTableSection.jsx:244-250 |
| FE-3.5 | src/views/eventCreation/templateSelection.jsx:574; src/views/projectCreation/helpers.js:312-314 |
| FE-3.6 | src/views/eventCreation/templateSelection.jsx:141 |
| FE-3.7 | src/translations/en.json:552 |
| FE-3.8 | src/views/eventCreation/productSheet/productSheet.jsx:129-133 |
| FE-3.9 | src/views/eventCreation/productSheet/productSheet.jsx:129-142 |
| FE-3.10 | src/views/projectCreation/constants.js:105-109; src/views/projectCreation/projectCreation.jsx:780 |
| FE-4.1 | src/views/projectCreation/projectCreation.jsx:3327-3336 |
| FE-4.2 | src/views/projectCreation/components/manageLineItemsModal.jsx:117-122 |
| FE-4.3 | src/views/projectCreation/components/manageLineItemsModal.jsx:90-93,113-116 |
| FE-4.4 | src/views/projectCreation/components/manageLineItemsModal.jsx:83-112 |
| FE-4.5 | src/views/projectCreation/projectCreation.jsx:3570 |
| FE-4.6 | src/views/projectCreation/projectCreation.jsx:3571; src/views/projectCreation/components/manageLineItemsModal.jsx:234,242 |
| FE-4.7 | src/views/projectCreation/helpers.js:369-374; src/redux/user/selectors.js:346-359 |
| FE-4.8 | src/views/projectCreation/helpers.js:369-374 |
| FE-4.9 | src/views/projectCreation/helpers.js:372-374 |
| FE-4.10 | src/redux/user/selectors.js:346-359 |
| FE-5.1 | src/views/projectCreation/projectCreation.jsx:1604-1609 |
| FE-5.2 | src/views/orderDetails/eventHeader/eventHeader.jsx:439-443 |
| FE-5.3 | src/views/orderDetails/eventHeader/eventHeader.jsx:220-223 |
| FE-5.4 | src/views/eventCreation/components/participants/participantsSelection.jsx:636-641 |
| FE-5.5 | src/translations/en.json:1039-1041 |
| FE-5.6 | src/views/projectCreation/helpers.js:1099-1117 |
| FE-5.7 | src/views/eventCreation/helpers.js:1214-1220 |
| FE-5.8 | src/views/orderDetails/eventHeader/eventHeader.jsx:289-311 |
| FE-6.1 | src/views/projectCreation/helpers.js:87-94; src/constants/ordersConstants.js:133-135 |
| FE-6.2 | src/views/projectCreation/helpers.js:465-472; src/views/projectCreation/projectCreation.jsx:1712-1715 |
| FE-6.3 | src/views/projectCreation/helpers.js:282-291; src/views/projectCreation/projectCreation.jsx:1696-1699 |
| FE-6.4 | src/views/projectCreation/helpers.js:282 |
| FE-6.5 | src/components/savingsDrawer/savingsDrawer.jsx:440-449; src/translations/en.json:224 |
| FE-6.6 | src/components/savingsDrawer/savingsDrawer.jsx:451-459 |
| FE-6.7 | src/components/savingsDrawer/savingsDrawer.jsx:676; src/translations/en.json:690 |
| FE-6.8 | src/components/savingsDrawer/savingsDrawer.jsx:600-605 |
| FE-6.9 | src/views/projectCreation/helpers.js:88 |
| FE-6.10 | src/translations/en.json:700 |
| FE-6.11 | src/translations/en.json:706 |
| FE-6.12 | src/views/projectCreation/helpers.js:94; src/components/savingsDrawer/constants.js:7-11 |
| FE-7.1 | src/views/projectCreation/helpers.js:135-136 |
| FE-7.2 | src/views/projectCreation/helpers.js:474-476; src/views/projectCreation/projectCreation.jsx:1716-1719 |
| FE-7.3 | src/views/projectCreation/projectCreation.jsx:1610-1623 |
| FE-7.4 | src/views/projectCreation/helpers.js:301-303; src/views/projectCreation/projectCreation.jsx:1646-1649 |
| FE-7.5 | src/views/projectCreation/helpers.js:478-480; src/views/projectCreation/projectCreation.jsx:1723-1725 |
| FE-7.6 | src/views/projectCreation/components/projectScheduler/recurringEventSettings/recurringEventSettings.jsx:84-90,186-187 |
| FE-7.7 | src/views/projectCreation/components/projectScheduler/constants.js:85-96 |
| FE-7.8 | src/views/projectCreation/projectCreation.jsx:3378-3399 |
| FE-7.9 | src/views/projectCreation/components/recurringConfirmModal/recurringConfirmModal.jsx:13-55 |
| FE-7.10 | src/views/projectCreation/helpers.js:527-533 |
| FE-8.1 | src/redux/orders/selectors.js:715 |
| FE-8.2 | src/views/eventCreation/components/paymentTerms.jsx:19-22,83-88 |
| FE-8.3 | src/views/projectCreation/helpers.js:278-280; src/views/projectCreation/projectCreation.jsx:1691-1694 |
| FE-8.4 | src/views/projectCreation/projectCreation.jsx:290-293,3323 |
| FE-8.5 | src/views/projectCreation/projectCreation.jsx:3307-3312 |
| FE-8.6 | src/views/projectCreation/constants.js:111-113; src/views/createOrder/constants.js:1-4 |
| FE-9.1 | src/views/projectCreation/helpers.js:61-62,74 |
| FE-9.2 | src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:871-892; src/translations/en.json:536-538 |
| FE-9.3 | src/views/eventCreation/components/auctionConfiguration/auctionConfiguration.jsx:871-880 |
| FE-9.4 | src/views/projectCreation/helpers.js:396-400 |
| FE-9.5 | src/views/projectCreation/helpers.js:402-408 |
| FE-9.6 | src/views/projectCreation/helpers.js:411-414,425-428 |
| FE-9.7 | src/views/projectCreation/helpers.js:415-417 |
| FE-9.8 | src/views/projectCreation/helpers.js:418-421 |
| FE-9.9 | src/views/projectCreation/helpers.js:424-433 |
| FE-9.10 | src/views/projectCreation/helpers.js:437-447 |
| FE-9.11 | src/views/projectCreation/helpers.js:437-447 |
| FE-9.12 | src/views/projectCreation/helpers.js:454-457 |
| FE-9.13 | src/views/projectCreation/helpers.js:458-462 |
| FE-9.14 | src/views/projectCreation/helpers.js:216-225,293-295; src/views/projectCreation/projectCreation.jsx:1705-1710 |
| FE-9.15 | src/views/projectCreation/helpers.js:548-556 |
| FE-9.16 | src/views/projectCreation/helpers.js:558-566 |
| FE-9.17 | src/views/projectCreation/helpers.js:568-576 |
| FE-9.18 | src/views/projectCreation/helpers.js:544-576 |
| FE-9.19 | src/views/projectCreation/helpers.js:487-500; src/views/projectCreation/projectCreation.jsx:1720-1722 |
| FE-9.20 | src/views/createOrder/helpers.js:61-64 |
| FE-9.21 | src/views/projectCreation/helpers.js:519-526; src/views/projectCreation/projectCreation.jsx:1700-1703 |
| FE-9.22 | src/views/projectCreation/helpers.js:502-510 |
| FE-9.23 | src/views/projectCreation/helpers.js:990-995 |
| FE-9.24 | src/views/projectCreation/helpers.js:108,110 |
| FE-9.25 | src/views/projectCreation/helpers.js:966-976 |
| FE-9.26 | src/views/projectCreation/projectCreation.jsx:1772-1776 |
| FE-10.1 | src/views/projectCreation/helpers.js:349-366; src/views/projectCreation/projectCreation.jsx:1685-1690 |
| FE-10.2 | src/views/projectCreation/helpers.js:327-335; src/views/projectCreation/projectCreation.jsx:1652-1656 |
| FE-10.3 | src/views/projectCreation/helpers.js:322-326; src/views/projectCreation/projectCreation.jsx:1657-1661 |
| FE-10.4 | src/views/projectCreation/helpers.js:341-347; src/views/projectCreation/projectCreation.jsx:1681-1684 |
| FE-10.5 | src/views/rfiBuilder/rfiTableSection.jsx:244-250 |
| FE-10.6 | src/views/eventCreation/helpers.js:1087-1097 |
| FE-10.7 | src/views/rfiBuilder/trGlobalSection.jsx:252-259 |
| FE-10.8 | src/views/projectCreation/helpers.js:316-318 |
| FE-10.9 | src/views/eventCreation/helpers.js:1131-1183 |
| FE-10.10 | src/views/rfiBuilder/fieldTypes.js:15-49 |
| FE-11.1 | src/views/projectCreation/projectCreation.jsx:1599-1602 |
| FE-11.2 | src/views/eventCreation/components/footer/confirmModal.jsx:35-41 |
| FE-11.3 | src/views/eventCreation/components/footer/confirmModal.jsx:39-41 |
| FE-11.4 | src/views/projectCreation/projectCreation.jsx:1738-1744 |
| FE-11.5 | src/views/projectCreation/projectCreation.jsx:1750-1763 |
| FE-11.6 | src/views/projectCreation/helpers.js:1000 |
| FE-11.7 | src/views/projectCreation/projectCreation.jsx:299-303 |
| FE-11.8 | src/views/projectCreation/projectCreation.jsx:298-303 |
| FE-11.9 | src/views/projectCreation/projectCreation.jsx:1781-1796 |
| FE-11.10 | src/views/projectCreation/projectCreation.jsx:288-293 |
| FE-11.11 | src/views/projectCreation/projectCreation.jsx:3389-3399 |
| FE-11.12 | src/views/projectCreation/projectCreation.jsx:1883-1887 |
| FE-12.1 | src/views/orderDetails/eventHeader/eventHeader.jsx:220-223 |
| FE-12.2 | src/views/orderDetails/eventHeader/eventHeader.jsx:736-745 |
| FE-12.3 | src/views/orderDetails/eventHeader/eventHeader.jsx:256-262 |
| FE-12.4 | src/views/orderDetails/eventHeader/eventHeader.jsx:289-311 |
| FE-12.5 | src/views/orderDetails/eventHeader/eventHeader.jsx:312-320 |
| FE-12.6 | src/views/eventCreation/helpers.js:1113-1120 |
| FE-12.7 | src/views/projectCreation/projectCreation.jsx:1220-1263 |
| FE-12.8 | src/views/projectCreation/projectCreation.jsx:1221-1223 |
| FE-12.9 | src/views/orderDetails/eventHeader/eventHeader.jsx:289-296 |
| FE-12.10 | src/translations/en.json:435-436 |
| FE-13.1 | src/views/projectCreation/helpers.js:396-400 |
| FE-13.2 | src/views/projectCreation/helpers.js:396-400 |
| FE-13.3 | src/views/projectCreation/helpers.js:402-408 |
| FE-13.4 | src/views/projectCreation/helpers.js:437-447 |
| FE-13.5 | src/views/projectCreation/helpers.js:520-526 |
| FE-13.6 | src/views/projectCreation/helpers.js:527-533; src/views/projectCreation/projectCreation.jsx:1595-1730 |
| FE-13.7 | src/views/projectCreation/helpers.js:534-539 |
| FE-13.8 | src/views/projectCreation/helpers.js:540-542 |
| FE-13.9 | src/views/projectCreation/helpers.js:502-510 |
| FE-13.10 | src/views/projectCreation/helpers.js:236-248,483-485; src/views/projectCreation/projectCreation.jsx:1642-1645 |
| FE-13.11 | src/views/projectCreation/helpers.js:603-610; src/views/projectCreation/projectCreation.jsx:1726-1729 |
| FE-13.12 | src/views/projectCreation/helpers.js:611-618 |
| FE-13.13 | src/views/projectCreation/helpers.js:308-310,487-500,544-576 |
| FE-13.14 | src/views/projectCreation/helpers.js:376-378; src/views/projectCreation/projectCreation.jsx:1673-1680 |
| FE-13.15 | src/views/projectCreation/helpers.js:380-384 |
| FE-13.16 | src/views/projectCreation/helpers.js:369-374 |
| FE-14.1 | src/views/projectCreation/projectCreation.jsx:1842-1846 |
| FE-14.2 | src/views/projectCreation/helpers.js:465-472 |
| FE-14.3 | src/views/projectCreation/projectCreation.jsx:3131-3134 |
| FE-14.4 | src/views/projectCreation/projectCreation.jsx:1765-1766 |
| FE-14.5 | src/views/eventCreation/templateSelection.jsx:348-361 |
| FE-14.6 | src/views/projectCreation/projectCreation.jsx:1144-1160 |
| FE-14.7 | src/components/savingsDrawer/savingsDrawer.jsx:600-605 |
| FE-14.8 | src/views/projectCreation/projectCreation.jsx:1610-1623 |
| FE-15.1 | src/redux/user/selectors.js:125 |
| FE-15.2 | src/views/projectCreation/projectCreation.jsx:3405; src/redux/user/selectors.js:130 |
| FE-15.3 | src/redux/user/selectors.js:391-392 |
| FE-15.4 | src/redux/user/selectors.js:114-115 |
| FE-15.5 | src/views/projectCreation/projectCreation.jsx:288-293 |
| FE-15.6 | src/redux/orders/selectors.js:4553-4559 |
| FE-15.7 | src/views/orderDetails/eventHeader/eventHeader.jsx:686-694,751,771-776,788-793 |
| FE-15.8 | src/views/orderDetails/eventHeader/eventHeader.jsx:605-855 |
| FE-15.9 | src/views/orderDetails/eventHeader/eventHeader.jsx:605-855 |
| FE-15.10 | src/views/orderDetails/eventHeader/eventHeader.jsx:195-197,713-732 |
| FE-15.11 | src/views/orderDetails/eventHeader/eventHeader.jsx:704-734 |
| FE-15.12 | src/views/orderDetails/eventHeader/eventHeader.jsx:433-438 |
| FE-16.1 | src/views/projectCreation/projectCreation.jsx:305,3131-3134,3201-3234 |
| FE-16.2 | src/views/projectCreation/projectCreation.jsx:3112-3134 |
| FE-16.3 | src/redux/orders/selectors.js:4553-4559 |
| FE-16.4 | src/redux/user/selectors.js:346-359 |
| FE-16.5 | src/views/projectCreation/helpers.js:55-152 |
| FE-16.6 | src/redux/user/selectors.js:118-119 |
| FE-16.7 | src/views/eventCreation/helpers.js:1113-1120; src/views/createOrder/constants.js:13-18 |
| FE-16.8 | src/views/projectCreation/constants.js:111-119 |
| FE-17.1 | src/views/createOrder/helpers.js:61-64 |
| FE-17.2 | src/views/projectCreation/projectCreation.jsx:3085-3101 |
| FE-17.3 | src/views/projectCreation/helpers.js:1052-1088 |
| FE-17.4 | src/views/projectCreation/projectCreation.jsx:1233-1240 |
| FE-17.5 | src/views/projectCreation/helpers.js:832-838 |
| FE-17.6 | src/views/createOrder/helpers.js:61-64 |
| FE-17.7 | src/views/projectCreation/helpers.js:1017-1037 |
| FE-17.8 | src/views/projectCreation/constants.js:105-109 |
