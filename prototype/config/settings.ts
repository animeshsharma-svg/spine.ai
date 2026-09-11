/**
 * ONE place for every setting the QA platform uses.
 * Change things here — never hardcode them deeper in the code.
 *
 * Beginner note: `as const` just tells TypeScript "these values won't change",
 * which gives us nicer auto-complete. You can ignore it.
 */

// ── 1. Environments ───────────────────────────────────────────────────────
// An environment = one Procol backend (API + its database) that we test.
// For the hackathon we only use UAT. Adding another later = one more entry.
export const ENVIRONMENTS = {
  uat: {
    label: "UAT",
    apiBaseUrl: "https://sec-api-v1.ag-ri.in/api",
    // The database connection lives in `procol test/.env` as DATABASE_URL.
    // We reuse that file rather than copy the secret here.
    databaseUrlEnvVar: "DATABASE_URL",
    appVersion: "9.4.388",
  },
} as const;

export type EnvironmentKey = keyof typeof ENVIRONMENTS;

/** Which environment is active. Only UAT exists today. */
export const ACTIVE_ENVIRONMENT: EnvironmentKey = "uat";

// ── 2. Default client ─────────────────────────────────────────────────────
// The "build-everything" demo client. The UI will still let you pick others.
export const DEFAULT_CLIENT = {
  companyId: 198678,
  name: "PROCOL DEMO",
} as const;

// ── 3. Tunables ───────────────────────────────────────────────────────────
// How the test flows behave. All adjustable; sensible demo-safe defaults.
export const TUNABLES = {
  // How many line items to put on a created event.
  lineItemCount: 1,
  // Quantity used for each line item.
  quantity: 10,
  // Unit price used where a price is needed.
  price: 100,
  // How long (seconds) a bid window stays open in flows that need one.
  bidWindowSeconds: 30,
  // Per-flow time budget (milliseconds) before we give up.
  flowTimeoutMs: 120_000,
  // Title prefix so test-created records are easy to spot / clean up later.
  titlePrefix: "QA_Platform_",
} as const;

// ── 4. AI provider ────────────────────────────────────────────────────────
// The "brain". Provider is ONE setting so we can swap Groq → Claude later
// without touching the agents. Keys are read from environment variables,
// never written in code.
export const AI = {
  // "groq" (free, primary) | "ollama" (local offline fallback) | "claude" (paid, later)
  provider: "groq" as "groq" | "ollama" | "claude",

  groq: {
    // Groq's hosted lineup changes over time. Pick any id returned by
    // GET https://api.groq.com/openai/v1/models. gpt-oss-120b is a strong,
    // free, general model good at structured JSON output.
    model: "openai/gpt-oss-120b",
    apiKeyEnvVar: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  ollama: {
    model: "llama3.1",
    baseUrl: "http://localhost:11434",
  },
  claude: {
    model: "claude-haiku-4-5-20251001",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  // Google Gemini — free tier from aistudio.google.com (no billing). Big context
  // + high tokens-per-minute, which suits driving large UI pages with Stagehand.
  google: {
    // gemini-flash-lite-latest measured ~0.8s/call vs ~17-50s for the heavier
    // "latest" flash models (overloaded on free tier); 2.0/2.5 are blocked for
    // new keys. Lite is fast + plenty smart for finding form fields / reading
    // labels. Bump a specific hard step to a stronger model later if needed.
    model: "gemini-flash-lite-latest",
    apiKeyEnvVar: "GOOGLE_API_KEY",
  },

  // Slingring — Procol's OpenAI-compatible gateway for HACK26. When its key is
  // present it is the FIRST provider tried; Groq and Gemini become fallbacks.
  // Fallbacks and circuit breakers exist inside Slingring too, so a rate-limited
  // request reroutes there before it ever reaches ours.
  slingring: {
    apiKeyEnvVar: "SLINGRING_API_KEY",
    baseUrl: process.env.SLINGRING_BASE_URL ?? "http://slingring.procol.tech",
    models: {
      // The compiler and anything else where a wrong answer costs a wrong run.
      // $50 per 1M tokens — used deliberately, not by default.
      reason: process.env.SLINGRING_REASON_MODEL ?? "HACK26_GPT_6_ASTRA",
      // Routing, narration, classification: the inner loop.
      fast: process.env.SLINGRING_FAST_MODEL ?? "HACK26_GPT_5_6_LUNA",
      // 1.1M context — for handing over a whole catalog section at once.
      long: process.env.SLINGRING_LONG_MODEL ?? "HACK26_GPT_5_6_SOL",
      embed: process.env.SLINGRING_EMBED_MODEL ?? "HACK26_TEXT_EMBED_3_LARGE",
    },
    // Published price per 1M tokens, so the dashboard can show spend.
    usdPerMillion: { HACK26_GPT_6_ASTRA: 50 } as Record<string, number>,
  },

  // Embeddings (text → numbers) run locally in-process via Transformers.js —
  // no install, no Docker, ₹0. This model is small and downloads once on first use.
  embeddings: {
    provider: "transformers-js" as const,
    model: "Xenova/all-MiniLM-L6-v2",
  },
} as const;

// ── 5. Stagehand UI layer ─────────────────────────────────────────────────
// The self-healing browser layer. It reads a web PAGE (not the codebase), so it
// needs an LLM with generous tokens-per-minute for big screens. Gemini Flash's
// free tier fits best; Groq's low TPM chokes on large DOMs. Model is provider-
// prefixed the way Stagehand wants it (e.g. "google/…", "groq/…", "openai/…").
export const STAGEHAND = {
  // "google/<model>" drives the UI. Swap the provider prefix to change engines.
  model: `google/${AI.google.model}` as string,
  apiKeyEnvVar: AI.google.apiKeyEnvVar, // GOOGLE_API_KEY
  headless: false, // false = you WATCH the Chromium window
  slowMoMs: 120, // small delay so the run is followable by eye
  // observe()→act() is the self-healing pattern. Action caching may be Browserbase-
  // backed; leave OFF until we confirm it works on a purely-local run (Phase 1b).
  useCache: false,
} as const;
