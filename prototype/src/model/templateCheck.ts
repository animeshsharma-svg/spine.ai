/**
 * TEMPLATE CHECK RUN — fire the field-level cases of ONE template (caseGen.ts)
 * against a fresh sandbox event on UAT, judge each with engine.ts `classify`,
 * and save the whole thing as a normal run (runStore.saveRun → data/runs +
 * spine.ai's database) so the test report and history pick it up.
 *
 * Order of a run (every call bounded by CALL_MS; the run by its budget):
 *   1. open the template                         (API-XTPL-001 — probe a)
 *   2. create a sandbox draft event QA_Platform_TplCheck_<stamp>
 *   3. stage cases: one draft round per case, built from the template's own
 *      columns with one cell changed (POST /trade/template_input)
 *   4. bid cases (pricing templates with vendor columns, if any are selected):
 *      a round with valid values (+ price cap / floor if a case needs one) is
 *      published to the client's test vendor; the vendor signs in, starts a bid
 *      and saves their line once per case — refusals first, the valid line last
 *   5. technical answers (RFP templates): the round is published, the vendor
 *      starts a response and submits it once per case, valid one last
 *
 * Nothing here changes Procol configuration; everything created is a sandbox
 * record (QA_Platform_… titles) on the client's own test vendor.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ClientModel, ModelField, ModelTemplate } from "./types.js";
import { generateTemplateCases, sampleCases, caseCounts, type TemplateCase } from "./caseGen.js";
import { loadLatestModel } from "./store.js";
import { EVENT_TYPE_TO_USES } from "./templateUse.js";
import type { CheckOutcome, Check } from "../checks/engine.js";
import { saveRun } from "../runStore.js";

const CALL_MS = 45_000;
const BUDGET_MS = { sample: 12 * 60_000, full: 40 * 60_000 };
const MAX_FULL = 150;

export interface TemplateCheckOptions {
  companyId: number;
  /** template uuid; default = the chooser's suggestion for `type` */
  templateUuid?: string;
  /** event type the template is used for: rfq (default) | auction | rfp | boq */
  type?: string;
  mode?: "sample" | "full";
  /** only these case ids / catalog ids */
  only?: string[];
  /** skip the vendor (bid / answer) part — no publish, no vendor sign-in */
  buyerOnly?: boolean;
  /** save as a run (default true) */
  save?: boolean;
  onLine?: (line: string) => void;
  onCase?: (r: TemplateCheckResult, i: number, total: number) => void;
}

export interface TemplateCheckResult {
  id: string;
  catalogId: string;
  title: string;
  target: TemplateCase["target"];
  expected: TemplateCase["expected"];
  screenOnly: boolean;
  verdict: "pass" | "fail" | "inconclusive" | "not-run";
  /** plain English: what happened */
  actual: string;
  /** engine verdict text */
  reason: string;
  /** an accepted screen-only case: the API took what only the screen stops */
  gapConfirmed?: boolean;
  /** a screen-only case the server refused itself: the rule library under-states the backend */
  serverAlsoEnforces?: boolean;
  httpStatus: number | null;
  message: string | null;
  durationMs: number;
  request?: { method: string; path: string; body?: unknown };
}

export interface TemplateCheckRun {
  runId?: string;
  client: { id: number; name: string | null };
  template: { uuid: string; name: string; isDefault: boolean; useFor: string[] } | null;
  mode: "sample" | "full";
  generated: ReturnType<typeof caseCounts> | null;
  selected: number;
  results: TemplateCheckResult[];
  setup: Array<{ n: number; did: string; method: string; path: string; status: number; ms: number; ok: boolean }>;
  event?: { title: string; eventGroupUuid?: string; publishedRound?: string };
  summary: { pass: number; fail: number; inconclusive: number; notRun: number; gaps: number; serverErrors: number; serverAlsoEnforces: number };
  problems: string[];
  durationMs: number;
}

// ── sibling framework ────────────────────────────────────────────────────────

interface Sib {
  bodies: any;
  Endpoints: any;
  CONFIG: any;
  ApiClient: any;
  authenticate: (id: any) => Promise<any>;
  alternatives: (api: any, q?: string) => Promise<any>;
}
let sibP: Promise<Sib> | undefined;
async function sib(): Promise<Sib> {
  if (!sibP) {
    const { PROCOL_TEST } = await import("../executor.js");
    const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
    sibP = (async () => {
      const [bodies, endpoints, config, client, login, resolve] = await Promise.all([
        imp("flows/bodies.ts"),
        imp("api/endpoints.ts"),
        imp("config.ts"),
        imp("api/client.ts"),
        imp("auth/login.ts"),
        imp("catalog/resolve.ts"),
      ]);
      return {
        bodies,
        Endpoints: endpoints.Endpoints,
        CONFIG: config.CONFIG,
        ApiClient: client.ApiClient,
        authenticate: login.authenticate,
        alternatives: resolve.resolveCatalogAlternatives,
      };
    })();
    sibP.catch(() => (sibP = undefined));
  }
  return sibP;
}

function bounded<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error(`no answer within ${ms / 1000}s (${what})`)), ms)))]).finally(() => clearTimeout(t!));
}

/** One request → a CheckOutcome (never throws). */
async function call(api: any, method: string, path: string, body?: unknown): Promise<CheckOutcome & { code?: string }> {
  const t = Date.now();
  try {
    const r = await bounded<any>(api.raw(method, path, body !== undefined ? { body } : {}), CALL_MS, `${method} ${path}`);
    return {
      httpStatus: r.ok ? 200 : r.status || null,
      accepted: !!r.ok,
      message: r.ok ? null : redact(r.message ?? null),
      durationMs: Date.now() - t,
      data: r.data,
      code: r.code,
    };
  } catch (e) {
    return { httpStatus: null, accepted: false, message: redact((e as Error).message), durationMs: Date.now() - t };
  }
}
function redact(s: string | null): string | null {
  // the first line only: a Playwright timeout appends its whole call log (headers included)
  if (s) s = s.split("\n")[0];
  return s ? s.replace(/((?:access|api|auth|session|lightspeed)[-_]?token\s*[:=]\s*)[^\s&"'<>]+/gi, "$1<redacted>").replace(/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, "<redacted>").slice(0, 400) : s;
}

// ── valid values per column ──────────────────────────────────────────────────

function validValue(f: ModelField): unknown {
  switch (f.key) {
    case "ceil_price":
      return 1000;
    case "floor_price":
      return 1;
    case "floor_quantity":
      return 1;
    case "tick_size":
      return 1;
  }
  if (f.options?.length) return f.options[0];
  switch (f.inputType) {
    case "number":
    case "price":
      return 10;
    case "quantity":
      return 10;
    case "percentage":
    case "percent_and_amount":
      return 5;
    case "date":
      return Math.floor(Date.UTC(2026, 11, 31) / 1000);
    case "string":
    case "multiline_text":
      return "QA value";
    default:
      return undefined;
  }
}

interface Fixture {
  productUuid: string;
  qualityUuid: string;
  locationUuid: string;
  unit: string;
  qty: number;
  vendorUuid: string;
  vendorEmail?: string;
  vendorName?: string;
  evaluatorUuid?: string;
}

/** The pricing round body built from the template's own columns, one cell possibly changed. */
function pricingBody(s: Sib, detail: any, t: ModelTemplate, fx: Fixture, ev: { uuid: string; lineItem: string }, opts: { stageNo: number; title: string; templateUuid?: string; mutate?: (row: any) => void; limits?: Record<string, unknown>; config?: Record<string, unknown> }) {
  const base = s.bodies.buildPricingStageBody({
    eventGroupUuid: ev.uuid,
    lineItemUuid: ev.lineItem,
    vendorCompanyUuid: fx.vendorUuid,
    pricingTemplateUuid: opts.templateUuid ?? t.uuid,
    productUuid: fx.productUuid,
    productQualityUuid: fx.qualityUuid,
    locationUuid: fx.locationUuid,
    quantityValue: fx.qty,
    quantityUnit: fx.unit,
    timing: s.bodies.stageTiming(Math.floor(Date.now() / 1000), 3600),
    stageNo: opts.stageNo,
    title: opts.title,
  });
  const w = detail?.widgets ?? {};
  base.widgets = {
    inline_components: Array.isArray(w.inline_components) ? w.inline_components : base.widgets.inline_components,
    global_price_components: Array.isArray(w.global_price_components) ? w.global_price_components : base.widgets.global_price_components,
  };
  const row: any = base.data[0];
  for (const f of t.fields.filter((x) => x.section === "line_item")) {
    if (["product", "creator_quantity", "buyer_hub", "variant"].includes(f.key)) continue;
    const cfg = (f.details?.configuration as any) ?? {};
    const cell: any = { key: f.key, configuration: cfg };
    if (f.filledBy === "buyer") {
      const v = opts.limits && f.key in opts.limits ? opts.limits[f.key] : validValue(f);
      if (v !== undefined) cell.value = v;
    }
    row[f.key] = { ...(row[f.key] ?? {}), ...cell };
  }
  if (t.orderType === "sell") base.configurations.order_type = "sell";
  Object.assign(base.configurations, opts.config ?? {});
  opts.mutate?.(row);
  return base;
}

function technicalBody(s: Sib, detail: any, fx: Fixture, ev: { uuid: string; lineItem: string }, opts: { stageNo: number; title: string; templateUuid: string; mutate?: (forms: any[]) => void }) {
  const base = s.bodies.buildTechnicalStageBody({
    eventGroupUuid: ev.uuid,
    lineItemUuid: ev.lineItem,
    evaluatorUuid: fx.evaluatorUuid ?? "",
    vendorCompanyUuid: fx.vendorUuid,
    technicalTemplateUuid: opts.templateUuid,
    timing: s.bodies.stageTiming(Math.floor(Date.now() / 1000), 3600),
    stageNo: opts.stageNo,
  });
  base.configurations.title = opts.title;
  // a deep copy: a case changes a question in place, and the next case must start from the template as it is
  const forms = (Array.isArray(detail?.forms) ? (structuredClone(detail.forms) as any[]) : []).map((f: any, i: number) => {
    const { uuid: _u, id: _i, ...rest } = f ?? {};
    return {
      ...rest,
      order: rest.order ?? i + 1,
      name: rest.name ?? `Page ${i + 1}`,
      config: rest.config ?? { type: "table" },
      page_headers: Array.isArray(rest.page_headers) ? rest.page_headers : [],
      page_response_headers: Array.isArray(rest.page_response_headers) ? rest.page_response_headers : [],
      evaluators: i === 0 && fx.evaluatorUuid ? [{ shared_with_uuid: fx.evaluatorUuid, shared_with_type: "User" }] : [],
    };
  });
  if (forms.length) base.forms = forms;
  opts.mutate?.(base.forms);
  return base;
}

function resolveValue(v: unknown, fx: Fixture): unknown {
  if (v === "requested+1000") return fx.qty + 1000;
  if (v === "requested+500") return fx.qty + 500;
  return v;
}

// ── the run ─────────────────────────────────────────────────────────────────

let running = false;
export function templateCheckBusy(): boolean {
  return running;
}

export async function pickTemplate(model: ClientModel, uuid: string | undefined, type: string): Promise<ModelTemplate | null> {
  if (uuid) return model.templates.find((t) => t.uuid === uuid) ?? null;
  const uses = EVENT_TYPE_TO_USES[type] ?? ["rfq"];
  const list = model.templates.filter((t) => t.useFor.some((u) => uses.includes(u)));
  const ok = (t: ModelTemplate) => t.opens && !t.problems.some((p) => p.severity === "blocks");
  return list.find((t) => ok(t) && t.isDefault) ?? list.find(ok) ?? list[0] ?? null;
}

export async function runTemplateCheck(o: TemplateCheckOptions): Promise<TemplateCheckRun> {
  if (running) throw new Error("A template check is already running in this process; wait for it to finish.");
  running = true;
  try {
    return await runInner(o);
  } finally {
    running = false;
  }
}

async function runInner(o: TemplateCheckOptions): Promise<TemplateCheckRun> {
  const t0 = Date.now();
  const mode = o.mode ?? "sample";
  const type = (o.type ?? "rfq").toLowerCase();
  const line = (s: string) => o.onLine?.(s);
  const run: TemplateCheckRun = {
    client: { id: o.companyId, name: null },
    template: null,
    mode,
    generated: null,
    selected: 0,
    results: [],
    setup: [],
    summary: { pass: 0, fail: 0, inconclusive: 0, notRun: 0, gaps: 0, serverErrors: 0, serverAlsoEnforces: 0 },
    problems: [],
    durationMs: 0,
  };
  const { model } = await loadLatestModel(o.companyId);
  if (!model) {
    run.problems.push(`No product model for client ${o.companyId}. Run: npm run model:build -- --c ${o.companyId}`);
    return run;
  }
  run.client.name = model.companyName;
  const picked = await pickTemplate(model, o.templateUuid, type);
  if (!picked) {
    run.problems.push(`No template ${o.templateUuid ?? `for a ${type} stage`} in the model of ${model.companyName}.`);
    return run;
  }
  const t: ModelTemplate = picked;
  run.template = { uuid: t.uuid, name: t.name, isDefault: t.isDefault, useFor: t.useFor };
  const all = generateTemplateCases(model, t, { eventType: type });
  run.generated = caseCounts(all);
  let cases = mode === "full" ? all.slice(0, MAX_FULL) : sampleCases(all);
  if (o.only?.length) cases = all.filter((c) => o.only!.some((x) => c.id === x || c.catalogId === x));
  if (o.buyerOnly) cases = cases.filter((c) => c.side === "buyer");
  run.selected = cases.length;
  line(`${model.companyName}: "${t.name}" — ${all.length} case(s) generated, ${cases.length} selected (${mode}).`);

  const deadline = t0 + BUDGET_MS[mode];
  const s = await sib();
  const { openClientContext } = await import("../executor.js");
  const client: any = await bounded(openClientContext(o.companyId), 120_000, "signing in as the buyer");
  const buyer = client.ctx.buyerApi;
  const results = new Map<string, TemplateCheckResult>();
  const checkResults: any[] = [];
  const notRun = (c: TemplateCase, why: string) => {
    if (results.has(c.id)) return;
    const r: TemplateCheckResult = { id: c.id, catalogId: c.catalogId, title: c.title, target: c.target, expected: c.expected, screenOnly: c.screenOnly, verdict: "not-run", actual: `Not run: ${why}`, reason: why, httpStatus: null, message: null, durationMs: 0 };
    results.set(c.id, r);
    o.onCase?.(r, results.size, cases.length);
  };
  const { classify } = await import("../checks/engine.js");
  const judge = (c: TemplateCase, out: CheckOutcome, req: { method: string; path: string; body?: unknown }, actualOk: string) => {
    let cl = classify(c.expected, out, c.expectMessage, c.expectedResult);
    // a refusal that names ANOTHER missing answer did not reach the rule under test
    const other = /Please fill '([^']+)'/.exec(out.message ?? "")?.[1];
    const otherReason = !out.accepted && other !== undefined && c.field && other.trim() !== c.field.name.trim() && c.expected !== "reject";
    if (otherReason) cl = { pass: false, inconclusive: true, verdict: `refused because another required answer (“${other}”) is missing — the case never reached “${c.field!.name}”; nothing proved` };
    const verdict: TemplateCheckResult["verdict"] = cl.inconclusive ? "inconclusive" : cl.pass ? "pass" : "fail";
    const gap = c.screenOnly && out.accepted;
    const actual = out.accepted
      ? `${actualOk}${gap ? " — the API took a value that only the screen stops (gap)." : ""}`
      : `Refused (HTTP ${out.httpStatus ?? "no answer"}${out.message ? `: “${out.message}”` : ""}).${
          c.screenOnly && !otherReason && (out.httpStatus ?? 0) >= 400 && (out.httpStatus ?? 0) < 500
            ? " The server refuses this itself — the rule library lists it as screen-only, so the library is wrong here and should be corrected."
            : ""
        }`;
    const r: TemplateCheckResult = {
      id: c.id,
      catalogId: c.catalogId,
      title: c.title,
      target: c.target,
      expected: c.expected,
      screenOnly: c.screenOnly,
      verdict,
      actual,
      reason: cl.verdict,
      ...(gap ? { gapConfirmed: true } : {}),
      ...(c.screenOnly && !otherReason && !out.accepted && (out.httpStatus ?? 0) >= 400 && (out.httpStatus ?? 0) < 500 ? { serverAlsoEnforces: true } : {}),
      httpStatus: out.httpStatus,
      message: out.message,
      durationMs: out.durationMs,
      request: { method: req.method, path: req.path, body: shrink(req.body) },
    };
    results.set(c.id, r);
    checkResults.push(toCheckResult(c, r, cl));
    o.onCase?.(r, results.size, cases.length);
    line(`${verdict.toUpperCase().padEnd(12)} ${c.id} ${c.title}`);
  };
  const setupStep = (did: string, method: string, path: string, out: CheckOutcome) =>
    run.setup.push({ n: run.setup.length + 1, did, method, path, status: out.httpStatus ?? 0, ms: out.durationMs, ok: out.accepted });

  try {
    // 1. open the template
    const openPath = s.Endpoints.templateDetails(t.uuid);
    const opened = await call(buyer, "GET", openPath);
    const detail: any = opened.data;
    const openCase = cases.find((c) => c.violation === "opens") ?? all.find((c) => c.violation === "opens")!;
    judge(openCase, opened, { method: "GET", path: openPath }, `The template opened with ${countCols(detail)} column(s).`);
    if (!opened.accepted) {
      for (const c of cases) notRun(c, "the template itself did not open, so nothing can be built from it");
      return finish();
    }

    // fixture: product, unit, location, vendor
    const alts = await bounded(s.alternatives(buyer), 90_000, "reading products, units and locations").catch((e: Error) => ({ products: [], units: [], locations: [], problems: [e.message] }));
    const cat = client.ctx.catalog ?? {};
    const units: string[] = (alts.units ?? []).map((u: string) => u.toLowerCase());
    const prod = (alts.products ?? []).find((p: any) => p.units?.some((u: string) => units.includes(u.toLowerCase()))) ?? (alts.products ?? [])[0];
    const unit = prod?.units?.find((u: string) => units.includes(u.toLowerCase())) ?? ["kg", "nos", "piece"].find((u) => units.includes(u)) ?? units[0] ?? "KG";
    const fx: Fixture = {
      productUuid: prod?.uuid ?? cat.productUuid,
      qualityUuid: prod?.qualityUuid ?? cat.productQualityUuid,
      locationUuid: alts.locations?.[0]?.uuid ?? cat.locationUuid,
      unit,
      qty: 50,
      vendorUuid: client.ctx.vendor?.uuid ?? cat.vendorBidCompanyUuid ?? "",
      vendorEmail: client.ctx.vendor?.email,
      vendorName: client.ctx.vendor?.name,
      evaluatorUuid: client.ctx.evaluatorUuid,
    };
    if (!fx.productUuid || !fx.locationUuid) {
      run.problems.push(`No usable product or delivery location on ${model.companyName}.`);
      for (const c of cases) notRun(c, "this client has no usable product or delivery location to build a line item from");
      return finish();
    }
    line(`Line item: ${prod?.name ?? "catalogue product"}, ${fx.qty} ${fx.unit}; vendor ${fx.vendorName ?? "?"}.`);

    // 2. the sandbox draft event
    const title = `QA_Platform_TplCheck_${Date.now()}`;
    const evBody = { ...s.bodies.buildEventGroupBody({ productUuid: fx.productUuid, quantityUnit: fx.unit, quantityValue: fx.qty, productQualityUuid: fx.qualityUuid }), title };
    const evOut = await call(buyer, "POST", s.Endpoints.eventGroups(), evBody);
    setupStep(`Created the sandbox draft event “${title}”`, "POST", s.Endpoints.eventGroups(), evOut);
    const ev = { uuid: String((evOut.data as any)?.uuid ?? ""), lineItem: String((evOut.data as any)?.event_group_line_item_ids?.[0] ?? "") };
    run.event = { title, eventGroupUuid: ev.uuid || undefined };
    if (!evOut.accepted || !ev.uuid || !ev.lineItem) {
      run.problems.push(`The sandbox draft event could not be created: ${evOut.message ?? "no id in the reply"}`);
      for (const c of cases.filter((x) => x.target !== "template")) notRun(c, "the sandbox draft event could not be created");
      return finish();
    }
    let stageNo = 0;
    const createTrade = s.Endpoints.createTrade();
    const isForm = t.useFor.includes("rfp");

    // 3. stage cases (buyer saves a round)
    for (const c of cases.filter((x) => x.target === "stage" || x.target === "form-stage")) {
      if (Date.now() > deadline) {
        notRun(c, "the run's time budget ran out");
        continue;
      }
      stageNo += 1;
      const stTitle = `QA_Platform_TplCheck ${c.id}`;
      let body: any;
      if (c.target === "form-stage") {
        body = technicalBody(s, detail, fx, ev, { stageNo, title: stTitle, templateUuid: t.uuid, mutate: (forms) => mutateForm(c, forms) });
      } else {
        let fxc = fx;
        if (c.violation === "unit_other_company") {
          const v = c.value as { unit: string; product: string; products?: string[] };
          let p: any;
          for (const name of v.products ?? [v.product]) {
            const found = await call(buyer, "GET", s.Endpoints.productsSearch(name));
            p = ((found.data as any)?.products ?? []).find((x: any) => x?.variants?.[0]?.uuid && String(x.name).trim() === name.trim());
            if (p) {
              v.product = name;
              break;
            }
          }
          if (!p) {
            notRun(c, `none of the products linked to "${v.unit}" (${(v.products ?? [v.product]).join(", ")}) has a quality (variant) to raise a line item against`);
            continue;
          }
          fxc = { ...fx, productUuid: p.uuid, qualityUuid: p.variants[0].uuid, unit: v.unit.toUpperCase() };
          const eg = await call(buyer, "POST", s.Endpoints.eventGroups(), { ...s.bodies.buildEventGroupBody({ productUuid: fxc.productUuid, quantityUnit: fx.unit, quantityValue: fx.qty, productQualityUuid: fxc.qualityUuid }), title: `${title}_unit` });
          setupStep(`Created a second sandbox draft for the product “${v.product}”`, "POST", s.Endpoints.eventGroups(), eg);
          const li = (eg.data as any)?.event_group_line_item_ids?.[0];
          if (!eg.accepted || !li) {
            notRun(c, `a draft event for "${v.product}" could not be created: ${eg.message ?? "no line item"}`);
            continue;
          }
          body = pricingBody(s, detail, t, fxc, { uuid: String((eg.data as any).uuid), lineItem: String(li) }, { stageNo: 1, title: stTitle });
          const out = await call(buyer, "POST", createTrade, body);
          judge(c, out, { method: "POST", path: createTrade, body }, `The round was saved for "${v.product}" in ${v.unit}.`);
          continue;
        }
        body = pricingBody(s, detail, t, fxc, ev, {
          stageNo,
          title: stTitle,
          templateUuid: c.violation === "template_missing" ? fakeUuid() : undefined,
          mutate: (row) => mutateStageRow(c, row, fxc),
        });
      }
      const out = await call(buyer, "POST", createTrade, body);
      judge(c, out, { method: "POST", path: createTrade, body }, `The round was saved (id ${(out.data as any)?.uuid ?? "?"}).`);
    }

    // 4 + 5. vendor side
    const vendorCases = cases.filter((x) => x.target === "bid" || x.target === "form-answer");
    if (vendorCases.length) {
      const why = !fx.vendorUuid ? "this client has no invitable test vendor" : !fx.vendorEmail ? "the client's test vendor has no login email" : Date.now() > deadline ? "the run's time budget ran out" : isForm && !fx.evaluatorUuid ? "no evaluator could be named for the technical round" : undefined;
      if (why) vendorCases.forEach((c) => notRun(c, why));
      else await vendorSide(vendorCases);
    }
    return finish();

    async function vendorSide(vcsIn: TemplateCase[]) {
      let vcs = vcsIn;
      // the round the vendor answers: valid values + any limit a case needs
      const limits: Record<string, unknown> = {};
      const config: Record<string, unknown> = {};
      for (const c of vcs)
        for (const [k, v] of Object.entries(c.stageSetup ?? {})) {
          if (k.startsWith("config.")) config[k.slice(7)] = v;
          else limits[k] = v;
        }
      stageNo += 1;
      const rTitle = `QA_Platform_TplCheck vendor round`;
      const body = isForm
        ? technicalBody(s, detail, fx, ev, { stageNo, title: rTitle, templateUuid: t.uuid })
        : pricingBody(s, detail, t, fx, ev, { stageNo, title: rTitle, limits, config });
      const made = await call(buyer, "POST", createTrade, body);
      setupStep(`Added the ${isForm ? "technical" : "pricing"} round the vendor answers${Object.keys(limits).length || Object.keys(config).length ? ` (set up for the cases: ${JSON.stringify({ ...limits, ...config })})` : ""}`, "POST", createTrade, made);
      const round = (made.data as any)?.uuid;
      if (!made.accepted || !round) return vcs.forEach((c) => notRun(c, `the round for the vendor could not be saved: ${made.message ?? "no id"}`));
      // a round setting a case needs (e.g. over-quantity off) must really be on the round, or the case proves nothing
      if (Object.keys(config).length) {
        const back = await call(buyer, "GET", s.Endpoints.tradeDetails(round));
        const tc = ((back.data as any)?.trade_config ?? {}) as Record<string, unknown>;
        const missed = Object.entries(config).filter(([k, v]) => tc[k] !== v);
        if (missed.length) {
          const why = missed.map(([k, v]) => `${k.replace(/_/g, " ")} stayed ${JSON.stringify(tc[k])} (asked for ${JSON.stringify(v)})`).join("; ");
          run.problems.push(`The vendor round did not take the setting a case needs: ${why}. On this client it comes from the company's trade configuration, not the round.`);
          for (const c of vcs.filter((x) => Object.keys(x.stageSetup ?? {}).some((k) => k.startsWith("config.") && missed.some(([m]) => `config.${m}` === k))))
            notRun(c, `the round could not be set up for this case — ${why}; on ${model!.companyName} the setting comes from the company's trade configuration (so over-quantity bids are allowed here)`);
          vcs = vcs.filter((x) => !results.has(x.id));
        }
      }
      const pub = { ...s.bodies.buildPublishBody({ title, technicalTradeUuid: round, pricingTradeUuid: round, vendorCompanyUuid: fx.vendorUuid }), draft_trade_request_uuids: [round] };
      // only the vendor round is published; the case rounds stay drafts and are dropped
      const otherDrafts = await draftsOf(ev.uuid, round);
      if (otherDrafts.length) (pub as any).delete_draft_stage_uuids = otherDrafts;
      const p = await call(buyer, "PATCH", s.Endpoints.eventGroup(ev.uuid), pub);
      setupStep(`Published “${title}” to ${fx.vendorName ?? "the test vendor"}`, "PATCH", s.Endpoints.eventGroup(ev.uuid), p);
      if (!p.accepted) return vcs.forEach((c) => notRun(c, `the event could not be published: ${p.message ?? "refused"}`));
      run.event!.publishedRound = String(round);

      let vendorApi: any;
      try {
        const signIn = () => bounded(s.authenticate({ ...s.CONFIG.identities.vendor, email: fx.vendorEmail, tenantCompanyId: o.companyId }), 90_000, "vendor sign-in");
        // one retry: a network timeout on the sign-in is not a fact about the template
        const login = await signIn().catch(async (e: Error) => {
          line(`vendor sign-in failed (${redact(e.message)}); trying once more`);
          return signIn();
        });
        vendorApi = await s.ApiClient.create(login, { appVersion: login.appVersion, identity: "vendor", companyId: o.companyId });
        run.setup.push({ n: run.setup.length + 1, did: `Signed in as the test vendor (${fx.vendorName ?? "vendor"})`, method: "POST", path: s.Endpoints.verifyOtp?.() ?? "/v1/verify_otp", status: 200, ms: 0, ok: true });
      } catch (e) {
        return vcs.forEach((c) => notRun(c, `the vendor could not sign in: ${redact((e as Error).message)}`));
      }
      try {
        const td = await call(vendorApi, "GET", s.Endpoints.tradeDetails(round));
        setupStep("The vendor opened the round", "GET", s.Endpoints.tradeDetails(round), td);
        if (!td.accepted) return vcs.forEach((c) => notRun(c, `the vendor could not open the round: ${td.message}`));
        if (isForm) await answers(vcs, vendorApi, round, td.data);
        else await bids(vcs, vendorApi, round, td.data, limits);
      } finally {
        await Promise.resolve(vendorApi?.dispose?.()).catch(() => {});
      }
    }

    async function draftsOf(egUuid: string, keep: string): Promise<string[]> {
      const r = await call(buyer, "GET", s.Endpoints.eventGroup(egUuid));
      const stages: any[] = (r.data as any)?.stages ?? (r.data as any)?.trade_requests ?? [];
      return stages.map((x) => String(x?.uuid ?? "")).filter((u) => u && u !== keep);
    }

    async function bids(vcs: TemplateCase[], vendorApi: any, round: string, data: any, limits: Record<string, unknown>) {
      const p = data?.order_details?.[0]?.product;
      if (!p?.trade_product_uuid) return vcs.forEach((c) => notRun(c, "the round came back without its line item's product ids"));
      const bidBody = s.bodies.buildCreateBid({ pricingTradeUuid: round, vendorCompanyUuid: fx.vendorUuid });
      // a round in another currency: bid in the round's own (first offered) currency
      const cc = data?.currency_configuration;
      const base = cc?.base_currency?.code;
      const cur = base ? cc?.allowed_currencies?.[base] : undefined;
      if (cur && base !== "INR")
        bidBody.currency_preference = {
          name: cur.name,
          code: cur.code,
          symbol: cur.symbol,
          rateInBase: cur.rate_in_base ?? 1,
          adjustedPrecision: cur.adjusted_precision ?? 2,
          defaultPrecision: cur.default_precision ?? 2,
          numberSystem: cur.number_system ?? "INTERNATIONAL",
          currencyLabel: cur.currency_label ?? cur.symbol,
        };
      const cb = await call(vendorApi, "POST", s.Endpoints.createBid(), bidBody);
      setupStep("The vendor started a bid", "POST", s.Endpoints.createBid(), cb);
      const bidUuid = (cb.data as any)?.bid_uuid ?? (cb.data as any)?.uuid ?? (cb.data as any)?.bid?.uuid;
      if (!cb.accepted || !bidUuid) return vcs.forEach((c) => notRun(c, `the bid could not be started: ${cb.message ?? "no bid id"}`));
      const path = s.Endpoints.createBidProducts(bidUuid);
      const price = limits.ceil_price !== undefined || limits.floor_price !== undefined ? 50 : 100;
      const ordered = [...vcs.filter((c) => c.violation !== "positive_bid"), ...vcs.filter((c) => c.violation === "positive_bid")];
      for (const c of ordered) {
        if (Date.now() > deadline) {
          notRun(c, "the run's time budget ran out");
          continue;
        }
        const { body } = s.bodies.buildBidProductsBody({
          pricingTradeUuid: round,
          vendorCompanyUuid: fx.vendorUuid,
          productUuid: fx.productUuid,
          productQualityUuid: fx.qualityUuid,
          locationUuid: fx.locationUuid,
          lineItemUuid: ev.lineItem,
          quantityValue: fx.qty,
          quantityUnit: fx.unit,
          price,
          tradeProduct: { trade_product_uuid: p.trade_product_uuid, trade_product_id: p.trade_product_id, trade_product_category_uuid: p.trade_product_category_uuid, product_id: p.id, product_code: p.product_code },
        });
        const row = body.sheets.inline_components.data[fx.vendorUuid][0];
        for (const f of t.fields.filter((x) => x.section === "line_item" && x.filledBy === "vendor" && !(x.key in row))) {
          const v = validValue(f);
          row[f.key] = { key: f.key, configuration: f.details?.configuration ?? {}, ...(v !== undefined ? { value: v } : {}) };
        }
        if (c.field && c.violation !== "positive_bid") {
          const v = resolveValue(c.value, fx);
          row[c.field.key] = { ...(row[c.field.key] ?? { key: c.field.key }), value: v === null ? null : v };
          if (v === null || v === "") delete row[c.field.key].value;
        }
        const out = await call(vendorApi, "POST", path, body);
        judge(c, out, { method: "POST", path, body }, "The vendor's line was saved.");
      }
    }

    async function answers(vcs: TemplateCase[], vendorApi: any, round: string, data: any) {
      const forms: any[] = data?.sheets?.forms ?? [];
      const start = await call(vendorApi, "POST", s.Endpoints.templateResponses(), s.bodies.buildStartTechnicalResponse({ technicalTradeUuid: round, vendorCompanyUuid: fx.vendorUuid }));
      setupStep("The vendor started a technical response", "POST", s.Endpoints.templateResponses(), start);
      const resp = (start.data as any)?.uuid ?? (start.data as any)?.template_response?.uuid;
      if (!start.accepted || !resp) return vcs.forEach((c) => notRun(c, `the technical response could not be started: ${start.message ?? "no id"}`));
      // refusals first, then the robustness cases, the complete response last. A submit the server
      // accepts closes the response: an accepted robustness case (a gap) already shows a response
      // with every other answer valid goes through, so the baseline is then reported as not re-run.
      const ordered = [...vcs.filter((c) => c.expected === "reject"), ...vcs.filter((c) => c.expected === "no-5xx"), ...vcs.filter((c) => c.violation === "positive_answer")];
      let submittedBy: string | undefined;
      for (const c of ordered) {
        if (Date.now() > deadline) {
          notRun(c, "the run's time budget ran out");
          continue;
        }
        if (c.violation === "positive_answer" && c.details.note?.startsWith("Needs a file")) {
          notRun(c, c.details.note);
          continue;
        }
        if (submittedBy) {
          notRun(c, `the response was already submitted by ${submittedBy} (which the server accepted with every other answer valid), so it cannot be submitted again`);
          continue;
        }
        // answer every vendor question of every page, then change the one under test
        const saves: string[] = [];
        for (const form of forms) {
          const pageUuids: string[] = form?.page_uuids ?? [];
          if (!form?.uuid || !pageUuids.length) continue;
          const headers: any[] = form?.page_response_headers ?? [];
          const page_responses: Record<string, unknown> = {};
          for (const pu of pageUuids.slice(0, 1)) {
            page_responses[pu] = headers
              .filter((h) => h?.configuration?.field_type === "participant" && h?.input_type !== "attachment" && h?.input_type !== "question_group")
              .map((h) => {
                const isTarget = c.field && h.key_attribute === c.field.key;
                const v = isTarget ? c.value : answerFor(h);
                return { key_attribute: h.key_attribute, value: v };
              })
              .filter((x) => !(c.violation === "answer_required_empty" && c.field?.key === x.key_attribute));
          }
          const body = { form_uuid: form.uuid, page_uuids: pageUuids.slice(0, 1), page_responses, item_type: "TradeRequest", item_uuid: round };
          const put = await call(vendorApi, "PUT", s.Endpoints.createPageResponses(resp), body);
          if (!put.accepted) saves.push(`page “${form.name}”: ${put.message}`);
        }
        const subBody = s.bodies.buildSubmitTechnicalResponse({ technicalTradeUuid: round, vendorCompanyUuid: fx.vendorUuid });
        const path = s.Endpoints.templateResponse(resp);
        const out = await call(vendorApi, "PATCH", path, subBody);
        if (saves.length && out.accepted && c.expected === "reject") out.message = `answers were refused while saving (${saves.join("; ")})`;
        judge(c, out, { method: "PATCH", path, body: subBody }, `The response was submitted${saves.length ? ` (some pages were refused while saving: ${saves.join("; ")})` : ""}.`);
        if (out.accepted) submittedBy = c.id;
      }
    }
  } catch (e) {
    run.problems.push(`The run stopped: ${redact((e as Error).message)}`);
    for (const c of cases) notRun(c, "the run stopped before this case");
    return finish();
  } finally {
    await Promise.resolve(client.dispose?.()).catch(() => {});
  }

  function finish(): TemplateCheckRun {
    for (const c of cases) if (!results.has(c.id)) notRun(c, "not reached");
    run.results = cases.map((c) => results.get(c.id)!).filter(Boolean);
    // the "opens" case may be outside the selection (only=…) but is always run
    const open = results.get(all[0]?.id);
    if (open && !run.results.includes(open)) run.results.unshift(open);
    for (const r of run.results) {
      if (r.verdict === "pass") run.summary.pass++;
      else if (r.verdict === "fail") run.summary.fail++;
      else if (r.verdict === "inconclusive") run.summary.inconclusive++;
      else run.summary.notRun++;
      if (r.gapConfirmed) run.summary.gaps++;
      if (r.serverAlsoEnforces) run.summary.serverAlsoEnforces++;
      if ((r.httpStatus ?? 0) >= 500) run.summary.serverErrors++;
    }
    run.durationMs = Date.now() - t0;
    if (o.save !== false) run.runId = saveTemplateRun(run, t, all, cases, checkResults, o.companyId, model!.companyName);
    return run;
  }
}

// ── case → request changes ───────────────────────────────────────────────────

function mutateStageRow(c: TemplateCase, row: any, fx: Fixture): void {
  if (!c.field) return;
  const k = c.field.key;
  const v = resolveValue(c.value, fx);
  switch (c.violation) {
    case "product_missing":
      delete row.product;
      return;
    case "unit_blank":
      row.creator_quantity = { key: "creator_quantity", value: fx.qty, configuration: {} };
      return;
    case "unit_not_client":
      row.creator_quantity = { key: "creator_quantity", value: fx.qty, postfix: String(v), configuration: { suffix: String(v) } };
      return;
    case "location_missing":
      delete row.buyer_hub;
      return;
    case "empty_required":
      if (row[k]) delete row[k].value;
      return;
    default:
      row[k] = { ...(row[k] ?? { key: k }), value: v };
  }
}

function mutateForm(c: TemplateCase, forms: any[]): void {
  const first = forms[0];
  if (!first) return;
  const q = (first.page_response_headers ?? [])[0] ?? (first.page_headers ?? [])[0];
  if (c.violation === "page_no_name") first.name = "";
  if (c.violation === "question_no_key" && q) q.key_attribute = "";
  if (c.violation === "question_no_filler" && q) q.configuration = { ...(q.configuration ?? {}), field_type: undefined };
}

function answerFor(h: any): unknown {
  const opts = h?.configuration?.cell_options;
  if (Array.isArray(opts) && opts.length) return String(opts[0]?.value ?? opts[0]);
  switch (h?.input_type) {
    case "number":
      return 10;
    case "date":
      return Math.floor(Date.UTC(2026, 11, 31) / 1000);
    default:
      return "QA answer";
  }
}

function fakeUuid(): string {
  return Buffer.from(`QA${Date.now() % 100000}`).toString("base64");
}

function countCols(detail: any): number {
  const w = detail?.widgets;
  const n = (Array.isArray(w?.inline_components) ? w.inline_components.length : 0) + (Array.isArray(w?.global_price_components) ? w.global_price_components.length : 0);
  if (n) return n;
  return (Array.isArray(detail?.forms) ? detail.forms : []).reduce((a: number, f: any) => a + (f?.page_response_headers?.length ?? 0) + (f?.page_headers?.length ?? 0), 0);
}

/** Keep stored bodies small: long strings are cut, widget lists summarised. */
function shrink(body: unknown): unknown {
  try {
    const s = JSON.stringify(body, (k, v) => {
      if (k === "widgets" && v && typeof v === "object") return { note: "the template's own columns, unchanged", inline: (v.inline_components ?? []).length, whole_bid: (v.global_price_components ?? []).length };
      if (typeof v === "string" && v.length > 300) return `${v.slice(0, 120)}… (${v.length} characters)`;
      return v;
    });
    return s && s.length < 60_000 ? JSON.parse(s) : { note: "request body too large to keep" };
  } catch {
    return undefined;
  }
}

function toCheckResult(c: TemplateCase, r: TemplateCheckResult, cl: { pass: boolean; verdict: string; inconclusive?: boolean }) {
  return {
    id: c.id,
    flowId: "template-check",
    module: "Event templates",
    field: c.field?.name,
    scenario: c.title,
    type: c.violation.startsWith("positive") || c.violation === "opens" ? "functional" : "data-validation",
    category: c.screenOnly ? "Negative, screen-only rule" : c.expected === "reject" ? "Negative, Validation" : c.expected === "accept" ? "Positive" : "Robustness",
    priority: c.priority,
    severity: c.priority === "P0" ? "critical" : c.priority === "P1" ? "high" : "medium",
    expected: c.expected,
    ...(c.expectMessage ? { expectMessage: c.expectMessage } : {}),
    layer: "api",
    inputSummary: c.field ? `${c.field.name} = ${JSON.stringify(c.value)?.slice(0, 80) ?? "(empty)"}` : c.title,
    request: r.request,
    httpStatus: r.httpStatus,
    accepted: r.httpStatus === 200,
    message: r.message,
    durationMs: r.durationMs,
    pass: cl.pass,
    verdict: `${cl.verdict}${r.gapConfirmed ? " — the API accepted a value only the screen stops (gap)" : ""}`,
    inconclusive: !!cl.inconclusive,
  };
}

function saveTemplateRun(run: TemplateCheckRun, t: ModelTemplate, all: TemplateCase[], cases: TemplateCase[], checkResults: any[], companyId: number, companyName: string | null): string | undefined {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  {
    const ran = new Set(checkResults.map((r) => r.id));
    const pasted = [all[0], ...cases.filter((c) => c.id !== all[0].id)].map((c) => ({
      id: c.id,
      feature: "events.templates",
      title: c.title,
      type: c.violation.startsWith("positive") || c.violation === "opens" ? "Positive" : "Negative",
      priority: c.priority,
      severity: c.priority === "P0" ? "critical" : c.priority === "P1" ? "high" : "medium",
      preconditions: c.preconditions,
      steps: c.steps,
      method: c.target === "template" ? "GET" : c.target === "form-answer" ? "PATCH" : "POST",
      path: c.target === "template" ? "/templates/:uuid" : c.target === "bid" ? "/v1/bids/:uuid/create_bid_products" : c.target === "form-answer" ? "/template_responses/:uuid" : "/trade/template_input",
      expected: c.expected,
      expectedResult: c.expectedResult,
      rationale: c.why,
      ...(c.screenOnly ? { weakReason: "Only the dashboard screen enforces this rule; the check passes on any clean answer and records an accepted value as a gap." } : {}),
    }));
    const skipped = run.results.filter((r) => r.verdict === "not-run" && !ran.has(r.id)).map((r) => ({ id: r.id, reason: r.reason }));
    saveRun({
      id,
      ts: new Date().toISOString(),
      request: `template check: "${t.name}" (${run.mode}) on ${companyName ?? companyId}`,
      companyId,
      companyName,
      provider: "deterministic (no LLM)",
      durationMs: run.durationMs,
      report: {
        headline: `Template "${t.name}": ${run.summary.pass} passed, ${run.summary.fail} failed, ${run.summary.inconclusive} couldn't tell, ${run.summary.notRun} not run`,
        summary: `${run.selected} of ${all.length} generated field cases were selected (${run.mode} mode). ${run.summary.gaps} rule(s) that only the screen enforces were accepted by the API.`,
        passed: run.summary.pass,
        failed: run.summary.fail,
        findings: [],
        recommendation: run.summary.serverErrors ? "Server errors (HTTP 5xx) were seen — each is a defect to report." : "",
      },
      events: [{ agent: "System", kind: "plan", text: "template check (template:check)", data: { skipped, template: run.template, generated: run.generated } } as any],
      flowResults: [],
      validationResults: [],
      checkResults,
      setupSteps: run.setup,
      ...(run.event?.eventGroupUuid ? { setupSummary: { title: run.event.title, status: run.event.publishedRound ? "active" : "draft", eventGroupUuid: run.event.eventGroupUuid, ...(run.event.publishedRound ? { tradeId: run.event.publishedRound } : {}), stageCount: run.setup.length } } : {}),
      pastedCases: pasted as any,
    });
  }
  return id;
}

/** Cases for a template without running anything (the route's preview). */
export async function previewCases(companyId: number, uuid: string | undefined, type: string, mode: "sample" | "full" | "all" = "all") {
  const { model } = await loadLatestModel(companyId);
  if (!model) return { error: `No product model for client ${companyId}.` };
  const t = await pickTemplate(model, uuid, type);
  if (!t) return { error: `No such template in the model of ${model.companyName}.` };
  const all = generateTemplateCases(model, t, { eventType: type });
  const cases = mode === "sample" ? sampleCases(all) : mode === "full" ? all.slice(0, MAX_FULL) : all;
  return { client: { id: model.companyId, name: model.companyName }, template: { uuid: t.uuid, name: t.name }, counts: caseCounts(all), cases };
}

export type { TemplateCase, Check };
