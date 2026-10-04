/**
 * BUILD THE AUTOMATION EXEMPLARS — `npx tsx scripts/build-exemplars.ts`
 *
 * Collects every case with a working automation (stored full plans, runnable
 * library cases, validated deep-dig twins, approved drafts), validates each plan
 * in code, and writes data/exemplars.json (src/agents/exemplars.ts). Then run
 * `npm run rag:build` so the memory embeds them (kind automation-exemplar).
 *
 *   --dry      count only, write nothing
 *   --query "<case words>"   show the closest exemplars for a case (after a build)
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const { collectExemplars, writeExemplars, findExemplars, exactFit, EXEMPLARS_FILE } = await import("../src/agents/exemplars.js");
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const q = arg("query");
if (q) {
  const hits = await findExemplars(q, { k: 6 });
  for (const h of hits)
    console.log(
      `${h.score.toFixed(3)}  ${h.ex.id.padEnd(16)} ${h.ex.source.padEnd(13)} dense ${h.dense.toFixed(3)} words ${h.words.toFixed(2)} struct ${h.structure.toFixed(2)} ${h.verdict.verdict.padEnd(10)} ${h.ex.title.slice(0, 70)}\n      ${h.ex.shape.recipe} · ${h.ex.shape.actor} ${h.ex.shape.op}${h.ex.shape.endpoint ? ` (${h.ex.shape.endpoint})` : ""} → ${h.ex.shape.outcome}${h.ex.shape.code ? ` ${h.ex.shape.code}` : ""}${h.differs.length ? ` | differs: ${h.differs.join("; ")}` : ""}`,
    );
  const fit = exactFit(q, hits);
  console.log(fit ? `\nEXACT FIT: ${fit.why}` : "\nno exact fit — the model would get these as worked examples");
  process.exit(0);
}
const t0 = Date.now();
const r = await collectExemplars((s) => console.log(s));
console.log(`exemplars: ${r.exemplars.length} (${Object.entries(r.counts).map(([k, n]) => `${k} ${n}`).join(", ")}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`with a copyable plan: ${r.exemplars.filter((e) => e.plan).length}; shape hints only: ${r.exemplars.filter((e) => !e.plan).length}`);
console.log("skipped:", JSON.stringify(r.skipped));
if (!process.argv.includes("--dry")) {
  await writeExemplars(r.exemplars);
  console.log(`wrote ${EXEMPLARS_FILE} — now run \`npm run rag:build\` so the memory embeds them`);
}
process.exit(0);
