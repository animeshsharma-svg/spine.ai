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
  /** absolute-ish path (from this repo) of the env file holding the token */
  tokenFile: string;
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
  /** false when browser journeys cannot run for this account */
  browserJourneys: boolean;
  /** said in place of the journey list when they cannot run */
  browserNote?: string;
}

export const TOKEN_CLIENTS: TokenClient[] = [
  {
    id: 900001,
    name: "Procol Sandbox Demo (PO)",
    note: "sandbox deployment · token auth · the account the PO flow was built on",
    apiBaseUrl: "https://procol-sandbox-demo-proco-internal-demo.ag-ri.in/api",
    headerName: "access-token",
    tokenFile: "../../.env",
    tokenVar: "PROCOL_SANDBOX_DEMO_ACCESS_TOKEN",
    appVersion: "9.4.349",
    covers:
      "Purchase orders and their line items. This tenant has no GRN, invoice or bill " +
      "datasource, so cases for those report as not run rather than as failures.",
    // The PO → Bill journey, in the order a document actually travels:
    // raise the order, receive it, invoice it, match and pay.
    featureScope: ["po", "p2p", "finance"],
    scopeNote:
      "This account exists for the purchase-order work, so only the PO → Bill journey is offered: " +
      "raise the PO, receive it (GRN), invoice it, then match and bill. The sourcing, auction and " +
      "vendor-portal features do not exist on this tenant, so they are not listed.",
    appKey: "console_app_key",
    appSecret: "console_app_secret",
    browserJourneys: false,
    browserNote:
      "The browser journeys sign in through the UAT database, which this sandbox deployment is not part " +
      "of — so they cannot run for this account. Its API test cases can.",
  },
];

export function isTokenClient(id: number): boolean {
  return TOKEN_CLIENTS.some((c) => c.id === id);
}

export function tokenClient(id: number): TokenClient | undefined {
  return TOKEN_CLIENTS.find((c) => c.id === id);
}
