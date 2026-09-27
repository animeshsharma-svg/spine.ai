import { Pool } from "pg";

/**
 * THE ROWS BEHIND THE SCREEN.
 *
 * The browser suite already talks to this database to mint sessions
 * (`multiClient.ts`). These two reads are for something else: confirming that
 * an event a journey published through the UI actually landed as rows — the
 * same DB-as-oracle check the API framework runs, asked from the other side.
 *
 * Read-only, and deliberately tiny. The queries mirror
 * `procol test/src/db/verify.ts` exactly, because the two suites must agree
 * about what "the event is in the database" means; two different queries would
 * eventually disagree and nobody would know which to believe.
 *
 * A separate pool from `multiClient.ts`'s on purpose: that one is opened for
 * logins at the start of a run and closed with them, and a verification that
 * runs at the end must not depend on whether it is still open.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error("DATABASE_URL not set");
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 2 });
  }
  return pool;
}

export async function closeVerifyDb(): Promise<void> {
  await pool?.end().catch(() => {});
  pool = null;
}

export interface DbEventGroup {
  id: number;
  title: string;
  status: string;
  company_id: number;
}

export async function eventGroupByTitle(title: string): Promise<DbEventGroup | undefined> {
  const { rows } = await db().query<DbEventGroup>(
    `select id, title, status, company_id
     from event_groups where title = $1 order by created_at desc limit 1`,
    [title],
  );
  return rows[0];
}

export interface DbTrade {
  id: number;
  stage_no: number;
  rfx_mode: string;
  status: string;
}

export async function tradesOfEventGroup(eventGroupId: number): Promise<DbTrade[]> {
  const { rows } = await db().query<DbTrade>(
    `select id, stage_no, rfx_mode, status
     from trade_requests where event_group_id = $1 order by stage_no`,
    [eventGroupId],
  );
  return rows;
}
