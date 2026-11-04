/**
 * SINGLE-CASE MODE — one test case typed in plain English, run as a TEST CASE (not a journey).
 *
 * A journey is a flow the platform walks and photographs; a test case is one claim with an expected
 * result, and its verdict is Pass / Fail / Couldn't tell per check. What the tester types here is
 * always read as the latter:
 *
 *   caseFromText      the typed words → a house-format test case (14 columns), kept in the
 *                     "Typed test cases" sheet so it can be run again and exported;
 *   understandCase    what the platform understood before running: goal, actor, where, the starting
 *                     state it will build, the settings it will switch, every check it will make, and
 *                     whether it can run here (with the reason when it cannot) — section 3 of the
 *                     Test-Case Runner prompt, in plain words;
 *   suggestEdgeCases  the negative / edge / variant cases worth adding, as ready rows.
 *
 * The run itself is the sheet runner (sheetRunner.ts): one case, same verdict rules, same report.
 */
import { chat } from "../ai/llm.js";
import { compileTestCase } from "../agents/planner.js";
import { parseConfigs } from "../agents/caseStyle.js";
import { VALUE_KEYS } from "../agents/screenModel.js";
import { addSheetCases, findSheetCase, nextTypedId, sheetCaseProse, sheetPrep, splitSteps, TYPED_SHEET, type SheetCase } from "./sheetCases.js";
import { companySetting } from "./sheetRunner.js";

/** The starting states the API can build; a case that names one of these in its pre-conditions starts there. */
export const START_STATES: Record<string, string> = {
  live: "A live RFQ published with QA vendors invited and no bid yet (quantity 10 on one line item).",
  bid: "A live RFQ with a vendor's bid: one line item, quantity 10, bid 100 per unit.",
  closed: "A closed RFQ with a vendor's bid (quantity 10 at 100 per unit), not awarded.",
  awarded: "An awarded RFQ whose proposal went into approval.",
  technical: "A live eRFX project with a Technical stage and an RFQ stage, QA vendors invited.",
  converted: "An RFQ already converted to an auction: the vendor bid 100 per unit in the RFQ, the auction is live and the vendor has bid in it.",
  draft: "A draft RFQ saved and not published.",
  upcoming: "An upcoming RFQ whose bidding starts later.",
  scratch: "The buyer can create events.",
};

type Row = Omit<SheetCase, "sheet" | "layer">;

const HOUSE = `You are a careful manual tester at Procol, a procurement platform (RFQs, reverse auctions, technical + RFQ projects, vendor bids in the supplier portal, surrogate bids, counter offers, Master QCS, awarding, approvals, purchase orders).
Rewrite what the tester typed as ONE test case in the team's house format. It is a test case, never a journey: one claim, checked at the end.
Rules:
- Plain words a colleague with basic product knowledge understands. Name controls as they read on screen ("Settings", "Extend Submission Time", "Master QCS", "Start Awarding", "Participants tab").
- Steps are numbered actions, one action each. The first step is the login when a buyer acts: "Log in to Procol (buyer side) with the buyer user". A case that creates its event starts with 'From the left menu click "Events" and click the blue "Create Event"'.
- The expected result lists every fact to check, each as its own sentence a person can see true or false. Keep the tester's numbers; use placeholders (Vendor A, 100 per unit) when none were given. Never invent product behaviour the tester did not ask about.
- Pre-conditions: when the case needs an existing event, use EXACTLY one of these phrases (the platform builds them by API):
${Object.values(START_STATES).map((s) => `  "${s}"`).join("\n")}
- Configs Needed: "None", or one line per company setting as "setting_key = On|Off|value — why". Only when the tester named a setting.
- portal: "Buyer portal", "Vendor portal", "Buyer + Vendor portal", or "API" when the tester wants the API checked (status codes, replies).
- priority: Critical | High | Medium | Low. testType: Positive | Negative | Edge | UI | Regression.
Answer with JSON only, no prose: {"module":"…","scenario":"…","title":"…","role":"…","portal":"…","preconditions":"…","configs":"None","testData":"…","steps":["…"],"expected":"…","priority":"…","testType":"…"}`;

function jsonBlock(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
const str = (v: unknown, d = "-") => (typeof v === "string" && v.trim() ? v.trim() : Array.isArray(v) ? v.map(String).join("\n") : d);

/** The typed words without the AI: title = the text, steps = its sentences, expected = the "check/should/expect" part. */
function heuristicRow(text: string): Row {
  const t = text.replace(/\s+/g, " ").trim();
  const parts = t.split(/(?<=[.;])\s+|\s+(?:then|and then|after that)\s+/i).map((s) => s.trim()).filter(Boolean);
  const isCheck = (s: string) => /\b(check|verify|expect|should|must|is shown|are shown|appears|equals|reads)\b/i.test(s);
  const steps = parts.filter((s) => !isCheck(s));
  const checks = parts.filter(isCheck);
  const vendor = /vendor portal|as (the )?vendor|supplier portal/i.test(t);
  const api = /\bapi\b|status code|endpoint|\b(get|post|put|patch|delete) \//i.test(t);
  return {
    id: "", module: "Typed", scenario: "Typed case", title: t.length > 120 ? `${t.slice(0, 117)}…` : t,
    role: vendor ? "Buyer, Vendor A" : "Buyer", portal: api ? "API" : vendor ? "Buyer + Vendor portal" : "Buyer portal",
    preconditions: START_STATES[guessState(t)], configs: "None", testData: "-",
    steps: (steps.length ? steps : [t]).map((s) => s.replace(/^(then|and)\s+/i, "")), expected: checks.join(" ") || "The steps complete without an error and the screen shows what the case asks for.",
    priority: "Medium", testType: "Positive", status: "Not Run",
  };
}
function guessState(t: string): keyof typeof START_STATES {
  const s = t.toLowerCase();
  if (/create (an? )?(rfq|event|auction|project)|from scratch/.test(s)) return "scratch";
  if (/converted|after (the )?conversion/.test(s)) return "converted";
  if (/awarded|\bpo\b|purchase order/.test(s)) return "awarded";
  if (/closed|after bidding (ended|closed)|evaluation/.test(s)) return "closed";
  if (/technical|two-stage|rfp/.test(s)) return "technical";
  if (/\bbid\b|bids|quoted|master qcs|rank|counter offer|award/.test(s)) return "bid";
  if (/draft/.test(s)) return "draft";
  if (/upcoming/.test(s)) return "upcoming";
  return "live";
}

/**
 * The typed words → a house-format case in the "Typed test cases" sheet. An id or a title that names a
 * sheet case returns that case instead (it is run as written). `source` says who wrote the row.
 */
export async function caseFromText(text: string, opts: { id?: string; log?: (l: string) => void } = {}): Promise<{ case: SheetCase; source: "sheet" | "ai" | "heuristic"; note?: string }> {
  const t = text.trim();
  const known = findSheetCase(t);
  if (known) return { case: known, source: "sheet", note: `This is ${known.id} from the sheet "${known.sheet}" — run as written there.` };
  let row: Row | null = null;
  let source: "ai" | "heuristic" = "heuristic";
  try {
    opts.log?.("Rewriting the typed words as a house-format test case…");
    const out = await chat([{ role: "system", content: HOUSE }, { role: "user", content: t }], { tier: "fast", temperature: 0.1, maxTokens: 1200 });
    const j = jsonBlock(out);
    if (j && j.title && (Array.isArray(j.steps) || typeof j.steps === "string")) {
      const steps = Array.isArray(j.steps) ? j.steps.map((s: unknown) => String(s).replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean) : splitSteps(String(j.steps));
      if (steps.length) {
        row = {
          id: "", module: str(j.module, "Typed"), scenario: str(j.scenario, "Typed case"), title: str(j.title), role: str(j.role, "Buyer"), portal: str(j.portal, "Buyer portal"),
          preconditions: str(j.preconditions, START_STATES.scratch), configs: str(j.configs, "None"), testData: str(j.testData), steps, expected: str(j.expected),
          priority: /^(critical|high|medium|low)$/i.test(str(j.priority, "")) ? str(j.priority) : "Medium", testType: str(j.testType, "Positive"), status: "Not Run",
        };
        source = "ai";
      }
    }
  } catch (e) {
    opts.log?.(`The model could not be reached (${(e as Error).message.slice(0, 80)}); the case is read as typed.`);
  }
  row ??= heuristicRow(t);
  row.id = opts.id ?? nextTypedId();
  row.reference = `typed ${new Date().toISOString().slice(0, 10)}: ${t.slice(0, 160)}`;
  const [c] = addSheetCases([row], TYPED_SHEET);
  return { case: c, source, note: source === "heuristic" ? "The AI was not available, so the case was read as typed; edit the sheet row if it misread anything." : undefined };
}

export interface Check { n: number; what: string; how: "ui" | "api" | "network" | "db" }
export interface Understanding {
  id: string;
  goal: string;
  actor: string;
  where: string[];
  startState: string;
  builtByApi: boolean;
  configs: Array<{ key: string; value: unknown; why?: string }>;
  configPhrase?: string;
  checks: Check[];
  kind: string[];
  layer: "ui" | "api";
  needsOtherIdentity: boolean;
  canRunHere: boolean;
  whyNot: string | null;
  /** the browser steps the compiler chose (UI cases), so the tester can see how it will be run */
  plannedSteps?: string[];
  coverage?: "full" | "partial" | "none";
  gaps?: string[];
}

const SCREEN_WORDS: Array<[RegExp, string]> = [
  [/create event|create screen|single-stage|stages/i, "the event create screen"], [/participants?( tab)?/i, "Participants tab"], [/responses?( tab)?|quote details/i, "Responses tab"],
  [/overview/i, "Overview tab"], [/master qcs|mqcs/i, "Master QCS"], [/start awarding|awarding screen|select for awarding/i, "the awarding screen"], [/proposal/i, "the award proposal page"],
  [/settings menu|from settings|settings →|extend submission|convert to auction|new version|withdraw/i, "the event's Settings menu"], [/vendor portal|supplier portal/i, "the vendor (supplier) portal"],
  [/purchase orders?|\bpo\b/i, "Purchase Orders"], [/events list|history tab|live tab|drafts tab/i, "the events list"], [/order activity|activity log/i, "Order Activity"], [/technical stage/i, "the Technical stage"],
  [/counter offer/i, "Counter Offer"], [/template picker|select templates/i, "the template picker"],
];
/** The expected result as single facts. */
export function splitChecks(expected: string, layer: "ui" | "api"): Check[] {
  const parts = String(expected ?? "").replace(/\s+/g, " ").split(/(?<=[.;])\s+(?=[A-Z"“(])/).map((s) => s.trim().replace(/[.;]$/, "")).filter((s) => s.length > 3);
  return parts.map((what, i) => ({ n: i + 1, what, how: layer === "api" || /status code|\b(2xx|4xx|5xx|200|201|400|422|500)\b|the reply|request answers/i.test(what) ? "api" : /request carries|network|payload/i.test(what) ? "network" : /saved|in the database|stored/i.test(what) ? "db" : "ui" }));
}
function kindOf(c: SheetCase): string[] {
  const t = `${c.title} ${c.steps.join(" ")} ${c.expected} ${c.preconditions}`.toLowerCase();
  const k = new Set<string>([c.layer]);
  if (/sees?|visible|shown to|not shown|hidden|offered/.test(t)) k.add("visibility");
  if (/permission|not allowed|not authori[sz]ed|cannot|refused/.test(t)) k.add("permission");
  if (/notification|email|bell|inbox/.test(t)) k.add("notification");
  if (/another user|other user|second buyer|approver|planner|as the vendor|vendor portal/.test(t)) k.add("cross-user");
  if (/setting|config/.test(t)) k.add("config");
  if (/saved|stored|equals|exactly|total|sum|amount|quantity/.test(t)) k.add("data-integrity");
  if (/^(regression)$/i.test(c.testType)) k.add("regression");
  if (/^(negative)$/i.test(c.testType)) k.add("negative");
  if (/-SET-/.test(c.id)) k.add("setup");
  return [...k];
}

/** What the platform understood, before anything runs. With `compile`, the UI compiler is asked how it would run it (cached). */
export async function understandCase(c: SheetCase, opts: { compile?: boolean; log?: (l: string) => void } = {}): Promise<Understanding> {
  const sp = c.layer === "ui" ? sheetPrep(c) : null;
  const listed = parseConfigs(c.configs);
  const phrase = listed.length ? undefined : companySetting(c.preconditions) ?? undefined;
  const text = `${c.title} ${c.steps.join(" ")}`;
  const where = SCREEN_WORDS.filter(([re]) => re.test(text)).map(([, w]) => w);
  const kind = kindOf(c);
  const needsOther = /\b(another|other|second) (user|buyer|approver)\b|as (the )?(approver|planner|admin)\b/i.test(`${c.role} ${c.steps.join(" ")}`) && !/vendor/i.test(c.role);
  const u: Understanding = {
    id: c.id, goal: c.title, actor: c.role, where: where.length ? where : [c.portal],
    startState: sp?.unbuilt ? `${sp.why} — ${sp.unbuilt}` : sp?.prepared ? `${sp.why} (built by API, opened on ${sp.screenWhat})` : c.layer === "api" ? (c.preconditions !== "-" ? `${c.preconditions} (the API test builds it)` : "nothing to build: the requests create what they need") : "from scratch: the steps create what they need",
    builtByApi: !!sp?.prepared, configs: listed.map((n) => ({ key: n.key, value: n.value, why: n.why })), configPhrase: phrase,
    checks: splitChecks(c.expected, c.layer), kind, layer: c.layer, needsOtherIdentity: needsOther, canRunHere: true, whyNot: null,
  };
  if (sp?.unbuilt) {
    u.canRunHere = false;
    u.whyNot = `It starts from an event the API cannot build yet: ${sp.unbuilt}.`;
  } else if (needsOther) {
    u.canRunHere = false;
    u.whyNot = "It needs another person's login (an approver, planner or second buyer), and this run has only the buyer's and the QA vendors'. The action can be done; the other user's view would be Blocked.";
  } else if (/\b(email|mailbox|sms|whatsapp|mobile app)\b/i.test(`${c.portal} ${c.steps.join(" ")}`)) {
    u.canRunHere = false;
    u.whyNot = "It needs a mailbox, phone or the mobile app, which the run cannot read.";
  }
  if (opts.compile && c.layer === "ui" && u.canRunHere) {
    try {
      opts.log?.("Asking the compiler how it would run this case…");
      const compiled = await compileTestCase(sheetCaseProse(c), "events", {
        dryRun: true,
        ...(sp?.prepared ? { prepared: { state: sp.state, screen: sp.screen, screenWhat: sp.screenWhat, valueKeys: VALUE_KEYS[sp.state] ?? [], technical: sp.technical } } : {}),
      });
      const plan = compiled.plan as { steps: Array<{ step: string; args?: Record<string, unknown> }> };
      u.plannedSteps = (plan.steps ?? []).map((s) => s.step + (s.args && Object.keys(s.args).length ? ` ${JSON.stringify(s.args).slice(0, 80)}` : ""));
      u.coverage = compiled.coverage;
      u.gaps = compiled.gaps;
      if (compiled.source === "fallback" || compiled.coverage === "none" || !plan.steps?.length) {
        u.canRunHere = false;
        u.whyNot = `The automation has no step yet for what this case checks${compiled.gaps.length ? `: ${compiled.gaps.join("; ")}` : ""}. Running the nearest steps would prove nothing, so it is reported as Not run.`;
      }
    } catch (e) {
      u.gaps = [`the compiler could not be asked: ${(e as Error).message.slice(0, 100)}`];
    }
  }
  return u;
}

const SUGGEST = `You are a careful manual tester at Procol. Given ONE test case in the team's house format, propose the cases worth adding next to it: the negative version (the same action refused when it should be), an edge version (empty, zero, a huge number, two pages, a second vendor, the same thing twice), and one variant on another event state (draft / live / closed / awarded / converted) or portal (vendor side). Only cases Procol's screens or API can show true or false. Same house format and the same pre-condition phrases as the given case. Answer with JSON only: {"cases":[{"module":"…","scenario":"…","title":"…","role":"…","portal":"…","preconditions":"…","configs":"None","testData":"…","steps":["…"],"expected":"…","priority":"…","testType":"Negative|Edge|Positive"}]} — at most 3 cases.`;

/** The negative / edge / variant rows worth adding beside a case (not saved until the tester adds them). */
export async function suggestEdgeCases(c: SheetCase, log?: (l: string) => void): Promise<Row[]> {
  try {
    log?.("Looking for the negative and edge cases worth adding…");
    const out = await chat([{ role: "system", content: SUGGEST }, { role: "user", content: sheetCaseProse(c) }], { tier: "fast", temperature: 0.2, maxTokens: 1800 });
    const j = jsonBlock(out);
    const list: any[] = Array.isArray(j?.cases) ? j.cases : [];
    return list
      .filter((x) => x && x.title && (Array.isArray(x.steps) || typeof x.steps === "string"))
      .slice(0, 3)
      .map((x, i) => ({
        id: `${c.id}-X${i + 1}`, module: str(x.module, c.module), scenario: str(x.scenario, c.scenario), title: str(x.title), role: str(x.role, c.role), portal: str(x.portal, c.portal),
        preconditions: str(x.preconditions, c.preconditions), configs: str(x.configs, "None"), testData: str(x.testData), status: "Not Run",
        steps: Array.isArray(x.steps) ? x.steps.map((s: unknown) => String(s).replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean) : splitSteps(String(x.steps)),
        expected: str(x.expected), priority: /^(critical|high|medium|low)$/i.test(str(x.priority, "")) ? str(x.priority) : c.priority, testType: str(x.testType, "Negative"),
        reference: `suggested beside ${c.id}`,
      }));
  } catch {
    return [];
  }
}
