/**
 * From "these procol-backend files changed" to "these platform features and
 * cases should run" — deterministically, no LLM.
 *
 * The chain, strongest link first:
 *
 *   1. ROUTE      a controller changed → the actions whose `def` a hunk touched
 *                 (or every action, when the change is class-level) → their
 *                 routes in config/routes.rb → the library cases that call
 *                 those routes → those cases' features.
 *   2. REFERENCE  a service / model / policy / worker changed → the
 *                 controllers that name its class (`git grep` at origin/main)
 *                 → step 1 for those controllers.
 *   3. KEYWORD    nothing reachable by code → the file's own words
 *                 (auction, proposal, surrogate…) → feature groups.
 *
 * Every function here is pure; backend-watch.ts feeds it git output. It is
 * unit-tested in ci-unit-tests.ts.
 */

export interface Route {
  method: string; // GET POST PATCH PUT DELETE
  /** relative to the API base, like a case path: "trade/:id/template_input" */
  path: string;
  /** "api/trade", "api/v1/purchase_requests" — the controller file's path under app/controllers */
  controller: string;
  action: string;
}

// ── config/routes.rb ────────────────────────────────────────────────────────

/** Drop a trailing Ruby comment, leaving `'trade#show'` alone. */
function stripComment(line: string): string {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === "\\") i++;
      else if (ch === q) q = null;
    } else if (ch === "'" || ch === '"') q = ch;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

const opensBlock = (l: string) => /\bdo(\s*\|[^|]*\|)?\s*$/.test(l) || /^\s*(def|if|unless|case|begin|while|until|class|module)\b/.test(l);
const closesBlock = (l: string) => /^\s*end\b/.test(l);

interface Ctx {
  path: string; // "api/v1/"
  module: string; // "api/v1/"
  controller?: string; // default controller from `scope …, controller: 'x'`
  resource?: { name: string; controller: string; member: boolean; collection: boolean };
}

const sym = (s: string) => s.replace(/^:/, "").replace(/^['"]|['"]$/g, "");
const joinPath = (...parts: string[]) =>
  parts
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .replace(/\(\.:format\)/g, "");

const RESOURCE_ACTIONS: Array<{ action: string; method: string; suffix: string }> = [
  { action: "index", method: "GET", suffix: "" },
  { action: "create", method: "POST", suffix: "" },
  { action: "new", method: "GET", suffix: "new" },
  { action: "edit", method: "GET", suffix: ":id/edit" },
  { action: "show", method: "GET", suffix: ":id" },
  { action: "update", method: "PATCH", suffix: ":id" },
  { action: "update", method: "PUT", suffix: ":id" },
  { action: "destroy", method: "DELETE", suffix: ":id" },
];

/**
 * Parse routes.rb into (method, path, controller, action). Only the API
 * namespace is kept — the paths a case calls are relative to `/api`.
 *
 * A pragmatic reader, not Ruby: it knows `namespace`, `scope` (path, module
 * and controller forms), `resources` with `only`/`except`/`controller`,
 * `member`/`collection`, `verb 'path' => 'ctrl#action'`, `verb 'path', to:`,
 * and `def xxx_routes` helpers invoked by name. Unknown lines are ignored.
 */
export function parseRoutes(rb: string): Route[] {
  const lines = rb.split("\n").map(stripComment);
  // 1. helper definitions: name → body lines
  const defs = new Map<string, string[]>();
  const top: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*def\s+(\w+)\s*$/);
    if (!m) {
      top.push(lines[i]);
      continue;
    }
    let depth = 1;
    const body: string[] = [];
    for (i++; i < lines.length; i++) {
      const l = lines[i];
      if (closesBlock(l)) depth--;
      if (depth === 0) break;
      if (opensBlock(l)) depth++;
      body.push(l);
    }
    defs.set(m[1], body);
  }

  const out: Route[] = [];
  const seen = new Set<string>();
  const add = (r: Route) => {
    if (!r.path.startsWith("api/") && r.path !== "api") return;
    const rel = { ...r, path: r.path.replace(/^api\/?/, "") };
    const k = `${rel.method} ${rel.path} ${rel.controller}#${rel.action}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(rel);
    }
  };
  const fullController = (ctx: Ctx, c: string) => (c.includes("/") ? c.replace(/^\//, "") : `${ctx.module}${c}`);

  const walk = (body: string[], start: Ctx, depthGuard = 0) => {
    if (depthGuard > 8) return;
    const stack: Ctx[] = [start];
    for (const raw of body) {
      const l = raw.trim();
      if (!l) continue;
      const ctx = stack[stack.length - 1];
      if (closesBlock(raw)) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      // a helper invoked by name
      if (/^\w+$/.test(l) && defs.has(l)) {
        walk(defs.get(l)!, ctx, depthGuard + 1);
        continue;
      }
      let m: RegExpMatchArray | null;
      if ((m = l.match(/^namespace\s+(:\w+|'[^']+'|"[^"]+")/))) {
        const n = sym(m[1]);
        stack.push({ path: `${ctx.path}${n}/`, module: `${ctx.module}${n}/` });
        if (!opensBlock(l)) stack.pop();
        continue;
      }
      if ((m = l.match(/^scope\b(.*)$/))) {
        const rest = m[1];
        const mod = rest.match(/module:\s*(:\w+|'[^']+'|"[^"]+")/);
        const ctrl = rest.match(/(?::controller\s*=>|controller:)\s*(:\w+|'[^']+'|"[^"]+")/);
        const pathArg = rest.match(/^\s*\(?\s*(:\w+|'[^']+'|"[^"]+")/);
        const pth = pathArg && !/^\s*\(?\s*module:/.test(rest) ? sym(pathArg[1]) : "";
        stack.push({
          path: pth ? `${ctx.path}${pth}/` : ctx.path,
          module: mod ? `${ctx.module}${sym(mod[1])}/` : ctx.module,
          controller: ctrl ? sym(ctrl[1]) : ctx.controller,
        });
        if (!opensBlock(l)) stack.pop();
        continue;
      }
      if ((m = l.match(/^(resources|resource)\s+(:\w+)(.*)$/))) {
        const plural = m[1] === "resources";
        const name = sym(m[2]);
        const rest = m[3];
        const ctrl = rest.match(/controller:\s*(:\w+|'[^']+'|"[^"]+")/);
        const controller = fullController(ctx, ctrl ? sym(ctrl[1]) : name);
        const only = rest.match(/only:\s*\[([^\]]*)\]/)?.[1];
        const except = rest.match(/except:\s*\[([^\]]*)\]/)?.[1];
        const list = (s?: string) => (s ? s.split(",").map((x) => sym(x.trim())).filter(Boolean) : undefined);
        const onlyL = list(only);
        const exceptL = list(except) ?? [];
        for (const a of RESOURCE_ACTIONS) {
          if (onlyL && !onlyL.includes(a.action)) continue;
          if (exceptL.includes(a.action)) continue;
          if (!plural && a.action === "index") continue;
          const suffix = plural ? a.suffix : a.suffix.replace(/^:id\/?/, "");
          add({ method: a.method, path: joinPath(ctx.path, name, suffix), controller, action: a.action });
        }
        if (opensBlock(l)) stack.push({ ...ctx, path: `${ctx.path}${name}/`, resource: { name, controller, member: false, collection: false } });
        continue;
      }
      if (/^member\s+do\b/.test(l) && ctx.resource) {
        stack.push({ ...ctx, path: `${ctx.path}:id/`, resource: { ...ctx.resource, member: true } });
        continue;
      }
      if (/^collection\s+do\b/.test(l) && ctx.resource) {
        stack.push({ ...ctx, resource: { ...ctx.resource, collection: true } });
        continue;
      }
      if ((m = l.match(/^(get|post|patch|put|delete)\s+(.+)$/))) {
        const method = m[1].toUpperCase();
        const rest = m[2];
        const target = rest.match(/(?:=>|to:)\s*['"]([\w/]*)#(\w+)['"]/);
        const first = rest.match(/^\(?\s*(:\w+|'[^']*'|"[^"]*")/);
        if (!first) continue;
        const p = sym(first[1]);
        if (target) {
          const controller = target[1] ? fullController(ctx, target[1]) : ctx.controller ? fullController(ctx, ctx.controller) : ctx.resource?.controller;
          if (controller) add({ method, path: joinPath(ctx.path, p), controller, action: target[2] });
        } else if (ctx.resource && first[1].startsWith(":")) {
          // `post :transition` inside member/collection
          add({ method, path: joinPath(ctx.path, p), controller: ctx.resource.controller, action: p });
        } else if (ctx.controller) {
          const action = rest.match(/action:\s*(:\w+|'[^']+')/);
          add({ method, path: joinPath(ctx.path, p), controller: fullController(ctx, ctx.controller), action: action ? sym(action[1]) : p });
        }
        continue;
      }
      if (opensBlock(raw)) stack.push({ ...ctx }); // constraints, defaults, if … — nothing to add
    }
  };
  walk(top, { path: "", module: "" });
  return out;
}

// ── case paths ↔ routes ─────────────────────────────────────────────────────

/** `/event_groups/{{eventGroupUuid}}/get_line_items?x=1` → `event_groups/:id/get_line_items` */
export function normaliseCasePath(p: string): string {
  return p
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .map((seg) => (/\{\{\w+\}\}/.test(seg) || /^\d+$/.test(seg) || (/^[A-Za-z0-9]{8}$/.test(seg) && /\d/.test(seg)) ? ":id" : seg))
    .join("/");
}

export function routeMatchesCase(route: Pick<Route, "method" | "path">, method: string, casePath: string): boolean {
  const m = method.toUpperCase();
  if (route.method !== m && !(route.method === "PUT" && m === "PATCH") && !(route.method === "PATCH" && m === "PUT")) return false;
  const a = route.path.split("/").filter(Boolean);
  const b = normaliseCasePath(casePath).split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg.startsWith(":") || seg.startsWith("*") || seg === b[i]);
}

// ── which actions a controller diff touched ─────────────────────────────────

/** New-file line numbers a unified diff (-U0) touched. */
export function changedLines(diff: string): number[] {
  const out: number[] = [];
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) out.push(Math.max(1, start));
    for (let i = 0; i < count; i++) out.push(start + i);
  }
  return out;
}

/**
 * The method each changed line sits in. A line above the first `def` — a
 * `before_action`, an include, a constant — belongs to every action, which
 * is said as the single entry "*".
 */
export function enclosingDefs(source: string, lines: number[]): string[] {
  const src = source.split("\n");
  const defAt: Array<{ line: number; name: string }> = [];
  src.forEach((l, i) => {
    const m = l.match(/^\s*def\s+(?:self\.)?([\w?!]+)/);
    if (m) defAt.push({ line: i + 1, name: m[1] });
  });
  const names = new Set<string>();
  for (const n of lines) {
    const d = [...defAt].reverse().find((x) => x.line <= n);
    names.add(d ? d.name : "*");
  }
  return [...names];
}

// ── files → features ────────────────────────────────────────────────────────

/** `app/controllers/api/v1/purchase_requests_controller.rb` → `api/v1/purchase_requests` */
export function controllerOfFile(file: string): string | undefined {
  return file.match(/^app\/controllers\/(.+)_controller\.rb$/)?.[1];
}

/** `app/services/trade/template_input_service.rb` → `TemplateInputService` (+ the namespaced form) */
export function classNamesOfFile(file: string): string[] {
  const m = file.match(/^(?:app\/(?:services|models|policies|workers|jobs|forms|serializers|poro_classes|data_models|mailers|concerns|helpers|controllers\/concerns)|lib)\/(.+)\.rb$/);
  if (!m) return [];
  const camel = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  const parts = m[1].split("/");
  const base = camel(parts[parts.length - 1]);
  const ns = parts.map(camel).join("::");
  return ns === base ? [base] : [base, ns];
}

/** A policy is the permission rule for the controller of the same name. */
export function controllersForPolicy(file: string, known: Set<string>): string[] {
  const m = file.match(/^app\/policies\/(.+)_policy\.rb$/);
  if (!m) return [];
  const n = m[1];
  const guesses = [n, `${n}s`, n.replace(/y$/, "ies"), n.replace(/s$/, "")];
  return [...known].filter((c) => guesses.some((g) => c === `api/${g}` || c.endsWith(`/${g}`)));
}

/**
 * The words in a file path that name a platform feature group. Ordered from
 * specific to general; every rule that matches contributes.
 */
export const KEYWORD_FEATURES: Array<[RegExp, string[]]> = [
  [/surrogate/, ["bids.surrogate"]],
  [/counter_?offer|negotiat/, ["bids.counter_offer"]],
  [/auction|knockout|dutch/, ["auction.convert", "auction.rank", "auction.price", "auction.increments", "auction.dynamic_extension", "auction.visibility", "events.rfp_auction"]],
  [/vendor_bulk|bulk_upload|bulk_vendor/, ["vendorbulk.file", "vendorbulk.rows", "vendorbulk.dedup", "vendorbulk.onboarding"]],
  [/vendor_revalidation|vendor_validation_histor|external_api\/validation/, ["revalidation.access", "revalidation.schedule", "revalidation.coverage", "revalidation.values", "revalidation.documents", "revalidation.status", "revalidation.listing", "revalidation.audit"]],
  [/vendor_entity_mapping/, ["vendors.entity_mapping"]],
  [/template_response|evaluat|qcs|scor/, ["evaluation.score", "evaluation.qcs", "evaluation.tna"]],
  [/proposal|award|loa\b|_loa|letter_of_award/, ["award.proposal", "award.add_response", "award.partial", "award.submit", "award.approval"]],
  [/version|amendment/, ["events.versioning"]],
  [/boq|line_item/, ["events.boq", "events.validation"]],
  [/invit|audience/, ["events.invite_vendors"]],
  [/staggered|extend|deadline/, ["events.extend_deadline"]],
  [/\bbids?\b|bid_|_bid/, ["bids.place", "bids.submit", "bids.participation", "bids.price_cap"]],
  [/templates?\b|template_/, ["events.templates"]],
  [/event_group|trade|rfx|erfx|sourcing/, ["events.rfq_only", "events.rfp_only", "events.rfp_rfq", "events.config", "events.validation", "events.lifecycle", "events.publish"]],
  [/purchase_request|\bpr_|_pr\b|pr_item/, ["pr.list", "pr.read", "pr.partial_closure", "pr.to_event"]],
  [/intake/, ["intake.create", "intake.approval", "intake.to_pr"]],
  [/purchase_order|\borders?\b/, ["po.generate", "po.contents", "po.release", "po.vendor_accept"]],
  [/product_categor|categor/, ["masterdata.category", "masterdata.subcategory"]],
  [/\bproducts?\b|product_/, ["masterdata.product"]],
  [/location|\bcit(y|ies)\b|zone|delivery_address/, ["masterdata.location"]],
  [/team/, ["masterdata.team", "users.team_member"]],
  [/\busers?\b|user_|role|permission|polic/, ["users.permissions", "users.create"]],
  [/company_config|configuration|feature_flag|dashboard_config/, ["platform.configurations"]],
  [/approval/, ["platform.approvals", "award.approval"]],
  [/audit|activity_log/, ["platform.audit"]],
  [/invoice|grn|\basn\b|payment|credit_note|debit_note/, ["p2p.invoice", "p2p.grn", "finance.payment"]],
  [/vendor|supplier/, ["vendors.discovery", "vendors.onboarding"]],
];

export function keywordFeatures(file: string): string[] {
  const hay = file.toLowerCase().replace(/\.rb$/, "").replace(/[/.-]/g, " ");
  const out = new Set<string>();
  for (const [re, feats] of KEYWORD_FEATURES) if (re.test(hay)) feats.forEach((f) => out.add(f));
  return [...out];
}

/** Files that change nothing a request can observe. */
export function isInert(file: string): boolean {
  return (
    /^(spec|test|docs?|\.github|coverage|tmp|log)\//.test(file) ||
    /\.(md|txt|yml\.example|rubocop\.yml)$/.test(file) ||
    /^(Gemfile\.lock|\.rubocop|\.gitignore|README)/.test(file) ||
    /^(lib\/tasks|script|scripts)\//.test(file) ||
    /^db\/(data_)?migrate\/.*(delete|cleanup|backfill|populate)/.test(file)
  );
}

export interface CaseRef {
  id: string;
  feature: string;
  title: string;
  method: string;
  path: string;
}

export interface FileMapping {
  file: string;
  via: "route" | "reference" | "keyword" | "inert" | "none";
  /** controllers reached (route / reference) */
  controllers: string[];
  /** actions reached, "*" = every action of the controller */
  actions: string[];
  routes: Array<Pick<Route, "method" | "path" | "action">>;
  cases: string[];
  features: string[];
  note?: string;
}

export interface MapInput {
  files: string[];
  routes: Route[];
  cases: CaseRef[];
  /** new-file source of a controller at the new commit (for `def` lookup) */
  sourceOf: (file: string) => string | undefined;
  /** unified -U0 diff of one file */
  diffOf: (file: string) => string | undefined;
  /** controllers under app/controllers whose source names this class */
  controllersReferencing: (className: string) => string[];
  /** a controller reached through more than this many references is "widely used": keyword mapping instead */
  referenceCap?: number;
}

export function mapChangedFiles(input: MapInput): FileMapping[] {
  const byController = new Map<string, Route[]>();
  for (const r of input.routes) byController.set(r.controller, [...(byController.get(r.controller) ?? []), r]);
  const knownControllers = new Set(byController.keys());
  const cap = input.referenceCap ?? 6;

  const casesFor = (routes: Route[]) => {
    const hit = input.cases.filter((c) => routes.some((r) => routeMatchesCase(r, c.method, c.path)));
    return { cases: hit.map((c) => c.id), features: [...new Set(hit.map((c) => c.feature))] };
  };

  return input.files.map((file): FileMapping => {
    const base: FileMapping = { file, via: "none", controllers: [], actions: [], routes: [], cases: [], features: [] };
    if (isInert(file)) return { ...base, via: "inert", note: "tests, docs, scripts or a data clean-up — nothing a request can observe" };

    const ctrl = controllerOfFile(file);
    if (ctrl) {
      const all = byController.get(ctrl) ?? [];
      let actions = ["*"];
      const diff = input.diffOf(file);
      const src = input.sourceOf(file);
      if (diff && src) {
        const defs = enclosingDefs(src, changedLines(diff));
        const routed = new Set(all.map((r) => r.action));
        // A change in a private helper reaches every action that might call it.
        actions = defs.includes("*") || defs.some((d) => !routed.has(d)) ? ["*"] : defs;
      }
      const routes = actions.includes("*") ? all : all.filter((r) => actions.includes(r.action));
      const { cases, features } = casesFor(routes);
      if (features.length)
        return { ...base, via: "route", controllers: [ctrl], actions, routes: routes.map(({ method, path, action }) => ({ method, path, action })), cases, features };
      const kw = keywordFeatures(file);
      return {
        ...base,
        via: kw.length ? "keyword" : "none",
        controllers: [ctrl],
        actions,
        routes: routes.map(({ method, path, action }) => ({ method, path, action })),
        features: kw,
        note: routes.length ? `${routes.length} route(s) changed, but no library case calls them` : "no route in config/routes.rb points at this controller",
      };
    }

    // services, models, policies … → the controllers that use them
    let controllers = controllersForPolicy(file, knownControllers);
    if (!controllers.length) {
      const names = classNamesOfFile(file);
      const set = new Set<string>();
      for (const n of names) for (const c of input.controllersReferencing(n)) set.add(c);
      controllers = [...set];
    }
    if (controllers.length && controllers.length <= cap) {
      const routes = controllers.flatMap((c) => byController.get(c) ?? []);
      const { cases, features } = casesFor(routes);
      if (features.length)
        return { ...base, via: "reference", controllers, actions: ["*"], routes: routes.map(({ method, path, action }) => ({ method, path, action })), cases, features };
    }
    if (/^config\/locales\//.test(file))
      return { ...base, note: "error and notification wording changed — a case that checks a refusal's exact words may now read differently" };
    const kw = keywordFeatures(file);
    return {
      ...base,
      via: kw.length ? "keyword" : "none",
      controllers,
      features: kw,
      note:
        controllers.length > cap
          ? `used by ${controllers.length} controllers — too widely shared to pin down, so matched by name`
          : controllers.length
            ? "the controllers using it are not called by any library case"
            : "no controller names it",
    };
  });
}

// ── features → the runs worth starting ──────────────────────────────────────

/**
 * Can a journey of these features carry this feature's cases? Evaluation
 * needs a technical round; awarding, bidding and auctions need a priced one.
 */
export function fitsJourney(feature: string, comboFeatures: string[]): boolean {
  const rfp = comboFeatures.some((x) => /^events\.rfp_/.test(x));
  const priced = comboFeatures.some((x) => /^events\.(rfq_only|rfp_rfq|rfp_auction)$/.test(x));
  if (/^evaluation\./.test(feature)) return rfp;
  if (/^(award|bids|negotiation|po)\./.test(feature)) return priced;
  if (/^auction\./.test(feature)) return comboFeatures.includes("events.rfp_auction") || comboFeatures.includes("auction.convert");
  return true;
}

/**
 * Spread the edge / negative cases over the night's journeys: each feature's
 * edge cases run ONCE per client, on the first journey that already ticks the
 * feature, else on the fitting journey with the fewest cases so far.
 */
export function assignEdgeCases(
  edges: Array<{ id: string; feature: string }>,
  combos: Array<{ name: string; features: string[] }>,
): { byCombo: Map<string, { features: string[]; cases: string[] }>; unplaced: string[] } {
  const byCombo = new Map(combos.map((c) => [c.name, { features: [] as string[], cases: [] as string[] }]));
  const unplaced: string[] = [];
  const features = [...new Set(edges.map((e) => e.feature))].sort();
  for (const f of features) {
    const ids = edges.filter((e) => e.feature === f).map((e) => e.id);
    const own = combos.find((c) => c.features.includes(f));
    // Ticking one of these changes the journey itself (its event type, a
    // surrogate bid, a counter offer…), so they only ride on their own journey.
    const shapesJourney = /^events\.(rfq_only|rfp_only|rfp_rfq|rfp_auction|versioning)$|^bids\.(surrogate|counter_offer)$|^negotiation\.counter_offer$|^auction\.convert$/.test(f);
    const fitting = shapesJourney ? [] : combos.filter((c) => fitsJourney(f, c.features));
    const target = own ?? fitting.sort((a, b) => byCombo.get(a.name)!.cases.length - byCombo.get(b.name)!.cases.length)[0];
    if (!target) {
      unplaced.push(f);
      continue;
    }
    const slot = byCombo.get(target.name)!;
    if (!target.features.includes(f)) slot.features.push(f);
    slot.cases.push(...ids);
  }
  return { byCombo, unplaced };
}

/** The sourcing-events POC: the feature groups a journey run can exercise. */
export const EVENT_SCOPE = /^(events|bids|evaluation|award|auction|negotiation|erfx|eventfeatures)\./;

export interface PlannedRun {
  /** the journey this run walks, when it walks one */
  combo?: string;
  label: string;
  features: string[];
  /** only these library cases (in addition to the journey itself); empty = every case of the ticked features */
  cases: string[];
  /** the matched features this run covers */
  covers: string[];
}

/**
 * The fewest journey runs that walk every matched sourcing feature (greedy
 * set cover over the six journeys), plus the matched features no journey
 * walks, ticked on the first run so their own cases and edge cases run.
 *
 * `walks(feature, comboFeatures)` answers whether the journey of those
 * combo features walks the feature — journeyModel's journeyWalksFeature.
 */
export function planTargetedRuns(
  matched: Array<{ feature: string; cases: string[]; via: FileMapping["via"] }>,
  combos: Array<{ name: string; label: string; features: string[] }>,
  walks: (feature: string, comboFeatures: string[]) => boolean,
  opts: { maxRuns?: number; allFeatures?: boolean } = {},
): { runs: PlannedRun[]; outOfScope: string[]; dropped: string[] } {
  const max = opts.maxRuns ?? 3;
  const byFeature = new Map<string, { cases: Set<string>; exact: boolean }>();
  for (const m of matched) {
    const e = byFeature.get(m.feature) ?? { cases: new Set<string>(), exact: true };
    m.cases.forEach((c) => e.cases.add(c));
    if (m.via === "keyword" || !m.cases.length) e.exact = false;
    byFeature.set(m.feature, e);
  }
  const eventFeatures = [...byFeature.keys()].filter((f) => EVENT_SCOPE.test(f));
  const outOfScope = [...byFeature.keys()].filter((f) => !EVENT_SCOPE.test(f));
  const runs: PlannedRun[] = [];
  let left = new Set(eventFeatures);
  // An event type is covered only by a journey OF that type — journeyModel's
  // walks() says every type is "walked" (it is deciding which cases to drop,
  // not which event a run builds).
  const EVENT_TYPE = /^events\.(rfq_only|rfp_only|rfp_rfq|rfp_auction)$/;
  const fits = fitsJourney;
  const covers = (c: { features: string[] }) =>
    [...left].filter((f) => c.features.includes(f) || (!EVENT_TYPE.test(f) && fits(f, c.features) && walks(f, c.features)));
  while (left.size && runs.length < max) {
    const best = combos.map((c) => ({ c, got: covers(c) })).sort((a, b) => b.got.length - a.got.length)[0];
    if (!best || !best.got.length) break;
    runs.push({ combo: best.c.name, label: best.c.label, features: [...best.c.features], cases: [], covers: best.got });
    left = new Set([...left].filter((f) => !best.got.includes(f)));
  }
  // Features no journey walks (validation, templates, BOQ…): tick them on
  // the first run so their cases run after its journey.
  // Only features no journey walks go along as extras; a leftover event type
  // or journey feature (surrogate, counter offer…) would change the shape of
  // the first run's journey, so it is reported as not run instead.
  const walkedByAny = (f: string) => EVENT_TYPE.test(f) || combos.some((c) => c.features.includes(f) || (fits(f, c.features) && walks(f, c.features)));
  const extra = [...left].filter((f) => !walkedByAny(f));
  const tail = opts.allFeatures ? outOfScope : [];
  if ((extra.length || tail.length) && !runs.length) runs.push({ label: "The changed features' own cases", features: [], cases: [], covers: [] });
  // Each extra goes on the first run whose event can carry it (an evaluation
  // case on a run with a technical round), else on the first run.
  for (const f of extra) {
    const r = runs.find((x) => x.combo && fits(f, x.features)) ?? runs[0];
    if (!r.features.includes(f)) r.features.push(f);
    r.covers.push(f);
  }
  if (runs.length && tail.length) {
    runs[0].features.push(...tail.filter((f) => !runs[0].features.includes(f)));
    runs[0].covers.push(...tail);
  }
  // Cases: narrow a run to the matched cases only when every feature it
  // ticks was reached exactly (route or reference) — a keyword match knows
  // the feature, not the case.
  for (const r of runs) {
    const ticked = r.features.filter((f) => byFeature.has(f));
    const exact = ticked.length > 0 && ticked.every((f) => byFeature.get(f)!.exact);
    r.cases = exact ? [...new Set(ticked.flatMap((f) => [...byFeature.get(f)!.cases]))] : [];
  }
  const planned = new Set(runs.flatMap((r) => r.covers));
  const dropped = eventFeatures.filter((f) => !planned.has(f));
  return { runs, outOfScope: opts.allFeatures ? [] : outOfScope, dropped };
}
