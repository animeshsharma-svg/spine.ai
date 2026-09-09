/**
 * THE LLM PROVIDER — one place that talks to the "brain".
 *
 * Provider is a single setting (config/settings.ts → AI.provider). Today: Groq
 * free tier (Llama 3.3 70B). Swapping to Claude later = change the setting +
 * add a key; no agent code changes.
 *
 * KEY IDEA: if no API key is present, we run in "fallback" mode. The agents
 * still produce REAL decisions and REAL results (their logic is deterministic);
 * only the natural-language narration is templated instead of LLM-written. So
 * the whole platform runs end-to-end with ₹0 and no key — and lights up richer
 * prose the moment a key is added.
 */
import { AI } from "../../config/settings.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function llmMode(): "groq" | "fallback" {
  if (AI.provider === "groq" && process.env[AI.groq.apiKeyEnvVar]) return "groq";
  if (AI.provider === "claude" && process.env[AI.claude.apiKeyEnvVar]) return "groq"; // (same OpenAI-style path, later)
  return "fallback";
}

export function providerLabel(): string {
  return llmMode() === "groq"
    ? `${AI.provider} · ${AI.groq.model}`
    : "deterministic fallback (no API key — set GROQ_API_KEY to enable the LLM)";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Raw chat call. Returns "" in fallback mode (callers supply their own text).
 * Retries once on a rate-limit (429) or transient (503), honouring Retry-After. */
export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  if (llmMode() === "fallback") return "";
  const key = process.env[AI.groq.apiKeyEnvVar]!;
  const body = JSON.stringify({
    model: AI.groq.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 900,
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
    // On a rate-limit / transient error, wait and retry once.
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
 * Narrate an agent's reasoning for a non-technical stakeholder.
 * LLM-written when a key is present; the deterministic `facts` text otherwise.
 */
export async function narrate(role: string, facts: string): Promise<string> {
  if (llmMode() === "fallback") return facts;
  try {
    const out = await chat(
      [
        {
          role: "system",
          content:
            `You are the "${role}" agent in an autonomous QA system for Procol, a B2B procurement platform. ` +
            `Explain your reasoning to a smart non-technical stakeholder in 2–4 short, confident sentences. ` +
            `Be concrete and ground every claim in the FACTS provided. Never invent details beyond the facts. No preamble.`,
        },
        { role: "user", content: facts },
      ],
      { temperature: 0.4, maxTokens: 260 },
    );
    return out || facts;
  } catch {
    return facts; // network/key error → graceful fallback, pipeline never breaks
  }
}
