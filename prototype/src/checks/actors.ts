/**
 * WHO SENDS A CASE'S REQUEST — the buyer's console session, or the client's
 * QA test vendor.
 *
 * Why this exists. Bidding is a supplier-app action: the backend lets the
 * supplier app (`agribid_website` in procol-backend config/app_auth_config.yml)
 * call `v1/bids#create`, `v1/bids#update`, `v1/bids#create_bid_trade_products`
 * and a handful more, and the buyer's web console (`client_admin_dashboard`)
 * none of them. Sent with the buyer's console token those cases came back 401
 * every time and were recorded "couldn't tell" — the endpoint's own rules were
 * never reached. Worse, on some endpoints a 401 marks the session that sent it
 * as logged out, so the wrong actor can end a run.
 *
 * So a case that the supplier acts in runs AS THE CLIENT'S QA VENDOR: the same
 * qa_…@example.com company the journey invites and signs in (eventJourney
 * vendor_login), signed in by one-time code through the API framework's own
 * `authenticate` (procol test/src/auth/login.ts) with this client as the
 * tenant. Never a real supplier: a vendor whose login email is not a QA test
 * address is refused here, before any code is asked for.
 *
 * Every wait is bounded; a sign-in that fails or times out makes the vendor
 * cases "couldn't tell" with the reason, never a product failure.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withWatchdog } from "./resilience.js";
import type { Client, CheckOutcome } from "./engine.js";
import { appRefusal } from "./appAccess.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "..", "procol test");

/** A user the platform created for testing (procol test/src/auth/login.ts QA_TEST_EMAIL). */
const QA_TEST_EMAIL = /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i;

export type ActorKind = "buyer" | "vendor";

export interface CaseActor {
  kind: ActorKind;
  /** set when the case needs an actor this platform cannot be (a second vendor, an uninvited one…) */
  unavailable?: string;
  /** why this actor, in one line, for the report */
  because: string;
}

/**
 * Endpoints the supplier app may call and the web console may not, read from
 * procol-backend config/app_auth_config.yml (`agribid_website` vs
 * `client_admin_dashboard`) and mapped to paths through config/routes.rb.
 * Sending any of these with the buyer's console token proves nothing.
 */
const VENDOR_ONLY: Array<{ method: string; re: RegExp; action: string }> = [
  { method: "POST", re: /^\/v1\/bids$/, action: "v1/bids#create" },
  { method: "PATCH", re: /^\/v1\/bids\/[^/]+$/, action: "v1/bids#update" },
  { method: "POST", re: /^\/v1\/bids\/[^/]+\/create_bid_products$/, action: "v1/bids#create_bid_trade_products" },
  { method: "PATCH", re: /^\/v1\/bids\/[^/]+\/line_items\/[^/]+\/regret_status$/, action: "v1/bids#update_regret_status" },
  { method: "POST", re: /^\/user_intents$/, action: "user_intents#create" },
  { method: "POST", re: /^\/event_groups\/[^/]+\/participants$/, action: "event_groups#participate" },
  { method: "PATCH", re: /^\/v1\/trade\/[^/]+\/accept_auction_tnc$/, action: "v1/trade#accept_auction_tnc" },
  { method: "GET", re: /^\/v1\/trade\/[^/]+\/quote_summary\/[^/]+$/, action: "v1/trade#quote_summary" },
  { method: "GET", re: /^\/v1\/trade\/get_participated_auctions$/, action: "v1/trade#get_participated_auctions" },
  { method: "POST", re: /^\/bids\/accept_(knockout|dutch)_offer$/, action: "bids#accept_automated_*_offer" },
  { method: "GET", re: /^\/event_groups\/all$/, action: "event_groups#all" },
];

export function vendorOnlyAction(method: string, path: string): string | undefined {
  const p = String(path).split("?")[0];
  const m = String(method).toUpperCase();
  return VENDOR_ONLY.find((r) => r.method === m && r.re.test(p))?.action;
}

/**
 * What the SUPPLIER app may call outside the versioned namespaces, read from
 * procol-backend config/app_auth_config.yml (`agribid_website`) and mapped to
 * paths through config/routes.rb. The versioned ones (/v1/…) are judged by
 * appAccess.ts from its own snapshot. Anything else sent with the vendor's
 * token is answered 401 "This app is not authorized to use this API" — and
 * every 401 marks the session that sent it in_active
 * (JsonHelpers#check_session_validity, json_helpers.rb:31-35). Measured on
 * 2026-10-03: eight such calls in one run signed the QA vendor out eight
 * times, and the cases after them could not run.
 */
const VENDOR_APP_PLAIN: Array<{ method: string; re: RegExp }> = [
  { method: "GET", re: /^\/trade\/[^/]+$/ }, // trade#show
  { method: "POST", re: /^\/bids\/template_input$/ }, // bids#template_input
  { method: "POST", re: /^\/bids\/accept_(knockout|dutch)_offer$/ }, // bids#accept_automated_*_offer
  { method: "PATCH", re: /^\/bids\/revise_bid\/[^/]+$/ }, // bids#update_bid
  { method: "GET", re: /^\/bids\/[^/]+$/ }, // bids#show
  { method: "POST", re: /^\/user_intents$/ }, // user_intents#create
  { method: "PATCH", re: /^\/additional_request\/(resolve_additional_request|revoke_additional_requests)$/ },
  { method: "POST", re: /^\/template_responses$/ }, // template_responses#create
  { method: "PATCH", re: /^\/template_responses\/[^/]+$/ }, // template_responses#update
  { method: "PUT", re: /^\/template_responses\/[^/]+\/create_page_responses$/ }, // #create_form_page_responses
  { method: "GET", re: /^\/event_groups(\/all)?$/ }, // event_groups#index / #all
  { method: "GET", re: /^\/event_groups\/[^/]+(\/(get_line_items|get_all_attachments|history|options))?$/ },
  { method: "POST", re: /^\/event_groups\/[^/]+\/participants$/ }, // event_groups#participate
  { method: "POST", re: /^\/reports\/download_report$/ },
];

/**
 * Why the supplier app may not send this request at all, or undefined.
 * Such a request is never sent with the vendor's token: it would be refused
 * at the app gate (before any rule a case is about) and sign the vendor out.
 */
export function vendorAppRefusal(method: string, path: string): string | undefined {
  const p = String(path).split("?")[0];
  const m = String(method).toUpperCase();
  if (/^\/(v\d+|supplier_suite|approval_workflow|integration_builder)\//.test(p)) return appRefusal("vendor", m, p);
  if (VENDOR_APP_PLAIN.some((r) => r.method === m && r.re.test(p))) return undefined;
  return `the supplier app may not call ${m} ${p.split("/").map((seg) => (/^\{\{\w+\}\}$/.test(seg) || /[A-Z0-9=]/.test(seg) ? ":id" : seg)).join("/")} (it is not on agribid_website's list in config/app_auth_config.yml)`;
}

/** The case's own words naming the session it runs in. */
const SAYS_VENDOR =
  /\bSession:\s*the invited VENDOR\b|\bcaller is (?:the|an invited|a mapped) VENDOR\b|\bSigned in as (?:the|an) invited vendor\b|\bAuthenticated vendor session\b|^\s*A vendor session\b|\bcaller is a vendor\b/i;
const SAYS_BUYER = /\bSession:\s*the BUYER\b|\bSigned in as the run's buyer\b|\bThe caller is the run's buyer\b/i;
/**
 * A case that needs a vendor OTHER than the one invited — not on the audience,
 * owning a different bid, with no mapping to the buyer. The platform has one
 * QA vendor per client in the audience; running such a case as that vendor
 * would test the opposite of what it says.
 */
const NEEDS_OTHER_VENDOR =
  /\bSession:\s*a vendor NOT on the audience\b|\bSession:\s*vendor A\b|\bowned by vendor B\b|\bvendor user who is NOT in\b|\bvendor user who did NOT create\b|\bcompany that can see open tenders but has no BuyerSellerCompanyMapping\b|\bA vendor not invited\b|\bTwo vendors with bids\b/i;

/**
 * Which actor a library case runs as. Conservative: the vendor only when the
 * endpoint is supplier-only or the case itself names the vendor's session.
 */
export function actorOfCase(c: { method: string; path: string; preconditions?: string }): CaseActor {
  const pre = c.preconditions ?? "";
  const action = vendorOnlyAction(c.method, c.path);
  const saysVendor = SAYS_VENDOR.test(pre);
  if (NEEDS_OTHER_VENDOR.test(pre) && (action || saysVendor || /vendor/i.test(pre))) {
    return {
      kind: "vendor",
      unavailable:
        "needs a second vendor — one that is not invited, or that owns a different bid — and this client has a single QA test vendor in the event's audience; running it as that vendor would test the opposite of what it says",
      because: "the case names a vendor other than the invited one",
    };
  }
  if (SAYS_BUYER.test(pre)) return { kind: "buyer", because: "the case says it runs as the buyer" };
  if (action) return { kind: "vendor", because: `${action} is a supplier-app action — the web console may not call it (app_auth_config.yml)` };
  if (saysVendor) return { kind: "vendor", because: "the case says it runs in the invited vendor's session" };
  return { kind: "buyer", because: "the buyer's web-console session" };
}

// ── the vendor's session ────────────────────────────────────────────────────

interface Sibling {
  authenticate: (id: any) => Promise<any>;
  ApiClient: any;
  CONFIG: any;
}
let siblingP: Promise<Sibling> | undefined;
function sibling(): Promise<Sibling> {
  if (!siblingP) {
    const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
    siblingP = Promise.all([imp("auth/login.ts"), imp("api/client.ts"), imp("config.ts")]).then(([l, c, cfg]) => ({
      authenticate: l.authenticate,
      ApiClient: c.ApiClient,
      CONFIG: cfg.CONFIG,
    }));
    siblingP.catch(() => {
      siblingP = undefined;
    });
  }
  return siblingP;
}

const SIGN_IN_MS = 90_000;
/** A run never signs the vendor in more than this many times (each 401 can log it out). */
const MAX_SIGN_INS = 10;

export class VendorSession {
  private api: any;
  private pending: Promise<{ api?: any; problem?: string }> | undefined;
  private signIns = 0;
  private lastProblem: string | undefined;
  readonly email?: string;
  readonly vendorUuid?: string;
  readonly name?: string;

  constructor(private readonly client: Client, private readonly baseURL?: string) {
    const v = (client as any)?.ctx?.vendor;
    this.email = v?.email;
    this.vendorUuid = v?.uuid;
    this.name = v?.name;
  }

  /** Why no vendor session can exist for this client, if none can. */
  refusal(): string | undefined {
    const ctx = (this.client as any)?.ctx ?? {};
    if (ctx.noQaVendor || !this.vendorUuid) return `this client has no QA test vendor (${ctx.noQaVendor ?? "none found"}), and real suppliers are never signed in`;
    if (!this.email) return "the client's QA test vendor has no login email";
    if (!QA_TEST_EMAIL.test(this.email)) return "the invited vendor's login is not a QA test address (qa_…@example.com), and only QA test vendors are ever signed in";
    return undefined;
  }

  /** The vendor's API client, signing in on first use. Never throws; bounded. */
  async get(): Promise<{ api?: any; problem?: string }> {
    if (this.api) return { api: this.api };
    const no = this.refusal();
    if (no) return { problem: no };
    if (this.pending) return this.pending;
    if (this.signIns >= MAX_SIGN_INS) return { problem: `the vendor was signed in ${MAX_SIGN_INS} times in this run already${this.lastProblem ? ` (last: ${this.lastProblem})` : ""} — not trying again` };
    this.signIns += 1;
    this.pending = withWatchdog(this.signIn(), SIGN_IN_MS, "signing in as the QA vendor")
      .then((api) => {
        this.api = api;
        return { api };
      })
      .catch((e) => {
        this.lastProblem = clean(e instanceof Error ? e.message : String(e));
        return { problem: `signing in as the client's QA vendor failed: ${this.lastProblem}` };
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async signIn(): Promise<any> {
    const s = await sibling();
    const companyId = (this.client as any)?.ctx?.companyId;
    const id = { ...s.CONFIG.identities.vendor, email: this.email, tenantCompanyId: companyId, ...(this.baseURL ? { baseURL: this.baseURL } : {}) };
    const login = await s.authenticate(id);
    return s.ApiClient.create(login, { baseURL: id.baseURL, appVersion: login.appVersion, identity: "vendor", companyId });
  }

  /**
   * A 401 on the vendor's token: on this backend it can mark the session
   * logged out, so the next vendor case signs in again rather than inheriting
   * a dead token.
   */
  forget(): void {
    const api = this.api;
    this.api = undefined;
    if (api) Promise.resolve(api.dispose?.()).catch(() => {});
  }

  get signInCount(): number {
    return this.signIns;
  }

  async dispose(): Promise<void> {
    this.forget();
  }
}

/** One vendor session per open client context (a renewed client gets its own). */
const SESSIONS = new WeakMap<object, VendorSession>();
export function vendorSessionFor(client: Client, baseURL?: string): VendorSession {
  const key = ((client as any)?.ctx ?? client) as object;
  let s = SESSIONS.get(key);
  if (!s) {
    s = new VendorSession(client, baseURL);
    SESSIONS.set(key, s);
  }
  return s;
}

/** Close the vendor session of a client, if one was opened. */
export async function disposeVendorSession(client: Client | null | undefined): Promise<void> {
  if (!client) return;
  const key = ((client as any)?.ctx ?? client) as object;
  const s = SESSIONS.get(key);
  SESSIONS.delete(key);
  await s?.dispose().catch(() => {});
}

/**
 * Send one request as the QA vendor and turn the reply into a check outcome.
 * A sign-in that cannot happen is "couldn't tell" with the reason, never a
 * product verdict.
 */
export async function sendAsVendor(
  client: Client,
  req: { method: string; path: string; body?: unknown },
  baseURL?: string,
): Promise<CheckOutcome> {
  const t = Date.now();
  // Never ask the supplier app for what it may not do: the 401 signs it out.
  const barred = vendorAppRefusal(req.method, req.path);
  if (barred) return { httpStatus: null, accepted: false, message: null, durationMs: 0, notSent: barred } as CheckOutcome;
  const vs = vendorSessionFor(client, baseURL);
  const { api, problem } = await vs.get();
  if (!api) {
    return {
      httpStatus: null,
      accepted: false,
      message: problem ?? "no vendor session",
      durationMs: Date.now() - t,
      verdictOverride: {
        pass: false,
        inconclusive: true,
        verdict: `not checked — this case runs as the client's QA vendor, and ${problem ?? "no vendor session could be opened"}`,
      },
    };
  }
  const method = String(req.method).toUpperCase();
  let r: any;
  try {
    r = await withWatchdog(
      api.attempt(method, req.path, req.body === undefined || method === "GET" ? {} : { body: req.body }),
      60_000,
      `${method} ${req.path.split("?")[0]} as the vendor`,
    );
  } catch (e) {
    return { httpStatus: null, accepted: false, message: clean(e instanceof Error ? e.message : String(e)), durationMs: Date.now() - t };
  }
  const status = typeof r?.status === "number" && r.status > 0 ? r.status : null;
  if (status === 401) vs.forget();
  const msg = r?.ok ? null : clean(String(r?.errorMessage ?? errorText(r?.data) ?? `HTTP ${status ?? "?"}`));
  return {
    httpStatus: status,
    accepted: !!r?.ok,
    message: msg,
    durationMs: Date.now() - t,
    ...(r?.errorCode !== undefined && !r?.ok ? { errorCode: String(r.errorCode) } : {}),
    ...(r?.ok ? { data: r.data } : {}),
  } as CheckOutcome;
}

function errorText(data: any): string | undefined {
  const e = data?.error;
  const m = typeof e === "string" ? e : e?.message ?? data?.message;
  return m === undefined ? undefined : Array.isArray(m) ? m.join("; ") : String(m);
}

/** One line, no one-time codes or tokens. */
function clean(s: string): string {
  return s
    .replace(/("?(?:otp|access[-_]?token|token|password)"?\s*[:=]\s*)"?[^",\s}]+"?/gi, "$1<redacted>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}
