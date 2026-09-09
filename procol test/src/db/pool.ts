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
      max: 4,
    });
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
