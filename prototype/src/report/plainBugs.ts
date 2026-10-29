import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DefectGroup } from "../agents/oracle.js";
import { chat } from "../ai/llm.js";
import { displayResult, type ResultRow } from "../checks/caseDisplay.js";
import { redactSecrets } from "../checks/engine.js";
import { getRun, listRuns } from "../runStore.js";
import { loadAllUiResults } from "./uiReport.js";
import { humanText, type WithHuman } from "./shared.js";

/**
 * A BUG, WRITTEN SO ANYONE CAN ACT ON IT.
 *
 * A bug row used to be its evidence: "PATCH /event_groups/WGtaY1hn returns
 * HTTP 500". True, and readable only by whoever wrote the endpoint. The team
 * asked for the opposite (Aanya, 2026-10-08): in plain words, so a developer
 * who never touched the feature can fix it and someone non-technical can tell
 * what is wrong, with the artifacts — screenshots, the exact request — attached.
 *
 * Each bug gets a plain write-up: a title, what goes wrong and why it matters,
 * where in Procol, how to see it, expected against actual, and the different
 * ways the runs hit it. The words are written by the model from that bug's
 * recorded facts only (what was sent, what came back, the test case's own
 * steps and expectation, how often), and the facts themselves travel with it
 * untouched as artifacts, so the prose can never change the evidence. Until a
 * write-up exists, or when no model answers, a template writes it instead.
 *
 * Kept in data/plain-bugs.json, keyed by the bug's fingerprint plus a hash of
 * its facts: a bug whose evidence changes is written again; an unchanged one
 * never costs a second call. Written in the background, one at a time.
 */

export interface PlainWay {
  /** what was different this time, in plain words */
  what: string;
  /** what the app did */
  result: string;
}

export interface PlainArtifact {
  kind: "screenshot" | "video" | "replay" | "session" | "report" | "request" | "reply";
  label: string;
  href?: string;
  text?: string;
}

export interface PlainBug {
  title: string;
  summary: string;
  where: string;
  steps: string[];
  expected: string;
  actual: string;
  ways: PlainWay[];
  artifacts: PlainArtifact[];
  /** The technical detail, kept apart from the plain words. */
  forDevs: { endpoint?: string; notes: string[] };
  /** "spine.ai" when the model wrote it from the evidence; "template" otherwise. */
  writtenBy: "spine.ai" | "template";
}

// ── what a call DOES, in the product's words ────────────────────────────────
const ACTIONS: Array<[RegExp, string, string]> = [
  // [METHOD path, "Creating an event", "create an event"]
  [/^POST \/event_groups$/, "Creating an event", "create an event"],
  [/^PATCH \/event_groups\/[^/]+$/, "Saving or publishing an event", "save or publish the event"],
  [/^GET \/event_groups\/[^/]+\/get_line_items/, "Opening an event's line items", "open the event's line items"],
  [/^(GET \/event_groups(\/(history|draft|live|closed|upcoming))?)$/, "Loading the list of events", "open the list of events"],
  [/^GET \/event_groups\/[^/]+$/, "Opening an event", "open the event"],
  [/^POST \/trade\/template_input/, "Adding a round to an event", "add a round (stage) to the event"],
  [/^GET \/v1\/trade\/[^/]+\/get_approvals/, "Loading an event's approvals", "open the event's approvals"],
  [/^GET \/v1\/trade\/[^/]+\/quote_details/, "Opening a vendor's quote", "open a vendor's quote on the event"],
  [/^PATCH \/v1\/trade\/add_audience/, "Inviting vendors to an event", "invite vendors to the event"],
  [/\/(save_draft_lots|reset_to_smart_lots)/, "Saving an event's lots", "save the event's lots"],
  [/\/get_lots/, "Opening an event's lots", "open the event's lots"],
  [/^GET \/reports\/download_bulk_report/, "Downloading an event report", "download an event report"],
  [/^PATCH \/trade\/[^/]+$/, "Changing a round of an event (such as its deadline)", "change a round of the event"],
  [/^GET \/(v1\/)?trade\/[^/?]+/, "Opening a round of an event", "open a round of the event"],
];

/** "PATCH /event_groups/WGtaY1hn returns HTTP 500" → the call, the status, and what it does. */
function callOf(title: string): { method?: string; path?: string; status?: number; action?: string; verb?: string } {
  const m = title.match(/^(GET|POST|PATCH|PUT|DELETE)\s+(\S+)/);
  if (!m) return {};
  const path = m[2].split("?")[0];
  const status = Number(title.match(/HTTP (\d{3})/)?.[1]) || undefined;
  const key = `${m[1]} ${path}`;
  const hit = ACTIONS.find(([re]) => re.test(key));
  return { method: m[1], path, status, action: hit?.[1], verb: hit?.[2] };
}

// ── the facts a write-up may use ────────────────────────────────────────────
interface CaseFacts {
  id: string;
  caseTitle: string;
  area?: string;
  setup?: string;
  steps: string[];
  expected?: string;
  actual?: string;
  sent?: string;
  got?: string;
  devNote?: string;
}

interface Facts {
  kind: DefectGroup["kind"];
  severity: DefectGroup["severity"];
  recordedTitle: string;
  action?: string;
  verb?: string;
  endpoint?: string;
  status?: number;
  timesSeen: number;
  runs: number;
  firstSeen?: string;
  lastSeen?: string;
  client?: string;
  rationale: string;
  cases: CaseFacts[];
  uiEvidence: string[];
  reproduction: string[];
}

/** Every case's latest check, by case id, from the kept API runs. */
let checkIndex: { sig: string; byId: Map<string, any>; runCompany: Map<string, string> } | null = null;
let checkedAt = 0;
/**
 * LOOKED_AT_MOST every 2 s: withPlain asks once per bug (210 of them), and listRuns(500) reads 500
 * run records (≈60 ms) — so one /api/findings spent ≈13 s here with the whole server blocked: the
 * Sessions list, "Opening the session…" and a live run's frames all waited (Aanya, 27 Oct: "too slow").
 */
function checks(): { byId: Map<string, any>; runCompany: Map<string, string> } {
  if (checkIndex && Date.now() - checkedAt < 2_000) return checkIndex;
  const runs = listRuns(500);
  checkedAt = Date.now();
  const sig = `${runs.length}:${runs[0]?.id ?? ""}`;
  if (checkIndex?.sig === sig) return checkIndex;
  const byId = new Map<string, any>();
  const runCompany = new Map<string, string>();
  // Oldest first, so the newest run's copy of a case wins.
  for (const r of [...runs].reverse()) {
    if (r.companyName) runCompany.set(r.id, r.companyName);
    const rec = getRun(r.id);
    for (const c of rec?.checkResults ?? []) byId.set(c.id, c);
  }
  checkIndex = { sig, byId, runCompany };
  return checkIndex;
}

const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const safe = (s: unknown, n: number) => clip(redactSecrets(String(s ?? "")) ?? "", n);

function caseFacts(c: any): CaseFacts {
  let d: ReturnType<typeof displayResult> | null = null;
  try {
    d = displayResult(c as ResultRow);
  } catch {
    d = null;
  }
  const req = c.request ?? {};
  const body = req.body === undefined || req.body === null ? "" : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const query = String(req.path ?? "").includes("?") ? String(req.path).split("?")[1] : "";
  return {
    id: c.id,
    caseTitle: safe(c.scenario, 160),
    area: d?.area ? humanText(d.area) : undefined,
    setup: d?.preconditions ? safe(humanText(d.preconditions), 220) : undefined,
    steps: (d?.steps ?? []).map((s) => safe(humanText(s), 200)).slice(0, 4),
    expected: d?.expected ? safe(humanText(d.expected), 220) : undefined,
    actual: d?.actual ? safe(humanText(d.actual), 220) : undefined,
    sent: safe([query && `query: ${decodeURIComponent(query)}`, body && `body: ${body}`].filter(Boolean).join(" · "), 420),
    got: safe(`HTTP ${c.httpStatus ?? "error"}${c.message ? ` — ${c.message}` : ""}`, 200),
    // The case writer's own note on the likely cause, often with the code line.
    devNote: c.expectedResult && /\.rb|Today:|controller|service/i.test(c.expectedResult) ? safe(c.expectedResult, 420) : undefined,
  };
}

function factsOf(g: DefectGroup): Facts {
  const { byId, runCompany } = checks();
  const human = (g as WithHuman<DefectGroup>).human;
  const ids = [...new Set([...(human?.caseIds ?? []), ...g.evidence.map((e) => e.split(" · ")[0]).filter((x) => /^[A-Z]+[-·]/.test(x))])];
  const cases = ids.map((id) => byId.get(id)).filter(Boolean).slice(0, 12).map(caseFacts);
  const call = callOf(g.title);
  const client = g.runs.map((r) => runCompany.get(r)).find(Boolean);
  return {
    kind: g.kind,
    severity: g.severity,
    recordedTitle: safe(g.title, 200),
    action: call.action,
    verb: call.verb,
    endpoint: call.method ? `${call.method} ${call.path}` : undefined,
    status: call.status,
    timesSeen: g.occurrences,
    runs: g.runs.length,
    firstSeen: g.firstSeen || undefined,
    lastSeen: g.lastSeen || undefined,
    client,
    rationale: safe(g.rationale, 500),
    cases,
    uiEvidence: cases.length ? [] : g.evidence.slice(0, 6).map((e) => safe(e, 240)),
    reproduction: g.reproduction.slice(0, 14).map((r) => safe(r, 300)),
  };
}

// ── artifacts: the evidence itself, never rewritten ─────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
/** Where a planned browser run keeps a screenshot per step (procol-ui-tests/evidence/<run>/NN-step.png). */
const PLAN_EVIDENCE = join(here, "..", "..", "..", "procol-ui-tests", "evidence");

/** A planned run's step screenshot on disk, or undefined — only ever inside that run's own folder. */
export function planShotPath(run: string, file: string): string | undefined {
  if (!/^plan-[a-z0-9]+$/i.test(run) || !/^\d{2}-[\w-]+\.png$/.test(file)) return undefined;
  const full = join(PLAN_EVIDENCE, run, file);
  return full.startsWith(join(PLAN_EVIDENCE, run)) && existsSync(full) ? full : undefined;
}

/** A plan run's video (made when it failed, runVideo.ts) or its Playwright trace: only those two names, in its own folder. */
export function planMediaPath(run: string, file: string): string | undefined {
  if (!/^plan-[a-z0-9]+$/i.test(run) || !/^(video\.webm|trace\.zip)$/.test(file)) return undefined;
  const full = join(PLAN_EVIDENCE, run, file);
  return existsSync(full) ? full : undefined;
}

/** "06-add_line_items.png" → "step 6, add line items" */
const stepOfShot = (f: string) => {
  const m = f.match(/^(\d{2})-(.+)\.png$/);
  return m ? `step ${Number(m[1])}, ${m[2].replace(/[_-]+/g, " ")}` : f;
};
/** Every browser run's result, read once per 2 s rather than once per bug (see checks()). */
let uiKept: ReturnType<typeof loadAllUiResults> = [];
let uiAt = 0;
function uiResults(): ReturnType<typeof loadAllUiResults> {
  if (!uiAt || Date.now() - uiAt >= 2_000) {
    uiKept = loadAllUiResults();
    uiAt = Date.now();
  }
  return uiKept;
}
function artifactsOf(g: DefectGroup): PlainArtifact[] {
  const out: PlainArtifact[] = [];
  const curl = g.reproduction.findIndex((r) => /^curl\b/.test(r));
  if (curl >= 0) {
    out.push({
      kind: "request",
      label: "The exact request (run it to see the problem)",
      text: redactSecrets(g.reproduction.slice(curl).join("\n")) ?? "",
    });
  }
  const reply = g.evidence.find((e) => /→ HTTP \d{3}/.test(e));
  if (reply) out.push({ kind: "reply", label: "What the server answered", text: safe(reply.split("→").pop(), 300) });

  // Screenshots from the browser runs that hit it, newest first.
  const runs = new Set(g.runs);
  const shots = uiResults()
    .filter((r) => runs.has(r.runId) && r.screenshot)
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
    .slice(0, 3);
  for (const r of shots) {
    out.push({
      kind: "screenshot",
      label: `The screen when it ${r.status === "broke" ? "stopped" : "finished"} (${(r.startedAt ?? "").slice(0, 10)})`,
      href: `/api/ui-shot?f=${encodeURIComponent(String(r.screenshot))}`,
    });
  }
  // A planned run: the last two steps it took a picture of, which is where it went wrong.
  for (const id of g.runs.filter((r) => /^plan-/.test(r)).slice(0, 2)) {
    let files: string[] = [];
    try {
      files = readdirSync(join(PLAN_EVIDENCE, id)).filter((f) => /^\d{2}-[\w-]+\.png$/.test(f)).sort();
    } catch {
      files = [];
    }
    for (const f of files.slice(-2).reverse()) {
      out.push({ kind: "screenshot", label: `The screen at ${stepOfShot(f)} (run ${id})`, href: `/api/plan-shot?run=${encodeURIComponent(id)}&f=${encodeURIComponent(f)}` });
    }
    // How it happened (Aanya, 29 Oct: "the images or the video links of where and how the bug occurred"):
    // the run's video, and its step-by-step Playwright replay, when the run kept them.
    if (planMediaPath(id, "video.webm")) out.push({ kind: "video", label: `Video of the run (${id})`, href: `/api/plan-media?run=${encodeURIComponent(id)}&f=video.webm` });
    if (planMediaPath(id, "trace.zip")) out.push({ kind: "replay", label: `Step-by-step replay, a Playwright trace (${id})`, href: `/api/plan-media?run=${encodeURIComponent(id)}&f=trace.zip` });
  }
  for (const id of g.runs.slice(0, 3)) {
    const ui = /^ui-|^plan-/.test(id);
    out.push({ kind: "session", label: `The run that found it (${id})`, href: `#/session/${encodeURIComponent(id)}` });
    out.push({
      kind: "report",
      label: ui ? "That run's browser report" : "That run's test report",
      href: ui ? `/api/ui-report?run=${encodeURIComponent(id)}` : `/api/test-report?run=${encodeURIComponent(id)}`,
    });
  }
  return out;
}

// ── the template, for when no model answers ─────────────────────────────────
const firstSentence = (s?: string) => (s ? s.split(/(?<=[.!?])\s/)[0] : "");

function templatePlain(f: Facts, g: DefectGroup): Omit<PlainBug, "artifacts" | "forDevs" | "writtenBy"> {
  const curated = (g as DefectGroup & { curated?: { description?: string; detail?: string } }).curated;
  const human = (g as WithHuman<DefectGroup>).human;
  const telling = (c: CaseFacts) =>
    c.steps.find((st) => /\b(with|set to|as an?|containing|sent|value|missing|empty|unknown|wrong|negative|blank)\b/i.test(st) && !/^(then )?read\b/i.test(st)) ||
    c.caseTitle;
  const ways = f.cases.map((c) => ({ what: telling(c), result: c.got ?? "" }));
  const area = f.cases[0]?.area || human?.where || "Procol";
  if (curated) {
    return {
      title: humanText(g.title),
      summary: clip(curated.description || g.rationale, 400),
      where: area,
      steps: human?.steps ?? [],
      expected: human?.expected ?? "",
      actual: human?.actual ?? clip(curated.detail, 300),
      ways: [],
    };
  }
  if (f.status && f.status >= 500 && f.action) {
    return {
      title: `${f.action} fails with a server error${f.cases.length > 1 ? " when some details are in the wrong format" : ""}`,
      summary:
        `When someone tries to ${f.verb} and ${f.cases.length > 1 ? "some of the details are in the wrong format" : "the details are like the example below"}, ` +
        `the server stops with "Internal Server Error" instead of saying what is wrong. Nothing is saved, and whoever sent it gets no hint how to fix it.`,
      where: area,
      steps: [
        `Sign in to Procol as a buyer${f.client ? ` on ${f.client}` : ""}.`,
        ...(f.cases[0]?.setup ? [`Start from: ${clip(f.cases[0].setup, 160)}`] : []),
        `Try to ${f.verb}: ${ways[0]?.what ?? "with the details shown below"}.`,
        "The server answers with error 500 (Internal Server Error).",
      ],
      expected: "The server refuses it with a clear message saying what is wrong (an error such as 422), and nothing breaks.",
      actual: `The server crashes with error ${f.status} and gives no explanation.`,
      ways,
    };
  }
  if (/accepts input it should reject/.test(g.title) && f.action) {
    return {
      title: `${f.action} accepts details it should refuse`,
      summary:
        `When someone tries to ${f.verb} with details that should be refused, the server saves them anyway. ` +
        `Wrong data then sits in the event, and anything calling Procol directly — integrations, uploads — can put it there.`,
      where: area,
      steps: [
        `Sign in to Procol as a buyer${f.client ? ` on ${f.client}` : ""}.`,
        `Try to ${f.verb}: ${ways[0]?.what ?? "with the details shown below"}.`,
        "The server accepts it and saves it.",
      ],
      expected: "The server refuses it with a clear message, and nothing is saved.",
      actual: "The server accepts it and saves the wrong data.",
      ways,
    };
  }
  return {
    title: humanText(human?.title || g.title),
    summary: clip(human?.what || firstSentence(g.rationale) || g.rationale, 400),
    where: area,
    steps: human?.steps?.length ? human.steps : g.reproduction.filter((r) => !/^curl|^\s/.test(r)).map((r) => r.replace(/^\[[a-z-]+\]\s*/i, "")).slice(0, 6),
    expected: human?.expected ?? "",
    actual: human?.actual ?? "",
    ways,
  };
}

// ── the model's write-up ────────────────────────────────────────────────────
const SYSTEM = `You write bug reports for Procol, a procurement product used by buyers (who run sourcing events: RFQs, RFPs, auctions) and vendors (who bid).
Write each report so that anyone can act on it: a developer who has never worked on this feature, a tester, a product manager, or someone non-technical.

Rules:
- Plain words. Describe what a person does and sees, and why it matters to them or the business. Not code, not test jargon.
- Use ONLY the facts given. Do not invent screens, buttons, fields, causes or numbers. If a fact is missing, leave it out.
- A technical name (an endpoint, a field key like "line_items") only when the facts give no plainer word, and then in quotes once.
- "kind" automation_defect or environment means the problem is in spine.ai's test automation or the test environment, NOT in Procol: say so plainly in the summary.
- An HTTP status of 500 or more is a crash ("server error"); 200 means the server accepted it.
- No HTTP methods or endpoint paths (PATCH, POST, /event_groups …) in the title, summary, steps, expected or actual: the exact request is attached to the report separately. Write the step as the action ("Save the event with its line items sent as plain text"); where only the request can do it, say "using the attached request".
- If the app showed a message asking for something that was missing (for example "Please add …"), the app may be right and the test may have left it out: say that plainly in the summary rather than calling it a crash.

Answer with JSON only, no prose around it:
{"title": "...", "summary": "...", "where": "...", "steps": ["..."], "expected": "...", "actual": "...", "ways": [{"what": "...", "result": "..."}]}
- title: at most 90 characters, a sentence a non-technical reader understands, naming the problem (not the test). Example: "Saving an event with an empty line item crashes the server".
- summary: 2 or 3 short sentences: what goes wrong, and what it means for the user or the business.
- where: the part of Procol, in its own words (e.g. "Sourcing events › creating an event").
- steps: 3 to 6 steps someone can follow to see it happen, in plain words; the last step says what they will see. No numbering in the strings.
- expected: one sentence. actual: one sentence.
- ways: one entry per test case given (at most 10): what was different that time, and what the app did. Empty for a single case.`;

function promptFor(f: Facts): string {
  return `Facts about this bug (JSON):\n${JSON.stringify(f, null, 0)}`;
}

/**
 * Numbers the write-up uses that the facts do not have ("more than 50" for a
 * run that added 67). A rounded figure ("about 30 seconds" for 27.6 s) is fine;
 * anything further than 10% from every number in the facts is invented.
 */
function inventedNumbers(plain: Omit<PlainBug, "artifacts" | "forDevs" | "writtenBy">, facts: Facts): string[] {
  const known = (JSON.stringify(facts).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const text = [plain.title, plain.summary, plain.expected, plain.actual, ...plain.steps, ...plain.ways.map((w) => `${w.what} ${w.result}`)].join(" ");
  const used = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  return [...new Set(used.filter((n) => !known.some((k) => Math.abs(n - k) <= Math.max(1, k * 0.1))).map(String))];
}

function parsePlain(raw: string): Omit<PlainBug, "artifacts" | "forDevs" | "writtenBy"> | null {
  if (!raw) return null;
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let o: any;
  try {
    o = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const str = (v: unknown, n: number) => clip(typeof v === "string" ? v : "", n);
  const title = str(o.title, 110);
  const summary = str(o.summary, 600);
  const steps = Array.isArray(o.steps) ? o.steps.map((s: unknown) => str(s, 260)).filter(Boolean).slice(0, 8) : [];
  if (!title || !summary || steps.length < 2) return null;
  return {
    title,
    summary,
    where: str(o.where, 160),
    steps,
    expected: str(o.expected, 300),
    actual: str(o.actual, 300),
    ways: Array.isArray(o.ways)
      ? o.ways.map((w: any) => ({ what: str(w?.what, 220), result: str(w?.result, 160) })).filter((w: PlainWay) => w.what).slice(0, 10)
      : [],
  };
}

// ── the store and the writer ────────────────────────────────────────────────
const STORE = join(here, "..", "..", "data", "plain-bugs.json");
type Stored = { sig: string; at: string; plain: Omit<PlainBug, "artifacts" | "forDevs" | "writtenBy"> };
let store: Record<string, Stored> | null = null;

function loadStore(): Record<string, Stored> {
  if (store) return store;
  try {
    store = existsSync(STORE) ? (JSON.parse(readFileSync(STORE, "utf8")) as Record<string, Stored>) : {};
  } catch {
    store = {};
  }
  return store;
}
function saveStore(): void {
  try {
    mkdirSync(dirname(STORE), { recursive: true });
    writeFileSync(STORE, JSON.stringify(store ?? {}, null, 1));
  } catch {
    /* a write-up that cannot be kept is written again next time */
  }
}

const sigOf = (f: Facts) =>
  createHash("sha1")
    .update(JSON.stringify({ t: f.recordedTitle, k: f.kind, c: f.cases.map((c) => [c.id, c.got]), u: f.uiEvidence, r: f.reproduction.slice(0, 4) }))
    .digest("hex")
    .slice(0, 16);

const queue: Array<{ fp: string; facts: Facts; tries?: number; note?: string }> = [];
const queued = new Set<string>();
let writing = false;
let failures = 0;
let pausedUntil = 0;

async function pump(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (queue.length && Date.now() >= pausedUntil) {
      const job = queue.shift()!;
      queued.delete(job.fp);
      let raw = "";
      try {
        raw = await chat(
          [
            { role: "system", content: SYSTEM },
            { role: "user", content: promptFor(job.facts) + (job.note ? `\n\n${job.note}` : "") },
          ],
          { tier: "fast", temperature: 0.2, maxTokens: 900 },
        );
      } catch {
        raw = "";
      }
      const parsed = parsePlain(raw);
      const invented = parsed ? inventedNumbers(parsed, job.facts) : [];
      const plain = parsed && !invented.length ? parsed : null;
      if (parsed && invented.length && (job.tries ?? 0) < 1) {
        // Once more, told which numbers it made up; the template stands if it does again.
        queue.push({ ...job, tries: 1, note: `Your last answer used numbers that are not in the facts (${invented.join(", ")}). Use only numbers that appear in the facts.` });
        queued.add(job.fp);
        continue;
      }
      if (!plain) {
        // One more go at the end of the queue; the template stands until then.
        if ((job.tries ?? 0) < 1) {
          queue.push({ ...job, tries: (job.tries ?? 0) + 1 });
          queued.add(job.fp);
        }
        // Three misses in a row: the model is down; try again in ten minutes.
        if (++failures >= 3) {
          pausedUntil = Date.now() + 10 * 60_000;
          failures = 0;
        }
        continue;
      }
      failures = 0;
      loadStore()[job.fp] = { sig: sigOf(job.facts), at: new Date().toISOString(), plain };
      saveStore();
    }
  } finally {
    writing = false;
  }
}

/**
 * Each bug with its plain write-up: the model's when it has written one for
 * these exact facts, the template's otherwise — and any that are missing or
 * out of date are queued to be written in the background.
 */
export function withPlain<T extends DefectGroup>(groups: T[]): Array<T & { plain: PlainBug }> {
  const s = loadStore();
  let added = false;
  const out = groups.map((g) => {
    let facts: Facts;
    try {
      facts = factsOf(g);
    } catch {
      facts = { kind: g.kind, severity: g.severity, recordedTitle: g.title, timesSeen: g.occurrences, runs: g.runs.length, rationale: g.rationale, cases: [], uiEvidence: g.evidence.slice(0, 6), reproduction: g.reproduction.slice(0, 14) };
    }
    const sig = sigOf(facts);
    const kept = s[g.defectFingerprint];
    const curated = !!(g as DefectGroup & { curated?: unknown }).curated;
    const stale = !kept || kept.sig !== sig || inventedNumbers(kept.plain, facts).length > 0;
    if (!curated && stale && !queued.has(g.defectFingerprint)) {
      queue.push({ fp: g.defectFingerprint, facts });
      queued.add(g.defectFingerprint);
      added = true;
    }
    // A kept write-up with a number the facts do not have is written again.
    const fresh = !!kept && kept.sig === sig && !inventedNumbers(kept.plain, facts).length;
    const words = { ...(fresh ? kept.plain : templatePlain(facts, g)) };
    // The app asking for something ("Please add …", "… is required") may be
    // the app being right and the test leaving it out; said every time, not
    // left to the model to remember.
    const asked = [g.title, ...g.evidence].join(" ").match(/["“](Please (?:add|fill|select|enter|provide)[^"”]*|[^"”]* is required[^"”]*)["”]/i);
    if (asked && !/test may|automation may|left (it|this) out/i.test(words.summary)) {
      words.summary = `${words.summary} The app is asking for something that was not given ("${clip(asked[1], 90)}") — this may be the test leaving it out rather than a fault in Procol.`;
    }
    const notes = [...new Set(facts.cases.map((c) => c.devNote).filter(Boolean) as string[])].slice(0, 6);
    const plain: PlainBug = {
      ...words,
      artifacts: artifactsOf(g),
      forDevs: { endpoint: facts.endpoint, notes },
      writtenBy: fresh ? "spine.ai" : "template",
    };
    return Object.assign(g, { plain });
  });
  // New work, or work left waiting by a pause or a restart.
  if (added || queue.length) void pump();
  return out;
}

/** How many write-ups are still waiting to be written. */
export function plainPending(): number {
  return queue.length + (writing ? 1 : 0);
}
