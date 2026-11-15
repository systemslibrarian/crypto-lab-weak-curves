import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Repository-structure controls, run by `npm run build` so a drift fails the
 * build before anything ships. Each test names the fleet-standard rule it
 * enforces, so a failure says which rule rather than only which line.
 */
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const workflow = read('.github/workflows/deploy.yml');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const gitignore = read('.gitignore');
const registry = JSON.parse(read('mutations/registry.json'));

/**
 * Source text with comments removed.
 *
 * Every "this token must not appear" control below scans code, and the rule in
 * each case is about what the code DOES. Three of them failed on their own
 * documentation the first time they ran — a config whose comment says "never
 * the Vite default 4173", a module whose header says "No innerHTML anywhere".
 * Scanning raw text makes writing those true sentences a failure, and the way
 * that gets resolved under time pressure is by deleting the sentence. So the
 * comments come out first, in one place, for all of them.
 */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

test('the comment stripper removes comments and leaves code alone', () => {
  // The controls below are only as good as this, so it is measured rather than
  // assumed: a real occurrence still trips, a documented one does not.
  assert.match(code('const port = 4173;'), /4173/);
  assert.doesNotMatch(code('/* never use 4173 */\nconst port = 4236;'), /4173/);
  assert.doesNotMatch(code('// never use 4173\nconst port = 4236;'), /4173/);
  assert.match(code('el.innerHTML = value;'), /innerHTML/);
});

function job(name) {
  const pattern = '\\n  ' + name + ':\\n[\\s\\S]*?(?=\\n  [a-z][a-z0-9-]*:\\n|$)';
  const match = workflow.match(new RegExp(pattern));
  assert.ok(match, `missing ${name} job`);
  return match[0];
}

test('one workflow owns the pull-request gate and the Pages deployment (template §6)', () => {
  assert.equal(existsSync(new URL('.github/workflows/ci.yml', root)), false);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: pages-\$\{\{ github\.ref \}\}/);
});

test('the deploy job is gated on != pull_request, never == push (template §6.2)', () => {
  assert.match(job('deploy'), /if: github\.event_name != 'pull_request'/);
  assert.doesNotMatch(workflow, /event_name == 'push'/);
  assert.match(job('deploy'), /needs: \[build, browser-gate\]/);
});

test('only the deploy job can mint Pages credentials', () => {
  const header = workflow.slice(0, workflow.indexOf('\njobs:'));
  assert.match(header, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(header, /pages: write|id-token: write/);
  assert.doesNotMatch(job('build'), /pages: write|id-token: write/);
  assert.match(job('deploy'), /permissions:\n      contents: read\n      pages: write\n      id-token: write\n/);
});

test('every third-party action is pinned to an immutable commit', () => {
  const actions = [...workflow.matchAll(/^[ \t]*(?:-[ \t]+)?uses:[ \t]+([^@\s]+)@([^\s]+)/gm)];
  const present = workflow.match(/^[ \t]*(?:-[ \t]+)?uses:/gm) ?? [];
  assert.equal(actions.length, present.length);
  assert.ok(actions.length > 0);
  for (const [, action, reference] of actions) {
    assert.match(reference, /^[0-9a-f]{40}$/, `${action} is not commit-pinned`);
  }
});

test('pull requests run the WHOLE gate — unit suite, build, a11y AND claims — and assert the test counts (template §4.1e)', () => {
  const build = job('build');
  const browser = job('browser-gate');
  assert.match(build, /npm test 2>&1 \| tee vitest\.log/);
  assert.match(build, /run: npm run build/);
  assert.match(browser, /npm run test:e2e:all/);

  // Each test step must ASSERT ITS COUNT, not just its exit status: a runner
  // that collects no files exits 0. And each must run under bash — the browser
  // job's container shell is dash, where `set -o pipefail` aborts the step
  // before any test runs, which reads as a failing gate and is not one.
  for (const [name, step] of [['build', build], ['browser-gate', browser]]) {
    assert.match(step, /shell: bash/, `${name} must not rely on the default shell`);
    assert.match(step, /set -euo pipefail/, `${name} must fail on a failing pipe`);
    assert.match(step, /NO_COLOR: '1'/, `${name} reads a summary line, so it must ask for undecorated output`);
    assert.match(step, /sed -r 's\/\\x1B/, `${name} must strip ANSI before reading its summary line`);
    assert.match(step, /-ge 1/, `${name} must assert a non-zero test count`);
  }
  // The unit step compares the files COLLECTED against the files on disk, which
  // catches a glob that quietly stopped matching; the browser step asserts both
  // projects appear in the log.
  assert.match(build, /find src -name '\*\.test\.ts'/);
  assert.match(build, /test "\$\{collected:-0\}" = "\$\{on_disk\}"/);
  assert.match(browser, /grep -q '\\\[a11y\\\]'/);
  assert.match(browser, /grep -q '\\\[claims\\\]'/);
  assert.doesNotMatch(browser, /playwright install|--with-deps/);
  assert.match(build, /name: Upload Pages artifact\n\s+if: github\.event_name != 'pull_request'/);
  assert.match(job('dependabot-auto-merge'), /needs: \[build, browser-gate\]/);
  assert.equal(packageJson.scripts['test:e2e:all'], 'playwright test');
});

test('the browser image matches the locked Playwright version and is pinned by digest', () => {
  const version = packageLock.packages['node_modules/@playwright/test'].version;
  assert.equal(version, packageLock.packages['node_modules/playwright-core'].version);
  assert.match(job('browser-gate'), new RegExp(`image: mcr\\.microsoft\\.com/playwright:v${version.replace(/\./g, '\\.')}-noble@sha256:[0-9a-f]{64}`));
});

test('the auto-merge job has actions: write, fails closed, and dispatches the file this lab has (template §6.1, §6.2)', () => {
  const autoMerge = job('dependabot-auto-merge');
  assert.match(autoMerge, /permissions:\n\s+contents: write\n\s+pull-requests: write\n\s+actions: write/);
  assert.match(autoMerge, /set -eu/);
  assert.match(autoMerge, /exit 1/);
  assert.match(autoMerge, /gh workflow run deploy\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);
  assert.doesNotMatch(autoMerge, /gh workflow run[^\n]*(?:\|\||continue-on-error)/);
  assert.doesNotMatch(autoMerge, /gh pr view/);
  assert.ok(existsSync(new URL('.github/workflows/deploy.yml', root)));
  // The fleet's one wording for why the dispatch exists (tools/dispatch-comment-sync.js).
  assert.match(autoMerge, /A merge made with GITHUB_TOKEN raises no push event -- GitHub suppresses\n\s+# them so workflows cannot retrigger themselves -- so deploy would never run\n\s+# and the site would keep serving the previous build\. Ask for it explicitly;\n\s+# a workflow_dispatch through the API is not suppressed\. The dispatched run\n\s+# is the same gate-then-deploy pipeline, so a bad merge still ships nothing\./);
});

test('Dependabot groups minors and patches and leaves majors individual (template §6.1)', () => {
  const dependabot = read('.github/dependabot.yml');
  assert.match(dependabot, /npm-minor-and-patch:\n\s+patterns:\n\s+- "\*"\n\s+update-types:\n\s+- "minor"\n\s+- "patch"/);
  assert.match(dependabot, /github-actions:\n\s+patterns:\n\s+- "\*"/);
});

test('every job has an explicit timeout', () => {
  for (const name of ['build', 'browser-gate', 'deploy', 'dependabot-auto-merge']) {
    assert.match(job(name), /timeout-minutes: \d+/);
  }
});

test('a deployment carries and verifies exact source provenance', () => {
  assert.match(job('build'), /public\/deployment\.json/);
  assert.match(gitignore, /^public\/deployment\.json$/m);
  assert.match(job('deploy'), /deployment\.json\?sha=\$\{GITHUB_SHA\}/);
  assert.match(job('deploy'), /grep -Fq 'id="app"'/);
});

test('the Playwright port is this lab\'s own, strict, and the same in every slot (template §4.1)', () => {
  const config = code(read('playwright.config.ts'));
  const ports = [...config.matchAll(/localhost:(\d+)\//g)].map((m) => m[1]);
  assert.ok(ports.length >= 2, 'the config must name the port in both the baseURL and the webServer url');
  assert.ok(ports.every((p) => p === '4236'), `ports ${ports}`);
  assert.match(config, /--port 4236 --strictPort/);
  // Never the Vite default: a shared port means reuseExistingServer can scan
  // another lab's preview, or an unmutated checkout during a mutation check.
  assert.doesNotMatch(config, /4173/);
  assert.equal(registry.port, 4236);
});

test('the verifier imports nothing from the attack modules, and no attack module can reach a secret', () => {
  const verify = read('src/check/verify.ts');
  const imports = [...verify.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['../ec/curve']);
  for (const file of ['src/attack/smart.ts', 'src/attack/mov.ts', 'src/attack/pairing.ts', 'src/attack/bsgs.ts']) {
    assert.doesNotMatch(read(file), /from '\.\.\/check\/verify'/, `${file} must not import the verifier`);
    assert.doesNotMatch(read(file), /from '\.\.\/secret\//, `${file} must not import the secret module`);
  }
});

test('no HTML-string sink anywhere under src/ui (every node is built by the element helper)', () => {
  // Comments are stripped first, for the same reason the generator scan in
  // src/secret/random.test.ts strips them: the rule is about what the code
  // DOES, and a file that says in prose it uses no such sink must not thereby
  // become a failure — that is how a true comment gets deleted to go green.
  const sinks = /innerHTML|outerHTML|insertAdjacentHTML|document\.write/;
  const files = ['dom.ts', 'retire.ts', 'format.ts', 'store.ts', 'countPanel.ts', 'smartPanel.ts', 'findPanel.ts', 'movPanel.ts', 'weakPanel.ts', 'brokenPanel.ts'];
  for (const file of files) {
    assert.doesNotMatch(code(read(`src/ui/${file}`)), sinks, `${file} writes HTML as a string`);
  }
});

test('every mutation in the ledger is a concrete, currently applicable patch (template §4.1c)', () => {
  // `npm run build` runs this file, and mutations/run.mjs drives the build, so
  // this control is inside the loop it judges. MUTATION_IN_FLIGHT names the one
  // record being applied at this instant; everything else stays strict, and in
  // an ordinary run — CI included, which never mutates — the variable is absent
  // and EVERY record must be pristine. Without this the build fails under any
  // mutation, `vite build` never runs, and `vite preview` serves the previous
  // good bundle: the suite then passes green against unmutated code, which is
  // the exact false negative §4.1c exists to prevent.
  const inFlight = process.env.MUTATION_IN_FLIGHT ?? '';
  assert.ok(Array.isArray(registry.mutations) && registry.mutations.length >= 8);
  if (inFlight) {
    assert.ok(registry.mutations.some((m) => m.id === inFlight), `MUTATION_IN_FLIGHT names no record: ${inFlight}`);
  }
  const ids = new Set();
  for (const m of registry.mutations) {
    assert.ok(!ids.has(m.id), `duplicate mutation id ${m.id}`);
    ids.add(m.id);
    const source = read(m.file);
    const anchors = source.split(m.find).length - 1;
    const applied = source.split(m.replace).length - 1;
    assert.notEqual(m.find, m.replace, `${m.id}: the patch must change something`);
    if (inFlight === m.id) {
      // This is the one record mutations/run.mjs is applying right now. Its
      // patch is in the file and its anchor is not; the runner restores the
      // file immediately afterwards and verifies the restore byte-for-byte.
      assert.equal(applied, 1, `${m.id}: declared in flight but its replacement is not in ${m.file}`);
      assert.equal(anchors, 0, `${m.id}: declared in flight but its anchor is still in ${m.file}`);
    } else {
      // Every other record, and every record in any ordinary run, must be
      // pristine and applicable: the anchor present exactly once, the patch not
      // applied. This is what fails when the source moves under the registry.
      assert.equal(anchors, 1, `${m.id}: anchor must occur exactly once in ${m.file} (found ${anchors})`);
      assert.equal(applied, 0, `${m.id}: its replacement is already in ${m.file} — a mutation was left in the tree`);
    }
    assert.ok(existsSync(new URL(m.spec, root)), `${m.id}: spec ${m.spec} missing`);
    assert.ok(read(m.spec).includes(m.grep), `${m.id}: ${m.spec} names no test containing "${m.grep}"`);
    assert.ok(['vitest', 'playwright'].includes(m.runner));
    // A marker and the helper that reads it travel together: a record naming
    // one without the other is a rule e2e/global-teardown.ts cannot enforce.
    assert.equal(Boolean(m.marker), Boolean(m.helper), `${m.id}: marker and helper must both be present or both absent`);
    if (m.helper) assert.ok(['expectVerdict', 'readClaim'].includes(m.helper), `${m.id}: unknown helper ${m.helper}`);
  }
  const briefNumbers = registry.mutations.filter((m) => /^brief-[1-8]$/.test(m.brief)).map((m) => m.brief);
  assert.deepEqual([...new Set(briefNumbers)].sort(), ['brief-1', 'brief-2', 'brief-3', 'brief-4', 'brief-5', 'brief-6', 'brief-7', 'brief-8']);
});

test('the production build enforces these controls', () => {
  assert.equal(packageJson.scripts['test:maintenance'], 'node --test tests/maintenance-controls.node.mjs');
  assert.match(packageJson.scripts.build, /npm run test:maintenance/);
});

test('the auto-merge bump reader fails closed', async () => {
  const { bumpType } = await import('../.github/scripts/bump-type.mjs');
  assert.equal(bumpType({ title: 'Bump the npm group across 1 directory', body: 'no versions here' }), 'unknown');
  assert.equal(bumpType({ title: 'Bump x from 1.2.3 to 2.0.0', body: undefined }), 'unknown');
  assert.equal(bumpType({ title: 'Bump vitest from 5.0.5 to 5.1.0', body: 'b' }), 'non-major');
  assert.equal(bumpType({ title: 'Bump next from 15.5.27 to 16.4.2', body: 'b' }), 'major');
  assert.equal(bumpType({ title: 'Bump zod from 0.4.1 to 0.5.0', body: 'b' }), 'major');
});
