/** Isolate the case-generation LLM call: show raw output + parse result. */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
import { chat, llmMode } from "../src/ai/llm.js";

console.log("llmMode:", llmMode());

const system =
  "You are a senior QA engineer at Procol (B2B procurement SaaS). Return STRICT JSON only (an array), no markdown.";
const user =
  'Write 2 test cases for creating an RFQ event. SCHEMA: [{"type":"functional","category":"Functional","module":"Event Management","role":"Buyer","scenario":"...","preconditions":"...","steps":["1. ..."],"testData":"Positive: ... | Negative: ...","expectedResult":"...","priority":"P1","severity":"High"}]. Return ONLY the JSON array.';

try {
  const raw = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.4, maxTokens: 1200 },
  );
  console.log("\n--- RAW (len " + raw.length + ") ---\n" + raw.slice(0, 1500));
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  console.log("\n--- bracket idx:", a, b, "---");
  if (a >= 0 && b >= 0) {
    const parsed = JSON.parse(s.slice(a, b + 1));
    console.log("PARSED", Array.isArray(parsed) ? parsed.length : "not-array", "items");
    console.log(JSON.stringify(parsed[0], null, 1));
  }
} catch (e: any) {
  console.log("\nCHAT ERROR:", e?.message ?? e);
}
