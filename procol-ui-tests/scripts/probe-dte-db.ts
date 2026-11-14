/** Read-only look at a dynamic-time-extension event: npx tsx scripts/probe-dte-db.ts "<event title>" */
import "../src/config.js"; // loads .env
import pg from "pg";
const title = process.argv[2];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const eg = await q(`select id, title from event_groups where title = $1 order by id desc limit 1`, [title]);
console.log("event_group:", eg);
if (eg.length) {
  const tr = await q(`select id, status, bid_end_time, closed_at, misc->>'dynamic_time_extension_count' as dte_count, config->>'time_extension_value' as ext, config->>'last_n_minutes_for_time_extension' as trig, config->>'rank_limit_for_time_extension' as topn, config->>'dynamic_closing_time_strategy' as strategy from trade_requests where event_group_id = $1 order by id`, [eg[0].id]);
  console.log("trade_requests:", tr);
  for (const t of tr) {
    console.log("schedules:", await q(`select id, schedule_type, start_time, end_time, status from trade_schedules where trade_request_id = $1 order by id`, [t.id]));
    console.log("bids:", await q(`select id, company_id, status, placed_at, end_time, closed_at from bids where trade_request_id = $1 order by id`, [t.id]));
  }
}
await pool.end();
