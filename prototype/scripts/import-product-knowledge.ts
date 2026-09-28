import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

/**
 * PRODUCT WORKBOOK → PRODUCT KNOWLEDGE + HUMAN QA TEST CASES
 *
 *   npx tsx scripts/import-product-knowledge.ts [path/to/workbook.xlsx]
 *   npm run product:import
 *
 * Reads Procol's "Modules and Features" workbook (read-only) and regenerates,
 * from scratch, two derived artefacts:
 *
 *   1. knowledge/product/NN-<module>.md — one file per module sheet, plus
 *      00-module-registry.md and 90-configuration-workflows-integrations.md.
 *      Written for the RAG memory (src/rag/knowledgeBase.ts): every markdown
 *      file under knowledge/ is walked recursively, split at `#`/`##`/`###`
 *      headings and capped at ~1100 chars per chunk, and the sub-directory
 *      ("product") becomes the chunk's module. So each feature, config,
 *      workflow, integration and dependency gets its own `###` heading and a
 *      single-paragraph body that names its module — one self-describing chunk.
 *
 *   2. ../test-cases/product-NN-<module>.md — cases in exactly the catalog
 *      format that scripts/import-test-cases.ts parses:
 *        `## N. Section`, `#### PRD-<CODE>-NNN — Title`, and the bullet fields
 *        Why it matters / Setup / Steps / Expected / Oracle / Trace.
 *      <CODE> is the module's Feature-ID prefix (FEAT-VM-… → PRD-VM), so a case
 *      id always points back at its module sheet.
 *
 * DETERMINISTIC AND IDEMPOTENT. No timestamps, no randomness, no LLM: the same
 * workbook always produces byte-identical files. Every run deletes the files it
 * owns (knowledge/product/*.md and test-cases/product-*.md) and rewrites them,
 * so a renamed or removed module leaves nothing stale behind. Case numbers are
 * assigned in workbook order, so inserting a feature mid-sheet renumbers the
 * cases after it — the Feature ID in each Trace line is the stable handle.
 *
 * GROUNDING. Every step and expectation is templated from the workbook's own
 * text (user story, business use case, edge-case notes, config/workflow/
 * integration/dependency rows), quoted where paraphrase would risk changing the
 * meaning. No UI element names, URLs, API routes, field names or error codes
 * are invented; where the workbook is vague the case stays at its level of
 * detail.
 *
 * WHAT EACH FEATURE ROW PRODUCES
 *   a) happy path from the User Story + Business Use Case
 *   b) one case per atomic edge case in "Edge Cases / Notes" (split on ";" and
 *      sentences). Pure cross-references ("Cross-links MOD-11", "See the …
 *      module") become Trace refs; applicability notes ("Depends on GST API",
 *      "Relevant mainly for …") become happy-path Setup context; "… is tenant
 *      config / configurable" becomes a configuration-variation case.
 *   c) config cases for every Configuration Reference row mapped to the feature
 *      (by its Feature ID column, else by a "CONF-…" mention in the notes):
 *      each value of a Toggle/Dropdown, default/min/max/out-of-range for a
 *      numeric range, default/add/remove for a Multi-select.
 *   d) plan-gating negative when Plan Required is not "All Plans"
 *   e) permission negative when a specific persona (not "All Users") is named
 *   f) sheet 26 workflows: end-to-end order, routing to each step's actor,
 *      approval mode, SLA breach → escalation (and no escalation before it),
 *      bypass honoured / not honoured (with amount boundaries), system checks
 *   g) sheet 29 dependencies: present, missing/misconfigured → stated impact,
 *      and condition-not-met for conditional ones
 *   h) sheet 28 integrations: happy path per trigger direction, each stated
 *      failure-handling behaviour, and any "Requires <flag>" prerequisite
 *
 * PRIORITY RULE
 *   P0  money/compliance-critical flows — every sheet-26 approval-workflow case
 *       (routing, mode, SLA, bypass, system checks) — and happy paths of GA
 *       features that are Core or Compliance, or whose name is about PO,
 *       invoice/matching, approvals, budget, credit/debit, payment or tax.
 *   P1  other GA/Beta happy paths, and ALL gates: plan, permission, config
 *       (sheet 25 and "tenant-configurable" notes), config dependencies, and
 *       integration happy paths. Edge notes that restrict who may see or edit
 *       something ("hidden from", "never visible", "cannot edit", "scoped
 *       only") are permission gates too, so P1.
 *   P2  edge cases, integration failure handling.
 *   P3  cosmetic/reporting details: edge cases of the reporting & analytics
 *       modules or Reporting-category features, and edge notes about filters,
 *       labels, highlighting, widgets or saved views.
 *   Roadmap features ("Roadmap (Suggested — not in product yet)") are not in the
 *   product, so their cases are acceptance specifications rather than tests:
 *   every one is P3 · manual and says so in Setup.
 *
 * VERDICT RULE
 *   manual          by default — happy paths and edge cases, whose outcome the
 *                   workbook states in prose a person must judge.
 *   automate-later  cases with a clear UI/API observable: plan and permission
 *                   gates, sheet-25 config values, workflow routing/SLA/bypass,
 *                   integration sync and failure states, config dependencies.
 *
 * GATES. When a case depends on a key from the Configuration Reference sheet,
 * Setup carries `gate: <config key>`. (import-test-cases.ts extracts gates with
 * /[a-z0-9_]+/, so a dotted key such as `vendor.form.sections` is captured only
 * up to its first dot; the full key is always in Setup and the Trace refs.)
 */

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..");
const REPO = join(PROTO, "..");
const KNOWLEDGE_DIR = join(PROTO, "knowledge", "product");
const CASES_DIR = join(REPO, "test-cases");
const DEFAULT_WORKBOOK = "/Users/animesh/Downloads/Procol Modules and Features.xlsx";
const WORKBOOK = process.argv[2] ?? DEFAULT_WORKBOOK;

// ─── 1. Reading the workbook ──────────────────────────────────────────────

type Row = Record<string, string>;

/** Collapse whitespace; the header cells and many body cells carry newlines. */
const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
/** "-", "—", "–" and empty all mean "nothing stated". */
const blank = (v: string | undefined): boolean => !v || /^[-—–]+$/.test(v.trim());
const val = (v: string | undefined): string => (blank(v) ? "" : v!.trim());

interface Table {
  sheet: string;
  title: string;
  headers: string[];
  rows: Row[];
}

/**
 * Find the header row by content, not position: a title row (and sometimes a
 * blank row) sits above it. A table is recognised by the headers it must have.
 */
function readTable(ws: XLSX.WorkSheet, sheet: string, must: RegExp[]): Table | null {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const headers = (grid[i] ?? []).map(clean);
    if (!must.every((re) => headers.some((h) => re.test(h)))) continue;
    const rows: Row[] = [];
    for (const raw of grid.slice(i + 1)) {
      const cells = (raw ?? []).map(clean);
      if (!cells.some(Boolean)) continue;
      const r: Row = {};
      headers.forEach((h, j) => h && (r[h] = cells[j] ?? ""));
      rows.push(r);
    }
    const title = clean((grid[0] ?? [])[0]);
    return { sheet, title, headers, rows };
  }
  return null;
}

/** Column accessor by header pattern — survives reordering and renamed suffixes. */
function col(t: Table, re: RegExp): (r: Row) => string {
  const h = t.headers.find((x) => re.test(x));
  return (r) => (h ? (r[h] ?? "") : "");
}

// ─── 2. The workbook's model ──────────────────────────────────────────────

interface Feature {
  id: string;
  moduleId: string;
  moduleName: string;
  name: string;
  category: string;
  persona: string;
  story: string;
  useCase: string;
  rationale: string;
  plan: string;
  status: string;
  notes: string;
  configurable: string;
  hasFlag: string;
  flagKey: string;
  rbac: string;
}

interface ModuleSheet {
  no: number;
  nn: string;
  sheet: string;
  title: string;
  slug: string;
  moduleId: string;
  moduleName: string;
  code: string;
  features: Feature[];
}

interface RegistryModule {
  id: string;
  name: string;
  category: string;
  description: string;
  purpose: string;
  defaultState: string;
  plan: string;
  dependsOn: string;
  integrations: string;
  status: string;
  roadmap: string;
  updated: string;
}

interface Config {
  id: string;
  moduleId: string;
  featureId: string;
  name: string;
  key: string;
  type: string;
  defaultValue: string;
  allowed: string;
  description: string;
  why: string;
  impact: string;
  plan: string;
  risk: string;
  tenantConfigurable: string;
  dependsOn: string;
}

interface WorkflowStep {
  no: string;
  name: string;
  type: string;
  actor: string;
  mode: string;
  sla: string;
  escalation: string;
  bypass: string;
  tenantConfigurable: string;
  notes: string;
}
interface Workflow {
  id: string;
  moduleId: string;
  name: string;
  trigger: string;
  steps: WorkflowStep[];
}

interface Flag {
  id: string;
  moduleId: string;
  featureId: string;
  name: string;
  key: string;
  description: string;
  defaultState: string;
  scope: string;
  whoCanToggle: string;
  onEnable: string;
  onDisable: string;
  dependsOn: string;
  plan: string;
  status: string;
}

interface Integration {
  id: string;
  moduleIds: string[];
  name: string;
  type: string;
  trigger: string;
  data: string;
  keyConfig: string;
  auth: string;
  tenantConfigurable: string;
  required: string;
  configDeps: string;
  failure: string;
  status: string;
  notes: string;
}

interface Dependency {
  id: string;
  source: string;
  sourceName: string;
  target: string;
  targetName: string;
  type: string;
  condition: string;
  impact: string;
  notes: string;
}

if (!existsSync(WORKBOOK)) {
  console.error(`Workbook not found: ${WORKBOOK}`);
  process.exit(1);
}
const wb = XLSX.read(readFileSync(WORKBOOK), { type: "buffer" });

const modules: ModuleSheet[] = [];
let registry: RegistryModule[] = [];
let configs: Config[] = [];
let workflows: Workflow[] = [];
let flags: Flag[] = [];
let integrations: Integration[] = [];
let dependencies: Dependency[] = [];
/** README "MODULE TABS" block: sheet number → lifecycle stage heading. */
const lifecycleStage = new Map<number, string>();
const gaps: string[] = [];
/** Which sheet each reference table came from, for the Trace line. */
const sheetOf = { config: "", workflow: "", integration: "", dependency: "" };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

for (const sheet of wb.SheetNames) {
  const ws = wb.Sheets[sheet];

  const feat = readTable(ws, sheet, [/^Feature ID$/i, /^User Story/i]);
  if (feat) {
    const g = {
      id: col(feat, /^Feature ID/i),
      moduleId: col(feat, /^Module ID/i),
      moduleName: col(feat, /^Module Name/i),
      name: col(feat, /^Feature Name/i),
      category: col(feat, /^Feature Category/i),
      persona: col(feat, /^User Persona/i),
      story: col(feat, /^User Story/i),
      useCase: col(feat, /^Business Use Case/i),
      rationale: col(feat, /^Why This Feature Exists/i),
      plan: col(feat, /^Plan Required/i),
      status: col(feat, /^Status/i),
      notes: col(feat, /^Edge Cases/i),
      configurable: col(feat, /^Configurable/i),
      hasFlag: col(feat, /^Has Feature Flag/i),
      flagKey: col(feat, /^Feature Flag Key/i),
      rbac: col(feat, /^RBAC/i),
    };
    const features: Feature[] = feat.rows
      .filter((r) => /^FEAT-[A-Z]+-\d+/.test(g.id(r)))
      .map((r) => ({
        id: g.id(r),
        moduleId: g.moduleId(r),
        moduleName: g.moduleName(r),
        name: g.name(r),
        category: val(g.category(r)) || "Uncategorised",
        persona: val(g.persona(r)),
        story: val(g.story(r)),
        useCase: val(g.useCase(r)),
        rationale: val(g.rationale(r)),
        plan: val(g.plan(r)) || "All Plans",
        status: val(g.status(r)),
        notes: val(g.notes(r)),
        configurable: val(g.configurable(r)),
        hasFlag: val(g.hasFlag(r)),
        flagKey: val(g.flagKey(r)),
        rbac: val(g.rbac(r)),
      }));
    if (!features.length) continue;
    const m = sheet.match(/^(\d+)\.\s*(.+)$/);
    const no = m ? Number(m[1]) : modules.length + 2;
    const title = m ? m[2].trim() : sheet;
    // The module's case code is its Feature-ID prefix — the most common one on
    // the sheet, so a stray typo'd row does not rename the whole module.
    const prefixes = new Map<string, number>();
    for (const f of features) {
      const p = f.id.match(/^FEAT-([A-Z]+)-/)![1];
      prefixes.set(p, (prefixes.get(p) ?? 0) + 1);
    }
    const code = [...prefixes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    for (const f of features) {
      if (!f.id.startsWith(`FEAT-${code}-`)) gaps.push(`${f.id} sits on sheet "${sheet}" whose other features use FEAT-${code}-`);
    }
    modules.push({
      no,
      nn: String(no).padStart(2, "0"),
      sheet,
      title,
      slug: slugify(title),
      moduleId: features[0].moduleId,
      moduleName: features[0].moduleName || title,
      code,
      features,
    });
    continue;
  }

  const reg = readTable(ws, sheet, [/^Module ID$/i, /^Module Name$/i, /^Plan Availability/i]);
  if (reg) {
    const g = (re: RegExp) => col(reg, re);
    const [id, name, cat, desc, purpose, def, plan, deps, ints, status, road, upd] = [
      /^Module ID/i, /^Module Name/i, /^Category/i, /^Description/i, /^Business Purpose/i, /^Default State/i,
      /^Plan Availability/i, /^Depends On/i, /^Key Integrations/i, /^Status/i, /^Roadmap Notes/i, /^Last Updated/i,
    ].map(g);
    registry = reg.rows
      .filter((r) => /^MOD-\d+/.test(id(r)))
      .map((r) => ({
        id: id(r), name: name(r), category: val(cat(r)), description: val(desc(r)), purpose: val(purpose(r)),
        defaultState: val(def(r)), plan: val(plan(r)), dependsOn: val(deps(r)), integrations: val(ints(r)),
        status: val(status(r)), roadmap: val(road(r)), updated: val(upd(r)),
      }));
    continue;
  }

  const conf = readTable(ws, sheet, [/^Config ID$/i, /^Config Parameter/i]);
  if (conf) {
    sheetOf.config = sheet;
    const g = (re: RegExp) => col(conf, re);
    const f = {
      id: g(/^Config ID/i), moduleId: g(/^Module ID/i), featureId: g(/^Feature ID/i), name: g(/^Config Name/i),
      key: g(/^Config Parameter/i), type: g(/^Config Type/i), def: g(/^Default Value/i), allowed: g(/^Allowed Values/i),
      desc: g(/^Description/i), why: g(/^Why This Config/i), impact: g(/^Business Impact/i), plan: g(/^Plan Required/i),
      risk: g(/^Risk if Changed/i), tenant: g(/^Tenant/i), deps: g(/^Depends On/i),
    };
    configs = conf.rows
      .filter((r) => /^CONF-/.test(f.id(r)))
      .map((r) => ({
        id: f.id(r), moduleId: val(f.moduleId(r)), featureId: val(f.featureId(r)), name: f.name(r), key: val(f.key(r)),
        type: val(f.type(r)), defaultValue: val(f.def(r)), allowed: val(f.allowed(r)), description: val(f.desc(r)),
        why: val(f.why(r)), impact: val(f.impact(r)), plan: val(f.plan(r)) || "All Plans", risk: val(f.risk(r)),
        tenantConfigurable: val(f.tenant(r)), dependsOn: val(f.deps(r)),
      }));
    continue;
  }

  const wf = readTable(ws, sheet, [/^Workflow ID$/i, /^Step #/i]);
  if (wf) {
    sheetOf.workflow = sheet;
    const g = (re: RegExp) => col(wf, re);
    const f = {
      id: g(/^Workflow ID/i), moduleId: g(/^Module ID/i), name: g(/^Workflow Name/i), trigger: g(/^Trigger/i),
      no: g(/^Step #/i), step: g(/^Step Name/i), type: g(/^Step Type/i), actor: g(/^Actor/i), mode: g(/^Approval Mode/i),
      sla: g(/^SLA/i), esc: g(/^Escalation/i), bypass: g(/^Bypass/i), tenant: g(/^Tenant/i), notes: g(/^Notes/i),
    };
    const byId = new Map<string, Workflow>();
    for (const r of wf.rows) {
      const id = f.id(r);
      if (!/^WF-/.test(id)) continue;
      if (!byId.has(id)) byId.set(id, { id, moduleId: val(f.moduleId(r)), name: f.name(r), trigger: val(f.trigger(r)), steps: [] });
      byId.get(id)!.steps.push({
        no: f.no(r), name: f.step(r), type: val(f.type(r)), actor: val(f.actor(r)), mode: val(f.mode(r)),
        sla: val(f.sla(r)), escalation: val(f.esc(r)), bypass: val(f.bypass(r)), tenantConfigurable: val(f.tenant(r)),
        notes: val(f.notes(r)),
      });
    }
    workflows = [...byId.values()];
    continue;
  }

  const ff = readTable(ws, sheet, [/^Flag ID$/i, /^Flag Key/i]);
  if (ff) {
    const g = (re: RegExp) => col(ff, re);
    const f = {
      id: g(/^Flag ID/i), moduleId: g(/^Module ID/i), featureId: g(/^Feature ID/i), name: g(/^Flag Name/i), key: g(/^Flag Key/i),
      desc: g(/^Description/i), def: g(/^Default State/i), scope: g(/^Scope/i), who: g(/^Who Can Toggle/i),
      on: g(/^Impact of Enabling/i), off: g(/^Impact of Disabling/i), deps: g(/^Depends On/i), plan: g(/^Plan Required/i),
      status: g(/^Status/i),
    };
    flags = ff.rows
      .filter((r) => /^FF-/.test(f.id(r)))
      .map((r) => ({
        id: f.id(r), moduleId: val(f.moduleId(r)), featureId: val(f.featureId(r)), name: f.name(r), key: val(f.key(r)),
        description: val(f.desc(r)), defaultState: val(f.def(r)), scope: val(f.scope(r)), whoCanToggle: val(f.who(r)),
        onEnable: val(f.on(r)), onDisable: val(f.off(r)), dependsOn: val(f.deps(r)), plan: val(f.plan(r)), status: val(f.status(r)),
      }));
    continue;
  }

  const it = readTable(ws, sheet, [/^Integration ID$/i, /^Failure Handling/i]);
  if (it) {
    sheetOf.integration = sheet;
    const g = (re: RegExp) => col(it, re);
    const f = {
      id: g(/^Integration ID/i), mods: g(/^Module ID/i), name: g(/^Integration Name/i), type: g(/^Integration Type/i),
      trigger: g(/^Trigger/i), data: g(/^Data Exchanged/i), keys: g(/^Key Config/i), auth: g(/^Auth/i), tenant: g(/^Tenant/i),
      req: g(/^Required for Module/i), deps: g(/^Config Dependencies/i), fail: g(/^Failure Handling/i), status: g(/^Status/i),
      notes: g(/^Notes/i),
    };
    integrations = it.rows
      .filter((r) => /^INT-/.test(f.id(r)))
      .map((r) => ({
        id: f.id(r), moduleIds: (f.mods(r).match(/MOD-\d+/g) ?? []), name: f.name(r), type: val(f.type(r)),
        trigger: val(f.trigger(r)), data: val(f.data(r)), keyConfig: val(f.keys(r)), auth: val(f.auth(r)),
        tenantConfigurable: val(f.tenant(r)), required: val(f.req(r)), configDeps: val(f.deps(r)), failure: val(f.fail(r)),
        status: val(f.status(r)), notes: val(f.notes(r)),
      }));
    continue;
  }

  const dep = readTable(ws, sheet, [/^Dep\.? ID$/i, /^Impact if Missing/i]);
  if (dep) {
    sheetOf.dependency = sheet;
    const g = (re: RegExp) => col(dep, re);
    const f = {
      id: g(/^Dep\.? ID/i), src: g(/^Source \(/i), srcName: g(/^Source Name/i), tgt: g(/^Depends On/i),
      tgtName: g(/^Dependency Target/i), type: g(/^Dependency Type/i), cond: g(/^Condition/i), impact: g(/^Impact/i),
      notes: g(/^Notes/i),
    };
    dependencies = dep.rows
      .filter((r) => /^DEP-/.test(f.id(r)))
      .map((r) => ({
        id: f.id(r), source: val(f.src(r)), sourceName: val(f.srcName(r)), target: val(f.tgt(r)),
        targetName: val(f.tgtName(r)), type: val(f.type(r)), condition: val(f.cond(r)), impact: val(f.impact(r)),
        notes: val(f.notes(r)),
      }));
    continue;
  }

  // README: the MODULE TABS block names the lifecycle stage of each sheet.
  if (/readme/i.test(sheet)) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
    let inTabs = false;
    let stage = "";
    for (const raw of grid) {
      const a = clean(raw[0]);
      const b = clean(raw[1]);
      if (/^MODULE TABS/i.test(a)) { inTabs = true; continue; }
      if (!inTabs) continue;
      if (/^(Note:|EACH MODULE|FORMATTING)/i.test(a)) break;
      const tab = a.match(/^(\d+)\.\s/);
      if (tab && b) lifecycleStage.set(Number(tab[1]), stage);
      else if (a && !b && !/^Module$/i.test(a)) stage = a;
    }
  }
}

modules.sort((a, b) => a.no - b.no);
const features = modules.flatMap((m) => m.features);
const featureById = new Map(features.map((f) => [f.id, f]));
const moduleSheetById = new Map(modules.map((m) => [m.moduleId, m]));
const registryById = new Map(registry.map((r) => [r.id, r]));
const configById = new Map(configs.map((c) => [c.id, c]));
const flagById = new Map(flags.map((f) => [f.id, f]));

// ─── 3. Resolving cross-references ────────────────────────────────────────

/** Which module an id belongs to: its own row first, else a sibling with the same prefix. */
function moduleOfRef(ref: string): string | undefined {
  if (featureById.has(ref)) return featureById.get(ref)!.moduleId;
  if (configById.has(ref)) return configById.get(ref)!.moduleId || undefined;
  if (flagById.has(ref)) return flagById.get(ref)!.moduleId || undefined;
  const p = ref.match(/^(CONF|FEAT)-([A-Z]+)-/);
  if (!p) return undefined;
  const viaConf = configs.find((c) => c.id.startsWith(`CONF-${p[2]}-`) && c.moduleId);
  if (viaConf) return viaConf.moduleId;
  const viaFeat = features.find((f) => f.id.startsWith(`FEAT-${p[2]}-`));
  return viaFeat?.moduleId;
}

function describeRef(ref: string): string {
  const c = configById.get(ref);
  if (c) return `${ref} "${c.name}"${c.key ? ` (\`${c.key}\`)` : ""}`;
  const f = featureById.get(ref);
  if (f) return `${ref} "${f.name}"`;
  const fl = flagById.get(ref);
  if (fl) return `${ref} "${fl.name}"${fl.key ? ` (\`${fl.key}\`)` : ""}`;
  return ref;
}

/** Every referenced id that the workbook does not define — reported, never guessed. */
const undefinedRefs = new Map<string, Set<string>>();
function noteUndefined(ref: string, where: string) {
  if (featureById.has(ref) || configById.has(ref) || flagById.has(ref) || registryById.has(ref)) return;
  if (/^(INT|WF|DEP)-/.test(ref)) return;
  if (!undefinedRefs.has(ref)) undefinedRefs.set(ref, new Set());
  undefinedRefs.get(ref)!.add(where);
}
for (const d of dependencies) {
  noteUndefined(d.source, d.id);
  noteUndefined(d.target, d.id);
}
for (const i of integrations) for (const r of `${i.configDeps} ${i.notes}`.match(/\b(?:CONF|FF|FEAT)-[A-Z]*-?\d+\b/g) ?? []) noteUndefined(r, i.id);
for (const c of configs) for (const r of c.dependsOn.match(/\bCONF-[A-Z]+-\d+\b/g) ?? []) noteUndefined(r, c.id);

/** Config ↔ feature: the sheet-25 Feature ID column, plus "CONF-…" mentions in a feature's notes. */
const configsForFeature = new Map<string, Config[]>();
const primaryFeatureOfConfig = new Map<string, string>();
for (const c of configs) {
  const linked: string[] = [];
  if (c.featureId && featureById.has(c.featureId)) linked.push(c.featureId);
  else if (c.featureId) gaps.push(`${c.id} names feature ${c.featureId}, which no module sheet defines`);
  for (const f of features) if (f.notes.includes(c.id) && !linked.includes(f.id)) linked.push(f.id);
  if (linked[0]) primaryFeatureOfConfig.set(c.id, linked[0]);
  for (const fid of linked) {
    if (!configsForFeature.has(fid)) configsForFeature.set(fid, []);
    configsForFeature.get(fid)!.push(c);
  }
  if (c.featureId && featureById.has(c.featureId)) {
    const mentioned = features.filter((f) => f.id !== c.featureId && f.notes.includes(c.id));
    for (const f of mentioned) gaps.push(`${c.id} (${c.name}) is mapped to ${c.featureId} in the Configuration Reference, but ${f.id}'s notes say "${f.notes}" — the config's cases are generated under ${c.featureId}`);
  }
  if (c.moduleId && !moduleSheetById.has(c.moduleId)) gaps.push(`${c.id} belongs to ${c.moduleId}, which has no module sheet`);
}

/** Plan tiers, ordered low → high by how many plan lists include them. */
const planLists = [...features.map((f) => f.plan), ...configs.map((c) => c.plan), ...registry.map((r) => r.plan)].filter(
  (p) => p && !/^all plans$/i.test(p),
);
const planCount = new Map<string, number>();
for (const p of planLists) for (const t of p.split(/\s*,\s*/)) planCount.set(t, (planCount.get(t) ?? 0) + 1);
const tiers = [...planCount.keys()].sort((a, b) => planCount.get(a)! - planCount.get(b)! || a.localeCompare(b));
const isAllPlans = (p: string) => !p || /^all plans$/i.test(p);
const planSet = (p: string) => p.split(/\s*,\s*/).filter(Boolean);
/** The lowest plan on which the feature is available — the boundary a happy path should sit on. */
function lowestPlan(p: string): string {
  if (isAllPlans(p)) return "any plan";
  const s = planSet(p);
  return tiers.find((t) => s.includes(t)) ?? s[0];
}
/** A plan the feature is NOT on: the highest named tier outside its list, else an unnamed lower plan. */
/** Short form for a title: "the Growth plan" / "plans below Growth". */
function lowerPlanShort(p: string): string {
  const s = planSet(p);
  const outside = tiers.filter((t) => !s.includes(t));
  return outside.length ? `the ${outside[outside.length - 1]} plan` : `plans below ${lowestPlan(p)}`;
}
function lowerPlan(p: string): string {
  const s = planSet(p);
  const outside = tiers.filter((t) => !s.includes(t));
  return outside.length ? `the ${outside[outside.length - 1]} plan` : `a plan below ${lowestPlan(p)} (any plan not listed in "${p}")`;
}

// ─── 4. Text helpers ──────────────────────────────────────────────────────

const stripDot = (s: string) => s.replace(/[.\s]+$/, "");
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lc1 = (s: string) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const short = (s: string, n = 80) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const isRoadmap = (f: Feature) => /roadmap/i.test(f.status);
const isGA = (f: Feature) => /^GA\b/i.test(f.status);
/** "an AP Executive", "an MDM team", "a Buyer" — acronyms go by their spoken first letter. */
const article = (w: string) => (/^[A-Z]{2}/.test(w) ? (/^[AEFHILMNORSX]/.test(w) ? "an" : "a") : /^[aeiou]/i.test(w) ? "an" : "a");

/** First-person story text → third person, so a step reads as an instruction. */
function thirdPerson(s: string): string {
  return s
    .replace(/\bI can\b/g, "they can")
    .replace(/\bI'm\b/g, "they are")
    .replace(/\bI am\b/g, "they are")
    .replace(/\bI\b/g, "they")
    .replace(/\bmy\b/g, "their")
    .replace(/\bme\b/g, "them")
    .replace(/\bour organization\b/gi, "the organisation")
    .replace(/\bour\b/g, "the organisation's")
    .replace(/\bOur\b/g, "The organisation's");
}

interface Story {
  action: string;
  benefit: string;
  /** The action began "to …", so it can be phrased as an imperative step. */
  imperative: boolean;
}
function parseStory(story: string): Story | null {
  const m = story.match(/^As an? .+?,\s*I want (to )?(.+?),?\s+so that (.+?)\.?$/i);
  if (!m) return null;
  return { imperative: !!m[1], action: stripDot(m[2]), benefit: stripDot(m[3].replace(/^I can /i, "")) };
}

function actionStep(f: Feature): string {
  const s = parseStory(f.story);
  if (!s) return `Carry out what the user story describes: "${stripDot(f.story)}".`;
  if (s.imperative) return `${cap(thirdPerson(s.action))}.`;
  return `Use ${f.name} to get what the story asks for: ${thirdPerson(s.action)}.`;
}
/** The same action as an inline clause: "Use <feature> to …". */
function useFeature(f: Feature): string {
  const s = parseStory(f.story);
  if (!s) return `Use ${f.name} as the user story describes ("${stripDot(f.story)}").`;
  return `Use ${f.name} to ${s.imperative ? lc1(thirdPerson(s.action)) : `get ${thirdPerson(s.action)}`}.`;
}
function benefitText(f: Feature): string {
  const s = parseStory(f.story);
  return s ? thirdPerson(s.benefit) : stripDot(f.story);
}

// ─── 5. Test-case model ───────────────────────────────────────────────────

type Kind = "happy" | "edge" | "edge-perm" | "edge-cosmetic" | "config-note" | "config" | "plan" | "perm" | "workflow" | "workflow-config" | "integration" | "integration-failure" | "dependency";

interface Case {
  title: string;
  why: string;
  setup: string[];
  steps: string[];
  expected: string;
  oracle: string;
  priority: string;
  verdict: "manual" | "automate-later";
  refs: string[];
  /** Filled at render time. */
  id?: string;
  kind: Kind;
  featureId?: string;
  /** The workbook sheet the case came from, when it is not the feature's own sheet. */
  sheet?: string;
}

const MONEY_NAME = /\b(PO|purchase order|invoice|match|3-way|2-way|4-way|budget|credit|debit|payment|approv\w*|DoA|tax|TDS|GST|accrual|tolerance|short close|cancel)\b/i;
const REPORTING_CODES = new Set(["RPT", "ANL"]);

function priorityFor(kind: Kind, f?: Feature, code?: string): string {
  if (f && isRoadmap(f)) return "P3";
  switch (kind) {
    case "happy":
      if (f && isGA(f) && (/^(core|compliance)$/i.test(f.category) || MONEY_NAME.test(f.name))) return "P0";
      return "P1";
    case "workflow":
      return "P0";
    case "edge":
      if (f && (/reporting/i.test(f.category) || (code && REPORTING_CODES.has(code)))) return "P3";
      return "P2";
    case "edge-cosmetic":
      return "P3";
    case "integration-failure":
      return "P2";
    default:
      return "P1"; // every gate: plan, permission, config, dependency, integration happy path
  }
}
function verdictFor(kind: Kind, f?: Feature): "manual" | "automate-later" {
  if (f && isRoadmap(f)) return "manual";
  return ["plan", "perm", "config", "workflow", "workflow-config", "integration", "integration-failure", "dependency"].includes(kind)
    ? "automate-later"
    : "manual";
}

// ─── 6. Feature → cases ───────────────────────────────────────────────────

type NoteKind = "ref" | "context" | "config" | "perm" | "cosmetic" | "rbac" | "edge";
/** Split an Edge Cases / Notes cell into atomic statements and classify each. */
function noteAtoms(notes: string): Array<{ text: string; kind: NoteKind }> {
  if (!notes) return [];
  const atoms = notes
    .split(/;\s*/)
    .flatMap((p) => p.split(/(?<=[a-z0-9)])\.\s+(?=[A-Z])/))
    .map((s) => stripDot(s.trim()))
    .filter((s) => s && !blank(s));
  return atoms.map((text) => {
    let kind: NoteKind = "edge";
    if (/^(cross-links?|realized in|see (the )?|orchestrates|shared across|mirrors|this mirrors|maps to conf-|supersedes|most-shipped|flagship|analytics module otherwise|cross-cutting|parked|already flagged|set at implementation|non-integrated counterpart|one of two intake paths|ticketing is a provisional|po-amendment template implies|likely )/i.test(text)) kind = "ref";
    else if (/^rbac-gated$/i.test(text)) kind = "rbac";
    else if (/^(depends on|rate api|relevant mainly|typically applies|particularly relevant|from master-data|feasibility-pending|defaults set in|pulls from|specs from)/i.test(text)) kind = "context";
    else if (/(tenant[- ]config|configurable|are tenant config|is tenant config)/i.test(text)) kind = "config";
    else if (/(hidden from|never visible|cannot edit|scoped only|should not conflict with audit)/i.test(text)) kind = "perm";
    else if (/(highlight|filterable|filtering|filter\b|widget|saved view|\bUX\b|label)/i.test(text)) kind = "cosmetic";
    return { text, kind };
  });
}

function refsIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:MOD-\d+|INT-\d+|WF-[A-Z]+-\d+|CONF-[A-Z]+-\d+|FF-\d+)\b/g) ?? [])];
}

function personaLine(f: Feature): string {
  return f.persona ? `Persona: ${f.persona}` : "Persona: not named in the workbook";
}
function planLine(f: Feature): string {
  return isAllPlans(f.plan)
    ? `Plan: any tenant (Plan Required: All Plans)`
    : `Plan: tenant on ${lowestPlan(f.plan)} (lowest plan with access; Plan Required: ${f.plan})`;
}
function statusLine(f: Feature): string {
  return isRoadmap(f)
    ? `Status: ${f.status} — this is an acceptance specification; run it once the feature ships`
    : `Status: ${f.status || "not stated"}`;
}
function configLine(f: Feature): string[] {
  const cs = configsForFeature.get(f.id) ?? [];
  return cs.map((c) => `gate: \`${c.key}\` at its default (${c.defaultValue || "no default stated"}) — ${c.id} "${c.name}"`);
}
function traceRefs(f: Feature, extra: string[] = []): string[] {
  const cs = configsForFeature.get(f.id) ?? [];
  return [...new Set([f.id, ...cs.map((c) => c.key), ...extra, ...refsIn(f.notes).filter((r) => !r.startsWith("CONF-"))])];
}

function featureCases(f: Feature, m: ModuleSheet): Case[] {
  const out: Case[] = [];
  const roadmapTag = isRoadmap(f) ? "[Roadmap] " : "";
  const atoms = noteAtoms(f.notes);
  const context = atoms.filter((a) => a.kind === "context").map((a) => a.text);
  const rbacNoted = atoms.some((a) => a.kind === "rbac");
  const persona = f.persona || "the feature's user";
  const base = (kind: Kind, c: Omit<Case, "priority" | "verdict" | "kind" | "featureId">): Case => ({
    ...c,
    kind,
    featureId: f.id,
    priority: priorityFor(kind, f, m.code),
    verdict: verdictFor(kind, f),
  });

  // a) happy path
  out.push(
    base("happy", {
      title: `${roadmapTag}${f.name}: happy path for the ${persona}`,
      why: `${f.rationale ? stripDot(f.rationale) + "." : ""} ${f.useCase ? `Business use: ${stripDot(f.useCase)}.` : ""}`.trim() ||
        `The workbook lists ${f.name} as a ${f.category} feature of ${m.moduleName}.`,
      setup: [
        personaLine(f),
        planLine(f),
        statusLine(f),
        ...configLine(f),
        ...context.map((c) => `Context from the workbook: ${c}`),
      ],
      steps: [
        `Sign in as ${article(persona)} ${persona} on the tenant described in Setup and open ${m.moduleName}.`,
        actionStep(f),
        ...(f.useCase ? [`Follow the business scenario the workbook gives: "${stripDot(f.useCase)}".`] : []),
        `Check the result against the story's promised outcome.`,
      ],
      expected: `The ${persona} achieves the story's outcome: ${lc1(benefitText(f))}.${f.useCase ? ` The business use case is served: ${lc1(stripDot(f.useCase))}.` : ""}`,
      oracle: `Observable proof that ${f.name} did its job for the ${persona} — the outcome in Expected is visible in Procol after the last step, with no error, on the plan in Setup. Any gap is a defect against ${f.id}.`,
      refs: traceRefs(f),
    }),
  );

  // b) edge cases, one per atomic note
  for (const a of atoms) {
    if (a.kind === "ref" || a.kind === "context" || a.kind === "rbac") continue;
    const should = /^should\b/i.test(a.text);
    if (a.kind === "config") {
      out.push(
        base("config-note", {
          title: `${roadmapTag}${f.name}: tenant configuration — ${short(a.text)}`,
          why: `The workbook says "${a.text}". A setting a tenant can change is a gate: the feature must follow whatever the tenant chose, for every allowed choice.`,
          setup: [
            `Persona: Tenant Admin (to change the setting) and ${persona} (to use the feature)`,
            planLine(f),
            statusLine(f),
            `The Configuration Reference sheet names no config key for this; the setting is the one the note describes.`,
          ],
          steps: [
            `As a Tenant Admin, find the tenant setting the note refers to ("${a.text}") and record its current value.`,
            `As the ${persona}: ${lc1(useFeature(f))}`,
            `Change the setting to a different allowed value, then repeat step 2.`,
          ],
          expected: `In both runs ${f.name} follows the tenant's configured value, as the workbook states: "${a.text}". Changing the setting changes the behaviour accordingly.`,
          oracle: `The behaviour observed in step 2 and step 3 differs exactly as the two configured values dictate; identical behaviour under different settings means the setting is ignored.`,
          refs: traceRefs(f),
        }),
      );
      continue;
    }
    const kind: Kind = a.kind === "perm" ? "edge-perm" : a.kind === "cosmetic" ? "edge-cosmetic" : "edge";
    out.push(
      base(kind === "edge-perm" ? "perm" : kind, {
        title: `${roadmapTag}${f.name}: ${short(lc1(a.text))}`,
        why: `The workbook records this ${kind === "edge-perm" ? "access rule" : "edge case"} for ${f.name}: "${a.text}".${should ? " It is stated as a requirement (\"should\"), so a product that does otherwise falls short of the spec." : ""}`,
        setup: [personaLine(f), planLine(f), statusLine(f), ...configLine(f)],
        steps: [
          `Sign in as ${article(persona)} ${persona} on the tenant described in Setup.`,
          `Set up the situation the note describes: "${a.text}".`,
          useFeature(f),
          `Observe how the feature handles the situation from step 2.`,
        ],
        expected: `${f.name} behaves as the workbook states: "${a.text}".`,
        oracle: `The observed outcome for the situation in step 2 matches the note; if Procol behaves differently, raise it against ${f.id} quoting the note.`,
        refs: traceRefs(f),
      }),
    );
  }

  // c) sheet-25 configs whose primary feature is this one
  for (const c of configsForFeature.get(f.id) ?? []) {
    if (primaryFeatureOfConfig.get(c.id) !== f.id) continue;
    out.push(...configCases(c, f, m));
  }

  // d) plan gating
  if (!isAllPlans(f.plan)) {
    const lower = lowerPlan(f.plan);
    out.push(
      base("plan", {
        title: `${roadmapTag}${f.name}: not available on ${lowerPlanShort(f.plan)}`,
        why: `The workbook limits ${f.name} to "${f.plan}". A tenant on a lower plan must not get it, or plan packaging is not enforced.`,
        setup: [personaLine(f), `Plan: tenant on ${lower} (Plan Required: ${f.plan})`, statusLine(f)],
        steps: [
          `Sign in as ${article(persona)} ${persona} on the lower-plan tenant.`,
          `Try it: ${lc1(useFeature(f))}`,
          `Repeat on a tenant on ${lowestPlan(f.plan)}.`,
        ],
        expected: `On ${lower} the capability is not available to use. On ${lowestPlan(f.plan)} the same steps work.`,
        oracle: `Same user role, same steps, different plan: refused or absent on the lower plan, available on ${lowestPlan(f.plan)}.`,
        refs: traceRefs(f),
      }),
    );
  }

  // e) permission negative
  if (f.persona && !/^all users$/i.test(f.persona)) {
    out.push(
      base("perm", {
        title: `${roadmapTag}${f.name}: refused for a user without the ${f.persona} role`,
        why: `The workbook names ${f.persona} as the user of ${f.name}${rbacNoted ? " and marks it RBAC-gated" : ""}. If any role can do it, the intended separation of duties is gone.`,
        setup: [
          `Persona: a user who holds none of these roles: ${f.persona}`,
          planLine(f),
          statusLine(f),
        ],
        steps: [
          `Sign in as that user on the tenant described in Setup.`,
          `Try it: ${lc1(useFeature(f))}`,
          `Repeat as ${article(f.persona)} ${f.persona}.`,
        ],
        expected: `The user without the role cannot carry out the action — Procol refuses it or does not offer it — while the ${f.persona} can. (If the tenant's RBAC deliberately grants it to more roles, record that configuration rather than a defect.)`,
        oracle: `Same tenant, same steps, different role: refused or absent for the other user, available to the ${f.persona}.`,
        refs: traceRefs(f),
      }),
    );
  }
  return out;
}

// ─── 7. Config rows → cases ───────────────────────────────────────────────

function configCases(c: Config, f: Feature | undefined, m: ModuleSheet | undefined): Case[] {
  const out: Case[] = [];
  const allowed = c.allowed.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  const defaults = c.defaultValue.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  const who = /^yes/i.test(c.tenantConfigurable) ? "Tenant Admin" : "Procol implementation team (not tenant-configurable)";
  const featureStep = f ? `As ${article(f.persona || "user")} ${f.persona || "user"}: ${lc1(useFeature(f))}` : `Exercise the behaviour the config controls: ${lc1(c.description)}.`;
  const refs = [...new Set([...(f ? [f.id] : []), c.key, c.id])];
  const setupBase = (value: string) => [
    `Persona: ${who}${f?.persona && f.persona !== who ? ` and ${f.persona}` : ""}`,
    `Plan: ${isAllPlans(c.plan) ? "any tenant (Plan Required: All Plans)" : `tenant on ${lowestPlan(c.plan)} (Plan Required: ${c.plan})`}`,
    `gate: \`${c.key}\` = ${value}${defaults.length ? ` (default: ${c.defaultValue})` : ""} — ${c.id} "${c.name}", ${c.type}${c.risk ? `, risk if changed: ${c.risk}` : ""}`,
    ...(f && isRoadmap(f) ? [statusLine(f)] : []),
  ];
  const mk = (title: string, value: string, expected: string, oracle: string, why?: string): Case => ({
    kind: "config",
    sheet: sheetOf.config,
    featureId: f?.id,
    title: `${c.name} (${c.key}) = ${title}`,
    why: why ?? `${stripDot(c.why)}.`,
    setup: setupBase(value),
    steps: [`As the ${who.split(" (")[0]}, set \`${c.key}\` to ${value}.`, featureStep, `Observe the behaviour the setting controls: ${lc1(stripDot(c.description))}.`],
    expected,
    oracle,
    priority: priorityFor("config", f, m?.code),
    verdict: verdictFor("config", f),
    refs,
  });
  const describe = `What the setting controls: ${stripDot(c.description)}.`;
  const impact = c.impact ? ` Stated business impact: ${stripDot(c.impact)}.` : "";
  const range = c.allowed.match(/^(-?\d+)\s*[–-]\s*(-?\d+)$/);

  if (/toggle/i.test(c.type) && allowed.length) {
    for (const v of allowed) {
      const isDef = v === c.defaultValue;
      out.push(
        mk(
          `${v}${isDef ? " (default)" : ""}`,
          v,
          `With the setting ${v}, the behaviour follows it. ${describe}${impact}`,
          `The behaviour in step 3 matches the ${v} setting; compare with the case for the other value — they must differ as the description states.`,
        ),
      );
    }
  } else if (range) {
    const [min, max] = [Number(range[1]), Number(range[2])];
    const def = Number(c.defaultValue);
    const values: Array<[string, number, boolean]> = [];
    if (!Number.isNaN(def)) values.push([`${def} (default)`, def, true]);
    if (min !== def) values.push([`${min} (minimum)`, min, true]);
    if (max !== def) values.push([`${max} (maximum)`, max, true]);
    values.push([`${min - 1} (below the allowed range)`, min - 1, false]);
    values.push([`${max + 1} (above the allowed range)`, max + 1, false]);
    for (const [title, v, ok] of values) {
      out.push(
        ok
          ? mk(title, String(v), `The value ${v} is accepted and takes effect. ${describe}${impact}`, `The behaviour in step 3 reflects the value ${v} exactly (the boundary of ${c.allowed} is honoured).`)
          : {
              ...mk(title, String(v), `The value ${v} is not accepted: the allowed range is ${c.allowed}.`, `Saving ${v} is refused; the stored value of \`${c.key}\` is not ${v}.`),
              steps: [`As the ${who.split(" (")[0]}, try to set \`${c.key}\` to ${v}.`, `Check the value that is actually stored.`],
            },
      );
    }
  } else if (/multi/i.test(c.type) && allowed.length) {
    out.push(mk(`default set (${c.defaultValue})`, c.defaultValue, `Exactly the default set applies: ${c.defaultValue}. ${describe}`, `The behaviour in step 3 reflects each default value and none of the others.`));
    const extra = allowed.filter((a) => !defaults.includes(a));
    if (extra.length) {
      out.push(
        mk(
          `default plus ${extra.join(", ")}`,
          [...defaults, ...extra].join(", "),
          `Every allowed value is accepted and applies: ${allowed.join(", ")}. ${describe}`,
          `The behaviour in step 3 reflects all ${allowed.length} allowed values.`,
        ),
      );
    }
    for (const d of defaults) {
      out.push(
        mk(
          `default without ${d}`,
          defaults.filter((x) => x !== d).join(", ") || "(empty)",
          `${d} no longer applies while the remaining values do. ${describe}${c.impact.toLowerCase().includes(d.toLowerCase()) ? impact : ""}`,
          `The behaviour in step 3 no longer reflects ${d}; the other default values still apply.`,
        ),
      );
    }
  } else if (allowed.length) {
    // Dropdown and anything else with an enumerated list: every allowed value.
    for (const v of allowed) {
      const isDef = v === c.defaultValue;
      out.push(
        mk(
          `${v}${isDef ? " (default)" : ""}`,
          v,
          `With ${v} selected, the behaviour follows it. ${describe}${isDef ? "" : impact}`,
          `The behaviour in step 3 matches ${v}${isDef ? "" : " and differs from the default"}.`,
        ),
      );
    }
  } else {
    out.push(mk(`${c.defaultValue || "its default"}`, c.defaultValue || "its default", `${describe}${impact}`, `The behaviour in step 3 matches the configured value.`));
  }

  if (!isAllPlans(c.plan)) {
    const lower = lowerPlan(c.plan);
    out.push({
      kind: "plan",
      sheet: sheetOf.config,
      featureId: f?.id,
      title: `${c.name} (${c.key}): not available on ${lowerPlanShort(c.plan)}`,
      why: `The Configuration Reference limits ${c.name} to "${c.plan}".`,
      setup: [`Persona: ${who}`, `Plan: tenant on ${lower} (Plan Required: ${c.plan})`, `gate: \`${c.key}\` — ${c.id}`],
      steps: [`As the ${who.split(" (")[0]} on the lower-plan tenant, try to change \`${c.key}\`.`, `Repeat on a tenant on ${lowestPlan(c.plan)}.`],
      expected: `On ${lower} the setting is not available to change. On ${lowestPlan(c.plan)} it is.`,
      oracle: `The setting is absent or refused on the lower plan and available on ${lowestPlan(c.plan)}.`,
      priority: priorityFor("plan", f, m?.code),
      verdict: verdictFor("plan", f),
      refs,
    });
  }
  return out;
}

// ─── 8. Workflows (sheet 26) → cases ──────────────────────────────────────

const AMOUNT = /amount\s*(≤|<=|<|≥|>=|>)\s*([A-Z]{3})?\s*([\d,]+(?:\.\d+)?)/i;

function workflowCases(w: Workflow, m: ModuleSheet | undefined): Case[] {
  const out: Case[] = [];
  const code = m?.code;
  const refs = [w.id];
  const wf = (kind: Kind, c: Omit<Case, "priority" | "verdict" | "kind" | "refs"> & { refs?: string[] }): Case => ({
    ...c,
    kind,
    refs: c.refs ?? refs,
    priority: priorityFor(kind, undefined, code),
    verdict: verdictFor(kind),
  });
  const order = w.steps.map((s) => `${s.no}. ${s.name} (${s.actor || s.type})`).join(" → ");

  out.push(
    wf("workflow", {
      title: `${w.name} (${w.id}): end-to-end order of steps`,
      why: `Every ${w.name.toLowerCase()} must pass through the same governed chain; a skipped or reordered step is a control failure.`,
      setup: [`Trigger: ${w.trigger}`, `Workflow ${w.id} as configured in the workbook (${w.steps.length} steps)`],
      steps: [
        `Cause the trigger: ${lc1(w.trigger)}.`,
        ...w.steps.map((s) => `Let step ${s.no} "${s.name}" (${s.type || "step"}, ${s.actor || "actor not stated"}) complete${s.type && /approval/i.test(s.type) ? " with an approval" : ""}.`),
      ],
      expected: `The steps run in this order: ${order}.${w.steps.at(-1)?.notes ? ` At the end: ${stripDot(w.steps.at(-1)!.notes)}.` : ""}`,
      oracle: `The workflow's history shows each step, its actor and its outcome in the order above, and nothing out of sequence.`,
    }),
  );

  for (const s of w.steps) {
    const stepRef = `${w.id} step ${s.no}`;
    const isApproval = /approval/i.test(s.type);
    const last = s === w.steps.at(-1);
    const gatedOnPrior = /^all (prior steps|approvals)/i.test(s.bypass);
    if (!isApproval) {
      // System validation / system action: the "Bypass Condition" column reads as the condition to proceed.
      const blocks = s.notes.match(/blocks if ([^;.]+)/i)?.[1];
      out.push(
        wf("workflow", {
          title: `${w.name}: step ${s.no} "${s.name}" runs automatically`,
          why: `Step ${s.no} is a ${s.type || "system"} step performed by ${s.actor || "the system"}; if it does not run, everything after it rests on an unchecked premise.`,
          setup: [`Trigger: ${w.trigger}`, ...(s.bypass ? [`Condition stated for this step: ${s.bypass}`] : [])],
          steps: [
            `Cause the trigger: ${lc1(w.trigger)}${s.bypass ? `, with the condition met (${lc1(s.bypass)})` : ""}.`,
            `Let the workflow reach step ${s.no} "${s.name}".`,
          ],
          expected: `Step ${s.no} is carried out by ${s.actor || "the system"}${/\(auto\)/i.test(s.actor) ? " without manual action" : ""}${s.notes ? ` (workbook: "${stripDot(s.notes)}")` : ""}, and the workflow ${last ? "completes" : "moves on"}.`,
          oracle: `The workflow history records step ${s.no} as done by ${s.actor || "the system"} and ${last ? "the workflow as complete" : `step ${Number(s.no) + 1} becomes active`}.`,
          refs: [w.id, stepRef],
        }),
      );
      if (s.bypass && !gatedOnPrior) {
        out.push(
          wf("workflow", {
            title: `${w.name}: step ${s.no} "${s.name}" holds when "${short(s.bypass, 60)}" is not true`,
            why: `The step's stated condition is "${s.bypass}". A workflow that proceeds without it lets an incomplete item through.`,
            setup: [`Trigger: ${w.trigger}`, `Condition NOT met: ${s.bypass}`],
            steps: [`Cause the trigger with the condition not met ("${s.bypass}" does not hold).`, `Let the workflow reach step ${s.no}.`],
            expected: `The workflow does not move past step ${s.no} "${s.name}".`,
            oracle: `${Number(s.no) < w.steps.length ? `Step ${Number(s.no) + 1}` : "Completion"} never becomes active while the condition is unmet.`,
            refs: [w.id, stepRef],
          }),
        );
      }
      if (gatedOnPrior) {
        out.push(
          wf("workflow", {
            title: `${w.name}: step ${s.no} "${s.name}" does not happen until ${lc1(s.bypass)}`,
            why: `Step ${s.no} is gated on "${s.bypass}"; running it early would act on an unapproved item.`,
            setup: [`Trigger: ${w.trigger}`, `One earlier approval step still pending`],
            steps: [`Cause the trigger.`, `Leave one earlier approval step pending.`, `Check whether step ${s.no} has run.`],
            expected: `Step ${s.no} "${s.name}" has not run${s.notes ? ` — so none of this has happened yet: ${stripDot(s.notes)}` : ""}.`,
            oracle: `No record of step ${s.no} exists while any earlier step is pending.`,
            refs: [w.id, stepRef],
          }),
        );
      }
      if (blocks) {
        out.push(
          wf("workflow", {
            title: `${w.name}: step ${s.no} "${s.name}" blocks if ${blocks}`,
            why: `The workbook says the step "${s.notes}". Letting the item through defeats the check.`,
            setup: [`Trigger: ${w.trigger}`, `Workbook note for the step: ${s.notes}`],
            steps: [`Cause the trigger with an item for which the step's check fails — the "${blocks}" case the note describes.`, `Let the workflow reach step ${s.no}.`],
            expected: `The workflow is blocked at step ${s.no} "${s.name}".`,
            oracle: `No later step becomes active; the item is shown as blocked at step ${s.no}.`,
            refs: [w.id, stepRef],
          }),
        );
      }
      continue;
    }

    // Approval step: routing + approval mode
    const parallel = s.mode.match(/parallel with step\s*(\d+)/i)?.[1];
    out.push(
      wf("workflow", {
        title: `${w.name}: step ${s.no} "${s.name}" routes to ${s.actor}`,
        why: `Approval ${s.no} belongs to ${s.actor}; routing it anywhere else puts the decision in the wrong hands.`,
        setup: [`Trigger: ${w.trigger}`, `Approval mode: ${s.mode || "not stated"}`, `${s.actor} user exists on the tenant`],
        steps: [`Cause the trigger: ${lc1(w.trigger)}.`, `Complete the steps before step ${s.no}.`, `Check who has the pending approval.`],
        expected: `The approval for step ${s.no} "${s.name}" is assigned to the ${s.actor}${parallel ? ` and runs at the same time as step ${parallel}` : /sequential/i.test(s.mode) ? ", and only after the previous step has completed (sequential)" : ""}.`,
        oracle: `The pending-approval record for step ${s.no} names ${s.actor} as the approver${parallel ? ` while step ${parallel} is also pending` : ""}.`,
        refs: [w.id, stepRef],
      }),
    );
    if (/sequential/i.test(s.mode) && Number(s.no) > 1) {
      out.push(
        wf("workflow", {
          title: `${w.name}: step ${s.no} "${s.name}" is not routed before step ${Number(s.no) - 1} completes`,
          why: `The approval mode is Sequential; an approver who sees an item before the previous level decides is approving out of order.`,
          setup: [`Trigger: ${w.trigger}`, `Step ${Number(s.no) - 1} still pending`],
          steps: [`Cause the trigger.`, `Leave step ${Number(s.no) - 1} undecided.`, `Check the ${s.actor}'s pending approvals.`],
          expected: `Nothing is pending for the ${s.actor} at step ${s.no} until step ${Number(s.no) - 1} completes.`,
          oracle: `No step-${s.no} approval record exists while step ${Number(s.no) - 1} is pending; it appears once that step completes.`,
          refs: [w.id, stepRef],
        }),
      );
    }
    if (parallel) {
      out.push(
        wf("workflow", {
          title: `${w.name}: step ${s.no} "${s.name}" runs in parallel with step ${parallel}`,
          why: `The approval mode is "${s.mode}"${s.notes ? ` (${stripDot(s.notes)})` : ""}. Serialising it would add avoidable delay; not running it would skip an approval.`,
          setup: [`Trigger: ${w.trigger}`, ...(s.notes ? [`Workbook note: ${s.notes}`] : [])],
          steps: [`Cause the trigger and complete the steps before step ${parallel}.`, `Check which approvals are pending.`],
          expected: `Step ${s.no} (${s.actor}) and step ${parallel} are pending at the same time${/if configured/i.test(s.notes) ? " when the tenant has configured it so" : ""}.`,
          oracle: `Both approval records are open simultaneously.`,
          refs: [w.id, stepRef],
        }),
      );
    }

    // SLA breach → escalation, and no escalation before it
    if (s.sla && s.escalation) {
      out.push(
        wf("workflow", {
          title: `${w.name}: step ${s.no} escalates to ${s.escalation} after ${s.sla}h`,
          why: `An approval left with the ${s.actor} beyond its ${s.sla}-hour SLA stalls the ${w.name.toLowerCase()}; escalation is the control that unblocks it.`,
          setup: [`Trigger: ${w.trigger}`, `SLA for step ${s.no}: ${s.sla} hours; escalation to ${s.escalation}`],
          steps: [`Route an item to step ${s.no} (${s.actor}).`, `Leave it undecided for more than ${s.sla} hours.`],
          expected: `After ${s.sla} hours without action the approval escalates to the ${s.escalation}.`,
          oracle: `The approval history shows the SLA breach and the ${s.escalation} as the new or added approver.`,
          refs: [w.id, stepRef],
        }),
      );
      out.push(
        wf("workflow", {
          title: `${w.name}: step ${s.no} does not escalate before ${s.sla}h`,
          why: `Escalating early takes the decision away from the ${s.actor} before their SLA is up.`,
          setup: [`Trigger: ${w.trigger}`, `SLA for step ${s.no}: ${s.sla} hours`],
          steps: [`Route an item to step ${s.no} (${s.actor}).`, `Check its state shortly before ${s.sla} hours have passed.`],
          expected: `The approval is still with the ${s.actor}; nothing has gone to the ${s.escalation}.`,
          oracle: `No escalation entry exists before the ${s.sla}-hour mark.`,
          refs: [w.id, stepRef],
        }),
      );
    }

    // Bypass honoured / not honoured
    if (s.bypass) {
      const clauses = s.bypass.split(/\s+and\s+/i).map((x) => x.trim());
      const amt = s.bypass.match(AMOUNT);
      let honouredValue = "";
      if (amt) {
        const n = Number(amt[3].replace(/,/g, ""));
        const at = amt[1] === "<" ? n - 1 : amt[1] === ">" ? n + 1 : n;
        honouredValue = `${amt[2] ?? ""} ${at.toLocaleString("en-IN")}`.trim();
      }
      out.push(
        wf("workflow", {
          title: `${w.name}: step ${s.no} bypassed when "${short(s.bypass, 70)}"`,
          why: `The workbook's bypass condition for step ${s.no} is "${s.bypass}". Requiring the approval anyway adds friction the tenant chose to remove.`,
          setup: [`Trigger: ${w.trigger}`, `Bypass condition holds: ${s.bypass}`, ...(amt ? [`Amount at the boundary: ${honouredValue}`] : [])],
          steps: [
            `Cause the trigger so that every part of the bypass condition holds${amt ? ` (amount exactly ${honouredValue})` : ""}.`,
            `Follow the workflow to step ${s.no}.`,
          ],
          expected: `Step ${s.no} "${s.name}" is bypassed — no approval is requested from the ${s.actor}.`,
          oracle: `The workflow history shows step ${s.no} skipped under its bypass condition and the next step active.`,
          refs: [w.id, stepRef],
        }),
      );
      if (amt) {
        const n = Number(amt[3].replace(/,/g, ""));
        const over = amt[1] === "≤" || amt[1] === "<=" || amt[1] === "<" ? n + 1 : n - 1;
        const overV = `${amt[2] ?? ""} ${over.toLocaleString("en-IN")}`.trim();
        out.push(
          wf("workflow", {
            title: `${w.name}: step ${s.no} not bypassed at ${overV} (just past the threshold)`,
            why: `The bypass threshold is "${amt[0]}". One unit past it, the approval must be required.`,
            setup: [`Trigger: ${w.trigger}`, `Amount: ${overV}; every other part of the bypass condition holds`],
            steps: [`Cause the trigger with amount ${overV} and the rest of the condition true.`, `Follow the workflow to step ${s.no}.`],
            expected: `Step ${s.no} "${s.name}" is required and routed to the ${s.actor}.`,
            oracle: `A pending step-${s.no} approval exists for the ${s.actor}.`,
            refs: [w.id, stepRef],
          }),
        );
      }
      for (const cl of clauses) {
        if (AMOUNT.test(cl) && clauses.length > 1) continue; // the amount boundary case above covers it
        out.push(
          wf("workflow", {
            title: `${w.name}: step ${s.no} not bypassed when "${short(cl, 60)}" does not hold`,
            why: `The bypass needs all of "${s.bypass}". If ${clauses.length > 1 ? "one part" : "it"} fails, the approval must stand.`,
            setup: [`Trigger: ${w.trigger}`, `Not true: ${cl}${clauses.length > 1 ? "; every other part of the bypass condition holds" : ""}`],
            steps: [`Cause the trigger with "${cl}" false${amt && !AMOUNT.test(cl) ? ` and the amount within the threshold (${honouredValue})` : ""}.`, `Follow the workflow to step ${s.no}.`],
            expected: `Step ${s.no} "${s.name}" is required and routed to the ${s.actor}.`,
            oracle: `A pending step-${s.no} approval exists for the ${s.actor}.`,
            refs: [w.id, stepRef],
          }),
        );
      }
    }

    // Tenant-configurable steps
    if (/^yes/i.test(s.tenantConfigurable)) {
      const what = s.tenantConfigurable.match(/\(([^)]+)\)/)?.[1];
      out.push(
        wf("workflow-config", {
          title: `${w.name}: step ${s.no} "${s.name}" follows the tenant's configuration${what ? ` (${what})` : ""}`,
          why: `The workbook marks step ${s.no} tenant-configurable${what ? ` — ${what}` : ""}${s.notes ? `; note: ${stripDot(s.notes)}` : ""}. The workflow must follow what the tenant set, not a fixed default.`,
          setup: [`Persona: Tenant Admin`, `Trigger: ${w.trigger}`, ...(s.notes ? [`Workbook note: ${s.notes}`] : [])],
          steps: [
            `As a Tenant Admin, change the configurable part of step ${s.no}${what ? ` (${what})` : ""}${s.notes ? ` — ${lc1(stripDot(s.notes))}` : ""}.`,
            `Cause the trigger and follow the workflow to step ${s.no}.`,
          ],
          expected: `Step ${s.no} behaves according to the new configuration.`,
          oracle: `The step's routing/timing observed after the change matches the configured values, and differs from before the change.`,
          refs: [w.id, stepRef],
        }),
      );
    }
  }
  return out;
}

// ─── 9. Integrations (sheet 28) → cases ───────────────────────────────────

/** Sheet-25 config keys an integration depends on, via its "Config Dependencies" ids. */
function integrationGates(i: Integration): Config[] {
  return (i.configDeps.match(/CONF-[A-Z]+-\d+/g) ?? []).map((id) => configById.get(id)).filter((c): c is Config => !!c);
}

function integrationCases(i: Integration, m: ModuleSheet | undefined): Case[] {
  const out: Case[] = [];
  const gates = integrationGates(i);
  const refs = [...new Set([i.id, ...gates.map((g) => g.key), ...(i.configDeps.match(/\b(?:CONF|FF)-[A-Z]*-?\d+\b/g) ?? [])])];
  const setup = [
    `Integration ${i.id} "${i.name}" (${i.type || "type not stated"}) configured on the tenant${i.keyConfig ? `; key parameters: ${i.keyConfig}` : ""}`,
    ...(i.auth ? [`Auth: ${i.auth}`] : []),
    ...gates.map((g) => `gate: \`${g.key}\` — ${g.id} "${g.name}"`),
    ...(i.configDeps ? [`Config dependencies (workbook): ${i.configDeps}`] : []),
  ];
  const mk = (kind: Kind, c: Omit<Case, "priority" | "verdict" | "kind" | "refs" | "setup"> & { setup?: string[] }): Case => ({
    ...c,
    setup: c.setup ?? setup,
    kind,
    refs,
    priority: priorityFor(kind, undefined, m?.code),
    verdict: verdictFor(kind),
  });

  const directions = i.trigger.split(/;?\s+OR\s+/).map((t) => stripDot(t.trim())).filter(Boolean);
  for (const t of directions) {
    out.push(
      mk("integration", {
        title: `${i.name}: ${short(lc1(t), 90)}`,
        why: `${i.notes ? stripDot(i.notes) + ". " : ""}${i.required ? `Required for the module: ${i.required}.` : ""}`.trim() || `The Integration Catalog lists ${i.name} as a ${i.type} integration.`,
        steps: [`Make sure the integration is configured as in Setup.`, `Cause the trigger: ${lc1(t)}.`, `Compare the data on both sides.`],
        expected: `The integration runs for this trigger and exchanges: ${stripDot(i.data)}.`,
        oracle: `The listed fields match in Procol and the external system after the sync, with no error recorded for the integration.`,
      }),
    );
  }
  for (const f of i.failure.split(/;\s*/).map((x) => stripDot(x.trim())).filter(Boolean)) {
    out.push(
      mk("integration-failure", {
        title: `${i.name}: on failure — ${short(lc1(f), 80)}`,
        why: `The Integration Catalog states how ${i.name} must fail: "${i.failure}". A silent failure leaves the two systems out of step with nobody told.`,
        steps: [`Configure the integration as in Setup.`, `Make the external side fail or be unreachable.`, `Cause the trigger: ${lc1(directions[0] ?? i.trigger)}.`],
        expected: `The stated failure handling happens: ${lc1(f)}.`,
        oracle: `Evidence of exactly this handling is visible (state, alert, log or retry record as named) and nothing is silently dropped.`,
      }),
    );
  }
  const req = i.notes.match(/requires ((?:FF|CONF)-[A-Z]*-?\d+)[^.]*?to be enabled/i);
  if (req) {
    out.push(
      mk("integration", {
        title: `${i.name}: inactive while ${req[1]} is not enabled`,
        why: `The Integration Catalog says: "${i.notes}".`,
        setup: [...setup, `${describeRef(req[1])} NOT enabled${flagById.has(req[1]) ? "" : " (this id is not defined in the workbook's flag/config sheets)"}`],
        steps: [`Leave ${req[1]} disabled.`, `Cause the trigger: ${lc1(directions[0] ?? i.trigger)}.`, `Then enable ${req[1]} and repeat.`],
        expected: `Nothing is exchanged while ${req[1]} is disabled; after enabling it the integration runs.`,
        oracle: `No sync activity for the first trigger; normal sync for the second.`,
      }),
    );
  }
  return out;
}

// ─── 10. Config dependencies (sheet 29) → cases ───────────────────────────

function dependencyCases(d: Dependency, m: ModuleSheet | undefined): Case[] {
  const out: Case[] = [];
  const gateOf = (id: string) => configById.get(id);
  const gates = [gateOf(d.source), gateOf(d.target)].filter((c): c is Config => !!c);
  const refs = [...new Set([d.id, d.source, d.target, ...gates.map((g) => g.key)])];
  const conditional = /conditional/i.test(d.type) && d.condition;
  const baseSetup = [
    `Source: ${describeRef(d.source)}${d.sourceName && !configById.has(d.source) && !featureById.has(d.source) ? ` "${d.sourceName}"` : ""}`,
    `Depends on: ${describeRef(d.target)}${d.targetName && !configById.has(d.target) && !featureById.has(d.target) ? ` "${d.targetName}"` : ""} (${d.type || "type not stated"})`,
    ...gates.map((g) => `gate: \`${g.key}\``),
    ...(conditional ? [`Condition: ${d.condition}`] : []),
    ...(d.notes ? [`Workbook guidance: ${d.notes}`] : []),
  ];
  const mk = (title: string, c: Omit<Case, "priority" | "verdict" | "kind" | "refs" | "title">): Case => ({
    ...c,
    title,
    kind: "dependency",
    refs,
    priority: priorityFor("dependency", undefined, m?.code),
    verdict: verdictFor("dependency"),
  });
  const src = d.sourceName || d.source;
  const tgt = d.targetName || d.target;
  out.push(
    mk(`${src} with ${tgt} correctly configured (${d.id})`, {
      why: `${src} depends on ${tgt}. ${d.notes ? stripDot(d.notes) + "." : ""}`.trim(),
      setup: [...baseSetup, `${tgt} configured correctly`],
      steps: [`Configure ${tgt} (${d.target}) correctly.`, `Configure ${src} (${d.source}).`, `Exercise the behaviour ${src} controls${conditional ? ` with the condition true (${lc1(d.condition)})` : ""}.`],
      expected: `${src} works as configured; none of the stated failure impact occurs.`,
      oracle: `The impact named in the missing-dependency case (${d.id}) is absent.`,
    }),
  );
  out.push(
    mk(`${src} with ${tgt} missing or misconfigured (${d.id})`, {
      why: `The workbook states the impact: "${d.impact}".`,
      setup: [...baseSetup, `${tgt} missing or misconfigured`],
      steps: [`Leave ${tgt} (${d.target}) missing or misconfigured.`, `Configure ${src} (${d.source}).`, `Exercise the behaviour ${src} controls${conditional ? ` with the condition true (${lc1(d.condition)})` : ""}.`],
      expected: `The stated impact appears: ${lc1(stripDot(d.impact))}.${/recommended/i.test(d.type) ? " (The dependency is Recommended, not Required — this is valid but should be visible to the admin.)" : ""}`,
      oracle: `The consequence named in Expected can be observed; if Procol instead prevents the misconfiguration up front, record that as the actual (safer) behaviour.`,
    }),
  );
  if (conditional) {
    out.push(
      mk(`${src}: dependency on ${tgt} does not apply when "${short(d.condition, 60)}" is false (${d.id})`, {
        why: `The dependency is conditional: "${d.condition}". Outside that condition, ${tgt} must not constrain ${src}.`,
        setup: [...baseSetup.filter((x) => !x.startsWith("Condition:")), `Condition NOT met: ${d.condition}`],
        steps: [`Make the condition false.`, `Leave ${tgt} unconfigured and configure ${src}.`, `Exercise the behaviour ${src} controls.`],
        expected: `${src} works without ${tgt}; the stated impact does not occur.`,
        oracle: `No trace of the impact "${short(d.impact, 80)}".`,
      }),
    );
  }
  return out;
}

// ─── 11. Assemble per-module case files ───────────────────────────────────

interface Section {
  title: string;
  cases: Case[];
}
interface CaseFile {
  file: string;
  module?: ModuleSheet;
  heading: string;
  code: string;
  sections: Section[];
}

const XC = { code: "XC", nn: "99", slug: "cross-cutting" };
/** Sections in a fixed, meaningful order: Core first, then the rest; unknown categories alphabetically. */
const CATEGORY_ORDER = ["core", "compliance", "optional", "integration", "reporting"];
function categoryOrder(fs: Feature[]): string[] {
  const cats = [...new Set(fs.map((f) => f.category))];
  const rank = (c: string) => (CATEGORY_ORDER.indexOf(c.toLowerCase()) + 1 || 99);
  return cats.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
const bucket = (moduleId: string | undefined) => (moduleId ? moduleSheetById.get(moduleId) : undefined);

const caseFiles: CaseFile[] = [];
const xcSections: Section[] = [];
for (const m of modules) {
  const sections: Section[] = [];
  const cats = categoryOrder(m.features.filter((f) => !isRoadmap(f)));
  for (const cat of cats) {
    const cs = m.features.filter((f) => !isRoadmap(f) && f.category === cat).flatMap((f) => featureCases(f, m));
    if (cs.length) sections.push({ title: `${cat} features`, cases: cs });
  }
  const road = m.features.filter(isRoadmap).flatMap((f) => featureCases(f, m));
  if (road.length) sections.push({ title: "Roadmap features — not in the product yet (acceptance specifications)", cases: road });

  const orphanConfigs = configs.filter((c) => !primaryFeatureOfConfig.has(c.id) && c.moduleId === m.moduleId);
  if (orphanConfigs.length) sections.push({ title: "Configuration reference", cases: orphanConfigs.flatMap((c) => configCases(c, undefined, m)) });
  for (const w of workflows.filter((w) => w.moduleId === m.moduleId)) {
    sections.push({ title: `Workflow ${w.id} — ${w.name}`, cases: workflowCases(w, m) });
  }
  const ints = integrations.filter((i) => bucket(i.moduleIds.find((id) => moduleSheetById.has(id))) === m);
  if (ints.length) sections.push({ title: "Integrations", cases: ints.flatMap((i) => integrationCases(i, m)) });
  const deps = dependencies.filter((d) => bucket(moduleOfRef(d.source) ?? moduleOfRef(d.target)) === m);
  if (deps.length) sections.push({ title: "Configuration dependencies", cases: deps.flatMap((d) => dependencyCases(d, m)) });

  caseFiles.push({
    file: `product-${m.nn}-${m.slug}.md`,
    module: m,
    heading: `${m.nn}. ${m.title} (${m.moduleId})`,
    code: m.code,
    sections,
  });
}
// Anything whose module has no sheet (legacy registry placeholders, unknown ids).
{
  const cfg = configs.filter((c) => !primaryFeatureOfConfig.has(c.id) && !moduleSheetById.has(c.moduleId));
  if (cfg.length) xcSections.push({ title: "Configuration reference", cases: cfg.flatMap((c) => configCases(c, undefined, undefined)) });
  for (const w of workflows.filter((w) => !moduleSheetById.has(w.moduleId))) xcSections.push({ title: `Workflow ${w.id} — ${w.name}`, cases: workflowCases(w, undefined) });
  const ints = integrations.filter((i) => !i.moduleIds.some((id) => moduleSheetById.has(id)));
  if (ints.length) xcSections.push({ title: "Integrations", cases: ints.flatMap((i) => integrationCases(i, undefined)) });
  const deps = dependencies.filter((d) => !bucket(moduleOfRef(d.source) ?? moduleOfRef(d.target)));
  if (deps.length) xcSections.push({ title: "Configuration dependencies", cases: deps.flatMap((d) => dependencyCases(d, undefined)) });
  if (xcSections.length) {
    caseFiles.push({ file: `product-${XC.nn}-${XC.slug}.md`, heading: "Cross-cutting (no module sheet)", code: XC.code, sections: xcSections });
  }
}

// Assign ids: PRD-<CODE>-NNN, sequential per module in file order.
const allIds = new Set<string>();
for (const cf of caseFiles) {
  let n = 0;
  for (const s of cf.sections) {
    for (const c of s.cases) {
      n += 1;
      c.id = `PRD-${cf.code}-${String(n).padStart(3, "0")}`;
      if (allIds.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
      allIds.add(c.id);
      if (!c.why || !c.steps.length || !c.expected || !c.oracle) throw new Error(`${c.id} is missing a mandatory field`);
    }
  }
}

// ─── 12. Render ───────────────────────────────────────────────────────────

const GENERATED = `Generated from \`${basename(WORKBOOK)}\` by \`prototype/scripts/import-product-knowledge.ts\` — do not edit by hand; edit the workbook and run \`npm run product:import\`.`;
/** Keep every value on one logical line (the parser joins continuation lines anyway). */
const one = (s: string) => s.replace(/\s+/g, " ").trim();

/** The workbook sheet a case was generated from. */
function sourceSheet(c: Case): string {
  if (c.sheet) return c.sheet;
  switch (c.kind) {
    case "workflow":
    case "workflow-config":
      return sheetOf.workflow;
    case "integration":
    case "integration-failure":
      return sheetOf.integration;
    case "dependency":
      return sheetOf.dependency;
    default:
      return c.sheet ?? featureSheet(c.featureId);
  }
}
function featureSheet(id?: string): string {
  const f = id ? featureById.get(id) : undefined;
  return (f && moduleSheetById.get(f.moduleId)?.sheet) || sheetOf.config;
}

function renderCase(c: Case): string {
  const lines = [`#### ${c.id} — ${one(c.title)}`, ""];
  lines.push(`- **Why it matters.** ${one(c.why)}`);
  if (c.setup.length) {
    lines.push(`- **Setup.**`);
    for (const s of c.setup) lines.push(`  ${one(s)}.`.replace(/\.\.$/, ".").replace(/([!?…])\.$/, "$1"));
  }
  lines.push(`- **Steps.**`);
  c.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${one(s)}`));
  lines.push(`- **Expected.** ${one(c.expected)}`);
  lines.push(`- **Oracle.** ${one(c.oracle)}`);
  lines.push(`- **Trace.** ${c.priority} · ${c.verdict} · ${c.refs.map((r) => `\`${r}\``).join(" · ")} · workbook sheet "${sourceSheet(c)}"`);
  return lines.join("\n");
}

function renderCaseFile(cf: CaseFile): string {
  const total = cf.sections.reduce((n, s) => n + s.cases.length, 0);
  const out: string[] = [];
  out.push(`# Product test cases — ${cf.heading}`, "");
  out.push(GENERATED, "");
  if (cf.module) {
    const r = registryById.get(cf.module.moduleId);
    out.push(
      `Module ${cf.module.moduleId} · ${cf.module.features.length} features · ${total} cases · group \`PRD-${cf.code}\`` +
        (r ? ` · plan availability: ${r.plan || "not stated"} · status: ${r.status || "not stated"}` : ""),
      "",
    );
    if (r?.description) out.push(`${stripDot(r.description)}.${r.purpose ? ` ${stripDot(r.purpose)}.` : ""}`, "");
  } else {
    out.push(`${total} cases from reference-sheet rows whose module has no feature sheet · group \`PRD-${cf.code}\``, "");
  }
  cf.sections.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.title}`, "");
    for (const c of s.cases) out.push(renderCase(c), "");
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ─── 13. Knowledge files ──────────────────────────────────────────────────

const casesByFeature = new Map<string, string[]>();
for (const cf of caseFiles) for (const s of cf.sections) for (const c of s.cases) if (c.featureId) {
  if (!casesByFeature.has(c.featureId)) casesByFeature.set(c.featureId, []);
  casesByFeature.get(c.featureId)!.push(c.id!);
}
const range = (ids: string[] | undefined) => (!ids?.length ? "none" : ids.length === 1 ? ids[0] : `${ids[0]} … ${ids.at(-1)} (${ids.length})`);
const field = (label: string, v: string) => (v ? `${label}: ${v}` : "");
const para = (...lines: string[]) => lines.filter(Boolean).join("\n");

function configBlock(c: Config): string {
  return [
    `### ${c.id} — ${c.name} (\`${c.key || "no key"}\`)`,
    para(
      `Configuration parameter of ${registryById.get(c.moduleId)?.name ?? c.moduleId} (${c.moduleId || "module not stated"})${c.featureId ? `, feature ${describeRef(c.featureId)}` : ""}.`,
      field("Type", c.type),
      field("Default", c.defaultValue),
      field("Allowed values", c.allowed),
      field("What it does", c.description),
      field("Why it exists", c.why),
      field("Business impact", c.impact),
      field("Plan required", c.plan),
      field("Risk if changed", c.risk),
      field("Tenant-configurable", c.tenantConfigurable),
      field("Depends on", c.dependsOn),
    ),
  ].join("\n");
}
function workflowBlock(w: Workflow): string {
  return [
    `### ${w.id} — ${w.name} workflow`,
    para(
      `Approval workflow of ${registryById.get(w.moduleId)?.name ?? w.moduleId} (${w.moduleId}). Trigger: ${w.trigger}.`,
      ...w.steps.map(
        (s) =>
          `Step ${s.no} ${s.name} — ${s.type || "type not stated"}; actor ${s.actor || "not stated"}` +
          (s.mode ? `; mode ${s.mode}` : "") +
          (s.sla ? `; SLA ${s.sla}h` : "") +
          (s.escalation ? `; escalates to ${s.escalation}` : "") +
          (s.bypass ? `; bypass/condition: ${s.bypass}` : "") +
          (s.tenantConfigurable ? `; tenant-configurable: ${s.tenantConfigurable}` : "") +
          (s.notes ? `; note: ${s.notes}` : "") +
          ".",
      ),
    ),
  ].join("\n");
}
function integrationBlock(i: Integration): string {
  return [
    `### ${i.id} — ${i.name} integration`,
    para(
      `External integration for ${i.moduleIds.map((id) => `${registryById.get(id)?.name ?? id} (${id})`).join(", ")}.`,
      field("Type", i.type),
      field("Trigger", i.trigger),
      field("Data exchanged", i.data),
      field("Key config parameters", i.keyConfig),
      field("Auth", i.auth),
      field("Tenant-configurable", i.tenantConfigurable),
      field("Required for module", i.required),
      field("Config dependencies", i.configDeps),
      field("Failure handling", i.failure),
      field("Status", i.status),
      field("Notes", i.notes),
    ),
  ].join("\n");
}
function dependencyBlock(d: Dependency): string {
  return [
    `### ${d.id} — ${d.sourceName || d.source} depends on ${d.targetName || d.target}`,
    para(
      `Configuration dependency (${d.type || "type not stated"}): ${describeRef(d.source)} depends on ${describeRef(d.target)}.`,
      field("Condition", d.condition),
      field("Impact if missing or misconfigured", d.impact),
      field("Guidance", d.notes),
      undefinedRefs.has(d.source) || undefinedRefs.has(d.target)
        ? `Note: ${[d.source, d.target].filter((r) => undefinedRefs.has(r)).join(" and ")} is not defined anywhere else in the workbook.`
        : "",
    ),
  ].join("\n");
}

function featureBlock(f: Feature, m: ModuleSheet): string {
  const cs = configsForFeature.get(f.id) ?? [];
  return [
    `### ${f.id} — ${f.name}`,
    para(
      `${f.name} is a ${f.category} feature of ${m.moduleName} (${f.moduleId}). Persona: ${f.persona || "not stated"}. Plan: ${f.plan}. Status: ${f.status || "not stated"}.`,
      field("User story", f.story),
      field("Business use case", f.useCase),
      field("Why it exists", f.rationale),
      field("Edge cases / notes", f.notes),
      cs.length ? `Configs: ${cs.map((c) => `${c.id} \`${c.key}\` (default ${c.defaultValue || "not stated"}; allowed ${c.allowed || "not stated"})`).join("; ")}` : "",
      field("Configurable", f.configurable),
      field("Feature flag", [f.hasFlag, f.flagKey].filter(Boolean).join(" ")),
      field("RBAC controlled", f.rbac),
      `Test cases: ${range(casesByFeature.get(f.id))}.`,
    ),
  ].join("\n");
}

function moduleKnowledge(m: ModuleSheet): string {
  const r = registryById.get(m.moduleId);
  const status = new Map<string, number>();
  for (const f of m.features) status.set(f.status || "not stated", (status.get(f.status || "not stated") ?? 0) + 1);
  const out: string[] = [];
  out.push(`# ${m.nn}. ${m.title} (${m.moduleId}) — Procol product knowledge`, "", GENERATED, "");
  out.push(
    `## ${m.title} module overview`,
    para(
      `${m.moduleName} (${m.moduleId}) is ${r?.category ? `a ${r.category} module` : "a module"} of Procol${lifecycleStage.get(m.no) ? `, in the "${lifecycleStage.get(m.no)}" stage of the procurement lifecycle` : ""}.`,
      field("Description", r?.description ?? ""),
      field("Business purpose", r?.purpose ?? ""),
      field("Default state", r?.defaultState ?? ""),
      field("Plan availability", r?.plan ?? ""),
      field("Depends on modules", (r?.dependsOn ?? "").replace(/MOD-\d+/g, (id) => `${id} ${registryById.get(id)?.name ?? ""}`.trim())),
      field("Key integrations", r?.integrations ?? ""),
      field("Registry status", r?.status ?? ""),
      field("Roadmap notes", r?.roadmap ?? ""),
      `Features: ${m.features.length} (${[...status].map(([k, v]) => `${v} ${k}`).join(", ")}). Test cases: test-cases/product-${m.nn}-${m.slug}.md, group PRD-${m.code}.`,
    ),
    "",
  );
  const cats: string[] = [];
  for (const f of m.features) if (!cats.includes(f.category)) cats.push(f.category);
  out.push(`## ${m.title} features`, "", `${m.features.length} features in ${cats.length} categories: ${cats.join(", ")}.`, "");
  for (const f of m.features) out.push(featureBlock(f, m), "");

  const cfg = configs.filter((c) => c.moduleId === m.moduleId || (primaryFeatureOfConfig.get(c.id) && featureById.get(primaryFeatureOfConfig.get(c.id)!)?.moduleId === m.moduleId));
  if (cfg.length) {
    out.push(`## ${m.title} configuration`, "");
    for (const c of cfg) out.push(configBlock(c), "");
  }
  const wfs = workflows.filter((w) => w.moduleId === m.moduleId);
  if (wfs.length) {
    out.push(`## ${m.title} workflows and approvals`, "");
    for (const w of wfs) out.push(workflowBlock(w), "");
  }
  const ints = integrations.filter((i) => i.moduleIds.includes(m.moduleId));
  if (ints.length) {
    out.push(`## ${m.title} integrations`, "");
    for (const i of ints) out.push(integrationBlock(i), "");
  }
  const deps = dependencies.filter((d) => moduleOfRef(d.source) === m.moduleId || moduleOfRef(d.target) === m.moduleId);
  if (deps.length) {
    out.push(`## ${m.title} configuration dependencies`, "");
    for (const d of deps) out.push(dependencyBlock(d), "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function registryKnowledge(): string {
  const out: string[] = [];
  out.push(`# Procol module registry — product knowledge`, "", GENERATED, "");
  out.push(
    `## Procol modules at a glance`,
    para(
      `Procol has ${registry.length} registered modules; ${modules.length} have a feature sheet with ${features.length} features in total.`,
      `Plan tiers named in the workbook, lowest first: ${tiers.join(" < ") || "none"} ("All Plans" means every tier).`,
      `Status legend: GA = live; Beta = maturing; Roadmap = planned; "GA (Already in Procol)" marks pre-existing downstream features.`,
      ...[...new Set(modules.map((m) => lifecycleStage.get(m.no)).filter(Boolean))].map(
        (st) => `${st}: ${modules.filter((m) => lifecycleStage.get(m.no) === st).map((m) => `${m.title} (${m.moduleId})`).join(", ")}.`,
      ),
    ),
    "",
  );
  out.push(`## Module registry`, "");
  for (const r of registry) {
    const m = moduleSheetById.get(r.id);
    out.push(
      `### ${r.id} — ${r.name}`,
      para(
        `${r.name} (${r.id}) is ${r.category ? `a ${r.category} module` : "a module"} of Procol.`,
        field("Description", r.description),
        field("Business purpose", r.purpose),
        field("Default state", r.defaultState),
        field("Plan availability", r.plan),
        field("Depends on", r.dependsOn),
        field("Key integrations", r.integrations),
        field("Status", r.status),
        field("Roadmap notes", r.roadmap),
        field("Last updated", r.updated),
        m
          ? `Feature sheet: "${m.sheet}" with ${m.features.length} features; knowledge file product/${m.nn}-${m.slug}.md; test cases group PRD-${m.code}.`
          : `No feature sheet in the workbook — a registry entry only.`,
      ),
      "",
    );
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function crossCuttingKnowledge(): string {
  const out: string[] = [];
  out.push(`# Procol configuration, workflows, flags and integrations — product knowledge`, "", GENERATED, "");
  out.push(`## Configuration reference`, "", `${configs.length} configuration parameters.`, "");
  for (const c of configs) out.push(configBlock(c), "");
  out.push(`## Workflow and approval chains`, "", `${workflows.length} workflows.`, "");
  for (const w of workflows) out.push(workflowBlock(w), "");
  out.push(`## Feature flags`, "");
  if (!flags.length) {
    out.push(
      `The Feature Flags sheet has no rows. Flags referenced elsewhere in the workbook but not defined: ${
        [...undefinedRefs.keys()].filter((r) => r.startsWith("FF-")).map((r) => `${r} (${[...undefinedRefs.get(r)!].join(", ")})`).join("; ") || "none"
      }.`,
      "",
    );
  }
  for (const f of flags) {
    out.push(
      `### ${f.id} — ${f.name} (\`${f.key}\`)`,
      para(field("Module", f.moduleId), field("Feature", f.featureId), field("Description", f.description), field("Default", f.defaultState), field("Scope", f.scope), field("Who can toggle", f.whoCanToggle), field("Impact of enabling", f.onEnable), field("Impact of disabling", f.onDisable), field("Depends on", f.dependsOn), field("Plan", f.plan), field("Status", f.status)),
      "",
    );
  }
  out.push(`## Integration catalog`, "", `${integrations.length} integrations.`, "");
  for (const i of integrations) out.push(integrationBlock(i), "");
  out.push(`## Configuration dependencies`, "", `${dependencies.length} dependencies.`, "");
  for (const d of dependencies) out.push(dependencyBlock(d), "");
  if (undefinedRefs.size) {
    out.push(
      `## Undefined references in the workbook`,
      "",
      para(...[...undefinedRefs].map(([ref, where]) => `${ref} is referenced by ${[...where].join(", ")} but not defined in any sheet.`)),
      "",
    );
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ─── 14. Write (owning only our files) ────────────────────────────────────

mkdirSync(KNOWLEDGE_DIR, { recursive: true });
for (const f of readdirSync(KNOWLEDGE_DIR)) if (f.endsWith(".md")) unlinkSync(join(KNOWLEDGE_DIR, f));
for (const f of readdirSync(CASES_DIR)) if (/^product-.*\.md$/.test(f)) unlinkSync(join(CASES_DIR, f));

const written: string[] = [];
writeFileSync(join(KNOWLEDGE_DIR, "00-module-registry.md"), registryKnowledge());
written.push("00-module-registry.md");
for (const m of modules) {
  const name = `${m.nn}-${m.slug}.md`;
  writeFileSync(join(KNOWLEDGE_DIR, name), moduleKnowledge(m));
  written.push(name);
}
writeFileSync(join(KNOWLEDGE_DIR, "90-configuration-workflows-integrations.md"), crossCuttingKnowledge());
written.push("90-configuration-workflows-integrations.md");

for (const cf of caseFiles) writeFileSync(join(CASES_DIR, cf.file), renderCaseFile(cf));

// ─── 15. Report ───────────────────────────────────────────────────────────

const allCases = caseFiles.flatMap((cf) => cf.sections.flatMap((s) => s.cases));
const tally = (key: (c: Case) => string) =>
  Object.entries(allCases.reduce<Record<string, number>>((a, c) => ({ ...a, [key(c)]: (a[key(c)] ?? 0) + 1 }), {})).sort();

for (const f of features) {
  for (const [k, v] of [["User Persona", f.persona], ["User Story", f.story], ["Business Use Case", f.useCase], ["Status", f.status]] as const) {
    if (!v) gaps.push(`${f.id} has no ${k}`);
  }
  if (f.story && !parseStory(f.story)) gaps.push(`${f.id}'s user story is not in "As a …, I want …, so that …" form`);
}
const names = new Map<string, string[]>();
for (const f of features) {
  const k = f.name.toLowerCase();
  names.set(k, [...(names.get(k) ?? []), f.id]);
}
for (const [n, ids] of names) if (ids.length > 1) gaps.push(`feature name "${n}" appears more than once: ${ids.join(", ")}`);
for (const r of registry) if (!moduleSheetById.has(r.id)) gaps.push(`${r.id} ${r.name} is in the registry but has no feature sheet`);
for (const [ref, where] of undefinedRefs) gaps.push(`${ref} is referenced by ${[...where].join(", ")} but defined nowhere`);
const nameOf = (id: string) => featureById.get(id)?.name ?? configById.get(id)?.name ?? flagById.get(id)?.name;
for (const d of dependencies) {
  for (const [id, stated] of [[d.source, d.sourceName], [d.target, d.targetName]] as const) {
    const actual = nameOf(id);
    if (actual && stated && !stated.toLowerCase().startsWith(actual.toLowerCase())) gaps.push(`${d.id} calls ${id} "${stated}", but the workbook defines ${id} as "${actual}"`);
  }
  for (const [, mod, label] of d.notes.matchAll(/(MOD-\d+) \(([^)]+)\)/g)) {
    const r = registryById.get(mod);
    if (r && !r.name.toLowerCase().includes(label.toLowerCase())) gaps.push(`${d.id}'s note says "${mod} (${label})", but ${mod} is "${r.name}" in the registry`);
  }
}
const allFeaturesEmpty = (k: keyof Feature) => features.every((f) => !f[k]);
if (allFeaturesEmpty("configurable") && allFeaturesEmpty("hasFlag") && allFeaturesEmpty("rbac")) gaps.push(`"Configurable?", "Has Feature Flag?", "Feature Flag Key" and "RBAC Controlled?" are blank for every feature`);
if (!flags.length) gaps.push(`the Feature Flags sheet is empty`);

console.log(`Workbook: ${WORKBOOK}`);
console.log(`  ${registry.length} registry modules · ${modules.length} module sheets · ${features.length} features · ${configs.length} configs · ${workflows.length} workflows · ${integrations.length} integrations · ${dependencies.length} dependencies · ${flags.length} flags`);
console.log(`Knowledge: ${written.length} files → ${KNOWLEDGE_DIR}`);
console.log(`Test cases: ${allCases.length} in ${caseFiles.length} files → ${CASES_DIR}`);
for (const cf of caseFiles) {
  const n = cf.sections.reduce((a, s) => a + s.cases.length, 0);
  console.log(`  PRD-${cf.code.padEnd(5)} ${String(n).padStart(4)}  ${cf.file}`);
}
console.log(`  by priority: ${tally((c) => c.priority).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  by verdict:  ${tally((c) => c.verdict).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  by kind:     ${tally((c) => c.kind).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`  gated:       ${allCases.filter((c) => c.setup.some((s) => /gate:/.test(s))).length}`);
if (gaps.length) {
  console.log(`Workbook gaps (${gaps.length}):`);
  for (const g of [...new Set(gaps)]) console.log(`  - ${g}`);
}
console.log(`Next: npx tsx scripts/import-test-cases.ts  (then npm run rag:build)`);
