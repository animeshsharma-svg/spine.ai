import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";
import { CONFIG } from "../config.js";
import { buildCreateEvaluation } from "./bodies.js";

export interface EvaluationResult {
  evalFormUuid: string;
  biddingOpen: boolean;
  created: boolean;
  submitted: boolean;
}

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Evaluator flow [19]→[21]: read the technical schema, find the form assigned
 * to this evaluator, score it, and submit.
 */
export async function runEvaluation(
  evaluatorApi: ApiClient,
  evaluatorUuid: string,
  technicalTradeUuid: string,
  vendorCompanyUuid: string = CONFIG.catalog.vendorBidCompanyUuid,
): Promise<EvaluationResult> {
  const schema = await evaluatorApi.get<any>(Endpoints.tradeSchema(technicalTradeUuid));

  const forms = schema.sheets.forms as any[];
  const myForm = forms.find(
    (f) => (f.evaluators || []).some((e: any) => e.shared_with_uuid === evaluatorUuid),
  );
  if (!myForm) {
    throw new Error(`No evaluation form assigned to evaluator ${evaluatorUuid}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const closeTime = schema.extra_closing_time || schema.ending_at || 0;
  const biddingOpen = now < closeTime;

  const created = await evaluatorApi.post<{ success?: boolean }>(Endpoints.evaluations(), {
    body: buildCreateEvaluation({
      technicalTradeUuid,
      vendorCompanyUuid,
      formUuid: myForm.uuid,
      score: randInt(1, 10),
    }),
  });

  const submitted = await evaluatorApi.patch<{ success?: boolean }>(
    Endpoints.submitEvaluation(),
    { body: { trade_request_uuid: technicalTradeUuid } },
  );

  return {
    evalFormUuid: myForm.uuid,
    biddingOpen,
    created: created?.success === true,
    submitted: submitted?.success !== false,
  };
}
