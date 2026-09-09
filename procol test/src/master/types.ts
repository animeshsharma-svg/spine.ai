import type { ClientContext } from "../context.js";
import type { ClientConfig } from "./config.js";

/** Context handed to every flow: the resolved client + its loaded config. */
export interface FlowContext extends ClientContext {
  config: ClientConfig;
}

export interface Gate {
  enabled: boolean;
  /** why it's on/off — shown in the run output when skipped. */
  reason?: string;
}

/**
 * A self-contained, client-agnostic flow in the master registry. It sets up its
 * own prerequisites (e.g. creates its own event) and asserts its own outcome.
 */
export interface FlowModule {
  /** stable id, e.g. "events.rfp_rfq" */
  key: string;
  /** grouping shown in output, e.g. "events" | "vendor" | "intake" */
  category: string;
  /** human title */
  title: string;
  /** Decide if this flow applies to the client, from its config. */
  enabledFor(config: ClientConfig): Gate;
  /** Run the flow; throw to fail. */
  run(ctx: FlowContext): Promise<void>;
}

/** Helper to build a Gate. */
export const gate = (enabled: boolean, reason?: string): Gate => ({ enabled, reason });
