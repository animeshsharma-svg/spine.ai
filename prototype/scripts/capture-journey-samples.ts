export {};
/**
 * Walk the API journey for a set of feature combinations, one after another,
 * so every step type leaves a captured response in `data/runs/`. Those
 * responses are what `build-api-assertions.ts` learns the field-level
 * assertions from. Also the way to watch the journey's resilience: every
 * retried step prints its failed tries, and each run ends with its findings.
 *
 *   tsx scripts/capture-journey-samples.ts [--c 198678] [--only rfq_full,...]
 *       through a running platform (PLATFORM_URL, default http://localhost:4300)
 *
 *   tsx scripts/capture-journey-samples.ts --direct [--c 47053] [--only rfq_only] [--force unit=Nos]
 *       in this process, no server — `--force` sets the FIRST choice of some data
 *       (unit / product / location / pricingTemplate / technicalTemplate) to prove
 *       the retry and backtracking; the record says it was forced. Direct runs are
 *       printed only, not saved to data/runs.
 *
 * Each run creates sandbox-named events (API_Journey_*), the framework's
 * designed sandbox records. Runs are sequential: they share one buyer session.
 */
const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = process.env.PLATFORM_URL ?? "http://localhost:4300";
const COMPANY = arg("--c") ?? "198678";
const DIRECT = argv.includes("--direct");
const FORCE = arg("--force");

const COMBOS: Record<string, string[]> = {
  rfq_only: ["events.rfq_only"],
  rfq_full: ["events.rfq_only", "bids.counter_offer", "auction.convert", "events.versioning"],
  rfp_only: ["events.rfp_only"],
  rfp_rfq: ["events.rfp_rfq"],
  rfp_auction: ["events.rfp_auction"],
  rfq_surrogate: ["events.rfq_only", "bids.surrogate"],
  rfp_rfq_surrogate: ["events.rfp_rfq", "bids.surrogate"],
};
const only = arg("--only")?.split(",");
const names = Object.keys(COMBOS).filter((n) => (only ? only.includes(n) : n !== "rfq_only"));

function printStep(s: any): void {
  const a = s.assertions ? ` · checks ${s.assertions.passed}/${s.assertions.total}` : "";
  const r = s.response !== undefined ? " · body kept" : "";
  const tries = s.attempts?.length ? ` · try ${s.attempt}` : "";
  console.log(`  ${String(s.n).padStart(2)}. ${s.verdict.padEnd(7)} ${s.title}${r}${a}${tries}`);
  if (s.verdict !== "worked") console.log(`        ${s.actual}`);
  for (const t of s.attempts ?? []) console.log(`        ✗ try ${t.attempt} [${t.failureClass}/${t.failureRule}] ${t.reason}`);
  for (const f of (s.assertions?.results ?? []).filter((x: any) => x.pass === false))
    console.log(`        ✗ ${f.id} ${f.title} — expected ${f.expected}, got ${f.actual}`);
}

function printJourney(journey: any): void {
  console.log(`  → ${journey.outcome}`);
  const res = journey.resilience;
  if (!res) return;
  console.log(
    `  resilience: ${res.sameRequestRetries} same-request retr${res.sameRequestRetries === 1 ? "y" : "ies"}, ${res.backtracks.length} backtrack(s), ${res.watchdogTrips} watchdog trip(s)` +
      (res.completedAfterRetries ? " — completed after retries" : "") +
      (res.forced ? ` — FORCED first choice: ${JSON.stringify(res.forced)}` : ""),
  );
  for (const b of res.backtracks) console.log(`    ↺ step ${b.fromStep} → step ${b.toStep}: ${b.choice} “${b.from}” → “${b.to}” (${b.why})${b.abandonedEvent ? ` · abandoned ${b.abandonedEvent}` : ""}`);
  for (const f of res.findings) console.log(`    FINDING ${f.id} [${f.failureClass}${f.resolved ? ", got past" : ""}]: ${f.reason}`);
  if (res.alternativeProblems?.length) console.log(`    lists not read: ${res.alternativeProblems.join("; ")}`);
}

async function runViaServer(name: string, features: string[]): Promise<void> {
  const url = `${BASE}/api/features-run?c=${COMPANY}&features=${encodeURIComponent(features.join(","))}&stageSeconds=45`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let event = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trimEnd();
      buf = buf.slice(i + 1);
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        let d: any;
        try {
          d = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        if (event === "journey-step") printStep(d.step);
        else if (event === "journey") printJourney(d.journey);
        else if (event === "line" && /^[↻↺]|Test mode/.test(String(d.line ?? ""))) console.log(`     · ${d.line}`);
        else if (event === "run-error" || event === "fatal") console.log(`  ✗ ${d.message ?? d.line ?? JSON.stringify(d)}`);
      }
    }
  }
}

async function runDirect(name: string, features: string[]): Promise<void> {
  const [{ openClientContext }, { runEventJourney }, { journeyPlan }] = await Promise.all([
    import("../src/executor.js"),
    import("../src/checks/eventJourney.js"),
    import("../src/checks/journeyModel.js"),
  ]);
  const force: Record<string, string> = {};
  for (const part of (FORCE ?? "").split(/[;,]/)) {
    const [k, ...v] = part.split("=");
    if (k?.trim() && v.length) force[k.trim()] = v.join("=").trim();
  }
  const client = await openClientContext(Number(COMPANY));
  try {
    const r = await runEventJourney(client as any, journeyPlan(features), {
      stageSeconds: 45,
      force: force as any,
      onStep: (s) => printStep(s),
      onLine: (l) => /^[↻↺]|Test mode/.test(l) && console.log(`     · ${l}`),
    });
    printJourney(r.journey);
  } finally {
    await client.dispose?.().catch(() => {});
  }
}

for (const n of names) {
  const t0 = Date.now();
  console.log(`\n▶ ${n}: ${COMBOS[n].join(", ")}${DIRECT ? " (direct)" : ""}${FORCE ? ` · force ${FORCE}` : ""}`);
  try {
    await (DIRECT ? runDirect(n, COMBOS[n]) : runViaServer(n, COMBOS[n]));
  } catch (e) {
    console.log(`  ✗ ${n} could not run: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`  (${Math.round((Date.now() - t0) / 1000)} s)`);
}
console.log(DIRECT ? "\nDone." : "\nDone. Next: npx tsx scripts/build-api-assertions.ts");
process.exit(0);
