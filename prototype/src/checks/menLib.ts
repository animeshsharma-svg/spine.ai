/**
 * MULTI-ENTITY VENDOR EMAILS (Gulbrandsen 50169, UAT; PRD "Multi-Entity Name in Vendor Emails via PR Field Mapping",
 * backend #17775) — the pieces the run needs: an open PR line of a given PLANT (read-only SELECT), that PR read through
 * the app's own API as the journey's `fromPr`, and Mailpit (the UAT mail catcher) read for a vendor's email.
 * Guide: test-cases/Multi_Entity_Email_Testing_Guide.md.
 */
import pg from "pg";

export const MEN_COMPANY = 50169;
export const MAILPIT = "https://mailhog-dev.procol.tech";
/** The PRD's table: the name a vendor must see for each plant (anything else: "Gulbrandsen"). */
export const ENTITY: Record<string, string> = {
  "1101": "Gulbrandsen Technologies India Pvt Ltd.", "1105": "Gulbrandsen Technologies India Pvt Ltd.", "1106": "Gulbrandsen Technologies India Pvt Ltd.",
  "1901": "PT Gulbrandsen Technologies India Pvt Ltd.", "4201": "Gulbrandsen Private Limited", "4301": "Gulbrandsen Catalyst Pvt Ltd.", "4501": "Gulbrandsen Industries LLP",
};
export const expectedName = (plant: string | null | undefined) => (plant && ENTITY[plant]) || "Gulbrandsen";

/** The app's id for a database id (the dashboard's encoding). */
export function uuidOf(id: number): string {
  const s = String(id * 3 + 1022).split("");
  const rot = [...s.slice(3), ...s.slice(0, 3)];
  const sp = "gZckDpNXdQ";
  return Buffer.from(rot.map((c) => sp[Number(c)]).join("")).toString("base64");
}

let pool: pg.Pool | null = null;
const db = () => (pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1, statement_timeout: 60000 }));
export async function closeDb() { await pool?.end().catch(() => {}); pool = null; }

/**
 * Open PR lines of a plant (active, or partly on an event already: status 3 / in_progress), with quantity left, material lines only, newest PR first — read-only.
 * `skip` leaves out PRs already used in this run.
 */
export async function prLinesOfPlant(plant: string, opts: { skip?: number[]; limit?: number } = {}): Promise<Array<{ prId: number; lineId: number; prNo: string | null; q: number }>> {
  const r = await db().query(
    `select pr.id pr_id, pri.id line_id, pr.data->>'prNo' pr_no, pri.quantity_requested q from purchase_request_items pri join purchase_requests pr on pr.id = pri.purchase_request_id
     where pr.company_id = $1 and pri.status in (1, 3) and pri.data->>'plant' = $2 and pri.quantity_requested - coalesce(pri.quantity_in_progress,0) - coalesce(pri.quantity_closed,0) > 0
       and coalesce(pri.line_item_type::text,'material') in ('material','0','1') and not (pr.id = any($3::bigint[]))
     order by pr.id desc, pri.id limit $4`,
    [MEN_COMPANY, plant, opts.skip ?? [], opts.limit ?? 20],
  );
  return r.rows.map((x: any) => ({ prId: Number(x.pr_id), lineId: Number(x.line_id), prNo: x.pr_no, q: Number(x.q) }));
}

type PrLine = { uuid: string; productUuid: string; qualityUuid: string; unit: string; qty: number; hubUuid?: string; name?: string; productCode?: string; itemNo?: string; plant?: string; prUuid?: string; prNo?: string; manual?: boolean };
/** A PR read through the app (GET /purchase_requests/:uuid), its usable lines in order, as the journey's fromPr. */
export async function fromPrOf(api: any, prId: number, onlyLineIds?: number[], opts: { units?: number; maxLines?: number } = {}): Promise<{ prUuid: string; prNo?: string; lines: PrLine[] } | { why: string }> {
  const uuid = uuidOf(prId);
  const r = await api.attempt("GET", `/purchase_requests/${encodeURIComponent(uuid)}`);
  if (!r.ok) return { why: `PR ${prId} could not be read: HTTP ${r.status} ${r.errorMessage ?? ""}` };
  const pr = r.data?.purchase_request ?? r.data;
  const want = onlyLineIds?.map(uuidOf);
  const ls: any[] = (pr?.line_items ?? []).filter((l: any) => l?.uuid && l?.product_uuid && ["active", "in_progress"].includes(l.status) && Number(l.quantity_open) > 0 && l?.data?.uom && (!want || want.includes(l.uuid)));
  if (opts.maxLines) ls.splice(opts.maxLines);
  if (!ls.length) return { why: `PR ${pr?.data?.prNo ?? prId} has no usable open line (keys: ${Object.keys(pr ?? {}).slice(0, 12).join(",")})` };
  const lines: PrLine[] = [];
  for (const l of ls) {
    const prod = await api.attempt("GET", `/products/${encodeURIComponent(l.product_uuid)}`);
    const p = prod.data?.product ?? prod.data;
    const quality = p?.variants?.[0]?.uuid;
    if (!quality) continue;
    // a few units only when asked (a PR line of 100 then serves many events, 16 Nov)
    const qty = opts.units ? Math.min(opts.units, Number(l.quantity_open)) : Number(l.quantity_open);
    lines.push({ uuid: String(l.uuid), prUuid: String(pr.uuid ?? uuid), prNo: pr?.data?.prNo ? String(pr.data.prNo) : undefined, productUuid: String(l.product_uuid), qualityUuid: String(quality), unit: String(l.data.uom), qty, ...(l.buyer_hub_uuid ? { hubUuid: String(l.buyer_hub_uuid) } : {}), name: String(p?.name ?? l?.data?.shortText ?? ""), ...(l.product_code ? { productCode: String(l.product_code) } : {}), ...(l?.data?.prLno ? { itemNo: String(l.data.prLno) } : {}), plant: l?.data?.plant });
  }
  if (!lines.length) return { why: `PR ${pr?.data?.prNo ?? prId}: no line's product has a variant to put on an event` };
  return { prUuid: String(pr.uuid ?? uuid), prNo: pr?.data?.prNo ? String(pr.data.prNo) : undefined, lines };
}

export interface MailHit { id: string; subject: string; to: string[]; created: string; snippet: string }
/** Mailpit search (its own query language: subject:"…", to:…), newest first. */
export async function mailSearch(query: string): Promise<MailHit[]> {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=50`);
  if (!r.ok) throw new Error(`Mailpit search answered HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.messages ?? []).map((m: any) => ({ id: m.ID, subject: m.Subject, to: (m.To ?? []).map((t: any) => t.Address), created: m.Created, snippet: m.Snippet ?? "" }));
}
/** One email's text, html and headers (Mailpit message API). */
export async function mailMessage(id: string): Promise<{ subject: string; text: string; html: string; from: string; to: string[] }> {
  const r = await fetch(`${MAILPIT}/api/v1/message/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`Mailpit message ${id} answered HTTP ${r.status}`);
  const m: any = await r.json();
  return { subject: m.Subject, text: m.Text ?? "", html: m.HTML ?? "", from: m.From?.Address ?? "", to: (m.To ?? []).map((t: any) => t.Address) };
}
/** The original .eml of a message. */
export async function mailRaw(id: string): Promise<string> {
  const r = await fetch(`${MAILPIT}/api/v1/message/${encodeURIComponent(id)}/raw`);
  if (!r.ok) throw new Error(`Mailpit raw ${id} answered HTTP ${r.status}`);
  return r.text();
}

/**
 * A published RFQ for the run: from a PR's lines (`fromPr`) or made by hand (no PR), QA vendor 1 (the client's) plus
 * the other QA vendors invited, nobody bids. Stops right after publishing (the invitations go out then). The title is
 * the run's own; Procol's API client renames it on send, so the event is known by its uuid and RFX number read back.
 */
export async function buildMenEvent(
  client: any,
  opts: { fromPr?: { prUuid: string; prNo?: string; lines: PrLine[] }; alsoInvite: string[]; tag: string; until?: string; features?: string[]; startDelaySec?: number; kind?: string; extraBidders?: Array<{ companyUuid: string; email: string; name: string }>; auction?: boolean; stageSeconds?: number; onLine?: (l: string) => void },
): Promise<{ ok: boolean; why?: string; eventGroupUuid?: string; rfx?: string; title?: string; made?: Record<string, string>; publishedAt?: string }> {
  const { runEventJourney } = await import("./eventJourney.js");
  const { journeyPlan } = await import("./journeyModel.js");
  const plan = journeyPlan([opts.kind ?? (opts.auction ? "events.auction_only" : "events.rfq_only"), ...(opts.features ?? [])], { bidders: 1 + (opts.extraBidders?.length ?? 0) });
  const stopAt = opts.until ?? "read_back";
  const stop = stopAt === "bid_submit" ? plan.steps.lastIndexOf(stopAt as any) : plan.steps.indexOf(stopAt as any);
  if (stop < 0) return { ok: false, why: `the journey has no step ${stopAt}` };
  plan.steps = plan.steps.slice(0, stop + 1);
  const r: any = await runEventJourney(client, plan, {
    stageSeconds: opts.stageSeconds ?? 3600,
    ...(opts.startDelaySec ? { startDelaySec: opts.startDelaySec } : {}),
    titlePrefix: `MEN ${opts.tag}`,
    eventVendors: false,
    ...(opts.extraBidders?.length ? { extraBidders: opts.extraBidders } : {}),
    alsoInvite: opts.alsoInvite,
    ...(opts.fromPr ? { fromPr: opts.fromPr } : {}),
    journeyBudgetMs: 12 * 60_000,
    onLine: (l: string) => opts.onLine?.(l),
  } as any);
  const j = r?.journey;
  const failed = (j?.steps ?? []).find((s: any) => s.verdict !== "worked");
  const made: Record<string, string> = j?.made ?? {};
  if (!made.eventGroupUuid || failed) return { ok: false, why: `${j?.outcome ?? "no outcome"}${failed ? ` (at ${failed.kind}: ${String(failed.actual ?? failed.why ?? "").slice(0, 200)})` : ""}`, made };
  const publishedAt = new Date().toISOString();
  const eg = await client.ctx.buyerApi.attempt("GET", `/event_groups/${encodeURIComponent(made.eventGroupUuid)}`);
  const text = JSON.stringify(eg.data ?? {});
  const rfx = text.match(/\bRFX-\d+\b/)?.[0];
  return { ok: true, eventGroupUuid: made.eventGroupUuid, rfx, title: eg.data?.event_group?.title ?? eg.data?.title ?? j?.title, made, publishedAt };
}

/** Every buyer name in a text: "Gulbrandsen" with whatever entity words follow it, as written. */
const NAME_RX = /(?:PT\s+)?Gulbrandsen(?:\s+(?:Technologies(?:\s+India)?(?:\s+Pvt)?(?:\s+Ltd)?\.?|Private(?:\s+Limited)?|Catalyst(?:\s+Pvt)?(?:\s+Ltd)?\.?|Industries(?:\s+LLP)?))?/g;
export function namesIn(text: string): string[] {
  const t = String(text ?? "").replace(/\s+/g, " ");
  // a match that runs into more letters is a different word — a delivery location named "Gulbrandsen Catalysts"
  // (16 Nov, RFX-406), not the buyer's name: left out here, reported by dataNamesIn
  return [...t.matchAll(NAME_RX)].filter((m) => !/[A-Za-z]/.test(t[(m.index ?? 0) + m[0].length] ?? "")).map((m) => m[0].trim());
}
/** Words that start with the company name but are other data (a location, a plant name): shown, never judged. */
export function dataNamesIn(text: string): string[] {
  const t = String(text ?? "").replace(/\s+/g, " ");
  return [...t.matchAll(NAME_RX)].filter((m) => /[A-Za-z]/.test(t[(m.index ?? 0) + m[0].length] ?? "")).map((m) => (m[0] + (t.slice((m.index ?? 0) + m[0].length).match(/^[A-Za-z]+/)?.[0] ?? "")).trim());
}
const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();

export interface MailCheck { id: string; subject: string; to: string[]; from: string; places: Record<string, string[]>; wrong: string[]; verdict: "match" | "mismatch" | "no-name"; preview: string; other: string[] }
/** Read one email and compare every name in the subject, the preview line and the body with the expected one. */
export async function checkMail(id: string, expected: string): Promise<MailCheck> {
  const m = await mailMessage(id);
  const body = strip(m.html) || m.text;
  const hits = await mailSearch(`subject:"${m.subject.replace(/"/g, "")}"`).catch(() => [] as MailHit[]);
  const preview = hits.find((h) => h.id === id)?.snippet ?? body.slice(0, 160);
  const places: Record<string, string[]> = { subject: namesIn(m.subject), preview: namesIn(preview), body: namesIn(body) };
  const other = [...new Set([...dataNamesIn(m.subject), ...dataNamesIn(body)])];
  const all = [...places.subject, ...places.preview, ...places.body];
  const wrong = [...new Set(all.filter((n) => n !== expected))];
  return { id, subject: m.subject, to: m.to, from: m.from, places, wrong, verdict: !all.length ? "no-name" : wrong.length ? "mismatch" : "match", preview, other };
}

/** Wait for the emails about one RFX to a vendor (Mailpit), up to `ms`; newest first. */
export async function waitForMails(rfx: string, to: string, opts: { ms?: number; atLeast?: number; subject?: RegExp } = {}): Promise<MailHit[]> {
  const until = Date.now() + (opts.ms ?? 10 * 60_000);
  let got: MailHit[] = [];
  while (Date.now() < until) {
    got = (await mailSearch(`to:${to} ${rfx}`).catch(() => [] as MailHit[])).filter((h) => h.subject.includes(rfx) || h.snippet.includes(rfx));
    if (opts.subject) got = got.filter((h) => opts.subject!.test(h.subject));
    if (got.length >= (opts.atLeast ?? 1)) return got;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return got;
}

/** The run's QA vendors as Procol has them (read-only): companies linked to Gulbrandsen whose user has a qa_…@example.com address. */
/**
 * Subjects UAT has already SENT to `to` for this project (sent-mail log ahoy_messages, read-only). The mail queue runs
 * ~25 min behind on UAT (16 Nov), so "sent" here, not "in Mailpit", is what tells a setting window it may close.
 */
export async function sentSubjects(rfx: string, to: string, title?: string): Promise<string[]> {
  // manual reminders name the event by its TITLE, not its RFX no. ("[<event name>] [Reminder] Submit Your Offer …")
  const r = await db().query(`select subject from ahoy_messages where (subject ~ $1 or ($3::text is not null and subject ilike $3)) and "to" ilike $2 and sent_at > now() - interval '2 days'`, [`${rfx}(\\.[0-9]+)?[ \\]]`, `%${to}%`, title ? `%${title}%` : null]);
  return r.rows.map((x: any) => String(x.subject));
}

export async function menVendors(): Promise<Array<{ n: number; name: string; email: string; vendorCompanyId: number; vendorCompanyUuid: string }>> {
  const r = await db().query(
    `select distinct c.id, c.name, i.invite_info email from companies c
       join buyer_seller_company_mappings b on b.dealing_with_company_id = c.id and b.client_company_id = $1 and b.status = 1
       join invitations i on i.invitee_company_id = c.id and i.inviter_company_id = $1
      where c.name like 'QA_Platform Vendor %' and i.invite_info ilike 'qa\\_%@example.com' order by c.id`,
    [MEN_COMPANY],
  );
  return r.rows.map((x: any) => ({ n: Number(String(x.name).match(/Vendor (\d+)/)?.[1] ?? 0), name: x.name, email: x.email, vendorCompanyId: Number(x.id), vendorCompanyUuid: uuidOf(Number(x.id)) })).sort((a, b) => a.n - b.n);
}


/** Run a short browser plan on one of the run's events (the platform's own steps), with the event as the prepared context. */
export async function menUiPlan(ev: { eventGroupUuid: string; made?: Record<string, string>; title?: string }, state: string, steps: Array<{ step: string; args?: Record<string, unknown> }>, onLine: (l: string) => void = () => {}): Promise<Array<{ step: string; status: string; detail: string; shot?: string }>> {
  const { runUiPlan, readPlanResult } = await import("../ui/uiFlowRunner.js");
  // one browser at a time: wait for any other Playwright run on this machine (another chat's server) to finish
  const { execSync } = await import("node:child_process");
  for (let i = 0; i < 90; i++) {
    let busy = false;
    try { busy = !!execSync("pgrep -f 'playwright test tests/plan.spec.ts' || true").toString().trim(); } catch { busy = false; }
    if (!busy) break;
    if (i === 0) onLine("another browser run is going — waiting for it");
    await new Promise((r) => setTimeout(r, 10_000));
  }
  const runId = `men-${Date.now().toString(36)}`;
  const plan = { title: "multi-entity email action", steps, context: { state, eventGroupUuid: ev.eventGroupUuid, stageUuid: ev.made?.pricingTradeUuid, title: ev.title } };
  await new Promise<void>((resolve) => runUiPlan({ plan, companyId: MEN_COMPANY, runId, headed: false, askMs: 60_000 }, (e: any) => {
    if (e.type === "log" && /\[plan\] \d+\/\d+/.test(String(e.line ?? ""))) onLine(String(e.line).replace(/^.*\[plan\]\s*/, ""));
    if (e.type === "done" || e.type === "run-error") resolve();
  }));
  const r: any = readPlanResult(runId);
  return (r?.steps ?? []).map((s: any) => ({ step: s.step, status: s.status, detail: String(s.detail ?? "").slice(0, 300), shot: s.evidence?.screenshot }));
}
