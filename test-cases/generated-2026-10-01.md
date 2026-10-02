# Generated test cases — drafts (2026-10-01)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-LI-001 — Draft event retains three line items of same product with distinct quantities

- **Why it matters.** Ensures the system does not collapse duplicate product entries when quantities differ **Draft, needs review** — written by the assistant on 2026-10-01 from a request typed in the chat box; the automation covers part of it — not yet: API part: it does not read the record back to confirm what was kept.
- **Setup.** A product and its quality are available in the catalogue.
- **Steps.** 1. Create a new draft sourcing event. 2. Add the same product three times, each with a different quantity value. 3. Save the draft event. 4. Retrieve the draft event details.
- **Expected.** All three line items appear in the saved draft with their respective quantities.
- **Oracle.** The returned draft contains exactly three line items, each referencing the same product UUID but with the three distinct quantity values supplied.
- **Trace.** P1 · draft · `GEN-LI-001` · layer api · coverage partial · overlaps `API-EG-001`, `API-XCRT-014`, `API-XSTG-092`, `API-XCRT-012`, `API-XCRT-013`, `API-XSTG-094`, `API-XCRT-010`, `API-NDRAFT-009` · typed: “Creating a draft event with 3 line items for the same product and different quantities keeps all three”

### GEN-LIST-001 — Pin event to top

- **Why it matters.** A buyer needs to keep an important event immediately accessible from the events list. **Draft, needs review** — written by the assistant on 2026-10-01 from a request typed in the chat box; no automation could be built for it yet — UI part: action to pin an event; UI part: assert that the event appears at the top of the events list.
- **Setup.** Sign in as a buyer who can view events, and prepare several visible events including one that is not currently first.
- **Steps.** 1. Open the events list. 2. Open the actions for the target event. 3. Choose the option to pin the event. 4. Return to the events list if necessary. 5. Refresh the list. 6. Observe the order of the events.
- **Expected.** The target event is marked as pinned and appears at the top of the events list after the action and after refreshing.
- **Oracle.** The target event is visibly first in the list and retains its pinned state after refresh.
- **Trace.** P1 · draft · `GEN-LIST-001` · layer none · coverage none · overlaps `UI-ENV-001`, `UI-PART-018`, `UI-ENV-006` · typed: “Buyer can pin an event to the top of the events list”

### GEN-LI-002 — Renaming a draft event does not alter its line items

- **Why it matters.** Ensures that a simple name change cannot unintentionally modify the underlying procurement data. **Draft, needs review** — written by the assistant on 2026-10-01 from a request typed in the chat box; no automation could be built for it yet — UI part: Rename an existing saved draft and persist the changed title.; UI part: Assert that the draft's line items are unchanged by comparing them before and after the rename..
- **Setup.** Create a draft procurement event with at least two distinct line items, each having unique product and quantity values.
- **Steps.** 1. Open the draft event in the system. 2. Edit the event title field and change it to a new, unique name. 3. Save the changes. 4. Navigate back to the event details view. 5. Inspect the list of line items.
- **Expected.** The event title reflects the new name, while the number of line items, their product references, quantities, and other attributes remain exactly as they were before the rename.
- **Oracle.** Compare the line‑item collection retrieved after the rename with the collection captured before the rename; they must be identical in count and attribute values.
- **Trace.** P1 · draft · `GEN-LI-002` · layer none · coverage none · overlaps `GEN-LI-001`, `UI-PUB-020`, `API-PUB-017` · typed: “Renaming a draft event keeps its line items unchanged”

