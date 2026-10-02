import { query } from "./pool.js";

export interface DbEventGroup {
  id: number;
  title: string;
  status: number;
  company_id: number;
  user_id: number;
  ref_id: string | null;
  config: Record<string, unknown> | null;
  created_at: Date;
}

export interface DbTrade {
  id: number;
  event_group_id: number;
  stage_no: number;
  rfx_mode: string | null;
  status: number;
  title: string | null;
  company_id: number;
}

/**
 * DB-as-oracle helpers: confirm the API's writes actually landed in Postgres.
 * We bridge API↔DB by the event's unique title (the public uuids are encoded,
 * so title is the reliable join key for a freshly created test event).
 */

export async function getEventGroupByTitle(title: string): Promise<DbEventGroup | undefined> {
  const rows = await query<DbEventGroup>(
    `select id, title, status, company_id, user_id, ref_id, config, created_at
     from event_groups where title = $1 order by created_at desc limit 1`,
    [title],
  );
  return rows[0];
}

export async function getTradesByEventGroupId(eventGroupId: number): Promise<DbTrade[]> {
  return query<DbTrade>(
    `select id, event_group_id, stage_no, rfx_mode, status, title, company_id
     from trade_requests where event_group_id = $1 order by stage_no`,
    [eventGroupId],
  );
}

// ── master-data verification (row exists in the DB after an API create) ──────

export async function getCategoryByName(name: string): Promise<{ id: number; company_id: number } | undefined> {
  const rows = await query<any>(
    `select id, company_id from product_categories where name = $1 order by created_at desc limit 1`,
    [name],
  );
  return rows[0];
}

export async function getProductByName(name: string): Promise<{ id: number; company_id: number } | undefined> {
  const rows = await query<any>(
    `select id, company_id from products where name = $1 order by created_at desc limit 1`,
    [name],
  );
  return rows[0];
}

export async function getBuyerHubByName(name: string): Promise<{ id: number; company_id: number } | undefined> {
  const rows = await query<any>(
    `select id, company_id from buyer_hubs where name = $1 order by created_at desc limit 1`,
    [name],
  );
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<{ id: number; company_id: number; email: string } | undefined> {
  const rows = await query<any>(
    `select id, company_id, email from users where email = $1 order by created_at desc limit 1`,
    [email],
  );
  return rows[0];
}

export async function getTeamByName(name: string): Promise<{ id: number; company_id: number } | undefined> {
  const rows = await query<any>(
    `select id, company_id from teams where name = $1 order by created_at desc limit 1`,
    [name],
  );
  return rows[0];
}

/** Is a user a member of a team (in team_members)? */
export async function isTeamMember(teamId: number, userId: number): Promise<boolean> {
  const rows = await query<{ n: string }>(
    `select count(*)::int as n from team_members where team_id = $1 and user_id = $2`,
    [teamId, userId],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function countBidsForTrades(tradeRequestIds: number[]): Promise<number> {
  if (tradeRequestIds.length === 0) return 0;
  const rows = await query<{ count: string }>(
    `select count(*)::int as count from bids where trade_request_id = any($1::bigint[])`,
    [tradeRequestIds],
  );
  return Number(rows[0]?.count ?? 0);
}
