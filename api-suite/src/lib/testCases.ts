import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ClientConfig, ClientFieldEntry, DatasourceConfig, ValidationRule } from '../types';
import { intendedRole } from './policy';

const ROOT = path.resolve(__dirname, '..', '..');
export const CASE_FILE_PATH = path.join(ROOT, 'config', 'test-cases.yaml');

/** What the platform is expected to do with a case. */
export type Expectation = 'accept' | 'reject';

export interface TestCase {
  /** stable id, used in the test title so a failure names the case */
  id: string;
  name: string;
  kind: 'positive' | 'negative' | 'edge';
  /** key_attribute of the datasource the record is created on */
  datasource: string;
  /** field name -> value, applied over the generated defaults */
  overrides: Record<string, unknown>;
  expect: Expectation;
  /** why this case exists — shown when it fails */
  because: string;
  source: 'generated' | 'file';
  /** set to skip with a reason rather than delete the case */
  skip?: string;
}

const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const daysFromNow = (days: number) => nowSeconds() + days * DAY;

/**
 * Turns one recorded validation rule into the cases that prove the platform
 * enforces it: a violation that must be rejected, and the boundary value that
 * must be accepted.
 *
 * Boundaries matter as much as violations — a platform that rejects everything
 * would pass a suite made only of negative cases.
 */
function casesForRule(
  datasourceKey: string,
  fieldName: string,
  entry: ClientFieldEntry,
  rule: ValidationRule
): TestCase[] {
  const bound = Number((rule.configuration as { value?: unknown } | undefined)?.value ?? 0);
  const otherField = (rule.configuration as { field_key?: string } | undefined)?.field_key;
  const base = { datasource: datasourceKey, source: 'generated' as const };
  const label = `${datasourceKey}.${fieldName}`;

  // Checked before the operator switch: a `same_datasource` rule reuses the
  // comparison operators ("greater_than_or_equals"), but compares against
  // another field rather than a fixed bound. Matching on the operator alone
  // would read it as a numeric minimum of 0 and generate a nonsense case.
  if (rule.rule_type === 'same_datasource' && otherField) {
    return [
      { ...base, id: `${label}.cross.violate`, kind: 'negative', expect: 'reject',
        name: `${fieldName} rejects a value before ${otherField}`,
        because: `schema rule: ${fieldName} must be >= ${otherField}`,
        overrides: { [otherField]: daysFromNow(10), [fieldName]: daysFromNow(1) } },
      { ...base, id: `${label}.cross.boundary`, kind: 'edge', expect: 'accept',
        name: `${fieldName} accepts the same date as ${otherField}`,
        because: `">= ${otherField}" includes equality`,
        overrides: { [otherField]: daysFromNow(5), [fieldName]: daysFromNow(5) } },
    ];
  }

  switch (rule.operator) {
    case 'greater_than':
      return [
        { ...base, id: `${label}.gt.violate`, kind: 'negative', expect: 'reject',
          name: `${fieldName} rejects ${bound}, which is not greater than ${bound}`,
          because: `schema rule: ${fieldName} must be greater than ${bound}`,
          overrides: { [fieldName]: bound } },
        { ...base, id: `${label}.gt.boundary`, kind: 'edge', expect: 'accept',
          name: `${fieldName} accepts ${bound + 1}, the smallest value above ${bound}`,
          because: `the boundary of "greater than ${bound}" must still be usable`,
          overrides: { [fieldName]: bound + 1 } },
      ];

    case 'greater_than_or_equals':
      return [
        { ...base, id: `${label}.gte.violate`, kind: 'negative', expect: 'reject',
          name: `${fieldName} rejects ${bound - 1}, below its minimum of ${bound}`,
          because: `schema rule: ${fieldName} must be >= ${bound}`,
          overrides: { [fieldName]: bound - 1 } },
        { ...base, id: `${label}.gte.boundary`, kind: 'edge', expect: 'accept',
          name: `${fieldName} accepts exactly ${bound}, its minimum`,
          because: `">= ${bound}" includes ${bound} itself`,
          overrides: { [fieldName]: bound } },
      ];

    case 'greater_than_or_equals_current_date':
      return [
        { ...base, id: `${label}.futuredate.violate`, kind: 'negative', expect: 'reject',
          name: `${fieldName} rejects yesterday`,
          because: `schema rule: ${fieldName} may not be in the past`,
          overrides: { [fieldName]: daysFromNow(-1) } },
        { ...base, id: `${label}.futuredate.boundary`, kind: 'edge', expect: 'accept',
          name: `${fieldName} accepts today`,
          because: `"not in the past" includes today`,
          overrides: { [fieldName]: nowSeconds() } },
      ];

    case 'less_than_or_equals_current_date':
      return [
        { ...base, id: `${label}.pastdate.violate`, kind: 'negative', expect: 'reject',
          name: `${fieldName} rejects tomorrow`,
          because: `schema rule: ${fieldName} may not be in the future`,
          overrides: { [fieldName]: daysFromNow(1) } },
        { ...base, id: `${label}.pastdate.boundary`, kind: 'edge', expect: 'accept',
          name: `${fieldName} accepts today`,
          because: `"not in the future" includes today`,
          overrides: { [fieldName]: nowSeconds() } },
      ];

    case 'greater_than_or_equals_field':
    case 'greater_than_or_equals_same_datasource':
      return [];

    default:
      if (rule.operator === 'is_unique') {
        return [
          { ...base, id: `${label}.unique.violate`, kind: 'negative', expect: 'reject',
            name: `${fieldName} rejects a duplicate value`,
            because: `schema rule: ${fieldName} must be unique`,
            // filled in at run time from a record that already exists
            overrides: { [fieldName]: '__DUPLICATE__' } },
        ];
      }
      void entry;
      return [];
  }
}

/**
 * A rule can only be tested on a field we are able to set. `base_amount` and
 * `tax_amount` are formulas and `quantity_booked` is read-only: planDocument
 * drops them before overrides are applied, so a "violate the rule" case would
 * send nothing at all, the create would succeed, and the case would fail for a
 * reason that has nothing to do with the platform.
 */
function isTestable(entry: ClientFieldEntry): boolean {
  return intendedRole(entry) === 'writable';
}

/** Every case the client's own schema implies, for one datasource. */
export function generateCasesFor(datasourceKey: string, datasource: DatasourceConfig): TestCase[] {
  const cases: TestCase[] = [];
  for (const [fieldName, entry] of Object.entries(datasource.fields)) {
    if (!entry.present || !isTestable(entry)) continue;
    for (const rule of entry.validations ?? []) {
      cases.push(...casesForRule(datasourceKey, fieldName, entry, rule));
    }
  }
  return cases;
}

/**
 * Rules on fields we cannot set — reported rather than silently dropped, so
 * the gap between "rules declared" and "rules tested" stays visible.
 */
export function untestableRules(datasourceKey: string, datasource: DatasourceConfig): string[] {
  const out: string[] = [];
  for (const [fieldName, entry] of Object.entries(datasource.fields)) {
    if (!entry.present || isTestable(entry)) continue;
    for (const rule of entry.validations ?? []) {
      out.push(`${datasourceKey}.${fieldName} (${rule.operator}) — ${intendedRole(entry)}, cannot be set`);
    }
  }
  return out;
}

/** Rules we recorded but produce no case for — reported so coverage stays honest. */
export function unexercisedRules(client: ClientConfig, coveredDatasources: string[]): string[] {
  const out: string[] = [];
  for (const [key, ds] of Object.entries(client.datasources)) {
    if (coveredDatasources.includes(key)) continue;
    for (const [fieldName, entry] of Object.entries(ds.fields)) {
      for (const rule of entry.validations ?? []) {
        out.push(`${key}.${fieldName} (${rule.rule_type}/${rule.operator})`);
      }
    }
  }
  return out;
}

interface RawCaseFile {
  cases?: Array<{
    name: string;
    kind?: TestCase['kind'];
    datasource: string;
    expect: Expectation;
    because?: string;
    skip?: string;
    overrides?: Record<string, unknown>;
  }>;
}

/** Cases a human wrote — business scenarios the schema cannot express. */
export function loadCaseFile(file: string = CASE_FILE_PATH): TestCase[] {
  if (!fs.existsSync(file)) return [];
  const parsed = (YAML.parse(fs.readFileSync(file, 'utf8')) ?? {}) as RawCaseFile;
  return (parsed.cases ?? []).map((c, i) => ({
    id: `file.${i + 1}`,
    name: c.name,
    kind: c.kind ?? (c.expect === 'reject' ? 'negative' : 'positive'),
    datasource: c.datasource,
    overrides: c.overrides ?? {},
    expect: c.expect,
    because: c.because ?? 'hand-written case',
    source: 'file' as const,
    skip: c.skip,
  }));
}

/**
 * The full suite for one client: everything the schema implies, plus everything
 * a human added. Generated cases come first so a schema change is visible at
 * the top of the run.
 */
export function allCasesFor(client: ClientConfig, datasourceKeys: string[]): TestCase[] {
  const generated = datasourceKeys.flatMap((key) => {
    const ds = client.datasources[key];
    return ds ? generateCasesFor(key, ds) : [];
  });
  const fromFile = loadCaseFile().filter((c) => datasourceKeys.includes(c.datasource));
  return [...generated, ...fromFile];
}
