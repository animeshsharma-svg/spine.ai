import { allCases, type CatalogCase } from "./testCatalog.js";
import { routeFor } from "./caseRouting.js";

/**
 * The written catalog is arranged BY SECTION, which is how a reader navigates
 * it. A USER JOURNEY is a different cut: the ordered path a persona takes to
 * get one job done, which may draw on several sections. This maps the 648
 * cases onto seventeen journeys, computed from the catalog itself — so when a
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
    apiGroups: ["API-EG", "API-STG", "API-LI"],
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
    apiGroups: ["API-PUB"],
    spine: ["publish", "save_draft", "expect_published", "expect_publish_blocked", "expect_event_status"],
  },
  {
    id: "vendor-bid",
    title: "The vendor's bid",
    persona: "Vendor",
    goal: "Sign into the supplier portal and submit a priced quote inside the window.",
    order: 8,
    uiGroups: ["UI-VBID"],
    apiGroups: ["API-BID"],
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
    apiGroups: ["API-AWD"],
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
];

export interface JourneyCase {
  id: string;
  layer: "ui" | "api";
  title: string;
  priority: string;
  verdict: string;
  section: string;
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
  const pa = Number(a.priority.replace(/\D/g, "")) || 9;
  const pb = Number(b.priority.replace(/\D/g, "")) || 9;
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
        title: c.title,
        priority: c.priority,
        verdict: c.verdict,
        section: c.section,
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
