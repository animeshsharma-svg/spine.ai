import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/** The API suite: the repo this platform sits inside. */
const SUITE_DIR = join(here, "..", "..", "..");
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
  opts: { clientId: string; submit?: boolean },
  emit: (e: PoRunEvent) => void,
): { stop: () => void } {
  const args = ["ts-node", "src/cli/createPo.ts", "--client", opts.clientId];
  if (opts.submit === false) args.push("--no-submit");
  const command = `npx ${args.join(" ")}`;
  emit({ type: "start", command, line: `$ ${command}` });

  const child = spawn("npx", args, { cwd: SUITE_DIR, shell: false });
  const pump = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      const clean = line.replace(ANSI, "").trimEnd();
      if (clean.trim()) emit({ type: "log", line: clean });
    }
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("error", (e) => emit({ type: "run-error", line: e.message }));

  child.on("close", (code) => {
    // The suite writes a full run report; read its steps out so the UI can show
    // what each phase did rather than only the log it already streamed.
    try {
      if (existsSync(RUN_REPORT)) {
        const model = JSON.parse(readFileSync(RUN_REPORT, "utf8")) as {
          cases?: Array<{
            test: { title: string; status: string; durationMs: number };
            calls?: unknown[];
            failedCalls?: unknown[];
          }>;
          totals?: { calls: number; failedCalls: number };
        };
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
    emit({ type: "done", exitCode: code ?? -1 });
  });

  return { stop: () => child.kill("SIGTERM") };
}
