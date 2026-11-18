/**
 * DERIVE TEST CASES FROM ANYTHING — a feature phrase ("test reject bid"), a flow, a PRD, one test case, a
 * HubSpot ticket. What a senior tester does with a blank sheet: work out the SUBJECT, then walk the
 * permutations that can break it — who does it (and who is not allowed to), in which state of the event,
 * under which company settings, with which awkward values, at which awkward moment — and write every cell
 * that means something as a plain-English case in the team's house columns.
 *
 * Grounding (the model proposes, the code decides what it may cite):
 *   • Procol's own code rules (data/rules/events-rules.json, 3,713 statements each cited to a file and line) —
 *     permission, validation, state, calculation, visibility, time and config rules matching the subject;
 *   • the company settings catalogue (master_configurations): the switches the subject depends on;
 *   • what broke before: the RCA defects of the last quarter (data/knowledge/rca-defects.json, local only);
 *   • the product sheets (test-cases/product-*.md): features, gates and plan limits;
 *   • the memory's product facts and known bugs;
 *   • the catalog itself, so a case the team already has is shown with its id, not written twice.
 *
 * Output: a sheet (`derived-<slug>`, importable and runnable like any other), each row saying which
 * dimension it covers and what it is grounded in; and the QUESTIONS the derivation could not settle
 * (data/product-questions.json) — "is this a permission or a bug?" is asked, never guessed.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";
import { retrieve, FACT_KINDS } from "../rag/knowledgeBase.js";
import { matchTestCase } from "../checks/caseMatcher.js";
import { findCases } from "../checks/testCatalog.js";
import { settingsCatalog, currentValue } from "../checks/companySettings.js";
import { addSheetCases, sheetCases, type SheetCase } from "../checks/sheetCases.js";
import { STYLE_GUIDE, styleExamplesText, toHouseStyle } from "./caseStyle.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const DATA = join(ROOT, "data");
const RULES = join(DATA, "rules", "events-rules.json");
const RCA = join(DATA, "knowledge", "rca-defects.json");
const QUESTIONS = join(DATA, "product-questions.json");
const PRODUCT_DIR = join(ROOT, "..", "test-cases");

export type DeriveKind = "feature" | "flow" | "prd" | "case" | "ticket";
export const DIMENSIONS = ["positive", "permission", "state", "setting", "data-edge", "negative", "timing", "channel", "calculation", "visibility"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface DerivedCase {
  id: string;
  module: string;
  scenario: string;
  title: string;
  role: string;
  portal: string;
  preconditions: string;
  configs: string;
  testData: string;
  steps: string[];
  expected: string;
  priority: string;
  testType: string;
  status: string;
  reference: string;
  /** which permutation this case covers */
  dimension: Dimension;
  /** rule ids, setting keys, RCA tickets, product features it is grounded in */
  grounded: string[];
  /** the permission or role the case hinges on, when it does */
  permission?: string;
  /** a catalog case that already says this (then the row is shown, not saved) */
  already?: { id: string; title: string };
  /** how it can run here */
  runnable: "ui" | "api" | "manual";
  whyManual?: string;
}
export interface DerivedQuestion {
  id: string;
  area: string;
  question: string;
  why: string;
  assume: string;
  from: string;
  at: string;
}
export interface Derivation {
  id: string;
  kind: DeriveKind;
  subject: string;
  module: string;
  actors: string[];
  actions: string[];
  states: string[];
  grounding: { rules: number; settings: number; defects: number; product: number; facts: number; existing: number };
  dimensions: Record<string, number>;
  cases: DerivedCase[];
  questions: DerivedQuestion[];
  existing: Array<{ id: string; title: string }>;
  sheet: string;
  ms: number;
}
/** A question the derivation asks the tester on screen; the answer, "" when nobody answered by the deadline, null when the screen is gone. */
export type DeriveAsk = (q: { text: string; why?: string; kind: "one" | "text"; options?: string[] }, timeoutMs: number) => Promise<string | null>;

export type DeriveEvent =
  | { type: "line"; line: string }
  | { type: "answers"; answers: Array<{ question: string; answer: string }> }
  | { type: "understanding"; subject: string; module: string; kind: DeriveKind; actors: string[]; actions: string[]; states: string[] }
  | { type: "grounding"; counts: Derivation["grounding"]; existing: Array<{ id: string; title: string }> }
  | { type: "cases"; cases: DerivedCase[] }
  | { type: "questions"; questions: DerivedQuestion[] }
  | { type: "done"; derivation: Derivation };

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "when", "then", "into", "are", "was", "test", "tests", "testing", "case", "cases", "check", "verify", "should", "must", "event", "events", "procol", "user", "users", "buyer", "vendor", "can", "not", "any", "all", "its", "has", "have", "will", "which", "what", "does"]);
const MODULE_WORDS: Array<[RegExp, string]> = [
  [/\b(reverse )?auction|dutch|knockout|rank based|price based|traffic light/i, "Auction"], [/\brfp\b|technical (stage|evaluation|round)|questionnaire|evaluator/i, "Evaluation"],
  [/award|proposal|nfa|master qcs|mqcs|allocation/i, "Awarding"], [/counter ?offer|negotiat/i, "CounterOffer"], [/\bbid|quote|surrogate|vendor portal|supplier portal/i, "Bidding"],
  [/purchase order|\bpo\b|grn|invoice/i, "PurchaseOrder"], [/purchase req|\bpr\b|intake/i, "Intake"], [/approval|approver|workflow/i, "Approvals"], [/template/i, "Templates"],
  [/vendor (onboard|master|registration)|onboarding/i, "VendorMgmt"], [/line item|quantity|product|sheet/i, "LineItems"], [/publish|withdraw|extend|schedule|version|convert|hold/i, "EventStatuses"], [/rfq|request for quot/i, "RFQ"],
];

// ── the grounding sources ──────────────────────────────────────────────────
interface Rule { id: string; area: string; kind: string; layer: string; statement: string; section?: string; file?: string; lines?: string; priority?: string }
let rulesCache: Rule[] | null = null;
function rules(): Rule[] {
  if (rulesCache) return rulesCache;
  try {
    const raw = JSON.parse(readFileSync(RULES, "utf8"));
    rulesCache = (Array.isArray(raw) ? raw : raw.rules) as Rule[];
  } catch {
    rulesCache = [];
  }
  return rulesCache;
}
function score(text: string, want: Set<string>): number {
  const have = words(text);
  let n = 0;
  for (const w of want) if (have.has(w)) n++;
  return n;
}
export function rulesFor(subject: string, limit = 30): Rule[] {
  const want = words(subject);
  const scored = rules()
    .map((r) => ({ r, s: score(`${r.statement} ${r.section ?? ""}`, want) + (r.kind === "permission" || r.kind === "validation" || r.kind === "state" ? 0.5 : 0) }))
    .filter((x) => x.s >= 1.5)
    .sort((a, b) => b.s - a.s);
  // a spread of kinds, not thirty validation lines
  const out: Rule[] = [];
  const perKind: Record<string, number> = {};
  for (const { r } of scored) {
    if ((perKind[r.kind] ?? 0) >= Math.max(4, Math.ceil(limit / 5))) continue;
    perKind[r.kind] = (perKind[r.kind] ?? 0) + 1;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
interface Defect { ticket: string; module: string; label: string; priority: string; title: string; symptom: string; rootCause: string; fix: string; errorText: string }
export function defectsFor(subject: string, module: string, limit = 10): Defect[] {
  if (!existsSync(RCA)) return [];
  let all: Defect[] = [];
  try {
    all = JSON.parse(readFileSync(RCA, "utf8")).defects as Defect[];
  } catch {
    return [];
  }
  const want = words(subject);
  return all
    .map((d) => ({ d, s: score(`${d.title} ${d.symptom} ${d.rootCause}`, want) + (d.module === module ? 1 : 0) }))
    // about THIS subject: several shared words, or the same module and a couple
    .filter((x) => x.s >= 4 || (x.d.module === module && x.s >= 3))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.d);
}
export function productFor(subject: string, module: string, limit = 8): Array<{ file: string; title: string; text: string }> {
  if (!existsSync(PRODUCT_DIR)) return [];
  const want = words(subject);
  const out: Array<{ file: string; title: string; text: string; s: number }> = [];
  for (const f of readdirSync(PRODUCT_DIR).filter((x) => /^product-\d+-.*\.md$/.test(x))) {
    const md = readFileSync(join(PRODUCT_DIR, f), "utf8");
    for (const block of md.split(/\n(?=#### )/)) {
      const title = block.match(/^#### (.+)/)?.[1] ?? "";
      if (!title) continue;
      const s = score(`${title} ${block.slice(0, 600)}`, want) + (new RegExp(module.replace(/([A-Z])/g, " $1").trim().split(" ")[0], "i").test(f) ? 0.5 : 0);
      if (s >= 2) out.push({ file: f, title, text: block.replace(/\s+/g, " ").slice(0, 500), s });
    }
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit);
}
export async function settingsForSubject(subject: string, companyId: number | undefined, limit = 10): Promise<Array<{ key: string; name: string; def: unknown; current?: unknown; hidden: boolean }>> {
  const want = words(subject);
  let cat: Awaited<ReturnType<typeof settingsCatalog>> = [];
  try {
    cat = await settingsCatalog();
  } catch {
    return [];
  }
  const hits = cat
    .map((s) => ({ s, n: score(`${s.key.replace(/_/g, " ")} ${s.name} ${s.description}`, want) }))
    .filter((x) => x.n >= 1)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
  const out = [];
  for (const { s } of hits) {
    let current: unknown;
    if (companyId) current = await currentValue(companyId, s.key).then((v) => v.value).catch(() => undefined);
    out.push({ key: s.key, name: s.name, def: s.def, current, hidden: s.hidden });
  }
  return out;
}
let catalogCache: Array<{ id: string; title: string; steps?: string; expected?: string }> | null = null;
/** The catalog cases about this subject: scored by the words they share with it (a phrase search found nothing). */
export function existingFor(subject: string, limit = 40): Array<{ id: string; title: string }> {
  try {
    catalogCache ??= findCases({}) as Array<{ id: string; title: string; steps?: string; expected?: string }>;
    const want = words(subject);
    // "reject" also appears as "rejects / rejected / rejection": compare on stems of 5 letters
    const stem = (w: string) => w.slice(0, 5);
    const stems = new Set([...want].map(stem));
    return catalogCache
      .map((c) => {
        const have = new Set([...words(`${c.title} ${c.expected ?? ""}`)].map(stem));
        let n = 0;
        for (const w of stems) if (have.has(w)) n++;
        return { c, s: n };
      })
      .filter((x) => x.s >= Math.min(2, stems.size))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => ({ id: x.c.id, title: x.c.title }));
  } catch {
    return [];
  }
}
/** Two titles that say the same thing: most of the significant word stems of the shorter are in the longer. */
export function sameTitle(a: string, b: string): boolean {
  const stem = (w: string) => w.slice(0, 5);
  const A = new Set([...words(a)].map(stem)), B = new Set([...words(b)].map(stem));
  if (A.size < 3 || B.size < 3) return false;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  let n = 0;
  for (const w of small) if (big.has(w)) n++;
  return n / small.size >= 0.7;
}

// ── the model's two jobs: understand, then fill the matrix ────────────────
export function jsonOf(s: string): any {
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
const UNDERSTAND = `You are a senior QA engineer at Procol, a B2B sourcing platform (buyers run RFQ / RFP / reverse-auction events; vendors bid in the supplier portal; evaluators score technical rounds; awards go through approval and become purchase orders).
A tester typed something: a feature name, a flow, a PRD, one test case, or a customer ticket. Work out WHAT IS UNDER TEST. Answer JSON only:
{"kind":"feature|flow|prd|case|ticket","subject":"the behaviour under test in one plain sentence","module":"RFQ|Auction|Bidding|Awarding|CounterOffer|Evaluation|EventStatuses|LineItems|Templates|PurchaseOrder|Intake|Approvals|VendorMgmt|Other","actors":["who acts and who is affected, e.g. buyer with award rights, buyer without it, vendor, evaluator, approver"],"actions":["the user actions involved, as the screen names them"],"states":["the event states where the behaviour is reachable or must be refused, e.g. live, closed, awarded, old version"],"rulesStated":["every rule the text itself states (a PRD's acceptance criteria, a case's expected result, a ticket's expected behaviour)"],"doubts":["what the text leaves unsaid that a tester must ask before judging pass/fail — permissions, defaults, limits; each ONE plain question anyone understands, ONE thing only, under 20 words, no jargon"]}`;

const MATRIX = `You are a senior QA engineer at Procol writing the test cases for ONE subject, as a permutation matrix. Procol's screens: Events list (Live / History / Drafts), the event's project page with stage tabs (Technical Stage, RFQ, Auction), each stage's Responses / Overview / Participants / Analytics tabs, Master QCS, the awarding screen, the Settings menu of a stage (Extend Submission Time, Withdraw, Create New Version, Convert to Auction, Reject Bid, Rejected Bids, Order Activity), the supplier (vendor) portal.
WALK EVERY DIMENSION and write a case for each cell that MEANS SOMETHING for this subject (skip cells that do not apply — say nothing rather than pad):
- positive: the main path works and shows the right values/sums;
- permission: a user WITHOUT the right (a member who lacks the permission, the vendor, a user from another company, a planner/evaluator) is refused or does not see the control; a user WITH it can. Name the permission as the product names it when a rule gives it; otherwise write "Record who may do this" and raise a question;
- state: the same action in each event state (draft, upcoming, live, bidding closed / evaluation, award proposal pending, awarded, withdrawn, an old version after Create New Version, converted to auction): offered / greyed with a tooltip / refused with a message;
- setting: each company setting that changes the behaviour, On and Off (use the exact setting_key given);
- data-edge: 0, negative, decimals, a huge number, a duplicate, a value with '#', a trailing space, an empty required field, a very long text, more rows than one page, a second vendor, a currency with no rate;
- negative: the refusals the product must make, with the app's own message when a rule gives it;
- timing: just before the window closes, after it closes, twice quickly (a double click / a stale screen), two buyers at once;
- channel: the same request sent to the API directly (bypassing the screen) must be refused the same way; the mobile app where it applies;
- calculation: every number on screen worked out (ranks, totals, savings, counters);
- visibility: who sees what (vendor sees nothing of other vendors; masking; History vs Live).
TITLES read like the team's sheet: what is checked, as a short sentence — "Reject Bid is disabled while bidding is on", never "Buyer successfully rejects…" or "…works correctly". Every case must be about THIS subject's behaviour (not a general field check that happens nearby). Name only controls Procol has (Reject Bid, Rejected Bids, Master QCS, Participants, Settings menu…).
GROUND every case: cite the rule ids (R-…), setting keys, RCA ticket ids or product feature ids given below that it rests on — only those; never invent an id. A case that rests on nothing given is grounded "screen".
WHAT BROKE BEFORE (the RCA tickets listed) each get one case that would have caught it — only when the ticket is about THIS subject; a ticket about something else is ignored, never used to pad.
STAY ON THE SUBJECT: every case exercises the behaviour under test itself. A case about a neighbouring screen, another feature or a general field check is not written.
${STYLE_GUIDE}
Use the QA test vendors as "Vendor A", "Vendor B". Pre-conditions, when the case needs an existing event, must be one of exactly these phrases (the platform builds them): "A live RFQ published with QA vendors invited and no bid yet." / "A live RFQ with a vendor's bid." / "A closed RFQ with a vendor's bid, not awarded." / "An awarded RFQ whose proposal went into approval." / "A live eRFX project with a Technical stage and an RFQ stage, QA vendors invited." / "An RFQ already converted to an auction: the vendor bid 100 per unit in the RFQ, the auction is live and the vendor has bid in it." / "A draft RFQ saved and not published." / "The buyer can create events." — or describe the state in words when none fits.
How the voice looks:
${styleExamplesText()}
Return ONLY a JSON array of objects: {"dimension":"positive|permission|state|setting|data-edge|negative|timing|channel|calculation|visibility","title","role","portal":"Buyer portal|Vendor portal|Buyer + Vendor portal|API","preconditions","configs":"setting_key = On|Off — why, one per line, or None","testData","steps":["…"],"expected","priority":"Critical|High|Medium|Low","testType":"Positive|Negative|Edge","grounded":["R-…","setting_key","ticket id","PRD-…","screen"],"permission":"the right it hinges on, or omit","question":"a doubt this case cannot settle alone, or omit"}`;

function slugOf(s: string): string {
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "subject";
}
function prefixOf(module: string): string {
  const m: Record<string, string> = { RFQ: "RFQ", Auction: "AUC", Bidding: "BID", Awarding: "AWD", CounterOffer: "CO", Evaluation: "EVL", EventStatuses: "EVT", LineItems: "LI", Templates: "TPL", PurchaseOrder: "PO", Intake: "INT", Approvals: "APR", VendorMgmt: "VND" };
  return m[module] ?? "GEN";
}
function layerOf(c: { portal: string; steps: string[]; title: string }): "ui" | "api" {
  const t = `${c.portal} ${c.title} ${c.steps.join(" ")}`;
  return /\bapi\b|endpoint|status code|\b(get|post|put|patch|delete) \//i.test(t) && !/vendor portal|buyer portal/i.test(c.portal) ? "api" : "ui";
}
function manualWhy(c: { role: string; portal: string; steps: string[]; dimension: string }): string | undefined {
  const t = `${c.role} ${c.steps.join(" ")}`;
  if (/mobile app|whatsapp|\bsms\b|e-?mail inbox|mailbox/i.test(t)) return "needs the mobile app or a mailbox";
  if (/another company|other company|second buyer|approver|planner|evaluator|member without|without the permission|a user who lacks/i.test(t) && !/vendor/i.test(c.role)) return "needs another person's login (approver, planner, a member without the right)";
  if (c.dimension === "timing" && /two buyers at once|same time|simultaneous/i.test(t)) return "needs two sessions at once";
  return undefined;
}
function readQuestions(): DerivedQuestion[] {
  try {
    return JSON.parse(readFileSync(QUESTIONS, "utf8"));
  } catch {
    return [];
  }
}
function saveQuestions(list: DerivedQuestion[]): void {
  mkdirSync(dirname(QUESTIONS), { recursive: true });
  writeFileSync(QUESTIONS, JSON.stringify(list, null, 1));
}
export function allQuestions(): DerivedQuestion[] {
  return readQuestions();
}

/** Derive the permutation matrix of cases for whatever was typed. Streams progress through `emit`. */
export async function deriveCases(input: { text: string; companyId?: number; max?: number; save?: boolean; ask?: DeriveAsk }, emit: (e: DeriveEvent) => void = () => {}): Promise<Derivation> {
  const t0 = Date.now();
  let text = input.text.trim();
  const say = (line: string) => emit({ type: "line", line });
  const max = Math.min(Math.max(input.max ?? 40, 8), 80);

  // 1 · understand
  say("Working out what is under test…");
  const u = jsonOf(await chat([{ role: "system", content: UNDERSTAND }, { role: "user", content: text.slice(0, 12000) }], { tier: "fast", temperature: 0.1, maxTokens: 1200 }).catch(() => "")) ?? {};
  const subject = clean(u.subject) || clean(text).slice(0, 140);
  let module = clean(u.module) || "Other";
  if (module === "Other") for (const [re, m] of MODULE_WORDS) if (re.test(`${subject} ${text}`)) { module = m; break; }
  const kind = (["feature", "flow", "prd", "case", "ticket"].includes(u.kind) ? u.kind : /\b(prd|acceptance|user stor|requirement)/i.test(text) ? "prd" : text.length > 600 ? "flow" : "feature") as DeriveKind;
  const actors: string[] = Array.isArray(u.actors) ? u.actors.map(clean).filter(Boolean).slice(0, 8) : [];
  const actions: string[] = Array.isArray(u.actions) ? u.actions.map(clean).filter(Boolean).slice(0, 10) : [];
  const states: string[] = Array.isArray(u.states) ? u.states.map(clean).filter(Boolean).slice(0, 10) : [];
  const stated: string[] = Array.isArray(u.rulesStated) ? u.rulesStated.map(clean).filter(Boolean).slice(0, 20) : [];
  let doubts: string[] = Array.isArray(u.doubts) ? u.doubts.map(clean).filter(Boolean).slice(0, 10) : [];
  emit({ type: "understanding", subject, module, kind, actors, actions, states });

  // 1b · ASK BEFORE GUESSING — when a screen is listening, the tester is asked, in plain words, whether the reading
  // is right and each thing the text leaves unsaid; the answers become rules for the matrix. Every question has a
  // deadline, so a tester who walked away does not hold the derivation: what is unanswered stays an open question.
  const answers: Array<{ question: string; answer: string }> = [];
  if (input.ask) {
    const KIND_WORDS: Record<DeriveKind, string> = { feature: "a feature", flow: "a flow", prd: "a requirement (PRD)", case: "one test case", ticket: "a bug ticket" };
    say(`Before I write anything, ${doubts.length ? `I have ${doubts.length + 1} things to check with you` : "one thing to check with you"} — answer on the card, or I go on in a few minutes with what I have.`);
    const confirm = await input.ask({
      text: `I read this as ${KIND_WORDS[kind]} about “${subject}”${actors.length ? `, involving ${actors.slice(0, 3).join(", ")}` : ""}. Is that right?`,
      why: "If I have the wrong end of the stick, every case will be about the wrong thing.",
      kind: "one", options: ["Yes, that's it", "Not quite — let me say what it is"],
    }, 90_000);
    if (confirm === null) say("The screen went away; going on with my own reading.");
    else if (confirm && !/^(yes|y\b|that's it|right|correct|ok)/i.test(confirm) && !/^not quite — let me say/i.test(confirm)) {
      text = `${text}\n\nWHAT THE TESTER SAYS IT IS: ${confirm}`;
      answers.push({ question: "What is under test", answer: confirm });
      say("Noted — I'll go by your words for what is under test.");
    }
    if (doubts.length && confirm !== null) {
      const replies = await Promise.all(doubts.map((d) => input.ask!({ text: d, why: "If you don't know, I'll write that case as “record what happens” instead of guessing.", kind: "text", options: ["I don't know"] }, 180_000)));
      const open: string[] = [];
      doubts.forEach((d, i) => {
        const a = (replies[i] ?? "").trim();
        if (a && !/^i don'?t know$/i.test(a)) answers.push({ question: d, answer: a }); else open.push(d);
      });
      doubts = open;
      if (answers.length) say(`Thanks — ${answers.length} answer(s) will be used as rules; ${open.length} question(s) stay open.`);
    }
    if (answers.length) emit({ type: "answers", answers });
  }

  // 2 · ground
  say("Reading Procol's code rules, settings, the RCA tickets and the product sheets for this subject…");
  const topic = `${subject} ${actions.join(" ")} ${text.slice(0, 400)}`;
  const rs = rulesFor(topic, 30);
  const settings = await settingsForSubject(topic, input.companyId, 10);
  const defects = defectsFor(topic, module, 10);
  const product = productFor(topic, module, 8);
  const facts = await retrieve(topic, 8, { kinds: FACT_KINDS }).catch(() => [] as Array<{ text: string }>);
  const existing = existingFor(subject, 40);
  const grounding = { rules: rs.length, settings: settings.length, defects: defects.length, product: product.length, facts: facts.length, existing: existing.length };
  emit({ type: "grounding", counts: grounding, existing });

  // 3 · the matrix
  say(`Writing the permutations (${rs.length} rules, ${settings.length} settings, ${defects.length} past defects, ${existing.length} cases already written)…`);
  const user = [
    `WHAT WAS TYPED (${kind}):\n${text.slice(0, 8000)}`,
    `SUBJECT: ${subject}\nMODULE: ${module}\nACTORS: ${actors.join("; ")}\nACTIONS: ${actions.join("; ")}\nSTATES: ${states.join("; ")}`,
    stated.length ? `RULES THE TEXT ITSELF STATES:\n${stated.map((s) => `- ${s}`).join("\n")}` : "",
    answers.length ? `WHAT THE TESTER ANSWERED WHEN ASKED (treat each as a stated rule; cite as "tester's answer"):\n${answers.map((a) => `- ${a.question} → ${a.answer}`).join("\n")}` : "",
    rs.length ? `PROCOL'S CODE RULES (cite by id):\n${rs.map((r) => `${r.id} [${r.kind}] ${clean(r.statement).slice(0, 220)}`).join("\n")}` : "",
    settings.length ? `COMPANY SETTINGS (cite by key):\n${settings.map((s) => `${s.key} — ${s.name || s.key} (default ${JSON.stringify(s.def)}${s.current !== undefined ? `, test company now ${JSON.stringify(s.current)}` : ""}${s.hidden ? ", HIDDEN: only a Procol employee can switch it" : ""})`).join("\n")}` : "",
    defects.length ? `WHAT BROKE BEFORE — RCA tickets (cite by ticket id; each needs a case that would catch it):\n${defects.map((d) => `${d.ticket} (${d.module}, ${d.priority}): ${d.title}. Symptom: ${d.symptom.slice(0, 200)} Root cause: ${d.rootCause.slice(0, 200)}`).join("\n")}` : "",
    product.length ? `PRODUCT SHEET (cite by PRD id):\n${product.map((p) => `${p.title}: ${p.text.slice(0, 260)}`).join("\n")}` : "",
    facts.length ? `PRODUCT FACTS FROM MEMORY:\n${facts.map((f) => `- ${clean(f.text).slice(0, 200)}`).join("\n")}` : "",
    existing.length ? `ALREADY WRITTEN (do not repeat these; write what they miss):\n${existing.map((e) => `${e.id} ${e.title}`).join("\n")}` : "",
    `Write at most ${max} cases.`,
  ].filter(Boolean).join("\n\n");
  // the model answers a JSON array, sometimes wrapped ({"cases":[…]}) or cut short: take what parses, and when
  // nothing does, ask once more on the fast tier before giving up
  const arrayOf = (raw: string): any[] => {
    const j = jsonOf(raw);
    if (Array.isArray(j)) return j;
    if (j && typeof j === "object") for (const v of Object.values(j)) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as any[];
    // a cut-short array: keep the complete objects before the break
    const start = raw.indexOf("[");
    if (start >= 0) {
      const out: any[] = [];
      let depth = 0, from = -1;
      for (let i = start + 1; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === "{") { if (depth === 0) from = i; depth++; }
        else if (ch === "}") { depth--; if (depth === 0 && from >= 0) { try { out.push(JSON.parse(raw.slice(from, i + 1))); } catch { /* skip */ } from = -1; } }
      }
      return out;
    }
    return [];
  };
  let raw = await chat([{ role: "system", content: MATRIX }, { role: "user", content: user }], { tier: "reason", temperature: 0.2, maxTokens: 12000 }).catch((e) => (say(`The reasoning model could not answer (${String((e as Error).message).slice(0, 80)}).`), ""));
  let drafts: any[] = arrayOf(raw);
  if (!drafts.length) {
    say(`The reasoning model's answer held no cases (${raw ? `${raw.length} characters, starts "${raw.slice(0, 60).replace(/\s+/g, " ")}"` : "empty"}); asking the fast model once.`);
    raw = await chat([{ role: "system", content: MATRIX }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens: 8000 }).catch(() => "");
    drafts = arrayOf(raw);
  }
  say(`The model proposed ${drafts.length} cases; checking each against the catalog and the grounding…`);

  // 4 · keep what is grounded, mark what already exists
  const allowed = new Set<string>([...rs.map((r) => r.id), ...settings.map((s) => s.key), ...defects.map((d) => d.ticket), ...product.map((p) => p.title.split(" — ")[0].trim()), "screen"]);
  const prefix = `DRV-${prefixOf(module)}`;
  const sheet = `derived-${slugOf(subject)}`;
  const taken = new Set(sheetCases().map((c) => c.id)); // every sheet: a DRV id names one case across all derivations
  let n = 0;
  const nextId = () => {
    do n++; while (taken.has(`${prefix}-${String(n).padStart(3, "0")}`));
    return `${prefix}-${String(n).padStart(3, "0")}`;
  };
  const cases: DerivedCase[] = [];
  const questions: DerivedQuestion[] = [];
  const seenTitles = new Set<string>();
  for (const d of drafts) {
    const title = clean(d?.title);
    const steps: string[] = Array.isArray(d?.steps) ? d.steps.map(clean).filter(Boolean) : [];
    const expected = clean(d?.expected);
    if (!title || !steps.length || !expected || seenTitles.has(title.toLowerCase())) continue;
    seenTitles.add(title.toLowerCase());
    // off the subject: a case that shares no significant word stem with the subject or its actions is dropped
    const stemsOf = (t: string) => new Set([...words(t)].map((w) => w.slice(0, 5)));
    const subjectStems = stemsOf(`${subject} ${actions.join(" ")}`);
    const caseStems = stemsOf(`${title} ${steps.join(" ")} ${expected}`);
    let shared = 0;
    for (const w of subjectStems) if (caseStems.has(w)) shared++;
    if (subjectStems.size && shared < Math.min(2, subjectStems.size)) {
      say(`Dropped "${title.slice(0, 70)}" — it is not about the subject.`);
      continue;
    }
    const dimension = (DIMENSIONS as readonly string[]).includes(d?.dimension) ? (d.dimension as Dimension) : /refus|cannot|not allowed|blocked/i.test(expected) ? "negative" : "positive";
    const grounded = (Array.isArray(d?.grounded) ? d.grounded.map(clean) : []).filter((g: string) => allowed.has(g) || /^R-/.test(g) && rs.some((r) => r.id === g));
    const house = toHouseStyle({ title, steps, expected, setup: d?.preconditions, testData: d?.testData, priority: d?.priority, role: d?.role, portal: d?.portal, testType: d?.testType });
    const base = { ...house, configs: clean(d?.configs) || "None", status: "Not Run", module: `${module} — ${subject.slice(0, 60)}`, scenario: `${dimension}${d?.permission ? ` · ${clean(d.permission)}` : ""}` };
    const caseText = `${title}. ${steps.join(" ")} Expected: ${expected}`;
    const m = await matchTestCase(caseText, { llm: false, top: 3 }).catch(() => null);
    const byMatcher = m?.decision === "existing" ? m.same.filter((c: any) => c.origin === "catalog")[0] : null;
    const byTitle = existing.find((e) => sameTitle(e.title, title));
    const same = byMatcher ?? byTitle ?? null;
    const row: DerivedCase = {
      id: same ? same.id : nextId(), ...base, steps: house.steps, dimension, grounded: grounded.length ? grounded : ["screen"],
      permission: d?.permission ? clean(d.permission) : undefined,
      reference: `derived from ${kind}: "${clean(text).slice(0, 80)}" · ${dimension} · grounded: ${(grounded.length ? grounded : ["screen"]).join(", ")}`,
      runnable: "ui", already: same ? { id: same.id, title: same.title } : undefined,
    };
    const layer = layerOf(row);
    const why = manualWhy({ role: row.role, portal: row.portal, steps: row.steps, dimension });
    row.runnable = why ? "manual" : layer;
    row.whyManual = why;
    cases.push(row);
    if (d?.question) questions.push({ id: "", area: module, question: clean(d.question), why: `Needed to judge "${title}" as pass or fail.`, assume: expected.slice(0, 160), from: `derived from ${kind}: ${clean(text).slice(0, 80)}`, at: new Date().toISOString().slice(0, 10) });
  }
  for (const q of doubts) questions.push({ id: "", area: module, question: q, why: "The text under test leaves this unsaid.", assume: "Record what happens.", from: `derived from ${kind}: ${clean(text).slice(0, 80)}`, at: new Date().toISOString().slice(0, 10) });
  emit({ type: "cases", cases });

  // 5 · save the new rows as a sheet; keep the questions
  const fresh = cases.filter((c) => !c.already);
  if (input.save !== false && fresh.length) {
    addSheetCases(fresh.map((c) => ({ id: c.id, module: c.module, scenario: c.scenario, title: c.title, role: c.role, portal: c.portal, preconditions: c.preconditions, configs: c.configs, testData: c.testData, steps: c.steps, expected: c.expected, priority: c.priority, testType: c.testType, status: c.status, reference: c.reference, layer: c.runnable === "api" ? "api" : "ui" })), sheet);
    say(`Saved ${fresh.length} new cases to the sheet "${sheet}" (${cases.length - fresh.length} already in the catalog, shown with their ids).`);
  }
  if (questions.length) {
    const all = readQuestions();
    const have = new Set(all.map((q) => q.question.toLowerCase()));
    let k = all.length;
    for (const q of questions) if (!have.has(q.question.toLowerCase())) { q.id = `PQ-${String(++k).padStart(3, "0")}`; all.push(q); have.add(q.question.toLowerCase()); }
    saveQuestions(all);
  }
  emit({ type: "questions", questions });
  const dims: Record<string, number> = {};
  for (const c of cases) dims[c.dimension] = (dims[c.dimension] ?? 0) + 1;
  const derivation: Derivation = { id: `drv-${Date.now().toString(36)}`, kind, subject, module, actors, actions, states, grounding, dimensions: dims, cases, questions, existing, sheet, ms: Date.now() - t0 };
  emit({ type: "done", derivation });
  return derivation;
}

/** Words that read as a FEATURE / PRD / FLOW to derive from, rather than one case to run or a journey to walk. */
export function looksLikeDerivation(text: string): boolean {
  const t = text.trim();
  if (/\b(prd|acceptance criteria|user stor(y|ies)|requirements?|feature:|scope:|overview:)\b/i.test(t)) return true;
  if (t.length > 900 || t.split(/\n\s*\n/).length >= 3) return true;
  const w = t.split(/\s+/);
  if (w.length <= 14 && /^(test|cover|derive|cases? for|feature|what (can|could) break|all (the )?cases)\b/i.test(t) && !/\b(and|then)\b/i.test(t)) return true;
  return false;
}
