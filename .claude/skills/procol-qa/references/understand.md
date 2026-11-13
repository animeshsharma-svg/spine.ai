# 1. Understand the feature and its flows

Goal: before writing or running anything, know what the feature must do, who does it, where it shows, what it
depends on, and which data proves it. Write that down; every later step reads it.

## 1.1 Sources, in order of authority

| Source | Use it for | Never use it for |
|---|---|---|
| **PRD / plan / spec** (docx, pdf, md) | what is right: rules, exact texts (messages, tooltips, notification words, link targets), who may do what, limits, settings and defaults, out-of-scope | — |
| **The case's own Expected Result** | what is right where the PRD is silent | overriding the PRD |
| **The live app** (UAT, PROCOL DEMO 198678 by default) | what happens: screens, labels, requests, saved values | deciding what *should* happen |
| **The platform's product knowledge** | where things are and how they behave: `prototype/knowledge/**` (screens, lessons), `data/screens/` (photographed screens with every control named), `config/featureGates.json` (feature → setting gates), the settings catalogue (company configs, 491 keys), `data/knowledge/events-rules.json` (3,713 rules read from the code), memory | contradicting the PRD |
| **The code** (procol-backend, procol-client-dashboard — READ-ONLY, git show/grep) | *where to look*: which screen, which request, which setting gates it, the exact string the UI renders | setting or softening an expected result |

Why the code is last: the code (and the pull request) is what is being tested. A case written from it copies its
mistakes into the expected result, passes, and the wrong feature ships. When the app does what the code says but not
what the PRD says, that is a **Fail**. A git branch can also differ from what is deployed (PR assignee, 4 Nov: the
branch read `pr_item_ids`, deployed UAT took `pr_item_uuids`) — confirm with a live call before calling anything a bug.

## 1.2 Read the flow

For the feature, write:

- **Actors** — buyer (which role: super admin 3, member; which team category/subcategory/location), approver,
  vendor (QA vendor 1/2), evaluator, planner. Who can do it, who must be refused.
- **Path** — the screens in order, named as the screen names them ("Events → ⋮ → Extend Submission Time"); the
  requests each action fires (watch the network in the live app or read the dashboard source for the call).
- **States** — which event/record states the action exists in (draft, upcoming, live, bid, closed, evaluation,
  proposal, awarded, withdrawn, amended…). Procol hides or greys actions by state; a greyed control must carry a tooltip.
- **Settings** — the company configs that gate it (`featureGates.json`, the backend's `company_configs` reads) and
  their value on the test company. A hidden setting (visibility 0) can only be changed by a Procol employee (error 1103).
- **Data** — the records it needs (PR lines, products and variants, delivery locations, templates, workflows, teams).
- **Exact texts** — every message/label/tooltip the PRD quotes; then confirm the spelling exists in the product
  (`procol-ui-tests/src/plan/generic/sourceLabels.json`, from `scan-dashboard-labels.ts`).
- **Out of scope** and **neighbours** — what the PRD says must keep working (one regression case each).

## 1.3 Probe it live (read-only first)

- Open the screen on PROCOL DEMO with the platform's browser (or the probe step: `probe_controls` clicks every control
  of a screen and records what opened — `data/flow-explore/`).
- Read what was saved with SELECTs (`prototype/src/checks/companySettings.ts` pool pattern; `DATABASE_URL` from
  `procol-ui-tests/.env`). Traps: UAT stores `created_at` 5 h 30 min behind true UTC; `event_group_line_items` has no PR column.
- Read notifications through the recipient's own session only (`GET /notification/menu_items`; they live in DynamoDB,
  not Postgres). Without that person's session the check is **Blocked**, never guessed.

## 1.4 The understanding of one case (what the runner writes before running)

```json
{ "goal": "…", "kind": ["ui","visibility","notification","config","data-integrity","regression","setup"],
  "checks": [{ "n": 1, "what": "one fact true or false on screen / in the reply / in what is saved", "prd": "the PRD's words or null" }],
  "prd": "agrees | differs | silent | none", "difference": "the case expects …, the PRD says …",
  "judgeBy": "what must be true to pass, exact texts in quotes",
  "needs": ["buyer_login","vendor_login","another_buyer_login","email_inbox","phone_sms","outside_system"],
  "blocked": "one sentence, or null" }
```

Split the Expected Result into small checks (one fact each). Decide early: another person's session not granted →
**Blocked**; the company lacks the data/team/setting and it may not be changed → **Not Run**; a mailbox, phone or
outside system → **Not Run**. Say exactly what is missing and how a person could finish it.

## 1.5 Map test data (read-only)

Placeholders map to real records before running:

| Placeholder | Find it with |
|---|---|
| "User with category X only" | `user_company_mappings.trade_identifier` holds X's category token and nothing else that matches |
| "User limited to a subcategory / location" | tokens hold the subcategory (not its parent) / only `bh#<hub>` |
| "Removed member" | every team membership ended, still active in the company |
| "Super admin" / "Process validator" | role 3 / an active team of type 11 |
| "PR with items of two categories" | its `team_identifiers` hold two category roots |
| "Partly used item" | Qty Open < Qty Requested |
| Vendor A / Vendor B | QA vendor 1 / QA vendor 2 of the company (`matrixVendors.qaVendorsFor`) |

Test data written for another company is mapped to this company's own values in
`prototype/config/test-data-map.json` — **only after reading the company's own value** (12 Nov: the sourcing sheet's
"Default Variant" is "Variant 1" on PROCOL DEMO; "Plant Name (LOC-0001)" and "CYLINDER WITH KEY & KNOB" exist as
written). The case text then says which values were mapped and why.

Watch for data traps and report them as observations (DLF has four categories named FOOD STORE; derived sheets reuse
case ids across sheets).
