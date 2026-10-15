/**
 * Run the vendor revalidation feature group against one client — the same
 * case library, engine and run store as the UI's "Run selected", so the run
 * appears in Recent runs and in /api/test-report.
 *
 *   npm run reval:run -- --company 47053                     # every case this machine can run
 *   npm run reval:run -- --company 47053 --cases A-01,G-14   # by guide id (or API-XREV-A-01)
 *   npm run reval:run -- --company 47053 --tiers read,audit,listing
 *   npm run reval:run -- --company 198678 --cases H-01       # the client-with-it-off case
 *
 * read / audit / listing cases change nothing. config / run cases need a
 * Procol employee token in prototype/.env as VR_QA_TOKEN and write only to
 * clients in VR_WRITE_CLIENTS (default 47053); see src/checks/revalidation.ts.
 */
import { openClientContext } from "../src/executor.js";
import { buildChecksFromCases, casesForFeatures, resolveActor } from "../src/checks/caseLibrary.js";
import { runCheck } from "../src/checks/engine.js";
import { newRunId, saveRun } from "../src/runStore.js";
import { providerLabel } from "../src/ai/llm.js";
import { FEATURE_TREE } from "../config/featureTree.js";

const ALL = FEATURE_TREE.find((g) => g.id === "revalidation")!.children.map((c) => c.id);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const companyId = Number(arg("company") ?? 47053);
  const features = (arg("features") ?? ALL.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const only = (arg("cases") ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith("API-XREV-") ? s : `API-XREV-${s}`));
  const tiers = (arg("tiers") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  let cases = casesForFeatures(features).filter((c) => c.reval);
  if (only.length) cases = cases.filter((c) => only.includes(c.id));
  if (tiers.length) cases = cases.filter((c) => tiers.includes(c.reval!.tier));
  console.log(`${cases.length} case(s) · company ${companyId} · employee token ${process.env.VR_QA_TOKEN ? "set" : "NOT set (config / run cases will say so)"}`);

  const client = await openClientContext(companyId);
  const startedAt = Date.now();
  try {
    const actor = await resolveActor(client);
    const { checks, skipped } = buildChecksFromCases(client, cases, {}, actor);
    console.log(`session: ${actor.role ?? "?"} (${(actor.email ?? "").replace(/^(.{3}).*@/, "$1***@")}) · ${checks.length} to run · ${skipped.length} not run unattended`);

    const results: any[] = [];
    for (const chk of checks) {
      const r: any = await runCheck(client, chk);
      results.push(r);
      const mark = r.pass ? "PASS" : r.inconclusive ? (/^not run/.test(r.verdict) ? "SKIP" : "????") : "FAIL";
      console.log(`${mark} ${r.id.replace("API-XREV-", "")} ${r.scenario}\n     ${r.verdict}${r.knownBug ? `  → ${r.knownBug.id}` : ""}`);
    }

    const id = newRunId();
    saveRun({
      id,
      ts: new Date().toISOString(),
      request: `features: ${features.join(", ")}${only.length ? ` (cases ${only.join(", ")})` : ""}${tiers.length ? ` (tiers ${tiers.join(", ")})` : ""}`,
      companyId,
      companyName: client.companyName ?? null,
      provider: providerLabel(),
      durationMs: Date.now() - startedAt,
      report: undefined,
      events: [{ agent: "System", kind: "plan", text: "feature run (reval:run)", data: { skipped } } as any],
      flowResults: [],
      validationResults: [],
      checkResults: results,
    });

    const pass = results.filter((r) => r.pass).length;
    const notRun = results.filter((r) => !r.pass && r.inconclusive && /^not run/.test(r.verdict)).length;
    const inc = results.filter((r) => !r.pass && r.inconclusive).length - notRun;
    const fail = results.length - pass - inc - notRun;
    console.log(`\n${pass} pass · ${fail} fail · ${inc} couldn't tell · ${notRun} could not be set up here · ${skipped.length} not run unattended (dev / manual / ui / code)`);
    console.log(`run saved: data/runs/${id}.json  →  /api/test-report?run=${id}`);
  } finally {
    await client.dispose().catch(() => {});
    try {
      const pool = await import(new URL("../../procol test/src/db/pool.ts", import.meta.url).href);
      await pool.closePool();
    } catch {
      /* already closed */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
