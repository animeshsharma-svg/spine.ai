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
const { build, retrieve } = await import("./rag/knowledgeBase.js");
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
    return;
  }

  if (cmd === "query") {
    const q = rest.join(" ").trim();
    if (!q) return console.error('Usage: rag:query "your question"');
    console.error(`🔎 "${q}"\n`);
    const hits = await retrieve(q, 5);
    hits.forEach((h, i) => {
      console.log(`#${i + 1}  [${h.source}]  score=${h.score.toFixed(3)}`);
      console.log(h.text.slice(0, 260).replace(/\s+/g, " ") + "\n");
    });
    return;
  }

  console.error("Commands: build | query \"...\"");
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeSpineDb());
