# REAL benchmark for the spine.ai explorer

[REAL](https://github.com/agi-inc/agisdk) (AGI Inc., NeurIPS 2025) scores web agents on copies of
11 real sites. We use its task set v2: 121 tasks, all checked by code against the site's state,
so no judge model is needed. (v1's Omnizon site was taken down; v2 has it at a new address.)

`run.ts` gives each task to our explorer (`procol-ui-tests/src/explore`) with LUNA, then reads
the site's state back. `grade.py` judges that state with REAL's own checks and writes the score.

## Set up (once)

```sh
cd procol-qa-platform/benchmarks/real
python3 -m venv .bootstrap && .bootstrap/bin/pip install uv     # REAL needs Python ≥ 3.10
.bootstrap/bin/uv python install 3.12 && .bootstrap/bin/uv venv --python 3.12 .venv
.bootstrap/bin/uv pip install --python .venv/bin/python agisdk
.venv/bin/python -m playwright install chromium
```

## Run

```sh
../../prototype/node_modules/.bin/tsx run.ts --tasks omnizon-13     # one task
../../prototype/node_modules/.bin/tsx run.ts --site omnizon --limit 3
../../prototype/node_modules/.bin/tsx run.ts --all                  # all 121
.venv/bin/python grade.py results/<run>
```

The model key is read from `prototype/.env` (SLINGRING_API_KEY). Only LUNA answers: Groq and
Gemini are switched off unless `BENCH_FALLBACK=1`, and the summary lists any task another
model touched. `--steps` sets the explorer's step budget (30 by default); `--headed` shows
the browser.
