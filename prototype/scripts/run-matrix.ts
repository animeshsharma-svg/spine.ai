/**
 * The bidding matrix from the command line.
 *
 *   npm run matrix -- --company 198678 [--combos M1,M5] [--setup-vendors 4]
 *   npm run matrix -- --company 32461 --combos MX --vendors 3 --surrogate first --timing extra-close --award one
 *
 * --setup-vendors N  make sure N QA vendors exist (198678 / 32461 only) before running
 * --setup-only       only the vendor setup
 * Results: data/matrix/<startedAt>_<company>.json
 */
import { openClientContext } from "../src/executor.js";
import { COMBOS, matrixSummary, runBiddingMatrix, type MatrixRunOptions } from "../src/checks/biddingMatrix.js";
import { ensureQaVendors } from "../src/checks/matrixVendors.js";
import { saveMatrixRun } from "../src/checks/matrixStore.js";
import { closeSpineDb } from "../src/db/spineDb.js";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const company = Number(arg("company") ?? 198678);
const combos = arg("combos")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const setup = Number(arg("setup-vendors") ?? 0);

if (args.includes("--list")) {
  for (const c of COMBOS) console.log(`${c.id.padEnd(4)} [${c.clients.join(",")}] ${c.vendors}v  ${c.title}`);
  process.exit(0);
}

if (setup > 0) {
  const c = await openClientContext(company);
  try {
    const r = await ensureQaVendors(company, setup, { buyerApi: (c as any).ctx.buyerApi, onLine: (l) => console.log(l) });
    console.log(`QA vendors for ${company}: ${r.vendors.length} ready, ${r.created} created now.`);
  } finally {
    await (c as any).dispose().catch(() => {});
  }
  if (args.includes("--setup-only")) {
    await closeSpineDb().catch(() => {});
    process.exit(0);
  }
}

const opts: MatrixRunOptions = {
  combos,
  vendorCount: arg("vendors") ? Number(arg("vendors")) : undefined,
  surrogate: arg("surrogate") as any,
  timing: arg("timing") as any,
  award: arg("award") as any,
  choose: {
    pricingTemplateUuid: arg("pricing-template"),
    technicalTemplateUuid: arg("technical-template"),
    unit: arg("unit"),
    productUuid: arg("product"),
  },
  onLine: (l) => console.log(l),
};
const r = await runBiddingMatrix(company, opts);
const file = await saveMatrixRun(r);
console.log(`\n${r.company} (${r.companyId}) — ${Math.round(r.durationMs / 1000)} s`);
for (const line of matrixSummary(r)) console.log(line);
for (const p of r.probes) console.log(`probe ${p.id} (${p.combo}): ${p.confirmed === true ? "CONFIRMED" : p.confirmed === false ? "not confirmed" : "could not tell"} — ${p.reply}`);
console.log(`saved ${file}`);
await closeSpineDb().catch(() => {});
process.exit(0);
