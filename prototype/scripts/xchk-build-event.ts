/**
 * Build a fresh test event for the UI ↔ API cross-check, through the API journey.
 *
 *   npx tsx scripts/xchk-build-event.ts --company 198678 --features events.rfp_rfq,negotiation.counter_offer [--seconds 60] [--out file.json]
 *
 * The journey (src/checks/eventJourney.ts) creates, publishes, bids as a QA test
 * vendor, waits the window out, evaluates and awards — so every event screen has
 * data to show. The event is titled QA_Platform_XCHK_… and only QA vendors are
 * invited (the journey's vendor is the client's QA vendor; no real suppliers).
 * Prints one JSON line at the end: { companyId, eventGroupUuid, title, made, outcome, steps }.
 */
import { writeFileSync } from "node:fs";
import { openClientContext } from "../src/executor.js";
import { runEventJourney } from "../src/checks/eventJourney.js";
import { journeyPlan } from "../src/checks/journeyModel.js";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const company = Number(arg("company") ?? 198678);
const features = (arg("features") ?? "events.rfp_rfq,negotiation.counter_offer").split(",").map((s) => s.trim()).filter(Boolean);
const seconds = Number(arg("seconds") ?? 60);
const out = arg("out");

const hard = setTimeout(() => {
  console.error("xchk-build-event: gave up after 25 minutes");
  process.exit(2);
}, 25 * 60_000);

const client: any = await openClientContext(company);
let code = 0;
try {
  if (!client.ctx.vendor?.email || !/^qa_.*@example\.com$/i.test(String(client.ctx.vendor.email))) {
    throw new Error(`no QA test vendor for company ${company} (vendor: ${client.ctx.vendor?.email ?? "none"}${client.ctx.noQaVendor ? `, ${client.ctx.noQaVendor}` : ""}) — refusing to build with a real supplier`);
  }
  const plan = journeyPlan(features);
  const r = await runEventJourney(client, plan, {
    stageSeconds: seconds,
    titlePrefix: "QA_Platform_XCHK",
    journeyBudgetMs: 20 * 60_000,
    onStep: (s: any) => console.log(`  ${String(s.verdict).padEnd(8)} ${s.kind} — ${String(s.actual ?? s.why ?? "").slice(0, 140)}`),
    onLine: (l: string) => /^[↻↺]/.test(l) && console.log(`     · ${l}`),
  });
  const j = r.journey;
  const result = {
    companyId: company,
    features,
    eventType: j.eventType,
    eventGroupUuid: j.made.eventGroupUuid,
    title: j.title,
    vendor: { name: client.ctx.vendor?.name, email: client.ctx.vendor?.email },
    made: j.made,
    outcome: j.outcome,
    steps: j.steps.map((s: any) => ({ kind: s.kind, verdict: s.verdict })),
    builtAt: new Date().toISOString(),
  };
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`\nXCHK_EVENT ${JSON.stringify(result)}`);
} catch (e) {
  console.error(`xchk-build-event failed: ${(e as Error).message}`);
  code = 1;
} finally {
  clearTimeout(hard);
  await client.dispose?.().catch(() => {});
}
process.exit(code);
