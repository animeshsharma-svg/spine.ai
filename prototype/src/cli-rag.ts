/**
 * RAG command line — build the knowledge index, or ask it a question.
 *
 *   npm run rag:build
 *   npm run rag:query "how is a user's phone number validated?"
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The Slingring key (embeddings) and SPINE_DB_URL (where the memory lives) are
// in prototype/.env; the server loads it, this CLI has to as well.
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
const { build, retrieve, gatherAll } = await import("./rag/knowledgeBase.js");
const { closeSpineDb } = await import("./db/spineDb.js");

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "build") {
    console.error("⏳ Building knowledge index (first run downloads the embed model ~90MB)…");
    const t = Date.now();
    let last = 0;
    const res = await build((done, total) => {
      if (done === total || Date.now() - last > 3000) {
        last = Date.now();
        console.error(`  embedding ${done}/${total}…`);
      }
    });
    console.error(
      `✅ Indexed ${res.chunks} chunks (${res.dims}-dim) into ${res.store === "postgres" ? "Postgres" : "data/vector-store.json"} in ${Date.now() - t}ms` +
        (res.store === "postgres" ? ` — ${res.embedded} embedded, ${res.removed} removed, the rest unchanged.` : "."),
    );
    console.error(`  by kind: ${Object.entries(res.byKind).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    for (const n of res.notes) console.error(`  note: ${n}`);
    return;
  }

  // Count what a build would hold, without embedding anything.
  if (cmd === "count") {
    const { chunks, byKind, notes } = await gatherAll();
    const ids = new Set(chunks.map((c) => c.id));
    const long = chunks.filter((c) => c.text.length > 4000).length;
    console.log(`${chunks.length} chunks (${ids.size} distinct ids${long ? `, ${long} longer than 4,000 chars` : ""})`);
    for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${n}`);
    for (const n of notes) console.log(`  note: ${n}`);
    const show = rest[0];
    if (show) for (const c of chunks.filter((c) => c.kind === show).slice(0, 3)) console.log(`\n[${c.id}] ${c.source}\n${c.text.slice(0, 700)}`);
    return;
  }

  // Ask with a kind filter: rag:query --kind error-code "what does 712 mean"
  if (cmd === "query" && rest[0] === "--kind") {
    const kinds = rest[1].split(",") as any;
    const q = rest.slice(2).join(" ").trim();
    const hits = await retrieve(q, 5, { kinds });
    hits.forEach((h, i) => console.log(`#${i + 1}  ${h.kind} [${h.source}]  score=${h.score.toFixed(3)}\n${h.text.slice(0, 260).replace(/\s+/g, " ")}\n`));
    return;
  }

  if (cmd === "query") {
    const q = rest.join(" ").trim();
    if (!q) return console.error('Usage: rag:query "your question"');
    console.error(`🔎 "${q}"\n`);
    const hits = await retrieve(q, 5);
    hits.forEach((h, i) => {
      console.log(`#${i + 1}  ${h.kind} [${h.source}]  score=${h.score.toFixed(3)}`);
      console.log(h.text.slice(0, 260).replace(/\s+/g, " ") + "\n");
    });
    return;
  }

  console.error('Commands: build | count [kind] | query "..." | query --kind <k1,k2> "..."');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeSpineDb());
