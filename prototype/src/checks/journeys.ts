import { allCases, type CatalogCase } from "./testCatalog.js";
import { routeFor } from "./caseRouting.js";
import { STEP_CODE } from "./apiAssertions.js";
import type { StepKind } from "./journeyModel.js";

/**
 * The written catalog is arranged BY SECTION, which is how a reader navigates
 * it. A USER JOURNEY is a different cut: the ordered path a persona takes to
 * get one job done, which may draw on several sections. This maps the 648
 * sourcing cases onto seventeen journeys, and the product-workbook (PRD-*)
 * cases onto eleven procure-to-pay journeys after them, computed from the
 * catalog itself — so when a
 * case is added, edited, or re-grouped, its journey follows automatically and
 * nothing here needs touching. That is what "arranged as journeys, and it
 * updates itself" means: the arrangement is derived, never transcribed.
 *
 * Each journey names the vocabulary steps it exercises (its "spine"), so a
 * journey is not just a folder of cases — it is a runnable flow, and the
 * platform can compile and run a whole journey the way it runs one case.
 */
export interface JourneyDef {
  id: string;
  title: string;
  persona: string;
  goal: string;
  /** Narrative order, 1..n. */
  order: number;
  uiGroups: string[];
  apiGroups: string[];
  /** The step-vocabulary spine this journey drives, in order. */
  spine: string[];
}

const JOURNEYS: JourneyDef[] = [
  {
    id: "arrive",
    title: "Arriving at the events area",
    persona: "Buyer",
    goal: "Reach the events list and see the right way to start a new event for this tenant.",
    order: 1,
    uiGroups: ["UI-ENV"],
    apiGroups: ["API-AUTH"],
    spine: ["open_events_list", "expect_events_list", "expect_create_options"],
  },
  {
    id: "compose",
    title: "Composing a sourcing event",
    persona: "Buyer",
    goal: "Create an event: choose the stages, pick a template, and add the line items that will be sourced.",
    order: 2,
    uiGroups: ["UI-CRE", "UI-TPL", "UI-LI"],
    apiGroups: ["API-EG", "API-STG", "API-LI", "API-XCRT", "API-XSTG"],
    spine: ["open_create", "compose_stages", "set_title", "select_template", "add_line_items", "fill_sheet", "expect_line_items", "expect_sheet_columns"],
  },
  {
    id: "technical",
    title: "Running a technical evaluation",
    persona: "Buyer & evaluator",
    goal: "Fill the vendor-assessment questionnaires and assign evaluators on a technical (RFP) stage before it can publish.",
    order: 3,
    uiGroups: ["UI-TECH"],
    apiGroups: ["API-TECH"],
    spine: ["switch_stage", "fill_questionnaires", "assign_evaluator"],
  },
  {
    id: "auction",
    title: "Configuring an auction",
    persona: "Buyer",
    goal: "Set the auction strategy — rank, price, traffic light — and the awarding rule.",
    order: 4,
    uiGroups: ["UI-AUC"],
    apiGroups: [],
    spine: ["configure_single_stage"],
  },
  {
    id: "schedule",
    title: "Scheduling, savings and terms",
    persona: "Buyer",
    goal: "Commit the bidding window and set the savings column and terms & conditions.",
    order: 5,
    uiGroups: ["UI-SCH", "UI-SAV"],
    apiGroups: [],
    spine: ["set_schedule"],
  },
  {
    id: "invite",
    title: "Inviting the audience",
    persona: "Buyer",
    goal: "Put the right vendors on the event before it goes live.",
    order: 6,
    uiGroups: ["UI-PART"],
    apiGroups: ["API-AUD"],
    spine: ["invite_vendor", "open_participants"],
  },
  {
    id: "publish",
    title: "Going live — or saving a draft",
    persona: "Buyer",
    goal: "Publish the event to its audience, or keep it as a draft; and refuse to publish when something is missing.",
    order: 7,
    uiGroups: ["UI-PUB"],
    apiGroups: ["API-PUB", "API-XPUB"],
    spine: ["publish", "save_draft", "expect_published", "expect_publish_blocked", "expect_event_status"],
  },
  {
    id: "vendor-bid",
    title: "The vendor's bid",
    persona: "Vendor",
    goal: "Sign into the supplier portal and submit a priced quote inside the window.",
    order: 8,
    uiGroups: ["UI-VBID", "PRD-KBVDB"],
    apiGroups: ["API-BID", "API-XBID"],
    spine: ["place_bid", "expect_bid_submitted"],
  },
  {
    id: "surrogate",
    title: "Bidding on a vendor's behalf",
    persona: "Buyer",
    goal: "Enter a bid for a vendor from the buyer console (a surrogate bid).",
    order: 9,
    uiGroups: ["UI-SUR"],
    apiGroups: ["API-SUR"],
    spine: ["place_surrogate_bid"],
  },
  {
    id: "award",
    title: "Awarding and negotiating",
    persona: "Buyer & vendor",
    goal: "Compare bids on Master QCS, counter-offer, and award the event to a vendor.",
    order: 10,
    uiGroups: ["UI-AWD"],
    apiGroups: ["API-AWD", "API-XAWD"],
    spine: ["open_master_qcs", "place_counter_offer", "expect_counter_offer_sent", "accept_counter_offer", "award_event", "expect_awarded"],
  },
  {
    id: "convert",
    title: "Converting an RFQ to an auction",
    persona: "Buyer",
    goal: "Turn a published RFQ into an auction, carrying its quotes over as starting bids.",
    order: 11,
    uiGroups: ["UI-CONV"],
    apiGroups: ["API-CONV"],
    spine: ["convert_to_auction"],
  },
  {
    id: "boq",
    title: "BOQ events",
    persona: "Buyer",
    goal: "Create and publish a bill-of-quantities event with its own line-item rules.",
    order: 12,
    uiGroups: ["UI-BOQ"],
    apiGroups: [],
    spine: ["open_create", "add_line_items", "publish"],
  },
  {
    id: "pr",
    title: "From purchase request to event",
    persona: "Buyer",
    goal: "Turn an approved purchase requisition into a sourcing event.",
    order: 13,
    uiGroups: ["UI-PR"],
    apiGroups: [],
    spine: ["open_create", "publish"],
  },
  {
    id: "classic",
    title: "Classic single-stage events",
    persona: "Buyer",
    goal: "Use the non-eRFX single-stage screen, where the event type is chosen in a drawer.",
    order: 14,
    uiGroups: ["UI-SS"],
    apiGroups: [],
    spine: ["open_create", "configure_single_stage", "publish"],
  },
  {
    id: "lifecycle",
    title: "The event's lifecycle",
    persona: "Buyer",
    goal: "Manage an event after publish — extend, close, withdraw — and see it move Live → History.",
    order: 15,
    uiGroups: [],
    apiGroups: ["API-LC"],
    spine: ["close_event", "filter_events", "expect_event_status"],
  },
  {
    id: "permissions",
    title: "Permissions and isolation",
    persona: "Every role",
    goal: "Each role sees and does only what it should; no vendor sees another's bid.",
    order: 16,
    uiGroups: ["UI-PERM"],
    apiGroups: ["API-PERM"],
    spine: ["expect_disabled", "expect_error"],
  },
  {
    id: "robustness",
    title: "Validation and robustness",
    persona: "Buyer & system",
    goal: "The product refuses bad input with the right message, persists correctly, and stays within its performance budget.",
    order: 17,
    uiGroups: ["UI-VAL", "UI-NFR"],
    apiGroups: ["API-VAL", "API-DB", "API-NFR"],
    spine: ["expect_error", "expect_no_error"],
  },

  // ── The procure-to-pay lifecycle, from the product workbook ───────────────
  // The seventeen journeys above cover sourcing events only. These cover the
  // PRD-* groups that `scripts/import-product-knowledge.ts` generates from the
  // "Procol Modules and Features" workbook, one journey per lifecycle stage.
  // Sourcing-module PRD groups get their own journeys rather than joining the
  // ones above, so those keep exactly the cases (and runs) they had.
  //
  // Their spines name the workbook's own steps. They are NOT in the compiler's
  // step vocabulary (procol-ui-tests/src/plan/steps.ts covers sourcing events
  // only), so these journeys are for reading and manual runs until it grows.
  {
    id: "product-admin",
    title: "Setting up the tenant: master data, admin and platform settings",
    persona: "Tenant Admin",
    goal: "Load the master data (users, materials, services, UOM, tax), set up SSO, roles and data visibility, and configure approval matrices, cost centres and reporting.",
    order: 18,
    uiGroups: ["PRD-MDM", "PRD-ADM", "PRD-PLT", "PRD-KBINT"],
    apiGroups: [],
    spine: ["bulk_upload_users", "import_material_and_service_master", "configure_sso", "configure_roles_and_visibility", "configure_approval_matrix", "map_cost_centers"],
  },
  {
    id: "product-vendor",
    title: "Onboarding and managing a vendor",
    persona: "Buyer, vendor & approvers",
    goal: "Invite or import a vendor, let them self-register and submit onboarding with verified documents, route it through onboarding approval, activate it and sync it to SAP — then amend, extend or block it over its life.",
    order: 19,
    uiGroups: ["PRD-VM", "PRD-KBVON"],
    apiGroups: [],
    spine: ["invite_vendor_to_onboard", "vendor_self_register", "submit_onboarding_form", "verify_identity_and_bank", "approve_onboarding", "activate_vendor", "sync_vendor_to_sap"],
  },
  {
    id: "product-demand",
    title: "Raising demand: intake and purchase requisitions",
    persona: "Requester & buyer",
    goal: "Raise demand through intake or ingest released PRs from the ERP, route it for approval with a budget check, and assign, consolidate and move PR lines towards sourcing.",
    order: 20,
    uiGroups: ["PRD-INTK", "PRD-PR", "PRD-KBPR", "PRD-KBPTP"],
    apiGroups: [],
    spine: ["raise_intake_request", "ingest_erp_pr", "budget_check", "approve_pr", "assign_pr_lines", "consolidate_prs", "add_pr_to_rfx"],
  },
  {
    id: "product-sourcing",
    title: "Sourcing events as the product defines them",
    persona: "Buyer, evaluator & vendor",
    goal: "Run a multi-stage sourcing project — technical evaluation, commercial RFQ with counter offers, comparison on Master QCS, and award.",
    order: 21,
    uiGroups: ["PRD-RFX", "PRD-RFP", "PRD-RFQ", "PRD-KBSRC"],
    apiGroups: [],
    spine: ["create_rfx_project", "configure_stages", "invite_vendors", "evaluate_technical", "collect_rfq_bids", "counter_offer", "compare_on_mqcs", "award"],
  },
  {
    id: "product-auction",
    title: "Running a reverse auction",
    persona: "Buyer & vendor",
    goal: "Select qualified vendors into a reverse auction, set its strategy, caps and time controls, run it live and negotiate after it closes.",
    order: 22,
    uiGroups: ["PRD-RA"],
    apiGroups: [],
    spine: ["select_vendors_for_auction", "configure_auction_strategy", "set_price_caps_and_ticks", "run_live_auction", "post_auction_negotiation"],
  },
  {
    id: "product-po",
    title: "Issuing and managing purchase orders",
    persona: "Buyer & vendor",
    goal: "Assemble a PO from the PR, the event and the PO form, get it approved, create it in SAP and send it to the vendor, then manage it after release — amend, hold, short-close, cancel, track consumption.",
    order: 23,
    uiGroups: ["PRD-PO"],
    apiGroups: [],
    spine: ["assemble_po", "approve_po", "create_po_in_sap", "vendor_acknowledges_po", "amend_or_hold_po", "short_close_or_cancel_po"],
  },
  {
    id: "product-contract",
    title: "Contracts",
    persona: "Category manager",
    goal: "Keep executed contracts in one repository, track expiry, amendments, renewals and consumption, and enforce contract prices on POs.",
    order: 24,
    uiGroups: ["PRD-CON"],
    apiGroups: [],
    spine: ["store_contract", "track_expiry", "amend_contract", "renew_contract", "enforce_contract_price_on_po"],
  },
  {
    id: "product-receipt",
    title: "Receiving goods: ASN, GRN and quality check",
    persona: "Vendor, warehouse & quality",
    goal: "The vendor announces a shipment (ASN), the warehouse receives it against the PO (GRN), and quality inspects it — pass, fail or partial accept — including MDCC, FAT and PDI.",
    order: 25,
    uiGroups: ["PRD-ASN", "PRD-GRN", "PRD-QC"],
    apiGroups: [],
    spine: ["create_asn", "link_asn_to_po", "create_grn", "apply_receipt_tolerance", "qc_hold", "inspect_and_decide", "release_or_return"],
  },
  {
    id: "product-invoice",
    title: "Paying the vendor: invoices, credit/debit notes and disputes",
    persona: "AP executive & vendor",
    goal: "Capture a vendor invoice, match it to the PO, GRN and QC (2-, 3- or 4-way), validate tax, and resolve mismatches through credit/debit notes and dispute cases.",
    order: 26,
    uiGroups: ["PRD-INV", "PRD-CDN", "PRD-DIS"],
    apiGroups: [],
    spine: ["capture_invoice", "match_invoice", "validate_tax", "raise_credit_debit_note", "open_dispute", "resolve_dispute"],
  },
  {
    id: "product-governance",
    title: "Budgets and approvals",
    persona: "Finance controller & approvers",
    goal: "Create budgets on the tenant's hierarchy, track consumption and alerts, and govern every critical action through the approval engine — routing, delegation, escalation.",
    order: 27,
    uiGroups: ["PRD-BUD", "PRD-AE"],
    apiGroups: [],
    spine: ["create_budget", "track_budget_consumption", "configure_approval_rules", "route_approval", "delegate_or_escalate", "approve_or_send_back"],
  },
  {
    id: "product-insight",
    title: "Reports, analytics and integrations",
    persona: "Buyer, category manager & admin",
    goal: "Generate award documents (NFA/NTD, letter of award), run sourcing and operational reports and analytics, and move award data to SAP through the integration hub.",
    order: 28,
    // PRD-XC holds reference-sheet rows whose module has no feature sheet; it
    // is empty for the current workbook but claimed so it can never orphan.
    uiGroups: ["PRD-RPT", "PRD-ANL", "PRD-INTG", "PRD-XC"],
    apiGroups: [],
    spine: ["generate_nfa_ntd", "run_reports", "view_analytics", "push_mqcs_to_sap"],
  },
  {
    // From the Notion Knowledge Base's "AI Features" section: the AI assistants
    // cut across intake, PRs, sourcing and awarding, so they read best together.
    id: "product-ai",
    title: "AI assistants across the procure-to-pay flow",
    persona: "Requester, buyer & evaluator",
    goal: "Raise an intake with AI, let the PR collator group requisitions, generate an RFP's technical questions, discover suppliers with Vendor Finder, and pick winners with Smart Awarding — each producing a result a person then reviews.",
    order: 29,
    uiGroups: ["PRD-KBAI"],
    apiGroups: [],
    spine: ["ai_intake", "smart_grouping", "rfp_generator", "vendor_finder", "smart_awarding"],
  },
  {
    // test-cases/api-vendor-bulk.md — generated with the runnable VBU-* cases
    // and their fixtures from procol test/scripts/vendor-bulk/spec.ts.
    id: "vendor-bulk-upload",
    title: "Loading vendors in bulk",
    persona: "Buyer / vendor-management admin",
    goal: "Download the workspace's template, fill it, upload it, and see each row land as a Prospect, a Vendor or a clean per-row error — with duplicates caught against existing vendors and inside the sheet.",
    order: 30,
    uiGroups: [],
    apiGroups: ["API-XVBU"],
    spine: ["download_vendor_template", "fill_vendor_sheet", "upload_vendor_sheet", "wait_for_vendor_job", "read_row_results", "download_error_sheet", "check_prospects_and_vendors"],
  },
  {
    // test-cases/ui-api-crosscheck.md — run by procol-ui-tests/tests/crosscheck.spec.ts,
    // which compares each event screen with the API responses it was built from.
    id: "ui-api-crosscheck",
    title: "What the screen shows versus what the API sent",
    persona: "Buyer (and vendor)",
    goal: "Open an event's screens — list, details, each stage's responses and overview, Master QCS — and confirm every value the backend sent is shown, in the right place, with the same meaning.",
    order: 31,
    uiGroups: ["UI-XCHK"],
    apiGroups: [],
    spine: ["open_events_list", "open_event_details", "open_stage_responses", "open_stage_overview", "open_master_qcs", "compare_with_api"],
  },
  {
    // test-cases/api-template-fields.md — generic form of the per-template field
    // cases generated from the product model (src/model/caseGen.ts), run by
    // `npm run template:check` / GET /api/template-check/run.
    id: "template-fields",
    title: "Choosing a template and checking every field it defines",
    persona: "Buyer (and vendor)",
    goal: "Pick a template the client really has for the kind of round, build a sandbox round from it, and check each column: what cannot be filled is refused, what is entered is checked by the server — or, where only the screen checks it, the gap is recorded.",
    order: 32,
    uiGroups: [],
    apiGroups: ["API-XTPL"],
    spine: ["choose_template", "open_template", "create_draft_event", "add_round_from_template", "fill_buyer_columns", "publish_round", "vendor_fills_line", "vendor_answers_questions"],
  },
];

/**
 * The API journey's generated cases — field assertions (`API-F<CODE>`) and
 * request negatives (`API-N<CODE>`), one group per request step, written by
 * `scripts/build-api-assertions.ts` — belong to the user journey the step is
 * part of. The group names are derived from the step kind rather than listed
 * by hand, so a new step type needs one line here, not a hunt for its codes.
 */
const STEP_JOURNEY: Partial<Record<StepKind, string>> = {
  buyer_login: "arrive",
  create_draft: "compose",
  add_stage_rfp: "compose",
  add_stage_pricing: "compose",
  publish: "publish",
  read_back: "publish",
  vendor_login: "vendor-bid",
  vendor_open_pricing: "vendor-bid",
  bid_create: "vendor-bid",
  bid_products: "vendor-bid",
  bid_submit: "vendor-bid",
  vendor_open_technical: "technical",
  tech_start: "technical",
  tech_answer: "technical",
  tech_submit: "technical",
  evaluator_login: "technical",
  eval_schema: "technical",
  eval_score: "technical",
  eval_submit: "technical",
  surrogate_tech: "surrogate",
  surrogate_rfq: "surrogate",
  counter_offer: "award",
  award_proposal: "award",
  award_lines: "award",
  award_workflow: "award",
  award_submit: "award",
  convert_auction: "convert",
  wait_close: "lifecycle",
  version: "lifecycle",
};
for (const def of JOURNEYS) {
  for (const [kind, jid] of Object.entries(STEP_JOURNEY) as [StepKind, string][]) {
    if (jid === def.id) def.apiGroups.push(`API-F${STEP_CODE[kind]}`, `API-N${STEP_CODE[kind]}`);
  }
}

export interface JourneyCase {
  id: string;
  layer: "ui" | "api";
  group: string;
  section: string;
  sectionNo: number;
  title: string;
  /** The full written detail, so a viewer needs nothing but this object. */
  why: string;
  setup: string;
  steps: string;
  expected: string;
  oracle: string;
  priority: string;
  verdict: string;
  routeKind: string;
  runnable: boolean;
}

export interface Journey extends JourneyDef {
  cases: JourneyCase[];
  counts: { total: number; ui: number; api: number; runnable: number; automate: number };
}

/** Order cases within a journey: UI before API, then P0→P3, then id. */
function order(a: CatalogCase, b: CatalogCase): number {
  if (a.layer !== b.layer) return a.layer === "ui" ? -1 : 1;
  // P0 must sort first: `Number("0") || 9` would turn it into 9 (0 is falsy).
  const rank = (p: string) => {
    const n = Number.parseInt(p.replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? 9 : n;
  };
  const pa = rank(a.priority);
  const pb = rank(b.priority);
  if (pa !== pb) return pa - pb;
  return a.id.localeCompare(b.id);
}

/**
 * Build the journeys from the live catalog. Every case lands in exactly one
 * journey (each group is claimed by one journey); a case whose group is not
 * mapped would surface in `orphans`, which is how a newly-added section
 * announces that it needs placing.
 */
export function buildJourneys(): { journeys: Journey[]; orphans: string[] } {
  const cases = allCases();
  const claimed = new Set<string>();
  const journeys: Journey[] = JOURNEYS.map((def) => {
    const groups = new Set([...def.uiGroups, ...def.apiGroups]);
    const mine = cases.filter((c) => groups.has(c.group)).sort(order);
    mine.forEach((c) => claimed.add(c.id));
    const jcases: JourneyCase[] = mine.map((c) => {
      const r = routeFor(c);
      return {
        id: c.id,
        layer: c.layer,
        group: c.group,
        section: c.section,
        sectionNo: c.sectionNo,
        title: c.title,
        why: c.why,
        setup: c.setup,
        steps: c.steps,
        expected: c.expected,
        oracle: c.oracle,
        priority: c.priority,
        verdict: c.verdict,
        routeKind: r.kind,
        runnable: r.runnable,
      };
    });
    return {
      ...def,
      cases: jcases,
      counts: {
        total: jcases.length,
        ui: jcases.filter((c) => c.layer === "ui").length,
        api: jcases.filter((c) => c.layer === "api").length,
        runnable: jcases.filter((c) => c.runnable).length,
        automate: jcases.filter((c) => c.verdict === "automate").length,
      },
    };
  }).sort((a, b) => a.order - b.order);
  const orphans = cases.filter((c) => !claimed.has(c.id)).map((c) => c.id);
  return { journeys, orphans };
}
