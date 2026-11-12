"""Text of a .docx or .pdf for the requirement step — `python3 -I scripts/extract-text.py <file>` prints UTF-8 text."""
import sys, os
path = sys.argv[1]
ext = os.path.splitext(path)[1].lower()
if ext == ".docx":
    import docx
    d = docx.Document(path)
    parts = []
    for p in d.paragraphs:
        t = p.text.strip()
        if not t: continue
        style = (p.style.name or "").lower() if p.style is not None else ""
        if style.startswith("heading"):
            level = "".join(ch for ch in style if ch.isdigit()) or "2"
            parts.append("#" * min(int(level), 4) + " " + t)
        elif style.startswith("list") or p.text.lstrip().startswith(("-", "•", "*")):
            parts.append("- " + t.lstrip("-•* "))
        else:
            parts.append(t)
    for table in d.tables:
        for row in table.rows:
            cells = [c.text.strip().replace("\n", " ") for c in row.cells]
            if any(cells): parts.append("| " + " | ".join(cells) + " |")
    sys.stdout.write("\n".join(parts))
elif ext == ".pdf":
    from pypdf import PdfReader
    r = PdfReader(path)
    out = []
    for i, page in enumerate(r.pages):
        t = page.extract_text() or ""
        if t.strip(): out.append(t)
    sys.stdout.write("\n\n".join(out))
else:
    sys.stdout.write(open(path, encoding="utf-8", errors="replace").read())
