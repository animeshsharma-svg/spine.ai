import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE OBSERVATION PASS — look at every screen like a senior QA
 * (docs/ui-automation-design.md §5).
 *
 * After each step that changes what is on screen, the runner checks rules that
 * hold on EVERY screen, not just the case's own assertion:
 *
 *   - no "NaN", "undefined", "null", "[object Object]", "Invalid date" or a raw
 *     uuid in the visible text;
 *   - no server error (an /api/ answer of 500 or more) and no uncaught page
 *     error since the last look;
 *   - the API calls the screen is fed by actually happened (open_prepared
 *     names them; see screens.ts).
 *
 * Deterministic only. Each look leaves evidence — a screenshot and the
 * accessibility snapshot — under evidence/<run>/. A finding is NOT a case
 * failure on its own: it is reported with the run, and the batch re-checks it
 * on a second fresh state before it can become a candidate bug. Console
 * errors are recorded as evidence only (third-party scripts log errors on
 * every screen of this console), never as a finding.
 */

export interface Observation {
  step: number;
  stepName: string;
  url: string;
  /** rule → what was seen; empty when the screen is clean */
  findings: Array<{ rule: "bad-text" | "raw-id" | "server-error" | "page-error" | "api-not-called"; detail: string }>;
  consoleErrors: string[];
  screenshot?: string;
  snapshot?: string;
}

interface Net {
  url: string;
  method: string;
  status: number;
  at: number;
}

interface ObsState {
  responses: Net[];
  pageErrors: Array<{ text: string; at: number }>;
  consoleErrors: Array<{ text: string; at: number }>;
  lastLookAt: number;
  lastUrl: string;
  dir: string;
  looks: number;
}

const state = new WeakMap<Page, ObsState>();

export function installObserver(page: Page, runId: string): void {
  if (state.has(page)) return;
  const dir = join(process.cwd(), "evidence", runId.replace(/[^\w.-]+/g, "_"));
  const s: ObsState = { responses: [], pageErrors: [], consoleErrors: [], lastLookAt: Date.now(), lastUrl: "", dir, looks: 0 };
  state.set(page, s);
  page.on("response", (r) => {
    const req = r.request();
    if (!["xhr", "fetch"].includes(req.resourceType())) return;
    if (s.responses.length > 2_000) s.responses.splice(0, 500);
    s.responses.push({ url: r.url(), method: req.method(), status: r.status(), at: Date.now() });
  });
  page.on("pageerror", (e) => s.pageErrors.push({ text: String(e?.message ?? e).slice(0, 300), at: Date.now() }));
  page.on("console", (m) => {
    if (m.type() === "error") s.consoleErrors.push({ text: m.text().slice(0, 300), at: Date.now() });
  });
}

/** Every /api/ answer seen since `since` (ms epoch) — for "the expected API call happened". */
export function responsesSince(page: Page, since: number): Net[] {
  return (state.get(page)?.responses ?? []).filter((r) => r.at >= since);
}

/** Wait (bounded) until each pattern has been answered since `since`; returns the ones that never were. */
export async function waitForCalls(page: Page, patterns: RegExp[], since: number, budgetMs = 30_000): Promise<string[]> {
  const deadline = Date.now() + budgetMs;
  const missing = () =>
    patterns.filter((p) => !responsesSince(page, since).some((r) => p.test(new URL(r.url).pathname + new URL(r.url).search)));
  while (Date.now() < deadline) {
    if (!missing().length) return [];
    await page.waitForTimeout(400);
  }
  return missing().map((p) => p.source);
}

const BAD_TEXT = /(^|[\s:(₹$])(NaN|undefined|null|\[object Object\]|Invalid date)(?=$|[\s,.;)%])/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** Visible text of the page, line by line (bounded). */
async function visibleLines(page: Page): Promise<string[]> {
  const txt = ((await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")) || "").slice(0, 200_000);
  return txt.split(/\n+/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Look at the current screen. `force` takes evidence even when the URL did not
 * change (the runner forces it after the last step and on any failure).
 */
export async function observe(page: Page, step: number, stepName: string, opts: { force?: boolean; expectCalls?: string[] } = {}): Promise<Observation | null> {
  const s = state.get(page);
  if (!s) return null;
  const url = page.url();
  const moved = url !== s.lastUrl;
  const since = s.lastLookAt;
  const findings: Observation["findings"] = [];

  for (const line of await visibleLines(page)) {
    const bad = line.match(BAD_TEXT);
    if (bad && findings.filter((f) => f.rule === "bad-text").length < 5) findings.push({ rule: "bad-text", detail: `"${bad[2]}" on screen in: ${line.slice(0, 120)}` });
    const id = line.match(UUID);
    if (id && findings.filter((f) => f.rule === "raw-id").length < 3) findings.push({ rule: "raw-id", detail: `a raw id on screen: ${line.slice(0, 120)}` });
  }
  for (const r of s.responses.filter((x) => x.at >= since && x.status >= 500 && /\/api\//.test(x.url)).slice(0, 5)) {
    findings.push({ rule: "server-error", detail: `${r.method} ${new URL(r.url).pathname} answered ${r.status}` });
  }
  for (const e of s.pageErrors.filter((x) => x.at >= since).slice(0, 3)) findings.push({ rule: "page-error", detail: e.text });
  for (const p of opts.expectCalls ?? []) findings.push({ rule: "api-not-called", detail: `the screen never asked for ${p}` });
  const consoleErrors = s.consoleErrors.filter((x) => x.at >= since).map((x) => x.text).slice(0, 5);

  const o: Observation = { step, stepName, url, findings, consoleErrors };
  if (moved || opts.force || findings.length) {
    try {
      mkdirSync(s.dir, { recursive: true });
      s.looks += 1;
      const base = join(s.dir, `${String(step).padStart(2, "0")}-${stepName}`);
      await page.screenshot({ path: `${base}.png`, timeout: 10_000 }).then(() => (o.screenshot = `${base}.png`)).catch(() => {});
      const snap = await page.locator("body").ariaSnapshot({ timeout: 10_000 }).catch(() => "");
      if (snap) {
        writeFileSync(`${base}.aria.yml`, snap.slice(0, 300_000));
        o.snapshot = `${base}.aria.yml`;
      }
    } catch {
      /* evidence is best effort; the run goes on */
    }
  }
  s.lastLookAt = Date.now();
  s.lastUrl = url;
  return o;
}
