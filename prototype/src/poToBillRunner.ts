import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PO -> BILL — the three-way match chain, run from the platform.
 *
 * A Playwright project of its own (po-to-bill/), ported from the Postman
 * collection: purchase order, GRN, invoice, bill, twenty-one steps in a strict
 * serial chain where each step's request body depends on the uuid the last one
 * returned. Every step asserts four things — status code, response time,
 * schema, and the data itself.
 *
 * It is spawned rather than reimplemented, for the same reason as the PO flow:
 * the chain, its fixtures and its per-scenario variables stay in one place,
 * and editing po-to-bill/.env changes the next run.
 *
 * It writes real records on the tenant it points at, so nothing here runs
 * without a person pressing the button.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CHAIN_DIR = join(here, "..", "..", "po-to-bill");
const RESULT_FILE = join(CHAIN_DIR, "last-run.json");

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

export interface ChainStep {
  title: string;
  status: "passed" | "failed" | "skipped" | "timedOut" | "interrupted";
  ms: number;
  error?: string;
}

export interface ChainEvent {
  type: "start" | "log" | "step" | "done" | "run-error";
  line?: string;
  command?: string;
  exitCode?: number;
  step?: ChainStep;
  summary?: { total: number; passed: number; failed: number; skipped: number };
}

/** Is the chain present and installed? */
export function chainStatus(): { ready: boolean; reason?: string; steps?: number } {
  if (!existsSync(join(CHAIN_DIR, "tests", "3way-match.spec.ts"))) {
    return { ready: false, reason: "po-to-bill/ is not in this repo" };
  }
  if (!existsSync(join(CHAIN_DIR, "node_modules", "@playwright", "test"))) {
    return { ready: false, reason: "po-to-bill needs `npm install` before it can run" };
  }
  const spec = readFileSync(join(CHAIN_DIR, "tests", "3way-match.spec.ts"), "utf8");
  return { ready: true, steps: (spec.match(/^\s*test\(/gm) ?? []).length };
}

/** What this run will do, read from the chain's own variables. */
export function chainPlan(): Record<string, string> {
  const file = join(CHAIN_DIR, ".env");
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(BASE_URL|PO_QTY|PO_UNIT_PRICE|GRN_RECEIVED_QTY|GRN_ACCEPTED_QTY|INVOICE_QTY|INVOICE_UNIT_PRICE)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Runs the chain, streaming each step as it finishes.
 *
 * Two reporters: `line` for the stream a reader watches, and `json` written to
 * disk for the exact per-step results — the printed line rounds its duration
 * and says nothing about which assertion failed.
 */
export function runChain(emit: (e: ChainEvent) => void): { stop: () => void } {
  const ready = chainStatus();
  if (!ready.ready) {
    emit({ type: "run-error", line: ready.reason ?? "the chain is not ready to run" });
    emit({ type: "done", exitCode: 1 });
    return { stop: () => {} };
  }

  rmSync(RESULT_FILE, { force: true });
  const args = ["playwright", "test", "--reporter=line,json"];
  const command = `npx ${args.join(" ")}`;
  emit({ type: "start", command, line: `$ ${command}` });

  const child = spawn("npx", args, {
    cwd: CHAIN_DIR,
    shell: false,
    env: { ...(process.env as Record<string, string>), PLAYWRIGHT_JSON_OUTPUT_NAME: RESULT_FILE },
  });

  const pump = (buf: Buffer) => {
    for (const raw of buf.toString().split("\n")) {
      const line = raw.replace(ANSI, "").trimEnd();
      if (!line.trim()) continue;
      emit({ type: "log", line });
      // The list reporter prints one line per finished test; turn it into a
      // row straight away so a twenty-minute chain is not a silent wait.
      const done = line.match(/^\s*(✓|✘|✗|-)\s+\d+\s+.*?›\s*(.+?)\s*\((\d+(?:\.\d+)?)(m?s)\)\s*$/);
      if (done) {
        const [, mark, title, value, unit] = done;
        emit({
          type: "step",
          step: {
            title,
            status: mark === "✓" ? "passed" : mark === "-" ? "skipped" : "failed",
            ms: unit === "s" ? Math.round(Number(value) * 1000) : Number(value),
          },
        });
      }
    }
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("error", (e) => emit({ type: "run-error", line: e.message }));

  child.on("close", (code) => {
    // The JSON report carries what the printed lines cannot: which assertion
    // failed, and the exact order the chain ran in.
    try {
      if (existsSync(RESULT_FILE)) {
        const report = JSON.parse(readFileSync(RESULT_FILE, "utf8")) as {
          suites?: Array<{ suites?: unknown[]; specs?: unknown[] }>;
        };
        const steps: ChainStep[] = [];
        const walk = (node: any): void => {
          for (const spec of node.specs ?? []) {
            const result = spec.tests?.[0]?.results?.[0];
            steps.push({
              title: spec.title,
              status: (result?.status ?? "skipped") as ChainStep["status"],
              ms: Math.round(result?.duration ?? 0),
              error: result?.error?.message?.replace(ANSI, "").split("\n")[0],
            });
          }
          for (const child of node.suites ?? []) walk(child);
        };
        for (const suite of report.suites ?? []) walk(suite);
        for (const step of steps) emit({ type: "step", step });
        emit({
          type: "done",
          exitCode: code ?? -1,
          summary: {
            total: steps.length,
            passed: steps.filter((s) => s.status === "passed").length,
            failed: steps.filter((s) => s.status === "failed" || s.status === "timedOut").length,
            skipped: steps.filter((s) => s.status === "skipped").length,
          },
        });
        return;
      }
    } catch {
      /* fall through to the plain close */
    }
    emit({ type: "done", exitCode: code ?? -1 });
  });

  return { stop: () => child.kill("SIGTERM") };
}
