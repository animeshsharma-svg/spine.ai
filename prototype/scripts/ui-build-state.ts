/**
 * Build a screen case's starting state through the API (src/ui/uiSetup.ts) and print it.
 *
 *   npx tsx scripts/ui-build-state.ts --c 198678 --state bid [--technical]
 *
 * Prints one line: UI_STATE {json} — the ids and values the browser opens.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
const { buildUiState } = await import("../src/ui/uiSetup.js");
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const r = await buildUiState(Number(arg("c") ?? 198678), (arg("state") ?? "live") as any, { technical: process.argv.includes("--technical"), onLine: (l) => console.log(`  · ${l.slice(0, 140)}`) });
console.log(`UI_STATE ${JSON.stringify(r)}`);
process.exit(r.ok ? 0 : 1);
