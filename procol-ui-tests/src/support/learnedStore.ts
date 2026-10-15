import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WHAT A RUN LEARNED, KEPT FOR THE NEXT ONE — the feedback loop.
 *
 * A run that had to ask, look something up, or try twice should not have to
 * do it again. Two things are kept here, per client, next to the healer's
 * learned locators and the explorer's saved routes:
 *
 *   vendor logins — a vendor on an event and the email it signed in to the
 *     vendor portal with (found in the Vendors module, or typed by the tester).
 *     The next bid as that vendor signs in without asking. A login that failed
 *     is kept as failed, so it is not tried again.
 *   answers — what the tester answered to a question the explorer asked on a
 *     screen. The same question on the same screen is answered from here next
 *     time, and the run says it used the earlier answer.
 *
 * It holds vendor emails, so it stays out of git (procol-ui-tests/.gitignore).
 */

const FILE = join(process.cwd(), "learned", "learned.json");

interface VendorLogin {
  name: string;
  email: string;
  /** "vendors-module" | "tester" | "database" */
  source: string;
  at: string;
  ok: boolean;
  why?: string;
}

interface Answer {
  question: string;
  path: string;
  option: string | null;
  text: string;
  at: string;
  used?: number;
}

interface Store {
  vendors: Record<string, VendorLogin[]>;
  answers: Record<string, Record<string, Answer>>;
}

function load(): Store {
  try {
    if (existsSync(FILE)) {
      const s = JSON.parse(readFileSync(FILE, "utf8"));
      return { vendors: s.vendors ?? {}, answers: s.answers ?? {} };
    }
  } catch {
    /* a broken file is a fresh start, never a broken run */
  }
  return { vendors: {}, answers: {} };
}

function save(s: Store): void {
  try {
    mkdirSync(join(process.cwd(), "learned"), { recursive: true });
    writeFileSync(FILE, JSON.stringify(s, null, 2));
  } catch {
    /* learning is a bonus; a run never fails over it */
  }
}

const key = (companyId: number | null | undefined) => String(companyId ?? process.env.COMPANY_ID ?? "any");
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Vendor logins that worked before for this client. */
export function learnedVendorLogins(companyId?: number | null): VendorLogin[] {
  return (load().vendors[key(companyId)] ?? []).filter((v) => v.ok);
}

/** Emails that failed to sign in before, so they are not tried again. */
export function failedVendorEmails(companyId?: number | null): Set<string> {
  return new Set((load().vendors[key(companyId)] ?? []).filter((v) => !v.ok).map((v) => v.email.toLowerCase()));
}

/** Keep a vendor's login: it worked (ok) or it did not (with why). */
export function learnVendorLogin(companyId: number | null | undefined, v: { name: string; email: string; source: string; ok: boolean; why?: string }): void {
  const s = load();
  const k = key(companyId);
  const list = (s.vendors[k] ??= []);
  const at = list.findIndex((x) => x.email.toLowerCase() === v.email.toLowerCase());
  const rec: VendorLogin = { name: v.name, email: v.email, source: v.source, ok: v.ok, why: v.why, at: new Date().toISOString() };
  if (at >= 0) list[at] = rec;
  else list.push(rec);
  save(s);
}

/** The tester's earlier answer to this question on this screen, if there is one. */
export function earlierAnswer(companyId: number | null | undefined, path: string, question: string): Answer | null {
  return load().answers[key(companyId)]?.[`${path}|${norm(question)}`] ?? null;
}

/** Keep the tester's answer, so the same question on the same screen is not asked again. */
export function learnAnswer(companyId: number | null | undefined, path: string, question: string, a: { option: string | null; text: string }): void {
  const s = load();
  const book = (s.answers[key(companyId)] ??= {});
  book[`${path}|${norm(question)}`] = { question, path, option: a.option, text: a.text, at: new Date().toISOString() };
  save(s);
}

/** An earlier answer that did not help: forget it, so the tester is asked again. */
export function forgetAnswer(companyId: number | null | undefined, path: string, question: string): void {
  const s = load();
  const book = s.answers[key(companyId)];
  if (book) delete book[`${path}|${norm(question)}`];
  save(s);
}
