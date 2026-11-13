/**
 * PLAIN PROCOL WORDS — every bug and test case the platform writes reads like the QA team's own sheets.
 *
 * The team's approved files are the style (13 Nov, Animesh: "in a very simple language … according to Procol,
 * not codish"): `docs/bugs/Procol_bugs_found_2026-10-03.xlsx` (Bug / What goes wrong / How to see it / What
 * should happen / What actually happens / How it was verified) and the manual test-case sheets (Test Case
 * Title / Pre-conditions / Test Steps / Expected Result). `data/plain-style.json` holds 86 bugs and ~1,900 cases
 * from them; the closest three are shown to the model as examples each time (retrieval by word overlap on the
 * module and the subject — no embedding needed, instant, deterministic), and the rewrite keeps the facts.
 *
 * What never appears in the plain text: API paths, HTTP codes, uuids, parameter and field names, placeholders,
 * code words. They live in one separate line, "How it was verified", for the engineer.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "./llm.js";
import { jsonOf } from "../agents/deriveCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const STYLE_FILE = join(here, "..", "..", "data", "plain-style.json");

export interface StyleBug { Area: string; Bug: string; "What goes wrong": string; "How to see it": string; "What should happen": string; "What actually happens": string; Severity: string; Kind: string; "How it was verified": string }
export interface StyleCase { source: string; module: string; title: string; preconditions: string; steps: string; expected: string; type: string }

let STYLE: { bugs: StyleBug[]; cases: StyleCase[] } | null = null;
export function style(): { bugs: StyleBug[]; cases: StyleCase[] } {
  if (STYLE) return STYLE;
  try { STYLE = existsSync(STYLE_FILE) ? JSON.parse(readFileSync(STYLE_FILE, "utf8")) : { bugs: [], cases: [] }; } catch { STYLE = { bugs: [], cases: [] }; }
  return STYLE!;
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "it", "for", "with", "that", "this", "as", "at", "by", "be", "are", "was", "not", "no", "its", "from", "into", "when", "then", "than", "after", "before", "can", "cannot", "should", "must", "does", "do", "did", "has", "have", "one", "two", "any", "all", "same", "each", "every", "only", "also", "test", "case", "event"]);
const words = (t: string) => new Set(String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };

/** The closest exemplars to a topic, by shared words (the team's own rows about the same screens). */
export function exemplarBugs(topic: string, k = 3): StyleBug[] {
  const q = words(topic);
  return [...style().bugs].map((b) => ({ b, s: overlap(q, words(`${b.Area} ${b.Bug} ${b["What goes wrong"]}`)) })).sort((x, y) => y.s - x.s).slice(0, k).map((x) => x.b);
}
export function exemplarCases(topic: string, k = 3): StyleCase[] {
  const q = words(topic);
  return [...style().cases].map((c) => ({ c, s: overlap(q, words(`${c.module} ${c.title} ${c.expected}`)) })).sort((x, y) => y.s - x.s).slice(0, k).map((x) => x.c);
}

export const PLAIN_RULES = `You write for Procol's QA team and product people, in the voice of their own bug sheets.
Rules:
- Say what a person does and sees on Procol's screens: the buyer portal, the supplier (vendor) portal, the events list, the create screen, Participants, Responses, Master QCS, the award proposal. Name buttons and pages as Procol shows them.
- Say "the buyer", "the vendor", "the event" / "the RFQ" / "the auction", "a bid", "a query", "a reminder", "a PO". Never "the user" when you can say who.
- NEVER write API paths, HTTP codes, status numbers, uuids, ids, parameter or field names, placeholders in braces, or code words (POST, PATCH, GET, 422, 500, null, payload, endpoint, request, response). Those belong only in "howItWasVerified".
- A server crash is "the app breaks with an error" or "the page shows an error instead of …"; an accepted call that should be refused is "Procol lets it through"; a refusal is "Procol stops it and says …".
- Short sentences. One idea per sentence. No jargon. Keep every fact exactly: do not add a fact, do not drop one, do not guess a screen you were not told about.
- The one-line bug reads at a glance, like "A vendor that was never invited can still put a bid into an event".`;

export interface PlainBugInput {
  title: string;
  module?: string;
  /** what the automation saw, in its own (technical) words */
  whatHappened: string;
  /** what the case expects, in its own words */
  expected: string;
  /** the steps the case took, technical or plain */
  steps?: string[];
  /** the technical facts for the engineer: request, status, ids — kept verbatim in howItWasVerified */
  technical?: string;
  /** why it matters, if the case says */
  why?: string;
}
export interface PlainBug {
  bug: string;
  whatGoesWrong: string;
  howToSeeIt: string[];
  whatShouldHappen: string;
  whatActuallyHappens: string;
  /** one or two sentences a product person cares about (the house Description ends with "Why it matters: …") */
  whyItMatters: string;
  howItWasVerified: string;
}

/** A technical finding → the team's plain words (model, fast tier, three exemplars); a rule-based cleanup when the model does not answer. */
export async function plainBug(input: PlainBugInput): Promise<PlainBug> {
  const ex = exemplarBugs(`${input.module ?? ""} ${input.title} ${input.whatHappened}`, 3);
  const examples = ex.map((b, i) => `EXAMPLE ${i + 1}\nBug: ${b.Bug}\nWhat goes wrong: ${b["What goes wrong"]}\nHow to see it: ${b["How to see it"]}\nWhat should happen: ${b["What should happen"]}\nWhat actually happens: ${b["What actually happens"]}`).join("\n\n");
  const user = `${examples ? `${examples}\n\n` : ""}NOW REWRITE THIS FINDING IN THE SAME VOICE. Answer JSON only:
{"bug":"one line","whatGoesWrong":"2-4 short sentences","howToSeeIt":["step 1","step 2","…"],"whatShouldHappen":"1-2 sentences","whatActuallyHappens":"1-2 sentences","whyItMatters":"1-2 sentences a product person cares about"}

FINDING
Title: ${input.title}
${input.module ? `Area: ${input.module}\n` : ""}What the automation saw: ${input.whatHappened}
What the case expects: ${input.expected}
${input.why ? `Why it matters: ${input.why}\n` : ""}${input.steps?.length ? `Steps taken:\n${input.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n` : ""}`;
  const raw = await chat([{ role: "system", content: PLAIN_RULES }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens: 900 }).catch(() => "");
  const j = jsonOf(raw) as Partial<PlainBug> | null;
  const verified = input.technical ?? "";
  if (j && j.bug && j.whatGoesWrong) {
    return {
      bug: scrub(String(j.bug)), whatGoesWrong: scrub(String(j.whatGoesWrong)),
      howToSeeIt: (Array.isArray(j.howToSeeIt) ? j.howToSeeIt : String(j.howToSeeIt ?? "").split(/\n/)).map((s) => scrub(String(s).replace(/^\d+[.)]\s*/, "")).trim()).filter(Boolean),
      whatShouldHappen: scrub(String(j.whatShouldHappen ?? input.expected)), whatActuallyHappens: scrub(String(j.whatActuallyHappens ?? "")),
      whyItMatters: scrub(String((j as any).whyItMatters ?? input.why ?? "")),
      howItWasVerified: verified,
    };
  }
  return fallbackPlain(input);
}

/** No model: the technical words made as plain as rules allow (paths and codes stripped, not rewritten). */
export function fallbackPlain(input: PlainBugInput): PlainBug {
  return {
    bug: scrub(input.title), whatGoesWrong: scrub(input.whatHappened), howToSeeIt: (input.steps ?? []).map(scrub),
    whatShouldHappen: scrub(input.expected), whatActuallyHappens: scrub(input.whatHappened), whyItMatters: scrub(input.why ?? ""), howItWasVerified: input.technical ?? "",
  };
}

/** Strip what must never reach a plain line: paths, codes, uuids, braces. */
export function scrub(t: string): string {
  return String(t ?? "")
    .replace(/\b(GET|POST|PATCH|PUT|DELETE)\s+\/\S+/g, "the call")
    .replace(/\/(v1|api)\/[\w/{}:?=&.-]+/g, "the call")
    .replace(/\bHTTP\s*\d{3}\b/gi, (m) => (/5\d\d/.test(m) ? "a server error" : /4\d\d/.test(m) ? "a refusal" : "an answer"))
    .replace(/\{\{\w+\}\}/g, "it")
    .replace(/\b(uuid|payload|endpoint)\b/gi, (m) => (m.toLowerCase() === "uuid" ? "id" : m.toLowerCase() === "payload" ? "details" : "screen"))
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface PlainCaseInput { title: string; module?: string; preconditions?: string; steps: string[]; expected: string }
/** A generated case → the manual sheets' voice (model, fast tier, three exemplar cases). Keeps every step and the check. */
export async function plainCase(input: PlainCaseInput): Promise<PlainCaseInput> {
  const ex = exemplarCases(`${input.module ?? ""} ${input.title}`, 3);
  const examples = ex.map((c, i) => `EXAMPLE ${i + 1}\nTitle: ${c.title}\nPre-conditions: ${c.preconditions}\nSteps: ${c.steps.slice(0, 700)}\nExpected result: ${c.expected.slice(0, 400)}`).join("\n\n");
  const user = `${examples ? `${examples}\n\n` : ""}NOW REWRITE THIS TEST CASE IN THE SAME VOICE (same number of steps, same checks, nothing added or dropped). Answer JSON only:
{"title":"…","preconditions":"…","steps":["…"],"expected":"…"}

TEST CASE
Title: ${input.title}
Pre-conditions: ${input.preconditions ?? ""}
Steps:
${input.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Expected result: ${input.expected}`;
  const raw = await chat([{ role: "system", content: PLAIN_RULES }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens: 1200 }).catch(() => "");
  const j = jsonOf(raw) as Partial<PlainCaseInput> | null;
  if (!j || !j.title || !Array.isArray(j.steps) || j.steps.length !== input.steps.length) return { ...input, title: scrub(input.title), steps: input.steps.map(scrub), expected: scrub(input.expected) };
  return { ...input, title: scrub(String(j.title)), preconditions: scrub(String(j.preconditions ?? input.preconditions ?? "")), steps: j.steps.map((s) => scrub(String(s))), expected: scrub(String(j.expected ?? input.expected)) };
}
