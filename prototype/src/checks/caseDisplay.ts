/**
 * ONE WAY TO SHOW A TEST CASE.
 *
 * The platform has test cases from five places — the written catalog, the
 * edge-case library (EDGE-*), the mined API library (data/api-cases.json),
 * the field checks on every journey request, and the journey steps
 * themselves — and each wrote its own words. Some are English ("A PNG image
 * is refused"); some are identifiers ("QA_Platform_publish_title_as_number_
 * raises_500"); some explain themselves in Ruby ("UpdateService#initialize
 * is Sorbet-typed…"). A person reading the dashboard should not have to know
 * which source a case came from to understand it.
 *
 * So every surface asks this module, and gets the same shape back:
 *
 *   title · area · priority · type · preconditions · steps · expected
 *   · actual · verdict + one-sentence reason
 *
 * all in plain English, plus `details` — the id, the request, the body, the
 * status, the error code and message, the file:line of the rule — for anyone
 * who wants the technical part. Nothing is lost: whatever is simplified in
 * the main text is kept verbatim in the details.
 *
 * Deterministic: a glossary and a handful of sentence rules. No LLM, and it
 * never invents a fact — when a sentence cannot be made plain it is made
 * clean from the words that are there.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE_TREE } from "../../config/featureTree.js";
import { allCases, type CatalogCase } from "./testCatalog.js";
import { heldCases, loadCases, type TestCaseRecord } from "./caseLibrary.js";
import { MADE_WORD, fieldPhrase, leafWord, words } from "./humanize.js";
import { STEP_META, stepKindForCase, type StepKind } from "./journeyModel.js";

const here = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(here, "..", "..", "..", "procol-backend");

// ── the shape every surface renders ────────────────────────────────────────

export type VerdictWord = "Passed" | "Failed" | "Couldn't tell" | "Not run";

export interface DetailRow {
  label: string;
  value: string;
  /** "code" = one line of monospace, "block" = a preformatted block (JSON, curl) */
  kind?: "text" | "code" | "block";
}

export interface CaseDisplay {
  /** the case id — shown only as a muted reference, never as the headline */
  ref: string;
  title: string;
  /** the module / feature in the product's own words */
  area: string;
  /** "P0 · critical" */
  priority: string;
  /** Positive / Negative / Edge / Boundary / Security / Workflow */
  type: string;
  preconditions: string;
  steps: string[];
  expected: string;
  /** why the case exists, when its author said */
  why?: string;
  actual?: string;
  verdict?: VerdictWord;
  /** one sentence: why this verdict */
  reason?: string;
  details: DetailRow[];
}

// ── words ──────────────────────────────────────────────────────────────────

const PRIORITY_WORD: Record<string, string> = { P0: "critical", P1: "high", P2: "medium", P3: "low" };
export function priorityInWords(p: string | undefined): string {
  const k = String(p ?? "").trim().toUpperCase();
  if (!k) return "";
  return PRIORITY_WORD[k] ? `${k} · ${PRIORITY_WORD[k]}` : k;
}

/** Source types → the six a tester uses. */
export function typeInWords(type: string | undefined, expected?: string, title = ""): string {
  const t = String(type ?? "").toLowerCase().replace(/[_-]/g, " ").trim();
  if (/security/.test(t)) return "Security";
  if (/boundary/.test(t)) return "Boundary";
  if (/workflow|plan step|po flow|journey/.test(t)) return "Workflow";
  if (/edge|robust/.test(t)) return "Edge";
  if (/negative|validation/.test(t)) return "Negative";
  if (/functional|positive/.test(t)) return expected === "reject" ? "Negative" : "Positive";
  if (/non functional/.test(t)) return "Edge";
  // No type given: read it from the title, the way a tester would label it.
  const s = title.toLowerCase();
  if (/inject|xss|another (tenant|company)|cross.tenant|cannot reach|(without|no|lacks?) (the )?permission|unauthori|not allowed to|without (a )?session|forged|leak/.test(s)) return "Security";
  if (/\b(cap|capped|limit|maximum|minimum|at most|at least|exactly \d+|\d+ characters|boundary|zero|501|500 )\b/.test(s)) return "Boundary";
  if (/refus|reject|block|cannot|can't|not accepted|is required|must not|invalid|missing|without\b|error/.test(s)) return "Negative";
  if (/crash|does not break|hostile|malformed|garbage|unknown|wrong type|as a string/.test(s)) return "Edge";
  return "Positive";
}

const FEATURE_AREA = new Map<string, string>();
for (const g of FEATURE_TREE) {
  FEATURE_AREA.set(g.id, g.label);
  for (const c of g.children) FEATURE_AREA.set(c.id, `${g.label} › ${c.label}`);
}
/** "events.publish" → "Sourcing events › Publish event" */
export function areaOfFeature(feature: string | undefined, fallback = ""): string {
  if (!feature) return fallback;
  if (FEATURE_AREA.has(feature)) return FEATURE_AREA.get(feature)!;
  const group = feature.split(".")[0];
  if (FEATURE_AREA.has(group)) return `${FEATURE_AREA.get(group)} › ${cap(words(feature.split(".").slice(1).join(" ")))}`;
  return fallback || cap(words(feature.replace(/\./g, " ")));
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ── the app's own error messages (read from the backend, read-only) ────────

let ERR: Map<string, string> | null = null;
/** Procol's error code → its message, from config/locales/en-IN.yml. */
export function errorMessage(code: string | number | undefined): string | undefined {
  if (code === undefined || code === null || code === "") return undefined;
  if (!ERR) {
    ERR = new Map();
    try {
      if (existsSync(BACKEND)) {
        const yml = execFileSync("git", ["-C", BACKEND, "show", "origin/main:config/locales/en-IN.yml"], {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
        const start = yml.indexOf("\n  api_errors:");
        const body = start >= 0 ? yml.slice(start) : "";
        const re = /\n {4}"(\d+)":\s*\n\s+"?message"?:\s*"((?:[^"\\]|\\.)*)"/g;
        for (const m of body.matchAll(re)) if (!ERR.has(m[1])) ERR.set(m[1], m[2].replace(/\\"/g, '"'));
      }
    } catch {
      /* no backend checkout — messages are simply not looked up */
    }
  }
  return ERR.get(String(code));
}

// ── ids, placeholders and endpoints, in words ──────────────────────────────

/** {{eventGroupUuid}} → "the event" */
const PLACEHOLDER_WORD: Record<string, string> = {
  eventGroupUuid: "the event",
  eventGroupId: "the event",
  tradeId: "the round",
  tradeUuid: "the round",
  pricingTradeUuid: "the pricing round",
  technicalTradeUuid: "the technical round",
  auctionTradeUuid: "the auction round",
  vendorUuid: "the vendor",
  vendorCompanyUuid: "the vendor's company",
  bidUuid: "the vendor's bid",
  proposalUuid: "the award proposal",
  lineItemUuid: "the line item",
  productUuid: "the product",
  prItemId: "the purchase request item",
  prId: "the purchase request",
  intakeId: "the intake",
  stamp: "a unique stamp",
  vbuSheet: "the prepared spreadsheet",
  companyUuid: "the company",
  userUuid: "the user",
  rfpTradeId: "the technical (RFP) round",
  rfqTradeId: "the pricing (RFQ) round",
  evalFormUuid: "the evaluation form",
  productQualityUuid: "the product's quality",
  locationUuid: "the delivery location",
  templateResponseUuid: "the vendor's technical response",
  techPageUuid: "the technical form page",
  techFormUuid: "the technical form",
  vendorCompanyId: "the vendor's company",
  familyUuid: "the product family",
  categoryUuid: "the product category",
  orderUuid: "the purchase order",
  teamUuid: "the team",
  cityUuid: "the city",
  profile: "the vendor profile",
  gst: "a test GST number",
  pan: "a test PAN",
};
function placeholderWord(name: string): string {
  if (PLACEHOLDER_WORD[name]) return PLACEHOLDER_WORD[name];
  if (/^vat[A-Z]$/.test(name)) return "a test tax number";
  if (MADE_WORD[name]) return MADE_WORD[name];
  return `the ${words(name.replace(/(Uuid|Id)$/, ""))}`;
}

/** What a request does, as a noun phrase: "the request that publishes the event". */
const ENDPOINTS: Array<[RegExp, RegExp | null, string]> = [
  [/^PATCH$/, /^\/event_groups\/[^/]+$/, "the request that updates (and publishes) the event"],
  [/^POST$/, /^\/event_groups$/, "the request that creates the event"],
  [/^GET$/, /^\/event_groups\/[^/]+\/get_audience$/, "the request that lists the event's vendors"],
  [/^GET$/, /^\/event_groups\/[^/]+\/get_line_items$/, "the request that lists the event's line items"],
  [/^GET$/, /^\/event_groups\/[^/]+$/, "the request that reads the event"],
  [/^GET$/, /^\/(api\/)?event_groups$/, "the request that lists events"],
  [/./, /^\/trade\/template_input$/, "the request that adds a round to the event"],
  [/^(PATCH|PUT)$/, /^\/trade\/[^/]+$/, "the request that updates the round"],
  [/^GET$/, /^\/trade\/[^/]+$/, "the request that reads the round"],
  [/./, /^\/trade\/move_to_auction$/, "the request that converts a round into an auction"],
  [/./, /^\/v1\/trade\/add_audience$/, "the request that invites vendors to a round"],
  [/./, /^\/v1\/bulk_create_vendor$/, "the vendor bulk-upload request"],
  [/./, /^\/intake_requests/, "the intake request call"],
  [/./, /^\/purchase_requests/, "the purchase request call"],
  [/./, /^\/purchase_orders|^\/orders\/[^/]+/, "the purchase order call"],
  [/./, /^\/proposal/, "the award proposal call"],
  [/./, /^\/(v1\/)?bids/, "the bid call"],
  [/./, /^\/evaluations/, "the evaluation call"],
  [/./, /^\/template_responses/, "the technical response call"],
  [/./, /^\/item_versions/, "the request that issues a new version"],
  [/./, /^\/product_categories/, "the category call"],
  [/./, /^\/products/, "the product call"],
  [/./, /^\/buyer_hubs/, "the location call"],
  [/./, /^\/teams/, "the team call"],
  [/./, /users/, "the user call"],
  [/./, /^\/companies|vendor/, "the vendor call"],
];
export function endpointInWords(method: string, path: string): string {
  const m = String(method ?? "").toUpperCase();
  const p = String(path ?? "").split("?")[0].replace(/\{\{[^}]+\}\}/g, "x").replace(/\/:[a-z_]+/g, "/x").replace(/^\/api(?=\/)/, "");
  for (const [mm, re, phrase] of ENDPOINTS) if ((!m || mm.test(m)) && re && re.test(p)) return phrase;
  const kind = stepKindForCase(m, p);
  if (kind) return `the “${STEP_META[kind].title.toLowerCase()}” request`;
  const noun = p.split("/").filter((s) => s && s !== "x" && !/^v\d$/.test(s)).slice(0, 2).map(words).join(" ");
  return noun ? `the ${noun} request` : "the request";
}

/**
 * A Procol reference id: 8 characters of base64 ("UWtaY3BO", "Z2REZ2Q=",
 * "a1paUQ=="), always with an upper-case letter and a digit or padding.
 */
const ID_TOKEN =
  /(?<![\w@.\/+=-])(?=[A-Za-z0-9+\/]*[A-Z])(?=[A-Za-z0-9+\/]*(?:\d|=))(?:[A-Za-z0-9+\/]{8}|[A-Za-z0-9+\/]{7}=|[A-Za-z0-9+\/]{6}==)(?![\w@.+\/=-])/g;
/** Test-record names the platform creates: QA_Platform_…, API_Journey_…, API_Test_… */
const TEST_NAME = /“(API_Journey|QA_Platform|API_Test)[^”]*”|"(API_Journey|QA_Platform|API_Test)[^"]*"/g;

export function looksLikeId(s: string): boolean {
  ID_TOKEN.lastIndex = 0;
  const ok = ID_TOKEN.test(s) && s.replace(ID_TOKEN, "").trim() === "";
  ID_TOKEN.lastIndex = 0;
  return ok;
}

/**
 * Take the ids out of a sentence and say what they are.
 * `known` maps an id value to its name ("RFFEY0RO" → "the event").
 */
export function scrubIds(text: string | undefined, known: Record<string, string> = {}): string {
  let s = String(text ?? "");
  if (!s) return s;
  s = s.replace(TEST_NAME, (_m, a, b) => ((a ?? b) === "API_Journey" ? "the test event" : "the test record"));
  // Journey sentences, the shapes they come in.
  s = s.replace(
    new RegExp(`This user's home company is ${ID_TOKEN.source}; the bid is placed for the invited ${ID_TOKEN.source}\\.`, "g"),
    "The bid is placed for the invited company, which is a different company from this user's home company.",
  );
  s = s.replace(new RegExp(`\\b(Draft|Bid|Award proposal|Proposal|Event|Form)\\s+${ID_TOKEN.source}`, "g"), (_m, noun: string) =>
    noun === "Draft" ? "The draft event" : `The ${noun.toLowerCase()}`,
  );
  s = s.replace(new RegExp(`\\b(technical response|counter offer|version)\\s+${ID_TOKEN.source}`, "g"), "$1");
  s = s.replace(new RegExp(`\\bis ${ID_TOKEN.source} with\\b`, "g"), "has");
  s = s.replace(new RegExp(`\\bthrough ${ID_TOKEN.source}\\b`, "g"), "through one of them,");
  s = s.replace(new RegExp(`\\s+(?:as|is)\\s+${ID_TOKEN.source}(?=[\\s;.,)]|$)`, "g"), "");
  s = s.replace(new RegExp(`[“"]${ID_TOKEN.source}[”"]\\s+—\\s+`, "g"), "");
  s = s.replace(ID_TOKEN, (id) => known[id] ?? "a reference id");
  return tidy(s);
}

// ── making a sentence plain ────────────────────────────────────────────────

interface PlainOpts {
  /** "drop" removes error codes (titles); "message" names the app's message instead (expected results) */
  codes?: "drop" | "message";
}

const HTTP_WORD: Record<string, string> = {
  "200": "success",
  "201": "success",
  "204": "success",
  "400": "a refusal",
  "401": "a sign-in refusal",
  "403": "a permission refusal",
  "404": "a not-found answer",
  "409": "a conflict refusal",
  "422": "a refusal",
  "429": "a too-many-requests answer",
};
const HTTP_CODES = new Set(Object.keys(HTTP_WORD));

/** Ruby, file references and other code a reader should not have to parse. */
const CODEY = /[@#]|::|\.\w+\?|\b\w+\(|=>|&&|\|\||\bT\.|\breturn\b|\bnext unless\b|\.rb\b|\.ts\b|\bparams\[|\bself\./;

function codeSpanWords(inner: string): string {
  const t = inner.trim();
  const ep = t.match(/^(GET|POST|PATCH|PUT|DELETE)\s+(\/\S*)$/i);
  if (ep) return endpointInWords(ep[1], ep[2]);
  if (/^(GET|POST|PATCH|PUT|DELETE)$/i.test(t)) return { GET: "read", POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" }[t.toUpperCase()]!;
  if (/^\//.test(t)) {
    const phrase = endpointInWords("", t);
    return /^the “|^the [\w ]+ request$/.test(phrase) && !/\/(trade|event_groups|bids|proposal|v1)\b/.test(t) ? "that page" : phrase;
  }
  const kv = t.match(/^([a-z][\w.]*)\s*[:=]\s*(.+)$/);
  if (kv && !CODEY.test(t)) return `“${fieldWords(kv[1])}” set to ${valueWords(kv[2])}`;
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+(\.[a-z0-9_]+)*\??$/.test(t)) return `“${fieldWords(t.replace(/\?$/, ""))}”`;
  if (/^\{/.test(t) && /"status"\s*:\s*5\d\d|Internal Server Error/.test(t)) return "a server error";
  if (/^\{/.test(t) && /"error"/.test(t)) return "an error reply";
  if (/^[{[]/.test(t)) return /^\[/.test(t) ? "a list" : "the values shown in Details";
  if (CODEY.test(t)) return "";
  return t;
}
function keyWords(path: string): string {
  return fieldWords(path).replace(/'([^']+)' (setting|flag)/g, "$1");
}
function fieldWords(path: string): string {
  return path
    .split(".")
    .map((seg) => leafWord(seg.replace(/\[\*\]$/, "")))
    .join(" › ");
}
function valueWords(v: string): string {
  const t = v.trim();
  if (/^[{[]/.test(t)) return /^\[/.test(t) ? "a list" : "the values shown in Details";
  if (/^null$/.test(t)) return "empty (null)";
  if (/^["'].*["']$/.test(t)) return `“${t.slice(1, -1)}”`;
  if (/^[a-z]+(_[a-z]+)+$/.test(t)) return `“${words(t)}”`;
  return t;
}

/**
 * Product settings by their key ("approval.doa.currency") → the name the
 * product docs give them ("DoA Threshold Currency"). Read from the catalog's
 * own words — "Label (key) = …" titles and "`key` … — CONF-XX-001 "Label""
 * setups — so no name is ever made up.
 */
let CONFIG_LABEL: Map<string, string> | null = null;
function configLabels(): Map<string, string> {
  if (CONFIG_LABEL) return CONFIG_LABEL;
  CONFIG_LABEL = new Map();
  try {
    for (const c of allCases()) {
      const t = String(c.title ?? "").match(/^(.+?)\s+\(`?([a-z]\w*(?:\.\w+)+)`?\)\s*=/);
      if (t && !CONFIG_LABEL.has(t[2])) CONFIG_LABEL.set(t[2], t[1].trim());
      for (const m of String(c.setup ?? "").matchAll(/`([a-z]\w*(?:\.\w+)+)`[^`—]*—\s*CONF-[A-Z]+-\d+\s+"([^"]+)"/g))
        if (!CONFIG_LABEL.has(m[1])) CONFIG_LABEL.set(m[1], m[2].trim());
    }
  } catch {
    /* no catalog — keys are simply worded */
  }
  return CONFIG_LABEL;
}
function settingNames(s: string): string {
  const labels = configLabels();
  if (!labels.size || !/[a-z]\.[a-z]/.test(s)) return s;
  s = s.replace(/\s*—\s*CONF-[A-Z]+-\d+\s+"[^"]+"/g, "");
  // "DoA Threshold Currency (approval.doa.currency) = INR" — the name is already there
  s = s.replace(/\s*\(`?([a-z]\w*(?:\.\w+)+)`?\)/g, (m, k: string) => (labels.has(k) ? "" : m));
  s = s.replace(/`?\b([a-z]\w*(?:\.\w+)+)\b`?/g, (m, k: string) => (labels.has(k) ? `“${labels.get(k)}”` : m));
  return s.replace(/\bgate:\s*/g, "Setting: ");
}

const ORDINAL = ["first", "second", "third", "fourth", "fifth"];
const singular = (w: string) => w.replace(/ies$/, "y").replace(/(?<!s)s$/, "");
function bracketPath(path: string): string {
  const segs = [...path.matchAll(/([a-z]\w*)(\[(\d+|\*)?\])?/g)];
  const out: string[] = [];
  segs.forEach((m, i) => {
    const name = words(m[1]);
    if (!m[2]) return void out.push(name);
    const idx = m[3];
    const one = `${idx && /^\d+$/.test(idx) ? (ORDINAL[Number(idx)] ?? `number ${Number(idx) + 1}`) : "each"} ${singular(name)}`;
    out.push(i < segs.length - 1 ? `${one}'s` : one);
  });
  const s = out.join(" ");
  return /^(first|second|third|fourth|fifth|number)/.test(s) ? `the ${s}` : s;
}

/** Emphasis capitals ("the TECHNICAL stage", "NOT") read as shouting; acronyms stay. */
const ACRONYM = new Set(
  "HTTP RFQ RFP RFI RFX BOQ PO PR SAP SSO GST PAN OTP DOA DoA API UI URL HTML CSV PDF XLS XLSX PNG JPG SQL INR USD EUR GBP AED ID IDS VMS VRP ERP GRN ASN MSME KYC TDS HSN UOM SKU ETA SLA CC BCC TA TNA IP UAT QA AI MFA OAUTH SAML LDAP TCP JS SMS".split(" "),
);
const SHOUT = new Set("NOT ANY ALL ONE TWO AND THE BUT OFF".split(" "));

/**
 * The last pass over a sentence: the words a developer writes ("payload",
 * "endpoint", "body", true/false/null, "row inserted", "form.id") become the
 * words a tester writes. Each rule only rewords — the original stays in Details.
 */
const POLISH: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  [/\bwith (?:the )?(?:request )?body (?:a set of values|a list|the values shown in Details|\(the values shown in Details\))/g, "with the values shown in Details"],
  [/\bbody (?:a set of values|a list)\b/g, "the values shown in Details"],
  [/\b(?:the )?(?:full )?response body is (?:JSON|json|data)\b/g, "the reply is structured data"],
  [/\b(?:the )?full response body\b/g, "the app's full reply"],
  [/\b(?:the )?response body\b/g, "the reply"],
  [/\b(?:the )?request (?:body|payload)\b/g, "the data sent"],
  [/\b(?:a )?JSON body\b/g, "a structured reply"],
  [/\b(?:JSON|json)\b/g, "data"],
  [/\binjection payloads?\b/gi, "injection text"],
  [/\b(an? |the )?(?:hostile |malicious )?payloads?\b/gi, (_m, a = "") => `${/^the/i.test(a) ? a : ""}data`],
  [/\bwrite endpoints?\b/g, "saving request"],
  [/\bendpoints\b/g, "requests"],
  [/\b(?:the |an? )endpoint\b/g, "the request"],
  [/\bendpoint\b/g, "request"],
  [/\btwo identical (?=the )/g, "two identical copies of "],
  [/\b(A clean refusal): refusal with\b/g, "$1 with"],
  [/\b(an? )?empty body\b/g, "no data"],
  [/\bgets no body\b/g, "gets nothing back"],
  [/\berror body\b/g, "error reply"],
  [/\b(that|and|whose) body\b/g, "$1 the reply"],
  [/\b(?:a|the) (?:working|valid) ([\w ()]*?)\s*body\b/g, (_m, w: string) => `the usual ${w ? `${w} ` : ""}details`],
  [/\b(?:a|the) (\w+) body\b/g, "the $1 details"],
  [/\b(the|a|its|same) body\b/g, "$1 request data"],
  [/(?<!subject, )\bbody\b/g, "request"],
  [/\bBody\b/g, "The request"],
  [/\b(?:PATCH|POST|PUT)es\b/g, "requests"],
  [/\bto \/events\/(the [a-z]+)/g, "for $1"],
  [/\b(?:round › )?event\.latest\? is off\b/g, "the round no longer belongs to the latest version of the event"],
  [/\bHTTP \+ /g, "the app's answer + "],
  [/\b(an? |or a )200\b(?!-| ?(?:rows?|items?|characters|vendors?))/g, (_m, a: string) => `${/^or/.test(a) ? "or a" : "a"} success answer`],
  [/\bthe same (\d{3})\b(?!-| ?(?:rows?|items?|characters|vendors?))/g, "the same error"],
  [/\b(?:it|guard to fire|check to fire|the error) is (\d{3,4})\b(?!-| ?(?:rows?|items?|characters|vendors?))/g, (m: string, code: string) => {
    const msg = HTTP_CODES.has(code) ? undefined : errorMessage(code);
    return msg ? `${m.replace(/ is \d+$/, "")} is the one with the message “${msg}”` : m;
  }],
  [/\b[Rr]ead back the request that reads (the [\w']+(?: [\w']+)?)/g, "read $1 back"],
  [/\s*\(the server code\)/g, ""],
  [/\breturns (?:true|TRUE)\b/g, "says yes"],
  [/\breturns (?:false|FALSE)\b/g, "says no"],
  [/\bset to (?:true|TRUE)\b/g, "switched on"],
  [/\bset to (?:false|FALSE)\b/g, "switched off"],
  [/\b(?:true|TRUE)\b/g, "on"],
  [/\b(?:false|FALSE)\b/g, "off"],
  [/\b(?:null|NULL|nil)\b/g, "empty"],
  [/\bempty \(empty\)/g, "empty"],
  [/\[\s*\]/g, "an empty list"],
  [/\b(?:HTTP |http )?4xx\b/gi, "refusal"],
  [/\bHTTP (?=refusal|success|error)/g, ""],
  [/\b2xx\b/gi, "success"],
  [/\ban empty 200\b/g, "an empty success reply"],
  [/\b(?:or )?[45]\d\d(?:\s*\/\s*[45]\d\d)+\b/g, (m: string) => `${/^or/.test(m) ? "or " : ""}a refusal`],
  [/\b(?:the )?HTTP status\b/g, "the response status"],
  [/\bHTTP time\b/g, "response time"],
  [/\bquery params\b/g, "address details"],
  [/\bjsonb\b/g, "stored"],
  [/([a-z])\?(?= [a-z])/g, "$1"],
  [/\bparams\b/g, "parameters"],
  [/\brow(s?) (?:is |are |was |were )?(?:created|inserted|written|persisted)\b/g, (_m, s) => `record${s} ${s ? "are" : "is"} saved`],
  [/\b(rfq|rfp|rfi|boq|sap|sso|gst|doa|otp|uom|hsn)\b/g, (m) => m.toUpperCase()],
  [/\b(po|pr)\b(?! *[-–])/g, (m) => m.toUpperCase()],
  [/\b(RFQ|RFP|PO|PR|lot|invoice|order|serial|bill) no\b/g, "$1 number"],
  [/\b([a-z]\w*)=([\w-]+)\b/g, "$1 $2"],
  [/\bcrash(?:es)? the [\w' -]*?(?:service|serializer|controller|signature|validator|worker|model)\b[\w' -]*$/, "must not crash the server"],
  [/\bthe documented envelope\b/g, "all the documented parts"],
  [/\benvelope\b/g, "reply layout"],
];
function polish(s: string): string {
  // dotted field paths outside e-mail addresses, file names and URLs: "form.score" → "form score"
  s = s.replace(
    /(?<![@\w.\/:-])([a-z][a-zA-Z]*)((?:\.[a-z][a-zA-Z0-9]*)+)(?![\w@\/(?-]|\.[a-zA-Z])/g,
    (m, a: string, rest: string) => {
      const segs = [a, ...rest.slice(1).split(".")];
      if (/^(e|i|www|document|window|vnd|qa|mailto)$/.test(a)) return m;
      if (/^(com|in|org|net|io|pdf|xls|xlsx|csv|png|jpg|jpeg|txt|html|js|ts|rb|yml|zip|docx)$/.test(segs[segs.length - 1])) return m;
      return segs.map(words).join(" ");
    },
  );
  for (const [re, to] of POLISH) s = s.replace(re, to as never);
  s = s.replace(/(?<!uppercase |upper-case |\w"|[A-Z]{3,} )\b([A-Z]{3,})\b(?! [A-Z]{3,}\b)/g, (w) => (ACRONYM.has(w) ? w : SHOUT.has(w) || w.length >= 4 ? w.toLowerCase() : w));
  return s;
}

/**
 * Plain English out of an authored sentence: code spans, endpoints,
 * placeholders, snake_case keys, file references and status/error codes
 * become words; what cannot be said plainly is dropped (it stays in details).
 */
export function plain(text: string | undefined, opts: PlainOpts = {}): string {
  let s = String(text ?? "").trim();
  if (!s) return "";
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = settingNames(s);
  s = s.replace(/\bgate:\s*`?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`?/g, (_m, k: string) => `the “${words(k)}” setting`);
  s = s.replace(/\{\{\s*rfpTradeId\s*\}\} is the TECHNICAL \(RFP\) stage of (the sandbox event)/g, (_m, e: string) => `${cap(e)} has a technical (RFP) round`);
  s = s.replace(/\bform\.uuid is \{\{\s*evalFormUuid\s*\}\}, the form assigned to the evaluator/g, "the evaluator has been assigned an evaluation form");
  // Values made unique per run: "qa_{{stamp}}@example.com", "lot_{{stamp}}"
  s = s.replace(/[\w.+-]*\{\{\s*stamp\s*\}\}[\w.+-]*@[\w.-]+/g, "a unique test address (qa_…@example.com)");
  s = s.replace(/(?<![\/=?&\w])["“]?([A-Za-z]\w*?)_\{\{\s*stamp\s*\}\}(\.[a-z]{2,4})?["”]?/g, (_m, w: string, ext = "") => {
    const last = w.split("_").pop()!.toLowerCase();
    return /^(platform|test|journey)$/.test(last) ? "a unique test name" : `a unique “${last}_…${ext}”`;
  });
  // a reference id used as a key inside a field path: "page_responses.UVpaTmRE[0].value" → "page_responses[0].value"
  s = s.replace(/\.(?=(?:[a-z0-9]*[A-Z]){2})(?=(?:[A-Z0-9]*[a-z]){2})[A-Za-z0-9+\/]{8}(?=\[)/g, "");
  s = s.replace(/\(it is (string|integer|number|float|boolean|array|object|hash) in a working request\)/g, (_m, t: string) =>
    `(a working request sends it as ${{ string: "text", integer: "a whole number", number: "a number", float: "a number", boolean: "yes/no", array: "a list", object: "a group of values", hash: "a group of values" }[t]})`);
  // "line_items[].quantity.value" → "each line item's quantity value"; "forms[0].evaluators[0].x" → "the first form's first evaluator's x"
  s = s.replace(/\b[a-z]\w*\[(?:\d+|\*)?\](?:\.[a-z]\w*(?:\[(?:\d+|\*)?\])?)*/g, bracketPath);
  // Ruby that names an error or a transaction: say what it means.
  s = s.replace(/\b(?:[A-Z]\w*::)*[A-Z]\w*\.transaction\b/g, "one database transaction");
  s = s.replace(/\b(?:a\s+)?(?:Sorbet|NoMethodError|no method error|TypeError|type error)(?:\s*\/\s*(?:no method error|NoMethodError|type error|TypeError))?(?:\s+(?:error\s+)?5\d\d\b)?/g, "a server error");
  s = s.replace(/\bparams\[:?(\w+)\]/g, (_m, k: string) => `the ${words(k)} sent`);
  s = s.replace(/\b(GET|POST|PATCH|PUT|DELETE)\s*\(not (?:GET|POST|PATCH|PUT|DELETE)\)\s*(\/[^\s,;)]*)/g, (_m, mth, p) => endpointInWords(mth, p));
  s = s.replace(/\b(GET|POST|PATCH|PUT|DELETE)\s*\.\.\/?([a-z_]+)/g, (_m, _mth, p: string) => `send the “${words(p)}” request`);
  // "(`PATCH /event_groups/:id`)" as an aside — the details carry it.
  s = s.replace(/\s*\(\s*`(?:GET|POST|PATCH|PUT|DELETE)\s+[^`]+`\s*\)/gi, "");
  s = s.replace(/`([^`]*)`/g, (_m, inner) => codeSpanWords(inner));
  s = s.replace(/\b(GET|POST|PATCH|PUT|DELETE)\s+(\/[^\s,;)]*)/g, (_m, mth, p: string) => {
    // "?invoice_no=QA_Platform_{{stamp}}" — a value made up for the test
    const madeUp = p.match(/[?&]([a-z_]+)=[^&]*\{\{\s*stamp\s*\}\}/)?.[1];
    return `${endpointInWords(mth, p)}${madeUp ? ` with a made-up ${words(madeUp)}` : ""}`;
  });
  s = s.replace(/\bevent groups?\b/gi, (w) => (/s$/i.test(w) ? "events" : "event"));
  s = s.replace(/\b(POST|PATCH|PUT)\s+(?=[a-z])/g, "send ");
  s = s.replace(/\bGET\s+(?=[a-z])/g, "read ");
  // "the sandbox event {{eventGroupUuid}}" → "the sandbox event"
  s = s.replace(/\b(\w+)\s+\{\{\s*(\w+)\s*\}\}/g, (m, w: string, n: string) =>
    placeholderWord(n).toLowerCase().endsWith(` ${w.toLowerCase()}`)
      ? w
      : /^(to|for|with|of|on|in|into|is|are|as|by|from|and|or|the|a|an|at|under|against|than|via|uses?|using|sets?|send|sends|keyed|that|not|own|named|called|whose|it|its|copy|add|adds|move|moves|open|opens|read|reads|update|updates|create|creates|=|is:)$/i.test(w) || !/^[a-z]/i.test(w)
        ? `${w} ${placeholderWord(n)}`
        : w, // "line item {{lineItemUuid}}" — the noun already says what it is

  );
  s = s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, n) => placeholderWord(n));
  // "with title: 12345" / "show_under_open_events: \"yes\"" — a key and the value it is sent as
  s = s.replace(/(^|\bwith\s+|,\s*|\band\s+)([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*):\s+("[^"]*"|'[^']*'|null|true|false|-?\d[\d.]*|[a-z][a-z_]*)(?=[\s,.;)]|$)/g,
    (_m, pre: string, k: string, v: string) => `${pre}“${keyWords(k)}” set to ${valueWords(v)}`);
  // inline JSON the author pasted into a sentence — the details hold it verbatim
  s = s.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "(the values shown in Details)");
  s = s.replace(/\bHTTP\s+4\d\d\s+['“"]([^'”"]+)['”"]/g, "a refusal with the message “$1”");
  // file:line references and class#method references
  s = s.replace(/\s*\(?\b[\w/.-]+\.(?:rb|ts|js|yml|tsx)(?::\d+(?:[-–]\d+)?)?\)?/g, "");
  s = s.replace(/\b(?:[A-Z]\w*::)+[A-Z]\w*(?:#\w+[?!]?)?/g, "the server code");
  s = s.replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+#\w+[?!]?/g, "the server code");
  s = s.replace(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g, (_m, w: string) => (/^(TradeRequest|EventGroup)$/.test(w) ? (w === "TradeRequest" ? "round" : "event") : w.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()));

  // Server errors, however they are phrased — but never "501 audience entries".
  s = s.replace(/\b(crash(?:es)?|fails?|breaks?|answers?|returns?|raises?)\s+(?:with\s+)?(?:an?\s+)?(?:untyped\s+)?(?:HTTP\s+)?5\d\d\b(?:s)?/gi, (_m, v: string) =>
    /^crash/i.test(v) ? `${v} with a server error` : `${v.replace(/raises?/i, "fails")} with a server error`,
  );
  s = s.replace(/\b(does not|do not|must not|never|should not|cannot)\s+5\d\d\b/gi, "$1 crash");
  s = s.replace(/\bthen\s+5\d\ds\b/gi, "then crashes");
  s = s.replace(/\b5\d\ds\b/g, "crashes");
  s = s.replace(/\bno-5(?:\d\d|xx)\b/gi, "no-server-error");
  s = s.replace(/\b(guaranteed|untyped|unhandled|unrescued)\s+5\d\d\b/gi, "$1 server error");
  s = s.replace(/\b(?:an?\s+)(?:untyped\s+)?(?:HTTP\s+)?5\d\d\b(?!\s*(?:-|audience|entries|items?|line|participants?|characters|vendors?|rows?|copies|products?))/gi, "a server error");
  s = s.replace(/\bHTTP\s+5\d\d\b|\b5\d\d\s+error\b|\(5\d\d\)/gi, "a server error");
  s = s.replace(/\ba\s+5xx\b|\b5xx\b/gi, "a server error");

  // Error codes, then HTTP statuses.
  const msg = (code: string) => (opts.codes === "message" ? errorMessage(code) : undefined);
  s = s.replace(/\b(?:error\.code|error code|with code|code)\s+(\d{1,4})\b(\s*\([^)]*\))?/gi, (_m, code) => {
    const m = msg(code);
    return m ? `with the message “${m}”` : "";
  });
  s = s.replace(/\bHTTP\s+(\d{3})\b/gi, (_m, st) => (HTTP_WORD[st] ? "" : ""));
  s = s.replace(/\b(refused|rejected|blocked|denied|answers|returns|fails)\s+(?:with\s+)?(\d{1,4})\b(?!\s*(?:items?|entries|characters|line|vendors?|%|rows?))/gi, (_m, v: string, code: string) => {
    if (HTTP_CODES.has(code)) return v.toLowerCase() === "answers" || v.toLowerCase() === "returns" ? `${v} with ${HTTP_WORD[code]}` : v;
    const m = msg(code);
    const verb = /^(answers|returns)$/i.test(v) ? "is refused" : v;
    return m ? `${verb} with the message “${m}”` : verb;
  });
  s = s.replace(/\s*\((\d{2,4})\)/g, (_m, code) => {
    const m = HTTP_CODES.has(code) ? undefined : msg(code);
    return m ? ` (“${m}”)` : "";
  });
  s = s.replace(/^(\d{3})(?=[,.;\s])/, (_m, st) => (HTTP_WORD[st] ? cap(HTTP_WORD[st]) : st));
  s = s.replace(/\b(Must|Should) be (\d{3})\b/g, (_m, v, st) => `${v} be ${HTTP_WORD[st] ?? "refused"}`);
  s = s.replace(/\bsuccess:\s*true\b/g, "success");

  // snake_case keys left in running text
  s = s.replace(/\b([a-z]+)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, (_m, a: string, b: string) => fieldWords(`${a}.${b}`));
  s = s.replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?:\.([a-z0-9_]+))?\b/g, (_m, a: string, b?: string) => (b ? `${fieldWords(`${a}.${b}`)}` : leafWord(a)));
  s = s.replace(/\buuids\b/gi, "ids").replace(/\buuid\b/gi, "id");
  s = s.replace(/\btype \(RFQ \/ RFP \/ auction\)/g, "round type");
  s = s.replace(/\bevent groups?\b/gi, (w) => (/s$/i.test(w) ? "events" : "event"));
  s = s.replace(/\btrade requests?\b/gi, (w) => (/s$/i.test(w) ? "rounds" : "round"));
  s = s.replace(/\bQA_Platform_?/g, "");
  s = s.replace(/\b\w+#\w+[?!]?/g, "the server code");
  return tidy(polish(s));
}

function tidy(s: string): string {
  return cap(
    s
      .replace(/\ban (?=[bcdfgjklmnpqrstvwxyz][a-z])/g, "a ")
      .replace(/\bA (?=[bcdfgjklmnpqrstvwxyz][a-z])/g, "A ")
      .replace(/\ba (?=[aeio][a-z])/g, "an ")
      .replace(/\(\s*\)/g, "")
      .replace(/\s+([,;:!?]|\.(?![a-z]))/g, "$1")
      .replace(/([,;])\s*([,;.])/g, "$2")
      .replace(/\s*—\s*[.;]/g, ".")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,;.—–-]+/, "")
      .replace(/\.\s*\./g, ".")
      .trim(),
  );
}

/** Keep the sentences a reader can use; drop the ones made of code. */
function plainSentences(text: string | undefined, opts: PlainOpts = {}): string {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(/(?<=[.;])\s+(?=[A-Z(`])/);
  const out = parts
    .map((p) => {
      const codeSpans = p.match(/`[^`]*`/g) ?? [];
      if (codeSpans.some((c) => CODEY.test(c))) return "";
      if (/\b\w+\.rb:\d+|\bSorbet\b|\bsig\b|TypeError|ArgumentError|NoMethodError|unrescued|rescue/.test(p)) return "";
      return plain(p, opts);
    })
    .filter(Boolean);
  return out.join(" ").trim();
}

/**
 * "Assert HTTP 200" / "Assert rejection with 557" / "Assert the response is
 * not a server error" → what a tester checks, in words. Runs on the raw step,
 * before the codes are taken out, so "Assert HTTP 200" does not become "Assert".
 */
function checkWords(step: string): string {
  let s = step.trim();
  const status = (code: string) => (/^2/.test(code) ? "the request succeeds" : HTTP_CODES.has(code) ? "the app refuses it" : `the app refuses it with code ${code}`);
  s = s.replace(/\b[Aa]ssert(?:s)? (?:the )?(?:HTTP )?status(?: code)?,? and,? (?:for a refusal, )?the (?:app )?error(?:\.code| code)?(?: and (?:the )?message)?(?: in the body)?/g, "read the app's answer and, for a refusal, its error message");
  s = s.replace(/\b[Rr]ead the (?:HTTP )?status(?: code)? and (?:the )?error(?: message)?\b/g, "read the app's answer and any error message");
  s = s.replace(/^(?:POST|post)\.?$/, "Upload the prepared spreadsheet");
  s = s.replace(/\b[Aa]ssert(?:s)? (?:that )?(?:the )?(?:HTTP |response |status |code )*(?:is )?(?:not )?(?:a )?(?:below|under|<) ?500\b|\b[Aa]ssert(?:s)? (?:that )?the (?:response|status|request) is not a server error\b|\b[Aa]ssert(?:s)? no server error\b/g, "check that the app does not crash");
  s = s.replace(/\b[Aa]ssert(?:s)? (?:that )?(?:the )?(?:HTTP |response |status )*(?:is )?(\d{3})(?: or (\d{3}))?\b(?!\s*(?:items?|ids|rows?|characters|entries|vendors?|line))/g, (_m, a: string, b?: string) =>
    `check that ${b && /^4/.test(a) && /^4/.test(b) ? "the app refuses it" : status(a)}`,
  );
  s = s.replace(/\b[Aa]ssert(?:s)? (?:that )?(?:the )?(?:a )?(?:clean )?(?:rejection|refusal)(?: with| is)? (?:code )?(\d{2,4})\b/g, (_m, c: string) => `check that ${status(c)}`);
  s = s.replace(/\b[Aa]ssert(?:s)? (?:that )?the (?:response|request|call) is (?:refused|rejected)\b/g, "check that the app refuses it");
  s = s.replace(/\b[Aa]ssert(?:s)? (?:a )?(?:clean )?(?:rejection|refusal)\b/g, "check that the app refuses it");
  s = s.replace(/\b[Aa]ssert(?:s)? acceptance\b/g, "check that the app accepts it");
  s = s.replace(/\b[Aa]ssert(?:s)? (?:the )?(?:response )?keys\b/g, "check that the reply includes");
  s = s.replace(/\b[Aa]ssert(?:s)? (?:that )?the response (?!is\b|has\b|contains\b|carries\b|includes\b|returns\b|shows\b|lists\b|matches\b|status\b)/g, "check the reply's ");
  s = s.replace(/\b[Aa]ssert(?:s)? (?=an? |no |the absence\b|the [\w-]+ (?:refusal|rejection|error|answer)\b)/g, "check for ");
  s = s.replace(/\b[Aa]ssert(?:s)? (?:that )?/g, "check that ");
  s = s.replace(/\b[Aa]ssert(?:s)?\b\.?$/g, "");
  s = s.replace(/\bcheck that the app refuses it is refused\b/g, "check that the app refuses it");
  return s;
}

/** Split "… 1. Do this. 2. Then that." at its step numbers only when they count up (so "stage no = 0. Then" stays one step). */
function numbered(text: string): string[] {
  const out: string[] = [];
  let want = /^\s*1\.\s/.test(text) ? 2 : 1;
  let from = 0;
  for (const m of text.matchAll(/\s(\d{1,2})\.\s+(?=[A-Z`"“(])/g)) {
    if (Number(m[1]) !== want) continue;
    out.push(text.slice(from, m.index));
    from = m.index! + 1;
    want += 1;
  }
  out.push(text.slice(from));
  return out.map((p) => p.trim()).filter(Boolean);
}

const baseVerb = (v: string) => v.replace(/(sh|ch|ss|x)es$/, "$1").replace(/s$/, "");

/** "1. Do this. 2. Then that." / ["1. Do this", …] / "Log in. Open Events." → numbered list items */
export function plainSteps(steps: string | string[] | undefined): string[] {
  const list = Array.isArray(steps)
    ? steps
    : numbered(String(steps ?? ""))
        .flatMap((p) => (/^\d+\.\s/.test(p) ? [p] : p.split(/(?<=\.)\s+(?=[A-Z])/)));
  // "`POST /proposal/x/create_po_form`. 1. POST create_po_form." — the second only repeats the first
  const repeats = (x: string) => {
    const m = String(x).replace(/^\s*\d+[.)]\s*/, "").match(/^(?:GET|POST|PATCH|PUT|DELETE) ([a-z_]+)\.?$/);
    return !!m && list.length > 1 && list.some((y) => y !== x && String(y).includes(`/${m[1]}`));
  };
  // "POST move_to_auction with end price above L1", after the step that names the request: "Send it with …"
  const again = (x: string) => {
    const m = String(x).replace(/^\s*\d+[.)]\s*/, "").match(/^(?:GET|POST|PATCH|PUT|DELETE) ([a-z_]+) (with\b.*)$/);
    return m && list.some((y) => y !== x && String(y).includes(`/${m[1]}`)) ? `Send it ${m[2]}` : x;
  };
  const out = list
    .filter((x) => !repeats(String(x)))
    .map((x) => again(String(x)))
    .map((x) => plain(checkWords(String(x).replace(/^\s*\d+[.)]\s*/, "")), { codes: "message" }))
    .map((x) => x.replace(/\.$/, ""))
    .filter(Boolean)
    // "The request that creates the event with …" is an instruction: send it.
    .map((x) => (/^The (“[^”]+” )?(request|[\w -]+ (?:request|call))\b/.test(x) ? `Send ${x.charAt(0).toLowerCase()}${x.slice(1)}` : x))
    // "Send the request that updates (and publishes) the event" → "Update (and publish) the event"
    .map((x) =>
      x.replace(/^Send the request that ([a-z]+) (?:\(and ([a-z]+)\) )?/, (_m, v: string, v2?: string) => `${cap(baseVerb(v))} ${v2 ? `(and ${baseVerb(v2)}) ` : ""}`),
    );
  // A step that only names the request, followed by one that sends it with a change, is the same step.
  const bare = (x: string) => x.replace(/ with the values shown in Details$/, "");
  return out
    .filter((x) => x && !/^(check that|check for)$/i.test(x))
    .filter((x, i, all) => !all.some((y, j) => j !== i && y.length > bare(x).length && y !== x && y.startsWith(bare(x)) && /^(Send|Create|Update|Add|Read|List|Convert|Invite|Issue)\b/.test(x)));
}

/**
 * "QA_Platform_intake_create_rejects_missing_title" → "Creating an intake refuses a missing title".
 * Titles already written as prose only lose the prefix and their code.
 */
const SUBJECT: Array<[RegExp, string]> = [
  [/^intake create\b/, "creating an intake"],
  [/^intake update\b/, "updating an intake"],
  [/^intake draft read\b/, "reading an intake draft"],
  [/^intake configs and currency read$/, "the intake settings and currencies can be read"],
  [/^issue request\b/, "raising an issue on an intake"],
  [/^share\b/, "sharing an intake"],
  [/^run steps read\b/, "reading the intake's workflow steps"],
  [/^approvals read\b/, "reading an intake's approvals"],
  [/^approvals\b/, "reading approvals"],
  [/^approval flows\b/, "reading approval flows"],
  [/^publish\b/, "publishing"],
  [/^withdraw\b/, "withdrawing"],
  [/^pr retry\b/, "retrying the PR creation"],
  [/^purchase orders index read$/, "the purchase order list can be read"],
  [/^po page stats read$/, "the purchase order page statistics can be read"],
  [/^create po\b/, "creating a PO"],
  [/^po stats schema\b/, "the PO statistics"],
  [/^get order details\b/, "reading order details"],
  [/^po dms attachments\b/, "reading PO attachments"],
  [/^order show by id\b/, "reading an order by id"],
  [/^po index\b/, "the PO list"],
  [/^update po status\b/, "updating a PO's status"],
  [/^update po\b/, "updating a PO"],
  [/^retry po\b/, "retrying a PO"],
  [/^released notes read only smoke$/, "the released notes can be read"],
  [/^vendor code update\b/, "updating a vendor code"],
  [/^vendor side order details\b/, "the vendor's view of order details"],
  [/^vendor declined status\b/, "the vendor-declined status"],
  [/^dispatch read\b/, "reading dispatches"],
  [/^add dispatch\b/, "adding a dispatch"],
  [/^payment proof\b/, "uploading a payment proof"],
];
const VERB: Array<[RegExp, string]> = [
  [/\brejects\b/, "refuses"],
  [/\bblocks\b/, "blocks"],
  [/\bsurvives\b/, "copes with"],
  [/\bmust not 500 on\b/, "does not crash on"],
  [/\bmust not 500\b/, "does not crash"],
  [/\braises 500\b/, "crashes"],
  [/\bis scoped to caller\b/, "only shows the caller's own"],
  [/\bis workspace scoped\b/, "stays inside the workspace"],
  [/\bcannot be spoofed\b/, "cannot be faked"],
  [/\bpasses authorization vacuously\b/, "passes the permission check without checking anything"],
  [/\brefused before write\b/, "is refused before anything is saved"],
  [/\bignores unpermitted\b/, "ignores the unpermitted"],
  [/\bdocuments\b/, "follows"],
];
export function titleFromIdentifier(title: string): string {
  const raw = String(title ?? "").replace(/^QA[_ ]?Platform[_ ]?/i, "").trim();
  if (!raw) return String(title ?? "");
  if (/\s/.test(raw) || !/_/.test(raw)) return plain(raw, { codes: "drop" });
  let s = raw.replace(/_+/g, " ").trim().toLowerCase();
  s = s.replace(/\buuid(s?)\b/g, "id$1").replace(/\bpr\b/g, "PR").replace(/\bpo\b/g, "PO").replace(/\bboq\b/g, "BOQ").replace(/\brfq\b/g, "RFQ").replace(/\brfp\b/g, "RFP");
  for (const [re, w] of SUBJECT) {
    if (re.test(s.toLowerCase())) {
      s = s.replace(new RegExp(re.source, "i"), w);
      break;
    }
  }
  for (const [re, w] of VERB) s = s.replace(re, w);
  s = s.replace(/\b(\d{3})\b/g, (m) => (/^5/.test(m) ? "a server error" : m));
  return tidy(polish(s));
}

/**
 * A title states what must hold, not what happens today: "Empty audience ids
 * crashes with a server error" is the bug; the test case is "… must not crash
 * the server". The title as written stays in the details.
 */
export function titleWords(t: string): string {
  let s = t;
  s = s.replace(/\s*\b(?:crash(?:es)?|fails|breaks|raises a server error)(?: with a server error)?$/i, " must not crash the server");
  s = s.replace(/\bcrash(?:es)? with a server error\b/gi, "must not crash the server");
  s = s.replace(/\bcrash(?:es)? (the [\w' -]+?) with a server error\b/gi, "must not crash $1");
  s = s.replace(/^“([^”]+)” set to (.+?) (must|is|are|cannot|does)\b/, (_m, f: string, v: string, verb: string) => `Setting “${f}” to ${v} ${verb}`);
  s = s.replace(/\bmust not crash the server must not crash the server\b/g, "must not crash the server");
  return tidy(s);
}

// ── the sources ────────────────────────────────────────────────────────────

let CAT: Map<string, CatalogCase> | null = null;
let TWIN: Map<string, CatalogCase> | null = null;
function catalog(): Map<string, CatalogCase> {
  if (CAT) return CAT;
  CAT = new Map();
  TWIN = new Map();
  for (const c of allCases()) {
    CAT.set(c.id, c);
    // EDGE-PUB-019 ↔ API-XPUB-019, VBU-006 ↔ its twin: the twin names its library id in the trace
    for (const r of c.refs ?? []) if (/^(EDGE|VBU)-/.test(r) && !TWIN.has(r)) TWIN.set(r, c);
    for (const m of (c.source ?? "").match(/\b(?:EDGE-[A-Z]+-\d{3}|VBU-\d{3})\b/g) ?? []) if (!TWIN.has(m)) TWIN.set(m, c);
  }
  return CAT;
}
function twinOf(id: string): CatalogCase | undefined {
  catalog();
  const t = TWIN!.get(id);
  if (t) return t;
  const m = id.match(/^EDGE-([A-Z]+)-(\d{3})$/);
  return m ? CAT!.get(`API-X${m[1]}-${m[2]}`) : undefined;
}
let LIB: Map<string, TestCaseRecord> | null = null;
function library(): Map<string, TestCaseRecord> {
  if (LIB) return LIB;
  LIB = new Map();
  for (const c of [...loadCases(), ...heldCases()]) if (!LIB.has(c.id)) LIB.set(c.id, c);
  return LIB;
}
/** Library record behind a catalog twin (API-XPUB-019 → EDGE-PUB-019). */
function libraryTwinOf(c: CatalogCase): TestCaseRecord | undefined {
  const lib = library();
  for (const r of c.refs ?? []) if (lib.has(r)) return lib.get(r);
  const m = c.id.match(/^API-X([A-Z]+)-(\d{3})$/);
  return m ? lib.get(`EDGE-${m[1]}-${m[2]}`) : undefined;
}

/** The documented message a refusal should carry, in words, when the case names one. */
function messageNamed(doc: string | undefined): string | undefined {
  const d = String(doc ?? "");
  const code = d.match(/\b(?:error\.code|code|with)\s+(\d{1,4})\b/i)?.[1] ?? d.match(/^\s*(?:HTTP\s+)?\d{3}[,\s]+(?:code\s+)?(\d{1,4})\b/i)?.[1];
  if (code && !HTTP_CODES.has(code)) {
    const m = errorMessage(code);
    if (m) return m;
  }
  const quoted = d.match(/['“"]([A-Z][^'”"]{6,120})['”"]/)?.[1];
  return quoted && !/[_{}]/.test(quoted) ? quoted : undefined;
}

function expectedFor(kind: string | undefined, documented: string | undefined, bulk?: TestCaseRecord["bulk"]): string {
  if (bulk) {
    const refuse = (bulk as { refuse?: { message?: string } }).refuse?.message;
    if (refuse) return `The upload is refused with the message “${refuse}”, and no vendor is created.`;
    const lead = plainSentences(documented, { codes: "message" }).replace(/^['“"]([^'”"]+)['”"]\.?$/, "The app answers “$1”.");
    return lead || "Every row comes out as the case documents.";
  }
  const m = messageNamed(documented);
  if (kind === "reject") return m ? `The app refuses it with the message “${m}”, and nothing is saved or changed.` : "The app refuses it with a clear message, and nothing is saved or changed.";
  if (kind === "accept") return "The app accepts the request and does what it asks.";
  if (kind === "no-5xx")
    return "The app copes with it without breaking: it may accept it or refuse it cleanly, but it never answers with a server error.";
  return plainSentences(documented, { codes: "message" }) || "The app behaves as the case describes.";
}

const detail = (label: string, value: unknown, kind: DetailRow["kind"] = "text"): DetailRow | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return { label, value: JSON.stringify(value, null, 2), kind: "block" };
  return { label, value: String(value), kind };
};
const rows = (...r: Array<DetailRow | null>) => r.filter(Boolean) as DetailRow[];
const ruleRefs = (...texts: Array<string | undefined>) =>
  [...new Set(texts.join(" ").match(/\b[\w/.-]+\.(?:rb|ts|js|yml)(?::\d+(?:[-–]\d+)?)?/g) ?? [])].join(", ");

// ── a case, before it runs ─────────────────────────────────────────────────

/** "Publish the event to the invited vendor — `PATCH /event_groups/:id`" → "Publish the event to the invited vendor" */
function sectionWords(section: string | undefined): string {
  return plain(String(section ?? "").replace(/\s+[—–-]\s+`?(GET|POST|PATCH|PUT|DELETE)\b.*$/, ""));
}

/** A written catalog case (UI-…, API-…, PRD-…) in plain words. */
export function displayCatalogCase(c: CatalogCase): CaseDisplay {
  const lib = /^API-X/.test(c.id) ? libraryTwinOf(c) : undefined;
  const title = titleWords(plain(c.title, { codes: "drop" }));
  const steps = plainSteps(c.steps);
  const expected = lib ? expectedFor(lib.expected, `${c.expected} ${c.oracle ?? ""}`) : plainSentences(c.expected, { codes: "message" }) || plain(c.expected);
  return {
    ref: c.id,
    title,
    area: lib ? areaOfFeature(lib.feature, sectionWords(c.section)) : sectionWords(c.section),
    priority: priorityInWords(c.priority),
    type: typeInWords(lib?.type, lib?.expected, c.title),
    preconditions: plain(c.setup),
    steps,
    expected,
    why: plainSentences(c.why) || undefined,
    details: rows(
      detail("Ref", c.id, "code"),
      lib ? detail("Runs as", lib.id, "code") : null,
      title !== c.title ? detail("Title as written", c.title) : null,
      lib ? detail("Request", `${lib.method} ${lib.path}`, "code") : null,
      lib?.body !== undefined ? detail("Request body", lib.body) : null,
      detail("Steps as written", steps.join(" ") !== c.steps ? c.steps : ""),
      detail("Expected as written", expected !== c.expected ? c.expected : ""),
      detail("How it is checked", c.oracle),
      detail("Rule in the code", ruleRefs(c.expected, c.oracle, c.source)),
      detail("Trace", c.source),
    ),
  };
}

/** A runnable library case (EDGE-…, VBU-…, api-cases.json) in plain words. */
export function displayLibraryCase(t: TestCaseRecord): CaseDisplay {
  const twin = twinOf(t.id);
  const bulk = !!t.bulk && t.bulk.kind !== "http";
  const title = titleWords(twin ? plain(twin.title, { codes: "drop" }) : titleFromIdentifier(t.title));
  const steps = twin ? plainSteps(twin.steps) : plainSteps(t.steps);
  const pre = plain(twin?.setup || t.preconditions);
  return {
    ref: t.id,
    title,
    area: areaOfFeature(t.feature),
    priority: priorityInWords(t.priority),
    type: typeInWords(t.type, t.expected, title),
    preconditions: pre,
    steps: steps.length ? steps : [`Send ${endpointInWords(t.method, t.path)} with the change this case is about`, "Read the app's answer"],
    expected: expectedFor(t.expected, `${t.expectedResult ?? ""} ${twin?.oracle ?? ""}`, bulk ? t.bulk : undefined),
    why: plainSentences(twin?.why || t.rationale) || undefined,
    details: rows(
      detail("Ref", t.id, "code"),
      twin ? detail("Written case", twin.id, "code") : null,
      title !== t.title ? detail("Name in the library", t.title, "code") : null,
      detail("Request", `${t.method} ${t.path}`, "code"),
      t.body !== undefined ? detail("Request body", t.body) : null,
      detail("What the app must do", { accept: "accept it", reject: "refuse it", "no-5xx": "not crash (any answer below 500)" }[t.expected] ?? t.expected),
      detail("Technical expectation", t.expectedResult),
      detail("How it is checked", twin?.oracle),
      detail("Preconditions as written", pre !== t.preconditions ? t.preconditions : ""),
      detail("Rule in the code", t.rule || ruleRefs(t.expectedResult, twin?.source)),
      detail("Not fully checked", t.weakReason),
      detail("Cannot run here", t.notRunnable),
      detail("Severity", t.severity),
    ),
  };
}

/** Any case by id, from whichever source holds it. */
export function displayCase(id: string): CaseDisplay | null {
  const lib = library().get(id);
  if (lib) return displayLibraryCase(lib);
  const c = catalog().get(id);
  if (c) return displayCatalogCase(c);
  return null;
}

// ── a result, after it ran ─────────────────────────────────────────────────

/** A check result as the engine writes it (CheckResult), loosely typed on purpose. */
export interface ResultRow {
  id: string;
  scenario?: string;
  module?: string;
  category?: string;
  type?: string;
  priority?: string;
  severity?: string;
  expected?: string;
  expectedResult?: string;
  preconditions?: string;
  steps?: string[];
  field?: string;
  inputSummary?: string;
  request?: { method: string; path: string; body?: unknown };
  httpStatus?: number | null;
  accepted?: boolean;
  message?: string | null;
  durationMs?: number;
  pass?: boolean;
  inconclusive?: boolean;
  verdict?: string;
  _running?: boolean;
  _rerunning?: boolean;
  knownBug?: { id: string; status: string; title?: string };
  weakenedTo5xxOnly?: string;
  flowId?: string;
}

/** The app's message, split from any code the runner appended. */
function messageParts(message: string | null | undefined): { text?: string; code?: string } {
  const m = String(message ?? "").trim();
  if (!m || m === "[object Object]") return {};
  if (/^HTTP \d{3} on (GET|POST|PATCH|PUT|DELETE)\b/.test(m)) return {};
  if (/Timeout|ECONN|socket|at .*\(|browserContext|apiRequestContext/i.test(m)) return {};
  const code = m.match(/\(code (\d+)\)/)?.[1];
  return { text: m.replace(/\s*\(code \d+\)/, "").trim(), code };
}

/** Verdict word + the one-sentence reason, from the engine's own verdict. */
export function verdictInWords(r: ResultRow): { verdict: VerdictWord; reason: string } {
  const v = String(r.verdict ?? "");
  if (r._running || r._rerunning || /^running/.test(v)) return { verdict: "Not run", reason: "Running now." };
  if (/^not run yet|^never ran/i.test(v)) return { verdict: "Not run", reason: v.replace(/^never ran\s*—?\s*/i, "") ? cap(plain(v.replace(/^never ran\s*—?\s*/i, ""))) : "This step did not run." };
  const said = messageParts(r.message).text;
  if (r.inconclusive) {
    if (/authentication failed|401/.test(v)) return { verdict: "Couldn't tell", reason: "The app did not let the test account in, so nothing this case is about was checked." };
    if (/DIFFERENT reason/.test(v)) {
      const got = v.match(/got "([^"]+)"/)?.[1];
      return { verdict: "Couldn't tell", reason: `The app refused it for a different reason${got ? ` (“${got}”)` : ""}, so the rule this case is about was never reached — usually a setting or record on this account, not a bug.` };
    }
    if (/record under test was not usable/.test(v)) {
      const said2 = v.match(/answered "([^"]+)"/)?.[1];
      return { verdict: "Couldn't tell", reason: `The record this case acts on was not usable${said2 ? ` (“${said2}”)` : ""}, so nothing was proved either way.` };
    }
    if (/^blocked by sandbox master data/.test(v)) return { verdict: "Couldn't tell", reason: cap(plain(v.replace(/\s*\[[^\]]*\]\s*$/, ""))) + "." };
    return { verdict: "Couldn't tell", reason: cap(plain(v.replace(/\s*\[[^\]]*\]\s*$/, ""))) || "The run could not decide either way." };
  }
  if (r.pass) {
    if (/handled safely — served/.test(v)) return { verdict: "Passed", reason: "The app handled it without breaking — it accepted the request." };
    if (/handled safely — refused/.test(v)) return { verdict: "Passed", reason: "The app handled it without breaking — it refused the request cleanly." };
    const refusedSaid = v.match(/^correctly refused\s*\(:?\s*([^)]*)\)/i)?.[1]?.replace(/^HTTP \d{3}:?\s*/, "").trim();
    if (/^correctly refused/i.test(v)) return { verdict: "Passed", reason: `The app refused it, as it should${refusedSaid || said ? `: “${refusedSaid || said}”` : ""}.` };
    if (/correctly rejected/.test(v)) return { verdict: "Passed", reason: `The app refused it, as it should${said ? `: “${said}”` : ""}.` };
    if (/accepted, as expected/.test(v)) return { verdict: "Passed", reason: "The app accepted it, as it should." };
    return { verdict: "Passed", reason: cap(plain(v.replace(/\s*\[[^\]]*\]\s*$/, ""))) || "It did what the case expects." };
  }
  if (/server error|5xx/.test(v) || (r.httpStatus ?? 0) >= 500) return { verdict: "Failed", reason: "The app broke with a server error — that is always a bug." };
  if (/^ACCEPTED input/.test(v)) return { verdict: "Failed", reason: "The app accepted something it should have refused." };
  if (/^REJECTED a valid/.test(v)) return { verdict: "Failed", reason: `The app refused a valid request${said ? `: “${said}”` : ""}.` };
  return { verdict: "Failed", reason: cap(plain(v.replace(/\s*\[[^\]]*\]\s*$/, ""))) || "It did not do what the case expects." };
}

/** What actually came back, in words. */
export function actualInWords(r: ResultRow): string {
  if (r._running || r._rerunning) return "Running…";
  const v = String(r.verdict ?? "");
  if (/^not run yet|^never ran/i.test(v)) return "Not run.";
  if (/every row came out|^row \d+:|rows? came out|expected columns|blocked by sandbox/.test(v)) return cap(plain(v.replace(/\s*\[[^\]]*\]\s*$/, ""))) + ".";
  if (r.category === "plan step" || r.category === "PO flow") return cap(plain(v.replace(/\s*·\s*\d+ms$/, ""))) + ".";
  const st = r.httpStatus;
  const { text } = messageParts(r.message);
  if (st === null || st === undefined) return r.accepted === undefined ? cap(plain(v)) : "No answer came back from the app.";
  if (st >= 500) return "The app broke with a server error.";
  if (st === 401) return text ? `The app turned it away: “${text}”.` : "The app did not let the test account in.";
  if (st === 403) return text ? `The app turned it away: “${text}”.` : "The app turned it away (not allowed).";
  if (r.accepted) return "The app accepted the request.";
  return text ? `The app refused it: “${text}”.` : "The app refused it.";
}

/** A check result — library case, AI-written check, plan step or PO phase — as a finished test case. */
export function displayResult(r: ResultRow): CaseDisplay {
  const base = displayCase(r.id);
  const { verdict, reason } = verdictInWords(r);
  const actual = actualInWords(r);
  const { text: said, code } = messageParts(r.message);
  const req = r.request;
  const known: Record<string, string> = {};
  const resolved = [...new Set(`${req?.path ?? ""} ${JSON.stringify(req?.body ?? "")}`.match(ID_TOKEN) ?? [])];
  const resultDetails = rows(
    req ? detail("Request as sent", `${req.method} ${req.path}`, "code") : detail("Input", r.inputSummary, "code"),
    req?.body !== undefined ? detail("Body as sent", req.body) : null,
    detail("HTTP status", r.httpStatus ?? (r.httpStatus === null ? "no reply" : undefined), "code"),
    said ? detail("The app said", said) : detail("The app said", r.message && r.message !== "[object Object]" ? r.message : ""),
    code || messageNamed(r.message ?? "") ? detail("Error code", code ? `${code}${errorMessage(code) ? ` — ${errorMessage(code)}` : ""}` : "", "code") : null,
    detail("Engine verdict", r.verdict),
    detail("Ids used", resolved.join(", "), "code"),
    detail("Took", r.durationMs !== undefined ? `${Math.round(r.durationMs)} ms` : ""),
    r.knownBug ? detail("Known bug", `${r.knownBug.id} · ${r.knownBug.status}${r.knownBug.title ? ` — ${r.knownBug.title}` : ""}`) : null,
    detail("Not fully checked", r.weakenedTo5xxOnly),
  );
  if (base) return { ...base, actual: scrubIds(actual, known), verdict, reason: scrubIds(reason, known), details: [...base.details, ...resultDetails] };
  // Not in any library: an AI-written check, a compiled plan step or a PO phase.
  const title = titleWords(titleFromIdentifier(r.scenario ?? r.id));
  const isStep = r.category === "plan step" || r.category === "PO flow";
  return {
    ref: r.id,
    title,
    area: areaOfFeature(r.module, r.module && !/^AI-generated$/.test(r.module) ? plain(r.module) : "Written by the AI for this request"),
    priority: priorityInWords(r.priority),
    type: isStep ? "Workflow" : typeInWords(r.category ?? r.type, r.expected, title),
    preconditions: plain(r.preconditions),
    steps: r.steps?.length ? plainSteps(r.steps) : req ? [`Send ${endpointInWords(req.method, req.path)}`, "Read the app's answer"] : [],
    expected: isStep ? "This step completes." : expectedFor(r.expected, r.expectedResult),
    actual: scrubIds(actual, known),
    verdict,
    reason: scrubIds(reason, known),
    details: rows(detail("Ref", r.id, "code"), title !== r.scenario ? detail("Name as written", r.scenario) : null, detail("Technical expectation", r.expectedResult), ...resultDetails),
  };
}

// ── field checks and journey steps ─────────────────────────────────────────

export interface FieldCheckResult {
  id: string;
  path: string;
  op: string;
  title?: string;
  expected?: string;
  severity?: string;
  humanTitle?: string;
  humanExpected?: string;
  humanActual?: string;
  pass: boolean | null;
  actual?: string;
}
interface StepLike {
  n: number;
  kind: StepKind;
  actor: string;
  title: string;
  expected?: string;
  actual?: string;
  verdict?: string;
  reason?: string;
  call?: { method: string; path: string; body?: unknown };
  status?: number;
  ms?: number;
  message?: string;
  errorCode?: string;
  produced?: Record<string, string>;
}

const PRODUCED_WORD: Record<string, string> = {
  eventGroupUuid: "the event",
  lineItemUuid: "the line item",
  technicalTradeUuid: "the technical round",
  pricingTradeUuid: "the pricing round",
  auctionTradeUuid: "the auction round",
  bidUuid: "the bid",
  proposalUuid: "the award proposal",
  vendorCompanyUuid: "the vendor's company",
};
/** id value → its name, from what a journey produced. */
export function knownIds(made: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(made ?? {})) {
    if (typeof v !== "string" || !v) continue;
    out[v] = PRODUCED_WORD[k] ?? MADE_WORD[k]?.replace(/ (created|added|opened|raised) .*$/, "") ?? `the ${words(k.replace(/(Uuid|Id)$/, ""))}`;
  }
  return out;
}

export function displayFieldCheck(r: FieldCheckResult, step: StepLike, known: Record<string, string> = {}): CaseDisplay {
  const who = step.actor === "platform" ? "the platform" : `the ${step.actor}`;
  const field = r.path ? fieldPhrase(r.path, step.kind) : "";
  const title = scrubIds(plain(r.humanTitle ?? r.title ?? r.id), known);
  const verdict: VerdictWord = r.pass === true ? "Passed" : r.pass === false ? "Failed" : "Couldn't tell";
  return {
    ref: r.id,
    title,
    area: `API journey › ${step.title}`,
    priority: r.severity === "critical" ? "P0 · critical" : r.severity === "major" ? "P1 · high" : r.severity === "minor" ? "P2 · medium" : "",
    type: "Positive",
    preconditions: `The API journey has reached “${step.title}”.`,
    steps: [`As ${who}, do “${step.title}”`, field ? `Look at ${field} in the app's response` : "Look at the app's answer"],
    expected: plain(r.humanExpected ?? r.expected ?? ""),
    actual: scrubIds(plain(r.humanActual ?? r.actual ?? ""), known),
    verdict,
    reason: r.pass === null ? scrubIds(r.humanActual ?? "It could not be checked on this reply.", known) : r.pass ? "The response matched." : "The response did not match what the check expects.",
    details: rows(
      detail("Ref", r.id, "code"),
      detail("Field", r.path || "(the whole reply)", "code"),
      detail("Check", `${r.op}${r.expected ? ` — ${r.expected}` : ""}`, "code"),
      detail("Seen", r.actual, "code"),
      step.call ? detail("Request", `${step.call.method} ${step.call.path}`, "code") : null,
    ),
  };
}

const STEP_VERDICT: Record<string, VerdictWord> = { worked: "Passed", refused: "Failed", broken: "Failed", "not-run": "Not run" };
export function displayJourneyStep(step: StepLike, journeyMade: Record<string, unknown> = {}): CaseDisplay {
  const known = { ...knownIds(journeyMade), ...knownIds(step.produced) };
  const verdict = STEP_VERDICT[step.verdict ?? ""] ?? (step.verdict ? "Couldn't tell" : "Not run");
  const said = messageParts(step.message).text;
  const reason =
    step.verdict === "worked"
      ? "The app did what this step asks."
      : step.verdict === "broken"
        ? "The app broke with a server error, or did not answer — that is always a bug."
        : step.verdict === "refused"
          ? `The app refused this step${said ? `: “${said}”` : ""}.`
          : scrubIds(plain(step.reason ?? "It did not run."), known);
  return {
    ref: `step ${step.n}`,
    title: step.title,
    area: "API journey",
    priority: "",
    type: "Workflow",
    preconditions: "",
    steps: [step.title],
    expected: scrubIds(step.expected, known),
    actual: scrubIds(plain(step.actual ?? ""), known),
    verdict,
    reason,
    details: rows(
      step.call ? detail("Request", `${step.call.method} ${step.call.path}`, "code") : null,
      step.call?.body !== undefined ? detail("Body", step.call.body) : null,
      detail("HTTP status", step.status, "code"),
      detail("The app said", step.message),
      detail("Error code", step.errorCode ? `${step.errorCode}${errorMessage(step.errorCode) ? ` — ${errorMessage(step.errorCode)}` : ""}` : "", "code"),
      detail("Took", step.ms !== undefined ? `${Math.round(step.ms)} ms` : ""),
      detail("Ids produced", Object.entries(step.produced ?? {}).map(([k, v]) => `${words(k.replace(/Uuid$/, ""))}: ${v}`).join(" · "), "code"),
      detail("Actual as recorded", step.actual !== scrubIds(plain(step.actual ?? ""), known) ? step.actual : ""),
    ),
  };
}

// ── a case's record across runs, in words ──────────────────────────────────

export interface TrackRecord {
  runs: number;
  passed: number;
  failed: number;
  inconclusive: number;
  lastVerdict?: string;
  lastSeen?: string;
  flaky?: boolean;
  none?: boolean;
}
/** "Passed 6 of the last 13 runs · flaky" */
export function trackRecordInWords(t: TrackRecord | null | undefined): string {
  if (!t || t.none || !t.runs) return "";
  const every = t.runs === 1 ? "its only run" : `all ${t.runs} runs`;
  if (t.passed === t.runs) return `Passed ${every}`;
  if (t.failed === t.runs) return `Failed ${every}`;
  if (t.inconclusive === t.runs) return `Couldn't tell in ${every}`;
  const parts = [`Passed ${t.passed} of the last ${t.runs} runs`];
  if (t.failed) parts.push(`failed ${t.failed}`);
  if (t.inconclusive) parts.push(`couldn't tell ${t.inconclusive}`);
  if (t.flaky) parts.push("flaky");
  return parts.join(" · ");
}
