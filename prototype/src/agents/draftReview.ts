/**
 * REVIEWING AN ASSISTANT DRAFT — the step that turns "needs review" into a test.
 *
 * When someone types a test case nothing in the catalog covers, the assistant
 * writes it up, builds an automation (an API plan) for it, runs it once and
 * saves it as a DRAFT (drafts.ts). A draft is not a test yet: the AI wrote both
 * the case and its automation, so a person checks that the automation really
 * tests what the case says before it joins the regular runs.
 *
 *   approve → the case goes into the catalog (test-cases/api-assistant-approved.md,
 *             in the journey of the cases it overlaps), its plan is stored with
 *             the compiled plans (data/compiled-plans/api/<id>.json) after the same
 *             code checks every stored plan gets, and the catalog is re-imported.
 *             It then runs like any other case, without the AI.
 *   reject  → it stays out of the catalog, with the reviewer's reason.
 *
 * The plan counts as FULL coverage only when the code checks pass AND the
 * reviewer confirms it tests what the case says; otherwise it is stored as
 * partial with the reason, and the written case still joins the catalog.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spineDb } from "../db/spineDb.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..", "..");
const CASES_DIR = join(PROTO, "..", "test-cases");
export const APPROVED_FILE = join(CASES_DIR, "api-assistant-approved.md");

export interface ReviewInput {
  id: string;
  decision: "approve" | "reject";
  /** the reviewer checked that the automation tests what the case says */
  automationCovers?: boolean;
  note?: string;
  reviewer?: string;
}

export interface ReviewResult {
  ok: boolean;
  id: string;
  status?: "approved" | "rejected";
  /** plain-English outcome for the page */
  message: string;
  coverage?: "full" | "partial" | "none";
  gaps?: string[];
  group?: string;
  imported?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Journey groups a case can join: every group some journey already claims. */
function claimedGroups(): Set<string> {
  try {
    const j = JSON.parse(readFileSync(join(PROTO, "data", "journeys.json"), "utf8"));
    return new Set((j.journeys ?? []).flatMap((x: any) => [...(x.apiGroups ?? []), ...(x.uiGroups ?? [])]));
  } catch {
    return new Set();
  }
}

/** Where an approved draft lives: the journey group of the first catalog case it overlaps. */
export function groupFor(partialOf: string[], area: string, claimed = claimedGroups()): string | undefined {
  for (const id of partialOf) {
    const g = id.replace(/-\d+$/, "");
    if (/^(API|UI)-[A-Z]+$/.test(g) && claimed.has(g)) return g;
  }
  for (const g of [`API-X${area}`, `API-${area}`]) if (claimed.has(g)) return g;
  return undefined;
}

/** The case as the importer reads it (same fields as every catalog file). */
export function approvedMarkdown(d: any, group: string, coverage: string, reviewer: string, note: string): string {
  const steps = (d.steps ?? []).map((s: string, i: number) => `${i + 1}. ${oneLine(s).replace(/^\d+[.)]\s*/, "")}`).join(" ");
  return [
    `### ${d.id} — ${oneLine(d.title)}`,
    "",
    `- **Why it matters.** Typed in the assistant as “${oneLine(d.typed_text).slice(0, 200)}”; written up and automated by the assistant, approved by ${reviewer} on ${today()}${note ? ` (${oneLine(note)})` : ""}.`,
    `- **Setup.** ${oneLine(d.setup) || "A buyer signed in to the client under test."}`,
    `- **Steps.** ${steps}`,
    `- **Expected.** ${oneLine(d.expected)}`,
    `- **Oracle.** ${oneLine(d.oracle) || "The app's answer matches the expected result; a server error is always a defect."}`,
    `- **Trace.** P1 · automate · assistant · \`${group}\` · \`${d.id}\` · layer ${d.layer} · coverage ${coverage}${(d.partial_of ?? []).length ? ` · overlaps ${(d.partial_of as string[]).slice(0, 3).map((x) => `\`${x}\``).join(", ")}` : ""}`,
    "",
  ].join("\n");
}

function runImport(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--import", "tsx", "scripts/import-test-cases.ts"], { cwd: PROTO, stdio: "ignore" });
    const t = setTimeout(() => {
      p.kill();
      resolve(false);
    }, 120_000);
    p.on("exit", (code) => {
      clearTimeout(t);
      resolve(code === 0);
    });
    p.on("error", () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}

/** Store the reviewed plan beside the compiled plans, after the same code checks. */
async function storePlan(id: string, title: string, caseText: string, rawPlan: unknown, automationCovers: boolean) {
  const [{ validatePlan, planEndpoints, planInWords, PLAN_VERSION }, { COMPILED_API_DIR, storedPlanProblems, reloadStoredPlans }] = await Promise.all([
    import("./apiPlanner.js"),
    import("../checks/compiledPlans.js"),
  ]);
  const v = await validatePlan(rawPlan);
  if (!v.ok) return { coverage: "none" as const, gaps: v.errors };
  const problems = await storedPlanProblems(v.plan, caseText);
  const gaps = [...problems, ...(automationCovers ? [] : ["the reviewer did not confirm the automation tests everything the case says"])];
  const coverage: "full" | "partial" = gaps.length ? "partial" : "full";
  const plan = { ...v.plan, caseId: id, title };
  const endpoints = planEndpoints(plan).all;
  writeFileSync(
    join(COMPILED_API_DIR, `${id}.json`),
    JSON.stringify(
      {
        meta: {
          caseId: id, title, compiledAt: new Date().toISOString(), planVersion: PLAN_VERSION, source: "assistant-reviewed",
          coverage, gaps, warnings: v.warnings, validated: true, endpoints, words: planInWords(plan),
        },
        plan,
      },
      null,
      1,
    ),
  );
  const idxFile = join(COMPILED_API_DIR, "index.json");
  const idx = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, "utf8")) : { planVersion: PLAN_VERSION, cases: {} };
  idx.cases = { ...(idx.cases ?? {}), [id]: { coverage, title, source: "assistant-reviewed", why: gaps, endpoints, usd: 0, at: new Date().toISOString() } };
  writeFileSync(idxFile, JSON.stringify({ ...idx, updatedAt: new Date().toISOString() }, null, 1));
  reloadStoredPlans();
  return { coverage, gaps };
}

export async function reviewDraft(input: ReviewInput): Promise<ReviewResult> {
  const id = String(input.id ?? "").trim();
  if (!/^GEN-[A-Z]+-\d{3}$/.test(id)) return { ok: false, id, message: "That is not a draft id (GEN-AREA-NNN)." };
  if (input.decision !== "approve" && input.decision !== "reject") return { ok: false, id, message: "Choose approve or reject." };
  const db = await spineDb();
  if (!db) return { ok: false, id, message: "spine.ai's database is not reachable, so the draft cannot be reviewed right now." };
  const r = await db.query(`SELECT * FROM generated_cases WHERE id = $1`, [id]);
  const d = r.rows[0];
  if (!d) return { ok: false, id, message: `No draft ${id} was found.` };
  if (d.status !== "draft") return { ok: false, id, message: `${id} was already ${d.status}.` };
  const reviewer = oneLine(input.reviewer) || "the owner";
  const note = oneLine(input.note).slice(0, 500);

  if (input.decision === "reject") {
    if (!note) return { ok: false, id, message: "Say why it is rejected, so the next person knows." };
    await db.query(
      `UPDATE generated_cases SET status = 'rejected', reviewed_at = now(), reviewed_by = $2, review_note = $3, updated_at = now() WHERE id = $1`,
      [id, reviewer, note],
    );
    return { ok: true, id, status: "rejected", message: `${id} was rejected and stays out of the catalog.` };
  }

  const group = groupFor(d.partial_of ?? [], d.area);
  if (!group) return { ok: false, id, message: `${id} overlaps no case in a journey, so there is no journey to put it in yet.` };

  const rawPlan = d.api_case?.apiPlan;
  const caseText = `${d.title}. ${d.setup} ${(d.steps ?? []).join(" ")} Expected: ${d.expected}`;
  const stored = rawPlan
    ? await storePlan(id, d.title, caseText, rawPlan, input.automationCovers === true)
    : { coverage: "none" as const, gaps: ["the assistant built no API automation for it"] };

  if (existsSync(APPROVED_FILE) && readFileSync(APPROVED_FILE, "utf8").includes(`### ${id} `)) {
    return { ok: false, id, message: `${id} is already in the approved catalog file.` };
  }
  if (!existsSync(APPROVED_FILE)) {
    writeFileSync(
      APPROVED_FILE,
      "# Assistant cases, reviewed and approved\n\n" +
        "Each case below was typed in the spine.ai assistant, written up and automated by it, and then approved by a person\n" +
        "(src/agents/draftReview.ts). Its automation, when it has one, is stored in data/compiled-plans/api/<id>.json.\n\n" +
        "## 1. Approved assistant cases\n\n",
    );
  }
  appendFileSync(APPROVED_FILE, approvedMarkdown(d, group, stored.coverage, reviewer, note) + "\n");
  await db.query(
    `UPDATE generated_cases SET status = 'approved', reviewed_at = now(), reviewed_by = $2, review_note = $3,
            automation_confirmed = $4, catalog_file = $5, coverage = $6, gaps = $7, updated_at = now() WHERE id = $1`,
    [id, reviewer, note || null, input.automationCovers === true, APPROVED_FILE, stored.coverage === "none" ? d.coverage : stored.coverage, stored.gaps],
  );
  const imported = await runImport();
  try {
    (await import("../checks/testCatalog.js")).reloadCatalog();
  } catch {
    /* the page re-reads on the next start */
  }
  const runs = stored.coverage === "full";
  return {
    ok: true,
    id,
    status: "approved",
    coverage: stored.coverage,
    gaps: stored.gaps,
    group,
    imported,
    message:
      `${id} is now in the catalog (${group})` +
      (runs
        ? " and its automation runs with the other tests, without the AI."
        : stored.coverage === "partial"
          ? `; its automation is stored but not counted yet — ${stored.gaps.join("; ")}.`
          : `; it has no usable automation yet — ${stored.gaps.join("; ")}.`) +
      (imported ? "" : " The catalog could not be re-imported automatically: run `npm run cases:import`."),
  };
}
