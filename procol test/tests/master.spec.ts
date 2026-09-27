import { test } from "@playwright/test";

import { REGISTRY } from "../src/master/registry.js";
import { resolveClientContext } from "../src/context.js";
import { ClientConfig } from "../src/master/config.js";
import { FlowContext } from "../src/master/types.js";
import { declareCase } from "../src/report/caseSpec.js";
import { startJourney } from "../src/report/steps.js";

/**
 * THE MASTER RUNNER — config-driven, client-agnostic.
 *
 *   COMPANY_ID=39490 npx playwright test tests/master.spec.ts
 *
 * Resolves the selected client once (login + catalog + vendor + evaluator + its
 * dashboard_configuration), then runs every flow in the registry whose config
 * gate is enabled — skipping the rest with a clear reason.
 */
let ctx: FlowContext;

test.describe("master (config-driven)", () => {
  test.beforeAll(async () => {
    const base = await resolveClientContext();
    const config = await ClientConfig.load(base.buyerApi);
    ctx = { ...base, config };

    // Capability map, grouped by category: what this client's config enables.
    const byCat = new Map<string, string[]>();
    for (const mod of REGISTRY) {
      const g = mod.enabledFor(config);
      const line = `${g.enabled ? "✓" : "–"} ${mod.title}${g.enabled ? "" : `  (skip: ${g.reason})`}`;
      byCat.set(mod.category, [...(byCat.get(mod.category) ?? []), line]);
    }
    const lines = [`\n▶ client ${ctx.companyId} "${ctx.companyName ?? ""}"`];
    for (const [cat, items] of byCat) lines.push(`\n  [${cat}]`, ...items.map((i) => `    ${i}`));
    // eslint-disable-next-line no-console
    console.log(lines.join("\n") + "\n");
  });

  test.afterAll(async () => {
    await ctx?.dispose();
  });

  for (const mod of REGISTRY) {
    test(`${mod.category} › ${mod.title}  [${mod.key}]`, async () => {
      test.setTimeout(120_000);
      const g = mod.enabledFor(ctx.config);
      // Declared before the gate check, so a flow this client's configuration
      // turns off still shows in the report as a named step with a stated
      // expectation and an explicit "not run" — rather than vanishing, which
      // would quietly read as coverage.
      declareCase({
        plain: mod.plain,
        expected: mod.expected,
        flow: mod.key,
        flowTitle: mod.title,
        kind: "positive",
        expect: "accept",
        basis: "assertions",
      });
      test.skip(!g.enabled, g.reason ?? `not enabled for this client`);
      // Past the gate, so only a flow that really runs opens a journey: the
      // flows that report step by step (the events ones do) are rendered as
      // the numbered sequence they perform.
      startJourney();
      test.info().annotations.push({
        type: "gate",
        description: g.reason ? `enabled — ${g.reason}` : "enabled",
      });
      await mod.run(ctx);
    });
  }
});
