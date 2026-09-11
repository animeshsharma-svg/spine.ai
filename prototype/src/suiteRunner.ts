import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE API SUITE, RUN FROM HERE.
 *
 * The suite next door has three tiers behind their own gates, and until now
 * the only way to run them was to type a command in its directory. That is one
 * project too many for someone who just wants to know whether the PO module is
 * healthy — so the platform spawns them, streams the output, and reads the
 * report the run leaves behind.
 *
 * Nothing is reimplemented and nothing is copied: the suite stays the owner of
 * its tiers, its module scope and its reports. This only presses the button.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SUITE_DIR = join(here, "..", "..", "..");
const REPORT = join(SUITE_DIR, "reports", "api-report.json");

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

/** Which tier to run, in the words the UI uses. */
export type SuiteTier = "config" | "live" | "write";

export const TIERS: Array<{ id: SuiteTier; label: string; what: string; writes: boolean }> = [
  {
    id: "config",
    label: "Config checks",
    what: "Offline. Parses every client config and proves the plan it would send is complete. No network, no credentials.",
    writes: false,
  },
  {
    id: "live",
    label: "Live read-only",
    what: "Calls the account for real but only reads: status codes, response times, schema shape, and drift between the live schema and the committed config.",
    writes: false,
  },
  {
    id: "write",
    label: "Live writes",
    what: "Creates real records: a PO header, its line items, then submits it. Plus the negative cases that must be refused.",
    writes: true,
  },
];

export interface SuiteRunEvent {
  type: "start" | "log" | "done" | "error";
  line?: string;
  command?: string;
  exitCode?: number;
  totals?: { tests: number; passed: number; failed: number; skipped: number };
  moduleScope?: string;
}

/**
 * Runs one tier, optionally scoped to a module.
 *
 * `MODULE=` is the suite's own switch, so a run started here is the same run a
 * person would start by hand — same scope, same report, same numbers.
 */
export function runSuiteTier(
  opts: { tier: SuiteTier; module?: string },
  emit: (e: SuiteRunEvent) => void,
): { stop: () => void } {
  const script = opts.tier === "config" ? "test" : opts.tier === "live" ? "test:live" : "test:write";
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (opts.module) env.MODULE = opts.module;

  const command = `${opts.module ? `MODULE=${opts.module} ` : ""}npm run ${script}`;
  emit({ type: "start", command, line: `$ ${command}` });

  const child = spawn("npm", ["run", script], { cwd: SUITE_DIR, env, shell: false });
  const pump = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      const clean = line.replace(ANSI, "").trimEnd();
      if (clean.trim()) emit({ type: "log", line: clean });
    }
  };
  child.stdout.on("data", pump);
  child.stderr.on("data", pump);
  child.on("error", (e) => emit({ type: "error", line: e.message }));

  child.on("close", (code) => {
    // The suite writes its own report; read the totals so the UI can state the
    // outcome rather than making someone scan the log for it.
    try {
      if (existsSync(REPORT)) {
        const model = JSON.parse(readFileSync(REPORT, "utf8")) as {
          totals?: { tests: number; passed: number; failed: number; skipped: number };
          moduleScope?: string;
        };
        return emit({
          type: "done",
          exitCode: code ?? -1,
          totals: model.totals,
          moduleScope: model.moduleScope,
        });
      }
    } catch {
      /* fall through */
    }
    emit({ type: "done", exitCode: code ?? -1 });
  });

  return { stop: () => child.kill("SIGTERM") };
}
