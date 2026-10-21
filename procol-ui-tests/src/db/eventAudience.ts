import { Pool } from "pg";

/**
 * EVERY VENDOR INVITED TO AN EVENT, read from Procol's database by its title.
 *
 * The create screen shows four participant names and a "+162" chip. The bid
 * step chose its vendor from those four, so a vendor this run can sign in as,
 * hidden in the "+N", was missed — and the invite step, counting the same four
 * names, kept adding vendors to an event that already had 166 (Aanya, 15 Oct:
 * "if 166 vendors are already invited and I asked to invite 3, you need not
 * invite 3 more, 3 are included in that only").
 *
 * Read once the event is published (an audience is saved with its round):
 * every round of the event, active invitations only. SELECT only; null when
 * the database cannot be read, so the caller keeps what the screen showed.
 */
let pool: Pool | null | undefined;
function db(): Pool | null {
  if (pool !== undefined) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  pool = connectionString
    ? new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10_000, query_timeout: 20_000 })
    : null;
  pool?.on("error", () => {});
  return pool;
}

export async function invitedVendorNames(title: string, companyId = Number(process.env.COMPANY_ID) || null): Promise<string[] | null> {
  const pg = db();
  if (!pg || !title.trim()) return null;
  try {
    const { rows } = await pg.query<{ name: string }>(
      `select distinct c.name
         from event_groups e
         join trade_requests t on t.event_group_id = e.id and t.status = 1
         join audiences a on a.item_type = 'TradeRequest' and a.item_id = t.id and a.status = 1
         join companies c on c.id = a.audience_id
        where trim(e.title) = $1 and ($2::int is null or e.company_id = $2) and coalesce(trim(c.name), '') <> ''
        order by c.name`,
      [title.trim(), companyId],
    );
    return rows.map((r) => r.name);
  } catch {
    return null;
  }
}
