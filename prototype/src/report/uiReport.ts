import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";
import { PAGE_CSS, escapeHtml, stamp } from "./shared.js";

/**
 * THE UI AUTOMATION REPORT — did the browser journey pass, and if it broke,
 * what does the screen look like and why might it have broken?
 *
 * Three things a UI report has to do that an API report does not:
 *
 *  1. SHOW THE SCREEN. A selector that no longer matches and a product that
 *     genuinely refuses an action produce the same red line in a log. The
 *     screenshot of the moment it stopped settles which one it was faster than
 *     any amount of prose.
 *  2. SEPARATE "the product is broken" FROM "the test is broken". The oracle
 *     already classifies that (product_defect vs automation_defect); this page
 *     leads with it, because sending a harness problem to engineering is how a
 *     QA tool loses its audience.
 *  3. SAY WHAT MIGHT HAVE CAUSED IT. Not a guess dressed as a diagnosis: a
 *     short list of the causes that actually produce this signature, each with
 *     what to check. Derived from the recorded evidence, never invented.
 */

const here = dirname(fileURLToPath(import.meta.url));
const UI_TESTS_DIR = join(here, "..", "..", "..", "procol-ui-tests");
const FINDINGS_DIR = join(UI_TESTS_DIR, "findings");

interface UiEvidence {
  flowKey: string;
  startedAt?: string;
  finishedAt?: string;
  url?: string;
  httpFailures?: Array<{ method: string; path: string; status: number; body?: unknown }>;
  toasts?: Array<{ text: string; severity: string }>;
  consoleErrors?: string[];
  notes?: string[];
  screenshot?: string;
}

export interface UiFinding {
  id: string;
  fingerprint: string;
  defectFingerprint: string;
  flowKey: string;
  kind: string;
  severity: string;
  title: string;
  rationale: string;
  reproduction: string[];
  actionable: boolean;
  evidence: UiEvidence;
  runId: string;
  createdAt: string;
}

/** One journey's outcome, written by the run whatever happened. */
export interface UiResult {
  runId: string;
  flowKey: string;
  title: string;
  category: string;
  covers?: string;
  status: "passed" | "broke";
  startedAt: string;
  durationMs: number;
  companyId: number | null;
  url?: string;
  screenshot?: string;
  error?: string;
  httpFailures?: number;
  toasts?: number;
}

/**
 * The latest outcome per journey.
 *
 * A pass leaves no finding, so without these a green run produced an empty
 * report — the one time someone definitely goes looking for it.
 */
export function loadUiResults(): UiResult[] {
  const dir = join(FINDINGS_DIR, "results");
  if (!existsSync(dir)) return [];
  const all: UiResult[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as UiResult;
      if (parsed?.flowKey) all.push(parsed);
    } catch {
      /* skip a half-written file */
    }
  }
  all.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  const latest = new Map<string, UiResult>();
  for (const r of all) if (!latest.has(r.flowKey)) latest.set(r.flowKey, r);
  return [...latest.values()];
}

/** Findings on disk, newest first. One file per finding, written by the run. */
export function loadUiFindings(): UiFinding[] {
  if (!existsSync(FINDINGS_DIR)) return [];
  const out: UiFinding[] = [];
  for (const name of readdirSync(FINDINGS_DIR)) {
    if (!name.endsWith(".json") || name.startsWith("run-")) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(FINDINGS_DIR, name), "utf8")) as UiFinding;
      if (parsed?.flowKey) out.push(parsed);
    } catch {
      /* a half-written file from a killed run */
    }
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Absolute path of a finding's screenshot, if it kept one. */
export function uiShotPath(relative: string): string | undefined {
  if (/(^|\/)\.\./.test(relative)) return undefined;
  const full = join(FINDINGS_DIR, relative);
  return full.startsWith(FINDINGS_DIR) && existsSync(full) ? full : undefined;
}

/**
 * Why a journey might have broken.
 *
 * Read off the evidence, in the order a person would actually check them. A
 * cause only appears when its signature is present, so the list is short and
 * every line is worth reading — a fixed list of ten possibilities would be
 * ignored by the second run.
 */
export function possibleReasons(f: UiFinding): Array<{ cause: string; check: string }> {
  const reasons: Array<{ cause: string; check: string }> = [];
  const text = `${f.title} ${f.rationale}`.toLowerCase();
  const ev = f.evidence ?? { flowKey: f.flowKey };
  const http = ev.httpFailures ?? [];
  const toasts = (ev.toasts ?? []).filter((t) => t.severity === "error");
  const console5xx = (ev.consoleErrors ?? []).filter((c) => /50\d|failed to load/i.test(c));

  if (http.some((h) => h.status >= 500)) {
    reasons.push({
      cause: "The product's own API failed (5xx) mid-journey — this is a product defect, not a test problem.",
      check: `Take ${http.filter((h) => h.status >= 500).map((h) => `${h.method} ${h.path} → ${h.status}`).join(", ")} to the backend team.`,
    });
  }
  if (http.some((h) => h.status === 401 || h.status === 403)) {
    reasons.push({
      cause: "The signed-in user was not allowed to do this.",
      check: "Check the role and permissions of the console user this client logs in as — the journey may need an admin.",
    });
  }
  if (http.some((h) => h.status === 422 || h.status === 400)) {
    reasons.push({
      cause: "The app rejected the data the journey submitted.",
      check: "Read the message on the failing request: it usually names the field. Either the journey's data is wrong for this client, or a new mandatory field appeared.",
    });
  }
  if (toasts.length) {
    reasons.push({
      cause: `The app showed an error of its own: "${toasts[0].text}".`,
      check: "If that message is correct behaviour, the journey is asserting the wrong thing; if not, it is a product bug.",
    });
  }
  if (/timed out|timeout|waitfor/.test(text)) {
    reasons.push({
      cause: "A step waited for something that never appeared.",
      check: "Usually a moved or renamed control, a modal or cookie banner covering it, or the page simply being slower than the timeout. The screenshot shows which.",
    });
  }
  if (/locator|selector|not found|no element|resolved to 0/.test(text)) {
    reasons.push({
      cause: "A locator no longer matches anything on the page.",
      check: "Compare the screenshot with the step: if the control is visibly there under a new label, the journey needs updating — that is a test fix, not a product bug.",
    });
  }
  if (/target page, context or browser has been closed/.test(text)) {
    reasons.push({
      cause: "The browser was closed while the journey was still running.",
      check: "Usually the run was stopped by hand, or the parent process exited. Re-run before treating it as a finding.",
    });
  }
  if (/login|auth|session|otp/.test(text) || /login/.test(ev.url ?? "")) {
    reasons.push({
      cause: "The session was not valid, so the journey never got past login.",
      check: "The client's console session comes from the database and can expire. Sign in to the console once as that company, then re-run.",
    });
  }
  if (console5xx.length && http.length === 0) {
    reasons.push({
      cause: "The page logged failing resources but no API call failed — often a 404 asset or a blocked third-party script.",
      check: `Console said: ${console5xx.slice(0, 2).join(" · ")}`,
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      cause: "The journey failed without the app producing any evidence of its own.",
      check: "No failing request, no error toast. Treat it as a harness problem first — the screenshot and the step in the message are the place to start.",
    });
  }
  return reasons;
}

const KIND_LABEL: Record<string, { label: string; cls: string; who: string }> = {
  product_defect: { label: "Product defect", cls: "p-fail", who: "engineering" },
  contradiction: { label: "Silent failure", cls: "p-fail", who: "engineering" },
  product_rejected_input: { label: "Test gap", cls: "p-incon", who: "QA" },
  automation_defect: { label: "Harness problem", cls: "p-incon", who: "QA" },
  environment: { label: "Environment", cls: "p-notrun", who: "whoever owns the env" },
};

function renderFinding(f: UiFinding): string {
  const kind = KIND_LABEL[f.kind] ?? KIND_LABEL.automation_defect;
  const flow = UI_FLOWS.find((u) => u.key === f.flowKey);
  const ev = f.evidence ?? { flowKey: f.flowKey };
  const shot = ev.screenshot && uiShotPath(ev.screenshot) ? ev.screenshot : undefined;

  return `
<details class="case" data-kind="${escapeHtml(f.kind)}" data-flow="${escapeHtml(f.flowKey)}"
         data-search="${escapeHtml(`${f.flowKey} ${f.title} ${f.rationale}`.toLowerCase())}" open>
  <summary>
    <span class="pill ${kind.cls}">✕ Broke</span>
    <span class="pill p-muted">${escapeHtml(kind.label)}</span>
    <span class="ctitle">${escapeHtml(flow?.label ?? f.flowKey)}</span>
    <span class="grow"></span>
    <span class="meta">${escapeHtml(f.severity)}</span>
    <span class="meta">${escapeHtml(stamp(f.createdAt))}</span>
  </summary>
  <div class="case-body">
    <p class="verdict"><strong>${escapeHtml(f.title)}</strong><br>${escapeHtml(f.rationale)}</p>
    <table class="kv">
      <tr><th>Journey</th><td>${escapeHtml(flow?.label ?? f.flowKey)} <code>${escapeHtml(f.flowKey)}</code></td></tr>
      ${ev.url ? `<tr><th>Last page</th><td><code>${escapeHtml(ev.url)}</code></td></tr>` : ""}
      <tr><th>Whose problem</th><td>${escapeHtml(kind.label)} — for ${escapeHtml(kind.who)}</td></tr>
      ${
        (ev.httpFailures ?? []).length
          ? `<tr><th>Failing requests</th><td>${(ev.httpFailures ?? [])
              .map((h) => `<code>${escapeHtml(h.method)} ${escapeHtml(h.path)} → ${h.status}</code>`)
              .join("<br>")}</td></tr>`
          : ""
      }
      ${
        (ev.toasts ?? []).length
          ? `<tr><th>What the app said</th><td>${(ev.toasts ?? [])
              .map((t) => `${escapeHtml(t.text)} <span class="meta">(${escapeHtml(t.severity)})</span>`)
              .join("<br>")}</td></tr>`
          : ""
      }
    </table>

    <h5>Possible reasons</h5>
    <ol class="reasons">
      ${possibleReasons(f)
        .map(
          (r) =>
            `<li><strong>${escapeHtml(r.cause)}</strong><span class="check">${escapeHtml(r.check)}</span></li>`,
        )
        .join("")}
    </ol>

    <h5>The screen when it broke</h5>
    ${
      shot
        ? `<a class="shot-link" href="/api/ui-shot?f=${encodeURIComponent(shot)}" target="_blank" rel="noopener">
             <img class="shot" src="/api/ui-shot?f=${encodeURIComponent(shot)}" alt="the screen when ${escapeHtml(f.flowKey)} broke" loading="lazy">
           </a>`
        : `<p class="none">No screenshot for this one — it predates screenshot capture, or the browser had already closed.
           Re-run the journey and the report will show the screen.</p>`
    }
  </div>
</details>`;
}

/** A journey that passed: what it covered, how long it took, and the screen it ended on. */
function renderPass(r: UiResult): string {
  const flow = UI_FLOWS.find((u) => u.key === r.flowKey);
  const shot = r.screenshot && uiShotPath(r.screenshot) ? r.screenshot : undefined;
  const mins = r.durationMs >= 60_000 ? `${(r.durationMs / 60_000).toFixed(1)} min` : `${Math.round(r.durationMs / 1000)}s`;

  return `
<details class="case v-pass" data-kind="passed" data-flow="${escapeHtml(r.flowKey)}"
         data-search="${escapeHtml(`${r.flowKey} ${r.title}`.toLowerCase())}">
  <summary>
    <span class="pill p-pass">Worked</span>
    <span class="ctitle">${escapeHtml(flow?.label ?? r.title)}</span>
    <span class="grow"></span>
    <span class="meta">took ${escapeHtml(mins)}</span>
    <span class="meta">${escapeHtml(stamp(r.startedAt))}</span>
  </summary>
  <div class="case-body">
    <p class="verdict">The browser did the whole journey and the app behaved. ${
      r.covers ? escapeHtml(`It covers: ${r.covers}`) : ""
    }</p>
    <table class="kv">
      <tr><th>Journey</th><td>${escapeHtml(flow?.label ?? r.title)} <code>${escapeHtml(r.flowKey)}</code></td></tr>
      ${r.url ? `<tr><th>Finished on</th><td><code>${escapeHtml(r.url)}</code></td></tr>` : ""}
      <tr><th>Account</th><td>${escapeHtml(String(r.companyId ?? "—"))}</td></tr>
      <tr><th>Took</th><td>${escapeHtml(mins)}</td></tr>
    </table>
    <h5>The screen it finished on</h5>
    ${
      shot
        ? `<a class="shot-link" href="/api/ui-shot?f=${encodeURIComponent(shot)}" target="_blank" rel="noopener">
             <img class="shot" src="/api/ui-shot?f=${encodeURIComponent(shot)}" alt="the screen ${escapeHtml(
               r.flowKey,
             )} finished on" loading="lazy"></a>`
        : `<p class="none">No screenshot — this run predates screenshot capture. The next run keeps one.</p>`
    }
  </div>
</details>`;
}

export function renderUiReport(findings: UiFinding[] = loadUiFindings()): string {
  // Newest finding per journey: the state of that journey now, not its history.
  const latest = new Map<string, UiFinding>();
  for (const f of findings) if (!latest.has(f.flowKey)) latest.set(f.flowKey, f);

  const results = loadUiResults();
  const passedAt = new Map(
    results.filter((r) => r.status === "passed").map((r) => [r.flowKey, r.startedAt ?? ""]),
  );
  /**
   * A pass clears a break only if it came LATER.
   *
   * The first version dropped a journey from "broke" if it had ever passed, so
   * a journey that worked on Tuesday and broke today read as healthy — the one
   * case where a report must not be reassuring.
   */
  const broken = [...latest.values()].filter((f) => {
    const passed = passedAt.get(f.flowKey);
    return !passed || passed < (f.createdAt ?? "");
  });
  const brokenKeys = new Set(broken.map((f) => f.flowKey));
  const passed = results.filter((r) => r.status === "passed" && !brokenKeys.has(r.flowKey));
  void passedAt;
  const touched = new Set([...brokenKeys, ...passed.map((p) => p.flowKey)]);
  const clean = UI_FLOWS.filter((f) => !touched.has(f.key));

  const product = broken.filter((f) => f.kind === "product_defect" || f.kind === "contradiction").length;
  const harness = broken.length - product;

  const tile = (label: string, value: number | string, cls = "") =>
    `<div class="tile ${cls}"><div class="tile-v">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(label)}</div></div>`;

  const byGroup = new Map<string, typeof UI_FLOWS>();
  for (const f of clean) {
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group)!.push(f);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Procol QA — UI automation</title>
<style>
${PAGE_CSS}
.grow { flex: 1 1 auto; }
.meta { font-size: 11px; color: var(--muted); white-space: nowrap; }
details.case { background: var(--card); border: 1px solid var(--line); border-radius: 9px; margin: 9px 0; }
details.case.v-pass { box-shadow: inset 3px 0 0 #34a853; }
details.case[data-kind="product_defect"], details.case[data-kind="contradiction"] { box-shadow: inset 3px 0 0 #c5221f; }
details.case[data-kind="automation_defect"], details.case[data-kind="environment"] { box-shadow: inset 3px 0 0 #f9ab00; }
details.case > summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 14px; cursor: pointer; list-style: none; }
details.case > summary::-webkit-details-marker { display: none; }
details.case > summary:hover { background: var(--hover); }
.ctitle { font-weight: 600; font-size: 13.5px; }
.case-body { padding: 4px 16px 18px; border-top: 1px dashed var(--line); }
.verdict { font-size: 13px; line-height: 1.55; margin: 12px 0; }
.kv { border-collapse: collapse; width: 100%; margin: 10px 0; }
.kv th, .kv td { text-align: left; vertical-align: top; padding: 4px 12px 4px 0; font-weight: 400; font-size: 12.5px; }
.kv th { color: var(--muted); white-space: nowrap; width: 1%; font-size: 11.5px; }
h5 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 16px 0 6px; }
ol.reasons { margin: 0; padding-left: 20px; }
ol.reasons li { margin: 0 0 9px; font-size: 12.5px; line-height: 1.5; }
ol.reasons .check { display: block; color: var(--muted); margin-top: 2px; }
img.shot { max-width: 100%; border: 1px solid var(--line); border-radius: 8px; display: block; }
.shot-link { display: block; }
.flowlist { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 6px 18px; margin: 0; padding: 0; list-style: none; }
.flowlist li { font-size: 12.5px; padding: 3px 0; color: var(--ink-2); }
.flowlist .k { color: var(--muted); font-size: 11px; }
.gname { font-size: 12px; font-weight: 600; margin: 14px 0 6px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>UI automation — what happened</h1>
  <p class="sub">${UI_FLOWS.length} journeys the browser can drive · ${passed.length} worked ·
  ${broken.length} broke · generated ${escapeHtml(stamp())}</p>

  <section class="card">
    <h2>In one line</h2>
    <div class="tiles">
      ${tile("journeys", UI_FLOWS.length)}
      ${tile("worked", passed.length, passed.length ? "good" : "")}
      ${tile("broke", broken.length, broken.length ? "crit" : "")}
      ${tile("product's fault", product, product ? "crit" : "")}
      ${tile("our tests' fault", harness, harness ? "warn" : "")}
      ${tile("not tried yet", clean.length)}
    </div>
    <p class="lede" style="margin-top:14px">A UI automation journey signs in and clicks through Procol like a person
    would. <strong>Worked</strong> means it got all the way through and the app behaved — you can see the
    screen it finished on. <strong>Broke</strong> means it stopped, and each one says whether that is the
    <strong>product's fault</strong> (send it to engineering) or <strong>our tests' fault</strong> (a button
    moved, a session expired — we fix it), then the reasons that actually produce that kind of break, then a
    picture of the screen where it stopped.</p>
  </section>

  <section class="card">
    <h2>Broke <span class="count">${broken.length}</span></h2>
    <p class="lede">Only journeys whose last run stopped early. Nothing here means nothing is broken.</p>
    ${
      broken.length
        ? broken.map(renderFinding).join("")
        : `<p class="none">Nothing broke. Every journey that has run finished cleanly.</p>`
    }
  </section>

  <section class="card">
    <h2>Worked <span class="count">${passed.length}</span></h2>
    <p class="lede">These ran end to end and the app did what it should. Open one to see how long it took and
    the screen it finished on — for an event journey that is the published event itself.</p>
    ${
      passed.length
        ? passed.map(renderPass).join("")
        : `<p class="none">No journey has passed yet in a run that kept its result. Run one from the platform —
           <strong>UI automation → Run selected</strong> — and it appears here with its screenshot.</p>`
    }
  </section>

  <section class="card">
    <h2>Not tried yet <span class="count">${clean.length}</span></h2>
    <p class="lede">Journeys the platform can drive but has not run since it started keeping results. They are
    neither passing nor failing — nobody has asked them yet.</p>
    ${[...byGroup.entries()]
      .map(
        ([group, flows]) => `<div class="gname">${escapeHtml(group)}</div>
        <ul class="flowlist">${flows
          .map((f) => `<li>${escapeHtml(f.label)} <span class="k">${escapeHtml(f.key)}</span></li>`)
          .join("")}</ul>`,
      )
      .join("")}
  </section>
</div>
</body>
</html>
`;
}
