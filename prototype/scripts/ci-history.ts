/**
 * "What changed since last time" for a set of runs — read from spine.ai's
 * database (runs / results / case_track_record), or, when the database is
 * down, from the run files in data/runs. Shared by nightly.ts and
 * backend-watch.ts; the comparison rules themselves live (pure, tested) in
 * ci-lib.ts.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resultRows } from "../src/db/runHistory.js";
import { spineDb } from "../src/db/spineDb.js";
import type { RunRecord } from "../src/runStore.js";
import { CLIENT_NAMES, compareResults, oneLine, PROTO, resultKey, tally, type Compared, type ResultLike } from "./ci-lib.js";

const RUNS_DIR = join(PROTO, "data", "runs");
const DECISIVE = ["pass", "worked", "fail", "broken", "refused"];

export interface RunRow extends ResultLike {
  run_id: string;
  created_at: string;
}

/** Every verdict of one saved run, from its file (the source of truth). */
export function readRunRows(runId: string): RunRow[] {
  const f = join(RUNS_DIR, `${runId.replace(/[^0-9a-zA-Z_-]/g, "")}.json`);
  if (!existsSync(f)) return [];
  const rec = JSON.parse(readFileSync(f, "utf8")) as RunRecord;
  return resultRows(rec).map((r) => ({ ...r, company_id: rec.companyId ?? null, run_id: rec.id, created_at: rec.ts }));
}

export interface Previous {
  map: Map<string, { verdict: string; at?: string; run_id?: string }>;
  source: "database" | "run files";
  /** per case (company|kind|case_id): the whole track record, database only */
  track: Map<string, { runs: number; passed: number; failed: number; flaky: boolean }>;
}

const trackKey = (r: Pick<ResultLike, "company_id" | "kind" | "case_id">) => `${r.company_id ?? ""}|${r.kind}|${r.case_id}`;

/**
 * For each of tonight's checks, its most recent DECISIVE result before
 * `before` — a "couldn't tell" last time says nothing about whether it worked,
 * so the comparison reaches past it to the last real verdict.
 */
export async function previousResults(rows: RunRow[], before: Date, excludeRuns: string[]): Promise<Previous> {
  const track: Previous["track"] = new Map();
  const map: Previous["map"] = new Map();
  const companies = [...new Set(rows.map((r) => r.company_id).filter((c): c is number => c !== null))];
  const ids = [...new Set(rows.map((r) => r.case_id))];
  try {
    const db = await spineDb();
    if (db && ids.length) {
      const prev = await db.query(
        `SELECT DISTINCT ON (company_id, kind, case_id, CASE WHEN kind = 'journey-step' THEN coalesce(feature, '') ELSE '' END)
                company_id, kind, case_id, feature, verdict, created_at, run_id
           FROM results
          WHERE created_at < $1 AND company_id = ANY($2) AND case_id = ANY($3) AND NOT (run_id = ANY($4)) AND verdict = ANY($5)
          ORDER BY company_id, kind, case_id, CASE WHEN kind = 'journey-step' THEN coalesce(feature, '') ELSE '' END, created_at DESC`,
        [before.toISOString(), companies, ids, excludeRuns, DECISIVE],
      );
      for (const r of prev.rows) map.set(resultKey(r), { verdict: r.verdict, at: new Date(r.created_at).toISOString(), run_id: r.run_id });
      const tr = await db.query(
        `SELECT company_id, kind, case_id, runs, passed, failed, flaky FROM case_track_record WHERE company_id = ANY($1) AND case_id = ANY($2)`,
        [companies, ids],
      );
      for (const r of tr.rows) track.set(trackKey(r), { runs: Number(r.runs), passed: Number(r.passed), failed: Number(r.failed), flaky: !!r.flaky });
      return { map, source: "database", track };
    }
  } catch (e) {
    console.warn(`[nightly] database comparison failed (${(e as Error).message}) — using the run files`);
  }
  // Fallback: walk earlier run files, newest first, until every check has a previous verdict.
  const wanted = new Set(rows.map(resultKey));
  const files = existsSync(RUNS_DIR)
    ? readdirSync(RUNS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5))
        .filter((id) => !excludeRuns.includes(id))
        .sort()
        .reverse()
    : [];
  for (const id of files.slice(0, 400)) {
    if (!wanted.size) break;
    let rs: RunRow[];
    try {
      rs = readRunRows(id);
    } catch {
      continue;
    }
    if (!rs.length || new Date(rs[0].created_at) >= before) continue;
    for (const r of rs) {
      const k = resultKey(r);
      if (wanted.has(k) && DECISIVE.includes(r.verdict)) {
        map.set(k, { verdict: r.verdict, at: r.created_at, run_id: r.run_id });
        wanted.delete(k);
      }
    }
  }
  return { map, source: "run files", track };
}

export async function compareRuns(runIds: string[], before: Date) {
  const rows = runIds.flatMap(readRunRows);
  const prev = await previousResults(rows, before, runIds);
  const compared = compareResults(rows, prev.map);
  return { rows, compared, prev, counts: tally(compared) };
}

// ── words ───────────────────────────────────────────────────────────────────

/**
 * A case title as a person would say it. Library titles are identifiers
 * ("QA_Platform_publish_with_empty_audience_invites_nobody"); the dashboard's
 * own wording module (src/checks/caseDisplay.ts) turns them into sentences.
 * It is loaded by a computed path so this script still works — and still
 * type-checks — on a checkout that does not have it; then a plain fallback
 * (prefix dropped, underscores to spaces) is used.
 */
let titleFn: ((t: string) => string) | undefined;
export async function loadTitleWords(): Promise<void> {
  const mod = ["..", "src", "checks", "caseDisplay.js"].join("/");
  try {
    const m: any = await import(mod);
    if (typeof m.titleFromIdentifier === "function") titleFn = m.titleFromIdentifier;
  } catch {
    titleFn = undefined;
  }
}
export function humanTitle(t: string | null | undefined): string {
  const raw = (t ?? "").trim();
  if (!raw) return "an untitled check";
  if (!/^(QA_Platform_|API_Test_)|^[a-z0-9]+(_[a-z0-9]+){2,}$/i.test(raw)) return raw;
  try {
    if (titleFn) return titleFn(raw);
  } catch {
    /* fall through */
  }
  const s = raw.replace(/^(QA_Platform_|API_Test_)/i, "").replace(/_+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const KIND_WORD: Record<string, string> = { "journey-step": "Journey step", case: "Test case", "field-check": "Response check" };
const VERDICT_WORD: Record<string, string> = {
  pass: "passed",
  worked: "worked",
  fail: "failed",
  broken: "broke",
  refused: "was refused",
  inconclusive: "could not be judged",
  "not-run": "did not run",
};
const EVENT_WORD: Record<string, string> = { rfq_only: "RFQ only", rfp_only: "Technical (RFP) only", rfp_rfq: "Technical + RFQ", rfp_auction: "Technical + auction" };

export const clientName = (c: number | null | undefined) => (c ? (CLIENT_NAMES[c] ?? `client ${c}`) : "an unknown client");

export function day(iso?: string): string {
  if (!iso) return "earlier";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** One line a QA engineer would write: what, where, before → now, why. */
export function describe(c: Compared<RunRow>, track?: Previous["track"]): string {
  const r = c.row;
  const what = oneLine(humanTitle(r.title), 140);
  const where = [clientName(r.company_id), r.kind === "journey-step" && r.feature ? EVENT_WORD[r.feature] ?? "" : ""].filter(Boolean).join(", ");
  const before = c.previous ? `${VERDICT_WORD[c.previous.verdict] ?? c.previous.verdict} on ${day(c.previous.at)}` : "never checked before";
  const now = VERDICT_WORD[r.verdict] ?? r.verdict;
  const why = r.reason && r.verdict !== "pass" && r.verdict !== "worked" ? ` — “${oneLine(humanReason(r.reason), 200)}”` : "";
  const t = track?.get(`${r.company_id ?? ""}|${r.kind}|${r.case_id}`);
  const flaky = t && t.flaky && c.change === "newly-broken" ? ` (it has gone both ways before: failed ${t.failed} of ${t.runs} runs — may be flaky)` : "";
  return `**${KIND_WORD[r.kind] ?? "Check"}: ${what}** (${where}) — ${before}, ${now} tonight${why}${flaky}`;
}

/** Strip the machine parts (HTTP codes in brackets, JSON) out of a reason for the main text. */
function humanReason(s: string): string {
  return s
    .replace(/server error \d{3} — a 5xx is always a defect/i, "the server crashed — a crash is always a defect")
    .replace(/^ACCEPTED input that should have been rejected/, "accepted something it should have refused")
    .replace(/^REJECTED a valid input/, "refused a valid request")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s*\(HTTP [^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The ids behind a line, for the collapsible Details section. */
export function detailLine(c: Compared<RunRow>): string {
  const r = c.row;
  return `- ${r.kind} \`${r.case_id}\`${r.feature ? ` feature \`${r.feature}\`` : ""} company ${r.company_id} · tonight run \`${r.run_id}\` = ${r.verdict}` +
    (c.previous ? ` · previous run \`${c.previous.run_id ?? "?"}\` = ${c.previous.verdict}` : "");
}

/** The change sections of a report, most important first. Field checks are summarised, not listed one by one. */
export function changeSections(compared: Compared<RunRow>[], track: Previous["track"], opts: { cap?: number } = {}): { md: string[]; details: string[] } {
  const cap = opts.cap ?? 25;
  const md: string[] = [];
  const details: string[] = [];
  const pick = (ch: Compared["change"], kinds: string[]) => compared.filter((c) => c.change === ch && kinds.includes(c.row.kind));
  const section = (title: string, intro: string, list: Compared<RunRow>[], collapsed = false) => {
    if (!list.length) return;
    const lines = list.slice(0, cap).map((c) => `- ${describe(c, track)}`);
    if (list.length > cap) lines.push(`- … and ${list.length - cap} more (listed in Details)`);
    if (collapsed) md.push(`<details><summary><b>${title}</b> (${list.length})</summary>`, "", intro, "", ...lines, "", "</details>", "");
    else md.push(`## ${title} (${list.length})`, "", intro, "", ...lines, "");
    details.push(`### ${title}`, ...list.map(detailLine), "");
  };
  const main = ["journey-step", "case"];
  section("Broke since last time", "Worked the last time it was checked, and does not work tonight. Look at these first.", pick("newly-broken", main));
  section("Response checks that broke since last time", "A field in a reply that used to come back right and tonight did not.", pick("newly-broken", ["field-check"]));
  section("Fixed since last time", "Failed the last time it was checked, and works tonight.", [...pick("fixed", main), ...pick("fixed", ["field-check"])]);
  section("Broken, and this is the first result we have for it", "No earlier verdict to compare with — new cases, or ones that never ran before.", [...pick("broken-first-time", main), ...pick("broken-first-time", ["field-check"])]);
  section("Still broken (already known)", "Failed last time too. Nothing new — listed so they are not forgotten.", [...pick("still-broken", main), ...pick("still-broken", ["field-check"])], true);
  const unclear = compared.filter((c) => c.change === "unclear");
  if (unclear.length) {
    const reasons = new Map<string, number>();
    for (const c of unclear) {
      const k = oneLine(humanReason(c.row.reason ?? (c.row.verdict === "not-run" ? "a step it depended on did not complete" : "no reason recorded")), 120);
      reasons.set(k, (reasons.get(k) ?? 0) + 1);
    }
    md.push(
      `<details><summary><b>Could not be judged</b> (${unclear.length}) — never counted as a pass</summary>`,
      "",
      ...[...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `- ${n} × ${k}`),
      "",
      "</details>",
      "",
    );
  }
  return { md, details };
}
