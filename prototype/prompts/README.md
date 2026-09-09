# Routing prompt corpus

This directory holds a **labelled evaluation corpus** for `interpret()` in
`prototype/src/agents/uiIntent.ts` — the function that turns a free-text QA
instruction ("test a two-stage RFP then RFQ event with 4 line items") into a
`UiIntent` (which journey to run from `UI_FLOWS` in
`prototype/src/ui/uiFlowRunner.ts`, plus `lineItems` / `template` /
`scheduleMinutes` / a `caveat`).

## This is an EVALUATION set, not fine-tuning data

That distinction matters, so it is stated plainly:

- **Fine-tuning data** would be fed into a training run to change a model's
  weights — the model would be updated to better predict these exact
  input/output pairs, and its behaviour on prompts *outside* the set would
  shift as a side effect of that training.
- **This corpus does neither.** Nothing here is ever used as a training
  signal. `routing.jsonl` is a fixed set of prompts with a hand-labelled
  *correct answer* (`expect`) attached. `scripts/eval-routing.ts` runs the
  *existing, unmodified* `interpret()` — whatever model or fallback logic it
  currently uses — against every prompt and checks whether its output matches
  the label. The model's weights (Groq's hosted Llama 3.3 70B, reached via
  `chat()`) are never touched; nothing here can touch them, since they belong
  to Groq, not to us.

In short: this measures **how accurate today's router is**, the same way a
test suite measures whether code behaves as specified. It does not make the
router smarter by itself — that only happens if someone reads the eval
output and changes the prompt, the model, or the keyword fallback in
`uiIntent.ts` in response to what it finds.

## Files

- `routing.jsonl` — the labelled corpus, one JSON object per line.
- `last-eval.json` — written by `npm run eval:routing`; the full per-case
  result of the most recent run. Not hand-edited; regenerated each run.

## Corpus format

One JSON object per line (JSONL, so a diff shows one changed case per line):

```json
{"id":"r001","prompt":"Create an RFQ-only event with 4 line items","expect":{"flowKey":"events.rfq_only","lineItems":4,"template":null,"scheduleMinutes":null},"why":"Direct RFQ-only phrasing with a digit line-item count.","tags":["events","params"]}
```

Fields:

- **`id`** — stable, unique (`r001`, `r002`, …). Never renumber existing
  cases when adding new ones; append instead, so old results stay comparable
  run over run.
- **`prompt`** — the free-text instruction, written the way a QA engineer
  actually types it (not the catalog label verbatim).
- **`expect`** — the correct routing decision:
  - **`flowKey`** — the exact key from `UI_FLOWS`, when exactly one journey
    is the right answer. Mutually exclusive with `flowKeyAnyOf`.
  - **`flowKeyAnyOf`** — an array of keys, used only when the prompt is
    genuinely ambiguous (more than one journey is a defensible read). The
    router's choice is scored correct if it lands anywhere in this list.
  - **`lineItems`** — expected integer, or `null` when the prompt does not
    imply a count, **or** when the chosen journey does not take a line-item
    count at all (`UI_FLOWS[i].usesLineItems` is falsy) — `interpret()`
    always nulls this field itself in that case, regardless of what a model
    guesses, so the label must too.
  - **`template`** — expected template-name substring, or `null`.
  - **`scheduleMinutes`** — expected integer minutes (convert hours yourself:
    "2 hours" → `120`), or `null`.
  - **`expectCaveat`** — `true` only on prompts that ask for something no
    journey actually covers (BOQ, the vendor's own portal, a mobile app).
    Omit entirely (do not set `false`) on every other case — the scorer
    treats a missing key as "a caveat here would be a false positive."
- **`why`** — one line explaining the label, for the next human who reads
  a miss and has to decide whether the corpus or the router is wrong.
- **`tags`** — free-form array for filtering/reporting (`"events"`,
  `"params"`, `"ambiguous"`, `"caveat"`, `"boq"`, `"words"`, `"hours"`, …).

## How to add a case

1. Pick the next `id` (highest existing `rNNN` + 1).
2. Write the prompt the way a real QA engineer would type it — pull phrasing
   from `prototype/knowledge/events/frontend-test-cases.json` and
   `backend-test-cases.json` where you can; they are 296 real, structured
   Procol test cases and a much better source of realistic language than
   anything invented from scratch.
3. Work out the expected answer **by reading `uiIntent.ts` and
   `uiFlowRunner.ts`**, not by running the router and copying its output —
   that would just encode whatever the router currently does, correct or
   not, and the corpus would stop being able to catch regressions.
4. Only reference `flowKey` values that exist in `UI_FLOWS` today. If you are
   tempted to invent one, that prompt belongs in the `expectCaveat: true`
   / out-of-scope set instead.
5. Append the line to `routing.jsonl` (don't reorder existing lines) and run
   `npm run eval:routing` to see where it lands.

## Running the evaluation

From `prototype/`:

```bash
npm run eval:routing
```

Reads `GROQ_API_KEY` from `.env` (same as the other scripts under
`scripts/`), calls the real `interpret()` for every case with a small delay
between calls to stay under the free Groq tier's rate limit, retries on a
429, prints a summary table, and exits non-zero if overall accuracy drops
below `EVAL_MIN_ACCURACY` (default `0.85`).
