/**
 * Evidence for the API-contract Oracle — the same shape the UI framework's
 * `procol-ui-tests/src/oracle/evidence.ts` records, so a finding written here
 * is indistinguishable (to the platform's `/api/findings` + report generator)
 * from one written by the UI suite. There is no browser here, so `toasts` and
 * `consoleErrors` are always empty — the signal is entirely the HTTP call
 * under test, recorded as a single `httpFailures` entry when the case did not
 * pass outright.
 */

export interface HttpFailure {
  method: string;
  url: string;
  path: string;
  status: number;
  requestBody: string | null;
  responseBody: string;
  at: string;
}

export interface ToastRecord {
  severity: "error" | "warning" | "success" | "info";
  text: string;
  at: string;
}

export interface Evidence {
  flowKey: string;
  startedAt: string;
  finishedAt?: string;
  url?: string;
  httpFailures: HttpFailure[];
  toasts: ToastRecord[];
  consoleErrors: string[];
  /** e.g. the contract case id/title, the endpoint under test, skip reasons. */
  notes: string[];
}

/**
 * Collapse an id-bearing URL down to its route — identical logic to the UI
 * collector's `routeShape`, so the same defect on two different ids (e.g. two
 * different `event_groups` uuids) collapses to one fingerprint.
 */
export function routeShape(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  return path
    .split("/")
    .map((seg) => (seg && !/^[a-z][a-z0-9_-]*$/.test(seg) ? ":id" : seg))
    .join("/");
}

export function newEvidence(flowKey: string): Evidence {
  return {
    flowKey,
    startedAt: new Date().toISOString(),
    httpFailures: [],
    toasts: [],
    consoleErrors: [],
    notes: [],
  };
}
