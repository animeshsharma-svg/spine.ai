import { PAGE_CSS, escapeHtml, stamp } from "./shared.js";
import { findUiResult, loadUiFindings, possibleReasons } from "./uiReport.js";
import { JOURNEY_PHASES, type JourneyStep } from "../ui/journeySteps.js";
import { readTrail, type JourneyTrailRecord } from "../ui/trailStore.js";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";
import { comparedWithLast, frictionOf, whatItLeft, whereTimeWent } from "./uiRunFacts.js";
import { redactSecrets } from "../checks/engine.js";

/**
 * ONE JOURNEY, ONE REPORT — opened the moment the browser stops.
 *
 * The full UI report answers "what is the state of every journey". This
 * answers the question you actually have while the browser window is still
 * closing: did the thing I just ran work, and if not, where did it stop?
 *
 * So it leads with the verdict, then the trail of what the browser did, with
 * the last real step marked — because "failed" without "at which step" sends
 * you back to the terminal, which is what this whole page exists to avoid.
 */

const REPORT_CSS = `
.hero { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 12px;
  border: 1px solid var(--card-line); margin-bottom: 18px; }
.hero.good { background: var(--good-soft); border-color: var(--good); }
.hero.bad { background: var(--bad-soft); border-color: var(--bad); }
.hero-mark { font-size: 26px; line-height: 1; }
.hero h2 { margin: 0 0 3px; font-size: 17px; }
.hero p { margin: 0; font-size: 13px; color: var(--ink-soft); }
.trail { margin: 0; padding: 0; list-style: none; }
.trail-phase { display: flex; align-items: center; gap: 8px; margin: 16px 0 6px;
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-soft); }
.trail-phase::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.trail li { display: grid; grid-template-columns: 18px 1fr auto; gap: 10px; align-items: baseline;
  padding: 6px 9px; border-radius: 7px; font-size: 13px; line-height: 1.5; border-left: 2px solid transparent; }
.trail li .mark { font-weight: 800; text-align: center; }
.trail li.ok .mark { color: var(--good); }
.trail li.bad { background: var(--bad-soft); border-left-color: var(--bad); }
.trail li.bad .mark { color: var(--bad); }
.trail li.warn { background: var(--warn-soft); border-left-color: var(--warn); }
.trail li.warn .mark { color: var(--warn); }
.trail li.info .mark { color: var(--ink-soft); }
.trail li.here { outline: 2px solid var(--accent); outline-offset: 1px; }
.trail .at { font-family: var(--mono); font-size: 10.5px; color: var(--ink-soft); }
.trail .repeats { font-size: 10.5px; color: var(--ink-soft); background: var(--idle-soft);
  padding: 1px 6px; border-radius: 999px; margin-left: 5px; }
.here-note { margin: 10px 0 0; font-size: 12.5px; color: var(--ink-soft); }
.shot { max-width: 100%; border-radius: 9px; border: 1px solid var(--card-line); }
.wobbles { margin: 10px 0 0; padding: 0; list-style: none; }
.wobbles li { padding: 8px 10px; margin-bottom: 6px; border-radius: 8px; font-size: 13px;
  line-height: 1.55; background: var(--warn-soft); border-left: 3px solid var(--warn); }
.wobble-kind { display: inline-block; margin-right: 8px; padding: 1px 7px; border-radius: 999px;
  background: var(--warn); color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; vertical-align: 1px; }
.shot-note { margin: 8px 0 0; font-size: 12.5px; color: var(--ink-soft); line-height: 1.55; }
.kv { width: 100%; border-collapse: collapse; margin: 10px 0 0; font-size: 13px; }
.kv th { text-align: left; width: 160px; color: var(--ink-soft); font-weight: 600; padding: 5px 0; vertical-align: top; }
.kv td { padding: 5px 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; margin-top: 12px; }
.fact { border: 1px solid var(--card-line); border-radius: 9px; padding: 9px 11px; background: var(--card); }
.fact-l { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--ink-soft); margin-bottom: 3px; }
.fact-v { font-size: 13.5px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
.bars { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.bars li { display: grid; grid-template-columns: 1fr 74px; gap: 10px; align-items: center; font-size: 13px; }
.bars .bar-l { line-height: 1.45; }
.bars .bar-track { grid-column: 1 / -1; height: 5px; border-radius: 999px; background: var(--idle-soft); overflow: hidden; }
.bars .bar-fill { display: block; height: 100%; background: var(--accent); }
.bars .bar-t { text-align: right; font-family: var(--mono); font-size: 11.5px; color: var(--ink-soft); }
.checked { width: 100%; border-collapse: collapse; margin: 10px 0 0; font-size: 13px; }
.checked th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  color: var(--ink-soft); font-weight: 600; padding: 5px 10px 5px 0; border-bottom: 1px solid var(--line); }
.checked td { padding: 7px 10px 7px 0; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.45; }
.checked tr.no td { background: var(--bad-soft); }
.checked .v { white-space: nowrap; font-weight: 700; }
.checked .v.yes { color: var(--good); }
.checked .v.no { color: var(--bad); }
.checked .v.unread { color: var(--ink-soft); font-weight: 600; }
.checked .src { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-soft); }
.logged { width: 100%; border-collapse: collapse; margin: 10px 0 0; font-size: 12.5px; }
.logged th { text-align: left; font-weight: 600; color: var(--ink-soft); padding: 5px 8px 5px 0;
  border-bottom: 1px solid var(--line); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.logged td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.logged td.st { font-family: var(--mono); font-weight: 700; }
.logged td.st.bad5 { color: var(--bad); }
.logged td.st.bad4 { color: var(--warn); }
.logged code { font-family: var(--mono); font-size: 11.5px; overflow-wrap: anywhere; }
.conerr { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 5px; }
.conerr li { font-family: var(--mono); font-size: 11.5px; line-height: 1.5; color: var(--bad);
  background: var(--bad-soft); border-radius: 6px; padding: 6px 9px; overflow-wrap: anywhere; }
.since { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 13px; }
.since li { padding-left: 15px; position: relative; line-height: 1.5; }
.since li::before { content: "·"; position: absolute; left: 4px; color: var(--ink-soft); }
.streak { margin: 10px 0 0; font-size: 12.5px; color: var(--ink-soft); }
.raw { margin-top: 18px; }
.raw summary { cursor: pointer; font-size: 12px; color: var(--ink-soft); }
.raw pre { background: #0a0f18; color: #c7d2e5; border-radius: 9px; padding: 12px 14px;
  font-family: var(--mono); font-size: 11.5px; line-height: 1.55; overflow-x: auto; }
`;

/** Minutes and seconds, because "141845ms" is not a duration anyone reads. */
function tookInWords(ms: number): string {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function stepRow(step: JourneyStep, isHere: boolean): string {
  const mark = { ok: "✓", bad: "✗", warn: "!", info: "·" }[step.kind] ?? "·";
  // No `title` with the raw line on it. It hovered a tooltip over whichever
  // row the pointer happened to cross, covering the step above it while
  // adding nothing a reader wanted — the raw output is one click away at the
  // bottom of the page, in full and in order.
  return `<li class="${step.kind}${isHere ? " here" : ""}">
    <span class="mark">${mark}</span>
    <span>${escapeHtml(step.text)}${
      step.repeats ? `<span class="repeats">${step.repeats} attempts</span>` : ""
    }</span>
    <span class="at">${step.at != null ? `${(step.at / 1000).toFixed(1)}s` : ""}</span>
  </li>`;
}

function renderTrail(trail: JourneyTrailRecord, broke: boolean): string {
  if (!trail.steps.length)
    return `<p class="none">No narration was captured for this run.</p>`;
  const hereRaw = trail.stoppedAt?.raw;
  let phase = "";
  const out: string[] = [];
  for (const step of trail.steps) {
    if (step.phase !== phase) {
      phase = step.phase;
      const meta = JOURNEY_PHASES[phase] ?? { label: phase, icon: "·" };
      out.push(`</ul><div class="trail-phase"><span>${meta.icon}</span><span>${escapeHtml(meta.label)}</span></div><ul class="trail">`);
    }
    out.push(stepRow(step, broke && step.raw === hereRaw));
  }
  return `<ul class="trail">${out.join("")}</ul>`.replace(/^<ul class="trail"><\/ul>/, "");
}

/**
 * The browser's console errors, made readable.
 *
 * Three things are wrong with them raw: the same line repeats (a page that
 * 404s a resource twice writes it twice), the common shapes are jargon, and
 * one of Procol's own carries the session token in a URL. Redaction is belt
 * and braces here — new runs are redacted as they are captured — because
 * result files written before that still hold it.
 */
function readableConsoleErrors(lines: string[]): Array<{ text: string; count: number }> {
  const seen = new Map<string, number>();
  for (const raw of lines) {
    const safe = redactSecrets(raw) ?? "";
    const resource = safe.match(/^Failed to load resource:.*status of (\d+)/i);
    const socket = safe.match(/^WebSocket connection to '([^']+)'.*?(?:response code: (\d+))?$/i);
    let text = safe;
    if (resource) {
      text = `A resource the page asked for came back ${resource[1]} — the browser does not say which.`;
    } else if (socket) {
      const host = socket[1].replace(/\?.*$/, "");
      text = `The live-updates connection to ${host} was refused${
        socket[2] ? ` (handshake got ${socket[2]})` : ""
      } — anything on the page that updates in real time is not updating.`;
    }
    seen.set(text, (seen.get(text) ?? 0) + 1);
  }
  return [...seen.entries()].map(([text, count]) => ({ text, count }));
}

export function renderUiRunReport(runId: string): string {
  const trail = readTrail(runId);
  const result = findUiResult(runId);
  const flowKey = result?.flowKey ?? trail?.flowKey ?? "";
  const flow = UI_FLOWS.find((f) => f.key === flowKey);
  const finding = loadUiFindings().find((f) => f.runId === runId);

  // A run is a pass only if the journey itself says so. Playwright's exit code
  // agrees, and is the fallback when the journey never got far enough to write.
  const broke = result ? result.status === "broke" : (trail?.exitCode ?? 1) !== 0;
  const title = flow?.label ?? result?.title ?? (flowKey || "This run");
  const shot = result?.screenshot;
  const took = tookInWords(result?.durationMs ?? trail?.durationMs ?? 0);
  const when = result?.startedAt ?? trail?.startedAt;

  // Four more readings of the same trail — see `uiRunFacts.ts`.
  const left = whatItLeft(trail, result);
  const slowest = whereTimeWent(trail);
  const friction = frictionOf(trail, result?.observations ?? []);
  const since = comparedWithLast(trail);
  const failed = result?.failedRequests ?? [];
  const consoleErrors = readableConsoleErrors(result?.consoleErrors ?? []);
  const errorToasts = result?.errorToasts ?? [];
  const verified = result?.verified;

  const body =
    !trail && !result
      ? `<section class="card"><p class="none">Nothing was recorded for run <code>${escapeHtml(
          runId,
        )}</code>. Either the run is still going, or it was cleared.</p></section>`
      : `
  <div class="hero ${broke ? "bad" : "good"}">
    <span class="hero-mark">${broke ? "✗" : "✓"}</span>
    <div>
      <h2>${escapeHtml(title)} ${broke ? "broke" : "worked"}</h2>
      <p>${
        broke
          ? `The browser stopped before finishing${
              trail?.stoppedAt ? ` at: ${escapeHtml(trail.stoppedAt.text)}` : ""
            }.`
          : "The browser did the whole journey and the app behaved."
      } Took ${escapeHtml(took)}.</p>
    </div>
  </div>

  <section class="card">
    <h2>What the browser did</h2>
    <p class="lede">Every step the journey narrated, in order.${
      broke ? " The highlighted row is the last thing that happened before it stopped." : ""
    }</p>
    ${trail ? renderTrail(trail, broke) : `<p class="none">No trail was recorded for this run.</p>`}
    ${
      broke && trail?.stoppedAt
        ? `<p class="here-note"><strong>Where it stopped:</strong> ${escapeHtml(
            trail.stoppedAt.text,
          )} — in <strong>${escapeHtml(
            (JOURNEY_PHASES[trail.stoppedAt.phase] ?? { label: trail.stoppedAt.phase }).label,
          )}</strong>.</p>`
        : ""
    }
  </section>

  <section class="card">
    <h2>The screen it ${broke ? "stopped" : "finished"} on</h2>
    ${
      shot
        ? `<a href="/api/ui-shot?f=${encodeURIComponent(shot)}" target="_blank" rel="noopener">
             <img class="shot" src="/api/ui-shot?f=${encodeURIComponent(
               shot,
             )}" alt="the screen this run ${broke ? "stopped" : "finished"} on"></a>
           <p class="shot-note">${
             broke
               ? `Procol at the moment the journey stopped${
                   result?.error ? `, having failed on: <strong>${escapeHtml(result.error)}</strong>` : ""
                 }. An empty-looking screen here is usually the finding itself — the journey stopped because what it expected to see was not on it.`
               : "Procol at the end of the journey — the proof it got all the way through."
           }</p>`
        : `<p class="none">No screenshot was written for this run.</p>`
    }
    <table class="kv">
      <tr><th>Journey</th><td>${escapeHtml(title)} <code>${escapeHtml(flowKey)}</code></td></tr>
      ${result?.covers ? `<tr><th>Covers</th><td>${escapeHtml(result.covers)}</td></tr>` : ""}
      ${result?.url ? `<tr><th>${broke ? "Stopped on" : "Finished on"}</th><td><code>${escapeHtml(result.url)}</code></td></tr>` : ""}
      <tr><th>Account</th><td>${escapeHtml(String(result?.companyId ?? trail?.companyId ?? "—"))}</td></tr>
      <tr><th>Took</th><td>${escapeHtml(took)}</td></tr>
      ${
        result?.httpFailures
          ? `<tr><th>Server errors</th><td>${result.httpFailures} request(s) the app made came back 4xx/5xx</td></tr>`
          : ""
      }
      ${result?.error ? `<tr><th>What broke</th><td>${escapeHtml(result.error)}</td></tr>` : ""}
    </table>
  </section>

  <!-- Three cards that used to follow here — what the journey verified at the
       end, what the app logged while it ran, and where the app made it work
       hard — were removed at the reader's request: they read as alarming noise
       on a run that passed. The data behind them is still captured and still
       feeds the bug sheet; only this page stopped printing it. -->
  ${
    left.length
      ? `<section class="card">
    <h2>What this run left in Procol</h2>
    <p class="lede">The record it built, and the choices it made building it. Open the project and
    every one of these is checkable by hand — which is what makes the tick above more than a tick.</p>
    <div class="facts">${left
      .map(
        (f) => `<div class="fact"><span class="fact-l">${escapeHtml(f.label)}</span>
          <span class="fact-v">${
            f.href
              ? `<a href="${escapeHtml(f.href)}" target="_blank" rel="noopener">${escapeHtml(f.value)}</a>`
              : escapeHtml(f.value)
          }</span></div>`,
      )
      .join("")}</div>
  </section>`
      : ""
  }



  ${
    slowest.length
      ? `<section class="card">
    <h2>Where the time went</h2>
    <p class="lede">The gap between two steps is the work done to get from one to the other, so it is
    counted against the step it ends at. This is the only place the platform times Procol's own
    screens under a real browser — ${escapeHtml(took)} in total.</p>
    <ul class="bars">${slowest
      .map(
        (t) => `<li><span class="bar-l">${escapeHtml(t.label)}</span>
          <span class="bar-t">${(t.ms / 1000).toFixed(1)}s · ${t.share}%</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, t.share)}%"></span></span></li>`,
      )
      .join("")}</ul>
  </section>`
      : ""
  }


  ${
    since.lines.length
      ? `<section class="card">
    <h2>Compared with the last time this journey ran</h2>
    <p class="lede">Timings here are the whole run end to end, including Playwright's own start-up,
    so they read a little longer than the journey time above — but they are measured the same way on
    both runs, which is what makes the comparison mean something.</p>
    <ul class="since">${since.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
    ${since.streak ? `<p class="streak">${escapeHtml(since.streak)}</p>` : ""}
  </section>`
      : ""
  }

  ${
    result?.observations?.length
      ? `<section class="card">
    <h2>What looked unstable</h2>
    <p class="lede">Things the journey survived but should not have had to. None of these failed the
    run — the automation retried and carried on — which is exactly why they are easy to miss and worth
    writing down: ${result.observations.length} on this run.</p>
    <ul class="wobbles">${result.observations
      .map(
        (o) =>
          `<li><span class="wobble-kind">${escapeHtml(o.kind)}</span>${escapeHtml(o.detail)}</li>`,
      )
      .join("")}</ul>
  </section>`
      : ""
  }

  ${
    finding
      ? `<section class="card">
    <h2>Why it might have broken</h2>
    <ul>${possibleReasons(finding)
      .map((r) => `<li><strong>${escapeHtml(r.cause)}</strong> — ${escapeHtml(r.check)}</li>`)
      .join("")}</ul>
  </section>`
      : ""
  }

  <details class="raw">
    <summary>The raw output, exactly as the test printed it</summary>
    <pre>${escapeHtml((trail?.steps ?? []).map((s) => s.raw).join("\n")) || "nothing captured"}</pre>
  </details>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>spine.ai — ${escapeHtml(title)}</title>
<style>
${PAGE_CSS}
${REPORT_CSS}
</style>
</head>
<body>
<div class="wrap">
  <h1>This run</h1>
  <p class="sub">${escapeHtml(flowKey || runId)}${
    when ? ` · ${escapeHtml(stamp(when))}` : ""
  } · <a href="/api/ui-report">every journey's state</a></p>
  ${body}
</div>
</body>
</html>`;
}
