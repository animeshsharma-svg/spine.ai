import { Page } from "@playwright/test";
import { ClientProfile } from "../config.js";
import { ClientConfig } from "./config.js";

/**
 * The UI-layer twin of the API framework's `FlowModule`. Same shape so the
 * future orchestrator can treat UI and API tests identically as callable units.
 */
export interface UiFlowModule {
  key: string;
  category: string;
  title: string;
  /** What this flow covers — grounding for the Knowledge Catalog. */
  covers?: string;
  /** Ordering hints (keys of flows that should run first). */
  dependsOn?: string[];
  /** Decide whether this flow applies to the client's config. */
  enabledFor(config: ClientConfig): Gate;
  /** Execute the flow. Should be self-verifying and throw on failure. */
  run(ctx: UiFlowContext): Promise<void>;
}

export interface Gate {
  enabled: boolean;
  reason: string;
}

export function gate(enabled: boolean, reason: string): Gate {
  return { enabled, reason };
}

/** Everything a flow needs at runtime. */
export interface UiFlowContext {
  page: Page;
  profile: ClientProfile;
  config: ClientConfig;
}

/** Structured, orchestrator-friendly result for one flow. */
export interface FlowResult {
  key: string;
  category: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  reason?: string;
  error?: string;
  durationMs: number;
  details?: Record<string, unknown>;
}
