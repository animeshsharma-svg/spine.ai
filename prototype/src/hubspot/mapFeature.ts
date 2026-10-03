/**
 * WHICH PART OF THE PRODUCT IS THIS TICKET ABOUT? — the feature tree's 94 leaves.
 *
 *   1 · a defect pattern (patterns.ts) names its feature outright      → rule
 *   2 · keyword phrases per feature, scored by phrase length           → rule
 *   3 · the embedder (src/rag/embedder.ts) between the stripped text
 *       and each feature's description, to separate a keyword tie or
 *       when no keyword matched                                        → embedding
 *   4 · the Slingring fast tier picks among the top candidates, only
 *       when 2 and 3 cannot separate them, and only for a clean ticket → llm
 *
 * The feature vectors are cached per embedder in data/hubspot/ (git-ignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE_TREE, type FeatureNode } from "../../config/featureTree.js";
import { embedderId, embedMany, embedOne, ensureEmbedderReady, similarity } from "../rag/embedder.js";
import { askFastJson, slingringAvailable } from "./slingringFast.js";
import { matchPattern } from "./patterns.js";
import type { DecidedBy, StrippedTicket } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const HUBSPOT_DIR = join(here, "..", "..", "data", "hubspot");

/** Phrases customers and support use for each feature (lower case). Longer phrases weigh more. */
export const FEATURE_KEYWORDS: Record<string, string[]> = {
  "events.type_rules": ["event type", "type of event"],
  "events.rfp_only": ["rfp only", "technical only", "technical event"],
  "events.rfq_only": ["rfq event", "rfq only", "request for quotation"],
  "events.rfp_rfq": ["rfp and rfq", "rfp + rfq", "technical and commercial", "technical round", "technical stage", "rfp end", "712", "rfp duration"],
  "events.rfp_auction": ["technical and auction", "rfp and auction"],
  "events.validation": ["line item", "line items", "quantity", "unit of measure", "uom", "unit", "units", "item code", "product code", "495"],
  "events.config": ["template", "schedule", "bid end time", "start time", "end time", "submission window", "evaluation window", "timeline"],
  "events.awarding_rule": ["lot wise", "lot-wise", "full lot", "awarding rule"],
  "events.invite_vendors": ["invite", "invited", "add vendor", "vendor list", "participants", "audience", "can't see the event", "cannot see the event", "not able to see", "not visible to vendor", "vendor cannot see", "vendor can't see"],
  "events.publish": ["publish", "published", "go live", "went live", "activate the event"],
  "events.extend_deadline": ["extend", "extension", "extended", "reopen", "deadline extension"],
  "events.lifecycle": ["withdraw", "withdrawn", "draft event", "event status", "history tab", "closed event", "clone", "copy an old", "copy the event", "duplicate the event"],
  "events.templates": ["event template", "rfq template", "template field"],
  "events.boq": ["boq", "bill of quantities", "bill of quantity"],
  "events.terms": ["terms and conditions", "t&c", "terms & conditions"],
  "events.versioning": ["new version", "amend", "amendment", "revision", "revise the event", "version 1."],
  "auction.convert": ["convert to auction", "move to auction", "rfq to auction"],
  "auction.rank": ["rank", "ranking", "l1", "gold silver bronze", "rank based"],
  "auction.price": ["price based auction", "lowest price shown"],
  "auction.traffic_light": ["traffic light", "red yellow green"],
  "auction.knockout": ["knockout"],
  "auction.dutch": ["dutch auction"],
  "auction.increments": ["decrement", "minimum bid", "bid increment", "minimum decrement"],
  "auction.dynamic_extension": ["auto extend", "auto-extend", "dynamic extension", "sniping", "extended automatically"],
  "auction.serial_bidding": ["serial bidding", "line by line auction"],
  "auction.visibility": ["see other vendor", "other vendors' price", "competitor price"],
  "bids.participation": ["participate", "participation", "decline", "regret", "intent"],
  "bids.quick_fill": ["quick fill"],
  "bids.place": ["place bid", "place a bid", "quote", "quotation", "price entry", "enter price"],
  "bids.price_cap": ["price cap", "ceiling price", "max price"],
  "bids.submit": ["submit bid", "submit the bid", "submitted", "revise bid", "resubmit", "late bid", "after the deadline", "after deadline", "after closing", "after the event closed", "after the bid end"],
  "bids.surrogate": ["surrogate", "surrogate bid", "on behalf of the vendor", "on behalf of vendor"],
  "bids.counter_offer": ["counter offer", "counteroffer"],
  "evaluation.score": ["technical evaluation", "evaluation score", "evaluator", "not fit", "scoring"],
  "evaluation.granularity": ["line item level evaluation", "vendor level evaluation"],
  "evaluation.tna": ["technically not acceptable", "tna"],
  "evaluation.qcs": ["comparison sheet", "qcs", "mqcs", "compare quotes", "quote comparison", "savings", "l1 l2"],
  "negotiation.counter_offer": ["negotiation", "negotiate"],
  "negotiation.vendor_response": ["accept the counter", "reject the counter"],
  "award.proposal": ["award proposal", "create award"],
  "award.add_response": ["award total", "awarded amount", "award value", "award quantity", "awarded quantity", "award lines"],
  "award.partial": ["partial award", "split award", "split quantity"],
  "award.submit": ["submit for approval", "submit the award"],
  "award.approval": ["award approval", "approve the award", "approver", "send back"],
  "award.re_evaluation": ["re-evaluation", "re evaluation"],
  "po.generate": ["purchase order", "generate po", "po creation", "create po"],
  "po.release": ["po release", "release the po", "acknowledge the po"],
  "pr.to_event": ["pr to event", "start purchasing", "convert pr"],
  "pr.list": ["purchase request", "pr list"],
  "users.create": ["create user", "add user", "new user", "new users", "add new users"],
  "users.permissions": ["permission", "role", "access rights", "password", "reset password", "login", "log in", "locked out", "otp"],
  "vendors.onboarding": ["vendor onboarding", "vendor registration", "onboarding form", "vendor gst", "gstin of our vendor", "vendor details", "bank details"],
  "vendors.invite": ["invite a vendor to register", "vendor invitation email"],
  "masterdata.product": ["product master", "item master"],
  "masterdata.location": ["delivery location", "warehouse"],
  "platform.configurations": ["configuration", "settings", "enable the feature"],
  "p2p.invoice": ["invoice", "invoice amount", "invoice value"],
  "p2p.grn": ["grn", "goods receipt", "grn quantity", "received quantity"],
  "finance.payment": ["payment"],
};

interface FeatureDoc {
  id: string;
  group: string;
  text: string;
}

export function featureDocs(): FeatureDoc[] {
  return FEATURE_TREE.flatMap((g) =>
    g.children.map((f: FeatureNode) => ({
      id: f.id,
      group: g.id,
      text: `${g.label}: ${f.label}. ${f.what}${FEATURE_KEYWORDS[f.id] ? ` (${FEATURE_KEYWORDS[f.id].join(", ")})` : ""}`,
    })),
  );
}

export function moduleOf(featureId: string): string | null {
  return FEATURE_TREE.find((g) => g.children.some((f) => f.id === featureId))?.id ?? null;
}

const kwRe = (k: string) => new RegExp(`(?<![a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![a-z0-9])`, "i");

export function keywordScores(lower: string): Array<{ feature: string; score: number }> {
  const out: Array<{ feature: string; score: number }> = [];
  for (const [feature, words] of Object.entries(FEATURE_KEYWORDS)) {
    let score = 0;
    for (const w of words) if (kwRe(w).test(lower)) score += w.split(/\s+/).length;
    if (score) out.push({ feature, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── feature vectors, cached per embedder ────────────────────────────────────

let vectors: { embedder: string; byId: Map<string, number[]> } | null = null;

async function featureVectors(): Promise<{ embedder: string; byId: Map<string, number[]> }> {
  await ensureEmbedderReady();
  const id = embedderId();
  if (vectors?.embedder === id) return vectors;
  const file = join(HUBSPOT_DIR, "feature-vectors.json");
  const docs = featureDocs();
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      if (j.embedder === id && docs.every((d) => j.vectors?.[d.id] && j.texts?.[d.id] === d.text)) {
        vectors = { embedder: id, byId: new Map(Object.entries(j.vectors)) };
        return vectors;
      }
    } catch {
      /* rebuild */
    }
  }
  const vs = await embedMany(docs.map((d) => d.text));
  vectors = { embedder: id, byId: new Map(docs.map((d, i) => [d.id, vs[i]])) };
  mkdirSync(HUBSPOT_DIR, { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ embedder: id, texts: Object.fromEntries(docs.map((d) => [d.id, d.text])), vectors: Object.fromEntries(vectors.byId) }),
  );
  return vectors;
}

// ── the decision ────────────────────────────────────────────────────────────

export interface MapResult {
  feature: string | null;
  module: string | null;
  confidence: number;
  by: DecidedBy;
  candidates: Array<{ feature: string; score: number }>;
  why: string;
}

const EMBED_MARGIN = 0.025;

export async function mapTicket(t: StrippedTicket, opts: { ai: boolean; embed: boolean }): Promise<MapResult> {
  const lower = `${t.subject}\n${t.text}`.toLowerCase();
  const done = (feature: string | null, confidence: number, by: DecidedBy, candidates: MapResult["candidates"], why: string): MapResult => ({
    feature,
    module: feature ? moduleOf(feature) : null,
    confidence: Number(confidence.toFixed(2)),
    by,
    candidates: candidates.slice(0, 5),
    why,
  });

  // 1 · a defect pattern names its feature
  const p = matchPattern(lower);
  const kw = keywordScores(lower);
  if (p) return done(p.feature, 0.9, "rule", kw, `matches the “${p.id}” defect pattern`);

  // 2 · keywords
  const [k1, k2] = kw;
  if (k1 && k1.score >= 3 && k1.score - (k2?.score ?? 0) >= 2) return done(k1.feature, Math.min(0.85, 0.5 + 0.08 * k1.score), "rule", kw, `keywords: ${k1.feature} scored ${k1.score}`);

  // 3 · the embedder, among the keyword ties (or everything, when no keyword matched)
  let ranked: Array<{ feature: string; score: number }> = [];
  if (opts.embed) {
    try {
      const fv = await featureVectors();
      const q = await embedOne(lower.slice(0, 2000));
      const pool = k1 ? kw.filter((k) => k.score >= k1.score - 1).map((k) => k.feature) : [...fv.byId.keys()];
      ranked = pool.map((f) => ({ feature: f, score: Number(similarity(q, fv.byId.get(f) ?? []).toFixed(4)) })).sort((a, b) => b.score - a.score);
      const [e1, e2] = ranked;
      if (e1 && (!e2 || e1.score - e2.score >= EMBED_MARGIN)) {
        return done(e1.feature, Math.min(0.8, 0.45 + (e2 ? (e1.score - e2.score) * 4 : 0.3)), "embedding", ranked, `embedding: ${e1.feature} ${e1.score} vs ${e2?.feature ?? "-"} ${e2?.score ?? "-"}`);
      }
    } catch (e) {
      ranked = [];
      if (!k1) return done(null, 0, "none", [], `embedder unavailable (${(e as Error).message.slice(0, 80)})`);
    }
  }
  const shortlist = (ranked.length ? ranked : kw).slice(0, 4);
  if (!shortlist.length) return done(null, 0, "none", [], "no keyword matched and no embedding was available");

  // 4 · the fast model breaks the tie
  if (opts.ai && slingringAvailable() && shortlist.length > 1) {
    const docs = new Map(featureDocs().map((d) => [d.id, d.text]));
    const ans = await askFastJson(
      "You map a Procol support ticket (personal data removed) to ONE product feature. " +
        'Answer ONLY with JSON: {"feature": one of the given ids, "confidence": number 0..1}.',
      `Ticket:\n${t.subject}\n${t.text.slice(0, 3000)}\n\nCandidate features:\n${shortlist.map((s) => `- ${s.feature}: ${docs.get(s.feature)}`).join("\n")}`,
      120,
    );
    const o = ans as { feature?: unknown; confidence?: unknown } | null;
    if (o && typeof o.feature === "string" && shortlist.some((s) => s.feature === o.feature) && typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1) {
      return done(o.feature, Math.min(0.75, o.confidence), "llm", shortlist, `the fast model chose among ${shortlist.map((s) => s.feature).join(", ")}`);
    }
  }
  const best = shortlist[0];
  return done(best.feature, 0.35, ranked.length ? "embedding" : "rule", shortlist, `weak: best of ${shortlist.map((s) => `${s.feature} ${s.score}`).join(", ")}`);
}
