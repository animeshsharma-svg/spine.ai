import * as fs from 'fs';
import * as path from 'path';
import { ClientConfig, MasterFieldRegistry } from '../types';

const ROOT = path.resolve(__dirname, '..', '..');
export const MASTER_FIELDS_PATH = path.join(ROOT, 'config', 'master-fields.json');
export const CLIENTS_DIR = path.join(ROOT, 'config', 'clients');

export function loadMasterFields(): MasterFieldRegistry {
  if (!fs.existsSync(MASTER_FIELDS_PATH)) return {};
  return JSON.parse(fs.readFileSync(MASTER_FIELDS_PATH, 'utf-8'));
}

export function saveMasterFields(registry: MasterFieldRegistry): void {
  const sorted: MasterFieldRegistry = {};
  for (const datasourceKey of Object.keys(registry).sort()) {
    sorted[datasourceKey] = sortKeys(registry[datasourceKey]);
  }
  fs.writeFileSync(MASTER_FIELDS_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

export function listClientConfigPaths(): string[] {
  if (!fs.existsSync(CLIENTS_DIR)) return [];
  return fs
    .readdirSync(CLIENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(CLIENTS_DIR, f));
}

export function loadAllClientConfigs(): ClientConfig[] {
  return listClientConfigPaths().map((p) => JSON.parse(fs.readFileSync(p, 'utf-8')));
}

export function loadClientConfig(clientId: string): ClientConfig {
  const p = path.join(CLIENTS_DIR, `${clientId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No config found for client "${clientId}" at ${p}. Create it first — see config/clients/README.md.`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function saveClientConfig(config: ClientConfig): void {
  const p = path.join(CLIENTS_DIR, `${config.id}.json`);
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n');
}

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out as T;
}
