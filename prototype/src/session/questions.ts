/**
 * THE PLATFORM ASKS ON SCREEN WHEN IT IS UNSURE — and goes on when answered.
 *
 * A careful colleague does not guess which company to test, whether a flow the PRD mentions is in
 * scope, or what should happen when the PRD is silent: they ask, in plain words, and carry on when
 * told. This module is that habit for the guided session. Every step may ask; the questions live on
 * the session file (so a reload shows them), stream to whoever is watching (the step's own stream and
 * the session-wide question stream), and each one says what the platform would pick if nobody answers.
 *
 * Two ways to ask:
 *   askLater(s, q)                the run goes on; the answer is APPLIED when it comes, by the source's
 *                                 applier (registered with onAnswer) — even after a server restart
 *   askAndWait(s, q, timeoutMs)   the run waits for the answer up to the deadline, then takes the
 *                                 suggestion (never stuck: a tester who walked away does not hold a browser)
 *
 * The words on a question are the product: one plain sentence, one plain reason, options a person
 * would say ("Yes, test it", "Leave it out", "I don't know"). The frontend shows them; it never rewrites them.
 */
import { loadSession, updateSession, type Session, type Step } from "./store.js";

export type QuestionSource = "company" | "flows" | "prd" | "setting" | "sanity" | "cases" | "run";
export type QuestionKind = "yes-no" | "one" | "many" | "text";
export interface QuestionOption { value: string; label: string; means?: string }

export interface SessionQuestion {
  qid: string;
  step: Step;
  source: QuestionSource;
  kind: QuestionKind;
  /** ONE plain sentence */
  text: string;
  /** ONE plain sentence on why it matters; may be empty */
  why?: string;
  options?: QuestionOption[];
  /** what the platform would pick (option values, comma-joined for "many") */
  suggested?: string;
  /** true: the run waits for the answer until deadlineAt, then takes the suggestion */
  blocking: boolean;
  deadlineAt?: string;
  ifNoAnswer?: string;
  askedAt: string;
  answer?: string;
  answeredAt?: string;
  skipped?: boolean;
  /** what changed because of the answer, in plain words */
  outcome?: string;
  closed?: "deadline" | "cancelled";
  /** what the asker needs to apply the answer later (a flow id, a case id, the card's question id) */
  ref?: Record<string, string>;
}

export type QuestionEvent =
  | { type: "ask"; question: SessionQuestion }
  | { type: "answered"; question: SessionQuestion }
  | { type: "closed"; qid: string; how: "deadline" | "cancelled" };

export interface AskInput {
  step: Step;
  source: QuestionSource;
  kind: QuestionKind;
  text: string;
  why?: string;
  options?: QuestionOption[];
  suggested?: string;
  ref?: Record<string, string>;
}

type Listener = (e: QuestionEvent) => void;
type Applier = (s: Session, q: SessionQuestion) => string | void;

const listeners = new Map<string, Set<Listener>>();
const waiting = new Map<string, { resolve: (a: string | null) => void; timer?: NodeJS.Timeout }>();
const appliers = new Map<QuestionSource, Applier>();

/** The module that asks registers what an answer changes; it runs on answer, also after a restart. */
export function onAnswer(source: QuestionSource, fn: Applier): void {
  appliers.set(source, fn);
}

/** Watch a session's questions (a step stream while it runs, the question stream while the page is open). */
export function subscribe(sessionId: string, fn: Listener): () => void {
  if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
  listeners.get(sessionId)!.add(fn);
  return () => { listeners.get(sessionId)?.delete(fn); };
}

function broadcast(sessionId: string, e: QuestionEvent): void {
  for (const fn of listeners.get(sessionId) ?? []) {
    try { fn(e); } catch { /* a closed stream */ }
  }
}

export function questionsOf(s: Session): SessionQuestion[] {
  return ((loadSession(s.id) ?? s).questions ?? []) as SessionQuestion[];
}

export const isOpen = (q: SessionQuestion) => !q.answer && !q.skipped && !q.closed;

export function openQuestions(s: Session): SessionQuestion[] {
  return questionsOf(s).filter(isOpen);
}

const sameAsk = (a: SessionQuestion, b: AskInput) => a.source === b.source && a.text === b.text && JSON.stringify(a.ref ?? {}) === JSON.stringify(b.ref ?? {});

/** A question an earlier run of the same step asked and nobody answered is asked once, not stacked. */
function create(s: Session, q: AskInput, blocking: boolean, timeoutMs?: number): { question: SessionQuestion; fresh: boolean } {
  let question!: SessionQuestion;
  let fresh = true;
  updateSession(s, (f) => {
    const all = (f.questions ?? []) as SessionQuestion[];
    const open = all.find((x) => isOpen(x) && sameAsk(x, q));
    if (open && open.blocking === blocking) { question = open; fresh = false; return; }
    const n = all.length + 1;
    question = {
      qid: `q${n}`, step: q.step, source: q.source, kind: q.kind, text: q.text, ...(q.why ? { why: q.why } : {}),
      ...(q.options?.length ? { options: q.options } : {}), ...(q.suggested !== undefined ? { suggested: q.suggested } : {}), ...(q.ref ? { ref: q.ref } : {}),
      blocking, askedAt: new Date().toISOString(),
      ...(blocking && timeoutMs ? { deadlineAt: new Date(Date.now() + timeoutMs).toISOString(), ifNoAnswer: ifNoAnswerWords(q, timeoutMs) } : {}),
    };
    f.questions = [...all, question];
  });
  return { question, fresh };
}

function ifNoAnswerWords(q: AskInput, timeoutMs: number): string {
  const pick = q.options?.find((o) => o.value === q.suggested)?.label ?? q.suggested;
  return pick ? `If I hear nothing in ${minutes(timeoutMs)}, I'll go with “${pick}”.` : `If I hear nothing in ${minutes(timeoutMs)}, I'll stop here and wait for you.`;
}

export const minutes = (ms: number) => { const m = Math.round(ms / 60_000); return m <= 1 ? "a minute" : `${m} minutes`; };

/** Ask and go on. */
export function askLater(s: Session, q: AskInput): SessionQuestion {
  const { question, fresh } = create(s, q, false);
  if (fresh) broadcast(s.id, { type: "ask", question });
  return question;
}

/** Ask and wait: the answer, the suggestion when the deadline passes ("" when there is none), null when cancelled. */
export function askAndWait(s: Session, q: AskInput, timeoutMs = 10 * 60_000): Promise<{ answer: string | null; question: SessionQuestion; how: "answered" | "deadline" | "cancelled" }> {
  const { question, fresh } = create(s, q, true, timeoutMs);
  const key = `${s.id}:${question.qid}`;
  return new Promise((resolve) => {
    // wait FIRST, then ask: a listener may answer inside broadcast(), before this line returns
    const timer = setTimeout(() => {
      if (!waiting.delete(key)) return;
      let closedQ = question;
      updateSession(s, (f) => { const x = ((f.questions ?? []) as SessionQuestion[]).find((y) => y.qid === question.qid); if (x && isOpen(x)) { x.closed = "deadline"; x.outcome = x.suggested ? `No answer by the deadline, so I went with the suggestion.` : "No answer by the deadline, so I stopped here."; closedQ = x; } });
      broadcast(s.id, { type: "closed", qid: question.qid, how: "deadline" });
      resolve({ answer: question.suggested ?? "", question: closedQ, how: "deadline" });
    }, timeoutMs);
    waiting.set(key, { timer, resolve: (a) => resolve(a === null ? { answer: null, question, how: "cancelled" } : { answer: a, question: questionsOf(s).find((x) => x.qid === question.qid) ?? question, how: "answered" }) });
    if (fresh) broadcast(s.id, { type: "ask", question });
  });
}

/** The tester's answer (or a skip). Applies it, saves it, wakes a waiting run, tells every watcher. */
export function answerQuestion(s: Session, qid: string, answer?: string, skip?: boolean): { ok: boolean; why?: string; question?: SessionQuestion } {
  let found: SessionQuestion | undefined;
  let why: string | undefined;
  updateSession(s, (f) => {
    const q = ((f.questions ?? []) as SessionQuestion[]).find((x) => x.qid === qid);
    if (!q) { why = "There is no question with that number on this session."; return; }
    if (!isOpen(q)) { why = q.closed === "deadline" ? "That question's deadline passed; the platform went on with the suggestion." : "That question was already answered."; return; }
    if (skip) { q.skipped = true; q.answeredAt = new Date().toISOString(); q.outcome = q.suggested ? "Skipped — the platform went with its suggestion." : "Skipped."; }
    else {
      const a = String(answer ?? "").trim();
      if (!a) { why = "Give an answer, or skip the question."; return; }
      q.answer = a; q.answeredAt = new Date().toISOString();
    }
    found = q;
  });
  if (!found) return { ok: false, why };
  // what the answer (or the skip) changes — the source's applier; its words become the outcome shown under the answer
  const apply = appliers.get(found.source);
  if (apply) {
    try {
      const out = apply(s, found);
      if (out) updateSession(s, (f) => { const q = ((f.questions ?? []) as SessionQuestion[]).find((x) => x.qid === qid); if (q) q.outcome = out; });
    } catch (e) {
      updateSession(s, (f) => { const q = ((f.questions ?? []) as SessionQuestion[]).find((x) => x.qid === qid); if (q) q.outcome = `Noted, but it could not be applied: ${String((e as Error).message).slice(0, 160)}`; });
    }
  }
  const question = questionsOf(s).find((x) => x.qid === qid) ?? found;
  const w = waiting.get(`${s.id}:${qid}`);
  if (w) { waiting.delete(`${s.id}:${qid}`); if (w.timer) clearTimeout(w.timer); w.resolve(question.skipped ? (question.suggested ?? "") : (question.answer ?? "")); }
  broadcast(s.id, { type: "answered", question });
  return { ok: true, question };
}

/** The run that asked is gone (the stream closed, the server stops): a waiting question is released. */
export function cancelQuestions(sessionId: string): void {
  for (const [key, w] of waiting) {
    if (!key.startsWith(`${sessionId}:`)) continue;
    waiting.delete(key);
    if (w.timer) clearTimeout(w.timer);
    w.resolve(null);
  }
}

/** The values a "many" answer names (comma, semicolon or newline separated), or the labels typed instead. */
export function chosenValues(q: SessionQuestion, answer: string): string[] {
  const parts = answer.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  const byLabel = new Map((q.options ?? []).map((o) => [o.label.toLowerCase(), o.value]));
  return parts.map((p) => byLabel.get(p.toLowerCase()) ?? p);
}

/** Plain-words helpers the askers share. */
export const yesNo = (yesMeans: string, noMeans: string, yesLabel = "Yes", noLabel = "No"): QuestionOption[] => [{ value: "yes", label: yesLabel, means: yesMeans }, { value: "no", label: noLabel, means: noMeans }];
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
