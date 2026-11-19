/**
 * STEP 3 — WRITE THE CASES, AND SAY ON WHAT BASIS.
 *
 * The user picks the KINDS of cases (happy, negative, edge, permission, state, settings, data, timing,
 * visibility, api, design, error-guessing) and a DEPTH (quick ≈ 20, standard ≈ 60, deep 150+). The engine
 * writes section by section; each section first states its BASIS — the PRD rule or flow it comes from and
 * the technique used — then its cases. The techniques are code where they are mechanical (boundary
 * triples, partitions, the state table, the role × action matrix, settings on/off, data mutations, design
 * labels) and the model is asked only for the words: the steps on Procol's screens and the expected result
 * in the product's language. A case never exists without its source (a flow id, a rule id, a field, a
 * setting key, a ticket id, a frame name).
 *
 * Every row is in the 13-column house format plus "Why this case" and "Source", and is kept in a sheet
 * `gen-<session id>` so the review step and the sheet runner read it like any written sheet. Cases the
 * catalog already has are marked "already have it" (not written twice).
 */
import { chat } from "../ai/llm.js";
import { defectsFor, existingFor, jsonOf, openDefectsFor, sameTitle } from "../agents/deriveCases.js";
import { addSheetCases, sheetCases, type SheetCase } from "../checks/sheetCases.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { advance, updateSession, SESSIONS_DIR, type Session } from "./store.js";
import type { Flow, Rule, Understanding } from "./understanding.js";
import { configsFor } from "./sanity.js";
import { askLater, onAnswer } from "./questions.js";
import { exemplarCases, PLAIN_RULES } from "../ai/plainWords.js";
import { STYLE_GUIDE, styleExamplesText } from "../agents/caseStyle.js";

export const KINDS = ["happy", "negative", "edge", "permission", "state", "settings", "data", "timing", "visibility", "api", "design", "error-guessing"] as const;
export type Kind = (typeof KINDS)[number];
export type Depth = "quick" | "standard" | "deep";

/** The one-line basis shown under each kind in the picker (the user sees it before choosing). */
export const KIND_BASIS: Record<Kind, string> = {
  happy: "From each flow of the PRD: one case per step that changes state, ending on the state the PRD promises.",
  negative: "Each rule that says must / cannot / only becomes one refusal case: the forbidden input and the message or state the PRD expects.",
  edge: "Each numeric or length limit gives three cases — the limit, one below, one above; each list of allowed values gives one case per partition.",
  permission: "Role × action matrix: every role the PRD names against every flow; the cells the PRD forbids, and the two roles nearest to each.",
  state: "State-transition table from the PRD's states: each flow tried in each state; allowed once, forbidden as a refusal.",
  settings: "Each company setting the feature depends on: the flow with it on and with it off; hidden settings are listed, not run.",
  data: "Units, currencies, Indian digit grouping, empty, whitespace, duplicates, very long names, special characters — from the PRD's field types.",
  timing: "Before start, during, at the last minute, after close, extended; two users acting at once where the PRD allows both.",
  visibility: "What the buyer, the vendor, an uninvited vendor and a colleague each see at each state.",
  api: "The flow as requests: each step's request, the reply the PRD implies, and the read-back that proves the change.",
  design: "From the design's frames: each labelled control must exist with that label; each state frame (empty, loading, error) must be reachable.",
  "error-guessing": "From last quarter's HubSpot/RCA tickets in this module: each root cause becomes a regression case on this feature's screens.",
};

const PER_SECTION: Record<Depth, number> = { quick: 3, standard: 8, deep: 25 };

export interface GenCase extends Omit<SheetCase, "sheet" | "layer" | "status"> {
  layer: "ui" | "api";
  kind: Kind;
  why: string;
  source: string;
  existing?: string;
}
export interface Section { kind: Kind; basis: string; planned: number; count: number; existing: number; caseIds: string[]; note?: string }
export interface Generation { at: string; kinds: Kind[]; depth: Depth; sheet: string; sections: Section[]; total: number; existing: number; notes: string[] }
export type GenEvent =
  | { type: "line"; line: string }
  | { type: "section-start"; kind: Kind; basis: string; planned: number }
  | { type: "case"; row: GenCase }
  | { type: "section-done"; kind: Kind; count: number; existing: number; note?: string }
  | { type: "done"; generation: Generation }
  | { type: "error"; why: string };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const stepsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(clean).filter(Boolean) : String(v ?? "").split(/\n|(?<=\.)\s+(?=\d+[.)])/).map((x) => clean(x).replace(/^\d+[.)]\s*/, "")).filter(Boolean));

const SYSTEM = `You are a senior QA engineer at Procol, a B2B sourcing platform (buyers run RFQ / RFP / reverse-auction events on the buyer portal; vendors bid in the supplier portal; evaluators score technical rounds; awards go through approval and become purchase orders).
You write test cases FROM THE PRD ONLY, in the team's house style (the same rules every other case writer on this platform follows):
${STYLE_GUIDE}
- Every expected result comes from a statement in the PRD: quote or closely paraphrase it. When the PRD is silent on something a tester must judge, write the expected result as "Record what happens — the PRD does not say <what>" and say what to confirm; never invent the rule.
- If the PRD names a message, tooltip, label or link, the expected result uses those exact words.
- Implementation notes in the PRD (table, API, file names) are not expectations about what the person sees: write steps and results as a person experiences them.
- Test data: never name a product, a pricing template or a vendor the PRD does not name. Write vendors as "Vendor A" / "Vendor B" (the platform maps them to its QA vendors), the product as "the test product" and the template as "the first pricing template"; quantities, prices and times may be your own.
${styleExamplesText()}
Answer in this JSON shape, as an array:
[{"title":"what is checked, in one sentence","role":"Buyer|Vendor|Evaluator|Approver|…","portal":"Buyer portal|Supplier portal|API","preconditions":"the state the case starts from (a draft / live RFQ / live RFQ with a vendor's bid / closed RFQ with a bid / awarded / converted / withdrawn / amended / RFQ with two bids / Technical + RFQ project) and anything else that must be true","configs":"company settings the case needs, 'key = On|Off — why' per line, or 'None'","testData":"the values used, or '-'","steps":["one user action per step, as the screen names it; the last steps are the checks"],"expected":"what is observed when it passes — the product's words for messages and statuses","priority":"P0|P1|P2|P3","testType":"Happy path|Negative|Boundary|Permission|State|Settings|Data|Timing|Visibility|API|Design|Regression","why":"the basis of this case in one sentence","source":"the id of the flow / rule / field / setting / ticket / frame it comes from, e.g. R4 or FL2 or ticket 325461702389"}]
Rules: every case has a source; never invent a rule the PRD does not state — when the expected outcome is not given by the PRD, write expected as "Record what happens — the PRD does not say <what>" (the house wording; the platform treats it as a question for the product team); steps are actions, not descriptions; the expected result is observable on screen or in the data; no internal ids, no jargon. JSON only.`;

function flowLines(card: Understanding): string {
  return card.flows.map((f) => `${f.id} "${f.name}" (${f.role}, ${f.layer}): starts from ${f.preconditions.join("; ") || "nothing in particular"}; steps: ${f.steps.join(" → ")}; ends: ${f.endState}`).join("\n");
}
function ruleLines(rules: Rule[]): string {
  return rules.map((r) => `${r.id} [${r.kind}] ${r.text} (source: "${r.source}")${r.settingKey ? ` [setting ${r.settingKey}${r.settingNow !== undefined ? ` = ${JSON.stringify(r.settingNow)} on the test company` : ""}]` : ""}`).join("\n");
}

/** A product / template / vendor name the PRD does not give, swapped for the platform's placeholder (see askCases). */
export function scrubInventedNames(t: string, said: string): string {
  return t
    .replace(/\bQA[ _-]?Platform[ _-]?Vendor[ _-]?([AB12])\b(?![ _-]?\d)/gi, (m, x) => (said.includes(m.toLowerCase()) ? m : `Vendor ${/[1A]/i.test(x) ? "A" : "B"}`))
    .replace(/\bQA[ _-](?:test[ _-])?(?:standard[ _-])?(?:RFQ[ _-])?(?:pricing[ _-])?template\b|\bQA[ _-]Standard[ _-]RFQ\b/gi, (m) => (said.includes(m.toLowerCase()) ? m : "the first pricing template"))
    .replace(/\bQA[ _-](?:test[ _-])?(?:line[ _-]item|product|item|bolt|cable|part|material)s?\b/gi, (m) => (said.includes(m.toLowerCase()) ? m : "the test product"));
}

/**
 * EVERY INVITE, BOTH WAYS (the tester, 20 Nov 2026): a case that puts vendors on the event is written and run twice —
 * once with the vendors added BY NAME (as many as the case needs: Vendor A, B, … or the number it says) and once with
 * the product's own "Invite Vendor", which takes every vendor the product suggests. A case that bids, ranks or awards
 * after an Invite Vendor also adds its bidders by name, because the bid is placed as a QA vendor. Done by code, so no
 * invite case reaches the sheet with only one of the two.
 */
const INVITE_STEP = /\binvit\w*\b[^.]*\bvendors?\b|\binvite vendor\b/i;
const NOT_INVITING = /\b(without|do not|don't|never|no|skip\w*|before)\b[^.]*\binvit/i;
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
export function vendorsNeeded(c: Pick<GenCase, "title" | "preconditions" | "testData" | "steps" | "expected">): number {
  const t = [c.title, c.preconditions, c.testData, ...c.steps, c.expected].join(" ");
  const letters = [...t.matchAll(/\bVendor ([A-E])\b/g)].map((m) => "ABCDE".indexOf(m[1]) + 1);
  const said = t.match(/\b(\d|one|two|three|four|five)\s+(?:invited\s+|QA\s+)?vendors?\b/i)?.[1]?.toLowerCase();
  const n = said ? Number(said) || NUM[said] || 1 : 1;
  return Math.min(5, Math.max(1, n, ...letters));
}
export function pairInviteCases(rows: GenCase[]): GenCase[] {
  const out: GenCase[] = [];
  for (const r of rows) {
    const at = r.steps.findIndex((x) => INVITE_STEP.test(x) && !NOT_INVITING.test(x));
    if (at < 0 || /\(vendors invited by name\)|\(invite vendor — all suggested vendors\)/i.test(r.title)) { out.push(r); continue; }
    const n = vendorsNeeded(r);
    const names = "ABCDE".slice(0, n).split("").map((x) => `Vendor ${x}`);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    const after = [...r.steps.slice(at + 1), r.expected].join(" ");
    const bids = /\b(bid|bids|quote|quoted|surrogate|respon[sd]\w*|rank|l1|award\w*|master qcs)\b/i.test(after);
    out.push({
      ...r,
      title: `${r.title} (vendors invited by name)`,
      testData: `Vendors: ${list}, added by name. ${r.testData === "-" ? "" : r.testData}`.trim(),
      steps: r.steps.map((x, i) => (i === at ? `In Participants, search for ${list} and add ${n === 1 ? "it" : "each"} by name — do not press "Invite Vendor".` : x)),
      why: `${r.why} Invite by name (the paired case presses "Invite Vendor").`,
    });
    // a fixed vendor count is not knowable once the product picks the vendors: such a phrase becomes "record how many"
    // (phrase by phrase, so the template / line-item / price checks in the same sentence stay)
    const recount = (t: string) => t
      .replace(/\b(?:Vendor [A-E]|it|they) (?:as|is|are) the (?:only|sole|one|single) (?:invited )?vendors?\b/gi, "every vendor the product suggested as the invited vendors (record how many)")
      .replace(/\bthe (?:only|sole|one|single) (?:invited )?vendor\b/gi, "the invited vendors (every one the product suggested)")
      .replace(/\b(?:exactly|only|just) (?:one|1) (?:invited )?vendors?\b/gi, "every vendor the product suggested (record how many)")
      .replace(/\bparticipants? count (?:is|of|reads|shows|=|equals) ?(?:1|one)\b/gi, "participant count equals the number of vendors the product suggested (record it)")
      .replace(/\b1\s*\/\s*1\b/g, "1/N, N being every invited vendor (record N)");
    const allTitle = r.title.replace(/\b(?:invite|invites|inviting) (?:one|1|a single) vendor\b/i, "invite the suggested vendors").replace(/\b(?:one|1|a single) invited vendor\b/i, "the suggested vendors invited");
    out.push({
      ...r,
      title: `${allTitle} (Invite Vendor — all suggested vendors)`,
      testData: `Vendors: every vendor the product suggests (Invite Vendor)${bids ? `, plus ${list} by name for the bidding` : ""}. ${r.testData === "-" ? "" : r.testData}`.trim(),
      steps: r.steps.map((x, i) => (i === at
        ? `Press "Invite Vendor" to invite every vendor the product suggests.${bids ? ` Then search for ${list} and add ${n === 1 ? "it" : "each"} by name if not already listed — the bidding is done as ${list}.` : ""}`
        : i > at ? recount(x) : x)),
      expected: recount(r.expected),
      why: `${r.why} Invite Vendor (the paired case adds the vendors by name).`,
    });
  }
  return out;
}

/** The model writes the words for a section; the skeleton (what to cover) is given by code. */
async function askCases(card: Understanding, kind: Kind, skeleton: string, max: number, tier: "fast" | "reason"): Promise<GenCase[]> {
  const user = [
    `FEATURE: ${card.title} — ${card.summary}`,
    `ROLES: ${card.roles.map((r) => `${r.name} (${r.canDo.join(", ")})`).join("; ")}`,
    `FLOWS:\n${flowLines(card)}`,
    `RULES:\n${ruleLines(card.rules)}`,
    card.states.length ? `STATES: ${card.states.map((s) => `${s.name} (enters: ${s.enters}; leaves: ${s.leaves})`).join("; ")}` : "",
    card.data.length ? `DATA: ${card.data.map((d) => `${d.field} (${d.type}${d.constraints ? `; ${d.constraints}` : ""})`).join("; ")}` : "",
    `KIND OF CASES TO WRITE: ${kind} — ${KIND_BASIS[kind]}`,
    // the team's own voice: three of their hand-written cases about similar screens (data/plain-style.json)
    (() => { const ex = exemplarCases(`${card.module} ${card.title} ${kind}`, 3); return ex.length ? `WRITE IN THE TEAM'S OWN VOICE. Three of their cases, as examples of wording only (not of content):\n${ex.map((c, i) => `${i + 1}. Title: ${c.title}\n   Pre-conditions: ${c.preconditions.slice(0, 200)}\n   Steps: ${c.steps.slice(0, 500)}\n   Expected: ${c.expected.slice(0, 300)}`).join("\n")}\n${PLAIN_RULES}` : PLAIN_RULES; })(),
    `WRITE EXACTLY THESE, one case each, in this order (skip one only if the PRD makes it impossible, and say so in "why"):\n${skeleton}`,
    `At most ${max} cases.`,
  ].filter(Boolean).join("\n\n");
  let raw = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: user }], { tier, temperature: 0.2, maxTokens: 6000 }).catch(() => "");
  let j = jsonOf(raw);
  let list: any[] = Array.isArray(j) ? j : j && typeof j === "object" ? (Object.values(j).find((v) => Array.isArray(v)) as any[]) ?? [] : [];
  if (!list.length && raw) {
    // a cut-short array: keep the complete objects
    const start = raw.indexOf("[");
    if (start >= 0) { let depth = 0, from = -1; for (let i = start + 1; i < raw.length; i++) { const ch = raw[i]; if (ch === "{") { if (depth === 0) from = i; depth++; } else if (ch === "}") { depth--; if (depth === 0 && from >= 0) { try { list.push(JSON.parse(raw.slice(from, i + 1))); } catch { /* skip */ } from = -1; } } } }
  }
  if (!list.length) {
    raw = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens: 5000 }).catch(() => "");
    j = jsonOf(raw);
    list = Array.isArray(j) ? j : j && typeof j === "object" ? (Object.values(j).find((v) => Array.isArray(v)) as any[]) ?? [] : [];
  }
  // A name the PRD does not give is the model's own and does not exist on the test company (19 Nov: "QA test line item",
  // "QA RFQ Template", "QA_Platform Vendor A" — the runner searched for them until it timed out). Swap them back to the
  // platform's placeholders; a name the PRD itself states stays.
  const said = JSON.stringify(card).toLowerCase();
  const scrub = (t: string) => scrubInventedNames(t, said);
  const scrubAll = (c: any) => c && typeof c === "object" ? { ...c, ...Object.fromEntries(["title", "preconditions", "testData", "expected"].map((k) => [k, typeof c[k] === "string" ? scrub(c[k]) : c[k]])), steps: Array.isArray(c.steps) ? c.steps.map((x: unknown) => typeof x === "string" ? scrub(x) : x) : typeof c.steps === "string" ? scrub(c.steps) : c.steps } : c;
  list = list.map(scrubAll);
  return list.map((c: any): GenCase => ({
    id: "", module: card.module, scenario: "", title: clean(c?.title), role: clean(c?.role) || "Buyer", portal: clean(c?.portal) || "Buyer portal",
    preconditions: clean(c?.preconditions) || "-", configs: clean(c?.configs) || "None", testData: clean(c?.testData) || "-", steps: stepsOf(c?.steps),
    expected: clean(c?.expected), priority: /^P[0-3]$/.test(clean(c?.priority)) ? clean(c?.priority) : "P2", testType: clean(c?.testType) || kind,
    why: clean(c?.why), source: clean(c?.source), kind, layer: (/api/i.test(clean(c?.portal)) ? "api" : "ui") as "ui" | "api",
  })).filter((c) => c.title && c.steps.length >= 2 && c.expected && c.source);
}

// ── the skeletons: what each kind must cover, computed from the card (the mechanical part) ──────────
function skHappy(card: Understanding, max: number): string[] { return card.flows.slice(0, max).map((f) => `${f.id}: the flow "${f.name}" end to end, with a check at every step that changes state and a last check of "${f.endState}"`); }
function skNegative(card: Understanding, max: number): string[] { return card.rules.filter((r) => ["validation", "permission", "limit", "state", "timing"].includes(r.kind)).slice(0, max).map((r) => `${r.id}: break the rule "${r.text}" on purpose and check the refusal the PRD gives ("${r.source}")`); }
function skEdge(card: Understanding, max: number): string[] {
  const out: string[] = [];
  // one case per boundary value, never a bundle: a bundled case hides which value failed (12 Nov: one 24-step case)
  for (const r of card.rules.filter((x) => x.kind === "limit" || /\b\d+\b/.test(x.text))) { const n = r.text.match(/\d+(?:\.\d+)?/)?.[0]; if (n) for (const at of [`exactly ${n}`, `just below ${n}`, `just above ${n}`]) out.push(`${r.id} at ${at}: one case with the value ${at} ("${r.text}")`); }
  for (const r of card.rules.filter((x) => /\b(lower|higher|greater|less|below|above|at least|at most|more than|not more than)\b/i.test(x.text) && !/\b\d+\b/.test(x.text))) for (const at of ["equal to the reference value", "one unit on the allowed side", "one unit on the forbidden side"]) out.push(`${r.id} ${at}: one case ("${r.text}")`);
  for (const d of card.data) { if (/number|money|date/i.test(d.type) && d.constraints) for (const at of ["at the limit", "just below the limit", "just above the limit"]) out.push(`${d.field} ${at}: one case ("${d.constraints}")`); if (/choice/i.test(d.type)) out.push(`${d.field}: one case per allowed value (equivalence partitions)`); }
  return out.slice(0, max);
}
function skPermission(card: Understanding, max: number): string[] {
  const out: string[] = [];
  const roles = card.roles.map((r) => r.name);
  for (const f of card.flows) for (const role of roles) if (role.toLowerCase() !== f.role.toLowerCase()) out.push(`${f.id} × "${role}": "${role}" tries the flow "${f.name}" — allowed or refused as the PRD's permission rules say (cite the rule; if none says, mark "to confirm")`);
  for (const r of card.rules.filter((x) => x.kind === "permission")) out.push(`${r.id}: the permission rule "${r.text}" — the role it forbids tries it`);
  return out.slice(0, max);
}
function skState(card: Understanding, max: number): string[] {
  const out: string[] = [];
  const states = card.states.length ? card.states.map((s) => s.name) : ["draft", "live", "closed", "awarded"];
  for (const f of card.flows) for (const st of states) out.push(`${f.id} in state "${st}": try the flow "${f.name}" when the event / bid is "${st}" — allowed once or refused, as the rules say (cite; else "to confirm")`);
  return out.slice(0, max);
}
function skSettings(card: Understanding, max: number): string[] {
  const out: string[] = [];
  for (const st of card.grounding.settings) { const r = card.rules.find((x) => x.settingKey === st.key); out.push(`${st.key} = On: the main flow with the setting on${st.now !== undefined ? ` (the test company has it ${JSON.stringify(st.now)})` : ""}${r ? ` — the PRD rule ${r.id}` : ""}`); out.push(`${st.key} = Off: the same flow with it off — what the PRD says disappears or is refused${r ? ` (${r.id})` : " (to confirm if the PRD is silent)"}`); }
  return out.slice(0, max);
}
function skData(card: Understanding, max: number): string[] {
  const out: string[] = [];
  const fields = card.data.length ? card.data : [{ field: "the main numeric input of the flow", type: "number", constraints: "" }];
  // one mutation per case: a bundled case hides which value broke (12 Nov: a 15-step case for one field)
  const muts = (d: { field: string; type: string }): string[] =>
    /number|money/i.test(d.type) ? ["left empty", "zero", "a negative value", "a decimal with many places", "Indian digit grouping (1,00,000)", "a value with a unit text (10 kg)"]
    : /date/i.test(d.type) ? ["a past date", "today's date", "the last minute of the day", "an invalid format"]
    : /text/i.test(d.type) ? ["left empty", "only spaces", "a single character", "a very long value (500+ characters)", "special characters and emoji", "a duplicate of an existing value"]
    : /file/i.test(d.type) ? ["no file", "an empty file", "the wrong file type", "a file at the size limit"]
    : ["a value outside the allowed list"];
  for (const d of fields) for (const m of muts(d)) out.push(`${d.field} = ${m}: one case — the field set to ${m}, the save or publish attempted, the outcome read`);
  return out.slice(0, max);
}
function skTiming(card: Understanding, max: number): string[] {
  const out: string[] = [];
  const timed = card.flows.filter((f) => /\b(time|end|start|schedule|expire|extend|deadline|window)\b/i.test(`${f.steps.join(" ")} ${f.endState} ${f.preconditions.join(" ")}`)).concat(card.rules.filter((r) => r.kind === "timing").map((r) => card.flows.find((f) => f.feature === r.feature) ?? card.flows[0]).filter(Boolean) as Flow[]);
  for (const f of [...new Set(timed.length ? timed : card.flows.slice(0, 2))]) { out.push(`${f.id}: before the window opens`); out.push(`${f.id}: in the last minute before it closes`); out.push(`${f.id}: after it closed`); out.push(`${f.id}: after an extension`); out.push(`${f.id}: two users acting at the same moment`); }
  return out.slice(0, max);
}
function skVisibility(card: Understanding, max: number): string[] {
  const out: string[] = [];
  const states = card.states.length ? card.states.map((s) => s.name) : ["live", "closed"];
  for (const st of states) for (const who of ["the buyer who acted", "the vendor concerned", "an uninvited vendor", "a colleague without the permission"]) out.push(`in state "${st}", what ${who} sees (and must not see)`);
  return out.slice(0, max);
}
function skApi(card: Understanding, max: number): string[] { return card.flows.filter((f) => f.layer !== "browser" || true).slice(0, max).map((f) => `${f.id}: the flow "${f.name}" as API requests — each step's request, the reply the PRD implies (2xx, or the refusal code), and a read-back of the record that proves the change`); }
function skDesign(card: Understanding, figmaFrames: Array<{ name: string; labels: string[] }>, max: number): string[] { return figmaFrames.slice(0, max).map((fr) => `frame "${fr.name}": every labelled control is present with its exact label (${fr.labels.slice(0, 12).join(", ")}${fr.labels.length > 12 ? ", …" : ""}); the frame's state (empty / loading / error) is reachable`); }
function skErrorGuessing(card: Understanding, max: number): string[] {
  const subject = `${card.title} ${card.summary} ${card.features.map((f) => f.name).join(" ")}`;
  const defects = defectsFor(subject, card.module, max) as any[];
  // the HubSpot open defects about this feature too (20 Nov 2026) — half the section at most, so both sources speak
  const open = openDefectsFor(subject, card.module, Math.max(1, Math.ceil(max / 2)));
  const fromOpen = open.map((d) => `open defect ${d.caseId} (HubSpot ticket${d.tickets.length > 1 ? "s" : ""} ${d.tickets.join(", ")}, ${d.module}): "${d.subject.slice(0, 160)}" → the regression case that would catch it on this feature`);
  return [...fromOpen, ...defects.slice(0, Math.max(0, max - fromOpen.length)).map((d) => `ticket ${d.ticket ?? d.id}: "${String(d.title ?? "").slice(0, 100)}"${d.symptom ? ` — symptom: ${String(d.symptom).slice(0, 140)}` : ""}${d.rootCause ?? d.rca ? ` — root cause: ${String(d.rootCause ?? d.rca).slice(0, 140)}` : ""} → the regression case that would catch it on this feature`)];
}

/** The PRD rules no written case cites, as one pass per kind (the rule's own kind decides the section). */
const RULE_KIND: Record<string, Kind> = { visibility: "visibility", permission: "permission", validation: "negative", integration: "api", setting: "settings", state: "state", timing: "timing", calculation: "data", limit: "edge" };
export function coveragePasses(card: Understanding, picked: Kind[], written: Array<Pick<GenCase, "source" | "why" | "scenario">>, max: number): Array<{ kind: Kind; skeleton: string[]; basis: string }> {
  const cited = (id: string) => written.some((w) => new RegExp(`\\b${id}\\b`).test(`${w.source} ${w.why} ${w.scenario}`));
  const byKind = new Map<Kind, string[]>();
  for (const r of card.rules) {
    if (cited(r.id)) continue;
    const want = RULE_KIND[r.kind] ?? "happy";
    const kind = picked.includes(want) ? want : picked.includes("happy") ? "happy" : picked[0];
    if (!kind) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), `${r.id}: the rule "${r.text}" (PRD: "${r.source}") — one case that shows it holds, as a person sees it on screen or in the data${r.kind === "integration" ? " (or as the request and its reply, when nothing on screen shows it)" : ""}`]);
  }
  return [...byKind.entries()].map(([kind, sk]) => ({ kind, skeleton: sk.slice(0, max), basis: `Rule coverage — PRD rules no case cited yet, written as ${kind} cases` }));
}

const TIER: Record<Kind, "fast" | "reason"> = { happy: "fast", negative: "reason", edge: "fast", permission: "reason", state: "reason", settings: "fast", data: "fast", timing: "fast", visibility: "reason", api: "fast", design: "fast", "error-guessing": "reason" };

/** Generate. Streams a section at a time; the rows go into the sheet `gen-<session id>`. */
export async function runGeneration(s: Session, kinds: Kind[], depth: Depth, emit: (e: GenEvent) => void): Promise<Session> {
  const card0 = s.understanding as unknown as Understanding | undefined;
  if (!card0?.flows?.length) { emit({ type: "error", why: "Read the requirement first: the cases are written from its flows and rules." }); return s; }
  // only the flows the tester kept (the "which flows" question, the sanity answers)
  const card: Understanding = { ...card0, flows: card0.flows.filter((f) => !f.skip) };
  if (!card.flows.length) { emit({ type: "error", why: "Every flow was left out in your answers, so there is nothing to write cases from; reopen the requirement or sanity step and keep at least one." }); return s; }
  if (card.flows.length < card0.flows.length) emit({ type: "line", line: `${card0.flows.length - card.flows.length} flow(s) left out as you chose: ${card0.flows.filter((f) => f.skip).map((f) => f.name).join("; ")}.` });
  const picked = kinds.filter((k) => KINDS.includes(k));
  if (!picked.length) { emit({ type: "error", why: `Pick at least one kind: ${KINDS.join(", ")}.` }); return s; }
  const max = PER_SECTION[depth] ?? PER_SECTION.standard;
  const sheet = `gen-${s.id}`;
  const notes: string[] = [];
  const figma = (() => { try { const p = join(SESSIONS_DIR, `${s.id}-files`, "figma.json"); return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")).frames ?? []) : []; } catch { return []; } })() as Array<{ name: string; labels: string[] }>;
  emit({ type: "line", line: `Writing ${picked.length} kind(s) of cases at ${depth} depth (up to ${max} a section) for "${card.title}": ${picked.join(", ")}.` });
  const sections: Section[] = [];
  const written: GenCase[] = [];
  const already = sheetCases(sheet);
  let n = already.length;
  const seen = new Set<string>(already.map((c) => c.title.toLowerCase()));
  // The kinds the tester picked, then (standard / deep) one RULE-COVERAGE pass per kind for the PRD rules no case
  // cited yet (20 Nov, A12 on the PR-assignee PRD: 39 rules, 16 of them integration, and the single api section came
  // back empty — the assign action R21 and the notification rules had no case at all).
  const passes: Array<{ kind: Kind; skeleton?: string[]; basis?: string }> = picked.map((kind) => ({ kind }));
  for (let pi = 0; pi < passes.length; pi++) {
    const kind = passes[pi].kind;
    const skeleton = passes[pi].skeleton ?? (kind === "happy" ? skHappy(card, max) : kind === "negative" ? skNegative(card, max) : kind === "edge" ? skEdge(card, max) : kind === "permission" ? skPermission(card, max) : kind === "state" ? skState(card, max) : kind === "settings" ? skSettings(card, max) : kind === "data" ? skData(card, max) : kind === "timing" ? skTiming(card, max) : kind === "visibility" ? skVisibility(card, max) : kind === "api" ? skApi(card, max) : kind === "design" ? skDesign(card, figma, max) : skErrorGuessing(card, max));
    const basis = passes[pi].basis ?? KIND_BASIS[kind];
    if (!skeleton.length) {
      const note = kind === "design" ? "no design frames were read (give a Figma link with a token, or export the frames)" : kind === "settings" ? "the PRD names no company setting the catalogue knows" : kind === "edge" ? "the PRD gives no numeric limit or list of allowed values" : kind === "error-guessing" ? "no RCA ticket or open HubSpot defect matches the feature" : "nothing on the card to base it on";
      sections.push({ kind, basis, planned: 0, count: 0, existing: 0, caseIds: [], note });
      emit({ type: "section-start", kind, basis, planned: 0 });
      emit({ type: "section-done", kind, count: 0, existing: 0, note });
      continue;
    }
    emit({ type: "section-start", kind, basis, planned: skeleton.length });
    // Batches of 8 items (20 Nov, deep run on the PR-assignee PRD: one call for 16–25 items ran past the answer's
    // length and came back with 2 of 16 settings / 4 of 10 negative cases usable). Two batches in flight at a time.
    const BATCH = 8;
    const chunks: string[][] = [];
    for (let i = 0; i < Math.min(skeleton.length, max); i += BATCH) chunks.push(skeleton.slice(i, Math.min(i + BATCH, max)));
    const got: GenCase[][] = new Array(chunks.length);
    for (let i = 0; i < chunks.length; i += 2) {
      await Promise.all(chunks.slice(i, i + 2).map(async (ch, k) => {
        got[i + k] = await askCases(card, kind, ch.map((x, j) => `${i * BATCH + k * BATCH + j + 1}. ${x}`).join("\n"), ch.length, TIER[kind]);
      }));
    }
    const asked = got.flat();
    const rows = pairInviteCases(asked);
    let existing = 0;
    const ids: string[] = [];
    for (const r of rows) {
      if (seen.has(r.title.toLowerCase()) || written.some((w) => sameTitle(w.title, r.title))) continue;
      seen.add(r.title.toLowerCase());
      const twin = existingFor(r.title, 5).find((e) => sameTitle(e.title, r.title));
      if (twin) { r.existing = twin.id; existing++; }
      n++;
      r.id = `GEN-${String(n).padStart(3, "0")}`;
      r.scenario = `${kind} — ${r.source}`;
      // the settings this company needs for the case (the create screen's type, the vendor lock, what the PRD's
      // rules name) — computed like the sanity step does, added to whatever the model wrote (12 Nov: a happy
      // case without default_event_type = rfq opened as an RFI and failed its first check)
      const srcFlow = card.flows.find((f) => r.source.includes(f.id));
      const feature = srcFlow?.feature ?? "";
      // a case that starts from the unpublished event an earlier flow builds runs as that flow's continuation
      // (a draft's schedule and publish live on the create screen) — the same rule as the sanity step
      const prev = srcFlow ? card.flows[card.flows.indexOf(srcFlow) - 1] : undefined;
      if (prev && /\b(not (yet )?(been )?published|unpublished|configured|draft|before (it is |the )?publish)\b/i.test(r.preconditions) && /\b(create|creates|new event|single-stage)\b/i.test(`${prev.name} ${prev.steps.join(" ")}`) && !/\b(create event|single-stage create)\b/i.test(r.steps.join(" "))) {
        r.steps = [...prev.steps, ...r.steps];
        r.preconditions = prev.preconditions.join(" ") || "The buyer can create events.";
        r.why = `${r.why} Runs as the continuation of "${prev.name}": the unpublished event it starts from is built on the create screen.`;
      }
      if (srcFlow?.unproven) r.why = `${r.why} Rests on a flow the sanity run could not prove.`;
      const need = configsFor({ feature, steps: r.steps, preconditions: [r.preconditions] }, card.rules, s);
      if (need !== "None") {
        // the computed line wins over the model's for the same key: the model echoes the company's current value
        // ("default_event_type = rfi") where the case needs the type its steps name
        let have = (r.configs && r.configs !== "None" ? r.configs.split(/\n/) : []).map((x) => x.trim()).filter(Boolean);
        // …except a case ABOUT the company's default type: its own value is the point (19 Nov, SSR-010 "default event type
        // set to rfi and keep RFQ" got default_event_type = rfq and could never see the rfi it checks)
        const aboutDefaultType = /\bdefault (event )?type\b|default_event_type/i.test(`${r.title} ${r.expected}`);
        for (const line of need.split(/\n/)) { const key = line.split("=")[0].trim(); if (key === "default_event_type" && aboutDefaultType) continue; have = have.filter((h) => h.split("=")[0].trim() !== key); have.push(line); }
        r.configs = have.join("\n");
      }
      ids.push(r.id);
      written.push(r);
      emit({ type: "case", row: r });
    }
    const note = asked.length < Math.min(skeleton.length, max) ? `${asked.length} of ${Math.min(skeleton.length, max)} planned came back usable` : undefined;
    sections.push({ kind, basis, planned: skeleton.length, count: ids.length, existing, caseIds: ids, note });
    emit({ type: "section-done", kind, count: ids.length, existing, note });
    if (!rows.length) notes.push(`${kind}: the model gave no usable cases`);
    if (pi === picked.length - 1 && depth !== "quick") for (const extra of coveragePasses(card, picked, written, max)) passes.push(extra);
  }
  if (written.length) addSheetCases(written.map(({ kind: _k, existing, ...c }) => ({ ...c, status: "", twin: existing, reference: `generated for session ${s.id}; ${c.source}` })), sheet);
  const generation: Generation = { at: new Date().toISOString(), kinds: picked, depth, sheet, sections, total: written.length, existing: written.filter((w) => w.existing).length, notes };
  updateSession(s, (f) => { f.generation = generation as unknown as Record<string, unknown>; });
  emit({ type: "line", line: `${written.length} case(s) written in ${sections.filter((x) => x.count).length} section(s); ${generation.existing} already in the catalog.` });
  askAboutToConfirm(s, written);
  emit({ type: "done", generation });
  if (written.length) advance(s, "cases");
  return s;
}

/**
 * A case whose expected result the PRD does not give ("To confirm with the product team: …") makes the
 * platform ask the tester, one question per case, without holding the step. The answer becomes that
 * case's expected result (on the generated sheet, and on the frozen one once approved).
 */
const TO_CONFIRM = /^\s*to confirm with the product team\s*[:—-]?\s*/i;
function askAboutToConfirm(s: Session, rows: GenCase[]): void {
  const open = rows.filter((r) => TO_CONFIRM.test(r.expected));
  if (!open.length) return;
  for (const r of open.slice(0, 25)) {
    const what = r.expected.replace(TO_CONFIRM, "").replace(/\.?\s*$/, "");
    askLater(s, {
      step: "cases", source: "cases", kind: "text",
      text: `For the case “${r.title}”, the PRD doesn't say what should happen. What should the app do?`,
      why: what ? `What I'd need to know: ${what}.` : "With your answer the case gets a real expected result and can pass or fail.",
      options: [{ value: "__leave", label: "Leave it as “to confirm”", means: "The case stays; its run reports what the app did, without a pass or fail." }],
      ref: { caseId: r.id, title: r.title },
    });
  }
}

onAnswer("cases", (s, q) => {
  const id = q.ref?.caseId ?? "";
  if (!id) return;
  if (q.skipped) return `“${id}” stays as “to confirm with the product team”.`;
  const a = (q.answer ?? "").trim();
  if (/^(__leave|leave it)/i.test(a)) return `“${id}” stays as “to confirm with the product team”.`;
  const expected = `${a.replace(/\.?\s*$/, "")}. (The product owner's answer to question ${q.qid}.)`;
  // the generated sheet, and the frozen sheet when the case was already approved under it (approval renumbers
  // the ids, so the frozen copy is found by its title)
  const title = (q.ref?.title ?? "").toLowerCase();
  let where = 0;
  for (const sheet of [`gen-${s.id}`, (s.review as any)?.sheetId].filter(Boolean) as string[]) {
    const c = sheetCases(sheet).find((x) => x.id.toUpperCase() === id.toUpperCase() || (title && x.title.toLowerCase() === title));
    if (!c) continue;
    const { sheet: _sheet, ...row } = c;
    addSheetCases([{ ...row, expected }], sheet);
    where++;
  }
  return where ? `The expected result of “${id}” is now your answer; it can pass or fail on the next run.` : `“${id}” is no longer on the sheet (dropped or renamed), so nothing changed.`;
});
