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
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { getCapabilityMap, openClientContext, runFlow, runSelected } from "./executor.js";
import { FEATURE_TREE, defaultSelection, findFeature } from "../config/featureTree.js";
import { apiModulesFor, singleApiModule } from "../config/apiModules.js";
import { caseCountsByFeature, casesForFeatures, buildChecksFromCases, loadCases, resolveCaseContext, resolveActor, configRequirementOf } from "./checks/caseLibrary.js";
import { runOrchestrator } from "./agents/orchestrator.js";
import type { CheckResult } from "./ai/types.js";
import { providerLabel } from "./ai/llm.js";
import { DEFAULT_CLIENT } from "../config/settings.js";
import { isTokenClient, tokenClient } from "../config/tokenClients.js";
import { readToken, tokenClientChoices } from "./tokenClient.js";
import { saveRun, listRuns, getRun, newRunId } from "./runStore.js";
import { buildChecksForFlow, ALL_SUITES } from "./checks/suites.js";
import { runCheck } from "./checks/engine.js";
import { loadCompanyConfig, featureConfigState, isFlagOn } from "./checks/companyConfig.js";
import { UI_FLOWS, runUiFlow, clampLineItems } from "./ui/uiFlowRunner.js";
import { readRunVerdicts, summariseFindings } from "./agents/oracle.js";
import { interpret } from "./agents/uiIntent.js";
import { recall, stats as ragStats, isBuilt } from "./rag/knowledgeBase.js";
import { buildMarkdownReport } from "./report/bugReport.js";
import { allDefects, renderBugSheet } from "./report/bugSheet.js";
import { isTriageField, loadTriage, saveTriageField } from "./triageStore.js";
import { featuresOfRun, latestRun, renderTestReport } from "./report/testReport.js";
import { renderUiReport, uiShotPath } from "./report/uiReport.js";
import { checkToken, poInputSummary, runPoFlow } from "./poRunner.js";
import { TIERS, runSuiteTier, type SuiteTier } from "./suiteRunner.js";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "..", "public");

/**
 * Where the API automation suite writes its reports.
 *
 * The maintained suite is the repo this platform sits inside
 * (p2p_endtoend_flow_api_automation); "procol test" is the earlier copy kept
 * as a fallback so an older checkout still serves something rather than 404ing.
 * First one that has the file wins.
 */
const SUITE_REPORT_DIRS = [
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
const capCache = new Map<number, any>();

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

    // ── API: capability map ──
    if (path === "/api/capability") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      if (capCache.has(c)) return json(res, capCache.get(c));
      const map = await getCapabilityMap(c);
      capCache.set(c, map);
      return json(res, map);
    }

    // ── API: run history ──
    if (path === "/api/runs") {
      return json(res, { runs: listRuns(20) });
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
      const cid = url.searchParams.get("c");
      let cfg: Awaited<ReturnType<typeof loadCompanyConfig>> | null = null;
      if (cid) {
        const client = await openClientContext(Number(cid)).catch(() => null);
        if (client) {
          cfg = await loadCompanyConfig(client, Number(cid));
          await client.dispose().catch(() => {});
        }
      }
      // An account can declare that only part of the product applies to it —
      // the sandbox demo is a purchase-order tenant, so offering it sourcing
      // events would invite someone to tick a journey that cannot exist there.
      const scoped = cid && isTokenClient(Number(cid)) ? tokenClient(Number(cid)) : undefined;
      const tree = scoped
        ? scoped.featureScope
            .map((id) => FEATURE_TREE.find((g) => g.id === id))
            .filter((g): g is (typeof FEATURE_TREE)[number] => Boolean(g))
        : FEATURE_TREE;

      const groups = tree.map((g) => ({
        ...g,
        children: g.children.map((f) => ({
          ...f,
          cases: counts[f.id] ?? 0,
          config: cfg ? featureConfigState(cfg, f.requiresConfig) : { state: f.requiresConfig ? "unknown" : "n/a" },
        })),
      }));

      // Defaults have to live inside the scope too, or the run would start with
      // features ticked that the tree does not even show.
      const inScope = new Set(groups.flatMap((g) => g.children.map((f) => f.id)));
      const defaults = defaultSelection().filter((id: string) => inScope.has(id));

      return json(res, {
        groups,
        defaults,
        scope: scoped ? { note: scoped.scopeNote, name: scoped.name } : null,
        totalCases: loadCases().length,
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
      });
    }

    // ── API: the browser journeys available, + this client's line-item limits ──
    if (path === "/api/ui-flows") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const tokenAccount = isTokenClient(c) ? tokenClient(c) : undefined;
      if (tokenAccount && !tokenAccount.browserJourneys) {
        return json(res, {
          flows: [],
          limits: null,
          erfx: null,
          boqAllowed: null,
          note: tokenAccount.browserNote ?? "Browser journeys are not available for this account.",
        });
      }
      let limits: any = null;
      let erfx: boolean | null = null;
      let boqAllowed: boolean | null = null;
      const client = await openClientContext(c).catch(() => null);
      if (client) {
        const cfg = await loadCompanyConfig(client, c);
        limits = cfg.flags?.allowed_maximum_line_items ?? null;
        erfx = cfg.loaded ? isFlagOn(cfg.flags?.rfx_project_enabled) : null;
        boqAllowed = cfg.loaded ? isFlagOn(cfg.flags?.boq_in_erfx_allowed) : null;
        await client.dispose().catch(() => {});
      }
      return json(res, { flows: UI_FLOWS, limits, erfxMode: erfx, boqAllowed });
    }

    // ── API: run ONE browser journey, streaming Playwright's output (SSE) ──
    if (path === "/api/ui-run") {
      const c = Number(url.searchParams.get("c") ?? DEFAULT_CLIENT.companyId);
      const flowKey = url.searchParams.get("flow") ?? "";
      const wantItems = Number(url.searchParams.get("lineItems") ?? "") || undefined;
      const wantBoq = Number(url.searchParams.get("boqItems") ?? "") || undefined;
      const headed = url.searchParams.get("headed") !== "0";
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Never ask for more line items than this client's config permits.
      let limits: any = null;
      const probe = await openClientContext(c).catch(() => null);
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
      const { stop } = runUiFlow(
        {
          flowKey,
          companyId: c,
          runId: uiRunId,
          lineItems: wantItems ? normal.value : undefined,
          boqItems: wantBoq ? boq.value : undefined,
          headed,
        },
        async (e) => {
          send(e.type, e);
          if (e.type === "done" || e.type === "error") {
            // The verdict is the point of the run — a journey that failed
            // because the API 500'd is a very different result from one that
            // failed because a selector moved, and the dashboard should say so.
            try {
              const verdicts = readRunVerdicts(uiRunId);
              if (verdicts.length) send("verdicts", { runId: uiRunId, verdicts });
            } catch {
              /* no findings written — nothing to add */
            }
            res.end();
          }
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
        send("error", { line: "no instruction given" });
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
          },
          (e) => {
            send(e.type, e);
            if (e.type === "done" || e.type === "error") {
              // 4 · Judge. The verdict, not the exit code, is the answer.
              try {
                send("verdicts", { runId: uiRunId, verdicts: readRunVerdicts(uiRunId) });
              } catch {
                /* nothing recorded */
              }
              res.end();
            }
          },
        );
        req.on("close", () => stop());
      } catch (err: any) {
        send("error", { line: `could not run that instruction: ${err?.message ?? err}` });
        res.end();
      }
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
      const client = await openClientContext(c);
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
      const withFlows = url.searchParams.get("flows") === "1";
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const client = await openClientContext(c);
      try {
        const cases = casesForFeatures(ids);
        // Read real ids (a PR, a vendor, a category, a city…) out of the live
        // client so cases referencing them can actually run.
        // Off by default: writing to real proposals/bids/trades is opt-in only.
        const caseCtx = await resolveCaseContext(client, {
          allowExistingRecordWrites: url.searchParams.get("allowWrites") === "1",
        });
        const actor = await resolveActor(client);
        const { checks, skipped } = buildChecksFromCases(client, cases, caseCtx, actor);

        // Read this company's live configuration and drop the checks for
        // features it doesn't have switched on. Without this, a feature that is
        // simply OFF here looks like a product bug — which is exactly how two
        // unprovable BOQ "failures" were reported before.
        const companyCfg = await loadCompanyConfig(client, c);
        const byId = new Map(cases.map((cs) => [cs.id, cs]));
        const runnable: typeof checks = [];
        for (const chk of checks) {
          // (a) the whole FEATURE may be switched off for this company
          const feat = findFeature(chk.flowId);
          const st = featureConfigState(companyCfg, feat?.requiresConfig);
          if (st.state === "off") {
            skipped.push({
              id: chk.id,
              title: chk.scenario,
              reason: `"${st.flag}" is OFF for ${companyCfg.companyName ?? "this company"} — the feature isn't enabled here, so a result would prove nothing`,
            });
            continue;
          }
          // (b) this individual CASE may depend on a setting that's off, which
          //     would make its expected outcome wrong rather than the product buggy
          const ruleFlag = companyCfg.loaded
            ? configRequirementOf(byId.get(chk.id)?.preconditions, companyCfg.flags)
            : null;
          if (ruleFlag && !isFlagOn(companyCfg.flags[ruleFlag])) {
            skipped.push({
              id: chk.id,
              title: chk.scenario,
              reason: `this case only holds when "${ruleFlag}" is ON; it is OFF for ${companyCfg.companyName ?? "this company"}, so the expected outcome would not apply`,
            });
            continue;
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
        send("plan", { features: ids, cases: cases.length, runnable: checks.length, skipped });

        // Optional: also run the real end-to-end journeys for ticked features.
        if (withFlows && isTokenClient(c)) {
          send("flow", {
            flowId: "(all)",
            status: "error",
            message:
              `${tokenClient(c)?.name} is a sandbox deployment with no UAT database behind it, ` +
              `so the end-to-end journeys cannot run for it. Its API test cases still do.`,
          });
        } else if (withFlows) {
          const flowIds = [...new Set(ids.map((id) => findFeature(id)?.flowId).filter(Boolean))] as string[];
          for (const f of flowIds) {
            send("flow", { flowId: f, status: "running" });
            try {
              const [r] = await runSelected(client, [f]);
              send("flow", { flowId: f, status: "done", result: r });
            } catch (e: any) {
              send("flow", { flowId: f, status: "error", message: e?.message ?? String(e) });
            }
          }
        }

        let done = 0;
        const results: CheckResult[] = [];
        const startedAt = Date.now();
        for (const chk of checks) {
          const result = await runCheck(client, chk);
          results.push(result);
          send("check", { check: result });
          send("progress", { done: ++done, total: checks.length });
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
        });

        send("done", { ok: true, total: checks.length, runId: savedRunId });
      } catch (err: any) {
        send("fatal", { message: err?.message ?? String(err) });
      } finally {
        await client.dispose().catch(() => {});
      }
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
      const client = await openClientContext(c);
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
      const client = await openClientContext(c);
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
      const client = await openClientContext(c);
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

      // Check the credential now, so the UI can say "this will not run" before
      // anyone presses a button that writes real data.
      let token: { ok: boolean; status?: number; message?: string };
      try {
        token = await checkToken({
          apiBaseUrl: account.apiBaseUrl,
          headerName: account.headerName,
          appVersion: account.appVersion,
          token: readToken(account),
        });
      } catch (err) {
        token = { ok: false, message: (err as Error).message };
      }
      return json(res, {
        ...summary,
        account: account.name,
        suiteClient: "procol_sandbox_demo",
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
              "pick Procol Sandbox Demo (PO) in the client list.",
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
      const run = runPoFlow({ clientId: "procol_sandbox_demo", submit }, (e) => send(e.type, e));
      req.on("close", () => run.stop());
      return;
    }

    // ── API: the PO run's report ────────────────────────────────────────
    // Written by the suite at the end of every PO run: each phase, every call,
    // and the curl for it. Served here so the run and its evidence are one click
    // apart instead of one project apart.
    if (path === "/api/po-report") {
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
  console.log(`\n🚀 Procol QA platform UI  →  http://localhost:${PORT}`);
  console.log(`   AI provider: ${providerLabel()}\n`);
});
