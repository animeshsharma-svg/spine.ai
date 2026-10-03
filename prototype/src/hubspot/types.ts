/**
 * HUBSPOT SUPPORT TICKETS → REGRESSION CASES — the shapes.
 *
 * A RawTicket is customer data. It lives in memory only, for as long as the
 * ingest takes to strip it; it is never written to the spine database, never
 * sent to a model, never committed. Everything downstream works on a
 * StrippedTicket (see strip.ts), and only what passes the leak check is ever
 * shown to the fast-tier model.
 */

export interface ThreadMessage {
  /** "inbound" = the customer wrote it; "outbound" = support replied */
  direction: string;
  text: string;
}

/** One ticket as it arrives, from a JSON export, a CSV or an XLSX. */
export interface RawTicket {
  id: string;
  subject: string;
  content: string;
  category?: string;
  priority?: string;
  pipeline?: string;
  pipelineStage?: string;
  createdAt?: string;
  closedAt?: string;
  lastModifiedAt?: string;
  sourceType?: string;
  /** used ONLY to build the stripping dictionary; never stored */
  companyNames: string[];
  /** used ONLY to build the stripping dictionary; never stored */
  contactNames: string[];
  /** support-owner names (CSV "Ticket owner"); dictionary only, never stored */
  ownerNames: string[];
  thread: ThreadMessage[];
  /** where it came from — conversation threads exist only in the JSON export */
  inputKind: "json" | "csv" | "xlsx";
}

export type PiiKind =
  | "email"
  | "phone"
  | "url"
  | "gstin"
  | "pan"
  | "ifsc"
  | "bank_account"
  | "aadhaar"
  | "upi"
  | "pincode"
  | "address"
  | "name"
  | "company"
  | "greeting"
  | "signature"
  | "attachment"
  | "long_number";

export interface StrippedTicket {
  id: string;
  subject: string;
  /** stripped description + stripped thread, labelled by who wrote it */
  text: string;
  /** a short summary for people: stripped subject + the first lines of the description */
  summary: string;
  category?: string;
  priority?: string;
  pipeline?: string;
  pipelineStage?: string;
  createdAt?: string;
  closedAt?: string;
  sourceType?: string;
  /** a Procol client id when the ticket's company maps to a known tenant; else null ("a client") */
  clientId: number | null;
  /** what was removed, by kind (counts only) */
  removed: Partial<Record<PiiKind, number>>;
  /** leak check: kinds of personal data that SURVIVED stripping (empty = clean) */
  leaks: string[];
  hasThread: boolean;
  inputKind: RawTicket["inputKind"];
}

export type Classification = "defect" | "how_to" | "request" | "config" | "data" | "unclear";
export type DecidedBy = "rule" | "embedding" | "llm" | "none";
export type ReproStatus = "not_tried" | "reproduced" | "not_reproduced" | "needs_confirmation" | "not_automatable";

export interface Scenario {
  /** the defect pattern this ticket matched (patterns.ts), or "generic" / "llm" */
  pattern: string;
  eventType: "rfq_only" | "rfp_only" | "rfp_rfq" | "rfp_auction" | "auction" | "unknown";
  preconditions: string;
  steps: string[];
  expected: string;
  observed: string;
  /** client the case should run on when the ticket maps to one (else the default demo client) */
  clientId: number | null;
  /** an app error code involved, when the ticket names one that the backend documents */
  errorCode?: string;
  /** backend lines that state the rule (verified by hand when the pattern was written) */
  backendCite?: string;
  /** a library case (EDGE-…) that sends the same request, when one exists */
  libraryTwin?: string;
  /** false when no API plan can express it (screen-only, PDF, auctions with no recipe) */
  automatable: boolean;
  /** why not, when automatable is false */
  notAutomatableBecause?: string;
  /** which journey group the generated case lives in (journeys.ts) */
  journeyGroup: string;
  /** text written by the model (stored in spine.ai only, never in the committed catalog) */
  modelWritten?: boolean;
}

export interface ProcessedTicket {
  ticket: StrippedTicket;
  classification: Classification;
  classificationConfidence: number;
  classifiedBy: DecidedBy;
  classificationWhy: string;
  module: string | null;
  featureKey: string | null;
  mapConfidence: number;
  mappedBy: DecidedBy;
  mapCandidates: Array<{ feature: string; score: number }>;
  scenario: Scenario | null;
  /** HS-<id>-N, filled when the case file is written */
  linkedCaseIds: string[];
  /** true when the ticket was kept away from the model (leak check failed, or no key) */
  aiSkipped: boolean;
  aiSkippedWhy?: string;
  inEventsScope: boolean;
  dataset: "hubspot" | "synthetic";
}
