/**
 * Check one template's fields against the live backend.
 *
 *   npm run template:check -- --c 198678                       # default RFQ template, sample mode
 *   npm run template:check -- --c 198678 --type rfp            # the suggested RFP template
 *   npm run template:check -- --c 32461 --uuid <template uuid> --mode full
 *   npm run template:check -- --c 198678 --only API-XTPL-005,API-XTPL-008
 *   npm run template:check -- --c 198678 --buyer-only          # no publish, no vendor sign-in
 *   npm run template:check -- --c 198678 --list [--type rfq]   # the chooser: templates for that type
 *   npm run template:check -- --c 198678 --cases               # generated cases only, nothing fired
 *
 * The run is saved like any other (data/runs + spine.ai's database) and opens
 * at /api/test-report?run=<id>.
 */
import { runTemplateCheck, previewCases } from "../src/model/templateCheck.js";
import { templatesFor } from "../src/model/query.js";

const argv = process.argv.slice(2);
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (k: string) => argv.includes(`--${k}`);

async function main() {
  const c = Number(arg("c") ?? arg("company") ?? 198678);
  const type = (arg("type") ?? "rfq").toLowerCase();
  const uuid = arg("uuid");
  const mode = arg("mode") === "full" ? "full" : "sample";

  if (flag("list")) {
    const r: any = await templatesFor(c, type);
    if (r.error) return console.log(r.error);
    console.log(r.answer);
    for (const t of r.templates) console.log(`  ${t.usable ? "✓" : "✗"} ${t.source.padEnd(15)} ${t.name}  (${t.fieldCount} columns)  ${t.uuid}${t.uuid === r.suggested ? "  ← suggested" : ""}`);
    return;
  }
  if (flag("cases")) {
    const r: any = await previewCases(c, uuid, type, mode === "full" ? "full" : (arg("mode") as any) ?? "all");
    if (r.error) return console.log(r.error);
    console.log(`${r.client.name} · "${r.template.name}" · ${r.counts.total} case(s) · ${r.counts.screenOnly} screen-only`);
    console.log(JSON.stringify(r.counts.byTarget), JSON.stringify(r.counts.byExpected));
    for (const x of r.cases) console.log(`  ${x.id.padEnd(16)} ${x.target.padEnd(11)} ${x.expected.padEnd(7)} ${x.screenOnly ? "screen-only " : ""}${x.title}`);
    return;
  }

  const run = await runTemplateCheck({
    companyId: c,
    templateUuid: uuid,
    type,
    mode,
    only: arg("only")?.split(",").map((s) => s.trim()).filter(Boolean),
    buyerOnly: flag("buyer-only"),
    onLine: (l) => console.log(`  · ${l}`),
  });
  console.log(`\n${run.client.name ?? c} · "${run.template?.name ?? "?"}" · ${run.mode} · ${run.selected} selected of ${run.generated?.total ?? 0}`);
  for (const r of run.results) {
    console.log(`${r.verdict.toUpperCase().padEnd(12)} ${r.id.padEnd(16)} [${r.expected}${r.screenOnly ? ", screen-only" : ""}] ${r.title}`);
    console.log(`             ${r.actual}`);
    if (r.verdict !== "pass") console.log(`             ${r.reason}`);
  }
  const s = run.summary;
  console.log(`\n${s.pass} pass · ${s.fail} fail · ${s.inconclusive} couldn't tell · ${s.notRun} not run · ${s.gaps} screen-only gap(s) confirmed · ${s.serverAlsoEnforces} 'screen-only' rule(s) the server enforces too · ${s.serverErrors} server error(s)`);
  for (const p of run.problems) console.log(`  problem: ${p}`);
  if (run.event) console.log(`event: ${run.event.title} ${run.event.eventGroupUuid ?? ""}${run.event.publishedRound ? ` (published round ${run.event.publishedRound})` : ""}`);
  if (run.runId) console.log(`run saved: data/runs/${run.runId}.json  →  /api/test-report?run=${run.runId}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const pool = await import(new URL("../../procol test/src/db/pool.ts", import.meta.url).href);
      await pool.closePool();
    } catch {
      /* no pool */
    }
    setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
  });
