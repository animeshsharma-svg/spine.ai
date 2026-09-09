# Config → Flow Catalog

The blueprint for the config-driven flow system. Every flag from
`GET /v1/dashboard_configuration` that gates a real feature is mapped to a
`UiFlowModule`, its `enabledFor` gate, the user action, and the assertion.
Derived from the live clientA config + source cross-reference of
`procol-client-dashboard/src` (selector + component cited per flag).

**Status legend:** ✅ built+green · 🟡 built, gated/needs-bid · ⬜ planned ·
🔒 disabled for clientA (skip-gated — runs where flag is ON).

**Dependency legend:** `create` = needs a freshly created event · `bid` = needs a
live submitted bid (seed via API framework `../procol test`) · `data` = needs
existing PR/vendor/etc (present on clientA) · `nav` = pure navigate + assert.

---

## CLUSTER 1 — Event lifecycle + awarding

| Flow key | Flag (clientA) | Gates (source) | Action / assertion | Dep | Status |
|---|---|---|---|---|---|
| `event.draft_create` | `allow_draft_project_creation` ✓ | "Save as draft" action (`useProjectCreationViewModel`) | create event → Save as draft → verify no error | create | ✅ |
| `event.scheduled` | `scheduled_events_enabled` ✓ | schedule future start (`projectTable.jsx`) | create → set future schedule → publish | create | ⬜ |
| `event.withdraw` | `is_user_allowed_to_withdraw_project` ✓ | Withdraw btn in event header (`useEventHeaderViewModel`) | create+publish → open EVENT (not project) detail → Withdraw → verify. NOTE: `/project/<id>/details` is the project container; withdraw is on the event/order level — navigate into the event first | create | ⬜ |
| `display.draft_tab` | `show_draft_tab` ✓ | Draft tab on orders list (`projectTable.jsx`) | nav /orders → assert Draft tab visible | nav | ✅ |
| `event.surrogate_edit_bid` | `can_buyer_edit_bid` ✓ | buyer edits vendor bid (`configSidebar.jsx`) | on event w/ bid → edit bid | bid | 🟡 |
| `award.sheet_awarding` | `allow_sheet_awarding` ✓ | sheet-award mode in QCS (`useAwardingQcsViewModel`) | on event w/ bids → award via sheet | bid | 🟡 |
| `award.select_all_items` | `enable_select_all_items_for_awarding` ✓ | select-all in award grid (`comparisonHeaderFormatter`) | comparison grid → select-all → award | bid | 🟡 |
| `event.best_price_default` | `show_best_price_by_default_in_english_auction` ✓ | best-price default in EA (`useAuctionIndicatorsViewModel`) | live auction w/ bids → assert best-price shown | bid | 🟡 |
| `event.counter_offer` | `hide_counter_offer_rfq` = false | counter-offer column in RFQ comparison (`comparisonHeaderFormatter`) | comparison → assert counter-offer col present + send | bid | 🟡 |
| `event.lock_vendors` | `lock_vendors_addition_in_event_creation` = false 🔒 | participant-add locked (`useParticipantsSelectionViewModel`) | assert vendor-add disabled | create | 🔒 |
| `event.group_service_activities` | `group_service_activities_in_rfp` = false 🔒 | service grouping in RFP (`useMasterQcsViewModel`) | assert grouped layout | create | 🔒 |

## CLUSTER 2 — PR / Intake

| Flow key | Flag | Gates | Action | Dep | Status |
|---|---|---|---|---|---|
| `pr.create` | `pr` module ✓ | PR creation | create a PR | data | ⬜ |
| `pr.to_event` | `pr`+`trade` ✓ | PR→event | convert PR to event | data | ⬜ |
| `pr.list` | `pr` module ✓ | PR list + status tabs | nav → assert Open tab + PR rows | nav | ✅ |
| `pr.reorder_available` | `is_pr_reordering_enabled` ✓ | reorder PR lines | nav → assert Reorder control | nav | ✅ |
| `pr.delete` | `is_pr_deletion_enabled` ✓ | Delete PR (`prDetails.jsx`) | open PR → Delete → verify gone | data | ⬜ |
| `pr.reject` | `is_pr_reject_enabled` ✓ | Reject & Send Back (`prDetails.jsx`) | open PR → Reject | data | ⬜ |
| `pr.collation` | `is_pr_collation_enabled` ✓ | PR split+collation (`purchaseRequisitions.jsx`) | combine multiple PRs | data | ⬜ |
| `pr.offline_closure` | `offline_pr_closure_enabled` ✓ | offline close PR line (`prLineAssignment.jsx`) | close a PR line offline | data | ⬜ |
| `intake.to_pr` | `intake` module ✓ | intake→PR | create intake → convert to PR | data | ⬜ |
| `pr.bulk_upload` | `enable_pr_bulk_upload` = false 🔒 | bulk PR upload screen (`bulkPrUpload.jsx`) | nav → assert Bulk Upload entry | nav | 🔒 (skips ✓) |
| `pr.hold` | `is_pr_hold_enabled` = false 🔒 | Hold/Unhold PR (`prDetails.jsx`) | Hold a PR | data | 🔒 |
| `pr.restore` | `is_pr_restore_enabled` = false 🔒 | Restore PR (`prDetails.jsx`) | restore deleted PR | data | 🔒 |
| `pr.multi_select` | `can_select_multiple_prs` = false 🔒 | multi-select checkboxes | bulk select PRs | data | 🔒 |

## CLUSTER 3 — Approvals

| Flow key | Flag | Gates | Action | Dep | Status |
|---|---|---|---|---|---|
| `approval.dynamic_flow_create` | `dynamic_approval_flow_creation_allowed` ✓ | condition editor (`conditionEditor.jsx`) | create a dynamic approval flow | data | ⬜ |
| `approval.company_workflow` | `company_level_approval_workflows_allowed` ✓ | company workflows (`allApprovals.jsx`) | nav /approvals → assert All Approvals tab | nav | ✅ |
| `approval.user_approvals` | `has_user_approvals` ✓ | approvals workspace | nav /approvals → assert Pending on me tab | nav | ✅ |
| `approval.flexi_views` | `flexi_views_for_approvals` ✓ | flexi view (`approvalRequestsWrapper.jsx`) | nav approvals → assert flexi layout | nav | ⬜ |
| `approval.selection_at_award` | `approval_selection_enabled` = false 🔒 | flow pick in Select Bid drawer | award → pick approval flow | bid | 🔒 |
| `approval.edit_approver` | `is_editing_approver_allowed` = false 🔒 | edit approver (`manageApprovalWorkflow.jsx`) | edit approver mid-flow | data | 🔒 |
| `approval.peer_review` | `peer_review_enabled` = false 🔒 | peer-review step | assert peer-review step | data | 🔒 |

## CLUSTER 4 — Vendor / master data

| Flow key | Flag | Gates | Action | Dep | Status |
|---|---|---|---|---|---|
| `vendor.management` | `allow_update_vendor`/`can_skip_vendor_onboarding` ✓ | vendor workspace | nav /vendors → assert Invite Vendor + tabs | nav | ✅ |
| `vendor.update` | `allow_update_vendor` ✓ | Update btn (`vendorHeader.jsx`) | open vendor → edit → save | data | ⬜ |
| `vendor.invite_skip_onboarding` | `can_skip_vendor_onboarding` ✓ | skip-onboarding (`inviteNewVendorDrawer.jsx`) | invite vendor, skip onboarding | data | ⬜ |
| `vendor.invite_new_flow` | `new_vendor_invite_flow` ✓ | revamped invite (`vendorList.jsx`) | invite via new flow | data | ⬜ |
| `masterdata.add_uom` | `allow_user_to_add_uom` ✓ | add-unit in unit picker (`unitPicker.jsx`) | add a new UOM inline | data | ⬜ |
| `user.erp_id` | `erp_id_enabled` ✓ | ERP ID field (`createUserDrawer.jsx`) | create user w/ ERP ID | data | ⬜ |
| `vendor.blacklist` | `is_vendor_blacklisting_allowed` = false 🔒 | Blacklist (`vendorHeader.jsx`) | blacklist a vendor | data | 🔒 |
| `vendor.delete` | `restrict_vendor_deletion` = false | Delete vendor (shown when NOT restricted) | delete a vendor | data | ⬜ |
| `vendor.manual_create` | `disable_manual_vendor_creation` = false | manual add vendor allowed | create vendor manually | data | ⬜ |
| `product.material_codification` | `is_material_codification_enabled` = false 🔒 | codification fields (`productFormV2.jsx`) | create product w/ codification | data | 🔒 |
| `contract.create` | `is_contract_creation_enabled` = false 🔒 | contract in QCS (`useAwardingQcsViewModel`) | create a contract | bid | 🔒 |
| `po.erp_contracts` | `erp_contracts_enabled` = false 🔒 | ERP contracts (`purchaseOrderWrapper.jsx`) | assert ERP contracts | nav | 🔒 |
| `po.update_status` | `can_update_po` = false 🔒 | PO status update (`controls.jsx`) | update PO status | data | 🔒 |
| `po.configurations` | `is_po_configurations_allowed` ✓ | PO config screen (`purchaseOrderWrapper.jsx`) | nav → assert PO config | nav | ⬜ |

## Display / assertion toggles (lightweight `nav`+assert flows)

| Flow key | Flag | Assert when ON |
|---|---|---|
| `display.communication_module` | `show_communication_module` ✓ | communication drawer/entry visible |
| `display.nfa_summary_report` | `show_nfa_summary_report` ✓ | NFA-summary option in report drawer |
| `display.project_cards` | `show_project_cards` ✓ | project cards view on orders |
| `display.reference_id` | `show_reference_id` ✓ | reference-id column shown |
| `display.transactional_report` | `transactional_report_enabled` ✓ | transactional report available |

## Backend-only flags (no FE gate — do NOT make UI flows)

`restrict_event_visibility_to_owner`, `show_line_lot_evaluation`,
`vendor_code_mandatory_on_vendor_create`, `show_vendor_onboarding_report`,
`transactional_report_enabled` (report presence is BE-driven). Gate API flows on
these instead.

## Bid (keystone) — ✅ GREEN

| Flow key | Flag/module | What it does | Status |
|---|---|---|---|
| `bid.submit` | `trade` + vendor portal configured | buyer creates+publishes RFQ inviting a vendor → vendor logs into `quotes.ag-ri.in` (email OTP) → opens event → stage tab → fills Price in the ARIA-grid Submission Sheet → **Submit Quote** → "Submitted" badge | ✅ |

Pure-UI, two browser contexts (`src/flows/bid.ts` + `src/pages/VendorPortalPage.ts`).
This unlocks the bid-dependent buyer flows below (award / edit-bid / counter-offer
/ best-price) — they chain onto a submitted bid. Awarding additionally needs the
stage CLOSED (short window + wait, or an "end event now" action) — next to build.

## How this powers the orchestration layer

The orchestrator (future) reads a client's config, then for each catalog row
evaluates `enabledFor(config)`: ✓ → runnable, 🔒 → skipped-with-reason. It never
needs UI knowledge — the catalog + capability map ARE its world model. When devs
ship a new feature behind a new flag, add one catalog row + one gated flow.
