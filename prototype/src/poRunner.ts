import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { savePoRun, savePoRunHtml } from "./poRunStore.js";

/**
 * PO API AUTOMATION — run the API suite's purchase-order flow from here.
 *
 * The platform's own PO cases are console-API cases: they need an event group,
 * an order and a vendor uuid that only exist on UAT. The sandbox demo account
 * has none of that — what it has is the flexi purchase-order module, and the
 * API suite next door already drives it end to end (header -> line items ->
 * submit for approval) using the values in `config/po-input.json`.
 *
 * So this reimplements none of it, and copies none of that data here. It runs
 * the suite where the data lives and streams the result back, which keeps
 * po-input.json the single place a PO's values are written: edit that file and
 * the next run started from this platform uses it.
 */

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The API suite, vendored into this repo.
 *
 * It used to be the parent repository, which meant the platform could not be
 * opened on its own — close p2p_endtoend_flow_api_automation and the PO flow
 * disappeared. It lives at ../api-suite now, and the parent is only a fallback
 * for a checkout that predates the move.
 */
const VENDORED = join(here, "..", "..", "api-suite");
const SUITE_DIR = existsSync(join(VENDORED, "src", "cli", "createPo.ts"))
  ? VENDORED
  : join(here, "..", "..", "..");
const INPUT_FILE = join(SUITE_DIR, "config", "po-input.json");
const RUN_REPORT = join(SUITE_DIR, "reports", "po-run-report.json");

/** Strips terminal colour codes so a streamed line reads cleanly in the UI. */
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

export interface PoRunEvent {
  type: "start" | "log" | "step" | "done" | "run-error";
  line?: string;
  command?: string;
  exitCode?: number;
  step?: { title: string; status: string; calls: number; failed: number; ms: number };
  summary?: { steps: number; calls: number; failedCalls: number };
  /** This run's id, so the reports it produces can be opened for it alone. */
  runId?: string;
  /** Where this run's report was snapshotted, if it wrote one. */
  reportFile?: string;
}

/**
 * Is this account's token still good?
 *
 * One cheap authenticated call, so a stale token is reported before someone
 * presses Run and watches the flow fail at the last step with a 401 buried in
 * a log. Sessions on this platform expire, so this WILL happen regularly — the
 * UI should say it up front, not after.
 */
export async function checkToken(client: {
  apiBaseUrl: string;
  headerName: string;
  appVersion: string;
  token: string;
}): Promise<{ ok: boolean; status?: number; message?: string }> {
  try {
    const res = await fetch(`${client.apiBaseUrl.replace(/\/$/, "")}/v1/dashboard_configuration`, {
      headers: {
        accept: "application/json",
        "app-version": client.appVersion,
        [client.headerName]: client.token,
      },
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text();
    let message = `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: { message?: string } | string };
      message = (typeof body.error === "object" ? body.error?.message : (body.error as string)) ?? message;
    } catch {
      /* keep the status */
    }
    return { ok: false, status: res.status, message };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** What the next run will create, straight from the suite's input file. */
export function poInputSummary(): {
  exists: boolean;
  client?: string;
  lineItems?: number;
  headerFields?: string[];
  file: string;
} {
  if (!existsSync(INPUT_FILE)) return { exists: false, file: INPUT_FILE };
  try {
    const raw = JSON.parse(readFileSync(INPUT_FILE, "utf8")) as {
      client?: string;
      header?: Record<string, unknown>;
      lineItems?: unknown[];
    };
    return {
      exists: true,
      client: raw.client,
      lineItems: Array.isArray(raw.lineItems) ? raw.lineItems.length : undefined,
      headerFields: raw.header ? Object.keys(raw.header) : [],
      file: INPUT_FILE,
    };
  } catch {
    return { exists: true, file: INPUT_FILE };
  }
}

/**
 * Runs it, streaming the suite's own output.
 *
 * `--client` is passed explicitly rather than left to po-input.json's `client`
 * key, so the account picked in this UI is the account written to. A run that
 * silently created a PO in a different tenant would be the worst possible
 * surprise.
 */
export function runPoFlow(
  opts: {
    clientId: string;
    submit?: boolean;
    /**
     * A working token for this account, and the variable to hand it to.
     *
     * The suite reads its token from its own .env, which is exactly the copy
     * that expires — so when the platform has just logged in and minted a
     * fresh one, it passes it here. dotenv does not overwrite a variable that
     * is already set, so the child uses this and the file is left alone.
     */
    tokenVar?: string;
    token?: string;
    /**
     * The platform's id for this run.
     *
     * The suite has a run id of its own (it stamps it on the PO's name), but
     * the platform needs one it minted itself to file the run's report under
     * and to scope the bug sheet to. Carried through so both ends of the
     * stream agree on which run is being talked about.
     */
    runId?: string;
    companyId?: number | null;
    companyName?: string;
  },
  emit: (e: PoRunEvent) => void,
): { stop: () => void } {
  const args = ["tsx", "src/cli/createPo.ts", "--client", opts.clientId];
  if (opts.submit === false) args.push("--no-submit");
  const command = `npx ${args.join(" ")}`;
  emit({ type: "start", command, line: `$ ${command}` });

  const env = { ...process.env };
  if (opts.tokenVar && opts.token) env[opts.tokenVar] = opts.token;
  /**
   * Noted BEFORE the child starts, so a report can be told apart from the one
   * already on disk. See where it is read, below.
   */
  const spawnedAt = Date.now();
  /** Lines the run used to say it could not finish something. */
  const issues: string[] = [];
  const child = spawn("npx", args, { cwd: SUITE_DIR, shell: false, env });
  const pump = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      const clean = line.replace(ANSI, "").trimEnd();
      // "! not submitted …" and "✗ …" are the run telling us something did not
      // complete. Kept, because the call log will not show it.
      const notable = clean.match(/^\s*(?:!\s+not submitted|✗)\s+(.{4,400})$/);
      if (notable) issues.push(notable[1].trim());
      if (clean.trim()) emit({ type: "log", line: clean });
    }
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("error", (e) => emit({ type: "run-error", line: e.message }));

  child.on("close", (code) => {
    /**
     * The suite writes a full run report; read its steps out so the UI can show
     * what each phase did rather than only the log it already streamed.
     *
     * ONLY IF IT IS THIS RUN'S. The report lives at a fixed path and is
     * overwritten each time, so "the file exists" was never the same question
     * as "this run wrote it". When a run stopped without writing one, the
     * previous run's file was read and its steps emitted as if they were this
     * run's — which is how a run that died on a 422 came back with a full set
     * of green ticks, and why the rows all appeared at once at the end
     * instead of the log's own ✓/✗ standing. The suite now writes a report
     * even when it stops (see createPo.ts), so a stale file means something
     * killed the process; either way it is not evidence about this run.
     */
    try {
      if (existsSync(RUN_REPORT) && statSync(RUN_REPORT).mtimeMs < spawnedAt) {
        emit({
          type: "log",
          line:
            "· this run stopped before it could write a report — the steps above are the run's own log, " +
            "not a report",
        });
        emit({ type: "done", exitCode: code ?? -1, runId: opts.runId });
        return;
      }
      if (existsSync(RUN_REPORT)) {
        const model = JSON.parse(readFileSync(RUN_REPORT, "utf8")) as {
          cases?: Array<{
            test: { title: string; status: string; durationMs: number };
            calls?: unknown[];
            failedCalls?: unknown[];
          }>;
          totals?: { calls: number; failedCalls: number };
        };
        // Filed under this run's id before anything is emitted, so the
        // reports the UI is about to link to can actually be opened.
        if (opts.runId) {
          try {
            const html = join(SUITE_DIR, "reports", "po-run-report.html");
            if (existsSync(html)) savePoRunHtml(opts.runId, readFileSync(html, "utf8"));
          } catch {
            /* the JSON below is the part that matters */
          }
          savePoRun({
            runId: opts.runId,
            startedAt: new Date(spawnedAt).toISOString(),
            endedAt: new Date().toISOString(),
            exitCode: code ?? null,
            companyId: opts.companyId ?? null,
            companyName: opts.companyName,
            issues,
            report: model,
          });
        }
        for (const c of model.cases ?? []) {
          emit({
            type: "step",
            step: {
              title: c.test.title,
              status: c.test.status,
              calls: c.calls?.length ?? 0,
              failed: c.failedCalls?.length ?? 0,
              ms: Math.round(c.test.durationMs),
            },
          });
        }
        emit({
          type: "done",
          exitCode: code ?? -1,
          runId: opts.runId,
          summary: {
            steps: model.cases?.length ?? 0,
            calls: model.totals?.calls ?? 0,
            failedCalls: model.totals?.failedCalls ?? 0,
          },
        });
        return;
      }
    } catch {
      /* fall through to the plain close below */
    }
    emit({ type: "done", exitCode: code ?? -1, runId: opts.runId });
  });

  return { stop: () => child.kill("SIGTERM") };
}
