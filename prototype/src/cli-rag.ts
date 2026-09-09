/**
 * RAG command line — build the knowledge index, or ask it a question.
 *
 *   npm run rag:build
 *   npm run rag:query "how is a user's phone number validated?"
 */
import { build, retrieve } from "./rag/knowledgeBase.js";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "build") {
    console.error("⏳ Building knowledge index (first run downloads the embed model ~90MB)…");
    const t = Date.now();
    const res = await build();
    console.error(`✅ Indexed ${res.chunks} chunks (${res.dims}-dim) in ${Date.now() - t}ms.`);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
