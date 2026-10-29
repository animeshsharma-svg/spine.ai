/**
 * REAL benchmark for the spine.ai explorer (AGI Inc.'s REAL, task set v2: 121 tasks on
 * copies of 11 real sites — https://github.com/agi-inc/agisdk).
 *
 * Each task: a fresh browser opens the site, the task is set on it (/config), the explorer
 * (procol-ui-tests/src/explore) works toward the task's goal with LUNA, and the site's
 * state is read back (/finish) for grade.py to judge with REAL's own checks.
 *
 * The explorer runs as it does on Procol, except for what a benchmark has no room for:
 *   - nobody to ask: no tester channel (UI_EXPLORE_DIR unset), so a question ends the task;
 *   - risky clicks allowed (UI_EXPLORE_CONFIRM=0): the sites are sandboxes, and ordering
 *     or booking is what the tasks ask for;
 *   - its saved routes go to this run's own folder, so no run replays an earlier one;
 *   - only LUNA answers: the fallback providers (Groq, Gemini) are switched off unless
 *     BENCH_FALLBACK=1, and the model the gateway reports serving is kept per task.
 *
 *   tsx run.ts --tasks omnizon-13,dashdish-1     these tasks
 *   tsx run.ts --site omnizon,gomail [--limit 3] these sites' tasks
 *   tsx run.ts --all                             all 121
 *   options: --steps 30 (per task), --headed
 *
 * Then: .venv/bin/python grade.py results/<run>
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const QA = join(HERE, "..", "..");
const UI_TESTS = join(QA, "procol-ui-tests");

// ── arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (k: string) => argv.includes(`--${k}`);

// ── the tasks, from the installed agisdk (v2) ───────────────────────────────
interface Task { id: string; goal: string; difficulty?: string; website: { id: string; url: string } }
const sitePackages = join(HERE, ".venv", "lib");
const py = existsSync(sitePackages) ? readdirSync(sitePackages).find((d) => d.startsWith("python3")) : undefined;
const TASKS_DIR = py ? join(sitePackages, py, "site-packages", "agisdk", "REAL", "browsergym", "webclones", "v2", "tasks") : "";
if (!TASKS_DIR || !existsSync(TASKS_DIR)) throw new Error("agisdk is not installed in benchmarks/real/.venv — see README.md");
const ALL: Task[] = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(TASKS_DIR, f), "utf8")));
const byNumber = (a: Task, b: Task) => a.id.localeCompare(b.id, "en", { numeric: true });
let tasks = ALL.sort(byNumber);
if (arg("tasks")) { const want = new Set(arg("tasks")!.split(",").map((s) => s.trim())); tasks = tasks.filter((t) => want.has(t.id)); }
else if (arg("site")) { const sites = arg("site")!.split(","); tasks = tasks.filter((t) => sites.includes(t.website.id)); }
else if (!flag("all")) throw new Error("say which tasks: --tasks a,b | --site <id> | --all");
if (arg("limit")) tasks = tasks.slice(0, Number(arg("limit")));
if (!tasks.length) throw new Error("no task matched");

// ── the platform's model chain, LUNA only ───────────────────────────────────
for (const line of readFileSync(join(QA, "prototype", ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (process.env.BENCH_FALLBACK !== "1") { delete process.env.GROQ_API_KEY; delete process.env.GOOGLE_API_KEY; }
const llm = await import("../../prototype/src/ai/llm.js");
const { AI } = await import("../../prototype/config/settings.js");
const tier = (process.env.BENCH_TIER as "fast" | "reason" | undefined) ?? "fast";

/** Which model answered each of this task's calls, as the gateway reported it. */
let served: Record<string, number> = {};
let modelErrors = 0;
/** Answers that came back empty and arrived whole when asked again, streamed. */
let rescued = 0;
/** When the explorer last asked for a move: the watchdog's heartbeat. */
let lastMove = Date.now();
let rescueTokens = { calls: 0, prompt: 0, completion: 0 };

/**
 * The same question to the same model, streamed. Measured 26 Oct 2026: for some prompts the
 * gateway returns LUNA's answer as empty content (finish_reason "stop", ~59 tokens billed),
 * every time; streamed, the same prompt arrives whole. Only the asked model answers here.
 */
async function streamedChat(messages: { role: string; content: string }[]): Promise<{ text: string; model: string }> {
  const model = AI.slingring.models[tier];
  const res = await fetch(`${AI.slingring.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env[AI.slingring.apiKeyEnvVar]}` },
    body: JSON.stringify({ model, messages, max_tokens: 2_000, stream: true, stream_options: { include_usage: true } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok || !res.body) throw new Error(`Slingring ${res.status}`);
  const dec = new TextDecoder();
  let buf = "", text = "", servedModel = model;
  for await (const chunk of res.body as any) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "").trim();
      if (!line.startsWith("data:") || !data || data === "[DONE]") continue;
      const j = JSON.parse(data);
      if (j.model) servedModel = j.model;
      text += j.choices?.[0]?.delta?.content ?? "";
      if (j.usage) {
        rescueTokens.calls++;
        rescueTokens.prompt += j.usage.prompt_tokens ?? 0;
        rescueTokens.completion += j.usage.completion_tokens ?? 0;
      }
    }
  }
  return { text: text.trim(), model: servedModel };
}
const key = randomBytes(18).toString("hex");
// The explorer asks the platform's server for each move (brain.ts callModel); this is that
// endpoint, answered here exactly as prototype/src/routes/explore.ts answers it.
const decide = createServer(async (req, res) => {
  if (req.url !== "/api/explore/decide" || req.method !== "POST" || req.headers["x-spine-explore"] !== key) {
    res.writeHead(403).end();
    return;
  }
  lastMove = Date.now();
  let raw = "";
  for await (const c of req) raw += c;
  const b = JSON.parse(raw || "{}");
  const messages = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m: any) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 40_000) }))
    .slice(0, 12);
  let text = await llm.chat(messages, { tier, maxTokens: 500, deadlineMs: tier === "fast" ? 20_000 : undefined }).catch(() => "");
  let who = text ? `${llm.lastProviderUsed}${llm.lastServedModel ? ` (${llm.lastServedModel})` : ""}` : "";
  if (!text) {
    const again = await streamedChat(messages).catch(() => ({ text: "", model: "" }));
    if (again.text) { text = again.text; rescued++; who = `slingring:${AI.slingring.models[tier]} (${again.model}) · streamed`; }
  }
  if (!text) {
    modelErrors++;
    // Kept so a blank answer can be replayed against the gateway and its raw response read.
    mkdirSync(join(out, "blank"), { recursive: true });
    writeFileSync(join(out, "blank", `${Date.now()}.json`), JSON.stringify({ tier, messages }, null, 2));
  } else served[who] = (served[who] ?? 0) + 1;
  res.writeHead(text ? 200 : 502, { "content-type": "application/json" }).end(JSON.stringify({ text }));
});
await new Promise<void>((ok) => decide.listen(0, "127.0.0.1", ok));
const port = (decide.address() as { port: number }).port;

/**
 * The site's state, read from /finish once the page has finished building it. /finish first
 * renders from the store as it is now, then loads the change history from IndexedDB and renders
 * again. Read before that, "initial" equals "final" and every change the explorer made is lost:
 * on 26 Oct that wiped 47 of 59 results, omnizon orders included. REAL's harness waits for the
 * network to go quiet; this also waits for the site's "Snapshots loaded" log line, or for the
 * page to stay the same for 5 s, whichever comes first.
 */
async function readFinish(bg: any, site: string): Promise<{ state: unknown; settled: string }> {
  let loaded = false;
  const onLog = (m: any) => { if (/snapshots loaded/i.test(m.text())) loaded = true; };
  bg.on("console", onLog);
  // textContent through evaluate: no layout and no 20 s locator timeout. Zilloft's page is 9 MB
  // before any step and grows with every recorded change; reading it with innerText and
  // comparing the whole text each second lost all 10 Zilloft results (26 Oct).
  const read = (): Promise<string> => bg.evaluate(() => document.querySelector("pre")?.textContent ?? "").catch(() => "");
  try {
    await bg.goto(`${site}/finish`, { timeout: 90_000 });
    await bg.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    let lastLen = -1, same = 0, text = "";
    for (const until = Date.now() + 120_000; Date.now() < until; ) {
      text = await read();
      const ready = text.includes('"initialstate"');
      if (ready && loaded) { await bg.waitForTimeout(1_000); return { state: JSON.parse(await read()), settled: "history loaded" }; }
      same = ready && text.length === lastLen ? same + 1 : 0;
      if (same >= 5) return { state: JSON.parse(text), settled: "unchanged for 5 s" };
      lastLen = text.length;
      await bg.waitForTimeout(1_000);
    }
    if (text.includes('"initialstate"')) return { state: JSON.parse(text), settled: "timed out (120 s) — may be incomplete" };
    throw new Error("the /finish page never showed the site's state");
  } finally {
    bg.off("console", onLog);
  }
}

// ── the explorer, set up for a benchmark ────────────────────────────────────
const runId = `real-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
const out = join(HERE, "results", runId);
mkdirSync(join(out, "tasks"), { recursive: true });
Object.assign(process.env, {
  SPINE_SERVER: `http://127.0.0.1:${port}`,
  UI_EXPLORE_KEY: key,
  UI_EXPLORE_TIER: tier,
  UI_EXPLORE_ASK_FIRST: "0",
  UI_EXPLORE_CONFIRM: "0",
});
delete process.env.UI_EXPLORE_DIR;
// Its saved routes (explored/) land in this run's folder: a later run starts from nothing.
process.chdir(out);
const { CONFIG } = await import("../../procol-ui-tests/src/config.js");
const { explore } = await import("../../procol-ui-tests/src/explore/explorer.js");
const { chromium } = createRequire(join(UI_TESTS, "package.json"))("@playwright/test");
const maxSteps = Number(arg("steps")) || 30;

writeFileSync(join(out, "run.json"), JSON.stringify({ runId, startedAt: new Date().toISOString(), taskSet: "v2", tier, model: tier === "fast" ? process.env.SLINGRING_FAST_MODEL ?? "HACK26_GPT_5_6_LUNA" : tier, maxSteps, tasks: tasks.map((t) => t.id) }, null, 2));
console.log(`REAL v2 · ${tasks.length} task(s) · ${tier} tier · up to ${maxSteps} steps each → ${out}`);

for (const [i, t] of tasks.entries()) {
  const site = t.website.url.replace(/\/$/, "");
  CONFIG.appUrl = site; // the explorer's goto stays inside the app it is given
  served = {};
  modelErrors = 0;
  rescued = 0;
  rescueTokens = { calls: 0, prompt: 0, completion: 0 };
  // A copy: usageReport() hands out the live tallies, which would make every delta zero.
  const usage0 = JSON.parse(JSON.stringify(llm.usageReport()));
  const started = Date.now();
  const browser = await chromium.launch({ headless: !flag("headed") });
  // US Pacific time, as REAL's authors ran it: the sites store a picked date as local midnight in
  // UTC, and in IST (UTC+5:30) "1 August" was saved as 31 July (staynb-17, 26 Oct), failing
  // date checks the explorer had met. REAL's own harness leaves the machine's timezone.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: process.env.BENCH_TZ ?? "America/Los_Angeles" });
  // tsx compiles with esbuild's keepNames, which wraps functions in __name(…); the ones the
  // explorer hands to page.evaluate carry that call into the page, where it is undefined.
  await ctx.addInitScript({ content: "window.__name = (f) => f;" });
  const page = await ctx.newPage();
  const bg = await ctx.newPage();
  // BENCH_CONSOLE=1: the site's own log lines about its change history, to see when it is reset.
  if (process.env.BENCH_CONSOLE === "1")
    for (const [tab, pg] of [["main", page], ["finish", bg]] as const)
      pg.on("console", (m) => { if (/clear|time ?travel|indexeddb|snapshot|initiali/i.test(m.text())) console.log(`[site:${tab}] ${m.text().slice(0, 200)}`); });
  let result: any = null;
  let error = "";
  let state: unknown = null;
  let settled = "";
  try {
    await bg.goto(`${site}/config?run_id=0&task_id=v2.${t.id}&latency=0`, { timeout: 60_000 });
    await bg.waitForLoadState("networkidle").catch(() => {});
    await bg.goto(`${site}/finish`, { timeout: 60_000 });
    await page.bringToFront();
    await page.goto(site, { timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    // Watchdog: on 26 Oct four workers sat at 0% CPU for 36 min before their first step. A task
    // with no new move for 6 min, or over 30 min in all, is stopped and recorded as hung, a
    // runner problem rather than the explorer's result.
    lastMove = Date.now();
    let dog: ReturnType<typeof setInterval> | undefined;
    const hung = new Promise<never>((_, fail) => {
      dog = setInterval(() => {
        const quiet = Date.now() - lastMove, total = Date.now() - started;
        if (quiet > 6 * 60_000 || total > 30 * 60_000)
          fail(new Error(`hung: ${quiet > 6 * 60_000 ? `no new step for ${Math.round(quiet / 60_000)} min` : "over 30 min"} (runner problem, not the explorer's result)`));
      }, 15_000);
    });
    try {
      const going = explore(page, { goal: t.goal, runId: `${runId}-${t.id}`, companyId: null, askFirst: false, confirmRisky: false, maxSteps });
      going.catch(() => {}); // if the watchdog wins, the abandoned run must not crash the worker
      result = await Promise.race([going, hung]);
    } finally {
      clearInterval(dog);
    }
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }
  // Two tries: a Vercel cold start once took over 60 s to serve /finish (zilloft-2, 26 Oct).
  for (let attempt = 0; attempt < 2 && state === null; attempt++) {
    try {
      ({ state, settled } = await readFinish(bg, site));
    } catch (e) {
      if (attempt === 1) error ||= `could not read the site's state: ${(e as Error).message.slice(0, 200)}`;
    }
  }
  await Promise.race([browser.close().catch(() => {}), new Promise((ok) => setTimeout(ok, 20_000))]);
  const usage1 = llm.usageReport();
  const tokens = Object.entries(usage1.byModel).reduce(
    (n, [m, u]: [string, any]) => { const b: any = usage0.byModel[m] ?? { calls: 0, promptTokens: 0, completionTokens: 0 }; return { calls: n.calls + u.calls - b.calls, prompt: n.prompt + u.promptTokens - b.promptTokens, completion: n.completion + u.completionTokens - b.completionTokens }; },
    { ...rescueTokens },
  );
  const record = {
    id: t.id,
    site: t.website.id,
    difficulty: t.difficulty ?? null,
    goal: t.goal,
    ms: Date.now() - started,
    agent: result
      ? { saidDone: result.passed, reason: result.reason ?? null, proof: result.proof ?? null, steps: result.steps.map((s: any) => ({ step: s.step, status: s.status, detail: s.detail })) }
      : null,
    error: error || null,
    served,
    modelErrors,
    rescued,
    tokens,
    stateRead: settled || null,
    state,
  };
  writeFileSync(join(out, "tasks", `${t.id}.json`), JSON.stringify(record, null, 2));
  const said = result ? (result.passed ? "says done" : `stopped: ${(result.reason ?? "").slice(0, 80)}`) : `error: ${error.slice(0, 80)}`;
  console.log(`[${i + 1}/${tasks.length}] ${t.id} · ${result?.steps.length ?? 0} steps · ${Math.round(record.ms / 1000)} s · ${said} · served by ${Object.keys(served).join(", ") || "nobody"}`);
}
decide.close();
console.log(`done → grade with: .venv/bin/python grade.py ${out}`);
