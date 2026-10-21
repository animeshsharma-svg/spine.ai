/**
 * TEST CASES FROM A SCREEN — what a QA engineer writes after looking at a screen with the code open.
 *
 * Input: a screen inventory (procol-ui-tests `inventory_screen`: every visible control with its
 * disabled / required / placeholder / tooltip state, the banners, the screenshot beside it).
 * Grounding:
 *   • the rules Procol's own code enforces on that screen (data/rules/events-rules.json, each
 *     cited to a file and line), UNTESTED ones first (data/rules/rule-coverage.json);
 *   • product facts and known bugs from the memory;
 *   • the cases the catalog already has about it, so nothing is written twice.
 * The model drafts; code decides what survives:
 *   • every control a draft names must be on the screen (an invented button drops the draft);
 *   • every draft cites a rule it was given, or "screen" for behaviour the screen itself shows;
 *   • a draft the matcher finds already in the catalog is reported as covered, not saved.
 * Survivors are saved as DRAFTS (drafts.ts) — a person approves them before they join the catalog.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";
import { retrieve, FACT_KINDS } from "../rag/knowledgeBase.js";
import { matchTestCase } from "../checks/caseMatcher.js";
import { compileTestCase } from "./planner.js";
import { nextDraftId, saveDraft, type DraftRecord } from "./drafts.js";

const here = dirname(fileURLToPath(import.meta.url));
const RULES = join(here, "..", "..", "data", "rules", "events-rules.json");
const COVERAGE = join(here, "..", "..", "data", "rules", "rule-coverage.json");

export interface InventoryControl {
  kind: string;
  name: string;
  disabled?: boolean;
  danger?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  inputType?: string;
  maxLength?: number;
  selected?: boolean;
  checked?: boolean;
}
export interface ScreenInventory {
  label: string;
  context?: string;
  path: string;
  url: string;
  headings: string[];
  controls: InventoryControl[];
  messages: string[];
  screenshot?: string | null;
}

interface CodeRule {
  id: string;
  area: string;
  layer: string;
  kind: string;
  statement: string;
  file?: string;
  lines?: number[];
  messages?: string[];
}

/** Which dashboard source folders draw a screen, by its URL — the rules that can show on it. */
const SCREEN_SOURCES: Array<[RegExp, string[]]> = [
  [/\/orders\/(quick-create|create)|projectCreation=true/, ["src/views/projectCreation", "src/views/eventCreation", "src/components/dataGrid", "src/views/rfiBuilder", "src/redux/project", "src/views/createOrder"]],
  [/\/awarding\//, ["src/views/awardingFlow", "src/components/masterQcs"]],
  [/\/proposal\//, ["src/views/projectProposal"]],
  [/master_qcs/, ["src/components/masterQcs", "src/views/projectDetails"]],
  [/\/project\//, ["src/views/projectDetails", "src/views/orderDetails"]],
  [/^\/orders\/?(\?|$)/, ["src/views/orders", "src/redux/orders", "src/viewModels/orders"]],
];

const words = (s: string) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

let ruleCache: { rules: CodeRule[]; verdict: Map<string, string> } | null = null;
function codeRules() {
  if (ruleCache) return ruleCache;
  const rules: CodeRule[] = existsSync(RULES) ? JSON.parse(readFileSync(RULES, "utf8")).rules : [];
  const verdict = new Map<string, string>();
  if (existsSync(COVERAGE)) for (const r of JSON.parse(readFileSync(COVERAGE, "utf8")).rules) verdict.set(r.id, r.verdict);
  ruleCache = { rules, verdict };
  return ruleCache;
}

/** The code's rules for this screen, untested first, then the ones that mention what is on screen. */
export function rulesForScreen(inv: ScreenInventory, limit = 30): Array<CodeRule & { verdict: string }> {
  const { rules, verdict } = codeRules();
  const where = `${inv.path}${new URL(inv.url).search}`;
  const folders = SCREEN_SOURCES.find(([re]) => re.test(where))?.[1] ?? [];
  const seen = words([...inv.controls.map((c) => `${c.name} ${c.placeholder ?? ""} ${c.hint ?? ""}`), ...inv.headings, ...inv.messages].join(" "));
  const scored = rules
    .filter((r) => r.layer === "frontend" && folders.some((f) => (r.file ?? "").startsWith(f)))
    .map((r) => {
      const w = words(r.statement);
      let overlap = 0;
      for (const x of w) if (seen.has(x)) overlap++;
      const v = verdict.get(r.id) ?? "not covered";
      return { ...r, verdict: v, score: overlap + (v === "not covered" ? 4 : v === "partly" ? 2 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export interface ScreenDraft {
  title: string;
  kind: "positive" | "negative" | "boundary" | "state" | "button";
  controls: string[];
  grounded: string;
  why: string;
  setup: string;
  steps: string[];
  expected: string;
  priority: "P0" | "P1" | "P2";
}

export interface ScreenCasesResult {
  screen: string;
  path: string;
  screenshot?: string | null;
  controls: number;
  rulesGiven: number;
  untestedRulesGiven: number;
  drafted: number;
  saved: Array<{ id: string; title: string; grounded: string; coverage?: string; gaps?: string[]; kind?: string; steps?: string[]; expected?: string; setup?: string; why?: string; caseText?: string; plan?: unknown; rule?: { id: string; cite: string; statement: string } }>;
  alreadyCovered: Array<{ title: string; by: string }>;
  dropped: Array<{ title: string; why: string }>;
}

function controlLines(inv: ScreenInventory): string {
  return inv.controls
    .slice(0, 160)
    .map((c) => {
      const flags = [c.disabled ? "disabled" : "", c.required ? "required" : "", c.danger ? "destructive" : "", c.selected ? "selected" : "", c.checked ? "on" : "", c.placeholder && c.placeholder !== c.name ? `placeholder "${c.placeholder}"` : "", c.hint ? `tooltip "${c.hint}"` : "", c.maxLength ? `max ${c.maxLength} chars` : ""].filter(Boolean);
      return `- ${c.kind}: "${c.name}"${flags.length ? ` (${flags.join("; ")})` : ""}`;
    })
    .join("\n");
}

function parseJsonArray(text: string): unknown[] {
  const s = text.indexOf("[");
  const e = text.lastIndexOf("]");
  if (s < 0 || e <= s) return [];
  try {
    const v = JSON.parse(text.slice(s, e + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Is this control name on the screen? Exact (normalised), or one contains the other for names of 4+ characters. */
function onScreen(name: string, inv: ScreenInventory): boolean {
  const n = norm(name);
  if (!n) return false;
  return inv.controls.some((c) => {
    const m = norm(c.name);
    const p = norm(c.placeholder ?? "");
    return m === n || p === n || (n.length >= 4 && (m.includes(n) || n.includes(m) && m.length >= 4)) || (p.length >= 4 && (p.includes(n) || n.includes(p)));
  });
}

export async function draftCasesFromScreen(
  inv: ScreenInventory,
  opts: {
    max?: number;
    companyId?: number;
    save?: boolean;
    compile?: boolean;
    onLine?: (l: string) => void;
    seen?: Array<{ id: string; title: string }>;
    /** what the tester has told the platform (explore sessions) — followed over the model's guesses */
    notes?: string[];
  } = {},
): Promise<ScreenCasesResult> {
  const say = opts.onLine ?? (() => {});
  const max = opts.max ?? 8;
  const rules = rulesForScreen(inv);
  const ruleIds = new Set(rules.map((r) => r.id));
  const topic = `${inv.label} ${inv.headings.slice(0, 5).join(" ")} ${inv.controls.slice(0, 25).map((c) => c.name).join(" ")}`;
  const facts = await retrieve(topic, 8, { kinds: FACT_KINDS }).catch(() => []);
  const existing = await retrieve(topic, 15, { kinds: ["test-case"] }).catch(() => []);
  say(`[screen-cases] ${inv.label}: ${inv.controls.length} controls · ${rules.length} code rules (${rules.filter((r) => r.verdict === "not covered").length} untested) · ${facts.length} facts · ${existing.length} nearby cases`);

  const system = [
    "You are a senior QA engineer for Procol, a B2B sourcing platform (buyers run RFQ/RFP events and auctions; vendors bid).",
    "You are looking at ONE screen. Write test cases a manual tester could run on it.",
    "Rules for every case:",
    "- Name only controls from the CONTROLS list, spelled exactly as listed. Never invent a button, field or tab.",
    "- Treat each control's state as listed: a control not marked disabled is enabled NOW. Do not write a case whose premise contradicts that.",
    "- Ground each case: set \"grounded\" to one RULE id from the RULES list, or to \"screen\" when the case checks behaviour the screen itself shows (a disabled control and why, a required marker, a banner, what a button opens).",
    "- Prefer the rules marked UNTESTED. Cover disabled controls (what enables them), required fields, refusals with their exact message, and what each important button opens.",
    "- Destructive controls (delete, withdraw, reject) may be tested only for their confirmation step, never pressed to completion.",
    "- Do not repeat a case from EXISTING CASES.",
    "- Plain language. Steps are short imperative sentences. Expected says what the tester sees, quoting the app's message when the rule gives one.",
    `Return ONLY a JSON array of at most ${max} objects: {"title","kind":"positive|negative|boundary|state|button","controls":[exact names],"grounded":"R-… or screen","why","setup","steps":[…],"expected","priority":"P0|P1|P2"}.`,
  ].join("\n");
  const user = [
    `SCREEN: ${inv.label} — ${inv.path}${inv.context && inv.context !== "none" ? ` (event state: ${inv.context})` : ""}`,
    inv.headings.length ? `HEADINGS: ${inv.headings.slice(0, 12).join(" | ")}` : "",
    inv.messages.length ? `MESSAGES ON SCREEN:\n${inv.messages.slice(0, 10).map((m) => `- ${m}`).join("\n")}` : "",
    `CONTROLS:\n${controlLines(inv)}`,
    `RULES (from Procol's code; UNTESTED = no case covers it yet):\n${rules.map((r) => `- ${r.id} [${r.verdict === "not covered" ? "UNTESTED" : r.verdict}] ${r.statement.replace(/\s+/g, " ").slice(0, 260)}`).join("\n")}`,
    facts.length ? `PRODUCT FACTS:\n${facts.map((f) => `- ${f.text.replace(/\s+/g, " ").slice(0, 220)}`).join("\n")}` : "",
    existing.length ? `EXISTING CASES (do not repeat):\n${existing.map((e) => `- ${e.text.replace(/\s+/g, " ").slice(0, 140)}`).join("\n")}` : "",
    opts.notes?.length ? `WHAT THE TESTER TOLD YOU (follow it):\n${opts.notes.map((n) => `- ${n}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "fast", temperature: 0.2, maxTokens: 4000 });
  const drafts = parseJsonArray(raw) as ScreenDraft[];
  const out: ScreenCasesResult = { screen: inv.label, path: inv.path, screenshot: inv.screenshot, controls: inv.controls.length, rulesGiven: rules.length, untestedRulesGiven: rules.filter((r) => r.verdict === "not covered").length, drafted: drafts.length, saved: [], alreadyCovered: [], dropped: [] };
  if (!raw) out.dropped.push({ title: "(no model answer)", why: "no AI provider answered — set SLINGRING_API_KEY" });

  for (const d of drafts.slice(0, max)) {
    const title = String(d?.title ?? "").trim();
    if (!title || !Array.isArray(d.steps) || !d.steps.length || !d.expected) {
      out.dropped.push({ title: title || "(untitled)", why: "incomplete draft (no steps or expected result)" });
      continue;
    }
    const named = (Array.isArray(d.controls) ? d.controls : []).map(String).filter(Boolean);
    const invented = named.filter((n) => !onScreen(n, inv));
    if (!named.length || invented.length) {
      out.dropped.push({ title, why: named.length ? `names controls that are not on the screen: ${invented.join(", ")}` : "names no control on the screen" });
      continue;
    }
    // A draft may not contradict the screen: "X is disabled" for a control that is enabled right
    // now (or "X becomes enabled" for one that already is) is a premise the screen refutes.
    const said = `${title}. ${d.steps.join(" ")} ${d.expected}`.toLowerCase();
    const contradiction = named
      .map((n) => ({ n, c: inv.controls.find((x) => norm(x.name) === norm(n) || (norm(n).length >= 4 && norm(x.name).includes(norm(n)))) }))
      .find(({ n, c }) => {
        if (!c || c.disabled || !["button", "select", "field", "switch", "tab"].includes(c.kind)) return false;
        const k = n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`${k}[^.]{0,40}\\b(is|stays|remains|appears|shown as|starts)\\s+(disabled|greyed|inactive)|\\b(disabled|greyed out)\\s+["“]?${k}`).test(said) || new RegExp(`\\b(enables?|becomes enabled|gets enabled)\\b[^.]{0,40}${k}|${k}[^.]{0,40}\\b(becomes|gets) enabled`).test(said);
      });
    if (contradiction) {
      out.dropped.push({ title, why: `assumes "${contradiction.n}" starts disabled, but it is enabled on the screen` });
      continue;
    }
    const grounded = String(d.grounded ?? "").trim();
    if (grounded !== "screen" && !ruleIds.has(grounded)) {
      out.dropped.push({ title, why: `cites "${grounded}", which is not one of the rules it was given` });
      continue;
    }
    const caseText = `${title}. ${d.steps.join(" ")} Expected: ${d.expected}`;
    // The same behaviour drafted on another screen of this run ("Ask Clara opens Clara" on
    // three screens) is one case, not three.
    const tw = words(title);
    const twin = (opts.seen ?? []).find((x) => {
      const xw = words(x.title);
      let both = 0;
      for (const w of tw) if (xw.has(w)) both++;
      return both / Math.max(1, Math.min(tw.size, xw.size)) >= 0.75;
    });
    if (twin) {
      out.alreadyCovered.push({ title, by: `${twin.id} (drafted earlier in this run)` });
      continue;
    }
    // words + memory + concepts only (no model call): "existing" means a catalog case already says it
    const match = await matchTestCase(caseText, { llm: false, top: 3 }).catch(() => null);
    const same = match?.decision === "existing" ? match.same.find((c) => c.origin === "catalog") ?? match.same[0] : undefined;
    if (same) {
      out.alreadyCovered.push({ title, by: same.id });
      continue;
    }
    const rule = rules.find((r) => r.id === grounded);
    let coverage: "full" | "partial" | "none" = "none";
    let gaps: string[] = [];
    let uiPlan: unknown;
    if (opts.compile !== false) {
      const c = await compileTestCase(opts.notes?.length ? `${caseText} Tester's notes: ${opts.notes.join(" ")}` : caseText, "events", { tier: "fast", dryRun: true }).catch((e) => ({ coverage: "none" as const, gaps: [String((e as Error).message ?? e).slice(0, 160)], plan: undefined }));
      coverage = c.coverage;
      gaps = c.gaps ?? [];
      uiPlan = (c as { plan?: unknown }).plan;
    }
    const record: DraftRecord = {
      id: opts.save === false ? `GEN-SCR-(preview ${out.saved.length + 1})` : await nextDraftId("SCR"),
      area: "SCR",
      typed: `screen ${inv.label} (${inv.path})`,
      title,
      why: `${String(d.why ?? "").trim() || "Seen on the screen."} Written from the ${inv.label} screen${rule ? `; grounded in ${rule.id} (${rule.file ?? ""}${rule.lines?.length ? `:${rule.lines.join("-")}` : ""})` : "; grounded in what the screen shows"}${inv.screenshot ? `; screenshot ${inv.screenshot.replace(/^.*\/procol-ui-tests\//, "procol-ui-tests/")}` : ""}`,
      setup: String(d.setup ?? "").trim() || "A buyer signed in to the client under test.",
      steps: d.steps.map(String),
      expected: String(d.expected),
      oracle: rule ? `The screen behaves as ${rule.id} says: ${rule.statement.replace(/\s+/g, " ").slice(0, 200)}` : `What the tester sees on the ${inv.label} screen.`,
      priority: ["P0", "P1", "P2"].includes(d.priority) ? d.priority : "P1",
      layer: "ui",
      coverage,
      gaps,
      partialOf: [],
      uiPlan,
      companyId: opts.companyId,
    };
    const savedId = opts.save !== false ? (await saveDraft(record)).id : record.id;
    out.saved.push({
      id: savedId, title, grounded, coverage, gaps, kind: d.kind, steps: record.steps, expected: record.expected, setup: record.setup, why: String(d.why ?? ""), caseText, plan: uiPlan,
      ...(rule ? { rule: { id: rule.id, cite: `${rule.file ?? ""}${rule.lines?.length ? `:${rule.lines.join("-")}` : ""}`, statement: rule.statement } } : {}),
    });
    opts.seen?.push({ id: savedId, title });
  }
  return out;
}
