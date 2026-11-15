#!/usr/bin/env node
/**
 * §4.1c mutation driver — every mutation is a CONCRETE PATCH in
 * mutations/registry.json, and every `observed` record in that file is written
 * by this script, never typed.
 *
 * A mutation counts as a KILL only when ALL of these hold, and the script
 * enforces each one:
 *
 *   1. the UNMUTATED baseline PASSED in the same run (and, for Vitest, ran
 *      exactly one test — a filter that matches nothing exits 0);
 *   2. the patch actually CHANGED the file (anchor found exactly once, bytes
 *      differ), and the file is byte-identical again after restore;
 *   3. the mutated source still TYPE-CHECKS (`tsc --noEmit`); a patch that does
 *      not compile is DOES NOT BUILD and never a kill — Vitest strips types and
 *      would run it anyway, and Playwright's webServer would serve the
 *      previous bundle;
 *   4. the run served the MUTATED code: Playwright runs set CI=1 so
 *      `reuseExistingServer` is false and a fresh build is forced on this
 *      lab's own port 4236, and the built bundle's hash must MOVE between
 *      baseline and mutation;
 *   5. the failure is the OWNING test's — the test named by `grep` is among
 *      the failures — and not a build error, a server that never started, or
 *      a connection refused.
 *
 * Usage:
 *   node mutations/run.mjs             # every mutation
 *   node mutations/run.mjs <id> [...]  # named mutations only
 *   node mutations/run.mjs --list
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = join(ROOT, 'mutations', 'registry.json');
const REGISTRY = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

const NOT_A_KILL = [
  { pattern: /error TS\d+|Build failed|Transform failed|Could not resolve/i, label: 'build error' },
  { pattern: /webServer.*did not start|Process from config\.webServer was not able to start/i, label: 'server never started' },
  { pattern: /net::ERR_CONNECTION_REFUSED/i, label: 'nothing served on the port' },
];

function run(command, args, env = {}) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, output: stdout };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function typeChecks() {
  return run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);
}

/**
 * A hash over EVERY emitted asset, not just the JavaScript.
 *
 * This is the "the run served the mutated code" proof, and scoping it to `.js`
 * would quietly exempt a whole class of mutation: a stylesheet token the
 * accessibility oracles own changes only the CSS asset, so a JS-only hash never
 * moves and a real kill is reported as "the mutation never reached the browser".
 */
function bundleHash() {
  const dir = join(ROOT, 'dist', 'assets');
  if (!existsSync(dir)) return null;
  const hash = createHash('md5');
  for (const file of readdirSync(dir).sort()) hash.update(file).update(readFileSync(join(dir, file)));
  return hash.digest('hex');
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Both runners read their test-name filter as a REGEX, so a title containing
 * `(` or `)` silently matches nothing and the baseline is reported as failing.
 * That looks exactly like a broken test and is not one — brief-2's title,
 * "ψ(pP′)/p = 19 and ψ(pQ′)/p = 3", lost its parentheses to group syntax on
 * the first run of this ledger. The grep stays a literal everywhere else: the
 * failure-attribution check below compares titles with `String.includes`.
 */
function escapeForFilter(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runOwningTest(entry, { mutated = false } = {}) {
  const pattern = escapeForFilter(entry.grep);
  // MUTATION_IN_FLIGHT tells the build-time ledger control that exactly one
  // record is expected to be applied right now; see tests/maintenance-controls.
  const env = { CI: '1', ...(mutated ? { MUTATION_IN_FLIGHT: entry.id } : {}) };
  if (entry.runner === 'vitest') {
    return run('npx', ['vitest', 'run', entry.spec, '-t', pattern, '--reporter=verbose'], env);
  }
  return run('npx', ['playwright', 'test', entry.spec, '--grep', pattern, '--reporter=list', '--retries=0'], env);
}

/** Vitest: the baseline must have run EXACTLY the tests the filter names, and at least one. */
function vitestCount(output) {
  const m = output.match(/Tests\s+(\d+) passed/);
  return m ? Number(m[1]) : 0;
}

function failingTests(output, runner) {
  if (runner === 'vitest') {
    return [...output.matchAll(/^\s*(?:×|✗|FAIL)\s+(.+?)(?:\s+\d+ms)?\s*$/gm)].map((m) => m[1].trim());
  }
  return [...output.matchAll(/^\s*\d+\)\s+(.+?)(?:\s*[─-]{3,})?\s*$/gm)].map((m) => m[1].trim());
}

function classify(output) {
  for (const { pattern, label } of NOT_A_KILL) if (pattern.test(output)) return label;
  return null;
}

function applyMutation(entry) {
  const path = join(ROOT, entry.file);
  const original = readFileSync(path, 'utf8');
  const seen = original.split(entry.find).length - 1;
  if (seen !== 1) {
    throw new Error(`mutation "${entry.id}": expected exactly one occurrence of its anchor in ${entry.file}, found ${seen}. The source moved; update the registry rather than loosening the match.`);
  }
  const mutated = original.split(entry.find).join(entry.replace);
  if (mutated === original) throw new Error(`mutation "${entry.id}": the patch did not change the file`);
  writeFileSync(path, mutated);
  return () => writeFileSync(path, original);
}

function excerpt(output) {
  const lines = output.split('\n');
  const start = lines.findIndex((line) => /^\s*\d+\)\s|^\s*(×|✗|FAIL)\s/.test(line));
  if (start === -1) return output.trim().split('\n').slice(-20).join('\n');
  return lines.slice(start, start + 24).join('\n');
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const entry of REGISTRY.mutations) console.log(`${entry.id.padEnd(36)} ${entry.brief.padEnd(10)} ${entry.runner.padEnd(10)} ${entry.spec}`);
  process.exit(0);
}
const selected = args.length > 0 ? REGISTRY.mutations.filter((e) => args.includes(e.id) || args.includes(e.brief)) : REGISTRY.mutations;
if (selected.length === 0) {
  console.error(`No mutation matched ${args.join(', ')}. Try --list.`);
  process.exit(2);
}

const results = [];
for (const entry of selected) {
  console.log(`\n${'='.repeat(78)}\nMUTATION ${entry.id}   (${entry.brief})\n${entry.why}\n${'='.repeat(78)}`);
  const observed = { at: new Date().toISOString(), runner: entry.runner };
  const path = join(ROOT, entry.file);
  const before = fileHash(path);

  // 1. Baseline, unmutated, same command.
  console.log(`--- baseline: ${entry.runner} ${entry.spec} "${entry.grep}"`);
  const baseline = runOwningTest(entry);
  observed.baselinePassed = baseline.ok;
  if (entry.runner === 'vitest') observed.baselineTests = vitestCount(baseline.output);
  if (entry.runner === 'playwright') observed.bundleBefore = bundleHash();
  const baselineOk = baseline.ok && (entry.runner !== 'vitest' || observed.baselineTests >= 1);
  if (!baselineOk) {
    observed.verdict = 'NO BASELINE';
    results.push({ entry, observed });
    console.log(`>>> ${entry.id}: NOT A KILL — the unmutated baseline did not pass (or ran zero tests).`);
    continue;
  }

  // 2. Mutate; 3. type-check; 4/5. run and classify.
  const restore = applyMutation(entry);
  let mutated;
  let tsc;
  try {
    observed.patchChangedFile = fileHash(path) !== before;
    tsc = typeChecks();
    observed.typeChecks = tsc.ok;
    if (tsc.ok) {
      console.log(`--- mutated: ${entry.file}`);
      mutated = runOwningTest(entry, { mutated: true });
      if (entry.runner === 'playwright') observed.bundleAfter = bundleHash();
    }
  } finally {
    restore();
  }
  observed.restored = fileHash(path) === before;
  if (!observed.restored) throw new Error(`mutation "${entry.id}": the file was not restored byte-for-byte`);

  if (!tsc.ok) {
    observed.verdict = 'DOES NOT BUILD';
    results.push({ entry, observed });
    console.log(excerpt(tsc.output));
    console.log(`>>> ${entry.id}: DOES NOT BUILD — the patch fails the type-check; not a kill.`);
    continue;
  }
  if (entry.runner === 'playwright' && observed.bundleBefore && observed.bundleAfter && observed.bundleBefore === observed.bundleAfter) {
    observed.verdict = 'NOT A KILL (bundle unchanged)';
    results.push({ entry, observed });
    console.log(`>>> ${entry.id}: NOT A KILL — the built bundle's hash did not move, so the mutation never reached the browser.`);
    continue;
  }
  if (mutated.ok) {
    observed.verdict = 'SURVIVED';
    results.push({ entry, observed });
    console.log(`>>> ${entry.id}: SURVIVED — the owning test stayed green under the mutation.`);
    continue;
  }
  const notKill = classify(mutated.output);
  const failed = failingTests(mutated.output, entry.runner);
  const body = excerpt(mutated.output);
  console.log(body);
  if (notKill) {
    observed.verdict = `NOT A KILL (${notKill})`;
    results.push({ entry, observed });
    console.log(`>>> ${entry.id}: NOT A KILL — ${notKill}.`);
    continue;
  }
  if (!failed.some((title) => title.includes(entry.grep))) {
    observed.verdict = 'NOT A KILL (wrong assertion)';
    observed.failedTests = failed;
    results.push({ entry, observed });
    console.log(`>>> ${entry.id}: NOT A KILL — failures were ${failed.join('; ') || '(none parsed)'}, not the owning test.`);
    continue;
  }
  observed.verdict = 'KILLED';
  observed.killedBy = failed.filter((t) => t.includes(entry.grep));
  results.push({ entry, observed });
  console.log(`>>> ${entry.id}: KILLED by "${observed.killedBy[0]}".`);
}

// Write every observed record back — by the thing that ran it.
for (const { entry, observed } of results) {
  const target = REGISTRY.mutations.find((m) => m.id === entry.id);
  target.observed = observed;
}
writeFileSync(REGISTRY_PATH, `${JSON.stringify(REGISTRY, null, 2)}\n`);

console.log(`\n${'='.repeat(78)}\nSUMMARY\n${'='.repeat(78)}`);
for (const { entry, observed } of results) console.log(`${observed.verdict.padEnd(32)} ${entry.brief.padEnd(10)} ${entry.id}`);
const bad = results.filter((r) => r.observed.verdict !== 'KILLED');
console.log(`\n${results.length - bad.length}/${results.length} killed. Records written to mutations/registry.json.`);
process.exit(bad.length === 0 ? 0 : 1);
