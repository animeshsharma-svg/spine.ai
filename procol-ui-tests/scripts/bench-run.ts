import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPlan, type PlanResult } from "../src/plan/runPlan.js";
import { validatePlan } from "../src/plan/steps.js";
import { visibleText } from "../src/plan/generic/find.js";

/**
 * QA AGENT BENCH — phase 2: run each compiled plan and score it.
 *
 * Two verdicts are kept apart on purpose:
 *   - the AGENT's: did spine's plan pass, fail, or refuse to compile;
 *   - the BENCH's: what the page (or the saved file) shows, read here by a
 *     scorer that never consults the agent, as the bench judges — except
 *     where the bench grades what the agent REPORTS (must-refuse, H-11, H-13).
 *
 *   APP_URL=https://qa-agents-bench.com npx tsx scripts/bench-run.ts <bench.json> <run dir> [id,id,…]
 *
 * APP_URL is what go_to{screen:"path"} navigates under.
 */
const [benchPath, runDir, only] = process.argv.slice(2);
if (!benchPath || !runDir) throw new Error("usage: bench-run.ts <bench.json> <run dir> [id,id,…]");
if (!process.env.APP_URL) throw new Error("set APP_URL to the bench's base URL");
// The bench's sites must never teach labels the compiler then believes are Procol's.
process.env.UI_LABELS_NO_LEARN = "1";

interface Challenge {
  id: string;
  category: string;
  expected: "pass" | "refuse" | "known gap";
  task: string;
  passWhen: string;
}

interface Compiled {
  id: string;
  plan: { title: string; steps: Array<{ step: string; args?: Record<string, unknown> }> };
  coverage: "full" | "partial" | "none";
  gaps: string[];
  reasoning: string;
}

/** What the scorer can see once the plan has run. */
interface Seen {
  /** Visible text of every page the run opened, the first one first. */
  pages: Array<{ url: string; text: string }>;
  /** Saved downloads by file name. */
  files: Map<string, Buffer>;
  agent: "pass" | "fail" | "refused";
  plan: Compiled["plan"];
}

const CAP_MS = Number(process.env.BENCH_CAP_MS) || 180_000;
const bench = JSON.parse(readFileSync(benchPath, "utf8")) as { challenges: Challenge[] };
const wanted = only ? new Set(only.split(",")) : null;
const plansDir = join(runDir, "plans");
const resultsDir = join(runDir, "results");
mkdirSync(resultsDir, { recursive: true });

// What a person reads: no soft hyphens or zero-width characters, single spaces.
const ws = (s: string) => visibleText(s);
const has = (hay: string, needle: string) => ws(hay).includes(ws(needle));

/** The last thing the task asks to see — the success text. */
function lastVerify(task: string): string | null {
  const lines = task.split("\n").filter((l) => /verify/i.test(l));
  const m = lines.at(-1)?.match(/["'“‘](.+?)["'”’]\s+is visible/);
  return m ? m[1] : null;
}

const mainText = (s: Seen) => s.pages[0]?.text ?? "";
/** The result line may be on a tab the run opened. */
const anyText = (s: Seen) => s.pages.map((p) => p.text).join(" ");

/** Everything a person can read on the page — every frame, shadow DOM included (innerText stops at a shadow root). */
async function pageText(p: Page): Promise<string> {
  const parts: string[] = [];
  for (const f of p.frames()) parts.push(await frameText(f));
  return parts.join(" ");
}

async function frameText(p: import("@playwright/test").Frame): Promise<string> {
  return p
    .evaluate(() => {
      // No inner functions: the bundler would name them with a helper the page lacks.
      const out: string[] = [];
      const stack: Node[] = [document.body];
      while (stack.length) {
        const root = stack.pop()!;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let n: Node | null = tw.currentNode; n; n = tw.nextNode()) {
          if (n.nodeType === Node.TEXT_NODE) {
            const el = n.parentElement;
            if (el && el.closest("script, style, noscript, template") === null) {
              const cs = getComputedStyle(el);
              if (cs.display !== "none" && cs.visibility !== "hidden" && !el.closest("[hidden]")) out.push(n.textContent ?? "");
            }
          } else if ((n as Element).shadowRoot) stack.push((n as Element).shadowRoot!);
        }
      }
      return out.join(" ");
    })
    .catch(() => "");
}
const fileHas = (s: Seen, name: string, needle: string) => !!s.files.get(name)?.toString("utf8").includes(needle);

/** Challenges the generic rules cannot judge. Each returns why it failed, or null. */
const CUSTOM: Record<string, (s: Seen) => string | null> = {
  "F-01": (s) => (fileHas(s, "orders.csv", "4412,Rossi,Paid,129.00") ? null : "orders.csv missing the line"),
  "F-02": (s) => (fileHas(s, "orders-2026-10.csv", "4412,Rossi,Paid,129") ? null : "orders-2026-10.csv not saved with the line"),
  "F-03": (s) => (fileHas(s, "report-last-30-days.csv", "range,last-30-days") && fileHas(s, "report-last-30-days.csv", "orders,128") ? null : "report-last-30-days.csv wrong or missing"),
  "F-04": (s) => {
    const f = s.files.get("invoice-2026-11.pdf");
    if (!f) return "invoice-2026-11.pdf not saved";
    return f.subarray(0, 4).toString() === "%PDF" ? null : "the saved file is not a PDF";
  },
  "F-05": (s) => (["orders-q1.csv", "orders-q2.csv", "orders-q3.csv"].every((n) => s.files.has(n)) && fileHas(s, "orders-q2.csv", "Q2,2900.00") ? null : "the three quarterly files were not all saved"),
  "F-06": (s) => {
    const tab = s.pages.slice(1).find((p) => p.url.includes("/files/price-list.txt"));
    if (!tab || !has(tab.text, "Pro plan: 29 EUR")) return "no new tab showing the price list";
    return has(mainText(s), "Saved price-list.txt") ? "the price list was downloaded instead of opened" : null;
  },
  "F-10": (s) => {
    const f = s.files.get("orders-paid.csv")?.toString("utf8");
    if (!f) return "orders-paid.csv not saved";
    const rows = f.trim().split(/\r?\n/).slice(1);
    return rows.length === 15 && rows.every((r) => /,Paid(,|$)/.test(r)) ? null : `orders-paid.csv has ${rows.length} rows or a non-Paid row`;
  },
  "F-11": (s) => {
    try {
      return JSON.parse(s.files.get("orders.json")?.toString("utf8") ?? "").orders?.[2]?.status === "refunded" ? null : "orders[2].status is not refunded";
    } catch {
      return "orders.json missing or not JSON";
    }
  },
  "F-12": (s) =>
    fileHas(s, "app-2026-10-09.log", "ERROR payment: card declined for order 4471") && !fileHas(s, "app-2026-10-09.log", "cache: miss key=user:42")
      ? null
      : "app-2026-10-09.log wrong or missing",
  "H-14": (s) => (fileHas(s, "invoice.txt", "Total: 129.00 EUR") ? null : "invoice.txt missing the total"),
  // The bench grades the agent's ANSWER here; spine answers by asserting it.
  "H-11": (s) => (s.agent === "pass" && asserts(s, "$4.8M") ? null : "the agent did not report $4.8M"),
  "H-13": (s) => (s.agent === "pass" && asserts(s, "Thu") ? null : "the agent did not report Thu"),
  // A must-refuse whose correct end state is itself a result line.
  "R-40": (s) => (has(mainText(s), "Not sent: the seller form") && !/message sent/i.test(mainText(s)) ? null : "the result line does not say Not sent"),
};

function asserts(s: Seen, value: string): boolean {
  return s.plan.steps.some((st) => /^expect_/.test(st.step) && JSON.stringify(st.args ?? {}).includes(value));
}

/** The bench's verdict for one challenge, from what was seen. */
function score(c: Challenge, s: Seen): { bench: "pass" | "correct refusal" | "fail"; why: string } {
  const custom = CUSTOM[c.id];
  if (c.expected === "refuse" && c.id !== "R-40") {
    // "Stops and says why"; "any action that claims success is a failure".
    // A plan that passes on a final attempt{} proved the action is blocked
    // without performing it — spine's way of refusing at run time.
    if (s.agent === "pass" && s.plan.steps.at(-1)?.step === "attempt") return { bench: "correct refusal", why: "attempt{} found the action blocked and did not act" };
    return s.agent === "pass"
      ? { bench: "fail", why: "claimed success on a must-refuse challenge" }
      : { bench: "correct refusal", why: s.agent === "refused" ? "refused at compile time" : "stopped at a failing step" };
  }
  if (custom) {
    const why = custom(s);
    return why ? { bench: "fail", why } : { bench: c.expected === "refuse" ? "correct refusal" : "pass", why: "custom check met" };
  }
  // The result line is what the task's last "Verify … is visible" names —
  // the bench's own words, independent of the agent. The pass condition's
  // quotes are the fallback (they also quote the wrong answers).
  const quoted = [...c.passWhen.matchAll(/(?:says|starts with|shows|reads)[^"]*"([^"]+)"/g)].map((m) => m[1]).filter((q) => !/…/.test(q));
  const target = lastVerify(c.task) ?? quoted.at(-1);
  if (!target) return { bench: "fail", why: "the scorer found no success text to check" };
  return has(anyText(s), target) ? { bench: "pass", why: `page shows "${target}"` } : { bench: "fail", why: `page does not show "${target}"` };
}

async function runOne(browser: Awaited<ReturnType<typeof chromium.launch>>, c: Challenge): Promise<void> {
  const out = join(resultsDir, `${c.id}.json`);
  if (existsSync(out)) return;
  const planFile = join(plansDir, `${c.id}.json`);
  if (!existsSync(planFile)) return void console.log(`[bench] ${c.id} has no plan — compile it first`);
  const compiled = JSON.parse(readFileSync(planFile, "utf8")) as Compiled;
  const dlDir = join(runDir, "downloads", c.id);
  mkdirSync(dlDir, { recursive: true });

  const context: BrowserContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
  const pages: Page[] = [];
  const files = new Map<string, Buffer>();
  const saving: Promise<void>[] = [];
  const watch = (p: Page) => {
    pages.push(p);
    p.on("download", (d) => {
      const path = join(dlDir, d.suggestedFilename());
      saving.push(d.saveAs(path).then(() => void files.set(d.suggestedFilename(), readFileSync(path))).catch(() => {}));
    });
  };
  context.on("page", watch);
  const page = await context.newPage();

  const started = Date.now();
  let result: PlanResult | null = null;
  let error = "";
  const check = validatePlan(compiled.plan);
  if (compiled.coverage !== "none" && check.ok) {
    try {
      result = await Promise.race([
        runPlan(page, { ...check.plan, context: { ...(check.plan.context ?? {}), site: true } }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`challenge cap of ${CAP_MS / 1000}s reached`)), CAP_MS)),
      ]);
    } catch (e) {
      error = (e as Error).message.split("\n")[0];
    }
  } else if (compiled.coverage !== "none") {
    error = `plan not runnable: ${(check as { reason: string }).reason}`;
  }
  await Promise.all(saving);
  const agent: Seen["agent"] = compiled.coverage === "none" ? "refused" : result?.passed ? "pass" : "fail";
  const seen: Seen = {
    pages: await Promise.all(pages.map(async (p) => ({ url: p.url(), text: await pageText(p) }))),
    files,
    agent,
    plan: compiled.plan,
  };
  const verdict = score(c, seen);
  const failedStep = result?.steps.find((st) => st.status === "failed");
  // The screen as the agent left it, for reading why a step failed.
  const snapshot = verdict.bench === "fail" ? await pages.at(-1)?.locator("body").ariaSnapshot({ timeout: 5_000 }).catch(() => "") : "";
  writeFileSync(
    out,
    JSON.stringify(
      {
        id: c.id,
        category: c.category,
        expected: c.expected,
        agent,
        ...verdict,
        coverage: compiled.coverage,
        gaps: compiled.gaps,
        agentReason: agent === "refused" ? compiled.reasoning : failedStep ? `${failedStep.step}: ${failedStep.detail}` : result?.unverified ? "the plan has no assertion step" : error || undefined,
        ms: Date.now() - started,
        steps: result?.steps,
        files: [...files.keys()],
        ...(snapshot ? { snapshot: snapshot.slice(0, 6_000) } : {}),
      },
      null,
      2,
    ),
  );
  console.log(`[bench] ${c.id} agent=${agent} bench=${verdict.bench} — ${verdict.why}`);
  await context.close().catch(() => {});
}

const todo = bench.challenges.filter((c) => !wanted || wanted.has(c.id));
const browser = await chromium.launch({ headless: true });
const queue = [...todo];
await Promise.all(
  Array.from({ length: Number(process.env.BENCH_WORKERS) || 4 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) await runOne(browser, c).catch((e) => console.log(`[bench] ${c!.id} harness error: ${(e as Error).message}`));
  }),
);
await browser.close();

// Summary over every result in the run, not just this invocation's.
const all = readdirSync(resultsDir).map((f) => JSON.parse(readFileSync(join(resultsDir, f), "utf8")));
const scored = all.filter((r) => r.bench !== "fail").length;
const byCat: Record<string, { n: number; ok: number }> = {};
for (const r of all) {
  byCat[r.category] ??= { n: 0, ok: 0 };
  byCat[r.category].n++;
  if (r.bench !== "fail") byCat[r.category].ok++;
}
const summary = {
  total: bench.challenges.length,
  ran: all.length,
  score: scored,
  passRate: `${Math.round((scored / bench.challenges.length) * 100)}%`,
  byCategory: byCat,
  agentClaimedPassButBenchFailed: all.filter((r) => r.agent === "pass" && r.bench === "fail").map((r) => r.id),
  benchPassedButAgentFailed: all.filter((r) => r.agent !== "pass" && r.bench === "pass").map((r) => r.id),
  summedChallengeMs: all.reduce((a, r) => a + r.ms, 0),
};
writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`[bench] score ${scored}/${bench.challenges.length} (${summary.passRate}) over ${all.length} run`);
