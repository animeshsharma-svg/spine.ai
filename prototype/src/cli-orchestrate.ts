/**
 * Run the full 7-agent pipeline from the command line and watch it think.
 *
 *   npm run orchestrate -- "Create and award an RFQ event, and try to break the inputs" 198678
 */
import { runOrchestrator } from "./agents/orchestrator.js";
import { DEFAULT_CLIENT } from "../config/settings.js";

const DEFAULT_REQUEST = "Create and award an RFQ event for this client, and try to break the inputs";

async function main() {
  const args = process.argv.slice(2);
  const request = args[0] || DEFAULT_REQUEST;
  const companyId = Number(args[1] || DEFAULT_CLIENT.companyId);

  const icon: Record<string, string> = {
    System: "⚙️ ",
    Analyst: "🔍",
    Planner: "🗺️ ",
    "Test-designer": "✍️ ",
    Data: "🧪",
    Critic: "🧑‍⚖️",
    Executor: "🚀",
    Reporter: "📝",
  };

  console.log(`\n▶ Request: "${request}"\n▶ Client:  ${companyId}\n`);
  const { state, provider } = await runOrchestrator(request, companyId, (e) => {
    if (e.status === "start") console.log(`\n${icon[e.agent] ?? "•"} ${e.agent} — ${e.title}`);
    else if (e.status === "done") {
      console.log(`   ✓ ${e.title}`);
      if (e.reasoning) console.log(`   ${wrap(e.reasoning)}`);
    } else if (e.status === "reasoning") console.log(`   … ${e.title}`);
  });

  console.log(`\n${"─".repeat(64)}\n📊 REPORT   (provider: ${provider})\n`);
  const r = state.report;
  if (r) {
    console.log(`Headline: ${r.headline}`);
    console.log(`Summary:  ${r.summary}\n`);
    for (const f of r.findings) {
      console.log(`  ⚠ [${f.severity}] ${f.title}`);
      console.log(`     what:  ${f.whatHappened}`);
      console.log(`     where: ${f.where}`);
    }
    console.log(`\nRecommendation: ${r.recommendation}`);
  }
  console.log();
}

function wrap(s: string, width = 92): string {
  return s.replace(new RegExp(`(.{1,${width}})(\\s|$)`, "g"), "$1\n   ").trim();
}

main().catch((e) => {
  console.error("Orchestrator error:", e);
  process.exit(1);
});
