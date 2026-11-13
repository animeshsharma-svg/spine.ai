/**
 * STEP 0 — WHICH ENVIRONMENT, AND WHAT IS IT LIKE.
 *
 * The user gives a URL (and a company when the host serves many). The platform then, in this order and
 * saying each one aloud as a line the page shows:
 *
 *   1. reach    — can the host be reached at all (DNS, TLS, an HTTP answer of any kind)
 *   2. signin   — act as the buyer: a UAT company from its live console session (the OTP rule the
 *                 platform already knows), an account on its own deployment from its token, or a custom
 *                 host from an API root + the .env variable holding its token
 *   3. settings — the company's configuration flags, the settings catalogue (UAT only: how many, how
 *                 many hidden) and the handful of settings that decide most sourcing cases
 *   4. gates    — which features the company has on / off, with the reason for each off one
 *   5. vendors  — the QA test vendors the platform may invite (never a real supplier)
 *
 * What it finds is the environment SNAPSHOT: saved on the session and as a PROFILE the user can reuse
 * next time (data/env-profiles.json). Nothing here changes anything on the environment.
 *
 * A failure is said in plain words and the session stays on this step — "the OTP rule for this company
 * is unknown" is an answer the user can act on; a stack trace is not.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKEN_CLIENTS, isTokenClient, tokenClient } from "../../config/tokenClients.js";
import { readEnvVar } from "../tokenClient.js";
import { FEATURES } from "../../config/featureTree.js";
import { advance, updateSession, type EnvironmentProfile, type EnvironmentSnapshot, type Session } from "./store.js";
import { askAndWait } from "./questions.js";

const here = dirname(fileURLToPath(import.meta.url));
const PROFILES = join(here, "..", "..", "data", "env-profiles.json");

export type EnvEvent =
  | { type: "reach"; line: string; ok: boolean }
  | { type: "signin"; line: string; ok: boolean }
  | { type: "settings"; line: string; ok: boolean }
  | { type: "gates"; line: string; ok: boolean }
  | { type: "vendors"; line: string; ok: boolean }
  | { type: "line"; line: string }
  | { type: "done"; profile: EnvironmentProfile }
  | { type: "error"; why: string };

export interface EnvInput {
  url: string;
  companyId?: number;
  signIn?: "otp" | "token" | "console";
  /** custom host: its API root (…/api) and the .env variable holding the token */
  apiBaseUrl?: string;
  tokenVar?: string;
  headerName?: string;
  label?: string;
}

/** The UAT companies the dashboard already offers; any other company id on UAT is also accepted (the database names it). */
export const UAT_COMPANIES = [
  { id: 198678, name: "PROCOL DEMO", note: "best all-round · fresh session" },
  { id: 32461, name: "Demo Account 2", note: "BOQ on" },
  { id: 39490, name: "M/s Moon Beverages", note: "workspace client · BOQ off" },
  { id: 57675, name: "Decathlon", note: "users in sub-companies" },
];
/** hosts that belong to Procol's UAT: the buyer console, the vendor portal, the API, the support console */
const UAT_HOSTS = /(^|\.)(cpanel|quotes|sec-api|sec-api-v1|console)\.ag-ri\.in$/i;
/** the settings that decide most sourcing cases — read and shown on the card */
const KEY_SETTINGS = ["default_event_type", "rfx_project_enabled", "lock_vendors_addition_in_event_creation", "enable_bid_masking_for_event", "is_partial_awarding_enabled", "boq_in_erfx_allowed", "counter_offer_modification_enabled", "enable_select_all_items_for_awarding"];

const mask = (email?: string | null) => (email ? email.replace(/^(.{2})[^@]*(@.*)$/, "$1…$2") : undefined);

/** What the URL points at, before anything is called. */
export function describeUrl(raw: string): { ok: true; url: URL; kind: "uat" | "token" | "custom"; tokenClientId?: number; what: string } | { ok: false; why: string } {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { ok: false, why: `"${raw}" is not a URL. Give the host of the environment, for example https://cpanel.ag-ri.in or the API root of a deployment.` };
  }
  if (UAT_HOSTS.test(url.hostname)) return { ok: true, url, kind: "uat", what: `Procol's UAT (${url.hostname}) — companies are signed into from their live console session` };
  const tc = TOKEN_CLIENTS.find((c) => { try { return new URL(c.apiBaseUrl).hostname === url.hostname; } catch { return false; } });
  if (tc) return { ok: true, url, kind: "token", tokenClientId: tc.id, what: `${tc.name} — an account on its own deployment (${url.hostname}), signed in with its API token` };
  return { ok: true, url, kind: "custom", what: `${url.hostname} is not an environment the platform knows: give its API root (…/api) and the name of the .env variable that holds a token for it` };
}

/** The accounts a host offers: UAT companies, plus the token-client accounts whose API lives on that host. */
export function companiesFor(hostname: string, kind: "uat" | "token" | "custom"): Array<{ id: number; name: string; note: string; signIn: "otp" | "token" }> {
  const onHost = TOKEN_CLIENTS.filter((c) => !c.hidden && (() => { try { return new URL(c.apiBaseUrl).hostname === hostname; } catch { return false; } })()).map((c) => ({ id: c.id, name: c.name, note: `${c.note} · signs in with its API token`, signIn: "token" as const }));
  if (kind === "uat") return [...UAT_COMPANIES.map((c) => ({ ...c, signIn: "otp" as const })), ...onHost];
  return onHost;
}

export function listProfiles(): EnvironmentProfile[] {
  if (!existsSync(PROFILES)) return [];
  try {
    return JSON.parse(readFileSync(PROFILES, "utf8")) as EnvironmentProfile[];
  } catch {
    return [];
  }
}

function saveProfile(p: EnvironmentProfile): void {
  mkdirSync(dirname(PROFILES), { recursive: true });
  const all = listProfiles().filter((x) => x.id !== p.id);
  all.unshift(p);
  const tmp = `${PROFILES}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(all.slice(0, 50), null, 1));
  renameSync(tmp, PROFILES);
}

const profileId = (kind: string, host: string, companyId: number) => `env-${kind}-${host.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${companyId}`;

async function reach(url: URL): Promise<{ ok: boolean; line: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url.origin, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return { ok: true, line: `${url.hostname} answers (HTTP ${res.status} in ${Date.now() - t0} ms).` };
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    const why = /ENOTFOUND|getaddrinfo/.test(m) ? "the host name does not resolve (DNS)" : /timeout|aborted/i.test(m) ? "no answer within 10 seconds" : /certificate|CERT|SSL|TLS/i.test(m) ? `its certificate is not trusted (${m.slice(0, 80)})` : m.slice(0, 120);
    return { ok: false, line: `${url.hostname} cannot be reached: ${why}.` };
  }
}

/**
 * Run the step. Emits one event per stage; on success the session moves to "requirement" and the profile
 * is saved. On a failure the session keeps the stage lines and the error, and stays on "environment".
 */
export async function runEnvironmentStep(s: Session, input: EnvInput, emit: (e: EnvEvent) => void): Promise<Session> {
  const notes: string[] = [];
  const say = (type: EnvEvent["type"] & ("reach" | "signin" | "settings" | "gates" | "vendors"), line: string, ok = true) => emit({ type, line, ok } as EnvEvent);
  const fail = (why: string): Session => {
    updateSession(s, (f) => { f.env = { ...(f.env ?? { profileId: "", url: input.url, companyId: input.companyId ?? 0, signIn: input.signIn ?? "otp", kind: "uat", snapshot: { at: new Date().toISOString(), settings: { flags: 0, key: {} }, notes } }), error: why }; });
    emit({ type: "error", why });
    return s;
  };

  const d = describeUrl(input.url);
  if (!d.ok) return fail(d.why);
  emit({ type: "line", line: d.what });

  // 1 · reach
  const r = await reach(d.url);
  say("reach", r.line, r.ok);
  if (!r.ok) return fail(r.line);

  // 2 · sign in
  let client: any = null;
  let companyId = input.companyId ?? 0;
  let companyName: string | undefined;
  let kind = d.kind;
  let signIn: EnvironmentProfile["signIn"] = input.signIn ?? (d.kind === "uat" ? "otp" : "token");
  let apiBaseUrl: string | undefined;
  let tokenVar: string | undefined;
  const actor: EnvironmentSnapshot["actor"] = {};
  try {
    if (d.kind === "uat") {
      if (!companyId) {
        // the platform asks which company, on screen, and waits up to ten minutes (the suggestion is PROCOL DEMO)
        const a = await askAndWait(s, {
          step: "environment", source: "company", kind: "one",
          text: "This address is Procol's UAT, which hosts many companies. Which one should I test?",
          why: "Settings are switched only on PROCOL DEMO; on the other companies I test things as they are set.",
          options: UAT_COMPANIES.map((c) => ({ value: String(c.id), label: c.name, means: c.note })),
          suggested: "198678",
        }, 10 * 60_000);
        if (a.answer === null) return fail("The step was cancelled before a company was chosen.");
        const byName = UAT_COMPANIES.find((c) => c.name.toLowerCase() === a.answer!.trim().toLowerCase())?.id;
        const picked = Number(a.answer) || byName || 0;
        if (!picked) return fail(`I couldn't read “${a.answer}” as a company: give its id (for example 198678) or its name as the list shows it.`);
        companyId = picked;
        emit({ type: "line", line: `Testing on ${UAT_COMPANIES.find((c) => c.id === picked)?.name ?? `company ${picked}`}${a.how === "deadline" ? " (no answer by the deadline, so the suggestion)" : ", as you chose"}.` });
      }
      if (isTokenClient(companyId)) {
        // an account that lives on this host with its own static token (the sandbox P2P flow, the "test" account)
        kind = "token";
        signIn = "token";
        const tc = tokenClient(companyId)!;
        apiBaseUrl = tc.apiBaseUrl;
        tokenVar = tc.tokenVar;
        const { openTokenClient } = await import("../tokenClient.js");
        client = await withTimeout(openTokenClient(companyId), 60_000, "checking the token");
        companyName = client.companyName;
        say("signin", `${tc.name}: its API token (${tc.tokenVar} in the API suite's .env) is accepted; the dashboard configuration was read.`);
      } else {
      const { openClientContext } = await import("../executor.js");
      client = await withTimeout(openClientContext(companyId), 120_000, "signing in as the buyer");
      companyName = client.companyName ?? undefined;
      const cfg = client.config;
      actor.role = cfg?.actorRole ?? cfg?.raw?.user?.role ?? cfg?.raw?.role;
      actor.email = mask(cfg?.actorEmail ?? cfg?.raw?.user?.email ?? cfg?.raw?.email);
      if (client.ctx?.noQaVendor) notes.push(String(client.ctx.noQaVendor));
      say("signin", `Signed in as the buyer of ${companyName ?? companyId}${actor.role ? ` (role ${actor.role})` : ""} from the company's live console session — the OTP rule the platform already knows for this company.`);
      }
    } else if (d.kind === "token") {
      companyId = d.tokenClientId!;
      const tc = tokenClient(companyId)!;
      apiBaseUrl = tc.apiBaseUrl;
      tokenVar = tc.tokenVar;
      signIn = "token";
      const { openTokenClient } = await import("../tokenClient.js");
      client = await withTimeout(openTokenClient(companyId), 60_000, "checking the token");
      companyName = client.companyName;
      say("signin", `${tc.name}: its API token (${tc.tokenVar} in the API suite's .env) is accepted; the dashboard configuration was read.`);
    } else {
      kind = "custom";
      signIn = "token";
      apiBaseUrl = (input.apiBaseUrl ?? "").trim().replace(/\/$/, "");
      tokenVar = (input.tokenVar ?? "").trim();
      if (!apiBaseUrl || !tokenVar) return fail(`${d.url.hostname} is not an environment the platform knows. Give its API root (for example https://${d.url.hostname}/api) and the name of the .env variable that holds a token for it; the token itself is never stored.`);
      const probe = { id: 0, name: input.label ?? d.url.hostname, note: "", apiBaseUrl, headerName: input.headerName ?? "Authorization", tokenFiles: ["../procol test/.env", "../.env", ".env"], tokenVar, covers: [] } as any;
      const token = readEnvVar(probe, tokenVar);
      if (!token) return fail(`${tokenVar} is not set in the API suite's .env (or the repository's .env). Put the token there under that name and try again; it is never written anywhere else.`);
      const res = await fetch(`${apiBaseUrl}/v1/dashboard_configuration`, { headers: { [probe.headerName]: /^Authorization$/i.test(probe.headerName) && !/^Bearer /i.test(token) ? `Bearer ${token}` : token, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 401 || res.status === 403) return fail(`${d.url.hostname} refused the token in ${tokenVar} (HTTP ${res.status}). Put a fresh token under that name and try again.`);
      if (!res.ok) return fail(`${apiBaseUrl}/v1/dashboard_configuration answered HTTP ${res.status}; that is not a Procol API root the platform can read.`);
      const raw: any = await res.json().catch(() => ({}));
      companyId = Number(raw?.company?.id ?? raw?.company_id ?? 0) || 0;
      companyName = raw?.company?.name ?? raw?.company_name ?? input.label ?? d.url.hostname;
      client = { config: { raw, flags: raw?.configurations?.global_config ?? {} }, companyName, dispose: async () => {} };
      say("signin", `${companyName}: the token in ${tokenVar} is accepted on ${d.url.hostname}; the dashboard configuration was read.`);
    }
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    const why = /no (live )?console session|no session/i.test(m)
      ? `No live console session for company ${companyId} on UAT: sign in once on the console as this company's buyer (the platform reuses that session), then try again.`
      : /uat_login_otp|otp/i.test(m)
        ? `The sign-in rule (OTP) for company ${companyId} is unknown to the platform: ${m.slice(0, 160)}`
        : `Could not sign in: ${m.slice(0, 200)}`;
    say("signin", why, false);
    return fail(why);
  }

  try {
    // 3 · settings
    const snapshot: EnvironmentSnapshot = { at: new Date().toISOString(), actor, settings: { flags: 0, key: {} }, notes };
    let flags: Record<string, unknown> = {};
    if (kind === "uat") {
      const { loadCompanyConfig } = await import("../checks/companyConfig.js");
      const cfg = await withTimeout(loadCompanyConfig(client, companyId), 60_000, "reading the company's configuration");
      flags = cfg.flags ?? {};
      if (!cfg.loaded && cfg.error) notes.push(`configuration: ${cfg.error}`);
      if (!actor.role && cfg.actorRole) actor.role = cfg.actorRole;
      if (!actor.email && cfg.actorEmail) actor.email = mask(cfg.actorEmail);
    } else {
      flags = client.config?.flags ?? client.config?.raw?.configurations?.global_config ?? {};
    }
    snapshot.settings.flags = Object.keys(flags).length;
    for (const k of KEY_SETTINGS) if (k in flags) snapshot.settings.key[k] = flags[k];
    if (kind === "uat") {
      try {
        const { settingsCatalog, currentValue } = await import("../checks/companySettings.js");
        const cat = await withTimeout(settingsCatalog(), 60_000, "reading the settings catalogue");
        snapshot.settings.catalogue = cat.length;
        snapshot.settings.hidden = cat.filter((x) => x.hidden).length;
        for (const k of KEY_SETTINGS) {
          if (k in snapshot.settings.key) continue;
          const v = await currentValue(companyId, k).catch(() => null);
          if (v && v.value !== undefined) snapshot.settings.key[k] = v.value;
        }
      } catch (e) {
        notes.push(`the settings catalogue could not be read from Procol's database: ${String((e as Error).message).slice(0, 120)}`);
      }
    } else {
      notes.push("the settings catalogue, the feature gates and the QA vendors are read from Procol's UAT database; this host has none, so only the dashboard configuration is shown");
    }
    const keyLine = Object.entries(snapshot.settings.key).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ");
    say("settings", `${snapshot.settings.flags} configuration flags read${snapshot.settings.catalogue ? `; the settings catalogue has ${snapshot.settings.catalogue} settings, ${snapshot.settings.hidden} of them hidden (only a Procol employee can switch those)` : ""}.${keyLine ? ` Key settings: ${keyLine}.` : ""}`);

    // 4 · gates
    if (kind === "uat") {
      try {
        const { featureGatesFor } = await import("../checks/featureGates.js");
        const gates = await withTimeout(featureGatesFor(companyId), 90_000, "reading the feature gates");
        if (gates) {
          const names = new Map(FEATURES.map((f) => [f.id, (f as any).name ?? (f as any).label ?? f.id]));
          let on = 0, off = 0, unknown = 0;
          const offList: Array<{ feature: string; why: string }> = [];
          for (const [id, g] of Object.entries(gates)) {
            if (g.on === true) on++;
            else if (g.on === false) { off++; offList.push({ feature: String(names.get(id) ?? id), why: (g.reasons ?? []).join("; ").slice(0, 160) || "a gate is off" }); }
            else unknown++;
          }
          snapshot.gates = { on, off, unknown, offList: offList.slice(0, 20) };
          say("gates", `Feature gates: ${on} on, ${off} off, ${unknown} unknown.${offList.length ? ` Off: ${offList.slice(0, 5).map((x) => x.feature).join(", ")}${offList.length > 5 ? ` and ${offList.length - 5} more` : ""}.` : ""}`);
        } else {
          say("gates", "Feature gates could not be read for this company (the gate resolver answered nothing).", false);
        }
      } catch (e) {
        say("gates", `Feature gates could not be read: ${String((e as Error).message).slice(0, 120)}.`, false);
      }
    }

    // 5 · vendors
    if (kind === "uat") {
      try {
        const mod = await import(join(here, "..", "..", "..", "procol-ui-tests", "src", "db", "qaVendors.ts"));
        const names: string[] = await withTimeout(mod.qaVendorNames(companyId), 30_000, "reading the QA vendors");
        snapshot.vendors = { count: names.length, names: names.slice(0, 10) };
        say("vendors", names.length ? `${names.length} QA test vendor(s) can be invited on this company: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}. A real supplier is never invited.` : "No QA test vendor is recorded for this company: cases that invite a vendor will say so instead of inviting a real supplier.", names.length > 0);
      } catch (e) {
        snapshot.vendors = { count: 0, names: [], note: String((e as Error).message).slice(0, 120) };
        say("vendors", `The QA vendors could not be read: ${String((e as Error).message).slice(0, 120)}.`, false);
      }
    }

    const profile: EnvironmentProfile = {
      id: profileId(kind, d.url.hostname, companyId),
      label: input.label?.trim() || `${companyName ?? companyId} · ${d.url.hostname}`,
      kind, url: d.url.origin, ...(apiBaseUrl ? { apiBaseUrl } : {}), companyId, companyName, signIn, ...(tokenVar ? { tokenVar } : {}),
      snapshotAt: snapshot.at, snapshot,
    };
    saveProfile(profile);
    updateSession(s, (f) => { f.env = { profileId: profile.id, url: profile.url, companyId, companyName, signIn, kind, snapshot }; });
    emit({ type: "done", profile });
    return advance(s, "environment");
  } catch (e) {
    return fail(`The environment could not be described: ${String((e as Error).message).slice(0, 200)}`);
  } finally {
    await client?.dispose?.().catch(() => {});
  }
}

/** Reuse a saved profile: the snapshot is reused as it was taken (the card says when). */
export function useProfile(s: Session, profileId: string): Session | null {
  const p = listProfiles().find((x) => x.id === profileId);
  if (!p) return null;
  updateSession(s, (f) => { f.env = { profileId: p.id, url: p.url, companyId: p.companyId, companyName: p.companyName, signIn: p.signIn, kind: p.kind, snapshot: p.snapshot }; });
  return advance(s, "environment");
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} did not finish within ${Math.round(ms / 1000)} s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
