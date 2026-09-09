/**
 * THE FEATURE TREE — the platform's single organising spine.
 *
 * Structured to match Procol's OWN product documentation (the KT-session
 * "Complete Process & Feature Documentation"), so the names here are the names
 * the business uses. Each leaf is a toggle: tick it and its test cases run.
 *
 * Coverage is shown honestly. A feature with 0 cases is still listed — that is
 * the point: the tree doubles as a coverage map of the whole product, so you can
 * see what is tested and what is not, instead of only seeing what we happen to
 * have built.
 *
 * `flowId`      — the registry flow that runs this feature end-to-end, if any.
 * `portal`      — buyer-side or vendor-side (the doc's two portals).
 * `requiresConfig` — per-company flag that must be ON for the feature to exist.
 */

export interface FeatureNode {
  id: string;
  label: string;
  what: string;
  flowId?: string;
  requiresConfig?: string;
  /** The browser journey that covers this feature, when one exists. */
  uiFlow?: string;
  portal?: "buyer" | "vendor" | "both";
  defaultOn?: boolean;
}

export interface FeatureGroup {
  id: string;
  label: string;
  icon: string;
  what: string;
  children: FeatureNode[];
}

export const FEATURE_TREE: FeatureGroup[] = [
  {
    id: "intake",
    label: "Intake",
    icon: "📝",
    what: "Capturing the business requirement before it becomes a purchase request.",
    children: [
      { id: "intake.create", label: "Create intake", what: "Requirement, quantity, specs, budget, delivery timeline." },
      { id: "intake.attachments", label: "Attachments", what: "Drawings and spec sheets on the requirement." },
      { id: "intake.approval", label: "Intake approval", what: "Multi-level approval (2 by default, configurable per company)." },
      { id: "intake.to_pr", label: "Intake → PR", what: "Approved intake auto-creates the purchase request." },
    ],
  },
  {
    id: "pr",
    label: "Purchase requests",
    icon: "🧾",
    what: "The formal internal demand document. Events can only start from an approved PR.",
    children: [
      { id: "pr.list", uiFlow: "pr.list", label: "PR list & filters", what: "Listing, paging and ageing filters.", defaultOn: true },
      { id: "pr.read", label: "Read one PR", what: "Fetching a single purchase request." },
      { id: "pr.line_items", label: "Line-item management", what: "Each intake line is its own row under one PR number." },
      { id: "pr.partial_selection", label: "Partial selection into an event", what: "Take 5 of 10 items; the rest stay Open." },
      { id: "pr.status", label: "PR statuses", what: "Open → In Progress → Completed transitions." },
      { id: "pr.to_event", label: "PR → Event", what: "Converting PR lines into a sourcing event.", flowId: "entrypath.pr_to_event" },
      { id: "pr.partial_closure", uiFlow: "pr.bulk_upload", label: "Partial closure", what: "Closing part of a PR (the 861/823/528 rules).", requiresConfig: "is_pr_partial_closure_enabled" },
    ],
  },
  {
    id: "events",
    label: "Sourcing events (RFx)",
    icon: "📋",
    what: "The five event types and how they're configured. The heart of Procol.",
    children: [
      { id: "events.rfp_only", uiFlow: "events.rfp_only", label: "Technical / RFP only", what: "Technical evaluation before any pricing.", flowId: "events.rfp_only", defaultOn: true, requiresConfig: "rfx_project_enabled" },
      { id: "events.rfq_only", uiFlow: "events.rfq_only", label: "RFQ only", what: "Commercial stage — price, taxes, delivery terms.", flowId: "events.rfq_only", requiresConfig: "rfx_project_enabled" },
      { id: "events.rfp_rfq", uiFlow: "events.rfp_rfq", label: "Technical + RFQ", what: "Two-stage: technical then commercial.", flowId: "events.rfp_rfq", defaultOn: true, requiresConfig: "rfx_project_enabled" },
      { id: "events.rfp_auction", uiFlow: "events.rfp_auction", label: "Technical + Auction", what: "Technical stage then a live auction.", flowId: "events.rfp_auction", requiresConfig: "rfx_project_enabled" },
      { id: "events.type_rules", label: "Event-type rules", what: "RFQ and Auction cannot be chosen together as one event." },
      { id: "events.line_items", uiFlow: "events.multi_product", label: "Line items", what: "Product, quantity and UOM validation on the event.", defaultOn: true },
      { id: "events.config", label: "Event configuration", what: "Template, specs, evaluator, submission & evaluation windows." },
      { id: "events.awarding_rule", uiFlow: "events.award_lot_wise", label: "Awarding rule", what: "Full lot to one vendor vs split across vendors." },
      { id: "events.invite_vendors", label: "Invite vendors", what: "Suggestions by category/product, plus manual invites." },
      { id: "events.publish", label: "Publish event", what: "Draft goes live to the invited vendors." },
      { id: "events.extend_deadline", label: "Extend submission deadline", what: "Buyer reopens the vendor response window." },
      { id: "events.lifecycle", uiFlow: "event.draft_create", label: "Status lifecycle", what: "Draft → Live → History. Withdrawn drafts are gone for good." },
    ],
  },
  {
    id: "auction",
    label: "Auctions",
    icon: "⚡",
    what: "Reverse auctions — five strategies, each with different rules about what vendors can see.",
    children: [
      { id: "auction.rank", uiFlow: "events.auction_rank", label: "Rank based", what: "Vendor sees only their own rank (Gold/Silver/Bronze).", flowId: "events.auction_rank" },
      { id: "auction.price", uiFlow: "events.auction_price", label: "Price based", what: "Vendor sees the lowest price but not ranks.", flowId: "events.auction_price" },
      { id: "auction.traffic_light", uiFlow: "events.auction_traffic_light", label: "Traffic light", what: "Vendors banded Red/Yellow/Green by buyer-set limits." },
      { id: "auction.knockout", label: "Knockout", what: "Descending price levels; vendors who don't accept are eliminated." },
      { id: "auction.dutch", label: "Dutch", what: "Price RISES over time — inverted vs every other auction here." },
      { id: "auction.convert", uiFlow: "events.rfq_auction", label: "Convert RFQ → Auction", what: "RFQ quotes carry over as the starting bids.", flowId: "events.convert_to_auction" },
      { id: "auction.visibility", label: "Rank / price visibility", what: "The fairness contract — no vendor may see another's price." },
      { id: "auction.dynamic_extension", label: "Dynamic extension", what: "Auto-extends near close to stop last-second sniping." },
      { id: "auction.serial_bidding", label: "Serial bidding", what: "Multi-item auctions bid line by line." },
      { id: "auction.increments", label: "Minimum bid increments", what: "Smallest allowed price revision." },
    ],
  },
  {
    id: "bids",
    label: "Bidding",
    icon: "💰",
    what: "Vendors quoting, and the buyer quoting on their behalf.",
    children: [
      { id: "bids.place", uiFlow: "bid.submit", label: "Place a bid", what: "Submitting a priced bid.", defaultOn: true },
      { id: "bids.submit", label: "Submit / revise a bid", what: "Finalising or revising a placed bid." },
      { id: "bids.surrogate", label: "Surrogate bid", what: "Buyer bids for a vendor who can't — needs an audit trail." },
      { id: "bids.price_cap", label: "Price cap", what: "Per-vendor ceiling; a higher price cannot be entered." },
      { id: "bids.quick_fill", label: "Quick fill", what: "Auto-fills a vendor response from their standard offering.", portal: "vendor" },
      { id: "bids.participation", label: "Participate / decline", what: "Vendor accepts or skips an invitation.", portal: "vendor" },
    ],
  },
  {
    id: "evaluation",
    label: "Evaluation & comparison",
    icon: "📊",
    what: "Scoring technical responses and comparing quotes side by side.",
    children: [
      { id: "evaluation.score", label: "Technical evaluation", what: "Accept / Not Fit, ranks T1-T3, remarks.", defaultOn: true },
      { id: "evaluation.tna", label: "TNA (technically not acceptable)", what: "Sent to regret — cannot be awarded." },
      { id: "evaluation.granularity", label: "Line-item vs vendor level", what: "Evaluating per line item as well as per vendor." },
      { id: "evaluation.qcs", label: "QCS / MQCS", what: "Quote comparison sheet — L1/L2 price ranks vs T1/T2 technical." },
    ],
  },
  {
    id: "negotiation",
    label: "Negotiation",
    icon: "🤝",
    what: "Counter offers between buyer and vendor.",
    children: [
      { id: "negotiation.counter_offer", label: "Counter offer", what: "Buyer proposes a revised price." },
      { id: "negotiation.vendor_response", label: "Accept / reject / revise", what: "Vendor answers, or lowers their own quote instead." },
    ],
  },
  {
    id: "award",
    label: "Awarding",
    icon: "🏆",
    what: "Choosing winners and getting the award approved.",
    children: [
      { id: "award.proposal", label: "Create award proposal", what: "Opening the award.", flowId: "events.surrogate_award", defaultOn: true },
      { id: "award.add_response", label: "Add award lines", what: "Assigning quantities to winning vendors." },
      { id: "award.partial", label: "Partial awarding", what: "Splitting quantity across vendors (561/557/558 rules)." },
      { id: "award.submit", label: "Submit for approval", what: "Sending the award to the approver." },
      { id: "award.approval", label: "Approve / send back / reject", what: "Approver decision, with comments." },
      { id: "award.re_evaluation", label: "Re-evaluation", what: "Rejected award sent back for another look." },
    ],
  },
  {
    id: "po",
    label: "Purchase orders",
    icon: "📄",
    what: "Turning an award into a live order the vendor accepts.",
    children: [
      { id: "po.generate", label: "Generate PO", what: "From an awarded event, or manually in P2P." },
      { id: "po.contents", label: "PO contents & linkage", what: "Lines, price, quantity, terms; shows PR & event linkage." },
      { id: "po.release", label: "Submit → Release → Acknowledge", what: "The PO status chain." },
      { id: "po.vendor_accept", label: "Vendor accepts PO", what: "Vendor confirms price, quantity, dates, terms.", portal: "vendor" },
    ],
  },
  {
    id: "p2p",
    label: "Delivery & receiving (P2P)",
    icon: "🚚",
    what: "Everything after the order: shipment, receipt and quality.",
    children: [
      { id: "p2p.proforma", label: "Proforma invoice", what: "Estimated costs before delivery; vendor approves." },
      { id: "p2p.asn", label: "ASN (advance shipment note)", what: "Vendor declares what is being shipped.", portal: "vendor" },
      { id: "p2p.delivery", label: "Delivery tracking", what: "Dispatch details and delays." },
      { id: "p2p.invoice", label: "Invoice", what: "Actual costs; vendor may revise upward (GST, freight)." },
      { id: "p2p.grn", label: "GRN / SRN", what: "What actually arrived vs ordered vs shipped." },
      { id: "p2p.qan", label: "QAN (quality note)", what: "Good vs defective quantity after inspection." },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: "🏦",
    what: "Matching the paperwork and paying the vendor.",
    children: [
      { id: "finance.three_way", label: "3-way match", what: "PO vs invoice vs GRN — must match exactly." },
      { id: "finance.bill", label: "Bill creation", what: "Only on a clean match; the bill triggers payment." },
      { id: "finance.payment", label: "Payment", what: "On invoice (advance) or on delivery." },
      { id: "finance.cn_dn", label: "Credit / debit notes", what: "Short or over delivery adjustments." },
    ],
  },
  {
    id: "erfx",
    label: "ERFX projects",
    icon: "🗺",
    what: "Project-based sourcing with a custom stage builder.",
    children: [
      { id: "erfx.create", label: "Create ERFX project", what: "Started from PR lines via Start Purchasing." },
      { id: "erfx.stages", label: "Stage builder", what: "Add, remove, time and reorder stages." },
      { id: "erfx.terms", label: "Terms & conditions stage", what: "Payment terms, delivery, quality, penalties, SLA." },
      { id: "erfx.schedule", label: "Schedule or publish now", what: "RFQ stage can be scheduled; publishing emails vendors." },
    ],
  },
  {
    id: "eventfeatures",
    label: "Event add-ons",
    icon: "🧩",
    what: "Features that sit on top of any event.",
    children: [
      { id: "events.versioning", label: "Versioning", what: "1.0 → 1.1 → 1.2 — which bid is authoritative.", flowId: "events.versioning" },
      { id: "events.boq", label: "BOQ (bill of quantities)", what: "Excel upload for large multi-line orders (limit from allowed_maximum_line_items.boq).", flowId: "events.boq", requiresConfig: "boq_in_erfx_allowed" },
      { id: "events.templates", label: "Templates", what: "Reusable intake/PR/event templates, incl. Excel." },
      { id: "events.terms", label: "Terms & conditions", what: "Set per stage and/or for the whole event." },
    ],
  },
  {
    id: "masterdata",
    label: "Master data",
    icon: "🗂",
    what: "The catalog everything else is built from.",
    children: [
      { id: "masterdata.category", label: "Categories", what: "Top-level product categories.", flowId: "masterdata.category", defaultOn: true },
      { id: "masterdata.subcategory", label: "Sub-categories", what: "Families nested under a parent category." },
      { id: "masterdata.product", uiFlow: "masterdata.product", label: "Products", what: "Products and their variants.", flowId: "masterdata.product", defaultOn: true },
      { id: "masterdata.location", uiFlow: "masterdata.location", label: "Locations", what: "Delivery and warehouse sites.", flowId: "masterdata.location" },
      { id: "masterdata.bulk_upload", label: "Bulk upload", what: "Spreadsheet upload for products, locations, vendors." },
    ],
  },
  {
    id: "users",
    label: "Users, roles & teams",
    icon: "👥",
    what: "Who exists, and what each role may do.",
    children: [
      { id: "users.create", uiFlow: "masterdata.user", label: "Create user", what: "Name, email, phone, role validation.", flowId: "masterdata.user_permissions", defaultOn: true },
      { id: "masterdata.team", uiFlow: "masterdata.team", label: "Teams", what: "Planner, Purchase, Quality Check, Vendor Mgmt, Process Validator.", flowId: "masterdata.team" },
      { id: "users.team_member", label: "Team membership", what: "Adding a user to a team with a role." },
      { id: "users.permissions", label: "Role permissions", what: "Member / Manager / Admin / Super Admin — allowed vs 422." },
      { id: "users.delegate", label: "Delegate approval", what: "Time-bounded stand-in approvers." },
    ],
  },
  {
    id: "vendors",
    label: "Vendors",
    icon: "🏭",
    what: "Supplier records, onboarding and mappings.",
    children: [
      { id: "vendors.discovery", uiFlow: "vendor.management", label: "Vendor discovery", what: "Listing and searching the client's vendors.", flowId: "vendor.discovery", defaultOn: true },
      { id: "vendors.invite", label: "Invite a vendor", what: "Admin/buyer invites a prospective supplier." },
      { id: "vendors.onboarding", uiFlow: "vendor.onboarding_available", label: "Onboarding lifecycle", what: "Prospects → In progress → Vendors / Rejected." },
      { id: "vendors.pq", label: "PQ vs non-PQ", what: "Pre-qualified suppliers vs unvetted ones." },
      {
        id: "vendors.entity_mapping",
        label: "Vendor ↔ entity mapping",
        what: "One vendor mapped to several legal entities.",
        requiresConfig: "is_vendor_entity_mapping_enabled",
      },
    ],
  },
  {
    id: "platform",
    label: "Platform & config",
    icon: "⚙️",
    what: "Cross-cutting behaviour that changes per company.",
    children: [
      { id: "platform.configurations", label: "Configurations", what: "Per-company flags that switch features on and off." },
      { id: "platform.approvals", label: "Approval chains", what: "Multi-level approvals on intake, PR, award and PO." },
      { id: "platform.erp", label: "ERP integration", what: "PR pushed in from ERP; PO pushed back out." },
      { id: "platform.audit", label: "Audit trail", what: "Approvals, award logic and documents must stay reviewable." },
    ],
  },
];

export const FEATURES: FeatureNode[] = FEATURE_TREE.flatMap((g) => g.children);

export function findFeature(id: string): FeatureNode | undefined {
  return FEATURES.find((f) => f.id === id);
}

export function defaultSelection(): string[] {
  return FEATURES.filter((f) => f.defaultOn).map((f) => f.id);
}
