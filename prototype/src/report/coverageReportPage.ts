/**
 * THE COVERAGE REPORT — one light, shareable page (like simpleReport.ts):
 * the headline, module by module, then the sourcing-event submodules in API
 * and UI, what it takes to reach the target, and how every number is counted.
 * Numbers come from coverage.ts; nothing here is estimated.
 */
import { escapeHtml } from "./shared.js";
import type { Bucket, CoverageReport, Tally } from "./coverage.js";

const CSS = `
:root { color-scheme: light; --ink:#1f2328; --muted:#5f6b76; --line:#e4e7eb; --soft:#f6f7f9; --bg:#fff;
  --ok:#1a7f37; --ok-bg:#e7f5ec; --bad:#b42318; --bad-bg:#fdeceb; --warn:#8a5a00; --warn-bg:#fff5db; --warn-line:#f1dca2;
  --c-pass:#2da44e; --c-fail:#d1242f; --c-ready:#8fb8ef; --c-none:#dfe3e8; --c-manual:#f1f3f5; --accent:#1d4ed8; }
* { box-sizing: border-box; }
html, body { background: var(--bg); }
body { margin: 0; color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.wrap { max-width: 1060px; margin: 0 auto; padding: 32px 24px 40px; }
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.kind { margin: 0 0 4px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
h1 { margin: 0; font-size: 24px; line-height: 1.3; }
.meta { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
.print { flex: none; border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 8px; padding: 7px 12px; font: 500 13px inherit; cursor: pointer; }
.verdict { margin: 22px 0 8px; padding: 14px 16px; border: 1px solid var(--warn-line); background: var(--warn-bg); border-radius: 10px; }
.verdict b { display: block; font-size: 16px; color: var(--warn); }
h2 { font-size: 17px; margin: 32px 0 6px; }
p.sub { margin: 0 0 12px; color: var(--muted); font-size: 13.5px; }
.donuts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
.dcard { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: flex; gap: 14px; align-items: center; }
.dcard h3 { margin: 0 0 4px; font-size: 14.5px; }
.dcard .nums { font-size: 13px; color: var(--muted); line-height: 1.5; }
.dcard .nums b { color: var(--ink); font-weight: 600; }
.target { font-size: 12.5px; margin-top: 4px; }
.target.miss { color: var(--bad); } .target.met { color: var(--ok); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--soft); }
td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td .of { display: block; font-size: 12px; color: var(--muted); }
td.name b { font-weight: 600; }
td.name .note { display: block; font-size: 12px; color: var(--muted); }
tr.roll td { background: #fbfcfd; }
.pc { font-weight: 600; font-variant-numeric: tabular-nums; }
.pc.low { color: var(--bad); } .pc.mid { color: var(--warn); } .pc.high { color: var(--ok); }
.bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--c-none); min-width: 160px; }
.bar span { display: block; height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--muted); margin: 8px 0 0; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 12px; padding: 1px 7px; border-radius: 6px; border: 1px solid var(--line); white-space: nowrap; }
.chip.ok { color: var(--ok); border-color: #b9e0c5; } .chip.bad { color: var(--bad); border-color: #f4c7c3; }
.miss { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
.miss li { margin: 2px 0; }
.tag { font-size: 11.5px; padding: 0 6px; border-radius: 5px; background: var(--soft); color: var(--muted); margin-left: 4px; white-space: nowrap; }
.tag.ready { background: #e8f0fe; color: #1d4ed8; }
details { margin-top: 4px; } summary { cursor: pointer; color: var(--accent); font-size: 13px; }
ul.how { margin: 6px 0; padding-left: 20px; font-size: 14px; } ul.how li { margin: 4px 0; }
.foot { margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
@media (max-width: 760px) { .donuts { grid-template-columns: 1fr; } .wrap { padding: 20px 16px; } .bar { min-width: 90px; } table { font-size: 13px; } th, td { padding: 7px 6px; } }
@media print { .print, summary { display: none !important; } details { display: block; } details > * { display: block; } .wrap { padding: 0; max-width: none; } tr { break-inside: avoid; } }
`;

const pct = (a: number, b: number) => (b ? a / b : null);
const fmtPct = (x: number | null) => (x === null ? "—" : `${(Math.round(x * 1000) / 10).toFixed(1)}%`);
const num = (n: number) => n.toLocaleString("en-IN");
const level = (x: number | null) => (x === null ? "" : x >= 0.8 ? "high" : x >= 0.4 ? "mid" : "low");
const cov = (t: Tally) => pct(t.ran, t.automatable);

/** A donut: the ran share, split into passing and failing. */
function donut(t: Tally, size = 96): string {
  const r = 38;
  const c = 2 * Math.PI * r;
  const total = t.automatable || 1;
  const pass = (t.pass / total) * c;
  const fail = ((t.ran - t.pass) / total) * c;
  const ready = (Math.max(0, t.automated - t.ran) / total) * c;
  const p = cov(t);
  const seg = (len: number, off: number, color: string) =>
    len > 0 ? `<circle r="${r}" cx="50" cy="50" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>` : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${fmtPct(p)} covered">
<circle r="${r}" cx="50" cy="50" fill="none" stroke="var(--c-none)" stroke-width="14"/>
${seg(pass, 0, "var(--c-pass)")}${seg(fail, pass, "var(--c-fail)")}${seg(ready, pass + fail, "var(--c-ready)")}
<text x="50" y="55" text-anchor="middle" font-size="17" font-weight="700" fill="#1f2328">${fmtPct(p)}</text></svg>`;
}

/** A bar of the cases meant for automation: passing · failing · can run, not run yet · no runner yet. */
function bar(t: Tally): string {
  const total = t.automatable || 1;
  const w = (n: number) => `${(100 * n) / total}%`;
  const failing = t.ran - t.pass;
  const ready = Math.max(0, t.automated - t.ran);
  return `<div class="bar" title="${num(t.pass)} passing · ${num(failing)} failing · ${num(ready)} can run but have not · ${num(t.automatable - t.automated)} no runner yet">` +
    `<span style="width:${w(t.pass)};background:var(--c-pass)"></span><span style="width:${w(failing)};background:var(--c-fail)"></span>` +
    `<span style="width:${w(ready)};background:var(--c-ready)"></span></div>`;
}
const LEGEND = `<div class="legend"><span><i style="background:var(--c-pass)"></i>ran, passing</span><span><i style="background:var(--c-fail)"></i>ran, failing</span><span><i style="background:var(--c-ready)"></i>can run today, has not run</span><span><i style="background:var(--c-none)"></i>no runner yet</span></div>`;

function cell(t: Tally): string {
  if (!t.automatable) return `<td class="n"><span class="pc">—</span><span class="of">no cases</span></td>`;
  const p = cov(t);
  return `<td class="n"><span class="pc ${level(p)}">${fmtPct(p)}</span><span class="of">${num(t.ran)} of ${num(t.automatable)}</span></td>`;
}

function card(b: Bucket, title: string, target?: number): string {
  const p = cov(b.both);
  const tgt = target
    ? `<div class="target ${p !== null && p >= target ? "met" : "miss"}">Target ${Math.round(target * 100)}%: ${p !== null && p >= target ? "met" : `${num(Math.max(0, Math.ceil(target * b.both.automatable) - b.both.ran))} more cases need a run`}</div>`
    : "";
  return `<div class="dcard">${donut(b.both)}<div><h3>${escapeHtml(title)}</h3><div class="nums">API <b>${fmtPct(cov(b.api))}</b> · UI <b>${fmtPct(cov(b.ui))}</b><br>${num(b.both.ran)} of ${num(b.both.automatable)} cases have run · ${num(b.both.manual)} are for a person</div>${tgt}</div></div>`;
}

function journeysCell(b: Bucket): string {
  const m = b.mainFlow;
  const words = m.ran < m.total ? `${m.ran} of ${m.total} step${m.total === 1 ? "" : "s"} ran, ${m.pass} pass` : `${m.pass} of ${m.total} step${m.total === 1 ? "" : "s"} pass`;
  const mf = m.total ? `<div class="chip ${m.pass === m.total ? "ok" : m.ran ? "" : "bad"}" title="${escapeHtml(m.steps.map((s) => `${s.title}: ${s.last ?? "not run"}`).join(" · "))}">API journey: ${words}</div>` : "";
  const js = b.journeys.map((j) => `<span class="chip ${j.last === "pass" ? "ok" : "bad"}" title="last ${j.last ?? "?"}${j.lastAt ? ` on ${j.lastAt.slice(0, 10)}` : ""}">${escapeHtml(j.key)} · ${j.runs} run${j.runs === 1 ? "" : "s"}, ${j.passed} passed</span>`).join("");
  return `<td><div class="chips">${mf}${js || (mf ? "" : `<span class="tag">none</span>`)}</div></td>`;
}

export function renderCoverageReport(r: CoverageReport): string {
  const when = new Date(r.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  const ev = r.events;
  const evP = cov(ev.both);
  const need = Math.max(0, Math.ceil(r.target * ev.both.automatable) - ev.both.ran);
  const ready = Math.max(0, ev.both.automated - ev.both.ran);
  const ifAllRan = pct(ev.both.automated, ev.both.automatable);

  const verdict = `<div class="verdict"><b>Sourcing events: ${fmtPct(evP)} covered — the target is ${Math.round(r.target * 100)}%</b>
${num(ev.both.ran)} of the ${num(ev.both.automatable)} event cases meant for automation have run (API ${fmtPct(cov(ev.api))}, UI ${fmtPct(cov(ev.ui))}).
${num(need)} more need a run to reach ${Math.round(r.target * 100)}%. ${num(ready)} of them can run today and simply have not; running everything that can run today would give ${fmtPct(ifAllRan)}. The rest need a runner first.</div>`;

  const moduleRows = r.modules
    .map((m) => `<tr><td class="name"><b>${escapeHtml(m.label)}</b><span class="note">${num(m.both.automatable)} cases for automation · ${num(m.both.manual)} for a person</span></td>${cell(m.api)}${cell(m.ui)}${cell(m.both)}<td>${bar(m.both)}</td></tr>`)
    .join("");
  const p2p = r.p2pFlow;
  const p2pRow = `<tr class="roll"><td class="name"><b>${escapeHtml(p2p.label)}</b><span class="note">Purchase orders + delivery & receiving + finance, together</span></td>${cell(p2p.api)}${cell(p2p.ui)}${cell(p2p.both)}<td>${bar(p2p.both)}</td></tr>`;
  const all = r.platform;
  const allRow = `<tr class="roll"><td class="name"><b>Whole platform</b></td>${cell(all.api)}${cell(all.ui)}${cell(all.both)}<td>${bar(all.both)}</td></tr>`;

  const subRows = r.eventSubmodules
    .map((s) => {
      const gap = Math.max(0, Math.ceil(r.target * s.both.automatable) - s.both.ran);
      return `<tr><td class="name"><b>${escapeHtml(s.label)}</b><span class="note">${num(s.both.automatable)} for automation · ${num(s.both.manual)} for a person</span></td>${cell(s.api)}${cell(s.ui)}${cell(s.both)}<td>${bar(s.both)}</td>${journeysCell(s)}<td class="n">${gap ? num(gap) : "✓"}</td></tr>`;
    })
    .join("");

  const next = r.eventSubmodules
    .filter((s) => s.missing?.length)
    .map(
      (s) =>
        `<details><summary>${escapeHtml(s.label)} — ${num(Math.max(0, Math.ceil(r.target * s.both.automatable) - s.both.ran))} more to reach ${Math.round(r.target * 100)}%; ${num(Math.max(0, s.both.automated - s.both.ran))} can run today</summary><ol class="miss">${s
          .missing!.map(
            (m) =>
              `<li><b>${escapeHtml(m.id)}</b> ${escapeHtml(m.title)} <span class="tag">${m.layer.toUpperCase()} · ${escapeHtml(m.priority)}</span>${m.automated ? `<span class="tag ready">can run today</span>` : `<span class="tag">needs a runner</span>`}</li>`,
          )
          .join("")}</ol></details>`,
    )
    .join("");

  const fc = ev.fieldChecks;
  const body = `${verdict}
<div class="donuts">${card(all, "Whole platform")}${card(ev, "Sourcing events (RFx)", r.target)}${card(p2p, "P2P flow (PO → payment)")}</div>
${LEGEND}

<h2>Coverage by module</h2>
<p class="sub">The share of each module's cases meant for automation that have run — API and UI apart, then together.</p>
<table><thead><tr><th>Module</th><th class="n">API</th><th class="n">UI</th><th class="n">Both</th><th>Cases for automation</th></tr></thead><tbody>${moduleRows}${p2pRow}${allRow}</tbody></table>

<h2>Sourcing events, by submodule</h2>
<p class="sub">"Main flow" is the API journey's own steps in that area, and the browser journeys that drive it — how often they ran and how often they passed. "To ${Math.round(r.target * 100)}%" is how many more cases need a run.</p>
<table><thead><tr><th>Submodule</th><th class="n">API</th><th class="n">UI</th><th class="n">Both</th><th>Cases for automation</th><th>Main flow</th><th class="n">To ${Math.round(r.target * 100)}%</th></tr></thead><tbody>${subRows}</tbody></table>

<h2>What gets sourcing events to ${Math.round(r.target * 100)}%</h2>
<p class="sub">Per submodule, the most important cases that have not run yet (P0 first). "Can run today" means a runner exists and only a run is missing; "needs a runner" means the platform cannot send it yet.</p>
${next}

<h2>Field checks on every journey reply</h2>
<p class="sub">Every reply of the API journey is checked field by field — status, time, schema, data. They are counted apart, so they do not inflate case coverage: <b>${num(fc.ran)}</b> of ${num(fc.total)} have run, ${num(fc.pass)} passing, ${num(fc.fail)} failing.</p>

<h2>How this is counted</h2>
<ul class="how">
<li><b>A case</b> is one written test: every case of the test catalogue, plus each API library case that no catalogue case already stands for.</li>
<li><b>Covered</b> means a saved run gave the case a pass or a fail at least once. A failing case is covered — it was tested and found wanting. "Couldn't tell" does not count.</li>
<li><b>Coverage %</b> = cases that ran ÷ cases meant for automation. Cases the catalogue marks for a person are left out of the % and shown apart.</li>
<li><b>API</b> results come from the API runs, the bidding matrix and the UI-vs-API cross-check; <b>UI</b> results from the browser journeys — a screen case that a journey covers counts as run when that journey ran. A screen case the browser compiles from its text at run time counts only once a run of it is linked to the case.</li>
<li><b>Compiled API plans</b> count only when the plan checks what the case is about. A plan the compiler could build only in part — it expects another outcome than the case, checks only that the app does not crash where the case wants a refusal, or needs a user or a starting state no run builds — may run, but is not counted${r.platform.both.partly ? `: <b>${num(r.platform.both.partly)}</b> cases ran that way and are left out` : ""}.</li>
<li><b>Field checks</b> (one per field of every journey reply) are shown apart. Each journey step's own "it succeeds" check counts as that step's main-flow case.</li>
<li>History: ${escapeHtml(r.history)} — ${num(r.runsCounted.api)} API runs and ${num(r.runsCounted.browser)} browser journey runs.${r.unassigned ? ` ${num(r.unassigned)} cases could not be placed in a module and are left out.` : " Every case was placed in a module."}</li>
</ul>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light">
<title>Test coverage · spine.ai</title><style>${CSS}</style></head><body><main class="wrap">
<div class="top"><div><p class="kind">Coverage report</p><h1>Test coverage</h1><p class="meta">${escapeHtml(when)} IST · counted from what ran, not from what is written</p></div>
<button class="print" onclick="window.print()">Print / Save as PDF</button></div>
${body}
<footer class="foot">spine.ai · coverage counted ${escapeHtml(when)} IST · refreshed every 10 minutes (<a href="?fresh=1">count again now</a>)</footer>
</main></body></html>`;
}
