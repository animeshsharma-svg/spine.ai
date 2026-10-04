/**
 * THE ONLY MODEL A SUPPORT TICKET MAY REACH — Slingring, fast tier, JSON out.
 *
 * The owner approved AI tagging of tickets through Slingring (Procol's own
 * gateway) and nothing else. The platform's general chat() falls through to
 * Groq and Gemini when Slingring is slow, which is right for narration and
 * wrong here: a stripped ticket is still customer-derived text. So this file
 * talks to Slingring directly, never falls through, and refuses to run if the
 * fast-tier model is configured to be the $50/1M reason model.
 *
 * Callers pass only text that passed the leak check (strip.ts). Answers are
 * parsed as JSON and validated by the caller's schema check; anything else is
 * "no answer" and the deterministic path decides.
 */
import { AI } from "../../config/settings.js";

export interface FastUsage {
  calls: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
}
export const fastUsage: FastUsage = { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0 };

export function slingringAvailable(): boolean {
  return !!process.env[AI.slingring.apiKeyEnvVar] && process.env.HUBSPOT_AI !== "off";
}

function fastModel(): string {
  const m = AI.slingring.models.fast;
  if (!m || m === AI.slingring.models.reason) throw new Error("the fast tier is configured as the reason model — refusing (ticket tagging may never use the $50/1M tier)");
  return m;
}

/** Pull the first JSON object out of a model answer (it may wrap it in prose or a code fence). */
export function parseJsonObject(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * One question, one JSON answer. Bounded: 30 s per attempt, two attempts.
 * Returns null on any failure — the caller falls back to its rules.
 */
export async function askFastJson(system: string, user: string, maxTokens = 500): Promise<unknown> {
  if (!slingringAvailable()) return null;
  const key = process.env[AI.slingring.apiKeyEnvVar]!;
  const body = JSON.stringify({
    model: fastModel(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // The gateway's HACK26 models are reasoning models: give the answer its own budget on top of the thinking.
    max_tokens: maxTokens + 1_500,
  });
  const deadline = Number(process.env.HUBSPOT_AI_TIMEOUT_MS ?? 30_000);
  for (let attempt = 0; attempt < 2; attempt++) {
    fastUsage.calls += 1;
    try {
      const res = await fetch(`${AI.slingring.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(deadline),
      });
      if (!res.ok) {
        fastUsage.failures += 1;
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 2_500));
          continue;
        }
        return null;
      }
      const j: any = await res.json();
      fastUsage.promptTokens += j.usage?.prompt_tokens ?? 0;
      fastUsage.completionTokens += j.usage?.completion_tokens ?? 0;
      const parsed = parseJsonObject(String(j.choices?.[0]?.message?.content ?? ""));
      if (parsed) return parsed;
      fastUsage.failures += 1;
    } catch {
      fastUsage.failures += 1;
    }
  }
  return null;
}
