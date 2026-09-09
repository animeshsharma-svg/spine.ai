import { test } from "@playwright/test";

import { REGISTRY } from "../src/master/registry.js";
import { resolveClientContext } from "../src/context.js";
import { ClientConfig } from "../src/master/config.js";
import { FlowContext } from "../src/master/types.js";

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
      test.skip(!g.enabled, g.reason ?? `not enabled for this client`);
      test.info().annotations.push({
        type: "gate",
        description: g.reason ? `enabled — ${g.reason}` : "enabled",
      });
      await mod.run(ctx);
    });
  }
});
