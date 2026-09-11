/**
 * EMBEDDER — turns text into a list of numbers ("embedding") that captures its
 * meaning. Two pieces of text with similar meaning get similar number-lists,
 * which is how retrieval finds relevant docs even when the words differ.
 *
 * Two implementations, chosen by what is available:
 *
 *   slingring  HACK26_TEXT_EMBED_3_LARGE via Procol's gateway — 3072 dims, and
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
import { pipeline, env } from "@xenova/transformers";
import { AI } from "../../config/settings.js";

env.allowLocalModels = true;

type Provider = "slingring" | "local";

export function embedProvider(): Provider {
  if (process.env.EMBEDDINGS_PROVIDER === "local") return "local";
  return process.env[AI.slingring.apiKeyEnvVar] ? "slingring" : "local";
}

/** A stable name for the embedder in use — stored alongside the vectors. */
export function embedderId(): string {
  return embedProvider() === "slingring"
    ? `slingring:${AI.slingring.models.embed}`
    : `local:${AI.embeddings.model}`;
}

// ── local ──────────────────────────────────────────────────────────────────
type Extractor = (text: string, opts: any) => Promise<{ data: Float32Array }>;
let extractor: Extractor | undefined;

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
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
async function slingringEmbed(texts: string[]): Promise<number[][]> {
  const key = process.env[AI.slingring.apiKeyEnvVar]!;
  const res = await fetch(`${AI.slingring.baseUrl}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: AI.slingring.models.embed, input: texts }),
  });
  if (!res.ok) throw new Error(`Slingring embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j: any = await res.json();
  const rows: Array<{ index: number; embedding: number[] }> = j.data ?? [];
  // The API may return rows out of order; put them back by index.
  const out: number[][] = new Array(texts.length);
  for (const r of rows) out[r.index] = normalise(r.embedding);
  return out;
}

function normalise(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

// ── public ─────────────────────────────────────────────────────────────────
export async function embedOne(text: string): Promise<number[]> {
  if (embedProvider() === "slingring") return (await slingringEmbed([text]))[0];
  return localEmbedOne(text);
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
