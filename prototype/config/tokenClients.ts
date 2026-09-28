/**
 * TOKEN CLIENTS — accounts that are not on the UAT backend.
 *
 * The three clients in the dropdown are companies on UAT, and the platform
 * authenticates as them by picking up a live console session out of Postgres.
 * The sandbox demo account is a different deployment with a static API token,
 * so neither the session lookup nor the company id applies to it.
 *
 * Rather than bend the UAT path, such an account is declared here: its own API
 * base, its own auth header, and the file its token is read from at run time.
 * The token is never copied into this repo — it lives in the API suite's .env,
 * which is the same file `npm run po` uses, so there is exactly one copy of it.
 *
 * The sentinel ids sit far above real company ids so they can travel through
 * the same `?c=` parameter without ever colliding with one.
 */

export interface TokenClient {
  /** sentinel id, used wherever a companyId is expected */
  id: number;
  name: string;
  note: string;
  /** API root, including /api */
  apiBaseUrl: string;
  /** header the token goes in */
  headerName: string;
  /**
   * Env files that may hold the token, in order of preference.
   *
   * The vendored suite's own .env first, then the parent repository's — so a
   * machine that has not copied its token across yet keeps working, and one
   * that has needs nothing outside this repo.
   */
  tokenFiles: string[];
  tokenVar: string;
  appVersion: string;
  /** what this account is actually configured for, said plainly in the UI */
  covers: string;
  /**
   * The only feature groups worth offering for this account, in order.
   *
   * A sandbox stood up for the purchase-order work has no sourcing events, no
   * auctions and no vendor portal, so listing all 92 features for it invites
   * someone to tick a journey that cannot exist here. The tree is filtered to
   * this instead — the PO → Bill chain, in the order the document travels.
   */
  featureScope: string[];
  /** why the list is short, shown above the tree */
  scopeNote: string;
  /**
   * How this platform's access token is assembled.
   *
   * The value the console sends is base64 of "appKey:appSecret:session", and
   * only the session part expires. Knowing that lets the token box accept
   * either the whole header value (copied from DevTools) or just a fresh
   * session string, and build the rest.
   */
  appKey: string;
  appSecret: string;
  /**
   * How to log in as this account when its stored token has expired.
   *
   * Only workable where the OTP is predictable — a sandbox with a fixed code
   * — AND the login lands on this account's own company. See `dataProbe`:
   * a login that succeeds against the wrong tenant is worse than no login,
   * because every call afterwards is refused for a reason that reads like a
   * product bug.
   */
  otp?: { phone: string; code: string; prefix?: string };
  /**
   * A read that proves a token can see THIS ACCOUNT'S data.
   *
   * Authenticating and being able to do anything here are different questions.
   * This deployment hosts more than one company, and a session for the wrong
   * one still answers 200 on /v1/dashboard_configuration while every datasource
   * read comes back "you are not authorized to perform this action". Checking
   * authentication alone is what let a wrong-company token through.
   *
   * Relative to `apiBaseUrl`. Cheap: one row.
   */
  dataProbe?: string;
  /**
   * Credentials that live in the API suite's .env rather than in this file.
   *
   * A phone number and a fixed code are credentials, and an account whose
   * login changes should not need a TypeScript edit. Read at mint time from
   * the same files `tokenVar` comes from.
   */
  otpFromEnv?: { phoneVar: string; codeVar: string; prefix?: string };
  /** Same, for the app secret half of the token. */
  appSecretVar?: string;
  /**
   * What this account is called in the API suite's own client configs.
   *
   * The PO flow is `npx tsx src/cli/createPo.ts --client <this>`, and it was
   * hardcoded to the sandbox — so picking a different account in this UI still
   * wrote a purchase order into that one. Naming it per account is what makes
   * the button mean "run it against what I have selected".
   */
  suiteClientId?: string;
  /**
   * Kept in the configuration but not offered in the client list.
   *
   * The sandbox demo account was retired from the dropdown once Decathlon
   * carried the whole PO → Bill chain: two accounts for the same journey was
   * one more thing to pick wrong. Its config stays because the vendored
   * three-way-match suite is still pinned to it and a scripted run may still
   * name it; only the menu stops showing it.
   */
  hidden?: boolean;
  /**
   * A Playwright suite of its own that runs this account's API tests.
   *
   * Set, the account's feature tree is that suite's: its parts are the only
   * features with tests, everything else in its scope is shown greyed out as
   * "no tests yet", and "Run" hands the ticked parts to the suite instead of
   * the case library.
   */
  suite?: "aanya-rfp";
  /**
   * Sign in the way the UAT clients do: from a live console session in
   * Procol's database, for this company. No token to paste, so nothing
   * expires — as long as someone who operates the company has signed in to the
   * console recently. The pasted token in `tokenVar` stays as a fallback.
   */
  dbSessionCompany?: number;
  /** false when browser journeys cannot run for this account */
  browserJourneys: boolean;
  /** said in place of the journey list when they cannot run */
  browserNote?: string;
}

export const TOKEN_CLIENTS: TokenClient[] = [
  {
    id: 900001,
    name: "Procol Sandbox Demo (PO)",
    hidden: true,
    note: "sandbox deployment · token auth · the account the PO flow was built on",
    apiBaseUrl: "https://procol-sandbox-demo-proco-internal-demo.ag-ri.in/api",
    headerName: "access-token",
    tokenFiles: ["../api-suite/.env", "../../.env"],
    tokenVar: "PROCOL_SANDBOX_DEMO_ACCESS_TOKEN",
    appVersion: "9.4.349",
    covers:
      "The purchase-to-bill documents: purchase orders and their line items, proforma " +
      "invoices, advance shipment notes, GRNs, invoices and bills. Delivery tracking, " +
      "quality notes, payments and credit/debit notes have no datasource here, so they " +
      "are not listed at all.",
    /**
     * The PO → Bill journey, in the order a document actually travels — and
     * ONLY the parts this tenant has.
     *
     * Taken from what discovery found on it (api-suite/config/clients/
     * procol_sandbox_demo.json): p2p_purchase_order, p2p_po_line_item,
     * p2p_proforma_invoice, p2p_advance_shipment_note, p2p_grn, p2p_invoice,
     * p2p_bill. There is no datasource behind delivery tracking, quality
     * notes, payment or credit/debit notes, so those are left out rather than
     * offered and then reported as "not run".
     */
    featureScope: [
      "po",
      "p2p.proforma",
      "p2p.asn",
      "p2p.grn",
      "p2p.invoice",
      "finance.three_way",
      "finance.bill",
    ],
    scopeNote:
      "This account exists for the purchase-order work, so only the PO → Bill journey is offered: " +
      "raise the PO, receive it (GRN), invoice it, then match and bill. Everything else — sourcing, " +
      "auctions, the vendor portal, and also delivery tracking, quality notes, payments and credit " +
      "notes — has no datasource on this tenant, so it is not listed.",
    appKey: "console_app_key",
    appSecret: "console_app_secret",
    /**
     * NO LOGIN CREDENTIALS — and deliberately so. Do not re-add the browser
     * suite's phone and code here.
     *
     * They were here, taken from three-way-match/utils/constants.js on the
     * reasoning that the same account must accept the same sign-in. It does
     * not: that suite drives
     * client-procol-sandbox-demo-deploy-i-…preview.procol.tech, a different
     * deployment, and on THIS host the same phone belongs to a different
     * person at a different company (role admin, one company, zero approval
     * flows, no datasources). The login succeeds, so nothing looked wrong —
     * and every call afterwards came back "you are not authorized to perform
     * this action", which reads like the purchase-order API being broken.
     *
     * Until a phone that reaches THIS company's user is known, an expired
     * token is a thing to paste, not a thing to guess at.
     */
    /** One row from the PO datasource: proof a token can see this company. */
    dataProbe: "/fx_views/records?datasource_uuid=WGdEZ2s%3D&page=1&per_page=1",
    suiteClientId: "procol_sandbox_demo",
    browserJourneys: false,
    browserNote:
      "The browser journeys sign in through the UAT database, which this sandbox deployment is not part " +
      "of — so they cannot run for this account. Its API test cases can.",
  },
  {
    /**
     * THE ACCOUNT THE PO FLOW CAN ACTUALLY RUN ON TODAY.
     *
     * The sandbox demo was the only account offering the purchase-order flow,
     * and its token expires with no login behind it — so the button spent more
     * of its life disabled than working. This tenant has the same chain and
     * more of it (purchase order, line items, GRN, invoice, bill, plus payment
     * and credit notes), and it has what the sandbox does not: a login the
     * platform can drive, so an expired token heals itself between runs
     * instead of waiting for someone to paste a new one.
     *
     * Its credentials were already in the API suite's .env — the suite has
     * driven this account for a while. Nothing new is stored here.
     */
    id: 900002,
    name: "Sandbox (P2P flow)",
    note: "logs in per run · the full purchase-to-bill chain",
    apiBaseUrl: "https://sec-api.ag-ri.in/api",
    headerName: "access-token",
    tokenFiles: ["../api-suite/.env", "../../.env"],
    tokenVar: "DECATHLON_ACCESS_TOKEN",
    appVersion: "9.4.349",
    appKey: "console_app_key",
    // Never a literal in source: read from the same .env as the token.
    appSecret: "",
    appSecretVar: "DECATHLON_APP_SECRET",
    otpFromEnv: { phoneVar: "DECATHLON_BUYER_PHONE", codeVar: "DECATHLON_OTP" },
    /** One row of this company's purchase orders: proof the token is theirs. */
    dataProbe: "/fx_views/records?datasource_uuid=UWdrWlo%3D&page=1&per_page=1",
    suiteClientId: "decathlon",
    covers:
      "The purchase-to-bill documents end to end: purchase orders and their line items, goods " +
      "receipts, invoices, bills, accruals, payments and credit notes — plus the specialised order " +
      "types this tenant carries (gift, rent and Candex purchase orders).",
    featureScope: [
      "po",
      "p2p.grn",
      "p2p.invoice",
      "finance.three_way",
      "finance.bill",
      "finance.payment",
      "finance.credit_note",
    ],
    scopeNote:
      "This account carries the whole purchase-to-bill chain — raise the PO, receive it (GRN), " +
      "invoice it, match and bill it, then pay it — so those are what is offered. Sourcing, " +
      "auctions and the vendor portal are not part of this tenant's data.",
    browserJourneys: false,
    browserNote:
      "The browser journeys sign in through the UAT database, which this deployment is not part of — " +
      "so they cannot run for this account. Its API flow can.",
  },
  {
    /**
     * THE RFP EVENT-PUBLISH ACCOUNT.
     *
     * Runs aanya_events/rfp — the "RFP/RFQ Event Publish" Postman collection
     * as a Playwright suite: the publish flow, the post-publish verification
     * and the negative and edge cases. Its token is a console session pasted
     * into that suite's own .env; there is no login behind it, so when it
     * expires the run says so and asks for a fresh one.
     */
    id: 900003,
    name: "test",
    note: "RFP / RFQ event publish · API · signs in from the database",
    apiBaseUrl: "https://sec-api.ag-ri.in/api",
    headerName: "access-token",
    tokenFiles: ["../aanya_events/rfp/.env"],
    tokenVar: "AANYA_EVENTS_ACCESS_TOKEN",
    appVersion: "9.4.377",
    appKey: "console_app_key",
    appSecret: "",
    /** The first read of the publish flow: proof the token can create events here. */
    dataProbe: "/v1/trade/new_request_config?additional_fields=terms_and_conditions",
    suite: "aanya-rfp",
    // Demo Account 2 on UAT — the same user the pasted token belonged to, read
    // fresh from the database on every run.
    dbSessionCompany: 32461,
    covers:
      "Publishing an RFP event end to end — products, template, evaluators and vendors looked up " +
      "live, the draft, the technical stage and the publish — then every read-back of it, and " +
      "the negative and edge cases thrown at each step.",
    // The whole tree, like every other account: features the suite does not
    // test yet are shown greyed out rather than hidden.
    featureScope: [],
    scopeNote: "",
    browserJourneys: false,
    browserNote: "This account runs its RFP flow through the API only — no browser journeys yet.",
  },
];

export function isTokenClient(id: number): boolean {
  return TOKEN_CLIENTS.some((c) => c.id === id);
}

export function tokenClient(id: number): TokenClient | undefined {
  return TOKEN_CLIENTS.find((c) => c.id === id);
}
