import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The run-scoped sink the shared marker helpers write to at the moment they
 * execute, and `global-teardown.ts` reads back after the whole run.
 *
 * Why a FILE and not a module-level Set: Playwright runs tests in worker
 * processes, so a Set here would hold one worker's view. Why it cannot be
 * satisfied by a stale file: it lives under `test-results/`, which Playwright
 * deletes before `globalSetup`, and `globalSetup` truncates it again.
 *
 * This module imports NOTHING from `@playwright/test`: it is loaded by the
 * teardown in the main process, where a hook registration would throw. The
 * `afterEach` that records which tests ran lives in `verdict-audit.ts`.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SINK = fileURLToPath(new URL('../test-results/marker-observations.ndjson', import.meta.url));

export interface Observation {
  readonly kind: 'ran' | 'asserted';
  readonly test: string;
  readonly spec: string;
  readonly attempt: number;
  readonly status?: string;
  readonly helper?: 'expectVerdict' | 'readClaim';
  readonly marker?: string;
}

export function specPath(file: string): string {
  return relative(ROOT, file).split('\\').join('/');
}

export function resetSink(): void {
  mkdirSync(dirname(SINK), { recursive: true });
  writeFileSync(SINK, '');
}

export function record(entry: Observation): void {
  mkdirSync(dirname(SINK), { recursive: true });
  appendFileSync(SINK, `${JSON.stringify(entry)}\n`);
}

export function readSink(): Observation[] | null {
  if (!existsSync(SINK)) return null;
  return readFileSync(SINK, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Observation);
}
