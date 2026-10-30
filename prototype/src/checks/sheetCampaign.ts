/**
 * RUN A WHOLE SHEET ON ITS OWN — module after module in flow order, every case one by one, with self-repair,
 * until the end; a person starts it once and reads the reports.
 *
 * The campaign keeps its place in data/sheet-campaigns/<id>.json (which module, which cases are done), so a
 * server restart (the dashboard reloads when its code changes), a closed browser or a crash does not lose the
 * run: on start-up a campaign that was running carries on from the next case. Each module gets its own sheet
 * run and report (sheetRunner / sheetReport); the campaign report adds them up, lists every bug and the
 * automation backlog. One campaign at a time; it waits for any other sheet run to finish.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sheetCases, type SheetCase } from "./sheetCases.js";
import { activeSheetRun, loadSheetRun, runSheetCases, stopSheetRun, type SheetRunCase } from "./sheetRunner.js";
import { backlog } from "./selfRepair.js";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "..", "..", "data", "sheet-campaigns");

export interface CampaignModule { key: string; name: string; ids: string[]; done: string[]; runIds: string[]; status: "waiting" | "running" | "done" }
export interface Campaign {
  id: string;
  sheet: string;
  companyId: number;
  status: "running" | "done" | "stopped";
  startedAt: string;
  endedAt?: string;
  modules: CampaignModule[];
  current?: { module: string; caseId: string; title: string; index: number; total: number };
}

const modKey = (m: string) => m.match(/^(\d+[A-Z]?)/)?.[1] ?? m;
const order = (k: string) => {
  const m = k.match(/^(\d+)([A-Z]?)/);
  return m ? Number(m[1]) * 10 + (m[2] ? m[2].charCodeAt(0) - 64 : 0) : 9999;
};

let live: { id: string; stopped: boolean } | null = null;
let lastFrame: string | null = null;
export function campaignFrame(): string | null {
  return lastFrame;
}

function save(c: Campaign): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${c.id}.json`), JSON.stringify(c, null, 1));
}
export function loadCampaign(id: string): Campaign | null {
  const f = join(DIR, `${id.replace(/[^\w.-]/g, "")}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Campaign) : null;
}
export function listCampaigns(): Campaign[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: statSync(join(DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t).map(({ f }) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Campaign);
}
export function activeCampaign(): Campaign | null {
  return live ? loadCampaign(live.id) : null;
}

/**
 * The modules of a sheet in flow order, starting at `from` (e.g. "3" = Create event), wrapping round so the
 * modules before it run last. `only` limits to those module keys.
 */
export function planModules(sheet: string, from?: string, only?: string[]): CampaignModule[] {
  const cases = sheetCases(sheet);
  const byMod = new Map<string, { name: string; ids: string[] }>();
  for (const c of cases) {
    const k = modKey(c.module);
    if (only?.length && !only.includes(k)) continue;
    const m = byMod.get(k) ?? { name: c.module, ids: [] };
    m.ids.push(c.id);
    byMod.set(k, m);
  }
  const keys = [...byMod.keys()].sort((a, b) => order(a) - order(b));
  const start = from ? Math.max(0, keys.findIndex((k) => order(k) >= order(from))) : 0;
  const ordered = [...keys.slice(start), ...keys.slice(0, start)];
  return ordered.map((k) => ({ key: k, name: byMod.get(k)!.name, ids: byMod.get(k)!.ids, done: [], runIds: [], status: "waiting" }));
}

export function startCampaign(input: { sheet: string; companyId: number; from?: string; only?: string[] }): Campaign {
  if (live) throw new Error(`a campaign is already running (${live.id}) — stop it first`);
  const modules = planModules(input.sheet, input.from, input.only);
  if (!modules.length) throw new Error("no cases in that sheet for those modules");
  const c: Campaign = { id: `camp-${Date.now().toString(36)}`, sheet: input.sheet, companyId: input.companyId, status: "running", startedAt: new Date().toISOString(), modules };
  save(c);
  void drive(c.id);
  return c;
}

export function stopCampaign(id?: string): boolean {
  if (!live || (id && live.id !== id)) return false;
  live.stopped = true;
  const run = activeSheetRun();
  if (run) stopSheetRun(run);
  const c = loadCampaign(live.id);
  if (c) {
    c.status = "stopped";
    c.endedAt = new Date().toISOString();
    c.current = undefined;
    save(c);
  }
  return true;
}

/** Carry on a campaign that was running when the server stopped. Called once at start-up. */
export function resumeCampaigns(): void {
  const running = listCampaigns().find((c) => c.status === "running");
  if (running && !live) setTimeout(() => void drive(running.id), 15_000);
}

async function drive(id: string): Promise<void> {
  if (live) return;
  live = { id, stopped: false };
  try {
    for (;;) {
      const c = loadCampaign(id);
      if (!c || c.status !== "running" || live.stopped) break;
      const mod = c.modules.find((m) => m.status !== "done");
      if (!mod) {
        c.status = "done";
        c.endedAt = new Date().toISOString();
        c.current = undefined;
        save(c);
        break;
      }
      // wait for any other sheet run (a person's single case) to finish
      while (activeSheetRun()) await new Promise((r) => setTimeout(r, 10_000));
      const all = sheetCases(c.sheet);
      const todo = mod.ids.filter((x) => !mod.done.includes(x)).map((x) => all.find((k) => k.id === x)).filter((k): k is SheetCase => !!k);
      if (!todo.length) {
        mod.status = "done";
        save(c);
        continue;
      }
      mod.status = "running";
      save(c);
      await runSheetCases(todo, {
        companyId: c.companyId,
        sheet: c.sheet,
        repair: true,
        emit: (e) => {
          if (e.type === "frame") lastFrame = e.frame;
          const cur = loadCampaign(id);
          if (!cur) return;
          const m = cur.modules.find((x) => x.key === mod.key)!;
          if (e.type === "case-start") {
            const run = activeSheetRun();
            if (run && !m.runIds.includes(run)) m.runIds.push(run);
            cur.current = { module: m.name, caseId: e.id, title: e.title, index: m.done.length + 1, total: m.ids.length };
            save(cur);
          }
          if (e.type === "case-done" && !(e.result.status === "Not run" && /run was stopped/.test(e.result.why))) {
            if (!m.done.includes(e.result.id)) m.done.push(e.result.id);
            save(cur);
          }
        },
      }).catch(() => undefined);
      const after = loadCampaign(id);
      if (!after || live.stopped) break;
      const m = after.modules.find((x) => x.key === mod.key)!;
      if (m.ids.every((x) => m.done.includes(x))) m.status = "done";
      save(after);
    }
  } finally {
    live = null;
  }
}

/** Every finished case of the campaign, latest result per case. */
export function campaignResults(c: Campaign): Array<SheetRunCase & { moduleKey: string; runId: string }> {
  const out = new Map<string, SheetRunCase & { moduleKey: string; runId: string }>();
  for (const m of c.modules)
    for (const rid of m.runIds) {
      const run = loadSheetRun(rid);
      for (const r of run?.cases ?? []) if (!(r.status === "Not run" && /run was stopped/.test(r.why))) out.set(r.id, { ...r, moduleKey: m.key, runId: rid });
    }
  return [...out.values()];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
export function renderCampaignReport(c: Campaign): string {
  const res = campaignResults(c);
  const n = (v: string) => res.filter((r) => r.status === v).length;
  const bugs = res.filter((r) => r.bug);
  const repaired = res.filter((r) => r.repaired);
  const bl = backlog().filter((b) => c.modules.some((m) => m.ids.includes(b.caseId)));
  const total = c.modules.reduce((k, m) => k + m.ids.length, 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sheet campaign — ${esc(c.sheet)}</title>
<style>:root{--bg:#f4f6f9;--paper:#fff;--ink:#17212c;--muted:#5a6676;--line:#dce2e9;--ok:#1b7a4a;--bad:#b42318;--warn:#94600a;--accent:#0d5a8f}@media (prefers-color-scheme:dark){:root{--bg:#10151b;--paper:#171e27;--ink:#e3e8ee;--muted:#9aa6b3;--line:#2b3542;--ok:#7fd1a5;--bad:#ff8f84;--warn:#f2c46b;--accent:#7cb8e6}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px max(16px,3vw) 60px}main{max-width:1180px;margin:0 auto;display:grid;gap:18px}h1{margin:0;font-size:1.6rem}h2{margin:6px 0;font-size:1.1rem}.muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;background:var(--paper);font-size:.9rem}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}a{color:var(--accent)}td.n{font-variant-numeric:tabular-nums;text-align:right}</style></head><body><main>
<header><div class="muted">Sheet campaign · ${esc(c.sheet)} · started ${esc(new Date(c.startedAt).toLocaleString())} · ${esc(c.status)}${c.current ? ` · now: ${esc(c.current.caseId)} (${c.current.index}/${c.current.total} of ${esc(c.current.module)})` : ""}</div>
<h1>${res.length} of ${total} cases run — ${n("Pass")} passed, ${n("Fail")} failed, ${bugs.length} bugs</h1>
<p class="muted">${n("Partly checked")} partly checked · ${n("Couldn't tell")} couldn't tell · ${n("Not run")} not run · ${repaired.length} repaired by the agent · ${bl.length} on the automation backlog.</p></header>
<section><h2>Modules, in the order they run</h2><table><thead><tr><th>Module</th><th>Cases</th><th>Done</th><th>Pass</th><th>Fail</th><th>Partly</th><th>Couldn't tell</th><th>Not run</th><th>Reports</th></tr></thead><tbody>
${c.modules.map((m) => { const r = res.filter((x) => x.moduleKey === m.key); const k = (v: string) => r.filter((x) => x.status === v).length; return `<tr><td>${esc(m.name)}</td><td class="n">${m.ids.length}</td><td class="n">${m.done.length}</td><td class="n ok">${k("Pass")}</td><td class="n bad">${k("Fail")}</td><td class="n warn">${k("Partly checked")}</td><td class="n">${k("Couldn't tell")}</td><td class="n">${k("Not run")}</td><td>${m.runIds.map((rid, i) => `<a href="/api/sheets/report?run=${rid}" target="_blank" rel="noopener">report${m.runIds.length > 1 ? ` ${i + 1}` : ""}</a> · <a href="/api/sheets/export?run=${rid}&format=xlsx">sheet</a>`).join("<br>")}</td></tr>`; }).join("")}
</tbody></table></section>
<section><h2>Bugs found (${bugs.length})</h2>${bugs.length ? `<table><thead><tr><th>Case</th><th>Severity</th><th>What happened</th></tr></thead><tbody>${bugs.map((b) => `<tr><td><a href="/api/sheets/report?run=${b.runId}#c-${esc(b.id)}" target="_blank" rel="noopener">${esc(b.id)}</a><br>${esc(b.title)}</td><td>${esc(b.bug!.severity)}</td><td>${esc(b.bug!.whatHappened)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">None so far.</p>`}</section>
<section><h2>Repaired by the agent (${repaired.length})</h2>${repaired.length ? `<table><tbody>${repaired.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.repaired!.how)}</td><td>now: ${esc(r.status)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">None so far.</p>`}</section>
<section><h2>Automation backlog — what the agent could not build yet (${bl.length})</h2>${bl.length ? `<table><thead><tr><th>Case</th><th>Missing</th><th>What</th><th>Tried</th></tr></thead><tbody>${bl.map((b) => `<tr><td>${esc(b.caseId)}<br><span class="muted">${esc(b.title)}</span></td><td>${esc(b.kind)}</td><td>${esc(b.what)}</td><td>${esc(b.tried.join("; "))}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">Empty.</p>`}</section>
</main></body></html>`;
}

/**
 * "run everything starting with create event", "run the awarding module", "test bid submit and counter offers"
 * → which modules to run and where to start. Null when the words are not a request to run sheet modules.
 */
export function campaignIntent(text: string, sheet: string): { from?: string; only?: string[]; names: string[] } | null {
  const t = text.toLowerCase().trim();
  if (!/^(?:\S+\s+){0,4}?(run|test|execute|start|kick off|begin|go through)\b/.test(t)) return null;
  if (!/\bmodules?\b|\beverything\b|\ball (the )?(test )?cases\b|\bwhole sheet\b|\bentire sheet\b|\bthe sheet\b|\bin order\b/.test(t)) return null;
  const mods = planModules(sheet);
  const tok = (s: string) => s.toLowerCase().replace(/^\d+[a-z]?\.\s*/, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !["event", "events", "test", "cases", "with", "from", "what", "each", "every", "this"].includes(w));
  const said = new Set(tok(t));
  const hits = mods.filter((m) => {
    const name = m.name.toLowerCase();
    if (/create event/.test(t) && /create event/.test(name)) return true;
    if (/bid submit|submit(ting)? (a )?bid/.test(t) && /submitting a bid/.test(name)) return true;
    const head = tok(name.split(" — ")[0]);
    return head.length > 0 && head.every((w) => said.has(w));
  });
  const everything = /\beverything\b|\ball (the )?(test )?cases\b|\bwhole sheet\b|\bentire sheet\b|\bthe sheet\b|\bin order\b|\ball modules\b/.test(t);
  if (!hits.length && !everything) return null;
  if (everything) return { from: hits[0]?.key, names: hits.map((h) => h.name) };
  return { only: hits.map((h) => h.key), names: hits.map((h) => h.name) };
}
