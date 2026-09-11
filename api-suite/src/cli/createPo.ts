#!/usr/bin/env ts-node
import * as dotenv from 'dotenv';
dotenv.config();

import { ClientConfig, DatasourceConfig } from '../types';
import { loadAllClientConfigs, loadClientConfig } from '../lib/configStore';
import { loadMasterPo, documentRoleOf, lineItemOverridesFor, MasterPo } from '../lib/masterPo';
import { DocumentPlan, planDocument, newRunId } from '../lib/plan';
import { RelationResolver, datasourceIdIndex } from '../runtime/relationResolver';
import { createRecord, submitDocument } from '../runtime/createRecord';
import { Coercion, PO_INPUT_PATH, PoInput, coerceOverrides, forClient, loadPoInput } from '../lib/poInput';
import { resetApiCallLog, setApiLogStep } from '../lib/apiLog';
import { approveRecord, fetchRecordApprovals, verifyApprovalFlow } from '../runtime/approvals';
import { buildApiReport } from '../report/buildApiReport';

/**
 * Creates one Purchase Order from `config/po-input.json`.
 *
 * Whatever the file sets is used; whatever it leaves out is generated exactly
 * as an unattended test run would. Values are passed to the platform as given
 * — a bad dropdown option or an unknown field is reported with the platform's
 * own response rather than being blocked here.
 *
 * Creates the header, its line items, then submits the document into its
 * approval flow so it leaves draft. `--no-submit` stops after the line items.
 *
 *     npm run po
 *     npm run po -- --no-submit
 *     npm run po -- --input config/po-input.json --client procol_sandbox_demo
 */

interface Args { client?: string; input?: string; noSubmit?: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.client = argv[++i];
    else if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--no-submit') args.noSubmit = true;
  }
  return args;
}

/** `JSON.stringify` yields undefined for an undefined body, so guard before
 * trimming — an empty error body must not crash the reporting path. */
function preview(body: unknown, max: number): string {
  if (body === undefined) return '(empty response body)';
  return (JSON.stringify(body) ?? String(body)).slice(0, max);
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function headerDatasource(client: ClientConfig, master: MasterPo): [string, DatasourceConfig] | undefined {
  return Object.entries(client.datasources).find(
    ([key, ds]) => ds.role === 'header' || documentRoleOf(master, key)?.side === 'header'
  );
}

function reportCoercions(coercions: Coercion[]): void {
  for (const c of coercions) {
    if (c.dropped) {
      console.log(`    ${yellow('!')} ${c.field} = ${JSON.stringify(c.given)} ${dim('— ' + c.warning + '; NOT sent')}`);
    } else if (c.warning) {
      console.log(`    ${yellow('!')} ${c.field} = ${JSON.stringify(c.given)} ${dim('— ' + c.warning + '; sending as given')}`);
    } else if (JSON.stringify(c.given) !== JSON.stringify(c.sent)) {
      console.log(`    ${green('·')} ${c.field} = ${JSON.stringify(c.given)} ${dim('→ sent as ' + JSON.stringify(c.sent))}`);
    } else {
      console.log(`    ${green('·')} ${c.field} = ${JSON.stringify(c.sent)}`);
    }
  }
}

async function resolveRelations(client: ClientConfig, plan: DocumentPlan) {
  const resolver = new RelationResolver(
    client, RelationResolver.datasourceIndex(client, datasourceIdIndex(client))
  );
  const { resolved, failed } = await resolver.resolve(plan.pendingLookups, plan.datasourceUuid);
  for (const relation of resolved) {
    const pending = plan.pendingLookups.find((f) => f.name === relation.field);
    if (pending) plan.fields.push({ ...pending, value: relation.recordUuid });
  }
  return { resolved, failed };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const loaded: PoInput = loadPoInput(args.input);
  const clientId = args.client ?? loaded.client ?? loadAllClientConfigs()[0]?.id;
  // Client-specific values folded over the shared blocks, now the client is known.
  const input: PoInput = forClient(loaded, String(clientId));
  if (!clientId) throw new Error('No client configured. Run `npm run discover -- --client <id>` first.');

  const client = loadClientConfig(clientId);
  const master = loadMasterPo();
  const found = headerDatasource(client, master);
  if (!found) throw new Error(`No PO header datasource found for ${clientId}.`);
  const [headerKey, header] = found;

  const runId = newRunId();
  // The report is built from reports/api-calls/, so start from a clean slate —
  // otherwise it would stitch this PO together with the previous run's calls.
  resetApiCallLog();

  console.log(`\n${bold('Purchase Order')} ${dim('— ' + client.id + ' / ' + headerKey)}   ${dim('run ' + runId)}`);
  console.log(dim(`input: ${args.input ?? PO_INPUT_PATH}`));

  // ---- header -----------------------------------------------------------
  const { overrides, coercions } = coerceOverrides(header, input.header);
  console.log(`\n  ${bold('Header')} ${dim(`— ${coercions.length} from input, the rest generated`)}`);
  reportCoercions(coercions);

  const plan = planDocument(client, header, master, { runId }, overrides);
  setApiLogStep('resolve header relations');
  const { failed } = await resolveRelations(client, plan);
  for (const f of failed) console.log(`    ${yellow('!')} ${f.field} ${dim('— ' + f.reason)}`);
  console.log(dim(`    sending ${plan.fields.length} fields in total`));

  setApiLogStep('create PO header');
  const created = await createRecord(client, header, plan);
  if (!created.ok || !created.recordUuid) {
    console.log(`\n  ${red('✗ create failed')} ${dim('HTTP ' + created.status)}`);
    console.log(dim('    ' + preview(created.body, 800)));
    if (created.error) console.log(dim('    ' + created.error));
    process.exitCode = 1;
    return;
  }
  console.log(`  ${green('✓ created')} ${dim('record ' + created.recordUuid)}`);

  // ---- line items -------------------------------------------------------
  const lineItemKey = header.lineItemKeyAttribute;
  const lineItems = lineItemKey ? client.datasources[lineItemKey] : undefined;
  if (!lineItems) {
    console.log(dim('\n  No line-item datasource discovered — header only.'));
    return;
  }

  // The input file wins on how many lines and what they hold; without it,
  // master-po.json decides.
  const perLine = input.lineItems?.length
    ? input.lineItems
    : lineItemOverridesFor(master.documents.purchase_order);

  console.log(`\n  ${bold('Line items')} ${dim(`— ${perLine.length}`)}`);
  let total = 0;
  for (const [index, configured] of perLine.entries()) {
    const line = coerceOverrides(lineItems, configured);
    const lineOverrides = {
      ...line.overrides,
      ...(lineItems.parentLinkField ? { [lineItems.parentLinkField]: created.recordUuid } : {}),
    };
    const linePlan = planDocument(client, lineItems, master, { runId, index }, lineOverrides);
    setApiLogStep(`line item ${index + 1}: resolve relations`);
    await resolveRelations(client, linePlan);
    setApiLogStep(`line item ${index + 1}: create`);
    const result = await createRecord(client, lineItems, linePlan);

    const qty = Number(lineOverrides.quantity ?? linePlan.fields.find((f) => f.name === 'quantity')?.value);
    const price = Number(lineOverrides.unit_price ?? linePlan.fields.find((f) => f.name === 'unit_price')?.value);
    const amount = Number.isFinite(qty * price) ? qty * price : NaN;
    if (Number.isFinite(amount)) total += amount;

    const mark = result.ok ? green('✓') : red('✗');
    const sum = Number.isFinite(amount) ? `qty ${qty} × ${price} = ${amount.toFixed(2)}` : 'generated values';
    console.log(`    ${mark} line ${index + 1}  ${dim(sum)}`);
    if (!result.ok) console.log(dim('        ' + preview(result.body, 400)));
  }

  if (total > 0) console.log(dim(`\n    expected total base amount: ${total.toFixed(2)}`));

  // ---- submit ------------------------------------------------------------
  // A created PO is a draft until it enters its approval flow. Skipped with a
  // clear reason rather than silently, so "still a draft" is never a mystery.
  if (args.noSubmit) {
    console.log(dim('\n  Submit skipped (--no-submit).'));
  } else if (!header.approvalFlowUuid) {
    console.log(
      `\n  ${yellow('!')} ${dim('Not submitted — ' + headerKey + ' has no approvalFlowUuid in its client config.')}`
    );
  } else {
    console.log(`\n  ${bold('Submit')}`);
    setApiLogStep('verify approval flow');
    const check = await verifyApprovalFlow(client, header);
    if (!check.ok) {
      console.log(`    ${red('✗')} ${dim(check.reason ?? 'approval flow could not be verified')}`);
    } else {
      setApiLogStep('submit for approval');
      const submitted = await submitDocument(client, header, created.recordUuid as string, {
        remarks: `AUTO ${runId}`,
      });
      if (!submitted.ok) {
        console.log(`    ${red('✗ submit failed')} ${dim('HTTP ' + submitted.status + ' ' + preview(submitted.body ?? submitted.error, 200))}`);
      } else {
        // Read the flow back: a 200 on submit is not proof the record moved.
        setApiLogStep('read approval state');
        const state = await fetchRecordApprovals(client, created.recordUuid as string);
        console.log(`    ${green('✓ submitted')} ${dim('for approval')}`);
        if (!state.submitted) {
          console.log(`      ${yellow('!')} ${dim('no approval request found on the record — still a draft')}`);
        } else {
          console.log(
            dim(`      flow "${state.flowName ?? '?'}" (${state.keyAttribute ?? '?'}) — status ${state.status}, ${state.steps.length} step(s)`)
          );

          // A submitted PO sits in approval until every step is resolved.
          // Approve the steps these credentials own, and say who the rest wait on.
          setApiLogStep('approve');
          const outcome = await approveRecord(client, created.recordUuid as string, {
            remarks: `AUTO approved ${runId}`,
          });
          if (outcome.approved > 0) {
            console.log(`    ${green('✓ approved')} ${dim(outcome.approved + ' step(s)')}`);
          }
          if (outcome.reason) console.log(dim(`      ${outcome.reason}`));

          const finalState = outcome.state;
          const verdict = finalState.complete
            ? green('fully approved — out of draft')
            : yellow(`still ${finalState.status}`);
          console.log(`      ${verdict}`);
          for (const step of finalState.steps) {
            const who = step.approvers.flatMap((a) => a.requestedFrom).join(', ');
            console.log(dim(`      · ${step.name ?? 'step'}: ${step.status}${who ? ' — ' + who : ''}`));
          }
          if (outcome.waitingOn.length) {
            console.log(
              dim(`      waiting on: ${outcome.waitingOn.join(', ')} (needs their own login)`)
            );
          }
        }
      }
    }
  }

  setApiLogStep(undefined);
  const report = buildApiReport();

  console.log(`\n${green('Done.')} ${dim('Find it by searching AUTO in the PO list, or by run id ' + runId)}`);
  if (report) {
    console.log(
      dim(`Run report: reports/po-run-report.html — ${report.steps} step(s), ${report.calls} call(s)`)
    );
  }
  console.log();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
