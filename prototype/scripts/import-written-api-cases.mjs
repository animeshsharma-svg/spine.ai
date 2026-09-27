/**
 * Turn the WRITTEN API catalog into RUNNABLE cases, one journey per event type.
 *
 *   node scripts/import-written-api-cases.mjs
 *
 * data/test-cases.json holds 648 humanised cases (362 UI + 286 API) written as
 * prose: why / setup / steps / expected / oracle. They read well and they are
 * the specification, but they are not executable — the runner needs a method, a
 * path and a body. This script writes the executable half into
 * data/cases-src/events-written.json, which build-cases.mjs then merges into
 * data/api-cases.json alongside the hand-mined cases.
 *
 * ── Why one case can become four ─────────────────────────────────────────
 * The written catalog is organised by JOURNEY STAGE — "Creating stages",
 * "Activation", "Awarding" — not by event type. So "RFQ only" held three cases
 * while the RFQ journey was in fact described across six sections, written once
 * and meant for every type that has a pricing stage.
 *
 * A section is therefore either SHARED or FANNED OUT:
 *   SHARED     — the request is identical whatever the event type (creating the
 *                draft, line-item validation, the audience, the permission
 *                matrix). Emitted once, onto the shared feature. Copying these
 *                four times would be noise, not detail.
 *   FANNED OUT — the event type changes the request or the rule (which stage
 *                mode is created, what activation carries, whether there is a
 *                technical response to give or a bid to place). Emitted once per
 *                type whose journey actually contains that stage — so the
 *                technical-response cases never land on RFQ-only, and the bid
 *                cases never land on RFP-only.
 *
 * ── How a path is decided, in order ──────────────────────────────────────
 *   1. STATED   — the case's own prose names one ("`POST /v1/bids`").
 *   2. CARRIED  — it doesn't, but an earlier case in the SAME section did, and
 *                 the sections are written as a narrative: API-EG-002 says only
 *                 "Omit `status`", meaning the POST /event_groups two lines up.
 *   3. ANCHOR   — nothing stated yet in the section, so the section's anchor
 *                 endpoint is used (the one its title describes).
 * Every case records which, as `pathSource`, so a failure can be traced back to
 * whether we were told the endpoint or inferred it.
 *
 * ── Why most inferred cases assert "no-5xx" ─────────────────────────────
 * A case claiming `accept` while firing a generic body at an endpoint the prose
 * never named goes red for OUR reason, not the product's — and red here becomes
 * a bug report. `accept` is kept only where we can genuinely satisfy it (a GET,
 * or POST /event_groups, which the hand-mined library already proves accepts a
 * QA_Platform_ draft). Everything else that isn't a clear rejection asserts the
 * weaker, honest thing: the server answered without an untyped 500.
 *
 * Only endpoints on the runner's allowlist (src/checks/dynamicChecks.ts) are
 * emitted; anything else falls back to the section anchor, because a path off
 * that list is gated out at run time and would sit in the tree never running.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WRITTEN = join(here, "..", "data", "test-cases.json");
const OUT = join(here, "..", "data", "cases-src", "events-written.json");

const STAGE = "/trade/template_input?template_name=trade&additional_fields=order_details";

/**
 * The event types, and what each one's journey actually contains.
 *
 * `stages` is the real sequence a buyer builds, and it decides which fanned-out
 * sections reach this type: no technical stage means no technical-response
 * cases, no pricing stage means no bid cases.
 */
const TYPES = [
  { key: "rfp_only",    prefix: "RFPO", feature: "events.rfp_only",    label: "Technical / RFP only", stages: ["rfp"] },
  { key: "rfq_only",    prefix: "RFQO", feature: "events.rfq_only",    label: "RFQ only",             stages: ["rfq"] },
  { key: "rfp_rfq",     prefix: "RFPQ", feature: "events.rfp_rfq",     label: "Technical + RFQ",      stages: ["rfp", "rfq"] },
  { key: "rfp_auction", prefix: "RFPA", feature: "events.rfp_auction", label: "Technical + Auction",  stages: ["rfp", "auction"] },
];
const hasTechnical = (t) => t.stages.includes("rfp");
const hasPricing   = (t) => t.stages.includes("rfq") || t.stages.includes("auction");
const hasAuction   = (t) => t.stages.includes("auction");
/** The stage a pricing/bidding case runs against for this type. */
const pricingStage = (t) => (t.stages.includes("auction") ? "auction" : "rfq");

/**
 * Section → its place in the journey, its anchor endpoint, and whether the
 * event type changes it.
 *
 * `step` is the order a buyer reaches this section, which is NOT the order the
 * sections are numbered in: the audience is chosen before activation, though
 * activation is written up first.
 */
const SECTIONS = {
  1:  { step: 0,  fan: false, feature: "platform.configurations", method: "GET",   path: "/v1/dashboard_configuration" },
  2:  { step: 1,  fan: false, feature: "events.config",           method: "POST",  path: "/event_groups" },
  // The only two sections the event TYPE actually changes: which stage mode is
  // built, and what activation carries. These fan out, onto the type's feature.
  3:  { step: 2,  fan: "stage", method: "POST",  path: STAGE },
  5:  { step: 3,  fan: false, feature: "events.validation",        method: "POST",  path: "/event_groups" },
  6:  { step: 4,  fan: false, feature: "events.invite_vendors",   method: "POST",  path: "/v1/trade/add_audience?id={{tradeId}}" },
  4:  { step: 5,  fan: "all",  method: "PATCH", path: "/event_groups/{{eventGroupUuid}}" },
  // Downstream, the request is the same whatever the type — one technical
  // response, one bid, one award. Copying them per type would add rows, not
  // coverage, and would empty the Bidding and Awarding groups of their cases.
  7:  { step: 6,  fan: false, feature: "bids.participation",      method: "POST",  path: "/template_responses/create_surrogate_response" },
  8:  { step: 7,  fan: false, feature: "bids.place",              method: "POST",  path: "/bids/template_input" },
  9:  { step: 8,  fan: false, feature: "bids.surrogate",          method: "POST",  path: "/bids/template_input" },
  10: { step: 9,  fan: false, feature: "auction.convert",         method: "POST",  path: "/trade/move_to_auction" },
  11: { step: 10, fan: false, feature: "award.proposal",          method: "POST",  path: "/proposal" },
  12: { step: 11, fan: false, feature: "events.lifecycle",        method: "GET",   path: "/event_groups/{{eventGroupUuid}}" },
  13: { step: 12, fan: false, feature: "users.permissions",       method: "GET",   path: "/event_groups/{{eventGroupUuid}}" },
  14: { step: 13, fan: false, feature: "events.validation",        method: "POST",  path: "/event_groups" },
  15: { step: 14, fan: false, feature: "events.lifecycle",        method: "GET",   path: "/event_groups/{{eventGroupUuid}}" },
  16: { step: 15, fan: false, feature: "platform.audit",          method: "GET",   path: "/orders" },
};

/** Which types a fanned-out case reaches. */
function typesFor(sec, c) {
  if (sec.fan === "all") return TYPES;
  if (sec.fan === "technical") return TYPES.filter(hasTechnical);
  if (sec.fan === "pricing") return TYPES.filter(hasPricing);
  if (sec.fan === "auction") return TYPES.filter(hasAuction).concat(TYPES.filter((t) => t.key === "rfq_only"));
  if (sec.fan === "stage") {
    // A stage case belongs to the types that build the stage it describes.
    const hay = `${c.title} ${c.steps}`;
    if (/knockout|dutch|basket|rank strateg|price strateg|\bauction\b/i.test(hay)) return TYPES.filter(hasAuction);
    if (/\bRFQ\b|pricing stage/i.test(hay)) return TYPES.filter((t) => t.stages.includes("rfq"));
    if (/\bRFP\b|technical|\bRFI\b/i.test(hay)) return TYPES.filter(hasTechnical);
    return TYPES;  // a rule about stages in general
  }
  return [];
}

/**
 * Sharpen a shared case onto a more exact feature WITHIN its own family.
 *
 * Scoped per section on purpose: a global rule list sends any bid case that
 * happens to say "product" to events.validation. A section only ever refines
 * into its own neighbourhood.
 */
const REFINE_BY_SECTION = {
  2: [
    [/\bboq\b|bill of quantit/i,                 "events.boq"],
    [/\btemplate\b(?!_input)|pricing sheet/i,    "events.templates"],
    [/line item|quantity|serial number/i,        "events.validation"],
    [/permission|authori[sz]/i,                  "users.permissions"],
  ],
  5: [
    [/\bboq\b|bill of quantit/i,                 "events.boq"],
    [/\bversion(ing|ed)?\b/i,                    "events.versioning"],
  ],
  6: [[/reject|remove|decline/i,                 "events.invite_vendors"]],
  7: [
    [/evaluat|score|scoring|\bT1\b|\bT2\b/i,     "evaluation.score"],
    [/\bTNA\b|technically not acceptable/i,      "evaluation.tna"],
    [/surrogate/i,                               "bids.surrogate"],
  ],
  8: [
    [/price cap|ceiling/i,                       "bids.price_cap"],
    [/counter.?offer/i,                          "bids.counter_offer"],
    [/revise|resubmit|submit/i,                  "bids.submit"],
    [/quick.?fill/i,                             "bids.quick_fill"],
    [/decline|participat/i,                      "bids.participation"],
    [/increment/i,                               "auction.increments"],
    [/visibilit|cannot see|other vendor/i,       "auction.visibility"],
  ],
  9: [[/price cap|ceiling/i,                     "bids.price_cap"],
      [/audit|trail|who placed/i,                "bids.surrogate"]],
  10: [
    [/dynamic extension|sniping/i,               "auction.dynamic_extension"],
    [/increment/i,                               "auction.increments"],
    [/rank/i,                                    "auction.rank"],
    [/\bprice\b strateg|price.based/i,           "auction.price"],
  ],
  11: [
    [/partial(ly)? award|split/i,                "award.partial"],
    [/approv|send back|reject the award/i,       "award.approval"],
    [/re.evaluat/i,                              "award.re_evaluation"],
    [/submit/i,                                  "award.submit"],
    [/add_response|allocat|response/i,           "award.add_response"],
    [/\bQCS\b|\bMQCS\b|comparison/i,             "evaluation.qcs"],
  ],
  12: [
    [/extend|reopen|deadline/i,                  "events.extend_deadline"],
    [/\bversion(ing|ed)?\b/i,                    "events.versioning"],
  ],
  14: [
    [/\bboq\b/i,                                 "events.boq"],
    [/audience|participant/i,                    "events.invite_vendors"],
  ],
  15: [[/audience|participant/i,                 "events.invite_vendors"],
       [/line item/i,                            "events.validation"]],
  16: [[/permission|role|authori[sz]/i,          "users.permissions"],
       [/\bERP\b/i,                              "platform.erp"]],
};

/** The runner's allowlist, mirrored. A path not matching one of these is gated out. */
const ALLOWED = [
  ["GET",   /^\/orders(\/[^/]+)?(\?|$)/],
  ["GET",   /^\/event_groups\/[^/]+(\/[a-z_]+)?(\?|$)/],
  ["GET",   /^\/trade\/[^/]+(\?|$)/],
  ["GET",   /^\/v1\/trade\/[^/]+\/[a-z_]+(\?|$)/],
  ["GET",   /^\/purchase_requests(\/[^/]+)?(\?|$)/],
  ["GET",   /^\/get_all_users(\?|$)/],
  ["GET",   /^\/companies\/(all_vendors|vendorlist_filtered)(\?|$)/],
  ["GET",   /^\/v1\/dashboard_configuration(\?|$)/],
  ["GET",   /^\/templates(\/|\?|$)/],
  ["POST",  /^\/event_groups$/],
  ["POST",  /^\/trade\/template_input(\?|$)/],
  ["POST",  /^\/trade\/move_to_auction$/],
  ["POST",  /^\/v1\/trade\/add_audience(\?|$)/],
  ["POST",  /^\/template_responses(\/[^/]+\/create_page_responses)?$/],
  ["POST",  /^\/template_responses\/create_surrogate_response$/],
  ["POST",  /^\/bids\/template_input$/],
  ["POST",  /^\/v1\/bids$/],
  ["POST",  /^\/v1\/bids\/[^/]+\/create_bid_products$/],
  ["POST",  /^\/evaluations(\/submit)?$/],
  ["POST",  /^\/proposal$/],
  ["POST",  /^\/proposal\/[^/]+\/(add_response|approval_workflows|submit)(\?|$)/],
  ["POST",  /^\/item_versions$/],
  ["PATCH", /^\/event_groups\/[^/]+$/],
  ["PATCH", /^\/v1\/bids\/[^/]+$/],
];
const isAllowed = (method, path) => ALLOWED.some(([m, re]) => m === method && re.test(path));

const VERB = /\b(GET|POST|PATCH|PUT|DELETE)\b\s*`?\s*(\/[A-Za-z0-9_/{}.:%?=&\-]+)/;

/** Put a written path into the shape the runner uses. */
function normalisePath(raw) {
  let p = raw.replace(/[`.,;]+$/, "");
  p = p.replace(/^\/api(?=\/)/, "");   // written as /api/event_groups; runner uses /event_groups
  if (/^\/trade\/template_input/.test(p)) return STAGE;
  if (/^\/v1\/trade\/add_audience/.test(p)) return "/v1/trade/add_audience?id={{tradeId}}";
  p = p.replace(/\/v1\/bids\/(:[a-z_]+|\{[a-z_]+\})/i, "/v1/bids/{{bidUuid}}");
  p = p.replace(/\/proposal\/(:[a-z_]+|\{[a-z_]+\})/i, "/proposal/{{proposalUuid}}");
  p = p.replace(/\/event_groups\/(:[a-z_]+|\{[a-z_]+\})/i, "/event_groups/{{eventGroupUuid}}");
  p = p.replace(/\/trade\/(:[a-z_]+|\{[a-z_]+\})/i, "/trade/{{tradeId}}");
  p = p.replace(/\/(:[a-z_]+|\{[a-z_]+\})(?=\/|$)/gi, "/{{tradeId}}");
  return p;
}

const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Case";

/** A body whose SHAPE the endpoint accepts, specialised to the event type. */
function bodyFor(method, path, c, type) {
  if (method === "GET") return undefined;
  const tag = type ? type.prefix : "SHARED";
  const title = `QA_Platform_${tag}_${slug(c.title)}_{{stamp}}`;
  if (path === "/event_groups")
    return {
      status: "draft",
      title,
      line_items: [{
        product_uuid: "{{productUuid}}",
        product_quality_uuid: "{{productQualityUuid}}",
        quantity: { unitSymbol: "Nos", value: 10 },
      }],
    };
  if (path === STAGE) {
    // The stage this case is really about, for this type.
    const hay = `${c.title} ${c.steps}`;
    let mode = type ? type.stages[type.stages.length - 1] : "rfq";
    if (/\bRFP\b|technical|\bRFI\b/i.test(hay) && type && hasTechnical(type)) mode = "rfp";
    else if (/knockout|dutch|\bauction\b/i.test(hay) && type && hasAuction(type)) mode = "auction";
    const b = { event_group_uuid: "{{eventGroupUuid}}", stage_no: 1, rfx_mode: mode, title };
    if (mode === "auction") {
      b.auction_config = /dutch/i.test(hay) ? "dutch" : /knockout/i.test(hay) ? "knockout"
        : /price strateg/i.test(hay) ? "price" : "rank";
    }
    return b;
  }
  if (/^\/event_groups\/\{\{eventGroupUuid\}\}$/.test(path))
    return { status: "active", draft_trade_request_uuids: ["{{tradeId}}"] };
  if (path === "/trade/move_to_auction")
    return { trade_request_id: "{{tradeId}}", auction_config: "rank", title };
  if (path.startsWith("/v1/trade/add_audience")) return { audience_company_uuids: ["{{vendorUuid}}"] };
  if (path === "/bids/template_input")
    return {
      trade_request_uuid: "{{tradeId}}",
      company_uuid: "{{vendorUuid}}",
      currency_preference: false,
      sheets: { inline_components: { data: { "{{vendorUuid}}": [{
        product: { uuid: "{{productUuid}}" },
        price: { key: "price", value: "100" },
        participant_quantity: { key: "participant_quantity", value: "10" },
      }] } } },
    };
  if (path === "/v1/bids") return { trade_request_uuid: "{{tradeId}}", company_uuid: "{{vendorUuid}}" };
  if (path === "/proposal") return { event_group_uuid: "{{eventGroupUuid}}" };
  if (/add_response/.test(path))
    return { company_uuid: "{{vendorUuid}}", event_group_line_item_uuid: "{{eventGroupUuid}}", quantity: 1 };
  if (path === "/template_responses/create_surrogate_response")
    return { trade_request_uuid: "{{tradeId}}", company_uuid: "{{vendorUuid}}", responses: [] };
  if (path.startsWith("/evaluations")) return { trade_request_uuid: "{{tradeId}}", company_uuid: "{{vendorUuid}}" };
  return {};
}

/**
 * THE CHANGE EACH CASE IS ACTUALLY ABOUT.
 *
 * `bodyFor` builds ONE valid body per endpoint — the shape the endpoint
 * accepts — and the verdict is read from the prose. For a case that describes a
 * refusal, those two facts together are a trap: the prose says "is refused", the
 * payload is perfectly valid, the API answers 200, and the run reports
 * "ACCEPTED input that should have been rejected". That is a failure about us,
 * not about the product, and it is the single biggest source of noise this
 * import has produced.
 *
 * So the case's own perturbation is written down here, once, against the
 * written id — omit the field, fabricate the id, send 501 of them — and applied
 * to the generic body on the way out. A case with an entry here tests what it
 * says it tests.
 *
 * `notRunnable` is the honest half. Some cases need state the public API cannot
 * build inside one run: an event with a newer version, an attachment owned by
 * another company, a caller holding different permissions. Those carry a reason
 * instead of a payload, and the runner reports them as not-run with it — which
 * is true, where "the product accepted it" would not be.
 *
 * Anything with no entry is caught by the borrowed-request detector in
 * `src/checks/caseLibrary.ts` and held out of runs with a reason, so a missing
 * entry costs coverage, never correctness.
 */
const FABRICATED_EVENT_GROUP = "QA00Fabricated";
const FABRICATED_PRODUCT = "QA00FabricatedProduct";

/** Drops keys from the generic body — for the "omit X" cases. */
const omit = (...keys) => (b) => Object.fromEntries(Object.entries(b).filter(([k]) => !keys.includes(k)));
/** Rewrites the single line item the generic body carries. */
const withLineItem = (patch) => (b) => ({
  ...b,
  line_items: (b.line_items ?? []).map((li) => ({ ...li, ...patch })),
});

const PERTURBATIONS = {
  // ── §2 creating the draft event group (POST /event_groups) ──────────────
  "API-EG-002": { body: omit("status") },
  "API-EG-003": { body: (b) => ({ ...b, line_items: [] }) },
  "API-EG-004": { body: (b) => ({ ...b, line_items: [], config: { boq_based_rfx: true } }) },
  "API-EG-005": {
    body: (b) => ({ ...b, line_items: [], config: { boq_based_rfx: true } }),
    preconditions:
      "Authenticated buyer on a workspace where boq_in_erfx_allowed is off — the refusal under test is that flag's.",
  },
  "API-EG-006": {
    notRunnable:
      "needs a purchase-request line item in the dormant-locked state, which cannot be put there through the public API in one run",
  },
  "API-EG-007": {
    notRunnable:
      "needs a caller WITHOUT trade create_record permission; this run is authenticated as a buyer who has it",
  },
  "API-EG-011": {
    notRunnable:
      "needs a payload that passes the controller's parameter guards and then fails the model's own validation — a state we cannot construct deliberately without knowing the model's current rules",
  },
  "API-EG-012": { body: (b) => ({ ...b, line_items: "not-an-array" }) },
  "API-EG-013": { body: withLineItem({ product_uuid: FABRICATED_PRODUCT }) },
  "API-EG-014": {
    notRunnable: "needs a product uuid belonging to a DIFFERENT company, which this run has no access to",
  },
  "API-EG-015": { body: withLineItem({ quantity: { unitSymbol: "Nos", value: 0 } }) },
  "API-EG-016": { body: withLineItem({ quantity: { unitSymbol: "Nos", value: "abc" } }) },
  "API-EG-017": { body: withLineItem({ quantity: { value: 10 } }) },

  // ── §4 activation (PATCH /event_groups/{{eventGroupUuid}}) ──────────────
  // Not a rejection case at all: it documents "either 200, or a typed
  // {code,message} failure", and fails only on an untyped 500. The prose
  // regex read "fails"/"error code" and typed it as a rejection, so a correct
  // 200 was reported as the product accepting something it should refuse.
  "API-PUB-002": { expected: "no-5xx" },
  "API-PUB-008": {
    // The cap is on the count, so 501 real vendor uuids test it without
    // needing 501 real vendors: the same invited company, 501 times.
    body: (b) => ({ ...b, audience_company_uuids: Array.from({ length: 501 }, () => "{{vendorUuid}}") }),
  },
  "API-PUB-010": { path: () => `/event_groups/${FABRICATED_EVENT_GROUP}` },
  "API-PUB-011": {
    notRunnable:
      "needs an event group that has been superseded by a newer version; versioning an event and then activating the older one is a fixture this run does not build",
  },
  "API-PUB-012": {
    notRunnable: "needs an attachment URL owned by ANOTHER company, which this run has no access to",
  },
  "API-PUB-013": {
    notRunnable:
      "needs a caller WITHOUT update permission on the event; this run is authenticated as a buyer who has it",
  },
  "API-PUB-015": {
    notRunnable:
      "needs a two-stage draft whose RFP ends after its RFQ — the stage schedules are set when the stages are built, which this case does not do",
  },
  "API-PUB-022": {
    body: (b) => ({ ...b, terms_and_conditions: { attachments: [{ value: [] }] } }),
  },
};

/**
 * Prose that documents a refusal.
 *
 * Deliberately generous — "Refused.", "Rejected with…", "422, code 511" all
 * count — because what it decides is no longer "assert a 4xx". It decides
 * whether the case DOCUMENTS a refusal; whether we can CHECK for one depends on
 * whether the request actually carries the change under test, which is the next
 * question down.
 */
const REJECT = /\b(4\d\d|refus\w*|reject\w*|deni\w*|forbidden|blocked|must not|cannot|can't|is not allowed|not permitted|fails?|error code|invalid|unauthori[sz]ed)\b/i;
const ACCEPT = /\b(200|201|succeed|success|is created|is saved|returns a|carries over)\b/i;

function stepsArray(c) {
  const parts = String(c.steps).split(/(?<=[.?!])\s+(?=[A-Z`])/).map((s) => s.trim()).filter(Boolean);
  return (parts.length ? parts : [String(c.steps).trim()]).map((s, i) => `${i + 1}. ${s}`);
}

function sharedFeature(sec, c) {
  const hay = `${c.title} ${c.steps} ${c.why}`;
  for (const [re, feature] of REFINE_BY_SECTION[c.sectionNo] ?? []) if (re.test(hay)) return feature;
  return sec.feature;
}

// ── read, resolve endpoints, emit ────────────────────────────────────────
const written = JSON.parse(readFileSync(WRITTEN, "utf8")).cases.filter((c) => c.layer === "api");
written.sort((a, b) => a.sectionNo - b.sectionNo || a.id.localeCompare(b.id));

const tally = { stated: 0, carried: 0, anchor: 0 };
const resolved = [];
let carried = null;
let section = null;

for (const c of written) {
  const sec = SECTIONS[c.sectionNo];
  if (!sec) continue;
  if (section !== c.sectionNo) { section = c.sectionNo; carried = null; }  // the narrative restarts

  const prose = `${c.steps} ${c.oracle} ${c.expected} ${c.setup ?? ""}`;
  const m = prose.match(VERB);
  let method, path, pathSource;
  if (m) {
    const cand = normalisePath(m[2]);
    const verb = m[1].toUpperCase();
    if (isAllowed(verb, cand)) { method = verb; path = cand; pathSource = "stated"; }
  }
  if (!path && carried) { ({ method, path } = carried); pathSource = "carried"; }
  if (!path) { method = sec.method; path = sec.path; pathSource = "anchor"; }
  if (pathSource === "stated") carried = { method, path };
  tally[pathSource]++;

  resolved.push({ c, sec, method, path, pathSource });
}

const out = [];
for (const { c, sec, method, path, pathSource } of resolved) {
  const verdictText = `${c.expected} ${c.oracle}`;
  const satisfiable = method === "GET" || path === "/event_groups";
  const perturb = PERTURBATIONS[c.id];
  const documentsRefusal = REJECT.test(verdictText);
  const carriesItsChange = !!(perturb?.body || perturb?.path);

  /**
   * ASSERT A REFUSAL ONLY WHEN WE ACTUALLY SEND SOMETHING REFUSABLE.
   *
   * A case documenting "422, code 2 — status is missing" is only testing that
   * if `status` is missing from the request. Where the perturbation is written
   * down (PERTURBATIONS) it is, and the case asserts the refusal properly.
   * Where it is not, the payload is the endpoint's generic valid one — the API
   * is RIGHT to answer 200 — so asserting a refusal would manufacture a bug
   * report against working software. Those keep the weaker, true assertion
   * (the server answered without an untyped 500) and carry `weakReason`, which
   * the report prints, so nobody reads that pass as "the refusal works".
   */
  const expected = documentsRefusal && carriesItsChange ? "reject"
    : documentsRefusal ? "no-5xx"
    : ACCEPT.test(verdictText) && satisfiable ? "accept"
    : "no-5xx";

  // Not for a case whose type was corrected by hand (PERTURBATIONS sets
  // `expected`): there the prose reads like a refusal but the case is not one,
  // so "we could not check the refusal" would be about a refusal it never
  // claimed. And not for one held out of runs, which says its own reason.
  const weakReason =
    documentsRefusal && !carriesItsChange && !perturb?.expected && !perturb?.notRunnable
      ? `This case documents a refusal, but the request sent is the generic valid payload for ` +
        `${method} ${path} — the change it describes (${stepsArray(c)[0]
          .replace(/^\d+\.\s*/, "")
          .replace(/[`]/g, "")
          .trim()}) is not in it. So all this run can honestly check is that the server answered ` +
        `without an untyped 500. Write the perturbation into PERTURBATIONS in ` +
        `scripts/import-written-api-cases.mjs and the case asserts the refusal itself.`
      : undefined;

  const base = {
    title: c.title,
    type: expected === "reject" ? "Negative" : expected === "accept" ? "Functional" : "Robustness",
    priority: c.priority === "P3" ? "P2" : c.priority,
    severity: c.priority === "P0" ? "Critical" : c.priority === "P1" ? "High" : "Medium",
    preconditions: c.setup || "Authenticated buyer on the company under test.",
    steps: stepsArray(c),
    method,
    expected,
    expectedResult: `${c.expected} ${c.oracle}`.replace(/\s+/g, " ").trim(),
    rationale: c.why,
    ...(weakReason ? { weakReason } : {}),
    pathSource,
    journeyStep: sec.step,
    writtenRef: `${c.id} · §${c.sectionNo} ${c.section}`,
  };

  // The case's own change, applied to the generic body — see PERTURBATIONS.
  const emit = (extra) => {
    const body = bodyFor(method, path, c, extra.type ?? null);
    const record = {
      ...base,
      ...extra.identity,
      path: perturb?.path ? perturb.path(path) : path,
      body: perturb?.body && body ? perturb.body(body) : body,
    };
    if (perturb?.expected) {
      record.expected = perturb.expected;
      record.type = perturb.expected === "reject" ? "Negative" : perturb.expected === "accept" ? "Functional" : "Robustness";
    }
    if (perturb?.preconditions) record.preconditions = perturb.preconditions;
    if (perturb?.notRunnable) record.notRunnable = perturb.notRunnable;
    // A case carrying its perturbation is no longer an inferred request; say so
    // rather than leaving it labelled as borrowed from the section anchor.
    if (perturb?.path || perturb?.body) record.pathSource = "perturbed";
    out.push(record);
  };

  if (!sec.fan) {
    emit({ identity: { id: c.id, feature: sharedFeature(sec, c) } });
    continue;
  }
  for (const type of typesFor(sec, c)) {
    emit({
      type,
      identity: {
        id: `${type.prefix}-${c.id.replace(/^API-/, "")}`,
        feature: type.feature,
        title: `[${type.label}] ${c.title}`,
        eventType: type.key,
      },
    });
  }
}

// Journey order, then the written order inside a step. build-cases.mjs keeps it.
out.sort((a, b) => a.journeyStep - b.journeyStep || a.id.localeCompare(b.id));

writeFileSync(OUT, JSON.stringify(out, null, 2));

const byFeature = {};
for (const c of out) byFeature[c.feature] = (byFeature[c.feature] ?? 0) + 1;
console.log(`✅ ${out.length} runnable cases from ${written.length} written → data/cases-src/events-written.json`);
console.log(`   endpoint from: ${tally.stated} stated · ${tally.carried} carried · ${tally.anchor} anchor`);
for (const [f, n] of Object.entries(byFeature).sort()) console.log(`     ${String(n).padStart(4)}  ${f}`);
