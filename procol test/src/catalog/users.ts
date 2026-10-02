import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

export interface CompanyUser {
  uuid: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

/** List active users of the logged-in company (with their API uuids). */
export async function listCompanyUsers(api: ApiClient): Promise<CompanyUser[]> {
  const res = await api.get<any>(Endpoints.getAllUsers());
  const arr = Array.isArray(res) ? res : res.users ?? res.data ?? [];
  return arr as CompanyUser[];
}

/**
 * Pick the user to act as the technical-stage evaluator.
 *
 * "The first user who is not the buyer" was the old rule, and on Demo Account 2
 * it named a bare QA test user — role member, in no team — who then signed in
 * fine and was refused the event itself ("You are not authorized to perform
 * this action"): reading an event needs the `trade / read_record` permission,
 * which on Procol comes from the user's teams or role in that company
 * (procol-backend TradeRequestPolicy#show?, User#is_allowed_to_perform_action?).
 *
 * First of all the evaluator must be able to SIGN IN. A console (buyer-side)
 * user can only get a one-time code by phone — by email generate_otp answers
 * code 5 "Not authorized" (procol-backend users_controller_helper.rb
 * check_otp_on_email_allowed) — and the phone must be exactly `users.phone`
 * and pass Utils.is_phone_valid?. The backend always rewrites the request's
 * phone to `phone_prefix + "/" + phone` first (params_auth.rb
 * check_phone_and_prefix), so only a user stored as "<prefix>/<local>" can be
 * matched — sign in with the local part and the prefix separately. Seed users
 * with a malformed phone (Demo Account 2 has one: 11 digits, no country part)
 * can never sign in, so they are ranked below everyone who can.
 *
 * Then by whether they can do the job: a Super Admin (who bypasses the
 * check), then someone with an active team in this company, then a manager or
 * admin; a real account over a QA test user breaks ties. Stored phones and team
 * membership are read from the database when there is one (SELECT only);
 * without it the ranking falls back to role and the listed phone. Never the buyer.
 */
export function isSignInPhone(phone?: string | null): boolean {
  const p = String(phone ?? "").trim();
  if (/^\+91\/[0-9]{10}$/.test(p)) return true;
  return /^\+(?!91\/)[0-9]{1,4}\/[0-9]{4,14}$/.test(p); // other countries: length is per-country, accept plausible
}

/** "+91/9876543210" → { phone: "9876543210", phonePrefix: "+91" } — how generate_otp wants it. */
export function splitStoredPhone(stored: string): { phone: string; phonePrefix: string } {
  const [phonePrefix, phone] = stored.split("/");
  return { phone, phonePrefix };
}

export async function resolveEvaluatorUuid(
  api: ApiClient,
  excludeEmail?: string,
  companyId?: number,
): Promise<{ uuid: string; email?: string; name?: string; phone?: string; why?: string }> {
  const users = await listCompanyUsers(api);
  if (users.length === 0) throw new Error("No company users found to assign as evaluator.");
  const pool = users.filter((u) => u.uuid && (!excludeEmail || (u.email ?? "").toLowerCase() !== excludeEmail.toLowerCase()));
  if (!pool.length) return { uuid: users[0].uuid, email: users[0].email, name: users[0].name };

  // Active team memberships in THIS company and the phone exactly as stored,
  // by email — read-only. A user whose active mappings include an
  // unregistered supplier contact (user_type 2) cannot request a code either.
  const teams = new Map<string, number>();
  const stored = new Map<string, { phone: string | null; poc: boolean }>();
  if (companyId) {
    try {
      const { query } = await import("../db/pool.js");
      const emails = pool.map((u) => (u.email ?? "").toLowerCase()).filter(Boolean);
      const rows = await query<{ e: string; n: number }>(
        `SELECT lower(u.email) AS e, count(*)::int AS n
           FROM users u
           JOIN team_members tm ON tm.user_id = u.id AND tm.status = 1
           JOIN teams t ON t.id = tm.team_id AND t.company_id = $2 AND t.status = 1
          WHERE lower(u.email) = ANY($1)
          GROUP BY 1`,
        [emails, companyId],
      );
      for (const r of rows) teams.set(r.e, r.n);
      const phones = await query<{ e: string; phone: string | null; poc: boolean }>(
        `SELECT DISTINCT ON (lower(u.email)) lower(u.email) AS e, u.phone,
                EXISTS (SELECT 1 FROM user_company_mappings m WHERE m.user_id = u.id AND m.status = 1 AND m.user_type = 2) AS poc
           FROM users u
          WHERE lower(u.email) = ANY($1) AND u.status = 1
          ORDER BY lower(u.email), u.id DESC`,
        [emails],
      );
      for (const r of phones) stored.set(r.e, { phone: r.phone, poc: r.poc });
    } catch {
      /* no database here: rank by role and the listed phone alone */
    }
  }
  const roleOf = (u: any) => String(u.role ?? u.role_name ?? "").toLowerCase();
  const isQa = (u: any) => /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i.test(u.email ?? "");
  const phoneOf = (u: any): string | undefined => {
    const s = stored.get((u.email ?? "").toLowerCase());
    return s ? (s.phone ?? undefined) : u.phone;
  };
  const canSignIn = (u: any) => isSignInPhone(phoneOf(u)) && !stored.get((u.email ?? "").toLowerCase())?.poc;
  const score = (u: any) =>
    (canSignIn(u) ? 1000 : 0) +
    (roleOf(u) === "super_admin" ? 100 : 0) +
    ((teams.get((u.email ?? "").toLowerCase()) ?? 0) > 0 ? 50 : 0) +
    (["manager", "admin"].includes(roleOf(u)) ? 20 : 0) -
    (isQa(u) ? 5 : 0);
  const pick = [...pool].sort((a, b) => score(b) - score(a))[0];
  const phone = canSignIn(pick) ? phoneOf(pick) : undefined;
  const why = !canSignIn(pick)
    ? "the best available user — but no one here has a phone the backend accepts for a one-time code"
    :
    roleOf(pick) === "super_admin"
      ? "a Super Admin, who can open any event"
      : (teams.get((pick.email ?? "").toLowerCase()) ?? 0) > 0
        ? "a member of this company's teams, so allowed to read events"
        : ["manager", "admin"].includes(roleOf(pick))
          ? `a ${roleOf(pick)} of this company`
          : "the best available user (none with a team or a senior role)";
  return { uuid: pick.uuid, email: pick.email, name: pick.name, phone, why };
}
