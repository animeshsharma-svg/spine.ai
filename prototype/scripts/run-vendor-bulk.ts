/**
 * Run the vendor bulk upload feature group against one client — same case
 * library, same safety gate, same engine and same run store as the UI's
 * "Run selected" (/api/features-run), so the run appears in Recent runs and
 * in /api/test-report.
 *
 *   npm run vbu:run -- --company 47053                 # every safe + test-vendor case
 *   npm run vbu:run -- --company 47053 --cases VBU-050,VBU-060
 *   npm run vbu:run -- --company 198678 --features vendorbulk.settings
 *   npm run vbu:run -- --company 47053 --real-mail     # ALSO the Prospect cases that
 *                                                      # email the vendor-management team
 *   npm run vbu:run -- --company 47053 --no-create     # only cases that create nothing
 */
import { openClientContext } from "../src/executor.js";
import { buildChecksFromCases, casesForFeatures, resolveActor, resolveCaseContext } from "../src/checks/caseLibrary.js";
import { runCheck } from "../src/checks/engine.js";
import { newRunId, saveRun } from "../src/runStore.js";
import { providerLabel } from "../src/ai/llm.js";

const ALL = [
  "vendorbulk.file", "vendorbulk.access", "vendorbulk.rows", "vendorbulk.onboarding",
  "vendorbulk.dedup", "vendorbulk.data", "vendorbulk.settings",
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const companyId = Number(arg("company") ?? 47053);
  const features = (arg("features") ?? ALL.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const only = (arg("cases") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  let cases = casesForFeatures(features);
  if (only.length) cases = cases.filter((c) => only.includes(c.id));
  console.log(`${cases.length} case(s) · company ${companyId} · real-mail ${flag("real-mail") ? "ON" : "off"} · create ${flag("no-create") ? "off" : "on"}`);

  const client = await openClientContext(companyId);
  const startedAt = Date.now();
  try {
    const ctx = await resolveCaseContext(client);
    ctx.vbuRealMail = flag("real-mail");
    ctx.vbuCreate = !flag("no-create");
    const actor = await resolveActor(client);
    const { checks, skipped } = buildChecksFromCases(client, cases, ctx, actor);
    console.log(`as ${actor.role ?? "?"} (${(actor.email ?? "").replace(/^(.{3}).*@/, "$1***@")}) · ${checks.length} to run · ${skipped.length} skipped`);
    if (ctx.vbu) console.log("settings:", JSON.stringify(ctx.vbu.effective));

    const results = [];
    // One case may never hang the run: a stuck socket (seen on the sandbox) is
    // recorded as "couldn't tell" after 15 minutes and the run moves on. The
    // limit sits above the slowest honest case (a baseline upload, then a
    // 10-minute wait for every row).
    const LIMIT_MS = 15 * 60_000;
    for (const chk of checks) {
      let timer: NodeJS.Timeout | undefined;
      const r: any = await Promise.race([
        runCheck(client, chk),
        new Promise((resolve) =>
          (timer = setTimeout(
            () =>
              resolve({
                ...(({ exec, ...meta }) => meta)(chk as any),
                httpStatus: null, accepted: false, message: "timed out", durationMs: LIMIT_MS,
                pass: false, inconclusive: true,
                verdict: `no answer within ${LIMIT_MS / 60_000} minutes (the sandbox or the network hung) — nothing proved`,
              }),
            LIMIT_MS,
          )),
        ),
      ]);
      clearTimeout(timer);
      results.push(r);
      const mark = r.pass ? "PASS" : r.inconclusive ? "????" : "FAIL";
      console.log(`${mark} ${r.id} ${r.scenario}\n     ${r.verdict}`);
    }

    const id = newRunId();
    saveRun({
      id,
      ts: new Date().toISOString(),
      request: `features: ${features.join(", ")}${only.length ? ` (cases ${only.join(", ")})` : ""}`,
      companyId,
      companyName: client.companyName ?? null,
      provider: providerLabel(),
      durationMs: Date.now() - startedAt,
      report: undefined,
      events: [{ agent: "System", kind: "plan", text: "feature run (vbu:run)", data: { skipped } } as any],
      flowResults: [],
      validationResults: [],
      checkResults: results,
    });

    const pass = results.filter((r: any) => r.pass).length;
    const inc = results.filter((r: any) => !r.pass && r.inconclusive).length;
    const fail = results.length - pass - inc;
    const http5xx = results.filter((r: any) => typeof r.httpStatus === "number" && r.httpStatus >= 500).length;
    const worker = results.filter((r: any) => r.asyncServerError).length;
    console.log(`\n${pass} pass · ${fail} fail · ${inc} couldn't tell · ${skipped.length} skipped · HTTP 5xx ${http5xx} · worker errors ${worker}`);
    for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
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
