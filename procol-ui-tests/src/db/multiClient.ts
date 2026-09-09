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
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
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
  const direct = await db().query(
    `select u.id, u.phone, s.access_token, s.app_version
     from sessions s join users u on u.id = s.user_id
     where u.company_id = $1 and ${CONSOLE_SESSION}
     order by s.created_at desc limit 1`,
    [companyId],
  );
  let row = direct.rows[0];
  if (!row) {
    const op = await db().query(
      `select u.id, u.phone, s.access_token, s.app_version
       from trade_requests tr
       join users u on u.id = tr.user_id
       join sessions s on s.user_id = u.id
       where tr.company_id = $1 and ${CONSOLE_SESSION}
       order by s.created_at desc limit 1`,
      [companyId],
    );
    row = op.rows[0];
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
