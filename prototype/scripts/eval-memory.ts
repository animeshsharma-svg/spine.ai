/**
 * GROUNDING EVAL for spine.ai's memory (RAG) — deterministic, no LLM judging.
 *
 *   npm run eval:memory                      # all questions, top 10
 *   npm run eval:memory -- --label baseline  # name the saved result
 *   npm run eval:memory -- --show 5          # print the top 3 results of the first 5 questions
 *   npm run eval:memory -- --only BE-01,CL-01 --show 99
 *
 * Each question in data/evals/memory-eval.json lists the fact(s) a correct
 * retrieval must contain. A retrieved chunk "answers" a question when it holds
 * every string of one expect-group (case-insensitive, punctuation/underscores
 * read as spaces, whole words) and — when the group names kinds — is one of
 * those kinds. The question's rank is the first answering chunk's position.
 *
 * Reports hit@1, hit@5, MRR@k overall and per question kind, plus which chunk
 * kind supplied the answer. Saves the full result to data/evals/results/.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
loadEnv({ path: join(ROOT, ".env") });
const { retrieve, stats } = await import("../src/rag/knowledgeBase.js");
const { closeSpineDb } = await import("../src/db/spineDb.js");

interface Expect {
  all: string[];
  kinds?: string[];
}
interface Question {
  id: string;
  kind: string;
  q: string;
  expect: Expect[];
  ground: string;
}

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const label = arg("label") ?? "run";
const show = Number(arg("show") ?? 0);
const only = arg("only")?.split(",").map((s) => s.trim());

const file = JSON.parse(readFileSync(join(ROOT, "data", "evals", "memory-eval.json"), "utf8")) as { k: number; questions: Question[] };
const K = Number(arg("k") ?? file.k ?? 10);
const questions = only ? file.questions.filter((q) => only.includes(q.id)) : file.questions;

/** lowercase, unicode dashes/quotes folded, every non-alphanumeric run (incl. "_") → one space. */
export function norm(s: string): string {
  return (
    " " +
    s
      .toLowerCase()
      .replace(/[‘’ʼ]/g, "'")
      .replace(/'/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() +
    " "
  );
}

function answers(chunk: { text: string; source: string; labels?: string[]; kind: string }, ex: Expect[]): boolean {
  const hay = norm(`${chunk.text} ${chunk.source} ${(chunk.labels ?? []).join(" ")}`);
  return ex.some((g) => (!g.kinds || g.kinds.includes(chunk.kind)) && g.all.every((needle) => hay.includes(norm(needle))));
}

interface Row {
  id: string;
  kind: string;
  q: string;
  rank: number | null;
  answeredBy?: { kind: string; source: string };
  top: Array<{ kind: string; source: string; score: number; text: string }>;
}

const t0 = Date.now();
const rows: Row[] = [];
for (const q of questions) {
  const hits = await retrieve(q.q, K);
  const idx = hits.findIndex((h) => answers(h, q.expect));
  rows.push({
    id: q.id,
    kind: q.kind,
    q: q.q,
    rank: idx >= 0 ? idx + 1 : null,
    answeredBy: idx >= 0 ? { kind: hits[idx].kind, source: hits[idx].source } : undefined,
    top: hits.slice(0, 5).map((h) => ({ kind: h.kind, source: h.source, score: Number(h.score.toFixed(4)), text: h.text.slice(0, 220).replace(/\s+/g, " ") })),
  });
}

function metrics(rs: Row[]) {
  const n = rs.length || 1;
  const at = (k: number) => rs.filter((r) => r.rank !== null && r.rank <= k).length / n;
  const mrr = rs.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n;
  return { n: rs.length, hit1: +at(1).toFixed(3), hit5: +at(5).toFixed(3), [`hit${K}`]: +at(K).toFixed(3), mrr: +mrr.toFixed(3) };
}

const overall = metrics(rows);
const byKind: Record<string, ReturnType<typeof metrics>> = {};
for (const kind of [...new Set(rows.map((r) => r.kind))]) byKind[kind] = metrics(rows.filter((r) => r.kind === kind));
const answeredByKind: Record<string, number> = {};
for (const r of rows) if (r.answeredBy) answeredByKind[r.answeredBy.kind] = (answeredByKind[r.answeredBy.kind] ?? 0) + 1;

const st = await stats().catch(() => null);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`\nMemory grounding eval — ${rows.length} questions, top ${K}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (st) console.log(`memory: ${st.total} chunks in ${st.store}, embedder ${st.embedder}${st.stale ? " (STALE — words only)" : ""}`);
console.log(`\n  overall      hit@1 ${pct(overall.hit1)}  hit@5 ${pct(overall.hit5)}  hit@${K} ${pct((overall as any)[`hit${K}`])}  MRR ${overall.mrr.toFixed(3)}`);
for (const [kind, m] of Object.entries(byKind))
  console.log(`  ${kind.padEnd(13)}n=${String(m.n).padEnd(3)} hit@1 ${pct(m.hit1).padStart(6)}  hit@5 ${pct(m.hit5).padStart(6)}  MRR ${m.mrr.toFixed(3)}`);
console.log(`\n  answered by chunk kind: ${Object.entries(answeredByKind).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
const missed = rows.filter((r) => r.rank === null);
if (missed.length) console.log(`  not answered in top ${K}: ${missed.map((r) => r.id).join(", ")}`);

for (const r of rows.slice(0, show)) {
  console.log(`\n${r.id} [${r.kind}] ${r.q}\n  → ${r.rank ? `answered at #${r.rank} by ${r.answeredBy!.kind} (${r.answeredBy!.source})` : "NOT answered"}`);
  r.top.slice(0, 3).forEach((h, i) => console.log(`  #${i + 1} ${h.kind} [${h.source}] ${h.score}  ${h.text.slice(0, 160)}`));
}

const outDir = join(ROOT, "data", "evals", "results");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = join(outDir, `memory-${label}-${stamp}.json`);
writeFileSync(out, JSON.stringify({ label, at: new Date().toISOString(), k: K, memory: st, overall, byKind, answeredByKind, rows }, null, 1));
console.log(`\nsaved ${out}`);
await closeSpineDb();
