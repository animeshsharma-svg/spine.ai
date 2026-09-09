/**
 * EMBEDDER — turns text into a list of numbers ("embedding") that captures its
 * meaning. Runs fully inside Node via Transformers.js (no server, no Docker,
 * ₹0). The model (~90MB) downloads once on first use and is then cached on disk.
 *
 * Two pieces of text with similar meaning get similar number-lists, which is
 * how retrieval finds relevant docs even when the words differ.
 */
import { pipeline, env } from "@xenova/transformers";
import { AI } from "../../config/settings.js";

// Allow the model to download once, then use the local cache.
env.allowLocalModels = true;

type Extractor = (text: string, opts: any) => Promise<{ data: Float32Array }>;
let extractor: Extractor | undefined;

async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    // "feature-extraction" = produce an embedding vector for the input text.
    extractor = (await pipeline(
      "feature-extraction",
      AI.embeddings.model,
    )) as unknown as Extractor;
  }
  return extractor;
}

/** Embed one string → a normalized vector (array of numbers). */
export async function embedOne(text: string): Promise<number[]> {
  const ex = await getExtractor();
  // mean-pool over tokens + normalize → a single unit-length vector, so cosine
  // similarity is just a dot product.
  const out = await ex(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

/** Embed many strings (sequentially — keeps memory low, fine for our corpus). */
export async function embedMany(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const t of texts) vectors.push(await embedOne(t));
  return vectors;
}

/** Cosine similarity for normalized vectors = dot product. */
export function similarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
