import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv();

/**
 * Read-only Postgres pool for the active environment's database.
 * Connection string comes from DATABASE_URL (gitignored .env / CI secret).
 * The framework only ever SELECTs — never writes to the shared UAT DB.
 */
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (see .env). Required for DB-driven client selection.");
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 20_000,
      // Client-side limits too: a socket that died (sleep, network change) must
      // fail fast instead of leaving a query waiting forever.
      connectionTimeoutMillis: 10_000,
      query_timeout: 30_000,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      max: 4,
    });
    // An idle connection that dies (ETIMEDOUT, network change) emits 'error' on
    // the pool; without a listener Node kills the whole run. The pool drops the
    // dead client by itself and the next query opens a fresh one.
    pool.on("error", (e) => console.warn(`[procol-db] idle connection dropped: ${e.message}`));
  }
  return pool;
}

/** Run a read-only query. */
export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
