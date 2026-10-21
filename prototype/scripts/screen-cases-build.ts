/**
 * Build the browser plan of every screen case that has none (src/agents/screenModel.ts
 * planForScreenCase): each case is compiled against the event state its screen needs — an
 * awarding case gets a "bid" event the API builds, opened by its route — and the plan is kept
 * in the screen record, so "Run with spotlight" runs it at once.
 *
 *   npx tsx scripts/screen-cases-build.ts [--only <screen-id,…>] [--recompile] [--limit N]
 *
 * No browser is used; only the compiler (the model). Safe beside a running walk.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, "..", ".env") });
process.env.SLINGRING_FAST_TIMEOUT_MS ??= "45000";
const { getScreen, listScreens, planForScreenCase, screenPrep } = await import("../src/agents/screenModel.js");

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const recompile = argv.includes("--recompile");
const limit = Number(arg("limit") ?? 0) || Infinity;
const t = () => new Date().toISOString().slice(11, 19);

const screens = listScreens().filter((s) => !only?.length || only.includes(s.id));
let built = 0, kept = 0, none = 0, failed = 0, seen = 0;
const tally: Record<string, number> = {};
outer: for (const s of screens) {
  const r = getScreen(s.id);
  if (!r) continue;
  const prep = screenPrep(r);
  console.log(`[${t()}] ${r.label} (${r.cases.length} cases) — ${prep.prepared ? `${prep.state} event, ${prep.screenWhat}` : prep.screenWhat}`);
  for (const c of r.cases) {
    if (seen++ >= limit) break outer;
    const res: { plan?: { steps?: unknown[] }; coverage?: string; gaps?: string[]; why?: string; compiledNow?: boolean } = await planForScreenCase(c.id, r.id, undefined, { recompile }).catch((e) => ({ why: (e as Error).message }));
    if (res.why) {
      if (/cannot be expressed/.test(res.why)) {
        none++;
        console.log(`[${t()}]   − ${c.id} none — ${res.why.replace(/^.*?yet:?\s*/, "").slice(0, 140)}`);
      } else {
        failed++;
        console.log(`[${t()}]   ✗ ${c.id} — ${res.why.slice(0, 160)}`);
      }
      continue;
    }
    const steps = (res.plan?.steps ?? []) as Array<{ step: string }>;
    tally[res.coverage ?? "?"] = (tally[res.coverage ?? "?"] ?? 0) + 1;
    if (res.compiledNow) {
      built++;
      console.log(`[${t()}]   + ${c.id} ${res.coverage} · ${steps.length} steps: ${steps.map((x) => x.step).join(" → ").slice(0, 150)}${res.gaps?.length ? ` · gap: ${res.gaps[0].slice(0, 100)}` : ""}`);
    } else kept++;
  }
}
console.log(`[${t()}] done: ${built} built, ${kept} already had a matching plan, ${none} cannot be expressed yet, ${failed} failed · coverage ${JSON.stringify(tally)}`);
process.exit(0);
