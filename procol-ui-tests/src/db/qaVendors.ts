import { Pool } from "pg";

/**
 * The client's own QA TEST vendors — the only vendors a browser run may invite.
 *
 * Inviting a vendor mails its people (the invitation, later one-time codes).
 * The invite step used to type "a" into the vendor search and take the first
 * match, or keep whatever audience the product pre-filled — real suppliers.
 * QA vendors are companies with an ACTIVE buyer link whose active member is a
 * verified qa_…@example.com user (a reserved domain: nothing is delivered).
 * Same rule as the API framework (procol test/src/flows/vendors.ts).
 *
 * Read-only (SELECT). [] when the client has none or the database is unreachable.
 */
let pool: Pool | null = null;
function db(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
    // a dropped idle connection must not crash the browser run (Node kills the process on an unhandled 'error')
    pool.on("error", (e) => console.warn(`[qa-vendors-db] idle connection dropped: ${e.message}`));
  }
  return pool;
}

export function allowRealVendors(): boolean {
  return process.env.SPINE_ALLOW_REAL_VENDORS === "1";
}

const cache = new Map<number, string[]>();

export async function qaVendorNames(companyId?: number): Promise<string[]> {
  const id = companyId ?? Number(process.env.COMPANY_ID);
  if (!id) return [];
  if (cache.has(id)) return cache.get(id)!;
  const pg = db();
  if (!pg) return [];
  const sql = `select distinct on (c.id) c.name
                 from companies c
                 join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1 and b.status = 1
                 join user_company_mappings m on m.company_id = c.id and m.status = 1
                 join users u on u.id = m.user_id and u.status = 1 and u.email_verified = 1
                where c.status = 1 and u.email ilike 'qa\\_%@example.com'
                order by c.id`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const names = (await pg.query<{ name: string }>(sql, [id])).rows.map((r) => r.name);
      cache.set(id, names);
      return names;
    } catch {
      /* one retry: a dropped idle connection must not read as "no QA vendor" */
    }
  }
  return [];
}

const logins = new Map<number, Array<{ name: string; email: string }>>();

/**
 * The client's QA vendors with the address each one signs in with
 * (qa_…@example.com), in the same order as qaVendorNames — so the vendor a bid
 * step signs in as is one the invite step put on the event. Read-only (SELECT).
 * [] when the client has none or the database is unreachable.
 */
export async function qaVendorLogins(companyId?: number): Promise<Array<{ name: string; email: string }>> {
  const id = companyId ?? Number(process.env.COMPANY_ID);
  if (!id) return [];
  if (logins.has(id)) return logins.get(id)!;
  const pg = db();
  if (!pg) return [];
  const sql = `select distinct on (c.id) c.name, u.email
                 from companies c
                 join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1 and b.status = 1
                 join user_company_mappings m on m.company_id = c.id and m.status = 1
                 join users u on u.id = m.user_id and u.status = 1 and u.email_verified = 1
                where c.status = 1 and u.email ilike 'qa\\_%@example.com'
                order by c.id, u.id`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rows = (await pg.query<{ name: string; email: string }>(sql, [id])).rows.map((r) => ({ name: r.name, email: r.email }));
      logins.set(id, rows);
      return rows;
    } catch {
      /* one retry: a dropped idle connection must not read as "no QA vendor" */
    }
  }
  return [];
}

/** True when this participant name is one of the client's QA vendors. */
export function isQaVendorName(name: string, qaNames: string[]): boolean {
  const n = name.trim().toLowerCase();
  return qaNames.some((q) => n.includes(q.trim().toLowerCase()) || q.trim().toLowerCase().includes(n));
}

export class NoQaVendorError extends Error {
  constructor(companyId?: number) {
    super(
      `No QA test vendor for this client${companyId ? ` (${companyId})` : ""} — real suppliers are never invited. ` +
        `Create QA vendors for it first, or set SPINE_ALLOW_REAL_VENDORS=1 deliberately.`,
    );
    this.name = "NoQaVendorError";
  }
}

export async function closeQaVendorDb(): Promise<void> {
  await pool?.end().catch(() => {});
  pool = null;
}
