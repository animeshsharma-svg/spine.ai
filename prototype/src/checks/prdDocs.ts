/**
 * PRDs — the product documents test cases are written from and judged by.
 *
 *   readPrdText(name, buf)   .docx / .pdf / .md / .txt → plain text (paragraphs kept)
 *   savePrd / loadPrd        kept in data/prds/<id>.json
 *   linkPrd / prdForSheet    a sheet uploaded with a PRD is judged by it (data/prds/links.json)
 *   prdExcerpt(prd, text)    the paragraphs of a long PRD that matter for one case, in document order
 *
 * The PRD is the source of truth for what the product should do; the code under test never is
 * (prompts/test-case-writer.md, prompts/test-case-runner.md section 3).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

// the zip reader inside xlsx (a .docx is a zip); the ESM namespace keeps it on the default export
const CFB = ((XLSX as any).CFB ?? (XLSX as any).default?.CFB) as typeof XLSX.CFB;

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "..", "..", "data", "prds");
const LINKS = join(DIR, "links.json");

export interface Prd { id: string; name: string; text: string; importedAt: string }

export const PRD_FILE = /\.(docx|pdf|md|markdown|txt)$/i;
export const SHEET_FILE = /\.(xlsx|xls|csv)$/i;

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The text of a PRD file. Throws with a plain reason when it cannot be read. */
export function readPrdText(name: string, buf: Buffer): string {
  const ext = name.toLowerCase().split(".").pop();
  let text = "";
  if (ext === "docx") {
    const zip = CFB.read(buf, { type: "buffer" });
    const doc = CFB.find(zip, "word/document.xml") ?? CFB.find(zip, "/word/document.xml");
    if (!doc?.content) throw new Error("this .docx has no document body");
    const xml = Buffer.from(doc.content as Uint8Array).toString("utf8");
    // paragraphs and table cells become lines; list items keep a bullet so requirements stay apart
    text = unxml(xml.replace(/<w:numPr>/g, "• ").replace(/<\/w:p>/g, "\n").replace(/<\/w:tc>/g, " | ").replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, ""));
  } else if (ext === "pdf") {
    // pypdf, run with -P so nothing in the working directory is imported
    const r = spawnSync("python3", ["-P", "-c", "import sys,pypdf;r=pypdf.PdfReader(sys.stdin.buffer);print('\\n'.join((p.extract_text() or '') for p in r.pages))"], { input: buf, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
    if (r.status !== 0) throw new Error(`the PDF could not be read (${String(r.stderr).trim().split("\n").pop()?.slice(0, 160) || "pypdf failed"})`);
    text = String(r.stdout);
  } else text = buf.toString("utf8");
  text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 80) throw new Error("the document has almost no text (a scanned PDF needs to be exported as text first)");
  return text;
}

const slug = (s: string) => s.toLowerCase().replace(PRD_FILE, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "prd";

export function savePrd(name: string, text: string): Prd {
  mkdirSync(DIR, { recursive: true });
  const prd: Prd = { id: `prd-${slug(name)}`, name, text, importedAt: new Date().toISOString() };
  writeFileSync(join(DIR, `${prd.id}.json`), JSON.stringify(prd, null, 1));
  return prd;
}
export function loadPrd(id: string): Prd | null {
  const f = join(DIR, `${id.replace(/[^\w.-]/g, "")}.json`);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Prd) : null;
}

function links(): Record<string, string> {
  try {
    return existsSync(LINKS) ? (JSON.parse(readFileSync(LINKS, "utf8")) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
/** From now on the sheet's cases are judged by this PRD. */
export function linkPrd(sheet: string, prdId: string): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LINKS, JSON.stringify({ ...links(), [sheet]: prdId }, null, 1));
}
export function prdForSheet(sheet: string): Prd | null {
  const id = links()[sheet];
  return id ? loadPrd(id) : null;
}

const STOP = new Set("the a an and or of to in on for is are be with that this it as by at from when then which who can not no all any each its their there will should must".split(" "));
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/**
 * The part of the PRD that matters for one case. A short PRD is sent whole; a long one is cut to the
 * paragraphs sharing the most words with the case (plus the headings above them), in document order.
 */
export function prdExcerpt(prd: Prd, caseText: string, maxChars = 9000): string {
  if (prd.text.length <= maxChars) return prd.text;
  const paras = prd.text.split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const want = new Set(words(caseText));
  const scored = paras.map((t, i) => {
    const w = words(t);
    const hits = w.filter((x) => want.has(x)).length;
    return { i, t, score: w.length ? hits + hits / Math.sqrt(w.length) : 0 };
  });
  const keep = new Set<number>([0, 1, 2]); // the title and the goal
  let size = paras.slice(0, 3).join("\n").length;
  for (const p of [...scored].sort((a, b) => b.score - a.score)) {
    if (p.score <= 0 || size + p.t.length > maxChars) continue;
    keep.add(p.i);
    size += p.t.length;
    // the nearest heading above it (a short line without a full stop), so the excerpt keeps its section
    for (let j = p.i - 1; j >= 0 && j >= p.i - 6; j--)
      if (paras[j].length < 90 && !/[.:]$/.test(paras[j])) {
        if (!keep.has(j)) (keep.add(j), (size += paras[j].length));
        break;
      }
  }
  return [...keep].sort((a, b) => a - b).map((i) => paras[i]).join("\n");
}
