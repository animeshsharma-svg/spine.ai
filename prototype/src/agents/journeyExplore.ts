/**
 * A JOURNEY WITH NO STEP FOR IT NEVER STOPS AT "NOT TESTED".
 *
 * When the compiler has no step for what a typed journey is about (a purchase requisition, an
 * intake request, a vendor onboarding…), the run used to end with "no step yet — nothing was run
 * in its place". Now it finds the console screen the journey is about (routeFinder), asks the
 * tester only when the words leave a real doubt, and hands the screen to the explorer: open it,
 * photograph and inventory it, write its test cases from the controls and the code's rules, run
 * every case that compiles, and ask about a failure nobody can classify alone — with a deadline on
 * every question, so the run always ends. Everything streams into the same session (frames,
 * pictures, cases, verdicts, questions) and the cases land in the journey's record and export.
 */
import { findScreens, type RouteHit } from "./routeFinder.js";
import { askQuestion, cancelQuestions } from "./questions.js";
import { startExplore, stopSession, subscribe, type ExploreCase } from "./explorer.js";
import { saveJourney, type JourneyCase, type JourneyRecord } from "./journeyCases.js";

export interface ExploredScreen {
  path: string;
  name: string;
  status: string;
  cases: number;
  worked: number;
  partly: number;
  broken: number;
  notChecked: number;
  skipped: number;
  questions: number;
}

const VERDICT: Record<string, JourneyCase["status"]> = { worked: "passed", partly: "passed", broken: "failed", not_checked: "not run", skipped: "not reached", pending: "not run" };

/** A tester's answer appended to the journey by the session ("[tester's answer: …]"). */
export function testerHint(text: string): { text: string; hint?: string } {
  const m = text.match(/\[tester'?s answer:\s*([^\]]+)\]/i);
  return m ? { text: text.replace(m[0], "").trim(), hint: m[1].trim() } : { text };
}

export async function exploreJourney(opts: {
  text: string;
  gaps: string[];
  companyId: number;
  runId: string;
  journey: JourneyRecord;
  send: (event: string, data: unknown) => void;
  onClose: (f: () => void) => void;
  /** no question: when the words do not name a screen clearly, do nothing (the partial-coverage case) */
  silent?: boolean;
  maxScreens?: number;
  maxCases?: number;
  exportLinks: Record<string, string>;
}): Promise<{ explored: ExploredScreen[]; asked: number; why?: string }> {
  const { send, runId, journey } = opts;
  const { text, hint } = testerHint(opts.text);
  const say = (kind: "head" | "act" | "note", t: string, extra: Record<string, unknown> = {}) => send("explore", { kind, text: t, ...extra });
  let asked = 0;

  // 1 · which screen
  let choice = await findScreens(hint ? `${text} ${hint}` : text, opts.gaps);
  if (!choice.sure.length && opts.silent) return { explored: [], asked, why: "the words do not name a screen clearly" };
  if (!choice.sure.length) {
    const options = [...choice.candidates.map((r) => `${r.name} (${r.path})`), "Somewhere else — type the menu name or the console path"];
    const a = await askQuestion(runId, { text: `${choice.question ?? "Which screen is this journey about?"} I will open it, photograph it, write its test cases and run them.`, kind: "one", options }, (q) => {
      asked++;
      send("ask", q);
    });
    if (a === null) return { explored: [], asked, why: "the session closed" };
    if (a === "") return { explored: [], asked, why: "no answer to which screen this journey is about" };
    const picked = choice.candidates.find((r) => a.includes(r.path) || a.toLowerCase().includes(r.name.toLowerCase()));
    choice = picked ? { sure: [picked], candidates: [] } : await findScreens(`${text} ${a}`, opts.gaps);
    if (!choice.sure.length) {
      const best = choice.candidates[0];
      if (!best) return { explored: [], asked, why: `no console screen matches "${a}"` };
      choice = { sure: [best], candidates: [] };
    }
  }

  // 2 · explore each screen, in the session
  const explored: ExploredScreen[] = [];
  for (const route of choice.sure.slice(0, opts.maxScreens ?? 2)) {
    const r = await exploreOne(route);
    explored.push(r);
  }
  // The journey's own cases (and the drafts about it) that no explored screen ran say so.
  for (const c of journey.cases) if (!c.status) Object.assign(c, { status: "not run", detail: c.detail || "no step of this run checks it — the exploration tested the screen's own cases" });
  journey.result = { passed: explored.every((e) => e.broken === 0), ok: explored.reduce((n, e) => n + e.worked + e.partly, 0), steps: journey.cases.length };
  saveJourney(journey);
  send("cases-tested", { runId, cases: journey.cases, result: journey.result });
  send("journey", { runId, cases: journey.cases.length, newCases: journey.newCases.length, export: opts.exportLinks });
  return { explored, asked };

  async function exploreOne(route: RouteHit): Promise<ExploredScreen> {
    const label = route.path.split("/").filter(Boolean).join("-") || "home";
    say("head", `No step covers this yet — opening ${route.name} (${route.path}) to look at the screen itself, write its test cases and run them.`, { state: "run" });
    const started = startExplore({ url: route.path, companyId: opts.companyId, max: opts.maxCases ?? 6, auto: true, save: true, askTimeoutMs: 5 * 60_000, label });
    const out: ExploredScreen = { path: route.path, name: route.name, status: "failed", cases: 0, worked: 0, partly: 0, broken: 0, notChecked: 0, skipped: 0, questions: 0 };
    if (!started.id) {
      say("note", `could not open ${route.path}: ${started.why}`, { tone: "warn" });
      return out;
    }
    const expId = started.id;
    opts.onClose(() => stopSession(expId));
    const byN = new Map<number, string>();
    await new Promise<void>((resolve) => {
      const off = subscribe(expId, (event, data: any) => {
        switch (event) {
          case "frame":
            send("frame", data);
            break;
          case "spot":
            send("spot", data);
            break;
          case "log":
            send("log", data);
            break;
          case "progress":
            send("log", { line: `[explore] ${data.line}` });
            break;
          case "info":
            say("note", String(data.text ?? ""));
            break;
          case "screen":
            say("act", `Photographed ${data.path}: ${data.controls} controls${data.headings?.length ? ` · ${data.headings.slice(0, 3).join(" · ")}` : ""}`, { state: "ok", screenshot: data.screenshot ?? null });
            journey.screens.push(label);
            break;
          case "cases": {
            const cases: ExploreCase[] = data.cases ?? [];
            const mapped: JourneyCase[] = cases.map((c) => {
              const id = c.id ?? `${label}-${c.n}`;
              byN.set(c.n, id);
              return { id, title: c.title, steps: c.steps, expected: c.expected, source: "new", grounded: c.grounded, stepIndexes: c.plan?.steps?.length && c.coverage !== "none" ? [0] : [], status: c.plan?.steps?.length && c.coverage !== "none" ? undefined : "not run", detail: c.coverage === "none" ? `no step can do this yet${c.gaps?.length ? ` — ${c.gaps.slice(0, 2).join("; ")}` : ""}` : c.coverage === "partial" ? `partly automatable — not checked: ${c.gaps.slice(0, 2).join("; ")}` : undefined, screen: route.name };
            });
            journey.cases.push(...mapped);
            out.cases += mapped.length;
            saveJourney(journey);
            send("cases", { runId, cases: journey.cases, append: false });
            say("act", `Wrote ${mapped.length} test case(s) for ${route.name}${data.alreadyCovered?.length ? ` · ${data.alreadyCovered.length} already in the catalog` : ""}`, { state: "ok" });
            break;
          }
          case "running":
            say("act", `Running ${data.n}. ${data.title}`, { state: "run", working: true });
            break;
          case "case": {
            const c: ExploreCase = data;
            const id = byN.get(c.n) ?? c.id ?? `${label}-${c.n}`;
            const status = VERDICT[c.verdict] ?? "not run";
            const j = journey.cases.find((x) => x.id === id);
            if (j) {
              j.status = status;
              j.detail = c.why ?? j.detail;
            }
            if (c.verdict === "worked") out.worked++;
            else if (c.verdict === "partly") out.partly++;
            else if (c.verdict === "broken") out.broken++;
            else if (c.verdict === "not_checked") out.notChecked++;
            else out.skipped++;
            saveJourney(journey);
            send("case-verdict", { runId, id, status, detail: c.why ?? "", verdict: c.verdict, n: c.n, title: c.title, run: c.run });
            say("act", `${c.verdict === "worked" ? "Worked" : c.verdict === "partly" ? "Partly checked" : c.verdict === "broken" ? "Broken" : c.verdict === "not_checked" ? "Not checked" : "Skipped"}: ${c.title}${c.why ? ` — ${c.why}` : ""}`, { state: c.verdict === "worked" || c.verdict === "partly" ? "ok" : c.verdict === "broken" ? "bad" : "skip" });
            break;
          }
          case "question":
            out.questions++;
            send("ask", { ...data, id: expId, qid: data.id, answerUrl: "/api/explore/answer" });
            break;
          case "answered":
            send("answered", { id: expId, qid: data.qid, answer: data.answer });
            break;
          case "unanswered":
            send("answered", { id: expId, qid: data.qid, answer: "", timedOut: true });
            break;
          case "done":
            out.status = data.status;
            off?.();
            resolve();
            break;
          case "failed":
            out.status = "failed";
            say("note", `exploring ${route.path} stopped: ${data.why}`, { tone: "warn" });
            off?.();
            resolve();
            break;
        }
      });
      if (!off) resolve();
    });
    cancelQuestions(runId);
    return out;
  }
}
