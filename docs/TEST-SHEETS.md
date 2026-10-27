# Test sheets — run the team's manual test cases

spine.ai runs test cases written the way the team writes them: the 13 columns of the manual sheets
(Test Case ID, Module, Scenario, Test Case Title, User Role, Portal, Pre-conditions, Test Data, Test
Steps, Expected Result, Priority, Test Type, Status) and plain language. Everything it writes itself
uses the same columns and voice.

## Run one case

Type its ID (`SRC-AWD-012`) or its title in **Run tests** (or on Home). The case is taken from the
sheet with every column. Its pre-conditions decide which event is built first by API ("Set-up case
SRC-SET-004 done", or words such as "a closed RFQ where Vendor A quoted 100"). Its steps and expected
result become the browser plan, which opens on the screen the case is about (Master QCS, Responses,
Participants, the summary…). A case that starts from something the API cannot build yet (a withdrawn
event, a forward auction, a service RFQ, an event made from a PR) says so instead of guessing.

## Run many, one by one

**Test sheets** in the left menu (`#/sheets`):

1. Pick a sheet. The sourcing sheet (1,005 cases, `docs/test-cases/Procol-Sourcing-Test-Cases-PR-to-PO.xlsx`)
   is there already. Or **upload** an .xlsx or .csv in the same columns. A sheet with the same name
   replaces the old one. "Steps", "Expected", "Preconditions" and similar header words are understood.
2. Search, pick a module, tick the cases (or "Run this case" on one row).
3. **Run ticked cases one by one.** Each case: the event it needs is built, the steps run in the
   browser (tick "Watch the browser" to see it), and the case ends with one of five results:
   - **Pass**: every step worked and every check held.
   - **Fail**: the screen or the app contradicted the expected result. This is a bug, with screenshots.
   - **Partly checked**: the part with steps passed; the rest has no step yet and is named.
   - **Couldn't tell**: the automation itself could not do a step, or the event could not be built.
     Never counted as a bug.
   - **Not run**: no step exists yet for what the case checks, or its starting event cannot be built.
4. At the end: **Open the report** (counts, then every bug with what happened, what should happen, the
   app's own words, steps to reproduce and screenshots, then every case with what it did) and
   **Download the results sheet** (the same 13 columns with Status filled, plus "Run details" and
   "Bugs" sheets). Earlier runs stay listed.

API cases (Portal "API", or steps that name a request) run through the API compiler and runner instead
of the browser. Every request is checked for its status code, the shape of the reply (fields present,
of the right type) and its values. The report says each in words: "422 — Refused by a rule — the app
understood the request, but a product rule said no", "Schema check: “line items” is a list",
"Data check: “quantity” equals the quantity sent in step 1".

## Where it lives

| What | File |
|---|---|
| Reading sheets, the catalog link, where a case starts | `prototype/src/checks/sheetCases.ts` |
| Running cases one by one, verdicts, screenshots | `prototype/src/checks/sheetRunner.ts` |
| Report and results sheet | `prototype/src/report/sheetReport.ts` |
| API results in words | `prototype/src/checks/humanApi.ts` |
| House style every generator writes in | `prototype/src/agents/caseStyle.ts` |
| Routes | `prototype/src/routes/sheets.ts` (`/api/sheets/*`) |
| Page | `prototype/public/sheets.js`, `sheets.css` |

Imported sheets are kept in `prototype/data/sheet-cases.json` and runs in `prototype/data/sheet-runs/`.
Both are git-ignored, because uploaded sheets and run outputs can hold company data.
