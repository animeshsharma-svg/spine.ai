import { Pool } from "pg";
import type { Page } from "@playwright/test";
import { buyerApi } from "../support/buyerApi.js";

/**
 * AN EXISTING EVENT THAT FITS THE CASE — when the case names none.
 *
 * "Test awarding in a project from Master QCS" starts from an event that
 * already has bids. Plans for such cases open an event without naming one,
 * and opening "this plan's own event" failed: the plan had never built one.
 * Instead the run picks one of the client's events that is in the state the
 * later steps need, read from Procol's database (SELECTs only):
 *   - "bids":  live, with submitted bids, bidding closed — ready for Master
 *              QCS, awarding and counter offers; the most recently closed first;
 *   - "live":  any live event, the newest first.
 * Statuses, as Procol stores them (checked 2026-10-14 against events and bids
 * this platform made): event_groups.status 1 = live (0 inactive, 2 draft,
 * 3 withdrawn); bids.status 1 = submitted; a bid reaches its round through
 * bid_trades. Only events with a title are offered: the browser finds an
 * event by searching its title. Events this platform's own runs made
 * (spine-…, UI_Auto…, API_Journey…, QA_Platform…) come first: a case that
 * awards or counters changes the event it picks, and must not change one
 * another team or script is using when one of ours will do.
 */
export type EventNeed = "bids" | "live";

export interface PickedEvent {
  title: string;
  bids: number;
  /** when bidding closed (bids) or the event was created (live) */
  at: Date;
}

let pool: Pool | null = null;
function db(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  pool ??= new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10_000, query_timeout: 20_000 });
  pool.on("error", () => {});
  return pool;
}

/** Up to `n` events that fit, best first; null when the database cannot be read. */
export async function eventsFor(need: EventNeed, companyId = Number(process.env.COMPANY_ID), n = 5): Promise<PickedEvent[] | null> {
  const pg = db();
  if (!pg || !companyId) return null;
  const sql =
    need === "bids"
      ? `select e.title, count(distinct b.id)::int as bids, max(t.bid_end_time) as at
           from event_groups e
           join trade_requests t on t.event_group_id = e.id and t.status = 1
           join bid_trades bt on bt.trade_request_id = t.id
           join bids b on b.id = bt.bid_id and b.status = 1
          where e.company_id = $1 and e.status = 1 and coalesce(trim(e.title), '') <> ''
          group by e.id, e.title
         having max(t.bid_end_time) < now()
          order by (e.title ~* '^(spine-|ui_auto|api_journey|qa_platform)') desc, max(t.bid_end_time) desc
          limit $2`
      : `select e.title, 0 as bids, e.created_at as at
           from event_groups e
          where e.company_id = $1 and e.status = 1 and coalesce(trim(e.title), '') <> ''
          order by (e.title ~* '^(spine-|ui_auto|api_journey|qa_platform)') desc, e.created_at desc
          limit $2`;
  try {
    const { rows } = await pg.query(sql, [companyId, n]);
    // A title shared by several events would open whichever the search lists first.
    const titles = rows.map((r: any) => String(r.title).trim());
    return rows
      .filter((r: any, i: number) => titles.indexOf(String(r.title).trim()) === i)
      .map((r: any) => ({ title: String(r.title).trim(), bids: Number(r.bids) || 0, at: new Date(r.at) }));
  } catch {
    return null;
  }
}

/**
 * The event's own page id (what /project/<id>/details takes), from the list
 * call the console itself makes — so a picked event opens by its address, not
 * by a search of the events list (a reload and typing per lookup, and it has
 * lagged behind fresh events). Undefined when it cannot be read; the caller
 * then searches by title. Careful: stages[].company_uuid is the company.
 */
export async function eventRoute(page: Page, title: string): Promise<string | undefined> {
  const api = await buyerApi(page);
  if (!api) return undefined;
  try {
    const filters = {
      is_auto_created: [], clara_auto_pilot_status: [], creator_uuids: [], product_category_uuids: [], product_variant_uuids: [],
      delivery_zone_uuids: [], location_code_uuids: [], order_type: [], pr_uuids: [], event_statuses: [], template_uuids: [],
      title, starting_from: null, ending_at: null, stage_status: null,
    };
    const res = await api.get(`/event_groups?filters=${encodeURIComponent(JSON.stringify(filters))}&sort_by=id&sort_direction=desc`, { timeout: 15_000 });
    if (!res.ok()) return undefined;
    const body: any = await res.json().catch(() => null);
    const list: any[] = Array.isArray(body) ? body : body?.event_groups ?? body?.data ?? body?.records ?? [];
    const hit = list.find((e) => String(e?.title ?? "").trim() === title.trim());
    return hit?.uuid ? String(hit.uuid) : undefined;
  } catch {
    return undefined;
  } finally {
    await api.dispose().catch(() => {});
  }
}

/**
 * The event's pricing round as the database has it right now (SELECT only):
 * when bidding closes, how many vendors are invited, how many have bid. The
 * Live list is not enough: an API script's event with a one-minute RFQ round
 * stays on it after bidding has closed, and opening it found no Add Bid. Times
 * are stored in UTC (the database's own zone) and said in IST.
 * The pricing round is the open round that is not technical (rfx_mode 5), the
 * latest stage first. Bids with status 1 or 2 count as in (2 is what the API
 * scripts' bids carry). Null when the database cannot be read or has no such round.
 */
export interface RoundNow {
  open: boolean;
  /** "5:37 pm", or "5:37 pm on 13 Oct" when not today */
  endsAt: string;
  /** whole minutes of bidding left; 0 once closed */
  minutesLeft: number;
  invited: number;
  bidders: number;
}

export async function roundNow(title: string, companyId = Number(process.env.COMPANY_ID) || null): Promise<RoundNow | null> {
  const pg = db();
  if (!pg) return null;
  try {
    const { rows } = await pg.query(
      `select t.bid_end_time > (now() at time zone 'utc') as open,
              greatest(0, floor(extract(epoch from (t.bid_end_time - (now() at time zone 'utc'))) / 60))::int as left,
              to_char((t.bid_end_time at time zone 'utc') at time zone 'Asia/Kolkata', 'FMHH12:MI am') ||
                case when ((t.bid_end_time at time zone 'utc') at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date then ''
                     else to_char((t.bid_end_time at time zone 'utc') at time zone 'Asia/Kolkata', ' "on" FMDD Mon') end as ends,
              (select count(*) from audiences a where a.item_type = 'TradeRequest' and a.item_id = t.id and a.status = 1)::int as invited,
              (select count(distinct b.company_id) from bid_trades bt join bids b on b.id = bt.bid_id
                where bt.trade_request_id = t.id and b.status in (1, 2))::int as bidders
         from event_groups e
         join trade_requests t on t.event_group_id = e.id and t.status = 1 and t.rfx_mode <> 5
        where trim(e.title) = $1 and ($2::int is null or e.company_id = $2) and e.status = 1
        order by t.stage_no desc nulls last, t.id desc
        limit 1`,
      [title.trim(), companyId],
    );
    const r: any = rows[0];
    return r ? { open: !!r.open, endsAt: String(r.ends), minutesLeft: Number(r.left) || 0, invited: Number(r.invited) || 0, bidders: Number(r.bidders) || 0 } : null;
  } catch {
    return null;
  }
}

/**
 * Why an event cannot take a surrogate bid, in a tester's words — or null when
 * its round can. Two minutes is the least a bid needs: the drawer, the sheet, submit.
 */
export function cannotTakeBid(r: RoundNow): string | null {
  if (!r.open) return `its RFQ round closed at ${r.endsAt}`;
  if (r.minutesLeft < 2) return `its RFQ round closes at ${r.endsAt}, too soon to place a bid`;
  if (!r.invited) return "no vendor is invited on its RFQ round";
  if (r.bidders >= r.invited) return `all ${r.invited} invited vendor${r.invited === 1 ? " has" : "s have"} already bid`;
  return null;
}

/** Why an event can take a surrogate bid, from its round — for the pick's note. */
export function takesBid(r: RoundNow): string {
  const left = r.invited - r.bidders;
  return `its RFQ round is open until ${r.endsAt}, and ${left} of its ${r.invited} invited vendor${r.invited === 1 ? " has" : "s have"} not bid yet`;
}

/** What the later steps of a plan need the event to be. */
export function needOf(laterSteps: string[]): EventNeed {
  return laterSteps.some((s) => /^(open_master_qcs|start_awarding|allocate_award|award_event|expect_award|place_counter_offer|expect_counter_offer|accept_counter_offer)/.test(s))
    ? "bids"
    : "live";
}

export async function closePickEventDb(): Promise<void> {
  await pool?.end().catch(() => {});
  pool = null;
}
