/**
 * TEST-CASE SHEETS — the team's manual sheets (13 columns: Test Case ID, Module, Scenario, Test Case
 * Title, User Role, Portal, Pre-conditions, Test Data, Test Steps, Expected Result, Priority, Test Type,
 * Status) as runnable catalog cases.
 *
 *   importSheetFile / importSheetBuffer   read an .xlsx or .csv, keep its cases in data/sheet-cases.json
 *   sheetCatalogCases                     every imported case as a CatalogCase (testCatalog merges them,
 *                                         so typing "SRC-AWD-012" in Run tests finds it)
 *   findSheetCase                         an ID or a title typed in Run tests → the full sheet case
 *   sheetPrep                             what event the case starts from (its pre-conditions), so the run
 *                                         builds that event by API and opens the right screen first
 *
 * The sourcing sheet (docs/test-cases/Procol-Sourcing-Test-Cases-PR-to-PO.xlsx) is imported on first use.
 */
import { strategyIn, type AuctionStrategy } from "../ui/uiCasePrep.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import type { CatalogCase } from "./testCatalog.js";
import type { UiState } from "../ui/uiSetup.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const STORE = join(ROOT, "data", "sheet-cases.json");
export const DEFAULT_SHEET = join(ROOT, "..", "docs", "test-cases", "Procol-Sourcing-Test-Cases-PR-to-PO.xlsx");

export interface SheetCase {
  id: string;
  sheet: string;
  module: string;
  scenario: string;
  title: string;
  role: string;
  portal: string;
  preconditions: string;
  /** "Configs Needed": company settings this case needs, `key = On|Off|value — why` per line, or "None". */
  configs?: string;
  testData: string;
  steps: string[];
  expected: string;
  priority: string;
  testType: string;
  status: string;
  /** "Reference": where the case comes from (a ticket id, a document) — shown, never compiled. */
  reference?: string;
  /** generated cases: the basis sentence for this case ("Why this case") and the PRD line / rule / ticket it comes from */
  why?: string;
  source?: string;
  /** generated cases: the catalog case this one duplicates ("already have it"), when there is one */
  twin?: string;
  layer: "ui" | "api";
}
export interface SheetInfo { id: string; name: string; file: string; importedAt: string; count: number; skipped: number }
interface Store { sheets: SheetInfo[]; cases: SheetCase[] }

// header words → column, so a sheet with "Steps" or "Expected" or "Preconditions" still reads
const HEAD: Array<[RegExp, keyof SheetCase]> = [
  [/^(test ?case ?id|tc ?id|case ?id|id)$/i, "id"],
  [/^(module|feature|area)$/i, "module"],
  [/^(scenario|sub ?module)$/i, "scenario"],
  [/^(test ?case ?title|title|test ?case|test ?case ?name|summary|description)$/i, "title"],
  [/^(user ?role|role|actor)$/i, "role"],
  [/^(portal|platform|app|application|layer)$/i, "portal"],
  [/^(pre-?conditions?|preconditions?|setup|pre ?requisites?)$/i, "preconditions"],
  [/^(configs?( ?needed)?|settings?( ?needed)?|company settings?|configurations?( ?needed)?)$/i, "configs"],
  [/^(test ?data|data|input|inputs)$/i, "testData"],
  [/^(test ?steps|steps|steps to reproduce|procedure)$/i, "steps"],
  [/^(expected ?results?|expected|expected ?outcome)$/i, "expected"],
  [/^(priority|severity)$/i, "priority"],
  [/^(test ?type|type|case ?type)$/i, "testType"],
  [/^(status|result|actual ?status)$/i, "status"],
  [/^(reference|refs?|source|ticket|ticket ?id)$/i, "reference"],
];

let cache: Store | null = null;
function load(): Store {
  if (cache) return cache;
  if (existsSync(STORE)) {
    try {
      cache = JSON.parse(readFileSync(STORE, "utf8")) as Store;
      return cache;
    } catch {
      /* rebuild below */
    }
  }
  cache = { sheets: [], cases: [] };
  if (existsSync(DEFAULT_SHEET)) {
    try {
      importSheetBuffer(basename(DEFAULT_SHEET), readFileSync(DEFAULT_SHEET));
    } catch (e) {
      console.warn(`[sheets] could not import the sourcing sheet: ${(e as Error).message}`);
    }
  }
  return cache!;
}
function save(): void {
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(cache, null, 1));
}

const slug = (s: string) => s.toLowerCase().replace(/\.(xlsx|xls|csv)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "sheet";

/** The step list from a cell: "1. Log in…\n2. Open…" or "Log in…; Open…". */
export function splitSteps(cell: string): string[] {
  const t = String(cell ?? "").replace(/\r/g, "").trim();
  if (!t) return [];
  let parts = t.split(/\n+/);
  if (parts.length === 1) parts = t.split(/\s(?=\d+[.)]\s)/);
  return parts.map((s) => s.replace(/^\s*(step\s*)?\d+\s*[.):-]\s*/i, "").trim()).filter(Boolean);
}

function layerOf(c: Pick<SheetCase, "portal" | "steps" | "title">): "ui" | "api" {
  const t = `${c.portal} ${c.title} ${c.steps.join(" ")}`;
  return /\bapi\b|endpoint|status code|\b(get|post|put|patch|delete) \/|request body|response body|json schema/i.test(t) && !/vendor portal|buyer portal/i.test(c.portal) ? "api" : "ui";
}

/** Parse a sheet file. Rows without a title or steps are skipped (and counted). */
export function parseSheet(name: string, buf: Buffer): { cases: Omit<SheetCase, "sheet">[]; skipped: number; sheetName: string } {
  const wb = XLSX.read(buf, { type: "buffer" });
  // the first sheet that has a steps column
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], { defval: "", raw: false });
    if (!rows.length) continue;
    const map = new Map<string, keyof SheetCase>();
    for (const h of Object.keys(rows[0])) {
      const hit = HEAD.find(([re]) => re.test(h.trim()));
      if (hit && ![...map.values()].includes(hit[1])) map.set(h, hit[1]);
    }
    if (![...map.values()].includes("steps") || ![...map.values()].includes("title")) continue;
    const cases: Omit<SheetCase, "sheet">[] = [];
    let skipped = 0;
    rows.forEach((row, i) => {
      const v: Record<string, string> = {};
      for (const [h, k] of map) v[k] = String(row[h] ?? "").trim();
      const steps = splitSteps(v.steps);
      if (!v.title || !steps.length) {
        skipped++;
        return;
      }
      const base = {
        id: v.id || `${slug(name).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
        module: v.module || "-", scenario: v.scenario || "-", title: v.title, role: v.role || "Buyer", portal: v.portal || "Buyer portal",
        preconditions: v.preconditions || "-", configs: v.configs || "None", testData: v.testData || "-", steps, expected: v.expected || "-",
        priority: v.priority || "Medium", testType: v.testType || "Positive", status: v.status || "Not Run", reference: v.reference || undefined,
      };
      cases.push({ ...base, layer: layerOf(base) });
    });
    return { cases, skipped, sheetName: sn };
  }
  throw new Error("no sheet in this file has a \"Test Steps\" and a \"Test Case Title\" column");
}

/** Import (or re-import) a sheet. Returns its info. */
export function importSheetBuffer(name: string, buf: Buffer, id?: string): SheetInfo {
  const store = cache ?? load();
  const parsed = parseSheet(name, buf);
  const sid = id || slug(name);
  store.cases = store.cases.filter((c) => c.sheet !== sid).concat(parsed.cases.map((c) => ({ ...c, sheet: sid })));
  const info: SheetInfo = { id: sid, name, file: name, importedAt: new Date().toISOString(), count: parsed.cases.length, skipped: parsed.skipped };
  store.sheets = store.sheets.filter((s) => s.id !== sid).concat(info);
  save();
  return info;
}
/** The sheet typed cases land in (single-case mode): one case at a time, kept with the others. */
export const TYPED_SHEET = "typed-cases";
/** Add (or replace by id) cases that were typed or suggested rather than uploaded. */
export function addSheetCases(list: Array<Omit<SheetCase, "sheet" | "layer"> & { layer?: "ui" | "api" }>, sheet = TYPED_SHEET): SheetCase[] {
  const store = cache ?? load();
  const added = list.map((c) => ({ ...c, sheet, layer: c.layer ?? layerOf(c) }));
  const ids = new Set(added.map((c) => c.id.toUpperCase()));
  store.cases = store.cases.filter((c) => !(c.sheet === sheet && ids.has(c.id.toUpperCase()))).concat(added);
  const count = store.cases.filter((c) => c.sheet === sheet).length;
  const info: SheetInfo = { id: sheet, name: sheet === TYPED_SHEET ? "Typed test cases" : sheet, file: "", importedAt: new Date().toISOString(), count, skipped: 0 };
  store.sheets = store.sheets.filter((s) => s.id !== sheet).concat(info);
  save();
  return added;
}
/** The next free id in a typed sheet: TYP-001, TYP-002 … */
/** Drop cases from a sheet (the review step's "drop"); the sheet's count follows. */
export function removeSheetCases(sheet: string, ids: string[]): number {
  const store = cache ?? load();
  const want = new Set(ids.map((x) => x.toUpperCase()));
  const before = store.cases.length;
  store.cases = store.cases.filter((c) => !(c.sheet === sheet && want.has(c.id.toUpperCase())));
  const count = store.cases.filter((c) => c.sheet === sheet).length;
  store.sheets = store.sheets.map((x) => (x.id === sheet ? { ...x, count } : x));
  save();
  return before - store.cases.length;
}

/** Rename a sheet's display name (a frozen, approved set gets the feature's name and version). */
export function renameSheet(sheet: string, name: string): void {
  const store = cache ?? load();
  store.sheets = store.sheets.map((x) => (x.id === sheet ? { ...x, name } : x));
  save();
}

export function nextTypedId(prefix = "TYP", sheet = TYPED_SHEET): string {
  const n = sheetCases(sheet).map((c) => Number(c.id.match(/-(\d+)$/)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0) + 1;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
export function importSheetFile(path: string, id?: string): SheetInfo {
  return importSheetBuffer(basename(path), readFileSync(path), id);
}
export function listSheets(): SheetInfo[] {
  return load().sheets;
}
export function sheetCases(sheet?: string): SheetCase[] {
  const all = load().cases;
  return sheet ? all.filter((c) => c.sheet === sheet) : all;
}
export function sheetCaseById(id: string, sheet?: string): SheetCase | null {
  const want = id.trim().toUpperCase();
  return sheetCases(sheet).find((c) => c.id.toUpperCase() === want) ?? null;
}

const PRI: Record<string, string> = { critical: "P0", high: "P1", medium: "P2", low: "P3" };
/** A sheet case as a catalog case (what Run tests, the matcher and the case runner read). */
export function asCatalogCase(c: SheetCase): CatalogCase & { sheet: SheetCase } {
  return {
    id: c.id, layer: c.layer, group: c.id.replace(/-\d+$/, ""), section: c.module, sectionNo: 900 + (parseInt(c.module, 10) || 0),
    title: c.title, why: c.scenario, setup: [c.preconditions !== "-" ? c.preconditions : "", c.testData !== "-" ? `Test data: ${c.testData}` : ""].filter(Boolean).join(" "),
    steps: c.steps.map((s, i) => `${i + 1}. ${s}`).join(" "), expected: c.expected, oracle: "", priority: PRI[c.priority.toLowerCase()] ?? "P2",
    verdict: "automate", refs: [], source: `sheet:${c.sheet}`, sheet: c,
  };
}
export function sheetCatalogCases(): CatalogCase[] {
  return sheetCases().map(asCatalogCase);
}

/** The case as the prose the compilers read: every column a tester would read, in order. */
export function sheetCaseProse(c: SheetCase, companyId = Number(process.env.SHEET_COMPANY_ID) || 198678): string {
  const configs = c.configs && !/^(none|-|)$/i.test(c.configs.trim()) ? c.configs.trim() : "";
  const text = [
    `${c.id} — ${c.title}`,
    `Module: ${c.module}. Scenario: ${c.scenario}. Who: ${c.role} on the ${c.portal}.`,
    c.preconditions !== "-" ? `Before you start: ${c.preconditions}` : "",
    // the settings the runner switches for the case — the compiler writes require_setting for them, not a gap
    configs ? `Configs needed (the runner sets these for the case):\n${configs}` : "",
    c.testData !== "-" ? `Test data: ${c.testData}` : "",
    `Steps:\n${c.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `Expected: ${c.expected}`,
  ].filter(Boolean).join("\n");
  return mapTestData(text, companyId);
}

/**
 * Test data written for another company, mapped to what this company really has (config/test-data-map.json,
 * each entry read from the company's own records first). The text says which values were mapped and why,
 * so neither the plan nor the report hides it.
 */
export function mapTestData(text: string, companyId: number): string {
  let map: Array<{ from: string; to: string; why: string }> = [];
  try {
    map = (JSON.parse(readFileSync(join(ROOT, "config", "test-data-map.json"), "utf8")).companies?.[String(companyId)] ?? []) as typeof map;
  } catch {
    return text;
  }
  const used = map.filter((m) => text.includes(m.from));
  if (!used.length) return text;
  let out = text;
  for (const m of used) out = out.split(m.from).join(m.to);
  return `${out}\nTest data mapped to this company: ${used.map((m) => `"${m.from}" → "${m.to}" (${m.why})`).join("; ")}.`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/**
 * What was typed in Run tests → the sheet case it names: its ID, its exact title, or a title that
 * shares almost all its words. Anything looser is left to the compiler (it is a new case).
 */
export function findSheetCase(text: string): SheetCase | null {
  const t = text.trim();
  if (!t || t.length > 400) return null;
  const byId = t.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/i)?.[1];
  if (byId) {
    const c = sheetCaseById(byId);
    if (c) return c;
  }
  const n = norm(t);
  const all = sheetCases();
  const exact = all.find((c) => norm(c.title) === n);
  if (exact) return exact;
  const words = new Set(n.split(" ").filter((w) => w.length > 2));
  if (words.size < 5) return null;
  let best: { c: SheetCase; score: number } | null = null;
  for (const c of all) {
    const cw = new Set(norm(c.title).split(" ").filter((w) => w.length > 2));
    let both = 0;
    for (const w of words) if (cw.has(w)) both++;
    const score = both / Math.max(words.size, cw.size);
    if (!best || score > best.score) best = { c, score };
  }
  return best && best.score >= 0.85 ? best.c : null;
}

// ── where a case starts: the set-up events of the sourcing sheet, and free-text pre-conditions ──
interface SetupEvent { names: RegExp; state: UiState | null; technical?: boolean; auction?: boolean; setup: string; note?: string; shape?: SheetPrep["shape"] }
/** The sourcing sheet's set-up events are all the same RFQ: 10 units, Vendor A quoted 100 and Vendor B quoted 90 (SRC-SET-002..004 test data). */
const A100_B90 = { quantity: 10, prices: [100, 90] };
const SETUP_EVENTS: Record<string, SetupEvent> = {
  "SRC-SET-001": { names: /live rfq \(no bids\)/i, state: "live", setup: "A live RFQ published with QA vendors invited and no bid yet." },
  "SRC-SET-002": { names: /rfq with two bids/i, state: "two_bids", shape: A100_B90, setup: "A live RFQ for 10 units where Vendor A (the first QA vendor) quoted 100 and Vendor B (the second) quoted 90." },
  "SRC-SET-003": { names: /rfq in evaluation/i, state: "closed_two_bids", shape: A100_B90, setup: "A closed RFQ for 10 units where Vendor A quoted 100 and Vendor B quoted 90, just after bidding ended.", note: "the API set-up closes bidding; whether an evaluation window is still running depends on the company's default evaluation time" },
  "SRC-SET-004": { names: /closed rfq/i, state: "closed_two_bids", shape: A100_B90, setup: "A closed RFQ for 10 units where Vendor A quoted 100 and Vendor B quoted 90, not awarded." },
  "SRC-SET-005": { names: /upcoming rfq/i, state: "upcoming", setup: "An upcoming RFQ whose bidding starts later." },
  "SRC-SET-006": { names: /live reverse auction/i, state: "live", auction: true, setup: "A live reverse auction." },
  "SRC-SET-007": { names: /live forward auction/i, state: "forward", auction: true, setup: "A live forward auction (a sell-side auction round: the price climbs) with two QA vendors invited." },
  "SRC-SET-008": { names: /tech\+rfq project|technical \+ rfq project/i, state: "live", technical: true, setup: "A live eRFX project with a Technical stage and an RFQ stage." },
  "SRC-SET-009": { names: /draft project/i, state: "draft", setup: "A draft RFQ saved and not published." },
  "SRC-SET-010": { names: /pr-based rfq/i, state: "pr_rfq", setup: "A live RFQ made from an open purchase request's material line (linked to the PR)." },
  "SRC-SET-011": { names: /awarded event with po/i, state: "awarded", setup: "An awarded RFQ whose proposal went into approval." },
  "SRC-SET-012": { names: /withdrawn event/i, state: "withdrawn", setup: "A published RFQ withdrawn by the buyer with a remark." },
  "SRC-SET-013": { names: /service rfq/i, state: null, setup: "A service RFQ.", note: "the API set-up does not build service events yet" },
};

export interface SheetPrep {
  /** build this state by API and open `screen` first */
  prepared: boolean;
  state: UiState;
  screen: string;
  screenWhat: string;
  technical: boolean;
  auction?: boolean;
  /** what the case starts from, in words */
  why: string;
  /** a difference between what the case asks for and what is built (shown on the report) */
  note?: string;
  /** the case starts from something the API cannot build: the run says so instead of guessing */
  unbuilt?: string;
  /** the event's shape when the pre-conditions state it: line items, quantity, each bidder's price (uiSetup StateShape) */
  shape?: { lines?: number; quantity?: number; prices?: number[]; product?: string };
  /** the auction strategy the pre-conditions name (dynamic time extension, traffic light) — built into the API-made round */
  strategy?: AuctionStrategy;
}

const WHAT: Record<string, string> = {
  summary: "the event's summary page", responses: "the pricing round's Responses tab", overview: "the pricing round's Overview tab",
  participants: "the pricing round's Participants tab", master_qcs: "Master QCS", analytics: "the pricing round's Analytics tab",
  proposal: "the award proposal page", technical: "the technical round", draft: "the draft event's create screen (reopened)", drafts_list: "the Drafts tab of the events list",
};
/** The steps without the navigation every case repeats (it names tabs and lists that are not the subject). */
function subjectText(c: SheetCase): string {
  return [c.title, ...c.steps.filter((s) => !/^(log in|from the left menu click|find .+: type its title|open the event|on the stage page click "settings")/i.test(s)), c.expected].join(" ").toLowerCase();
}
function screenFor(c: SheetCase, state: UiState): string {
  const t = subjectText(c);
  if (state === "draft") return "draft";
  if (/withdraw|recreate order|extend submission|reschedule|order activity|three dots|project details/.test(t)) return "summary";
  if (/counter offer|reject bid|select quote|select bid|edit bid/.test(t)) return "responses";
  if (/proposal page|allocation summary|submit proposal|letter of award/.test(t) && (state === "proposal" || state === "awarded")) return "proposal";
  if (/master qcs|start awarding|download report|rank 1|ranks?/.test(t) && state !== "live" && state !== "upcoming") return "master_qcs";
  if (state === "converted" && /master qcs|rank|amount|price/.test(t)) return "master_qcs";
  if (/participants tab|add bid|surrogate|add price cap|weight param|search vendors/.test(t)) return "participants";
  if (/responses|counter offer|reject bid|select quote|select bid|edit bid|revision|revise/.test(t)) return "responses";
  if (/overview|participation \d/.test(t)) return "overview";
  if (/analytics|price trends/.test(t) && state !== "live" && state !== "upcoming") return "analytics";
  if (/technical stage|questionnaire|evaluator|score/.test(t)) return "technical";
  return "summary";
}
/** What the pre-conditions say the event is, when they describe one in words. */
function stateFromWords(pre: string): UiState | null {
  const t = pre.toLowerCase();
  if (/^(-|the buyer can create events|the buyer can see purchase requisitions)/.test(t.trim()) || !t.trim()) return null;
  if (!/\b(event|rfq|auction|project|stage|proposal|award|bid|quote)/.test(t)) return null;
  if (/\b(po|purchase order) (is )?(created|generated)|awarded/.test(t)) return "awarded";
  if (/already converted|converted (to|into) an? auction|after (the )?conversion/.test(t)) return "converted";
  if (/proposal/.test(t)) return "proposal";
  if (/service/.test(t)) return null;
  if (/from a pr\b|pr line|pr-based/.test(t)) return "pr_rfq";
  if (/withdrawn/.test(t) && !/withdrawn (approval|request|proposal)/.test(t)) return "withdrawn";
  if (/forward auction/.test(t)) return "forward";
  if (/dutch/.test(t) && !/convert/.test(t)) return "dutch";
  if (/knock-?out|japanese/.test(t) && !/convert/.test(t)) return "knockout";
  const twoBids = (/two bids|two vendors|2 vendors|both vendors|second vendor/.test(t) && /\bbids?\b|quoted/.test(t)) || /vendor a\b[^.]{0,40}\b(quoted|bid|bids|at)\b[^.]{0,60}\bvendor b\b/.test(t);
  // two bids AND the window over: the awarding cases' "a closed RFQ where Vendor A quoted 100 and Vendor B quoted 90"
  if (twoBids && /closed|evaluation|ended|is over|finished|after the close|award/.test(t)) return "closed_two_bids";
  if (twoBids) return "two_bids";
  if (/closed|evaluation|ended|is over|finished|after the close/.test(t)) return "closed";
  // "no bid yet" / "without a bid" is the live state, not the bid state
  if (/\bno bids?\b|without (a |any )?bids?\b|not (yet )?bid|unbid/.test(t)) return /\blive\b|published/.test(t) ? "live" : "upcoming";
  if (/quoted|\bbids?\b|has bid|bidding with/.test(t)) return "bid";
  if (/upcoming|starts (later|tomorrow)|not started/.test(t)) return "upcoming";
  // "has not yet been published" / "unpublished" / "before publish" is the draft, however the sentence goes on
  // (12 Nov: a flow "configured … not yet published" was built live and its schedule could not be set)
  if (/\b(not (yet )?(been )?published|unpublished|not (yet )?live|before (it is |the )?publish)/.test(t)) return "draft";
  if (/\bdraft\b/.test(t)) return "draft";
  if (/\blive\b|published|existing event|on a .*(rfq|auction|project)/.test(t)) return "live";
  return null;
}


/** The compiler's view of a prepared start state — every caller composes it here, so the auction flag and the strategy never go missing (16 Nov). */
export function compilePrepared(sp: { state: UiState; screen: string; screenWhat: string; technical?: boolean; shape?: SheetPrep["shape"]; auction?: boolean; strategy?: AuctionStrategy }, valueKeys: string[]) {
  return { state: sp.state, screen: sp.screen, screenWhat: sp.screenWhat, valueKeys, technical: !!sp.technical, ...(sp.shape ? { shape: sp.shape } : {}), ...(sp.auction ? { auction: true } : {}), ...(sp.strategy ? { strategy: sp.strategy } : {}) };
}

export function sheetPrep(c: SheetCase): SheetPrep | null {
  if (c.id.startsWith("SRC-SET-")) return null; // the set-up cases build their events through the screens
  const pre = c.preconditions;
  const ids = [...pre.matchAll(/\bSRC-SET-\d{3}\b/g)].map((m) => m[0]);
  const ev = Object.entries(SETUP_EVENTS).find(([id, e]) => ids.includes(id) || e.names.test(pre))?.[1];
  if (ev && !ev.state) return { prepared: false, state: "none", screen: "summary", screenWhat: "the event", technical: false, why: ev.setup, unbuilt: ev.note ?? "the API set-up does not build this event yet" };
  // a case that creates its event (the create screen, a PR) needs nothing built
  const creates = c.steps.some((s) => /click the blue "create event"|purchase items|^from the left menu click "purchase requisitions"/i.test(s)) && !ev;
  if (creates) return null;
  let state = ev?.state ?? stateFromWords(pre);
  if (!state) return null;
  const t = `${pre} ${c.title}`.toLowerCase();
  const technical = !!ev?.technical || /technical stage|tech\+rfq|technical \+ rfq/.test(t);
  const auction = ev?.auction ?? (/\bauction\b/.test(t) && !/convert/.test(t));
  // "the finished … auction: the result after it ends — Master QCS ranks the final bids" (16 Nov): a closed round
  // with TWO bidders, so there is a ranking to judge (one bid is rank 1 whatever the rule)
  if (!ev && state === "closed" && /ranks? (the )?(final )?bids|lowest wins|highest wins|final bids/i.test(`${c.expected} ${c.title}`)) state = "closed_two_bids";
  const strategy = auction ? strategyIn(t) : undefined;
  const screen = screenFor(c, state);
  const shape = ev?.shape ?? shapeFromWords(`${pre} ${c.testData !== "-" ? c.testData : ""}`);
  return { prepared: true, state, screen, screenWhat: WHAT[screen] ?? screen, technical, auction: auction || undefined, why: ev?.setup ?? pre, note: ev?.note, ...(shape ? { shape } : {}), ...(strategy ? { strategy } : {}) };
}

/**
 * The event's shape when the case's words state it — "a closed RFQ for 10 units where Vendor A quoted 100 and
 * Vendor B quoted 90", "two line items", "Vendor A at 100 / 50" (per line: the first line's price is used). Only
 * numbers the words give; nothing is guessed. Vendor A is the first QA vendor, Vendor B the second.
 */
export function shapeFromWords(text: string): SheetPrep["shape"] | undefined {
  const t = text.replace(/₹\s*/g, "").replace(/,(?=\d{2,3}\b)/g, "");
  const shape: NonNullable<SheetPrep["shape"]> = {};
  const lines = t.match(/\b(two|three|four|2|3|4) (line items|lines|products)\b/i)?.[1];
  if (lines) shape.lines = ({ two: 2, three: 3, four: 4 } as Record<string, number>)[lines.toLowerCase()] ?? Number(lines);
  const qty = t.match(/\b(\d{1,5}) (units|unit|nos|pcs|pieces|kg|kgs)\b/i) ?? t.match(/\bquantity (?:of |requested )?(\d{1,5})\b/i);
  if (qty) shape.quantity = Number(qty[1]);
  const price = (who: string) => t.match(new RegExp(`\\bvendor ${who}\\b[^.;]{0,25}?\\b(?:quoted|quotes|bid|bids|at|priced at|offered)\\s+(\\d+(?:\\.\\d+)?)`, "i"))?.[1];
  const a = price("a"), b = price("b");
  if (a && b) shape.prices = [Number(a), Number(b)];
  else if (a) shape.prices = [Number(a)];
  // the product the words name (17 Nov): product "CYLINDER WITH KEY & KNOB" / Add CYLINDER WITH KEY & KNOB with quantity 10 —
  // the API-built event then carries that product, so a check that reads its name on screen can hold
  const prod = text.match(/\bproduct\s+[“"']([^”"']{3,80})[”"']/i)?.[1] ?? text.match(/\badd\s+([A-Z][A-Z0-9 &\-\/.]{3,70}?)\s+with quantity/)?.[1];
  if (prod) shape.product = prod.trim();
  return Object.keys(shape).length ? shape : undefined;
}
