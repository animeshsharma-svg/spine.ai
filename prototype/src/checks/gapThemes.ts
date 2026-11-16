/**
 * The kinds of automation gap, each with the fix that closes it — shared by scripts/gap-census.ts and
 * scripts/gap-close-result.ts (the procol-qa skill, references/build-automation.md). A gap text takes the first
 * theme whose words it matches; "other" is read by hand.
 */
/** Gap theme → the kind of fix that closes it (references/build-automation.md in the skill). First match wins. */
export const THEMES: Array<{ key: string; fix: string; re: RegExp }> = [
  { key: "labels", fix: "confirm the label (scan-dashboard-labels / labels.seen) or correct the step's words", re: /unconfirmed (control )?label|label .* not (specified|confirmed)|no confirmed catalog label|expected message .* is neither/i },
  { key: "no-model", fix: "recompile — the model did not answer", re: /no assertion step|compiled without a model|generic plan/i },
  { key: "mailbox", fix: "a tester-owned mailbox reader (approval emails, bounces) — the EMA runner's inbox, not the browser", re: /mailbox|inbox|gmail|e-?mail thread|bounce|out-of-office|auto-reply|approval email|reply (email|from)/i },
  { key: "mobile", fix: "manual — the mobile app has no automation", re: /mobile app|procol mobile/i },
  { key: "api-in-ui", fix: "route the case (or that part) to the API layer: an API plan checks status codes and messages", re: /\bhttp \d{3}\b|status code|\b(post|get|put|patch|delete) \/|request (body|payload)|users-search request|network request/i },
  { key: "po-records", fix: "create_po + expect_po_items, or a read of the PO / PR records after the award", re: /purchase orders?|\bpo\b|\bpos\b|pr transitions|ordered\b/i },
  { key: "events-list", fix: "expect_event_in_list per tab (Live / History / Drafts / Recurring) on the run's own event", re: /\b(live|history|drafts|recurring)\b[^.]{0,40}\b(tab|list)|absent from (live|history|drafts)|appears in (live|history)/i },
  { key: "absolute-time", fix: "extend_time / reschedule with an absolute date-time argument", re: /absolute|exact (date|datetime|date-time)|\b20\d\d\b.*\b(am|pm)\b|fixed[- ]time/i },
  { key: "identity", fix: "another user's session (approver, planner, admin, second vendor's own portal) — identity vault", re: /\b(sign|log)\s*in as|another (user|buyer)|approver|planner user|as the (approver|admin|evaluator|requester)|without .*(permission|role)|\brole\b|named vendor/i },
  { key: "start-state", fix: "a start state the API builds (uiSetup state + sheetPrep words + preparedRules)", re: /prepared state|only one (vendor )?bid|two (vendor )?bids|vendor a (quoted|at)|two line|closed rfq with|in evaluation with|rfq in evaluation|no-bid rfq|cannot be reproduced|setup contains|knockout auction state|existing (multi-currency|live)/i },
  { key: "award-split", fix: "allocate_award with a quantity per vendor + proposal fill", re: /allocat|proposal|unawarded|split|totals? of|× ?\d|\d+ \+ \d+/i },
  { key: "settings", fix: "require_setting (switched by the runner, restored after)", re: /\b(setting|config(uration)?|tenant|lock_vendors|enabled|disabled)\b/i },
  { key: "time", fix: "a wait / timed transition step on a short window", re: /wait for|timed transition|before the (original )?(auction )?end|countdown|minute before|after .* ends|window to end|time extension stops/i },
  { key: "activity-log", fix: "expect_activity (Order Activity drawer / the API's activity read)", re: /activity|audit|log entry/i },
  { key: "files", fix: "upload / download steps with fixtures", re: /download|upload|workbook|excel|\bpdf\b|\bfile\b|fixture|attachment/i },
  { key: "test-data", fix: "config/test-data-map.json (read the company's own value first) or set_sheet_cell", re: /variant|delivery location|loc-0001|plant name|cylinder/i },
  { key: "find-record", fix: "find a specific event / record by what the case names", re: /find(ing)? (and open )?(the )?specific|by (its )?title|search the events list|locate or guarantee|identify the specific|event number/i },
  { key: "unchanged", fix: "remember / expect_remembered before-and-after, or an API read-back", re: /unchanged|before-and-after|nothing on the event changes|no new event|no order was created|exactly one new/i },
  { key: "auction-variant", fix: "configure_single_stage args / auction states", re: /dutch|japanese|english|forward|traffic|strategy|ceiling|direction/i },
  { key: "negotiation", fix: "counter offer / re-bid steps", re: /counter offer|re-?bid|revision/i },
  { key: "vendor-view", fix: "switch_portal + vendor_open_event", re: /vendor portal|vendor's (displayed|countdown)|vendors? can (submit|no longer)/i },
  { key: "ordering", fix: "expect_order / list completeness", re: /chronolog|order(ed)? by|every (label|field)|complete/i },
];
