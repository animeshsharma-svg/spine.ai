-- What Procol's database holds for each event a run created, found by its title.
-- $1 = text[] of event titles. Read-only: run inside a READ ONLY transaction.
-- Codes seen on UAT (26 Oct 2026): event_groups.status 1 = live, 2 = draft;
-- trade_requests.rfx_mode 1 = RFQ, 5 = technical/RFP, 0 = auction.
-- event_group_line_items.status 1 = active (live event), 2 = active (draft), 0 = removed.
-- A stage's bids hang off bid_trades (bid_trades.trade_request_id → bids.id); bids.trade_request_id is empty for them.
select eg.title,
       json_build_object(
         'id', eg.id, 'ref', eg.ref_id, 'status', eg.status, 'closed', eg.closed_at is not null,
         'created', eg.created_at, 'started', eg.started_at,
         'line_items', (select count(*) from event_group_line_items li where li.event_group_id = eg.id),
         'line_item_statuses', (select json_object_agg(s, n) from (select li.status s, count(*) n from event_group_line_items li where li.event_group_id = eg.id group by 1) x),
         'stages', (select json_agg(json_build_object(
              'id', tr.id, 'no', tr.stage_no, 'rfx_mode', tr.rfx_mode, 'order_type', tr.order_type,
              'status', tr.status, 'current_status', tr.current_status, 'parent_id', tr.parent_id,
              'closed', tr.closed_at is not null, 'start', tr.bid_start_time, 'end', tr.bid_end_time,
              'vendors', (select count(*) from audiences a where a.item_type = 'TradeRequest' and a.item_id = tr.id and a.status = 1),
              'bids', (select count(*) from bid_trades bt where bt.trade_request_id = tr.id),
              'bid_vendors', (select count(distinct b.company_id) from bid_trades bt join bids b on b.id = bt.bid_id where bt.trade_request_id = tr.id),
              'bid_vendor_names', (select json_agg(distinct c.name) from bid_trades bt join bids b on b.id = bt.bid_id join companies c on c.id = b.company_id where bt.trade_request_id = tr.id),
              'latest_bid_price', (select b.price from bid_trades bt join bids b on b.id = bt.bid_id where bt.trade_request_id = tr.id order by b.updated_at desc limit 1),
              'rounds', (select count(*) from trade_rounds r where r.trade_request_id = tr.id),
              'orders', (select count(*) from orders o where o.trade_request_id = tr.id),
              'proposals', (select count(*) from proposals p where p.item_type = 'TradeRequest' and p.item_id = tr.id)
            ) order by tr.stage_no, tr.id) from trade_requests tr where tr.event_group_id = eg.id),
         'orders', (select count(*) from orders o where o.source_event_id = eg.id or o.trade_request_id in (select id from trade_requests where event_group_id = eg.id)),
         'proposals', (select count(*) from proposals p where (p.item_type = 'EventGroup' and p.item_id = eg.id))
       ) facts
from event_groups eg
where eg.title = any($1::text[]) and eg.company_id = 198678
order by eg.title, eg.id;
