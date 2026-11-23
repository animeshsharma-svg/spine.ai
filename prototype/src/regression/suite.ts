/**
 * THE REGRESSION SUITE — every test case the platform holds, as one suite anyone can read.
 *
 * Three stores feed it: the written catalog (data/test-cases.json: the events UI/API cases, the product
 * sheet, the knowledge-base walkthroughs, the evidence checks), the team's 13-column sheets (data/sheet-cases.json:
 * the sourcing sheet, the explored flows, every guided session's and derivation's cases) and the API case
 * library (data/api-cases.json). Each case is given:
 *
 *   module    one of the feature tree's groups, in the order a buyer walks the product (Intake → … → PO, then the
 *             set-up groups), so the suite reads as the journey;
 *   feature   the tree node under that module it exercises;
 *   stage     where on the flow it sits — Draft, Publish, Bid, Evaluate, Award, PO (or none for set-up work);
 *   state     the event it starts from (the start states the runner builds by API: a live RFQ, two bids, closed…);
 *   needs     the set-up node for that state. The set-up nodes form the chain Draft → Live → Bid → Closed →
 *             Proposal → Awarded …, so ticking a case pulls in exactly what it rests on and nothing beside it;
 *   plain     its title, steps, expected result and pre-conditions in the house style: no endpoints, no code words;
 *   runnable  what a run can do with it today: now / partly / compiles at run time / needs a step / later /
 *             manual / a specification for a feature not in the product yet.
 *
 * The display rows are plain; a RUN row keeps the exact request of an API case (the compiler needs it).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_TREE } from "../../config/featureTree.js";
import { allCases, type CatalogCase } from "../checks/testCatalog.js";
import { sheetCases, sheetPrep, stateFromWords, type SheetCase } from "../checks/sheetCases.js";
import { loadCases as apiLibrary, type TestCaseRecord } from "../checks/caseLibrary.js";
import { storedTextPlan } from "../checks/compiledUiText.js";
import { routeFor } from "../checks/caseRouting.js";
import type { UiState } from "../ui/uiSetup.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
const SUITE_FILE = join(DATA, "regression", "suite.json");

export type Runnable = "now" | "partly" | "compile" | "needs-step" | "later" | "manual" | "spec";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type Kind = "Positive" | "Negative" | "Edge";
export const STAGES = ["Draft", "Publish", "Bid", "Evaluate", "Award", "PO"] as const;

export interface SuiteCase {
  /** unique in the suite: the id, or id@sheet when another sheet reuses the id (every session numbers from GEN-001) */
  key: string;
  id: string;
  source: "sheet" | "catalog" | "api";
  /** the sheet it came from (sheet cases) or the catalog group */
  from: string;
  module: string;
  feature: string;
  /** index into STAGES, or -1 for set-up and admin work with no event */
  stage: number;
  layer: "ui" | "api";
  priority: Priority;
  kind: Kind;
  title: string;
  state: UiState | null;
  /** the set-up node this case rests on (SETUP:<state>), or null when it starts from nothing */
  needs: string | null;
  /** a case cut into one part per stage of the flow: the part before this one (its key), and which part this is */
  prev?: string;
  part?: { n: number; of: number; what: string };
  runnable: Runnable;
  role: string;
  preconditions: string;
  configs: string;
  testData: string;
  steps: string[];
  expected: string;
  why: string;
}

export interface SetupNode {
  id: string;
  state: UiState;
  label: string;
  stage: number;
  needs: string | null;
  /** the sheet's own set-up case that builds this state through the screens, when there is one */
  caseId?: string;
  /** how many cases rest on it directly */
  count: number;
}

export interface SuiteModule { id: string; label: string; step: number | null; what: string; features: Array<{ id: string; label: string; what: string; count: number }>; count: number }

export interface Suite {
  builtAt: string;
  modules: SuiteModule[];
  setup: SetupNode[];
  cases: SuiteCase[];
  counts: { total: number; ui: number; api: number; split: number; bySource: Record<string, number>; byRunnable: Record<string, number>; byStage: Record<string, number>; byPriority: Record<string, number> };
}

// ── the set-up chain ─────────────────────────────────────────────────────────
/** each start state, the one it is built from, where it sits on the flow, and its plain label */
const CHAIN: Array<[UiState, UiState | null, number, string]> = [
  ["draft", null, 0, "A draft event, saved and not published"],
  ["upcoming", "draft", 0, "An upcoming event whose bidding starts later"],
  ["pr_rfq", null, 0, "An event made from an open purchase request line"],
  ["live", "draft", 1, "A live event with the QA vendors invited and no bid yet"],
  ["two_invited", "live", 1, "A live event with two QA vendors invited"],
  ["uninvited", "live", 1, "A live event and a vendor that was not invited to it"],
  ["masked", "live", 1, "A live event with bid masking switched on"],
  ["withdrawn", "live", 1, "A published event withdrawn by the buyer"],
  ["converted", "live", 1, "An RFQ converted into a live auction"],
  ["dutch", "live", 1, "A live Dutch auction"],
  ["knockout", "live", 1, "A live knockout auction"],
  ["forward", "live", 1, "A live forward auction (the price climbs)"],
  ["bid", "live", 2, "A live event where Vendor A has quoted"],
  ["two_bids", "bid", 2, "A live event where Vendor A quoted 100 and Vendor B quoted 90"],
  ["closed", "bid", 3, "A closed event (bidding over) with one bid"],
  ["closed_two_bids", "two_bids", 3, "A closed event where Vendor A quoted 100 and Vendor B quoted 90"],
  ["ipa_pending", "closed_two_bids", 3, "A closed event with an in-principle approval raised"],
  ["ipa_step1", "ipa_pending", 3, "A closed event whose in-principle approval passed step 1"],
  ["ipa_approved", "ipa_step1", 3, "A closed event whose in-principle approval is fully approved"],
  ["ipa_rejected", "ipa_pending", 3, "A closed event whose in-principle approval was rejected at step 2"],
  ["ipa_rejected_step1", "ipa_pending", 3, "A closed event whose in-principle approval was rejected at step 1"],
  ["proposal", "closed_two_bids", 4, "A closed event with an award proposal started"],
  ["awarded", "proposal", 4, "An awarded event, its PO generated"],
  ["amended", "awarded", 5, "An awarded event whose PO was amended"],
  ["amendment", "awarded", 5, "An awarded event with a PO amendment in progress"],
];
/** the sheet's set-up cases ("0. Set-up: Events the other cases use") that build a state through the screens */
const SETUP_CASE: Partial<Record<UiState, string>> = { live: "SRC-SET-001", two_bids: "SRC-SET-002", closed_two_bids: "SRC-SET-004", upcoming: "SRC-SET-005", forward: "SRC-SET-007", draft: "SRC-SET-009", pr_rfq: "SRC-SET-010", awarded: "SRC-SET-011", withdrawn: "SRC-SET-012" };
const STAGE_OF_STATE = new Map(CHAIN.map(([s, , st]) => [s, st] as const));
export const setupId = (s: UiState) => `SETUP:${s}`;

// ── modules ──────────────────────────────────────────────────────────────────
const GROUPS = FEATURE_TREE.map((g) => ({ id: g.id, label: g.label, step: (g as { step?: number }).step ?? null, what: g.what, nodes: g.children.map((c) => ({ id: c.id, label: c.label, what: c.what })) }));
const GROUP_IDS = new Set(GROUPS.map((g) => g.id));
const NODE_GROUP = new Map<string, string>();
for (const g of GROUPS) for (const n of g.nodes) NODE_GROUP.set(n.id, g.id);

/** catalog group → module (the journeys' group lists, read as the product's modules) */
const CATALOG_MODULE: Array<[RegExp, string]> = [
  [/^(UI-ENV|UI-CRE|UI-TPL|UI-LI|UI-FTTL|UI-FCOL|UI-FUPL|UI-SCH|UI-SAV|UI-FSCH|UI-FSAV|UI-FTNC|UI-PART|UI-FVND|UI-PUB|UI-FPUB|UI-SS|UI-XDLST|UI-EVDTME|UI-EVDWGT|UI-EVDDRF|UI-EVDQRY|UI-EVDDOC|UI-EVDREM)$/, "events"],
  [/^(API-EG|API-STG|API-LI|API-XCRT|API-XPUB|API-PUB|API-FDRAFT|API-NDRAFT|API-FRFPSTG|API-NRFPSTG|API-FPRICESTG|API-NPRICESTG|API-FPUBLISH|API-NPUBLISH|API-FREAD|API-NREAD|API-AUD|API-LC|API-FWAIT|API-NWAIT|API-FVERSION|API-NVERSION|API-XDLST|API-EVDTME|API-EVDWGT|API-EVDDRF|API-EVDQRY|API-EVDDOC|API-EVDREM|API-EVRMTR|API-EVRMEG)$/, "events"],
  [/^(UI-TECH|API-TECH|API-FELOGIN|API-NELOGIN|API-FESCHEMA|API-NESCHEMA|API-FESCORE|API-NESCORE|API-FESUBMIT|API-NESUBMIT|UI-XDQCS|API-XDQCS|EVI-RANK)$/, "evaluation"],
  [/^(UI-AUC|UI-CONV|UI-XDAUC|API-XSTG|API-CONV|API-FCONVERT|API-NCONVERT|UI-XDLOT|API-XDLOT)$/, "auction"],
  [/^(UI-BOQ|UI-XDBOQ|API-XDBOQ|API-XTPL)$/, "eventfeatures"],
  [/^(UI-PR|UI-XDPRE|API-XDPRE|API-EVRLIF|PRD-PR|PRD-KBPR)$/, "pr"],
  [/^(UI-VBID|UI-SUR|UI-FCAP|API-BID|API-XBID|API-FVLOGIN|API-NVLOGIN|API-FVPRICE|API-NVPRICE|API-FVTECH|API-NVTECH|API-FTSTART|API-NTSTART|API-FTANSWER|API-NTANSWER|API-FTSUBMIT|API-NTSUBMIT|API-FBIDNEW|API-NBIDNEW|API-FBIDPRICE|API-NBIDPRICE|API-FBIDSUB|API-NBIDSUB|API-SUR|API-FSURTECH|API-NSURTECH|API-FSURRFQ|API-NSURRFQ|UI-EVDRJB|API-EVDRJB|UI-EVDRGT|API-EVDRGT|UI-EVDCMP|API-EVDCMP|UI-EVDAUX|API-EVDAUX|UI-EVDLEK|API-EVDLEK|API-EVRVIS|API-XMAT|PRD-KBVDB|EVI-[A-Z]+|API-EVRCAL|API-EVRMBP)$/, "bids"],
  [/^(UI-AWD|UI-FQCS|API-AWD|API-FAWDPROP|API-NAWDPROP|API-FAWDLINES|API-NAWDLINES|API-FAWDFLOW|API-NAWDFLOW|API-FAWDSUB|API-NAWDSUB|UI-XDAPR|API-XDAPR|UI-EVDAWD|API-EVDAWD|UI-EVDAPO|API-EVDAPO|UI-EVDNFA|API-EVDNFA)$/, "award"],
  [/^(UI-XDNEG|API-XDNEG|API-XAWD|API-FCOUNTER|API-NCOUNTER)$/, "negotiation"],
  [/^(UI-XDAMD|API-XDAMD|PRD-PO)$/, "po"],
  [/^(API-AUTH|API-FBLOGIN|API-NBLOGIN|API-PERM|UI-PERM)$/, "users"],
  [/^(API-VAL|API-DB|API-NFR|UI-VAL|UI-NFR|UI-XCHK|PRD-ADM|PRD-PLT|PRD-KBINT|PRD-RPT|PRD-ANL|PRD-INTG|PRD-XC|PRD-KBAI|PRD-BUD|PRD-AE|PRD-KBPTP)$/, "platform"],
  [/^API-XVBU$/, "vendorbulk"],
  [/^(API-XREV-[A-Z]|PRD-VREV)$/, "revalidation"],
  [/^PRD-MDM$/, "masterdata"],
  [/^(PRD-VM|PRD-KBVON)$/, "vendors"],
  [/^PRD-INTK$/, "intake"],
  [/^(PRD-RFX|PRD-RFP|PRD-RFQ|PRD-KBSRC)$/, "events"],
  [/^PRD-RA$/, "auction"],
  [/^(PRD-CON|PRD-ASN|PRD-GRN|PRD-QC)$/, "p2p"],
  [/^(PRD-INV|PRD-CDN|PRD-DIS)$/, "finance"],
];
/** a sheet's module / scenario / sheet name → module; the first rule that matches wins, so the specific ones come first */
const SHEET_MODULE: Array<[RegExp, string]> = [
  [/vendor bulk|bulk upload|api-vendor-bulk/i, "vendorbulk"],
  [/revalidat/i, "revalidation"],
  [/\bintake\b(?!_)/i, "intake"],
  [/purchase requisition|purchase request|\bPRs?\b|pr-assignee|pr assignee|email-approvals|email approval|pr assignment/i, "pr"],
  [/in-principle|approver page|approval request|approval workflow/i, "award"],
  [/master qcs|\bqcs\b|comparison|technical (stage|evaluation|round)|evaluat/i, "evaluation"],
  [/awarding|award|proposal/i, "award"],
  [/counter offer|counter-offer|negotiat/i, "negotiation"],
  [/purchase order|\bPO\b|amend/i, "po"],
  [/auction|dutch|knockout|traffic light|rank-based|serial|lot auctions/i, "auction"],
  [/vendor portal|surrogate|\bbids?\b|\bbidding\b|\bquotes?\b|revising a bid|bid masking|sealed/i, "bids"],
  [/onboarding|multi-entity|multi entity|entity name|vendor (registration|mapping|discovery)|supplier/i, "vendors"],
  [/template studio|manage templates|rfq template|po template|boq|terms & conditions|t&c|template/i, "eventfeatures"],
  [/setting|configuration|admin|user|role|permission|platform|audit/i, "platform"],
  [/erfx|multi-stage|stages/i, "erfx"],
  [/event|rfq|rfx|rfp|schedule|publish|participants|withdraw|extend|reschedule|recreate|single stage|draft|create/i, "events"],
];

const STOP = new Set(["the", "and", "for", "with", "into", "from", "that", "this", "each", "its", "per", "one", "all", "any", "are", "not", "has", "have", "can", "when", "what", "who", "which", "their", "own", "same", "only", "also", "then", "than", "more", "most", "very", "every", "over", "under", "after", "before", "about", "while", "where", "being", "been", "does", "done", "them", "they", "will", "into", "onto", "upon", "via", "event", "events"]);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
const stem = (w: string) => w.replace(/(ings|ing|ions|ion|ies|es|ed|s)$/, "") || w;
/** a few names the product uses that the tree's labels do not */
const NODE_SYNONYMS: Record<string, string> = {
  "events.publish": "publish published live go-live draft save",
  "events.invite_vendors": "invite invited participant participants audience vendor vendors",
  "events.validation": "required missing refused refuse reject invalid validation mandatory",
  "events.extend_deadline": "extend extension deadline reschedule submission time end time",
  "events.lifecycle": "withdraw withdrawn recreate clone history status drafts list tab",
  "events.config": "configuration settings drawer currency decimals",
  "events.awarding_rule": "awarding rule lowest highest l1",
  "events.type_rules": "type rfq rfp single-stage single stage",
  "events.rfq_only": "rfq pricing price sheet line item quantity",
  "events.rfp_only": "rfp technical questionnaire",
  "events.rfp_rfq": "technical rfq two stages",
  "events.rfp_auction": "technical auction",
  "erfx.create": "project create title",
  "erfx.stages": "stage stages add stage",
  "erfx.terms": "terms conditions t&c",
  "erfx.schedule": "schedule start end evaluation time",
  "events.templates": "template templates studio",
  "events.boq": "boq bill of quantities",
  "events.terms": "terms conditions t&c",
  "events.versioning": "version versions amend",
  "auction.convert": "convert conversion move to auction",
  "auction.rank": "rank ranked rank-based",
  "auction.price": "price based",
  "auction.traffic_light": "traffic light green yellow red range",
  "auction.knockout": "knockout japanese",
  "auction.dutch": "dutch",
  "auction.increments": "tick increment decrement step",
  "auction.dynamic_extension": "dynamic extension extend auto-extend",
  "auction.serial_bidding": "serial sequential lot lots",
  "auction.visibility": "visible visibility see sees shown hidden masked",
  "bids.place": "place placed bid bids vendor portal submit quote quotes",
  "bids.submit": "submit submitted",
  "bids.surrogate": "surrogate on behalf",
  "bids.counter_offer": "counter offer",
  "bids.participation": "participate participation invited decline",
  "bids.price_cap": "cap ceiling maximum price",
  "bids.quick_fill": "quick fill prefill",
  "evaluation.score": "score scoring evaluator technical",
  "evaluation.qcs": "qcs master qcs comparison compare report",
  "evaluation.granularity": "granular line-wise line wise per line",
  "evaluation.tna": "tna technically not acceptable unacceptable",
  "negotiation.counter_offer": "counter offer raise revoke bulk",
  "negotiation.vendor_response": "accept reject response respond",
  "award.proposal": "proposal start awarding create proposal",
  "award.add_response": "quantity award line response",
  "award.partial": "partial split",
  "award.submit": "submit submitted",
  "award.approval": "approval approve approver reject in-principle workflow",
  "award.re_evaluation": "re-evaluation reevaluation",
  "po.generate": "generate generated po number",
  "po.contents": "contents fields gst total",
  "po.release": "release released",
  "po.vendor_accept": "accept acceptance vendor",
  "pr.list": "list filters paging assignee",
  "pr.partial_closure": "partial close closure",
  "pr.to_event": "create event from pr purchase items",
  "pr.status": "status open closed",
  "users.permissions": "permission permissions role roles allowed forbidden",
  "platform.configurations": "setting settings config configuration flag",
  "platform.approvals": "approval workflow approver",
  "platform.hardening": "security injection 500 error robustness validation",
  "vendors.onboarding": "onboarding register registration form",
  "vendors.entity_mapping": "entity mapping multi-entity plant",
  "vendorbulk.rows": "row rows column columns cell",
  "vendorbulk.dedup": "duplicate duplicates",
};
const NODE_WORDS = new Map<string, Set<string>>();
for (const g of GROUPS) for (const n of g.nodes) NODE_WORDS.set(n.id, new Set([...words(`${n.label} ${n.what} ${NODE_SYNONYMS[n.id] ?? ""}`).map(stem), ...n.id.split(".")[1].split("_").map(stem)]));

function featureFor(module: string, text: string): string {
  const g = GROUPS.find((x) => x.id === module);
  if (!g?.nodes.length) return `${module}.other`;
  const have = new Set(words(text).map(stem));
  let best = ""; let score = 0;
  for (const n of g.nodes) {
    let s = 0;
    for (const w of NODE_WORDS.get(n.id) ?? []) if (have.has(w)) s++;
    if (s > score) { score = s; best = n.id; }
  }
  return best || `${module}.other`;
}

// ── plain words ──────────────────────────────────────────────────────────────
const CALLS: Array<[RegExp, string]> = [
  [/^PATCH \/event_groups(\/:id)?\/?$/, "save or publish the event"],
  [/^POST \/event_groups\/?$/, "create the draft event"],
  [/^GET \/event_groups\/:id$/, "read the event back"],
  [/^GET \/event_groups\/history/, "open the events history list"],
  [/^GET \/event_groups\/draft/, "open the drafts list"],
  [/^GET \/event_groups\/tab_counts/, "read the events list's tab counts"],
  [/^GET \/event_groups\/?$/, "open the events list"],
  [/^GET \/event_groups\/:id\/get_line_items/, "read the event's line items"],
  [/^GET \/event_groups\/:id\/get_audience/, "read the invited vendors"],
  [/^GET \/event_groups\/:id\/get_lots/, "read the event's lots"],
  [/^GET \/event_groups\/:id\/get_all_attachments/, "read the event's attachments"],
  [/^POST \/event_groups\/:id\/participants/, "add participants to the event"],
  [/^POST \/event_groups\/:id\/change_ownership/, "change the event's owner"],
  [/^POST \/event_groups\/:id\/create_clone/, "recreate the event"],
  [/^PATCH \/event_groups\/:id\/save_draft_lots/, "save the draft lots"],
  [/^PATCH \/event_groups\/:id\/reset_to_smart_lots/, "reset the lots"],
  [/^POST \/trade\/template_input/, "add the stage with its template"],
  [/^POST \/trade\/move_to_auction/, "convert the pricing round into an auction"],
  [/^POST \/trade\/create_new_lot/, "add a lot to the stage"],
  [/^POST \/trade\/upload_file/, "upload the sheet file"],
  [/^POST \/trade\/:id\/reopen_line_items/, "reopen the line items"],
  [/^PATCH \/trade\/:id\/staggered_time/, "set the stage's staggered time"],
  [/^PATCH \/trade\/:id\/edit_weight_parameters/, "edit the evaluation weights"],
  [/^GET \/v1\/trade\/:id\/schema/, "open the technical responses to score"],
  [/^GET \/v1\/trade\/:id\/get_approvals|^GET \/event_groups\/:id\/get_approvals/, "read the approvals"],
  [/^GET \/v1\/trade\/:id\/event_indicators/, "read the stage's indicators"],
  [/^GET \/v1\/trade\/:id\/aggregate_savings/, "read the savings"],
  [/^PATCH \/v1\/trade\/:id\/currency_exchange_rates/, "set the exchange rates"],
  [/^PATCH \/v1\/trade\/:id\/request_tr_reevaluation/, "ask for a technical re-evaluation"],
  [/^PATCH \/v1\/trade\/add_audience/, "invite vendors to the stage"],
  [/^GET \/(v1\/)?trade\/:id/, "open the stage"],
  [/^PATCH \/(v1\/)?trade/, "update the stage"],
  [/^GET \/(v1\/)?trade/, "read the stages"],
  [/^POST \/bids\/template_input/, "enter the vendor's price on their behalf"],
  [/^POST \/v1\/bids\/:id\/create_bid_products/, "price the line items in the bid"],
  [/^POST \/v1\/bids/, "open a bid on the pricing round"],
  [/^PATCH \/v1\/bids\/:id/, "submit the bid"],
  [/^POST \/proposal\/:id\/add_response/, "award the quantity to the vendor"],
  [/^POST \/proposal\/:id\/submit/, "submit the award for approval"],
  [/^GET \/proposal\/:id\/approval_workflows/, "read the award's approval workflow"],
  [/^POST \/proposal/, "open an award proposal"],
  [/^(PATCH|POST) \/evaluations\/submit/, "submit the evaluation"],
  [/^POST \/evaluations/, "score the technical responses"],
  [/^POST \/template_responses\/create_surrogate_response/, "enter the vendor's technical response on their behalf"],
  [/^POST \/template_responses/, "start the technical response"],
  [/^PUT \/template_responses\/:id\/create_page_responses/, "answer the technical form"],
  [/^PATCH \/template_responses\/:id/, "submit the technical response"],
  [/^POST \/item_versions/, "save the line items"],
  [/^POST \/additional_request\/raise_additional_request/, "send a counter offer"],
  [/^POST \/additional_request\/raise_bulk_counter_offer/, "send counter offers in bulk"],
  [/^PATCH \/additional_request\/revoke/, "revoke the counter offer"],
  [/^PATCH \/additional_request\/resolve/, "answer the counter offer"],
  [/^PATCH \/purchase_requests\/partial_close/, "partially close the purchase request"],
  [/^GET \/purchase_requests/, "open the purchase requests"],
  [/^POST \/v1\/verify_otp|^POST \/v1\/generate_otp/, "sign in with the one-time code"],
  [/^POST \/users\/create_user/, "create the user"],
  [/^POST \/products/, "create the product"],
  [/^POST \/product_categories/, "create the category"],
  [/^GET \/templates/, "read the templates"],
  [/^POST \/templates\/upload_attachment/, "attach a file to the template"],
  [/^POST \/templates/, "save the template"],
  [/^POST \/intake_requests/, "create the intake request"],
  [/^PATCH \/intake_requests/, "update the intake request"],
  [/^POST \/v1\/chats\/:id\/send_message/, "send the message"],
  [/\/v1\/chats/, "open the event's messages"],
  [/^GET \/reminders/, "read the reminder"],
  [/^POST \/approval_workflow\/approval_requests\/resolve_approval/, "approve or reject the request"],
  [/^GET \/orders/, "open the events list"],
  [/^GET \/v1\/dashboard_configuration/, "read the company's configuration"],
  [/^GET \/reports\/download_bulk_report/, "download the report"],
  [/^GET \/sheets\/schema/, "read the sheet's columns"],
  [/^POST \/user_intents/, "record what the user did"],
];
const VERB: Record<string, string> = { GET: "read", POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };
function callWords(method: string, rawPath: string): string {
  const path = rawPath.replace(/\?.*$/, "").replace(/\/\{\{?[A-Za-z_]+\}\}?/g, "/:id").replace(/\/[0-9a-fA-F-]{8,}/g, "/:id").replace(/\/[A-Za-z0-9]{8}(?=\/|$)/g, "/:id").replace(/\/:[a-z_]+/gi, "/:id");
  const key = `${method.toUpperCase()} ${path}`;
  const hit = CALLS.find(([re]) => re.test(key));
  if (hit) return hit[1];
  const parts = path.split("/").filter((p) => p && p !== "v1" && p !== ":id" && !/^\d+$/.test(p)).map((p) => p.replace(/_/g, " "));
  return `${VERB[method.toUpperCase()] ?? "call"} the ${parts.join(" ") || "app"}`;
}

let SETTING_KEYS: Set<string> | null = null;
function settingKeys(): Set<string> {
  if (SETTING_KEYS) return SETTING_KEYS;
  SETTING_KEYS = new Set();
  try {
    const m = JSON.parse(readFileSync(join(DATA, "setting-map.json"), "utf8"));
    const walk = (o: unknown) => { if (!o || typeof o !== "object") return; for (const [k, v] of Object.entries(o as Record<string, unknown>)) { if (/^[a-z][a-z0-9_]+_[a-z0-9_]+$/.test(k)) SETTING_KEYS!.add(k); if (typeof v === "string" && /^[a-z][a-z0-9_]+_[a-z0-9_]+$/.test(v)) SETTING_KEYS!.add(v); walk(v); } };
    walk(m);
  } catch { /* no map: nothing is kept verbatim */ }
  return SETTING_KEYS;
}

const CALL_RE = /`?\b(GET|POST|PATCH|PUT|DELETE)\s+(\/[A-Za-z0-9_\/:{}.?=&,-]+)`?/g;
/** one text in plain words: calls become what they do, code marks go, status codes become words, code names become words */
export function plainText(raw: string): string {
  if (!raw) return "";
  let t = String(raw);
  // "(`PATCH /x`)" — a call named beside its plain words adds nothing: drop it
  t = t.replace(/\s*\(\s*`?(?:GET|POST|PATCH|PUT|DELETE)\s+\/[^)`]*`?\s*\)/g, "");
  t = t.replace(CALL_RE, (_m, method: string, path: string) => callWords(method, path));
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\bHTTP\s+(\d{3})\b/g, (_m, code: string) => (Number(code) >= 500 ? `a server error (${code})` : Number(code) >= 400 ? `a refusal (error ${code})` : `an accepted answer (${code})`));
  t = t.replace(/\b(4\d\d|5\d\d)\b(?=\s*(?:with|and|,|\.|$))/g, (m) => (Number(m) >= 500 ? `server error ${m}` : `error ${m}`));
  t = t.replace(/\berror\.code\b/g, "error code");
  const keep = settingKeys();
  t = t.replace(/\bQA_Platform_(?=[a-z])/g, "");
  // a company setting is named as a person would read it: the setting “Lock vendors addition in event creation”
  t = t.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (m) => (keep.has(m) ? `the setting “${m[0].toUpperCase()}${m.slice(1).replace(/_/g, " ")}”` : m.replace(/_/g, " ")));
  t = t.replace(/\b(the setting )+the setting/g, "the setting");
  // an engineer's constant (VENDOR_URL, BUYER_EMAIL) is said as words; a QA_ test name stays as typed on screen
  t = t.replace(/\b(?!QA_)[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g, (m) => `the ${m.toLowerCase().replace(/_/g, " ")}`);
  t = simplify(t);
  // the code's own names (Api::IntakeRequestsController#create, params[:title].blank?, a "guard at the top of …") say
  // nothing to a tester: the clause that carries them goes
  t = t.replace(/\s*(?:from|by|in|at|via)\s+the\s+[^;]*?(?:::|#[a-z_]+\b|\[:|\.blank\?|\bguard\b)[^;]*?(?=;|\.\s|\.$|$)/g, "");
  t = t.replace(/\S*(?:::|\[:)\S*/g, "").replace(/\(\s*\)/g, "");
  t = t.replace(/[ \t]+/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/\s+\./g, ".").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
/**
 * THE WORDS A PERSON USES (23 Nov 2026): the suite is read by anyone on the team, so what the engineers wrote for
 * each other is said the way the screens say it — the app answers, it refuses, it accepts; a record, not a row;
 * text, not a string; the event, not its uuid. Only the display text: a run keeps the exact request.
 */
type Rewrite = string | ((...m: string[]) => string);
const PLACEHOLDERS: Array<[RegExp, Rewrite]> = [
  [/\{\{?\s*stamp\s*\}?\}/gi, "a unique name"], [/\{\{?\s*(prItemId|prItem|purchaseRequestItemId)\s*\}?\}/gi, "the PR line"],
  [/\{\{?\s*(eventGroupUuid|eventGroupId|eventId)\s*\}?\}/gi, "the event"], [/\{\{?\s*(tradeUuid|tradeId|stageUuid)\s*\}?\}/gi, "the stage"],
  [/\{\{?\s*(vendorCompanyId|vendorId|sellerCompanyId)\s*\}?\}/gi, "the vendor"], [/\{\{?\s*(bidUuid|bidId)\s*\}?\}/gi, "the bid"],
  [/\{\{?\s*(proposalUuid|proposalId)\s*\}?\}/gi, "the proposal"], [/\{\{?\s*(productId|productUuid)\s*\}?\}/gi, "the product"],
  [/\{\{?\s*(excel ?data|file ?data|data)\s*\}?\}/gi, "the file"], [/\{\{?\s*([A-Za-z_ ]+?)\s*\}?\}/g, (_m: string, k: string) => `the ${k.replace(/[_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/\b(uuid|id)\b/g, "").trim() || "value"}`],
];
const WORDS: Array<[RegExp, Rewrite]> = [
  // a request body pasted into a step, and the code's own file paths and method names, say nothing to a tester
  [/\{\s*"[^{}]{20,}\}(\s*\.)?/g, "the details the case gives$1"], [/\s*\((?:app|lib|config|spec)\/[^)]*\)/g, ""], [/\b[a-z_]+#[a-z_]+\b/g, ""],
  [/\bthe app response\b/gi, "the app's answer"], [/\bshows the response\b/gi, "shows the app's answer"],
  [/\bwalking the API journey\b/gi, "going through the API flow"], [/\bin the API journey\b/gi, "through the API"], [/\bthe API journey\b/gi, "the API flow"],
  [/\b(no|a|an|one|the|new|draft|every|each|that|this) ([A-Za-z][a-z]+(?: [a-z]+)*) rows?\b/g, "$1 $2"], [/\b(db|database|audit) rows?\b/gi, "record"],
  [/\b(the|its|app's|an?) (API )?response\b/gi, "$1 answer"], [/\bresponse (body|code|status)\b/gi, "answer"], [/\b(request|json) body\b/gi, "details sent"], [/\bpayload\b/gi, "details sent"],
  [/\bstatus code\b/gi, "answer"], [/\bendpoints?\b/gi, "call"], [/\bassert(s|ed|ing)? that\b/gi, "check that"], [/\bassert(s|ed|ing)?\b/gi, "check"],
  [/\buuids?\b/gi, "id"], [/\bevent group\b/gi, "event"], [/\b(a |the )?string\b/gi, "$1text"], [/\bintegers?\b/gi, "whole number"], [/\bbooleans?\b/gi, "yes or no"],
  [/\barrays?\b/gi, "list"], [/\bnull\b/gi, "empty"], [/\bJSON\b/g, "data"], [/\bparams?\b|\bparameters?\b/gi, "values"], [/\bbackend\b/gi, "the app"], [/\bfrontend\b/gi, "the screen"],
  [/\b(the )?(db|database)\b/gi, "the app's records"], [/\bbase64 (the )?/gi, "attach the "], [/\bfixtures?\b/gi, "test file"], [/\bVR_QA_TOKEN\b/g, "the QA login"],
  [/\bHTTP\b ?/g, ""], [/\b5xx\b/g, "a server error"], [/\b4xx\b/g, "a refusal"], [/\b(2xx|200 OK)\b/g, "accepted"],
  [/\ba refusal \(error \d{3}\) with error code \d+ \(([^)]+)\)/g, "it is refused with the message “$1”"], [/\ba refusal \(error \d{3}\)/g, "it is refused"],
  [/\ban accepted answer \(\d{3}\)/g, "it is accepted"], [/\ba server error \(\d{3}\)/g, "the app shows a server error"],
  [/\b(?:an? )?(?:typed |untyped )?(4\d\d)\s*\(([^)]+)\)/gi, "refused with the message “$2”"], [/\b(a |an )?(typed|untyped) (4\d\d|5\d\d)\b/g, (m: string) => (/5\d\d/.test(m) ? "a server error" : "a refusal")],
  [/\berror (4\d\d)\b/g, "a refusal"], [/\bserver error (5\d\d)\b/g, "server error"], [/\bstatus (\d{3})\b/g, (m: string, c: string) => (Number(c) >= 500 ? "a server error" : Number(c) >= 400 ? "a refusal" : "accepted")],
  [/\b([a-z]+(?: [a-z]+)?)\[\]\.([a-z]+(?: [a-z]+)*)/g, "a $1 entry's $2"], [/\b([a-z]+(?: [a-z]+)?)\[\]/g, "the $1 list"], [/\b([a-z]{3,})\.([a-z]{3,})\.([a-z]{3,})\b/g, "the $1's $2 $3"], [/\b([a-z]{3,})\.([a-z]{3,})\b(?!\.)/g, "the $1's $2"],
  [/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g, (m: string) => m.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()],
  [/\b([a-z]+(?: [a-z]+)?) rows? (is|are|was|were|exists?|remains?|gets?) (created|inserted|added|saved|written|deleted|removed|left)\b/gi, "$1 $2 $3"], [/\bis inserted\b/g, "is created"],
  [/^The app refuses it: It is refused/, "It is refused"], [/\bjson\b/gi, "data"], [/\b(every|each|this|that|one|no) (API )?responses?\b/gi, "$1 answer"], [/\bAPI responses?\b/g, "the app's answers"],
  [/\b[\w.-]*\/[\w./-]*\/([\w-]+\.(?:pdf|xlsx|xls|csv|png|jpg|txt|docx))\b/gi, "the test file $1"], [/\btest file: the test file\b/g, "test file"],
  [/\bA (?=[aeiouAEIOU][a-z])/g, "An "], [/\ba (?=[aeiou][a-z])/g, "an "],
  [/\bthe the\b/g, "the"], [/\ba the\b/g, "the"], [/\bthe an?\b/g, "the"],
];
function simplify(raw: string): string {
  let t = raw;
  for (const [re, to] of PLACEHOLDERS) t = typeof to === "string" ? t.replace(re, to) : t.replace(re, to);
  for (const [re, to] of WORDS) t = typeof to === "string" ? t.replace(re, to) : t.replace(re, to);
  return t.replace(/[ \t]+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

/** a catalog case's one-string steps as numbered actions */
export function splitSteps(s: string): string[] {
  const t = plainText(s);
  if (!t) return [];
  if (/\b1[.)]\s/.test(t) && /\b2[.)]\s/.test(t)) return t.split(/\s*(?=\b\d{1,2}[.)]\s)/).map((x) => x.replace(/^\d{1,2}[.)]\s*/, "").trim()).filter(Boolean);
  if (t.includes(" → ")) return t.split(/\s*→\s*/).map((x) => x.trim()).filter(Boolean);
  return [t];
}
/** "QA_Platform_intake_create_rejects_missing_title" → "Intake create rejects missing title" */
export function plainTitle(raw: string): string {
  let t = plainText(raw.replace(/^QA_Platform_?/i, "").replace(/_/g, " "));
  t = t.replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const PRI: Record<string, Priority> = { critical: "P0", high: "P1", medium: "P2", low: "P3", p0: "P0", p1: "P1", p2: "P2", p3: "P3" };
const toPriority = (p: string): Priority => PRI[String(p ?? "").trim().toLowerCase()] ?? "P2";
function kindFromText(t: string): Kind {
  if (/\b(refus|reject|cannot|can't|must not|not allowed|invalid|missing|blocked|forbidden|disabled|greyed|denied|unauthori[sz]ed|without permission|untyped 500)/i.test(t)) return "Negative";
  if (/\b(limit|boundary|edge|exactly|maximum|minimum|zero|empty|duplicate|too long|too many|concurrent|race|twice)\b/i.test(t)) return "Edge";
  return "Positive";
}

// ── runnability ──────────────────────────────────────────────────────────────
function storedRunnable(id: string, fallback: Runnable): Runnable {
  const sp = storedTextPlan(id);
  if (!sp || sp.meta.source === "fallback") return fallback;
  if (sp.meta.unbuilt) return "needs-step";
  return sp.meta.coverage === "full" ? "now" : sp.meta.coverage === "partial" ? "partly" : "needs-step";
}

// ── the three stores ─────────────────────────────────────────────────────────
function moduleOfCatalog(c: CatalogCase): string {
  for (const [re, m] of CATALOG_MODULE) if (re.test(c.group)) return m;
  return "platform";
}
const SHEET_NAME_MODULE: Array<[RegExp, string]> = [
  [/vendor-bulk|vbu/i, "vendorbulk"], [/revalidation/i, "revalidation"], [/pr-assignee|pr-assignment|email-approvals/i, "pr"],
  [/in-principle/i, "award"], [/multi-entity|vendor-onboarding/i, "vendors"], [/template-studio|template-po-rfq/i, "eventfeatures"],
];
function moduleOfSheet(c: SheetCase): string {
  // the sheet's own module and scenario first ("23. Awarding — complete, partial…"); a sheet that is one feature
  // (the PR assignee sheet, the vendor bulk upload) names it; last, the case's own words
  const t = `${c.module} ${c.scenario}`.replace(/^explored — /i, "");
  for (const [re, m] of SHEET_MODULE) if (re.test(t)) return m;
  for (const [re, m] of SHEET_NAME_MODULE) if (re.test(c.sheet)) return m;
  const t2 = `${c.title} ${c.preconditions}`;
  for (const [re, m] of SHEET_MODULE) if (re.test(t2)) return m;
  return "events";
}
function stageFor(module: string, state: UiState | null, text: string): number {
  if (state && STAGE_OF_STATE.has(state)) return STAGE_OF_STATE.get(state)!;
  switch (module) {
    case "intake": case "pr": return 0;
    case "events": case "erfx": case "eventfeatures": return /\b(publish|published|live|withdraw|extend|reschedul|recreate|history)\b/i.test(text) && !/\b(draft|save as draft|before publish|not yet published)\b/i.test(text) ? 1 : 0;
    case "auction": return 2;
    case "bids": case "negotiation": return 2;
    case "evaluation": return 3;
    case "award": return 4;
    case "po": case "p2p": case "finance": return 5;
    default: return -1;
  }
}

function fromCatalog(c: CatalogCase): SuiteCase {
  const module = moduleOfCatalog(c);
  const text = `${c.title} ${c.section} ${c.setup} ${c.steps}`;
  const state = stateFromWords(`${c.setup} ${c.title}`);
  const roadmap = /roadmap|not in the product yet/i.test(c.section);
  let runnable: Runnable;
  if (roadmap) runnable = "spec";
  else {
    let route: ReturnType<typeof routeFor> | null = null;
    try { route = routeFor(c); } catch { route = null; }
    const runs = !!(route?.runsNow || route?.runnable);
    if (c.layer === "ui") runnable = runs ? storedRunnable(c.id, "compile") : /^PRD-KB/.test(c.group) || c.verdict === "manual" ? "manual" : c.verdict === "automate-later" ? "later" : storedRunnable(c.id, "compile");
    else runnable = runs ? "now" : c.verdict === "manual" ? "manual" : c.verdict === "automate-later" ? "later" : "compile";
  }
  const kind = kindFromText(`${c.title} ${c.expected}`);
  return {
    key: c.id, id: c.id, source: "catalog", from: c.group, module, feature: featureFor(module, text), stage: stageFor(module, state, text), layer: c.layer,
    priority: toPriority(c.priority), kind, title: plainTitle(c.title), state, needs: state ? setupId(state) : null, runnable,
    role: /vendor/i.test(c.setup) && !/buyer/i.test(c.setup) ? "Vendor" : /evaluator/i.test(c.setup) ? "Evaluator" : "Buyer",
    preconditions: plainText(c.setup) || "-", configs: c.gate ? `${c.gate} = On` : "None", testData: "-", steps: splitSteps(c.steps), expected: plainText(c.expected), why: plainText(c.why),
  };
}
function fromSheet(c: SheetCase): SuiteCase {
  const module = moduleOfSheet(c);
  const text = `${c.title} ${c.scenario} ${c.module} ${c.steps.join(" ")}`;
  let state: UiState | null = null;
  try { const p = sheetPrep(c); state = p?.state && p.state !== "none" ? p.state : null; } catch { state = null; }
  const setup = Object.entries(SETUP_CASE).find(([, id]) => id === c.id)?.[0] as UiState | undefined;
  const runnable: Runnable = c.layer === "api" ? "now" : storedRunnable(c.id, "compile");
  const kind: Kind = /negative/i.test(c.testType) ? "Negative" : /edge/i.test(c.testType) ? "Edge" : "Positive";
  const st = setup ?? state;
  return {
    key: c.id, id: c.id, source: "sheet", from: c.sheet, module, feature: featureFor(module, text), stage: stageFor(module, st, text), layer: c.layer,
    priority: toPriority(c.priority), kind, title: plainText(c.title), state: st, needs: setup ? null : state ? setupId(state) : null, runnable,
    role: c.role || "Buyer", preconditions: plainText(c.preconditions) || "-", configs: c.configs || "None", testData: c.testData || "-", steps: c.steps.map(plainText), expected: plainText(c.expected), why: plainText(c.why ?? ""),
  };
}
function fromApi(c: TestCaseRecord): SuiteCase {
  const module = NODE_GROUP.get(c.feature) ?? "platform";
  const feature = NODE_GROUP.has(c.feature) ? c.feature : `${module}.other`;
  const text = `${c.title} ${c.preconditions ?? ""} ${(c.steps ?? []).join(" ")}`;
  const state = stateFromWords(`${c.preconditions ?? ""} ${c.title.replace(/_/g, " ")}`);
  const kind: Kind = c.expected === "reject" ? "Negative" : /limit|boundary|edge|max|min|empty|duplicate/i.test(c.title) ? "Edge" : "Positive";
  const steps = (c.steps ?? []).length ? (c.steps ?? []).map((s) => plainText(s).replace(/^\d+[.)]\s*/, "")) : [`${callWords(c.method, c.path)[0].toUpperCase()}${callWords(c.method, c.path).slice(1)} with the request the case gives.`, "Look at the app's answer."];
  const said = plainText(c.expectedResult);
  const expected = c.expected === "reject" ? (/^(it is|the app) refus/i.test(said) ? said : `The app refuses it: ${said}`) : c.expected === "no-5xx" ? (/server error/i.test(said) ? said : `The app answers without a server error: ${said}`) : said;
  return {
    key: c.id, id: c.id, source: "api", from: c.feature, module, feature, stage: stageFor(module, state, text), layer: "api", priority: toPriority(c.priority), kind, title: plainTitle(c.title), state, needs: state ? setupId(state) : null, runnable: "now",
    role: /vendor/i.test(c.preconditions ?? "") && !/buyer/i.test(c.preconditions ?? "") ? "Vendor" : "Buyer", preconditions: plainText(c.preconditions ?? "") || "-", configs: "None", testData: "-", steps, expected, why: plainText(c.rationale ?? ""),
  };
}

// ── one case per stage of the flow ───────────────────────────────────────────
/**
 * A case that walks the whole journey in one go (create the event → publish → the vendor bids → award) is cut
 * at each stage ACTION into parts that continue from each other: part 1 builds the draft, part 2 publishes it,
 * part 3 bids… Each part is a case of its own — its pre-condition names the state the part before it reached, in
 * the words the runner builds by API, so it runs alone too — and `prev` ties it to the part before, so ticking
 * part 3 ticks parts 1 and 2. Only a case that CREATES its event is cut; a case that opens an existing event and
 * does one thing is already one stage. A stage word that is not an action (a greyed "Publish" button, "how will
 * you award the event?") is not a cut.
 */
const CUTS: Array<[number, RegExp, RegExp | null]> = [
  [5, /\b(generate|create|release|open)\b.{0,30}\b(purchase order|\bPO\b)|\bpurchase order (is )?(generated|created|released)/i, null],
  [4, /\b(start awarding|create (the |a )?proposal|award (the |a |this )?(line|quantity|quantities|vendor|event|rfq|it|\d)|submit (the )?(award|proposal)|click "?(award|start awarding|create proposal))/i, /award (option|rule|type)|how will you award|awarding rule/i],
  [3, /\b(master qcs|evaluate the|compare the (bids|quotes)|score the|open .{0,20}evaluation\b(?! time))/i, /evaluation time/i],
  [2, /\b(place|places|submit|submits|enter|enters|put in|add|adds|make|makes|type|types)\b.{0,40}\b(bid|quote|offer|price per unit|vendor's price)\b|\bsurrogate bid|\bvendor portal\b|\bas (the )?vendor\b.{0,30}\b(bid|quote)|\b(quote|quotes|bid|bids)\s+(?:₹\s*)?\d|\bvendor [abc]\b.{0,30}\b(quote|quotes|bid|bids)\b/i, /reject(ed)? bid|rejected bids|bid masking|no bids?\b|counter/i],
  [1, /\b(click|press|hit|choose|select)\b.{0,25}\bpublish|\bpublish(es)? (the |it\b|this |and )/i, /grey|disabled|cannot|can't|refus|not (be )?published|blocked|without|mouse over|hover|tooltip/i],
];
const CREATES = /\b(create event|create screen|single[- ]stage|erfx|new event|create (a |an |the )?.{0,30}(rfq|rfp|auction|event|project)|create the draft)/i;
const LOGIN = /\b(log in|sign in|login|logs in|signs in)\b/i;
function cutAt(step: string): number | null {
  for (const [stage, re, not] of CUTS) if (re.test(step) && !(not && not.test(step))) return stage;
  return null;
}
/** the state a part leaves behind, in the words the runner builds from, and what the part is called */
const REACHED: Record<number, { state: UiState; pre: string; expected: string; what: string }> = {
  0: { state: "draft", pre: "A draft event saved and not published, with its template, line items and invited vendors as the part before set them.", expected: "The event is saved with everything the steps set, still a draft (not published).", what: "Build the event" },
  1: { state: "live", pre: "A live event (published) with the QA vendors invited and no bid yet, as the part before left it.", expected: "The event is published: its project page opens and the status reads Live.", what: "Publish" },
  2: { state: "bid", pre: "A live event where Vendor A has quoted, as the part before left it.", expected: "The bid is placed and shows on the Responses tab with its price.", what: "The bid" },
  3: { state: "closed_two_bids", pre: "A closed event where Vendor A quoted 100 and Vendor B quoted 90 (bidding over), as the part before left it.", expected: "Master QCS shows the bids ranked, the lowest first.", what: "Evaluate" },
  4: { state: "awarded", pre: "An awarded event (its proposal submitted), as the part before left it.", expected: "The award is made: the proposal shows the awarded quantities and goes for approval or becomes final.", what: "Award" },
  5: { state: "awarded", pre: "An awarded event with its PO generated, as the part before left it.", expected: "The purchase order exists with the awarded lines.", what: "Purchase order" },
};
export function splitFlow(c: SuiteCase): SuiteCase[] {
  if (c.layer !== "ui" || c.steps.length < 4 || !c.steps.some((st) => CREATES.test(st))) return [c];
  // a case ABOUT a refused or greyed-out publish is one stage: the publish is the check, not a step on
  const aboutRefusal = /grey|disabled|refus|cannot publish|not (be )?published|blocked|tooltip/i.test(`${c.title} ${c.expected}`);
  const parts: Array<{ stage: number; steps: string[] }> = [];
  let cur: { stage: number; steps: string[] } = { stage: 0, steps: [] };
  const actions = (p: { steps: string[] }) => p.steps.filter((st) => !LOGIN.test(st)).length;
  let held: string | null = null; // a sign-in just before a cut belongs to the next part
  for (const st of c.steps) {
    if (LOGIN.test(st)) { if (held) cur.steps.push(held); held = st; continue; }
    let at = cutAt(st);
    if (at === 1 && aboutRefusal) at = null;
    // building the draft takes several steps before a cut makes sense; publishing is one click, so a bid or an
    // evaluation right after it starts its own part
    const enough = cur.stage === 0 ? actions(cur) >= 2 : actions(cur) >= 1;
    if (at !== null && at > cur.stage && enough) { parts.push(cur); cur = { stage: at, steps: held ? [held, st] : [st] }; }
    else { if (held) cur.steps.push(held); cur.steps.push(st); if (at !== null && at > cur.stage && actions(cur) === 1) cur.stage = at; }
    held = null;
  }
  if (held) cur.steps.push(held);
  parts.push(cur);
  if (parts.length < 2) return [c];
  const login = c.steps.find((st) => LOGIN.test(st));
  const of = parts.length;
  return parts.map((p, i) => {
    let before = i ? REACHED[parts[i - 1].stage] : null;
    // an Evaluate / Award / PO part after a Bid part starts from the bidding CLOSED with both quotes in, not a live bid
    if (before && p.stage >= 3 && parts[i - 1].stage <= 2) before = { ...REACHED[3], pre: "A closed event where Vendor A quoted 100 and Vendor B quoted 90 (bidding over), as the parts before left it." };
    const last = i === of - 1;
    const what = last ? (REACHED[p.stage]?.what ?? "Finish") : REACHED[p.stage]?.what ?? "Build the event";
    const steps = i && login && !p.steps.some((st) => LOGIN.test(st)) ? [login, ...p.steps] : p.steps;
    return {
      ...c,
      key: `${c.key}·${i + 1}`, id: `${c.id}·${i + 1}`,
      title: `${c.title} — ${i + 1} of ${of}: ${what}`,
      stage: p.stage, steps,
      preconditions: before ? before.pre : c.preconditions,
      expected: last ? c.expected : (REACHED[p.stage]?.expected ?? "The step goes through and the event is as the steps left it."),
      state: before ? before.state : c.state,
      needs: i ? null : c.needs,
      ...(i ? { prev: `${c.key}·${i}` } : {}),
      part: { n: i + 1, of, what },
    };
  });
}

// ── build, keep, serve ───────────────────────────────────────────────────────
/** `rewrites: false` keeps every case's own words (the rewrite script judges and keys by them); `write: false` keeps the file as it is */
export function buildSuite(opts: { write?: boolean; rewrites?: boolean } = {}): Suite {
  const cases: SuiteCase[] = [];
  const seen = new Set<string>();
  // a sheet id used again in another sheet (SSR-001 in every version of a session's sheet, GEN-001 in every session)
  // is kept as its own case, keyed id@sheet; an identical row (same title and steps) in a later sheet version is one case
  const rows = new Map<string, string>();
  for (const c of sheetCases()) {
    const same = `${c.id}|${c.title}|${c.steps.join("|")}`.toLowerCase();
    if (rows.has(same)) continue;
    rows.set(same, c.sheet);
    const sc = fromSheet(c);
    if (seen.has(c.id)) sc.key = `${c.id}@${c.sheet}`;
    seen.add(c.id);
    cases.push(...splitFlow(sc));
  }
  for (const c of allCases()) { if (seen.has(c.id)) continue; seen.add(c.id); cases.push(...splitFlow(fromCatalog(c))); }
  for (const c of apiLibrary()) { if (!c?.id || seen.has(c.id)) continue; seen.add(c.id); cases.push(fromApi(c)); }
  const rewritten = opts.rewrites === false ? 0 : applyRewrites(cases);
  if (rewritten) console.log(`[regression] ${rewritten} case(s) shown in the model's rewrite`);
  // the chain, with the count of cases resting on each node
  const count = new Map<string, number>();
  for (const c of cases) if (c.needs) count.set(c.needs, (count.get(c.needs) ?? 0) + 1);
  const setup: SetupNode[] = CHAIN.map(([state, parent, stage, label]) => ({ id: setupId(state), state, label, stage, needs: parent ? setupId(parent) : null, ...(SETUP_CASE[state] ? { caseId: SETUP_CASE[state] } : {}), count: count.get(setupId(state)) ?? 0 }));
  // modules in the tree's order; a feature with no cases is still listed (the suite doubles as the coverage map)
  const modules: SuiteModule[] = GROUPS.map((g) => {
    const mine = cases.filter((c) => c.module === g.id);
    const features = g.nodes.map((n) => ({ id: n.id, label: n.label, what: n.what, count: mine.filter((c) => c.feature === n.id).length }));
    const other = mine.filter((c) => c.feature === `${g.id}.other`).length;
    if (other) features.push({ id: `${g.id}.other`, label: `Other ${g.label.toLowerCase()} cases`, what: "Cases of this module that name no one feature of it.", count: other });
    return { id: g.id, label: g.label, step: g.step, what: g.what, features, count: mine.length };
  });
  const tally = (f: (c: SuiteCase) => string) => { const o: Record<string, number> = {}; for (const c of cases) o[f(c)] = (o[f(c)] ?? 0) + 1; return o; };
  const suite: Suite = {
    builtAt: new Date().toISOString(), modules, setup, cases,
    counts: { total: cases.length, ui: cases.filter((c) => c.layer === "ui").length, api: cases.filter((c) => c.layer === "api").length, split: new Set(cases.filter((c) => c.part).map((c) => c.key.replace(/·\d+$/, ""))).size, bySource: tally((c) => c.source), byRunnable: tally((c) => c.runnable), byStage: tally((c) => (c.stage < 0 ? "none" : STAGES[c.stage])), byPriority: tally((c) => c.priority) },
  };
  if (opts.write !== false) {
    mkdirSync(dirname(SUITE_FILE), { recursive: true });
    writeFileSync(SUITE_FILE, JSON.stringify(suite));
    cache = suite;
  }
  return suite;
}

/** the model's rewrites of the terse cases (scripts/regression-rewrite.ts), shown when the case's text is still the one they were written for */
const REWRITES_FILE = join(DATA, "regression-rewrites.json");
function applyRewrites(cases: SuiteCase[]): number {
  if (!existsSync(REWRITES_FILE)) return 0;
  let have: Record<string, { sig: string; steps: string[]; expected: string; preconditions?: string }> = {};
  try { have = JSON.parse(readFileSync(REWRITES_FILE, "utf8")); } catch { return 0; }
  let n = 0;
  for (const c of cases) {
    const r = have[c.key];
    if (!r) continue;
    const sig = createHash("sha1").update([c.title, c.preconditions, ...c.steps, c.expected].join("\n")).digest("hex").slice(0, 12);
    if (r.sig !== sig) continue;
    // the model's words go through the same plain-words pass as everything else (a token it kept from the source)
    c.steps = r.steps.map(plainText); c.expected = plainText(r.expected); if (r.preconditions) c.preconditions = plainText(r.preconditions);
    n++;
  }
  return n;
}

let cache: Suite | null = null;
export function loadSuite(): Suite {
  if (cache) return cache;
  if (existsSync(SUITE_FILE)) {
    try { cache = JSON.parse(readFileSync(SUITE_FILE, "utf8")) as Suite; return cache; } catch { /* rebuild */ }
  }
  return buildSuite();
}
export function suiteCase(key: string): SuiteCase | undefined {
  const want = key.toUpperCase();
  return loadSuite().cases.find((c) => c.key.toUpperCase() === want) ?? loadSuite().cases.find((c) => c.id.toUpperCase() === want);
}

/**
 * THE ORDER A SELECTION RUNS IN — set-up before what rests on it, the flow's stages in order, P0 first.
 * Set-up nodes that are a sheet case of their own (SRC-SET-…) run as that case; the others are built by the
 * runner for each case that needs them (sheetPrep), so they add no row.
 */
export function runOrder(ids: string[]): { ids: string[]; setupCases: string[]; unknown: string[] } {
  const s = loadSuite();
  const byId = new Map<string, SuiteCase>();
  for (const c of s.cases) { byId.set(c.key.toUpperCase(), c); if (!byId.has(c.id.toUpperCase())) byId.set(c.id.toUpperCase(), c); }
  const node = new Map(s.setup.map((n) => [n.id, n]));
  const depth = (n: SetupNode | undefined): number => (n?.needs ? 1 + depth(node.get(n.needs)) : 0);
  const picked: SuiteCase[] = []; const unknown: string[] = []; const setupCases = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim().toUpperCase();
    if (!id) continue;
    if (id.startsWith("SETUP:")) { const n = node.get(`SETUP:${id.slice(6).toLowerCase()}`); if (n?.caseId) setupCases.add(n.caseId); continue; }
    const c = byId.get(id);
    if (c) picked.push(c); else unknown.push(raw);
  }
  for (const sc of setupCases) { const c = byId.get(sc.toUpperCase()); if (c && !picked.includes(c)) picked.push(c); }
  const PR: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  // a part's parts before it run first, whether or not they were ticked (a part continues from them)
  for (const c of [...picked]) { let p = c.prev; while (p) { const b = byId.get(p.toUpperCase()); if (b && !picked.includes(b)) picked.push(b); p = b?.prev; } }
  picked.sort((a, b) => (a.stage < 0 ? 9 : a.stage) - (b.stage < 0 ? 9 : b.stage) || depth(node.get(a.needs ?? "")) - depth(node.get(b.needs ?? "")) || (setupCases.has(b.id) ? 1 : 0) - (setupCases.has(a.id) ? 1 : 0) || PR[a.priority] - PR[b.priority] || a.id.localeCompare(b.id));
  return { ids: picked.map((c) => c.key), setupCases: [...setupCases], unknown };
}

/** The row the sheet runner runs — the sheet's own row, or a catalog / API case in the sheet's 13 columns, its exact request kept. */
export function runRow(key: string): SheetCase | null {
  const sc = suiteCase(key);
  if (!sc) return null;
  const want = sc.id.toUpperCase();
  const P: Record<Priority, string> = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low" };
  if (sc.part) return { id: sc.id, sheet: "regression", module: sc.module, scenario: sc.from, title: sc.title, role: sc.role, portal: /vendor/i.test(sc.role) ? "Vendor portal" : "Buyer portal", preconditions: sc.preconditions, configs: sc.configs, testData: sc.testData, steps: sc.steps, expected: sc.expected, priority: P[sc.priority], testType: sc.kind, status: "Not Run", layer: sc.layer };
  if (sc.source === "sheet") return sheetCases().find((c) => c.id.toUpperCase() === want && c.sheet === sc.from) ?? sheetCases().find((c) => c.id.toUpperCase() === want) ?? null;
  if (sc.source === "api") {
    const rec = apiLibrary().find((c) => c.id.toUpperCase() === want);
    const steps = rec
      ? [...(rec.steps?.length ? rec.steps.map((s) => s.replace(/^\d+[.)]\s*/, "")) : [`Send ${rec.method} ${rec.path}${rec.body ? ` with body ${JSON.stringify(rec.body)}` : ""}`]), `Expected: ${rec.expectedResult}`]
      : sc.steps;
    return { id: sc.id, sheet: "regression", module: sc.module, scenario: sc.from, title: sc.title, role: sc.role, portal: "API", preconditions: rec?.preconditions ?? sc.preconditions, configs: sc.configs, testData: "-", steps, expected: rec?.expectedResult ?? sc.expected, priority: P[sc.priority], testType: sc.kind, status: "Not Run", layer: "api" };
  }
  const cat = allCases().find((c) => c.id.toUpperCase() === want);
  const steps = cat ? splitSteps(cat.steps.replace(/`/g, "")) : sc.steps;
  return { id: sc.id, sheet: "regression", module: sc.module, scenario: cat?.section ?? sc.from, title: cat?.title ?? sc.title, role: sc.role, portal: sc.layer === "api" ? "API" : /vendor/i.test(sc.role) ? "Vendor portal" : "Buyer portal", preconditions: cat?.setup ?? sc.preconditions, configs: sc.configs, testData: "-", steps: cat ? (cat.steps.includes("1.") || cat.steps.includes("→") ? steps : [cat.steps]) : steps, expected: cat?.expected ?? sc.expected, priority: P[sc.priority], testType: sc.kind, status: "Not Run", layer: sc.layer, ...(cat?.oracle ? { oracle: cat.oracle } : {}) };
}
