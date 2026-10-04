# HubSpot support tickets → regression cases

How spine.ai turns Procol's support tickets into regression test cases, and when a ticket counts as a bug.

## In short

1. You export tickets from HubSpot and drop the file into `prototype/data/hubspot/` (git-ignored).
2. `npm run hubspot:ingest` removes personal data, sorts each ticket (defect, question, request, setting, data fix),
   matches it to a feature, and writes regression cases for event defects.
3. `npm run cases:import` adds those cases to the catalog.
4. `npm run hubspot:reproduce` runs the cases on fresh test events. A ticket becomes a **bug** only when its case
   fails on **two** fresh test events **and** a line of backend code confirms the rule.

All commands run from `prototype/`.

## 1. What goes in

Any of these, in `prototype/data/hubspot/`:

| File | What it is |
|---|---|
| `tickets.raw.json` | An array of HubSpot ticket objects (API shape `{id, properties:{…}}`, or flat properties). Optional extras: `associatedCompanyName`, `associatedContactNames`, `ownerName` (used only to strip names), and `thread: [{direction, text}]` (the conversation). |
| `*.csv` / `*.xlsx` | The CRM export. Columns are matched by header name, ignoring case, and any column may be missing. |

Header names the export reader understands: Ticket ID · Ticket name · Ticket description · Pipeline · Ticket status ·
Category · Priority · Source · Create date · Close date · Last activity date · Associated Company (or "Primary
company") · Associated Contact · Ticket owner.

**Exporting from HubSpot (the usual route):**

1. Go to **CRM › Tickets**.
2. Filter what you want. For example, Category is "Product issue" and Create date is in the last 6 months.
3. Click **Edit columns** and add **Ticket description**, because the export leaves it out by default. Also keep
   Associated Company, Associated Contact and Ticket owner. They are used only to find names to remove.
4. Click **Export**, choose **CSV**, and save the file into `prototype/data/hubspot/`.

An export has no conversation thread, so classification uses only the name and the description, and its confidence
is scaled down by 15%. A JSON export with threads also uses what support replied. For example, "this is expected
behaviour" from support turns a ticket into a how-to.

## 2. What is stripped (before anything is stored or sent anywhere)

`src/hubspot/strip.ts` removes personal data with fixed rules and lists. No model is involved.

- Emails, every link (a link may carry a token or a record id), UPI ids.
- Phone numbers (+91 mobiles, landlines with STD codes, labelled numbers), long numbers, Aadhaar.
- GSTIN, PAN, IFSC, bank-account numbers.
- Addresses (an "Address:" label, pincodes, sentences that read like an address).
- Attachments (attachment lines, file names).
- Greetings, signature blocks, quoted earlier emails, "sent from my phone" and disclaimers.
- People's names: the ticket's own contact and owner fields (full name and each part, in any case), "Mr./Ms./Dr. …",
  "my name is …", "this is … from", and any other run of capitalised words that are not product words.
- Company names: the ticket's associated company, "M/s …", and "… Pvt Ltd / Limited / LLP / Industries …" shapes.
  A company that maps to a known Procol client (PROCOL DEMO 198678, Demo Account 2 32461, Moon Beverages 39490,
  GMMCO 47053) becomes "the client", and only its id is kept. Any other company becomes "[company]".

Then a **leak check** looks again with broader patterns: "name [at] domain dot com", digits split by slashes or
brackets, lower-case tax ids, and any dictionary name that is still there. If anything turns up, the check **fails
closed**:

- The ticket never reaches any model, not even the embedder.
- Its subject, summary and scenario are stored as "[withheld …]".
- It is flagged in the summary as `leakFlagged`.

The stripper prefers to over-strip: a quantity that looks like a phone number becomes "[phone]".

Unit tests: `npm run hubspot:unit` (scripts/hubspot-unit-tests.ts, 32 tests, offline).

## 3. How a ticket is sorted and matched (rules first)

| Step | First | Only when that cannot decide |
|---|---|---|
| Defect, how-to, request, setting or data fix | Scored phrases, plus HubSpot's category; support's reply weighs most | Slingring **fast** tier, answer schema-checked |
| Which feature (of the 94 in `config/featureTree.ts`) | A known defect pattern, then keyword phrases | The embedder (`src/rag/embedder.ts`), then the Slingring fast tier picks from the top 4 |
| Reproducible scenario | A hand-written defect pattern (`src/hubspot/patterns.ts`) | The fast tier writes one from the stripped text (event defects only), schema-checked; otherwise a placeholder for a person |

Models: only Slingring, and only the fast tier. The reason tier ($50 per 1M tokens) is never used. Groq and Gemini
are never used for tickets. Only a ticket that passed the leak check is sent. Every decision records how it was made
(`rule` / `embedding` / `llm`) and how confident it is.

## 4. What is stored where

| Where | What | Committed? |
|---|---|---|
| `prototype/data/hubspot/tickets.raw.json`, `*.csv`, `*.xlsx` | The export as HubSpot gave it (customer data) | **Never** (git-ignored) |
| spine.ai's database, table `support_tickets` (migration 007) | Stripped subject and summary, category, dates, client id (known clients only), module, feature, classification and confidence, how each was decided, scenario, linked case ids, reproduction status and evidence, counts of what was removed, leak flags. **There is no raw-text column.** | No (it is a database) |
| `prototype/data/hubspot/tickets.processed.json` | The same stripped rows, used when the database is down | **Never** (git-ignored) |
| `prototype/data/hubspot/ingest-report.json`, `feature-vectors.json`, `plans/` | Per-ticket decisions, cached feature vectors, cached API plans | **Never** (git-ignored) |
| `test-cases/hubspot-regressions.md` | The regression cases, in **generic** words from the patterns, with tickets referenced only by HubSpot id in each case's Trace | Yes |
| Code, migration 007, `data/fixtures/hubspot-tickets.synthetic.*` (100% invented), this document | | Yes |

When real tickets are ingested, `hubspot-regressions.md` is regenerated from them, and the synthetic self-test rows
are deleted from the database.

## 5. How a ticket becomes a bug

1. **Classified as a defect** in the sourcing-events scope: events, ERFX, event add-ons, auctions, bidding,
   evaluation, negotiation, awarding, and PR → event.
2. **A regression case** `HS-<ticketId>-1` is written. Tickets that report the same pattern share one case.
3. `npm run hubspot:reproduce` builds an API plan for the case. It uses the pattern's hand-written plan when there is
   one. Otherwise it compiles the case's words with the API test compiler, using the fast tier only. A compiled plan
   that sends a library request without first building the state that request assumes is refused before it runs.
   This stops the "nearest step" trap from producing a false failure.
4. The plan runs on its **own fresh test event** on the client (QA vendors only, every request through the guarded
   sender). If it fails, it runs again on a **second fresh event**.
5. The verdict is written back to `support_tickets.reproduction_status`:

| Status | Meaning |
|---|---|
| `reproduced` | Failed on both fresh events **at the step the ticket is about**, the plan covers the case in full, and a backend line is cited. **Only this status may go on the bug sheet.** |
| `needs_confirmation` | Failed on both fresh events, but one of these holds: it failed at a different step (kept as `otherFinding` in the evidence, to be checked separately), the plan covers the case only in part, or no backend line is cited yet. A person decides. |
| `not_reproduced` | It passed (the defect did not show), or the run could not tell. The evidence says which. |
| `not_automatable` | No API plan can express it (for example a PDF's layout or a live auction). A person checks it. |
| `not_tried` | Not run yet. |

Useful flags: `--dry` compiles without running. `--ids HS-…` picks cases. `--company 198678` overrides the client.
`--limit N` sets how many to run (default 2). `--recompile` ignores the cached plan.

## 6. Seeing it

- `GET /api/hubspot/summary` returns counts only, by classification, module, feature, reproduction status, how each
  was decided, and what personal data was removed.
- `GET /api/hubspot/tickets?module=&feature=&classification=&status=&dataset=&events=1` returns the stripped records.

## 7. Self-test

```
cd prototype
npm run hubspot:unit                       # 32 offline tests of the stripper, leak check, classifier, case file
npm run hubspot:ingest -- --fixture        # the synthetic JSON + CSV fixtures
npm run cases:import                       # must end with 0 orphans
npm run hubspot:reproduce -- --dry         # plans only
npm run hubspot:reproduce -- --ids HS-900000001-1 --company 198678   # one live run
```
