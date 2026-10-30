/**
 * THE SCREEN LIBRARY — what every screen of the events flow looks like, what is on it, what each
 * control does to the product, how the flow reaches it, and the test cases written from it.
 *
 * One record per screen (by label). It is built from a screen inventory the browser runner
 * took (procol-ui-tests `inventory_screen`: the screenshot, the annotated map with every
 * control numbered, each control's box on the screen, the accessibility tree) and grounded in
 * the rules Procol's own code enforces on that screen (data/rules/events-rules.json, each cited
 * to a file and line). The model describes; code decides what survives:
 *   • an effect must name a control that is on the screen (by number), else it is dropped;
 *   • a rule it cites must be one it was given, else the citation is removed;
 *   • a control the model could not ground is marked "unknown", never invented.
 *
 * Everything lands in three places:
 *   data/screens/<id>.json               the record (controls with boxes, effects, cases, how reached)
 *   data/screens/img/<id>.png | -map.png the pictures, copied out of the run's evidence
 *   knowledge/events/screens/<id>.md     the memory: `npm run rag:build` turns it into chunks the
 *                                        planner recalls when a new case names this screen
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";
import { retrieve, FACT_KINDS } from "../rag/knowledgeBase.js";
import { draftCasesFromScreen, rulesForScreen, type ScreenInventory, type InventoryControl } from "./screenCases.js";
import { compileTestCase } from "./planner.js";
import { nextDraftId, saveDraft, type DraftRecord } from "./drafts.js";
import { toHouseStyle } from "./caseStyle.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
export const SCREENS_DIR = join(ROOT, "data", "screens");
const IMG_DIR = join(SCREENS_DIR, "img");
const KNOWLEDGE_DIR = join(ROOT, "knowledge", "events", "screens");

export interface ScreenControl extends InventoryControl {
  n?: number;
  box?: { x: number; y: number; w: number; h: number };
  offscreen?: boolean;
}

export interface ControlEffect {
  /** the control's number on the map */
  n: number;
  control: string;
  kind: string;
  /** what happens when a person clicks / fills it */
  does: string;
  /** what it changes in the event's flow or data */
  affects: string;
  /** the screen or state it leads to ("stays here" when it does not move) */
  leadsTo: string;
  /** how a tester would check it */
  check: string;
  /** the code rule this comes from, when one was given and cited */
  rule?: string;
  /** code = cites a rule · known = from product facts in memory · guess = the model's reading · unknown = nobody knows yet */
  confidence: "code" | "known" | "guess" | "unknown";
}

export interface ScreenCase {
  id: string;
  title: string;
  kind?: string;
  grounded?: string;
  steps: string[];
  expected: string;
  setup?: string;
  coverage?: "full" | "partial" | "none";
  gaps?: string[];
  /** which control numbers it is about */
  controls?: number[];
  /** when a person turned an effect into this case */
  fromEffect?: number;
  /** the compiled browser plan, kept here too so the case runs even when the drafts table is away */
  plan?: unknown;
  /** the event state and screen the plan was compiled for (the API builds that state before the run) */
  prep?: { state: string; screen: string; technical?: boolean; prepared: boolean };
}

export interface ScreenRecord {
  id: string;
  label: string;
  path: string;
  url: string;
  /** the event state the screen was opened on (none, draft, live, bid, …) */
  state: string;
  title: string;
  headings: string[];
  messages: string[];
  viewport?: { w: number; h: number };
  controls: ScreenControl[];
  effects: ControlEffect[];
  rules: Array<{ id: string; statement: string; cite: string; verdict: string }>;
  cases: ScreenCase[];
  /** the plan steps that reached this screen (how a new case gets here) */
  reachedBy: Array<{ step: string; args?: Record<string, unknown> }>;
  companyId?: number;
  runId?: string | null;
  /** the run's evidence files (kept for the sessions view) */
  evidence: { screenshot: string | null; map: string | null; inventory: string };
  /** the copies the dashboard serves */
  images: { plain: string | null; map: string | null };
  takenAt: string;
  updatedAt: string;
  /** how many captures this screen has had */
  captures: number;
}

export interface ScreenSummary {
  id: string;
  label: string;
  path: string;
  state: string;
  controls: number;
  effects: number;
  known: number;
  cases: number;
  rulesUntested: number;
  takenAt: string;
  captures: number;
  hasMap: boolean;
  /** where the card's picture comes from: the walk, one of this computer's runs, or none here */
  picture: "walk" | "run" | null;
  pictureAt?: string;
}

export const slug = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "screen";
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function parseJsonArray(raw: string): any[] {
  const text = String(raw ?? "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    // a trailing comma or a stray comment: try the lenient route, one object at a time
    const out: any[] = [];
    for (const m of text.slice(start, end + 1).matchAll(/\{[^{}]*\}/g)) {
      try {
        out.push(JSON.parse(m[0]));
      } catch {
        /* skip */
      }
    }
    return out;
  }
}

/** The inventory file a run wrote, as the screen-cases agent reads it. */
export function readInventory(file: string): ScreenInventory & { map?: string | null; runId?: string | null; viewport?: { w: number; h: number }; title?: string; takenAt?: string } {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function listScreens(): ScreenSummary[] {
  if (!existsSync(SCREENS_DIR)) return [];
  return readdirSync(SCREENS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => {
      try {
        const r = JSON.parse(readFileSync(join(SCREENS_DIR, f), "utf8")) as ScreenRecord;
        return summary(r);
      } catch {
        return null;
      }
    })
    .filter((x): x is ScreenSummary => !!x)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function summary(r: ScreenRecord): ScreenSummary {
  return {
    id: r.id,
    label: r.label,
    path: r.path,
    state: r.state,
    controls: r.controls.length,
    effects: r.effects.length,
    known: r.effects.filter((e) => e.confidence !== "unknown").length,
    cases: r.cases.length,
    rulesUntested: r.rules.filter((x) => x.verdict === "not covered").length,
    takenAt: r.takenAt,
    captures: r.captures,
    hasMap: !!r.images.map,
    ...(() => {
      const p = pictureOf(r, "plain");
      return { picture: p?.from ?? null, pictureAt: p?.at };
    })(),
  };
}

export function getScreen(id: string): ScreenRecord | null {
  const f = join(SCREENS_DIR, `${slug(id)}.json`);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as ScreenRecord;
  } catch {
    return null;
  }
}

/** Where a screen's picture comes from: its own walk, or one of this computer's runs. */
export interface ScreenPicture {
  file: string;
  from: "walk" | "run";
  /** for a run's picture: which run, after which step, when */
  run?: string;
  step?: string;
  at?: string;
}

const UI_TESTS = join(ROOT, "..", "procol-ui-tests");
// The args that tell screens reached by the same step apart (open_create erfx vs boq, …).
const KEY_ARGS: Record<string, string[]> = { open_create: ["path"], open_prepared: ["screen"], filter_events: ["tab"], compose_stages: ["stages"], configure_single_stage: ["eventType", "auctionSubtype"] };
const stepKey = (st: { step: string; args?: Record<string, unknown> }) => [st.step, ...(KEY_ARGS[st.step] ?? []).map((k) => JSON.stringify(st.args?.[k] ?? null))].join("|");
/** /project/a1pjY1hk/master_qcs and /project/UVpkY1hk/master_qcs are the same screen. */
const pathShape = (p: string) => decodeURIComponent(p).replace(/\/[A-Za-z0-9%=]{8,}/g, "/*");

interface RunShot { file: string; run: string; before: Set<string>; urlShape: string | null; at: number }

let recordsCache: { at: number; records: ScreenRecord[] } | null = null;
/** Every screen record, read at most every two minutes (the picture matcher asks per screen). */
function listScreenRecords(): ScreenRecord[] {
  if (recordsCache && Date.now() - recordsCache.at < 120_000) return recordsCache.records;
  const records = existsSync(SCREENS_DIR)
    ? readdirSync(SCREENS_DIR)
        .filter((f) => f.endsWith(".json") && f !== "index.json")
        .flatMap((f) => {
          try {
            return [JSON.parse(readFileSync(join(SCREENS_DIR, f), "utf8")) as ScreenRecord];
          } catch {
            return [];
          }
        })
    : [];
  recordsCache = { at: Date.now(), records };
  return records;
}
let shotIndex: { at: number; byKey: Map<string, RunShot[]> } | null = null;

/**
 * Every screenshot this computer's plan runs took after a step that went through
 * (procol-ui-tests/evidence/<run>/NN-<step>.png beside .plans/<run>-result.json), by step.
 */
function runShots(): Map<string, RunShot[]> {
  if (shotIndex && Date.now() - shotIndex.at < 120_000) return shotIndex.byKey;
  const byKey = new Map<string, RunShot[]>();
  const plans = join(UI_TESTS, ".plans");
  const evidence = join(UI_TESTS, "evidence");
  for (const f of existsSync(plans) ? readdirSync(plans) : []) {
    const run = f.match(/^(plan-[\w-]+?)-result\.json$/)?.[1];
    const dir = run && join(evidence, run);
    if (!run || !dir || !existsSync(dir)) continue;
    let steps: Array<{ step: string; args?: Record<string, unknown>; status?: string; evidence?: { url?: string } }>;
    try {
      steps = JSON.parse(readFileSync(join(plans, f), "utf8")).steps ?? [];
    } catch {
      continue;
    }
    for (const pic of readdirSync(dir)) {
      const m = pic.match(/^(\d+)-([a-z_]+)\.png$/);
      const idx = m ? Number(m[1]) - 1 : -1;
      const st = steps[idx];
      if (!m || !st || st.step !== m[2] || st.status !== "ok") continue;
      let urlShape: string | null = null;
      try {
        urlShape = st.evidence?.url ? pathShape(new URL(st.evidence.url).pathname) : null;
      } catch {}
      const shot: RunShot = { file: join(dir, pic), run, before: new Set(steps.slice(0, idx).map(stepKey)), urlShape, at: statSync(join(dir, pic)).mtimeMs };
      const key = stepKey(st);
      byKey.set(key, [...(byKey.get(key) ?? []), shot]);
    }
  }
  shotIndex = { at: Date.now(), byKey };
  return byKey;
}

/**
 * The run screenshot nearest to a screen: taken right after the step the walk reached it by
 * (same step, same key args), on the same page when the run recorded one, from the run whose
 * earlier steps share most of the walk's way there; newest on a tie.
 */
function bestRunShot(r: ScreenRecord): RunShot | null {
  const chain = r.reachedBy ?? [];
  const last = chain[chain.length - 1];
  if (!last) return null;
  const want = pathShape(r.path);
  // Where several screens are reached by the same step (expect_published on an RFQ, a technical
  // round, a traffic-light auction…), what was BUILT tells them apart: the run must have the
  // same open_create / compose_stages / configure_single_stage — "technical only" is not a
  // technical + auction run. A screen alone in being reached by its step (Settings menu,
  // History tab) looks the same on any event.
  const lastKey = stepKey(last);
  const shared = listScreenRecords().filter((x) => x.reachedBy?.length && stepKey(x.reachedBy[x.reachedBy.length - 1]) === lastKey).length > 1;
  const identity = shared ? chain.slice(0, -1).filter((c) => KEY_ARGS[c.step]).map(stepKey) : [];
  let best: RunShot | null = null;
  let bestScore = -1;
  for (const s of runShots().get(stepKey(last)) ?? []) {
    if (s.urlShape && s.urlShape !== want) continue;
    if (!identity.every((k) => s.before.has(k))) continue;
    const score = chain.slice(0, -1).filter((c) => s.before.has(stepKey(c))).length + (s.urlShape ? 2 : 0);
    if (score > bestScore || (score === bestScore && best && s.at > best.at)) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function pictureOf(r: ScreenRecord | null, kind: "plain" | "map"): ScreenPicture | null {
  if (!r) return null;
  const f = kind === "map" ? r.images.map : r.images.plain;
  if (f && existsSync(f)) return { file: f, from: "walk" };
  // A record walked on another computer names that computer's path (/Users/animesh/…); its
  // pictures are git-ignored, so a copy of them dropped into this checkout's data/screens/img
  // is found by name instead.
  const local = join(SCREENS_DIR, "img", `${r.id}${kind === "map" ? "-map" : ""}.png`);
  if (existsSync(local)) return { file: local, from: "walk" };
  // Still none: the nearest screenshot this computer's own runs took of the screen (Aanya,
  // 26 Oct). Plain only — the numbered map's boxes were measured on the walk's picture.
  if (kind === "map") return null;
  const s = bestRunShot(r);
  return s ? { file: s.file, from: "run", run: s.run, step: r.reachedBy[r.reachedBy.length - 1].step, at: new Date(s.at).toISOString() } : null;
}

export const screenPicture = (id: string, kind: "plain" | "map"): ScreenPicture | null => pictureOf(getScreen(id), kind);

/** The served copy of a screen's picture (plain screenshot or the numbered map). */
export function screenImage(id: string, kind: "plain" | "map"): string | null {
  return screenPicture(id, kind)?.file ?? null;
}

function saveRecord(r: ScreenRecord): void {
  mkdirSync(SCREENS_DIR, { recursive: true });
  writeFileSync(join(SCREENS_DIR, `${r.id}.json`), JSON.stringify(r, null, 2));
  writeFileSync(join(SCREENS_DIR, "index.json"), JSON.stringify({ updatedAt: new Date().toISOString(), screens: listScreens() }, null, 2));
}

function copyImage(src: string | null | undefined, id: string, suffix: string): string | null {
  if (!src || !existsSync(src)) return null;
  mkdirSync(IMG_DIR, { recursive: true });
  const dst = join(IMG_DIR, `${id}${suffix}.png`);
  try {
    copyFileSync(src, dst);
    return dst;
  } catch {
    return null;
  }
}

const controlLine = (c: ScreenControl) =>
  `${c.n ?? "?"}. ${c.kind} "${c.name}"${c.disabled ? " (disabled)" : ""}${c.required ? " (required)" : ""}${c.danger ? " (destructive)" : ""}${c.placeholder ? ` placeholder "${c.placeholder}"` : ""}${c.hint ? ` hint "${c.hint.slice(0, 80)}"` : ""}${c.selected ? " (selected)" : ""}${c.checked !== undefined ? (c.checked ? " (on)" : " (off)") : ""}${c.offscreen ? " [below the fold]" : ""}`;

/** Rules whose words name this control — the deterministic grounding, before any model. */
function rulesNaming(control: ScreenControl, rules: ReturnType<typeof rulesForScreen>): typeof rules {
  const n = norm(control.name);
  if (n.length < 4) return [];
  return rules.filter((r) => norm(r.statement).includes(n));
}

/**
 * What each control does to the product — the model writes, code grounds. Controls are sent
 * in batches of 30; a control the model skips becomes "unknown".
 */
export async function describeControls(
  inv: ScreenInventory & { viewport?: { w: number; h: number } },
  rules: ReturnType<typeof rulesForScreen>,
  opts: { onLine?: (l: string) => void } = {},
): Promise<ControlEffect[]> {
  const say = opts.onLine ?? (() => {});
  const controls = (inv.controls as ScreenControl[]).map((c, i) => ({ ...c, n: c.n ?? i + 1 }));
  const ruleIds = new Set(rules.map((r) => r.id));
  const topic = `${inv.label} screen ${inv.headings.slice(0, 5).join(" ")} ${controls.slice(0, 30).map((c) => c.name).join(" ")}`;
  const facts = await retrieve(topic, 10, { kinds: FACT_KINDS }).catch(() => []);
  const out = new Map<number, ControlEffect>();

  const system = [
    "You are a Procol product expert (B2B sourcing: buyers create RFQ/RFP events and auctions, invite vendors, compare bids, award, raise purchase orders).",
    "You are looking at ONE screen of the buyer console. For EVERY numbered control, say what it does to the product.",
    "Rules:",
    "- Answer for controls by their NUMBER. Never add a control that is not in the list.",
    "- \"does\": one plain sentence — what happens when a buyer clicks / fills / toggles it.",
    "- \"affects\": what it changes in the event's data or flow (which stage, which record, which later step it unlocks or blocks). \"nothing\" when it only navigates.",
    "- \"leadsTo\": the screen, drawer, dialog or event state it moves to, or \"stays here\".",
    "- \"check\": one sentence a tester would use to verify it.",
    "- \"rule\": the id of ONE rule from RULES that governs it, or null. Cite only ids from the list.",
    "- \"confidence\": \"code\" when you cite a rule, \"known\" when a PRODUCT FACT supports it, \"guess\" when it is your reading of the label, \"unknown\" when you cannot tell — never invent behaviour.",
    "- Navigation items, sidebar links and a disabled control's reason count too.",
    'Return ONLY a JSON array: [{"n":1,"does":"…","affects":"…","leadsTo":"…","check":"…","rule":"R-… or null","confidence":"code|known|guess|unknown"}, …].',
  ].join("\n");

  for (let i = 0; i < controls.length; i += 30) {
    const batch = controls.slice(i, i + 30);
    const user = [
      `SCREEN: ${inv.label} — ${inv.path}${inv.context && inv.context !== "none" ? ` (event state: ${inv.context})` : ""}`,
      inv.headings.length ? `HEADINGS: ${inv.headings.slice(0, 12).join(" | ")}` : "",
      inv.messages.length ? `MESSAGES ON SCREEN:\n${inv.messages.slice(0, 8).map((m) => `- ${m}`).join("\n")}` : "",
      `CONTROLS:\n${batch.map(controlLine).join("\n")}`,
      `RULES (from Procol's code):\n${rules.slice(0, 40).map((r) => `- ${r.id} ${r.statement.replace(/\s+/g, " ").slice(0, 220)}`).join("\n")}`,
      facts.length ? `PRODUCT FACTS:\n${facts.map((f) => `- ${f.text.replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const raw = await chat([{ role: "system", content: system }, { role: "user", content: user }], { tier: "fast", temperature: 0.1, maxTokens: 4500 }).catch(() => "");
    const rows = parseJsonArray(raw);
    for (const row of rows) {
      const n = Number(row?.n);
      const c = batch.find((x) => x.n === n);
      if (!c || out.has(n)) continue;
      const rule = typeof row.rule === "string" && ruleIds.has(row.rule) ? row.rule : undefined;
      let confidence: ControlEffect["confidence"] = ["code", "known", "guess", "unknown"].includes(row.confidence) ? row.confidence : "guess";
      if (confidence === "code" && !rule) confidence = "guess";
      if (rule && confidence !== "code") confidence = "code";
      out.set(n, { n, control: c.name, kind: c.kind, does: clean(row.does).slice(0, 300) || "unknown", affects: clean(row.affects).slice(0, 300) || "unknown", leadsTo: clean(row.leadsTo).slice(0, 160) || "unknown", check: clean(row.check).slice(0, 300) || "", ...(rule ? { rule } : {}), confidence });
    }
    say(`[screen] ${inv.label}: ${out.size}/${Math.min(controls.length, i + 30)} controls described`);
  }
  // a control the model skipped: the code's own words when a rule names it, else unknown
  for (const c of controls) {
    if (out.has(c.n!)) continue;
    const named = rulesNaming(c, rules);
    out.set(c.n!, named.length
      ? { n: c.n!, control: c.name, kind: c.kind, does: named[0].statement.replace(/\s+/g, " ").slice(0, 300), affects: "see the rule", leadsTo: "unknown", check: `Behaves as ${named[0].id} says.`, rule: named[0].id, confidence: "code" }
      : { n: c.n!, control: c.name, kind: c.kind, does: "unknown", affects: "unknown", leadsTo: "unknown", check: "", confidence: "unknown" });
  }
  return [...out.values()].sort((a, b) => a.n - b.n);
}

/** The memory page for a screen: what the planner recalls when a new case names it. */
export function writeKnowledge(r: ScreenRecord): string {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  const file = join(KNOWLEDGE_DIR, `${r.id}.md`);
  const reach = r.reachedBy.length ? r.reachedBy.map((s) => `${s.step}${s.args && Object.keys(s.args).length ? ` ${JSON.stringify(s.args)}` : ""}`).join(" → ") : "(unknown)";
  const lines = [
    `# Screen: ${r.label} (${r.path})`,
    "",
    `Captured ${r.takenAt.slice(0, 10)} on company ${r.companyId ?? "?"}${r.state && r.state !== "none" ? `, with the event in state "${r.state}"` : ""}. ${r.controls.length} controls, ${r.effects.filter((e) => e.confidence !== "unknown").length} with a known effect, ${r.cases.length} test cases written from it.`,
    "",
    `## How to reach the ${r.label} screen`,
    "",
    `Plan steps: ${reach}. Path: \`${r.path}\`.`,
    r.headings.length ? `Headings on it: ${r.headings.slice(0, 12).join(" | ")}.` : "",
    r.messages.length ? `It shows: ${r.messages.slice(0, 6).join(" · ")}.` : "",
    "",
    `## What each control on ${r.label} does`,
    "",
    ...r.effects
      .filter((e) => e.confidence !== "unknown")
      .map((e) => `- **${e.control}** (${e.kind}${r.controls.find((c) => c.n === e.n)?.disabled ? ", disabled" : ""}): ${e.does} Affects: ${e.affects}. Leads to: ${e.leadsTo}.${e.rule ? ` Rule ${e.rule}.` : ""}${e.check ? ` Check: ${e.check}` : ""}`),
    "",
    r.effects.some((e) => e.confidence === "unknown") ? `Not yet described: ${r.effects.filter((e) => e.confidence === "unknown").map((e) => `"${e.control}"`).slice(0, 30).join(", ")}.` : "",
    "",
    `## Test cases written from the ${r.label} screen`,
    "",
    ...r.cases.map((c) => `- ${c.id}: ${c.title}. Steps: ${c.steps.join(" ")} Expected: ${c.expected}${c.coverage ? ` [plan: ${c.coverage}]` : ""}`),
    "",
  ].filter((l, i, all) => !(l === "" && all[i - 1] === ""));
  writeFileSync(file, lines.join("\n"));
  return file;
}

/**
 * Build (or refresh) a screen's record from a run's inventory: copy its pictures, ground the
 * code rules, describe every control, write test cases, and update the memory page.
 */
export async function recordScreen(
  invFile: string,
  opts: { companyId?: number; reachedBy?: Array<{ step: string; args?: Record<string, unknown> }>; cases?: boolean; effects?: boolean; maxCases?: number; onLine?: (l: string) => void; seen?: Array<{ id: string; title: string }> } = {},
): Promise<ScreenRecord> {
  const say = opts.onLine ?? (() => {});
  const inv = readInventory(invFile);
  const id = slug(inv.label);
  const prev = getScreen(id);
  const controls = (inv.controls as ScreenControl[]).map((c, i) => ({ ...c, n: c.n ?? i + 1 }));
  const rules = rulesForScreen({ ...inv, controls }, 40);
  const r: ScreenRecord = {
    id,
    label: inv.label,
    path: inv.path,
    url: inv.url,
    state: String(inv.context ?? "none"),
    title: String(inv.title ?? ""),
    headings: inv.headings ?? [],
    messages: inv.messages ?? [],
    viewport: inv.viewport,
    controls,
    effects: [],
    rules: rules.map((x) => ({ id: x.id, statement: x.statement.replace(/\s+/g, " ").slice(0, 300), cite: `${x.file ?? ""}${x.lines?.length ? `:${x.lines.join("-")}` : ""}`, verdict: x.verdict })),
    cases: prev?.cases ?? [],
    reachedBy: opts.reachedBy ?? prev?.reachedBy ?? [],
    companyId: opts.companyId ?? prev?.companyId,
    runId: inv.runId ?? null,
    evidence: { screenshot: inv.screenshot ?? null, map: inv.map ?? null, inventory: invFile },
    images: { plain: copyImage(inv.screenshot, id, ""), map: copyImage(inv.map, id, "-map") },
    takenAt: inv.takenAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    captures: (prev?.captures ?? 0) + 1,
  };
  say(`[screen] ${r.label}: ${controls.length} controls, ${rules.length} code rules (${rules.filter((x) => x.verdict === "not covered").length} untested)${r.images.map ? ", map drawn" : ""}`);

  if (opts.effects !== false) {
    r.effects = await describeControls({ ...inv, controls }, rules, { onLine: say }).catch((e) => {
      say(`[screen] ${r.label}: could not describe the controls — ${(e as Error).message}`);
      return prev?.effects ?? [];
    });
    // keep an earlier capture's knowledge where this one learnt nothing new
    for (const e of r.effects) {
      if (e.confidence !== "unknown") continue;
      const old = prev?.effects.find((p) => norm(p.control) === norm(e.control) && p.confidence !== "unknown");
      if (old) Object.assign(e, { ...old, n: e.n });
    }
  } else r.effects = prev?.effects ?? [];
  saveRecord(r);

  if (opts.cases !== false) {
    const res = await draftCasesFromScreen({ ...inv, controls } as ScreenInventory, { max: opts.maxCases ?? 8, companyId: opts.companyId, save: true, compile: true, onLine: say, seen: opts.seen }).catch((e) => {
      say(`[screen] ${r.label}: could not write cases — ${(e as Error).message}`);
      return null;
    });
    for (const s of res?.saved ?? []) {
      if (r.cases.some((c) => c.id === s.id)) continue;
      const steps = (s.steps ?? []).map(String);
      const coverage = s.coverage === "full" || s.coverage === "partial" ? s.coverage : "none";
      r.cases.push({ id: s.id, title: s.title, kind: s.kind, grounded: s.grounded, steps, expected: String(s.expected ?? ""), setup: s.setup, coverage, gaps: s.gaps ?? [], ...(s.plan ? { plan: s.plan } : {}), controls: controls.filter((c) => `${s.title} ${steps.join(" ")}`.toLowerCase().includes(c.name.toLowerCase()) && c.name.length >= 4).map((c) => c.n!).slice(0, 6) });
    }
    if (res) say(`[screen] ${r.label}: ${res.saved.length} case(s) written, ${res.alreadyCovered.length} already in the catalog, ${res.dropped.length} dropped`);
  }
  r.updatedAt = new Date().toISOString();
  saveRecord(r);
  writeKnowledge(r);
  return r;
}

/**
 * A person (or the dashboard) turns "what this control does" into a test case: reach the
 * screen the way the walk did, act on the control, expect what the effect says. Compiled to a
 * plan at once, so it can run with the spotlight on.
 */
export async function caseFromEffect(id: string, n: number, opts: { companyId?: number; onLine?: (l: string) => void } = {}): Promise<{ case: ScreenCase; plan?: unknown; coverage: string; gaps: string[] } | { why: string }> {
  const r = getScreen(id);
  if (!r) return { why: "no such screen" };
  const e = r.effects.find((x) => x.n === n);
  const c = r.controls.find((x) => x.n === n);
  if (!e || !c) return { why: "no such control" };
  const verb = c.kind === "field" ? "Fill" : c.kind === "select" ? "Choose a value in" : c.kind === "switch" || c.kind === "checkbox" ? "Toggle" : "Click";
  const reach = r.reachedBy.length ? r.reachedBy.map((s) => s.step.replace(/_/g, " ")).join(", then ") : `open the ${r.label} screen (${r.path})`;
  const steps = toHouseStyle({ title: "", steps: [r.reachedBy.length ? `Open the ${r.label} screen (${r.path})` : `Open the ${r.label} screen (${r.path})`, `${verb} "${c.name}"`], expected: "" }).steps;
  const expected = `${e.does}${e.leadsTo && !/stays here|unknown/i.test(e.leadsTo) ? ` The screen moves to ${e.leadsTo}.` : ""}${e.affects && !/^(nothing|unknown)$/i.test(e.affects) ? ` ${e.affects}` : ""}`;
  const title = `${verb} "${c.name}" on ${r.label}: ${e.does.replace(/\.$/, "").slice(0, 80)}`;
  const caseText = `${title}. ${steps.join(" ")} Expected: ${expected}`;
  const compiled = await compileTestCase(caseText, "events", { tier: "fast", dryRun: true }).catch(() => null);
  const draft: DraftRecord = {
    id: await nextDraftId("SCR"),
    area: "SCR",
    typed: `screen ${r.label} control ${n} (${c.name})`,
    title,
    why: `Written from the ${r.label} screen's knowledge: control ${n} "${c.name}" ${e.rule ? `(rule ${e.rule})` : `(${e.confidence})`}.`,
    setup: `A buyer signed in to the client under test${r.state && r.state !== "none" ? `, with an event in state "${r.state}"` : ""}.`,
    steps,
    expected,
    oracle: e.check || `The screen behaves as described: ${e.does}`,
    priority: "P1",
    layer: "ui",
    coverage: compiled?.coverage ?? "none",
    gaps: compiled?.gaps ?? [],
    partialOf: [],
    uiPlan: (compiled as { plan?: unknown } | null)?.plan,
    companyId: opts.companyId ?? r.companyId,
  };
  const saved = await saveDraft(draft);
  const sc: ScreenCase = { id: saved.id, title, grounded: e.rule ?? "screen", steps, expected, setup: draft.setup, coverage: draft.coverage, gaps: draft.gaps, controls: [n], fromEffect: n, ...(draft.uiPlan ? { plan: draft.uiPlan } : {}) };
  r.cases.push(sc);
  r.updatedAt = new Date().toISOString();
  saveRecord(r);
  writeKnowledge(r);
  opts.onLine?.(`[screen] ${r.label}: case ${sc.id} written from control ${n} "${c.name}" — plan ${draft.coverage}`);
  return { case: sc, plan: draft.uiPlan, coverage: draft.coverage, gaps: draft.gaps };
}

/**
 * A person types something to test on THIS screen. The case is compiled with the walk's own
 * route to the screen in front of it, so the plan goes to the right page before it tests —
 * then it is saved as a draft and can run with the spotlight on.
 */
export async function newCaseOnScreen(id: string, text: string, opts: { companyId?: number; onLine?: (l: string) => void } = {}): Promise<{ case: ScreenCase; plan?: unknown; coverage: string; gaps: string[]; reasoning?: string } | { why: string }> {
  const r = getScreen(id);
  if (!r) return { why: "no such screen" };
  const typed = clean(text).slice(0, 1200);
  if (typed.length < 8) return { why: "say what to test, in a sentence or two" };
  const reach = r.reachedBy.length ? `Reach the ${r.label} screen the way the walk did: ${r.reachedBy.map((s) => s.step.replace(/_/g, " ")).join(", then ")}.` : `Open the ${r.label} screen (${r.path}).`;
  const caseText = `${typed} Setup: ${reach}${r.state && r.state !== "none" ? ` The event is in state "${r.state}".` : ""}`;
  const compiled = await compileTestCase(caseText, "events", { tier: "reason" }).catch((e) => ({ why: (e as Error).message }));
  if ("why" in compiled) return { why: `could not compile: ${compiled.why}` };
  const title = typed.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, "").slice(0, 120);
  const draft: DraftRecord = {
    id: await nextDraftId("SCR"),
    area: "SCR",
    typed: `screen ${r.label}: ${typed.slice(0, 200)}`,
    title,
    why: `Typed on the ${r.label} screen's page of the screen library.`,
    setup: reach,
    steps: await (async () => {
      const { stepWords, expectedWords } = await import("./journeyCases.js");
      const words = compiled.plan.steps.map((st) => (/^expect_|^attempt$/.test(st.step) ? `Check: ${expectedWords(st)}` : stepWords(st)));
      return toHouseStyle({ title, steps: words, expected: typed }).steps;
    })(),
    expected: typed,
    oracle: compiled.reasoning?.slice(0, 300) || `What the ${r.label} screen shows.`,
    priority: "P1",
    layer: "ui",
    coverage: compiled.coverage,
    gaps: compiled.gaps ?? [],
    partialOf: [],
    uiPlan: compiled.plan,
    companyId: opts.companyId ?? r.companyId,
  };
  const saved = await saveDraft(draft);
  const sc: ScreenCase = { id: saved.id, title, grounded: "screen", steps: draft.steps, expected: typed, setup: reach, coverage: compiled.coverage, gaps: compiled.gaps ?? [], plan: compiled.plan, controls: r.controls.filter((c) => c.name.length >= 4 && typed.toLowerCase().includes(c.name.toLowerCase())).map((c) => c.n!).slice(0, 6) };
  r.cases.unshift(sc);
  r.updatedAt = new Date().toISOString();
  saveRecord(r);
  writeKnowledge(r);
  opts.onLine?.(`[screen] ${r.label}: case ${sc.id} written from "${typed.slice(0, 80)}" — plan ${compiled.coverage}`);
  return { case: sc, plan: compiled.plan, coverage: compiled.coverage, gaps: compiled.gaps ?? [], reasoning: compiled.reasoning };
}

export interface ScreenPrep {
  /** the event state the API builds before the run ("none" = the plan starts from nothing) */
  state: "none" | "draft" | "upcoming" | "live" | "bid" | "closed" | "proposal" | "awarded";
  /** a SCREENS key (procol-ui-tests/src/plan/screens.ts) the plan opens first, or "create" */
  screen: string;
  screenWhat: string;
  technical: boolean;
  /** true when the plan must start with open_prepared on the built event */
  prepared: boolean;
  why: string;
}

const WHAT: Record<string, string> = {
  events_list: "the events list",
  drafts_list: "the Drafts tab of the events list",
  history_list: "the History tab of the events list",
  create: "a new event's create screen",
  summary: "the event's summary page",
  responses: "the pricing round's Responses (comparison) tab",
  overview: "the pricing round's Overview tab",
  participants: "the pricing round's Participants tab",
  master_qcs: "Master QCS",
  analytics: "the pricing round's Analytics tab",
  proposal: "the award proposal page",
};

/** The API values a prepared state exposes to expect_api_value (uiSetup.ts). */
export const VALUE_KEYS: Record<string, string[]> = { none: [], draft: ["title", "quantity", "unit"], upcoming: ["title", "quantity", "unit", "vendorName"], live: ["title", "quantity", "unit", "vendorName"], bid: ["title", "vendorName", "quantity", "unit", "bidPrice", "bidTotal"] };
VALUE_KEYS.closed = VALUE_KEYS.bid;
VALUE_KEYS.awarded = VALUE_KEYS.bid;
VALUE_KEYS.proposal = VALUE_KEYS.bid;

/**
 * Which event the cases of a screen must run on. A screen photographed on a published event
 * (a project page, Master QCS, the proposal) is never tested on that stale event or on one
 * found by searching the list: the API builds an event in the state the screen needs — with
 * bids in for anything about comparing or awarding — and the plan opens it by its route.
 */
export function screenPrep(r: ScreenRecord): ScreenPrep {
  const path = `${r.path}${r.url.includes("?") ? r.url.slice(r.url.indexOf("?")) : ""}`;
  const label = r.label.toLowerCase();
  const technical = /technical|rfp|questionnaire|evaluat/.test(label) && !/single-stage/.test(label);
  const mk = (state: ScreenPrep["state"], screen: string, why: string, prepared = true): ScreenPrep => ({ state, screen, screenWhat: WHAT[screen] ?? screen, technical, prepared, why });
  if (/quick-create|\/orders\/create/.test(path)) return mk("none", "create", "a create screen: the plan starts from nothing", false);
  if (/^\/orders\/?(\?|$)/.test(path)) {
    if (/tab=draft|draft/.test(path + label)) return mk("draft", "drafts_list", "the Drafts tab: the API saves a draft first");
    if (/tab=history|history/.test(path + label)) return mk("closed", "history_list", "the History tab: the API builds a closed event first");
    return mk("none", "events_list", "the events list: the plan starts from the list", false);
  }
  if (/\/proposal\//.test(path) || /proposal/.test(label)) return mk("proposal", /summary|details/.test(label) ? "summary" : "proposal", "the award proposal: the API builds an event with bids and a proposal");
  const known = r.state && r.state !== "none" ? (r.state as ScreenPrep["state"]) : undefined;
  const onQcs = /\/master_qcs|\/awarding\//.test(path);
  const needsBids = onQcs || /qcs|bid|award|respons|analytic|counter|compare|allocat/.test(label);
  const state: ScreenPrep["state"] = known && !(known === "live" && onQcs) ? known : needsBids ? "bid" : "live";
  // the label names the tab when the URL does not (a tab clicked on the stage page keeps the stage's URL)
  const screen = onQcs ? "master_qcs" : /tab=audience/.test(path) || /particip/.test(label) ? "participants" : /tab=analytics/.test(path) || /analytic/.test(label) ? "analytics" : /tab=compare/.test(path) || /respons|counter|bid-placed/.test(label) ? "responses" : /tab=order_info/.test(path) || /overview/.test(label) ? "overview" : /\/details/.test(path) || /project-|summary|-live$/.test(label) ? "summary" : needsBids ? "responses" : "summary";
  return mk(state, screen, `${r.label}: the API builds a ${state} event${state === "bid" || state === "closed" ? " with a vendor's bid in" : ""} and the plan opens ${WHAT[screen] ?? screen} on it`);
}

/**
 * The browser plan behind a screen case: the one stored with it (compiled for the same state and
 * screen), else compiled now from the case's own words against the state its screen needs, and
 * kept for next time.
 */
export async function planForScreenCase(caseId: string, screenId?: string, onLine?: (l: string) => void, opts: { recompile?: boolean } = {}): Promise<{ plan?: { title?: string; steps?: unknown[] }; coverage?: string; gaps?: string[]; why?: string; compiledNow?: boolean; prep?: ScreenPrep; reasoning?: string }> {
  const screens = screenId ? [getScreen(screenId)].filter((x): x is ScreenRecord => !!x) : listScreens().map((x) => getScreen(x.id)).filter((x): x is ScreenRecord => !!x);
  for (const r of screens) {
    const c = r.cases.find((x) => x.id === caseId);
    if (!c) continue;
    const prep = screenPrep(r);
    const stored = c.plan as { steps?: Array<{ step?: string }> } | undefined;
    const sameState = c.prep && c.prep.state === prep.state && c.prep.screen === prep.screen;
    const startsRight = !prep.prepared || stored?.steps?.[0]?.step === "open_prepared";
    if (!opts.recompile && stored?.steps?.length && sameState && startsRight) return { plan: stored as { title?: string; steps?: unknown[] }, coverage: c.coverage, gaps: c.gaps, prep };
    const reach = prep.prepared
      ? ""
      : r.reachedBy.length
        ? ` Reach the ${r.label} screen the way the walk did: ${r.reachedBy.map((s) => s.step.replace(/_/g, " ")).join(", then ")}.`
        : ` Open the ${r.label} screen (${r.path}).`;
    const text = `${c.title}. ${c.setup ? `Setup: ${c.setup}` : ""}${reach} Steps: ${c.steps.join(" ")} Expected: ${c.expected}`;
    onLine?.(`[screen] compiling ${caseId} for ${prep.prepared ? `a ${prep.state} event, opening ${prep.screenWhat}` : prep.screenWhat}…`);
    const compiled = await compileTestCase(text, "events", {
      tier: "reason",
      ...(prep.prepared ? { prepared: { state: prep.state, screen: prep.screen, screenWhat: prep.screenWhat, valueKeys: VALUE_KEYS[prep.state] ?? [], technical: prep.technical } } : {}),
    }).catch((e) => ({ why: (e as Error).message }));
    if ("why" in compiled) return { why: `could not compile ${caseId}: ${compiled.why}`, prep };
    c.prep = { state: prep.state, screen: prep.screen, technical: prep.technical, prepared: prep.prepared };
    c.coverage = compiled.coverage;
    c.gaps = compiled.gaps ?? [];
    c.plan = compiled.plan?.steps?.length && compiled.coverage !== "none" ? compiled.plan : undefined;
    saveRecord(r);
    if (!c.plan) return { why: `${caseId} cannot be expressed in browser steps yet${compiled.gaps?.[0] ? `: ${compiled.gaps[0]}` : ""}`, prep, coverage: compiled.coverage, gaps: compiled.gaps };
    return { plan: compiled.plan, coverage: compiled.coverage, gaps: compiled.gaps, compiledNow: true, prep, reasoning: compiled.reasoning };
  }
  return { why: `no screen holds the case ${caseId}` };
}
