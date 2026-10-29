#!/bin/zsh
# Score one run folder: collect the run records, read each event's facts from Procol's DB (read-only),
# then judge every case against cases.json.   ./score.sh 2026-10-27   → runs/2026-10-27-results.json
set -e
HERE=${0:A:h}
TAG=${1:-$(date +%F)}
python3 $HERE/collect.py $HERE/runs/$TAG > $HERE/runs/$TAG-runs.json
TITLES=$(python3 -c "
import json; t=sorted({x for r in json.load(open('$HERE/runs/$TAG-runs.json')).values() for x in r['titles']})
print('{' + ','.join('\"' + x.replace('\"', '') + '\"' for x in t) + '}')")
node $HERE/../dbq.mjs "$(grep -v '^--' $HERE/../procol-stress/facts.sql)" "$TITLES" > $HERE/runs/$TAG-facts.json
python3 $HERE/score.py $HERE/runs/$TAG-runs.json $HERE/runs/$TAG-facts.json $HERE/judged.json > $HERE/runs/$TAG-results.json
