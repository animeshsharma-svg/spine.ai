import { PAGE_CSS, escapeHtml, stamp } from "./shared.js";
import { findUiResult, loadUiFindings, possibleReasons } from "./uiReport.js";
import { JOURNEY_PHASES, type JourneyStep } from "../ui/journeySteps.js";
import { readTrail, type JourneyTrailRecord } from "../ui/trailStore.js";
import { UI_FLOWS } from "../ui/uiFlowRunner.js";

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
  return `<li class="${step.kind}${isHere ? " here" : ""}" title="${escapeHtml(step.raw)}">
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
<title>Procol QA — ${escapeHtml(title)}</title>
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
