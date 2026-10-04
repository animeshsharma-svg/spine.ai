# Dynamic UI automation — how spine.ai should test screens like a senior manual QA

## 1. First decide WHERE each expectation can be observed (per assertion, not per case)

A written case is split into assertions ("the bid is refused", "the Submit button is disabled", "the total shows ₹1,43,980", "an error appears under Quantity"). Each assertion is tagged with the cheapest layer that can actually observe it:

| The assertion is about… | Observed at | Why |
|---|---|---|
| a rule or data: refused / accepted / status / stored value / total / rank | **API** | fast, deterministic, no flakiness |
| what a person sees or can do: visible, label, highlighted field, disabled, toast text, order, formatting, navigation, empty state | **UI** | only a screen can show it |
| both: data changed AND the user should see it | **API for the truth + UI for the display + cross-check** | the screen must show what the backend holds |

Rules:

- Never build UI steps for an assertion the API already proves.
- Never claim a UI assertion from API data.
- A case with no UI assertion stays API-only, even if it was written as a "UI case".

## 2. Set up state through the API, use the screen only for what the case is about

A senior QA prepares test data the quickest way, then exercises the screen under test. spine.ai builds the event state through the API journey (QA vendors only) and opens the screen already in the right state. The browser only performs the steps the case is about.

## 3. Screen model (knowledge the compiler is grounded on)

For each events screen we hold:

- its route;
- the API calls that feed it;
- its elements by accessibility role and label (with data-testid where present);
- its states: draft / live / closed, buyer / vendor;
- its transitions: action → next screen;
- which API field each displayed value comes from.

Sources: knowledge/events/frontend-digest (cited to the console code) plus recorded exploration runs (accessibility snapshots), stored in spine.ai's database.

## 4. Fixed step vocabulary, compiled from prose, validated in code

**Actions:** navigate, open(tab), click(label), fill(field, value), choose(field, option), upload(field, file), wait_for(api call).

**Expectations:**

- expect_visible / expect_hidden
- expect_text(field, value | from API)
- expect_enabled / expect_disabled
- expect_field_error(field, message)
- expect_toast(message)
- expect_count(list, n)
- expect_order(list, by)
- expect_navigated(screen)

Rules for the compiler:

- The model only proposes the step list. Every step must exist in the vocabulary and resolve against the screen model, or the plan is partial with the named gap.
- Same-intent cases reuse the closest working UI plan (UI exemplars, like the API exemplars).

## 5. After every action, look at the screen like a senior QA (the "observation pass")

The runner checks deterministic rules on every screen it visits, not just the final assertion:

- the expected API call happened;
- the visible values equal what the API sent (cross-check);
- no "NaN", "undefined", "null" or raw ids on screen;
- no console errors or failed requests;
- controls are enabled or disabled as the state requires;
- error messages appear next to the right field;
- nothing that should be there is missing.

Each check produces evidence: a screenshot, an accessibility snapshot, and the request/response pair. An optional vision model may *flag* things for a person to look at (overlaps, cut-off text), but it never decides pass or fail.

## 6. Verdicts stay deterministic and honest

| Outcome | Meaning |
|---|---|
| product failure | the screen contradicts the API or the case, reproduced on a second fresh event, and the console code confirms the screen should show it |
| automation problem | a locator is not found or the screen changed; the locator is re-resolved from the screen model, otherwise "automation needs update" — never counted as a product bug |
| couldn't tell | the environment failed, or the state could not be built |

## 7. Learning

Every passing UI run's step trace becomes a UI exemplar. Every locator fix is stored on the screen model. Every new screen state discovered by exploration is added. Coverage is measured per assertion layer, not only per case.

## 8. The memory behind the chatbot (layers, each with its own evaluation)

| Layer | Holds | Evaluated by |
|---|---|---|
| product knowledge | docs, PRD, Notion | memory-eval |
| code knowledge | backend + console digests, 3,713 cited rules | memory-eval, rule coverage |
| test knowledge | every case as a frame: actor, action, object, state, expected, layer | matcher-hard |
| automation knowledge | API + UI exemplars | planner subset, runnable rate |
| execution knowledge | run history, flakiness, verified bugs | false-positive rate, couldn't-tell rate |
| client knowledge | per-client settings, templates, units | per-client pass rates |

Chatbot pipeline:

1. understand (frame);
2. retrieve per layer;
3. decide (existing / partial / new);
4. split into assertions and pick a layer for each;
5. compile API + UI;
6. run (setup by API);
7. explain in plain English with evidence.

Each stage is measured separately, so a regression is visible where it happens.
