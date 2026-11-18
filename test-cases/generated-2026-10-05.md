# Generated test cases — drafts (2026-10-05)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-LI-003 — Validate negative quantity on RFQ line item

- **Why it matters.** The system must not allow a negative quantity on a line item in an RFQ event. **Draft, needs review** — written by the assistant on 2026-10-05 from a request typed in the chat box; the automation built for it covers all of it.
- **Setup.** Create a draft RFQ event with a single line item; all required product and quality records exist.
- **Steps.** 1. Open the RFQ creation screen. 2. Add one line item. 3. Enter a valid product and quality. 4. Set the quantity value to a negative number. 5. Attempt to save/publish the RFQ.
- **Expected.** The RFQ cannot be saved; the user receives a validation error indicating that quantity must be positive.
- **Oracle.** The API response returns a 422 status (or equivalent validation message) and the UI displays an error near the quantity field.
- **Trace.** P1 · draft · `GEN-LI-003` · layer api+ui · coverage full · api plan on `published_rfq` · overlaps `API-XDAMD-035`, `API-XDPRE-057`, `API-XDPRE-008` · typed: “test a rfq event with 1 line item with negative quantity”

