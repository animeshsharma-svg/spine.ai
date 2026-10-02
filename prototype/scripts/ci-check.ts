/**
 * The offline checks — the same ones GitHub Actions runs on every push and
 * pull request (.github/workflows/ci.yml) — runnable here before you push.
 *
 *   npm run ci:check                      every check
 *   npm run ci:check -- --only catalog    one or more (comma list)
 *   npm run ci:check -- --skip migrations
 *   npm run ci:check -- --fix             keep a regenerated catalog instead of restoring it
 *   npm run ci:check -- --list            what the checks are
 *
 * No check calls Procol, reads a secret, or needs the network. The migration
 * check needs a Postgres with pgvector: in CI a throwaway service container
 * (CI_SPINE_DB_URL); here, a scratch SCHEMA inside spine.ai's own database that
 * is dropped again straight after (the local `spine` role cannot create
 * databases). Nothing in public is touched — a migration that names `public.`
 * explicitly is refused rather than run against the real tables.
 *
 * Exit code 0 when every check that ran passed; 1 otherwise. A check that
 * cannot run here (no database locally) is reported as SKIPPED, never as a
 * pass — and in CI a skip counts as a failure.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { argParser, knownPlaceholders, PROCOL_TEST, PROTO, REPO, validateCases } from "./ci-lib.js";

const args = argParser();
const IN_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

type Status = "pass" | "fail" | "skip";
interface CheckResult {
  status: Status;
  summary: string;
  details?: string[];
}
interface CheckDef {
  name: string;
  what: string;
  run: () => Promise<CheckResult>;
}

const TSC = (dir: string) => join(dir, "node_modules", ".bin", "tsc");
const TSX = join(PROTO, "node_modules", ".bin", "tsx");

function sh(cmd: string, argv: string[], cwd: string, env: NodeJS.ProcessEnv = {}, timeoutMs = 600_000) {
  const r = spawnSync(cmd, argv, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? (r.signal ? 124 : 1), out: `${r.stdout ?? ""}${r.stderr ?? ""}`, error: r.error };
}

const tail = (s: string, n = 25) => s.trim().split("\n").slice(-n);

// ── 1. type checks ──────────────────────────────────────────────────────────

function typecheck(dir: string, label: string): () => Promise<CheckResult> {
  return async () => {
    if (!existsSync(TSC(dir))) return { status: "fail", summary: `${label}: TypeScript is not installed — run \`npm ci\` in ${dir}` };
    const r = sh(TSC(dir), ["--noEmit", "-p", "."], dir);
    if (r.code === 0) return { status: "pass", summary: `${label} type-checks cleanly` };
    const errors = r.out.split("\n").filter((l) => /error TS\d+/.test(l));
    return { status: "fail", summary: `${label}: ${errors.length || "some"} type error(s)`, details: (errors.length ? errors : tail(r.out)).slice(0, 40) };
  };
}

// ── 2. the written catalog is in step with its markdown ─────────────────────

/** A catalog file without its timestamp, for comparing two builds. */
function stable(file: string): string {
  const j = JSON.parse(readFileSync(file, "utf8"));
  delete j.generatedAt;
  return JSON.stringify(j);
}

async function checkCatalog(): Promise<CheckResult> {
  const files = ["test-cases.json", "journeys.json"].map((f) => join(PROTO, "data", f));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) return { status: "fail", summary: `committed catalog file(s) missing: ${missing.join(", ")}` };
  const stamp = `${process.pid}-${Date.now()}`;
  const backups = files.map((f) => join(tmpdir(), `spine-ci-${stamp}-${f.split("/").pop()}`));
  files.forEach((f, i) => copyFileSync(f, backups[i]));
  const before = files.map(stable);
  const r = sh(TSX, ["scripts/import-test-cases.ts"], PROTO);
  const written = files.map((f) => (existsSync(f) ? readFileSync(f, "utf8") : ""));
  const details: string[] = [];
  let status: Status = "pass";
  try {
    if (r.code !== 0) return { status: "fail", summary: "`npm run cases:import` failed", details: tail(r.out) };
    const journeys = JSON.parse(readFileSync(files[1], "utf8"));
    const orphans: unknown[] = journeys.orphans ?? [];
    const parsed = r.out.match(/Parsed (\d+) cases/)?.[1];
    const dupes = r.out.match(/(\d+) duplicate case id\(s\): ([^\n]+)/);
    const missingField = r.out.match(/(\d+) case\(s\) missing a field: ([^\n]+)/);
    if (!r.out.includes("Journeys:")) {
      status = "fail";
      details.push("the journeys file was not rebuilt (the import printed no Journeys line):", ...tail(r.out, 5));
    }
    if (orphans.length) {
      status = "fail";
      details.push(
        `${orphans.length} written case(s) belong to no journey — each needs a home in src/checks/journeys.ts:`,
        ...orphans.slice(0, 15).map((o: any) => `  ${o.id ?? o} ${o.title ? `— ${o.title}` : ""}`),
      );
    }
    if (dupes) {
      status = "fail";
      details.push(`${dupes[1]} duplicate case id(s) in test-cases/*.md: ${dupes[2]}`);
    }
    if (missingField) details.push(`note: ${missingField[1]} case(s) are missing a field (${missingField[2]}) — not a failure today`);
    const after = files.map(stable);
    const stale = files.filter((_, i) => before[i] !== after[i]).map((f) => `prototype/data/${f.split("/").pop()}`);
    if (stale.length) {
      status = "fail";
      details.push(
        `out of date: ${stale.join(" and ")} no longer match test-cases/*.md.`,
        "Fix: run `npm run cases:import` in prototype/ and commit the regenerated files.",
      );
    }
    return {
      status,
      summary:
        status === "pass"
          ? `catalog in step with the markdown — ${parsed ?? "?"} cases, ${journeys.journeys?.length ?? "?"} journeys, 0 orphans`
          : `catalog check failed (${[orphans.length ? `${orphans.length} orphan(s)` : "", stale.length ? "out of date" : "", dupes ? "duplicate ids" : ""].filter(Boolean).join(", ") || "see details"})`,
      details,
    };
  } finally {
    // A check leaves the working tree as it found it — unless asked to keep
    // the rebuild, or someone else rewrote the file meanwhile.
    if (!args.has("--fix")) {
      files.forEach((f, i) => {
        try {
          if (readFileSync(f, "utf8") === written[i]) copyFileSync(backups[i], f);
        } catch {
          /* leave it */
        }
      });
    }
  }
}

// ── 3. the runnable API case library ────────────────────────────────────────

async function checkCaseData(): Promise<CheckResult> {
  const dir = join(PROTO, "data", "api-cases-extra");
  const files = [
    { name: "data/api-cases.json", text: readFileSync(join(PROTO, "data", "api-cases.json"), "utf8") },
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => ({ name: `data/api-cases-extra/${f}`, text: readFileSync(join(dir, f), "utf8") })),
  ];
  const { FEATURES } = await import("../config/featureTree.js");
  const { errors, notes, count } = validateCases(files, knownPlaceholders(), new Set(FEATURES.map((f: { id: string }) => f.id)));
  if (errors.length)
    return { status: "fail", summary: `${errors.length} problem(s) in ${files.length} case file(s) (${count} cases)`, details: [...errors.slice(0, 60), ...(errors.length > 60 ? [`… and ${errors.length - 60} more`] : [])] };
  return { status: "pass", summary: `${count} cases in ${files.length} files — valid JSON, unique ids, known features and placeholders`, details: notes.length ? [`${notes.length} case(s) deliberately marked not runnable`] : [] };
}

// ── 4. migrations apply cleanly, twice, and each file is idempotent ─────────

async function checkMigrations(): Promise<CheckResult> {
  const dir = join(PROTO, "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const details: string[] = [];
  // Numbered, and no number used twice.
  const nums = files.map((f) => f.match(/^(\d{3})_[a-z0-9_]+\.sql$/)?.[1]);
  const badNames = files.filter((_, i) => !nums[i]);
  if (badNames.length) return { status: "fail", summary: `migration file name(s) not NNN_name.sql: ${badNames.join(", ")}` };
  const dupNums = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dupNums.length) return { status: "fail", summary: `two migrations share a number: ${[...new Set(dupNums)].join(", ")}` };

  let url = process.env.CI_SPINE_DB_URL?.trim();
  let scratch: string | undefined;
  let admin: pg.Client | undefined;
  if (!url) {
    // Locally: a scratch schema in spine.ai's own database.
    const { config } = await import("dotenv");
    config({ path: join(PROTO, ".env") });
    const base = process.env.SPINE_DB_URL?.trim();
    if (!base) return { status: "skip", summary: "no database to test migrations against (set CI_SPINE_DB_URL, or SPINE_DB_URL in prototype/.env)" };
    const touchesPublic = files.filter((f) => /\bpublic\s*\./i.test(readFileSync(join(dir, f), "utf8")));
    if (touchesPublic.length)
      return { status: "skip", summary: `not run locally: ${touchesPublic.join(", ")} names the public schema, so a scratch-schema test would touch the real tables (CI still runs it on a throwaway database)` };
    admin = new pg.Client({ connectionString: base, connectionTimeoutMillis: 4000 });
    try {
      await admin.connect();
    } catch (e) {
      return { status: "skip", summary: `spine.ai's database is not reachable (${(e as Error).message}) — migrations not tested here` };
    }
    scratch = `ci_scratch_${Date.now()}`;
    await admin.query(`CREATE SCHEMA ${scratch}`);
    const u = new URL(base);
    u.searchParams.set("options", `-c search_path=${scratch},public`);
    url = u.toString();
    details.push(`(locally: a scratch schema ${scratch}, dropped afterwards)`);
  }
  try {
    const env = { SPINE_DB_URL: url };
    const first = sh(TSX, ["scripts/db-migrate.ts"], PROTO, env);
    if (first.code !== 0) return { status: "fail", summary: "the first `npm run db:migrate` failed", details: tail(first.out) };
    const second = sh(TSX, ["scripts/db-migrate.ts"], PROTO, env);
    if (second.code !== 0) return { status: "fail", summary: "the second `npm run db:migrate` failed — the runner is not idempotent", details: tail(second.out) };
    if (!/up to date/i.test(second.out)) return { status: "fail", summary: "the second `npm run db:migrate` applied something again", details: tail(second.out) };
    // Each file must be idempotent on its own (IF NOT EXISTS …), not only
    // because the runner remembers it: replay every file inside a transaction
    // that is rolled back.
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
    await c.connect();
    const notIdempotent: string[] = [];
    try {
      const applied = (await c.query<{ version: string }>("select version from schema_migrations order by 1")).rows.map((r) => r.version);
      const missingRows = files.filter((f) => !applied.includes(f));
      if (missingRows.length) return { status: "fail", summary: `applied, but not recorded in schema_migrations: ${missingRows.join(", ")}` };
      for (const f of files) {
        await c.query("BEGIN");
        try {
          await c.query(readFileSync(join(dir, f), "utf8"));
        } catch (e) {
          notIdempotent.push(`${f}: ${(e as Error).message}`);
        } finally {
          await c.query("ROLLBACK").catch(() => {});
        }
      }
      const tables = (await c.query<{ n: string }>("select count(*) n from information_schema.tables where table_schema = current_schema()")).rows[0].n;
      details.push(`${files.length} migration(s) applied, re-run is a no-op, ${tables} table(s)/view(s) in the schema`);
    } finally {
      await c.end().catch(() => {});
    }
    if (notIdempotent.length)
      return { status: "fail", summary: `${notIdempotent.length} migration file(s) fail when run a second time — use IF NOT EXISTS / OR REPLACE`, details: notIdempotent };
    return { status: "pass", summary: `migrations ${files.join(", ")} apply cleanly, twice`, details };
  } finally {
    if (admin && scratch) {
      await admin.query(`DROP SCHEMA IF EXISTS ${scratch} CASCADE`).catch((e) => details.push(`could not drop ${scratch}: ${(e as Error).message}`));
      await admin.end().catch(() => {});
    }
  }
}

// ── 5. unit tests of the pure decision logic ────────────────────────────────

async function checkUnit(): Promise<CheckResult> {
  const r = sh(process.execPath, ["--import", "tsx", "--test", "--test-reporter=spec", "scripts/ci-unit-tests.ts"], PROTO, { SPINE_DB_URL: "" }, 180_000);
  const pass = r.out.match(/ℹ pass (\d+)/)?.[1];
  const fail = r.out.match(/ℹ fail (\d+)/)?.[1];
  if (r.code === 0) return { status: "pass", summary: `${pass ?? "?"} unit tests passed` };
  const failing = r.out.split("\n").filter((l) => /^\s*✖/.test(l));
  return { status: "fail", summary: `${fail ?? "some"} unit test(s) failed`, details: (failing.length ? failing : tail(r.out, 40)).slice(0, 40) };
}

// ── 6. the workflow file parses and uses no secrets ─────────────────────────

async function parseYaml(text: string): Promise<{ ok: boolean; doc?: any; via: string; error?: string }> {
  try {
    const mod: any = await import("yaml" as string);
    return { ok: true, doc: mod.parse(text), via: "yaml (npm)" };
  } catch (e) {
    if ((e as any)?.code !== "ERR_MODULE_NOT_FOUND" && !/Cannot find (module|package)/.test(String(e))) return { ok: false, via: "yaml (npm)", error: (e as Error).message };
  }
  const tmp = join(tmpdir(), `spine-ci-wf-${process.pid}.yml`);
  writeFileSync(tmp, text);
  const rb = sh("ruby", ["-ryaml", "-rjson", "-e", "puts JSON.generate(YAML.safe_load(File.read(ARGV[0]), aliases: true))", tmp], PROTO);
  if (!rb.error && rb.code === 0) return { ok: true, doc: JSON.parse(rb.out), via: "ruby" };
  if (!rb.error) return { ok: false, via: "ruby", error: tail(rb.out, 3).join(" ") };
  return { ok: false, via: "none", error: "no YAML parser available (npm yaml or ruby)" };
}

async function checkWorkflow(): Promise<CheckResult> {
  const dir = join(REPO, ".github", "workflows");
  if (!existsSync(dir)) return { status: "fail", summary: "no .github/workflows folder" };
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const details: string[] = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const y = await parseYaml(text);
    if (!y.ok) {
      if (y.via === "none") return { status: IN_CI ? "fail" : "skip", summary: y.error! };
      return { status: "fail", summary: `${f} is not valid YAML`, details: [y.error ?? ""] };
    }
    const doc = y.doc;
    // YAML 1.1 (ruby) reads the key `on` as the boolean true.
    const on = doc?.on ?? doc?.[true as any] ?? doc?.["true"];
    if (!doc?.jobs || typeof doc.jobs !== "object") return { status: "fail", summary: `${f}: no jobs` };
    if (!on) return { status: "fail", summary: `${f}: no triggers (on:)` };
    for (const [id, job] of Object.entries<any>(doc.jobs)) {
      if (!job["runs-on"]) return { status: "fail", summary: `${f}: job ${id} has no runs-on` };
      if (!Array.isArray(job.steps) || !job.steps.length) return { status: "fail", summary: `${f}: job ${id} has no steps` };
      for (const s of job.steps) if (!s.uses && !s.run) return { status: "fail", summary: `${f}: a step in ${id} has neither uses nor run` };
    }
    if (/\$\{\{\s*secrets\./.test(text)) return { status: "fail", summary: `${f} reads a repository secret — the offline checks must not need any` };
    details.push(`${f}: parsed with ${y.via}; triggers ${Object.keys(on).join(", ")}; jobs ${Object.keys(doc.jobs).join(", ")}`);
  }
  return { status: "pass", summary: `${files.length} workflow file(s) valid, no secrets used`, details };
}

// ── 7. nothing secret is tracked by git ─────────────────────────────────────

async function checkNoSecrets(): Promise<CheckResult> {
  const r = sh("git", ["ls-files", "-z"], REPO);
  if (r.code !== 0) return { status: "skip", summary: "not a git checkout" };
  const tracked = r.out.split("\0").filter(Boolean);
  const envFiles = tracked.filter((f) => /(^|\/)\.env(\.[^/]*)?$/.test(f) && !/\.env\.example$/.test(f));
  const problems: string[] = envFiles.map((f) => `${f} is tracked by git — it holds credentials`);
  const PATTERNS: Array<[RegExp, string]> = [
    [/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/, "a private key"],
    [/"access-token"\s*:\s*"[A-Za-z0-9+/=]{40,}"/, "a live access-token header"],
    [/\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/, "a GitHub token"],
    [/\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/, "an API key (sk-…)"],
    [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
    [/postgres(?:ql)?:\/\/[^:\s/@]+:(?!(?:password|pass|secret|changeme|postgres|x+|\*+|<[^>]*>|\$\{[^}]*\})@)[^@\s/]{3,}@(?!localhost|127\.0\.0\.1|postgres[:/]|host[:/])/, "a database URL with a password"],
  ];
  const skip = /(^|\/)(node_modules|procol-backend|procol-client-dashboard)\/|\.(png|jpe?g|gif|webp|pdf|xlsx|zip|ico|woff2?)$/i;
  let scanned = 0;
  for (const f of tracked) {
    if (skip.test(f)) continue;
    let text: string;
    try {
      text = readFileSync(join(REPO, f), "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    if (text.length > 8_000_000) continue;
    scanned++;
    for (const [re, what] of PATTERNS) if (re.test(text)) problems.push(`${f} appears to contain ${what}`);
  }
  if (problems.length) return { status: "fail", summary: `${problems.length} possible secret(s) in tracked files`, details: problems.slice(0, 30) };
  return { status: "pass", summary: `no .env file or credential-shaped text in ${scanned} tracked files` };
}

// ── the run ─────────────────────────────────────────────────────────────────

const CHECKS: CheckDef[] = [
  { name: "typecheck-prototype", what: "prototype/ compiles (tsc --noEmit)", run: typecheck(PROTO, "prototype") },
  { name: "typecheck-procol-test", what: "procol test/ compiles (tsc --noEmit)", run: typecheck(PROCOL_TEST, "procol test") },
  { name: "catalog", what: "npm run cases:import: 0 orphans, no duplicate ids, and the committed catalog JSON matches test-cases/*.md", run: checkCatalog },
  { name: "case-data", what: "data/api-cases.json + api-cases-extra/*.json: valid JSON, required fields, unique ids, expected ∈ accept|reject|no-5xx, known features and {{placeholders}}", run: checkCaseData },
  { name: "migrations", what: "db/migrations apply to an empty pgvector database, a second db:migrate is a no-op, every file is idempotent on its own", run: checkMigrations },
  { name: "unit", what: "node:test unit tests of the verdict logic (scripts/ci-unit-tests.ts)", run: checkUnit },
  { name: "workflow", what: ".github/workflows/*.yml parse, have jobs and steps, read no secrets", run: checkWorkflow },
  { name: "no-secrets", what: "no .env or credential-shaped text in any git-tracked file", run: checkNoSecrets },
];

if (args.has("--list")) {
  for (const c of CHECKS) console.log(`${c.name.padEnd(22)} ${c.what}`);
  process.exit(0);
}
const only = args.list("--only");
const skipList = args.list("--skip") ?? [];
const unknownNames = [...(only ?? []), ...skipList].filter((n) => !CHECKS.some((c) => c.name === n || c.name.startsWith(`${n}-`)));
if (unknownNames.length) {
  console.error(`unknown check(s): ${unknownNames.join(", ")} — see --list`);
  process.exit(2);
}
const pick = (c: CheckDef, names: string[]) => names.some((n) => c.name === n || c.name.startsWith(`${n}-`));
const selected = CHECKS.filter((c) => (!only || pick(c, only)) && !pick(c, skipList));

console.log(`spine.ai CI checks${IN_CI ? " (CI)" : " (local)"} — ${selected.map((c) => c.name).join(", ")}\n`);
const results: Array<{ name: string; ms: number } & CheckResult> = [];
for (const c of selected) {
  const t0 = Date.now();
  let r: CheckResult;
  try {
    r = await c.run();
  } catch (e) {
    r = { status: "fail", summary: `the check itself crashed: ${(e as Error).message}` };
  }
  if (r.status === "skip" && IN_CI) r = { ...r, status: "fail", summary: `could not run in CI: ${r.summary}` };
  const ms = Date.now() - t0;
  results.push({ name: c.name, ms, ...r });
  const mark = r.status === "pass" ? "✓ PASS" : r.status === "skip" ? "- SKIP" : "✗ FAIL";
  console.log(`${mark}  ${c.name.padEnd(22)} ${r.summary}  (${(ms / 1000).toFixed(1)} s)`);
  for (const d of r.details ?? []) console.log(`          ${d}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### ${mark} ${c.name}`, "", r.summary, ...(r.details?.length ? ["", "```", ...r.details, "```"] : []), ""];
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n", { flag: "a" });
    } catch {
      /* summary is a nicety */
    }
  }
}
const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skip");
console.log(
  `\n${failed.length ? "✗" : "✓"} ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped` +
    (failed.length ? ` — failing: ${failed.map((r) => r.name).join(", ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
