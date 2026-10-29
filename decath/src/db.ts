import { createRequire } from "node:module";
import { databaseUrl } from "./config.js";

/**
 * PROCOL'S DATABASE, READ ONLY.
 *
 * What each PO really is (whose, shared with whom, a draft or not) comes from
 * here, so the lists on screen can be judged against it. Every query runs
 * inside a READ ONLY transaction that is rolled back.
 */
const require = createRequire(import.meta.url);

export async function readOnly<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { Client } = require("pg");
  const url = databaseUrl();
  if (!url) throw new Error("no DATABASE_URL (procol test/.env) — Procol's database is needed to know whose each PO is");
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000, query_timeout: 60_000 });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = await c.query(sql, params);
    return r.rows as T[];
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end().catch(() => {});
  }
}

export interface PoTruth {
  id: number;
  /** owner_id when the PO was amended (it then belongs to the amender), else its creator */
  owner: number;
  status: number;
  sharedUsers: number[];
}

/** Whose each of these PO records is, and who it is shared with. */
export async function poTruth(ids: number[]): Promise<Map<number, PoTruth>> {
  const rows = await readOnly<{ id: number; owner: number; status: number; shared: number[] | null }>(
    `select r.id, coalesce(r.owner_id, r.user_id)::int as owner, r.status,
            (select array_agg(a.shared_with_id) from access_lists a
              where a.item_type = 'FxResponse' and a.item_id = r.id and a.shared_with_type = 'User' and a.status = 1) as shared
       from fx_responses r where r.id = any($1)`,
    [ids],
  );
  return new Map(rows.map((r) => [Number(r.id), { id: Number(r.id), owner: Number(r.owner), status: Number(r.status), sharedUsers: (r.shared ?? []).map(Number) }]));
}
