/**
 * Merge the mined test-case files into the library the platform runs.
 *
 *   node scripts/build-cases.mjs
 *
 * Reads every data/cases-src/*.json (each an array of test cases), validates
 * them, drops duplicates, and writes data/test-cases.json. Anything rejected is
 * printed with the reason — never silently discarded.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "data", "cases-src");
const OUT = join(here, "..", "data", "test-cases.json");

if (!existsSync(SRC)) mkdirSync(SRC, { recursive: true });

const REQUIRED = ["id", "feature", "title", "type", "priority", "severity", "method", "path", "expected", "expectedResult"];
const METHODS = new Set(["GET", "POST", "PATCH"]);
const EXPECTED = new Set(["accept", "reject", "no-5xx"]);

const all = [];
const rejected = [];
const seen = new Set();

for (const file of readdirSync(SRC).filter((f) => f.endsWith(".json"))) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(SRC, file), "utf8"));
  } catch (e) {
    console.log(`✗ ${file}: not valid JSON (${e.message})`);
    continue;
  }
  const list = Array.isArray(parsed) ? parsed : (parsed.cases ?? []);
  let kept = 0;
  for (const c of list) {
    const missing = REQUIRED.filter((k) => !c?.[k]);
    if (missing.length) {
      rejected.push({ id: c?.id ?? "(no id)", reason: `missing ${missing.join(", ")}` });
      continue;
    }
    if (!METHODS.has(String(c.method).toUpperCase())) {
      rejected.push({ id: c.id, reason: `method ${c.method} not allowed` });
      continue;
    }
    if (!EXPECTED.has(c.expected)) {
      rejected.push({ id: c.id, reason: `expected "${c.expected}" is not accept|reject|no-5xx` });
      continue;
    }
    if (!String(c.path).startsWith("/")) {
      rejected.push({ id: c.id, reason: "path is not absolute" });
      continue;
    }
    if (seen.has(c.id)) {
      rejected.push({ id: c.id, reason: "duplicate id" });
      continue;
    }
    seen.add(c.id);
    all.push({ ...c, method: String(c.method).toUpperCase() });
    kept++;
  }
  console.log(`  ${file}: ${kept}/${list.length} kept`);
}

all.sort((a, b) => a.feature.localeCompare(b.feature) || a.id.localeCompare(b.id));
writeFileSync(OUT, JSON.stringify(all, null, 2));

const byFeature = {};
for (const c of all) byFeature[c.feature] = (byFeature[c.feature] ?? 0) + 1;

console.log(`\n✅ wrote ${all.length} test cases → data/test-cases.json`);
console.log(`   features covered: ${Object.keys(byFeature).length}`);
for (const [f, n] of Object.entries(byFeature).sort()) console.log(`     ${String(n).padStart(3)}  ${f}`);
if (rejected.length) {
  console.log(`\n⚠ ${rejected.length} rejected:`);
  for (const r of rejected.slice(0, 20)) console.log(`     ${r.id}: ${r.reason}`);
}
