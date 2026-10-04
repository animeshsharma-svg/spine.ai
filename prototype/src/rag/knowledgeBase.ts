/**
 * KNOWLEDGE BASE — the "memory" the AI reads before it plans.
 *
 * build():   read the knowledge docs + the flow catalog, chop them into chunks,
 *            embed each chunk, and save everything — to spine.ai's Postgres
 *            (memory_chunks, pgvector) when SPINE_DB_URL is reachable, else to
 *            one local file (data/vector-store.json), as before.
 * retrieve(): given a question, return the most relevant chunks by MEANING.
 *
 * This is real RAG (Retrieval-Augmented Generation): the agents look things up
 * in Procol's actual code/config/PRD instead of guessing.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { embedOne, embedMany, similarity, embedderId, ensureEmbedderReady } from "./embedder.js";
import { allCases } from "../checks/testCatalog.js";
import { spineDb } from "../db/spineDb.js";
import { syncChunks, candidates, memoryStats } from "./pgMemory.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const CATALOG_PATH = join(ROOT, "data", "catalog.json");
const STORE_PATH = join(ROOT, "data", "vector-store.json");
/**
 * The UI framework's Oracle writes findings here. Reading them back is what
 * turns a test runner into something with a memory: a defect found in March is
 * still retrievable in September, so the planner can probe it again on purpose.
 */
const FINDINGS_DIR = join(ROOT, "..", "procol-ui-tests", "findings");
/** Step-by-step outcomes of previously compiled plans. */
const PLANS_DIR = join(ROOT, "..", "procol-ui-tests", ".plans");

/**
 * What a chunk IS, not just what it says.
 *
 * The architecture calls for two kinds of memory and they must not be mixed at
 * retrieval time. Static knowledge ("what should happen") is authored: docs,
 * the flow catalog, and the mined test-case catalogs. Experience ("what did
 * happen") is earned: findings from previous runs. Asking for one and getting
 * the other is how a planner ends up testing last week's bug report instead of
 * this week's feature — so every chunk is tagged and retrieval can be scoped.
 */
export type ChunkKind =
  | "doc"
  | "flow"
  | "test-case"
  | "api-contract"
  | "experience"
  // added 2026-10-03 (migration 008) — each its own kind so a caller can ask for exactly one:
  | "product-fact" // one cited fact of the product model / one client's templates, fields, units, settings
  | "error-code" // one backend error code: message, HTTP status, where it is raised
  | "access-rule" // which app (buyer web console / vendor website) may call which API
  | "backend-code" // per-action/model/service digest of the event backend (knowledge/events/backend-digest, doc-vs-code.md)
  | "frontend-code" // per-screen digest of the buyer console's event screens (knowledge/events/frontend-digest; migration 021)
  | "known-bug" // one verified Procol defect (docs/bugs/*.xlsx)
  | "lesson"; // one hard-won domain rule (knowledge/lessons)

/** What SHOULD happen — authored or read from code. */
export const KNOWLEDGE_KINDS: ChunkKind[] = [
  "test-case",
  "api-contract",
  "doc",
  "flow",
  "product-fact",
  "error-code",
  "access-rule",
  "backend-code",
  "frontend-code",
  "lesson",
];
/**
 * Facts read from Procol's code/data (not test cases, not prose) — what the
 * assistant should cite when it explains WHY something happens.
 */
export const FACT_KINDS: ChunkKind[] = ["product-fact", "error-code", "access-rule", "backend-code", "frontend-code", "lesson", "known-bug"];
/** What HAS happened — earned by running: plan/finding/track-record experience and verified bugs. */
export const EXPERIENCE_KINDS: ChunkKind[] = ["experience", "known-bug"];

export interface Chunk {
  id: string;
  source: string; // which document/flow it came from
  kind: ChunkKind;
  /** Product module, when known — "events", "boq", "bids". */
  module?: string;
  /** Free-form handles for filtering: severity, area, tags, case id. */
  labels?: string[];
  text: string;
  embedding?: number[];
}
export interface Retrieved {
  source: string;
  kind: ChunkKind;
  module?: string;
  labels?: string[];
  text: string;
  score: number;
}

export interface RetrieveOptions {
  /** Restrict to these kinds — e.g. ["test-case"] to plan, ["experience"] to recall. */
  kinds?: ChunkKind[];
  /** Restrict to one product module. */
  module?: string;
}

/**
 * SPINE_RAG_LEGACY=1 builds the memory as it was before 2026-10-03 (docs, flows,
 * test cases, plans, findings only) — a measuring switch, so the grounding eval
 * can tell what the new kinds add from what a refreshed corpus adds.
 */
const LEGACY = process.env.SPINE_RAG_LEGACY === "1";

// ── 1. Gather the raw text from every knowledge source ────────────────────
function gatherChunks(): Chunk[] {
  const chunks: Chunk[] = [];

  // (a) every markdown doc under knowledge/, at any depth, split by heading.
  //     Recursion matters: the mined catalogs live in knowledge/events/, and a
  //     flat readdir silently indexed none of them.
  for (const file of walk(KNOWLEDGE_DIR, ".md")) {
    const raw = readFileSync(file, "utf8");
    const src = relSource(file);
    const module = moduleOf(file);
    // The backend digest and the lessons are written one self-contained
    // section per rule, so each part of a long section keeps its heading
    // (a part without it would not say which action or rule it is about).
    // doc-vs-code.md states, per product-doc claim, what the CODE does (cited) — a code fact.
    const kind: ChunkKind =
      src.startsWith("events/backend-digest/") || src === "events/doc-vs-code.md"
        ? "backend-code"
        : src.startsWith("events/frontend-digest/")
          ? "frontend-code"
          : src.startsWith("lessons/")
            ? "lesson"
            : "doc";
    if (kind !== "doc" && LEGACY) continue;
    const parts = kind === "doc" ? splitMarkdown(raw) : splitMarkdownWithHeadings(raw);
    parts.forEach((text, i) => {
      chunks.push({ id: `${src}#${i}`, source: src, kind, module: kind === "lesson" ? "events" : module, text });
    });
  }

  // (a2) the mined test-case catalogs: ONE CHUNK PER CASE.
  //      A 150-case markdown table embedded as prose retrieves as a blur; each
  //      case embedded on its own can be pulled up by name, area or oracle,
  //      which is what makes "what should I test on the events module" answerable.
  for (const file of walk(KNOWLEDGE_DIR, ".json")) {
    const src = relSource(file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue; // a half-written catalog should not break the whole build
    }
    if (!Array.isArray(parsed)) continue;
    for (const c of parsed as Array<Record<string, any>>) {
      const text = caseToText(c);
      if (!text) continue;
      chunks.push({
        id: `${src}:${c.id ?? chunks.length}`,
        source: src,
        kind: /api-contract/.test(src) ? "api-contract" : c.pr ? "experience" : "test-case",
        module: c.module ?? moduleOf(file),
        labels: [c.id, c.area, c.severity, ...(c.tags ?? [])].filter(Boolean),
        text,
      });
    }
  }

  // (a3) THE WRITTEN CATALOG — 648 humanised cases, one chunk per case.
  //      This is the richest statement of what SHOULD happen that the platform
  //      has: unlike the mined JSON, each case says why it matters and how to
  //      tell whether it worked, in the words of the person who wrote it. It
  //      lives in `data/`, not `knowledge/`, because it is derived from
  //      `test-cases/*.md` — so it needs its own pass rather than the walk.
  for (const c of allCases()) {
    // PRD-* cases come from the product workbook (test-cases/product-*.md) and
    // span the whole procure-to-pay product, not the events module — tagging
    // them "events" would flood events-scoped recall with vendor/PO/invoice
    // cases. They share the "product" module with knowledge/product/*.md.
    const product = c.id.startsWith("PRD-");
    chunks.push({
      id: `catalog:${c.id}`,
      source: product ? `test-cases/product (${c.group})` : `test-cases/events-${c.layer}.md`,
      kind: "test-case",
      module: product ? "product" : "events",
      labels: [c.id, c.group, c.priority, c.verdict, c.layer, ...(c.gate ? [c.gate] : [])],
      text:
        `${c.id} (${c.layer.toUpperCase()}, ${c.section}) — ${c.title}. ` +
        `Why it matters: ${c.why} ` +
        (c.setup ? `Setup: ${c.setup} ` : "") +
        `Steps: ${c.steps} ` +
        `Expected: ${c.expected} ` +
        (c.oracle ? `How to tell: ${c.oracle} ` : "") +
        `[${c.priority}, ${c.verdict}${c.gate ? `, gated on ${c.gate}` : ""}]`,
    });
  }

  // (b2) EXPERIENCE: how previous PLANS fared, step by step.
  //      A finding says what broke; a plan result says how far a test of this
  //      shape got and which step stopped it. That is what lets the compiler
  //      learn that, say, a two-stage plan needs a template per tab — the
  //      evidence is in the step that failed, not in the defect report.
  for (const file of walk(PLANS_DIR, "-result.json")) {
    let r: Record<string, any>;
    try {
      r = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(r.steps)) continue;
    const failed = r.steps.find((s: any) => s.status === "failed");
    const sequence = r.steps.map((s: any) => s.step).join(" -> ");
    chunks.push({
      id: `plan:${basename(file)}`,
      source: `plan/${r.title ?? "untitled"}`,
      kind: "experience",
      module: "events",
      labels: [r.passed ? "passed" : "failed", failed?.step].filter(Boolean),
      text:
        `PREVIOUS PLAN "${r.title}" ${r.passed ? "passed" : "FAILED"}. Steps: ${sequence}. ` +
        (failed ? `It stopped at "${failed.step}": ${failed.detail}. ` : "") +
        (r.verdict?.rationale ? `Verdict: ${r.verdict.rationale}` : ""),
    });
  }

  // (c) EXPERIENCE: what previous runs actually found. Written by the UI
  //     framework's Oracle, so the platform remembers its own history.
  for (const file of walk(FINDINGS_DIR, ".json")) {
    if (basename(file).startsWith("run-")) continue; // index files, not findings
    let f: Record<string, any>;
    try {
      f = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!f.title) continue;
    const http = (f.evidence?.httpFailures ?? [])
      .map((h: any) => `${h.method} ${h.path} -> ${h.status}`)
      .join("; ");
    const toasts = (f.evidence?.toasts ?? []).map((t: any) => t.text).join(" | ");
    chunks.push({
      id: `finding:${f.fingerprint ?? f.id}`,
      source: `finding/${f.flowKey}`,
      kind: "experience",
      module: f.flowKey?.split(".")[0],
      labels: [f.kind, f.severity, f.fingerprint].filter(Boolean),
      text:
        `PREVIOUS FINDING (${f.kind}, ${f.severity}) on flow ${f.flowKey}: ${f.title}. ` +
        `${f.rationale} ` +
        (http ? `Failing calls: ${http}. ` : "") +
        (toasts ? `App messages: ${toasts}. ` : "") +
        (f.reproduction?.length ? `Steps observed: ${f.reproduction.join(" -> ")}` : ""),
    });
  }

  // (b) the flow catalog — one chunk per flow (rich, self-describing)
  if (existsSync(CATALOG_PATH)) {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
    for (const f of catalog.flows) {
      const inputs = (f.notableInputs ?? [])
        .map((n: any) => `Input "${n.field}": ${n.rule} ${n.knownQuirk ?? ""}`)
        .join(" ");
      chunks.push({
        id: `catalog:${f.id}`,
        source: "catalog.json",
        kind: "flow",
        module: f.category,
        text: `Flow ${f.id} [${f.category}] — ${f.name}. ${f.description} Config switch: ${f.configSwitch}. DB-verified: ${f.verifiedInDb}. ${inputs}`.trim(),
      });
    }
  }
  return chunks;
}

/**
 * Terms worth matching literally: long-ish words, snake_case identifiers and
 * case ids. Common English is dropped — matching "the" helps nobody.
 */
const STOP = new Set(
  "the a an and or of to in on for with is are was were be been it this that at by from as if then than so no not".split(" "),
);

function lexicalTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9_.:-]+/)
        .filter((t) => t.length > 2 && !STOP.has(t)),
    ),
  ];
}

/** How much of the query's vocabulary this chunk actually contains, 0..1. */
function lexicalOverlap(queryTerms: string[], chunk: Chunk): number {
  if (!queryTerms.length) return 0;
  const hay = (chunk.text + " " + (chunk.labels ?? []).join(" ") + " " + chunk.source).toLowerCase();
  let hits = 0;
  for (const t of queryTerms) {
    if (!hay.includes(t)) continue;
    // An identifier or a case id matching is worth more than a common word:
    // it is far less likely to be a coincidence.
    hits += /[_:.]|\d/.test(t) || t.length > 8 ? 1.5 : 1;
  }
  return Math.min(1, hits / queryTerms.length);
}

/** Every file under `dir` with the given extension, at any depth. */
function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out.sort();
}

/** knowledge/events/frontend-test-cases.md -> "events/frontend-test-cases.md" */
function relSource(file: string): string {
  const i = file.indexOf(`${KNOWLEDGE_DIR}/`);
  return i === 0 ? file.slice(KNOWLEDGE_DIR.length + 1) : basename(file);
}

/** The directory under knowledge/ doubles as the module name. */
function moduleOf(file: string): string | undefined {
  const rel = relSource(file);
  return rel.includes("/") ? rel.split("/")[0] : undefined;
}

/** Render one structured test case as the sentence a retriever can match on. */
function caseToText(c: Record<string, any>): string {
  const parts: string[] = [];
  if (c.id) parts.push(`[${c.id}]`);
  if (c.area) parts.push(`(${c.area})`);
  if (c.title) parts.push(c.title);
  if (c.symptom) parts.push(`Symptom: ${c.symptom}.`);
  if (c.root_cause) parts.push(`Root cause: ${c.root_cause}.`);
  if (c.preconditions?.length) parts.push(`Given: ${c.preconditions.join("; ")}.`);
  if (c.request) parts.push(`Request: ${c.request.method} ${c.request.path}.`);
  if (c.steps?.length) parts.push(`Steps: ${c.steps.join(" -> ")}.`);
  if (c.regression_case?.steps?.length) parts.push(`Steps: ${c.regression_case.steps.join(" -> ")}.`);
  const expected = c.expected?.shape ?? c.expected ?? c.regression_case?.expected;
  if (expected) parts.push(`Expected: ${typeof expected === "string" ? expected : JSON.stringify(expected)}.`);
  if (c.oracle?.detail) parts.push(`Oracle (${c.oracle.kind}): ${c.oracle.detail}.`);
  if (c.gates?.length) parts.push(`Gated by: ${c.gates.join(", ")}.`);
  if (c.severity) parts.push(`Severity: ${c.severity}.`);
  if (c.source?.length) parts.push(`Source: ${c.source.join(", ")}.`);
  const text = parts.join(" ").trim();
  return text.length > 20 ? text : "";
}

/** Split markdown into readable chunks: by heading, then cap long sections. */
function splitMarkdown(raw: string, maxChars = 1100): string[] {
  const sections = raw.split(/\n(?=#{1,3}\s)/); // keep headings with their body
  const out: string[] = [];
  for (const sec of sections) {
    const s = sec.trim();
    if (!s) continue;
    if (s.length <= maxChars) {
      out.push(s);
      continue;
    }
    // long section → split by paragraphs, packing up to maxChars
    let buf = "";
    for (const para of s.split(/\n\s*\n/)) {
      if ((buf + "\n\n" + para).length > maxChars && buf) {
        out.push(buf.trim());
        buf = para;
      } else {
        buf = buf ? buf + "\n\n" + para : para;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

/**
 * Split by `##`/`###` heading; every chunk starts with its heading line, and a
 * section longer than maxChars is packed by paragraph with the heading repeated
 * on each part. A heading with no body (a title, "## Error codes …") is not a
 * chunk of its own.
 */
function splitMarkdownWithHeadings(raw: string, maxChars = 1400): string[] {
  const out: string[] = [];
  for (const sec of raw.split(/\n(?=#{2,3}\s)/)) {
    const s = sec.trim();
    if (!s) continue;
    if (!s.split("\n").slice(1).join("\n").trim()) continue; // heading only
    if (s.length <= maxChars) {
      out.push(s);
      continue;
    }
    const nl = s.indexOf("\n");
    const heading = nl > 0 ? s.slice(0, nl).replace(/^#+\s*/, "") : "";
    const body = nl > 0 ? s.slice(nl + 1) : s;
    let buf = "";
    let part = 1;
    const flush = () => {
      if (!buf.trim()) return;
      out.push(`${heading}${part > 1 ? ` (continued ${part})` : ""}\n${buf.trim()}`);
      part++;
      buf = "";
    };
    for (const para of body.split(/\n(?=\s*\n)|\n(?=\d+\.\s|- )/)) {
      if ((buf + "\n" + para).length > maxChars - heading.length && buf) flush();
      buf = buf ? buf + "\n" + para : para;
    }
    flush();
  }
  return out;
}

/**
 * Every chunk the memory should hold right now: the markdown/JSON/catalog/plan/
 * finding chunks plus the structured sources (product model, error codes, app
 * access, verified bugs, run track record — each optional, never fatal).
 * Nothing is embedded here, so it is cheap to call for a dry count.
 */
export async function gatherAll(): Promise<{ chunks: Chunk[]; byKind: Record<string, number>; notes: string[] }> {
  const chunks = gatherChunks();
  const { structuredChunks } = await import("./sources.js");
  const extra = LEGACY ? { chunks: [], notes: ["SPINE_RAG_LEGACY=1 — structured sources, backend digest and lessons left out"] } : await structuredChunks();
  chunks.push(...extra.chunks);
  const byKind: Record<string, number> = {};
  for (const c of chunks) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  return { chunks, byKind, notes: extra.notes };
}

// ── 2. Build & save the index ─────────────────────────────────────────────
export async function build(
  onProgress?: (done: number, total: number) => void,
): Promise<{
  chunks: number;
  dims: number;
  embedded?: number;
  removed?: number;
  store: "postgres" | "file";
  byKind: Record<string, number>;
  notes: string[];
}> {
  await ensureEmbedderReady();
  const { chunks, byKind, notes } = await gatherAll();
  const extra = { notes };
  const db = await spineDb();
  if (db) {
    // Incremental: only new or changed chunks are embedded.
    const r = await syncChunks(db, chunks, embedderId(), embedMany, onProgress);
    dbEmbedder = embedderId();
    return { chunks: r.chunks, dims: r.dims, embedded: r.embedded, removed: r.removed, store: "postgres", byKind, notes: extra.notes };
  }
  const embeddings = await embedMany(chunks.map((c) => c.text));
  chunks.forEach((c, i) => (c.embedding = embeddings[i]));
  writeFileSync(
    STORE_PATH,
    JSON.stringify({ builtAt: new Date().toISOString(), embedder: embedderId(), chunks }, null, 0),
  );
  cache = undefined;
  storeEmbedder = embedderId();
  return { chunks: chunks.length, dims: embeddings[0]?.length ?? 0, store: "file", byKind, notes: extra.notes };
}

// ── 3. Load & retrieve ────────────────────────────────────────────────────
let cache: Chunk[] | undefined;
/** The embedder that built the loaded store. A store from before this was
 *  recorded is assumed local, because local is all that existed then. */
let storeEmbedder = "";
let warnedMismatch = false;
function load(): Chunk[] {
  if (cache) return cache;
  if (!existsSync(STORE_PATH)) {
    throw new Error("Vector store not built yet — run `npm run rag:build` first.");
  }
  const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
  cache = parsed.chunks as Chunk[];
  storeEmbedder = parsed.embedder ?? "local:Xenova/all-MiniLM-L6-v2";
  return cache;
}

/**
 * True when the store was built by a different embedder than the one now in
 * use — e.g. the Slingring key was added after the last `rag:build`. Dense
 * scores are meaningless across that gap, so retrieval goes lexical-only and
 * the dashboard says to rebuild.
 */
export function embedderMismatch(): { stale: boolean; store: string; current: string } {
  // NOTE: call ensureEmbedderReady() first where a network round-trip is
  // acceptable; without it a broken gateway embedder still reads as "current".
  load();
  return { stale: storeEmbedder !== embedderId(), store: storeEmbedder, current: embedderId() };
}

/** The embedder the Postgres memory was last built with (cached per process). */
let dbEmbedder: string | undefined;
async function dbMemoryEmbedder(): Promise<string | null> {
  const db = await spineDb();
  if (!db) return null;
  if (dbEmbedder === undefined) {
    const r = await db.query(`SELECT embedder FROM memory_builds ORDER BY id DESC LIMIT 1`).catch(() => ({ rows: [] as any[] }));
    dbEmbedder = r.rows[0]?.embedder ?? "";
  }
  return dbEmbedder || null;
}

/**
 * Hybrid score, the same rule for both stores: meaning + word overlap, plus a
 * bonus when the chunk carries an IDENTIFIER the query names exactly (a case
 * id like API-BID-002, a bug id like BUG-07, a step key like eval_score).
 * Embeddings barely tell API-BID-002 from API-BID-010, and an exact id is the
 * one thing a person who types it certainly means.
 * Weights can be overridden for experiments (SPINE_RAG_LEX, SPINE_RAG_ID_BONUS).
 */
const envNumber = (name: string, fallback: number, min: number, max: number) => {
  const v = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
};
const LEX_WEIGHT = envNumber("SPINE_RAG_LEX", 0.25, 0, 1);
const ID_BONUS = envNumber("SPINE_RAG_ID_BONUS", 0.05, 0, 1);
function hybrid(dense: number, lexical: number, haveVector: boolean, idHit = false): number {
  const base = haveVector ? dense * (1 - LEX_WEIGHT) + lexical * LEX_WEIGHT : lexical;
  return base + (idHit ? ID_BONUS : 0);
}

/** Query terms that look like identifiers: letters and digits joined by - _ . (not plain words or bare numbers). */
function identifierTerms(queryTerms: string[]): string[] {
  return queryTerms.filter((t) => /[a-z]/.test(t) && (/\d/.test(t) || t.includes("_")) && /[-_.]/.test(t));
}
/** Does the chunk carry one of those identifiers as a whole token (labels first, then text)? */
function hasIdentifier(ids: string[], c: { labels?: string[]; text: string }): boolean {
  if (!ids.length) return false;
  const labels = (c.labels ?? []).map((l) => String(l).toLowerCase());
  const text = c.text.toLowerCase();
  return ids.some((id) => labels.includes(id) || new RegExp(`(^|[^a-z0-9_.-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9_-])`).test(text));
}

/** Top-k from Postgres: indexed candidates, then the same hybrid scoring as the file store. */
async function retrieveFromDb(query: string, k: number, opts: RetrieveOptions, built: string): Promise<Retrieved[]> {
  const db = (await spineDb())!;
  await ensureEmbedderReady();
  const stale = built !== embedderId();
  if (stale && !warnedMismatch) {
    warnedMismatch = true;
    console.warn(`[rag] the memory was built with ${built} but ${embedderId()} is now in use — retrieving by words only until \`npm run rag:build\``);
  }
  const q = stale ? null : await embedOne(query);
  const queryTerms = lexicalTerms(query);
  const ids = identifierTerms(queryTerms);
  const limit = Math.max(60, k * 8);
  let found = await candidates(db, built, q, queryTerms, opts, limit);
  // A scope that matches nothing falls back to everything, as the file store does.
  if (!found.length && (opts.kinds || opts.module)) found = await candidates(db, built, q, queryTerms, {}, limit);
  return found
    .map((c) => {
      const lexical = lexicalOverlap(queryTerms, { id: "", source: c.source, kind: c.kind, labels: c.labels, text: c.text });
      return { source: c.source, kind: c.kind, module: c.module, labels: c.labels, text: c.text, score: hybrid(c.dense, lexical, !!q, hasIdentifier(ids, c)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Return the top-k chunks most relevant (by meaning) to the query. */
export async function retrieve(query: string, k = 5, opts: RetrieveOptions = {}): Promise<Retrieved[]> {
  const built = await dbMemoryEmbedder();
  if (built) return retrieveFromDb(query, k, opts, built);
  const all = load();
  const pool = all.filter(
    (c) =>
      (!opts.kinds || opts.kinds.includes(c.kind ?? "doc")) &&
      (!opts.module || c.module === opts.module),
  );
  // A scope that matches nothing should fall back rather than return silence —
  // an empty retrieval reads to an agent as "there is nothing to know".
  const chunks = pool.length ? pool : all;
  await ensureEmbedderReady();
  const { stale } = embedderMismatch();
  if (stale && !warnedMismatch) {
    warnedMismatch = true;
    console.warn(`[rag] the memory was built with ${storeEmbedder} but ${embedderId()} is now in use — retrieving by words only until \`npm run rag:build\``);
  }
  // With a mismatched embedder the query vector is useless; skip the call and
  // let term overlap carry the whole score rather than blending in zeros.
  const q = stale ? null : await embedOne(query);
  const queryTerms = lexicalTerms(query);
  const ids = identifierTerms(queryTerms);
  return chunks
    .map((c) => {
      // Hybrid scoring. A 384-dimension sentence embedding is good at meaning
      // and bad at identifiers: "buyer_hub", "BE-2.1" and "event_groups" carry
      // almost no semantic signal but are exactly what someone searching for
      // them typed. Blending in literal term overlap means a query naming a
      // field or a case id actually finds it, while paraphrases still work.
      const lexical = lexicalOverlap(queryTerms, c);
      const idHit = hasIdentifier(ids, c);
      const dense = q ? similarity(q, c.embedding!) : 0;
      return {
        source: c.source,
        kind: c.kind ?? "doc",
        module: c.module,
        labels: c.labels,
        text: c.text,
        score: hybrid(dense, lexical, !!q, idHit),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * What the platform already knows about this module, split the two ways the
 * agents need it: what SHOULD happen, and what HAS happened before.
 */
export async function recall(
  query: string,
  module?: string,
  k = 6,
): Promise<{ expectations: Retrieved[]; experience: Retrieved[] }> {
  const [expectations, experience] = await Promise.all([
    retrieve(query, k, { kinds: KNOWLEDGE_KINDS, module }),
    retrieve(query, k, { kinds: EXPERIENCE_KINDS, module }),
  ]);
  return { expectations, experience };
}

/** Counts per kind, for the dashboard to show what the memory actually holds. */
export async function stats(): Promise<{
  total: number;
  byKind: Record<string, number>;
  byModule: Record<string, number>;
  embedder: string;
  stale: boolean;
  store: "postgres" | "file";
  builtAt?: string | null;
}> {
  const db = await spineDb();
  const fromDb = db ? await memoryStats(db).catch(() => null) : null;
  if (fromDb) {
    await ensureEmbedderReady();
    return { ...fromDb, stale: fromDb.embedder !== embedderId(), store: "postgres" };
  }
  const chunks = load();
  const byKind: Record<string, number> = {};
  const byModule: Record<string, number> = {};
  for (const c of chunks) {
    byKind[c.kind ?? "doc"] = (byKind[c.kind ?? "doc"] ?? 0) + 1;
    if (c.module) byModule[c.module] = (byModule[c.module] ?? 0) + 1;
  }
  const { stale } = embedderMismatch();
  return { total: chunks.length, byKind, byModule, embedder: storeEmbedder, stale, store: "file" };
}

export async function isBuilt(): Promise<boolean> {
  if (await dbMemoryEmbedder()) return true;
  return existsSync(STORE_PATH);
}
