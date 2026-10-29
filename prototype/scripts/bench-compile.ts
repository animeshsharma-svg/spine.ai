import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileTestCase } from "../src/agents/planner.js";
import { providerLabel } from "../src/ai/llm.js";

/**
 * QA AGENT BENCH — phase 1: compile every challenge into a plan.
 *
 * The compiler gets what the bench hands every engine: the goal and the
 * written steps (with ${BASE_URL} removed, since the executor is pointed at
 * the site with APP_URL). It never sees passWhen — that is the answer key,
 * and the scorer in procol-ui-tests/scripts/bench-run.ts is the only reader.
 *
 *   npx tsx scripts/bench-compile.ts <bench.json> <out dir> [id,id,…]
 *
 * Plans already compiled are kept, so an interrupted run resumes.
 */
const [benchPath, outDir, only] = process.argv.slice(2);
if (!benchPath || !outDir) throw new Error("usage: bench-compile.ts <bench.json> <out dir> [id,id,…]");

interface Challenge {
  id: string;
  title: string;
  goal: string;
  task: string;
}

const bench = JSON.parse(readFileSync(benchPath, "utf8")) as { name: string; challenges: Challenge[] };
const wanted = only ? new Set(only.split(",")) : null;
const todo = bench.challenges.filter((c) => !wanted || wanted.has(c.id));
const plansDir = join(outDir, "plans");
mkdirSync(plansDir, { recursive: true });

console.log(`[bench] compiling ${todo.length} challenge(s) with ${providerLabel()}`);

async function compileOne(c: Challenge): Promise<void> {
  const file = join(plansDir, `${c.id}.json`);
  if (existsSync(file)) return;
  const testCase = [`${c.id}: ${c.title}`, `Goal: ${c.goal}`, c.task.replace(/'?\$\{BASE_URL\}([^'\s]*)'?/g, "$1")].join("\n");
  const started = Date.now();
  let r: Awaited<ReturnType<typeof compileTestCase>> | null = null;
  // The gateway rate-limits by the minute; a plan compiled from the Procol
  // default would be worse than waiting, so wait and try again.
  for (let attempt = 1; attempt <= 4 && !r; attempt++) {
    try {
      r = await compileTestCase(testCase, "site", { site: { name: bench.name }, dryRun: true });
    } catch (e) {
      if (attempt === 4) throw e;
      console.log(`[bench] ${c.id} ${(e as Error).message.slice(0, 80)} — waiting ${attempt * 30}s`);
      await new Promise((res) => setTimeout(res, attempt * 30_000));
    }
  }
  if (!r) throw new Error("not compiled");
  writeFileSync(file, JSON.stringify({ id: c.id, testCase, ms: Date.now() - started, ...r }, null, 2));
  console.log(`[bench] ${c.id} ${r.source} coverage=${r.coverage} steps=${r.plan.steps.length}${r.gaps.length ? ` gaps: ${r.gaps.join("; ").slice(0, 120)}` : ""}`);
}

// A few at a time: the gateway rate-limits, and the compiler retries on its own.
const queue = [...todo];
await Promise.all(
  Array.from({ length: Number(process.env.BENCH_COMPILE_WORKERS) || 2 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) await compileOne(c).catch((e) => console.log(`[bench] ${c!.id} compile error: ${(e as Error).message}`));
  }),
);
writeFileSync(join(outDir, "compile.meta.json"), JSON.stringify({ provider: providerLabel(), at: new Date().toISOString() }, null, 2));
