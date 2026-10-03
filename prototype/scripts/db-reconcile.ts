/**
 * EVERY NUMBER THE DASHBOARD SHOWS MUST MATCH THE DATABASE.
 *
 *   npm run db:reconcile                    report (exit 1 on any mismatch)
 *   npm run db:reconcile -- --fix           also copy in runs that are missing or out of date
 *   npm run db:reconcile -- --url http://localhost:4391   also ask a running dashboard
 *
 * Four sources are compared:
 *   files     data/runs/*.json, data/matrix, the cross-check results, data/ui-trails, data/po-runs
 *   older     the 001 tables (runs, results) — what /api/metrics and /api/track-record read today
 *   product   the 011 tables (test_runs, run_results, result_steps, result_assertions)
 *   dashboard what the routes answer: /api/runs (listRuns), /api/metrics (successMetrics),
 *             /api/track-record (trackRecord) — called in-process, and over HTTP with --url
 *
 * How the product tables map onto the older ones (the older table has one
 * flat row per verdict):
 *   older 'case' rows        = run_results(kind case) + result_steps(kind plan-step)
 *   older 'journey-step' rows = run_results(kind journey-step) + result_steps(kind attempt)
 *   older 'field-check' rows = result_assertions with a verdict (passed / failed)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { closeSpineDb, spineDb } from "../src/db/spineDb.js";
import { defaultContext, withService } from "../src/db/tenant.js";
import { PROTO, REPO, sha256 } from "../src/db/catalogSource.js";
import { mapCrosscheckRun, mapMatrixRun, mapPoRun, mapRunRecord, mapTrail, writeLedgerRun, type LedgerRun } from "../src/db/runLedger.js";
import { importRuns, trackRecord } from "../src/db/runHistory.js";
import { listRuns, type RunRecord } from "../src/runStore.js";
import { allResults, successMetrics } from "../src/checks/metrics.js";

const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const URL_ARG = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;
const MAX_SHOWN = 15;

const db = await spineDb();
if (!db) {
  console.error("✗ SPINE_DB_URL is not set, or Postgres is not running.");
  process.exit(1);
}

let problems = 0;
const section = (t: string) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 70 - t.length))}`);
function check(label: string, mismatches: string[], okNote = ""): void {
  if (!mismatches.length) {
    console.log(`  ✓ ${label}${okNote ? ` — ${okNote}` : ""}`);
    return;
  }
  problems += mismatches.length;
  console.log(`  ✗ ${label} — ${mismatches.length} mismatch(es)`);
  for (const m of mismatches.slice(0, MAX_SHOWN)) console.log(`      ${m}`);
  if (mismatches.length > MAX_SHOWN) console.log(`      … and ${mismatches.length - MAX_SHOWN} more`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined ? b === null || b === undefined : b !== null && b !== undefined && Math.abs(a - b) < 1e-9);

try {
  const ctx = await withService(db, (c) => defaultContext(c), "reconcile");
  const q = <T = any>(sql: string, p: unknown[] = []) => withService(db, async (c) => (await c.query(sql, p)).rows as T[], "reconcile");

  // ── 1. which runs exist where ──────────────────────────────────────────────
  section("1. Runs: files ↔ older tables ↔ product tables");
  const runsDir = join(PROTO, "data", "runs");
  const files = new Map<string, { text: string; rec: RunRecord }>();
  // a fresh clone has no data/runs (run outputs are git-ignored): nothing on disk to compare
  for (const f of (existsSync(runsDir) ? readdirSync(runsDir) : []).filter((n) => n.endsWith(".json")).sort()) {
    try {
      const text = readFileSync(join(runsDir, f), "utf8");
      const rec = JSON.parse(text) as RunRecord;
      if (rec?.id && rec?.ts) files.set(rec.id, { text, rec });
    } catch {
      /* listRuns skips unreadable files too */
    }
  }
  const older = new Set((await db.query<{ id: string }>(`SELECT id FROM runs`)).rows.map((r) => r.id));
  const product = new Map((await q<{ id: string; record_hash: string; source: string }>(`SELECT id, record_hash, source FROM test_runs WHERE org_id = $1`, [ctx.orgId])).map((r) => [r.id, r]));
  const notInOlder = [...files.keys()].filter((id) => !older.has(id));
  const notInProduct = [...files.keys()].filter((id) => !product.has(id));
  const stale = [...files.entries()].filter(([id, f]) => product.has(id) && product.get(id)!.record_hash !== sha256(f.text)).map(([id]) => id);
  const olderOnly = [...older].filter((id) => !files.has(id));
  check(`run files (${files.size}) are all in the older runs table (${older.size})`, notInOlder.map((id) => `${id}: on disk, not in runs — /api/metrics does not count it`));
  check(`run files are all in test_runs`, notInProduct.map((id) => `${id}: on disk, not in test_runs`));
  check(`test_runs copies are up to date with their file`, stale.map((id) => `${id}: the file changed after it was copied`));
  check(`older runs table has no run without a file`, olderOnly.map((id) => `${id}: in runs, no file (deleted while the database was down?)`));

  // the other run stores
  const others: Array<{ label: string; ids: Map<string, { text: string; map: () => LedgerRun }> }> = [];
  const collect = (label: string, dir: string, pick: (f: string) => string | null, map: (base: string, x: any, raw: string) => LedgerRun) => {
    const ids = new Map<string, { text: string; map: () => LedgerRun }>();
    if (existsSync(dir))
      for (const f of readdirSync(dir).sort()) {
        const file = pick(f);
        if (!file || !existsSync(file)) continue;
        try {
          const text = readFileSync(file, "utf8");
          const x = JSON.parse(text);
          if (!Number.isInteger(x?.companyId)) continue;
          const run = map(f.replace(/\.json$/, ""), x, text);
          ids.set(run.id, { text, map: () => run });
        } catch {
          /* unreadable */
        }
      }
    others.push({ label, ids });
  };
  collect("matrix runs", join(PROTO, "data", "matrix"), (f) => (f.endsWith(".json") ? join(PROTO, "data", "matrix", f) : null), (b, x, t) => mapMatrixRun(b, x, t));
  collect("cross-check runs", join(REPO, "procol-ui-tests", "findings", "crosscheck"), (d) => join(REPO, "procol-ui-tests", "findings", "crosscheck", d, "result.json"), (b, x, t) => mapCrosscheckRun(b, x, t));
  collect("browser journeys", join(PROTO, "data", "ui-trails"), (f) => (f.endsWith(".json") ? join(PROTO, "data", "ui-trails", f) : null), (_b, x, t) => mapTrail(x, t));
  collect("PO runs", join(PROTO, "data", "po-runs"), (f) => (f.endsWith(".json") ? join(PROTO, "data", "po-runs", f) : null), (_b, x, t) => mapPoRun(x, t));
  for (const o of others) {
    const miss = [...o.ids.keys()].filter((id) => !product.has(id));
    const old = [...o.ids.entries()].filter(([id, v]) => product.has(id) && product.get(id)!.record_hash !== sha256(v.text)).map(([id]) => id);
    check(`${o.label} (${o.ids.size}) are all in test_runs and up to date`, [...miss.map((id) => `${id}: not in test_runs`), ...old.map((id) => `${id}: changed after it was copied`)]);
  }

  if (FIX) {
    const missingOlder = notInOlder.map((id) => files.get(id)!.rec);
    if (missingOlder.length) {
      const r = await importRuns(missingOlder);
      console.log(`  → fixed: copied ${r.runs} run(s) with ${r.results} result(s) into the older tables (and the product tables with them)`);
    }
    let n = 0;
    const toWrite: LedgerRun[] = [
      ...[...new Set([...notInProduct, ...stale])].filter((id) => !notInOlder.includes(id)).map((id) => mapRunRecord(files.get(id)!.rec, { rawText: files.get(id)!.text })),
      ...others.flatMap((o) => [...o.ids.entries()].filter(([id, v]) => !product.has(id) || product.get(id)!.record_hash !== sha256(v.text)).map(([, v]) => v.map())),
    ];
    for (const run of toWrite) {
      await withService(db, (c) => writeLedgerRun(c, ctx, run, { basis: "backfilled" }), "reconcile --fix");
      n++;
    }
    if (n) console.log(`  → fixed: wrote ${n} run(s) into the product tables`);
  }

  // ── 2. per-run verdict counts: older rows vs product rows ──────────────────
  section("2. Verdicts per run: older results ↔ product tables");
  const olderCounts = await db.query<{ run_id: string; kind: string; verdict: string; n: number }>(`SELECT run_id, kind, verdict, count(*)::int AS n FROM results GROUP BY 1, 2, 3`);
  const productCounts = await q<{ run_id: string; kind: string; verdict: string; n: number }>(
    `SELECT run_id, 'case' AS kind, raw_verdict AS verdict, count(*)::int AS n FROM run_results WHERE org_id = $1 AND kind = 'case' GROUP BY 1, 3
     UNION ALL
     SELECT r.run_id, 'case', s.raw_verdict, count(*)::int FROM result_steps s JOIN run_results r ON r.id = s.result_id WHERE r.org_id = $1 AND s.kind = 'plan-step' GROUP BY 1, 3
     UNION ALL
     SELECT run_id, 'journey-step', raw_verdict, count(*)::int FROM run_results WHERE org_id = $1 AND kind = 'journey-step' GROUP BY 1, 3
     UNION ALL
     SELECT r.run_id, 'journey-step', s.raw_verdict, count(*)::int FROM result_steps s JOIN run_results r ON r.id = s.result_id WHERE r.org_id = $1 AND s.kind = 'attempt' GROUP BY 1, 3
     UNION ALL
     SELECT r.run_id, 'field-check', CASE a.verdict WHEN 'passed' THEN 'pass' ELSE 'fail' END, count(*)::int
       FROM result_assertions a JOIN run_results r ON r.id = a.result_id WHERE r.org_id = $1 AND a.verdict IN ('passed', 'failed') GROUP BY 1, 3`,
    [ctx.orgId],
  );
  const fold = (rows: Array<{ run_id: string; kind: string; verdict: string; n: number }>) => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const k = r.run_id;
      const o = m.get(k) ?? {};
      o[`${r.kind}:${r.verdict}`] = (o[`${r.kind}:${r.verdict}`] ?? 0) + Number(r.n);
      m.set(k, o);
    }
    return m;
  };
  const oc = fold(olderCounts.rows);
  const pc = fold(productCounts);
  const sorted = (o: Record<string, number> | undefined) => Object.fromEntries(Object.entries(o ?? {}).sort());
  const verdictMismatch: string[] = [];
  let compared = 0;
  for (const id of files.keys()) {
    if (!older.has(id) || !product.has(id)) continue;
    compared++;
    if (!eq(sorted(oc.get(id)), sorted(pc.get(id)))) verdictMismatch.push(`${id}: older ${JSON.stringify(sorted(oc.get(id)))} · product ${JSON.stringify(sorted(pc.get(id)))}`);
  }
  check(`every verdict of every run is in both`, verdictMismatch, `${compared} runs, ${olderCounts.rows.reduce((n, r) => n + Number(r.n), 0)} older rows`);
  if (FIX && verdictMismatch.length) {
    // the file is the source of truth: re-copy it into both
    const ids = verdictMismatch.map((m) => m.split(":")[0]);
    const r = await importRuns(ids.map((id) => files.get(id)!.rec));
    for (const id of ids) await withService(db, (c) => writeLedgerRun(c, ctx, mapRunRecord(files.get(id)!.rec, { rawText: files.get(id)!.text }), { basis: "backfilled", force: true }), "reconcile --fix");
    console.log(`  → fixed: re-copied ${r.runs} run(s) from their file into both copies`);
  }

  // ── 3. the run history the dashboard shows (/api/runs → listRuns) ─────────
  section("3. Run history (/api/runs): what each run card says ↔ product tables");
  const cards = listRuns(1_000_000);
  const dbRuns = new Map(
    (
      await q(
        `SELECT t.id, t.results_passed, t.results_failed, t.results_couldnt_tell, t.results_total, t.report_passed, t.report_failed,
                t.journey_outcome, t.journey_steps, t.journey_steps_worked,
                coalesce(ps.passed, 0)::int AS ps_passed, coalesce(ps.failed, 0)::int AS ps_failed, coalesce(ps.ct, 0)::int AS ps_ct, coalesce(ps.n, 0)::int AS ps_n,
                coalesce(fa.total, 0)::int AS fc_total, coalesce(fa.passed, 0)::int AS fc_passed, coalesce(fa.failed, 0)::int AS fc_failed
           FROM test_runs t
           LEFT JOIN (SELECT r.run_id, count(*) FILTER (WHERE s.verdict = 'passed') AS passed, count(*) FILTER (WHERE s.verdict = 'failed') AS failed,
                             count(*) FILTER (WHERE s.verdict = 'couldnt_tell') AS ct, count(*) AS n
                        FROM result_steps s JOIN run_results r ON r.id = s.result_id WHERE s.kind = 'plan-step' AND r.org_id = $1 GROUP BY 1) ps ON ps.run_id = t.id
           LEFT JOIN (SELECT r.run_id, count(*) AS total, count(*) FILTER (WHERE a.verdict = 'passed') AS passed, count(*) FILTER (WHERE a.verdict = 'failed') AS failed
                        FROM result_assertions a JOIN run_results r ON r.id = a.result_id WHERE r.org_id = $1 GROUP BY 1) fa ON fa.run_id = t.id
          WHERE t.org_id = $1 AND t.source = 'run-file'`,
        [ctx.orgId],
      )
    ).map((r: any) => [r.id, r]),
  );
  const cardMismatch: string[] = [];
  for (const card of cards) {
    const r = dbRuns.get(card.id);
    if (!r) {
      cardMismatch.push(`${card.id}: shown on the dashboard, not in test_runs`);
      continue;
    }
    // a card counts plan sub-steps among its checks (they are rows of checkResults)
    const want = {
      passed: r.report_passed ?? r.results_passed + r.ps_passed,
      failed: r.report_failed ?? r.results_failed + r.ps_failed,
      inconclusive: r.results_couldnt_tell + r.ps_ct,
      checks: r.results_total + r.ps_n,
    };
    const got = { passed: card.passed, failed: card.failed, inconclusive: card.inconclusive, checks: card.checks };
    if (!eq(want, got)) cardMismatch.push(`${card.id}: card ${JSON.stringify(got)} · database ${JSON.stringify(want)}`);
    if (card.journey) {
      const jw = { outcome: r.journey_outcome, worked: r.journey_steps_worked, steps: r.journey_steps };
      const jg = { outcome: card.journey.outcome, worked: card.journey.worked, steps: card.journey.steps };
      if (!eq(jw, jg)) cardMismatch.push(`${card.id}: journey card ${JSON.stringify(jg)} · database ${JSON.stringify(jw)}`);
      const fc = card.journey.fieldChecks;
      if (fc && !eq({ total: fc.total, passed: fc.passed, failed: fc.failed }, { total: r.fc_total, passed: r.fc_passed, failed: r.fc_failed }))
        cardMismatch.push(`${card.id}: field checks card ${JSON.stringify(fc)} · database ${JSON.stringify({ total: r.fc_total, passed: r.fc_passed, failed: r.fc_failed })}`);
    }
  }
  check(`run cards (${cards.length}) match test_runs`, cardMismatch);

  const statusOf = await q<{ id: string; status: string; source: string }>(`SELECT id, status, source FROM test_runs WHERE org_id = $1 AND source IN ('ui-trail', 'po-run')`, [ctx.orgId]);
  const st = new Map(statusOf.map((r) => [r.id, r.status]));
  const otherMismatch: string[] = [];
  for (const o of others.filter((x) => x.label === "browser journeys" || x.label === "PO runs"))
    for (const [id, v] of o.ids) {
      const run = v.map();
      const want = run.results[0].verdict;
      if (st.has(id) && st.get(id) !== want) otherMismatch.push(`${id}: card says ${want}, database ${st.get(id)}`);
    }
  check(`browser-journey and PO run cards match test_runs`, otherMismatch);

  // ── 4. the Success page (/api/metrics → successMetrics) ───────────────────
  section("4. Success page (/api/metrics) ↔ product tables");
  const companies = await q<{ id: number; procol_company_id: number; name: string }>(`SELECT id, procol_company_id, name FROM target_companies WHERE org_id = $1 ORDER BY procol_company_id`, [ctx.orgId]);
  const scopes: Array<{ label: string; procol?: number; company: number | null }> = [{ label: "all companies", company: null }, ...companies.map((c) => ({ label: `${c.name} (${c.procol_company_id})`, procol: c.procol_company_id, company: Number(c.id) }))];
  const metricOf = (p: any, pillar: string, key: string) => p.pillars.find((x: any) => x.key === pillar)?.metrics.find((m: any) => m.key === key);
  for (const s of scopes) {
    const page = await successMetrics({ companyId: s.procol });
    const t = (await q(`SELECT * FROM spine_trust_totals($1, $2, 30)`, [ctx.orgId, s.company]))[0];
    const judged = t.passed + t.failed + t.couldnt_tell;
    const mm: string[] = [];
    const ct = metricOf(page, "trust", "couldnt_tell");
    const fl = metricOf(page, "trust", "flaky");
    const jo = metricOf(page, "trust", "journey_success");
    const want = {
      couldnt_tell: judged ? t.couldnt_tell / judged : null,
      flaky: t.repeated ? t.flaky / t.repeated : null,
      journey_success: t.journeys ? t.journeys_completed / t.journeys : null,
    };
    if (!near(ct?.value, want.couldnt_tell)) mm.push(`"couldn't tell" rate: page ${ct?.value} · database ${want.couldnt_tell} (${t.couldnt_tell} of ${judged} case results)`);
    if (!near(fl?.value, want.flaky)) mm.push(`flaky rate: page ${fl?.value} · database ${want.flaky} (${t.flaky} of ${t.repeated} repeated cases)`);
    if (!near(jo?.value, want.journey_success)) mm.push(`journeys reaching the end: page ${jo?.value} · database ${want.journey_success} (${t.journeys_completed} of ${t.journeys})`);
    // the 14-day "couldn't tell" trend
    const daily = await q<{ day: string; passed: number; failed: number; couldnt_tell: number }>(
      `SELECT day::text, sum(passed)::int AS passed, sum(failed)::int AS failed, sum(couldnt_tell)::int AS couldnt_tell
         FROM v_results_daily WHERE org_id = $1 AND kind = 'case' AND ($2::bigint IS NULL OR company_id = $2) GROUP BY 1`,
      [ctx.orgId, s.company],
    );
    const byDay = new Map(daily.map((d) => [d.day, d]));
    for (const p of ct?.trend ?? []) {
      const d = byDay.get(p.day);
      const w = d && d.passed + d.failed + d.couldnt_tell ? d.couldnt_tell / (d.passed + d.failed + d.couldnt_tell) : null;
      if (!near(p.value, w)) mm.push(`"couldn't tell" on ${p.day}: page ${p.value} · database ${w}`);
    }
    // coverage: every result the page counts
    const all = await allResults(s.procol);
    const pageTally = { pass: 0, fail: 0, inconclusive: 0 };
    for (const v of all.map.values()) {
      pageTally.pass += v.pass;
      pageTally.fail += v.fail;
      pageTally.inconclusive += v.inconclusive;
    }
    const dbTally = (
      await q(
        `WITH r AS (SELECT * FROM run_results WHERE org_id = $1 AND ($2::bigint IS NULL OR company_id = $2) AND kind <> 'flow' AND kind <> 'validation')
         SELECT
           (SELECT count(*) FILTER (WHERE verdict = 'passed') FROM r) + (SELECT count(*) FILTER (WHERE s.verdict = 'passed') FROM result_steps s JOIN r ON r.id = s.result_id WHERE s.kind IN ('plan-step', 'attempt'))
             + (SELECT count(*) FILTER (WHERE a.verdict = 'passed') FROM result_assertions a JOIN r ON r.id = a.result_id) AS pass,
           (SELECT count(*) FILTER (WHERE verdict = 'failed') FROM r) + (SELECT count(*) FILTER (WHERE s.verdict = 'failed') FROM result_steps s JOIN r ON r.id = s.result_id WHERE s.kind IN ('plan-step', 'attempt'))
             + (SELECT count(*) FILTER (WHERE a.verdict = 'failed') FROM result_assertions a JOIN r ON r.id = a.result_id) AS fail,
           (SELECT count(*) FILTER (WHERE verdict = 'couldnt_tell') FROM r) + (SELECT count(*) FILTER (WHERE s.verdict = 'couldnt_tell') FROM result_steps s JOIN r ON r.id = s.result_id WHERE s.kind IN ('plan-step', 'attempt')) AS inconclusive`,
        [ctx.orgId, s.company],
      )
    )[0];
    const dbT = { pass: Number(dbTally.pass), fail: Number(dbTally.fail), inconclusive: Number(dbTally.inconclusive) };
    if (!eq(pageTally, dbT)) mm.push(`coverage counts every result: page ${JSON.stringify(pageTally)} · database ${JSON.stringify(dbT)} (page read from ${all.source})`);
    check(`${s.label}`, mm, `couldn't tell ${fmt(want.couldnt_tell)}, flaky ${fmt(want.flaky)}, journeys ${fmt(want.journey_success)}, ${dbT.pass + dbT.fail + dbT.inconclusive} results`);
  }
  const page = await successMetrics({});
  const d = (await q(`SELECT count(*) FILTER (WHERE category = 'bug' AND status IN ('confirmed', 'open'))::int AS bugs,
                             count(*) FILTER (WHERE category = 'question' AND status = 'needs-confirmation')::int AS q,
                             count(*) FILTER (WHERE category = 'data-problem' AND status NOT IN ('fixed', 'wont-fix'))::int AS dp FROM defects WHERE org_id = $1`, [ctx.orgId]))[0];
  check(
    `bug numbers (Success page reads ${page.bugs.file})`,
    [
      ...(page.bugs.verified !== d.bugs ? [`verified bugs: page ${page.bugs.verified} · defects table ${d.bugs}`] : []),
      ...(page.bugs.toConfirm !== d.q ? [`to confirm: page ${page.bugs.toConfirm} · defects table ${d.q}`] : []),
      ...(page.bugs.dataProblems !== d.dp ? [`data problems: page ${page.bugs.dataProblems} · defects table ${d.dp}`] : []),
    ],
    `${d.bugs} bugs, ${d.q} to confirm, ${d.dp} data problems`,
  );

  // ── 5. track records (/api/track-record) ───────────────────────────────────
  section("5. Case track records (/api/track-record) ↔ product tables");
  const sample = (await db.query<{ case_id: string }>(`SELECT DISTINCT case_id FROM results WHERE kind = 'case' AND case_id NOT LIKE '%·%' ORDER BY case_id`)).rows.map((r) => r.case_id);
  const pick = sample.filter((_, i) => i % Math.max(1, Math.floor(sample.length / 60)) === 0).slice(0, 60);
  const trMismatch: string[] = [];
  for (const id of pick) {
    const tr = await trackRecord(id);
    const p = (await q(`SELECT sum(runs)::int AS runs, sum(passed)::int AS passed, sum(failed)::int AS failed, sum(couldnt_tell)::int AS ct FROM v_case_track_record WHERE org_id = $1 AND kind = 'case' AND subject_key = $2`, [ctx.orgId, id]))[0];
    const want = { runs: p.runs ?? 0, passed: p.passed ?? 0, failed: p.failed ?? 0, inconclusive: p.ct ?? 0 };
    const got = tr ? { runs: tr.runs, passed: tr.passed, failed: tr.failed, inconclusive: tr.inconclusive } : { runs: 0, passed: 0, failed: 0, inconclusive: 0 };
    if (!eq(want, got)) trMismatch.push(`${id}: /api/track-record ${JSON.stringify(got)} · database ${JSON.stringify(want)}`);
  }
  check(`${pick.length} sampled cases`, trMismatch);

  // ── 6. a running dashboard, over HTTP ──────────────────────────────────────
  if (URL_ARG) {
    section(`6. The running dashboard at ${URL_ARG}`);
    const get = async (p: string) => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 60_000);
      try {
        const r = await fetch(`${URL_ARG}${p}`, { signal: ac.signal });
        return (await r.json()) as any;
      } finally {
        clearTimeout(t);
      }
    };
    const runs = (await get("/api/runs")).runs as any[];
    const httpMismatch: string[] = [];
    for (const card of runs.filter((r) => r.kind === "api")) {
      const r = dbRuns.get(card.id);
      if (!r) {
        httpMismatch.push(`${card.id}: on /api/runs, not in test_runs`);
        continue;
      }
      const want = { passed: r.report_passed ?? r.results_passed + r.ps_passed, failed: r.report_failed ?? r.results_failed + r.ps_failed, checks: r.results_total + r.ps_n };
      if (!eq(want, { passed: card.passed, failed: card.failed, checks: card.checks })) httpMismatch.push(`${card.id}: /api/runs ${JSON.stringify({ passed: card.passed, failed: card.failed, checks: card.checks })} · database ${JSON.stringify(want)}`);
    }
    for (const card of runs.filter((r) => r.kind !== "api")) if (!st.has(card.id)) httpMismatch.push(`${card.id} (${card.kind}): on /api/runs, not in test_runs`);
    const m = await get("/api/metrics");
    const t = (await q(`SELECT * FROM spine_trust_totals($1, NULL, 30)`, [ctx.orgId]))[0];
    const judged = t.passed + t.failed + t.couldnt_tell;
    const ct = metricOf(m, "trust", "couldnt_tell")?.value;
    if (!near(ct, judged ? t.couldnt_tell / judged : null)) httpMismatch.push(`/api/metrics "couldn't tell" ${ct} · database ${judged ? t.couldnt_tell / judged : null}`);
    check(`/api/runs (${runs.length} cards) and /api/metrics`, httpMismatch);
  }

  console.log(`\n${problems ? `✗ ${problems} mismatch(es)` : "✓ every number checked matches the database"}${FIX ? " (after --fix; re-run to confirm)" : ""}`);
  if (problems) process.exitCode = 1;
} catch (e) {
  console.error(`✗ ${(e as Error).stack ?? (e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeSpineDb();
}

function fmt(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 1000) / 10}%`;
}
