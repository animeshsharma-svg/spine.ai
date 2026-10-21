/**
 * EMBEDDER — turns text into a list of numbers ("embedding") that captures its
 * meaning. Two pieces of text with similar meaning get similar number-lists,
 * which is how retrieval finds relevant docs even when the words differ.
 *
 * Two implementations, chosen by what is available:
 *
 *   slingring  HACK26_TEXT_EMBED_3_LARGE via Procol's gateway — asked for 1536
 *              dims (the API shortens its native 3072; see settings), and
 *              markedly better at the domain language ("savings column",
 *              "surrogate bid") than a small local model. Used when
 *              SLINGRING_API_KEY is set, unless EMBEDDINGS_PROVIDER=local.
 *   local      Xenova/all-MiniLM-L6-v2 in-process via Transformers.js — 384
 *              dims, ₹0, works offline. Downloads ~90MB once.
 *
 * The two produce vectors of DIFFERENT lengths that mean nothing to each
 * other, so every store records the embedder that built it (`embedderId()`)
 * and retrieval refuses to compare across a mismatch rather than returning
 * confident nonsense.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AI } from "../../config/settings.js";

type Provider = "slingring" | "local";

/**
 * Set the first time the gateway's embeddings endpoint fails for the process.
 * On 2026-09-11 HACK26_TEXT_EMBED_3_LARGE returned an upstream Azure auth
 * error with no fallback group — a gateway-side fault. Rather than crash the
 * build or, worse, index half the corpus with one embedder and half with
 * another, the whole process drops to local and `embedderId()` says so.
 */
let slingringEmbeddingsBroken = false;

export function embedProvider(): Provider {
  if (process.env.EMBEDDINGS_PROVIDER === "local") return "local";
  if (slingringEmbeddingsBroken) return "local";
  return process.env[AI.slingring.apiKeyEnvVar] ? "slingring" : "local";
}

/**
 * Check the gateway embedder actually works before anything is embedded, so
 * the decision is made once, up front, not halfway through a build.
 */
export async function ensureEmbedderReady(): Promise<string> {
  // Probed ONCE per process. Every retrieval used to call this, and every call
  // probed the gateway: a 91-case matcher eval made 91 extra requests and ran
  // into "429 Rate limit exceeded" a third of the way through (15 Oct).
  readyProbe ??= (async () => {
    if (embedProvider() === "slingring") {
      try {
        await slingringEmbed(["embedder readiness probe"]);
      } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        if (status === 429) {
          // Busy, not broken: each call backs off and retries. Switching the
          // whole process to the local model on a rate limit changed every
          // score after it, mid-run — the matcher's run-to-run swing.
          console.warn("[rag] Slingring embeddings are rate-limited right now — keeping them; each call backs off and retries");
        } else {
          slingringEmbeddingsBroken = true;
          console.warn(`[rag] Slingring embeddings unavailable (${(err as Error).message.slice(0, 140)}) — using the local embedder`);
        }
      }
    }
    return embedderId();
  })();
  return readyProbe;
}
let readyProbe: Promise<string> | undefined;

/** A stable name for the embedder in use — stored alongside the vectors. */
export function embedderId(): string {
  return embedProvider() === "slingring"
    ? `slingring:${AI.slingring.models.embed}@${AI.slingring.embedDims}`
    : `local:${AI.embeddings.model}`;
}

// ── local ──────────────────────────────────────────────────────────────────
type Extractor = (text: string, opts: any) => Promise<{ data: Float32Array }>;
let extractor: Extractor | undefined;

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    // Loaded on first use, not at import: the library pulls in `sharp`, a native module that
    // only works after its install script has built it. Importing it at the top crashed every
    // process that merely imported the memory (CI installs with --ignore-scripts, so the unit
    // tests failed on load) even when Slingring does the embedding and the local model is
    // never touched.
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = true;
    extractor = (await pipeline("feature-extraction", AI.embeddings.model)) as unknown as Extractor;
  }
  return extractor;
}

async function localEmbedOne(text: string): Promise<number[]> {
  const ex = await getExtractor();
  // mean-pool over tokens + normalize → a unit vector, so cosine is a dot product.
  const out = await ex(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

// ── slingring ──────────────────────────────────────────────────────────────
/**
 * OpenAI-shaped embeddings endpoint. The gateway accepts a batch, so the whole
 * corpus goes over in a few dozen requests instead of 1,200.
 */
async function slingringEmbedOnce(texts: string[]): Promise<Array<number[] | undefined>> {
  const key = process.env[AI.slingring.apiKeyEnvVar]!;
  // Bounded: a request the gateway never answered held a store rebuild for
  // 49 minutes on one open connection (15 Oct). A timeout is retried like a
  // dropped connection (no status) by slingringEmbed.
  const res = await fetch(`${AI.slingring.baseUrl}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: AI.slingring.models.embed, input: texts, dimensions: AI.slingring.embedDims }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = new Error(`Slingring embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const j: any = await res.json();
  if (j.error) throw new Error(`Slingring embeddings: ${String(j.error.message ?? j.error).slice(0, 200)}`);
  const rows: Array<{ index: number; embedding: number[] }> = j.data ?? [];
  // The API may return rows out of order; put them back by index. A batch can
  // also come back SHORT (seen 2026-10-01: one of 64 missing) — those slots
  // stay undefined and are retried by the caller.
  const out: Array<number[] | undefined> = new Array(texts.length);
  for (const r of rows) if (Array.isArray(r?.embedding) && r.embedding.length) out[r.index] = normalise(r.embedding);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One batch, with backoff on 429/5xx and the missing items retried one by one. */
async function slingringEmbed(texts: string[]): Promise<number[][]> {
  let out: Array<number[] | undefined> | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      out = await slingringEmbedOnce(texts);
      break;
    } catch (e) {
      // No status = the connection itself failed ("fetch failed: other side
      // closed", seen 2026-10-03 mid-build) — as retryable as a 5xx.
      const status = (e as { status?: number }).status ?? 0;
      if (attempt >= 5 || !(status === 0 || status === 429 || status >= 500)) throw e;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let attempt = 1; !out[i] && attempt <= 3; attempt++) {
      out[i] = (await slingringEmbedOnce([texts[i]]).catch(() => [undefined]))[0];
      if (!out[i]) await sleep(500 * attempt);
    }
    if (!out[i]) throw new Error(`Slingring embeddings returned no vector for input ${i} after retries: "${texts[i].slice(0, 80)}…"`);
  }
  if (!out.length && texts.length) throw new Error("Slingring embeddings returned no vectors");
  return out as number[][];
}

function normalise(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

// ── one text, one vector ───────────────────────────────────────────────────
/**
 * The gateway does not return the same vector twice for the same text, and the
 * matcher's SAME/PARTIAL thresholds sit where those small shifts flip the
 * answer: same code, same corpus, same store, an hour apart, new-case
 * detection read 40.0% then 93.3%, and memory hit@10 moved between 79.1% and
 * 85.2% (eval report, 15 Oct). So a query's vector is kept the first time it is
 * made and reused every time after — per embedder, so a vector is never
 * compared with a store built by another. Only the gateway's vectors are kept:
 * the local model already gives the same vector every time.
 *
 * Kept in data/embed-cache.jsonl (git-ignored), one line per text: a hash of
 * embedder + text, and the vector as base64 Float32. EMBED_CACHE=off asks the
 * gateway every time.
 */
const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "embed-cache.jsonl");
/** Lines kept when the file is compacted, newest first; it is compacted past MAX. */
const CACHE_KEEP = 15_000;
const CACHE_MAX = 20_000;
let cache: Map<string, number[]> | undefined;

const SLINGRING_ID = () => `slingring:${AI.slingring.models.embed}@${AI.slingring.embedDims}`;
function cacheKey(text: string): string {
  return createHash("sha1").update(`${SLINGRING_ID()}\n${text}`).digest("hex");
}
const encode = (v: number[]) => Buffer.from(new Float32Array(v).buffer).toString("base64");
const decode = (b64: string) => {
  const buf = Buffer.from(b64, "base64");
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
};

function loadCache(): Map<string, number[]> {
  if (cache) return cache;
  cache = new Map();
  try {
    if (!existsSync(CACHE_FILE)) return cache;
    const lines = readFileSync(CACHE_FILE, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const { k, v } = JSON.parse(line);
        if (typeof k === "string" && typeof v === "string") cache.set(k, decode(v));
      } catch {
        /* a torn line from an interrupted write: skipped */
      }
    }
    if (lines.length > CACHE_MAX) {
      const keep = [...cache.entries()].slice(-CACHE_KEEP);
      cache = new Map(keep);
      writeFileSync(CACHE_FILE, keep.map(([k, v]) => JSON.stringify({ k, v: encode(v) })).join("\n") + "\n");
    }
  } catch {
    /* no cache is a slower run, never a broken one */
  }
  return cache;
}

function remember(key: string, v: number[]): void {
  loadCache().set(key, v);
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    appendFileSync(CACHE_FILE, JSON.stringify({ k: key, v: encode(v) }) + "\n");
  } catch {
    /* kept for this process only */
  }
}

/** A gateway vector for one text: kept the first time, the same every time after. */
async function slingringOne(text: string): Promise<number[]> {
  if (process.env.EMBED_CACHE === "off") return (await slingringEmbed([text]))[0];
  const key = cacheKey(text);
  const kept = loadCache().get(key);
  if (kept) return kept;
  // Stored as Float32: hand back exactly what later reads will return.
  const v = decode(encode((await slingringEmbed([text]))[0]));
  remember(key, v);
  return v;
}

// ── public ─────────────────────────────────────────────────────────────────
export async function embedOne(text: string): Promise<number[]> {
  if (embedProvider() === "slingring") return slingringOne(text);
  return localEmbedOne(text);
}

/**
 * A QUERY'S VECTOR, MADE BY THE EMBEDDER THAT BUILT THE STORE IT IS COMPARED WITH.
 *
 * Retrieval compared against the store only when the process's current
 * embedder was the store's, and the current one could change mid-run: a store
 * built with the local model was searched by words only while the gateway
 * answered, and by meaning once a 429 flipped the process to local — 62 of 91
 * matcher rows changed between two identical runs (15 Oct). Now the store
 * decides: a local store is searched with local vectors (offline, the same
 * every time, no rate limit), a gateway store with cached gateway vectors.
 * Null when that embedder cannot be used here (a gateway store with no key, or
 * the gateway refusing): the caller searches by words and says so.
 */
export async function embedFor(storeEmbedder: string, text: string): Promise<number[] | null> {
  if (storeEmbedder === `local:${AI.embeddings.model}`) return localEmbedOne(text).catch(() => null);
  if (storeEmbedder === SLINGRING_ID()) {
    if (!process.env[AI.slingring.apiKeyEnvVar] || slingringEmbeddingsBroken) return null;
    return slingringOne(text).catch(() => null);
  }
  return null;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  if (embedProvider() === "slingring") {
    const out: number[][] = [];
    const BATCH = 64;
    for (let i = 0; i < texts.length; i += BATCH) {
      out.push(...(await slingringEmbed(texts.slice(i, i + BATCH))));
    }
    return out;
  }
  const vectors: number[][] = [];
  for (const t of texts) vectors.push(await localEmbedOne(t));
  return vectors;
}

/** Cosine similarity for normalized vectors = dot product. */
export function similarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0; // different embedders — no opinion
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
