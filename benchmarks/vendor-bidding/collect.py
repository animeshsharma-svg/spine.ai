"""Turn a run folder of run.mjs records into the runs.json score.py reads.

    python3 collect.py runs/<tag> > runs/<tag>/../<tag>-runs.json

Per case: the platform's run id, the event title the run set (to find the event in Procol's
database), the oracle's verdict, and what the compiler said before running (coverage, gaps),
whether the explorer took over, or why the run was blocked.
"""
import json
import re
import sys
from pathlib import Path

QA = Path(__file__).resolve().parent.parent.parent
run_dir = Path(sys.argv[1])
out = {}
for f in sorted(run_dir.glob("*.json")):
    r = json.loads(f.read_text())
    titles, verdict, bid_for = [], None, None
    if r.get("runId"):
        rec = QA / "prototype" / "data" / "plan-runs" / f"{r['runId']}.json"
        if rec.exists():
            pr = json.loads(rec.read_text())
            steps = pr.get("steps") or []
            titles = [s["detail"] for s in steps if s["step"] == "set_title" and s.get("detail")]
            # an existing event the run picked or opened: its name, from open_event's detail
            for s in steps:
                if s["step"] == "open_event" and s.get("status") == "ok":
                    m = re.search(r"(?:picked|used|opened) “([^”]+)”", s.get("detail") or "") or re.search(r'opened "([^"]+)"', s.get("detail") or "")
                    if m: titles.append(m.group(1))
            bid = next((s.get("detail") or "" for s in steps if s["step"] == "place_surrogate_bid" and s.get("status") == "ok"), "")
            m = re.search(r"surrogate bid (?:entered|placed|submitted) for (.+?)(?:\s+\d{6,}|\s+—|\s*\(|$)", bid)
            bid_for = m.group(1).strip() if m else None
        res = QA / "procol-ui-tests" / ".plans" / f"{r['runId']}-result.json"
        if res.exists():
            verdict = (json.loads(res.read_text()).get("verdict") or {}).get("kind")
    out[r["id"]] = {
        "runId": r.get("runId"), "startedAt": r.get("startedAt"), "attempts": 1, "titles": titles, "verdict": verdict, "bidFor": bid_for,
        "coverage": (r.get("plan") or {}).get("coverage"), "gaps": (r.get("plan") or {}).get("gaps"),
        "explored": bool(r.get("explore")), "blocked": (r.get("blocked") or {}).get("reason"),
        "notRun": bool((r.get("done") or {}).get("notRun")), "error": r.get("error"), "seconds": round((r.get("ms") or 0) / 1000),
    }
json.dump(out, sys.stdout, indent=1)
