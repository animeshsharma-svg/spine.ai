/**
 * Fill the "Configs Needed" column of the sourcing sheet: for every case, the company settings its behaviour
 * depends on and the value it needs — chosen from Procol's own settings catalogue (master_configurations, read
 * only) with the feature-gate map built from the backend code as hints. Run once; new cases get the column
 * when they are written (house style), so this costs nothing per run.
 *
 *   npx tsx scripts/configs-needed.ts            # every case without an answer yet
 *   npx tsx scripts/configs-needed.ts --redo     # every case again
 *   npx tsx scripts/configs-needed.ts --ids SRC-CRE-002,SRC-WDR-016
 *
 * Writes docs/test-cases/generator/configs_needed.json { caseId: [{key, value, why}] }; build.py puts it into
 * the sheet.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", ".env") });
loadEnv({ path: join(here, "..", "..", "procol test", ".env") });
loadEnv({ path: join(here, "..", "..", "procol-ui-tests", ".env") });

const { chat } = await import("../src/ai/llm.js");
const { settingsCatalog, settingsFor } = await import("../src/checks/companySettings.js");
const { companySetting } = await import("../src/checks/sheetRunner.js");

const GEN = join(here, "..", "..", "docs", "test-cases", "generator");
const OUT = join(GEN, "configs_needed.json");
type Need = { key: string; value: unknown; why: string };
const cases: Array<Record<string, string>> = JSON.parse(readFileSync(join(GEN, "cases.json"), "utf8"));
const out: Record<string, Need[]> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const args = process.argv.slice(2);
const redo = args.includes("--redo");
const only = args.includes("--ids") ? new Set(args[args.indexOf("--ids") + 1].split(",")) : null;
const todo = cases.filter((c) => (only ? only.has(c["Test Case ID"]) : redo || !(c["Test Case ID"] in out)));
console.log(`${cases.length} cases, ${todo.length} to map`);

const all = await settingsCatalog();
const byKey = new Map(all.map((s) => [s.key, s]));
const gates = new Map<string, string>();
try {
  const f = JSON.parse(readFileSync(join(here, "..", "config", "featureGates.json"), "utf8")).features as Record<string, { gates: Array<{ kind: string; key: string; why?: string }> }>;
  for (const [feature, v] of Object.entries(f)) for (const g of v.gates) if (g.kind === "company_config" && !gates.has(g.key)) gates.set(g.key, `${feature} — ${g.why ?? ""}`);
} catch {
  /* no gate map */
}
const words = (t: string) => new Set(t.toLowerCase().replace(/_/g, " ").replace(/\be-?rfx\b/g, "rfx project").split(/[^a-z0-9]+/).filter((w) => w.length > 3).map((w) => w.replace(/(ings|ing|ions|ion|ies|es|ed|s)$/, "")));
const STOP = new Set(["buyer", "vendor", "event", "click", "screen", "page", "open", "show", "button", "procol", "user", "line", "item", "create"].map((w) => w.replace(/(ings|ing|ions|ion|ies|es|ed|s)$/, "")));

// Features whose switch is known from the backend gate map and the catalogue descriptions: a case that exercises
// the feature needs its switch this way, whatever the model says.
const RULES: Array<[RegExp, string, unknown, string, RegExp?]> = [
  [/counter.?offer/i, "hide_counter_offer_rfq", false, "shows the counter offer option on RFQs", /\bauction\b/i],
  [/(modify|change|propose).{0,40}counter.?offer|counter.?offer.{0,40}(modif|revis)/i, "counter_offer_modification_enabled", true, "lets vendors change a counter offer"],
  [/counter.?offer.{0,40}(percent|%)|(percent|%).{0,30}counter.?offer/i, "is_counter_offer_percent_bid_allowed", true, "counter offer as a percentage"],
  [/\bwithdraw/i, "hide_withdraw_in_intake_and_event", false, "shows the Withdraw option on events"],
  [/\b(split|partial(ly)?)\b.{0,60}award|award.{0,60}\b(split|partial)|\d+ units to .{0,40}\d+ units to/i, "is_partial_awarding_enabled", true, "award part of the quantity per vendor"],
  [/surrogate.{0,80}(already (bid|quoted)|again|second bid|revis)/i, "allowed_surrogate_bid_even_after_bid", true, "surrogate bid after the vendor bid"],
  [/surrogate.{0,80}(expir|after (the event|bidding) (closed|ended)|closed event)/i, "is_allowed_to_add_surrogate_bid_post_expiry", true, "surrogate bid after the event closes"],
  [/ceiling price|\bceil(ing)? /i, "can_add_ceil_price", true, "lets a ceiling price be set"],
  [/\bversion(ing|ed|s)?\b|\bamend(ment)?\b/i, "is_event_versioning_enabled", true, "amendments create new versions"],
  [/\bBOQ\b/, "boq_in_erfx_allowed", true, "allows BOQ events"],
  [/\be-?RFX\b|stage builder|\bproject (page|overview)|multi-?stage|RFP\s*(\+|and|then)\s*RFQ/i, "rfx_project_enabled", true, "turns on eRFX projects"],
  [/scheduled event|recurring event|publish(ed)? automatically on a schedule/i, "scheduled_events_enabled", true, "events published on a schedule"],
  [/\blots?\b.{0,60}(schedul|split|sequence).{0,60}auction|auction.{0,60}\blots?\b.{0,40}(schedul|split|sequence)/i, "is_lot_scheduling_and_split_on_auction_enabled", true, "lots on auctions opening in sequence"],
  [/note to director|\bNTD\b/, "ntd_required_on_proposal", true, "asks for a Note to Director"],
  // seen live 30 Oct: with the lock On, the create screen greys out Terms & Conditions and Publish Event
  [/Publish Event|Invite Vendor|Search vendors you want to add|"Publish"|Participants/i, "lock_vendors_addition_in_event_creation", false, "vendors can be added while creating (with it On, Publish is greyed out)"],
];
const ruleNeeds = (c: Record<string, string>): Need[] => {
  const t = `${c["Test Case Title"]} ${c["Pre-conditions"]} ${c["Test Steps"]} ${c["Expected Result"]}`;
  const out: Need[] = [];
  for (const [re, key, value, why, unless] of RULES) if (re.test(t) && !(unless && unless.test(c["Test Case Title"])) && byKey.has(key) && !out.some((o) => o.key === key)) out.push({ key, value, why });
  return out;
};

const text = (c: Record<string, string>) => `${c["Module"]} | ${c["Test Case Title"]} | ${c["Pre-conditions"]} | ${c["Test Steps"]} | ${c["Expected Result"]}`;
const BATCH = 12;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const bw = words(batch.map(text).join(" "));
  const ranked = all
    .map((s) => {
      let n = 0;
      for (const w of words(`${s.key} ${s.name} ${s.description}`)) if (bw.has(w) && !STOP.has(w)) n++;
      return { s, n: n + (gates.has(s.key) ? 2 : 0) };
    })
    .filter((x) => x.n > 1)
    .sort((a, b) => b.n - a.n)
    .slice(0, 70)
    .map((x) => x.s);
  const list = ranked.map((s) => `${s.key} = ${JSON.stringify(s.def)?.slice(0, 40)} — ${(s.description || s.name).replace(/\s+/g, " ").slice(0, 150)}${gates.has(s.key) ? ` [backend gate: ${gates.get(s.key)!.slice(0, 90)}]` : ""}`).join("\n");
  const body = batch.map((c) => `### ${c["Test Case ID"]}\nTitle: ${c["Test Case Title"]}\nModule: ${c["Module"]}\nPre-conditions: ${c["Pre-conditions"]}\nSteps: ${c["Test Steps"].replace(/\s+/g, " ").slice(0, 600)}\nExpected: ${c["Expected Result"].replace(/\s+/g, " ").slice(0, 400)}`).join("\n\n");
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You decide which COMPANY SETTINGS each manual test case of Procol (a procurement app) depends on, so a test runner can set the company that way before running it. " +
          "Choose ONLY from the SETTINGS list (exact keys). List a setting when (a) the pre-conditions ask for it, or (b) it switches on/off or changes the very feature the case exercises, so the expected result would be different with the other value " +
          "(e.g. eRFX create screens need the eRFX switch on; splitting quantity across vendors needs partial awarding on; a counter-offer case needs the RFQ counter-offer hiding switch off). " +
          "Give the value that makes the case's expected result true, of the same type as the setting's default. Do not list settings that only change wording, emails, reports, ERP sync or other features the case does not touch. At most 3 per case; [] when the case works on any setup (most cases). " +
          'Reply with JSON only: {"CASE-ID": [{"key":"…","value":…,"why":"what the setting does, 3-8 plain words"}], …} with every case id.',
      },
      { role: "user", content: `SETTINGS (key = default — description):\n${list}\n\nCASES:\n${body}` },
    ],
    { tier: "fast", temperature: 0, maxTokens: 2500 },
  ).catch((e) => {
    console.warn(`batch ${i / BATCH + 1}: ${(e as Error).message}`);
    return "";
  });
  let got: Record<string, Need[]> = {};
  try {
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    got = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : {};
  } catch {
    console.warn(`batch ${i / BATCH + 1}: the answer was not JSON — those cases stay unmapped`);
    continue;
  }
  for (const c of batch) {
    const id = c["Test Case ID"];
    const picked = (Array.isArray(got[id]) ? got[id] : []).filter((n) => {
      const d = byKey.get(n?.key);
      return d && (d.def === null || typeof d.def === typeof n.value);
    });
    // the pre-condition's own words decide first, when they name a company setup
    const phrase = companySetting(c["Pre-conditions"]);
    if (phrase) for (const n of (await settingsFor(phrase).catch(() => null)) ?? []) if (!picked.some((p) => p.key === n.key)) picked.unshift(n);
    // fixed rules for well-known features, unless the pre-condition or the model asked for the other value
    for (const n of ruleNeeds(c)) if (!picked.some((p) => p.key === n.key)) picked.push(n);
    if (Array.isArray(got[id]) || phrase || picked.length) out[id] = picked.slice(0, 4).map((n) => ({ key: n.key, value: n.value, why: String(n.why ?? "").slice(0, 80) }));
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`${Math.min(i + BATCH, todo.length)}/${todo.length} — ${batch.filter((c) => out[c["Test Case ID"]]?.length).length} of ${batch.length} need a setting`);
}
const mapped = Object.values(out);
const keys = new Map<string, number>();
for (const l of mapped) for (const n of l) keys.set(`${n.key}=${JSON.stringify(n.value)}`, (keys.get(`${n.key}=${JSON.stringify(n.value)}`) ?? 0) + 1);
console.log(`\n${mapped.length} cases mapped, ${mapped.filter((l) => l.length).length} need settings; ${cases.length - mapped.length} unmapped`);
for (const [k, n] of [...keys].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${k}`);
process.exit(0);
