/**
 * The memory, kept in spine.ai's Postgres (memory_chunks) instead of one JSON
 * file. knowledgeBase.ts decides WHAT goes in and how results are scored; this
 * file only stores chunks and finds candidates for a query.
 *
 * Two things the file store could not do:
 *   - incremental builds: a chunk whose text has not changed is not embedded
 *     again (content_hash), so a rebuild after adding one PRD costs one PRD's
 *     worth of embedding calls, not the whole corpus.
 *   - indexed search: candidates come from an HNSW index (meaning) and a GIN
 *     index (words) instead of scoring every chunk in memory.
 *
 * The final score is still computed in knowledgeBase.ts with the same hybrid
 * rule as before (0.75 meaning + 0.25 word overlap), so answers do not change
 * character just because the storage did.
 */
import { createHash } from "node:crypto";
import type pg from "pg";
import { toVector } from "../db/spineDb.js";
import type { Chunk, ChunkKind } from "./knowledgeBase.js";

/** Which column holds this embedder's vectors, and how long they must be. */
function columnFor(embedder: string): { col: "embedding" | "embedding_small"; dims: number } {
  return embedder.startsWith("slingring:") ? { col: "embedding", dims: 1536 } : { col: "embedding_small", dims: 384 };
}

export function chunkHash(c: Chunk): string {
  return createHash("sha256")
    .update(JSON.stringify([c.kind, c.module ?? null, c.source, c.labels ?? [], c.text]))
    .digest("hex");
}

export interface SyncResult {
  chunks: number;
  embedded: number;
  removed: number;
  dims: number;
}

/**
 * Make memory_chunks hold exactly `chunks`: insert new ones, re-embed changed
 * ones (or ones never embedded with the current embedder), delete ones whose
 * source is gone. One transaction for the writes, so a failed build leaves the
 * previous memory intact rather than half of each.
 */
export async function syncChunks(
  db: pg.Pool,
  chunks: Chunk[],
  embedder: string,
  embedMany: (texts: string[]) => Promise<number[][]>,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  const t0 = Date.now();
  const { col, dims } = columnFor(embedder);
  // Duplicate ids would make the upsert touch one row twice; the last one wins.
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const wanted = [...byId.values()];

  const existing = new Map<string, { hash: string; has: boolean; with: string | null }>();
  const rows = await db.query<{ id: string; content_hash: string; has: boolean; embedded_with: string | null }>(
    `SELECT id, content_hash, (${col} IS NOT NULL) AS has, embedded_with FROM memory_chunks`,
  );
  for (const r of rows.rows) existing.set(r.id, { hash: r.content_hash, has: r.has, with: r.embedded_with });

  const hashes = new Map(wanted.map((c) => [c.id, chunkHash(c)]));
  const toEmbed = wanted.filter((c) => {
    const e = existing.get(c.id);
    return !e || e.hash !== hashes.get(c.id) || !e.has || e.with !== embedder;
  });

  // Embed first, outside the transaction: it is the slow, network-bound part.
  const vectors = new Map<string, number[]>();
  const BATCH = 64;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const slice = toEmbed.slice(i, i + BATCH);
    const vs = await embedMany(slice.map((c) => c.text));
    slice.forEach((c, j) => {
      if (vs[j]?.length !== dims) throw new Error(`embedder ${embedder} returned ${vs[j]?.length} dims for ${c.id}; the ${col} column holds ${dims}`);
      vectors.set(c.id, vs[j]);
    });
    onProgress?.(Math.min(i + BATCH, toEmbed.length), toEmbed.length);
  }

  const client = await db.connect();
  let removed = 0;
  try {
    await client.query("BEGIN");
    for (const c of wanted) {
      const v = vectors.get(c.id);
      const e = existing.get(c.id);
      if (!v && e && e.hash === hashes.get(c.id)) continue; // unchanged, already embedded
      await client.query(
        `INSERT INTO memory_chunks (id, kind, source, module, labels, text, content_hash, ${col}, embedded_with)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)
         ON CONFLICT (id) DO UPDATE SET
           kind = EXCLUDED.kind, source = EXCLUDED.source, module = EXCLUDED.module, labels = EXCLUDED.labels,
           text = EXCLUDED.text, content_hash = EXCLUDED.content_hash,
           ${col} = COALESCE(EXCLUDED.${col}, memory_chunks.${col}),
           embedded_with = COALESCE(EXCLUDED.embedded_with, memory_chunks.embedded_with),
           updated_at = now()`,
        [c.id, c.kind, c.source, c.module ?? null, c.labels ?? [], c.text, hashes.get(c.id), v ? toVector(v) : null, v ? embedder : null],
      );
    }
    const gone = await client.query(`DELETE FROM memory_chunks WHERE NOT (id = ANY($1::text[]))`, [wanted.map((c) => c.id)]);
    removed = gone.rowCount ?? 0;
    await client.query(
      `INSERT INTO memory_builds (embedder, chunks, embedded, removed, duration_ms) VALUES ($1, $2, $3, $4, $5)`,
      [embedder, wanted.length, toEmbed.length, removed, Date.now() - t0],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { chunks: wanted.length, embedded: toEmbed.length, removed, dims };
}

export interface Candidate {
  source: string;
  kind: ChunkKind;
  module?: string;
  labels?: string[];
  text: string;
  /** cosine similarity to the query, 0 when there is no query vector */
  dense: number;
}

/**
 * Candidates for one query: the nearest chunks by meaning plus the chunks that
 * contain the query's words, scoped by kind/module. `queryVec` null means
 * words only (the embedder in use did not build the memory).
 */
export async function candidates(
  db: pg.Pool,
  embedder: string,
  queryVec: number[] | null,
  terms: string[],
  opts: { kinds?: ChunkKind[]; module?: string },
  limit: number,
): Promise<Candidate[]> {
  const { col } = columnFor(embedder);
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const scope: string[] = [];
  if (opts.kinds?.length) scope.push(`kind = ANY(${p(opts.kinds)}::text[])`);
  if (opts.module) scope.push(`module = ${p(opts.module)}`);
  const where = scope.length ? `WHERE ${scope.join(" AND ")}` : "";
  const and = scope.length ? `AND ${scope.join(" AND ")}` : "";

  const vec = queryVec ? p(toVector(queryVec)) : null;
  // Each term quoted, so identifiers like buyer_hub or BE-2.1 are matched as
  // phrases and websearch syntax can never make the query fail.
  const tsq = terms.length ? p(terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ")) : null;
  const lim = p(limit);

  const parts: string[] = [];
  if (vec) parts.push(`(SELECT id FROM memory_chunks ${where} ${where ? "AND" : "WHERE"} ${col} IS NOT NULL ORDER BY ${col} <=> ${vec}::vector LIMIT ${lim})`);
  if (tsq)
    parts.push(
      `(SELECT id FROM memory_chunks WHERE tsv @@ websearch_to_tsquery('simple', ${tsq}) ${and}
         ORDER BY ts_rank(tsv, websearch_to_tsquery('simple', ${tsq})) DESC LIMIT ${lim})`,
    );
  // No vector and no usable words: fall back to the scope itself.
  if (!parts.length) parts.push(`(SELECT id FROM memory_chunks ${where} LIMIT ${lim})`);

  const sql = `
    SELECT c.source, c.kind, c.module, c.labels, c.text,
           ${vec ? `COALESCE(1 - (c.${col} <=> ${vec}::vector), 0)` : "0"} AS dense
      FROM memory_chunks c
     WHERE c.id IN (${parts.join(" UNION ")})`;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // pgvector 0.8: keep walking the index when a kind/module filter drops rows,
    // so a scoped search still returns `limit` candidates.
    await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
    await client.query("SET LOCAL hnsw.ef_search = 200");
    const r = await client.query(sql, params);
    await client.query("COMMIT");
    return r.rows.map((x: any) => ({
      source: x.source,
      kind: x.kind,
      module: x.module ?? undefined,
      labels: x.labels ?? [],
      text: x.text,
      dense: Number(x.dense),
    }));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function memoryStats(db: pg.Pool): Promise<{
  total: number;
  byKind: Record<string, number>;
  byModule: Record<string, number>;
  embedder: string;
  builtAt: string | null;
} | null> {
  const last = (await db.query(`SELECT embedder, built_at FROM memory_builds ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!last) return null;
  const byKind: Record<string, number> = {};
  const byModule: Record<string, number> = {};
  let total = 0;
  for (const r of (await db.query(`SELECT kind, module, count(*)::int AS n FROM memory_chunks GROUP BY 1, 2`)).rows) {
    total += r.n;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + r.n;
    if (r.module) byModule[r.module] = (byModule[r.module] ?? 0) + r.n;
  }
  return { total, byKind, byModule, embedder: last.embedder, builtAt: new Date(last.built_at).toISOString() };
}
