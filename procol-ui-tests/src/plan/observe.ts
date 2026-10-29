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
 * Deterministic only. Each look leaves a SCREEN RECORD in words — headings, tabs, buttons
 * (enabled or not), fields with their values and errors, messages on screen, open dialogs, the
 * console's errors and warnings, failed requests — as evidence/<run>/NN-<step>.screen.json and on
 * the step. A picture (and the accessibility snapshot) only where a step failed or a finding was
 * made: not one per step (Aanya, 26 Oct: "save the console or divs or buttons but not ss of each step"). A finding is NOT a case
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
  /** the screen in words, for the step */
  screen?: ScreenRecord;
}

/** What was on screen after a step, in words. Secrets (codes, passwords) are masked. */
export interface ScreenRecord {
  url: string;
  title: string;
  headings: string[];
  tabs: Array<{ name: string; selected?: boolean }>;
  buttons: Array<{ name: string; disabled?: boolean }>;
  fields: Array<{ label: string; value: string; required?: boolean; disabled?: boolean; error?: string }>;
  messages: string[];
  dialogs: string[];
  console: Array<{ type: "error" | "warning"; text: string }>;
  failedRequests: Array<{ method: string; path: string; status: number }>;
}

interface Net {
  url: string;
  method: string;
  status: number;
  at: number;
  /** the request body as sent (truncated; never for sign-in calls, so no one-time code is kept) */
  body?: string;
}

interface ObsState {
  responses: Net[];
  pageErrors: Array<{ text: string; at: number }>;
  consoleErrors: Array<{ text: string; at: number }>;
  consoleWarnings: Array<{ text: string; at: number }>;
  lastLookAt: number;
  lastUrl: string;
  dir: string;
  looks: number;
}

const state = new WeakMap<Page, ObsState>();

export function installObserver(page: Page, runId: string): void {
  attachObserver(page, join(process.cwd(), "evidence", runId.replace(/[^\w.-]+/g, "_")));
}

/**
 * Watch a second page of the same run — the vendor's, in its own browser
 * context — into the same evidence folder as `from`. A failed bid then shows
 * the vendor's screen; the step's screenshot used to be the buyer's project
 * page, which said nothing about why the bid failed (15 Oct).
 */
export function shareObserver(from: Page, to: Page): void {
  const dir = state.get(from)?.dir;
  if (dir) attachObserver(to, dir);
}

function attachObserver(page: Page, dir: string): void {
  if (state.has(page)) return;
  const s: ObsState = { responses: [], pageErrors: [], consoleErrors: [], consoleWarnings: [], lastLookAt: Date.now(), lastUrl: "", dir, looks: 0 };
  state.set(page, s);
  page.on("response", (r) => {
    const req = r.request();
    if (!["xhr", "fetch"].includes(req.resourceType())) return;
    if (s.responses.length > 2_000) s.responses.splice(0, 500);
    const signIn = /otp|login|authenticate|token/i.test(new URL(r.url()).pathname);
    const body = !signIn && req.method() !== "GET" ? (req.postData() ?? "").slice(0, 8_000) || undefined : undefined;
    s.responses.push({ url: r.url(), method: req.method(), status: r.status(), at: Date.now(), ...(body ? { body } : {}) });
  });
  page.on("pageerror", (e) => s.pageErrors.push({ text: String(e?.message ?? e).slice(0, 300), at: Date.now() }));
  // A console line can carry a URL with a token in it (28 Oct: the WebSocket error printed its access-token):
  // the value is masked before it is kept, shown on the Console tab or reported as a bug.
  const masked = (t: string) => t.replace(/([?&;](?:access[-_]?token|lightspeed[-_]?token|token|auth|api[-_]?key|key|secret|signature|sig|session)=)[^&\s'"]+/gi, "$1…");
  page.on("console", (m) => {
    if (m.type() === "error") s.consoleErrors.push({ text: masked(m.text()).slice(0, 300), at: Date.now() });
    else if (m.type() === "warning" && s.consoleWarnings.length < 500) s.consoleWarnings.push({ text: masked(m.text()).slice(0, 300), at: Date.now() });
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

/** The screen in words: what a tester would read off it, bounded. */
async function readScreen(page: Page): Promise<Omit<ScreenRecord, "url" | "console" | "failedRequests">> {
  const empty = { title: "", headings: [], tabs: [], buttons: [], fields: [], messages: [], dialogs: [] };
  return page
    .evaluate(() => {
      const vis = (e: Element) => {
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
      };
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
      const all = (sel: string) => Array.from(document.querySelectorAll(sel)).filter(vis) as HTMLElement[];
      const uniq = <T,>(xs: T[], key: (x: T) => string) => xs.filter((x, i) => xs.findIndex((y) => key(y) === key(x)) === i);
      const headings = uniq(all("h1, h2, h3, h4, [role=heading], .ant-drawer-title, .ant-modal-title").map((e) => clean(e.innerText).slice(0, 100)).filter(Boolean), (x) => x).slice(0, 20);
      const tabs = uniq(all("[role=tab]").map((e) => ({ name: clean(e.innerText).slice(0, 40), ...(e.getAttribute("aria-selected") === "true" ? { selected: true } : {}) })).filter((t) => t.name), (t) => t.name).slice(0, 20);
      const buttons = uniq(
        all("button, [role=button], a.ant-btn")
          .map((e) => {
            const name = clean(e.getAttribute("aria-label")) || clean(e.innerText) || clean(e.getAttribute("title"));
            const off = (e as HTMLButtonElement).disabled || e.getAttribute("aria-disabled") === "true" || e.classList.contains("ant-btn-disabled");
            return { name: name.slice(0, 60), ...(off ? { disabled: true } : {}) };
          })
          .filter((b) => b.name),
        (b) => `${b.name}|${b.disabled ? 1 : 0}`,
      ).slice(0, 60);
      const fields = all("input:not([type=hidden]), textarea, select, [role=combobox]")
        .map((e) => {
          const f = e as HTMLInputElement;
          const lab = (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest(".ant-form-item")?.querySelector("label");
          const label = clean(lab?.textContent) || clean(f.getAttribute("aria-label")) || clean(f.getAttribute("placeholder")) || clean(f.getAttribute("name")) || f.type || f.tagName.toLowerCase();
          const secret = /password|otp|\bcode\b|passcode|\bpin\b/i.test(`${f.type} ${f.name} ${f.placeholder} ${f.autocomplete} ${label}`);
          let value = f.type === "checkbox" || f.type === "radio" ? (f.checked ? "checked" : "unchecked") : clean(f.value);
          if (secret && value) value = "•••";
          const error = clean(f.closest(".ant-form-item")?.querySelector(".ant-form-item-explain-error")?.textContent);
          return { label: label.slice(0, 60), value: value.slice(0, 80), ...(f.required || f.getAttribute("aria-required") === "true" ? { required: true } : {}), ...(f.disabled ? { disabled: true } : {}), ...(error ? { error: error.slice(0, 120) } : {}) };
        })
        .slice(0, 40);
      const messages = uniq(all(".ant-message-notice, .ant-notification-notice, [role=alert], .ant-alert, .ant-form-item-explain-error, .Toastify__toast").map((e) => clean(e.innerText).slice(0, 200)).filter(Boolean), (x) => x).slice(0, 10);
      const dialogs = uniq(all("[role=dialog], .ant-modal, .ant-drawer-open").map((e) => clean(e.querySelector(".ant-modal-title, .ant-drawer-title, h1, h2, h3")?.textContent).slice(0, 80)).filter(Boolean), (x) => x).slice(0, 5);
      return { title: document.title, headings, tabs, buttons, fields, messages, dialogs };
    })
    .catch(() => empty);
}

/**
 * Look at the current screen, and keep it in words. `picture` also takes a screenshot and the
 * accessibility snapshot (the runner asks for one where a step failed); a finding takes one too.
 */
export async function observe(page: Page, step: number, stepName: string, opts: { force?: boolean; picture?: boolean; expectCalls?: string[] } = {}): Promise<Observation | null> {
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
  const base = join(s.dir, `${String(step).padStart(2, "0")}-${stepName}`);
  // The screen in words, after every step: cheap, and what a reviewer reads first.
  try {
    const seen = await readScreen(page);
    o.screen = {
      url: (() => { try { const u = new URL(url); return u.pathname + u.search; } catch { return url; } })(),
      ...seen,
      console: [
        ...s.consoleErrors.filter((x) => x.at >= since).map((x) => ({ type: "error" as const, text: x.text })),
        ...s.consoleWarnings.filter((x) => x.at >= since).map((x) => ({ type: "warning" as const, text: x.text })),
      ].slice(0, 10),
      failedRequests: s.responses
        .filter((x) => x.at >= since && x.status >= 400)
        .map((x) => ({ method: x.method, path: (() => { try { return new URL(x.url).pathname; } catch { return x.url; } })(), status: x.status }))
        .slice(0, 10),
    };
    mkdirSync(s.dir, { recursive: true });
    writeFileSync(`${base}.screen.json`, JSON.stringify(o.screen, null, 1));
    // The session screen's Console tab, live (app.js "[console]"; Aanya, 28 Oct).
    if (o.screen.console.length || o.screen.failedRequests.length) {
      console.log(`[console] ${JSON.stringify({ step, stepName, url: o.screen.url, console: o.screen.console, failedRequests: o.screen.failedRequests })}`);
    }
  } catch {
    /* the record is best effort; the run goes on */
  }
  if (opts.picture || findings.length) {
    try {
      mkdirSync(s.dir, { recursive: true });
      s.looks += 1;
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
