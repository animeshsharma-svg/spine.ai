# Lessons: mistakes spine.ai must not repeat

Every fix that comes from a tester's run is recorded here as a rule, with the place in the code
that enforces it. Read this before changing the compiler (prototype/src/agents/planner.ts), the
runner (procol-ui-tests/src/plan/runPlan.ts), the event picker (procol-ui-tests/src/db/pickEvent.ts)
or the explorer (procol-ui-tests/src/explore/). A change that breaks a rule here is a regression.

Format: **Rule** — what went wrong (date, case) — where it is enforced.

## Starting point and event choice

1. **An event made from a purchase request starts on the PR, never on a blank create screen.**
   - What went wrong (26 Oct, "create an event from pr…"): the repair pass put open_create first on every create plan.
   - Enforced in: planner.ts (`FROM_PR`, DOMAIN_RULES bullet, the repair pass puts `do_on_screen` first and drops open_create, select_template and add/remove_line_items).

2. **Evaluation means a technical stage.** "Evaluation", "evaluator" or "technical score" means the run needs an event whose technical stage has closed with a vendor's answer waiting.
   - What went wrong (26 Oct): "open an event and give evaluation score" opened any live event.
   - Enforced in: planner.ts (`EVALUATES`, `open_event{purpose:"evaluation"}`); runPlan.ts `pickForEvaluation`; pickEvent.ts `evaluationEvents` (answers are `template_responses`, not bids).

3. **Never close an event the run did not create.**
   - What went wrong (26 Oct): close_event on a picked event; its wait loop also dragged the run back to the events list.
   - Enforced in: the planner repair drops close_event for evaluation cases; runPlan.ts `close_event` refuses events picked for an evaluation, including one the tester picked by hand.

4. **Find untitled events by their RFX reference.** The events-list search matches `RFX-…`.
   - Enforced in: pickEvent.ts `eventRoute(page, ref, {byRef:true})`.

11. **Only an OPEN record can be acted on.** Take it from the Open, Live or Pending tab, never Completed, History, Rejected or Deleted.
    - What went wrong (26 Oct, "Create a technical stage event from the existing PR…"): the explorer opened a completed PR, whose Actions offer no way to create an event, and went round in circles.
    - Enforced in: planner.ts `PR_START_GOAL` (Purchase Requisitions → Open tab → tick one PR → Purchase Items) and explorer brain.ts (a general rule for every list).

12. **An event made from a PR keeps the PR's items.** No add_line_items or remove_line_items, and no template unless the plan adds a stage. An added stage gets its template right after it is composed, before its questionnaires.
    - What went wrong (26 Oct): the "Participants are locked until template + product" repair put add_line_items back after the PR step.
    - Enforced in: planner.ts lintPlan (the PR block and the template/items insertion guarded by `fromPr`).
    - In the PR flow the stage IS added: choose_stages ticks it in the Purchase Cart, so each stage gets select_template (+ fill_sheet, or fill_questionnaires + assign_evaluator for technical). Procol may pre-set the template on `/orders/quick-create?fromPR=true` ("Templates: test 1", no "Select Templates" button): select_template keeps it (27 Oct, SingleStagePage `templateAlreadyChosen`, session bc).

15. **A row's tick-box is a control the run can see and use.** Lists draw a box over a hidden checkbox inside a clickable row, so the explorer saw only the row and could only "open the row", never select it. The drawn box is now listed as checkbox "select this row" (or "select all rows") with its real ticked state and the row's words. Replay finds it in the same row, or else the first row. A tester's tick is recorded the same way. To select a row, tick its box; opening the row is not selecting it.
    - What went wrong (26 Oct, "you cant even select a PR????"): it went round in circles opening a PR row on Purchase Requisitions.
    - Enforced in: explore/view.ts (`boxFor` in readView; findByRecipe's row-box lookup, one kind at a time with the real input first); support/liveControl.ts `recipeAt`; brain.ts rule.

16. **An event from a PR is built from separate, fixed steps, and the run never guesses there.**
    - The steps: open_purchase_requisitions → pr_tab{Open} → select_pr (tick the box) → purchase_items (Purchase Items, then Start New Project; never Actions) → choose_stages → expect_pr_items → each stage's own steps.
    - When the case names no event, choose_stages asks: Technical / RFQ / Auction / Technical + RFQ / Technical + Auction. RFQ and Auction never go together. It then adds that event's stage steps.
    - Only an unknown screen falls back to working it out on screen, and that is learned.
    - What went wrong (26 Oct, "it still keeps opening actions and going in circles"): one long do_on_screen let the explorer pick Actions every time. She asked to "break it into steps like u did for events".
    - Enforced in: runPlan.ts `prStep` / `stageSteps`; steps.ts; planner.ts PR block (it removes and re-adds every PR and stage step once, so the model's own copy is never doubled).

## Doing what the catalog cannot

5. **What a buyer can do on screen in this session, the run does itself** (`do_on_screen`): each action is kept as words, with pictures only as proof (a question, a stop, a failed check, a by-hand part, the goal reached), and it counts as tested only when the screen proves it. `ask_tester` is only for another login, another company, email or the vendor portal.
   - What went wrong (26 Oct): "Partly tested" when Playwright could have done it.
   - Enforced in: steps.ts `do_on_screen`, runPlan.ts.

6. **Learn whatever the tester does by hand.** Their clicks and typing are saved as a route (codes and passwords are never kept), the event they open is remembered, and the next run repeats it before asking. The run where they did it stays Partly tested; the next one is tested.
   - What went wrong (26 Oct): by-hand routes were thrown away, so the run got stuck at the same place again.
   - Enforced in: liveControl.ts `takeHandSteps`, explorer.ts `saveHandRoute` / `byHand`, runPlan.ts `askForPart` / `rememberPick` / `learnedPick`.

## Reading results honestly

7. **Bids on a stage are `bid_trades` joined to `bids`.** `bids.trade_request_id` is empty for them.
   - What went wrong (26 Oct): two false "false passes" in the eval.

8. **Active line items have status 1 on a live event and status 2 on a draft.** Status 0 means removed.

9. **The Slingring gateway can return an empty answer** while billing it, and caches the reply, so a retry gets the same blank. Ask again streamed.
   - Enforced in: benchmarks/real/run.ts. The platform's llm.ts still needs this.

10. **Take control must belong to one run.**
    - What went wrong (26 Oct): one shared live-control file paused every run on the machine and faked by-hand steps.
    - Enforced in: liveControl.ts `controlHeld` checks the runId (session bc).

13. **A step's evidence is its screen in words; a picture only where something went wrong.** After every step the run keeps what was on screen (headings, tabs, buttons with enabled or not, fields with values and errors, messages, dialogs, console errors and warnings, failed requests) and what the step did, action by action. A screenshot is taken where a step fails or the observation pass finds something; a failed run also keeps its full Playwright replay (trace.zip). No SAVED picture per action or per step — but the purple frame around each control is still drawn on the LIVE VIEW (sent as a frame, never saved; Aanya, 27 Oct: "you removed the purple highlight thing, i want that"). One picture of where the run ENDED is kept too ("NN-end.png", numbered after the last step), and a saved run's Browser panel shows only that or a picture from its last step — never a mid-run one, which made published events look unpublished (27 Oct, ZE5kY2RO / ZFhYY2RO).
    - What went wrong (26 Oct, Aanya: "the screenshots taken at every point is not the optimal way … for each step we can save the console or divs or buttons, but not a screenshot of each step"): 25–80 near-identical pictures a case, each slowing its action.
    - Enforced in: spotlight.ts (pictures only with UI_SPOTLIGHT=1; `stepActions` otherwise), observe.ts (`ScreenRecord`, NN-step.screen.json; `picture` only on failure or a finding), runPlan.ts `look()`, tests/plan.spec.ts (trace kept for a failed run), session.js "What was on screen" (session bc). The explorer's own per-action pictures (explorer.ts `shoot`) still to follow — lesson 5's "a screenshot per action" is superseded by this rule.

14. **The tester can talk to a run while it goes.** A message typed during a browser run goes to THAT run: the on-screen explorer follows it at its next move; between steps "stop" ends the run (the rest marked not run, never a pass) and "skip" skips the next step; anything else is kept and said under the step. One inbox file per run.
    - What went wrong (26 Oct, Aanya: "when the browser keeps running, the user cannot send any command in between"): Send was disabled during a run; the explorer went round in circles on a Completed PR and the only ways out were take control or Stop.
    - Enforced in: session.js `send` (POST /api/live/say), routes/liveControl.ts `/api/live/say` (.plans/<run>-told.jsonl), procol-ui-tests liveControl.ts `takeTold` / `pendingTold`, explorer.ts loop, runPlan.ts step loop (session bc).

18. **The PR start follows Procol's real screens, checked on UAT before the tester runs it.**
    - The path: Purchase Items → its menu's **Start New Project** → the **Purchase Cart** ("1 PR | 1 Line Item") → the arrow beside **Create Project** lists tick-boxes **Technical Stage / RFQ / Auction** → tick the case's stages (the button then reads "Create Project 1") → **Create Project** → the new event opens.
    - Only if the cart looks different does the run work it out on screen, held inside the cart (never Events). The next step's PR-items check catches a blank event.
    - What went wrong (26 Oct, several runs): "Create Project" clicked with no stage ticked; Start New Project dropped; "Create Project" matched exactly while it reads "Create Project1"; the explorer left for Events → Create.
    - Rule: a fixed UI step is checked with a dry plan through `prototype/scripts/ui-plan-run.ts` on UAT (source "procol test/.env" and prototype/.env; `choose_stages{dry:true}` stops before Create Project) before the tester is told to run it.
    - Enforced in: runPlan.ts `prStep`.

19. **Pick vendors from the vendor list, wherever it shows.** When the product audience gives no vendor (an event made from a PR has none), the invite falls back to the Participants box. That box's list is found by its own "VENDORS" header, and its rows are menu items ("AMD LTD Delhi"), which are tried before plain list rows.
    - What went wrong (26 Oct, PR event step 13, "Vendors invited: 0"): the fallback read the EVALUATOR panel and only option-shaped rows, so it saw nothing while the list showed AMD LTD, Demo Supplier - 1, Dummy and others.
    - Enforced in: CreateEventPage.ts invite fallback (vendorPanel by header, waitForVendorRows) and pickFirstNamedOption (menu items first).
    - Verified on UAT 26 Oct: the PR → Technical event got through invite (AMD LTD).

20. **A draft plan is shown only when its shape is certain.** That means a PR start, an evaluation of an existing event, create/publish wording, or the events list. Otherwise no draft is shown: a wrong one ("it's going to create an event" for a list check) is worse than none.
    - What went wrong (27 Oct): quickOutline drafted the generic create journey for "Open the events list and switch to the Live tab…" (reported by session bc).
    - Enforced in: planner.ts `quickOutline`.

21. **A failed step is finished where it stopped, never started again.** When a step fails in a dashboard run, the browser stays on that screen and the run asks: "Step N of M (…) stopped: … How should I finish it?" What the tester types (or sent to the run just before) is done on that same screen, and then the run carries on with the steps after it. This applies only to action steps: a failed check (an assertion, or a step a negative case expects the app to refuse) is the case's result and stays failed. A follow-up is never compiled as a new case while the run can still continue. The step's own failure stays in its detail and evidence (`continuedAsTold`); the tester's way finished it, not the step. "Stop", the Stop option, or no answer in 10 minutes (`UI_FAIL_HOLD_MS`) ends it as failed, as before. While it waits, the test's time limit is moved so the browser is not closed mid-answer.
    - What went wrong (27 Oct, "when i said invite the vendors, then you must continue from where you left, not from the scratch"): the failed run ended, and her next message went to the chat, which compiled it as a brand-new case.
    - Enforced in: runPlan.ts `continueAsTold` (called in the failure block, after the picked-event retry question) and `moreTime`.
    - Not yet covered: a message sent after a run has fully ended (or after the 10-minute hold) still starts a new case.

23. **A follow-up carries on with the same event, and never turns the last run's results into checks.** "Now evaluate it", "invite the vendors" and "publish it" act on the event the last run made, named by its project id. Values the run produced or picked are results, not checks for a new case: its spine-ui-automation title, the times it set, the PR or vendors it picked, the counts it saw. If the record shows the thing is already done ("publish event" after "published as ZE5kY2RO"), or it can't be done on that event (an evaluation needs a technical stage), the chat answers in one sentence instead of running.
    - What went wrong (27 Oct): "publish event" after a published PR → RFP + RFQ run compiled a 28-step plan. That plan made a new event and checked the old title, times, 4 vendors and "1 line item", then failed on a different PR. "Now evaluate it from the evaluator assigned" on the RFQ-only ZE5wY2RO got a paragraph and a stuck explorer.
    - Enforced in: prototype session.ts (the follow-up prompt); runPlan.ts open_event (an evaluation on an event with no technical stage asks in one line: use a ready event, or stop; pickEvent.ts `stagesOfEvent`).

24. **Say it in one line.** A question to the tester is one sentence about what stopped and what is needed. Details sit behind "More", and there are no numbered lists split from a goal. "Running as" is one sentence. Test cases sit in the right-hand "Test cases" tab as small cards (type colour, result colour, one line of expected result), not as a table in the chat.
    - What went wrong (27 Oct, "why is it giving so many big paras, no one will read so"; "the test cases should be visible in the tab right to the requests … good and colorful, less content").
    - Enforced in: runPlan.ts `askForPart` (first sentence of the part, ≤150 chars); session.js question card (session bc); runCases.js + runCases.css (the Test cases tab).

25. **An event from a PR counts its items from the PR, never from a literal.** One PR line can become several items on the create screen (a service line with two services), so PR plans have no expect_line_items: expect_pr_items counts them. "A PR with 2 line items" means select_pr{items:2}, which ticks two rows of one PR NO.
    - Enforced in: planner.ts lintPlan PR block (`expect_line_items` dropped, `items` from the text); runPlan select_pr/expect_pr_items (session bc).

26. **The stage's template is the control after "Templates" / "Item Template", and its picker says "Select Templates" (plural).** A Technical stage also has the Vendor Assessment's own "Template: Select Template ▾" (singular, with a colon), which picks the questionnaire, not the stage template. A template already set on screen (an event from a PR opens with one) is kept when the case names none, or names that one.
    - What went wrong (27 Oct, plan-mvpo4yu0, "why do u get stuck at templates everytime?"): the screen showed "Item Template: Test", but expect_template_selected matched the Vendor Assessment's "Select Template" and failed the run with "the stage still offers 'Select Templates'". The earlier template failures that day were different: a PR event opening with "Templates: test 1" and no picker (lesson 22).
    - Rule: in all 61 saved screens, the singular "Select Template" sits under "Template:", and the stage's own picker is always plural.
    - Enforced in: CreateEventPage `selectTemplatesButtonCandidates`, `templateAlreadyChosen` (both labels), `appliedTemplateName`, `selectTemplate`.

27. **When a case names an event action, the run opens the menu that holds it and does it.** The run never stops at "no step".
    - **The project's ⋮** (an icon right after "Messages") holds Send Reminders and **Withdraw Project**. Withdraw Project asks for a required "Withdrawal Remarks", then "Yes, Withdraw Project".
    - **A stage tab's Settings ▾** holds Recreate Order, Shared With, Extend Submission Time, **Withdraw** (a required reason, then Yes), Convert to Auction, Rejected Bids, Order Activity, Edit Evaluation Time and Send Bulk Counter Offer.
    - **Each Participants row** has + Add Bid and **+ Add Price Cap**. Add Price Cap opens a "Price cap" cell per product, then OK.
    - Withdraw works at any phase: live, after bids, after bidding ends, on any stage.
    - What went wrong (27 Oct, Aanya): "if user asks to withdraw the event at any phase of time, then ui must go here … add price cap, if anything from these options is asked by user remember to open this and perform the activity".
    - Enforced in: pages/EventActionsPage.ts (the map, captured on RFX-19215) and plan/eventMenuSteps.ts. The steps are withdraw_event, expect_withdrawn, event_menu (any item), expect_menu_item (greyed out or absent), extend_submission_time and add_price_cap, all in the catalog.

28. **A step that sees Procol refuse says "blocked: …"; it never calls it our failure.** Examples: Submit Bid staying disabled for a price ≤ 0, Counter Offer greyed out on a surrogate bid, a withdrawal with no remark, a price cap with no value. `attempt` counts a "blocked: …" from its inner step, returned or thrown, as the refusal.
    - What went wrong (27 Oct, SB10/SB11): the -50 bid's disabled Submit was reported as "the values did not register", and a check on Counter Offer looked in the wrong place.

29. **Check an expectation against the screen before calling the app wrong.** A technical stage DOES offer + Add Bid on Participants: it opens the vendor's technical response. It does not offer Add Price Cap. SB08 (and stress B31) expected no Add Bid there, and the run's screenshot of RFX-19230 (rfx_mode 5) showed otherwise. The case was changed, not reported as a bug.

30. **A run started by a second server talks to that server.** Plan runs now get SPINE_SERVER set to their own server's port. Before, the explorer inside a run started from :4310 sent its key to :4300, was refused, and every do_on_screen "did not answer three times in a row". That made SB12/SB13/SB14 untested, and probably did the same to stress-eval runs on :4310.
    - Enforced in: prototype uiFlowRunner.ts (the plan-run env).

31. **The compile cache is keyed by file times, not by the code a server is running.** After editing planner.ts for a server without watch mode, restart it and delete that case's data/compile-cache entries. An old process compiled SB10 after the edit and cached its bad plan under the new key.

32. **Price cap: what the screen and the API each do.**
    - Participants → a vendor's "+ Add Price Cap" → a Price cap cell per product → OK. Procol says "Price Cap added successfully!".
    - The call is PATCH /api/trade/:tradeUuid/update_vendor_validations with {productwise_vendor_validations: {<trade product>: {<vendor>: price}}}. It was recorded with UI_RECORD_FLOW on 27 Oct, and the API planner's `price_cap` op is built from it.
    - A bid above the cap is refused on screen and through the API: "Price cannot be more than the allowed price".
    - A bid EQUAL to the cap is accepted by both, although the template rule says "Price should be less than the Cap price". This is reported as a finding, not as our bug.

33. **What each event-menu item opens (check these words, not the item's name).**
    - Shared With → "Participation Summary" (Invited · Seen · Bid Placed · Bid Not Placed).
    - Order Activity → "Activity".
    - Send Reminders → "Send Reminders" (Offer submissions, N Pending, View). Never press Notify: that messages the vendor.
    - Extend Submission Time → "Increase Event Time" → "Order time updated".
    - Edit Evaluation Time → "Edit Evaluation Time".
    - A stage withdrawal ("Order withdrawn") sends the browser to the Events list. A withdrawn project's ⋮ offers only Send Reminders and Clone Project.
    - A greyed-out item can be matched twice in the menu, and only one copy carries the disabled mark, so the copies are merged.
    - Enforced in: steps.ts event_menu, and EventActionsPage `readMenu`.

34. **A closed or withdrawn event's Participants rows have no checkbox, and a saved price cap reads "Edit Price Cap".**
    - Once bidding has ended or the event is withdrawn, each row keeps only name, phone, email and code: no checkbox, no Add Bid, no Add Price Cap. The row reader used to look only for rows with a checkbox. In the 27 Oct final run it counted 0 rows beside a listed vendor, so SB12 and WD09 went red at expect_participant_count while their real check (no Add Bid) passed. Rows are now any list item with the vendor's paragraphs (selftest "a closed event's rows…").
    - After a cap is saved, the row's "+ Add Price Cap" becomes "Edit Price Cap", which opens the same sheet. PC01's "verify the saved cap" went to do_on_screen, and the screen AI went round in circles there. expect_price_cap now reads the cells and closes without saving, and the add_price_cap entry points to it.
    - Enforced in: ParticipantsPage `rowsLocator`, EventActionsPage `readPriceCap`, eventMenuSteps `expect_price_cap`.

35. **Vendor bidding beside surrogate bidding: what the buyer sees, and how to tell a surrogate response from a portal one.**
    - A stage's Responses tab has one column per vendor that responded, plus "Participation : x / y". It looks the same on an RFQ and a technical stage. A CLOSED stage tags surrogate columns "Surrogate Bid". A LIVE stage shows no tag, only a greyed Counter Offer. VB01–VB03 read every live column as "from the vendor portal".
    - Procol keeps no surrogate flag. A surrogate bid or technical answer is placed by the event's creator (event_groups.user_id). A vendor-portal one is placed by the vendor's own user. The vendor's user belongs to a linked company (38165), not the bid's company record (38164), so compare users, not companies. expect_responses uses Procol's records whenever the page shows no tag.
    - Read "Participation" from the button's accessible name ("1 / 2 50%"). Its text runs the badge on ("1 / 250%").
    - With no vendor named, a surrogate bid never takes the vendor a place_bid in the same plan signs in as. Otherwise both land on PROCOL TECH, the one portal login known to work.
    - Procol's create screen won't hold RFQ and Auction together. "RFQ then auction" means an RFQ, then Convert to Auction.
    - The vendor portal streams BESIDE the buyer's page ("[frame@side]" and "[pane@side]" lines), but only when the server sets UI_SIDE_FRAMES=1. Any other server gets the old single view, so its log never fills with picture data.
    - A vendor bids once PER STAGE. The planner's "N bids need N vendors" repair counted a two-stage plan's portal bid, surrogate technical answer and surrogate price as 3 vendors, so it invited 3 to a case that said 2 (VB04). It now counts per stage. "invite N vendors" in the case sets the count, unless the plan names vendors.
    - On a two-stage event, ONE place_bid answers the technical sheet and quotes the RFQ. place_surrogate_bid{stage:"rfp"} enters the technical answer on the Technical Stage; without stage it goes to the pricing stage.
    - An event published seconds ago can be missing from the vendor portal's list. Look twice before calling the vendor "not invited". Never fall back to a vendor the buyer already surrogate-bid for: its portal shows only "Revise Quote" on the buyer's bid (VB06).
    - After a reload, wait for the stage tabs before walking them (VB08). A bid's Counter Offer is greyed while its cells load; wait for the grid before calling it refused (VB09).
    - On a live stage, a vendor-portal quote's header reads "Supplier Revision" with an active Counter Offer; a surrogate one has a greyed Counter Offer and no tag.
    - The bid sheet's quantity offered comes pre-filled with the quantity requested. The shared sheet filler typed "1" over it, so every surrogate bid quoted 1 unit of 10. A pre-filled quantity is now kept (support/sheet.ts).
    - Master QCS ranks by the unit RATE, not the line amount (VB08: 100/unit × 10 ranked over 120/unit × 1). expect_qcs_ranks follows the rate row, and the amount only when there is no rate.
    - The Participants rows re-render when the list refetches, and the Add Bid drawer belongs to its row. A click during that opens nothing, or a drawer that then vanishes. Let the list settle, and click once more if no drawer comes.
    - Accepting a counter offer signs in as the vendor who bid from the portal, not "the next vendor who has not bid" (VB09).
    - Enforced in: EventActionsPage `readResponses`/`gotoStage`, pickEvent `responsesOf`, eventMenuSteps `expect_responses`, runPlan place_surrogate_bid/bidderEmail, SurrogateBidPage `openParticipants(stage)`, VendorPortalPage `openEvent`, CounterOfferPage, planner lintPlan (invite count, per-stage bids), liveCursor `sideFrames`, uiFlowRunner (side lines), session.js `sideFrame`.

17. **A change to procol-ui-tests is not done until every spec still loads.** Run `npx playwright test --list` in procol-ui-tests; `tsc --noEmit` passing is not enough.
    - What went wrong (26 Oct, "The run could not start: No tests found"): `import { Locator, … } from "@playwright/test"` type-checked, but Locator exists only as a type, so the plan spec failed to load and no run could start.
    - Rule: import Playwright types with `type` (for example `type Locator`).
    - Same lesson, 27 Oct 03:58: an apostrophe typed into a single-quoted catalog string ("the item's name") broke steps.ts for a minute. tsc and --list caught it at once; no run started. A patch to steps.ts is checked before anything else runs.

22. **A required cell is never left empty, and never reported as filled while empty.** fill_sheet fills every required cell the buyer can edit, including a column the code has never seen (a tenant's own, such as "dgfgfd_custom"). It tries such a column as text, then as a number. Anything still empty is asked for by column name ("The sheet has a required cell I could not fill: “dgfgfd”. What should I type?"), and the step types the answer into that cell itself; the explorer cannot reach grid cells. The publish refusal "Sheet partially filled" goes back through the same step. Likewise, a template Procol has already set (an event from a PR opens with "Templates: test 1") is kept; the step does not look for a "Select Templates" button that is not there.
    - What went wrong (27 Oct): PR → RFQ stopped at select_template (plan-mvpn8vwl), then publish was refused, with "sheet filled" reported over the empty custom column (plan-mvpncvcu). Fixed, it published as ZE5wY2RO in 49 s.
    - Enforced in: CreateEventPage `templateAlreadyChosen`, `fillRemainingSheetCells`, `emptyRequiredSheetCells` and `typeIntoSheetCell`; SingleStagePage `templateAlreadyChosen`; runPlan.ts `fill_sheet`.

23. **An API event "from a PR" is only from the PR if its round names the PR line, and the test checks it did.** The console's Purchase Cart sends the PR line on the draft (`pr_line_item_uuid`, `pr_id`) and again on every row of the round (`product.pr_line_item_uuid`, `pr_number`, `material_code`, `item_no`). Procol links the line and moves the PR to In Progress only from the round. The first API runs sent the PR on the draft alone and "passed" on publish + live, yet their events had no `pr_no` and the PR stayed Open. Every PR-built API plan now also reads the line items back (`data[*].pr_no`, `data[*].pr_line_item_uuid` exist). Before believing a new API flow, record what the console sends (`UI_RECORD_FLOW=<name>` → procol-ui-tests/recordings) and diff it.
    - What went wrong (27 Oct): API events ZFFkY2RO, UWdaY2RO, UWdYY2RO, UVpnY2RO and UVpOY2RO were published "from a PR" with no PR link.
    - Enforced in: eventJourney.ts `withEveryLineItem` (PR_ON_THE_ROUND) and `createDraft` (fromPr); apiPlanRunner.ts `pickPrLines`; apiPlanner.ts `applyFromPr` (the read-back).

36. **Take control is a real browser, and what the tester does there is never dropped.** While they hold it, the live view sends the mouse as it really moves (move, down and up with the real click count), so a double-click opens a sheet cell, hover opens a menu, and drags and text selection work. It also sends the wheel both ways, keys with Ctrl/Cmd/Alt/Shift, and paste from their clipboard. The bar on top has the tabs (a link that opens a tab shows it), back, forward, reload and an address. A click on the vendor picture beside the buyer goes to the vendor page.
    Their steps are kept in every case:
    - **On a stuck step's card:** "I'll do it myself" finishes the step by hand. Handing the browser back while that card is open answers it.
    - **Next run, same stuck point:** their steps are saved under the stuck point (`stuckGoal`: the step, the screen with ids left out, the failure's words without numbers or quotes). The next run that stops there does them itself before asking. A way they typed in words is kept the same way.
    - **Mid-step take-over:** a hold taken in the middle of a step is written on that step ("you also did by hand while it ran: …").
    - **Inside the explorer:** a hold that began and ended inside one of the explorer's actions is still taken into its route.
    - What went wrong (27 Oct, plan-mvqmmp5y): Aanya took the browser to fill "Delivery location" on 3 lines and could not. A double-click arrived as two single clicks, no hover was sent, and the wheel was up/down only. Nothing she did was learned (byHand 0, no route). The recorder's page script had never parsed: inside a template string `"\n"` became a real line break and `\s` became the letter "s". Every recording since 26 Oct failed silently, and no by-hand route was ever saved. The stuck card offered no "do it myself", and a route was kept only when the whole explorer goal passed.
    - Rule for page scripts written as template strings: escape twice (`\\s`, `\\d`, `"\\n"`), or use `String.raw`. Parse the cooked script once (`new Function(cooked)`) after changing it.
    - Enforced in:
      - support/liveControl.ts: `apply` (move, down, up, wheel, key, nav, tab), `targetOf`, `show`, `handPart`, `recipeAt` (sheet cells by column and row), `takeHandSteps(since)`;
      - support/liveCursor.ts `panePage`;
      - explore/view.ts `findByRecipe` (role "cell");
      - explorer.ts `byHand` (`handSeen`);
      - runPlan.ts `continueAsTold` (learned replay, "self", `keepRouteAs`), `stuckGoal`, and the step loop's `takeHandSteps(started)`;
      - prototype routes/liveControl.ts `clean` and `viewTabs`;
      - public/liveControl.js, and session.js `handedBack`.

## The tester-reported loop (from 26 Oct)

For each case the tester runs and reports:
- fix the root cause in the shared code, not the one case;
- check which other prompts share the pattern (docs/STRESS-PROMPTS.md and the tester's earlier runs) and dry-compile them;
- check that every spec still loads (`npx playwright test --list` in procol-ui-tests) and that both packages pass tsc;
- add the rule here.

37. **Surrogate technical response via the API; "Price" is the bid's rate; console lines can carry tokens (28 Oct).**
    - A surrogate technical response is POST /template_responses/create_surrogate_response with {item_type: "TradeRequest", item_uuid: <technical round>, company_uuid: <vendor>, page_uuids, page_responses: {page: [{key_attribute, value?}]}, surrogate_remarks}.
      - Pages and questions come from GET /v1/trade/:id/schema?response_type=template → sheets.forms[].page_uuids and page_response_headers.
      - Skip "read" questions (the evaluator's score). Answer the required ones; send the rest blank, as the screen does.
      - Recorded in recordings/surrogate-technical-28oct.flow.json. The API op is `surrogate_tech_response`. The flow recorder cuts long replies at 2,000 characters, so read a schema live when you need all of it.
    - A loose Master QCS row match ("Price") must never land on a reference row such as Last Purchase Price, negotiated, target or budget. A bare "price" means the bid's rate row (SB13 read Last Purchase Price).
    - Browser console errors can print URLs with tokens in them (the WebSocket's access-token). Mask them before they are kept, shown on the Console tab or reported (observe.ts, consoleBugs.ts).
    - "Recreate Order" (a stage's Settings) opens a form for a new order built from this one: same type, mode and strategy, the product sheet copied, a price to enter, the timings, and Cancel / Create Order.
    - Enforced in: apiPlanner `surrogate_tech_response`, apiPlanRunner `techPages`, qcsModel `findRowLabel`, observe.ts `masked`.

38. **Evaluator scoring and the full PR → award chain (29 Oct, found with screenshots).**
    - Only the stage's ASSIGNED evaluator can score. assign_evaluator used to pick the first user in the picker, a real M3M person (Satish Kumar Kaushik). The stage then reported is_allowed_to_evaluate false and submit_evaluation_allowed false to the run's account, so the score cells stayed read-only and "Submit Score" never showed. The step now searches the picker for the run's own account ("Procol Support"; UI_EVALUATOR overrides) and says so when it is not offered.
    - Scoring happens in the technical stage's Responses grid, during the "Evaluation time" countdown after bidding ends. The "Evaluation Score" row turns editable, and a "Submit Score" button sends PATCH /evaluations/submit; each cell saves through POST /evaluations. Both are in Procol's own bundle (rfiQuotes / orderDetailsWrapper). Settings → Edit Evaluation Time can move the end; the picker's date field does not take typed text.
    - An event made from a PR brings one spec table per product. A table below the fold is not drawn, so its innerText is "". The vendor filler skipped the second product's required spec, and the answer stayed a draft ("Please fill all required fields"). Read cells by textContent.
    - The "Hello Procol … Give Feedback" card and the "New! Keyboard Navigation" tip are tooltips over the Participants rows. A second Add Bid click timed out under the feedback card. The watcher now looks inside tooltips and popovers and knows both phrases.
    - award_event does the whole award (Start Awarding, allocate, proposal, submit). The planner had used start_awarding + expect_awarded, which never allocates. award_event{vendor} also takes "lowest" (Rank 1 on Master QCS), "surrogate" and "portal".
    - Enforced in: CreateEventPage `assignEvaluatorToAllLineItems`, VendorPortalPage `markEmptySpecs`/`openEveryProductSection`, oracle/noise.ts + orchestrator BOXES, runPlan `awardVendor`, steps.ts award entries, planner per-stage count (choose_stages).

39. **A client's mandatory fields are filled by the run, not asked about; an expired evaluator is signed in on screen (29 Oct).**
    - Every client turns on its own mandatory things (custom_configurations: is_payment_tnc_enabled, enable_tnc_mandatory_button, mandatory_rfp_form_widgets, is_saving_configuration_mandatory, is_surrogate_bid_reference_mandatory, …). A run switched to another client must not stop at one of them, and must not ask the tester about such a basic step. Before Publish, a case that expects the publish to go through has every required control that is still empty filled (antd required labels, "*" labels, aria-required, red has-error items). A case that asserts a refusal gets nothing it did not ask for. Participants, vendors, the evaluator, approvers and the title are never touched by the sweep; their own steps decide them.
    - Any create-screen refusal that says something is mandatory or "please fill/select/add …" is recovered by fill_required, even when the dashboard's catalog does not list it. fill_required opens the control the refusal names (the longest leading run of its words: "Payment Terms and Conditions" finds a "Payment Terms" button), fills and saves its drawer, then sweeps every stage tab. Required sheet cells are tried as text, number, dropdown and date before the tester is asked.
    - Procol expires saved console sessions (Satish's, from 10 Sep, sent his tab to /login a few seconds after /home loaded). loginAsCompany checks the URL too early to see that. signInUser waits for the bounce and then signs the user in on the login screen with their UAT code (uatOtp.ts). A lot-level technical stage has one "Submit Score" above the grid, not a Submit per line. A submitted evaluation stays at status 1 in `evaluations`; 0 is scored-not-submitted.
    - Enforced in: support/requiredFields.ts (+ requiredFieldsSelftest.ts), runPlan `publish` / `fill_required` / `mandatoryRefusal` / `fillEmptyRequiredCells`, appRules RECOVERY catch-all + `recoveryWith`, CreateEventPage `fillRequiredCellAnyway`, dbLogin `signInUser`, EvaluationPage submit, e2e-flow facts.sql.

40. **After a by-hand part, Procol's record decides whether a later step is already done; a question the stream drops is still shown (29 Oct, plan-mvt753ce).**
    - The tester took the browser at the stuck technical response and also entered the RFQ surrogate bid of 100. The next step (that same bid) found no "Add Bid", failed, and held the browser again. Once a run has had a by-hand part, place_surrogate_bid that finds no Add Bid reads bid_trades / template_responses. A surrogate response of its kind for a vendor it could have chosen means "already done", and the run carries on.
    - Handing back with nothing clicked, after typing "… has been done", is the tester's word that it is done. The run carries on, marked done by them, instead of asking again.
    - Two questions about step 23 never reached the session screen, which kept "Your turn in the browser" while the run waited 10 minutes for nothing. The screen now also polls /api/run-state (running.ask) every 4 s and shows an open question it has not shown.
