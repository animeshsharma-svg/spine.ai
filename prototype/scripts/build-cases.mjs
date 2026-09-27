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
/**
 * The RUNNABLE library.
 *
 * This used to write data/test-cases.json. That filename now belongs to the 648
 * WRITTEN cases (prose, steps, oracle) that testCatalog.ts reads, so running
 * this script would have silently destroyed the written catalog and left the
 * runner with a file full of records it rejects — see the note in
 * src/checks/caseLibrary.ts, which is where that collision was first paid for.
 */
const OUT = join(here, "..", "data", "api-cases.json");
const TREE = join(here, "..", "config", "featureTree.ts");

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

/**
 * Journey order, not alphabetical order.
 *
 * Sorting by feature id put "auction.convert" above "award.proposal" above
 * "bids.place" — the reverse of the order a buyer meets them, and the reason
 * the tree read as unsorted however carefully featureTree.ts was arranged. The
 * order of leaf ids in featureTree.ts IS the journey, so read it from there;
 * anything the tree doesn't name sorts last rather than disappearing.
 */
const treeOrder = new Map(
  [...readFileSync(TREE, "utf8").matchAll(/id:\s*"([a-z0-9_]+\.[a-z0-9_]+)"/g)]
    .map((m, i) => [m[1], i]),
);
const rank = (f) => treeOrder.get(f) ?? Number.MAX_SAFE_INTEGER;
all.sort(
  (a, b) =>
    rank(a.feature) - rank(b.feature) ||
    a.feature.localeCompare(b.feature) ||
    // Within a feature: the step of the journey this case sits at, then its id.
    (a.journeyStep ?? 99) - (b.journeyStep ?? 99) ||
    a.id.localeCompare(b.id),
);
writeFileSync(OUT, JSON.stringify(all, null, 2));

const byFeature = {};
for (const c of all) byFeature[c.feature] = (byFeature[c.feature] ?? 0) + 1;

console.log(`\n✅ wrote ${all.length} runnable cases → data/api-cases.json`);
console.log(`   features covered: ${Object.keys(byFeature).length}`);
for (const [f, n] of Object.entries(byFeature).sort()) console.log(`     ${String(n).padStart(3)}  ${f}`);
if (rejected.length) {
  console.log(`\n⚠ ${rejected.length} rejected:`);
  for (const r of rejected.slice(0, 20)) console.log(`     ${r.id}: ${r.reason}`);
}
