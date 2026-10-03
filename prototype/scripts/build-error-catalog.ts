/**
 * The backend's error codes, with WHERE each one is raised — for the memory.
 *
 *   npx tsx scripts/build-error-catalog.ts
 *
 * data/app-errors.json already maps code → message (scripts/build-app-access.ts).
 * This adds, per code: the HTTP status and title from config/locales/en-IN.yml,
 * and every place in app/ and lib/ that raises it (file:line + the method it is
 * in), found by reading procol-backend origin/main READ-ONLY (git show / git grep).
 *
 * Writes data/app-error-catalog.json. The memory build reads that file, so the
 * build never needs the backend checkout (or works the same without it).
 *
 * "Raised at" is pattern-based: render_error_json(N…), `return N`,
 * `return x, N`, `[:code] = N`, `code: N`, `error_code = N`, and a bare N on its
 * own line (a method's return value). It finds the common shapes, not every
 * indirection — a code passed through a variable is listed where the literal is.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const BACKEND = join(ROOT, "..", "procol-backend");
const OUT = join(ROOT, "data", "app-error-catalog.json");
const git = (...args: string[]) =>
  execFileSync("git", ["-C", BACKEND, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const rev = git("rev-parse", "--short=10", "origin/main").trim();
const errors = (JSON.parse(readFileSync(join(ROOT, "data", "app-errors.json"), "utf8")) as { errors: Record<string, string> }).errors;

// status + title per code (Ruby keeps the LAST of a repeated key; so does this)
const locale = YAML.parse(git("show", "origin/main:config/locales/en-IN.yml"), { uniqueKeys: false }) as any;
const apiErrors = (locale?.["en-IN"]?.api_errors ?? {}) as Record<string, any>;

const PATTERN = [
  String.raw`render_error_json\(\s*[0-9]+`,
  String.raw`return\s+([a-z_@]+,\s*)?[0-9]{2,4}\b`,
  String.raw`\[:code\]\s*=\s*[0-9]+`,
  String.raw`code:\s*[0-9]{2,4}\b`,
  String.raw`error_code\s*=\s*[0-9]+`,
  String.raw`^\s*[0-9]{2,4}\s*$`,
].join("|");

let grep = "";
try {
  grep = git("grep", "-n", "-I", "-P", PATTERN, "origin/main", "--", "app", "lib");
} catch (e: any) {
  grep = e.stdout ?? ""; // exit 1 = no matches
}

const fileCache = new Map<string, string[]>();
function lines(path: string): string[] {
  if (!fileCache.has(path)) fileCache.set(path, git("show", `origin/main:${path}`).split("\n"));
  return fileCache.get(path)!;
}
/** The method a line sits in: nearest `def` above it. */
function methodAt(path: string, line: number): string | undefined {
  const ls = lines(path);
  for (let i = line - 1; i >= 0; i--) {
    const m = /^\s*def\s+(self\.)?([A-Za-z0-9_?!=]+)/.exec(ls[i] ?? "");
    if (m) return m[2];
  }
  return undefined;
}

const EVENT_PATH = /trade|event_group|bid|evaluat|proposal|award|auction|template|rfq|rfp|rfx|add_new_stage|surrogate|lot|schedule|audience|knockout|dutch/i;
const raised: Record<string, Array<{ at: string; method?: string }>> = {};
for (const row of grep.split("\n")) {
  const m = /^origin\/main:([^:]+):(\d+):(.*)$/.exec(row);
  if (!m) continue;
  const [, path, ln, content] = m;
  if (!/\.rb$/.test(path)) continue;
  const codeM =
    /render_error_json\(\s*([0-9]+)/.exec(content) ??
    /return\s+(?:[a-z_@]+,\s*)?([0-9]{2,4})\b/.exec(content) ??
    /\[:code\]\s*=\s*([0-9]+)/.exec(content) ??
    /code:\s*([0-9]{2,4})\b/.exec(content) ??
    /error_code\s*=\s*([0-9]+)/.exec(content) ??
    /^\s*([0-9]{2,4})\s*$/.exec(content);
  if (!codeM) continue;
  const code = String(Number(codeM[1]));
  if (!errors[code]) continue; // a number that is not a documented error code
  (raised[code] ??= []).push({ at: `${path}:${ln}`, method: methodAt(path, Number(ln)) });
}

const codes: Record<string, { message: string; status: number | null; statusNote?: string; title?: string; events: boolean; raisedAt: Array<{ at: string; method?: string }> }> = {};
for (const [code, message] of Object.entries(errors)) {
  const y = apiErrors[code];
  const status = typeof y === "object" && y?.status_code ? Number(y.status_code) : null;
  const where = raised[code] ?? [];
  codes[code] = {
    message,
    status,
    ...(status === null ? { statusNote: "no status_code in en-IN.yml — render_error_json answers HTTP 500 unless the caller passes a status (json_helpers.rb:19)" } : {}),
    ...(typeof y === "object" && y?.title ? { title: String(y.title) } : {}),
    events: where.some((w) => EVENT_PATH.test(w.at)),
    raisedAt: where,
  };
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: `procol-backend origin/main ${rev}: config/locales/en-IN.yml api_errors + git grep of app/ lib/ for the raise sites (read-only)`,
      generatedAt: new Date().toISOString(),
      codes,
    },
    null,
    1,
  ) + "\n",
);
const n = Object.keys(codes).length;
const withSites = Object.values(codes).filter((c) => c.raisedAt.length).length;
const ev = Object.values(codes).filter((c) => c.events).length;
console.log(`wrote ${OUT}: ${n} codes, ${withSites} with raise sites found, ${ev} raised in event code`);
