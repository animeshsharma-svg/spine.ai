/**
 * API RESULTS IN PLAIN WORDS — what was sent, what came back, and whether each check held, written so a
 * tester who has never read an HTTP log understands it in one read. Used by the sheet runner's report and
 * anywhere an API case's outcome is shown to a person.
 */
import type { PlanRunResult, PlanStepResult } from "./apiPlanRunner.js";

const STATUS: Record<number, string> = {
  200: "OK — the request worked",
  201: "Created — the record was made",
  202: "Accepted — the app will finish it in the background",
  204: "Done — nothing to send back",
  400: "Bad request — the app could not read what was sent (a field is missing or has the wrong form)",
  401: "Not signed in — the login token is missing or has expired",
  403: "Forbidden — this user is not allowed to do this",
  404: "Not found — the record does not exist, or this user cannot see it",
  405: "Not allowed — this kind of request is not supported here",
  409: "Conflict — the record changed or already exists",
  413: "Too large — what was sent is bigger than the app accepts",
  422: "Refused by a rule — the app understood the request, but a product rule said no",
  429: "Too many requests — the app asked us to slow down",
  500: "Server error — the app crashed while handling the request (always a bug)",
  502: "Bad gateway — the server behind the app did not answer properly",
  503: "Unavailable — the app is down or overloaded",
  504: "Timed out — the app took too long to answer",
};

/** "422 — Refused by a rule — …" */
export function statusInWords(code?: number | null): string {
  if (!code) return "no answer came back (the request did not reach the app or it timed out)";
  const s = STATUS[code] ?? (code < 300 ? "success" : code < 400 ? "redirected elsewhere" : code < 500 ? "refused by the app" : "server error — the app failed (a bug)");
  return `${code} — ${s}`;
}

export function isServerError(code?: number | null): boolean {
  return !!code && code >= 500;
}

const ACT: Record<string, string> = { GET: "Read", POST: "Create / send", PUT: "Replace", PATCH: "Change", DELETE: "Delete" };
const strip = (p: string) => p.replace(/\?.*$/, "").replace(/\{\{(\w+)\}\}/g, (_m, k) => `<${k.replace(/Uuid$/, "").replace(/([A-Z])/g, " $1").toLowerCase().trim()}>`);

export interface HumanApiStep {
  /** "Step 3 — the vendor submits the bid" */
  title: string;
  sent: string;
  cameBack: string;
  /** the app's own message, in quotes, when it refused */
  appSaid?: string;
  checks: Array<{ text: string; ok: boolean | null; actual?: string }>;
  verdict: "passed" | "failed" | "couldn't tell" | "not run" | "done";
  serverError: boolean;
}

/** The runner's own check wording, said for a person ("$ is a array" → "the whole reply is a list"). */
export function plainCheck(t: string): string {
  return String(t ?? "")
    .replace(/the read answers HTTP (\d{3})/g, (_m, c) => `the reply's status code is ${statusInWords(Number(c))}`)
    .replace(/(^|[\s;:“"])\$(?=[\s”"])/g, "$1the whole reply")
    .replace(/\bis a array\b/g, "is a list")
    .replace(/\bis a string\b/g, "is text")
    .replace(/\bis a object\b/g, "is a group of fields")
    .replace(/\bis a boolean\b/g, "is a yes/no value")
    .replace(/\bgot object\b/g, "but it is a group of fields")
    .replace(/\bgot array\b/g, "but it is a list")
    .replace(/\bgot string\b/g, "but it is text")
    .replace(/\{\{(\w+)\}\}/g, (_m, k) => `the ${k.replace(/Uuid$/, "").replace(/([A-Z])/g, " $1").toLowerCase().trim()}`);
}

export function stepInWords(s: PlanStepResult): HumanApiStep {
  const who = s.actor && s.actor !== "platform" ? `the ${s.actor}` : "the platform";
  const sent = s.call ? `${ACT[s.call.method] ?? s.call.method} — ${s.call.method} ${strip(s.call.path)} as ${who}${s.call.body ? " (with the details the step needs)" : ""}` : `${who} — no request (a waiting or setup step)`;
  const checks: HumanApiStep["checks"] = [];
  if (s.expected && !(s.assertions ?? []).length) checks.push({ text: `Expected: ${plainCheck(s.expected)}`, ok: s.verdict === "passed" || s.verdict === "done" ? true : s.verdict === "failed" ? false : null, actual: plainCheck(s.actual) });
  for (const a of s.assertions ?? []) checks.push({ text: plainCheck(a.say), ok: a.pass, actual: plainCheck(a.actual) });
  return {
    title: `Step ${s.n} — ${plainCheck(s.title)}`,
    sent,
    cameBack: s.status ? statusInWords(s.status) : s.call ? statusInWords(null) : "—",
    appSaid: s.message ? `“${s.message}”${s.code ? ` (error code ${s.code})` : ""}` : undefined,
    checks,
    verdict: s.verdict,
    serverError: isServerError(s.status),
  };
}

/** The whole API case: verdict sentence, the decisive step, and every step in words. */
export function apiResultInWords(r: PlanRunResult): { verdict: string; summary: string; steps: HumanApiStep[]; serverErrors: number; failedChecks: string[] } {
  const steps = [...r.steps].map(stepInWords);
  const serverErrors = steps.filter((s) => s.serverError).length;
  const failedChecks = steps.flatMap((s) => s.checks.filter((c) => c.ok === false).map((c) => `${s.title}: ${c.text}${c.actual ? ` — it was ${c.actual}` : ""}`));
  const verdict = r.verdict === "passed" ? "Pass" : r.verdict === "failed" ? "Fail" : r.verdict === "not run" ? "Not run" : "Couldn't tell";
  const decisive = r.steps.find((s) => s.decisive) ?? [...r.steps].reverse().find((s) => s.phase === "act");
  const summary =
    r.verdict === "passed"
      ? `Every request answered as the case expects${decisive?.status ? ` (the key step answered ${statusInWords(decisive.status)})` : ""}, and every check on the replies held.`
      : r.verdict === "failed"
        ? `${failedChecks.length ? `${failedChecks.length} check${failedChecks.length === 1 ? "" : "s"} did not hold. ` : ""}${decisive?.status ? `The key step answered ${statusInWords(decisive.status)}${decisive.message ? `: “${decisive.message}”` : ""}. ` : ""}${r.reason}`
        : r.reason;
  return { verdict, summary: plainCheck(summary), steps, serverErrors, failedChecks };
}

/** Advice for the API compiler so every API case checks status, shape and values. */
export const API_CHECK_GUIDE =
  "For every request also check: the status code is the one this case expects; the reply has the fields the screen needs, each of the right type (text, number, list, id); and the values in the reply equal what was sent or what the rule says. Procol's replies usually wrap a list in a field (often \"data\"): check that field, never the whole reply, for a list.";

/**
 * A failed shape check that only looked in the wrong place: "the whole reply is a list" when the reply
 * is a group of fields holding a list (usually under "data"). It says nothing about the product.
 */
export function wrongPlaceOnly(failedChecks: string[]): boolean {
  return failedChecks.length > 0 && failedChecks.every((c) => /(the whole reply|\$) is a (list|array)/.test(c) && /group of fields|object|\{"data":\[/.test(c));
}
