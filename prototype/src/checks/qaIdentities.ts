/**
 * QA IDENTITIES — the other people a case needs (18 Nov 2026, In-Principle Approval on Amity University).
 *
 * Approvals, hand-overs and permission cases are about a SECOND person: Approver A approves, the view-only user
 * cannot raise it, the new owner publishes. Until now the platform had only the company's own signed-in buyer, so
 * all of those cases stayed Blocked ("identity vault" in the procol-qa skill's gap backlog). This module is that
 * vault:
 *
 *   1. the buyer creates QA users through Procol's own create-user call (the Users screen's call) — test
 *      addresses qa_<stamp>_<key>@example.com, names "QA_Platform <who> <stamp>", phones that cannot belong to a
 *      real person ("10" + 8 digits; Indian mobiles start 6–9);
 *   2. each user is read back with SELECT and recorded here with the persona it plays (data/qa-identities.json,
 *      git-ignored) — "Approver A", "Rohan Mehta", "step 1 approver" all find the same user;
 *   3. the executor signs the user in a browser of its own (`act_as` → signInUser: their saved session, else the
 *      login screen with the UAT code the backend accepts for them).
 *
 * Only on a company in config/qa-workspaces.json. Never a real person: an identity is always a user this module
 * created, so nothing reaches a real mailbox or phone.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROCOL_TEST } from "../executor.js";
import { approvedQaWorkspaces } from "./matrixVendors.js";
import { encodeId } from "./procolIds.js";

export interface QaIdentity {
  companyId: number;
  /** short key: approver_a, collaborator, view_only … */
  key: string;
  /** who the case calls them — persona names and roles, matched case-insensitively */
  plays: string[];
  userId: number;
  userUuid?: string;
  email: string;
  name: string;
  /** active | deactivated */
  status: string;
  createdAt: string;
  note?: string;
}

export interface PersonaSpec {
  key: string;
  plays: string[];
  /** users.role on create — member unless the case needs more */
  role?: "member" | "manager" | "admin";
  note?: string;
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "qa-identities.json");
const QA_EMAIL = /^qa_[a-z0-9_.-]+@example\.com$/i;
const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);

export function loadIdentities(companyId?: number): QaIdentity[] {
  if (!existsSync(FILE)) return [];
  try {
    const all = JSON.parse(readFileSync(FILE, "utf8")) as QaIdentity[];
    return companyId ? all.filter((i) => i.companyId === companyId) : all;
  } catch {
    return [];
  }
}

function saveIdentity(id: QaIdentity): void {
  const all = loadIdentities().filter((i) => !(i.companyId === id.companyId && i.key === id.key));
  all.push(id);
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 1));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The identity a case's words name ("Approver A", "Anita Rao (CFO)", "the view-only user"), or undefined. */
export function identityFor(companyId: number, words: string): QaIdentity | undefined {
  const w = norm(words);
  const ids = loadIdentities(companyId);
  return (
    ids.find((i) => norm(i.key.replace(/_/g, " ")) === w || i.plays.some((p) => norm(p) === w)) ??
    ids.find((i) => i.plays.some((p) => w.includes(norm(p)) || norm(p).includes(w)))
  );
}

/** A phone no real person has: "10" + 8 digits from the stamp and the persona's position. */
function testPhone(stamp: string, n: number): string {
  return `10${stamp.slice(-6)}${String(n).padStart(2, "0")}`;
}

/**
 * Make sure every persona has a QA user on the company: reuse the recorded ones, create the missing ones.
 * Returns what exists after, and a line per step.
 */
export async function ensureQaUsers(
  companyId: number,
  personas: PersonaSpec[],
  opts: { buyerApi: any; onLine?: (l: string) => void },
): Promise<{ identities: QaIdentity[]; created: number }> {
  if (!approvedQaWorkspaces().includes(companyId)) {
    throw new Error(`QA users are only created on ${approvedQaWorkspaces().join(", ")} (config/qa-workspaces.json), not ${companyId}`);
  }
  const say = opts.onLine ?? (() => {});
  const { query } = await imp("db/pool.ts");
  const have = loadIdentities(companyId);
  const stamp = String(Date.now());
  let created = 0;
  for (const [n, p] of personas.entries()) {
    const known = have.find((i) => i.key === p.key);
    if (known) {
      say(`✓ ${p.key}: already have ${known.name} (user ${known.userId})`);
      continue;
    }
    const label = p.plays[0] ?? p.key;
    // A user an earlier, interrupted run created for this persona is taken over, never made twice.
    const earlier = await query(
      `select u.id, u.email, trim(u.first_name || ' ' || coalesce(u.last_name, '')) as name, m.status
         from users u join user_company_mappings m on m.user_id = u.id and m.company_id = $1
        where lower(u.email) like $2 order by u.id desc limit 1`,
      [companyId, `qa\\_%\\_${p.key}@example.com`],
    );
    let email = `qa_${stamp}_${p.key}@example.com`.toLowerCase();
    let name = `QA_Platform ${label} ${stamp}`;
    let row = earlier[0];
    let uuid: string | undefined;
    if (row) {
      email = String(row.email).toLowerCase();
      name = String(row.name);
      say(`… ${p.key}: taking over ${name} (user ${row.id}), made by an earlier run`);
    } else {
      if (!QA_EMAIL.test(email)) throw new Error(`refusing to create ${email}: only qa_…@example.com test users`);
      const reply = await opts.buyerApi.attempt("POST", "/users/create_user", {
        body: { name, email, phone: testPhone(stamp, n + 1), phone_prefix: "+91", role: p.role ?? "member" },
      });
      if (!reply.ok) {
        say(`✗ ${p.key}: the app refused to create ${name} — HTTP ${reply.status} ${reply.errorMessage ?? ""}`.trim());
        continue;
      }
      uuid = reply.data?.uuid ?? reply.data?.user?.uuid ?? reply.data?.data?.uuid;
      // Read back: the user exists, with this email, and belongs to the company.
      row = (
        await query(
          `select u.id, m.status from users u join user_company_mappings m on m.user_id = u.id and m.company_id = $1
            where lower(u.email) = $2 order by m.id desc limit 1`,
          [companyId, email],
        )
      )[0];
      if (!row) {
        say(`✗ ${p.key}: created (HTTP ${reply.status}) but not found in the company's users`);
        continue;
      }
    }
    const id: QaIdentity = {
      companyId, key: p.key, plays: p.plays, userId: Number(row.id), userUuid: uuid, email, name,
      status: Number(row.status) === 1 ? "active" : "inactive", createdAt: new Date().toISOString(), note: p.note,
    };
    saveIdentity(id);
    created++;
    say(`✓ ${p.key}: created ${name} (user ${id.userId}) — plays ${p.plays.join(" / ")}`);
  }
  await ensureQaTeam(companyId, { buyerApi: opts.buyerApi, onLine: say });
  return { identities: loadIdentities(companyId), created };
}

export const QA_TEAM = "QA_Platform QA Team";

/**
 * Put every QA identity of the company in a team of OUR own ("QA_Platform QA Team", made here if missing).
 * A user in no team signs in to "You haven't been added to a team yet" and sees nothing (Amity, 18 Nov 2026:
 * Approver A could not open the In-Principle Approval page). The company's own teams are never touched.
 * Uses the Teams screen's own calls: POST /teams, POST /teams/add_member_dashboard; read back with SELECT.
 */
export async function ensureQaTeam(
  companyId: number,
  opts: { buyerApi: any; onLine?: (l: string) => void },
): Promise<{ teamId: number; added: number } | null> {
  if (!approvedQaWorkspaces().includes(companyId)) return null;
  const say = opts.onLine ?? (() => {});
  const { query } = await imp("db/pool.ts");
  const findTeam = async () =>
    (await query(`select id from teams where company_id = $1 and name = $2 and status = 1 order by id limit 1`, [companyId, QA_TEAM]))[0];
  let team = await findTeam();
  if (!team) {
    const r = await opts.buyerApi.attempt("POST", "/teams", { body: { name: QA_TEAM, team_type: "purchase", product_category_uuids: [], buyer_hub_uuids: [] } });
    if (!r.ok) {
      say(`✗ team: the app refused to create "${QA_TEAM}" — HTTP ${r.status} ${r.errorMessage ?? ""}`.trim());
      return null;
    }
    team = await findTeam();
    if (!team) {
      say(`✗ team: "${QA_TEAM}" created (HTTP ${r.status}) but not found in the company's teams`);
      return null;
    }
    say(`✓ team: created "${QA_TEAM}" (team ${team.id})`);
  }
  const teamId = Number(team.id);
  const people = loadIdentities(companyId);
  const inTeam = new Set(
    (await query(`select user_id from team_members where team_id = $1 and status = 1`, [teamId])).map((x: any) => Number(x.user_id)),
  );
  const missing = people.filter((i) => !inTeam.has(i.userId));
  if (!missing.length) {
    say(`✓ team: all ${people.length} QA users are in "${QA_TEAM}"`);
    return { teamId, added: 0 };
  }
  const r = await opts.buyerApi.attempt("POST", "/teams/add_member_dashboard", {
    body: { team_uuid: encodeId(teamId), users: missing.map((i) => ({ role: "member", uuid: i.userUuid || encodeId(i.userId) })) },
  });
  const now = new Set(
    (await query(`select user_id from team_members where team_id = $1 and status = 1`, [teamId])).map((x: any) => Number(x.user_id)),
  );
  const added = missing.filter((i) => now.has(i.userId));
  say(
    r.ok && added.length === missing.length
      ? `✓ team: added ${added.map((i) => i.key).join(", ")} to "${QA_TEAM}"`
      : `✗ team: adding to "${QA_TEAM}" — HTTP ${r.status} ${r.errorMessage ?? ""}; in the team now: ${added.length} of ${missing.length}`.trim(),
  );
  return { teamId, added: added.length };
}

/** Record a change to an identity (deactivated, …) after the app confirmed it. */
export function markIdentity(companyId: number, key: string, change: Partial<QaIdentity>): void {
  const id = loadIdentities(companyId).find((i) => i.key === key);
  if (id) saveIdentity({ ...id, ...change });
}
