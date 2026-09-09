/**
 * PR-READER — understand a Procol PR from LOCAL git and turn it into a test plan.
 *
 * 100% READ-ONLY: only `git log/show` with explicit hashes. It never checks out,
 * pulls, fetches, or writes anything to the Procol repos — the PR and live code
 * are never touched.
 *
 * Given a PR number, it finds the merge commit in local history, extracts the
 * diff of the meaningful files, and (with the LLM) explains what changed and
 * generates detailed test cases grounded ONLY in that diff.
 */
import { execFileSync } from "node:child_process";
import { chat, llmMode } from "../ai/llm.js";
import type { TestCase, TestType } from "../ai/types.js";

const REPOS: Record<string, string> = {
  backend: "/Users/animesh/Desktop/procol/procol-backend",
  frontend: "/Users/animesh/Desktop/procol/procol-client-dashboard",
};

function git(repo: string, args: string[]): string {
  // execFile (not a shell) with fixed args → no injection, no shell side effects.
  return execFileSync("git", ["-C", REPOS[repo], ...args], { encoding: "utf8", maxBuffer: 48 * 1024 * 1024 });
}

export interface PrFile {
  path: string;
  added: number;
  removed: number;
}
export interface PrInfo {
  repo: string;
  number: string;
  hash: string;
  subject: string;
  files: PrFile[];
  diff: string;
}

const NOISE = /package-lock|yarn\.lock|Gemfile\.lock|\.rubocop|\.snap$|\.svg$|\.png$|\.lock$/i;

export function findPrHash(repo: string, num: string): string | null {
  try {
    const h = git(repo, ["log", "--grep", `#${num}\\b`, "-1", "--format=%H"]).trim();
    return h || null;
  } catch {
    return null;
  }
}

/** Read a merged PR's metadata + focused diff from local git (read-only). */
export function readPr(repo: string, num: string): PrInfo {
  if (!(repo in REPOS)) throw new Error(`unknown repo "${repo}" — use "backend" or "frontend"`);
  const hash = findPrHash(repo, num);
  if (!hash) {
    throw new Error(
      `PR #${num} not found in the local ${repo} history — it may be on a different branch or not merged into the checked-out branch.`,
    );
  }
  const subject = git(repo, ["show", "-s", "--format=%s", hash]).trim();
  const numstat = git(repo, ["show", "--numstat", "--format=", hash]).trim().split("\n").filter(Boolean);
  const files: PrFile[] = numstat.map((l) => {
    const [a, r, p] = l.split("\t");
    return { path: p ?? l, added: Number(a) || 0, removed: Number(r) || 0 };
  });

  // Diff of the meaningful files only (skip lock/snapshot noise), biggest first,
  // truncated so it fits the model's context.
  const important = files
    .filter((f) => f.path && !NOISE.test(f.path))
    .sort((a, b) => b.added + b.removed - (a.added + a.removed))
    .slice(0, 12);
  let diff = "";
  for (const f of important) {
    const d = git(repo, ["show", "--format=", "--unified=3", hash, "--", f.path]);
    diff += `\n\n=== ${f.path} ===\n${d}`;
    if (diff.length > 24000) {
      diff = diff.slice(0, 24000) + "\n…(diff truncated)";
      break;
    }
  }
  return { repo, number: num, hash, subject, files, diff };
}

export interface PrAnalysis {
  feature: string;
  summary: string;
  endpoints: { method: string; path: string; note: string }[];
  configFlags: string[];
  affectedFlows: string[];
  testCases: TestCase[];
  provider: string;
}

const CASE_TYPES: TestType[] = ["functional", "data-validation", "edge", "non-functional"];

/** Ask the LLM to explain the PR and generate a grounded test plan. */
export async function analyzePr(pr: PrInfo): Promise<PrAnalysis> {
  const flagsFromDiff = [...new Set([...pr.diff.matchAll(/([a-z][a-z0-9_]{6,})(?:_enabled|_config)/gi)].map((m) => m[0]))].slice(0, 8);

  if (llmMode() === "fallback") {
    return {
      feature: pr.subject,
      summary: "Set GROQ_API_KEY to enable the AI analysis. Files changed are listed below.",
      endpoints: [],
      configFlags: flagsFromDiff,
      affectedFlows: [],
      testCases: [],
      provider: "fallback",
    };
  }

  const system =
    "You are a senior QA engineer at Procol, a B2B procurement platform (Rails backend + React frontend). " +
    "You are handed a MERGED pull request's diff. Explain what it changes and produce a detailed, grounded test plan. " +
    "Ground EVERYTHING only in the diff provided — never invent endpoints, tables, or fields that are not in it. Return STRICT JSON only.";
  const schema =
    '{"feature":"short feature name","summary":"3-4 sentences: what changed and the user-facing effect","endpoints":[{"method":"POST","path":"/api/...","note":"what it does"}],"configFlags":["gating flag names"],"affectedFlows":["which existing areas to regression-test, plain words"],"testCases":[{"type":"functional|data-validation|edge|non-functional","category":"e.g. Functional, Validation or Negative, Security","module":"string","component":"string","role":"Buyer|Vendor|Evaluator|Admin","scenario":"short title","preconditions":"string","steps":["1. ...","2. ..."],"testData":"Positive: … | Negative: …","expectedResult":"precise, incl. status code / DB effect / isolation rule","priority":"P0|P1|P2","severity":"Critical|High|Medium"}]}';
  const user =
    `PR: ${pr.subject}\nRepo: ${pr.repo} · commit ${pr.hash.slice(0, 10)}\n\nFILES CHANGED:\n${pr.files
      .map((f) => `  ${f.path} (+${f.added}/-${f.removed})`)
      .join("\n")}\n\nDIFF (focused):\n${pr.diff}\n\n` +
    `TASK: Write 6–10 detailed test cases for what THIS PR changed. Cover functional (happy path), data-validation (mandatory fields, formats, uniqueness), edge cases, and — critically for any per-entity/multi-tenant change — SECURITY / data-isolation (one entity must not see another entity's data). Use concrete values. SCHEMA: ${schema}\nReturn ONLY the JSON object.`;

  const raw = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.4, maxTokens: 4500 },
  );

  const obj = extractJsonObject(raw) ?? {};
  const testCases: TestCase[] = (Array.isArray(obj.testCases) ? obj.testCases : [])
    .map((o: any, i: number) => normalizeCase(o, i + 1))
    .filter(Boolean) as TestCase[];

  return {
    feature: String(obj.feature ?? pr.subject),
    summary: String(obj.summary ?? ""),
    endpoints: Array.isArray(obj.endpoints) ? obj.endpoints.slice(0, 12) : [],
    configFlags: Array.isArray(obj.configFlags) && obj.configFlags.length ? obj.configFlags : flagsFromDiff,
    affectedFlows: Array.isArray(obj.affectedFlows) ? obj.affectedFlows.slice(0, 10) : [],
    testCases,
    provider: "groq",
  };
}

function normalizeCase(o: any, n: number): TestCase | null {
  if (!o || typeof o !== "object" || !o.scenario) return null;
  const type: TestType = CASE_TYPES.includes(o.type) ? o.type : "functional";
  const steps = Array.isArray(o.steps) ? o.steps.map(String) : o.steps ? [String(o.steps)] : [];
  return {
    id: `TC-PR-${String(n).padStart(2, "0")}`,
    type,
    category: String(o.category ?? type),
    module: String(o.module ?? "Multi-entity"),
    component: o.component ? String(o.component) : undefined,
    role: ["Buyer", "Vendor", "Evaluator", "Admin"].includes(o.role) ? o.role : "Buyer",
    scenario: String(o.scenario),
    preconditions: String(o.preconditions ?? "—"),
    steps,
    testData: String(o.testData ?? "—"),
    expectedResult: String(o.expectedResult ?? "—"),
    priority: ["P0", "P1", "P2"].includes(o.priority) ? o.priority : "P1",
    severity: ["Critical", "High", "Medium"].includes(o.severity) ? o.severity : "High",
  };
}

function extractJsonObject(raw: string): any | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b < 0) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}
