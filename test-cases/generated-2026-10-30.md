# Generated test cases — drafts (2026-10-30)

Every case below was written by the spine.ai assistant when someone typed a test case that no existing case covered.
They are DRAFTS: nothing here is in the catalog until a person reviews it and moves it into a catalog file
(the importer does not read `generated-*.md`, and `GEN-` ids are not parsed).

## 1. Drafts from the assistant

### GEN-JRN-001 — Publish button is disabled when title is empty

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** Buyer on the eRFX create screen with no title entered
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" from the left menu 3. Leave the "Title" field blank 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose any template 7. Click "Add line item" and fill product name "QA_Product_1" 8. Enter quantity "10" and unit price "100" 9. Click "Save schedule" and set duration to "30" minutes
- **Expected.** "Publish" button is greyed out with tooltip "Title is required"
- **Oracle.** "Publish" button is greyed out with tooltip "Title is required"
- **Trace.** Critical · Negative · draft · `GEN-JRN-001` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-002 — Cannot add line item with zero quantity

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen, title entered, stage set to RFQ
- **Test data.** Product: QA_Product_1, Quantity: 0, Unit price: 100
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "Test RFQ Zero Qty" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose a template 7. Click "Add line item" 8. Type "QA_Product_1" in the product field 9. Enter "0" in the "Quantity" field 10. Enter "100" in the "Unit price" field
- **Expected.** An inline validation message appears next to Quantity: "Quantity must be greater than 0" and "Add line item" cannot be saved
- **Oracle.** An inline validation message appears next to Quantity: "Quantity must be greater than 0" and "Add line item" cannot be saved
- **Trace.** High · Negative · draft · `GEN-JRN-002` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-003 — Negative unit price is rejected on pricing sheet

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen with a line item added
- **Test data.** Product: QA_Product_1, Quantity: 5, Unit price: -50
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "Test RFQ Negative Price" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose a template 7. Click "Add line item" 8. Enter "QA_Product_1" as product 9. Enter "5" as quantity 10. Enter "-50" as unit price
- **Expected.** Validation message next to Unit price: "Price cannot be negative" and the line cannot be saved
- **Oracle.** Validation message next to Unit price: "Price cannot be negative" and the line cannot be saved
- **Trace.** High · Negative · draft · `GEN-JRN-003` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-004 — Publish succeeds with default schedule of 30 minutes

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen with title, one valid line item, schedule set to 30 minutes, vendors invited automatically
- **Test data.** Product: QA_Product_1, Quantity: 10, Unit price: 100, Schedule: 30
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "Standard Publish RFQ" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose a template 7. Click "Add line item" 8. Enter "QA_Product_1" as product 9. Enter "10" as quantity 10. Enter "100" as unit price 11. Click "Save schedule" and set duration to "30" minutes 12. Click "Invite vendors" and select the suggested vendors (QA_Platform Vendor A, QA_Platform Vendor B) 13. Click "Publish" and confirm in the modal
- **Expected.** The event status badge changes to "Published" and a toast appears "RFQ published successfully"; the event appears in the "Live" list
- **Oracle.** The event status badge changes to "Published" and a toast appears "RFQ published successfully"; the event appears in the "Live" list
- **Trace.** Critical · Positive · draft · `GEN-JRN-004` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-005 — Publish is blocked when no vendors are invited

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen with title, line item, schedule saved, but no vendors invited
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "No Vendor RFQ" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose a template 7. Add a line item with product "QA_Product_1", quantity "5", unit price "200" 8. Click "Save schedule" and set duration to "30" minutes 9. Do NOT click "Invite vendors"
- **Expected.** "Publish" button is greyed out with tooltip "At least one vendor must be invited"
- **Oracle.** "Publish" button is greyed out with tooltip "At least one vendor must be invited"
- **Trace.** Critical · Negative · draft · `GEN-JRN-005` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-006 — Schedule duration cannot be less than 5 minutes

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen, title entered, line item added
- **Test data.** Schedule: 3 minutes
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "Short Schedule RFQ" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose a template 7. Add a line item with product "QA_Product_1", quantity "2", unit price "150" 8. Click "Save schedule" and type "3" minutes
- **Expected.** Inline error next to schedule field: "Minimum schedule is 5 minutes" and the schedule cannot be saved
- **Oracle.** Inline error next to schedule field: "Minimum schedule is 5 minutes" and the schedule cannot be saved
- **Trace.** Medium · Negative · draft · `GEN-JRN-006` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-007 — Multiple vendors can be invited from product suggestions

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen with a product that has two suggested vendors
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "Multi Vendor Invite RFQ" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose a template 7. Add line item with product "QA_Product_1" (which suggests QA_Platform Vendor A and QA_Platform Vendor B) 8. Click "Invite vendors" 9. In the invitation dialog, verify that both QA_Platform Vendor A and QA_Platform Vendor B are listed and selected 10. Click "Send Invitations" 11. Click "Publish" and confirm
- **Expected.** Both vendors appear in the "Invited Vendors" list, the "Publish" button becomes enabled, after publishing the status is "Published" and a toast confirms success
- **Oracle.** Both vendors appear in the "Invited Vendors" list, the "Publish" button becomes enabled, after publishing the status is "Published" and a toast confirms success
- **Trace.** High · Positive · draft · `GEN-JRN-007` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

### GEN-JRN-008 — Record what happens when a template with no pricing sheet is selected

- **Why it matters.** A senior tester's addition to the journey "Create an RFQ with one product and publish it". **Draft, needs review** — written by the assistant on 2026-10-30 from a request typed in the chat box; no automation could be built for it yet — no step of this journey's plan checks it yet.
- **Module / scenario.** Journey — Create an RFQ with one product and publish it — A senior tester's addition
- **Who.** Buyer · Buyer portal
- **Setup.** eRFX create screen, title entered, stages set to RFQ, template chosen that lacks a pricing sheet definition
- **Steps.** 1. Log in to Procol (buyer side) with the buyer user 2. Click "Create eRFX" 3. Enter "Template Missing Pricing" in the "Title" field 4. Set the stages to "RFQ" 5. Switch to the "RFQ" stage tab 6. Choose the template named "EmptyPricingTemplate"
- **Expected.** Record what happens
- **Oracle.** Record what happens
- **Trace.** Low · Edge · draft · `GEN-JRN-008` · layer ui · coverage none · typed: “journey: Create an RFQ with one product and publish it”

