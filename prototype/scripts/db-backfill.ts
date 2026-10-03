/**
 * Fill spine.ai's product tables (migrations 009–017) from everything that
 * already exists:
 *
 *   1. the catalog          config/featureTree.ts, data/journeys.json, data/test-cases.json,
 *                           data/api-cases*.json, assistant drafts, compiled plans
 *   2. runs                 data/runs/*.json (and any run the older `runs` table holds
 *                           whose file is gone), data/matrix/*.json, the UI↔API
 *                           cross-check results
 *   3. the test-record ledger  from the runs, plus the QA vendors (qa_vendors)
 *   4. defects              the newest docs/bugs/Procol_bugs_found_*.xlsx, its
 *                           "Test cases" column, and their occurrences in the runs
 *   5. support tickets      owner organisation, and links to defects by shared case id
 *   6. companies            the newest settings snapshot of each
 *
 *   npm run db:backfill                 everything
 *   npm run db:backfill -- --only runs  one part: catalog | runs | records | defects | tickets | companies
 *   npm run db:backfill -- --force      rewrite runs even when their file has not changed
 *
 * Idempotent: a second run changes nothing (an unchanged run file is skipped
 * by its hash; everything else is an upsert).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { closeSpineDb, spineDb } from "../src/db/spineDb.js";
import { defaultContext, ensureCompany, withService, type OrgContext } from "../src/db/tenant.js";
import { syncCatalog, syncPlans } from "../src/db/catalogSync.js";
import { linkOccurrences, mapCrosscheckRun, mapMatrixRun, mapPoRun, mapRunRecord, mapTrail, writeLedgerRun, type LedgerRun } from "../src/db/runLedger.js";
import { importDefects, newestWorkbook, parseWorkbook } from "../src/db/defects.js";
import { PROTO, REPO } from "../src/db/catalogSource.js";
import type { RunRecord } from "../src/runStore.js";
import { importRuns } from "../src/db/runHistory.js";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const force = args.includes("--force");
const want = (part: string) => !only || only === part;

const db = await spineDb();
if (!db) {
  console.error("✗ SPINE_DB_URL is not set, or Postgres is not running.");
  process.exit(1);
}

const t0 = Date.now();
const changed: string[] = [];
try {
  const ctx = await withService(db, (c) => defaultContext(c), "backfill");
  console.log(`spine.ai backfill → organisation "${ctx.orgSlug}" (#${ctx.orgId}), environment "${ctx.environmentKey}"\n`);

  // ── 1. catalog ──
  if (want("catalog")) {
    const r = await withService(db, (c) => syncCatalog(c, ctx), "backfill");
    console.log(`catalog   features ${r.features.upserted} (${r.features.retired} retired) · journeys ${r.journeys.upserted} · cases ${r.cases.total}: ${r.cases.created} new, ${r.cases.newVersions} new version(s), ${r.cases.retired} retired, ${r.cases.generated} assistant draft(s) · plans ${r.plans.total}: ${r.plans.created} new, ${r.plans.skippedNoCase} for cases not in the catalog`);
    if (r.cases.created || r.cases.newVersions || r.plans.created || r.cases.retired) changed.push("catalog");
  }

  // ── 2. runs ──
  if (want("runs")) {
    const runsDir = join(PROTO, "data", "runs");
    const files = existsSync(runsDir) ? readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort() : [];
    const tally = { written: 0, skipped: 0, failed: 0, results: 0, assertions: 0, evidence: 0, records: 0 };
    const fail = (what: string, e: unknown) => {
      tally.failed++;
      console.warn(`  ✗ ${what}: ${(e as Error).message}`);
    };
    const write = async (run: LedgerRun, what: string) => {
      try {
        const o = await withService(db, (c) => writeLedgerRun(c, ctx, run, { basis: "backfilled", force }), "backfill");
        if (o.skipped) tally.skipped++;
        else {
          tally.written++;
          tally.results += o.results;
          tally.assertions += o.assertions;
          tally.evidence += o.evidence;
          tally.records += o.records;
        }
      } catch (e) {
        fail(what, e);
      }
    };
    const fileIds = new Set<string>();
    // run files the older runs/results tables never got (a script that exits
    // right after saveRun cuts its background copy off): copy them there too,
    // because /api/metrics and /api/track-record read those tables
    const inOlder = new Set((await db.query<{ id: string }>(`SELECT id FROM runs`)).rows.map((r) => r.id));
    const missingOlder: RunRecord[] = [];
    for (const f of files) {
      try {
        const rec = JSON.parse(readFileSync(join(runsDir, f), "utf8")) as RunRecord;
        if (rec?.id && rec?.ts && !inOlder.has(rec.id)) missingOlder.push(rec);
      } catch {
        /* reported below */
      }
    }
    if (missingOlder.length) {
      const r = await importRuns(missingOlder);
      console.log(`older     ${r.runs} run file(s) were missing from the older runs table — copied (${r.results} results)`);
      changed.push("older-runs");
    }
    for (const f of files) {
      let raw: string;
      let rec: RunRecord;
      try {
        raw = readFileSync(join(runsDir, f), "utf8");
        rec = JSON.parse(raw);
      } catch (e) {
        fail(f, e);
        continue;
      }
      if (!rec?.id || !rec?.ts) {
        fail(f, new Error("no id or ts"));
        continue;
      }
      fileIds.add(rec.id);
      await write(mapRunRecord(rec, { rawText: raw, sourcePath: `prototype/data/runs/${f}` }), f);
    }
    // runs only the older table still has (their file was removed while the database was down)
    const legacy = await db.query(`SELECT id FROM runs ORDER BY id`);
    let fromLegacy = 0;
    for (const { id } of legacy.rows) {
      if (fileIds.has(id)) continue;
      const r = await db.query(`SELECT record FROM runs WHERE id = $1`, [id]);
      const rec = r.rows[0]?.record as RunRecord | undefined;
      if (!rec?.id) continue;
      fromLegacy++;
      await write(mapRunRecord(rec, { sourcePath: null }), `legacy run ${id}`);
    }
    // bidding matrix
    const mDir = join(PROTO, "data", "matrix");
    let matrix = 0;
    if (existsSync(mDir))
      for (const f of readdirSync(mDir).filter((n) => n.endsWith(".json")).sort()) {
        try {
          const raw = readFileSync(join(mDir, f), "utf8");
          matrix++;
          await write(mapMatrixRun(f.replace(/\.json$/, ""), JSON.parse(raw), raw), `matrix ${f}`);
        } catch (e) {
          fail(`matrix ${f}`, e);
        }
      }
    // UI↔API cross-check
    const xDir = join(REPO, "procol-ui-tests", "findings", "crosscheck");
    let xchk = 0;
    if (existsSync(xDir))
      for (const d of readdirSync(xDir).sort()) {
        const file = join(xDir, d, "result.json");
        if (!existsSync(file)) continue;
        try {
          const raw = readFileSync(file, "utf8");
          const x = JSON.parse(raw);
          if (!x?.companyId) continue;
          xchk++;
          await write(mapCrosscheckRun(d, x, raw), `cross-check ${d}`);
        } catch (e) {
          fail(`cross-check ${d}`, e);
        }
      }
    // browser journeys and purchase-order runs (kept in their own folders)
    let trails = 0;
    let poRuns = 0;
    for (const [dir, map, kind] of [
      [join(PROTO, "data", "ui-trails"), mapTrail, "trail"],
      [join(PROTO, "data", "po-runs"), mapPoRun, "po-run"],
    ] as const) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
        try {
          const raw = readFileSync(join(dir, f), "utf8");
          const x = JSON.parse(raw);
          if (!Number.isInteger(x?.companyId) || x.companyId <= 0) {
            fail(`${kind} ${f}`, new Error("names no company — not stored"));
            continue;
          }
          if (kind === "trail") trails++;
          else poRuns++;
          await write(map(x, raw), `${kind} ${f}`);
        } catch (e) {
          fail(`${kind} ${f}`, e);
        }
      }
    }
    // backend commit of runs the backend watcher started
    const watched = await withService(
      db,
      async (c) => {
        const w = await c.query(`SELECT to_sha, runs FROM backend_watch_log WHERE jsonb_array_length(runs) > 0`);
        let n = 0;
        for (const row of w.rows)
          for (const r of row.runs ?? []) {
            const id = r?.runId ?? r?.id;
            if (typeof id === "string" && /^[0-9a-f]{7,40}$/.test(row.to_sha)) n += (await c.query(`UPDATE test_runs SET backend_sha = $2, trigger = 'backend-watch', trigger_basis = 'recorded' WHERE id = $1 AND backend_sha IS DISTINCT FROM $2`, [id, row.to_sha])).rowCount ?? 0;
          }
        return n;
      },
      "backfill",
    );
    console.log(
      `runs      ${files.length} run file(s), ${fromLegacy} only in the older table, ${matrix} matrix run(s), ${xchk} cross-check run(s), ${trails} browser journey(s), ${poRuns} PO run(s): ${tally.written} written, ${tally.skipped} unchanged, ${tally.failed} failed` +
        (tally.written ? ` · ${tally.results} results, ${tally.assertions} field checks, ${tally.evidence} evidence, ${tally.records} test-record links` : "") +
        (watched ? ` · ${watched} run(s) tied to a backend commit` : ""),
    );
    if (tally.written || watched) changed.push("runs");
    // runs can name cases the catalog files do not have yet (kept as 'observed'):
    // their compiled plans can be attached now
    const plans = await withService(db, (c) => syncPlans(c, ctx), "backfill");
    if (plans.created) {
      console.log(`plans     ${plans.created} more compiled plan(s) attached to cases first seen in runs`);
      changed.push("plans");
    }
    if (tally.failed) process.exitCode = 1;
  }

  // ── 3. QA vendors into the ledger ──
  if (want("records") || want("runs")) {
    const n = await withService(db, (c) => qaVendors(c, ctx), "backfill");
    console.log(`records   ${n.vendors} QA vendor compan(ies) and ${n.users} vendor user(s) in the test-record ledger (${n.added} new)`);
    if (n.added) changed.push("records");
  }

  // ── 4. defects ──
  if (want("defects")) {
    const file = newestWorkbook();
    if (!file) console.log("defects   no docs/bugs/Procol_bugs_found_*.xlsx — skipped");
    else {
      const parsed = parseWorkbook(file);
      const name = file.slice(REPO.length + 1);
      const r = await withService(db, async (c) => {
        const imp = await importDefects(c, ctx, parsed, name);
        const occ = await linkOccurrences(c, ctx);
        return { ...imp, occ };
      }, "backfill");
      const by = (k: string) => parsed.filter((d) => d.category === k).length;
      console.log(`defects   ${name}: ${by("bug")} bugs, ${by("question")} to confirm, ${by("data-problem")} data problems (${r.created} new) · ${r.cases} exact case link(s)` +
        `${r.unresolvedCases.length ? ` (${r.unresolvedCases.length} not in the catalog: ${r.unresolvedCases.join(", ")})` : ""} · ${r.occ} new occurrence(s) found in the runs` +
        `${r.unknownClients.length ? ` · UNKNOWN client name(s): ${r.unknownClients.join(", ")}` : ""}`);
      if (r.created || r.occ) changed.push("defects");
    }
  }

  // ── 5. support tickets ──
  if (want("tickets")) {
    const r = await withService(db, async (c) => {
      const owned = await c.query(`UPDATE support_tickets SET org_id = $1 WHERE org_id IS NULL`, [ctx.orgId]);
      const linked = await c.query(
        `INSERT INTO support_ticket_defects (org_id, ticket_id, defect_id, linked_by)
         SELECT DISTINCT $1::bigint, t.ticket_id, dc.defect_id, 'backfill: the ticket''s regression case is one of the defect''s cases'
           FROM support_tickets t JOIN defect_cases dc ON dc.org_id = $1 AND dc.case_key = ANY(t.linked_case_ids)
          WHERE t.org_id = $1
         ON CONFLICT DO NOTHING`,
        [ctx.orgId],
      );
      return { owned: owned.rowCount ?? 0, linked: linked.rowCount ?? 0 };
    }, "backfill");
    console.log(`tickets   ${r.owned} ticket(s) given their organisation · ${r.linked} new ticket→defect link(s)`);
    if (r.owned || r.linked) changed.push("tickets");
  }

  // ── 6. companies: newest settings snapshot ──
  if (want("companies")) {
    const n = await withService(db, async (c) => {
      for (const id of (await c.query(`SELECT DISTINCT company_id FROM model_snapshots`)).rows.map((x: any) => Number(x.company_id)))
        await ensureCompany(c, ctx, id, (await c.query(`SELECT company_name FROM model_latest WHERE company_id = $1`, [id])).rows[0]?.company_name);
      const u = await c.query(
        `UPDATE target_companies t SET latest_snapshot_id = m.data_snapshot_id
           FROM model_latest m WHERE t.org_id = $1 AND t.procol_company_id = m.company_id AND t.latest_snapshot_id IS DISTINCT FROM m.data_snapshot_id`,
        [ctx.orgId],
      );
      return u.rowCount ?? 0;
    }, "backfill");
    console.log(`companies ${n} compan(ies) pointed at a newer settings snapshot`);
    if (n) changed.push("companies");
  }

  if (changed.length)
    await withService(db, (c) =>
      c.query(`INSERT INTO audit_log (org_id, actor_label, action, entity_type, entity_id, summary) VALUES ($1, 'backfill', 'data.backfilled', 'database', $2, $3)`, [
        ctx.orgId,
        changed.join(","),
        `Backfill changed: ${changed.join(", ")}.`,
      ]),
    );
  console.log(`\n${changed.length ? `Done — changed: ${changed.join(", ")}` : "Done — nothing to change (already up to date)"} (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
} catch (e) {
  console.error(`✗ ${(e as Error).stack ?? (e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeSpineDb();
}

async function qaVendors(c: import("pg").PoolClient, ctx: OrgContext): Promise<{ vendors: number; users: number; added: number }> {
  const rows = (await c.query(`SELECT * FROM qa_vendors ORDER BY id`)).rows;
  let added = 0;
  let users = 0;
  for (const v of rows) {
    const companyId = await ensureCompany(c, ctx, Number(v.workspace_id), null, new Date(v.created_at).toISOString());
    const put = async (type: "vendor-company" | "vendor-user", uuid: string | null, pid: number | null, title: string, details: Record<string, unknown>) => {
      if (!uuid && !pid) return;
      const r = await c.query(
        `INSERT INTO test_records (org_id, environment_id, company_id, record_type, procol_uuid, procol_id, title, created_by_label, created_at, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (org_id, environment_id, record_type, procol_key) DO UPDATE SET
           procol_id = coalesce(test_records.procol_id, EXCLUDED.procol_id), title = coalesce(test_records.title, EXCLUDED.title),
           created_by_label = coalesce(test_records.created_by_label, EXCLUDED.created_by_label),
           created_at = least(test_records.created_at, EXCLUDED.created_at), details = test_records.details || EXCLUDED.details
         RETURNING (xmax = 0) AS inserted`,
        [ctx.orgId, ctx.environmentId, companyId, type, uuid, pid, title, `${v.created_by} (qa_vendors #${v.id})`, v.created_at, JSON.stringify(details)],
      );
      if (r.rows[0]?.inserted) added++;
    };
    await put("vendor-company", v.vendor_company_uuid, Number(v.vendor_company_id), v.name, { home_company_id: v.home_company_id, link_status: v.link_status, login_ok: v.login_ok });
    if (v.user_uuid || v.user_id) {
      users++;
      // the address is a reserved test domain (qa_…@example.com), not a person
      await put("vendor-user", v.user_uuid, v.user_id ? Number(v.user_id) : null, v.name, { email: v.email });
    }
  }
  return { vendors: rows.length, users, added };
}
