/**
 * WHOSE DATA — the tenant context every query of the product tables runs in.
 *
 * The tables from migration 009 on carry `org_id`, and row-level security
 * (015) shows a transaction only the rows of the organisation it names:
 *
 *   withOrg(db, orgId, (c) => …)   a tenant request: one organisation's rows
 *   withService(db, (c) => …)      platform internals working across them
 *                                  (the run writer, backfill, reconcile, retention)
 *
 * Both open a transaction and set the context with set_config(…, true), so the
 * setting can never leak to the next user of a pooled connection.
 *
 * The dashboard has no sign-in yet, so it serves the default organisation
 * (SPINE_ORG, "procol" unless set). See docs/DATA_MODEL.md.
 */
import type pg from "pg";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** A pool or a checked-out client: anything with query(). */
export type Queryable = Pick<pg.Pool, "query"> | pg.PoolClient;

type Connectable = pg.Pool | { connect: () => Promise<pg.PoolClient> };

async function inTransaction<T>(db: Connectable, setup: (c: pg.PoolClient) => Promise<void>, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await setup(client);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Run `fn` in a transaction that sees only organisation `orgId`'s rows. */
export function withOrg<T>(db: Connectable, orgId: number, fn: (c: pg.PoolClient) => Promise<T>, actor?: string): Promise<T> {
  if (!Number.isInteger(orgId) || orgId <= 0) throw new Error(`withOrg: not an organisation id: ${orgId}`);
  return inTransaction(
    db,
    async (c) => {
      await c.query(`SELECT set_config('app.org_id', $1, true), set_config('app.actor', $2, true)`, [String(orgId), actor ?? ""]);
    },
    fn,
  );
}

/** Run `fn` in a transaction that works across organisations (platform internals only). */
export function withService<T>(db: Connectable, fn: (c: pg.PoolClient) => Promise<T>, actor = "platform"): Promise<T> {
  return inTransaction(
    db,
    async (c) => {
      await c.query(`SELECT set_config('app.role', 'service', true), set_config('app.actor', $1, true)`, [actor]);
    },
    fn,
  );
}

/** Inside an already-open transaction (the run writer's): switch it to service context. */
export async function enterService(c: Queryable, actor = "platform"): Promise<void> {
  await c.query(`SELECT set_config('app.role', 'service', true), set_config('app.actor', $1, true)`, [actor]);
}

export interface OrgContext {
  orgId: number;
  orgSlug: string;
  environmentId: number;
  environmentKey: string;
  timezone: string;
}

/** The default organisation and environment (SPINE_ORG / SPINE_ENV, "procol" / "uat"). Needs service or org context. */
export async function defaultContext(c: Queryable, orgSlug = process.env.SPINE_ORG?.trim() || "procol", envKey = process.env.SPINE_ENV?.trim() || "uat"): Promise<OrgContext> {
  const r = await c.query(
    `SELECT o.id AS org_id, o.slug, o.timezone, e.id AS env_id, e.key
       FROM organisations o JOIN environments e ON e.org_id = o.id AND e.key = $2
      WHERE o.slug = $1`,
    [orgSlug, envKey],
  );
  const x = r.rows[0];
  if (!x) throw new Error(`organisation "${orgSlug}" with environment "${envKey}" is not in spine.ai's database — run npm run db:migrate`);
  return { orgId: Number(x.org_id), orgSlug: x.slug, environmentId: Number(x.env_id), environmentKey: x.key, timezone: x.timezone };
}

/**
 * The target_companies row for a Procol company id, created when a run names a
 * company the database has not seen (never renamed here: a person may have
 * corrected the name). Returns its id.
 */
export async function ensureCompany(c: Queryable, ctx: OrgContext, procolCompanyId: number, name: string | null | undefined, seenAt?: string): Promise<number> {
  if (!Number.isInteger(procolCompanyId) || procolCompanyId <= 0) throw new Error(`not a Procol company id: ${procolCompanyId}`);
  const nm = (name ?? "").trim() || `Company ${procolCompanyId}`;
  const r = await c.query(
    `INSERT INTO target_companies (org_id, environment_id, procol_company_id, name, first_seen_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, environment_id, procol_company_id) DO UPDATE
       SET first_seen_at = least(coalesce(target_companies.first_seen_at, EXCLUDED.first_seen_at), EXCLUDED.first_seen_at),
           -- a placeholder name gives way to a real one
           name = CASE WHEN target_companies.name = 'Company ' || target_companies.procol_company_id AND EXCLUDED.name <> target_companies.name
                       THEN EXCLUDED.name ELSE target_companies.name END
     RETURNING id`,
    [ctx.orgId, ctx.environmentId, procolCompanyId, nm, seenAt ?? null],
  );
  return Number(r.rows[0].id);
}

/** The user id for a service identity or a person's address, or null when unknown. */
export async function userIdByEmail(c: Queryable, email: string): Promise<number | null> {
  const r = await c.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

// ── which code produced a run ──────────────────────────────────────────────

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let git: { sha: string | null; dirty: boolean | null; at: number } | undefined;

/** spine.ai's own git commit (re-read at most once a minute; bounded: 3 s, then unknown). */
export function spineGit(): { sha: string | null; dirty: boolean | null } {
  if (git && Date.now() - git.at < 60_000) return git;
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, timeout: 3000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    let dirty: boolean | null = null;
    try {
      const st = execFileSync("git", ["status", "--porcelain", "--untracked-files=no", "--", "prototype/src", "prototype/config"], {
        cwd: REPO,
        timeout: 3000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      dirty = st.trim().length > 0;
    } catch {
      /* unknown */
    }
    git = { sha: /^[0-9a-f]{7,40}$/.test(sha) ? sha : null, dirty, at: Date.now() };
  } catch {
    git = { sha: null, dirty: null, at: Date.now() };
  }
  return git;
}
