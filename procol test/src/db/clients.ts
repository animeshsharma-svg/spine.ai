import { query } from "./pool.js";

export interface DbUserSession {
  userId: number;
  firstName: string | null;
  phone: string | null;
  phonePrefix: string | null;
  email: string | null;
  role: number;
  /** the server-side session secret → 3rd segment of the access-token */
  sessionAccessToken: string;
  appVersion: string | null;
  sessionCreatedAt: Date;
}

export interface ResolvedClient {
  companyId: number;
  companyName: string | null;
  /** most-recent console (buyer/web-console) session in the company */
  buyer: DbUserSession;
  /** a second console user for the evaluator role, if one exists */
  evaluator?: DbUserSession;
}

/** Parse the DB phone format `+91/1234567516` → { prefix, number }. */
export function parsePhone(raw: string | null): { prefix: string | null; number: string | null } {
  if (!raw) return { prefix: null, number: null };
  const m = raw.match(/^(\+\d+)\/(.+)$/);
  if (m) return { prefix: m[1], number: m[2] };
  return { prefix: null, number: raw };
}

const CONSOLE_SESSION = `s.status = 1 and s.access_token is not null and s.app_version like '9.4%' and u.status = 1`;

function toSession(r: any): DbUserSession {
  const { prefix, number } = parsePhone(r.phone);
  return {
    userId: r.id,
    firstName: r.first_name,
    phone: number,
    phonePrefix: prefix,
    email: r.email,
    role: r.role,
    sessionAccessToken: r.access_token,
    appVersion: r.app_version,
    sessionCreatedAt: r.created_at,
  };
}

/**
 * Resolve a client (company) to logged-in users via the DB.
 * Picks the most-recent active console session as the buyer, and a different
 * console user (if any) as the evaluator. No OTP — uses existing sessions.
 */
export async function resolveClient(companyId: number): Promise<ResolvedClient> {
  // 1) direct users of the company with a live console session
  let rows = await query(
    `select u.id, u.first_name, u.phone, u.email, u.role, s.access_token, s.app_version, s.created_at
     from sessions s
     join users u on u.id = s.user_id
     where u.company_id = $1 and ${CONSOLE_SESSION}
     order by s.created_at desc`,
    [companyId],
  );

  // 2) workspace model: some clients (e.g. Moon Beverages) have no direct users
  //    — they are operated by a user in a parent/support company whose events
  //    land under this company. Find that operator via trade_requests.
  let viaOperator = false;
  if (rows.length === 0) {
    // Take the operators behind the company's most-recent trade_requests
    // (cheap: ordered by primary key), then keep those with a live console
    // session, freshest first. The previous version aggregated the WHOLE
    // trade_requests table and timed out for high-volume clients like
    // PROCOL DEMO (198678).
    rows = await query(
      `select u.id, u.first_name, u.phone, u.email, u.role, s.access_token, s.app_version, s.created_at
       from sessions s
       join users u on u.id = s.user_id
       where ${CONSOLE_SESSION}
         and u.id in (
           select tr.user_id from trade_requests tr
           where tr.company_id = $1
           order by tr.id desc
           limit 200
         )
       order by s.created_at desc
       limit 20`,
      [companyId],
    );
    viaOperator = rows.length > 0;
  }

  if (rows.length === 0) {
    throw new Error(
      `No active console session found for company ${companyId} (directly or via an operator). ` +
        `Someone must log into this client's web console so a fresh session exists.`,
    );
  }

  const nameRow = await query(`select name from companies where id = $1`, [companyId]);
  const companyName = nameRow[0]?.name ?? null;

  const buyer = toSession(rows[0]);
  const evalRow = rows.find((r) => r.id !== buyer.userId);

  if (viaOperator) buyer.firstName = `${buyer.firstName ?? ""} (operator)`.trim();

  return {
    companyId,
    companyName,
    buyer,
    evaluator: evalRow ? toSession(evalRow) : undefined,
  };
}

/** List companies that currently have a usable console session (testable clients). */
export async function listTestableClients(limit = 20): Promise<
  Array<{ companyId: number; companyName: string | null; users: number; latest: Date }>
> {
  return query(
    `select u.company_id as "companyId", co.name as "companyName",
            count(distinct u.id)::int as users, max(s.created_at) as latest
     from sessions s
     join users u on u.id = s.user_id
     join companies co on co.id = u.company_id
     where ${CONSOLE_SESSION} and co.name is not null
     group by u.company_id, co.name
     order by latest desc
     limit $1`,
    [limit],
  );
}
