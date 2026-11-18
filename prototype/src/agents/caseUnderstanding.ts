/**
 * UNDERSTAND A CASE BEFORE IT RUNS — prompts/test-case-runner.md, wired into the sheet runner.
 *
 * Every sheet case is read once against the runner prompt (its role, "understand the case", "how each check is
 * run", the verdict and safety rules) and, when the sheet came with one, the PRD. The answer:
 *   - splits the Expected Result into small checks, each with the PRD's own words where the PRD has them;
 *   - says whether the case agrees with the PRD, and how it differs when it does not (the PRD wins);
 *   - writes `judgeBy`: what must be true to pass, which the compilers read as the case's oracle;
 *   - names what the case needs that this run has no access to (another buyer's login, a mailbox, a phone),
 *     so it is reported Blocked up front instead of failing half-way.
 * The code under test never sets an expected result: the PRD does, then the case.
 *
 * Answers are cached in data/case-understanding.json by (prompt, case, PRD), so understanding a sheet before
 * the run and running it cost one model call per case, and a re-run costs none.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";
import { parseJsonObject } from "../hubspot/slingringFast.js";
import { prdExcerpt, type Prd } from "../checks/prdDocs.js";
import { sheetCaseProse, type SheetCase } from "../checks/sheetCases.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const PROMPT = join(ROOT, "prompts", "test-case-runner.md");
const CACHE = join(ROOT, "data", "case-understanding.json");

/** What a run may use. Anything else a case needs makes it Blocked. */
export const RUN_ACCESS = ["buyer_login", "vendor_login"] as const;
const NEEDS = ["buyer_login", "vendor_login", "another_buyer_login", "email_inbox", "phone_sms", "outside_system"] as const;
export type Need = (typeof NEEDS)[number];

export interface CaseUnderstanding {
  goal: string;
  kind: string[];
  checks: Array<{ n: number; what: string; prd: string | null }>;
  /** agrees: the case says what the PRD says · differs: they disagree (the PRD wins) · silent: the PRD does not cover it · none: no PRD */
  prd: "agrees" | "differs" | "silent" | "none";
  difference: string | null;
  /** what must be true for a Pass, in plain words, with the PRD's exact texts in quotes */
  judgeBy: string;
  needs: Need[];
  /** set when the case needs access this run does not have */
  blocked: string | null;
}

// The parts of the runner prompt that decide how a case is read; the rest (output files, sheet mode,
// future scope) is the platform's job, not the model's.
const SECTIONS = [/^## 1\. /, /^## 3\. /, /^## 5\. /, /^## 8\. /, /^## 10\. /];
function runnerPrompt(): string {
  const md = readFileSync(PROMPT, "utf8");
  const parts = md.split(/\n(?=## \d+\. )/);
  return parts.filter((p) => SECTIONS.some((re) => re.test(p))).join("\n\n");
}

const CONTRACT = `Answer with ONE JSON object and nothing else:
{
  "goal": "what the case wants to prove, one sentence",
  "kind": ["ui" | "api" | "visibility" | "permission" | "notification" | "cross-user" | "config" | "data-integrity" | "regression" | "setup"],
  "checks": [{ "n": 1, "what": "one fact that is true or false on screen / in the reply / in what is saved", "prd": "the PRD's exact words this check comes from, or null" }],
  "prd": "agrees" | "differs" | "silent" | "none",
  "difference": "when prd = differs: 'The case expects …, the PRD says …' — else null",
  "judgeBy": "what must be true for this case to PASS, in plain words. Exact messages, labels and notification texts in quotes, copied from the PRD when it has them. Where the case and the PRD differ, the PRD's version.",
  "needs": ["buyer_login" | "vendor_login" | "another_buyer_login" | "email_inbox" | "phone_sms" | "outside_system"],
  "blocked": "one sentence when it needs something this run cannot use, else null"
}
Rules for this answer:
- "prd" is "none" when no PRD is given. Never use the code to decide what is right; there is no code here on purpose.
- "another_buyer_login" only when a check must be SEEN by a different buyer-side person than the one running it (their bell, their inbox, their approvals page). Doing an action that affects another user does not need their login.
- This run can use: ${RUN_ACCESS.join(", ")}. If "needs" has anything else, "blocked" says what and why, in one sentence, and how a person could finish it (e.g. "log in as the assignee and check the bell shows '…'").
- Keep every string short and plain.`;

type Cache = Record<string, CaseUnderstanding>;
let cache: Cache | null = null;
function readCache(): Cache {
  if (cache) return cache;
  try {
    cache = existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, "utf8")) as Cache) : {};
  } catch {
    cache = {};
  }
  return cache;
}
function writeCache(): void {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache ?? {}, null, 1));
}

function keyOf(c: SheetCase, prd: Prd | null, prompt: string): string {
  return createHash("sha1").update(prompt).update("\0").update(sheetCaseProse(c)).update("\0").update(prd ? prd.text : "").digest("hex").slice(0, 20);
}

function clean(raw: any, hasPrd: boolean): CaseUnderstanding | null {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.checks)) return null;
  const needs = (Array.isArray(raw.needs) ? raw.needs : []).map(String).filter((n: string): n is Need => (NEEDS as readonly string[]).includes(n));
  const missing = needs.filter((n: Need) => !(RUN_ACCESS as readonly string[]).includes(n));
  const prd = hasPrd ? (["agrees", "differs", "silent"].includes(raw.prd) ? raw.prd : "silent") : "none";
  return {
    goal: String(raw.goal ?? "").slice(0, 300),
    kind: (Array.isArray(raw.kind) ? raw.kind : []).map(String).slice(0, 6),
    checks: raw.checks.slice(0, 12).map((k: any, i: number) => ({ n: Number(k?.n) || i + 1, what: String(k?.what ?? "").slice(0, 300), prd: k?.prd ? String(k.prd).slice(0, 400) : null })).filter((k: { what: string }) => k.what),
    prd,
    difference: prd === "differs" && raw.difference ? String(raw.difference).slice(0, 500) : null,
    judgeBy: String(raw.judgeBy ?? "").slice(0, 1200),
    needs,
    // only a need the run really lacks may block a case; a model that blocks without one is ignored
    blocked: missing.length ? String(raw.blocked || `It needs ${missing.join(", ").replace(/_/g, " ")}, which this run cannot use.`).slice(0, 400) : null,
  };
}

/** The cached understanding of a case, if it was read before. */
export function cachedUnderstanding(c: SheetCase, prd: Prd | null): CaseUnderstanding | null {
  return readCache()[keyOf(c, prd, runnerPrompt())] ?? null;
}

/**
 * Read one case against the runner prompt and the PRD. Null when no model could answer (the runner then
 * runs the case exactly as written, as it did before this step existed).
 */
export async function understandCase(c: SheetCase, prd: Prd | null): Promise<CaseUnderstanding | null> {
  const prompt = runnerPrompt();
  const key = keyOf(c, prd, prompt);
  const hit = readCache()[key];
  if (hit) return hit;
  const prose = sheetCaseProse(c);
  const user = [
    "RUN CONTEXT",
    `This run is signed in as one buyer user (the person running the sheet) and can open the vendor portal as a QA test vendor. No other logins, no mailbox, no phone.`,
    "",
    prd ? `THE PRD ("${prd.name}") — the source of truth for what the product should do:\n${prdExcerpt(prd, prose)}` : "NO PRD was given for this sheet: judge by the case's own Expected Result.",
    "",
    `THE CASE\n${prose}`,
  ].join("\n");
  let raw = "";
  try {
    raw = await chat([{ role: "system", content: `${prompt}\n\n---\n\n${CONTRACT}` }, { role: "user", content: user }], { tier: "fast", temperature: 0.1, maxTokens: 1400, timeoutMs: 45_000 });
  } catch {
    return null;
  }
  const u = clean(parseJsonObject(raw), !!prd);
  if (!u) return null;
  readCache()[key] = u;
  writeCache();
  return u;
}

/** The oracle line the compilers read after the case's own Expected Result. */
export function oracleText(u: CaseUnderstanding): string {
  const lines = [`Judge it by this (from the ${u.prd === "none" ? "case" : "PRD and the case"}): ${u.judgeBy}`];
  const fromPrd = u.checks.filter((k) => k.prd);
  if (fromPrd.length) lines.push(`Exact words the PRD gives: ${fromPrd.map((k) => `“${k.prd}”`).join("; ")}`);
  if (u.difference) lines.push(`Where the case and the PRD differ, the PRD is right: ${u.difference}`);
  return lines.join("\n");
}
