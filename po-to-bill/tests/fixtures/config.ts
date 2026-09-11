import 'dotenv/config';

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  baseUrl: process.env.BASE_URL || 'https://sec-api.ag-ri.in',
  // The real header value literally includes quote characters -- see .env.example.
  accessToken: `"${process.env.ACCESS_TOKEN_RAW || 'Y29uc29sZV9hcHBfa2V5OmNvbnNvbGVfYXBwX3NlY3JldDoxdFMwM2V0NVlIQkdQbjBVcTZBUHp3'}"`,
  lightspeedToken: process.env.LIGHTSPEED_TOKEN || 'null',
  appVersion: process.env.APP_VERSION || '20.0.0',
  // Simple CRUD calls (create_row/PATCH/GET) vs. workflow-run/automation-trigger calls, which do
  // real cross-record work server-side (creating a whole linked Invoice/GRN/Bill, running match
  // logic) and are legitimately slower -- a single flat budget made those borderline-flaky.
  maxResponseTimeMs: num(process.env.MAX_RESPONSE_TIME_MS, 5000),
  maxResponseTimeMsHeavy: num(process.env.MAX_RESPONSE_TIME_MS_HEAVY, 12000),

  vendorRelationUuid: process.env.VENDOR_RELATION_UUID || 'Z05nWlFE',
  costCenterUuid: process.env.COST_CENTER_UUID || 'a2tRWk5Y',
  buyerGstUuid: process.env.BUYER_GST_UUID || 'RFFOZE5k',
  testRemarks: process.env.TEST_REMARKS || 'API test',
  testEmail: process.env.TEST_EMAIL || 'aanya@gmail.com',

  poQty: num(process.env.PO_QTY, 1),
  poUnitPrice: num(process.env.PO_UNIT_PRICE, 1000),

  grnReceivedQty: num(process.env.GRN_RECEIVED_QTY, 1),
  grnAcceptedQty: num(process.env.GRN_ACCEPTED_QTY, 1),

  invoiceQty: num(process.env.INVOICE_QTY, 1),
  invoiceUnitPrice: num(process.env.INVOICE_UNIT_PRICE, 1000),
  invoiceBasePrice: num(process.env.INVOICE_BASE_PRICE, 1000),
};

export function headers(): Record<string, string> {
  return {
    accept: '*/*',
    'content-type': 'application/json',
    'access-token': config.accessToken,
    'lightspeed-token': config.lightspeedToken,
    'app-version': config.appVersion,
  };
}
