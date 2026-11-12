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

41. **Every run's test cases come from Procol's backend code (29 Oct, Aanya: "testcases can be taken from here for all runs for each run").**
    - Procol's backend (github.com/Procol-Tech/procol-backend) is checked out read-only at procol-qa-platform/procol-backend. It is git-ignored and never committed. Refresh it with `git -C procol-backend pull`, then `npm run backend:rules` in prototype. That rebuilds data/backend-rules.json: every route (the routes file's helper methods expanded), and per controller action every refusal it and its helpers or services can return (code, message, HTTP status, the Ruby condition, file:line). It also holds the backend's own RSpec examples that call the route, including "pending" ones, which are gaps Procol's developers already know.
    - A run's requests decide which actions apply. An API run uses its journey's calls. A browser run uses each step's `calls` (screen.json, new) or, for an older run, the requests in its trace.zip. A run with neither falls back to the actions that share its words. Write test cases puts those rules in the prompt. A case that proves one cites it (codeRef = file:line, shown as CODE with a GitHub link at the commit read), and its expected result is the code's message and status, never "(to confirm)". The code number in the expected result is always the cited line's (the model once typed 96 for a line that returns 95). Without AI, each refusal still becomes a case.
    - Enforced in: prototype/scripts/build-backend-rules.ts, src/model/backendRules.ts, src/routes/runCases.ts, public/runCases.js; procol-ui-tests src/plan/observe.ts (`calls`).

42. **When the PR is the problem, ask about the PR (29 Oct, Aanya: "if the case failed bcz pr not found or pr not suitable, then you must ask the user should i rerun with another pr or mark it failed … you give only 2 options take control or mark it failed").**
    - A failed step is first read for its cause. When the run picked the PR itself (the case names none) and the failure is about it, the question names the cause and offers the fitting choices: "Run it again with another PR" / "Mark it failed" / "I'll fix it myself in the browser". Examples: Procol's "Purchase request items are not valid" at Publish, no PR with the lines asked for, a PR step failing, or a later check failing after such a refusal.
    - A typed reply is read the same way. "rerun with another pr" or "retry" runs it again. "mark it failed" or "stop" marks it failed. "I'll fix it" or "take control" hands over the browser. A reply naming a PR number runs it again with that PR. Anything else is done on the screen as an instruction.
    - Running again restarts from the PR list. select_pr passes over every PR that already failed (the BOQ-PR skip still applies) and says so under the step. The run's state is reset as for another event. At most 3 PRs are tried.
    - Enforced in: procol-ui-tests runPlan (failure handler, prStep select_pr `avoidPrs`/`nextPr`, continueAsTold `preset`).

43. **Scores are checked in Procol's record, never read off the screen (29 Oct, plan-mvti7huv, "why stuckkk?").**
    - The planner followed evaluate_technical{scores:[8,6]} with a do_on_screen "verify the portal vendor received score 8 and the surrogate vendor 6". PROCOL DEMO scores with labels. The run gave 8 → P1 and 6 → P2, which Procol saved as 5 and 4 (evaluation_scores), and the screen shows "Scored by the spine.ai…" with P1 / P2. Nothing on screen says 8 or 6, so the explorer went round in circles on the Actions menu.
    - expect_evaluation (new, assertion) reads evaluations → evaluation_scores. It checks that every vendor scored by evaluate_technical has a score, that the evaluation is submitted (status 1), and that when numbers were asked the higher one ranks higher. A do_on_screen that verifies scores after this run scored them is run as expect_evaluation, so old and cached plans no longer reach the explorer.
    - Enforced in: verifyRows `evaluationsOfEventGroup`, runPlan `checkEvaluation` (+ s.evaluatedScores from evaluate_technical), steps.ts / plan-catalog.json.

44. **Generic steps on plain web markup (29–30 Oct, the bench run: "spine's executor works well on Procol's screens and much less well on generic web markup").**
    - A field is the one its words NAME. That is the `<label for>` target, or a field inside the label, or else the first field AFTER the words in the smallest block that holds one. Taking the first field anywhere in the block put "Last name" and "Country" into the email box.
    - fill and select accept the visible words beside the field (`text`). A non-antd dropdown opens from the clickable element after its caption (toggle / button / tabindex / aria-haspopup), and its options are looked for in plain lists too (`ul li`, menuitem, .dropdown-item). A native select matches an option by its text in any case, or by its value.
    - A function passed to page.evaluate must not declare named helpers (`const f = () => …`). The TS runner wraps them in `__name()`, which the page lacks, so the script throws and `.catch` hides it.
    - Enforced in: generic/run.ts select (demo's executor since the 2 Nov merge, with the caption-toggle and plain-list fallbacks ported in); selftest.ts PLAIN cases (49/49 with demo's WEB/FORMS).

45. **No vendor to bid as is the run's gap, never a product failure (2 Nov, Aanya: "why failed").**
    - A Technical + RFQ journey from a PR got only 2 vendors from Procol's suggestion for the product, and both were QA_Platform test vendors. Event-vendor runs never bid as QA vendors, so nobody could bid. The reason said "has no user who can sign in". It now names the real wall: all QA test vendors, or no login (with counts).
    - The buyer's on-behalf steps (surrogate technical response, surrogate price) act for a vendor. With none chosen they went out with company_uuid "" and Procol answered 500. They were filed as two product bugs. Now they are "did not run" with the same reason as the vendor's own steps.
    - Submit the award ran after Award the quantity did not run, and Procol refused the empty proposal (422, code 683), which was filed as a bug too. Now it needs Award the quantity to have worked.
    - An API journey with no failure but steps not run ends as "Partly tested: N of M steps did not run — <first reason>", never "Everything worked". That holds everywhere the verdict is shown: the live end box, a saved run opened again (the first fix missed this; Aanya: "most of the journey cases are not run, and u still say worked?"), the outcome line under the steps (amber –, not a green ✓), the Runs list badge, and the server's own sentence ("Partly tested: 11 of 27 steps worked; 16 did not run").
    - Real vendors, not the test product's QA ones (Aanya: "why use qa vendors then?? use real vendors"). Before building, the journey counts the real vendors with a login that Procol suggests for the product it is about to use. When there are fewer than the plan's bidders, it reads the open PRs and builds the event from the first PR line whose product has enough (else the one with the most), linked to that PR, and says so under the run. A PR or product named by the caller is kept. On PROCOL DEMO (2 Nov): the test product has 2 suggested vendors, both QA; PR 0110000180's product has 205, 35 of them real with a login.
    - Run 2026-11-01T18-48-18-375Z was corrected the same way: steps 17, 18 and 27 are not run, with their requests kept, and it has no bugs left.
    - Enforced in: prototype eventJourney.ts (`preferRealVendors`, `ensureEventVendors` reason, `performStep` on-behalf guard, `awardSubmit.needs`); journeyModel.ts `journeyOutcome`; public/app.js `journeyPartly` + session.js `summary` / `replayed` (Partly tested).

46. **Score every vendor who answered before submitting the evaluation (2 Nov, Aanya: "submit the evaluation fixx").**
    - With real vendors, two answered the technical round: one bid itself (NON PQ VENDOR) and one by surrogate (sdf). The journey scored only the first, and Submit the evaluation was refused with 571 "Please, evaluate on all fields". Procol expects one score per vendor with a technical response, per form the evaluator is assigned to (procol-backend evaluations_helper.rb `rfp_evaluation_count_invalid?` / `validate_section_wise_evaluations`).
    - eval_schema keeps the vendors from the round's `layers`. eval_score scores each of them on the evaluator's form, best first (top mark, then a step lower), so a case's "8 and 6" keeps its order on a label scale (P1, P2).
    - Enforced in: prototype eventJourney.ts `evalSchema` / `evalScore`.

45. **Procol's approval-workflow picker takes only a clicked workflow; after a by-hand award, Procol's record decides (2 Nov, plan-mvz3dkql).**
    - The Submit Proposal dialog shows the first workflow ("Clause: Approval Flow …") with its radio checked, but Next does nothing until a workflow card is clicked. The award step saw "already checked", pressed Next four times and stopped with the dialog open. It now clicks the checked card (else the first) before Next.
    - The tester finished the award in the browser. expect_awarded then said "no award was submitted in this plan" without looking, although Procol held proposal #14668, approved (approval_status 2). After a by-hand part it now reads awardOfEventGroup first.
    - Enforced in: AwardPage submit-dialog loop; runPlan expect_awarded.
    - approve_award reads awardOfEventGroup first. An award Procol already holds at approval_status 2 is "nothing left to approve", never "waiting for another user" (the tester's repeated "approve" in the chat queued extra approve steps on an approved award).

47. **Answer the proposal's own questions before Submit Proposal (2 Nov, RFX-19987, Aanya: "in this case you have to submit the proposal").**
    - On PROCOL DEMO the award proposal carries the client's proposal template (Document → Basic Details, NTD-TEST-2: requirement, supply scope, procurement type, CAPEX/IP number…). The run pressed Submit Proposal with every answer empty, and the award never went through ("the Submit Proposal dialog is still open").
    - Before the submit, every empty "Enter answer…" box is filled (words in text, 1 in a number box) and every dropdown takes its first option, as a buyer would. The log says how many were answered. This goes with session 25's fix the same day (click the ticked approval-workflow card before Next).
    - Enforced in: procol-ui-tests AwardPage.ts `fillProposalDocument` (called from `createAndSubmitProposal`).

48. **An award finished by hand still gets approved by the run, and only then checked (2 Nov, plan-mvz409yh, Aanya: "this is a simple step, you have to approve twice").**
    - PROCOL DEMO's award workflow has two approval steps, both Procol Support, the run's own account. award_event approves them itself when it finishes on its own. When the tester finishes the award by hand, that approval never ran: expect_awarded found approval status 0 and failed, and the approvals only happened after the tester typed "approve".
    - expect_awarded now approves a hand-finished award as the run's buyer first, unless a later step approves, rejects or makes the PO. It then waits up to 20 s for Procol's record to read approved. Another user's approval step stays theirs.
    - The "done by you in the browser" flag is cleared at the start of every step. A flag left by the hand-finished award had labelled the run's own approve_award as the tester's. handDone stays set for the rest of the run.
    - Enforced in: procol-ui-tests runPlan.ts (`expect_awarded`, step loop).

49. **A required sheet cell the run cannot guess is filled by its own kind, or asked for by name — never left for Publish to refuse (6 Nov, Laxmi Organics UAT, Aanya: "browser must be smart enough to fill delivery location").**
    - The single-stage line-item filler searched the Delivery location cell with the product's name; nothing matched and the failure was swallowed. It now takes the first of the client's locations.
    - `fill_sheet` on the single-stage screen returned "already filled" and skipped the required-cell sweep. It sweeps on both create screens now (`fillRequiredSheetCellsOrAsk`).
    - `fillRequiredCellAnyway` tries the column's own kind first (a `buyer_hub` cell is a location search-select), then text, number, dropdown, location, date.
    - A single-stage Publish refused with "Sheet partially filled" fills or asks for the empty cells by column name and publishes once more. Words typed at a stuck Publish went to the screen explorer, which cannot reach grid cells; the question card types the answer into the cell instead.
    - Enforced in: procol-ui-tests `SingleStagePage.fillFirstLineItem`, `CreateEventPage.fillRequiredCellAnyway`, runPlan.ts (`fill_sheet`, `publish`, `fillRequiredSheetCellsOrAsk`).

50. **A typed fix mends the step; the step still runs — and a count is a count, and the vendor's part is never the buyer's browser (6 Nov, plan-mw57y3sv, Aanya: "this is so basic").**
    - "fill delivery location" at a stuck Publish filled the cell; Publish was marked done without publishing, the check after it failed and nine steps were skipped. After a typed fix the action itself runs once more (`RETRY_AFTER_TOLD` in runPlan.ts); only if that fails too does the fix stand as the finish. By hand stays theirs.
    - "invite 2 vendors" on the single-stage screen pressed Invite Vendor (7 arrived) and the run's own participant check failed. With a count and no names, that many suggestions are picked one by one (`SingleStagePage.inviteSuggested`).
    - "login with the vendor who's invited" became do_on_screen in the buyer's page and signed the buyer out. A vendor/supplier/portal goal is place_bid's (own browser): `VENDOR_GOAL` in runPlan.ts, and the same rule before the model in prototype `agents/converse.ts`.
    - A question typed with no model to answer it is answered as "could not", not turned into an on-screen goal.

50. **A product the sheet names that this client does not sell is swapped, not waited for (10 Nov, Laxmi Organics, SRC-SET-002, Aanya: "it should go and search another like simple 'a'").**
    - The sheets were written on PROCOL DEMO; "CYLINDER WITH KEY & KNOB" is not on Laxmi's list, and the Manage Line Items search retried the same name until the step timed out.
    - After a search with no result the run searches the name's first letter, then "a", takes the first product listed, and the step's text says "“X” is not on this client's product list — added “Y” instead". Same fallback in the sheet cell search on the single-stage screen.
    - Enforced in: procol-ui-tests `CreateEventPage.addOneLineItem` (`productSwaps`), `InlineSheet.fillSearchSelect`, runPlan.ts `add_line_items`.

51. **A purchase-order case on a purchase-to-bill account runs the PO flow, never an event plan (10 Nov, Decathlon, Aanya: "it still runs as event").**
    - "create a PO with 2 line items and submit the PO" compiled into an RFQ journey (setup rfq_with_bid) and failed at sign-in; on Decathlon there are no events at all.
    - The account says what it carries (`featureScope` "po" in config/tokenClients.ts). A typed case naming a PO on such an account becomes the API suite's PO run (`npx tsx src/cli/createPo.ts --client decathlon --input <this case's file>`): the line-item count from the sentence, "submit" unless the sentence says not to, one check per step of the suite's report, the PO run report linked at the end.
    - Decathlon is keyed by 57675, the id the team knows; that routes to its own deployment (sec-api.ag-ri.in) and per-run login. On Procol UAT 57675 is an empty shell with no users, so a client "added" by that id could never sign in.
    - The browser part on such an account ends as "not run" with the account's own note, instead of a browser waiting for a UAT database session.
    - Enforced in: server.ts `/api/run-case-api` (PO branch) and `/api/plan-run` (browserJourneys false → notRun); poRunner.ts `input`.

51. **A tenant outside Procol UAT signs the browser in on its own console, never through the UAT database (11 Nov, Decathlon 57675, Aanya: "why can decath not workk?").**
    - The run borrowed a UAT database session for every company; Decathlon has none there (0 users), so every browser run was refused — and the card hid the server's reason behind "no step exists".
    - Its token-client entry now carries `browserLogin` (console URL, phone and code env names); `uiFlowRunner.browserLoginEnv` injects APP_URL / API_URL / BUYER_PHONE / OTP / UI_SHOW_LOGIN=1, which win over every client profile, so the run signs in on screen like a person. Proven: "[login] signed in — the app opened /".
    - The not-run card shows the server's `why` first (app.js), so a refused run says the real reason.
    - Enforced in: prototype config/tokenClients.ts (`browserLogin`), src/ui/uiFlowRunner.ts, src/server.ts (/api/plan-run gate), public/app.js.

52. **A purchase-to-pay account's API tests are Aanya's P2P Postman collection, run as her journey (11 Nov, Decathlon, Aanya: "i gave you p2p api collection, add that to decath account or any p2p account i add").**
    - The collection (api-suite/postman/P2P_workflow.postman_collection.json, from Documents/P2P_WORKFLOW_API-AUTOMATION) stays as exported; its scripts chain the uuids. The run is newman in-process (prototype/src/p2pCollection.ts): the env_setup script's CLIENTS map gets a "spine" entry built from the account (base URL, origin, buyer phone + code, vendor login and datasource uuids when known), chosen folders only, one journey step per request in the collection's order.
    - The account is any token client with `suite: "p2p-collection"` in config/tokenClients.ts (Decathlon now). Its tree is one module, the collection's folders as features; a folder the account cannot run is greyed with the reason (no intake / purchase requests / events on Decathlon; vendor folders wait for <PREFIX>_VENDOR_EMAIL and <PREFIX>_VENDOR_OTP in api-suite/.env). Never attempted, always said.
    - Typed cases on such an account that name invoice / GRN / bill / acknowledge / intake / purchase request / event run the matching folders (invoice → bill pulls the goods receipt in between; the chain starts from the PO the API suite's PO flow made last, remembered in data/po-runs/last-po.json). A case about the PO alone still runs the PO flow.
    - Three list requests name the authoring tenant's datasource by literal uuid; the run swaps in the account's own (from the API suite's discovered client config). Replace the URL with a plain string — an object with only `raw` is sent with no URL.
    - Enforced in: p2pCollection.ts, server.ts (`/api/features` p2p-collection branch, `/api/collection-run`, `/api/collection-report`, run-case-api collection branch), app.js `runCollectionSuite`.

52. **A case on a tenant's own screens runs its own steps one by one, never as one blob (12 Nov, Decathlon short close, Aanya: "test steps were also there, then why can't this dumb platform complete this").**
    - The whole case went to the explorer as a single goal; it opened a Draft PO (no Short Close there) and scrolled "Show Less" in circles.
    - `ownScreensPlan` (server.ts) turns "Steps: 1. … 2. …" into one do_on_screen goal each, with the preconditions and data attached, and the expected result as a final check-only goal; a "wait N seconds" step folds into the goal after it. Each goal carries the tenant's screen hints: actions sit under the ⋮ menu when not buttons; "open a Purchase Order" means one whose status fits the action, never a Draft for Short Close.
    - The planner's event catalog is never used for such a tenant (`ownScreens` gate at the compile).

53. **PRD cases follow the senior-QA method: prove, contrast, all surfaces, respect the PRD, tag known items, open questions, self-review (12 Nov, Aanya's brief on the snapshot and credit-note sets).**
    - Her review found a self-contradictory case (a line added to a closed PO), an unmeasurable "~10× faster", the freeze split over two one-sided cases, no cross-surface case, missing deactivate/delete/merge/race edges, and a bug-confirming case that would pass silently.
    - prd.ts: STRUCTURE reads sections, rules, known items and questions; SCENARIO plans the full coverage list with one contrast scenario per "A stays / B changes"; CASES writes 1-4 dense cases per scenario under the quality bar (consequence, self-contained, contrast, all surfaces, placeholders, Observation for the unmeasurable, Bug-confirm + [BUG-CONFIRM]/[KNOWN BEHAVIOUR] in qaComment, assumptions explicit); REVIEW applies remove / rewrite / merge edits over the whole set and returns the blocking open questions. A deterministic edge scenario (deactivated / deleted / merged source, capture-window race) is added when the planner skips it.
    - Types: Integration, Security, Performance, Bug-confirm, Observation added (runCases.ts, runCases.js, prd.js). Excel: TC ID | Module | Test Scenario | Test Case | Preconditions | Test Steps | Test Data | Expected Result | Priority | Type | Actual Result | QA Comment, plus Coverage map and Open questions tabs (bugsExport.js `extra`).
    - Snapshot PRD after the change: 59 → 27 denser cases, 56/57 rules covered, the contradiction gone (closed PO = blocked, control = open PO), "10×" an Observation with 20 timed loads, deactivation and deletion edges present; merge still not written by the model.
