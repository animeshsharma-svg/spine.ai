import { query } from "../db/pool.js";

/**
 * Which one-time codes the UAT backend will accept for a login — worked out
 * the way the backend itself works it out, so a login never has to guess.
 *
 * On UAT (`UAT_ENV=true`) `Otp.get_otp_for_uat` (procol-backend
 * app/models/otp.rb) accepts, besides the code it actually sent:
 *
 *   no user with that phone/email   → the master OTP (`procol_variables`
 *                                     MASTER_OTP_6)
 *   user whose company is verified  → that company's `uat_login_otp`
 *   user of an unverified company   → the `uat_login_otp` of every buyer the
 *   (a vendor)                        vendor deals with (buyer_seller_company_
 *                                     mappings, active…blacklisted)
 *   company still signing up        → the inviting company's `uat_login_otp`
 *
 * So one fixed code in `.env` is right for one tenant and wrong for the next:
 * PROCOL DEMO and Demo Account 2 each have their own. This reads the same
 * tables with SELECTs only (the pool is read-only) and returns every code the
 * backend would accept, with where each came from. Any failure — no
 * DATABASE_URL, a timeout — returns nothing, and the caller falls back to the
 * configured code, which is what happened before.
 */

export interface UatOtp {
  otp: string;
  /** plain words for the report: "Demo Account 2's UAT login code" */
  source: string;
}

// buyer_seller_company_mappings statuses the backend counts for a vendor:
// active 1, invited 2, onboarding_in_progress 3, in_review 4, rejected 5,
// in_approval 6, blacklisted 7 (in_active 0 is left out).
const DEALING_STATUSES = [1, 2, 3, 4, 5, 6, 7];
// MasterConfiguration.item_type: ["Template", "Company", "User"] → Company = 1
const ITEM_COMPANY = 1;

async function workspaceOtps(companyIds: number[]): Promise<UatOtp[]> {
  if (!companyIds.length) return [];
  const rows = await query<{ company_id: number; v: string | null; name: string | null }>(
    `SELECT mc.company_id, mc.defaults->>'value' AS v, c.name
       FROM master_configurations mc
       LEFT JOIN companies c ON c.id = mc.company_id
      WHERE mc.item_type = $1 AND mc.config_key = 'uat_login_otp' AND mc.company_id = ANY($2)`,
    [ITEM_COMPANY, companyIds],
  );
  return rows
    .filter((r) => r.v)
    .map((r) => ({ otp: String(r.v), source: `${r.name ?? `company ${r.company_id}`}'s UAT login code` }));
}

/**
 * The codes to try for one login, best first: the TENANT's own UAT code (the
 * company the run is acting for — the evaluator of Demo Account 2 signs in with
 * Demo Account 2's code, and a vendor invited by a buyer is accepted with that
 * buyer's code), then what the backend's own lookup of that user gives, then
 * the master code. Phone formats differ between the API and the table ("+91/…"
 * vs the bare number), so the tenant code is tried first rather than trusting
 * the table lookup alone.
 */
export async function loginOtpCandidates(who: { phone?: string; email?: string }, tenantCompanyId?: number): Promise<UatOtp[]> {
  const out: UatOtp[] = [];
  const add = (list: UatOtp[]) => {
    for (const c of list) if (!out.some((x) => x.otp === c.otp)) out.push(c);
  };
  try {
    if (tenantCompanyId) add(await workspaceOtps([tenantCompanyId]));
  } catch {
    /* no database: fall through */
  }
  add(await resolveUatOtps(who));
  return out;
}

export async function resolveUatOtps(who: { phone?: string; email?: string }): Promise<UatOtp[]> {
  try {
    const user = who.phone
      ? (await query<{ id: number; company_id: number }>(
          `SELECT id, company_id FROM users WHERE phone = $1 AND status = 1 ORDER BY id DESC LIMIT 1`,
          [who.phone],
        ))[0]
      : who.email
        ? (await query<{ id: number; company_id: number }>(
            `SELECT id, company_id FROM users WHERE lower(email) = lower($1) ORDER BY id DESC LIMIT 1`,
            [who.email],
          ))[0]
        : undefined;

    if (!user) {
      const m = await query<{ value: string }>(`SELECT value FROM procol_variables WHERE key = 'MASTER_OTP_6' AND status = 1 ORDER BY id DESC LIMIT 1`);
      return m[0]?.value ? [{ otp: String(m[0].value), source: "the master UAT code (no user with that login yet)" }] : [];
    }

    const company = (
      await query<{ id: number; status: number; company_status: number }>(
        `SELECT id, status, company_status FROM companies WHERE id = $1`,
        [user.company_id],
      )
    )[0];

    // A company still signing up: the code of whoever invited it.
    if (!company || company.status === 2) {
      if (!who.email) return [];
      const inv = await query<{ inviter_company_id: number }>(
        `SELECT inviter_company_id FROM invitations WHERE status = 1 AND lower(invite_info) = lower($1) ORDER BY id DESC LIMIT 1`,
        [who.email],
      );
      return inv[0] ? workspaceOtps([Number(inv[0].inviter_company_id)]) : [];
    }

    // A verified company (a buyer, an evaluator): its own code.
    if (company.company_status === 1) return workspaceOtps([company.id]);

    // A vendor: every active buyer it deals with.
    const clients = await query<{ id: number }>(
      `SELECT DISTINCT c.id
         FROM buyer_seller_company_mappings b
         JOIN companies c ON c.id = b.client_company_id AND c.status = 1
        WHERE b.status = ANY($1)
          AND b.dealing_with_company_id IN (
                SELECT company_id FROM user_company_mappings WHERE user_id = $2 AND status = 1)`,
      [DEALING_STATUSES, user.id],
    );
    return workspaceOtps(clients.map((c) => Number(c.id)));
  } catch {
    return [];
  }
}
