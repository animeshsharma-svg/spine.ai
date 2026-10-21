/**
 * APP RULES — every message the Procol dashboard deliberately shows when it refuses something,
 * read from its own source (procol-client-dashboard, read-only), with where it comes from.
 *
 * A refusal whose words are one of these is the app enforcing a rule — never, on its own, a
 * product defect. The oracle and the plan runner use this list (src/oracle/appRules.ts) to
 * tell "the app refused what my test did" from "the app misbehaved".
 *
 *   npx tsx scripts/build-app-rules.ts [--dashboard ../procol-client-dashboard]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argIdx = process.argv.indexOf("--dashboard");
const DASH = argIdx > 0 ? process.argv[argIdx + 1] : join(here, "..", "..", "procol-client-dashboard");
const SRC = join(DASH, "src");
const OUT = join(here, "..", "src", "oracle", "appRules.json");

type Rule = { message: string; source: string; via: string; condition?: string };
const rules = new Map<string, Rule>();
const add = (message: string, source: string, via: string, condition?: string) => {
  const m = message.replace(/\s+/g, " ").trim();
  if (m.length < 8 || m.length > 220 || /^[a-z]+(\.[a-zA-Z]+)+$/.test(m)) return;
  if (!rules.has(m)) rules.set(m, { message: m, source, via, ...(condition ? { condition } : {}) });
};

// 1. The translations: every string under errorMessages.*, plus validation-looking strings elsewhere.
const en = JSON.parse(readFileSync(join(SRC, "translations", "en.json"), "utf8"));
const walk = (o: any, path: string[]) => {
  if (typeof o === "string") {
    const key = path.join(".");
    if (path[0] === "errorMessages" || /(error|invalid|mandatory|required|cannot|can't|should|must|please)/i.test(o) && /error|valid|required|mandatory/i.test(key)) add(o, `translations/en.json ${key}`, "translation");
  } else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, [...path, k]);
};
walk(en, []);

// 2. Literal messages in the code: logError("…"), message.error("…"), message.warning("…").
const files: string[] = [];
const scan = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) { if (!/node_modules|__tests__|translations/.test(f)) scan(p); }
    else if (/\.(jsx?|tsx?)$/.test(f)) files.push(p);
  }
};
scan(SRC);
const CALL = /(logError|message\.error|message\.warning|notification\.error)\(\s*(["'`])((?:(?!\2).){8,220})\2/g;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  let m: RegExpExecArray | null;
  CALL.lastIndex = 0;
  while ((m = CALL.exec(text))) {
    if (m[3].includes("${")) continue;
    const line = text.slice(0, m.index).split("\n").length;
    // the nearest `if (…)` above the call is the rule's condition
    let condition: string | undefined;
    for (let k = line - 2; k >= Math.max(0, line - 12); k--) {
      const l = lines[k].trim();
      if (/^(if|} else if)\s*\(/.test(l)) { condition = l.slice(0, 160); break; }
    }
    add(m[3], `${relative(DASH, f)}:${line}`, m[1], condition);
  }
}

const list = [...rules.values()].sort((a, b) => a.message.localeCompare(b.message));
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), from: "procol-client-dashboard (read-only)", count: list.length, rules: list }, null, 2));
console.log(`wrote ${OUT} — ${list.length} app rules (${list.filter((r) => r.via === "translation").length} from translations, ${list.filter((r) => r.via !== "translation").length} from code)`);
