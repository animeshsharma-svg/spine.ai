/**
 * A question a run asks the person in the session, and waits for — without getting stuck:
 * a question has a deadline, and a closed session cancels it.
 *
 *   askQuestion(runId, q, emit, timeoutMs)  → the answer, "" on the deadline, null when cancelled
 *   answerQuestion(runId, qid, text)        ← POST /api/ask/answer
 *   cancelQuestions(runId)                  ← the stream closed
 */
export interface Question {
  id: string;
  qid: string;
  text: string;
  kind: "one" | "choose" | "text";
  options?: string[];
  screenshot?: string | null;
  askedAt: string;
  /** where the UI posts the answer */
  answerUrl: string;
  timeoutMs: number;
}

const pending = new Map<string, { q: Question; resolve: (a: string | null) => void; timer: NodeJS.Timeout }>();
const counts = new Map<string, number>();

export function askQuestion(runId: string, q: Omit<Question, "id" | "qid" | "askedAt" | "answerUrl" | "timeoutMs">, emit: (q: Question) => void, timeoutMs = 10 * 60_000): Promise<string | null> {
  const n = (counts.get(runId) ?? 0) + 1;
  counts.set(runId, n);
  const full: Question = { ...q, id: runId, qid: `q${n}`, askedAt: new Date().toISOString(), answerUrl: "/api/ask/answer", timeoutMs };
  return new Promise((resolve) => {
    const key = `${runId}:${full.qid}`;
    const timer = setTimeout(() => {
      if (pending.delete(key)) resolve("");
    }, timeoutMs);
    pending.set(key, { q: full, resolve, timer });
    emit(full);
  });
}

export function answerQuestion(runId: string, qid: string, text: string): { ok: boolean; why?: string } {
  const key = `${runId}:${qid}`;
  const p = pending.get(key);
  if (!p) return { ok: false, why: "that question is not open" };
  pending.delete(key);
  clearTimeout(p.timer);
  p.resolve(text);
  return { ok: true };
}

export function cancelQuestions(runId: string): void {
  for (const [key, p] of pending) {
    if (!key.startsWith(`${runId}:`)) continue;
    pending.delete(key);
    clearTimeout(p.timer);
    p.resolve(null);
  }
}
