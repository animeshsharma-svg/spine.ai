/**
 * THE ORCHESTRATOR — wires the agents into a LangGraph state machine.
 *
 *   analyst → planner → designer → data → critic ─┬─(gap)→ designer  (loop)
 *                                                 └─(ok)→ executor → oracle → reporter
 *
 * The Critic can send work back to the Test-designer until coverage is complete
 * (self-correction). Every agent emits a live event so the UI can show the AI
 * reasoning as it happens. The client is opened once and reused for all live
 * calls (config read, flow execution, validation probe).
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import {
  analyst,
  planner,
  testDesigner,
  dataAgent,
  critic,
  executorAgent,
  reporter,
  type Emit,
} from "./agents.js";
import { oracleAgent } from "./oracle.js";
import { openClientContext } from "../executor.js";
import { providerLabel } from "../ai/llm.js";
import type { AgentEvent, RunState } from "../ai/types.js";

// The state threaded through the graph (last-write-wins channels).
const S = Annotation.Root({
  request: Annotation<string>(),
  companyId: Annotation<number>(),
  companyName: Annotation<string | null | undefined>(),
  spec: Annotation<any>(),
  stories: Annotation<any>(),
  plan: Annotation<any>(),
  cases: Annotation<any>(),
  validationResults: Annotation<any>(),
  checkResults: Annotation<any>(),
  flowResults: Annotation<any>(),
  critique: Annotation<any>(),
  verdicts: Annotation<any>(),
  uiRunId: Annotation<string | undefined>(),
  report: Annotation<any>(),
  designRound: Annotation<number>({ reducer: (_a, b) => b ?? 0, default: () => 0 }),
});

type Client = Awaited<ReturnType<typeof openClientContext>>;

function buildGraph(emit: Emit, client: Client) {
  const g = new StateGraph(S)
    .addNode("analyst", (s: any) => analyst(s, emit) as any)
    .addNode("planner", (s: any) => planner(s, emit, client) as any)
    .addNode("designer", (s: any) => testDesigner(s, emit) as any)
    .addNode("data", (s: any) => dataAgent(s, emit) as any)
    .addNode("critic", (s: any) => critic(s, emit) as any)
    .addNode("executor", (s: any) => executorAgent(s, emit, client) as any)
    .addNode("oracle", (s: any) => oracleAgent(s, emit) as any)
    .addNode("reporter", (s: any) => reporter(s, emit) as any)
    .addEdge(START, "analyst")
    .addEdge("analyst", "planner")
    .addEdge("planner", "designer")
    .addEdge("designer", "data")
    .addEdge("data", "critic")
    .addConditionalEdges("critic", (s: any) => (s.critique?.complete ? "executor" : "designer"), {
      designer: "designer",
      executor: "executor",
    })
    // The Oracle sits between doing and telling. The Executor knows what
    // happened; only the Oracle decides what it MEANS, and the Reporter must
    // never be the thing that quietly turns a 500 into "some checks failed".
    .addEdge("executor", "oracle")
    .addEdge("oracle", "reporter")
    .addEdge("reporter", END);
  return g.compile();
}

export interface OrchestratorResult {
  state: RunState;
  events: AgentEvent[];
  provider: string;
}

/** Run the whole pipeline. `onEvent` receives each agent event live. */
export async function runOrchestrator(
  request: string,
  companyId: number,
  onEvent?: (e: AgentEvent) => void,
  uiRunId?: string,
): Promise<OrchestratorResult> {
  const events: AgentEvent[] = [];
  let seq = 0;
  const emit: Emit = (e) => {
    const ev: AgentEvent = { seq: seq++, ts: new Date().toISOString(), ...e };
    events.push(ev);
    onEvent?.(ev);
  };

  emit({ agent: "System", status: "start", title: `AI provider: ${providerLabel()}` });
  const client = await openClientContext(companyId);
  try {
    const graph = buildGraph(emit, client);
    const final = (await graph.invoke(
      { request, companyId, designRound: 0, uiRunId },
      { recursionLimit: 25 },
    )) as RunState;
    emit({ agent: "System", status: "done", title: "Run complete" });
    return { state: final, events, provider: providerLabel() };
  } finally {
    await client.dispose().catch(() => {});
  }
}
