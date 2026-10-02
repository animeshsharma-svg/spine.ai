import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANY_ID } from "../src/config.js";
import { loginAsCompany } from "../src/db/dbLogin.js";
import { closeDb } from "../src/db/multiClient.js";
import { EvidenceCollector } from "../src/oracle/evidence.js";
import { runId } from "../src/oracle/findings.js";
import { createAndPublishErfx } from "../src/flows/shared/createErfx.js";
import { NetworkCapture } from "../src/crosscheck/capture.js";
import { encodeProcolId, decodeProcolId } from "../src/crosscheck/ids.js";
import { loadMaps, type Vars } from "../src/crosscheck/fieldMap.js";
import { ScreenDriver, type Visit } from "../src/crosscheck/screens.js";
import { runScreen, type CaseResult } from "../src/crosscheck/engine.js";
import { discover, type DiscoveredField } from "../src/crosscheck/discover.js";
import { aggregate, writeRun, CROSSCHECK_DIR, type RunRecord } from "../src/crosscheck/report.js";
import { MAPS_DIR } from "../src/crosscheck/fieldMap.js";

/**
 * UI ↔ API CROSS-CHECK — "the backend sent the right data, does the screen show it?"
 *
 * Opens an event's screens one after another (events list, Project Details,
 * each stage's Responses and Overview, Master QCS), records every API response
 * each screen was built from, reads what the screen shows, and runs the
 * reviewed field maps (src/crosscheck/maps/*.json) against both. Every
 * disagreement becomes a plain-English finding with the API value, the
 * screen text and a screenshot. Read-only, unless CROSSCHECK_CREATE=1 asks it
 * to create a fresh QA_Platform_ event through the existing eRFX journey.
 *
 *   COMPANY_ID=198678 CROSSCHECK_EVENT=85303 \
 *     npx playwright test tests/crosscheck.spec.ts --project=chromium --no-deps
 *
 *   CROSSCHECK_EVENT   event id (database id or the app's id, e.g. UWtaY3BO)
 *   CROSSCHECK_CREATE  1 = create + publish a QA_Platform_XCHK_… RFQ first (UI_LINE_ITEMS honoured)
 *   CROSSCHECK_CASES   comma list of UI-XCHK ids to run (default: all)
 *   CROSSCHECK_SCREENS comma list of list,summary,responses,overview,qcs (default: all)
 *   CROSSCHECK_STRICT  1 = fail the Playwright test when any case fails (default: report only)
 */

const eventArg = process.env.CROSSCHECK_EVENT?.trim();
const create = process.env.CROSSCHECK_CREATE === "1";
test.skip(!eventArg && !create, "set CROSSCHECK_EVENT=<id> or CROSSCHECK_CREATE=1");

/** Cases the catalog holds that this spec cannot run yet, said out loud in every result. */
const NOT_RUN = [
  { case: "UI-XCHK-060", title: "The vendor's view of the event shows the title, line items, quantities and closing time the buyer's API returns", reason: "needs a vendor sign-in; the only configured vendor login sends an email OTP to a real address, which the platform must not do" },
  { case: "UI-XCHK-061", title: "The vendor's bid form offers exactly the fields of the stage's template, with the buyer's quantities and units", reason: "needs a vendor sign-in (same reason as UI-XCHK-060)" },
];

test.afterAll(async () => {
  await closeDb().catch(() => {});
});

test("UI ↔ API cross-check of an event's screens", async ({ page }) => {
  test.setTimeout(create ? 900_000 : 600_000);
  const rid = runId();
  const dir = join(CROSSCHECK_DIR, rid);
  const startedAt = new Date().toISOString();
  const companyId = COMPANY_ID ? Number(COMPANY_ID) : null;
  const notes: string[] = [];
  const wantCases = process.env.CROSSCHECK_CASES ? new Set(process.env.CROSSCHECK_CASES.split(",").map((s) => s.trim().toUpperCase())) : undefined;
  const wantScreens = new Set((process.env.CROSSCHECK_SCREENS ?? "list,summary,responses,overview,qcs").split(",").map((s) => s.trim()));

  if (companyId) await loginAsCompany(page, companyId);
  const collector = new EvidenceCollector(page, "crosscheck");
  await collector.installToastRecorder();
  const cap = new NetworkCapture(page);
  cap.start();
  const drive = new ScreenDriver(page, cap, dir);

  // ── which event ───────────────────────────────────────────────────────────
  let eventUuid: string;
  let createdTitle: string | undefined;
  if (create) {
    cap.setScreen("create");
    const made = await createAndPublishErfx(page, { stages: ["rfq"], titlePrefix: "QA_Platform_XCHK" });
    if (!made.projectId) throw new Error("the create journey did not reach a published project");
    eventUuid = made.projectId;
    createdTitle = made.title;
    notes.push(`created and published "${made.title}" through the eRFX journey for this run`);
  } else {
    eventUuid = /^\d+$/.test(eventArg!) ? encodeProcolId(Number(eventArg)) : eventArg!;
  }

  const maps = loadMaps();
  const mapFor = (name: string) => maps.find((m) => m.screen === name);
  const titles = new Map(maps.flatMap((m) => m.groups.map((g) => [g.case, g.title] as const)));
  const visits: Visit[] = [];
  const results: CaseResult[] = [];
  const discovered: Record<string, DiscoveredField[]> = {};

  const check = (v: Visit, vars: Vars, screenTitle?: string) => {
    visits.push(v);
    const map = mapFor(v.map);
    if (!map) return;
    const rs = runScreen(map, v.key, v.snapshot, cap.responses, vars, v.toasts, { cases: wantCases, screenshot: v.screenshot, screenTitle });
    results.push(...rs);
    discovered[v.key] = discover(v.snapshot, cap.forScreen(v.key));
    for (const r of rs) console.log(`[crosscheck] ${r.case} on ${v.key}: ${r.verdict.toUpperCase()} — ${r.reason}`);
    for (const f of rs.flatMap((r) => r.findings)) console.log(`[crosscheck]   ✗ ${f.title}`);
  };

  // Summary first: it is where the event's title and stages come from.
  const summary = await drive.summary(eventUuid);
  const ev = cap.forScreen("summary").find((r) => r.ok && /^\/api\/event_groups\/[^/?]+$/.test(r.path))?.body as Record<string, any> | undefined;
  if (!ev) throw new Error(`the event ${eventUuid} could not be read through the API on its own page — nothing to cross-check`);
  const title = String(ev.title ?? createdTitle ?? "");
  const stages = (ev.stages ?? []) as Array<Record<string, any>>;
  const vars: Vars = {
    eventUuid,
    title,
    titleEnc: encodeURIComponent(title),
    stage0Title: stages[0]?.title?.trim(),
    stage1Title: stages[1]?.title?.trim(),
  };
  if (wantScreens.has("summary")) check(summary, vars);

  if (wantScreens.has("list")) {
    check(await drive.list(title, "settled"), vars);
    check(await drive.list(title, "at-once"), vars, "events list (search typed straight away)");
  }

  for (const st of stages.slice(0, 3)) {
    const label = String(st.ref_id ?? st.title);
    const svars = { ...vars, stageUuid: String(st.uuid), stageTitle: String(st.title ?? "") };
    const stageName = `${String(st.title ?? "").trim() || label} (${label})`;
    if (wantScreens.has("responses")) check(await drive.responses(eventUuid, String(st.uuid), label), svars, `${stageName} Responses grid`);
    if (wantScreens.has("overview")) check(await drive.overview(eventUuid, String(st.uuid), label), svars, `${stageName} Overview tab`);
  }
  if (wantScreens.has("qcs")) {
    if (ev.hide_master_qcs) notes.push("Master QCS is hidden for this event (hide_master_qcs), so it was not checked");
    else check(await drive.qcs(eventUuid), vars);
  }

  cap.stop();
  writeFileSync(join(dir, "network.json"), JSON.stringify(cap.responses, null, 2));
  // The latest discovery per screen also lands beside the maps, for review.
  const written = new Set<string>();
  for (const [k, d] of Object.entries(discovered)) {
    // One file per map; the first visit of a screen (not its variants) is the reference.
    if (written.has(k.split("@")[0]) && !k.startsWith("responses@") && !k.startsWith("overview@")) continue;
    written.add(k.split("@")[0]);
    writeFileSync(join(MAPS_DIR, "discovered", `${k.split("@")[0]}.json`), JSON.stringify({ from: rid, screen: k, event: title, fields: d }, null, 2));
  }

  const cases = aggregate(results, titles, wantCases ? NOT_RUN.filter((n) => wantCases.has(n.case)) : NOT_RUN);
  const findings = cases.flatMap((c) => c.findings);
  const failed = cases.filter((c) => c.verdict === "failed");
  const passed = cases.filter((c) => c.verdict === "passed");
  const verdict: RunRecord["verdict"] = failed.length ? "failed" : passed.length ? "passed" : "inconclusive";
  const rec: RunRecord = {
    runId: rid,
    kind: "ui-api-crosscheck",
    startedAt,
    finishedAt: new Date().toISOString(),
    companyId,
    event: { uuid: eventUuid, title, ref: ev.ref_uuid, dbId: decodeProcolId(eventUuid), createdByThisRun: create },
    screens: visits.map((v) => ({
      key: v.key,
      map: v.map,
      url: v.url,
      screenshot: v.screenshot,
      responses: cap.forScreen(v.key).length,
      failedResponses: cap.forScreen(v.key).filter((r) => !r.ok).length,
      notArrived: v.notArrived,
    })),
    verdict,
    summary: `${passed.length} case(s) passed, ${failed.length} failed, ${cases.filter((c) => c.verdict === "inconclusive").length} inconclusive, ${cases.filter((c) => c.verdict === "not-run").length} not run — ${findings.length} finding(s) on ${visits.length} screen(s)`,
    cases,
    findings,
    discovered,
    notes,
  };
  const file = writeRun(dir, rec);
  console.log(`[crosscheck] ${rec.summary}`);
  console.log(`[crosscheck] wrote ${file}`);
  if (failed.length && process.env.CROSSCHECK_STRICT === "1") {
    throw new Error(`${failed.length} cross-check case(s) failed:\n${findings.map((f) => `- ${f.title}`).join("\n")}`);
  }
});
