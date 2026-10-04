/**
 * Unit tests of spine.ai's product tables (migrations 009–018) and the code
 * around them.
 *
 *   npm run db:unit
 *   node --import tsx --test scripts/db-unit-tests.ts
 *
 * Two kinds:
 *   offline   the pure parts — verdict folding, version hashing, how a run
 *             record becomes rows (and that it matches the older table row for
 *             row), redaction, the bug-sheet dates and workbook. Always run.
 *   database  migrations into a throwaway schema, then the run writer, case
 *             versions, defects and occurrences, row-level security and
 *             retention against real Postgres. Skipped cleanly when
 *             SPINE_DB_URL is unset (CI runs with it unset); the schema is
 *             dropped afterwards.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import * as XLSX from "xlsx";

import { actorOf, journeyCompleted, mapRunRecord, runKindOf, runStatus, triggerOf, verdictOf, writeLedgerRun, linkOccurrences } from "../src/db/runLedger.js";
import { canonicalJson, contentHash } from "../src/db/catalogSource.js";
import { CaseIndex } from "../src/db/catalogSync.js";
import { redactValue } from "../src/db/redact.js";
import { formatSheetDate, parseSheetDate, splitCases, splitClients, importDefects, type DefectInput } from "../src/db/defects.js";
import { buildWorkbook, compareWorkbooks, dateRange } from "./export-bug-sheet.js";
import { resultRows } from "../src/db/runHistory.js";
import { defaultContext, withOrg, withService } from "../src/db/tenant.js";
import { caseHistory, companyRunHistory, companyTrend, defectList, testRecordLedger } from "../src/db/dataRepo.js";
import type { RunRecord } from "../src/runStore.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") }); // never overrides a value already set (CI sets SPINE_DB_URL="")

// ── a small but complete run record ─────────────────────────────────────────

function sampleRun(id = "2026-10-03T00-00-00-001Z"): RunRecord {
  const check = (o: Record<string, unknown>) => ({ flowId: "events.publish", module: "Events", scenario: "s", type: "functional", category: "c", priority: "P1", severity: "High", expected: "reject", layer: "api", inputSummary: "", httpStatus: 422, accepted: false, message: null, durationMs: 10, pass: true, verdict: "refused, as expected", ...o });
  return {
    id,
    ts: "2026-10-03T00:00:00.001Z",
    request: "api plan: Publishing twice is refused",
    companyId: 198678,
    companyName: "PROCOL DEMO",
    provider: "deterministic",
    durationMs: 5000,
    report: undefined,
    events: [],
    flowResults: [],
    validationResults: [],
    checkResults: [
      check({ id: "UT-CASE-001", scenario: "Publishing twice is refused", request: { method: "POST", path: "/x", body: { access_token: "abc", title: "QA_Platform_x" } } }),
      check({ id: "UT-CASE-001·act1", scenario: "step one", pass: true }),
      check({ id: "UT-CASE-002", scenario: "A crash", pass: false, httpStatus: 500, request: { method: "GET", path: "/y" } }),
      check({ id: "UT-CASE-003", scenario: "Not sure", pass: false, inconclusive: true, actor: "vendor", ownDraft: "DRAFTUUID" }),
    ] as any,
    journey: {
      eventType: "rfq_only",
      label: "RFQ only",
      stages: [],
      title: "QA_Platform_journey_1",
      stageSeconds: 60,
      features: {} as any,
      outcome: "All 2 steps worked.",
      made: { eventGroupUuid: "EVTUUID", bidUuid: "BIDUUID", vendorCompanyUuid: "VENDUUID", status: "active" },
      startedAt: "2026-10-03T00:00:00.001Z",
      durationMs: 4000,
      waitedMs: 0,
      steps: [
        { n: 1, kind: "create_draft", actor: "buyer", title: "Create the draft", expected: "created", actual: "Draft EVTUUID was created.", verdict: "worked", status: 200, ms: 100, startedAt: "2026-10-03T00:00:01.000Z", call: { method: "POST", path: "/event_groups", body: { password: "p" } }, response: { uuid: "EVTUUID" }, assertions: { total: 3, passed: 1, failed: 1, skipped: 1, results: [{ id: "API-FDRAFT-001", path: "uuid", op: "exists", title: "has uuid", expected: "a uuid", severity: "high", pass: true }, { id: "API-FDRAFT-002", path: "x", op: "eq", title: "x", expected: "1", severity: "low", pass: false, actual: "2" }, { id: "API-FDRAFT-003", path: "y", op: "eq", title: "y", expected: "1", severity: "low", pass: null }] } },
        { n: 2, kind: "publish", actor: "buyer", title: "Publish", expected: "published", actual: "Published.", verdict: "worked", status: 200, ms: 100, startedAt: "2026-10-03T00:00:02.000Z", attempts: [{ attempt: 1, verdict: "refused", status: 422, actual: "Refused once.", startedAt: "2026-10-03T00:00:01.500Z", failureClass: "transient" as any }] },
      ] as any,
    } as any,
  };
}

// ── offline ─────────────────────────────────────────────────────────────────

describe("product tables — pure rules", () => {
  test("every runner word folds to the four verdicts; couldn't tell is never a pass", () => {
    assert.equal(verdictOf("worked"), "passed");
    assert.equal(verdictOf("PASS"), "passed");
    for (const w of ["refused", "broken", "fail", "defect"]) assert.equal(verdictOf(w), "failed");
    for (const w of ["inconclusive", "couldn't tell", "partial", "unread"]) assert.equal(verdictOf(w), "couldnt_tell");
    for (const w of ["not-run", "skipped", "blocked", "", "banana"]) assert.equal(verdictOf(w), "not_run");
  });
  test("actors, triggers and run kinds", () => {
    assert.equal(actorOf("vendor 2"), "vendor");
    assert.equal(actorOf("evaluator"), "buyer");
    assert.equal(actorOf("platform"), "system");
    assert.deepEqual(triggerOf({ request: "run-all: rfq_only batch 1" }), { trigger: "agent", basis: "inferred", label: "run-all" });
    assert.equal(triggerOf({ request: "features: events.publish" }).trigger, "manual");
    assert.equal(triggerOf({ request: "Create an RFQ event" }).trigger, "assistant");
    assert.deepEqual(triggerOf({ request: "x", trigger: "nightly" }), { trigger: "nightly", basis: "recorded", label: null });
    assert.equal(triggerOf({ request: "features: x" }, "ci").trigger, "ci");
    assert.equal(runKindOf({ request: "api plan: x" } as any), "api-plan");
    assert.equal(runKindOf({ request: "features: x", journey: {} } as any), "journey");
    assert.equal(journeyCompleted("All 17 steps worked."), true);
    assert.equal(journeyCompleted("14 of 17 steps worked; the award was refused at step 15."), false);
    assert.equal(runStatus([{ verdict: "passed" }, { verdict: "couldnt_tell" }]), "couldnt_tell");
    assert.equal(runStatus([{ verdict: "passed" }, { verdict: "failed" }]), "failed");
    assert.equal(runStatus([]), "not_run");
  });
  test("a case version is its content, whatever the key order", () => {
    assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } }), '{"a":{"c":[3,{"e":2,"f":1}],"d":2},"b":1}');
    assert.equal(contentHash({ x: 1, y: 2 }), contentHash({ y: 2, x: 1 }));
    assert.notEqual(contentHash({ x: 1 }), contentHash({ x: 2 }));
    assert.match(contentHash({}), /^[0-9a-f]{64}$/);
  });
  test("secrets never reach evidence", () => {
    const r = redactValue({ access_token: "abc", password: "p", otp: "123456", nested: { Authorization: "Bearer xyz" }, note: "authorization: Bearer abcdef", title: "keep me", tokenized: true }) as any;
    assert.equal(r.access_token, "<redacted>");
    assert.equal(r.password, "<redacted>");
    assert.equal(r.otp, "<redacted>");
    assert.equal(r.nested.Authorization, "<redacted>");
    assert.match(r.note, /<redacted>/);
    assert.equal(r.title, "keep me");
    assert.equal(r.tokenized, true);
  });
});

describe("product tables — a run record becomes rows", () => {
  const rec = sampleRun();
  const run = mapRunRecord(rec);
  test("cases, plan steps, journey steps, tries and field checks land where they belong", () => {
    const cases = run.results.filter((r) => r.kind === "case");
    assert.deepEqual(cases.map((c) => c.subjectKey), ["UT-CASE-001", "UT-CASE-002", "UT-CASE-003"]);
    assert.deepEqual(cases.map((c) => c.verdict), ["passed", "failed", "couldnt_tell"]);
    assert.equal(cases[0].steps.length, 1, "the ·act1 row is a step of its case, not a case");
    assert.equal(cases[2].actor, "vendor");
    const steps = run.results.filter((r) => r.kind === "journey-step");
    assert.equal(steps.length, 2);
    assert.equal(steps[1].steps[0].kind, "attempt");
    assert.equal(steps[1].steps[0].verdict, "failed", "a retry that worked never erases the failure before it");
    assert.deepEqual(steps[0].assertions.map((a) => a.verdict), ["passed", "failed", "not_run"]);
    assert.equal(run.journey?.completed, true);
  });
  test("…and matches the older results table row for row", () => {
    const older = resultRows(rec);
    const by = (k: string) => older.filter((r) => r.kind === k).length;
    const cases = run.results.filter((r) => r.kind === "case");
    const jsteps = run.results.filter((r) => r.kind === "journey-step");
    assert.equal(by("case"), cases.length + cases.reduce((n, c) => n + c.steps.length, 0));
    assert.equal(by("journey-step"), jsteps.length + jsteps.reduce((n, s) => n + s.steps.length, 0));
    assert.equal(by("field-check"), jsteps.reduce((n, s) => n + s.assertions.filter((a) => a.verdict !== "not_run").length, 0));
  });
  test("what the run made on UAT goes to the ledger; ids that are not records do not", () => {
    const types = run.records.map((r) => `${r.type}:${r.uuid}:${r.role}`).sort();
    assert.deepEqual(types, ["bid:BIDUUID:created", "event:DRAFTUUID:created", "event:EVTUUID:created", "vendor-company:VENDUUID:used"]);
  });
  test("evidence is redacted and sized", () => {
    const ev = run.results.flatMap((r) => r.evidence);
    assert.ok(ev.length >= 2);
    assert.ok(ev.every((e) => e.bytes > 0));
    assert.doesNotMatch(JSON.stringify(ev), /"abc"|"p"/);
  });
  test("an unchanged record has the same hash; a changed one does not", () => {
    assert.equal(mapRunRecord(sampleRun()).recordHash, run.recordHash);
    assert.notEqual(mapRunRecord({ ...sampleRun(), durationMs: 1 }).recordHash, run.recordHash);
  });
});

describe("bug sheet — wording and workbook", () => {
  test("dates read and write in the workbook's own form", () => {
    assert.equal(parseSheetDate("1 Oct 2026"), "2026-10-01");
    assert.equal(formatSheetDate("2026-10-03"), "3 Oct 2026");
    assert.equal(parseSheetDate("Oct 1"), null);
    assert.equal(dateRange("1 Oct 2026", "3 Oct 2026"), "1–3 Oct 2026");
    assert.equal(dateRange("3 Oct 2026", "3 Oct 2026"), "3 Oct 2026");
    assert.deepEqual(splitClients("PROCOL DEMO; Demo Account 2"), ["PROCOL DEMO", "Demo Account 2"]);
    assert.deepEqual(splitCases("EDGE-STG-006, EDGE-STG-072"), ["EDGE-STG-006", "EDGE-STG-072"]);
  });
  test("the workbook is built from rows and compared cell by cell", () => {
    const rows = {
      bugs: [["BUG-01", "Area", "Title", "What", "How", "Should", "Actually", "PROCOL DEMO", "High", "Server crash", "Verified", "1 Oct 2026", "EDGE-1"]],
      questions: [["Q-01", "Area", "Behaviour", "Saw", "PROCOL DEMO", "Confirm"]],
      data: [["D-01", "PROCOL DEMO", "Problem", "Details", "Fix"]],
      kinds: ["Server crash"],
      clients: ["PROCOL DEMO"],
      confirmedRange: { first: "1 Oct 2026", last: "1 Oct 2026" },
    };
    const wb = buildWorkbook("Procol", rows);
    assert.deepEqual(wb.SheetNames, ["Summary", "Bugs", "Needs confirmation", "Data problems"]);
    const round = (w: XLSX.WorkBook) => XLSX.read(XLSX.write(w, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellFormula: true });
    assert.deepEqual(compareWorkbooks(round(wb), round(wb)), []);
    assert.equal((wb.Sheets.Summary.B4 as XLSX.CellObject).f, "COUNTA(Bugs!A2:A2)");
    const changed = buildWorkbook("Procol", { ...rows, bugs: [[...rows.bugs[0].slice(0, 2), "Other title", ...rows.bugs[0].slice(3)]] });
    assert.deepEqual(compareWorkbooks(round(wb), round(changed)), ['Bugs!C2: "Title" vs "Other title"']);
  });
});

// ── against Postgres ────────────────────────────────────────────────────────

const BASE = process.env.SPINE_DB_URL?.trim();
describe("product tables — against Postgres", { skip: BASE ? false : "SPINE_DB_URL is not set — database tests skipped" }, () => {
  const schema = `db_unit_${Date.now()}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  before(async () => {
    admin = new pg.Client({ connectionString: BASE, connectionTimeoutMillis: 4000 });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    const u = new URL(BASE!);
    u.searchParams.set("options", `-c search_path=${schema},public`);
    pool = new pg.Pool({ connectionString: u.toString(), max: 3 });
    const dir = join(here, "..", "db", "migrations");
    const c = await pool.connect();
    try {
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
        await c.query("BEGIN");
        await c.query(readFileSync(join(dir, f), "utf8"));
        await c.query("COMMIT");
      }
    } finally {
      c.release();
    }
  });
  after(async () => {
    await pool?.end().catch(() => {});
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin?.end().catch(() => {});
  });

  test("seed: Procol, UAT and its companies", async () => {
    const ctx = await withService(pool, (c) => defaultContext(c));
    assert.equal(ctx.orgSlug, "procol");
    const n = await withService(pool, async (c) => (await c.query(`SELECT count(*)::int AS n FROM target_companies WHERE org_id = $1`, [ctx.orgId])).rows[0].n);
    assert.ok(n >= 4);
  });

  test("a run is written once, re-saving replaces rather than doubles, and reads back per company", async () => {
    const ctx = await withService(pool, (c) => defaultContext(c));
    const run = mapRunRecord(sampleRun());
    const first = await withService(pool, (c) => writeLedgerRun(c, ctx, run, { basis: "recorded" }));
    assert.equal(first.skipped, false);
    assert.equal(first.results, 5);
    assert.equal(first.assertions, 3);
    assert.equal((await withService(pool, (c) => writeLedgerRun(c, ctx, run, { basis: "recorded" }))).skipped, true, "unchanged = skipped");
    const again = await withService(pool, (c) => writeLedgerRun(c, ctx, run, { basis: "recorded", force: true }));
    assert.equal(again.results, 5);
    const hist = await withOrg(pool, ctx.orgId, (c) => companyRunHistory(c, ctx.orgId, 198678));
    assert.equal(hist?.length, 1);
    assert.deepEqual(hist![0].results, { total: 3, passed: 1, failed: 1, couldntTell: 1, notRun: 0 });
    assert.equal(hist![0].status, "failed");
    assert.equal(hist![0].trigger, "agent");
    const trend = await withOrg(pool, ctx.orgId, (c) => companyTrend(c, ctx.orgId, 198678, 3650));
    assert.equal(trend?.reduce((n, d) => n + d.runs, 0), 1);
    const ledger = await withOrg(pool, ctx.orgId, (c) => testRecordLedger(c, ctx.orgId, { procolCompanyId: 198678 }));
    assert.equal(ledger.total, 4);
    assert.ok(ledger.rows.every((r) => r.namedAsTest));
  });

  test("a result points at the exact case version it ran; a changed case gets a new version", async () => {
    const ctx = await withService(pool, (c) => defaultContext(c));
    await withService(pool, async (c) => {
      const idx = new CaseIndex(c, ctx);
      const v2 = await idx.ensure({ key: "UT-CASE-002", origin: "observed", title: "A crash, reworded", content: { observed: { title: "A crash, reworded", feature: "events.publish", layer: "api" } } }, true);
      assert.equal(v2.newVersion, true);
    });
    const later = sampleRun("2026-10-03T00-00-01-001Z");
    (later.checkResults as any)[2].scenario = "A crash, reworded";
    await withService(pool, (c) => writeLedgerRun(c, ctx, mapRunRecord(later), { basis: "recorded" }));
    const h = await withOrg(pool, ctx.orgId, (c) => caseHistory(c, ctx.orgId, "UT-CASE-002"));
    assert.equal(h?.versions.length, 2);
    assert.deepEqual(h!.versions.map((v) => v.results.runs), [1, 1], "each version keeps its own results");
    assert.equal(h!.versions[1].current, true);
  });

  test("a defect's occurrences are the failed results of its exact cases", async () => {
    const ctx = await withService(pool, (c) => defaultContext(c));
    const d: DefectInput = {
      ref: "BUG-01", category: "bug", title: "A crash", area: "Events", description: "It crashes.", howToSee: "1. Do it.", expected: "Refused", actual: "Crash",
      clients: ["PROCOL DEMO", "No Such Client"], severity: "High", kind: "Server crash", verification: "Twice", toConfirm: null, suggestedFix: null,
      lastConfirmed: "2026-10-01", cases: ["UT-CASE-002", "UT-CASE-001"], position: 1,
    };
    const imp = await withService(pool, (c) => importDefects(c, ctx, [d], "unit"));
    assert.deepEqual(imp.unknownClients, ["No Such Client"]);
    await withService(pool, (c) => linkOccurrences(c, ctx));
    const list = await withOrg(pool, ctx.orgId, (c) => defectList(c, ctx.orgId));
    assert.equal(list[0].occurrences, 2, "UT-CASE-002 failed in both runs; UT-CASE-001 passed and is not an occurrence");
    assert.deepEqual(list[0].caseKeys, ["UT-CASE-002", "UT-CASE-001"]);
    // status changes are logged by the database itself
    await withService(pool, (c) => c.query(`UPDATE defects SET status = 'fixed' WHERE ref = 'BUG-01'`), "unit test");
    const hist = await withService(pool, async (c) => (await c.query(`SELECT from_status, to_status, changed_by_label FROM defect_status_history ORDER BY id`)).rows);
    assert.deepEqual(hist.map((x: any) => `${x.from_status}->${x.to_status}`), ["null->confirmed", "confirmed->fixed"]);
    assert.equal(hist[1].changed_by_label, "unit test");
    // a re-import never overwrites a status someone changed
    await withService(pool, (c) => importDefects(c, ctx, [d], "unit"));
    assert.equal((await withOrg(pool, ctx.orgId, (c) => defectList(c, ctx.orgId)))[0].status, "fixed");
  });

  test("row-level security: one organisation never sees another's rows", async () => {
    const other = await withService(pool, async (c) => {
      const o = await c.query(`INSERT INTO organisations (slug, name) VALUES ('other-co', 'Other Co') RETURNING id`);
      return Number(o.rows[0].id);
    });
    const procol = (await withService(pool, (c) => defaultContext(c))).orgId;
    const count = (orgId: number) => withOrg(pool, orgId, async (c) => (await c.query(`SELECT count(*)::int AS n FROM test_runs`)).rows[0].n);
    assert.ok((await count(procol)) >= 2);
    assert.equal(await count(other), 0);
    // no context at all = no rows (fail closed)
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM run_results`)).rows[0].n, 0);
    // and a tenant cannot write a row into another organisation
    await assert.rejects(
      withOrg(pool, other, (c) => c.query(`INSERT INTO features (org_id, key, kind, label, position) VALUES ($1, 'x', 'group', 'X', 1)`, [procol])),
      /row-level security/,
    );
    assert.equal((await withOrg(pool, other, (c) => companyRunHistory(c, other, 198678))), null);
  });

  test("retention deletes old evidence, keeps what a defect needs, and leaves the verdicts", async () => {
    const ctx = await withService(pool, (c) => defaultContext(c));
    await withService(pool, (c) => c.query(`UPDATE evidence SET captured_at = now() - interval '200 days' WHERE org_id = $1`, [ctx.orgId]));
    const counts = () => withService(pool, async (c) => (await c.query(`SELECT (SELECT count(*) FROM evidence)::int AS ev, (SELECT count(*) FROM run_results)::int AS rr`)).rows[0]);
    const before = await counts();
    const dry = await withService(pool, async (c) => (await c.query(`SELECT * FROM spine_apply_retention($1, true)`, [ctx.orgId])).rows[0]);
    assert.equal(dry.expired, before.ev);
    assert.equal(dry.deleted, 0);
    assert.deepEqual(await counts(), before, "a dry run changes nothing");
    const real = await withService(pool, async (c) => (await c.query(`SELECT * FROM spine_apply_retention($1, false)`, [ctx.orgId])).rows[0]);
    assert.ok(real.kept_for_defects >= 1, "evidence of a defect occurrence is kept");
    assert.equal(real.deleted, before.ev - real.kept_for_defects);
    const after = await counts();
    assert.equal(after.ev, real.kept_for_defects);
    assert.equal(after.rr, before.rr, "results are never deleted by retention");
    const audit = await withService(pool, async (c) => (await c.query(`SELECT action FROM audit_log WHERE org_id = $1`, [ctx.orgId])).rows);
    assert.ok(audit.some((a: any) => a.action === "evidence.retention_applied"));
    await assert.rejects(withService(pool, (c) => c.query(`DELETE FROM audit_log`)), /append-only/);
  });
});
