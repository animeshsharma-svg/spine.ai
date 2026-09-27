import { summariseFindings, type DefectGroup } from "../agents/oracle.js";
import { recall } from "../rag/knowledgeBase.js";

/**
 * A bug report a human can act on without asking us anything.
 *
 * The bar is deliberately higher than "list the failures". A report earns its
 * place only if a developer who was not in the room can reproduce the defect,
 * see the evidence, and know whether it is new — so each entry carries the
 * failing request, the steps actually observed, the blast radius, and what the
 * QA memory already knows about that area. Everything here is recorded fact;
 * nothing is inferred by a model.
 */

const KIND_LABEL: Record<DefectGroup["kind"], string> = {
  product_defect: "Product defect",
  contradiction: "Silent failure (UI showed nothing, API failed)",
  product_rejected_input: "Test gap — the product refused the input",
  automation_defect: "Harness issue — the journey could not be driven",
  environment: "Environment",
};

const SEV_ORDER: DefectGroup["severity"][] = ["critical", "high", "medium", "low"];

function when(iso: string): string {
  return iso.replace("T", " ").replace(/\..*$/, "") + " UTC";
}

export interface ReportOptions {
  /** Include the QA-memory context for each defect (one retrieval per defect). */
  withContext?: boolean;
}

export async function buildMarkdownReport(opts: ReportOptions = {}): Promise<string> {
  const groups = summariseFindings();
  const out: string[] = [];
  const now = new Date().toISOString();

  const productDefects = groups.filter((g) => g.kind === "product_defect" || g.kind === "contradiction");
  const gaps = groups.filter((g) => g.kind === "product_rejected_input");
  const harness = groups.filter((g) => g.kind === "automation_defect");
  const env = groups.filter((g) => g.kind === "environment");

  out.push("# QA report — Procol");
  out.push("");
  out.push(`Generated ${when(now)} by spine.ai.`);
  out.push("");

  if (!groups.length) {
    out.push("No findings recorded. Either no journey has run yet, or every journey passed.");
    return out.join("\n");
  }

  // ── Headline. Say the one thing a reader needs before anything else.
  const worst = productDefects[0];
  out.push("## Summary");
  out.push("");
  if (worst) {
    out.push(
      `**${worst.title}** — ${worst.severity}, affecting ${worst.flows.length} journey` +
        `${worst.flows.length === 1 ? "" : "s"}. ${productDefects.length > 1 ? `${productDefects.length} product defects in total. ` : ""}` +
        `See [1] below for evidence and reproduction.`,
    );
  } else {
    out.push("No defects in the product itself were found in these runs.");
  }
  out.push("");
  out.push("| | Count | What it means |");
  out.push("|---|---|---|");
  out.push(`| Product defects | ${productDefects.length} | The application failed. A developer should look. |`);
  out.push(`| Test gaps | ${gaps.length} | The product refused our input — the journey or its data is incomplete. |`);
  out.push(`| Harness issues | ${harness.length} | Our automation could not drive the screen. The product was never exercised. |`);
  out.push(`| Environment | ${env.length} | The environment was unavailable. Nothing can be concluded. |`);
  out.push("");
  out.push(
    "> The distinction matters: a run with harness issues proves less than it appears to, and a test " +
      "gap is not a bug. Only the first row is work for the product team.",
  );
  out.push("");

  // ── One section per defect, worst first.
  let n = 0;
  for (const sev of SEV_ORDER) {
    for (const g of groups.filter((x) => x.severity === sev)) {
      n += 1;
      out.push("---");
      out.push("");
      out.push(`## [${n}] ${g.title}`);
      out.push("");
      out.push(`**${KIND_LABEL[g.kind]}** · severity **${g.severity}** · seen **${g.occurrences}×**`);
      out.push("");
      out.push(g.rationale);
      out.push("");

      out.push("**Blast radius** — journeys that hit this defect:");
      out.push("");
      for (const f of g.flows) out.push(`- \`${f}\``);
      out.push("");

      if (g.evidence.length) {
        out.push("**Evidence**");
        out.push("");
        out.push("```");
        for (const e of g.evidence) out.push(e);
        out.push("```");
        out.push("");
      }

      if (g.reproduction.length) {
        out.push("**Steps observed** (the automation's own narration, in order)");
        out.push("");
        for (const step of g.reproduction) out.push(`1. ${step.replace(/^\[[^\]]+\]\s*/, "")}`);
        out.push("");
      }

      out.push(`**First seen** ${when(g.firstSeen)} · **last seen** ${when(g.lastSeen)}`);
      out.push("");

      if (opts.withContext) {
        try {
          const module = g.flows[0]?.split(".")[0];
          const { expectations, experience } = await recall(g.title, module, 3);
          if (expectations.length) {
            out.push("**What should happen here** (from the test-case catalog)");
            out.push("");
            for (const r of expectations) out.push(`- ${r.text.slice(0, 260)} _(${r.source})_`);
            out.push("");
          }
          // Exclude this defect's OWN records. "This area has failed before"
          // pointing at the very run you are reading is worse than saying
          // nothing: it implies corroborating history that does not exist.
          const others = experience.filter((r) => !r.text.includes(g.title));
          if (others.length) {
            out.push("**Related history** — this area has failed before");
            out.push("");
            for (const r of others) out.push(`- ${r.text.slice(0, 260)} _(${r.source})_`);
            out.push("");
          }
        } catch {
          /* memory not built — the report is still complete without it */
        }
      }

      if (!g.actionable) {
        out.push(
          "> Not actionable by the product team: this is a problem with the test or the environment, " +
            "recorded so the run's result is not mistaken for a clean pass.",
        );
        out.push("");
      }
    }
  }

  out.push("---");
  out.push("");
  out.push("## How these verdicts were reached");
  out.push("");
  out.push(
    "Every verdict is computed from recorded evidence — HTTP status codes, the application's own " +
      "error messages, and the final URL — not from a language model's impression. A 5xx during a " +
      "journey is a product defect regardless of what was sent, because no input justifies a server " +
      "error. An error message in the application's own words is the product working as designed, so " +
      "it is reported as a gap in the test rather than a bug. A failure with no HTTP error and no " +
      "message from the application is treated as our own problem until evidence says otherwise.",
  );
  out.push("");
  out.push(
    "Findings are grouped by defect rather than by journey, so one release blocker with seven " +
      "symptoms reads as one item with a blast radius of seven instead of seven separate criticals.",
  );
  out.push("");
  return out.join("\n");
}
