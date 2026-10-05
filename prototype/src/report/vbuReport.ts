/**
 * VENDOR BULK UPLOAD — the detail a developer needs, inside the test report.
 *
 * For each bulk case the runner leaves an evidence record
 * (data/evidence/<run stamp>/<case>.json, schema "vbu.evidence.v1", see
 * src/checks/vendorBulkExtras.ts). This module turns it into:
 *
 *   • an evidence block under the case — the sheet exactly as uploaded (with a
 *     link to download the very .xlsx), what each staged row became, the vendor
 *     / mapping / invitation records it created, and the bug it reproduces with
 *     its cause, code location and suggested fix;
 *   • a "QA doc vs results" table — the PR's QA document case by case;
 *   • a "Bugs this run reproduced" table.
 *
 * Everything is read from files the run wrote; nothing here calls Procol.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CheckResult } from "../ai/types.js";
import type { TestCaseRecord } from "../checks/caseLibrary.js";
import { bugForCase, readEvidence, vbuBugs, type VbuEvidence } from "../checks/vendorBulkExtras.js";
import { displayCase } from "../checks/caseDisplay.js";
import { escapeHtml, humanText, renderTechFold } from "./shared.js";
import { bugDetail, seenFromEvidence, shownLine, TRIPWIRE_NOTE, usesTripwire } from "./vbuBugDetail.js";

const here = dirname(fileURLToPath(import.meta.url));
const QA_DOC_FILE = join(here, "..", "..", "config", "vbuQaDoc.json");

const e = (v: unknown) => escapeHtml(v === null || v === undefined ? "" : String(v));
const TAB: Record<string, string> = {
  active: "Vendors", invited: "Prospects", rejected: "Rejected", onboarding_in_progress: "Onboarding in progress", blacklisted: "Blacklisted",
};

export const VBU_CSS = `
  details.evidence{margin:12px 0 2px;border:1px solid var(--line,#e2e2e2);border-radius:10px;padding:0 14px;background:var(--card2,rgba(127,127,127,.04))}
  details.evidence>summary{cursor:pointer;padding:10px 0;font-weight:600}
  .ev-meta{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12.5px;opacity:.85;margin:2px 0 10px}
  .ev-meta b{font-weight:600}
  .ev-h{margin:14px 0 6px;font-size:13px;font-weight:600}
  .ev-wrap{overflow-x:auto;max-width:100%}
  table.ev-t{border-collapse:collapse;font-size:12px;min-width:100%}
  table.ev-t th,table.ev-t td{border:1px solid var(--line,#e2e2e2);padding:4px 7px;text-align:left;vertical-align:top;white-space:nowrap}
  table.ev-t th{background:rgba(127,127,127,.08);font-weight:600}
  table.ev-t td.wrap{white-space:normal;min-width:220px}
  table.ev-t tr.bad td{background:rgba(220,38,38,.06)}
  table.ev-t tr.ok td{background:rgba(22,163,74,.05)}
  .ev-dl{display:inline-block;margin:6px 10px 2px 0;font-size:12.5px;padding:4px 10px;border:1px solid currentColor;border-radius:999px;text-decoration:none}
  .ev-bug{margin:12px 0;padding:10px 12px;border-left:4px solid #dc2626;background:rgba(220,38,38,.05);border-radius:6px;font-size:13px}
  .ev-bug.sus{border-left-color:#d97706;background:rgba(217,119,6,.06)}
  .ev-bug p{margin:4px 0}
  .ev-bug ul.ev-list{margin:2px 0 6px 18px;padding:0}
  .ev-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
  section.vbu{margin:18px 0}
  section.vbu h2{margin-bottom:6px}
`;

function table(headers: string[], rows: string[][], rowCls: string[] = []): string {
  return `<div class="ev-wrap"><table class="ev-t"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r, i) => `<tr class="${rowCls[i] ?? ""}">${r.join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}
const td = (v: unknown, cls = "") => `<td class="${cls}">${e(v)}</td>`;

/** The bug a failing case reproduces — the live registry first, so a bug filed after the run still shows. */
function caseBug(ev: VbuEvidence) {
  if (ev.verdict.pass || ev.verdict.inconclusive) return undefined;
  return bugForCase(ev.caseId) ?? ev.bug;
}

function bugBox(ev: VbuEvidence): string {
  const b = caseBug(ev);
  if (!b) return "";
  const d = bugDetail(b.id);
  const seen = shownLine(seenFromEvidence(ev));
  return `<div class="ev-bug ${b.status === "SUSPECTED" ? "sus" : ""}">
    <p><b>${e(b.id)} · ${e(b.severity)}${b.status === "SUSPECTED" ? " · suspected from the code" : ""}</b> — ${e(b.title)}${d ? ` <span style="opacity:.75">(${e(d.area)})</span>` : ""}</p>
    ${d ? `<p><b>What the buyer does:</b> ${e(d.scenario)}</p>
    <p><b>What should happen:</b></p><ul class="ev-list">${d.expected.map((x) => `<li>${e(x)}</li>`).join("")}</ul>
    <p><b>What happens instead:</b> ${e(d.actual)}</p>
    <p><b>What the buyer sees:</b> ${e(d.sees)}</p>
    ${seen ? `<p><b>In this run:</b> ${e(seen)}</p>` : ""}
    ${usesTripwire(ev) ? `<p style="opacity:.8"><i>${e(TRIPWIRE_NOTE)}</i></p>` : ""}
    <p><b>Why it matters:</b> ${e(d.impact)}</p>` : ""}
    <p><b>Why it happens:</b> ${e(b.cause)}</p>
    <p><b>Where:</b> <span class="ev-mono">${e(b.where)}</span></p>
    <p><b>Suggested fix:</b> ${e(b.fix)}</p>
  </div>`;
}

/** The evidence block under one case, or "" when the case left none. */
export function renderEvidence(result: CheckResult | undefined, test: TestCaseRecord): string {
  const ref = (result as { evidenceRef?: string } | undefined)?.evidenceRef;
  if (!ref) return "";
  const ev = readEvidence(ref);
  if (!ev) return "";
  const dl = (which: string, label: string) => `<a class="ev-dl" href="/api/vbu/sheet?e=${encodeURIComponent(ref)}&which=${which}">${e(label)}</a>`;
  const parts: string[] = [];

  parts.push(`<div class="ev-meta">
    <span><b>Sent as:</b> ${e(ev.actor)}</span>
    <span><b>Workspace:</b> ${e(ev.companyId)}</span>
    ${ev.job?.jobIds?.length ? `<span><b>Job id${ev.job.jobIds.length > 1 ? "s" : ""}:</b> ${e(ev.job.jobIds.join(", "))}</span>` : ""}
    ${ev.job ? `<span><b>Rows staged:</b> ${e(ev.job.staged)}</span><span><b>Waited:</b> ${e(Math.round((ev.job.waitedMs ?? 0) / 1000))} s</span>` : ""}
    ${ev.http ? `<span><b>HTTP:</b> ${e(ev.http.status)}${ev.http.message ? ` · ${e(ev.http.message)}` : ""}</span>` : ""}
    <span><b>Test data:</b> ${e(ev.tier === "safe" ? "creates nothing" : ev.tier === "creates" ? "creates QA_Platform_ test vendors" : "creates a Prospect (emails the vendor-management team)")}</span>
    ${ev.qaDoc?.length ? `<span><b>QA doc:</b> ${e(ev.qaDoc.join(", "))}</span>` : ""}
  </div>`);

  if (ev.sheet?.headers.length) {
    parts.push(`<div class="ev-h">The sheet that was uploaded <span style="font-weight:400;opacity:.75">(row 3 column names that hold a value; vendors from row 4)</span></div>`);
    parts.push(table(["Row", ...ev.sheet.headers], ev.sheet.rows.slice(0, 12).map((r, i) => [td(i + 4), ...r.map((c) => td(c))])));
    if (ev.sheet.rows.length > 12) parts.push(`<p class="pre">…and ${ev.sheet.rows.length - 12} more row(s) in the file.</p>`);
  }
  if (ev.fixture) {
    parts.push(`<div>${dl("main", `Download the exact file sent (${ev.fixture.file.replace(/\.(\w+)$/, "-uploaded.$1")})`)}${ev.fixture.file2 ? dl("second", "Download the second sheet") : ""}</div>`);
  }
  if (ev.request?.body && !ev.fixture) {
    parts.push(`<div class="ev-h">The request that was sent</div><pre class="ev-mono">${e(JSON.stringify(ev.request.body, null, 2))}</pre>`);
  } else if (ev.request?.body && (ev.request.body as any).configurations) {
    parts.push(`<div class="ev-h">Sent beside the sheet</div><pre class="ev-mono">${e(JSON.stringify((ev.request.body as any).configurations, null, 2))}</pre>`);
  }

  if (ev.rows?.length) {
    // Only the values the upload CHANGED on the way in (e.g. "Plot No. 100" →
    // "Plot No. 1"); repeating every column the sheet already shows is noise.
    const sent = (rowIdx: number, col: string) => {
      const i = ev.sheet?.headers.indexOf(col) ?? -1;
      return i >= 0 ? ev.sheet!.rows[rowIdx]?.[i] ?? "" : undefined;
    };
    const cols = Object.keys(ev.rows[0].parsed ?? {}).filter((c) =>
      ev.rows!.some((r, i) => { const s0 = sent(i, c); return s0 !== undefined && String(r.parsed?.[c] ?? "") !== String(s0); }),
    ).slice(0, 6);
    parts.push(`<div class="ev-h">What each row became${cols.length ? " — and what the upload changed" : ""}</div>`);
    parts.push(
      table(
        ["Row", "Job", "Status", "Error", ...cols.map((c) => `stored ${c}`)],
        ev.rows.map((r) => [td(r.rowNo), td(r.jobId), td(r.status), td(r.error ?? "—", "wrap"), ...cols.map((c) => td(r.parsed?.[c] ?? ""))]),
        ev.rows.map((r) => (r.status === "success" ? "ok" : r.status === "failed" ? "bad" : "")),
      ),
    );
    parts.push(`<p class="pre">${cols.length ? "“stored” columns show the value the upload kept where it differs from the sheet." : "Every stored value matches the sheet."}</p>`);
  }
  const re = (ev as any).reupload;
  if (re) {
    parts.push(`<div class="ev-h">After uploading the error sheet back</div>`);
    parts.push(table(["Job", "Status", "Error"], (re.rows ?? []).map((r: any) => [td(r.jobId), td(r.status), td(r.error ?? "—", "wrap")])));
  }

  if (ev.records?.length) {
    parts.push(`<div class="ev-h">What the rows created (read from the database)</div>`);
    parts.push(
      table(
        ["Company id", "Name", "Tab", "City", "Tax no.", "PAN", "Address", "Pincode", "Account group", "Invitations"],
        ev.records.map((r) => [
          td(r.companyId), td(r.name), td(TAB[r.bscm ?? ""] ?? r.bscm), td(r.city ? `${r.city} (${r.cityId})` : `none (city_id ${r.cityId ?? "null"})`),
          td(r.gstNo), td(r.panNo), td(r.address), td((r.misc as any)?.pincode), td((r.misc as any)?.account_group),
          td(r.invitations.length ? r.invitations.map((i) => `${i.inviteType} ${i.status}${i.skipVendorOnboarding ? " · skip onboarding" : ""}${i.isSubsidiary ? " · subsidiary" : ""}`).join("; ") : "none — so no mail", "wrap"),
        ]),
      ),
    );
  } else if (ev.fixture && ev.tier !== "safe") {
    parts.push(`<p class="pre">No vendor was created by these rows.</p>`);
  }

  parts.push(bugBox(ev));
  if (ev.rule) parts.push(`<p class="pre"><b>Rule in the code:</b> <span class="ev-mono">${e(ev.rule)}</span></p>`);
  if (test.disagree) parts.push(`<p class="pre"><b>Spec vs code:</b> ${e(test.disagree)}</p>`);

  return `<details class="evidence"${ev.verdict.pass ? "" : " open"}><summary>Evidence — sheet, rows, records${caseBug(ev) ? `, ${e(caseBug(ev)!.id)}` : ""}</summary>${parts.join("\n")}</details>`;
}

// ── page-level sections ──────────────────────────────────────────────────

type Row = { test: TestCaseRecord; result?: CheckResult; verdict: string };
const PILL: Record<string, string> = { pass: "Passed", fail: "Failed", inconclusive: "Couldn't tell", notrun: "Not run" };

/** The PR's QA document, case by case, against this run. */
export function renderQaDocSection(rows: Row[]): string {
  if (!rows.some((r) => r.test.bulk) || !existsSync(QA_DOC_FILE)) return "";
  let doc: Record<string, { what: string; cases: string[] }>;
  try {
    doc = JSON.parse(readFileSync(QA_DOC_FILE, "utf8"));
  } catch {
    return "";
  }
  const byId = new Map(rows.map((r) => [r.test.id, r]));
  const tally: Record<string, number> = {};
  const lines = Object.entries(doc).map(([qa, v]) => {
    const got = v.cases.map((c) => byId.get(c)).filter(Boolean) as Row[];
    const verdicts = got.map((r) => r.verdict);
    const overall = !got.length || verdicts.every((x) => x === "notrun") ? "notrun"
      : verdicts.includes("fail") ? "fail"
      : verdicts.every((x) => x === "pass" || x === "notrun") && verdicts.includes("pass") ? (verdicts.includes("notrun") ? "partly" : "pass")
      : "inconclusive";
    tally[overall] = (tally[overall] ?? 0) + 1;
    const label = overall === "partly" ? "Partly" : PILL[overall];
    const counts = new Map<string, number>();
    for (const r of got) counts.set(PILL[r.verdict] ?? r.verdict, (counts.get(PILL[r.verdict] ?? r.verdict) ?? 0) + 1);
    const inWords = [...counts].map(([w, n]) => `${n} ${w.toLowerCase()}`).join(" · ") || "none run";
    return [td(qa), td(humanText(v.what), "wrap"), `<td><b>${e(label)}</b></td>`,
      `<td class="wrap">${e(`${got.length || v.cases.length} test case${(got.length || v.cases.length) === 1 ? "" : "s"}: ${inWords}`)}${renderTechFold(
        [{ label: "Cases", value: got.map((r) => `${r.test.id}: ${PILL[r.verdict] ?? r.verdict}`).join(" · ") || v.cases.join(", ") }],
        "",
        "Details",
      )}</td>`];
  });
  const cls = Object.entries(doc).map(([, v]) => {
    const vs = v.cases.map((c) => byId.get(c)?.verdict);
    return vs.includes("fail") ? "bad" : vs.length && vs.every((x) => x === "pass") ? "ok" : "";
  });
  const summary = Object.entries(tally).map(([k, n]) => `${n} ${(k === "partly" ? "partly" : PILL[k]).toLowerCase()}`).join(" · ");
  return `<section class="card vbu" id="vbu-qadoc">
    <h2>Against the QA document</h2>
    <p class="lede">The PR's QA document ("Vendor bulk upload + dedup — QA test cases"), case by case, against this run: ${e(summary)}.</p>
    ${table(["QA doc", "What it checks", "Result", "Our cases"], lines, cls)}
  </section>`;
}

/** The bugs this run reproduced, grouped, with where to look. */
export function renderBugsSection(rows: Row[]): string {
  const failing = rows.filter((r) => r.test.bulk && r.verdict === "fail");
  if (!failing.length) return "";
  const byBug = new Map<string, Row[]>();
  for (const r of failing) {
    // The registry by case id first, so a bug renamed since the run (CODE-1 → BUG-26) still resolves.
    const id = bugForCase(r.test.id)?.id ?? r.result?.knownBug?.id ?? "unfiled";
    byBug.set(id, [...(byBug.get(id) ?? []), r]);
  }
  const reg = new Map(vbuBugs().map((b) => [b.id, b]));
  const order = (id: string) => ["Critical", "High", "Medium", "Low"].indexOf(reg.get(id)?.severity ?? "Low");
  const ids = [...byBug.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const lines = ids.map((id) => {
    const b = reg.get(id);
    const cs = byBug.get(id)!;
    // The bug in words, with the cases that showed it by their titles; the
    // suggested fix and the case refs are for developers, in the fold.
    const fix = b?.fix ?? "Not in the bug registry yet — see the case's evidence.";
    return [
      `<td>${e(id === "unfiled" ? "Not filed yet" : id)}</td>`,
      td(b?.severity ?? "—"),
      `<td class="wrap">${e(humanText(b?.title ?? cs[0].result?.verdict ?? ""))}${bugDetail(id) ? `<div class="pre" style="margin-top:4px"><b>Should:</b> ${e(bugDetail(id)!.expected.join(" "))}<br><b>Instead:</b> ${e(bugDetail(id)!.actual)}<br><b>Buyer sees:</b> ${e(bugDetail(id)!.sees)}</div>` : ""}${renderTechFold(
        [
          { label: "Suggested fix", value: fix },
          ...(b?.where ? [{ label: "Where", value: b.where, kind: "code" as const }] : []),
          { label: "Cases", value: cs.map((r) => r.test.id).join(", "), kind: "code" as const },
        ],
        "",
        "Details",
      )}</td>`,
      `<td class="wrap">${cs
        .map((r) => `<a href="#case-${e(r.test.id)}">${e(humanText(displayCase(r.test.id)?.title ?? r.test.title))}</a>`)
        .join("<br>")}</td>`,
    ];
  });
  const cls = ids.map((id) => (reg.get(id)?.severity === "Critical" ? "bad" : ""));
  return `<section class="card vbu" id="vbu-bugs">
    <h2>Bugs this run reproduced</h2>
    <p class="lede">${e(failing.length)} failing vendor bulk upload test case(s) come down to ${e(ids.length)} bug(s). Open a test case below for its steps and result; its technical details hold the uploaded sheet, what each row became and the records it created.</p>
    ${table(["Bug", "Severity", "What goes wrong", "Test cases that show it"], lines, cls)}
  </section>`;
}
