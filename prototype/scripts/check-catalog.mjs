/**
 * Confirms data/catalog.json stays in sync with the real registry
 * (procol test/src/master/registry.ts).
 *
 * It reads the registry as plain text and pulls out every `key: "..."`,
 * then checks the catalog covers exactly those ids — nothing missing,
 * nothing invented. No TypeScript build needed, so it always runs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = join(here, "..", "..", "procol test", "src", "master", "registry.ts");
const catalogPath = join(here, "..", "data", "catalog.json");

const registrySrc = readFileSync(registryPath, "utf8");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

// Pull every `key: "something"` that lives inside the REGISTRY array.
const registryKeys = [...registrySrc.matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
const catalogIds = catalog.flows.map((f) => f.id);

const missingFromCatalog = registryKeys.filter((k) => !catalogIds.includes(k));
const extraInCatalog = catalogIds.filter((id) => !registryKeys.includes(id));

console.log(`Registry flows found : ${registryKeys.length}`);
console.log(`Catalog flows found  : ${catalogIds.length}`);

if (missingFromCatalog.length === 0 && extraInCatalog.length === 0) {
  console.log("\n✅ In sync — every registry flow is in the catalog and vice-versa.\n");
  for (const f of catalog.flows) {
    console.log(`   • [${f.category}] ${f.id}  —  ${f.name}`);
  }
  process.exit(0);
}

if (missingFromCatalog.length) {
  console.log(`\n❌ In registry but MISSING from catalog: ${missingFromCatalog.join(", ")}`);
}
if (extraInCatalog.length) {
  console.log(`\n❌ In catalog but NOT in registry: ${extraInCatalog.join(", ")}`);
}
process.exit(1);
