# Events — the complete test-case catalog

Two catalogs, one journey. Everything a buyer and a vendor do to an event, from the
empty create screen to a signed-off award, written out as test cases a person can
read and an automation can implement.

| File | What is in it | Cases |
|---|---|---|
| [events-ui.md](events-ui.md) | The browser journeys — buyer console, supplier portal, surrogate drawer, awarding grid | 362 |
| [events-api.md](events-api.md) | The same journeys driven straight at the backend, plus the contract and authorization cases the UI can never reach | 286 |

**648 cases.** Not all of them should be automated, and the catalog says which:
every case carries a `P0…P3` priority and an **Automation** verdict of `automate`,
`automate-later` or `manual`.

### Where the cases sit

| UI section | Cases | | API section | Cases |
|---|---|---|---|---|
| 1 Environment and entry | 10 | | 1 Auth and session | 8 |
| 2 Composing the project | 26 | | 2 Draft event group | 20 |
| 3 Templates and the sheet | 20 | | 3 Stage creation per `rfx_mode` | 24 |
| 4 Line items | 18 | | 4 Activation (publish) | 30 |
| 5 Technical (RFP) stage | 18 | | 5 Line items | 14 |
| 6 Auction configuration | 30 | | 6 Audience and participants | 16 |
| 7 Schedule and bid window | 16 | | 7 Vendor technical response | 12 |
| 8 Participants and audience | 18 | | 8 Vendor bid | 38 |
| 9 Savings, terms | 14 | | 9 Surrogate bids | 22 |
| 10 Publish and draft | 24 | | 10 RFQ → Auction | 12 |
| 11 RFQ → Auction conversion | 14 | | 11 Awarding | 22 |
| 12 BOQ events | 12 | | 12 Lifecycle | 14 |
| 13 PR → event | 10 | | 13 Authorization matrix | 18 |
| 14 Classic single-stage | 14 | | 14 Validation and robustness | 18 |
| 15 The vendor's bid | 32 | | 15 Persistence (DB oracles) | 10 |
| 16 Surrogate bidding | 24 | | 16 Non-functional | 8 |
| 17 Awarding | 20 | | | |
| 18 Isolation and permissions | 14 | | | |
| 19 Data validation | 18 | | | |
| 20 Non-functional | 10 | | | |

## Where this comes from

Nothing here is invented. Each case traces to one of:

- **The PRD** — `prototype/knowledge/prd-procol-sourcing.md` (v1.2, approved for UAT).
  Its functional requirements are the acceptance criteria; where the product disagrees
  with it, the disagreement is the finding.
- **The backend contract** — `prototype/knowledge/events/backend-api-contract.md`, mined
  from `procol-backend` with `file:line` citations. Endpoints, params, error codes,
  policies, model enums and callbacks.
- **The create-screen contract** — `prototype/knowledge/events/create-screen-contract.md`
  and the `procol-erfx-create-screen-contract` memory. The step *order* on the eRFX
  create screen is not guessable, and a test that violates it fails in a way that
  looks exactly like a product bug.
- **The two existing frameworks** — `procol test/` (Playwright API) and
  `procol-ui-tests/` (Playwright UI). Cases that already have a home name the flow
  key or spec file; cases that do not are marked `no automation yet`.
- **The product source**, read-only: `procol-client-dashboard` for screen behaviour,
  `procol-backend` for rules and error codes.

## How to read a case

```
#### UI-PUB-006 — Publishing without pressing Save Schedule
- Why it matters.   The one-line reason this case exists. If you cut the case, this is what you stop knowing.
- Setup.            Client config, feature flags, role, and any state the case needs before step 1.
- Steps.            What a person does, in the order they do it.
- Expected.         What the product should do — the acceptance criterion, not a description of the UI.
- Oracle.           What the automation actually asserts. A case with no oracle is a walkthrough, not a test.
- Trace.            P1 · automate · PRD §3.3 · create-screen-contract.md · flow events.rfq_only
```

**Priorities.** `P0` a release cannot ship broken — money, publish, bid integrity,
isolation. `P1` a core path a buyer or vendor uses every day. `P2` a real rule worth
guarding, narrower blast radius. `P3` polish, cosmetics, deep edge cases.

**Gates.** Many cases only exist on some tenants. A case that needs a flag says so in
Setup as `gate: <flag>`. On a tenant where the flag is off, the case is **not a
failure — it is not applicable**, and the automation must report it that way. The two
frameworks already do this through `enabledFor` / `ClientConfig`, and any new case
must plug into the same gating rather than skipping silently.

## The journey these cases cover

```
buyer                                                        vendor
─────                                                        ──────
create draft event group ─┐
  add stages (RFP / RFQ / Auction / conversion)               
  template → line items → sheet                              
  questionnaire + evaluators (RFP)                           
  auction strategy config (rank/price/traffic/knockout/dutch) 
  savings + T&C                                              
  schedule (and press Save Schedule)                         
  invite participants                                        
publish ──────────────────────────────────────────────────►  invitation
  │                                                          login to supplier portal
  │                                                          open the event
  │                                                          answer the technical questionnaire
  │                                                          fill the bid sheet, submit
  │◄──────────────────────────────────────────────────────── bid lands, rank/indicators move
  surrogate bid on a vendor's behalf (buyer never leaves the console)
  │                                                          revise bid inside the window
  bid window closes / extra closing time
  Master QCS → Start Awarding → allocate line items
  Create Proposal → approval workflow → Submit
award
```

Both catalogs walk that spine in that order, though the section numbering differs
because each layer has concerns the other does not. The pairs worth knowing: the
vendor's bid is UI §15 and API §8, surrogate bidding is UI §16 and API §9, awarding is
UI §17 and API §11, and the publish itself is UI §10 and API §4.

## Event types in scope

The backend calls a stage's type `rfx_mode` (`trade_requests.rfx_mode`, enum
`{auction: 0, rfq: 1, rfq_then_auction: 2, offline_trade: 3, rfi: 4, rfp: 5}`), and an
auction carries a *strategy* on top of that. Every combination below has cases:

| Type | How it is reached | Notes |
|---|---|---|
| RFQ (pricing) | eRFX stage, or classic single-stage | Cannot coexist with an Auction stage |
| Technical / RFP | eRFX stage | Needs Vendor Assessment filled + evaluators |
| RFI | API only on this build | Not in `STANDARD_STAGES_SEQUENCE` |
| Auction — Rank | default eRFX stage | The screen's default; `strategy=rank` |
| Auction — Price | eRFX stage config | |
| Auction — Traffic Light | eRFX stage config | rank-range and price-range variants |
| Auction — Knockout | **only** via RFQ→Auction conversion in eRFX | Gated off on the fresh create screen |
| Auction — Dutch | **only** via RFQ→Auction conversion in eRFX | buy and sell price directions differ |
| Auction — Book building | tenant-gated | |
| Basket auction | multi-product single event | forces line-item savings |
| RFQ → Auction | conversion on a published RFQ, not a composition | `PATCH /trade/move_to_auction` |
| RFP + RFQ / RFP + Auction | 2-stage eRFX | RFP bid-end must be ≤ RFQ bid-end |
| BOQ-based eRFX | `boq_based_rfx` + `boq_in_erfx_allowed?` | 500 line-item ceiling |
| PR → event | from a purchase requisition | line items locked, quantity editable |
| Offline trade | tenant-gated | recorded outside the bidding window |

## Standing regression: the event-group 500

`PATCH /api/event_groups/:id` returned a bare `{"status":500,"error":"Internal Server
Error"}` for **both** publish and save-as-draft from ~16:29 on 2026-09-08 — every
eRFX journey, every stage type, with or without vendors, sheet filled or empty
(`prototype/knowledge/events/regression-event-group-update-500.md`). Non-eRFX
single-stage creation kept working throughout, which is why the bid and award flows
could still be built.

Cases **API-PUB-002**, **API-PUB-003** and **UI-PUB-002** are the permanent guards for
it. They assert the *shape* of the response as much as the status: this API answers
failures through `render_error_json` with a `{code, message}`, so an untyped 500 is by
definition an unhandled exception and a defect, whatever caused it.

## Traceability back to the PRD

| PRD requirement | Covered by |
|---|---|
| §3.1 event with line items | UI §4, API §5 |
| §3.2 one or more stages, technical/pricing/auction | UI §2, §5, §6; API §3 |
| §3.3 publish with bid window + audience | UI §7, §8, §10; API §4, §6 |
| §3.4 vendors bid in the window; buyer can bid on their behalf | UI §15, §16; API §8, §9 |
| §3.5 award via proposal and approval workflow | UI §17; API §11 |
| §3.6 every created event is persisted and retrievable | API §15 (DB oracles) |
| §5 data validation on all inputs | UI §19, API §14 |
| §6 edge cases — large events, closed windows, unusual text, duplicates | UI §4, §7, §19; API §14 |
| §7.1 events list under ~3s | UI-ENV-005, UI §20; API §16 |
| §7.2 a vendor never sees another vendor's bid | UI-VBID-025, UI §18; API-BID-030, API-TECH-007, API §13 |
| §7.3 a half-finished draft corrupts nothing | UI-CRE-024, UI §10; API §4, API-DB-010 |

## Running what exists today

```bash
cd "procol test" && npx playwright test          # API catalog, the automated slice
```

```bash
cd procol-ui-tests && npx playwright test        # UI catalog, the automated slice
```

The **Automation** column of each case says whether it is in there yet. `automate-later`
means the case is real and specified but its selector work or seeding is not built;
`manual` means it needs a human eye (visual masking, mail delivery, a 500-vendor
audience) or a state the automation cannot reach without production data.
