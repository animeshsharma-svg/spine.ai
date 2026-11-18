#!/usr/bin/env python3
"""
rca-retrieval-pdf-to-json.py — turn the printed RCA retrieval export (PDF) into JSON.

    python3 test-cases/rca-retrieval-pdf-to-json.py .local-rca/rca_retrieval_all_2026-07-01_2026-09-30.pdf

The export prints one sheet in four page bands of equal height:
  band 1  Ticket ID · Title · Created · Updated · Status · Label · Module · Is Defect · Priority
  band 2  Description (CS) · Description (Eng) · Error Signature · RCA · Resolution/Fix · Action Items · Tags · RCA Source · Confidence
  band 3  Verification · Source Channel · Slack Thread · HubSpot Link
  band 4  HubSpot record id (blank where no link) — not used, band 3 has the link
Rows sit at the same line index in bands 1–3, so they are joined by position and
checked against the HubSpot id in band 3.

Band 2's cells run together with no delimiter in the print, so they are kept as one
`detail` text, with tags / source / confidence split off the end. The real .xlsx,
when it lands, makes this script unnecessary.

Needs pypdf (python3 -m pip install --user pypdf). Writes <pdf>.json next to the PDF.
Output stays under .local-rca/ (git-ignored): it holds ticket text.
"""
import json
import re
import sys
from pathlib import Path

try:
    import pypdf
except ImportError:  # pragma: no cover
    sys.exit("pypdf is missing: python3 -m pip install --user pypdf")

PRIORITIES = [
    "P0 - System Down", "P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low/Cosmetic",
    "Service Request", "Enhancement / Feature gap", "Support / Training",
    "critical", "high", "medium", "low",
]
LABELS = [
    "data_issue, code_issue", "expected_behaviour", "execed_behaviour", "service_request",
    "enhancement", "data_issue", "code_issue", "no_context", "config",
]
SOURCES = ["HubSpot note", "HubSpot", "Slack", "none"]
DATE = r"\d{4}-\d{2}-\d{2}"


def page_lines(reader, first, last):
    """Non-blank lines of pages first..last (1-based, inclusive), in order."""
    out = []
    for i in range(first - 1, last):
        text = reader.pages[i].extract_text(extraction_mode="layout") or ""
        out.extend(l.rstrip() for l in text.splitlines() if l.strip())
    return out


def parse_band1(line, hub_id=""):
    s = line.strip()
    # Titles can start with digits ("143531 : QLAR…"); the HubSpot id says where the ticket id ends.
    if hub_id and s.startswith(hub_id):
        m = re.match(rf"^({re.escape(hub_id)})(.*?)({DATE})({DATE})(.*)$", s)
    else:
        m = re.match(rf"^(\d+)(.*?)({DATE})({DATE})(.*)$", s)
    if not m:
        return None
    ticket, title, created, updated, tail = m.groups()
    tail = re.sub(r"\s+", " ", tail).strip()
    priority = ""
    for p in PRIORITIES:
        if tail.endswith(p):
            priority, tail = p, tail[: -len(p)].rstrip()
            break
    defect = ""
    m2 = re.search(r"(Yes|No)$", tail)
    if m2:
        defect, tail = m2.group(1), tail[: m2.start()].rstrip()
    status, label, module = tail, "", ""
    best = None
    for lab in LABELS:
        k = tail.find(lab)
        if k >= 0 and (best is None or k < best[0] or (k == best[0] and len(lab) > len(best[1]))):
            best = (k, lab)
    if best:
        k, lab = best
        status, label, module = tail[:k].strip(), lab, tail[k + len(lab):].strip()
    return {
        "ticket": ticket,
        "title": re.sub(r"\s+", " ", title).strip(),
        "created": created,
        "updated": updated,
        "status": status,
        "label": label,
        "module": module,
        "is_defect": defect,
        "priority": priority,
    }


def parse_band2(line):
    text = re.sub(r"\s+", " ", line).strip()
    conf = None
    m = re.search(r"(\d\.\d+)$", text)
    if m:
        conf, text = float(m.group(1)), text[: m.start()].rstrip()
    source = ""
    for s in SOURCES:
        if text.endswith(s):
            source, text = s, text[: -len(s)].rstrip()
            break
    tags = ""
    m = re.search(r"([a-z0-9][a-z0-9-]*(?:; [a-z0-9][a-z0-9-]*)*)$", text)
    if m and (";" in m.group(1) or "-" in m.group(1)):
        tags, text = m.group(1), text[: m.start()].rstrip()
    return {"detail": text, "tags": tags, "rca_source": source, "confidence": conf}


def parse_band3(line):
    text = line.strip()
    hub = re.search(r"https://app\.hubspot\.com/\S+", text)
    slack = re.search(r"https?://procolhq\.slack\.com/\S+", text)
    hub_url = hub.group(0) if hub else ""
    slack_url = slack.group(0) if slack else ""
    cut = min([x.start() for x in (hub, slack) if x] or [len(text)])
    head = text[:cut].strip()
    if head.startswith("flagged"):
        # "flagged: no_summary, low_confidence(0.48) epx-godspeed" — flags are a known set
        m = re.match(r"^(flagged:(?:\s*(?:no_summary|resolved_but_no_rca_or_resolution|low_confidence\(\d\.\d+\)),?)+)\s*(.*)$", head)
        verification, channel = (m.group(1).rstrip(","), m.group(2).strip()) if m else (head, "")
    else:
        m = re.match(r"^(verified)?\s*(.*)$", head)
        verification, channel = (m.group(1) or ""), m.group(2).strip()
    hub_id = hub_url.rsplit("/", 1)[-1] if hub_url else ""
    return {"verification": verification, "channel": channel, "slack": slack_url, "hubspot": hub_url, "hubspot_id": hub_id}


def main(pdf_path):
    pdf = Path(pdf_path)
    reader = pypdf.PdfReader(str(pdf))
    n = len(reader.pages)
    if n % 4:
        sys.exit(f"{n} pages: expected four equal bands")
    q = n // 4
    b1 = page_lines(reader, 1, q)
    b2 = page_lines(reader, q + 1, 2 * q)
    b3 = page_lines(reader, 2 * q + 1, 3 * q)
    if not (len(b1) == len(b2) == len(b3)):
        sys.exit(f"bands differ: {len(b1)} / {len(b2)} / {len(b3)} lines")
    rows, problems = [], []
    for i, (l1, l2, l3) in enumerate(zip(b1, b2, b3)):
        if i == 0:
            continue  # header
        r3 = parse_band3(l3)
        r1 = parse_band1(l1, r3["hubspot_id"])
        if not r1:
            problems.append(f"line {i}: no ticket id in band 1: {l1[:80]!r}")
            continue
        if r3["hubspot_id"] and r3["hubspot_id"] != r1["ticket"]:
            problems.append(f"line {i}: ticket {r1['ticket']} vs hubspot {r3['hubspot_id']}")
        rows.append({**r1, **parse_band2(l2), **r3})
    out = {
        "source": pdf.name,
        "rows": len(rows),
        "problems": problems,
        "tickets": rows,
    }
    out_path = pdf.with_suffix(".json")
    out_path.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{len(rows)} rows → {out_path}; {len(problems)} alignment problems")
    for p in problems[:20]:
        print("  ", p)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
