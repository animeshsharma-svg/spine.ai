/**
 * STEP 1a — THE REQUIREMENT, AS GIVEN: the PRD, the design, anything else.
 *
 * Accepts, in one JSON body (files as base64, the way the dashboard already uploads sheets):
 *   prd     {text} | {name, data}        pasted text, or a .md / .txt / .docx / .pdf file
 *   notion  {url}                        a Notion page — the platform has no Notion credential of its own,
 *                                        so it says to paste the page or export it as Markdown (honest, not silent)
 *   figma   {url, token?}                a Figma file link; read through Figma's REST API with a personal token
 *                                        (FIGMA_TOKEN in .env, or given once here and never stored)
 *   frames  [{name, data}]               exported design frames (PNG/JPG) when there is no token
 *   sheet   {name, data}                 an existing test-case sheet (.xlsx / .csv) — imported as a sheet
 *
 * Everything read is kept with the session (data/sessions/<id>-files/) and summarised in session.intake:
 * what kind of input, how long, how many frames and labels. The understanding (understanding.ts) reads
 * the PRD text and the design labels from there.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importSheetBuffer } from "../checks/sheetCases.js";
import { saveSession, SESSIONS_DIR, type Session } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(here, "..", "..", "scripts", "extract-text.py");

export interface IntakeInput {
  prd?: { text?: string; name?: string; data?: string };
  notion?: { url?: string };
  figma?: { url?: string; token?: string };
  frames?: Array<{ name: string; data: string }>;
  sheet?: { name: string; data: string };
}

export type IntakeEvent =
  | { type: "line"; line: string }
  | { type: "parsed"; what: "prd" | "notion" | "figma" | "frames" | "sheet"; line: string; ok: boolean; detail?: Record<string, unknown> }
  | { type: "error"; why: string };

export interface FigmaFrame {
  id: string;
  name: string;
  page: string;
  labels: string[];
  components: string[];
}

export interface IntakeSummary {
  prd?: { kind: "text" | "md" | "docx" | "pdf"; title: string; chars: number; file: string };
  notion?: { url: string; read: false; note: string };
  figma?: { file: string; url: string; frames: number; labels: number; note?: string };
  frames?: { count: number; files: string[]; note: string };
  sheet?: { id: string; name: string; count: number };
  notes: string[];
}

const filesDir = (s: Session) => join(SESSIONS_DIR, `${s.id}-files`);
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "file";
const titleOf = (text: string) => (text.match(/^\s*#\s+(.+)$/m)?.[1] ?? text.split(/\n/).map((l) => l.trim()).find((l) => l.length > 3) ?? "Untitled requirement").slice(0, 120);

/** The text of a PRD given as text or as a file; the file is kept beside the session. */
export function readPrd(s: Session, prd: NonNullable<IntakeInput["prd"]>): { text: string; kind: "text" | "md" | "docx" | "pdf"; file: string } {
  mkdirSync(filesDir(s), { recursive: true });
  if (prd.text && prd.text.trim()) {
    const file = join(filesDir(s), "prd.md");
    writeFileSync(file, prd.text);
    return { text: prd.text, kind: "text" as const, file };
  }
  if (!prd.name || !prd.data) throw new Error("Give the PRD as text, or as a .md, .txt, .docx or .pdf file.");
  const ext = extname(prd.name).toLowerCase();
  const file = join(filesDir(s), `prd-${safeName(prd.name)}`);
  writeFileSync(file, Buffer.from(prd.data, "base64"));
  if (ext === ".md" || ext === ".txt" || ext === ".markdown") return { text: Buffer.from(prd.data, "base64").toString("utf8"), kind: "md" as const, file };
  if (ext === ".docx" || ext === ".pdf") {
    // python-docx / pypdf, run isolated (-I) on the uploaded file: the file is data, never code
    const text = execFileSync("python3", ["-I", EXTRACT, file], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
    if (!text.trim()) throw new Error(`${prd.name} has no readable text (a scanned PDF needs OCR; a .docx with only images has nothing to read).`);
    return { text, kind: ext === ".pdf" ? ("pdf" as const) : ("docx" as const), file };
  }
  throw new Error(`${prd.name}: the PRD must be .md, .txt, .docx or .pdf (or pasted as text).`);
}

const FIGMA_KEY = /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/;

/** Frames, their text labels and component names, from Figma's REST API. */
export async function readFigma(url: string, token: string | undefined, say: (l: string) => void): Promise<{ file: string; frames: FigmaFrame[] }> {
  const key = url.match(FIGMA_KEY)?.[1];
  if (!key) throw new Error(`"${url}" is not a Figma file link (expected https://www.figma.com/design/<key>/… or /file/<key>/…).`);
  const tok = (token ?? process.env.FIGMA_TOKEN ?? "").trim();
  if (!tok) throw new Error("Reading a Figma file needs a personal access token: put it in .env as FIGMA_TOKEN, or give it once here (it is used for this read and not stored). Without one, export the frames as PNG and upload them.");
  const headers = { "X-Figma-Token": tok };
  const top = await fetch(`https://api.figma.com/v1/files/${key}?depth=2`, { headers, signal: AbortSignal.timeout(60_000) });
  if (top.status === 403 || top.status === 401) throw new Error("Figma refused the token (HTTP " + top.status + "): it is not valid or has no access to this file.");
  if (!top.ok) throw new Error(`Figma answered HTTP ${top.status} for file ${key}.`);
  const doc: any = await top.json();
  const pages: any[] = doc?.document?.children ?? [];
  const frameRefs: Array<{ id: string; name: string; page: string }> = [];
  for (const p of pages) for (const n of p.children ?? []) if (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "SECTION") frameRefs.push({ id: n.id, name: n.name, page: p.name });
  say(`Figma file "${doc?.name ?? key}": ${pages.length} page(s), ${frameRefs.length} top-level frame(s).`);
  const frames: FigmaFrame[] = [];
  // the text and component names of each frame, 20 frames per request
  for (let i = 0; i < frameRefs.length && i < 200; i += 20) {
    const batch = frameRefs.slice(i, i + 20);
    const res = await fetch(`https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(batch.map((b) => b.id).join(","))}`, { headers, signal: AbortSignal.timeout(90_000) });
    if (!res.ok) { say(`Figma answered HTTP ${res.status} for ${batch.length} frame(s); they are skipped.`); continue; }
    const j: any = await res.json();
    for (const b of batch) {
      const node = j?.nodes?.[b.id]?.document;
      if (!node) continue;
      const labels = new Set<string>();
      const components = new Set<string>();
      const walk = (n: any) => {
        if (!n) return;
        if (n.type === "TEXT" && typeof n.characters === "string") { const t = n.characters.replace(/\s+/g, " ").trim(); if (t && t.length <= 80) labels.add(t); }
        if ((n.type === "INSTANCE" || n.type === "COMPONENT") && typeof n.name === "string") components.add(n.name.slice(0, 60));
        for (const c of n.children ?? []) walk(c);
      };
      walk(node);
      frames.push({ id: b.id, name: b.name, page: b.page, labels: [...labels].slice(0, 200), components: [...components].slice(0, 60) });
    }
  }
  return { file: String(doc?.name ?? key), frames };
}

/**
 * Run the intake. Keeps what was given, summarises it on the session, and leaves the PRD text and the
 * design labels in session.intake for the understanding step. Emits one "parsed" line per input.
 */
export async function runIntake(s: Session, input: IntakeInput, emit: (e: IntakeEvent) => void): Promise<{ session: Session; prdText: string; figmaLabels: string[] }> {
  const summary: IntakeSummary = { notes: [] };
  const say = (line: string) => emit({ type: "line", line });
  let prdText = "";
  let figmaLabels: string[] = [];

  if (input.prd && (input.prd.text || input.prd.data)) {
    try {
      const r = readPrd(s, input.prd);
      prdText = r.text;
      summary.prd = { kind: r.kind, title: titleOf(r.text), chars: r.text.length, file: r.file };
      emit({ type: "parsed", what: "prd", ok: true, line: `PRD read: "${summary.prd.title}", ${r.text.length.toLocaleString("en-IN")} characters${r.kind === "text" ? " (pasted)" : ` (${r.kind})`}.`, detail: { chars: r.text.length, kind: r.kind } });
    } catch (e) {
      emit({ type: "parsed", what: "prd", ok: false, line: String((e as Error).message) });
    }
  }
  if (input.notion?.url) {
    summary.notion = { url: input.notion.url, read: false, note: "The platform has no Notion credential of its own. Paste the page's text here, or export it as Markdown and upload that." };
    emit({ type: "parsed", what: "notion", ok: false, line: summary.notion.note });
  }
  if (input.figma?.url) {
    try {
      const f = await readFigma(input.figma.url, input.figma.token, say);
      const labels = [...new Set(f.frames.flatMap((x) => x.labels))];
      figmaLabels = labels;
      summary.figma = { file: f.file, url: input.figma.url.replace(/\?.*$/, ""), frames: f.frames.length, labels: labels.length };
      mkdirSync(filesDir(s), { recursive: true });
      writeFileSync(join(filesDir(s), "figma.json"), JSON.stringify({ file: f.file, frames: f.frames }, null, 1));
      emit({ type: "parsed", what: "figma", ok: true, line: `Design read: ${f.frames.length} frame(s), ${labels.length} distinct label(s) — these become the expected labels for the screen checks.`, detail: { frames: f.frames.map((x) => ({ name: x.name, labels: x.labels.length })) } });
    } catch (e) {
      summary.figma = { file: "", url: input.figma.url, frames: 0, labels: 0, note: String((e as Error).message) };
      emit({ type: "parsed", what: "figma", ok: false, line: String((e as Error).message) });
    }
  }
  if (input.frames?.length) {
    mkdirSync(filesDir(s), { recursive: true });
    const files: string[] = [];
    for (const fr of input.frames.slice(0, 40)) {
      const f = join(filesDir(s), `frame-${safeName(fr.name)}`);
      writeFileSync(f, Buffer.from(fr.data, "base64"));
      files.push(f);
    }
    summary.frames = { count: files.length, files, note: "Exported frames are kept with the session; reading labels off images is not done yet — the understanding uses the PRD's words for controls." };
    emit({ type: "parsed", what: "frames", ok: true, line: `${files.length} design frame(s) kept. ${summary.frames.note}` });
  }
  if (input.sheet?.name && input.sheet.data) {
    try {
      const info = importSheetBuffer(input.sheet.name, Buffer.from(input.sheet.data, "base64"));
      summary.sheet = { id: info.id, name: info.name, count: info.count };
      emit({ type: "parsed", what: "sheet", ok: true, line: `Test-case sheet imported: "${info.name}", ${info.count} case(s) — they will be matched against the generated ones at review.`, detail: { id: info.id, count: info.count } });
    } catch (e) {
      emit({ type: "parsed", what: "sheet", ok: false, line: `The sheet could not be imported: ${String((e as Error).message).slice(0, 160)}` });
    }
  }
  if (!summary.prd && !summary.sheet) summary.notes.push("No PRD was read. The understanding needs the requirement's words; a sheet alone can be run but not understood.");

  s.intake = { ...summary, at: new Date().toISOString() };
  saveSession(s);
  return { session: s, prdText, figmaLabels };
}

/** The PRD text kept with the session, when the intake read one. */
export function prdTextOf(s: Session): string {
  const f = (s.intake as any)?.prd?.file as string | undefined;
  if (!f || !existsSync(f)) return "";
  try {
    const ext = extname(f).toLowerCase();
    if (ext === ".docx" || ext === ".pdf") return execFileSync("python3", ["-I", EXTRACT, f], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
    return readFileSync(f, "utf8");
  } catch {
    return "";
  }
}

export function figmaLabelsOf(s: Session): string[] {
  const f = join(filesDir(s), "figma.json");
  if (!existsSync(f)) return [];
  try {
    const j = JSON.parse(readFileSync(f, "utf8"));
    return [...new Set<string>(((j.frames ?? []) as FigmaFrame[]).flatMap((x) => x.labels))];
  } catch {
    return [];
  }
}
