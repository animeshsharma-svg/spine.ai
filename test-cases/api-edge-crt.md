# Edge & negative cases — creating an event and its line items

Each case takes a request that works and changes ONE field. Written from procol-backend origin/main; the cited line is the guard (or the missing guard) that decides the answer.

## 1. Status

#### API-XCRT-001 — Create rejects unknown status

- **Why it matters.** `status`: status is an enum; an unknown value is the most common client typo. An untyped 500 here means every bad status crashes the endpoint.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only status. 2. Read the status code and error.
- **Expected.** HTTP 422 (a typed refusal) — never a 500. The status is cast straight into the EventGroup enum (app/services/event_groups/create_service.rb:36), so an unknown value raises ArgumentError unless it is caught.
- **Oracle.** A 4xx with the typed error code, and nothing created or changed.
- **Trace.** P1 · automate · `EDGE-CRT-001` · `app/services/event_groups/create_service.rb:36`

#### API-XCRT-002 — Create with status withdrawn does not crash

- **Why it matters.** `status`: A value valid for the parent but not the child enum is exactly where copy-down code crashes.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only status. 2. Read the status code and error.
- **Expected.** No 5xx. "withdrawn" is a valid EventGroup status but NOT a line-item status (app/models/event_group_line_item.rb:28), and create copies the status onto the line items (app/services/event_groups/create_service.rb:36).
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-002` · `app/models/event_group_line_item.rb:28`

#### API-XCRT-003 — Create with status as number is refused

- **Why it matters.** `status`: Wrong type for an enum: a number can be accepted as a hidden index and skip the draft stage.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only status. 2. Read the status code and error.
- **Expected.** No 5xx; ideally 422. Rails enums accept an integer index, so 1 may silently mean "active" — creating a live event from a draft request.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-003` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-004 — Create with blank status is refused

- **Why it matters.** `status`: Blank string is the empty form field case; must be treated like a missing status.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only status. 2. Read the status code and error.
- **Expected.** HTTP 422 code 2 "Insufficient parameters" — app/controllers/api/event_groups_controller.rb:25 checks params[:status].blank?
- **Oracle.** A 4xx with the typed error code, and nothing created or changed.
- **Trace.** P1 · automate · `EDGE-CRT-004` · `app/controllers/api/event_groups_controller.rb:25`

## 2. The BOQ flag and config

#### API-XCRT-005 — Create with boq flag string false is not boq

- **Why it matters.** `config.boq_based_rfx`: Boolean sent as text is common from form posts and scripts; truthy-string handling silently flips the event type.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only config.boq_based_rfx. 2. Read the status code and error.
- **Expected.** HTTP 2xx and a normal (non-BOQ) draft. The controller reads params.dig('config','boq_based_rfx') || false (app/controllers/api/event_groups_controller.rb:28): the STRING "false" is truthy in Ruby, so where BOQ is not allowed it answers 101 "You are not allowed to perform this action" — a coercion defect.
- **Oracle.** A 2xx and the change is really there when read back.
- **Trace.** P2 · automate · `EDGE-CRT-005` · `app/controllers/api/event_groups_controller.rb:28`

#### API-XCRT-006 — Create with boq flag zero is not boq

- **Why it matters.** `config.boq_based_rfx`: 0/1 flags are standard in other stacks; Ruby's truthiness makes 0 mean ON.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only config.boq_based_rfx. 2. Read the status code and error.
- **Expected.** HTTP 2xx and a normal draft. 0 is truthy in Ruby, so app/controllers/api/event_groups_controller.rb:28 treats it as BOQ ON → 101 where the workspace forbids BOQ.
- **Oracle.** A 2xx and the change is really there when read back.
- **Trace.** P2 · automate · `EDGE-CRT-006` · `app/controllers/api/event_groups_controller.rb:28`

#### API-XCRT-007 — Create with config as array does not crash

- **Why it matters.** `config`: Wrong container type (array for object) is a classic unguarded dig.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only config. 2. Read the status code and error.
- **Expected.** No 5xx. params.dig on an array config raises TypeError in app/controllers/api/event_groups_controller.rb:28.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-007` · `app/controllers/api/event_groups_controller.rb:28`

## 3. Line item fields

#### API-XCRT-008 — Create line item without quality is refused

- **Why it matters.** `line_items[].product_quality_uuid`: A missing required id inside a nested item is the most likely nil-dereference in create.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[].product_quality_uuid. 2. Read the status code and error.
- **Expected.** A typed 422, never a 500. The quality is looked up and used without a nil check (app/controllers/concerns/trade_controller_helper.rb:6300-6302).
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-008` · `app/controllers/concerns/trade_controller_helper.rb:6300-6302`

#### API-XCRT-009 — Create line item without product is refused

- **Why it matters.** `line_items[].product_uuid`: Missing parent id in a nested item.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[].product_uuid. 2. Read the status code and error.
- **Expected.** A typed 422, never a 500 — product lookup is not nil-guarded (app/controllers/concerns/trade_controller_helper.rb:6291-6302).
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-009` · `app/controllers/concerns/trade_controller_helper.rb:6291-6302`

#### API-XCRT-010 — Create line item with null quantity is refused

- **Why it matters.** `line_items[].quantity`: null where an object is expected — reading .value off nil.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[].quantity. 2. Read the status code and error.
- **Expected.** A typed 422 (quantity is required), never a 500.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-010` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-011 — Create line item with unknown unit does not crash

- **Why it matters.** `line_items[].quantity.unitSymbol`: Free-text into what the UI treats as a unit list.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[].quantity.unitSymbol. 2. Read the status code and error.
- **Expected.** No 5xx; ideally 422 "unknown unit". An unknown unit stored as-is breaks every later conversion.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-011` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-012 — Create line item with decimal quantity for nos

- **Why it matters.** `line_items[].quantity.value`: Decimal where the unit implies an integer.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[].quantity.value. 2. Read the status code and error.
- **Expected.** No 5xx. A count unit ("Nos") with a fractional value should be refused or rounded explicitly — not stored as 10.5 pieces.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-012` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-013 — Create line item with huge quantity

- **Why it matters.** `line_items[].quantity.value`: Over column precision: the database raises, not the model.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[].quantity.value. 2. Read the status code and error.
- **Expected.** No 5xx — a numeric overflow on the decimal column should be a 422, not a database error.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-013` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-014 — Create with same product twice

- **Why it matters.** `line_items`: Duplicate entries in a list.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items. 2. Read the status code and error.
- **Expected.** No 5xx. Either both lines are kept with serial numbers 1 and 2, or the duplicate is refused with a clear code — never a uniqueness crash.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-014` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-015 — Create with line item as string

- **Why it matters.** `line_items[]`: Wrong element type inside the list.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only line_items[]. 2. Read the status code and error.
- **Expected.** A typed 422, never a 500 (string where a line-item object is expected; app/controllers/concerns/trade_controller_helper.rb:6291 indexes into it).
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-015` · `app/controllers/concerns/trade_controller_helper.rb:6291`

## 4. Text and attachments

#### API-XCRT-016 — Create with attachments as string does not orphan

- **Why it matters.** `attachments`: A crash after commit is worse than before: the client sees failure, the database kept the record.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only attachments. 2. Read the status code and error.
- **Expected.** No 5xx. Attachments as a string reach the serializer AFTER the commit (app/models/event_group.rb:333), so a 500 here leaves an orphan draft behind.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-016` · `app/models/event_group.rb:333`

#### API-XCRT-017 — Create with attachments array of strings

- **Why it matters.** `attachments[]`: Array of the wrong element type.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only attachments[]. 2. Read the status code and error.
- **Expected.** No 5xx (same path as above, event_group.rb:333).
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-017` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-018 — Create with whitespace title

- **Why it matters.** `title`: Whitespace-only passes a blank? check in some code paths and not others.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only title. 2. Read the status code and error.
- **Expected.** No 5xx; ideally 422 or a trimmed default title — a blank-looking event in every list is a UX defect.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-018` · `app/controllers/api/event_groups_controller.rb`

#### API-XCRT-019 — Create with numeric description

- **Why it matters.** `description`: Type mismatch in a free-text field.
- **Setup.** A buyer session; a product and quality from the company's catalog.
- **Steps.** 1. POST /event_groups with a working draft body, changing only description. 2. Read the status code and error.
- **Expected.** No 5xx — a number where text is expected should be stored as text or refused.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P2 · automate · `EDGE-CRT-019` · `app/controllers/api/event_groups_controller.rb`

## 5. Updating an event (PATCH)

#### API-XCRT-020 — Patch with only title changes title

- **Why it matters.** `title (PATCH)`: A success response for a change that was not made hides the bug from every client.
- **Setup.** A sandbox copy of an event built by the platform ({{eventGroupUuid}}), published.
- **Steps.** 1. PATCH /event_groups/{{eventGroupUuid}} changing only title. 2. Read the status code and error.
- **Expected.** HTTP 2xx and the title really changes. Code note: a PATCH carrying only title answers 200 without applying it (app/controllers/concerns/event_group_controller_helper.rb:29-36) — a silent no-op the client cannot detect.
- **Oracle.** A 2xx and the change is really there when read back.
- **Trace.** P2 · automate · `EDGE-CRT-020` · `app/controllers/concerns/event_group_controller_helper.rb:29-36`

#### API-XCRT-021 — Patch with unknown status is refused

- **Why it matters.** `status (PATCH)`: Unknown enum on the update path.
- **Setup.** A sandbox copy of an event built by the platform ({{eventGroupUuid}}), published.
- **Steps.** 1. PATCH /event_groups/{{eventGroupUuid}} changing only status. 2. Read the status code and error.
- **Expected.** A typed 422, never a 500 (enum cast on update, app/services/event_groups/update_service.rb).
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-021` · `app/services/event_groups/update_service.rb`

#### API-XCRT-022 — Patch back to draft after publish

- **Why it matters.** `status (PATCH)`: Wrong-order state transition (active → draft).
- **Setup.** A sandbox copy of an event built by the platform ({{eventGroupUuid}}), published.
- **Steps.** 1. PATCH /event_groups/{{eventGroupUuid}} changing only status. 2. Read the status code and error.
- **Expected.** No 5xx; a published event should not silently go back to draft — expect a refusal or no change.
- **Oracle.** Any answer below 500; a 5xx is a defect.
- **Trace.** P1 · automate · `EDGE-CRT-022` · `app/controllers/api/event_groups_controller.rb`
