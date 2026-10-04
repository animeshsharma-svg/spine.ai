/**
 * Reproduce API-EVRMEG-024: after an amendment, every copied schedule of a round
 * (bidding AND evaluation) starts "now" (versions/trade_request.rb replicate_trade_schedules),
 * so evaluation no longer starts after bidding ends.
 * Builds a fresh technical-round event through the journey (QA vendors only), issues a new
 * version, then reads the original and the amended round's schedules. Read-only after that.
 *   npx tsx scripts/repro-amend-windows.ts [--c 198678]
 */
import { openClientContext } from "../src/executor.js";
import { runEventJourney } from "../src/checks/eventJourney.js";
import { journeyPlan } from "../src/checks/journeyModel.js";
import { apiGet } from "../src/checks/engine.js";

const company = Number(process.argv[process.argv.indexOf("--c") + 1]) || 198678;
const hard = setTimeout(() => { console.error("gave up after 20 min"); process.exit(2); }, 20 * 60_000);
const client: any = await openClientContext(company);
if (!/^qa_.*@example\.com$/i.test(String(client.ctx.vendor?.email))) { console.error("no QA vendor — refusing"); process.exit(1); }
const api = client.ctx.buyerApi;

const r: any = await runEventJourney(client, journeyPlan(["events.rfp_only", "events.versioning"]), { stageSeconds: 600, titlePrefix: "QA_Platform_AmendWindows", journeyBudgetMs: 15 * 60_000 });
const made = r.journey.made ?? {};
console.log("journey:", r.journey.outcome);
const original = made.rfpTradeId ?? made.technicalTradeUuid ?? made.tradeId;
const copyEg = made.versionedEventUuid;
if (!original || !copyEg) { console.log("could not build the amendment:", JSON.stringify(made)); process.exit(0); }

async function get(path: string): Promise<any> {
  const o: any = await apiGet(api, path); // app-guarded; apiGet returns no body, so read through the client after the guard passed
  if (o.notSent) throw new Error(`not sent: ${o.notSent}`);
  return api.get(path);
}
const schedules = (d: any) => (d?.trade_schedules ?? d?.schedules ?? d?.trade_config?.trade_schedules ?? []).map((s: any) => ({ kind: s.schedule_type ?? s.kind ?? s.name ?? s.type, start: s.start_time, end: s.end_time }));
const before = await get(client.s?.Endpoints?.tradeDetails?.(original) ?? `/trade/${original}?response_type=template&additional_fields=order_details`);
const eg = await get(`/event_groups/${copyEg}`);
const copyTrades: string[] = (eg?.trade_uuids ?? eg?.trades?.map((t: any) => t.uuid) ?? eg?.trade_requests?.map((t: any) => t.uuid) ?? []).filter(Boolean);
console.log("original round schedules:", JSON.stringify(schedules(before)));
for (const t of copyTrades) {
  const d = await get(`/trade/${t}?response_type=template&additional_fields=order_details`);
  console.log(`amended round ${t} (${d?.rfx_mode ?? d?.trade_type ?? "?"}) schedules:`, JSON.stringify(schedules(d)));
  if (!schedules(d).length) console.log("  top-level keys:", Object.keys(d ?? {}).filter((k) => /time|sched|start|end|eval/i.test(k)).join(", "));
}
clearTimeout(hard); await client.dispose?.(); process.exit(0);
