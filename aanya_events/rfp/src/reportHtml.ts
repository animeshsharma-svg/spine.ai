/**
 * The report as one self-contained HTML page: no external scripts, readable
 * offline, light or dark to match the reader's system.
 */
import type { ReportCase, ReportModel, ReportStep } from "./reporter.js";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const VERDICT_LABEL = { pass: "Pass", fail: "Fail", "not-run": "Not run" } as const;
const KIND_LABEL = { step: "step", negative: "negative", edge: "edge", security: "security", latency: "latency" } as const;

/**
 * WHAT KIND OF VALIDATION A CHECK IS — read off its name, so a new check lands
 * in the right group without anyone tagging it.
 */
type CheckCat = "status" | "latency" | "contract" | "security" | "count" | "data";
const CAT_LABEL: Record<CheckCat, string> = {
  status: "Status & error validation",
  latency: "Latency",
  contract: "Contract & format",
  security: "Security",
  count: "Lists & counts",
  data: "Data & calculations",
};
const CAT_ORDER: CheckCat[] = ["status", "data", "count", "contract", "latency", "security"];
function catOf(name: string): CheckCat {
  if (/^Status code|^Refused|not 5xx|Error (body|reply)|Access token|ran to the end/i.test(name)) return "status";
  if (/^Responds within|p95|slowest|parallel|at once/i.test(name)) return "latency";
  if (/schema|Content-Type|valid JSON|size under|looks like|is a list/i.test(name)) return "contract";
  if (/SQL|script tag|X-Powered-By|stack trace|owner cannot|cannot be changed/i.test(name)) return "security";
  if (/\bunique\b|\bcount\b|exactly|^One |numbered|^At most|at least one|^No bids|no bids|No chat|^No (rows|products|vendors|templates)|^\d+ |\d+ (line item|vendor|form|evaluator|product|user)|same answer/i.test(name)) return "count";
  return "data";
}

/** The status and the time, on the right, green when they met the case's expectation. */
function callChips(c: ReportCase): string {
  const last = c.calls[c.calls.length - 1];
  if (!last || c.verdict === "not-run") return '<span class="res-chips"></span>';
  const statusChecks = c.checks.filter((k) => catOf(k.name) === "status" && k.name !== "The case ran to the end");
  const timeCheck = c.checks.find((k) => /^Responds within/.test(k.name));
  const limit = timeCheck?.name.match(/(\d+) ms/)?.[1];
  const statusOk = statusChecks.length ? statusChecks.every((k) => k.pass) : last.status >= 200 && last.status < 300;
  const timeOk = timeCheck ? timeCheck.pass : true;
  return (
    `<span class="res-chips"><span class="pill ${statusOk ? "ok" : "bad"}" title="${statusOk ? "the status this case expected" : "not the status this case expected"}">${last.status || "no reply"}</span>` +
    `<span class="pill ${timeOk ? "ok" : "bad"}" title="${limit ? `limit ${limit} ms` : ""}">${ms(last.ms)}</span></span>`
  );
}

function chip(v: ReportCase["verdict"]) {
  return `<span class="chip ${v}">${VERDICT_LABEL[v]}</span>`;
}

function ms(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`;
}

/** A reply as a person reads it: JSON indented, and cut at a sensible length. */
function pretty(text: string): string {
  if (!text) return "(empty reply)";
  try {
    const out = JSON.stringify(JSON.parse(text), null, 2);
    return out.length > 4000 ? out.slice(0, 4000) + "\n… (cut — the full reply is in rfp-run.json)" : out;
  } catch {
    // Not JSON, or cut off at 4000 characters when it was recorded.
    return text.length > 2000 ? text.slice(0, 2000) + "…" : text;
  }
}

function checkList(list: ReportCase["checks"]): string {
  const groups = CAT_ORDER.map((cat) => ({ cat, list: list.filter((x) => catOf(x.name) === cat) })).filter((g) => g.list.length);
  return (
    '<div class="cgrid">' +
    groups
      .map(({ cat, list: l }) => {
        const bad = l.filter((x) => !x.pass).length;
        return (
          `<div class="cgroup"><div class="ch ${bad ? "bad" : ""}">${CAT_LABEL[cat]} <span>${l.length - bad}/${l.length}</span></div><ul>` +
          [...l.filter((x) => !x.pass), ...l.filter((x) => x.pass)]
            .map((x) => `<li class="${x.pass ? "ok" : "bad"}"><span class="mark">${x.pass ? "✓" : "✗"}</span>${esc(x.name)}</li>`)
            .join("") +
          "</ul></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

function callBlock(k: ReportCase["calls"][number], label: string): string {
  const path = k.path.split("?")[0];
  const query = k.path.includes("?") ? k.path.slice(k.path.indexOf("?") + 1) : "";
  return (
    `<div class="call"><div class="call-h"><span class="verb">${esc(k.method)}</span> <code>${esc(path)}</code>` +
    `<span class="pill ${k.status >= 200 && k.status < 400 ? "ok" : "bad"}">${k.status || "no reply"}</span><span class="pill plain">${ms(k.ms)}</span>` +
    `<span class="call-l">${esc(label)}</span></div>` +
    (query ? `<div class="kv"><b>Query</b> <code>${esc(decodeURIComponent(query)).slice(0, 400)}</code></div>` : "") +
    (k.requestBody
      ? `<div class="h small">What was sent</div><pre class="resp">${esc(pretty(k.requestBody))}</pre>`
      : "") +
    `<div class="h small">What came back</div><pre class="resp">${esc(pretty(k.responseText))}</pre>` +
    `<div class="h small">Reproduce it <button class="copy" type="button">Copy curl</button></div><pre class="curl">${esc(k.curl)}</pre></div>`
  );
}

/** A failed check, said the way a person would say it. Falls back to the check's own name. */
function plainFailure(x: ReportCase["checks"][number], c: ReportCase): string {
  const last = c.calls[c.calls.length - 1];
  const got = last?.status;
  let m: RegExpMatchArray | null;
  if (/^Refused with/.test(x.name)) {
    return got && got >= 200 && got < 300
      ? `The app should have refused this request, but it <b>accepted it (${got})</b>.`
      : `The app refused it, but with <b>${got}</b> — not the status expected (${esc(x.name.replace(/^Refused with /, ""))}).`;
  }
  if (/^No server error/.test(x.name)) return `The app <b>crashed with a server error (${got})</b> instead of handling the request.`;
  if ((m = x.name.match(/^Status code is ([\d/]+)/))) return `Expected the app to answer <b>${m[1]}</b>, but it answered <b>${got ?? "nothing"}</b>.`;
  if ((m = x.name.match(/^Responds within (\d+) ms/))) return `<b>Too slow:</b> it took ${last ? ms(last.ms) : "?"}; the limit is ${m[1]} ms.`;
  if (/schema/.test(x.name)) return `The reply is <b>missing a field or has one of the wrong type</b>.`;
  if (x.name === "The case ran to the end") return `The test itself <b>could not finish</b>.`;
  return `<b>${esc(x.name)}</b> — this did not hold.`;
}

/**
 * THE OPEN ROW, for someone seeing the report for the first time.
 *
 * Top-down: the verdict in one sentence, what went wrong (only when something
 * did), then everything else folded away — every check, grouped by what kind
 * of validation it is, and the technical details a developer needs to
 * reproduce it: the request, the reply pretty-printed, and a curl to copy.
 */
function detail(c: ReportCase): string {
  const passed = c.checks.filter((x) => x.pass);
  const failed = c.checks.filter((x) => !x.pass);
  const decisive = c.calls[c.calls.length - 1];
  const parts: string[] = [];

  if (c.verdict === "not-run") {
    parts.push(`<div class="verdict nr"><b>Not run.</b> ${esc(c.reason ?? "")}</div>`);
  } else if (c.verdict === "pass") {
    parts.push(`<div class="verdict ok"><b>✓ Passed.</b> All ${c.checks.length} check${c.checks.length === 1 ? "" : "s"} held — ${esc(c.actual)}</div>`);
  } else {
    parts.push(
      `<div class="verdict bad"><b>✗ Failed.</b> ${failed.length} of ${c.checks.length} checks did not hold. ${esc(c.actual)}</div>` +
        `<div class="wrong"><div class="h">What went wrong</div><ul>` +
        failed
          .map(
            (x) =>
              `<li>${plainFailure(x, c)}${x.critical ? ' <span class="crit">stopped the flow</span>' : ""}` +
              `<div class="d">Check: ${esc(x.name)}${x.detail ? ` — ${esc(x.detail)}` : ""}</div></li>`,
          )
          .join("") +
        "</ul></div>",
    );
  }
  if (c.notes.length) parts.push(`<div class="notes">${c.notes.map((n) => `<p>ℹ︎ ${esc(n)}</p>`).join("")}</div>`);

  if (c.checks.length) {
    parts.push(
      `<details class="fold"${c.verdict === "fail" ? "" : ""}><summary>All ${c.checks.length} checks, by kind — ${passed.length} held${failed.length ? `, ${failed.length} failed` : ""}</summary>` +
        checkList(c.checks) +
        "</details>",
    );
  }
  if (decisive) {
    parts.push(
      `<details class="fold"><summary>Technical details — the request, the reply and a curl${c.calls.length > 1 ? ` (${c.calls.length} calls)` : ""}</summary>` +
        callBlock(decisive, c.calls.length > 1 ? "the call the verdict turns on" : "") +
        (c.calls.length > 1
          ? `<details class="fold inner"><summary>${c.calls.length - 1} earlier call${c.calls.length === 2 ? "" : "s"} in this case</summary>` +
            c.calls
              .slice(0, -1)
              .map((k, i) => callBlock(k, `call ${i + 1}`))
              .join("") +
            "</details>"
          : "") +
        "</details>",
    );
  }
  return parts.join("");
}

/** The app's own words out of a reply, if it said any. */
function appSaid(raw: string): string | null {
  const text = raw.trim();
  try {
    const j = JSON.parse(text);
    const m = j?.error?.message ?? j?.message ?? (typeof j?.error === "string" ? j.error : null) ?? j?.errors?.[0]?.message;
    if (typeof m === "string" && m.trim()) return m.trim();
    if (j?.success === true) return null;
  } catch {
    if (/<title>([^<]+)<\/title>/i.test(text)) return text.match(/<title>([^<]+)<\/title>/i)![1].trim();
  }
  return null;
}

/**
 * "Refused with 422: {json}" → "Refused (422). The app said: “Insufficient parameters”."
 * Rewritten when shown, so reports of older runs read the same way.
 */
function humanActual(c: ReportCase): string {
  const m = c.actual.match(/^(Refused with|Server error|Accepted with) (\d+)(?::| —)?\s*(.*)$/s);
  if (!m) return esc(c.actual);
  const [, kind, code, rest] = m;
  const said = appSaid(rest);
  if (kind === "Server error") return `<b>The app crashed</b> — server error ${code}.`;
  if (kind === "Refused with") return `<b>Refused</b> (${code})${said ? `. The app said: “${esc(said)}”` : ""}.`;
  // Accepted: say what it did, not the raw body.
  const created = rest.match(/created (\S+?)\.?$/);
  const changed = rest.match(/^(\S+) was changed \(status now "([^"]+)"\)/);
  if (created) return `<b>Accepted</b> (${code}) and created ${esc(created[1])}.`;
  if (changed) return `<b>Accepted</b> (${code}) — ${esc(changed[1])} was changed, status now “${esc(changed[2])}”.`;
  if (/"success"\s*:\s*true/.test(rest)) return `<b>Accepted</b> (${code}) — the app replied “success”.`;
  return `<b>Accepted</b> (${code}).`;
}

function row(c: ReportCase, nested: boolean): string {
  return (
    `<details class="row ${c.verdict}${nested ? " nested" : ""}" data-verdict="${c.verdict}">` +
    `<summary><span class="id">${esc(c.id)}</span>` +
    `<span class="what"><span class="plain">${esc(c.plain)}</span>` +
    `${nested ? `<span class="kind ${c.kind}">${KIND_LABEL[c.kind]}</span>` : ""}` +
    `<span class="title">${esc(c.title)}</span></span>` +
    `<span class="exp">${esc(c.expected)}</span>` +
    `<span class="act">${humanActual(c)}</span>` +
    callChips(c) +
    `<span class="res">${chip(c.verdict)}</span></summary>` +
    `<div class="body">${detail(c)}</div></details>`
  );
}

function step(s: ReportStep): string {
  const bad = s.cases.filter((c) => c.verdict === "fail").length;
  const ran = s.cases.filter((c) => c.verdict !== "not-run").length;
  return (
    `<section class="step">${row(s, false)}` +
    (s.cases.length
      ? `<div class="cases"><div class="cases-h">${s.cases.length} case${s.cases.length === 1 ? "" : "s"} thrown at this step` +
        ` · ${ran} ran · ${bad ? `<b class="bad">${bad} failed</b>` : "none failed"}</div>` +
        s.cases.map((c) => row(c, true)).join("") +
        "</div>"
      : "") +
    "</section>"
  );
}

function tally(list: ReportCase[]): string {
  const pass = list.filter((c) => c.verdict === "pass").length;
  const fail = list.filter((c) => c.verdict === "fail").length;
  const nr = list.filter((c) => c.verdict === "not-run").length;
  return `${list.length} case${list.length === 1 ? "" : "s"} · <span class="ok">${pass} passed</span> · ` +
    `<span class="${fail ? "bad" : ""}">${fail} failed</span>${nr ? ` · ${nr} not run` : ""}`;
}

const mins = (sec?: number) => (sec === undefined ? "—" : sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`);
const when = (unix?: number) =>
  unix === undefined ? "—" : new Date(unix * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";

/** Configurable System: what was chosen, what the account is set to, what was picked live, every setting. */
function systemSection(m: ReportModel): string {
  const c = m.config;
  const sys = m.system ?? {};
  const e = m.event;
  const qty = c.quantities || `${c.default_quantity} each${c.qty_mode === "random" ? ` (random ${c.qty_min}–${c.qty_max})` : ""}`;
  const chosen = [
    ["Features ticked", m.parts.join(", ")],
    ["Line items", c.product_uuids ? `${c.product_uuids.split(",").length} named products` : c.num_line_items],
    ["Quantity", qty],
    ["Vendors to invite", c.vendor_uuids ? `${c.vendor_uuids.split(",").length} named vendors` : c.num_vendors],
    ["Template", c.template_uuid ? `by id ${c.template_uuid}` : c.template_name ? `by name “${c.template_name}”` : c.use_template === "true" ? `position ${Number(c.template_index) + 1} in the list` : "none"],
    ["Event type", c.rfx_mode.toUpperCase()],
    ["Stage title", c.stage_title],
    ["Evaluators per line item", c.assign_evaluators === "true" ? `${c.evaluators_per_line_item} (designation “${c.evaluator_designation}”)` : "not assigned"],
    ["Vendor assessment form", c.vendor_assessment_enabled === "true" ? c.vendor_assessment_name : "off"],
    ["Starts", Number(c.bid_start_offset_sec) ? `${c.bid_start_offset_sec} s after the stage is created` : "as soon as it is created"],
    ["Response-time limits", `${c.sla_ms} ms, ${c.sla_heavy_ms} ms for heavy calls`],
    ...(m.scenario ? [["Scenario", m.scenario]] : []),
  ];
  const account = [
    ["Default RFP duration", mins(sys.eventDurationSec)],
    ["Default evaluation window", mins(sys.evaluationDurationSec)],
    ["Closing mode", sys.closingMode ?? "—"],
    ["RFP evaluation mode", sys.rfpEvaluationMode ?? "—"],
    ["Template type for RFP", sys.templateType ?? "—"],
    ["Evaluators available", sys.evaluatorsAvailable ?? "—"],
    ["Terms & conditions attached", sys.termsAndConditions ?? "none"],
  ];
  const picked = [
    ["Event", e.eventGroupUuid ? `${e.eventGroupUuid} — “${e.title ?? ""}” · ${e.published ? "published" : "not published"}` : "—"],
    ["Technical stage", e.tradeUuid ?? "—"],
    ["Template used", e.template === undefined ? "—" : (e.template ?? "none")],
    ["Line items", e.lineItems.length ? e.lineItems.map((l, i) => `${i + 1}. ${l.name} — ${l.quantity} ${l.unit ?? ""}${l.variant ? ` (${l.variant})` : ""}`).join("<br>") : "—"],
    ["Vendors invited", e.vendors.length ? e.vendors.map((v) => esc(v.name ?? v.uuid)).join(", ") : "—"],
    ["Bidding window", sys.timing ? `${when(sys.timing.start)} → ${when(sys.timing.end)}, evaluation closes ${when(sys.timing.extra)}` : "—"],
    ...(e.negativeDraft ? [["Throwaway draft (validations)", e.negativeDraft]] : []),
  ];
  const table = (rows: Array<Array<unknown>>, raw = false) =>
    `<div class="card"><table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${raw ? v : esc(v)}</td></tr>`).join("")}</table></div>`;
  return (
    `<h3>What this run was asked for</h3>${table(chosen)}` +
    `<h3>What the account is set to</h3><p class="sub">Read from the account in step 1.1 and on the way — the run takes these defaults unless told otherwise.</p>${table(account)}` +
    `<h3>What the run picked live</h3>${table(picked, true)}` +
    `<details class="more"><summary>Every setting (${Object.keys(c).length})</summary>${table(Object.entries(c).map(([k, v]) => [k, v || "—"]))}</details>`
  );
}

export function renderHtml(m: ReportModel): string {
  const s = m.summary;
  const e = m.event;
  const rate = s.total - s.notRun ? Math.round((s.passed / (s.total - s.notRun)) * 100) : 0;
  const headline = !e.eventGroupUuid
    ? "The event was not created."
    : e.published
      ? `Published “${esc(e.title)}” (${esc(e.eventGroupUuid)}).`
      : `Created ${esc(e.eventGroupUuid)} but did not publish it.`;
  const testCases: ReportCase[] = m.steps.map(({ cases: _c, ...st }) => st);
  const validations: ReportCase[] = [...m.steps.flatMap((st) => st.cases), ...m.loose];
  const partRow = (name: string, label: string) => {
    const p = m.byPart[name];
    if (!p?.total) return "";
    return `<tr><td>${label}</td><td>${p.total}</td><td class="ok">${p.passed}</td><td class="${p.failed ? "bad" : ""}">${p.failed}</td><td>${p.notRun}</td></tr>`;
  };


  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RFP publish report</title>
<style>
:root{--bg:#f7f7f8;--card:#fff;--ink:#1d1d22;--mute:#6a6a75;--line:#e4e4e9;--ok:#1f7a45;--okbg:#e6f4ec;--bad:#b3261e;--badbg:#fbe9e7;--nr:#6a6a75;--nrbg:#eeeef1;--code:#f2f2f5;--acc:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#141417;--card:#1c1c21;--ink:#ececf1;--mute:#9a9aa6;--line:#2c2c33;--ok:#5fcf8e;--okbg:#17301f;--bad:#ff8a80;--badbg:#3a1a18;--nr:#9a9aa6;--nrbg:#26262c;--code:#111114;--acc:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute)}
.sub{color:var(--mute)}.headline{font-size:16px;margin:12px 0 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.tile b{display:block;font-size:22px}.tile span{color:var(--mute);font-size:12px}
.tile.ok b{color:var(--ok)}.tile.bad b{color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--mute);font-weight:600;font-size:12px}
td.ok{color:var(--ok)}td.bad{color:var(--bad);font-weight:600}
.stop{background:var(--badbg);color:var(--bad);border-radius:8px;padding:10px 12px;margin:12px 0}
.bar{display:flex;gap:14px;align-items:center;margin:8px 0 10px;color:var(--mute);font-size:13px}
.cols{display:grid;grid-template-columns:52px minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) 118px 70px;gap:12px;padding:0 14px 6px;color:var(--mute);font-size:12px;font-weight:600}
.step{margin-bottom:10px}
details.row{background:var(--card);border:1px solid var(--line);border-radius:10px}
details.row>summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:52px minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) 118px 70px;gap:12px;padding:12px 14px;align-items:start}
details.row>summary::-webkit-details-marker{display:none}
details.row.fail{border-left:4px solid var(--bad)}details.row.pass{border-left:4px solid var(--ok)}details.row.not-run{border-left:4px solid var(--line)}
.id{font-weight:700;font-variant-numeric:tabular-nums}.plain{display:block;font-weight:600}.title{display:block;color:var(--mute);font-size:12px}
.exp,.act{font-size:13px;overflow-wrap:anywhere}.what{min-width:0;overflow-wrap:anywhere}.act{color:var(--ink)}details.not-run .act{color:var(--mute)}
.chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700}
.chip.pass{background:var(--okbg);color:var(--ok)}.chip.fail{background:var(--badbg);color:var(--bad)}.chip.not-run{background:var(--nrbg);color:var(--nr)}
.kind{display:inline-block;margin:2px 0;font-size:11px;padding:0 6px;border-radius:4px;background:var(--nrbg);color:var(--mute)}
.kind.security,.kind.latency{color:var(--acc)}
.cases{margin:6px 0 0 26px;border-left:2px dashed var(--line);padding-left:12px}
.cases-h{color:var(--mute);font-size:12px;margin:6px 0}.cases-h .bad{color:var(--bad)}
details.nested{margin-bottom:6px}details.nested>summary{padding:9px 12px}
.body{padding:0 14px 14px 78px}.h{font-weight:600;margin:10px 0 4px}.h.small{font-size:12px;color:var(--mute)}
.checks ul{list-style:none;margin:0;padding:0}.checks li{padding:3px 0}.checks .mark{display:inline-block;width:18px;font-weight:700}
.checks li.ok .mark{color:var(--ok)}.checks li.bad{color:var(--bad)}.checks .d{margin-left:18px;color:var(--mute);font-size:12px;word-break:break-word}
.res-chips{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.pill{display:inline-block;font:600 12px/1.6 ui-monospace,Menlo,monospace;padding:0 8px;border-radius:6px;white-space:nowrap}
.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}
.verdict{border-radius:8px;padding:10px 12px;margin:4px 0 10px;font-size:14px}.verdict.ok{background:var(--okbg)}.verdict.ok b{color:var(--ok)}
.verdict.bad{background:var(--badbg)}.verdict.bad b{color:var(--bad)}.verdict.nr{background:var(--nrbg);color:var(--mute)}
.wrong ul{margin:0;padding-left:18px}.wrong li{margin:6px 0}.wrong .d{color:var(--mute);font-size:12px;word-break:break-word;margin-top:2px}
details.fold{margin:8px 0;border:1px solid var(--line);border-radius:8px;padding:0 12px}
details.fold>summary{cursor:pointer;padding:9px 0;color:var(--acc);font-weight:600;font-size:13px}
details.fold[open]>summary{border-bottom:1px solid var(--line);margin-bottom:8px}
details.fold.inner{border-style:dashed}
.call{margin:8px 0 14px}.call-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}
.call-h .verb{font:700 12px ui-monospace,Menlo,monospace;background:var(--nrbg);padding:1px 7px;border-radius:5px}
.call-h code{font:12px ui-monospace,Menlo,monospace;word-break:break-all}.call-l{color:var(--mute);font-size:12px;margin-left:auto}
.kv{font-size:12px;margin:6px 0;color:var(--mute)}.kv code{color:var(--ink);word-break:break-all}
.pill.plain{background:var(--nrbg);color:var(--ink)}
button.copy{margin-left:8px;font:600 11px inherit;background:var(--card);color:var(--acc);border:1px solid var(--line);border-radius:5px;padding:1px 8px;cursor:pointer}
.howto{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:0 14px;margin:0 0 12px}
.howto>summary{cursor:pointer;padding:10px 0;font-weight:700}.howto ul{margin:0 0 12px;padding-left:18px}.howto li{margin:5px 0;color:var(--ink)}
.cgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px 18px}
.cgroup .ch{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--mute);margin:6px 0 2px}
.cgroup .ch span{font-weight:600;color:var(--ok);margin-left:4px}.cgroup .ch.bad span{color:var(--bad)}
.crit{font-size:11px;background:var(--badbg);color:var(--bad);border-radius:4px;padding:0 5px}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;max-height:320px}
.notes p{margin:4px 0;color:var(--mute)}.why{color:var(--mute)}
h3{font-size:14px;margin:18px 0 8px}
.jump{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--bg);padding:10px 0;margin:18px 0 0;border-bottom:1px solid var(--line)}
.jump a{color:var(--ink);text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-weight:600;font-size:13px}
.jump a b{color:var(--mute);font-weight:600;margin-left:4px}.jump label{margin-left:auto;color:var(--mute);font-size:13px}
section[id]{scroll-margin-top:60px}
.sub .ok{color:var(--ok)}.sub .bad{color:var(--bad);font-weight:600}
.vgroup{font-weight:600;margin:14px 0 6px;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}.vgroup .vtally{margin-left:auto;font-weight:400;color:var(--mute);font-size:12px}
.vgroup .vtally .ok{color:var(--ok)}.vgroup .vtally .bad{color:var(--bad)}
.card th{width:34%;color:var(--mute);font-weight:600;font-size:13px}
@media (max-width:760px){.cols{display:none}details.row>summary{grid-template-columns:44px 1fr 70px}.exp,.act,.res-chips{grid-column:2/3}.res-chips{flex-direction:row}.res{grid-column:3;grid-row:1}.body{padding-left:14px}.cases{margin-left:8px}}
</style></head><body><div class="wrap">
<h1>RFP event publish — test report</h1>
<div class="sub">${esc(new Date(m.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST · ${esc(m.baseUrl)} · ${ms(m.durationMs)}${m.scenario ? ` · scenario ${esc(m.scenario)}` : ""}</div>
<p class="headline">${headline}</p>
${m.stoppedAt ? `<div class="stop"><b>The publish flow stopped at step ${esc(m.stoppedAt.at)}.</b> ${esc(m.stoppedAt.reason)} Every step after it needs what that one should have produced, so they did not run — they are untested, not failed.</div>` : ""}
<div class="tiles">
<div class="tile"><b>${s.total}</b><span>cases</span></div>
<div class="tile ok"><b>${s.passed}</b><span>passed</span></div>
<div class="tile ${s.failed ? "bad" : ""}"><b>${s.failed}</b><span>failed</span></div>
<div class="tile"><b>${s.notRun}</b><span>not run</span></div>
<div class="tile"><b>${rate}%</b><span>pass rate of what ran</span></div>
<div class="tile ${s.checksFailed ? "bad" : ""}"><b>${s.checks - s.checksFailed}/${s.checks}</b><span>checks held</span></div>
</div>
<details class="howto" open><summary>How to read this report</summary>
<ul>
<li><b>Each row is one step or one test.</b> Read it left to right: what it does, what should happen, what actually happened, then the verdict.</li>
<li><b>The two chips on the right</b> are the HTTP status and the response time. <span class="pill ok">green</span> means it was what the test expected (and inside the time limit); <span class="pill bad">red</span> means it was not.</li>
<li><b>Click a row</b> to see why it passed or failed. The checks and the technical details (request, reply, a curl to reproduce it) are folded underneath.</li>
<li><b>Three sections:</b> <b>Test Cases</b> is the journey itself; <b>Validations</b> is every broken input thrown at it, under the step it attacks; <b>Configurable System</b> is what this run was set up with.</li>
</ul>
</details>
<div class="card"><table><tr><th>Part</th><th>Cases</th><th>Passed</th><th>Failed</th><th>Not run</th></tr>
${partRow("publish", "Publish flow (1.1–1.10)")}${partRow("verify", "Post-publish verification (2.1–2.10)")}${partRow("negative", "Negative &amp; edge cases (3.x)")}${partRow("surrogate", "Surrogate bid (4.x) and its validations (5.x)")}</table></div>

<nav class="jump">
<a href="#test-cases">Test Cases <b>${testCases.length}</b></a>
<a href="#validations">Validations <b>${validations.length}</b></a>
<a href="#system">Configurable System</a>
<label><input type="checkbox" id="only-bad"> show only what failed</label>
</nav>

<section id="test-cases">
<h2>Test Cases</h2>
<p class="sub">The journey: the publish flow and the read-backs of what it published, in the order they ran. ${tally(testCases)}</p>
<div class="cols"><span>#</span><span>Step</span><span>Expected</span><span>Actual</span><span>Status · time</span><span>Result</span></div>
${testCases.map((c) => `<section class="step">${row(c, false)}</section>`).join("")}
</section>

<section id="validations">
<h2>Validations</h2>
<p class="sub">Every negative, edge and security case, under the step of the journey it attacks. ${tally(validations)}</p>
${
  validations.length
    ? m.steps
        .filter((st) => st.cases.length)
        .map(
          (st) =>
            `<section class="step"><div class="vgroup"><span class="id">${esc(st.id)}</span> ${esc(st.plain)}<span class="vtally">${tally(st.cases)}</span></div>` +
            st.cases.map((c) => row(c, true)).join("") +
            "</section>",
        )
        .join("") + (m.loose.length ? `<section class="step"><div class="vgroup">Other cases</div>${m.loose.map((c) => row(c, true)).join("")}</section>` : "")
    : '<p class="sub">No validation cases were part of this run.</p>'
}
</section>

<section id="system">
<h2>Configurable System</h2>
${systemSection(m)}
</section>
<p class="sub">Curls leave the token as $ACCESS_TOKEN / $LIGHTSPEED_TOKEN — export your own before pasting one.</p>
</div>
<script>
document.addEventListener('click', function (ev) {
  var b = ev.target.closest && ev.target.closest('button.copy');
  if (!b) return;
  var pre = b.parentElement.nextElementSibling;
  var text = pre ? pre.textContent : '';
  var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy curl'; }, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
});
document.getElementById('only-bad').addEventListener('change', function (ev) {
  var on = ev.target.checked;
  document.querySelectorAll('details.row').forEach(function (d) { d.style.display = on && d.dataset.verdict !== 'fail' ? 'none' : ''; });
  document.querySelectorAll('section.step').forEach(function (sec) {
    sec.style.display = on && !sec.querySelector('[data-verdict="fail"]') ? 'none' : '';
  });
});
</script>
</body></html>`;
}
