/**
 * THE LLM PROVIDER — one place that talks to the "brain".
 *
 * Providers, in the order tried:
 *   1. Slingring  — Procol's OpenAI-compatible gateway (SLINGRING_API_KEY)
 *   2. Groq       — free tier, gpt-oss-120b (GROQ_API_KEY)
 *   3. Gemini     — free tier (GOOGLE_API_KEY)
 *
 * Every call names a TIER rather than a model: "reason" for the compiler and
 * anything where a wrong answer costs a wrong run, "fast" for routing and
 * narration. Each provider maps the tier onto what it has, so agent code never
 * spells a model name and swapping providers is a key, not a refactor.
 *
 * KEY IDEA: with no key at all the platform still runs end to end. The agents'
 * decisions are deterministic; only the natural-language narration is
 * templated instead of written. Nothing hard-fails in a demo.
 */
import { AI } from "../../config/settings.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type Tier = "reason" | "fast" | "long";

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Groq's reasoning model needs this kept low or it spends the budget thinking. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Which quality of model the call deserves. Defaults to "fast". */
  tier?: Tier;
  /** How long Slingring may take before the next provider is tried; each tier has its own default. */
  deadlineMs?: number;
}

type Mode = "slingring" | "groq" | "fallback";

export function llmMode(): Mode {
  if (process.env[AI.slingring.apiKeyEnvVar]) return "slingring";
  if (AI.provider === "groq" && process.env[AI.groq.apiKeyEnvVar]) return "groq";
  return "fallback";
}

export function providerLabel(): string {
  switch (llmMode()) {
    case "slingring":
      return `slingring · ${AI.slingring.models.reason} / ${AI.slingring.models.fast}`;
    case "groq":
      return `groq · ${AI.groq.model}`;
    default:
      return "deterministic fallback (no API key — set SLINGRING_API_KEY or GROQ_API_KEY to enable the LLM)";
  }
}

/** Which provider actually served the last call, for honest reporting. */
export let lastProviderUsed = "none";
/** The model the gateway REPORTED serving, which may differ from the one asked for. */
export let lastServedModel = "";
const warnedReroute = new Set<string>();

// ── spend, counted ──────────────────────────────────────────────────────────
//
// ASTRA is $50 per million tokens against a $50/day allowance. A compiler that
// quietly re-tries three times with a 3,000-token budget can spend a meaningful
// share of that in an afternoon, so every Slingring response's `usage` is
// tallied per model and exposed to the dashboard. The number is what the
// gateway reported, not an estimate.
export interface UsageTally {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  usd: number;
}
const usage = new Map<string, UsageTally>();
export function usageReport(): { byModel: Record<string, UsageTally>; totalUsd: number } {
  const byModel: Record<string, UsageTally> = {};
  let totalUsd = 0;
  for (const [m, t] of usage) {
    byModel[m] = t;
    totalUsd += t.usd;
  }
  return { byModel, totalUsd };
}
function tally(model: string, u: { prompt_tokens?: number; completion_tokens?: number } | undefined) {
  if (!u) return;
  const t = usage.get(model) ?? { calls: 0, promptTokens: 0, completionTokens: 0, usd: 0 };
  t.calls += 1;
  t.promptTokens += u.prompt_tokens ?? 0;
  t.completionTokens += u.completion_tokens ?? 0;
  const rate = AI.slingring.usdPerMillion[model];
  if (rate) t.usd += (((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)) / 1_000_000) * rate;
  usage.set(model, t);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── providers ───────────────────────────────────────────────────────────────

function slingringModel(tier: Tier = "fast"): string {
  return AI.slingring.models[tier];
}

/**
 * Slingring speaks OpenAI: same request, same response. One retry on 429/503
 * even though the gateway has its own circuit breakers — a second attempt is
 * cheap and a demo stalling on a transient is not.
 */
async function slingringChat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const key = process.env[AI.slingring.apiKeyEnvVar]!;
  const model = slingringModel(opts.tier);
  // The gateway reroutes freely — on 2026-09-11 every HACK26 GPT model was
  // being served by azure_ai/Kimi-K2.7-Code, a REASONING model that spends
  // tokens on `reasoning_content` before any `content`. A 5-token budget came
  // back as content:"" with finish_reason:"length". Give the answer its budget
  // AND a reasoning allowance on top, whichever model ends up answering.
  // Measured 2026-09-11: a compile (3,000-token answer budget) with a 1,500
  // allowance still ended finish_reason:"length" with empty content — Kimi
  // reasoned through the lot. The reason tier gets room to think; the fast
  // tier answers short questions and needs far less.
  const REASONING_ALLOWANCE = opts.tier === "reason" ? 6_000 : 1_500;
  /**
   * HOW LONG THIS TIER IS WORTH WAITING FOR.
   *
   * Measured 2026-09-11: the gateway serves every HACK26 model with
   * azure_ai/Kimi-K2.7-Code, and a one-word answer takes ~11s. Groq answers
   * the same prompt in ~0.6s. That is fine for the compiler, where a better
   * plan is worth ten seconds — and it is the whole reason the 7-agent run
   * looked dead: seven agents at 11-20s each is over two minutes of blank
   * screen for work that used to take fifteen seconds.
   *
   * So the tiers get different patience. `reason` is allowed to think; the
   * inner loop is not, and hands over to the next provider rather than making
   * someone watch a spinner. Overridable per environment: a faster day on the
   * gateway only needs SLINGRING_FAST_TIMEOUT_MS raised.
   */
  const deadline = opts.deadlineMs ?? (opts.tier === "reason" || opts.tier === "long"
    ? Number(process.env.SLINGRING_SLOW_TIMEOUT_MS ?? 90_000)
    : Number(process.env.SLINGRING_FAST_TIMEOUT_MS ?? 4_000));
  // The gateway's HACK26 GPT models are reasoning models that refuse ANY
  // `temperature` ("Unsupported parameter: 'temperature' is not supported with
  // this model", HTTP 400 — verified 2026-10-01 for LUNA and ASTRA). Sending it
  // made every Slingring call fail and fall silently to Groq. Leave it out
  // unless an environment says its models accept it.
  const sendTemperature = process.env.SLINGRING_SEND_TEMPERATURE === "1";
  const body = JSON.stringify({
    model,
    messages,
    ...(sendTemperature ? { temperature: opts.temperature ?? 0.3 } : {}),
    max_tokens: (opts.maxTokens ?? 900) + REASONING_ALLOWANCE,
  });
  if (process.env.SLINGRING_LOG_SIZE) console.log(`[llm] slingring ${model}: ${messages.reduce((n, m) => n + String(m.content ?? "").length, 0)} chars in, deadline ${deadline}ms`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const stop = AbortSignal.timeout(deadline);
    let res: Response;
    try {
      res = await fetch(`${AI.slingring.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body,
        signal: stop,
      });
    } catch (err) {
      // A deadline is a hand-off, not a crash: the chain tries the next one.
      throw new Error(
        (err as Error).name === "TimeoutError"
          ? `slingring did not answer the ${opts.tier ?? "fast"} tier within ${deadline}ms`
          : (err as Error).message,
      );
    }
    if (res.ok) {
      const j: any = await res.json();
      const served = String(j.model ?? model);
      tally(served, j.usage);
      lastServedModel = served;
      if (!served.includes(model) && !warnedReroute.has(model)) {
        warnedReroute.add(model);
        console.log(`[llm] slingring served "${model}" with ${served} (gateway fallback) — reported as such, not as ${model}`);
      }
      const content = String(j.choices?.[0]?.message?.content ?? "").trim();
      const finish = j.choices?.[0]?.finish_reason;
      // Empty content is a failure to be handed down the chain, not an answer.
      if (!content) throw new Error(`${served} returned no content (finish_reason: ${finish})`);
      return content;
    }
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(Math.min(6000, retryAfter * 1000 || 2500));
      continue;
    }
    throw new Error(`Slingring ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return "";
}

async function groqChat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const key = process.env[AI.groq.apiKeyEnvVar];
  if (!key) throw new Error("no GROQ_API_KEY");
  // `openai/gpt-oss-120b` is a REASONING model: it spends the token budget on a
  // hidden `reasoning` field before emitting any `content`. Ask for a short
  // answer and you get HTTP 200 with content:"" and finish_reason:"length".
  // Keeping the reasoning effort low leaves the budget for the answer.
  const body = JSON.stringify({
    model: AI.groq.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 900,
    reasoning_effort: opts.reasoningEffort ?? "low",
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${AI.groq.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body,
    });
    if (res.ok) {
      const j: any = await res.json();
      return j.choices?.[0]?.message?.content?.trim() ?? "";
    }
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(Math.min(6000, retryAfter * 1000 || 3500));
      continue;
    }
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return "";
}

/**
 * Gemini is the last provider in the chain, so it must not give up on a passing "503 high
 * demand" (seen 2026-10-21 while Slingring was over budget: three 503s in six seconds left the
 * compiler with no model and a generic plan). On 503 / 429 it waits and tries again, then the
 * next model in the list; a 4xx that is not a rate limit fails at once.
 */
async function geminiChat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("no GOOGLE_API_KEY for the fallback provider");
  const models = [...new Set([process.env.AI_FALLBACK_MODEL ?? "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"])];
  // Gemini has no system role: fold system messages into the first user turn.
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const contents = rest.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: i === 0 && system ? `${system}\n\n${m.content}` : m.content }],
  }));
  const body = JSON.stringify({ contents, generationConfig: { temperature: opts.temperature ?? 0.3, maxOutputTokens: opts.maxTokens ?? 900 } });
  let lastErr = "";
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = String(json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "");
        if (model !== models[0]) console.log(`[llm] gemini answered with ${model} (the first choice was busy)`);
        return text;
      }
      lastErr = `Gemini ${res.status} (${model}): ${(await res.text()).replace(/\s+/g, " ").slice(0, 160)}`;
      const busy = res.status === 503 || res.status === 429;
      if (!busy) break; // a real refusal (bad model name, bad key): try the next model, no waiting
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3_000));
    }
  }
  throw new Error(lastErr || "Gemini answered nothing");
}

// ── the chain ───────────────────────────────────────────────────────────────

/**
 * Ask the best available provider; fall through on failure, and log every
 * hand-off so a run's output is never quietly attributed to the wrong model.
 * Returns "" only when NO provider could answer.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const chain: Array<[string, () => Promise<string>]> = [];
  if (process.env[AI.slingring.apiKeyEnvVar]) chain.push([`slingring:${slingringModel(opts.tier)}`, () => slingringChat(messages, opts)]);
  if (process.env[AI.groq.apiKeyEnvVar]) chain.push(["groq", () => groqChat(messages, opts)]);
  if (process.env.GOOGLE_API_KEY) chain.push(["gemini", () => geminiChat(messages, opts)]);
  if (!chain.length) return "";

  let lastErr: Error | null = null;
  const failed: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const [name, call] = chain[i];
    try {
      const text = await call();
      if (!text.trim()) throw new Error(`${name} returned no content`);
      lastProviderUsed = name;
      // name EVERY provider that failed, not only the last one: "groq unavailable" alone hid
      // that the primary (Slingring) had failed first, for a whole batch
      if (i > 0) console.log(`[llm] ${failed.join("; ")} — answered with ${name}`);
      return text;
    } catch (err) {
      lastErr = err as Error;
      failed.push(`${name} unavailable (${lastErr.message.replace(/\s+/g, " ").slice(0, 90)})`);
    }
  }
  // Every provider failed. Callers treat "" as "use the deterministic path".
  console.log(`[llm] no provider could answer: ${lastErr?.message.slice(0, 120)}`);
  if (chain.length === 1) throw lastErr!;
  return "";
}

/**
 * Narrate an agent's reasoning for a non-technical stakeholder.
 * LLM-written when a key is present; the deterministic `facts` text otherwise.
 */
export async function narrate(role: string, facts: string): Promise<string> {
  if (llmMode() === "fallback" && !process.env.GOOGLE_API_KEY) return facts;
  try {
    const out = await chat(
      [
        {
          role: "system",
          content:
            `You are the "${role}" agent in spine.ai, an autonomous QA system for Procol, a B2B procurement platform. ` +
            `Explain your reasoning to a smart non-technical stakeholder in 2–4 short, confident sentences. ` +
            `Be concrete and ground every claim in the FACTS provided. Never invent details beyond the facts. No preamble.`,
        },
        { role: "user", content: facts },
      ],
      { temperature: 0.4, maxTokens: 260, tier: "fast" },
    );
    return out || facts;
  } catch {
    return facts; // network/key error → graceful fallback, pipeline never breaks
  }
}
