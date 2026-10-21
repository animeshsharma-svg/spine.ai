# Demo run-sheet — 21 October 2026

Start the dashboard (`cd prototype && npm run serve`, then http://localhost:4300, sign in with your
name). Keep one browser at a time: nothing else should be driving UAT during the demo.

## 1. Screens — what spine.ai saw and learnt (3 min)

Open **Screens** in the sidebar.

- The library: every screen of the events flow the walk photographed. Read a card: controls,
  described, test cases.
- Open **create-line-items** (or any create screen). Hover the picture: every control has a box;
  the tooltip says what it does and where it leads. Switch to **Numbered map**.
- Pick **Publish** in the list: "What it does / affects / leads to / how to check", with the rule from
  Procol's code it comes from. Press **Write a test case from this** — a case appears, compiled to a
  browser plan.
- Scroll to **Test cases written from this screen**: steps and expected results a tester could run
  as they are.

## 2. The spotlight — real pictures of real tests (3 min)

On any case press **Run with spotlight**. The browser panel shows the product being driven; the
**Screenshots** strip fills with a picture per action — the control framed in magenta, the step named
on the label — and a green "✓ Verified" picture after each assertion that passed. Click a picture to
enlarge. When the run ends, the verdict and the step count are on the panel.

The same happens for every run from **Run tests** (type a case there, watch the session): the
**Screenshots** strip sits under the live browser, and each step in the list carries its pictures.

**How a case picks its event.** A case written from a screen never runs on the walk's old event or
on one found by searching the list. Its plan is compiled for the state its screen needs — a bid
event (a vendor's bid in) for Responses, Master QCS and awarding; a proposal event for the proposal
page — the API builds that event before the run, and the plan opens it by route (`open_prepared`).
The card says "on a bid event the API builds". Verified 21 Oct: awarding 3/3, settings 3/3,
participants 7/7, each on a fresh event.

## 3. A new case, on the spot (2 min)

On a screen's page, type into **Test something new on this screen**, e.g.
"Publishing without a title shows an error and stays on the create screen", then press
**Write, then run with spotlight**. spine.ai compiles it with the route to that screen in front
(the walk's own steps), saves it as a case, and runs it — pictures streaming as it goes.

## 4. Every kind of event (2 min)

Back on **Screens**, the **Event combinations** table: the product's grid run overnight — eRFX
(auction, RFQ, technical, technical + RFQ, technical + auction), single-stage (RFQ, RFP, auction
rank / price / traffic light × lot / line-item awarding), BOQ; outcomes publish, draft, surrogate
bid, two vendors, counter offer, RFQ → auction conversion. Each row: steps passed, pictures taken,
where it stopped if it did. The failures are the interesting rows — open the picture.

## 5. Walk it live (optional, 3 min)

On **Screens**, tick **The events list and its tabs** only and press **Start walking**: the browser
goes through the product, the screens appear on the page as they are photographed, each with its
cases. (About 3 minutes; the full walk set is 30+ minutes.)

## Numbers to have ready (as of 21 Oct, 03:00)

- Screens in the library: **46** · controls on them: **1,310** (1,150 described) · test cases written from screens: **243** (176 with a browser plan, the rest say why they cannot be expressed yet)
- Event combinations: **22 of 22 passed** (eRFX 12, single-stage 9, BOQ 1) · **919 spotlight pictures** in that run alone
- Walks: all 7 pass end to end (events list, eRFX create → publish → bid → Master QCS, single-stage auction, BOQ template, compare & award, proposal, RFQ → auction)
- What the night found about the product (each with a picture): a counter offer cannot be sent on a surrogate bid; the single-stage screen has no Save as draft; BOQ line items arrive only by upload; a non-preset duration lands on different presets per stage and publish is refused
- Evidence folders: `procol-ui-tests/evidence/walk-*`, `combo-*`; results `prototype/data/combos/latest.json`, `prototype/data/screens/index.json`

## If something is off

- A run says "waiting for the browser": another run holds the slot; wait or stop it (Sessions).
- A case has "No browser plan yet": its coverage is none — pick another, or type a clearer one.
- The model is slow: Slingring's fast tier sometimes takes 10–30 s; the page says what it is doing. On 21 Oct ~10:50 Slingring answered 429 ExceededBudget — compiles fall back to Gemini (slower, works).
