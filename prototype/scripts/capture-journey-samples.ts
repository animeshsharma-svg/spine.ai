export {};
/**
 * Walk the API journey for a set of feature combinations, one after another,
 * through the running platform (`npm run serve`), so every step type leaves a
 * captured response in `data/runs/`. Those responses are what
 * `build-api-assertions.ts` learns the field-level assertions from.
 *
 *   tsx scripts/capture-journey-samples.ts [--c 198678] [--only rfq_only,...]
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

const COMBOS: Record<string, string[]> = {
  rfq_full: ["events.rfq_only", "bids.counter_offer", "auction.convert", "events.versioning"],
  rfp_only: ["events.rfp_only"],
  rfp_rfq: ["events.rfp_rfq"],
  rfp_auction: ["events.rfp_auction"],
  rfq_surrogate: ["events.rfq_only", "bids.surrogate"],
  rfp_rfq_surrogate: ["events.rfp_rfq", "bids.surrogate"],
};
const only = arg("--only")?.split(",");
const names = Object.keys(COMBOS).filter((n) => !only || only.includes(n));

async function runOne(name: string, features: string[]): Promise<void> {
  const url = `${BASE}/api/features-run?c=${COMPANY}&features=${encodeURIComponent(features.join(","))}&stageSeconds=45`;
  const t0 = Date.now();
  console.log(`\n▶ ${name}: ${features.join(", ")}`);
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
        if (event === "journey-step") {
          const s = d.step;
          const a = s.assertions ? ` · checks ${s.assertions.passed}/${s.assertions.total}` : "";
          const r = s.response !== undefined ? " · body kept" : "";
          console.log(`  ${String(s.n).padStart(2)}. ${s.verdict.padEnd(7)} ${s.title}${r}${a}`);
          for (const f of (s.assertions?.results ?? []).filter((x: any) => x.pass === false))
            console.log(`        ✗ ${f.id} ${f.title} — expected ${f.expected}, got ${f.actual}`);
        } else if (event === "journey") {
          console.log(`  → ${d.journey.outcome}`);
        } else if (event === "run-error" || event === "fatal") {
          console.log(`  ✗ ${d.message ?? d.line ?? JSON.stringify(d)}`);
        }
      }
    }
  }
  console.log(`  (${Math.round((Date.now() - t0) / 1000)} s)`);
}

for (const n of names) {
  try {
    await runOne(n, COMBOS[n]);
  } catch (e) {
    console.log(`  ✗ ${n} could not run: ${e instanceof Error ? e.message : e}`);
  }
}
console.log("\nDone. Next: npx tsx scripts/build-api-assertions.ts");
