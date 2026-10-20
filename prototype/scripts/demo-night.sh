#!/usr/bin/env bash
# THE NIGHT BEFORE THE DEMO — one browser, one thing after another, the Mac kept awake:
#   1. walk the events flow and photograph every screen (scripts/screen-walk.ts)
#   2. run every event combination with the spotlight on (scripts/combo-night.ts)
#   3. write cases for any library screen that has none yet (scripts/screen-record.ts --fill-cases)
#   4. rebuild the memory so the planner recalls the screen pages (npm run rag:build)
#
#   bash scripts/demo-night.sh [companyId]        logs: data/nightly/night-<date>-*.log
#
# Everything it creates on UAT is a test event (spine-ui-automation-…), QA vendors only.
set -u
cd "$(dirname "$0")/.."
C="${1:-198678}"
D="$(date +%Y-%m-%d)"
mkdir -p data/nightly
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "data/nightly/night-$D.log"; }

log "night starts on company $C"
log "1/4 walking the events flow"
npx tsx scripts/screen-walk.ts --c "$C" --max 6 > "data/nightly/night-$D-walk.log" 2>&1
log "   walk exit $? — $(grep -c '📷' "data/nightly/night-$D-walk.log") screens photographed"

log "2/4 every event combination"
npx tsx scripts/combo-night.ts --c "$C" > "data/nightly/night-$D-combos.log" 2>&1
log "   combos exit $? — $(grep -E '^\[[0-9:]+\] done:' "data/nightly/night-$D-combos.log" | tail -1)"

log "3/4 cases for screens without any"
npx tsx scripts/screen-record.ts --fill-cases --c "$C" --max 6 > "data/nightly/night-$D-cases.log" 2>&1
log "   cases exit $?"

log "4/4 rebuilding the memory"
npm run -s rag:build > "data/nightly/night-$D-rag.log" 2>&1
log "   rag exit $?"
log "night done"
