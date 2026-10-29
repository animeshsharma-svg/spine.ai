"""Turn a run folder of run.mjs records into the runs.json score.py reads.

    python3 collect.py runs/<tag> > runs/<tag>/../<tag>-runs.json

Per case: the platform's run id, the event title the run set (to find the event in Procol's
database), the oracle's verdict, and what the compiler said before running (coverage, gaps),
whether the explorer took over, or why the run was blocked.
"""
import json
import sys
from pathlib import Path

QA = Path(__file__).resolve().parent.parent.parent
run_dir = Path(sys.argv[1])
out = {}
for f in sorted(run_dir.glob("*.json")):
    r = json.loads(f.read_text())
    titles, verdict = [], None
    if r.get("runId"):
        rec = QA / "prototype" / "data" / "plan-runs" / f"{r['runId']}.json"
        if rec.exists():
            pr = json.loads(rec.read_text())
            titles = [s["detail"] for s in pr.get("steps") or [] if s["step"] == "set_title" and s.get("detail")]
        res = QA / "procol-ui-tests" / ".plans" / f"{r['runId']}-result.json"
        if res.exists():
            verdict = (json.loads(res.read_text()).get("verdict") or {}).get("kind")
    out[r["id"]] = {
        "runId": r.get("runId"), "startedAt": r.get("startedAt"), "attempts": 1, "titles": titles, "verdict": verdict,
        "coverage": (r.get("plan") or {}).get("coverage"), "gaps": (r.get("plan") or {}).get("gaps"),
        "explored": bool(r.get("explore")), "blocked": (r.get("blocked") or {}).get("reason"),
        "notRun": bool((r.get("done") or {}).get("notRun")), "error": r.get("error"), "seconds": round((r.get("ms") or 0) / 1000),
    }
json.dump(out, sys.stdout, indent=1)
