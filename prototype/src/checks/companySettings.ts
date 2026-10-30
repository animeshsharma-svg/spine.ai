/**
 * THE COMPANY SETTING A CASE NEEDS — found, switched for the run, switched back.
 *
 * A case such as "Company with eRFX switched off" or "a company that blocks withdrawing a live auction"
 * depends on one of Procol's 697 company settings (master_configurations, overridden per company in
 * custom_configurations). The agent:
 *   1. reads the settings catalogue from Procol's database (READ-ONLY: key, default, plain-English description)
 *      and asks a model which setting(s) the pre-condition means and what value makes it true — validated
 *      against the catalogue and cached in data/setting-map.json so the same words map the same way;
 *   2. reads the company's current value the way the backend does (custom override, else the default);
 *   3. if it differs, switches it through the app's own endpoint — POST /custom_configuration/update_or_create
 *      {config_key, item_type: "Company", modifications: {value}}, the call the dashboard's Manage
 *      configurations screen makes, as the company's super admin — never by writing to the database;
 *   4. re-reads it to confirm, runs the case, and switches it back to what it was.
 * Every change is logged in data/setting-changes.jsonl. A change waiting to be undone is kept in
 * data/setting-pending.json and undone on the next start-up if the server stopped mid-case.
 * Only the companies in SETTINGS_ALLOWED_COMPANIES (default 198678, PROCOL DEMO — approved by the tester on
 * 28 Oct 2026) are ever reconfigured.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chat } from "../ai/llm.js";
import { openClientContext } from "../executor.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "data");
const MAP = join(DATA, "setting-map.json");
const LOG = join(DATA, "setting-changes.jsonl");
const PENDING = join(DATA, "setting-pending.json");
/** Settings the app will not change per company (or the tester said to leave alone): a case that needs one is BLOCKED. */
const BLOCKERS = join(here, "..", "..", "config", "setting-blockers.json");
export function settingBlockers(): Record<string, string> {
  try {
    return existsSync(BLOCKERS) ? JSON.parse(readFileSync(BLOCKERS, "utf8")) : {};
  } catch {
    return {};
  }
}
function addBlocker(key: string, why: string): void {
  const all = settingBlockers();
  if (all[key]) return;
  all[key] = why;
  writeFileSync(BLOCKERS, JSON.stringify(all, null, 1));
}

export const ALLOWED = (process.env.SETTINGS_ALLOWED_COMPANIES ?? "198678").split(",").map((s) => Number(s.trim())).filter(Boolean);

let pool: pg.Pool | null = null;
async function read<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error("read-only: only SELECT / WITH");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — the settings cannot be read");
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, statement_timeout: 20000 });
  return (await pool.query(sql, params)).rows as T[];
}

export interface SettingDef { key: string; def: unknown; description: string; name: string; hidden: boolean }
let catalog: { at: number; rows: SettingDef[] } | null = null;
export async function settingsCatalog(): Promise<SettingDef[]> {
  if (catalog && Date.now() - catalog.at < 3600_000) return catalog.rows;
  const rows = await read<{ config_key: string; v: unknown; d: string; n: string; vis: number }>(
    `SELECT DISTINCT ON (config_key) config_key, defaults->'value' AS v, COALESCE(description::text, '') AS d, COALESCE(name::text, '') AS n, visibility AS vis
       FROM master_configurations WHERE item_type = 1 AND status = 1 AND company_id IS NULL ORDER BY config_key, id DESC`,
  );
  // visibility 0 = hidden: only a Procol employee may change it (MasterConfiguration.config_key_exists, master_configuration.rb:71)
  catalog = { at: Date.now(), rows: rows.map((r) => ({ key: r.config_key, def: r.v, description: r.d, name: r.n, hidden: Number(r.vis) === 0 })) };
  return catalog.rows;
}

/** The company's value, read the way the backend reads it (company override, else default). */
export async function currentValue(companyId: number, key: string): Promise<{ value: unknown; source: string }> {
  const r = await read<{ value: unknown; source: string }>(
    `WITH c AS (SELECT modifications->'value' AS v FROM custom_configurations WHERE company_id = $1 AND item_type = 'Company' AND item_id = $1 AND config_key = $2 AND status = 1 ORDER BY id DESC LIMIT 1),
          m AS (SELECT defaults->'value' AS v FROM master_configurations WHERE item_type = 1 AND status = 1 AND config_key = $2 AND (company_id = $1 OR company_id IS NULL) ORDER BY company_id NULLS LAST, id DESC LIMIT 1)
     SELECT CASE WHEN EXISTS (SELECT 1 FROM c) THEN (SELECT v FROM c) ELSE (SELECT v FROM m) END AS value,
            CASE WHEN EXISTS (SELECT 1 FROM c) THEN 'company override' WHEN EXISTS (SELECT 1 FROM m) THEN 'default' ELSE 'not configured' END AS source`,
    [companyId, key],
  );
  return { value: r[0]?.value ?? null, source: r[0]?.source ?? "not configured" };
}

export interface NeededSetting { key: string; value: unknown; why: string }
const SYN: Array<[RegExp, string]> = [[/\be-?rfx\b/g, "rfx project"], [/\bmasked\b|\bmasking\b/g, "mask"], [/\bauto-?title\b/g, "auto title"], [/\bpr\b/g, "purchase request requisition"], [/\bpo\b/g, "purchase order"]];
const stem = (w: string) => w.replace(/(ings|ing|ions|ion|ies|es|ed|s)$/, "") || w;
const words = (t: string) => {
  let x = t.toLowerCase().replace(/_/g, " ");
  for (const [re, to] of SYN) x = x.replace(re, ` ${to} `);
  return new Set(x.split(/[^a-z0-9]+/).filter((w) => w.length > 2).map(stem));
};
/** The settings the feature-gate map (built from the backend code) already ties to features. */
function gateKeys(): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const f = JSON.parse(readFileSync(join(here, "..", "..", "config", "featureGates.json"), "utf8")).features as Record<string, { gates: Array<{ kind: string; key: string; why?: string }> }>;
    for (const [feature, v] of Object.entries(f)) for (const g of v.gates) if (g.kind === "company_config" && !out.has(g.key)) out.set(g.key, `${feature.replace(/[._]/g, " ")} — ${g.why ?? ""}`);
  } catch {
    /* no map */
  }
  return out;
}

function readMap(): Record<string, NeededSetting[] | { none: string }> {
  try {
    return existsSync(MAP) ? JSON.parse(readFileSync(MAP, "utf8")) : {};
  } catch {
    return {};
  }
}

/**
 * Which setting(s) the words of a pre-condition need, and the value. Null when no setting in the catalogue
 * fits (then the case stays "Not run — needs a company where …").
 */
export async function settingsFor(phrase: string): Promise<NeededSetting[] | null> {
  const key = phrase.toLowerCase().replace(/\s+/g, " ").trim();
  const map = readMap();
  if (map[key]) return "none" in (map[key] as object) ? null : (map[key] as NeededSetting[]);
  const all = await settingsCatalog();
  const pw = words(phrase);
  // "X switched off / without X / X enabled": X's own master switch (…_enabled), when there is exactly one
  const OFF = /\b(off|without|disabled?|no|not enabled|turned off|switched off)\b/i.test(phrase);
  const filler = new Set(["company", "with", "without", "off", "switch", "turn", "enabl", "disabl", "that", "where", "which", "the", "have", "allow"].map(stem));
  const nouns = [...pw].filter((w) => !filler.has(w));
  if (nouns.length && nouns.length <= 3) {
    const master = all.filter((x) => /_enabled$/.test(x.key) && typeof x.def === "boolean" && nouns.every((n) => words(x.key).has(n)));
    if (master.length) {
      const pick = master.sort((a, b) => a.key.length - b.key.length)[0];
      const out = [{ key: pick.key, value: !OFF, why: `the master switch of ${nouns.join(" ")}` }];
      map[key] = out;
      mkdirSync(DATA, { recursive: true });
      writeFileSync(MAP, JSON.stringify(map, null, 1));
      return out;
    }
  }
  const gates = gateKeys();
  const ranked = all
    .map((s) => {
      const sw = words(`${s.key} ${s.name} ${s.description} ${gates.get(s.key) ?? ""}`);
      let both = 0;
      for (const w of pw) if (sw.has(w)) both++;
      return { s, score: both };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((x) => x.s);
  if (!ranked.length) return null;
  const raw = await chat(
    [
      { role: "system", content: "You map a test case's pre-condition about a company's setup to Procol's company settings. Choose ONLY from the SETTINGS given (exact keys). Prefer the master switch of a feature (e.g. a feature being switched off means its *_enabled switch = false), and a setting marked [decides the feature] over a narrower one. Give the value that makes the pre-condition true, of the same type as the setting's default (true/false for a switch). If none of them clearly means it, answer []. Reply with JSON only: [{\"key\":\"…\",\"value\":…,\"why\":\"one short sentence\"}]." },
      { role: "user", content: `PRE-CONDITION: ${phrase}\n\nSETTINGS (key = default — description):\n${ranked.map((s) => `${s.key} = ${JSON.stringify(s.def)} — ${(s.description || s.name).slice(0, 140)}${gates.has(s.key) ? ` [decides the feature: ${gates.get(s.key)!.slice(0, 80)}]` : ""}`).join("\n")}` },
    ],
    { tier: "fast", temperature: 0, maxTokens: 400 },
  ).catch(() => "");
  let picked: NeededSetting[] = [];
  try {
    const i = raw.indexOf("["), j = raw.lastIndexOf("]");
    picked = i >= 0 && j > i ? JSON.parse(raw.slice(i, j + 1)) : [];
  } catch {
    picked = [];
  }
  const ok = picked.filter((p) => {
    const def = all.find((s) => s.key === p.key);
    return def && (def.def === null || typeof def.def === typeof p.value);
  });
  if (raw) {
    map[key] = ok.length ? ok : { none: "no setting in the catalogue fits" };
    mkdirSync(DATA, { recursive: true });
    writeFileSync(MAP, JSON.stringify(map, null, 1));
  }
  return ok.length ? ok : null;
}

function log(entry: Record<string, unknown>): void {
  mkdirSync(DATA, { recursive: true });
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}
type Pending = Array<{ companyId: number; key: string; restoreTo: unknown; caseId: string }>;
function readPending(): Pending {
  try {
    return existsSync(PENDING) ? JSON.parse(readFileSync(PENDING, "utf8")) : [];
  } catch {
    return [];
  }
}
function writePending(p: Pending): void {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(PENDING, JSON.stringify(p, null, 1));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Switch it through the app; true when the app's own answer shows the new value saved. */
async function setValue(companyId: number, key: string, value: unknown): Promise<boolean> {
  const client = await openClientContext(companyId);
  try {
    const reply: any = await client.ctx.buyerApi.post("/custom_configuration/update_or_create", { body: { config_key: key, item_type: "Company", modifications: { value } } });
    return reply?.config_key === key && same(reply?.modifications?.value, value);
  } finally {
    await client.dispose().catch(() => {});
  }
}
/** The database copy we read can lag the app by a few seconds: wait (≤30 s) until it shows the value. */
async function settled(companyId: number, key: string, value: unknown): Promise<boolean> {
  for (const until = Date.now() + 30_000; Date.now() < until; ) {
    if (same((await currentValue(companyId, key)).value, value)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Make the company match the settings, run `work`, then put every changed setting back. Returns what was
 * changed (for the report). Refuses companies not in ALLOWED.
 */
export async function withSettings<T>(companyId: number, needed: NeededSetting[], caseId: string, onLine: (l: string) => void, work: () => Promise<T>): Promise<{ result: T; changed: Array<{ key: string; from: unknown; to: unknown }> } | { refused: string }> {
  if (!ALLOWED.includes(companyId)) return { refused: `company ${companyId} is not one the agent may reconfigure (allowed: ${ALLOWED.join(", ")})` };
  const cat = await settingsCatalog();
  const known = new Set(cat.map((x) => x.key));
  const unknown = needed.filter((n) => !known.has(n.key)).map((n) => n.key);
  if (unknown.length) return { refused: `${unknown.join(", ")} is not a company setting in Procol's settings catalogue` };
  // a hidden setting is refused to anyone but a Procol employee ("The Config type is not supported", error 1103)
  const hidden = needed.filter((n) => cat.find((x) => x.key === n.key)?.hidden);
  if (hidden.length) {
    const asIs = await Promise.all(hidden.map(async (n) => ({ n, cur: (await currentValue(companyId, n.key)).value })));
    const differ = asIs.filter(({ n, cur }) => !same(cur, n.value));
    if (differ.length) return { refused: `BLOCKED — ${differ.map(({ n }) => n.key).join(", ")} is a hidden setting: only a Procol-employee account may change it (backend error 1103 "The Config type is not supported")` };
  }
  const blocked = settingBlockers();
  const stuck = needed.filter((n) => blocked[n.key]);
  if (stuck.length) return { refused: `BLOCKED — ${stuck.map((n) => `${n.key}: ${blocked[n.key]}`).join("; ")}` };
  const changed: Array<{ key: string; from: unknown; to: unknown }> = [];
  try {
    for (const n of needed) {
      const cur = await currentValue(companyId, n.key);
      if (same(cur.value, n.value)) {
        onLine(`Setting ${n.key} is already ${JSON.stringify(n.value)} (${cur.source}).`);
        continue;
      }
      onLine(`Switching ${n.key} from ${JSON.stringify(cur.value)} to ${JSON.stringify(n.value)} for this case (${n.why}).`);
      writePending([...readPending(), { companyId, key: n.key, restoreTo: cur.value, caseId }]);
      let saved = false;
      try {
        saved = await setValue(companyId, n.key, n.value);
      } catch (e) {
        // e.g. "The Config type is not supported": the app does not take this setting per company
        writePending(readPending().filter((p) => !(p.companyId === companyId && p.key === n.key)));
        log({ companyId, key: n.key, from: cur.value, to: n.value, caseId, confirmed: false, error: (e as Error).message.slice(0, 200) });
        const said = (e as Error).message.split("\n")[0].slice(0, 120);
        addBlocker(n.key, `the app will not change it per company ("${said}")`);
        return { refused: `BLOCKED — the app would not change ${n.key} for the company (it answered: ${said})` };
      }
      changed.push({ key: n.key, from: cur.value, to: n.value });
      const inDb = saved ? await settled(companyId, n.key, n.value) : false;
      log({ companyId, key: n.key, from: cur.value, to: n.value, caseId, confirmed: saved, readBack: inDb });
      if (!saved) return { refused: `the app did not save the change to ${n.key}` };
      if (!inDb) onLine(`The app saved ${n.key} = ${JSON.stringify(n.value)}; the database copy had not caught up after 30 s — running anyway.`);
    }
    const result = await work();
    return { result, changed };
  } finally {
    for (const ch of [...changed].reverse()) {
      try {
        const ok = await setValue(companyId, ch.key, ch.from);
        log({ companyId, key: ch.key, from: ch.to, to: ch.from, caseId, restore: true, confirmed: ok, readBack: ok ? await settled(companyId, ch.key, ch.from) : false });
        if (!ok) throw new Error("the app did not confirm the change back");
        onLine(`Switched ${ch.key} back to ${JSON.stringify(ch.from)}.`);
        writePending(readPending().filter((p) => !(p.companyId === companyId && p.key === ch.key)));
      } catch (e) {
        onLine(`Could not switch ${ch.key} back: ${(e as Error).message} — it stays on the pending list and is retried at the next start-up.`);
      }
    }
  }
}

/** Undo any change left behind by a server that stopped mid-case. Called once at start-up. */
export async function restorePendingSettings(): Promise<void> {
  const left: Pending = [];
  for (const p of readPending()) {
    try {
      await setValue(p.companyId, p.key, p.restoreTo);
      log({ companyId: p.companyId, key: p.key, to: p.restoreTo, caseId: p.caseId, restore: true, atStartup: true });
    } catch {
      left.push(p);
    }
  }
  writePending(left);
}
