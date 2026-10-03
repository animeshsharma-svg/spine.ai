/**
 * The memory's STRUCTURED sources — knowledge that lives in data, code and
 * spine.ai's own database rather than in markdown, turned into one chunk per
 * fact so each can be found on its own and cited.
 *
 *   product-fact  src/model/anatomy.json (≈380 cited facts), the field-rule
 *                 library, and per-client models (templates, fields, units,
 *                 settings, vendors, findings) for every client with a snapshot
 *   error-code    data/app-error-catalog.json (code → message → HTTP status →
 *                 where raised); falls back to data/app-errors.json
 *   access-rule   data/app-access.json: per route, which app may call it
 *   known-bug     docs/bugs/Procol_bugs_found_*.xlsx (newest file)
 *   experience    spine DB case_track_record + results: per case, its runs,
 *                 verdict history, flaky flag and last reason (refreshed on
 *                 every build; absent when the DB is down)
 *
 * Every source is optional: one that is missing or broken is skipped and
 * reported, never fatal. Every text goes through redact() — no OTPs, tokens,
 * real e-mail addresses or phone numbers reach the memory.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Chunk } from "./knowledgeBase.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const DATA = join(ROOT, "data");
const MODEL_DIR = join(ROOT, "src", "model");
const BUGS_DIR = join(ROOT, "..", "docs", "bugs");

/** The three UAT clients by name, for text a person can search by name. */
const CLIENT_NAMES: Record<number, string> = {
  198678: "PROCOL DEMO",
  32461: "Demo Account 2",
  47053: "GMMCO LIMITED",
  900001: "Procol Sandbox Demo (PO)",
};
const clientName = (id: number | null | undefined, fallback?: string | null) =>
  id == null ? "all clients" : `${fallback || CLIENT_NAMES[id] || `client ${id}`} (${id})`;

// ── secrets out ────────────────────────────────────────────────────────────
/**
 * Mask what must never be stored: e-mail addresses other than the reserved
 * test domain, phone numbers, OTP values next to the word OTP, and long
 * token-like strings. Error codes and ids are left alone.
 */
export function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\+?91[\s/-]?[6-9]\d{9}\b/g, "[phone]")
    .replace(/\b[6-9]\d{9}\b/g, "[phone]")
    .replace(/\b(otp|one[- ]time (?:code|password)|login code)(\W{1,12})\d{4,8}\b/gi, "$1$2[code]")
    .replace(/\b(bearer|token|access[-_]token|api[-_]key|secret)(\W{1,4})[A-Za-z0-9+/=_-]{16,}/gi, "$1$2[secret]")
    .replace(/\b(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*\d)[A-Za-z0-9+/]{48,}={0,2}/g, "[token]");
}

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
};

// ── error codes (also used to enrich product facts) ────────────────────────
interface CatalogCode {
  message: string;
  status: number | null;
  statusNote?: string;
  title?: string;
  events: boolean;
  raisedAt: Array<{ at: string; method?: string }>;
}
function loadErrorCatalog(): { source: string; codes: Record<string, CatalogCode> } | null {
  const cat = readJson<{ source: string; codes: Record<string, CatalogCode> }>(join(DATA, "app-error-catalog.json"));
  if (cat?.codes) return cat;
  const plain = readJson<{ source: string; errors: Record<string, string> }>(join(DATA, "app-errors.json"));
  if (!plain?.errors) return null;
  const codes: Record<string, CatalogCode> = {};
  for (const [c, m] of Object.entries(plain.errors)) codes[c] = { message: m, status: null, events: false, raisedAt: [] };
  return { source: plain.source, codes };
}

function errorCodeChunks(): Chunk[] {
  const cat = loadErrorCatalog();
  if (!cat) return [];
  const out: Chunk[] = [];
  for (const [code, c] of Object.entries(cat.codes)) {
    const status = c.status ? `HTTP ${c.status}` : "HTTP 500 unless the caller sets a status (no status_code in en-IN.yml)";
    const sites = c.raisedAt.slice(0, 8).map((r) => (r.method ? `${r.method} (${r.at})` : r.at));
    const more = c.raisedAt.length > 8 ? ` and ${c.raisedAt.length - 8} more places` : "";
    out.push({
      id: `error:${code}`,
      source: "backend error codes (config/locales/en-IN.yml api_errors)",
      kind: "error-code",
      module: c.events ? "events" : "platform",
      labels: [`code-${code}`, c.status ? `http-${c.status}` : "http-500"],
      text: redact(
        `Procol backend error code ${code} (${status}): "${oneLine(c.message)}".` +
          (c.title ? ` Title: "${oneLine(c.title)}".` : "") +
          (sites.length ? ` Raised by: ${sites.join("; ")}${more}.` : " No raise site found by literal search (it may be passed through a variable).") +
          ` Rendered as {"error": {"code": ${code}, "message": …}} by render_error_json (json_helpers.rb:8-28).`,
      ),
    });
  }
  return out;
}

// ── product model ──────────────────────────────────────────────────────────
async function productFactChunks(notes: string[]): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const errors = loadErrorCatalog()?.codes ?? {};
  const refusal = (code: number | null | undefined, msg?: string | null) => {
    if (code == null) return "";
    const e = errors[String(code)];
    const message = msg || e?.message;
    return ` Refusal: error ${code}${message ? ` "${oneLine(message)}"` : ""}${e?.status ? ` (HTTP ${e.status})` : ""}.`;
  };

  /** Always name the code; add its message only when the fact does not already quote it. */
  const codeNote = (code: number | null | undefined, msg: string | null | undefined, plain: string) => {
    if (code == null) return "";
    const message = msg || errors[String(code)]?.message;
    if (message && plain.includes(message)) {
      const st = errors[String(code)]?.status;
      return ` Error code ${code}${st ? ` (HTTP ${st})` : ""}.`;
    }
    return refusal(code, msg);
  };

  // (1) the anatomy: one chunk per cited fact
  const anatomy = readJson<any>(join(MODEL_DIR, "anatomy.json"));
  if (anatomy?.rows) {
    const { SECTIONS } = await import("../model/anatomy.js");
    const sectionTitle = new Map(SECTIONS.map((s: { id: string; title: string }) => [s.id, s.title]));
    for (const r of anatomy.rows as Array<{ id: string; section: string; title: string; plain: string; code: number | null; cites: string[]; details?: any }>) {
      const msg = typeof r.details?.message === "string" ? r.details.message : null;
      out.push({
        id: `fact:${r.id}`,
        source: `product model — ${sectionTitle.get(r.section) ?? r.section} (src/model/anatomy.json)`,
        kind: "product-fact",
        module: "events",
        labels: [r.id, r.section, ...(r.code != null ? [`code-${r.code}`] : [])],
        text: redact(
          `Event product model, ${sectionTitle.get(r.section) ?? r.section}: ${oneLine(r.title)}. ${oneLine(r.plain)}` +
            codeNote(r.code, msg, r.plain) +
            (r.cites?.length ? ` Cites: ${r.cites.join(", ")}.` : ""),
        ),
      });
    }
    for (const c of anatomy.compositions?.allowed ?? [])
      out.push({
        id: `fact:composition.allowed.${c.id}`,
        source: "product model — allowed event compositions (src/model/anatomy.json)",
        kind: "product-fact",
        module: "events",
        labels: [c.id, "composition", "allowed"],
        text: `Allowed event composition "${c.id}" (stages: ${c.stages.join(" → ")}): ${oneLine(c.plain)}`,
      });
    for (const c of anatomy.compositions?.refused ?? [])
      out.push({
        id: `fact:composition.refused.${c.id}`,
        source: "product model — refused event compositions (src/model/anatomy.json)",
        kind: "product-fact",
        module: "events",
        labels: [c.id, "composition", "refused"],
        text: `NOT allowed event composition "${c.id}": ${oneLine(c.plain)}${c.cites?.length ? ` Cites: ${c.cites.join(", ")}.` : ""}`,
      });
  } else notes.push("product model: src/model/anatomy.json missing — no anatomy facts");

  // (2) the field-rule library: what the server / the screen does with each kind of template field
  try {
    const { fieldRuleRows, KIND_LABELS } = await import("../model/fieldRules.js");
    for (const r of fieldRuleRows()) {
      const applies = r.appliesTo
        .split(" | ")
        .map((a: string) => KIND_LABELS[a] ?? a.replace(/^section:/, "section ").replace(/^key:/, "field "))
        .join(", ");
      out.push({
        id: `fact:field-rule.${r.id}`,
        source: "product model — template field rules (src/model/fieldRules.ts)",
        kind: "product-fact",
        module: "events",
        labels: [r.id, r.kind, `enforced-by-${r.enforcedBy}`, ...(r.code != null ? [`code-${r.code}`] : [])],
        text: redact(
          `Template field rule (${r.kind}) for ${applies}: ${oneLine(r.plain).replace(/\.$/, "")}. Enforced by: ${r.enforcedBy === "screen" ? "the screen only (the server does not check it)" : r.enforcedBy}.` +
            codeNote(r.code, r.message, r.plain) +
            (r.cites?.length ? ` Cites: ${r.cites.join(", ")}.` : ""),
        ),
      });
    }
  } catch (e) {
    notes.push(`product model: field rules unavailable (${(e as Error).message.slice(0, 80)})`);
  }

  // (3) per client: what each client really has
  const ids = existsSync(join(MODEL_DIR, "snapshots"))
    ? readdirSync(join(MODEL_DIR, "snapshots"))
        .map((f) => Number(f.replace(/\.json$/, "")))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const { loadLatestModel } = await import("../model/store.js");
  for (const id of ids) {
    const { model: m } = await loadLatestModel(id).catch(() => ({ model: null }));
    if (!m) continue;
    out.push(...clientChunks(m as any));
  }
  return out;
}

function clientChunks(m: any): Chunk[] {
  const out: Chunk[] = [];
  const who = clientName(m.companyId, m.companyName);
  const base = (id: string, labels: string[], text: string): Chunk => ({
    id: `client:${m.companyId}:${id}`,
    source: `client model — ${who} (src/model/snapshots/${m.companyId}.json, fetched ${String(m.fetchedAt).slice(0, 10)})`,
    kind: "product-fact",
    module: "events",
    labels: [`client-${m.companyId}`, ...labels],
    text: redact(text),
  });
  const s = m.summary ?? {};
  out.push(
    base(
      "overview",
      ["overview"],
      `Client ${who} at a glance (fetched ${String(m.fetchedAt).slice(0, 10)}): ${s.templates ?? m.templates?.length ?? "?"} templates (${s.templatesThatOpen ?? "?"} open without error; by type ${Object.entries(s.templatesByType ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}), ` +
        `${s.fields ?? "?"} template fields, ${s.units ?? m.units?.count ?? "?"} units, ${s.products ?? m.products?.active ?? "?"} active products, ${s.invitableVendors ?? m.vendors?.invitable ?? "?"} invitable vendors, ${s.locations ?? m.locations?.active ?? "?"} delivery locations. ` +
        `Units: ${oneLine(m.units?.rulePlain)} Vendor statuses that can be invited: ${(m.vendors?.allowedStatuses ?? []).join(", ")} (${m.vendors?.allowedStatusesFrom ?? "?"}).`,
    ),
  );
  // units
  if (m.units) {
    const bad = (m.units.unusableProductUnits ?? []) as Array<{ symbol: string; products: number }>;
    out.push(
      base(
        "units",
        ["units"],
        `Units on ${who}: ${oneLine(m.units.rulePlain)} Default unit setting: ${JSON.stringify(m.units.defaultUnit)}. Users may add units: ${JSON.stringify(m.units.allowUserToAddUom)}. ` +
          (bad.length
            ? `${m.units.productsWithUnusableUnit} active products are linked to a unit this client cannot use (${bad.map((b) => `${b.symbol} ×${b.products}`).join(", ")}); a line item for such a product in that unit is refused (495 "The unit … is not present").`
            : "No active product is linked to a unit this client cannot use."),
      ),
    );
  }
  // vendors
  if (m.vendors)
    out.push(
      base(
        "vendors",
        ["vendors"],
        `Vendors on ${who}: statuses that can be invited to an event: ${(m.vendors.allowedStatuses ?? []).join(", ")} (from the ${m.vendors.allowedStatusesFrom}). ` +
          `Vendors by status: ${Object.entries(m.vendors.byStatus ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}. Tests invite only QA test vendors.`,
      ),
    );
  // settings: one chunk each, so "can a buyer edit a bid on X" finds exactly that switch
  for (const st of m.settings ?? [])
    out.push(
      base(
        `setting:${st.key}`,
        ["setting", st.key],
        `${who} client setting ${st.key} = ${JSON.stringify(st.value)}. ${oneLine(st.plain)}`,
      ),
    );
  // findings
  (m.findings ?? []).forEach((f: any, i: number) =>
    out.push(base(`finding:${i}`, ["finding", f.severity], `Finding on ${who} (${f.severity}): ${oneLine(f.plain)}`)),
  );
  // feature gates
  const gates = Object.entries(m.gates ?? {}) as Array<[string, { on: boolean | null; reasons: string[] }]>;
  for (let i = 0; i < gates.length; i += 8) {
    const slice = gates.slice(i, i + 8);
    out.push(
      base(
        `gates:${i / 8}`,
        ["feature-gates"],
        `Feature switches on ${who}: ` +
          slice.map(([k, g]) => `${k} ${g.on === null ? "unknown" : g.on ? "ON" : "OFF"} (${oneLine((g.reasons ?? []).join("; ")).slice(0, 220)})`).join(". "),
      ),
    );
  }
  // templates: one chunk each, with its fields in brief
  for (const t of m.templates ?? []) {
    const fields = (t.fields ?? [])
      .slice(0, 40)
      .map((f: any) => `${f.name} (${f.kindLabel ?? f.inputType}, ${f.filledBy}${f.required ? ", required" : ""}${f.unit ? `, unit ${f.unit}` : ""})`)
      .join("; ");
    const problems = (t.problems ?? []).map((p: any) => oneLine(p.plain)).join(" ");
    out.push(
      base(
        `template:${t.uuid}`,
        ["template", ...(t.useFor ?? []), ...(t.typeIdentifiers ?? [])],
        `Template "${t.name}" on ${who}: ${t.templateType} ${t.orderType ?? ""} template (${(t.typeIdentifiers ?? []).join(", ")}), used for ${(t.useFor ?? []).join(", ") || "—"}${t.isDefault ? ", a default template" : ""}. ` +
          `${t.opens ? "Opens fine" : "Does NOT open (server error)"}; ${t.fieldCount} fields, ${t.requiredCount} required${t.quantityUnit ? `, default quantity unit ${t.quantityUnit}` : ""}. ` +
          (fields ? `Fields: ${fields}${(t.fields?.length ?? 0) > 40 ? ` … and ${t.fields.length - 40} more` : ""}. ` : "") +
          (problems ? `Problems: ${problems}` : ""),
      ),
    );
  }
  return out;
}

// ── app access ─────────────────────────────────────────────────────────────
const APP_PLAIN = { console: "buyer web console (client_admin_dashboard)", vendor: "vendor website (agribid_website)" } as const;
const SIGN_OUT =
  'An app that is not allowed is answered 401 "This app is not authorized to use this API" and the backend marks that session in_active, signing the user out (api_auth.rb:11-12, json_helpers.rb:31-35).';

function accessChunks(): Chunk[] {
  const a = readJson<any>(join(DATA, "app-access.json"));
  if (!a?.apps) return [];
  const out: Chunk[] = [];
  const apps = Object.keys(a.apps) as Array<"console" | "vendor">;
  // per app × namespace × controller: the allow-list itself
  for (const app of apps)
    for (const [version, controllers] of Object.entries(a.apps[app] as Record<string, Record<string, string[]>>))
      for (const [controller, actions] of Object.entries(controllers))
        out.push({
          id: `access:${app}:${version}:${controller}`,
          source: "app access rules (data/app-access.json ← config/app_auth_config.yml)",
          kind: "access-rule",
          module: "platform",
          labels: [app, version, controller],
          text: `The ${APP_PLAIN[app]} may call these ${version} ${controller} actions: ${actions.join(", ")}. In the ${version} namespace any other ${controller} action is refused to this app. ${SIGN_OUT}`,
        });
  // per route: who may call it
  for (const r of a.routes ?? []) {
    const verdicts = apps.map((app) => {
      const section = a.apps[app]?.[r.version];
      if (!section) return `${APP_PLAIN[app]}: not restricted by the allow-list`;
      return `${APP_PLAIN[app]}: ${(section[r.controller] ?? []).includes(r.action) ? "allowed" : "NOT allowed"}`;
    });
    const only = apps.filter((app) => (a.apps[app]?.[r.version]?.[r.controller] ?? []).includes(r.action));
    out.push({
      id: `access:route:${r.method}:${r.pattern}`,
      source: "app access rules (data/app-access.json ← config/routes.rb + config/app_auth_config.yml)",
      kind: "access-rule",
      module: /trade|bid|event|evaluat|proposal|template|auction/.test(r.controller) ? "events" : "platform",
      labels: [r.controller, r.action, r.version, ...only.map((x) => `${x}-only`)],
      text:
        `API access: ${r.method} ${r.pattern} reaches ${r.controller}#${r.action} (${r.version}). ${verdicts.join("; ")}.` +
        (only.length === 1 ? ` It is ${only[0]}-only: calling it from the other app signs that user out.` : "") +
        ` ${SIGN_OUT}`,
    });
  }
  return out;
}

// ── verified bugs ──────────────────────────────────────────────────────────
async function knownBugChunks(notes: string[]): Promise<Chunk[]> {
  if (!existsSync(BUGS_DIR)) return [];
  const files = readdirSync(BUGS_DIR).filter((f) => /^Procol_bugs_found_.*\.xlsx$/.test(f)).sort();
  const file = files.at(-1);
  if (!file) return [];
  let XLSX: any;
  try {
    XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  } catch {
    notes.push("known bugs: xlsx library unavailable");
    return [];
  }
  const wb = XLSX.readFile(join(BUGS_DIR, file));
  const sheet = (name: string) => (wb.Sheets[name] ? (XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) as Array<Record<string, string>>) : []);
  const src = `verified Procol bugs (docs/bugs/${file})`;
  const moduleOf = (area: string) => (/master data|users|purchase request/i.test(area) ? "platform" : "events");
  const out: Chunk[] = [];
  for (const r of sheet("Bugs")) {
    const id = oneLine(r["Bug #"]);
    if (!id) continue;
    out.push({
      id: `bug:${id}`,
      source: src,
      kind: "known-bug",
      module: moduleOf(r.Area),
      labels: [id, r.Severity, r.Kind, r.Area, ...String(r["Client(s) where found"]).split(";").map((x) => x.trim())].filter(Boolean),
      text: redact(
        `Known Procol bug ${id} (${r.Severity}, ${r.Kind}) — ${r.Area}: ${oneLine(r.Bug)}. ${oneLine(r["What goes wrong"])} ` +
          `How to see it: ${oneLine(r["How to see it"])} Should: ${oneLine(r["What should happen"])} Actually: ${oneLine(r["What actually happens"])} ` +
          `Found on: ${oneLine(r["Client(s) where found"])}. Verified: ${oneLine(r["How it was verified"])} Last confirmed ${oneLine(r["Last confirmed"])}.`,
      ),
    });
  }
  for (const r of sheet("Needs confirmation")) {
    const id = oneLine(r["#"]);
    if (!id) continue;
    out.push({
      id: `bug:${id}`,
      source: src,
      kind: "known-bug",
      module: moduleOf(r.Area),
      labels: [id, "needs-confirmation", r.Area],
      text: redact(
        `Behaviour to confirm with the product team ${id} (not a verified bug) — ${r.Area}: ${oneLine(r.Behaviour)}. What we saw: ${oneLine(r["What we saw"])} ` +
          `Clients: ${oneLine(r["Client(s)"])}. To confirm: ${oneLine(r["What to confirm"])}`,
      ),
    });
  }
  for (const r of sheet("Data problems")) {
    const id = oneLine(r["#"]);
    if (!id) continue;
    out.push({
      id: `bug:${id}`,
      source: src,
      kind: "known-bug",
      module: "events",
      labels: [id, "data-problem"],
      text: redact(`Client data problem ${id} on ${oneLine(r["Client(s)"])}: ${oneLine(r.Problem)}. ${oneLine(r.Details)} Suggested fix: ${oneLine(r["Suggested fix"])}`),
    });
  }
  return out;
}

// ── experience: the run track record ───────────────────────────────────────
const VERDICT_PLAIN: Record<string, string> = {
  pass: "passed",
  worked: "worked",
  fail: "FAILED",
  broken: "BROKEN",
  refused: "refused",
  inconclusive: "couldn't tell",
  "not-run": "not run",
};

async function experienceChunks(notes: string[]): Promise<Chunk[]> {
  const { spineDb } = await import("../db/spineDb.js");
  const db = await spineDb();
  if (!db) {
    notes.push("experience: spine DB unreachable — run track record not refreshed");
    return [];
  }
  // Cases and journey steps always; field checks only once they have failed
  // (1,900 always-green field checks would bury everything else).
  const r = await db.query(`
    WITH tr AS (
      SELECT * FROM case_track_record
       WHERE kind IN ('case', 'journey-step') OR (kind = 'field-check' AND failed > 0)
    ), recent AS (
      SELECT company_id, kind, case_id, verdict, reason, title, created_at,
             row_number() OVER (PARTITION BY company_id, kind, case_id ORDER BY created_at DESC) AS n
        FROM results
       WHERE (company_id, kind, case_id) IN (SELECT company_id, kind, case_id FROM tr)
    )
    SELECT tr.company_id, tr.kind, tr.case_id, tr.runs::int, tr.passed::int, tr.failed::int, tr.inconclusive::int,
           tr.last_seen, tr.last_verdict, tr.flaky,
           (SELECT title FROM recent x WHERE x.company_id IS NOT DISTINCT FROM tr.company_id AND x.kind = tr.kind AND x.case_id = tr.case_id AND x.n = 1) AS title,
           (SELECT array_agg(verdict ORDER BY n) FROM recent x WHERE x.company_id IS NOT DISTINCT FROM tr.company_id AND x.kind = tr.kind AND x.case_id = tr.case_id AND x.n <= 8) AS history,
           (SELECT reason FROM recent x WHERE x.company_id IS NOT DISTINCT FROM tr.company_id AND x.kind = tr.kind AND x.case_id = tr.case_id
               AND x.verdict NOT IN ('pass', 'worked') ORDER BY n LIMIT 1) AS last_bad_reason
      FROM tr`);
  // one chunk per case (kind + id), with a line per client
  const byCase = new Map<string, any[]>();
  for (const row of r.rows) {
    const key = `${row.kind}:${row.case_id}`;
    if (!byCase.has(key)) byCase.set(key, []);
    byCase.get(key)!.push(row);
  }
  const what = { case: "Test case", "journey-step": "Journey step", "field-check": "Field check" } as Record<string, string>;
  const out: Chunk[] = [];
  for (const [key, rows] of byCase) {
    rows.sort((a, b) => b.runs - a.runs);
    const first = rows[0];
    const title = oneLine(first.title).slice(0, 160);
    const flaky = rows.some((x) => x.flaky);
    const everPassed = rows.some((x) => x.passed > 0);
    const lines = rows.map((x) => {
      const hist = (x.history ?? []).map((v: string) => VERDICT_PLAIN[v] ?? v).join(", ");
      return (
        `${clientName(x.company_id)}: ${x.runs} runs — ${x.passed} passed, ${x.failed} failed, ${x.inconclusive} couldn't tell; ` +
        `last ${VERDICT_PLAIN[x.last_verdict] ?? x.last_verdict} on ${new Date(x.last_seen).toISOString().slice(0, 10)}${x.flaky ? "; FLAKY (both passed and failed)" : ""}` +
        (hist ? `; recent results, newest first: ${hist}` : "") +
        (x.last_bad_reason ? `; last non-pass reason: ${oneLine(x.last_bad_reason).slice(0, 260)}` : "")
      );
    });
    out.push({
      id: `track:${key}`,
      source: "run track record (spine DB case_track_record)",
      kind: "experience",
      module: "events",
      labels: [first.case_id, first.kind, ...(flaky ? ["flaky"] : []), everPassed ? "has-passed" : "never-passed"],
      text: redact(
        `TRACK RECORD — ${what[first.kind] ?? first.kind} ${first.case_id}${title ? ` "${title}"` : ""}: ` +
          `${everPassed ? "has passed before" : "has NEVER passed"}${flaky ? ", flaky" : ""}. ${lines.join(" | ")}`,
      ),
    });
  }
  return out;
}

// ── everything ─────────────────────────────────────────────────────────────
export async function structuredChunks(): Promise<{ chunks: Chunk[]; counts: Record<string, number>; notes: string[] }> {
  const notes: string[] = [];
  const parts: Array<[string, () => Promise<Chunk[]> | Chunk[]]> = [
    ["product-fact", () => productFactChunks(notes)],
    ["error-code", () => errorCodeChunks()],
    ["access-rule", () => accessChunks()],
    ["known-bug", () => knownBugChunks(notes)],
    ["experience (track record)", () => experienceChunks(notes)],
  ];
  const chunks: Chunk[] = [];
  const counts: Record<string, number> = {};
  for (const [name, fn] of parts) {
    try {
      const got = await fn();
      counts[name] = got.length;
      chunks.push(...got);
    } catch (e) {
      counts[name] = 0;
      notes.push(`${name}: skipped (${(e as Error).message.slice(0, 160)})`);
    }
  }
  return { chunks, counts, notes };
}
