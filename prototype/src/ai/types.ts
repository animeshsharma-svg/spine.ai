import type { OracleVerdict } from "../agents/oracle.js";
/**
 * Shared shapes for the multi-agent orchestrator.
 * One "run" carries a State object that each agent enriches in turn.
 */
import type { Retrieved } from "../rag/knowledgeBase.js";

export type TestType = "functional" | "data-validation" | "edge" | "non-functional";

export interface Evidence {
  source: string;
  text: string;
  score: number;
}

export interface SpecDelta {
  topic: string;
  prdSays: string;
  productDoes: string;
  evidence: string; // where we know this from
  severityHint: "low" | "medium" | "high";
}

export interface AnalystOutput {
  summary: string;
  evidence: Evidence[];
  deltas: SpecDelta[]; // where PRD and the real product disagree
}

export interface UserStory {
  role: "buyer" | "vendor" | "evaluator" | "admin";
  story: string;
  flowHints: string[];
}

export interface PlannedFlow {
  flowId: string;
  name: string;
  category: string;
  why: string;
  enabled: boolean;
  gateReason?: string | null;
}

/** A detailed, professional test case in Procol's house style. */
export interface TestCase {
  id: string; // e.g. "TC-EVT-01"
  type: TestType; // our 4 coverage dimensions (drives the Critic)
  category: string; // pro label, e.g. "Functional, Validation" | "Negative, Security" | "Boundary"
  module: string; // e.g. "Event Management"
  component?: string; // e.g. "Add RFQ Stage"
  role: string; // "Buyer" | "Vendor" | "Evaluator" | "Admin"
  scenario: string; // short title
  preconditions: string;
  steps: string[]; // numbered steps
  testData: string; // "Positive: … | Negative: …"
  expectedResult: string; // precise, incl. DB effect / error message
  priority: string; // "P0" | "P1" | "P2"
  severity: string; // "Critical" | "High" | "Medium"
  flowId?: string;
}

export interface Critique {
  round: number;
  complete: boolean;
  gaps: string[];
  note: string;
}

export interface ValidationCaseResult {
  label: string;
  input: any;
  httpStatus: number | null;
  accepted: boolean;
  message: string | null;
  expectedPerPrd: "accept" | "reject";
  mismatch: boolean; // product behaviour ≠ PRD expectation
}

/** The outcome of one executed automation check (serializable, for UI + history). */
export interface CheckResult {
  id: string;
  flowId: string;
  module: string;
  field?: string;
  scenario: string;
  type: TestType;
  category: string;
  priority: string;
  severity: string;
  expected: "accept" | "reject" | "no-5xx";
  /** Set when the check was refused for a different reason than it tests. */
  inconclusive?: boolean;
  layer: "api" | "ui";
  inputSummary: string;
  /** the request as fired, placeholders resolved — the report's curl */
  request?: { method: string; path: string; body?: unknown };
  httpStatus: number | null;
  accepted: boolean;
  message: string | null;
  durationMs: number;
  pass: boolean;
  verdict: string;
}

export interface Finding {
  title: string;
  severity: "low" | "medium" | "high";
  whatHappened: string;
  where: string; // button / endpoint / file
  likelyCause: string;
  evidence: string[];
  breaksProduct: boolean;
}

export interface Report {
  headline: string;
  summary: string;
  passed: number;
  failed: number;
  findings: Finding[];
  recommendation: string;
}

/** The single state object threaded through the whole graph. */
export interface RunState {
  // input
  request: string;
  companyId: number;
  companyName?: string | null;
  // per-agent outputs
  spec?: AnalystOutput;
  stories?: UserStory[];
  plan?: PlannedFlow[];
  cases?: TestCase[];
  validationResults?: ValidationCaseResult[];
  checkResults?: CheckResult[]; // executed automation checks
  flowResults?: any[]; // FlowResult[] from executor.ts
  critique?: Critique;
  /** Oracle verdicts — what the evidence means, not just that it failed. */
  verdicts?: OracleVerdict[];
  /** Tags the UI framework's findings files belonging to this run. */
  uiRunId?: string;
  report?: Report;
  // control
  designRound: number;
}

/** An event streamed live to the UI as the agents work. */
export interface AgentEvent {
  seq: number;
  agent: string;
  status: "start" | "reasoning" | "done" | "error";
  title: string;
  reasoning?: string;
  data?: any;
  ts: string;
}
