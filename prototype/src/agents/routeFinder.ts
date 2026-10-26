/**
 * WHICH SCREEN IS THIS JOURNEY ABOUT? — the words of a journey (and the compiler's gaps) matched
 * to the console's own routes (data/console-routes.json, read from the client-dashboard's route
 * config: path, name, breadcrumbs), so a journey the step catalog has no step for can still be
 * taken to its screen, photographed, written up and tested.
 *
 * Words first (synonyms a buyer uses: PR, PO, intake, supplier…), then a fast model picks among
 * the top candidates and says whether it is sure. Not sure = a question for the tester, never a
 * guess that opens the wrong page.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chat } from "../ai/llm.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES_FILE = join(here, "..", "..", "data", "console-routes.json");

export interface ConsoleRoute {
  key: string;
  path: string;
  name: string;
  crumbs: string[];
  perm?: string;
}
export interface RouteHit extends ConsoleRoute {
  score: number;
  why: string[];
}

let cache: ConsoleRoute[] | null = null;
export function consoleRoutes(): ConsoleRoute[] {
  if (cache) return cache;
  try {
    cache = (JSON.parse(readFileSync(ROUTES_FILE, "utf8")).routes as ConsoleRoute[]).filter((r) => r.path && !/flexi|procol-variables|companies|widget-data|charcha/.test(r.path));
  } catch {
    cache = [];
  }
  return cache;
}

/** What buyers call things → the words the routes use. Phrases are matched whole, in order. */
const SYNONYMS: Array<[RegExp, string[], number]> = [
  [/\bpurchase requisitions?\b|\brequisitions?\b|\bPRs?\b(?!\s*-?\s*origin event)/i, ["purchase", "requisition"], 4],
  [/\bpurchase orders?\b|\bPOs?\b/i, ["purchase", "order"], 4],
  [/\bintake\b/i, ["intake"], 4],
  [/\bvendors?\b|\bsuppliers?\b/i, ["vendor"], 2],
  [/\bonboard/i, ["onboarding"], 3],
  [/\bbulk upload\b|\bupload (a )?(csv|excel|sheet|file)\b/i, ["bulk", "upload"], 3],
  [/\bproducts?\b|\bitem master\b|\bcatalog(ue)?\b/i, ["product"], 2],
  [/\bcontracts?\b/i, ["contract"], 3],
  [/\btemplates?\b/i, ["template"], 2],
  [/\bapprovals?\b|\bapprover\b|\bworkflows?\b/i, ["approval"], 3],
  [/\bescalations?\b/i, ["escalation"], 3],
  [/\bDOA\b|\bdelegation of authority\b/i, ["doa"], 4],
  [/\blocations?\b|\bdelivery location\b|\bwarehouse\b|\bplant\b/i, ["location"], 2],
  [/\busers?\b|\bbuyers?\b(?= (list|page|screen|management))/i, ["user"], 2],
  [/\bteams?\b/i, ["team"], 2],
  [/\bcategor(y|ies)\b/i, ["categories"], 3],
  [/\bbudgets?\b/i, ["budget"], 3],
  [/\binvoices?\b|\bbills?\b/i, ["invoice"], 3],
  [/\btracker\b|\bprocurement tracker\b/i, ["procurement", "tracker"], 3],
  [/\banalytics\b|\bprice trends?\b|\bdashboard\b|\binsights?\b/i, ["analytics"], 2],
  [/\bsettings?\b|\bconfigurations?\b/i, ["settings"], 2],
  [/\bpermissions?\b|\broles?\b/i, ["permissions"], 3],
  [/\bevents?\b|\brfqs?\b|\brfps?\b|\bauctions?\b|\berfx\b|\bsourcing\b/i, ["orders"], 1],
  [/\bissues?\b|\btickets?\b/i, ["issues"], 3],
  [/\bengagements?\b/i, ["engagements"], 3],
  [/\bchats?\b|\bmessages?\b/i, ["chats"], 2],
  [/\bTDS\b/i, ["tds"], 4],
  [/\btariff\b|\bHSN\b/i, ["tariff"], 4],
  [/\breorder/i, ["reorder"], 3],
  [/\bintegrations?\b|\bSAP\b|\bERP\b/i, ["integration"], 3],
  [/\bactivity\b|\baudit\b/i, ["activity"], 3],
  [/\bcontrols?\b|\bmodules?\b/i, ["controls"], 2],
  [/\bhome\b/i, ["home"], 2],
];

const tokens = (t: string) =>
  t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/(ies)$/, "y").replace(/s$/, ""));

/** Routes scored by words alone, best first. */
export function scoreRoutes(text: string, gaps: string[] = []): RouteHit[] {
  const all = `${text} ${gaps.join(" ")}`;
  const want = new Set<string>();
  const phraseWords = new Map<string, number>();
  for (const [re, words, weight] of SYNONYMS) if (re.test(all)) for (const w of words) phraseWords.set(w, Math.max(phraseWords.get(w) ?? 0, weight));
  for (const w of tokens(all)) want.add(w);
  const creating = /\b(create|new|add|raise|make)\b/i.test(all);
  const uploading = /\bbulk|upload\b/i.test(all);
  const hits: RouteHit[] = [];
  for (const r of consoleRoutes()) {
    const bag = new Set(tokens(`${r.name} ${r.crumbs.join(" ")} ${r.path.replace(/[-/]/g, " ")}`));
    let score = 0;
    const why: string[] = [];
    for (const [w, weight] of phraseWords) {
      const ws = w.replace(/s$/, "");
      if (bag.has(ws)) {
        score += weight;
        why.push(w);
      }
    }
    for (const w of want) if (bag.has(w) && !why.includes(w) && !["the", "and", "with", "from", "for"].includes(w)) {
      score += 1;
      why.push(w);
    }
    if (!score) continue;
    const depth = r.path.split("/").filter(Boolean).length;
    // The list page over its sub-pages, unless the words ask for creating or uploading.
    if (/create|add|new$/.test(r.path)) score += creating ? 1.5 : -1;
    if (/bulk-upload/.test(r.path)) score += uploading ? 2 : -1.5;
    score -= (depth - 1) * 0.5;
    hits.push({ ...r, score, why });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export interface ScreenChoice {
  /** routes to open, in order — empty when not sure */
  sure: RouteHit[];
  /** the best guesses, for a question */
  candidates: RouteHit[];
  question?: string;
}

/**
 * The screens a journey is about. A console path in the words ("/purchase-requisitions") wins
 * outright; otherwise the scored routes, confirmed by a fast model when the words leave room.
 */
export async function findScreens(text: string, gaps: string[] = [], opts: { max?: number } = {}): Promise<ScreenChoice> {
  const max = opts.max ?? 2;
  const explicit = text.match(/(?:^|\s)(\/[a-z][a-z0-9/-]{2,})/i);
  if (explicit) {
    const p = explicit[1].replace(/\/+$/, "");
    const r = consoleRoutes().find((x) => x.path === p) ?? { key: "typed", path: p, name: p, crumbs: [] };
    return { sure: [{ ...r, score: 99, why: ["a console path in the words"] }], candidates: [] };
  }
  // The event screens (/orders, /project) belong to the step catalog — a journey about them
  // compiles; exploration is for the screens no step reaches.
  const scored = scoreRoutes(text, gaps).filter((r) => !/^\/(orders|project)\b/.test(r.path));
  const top = scored.slice(0, 8);
  if (!top.length) return { sure: [], candidates: [], question: "Which screen of the console is this journey about? I have no step for it yet." };

  // Clear by words alone: a strong first hit well ahead of the best hit from any OTHER family
  // of screens (its own sub-pages — PR list vs PR PO-form — are not rivals, the list wins).
  const family = (p: string) => p.split("/").filter(Boolean)[0] ?? "";
  const other = top.find((r) => family(r.path) !== family(top[0].path));
  const clear = top[0].score >= 4 && (!other || top[0].score - other.score >= 2);
  const likely = top[0].score >= 3 && (!other || top[0].score - other.score >= 1);
  let pick: { paths?: string[]; sure?: boolean; question?: string } | null = null;
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "You map a QA tester's journey on Procol (a B2B sourcing console) to the console screens it needs. Choose ONLY among the candidate routes given. " +
            'Answer with JSON only: {"paths": ["/…"], "sure": true|false, "question": "…"}. ' +
            "paths = the screen(s) the journey starts on or needs that the event steps do not cover (at most 2, most important first). sure = true only when the words leave no doubt. When not sure, write one short question a tester can answer in a word.",
        },
        {
          role: "user",
          content: `JOURNEY: ${text}\n${gaps.length ? `WHAT THE STEP CATALOG CANNOT DO: ${gaps.join("; ")}\n` : ""}\nCANDIDATE ROUTES:\n${top.map((r) => `- ${r.path} — ${r.name}${r.crumbs.length ? ` (${r.crumbs.join(" › ")})` : ""}`).join("\n")}`,
        },
      ],
      { tier: "fast", temperature: 0, maxTokens: 300 },
    );
    const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
    if (i >= 0 && j > i) pick = JSON.parse(raw.slice(i, j + 1));
  } catch {
    pick = null;
  }
  const byPath = new Map(top.map((r) => [r.path, r]));
  const chosen = (pick?.paths ?? []).map((p) => byPath.get(String(p))).filter((r): r is RouteHit => !!r).slice(0, max);
  if (chosen.length && pick?.sure) return { sure: clear && !chosen.some((r) => r.path === top[0].path) ? [top[0], ...chosen].slice(0, max) : chosen, candidates: top.slice(0, 5) };
  // The words are clear on their own: the top screen, plus a second one the model named.
  if (clear) return { sure: [top[0], ...chosen.filter((r) => r.path !== top[0].path)].slice(0, max), candidates: top.slice(0, 5) };
  if (!pick && likely) return { sure: [top[0]], candidates: top.slice(0, 5) };
  return { sure: [], candidates: chosen.length ? [...chosen, ...top.filter((r) => !chosen.includes(r))].slice(0, 5) : top.slice(0, 5), question: pick?.question || "Which screen is this journey about?" };
}
