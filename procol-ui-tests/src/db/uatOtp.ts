import { Pool } from "pg";

/**
 * Which one-time codes the UAT backend accepts for a login, read the way the
 * backend reads them — the browser twin of the API suite's
 * `procol test/src/auth/uatOtp.ts`, with the same rules:
 *
 * On UAT `Otp.get_otp_for_uat` (procol-backend app/models/otp.rb) accepts,
 * besides the code it actually sent:
 *   no user with that phone/email   → the master code (procol_variables MASTER_OTP_6)
 *   user whose company is verified  → that company's `uat_login_otp`
 *   user of an unverified company   → the `uat_login_otp` of every buyer the
 *   (a vendor)                        vendor deals with
 *   company still signing up        → the inviting company's `uat_login_otp`
 *
 * That is how a QA vendor (qa_…@example.com, a reserved domain where no email
 * is ever delivered) signs in to the vendor portal: with the code of the buyer
 * that invited it. A single code in `.env` is right for one account and wrong
 * for the next, which is why the vendor login used to type the profile's code
 * (or nothing) and stop at "vendor login did not complete".
 *
 * SELECTs only. Any failure — no DATABASE_URL, a timeout — returns [], and the
 * caller says plainly that there is no code. A code is never printed; only
 * where it came from ("PROCOL DEMO's UAT login code").
 */
export interface UatCode {
  otp: string;
  /** plain words for the trail: "PROCOL DEMO's UAT login code" */
  source: string;
}

let pool: Pool | null = null;
function db(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10_000, query_timeout: 20_000 });
    // a dropped idle connection must not crash the browser run
    pool.on("error", (e) => console.warn(`[uat-otp-db] idle connection dropped: ${e.message}`));
  }
  return pool;
}

async function q<T>(sql: string, args: unknown[]): Promise<T[]> {
  const pg = db();
  if (!pg) return [];
  return (await pg.query(sql, args)).rows as T[];
}

// buyer_seller_company_mappings statuses the backend counts for a vendor:
// active 1, invited 2, onboarding 3, in review 4, rejected 5, in approval 6, blacklisted 7.
const DEALING_STATUSES = [1, 2, 3, 4, 5, 6, 7];
// MasterConfiguration.item_type: ["Template", "Company", "User"] → Company = 1
const ITEM_COMPANY = 1;

async function companyCodes(companyIds: number[]): Promise<UatCode[]> {
  if (!companyIds.length) return [];
  const rows = await q<{ company_id: number; v: string | null; name: string | null }>(
    `SELECT mc.company_id, mc.defaults->>'value' AS v, c.name
       FROM master_configurations mc
       LEFT JOIN companies c ON c.id = mc.company_id
      WHERE mc.item_type = $1 AND mc.config_key = 'uat_login_otp' AND mc.company_id = ANY($2)`,
    [ITEM_COMPANY, companyIds],
  );
  // Keep the order asked for: the tenant first.
  const out: UatCode[] = [];
  for (const id of companyIds) {
    for (const r of rows.filter((x) => Number(x.company_id) === id && x.v)) {
      out.push({ otp: String(r.v), source: `${r.name ?? `company ${r.company_id}`}'s UAT login code` });
    }
  }
  return out;
}

async function codesForUser(who: { phone?: string; email?: string }): Promise<UatCode[]> {
  const user = who.phone
    ? (await q<{ id: number; company_id: number }>(`SELECT id, company_id FROM users WHERE phone = $1 AND status = 1 ORDER BY id DESC LIMIT 1`, [who.phone]))[0]
    : who.email
      ? (await q<{ id: number; company_id: number }>(`SELECT id, company_id FROM users WHERE lower(email) = lower($1) ORDER BY id DESC LIMIT 1`, [who.email]))[0]
      : undefined;
  if (!user) {
    const m = await q<{ value: string }>(`SELECT value FROM procol_variables WHERE key = 'MASTER_OTP_6' AND status = 1 ORDER BY id DESC LIMIT 1`, []);
    return m[0]?.value ? [{ otp: String(m[0].value), source: "the master UAT code (no user with that login yet)" }] : [];
  }
  const company = (await q<{ id: number; status: number; company_status: number }>(`SELECT id, status, company_status FROM companies WHERE id = $1`, [user.company_id]))[0];
  if (!company || Number(company.status) === 2) {
    if (!who.email) return [];
    const inv = await q<{ inviter_company_id: number }>(
      `SELECT inviter_company_id FROM invitations WHERE status = 1 AND lower(invite_info) = lower($1) ORDER BY id DESC LIMIT 1`,
      [who.email],
    );
    return inv[0] ? companyCodes([Number(inv[0].inviter_company_id)]) : [];
  }
  if (Number(company.company_status) === 1) return companyCodes([Number(company.id)]);
  const clients = await q<{ id: number }>(
    `SELECT DISTINCT c.id
       FROM buyer_seller_company_mappings b
       JOIN companies c ON c.id = b.client_company_id AND c.status = 1
      WHERE b.status = ANY($1) AND b.dealing_with_company_id = $2`,
    [DEALING_STATUSES, company.id],
  );
  return companyCodes(clients.map((c) => Number(c.id)));
}

/**
 * The codes to try for one login, best first: the TENANT's own code (the
 * company the run acts for — a vendor it invited is accepted with it), then
 * what the backend's own lookup of that user gives. At most three, so a wrong
 * guess never turns into hammering the login.
 */
export async function uatLoginCodes(who: { phone?: string; email?: string }, tenantCompanyId?: number): Promise<UatCode[]> {
  const out: UatCode[] = [];
  const add = (list: UatCode[]) => {
    for (const c of list) if (!out.some((x) => x.otp === c.otp)) out.push(c);
  };
  try {
    if (tenantCompanyId) add(await companyCodes([tenantCompanyId]));
    add(await codesForUser(who));
  } catch {
    /* no database or a timeout: the caller says there is no code */
  }
  return out.slice(0, 3);
}

export async function closeUatOtpDb(): Promise<void> {
  await pool?.end().catch(() => {});
  pool = null;
}
