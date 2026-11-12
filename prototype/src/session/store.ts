/**
 * THE GUIDED TESTING SESSION — one object that walks the tester's order and remembers every answer.
 *
 *   environment → requirement → sanity → cases → review → run
 *
 * A session is a file (data/sessions/<id>.json), written after every step, so it survives a restart
 * and can be resumed from the list. Earlier steps can be reopened; the steps after a reopened one are
 * kept (nothing is thrown away by looking back) and are marked stale when the earlier answer changed.
 *
 * This module holds the object, the step order and the file store only. Each step's work lives in its
 * own module (environment.ts, …); the routes (routes/session.ts) are the contract the frontend builds on
 * (docs/Guided_Testing_Session_Plan_2026-11-12.md §4).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SESSIONS_DIR = join(here, "..", "..", "data", "sessions");

export const STEPS = ["environment", "requirement", "sanity", "cases", "review", "run"] as const;
export type Step = (typeof STEPS)[number];

/** What the environment step found — saved on the session and, as a profile, for reuse. */
export interface EnvironmentSnapshot {
  /** when it was taken */
  at: string;
  /** who the platform acts as (role and a masked e-mail), when it signed in */
  actor?: { role?: string; email?: string };
  /** company settings read from the dashboard configuration (count), and from the settings catalogue (UAT only) */
  settings: { flags: number; catalogue?: number; hidden?: number; key: Record<string, unknown> };
  /** feature gates: how many features the company has on / off / unknown, and the off ones with the reason */
  gates?: { on: number; off: number; unknown: number; offList: Array<{ feature: string; why: string }> };
  /** the QA test vendors the platform may invite on this company */
  vendors?: { count: number; names: string[]; note?: string };
  /** what could not be read, in plain words */
  notes: string[];
}

export interface EnvironmentProfile {
  id: string;
  label: string;
  /** "uat" — a company on Procol's UAT (sign-in from its live console session); "token" — an account on its own
   *  deployment with a static token; "custom" — a host the platform did not know, given its API root and token var */
  kind: "uat" | "token" | "custom";
  url: string;
  apiBaseUrl?: string;
  companyId: number;
  companyName?: string;
  signIn: "otp" | "token" | "console";
  /** the .env variable that holds the token (never the token itself) */
  tokenVar?: string;
  snapshotAt: string;
  snapshot: EnvironmentSnapshot;
}

export interface Session {
  id: string;
  name: string;
  step: Step;
  createdAt: string;
  updatedAt: string;
  /** steps whose answers no longer match an earlier step that was reopened and changed */
  stale: Step[];
  env?: {
    profileId: string;
    url: string;
    companyId: number;
    companyName?: string;
    signIn: EnvironmentProfile["signIn"];
    kind: EnvironmentProfile["kind"];
    snapshot: EnvironmentSnapshot;
    /** the last attempt that did not finish, in plain words */
    error?: string;
  };
  intake?: Record<string, unknown>;
  understanding?: Record<string, unknown>;
  sanity?: Record<string, unknown>;
  generation?: Record<string, unknown>;
  review?: Record<string, unknown>;
  execution?: Record<string, unknown>;
}

const file = (id: string) => join(SESSIONS_DIR, `${id}.json`);
const SAFE_ID = /^s-[a-z0-9]{6,20}$/;

export function newSessionId(): string {
  return `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createSession(name?: string): Session {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const now = new Date().toISOString();
  const s: Session = { id: newSessionId(), name: (name ?? "").trim() || `Session ${now.slice(0, 16).replace("T", " ")}`, step: "environment", createdAt: now, updatedAt: now, stale: [] };
  saveSession(s);
  return s;
}

export function loadSession(id: string): Session | null {
  if (!SAFE_ID.test(id) || !existsSync(file(id))) return null;
  try {
    return JSON.parse(readFileSync(file(id), "utf8")) as Session;
  } catch {
    return null;
  }
}

/** Written atomically: the frontend polls the list while a step is running. */
export function saveSession(s: Session): Session {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  s.updatedAt = new Date().toISOString();
  const tmp = `${file(s.id)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 1));
  renameSync(tmp, file(s.id));
  return s;
}

export function deleteSession(id: string): boolean {
  if (!SAFE_ID.test(id) || !existsSync(file(id))) return false;
  unlinkSync(file(id));
  return true;
}

export function listSessions(): Array<Pick<Session, "id" | "name" | "step" | "createdAt" | "updatedAt" | "stale"> & { env?: string; feature?: string }> {
  if (!existsSync(SESSIONS_DIR)) return [];
  const out = [];
  for (const f of readdirSync(SESSIONS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const s = loadSession(f.replace(/\.json$/, ""));
    if (!s) continue;
    out.push({
      id: s.id, name: s.name, step: s.step, createdAt: s.createdAt, updatedAt: s.updatedAt, stale: s.stale ?? [],
      ...(s.env ? { env: `${s.env.companyName ?? s.env.companyId} · ${s.env.kind}` } : {}),
      ...(typeof (s.intake as any)?.prd?.title === "string" ? { feature: String((s.intake as any).prd.title) } : {}),
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Change a session SAFELY: a long step (a sanity run of twenty minutes) must not save the stale copy it
 * loaded at its start over what other requests saved meanwhile (12 Nov: a sanity run's final save wiped
 * the approval and the generation made while it ran). So every change loads the file afresh, applies the
 * mutation, saves, and copies the result back into the caller's object.
 */
export function updateSession(s: Session, mutate: (fresh: Session) => void): Session {
  const fresh = loadSession(s.id) ?? s;
  mutate(fresh);
  saveSession(fresh);
  Object.assign(s, fresh);
  return s;
}

/** Move to the next step after `done`; never skips a step. */
export function advance(s: Session, done: Step): Session {
  return updateSession(s, (f) => {
    const i = STEPS.indexOf(done);
    const next = STEPS[Math.min(i + 1, STEPS.length - 1)];
    if (STEPS.indexOf(next) > STEPS.indexOf(f.step)) f.step = next;
    f.stale = (f.stale ?? []).filter((x) => x !== done);
  });
}

/**
 * Reopen an earlier step: the session shows that step again; what came after is kept but marked stale,
 * so the user sees "this was answered before the environment changed" instead of a silent mismatch.
 */
export function reopen(s: Session, step: Step): Session {
  const i = STEPS.indexOf(step);
  if (i < 0) return s;
  return updateSession(s, (f) => {
    const after = STEPS.slice(i + 1).filter((x) => STEPS.indexOf(x) <= STEPS.indexOf(f.step));
    f.stale = [...new Set([...(f.stale ?? []), ...after])];
    f.step = step;
  });
}

/** Only this much of a session goes over the wire for the list; the whole object for the page. */
export function publicSession(s: Session): Session {
  return s;
}
