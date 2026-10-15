import { Pool } from "pg";
import { CONST } from "../config.js";

/**
 * DB-session multi-client support. Mirrors the API framework's OTP-free auth:
 * a company's user has rows in `sessions` (web-console logins); we reuse the
 * most recent one's `access_token` to build the console access-token WITHOUT
 * logging in via OTP. Injecting that into the browser's localStorage logs the
 * UI in as ANY company — the core of running the suite for all clients.
 *
 * Read-only. Uses the same shared UAT DB as the API framework.
 */

let pool: Pool | null = null;
function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error("DATABASE_URL not set (copy from ../procol test/.env)");
    // Bounded: on 2026-10-14 Procol's UAT database accepted connections but
    // never finished the login for a few minutes, and a run with no limit here
    // sat on "starting the browser" with nothing said, then died. 20 s to
    // connect, 30 s per query; the caller is told why in plain words.
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 20_000, query_timeout: 30_000 });
    pool.on("error", (e) => console.warn(`[db] idle connection dropped: ${e.message}`));
  }
  return pool;
}

/** A database stall, said as one: the run cannot read a saved session to sign in with. */
function plainDbError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  return /timeout|timed out|ECONNREFUSED|ETIMEDOUT|terminated/i.test(msg)
    ? new Error(`Procol's database did not answer (${msg.split("\n")[0]}), so the run could not read a saved session to sign in with. It is usually a short stall on Procol's side — run it again in a minute.`)
    : e instanceof Error ? e : new Error(msg);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** A console session usable to mint a UI login token for a company. */
const CONSOLE_SESSION = `s.status = 1 and s.access_token is not null and s.app_version like '9.4%' and u.status = 1`;

export interface CompanyLogin {
  companyId: number;
  companyName: string | null;
  /** The fully-encoded value for localStorage `procol_access_token` (unquoted). */
  accessToken: string;
  appVersion: string;
  userId?: number | null;
  phone?: string | null;
  /**
   * True when the session belongs to a user from ANOTHER company who operates
   * this one (found through its trade requests), rather than to one of the
   * company's own users. The on-screen login says so, because "signing in as
   * PROCOL DEMO's user" would be untrue of an operator from a parent account.
   */
  viaOperator?: boolean;
}

function buildAccessToken(sessionAccessToken: string): string {
  // base64("appKey:appSecret:<session access_token>") — same shape the console stores.
  return Buffer.from(`${CONST.consoleKey}:${CONST.consoleSecret}:${sessionAccessToken}`).toString("base64");
}

/**
 * Resolve a login token for a company. Tries a direct console session; falls
 * back to the operator user found via the company's trade_requests (some
 * companies are operated by a user in a parent/support company).
 */
export async function resolveCompanyLogin(companyId: number): Promise<CompanyLogin | null> {
  try {
    return await resolveCompanyLoginRaw(companyId);
  } catch (e) {
    throw plainDbError(e);
  }
}

async function resolveCompanyLoginRaw(companyId: number): Promise<CompanyLogin | null> {
  const direct = await db().query(
    `select u.id, u.phone, s.access_token, s.app_version
     from sessions s join users u on u.id = s.user_id
     where u.company_id = $1 and ${CONSOLE_SESSION}
     order by s.created_at desc limit 1`,
    [companyId],
  );
  let row = direct.rows[0];
  let viaOperator = false;
  if (!row) {
    // The operator who actually works in this company — the one who made the
    // most of its events — then their newest usable session. Ordering by the
    // newest session alone picked whoever signed in last: on 14 Oct that was
    // an operator with 3 events here (Procol Support has 20,000+), whose
    // sign-in shows his own company, so the run saw Live 0 / History 0 /
    // Drafts 0 and could find no event at all.
    const op = await db().query(
      `select u.id, u.phone, s.access_token, s.app_version
       from (select user_id, count(*) as made from trade_requests where company_id = $1 group by user_id) tr
       join users u on u.id = tr.user_id
       join sessions s on s.user_id = u.id
       where ${CONSOLE_SESSION}
       order by tr.made desc, s.created_at desc limit 1`,
      [companyId],
    );
    row = op.rows[0];
    viaOperator = !!row;
  }
  if (!row) return null;
  const nameRow = await db().query(`select name from companies where id = $1`, [companyId]);
  return {
    companyId,
    companyName: nameRow.rows[0]?.name ?? null,
    accessToken: buildAccessToken(row.access_token),
    appVersion: row.app_version,
    userId: row.id ?? null,
    phone: row.phone ?? null,
    viaOperator,
  };
}

/** Companies that can be UI-logged-in (recent console session), most-recent first. */
export async function loginnableCompanies(limit = 15): Promise<{ companyId: number; companyName: string | null; sessions: number }[]> {
  const q = await db().query(
    `select u.company_id as "companyId", co.name as "companyName", count(distinct s.id)::int as sessions, max(s.created_at) as last
     from sessions s join users u on u.id = s.user_id and u.status = 1
     join companies co on co.id = u.company_id
     where ${CONSOLE_SESSION}
     group by u.company_id, co.name order by last desc limit $1`,
    [limit],
  );
  return q.rows;
}

/** Companies where a given config flag is ON (from custom_configurations). */
export async function companiesWithFlag(configKey: string): Promise<number[]> {
  const q = await db().query(
    `select company_id from custom_configurations
     where config_key = $1 and status = 1 and (modifications->>'value') = 'true'`,
    [configKey],
  );
  return q.rows.map((r) => Number(r.company_id));
}

/** Loginnable companies that also have the given flag ON — the ideal verify targets. */
export async function loginnableWithFlag(configKey: string): Promise<number[]> {
  const q = await db().query(
    `select distinct u.company_id
     from custom_configurations cc
     join users u on u.company_id = cc.company_id and u.status = 1
     join sessions s on s.user_id = u.id
     where cc.config_key = $1 and cc.status = 1 and (cc.modifications->>'value') = 'true'
       and ${CONSOLE_SESSION}`,
    [configKey],
  );
  return q.rows.map((r) => Number(r.company_id));
}
