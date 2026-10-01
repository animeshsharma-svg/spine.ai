/**
 * QA VENDORS — the multi-vendor matrix needs several vendors per client that
 * are safe to invite and to sign in as. Real vendors are real mailboxes, and
 * every earlier QA vendor's buyer link is "rejected", so the platform makes
 * its own, through Procol's own API, exactly as a buyer and a new supplier
 * would:
 *
 *   1. the buyer invites the vendor (POST /invitations/send_invite) with
 *      "skip vendor onboarding" — the buyer–vendor link is created ACTIVE and
 *      the only mail goes to the invitee, a qa_…@example.com address (a
 *      reserved domain nobody receives); no vendor-management notice is sent
 *      because onboarding is skipped (invitations.rb send_invite_mail);
 *   2. the vendor signs in by email for the first time — verify_otp creates
 *      the user and their own (signup-pending) company;
 *   3. the vendor completes signup (POST /v1/vendor_signup), which accepts
 *      every open invitation for that email — the user is added to the
 *      invited company (Invitation::AcceptService#accept_all_invites);
 *   4. the link, the membership and the invitation are read back with SELECT,
 *      and the vendor signs in once more as a registered user.
 *
 * Only on PROCOL DEMO 198678 and Demo Account 2 32461 — never a customer's
 * tenant. The vendors are recorded in spine.ai's own database (qa_vendors) so
 * later runs reuse them instead of creating more.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST } from "../executor.js";
import { spineDb } from "../db/spineDb.js";

export const QA_VENDOR_WORKSPACES = [198678, 32461] as const;
const QA_EMAIL = /^qa_[a-z0-9_.-]+@example\.com$/i;

export interface QaVendor {
  workspaceId: number;
  vendorCompanyId: number;
  vendorCompanyUuid: string;
  homeCompanyId?: number;
  userId?: number;
  userUuid?: string;
  email: string;
  name: string;
  n: number;
  stamp: string;
  linkStatus?: string;
  loginOk: boolean;
}

export interface QaVendorStep {
  vendor: string;
  step: string;
  ok: boolean;
  detail: string;
}

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);

const BSCM: Record<number, string> = {
  0: "in_active", 1: "active", 2: "invited", 3: "onboarding_in_progress", 4: "in_review", 5: "rejected", 6: "in_approval", 7: "blacklisted",
};
const INV: Record<number, string> = { 0: "in_active", 1: "active", 2: "accepted", 3: "rejected", 4: "revoked", 5: "in_progress", 6: "blacklisted" };

/** What Procol's database says about one QA vendor (SELECT only). */
export async function readVendorState(workspaceId: number, email: string, name: string) {
  const { query } = await imp("db/pool.ts");
  const comp = (
    await query(
      `select c.id, b.status bscm from companies c
         join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1
        where c.name = $2 order by c.id desc limit 1`,
      [workspaceId, name],
    )
  )[0];
  const user = (await query(`select id, company_id, status from users where lower(email) = lower($1) and status = 1 order by id desc limit 1`, [email]))[0];
  const member = comp && user
    ? (await query(`select status from user_company_mappings where user_id = $1 and company_id = $2 order by id desc limit 1`, [user.id, comp.id]))[0]
    : undefined;
  const inv = comp
    ? (await query(`select status from invitations where inviter_company_id = $1 and invitee_company_id = $2 and lower(invite_info) = lower($3) order by id desc limit 1`, [workspaceId, comp.id, email]))[0]
    : undefined;
  return {
    companyId: comp ? Number(comp.id) : undefined,
    link: comp ? BSCM[Number(comp.bscm)] ?? String(comp.bscm) : undefined,
    userId: user ? Number(user.id) : undefined,
    homeCompanyId: user ? Number(user.company_id) : undefined,
    member: member ? (Number(member.status) === 1 ? "active" : String(member.status)) : undefined,
    invitation: inv ? INV[Number(inv.status)] ?? String(inv.status) : undefined,
  };
}

/** The QA vendors recorded for a workspace that last signed in fine (spine DB), oldest first. */
export async function listQaVendors(workspaceId: number): Promise<QaVendor[]> {
  const db = await spineDb();
  if (!db) return [];
  const r = await db.query(
    `select * from qa_vendors where workspace_id = $1 and login_ok order by n, id`,
    [workspaceId],
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows.map((x: any) => ({
    workspaceId: x.workspace_id,
    vendorCompanyId: x.vendor_company_id,
    vendorCompanyUuid: x.vendor_company_uuid,
    homeCompanyId: x.home_company_id ?? undefined,
    userId: x.user_id ?? undefined,
    userUuid: x.user_uuid ?? undefined,
    email: x.email,
    name: x.name,
    n: x.n,
    stamp: x.stamp,
    linkStatus: x.link_status ?? undefined,
    loginOk: x.login_ok,
  }));
}

/** Invited QA vendors of this workspace with no user yet (SELECT), not already recorded. */
async function pendingVendors(workspaceId: number, known: Set<number>) {
  const { query } = await imp("db/pool.ts");
  const rows = await query(
    `select c.id, c.name, i.invite_info email from companies c
       join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1 and b.status = 1
       join invitations i on i.invitee_company_id = c.id and i.inviter_company_id = $1 and i.status = 1
      where c.name like 'QA_Platform Vendor %' and i.invite_info ilike 'qa\\_%@example.com' order by c.id`,
    [workspaceId],
  );
  return rows
    .filter((r: any) => !known.has(Number(r.id)))
    .map((r: any) => {
      const m = /^QA_Platform Vendor (\d+) (\d+)$/.exec(r.name);
      return m ? { companyId: Number(r.id), name: r.name as string, email: String(r.email), n: Number(m[1]), stamp: m[2] } : undefined;
    })
    .filter(Boolean) as { companyId: number; name: string; email: string; n: number; stamp: string }[];
}

/** The vendor company's uuid, from the buyer's own vendor list. */
async function vendorUuid(buyerApi: any, name: string): Promise<string | undefined> {
  const { listInvitableVendors } = await imp("flows/vendors.ts");
  const list = await listInvitableVendors(buyerApi, name, 10).catch(() => []);
  return list.find((c: any) => c.name === name)?.uuid ?? list[0]?.uuid;
}

async function record(v: QaVendor): Promise<void> {
  const db = await spineDb();
  if (!db) return;
  await db.query(
    `insert into qa_vendors (workspace_id, vendor_company_id, vendor_company_uuid, home_company_id, user_id, user_uuid, email, name, stamp, n, link_status, login_ok, verified_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     on conflict (workspace_id, vendor_company_id) do update set
       home_company_id = excluded.home_company_id, user_id = excluded.user_id, user_uuid = excluded.user_uuid,
       link_status = excluded.link_status, login_ok = excluded.login_ok, verified_at = now()`,
    [v.workspaceId, v.vendorCompanyId, v.vendorCompanyUuid, v.homeCompanyId ?? null, v.userId ?? null, v.userUuid ?? null, v.email, v.name, v.stamp, v.n, v.linkStatus ?? null, v.loginOk],
  );
}

/** Sign a vendor in by email OTP; returns a vendor ApiClient or the error text. */
export async function vendorClient(workspaceId: number, email: string, baseURL?: string): Promise<{ api?: any; login?: any; error?: string }> {
  if (!QA_EMAIL.test(email)) return { error: `refusing to sign in as ${email}: only qa_…@example.com test vendors` };
  const [{ authenticate }, { CONFIG }, { ApiClient }] = await Promise.all([imp("auth/login.ts"), imp("config.ts"), imp("api/client.ts")]);
  const base = baseURL ?? CONFIG.baseURL;
  try {
    const login = await authenticate({ ...CONFIG.identities.vendor, email, tenantCompanyId: workspaceId, baseURL: base });
    const api = await ApiClient.create(login, { baseURL: base, appVersion: login.appVersion, identity: "vendor", companyId: workspaceId });
    return { api, login };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).replace(/"otp"\s*:\s*"?\d+"?/gi, '"otp":"<redacted>"').slice(0, 400) };
  }
}

/**
 * Make sure `count` QA vendors exist for a workspace: reuse the recorded ones,
 * create only the missing number. Every step is reported; nothing is forced —
 * a vendor whose link does not end active, or who cannot sign in, is reported
 * and not recorded as usable.
 */
export async function ensureQaVendors(
  workspaceId: number,
  count: number,
  opts: { buyerApi: any; baseURL?: string; onLine?: (l: string) => void },
): Promise<{ vendors: QaVendor[]; created: number; steps: QaVendorStep[] }> {
  if (!(QA_VENDOR_WORKSPACES as readonly number[]).includes(workspaceId)) {
    throw new Error(`QA vendors are only created on ${QA_VENDOR_WORKSPACES.join(" and ")}, not ${workspaceId}`);
  }
  const say = opts.onLine ?? (() => {});
  const steps: QaVendorStep[] = [];
  const have = await listQaVendors(workspaceId);
  if (have.length >= count) return { vendors: have.slice(0, count), created: 0, steps };
  const stamp = String(Date.now());
  let created = 0;
  const out = [...have];
  // Half-made vendors from an earlier, interrupted setup (invited, never
  // signed up) are finished first, so nothing is created twice.
  const pending = await pendingVendors(workspaceId, new Set(have.map((v) => v.vendorCompanyId)));
  const usedN = new Set(have.map((v) => v.n));
  for (let n = 1; out.length < count; n++) {
    if (n > count + 20) break;
    const resume = pending.find((p) => p.n === n);
    if (usedN.has(n) && !resume) continue;
    const email = resume?.email ?? `qa_${stamp}_v${n}@example.com`;
    const name = resume?.name ?? `QA_Platform Vendor ${n} ${stamp}`;
    const vStamp = resume?.stamp ?? stamp;
    const step = (s: string, ok: boolean, detail: string) => {
      steps.push({ vendor: name, step: s, ok, detail });
      say(`${ok ? "✓" : "✗"} ${name}: ${s} — ${detail}`);
    };
    // 1. the buyer invites, skipping onboarding (link active, no prospect notice)
    const inviteBody = {
      invite_type: "vendor_invite", firm_name: name, name: `QA Vendor ${n}`, email, category: "manufacturer",
      address: `QA Platform Street ${n}`, city_id: 8, skip_vendor_onboarding: true,
    };
    let companyUuid: string | undefined;
    if (!resume) {
      const inv = await opts.buyerApi.attempt("POST", "/invitations/send_invite", { body: inviteBody });
      step("buyer invites the vendor", !!inv.ok, inv.ok ? `HTTP ${inv.status}` : `HTTP ${inv.status} ${inv.errorCode ?? ""} ${inv.errorMessage ?? ""}`.trim());
      if (!inv.ok) break;
      companyUuid = inv.data?.company?.uuid;
    } else {
      step("resume an earlier invite", true, `company ${resume.companyId} was invited before and never signed up`);
    }
    usedN.add(n);
    companyUuid ??= await vendorUuid(opts.buyerApi, name);
    let st = await readVendorState(workspaceId, email, name);
    step("link after the invite (SELECT)", st.link === "active", `link ${st.link ?? "missing"}, invitation ${st.invitation ?? "missing"}, user ${st.userId ? "exists" : "none yet"}`);
    if (!st.companyId) break;
    // 2. first sign-in creates the user
    const first = await vendorClient(workspaceId, email, opts.baseURL);
    step("vendor's first sign-in (creates the user)", !!first.api, first.api ? `signed in${first.login?.otpSource ? ` (${first.login.otpSource})` : ""}` : first.error ?? "failed");
    if (!first.api) break;
    // 3. signup completion accepts the invitation
    const su = await first.api.attempt("POST", "/v1/vendor_signup", {
      body: { email, name: `QA Vendor ${n}`, firm_name: `${name} Home`, city_id: 8, address: `QA Platform Street ${n}`, terms_and_policy_accepted: true },
    });
    step("vendor completes signup (accepts the invitation)", !!su.ok, su.ok ? `HTTP ${su.status}` : `HTTP ${su.status} ${su.errorCode ?? ""} ${su.errorMessage ?? ""}`.trim());
    await Promise.resolve(first.api.dispose?.()).catch(() => {});
    // 4. read back, then a second sign-in as a registered user
    st = await readVendorState(workspaceId, email, name);
    const linked = st.link === "active" && st.member === "active";
    step("link + membership after signup (SELECT)", linked, `link ${st.link}, member of the invited company: ${st.member ?? "no"}, invitation ${st.invitation}`);
    const again: { api?: any; login?: any; error?: string } = linked ? await vendorClient(workspaceId, email, opts.baseURL) : { error: "not linked" };
    step("vendor signs in again", !!again.api, again.api ? "signed in" : again.error ?? "failed");
    if (again.api) await Promise.resolve(again.api.dispose?.()).catch(() => {});
    const v: QaVendor = {
      workspaceId, vendorCompanyId: st.companyId!, vendorCompanyUuid: companyUuid ?? "", homeCompanyId: st.homeCompanyId,
      userId: st.userId, userUuid: again.login?.userUuid ?? first.login?.userUuid, email, name, n, stamp: vStamp, linkStatus: st.link, loginOk: linked && !!again.api && !!companyUuid,
    };
    await record(v).catch((e) => step("record in spine DB", false, (e as Error).message));
    created++;
    if (!v.loginOk) break; // something is wrong with the path — stop, do not create more
    out.push(v);
  }
  return { vendors: out.slice(0, count), created, steps };
}
