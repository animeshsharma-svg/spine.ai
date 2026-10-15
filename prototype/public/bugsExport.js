/**
 * EXPORT FOR DEVS — the Bugs page's Excel sheet and PDF dev report.
 *
 * Both are built in the browser from the rows the page already holds, so an
 * export is exactly what the reader is looking at, edits included, and the
 * server needs no new endpoint:
 *
 *   xlsx(rows)  A real .xlsx (a zip of SpreadsheetML, written here — no
 *               library), with the team's sheet columns in their order.
 *               Opens in Excel, Numbers and Google Sheets.
 *   pdf(rows)   A print-ready dev report — one section per bug: title,
 *               severity / priority / status, steps, expected vs what
 *               happened, the reproduction command, and how many runs have
 *               seen it — handed to the browser's print dialog, where
 *               "Save as PDF" writes the file.
 *
 * Neither ever carries a one-time code, a full phone number or a token:
 * every text goes through scrub() first.
 */
(function () {
  "use strict";

  // ── never export a secret ────────────────────────────────────────────────
  function scrub(text) {
    return String(text ?? "")
      // a token after its header or key: authorization / access-token / bearer
      .replace(/\b(authorization|access[-_]token|bearer|api[-_]?key|secret)(["']?\s*[:=]\s*["']?|\s+)(?!\$)([A-Za-z0-9._~+/=-]{12,})/gi, "$1$2[redacted]")
      // a one-time code next to the word for it
      .replace(/\b(otp|one[- ]time code|verification code|code)(["']?\s*[:=]?\s*["']?)(\d{4,8})\b/gi, (_, w, sep, d) => `${w}${sep}${"•".repeat(d.length)}`)
      // a phone number: keep the last four digits only
      .replace(/(?<![\d.])(\+?91[\s/-]?)?([6-9]\d{5}|1234\d{2})(\d{4})(?![\d.])/g, (_, cc, head, tail) => `${cc ?? ""}${"•".repeat(head.length)}${tail}`);
  }

  // ── a tiny zip writer (stored, no compression) ───────────────────────────
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // names are UTF-8
      local.setUint16(8, 0, true);      // stored
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, time, true);
      cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  // ── the Excel sheet ──────────────────────────────────────────────────────
  /** The team's sheet, minus Sprint Week and Notes. */
  const COLUMNS = [
    ["Issue ID", (r) => r.id, 12],
    ["Status", (r) => r.status, 18],
    ["Dev ETA", (r) => r.devEta, 12],
    ["Priority", (r) => r.priority, 9],
    ["Blocker", (r) => r.blocker, 9],
    ["DEV TYPE", (r) => r.devType, 11],
    ["Dev Comment", (r) => r.devComment, 30],
    ["User Type", (r) => r.userType, 14],
    ["Module", (r) => r.module, 22],
    ["Description", (r) => description(r), 90],
  ];

  /** The plain write-up, then the evidence as links that open from the sheet. */
  function description(r) {
    const out = [r.title];
    if (r.what && r.what !== r.title) out.push(`What's wrong: ${r.what}`);
    if (r.where) out.push(`Where: ${r.where}`);
    if (r.steps?.length) out.push(`How to see it: ${r.steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`);
    if (r.expected) out.push(`Expected: ${r.expected}`);
    if (r.actual && r.actual !== r.what) out.push(`What happens: ${r.actual}`);
    if (r.ways?.length) out.push(`Ways it happened: ${r.ways.map((w) => `• ${w.what}${w.result ? ` → ${w.result}` : ""}`).join(" ")}`);
    out.push(seenLine(r));
    if (r.shots?.length) out.push(`Screenshots: ${r.shots.map((x) => x.url).join("  ")}`);
    if (r.links?.length) out.push(`Runs: ${r.links.map((x) => `${x.label} ${x.url}`).join("  ")}`);
    if (r.techTitle && r.techTitle !== r.title) out.push(`Recorded as: ${r.techTitle}`);
    return out.join("\n");
  }

  /** "Still broken. Seen 4 times in 2 runs." — the state once, even for a hand-raised bug. */
  const seenLine = (r) => (String(r.often ?? "").startsWith(r.state) ? r.often : `${r.state}. ${r.often}`);

  const xml = (s) =>
    String(s ?? "")
      // characters XML 1.0 does not allow at all
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
      .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const colName = (i) => {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };

  /** columns: [header, getter, width] — the bug sheet's unless another sheet passes its own (test cases). */
  function sheetXml(rows, columns = COLUMNS) {
    const COLUMNS = columns;
    const cell = (ref, v, style) =>
      `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(scrub(v).slice(0, 32000))}</t></is></c>`;
    const head = `<row r="1">${COLUMNS.map(([name], i) => cell(`${colName(i)}1`, name, 1)).join("")}</row>`;
    const body = rows
      .map((r, n) => `<row r="${n + 2}">${COLUMNS.map(([, get], i) => cell(`${colName(i)}${n + 2}`, get(r), 2)).join("")}</row>`)
      .join("");
    const cols = COLUMNS.map(([, , w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const last = `${colName(COLUMNS.length - 1)}${rows.length + 1}`;
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>${cols}</cols><sheetData>${head}${body}</sheetData>` +
      `<autoFilter ref="A1:${last}"/></worksheet>`
    );
  }

  const STYLES =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFEFE7D6"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function xlsx(rows, { name = "spine-bugs", sheet = "Bugs", columns = COLUMNS } = {}) {
    const blob = zip([
      {
        name: "[Content_Types].xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
      },
      {
        name: "_rels/.rels",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      },
      {
        name: "xl/workbook.xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${xml(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
          `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheet.slice(0, 31))}'!$A$1:$${colName(columns.length - 1)}$${rows.length + 1}</definedName></definedNames>` +
          `</workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      },
      { name: "xl/styles.xml", data: STYLES },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows, columns) },
    ]);
    download(blob, `${name}.xlsx`);
    return blob;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ── the PDF dev report ───────────────────────────────────────────────────
  const esc = (s) => scrub(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

  const REPORT_CSS = `
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 10.5pt/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f1c17; }
    header { padding-bottom: 10pt; margin-bottom: 14pt; border-bottom: 1.5pt solid #1f1c17; }
    header h1 { margin: 0; font-size: 17pt; line-height: 1.25; }
    header p { margin: 3pt 0 0; color: #5d574b; font-size: 9.5pt; }
    .toc { margin: 0 0 16pt; padding: 0; list-style: none; columns: 2; column-gap: 18pt; font-size: 9pt; }
    .toc li { break-inside: avoid; margin-bottom: 2pt; }
    .toc b { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 600; }
    section.bug { break-inside: avoid-page; padding: 12pt 0 14pt; border-top: 0.75pt solid #d9d0bd; }
    section.bug + section.bug { break-before: auto; }
    .id { font: 600 9pt ui-monospace, Menlo, Consolas, monospace; color: #1d4f91; }
    h2 { margin: 2pt 0 6pt; font-size: 12.5pt; line-height: 1.35; }
    .facts { display: flex; flex-wrap: wrap; gap: 4pt; margin-bottom: 8pt; }
    .facts span { padding: 1.5pt 6pt; border-radius: 8pt; background: #efe7d6; font-size: 8.5pt; }
    .facts .crit { background: #fde2e2; color: #8f1d1d; }
    .facts .high { background: #ffe7d1; color: #8a3311; }
    h3 { margin: 9pt 0 3pt; font-size: 8pt; letter-spacing: .8pt; text-transform: uppercase; color: #6e685b; }
    p { margin: 0; }
    ol { margin: 0; padding-left: 15pt; }
    .ea { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
    .ea div { padding: 6pt 8pt; border-radius: 4pt; background: #f4eee1; }
    .ea div.got { background: #fde8e8; }
    .ea b { display: block; font-size: 8pt; letter-spacing: .6pt; text-transform: uppercase; color: #6e685b; }
    pre { margin: 0; padding: 7pt 9pt; border-radius: 4pt; background: #f4eee1; white-space: pre-wrap; word-break: break-all;
          font: 8.5pt/1.45 ui-monospace, Menlo, Consolas, monospace; }
    .seen { margin-top: 8pt; color: #5d574b; font-size: 9pt; }
    ul.ways, ul.links { margin: 0; padding-left: 15pt; }
    ul.ways em { color: #8f1d1d; font-style: normal; }
    .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
    .shots figure { margin: 0; break-inside: avoid; }
    .shots img { display: block; width: 100%; border: 0.75pt solid #d9d0bd; border-radius: 3pt; }
    .shots figcaption { margin-top: 2pt; font-size: 8pt; color: #6e685b; }
    a { color: #1d4f91; word-break: break-all; }
    .dev { margin-top: 10pt; padding: 7pt 9pt; border-radius: 4pt; background: #f8f4ea; font-size: 9pt; }
    footer { margin-top: 18pt; color: #6e685b; font-size: 8.5pt; }
  `;

  function bugSection(r) {
    const sev = String(r.severity ?? "");
    return (
      `<section class="bug" id="b-${esc(r.id)}">` +
      `<div class="id">${esc(r.id)}</div><h2>${esc(r.title)}</h2>` +
      `<div class="facts"><span class="${sev === "critical" ? "crit" : sev === "high" ? "high" : ""}">${esc(SEV[sev] ?? sev)}</span>` +
      `<span>Priority ${esc(r.priority)}</span><span>Status ${esc(r.status)}</span><span>Blocker ${esc(r.blocker)}</span>` +
      `<span>Dev type ${esc(r.devType)}</span><span>${esc(r.kind)}</span><span>${esc(r.module)}</span>` +
      (r.devEta ? `<span>Dev ETA ${esc(r.devEta)}</span>` : "") + `</div>` +
      (r.what ? `<h3>What's wrong</h3><p>${esc(r.what)}</p>` : "") +
      (r.where ? `<h3>Where</h3><p>${esc(r.where)}</p>` : "") +
      (r.steps?.length ? `<h3>How to see it</h3><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "") +
      (r.expected || r.actual
        ? `<h3>Expected vs what happens</h3><div class="ea"><div><b>Expected</b>${esc(r.expected || "Not recorded")}</div>` +
          `<div class="got"><b>What happens</b>${esc(r.actual || "Not recorded")}</div></div>`
        : "") +
      (r.ways?.length ? `<h3>Ways it happened</h3><ul class="ways">${r.ways.map((w) => `<li>${esc(w.what)}${w.result ? ` — <em>${esc(w.result)}</em>` : ""}</li>`).join("")}</ul>` : "") +
      `<p class="seen">${esc(seenLine(r))}</p>` +
      (r.shots?.length
        ? `<h3>Screenshots</h3><div class="shots">${r.shots.map((x) => `<figure><img src="${esc(x.url)}" alt="${esc(x.label)}" /><figcaption>${esc(x.label)}</figcaption></figure>`).join("")}</div>`
        : "") +
      (r.links?.length ? `<h3>The runs behind it</h3><ul class="links">${r.links.map((x) => `<li>${esc(x.label)}: <a href="${esc(x.url)}">${esc(x.url)}</a></li>`).join("")}</ul>` : "") +
      (r.curl ? `<h3>The exact request</h3><pre>${esc(r.curl)}</pre>` + (r.reply ? `<p class="seen">The server answered: ${esc(r.reply)}</p>` : "") : "") +
      (r.devComment ? `<h3>Dev comment</h3><p>${esc(r.devComment)}</p>` : "") +
      (r.techTitle || r.devNotes?.length
        ? `<div class="dev"><b>For developers</b>${r.techTitle ? `<p>Recorded as: <code>${esc(r.techTitle)}</code></p>` : ""}` +
          (r.devNotes?.length ? `<ul class="links">${r.devNotes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") + `</div>`
        : "") +
      `</section>`
    );
  }

  function reportHtml(rows, { title, company }) {
    const when = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return (
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>` +
      `<header><h1>${esc(title)}</h1><p>${esc(company)} · ${rows.length} bug${rows.length === 1 ? "" : "s"} · exported from spine.ai on ${esc(when)}</p></header>` +
      (rows.length > 1 ? `<ul class="toc">${rows.map((r) => `<li><b>${esc(r.id)}</b> ${esc(r.title)}</li>`).join("")}</ul>` : "") +
      rows.map(bugSection).join("") +
      `<footer>Commands use $PROCOL_TOKEN for the session token. One-time codes, phone numbers and tokens are never included.</footer>` +
      `</body></html>`
    );
  }

  /** Prints the report from a hidden frame; the print dialog's "Save as PDF" writes the file. */
  function pdf(rows, opts = {}) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(reportHtml(rows, { title: opts.title ?? "spine.ai bugs", company: opts.company ?? "" }));
    doc.close();
    // The browser names the PDF after the top page's title.
    const before = document.title;
    const done = () => {
      document.title = before;
      setTimeout(() => frame.remove(), 1000);
    };
    // Print once the screenshots are in, so the PDF carries them (at most 8 s).
    const images = [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise((ok) => { img.onload = img.onerror = ok; })));
    Promise.race([Promise.all(images), new Promise((ok) => setTimeout(ok, 8000))]).then(() => {
      document.title = opts.name ?? "spine-bugs";
      frame.contentWindow.addEventListener("afterprint", done, { once: true });
      frame.contentWindow.focus();
      frame.contentWindow.print();
      // Some browsers never fire afterprint for a frame.
      setTimeout(done, 60000);
    });
    return reportHtml;
  }

  window.spineBugExport = { xlsx, pdf, scrub, reportHtml, sheetXml };
})();
