/**
 * STEP 1b — WHAT THE REQUIREMENT SAYS, READ THE WAY A SENIOR QA READS IT.
 *
 * From the PRD text (and the design's labels when there is one) the platform writes the UNDERSTANDING
 * CARD: features, roles, flows (one happy path per feature, as user actions), rules (each one quoting the
 * PRD phrase it comes from, with its kind), states, data, out-of-scope, assumptions, and the QUESTIONS —
 * what the PRD leaves unsaid that a tester must ask before judging pass or fail.
 *
 * Two rules keep it honest:
 *   • a rule never exists without its source phrase; what the PRD does not say becomes a question;
 *   • the card is grounded after the model: the company settings the rules name (with the test company's
 *     current value from the environment snapshot), the features the environment has OFF, the cases the
 *     catalog already has per feature, and what broke before in this module (the RCA tickets).
 *
 * Long PRDs are read in parts (fast tier per part) and merged (reason tier); answers to questions are
 * applied in one more call that only changes what the answer touches.
 */
import { readFileSync, existsSync } from "node:fs";
import { chat } from "../ai/llm.js";
import { defectsFor, existingFor, jsonOf } from "../agents/deriveCases.js";
import { settingsCatalog } from "../checks/companySettings.js";
import { advance, updateSession, type Session } from "./store.js";
import { askLater, chosenValues, onAnswer, plural, type SessionQuestion } from "./questions.js";

export interface Feature {
  id: string; name: string; what: string; existing?: number; off?: string;
  /** the tester's answer on an off feature: switch it on for the runs / test it as it is */
  testAnyway?: boolean; asIs?: boolean;
}
export interface Role { name: string; canDo: string[] }
export interface Flow {
  id: string; name: string; feature: string; role: string; layer: "browser" | "api" | "both"; preconditions: string[]; steps: string[]; endState: string;
  /** the tester left this flow out (the "which flows" question, or after a sanity verdict) */
  skip?: boolean;
  /** the tester wants cases although the sanity run could not prove the flow */
  unproven?: boolean;
}
export type RuleKind = "validation" | "permission" | "setting" | "limit" | "state" | "calculation" | "visibility" | "timing" | "integration" | "other";
export interface Rule { id: string; text: string; kind: RuleKind; source: string; feature?: string; settingKey?: string; settingNow?: unknown }
export interface Question { id: string; text: string; why: string; kind: "permission" | "default" | "limit" | "state" | "data" | "scope" | "setting" | "other"; answer?: string; skipped?: boolean; from: "model" | "rule" }
export interface Understanding {
  version: number;
  at: string;
  title: string;
  summary: string;
  module: string;
  features: Feature[];
  roles: Role[];
  flows: Flow[];
  rules: Rule[];
  states: Array<{ name: string; enters: string; leaves: string }>;
  data: Array<{ field: string; type: string; constraints: string }>;
  outOfScope: string[];
  assumptions: string[];
  questions: Question[];
  grounding: { settings: Array<{ key: string; name: string; now?: unknown }>; off: Array<{ feature: string; why: string }>; defects: Array<{ ticket: string; title: string }>; existing: number; figmaLabels: number };
  /** what the model could not do, in words (a part that did not parse, a merge that fell back) */
  notes: string[];
}

export type UnderstandEvent =
  | { type: "line"; line: string }
  | { type: "understanding"; card: Understanding }
  | { type: "questions"; questions: Question[] }
  | { type: "error"; why: string };

const SYSTEM = `You are a senior QA engineer at Procol, a B2B sourcing platform (buyers run RFQ / RFP / reverse-auction events; vendors bid in the supplier portal; evaluators score technical rounds; awards go through approval and become purchase orders; purchase requisitions, intake and PO flows exist too).
Read the requirement a product manager wrote and write what a tester must know before writing a single case. Answer JSON only, this shape:
{"title":"the feature's name","summary":"two sentences: what changes for whom","module":"RFQ|Auction|Bidding|Awarding|CounterOffer|Evaluation|EventStatuses|LineItems|Templates|PurchaseOrder|Intake|Approvals|VendorMgmt|Other",
 "features":[{"id":"F1","name":"…","what":"one sentence"}],
 "roles":[{"name":"buyer with award rights","canDo":["…"]}],
 "flows":[{"id":"FL1","name":"…","feature":"F1","role":"…","layer":"browser|api|both","preconditions":["the state the flow starts from"],"steps":["user actions as the screen names them, one per step"],"endState":"what is true when the flow ends"}],
 "rules":[{"id":"R1","text":"the rule in one plain sentence","kind":"validation|permission|setting|limit|state|calculation|visibility|timing|integration","source":"the PRD phrase it comes from, quoted, at most 20 words","feature":"F1"}],
 "states":[{"name":"…","enters":"how it is entered","leaves":"how it is left"}],
 "data":[{"field":"…","type":"number|text|date|money|choice|file","constraints":"limits, units, formats the PRD gives"}],
 "outOfScope":["what the PRD says is not covered"],
 "assumptions":["what you had to assume, each one a candidate question"],
 "questions":[{"id":"Q1","text":"ONE question, in plain words anyone understands, about ONE thing only (never two joined by and/or), under 20 words, no jargon (say 'the vendor's price' not 'bid decimal precision')","why":"one short plain sentence: what goes wrong in a test if nobody answers","kind":"permission|default|limit|state|data|scope|setting|other"}]}
Rules of the reading: never invent a rule — every rule quotes the PRD phrase it comes from; when the PRD is silent on a limit, a default, who may act, or what state is allowed, write a QUESTION, not a rule. Flows are the happy paths only, one per feature, as user actions on screens (or API calls when the PRD describes endpoints). Keep names as the PRD uses them. Mark a flow "api" only when no screen is described. Plain English, no jargon.`;

/**
 * THE FLOWS A CHANGE RUNS THROUGH, asked for on their own (20 Nov 2026). The PR-assignee PRD changes the list behind
 * "Assign"; the reading found 3 flows and none was "assign" — the action most of the tester's 66 cases are about.
 * Asking for those flows in the main reading cost the rules (39 → 6, twice), so a second, small call adds them.
 */
const TOUCHED = `You are a senior QA engineer. The requirement below changes something in an existing product. List ONLY these flows, as JSON {"flows":[{"name":"…","role":"…","layer":"browser|api|both","preconditions":["…"],"steps":["user actions as the screen names them"],"endState":"what is true at the end"}]}:
1. every EXISTING user action the change runs through that the requirement names (where the changed list / filter / message is used — a single and a bulk path, or two screens, are one flow each);
2. one regression flow for each thing the requirement says must stay unchanged (do the old action, see the old result).
Do not repeat these flows the reading already has: {{HAVE}}. At most 6 flows. JSON only.`;
async function touchedFlows(text: string, have: Flow[]): Promise<Flow[]> {
  const raw = jsonOf(await chat([{ role: "system", content: TOUCHED.replace("{{HAVE}}", have.map((f) => `"${f.name}"`).join(", ") || "none") }, { role: "user", content: `REQUIREMENT:\n${text.slice(0, 40_000)}` }], { tier: "fast", temperature: 0.1, maxTokens: 4000 }).catch(() => "")) as { flows?: unknown[] } | null;
  const seen = new Set(have.map((f) => f.name.toLowerCase()));
  return arr<any>(raw?.flows).map((f, i): Flow => ({ id: `FL${have.length + i + 1}`, name: clean(f?.name), feature: have[0]?.feature ?? "F1", role: clean(f?.role) || have[0]?.role || "buyer", layer: (["browser", "api", "both"].includes(f?.layer) ? f.layer : "browser") as Flow["layer"], preconditions: arr<unknown>(f?.preconditions).map(clean).filter(Boolean), steps: arr<unknown>(f?.steps).map(clean).filter(Boolean), endState: clean(f?.endState) }))
    .filter((f) => f.name && f.steps.length && !seen.has(f.name.toLowerCase())).slice(0, 6);
}

const PART = `You are a senior QA engineer reading ONE PART of a longer requirement. Extract, as JSON with the same shape as a full reading ({"features":[],"roles":[],"flows":[],"rules":[],"states":[],"data":[],"outOfScope":[],"assumptions":[],"questions":[]}), only what THIS part states. Every rule quotes its source phrase (≤ 20 words). What the part leaves unsaid becomes a question: ONE thing per question, in plain words, under 20 words. JSON only.`;

const MERGE = `You are a senior QA engineer merging the readings of the parts of one requirement into one understanding card (the full shape: title, summary, module, features, roles, flows, rules, states, data, outOfScope, assumptions, questions). Merge duplicates, renumber ids (F1…, FL1…, R1…, Q1…), keep every source phrase, drop a question that another part answers. JSON only.`;

const APPLY = `You are a senior QA engineer updating an understanding card after the product manager answered some questions. Apply ONLY what the answers change: a rule the answer confirms is added with source "answer to Qn"; a question answered is removed from "questions"; nothing else moves. Return the whole card in the same JSON shape. JSON only.`;

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Split a long PRD on headings into parts the model can read whole. */
function parts(text: string, max = 11_000): string[] {
  if (text.length <= max) return [text];
  const blocks = text.split(/\n(?=#{1,4}\s|\d+\.\s[A-Z])/);
  const out: string[] = [];
  let cur = "";
  for (const b of blocks) {
    if ((cur + b).length > max && cur) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + b;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

function normalise(j: any, figmaLabels: string[]): Omit<Understanding, "version" | "at" | "grounding" | "notes"> {
  const feats = arr<any>(j?.features).map((f, i) => ({ id: clean(f?.id) || `F${i + 1}`, name: clean(f?.name), what: clean(f?.what) })).filter((f) => f.name);
  const flows = arr<any>(j?.flows).map((f, i) => ({ id: clean(f?.id) || `FL${i + 1}`, name: clean(f?.name), feature: clean(f?.feature), role: clean(f?.role), layer: (["browser", "api", "both"].includes(f?.layer) ? f.layer : "browser") as Flow["layer"], preconditions: arr<unknown>(f?.preconditions).map(clean).filter(Boolean), steps: arr<unknown>(f?.steps).map(clean).filter(Boolean), endState: clean(f?.endState) })).filter((f) => f.name && f.steps.length);
  const rules = arr<any>(j?.rules).map((r, i) => ({ id: clean(r?.id) || `R${i + 1}`, text: clean(r?.text), kind: (["validation", "permission", "setting", "limit", "state", "calculation", "visibility", "timing", "integration"].includes(r?.kind) ? r.kind : "other") as RuleKind, source: clean(r?.source), feature: clean(r?.feature) || undefined })).filter((r) => r.text && r.source);
  const questions = arr<any>(j?.questions).map((q, i) => ({ id: clean(q?.id) || `Q${i + 1}`, text: clean(q?.text), why: clean(q?.why), kind: (["permission", "default", "limit", "state", "data", "scope", "setting"].includes(q?.kind) ? q.kind : "other") as Question["kind"], from: "model" as const })).filter((q) => q.text);
  return {
    title: clean(j?.title) || "Untitled requirement",
    summary: clean(j?.summary),
    module: clean(j?.module) || "Other",
    features: feats,
    roles: arr<any>(j?.roles).map((r) => ({ name: clean(r?.name), canDo: arr<unknown>(r?.canDo).map(clean).filter(Boolean) })).filter((r) => r.name),
    flows,
    rules,
    states: arr<any>(j?.states).map((s) => ({ name: clean(s?.name), enters: clean(s?.enters), leaves: clean(s?.leaves) })).filter((s) => s.name),
    data: arr<any>(j?.data).map((d) => ({ field: clean(d?.field), type: clean(d?.type), constraints: clean(d?.constraints) })).filter((d) => d.field),
    outOfScope: arr<unknown>(j?.outOfScope).map(clean).filter(Boolean),
    assumptions: arr<unknown>(j?.assumptions).map(clean).filter(Boolean),
    questions,
  };
}

/** Questions a tester asks by rule, whatever the model said: the gaps a card can show by itself. */
function ruleQuestions(c: Omit<Understanding, "version" | "at" | "grounding" | "notes">, settings: Array<{ key: string }>): Question[] {
  const out: Question[] = [];
  const have = new Set(c.questions.map((q) => q.text.toLowerCase()));
  const add = (text: string, why: string, kind: Question["kind"]) => { if (!have.has(text.toLowerCase())) { have.add(text.toLowerCase()); out.push({ id: `Q${c.questions.length + out.length + 1}`, text, why, kind, from: "rule" }); } };
  for (const r of c.rules) {
    if (r.kind === "limit" && !/\d/.test(r.text)) add(`What is the exact limit for: "${r.text}"?`, "A limit without a number cannot be tested at its boundary.", "limit");
    if (r.kind === "setting" && !r.settingKey) add(`Which company setting controls: "${r.text}"? Is it on for the test company?`, "A behaviour that depends on a setting needs the setting's key to switch it for the case.", "setting");
  }
  const roleNames = new Set(c.roles.map((r) => r.name.toLowerCase()));
  for (const f of c.flows) if (f.role && !roleNames.has(f.role.toLowerCase())) add(`The flow "${f.name}" is done by "${f.role}" — which role in Procol is that, and may any other role do it?`, "The role decides the permission cases and who the platform signs in as.", "permission");
  for (const f of c.features) if (!c.flows.some((fl) => fl.feature === f.id)) add(`Feature "${f.name}": what is its happy path, step by step?`, "No flow was found for it; without one, the sanity run cannot prove it works.", "scope");
  for (const f of c.flows) if (!f.endState) add(`When "${f.name}" ends, what must be true on screen or in the data?`, "The end state is what the flow's last check reads.", "state");
  if (!c.states.length && /\b(live|closed|awarded|draft|published|withdrawn)\b/i.test(c.rules.map((r) => r.text).join(" "))) add("Which event states does this feature apply to, and in which is it refused?", "The state cases come from the state table; the PRD names states but gives no table.", "state");
  return out.slice(0, 12);
}

async function ground(s: Session, c: Omit<Understanding, "version" | "at" | "grounding" | "notes">, figmaLabels: string[], say: (l: string) => void): Promise<Understanding["grounding"]> {
  // settings the rules name, with the test company's current value from the environment snapshot
  let settings: Array<{ key: string; name: string; now?: unknown }> = [];
  try {
    const cat = await settingsCatalog();
    const text = c.rules.map((r) => `${r.text} ${r.source}`).join(" ").toLowerCase();
    const words = new Set(text.split(/[^a-z0-9_]+/).filter((w) => w.length > 4));
    const now = (s.env?.snapshot?.settings?.key ?? {}) as Record<string, unknown>;
    // a key the PRD names verbatim is certain; otherwise most of the key's words must appear in the rules
    settings = cat
      .map((d) => {
        const ws = d.key.toLowerCase().split("_").filter((w) => w.length > 3);
        const named = text.includes(d.key.toLowerCase());
        const hit = ws.filter((w) => words.has(w)).length;
        return { d, named, score: named ? 100 : ws.length >= 2 && hit >= Math.max(2, ws.length - 1) ? hit : 0 };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => ({ key: x.d.key, name: x.d.name || x.d.key, ...(x.d.key in now ? { now: now[x.d.key] } : {}) }));
    // any rule that names a setting (whatever kind the model gave it) is linked to the key and the company's value
    for (const r of c.rules) {
      const t = `${r.text} ${r.source}`.toLowerCase();
      const hit = settings.find((st) => t.includes(st.key)) ?? settings.find((st) => st.name.length > 8 && t.includes(st.name.toLowerCase()));
      if (hit) { r.settingKey = hit.key; r.settingNow = hit.now; if (r.kind === "other") r.kind = "setting"; }
    }
  } catch (e) {
    say(`The settings catalogue could not be read: ${String((e as Error).message).slice(0, 100)}.`);
  }
  // features the environment has off
  const offList = (s.env?.snapshot?.gates?.offList ?? []) as Array<{ feature: string; why: string }>;
  // a feature is "off" only when the gate's name and the feature's name share most of their meaningful words
  const sig = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !["vendor", "buyer", "event", "feature", "level"].includes(w)));
  const overlap = (a: string, b: string) => { const x = sig(a), y = sig(b); if (!x.size || !y.size) return 0; let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.min(x.size, y.size); };
  const off = offList.filter((o) => c.features.some((f) => overlap(f.name, o.feature) >= 0.6)).slice(0, 6);
  for (const f of c.features) { const o = off.find((x) => overlap(f.name, x.feature) >= 0.6); if (o) f.off = o.why; }
  // what the catalog already has, per feature
  let existing = 0;
  for (const f of c.features) { const n = existingFor(`${f.name} ${f.what}`, 20).length; f.existing = n; existing += n; }
  // what broke before in this module
  const defects = defectsFor(`${c.title} ${c.summary} ${c.features.map((f) => f.name).join(" ")}`, c.module, 10).map((d: any) => ({ ticket: String(d.ticket ?? d.id ?? ""), title: String(d.title ?? "").slice(0, 120) })).filter((d) => d.ticket);
  return { settings, off, defects, existing, figmaLabels: figmaLabels.length };
}

/** Read the PRD and write the card. Moves the session to "sanity" when the card has at least one flow. */
export async function runUnderstanding(s: Session, prdText: string, figmaLabels: string[], emit: (e: UnderstandEvent) => void): Promise<Session> {
  const say = (line: string) => emit({ type: "line", line });
  const notes: string[] = [];
  const text = prdText.trim();
  if (!text) { emit({ type: "error", why: "There is no requirement text to read. Give the PRD as text or a file first." }); return s; }
  const labels = figmaLabels.length ? `\n\nLABELS ON THE DESIGN'S SCREENS (use these exact words for controls when the PRD and the design agree): ${figmaLabels.slice(0, 150).join(" | ")}` : "";
  const ps = parts(text);
  let raw: any = null;
  if (ps.length === 1) {
    say(`Reading the requirement (${text.length.toLocaleString("en-IN")} characters) the way a tester reads it: features, roles, flows, rules with their source, states, data, and what it leaves unsaid…`);
    raw = jsonOf(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: `REQUIREMENT:\n${text}${labels}` }], { tier: "reason", temperature: 0.1, maxTokens: 14000 }).catch((e) => { notes.push(`the model could not be asked: ${String(e.message).slice(0, 120)}`); return ""; }));
    if (!raw) {
      say("The careful reading did not come back as JSON; asking once more on the fast tier.");
      raw = jsonOf(await chat([{ role: "system", content: SYSTEM }, { role: "user", content: `REQUIREMENT:\n${text.slice(0, 12000)}${labels}` }], { tier: "fast", temperature: 0.1, maxTokens: 12000 }).catch(() => ""));
    }
  } else {
    say(`The requirement is long (${text.length.toLocaleString("en-IN")} characters): reading it in ${ps.length} parts, then merging.`);
    const partial: any[] = [];
    for (let i = 0; i < ps.length; i++) {
      const j = jsonOf(await chat([{ role: "system", content: PART }, { role: "user", content: `PART ${i + 1} OF ${ps.length}:\n${ps[i]}` }], { tier: "fast", temperature: 0.1, maxTokens: 4000 }).catch(() => ""));
      if (j) partial.push(j); else notes.push(`part ${i + 1} did not parse and was skipped`);
      say(`Part ${i + 1} of ${ps.length} read${j ? "" : " (nothing usable)"}.`);
    }
    raw = jsonOf(await chat([{ role: "system", content: MERGE }, { role: "user", content: `PARTS:\n${JSON.stringify(partial).slice(0, 60_000)}${labels}` }], { tier: "reason", temperature: 0.1, maxTokens: 14000 }).catch(() => ""));
    if (!raw && partial.length) { notes.push("the merge did not parse; the parts were joined without the model"); raw = { title: "Requirement", features: partial.flatMap((p) => p.features ?? []), roles: partial.flatMap((p) => p.roles ?? []), flows: partial.flatMap((p) => p.flows ?? []), rules: partial.flatMap((p) => p.rules ?? []), states: partial.flatMap((p) => p.states ?? []), data: partial.flatMap((p) => p.data ?? []), outOfScope: partial.flatMap((p) => p.outOfScope ?? []), assumptions: partial.flatMap((p) => p.assumptions ?? []), questions: partial.flatMap((p) => p.questions ?? []) }; }
  }
  if (!raw) { emit({ type: "error", why: "The requirement could not be read: the model gave no usable answer twice. Try again in a minute, or paste a shorter part." }); return s; }
  const c = normalise(raw, figmaLabels);
  const touched = await touchedFlows(text, c.flows).catch(() => [] as Flow[]);
  if (touched.length) { c.flows.push(...touched); say(`${touched.length} more flow(s) the change runs through: ${touched.map((f) => f.name).join("; ")}.`); }
  say(`${c.features.length} feature(s), ${c.roles.length} role(s), ${c.flows.length} flow(s), ${c.rules.length} rule(s) with their source, ${c.questions.length} question(s) from the text.`);
  say("Grounding the card: the company settings the rules name, the features this environment has off, the cases already written, what broke before in this module…");
  const grounding = await ground(s, c, figmaLabels, say);
  c.questions.push(...ruleQuestions(c, grounding.settings));
  const card: Understanding = { version: ((s.understanding as any)?.version ?? 0) + 1, at: new Date().toISOString(), ...c, grounding, notes };
  updateSession(s, (f) => { f.understanding = card as unknown as Record<string, unknown>; });
  emit({ type: "understanding", card });
  emit({ type: "questions", questions: card.questions });
  askAboutCard(s, card, say);
  if (card.flows.length) advance(s, "requirement"); else say("No flow could be read from the requirement, so the sanity step cannot start yet; answer the questions or give more of the PRD.");
  return s;
}

/**
 * WHAT THE CARD MAKES THE PLATFORM ASK, ON SCREEN, BEFORE ANY FLOW RUNS:
 *   • which of the flows it found should be tested (all ticked; a flow left out gets no run and no cases);
 *   • every question the PRD leaves open, one at a time, with "I don't know" as an honest answer;
 *   • each feature the test company has switched off: switch it on for the runs, leave it out, or test it as it is.
 * None of these waits: the tester answers when ready, and the answer is applied by the appliers below.
 */
function askAboutCard(s: Session, card: Understanding, say: (l: string) => void): void {
  const company = s.env?.companyName ?? (s.env?.companyId ? `company ${s.env.companyId}` : "the test company");
  if (card.flows.length) {
    askLater(s, {
      step: "requirement", source: "flows", kind: "many",
      text: card.flows.length === 1 ? `I found one flow in the PRD, “${card.flows[0].name}”. Should I test it?` : `I found ${plural(card.flows.length, "flow")} in the PRD. Which ones should I test?`,
      why: "A flow you leave out gets no sanity run and no cases; you can change this later by reopening the requirement step.",
      options: card.flows.map((f) => ({ value: f.id, label: f.name, means: `${f.role || "buyer"}, ${plural(f.steps.length, "step")}, ends with “${f.endState || "the PRD's end state"}”` })),
      suggested: card.flows.map((f) => f.id).join(","),
    });
  }
  // On screen, only the questions that most change a test's expected result (20 Nov dry run: a 1,284-character PRD
  // gave 19, down to "which currency applies to the bid of 100"); the rest stay on the card, answerable there.
  const open = card.questions.filter((x) => !x.answer && !x.skipped);
  const weight = (q: Question) => ["permission", "limit", "state", "setting", "default", "scope", "data", "other"].indexOf(q.kind) + (q.from === "rule" ? 10 : 0);
  const onScreen = [...open].sort((a, b) => weight(a) - weight(b)).slice(0, ASK_ON_SCREEN);
  if (open.length > onScreen.length) say(`${plural(onScreen.length, "question")} asked on screen (the ones that change what a test expects); ${open.length - onScreen.length} more are on the card if you want to answer them.`);
  for (const q of onScreen) {
    askLater(s, {
      step: "requirement", source: "prd", kind: "text",
      text: q.text, why: q.why,
      options: [{ value: "__dontknow", label: "I don't know", means: "Where this matters, the case will say “to confirm with the product team” instead of guessing." }],
      ref: { questionId: q.id },
    });
  }
  for (const f of card.features.filter((x) => x.off)) {
    askLater(s, {
      step: "requirement", source: "setting", kind: "one",
      text: `The feature “${f.name}” is switched off on ${company}. What should I do with it?`,
      why: `Off here means: ${String(f.off).replace(/^not on for [^:]+:\s*/i, "")}.`,
      options: [
        { value: "on", label: "Switch it on for the runs, and back after", means: s.env?.companyId === 198678 ? "I switch settings on PROCOL DEMO through the platform and restore them." : `I only switch settings on PROCOL DEMO; on ${company} its flows will come back “couldn't reach”.` },
        { value: "out", label: "Leave its flows out", means: "No sanity run and no cases for this feature." },
        { value: "asis", label: "Test it as it is", means: "The cases check that the feature stays hidden while it is off." },
      ],
      suggested: s.env?.companyId === 198678 ? "on" : "out",
      ref: { feature: f.id },
    });
  }
}

/** how many of the card's questions are asked on screen; the rest wait on the card */
const ASK_ON_SCREEN = 6;

const cardOf = (f: Session) => f.understanding as unknown as Understanding | undefined;

onAnswer("flows", (s, q) => {
  if (q.skipped) return "Skipped: every flow stays in.";
  const chosen = new Set(chosenValues(q, q.answer ?? "").map((x) => x.toLowerCase()));
  let kept = 0; const out: string[] = [];
  updateSession(s, (f) => {
    const c = cardOf(f); if (!c) return;
    for (const fl of c.flows) { fl.skip = !(chosen.has(fl.id.toLowerCase()) || chosen.has(fl.name.toLowerCase())); if (fl.skip) out.push(fl.name); else kept++; }
  });
  return out.length ? `${plural(kept, "flow")} kept; left out: ${out.join("; ")}.` : `All ${plural(kept, "flow")} will be tested.`;
});

onAnswer("prd", (s, q) => {
  const id = q.ref?.questionId ?? "";
  if (q.skipped) { answerQuestion(s, id, undefined, true); return `Skipped on the card too (${id}); the cases will say “to confirm with the product team” where it matters.`; }
  const dontKnow = /^(__dontknow|i don'?t know)$/i.test(q.answer ?? "");
  const card = answerQuestion(s, id, dontKnow ? undefined : q.answer, dontKnow);
  if (!card) return "Noted; the card no longer has that question.";
  return dontKnow ? `Noted as unknown on the card (${id}); the cases will say “to confirm with the product team” where it matters.` : `Noted on the card as the answer to ${id}. Press “Apply answers” to rewrite the rules with it.`;
});

onAnswer("setting", (s, q) => {
  if (q.skipped) return "Skipped: the feature stays as it is and its flows stay in.";
  const a = (q.answer ?? "").toLowerCase();
  const pick = /^(on|switch)/.test(a) ? "on" : /^(out|leave)/.test(a) ? "out" : /^(asis|test it as)/.test(a) ? "asis" : null;
  if (!pick) return `I couldn't read “${q.answer}” as one of the three choices; nothing changed.`;
  let name = "";
  updateSession(s, (f) => {
    const c = cardOf(f); const feat = c?.features.find((x) => x.id === q.ref?.feature); if (!c || !feat) return;
    name = feat.name;
    feat.testAnyway = pick === "on"; feat.asIs = pick === "asis";
    for (const fl of c.flows) if (fl.feature === feat.id) fl.skip = pick === "out" ? true : fl.skip;
  });
  return pick === "on" ? `I'll switch the setting behind “${name}” on for its runs and put it back after.` : pick === "out" ? `The flows of “${name}” are left out.` : `“${name}” is tested as it is: the cases check it stays hidden while off.`;
});

export type { SessionQuestion };

/** Record an answer (or a skip) on a question. */
export function answerQuestion(s: Session, questionId: string, answer?: string, skip?: boolean): Understanding | null {
  const card = s.understanding as unknown as Understanding | undefined;
  if (!card) return null;
  const q = card.questions.find((x) => x.id === questionId);
  if (!q) return null;
  if (skip) { q.skipped = true; delete q.answer; } else { q.answer = clean(answer); q.skipped = false; }
  updateSession(s, (f) => { f.understanding = card as unknown as Record<string, unknown>; });
  return card;
}

/** Apply the answers given so far to the card (one model call); the version goes up. */
export async function applyAnswers(s: Session, emit: (e: UnderstandEvent) => void): Promise<Understanding | null> {
  const card = s.understanding as unknown as Understanding | undefined;
  if (!card) return null;
  const answered = card.questions.filter((q) => q.answer);
  if (!answered.length) { emit({ type: "understanding", card }); return card; }
  emit({ type: "line", line: `Applying ${answered.length} answer(s) to the card…` });
  const raw = jsonOf(await chat([{ role: "system", content: APPLY }, { role: "user", content: `CARD:\n${JSON.stringify({ ...card, grounding: undefined, notes: undefined }).slice(0, 50_000)}\n\nANSWERS:\n${answered.map((q) => `${q.id}: ${q.text}\n→ ${q.answer}`).join("\n")}` }], { tier: "reason", temperature: 0.1, maxTokens: 14000 }).catch(() => ""));
  if (!raw) { emit({ type: "error", why: "The answers could not be applied (the model gave no usable card). The answers are kept; try again." }); return card; }
  const c = normalise(raw, []);
  // answered questions stay on the card, marked, so the user sees what was settled
  const kept = card.questions.filter((q) => q.answer || q.skipped);
  const fresh = c.questions.filter((q) => !kept.some((k) => k.text.toLowerCase() === q.text.toLowerCase()));
  // A rewrite that comes back with far fewer rules or flows was cut short, not corrected by an answer (20 Nov: the
  // same PRD read as 39, 37 and 7 rules): the earlier list stays where the new one lost more than a quarter of it.
  const shrunk = (was: unknown[], now: unknown[]) => was.length >= 4 && now.length < was.length * 0.75;
  const rules = shrunk(card.rules, c.rules) ? card.rules : c.rules;
  const flows = shrunk(card.flows, c.flows) ? card.flows : c.flows;
  if (rules !== c.rules || flows !== c.flows) emit({ type: "line", line: `The rewrite came back with ${c.rules.length} rule(s) and ${c.flows.length} flow(s) where the card had ${card.rules.length} and ${card.flows.length} — kept the card's ${rules !== c.rules ? "rules" : ""}${rules !== c.rules && flows !== c.flows ? " and " : ""}${flows !== c.flows ? "flows" : ""}; the answers are applied to the rest.` });
  const next: Understanding = { ...card, ...c, rules, flows, version: card.version + 1, at: new Date().toISOString(), questions: [...kept, ...fresh], grounding: card.grounding, notes: card.notes };
  updateSession(s, (f) => { f.understanding = next as unknown as Record<string, unknown>; });
  emit({ type: "understanding", card: next });
  if (next.flows.length) advance(s, "requirement");
  return next;
}

export function understandingOf(s: Session): Understanding | null {
  return (s.understanding as unknown as Understanding) ?? null;
}

/** For tests and the CLI: the PRD text kept with a session file, if any. */
export function readKeptPrd(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}
