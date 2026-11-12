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
import { defectsFor, existingFor, jsonOf, sameTitle } from "../agents/deriveCases.js";
import { addSheetCases, sheetCases, type SheetCase } from "../checks/sheetCases.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { advance, updateSession, SESSIONS_DIR, type Session } from "./store.js";
import type { Flow, Rule, Understanding } from "./understanding.js";
import { configsFor } from "./sanity.js";

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
You write test cases in plain English that a new tester can run by hand, in this JSON shape, as an array:
[{"title":"what is checked, in one sentence","role":"Buyer|Vendor|Evaluator|Approver|…","portal":"Buyer portal|Supplier portal|API","preconditions":"the state the case starts from (a draft / live RFQ / live RFQ with a vendor's bid / closed RFQ with a bid / awarded / converted / withdrawn / amended / RFQ with two bids / Technical + RFQ project) and anything else that must be true","configs":"company settings the case needs, 'key = On|Off — why' per line, or 'None'","testData":"the values used, or '-'","steps":["one user action per step, as the screen names it; the last steps are the checks"],"expected":"what is observed when it passes — the product's words for messages and statuses","priority":"P0|P1|P2|P3","testType":"Happy path|Negative|Boundary|Permission|State|Settings|Data|Timing|Visibility|API|Design|Regression","why":"the basis of this case in one sentence","source":"the id of the flow / rule / field / setting / ticket / frame it comes from, e.g. R4 or FL2 or ticket 325461702389"}]
Rules: every case has a source; never invent a rule the PRD does not state — when the expected outcome is not given by the PRD, write expected as "To confirm with the product team: …" and say what to confirm; steps are actions, not descriptions; the expected result is observable on screen or in the data; no internal ids, no jargon. JSON only.`;

function flowLines(card: Understanding): string {
  return card.flows.map((f) => `${f.id} "${f.name}" (${f.role}, ${f.layer}): starts from ${f.preconditions.join("; ") || "nothing in particular"}; steps: ${f.steps.join(" → ")}; ends: ${f.endState}`).join("\n");
}
function ruleLines(rules: Rule[]): string {
  return rules.map((r) => `${r.id} [${r.kind}] ${r.text} (source: "${r.source}")${r.settingKey ? ` [setting ${r.settingKey}${r.settingNow !== undefined ? ` = ${JSON.stringify(r.settingNow)} on the test company` : ""}]` : ""}`).join("\n");
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
  const defects = defectsFor(`${card.title} ${card.summary} ${card.features.map((f) => f.name).join(" ")}`, card.module, max) as any[];
  return defects.map((d) => `ticket ${d.ticket ?? d.id}: "${String(d.title ?? "").slice(0, 100)}"${d.symptom ? ` — symptom: ${String(d.symptom).slice(0, 140)}` : ""}${d.rootCause ?? d.rca ? ` — root cause: ${String(d.rootCause ?? d.rca).slice(0, 140)}` : ""} → the regression case that would catch it on this feature`);
}

const TIER: Record<Kind, "fast" | "reason"> = { happy: "fast", negative: "reason", edge: "fast", permission: "reason", state: "reason", settings: "fast", data: "fast", timing: "fast", visibility: "reason", api: "fast", design: "fast", "error-guessing": "reason" };

/** Generate. Streams a section at a time; the rows go into the sheet `gen-<session id>`. */
export async function runGeneration(s: Session, kinds: Kind[], depth: Depth, emit: (e: GenEvent) => void): Promise<Session> {
  const card = s.understanding as unknown as Understanding | undefined;
  if (!card?.flows?.length) { emit({ type: "error", why: "Read the requirement first: the cases are written from its flows and rules." }); return s; }
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
  for (const kind of picked) {
    const skeleton = kind === "happy" ? skHappy(card, max) : kind === "negative" ? skNegative(card, max) : kind === "edge" ? skEdge(card, max) : kind === "permission" ? skPermission(card, max) : kind === "state" ? skState(card, max) : kind === "settings" ? skSettings(card, max) : kind === "data" ? skData(card, max) : kind === "timing" ? skTiming(card, max) : kind === "visibility" ? skVisibility(card, max) : kind === "api" ? skApi(card, max) : kind === "design" ? skDesign(card, figma, max) : skErrorGuessing(card, max);
    const basis = KIND_BASIS[kind];
    if (!skeleton.length) {
      const note = kind === "design" ? "no design frames were read (give a Figma link with a token, or export the frames)" : kind === "settings" ? "the PRD names no company setting the catalogue knows" : kind === "edge" ? "the PRD gives no numeric limit or list of allowed values" : kind === "error-guessing" ? "no RCA ticket in this module matches the feature" : "nothing on the card to base it on";
      sections.push({ kind, basis, planned: 0, count: 0, existing: 0, caseIds: [], note });
      emit({ type: "section-start", kind, basis, planned: 0 });
      emit({ type: "section-done", kind, count: 0, existing: 0, note });
      continue;
    }
    emit({ type: "section-start", kind, basis, planned: skeleton.length });
    const rows = await askCases(card, kind, skeleton.map((x, i) => `${i + 1}. ${x}`).join("\n"), max, TIER[kind]);
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
      const need = configsFor({ feature, steps: r.steps, preconditions: [r.preconditions] }, card.rules, s);
      if (need !== "None") {
        const have = (r.configs && r.configs !== "None" ? r.configs.split(/\n/) : []).map((x) => x.trim()).filter(Boolean);
        for (const line of need.split(/\n/)) { const key = line.split("=")[0].trim(); if (!have.some((h) => h.split("=")[0].trim() === key)) have.push(line); }
        r.configs = have.join("\n");
      }
      ids.push(r.id);
      written.push(r);
      emit({ type: "case", row: r });
    }
    const note = rows.length < Math.min(skeleton.length, max) ? `${rows.length} of ${Math.min(skeleton.length, max)} planned came back usable` : undefined;
    sections.push({ kind, basis, planned: skeleton.length, count: ids.length, existing, caseIds: ids, note });
    emit({ type: "section-done", kind, count: ids.length, existing, note });
    if (!rows.length) notes.push(`${kind}: the model gave no usable cases`);
  }
  if (written.length) addSheetCases(written.map(({ kind: _k, existing, ...c }) => ({ ...c, status: "", twin: existing, reference: `generated for session ${s.id}; ${c.source}` })), sheet);
  const generation: Generation = { at: new Date().toISOString(), kinds: picked, depth, sheet, sections, total: written.length, existing: written.filter((w) => w.existing).length, notes };
  updateSession(s, (f) => { f.generation = generation as unknown as Record<string, unknown>; });
  emit({ type: "line", line: `${written.length} case(s) written in ${sections.filter((x) => x.count).length} section(s); ${generation.existing} already in the catalog.` });
  emit({ type: "done", generation });
  if (written.length) advance(s, "cases");
  return s;
}
