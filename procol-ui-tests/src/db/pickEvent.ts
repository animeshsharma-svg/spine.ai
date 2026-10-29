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
export async function eventRoute(page: Page, title: string, opts: { byRef?: boolean } = {}): Promise<string | undefined> {
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
    // By reference (RFX-…) for an event with no title: the list's search matches references too.
    const hit = opts.byRef
      ? list.find((e) => String(e?.ref_uuid ?? "").trim() === title.trim())
      : list.find((e) => String(e?.title ?? "").trim() === title.trim());
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

/**
 * EVENTS READY FOR A TECHNICAL EVALUATION (Aanya, 26 Oct 2026: "if i mention evaluation then u
 * must know that it will include technical stage then find suitable event for that").
 * A live event whose technical stage (trade_requests.rfx_mode 4 or 5) has closed for answers,
 * with at least one vendor's submitted technical answer (template_responses on the stage,
 * status 1) and no submitted evaluation on it yet (evaluations.status 2). Technical answers are
 * not bids: bid_trades has none for these stages. Untitled events (the API journey's) are
 * offered too; they open by their RFX reference. This platform's own events come first, then
 * untitled ones, then other teams' (an evaluation changes the event it scores).
 */
export interface EvalEvent {
  ref: string;
  title: string | null;
  answers: number;
  /** when the technical stage closed for answers */
  at: Date;
}

export async function evaluationEvents(companyId = Number(process.env.COMPANY_ID), n = 6): Promise<EvalEvent[] | null> {
  const pg = db();
  if (!pg || !companyId) return null;
  const sql = `select e.ref_id as ref, nullif(trim(e.title), '') as title, max(t.bid_end_time) as at, count(distinct r.id)::int as answers
                 from event_groups e
                 join trade_requests t on t.event_group_id = e.id and t.rfx_mode in (4, 5)
                 join template_responses r on r.item_type = 'TradeRequest' and r.item_id = t.id and r.status = 1
                where e.company_id = $1 and e.status = 1 and e.ref_id is not null and t.bid_end_time < now()
                  and not exists (select 1 from evaluations v where v.trade_request_id = t.id and v.status = 2)
                group by e.id, e.ref_id, e.title
                order by (coalesce(e.title, '') ~* '^(spine-|ui_auto|api_journey|qa_platform)') desc,
                         (nullif(trim(e.title), '') is null) desc, max(t.bid_end_time) desc
                limit $2`;
  try {
    const { rows } = await pg.query(sql, [companyId, n]);
    return rows.map((r: any) => ({ ref: String(r.ref), title: r.title ? String(r.title) : null, answers: Number(r.answers) || 0, at: new Date(r.at) }));
  } catch {
    return null;
  }
}

/**
 * An event's stages from its trade requests: "technical" (rfx_mode 4 or 5), "auction" (0) or "rfq".
 * Null when the database cannot say. Used to answer an evaluation of an event with no technical
 * stage in one line (Aanya, 27 Oct: she asked to evaluate ZE5wY2RO, an RFQ-only event).
 */
export async function stagesOfEvent(eventGroupId: number): Promise<string[] | null> {
  const pg = db();
  if (!pg || !eventGroupId) return null;
  try {
    const { rows } = await pg.query(`select distinct rfx_mode from trade_requests where event_group_id = $1`, [eventGroupId]);
    return rows.map((r: any) => (Number(r.rfx_mode) === 4 || Number(r.rfx_mode) === 5 ? "technical" : Number(r.rfx_mode) === 0 ? "auction" : "rfq"));
  } catch {
    return null;
  }
}

/**
 * Is the event withdrawn, by Procol's own rows (UAT, 27 Oct): a withdrawn PROJECT is event_groups.status 3
 * (its stages go to 0); a withdrawn STAGE is trade_requests.status 0 while the event stays 1. Null when the
 * database cannot say.
 */
export async function withdrawalOf(eventGroupId: number): Promise<{ eventStatus: number; title: string; stages: Array<{ mode: number; status: number }> } | null> {
  const pg = db();
  if (!pg || !eventGroupId) return null;
  try {
    const { rows } = await pg.query(
      `select e.status as eg, e.title, t.rfx_mode, t.status from event_groups e left join trade_requests t on t.event_group_id = e.id and t.parent_id is null where e.id = $1`,
      [eventGroupId],
    );
    if (!rows.length) return null;
    return { eventStatus: Number(rows[0].eg), title: String(rows[0].title ?? ""), stages: rows.filter((r: any) => r.rfx_mode !== null).map((r: any) => ({ mode: Number(r.rfx_mode), status: Number(r.status) })) };
  } catch {
    return null;
  }
}

/**
 * Who responded on an event's stages, and how: a bid (bid_trades → bids) or a technical answer (template_responses),
 * placed by the event's own creator — a SURROGATE response, the buyer the run signs in as — or by the vendor's user
 * (the vendor portal). Procol keeps no surrogate flag; on a live event its Responses tab shows no "Surrogate Bid" tag
 * either (27 Oct, RFX-19361), so this is how the buyer-side check tells the two apart.
 */
export async function responsesOf(eventGroupId: number): Promise<Array<{ vendor: string; mode: number; kind: "bid" | "technical"; surrogate: boolean }> | null> {
  const pg = db();
  if (!pg || !eventGroupId) return null;
  try {
    const { rows } = await pg.query(
      `select c.name as vendor, t.rfx_mode, x.kind, (x.user_id = e.user_id) as surrogate
         from event_groups e
         join trade_requests t on t.event_group_id = e.id
         join (select bt.trade_request_id as tr, b.company_id, b.user_id, 'bid' as kind from bid_trades bt join bids b on b.id = bt.bid_id
               union all
               select r.item_id, r.company_id, r.user_id, 'technical' from template_responses r where r.item_type = 'TradeRequest') x on x.tr = t.id
         join companies c on c.id = x.company_id
        where e.id = $1`,
      [eventGroupId],
    );
    return rows.map((r: any) => ({ vendor: String(r.vendor ?? ""), mode: Number(r.rfx_mode), kind: r.kind === "technical" ? "technical" : "bid", surrogate: r.surrogate === true }));
  } catch {
    return null;
  }
}

/**
 * The users a stage's evaluator name could be ("Satish Kumar Kaushik"), newest first — a person can have
 * several (a login per company). The run signs in as the first with a live console session.
 */
export async function usersNamed(fullName: string): Promise<number[]> {
  const pg = db();
  if (!pg || !fullName.trim()) return [];
  try {
    const { rows } = await pg.query(
      `select id from users where status = 1 and trim(concat_ws(' ', first_name, last_name)) ilike $1 order by id desc limit 5`,
      [fullName.trim().replace(/\s+/g, " ")],
    );
    return rows.map((r: any) => Number(r.id));
  } catch {
    return [];
  }
}

/** What the later steps of a plan need the event to be. */
export function needOf(laterSteps: string[]): EventNeed {
  // A counter offer exists only while the bid is live and active (CounterOfferPage), so a case
  // that sends one needs an event still taking quotes; runPlan's fitsCase then insists its Master
  // QCS has a bid. "bids" (bidding over, waiting to be evaluated) gave B11 on 21-22 Oct an event
  // with three bids and no Counter Offer control on any of them.
  if (laterSteps.some((s) => /^(place_counter_offer|expect_counter_offer|accept_counter_offer)/.test(s))) return "live";
  return laterSteps.some((s) => /^(open_master_qcs|start_awarding|allocate_award|award_event|expect_award)/.test(s)) ? "bids" : "live";
}

export async function closePickEventDb(): Promise<void> {
  await pool?.end().catch(() => {});
  pool = null;
}
