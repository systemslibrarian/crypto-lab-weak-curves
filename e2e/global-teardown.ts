import type { FullConfig } from '@playwright/test';
import { recordNames, REGISTRY, type MutationRecord } from './mutation-registry';
import { readSink, SINK } from './observations';

/**
 * The coverage rule asks what RAN, not what the spec source says.
 *
 *  S1  The sink exists; a missing sink means every rule below is vacuous, so it fails.
 *  S2  For every Playwright mutation record whose killing test RAN AND PASSED
 *      in this run, that test executed the record's helper on the record's
 *      marker. A commented-out call leaves no line here.
 *  S3  On an UNFILTERED run of a spec file, every record naming that file ran
 *      at all — so deleting a killing test outright is loud, not silent.
 *
 * Scoping: mutations/run.mjs runs ONE test at a time with --grep, and the run
 * that matters is the one where that test FAILS. A rule demanding every record
 * on every invocation would fail every mutation run and be switched off.
 */

interface Ran {
  readonly test: string;
  readonly spec: string;
  readonly attempt: number;
  readonly status: string;
}

function isFiltered(config: FullConfig | undefined): boolean {
  const grep = config?.grep;
  const sources = Array.isArray(grep) ? grep.map((one) => one.source) : grep ? [grep.source] : [];
  if (sources.some((source) => source !== '.*' && source !== '')) return true;
  const argv = (config as { argv?: unknown } | undefined)?.argv;
  if (!Array.isArray(argv)) return false;
  const flags = ['-g', '--grep', '--grep-invert', '--gi', '--shard', '--last-failed', '--only-changed'];
  return argv
    .slice(2)
    .map(String)
    .some((arg) => flags.some((flag) => arg === flag || arg.startsWith(`${flag}=`)) || /:\d+$/.test(arg));
}

function describe(entry: MutationRecord): string {
  return `${entry.id} (marker "${entry.marker}", ${entry.spec} › "${entry.grep}")`;
}

export default async function globalTeardown(config?: FullConfig): Promise<void> {
  const observations = readSink();
  if (observations === null) {
    throw new Error(
      `runtime marker coverage: the observation sink ${SINK} does not exist, so nothing about this run was checked. ` +
        'globalSetup creates it; a config that no longer names it disables every rule in e2e/global-teardown.ts.',
    );
  }
  const ran: Ran[] = observations
    .filter((entry) => entry.kind === 'ran')
    .map((entry) => ({ test: entry.test, spec: entry.spec, attempt: entry.attempt ?? 0, status: entry.status ?? 'unknown' }));
  const asserted = observations.filter((entry) => entry.kind === 'asserted');
  const specsThatRan = new Set(ran.map((entry) => entry.spec));
  const filtered = isFiltered(config);
  const failures: string[] = [];

  for (const entry of REGISTRY.mutations) {
    // Records with no marker are judged by the runner alone: the accessibility
    // gate's own kill has no verdict marker to go through, and inventing one to
    // satisfy this rule would be the fake the rule exists to prevent.
    if (entry.runner !== 'playwright' || !entry.marker) continue;
    const matches = ran.filter((one) => recordNames(entry, one.spec, one.test));
    if (matches.length === 0) {
      if (!filtered && specsThatRan.has(entry.spec)) {
        failures.push(`${describe(entry)}: ${entry.spec} ran in full and no test whose title contains "${entry.grep}" ran with it.`);
      }
      continue;
    }
    const passed = matches.filter((one) => one.status === 'passed');
    if (passed.length === 0) continue;
    const helper = entry.helper ?? 'expectVerdict';
    for (const { test: title, attempt } of passed) {
      const calls = asserted.filter(
        (one) => one.test === title && one.spec === entry.spec && (one.attempt ?? 0) === attempt && one.marker === entry.marker && one.helper === helper,
      );
      if (calls.length === 0) {
        failures.push(
          `${describe(entry)}: "${title}" passed without ever executing ${helper}(page, '${entry.marker}'). ` +
            'Its recorded kill was validated by something that did not run.',
        );
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `runtime marker coverage failed for ${failures.length} recorded mutation(s):\n  - ${failures.join('\n  - ')}\n` +
        '\nThese are RUNTIME observations, not a scan of spec source.',
    );
  }
}
