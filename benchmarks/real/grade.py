"""Grade a REAL run (results/<run>/) with REAL's own checks, and write its score.

Each task's verdict comes from AGI Inc.'s evaluator (agisdk WebCloneEvaluator) on the site
state run.ts read back, never from the explorer's own "done". The summary also says which
model answered: a task any other model touched is listed, because then the score is not
LUNA's alone.

    .venv/bin/python grade.py results/<run>
"""
import contextlib
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

from agisdk.REAL.browsergym.webclones.evaluate import WebCloneEvaluator
from agisdk.REAL.browsergym.webclones.task_config import TaskConfig

run = Path(sys.argv[1])
meta = json.loads((run / "run.json").read_text())
rows = []
for f in sorted((run / "tasks").glob("*.json")):
    t = json.loads(f.read_text())
    passed, why = False, ""
    if t.get("state") is None:
        why = t.get("error") or "no site state was read"
    else:
        answer = (t.get("agent") or {}).get("proof") or ""
        # The evaluator prints the whole site state; only its verdict is kept.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            reward, _, message, info = WebCloneEvaluator(TaskConfig(t["id"], "v2")).evaluate(env_state=t["state"], model_response=answer)
        passed = reward > 0
        why = "; ".join(str(r[1].get("output", ""))[:160] if isinstance(r[1], dict) else str(r[1])[:160] for r in info.get("results", []))
    models = set(t.get("served") or {})
    rows.append({
        "id": t["id"], "site": t["site"], "difficulty": t.get("difficulty"), "passed": passed,
        "agentSaidDone": bool((t.get("agent") or {}).get("saidDone")), "steps": len((t.get("agent") or {}).get("steps") or []),
        "seconds": round(t["ms"] / 1000), "tokens": t.get("tokens", {}), "models": sorted(models),
        "modelErrors": t.get("modelErrors", 0), "rescued": t.get("rescued", 0), "why": why,
    })

n = len(rows)
ok = sum(r["passed"] for r in rows)
by_site = defaultdict(lambda: [0, 0])
by_diff = defaultdict(lambda: [0, 0])
for r in rows:
    by_site[r["site"]][0] += r["passed"]; by_site[r["site"]][1] += 1
    by_diff[r["difficulty"] or "?"][0] += r["passed"]; by_diff[r["difficulty"] or "?"][1] += 1
tokens = {k: sum((r["tokens"] or {}).get(k, 0) for r in rows) for k in ("calls", "prompt", "completion")}
expected = meta.get("model", "")
others = [r["id"] for r in rows if any(expected not in m for m in r["models"])]
summary = {
    "runId": meta["runId"], "taskSet": "REAL v2", "model": expected, "tier": meta.get("tier"),
    "tasks": n, "passed": ok, "score": round(100 * ok / n, 1) if n else 0.0,
    # The explorer saying "done" when REAL's check says otherwise is worth knowing on its own.
    "saidDoneButFailed": [r["id"] for r in rows if r["agentSaidDone"] and not r["passed"]],
    "bySite": {s: f"{a}/{b}" for s, (a, b) in sorted(by_site.items())},
    "byDifficulty": {d: f"{a}/{b}" for d, (a, b) in sorted(by_diff.items())},
    "avgSteps": round(sum(r["steps"] for r in rows) / n, 1) if n else 0,
    "avgSeconds": round(sum(r["seconds"] for r in rows) / n) if n else 0,
    "tokens": tokens,
    "answeredByAnotherModel": others,
    # Answers the gateway returned empty and LUNA gave again, streamed (run.ts streamedChat).
    "streamedAnswers": sum(r["rescued"] for r in rows),
    "unansweredSteps": sum(r["modelErrors"] for r in rows),
    "rows": rows,
}
(run / "summary.json").write_text(json.dumps(summary, indent=2))
print(f"REAL v2 · {meta['runId']} · {expected}: {ok}/{n} passed ({summary['score']}%)")
print(f"  by site: {summary['bySite']}")
print(f"  by difficulty: {summary['byDifficulty']}")
print(f"  avg {summary['avgSteps']} steps, {summary['avgSeconds']} s per task · tokens: {tokens}")
if summary["saidDoneButFailed"]:
    print(f"  the explorer said done but REAL's check failed: {', '.join(summary['saidDoneButFailed'])}")
if others:
    print(f"  NOT LUNA ALONE — another model answered in: {', '.join(others)}")
for r in rows:
    print(f"  {'PASS' if r['passed'] else 'FAIL'} {r['id']} ({r['steps']} steps, {r['seconds']} s) {'' if r['passed'] else r['why'][:140]}")
