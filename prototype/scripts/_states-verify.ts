/** Read-only SQL read-back of an event the set-up built: status, trades (auction_config, order_type, masking), versions. */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
const { PROCOL_TEST } = await import("../src/executor.js");
const { query, closePool } = await import(pathToFileURL(join(PROCOL_TEST, "src", "db", "pool.ts")).href);
const title = process.argv[2];
const egs = await query(`select id, title, status, ref_id, created_at from event_groups where title = $1 or title like $2 order by id`, [title, `${title}%`]);
for (const eg of egs) {
  console.log(`event_group #${eg.id} "${eg.title}" status=${eg.status} ref_id=${eg.ref_id}`);
  const trs = await query(`select id, rfx_mode, status, auction_config, order_type, config->>'is_vendor_masking_enabled' masking, misc->'auction_strategy_config' strat, bid_start_time, bid_end_time from trade_requests where event_group_id = $1 order by id`, [eg.id]);
  for (const t of trs) console.log(`  trade #${t.id} rfx_mode=${t.rfx_mode} status=${t.status} auction_config=${t.auction_config} order_type=${t.order_type} masking=${t.masking} strategy=${JSON.stringify(t.strat)}`);
  const bids = await query(`select b.id, b.status, c.name from bids b join trade_requests t on t.id = b.trade_request_id join companies c on c.id = b.company_id where t.event_group_id = $1 order by b.id`, [eg.id]);
  for (const b of bids) console.log(`  bid #${b.id} status=${b.status} by ${b.name}`);
  const aud = await query(`select c.name from trade_audiences a join trade_requests t on t.id = a.trade_request_id join companies c on c.id = a.company_id where t.event_group_id = $1`, [eg.id]).catch((e: Error) => [{ name: `(audience table: ${e.message.slice(0, 60)})` }]);
  console.log(`  audience: ${aud.map((a: any) => a.name).join(", ")}`);
  const ver = await query(`select id, item_id, new_item_id, status, version_order, version_identifier from item_versions where item_type = 'EventGroup' and (item_id = $1 or new_item_id = $1) order by id`, [eg.id]);
  for (const v of ver) console.log(`  item_version #${v.id} item ${v.item_id} → new ${v.new_item_id} status=${v.status} order=${v.version_order} id=${v.version_identifier}`);
  const rem = await query(`select event_type, message from remarks where item_type = 'EventGroup' and item_id = $1 order by id`, [eg.id]).catch(() => []);
  for (const r of rem) console.log(`  remark ${r.event_type}: ${String(r.message).slice(0, 90)}`);
}
console.log(`(${egs.length} event group(s) found)`);
await closePool();
