/**
 * spine.ai's OWN database — memory, run history and (from phase 1) the product
 * model. Local Postgres 17 + pgvector for now, a hosted Postgres later; the
 * address is SPINE_DB_URL in prototype/.env either way.
 *
 * Not Procol's database. That one is DATABASE_URL in `procol test/.env`, read
 * through its own SELECT-only pool, and nothing here ever connects to it.
 *
 * Optional by design: with no SPINE_DB_URL, or with Postgres not running, every
 * caller gets `null` from `spineDb()` and falls back to what it did before (the
 * JSON memory file, run records on disk). The platform never refuses to start
 * because this database is down.
 */
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
loadEnv({ path: join(ROOT, ".env") });

const MIGRATIONS_DIR = join(ROOT, "db", "migrations");

let pool: pg.Pool | null | undefined;
let ready: Promise<boolean> | undefined;
let warned = false;

function url(): string | undefined {
  return process.env.SPINE_DB_URL?.trim() || undefined;
}

function makePool(): pg.Pool | null {
  const u = url();
  if (!u) return null;
  const p = new pg.Pool({ connectionString: u, max: 6, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 4_000 });
  // An idle client dying (Postgres restarted) must not crash the server.
  p.on("error", (e) => console.warn(`[spine-db] idle connection error: ${e.message}`));
  return p;
}

/**
 * The pool, or null when the database is not configured or not reachable.
 * Reachability is checked once per process (a `select 1`), then trusted.
 */
export async function spineDb(): Promise<pg.Pool | null> {
  if (pool === undefined) pool = makePool();
  if (!pool) return null;
  ready ??= pool
    .query("select 1")
    .then(() => true)
    .catch((e) => {
      if (!warned) {
        warned = true;
        console.warn(`[spine-db] SPINE_DB_URL is set but Postgres is not reachable (${(e as Error).message}) — using the file fallbacks`);
      }
      return false;
    });
  return (await ready) ? pool : null;
}

/** Apply every migration in db/migrations that has not been applied yet, in name order. */
export async function migrate(): Promise<{ applied: string[]; already: string[] }> {
  const db = await spineDb();
  if (!db) throw new Error("SPINE_DB_URL is not set, or Postgres is not running.");
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: string }>("select version from schema_migrations")).rows.map((r) => r.version));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  const already: string[] = [];
  for (const f of files) {
    if (done.has(f)) {
      already.push(f);
      continue;
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
      await client.query("COMMIT");
      applied.push(f);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  return { applied, already };
}

/** pgvector's text form: [0.1,0.2,…] */
export function toVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

export async function closeSpineDb(): Promise<void> {
  if (pool) await pool.end().catch(() => {});
  pool = undefined;
  ready = undefined;
}
