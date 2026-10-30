/**
 * EXPLORE A PAGE — give spine.ai a URL; it looks, writes tests, asks when it is stuck, runs them,
 * and keeps a report.
 *
 *   1. open   the page in the client's console (only Procol UAT hosts; signed in as the
 *             automation buyer) and take its inventory + screenshot;
 *   2. draft  test cases from what is on it and the rules Procol's code enforces there
 *             (screenCases.ts), with everything the tester has said so far as notes;
 *   3. ask    whenever a person is needed: the page did not open, which cases to run, a case
 *             the steps cannot express yet, a failure the app's rules do not explain;
 *   4. run    each chosen case live (screenshots per step), judge it, and ask about failures
 *             nobody can classify alone;
 *   5. keep   the whole session as a report (data/explore-runs/<id>.json) and every answer as
 *             a lesson (knowledge/lessons/tester-answers.md — the memory loads it on rag:build).
 * A question waits for the answer; the session never guesses past one.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runUiPlan, readPlanResult } from "../ui/uiFlowRunner.js";
import { draftCasesFromScreen, type ScreenInventory } from "./screenCases.js";
import { compileTestCase } from "./planner.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..", "..");
const RUNS = join(PROTO, "data", "explore-runs");
const LESSONS = join(PROTO, "knowledge", "lessons", "tester-answers.md");
const UI_CONFIG = join(PROTO, "..", "procol-ui-tests", "src", "config.ts");

export type Verdict = "worked" | "partly" | "broken" | "not_checked" | "skipped" | "pending";

export interface ExploreQuestion {
  id: string;
  text: string;
  /** "choose" = pick any of options (multi); "one" = pick one option or type; "text" = free answer */
  kind: "choose" | "one" | "text";
  options?: string[];
  screenshot?: string | null;
  askedAt: string;
  answer?: string;
  answeredAt?: string;
}

export interface ExploreCase {
  n: number;
  /** the draft's id when the case was saved to the catalog */
  id?: string;
  title: string;
  grounded: string;
  rule?: { id: string; cite: string; statement: string };
  steps: string[];
  expected: string;
  coverage: string;
  gaps: string[];
  plan?: { title: string; steps: unknown[] };
  verdict: Verdict;
  why?: string;
  run?: { steps: Array<{ step: string; status: string; detail?: string; screenshot?: string | null }> };
}

export interface ExploreSession {
  id: string;
  url: string;
  path: string;
  companyId: number;
  status: "running" | "waiting" | "done" | "stopped" | "failed";
  startedAt: string;
  endedAt?: string;
  screen?: { label: string; path: string; screenshot?: string | null; controls: number; headings: string[]; messages: string[]; sample: string[] };
  cases: ExploreCase[];
  questions: ExploreQuestion[];
  notes: string[];
  timeline: Array<{ at: string; type: string; text: string; screenshot?: string | null }>;
  summary?: { cases: number; worked: number; partly: number; broken: number; notChecked: number; skipped: number; questions: number };
}

type Listener = (event: string, data: unknown) => void;

interface Live {
  s: ExploreSession;
  listeners: Set<Listener>;
  pending?: { q: ExploreQuestion; resolve: (a: string) => void };
  /** auto: run every automatable case without asking which; a question that gets no answer in time is skipped, never waited on */
  auto?: boolean;
  /** save the drafted cases to the catalog (GEN-SCR ids) */
  save?: boolean;
  askTimeoutMs?: number;
  label?: string;
  stop?: () => void;
  stopped: boolean;
}
const live = new Map<string, Live>();

const now = () => new Date().toISOString();
const short = (t: string, n = 200) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Console hosts the platform may drive: the configured client app URLs, nothing else. */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (u?: string) => {
    try {
      if (u) hosts.add(new URL(u).host);
    } catch {
      /* not a URL */
    }
  };
  if (existsSync(UI_CONFIG)) for (const m of readFileSync(UI_CONFIG, "utf8").matchAll(/appUrl:\s*"(https?:\/\/[^"]+)"/g)) add(m[1]);
  for (const [k, v] of Object.entries(process.env)) if (/APP_URL$/.test(k)) add(v);
  return hosts;
}

/** A console path from what the person typed: a full URL on an allowed host, or a path. */
export function consolePath(input: string): { path?: string; why?: string } {
  const t = input.trim();
  if (t.startsWith("/")) return { path: t };
  try {
    const u = new URL(t);
    const ok = allowedHosts();
    if (!ok.has(u.host)) return { why: `${u.host} is not the client console (${[...ok].join(", ") || "none configured"}). spine.ai only drives Procol UAT.` };
    return { path: `${u.pathname}${u.search}` };
  } catch {
    return { why: "that is neither a console URL nor a path starting with /" };
  }
}

function lesson(sessionId: string, path: string, q: string, a: string): void {
  try {
    mkdirSync(dirname(LESSONS), { recursive: true });
    if (!existsSync(LESSONS)) {
      writeFileSync(LESSONS, "# Tester answers — what people told spine.ai while it explored a page\n\nEach section is one answer, with the question it answered and the page. The memory loads this file as lessons on the next `npm run rag:build`; explore sessions also read it directly.\n");
    }
    appendFileSync(LESSONS, `\n### Lesson: ${short(q, 110)}\n${short(a, 600)}\nWhere: explore session ${sessionId}, page ${path}, ${now().slice(0, 10)}.\n`);
  } catch {
    /* a lesson is best effort */
  }
}

/** What testers have already told the platform about this page (and in general). */
function priorNotes(path: string): string[] {
  if (!existsSync(LESSONS)) return [];
  const base = path.split("?")[0].replace(/\/[A-Za-z0-9=]{6,}(?=\/|$)/g, "/:id");
  return readFileSync(LESSONS, "utf8")
    .split(/\n(?=### Lesson: )/)
    .filter((b) => b.startsWith("### Lesson: "))
    .filter((b) => b.includes(base) || !/Where: explore session/.test(b))
    .slice(-12)
    .map((b) => short(b.replace(/^### Lesson: /, "").replace(/\nWhere:.*$/s, ""), 300));
}

function save(L: Live): void {
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(join(RUNS, `${L.s.id}.json`), JSON.stringify(L.s, null, 2));
}

function emit(L: Live, event: string, data: unknown, line?: { text: string; screenshot?: string | null }): void {
  if (line) L.s.timeline.push({ at: now(), type: event, text: line.text, ...(line.screenshot !== undefined ? { screenshot: line.screenshot } : {}) });
  for (const f of L.listeners) {
    try {
      f(event, data);
    } catch {
      /* a closed listener */
    }
  }
  if (event !== "frame" && event !== "spot" && event !== "log") save(L);
}

function ask(L: Live, q: Omit<ExploreQuestion, "id" | "askedAt">): Promise<string> {
  const question: ExploreQuestion = { ...q, id: `q${L.s.questions.length + 1}`, askedAt: now() };
  L.s.questions.push(question);
  L.s.status = "waiting";
  // wait FIRST, then ask: a listener may answer inside emit(), before this line returns
  let resolve!: (a: string) => void;
  const answered = new Promise<string>((r) => (resolve = r));
  L.pending = { q: question, resolve };
  // A question with a deadline (auto mode): the run goes on without the answer rather than
  // waiting for a person who may have walked away; the question stays in the report.
  if (L.askTimeoutMs) {
    const timer = setTimeout(() => {
      if (L.pending?.q.id !== question.id) return;
      L.pending = undefined;
      question.answer = "";
      question.answeredAt = now();
      L.s.status = "running";
      emit(L, "unanswered", { qid: question.id }, { text: `no answer in ${Math.round((L.askTimeoutMs ?? 0) / 60_000)} min — going on without it` });
      resolve("");
    }, L.askTimeoutMs);
    void answered.then(() => clearTimeout(timer));
  }
  emit(L, "question", { ...question, answerUrl: "/api/explore/answer", timeoutMs: L.askTimeoutMs ?? 0 }, { text: `asked: ${question.text}`, screenshot: question.screenshot });
  return answered;
}

/** The person's answer to the open question. */
export function answer(id: string, qid: string, text: string): { ok: boolean; why?: string } {
  const L = live.get(id);
  if (!L) return { ok: false, why: "no running session with that id" };
  if (!L.pending || L.pending.q.id !== qid) return { ok: false, why: "that question is not open" };
  const p = L.pending;
  L.pending = undefined;
  p.q.answer = text;
  p.q.answeredAt = now();
  L.s.status = "running";
  emit(L, "answered", { qid, answer: text }, { text: `you answered: ${short(text, 160)}` });
  p.resolve(text);
  return { ok: true };
}

export function stopSession(id: string): boolean {
  const L = live.get(id);
  if (!L) return false;
  L.stopped = true;
  L.stop?.();
  if (L.pending) {
    const p = L.pending;
    L.pending = undefined;
    p.resolve("stop");
  }
  return true;
}

export function subscribe(id: string, f: Listener): (() => void) | null {
  const L = live.get(id);
  if (!L) return null;
  L.listeners.add(f);
  return () => L.listeners.delete(f);
}

export function getSession(id: string): ExploreSession | null {
  const L = live.get(id);
  if (L) return L.s;
  const f = join(RUNS, `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as ExploreSession) : null;
}

export function listSessions(limit = 30): Array<Pick<ExploreSession, "id" | "url" | "path" | "status" | "startedAt" | "endedAt" | "summary">> {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(RUNS, f), "utf8")) as ExploreSession;
        return { id: s.id, url: s.url, path: s.path, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, summary: s.summary };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/** Run a plan in the browser and wait for it; frames go to the page live. */
function runAndWait(L: Live, plan: { title: string; steps: unknown[] }, runId: string): Promise<{ result: any; inventory?: string }> {
  return new Promise((resolve) => {
    let inventory: string | undefined;
    const h = runUiPlan({ plan, companyId: L.s.companyId, runId, headed: false }, (e: any) => {
      if (e.type === "frame" && e.frame) emit(L, "frame", { frame: e.frame });
      if (e.type === "spot") emit(L, "spot", e);
      if (e.type === "log" && e.line) emit(L, "log", { line: String(e.line) });
      const m = /\[inventory\]\s+(\S+\.inventory\.json)/.exec(String(e.line ?? ""));
      if (m) inventory = m[1];
      if (e.type === "log" && /\[plan\] \d+\/\d+ /.test(String(e.line ?? ""))) emit(L, "progress", { line: short(String(e.line).replace(/^.*\[plan\]\s*/, ""), 240) });
      if (e.type === "done" || e.type === "run-error") resolve({ result: readPlanResult(runId), inventory });
    });
    L.stop = h.stop;
  });
}

/** The plan's first move is to open THIS page; whatever the compiler opened first gives way. */
function startOnPage(plan: { title: string; steps: any[] }, path: string): { title: string; steps: any[] } {
  const creating = /quick-create|projectCreation=true|\/orders\/create/.test(path);
  const steps = [...plan.steps];
  if (creating && steps[0]?.step === "open_create") return { ...plan, steps };
  while (steps.length && /^open_(create|events_list|event|prepared)$/.test(steps[0]?.step)) steps.shift();
  // Off the event screens, the event steps have nothing to act on ("expect_events_list" on the
  // purchase-requisition page failed a healthy screen, 26 Oct): only the generic steps stay.
  const eventScreen = /^\/(orders|project)\b/.test(path);
  const GENERIC = /^(go_to|click|hover|fill|select|toggle|upload|press|expect_text|expect_visible|expect_count|expect_value|expect_message|expect_toast|expect_error|expect_field_error|expect_url_contains|expect_disabled|expect_enabled|expect_navigated|expect_screen_clean|remember|expect_remembered|skip|attempt|inventory_screen|capture_screen|switch_company)$/;
  const kept = eventScreen ? steps : steps.filter((st) => GENERIC.test(String(st?.step ?? "")));
  const first = kept[0]?.step === "go_to" && kept[0]?.args?.screen === "path" ? kept.slice(1) : kept;
  return { ...plan, steps: [{ step: "go_to", args: { screen: "path", path } }, ...first] };
}

export function startExplore(input: { url: string; companyId: number; max?: number; auto?: boolean; save?: boolean; askTimeoutMs?: number; label?: string }): { id?: string; why?: string } {
  const p = consolePath(input.url);
  if (!p.path) return { why: p.why };
  const id = `exp-${Date.now().toString(36)}`;
  const s: ExploreSession = { id, url: input.url, path: p.path, companyId: input.companyId, status: "running", startedAt: now(), cases: [], questions: [], notes: priorNotes(p.path), timeline: [] };
  const L: Live = { s, listeners: new Set(), stopped: false, auto: input.auto, save: input.save, askTimeoutMs: input.askTimeoutMs, label: input.label };
  live.set(id, L);
  save(L);
  void explore(L, input.max ?? 6).catch((e) => {
    L.s.status = "failed";
    emit(L, "failed", { why: short((e as Error).message, 300) }, { text: `stopped: ${short((e as Error).message, 200)}` });
  });
  return { id };
}

async function explore(L: Live, max: number): Promise<void> {
  const s = L.s;
  emit(L, "start", { id: s.id, path: s.path, notes: s.notes.length }, { text: `exploring ${s.path}${s.notes.length ? ` · ${s.notes.length} earlier answer(s) from testers in mind` : ""}` });

  // 1. OPEN + LOOK — ask when the page does not open as a page to test
  let inv: ScreenInventory | null = null;
  for (let attempt = 0; attempt < 4 && !inv && !L.stopped; attempt++) {
    const label = (L.label || s.path.split("?")[0].split("/").filter(Boolean).slice(0, 2).join("-") || "home").replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
    const r = await runAndWait(L, { title: `explore ${s.path}`, steps: [{ step: "go_to", args: { screen: "path", path: s.path } }, { step: "inventory_screen", args: { label } }] }, `${s.id}-look${attempt}`);
    const got = r.inventory && existsSync(r.inventory) ? (JSON.parse(readFileSync(r.inventory, "utf8")) as ScreenInventory) : null;
    const blocked = got && (/not authori[sz]ed|page not found|404|something went wrong|access denied/i.test([...got.messages, ...got.headings].join(" ")) || got.controls.length < 3);
    if (got && !blocked) {
      inv = got;
      break;
    }
    const failedStep = (r.result?.steps ?? []).find((x: any) => x.status === "failed");
    const said = got ? short([...got.messages, ...got.headings].join(" · "), 200) : short(failedStep?.detail ?? "the page did not load", 200);
    // Auto mode tries once more on its own before asking; a page that will not open twice is a
    // question worth a person's time (wrong module, no permission, a dead route).
    if (L.auto && attempt === 0) {
      emit(L, "info", { text: `the page did not open as something to test (${said || "almost nothing on it"}) — trying once more` }, { text: `did not open: ${said}` });
      continue;
    }
    const a = await ask(L, {
      kind: "one",
      text: `The page did not open as something I can test (${said || "almost nothing on it"}). What should I do?`,
      options: ["Try again", "Stop"],
      screenshot: got?.screenshot ?? failedStep?.evidence?.screenshot ?? null,
    });
    if (/^stop$/i.test(a.trim())) return finish(L, "stopped");
    if (a.trim() === "" ) return finish(L, "stopped");
    if (/^try again$/i.test(a.trim())) continue;
    const p = consolePath(a);
    if (p.path) {
      s.path = p.path;
      emit(L, "info", { text: `opening ${p.path} instead` }, { text: `opening ${p.path} instead` });
    } else {
      s.notes.push(a);
      lesson(s.id, s.path, "page did not open", a);
    }
  }
  if (!inv) return finish(L, "stopped");
  s.screen = {
    label: inv.label,
    path: inv.path,
    screenshot: inv.screenshot,
    controls: inv.controls.length,
    headings: inv.headings.slice(0, 8),
    messages: inv.messages.slice(0, 6),
    sample: inv.controls.slice(0, 30).map((c) => `${c.kind} "${c.name}"${c.disabled ? " (disabled)" : ""}`),
  };
  emit(L, "screen", s.screen, { text: `opened ${inv.path}: ${inv.controls.length} controls`, screenshot: inv.screenshot });

  // 2. DRAFT — from the screen, the code's rules, the memory and what testers said
  emit(L, "info", { text: "writing test cases from the screen, the code's rules and the memory…" });
  const drafted = await draftCasesFromScreen(inv, { max, companyId: s.companyId, save: !!L.save, compile: true, notes: s.notes });
  s.cases = drafted.saved.map((d, i) => ({
    n: i + 1,
    ...(L.save && d.id ? { id: d.id } : {}),
    title: d.title,
    grounded: d.grounded,
    rule: d.rule,
    steps: d.steps ?? [],
    expected: d.expected ?? "",
    coverage: d.coverage ?? "none",
    gaps: d.gaps ?? [],
    plan: d.plan as ExploreCase["plan"],
    verdict: "pending" as Verdict,
  }));
  emit(L, "cases", { cases: s.cases, alreadyCovered: drafted.alreadyCovered, dropped: drafted.dropped }, { text: `wrote ${s.cases.length} case(s); ${drafted.alreadyCovered.length} already in the catalog, ${drafted.dropped.length} dropped` });
  if (!s.cases.length) return finish(L, "done");

  // 3. CHOOSE — the person decides what runs; in auto mode every automatable case runs
  if (L.auto) {
    for (const c of s.cases) if (c.coverage === "none" || !c.plan?.steps?.length) {
      c.verdict = "not_checked";
      c.why = `no step can do this yet${c.gaps.length ? ` — ${short(c.gaps.slice(0, 2).join("; "), 200)}` : ""}; tell me how in the composer and it is tried next time`;
      emit(L, "case", c, { text: `not checked: ${c.title} — ${c.why}` });
    }
  } else {
    const pick = await ask(L, {
      kind: "choose",
      text: "Which of these should I run now?",
      options: s.cases.map((c) => `${c.n}. ${c.title}${c.coverage !== "full" ? ` (${c.coverage === "none" ? "needs your help" : "partly automatable"})` : ""}`),
    });
    if (/^stop$/i.test(pick.trim())) return finish(L, "stopped");
    const chosen = /^all$/i.test(pick.trim()) ? s.cases.map((c) => c.n) : (pick.match(/\d+/g) ?? []).map(Number);
    for (const c of s.cases) if (!chosen.includes(c.n)) c.verdict = "skipped";
  }

  // 4. RUN — asking for what the steps cannot express, and about failures nobody can classify
  for (const c of s.cases.filter((x) => x.verdict === "pending")) {
    if (L.stopped) break;
    if (c.coverage === "none" || !c.plan?.steps?.length) {
      const help = await ask(L, {
        kind: "text",
        text: `I can't automate “${c.title}” yet${c.gaps.length ? ` — missing: ${short(c.gaps.slice(0, 2).join("; "), 220)}` : ""}. Tell me how (which button, which value), or type skip.`,
        screenshot: s.screen?.screenshot,
      });
      if (/^(skip|stop)$/i.test(help.trim())) {
        c.verdict = "skipped";
        c.why = "skipped by you";
        emit(L, "case", c, { text: `skipped: ${c.title}` });
        if (/^stop$/i.test(help.trim())) break;
        continue;
      }
      s.notes.push(help);
      lesson(s.id, s.path, `how to test: ${c.title}`, help);
      const re = await compileTestCase(`${c.title}. ${c.steps.join(" ")} Expected: ${c.expected} Tester's notes: ${help}`, "events", { tier: "fast", dryRun: true }).catch(() => null);
      if (!re || re.coverage === "none") {
        c.verdict = "not_checked";
        c.why = `still no steps for it after your note${re?.gaps?.length ? ` — ${short(re.gaps.join("; "), 160)}` : ""}`;
        emit(L, "case", c, { text: `not checked: ${c.title}` });
        continue;
      }
      c.plan = re.plan as ExploreCase["plan"];
      c.coverage = re.coverage;
      c.gaps = re.gaps;
    }
    emit(L, "running", { n: c.n, title: c.title }, { text: `running ${c.n}. ${c.title}` });
    const r = await runAndWait(L, startOnPage(c.plan as any, s.path), `${s.id}-c${c.n}`);
    const steps: any[] = r.result?.steps ?? [];
    const shots: any[] = r.result?.observations ?? [];
    c.run = {
      steps: steps.map((x, i) => ({ step: x.step, status: x.status, detail: short(x.detail ?? "", 300), screenshot: x.evidence?.screenshot ?? shots.find((o: any) => o.step === i + 1)?.screenshot ?? null })),
    };
    const failed = steps.find((x) => x.status === "failed");
    if (!failed && r.result?.passed !== false && steps.length) {
      // A partly automatable case that passes proves only its automated part: "worked" would
      // claim the part nobody ran (2026-10-14: an "old creation flow" case passed on the new flow).
      c.verdict = c.coverage === "partial" ? "partly" : "worked";
      c.why = c.coverage === "partial" ? `the automated steps worked; not checked: ${short(c.gaps.join("; "), 180)}` : "every step worked";
    } else if (!failed) {
      c.verdict = "not_checked";
      c.why = "the run produced no result";
    } else if (/not checked:/i.test(failed.detail ?? "")) {
      c.verdict = "not_checked";
      c.why = short(String(failed.detail).replace(/^.*?not checked:\s*/i, ""), 200);
    } else if (/needs something to look for|is not an allowed key|does not know the screen|needs a console path|needs an? "(option|key|value)"|needs a name|no such step|unknown step/i.test(failed.detail ?? "")) {
      // The plan itself was built wrong (an empty expect_count, a key the step refuses): that is
      // the automation's fault, not a question for the tester.
      c.verdict = "not_checked";
      c.why = `the test was built wrong at ${failed.step}: ${short(failed.detail, 160)} — the automation needs fixing, not the product`;
    } else {
      const shot = failed.evidence?.screenshot ?? null;
      const known = /the app's own rule/i.test(failed.detail ?? "");
      const a = await ask(L, {
        kind: "one",
        text: `“${c.title}” — step ${steps.indexOf(failed) + 1} (${failed.step}) failed: ${short(failed.detail, 240)}.${known ? " The app refused it by one of its own rules." : ""} What is this?`,
        options: ["A product bug", "Expected — the app is right", "The test did it wrong", "Skip"],
        screenshot: shot,
      });
      const t = a.trim();
      if (t === "") {
        c.verdict = "not_checked";
        c.why = `failed at ${failed.step}: ${short(failed.detail, 160)} — nobody said yet whether this is a bug; the picture is in the report`;
      } else if (/^a product bug$/i.test(t)) {
        c.verdict = "broken";
        c.why = `failed at ${failed.step}; you confirmed it is a product bug — re-check on a fresh event before it goes to the bug sheet`;
      } else if (/^expected/i.test(t)) {
        c.verdict = "worked";
        c.why = `the app behaved as intended (you confirmed): ${short(failed.detail, 140)}`;
        lesson(s.id, s.path, `expected behaviour: ${short(failed.detail, 90)}`, "This is the app working as intended, not a bug (confirmed by a tester).");
      } else if (/^the test did it wrong$/i.test(t)) {
        c.verdict = "not_checked";
        c.why = "the test did it wrong (you said) — the automation needs fixing";
      } else if (/^skip$/i.test(t)) {
        c.verdict = "skipped";
        c.why = "skipped by you after a failure";
      } else {
        c.verdict = "not_checked";
        c.why = `you said: ${short(t, 160)}`;
        s.notes.push(t);
        lesson(s.id, s.path, `about “${c.title}” failing at ${failed.step}`, t);
      }
    }
    emit(L, "case", c, { text: `${c.verdict.replace("_", " ")}: ${c.title}${c.why ? ` — ${c.why}` : ""}` });
  }
  return finish(L, L.stopped ? "stopped" : "done");
}

function finish(L: Live, status: ExploreSession["status"]): void {
  const s = L.s;
  s.status = status;
  s.endedAt = now();
  const n = (v: Verdict) => s.cases.filter((c) => c.verdict === v).length;
  s.summary = { cases: s.cases.length, worked: n("worked"), partly: n("partly"), broken: n("broken"), notChecked: n("not_checked"), skipped: n("skipped") + n("pending"), questions: s.questions.length };
  for (const c of s.cases) if (c.verdict === "pending") c.verdict = "skipped";
  emit(L, "done", { status, summary: s.summary }, { text: `${status}: ${s.summary.worked} worked · ${s.summary.partly} partly checked · ${s.summary.broken} broken · ${s.summary.notChecked} not checked · ${s.summary.skipped} skipped` });
  setTimeout(() => live.delete(s.id), 60 * 60_000);
}
