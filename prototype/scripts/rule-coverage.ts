/**
 * RULE COVERAGE for sourcing events — every rule the memory knows, and which
 * written test case checks it.
 *
 *   npx tsx scripts/rule-coverage.ts                 # extract + map, write data/rules/*.json + docs/rule-coverage.md
 *   npx tsx scripts/rule-coverage.ts --memory        # also ask the memory (pgvector) which cases mean the same thing (cached)
 *   npx tsx scripts/rule-coverage.ts --catalog-only  # "before": map against data/test-cases.json only
 *   npx tsx scripts/rule-coverage.ts --show R-BID-012-3   # print one rule with its best matching cases and why
 *   npx tsx scripts/rule-coverage.ts --uncovered BID      # list the not-covered rules of one area (for writing cases)
 *
 * 1. EXTRACT. The digests under knowledge/events/ (backend-digest/*.md,
 *    frontend-digest/*.md, doc-vs-code.md) are written one section per
 *    action/model/screen; inside a section every numbered item, and every
 *    labelled line such as "State rules:" / "Gaps:", is ONE rule. Each becomes
 *    a record: id (R-<AREA>-<section>-<n>, stable while the digest's section
 *    order is), plain statement, kind (the digest's own [kind] tag when it has
 *    one, else inferred from the wording), file:line, error code(s), message,
 *    HTTP status, endpoint. → data/rules/events-rules.json
 *
 * 2. MAP. Each rule is compared with every written case (data/test-cases.json,
 *    plus test-cases/events-rules-*.md when they are not in the catalog yet,
 *    plus the runnable twin a case names). Signals, all deterministic:
 *      names the rule id ............................ decisive
 *      same source file AND overlapping lines (±3) .. strong
 *      same error code (common codes count less) .... strong
 *      same endpoint ................................ medium
 *      wording (TF-IDF cosine) ...................... medium/weak
 *      the memory ranks the case top-10 for the rule  medium (--memory)
 *    covered = the case pins the rule (file+line or rare code) AND is about the
 *    same thing (endpoint / wording / memory); partly = some evidence, not
 *    enough; not covered = nothing. → data/rules/rule-coverage.json, docs/rule-coverage.md
 *
 * No LLM decides anything here.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..");
const REPO = join(PROTO, "..");
const KNOW = join(PROTO, "knowledge", "events");
const OUT_DIR = join(PROTO, "data", "rules");
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// ── types ────────────────────────────────────────────────────────────────────
export type RuleKind = "validation" | "permission" | "state" | "time" | "calculation" | "visibility" | "side-effect" | "config";
export interface Rule {
  id: string;
  area: string;
  layer: "backend" | "frontend" | "doc-vs-code";
  digest: string;
  section: string;
  kind: RuleKind;
  /** the digest tagged it; false = inferred from wording */
  tagged: boolean;
  /** "check" (numbered), or the label it came from: "state rules", "gaps", … */
  origin: string;
  /** defect-shaped: from a Gaps line, or the digest itself says untyped 500 / defect */
  gap: boolean;
  statement: string;
  cites: string[];
  file?: string;
  lines?: [number, number];
  codes: string[];
  messages: string[];
  http?: number;
  endpoint?: string;
  action?: string;
  priority: "money" | "access" | "state-time" | "typed-error" | "other";
}
interface CaseDoc {
  id: string;
  group: string;
  title: string;
  hay: string;
  files: Array<{ file: string; a: number; b: number }>;
  codes: Set<string>;
  endpoints: Set<string>;
  ruleIds: Set<string>;
  fromRulesFiles: boolean;
}
type Verdict = "covered" | "partly" | "not covered";

// ── area codes (one per digest file) ─────────────────────────────────────────
const AREAS: Record<string, string> = {
  "backend-digest/bids.md": "BID",
  "backend-digest/event-groups.md": "EVG",
  "backend-digest/trade-stages.md": "STG",
  "backend-digest/trade-live-v1.md": "LIV",
  "backend-digest/evaluation-award.md": "AWD",
  "backend-digest/auction-templates.md": "AUC",
  "backend-digest/models-trade-request.md": "MTR",
  "backend-digest/models-event-group.md": "MEG",
  "backend-digest/models-bids-proposals.md": "MBP",
  "backend-digest/services-calculations.md": "CAL",
  "backend-digest/services-lifecycle.md": "LIF",
  "backend-digest/jobs-notifications.md": "JOB",
  "backend-digest/policies-serializers.md": "VIS",
  "backend-digest/config-settings.md": "CFG",
  "frontend-digest/create-screens.md": "FCR",
  "frontend-digest/live-event-screens.md": "FLV",
  "frontend-digest/list-award-screens.md": "FLA",
  "doc-vs-code.md": "DOC",
};
function areaOf(rel: string): string {
  if (AREAS[rel]) return AREAS[rel];
  // an unknown new digest still gets a stable 3-letter code from its name
  return basename(rel, ".md").replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase();
}

// ── source file index (to expand short cites like "bids_controller.rb:12") ──
function backendFiles(): string[] {
  try {
    return execFileSync("git", ["-C", join(REPO, "procol-backend"), "ls-tree", "-r", "--name-only", "origin/main"], { encoding: "utf8", maxBuffer: 64 << 20 })
      .split("\n")
      .filter((f) => /^(app|config|lib|db)\//.test(f));
  } catch {
    return [];
  }
}
function dashboardFiles(): string[] {
  const root = join(REPO, "procol-client-dashboard", "src");
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      if (e.isDirectory()) walk(join(d, e.name), `${rel}/${e.name}`);
      else if (/\.(jsx?|tsx?|less)$/.test(e.name)) out.push(`${rel}/${e.name}`);
    }
  };
  walk(root, "src");
  return out;
}
const ALL_FILES = [...backendFiles(), ...dashboardFiles()];
const BY_BASENAME = new Map<string, string[]>();
for (const f of ALL_FILES) {
  const b = basename(f);
  BY_BASENAME.set(b, [...(BY_BASENAME.get(b) ?? []), f]);
}

const FULL_CITE = /((?:app|config|lib|db|src)\/[\w\/.\-]+?\.(?:rb|yml|yaml|jsx?|tsx?|json|less))(?::(\d+)(?:\s*[-–]\s*(\d+))?)?/g;
const SHORT_CITE = /(?<![\w\/])((?:[\w\-]+\/)*[\w\-]+\.(?:rb|yml|jsx?|tsx?))(?::(\d+)(?:\s*[-–]\s*(\d+))?)/g;
// ":25-27", "v1 helper:17-28", "yml:1977", "model :12" — lines of a file named earlier
const BARE_LINES = /(?:^|[\s(,;—])((?:v1 )?(?:helper|controller|model|yml|serializer|service|policy))?\s?:(\d+)(?:\s*[-–]\s*(\d+))?\b/g;

function expandBasename(name: string, context: string[]): string | undefined {
  // "api/v1/trade_controller.rb" or "bids_controller.rb": match on the path suffix
  const tail = name.includes("/") ? "/" + name : null;
  const ends = (f: string) => (tail ? ("/" + f).endsWith(tail) : basename(f) === name);
  const inCtx = context.find(ends);
  if (inCtx) return inCtx;
  const all = (BY_BASENAME.get(basename(name)) ?? []).filter(ends);
  if (all.length === 1) return all[0];
  return all.find((f) => f.startsWith("app/controllers/api/") && !f.includes("/v1/")) ?? all[0];
}

/** every file the digest being read names anywhere (set per digest in extractRules) */
let FILE_CONTEXT: string[] = [];
/** the file a bare ":12" or "v1 helper:12" means */
function bareFile(qualifier: string | undefined, context: string[], last: string | undefined): string | undefined {
  if (!qualifier) return last;
  const q = qualifier.toLowerCase();
  const pick = (re: RegExp) => context.filter((f) => re.test(f));
  const pool =
    q.includes("helper") ? pick(/helper/) : q.includes("yml") ? pick(/\.ya?ml$/) : q.includes("model") ? pick(/app\/models\//) :
    q.includes("serializer") ? pick(/serializer/) : q.includes("service") ? pick(/services\//) : q.includes("policy") ? pick(/policies\//) : pick(/controller/);
  const v1 = q.startsWith("v1") ? pool.filter((f) => f.includes("/v1/")) : pool;
  if (v1[0] ?? pool[0]) return v1[0] ?? pool[0];
  // nothing in the section's own cites: look at every file the digest names
  if (FILE_CONTEXT !== context && FILE_CONTEXT.length) return bareFile(qualifier, FILE_CONTEXT, last);
  return last;
}

/** every file:line a piece of text cites, resolved to repo paths */
function citesOf(text: string, context: string[], fallbackFile?: string): Array<{ file: string; a: number; b: number; raw: string }> {
  const out: Array<{ file: string; a: number; b: number; raw: string }> = [];
  const taken: Array<[number, number]> = [];
  for (const m of text.matchAll(FULL_CITE)) {
    taken.push([m.index!, m.index! + m[0].length]);
    if (m[2]) out.push({ file: m[1], a: +m[2], b: +(m[3] ?? m[2]), raw: m[0] });
    else out.push({ file: m[1], a: 0, b: 0, raw: m[0] });
  }
  const free = (i: number) => !taken.some(([s, e]) => i >= s && i < e);
  for (const m of text.matchAll(SHORT_CITE)) {
    if (!free(m.index!)) continue;
    const f = expandBasename(m[1], context);
    taken.push([m.index!, m.index! + m[0].length]);
    if (f) out.push({ file: f, a: +m[2], b: +(m[3] ?? m[2]), raw: m[0] });
  }
  const last = out.length ? out[out.length - 1].file : fallbackFile;
  for (const m of text.matchAll(BARE_LINES)) {
    if (!free(m.index! + 1)) continue;
    const a = +m[2];
    if (!a || a > 20000) continue;
    const file = bareFile(m[1], context, last);
    if (file) out.push({ file, a, b: +(m[3] ?? m[2]), raw: m[0].trim() });
  }
  return out;
}

// ── errors (to know a real code from any number) ────────────────────────────
const ERRORS: Record<string, string> = (() => {
  try {
    const j = JSON.parse(readFileSync(join(PROTO, "data", "app-errors.json"), "utf8"));
    const e = j.errors ?? j;
    return Object.fromEntries(Object.entries(e).map(([k, v]: [string, any]) => [k, typeof v === "string" ? v : v?.message ?? ""]));
  } catch {
    return {};
  }
})();
const COMMON_CODES = new Set(["2", "4", "15", "101", "33", "888", "32", "5", "80", "1", "3"]);

function codesIn(text: string): string[] {
  const s = new Set<string>();
  // → 38 "Price …" | refused with 101 | code 712 | codes 138/139 | (38, 41, 214)
  for (const m of text.matchAll(/(?:→|->|=>)\s*(?:refused(?: with)?|error|code)?\s*(\d{1,4})\b(?!\s*(?:s\b|sec|min|hour|day|%|ms))/g)) s.add(m[1]);
  for (const m of text.matchAll(/\bcodes?\s+(\d{1,4})(?:\s*(?:\/|,| or | and )\s*(\d{1,4}))*/gi)) {
    s.add(m[1]);
    for (const n of m[0].matchAll(/\d{1,4}/g)) s.add(n[0]);
  }
  for (const m of text.matchAll(/\b(\d{1,4})\s+["“'‘]([A-Z][^"”'’]{3,})/g)) if (ERRORS[m[1]] && similarMsg(ERRORS[m[1]], m[2])) s.add(m[1]);
  return [...s].filter((c) => c in ERRORS || c === "0");
}
function similarMsg(a: string, b: string): boolean {
  const x = a.toLowerCase().slice(0, 18);
  const y = b.toLowerCase().slice(0, 18);
  return x.slice(0, 10) === y.slice(0, 10) || a.toLowerCase().includes(b.toLowerCase().slice(0, 14));
}
function messagesIn(text: string): string[] {
  return [...text.matchAll(/["“]([A-Z][^"”]{6,140})["”]/g)].map((m) => m[1]);
}

// ── endpoint normalisation ───────────────────────────────────────────────────
const ENDPOINT = /\b(GET|POST|PATCH|PUT|DELETE)\s+`?((?:\/[\w{}:.\-]+)+)/g;
export function normEndpoint(method: string, path: string): string {
  let p = path.split("?")[0].replace(/^\/api(?=\/)/, "");
  p = p
    .split("/")
    .map((seg) => (/^(\{\{\w+\}\}|:\w+|\d+|[A-Za-z0-9+\/=]{16,}|[0-9a-f-]{20,}|<\w+>|WrongUuid1=)$/.test(seg) ? ":id" : seg))
    .join("/")
    .replace(/\/+$/, "");
  return `${method.toUpperCase()} ${p}`;
}
function endpointsIn(text: string): string[] {
  return [...new Set([...text.matchAll(ENDPOINT)].map((m) => normEndpoint(m[1], m[2])))];
}

// ── kind inference (only when the digest did not tag the rule) ───────────────
const KINDS: RuleKind[] = ["validation", "permission", "state", "time", "calculation", "visibility", "side-effect", "config"];
function inferKind(s: string, origin: string): RuleKind {
  const t = s.toLowerCase();
  if (/^side effects?/.test(origin)) return "side-effect";
  if (/config gate|company setting/.test(origin)) return "config";
  if (/not authori[sz]ed|app_error_auth|wrong app|\b401\b|permission|policy|\brole\b|owner|collaborator|team member|super admin|\b(455|682|101)\b|not allowed to (view|perform)|evaluator assigned|approver/.test(t)) return "permission";
  if (/\bsees?\b|visible|visibility|hidden|\bhide|mask|serializ|not shown|is shown|receives?|exposed|leak|vendor can read|returned to the vendor/.test(t)) return "visibility";
  if (/rank|\bl1\b|total|saving|tick size|exchange rate|currency conver|round(?:ed|ing)|precision|formula|\bsum\b|average|percent|\bgst\b|tax|discount|landed price|weight/.test(t) && !/→\s*\d/.test(t)) return "calculation";
  if (/not running|order not active|\b33\b|bid (?:start|end)|end time|start time|deadline|expired|extension|extend|schedul|\bhours?\b|\bminutes?\b|window|closed_at|in the past|before start|after (?:the )?end|duration|\b712\b|timezone/.test(t)) return "time";
  if (/status|draft|\bactive\b|closed|awarded|withdrawn|latest|version|cancel|revoked|already|in_active|selected|requested|pending|live|stage (?:is|not)|published/.test(t)) return "state";
  if (/tick size|ceiling|floor|max(?:imum)? price|min(?:imum)? (?:price|quantity)|rank|saving|total|gst|discount/.test(t)) return "calculation";
  return "validation";
}
function priorityOf(r: Pick<Rule, "kind" | "statement" | "codes">): Rule["priority"] {
  const t = r.statement.toLowerCase();
  if (r.kind === "calculation" || /price|amount|discount|gst|tax|saving|currency|exchange|total|freight|charge|ceil|floor|tick/.test(t)) return "money";
  if (r.kind === "permission" || r.kind === "visibility") return "access";
  if (r.kind === "state" || r.kind === "time") return "state-time";
  if (r.codes.length) return "typed-error";
  return "other";
}

// ── 1. extract ───────────────────────────────────────────────────────────────
// labelled lines that state rules ("State rules: …", "Gaps: …"); any other label is prose
const RULE_LABELS = /^(state rules?|side effects?(?: on .*)?|other effects(?: on .*)?|skips?|skip conditions|skipped|config gates?|company settings?|rounding|notes?|gaps?|score lifecycle|rfq lock|otp rules|time rules?|precision|defaults?|formatting|hidden when|disabled when)$/i;

function digestFiles(): string[] {
  const out: string[] = [];
  for (const sub of ["backend-digest", "frontend-digest"]) {
    const d = join(KNOW, sub);
    if (existsSync(d)) for (const f of readdirSync(d).filter((n) => n.endsWith(".md")).sort()) out.push(`${sub}/${f}`);
  }
  if (existsSync(join(KNOW, "doc-vs-code.md"))) out.push("doc-vs-code.md");
  return out;
}

export function extractRules(): Rule[] {
  const rules: Rule[] = [];
  for (const rel of digestFiles()) {
    const raw = readFileSync(join(KNOW, rel), "utf8");
    const area = areaOf(rel);
    const layer: Rule["layer"] = rel.startsWith("frontend") ? "frontend" : rel === "doc-vs-code.md" ? "doc-vs-code" : "backend";
    const sections = raw.split(/\n(?=###\s)/).filter((s) => s.startsWith("###"));
    FILE_CONTEXT = [...new Set([...raw.matchAll(FULL_CITE)].map((m) => m[1]))];
    sections.forEach((sec, si) => {
      const lines = sec.split("\n");
      const heading = lines[0].replace(/^#+\s*/, "").trim();
      const citeLine = lines.find((l) => /^Cites?:/i.test(l)) ?? "";
      const context = [...citeLine.matchAll(FULL_CITE)].map((m) => m[1]);
      // the heading names the controller action ("v1 bids#create — POST /v1/bids")
      const headEndpoint = endpointsIn(heading)[0];
      const action = heading.match(/\b([a-z_\/0-9]+#[a-z_?!]+)/)?.[1];
      const ctlName = action ? `${/\bv1\s/.test(heading) || /\/v1\//.test(heading) ? "v1/" : ""}${action.split("#")[0].split("/").pop()}_controller.rb` : undefined;
      const headCtl = ctlName ? expandBasename(ctlName, context) ?? expandBasename(basename(ctlName), context) : undefined;
      // gather items: numbered (with indented continuation) and labelled lines
      const items: Array<{ origin: string; text: string }> = [];
      let cur: { origin: string; text: string } | null = null;
      for (const l of lines.slice(1)) {
        const num = l.match(/^\s{0,3}\d+[.)]\s+(.*)$/);
        const lab = l.match(/^([A-Z][A-Za-z ,/()-]{1,40}?):\s+(.*)$/);
        if (num) {
          cur = { origin: "check", text: num[1] };
          items.push(cur);
        } else if (lab && !/^\s/.test(l)) {
          const label = lab[1].trim();
          if (!RULE_LABELS.test(label)) {
            cur = null;
            continue;
          }
          cur = { origin: label.toLowerCase(), text: lab[2] };
          items.push(cur);
        } else if (cur && /^\s{2,}\S/.test(l)) cur.text += " " + l.trim();
        else if (cur && l.trim() && !/^[-*]\s/.test(l) && cur.origin !== "check") cur.text += " " + l.trim();
        else if (!l.trim()) cur = null;
      }
      let n = 0;
      let sectionLast: string | undefined = headCtl ?? context[0];
      for (const it of items) {
        const text = it.text.replace(/\s+/g, " ").trim();
        if (text.length < 12) continue;
        n++;
        const tag = text.match(/^\[([a-z-]+)\]\s*/);
        const tagged = !!tag && (KINDS as string[]).includes(tag[1]);
        const statement = tagged ? text.slice(tag![0].length) : text;
        const cites = citesOf(statement, context, sectionLast);
        const lastFull = [...cites].reverse().find((c) => c.a > 0 && !/^:/.test(c.raw));
        if (lastFull) sectionLast = lastFull.file;
        const primary = cites.find((c) => c.a > 0) ?? (context[0] ? { file: context[0], a: 0, b: 0, raw: "" } : undefined);
        const codes = codesIn(statement);
        const gap = /^gaps?$/.test(it.origin) || /untyped 500|defect-shaped|\(defect\)/i.test(statement);
        const kind: RuleKind = tagged ? (tag![1] as RuleKind) : inferKind(statement, it.origin);
        const r: Rule = {
          id: `R-${area}-${String(si + 1).padStart(3, "0")}-${n}`,
          area,
          layer,
          digest: `knowledge/events/${rel}`,
          section: heading,
          kind,
          tagged,
          origin: it.origin,
          gap,
          statement,
          cites: [...new Set(cites.map((c) => (c.a ? `${c.file}:${c.a}${c.b !== c.a ? `-${c.b}` : ""}` : c.file)))],
          file: primary?.file,
          lines: primary && primary.a ? [primary.a, primary.b] : undefined,
          codes,
          messages: messagesIn(statement),
          http: Number(statement.match(/HTTP (\d{3})/)?.[1]) || undefined,
          endpoint: endpointsIn(statement)[0] ?? headEndpoint,
          action,
          priority: "other",
        };
        r.priority = priorityOf(r);
        rules.push(r);
      }
    });
  }
  return rules;
}

// ── 2. the cases ─────────────────────────────────────────────────────────────
function loadTwins(): Map<string, any> {
  const m = new Map<string, any>();
  const add = (list: any[]) => list.forEach((c) => c?.id && m.set(c.id, c));
  try {
    const j = JSON.parse(readFileSync(join(PROTO, "data", "api-cases.json"), "utf8"));
    add(Array.isArray(j) ? j : j.cases ?? []);
  } catch {}
  const dir = join(PROTO, "data", "api-cases-extra");
  if (existsSync(dir))
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      try {
        const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
        add(Array.isArray(j) ? j : j.cases ?? []);
      } catch {}
    }
  return m;
}

/** minimal reader for test-cases/events-rules-*.md (same layout the importer reads) */
function parseRulesMd(): any[] {
  const dir = join(REPO, "test-cases");
  const out: any[] = [];
  for (const f of readdirSync(dir).filter((n) => n.startsWith("events-rules-") && n.endsWith(".md")).sort()) {
    let cur: any = null;
    let field = "";
    for (const l of readFileSync(join(dir, f), "utf8").split("\n")) {
      const h = l.match(/^#{3,4}\s+((?:UI|API)-[A-Z]+-\d+)\s*[—–-]\s*(.+)$/);
      if (h) {
        cur = { id: h[1], group: h[1].replace(/-\d+$/, ""), title: h[2], why: "", setup: "", steps: "", expected: "", oracle: "", source: "", refs: [] as string[] };
        out.push(cur);
        continue;
      }
      if (!cur) continue;
      const fm = l.match(/^-\s+\*\*(Why it matters|Setup|Steps|Expected|Oracle|Trace)(?:\s*\([^)]*\))?\.?\*\*\s*(.*)$/);
      if (fm) {
        field = { "Why it matters": "why", Setup: "setup", Steps: "steps", Expected: "expected", Oracle: "oracle", Trace: "source" }[fm[1]]!;
        cur[field] = fm[2];
      } else if (field && /^\s{2,}\S/.test(l)) cur[field] += " " + l.trim();
      else if (/^#{1,3}\s/.test(l)) field = "";
    }
    for (const c of out) c.refs = [...String(c.source).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  }
  return out;
}

/**
 * Rules a reviewer mapped by hand to cases written before the rules existed
 * (data/rules/rule-case-map.json: [{rule, cases, note}]) — e.g. the bid-number
 * integrity cases (EVI-*) that check a calculation rule in other words. Read as
 * "the case names the rule".
 */
function manualMap(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  try {
    for (const x of JSON.parse(readFileSync(join(OUT_DIR, "rule-case-map.json"), "utf8")) as Array<{ rule: string; cases: string[] }>)
      for (const c of x.cases) (m.get(c) ?? m.set(c, new Set()).get(c)!).add(x.rule);
  } catch {}
  return m;
}

function loadCases(includeRulesFiles: boolean): CaseDoc[] {
  const mapped = manualMap();
  const cat = JSON.parse(readFileSync(join(PROTO, "data", "test-cases.json"), "utf8")).cases as any[];
  const have = new Set(cat.map((c) => c.id));
  const extra = includeRulesFiles ? parseRulesMd().filter((c) => !have.has(c.id)) : [];
  const twins = loadTwins();
  return [...cat.map((c) => ({ c, mine: false })), ...extra.map((c) => ({ c, mine: true }))]
    // the product-workbook cases (PRD-*) span all of procure-to-pay; they are kept,
    // since several are about sourcing events and may state the same rule.
    .map(({ c, mine }) => {
      const tw = (c.refs ?? []).map((r: string) => twins.get(r)).filter(Boolean);
      const twinText = tw.map((t: any) => `${t.method} ${t.path} ${t.expectedResult ?? ""} ${(t.steps ?? []).join(" ")} ${t.rule ?? ""}`).join(" ");
      const hay = `${c.title} ${c.why} ${c.setup ?? ""} ${c.steps} ${c.expected} ${c.oracle} ${c.source} ${twinText}`;
      const files = citesOf(hay, []).filter((x) => x.a > 0).map(({ file, a, b }) => ({ file, a, b }));
      const eps = new Set(endpointsIn(hay));
      for (const t of tw) if (t.method && t.path) eps.add(normEndpoint(t.method, t.path));
      return {
        id: c.id,
        group: c.group,
        title: c.title,
        hay,
        files,
        codes: new Set(codesIn(hay)),
        endpoints: eps,
        ruleIds: new Set([...[...hay.matchAll(/\bR-[A-Z]{3}-\d{3}-\d+\b/g)].map((m) => m[0]), ...(mapped.get(c.id) ?? [])]),
        fromRulesFiles: mine,
      } as CaseDoc;
    });
}

// ── TF-IDF ───────────────────────────────────────────────────────────────────
const STOP = new Set(
  "the a an and or of to in on for is are be by with as at it its this that from not no if when then than any all each per one only else into via was were has have had can cannot does do which who what where same but so also more most other there their them they http code status refused returns return error".split(" "),
);
function terms(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[`"“”'’]/g, " ")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
}
class Tfidf {
  df = new Map<string, number>();
  n = 0;
  vecs: Array<Map<string, number>> = [];
  norms: number[] = [];
  index = new Map<string, number[]>();
  constructor(docs: string[]) {
    const tfs = docs.map((d) => {
      const m = new Map<string, number>();
      for (const t of terms(d)) m.set(t, (m.get(t) ?? 0) + 1);
      return m;
    });
    this.n = docs.length;
    for (const m of tfs) for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    tfs.forEach((m, i) => {
      const v = new Map<string, number>();
      let nn = 0;
      for (const [t, f] of m) {
        const w = (1 + Math.log(f)) * this.idf(t);
        v.set(t, w);
        nn += w * w;
        (this.index.get(t) ?? this.index.set(t, []).get(t)!).push(i);
      }
      this.vecs.push(v);
      this.norms.push(Math.sqrt(nn) || 1);
    });
  }
  idf(t: string) {
    return Math.log((this.n + 1) / ((this.df.get(t) ?? 0) + 1)) + 1;
  }
  /** cosine of `q` with every doc sharing a term; returns doc index → score */
  query(q: string): Map<number, number> {
    const qv = new Map<string, number>();
    for (const t of terms(q)) qv.set(t, (qv.get(t) ?? 0) + 1);
    let qn = 0;
    const w = new Map<string, number>();
    for (const [t, f] of qv) {
      if (!this.df.has(t)) continue;
      const x = (1 + Math.log(f)) * this.idf(t);
      w.set(t, x);
      qn += x * x;
    }
    qn = Math.sqrt(qn) || 1;
    const acc = new Map<number, number>();
    for (const [t, x] of w) for (const i of this.index.get(t) ?? []) acc.set(i, (acc.get(i) ?? 0) + x * this.vecs[i].get(t)!);
    for (const [i, s] of acc) acc.set(i, s / (qn * this.norms[i]));
    return acc;
  }
}

// ── the memory as a meaning signal (optional, cached) ────────────────────────
const MEM_CACHE = join(OUT_DIR, "memory-match-cache.json");
async function memorySignal(rules: Rule[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!flag("memory")) return out;
  const cache: Record<string, string[]> = existsSync(MEM_CACHE) ? JSON.parse(readFileSync(MEM_CACHE, "utf8")) : {};
  const { config } = await import("dotenv");
  config({ path: join(PROTO, ".env") });
  const { retrieve } = await import("../src/rag/knowledgeBase.js");
  let asked = 0;
  for (const r of rules) {
    const key = createHash("sha1").update(r.section + "|" + r.statement).digest("hex").slice(0, 16);
    if (!cache[key]) {
      try {
        const hits = await Promise.race([
          retrieve(`${r.section}. ${r.statement}`, 10, { kinds: ["test-case"] }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("memory timeout 20s")), 20000)),
        ]);
        cache[key] = hits.map((h: any) => h.labels?.[0]).filter(Boolean);
      } catch (e) {
        cache[key] = [];
      }
      if (++asked % 50 === 0) {
        writeFileSync(MEM_CACHE, JSON.stringify(cache));
        console.log(`  memory: ${asked} rules asked`);
      }
    }
    out.set(r.id, cache[key]);
  }
  writeFileSync(MEM_CACHE, JSON.stringify(cache));
  try {
    const { closeSpineDb } = await import("../src/db/spineDb.js");
    await closeSpineDb();
  } catch {}
  return out;
}

// ── 3. map ───────────────────────────────────────────────────────────────────
interface Match {
  id: string;
  score: number;
  signals: string[];
}
function sameFile(a: string, b: string) {
  return a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
}
export function mapRules(rules: Rule[], cases: CaseDoc[], mem: Map<string, string[]>) {
  const tf = new Tfidf(cases.map((c) => `${c.title} ${c.title} ${c.hay}`));
  const byIdx = new Map(cases.map((c, i) => [c.id, i]));
  const result = new Map<string, { verdict: Verdict; best: Match[] }>();
  for (const r of rules) {
    const sims = tf.query(`${r.section} ${r.statement}`);
    const memIds = mem.get(r.id) ?? [];
    const cand = new Set<number>();
    for (const [i, s] of sims) if (s >= 0.18) cand.add(i);
    for (const id of memIds) if (byIdx.has(id)) cand.add(byIdx.get(id)!);
    cases.forEach((c, i) => {
      if (c.ruleIds.has(r.id)) cand.add(i);
      if (r.codes.some((x) => c.codes.has(x))) cand.add(i);
      if (r.file && r.lines && c.files.some((f) => sameFile(f.file, r.file!))) cand.add(i);
    });
    const matches: Match[] = [];
    for (const i of cand) {
      const c = cases[i];
      const sig: string[] = [];
      let score = 0;
      let pins = false; // the case is pinned to THIS rule's code/line, not just its topic
      if (c.ruleIds.has(r.id)) {
        score += 10;
        sig.push("names the rule");
        pins = true;
      }
      if (r.file && r.lines) {
        const hit = c.files.find((f) => sameFile(f.file, r.file!) && f.a <= r.lines![1] + 3 && f.b >= r.lines![0] - 3);
        if (hit) {
          // a case citing a tight range around the rule's lines is about that rule;
          // one citing a 40-line block is about the whole method
          score += hit.b - hit.a <= 12 ? 5 : 3.5;
          pins = true;
          sig.push(`cites ${basename(hit.file)}:${hit.a}${hit.b !== hit.a ? `-${hit.b}` : ""}`);
        } else if (c.files.some((f) => sameFile(f.file, r.file!))) {
          score += 0.75;
          sig.push(`same file ${basename(r.file)}`);
        }
      }
      const codeHit = r.codes.filter((x) => c.codes.has(x));
      if (codeHit.length) {
        const rare = codeHit.some((x) => !COMMON_CODES.has(x));
        score += rare ? 3 : 1.25;
        if (rare) pins = true;
        sig.push(`code ${codeHit.join("/")}${rare ? "" : " (common)"}`);
      }
      if (r.endpoint && c.endpoints.has(r.endpoint)) {
        score += 2;
        sig.push(`endpoint ${r.endpoint}`);
      }
      const s = sims.get(i) ?? 0;
      if (s >= 0.32) {
        score += 2;
        sig.push(`wording ${s.toFixed(2)}`);
      } else if (s >= 0.22) {
        score += 1;
        sig.push(`wording ${s.toFixed(2)}`);
      }
      const mr = memIds.indexOf(c.id);
      if (mr >= 0) {
        score += mr < 3 ? 2 : 1.25;
        sig.push(`memory #${mr + 1}`);
      }
      // a common code on its own says nothing about which rule the case is about
      if (score >= 2.5) matches.push({ id: c.id, score: +(score + (pins ? 0.001 : 0)).toFixed(3), signals: sig });
    }
    matches.sort((a, b) => b.score - a.score);
    const best = matches.slice(0, 5);
    const top = best[0];
    const topPinned = top && /names the rule|cites |code \d+(?!.*common)/.test(top.signals.join(" "));
    let verdict: Verdict = "not covered";
    if (top && (top.score >= 10 || (topPinned && top.score >= 5))) verdict = "covered";
    else if (top && top.score >= 3.5) verdict = "partly";
    result.set(r.id, { verdict, best });
  }
  return result;
}

// ── 4. report ────────────────────────────────────────────────────────────────
function matrix(rules: Rule[], cov: Map<string, { verdict: Verdict }>) {
  const by = (key: (r: Rule) => string) => {
    const m: Record<string, Record<Verdict | "total", number>> = {};
    for (const r of rules) {
      const k = key(r);
      m[k] ??= { total: 0, covered: 0, partly: 0, "not covered": 0 };
      m[k].total++;
      m[k][cov.get(r.id)!.verdict]++;
    }
    return m;
  };
  return { byArea: by((r) => r.area), byKind: by((r) => r.kind), byPriority: by((r) => r.priority), byLayer: by((r) => r.layer) };
}
function totals(rules: Rule[], cov: Map<string, { verdict: Verdict }>) {
  const t = { total: rules.length, covered: 0, partly: 0, "not covered": 0 } as Record<string, number>;
  for (const r of rules) t[cov.get(r.id)!.verdict]++;
  return t;
}

const AREA_NAMES: Record<string, string> = {
  BID: "Bids (controllers)", EVG: "Event groups (controllers)", STG: "Stages (controllers)", LIV: "Live trade v1 (controllers)",
  AWD: "Evaluation and award (controllers)", AUC: "Auctions and templates (controllers)", MTR: "Stage model (TradeRequest)",
  MEG: "Event model, lines, evaluation", MBP: "Bid and proposal models", CAL: "Calculation services", LIF: "Lifecycle services",
  JOB: "Jobs, reminders, notifications", VIS: "Policies and what each actor sees", CFG: "Company settings and flags",
  FCR: "Console: create screens", FLV: "Console: live event screens", FLA: "Console: list and award screens", DOC: "Product docs vs code",
};

function pct(a: number, b: number) {
  return b ? `${Math.round((100 * a) / b)}%` : "–";
}

function writeDoc(rules: Rule[], cov: Map<string, { verdict: Verdict; best: Match[] }>, before?: Record<string, number>, beforeByArea?: Record<string, any>) {
  const m = matrix(rules, cov);
  const t = totals(rules, cov);
  const L: string[] = [];
  L.push("# Rule coverage — sourcing events");
  L.push("");
  L.push(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} by \`prototype/scripts/rule-coverage.ts\`. Rules come from the memory's digests (knowledge/events/backend-digest, frontend-digest, doc-vs-code.md), every one cited to the line of code that makes it true. Test cases come from the written catalog (data/test-cases.json${rules.length && [...cov.values()].length ? ", plus test-cases/events-rules-*.md" : ""}).`);
  L.push("");
  L.push("**How a rule counts as tested.** A case *covers* a rule when it is pinned to it — it names the rule, cites the same file and lines, or expects the same uncommon error code — and is about the same thing (same endpoint, similar wording, or the memory ranks it among the ten closest cases). *Partly* means there is evidence but not enough (only the topic, or only a common code such as 2 or 101). *Not covered* means no case comes close. This is deterministic matching, not a judgement; a spot-check of the verdicts is in the report that produced this file.");
  L.push("");
  L.push(`## Totals`);
  L.push("");
  L.push(`| | Rules | Covered | Partly | Not covered |`);
  L.push(`|---|---:|---:|---:|---:|`);
  if (before) L.push(`| Before the rule cases (catalog only) | ${before.total} | ${before.covered} (${pct(before.covered, before.total)}) | ${before.partly} | ${before["not covered"]} (${pct(before["not covered"], before.total)}) |`);
  L.push(`| ${before ? "After (catalog + events-rules-*.md)" : "Now"} | ${t.total} | ${t.covered} (${pct(t.covered, t.total)}) | ${t.partly} | ${t["not covered"]} (${pct(t["not covered"], t.total)}) |`);
  L.push("");
  const table = (title: string, data: Record<string, Record<string, number>>, names: Record<string, string> = {}, prev?: Record<string, any>) => {
    L.push(`## ${title}`);
    L.push("");
    L.push(`| | Rules | Covered | Partly | Not covered |${prev ? " Covered before |" : ""}`);
    L.push(`|---|---:|---:|---:|---:|${prev ? "---:|" : ""}`);
    for (const [k, v] of Object.entries(data).sort((a, b) => b[1].total - a[1].total))
      L.push(`| ${names[k] ? `${names[k]} (${k})` : k} | ${v.total} | ${v.covered} | ${v.partly} | ${v["not covered"]} |${prev ? ` ${prev[k]?.covered ?? 0} |` : ""}`);
    L.push("");
  };
  table("By area", m.byArea, AREA_NAMES, beforeByArea);
  table("By kind of rule", m.byKind);
  table("By what is at stake", m.byPriority, { money: "Money (prices, totals, tax, savings, currency)", access: "Who may act / who sees what", "state-time": "Status and time rules", "typed-error": "Other checks with a typed error", other: "Other" });
  L.push("## Not covered — the most important first");
  L.push("");
  L.push("Each line: rule id · kind · what the code does · where. The full list (with the closest cases and why they did not count) is in `prototype/data/rules/rule-coverage.json`.");
  L.push("");
  const order: Rule["priority"][] = ["money", "access", "state-time", "typed-error", "other"];
  const ncAll = rules.filter((r) => cov.get(r.id)!.verdict === "not covered");
  const nc = ncAll.filter((r) => !NOT_CHECKABLE.has(r.id)).sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority) || a.id.localeCompare(b.id));
  const skipped = ncAll.filter((r) => NOT_CHECKABLE.has(r.id));
  if (skipped.length) {
    L.push(`${skipped.length} of the ${ncAll.length} not-covered rules were reviewed and judged not checkable from outside (dead code, logging only, internal caches, a path only an old mobile app reaches, needs a database edit); each has its reason in \`prototype/data/rules/not-checkable.json\`. They are listed last.`);
    L.push("");
  }
  for (const p of order) {
    const list = nc.filter((r) => r.priority === p);
    if (!list.length) continue;
    L.push(`### ${{ money: "Money", access: "Who may act / who sees what", "state-time": "Status and time", "typed-error": "Typed errors", other: "Other" }[p]} — ${list.length}`);
    L.push("");
    for (const r of list.slice(0, 120)) L.push(`- \`${r.id}\` · ${r.kind}${r.gap ? " · gap" : ""} · ${r.statement.replace(/\|/g, "/").slice(0, 220)}${r.statement.length > 220 ? "…" : ""} · \`${r.cites[0] ?? r.file ?? "?"}\``);
    if (list.length > 120) L.push(`- … and ${list.length - 120} more (see the JSON).`);
    L.push("");
  }
  if (skipped.length) {
    L.push(`### Not checkable from outside — ${skipped.length}`);
    L.push("");
    for (const r of skipped.slice(0, 80)) L.push(`- \`${r.id}\` · ${r.statement.replace(/\|/g, "/").slice(0, 140)}${r.statement.length > 140 ? "…" : ""} — *${NOT_CHECKABLE.get(r.id)}*`);
    if (skipped.length > 80) L.push(`- … and ${skipped.length - 80} more (see not-checkable.json).`);
    L.push("");
  }
  mkdirSync(join(REPO, "docs"), { recursive: true });
  writeFileSync(join(REPO, "docs", "rule-coverage.md"), L.join("\n"));
}

// Rules judged NOT CHECKABLE from outside (dead code, logging, a path only an old
// mobile app reaches, needs a database edit…), each with the reason, written by
// whoever reviewed the rule. They stay "not covered" but are reported apart.
const NOT_CHECKABLE: Map<string, string> = (() => {
  const f = join(OUT_DIR, "not-checkable.json");
  try {
    return new Map((JSON.parse(readFileSync(f, "utf8")) as Array<{ rule: string; reason: string }>).map((x) => [x.rule, x.reason]));
  } catch {
    return new Map();
  }
})();

// ── main ─────────────────────────────────────────────────────────────────────
const rules = extractRules();
mkdirSync(OUT_DIR, { recursive: true });
const kindCount = rules.reduce<Record<string, number>>((a, r) => ((a[r.kind] = (a[r.kind] ?? 0) + 1), a), {});
writeFileSync(
  join(OUT_DIR, "events-rules.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      about: "Every rule the events digests state, one record per numbered check or labelled rule line. id = R-<AREA>-<section>-<n>. Regenerate with `npx tsx scripts/rule-coverage.ts`.",
      sources: digestFiles().map((f) => `knowledge/events/${f}`),
      counts: { total: rules.length, byKind: kindCount },
      rules,
    },
    null,
    1,
  ),
);
console.log(`Extracted ${rules.length} rules from ${digestFiles().length} digests — ${Object.entries(kindCount).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`  without a file:line: ${rules.filter((r) => !r.lines).length} · with an error code: ${rules.filter((r) => r.codes.length).length} · gaps: ${rules.filter((r) => r.gap).length}`);

const mem = await memorySignal(rules);
const catalogOnly = loadCases(false);
const covBefore = mapRules(rules, catalogOnly, mem);
const before = totals(rules, covBefore);
const beforeByArea = matrix(rules, covBefore).byArea;
const withMine = flag("catalog-only") ? catalogOnly : loadCases(true);
const mineCount = withMine.filter((c) => c.fromRulesFiles).length;
const cov = flag("catalog-only") || !mineCount ? covBefore : mapRules(rules, withMine, mem);
const after = totals(rules, cov);

console.log(`\nCoverage against the catalog (${catalogOnly.length} cases): covered ${before.covered} · partly ${before.partly} · not covered ${before["not covered"]}`);
if (cov !== covBefore) console.log(`Coverage with test-cases/events-rules-*.md (+${mineCount} cases): covered ${after.covered} · partly ${after.partly} · not covered ${after["not covered"]}`);
const mx = matrix(rules, cov);
console.log("\n  area  rules covered partly not");
for (const [k, v] of Object.entries(mx.byArea).sort()) console.log(`  ${k.padEnd(5)} ${String(v.total).padStart(5)} ${String(v.covered).padStart(7)} ${String(v.partly).padStart(6)} ${String(v["not covered"]).padStart(4)}`);
console.log("\n  kind         rules covered partly not");
for (const [k, v] of Object.entries(mx.byKind).sort()) console.log(`  ${k.padEnd(12)} ${String(v.total).padStart(5)} ${String(v.covered).padStart(7)} ${String(v.partly).padStart(6)} ${String(v["not covered"]).padStart(4)}`);

writeFileSync(
  join(OUT_DIR, "rule-coverage.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method: "deterministic: rule id named / file+line overlap / error code / endpoint / TF-IDF wording / memory top-10 (when --memory)",
      memoryUsed: flag("memory"),
      totals: { before, after: cov === covBefore ? before : after },
      matrix: mx,
      matrixBefore: matrix(rules, covBefore),
      rules: rules.map((r) => ({
        id: r.id,
        area: r.area,
        kind: r.kind,
        priority: r.priority,
        gap: r.gap,
        verdict: cov.get(r.id)!.verdict,
        verdictBefore: covBefore.get(r.id)!.verdict,
        notCheckable: NOT_CHECKABLE.get(r.id),
        cite: r.cites[0] ?? r.file,
        statement: r.statement,
        cases: cov.get(r.id)!.best,
      })),
    },
    null,
    1,
  ),
);
writeDoc(rules, cov, cov === covBefore ? undefined : before, cov === covBefore ? undefined : beforeByArea);
console.log(`\nWrote data/rules/events-rules.json, data/rules/rule-coverage.json, docs/rule-coverage.md`);

const show = opt("show");
if (show) {
  const r = rules.find((x) => x.id === show);
  console.log(JSON.stringify({ rule: r, coverage: cov.get(show) }, null, 1));
}
// --todo <dir>: one JSON per area with the rules still to test (not covered first, then partly),
// each with the nearest cases, for whoever writes the missing cases.
const todoDir = opt("todo");
if (todoDir) {
  mkdirSync(todoDir, { recursive: true });
  const order: Rule["priority"][] = ["money", "access", "state-time", "typed-error", "other"];
  for (const area of [...new Set(rules.map((r) => r.area))]) {
    const list = rules
      .filter((r) => r.area === area && cov.get(r.id)!.verdict !== "covered" && !NOT_CHECKABLE.has(r.id))
      .sort((a, b) => (cov.get(a.id)!.verdict === cov.get(b.id)!.verdict ? 0 : cov.get(a.id)!.verdict === "not covered" ? -1 : 1) || order.indexOf(a.priority) - order.indexOf(b.priority))
      .map((r) => ({
        id: r.id, verdict: cov.get(r.id)!.verdict, kind: r.kind, priority: r.priority, gap: r.gap, section: r.section, statement: r.statement,
        cites: r.cites, codes: r.codes.map((c) => `${c} "${ERRORS[c] ?? "?"}"`), endpoint: r.endpoint, digest: r.digest,
        nearest: cov.get(r.id)!.best.slice(0, 3).map((m) => ({ id: m.id, signals: m.signals.join(", ") })),
      }));
    writeFileSync(join(todoDir, `todo-${area}.json`), JSON.stringify(list, null, 1));
  }
  console.log(`wrote todo-<AREA>.json files to ${todoDir}`);
}
const unc = opt("uncovered");
if (unc) {
  for (const r of rules.filter((x) => x.area === unc && cov.get(x.id)!.verdict !== "covered"))
    console.log(`${r.id} [${r.kind}${r.gap ? ",gap" : ""}] ${cov.get(r.id)!.verdict} :: ${r.statement} :: ${r.cites[0] ?? r.file ?? "?"}${cov.get(r.id)!.best[0] ? `  ~ ${cov.get(r.id)!.best[0].id} (${cov.get(r.id)!.best[0].signals.join(", ")})` : ""}`);
}
