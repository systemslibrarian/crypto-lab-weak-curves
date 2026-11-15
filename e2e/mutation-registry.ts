import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * One reading of `mutations/registry.json`, shared by the teardown and the
 * claims suite so the record shape cannot drift between them.
 */
export interface MutationRecord {
  readonly id: string;
  readonly brief: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly runner: 'vitest' | 'playwright';
  readonly spec: string;
  readonly grep: string;
  /** Playwright records: the verdict or claim marker the killing test must go through the shared helper for. */
  readonly marker?: string;
  readonly helper?: 'expectVerdict' | 'readClaim';
  readonly why: string;
  readonly observed?: unknown;
}

export interface Registry {
  readonly port: number;
  readonly mutations: readonly MutationRecord[];
}

export const REGISTRY = JSON.parse(
  readFileSync(fileURLToPath(new URL('../mutations/registry.json', import.meta.url)), 'utf8'),
) as Registry;

export function recordNames(entry: MutationRecord, spec: string, title: string): boolean {
  return spec === entry.spec && title.includes(entry.grep);
}
