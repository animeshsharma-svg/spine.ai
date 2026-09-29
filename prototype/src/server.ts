/**
 * THE PLATFORM SERVER — serves the web UI + streams the AI run live.
 *
 * One self-contained Node process (run with tsx) that reuses our working
 * engine directly, so there is no bundler between the UI and the flows.
 *
 *   npm run serve   →   http://localhost:4300
 *
 * Endpoints:
 *   GET /                      the single-page UI
 *   GET /api/clients           the demo client list
 *   GET /api/capability?c=ID   that client's capability map (config-driven)
 *   GET /api/run?c=ID&q=TEXT   Server-Sent Events: each agent event, then report
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { getCapabilityMap, openClientContext, runFlow } from "./executor.js";
import { needsEventFixture } from "./checks/eventsFixture.js";
import { journeyPlan, journeyWalksFeature, STEP_META } from "./checks/journeyModel.js";
import type { JourneyRecord, JourneyStepRecord } from "./checks/journeyModel.js";
import { runEventJourney, journeyToSetupSteps, journeyToSetupSummary } from "./checks/eventJourney.js";
import { FEATURE_TREE, defaultSelection, findFeature } from "../config/featureTree.js";
import { apiModulesFor, singleApiModule } from "../config/apiModules.js";
import { caseCountsByFeature, lineItemCaseCountsByFeature, casesForFeatures, buildChecksFromCases, idsFromReply, loadCases, resolveCaseContext, resolveActor, configRequirementOf } from "./checks/caseLibrary.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import type { CheckResult } from "./ai/types.js";
import { providerLabel, usageReport, llmMode } from "./ai/llm.js";
import { slotState } from "./ui/browserSlot.js";
import { JourneyTrail } from "./ui/journeySteps.js";
import { saveTrail, readTrail, deleteTrail, listTrails } from "./ui/trailStore.js";
import { DEFAULT_CLIENT } from "../config/settings.js";
import { isTokenClient, tokenClient } from "../config/tokenClients.js";
import { readToken, tokenClientChoices } from "./tokenClient.js";
import { saveRun, listRuns, getRun, newRunId, deleteRun } from "./runStore.js";
import { defectsFromRun } from "./report/checkDefects.js";
import { buildChecksForFlow, ALL_SUITES } from "./checks/suites.js";
import { runCheck } from "./checks/engine.js";
import type { Check } from "./checks/engine.js";
import { loadCompanyConfig, featureConfigState, isFlagOn } from "./checks/companyConfig.js";
import { featureGatesFor, mergeConfigState, offReason } from "./checks/featureGates.js";
import { UI_FLOWS, uiFlowsFor, runUiFlow, runUiPlan, readPlanResult, clampLineItems, readStuck, readLearned, runTeach } from "./ui/uiFlowRunner.js";
import { readRunVerdicts, summariseFindings } from "./agents/oracle.js";
import { interpret } from "./agents/uiIntent.js";
import { compileTestCase } from "./agents/planner.js";
import { recall, stats as ragStats, isBuilt } from "./rag/knowledgeBase.js";
import { ensureEmbedderReady } from "./rag/embedder.js";
import { buildMarkdownReport } from "./report/bugReport.js";
import { allDefects, renderBugSheet, stillOpenFor } from "./report/bugSheet.js";
import { uiRunDefects } from "./report/uiFrictionDefects.js";
import { isTriageField, loadTriage, saveTriageField } from "./triageStore.js";
import { featuresOfRun, latestRun, renderTestReport } from "./report/testReport.js";
import { renderUiReport, uiShotPath } from "./report/uiReport.js";
import { renderUiRunReport } from "./report/uiRunReport.js";
import { readPoRun, readPoRunHtml, deletePoRun, listPoRuns } from "./poRunStore.js";
import { defectsFromPoRun } from "./report/poRunDefects.js";
import { checkToken, poInputSummary, runPoFlow } from "./poRunner.js";
import { resolveToken } from "./tokenMint.js";
import { TIERS, runSuiteTier, type SuiteTier } from "./suiteRunner.js";
import { findCases, sections, caseById, caseAsProse, catalogStats } from "./checks/testCatalog.js";
import { routeFor, routingCoverage } from "./checks/caseRouting.js";
import { buildJourneys } from "./checks/journeys.js";
import { buildCaseBook } from "./checks/caseBook.js";
import { runApiCases } from "./checks/apiCaseRunner.js";
import { readVocabularyGaps } from "./agents/vocabularyGaps.js";
import { flowToCases, loadRecording } from "./checks/flowToCases.js";
import { replayCase, disposeReplay } from "./checks/flowReplay.js";
import { parsePastedCases, runPastedCases } from "./checks/pastedCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "..", "public");
const DATA_DIR = join(here, "..", "data");
const REC_DIR = join(here, "..", "..", "procol-ui-tests", "recordings");

/**
 * The base URL this request should talk to, when the reader has chosen one.
 *
 * "Custom URL" in the header sends `?base=`; without it the client's own
 * configured host is used, which is what every existing caller expects. Only
 * http(s) is accepted — a base URL is a destination for real requests, and
 * anything else is either a mistake or an attempt to make the server fetch
 * something it should not.
 */
function baseOverride(url: URL): string | undefined {
  const raw = url.searchParams.get("base")?.trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? raw.replace(/\/$/, "") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where the API automation suite writes its reports.
 *
 * The maintained suite is the repo this platform sits inside
 * (p2p_endtoend_flow_api_automation); "procol test" is the earlier copy kept
 * as a fallback so an older checkout still serves something rather than 404ing.
 * First one that has the file wins.
 */
const SUITE_REPORT_DIRS = [
  join(here, "..", "..", "api-suite", "reports"),
  join(here, "..", "..", "..", "reports"),
  join(here, "..", "..", "procol test", "reports"),
];
const SUITE_NAME = "the API automation suite";

/** The newest copy of a report file across the known suites, if any. */
function suiteFile(name: string): string | undefined {
  const found = SUITE_REPORT_DIRS.map((dir) => join(dir, name)).filter((file) => existsSync(file));
  if (found.length <= 1) return found[0];
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
const PORT = Number(process.env.PORT ?? 4300);

// Curated demo clients (PROCOL DEMO is the known-fresh default).
const CLIENTS = [
  { id: 198678, name: "PROCOL DEMO", note: "best all-round · fresh session" },
  { id: 32461, name: "Demo Account 2", note: "BOQ on" },
  { id: 39490, name: "M/s Moon Beverages", note: "workspace client · BOQ off" },
];

// Cache capability maps so re-selecting a client is instant.
const capCache = new Map<string, any>();

/** Feature trees, keyed by company. Ten minutes: a config change is rare, and
 * a stale tree for that long is a smaller problem than a 36-second wait. */
const featureCache = new Map<string, { at: number; payload: unknown }>();
const FEATURE_CACHE_MS = 10 * 60 * 1000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Reads a request body, capped — nothing here needs more than a few kB. */
function readBody(req: import("node:http").IncomingMessage, limit = 64_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // ── API: client list ──
    if (path === "/api/clients") {
      // UAT companies first, then the accounts that live on their own
      // deployment — same dropdown, because to a reader they are both "which
      // account am I testing".
      return json(res, {
        clients: [...CLIENTS, ...tokenClientChoices()],
        defaultClient: DEFAULT_CLIENT.companyId,
        provider: providerLabel(),
      });
    }

    /**
     * THROW ONE RUN AWAY.
     *
     * A run that wrote a purchase order nobody wanted, or one made while
     * testing the platform itself, is noise — in the history, in the reports
     * built from it, and in the bug sheet, which counts a defect's blast
     * radius by the runs that hit it. Deleting has to reach all three stores
     * because a "run" is an API run, a PO run or a browser journey depending
     * on what started it, and the reader pressing the button does not care
     * which.
     */
    if (path === "/api/run-delete") {
      const id = url.searchParams.get("run") ?? "";
      if (!id) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "no run id given" }));
      }
      const removed = [
        deleteRun(id) ? "api run" : null,
        deletePoRun(id) ? "PO run" : null,
        deleteTrail(id) ? "journey trail" : null,
      ].filter(Boolean);
      return json(res, { deleted: removed.length > 0, removed, runId: id });
    }

    /**
     * THE TEST CATALOGUE ITSELF.
     *
     * Every other view answers "what happened when we ran it". None of them
     * answered "what is there to run" — the tree counts cases per feature and
     * stops, so the 283 written cases could be counted but never read. Someone
     * asking whether a scenario is already covered had to open the library
     * file. This serves the catalogue as it is written, scoped to the account
     * the way the tree is, so the answer matches what that account can run.
     */
    /**
     * The journey catalogue: the same 648 cases the test-case view lists, but
     * ordered into the 17 journeys a buyer actually walks, each case in the
     * position its journey exercises it.
     *
     * Derived from the catalog (`buildJourneys`) so it is always in sync with
     * the written cases; `data/journeys.json` is the dumped copy of that same
     * derivation (scripts/build-journeys.ts). `?source=file` serves the dumped
     * file as-is, and the file is also the fallback when the derivation
     * cannot run in this checkout.
     */
    if (path === "/api/journeys") {
      const file = join(DATA_DIR, "journeys.json");
      const readFile = () => {
        if (!existsSync(file)) return { journeys: [], orphans: [], missing: true };
        try {
          return JSON.parse(readFileSync(file, "utf8"));
        } catch (e) {
          return { journeys: [], orphans: [], error: e instanceof Error ? e.message : String(e) };
        }
      };
      if (url.searchParams.get("source") === "file") return json(res, readFile());
      try {
        const { journeys, orphans } = buildJourneys();
        return json(res, { journeys, orphans });
      } catch {
        return json(res, readFile());
      }
    }

    if (path === "/api/catalogue") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const account = isTokenClient(c) ? tokenClient(c) : undefined;
      const scope = account?.featureScope;
      const inScope = (feature: string) =>
        !scope || scope.some((s) => feature === s || feature.startsWith(`${s}.`));

      const cases = loadCases()
        .filter((t) => inScope(t.feature))
        .map((t) => ({
          id: t.id,
          feature: t.feature,
          title: t.title,
          type: t.type,
          priority: t.priority,
          severity: t.severity,
          method: t.method,
          path: t.path,
          expected: t.expected,
          expectedResult: t.expectedResult,
          preconditions: t.preconditions,
          steps: t.steps ?? [],
          // The payload IS the test data on an API case — the values the
          // scenario is actually exercised with, which is the column a QA
          // sheet reads first.
          body: t.body ?? null,
          /**
           * Where the endpoint came from, for cases imported from the written
           * catalog: "stated" (the case names it), "carried" (an earlier case
           * in the same section named it) or "anchor" (the section's default).
           * A red result on an inferred path may be our inference rather than
           * the product, and the reader has to be able to tell which.
           */
          pathSource: (t as any).pathSource ?? null,
          writtenRef: (t as any).writtenRef ?? null,
        }));

      // Grouped the way the tree groups, so the drawer reads like the rest of
      // the platform rather than as a flat dump of 283 rows.
      const groups = FEATURE_TREE.map((g) => ({
        id: g.id,
        label: g.label,
        icon: g.icon,
        what: g.what,
        features: g.children
          .map((child) => ({
            id: child.id,
            label: child.label,
            what: child.what,
            cases: cases.filter((t) => t.feature === child.id),
          }))
          .filter((f) => f.cases.length > 0),
      })).filter((g) => g.features.length > 0);

      return json(res, { total: cases.length, groups, scopeNote: account?.scopeNote ?? null });
    }

    // ── API: what the AI has cost, and what holds the browser ───────────
    if (path === "/api/ai-usage") {
      return json(res, { provider: providerLabel(), mode: llmMode(), ...usageReport() });
    }
    if (path === "/api/run-state") {
      return json(res, slotState());
    }
    // What the written cases asked for that no step can do yet — the to-do
    // list for growing the automation, most-asked-for first.
    if (path === "/api/vocabulary-gaps") {
      return json(res, { gaps: readVocabularyGaps() });
    }

    // ── API: capability map ──
    if (path === "/api/capability") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const capKey = `${c}:${baseOverride(url) ?? "default"}`;
      if (capCache.has(capKey)) return json(res, capCache.get(capKey));
      const map = await getCapabilityMap(c);
      capCache.set(capKey, map);
      return json(res, map);
    }

    // ── API: run history ──
    if (path === "/api/runs") {
      /**
       * EVERY RUN THE PLATFORM HAS KEPT — which is what the page claims.
       *
       * It listed API runs only. Browser journeys and PO runs are kept too,
       * with their own reports, and neither appeared here: 26 journeys and 22
       * purchase-order runs on disk, none of them reachable from the one view
       * whose job is to reach them. A reader who had just watched a journey
       * finish could not find it again.
       *
       * Each run also says which reports it HAS. A journey has no API test
       * report and an API run has no screenshots; offering every link on every
       * card would just be three links, one of which is always empty.
       */
      const q = (id: string) => encodeURIComponent(id);
      const api = listRuns(20).map((r) => ({
        ...r,
        kind: "api" as const,
        reports: [
          { label: "📊 Test report", href: `/api/test-report?run=${q(r.id)}` },
          { label: "🐞 Bug sheet", href: `/api/bug-report?run=${q(r.id)}` },
        ],
      }));

      const journeys = listTrails(20).map((t) => ({
        id: t.runId,
        ts: t.startedAt,
        request: `browser journey: ${t.flowKey}`,
        companyName: t.companyId ? String(t.companyId) : null,
        headline: t.stoppedAt?.text ?? null,
        passed: t.exitCode === 0 ? 1 : 0,
        failed: t.exitCode === 0 ? 0 : 1,
        inconclusive: 0,
        checks: 0,
        findings: 0,
        mismatches: 0,
        provider: "",
        kind: "journey" as const,
        steps: t.steps?.length ?? 0,
        durationMs: t.durationMs,
        reports: [
          { label: "🖥 UI report", href: `/api/ui-report?run=${q(t.runId)}` },
          { label: "🐞 Bug sheet", href: `/api/bug-report?run=${q(t.runId)}` },
        ],
      }));

      const poRuns = listPoRuns(20).map((r) => ({
        id: r.runId,
        ts: r.startedAt,
        request: `PO automation on ${r.companyName ?? "this account"}`,
        companyName: r.companyName ?? null,
        headline: r.issues?.length ? "created, but did not finish the flow" : null,
        passed: r.exitCode === 0 && !r.issues?.length ? 1 : 0,
        failed: r.exitCode === 0 ? 0 : 1,
        inconclusive: r.issues?.length ? 1 : 0,
        checks: 0,
        findings: 0,
        mismatches: 0,
        provider: "",
        kind: "po" as const,
        reports: [
          { label: "📊 PO run report", href: `/api/po-report?run=${q(r.runId)}` },
          { label: "🐞 Bug sheet", href: `/api/bug-report?run=${q(r.runId)}` },
        ],
      }));

      const runs = [...api, ...journeys, ...poRuns]
        .sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")))
        .slice(0, 40);
      return json(res, { runs });
    }
    if (path.startsWith("/api/runs/")) {
      const rec = getRun(decodeURIComponent(path.slice("/api/runs/".length)));
      if (!rec) {
        res.writeHead(404);
        return res.end("no such run");
      }
      return json(res, rec);
    }

    // ── API: run the orchestrator (SSE) ──
    if (path === "/api/run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const q = url.searchParams.get("q") ?? "Create and award an RFQ event, and try to break the inputs";
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const started = Date.now();
      try {
        const result = await runOrchestrator(q, c, (e) => send("agent", e));
        // persist to the platform's own memory
        const id = newRunId();
        saveRun({
          id,
          ts: new Date().toISOString(),
          request: q,
          companyId: c,
          companyName: result.state.companyName ?? null,
          provider: result.provider,
          durationMs: Date.now() - started,
          report: result.state.report,
          events: result.events,
          flowResults: result.state.flowResults ?? [],
          validationResults: result.state.validationResults ?? [],
          checkResults: result.state.checkResults ?? [],
        });
        send("report", { report: result.state.report, provider: result.provider });
        send("end", { ok: true, runId: id });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      }
      return res.end();
    }

    // ── API: test cases pasted into the dashboard, run one by one ────────
    // A numbered list in the reader's own words. Each case is a row on the
    // live panel, runs in turn, and the run is saved so its test report and
    // bug sheet can be opened. Streams the same events as a features run so
    // the dashboard needs no second listener.
    if (path === "/api/cases-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const text = url.searchParams.get("text") ?? "";
      const cases = parsePastedCases(text);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (!cases.length) {
        send("fatal", { message: "No test cases found in what was pasted — number them, one per line." });
        return res.end();
      }
      if (process.env.SPINE_SCRIPTED_CASES === "0") {
        send("fatal", { message: "The pasted-case runner is switched off on this server (SPINE_SCRIPTED_CASES=0)." });
        return res.end();
      }
      const startedAt = Date.now();
      const companyName = isTokenClient(c) ? (tokenClient(c)?.name ?? null) : (await openClientContext(c).then(async (cl) => { const cfg = await loadCompanyConfig(cl, c).catch(() => null); await cl.dispose().catch(() => {}); return cfg?.companyName ?? null; }).catch(() => null));
      send("plan", { cases: cases.length, runnable: cases.length, skipped: [], pasted: true });
      try {
        const { results, records } = await runPastedCases(cases, {
          check: (check) => send("check", { check }),
          line: (line) => send("line", { line }),
          progress: (done, total) => send("progress", { done, total }),
        });
        const savedRunId = newRunId();
        saveRun({
          id: savedRunId,
          ts: new Date().toISOString(),
          request: `test cases: ${cases.length} pasted`,
          companyId: c,
          companyName,
          provider: providerLabel(),
          durationMs: Date.now() - startedAt,
          report: undefined,
          events: [{ agent: "System", kind: "plan", text: "pasted cases", data: { skipped: [] } } as any],
          flowResults: [],
          validationResults: [],
          checkResults: results,
          pastedCases: records,
        });
        send("done", { ok: true, total: results.length, runId: savedRunId });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      }
      return res.end();
    }

    // ── API: multi-company (company switcher) checks against the sandbox env ──
    if (path === "/api/multi-company") {
      const { runMultiCompanyChecks } = await import("./flows/multiCompanyChecks.js");
      const base = url.searchParams.get("env") || process.env.SANDBOX_BASE_URL || "https://procol-sandbox-demo-rfx-qa.ag-ri.in/api";
      const uid = Number(url.searchParams.get("user") || process.env.SANDBOX_USER_ID || 16297);
      const results = await runMultiCompanyChecks({
        baseUrl: base,
        userId: uid,
        accessToken: process.env.SANDBOX_ACCESS_TOKEN,
        appKey: process.env.SANDBOX_APP_KEY,
        appSecret: process.env.SANDBOX_APP_SECRET,
        appVersion: process.env.SANDBOX_APP_VERSION,
      });
      return json(res, { env: base, userId: uid, results });
    }

    // ── API: the feature tree, per-company config-aware ──
    // Pass ?c=ID and we read THAT company's live configuration (the same
    // endpoint the real Procol frontend uses), so each feature reports whether
    // this client actually has it switched on.
    if (path === "/api/features") {
      const counts = caseCountsByFeature();
      const lineItemCounts = lineItemCaseCountsByFeature();
      const cid = url.searchParams.get("c");

      /**
       * Cached per company.
       *
       * Reading a company's configuration means opening a live client — a
       * database session lookup, then the catalog, the vendor and the evaluator
       * — which took 36 seconds for PROCOL DEMO, during which the tree sat
       * empty and the platform looked broken. The answer only changes when the
       * company's own configuration does, so it is worth keeping.
       */
      // The base URL is part of the identity of this answer: the same company
      // on a different host is a different configuration, and keying without
      // it served the previous environment's tree after switching.
      const cacheKey = `features:${cid ?? "none"}:${baseOverride(url) ?? "default"}`;
      const cached = featureCache.get(cacheKey);
      if (cached && Date.now() - cached.at < FEATURE_CACHE_MS) {
        return json(res, cached.payload);
      }
      let cfg: Awaited<ReturnType<typeof loadCompanyConfig>> | null = null;
      if (cid) {
        const client = await openClientContext(Number(cid), baseOverride(url)).catch(() => null);
        if (client) {
          cfg = await loadCompanyConfig(client, Number(cid));
          await client.dispose().catch(() => {});
        }
      }
      // An account can declare that only part of the product applies to it —
      // the sandbox demo is a purchase-order tenant, so offering it sourcing
      // events would invite someone to tick a journey that cannot exist there.
      const scoped = cid && isTokenClient(Number(cid)) ? tokenClient(Number(cid)) : undefined;
      // What the backend itself would allow this client (licences, settings,
      // predicates — config/featureGates.json). Null without a database.
      const gates = cid && !scoped ? await featureGatesFor(Number(cid)) : null;
      /**
       * Scope to what this tenant actually has — down to the single feature.
       *
       * A scope of whole groups was too blunt: listing "p2p" brought delivery
       * tracking and quality notes with it, and "finance" brought payment and
       * credit notes, none of which exist on the sandbox. Someone ticking them
       * would be testing a module the tenant has no datasource for. An entry
       * is now either a group ("po") or one feature ("p2p.grn"), so the tree
       * can say exactly what is there.
       */
      const tree = scoped
        ? FEATURE_TREE.map((g) => {
            if (scoped.featureScope.includes(g.id)) return g;
            const picked = g.children.filter((f) => scoped.featureScope.includes(f.id));
            return picked.length ? { ...g, children: picked } : null;
          })
            .filter((g): g is (typeof FEATURE_TREE)[number] => Boolean(g))
            // Keep the reader's order: the scope lists the document's journey.
            .sort(
              (a, b) =>
                scoped.featureScope.findIndex((id) => id === a.id || id.startsWith(`${a.id}.`)) -
                scoped.featureScope.findIndex((id) => id === b.id || id.startsWith(`${b.id}.`)),
            )
        : FEATURE_TREE;

      const groups = tree.map((g) => ({
        ...g,
        children: g.children.map((f) => ({
          ...f,
          cases: counts[f.id] ?? 0,
          // How many of them send line items — decides whether the count field
          // applies to a selection at all.
          lineItemCases: lineItemCounts[f.id] ?? 0,
          config: mergeConfigState(
            cfg ? featureConfigState(cfg, f.requiresConfig) : { state: f.requiresConfig ? "unknown" : "n/a" },
            gates?.[f.id],
          ),
        })),
      }));

      // Defaults have to live inside the scope too, or the run would start with
      // features ticked that the tree does not even show.
      const inScope = new Set(groups.flatMap((g) => g.children.map((f) => f.id)));
      // …and never tick by default what this client does not have switched on.
      const offHere = new Set(groups.flatMap((g) => g.children.filter((f) => f.config?.state === "off").map((f) => f.id)));
      const defaults = defaultSelection().filter((id: string) => inScope.has(id) && !offHere.has(id));

      const payload = {
        groups,
        defaults,
        scope: scoped ? { note: scoped.scopeNote, name: scoped.name } : null,
        /**
         * The cases this account can actually run, not the library's total.
         *
         * A scoped account showed "283 cases" over a tree holding 35 of them:
         * the number described a library the reader could not reach from there.
         */
        totalCases: groups.reduce(
          (n, g) => n + g.children.reduce((m, f) => m + (f.cases ?? 0), 0),
          0,
        ),
        company: cfg
          ? {
              id: cfg.companyId,
              name: cfg.companyName,
              loaded: cfg.loaded,
              flagCount: Object.keys(cfg.flags).length,
              permissionCount: cfg.permissions.length,
              actorRole: cfg.actorRole,
              actorEmail: cfg.actorEmail,
              error: cfg.error,
            }
          : null,
      };
      featureCache.set(cacheKey, { at: Date.now(), payload });
      return json(res, payload);
    }

    // ── API: the browser journeys available, + this client's line-item limits ──
    if (path === "/api/ui-flows") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const tokenAccount = isTokenClient(c) ? tokenClient(c) : undefined;
      if (tokenAccount && !tokenAccount.browserJourneys) {
        /**
         * Almost none — but not none.
         *
         * The UAT journeys sign in through a database this deployment is not
         * part of, which is what this flag means. A journey pinned to THIS
         * account is a different matter: the purchase-to-bill suite signs into
         * this very tenant, so returning a flat empty list hid the one browser
         * journey that does work here.
         */
        const own = uiFlowsFor(c).filter((f) => f.clients?.includes(c));
        return json(res, {
          flows: own,
          limits: null,
          erfx: null,
          boqAllowed: null,
          note: own.length
            ? `${tokenAccount.browserNote ?? "Most browser journeys are not available for this account."} ` +
              `The ${own.length === 1 ? "journey" : "journeys"} below ${own.length === 1 ? "is" : "are"} the exception — ` +
              `built against this deployment, so ${own.length === 1 ? "it runs" : "they run"} here and nowhere else.`
            : (tokenAccount.browserNote ?? "Browser journeys are not available for this account."),
        });
      }
      let limits: any = null;
      let erfx: boolean | null = null;
      let boqAllowed: boolean | null = null;
      const client = await openClientContext(c, baseOverride(url)).catch(() => null);
      if (client) {
        const cfg = await loadCompanyConfig(client, c);
        limits = cfg.flags?.allowed_maximum_line_items ?? null;
        erfx = cfg.loaded ? isFlagOn(cfg.flags?.rfx_project_enabled) : null;
        boqAllowed = cfg.loaded ? isFlagOn(cfg.flags?.boq_in_erfx_allowed) : null;
        await client.dispose().catch(() => {});
      }
      return json(res, { flows: uiFlowsFor(c), limits, erfxMode: erfx, boqAllowed });
    }

    // ── API: run ONE browser journey, streaming Playwright's output (SSE) ──
    if (path === "/api/ui-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const flowKey = url.searchParams.get("flow") ?? "";
      const wantItems = Number(url.searchParams.get("lineItems") ?? "") || undefined;
      const wantBoq = Number(url.searchParams.get("boqItems") ?? "") || undefined;
      const headed = url.searchParams.get("headed") !== "0";
      // "sign in on screen": the journey goes through the login page instead
      // of starting already signed in. Opt-in on the wire so older callers of
      // this endpoint keep the fast path; the dashboard's switch defaults on.
      const showLogin = url.searchParams.get("login") === "1";
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Never ask for more line items than this client's config permits.
      let limits: any = null;
      const probe = await openClientContext(c, baseOverride(url)).catch(() => null);
      if (probe) {
        limits = (await loadCompanyConfig(probe, c)).flags?.allowed_maximum_line_items ?? null;
        await probe.dispose().catch(() => {});
      }
      const normal = clampLineItems(wantItems, limits, "non_boq");
      const boq = clampLineItems(wantBoq, limits, "boq");
      if (normal.capped)
        send("note", { line: `line items capped to ${normal.value} — this client allows max ${normal.limit} on normal events` });
      if (boq.capped) send("note", { line: `BOQ line items capped to ${boq.value} — this client allows max ${boq.limit}` });

      // Tag the run so the journey's Oracle findings can be picked up by id
      // instead of scraped out of stdout.
      const uiRunId = `ui-${Date.now().toString(36)}`;
      /**
       * The journey's narration, parsed once here.
       *
       * The page and the report both need the same steps; parsing on the
       * server means they cannot disagree about where a run stopped.
       */
      const trail = new JourneyTrail();
      const trailStart = Date.now();
      const { stop } = runUiFlow(
        {
          flowKey,
          companyId: c,
          runId: uiRunId,
          lineItems: wantItems ? normal.value : undefined,
          boqItems: wantBoq ? boq.value : undefined,
          headed,
          showLogin,
        },
        async (e) => {
          const ending = e.type === "done" || e.type === "run-error";
          // Every narrated line becomes a step, streamed as it happens.
          if ((e.type === "log" || e.type === "queued") && e.line) {
            const step = trail.add(e.type === "queued" ? `[queue] ${e.line}` : e.line);
            if (step) send("step", step);
          }
          if (ending) {
            saveTrail({
              runId: uiRunId,
              flowKey,
              companyId: c,
              startedAt: new Date(trailStart).toISOString(),
              endedAt: new Date().toISOString(),
              durationMs: Date.now() - trailStart,
              exitCode: e.type === "done" ? (e.exitCode ?? null) : null,
              steps: trail.all(),
              stoppedAt: trail.lastMeaningful(),
            });
            // The verdict is the point of the run — a journey that failed
            // because the API 500'd is a very different result from one that
            // failed because a selector moved, and the dashboard should say so.
            //
            // Sent BEFORE the end event, because the browser closes the stream
            // the moment it sees `done`: anything written after it is dropped,
            // which is how the Oracle's verdicts stopped reaching the page.
            try {
              const verdicts = readRunVerdicts(uiRunId);
              if (verdicts.length) send("verdicts", { runId: uiRunId, verdicts });
            } catch {
              /* no findings written — nothing to add */
            }
          }
          // The client needs the run id to open this run's own report — carried
          // on the end event only, so every other event keeps its plain shape.
          send(e.type, ending ? { ...e, runId: uiRunId } : e);
          if (ending) res.end();
        },
      );
      req.on("close", () => stop());
      return;
    }

    // ── API: type an instruction, get a real automation run ─────────────
    if (path === "/api/ai-run") {
      const q = (url.searchParams.get("q") ?? "").trim();
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const headed = url.searchParams.get("headed") !== "0";
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (!q) {
        send("run-error", { line: "no instruction given" });
        res.end();
        return;
      }

      try {
        // 1 · Understand the instruction — which journey, which parameters.
        send("stage", { name: "interpret", line: `Reading: "${q}"` });
        const intent = await interpret(q);
        send("intent", intent);

        // 2 · Recall. Before touching the app, say what is expected of this
        //     area and what has broken here before — the second half is what a
        //     new tester would not know to look for.
        const moduleName = intent.flowKey.split(".")[0];
        try {
          const { expectations, experience } = await recall(q, moduleName, 4);
          send("recall", { expectations, experience });
        } catch {
          send("stage", { name: "recall", line: "QA memory not built yet — run `npm run rag:build`" });
        }

        // 3 · Run the real journey with those parameters.
        const uiRunId = `ai-${Date.now().toString(36)}`;
        send("stage", {
          name: "execute",
          line: `Running ${intent.flowKey}${intent.lineItems ? ` · ${intent.lineItems} line items` : ""}${
            intent.template ? ` · template "${intent.template}"` : ""
          }${intent.scheduleMinutes ? ` · ${intent.scheduleMinutes} min` : ""}`,
        });
        const { stop } = runUiFlow(
          {
            flowKey: intent.flowKey,
            companyId: c,
            runId: uiRunId,
            lineItems: intent.lineItems,
            boqItems: intent.boqItems,
            template: intent.template,
            scheduleMinutes: intent.scheduleMinutes,
            headed,
            showLogin: url.searchParams.get("login") === "1",
          },
          (e) => {
            const ending = e.type === "done" || e.type === "run-error";
            if (ending) {
              // 4 · Judge. The verdict, not the exit code, is the answer — and
              // it goes out before `done`, which closes the stream at the far
              // end and would take the verdict with it.
              try {
                send("verdicts", { runId: uiRunId, verdicts: readRunVerdicts(uiRunId) });
              } catch {
                /* nothing recorded */
              }
            }
            send(e.type, e);
            if (ending) res.end();
          },
        );
        req.on("close", () => stop());
      } catch (err: any) {
        send("run-error", { line: `could not run that instruction: ${err?.message ?? err}` });
        res.end();
      }
      return;
    }

    // ── API: write a test case, watch it compiled and run ───────────────
    if (path === "/api/plan-run") {
      const testCase = (url.searchParams.get("q") ?? "").trim();
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const headed = url.searchParams.get("headed") !== "0";
      const showLogin = url.searchParams.get("login") === "1";
      const slowMo = Number(url.searchParams.get("slowmo") ?? 0) || 0;
      const dryRun = url.searchParams.get("dry") === "1";
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (!testCase) {
        send("run-error", { line: "no test case given" });
        res.end();
        return;
      }

      try {
        send("stage", { name: "compile", line: `Compiling: "${testCase.slice(0, 120)}"` });
        const compiled = await compileTestCase(testCase);
        send("plan", {
          title: compiled.plan.title,
          steps: compiled.plan.steps,
          reasoning: compiled.reasoning,
          source: compiled.source,
          warnings: compiled.warnings,
          coverage: compiled.coverage,
          gaps: compiled.gaps,
          context: {
            expectations: compiled.context.expectations.length,
            experience: compiled.context.experience.length,
          },
        });
        if (dryRun) {
          send("done", { exitCode: 0 });
          res.end();
          return;
        }
        // An empty plan would "pass" in zero steps. Say what is missing instead.
        if (compiled.coverage === "none" || !compiled.plan.steps.length) {
          send("log", { line: `[plan] not run — the automation has no step yet for: ${compiled.gaps.join("; ") || "what this case checks"}` });
          send("done", { exitCode: 0, notRun: true });
          res.end();
          return;
        }

        /**
         * A plan the compiler did not get from your words is not your test case.
         *
         * When the model returns nothing usable, `compileTestCase` substitutes a
         * standard create-and-publish journey. Running that silently is how a
         * GRN test case turned into a sourcing-event run: the platform looked
         * like it ignored what was typed. It stops here instead, says why, and
         * offers the default as a suggestion — `force=1` runs it deliberately.
         */
        if (compiled.source === "fallback" && url.searchParams.get("force") !== "1") {
          send("blocked", {
            reason:
              compiled.warnings.find((w) => /default plan|no runnable steps|no LLM/i.test(w)) ??
              "the compiler could not turn that text into steps",
            covers:
              "The browser step catalog covers sourcing events: create an event, compose stages, " +
              "template, line items, sheet, schedule, invite a vendor, publish, bid, evaluate, award. " +
              "There are no GRN, invoice, bill or PO steps in it yet, so a purchase-to-bill case " +
              "cannot be compiled into a browser journey.",
            suggestion: compiled.plan.steps.map((st: { step: string }) => st.step),
            hint: "Run the ready-made API cases for those modules instead, or add browser steps for them.",
          });
          send("done", { exitCode: 1 });
          res.end();
          return;
        }

        const runId = `plan-${Date.now().toString(36)}`;
        send("stage", { name: "execute", line: `Running ${compiled.plan.steps.length} step(s)` });
        const { stop } = runUiPlan({ plan: compiled.plan, companyId: c, runId, headed, showLogin, slowMo }, (e) => {
          const ending = e.type === "done" || e.type === "run-error";
          if (ending) {
            // The result and the verdict go out before the end event: the
            // browser closes the stream on `done`, so anything written after
            // it is dropped — which is how a finished plan arrived with no
            // steps and no verdict attached.
            const result = readPlanResult(runId);
            if (result) send("plan-result", result);
            try {
              send("verdicts", { runId, verdicts: readRunVerdicts(runId) });
            } catch {
              /* nothing recorded */
            }
          }
          send(e.type, e);
          if (ending) res.end();
        });
        req.on("close", () => stop());
      } catch (err: any) {
        send("run-error", { line: `could not compile that test case: ${err?.message ?? err}` });
        res.end();
      }
      return;
    }

    // ── API: where the automation got stuck, and what it has learned ────
    if (path === "/api/stuck") {
      json(res, { stuck: readStuck(), learned: readLearned() });
      return;
    }

    // ── API: teach the automation a locator it got stuck on ─────────────
    if (path === "/api/stuck/fix") {
      const stuckId = (url.searchParams.get("id") ?? "").trim();
      const instruction = url.searchParams.get("instruction") ?? undefined;
      const headed = url.searchParams.get("headed") !== "0";
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (!stuckId) {
        send("run-error", { line: "no stuck id given" });
        res.end();
        return;
      }
      const { stop } = runTeach({ stuckId, instruction, headed }, (e) => {
        send(e.type, e);
        if (e.type === "done" || e.type === "run-error") {
          // Show what the store holds now, so the improvement is visible.
          send("learned", { learned: readLearned() });
          res.end();
        }
      });
      req.on("close", () => stop());
      return;
    }

    // ── API: the bug report, as markdown a human can act on ─────────────
    if (path === "/api/report") {
      const md = await buildMarkdownReport({ withContext: url.searchParams.get("context") !== "0" });
      if (url.searchParams.get("download") === "1") {
        res.writeHead(200, {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="qa-report-${new Date().toISOString().slice(0, 10)}.md"`,
        });
      } else {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(md);
      return;
    }

    // ── API: defects the platform has found, grouped by defect ──────────
    if (path === "/api/findings") {
      // The same merged list the bug sheet renders, so the count in the UI and
      // the rows in the sheet can never disagree.
      const groups = allDefects();
      json(res, {
        groups,
        totals: {
          defects: groups.filter((g) => g.kind === "product_defect" || g.kind === "contradiction").length,
          gaps: groups.filter((g) => g.kind === "product_rejected_input").length,
          harness: groups.filter((g) => g.kind === "automation_defect").length,
          environment: groups.filter((g) => g.kind === "environment").length,
        },
      });
      return;
    }

    // ── API: what the platform knows (the two-tier QA memory) ───────────
    if (path === "/api/knowledge") {
      if (!isBuilt()) {
        json(res, { built: false, note: "run `npm run rag:build` to index the knowledge base" });
        return;
      }
      const q = url.searchParams.get("q");
      const mod = url.searchParams.get("module") ?? undefined;
      if (!q) {
        json(res, { built: true, ...ragStats() });
        return;
      }
      const { expectations, experience } = await recall(q, mod, 6);
      json(res, { built: true, query: q, expectations, experience });
      return;
    }

    // ── API: one company's resolved configuration (flags + permissions) ──
    if (path === "/api/company-config") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const client = await openClientContext(c, baseOverride(url));
      try {
        const cfg = await loadCompanyConfig(client, c);
        return json(res, cfg);
      } finally {
        await client.dispose().catch(() => {});
      }
    }

    // ── API: run the test cases for the ticked features (SSE) ──
    if (path === "/api/features-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const ids = (url.searchParams.get("features") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      /**
       * A run of nothing is not a clean run.
       *
       * With no features named this answered `ok: true, total: 0` — the same
       * shape a passing run has, so a caller that lost its parameter on the
       * way (a mis-sliced list, a dropped query string) was told everything
       * was fine. Nothing was tested; say that instead.
       */
      if (!ids.length) {
        send("run-error", {
          line: "no features were given, so nothing was run — tick at least one feature first",
        });
        send("done", { ok: false, total: 0, ran: false });
        return res.end();
      }
      /**
       * THE PLAN FIRST, THEN THE SIGN-IN.
       *
       * Opening the client is a database session lookup and a configuration
       * read — seven seconds on a good day, far more when UAT is busy — and
       * the plan needs none of it: it is computed from the ticked features
       * alone. Sending it before the client opens puts the whole journey on
       * screen in the first second, with a line saying what the wait is for,
       * instead of a blank card until the first call fires.
       */
      const plan = journeyPlan(ids);
      if (plan.wanted) {
        send("journey-plan", {
          plan,
          steps: plan.steps.map((kind, i) => ({ n: i + 1, kind, ...STEP_META[kind] })),
        });
      }
      send("line", { line: "Opening a session for this client…" });
      let client = await openClientContext(c, baseOverride(url));
      /** Contexts replaced mid-run; disposed together once the run ends. */
      const stale: Array<{ dispose?: () => Promise<unknown> }> = [];
      try {
        let cases = casesForFeatures(ids);
        // Read real ids (a PR, a vendor, a category, a city…) out of the live
        // client so cases referencing them can actually run.
        // Off by default: writing to real proposals/bids/trades is opt-in only.
        // Started here, awaited only when the cases need them: the journey
        // does not, so these look-ups run alongside it instead of before it.
        const caseCtxP = resolveCaseContext(client, {
          allowExistingRecordWrites: url.searchParams.get("allowWrites") === "1",
        });
        const actorP = resolveActor(client);
        const companyCfgP = loadCompanyConfig(client, c);

        /**
         * Walk the collection as a journey, BEFORE any case runs.
         *
         * The run used to open by building one RFQ event through a fixture and
         * then firing forty variations at its activation endpoint — and the
         * browser showed a single line about it. What a reader wanted to see
         * was the collection in order: sign in, create the draft, add the
         * rounds, publish, sign in as the vendor, respond, bid, wait for the
         * window to close, evaluate, award. So the run now walks exactly that,
         * one real request per step, and streams each step as it lands. The
         * library cases then act on a SECOND copy of the event the journey
         * builds, so the journey's own event can run to its close undisturbed.
         *
         * The runner never throws: a failure is a step verdict, and a step
         * whose prerequisites never appeared is recorded not-run with the
         * reason. A run of features that have nothing to do with sourcing
         * events (`plan.wanted` false) skips the journey entirely.
         */
        let journey: JourneyRecord | undefined;
        if (plan.wanted) {
          /**
           * The journey IS the run for the sourcing features.
           *
           * The first version walked the journey and then fired the library's
           * hundred-odd variations at a second copy of the event — forty
           * activations of the same endpoint after the reader had just watched
           * the event be built, bid on and awarded. It read as padding, and it
           * doubled the run time. So a ticked sourcing feature now means "walk
           * the collection for that event type", and only the modules with no
           * journey (purchase requests, master data, users…) still run as
           * individual cases. The library is untouched; it is simply not
           * replayed after the thing it describes has already been done.
           */
          cases = cases.filter((cs) => !journeyWalksFeature(cs.feature, plan));
          // The plan itself was sent before the client opened, so the list was
          // on screen while the session was being made.
          const walked = await runEventJourney(client, plan, {
            baseURL: baseOverride(url),
            stageSeconds: Number(url.searchParams.get("stageSeconds")) || 45,
            buildVariationsEvent: false,
            onStep: (step: JourneyStepRecord, planned: number) => send("journey-step", { step, planned }),
            onLine: (line: string) => send("line", { line }),
          });
          journey = walked.journey;
          send("journey", { journey });
          // The second event's ids are what `{{eventGroupUuid}}`, `{{tradeId}}`
          // and `{{lineItemUuid}}` resolve to in the cases that follow.
          const caseCtx = await caseCtxP;
          if (walked.forCases) Object.assign(caseCtx, walked.forCases);
          // Without a second copy, the cases that remain act on the journey's
          // own event — by then closed, which a case about a live event will
          // say, honestly, as "couldn't tell".
          const made = journey.made ?? {};
          if (!walked.forCases && made.eventGroupUuid) {
            Object.assign(caseCtx, {
              eventGroupUuid: made.eventGroupUuid,
              ...(made.pricingTradeUuid || made.technicalTradeUuid
                ? { tradeId: made.pricingTradeUuid ?? made.technicalTradeUuid }
                : {}),
              ...(made.lineItemUuid ? { lineItemUuid: made.lineItemUuid } : {}),
              ...(made.bidUuid ? { bidUuid: made.bidUuid } : {}),
              ...(made.proposalUuid ? { proposalUuid: made.proposalUuid } : {}),
            });
          }
        }

        // How many line items the events this run creates should carry. Capped
        // to the company's own `allowed_maximum_line_items` rather than sent as
        // asked — a request over the ceiling would be refused by the product
        // and read as a test failure, which is the platform's bug, not theirs.
        // Read once, here: the ceiling is needed before the checks are built,
        // and the feature gating below needs the same configuration.
        const caseCtx = await caseCtxP;
        const actor = await actorP;
        const companyCfg = await companyCfgP;
        const askedLineItems = Number(url.searchParams.get("lineItems") ?? "") || undefined;
        const lineItemCap = clampLineItems(
          askedLineItems,
          companyCfg.flags?.allowed_maximum_line_items ?? null,
          "non_boq",
        );
        const wantLineItems = askedLineItems ? lineItemCap.value : undefined;

        const { checks, skipped, deferred, lineItems } = buildChecksFromCases(
          client,
          cases,
          caseCtx,
          actor,
          { lineItems: wantLineItems },
        );
        /**
         * Ids created by this run, for the cases that come after.
         *
         * A case set usually opens by creating the record the rest of it acts
         * on. Resolving placeholders only before the run meant those later
         * cases were skipped every time — the RFQ set ran 1 of 3 cases, and
         * the two it skipped included an injection test.
         */
        const liveCtx: Record<string, unknown> = { ...caseCtx };

        // Drop the checks for features this company doesn't have switched on.
        // Without this, a feature that is simply OFF here looks like a product
        // bug — which is exactly how two unprovable BOQ "failures" were
        // reported before. (`companyCfg` was read above, for the line-item cap.)
        const byId = new Map(cases.map((cs) => [cs.id, cs]));
        const runGates = isTokenClient(c) ? null : await featureGatesFor(c);
        const runnable: typeof checks = [];
        for (const chk of checks) {
          // (a) the whole FEATURE may be switched off for this company
          const feat = findFeature(chk.flowId);
          const st = mergeConfigState(featureConfigState(companyCfg, feat?.requiresConfig), feat ? runGates?.[feat.id] : undefined);
          if (st.state === "off") {
            skipped.push({
              id: chk.id,
              title: chk.scenario,
              reason: `${offReason(st, companyCfg.companyName ?? "this company")} — the feature isn't enabled here, so a result would prove nothing`,
            });
            continue;
          }
          // (b) this individual CASE may depend on a setting that's off, which
          //     would make its expected outcome wrong rather than the product buggy
          const rule = companyCfg.loaded
            ? configRequirementOf(byId.get(chk.id)?.preconditions, companyCfg.flags)
            : null;
          if (rule) {
            const on = isFlagOn(companyCfg.flags[rule.flag]);
            // Both directions, because a case can need a setting ON (the rule it
            // tests only exists then) or OFF (the refusal it expects is that
            // setting's absence). Running one in the wrong workspace does not
            // find a bug, it manufactures one.
            const wrong = rule.mustBe === "on" ? !on : on;
            if (wrong) {
              skipped.push({
                id: chk.id,
                title: chk.scenario,
                reason:
                  `this case only holds when "${rule.flag}" is ${rule.mustBe.toUpperCase()}; it is ` +
                  `${on ? "ON" : "OFF"} for ${companyCfg.companyName ?? "this company"}, so the outcome ` +
                  `it expects would not apply here`,
              });
              continue;
            }
          }
          runnable.push(chk);
        }

        send("actor", { role: actor.role, email: actor.email });
        send("company", {
          id: c,
          name: companyCfg.companyName,
          configLoaded: companyCfg.loaded,
          flagCount: Object.keys(companyCfg.flags).length,
          permissionCount: companyCfg.permissions.length,
        });
        checks.length = 0;
        checks.push(...runnable);
        // Deferred cases are expected to run, so the reader's denominator
        // counts them rather than jumping when they do.
        send("plan", {
          features: ids,
          cases: cases.length,
          runnable: runnable.length + deferred.length,
          skipped,
          // Said out loud, because a count that reached only some of the set
          // would otherwise look like it reached all of it.
          lineItems: {
            ...lineItems,
            asked: askedLineItems,
            capped: lineItemCap.capped,
            limit: lineItemCap.limit,
          },
        });

        let done = 0;
        const results: CheckResult[] = [];
        const startedAt = Date.now();
        const harvest = (data: unknown, chk: Check) =>
          Object.assign(liveCtx, idsFromReply(chk.request?.path ?? "", data));

        const plannedTotal = runnable.length + deferred.length;

        /**
         * A DEAD SESSION IS NOTICED, NOT GROUND THROUGH.
         *
         * Sessions on this environment age out in minutes, and a 250-case run
         * takes longer than that. Measured on a full sweep: the session died
         * after 65 checks, and the platform carried on firing the remaining 93
         * — every one of them a 401, every one recorded "inconclusive", none
         * of them testing anything — for another 39 seconds, and then reported
         * `ok: true`. Half a run of noise, presented as a clean result.
         *
         * Three consecutive auth failures is not a flake, it is the credential
         * being gone. Log in again and carry on; if the second session is
         * refused too, stop and say how far it got rather than filling the
         * report with checks that never ran.
         */
        let consecutiveAuthFails = 0;
        /**
         * Renewing is worth ONE try, and only one.
         *
         * The session is not something this platform logs in for — it is read
         * out of the `sessions` table, freshest first, and belongs to whoever
         * last signed into that company's web console. So "renewing" re-reads
         * the database: it helps when a newer row has appeared or the context
         * itself went stale, and does nothing at all when the only session
         * there has expired server-side. Twelve renewals proved that the hard
         * way — 12 attempts, 36 checks spent failing, and it still stopped.
         *
         * One retry, then stop and name the only thing that actually fixes it.
         */
        let renewals = 0;
        const MAX_RENEWALS = 1;
        let stoppedEarly: string | null = null;

        const isAuthFailure = (r: CheckResult) =>
          r.httpStatus === 401 || /authentication failed/i.test(String(r.message ?? ""));

        /**
         * A 401 IS NOT ALWAYS THE SESSION.
         *
         * The bids API answers the buyer's web-console token with 401
         * "Authentication failed": bidding is a vendor-app action, and the
         * token is the wrong actor for it, not an expired one. Thirty bid
         * cases in a row read exactly like a dead session to the counter
         * above, and a run with a perfectly good session was stopped at 78 of
         * 120 checks with a message telling someone to log in again.
         *
         * So before the session is declared dead it is asked: one GET of the
         * dashboard configuration, the same call the journey opens with. If
         * that is accepted the session is alive, the refusals belong to the
         * endpoints, and the run carries on — the cases stay "couldn't tell",
         * which is what they are. Only a probe that is itself refused, or
         * that cannot be made, goes on to the renewal below.
         */
        let actorRefusalsNoted = false;
        const sessionAlive = async (): Promise<boolean> => {
          try {
            const r = await client?.ctx?.buyerApi?.attempt?.("GET", "/v1/dashboard_configuration", {});
            return r?.ok === true;
          } catch {
            return false;
          }
        };

        const runOne = async (chk: any): Promise<CheckResult | null> => {
          const result = await runCheck(client, chk, harvest);
          if (!isAuthFailure(result)) {
            consecutiveAuthFails = 0;
            return result;
          }
          if (++consecutiveAuthFails < 3) return result;

          if (await sessionAlive()) {
            consecutiveAuthFails = 0;
            if (!actorRefusalsNoted) {
              actorRefusalsNoted = true;
              send("note", {
                line:
                  `three calls in a row were refused as unauthorised, but the buyer's session is alive — ` +
                  `those endpoints (${chk.request?.method ?? ""} ${String(chk.request?.path ?? "").split("?")[0]} and its ` +
                  `neighbours) do not accept the buyer's console token; they need the vendor's. The cases are recorded as ` +
                  `"couldn't tell" and the run carries on.`,
              });
            }
            return result;
          }

          if (renewals < MAX_RENEWALS) {
            renewals += 1;
            send("note", {
              line: `the session expired — signing in again and carrying on (renewal ${renewals})`,
            });
            try {
              /**
               * The old context is kept until the run is over, not disposed
               * here. These clients share a Playwright request context, so
               * tearing the stale one down mid-run closed the new one with it
               * — "Target page, context or browser has been closed" on the
               * next twenty-one checks. Dropped on the floor here, cleaned up
               * in the `finally` once nothing is using it.
               */
              stale.push(client);
              client = await openClientContext(c, baseOverride(url));
              consecutiveAuthFails = 0;
              // Re-run the one that exposed it, now that there is a session.
              return await runCheck(client, chk, harvest);
            } catch (err) {
              stoppedEarly =
                `the session expired and signing in again failed (${(err as Error).message}) — ` +
                `stopped after ${done} check(s)`;
              return null;
            }
          }
          stoppedEarly =
            `the session expired after ${done} check(s) and the database has no fresher one — re-reading it ` +
            `returned the same dead session. Someone needs to log into this company's web console, which ` +
            `writes a new session row; then run this again. Nothing after this point was attempted, because ` +
            `every call would have been a 401 and proved nothing.`;
          return null;
        };

        for (const chk of runnable) {
          const result = await runOne(chk);
          if (!result) break;
          results.push(result);
          send("check", { check: result });
          send("progress", { done: ++done, total: plannedTotal });
        }

        /**
         * Now the cases that were waiting on a record this run created.
         *
         * Repeated while it keeps unblocking something, so a chain deeper than
         * one step resolves too. Whatever is still unresolved at the end is
         * reported as skipped with its original reason — never silently lost.
         */
        let waiting = deferred;
        while (waiting.length) {
          const built = buildChecksFromCases(
            client,
            waiting.map((d) => d.record),
            liveCtx,
            actor,
            // Same count as the first pass. A deferred case rebuilt without it
            // would quietly run with one line item while the rest of the run
            // used the count that was asked for.
            { lineItems: wantLineItems },
          );
          if (!built.checks.length) {
            for (const d of waiting) {
              skipped.push({
                id: d.record.id,
                title: d.record.title,
                reason:
                  `needs ${d.needs.join(", ")}, which no case in this run produced — ` +
                  "tick the case that creates it, or run the feature that does",
              });
            }
            send("skips", { skipped });
            break;
          }
          if (stoppedEarly) break;
          for (const chk of built.checks) {
            const result = await runOne(chk);
            if (!result) break;
            results.push(result);
            send("check", { check: result });
            send("progress", { done: ++done, total: Math.max(plannedTotal, done) });
          }
          if (stoppedEarly) break;
          const ran = new Set(built.checks.map((c) => c.id));
          waiting = built.deferred.filter((d) => !ran.has(d.record.id));
          if (built.skipped.length) skipped.push(...built.skipped);
        }

        /**
         * Keep the run.
         *
         * It used to stream every verdict to the browser and keep none of it,
         * so the moment the page was closed the evidence was gone — and the
         * test report had nothing to join its case list against. Saving it
         * also puts a features run in "Recent runs" beside the agent runs,
         * where a reader looks for it.
         */
        const savedRunId = newRunId();
        saveRun({
          id: savedRunId,
          ts: new Date().toISOString(),
          request: `features: ${ids.join(", ")}`,
          companyId: c,
          companyName: companyCfg.companyName ?? null,
          provider: providerLabel(),
          durationMs: Date.now() - startedAt,
          report: undefined,
          // The skip reasons belong with the run: the report shows them as why
          // a case did not run, rather than leaving a bare "not run".
          events: [{ agent: "System", kind: "plan", text: "feature run", data: { skipped } } as any],
          flowResults: [],
          validationResults: [],
          checkResults: results,
          // The journey is the record; the two legacy shapes are derived from
          // it so readers written before the journey keep working.
          journey,
          setupSteps: journey ? journeyToSetupSteps(journey) : undefined,
          setupSummary: journey ? journeyToSetupSummary(journey) : undefined,
        });

        // What actually ran, including the cases that were waiting on a record
        // an earlier case created.
        // A run cut short by a dead credential is not `ok`, and the reader is
        // owed the reason rather than a total that quietly falls short.
        if (stoppedEarly) send("run-error", { line: stoppedEarly });
        send("done", {
          ok: !stoppedEarly,
          total: results.length,
          planned: plannedTotal,
          stoppedEarly,
          runId: savedRunId,
          // The journey's one-line verdict, so the run-complete dialog can say
          // it beside the check counts — the counts alone say nothing about
          // whether a buyer could run a sourcing round on this build.
          journey: journey ? { outcome: journey.outcome, stoppedAt: journey.stoppedAt } : undefined,
        });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      } finally {
        await client.dispose().catch(() => {});
        for (const old of stale) await old.dispose?.().catch?.(() => {});
      }
      return res.end();
    }


    // ── API: the written test catalog, for picking cases by hand ────────
    //
    // 648 cases live in `test-cases/*.md`. This serves them with the route
    // each one would take if run, so the dashboard can show a person what
    // will actually happen rather than an undifferentiated Run button.
    // ── API: the case book — every written case by journey, with its latest
    //         real result (expected vs actual) copied from the runs ──────────
    if (path === "/api/case-book") {
      return json(res, buildCaseBook());
    }

    if (path === "/api/test-cases") {
      const layer = url.searchParams.get("layer") as "ui" | "api" | null;
      const found = findCases({
        layer: layer ?? undefined,
        group: url.searchParams.get("group") ?? undefined,
        verdict: url.searchParams.get("verdict") ?? undefined,
        priority: url.searchParams.get("priority") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
      });
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 400), 1000);
      return json(res, {
        total: found.length,
        stats: catalogStats(),
        coverage: routingCoverage(),
        sections: sections(layer ?? undefined),
        cases: found.slice(0, limit).map((c) => ({ ...c, route: routeFor(c) })),
      });
    }


    // ── API: the catalog arranged as USER JOURNEYS — see /api/journeys above ──

    // ── API: recorded flows → human test cases with field validations ───
    //
    // A FlowRecorder recording (procol-ui-tests/recordings/<name>.flow.json)
    // is the real /api/* traffic a browser flow fired. These routes turn it
    // into Postman-style cases with per-field checks, and can replay the READ
    // calls live (fresh token) for a genuine passed/failed — mutations are
    // never fired against live data.
    if (path === "/api/recorded-flows") {
      const converted = existsSync(DATA_DIR)
        ? readdirSync(DATA_DIR)
            .filter((f) => /^recorded-.*\.cases\.json$/.test(f))
            .map((f) => f.replace(/^recorded-/, "").replace(/\.cases\.json$/, ""))
        : [];
      const recordings = existsSync(REC_DIR)
        ? readdirSync(REC_DIR).filter((f) => f.endsWith(".flow.json")).map((f) => f.replace(/\.flow\.json$/, ""))
        : [];
      return json(res, {
        converted,
        recordings,
        pending: recordings.filter((r) => !converted.includes(r)),
      });
    }

    if (path === "/api/recorded-flow") {
      const name = (url.searchParams.get("name") ?? "").replace(/[^a-z0-9_-]/gi, "");
      const file = join(DATA_DIR, `recorded-${name}.cases.json`);
      if (!name || !existsSync(file)) return json(res, { error: `no converted flow "${name}"` });
      return json(res, JSON.parse(readFileSync(file, "utf-8")));
    }

    // Convert a recording into cases now (optionally replaying reads live), SSE.
    if (path === "/api/convert-flow") {
      const name = (url.searchParams.get("name") ?? "").replace(/[^a-z0-9_-]/gi, "");
      const replay = url.searchParams.get("replay") === "1";
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const src = join(REC_DIR, `${name}.flow.json`);
      if (!name || !existsSync(src)) {
        send("error", { line: `no recording "${name}" in procol-ui-tests/recordings/` });
        return res.end();
      }
      try {
        const fc = flowToCases(loadRecording(src), src);
        send("start", { name: fc.name, total: fc.cases.length, context: fc.context, replay });
        if (replay) {
          for (const c of fc.cases) {
            const { case: judged, outcome } = await replayCase(c);
            Object.assign(c, judged);
            send("case", {
              id: c.id, method: c.method, path: c.path, title: c.title,
              replayed: outcome.replayed, liveStatus: outcome.liveStatus,
              passed: outcome.passed, failed: outcome.failed, skipped: outcome.skipped,
              reason: outcome.reason,
            });
          }
          await disposeReplay();
        }
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(join(DATA_DIR, `recorded-${name}.cases.json`), JSON.stringify({ ...fc, replayed: replay }, null, 2));
        send("done", { ok: true, name: fc.name, cases: fc.cases.length });
      } catch (err: any) {
        send("error", { line: String(err?.message ?? err) });
      }
      return res.end();
    }

    // ── API: compile a whole journey's cases IN PARALLEL (many planner agents,
    //         no browser) — this is the "run multiple agents" that is safe with
    //         a single browser: planning fans out, execution stays sequential.
    if (path === "/api/journey-compile") {
      const jid = url.searchParams.get("id") ?? "";
      const conc = Math.max(1, Math.min(Number(url.searchParams.get("concurrency") ?? 6), 12));
      const { journeys } = buildJourneys();
      const journey = journeys.find((j) => j.id === jid);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (!journey) {
        send("error", { line: `no journey "${jid}"` });
        return res.end();
      }
      // Only the cases the compiler actually plans (a written UI case → a plan).
      const compilable = journey.cases.filter((c) => c.routeKind === "ui-compile");
      send("plan", { id: journey.id, title: journey.title, total: compilable.length, concurrency: conc });
      let cancelled = false;
      req.on("close", () => (cancelled = true));
      let i = 0;
      const worker = async () => {
        while (!cancelled) {
          const idx = i++;
          if (idx >= compilable.length) return;
          const jc = compilable[idx];
          const c = caseById(jc.id);
          if (!c) continue;
          send("compiling", { id: jc.id });
          try {
            const compiled = await compileTestCase(caseAsProse(c));
            send("compiled", {
              id: jc.id,
              title: jc.title,
              coverage: compiled.coverage,
              steps: compiled.plan.steps.map((st) => st.step),
              gaps: compiled.gaps,
              source: compiled.source,
            });
          } catch (err: any) {
            send("compiled", { id: jc.id, title: jc.title, coverage: "error", steps: [], gaps: [String(err?.message ?? err)], source: "error" });
          }
        }
      };
      await Promise.all(Array.from({ length: conc }, () => worker()));
      send("done", { ok: true });
      return res.end();
    }

    // ── API: run the cases a person ticked (SSE) ────────────────────────
    //
    // Each case goes to its own route, and cases are run one at a time: a UI
    // journey drives a real browser and the API cases share one login and one
    // set of fixtures, so running them at once would have them fight over the
    // same sandbox records.
    if (path === "/api/case-run") {
      const ids = (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const headed = url.searchParams.get("headed") !== "0";
      const showLogin = url.searchParams.get("login") === "1";
      const slowMo = Number(url.searchParams.get("slowmo") ?? 0) || 0;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      let cancelled = false;
      let stopChild: (() => void) | null = null;
      req.on("close", () => {
        cancelled = true;
        stopChild?.();
      });

      const picked = ids.map((id) => caseById(id)).filter((x): x is NonNullable<typeof x> => !!x);
      if (!picked.length) {
        send("run-error", { line: "none of those case ids are in the catalog" });
        return res.end();
      }
      send("plan", {
        cases: picked.map((k) => ({ id: k.id, title: k.title, layer: k.layer, route: routeFor(k) })),
      });

      let index = 0;
      for (const k of picked) {
        if (cancelled) break;
        index += 1;
        const route = routeFor(k);
        send("case", { id: k.id, title: k.title, status: "running", route, index, total: picked.length });

        if (!route.runnable) {
          send("case", { id: k.id, status: "not-run", route, reason: route.because });
          continue;
        }

        try {
          if (route.kind === "api-case" || route.kind === "api-section") {
            const beIds = (route.target ?? "").split(",").filter(Boolean);
            // A section route runs the framework's cases for that AREA, which
            // is not the same as running this written case. Say so in the
            // stream so nobody reads the green as this case passing.
            if (route.kind === "api-section") {
              send("note", { id: k.id, line: `running ${beIds.length} API case(s) covering this area — not this case exactly` });
            }
            const results = await runApiCases(
              beIds,
              (r) => send("api-case", { id: k.id, result: r }),
              (line) => send("note", { id: k.id, line }),
            );
            const failed = results.filter((r) => r.status === "failed").length;
            const passed = results.filter((r) => r.status === "passed").length;
            send("case", {
              id: k.id,
              status: failed ? "failed" : passed ? "passed" : "skipped",
              route,
              summary: `${passed} passed · ${failed} failed · ${results.length - passed - failed} skipped`,
            });
            continue;
          }

          if (route.kind === "api-suite") {
            const client = await openClientContext(c, baseOverride(url));
            try {
              const checks = await buildChecksForFlow(client, route.target!);
              let failed = 0;
              for (const chk of checks) {
                if (cancelled) break;
                const done = await runCheck(client, chk);
                if (!done.pass) failed += 1;
                send("check", { id: k.id, check: done });
              }
              send("case", {
                id: k.id,
                status: failed ? "failed" : "passed",
                route,
                summary: `${checks.length - failed}/${checks.length} checks passed`,
              });
            } finally {
              await client.dispose().catch(() => {});
            }
            continue;
          }

          if (route.kind === "ui-journey") {
            const runId = `case-${k.id}-${Date.now().toString(36)}`;
            await new Promise<void>((resolve) => {
              const { stop } = runUiFlow({ flowKey: route.target!, companyId: c, runId, headed, showLogin }, (e) => {
                if (e.type === "log") send("note", { id: k.id, line: e.line });
                if (e.type === "queued") send("queued", { id: k.id, line: e.line });
                if (e.type === "done" || e.type === "run-error") {
                  send("case", {
                    id: k.id,
                    status: e.exitCode === 0 ? "passed" : "failed",
                    route,
                    summary: `journey ${route.target} exited ${e.exitCode ?? "?"}`,
                  });
                  resolve();
                }
              });
              stopChild = () => {
                stop();
                resolve();
              };
            });
            continue;
          }

          // ui-compile: the written case becomes a plan, which is streamed
          // before it runs so a person can see what it decided to do.
          const compiled = await compileTestCase(caseAsProse(k));
          send("compiled", {
            id: k.id,
            title: compiled.plan.title,
            steps: compiled.plan.steps,
            warnings: compiled.warnings,
            source: compiled.source,
            coverage: compiled.coverage,
            gaps: compiled.gaps,
          });
          // No step can observe what this case is about. Running the nearest
          // steps would produce a green tick that means nothing — so it is
          // reported as untestable, and the gap is on the ledger to build.
          if (compiled.coverage === "none") {
            send("case", {
              id: k.id,
              status: "not-run",
              route,
              reason: `the automation has no step yet for: ${compiled.gaps.join("; ") || "what this case checks"}`,
            });
            continue;
          }
          const partial = compiled.coverage === "partial";
          const runId = `case-${k.id}-${Date.now().toString(36)}`;
          await new Promise<void>((resolve) => {
            const { stop } = runUiPlan({ plan: compiled.plan, companyId: c, runId, headed, showLogin, slowMo }, (e) => {
              if (e.type === "log") send("note", { id: k.id, line: e.line });
              if (e.type === "queued") send("queued", { id: k.id, line: e.line });
              if (e.type === "done" || e.type === "run-error") {
                const result = readPlanResult(runId) as { steps?: Array<{ status?: string }> } | null;
                const steps = result?.steps;
                const stepSummary = steps
                  ? `${steps.filter((s) => s.status === "ok").length}/${steps.length} steps`
                  : `plan exited ${e.exitCode ?? "?"}`;
                // A partial plan that passes is not this case passing.
                const passed = e.exitCode === 0;
                send("case", {
                  id: k.id,
                  status: passed ? (partial ? "partial" : "passed") : "failed",
                  route,
                  summary: partial && passed ? `${stepSummary} — but only part of the case is covered (no step for: ${compiled.gaps.join("; ")})` : stepSummary,
                  planResult: result,
                });
                resolve();
              }
            });
            stopChild = () => {
              stop();
              resolve();
            };
          });
        } catch (err: any) {
          send("case", { id: k.id, status: "failed", route, summary: `could not run it: ${err?.message ?? err}` });
        }
      }

      send("done", { ok: true });
      return res.end();
    }

    // ── API: every runnable validation suite (for the suites panel) ──
    if (path === "/api/suites") {
      return json(res, { suites: ALL_SUITES });
    }

    // ── API: run MANY suites back-to-back, streaming every check (SSE) ──
    if (path === "/api/suites-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const only = (url.searchParams.get("kind") ?? "all") as "all" | "read" | "write";
      const ids = (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const wanted = ids.length
        ? ALL_SUITES.filter((s) => ids.includes(s.id))
        : ALL_SUITES.filter((s) => only === "all" || s.kind === only);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const client = await openClientContext(c, baseOverride(url));
      try {
        send("plan", { suites: wanted.map((s) => ({ id: s.id, label: s.label, kind: s.kind })) });
        for (const s of wanted) {
          send("suite", { id: s.id, label: s.label, kind: s.kind, status: "running" });
          try {
            const checks = await buildChecksForFlow(client, s.id);
            send("suite", { id: s.id, label: s.label, kind: s.kind, status: "built", total: checks.length });
            for (const chk of checks) send("check", { check: await runCheck(client, chk) });
            send("suite", { id: s.id, label: s.label, kind: s.kind, status: "done", total: checks.length });
          } catch (err: any) {
            // One suite failing to set up must never abort the whole run.
            send("suite", { id: s.id, label: s.label, kind: s.kind, status: "error", message: err?.message ?? String(err) });
          }
        }
        send("done", { ok: true });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      } finally {
        await client.dispose().catch(() => {});
      }
      return res.end();
    }

    // ── API: run ONE flow directly (control-panel button) → functional result ──
    if (path === "/api/flow-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const flow = url.searchParams.get("flow") ?? "";
      return json(res, { result: await runFlow(flow, c) });
    }

    // ── API: run a flow's whole validation suite directly (SSE) ──
    if (path === "/api/flow-checks") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const flow = url.searchParams.get("flow") ?? "";
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const client = await openClientContext(c, baseOverride(url));
      try {
        const checks = await buildChecksForFlow(client, flow);
        send("total", { total: checks.length });
        for (const chk of checks) send("check", { check: await runCheck(client, chk) });
        send("done", { ok: true });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      } finally {
        await client.dispose().catch(() => {});
      }
      return res.end();
    }

    // ── API: re-run ONE check on demand ──
    if (path === "/api/rerun-check") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const flow = url.searchParams.get("flow") ?? "";
      const id = url.searchParams.get("id") ?? "";
      const client = await openClientContext(c, baseOverride(url));
      try {
        const checks = await buildChecksForFlow(client, flow);
        const check = checks.find((k) => k.id === id);
        if (!check) return json(res, { error: `no check ${id} in ${flow}` });
        return json(res, { check: await runCheck(client, check) });
      } finally {
        await client.dispose().catch(() => {});
      }
    }

    // ── API: headed UI automation (SSE) — launches a visible Chromium ──
    if (path === "/api/ui-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        const { runUiAutomation } = await import("./ui/browserRunner.js");
        const results = await runUiAutomation(c, (e) => send("ui", e));
        send("ui-done", { results });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      }
      return res.end();
    }

    // ── API: the api-automation test report, generated by the `procol test`
    //         Playwright suite next door. Served from here so the dashboard can
    //         link straight to it — it lives outside PUBLIC, so the static
    //         handler below would (correctly) refuse to serve it. ──
    if (path === "/api/api-report" || path === "/api/api-report/meta") {
      const report = suiteFile("api-report.html");
      const summary = suiteFile("api-report.json");
      if (path.endsWith("/meta")) {
        if (!report) {
          return json(res, { exists: false, hint: `run \`npm test\` in ${SUITE_NAME} to generate it` });
        }
        const stat = statSync(report);
        let totals: any = null;
        let modules: string[] = [];
        let moduleScope: string | undefined;
        if (summary) {
          try {
            const model = JSON.parse(readFileSync(summary, "utf8"));
            totals = model.totals ?? null;
            moduleScope = model.moduleScope ?? undefined;
            // Which modules that report actually covers, so the UI can say
            // whether the module someone ticked is in it.
            modules = [
              ...new Set(
                (model.clients ?? []).flatMap((c: any) => (c.modules ?? []).map((m: any) => m.module))
              ),
            ] as string[];
          } catch {
            totals = null;
          }
        }
        return json(res, {
          exists: true,
          generatedAt: stat.mtime.toISOString(),
          bytes: stat.size,
          totals,
          modules,
          moduleScope,
        });
      }
      if (!report) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end(`No api-report.html yet — run \`npm test\` in ${SUITE_NAME}.`);
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(report));
    }

    // ── API: the test report — the ticked modules' cases, verdict, curl ──
    // Built from the case library (what the module asks for) joined to the last
    // run (what the product did). "features" is what the UI had ticked, so the
    // module is chosen once, there, and never typed on a command line.
    if (path === "/api/test-report") {
      res.setHeader("cache-control", "no-store");
      const asked = (url.searchParams.get("features") ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      const runId = url.searchParams.get("run");
      const run = runId ? getRun(runId) : latestRun();
      // Default to the modules the RUN covered, not to the whole library. A
      // report that answers "how did the Intake run go?" with 283 unrelated
      // cases is not a report about that run.
      const features = asked.length ? asked : featuresOfRun(run);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(renderTestReport({ features, run }));
    }

    // ── API: what the next PO run will create ───────────────────────────
    if (path === "/api/po-input") {
      const summary = poInputSummary();
      const account = isTokenClient(Number(url.searchParams.get("c") ?? 0))
        ? tokenClient(Number(url.searchParams.get("c")))
        : undefined;
      if (!account) return json(res, { ...summary, account: null, suiteClient: null });

      /**
       * Get a working credential now, so the UI can say "this will not run"
       * before anyone presses a button that writes real data.
       *
       * An expired token is no longer a dead end: this account can log itself
       * in, so `resolveToken` tries the stored one and mints a fresh one when
       * it has aged out. Only a login that fails outright is worth reporting.
       */
      let token: { ok: boolean; status?: number; message?: string; source?: string };
      try {
        const resolved = await resolveToken(account);
        token = {
          ...(await checkToken({
            apiBaseUrl: account.apiBaseUrl,
            headerName: account.headerName,
            appVersion: account.appVersion,
            token: resolved.token,
          })),
          source: resolved.source,
        };
      } catch (err) {
        token = { ok: false, message: (err as Error).message };
      }
      return json(res, {
        ...summary,
        account: account.name,
        suiteClient: account.suiteClientId ?? null,
        token,
        tokenVar: account.tokenVar,
      });
    }

    // ── API: the suite's tiers, and what each one does ──────────────────
    if (path === "/api/suite-tiers") {
      return json(res, { tiers: TIERS });
    }

    // ── API: run one tier of the API suite (SSE) ─────────────────────────
    // The same command a person would type, scoped by MODULE= to whatever is
    // ticked here, so the run and its report are the suite's own.
    if (path === "/api/suite-run") {
      const tier = (url.searchParams.get("tier") ?? "config") as SuiteTier;
      if (!TIERS.some((t) => t.id === tier)) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: `unknown tier "${tier}"` }));
      }
      const module = url.searchParams.get("module") ?? undefined;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const run = runSuiteTier({ tier, module }, (e) => send(e.type, e));
      req.on("close", () => run.stop());
      return;
    }

    // ── API: run the API suite's PO flow for this account (SSE) ─────────
    // Header -> line items -> submit for approval, with the values in the
    // suite's config/po-input.json. Creates real records, so it only ever runs
    // when someone presses the button.
    if (path === "/api/po-run") {
      const c = Number(url.searchParams.get("c") ?? 0);
      const account = isTokenClient(c) ? tokenClient(c) : undefined;
      if (!account) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            error:
              "The PO flow runs against an account that has the flexi purchase-order module — " +
              "pick Sandbox (P2P flow) in the client list.",
          }),
        );
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const submit = url.searchParams.get("submit") !== "0";
      /**
       * Hand the run a token that works right now — for the account SELECTED.
       *
       * Both halves of this used to name the sandbox outright: the token was
       * resolved for company 900001 whatever was picked, and the flow ran with
       * `--client procol_sandbox_demo`. So an account with a working login
       * could not be run at all, and the one that could be run had no login.
       *
       * The suite would otherwise read the .env copy, which is the one that
       * expires — the run would get as far as the first call and stop on a
       * 401. Logging in takes two requests and about a second; a failed run
       * against a live tenant costs far more than that.
       */
      if (!account.suiteClientId) {
        send("run-error", {
          line: `${account.name} has no purchase-order flow configured in the API suite.`,
        });
        return res.end();
      }
      let fresh: { token: string; source: string } | null = null;
      try {
        fresh = await resolveToken(account);
        if (fresh.source === "minted")
          send("log", { line: "· the stored token had expired — logged in and minted a fresh one" });
      } catch (err) {
        send("run-error", {
          line: `could not get a working token for ${account.name}: ${(err as Error).message}`,
        });
        return res.end();
      }
      /**
       * Every PO run gets an id of its own.
       *
       * Without one there was nothing to hang this run's reports off, so the
       * "Bug sheet" button after a PO run opened the platform's whole standing
       * sheet — every finding ever filed, from every module — instead of what
       * had just happened.
       */
      const poRunId = `po-${Date.now().toString(36)}`;
      send("log", { line: `· run id ${poRunId}` });
      const run = runPoFlow(
        {
          clientId: account.suiteClientId,
          submit,
          tokenVar: account.tokenVar,
          token: fresh?.token,
          runId: poRunId,
          companyId: c,
          companyName: account.name,
        },
        (e) => send(e.type, { ...e, runId: e.runId ?? poRunId }),
      );
      req.on("close", () => run.stop());
      return;
    }

    // ── API: the PO run's report ────────────────────────────────────────
    // Written by the suite at the end of every PO run: each phase, every call,
    // and the curl for it. Served here so the run and its evidence are one click
    // apart instead of one project apart.
    if (path === "/api/po-report") {
      /**
       * One run's report, when the link carries a run id.
       *
       * The suite keeps a single file and overwrites it, so opening "the PO
       * report" from a run finished ten minutes ago showed whichever run had
       * happened since. Each run's page is kept beside its report now.
       */
      const runId = url.searchParams.get("run");
      if (runId) {
        const html = readPoRunHtml(runId);
        if (html) {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          return res.end(html);
        }
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end(
          `That run (${runId}) stopped before it wrote a report — its log and its bug sheet are what it left.`,
        );
      }
      const file = suiteFile("po-run-report.html");
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("No PO run report yet — run the PO automation first.");
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(readFileSync(file));
    }

    // ── API: the UI automation report — what broke, and the screen it broke on ──
    if (path === "/api/ui-report") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      /**
       * One run, or every journey.
       *
       * The page opens this with the run id the moment the browser stops, so
       * the first thing on screen is the verdict for the thing just run —
       * and, when it broke, the step it stopped at.
       */
      const runId = url.searchParams.get("run");
      if (runId) return res.end(renderUiRunReport(runId));
      return res.end(renderUiReport());
    }

    // ── API: one failure screenshot ─────────────────────────────────────
    // Path-guarded: the report only ever asks for files under the UI suite's
    // findings directory, and anything that resolves outside it is refused.
    if (path === "/api/ui-shot") {
      const rel = url.searchParams.get("f") ?? "";
      const file = uiShotPath(rel);
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("no such screenshot");
      }
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      return res.end(readFileSync(file));
    }

    // ── API: which API module a feature selection means ─────────────────
    // The UI holds feature ids; the API report is keyed on modules. One place
    // translates, so the mapping cannot drift between the two.
    if (path === "/api/api-modules") {
      const features = (url.searchParams.get("features") ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      return json(res, {
        modules: apiModulesFor(features),
        single: singleApiModule(features) ?? null,
      });
    }

    // ── API: the bug report, as the QA bug sheet ────────────────────────
    // This platform's own findings, in the columns the team's bug sheet uses.
    // /api/report is the same findings as markdown, for pasting into a ticket;
    // /api/suite-bug-report is the API suite's separate, hand-maintained list.
    // ── API: a person's edits to the bug sheet ──────────────────────────
    // One field per request, keyed on the defect's fingerprint, kept apart from
    // what the platform derives so a re-run never overwrites a decision.
    if (path === "/api/bug-triage") {
      if (req.method === "POST") {
        const raw = await readBody(req);
        let payload: any;
        try {
          payload = JSON.parse(raw || "{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "body must be JSON" }));
        }
        const id = typeof payload.id === "string" ? payload.id : "";
        const field = typeof payload.field === "string" ? payload.field : "";
        if (!id || !isTriageField(field)) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "id and a known field are required" }));
        }
        const row = saveTriageField(id, field, String(payload.value ?? ""));
        return json(res, { ok: true, row });
      }
      return json(res, { triage: loadTriage() });
    }

    if (path === "/api/bug-report") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      /**
       * Scoped to one run when asked.
       *
       * Opening the sheet straight after a run and reading someone else's
       * all-time list — hand-raised PO bugs at the top, after an Intake run —
       * is how the report stopped answering the question being asked.
       */
      const runId = url.searchParams.get("run");
      if (runId) {
        const run = getRun(runId);
        if (run) {
          const found = defectsFromRun(runId);
          return res.end(
            renderBugSheet(found, {
              runId,
              ts: run.ts,
              request: run.request,
              companyName: run.companyName,
              checks: run.checkResults?.length ?? 0,
              stillOpen: stillOpenFor(featuresOfRun(run), found),
            }),
          );
        }
        /**
         * Not an API run — a PO run.
         *
         * Its findings are the calls the app refused, which live in the report
         * the run filed under its own id. Read before the journey branch
         * because a PO run has neither checks nor a trail, and would otherwise
         * fall through to an empty journey sheet.
         */
        const poRun = readPoRun(runId);
        if (poRun) {
          return res.end(
            renderBugSheet(defectsFromPoRun(poRun), {
              runId,
              ts: poRun.startedAt,
              request: "PO automation: create a purchase order and take it through approval",
              companyName: poRun.companyName ?? null,
              kind: "journey",
              // "it passed" is about the calls; whether the document got where
              // it was going is a different question, and the one a reader is
              // actually asking after a purchase-order run.
              outcome: poRun.issues?.length
                ? "the purchase order was created, but the run could not finish the flow"
                : poRun.exitCode === 0
                  ? "it passed"
                  : "it stopped early",
              // Facts about the run, shown above the bugs and not counted as any.
              notes: poRun.issues,
            }),
          );
        }

        /**
         * Not an API run — a browser journey.
         *
         * Journeys keep their findings elsewhere (the Oracle writes them per
         * run into the UI suite), so looking only in the API run store meant a
         * journey's "Bug sheet" button fell through to the unscoped sheet: the
         * hand-raised PO list, opened straight after a PR journey. Same
         * question, different drawer to look in.
         */
        const trail = readTrail(runId);
        // A journey that passed files no finding, so this used to render an
        // empty sheet for a run that spent two minutes fighting the product.
        // Its friction — waits, retries, heals, failed background calls — is
        // the sheet for a green run.
        const found = [
          ...summariseFindings().filter((d) => d.runs.includes(runId)),
          ...uiRunDefects(runId),
        ];
        return res.end(
          renderBugSheet(found, {
            runId,
            ts: trail?.startedAt,
            request: trail?.flowKey ? `browser journey: ${trail.flowKey}` : undefined,
            companyName: trail?.companyId ? String(trail.companyId) : undefined,
            // No `checks`: a journey has steps, not checks, and the header's
            // "N checks ran" would be the wrong word for what it counted.
            kind: "journey",
            outcome:
              trail == null ? undefined : trail.exitCode === 0 ? "it passed" : "it broke",
          }),
        );
      }
      return res.end(renderBugSheet());
    }

    if (path === "/api/suite-bug-report") {
      const sheet = suiteFile("bug-report.html");
      if (!sheet) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end(`No bug-report.html yet — run \`npm run report:bugs\` in ${SUITE_NAME}.`);
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(sheet));
    }

    /**
     * WHICH BUILD OF THE PAGE THIS IS.
     *
     * The static files are sent `no-store`, which stops a browser CACHING
     * them — and does nothing at all for a tab that loaded them an hour ago
     * and has been open ever since. That tab keeps running the JavaScript it
     * started with, so a fix lands on disk, the server serves it, and the
     * reader is still looking at the old page wondering why nothing changed.
     * It has already cost one round trip of "I fixed that" / "no you didn't".
     *
     * The page polls this and reloads itself when the answer changes.
     */
    if (path === "/api/build") {
      const parts = ["index.html", "app.js", "styles.css"].map((name) => {
        try {
          const st = statSync(join(PUBLIC, name));
          return `${name}:${st.mtimeMs}:${st.size}`;
        } catch {
          return `${name}:absent`;
        }
      });
      return json(res, { version: parts.join("|") });
    }

    // ── static files ──
    let file = path === "/" ? "/index.html" : path;
    const full = join(PUBLIC, file);
    if (full.startsWith(PUBLIC) && existsSync(full)) {
      // no-store, because these files carry no version and no validator: with
      // nothing to revalidate against, a browser is free to keep app.js for
      // hours — which is exactly what happened, and left the UI showing old
      // buttons wired to old endpoints while the server had moved on.
      res.writeHead(200, {
        "content-type": MIME[extname(full)] ?? "text/plain",
        "cache-control": "no-store, must-revalidate",
      });
      return res.end(readFileSync(full));
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`[${req.method} ${req.url}] ${message}`);
    // A streaming endpoint has already sent its headers, and writing them
    // again throws INSIDE the catch — which took the whole process down. That
    // is why a failed run looked like "nothing happens": the server was gone.
    if (res.headersSent) {
      try {
        res.write(`event: fatal\ndata: ${JSON.stringify({ message })}\n\n`);
      } catch {
        /* the socket may already be closed */
      }
      return res.end();
    }
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
});

/**
 * Last resort.
 *
 * One unhandled rejection used to exit the process, so a single bad run took
 * the UI down with it and every later click failed with "connection refused".
 * Log it and stay up: a dead server is a worse answer than a failed request.
 */
process.on("unhandledRejection", (reason) => {
  console.error(`[unhandled rejection] ${reason instanceof Error ? reason.message : String(reason)}`);
});
process.on("uncaughtException", (err) => {
  console.error(`[uncaught] ${err.message}`);
});

function json(res: any, body: any) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  // Settle which embedder is really available before anything reads the
  // memory, so the dashboard's stale/fresh verdict is about reality.
  ensureEmbedderReady().then((id) => console.log(`   Embedder: ${id}`)).catch(() => {});
  console.log(`\n🚀 spine.ai — Procol QA platform UI  →  http://localhost:${PORT}`);
  console.log(`   AI provider: ${providerLabel()}\n`);
});
