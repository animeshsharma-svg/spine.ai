/**
 * Multi-entity vendor emails (Gulbrandsen 50169, UAT): set-up. Signs in as the company's buyer (saved session, no
 * OTP), then — with --vendors — makes sure two QA vendors exist (invite with onboarding skipped → email OTP → vendor
 * sign-up; test addresses qa_…@example.com, caught by Mailpit). Approved by the tester for this run (13 Nov).
 *   QA_VENDOR_APPROVED_WORKSPACES=50169 npx tsx scripts/men-setup.ts [--vendors]
 */
import "dotenv/config";
import { openClientContext } from "../src/executor.js";
import { ensureQaVendors, listQaVendors } from "../src/checks/matrixVendors.js";
const COMPANY = 50169;
const client: any = await openClientContext(COMPANY);
try {
  console.log("signed in:", client.companyName, "· buyer user", client.ctx?.buyerUserId ?? client.ctx?.user?.id ?? "?");
  console.log("recorded QA vendors:", (await listQaVendors(COMPANY)).map((v) => `${v.name} <${v.email}> login ${v.loginOk}`));
  if (process.argv.includes("--vendors")) {
    const r = await ensureQaVendors(COMPANY, 2, { buyerApi: client.ctx.buyerApi, onLine: (l) => console.log(" ", l) });
    console.log("created", r.created, "→", r.vendors.map((v) => `${v.name} <${v.email}> company ${v.vendorCompanyId} login ${v.loginOk}`));
  }
} finally {
  await client.dispose?.().catch(() => {});
}
process.exit(0);
