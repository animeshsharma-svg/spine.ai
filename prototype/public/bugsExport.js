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
  /**
   * THE TEAM'S SHEET, AS THE TEAM KEEPS IT (Aanya, 29 Oct: "the exported bug sheet and testcase sheet should look
   * like this, with minimal and clean content, presentable and sharable"): a blue header row; Status, Priority,
   * Blocker and Dev type as coloured chips with a dropdown of the sheet's own values — conditional formatting, so a
   * chip changes colour when someone picks a new value in Excel or Google Sheets; a short description; the evidence
   * as one link; dates; empty QA columns for the team to fill. A second tab sums it up.
   *
   * A column is [header, getter, width, opts]; opts: { center, chips: {value: tone}, list: [values], link: label }.
   */
  // Soft chips — a light fill and dark words, like a tag (2 Nov, Aanya: "eww what is this color" at a sheet of solid
  // brick-red cells). Red is kept for what is urgent (P0, a blocker, a failed retest), not for every open bug.
  const TONES = {
    red: ["FFFDE2E1", "FF9B1C1C"], green: ["FFDCFCE7", "FF166534"], brown: ["FFF5EBDD", "FF7C4A12"],
    pink: ["FFFFEDD5", "FF9A3412"], yellow: ["FFFEF3C7", "FF854D0E"], grey: ["FFF1F0EC", "FF57534E"],
    mint: ["FFECFDF3", "FF15803D"], blue: ["FFE8F0FE", "FF1A56C4"], slate: ["FFE7ECF3", "FF334155"],
    violet: ["FFEDE9FE", "FF5B21B6"],
  };
  const TONE_NAMES = Object.keys(TONES);

  const STATUS_CHIPS = {
    OPEN: "slate", "Re-open": "brown", "TO BE TESTED": "blue", "TO BE DEPLOYED": "blue", "TO BE PICKED": "pink", "TO DO": "pink",
    FIXED: "green", "TO BE DISCUSSED": "yellow", "NOT A BUG": "grey", "FIX LATER": "grey", "Duplicate Issue": "grey",
    "Feature Bug / Enhancement": "blue",
  };
  const PRIORITY_CHIPS = { P0: "red", P1: "pink", P2: "yellow", P3: "grey" };
  const BLOCKER_CHIPS = { YES: "red", Yes: "red", NO: "mint", No: "mint" };
  const DEVTYPE_CHIPS = { BE: "violet", FE: "blue", BOTH: "brown", CONFIG: "yellow", DATA: "yellow", HARNESS: "grey", ENV: "grey", TEST: "grey" };
  const QA_CHIPS = { Pass: "green", Fail: "red", Retest: "yellow", Blocked: "brown", "Not tested": "grey" };

  /** "Linked cost centre field's dropdown doesn't open" — the title, and what happens when it adds something. */
  function shortDescription(r) {
    const title = String(r.title ?? "").trim();
    const got = String(r.actual || r.what || "").replace(/\s+/g, " ").trim();
    if (!got || got === title || title.includes(got) || got.includes(title)) return title;
    return `${title}\n${got.length > 180 ? `${got.slice(0, 177).replace(/\s+\S*$/, "")}…` : got}`;
  }
  /** The one link a reader opens first: the video, else the run, else a screenshot. */
  const evidenceOf = (r) => r.videos?.[0]?.url || r.links?.find((x) => /session|run/i.test(x.label))?.url || r.links?.[0]?.url || r.shots?.[0]?.url || "";

  const COLUMNS = [
    ["Issue ID", (r) => r.id, 11, { center: true, bold: true }],
    ["Status", (r) => r.status, 17, { chips: STATUS_CHIPS, list: Object.keys(STATUS_CHIPS) }],
    ["Dev ETA", (r) => r.devEta, 10, { center: true }],
    ["Priority", (r) => r.priority, 9, { chips: PRIORITY_CHIPS, list: ["P0", "P1", "P2", "P3"] }],
    ["Blocker", (r) => String(r.blocker ?? "").toUpperCase(), 9, { chips: BLOCKER_CHIPS, list: ["YES", "NO"] }],
    ["DEV TYPE", (r) => r.devType, 10, { chips: DEVTYPE_CHIPS, list: Object.keys(DEVTYPE_CHIPS) }],
    ["Dev Comment", (r) => r.devComment, 26, {}],
    ["User Type", (r) => r.userType, 15, { center: true }],
    ["Module", (r) => r.module, 14, { center: true }],
    ["Description", (r) => shortDescription(r), 58, { tint: true }],
    ["Evidence", (r) => evidenceOf(r), 12, { link: (r) => (r.videos?.length ? "▶ Video" : "Open run") }],
    ["Issue Reported Date", (r) => r.reported, 12, { center: true }],
    ["Issue Resolution Date", (r) => r.resolved, 12, { center: true }],
    ["QA Status (V 1.0)", () => "", 12, { chips: QA_CHIPS, list: Object.keys(QA_CHIPS) }],
    ["QA Comment", () => "", 24, {}],
  ];

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

  // cellXfs: 0 default · 1 header · 2 text (wrap) · 3 centered · 4 link · 5 chip cell (bold, centered)
  //          6 tinted text (the description) · 7 bold centered (ids) · 8 summary title · 9 summary note · 10 summary head
  const XF = { head: 1, text: 2, center: 3, link: 4, chip: 5, tint: 6, id: 7, title: 8, note: 9, shead: 10 };
  const STYLES =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="6">` +
    `<font><sz val="10"/><color rgb="FF202124"/><name val="Arial"/></font>` +
    `<font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>` +
    `<font><u/><sz val="10"/><color rgb="FF1A56C4"/><name val="Arial"/></font>` +
    `<font><b/><sz val="9"/><color rgb="FF202124"/><name val="Arial"/></font>` +
    `<font><b/><sz val="15"/><color rgb="FF202124"/><name val="Arial"/></font>` +
    `<font><sz val="10"/><color rgb="FF5F6368"/><name val="Arial"/></font>` +
    `</fonts>` +
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF2F2C26"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3EA"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left style="thin"><color rgb="FFDADCE0"/></left><right style="thin"><color rgb="FFDADCE0"/></right>` +
    `<top style="thin"><color rgb="FFDADCE0"/></top><bottom style="thin"><color rgb="FFDADCE0"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    // one differential format per tone, in TONE_NAMES order: the chips' colours
    `<dxfs count="${TONE_NAMES.length}">${TONE_NAMES.map((t) => `<dxf><font><b/><color rgb="${TONES[t][1]}"/></font><fill><patternFill patternType="solid"><fgColor rgb="${TONES[t][0]}"/><bgColor rgb="${TONES[t][0]}"/></patternFill></fill></dxf>`).join("")}</dxfs>` +
    `</styleSheet>`;

  /** A worksheet: the header, one row per item, frozen header and first column, filters, dropdowns, chip colours. */
  function sheetXml(rows, columns = COLUMNS) {
    const spec = (c) => c[3] ?? {};
    const text = (ref, v, style) =>
      `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(scrub(v).slice(0, 32000))}</t></is></c>`;
    const link = (ref, url, label) =>
      url
        ? `<c r="${ref}" t="str" s="${XF.link}"><f>${xml(`HYPERLINK("${String(url).replace(/"/g, '""')}","${String(label).replace(/"/g, '""')}")`)}</f><v>${xml(label)}</v></c>`
        : text(ref, "", XF.center);
    // Each row as tall as its longest wrapped cell, so nothing hides and nothing is cramped (Numbers and Excel
    // both keep a stated height; a default one is ignored by Numbers).
    const linesIn = (v, width) =>
      String(v ?? "").split("\n").reduce((n, para) => n + Math.max(1, Math.ceil(para.length / Math.max(4, width * 1.05))), 0);
    const heightOf = (vals) => Math.min(300, Math.max(30, Math.max(...vals.map(([v, w]) => linesIn(v, w))) * 14 + 12));
    const headHeight = Math.max(42, Math.max(...columns.map((c) => linesIn(c[0], c[2] - 2))) * 14 + 14);
    const head = `<row r="1" ht="${headHeight}" customHeight="1">${columns.map((c, i) => text(`${colName(i)}1`, c[0], XF.head)).join("")}</row>`;
    const body = rows
      .map((r, n) => {
        const cells = columns.map((c, i) => {
          const o = spec(c);
          const ref = `${colName(i)}${n + 2}`;
          const v = c[1](r);
          if (o.link) return link(ref, v, typeof o.link === "function" ? o.link(r) : o.link);
          const style = o.chips ? XF.chip : o.bold ? XF.id : o.tint ? XF.tint : o.center ? XF.center : XF.text;
          return text(ref, v ?? "", style);
        });
        const ht = heightOf(columns.filter((c) => !spec(c).link).map((c) => [c[1](r), c[2]]));
        return `<row r="${n + 2}" ht="${ht}" customHeight="1">${cells.join("")}</row>`;
      })
      .join("");
    const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c[2]}" customWidth="1"/>`).join("");
    const lastRow = Math.max(rows.length + 1, 2);
    const reach = lastRow + 200; // dropdowns and colours reach rows the team adds later
    const last = `${colName(columns.length - 1)}${lastRow}`;
    let prio = 1;
    const cf = columns
      .map((c, i) => {
        const o = spec(c);
        if (!o.chips) return "";
        const rules = Object.entries(o.chips)
          .map(([v, tone]) => `<cfRule type="cellIs" dxfId="${TONE_NAMES.indexOf(tone)}" priority="${prio++}" operator="equal"><formula>"${xml(v)}"</formula></cfRule>`)
          .join("");
        return `<conditionalFormatting sqref="${colName(i)}2:${colName(i)}${reach}">${rules}</conditionalFormatting>`;
      })
      .join("");
    const lists = columns
      .map((c, i) => [c, i])
      .filter(([c]) => spec(c).list?.length)
      .map(([c, i]) => `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${colName(i)}2:${colName(i)}${reach}"><formula1>"${xml(spec(c).list.join(",")).slice(0, 250)}"</formula1></dataValidation>`);
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetViews><sheetView workbookViewId="0" zoomScale="110"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="30" customHeight="1"/>` +
      `<cols>${cols}</cols><sheetData>${head}${body}</sheetData>` +
      `<autoFilter ref="A1:${last}"/>` +
      cf +
      (lists.length ? `<dataValidations count="${lists.length}">${lists.join("")}</dataValidations>` : "") +
      `</worksheet>`
    );
  }

  /**
   * The Summary tab: what the sheet is, then how many by each chip column (and module), each value in its colour.
   * `groups` are [heading, getter, chips?]; the first chip column's values come in the sheet's own order.
   */
  function summaryXml(rows, { title, subtitle, groups }) {
    const out = [];
    let r = 1;
    const text = (ref, v, s) => `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xml(scrub(v))}</t></is></c>`;
    const num = (ref, v) => `<c r="${ref}" s="${XF.center}"><v>${v}</v></c>`;
    out.push(`<row r="${r}" ht="26" customHeight="1">${text(`A${r}`, title, XF.title)}</row>`);
    r++;
    out.push(`<row r="${r}">${text(`A${r}`, subtitle, XF.note)}</row>`);
    r += 2;
    const cf = [];
    let prio = 1;
    for (const [heading, get, chips] of groups) {
      const counts = new Map();
      for (const x of rows) {
        const v = String(get(x) ?? "").trim() || "—";
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const order = chips ? Object.keys(chips) : [];
      const entries = [...counts].sort((a, b) => {
        const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
        if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return b[1] - a[1];
      });
      out.push(`<row r="${r}" ht="24" customHeight="1">${text(`A${r}`, heading, XF.shead)}${text(`B${r}`, "Count", XF.head)}</row>`);
      const from = r + 1;
      for (const [v, n] of entries) {
        r++;
        out.push(`<row r="${r}">${text(`A${r}`, v, chips ? XF.chip : XF.text)}${num(`B${r}`, n)}</row>`);
      }
      if (chips) {
        cf.push(`<conditionalFormatting sqref="A${from}:A${r}">${Object.entries(chips).map(([v, tone]) => `<cfRule type="cellIs" dxfId="${TONE_NAMES.indexOf(tone)}" priority="${prio++}" operator="equal"><formula>"${xml(v)}"</formula></cfRule>`).join("")}</conditionalFormatting>`);
      }
      r += 2;
    }
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="110"/></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="22" customHeight="1"/>` +
      `<cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="10" customWidth="1"/></cols>` +
      `<sheetData>${out.join("")}</sheetData>${cf.join("")}</worksheet>`
    );
  }

  /** The default Summary for the bug sheet. */
  const BUG_SUMMARY = [
    ["Status", (r) => r.status, STATUS_CHIPS],
    ["Priority", (r) => r.priority, PRIORITY_CHIPS],
    ["Blocker", (r) => String(r.blocker ?? "").toUpperCase(), BLOCKER_CHIPS],
    ["Module", (r) => r.module, null],
  ];

  /**
   * xlsx(rows, { name, sheet, columns, title, company, summary }) — the sheet, then a Summary tab. `summary` is the
   * list of [heading, getter, chips] to count by (the bug sheet's by default; false leaves the tab out).
   */
  function xlsx(rows, { name = "spine-bugs", sheet = "Bugs", columns = COLUMNS, title, company, summary, extra = [] } = {}) {
    const groups = summary === false ? null : summary ?? BUG_SUMMARY;
    const when = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const sheets = [{ name: sheet.slice(0, 31), data: sheetXml(rows, columns) }];
    // more tabs (the PRD export's Coverage map and Open questions): [{ name, rows, columns }]
    for (const x of Array.isArray(extra) ? extra : []) if (x?.name && Array.isArray(x.rows) && Array.isArray(x.columns)) sheets.push({ name: String(x.name).slice(0, 31), data: sheetXml(x.rows, x.columns) });
    if (groups) {
      sheets.push({
        name: "Summary",
        data: summaryXml(rows, {
          title: title || `${sheet}${company ? ` · ${company}` : ""}`,
          subtitle: `${rows.length} ${sheet.toLowerCase()} · exported from spine.ai on ${when}`,
          groups,
        }),
      });
    }
    const blob = zip([
      {
        name: "[Content_Types].xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
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
          `<sheets>${sheets.map((x, i) => `<sheet name="${xml(x.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
          `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheets[0].name)}'!$A$1:$${colName(columns.length - 1)}$${Math.max(rows.length + 1, 2)}</definedName></definedNames>` +
          `</workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      },
      { name: "xl/styles.xml", data: STYLES },
      ...sheets.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x.data })),
    ]);
    download(blob, `${name}.xlsx`);
    return blob;
  }

  /** "Still broken. Seen 4 times in 2 runs." — the state once, even for a hand-raised bug. */
  const seenLine = (r) => (String(r.often ?? "").startsWith(r.state) ? r.often : `${r.state}. ${r.often}`);

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
      (r.videos?.length || r.replays?.length
        ? `<h3>How it happened</h3><ul class="links">${[...(r.videos ?? []).map((x) => `<li>${esc(x.label)}: <a href="${esc(x.url)}">${esc(x.url)}</a></li>`), ...(r.replays ?? []).map((x) => `<li>${esc(x.label)}: <a href="${esc(x.url)}">${esc(x.url)}</a></li>`)].join("")}</ul>`
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

  window.spineBugExport = { xlsx, pdf, scrub, reportHtml, sheetXml, TONES: TONE_NAMES };
})();
